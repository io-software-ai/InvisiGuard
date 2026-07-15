import cv2
import numpy as np
from fastapi import UploadFile

from src.core import params
from src.core.exceptions import FileTooLargeError, ImageTooLargeError

class ImageProcessor:
    @staticmethod
    async def load_image(file: UploadFile) -> np.ndarray:
        """
        從 FastAPI 的 UploadFile 物件異步加載圖像到 numpy 陣列 (BGR 格式)。

        Args:
            file (UploadFile): 用戶上傳的圖像文件。

        Returns:
            np.ndarray: 以 BGR 色彩空間表示的圖像 numpy 陣列。

        Raises:
            FileTooLargeError: 上傳檔案位元組數超過 MAX_FILE_SIZE。
            ImageTooLargeError: 解碼後像素數超過 MAX_PIXELS。
            ValueError: 無法解碼圖像。
        """
        # 守門一（前置）：若 multipart part 已帶 Content-Length，未讀入記憶體前就先擋掉
        # 過大的請求體，避免 read() 把數 GB 內容整包載入 RAM (DoS)。
        declared_size = getattr(file, "size", None)
        if declared_size is not None and declared_size > params.MAX_FILE_SIZE:
            raise FileTooLargeError(f"{declared_size} bytes > {params.MAX_FILE_SIZE}")

        # 異步讀取上傳文件的內容
        contents = await file.read()

        # 守門一（後置）：實際位元組數再檢查一次（size 可能為 None 或被偽造）。
        if len(contents) > params.MAX_FILE_SIZE:
            raise FileTooLargeError(f"{len(contents)} bytes > {params.MAX_FILE_SIZE}")

        # 將原始二進制數據轉換為 numpy 陣列
        nparr = np.frombuffer(contents, np.uint8)
        # 使用 OpenCV 從 numpy 陣列中解碼圖像。IMREAD_COLOR 表示以彩色圖像加載。
        # 注意：imdecode 會在此配置完整像素緩衝，故壓縮炸彈（小檔高解析）仍會短暫佔用
        # 記憶體；MAX_FILE_SIZE 限制了壓縮前上限，MAX_PIXELS 為解碼後的第二道防線。
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("無法解碼圖像")

        # 守門二：解碼後的像素總數不得超過上限，避免超大解析度圖像耗盡記憶體。
        h, w = img.shape[:2]
        if w * h > params.MAX_PIXELS:
            raise ImageTooLargeError(f"{w}x{h} = {w * h} pixels > {params.MAX_PIXELS}")

        return img

    @staticmethod
    def save_image(image: np.ndarray, path: str) -> str:
        """
        將 numpy 陣列保存為圖像文件。

        Args:
            image (np.ndarray): 要保存的圖像。
            path (str): 保存路徑。

        Returns:
            str: 保存文件的路徑。
        """
        cv2.imwrite(path, image)
        return path
