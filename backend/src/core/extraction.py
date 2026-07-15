"""
浮水印提取器 (CORE CONTRACT v2)

演算法：DWT(level=2, haar) + 抖動 QIM 軟判決 + 跨 tile 投票融合 + Reed-Solomon 糾錯。

搜尋模式：
- "none"：只試 (dx=0, dy=0, oy=0, ox=0)。
- "phase"：像素相位 dx, dy 各 0..3 全組合（oy=ox=0），(0,0) 優先。
  裁切會造成 DWT 格點錯位，補回 0..3 像素即可重新對齊 4x4 係數格點。
- "full"：每個相位再掃描 LL2 tile 原點 oy, ox 各 0..31，找到即提早退出。
  為控制耗時，非零原點只做融合 RS 解碼（不做逐 tile），
  且 tiles_total >= 2 而 vote_agreement 低於門檻時直接跳過該候選。

失敗一律丟 WatermarkNotFoundError——
絕不回傳錯誤訊息字串（錯誤即字串反模式已在 v1 造成 verify 假陽性）。
"""

from collections import Counter
from dataclasses import dataclass

import cv2
import numpy as np
import pywt

from .params import WAVELET, DWT_LEVEL, DELTA, TILE_COEFF, get_key
from .exceptions import WatermarkNotFoundError
from .packet import parse_packet, bits_to_packet, derive_dither, derive_permutation

# "full" 掃描時的投票一致度門檻：低於此值視為雜訊候選，直接跳過（不做 RS 解碼）。
# 隨機資料的期望一致度約為 0.46/sqrt(tiles_total)（16 個 tile 時約 0.12），
# 真實訊號即使經過 JPEG 壓縮通常仍遠高於 0.2。
VOTE_SKIP_THRESHOLD = 0.2


@dataclass
class ExtractionResult:
    """提取結果：文字、信心值與診斷統計。"""

    text: str             # 還原出的浮水印文字
    confidence: float     # 信心值 0..1 = max(tiles_decoded/tiles_total, 融合成功時的 vote_agreement)
    tiles_total: int      # 該候選視窗內完整 tile 總數
    tiles_decoded: int    # 單獨 RS 解碼成功且文字一致的 tile 數
    vote_agreement: float # 跨 tile 軟投票一致度 0..1
    phase: tuple          # 命中的像素相位 (dx, dy)
    origin: tuple         # 命中的 LL2 tile 原點偏移 (oy, ox)


