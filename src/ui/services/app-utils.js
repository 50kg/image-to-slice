function scalePlacement(base, screen) {
  const scaleX = screen.width / 390;
  const scaleY = screen.height / 844;
  return {
    x: Math.round(base.x * scaleX),
    y: Math.round(base.y * scaleY),
    width: Math.round(base.width * scaleX),
    height: Math.round(base.height * scaleY)
  };
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function normalizeWindowSize(width, height, defaults = { width: 1280, height: 860 }) {
  return {
    width: Math.round(clampNumber(Number(width), 360, 3200, defaults.width)),
    height: Math.round(clampNumber(Number(height), 240, 2200, defaults.height))
  };
}

function clampPreviewZoom(value) {
  return Math.min(4, Math.max(0.1, Number(value) || 1));
}

function calculatePreviewFitZoom(naturalWidth, naturalHeight, availableWidth, availableHeight) {
  if (!naturalWidth || !naturalHeight || !availableWidth || !availableHeight) {
    return 1;
  }
  return clampPreviewZoom(Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight));
}

function calculatePreviewPlacement({
  contentWidth = 0,
  contentHeight = 0,
  viewportWidth = 0,
  viewportHeight = 0
} = {}) {
  return {
    left: Math.max(0, ((Number(viewportWidth) || 0) - (Number(contentWidth) || 0)) / 2),
    top: Math.max(0, ((Number(viewportHeight) || 0) - (Number(contentHeight) || 0)) / 2)
  };
}

function normalizeStatusType(type) {
  if (type === true) return "error";
  return ["success", "info", "warning", "error"].includes(type) ? type : "info";
}

function getStatusPolicy(type) {
  const normalizedType = normalizeStatusType(type);
  const duration = normalizedType === "warning" ? 6000 : normalizedType === "error" ? 0 : 3000;
  return {
    type: normalizedType,
    duration,
    persistent: normalizedType === "error"
  };
}

function calculateAnchoredPreviewScroll({
  scrollLeft = 0,
  scrollTop = 0,
  pointerX = 0,
  pointerY = 0,
  oldZoom = 1,
  newZoom = 1
} = {}) {
  const previousZoom = clampPreviewZoom(oldZoom);
  const nextZoom = clampPreviewZoom(newZoom);
  const anchorX = Number(pointerX) || 0;
  const anchorY = Number(pointerY) || 0;
  const sourceX = ((Number(scrollLeft) || 0) + anchorX) / previousZoom;
  const sourceY = ((Number(scrollTop) || 0) + anchorY) / previousZoom;
  return {
    left: Math.max(0, sourceX * nextZoom - anchorX),
    top: Math.max(0, sourceY * nextZoom - anchorY)
  };
}

function readErrorMessage(value, fallback = "未知错误") {
  if (!value) {
    return fallback;
  }
  if (typeof value === "string") {
    return value;
  }
  if (value.message && typeof value.message === "string") {
    return value.message;
  }
  if (value.error && typeof value.error === "string") {
    return value.error;
  }
  if (value.error && value.error.message) {
    return value.error.message;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function readNetworkErrorMessage(error) {
  const message = readErrorMessage(error);
  if (error?.name === "AbortError" || /failed to fetch|networkerror|load failed|abort/i.test(message)) {
    return "本地后端未启动、无法连接或响应超时，请先运行 npm run api，再重新保存";
  }
  return message;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    }[character];
  });
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ bytes[index]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function sanitizeFilename(value) {
  return String(value || "asset")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "asset";
}

function isPointInsideRect(x, y, rect) {
  const tolerance = 2;
  return x >= rect.left - tolerance && x <= rect.right + tolerance &&
    y >= rect.top - tolerance && y <= rect.bottom + tolerance;
}

if (typeof module !== "undefined") {
  module.exports = {
    calculateAnchoredPreviewScroll,
    calculatePreviewPlacement,
    calculatePreviewFitZoom,
    clampNumber,
    clampPreviewZoom,
    crc32,
    escapeHtml,
    getStatusPolicy,
    isPointInsideRect,
    normalizeStatusType,
    normalizeWindowSize,
    readErrorMessage,
    readNetworkErrorMessage,
    sanitizeFilename,
    scalePlacement
  };
}
