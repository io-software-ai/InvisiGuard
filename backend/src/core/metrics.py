"""
影像品質指標 (PSNR / SSIM) 的單一實作。

service 層、基準腳本、測試皆從這裡取用，避免同一公式在多處各寫一份而漂移
（例如 PSNR 的 uint8 迴繞修正若只在一處更新，其餘處會給出不一致的數值）。
"""

import cv2
import numpy as np


def compute_psnr(img1: np.ndarray, img2: np.ndarray) -> float:
    """
    以 float64 計算 PSNR（dB）。

    必須先轉 float64 再相減：直接對 uint8 陣列相減會在 0/255 邊界模 256 迴繞
    （1 - 2 變成 255 而非 -1），使 MSE 被嚴重高估。完全相同時回傳 100.0。
    """
    mse = np.mean((img1.astype(np.float64) - img2.astype(np.float64)) ** 2)
    if mse == 0:
        return 100.0
    return float(20 * np.log10(255.0 / np.sqrt(mse)))


def compute_ssim(img1: np.ndarray, img2: np.ndarray) -> float:
    """
    計算灰階 SSIM（結構相似度）。彩圖先轉灰階；灰階輸入直接使用。
    scikit-image 未安裝時回傳 0.0（視為不可用而非中斷流程）。
    """
    try:
        from skimage.metrics import structural_similarity
    except ImportError:
        return 0.0

    gray1 = img1 if img1.ndim == 2 else cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
    gray2 = img2 if img2.ndim == 2 else cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
    return float(structural_similarity(gray1, gray2))
