"""
穩健性證書測試 (src.services.watermark.certify + /embed?certify)。

核心主張：證書必須誠實反映兩軌互補的失效模式——
- classic 抗裁切、但敗於 JPEG 重壓 / 縮放；
- trustmark 抗 JPEG / 縮放、但敗於裁切。
若證書把兩軌報成一樣，就失去差異化意義，故以「差異」作為回歸斷言。

需要 trustmark 的案例標 @pytest.mark.dl，未安裝時自動 skip；純結構/classic 測試永遠執行。
"""

import cv2
import numpy as np
import pytest

from conftest import make_synthetic_image
from src.core import dl_watermark
from src.core import attacks
from src.services.watermark import WatermarkService

pytestmark = pytest.mark.usefixtures("isolated_static_cwd")


@pytest.fixture
def service():
    return WatermarkService()


def _by_key(report):
    return {a["key"]: a["survived"] for a in report["attacks"]}


class TestCertificateStructure:
    async def test_shape_and_categories(self, service, img_512):
        res = await service.embed(img_512, "Copyright 2026", engine="classic", certify=True)
        rob = res["robustness"]
        assert rob["total"] == len(attacks.certificate_suite())
        assert rob["survived"] == sum(1 for a in rob["attacks"] if a["survived"])
        assert 0.0 <= rob["score"] <= 1.0
        # 每個攻擊都有 key/category/label/survived
        for a in rob["attacks"]:
            assert set(a) >= {"key", "category", "label", "survived"}
            assert isinstance(a["survived"], bool)
        # 分類燈號涵蓋所有攻擊的分類
        assert set(rob["categories"]) == {a["category"] for a in rob["attacks"]}
        assert all(v in ("high", "mid", "low") for v in rob["categories"].values())

    async def test_default_embed_has_no_certificate(self, service, img_512):
        """未要求 certify 時不應跑攻擊電池（省時），robustness 為 None。"""
        res = await service.embed(img_512, "hi", engine="classic")
        assert res.get("robustness") is None

    async def test_unexpected_extraction_error_propagates(self, service, img_512, monkeypatch):
        """
        回歸測試（skeptic C3）：證書提取路徑若發生非預期例外（程式回歸），必須上拋，
        不得被靜默吞成 survived=False / score=0——否則既掩蓋 bug 又對用戶謊報零穩健性。
        """
        def boom(*a, **k):
            raise TypeError("simulated regression in extractor")

        monkeypatch.setattr(service.extractor, "extract", boom)
        with pytest.raises(TypeError):
            await service.embed(img_512, "Copyright 2026", engine="classic", certify=True)


class TestClassicCertificateHonest:
    async def test_classic_survives_crop_fails_jpeg(self, service, img_512):
        res = await service.embed(img_512, "Copyright 2026", engine="classic", certify=True)
        surv = _by_key(res["robustness"])
        # classic 的招牌：抗裁切
        assert surv["crop_25"] is True
        # classic 的已知弱點：JPEG 重壓、縮放
        assert surv["jpeg_q30"] is False
        assert surv["resize_50"] is False


@pytest.mark.dl
@pytest.mark.slow
@pytest.mark.skipif(not dl_watermark.is_available(), reason="trustmark 未安裝")
class TestTrustmarkCertificateHonest:
    async def test_trustmark_survives_jpeg_fails_crop(self, service, img_512):
        res = await service.embed(img_512, "Copyright 2026", engine="trustmark", certify=True)
        surv = _by_key(res["robustness"])
        # trustmark 的招牌：抗 JPEG 重壓、縮放
        assert surv["jpeg_q30"] is True
        assert surv["resize_50"] is True
        # trustmark 的已知弱點：裁切
        assert surv["crop_25"] is False

    async def test_two_engines_are_complementary(self, service, img_512):
        """差異化的實證：同一張圖，兩軌在 JPEG 與裁切上結論相反。"""
        c = _by_key((await service.embed(img_512, "x", engine="classic", certify=True))["robustness"])
        t = _by_key((await service.embed(img_512, "x", engine="trustmark", certify=True))["robustness"])
        assert c["crop_25"] != t["crop_25"]      # classic 存活裁切、trustmark 失效
        assert c["jpeg_q30"] != t["jpeg_q30"]    # classic 失效 JPEG、trustmark 存活


class TestCertificateApi:
    def test_embed_certify_returns_robustness(self, isolated_static_cwd):
        from fastapi.testclient import TestClient
        import main

        client = TestClient(main.app)
        img = make_synthetic_image(384, 384, seed=9)
        ok, png = cv2.imencode(".png", img)
        resp = client.post(
            "/v1/embed",
            files={"file": ("a.png", png.tobytes(), "image/png")},
            data={"text": "api cert", "engine": "classic", "certify": "true"},
        )
        assert resp.status_code == 200
        rob = resp.json()["data"]["robustness"]
        assert rob is not None
        assert rob["total"] == len(attacks.certificate_suite())
        assert "crop_25" in {a["key"] for a in rob["attacks"]}
