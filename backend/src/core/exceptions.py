"""
核心浮水印演算法例外類別 (CORE CONTRACT v2)

v1 曾把錯誤訊息當字串回傳，導致 verify 出現假陽性；
v2 一律以例外表達失敗，絕不回傳錯誤訊息字串。
"""


class WatermarkError(Exception):
    """浮水印相關錯誤的基底類別。"""


class WatermarkNotFoundError(WatermarkError):
    """提取 / 解碼失敗：影像中找不到有效浮水印（含錯誤金鑰、封包驗證失敗）。"""


class MessageTooLongError(WatermarkError):
    """欲嵌入的訊息超過 MAX_TEXT_BYTES（UTF-8 位元組數）上限。"""


class ImageTooSmallError(WatermarkError):
    """影像太小，無法容納至少一個完整 tile。"""


class InputTooLargeError(WatermarkError):
    """輸入超過資源上限的基底類別（檔案位元組數 / 像素數）。"""


class FileTooLargeError(InputTooLargeError):
    """上傳檔案的位元組數超過 MAX_FILE_SIZE。"""


class ImageTooLargeError(InputTooLargeError):
    """解碼後的像素總數超過 MAX_PIXELS。"""


class EngineUnavailableError(WatermarkError):
    """請求的浮水印引擎不可用（例如未安裝深度學習軌的 trustmark 套件）。"""


class EmbedVerificationError(WatermarkError):
    """嵌入後的自我檢查失敗：對剛嵌入的乾淨影像立即提取，卻無法還原浮水印
    （例如影像太平坦、或深度學習模型對此內容嵌入訊號過弱）。避免回報一個
    永遠無法驗證的假成功。"""
