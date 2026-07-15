"""
封包編解碼測試 (src.core.packet)。

涵蓋：build/parse 往返、容量邊界（92/93 bytes）、Reed-Solomon 糾錯邊界
（<=16 字節錯誤可救、>16 字節錯誤應失敗）、MAGIC 被破壞時的失敗行為。
"""

import numpy as np
import pytest
from reedsolo import RSCodec

from src.core.exceptions import MessageTooLongError, WatermarkNotFoundError
from src.core.packet import (
    build_packet,
    parse_packet,
    packet_to_bits,
    bits_to_packet,
    derive_dither,
    derive_permutation,
)
from src.core.params import (
    PACKET_BYTES,
    MAX_TEXT_BYTES,
    MAGIC,
    VERSION,
    DATA_BYTES,
    N_ECC_SYMBOLS,
)


def _flip_n_bytes(packet: bytes, n: int, seed: int) -> bytes:
    """隨機挑選 n 個不重複的字節位置，對每個位置做全位元翻轉（XOR 0xFF）。"""
    rng = np.random.default_rng(seed)
    corrupted = bytearray(packet)
    positions = rng.choice(len(corrupted), size=n, replace=False)
    for pos in positions:
        corrupted[pos] ^= 0xFF
    return bytes(corrupted)


class TestRoundtrip:
    def test_ascii(self):
        packet = build_packet("hello watermark")
        assert len(packet) == PACKET_BYTES
        assert parse_packet(packet) == "hello watermark"

    def test_cjk(self):
        text = "浮水印測試"
        packet = build_packet(text)
        assert len(packet) == PACKET_BYTES
        assert parse_packet(packet) == text

    def test_exact_92_bytes(self):
        # 恰好 MAX_TEXT_BYTES（UTF-8 位元組數）上限，應成功。
        text = "a" * MAX_TEXT_BYTES
        assert len(text.encode("utf-8")) == MAX_TEXT_BYTES
        packet = build_packet(text)
        assert parse_packet(packet) == text

    def test_93_bytes_raises_message_too_long(self):
        text = "a" * (MAX_TEXT_BYTES + 1)
        with pytest.raises(MessageTooLongError):
            build_packet(text)

    def test_empty_text(self):
        packet = build_packet("")
        assert parse_packet(packet) == ""

    def test_packet_bits_roundtrip(self):
        packet = build_packet("bits roundtrip")
        bits = packet_to_bits(packet)
        assert bits.shape == (PACKET_BYTES * 8,)
        assert bits.dtype == np.uint8
        assert set(np.unique(bits).tolist()) <= {0, 1}
        assert bits_to_packet(bits) == packet


class TestErrorCorrection:
    def test_16_byte_errors_still_decodes(self):
        text = "error correction"
        packet = build_packet(text)
        for seed in range(5):
            corrupted = _flip_n_bytes(packet, 16, seed=seed)
            assert parse_packet(corrupted) == text

    def test_17_byte_errors_raises_not_found(self):
        text = "error correction"
        packet = build_packet(text)
        for seed in range(5):
            corrupted = _flip_n_bytes(packet, 17, seed=seed)
            with pytest.raises(WatermarkNotFoundError):
                parse_packet(corrupted)

    def test_corrupted_magic_raises_not_found(self):
        # 注意：對「已 RS 編碼完成」的封包直接翻轉 1-2 個 MAGIC 字節不適合測這個案例，
        # 因為那遠低於 16 字節糾錯上限，RS 解碼會直接把它「修正回」正確的 MAGIC。
        # 因此改為從頭建構一份 MAGIC 錯誤、但其餘完全合法（且未受額外破壞）的 RS
        # 碼字，確保是「RS 解碼成功、但標頭驗證失敗」這條路徑被觸發。
        text_bytes = "magic check".encode("utf-8")
        bad_data = b"XX" + bytes([VERSION, len(text_bytes)]) + text_bytes
        bad_data = bad_data + b"\x00" * (DATA_BYTES - len(bad_data))
        bad_packet = bytes(RSCodec(N_ECC_SYMBOLS).encode(bad_data))
        with pytest.raises(WatermarkNotFoundError):
            parse_packet(bad_packet)

    def test_wrong_length_raises_not_found(self):
        with pytest.raises(WatermarkNotFoundError):
            parse_packet(b"\x00" * (PACKET_BYTES - 1))


class TestKeyDerivation:
    def test_derive_dither_shape_and_range(self):
        dither = derive_dither(b"some-key", 1024, 16.0)
        assert dither.shape == (1024,)
        assert dither.dtype == np.float64
        assert np.all(dither >= 0.0)
        assert np.all(dither < 16.0)

    def test_derive_dither_deterministic(self):
        d1 = derive_dither(b"key-a", 256, 12.0)
        d2 = derive_dither(b"key-a", 256, 12.0)
        assert np.array_equal(d1, d2)

    def test_derive_dither_key_sensitive(self):
        d1 = derive_dither(b"key-a", 256, 12.0)
        d2 = derive_dither(b"key-b", 256, 12.0)
        assert not np.array_equal(d1, d2)

    def test_derive_permutation_is_valid_permutation(self):
        perm = derive_permutation(b"some-key", 1024)
        assert perm.shape == (1024,)
        assert sorted(perm.tolist()) == list(range(1024))

    def test_derive_permutation_deterministic(self):
        p1 = derive_permutation(b"key-a", 1024)
        p2 = derive_permutation(b"key-a", 1024)
        assert np.array_equal(p1, p2)

    def test_derive_permutation_key_sensitive(self):
        p1 = derive_permutation(b"key-a", 1024)
        p2 = derive_permutation(b"key-b", 1024)
        assert not np.array_equal(p1, p2)


def test_magic_constant_is_two_bytes():
    assert MAGIC == b"IV"
    assert len(MAGIC) == 2
