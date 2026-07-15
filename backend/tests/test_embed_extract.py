"""
嵌入/提取整合測試 (src.core.embedding + src.core.extraction)。

涵蓋：無攻擊往返、JPEG 壓縮存活、裁切存活（tile 對齊與非對齊兩種情境）、
錯誤金鑰／無浮水印乾淨圖的失敗行為（v1 假陽性回歸測試）、影像過小、PSNR 品質下限。
"""

import time

import cv2
import numpy as np
import pytest

from conftest import make_synthetic_image, compute_psnr

from src.core.embedding import WatermarkEmbedder
from src.core.extraction import WatermarkExtractor
from src.core.exceptions import ImageTooSmallError, WatermarkNotFoundError

TEXT_ASCII = "InvisiGuard roundtrip test 123"
TEXT_CJK = "浮水印測試"


@pytest.fixture
def embedder() -> WatermarkEmbedder:
    return WatermarkEmbedder()


@pytest.fixture
def extractor() -> WatermarkExtractor:
    return WatermarkExtractor()


# ---------------------------------------------------------------------------
# 無攻擊往返
# ---------------------------------------------------------------------------

class TestRoundtripNoAttack:
    def test_ascii(self, embedder, extractor, img_saturated_band):
        watermarked = embedder.embed(img_saturated_band, TEXT_ASCII)
        result = extractor.extract(watermarked, search="phase")
        assert result.text == TEXT_ASCII

    def test_cjk(self, embedder, extractor, img_gradient_noise):
        watermarked = embedder.embed(img_gradient_noise, TEXT_CJK)
        result = extractor.extract(watermarked, search="phase")
        assert result.text == TEXT_CJK

    def test_1024x768(self, embedder, extractor, img_1024x768):
        watermarked = embedder.embed(img_1024x768, TEXT_ASCII)
        result = extractor.extract(watermarked, search="phase")
        assert result.text == TEXT_ASCII


# ---------------------------------------------------------------------------
# JPEG 壓縮存活
# ---------------------------------------------------------------------------

class TestJpegSurvival:
    @pytest.mark.parametrize("quality", [90, 80, 70])
    def test_survives_jpeg_512(self, embedder, extractor, img_gradient_noise,
                                jpeg_roundtrip, quality):
        watermarked = embedder.embed(img_gradient_noise, TEXT_ASCII)
        attacked = jpeg_roundtrip(watermarked, quality)
        result = extractor.extract(attacked, search="phase")
        assert result.text == TEXT_ASCII

    @pytest.mark.parametrize("quality", [90, 80, 70])
    def test_survives_jpeg_1024x768(self, embedder, extractor, img_1024x768,
                                     jpeg_roundtrip, quality):
        watermarked = embedder.embed(img_1024x768, TEXT_ASCII)
        attacked = jpeg_roundtrip(watermarked, quality)
        result = extractor.extract(attacked, search="phase")
        assert result.text == TEXT_ASCII


# ---------------------------------------------------------------------------
# 裁切存活
# ---------------------------------------------------------------------------

class TestCropSurvival:
    def test_crop_bottom_right_25pct(self, embedder, extractor, img_512):
        watermarked = embedder.embed(img_512, TEXT_ASCII)
        h, w = watermarked.shape[:2]
        # 裁掉右方與下方各 25%，只保留左上 75% x 75%。
        cropped = watermarked[: int(h * 0.75), : int(w * 0.75)]
        result = extractor.extract(cropped, search="phase")
        assert result.text == TEXT_ASCII

    def test_crop_top_left_128px_tile_aligned(self, embedder, extractor, img_512):
        watermarked = embedder.embed(img_512, TEXT_ASCII)
        # 128px = TILE_COEFF(32) * PIXELS_PER_COEFF(4)：裁切量恰好對齊 tile 邊界，
        # 因此不需相位/原點搜尋也能命中 (dx=0, dy=0)，但依規格仍以 search="phase" 呼叫。
        cropped = watermarked[128:, 128:]
        result = extractor.extract(cropped, search="phase")
        assert result.text == TEXT_ASCII
        assert result.phase == (0, 0)

    @pytest.mark.slow
    def test_crop_13px_top_left_requires_full_search(self, embedder, extractor, img_512):
        watermarked = embedder.embed(img_512, TEXT_ASCII)
        # 13px 裁切不對齊 4px 像素格點也不對齊 tile 邊界，search="phase" 應無法命中，
        # 必須用 search="full" 同時搜尋像素相位與 tile 原點。
        cropped = watermarked[13:, 13:]

        with pytest.raises(WatermarkNotFoundError):
            extractor.extract(cropped, search="phase")

        start = time.time()
        result = extractor.extract(cropped, search="full")
        elapsed = time.time() - start
        assert result.text == TEXT_ASCII
        assert elapsed < 30.0, f"full 搜尋耗時過長：{elapsed:.2f}s"


# ---------------------------------------------------------------------------
# 失敗行為（金鑰 / 無浮水印乾淨圖 / 影像過小）
# ---------------------------------------------------------------------------

class TestFailureModes:
    def test_wrong_key_raises_not_found(self, embedder, extractor, img_512):
        watermarked = embedder.embed(img_512, TEXT_ASCII, key=b"correct-key")
        with pytest.raises(WatermarkNotFoundError):
            extractor.extract(watermarked, key=b"wrong-key", search="phase")

    def test_clean_image_raises_not_found(self, extractor, img_512):
        """
        v1 迴歸測試：v1 曾對「無浮水印的乾淨圖」誤判為 verify 成功（假陽性），
        因為錯誤處理以字串比對判斷成敗。v2 對乾淨圖必須確實丟出
        WatermarkNotFoundError，而不是回傳任何看似合法的文字。
        """
        with pytest.raises(WatermarkNotFoundError):
            extractor.extract(img_512, search="phase")

    def test_small_image_raises_image_too_small(self, embedder):
        tiny = make_synthetic_image(64, 64, seed=99)
        with pytest.raises(ImageTooSmallError):
            embedder.embed(tiny, "x")


# ---------------------------------------------------------------------------
# 影像品質（PSNR）
# ---------------------------------------------------------------------------

class TestImageQuality:
    def test_psnr_at_least_38(self, embedder, img_saturated_band):
        watermarked = embedder.embed(img_saturated_band, TEXT_ASCII)
        psnr = compute_psnr(img_saturated_band, watermarked)
        assert psnr >= 38.0, f"PSNR 過低：{psnr:.2f} dB"
