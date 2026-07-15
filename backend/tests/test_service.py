"""
Service 層測試 (src.services.watermark.WatermarkService)。

這裡的核心目標是 v1 最嚴重的兩個 bug 的回歸測試：
1. verify() 對「無浮水印的乾淨圖」必須回傳 verified=False / watermark_text=None /
   confidence=0.0，而不是任何看似合法的假陽性結果。
2. PSNR 計算不得有 uint8 迴繞（相減前必須轉 float64），否則極端反差的兩張圖
   會被誤判為「幾乎相同」（PSNR=100）。

另外涵蓋 extract() 的 is_match 判斷：suspect 是否真的帶有浮水印。
"""

import pytest

from src.services.watermark import WatermarkService

pytestmark = pytest.mark.usefixtures("isolated_static_cwd")

TEXT = "service layer test"


@pytest.fixture
def service() -> WatermarkService:
    return WatermarkService()


class TestVerify:
    async def test_verify_clean_image_returns_not_verified(self, service, img_512):
        """
        v1 迴歸測試：v1 曾對乾淨圖誤判 verify 成功。v2 必須明確回傳
        verified=False / watermark_text=None / confidence=0.0。
        """
        result = await service.verify(img_512)
        assert result["verified"] is False
        assert result["watermark_text"] is None
        assert result["confidence"] == 0.0

    async def test_verify_watermarked_image_returns_verified(self, service, img_512):
        embed_result = await service.embed(img_512, TEXT)
        assert embed_result["psnr"] >= 38.0

        watermarked = _load_result_image(embed_result["image_url"])
        result = await service.verify(watermarked)
        assert result["verified"] is True
        assert result["watermark_text"] == TEXT
        assert result["confidence"] > 0.0


class TestExtractIsMatch:
    async def test_is_match_true_for_watermarked_suspect(self, service, img_512):
        embed_result = await service.embed(img_512, TEXT)
        watermarked = _load_result_image(embed_result["image_url"])

        result = await service.extract(img_512, watermarked)
        assert result["is_match"] is True
        assert result["extracted_text"] == TEXT
        # 未幾何變形 → 盲提取優先直接命中，略過昂貴的 ORB 對齊（延遲優化的實證）
        assert result["status"] == "direct"

    async def test_is_match_false_for_clean_suspect(self, service, img_512):
        result = await service.extract(img_512, img_512)
        assert result["is_match"] is False
        assert result["extracted_text"] is None


class TestPsnrNoUint8Wraparound:
    def test_psnr_black_vs_white_is_near_zero_not_100(self, service, img_512):
        import numpy as np

        black = np.zeros_like(img_512)
        white = np.full_like(img_512, 255)

        psnr = service._calculate_psnr(black, white)
        # 若相減前未轉 float64，uint8 減法會在 0/255 邊界模 256 迴繞，
        # 導致誤判為「幾乎相同」而回傳 100.0。正確結果應接近 0（MSE = 255^2）。
        assert psnr < 1.0
        assert psnr != 100.0


def _load_result_image(image_url: str):
    """把 service.embed() 回傳的 `/static/processed/xxx.png` URL 轉回本機路徑並讀取。"""
    import cv2

    local_path = image_url.lstrip("/")  # "static/processed/xxx.png"
    image = cv2.imread(local_path)
    assert image is not None, f"無法讀回 embed 產物：{local_path}"
    return image
