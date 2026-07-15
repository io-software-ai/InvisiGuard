"""
核心浮水印演算法套件 (CORE CONTRACT v2)

純 re-export，不得有任何 import 副作用
（v1 曾在 import 時 print 非 ASCII 字元，於 cp1252 主控台直接崩潰）。
"""

from . import params
from . import exceptions
from . import packet
from .exceptions import (
    WatermarkError,
    WatermarkNotFoundError,
    MessageTooLongError,
    ImageTooSmallError,
)
from .embedding import WatermarkEmbedder
from .extraction import WatermarkExtractor, ExtractionResult
from .geometry import GeometryProcessor

__all__ = [
    "params",
    "exceptions",
    "packet",
    "WatermarkError",
    "WatermarkNotFoundError",
    "MessageTooLongError",
    "ImageTooSmallError",
    "WatermarkEmbedder",
    "WatermarkExtractor",
    "ExtractionResult",
    "GeometryProcessor",
]
