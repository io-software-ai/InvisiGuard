"""
浮水印登錄表 (watermark registry)。

深度學習軌（TrustMark）的 payload 只有 61 bit，塞不下完整文字，因此只在影像中
嵌入一個短 ID，完整文字與中繼資料存在伺服器端的 SQLite 登錄表；驗證時以還原出的
ID 反查文字。這是業界主流做法（把機密／長內容留在伺服器，影像只帶指標）。

ID 為 61-bit 整數（= TrustMark 的 binary payload 位元數），存進 SQLite 的 64-bit
INTEGER 欄位（61 < 63，帶符號亦安全）。ID↔位元字串轉換函式一併提供，供 DL 引擎使用。
"""

import os
import sqlite3
import secrets
import threading
from datetime import datetime, timezone
from typing import Optional

# TrustMark 的可用 binary payload 位元數（實測鎖定：必須剛好等於此值）。
# dl_watermark.PAYLOAD_BITS 直接 import 此值，確保單一來源。
ID_BITS = 61

# 重要：登錄表存放於 data/（不對外服務）而非 static/。static/ 由 FastAPI 以
# StaticFiles 對外掛載，若把 DB 放在該處，任何人可直接 GET /static/registry.sqlite3
# 下載全部登錄文字——會摧毀「短 ID + 伺服器反查」的整套安全前提。
DEFAULT_DB_PATH = os.path.join("data", "registry.sqlite3")


def id_to_bits(watermark_id: int) -> str:
    """把 61-bit 整數轉為固定長度 61 的 '0'/'1' 字串（MSB first）。"""
    if not (0 <= watermark_id < (1 << ID_BITS)):
        raise ValueError(f"watermark_id 超出 {ID_BITS}-bit 範圍: {watermark_id}")
    return format(watermark_id, f"0{ID_BITS}b")


def bits_to_id(bits: str) -> int:
    """把 61 位元 '0'/'1' 字串轉回整數。"""
    if len(bits) != ID_BITS or any(c not in "01" for c in bits):
        raise ValueError(f"位元字串必須是長度 {ID_BITS} 的 0/1 字串，得到: {bits!r}")
    return int(bits, 2)


class WatermarkRegistry:
    """ID→文字 的持久化登錄表（SQLite，執行緒安全連線）。"""

    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        parent = os.path.dirname(db_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        # check_same_thread=False 允許跨執行緒共用連線（深度學習軌把 CPU 工作丟
        # 執行緒池，故 register/lookup 可能來自不同執行緒）。單一共享連線在多執行緒
        # 下的 INSERT+commit 非原子，故以 self._lock 序列化所有存取，避免交易交錯或
        # "database is locked"。
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL;")
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS watermarks (
                id         INTEGER PRIMARY KEY,
                text       TEXT NOT NULL,
                engine     TEXT NOT NULL DEFAULT 'trustmark',
                created_at TEXT NOT NULL
            )
            """
        )
        self._conn.commit()

    def register(self, text: str, engine: str = "trustmark") -> int:
        """
        產生一個未使用的 61-bit 隨機 ID，寫入 (id, text, engine)，回傳該 ID。
        以隨機 ID 避免可列舉；碰撞時重試。
        """
        with self._lock:
            for _ in range(8):
                # 值域 [1, 2^61-1]，刻意排除 0：全 0 payload 在 TrustMark 上會產生
                # 退化（過弱）的嵌入訊號，連乾淨影像都無法還原（見 test_dl_watermark
                # 的 id=0 回歸測試）。
                watermark_id = secrets.randbelow((1 << ID_BITS) - 1) + 1
                try:
                    self._conn.execute(
                        "INSERT INTO watermarks (id, text, engine, created_at) VALUES (?, ?, ?, ?)",
                        (watermark_id, text, engine, datetime.now(timezone.utc).isoformat()),
                    )
                    self._conn.commit()
                    return watermark_id
                except sqlite3.IntegrityError:
                    continue  # 極罕見的 ID 碰撞，換一個重試
        raise RuntimeError("無法產生未使用的 watermark ID（重試多次後仍碰撞）")

    def lookup(self, watermark_id: int) -> Optional[dict]:
        """以 ID 反查記錄；找不到回傳 None。"""
        with self._lock:
            cur = self._conn.execute(
                "SELECT id, text, engine, created_at FROM watermarks WHERE id = ?",
                (watermark_id,),
            )
            row = cur.fetchone()
        if row is None:
            return None
        return {"id": row[0], "text": row[1], "engine": row[2], "created_at": row[3]}

    def delete(self, watermark_id: int) -> None:
        """刪除一列（供嵌入後自我檢查失敗時回收，避免留下孤兒 ID→text 列）。"""
        with self._lock:
            self._conn.execute("DELETE FROM watermarks WHERE id = ?", (watermark_id,))
            self._conn.commit()

    def close(self):
        self._conn.close()
