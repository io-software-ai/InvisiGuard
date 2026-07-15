from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from src.api.schemas import (
    WatermarkResponse, ExtractionResponse, WatermarkResponseData,
    ExtractionResponseData, ExtractionDebugInfo, VerificationResponse, VerificationResponseData,
    ErrorResponse, ValidationError, ProcessingError
)
from src.core import params
from src.core.exceptions import (
    ImageTooSmallError, MessageTooLongError, FileTooLargeError, ImageTooLargeError,
    EngineUnavailableError, EmbedVerificationError,
)
from src.core.processor import ImageProcessor
from src.services.watermark import WatermarkService, VALID_ENGINES, TRUSTMARK
from src.utils.logger import get_logger, log_request_context, log_error_with_context, log_validation_error, log_success_with_metrics
import time

# trustmark 軌把完整文字存伺服器登錄表，故不受 92-byte 位元上限限制；
# 仍設一個寬鬆上限避免濫用（僅作用於 trustmark 軌）。
MAX_REGISTRY_TEXT_CHARS = 2000

router = APIRouter()
watermark_service = WatermarkService()
logger = get_logger(__name__)

# Allowed file types
ALLOWED_CONTENT_TYPES = ["image/png", "image/jpeg", "image/jpg"]


def _validate_engine(engine: str):
    """檢查 engine 是否為合法值；不合法回傳 ValidationError，合法回傳 None。"""
    if engine not in VALID_ENGINES:
        log_validation_error(logger, "engine", engine, f"One of {VALID_ENGINES}")
        return ValidationError(
            error_code="INVALID_ENGINE",
            message=f"Unknown watermark engine: {engine}",
            field="engine",
            value_provided=engine,
            expected=f"One of: {', '.join(VALID_ENGINES)}",
            suggestion="Use 'classic' (high capacity, crop-resilient) or 'trustmark' (survives JPEG/resize)"
        )
    return None


def _engine_unavailable_response(engine: str, err: Exception):
    """深度學習軌未安裝時的 503 回應。"""
    log_error_with_context(logger, "ENGINE_UNAVAILABLE", "Requested engine is unavailable", err, engine=engine)
    error = ProcessingError(
        error_code="ENGINE_UNAVAILABLE",
        message=f"The '{engine}' engine is not available on this server",
        stage="engine_selection",
        recoverable=False,
        details={"engine": engine},
        suggestion="Install the deep-learning dependencies (requirements-dl.txt) or use engine='classic'"
    )
    return JSONResponse(status_code=503, content=error.dict())


def _validate_content_type(field: str, content_type: str):
    """檢查 content-type 是否為允許的圖像格式；不合法時回傳 ValidationError，合法則回傳 None。"""
    if content_type not in ALLOWED_CONTENT_TYPES:
        log_validation_error(logger, field, content_type, f"One of {ALLOWED_CONTENT_TYPES}")
        return ValidationError(
            error_code="INVALID_FILE_FORMAT",
            message="Only PNG and JPG images are supported",
            field=field,
            value_provided=content_type,
            expected=f"One of: {', '.join(ALLOWED_CONTENT_TYPES)}",
            suggestion="Please convert your image to PNG or JPG format and try again"
        )
    return None


