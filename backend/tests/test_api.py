"""
API 層測試 (main.app / src.api.routes)，使用 FastAPI TestClient。

main.py 在模組層級以「相對於目前工作目錄」的路徑建立 static/processed、
static/debug 並掛載 StaticFiles；為避免測試把產物寫進真正的 backend/static/，
所有測試都透過 isolated_static_cwd fixture 切換到獨立的暫存工作目錄，
並延遲到 fixture 內才 import main，確保模組層級的路徑操作發生在正確的 cwd 下。
"""

import cv2
import pytest

from conftest import make_synthetic_image

from src.core.params import MAX_FILE_SIZE

pytestmark = pytest.mark.usefixtures("isolated_static_cwd")

TEXT = "api happy path"


@pytest.fixture
def client(isolated_static_cwd):
    from fastapi.testclient import TestClient
    import main as main_module

    return TestClient(main_module.app)


def _encode_png(image) -> bytes:
    ok, encoded = cv2.imencode(".png", image)
    assert ok, "PNG 編碼失敗"
    return encoded.tobytes()


class TestEmbedValidation:
    def test_rejects_file_over_10mb(self, client):
        # 內容不需是合法圖像：檔案大小檢查發生在解碼之前。
        oversized = b"\x00" * (MAX_FILE_SIZE + 1)
        response = client.post(
            "/v1/embed",
            files={"file": ("huge.png", oversized, "image/png")},
            data={"text": TEXT},
        )
        assert response.status_code == 400
        body = response.json()
        assert body["error_code"] == "FILE_TOO_LARGE"

    def test_rejects_blank_text(self, client):
        # 注意：真正的空字串 "" 在 multipart/form-data 底層會被 Starlette/python-multipart
        # 解析為欄位缺失（None），連 FastAPI 的 Form(...) 必填驗證都過不了，
        # 回傳的是框架層的 422（而非路由自訂的 400 EMPTY_WATERMARK_TEXT，見 src 層問題清單）。
        # 這裡改用「僅含空白字元」的文字，確保真正命中路由裡 `text.strip() == ""` 的
        # 自訂驗證邏輯，驗證其回傳結構化的 400 EMPTY_WATERMARK_TEXT。
        image_bytes = _encode_png(make_synthetic_image(256, 256, seed=1))
        response = client.post(
            "/v1/embed",
            files={"file": ("image.png", image_bytes, "image/png")},
            data={"text": "   "},
        )
        assert response.status_code == 400
        body = response.json()
        assert body["error_code"] == "EMPTY_WATERMARK_TEXT"

    def test_rejects_missing_text_field(self, client):
        # 真正空字串會被底層 multipart 解析器當成欄位缺失，實際回傳 FastAPI 的
        # 422 Unprocessable Entity（而非路由自訂的 400），此測試記錄真實行為，
        # 避免誤以為 EMPTY_WATERMARK_TEXT 分支涵蓋了這個情境。
        image_bytes = _encode_png(make_synthetic_image(256, 256, seed=1))
        response = client.post(
            "/v1/embed",
            files={"file": ("image.png", image_bytes, "image/png")},
            data={"text": ""},
        )
        assert response.status_code == 422


class TestHappyPath:
    def test_embed_download_verify(self, client):
        image_bytes = _encode_png(make_synthetic_image(256, 256, seed=2))

        embed_response = client.post(
            "/v1/embed",
            files={"file": ("image.png", image_bytes, "image/png")},
            data={"text": TEXT},
        )
        assert embed_response.status_code == 200
        embed_data = embed_response.json()["data"]
        assert embed_data["psnr"] >= 38.0

        # 下載嵌入結果（驗證 StaticFiles 掛載與實際存檔路徑一致）。
        download_response = client.get(embed_data["image_url"])
        assert download_response.status_code == 200

        verify_response = client.post(
            "/v1/verify",
            files={"image": ("watermarked.png", download_response.content, "image/png")},
        )
        assert verify_response.status_code == 200
        verify_data = verify_response.json()["data"]
        assert verify_data["verified"] is True
        assert verify_data["watermark_text"] == TEXT

    def test_verify_clean_image_returns_false(self, client):
        image_bytes = _encode_png(make_synthetic_image(256, 256, seed=3))

        verify_response = client.post(
            "/v1/verify",
            files={"image": ("clean.png", image_bytes, "image/png")},
        )
        assert verify_response.status_code == 200
        verify_data = verify_response.json()["data"]
        assert verify_data["verified"] is False
        assert verify_data["watermark_text"] is None
