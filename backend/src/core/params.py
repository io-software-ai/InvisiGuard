"""
核心浮水印演算法參數 (CORE CONTRACT v2)

所有嵌入與提取共用的常數集中於此，確保兩端參數永遠一致。
任何層（services / api）都應從這裡讀取參數，不得自行定義副本。
"""

import os

# --- DWT / QIM 參數 ---
WAVELET = "haar"   # DWT 使用的小波類型（haar 對 4 像素平移具有精確可對齊性）
DWT_LEVEL = 2      # DWT 分解層級（LL2 = 原圖 1/4 尺度的低頻子帶）
DELTA = 24.0       # 預設量化步長，函式參數可覆寫
# delta 取捨（2026-07 基準掃描，3 seeds、512x512 合成圖）：
#   16 → PSNR 45.7 / JPEG q80 存活；20 → PSNR 44.7 / q70；24 → PSNR 42.9 / q60；32 → PSNR 40.8 / q50
# 選 24：在 PSNR > 40dB 的品質底線內給 JPEG 穩健性留餘裕（實照內容變異大於合成圖）。

# --- Reed-Solomon 封包參數：RS(128, 96)，每份封包可糾正 16 字節錯誤 ---
PACKET_BYTES = 128    # 完整封包大小（資料 + ECC）
N_ECC_SYMBOLS = 32    # ECC（錯誤校正碼）符號數量（可校正 N_ECC_SYMBOLS / 2 = 16 個字節錯誤）
DATA_BYTES = 96       # 資料區大小 = PACKET_BYTES - N_ECC_SYMBOLS

# --- 封包標頭：MAGIC(2) + VERSION(1) + LEN(1) ---
MAGIC = b"IV"
VERSION = 2
HEADER_BYTES = 4

# --- 訊息容量 ---
MAX_TEXT_BYTES = 92   # UTF-8 位元組數上限 = DATA_BYTES - HEADER_BYTES

# --- 平鋪（tile）參數 ---
TILE_COEFF = 32       # 每個 tile = 32x32 個 LL2 係數 = 1024 bits = 一份完整封包
PIXELS_PER_COEFF = 4  # 每個 LL2 係數對應原圖 4x4 像素（level=2 的 haar）
MIN_IMAGE_DIM = 128   # 最小影像邊長（保證至少一個完整 tile）

# --- 輸入限制 ---
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_PIXELS = 50_000_000           # 5 千萬像素

# --- 金鑰 ---
# 警告：DEFAULT_KEY 是公開在原始碼中的 DEMO 金鑰，僅供本機開發。
# 金鑰派生了全部安全性（dither 偏移 + 位元排列），任何知道此值的人都能
# 讀取 / 偽造 / 抹除浮水印。正式部署務必設定環境變數 WATERMARK_KEY，
# 且更換金鑰會使先前以舊金鑰嵌入的浮水印全部無法驗證（需妥善保管）。
DEFAULT_KEY = b"invisiguard-demo-key"


def is_using_default_key() -> bool:
    """目前是否退回使用公開的 DEMO 金鑰（未設定 WATERMARK_KEY）。供啟動時警告用。"""
    return not os.environ.get("WATERMARK_KEY")


def get_key() -> bytes:
    """讀取環境變數 WATERMARK_KEY（以 UTF-8 編碼為 bytes），未設定則回傳 DEFAULT_KEY。"""
    env_key = os.environ.get("WATERMARK_KEY")
    if env_key:
        return env_key.encode("utf-8")
    return DEFAULT_KEY
