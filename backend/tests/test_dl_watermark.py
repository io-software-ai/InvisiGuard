"""
深度學習軌測試 (src.core.dl_watermark + service 分派)。

需要 trustmark 套件與模型權重（首次會下載），故標記為 @pytest.mark.dl + slow，
且在 trustmark 不可用時整個模組 skip——經典軌的測試不受影響。

跑法：
    pytest tests/test_dl_watermark.py -m dl          # 只跑深度學習軌
    pytest -m "not slow"                             # 略過（CI 快速通道）
"""

import cv2
import numpy as np
import pytest

from conftest import make_synthetic_image
from src.core import dl_watermark
from src.core.registry import id_to_bits, bits_to_id, ID_BITS

pytestmark = [
    pytest.mark.dl,
    pytest.mark.slow,
    pytest.mark.skipif(not dl_watermark.is_available(), reason="trustmark 未安裝"),
]


@pytest.fixture(scope="module")
def engine():
    # 模型載入昂貴，整個模組共用單例
    return dl_watermark.get_engine()


def _jpeg(img, q):
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, q])
    assert ok
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


def _resize(img, scale):
    h, w = img.shape[:2]
    return cv2.resize(img, (int(w * scale), int(h * scale)))


class TestEngineRoundtrip:
    def test_id_roundtrip_clean(self, engine):
        img = make_synthetic_image(512, 512, seed=10, saturated_band=False)
        bits = id_to_bits(1234567890123456)  # < 2^61
        stego = engine.embed(img, bits)
        assert engine.extract(stego) == bits

    def test_extract_clean_image_returns_none(self, engine):
        """無浮水印的乾淨圖必須回 None（避免假陽性）。"""
        img = make_synthetic_image(512, 512, seed=11)
        assert engine.extract(img) is None

    def test_embed_rejects_wrong_bit_length(self, engine):
        img = make_synthetic_image(256, 256, seed=12)
        with pytest.raises(ValueError):
            engine.embed(img, "0" * (ID_BITS - 1))

    def test_all_zero_payload_can_fail_on_clean_image(self, engine):
        """
        回歸測試（skeptic 發現）：全 0 payload（id=0）的嵌入訊號偏弱，在部分乾淨
        影像上就無法還原（image-dependent，非普適）。只要「存在」會失敗的情況，就
        足以說明 register 排除 0 的必要——真正的普適防護是嵌入後自我檢查。
        掃多個 seed，至少一個 id=0 還原失敗即通過。
        """
        zeros = "0" * ID_BITS
        failed_any = False
        for seed in (40, 50, 51, 52, 53):
            img = make_synthetic_image(512, 512, seed=seed, saturated_band=False)
            if engine.extract(engine.embed(img, zeros)) != zeros:
                failed_any = True
                break
        assert failed_any, "id=0 在所測 seed 上皆可還原——與 skeptic 的觀察不符，請重查"

    def test_registry_never_issues_zero(self):
        """register 值域為 [1, 2^61-1]，永遠不會發出退化的 id=0。"""
        from src.core.registry import WatermarkRegistry
        import tempfile, os
        reg = WatermarkRegistry(os.path.join(tempfile.mkdtemp(), "z.sqlite3"))
        assert all(reg.register(f"m{i}") != 0 for i in range(200))


class TestRobustnessBeatsClassic:
    """
    深度學習軌的存在價值：在經典軌會失敗的攻擊（重度 JPEG、縮放）下仍能還原。
    這是「效果最好、最穩定」訴求的直接證據。
    """

    @pytest.fixture(scope="class")
    def stego_and_bits(self, engine):
        img = make_synthetic_image(512, 512, seed=20, saturated_band=False)
        bits = id_to_bits(998877665544332211 % (1 << ID_BITS))
        return engine.embed(img, bits), bits

    def test_survives_jpeg_q40(self, engine, stego_and_bits):
        stego, bits = stego_and_bits
        assert engine.extract(_jpeg(stego, 40)) == bits

    def test_survives_jpeg_q20(self, engine, stego_and_bits):
        stego, bits = stego_and_bits
        assert engine.extract(_jpeg(stego, 20)) == bits

    def test_survives_resize_half(self, engine, stego_and_bits):
        stego, bits = stego_and_bits
        assert engine.extract(_resize(stego, 0.5)) == bits


class TestServiceDispatch:
    """service 層 engine='trustmark' 端到端：embed 登錄 → verify 反查。"""

    async def test_embed_verify_via_registry(self, isolated_static_cwd):
        from src.services.watermark import WatermarkService

        svc = WatermarkService()
        img = make_synthetic_image(512, 512, seed=30)
        text = "深度學習軌整合測試 ©2026"

        embed_res = await svc.embed(img, text, engine="trustmark")
        assert embed_res["engine"] == "trustmark"
        assert embed_res["watermark_id"]  # 非空
        assert embed_res["psnr"] > 35

        # 讀回 stego，走 trustmark verify
        stego = cv2.imread(embed_res["image_url"].lstrip("/"))
        assert stego is not None
        verify_res = await svc.verify(stego, engine="trustmark")
        assert verify_res["verified"] is True
        assert verify_res["watermark_text"] == text
        assert verify_res["metadata"]["watermark_id"] == embed_res["watermark_id"]

    async def test_verify_clean_image_not_verified(self, isolated_static_cwd):
        from src.services.watermark import WatermarkService

        svc = WatermarkService()
        img = make_synthetic_image(512, 512, seed=31)
        res = await svc.verify(img, engine="trustmark")
        assert res["verified"] is False
        assert res["watermark_text"] is None

    async def test_embed_self_check_failure_raises_and_cleans_up(self, isolated_static_cwd, monkeypatch):
        """
        自我檢查回歸測試（skeptic 發現）：若嵌入後無法還原，embed 必須丟
        EmbedVerificationError 且不留下孤兒登錄列（假成功防護）。
        用假引擎（extract 永遠回不符）確定性觸發此路徑。
        """
        from src.services.watermark import WatermarkService
        from src.core import dl_watermark
        from src.core.exceptions import EmbedVerificationError

        class _FakeEngine:
            def embed(self, image, id_bits):
                return image  # 不真的嵌入
            def extract(self, image):
                return None   # 永遠還原失敗

        monkeypatch.setattr(dl_watermark, "is_available", lambda: True)
        monkeypatch.setattr(dl_watermark, "get_engine", lambda: _FakeEngine())

        svc = WatermarkService()
        before = _count_rows(svc)
        img = make_synthetic_image(512, 512, seed=33)
        with pytest.raises(EmbedVerificationError):
            await svc.embed(img, "should be rolled back", engine="trustmark")
        assert _count_rows(svc) == before  # 孤兒列已回收


def _count_rows(svc):
    cur = svc.registry._conn.execute("SELECT COUNT(*) FROM watermarks")
    return cur.fetchone()[0]

    async def test_survives_jpeg_via_service(self, isolated_static_cwd):
        """service 端到端：trustmark embed 後經 JPEG q30 仍能 verify 回原文。"""
        from src.services.watermark import WatermarkService

        svc = WatermarkService()
        img = make_synthetic_image(512, 512, seed=32, saturated_band=False)
        text = "social-media resilient mark"
        embed_res = await svc.embed(img, text, engine="trustmark")
        stego = cv2.imread(embed_res["image_url"].lstrip("/"))
        attacked = _jpeg(stego, 30)
        res = await svc.verify(attacked, engine="trustmark")
        assert res["verified"] is True
        assert res["watermark_text"] == text
