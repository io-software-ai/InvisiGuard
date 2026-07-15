/**
 * Client-side validation utilities for InvisiGuard
 * Provides pre-submission validation to catch errors before API calls
 */

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
// UTF-8 位元組上限（中文字約佔 3 bytes），與後端 params.MAX_TEXT_BYTES 一致。
// export 供 UI 元件共用，避免各處各寫一份而漂移。
export const MAX_TEXT_BYTES = 92;
// trustmark 軌把完整文字存伺服器登錄表（影像只嵌入短 ID），不受 92-byte 位元上限限制，
// 但仍設一個寬鬆的字元數上限避免濫用。與後端 routes.MAX_REGISTRY_TEXT_CHARS 一致。
export const MAX_REGISTRY_TEXT_CHARS = 2000;
export const ENGINE_CLASSIC = 'classic';
export const ENGINE_TRUSTMARK = 'trustmark';

/**
 * Validate image file type and size
 * @param {File} file - The file to validate
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateImageFile(file) {
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  // Check file type
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file format. Only PNG and JPG images are supported. Got: ${file.type}`
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size (${sizeMB}MB) exceeds maximum allowed size of 10MB`
    };
  }

  return { valid: true };
}

/**
 * Compute the UTF-8 byte length of a string (e.g. 中文字 each take 3 bytes)
 * @param {string} text - The text to measure
 * @returns {number} Number of UTF-8 bytes
 */
export function getUtf8ByteLength(text) {
  return new TextEncoder().encode(text ?? '').length;
}

/**
 * Validate watermark text
 * @param {string} text - The text to validate
 * @param {string} [engine='classic'] - 'classic' (92 UTF-8 bytes) or 'trustmark' (2000 chars, stored server-side)
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateWatermarkText(text, engine = ENGINE_CLASSIC) {
  if (!text || text.trim().length === 0) {
    return { valid: false, error: 'Watermark text cannot be empty' };
  }

  if (engine === ENGINE_TRUSTMARK) {
    const charLength = text.trim().length;
    if (charLength > MAX_REGISTRY_TEXT_CHARS) {
      return {
        valid: false,
        error: `Watermark text exceeds maximum length of ${MAX_REGISTRY_TEXT_CHARS} characters (got ${charLength} chars)`
      };
    }
    return { valid: true };
  }

  const byteLength = getUtf8ByteLength(text);
  if (byteLength > MAX_TEXT_BYTES) {
    return {
      valid: false,
      error: `Watermark text exceeds maximum length of ${MAX_TEXT_BYTES} UTF-8 bytes (got ${byteLength} bytes)`
    };
  }

  return { valid: true };
}

/**
 * Validate embed request (comprehensive check)
 * @param {File} file - Image file
 * @param {string} text - Watermark text
 * @param {string} [engine='classic'] - 'classic' or 'trustmark'
 * @returns {{valid: boolean, errors: string[]}} Validation result with all errors
 */
export function validateEmbedRequest(file, text, engine = ENGINE_CLASSIC) {
  const errors = [];

  const fileValidation = validateImageFile(file);
  if (!fileValidation.valid) {
    errors.push(fileValidation.error);
  }

  const textValidation = validateWatermarkText(text, engine);
  if (!textValidation.valid) {
    errors.push(textValidation.error);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate extract request (two files required)
 * @param {File} originalFile - Original embedded image
 * @param {File} suspectFile - Suspect image to compare
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
export function validateExtractRequest(originalFile, suspectFile) {
  const errors = [];

  const originalValidation = validateImageFile(originalFile);
  if (!originalValidation.valid) {
    errors.push(`Original image: ${originalValidation.error}`);
  }

  const suspectValidation = validateImageFile(suspectFile);
  if (!suspectValidation.valid) {
    errors.push(`Suspect image: ${suspectValidation.error}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate verify request (single file)
 * @param {File} file - Image file to verify
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateVerifyRequest(file) {
  return validateImageFile(file);
}

/**
 * Format file size in human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size (e.g., "2.5 MB")
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
