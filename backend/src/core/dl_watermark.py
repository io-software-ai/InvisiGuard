"""
深度學習浮水印引擎（Adobe TrustMark 包裝）。

TrustMark 是端到端訓練的隱形浮水印，對 JPEG 重壓縮與縮放特別穩健（社群平台重新
編碼的場景），恰好補上經典 DWT-QIM 軌最弱的一環。作為代價，它的 payload 只有
61 bit（故搭配 registry 存完整文字），且對大幅裁切 / 旋轉不穩健。

實作要點：
- 懶載入：模型與權重在「首次實際使用」時才載入／下載，import 本模組不觸發任何下載，
  也不讓「未安裝 trustmark」拖垮經典軌（is_available() 供上層判斷）。
- 裝置自適應：有 CUDA 就用 GPU，否則 CPU（CPU 每次 encode/decode 約 0.1s）。
- 單例：模型載入昂貴（約數十秒），程序生命週期內只載入一次。
- BGR ↔ PIL RGB 轉換封裝在內；對外只吃／吐 numpy BGR（與 OpenCV 管線一致）。
"""

import threading
from typing import Optional

import cv2
import numpy as np

from src.core.registry import ID_BITS

# TrustMark 設定常數（實測鎖定，見 tests / README）
MODEL_TYPE = "Q"          # Q 變體：品質與穩健度平衡
ENCODING_TYPE = 1         # BCH_5：可用 binary payload 為 61 bit
PAYLOAD_BITS = ID_BITS    # binary 模式必須剛好等於此位元數（與 registry 單一來源）

_engine_lock = threading.Lock()
_engine_singleton: Optional["TrustMarkEngine"] = None


def is_available() -> bool:
    """trustmark 套件是否可 import（未安裝時經典軌仍可運作）。"""
    try:
        import trustmark  # noqa: F401
        return True
    except Exception:
        return False


def get_engine() -> "TrustMarkEngine":
    """取得單例引擎（首次呼叫才載入模型）。"""
    global _engine_singleton
    with _engine_lock:
        if _engine_singleton is None:
            _engine_singleton = TrustMarkEngine()
        return _engine_singleton


class TrustMarkEngine:
    """TrustMark encode/decode 的薄封裝。"""

    def __init__(self):
        try:
            import torch
            from trustmark import TrustMark
        except Exception as e:  # pragma: no cover - 取決於環境
            raise RuntimeError(
                "深度學習軌需要 trustmark 套件，請先安裝 requirements-dl.txt"
            ) from e

        device = "cuda" if torch.cuda.is_available() else "cpu"
        # 只載入 encode/decode 需要的部分；跳過 remover / bbox detector 以省下載與記憶體。
        self.model = TrustMark(
            verbose=False,
            model_type=MODEL_TYPE,
            encoding_type=ENCODING_TYPE,
            device=device,
            loadRemover=False,
            loadBBoxDetector=False,
        )
        self.device = device

    @staticmethod
    def _bgr_to_pil(image_bgr: np.ndarray):
        from PIL import Image
        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        return Image.fromarray(rgb)

    @staticmethod
    def _pil_to_bgr(pil_img) -> np.ndarray:
        rgb = np.array(pil_img.convert("RGB"))
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)

    def embed(self, image_bgr: np.ndarray, id_bits: str) -> np.ndarray:
        """
        將 61-bit ID 位元字串嵌入影像，回傳 BGR uint8。
        id_bits 必須是長度 61 的 '0'/'1' 字串。
        """
        if len(id_bits) != PAYLOAD_BITS or any(c not in "01" for c in id_bits):
            raise ValueError(f"id_bits 必須是長度 {PAYLOAD_BITS} 的 0/1 字串")
        stego_pil = self.model.encode(self._bgr_to_pil(image_bgr), id_bits, MODE="binary")
        return self._pil_to_bgr(stego_pil)

    def extract(self, image_bgr: np.ndarray) -> Optional[str]:
        """
        嘗試從影像還原 61-bit ID 位元字串；未偵測到浮水印時回傳 None。
        """
        secret, present, _schema = self.model.decode(
            self._bgr_to_pil(image_bgr), MODE="binary"
        )
        if not present or not secret or len(secret) != PAYLOAD_BITS:
            return None
        return secret
