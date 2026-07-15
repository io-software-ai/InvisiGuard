"""
浮水印嵌入器 (CORE CONTRACT v2)

演算法：DWT(level=2, haar) + 抖動 QIM（Quantization Index Modulation）+ 平鋪冗餘。

- 彩圖只在 Y（亮度）通道嵌入，避免影響顏色。
- LL2 子帶切成 32x32 係數的 tile，每個 tile 各嵌入一份完整的 1024-bit RS 封包
  （平鋪冗餘：裁切後只要留下任一完整 tile 即可還原訊息）。
- 位元 j 依金鑰派生的排列 perm 放在 tile 內攤平位置 perm[j]，
  並以金鑰派生的抖動 dither[j] 做 QIM 偏移，錯誤金鑰無法解讀。
"""

import cv2
import numpy as np
import pywt

from .params import WAVELET, DWT_LEVEL, DELTA, TILE_COEFF, MIN_IMAGE_DIM, get_key
from .exceptions import ImageTooSmallError
from .packet import build_packet, packet_to_bits, derive_dither, derive_permutation


class WatermarkEmbedder:
    """DWT-QIM 浮水印嵌入器。"""

    def embed(self, image: np.ndarray, text: str, key: bytes = None, delta: float = None) -> np.ndarray:
        """
        將文字浮水印嵌入影像。

        image: BGR uint8（或灰階）；回傳同尺寸、同通道數的 uint8 影像。
        丟出 MessageTooLongError（訊息過長）/ ImageTooSmallError（影像過小）。
        """
        # 用 is None 而非 falsy 判斷：呼叫端明確傳 key=b"" 應被尊重（雖不建議），
        # 不可靜默退回公開的 DEFAULT_KEY；delta=0 同理應由下游數學暴露問題而非被吞。
        key = get_key() if key is None else key
        delta = float(DELTA if delta is None else delta)

        if image is None or image.ndim not in (2, 3):
            raise ValueError("影像必須是 2 維灰階或 3 維 BGR 陣列")

        h, w = image.shape[:2]
        if h < MIN_IMAGE_DIM or w < MIN_IMAGE_DIM:
            raise ImageTooSmallError(
                f"影像尺寸 {w}x{h} 小於最小需求 {MIN_IMAGE_DIM}x{MIN_IMAGE_DIM}"
            )

        # --- 1. 取 Y 通道（float64）---
        is_color = image.ndim == 3
        if is_color:
            yuv = cv2.cvtColor(image, cv2.COLOR_BGR2YUV)
            y_channel = yuv[:, :, 0].astype(np.float64)
        else:
            y_channel = image.astype(np.float64)

        # --- 2. 準備位元流與金鑰材料 ---
        n_bits = TILE_COEFF * TILE_COEFF  # 1024
        bits = packet_to_bits(build_packet(text))
        perm = derive_permutation(key, n_bits)
        dither = derive_dither(key, n_bits, delta)

        # 位元 j 放在 tile 內攤平位置 perm[j]：
        # 依「位置」排列的 QIM 偏移 = dither[j] + bits[j] * delta/2
        offset_at_pos = np.empty(n_bits, dtype=np.float64)
        offset_at_pos[perm] = dither + bits * (delta / 2.0)

        # --- 3. DWT 分解取 LL2 ---
        coeffs = pywt.wavedec2(y_channel, WAVELET, level=DWT_LEVEL)
        ll2 = coeffs[0]

        # --- 4. 檢查可容納的完整 tile 數 ---
        n_ty = ll2.shape[0] // TILE_COEFF
        n_tx = ll2.shape[1] // TILE_COEFF
        if n_ty == 0 or n_tx == 0:
            raise ImageTooSmallError(
                f"LL2 子帶 {ll2.shape[1]}x{ll2.shape[0]} 無法容納完整的 {TILE_COEFF}x{TILE_COEFF} tile"
            )

        # --- 5. 抖動 QIM 嵌入（全 tile 向量化，所有 tile 嵌入相同封包）---
        region_h, region_w = n_ty * TILE_COEFF, n_tx * TILE_COEFF
        tiles = (
            ll2[:region_h, :region_w]
            .reshape(n_ty, TILE_COEFF, n_tx, TILE_COEFF)
            .transpose(0, 2, 1, 3)
            .reshape(-1, n_bits)
        )
        # q = round((c - offset)/delta); c_new = q*delta + offset
        q = np.round((tiles - offset_at_pos) / delta)
        tiles = q * delta + offset_at_pos
        ll2[:region_h, :region_w] = (
            tiles.reshape(n_ty, n_tx, TILE_COEFF, TILE_COEFF)
            .transpose(0, 2, 1, 3)
            .reshape(region_h, region_w)
        )
        coeffs[0] = ll2

        # --- 6. 逆變換重建，裁回原尺寸並合回色彩 ---
        y_rec = pywt.waverec2(coeffs, WAVELET)[:h, :w]
        y_rec = np.clip(np.round(y_rec), 0, 255).astype(np.uint8)

        if is_color:
            yuv[:, :, 0] = y_rec
            return cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR)
        return y_rec
