function createEditableAssetDescriptors(localAssets = []) {
  const ids = new Set();
  return localAssets.map((asset) => {
    const id = String(asset?.id || "").trim();
    if (!id) {
      throw new Error("切图资产 ID 不能为空");
    }
    if (ids.has(id)) {
      throw new Error(`切图资产 ID 重复：${id}`);
    }
    ids.add(id);
    return {
      id,
      name: String(asset.name || id),
      kind: String(asset.kind || asset.type || "asset"),
      type: String(asset.type || "image"),
      radius: Number(asset.radius) || 0,
      ...(asset.radii && typeof asset.radii === "object" ? {
        radii: normalizeEditableAssetRadii(asset.radii)
      } : {}),
      placement: { ...(asset.placement || {}) }
    };
  });
}

function selectCanonicalReferenceAssets(canonicalHtml, localAssets = []) {
  const referencedIds = new Set(
    [...String(canonicalHtml || "").matchAll(/\bdata-reference-asset=(["'])(.*?)\1/gi)]
      .map((match) => decodeHtmlAttribute(match[2]))
  );
  return localAssets.filter((asset) => referencedIds.has(String(asset?.id || "")));
}

function hydrateCanonicalAssetHtml(canonicalHtml, localAssets = []) {
  const assets = new Map();
  for (const asset of localAssets) {
    const id = String(asset?.id || "").trim();
    if (id && !assets.has(id)) {
      assets.set(id, asset);
    }
  }
  const unresolved = new Set();
  const hydrated = String(canonicalHtml || "").replace(
    /<img\b[^>]*\bdata-reference-asset=(["'])(.*?)\1[^>]*>/gi,
    (tag, _quote, rawId) => {
      const id = decodeHtmlAttribute(rawId);
      const asset = assets.get(id);
      if (!asset?.dataUrl) {
        unresolved.add(id);
        return tag;
      }
      if (/\ssrc\s*=/i.test(tag)) {
        return tag.replace(
          /\ssrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i,
          ` src="${escapeEditableAssetAttribute(asset.dataUrl)}"`
        );
      }
      return tag.replace(
        /<img/i,
        `<img src="${escapeEditableAssetAttribute(asset.dataUrl)}"`
      );
    }
  );
  if (unresolved.size) {
    const error = new Error(`无法读取切图资产：${[...unresolved].join("、")}`);
    error.name = "EditableAssetHydrationError";
    throw error;
  }
  return hydrated;
}

function dehydrateCanonicalAssetHtml(hydratedHtml) {
  return String(hydratedHtml || "").replace(/<img\b[^>]*>/gi, (tag) => {
    const idMatch = tag.match(/\bdata-reference-asset=(["'])(.*?)\1/i);
    if (!idMatch) return tag;
    const id = decodeHtmlAttribute(idMatch[2]);
    const src = `asset:${escapeEditableAssetAttribute(id)}`;
    if (/\ssrc\s*=/i.test(tag)) {
      return tag.replace(
        /\ssrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i,
        ` src="${src}"`
      );
    }
    return tag.replace(/<img/i, `<img src="${src}"`);
  });
}

function createEditablePreviewContextSignature(context = {}) {
  let hash = 2166136261;
  const append = (value) => {
    const text = String(value ?? "");
    const framed = `${text.length}:${text}|`;
    for (let index = 0; index < framed.length; index += 1) {
      hash ^= framed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  };
  append("ai-layer-preview-v2");
  append(context.sourceImageDataUrl);
  append(context.width);
  append(context.height);
  append(context.prompt);
  append(context.provider);
  append(context.model);
  const assets = Array.isArray(context.assets) ? context.assets : [];
  append(assets.length);
  for (const asset of assets) {
    const placement = asset?.placement || {};
    append(asset?.id);
    append(asset?.name);
    append(asset?.kind);
    append(asset?.type);
    append(asset?.radius);
    append(asset?.radii?.topLeft);
    append(asset?.radii?.topRight);
    append(asset?.radii?.bottomRight);
    append(asset?.radii?.bottomLeft);
    append(placement.x);
    append(placement.y);
    append(placement.width);
    append(placement.height);
    append(asset?.dataUrl);
  }
  return `${assets.length}:${(hash >>> 0).toString(36)}`;
}

function createReferenceAssetGeometryCorrections(referenceAssets = [], measurements = [], tolerance = 0.5) {
  const measuredById = new Map(measurements.map((item) => [String(item?.id || ""), item]));
  return referenceAssets.map((asset) => {
    const id = String(asset?.id || "");
    const placement = asset?.placement || {};
    const measured = measuredById.get(id);
    if (!measured) {
      throw new Error(`预览缺少切图节点：${id}`);
    }
    const deltaX = Number(placement.x) - Number(measured.x);
    const deltaY = Number(placement.y) - Number(measured.y);
    const translateX = Math.abs(deltaX) <= tolerance ? 0 : deltaX;
    const translateY = Math.abs(deltaY) <= tolerance ? 0 : deltaY;
    const sizeChanged = Math.abs(Number(placement.width) - Number(measured.width)) > tolerance
      || Math.abs(Number(placement.height) - Number(measured.height)) > tolerance;
    return {
      id,
      width: Number(placement.width),
      height: Number(placement.height),
      radius: Number(asset.radius) || 0,
      ...(asset.radii && typeof asset.radii === "object" ? {
        radii: normalizeEditableAssetRadii(asset.radii)
      } : {}),
      translateX: normalizeCorrectionNumber(translateX),
      translateY: normalizeCorrectionNumber(translateY),
      corrected: sizeChanged || translateX !== 0 || translateY !== 0
    };
  });
}

function chooseReferenceAssetOwnerCandidate(assetRect, candidates = [], minOverlapRatio = 0.5) {
  const asset = normalizeReferenceBounds(assetRect);
  if (!asset) return null;
  const centerX = asset.x + asset.width / 2;
  const centerY = asset.y + asset.height / 2;
  const assetArea = asset.width * asset.height;
  const threshold = Math.min(1, Math.max(0, Number(minOverlapRatio) || 0));

  return candidates
    .map((candidate) => ({
      candidate,
      rect: normalizeReferenceBounds(candidate?.rect)
    }))
    .filter(({ rect }) => rect
      && centerX >= rect.x
      && centerX <= rect.x + rect.width
      && centerY >= rect.y
      && centerY <= rect.y + rect.height
      && referenceBoundsIntersectionArea(asset, rect) / assetArea >= threshold)
    .sort((left, right) => {
      const areaDelta = referenceBoundsArea(left.rect) - referenceBoundsArea(right.rect);
      return areaDelta || Number(right.candidate?.depth || 0) - Number(left.candidate?.depth || 0);
    })[0]?.candidate || null;
}

function createReferenceAssetLocalGeometry(asset, containingBlock = {}) {
  const placement = asset?.placement || {};
  return {
    id: String(asset?.id || ""),
    left: normalizeCorrectionNumber(Number(placement.x) - Number(containingBlock.x || 0)),
    top: normalizeCorrectionNumber(Number(placement.y) - Number(containingBlock.y || 0)),
    width: normalizeCorrectionNumber(placement.width),
    height: normalizeCorrectionNumber(placement.height),
    radius: normalizeCorrectionNumber(asset?.radius),
    ...(asset?.radii && typeof asset.radii === "object" ? {
      radii: normalizeEditableAssetRadii(asset.radii)
    } : {})
  };
}

function normalizeReferenceBounds(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  const width = Number(value?.width);
  const height = Number(value?.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }
  return { x, y, width, height };
}

function referenceBoundsArea(rect) {
  return rect.width * rect.height;
}

function referenceBoundsIntersectionArea(left, right) {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return width * height;
}

function buildReferenceAssetCorrectionCss(corrections = []) {
  return corrections.map((item) => {
    const id = escapeCssAttributeValue(item.id);
    return [
      `.screen [data-reference-asset="${id}"]{`,
      `width:${normalizeCorrectionNumber(item.width)}px!important;`,
      `height:${normalizeCorrectionNumber(item.height)}px!important;`,
      `border-radius:${formatEditableAssetRadius(item)}!important;`,
      `transform:translate(${normalizeCorrectionNumber(item.translateX)}px,${normalizeCorrectionNumber(item.translateY)}px)!important;`,
      "transform-origin:top left!important;",
      "}"
    ].join("");
  }).join("\n");
}

function normalizeEditableAssetRadii(radii) {
  return {
    topLeft: normalizeCorrectionNumber(radii?.topLeft),
    topRight: normalizeCorrectionNumber(radii?.topRight),
    bottomRight: normalizeCorrectionNumber(radii?.bottomRight),
    bottomLeft: normalizeCorrectionNumber(radii?.bottomLeft)
  };
}

function formatEditableAssetRadius(item) {
  if (item?.radii && typeof item.radii === "object") {
    const radii = normalizeEditableAssetRadii(item.radii);
    return `${radii.topLeft}px ${radii.topRight}px ${radii.bottomRight}px ${radii.bottomLeft}px`;
  }
  return `${normalizeCorrectionNumber(item?.radius)}px`;
}

function normalizeCorrectionNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 1000) / 1000;
}

function escapeCssAttributeValue(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\d ")
    .replace(/\n/g, "\\a ");
}

function decodeHtmlAttribute(value) {
  return String(value || "")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function escapeEditableAssetAttribute(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

if (typeof module !== "undefined") {
  module.exports = {
    buildReferenceAssetCorrectionCss,
    chooseReferenceAssetOwnerCandidate,
    createEditableAssetDescriptors,
    createEditablePreviewContextSignature,
    createReferenceAssetLocalGeometry,
    createReferenceAssetGeometryCorrections,
    dehydrateCanonicalAssetHtml,
    hydrateCanonicalAssetHtml,
    selectCanonicalReferenceAssets
  };
}