async def _load_image_or_error(file: UploadFile, field: str):
    """
    載入上傳圖像，並將 ImageProcessor 拋出的檔案過大 / 像素過多 / 解碼失敗
    統一轉換為結構化的 400 錯誤回應。

    Returns:
        (image, error_response)：成功時 error_response 為 None；
        失敗時 image 為 None，error_response 為可直接回傳的 JSONResponse。
    """
    try:
        image = await ImageProcessor.load_image(file)
        return image, None
    except FileTooLargeError:
        log_validation_error(logger, field, file.filename, f"File size <= {params.MAX_FILE_SIZE} bytes")
        error = ValidationError(
            error_code="FILE_TOO_LARGE",
            message=f"Uploaded file exceeds the {params.MAX_FILE_SIZE // (1024 * 1024)}MB limit",
            field=field,
            value_provided=file.filename,
            expected=f"File size <= {params.MAX_FILE_SIZE} bytes",
            suggestion="Please upload a smaller image file"
        )
        return None, JSONResponse(status_code=400, content=error.dict())
    except ImageTooLargeError:
        log_validation_error(logger, field, file.filename, f"Pixel count <= {params.MAX_PIXELS}")
        error = ValidationError(
            error_code="IMAGE_TOO_LARGE",
            message=f"Image exceeds the maximum of {params.MAX_PIXELS} pixels",
            field=field,
            value_provided=file.filename,
            expected=f"Pixel count <= {params.MAX_PIXELS}",
            suggestion="Please upload a lower resolution image"
        )
        return None, JSONResponse(status_code=400, content=error.dict())
    except Exception as e:
        # 無法解碼（損壞檔案、非圖像內容）等其餘失敗
        log_error_with_context(
            logger, "IMAGE_DECODE_ERROR", "Could not decode the uploaded image", e,
            file_name=file.filename, file_type=file.content_type
        )
        error = ProcessingError(
            error_code="IMAGE_DECODE_ERROR",
            message="Could not decode the uploaded image",
            stage="image_loading",
            recoverable=False,
            details={"file_name": file.filename, "content_type": file.content_type},
            suggestion="The image file may be corrupted. Try uploading a different image"
        )
        return None, JSONResponse(status_code=400, content=error.dict())


@router.get("/health")
async def health_check():
    return {"status": "ok", "service": "InvisiGuard API"}

@router.post("/embed", response_model=WatermarkResponse)
async def embed_watermark(
    file: UploadFile = File(...),
    text: str = Form(...),
    engine: str = Form("classic"),
    certify: bool = Form(False)
):
    start_time = time.time()

    # Log request context
    log_request_context(
        logger,
        "/v1/embed",
        file_name=file.filename,
        file_type=file.content_type,
        text_length=len(text)
    )

    try:
        # Validate engine
        engine_error = _validate_engine(engine)
        if engine_error:
            return JSONResponse(status_code=400, content=engine_error.dict())

        # T007: Validate file type
        type_error = _validate_content_type("file", file.content_type)
        if type_error:
            return JSONResponse(status_code=400, content=type_error.dict())

        # T008: Validate text field (non-empty, trimmed)
        if not text or text.strip() == "":
            log_validation_error(logger, "text", text, "Non-empty string")
            error = ValidationError(
                error_code="EMPTY_WATERMARK_TEXT",
                message="Watermark text cannot be empty",
                field="text",
                value_provided=text,
                expected="Non-empty string",
                suggestion="Please enter the text you want to embed as a watermark"
            )
            return JSONResponse(status_code=400, content=error.dict())

        # trustmark 軌：文字存登錄表，長度不受 92-byte 限制，但設寬鬆上限避免濫用
        if engine == TRUSTMARK and len(text.strip()) > MAX_REGISTRY_TEXT_CHARS:
            log_validation_error(logger, "text", len(text), f"<= {MAX_REGISTRY_TEXT_CHARS} chars")
            error = ValidationError(
                error_code="TEXT_TOO_LONG",
                message="Watermark text is too long",
                field="text",
                value_provided=f"{len(text)} chars",
                expected=f"<= {MAX_REGISTRY_TEXT_CHARS} characters",
                suggestion=f"Please shorten your text to at most {MAX_REGISTRY_TEXT_CHARS} characters"
            )
            return JSONResponse(status_code=400, content=error.dict())

        # T006: Load image (含檔案大小 / 像素數 / 解碼檢查，Content-Type 由 FastAPI/Starlette 自動處理)
        image, load_error = await _load_image_or_error(file, "file")
        if load_error:
            return load_error

        # Process watermark embedding
        try:
            result = await watermark_service.embed(image, text.strip(), engine=engine, certify=certify)
        except EngineUnavailableError as e:
            return _engine_unavailable_response(engine, e)
        except EmbedVerificationError as e:
            log_error_with_context(
                logger, "EMBED_NOT_RECOVERABLE", "Embed self-check failed", e, engine=engine
            )
            error = ProcessingError(
                error_code="EMBED_NOT_RECOVERABLE",
                message="The watermark could not be reliably embedded in this image",
                stage="watermark_embedding",
                recoverable=True,
                details={"engine": engine},
                suggestion="Try a more textured image, or use the 'classic' engine"
            )
            return JSONResponse(status_code=422, content=error.dict())
        except MessageTooLongError as e:
            log_error_with_context(
                logger, "TEXT_TOO_LONG", "Watermark text is too long to embed", e,
                text_length=len(text)
            )
            error = ValidationError(
                error_code="TEXT_TOO_LONG",
                message="Watermark text is too long to embed",
                field="text",
                value_provided=text,
                expected=f"UTF-8 encoded text <= {params.MAX_TEXT_BYTES} bytes",
                suggestion=f"Please shorten your text to at most {params.MAX_TEXT_BYTES} UTF-8 bytes"
            )
            return JSONResponse(status_code=400, content=error.dict())
        except ImageTooSmallError as e:
            log_error_with_context(
                logger, "IMAGE_TOO_SMALL", "Image is too small to embed a watermark", e
            )
            error = ValidationError(
                error_code="IMAGE_TOO_SMALL",
                message="Image is too small to embed a watermark",
                field="file",
                value_provided=file.filename,
                expected=f"Image dimensions >= {params.MIN_IMAGE_DIM}x{params.MIN_IMAGE_DIM}",
                suggestion=f"Please upload an image at least {params.MIN_IMAGE_DIM}x{params.MIN_IMAGE_DIM} pixels"
            )
            return JSONResponse(status_code=400, content=error.dict())
        except Exception as e:
            log_error_with_context(
                logger,
                "INTERNAL_SERVER_ERROR",
                "Unexpected error during watermark embedding",
                e,
                text_length=len(text)
            )
            error = ProcessingError(
                error_code="INTERNAL_SERVER_ERROR",
                message="An unexpected error occurred while embedding the watermark",
                stage="watermark_embedding",
                recoverable=True,
                # 不外洩內部例外字串（已由上方 log_error_with_context 記錄於伺服器端）
                suggestion="Please try again. If the problem persists, contact support"
            )
            return JSONResponse(status_code=500, content=error.dict())

        # Log success
        duration_ms = (time.time() - start_time) * 1000
        log_success_with_metrics(
            logger,
            "embed",
            {
                "psnr": result.get("psnr"),
                "ssim": result.get("ssim"),
                "duration_ms": duration_ms
            }
        )

        return WatermarkResponse(
            status="success",
            data=WatermarkResponseData(**result)
        )

    except Exception as e:
        # Catch-all for unexpected errors
        log_error_with_context(logger, "UNEXPECTED_ERROR", "Unhandled exception in embed endpoint", e)
        error = ErrorResponse(
            error_code="UNEXPECTED_ERROR",
            message="An unexpected error occurred",
            suggestion="Please try again or contact support if the problem persists"
        )
        return JSONResponse(status_code=500, content=error.dict())

