const MAX_AI_IMAGE_DIMENSION = 4096;
const SUPPORTED_AI_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp"
]);

function validateSupportedAiImageType(type) {
  const normalizedType = typeof type === "string" ? type.trim().toLowerCase() : "";
  if (!SUPPORTED_AI_IMAGE_TYPES.has(normalizedType)) {
    throw createAiImageDimensionError("请选择 PNG、JPG 或 WebP 图片。");
  }
  return normalizedType;
}

function validateAiImageDimensions(width, height) {
  const normalizedWidth = Math.round(Number(width));
  const normalizedHeight = Math.round(Number(height));
  if (
    !Number.isFinite(normalizedWidth)
    || normalizedWidth <= 0
    || !Number.isFinite(normalizedHeight)
    || normalizedHeight <= 0
  ) {
    throw createAiImageDimensionError("图片尺寸无效，请重新选择图片。");
  }
  if (
    normalizedWidth > MAX_AI_IMAGE_DIMENSION
    || normalizedHeight > MAX_AI_IMAGE_DIMENSION
  ) {
    throw createAiImageDimensionError(
      `图片尺寸为 ${normalizedWidth} × ${normalizedHeight}，当前最大支持 `
      + `${MAX_AI_IMAGE_DIMENSION} × ${MAX_AI_IMAGE_DIMENSION}，请缩小后重新上传。`
    );
  }
  return {
    width: normalizedWidth,
    height: normalizedHeight
  };
}

function createAiImageDimensionError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

if (typeof module !== "undefined") {
  module.exports = {
    MAX_AI_IMAGE_DIMENSION,
    validateAiImageDimensions,
    validateSupportedAiImageType
  };
}
