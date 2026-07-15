import asyncio
import os
import uuid

import numpy as np

from src.core import attacks, dl_watermark, registry as registry_mod
from src.core.embedding import WatermarkEmbedder
from src.core.exceptions import (
    EmbedVerificationError, EngineUnavailableError, ImageTooSmallError,
    WatermarkNotFoundError,
)
from src.core.params import get_key
from src.core.extraction import WatermarkExtractor
from src.core.geometry import GeometryProcessor
from src.core.metrics import compute_psnr, compute_ssim
from src.core.processor import ImageProcessor
from src.core.visualization import generate_signal_heatmap
from src.utils.logger import get_logger

logger = get_logger(__name__)

CLASSIC = "classic"
TRUSTMARK = "trustmark"
VALID_ENGINES = (CLASSIC, TRUSTMARK)


class WatermarkService:
    def __init__(self):
        self.embedder = WatermarkEmbedder()
        self.extractor = WatermarkExtractor()
        self.geometry = GeometryProcessor()
        self.processor = ImageProcessor()
        # 登錄表僅深度學習軌需要；建構便宜（只開 SQLite），故一律初始化。
        self.registry = registry_mod.WatermarkRegistry()

    # ------------------------------------------------------------------
    # Embed
    # ------------------------------------------------------------------
    async def embed(self, image: np.ndarray, text: str, key: bytes = None,
                    engine: str = CLASSIC, certify: bool = False) -> dict:
        """
        協調嵌入流程並依 engine 分派：
        - classic：DWT2 + DM-QIM，可嵌入至多 92 bytes 文字（抗裁切、免 GPU）。
        - trustmark：深度學習軌，只在影像嵌入 61-bit ID，完整文字存登錄表
          （抗 JPEG 重壓縮 / 縮放）。

        certify=True 時，額外對剛嵌入的影像跑一輪真實攻擊電池，回傳實測穩健性證書。

        Raises:
            MessageTooLongError / ImageTooSmallError: 經典軌輸入不合法。
            EngineUnavailableError: 深度學習軌未安裝。
        """
        if engine == TRUSTMARK:
            return await self._embed_trustmark(image, text, certify=certify)
        return await self._embed_classic(image, text, key=key, certify=certify)

    async def _embed_classic(self, image: np.ndarray, text: str, key: bytes = None,
                             certify: bool = False) -> dict:
        # 一次解析金鑰，讓嵌入與證書提取共用同一把（避免兩端各自從可變環境變數
        # 重解、在 await 期間 WATERMARK_KEY 若被改動而不一致）。
        key = key if key is not None else get_key()
        watermarked_image = self.embedder.embed(image, text, key=key)
        signal_map = generate_signal_heatmap(image, watermarked_image)
        psnr = compute_psnr(image, watermarked_image)
        ssim = compute_ssim(image, watermarked_image)
        result = self._save_outputs(watermarked_image, signal_map, psnr, ssim)
        result["engine"] = CLASSIC
        if certify:
            # classic 的「真值」是嵌入的文字本身；攻擊後重新提取比對是否還原出同一段文字。
            result["robustness"] = await self.certify(watermarked_image, CLASSIC, text, key=key)
        return result

    async def _embed_trustmark(self, image: np.ndarray, text: str, certify: bool = False) -> dict:
        # 模型載入（首次約數十秒）與推論皆為同步 CPU 運算；放到執行緒池，
        # 避免阻塞 FastAPI 的事件迴圈拖垮其他請求（含 classic 與 /health）。
        engine = await asyncio.to_thread(self._require_trustmark)
        # 1. 登錄文字取得短 ID，轉成 61-bit 位元字串
        watermark_id = self.registry.register(text, engine=TRUSTMARK)
        id_bits = registry_mod.id_to_bits(watermark_id)
        # 2. 以深度學習模型把 ID 嵌入影像
        watermarked_image = await asyncio.to_thread(engine.embed, image, id_bits)

        # 3. 嵌入後自我檢查：立即對剛嵌入的乾淨影像提取，確認可還原。
        #    這能擋掉「回報成功但永遠驗證不出」的假成功（退化 payload、過度平坦的
        #    影像、或模型對此內容嵌入訊號過弱）。失敗則回收登錄列並丟出明確錯誤。
        recovered = await asyncio.to_thread(engine.extract, watermarked_image)
        if recovered != id_bits:
            self.registry.delete(watermark_id)
            raise EmbedVerificationError(
                "嵌入後自我檢查失敗：無法從剛嵌入的影像還原浮水印"
                "（影像可能過於平坦，請改用紋理較豐富的影像或改用 classic 引擎）"
            )

        signal_map = generate_signal_heatmap(image, watermarked_image)
        psnr = compute_psnr(image, watermarked_image)
        ssim = compute_ssim(image, watermarked_image)
        result = self._save_outputs(watermarked_image, signal_map, psnr, ssim)
        result["engine"] = TRUSTMARK
        result["watermark_id"] = str(watermark_id)
        if certify:
            # trustmark 的「真值」是 61-bit ID 位元字串；攻擊後重新提取比對 ID 是否一致。
            result["robustness"] = await self.certify(watermarked_image, TRUSTMARK, id_bits)
        return result

    # ------------------------------------------------------------------
    # 穩健性證書（Robustness Certificate）
    # ------------------------------------------------------------------
    async def certify(self, watermarked: np.ndarray, engine: str, truth,
                      key: bytes = None) -> dict:
        """
        對剛嵌入的影像實跑一輪攻擊電池，回傳每種攻擊下浮水印是否仍能還原的實測結果。

        這是產品的差異化核心：把「這個浮水印在被壓縮 / 縮放 / 裁切 / 旋轉後還在不在」
        變成用戶當場看得到的實測證據，而非白皮書宣稱。注意：擴散模型重繪不在此電池內
        （屬全行業未解的天花板），故不宣稱「不可破」。
        """
        results = []
        for item in attacks.certificate_suite():
            try:
                attacked = item["fn"](watermarked)
            except Exception:
                # 攻擊本身失敗（極少見）視為該攻擊不適用
                survived = False
            else:
                survived = await self._survives_attack(attacked, engine, truth, key)
            results.append({
                "key": item["key"],
                "category": item["category"],
                "label": item["label"],
                "survived": survived,
            })

        survived_n = sum(1 for r in results if r["survived"])
        # 依使用者導向分類聚合成燈號：該類全存活=high、部分=mid、全失效=low
        cats = {}
        for r in results:
            cats.setdefault(r["category"], []).append(r["survived"])
        category_status = {
            c: ("high" if all(v) else "mid" if any(v) else "low")
            for c, v in cats.items()
        }
        return {
            "engine": engine,
            "attacks": results,
            "survived": survived_n,
            "total": len(results),
            "score": round(survived_n / len(results), 2) if results else 0.0,
            "categories": category_status,
            "note": "實測：對剛嵌入的影像實際套用攻擊後，以「盲偵測」（無原圖）重新提取。"
                    "此為穩健性下界——若持有原圖，附原圖提取可藉幾何對齊救回部分情況"
                    "（如旋轉）。未涵蓋擴散模型重繪（會使多數後嵌浮水印失效，屬全行業"
                    "未解的天花板），故不宣稱「不可破」。",
            "method": "blind",
        }

    async def _survives_attack(self, attacked: np.ndarray, engine: str, truth,
                               key: bytes = None) -> bool:
        """
        對受攻擊影像嘗試盲提取，判斷是否仍還原出原始真值。

        只把「預期中的提取失敗」（WatermarkNotFoundError / ImageTooSmallError）視為
        未存活；其餘例外（程式回歸如 TypeError）任其上拋——否則真正的 bug 會被靜默
        報成「浮水印在所有攻擊下失效」，既掩蓋回歸又對用戶謊報零穩健性。
        """
        try:
            if engine == TRUSTMARK:
                eng = await asyncio.to_thread(self._require_trustmark)
                got = await asyncio.to_thread(eng.extract, attacked)
                return got == truth
            result = await asyncio.to_thread(
                self.extractor.extract, attacked, key, None, "phase"
            )
            return result.text == truth
        except (WatermarkNotFoundError, ImageTooSmallError):
            return False

    def _save_outputs(self, watermarked_image, signal_map, psnr, ssim) -> dict:
        filename = f"{uuid.uuid4()}.png"
        output_path = os.path.join("static/processed", filename)
        self.processor.save_image(watermarked_image, output_path)

        signal_filename = f"signal_{filename}"
        signal_path = os.path.join("static/processed", signal_filename)
        self.processor.save_image(signal_map, signal_path)

        return {
            "image_url": f"/static/processed/{filename}",
            "signal_map_url": f"/static/processed/{signal_filename}",
            "psnr": round(psnr, 2),
            "ssim": round(ssim, 4)
        }

    # ------------------------------------------------------------------
    # Extract (with original)
    # ------------------------------------------------------------------
    async def extract(self, original: np.ndarray, suspect: np.ndarray, key: bytes = None,
                      engine: str = CLASSIC) -> dict:
        """
        依 engine 分派擷取：
        - classic：先 ORB+RANSAC 對齊再相位搜尋擷取。
        - trustmark：模型本身為盲提取，原圖僅供介面一致（不使用），直接解 ID 反查文字。
        """
        if engine == TRUSTMARK:
            return await self._extract_trustmark(suspect)
        return await self._extract_classic(original, suspect, key=key)

    async def _extract_trustmark(self, suspect: np.ndarray) -> dict:
        engine = await asyncio.to_thread(self._require_trustmark)
        id_bits = await asyncio.to_thread(engine.extract, suspect)
        record = self._lookup_bits(id_bits)
        if record is None:
            return {"extracted_text": None, "status": "not_found",
                    "confidence": 0.0, "is_match": False}
        return {"extracted_text": record["text"], "status": "trustmark",
                "confidence": 1.0, "is_match": True}

    async def _extract_classic(self, original: np.ndarray, suspect: np.ndarray,
                               key: bytes = None) -> dict:
        """
        擷取策略：先試「盲提取」（直接對可疑影像做相位搜尋），失敗才動用較昂貴的
        ORB+RANSAC 幾何對齊。多數「with original」情境其實只是重存/重壓縮而未幾何變形，
        盲提取即可命中（約 0.05s）；對齊（約 0.4s）只在真的旋轉/縮放/透視時才需要。
        兩者結果相同、僅省下常見情況的對齊成本——是安全的延遲優化。

        擷取失敗一律由 core 層丟 WatermarkNotFoundError，以 try/except 判成敗，
        不依賴回傳字串做子字串比對（v1 錯誤字串反模式已造成過 verify 假陽性，v2 禁止）。
        """
        # 1. 盲提取（便宜、常見情況即命中）
        try:
            result = self.extractor.extract(suspect, key=key, search="phase")
            return {
                "extracted_text": result.text,
                "status": "direct",  # 未經幾何對齊即命中
                "confidence": result.confidence,
                "is_match": True,
            }
        except WatermarkNotFoundError:
            pass

        # 2. 盲提取失敗 → 以原圖做 ORB+RANSAC 幾何對齊後再試（處理旋轉/縮放/透視）
        try:
            # align_image 以回傳 None 表達預期中的對齊失敗；此 except 只攔截 OpenCV 內部
            # 的非預期例外並記錄，以免真正的回歸 bug 被靜默吞掉。
            aligned = self.geometry.align_image(original, suspect)
        except Exception:
            logger.exception("[Extract] align_image 拋出非預期例外，視為對齊失敗")
            aligned = None

        if aligned is not None:
            try:
                result = self.extractor.extract(aligned, key=key, search="phase")
                return {
                    "extracted_text": result.text,
                    "status": "aligned",  # 幾何對齊後命中
                    "confidence": result.confidence,
                    "is_match": True,
                }
            except WatermarkNotFoundError:
                pass

        return {
            "extracted_text": None,
            "status": "not_found",
            "confidence": 0.0,
            "is_match": False,
        }

    # ------------------------------------------------------------------
    # Verify (blind)
    # ------------------------------------------------------------------
    async def verify(self, suspect: np.ndarray, key: bytes = None,
                     engine: str = CLASSIC) -> dict:
        """依 engine 分派盲驗證（皆不需原圖）。"""
        if engine == TRUSTMARK:
            return await self._verify_trustmark(suspect)
        return await self._verify_classic(suspect, key=key)

    async def _verify_classic(self, suspect: np.ndarray, key: bytes = None) -> dict:
        try:
            result = self.extractor.extract(suspect, key=key, search="phase")
            return {
                "verified": True,
                "watermark_text": result.text,
                "confidence": result.confidence,
                "metadata": {
                    "method": "DWT2+DM-QIM",
                    "phase": result.phase,
                    "origin": result.origin,
                    "tiles_total": result.tiles_total,
                    "tiles_decoded": result.tiles_decoded,
                    "vote_agreement": result.vote_agreement,
                }
            }
        except WatermarkNotFoundError:
            return {
                "verified": False,
                "watermark_text": None,
                "confidence": 0.0,
                "metadata": {
                    "method": "DWT2+DM-QIM",
                    "note": "watermark not found",
                }
            }

    async def _verify_trustmark(self, suspect: np.ndarray) -> dict:
        engine = await asyncio.to_thread(self._require_trustmark)
        id_bits = await asyncio.to_thread(engine.extract, suspect)
        record = self._lookup_bits(id_bits)
        if record is None:
            return {
                "verified": False,
                "watermark_text": None,
                "confidence": 0.0,
                "metadata": {"method": "TrustMark", "note": "watermark not found"},
            }
        return {
            "verified": True,
            "watermark_text": record["text"],
            "confidence": 1.0,
            "metadata": {
                "method": "TrustMark",
                "watermark_id": str(record["id"]),
                "created_at": record["created_at"],
            },
        }

    # ------------------------------------------------------------------
    # 深度學習軌輔助
    # ------------------------------------------------------------------
    def _require_trustmark(self):
        """取得 TrustMark 引擎；未安裝時丟 EngineUnavailableError（API 層映射為 503）。"""
        if not dl_watermark.is_available():
            raise EngineUnavailableError(
                "深度學習軌不可用：未安裝 trustmark 套件（見 requirements-dl.txt）"
            )
        return dl_watermark.get_engine()

    def _lookup_bits(self, id_bits):
        """把還原出的 61-bit 位元字串反查登錄表；None 或格式錯誤回傳 None。"""
        if not id_bits:
            return None
        try:
            watermark_id = registry_mod.bits_to_id(id_bits)
        except ValueError:
            return None
        return self.registry.lookup(watermark_id)

    # 以下兩個薄包裝委派給 src.core.metrics 的單一實作，保留方法名以相容既有測試。
    def _calculate_psnr(self, img1: np.ndarray, img2: np.ndarray) -> float:
        return compute_psnr(img1, img2)

    def _calculate_ssim(self, img1: np.ndarray, img2: np.ndarray) -> float:
        return compute_ssim(img1, img2)