@router.post("/extract", response_model=ExtractionResponse)
async def extract_watermark(
    original_file: UploadFile = File(...),
    suspect_file: UploadFile = File(...),
    engine: str = Form("classic")
):
    start_time = time.time()

    log_request_context(
        logger,
        "/v1/extract",
        original_file_name=original_file.filename,
        original_file_type=original_file.content_type,
        suspect_file_name=suspect_file.filename,
        suspect_file_type=suspect_file.content_type
    )

    try:
        # 驗證 engine 與檔案類型（與 /embed 同級的結構化錯誤）
        engine_error = _validate_engine(engine)
        if engine_error:
            return JSONResponse(status_code=400, content=engine_error.dict())
        type_error = _validate_content_type("original_file", original_file.content_type)
        if type_error:
            return JSONResponse(status_code=400, content=type_error.dict())
        type_error = _validate_content_type("suspect_file", suspect_file.content_type)
        if type_error:
            return JSONResponse(status_code=400, content=type_error.dict())

        # 載入影像（含檔案大小 / 像素數 / 解碼檢查）
        original, load_error = await _load_image_or_error(original_file, "original_file")
        if load_error:
            return load_error
        suspect, load_error = await _load_image_or_error(suspect_file, "suspect_file")
        if load_error:
            return load_error

        # Process extraction
        try:
            result = await watermark_service.extract(original, suspect, engine=engine)
        except EngineUnavailableError as e:
            return _engine_unavailable_response(engine, e)
        except Exception as e:
            log_error_with_context(
                logger, "WATERMARK_EXTRACTION_FAILED", "Watermark extraction failed", e
            )
            error = ProcessingError(
                error_code="WATERMARK_EXTRACTION_FAILED",
                message="Failed to extract watermark from image",
                stage="watermark_extraction",
                recoverable=True,
                details={"error_message": str(e)},
                suggestion="The image may not contain a watermark, or it may be too damaged to extract"
            )
            return JSONResponse(status_code=500, content=error.dict())

        # Log success
        duration_ms = (time.time() - start_time) * 1000
        log_success_with_metrics(
            logger,
            "extract",
            {
                "is_match": result.get("is_match"),
                "confidence": result.get("confidence"),
                "duration_ms": duration_ms
            }
        )

        return ExtractionResponse(
            status="success",
            data=ExtractionResponseData(
                # decoded_text 對應 schema 的 str 型別，擷取失敗時以空字串表示「無內容」
                decoded_text=result["extracted_text"] or "",
                confidence=result["confidence"],
                is_match=result["is_match"],
                # 回傳對齊狀態供前端顯示（aligned / unaligned_fallback / not_found）
                debug_info=ExtractionDebugInfo(status=result["status"])
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        log_error_with_context(logger, "UNEXPECTED_ERROR", "Unhandled exception in extract endpoint", e)
        error = ErrorResponse(
            error_code="UNEXPECTED_ERROR",
            message="An unexpected error occurred",
            suggestion="Please try again or contact support if the problem persists"
        )
        return JSONResponse(status_code=500, content=error.dict())

@router.post("/verify", response_model=VerificationResponse)
async def verify_watermark(
    image: UploadFile = File(...),
    engine: str = Form("classic")
):
    start_time = time.time()

    # Log request context
    log_request_context(
        logger,
        "/v1/verify",
        file_name=image.filename,
        file_type=image.content_type
    )

    try:
        # Validate engine
        engine_error = _validate_engine(engine)
        if engine_error:
            return JSONResponse(status_code=400, content=engine_error.dict())

        # T043: Validate image file
        type_error = _validate_content_type("image", image.content_type)
        if type_error:
            return JSONResponse(status_code=400, content=type_error.dict())

        # Load image（含檔案大小 / 像素數 / 解碼檢查）
        suspect, load_error = await _load_image_or_error(image, "image")
        if load_error:
            return load_error

        # Process verification
        try:
            result = await watermark_service.verify(suspect, engine=engine)
        except EngineUnavailableError as e:
            return _engine_unavailable_response(engine, e)
        except ValueError as e:
            log_error_with_context(
                logger,
                "WATERMARK_VERIFICATION_FAILED",
                "Watermark verification failed",
                e,
                file_name=image.filename
            )
            # T042: Structured error response
            error = ProcessingError(
                error_code="WATERMARK_VERIFICATION_FAILED",
                message="Failed to verify watermark in image",
                stage="watermark_verification",
                recoverable=True,
                details={"error_message": str(e)},
                suggestion="The image may not contain a watermark, or it may be too damaged to extract"
            )
            return JSONResponse(status_code=500, content=error.dict())
        except Exception as e:
            log_error_with_context(
                logger,
                "INTERNAL_SERVER_ERROR",
                "Unexpected error during watermark verification",
                e,
                file_name=image.filename
            )
            error = ProcessingError(
                error_code="INTERNAL_SERVER_ERROR",
                message="An unexpected error occurred during verification",
                stage="watermark_verification",
                recoverable=True,
                # 不外洩內部例外字串（已由上方 log_error_with_context 記錄於伺服器端）
                suggestion="Please try again. If the problem persists, contact support"
            )
            return JSONResponse(status_code=500, content=error.dict())

        # Log success
        duration_ms = (time.time() - start_time) * 1000
        log_success_with_metrics(
            logger,
            "verify",
            {
                "verified": result.get("verified"),
                "confidence": result.get("confidence"),
                "duration_ms": duration_ms
            }
        )

        return VerificationResponse(
            status="success",
            data=VerificationResponseData(**result)
        )

    except Exception as e:
        # Catch-all for unexpected errors
        log_error_with_context(logger, "UNEXPECTED_ERROR", "Unhandled exception in verify endpoint", e)
        error = ErrorResponse(
            error_code="UNEXPECTED_ERROR",
            message="An unexpected error occurred",
            suggestion="Please try again or contact support if the problem persists"
        )
        return JSONResponse(status_code=500, content=error.dict())
