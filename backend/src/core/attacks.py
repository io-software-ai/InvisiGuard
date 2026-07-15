"""
影像攻擊函式與「穩健性證書」攻擊電池（單一來源）。

benchmark.py（研究掃描，攻擊面較廣）與 services.watermark.certify（產品內的
穩健性證書，精選、面向使用者的一小組）共用這裡的攻擊函式，避免公式在兩處漂移。

穩健性證書的精神：對「剛嵌入的乾淨影像」實際套用常見的真實通道攻擊、再重新提取，
把「這個浮水印在被 JPEG 壓縮 / 縮放 / 裁切 / 旋轉後還在不在」變成用戶當場看得到的
實測結果，而非白皮書裡的宣稱。注意：擴散模型重繪不在此電池內（它會使多數後嵌浮水印
失效，屬全行業未解的天花板）。
"""

import cv2
import numpy as np


def attack_none(img: np.ndarray) -> np.ndarray:
    return img


def attack_jpeg(img: np.ndarray, quality: int) -> np.ndarray:
    ok, encoded = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError("JPEG 編碼失敗")
    decoded = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if decoded is None:
        raise RuntimeError("JPEG 解碼失敗")
    return decoded


def attack_resize(img: np.ndarray, scale: float) -> np.ndarray:
    # 刻意不縮放回原尺寸：盲提取不知道原尺寸，如實記錄成功率。
    h, w = img.shape[:2]
    new_w, new_h = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)


def attack_crop_bottom_right(img: np.ndarray, fraction: float) -> np.ndarray:
    h, w = img.shape[:2]
    keep_h, keep_w = int(h * (1 - fraction)), int(w * (1 - fraction))
    return img[:keep_h, :keep_w]


def attack_crop_top_left_px(img: np.ndarray, px: int) -> np.ndarray:
    return img[px:, px:]


def attack_rotate(img: np.ndarray, degrees: float) -> np.ndarray:
    h, w = img.shape[:2]
    matrix = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), degrees, 1.0)
    return cv2.warpAffine(img, matrix, (w, h), borderMode=cv2.BORDER_REFLECT101)


def attack_brightness(img: np.ndarray, factor: float) -> np.ndarray:
    return np.clip(img.astype(np.float64) * factor, 0, 255).astype(np.uint8)


def attack_gaussian_blur(img: np.ndarray, sigma: float) -> np.ndarray:
    """高斯模糊（低通濾波）——直接改寫低頻係數，對 QIM 類演算法屬毀滅性攻擊。"""
    return cv2.GaussianBlur(img, (0, 0), sigmaX=sigma)


def attack_gaussian_noise(img: np.ndarray, sigma: float) -> np.ndarray:
    """加性高斯雜訊。以固定種子確保結果可重現。"""
    rng = np.random.default_rng(12345)
    noisy = img.astype(np.float64) + rng.normal(0.0, sigma, img.shape)
    return np.clip(noisy, 0, 255).astype(np.uint8)


def build_attack_matrix():
    """研究掃描用的完整攻擊矩陣：回傳 (group, label, fn) 列表。benchmark.py 使用。"""
    attacks = [("none", "-", attack_none)]
    for q in (90, 80, 70, 60, 50):
        attacks.append(("jpeg", f"q{q}", lambda img, q=q: attack_jpeg(img, q)))
    for scale in (0.75, 0.5):
        attacks.append(("resize", f"{scale}x", lambda img, s=scale: attack_resize(img, s)))
    for frac in (0.10, 0.25):
        attacks.append((
            "crop-bottom-right", f"{int(frac * 100)}%",
            lambda img, f=frac: attack_crop_bottom_right(img, f),
        ))
    attacks.append(("crop-top-left", "128px", lambda img: attack_crop_top_left_px(img, 128)))
    for deg in (1, 2, 5):
        attacks.append(("rotate", f"{deg} deg", lambda img, d=deg: attack_rotate(img, d)))
    for factor, label in ((1.10, "+10%"), (0.90, "-10%")):
        attacks.append(("brightness", label, lambda img, f=factor: attack_brightness(img, f)))
    attacks.append(("gaussian-blur", "sigma=2", lambda img: attack_gaussian_blur(img, 2.0)))
    for sigma in (2.0, 5.0):
        attacks.append(("gaussian-noise", f"sigma={sigma:g}", lambda img, s=sigma: attack_gaussian_noise(img, s)))
    return attacks


# 使用者導向的分類（供前端把多個攻擊聚合成「JPEG / 縮放 / 裁切 / 旋轉 / 雜訊」燈號）
CATEGORY_LABELS = {
    "jpeg": "JPEG 壓縮",
    "resize": "縮放",
    "crop": "裁切",
    "rotate": "旋轉",
    "noise": "雜訊",
}


def certificate_suite():
    """
    穩健性證書用的精選攻擊電池（面向使用者、涵蓋常見真實通道、可快速跑完）。
    回傳 list[dict]，每項含 key / category / label / fn。
    """
    return [
        {"key": "jpeg_q30", "category": "jpeg", "label": "JPEG q30（社群平台重壓）",
         "fn": lambda img: attack_jpeg(img, 30)},
        {"key": "jpeg_q10", "category": "jpeg", "label": "JPEG q10（極端重壓）",
         "fn": lambda img: attack_jpeg(img, 10)},
        {"key": "resize_50", "category": "resize", "label": "縮放至 50%",
         "fn": lambda img: attack_resize(img, 0.5)},
        {"key": "crop_25", "category": "crop", "label": "裁切 25%（右下）",
         "fn": lambda img: attack_crop_bottom_right(img, 0.25)},
        {"key": "rotate_5", "category": "rotate", "label": "旋轉 5°",
         "fn": lambda img: attack_rotate(img, 5)},
        {"key": "noise_8", "category": "noise", "label": "高斯雜訊 σ=8",
         "fn": lambda img: attack_gaussian_noise(img, 8.0)},
    ]
