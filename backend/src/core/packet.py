"""
浮水印封包編解碼與金鑰派生 (CORE CONTRACT v2)

封包格式（RS 編碼前的資料區，共 DATA_BYTES = 96 字節）：
    MAGIC(2) + VERSION(1) + LEN(1) + TEXT(<=92, UTF-8) + 零填充
經 RS(128, 96) 編碼後為恰好 PACKET_BYTES = 128 字節 = 1024 bits，
剛好填滿一個 32x32 的 LL2 係數 tile。

金鑰派生（決定性、跨平台一致）：
- derive_dither：SHA-256 counter stream 產生 [0, delta) 的抖動序列（每位元一個）。
- derive_permutation：以 sha256(key + b"perm") 前 8 字節為種子，產生 tile 內位置排列。
"""

import hashlib

import numpy as np
from reedsolo import RSCodec, ReedSolomonError

from .params import (
    PACKET_BYTES,
    N_ECC_SYMBOLS,
    DATA_BYTES,
    MAGIC,
    VERSION,
    HEADER_BYTES,
    MAX_TEXT_BYTES,
)
from .exceptions import MessageTooLongError, WatermarkNotFoundError

# 模組層級共用的 Reed-Solomon 編解碼器（96 + 32 = 128 <= 255，單一區塊）
_RSC = RSCodec(N_ECC_SYMBOLS)


def build_packet(text: str) -> bytes:
    """
    將文字打包為恰好 PACKET_BYTES (128) 字節的 RS 編碼封包。

    超過 MAX_TEXT_BYTES（UTF-8 位元組數）丟出 MessageTooLongError。
    """
    text_bytes = text.encode("utf-8")
    if len(text_bytes) > MAX_TEXT_BYTES:
        raise MessageTooLongError(
            f"訊息過長：UTF-8 編碼後為 {len(text_bytes)} 字節，上限為 {MAX_TEXT_BYTES} 字節"
        )

    # 標頭 + 文字 + 零填充 → 固定 DATA_BYTES 字節
    data = MAGIC + bytes([VERSION, len(text_bytes)]) + text_bytes
    data = data + b"\x00" * (DATA_BYTES - len(data))

    packet = bytes(_RSC.encode(data))
    assert len(packet) == PACKET_BYTES
    return packet


def parse_packet(packet: bytes) -> str:
    """
    RS 解碼封包並驗證 MAGIC / VERSION / LEN，回傳原始文字。

    任何失敗（RS 無法糾錯、標頭不符、長度非法、UTF-8 無效、填充非零）
    一律丟出 WatermarkNotFoundError——絕不回傳錯誤訊息字串。
    """
    if len(packet) != PACKET_BYTES:
        raise WatermarkNotFoundError(f"封包長度錯誤：{len(packet)}（應為 {PACKET_BYTES}）")

    try:
        decoded = _RSC.decode(bytes(packet))
    except ReedSolomonError as exc:
        raise WatermarkNotFoundError("Reed-Solomon 解碼失敗（錯誤超出糾錯能力）") from exc

    # reedsolo 新版回傳 (資料, 完整碼字, 錯誤位置) 三元組，舊版直接回傳資料
    data = bytes(decoded[0] if isinstance(decoded, tuple) else decoded)

    # --- 驗證標頭 ---
    if data[:2] != MAGIC:
        raise WatermarkNotFoundError("無效的封包 MAGIC")
    if data[2] != VERSION:
        raise WatermarkNotFoundError(f"不支援的封包版本：{data[2]}")

    length = data[3]
    if length > MAX_TEXT_BYTES:
        raise WatermarkNotFoundError(f"無效的訊息長度：{length}")

    # 填充區必須全為零，進一步降低錯誤金鑰下的假陽性機率
    if any(data[HEADER_BYTES + length:DATA_BYTES]):
        raise WatermarkNotFoundError("封包填充區非零（封包已損壞）")

    try:
        return data[HEADER_BYTES:HEADER_BYTES + length].decode("utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        raise WatermarkNotFoundError("UTF-8 解碼失敗（封包已損壞）") from exc


def packet_to_bits(packet: bytes) -> np.ndarray:
    """將 128 字節封包展開為 (1024,) 的 uint8 位元陣列（每字節 MSB 在前）。"""
    if len(packet) != PACKET_BYTES:
        raise ValueError(f"封包長度錯誤：{len(packet)}（應為 {PACKET_BYTES}）")
    return np.unpackbits(np.frombuffer(packet, dtype=np.uint8))


def bits_to_packet(bits: np.ndarray) -> bytes:
    """將 (1024,) 位元陣列（MSB 在前）壓回 128 字節封包。"""
    bits = np.asarray(bits).ravel()
    if bits.size != PACKET_BYTES * 8:
        raise ValueError(f"位元數錯誤：{bits.size}（應為 {PACKET_BYTES * 8}）")
    return np.packbits(bits.astype(np.uint8)).tobytes()


def derive_dither(key: bytes, n: int, delta: float) -> np.ndarray:
    """
    以 SHA-256 counter stream 決定性生成 (n,) 的 float64 抖動序列，值域 [0, delta)。

    每個 counter 區塊 sha256(key + counter) 產生 32 字節 = 4 個 big-endian uint64，
    再映射到 [0, delta)。相同 (key, n, delta) 在任何平台都產生相同序列。
    """
    n_blocks = (n * 8 + 31) // 32  # 每個 SHA-256 摘要提供 4 個 uint64
    stream = b"".join(
        hashlib.sha256(key + counter.to_bytes(8, "big")).digest()
        for counter in range(n_blocks)
    )
    values = np.frombuffer(stream[: n * 8], dtype=">u8").astype(np.float64)
    return values / float(2 ** 64) * delta


def derive_permutation(key: bytes, n: int) -> np.ndarray:
    """
    決定性生成 (n,) 的排列索引：位元 j 放在 tile 內攤平位置 perm[j]。

    種子取 sha256(key + b"perm") 前 8 字節，餵給 NumPy 的 PCG64 產生器。
    """
    seed = int.from_bytes(hashlib.sha256(key + b"perm").digest()[:8], "big")
    rng = np.random.default_rng(seed)
    return rng.permutation(n)