class WatermarkExtractor:
    """DWT-QIM 浮水印提取器。"""

    def extract(self, image: np.ndarray, key: bytes = None, delta: float = None,
                search: str = "phase") -> ExtractionResult:
        """
        從影像提取文字浮水印；所有候選皆失敗時丟 WatermarkNotFoundError。
        """
        # 用 is None 而非 falsy 判斷（與 embedding.py 一致）：避免 key=b"" 靜默退回 DEFAULT_KEY。
        key = get_key() if key is None else key
        delta = float(DELTA if delta is None else delta)

        if search not in ("none", "phase", "full"):
            raise ValueError(f"未知的搜尋模式：{search!r}（應為 'none' / 'phase' / 'full'）")
        if image is None or image.ndim not in (2, 3):
            raise ValueError("影像必須是 2 維灰階或 3 維 BGR 陣列")

        # --- 取 Y 通道（float64），之後各相位候選直接切片 ---
        if image.ndim == 3:
            y_full = cv2.cvtColor(image, cv2.COLOR_BGR2YUV)[:, :, 0].astype(np.float64)
        else:
            y_full = image.astype(np.float64)

        # --- 金鑰材料（與嵌入端互為精確逆運算）---
        n_bits = TILE_COEFF * TILE_COEFF  # 1024
        perm = derive_permutation(key, n_bits)
        dither = derive_dither(key, n_bits, delta)
        # 依「位置」排列的抖動：位置 perm[j] 上的係數承載位元 j，其抖動為 dither[j]
        dither_at_pos = np.empty(n_bits, dtype=np.float64)
        dither_at_pos[perm] = dither

        # --- 候選相位（(0,0) 優先）---
        if search == "none":
            phases = [(0, 0)]
        else:
            phases = [(0, 0)] + [
                (dx, dy) for dy in range(4) for dx in range(4) if (dx, dy) != (0, 0)
            ]

        for dx, dy in phases:
            work = y_full[dy:, dx:]
            if work.shape[0] < 4 or work.shape[1] < 4:
                continue  # 影像過小，無法做 level=2 DWT
            # 注意：是否容得下完整 tile 交由 _demodulate_margins 判斷
            # （pywt 對稱填充會把 LL2 尺寸向上取整，過早排除會漏掉邊界候選）

            # 每個相位只做一次 DWT，各 tile 原點候選共用同一份 LL2
            ll2 = pywt.wavedec2(work, WAVELET, level=DWT_LEVEL)[0]

            if search == "full":
                origins = [(0, 0)] + [
                    (oy, ox)
                    for oy in range(TILE_COEFF)
                    for ox in range(TILE_COEFF)
                    if (oy, ox) != (0, 0)
                ]
            else:
                origins = [(0, 0)]

            for oy, ox in origins:
                # 原點 (0,0) 走完整流程（含逐 tile 備援解碼）；
                # "full" 的非零原點只做融合解碼並套用一致度門檻以控制耗時。
                is_base = (oy == 0 and ox == 0)
                result = self._try_candidate(
                    ll2[oy:, ox:], dither_at_pos, perm, delta,
                    allow_per_tile=is_base,
                    quick_skip=(search == "full" and not is_base),
                )
                if result is not None:
                    text, tiles_total, tiles_decoded, agreement, fused_ok = result
                    confidence = max(
                        tiles_decoded / tiles_total,
                        agreement if fused_ok else 0.0,
                    )
                    # 首次成功即返回（提早退出）
                    return ExtractionResult(
                        text=text,
                        confidence=float(confidence),
                        tiles_total=tiles_total,
                        tiles_decoded=tiles_decoded,
                        vote_agreement=float(agreement),
                        phase=(dx, dy),
                        origin=(oy, ox),
                    )

        raise WatermarkNotFoundError("影像中找不到有效浮水印（所有候選皆解碼失敗）")

    # ------------------------------------------------------------------
    # 內部方法
    # ------------------------------------------------------------------

    def _demodulate_margins(self, ll2_view: np.ndarray, dither_at_pos: np.ndarray,
                            delta: float):
        """
        對候選 LL2 視窗做 QIM 軟解調。

        回傳 (n_tiles, 1024) 的 margin 矩陣（依 tile 內「位置」排列）：
        margin = dist0 - dist1，正值表示傾向位元 1。
        視窗容不下任何完整 tile 時回傳 None。
        """
        n_ty = ll2_view.shape[0] // TILE_COEFF
        n_tx = ll2_view.shape[1] // TILE_COEFF
        if n_ty == 0 or n_tx == 0:
            return None

        region_h, region_w = n_ty * TILE_COEFF, n_tx * TILE_COEFF
        tiles = (
            ll2_view[:region_h, :region_w]
            .reshape(n_ty, TILE_COEFF, n_tx, TILE_COEFF)
            .transpose(0, 2, 1, 3)
            .reshape(-1, TILE_COEFF * TILE_COEFF)
        )

        # r = (c - dither) mod delta；到「0 格點」與「delta/2 格點」的距離
        r = (tiles - dither_at_pos) % delta
        dist0 = np.minimum(r, delta - r)
        dist1 = np.abs(r - delta / 2.0)
        return dist0 - dist1

    def _try_candidate(self, ll2_view: np.ndarray, dither_at_pos: np.ndarray,
                       perm: np.ndarray, delta: float,
                       allow_per_tile: bool, quick_skip: bool):
        """
        嘗試解碼一個候選視窗。

        成功回傳 (text, tiles_total, tiles_decoded, vote_agreement, fused_ok)，
        失敗回傳 None（不丟例外，由呼叫端繼續掃描下一個候選）。
        """
        margins = self._demodulate_margins(ll2_view, dither_at_pos, delta)
        if margins is None:
            return None
        n_tiles = margins.shape[0]

        # --- 融合：跨 tile 軟投票（margin 加總），再轉回位元順序 ---
        # v[j] = sum(margin over tiles)（位置 perm[j] 承載位元 j）
        votes = margins.sum(axis=0)[perm]
        agreement = float(
            np.clip(np.abs(votes).mean() / (n_tiles * delta / 2.0), 0.0, 1.0)
        )

        # "full" 掃描的耗時控制：一致度過低的候選直接跳過，不做 RS 解碼
        if quick_skip and n_tiles >= 2 and agreement < VOTE_SKIP_THRESHOLD:
            return None

        # --- 先試融合位元的 RS 解碼 ---
        text = None
        fused_ok = False
        try:
            fused_bits = (votes > 0).astype(np.uint8)
            text = parse_packet(bits_to_packet(fused_bits))
            fused_ok = True
        except WatermarkNotFoundError:
            pass

        tile_texts = None
        if text is None:
            if not allow_per_tile:
                return None
            # --- 融合失敗：逐 tile 單獨 RS 解碼（每 tile 已含完整封包）---
            tile_texts = self._decode_tiles(margins, perm)
            decoded = [t for t in tile_texts if t is not None]
            if not decoded:
                return None
            # 任一成功即得 text（多個成功時取最常見者）
            text = Counter(decoded).most_common(1)[0][0]

        # --- 成功後統計：單獨解碼成功且文字一致的 tile 數 ---
        if tile_texts is None:
            tile_texts = self._decode_tiles(margins, perm)
        tiles_decoded = sum(1 for t in tile_texts if t == text)

        return text, n_tiles, tiles_decoded, agreement, fused_ok

    def _decode_tiles(self, margins: np.ndarray, perm: np.ndarray) -> list:
        """逐 tile 硬判決 + RS 解碼；回傳每個 tile 的文字（失敗為 None）。"""
        # margins[:, perm] 將「位置」順序重排為「位元」順序
        tile_bits = (margins[:, perm] > 0).astype(np.uint8)
        texts = []
        for t in range(tile_bits.shape[0]):
            try:
                texts.append(parse_packet(bits_to_packet(tile_bits[t])))
            except WatermarkNotFoundError:
                texts.append(None)
        return texts
