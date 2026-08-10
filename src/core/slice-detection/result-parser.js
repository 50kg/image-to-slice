const {
  ALLOWED_SLICE_ASSET_KINDS,
  MIN_SLICE_ASSET_SIZE
} = require("./constants");

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

function normalizeBBox(bbox, width, height) {
  const values = [bbox?.x, bbox?.y, bbox?.width, bbox?.height];
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  const [x, y, boxWidth, boxHeight] = values;
  if (Math.abs(boxWidth) < MIN_SLICE_ASSET_SIZE || Math.abs(boxHeight) < MIN_SLICE_ASSET_SIZE) return null;
  const rawLeft = Math.min(x, x + boxWidth);
  const rawTop = Math.min(y, y + boxHeight);
  const rawRight = Math.max(x, x + boxWidth);
  const rawBottom = Math.max(y, y + boxHeight);
  const left = Math.round(clamp(rawLeft, 0, width));
  const top = Math.round(clamp(rawTop, 0, height));
  const right = Math.round(clamp(rawRight, 0, width));
  const bottom = Math.round(clamp(rawBottom, 0, height));
  if (right - left < MIN_SLICE_ASSET_SIZE || bottom - top < MIN_SLICE_ASSET_SIZE) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function parseSliceAssetDetectionText(text, { width, height }) {
  const sourceWidth = Math.round(Number(width));
  const sourceHeight = Math.round(Number(height));
  if (!Number.isFinite(sourceWidth) || sourceWidth < 1 || !Number.isFinite(sourceHeight) || sourceHeight < 1) {
    throw new Error("原图尺寸无效");
  }
  const value = extractJsonObject(text);
  const sourceAssets = Array.isArray(value?.assets) ? value.assets : [];
  const assets = [];
  sourceAssets.forEach((asset, index) => {
    const kind = String(asset?.kind || "").trim();
    if (!ALLOWED_SLICE_ASSET_KINDS.has(kind)) return;
    const bbox = normalizeBBox(asset?.bbox, sourceWidth, sourceHeight);
    if (!bbox) return;
    const confidenceValue = Number(asset?.confidence);
    const defaultName = `${kind}_${String(index + 1).padStart(2, "0")}`;
    const modelName = String(asset?.name || "").trim().slice(0, 120);
    assets.push({
      name: modelName || defaultName,
      kind,
      bbox,
      confidence: Number.isFinite(confidenceValue) ? clamp(confidenceValue, 0, 1) : null,
      containsEmbeddedText: asset?.containsEmbeddedText === true,
      reason: String(asset?.reason || "").trim().slice(0, 300)
    });
  });
  return { assets };
}

module.exports = {
  parseSliceAssetDetectionText
};
