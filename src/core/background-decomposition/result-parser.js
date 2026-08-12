const {
  ALLOWED_BACKGROUND_OVERLAY_KINDS,
  MAX_BACKGROUND_CANDIDATES,
  MAX_BACKGROUND_OVERLAYS,
  MIN_BACKGROUND_SIZE,
  MIN_OVERLAY_SIZE
} = require("./constants");
const { normalizeSliceAssetName } = require("../slice-asset-name");

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  const withoutFence = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回 JSON 对象");
  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch (error) {
    throw new Error(`JSON 解析失败：${error.message || String(error)}`);
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeBox(bbox, bounds, minimumSize) {
  const values = [bbox?.x, bbox?.y, bbox?.width, bbox?.height];
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  const [x, y, width, height] = values;
  const rawLeft = Math.min(x, x + width);
  const rawTop = Math.min(y, y + height);
  const rawRight = Math.max(x, x + width);
  const rawBottom = Math.max(y, y + height);
  const left = Math.round(clamp(rawLeft, bounds.x, bounds.x + bounds.width));
  const top = Math.round(clamp(rawTop, bounds.y, bounds.y + bounds.height));
  const right = Math.round(clamp(rawRight, bounds.x, bounds.x + bounds.width));
  const bottom = Math.round(clamp(rawBottom, bounds.y, bounds.y + bounds.height));
  if (right - left < minimumSize || bottom - top < minimumSize) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function normalizeConfidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(number, 0, 1) : null;
}

function parseBackgroundDecompositionText(text, { width, height }) {
  const sourceWidth = Math.round(Number(width));
  const sourceHeight = Math.round(Number(height));
  if (!Number.isFinite(sourceWidth) || sourceWidth < 1 || !Number.isFinite(sourceHeight) || sourceHeight < 1) {
    throw new Error("原图尺寸无效");
  }
  const value = extractJsonObject(text);
  const canvasBounds = { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  const backgrounds = [];
  (Array.isArray(value?.backgrounds) ? value.backgrounds : [])
    .slice(0, MAX_BACKGROUND_CANDIDATES)
    .forEach((background, backgroundIndex) => {
      const bbox = normalizeBox(background?.bbox, canvasBounds, MIN_BACKGROUND_SIZE);
      if (!bbox) return;
      const overlays = [];
      (Array.isArray(background?.overlays) ? background.overlays : [])
        .slice(0, MAX_BACKGROUND_OVERLAYS)
        .forEach((overlay, overlayIndex) => {
          const kind = String(overlay?.kind || "").trim();
          if (!ALLOWED_BACKGROUND_OVERLAY_KINDS.has(kind)) return;
          const overlayBox = normalizeBox(overlay?.bbox, bbox, MIN_OVERLAY_SIZE);
          if (!overlayBox) return;
          overlays.push({
            id: String(overlay?.id || "").trim().slice(0, 120) || `overlay_${String(overlayIndex + 1).padStart(2, "0")}`,
            name: String(overlay?.name || "").trim().slice(0, 120) || `覆盖层 ${overlayIndex + 1}`,
            kind,
            bbox: overlayBox,
            confidence: normalizeConfidence(overlay?.confidence),
            reason: String(overlay?.reason || "").trim().slice(0, 300)
          });
        });
      backgrounds.push({
        id: String(background?.id || "").trim().slice(0, 120) || `background_${String(backgroundIndex + 1).padStart(2, "0")}`,
        name: normalizeSliceAssetName(background?.name) || `slice_${String(backgroundIndex + 1).padStart(2, "0")}`,
        bbox,
        confidence: normalizeConfidence(background?.confidence),
        reason: String(background?.reason || "").trim().slice(0, 300),
        bakedVisuals: (Array.isArray(background?.bakedVisuals) ? background.bakedVisuals : [])
          .map((entry) => String(entry || "").trim().slice(0, 120))
          .filter(Boolean)
          .slice(0, 24),
        overlays
      });
    });
  return { backgrounds };
}

module.exports = {
  parseBackgroundDecompositionText
};
