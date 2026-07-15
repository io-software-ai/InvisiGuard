"""
幾何對齊處理器 (CORE CONTRACT v2)

只保留 ORB + RANSAC 的影像對齊功能，供「有原圖」的比對流程使用。
（v1 的 DFT 同步模板已移除：盲對齊改由 extraction 的相位 / tile 原點掃描負責。）
"""

from typing import Optional, Tuple

import cv2
import numpy as np


class GeometryProcessor:
    def __init__(self):
        # 初始化 ORB 偵測器，並調整參數以提高穩健性。
        # ORB (Oriented FAST and Rotated BRIEF) 是一種用於偵測影像中特徵點的演算法，
        # 它對於旋轉和縮放等影像變化具有良好的抵抗能力。
        self.orb = cv2.ORB_create(
            nfeatures=5000,
            scaleFactor=1.2,
            nlevels=8,
            edgeThreshold=31,
            firstLevel=0,
            WTA_K=2,
            scoreType=cv2.ORB_HARRIS_SCORE,
            patchSize=31,
            fastThreshold=20
        )
        # 初始化 BFMatcher (Brute-Force Matcher)，用於特徵點匹配。
        # cv2.NORM_HAMMING 適用於 ORB 等二進位描述符。
        # crossCheck=True 表示只有當兩張影像中的特徵點互相匹配時，才視為一個有效的匹配。
        self.matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)

    def extract_features(self, image: np.ndarray) -> Tuple[Tuple[cv2.KeyPoint], np.ndarray]:
        """
        從影像中提取 ORB 關鍵點和描述符。
        """
        # 如果是彩色影像，先轉換為灰階。
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image

        keypoints, descriptors = self.orb.detectAndCompute(gray, None)
        return keypoints, descriptors

    def align_image(self, original: np.ndarray, suspect: np.ndarray) -> Optional[np.ndarray]:
        """
        使用 ORB + RANSAC 將可疑影像對齊到原始影像的幾何形狀。
        返回對齊後的可疑影像版本；無法對齊時返回 None。
        """
        # 1. 提取特徵點和描述符
        kp1, des1 = self.extract_features(original)
        kp2, des2 = self.extract_features(suspect)

        # 找不到描述符，無法對齊。
        if des1 is None or des2 is None:
            return None

        # 2. 匹配特徵點
        matches = self.matcher.match(des1, des2)

        # 根據距離對匹配結果進行排序
        matches = sorted(matches, key=lambda x: x.distance)

        # 保留最佳的匹配 (例如，前15%或至少10個)
        num_good_matches = int(len(matches) * 0.15)
        num_good_matches = max(num_good_matches, 10)

        if len(matches) < num_good_matches:
            good_matches = matches
        else:
            good_matches = matches[:num_good_matches]

        # 沒有足夠的匹配來計算單應性矩陣。
        if len(good_matches) < 4:
            return None

        # 3. 提取良好匹配的位置
        # kp1 是原始影像, kp2 是可疑影像
        # 我們要找到一個單應性矩陣 H，將可疑影像 (kp2) 的點映射到原始影像 (kp1) 的點
        src_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)

        # 4. 尋找單應性矩陣 (Homography)
        # RANSAC 是一種迭代方法，用於從包含“局外點”的觀測數據集中估計數學模型的參數。
        M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)

        # 單應性矩陣計算失敗。
        if M is None:
            return None

        # 5. 透視變換
        # 使用計算出的單應性矩陣 M，將可疑影像進行透視變換，使其與原始影像對齊。
        h, w = original.shape[:2]
        aligned_img = cv2.warpPerspective(suspect, M, (w, h))

        return aligned_img
