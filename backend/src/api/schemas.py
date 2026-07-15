from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

# Error Response Models
class ErrorResponse(BaseModel):
    """Standard error response structure for all API errors"""
    status: str = "error"
    error_code: str = Field(..., description="Machine-readable error identifier")
    message: str = Field(..., description="Human-readable error description")
    details: Optional[Dict[str, Any]] = Field(None, description="Additional error context")
    suggestion: Optional[str] = Field(None, description="Actionable guidance for the user")

class ValidationError(ErrorResponse):
    """Error response for input validation failures"""
    field: str = Field(..., description="Field that failed validation")
    value_provided: Optional[Any] = Field(None, description="Invalid value submitted")
    expected: str = Field(..., description="Expected format/range description")

class ProcessingError(ErrorResponse):
    """Error response for image/watermark processing failures"""
    stage: str = Field(..., description="Processing stage that failed")
    recoverable: bool = Field(..., description="Whether operation can be retried")
    technical_details: Optional[str] = Field(None, description="Technical error details for debugging")

class WatermarkResponseData(BaseModel):
    image_url: str
    signal_map_url: Optional[str] = None
    psnr: float
    ssim: float
    engine: Optional[str] = None            # "classic" | "trustmark"
    watermark_id: Optional[str] = None      # 僅 trustmark 軌回傳（登錄表短 ID）
    # certify=true 時附上實測穩健性證書（攻擊電池逐項存活結果 + 分類燈號），
    # 內容依情境而異，用彈性 Dict 承接。
    robustness: Optional[Dict[str, Any]] = None

class WatermarkResponse(BaseModel):
    status: str = "success"
    data: WatermarkResponseData

class ExtractionDebugInfo(BaseModel):
    status: Optional[str] = None  # aligned / unaligned_fallback / not_found
    aligned_image_url: Optional[str] = None
    matches_found: Optional[int] = None

class ExtractionResponseData(BaseModel):
    decoded_text: str
    confidence: float
    is_match: bool
    debug_info: Optional[ExtractionDebugInfo] = None

class ExtractionResponse(BaseModel):
    status: str = "success"
    data: ExtractionResponseData

class VerificationResponseData(BaseModel):
    verified: bool
    watermark_text: Optional[str]
    confidence: float
    # v2: 擷取結果的 metadata 內容依情境而異（成功時含 phase/origin/tiles 等診斷欄位，
    # 失敗時只有 method/note），改用彈性 Dict 承接，避免和 core 契約的欄位耦合過緊。
    metadata: Optional[Dict[str, Any]] = None

class VerificationResponse(BaseModel):
    status: str = "success"
    data: VerificationResponseData
