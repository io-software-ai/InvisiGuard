"""
Code review 修復的回歸測試（2026-07 審查後）。

涵蓋：
1. 空金鑰不得靜默退回公開 DEFAULT_KEY（安全性）。
2. processor 以型別化例外（FileTooLargeError / ImageTooLargeError）表達資源上限，
   而非哨兵字串 ValueError（避免「錯誤即字串」反模式）。
3. /extract 回應帶回對齊狀態 debug_info.status（供前端顯示）。
"""

import io

import cv2
import numpy as np
import pytest

from src.core.embedding import WatermarkEmbedder
from src.core.extraction import WatermarkExtractor
from src.core.exceptions import (
    WatermarkNotFoundError, FileTooLargeError, ImageTooLargeError,
)
from src.core.processor import ImageProcessor
from src.core import params


def _noise_image(size=256, seed=1):
    rng = np.random.default_rng(seed)
    return np.clip(rng.normal(128, 40, (size, size, 3)), 0, 255).astype(np.uint8)


class _FakeUpload:
    """最小化模擬 Starlette UploadFile：提供 size / filename / content_type 與 async read()。"""

    def __init__(self, data: bytes, size=None, filename="x.png", content_type="image/png"):
        self._data = data
        self.size = size
        self.filename = filename
        self.content_type = content_type

    async def read(self):
        return self._data


def _png_bytes(img: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


# --- 1. 空金鑰安全性 --------------------------------------------------------

class TestEmptyKeyNotDefault:
    def test_empty_key_watermark_unreadable_with_default_key(self):
        """
        key=b"" 曾因 `key or get_key()` 的 falsy 判斷靜默退回公開 DEFAULT_KEY，
        使空金鑰浮水印可被任何人（用預設金鑰）讀出。修復後應改用 `is None` 判斷：
        空金鑰被字面尊重，預設金鑰無法解讀。
        """
        img = _noise_image()
        wm = WatermarkEmbedder().embed(img, "secret", key=b"")
        with pytest.raises(WatermarkNotFoundError):
            WatermarkExtractor().extract(wm, search="phase")  # 預設金鑰

    def test_empty_key_roundtrips_with_same_empty_key(self):
        img = _noise_image()
        wm = WatermarkEmbedder().embed(img, "secret", key=b"")
        assert WatermarkExtractor().extract(wm, key=b"", search="phase").text == "secret"


# --- 2. 資源上限用型別化例外 -------------------------------------------------

class TestProcessorTypedLimits:
    async def test_declared_size_over_limit_raises_file_too_large(self):
        """size 已超限時，未讀入記憶體前就先擋（前置守門）。"""
        upload = _FakeUpload(b"", size=params.MAX_FILE_SIZE + 1)
        with pytest.raises(FileTooLargeError):
            await ImageProcessor.load_image(upload)

    async def test_actual_bytes_over_limit_raises_file_too_large(self):
        """size 為 None（未申報）時，實際位元組數仍須被後置守門攔下。"""
        big = b"\x00" * (params.MAX_FILE_SIZE + 1)
        upload = _FakeUpload(big, size=None)
        with pytest.raises(FileTooLargeError):
            await ImageProcessor.load_image(upload)

    async def test_too_many_pixels_raises_image_too_large(self, monkeypatch):
        """解碼後像素數超過上限時丟 ImageTooLargeError（用小閾值避免真的產生巨圖）。"""
        monkeypatch.setattr(params, "MAX_PIXELS", 100 * 100 - 1)
        data = _png_bytes(_noise_image(size=100))
        upload = _FakeUpload(data, size=len(data))
        with pytest.raises(ImageTooLargeError):
            await ImageProcessor.load_image(upload)

    async def test_valid_image_loads(self):
        data = _png_bytes(_noise_image(size=200))
        upload = _FakeUpload(data, size=len(data))
        img = await ImageProcessor.load_image(upload)
        assert img.shape == (200, 200, 3)


# --- 3. /extract 回傳對齊狀態 ------------------------------------------------

class TestExtractStatusPropagates:
    async def test_extract_response_carries_status(self, isolated_static_cwd):
        """
        service.extract 的 status（aligned / not_found）過去在 routes 被丟棄
        （debug_info=None），前端因而永遠顯示 Failed。修復後 API 回應的
        debug_info.status 應反映真實對齊狀態。
        """
        from fastapi.testclient import TestClient
        import main

        client = TestClient(main.app)
        img = _noise_image(size=256)
        wm = WatermarkEmbedder().embed(img, "hello")

        files = {
            "original_file": ("orig.png", _png_bytes(img), "image/png"),
            "suspect_file": ("susp.png", _png_bytes(wm), "image/png"),
        }
        resp = client.post("/v1/extract", files=files)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["is_match"] is True
        assert data["decoded_text"] == "hello"
        assert data["debug_info"] is not None
        # 盲提取優先：未幾何變形的浮水印圖直接命中 → "direct"；若需對齊則 "aligned"
        assert data["debug_info"]["status"] in ("direct", "aligned")
