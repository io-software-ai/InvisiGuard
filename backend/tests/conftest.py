"""
pytest 共用設定與 fixtures。

- sys.path：無論 pytest 由哪個工作目錄啟動，都確保 backend/ 目錄本身在 sys.path 上，
  讓測試檔可用 `import src.core...`（與 API/Service 層一致的 import 慣例）。
- 合成測試影像：核心演算法依賴影像具備足夠紋理（DWT/QIM 對高頻雜訊敏感）與
  極端區域（飽和／過曝），因此以漸層 + 高斯雜訊為基底，並可選擇加入頂部飽和帶。
- jpeg_roundtrip：以記憶體內編碼／解碼模擬「儲存為 JPEG 後重新讀取」的壓縮攻擊，
  不落地暫存檔案。
"""

import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

# --- sys.path 設定：確保 backend/ 目錄在 sys.path 上，import src.* 才會成功 ---
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def make_synthetic_image(width: int, height: int, seed: int = 0,
                          saturated_band: bool = True) -> np.ndarray:
    """
    產生合成測試影像（BGR uint8）：水平+垂直漸層疊加高斯雜訊，
    可選擇在頂部加入一段飽和（純白）色帶，模擬過曝天空等真實極端區域。

    漸層+雜訊確保影像有足夠高頻紋理供 DWT/QIM 嵌入；飽和帶則用來驗證
    演算法在數值被截頂（clip）的區域仍不崩潰、且不影響其餘 tile 的還原。
    """
    rng = np.random.default_rng(seed)
    x = np.linspace(0, 255, width, dtype=np.float64)
    y = np.linspace(0, 255, height, dtype=np.float64)
    gradient = x[None, :] * 0.5 + y[:, None] * 0.5
    noise = rng.normal(0, 15, size=(height, width))
    base = np.clip(gradient + noise, 0, 255)

    # 三個通道各自些微錯位，避免灰階退化（BGR 非全等，貼近真實照片）
    b = base
    g = np.roll(base, 10, axis=1)
    r = np.roll(base, -10, axis=0)
    image = np.clip(np.stack([b, g, r], axis=-1), 0, 255).astype(np.uint8)

    if saturated_band:
        band_h = max(1, height // 8)
        image[:band_h, :, :] = 255  # 頂部飽和帶（純白，模擬過曝）

    return image


def compute_psnr(img1: np.ndarray, img2: np.ndarray) -> float:
    """
    以 float64 手算 PSNR，避免 uint8 相減時在 0/255 邊界模 256 迴繞。

    兩張影像完全相同時回傳 100.0（依慣例代表「無限大」的上限值）。
    """
    mse = np.mean((img1.astype(np.float64) - img2.astype(np.float64)) ** 2)
    if mse == 0:
        return 100.0
    return 20 * np.log10(255.0 / np.sqrt(mse))


# ---------------------------------------------------------------------------
# 影像 fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def img_512() -> np.ndarray:
    """512x512 漸層+雜訊+頂部飽和帶合成影像（預設尺寸，跑最多案例）。"""
    return make_synthetic_image(512, 512, seed=1)


@pytest.fixture
def img_1024x768() -> np.ndarray:
    """1024x768（非正方形）漸層+雜訊+頂部飽和帶合成影像。"""
    return make_synthetic_image(1024, 768, seed=2)


@pytest.fixture
def img_gradient_noise() -> np.ndarray:
    """純漸層+雜訊，不含飽和帶（一般情境的代表影像）。"""
    return make_synthetic_image(512, 512, seed=3, saturated_band=False)


@pytest.fixture
def img_saturated_band() -> np.ndarray:
    """頂部大面積飽和帶（測試極端平坦／過曝區域不影響嵌入與提取）。"""
    return make_synthetic_image(512, 512, seed=4, saturated_band=True)


@pytest.fixture
def isolated_static_cwd(tmp_path, monkeypatch):
    """
    將目前工作目錄切換到一個乾淨的暫存目錄，並預先建立 static/processed、static/debug。

    WatermarkService.embed（以及 main.py 啟動時）都是以「相對於目前工作目錄」的
    static/processed 路徑存檔；若不隔離工作目錄，測試會把產物寫進實際的
    backend/static/ 底下並隨測試執行不斷累積檔案。此 fixture 讓每個測試改在獨立的
    暫存目錄執行，互不干擾、也不弄髒專案目錄。
    """
    monkeypatch.chdir(tmp_path)
    (tmp_path / "static" / "processed").mkdir(parents=True, exist_ok=True)
    (tmp_path / "static" / "debug").mkdir(parents=True, exist_ok=True)
    return tmp_path


@pytest.fixture
def jpeg_roundtrip():
    """
    回傳一個 `(image, quality) -> image` 函式，於記憶體中將影像以指定
    JPEG 品質編碼後立即解碼，模擬「另存為 JPEG」的破壞性攻擊。
    """

    def _roundtrip(image: np.ndarray, quality: int) -> np.ndarray:
        ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, quality])
        assert ok, "JPEG 編碼失敗"
        decoded = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
        assert decoded is not None, "JPEG 解碼失敗"
        return decoded

    return _roundtrip
