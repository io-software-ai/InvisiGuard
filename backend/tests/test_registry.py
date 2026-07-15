"""
浮水印登錄表測試 (src.core.registry)。純 SQLite，不需模型，永遠執行。
"""

import os
import threading

import pytest

from src.core.registry import (
    WatermarkRegistry, id_to_bits, bits_to_id, ID_BITS, DEFAULT_DB_PATH,
)


@pytest.fixture
def registry(tmp_path):
    return WatermarkRegistry(str(tmp_path / "reg.sqlite3"))


class TestIdBitsRoundtrip:
    def test_zero_and_max(self):
        assert bits_to_id(id_to_bits(0)) == 0
        max_id = (1 << ID_BITS) - 1
        assert bits_to_id(id_to_bits(max_id)) == max_id

    def test_bits_length_is_exactly_id_bits(self):
        assert len(id_to_bits(12345)) == ID_BITS

    def test_out_of_range_rejected(self):
        with pytest.raises(ValueError):
            id_to_bits(1 << ID_BITS)  # 超過 61-bit
        with pytest.raises(ValueError):
            id_to_bits(-1)

    def test_bad_bitstring_rejected(self):
        with pytest.raises(ValueError):
            bits_to_id("0" * (ID_BITS - 1))   # 長度不符
        with pytest.raises(ValueError):
            bits_to_id("2" * ID_BITS)         # 非 0/1


class TestRegisterLookup:
    def test_register_then_lookup_ascii(self, registry):
        wid = registry.register("Copyright 2026 ACME", engine="trustmark")
        rec = registry.lookup(wid)
        assert rec is not None
        assert rec["text"] == "Copyright 2026 ACME"
        assert rec["engine"] == "trustmark"
        assert rec["id"] == wid

    def test_register_then_lookup_cjk(self, registry):
        wid = registry.register("深度學習軌 版權所有 ©2026")
        assert registry.lookup(wid)["text"] == "深度學習軌 版權所有 ©2026"

    def test_lookup_missing_returns_none(self, registry):
        wid = registry.register("x")
        # 找一個一定不存在的 id
        other = (wid + 1) % (1 << ID_BITS)
        # 極小機率 other 剛好也被註冊過；本測試只註冊了一筆，故 other 必不存在
        assert registry.lookup(other) is None

    def test_ids_are_within_range_and_unique(self, registry):
        ids = {registry.register(f"msg {i}") for i in range(50)}
        assert len(ids) == 50  # 無碰撞
        assert all(0 <= i < (1 << ID_BITS) for i in ids)

    def test_persistence_across_reopen(self, tmp_path):
        path = str(tmp_path / "persist.sqlite3")
        reg1 = WatermarkRegistry(path)
        wid = reg1.register("durable text")
        reg1.close()
        reg2 = WatermarkRegistry(path)
        assert reg2.lookup(wid)["text"] == "durable text"
        reg2.close()


class TestSecurity:
    def test_default_db_not_under_static(self):
        """
        回歸測試（審查發現的嚴重漏洞）：登錄表絕不可放在被 StaticFiles 對外服務的
        static/ 目錄下，否則任何人可 GET /static/registry.sqlite3 下載全部登錄文字。
        """
        norm = DEFAULT_DB_PATH.replace("\\", "/")
        assert not norm.startswith("static/"), f"DB 不可在 static/：{DEFAULT_DB_PATH}"
        assert os.path.basename(os.path.dirname(norm)) == "data"


class TestConcurrency:
    def test_concurrent_register_no_lost_or_duplicate(self, tmp_path):
        """
        深度學習軌把 CPU 工作丟執行緒池，register/lookup 會跨執行緒；共享連線需以鎖
        序列化，否則會遺失列或交易交錯。100 條並發註冊必須 0 遺失、0 重複、反查一致。
        """
        reg = WatermarkRegistry(str(tmp_path / "conc.sqlite3"))
        results = []
        lock = threading.Lock()

        def work(i):
            wid = reg.register(f"text {i}")
            with lock:
                results.append((wid, i))

        threads = [threading.Thread(target=work, args=(i,)) for i in range(100)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(results) == 100
        assert len({wid for wid, _ in results}) == 100  # 無重複 ID
        for wid, i in results:
            assert reg.lookup(wid)["text"] == f"text {i}"  # 反查一致
