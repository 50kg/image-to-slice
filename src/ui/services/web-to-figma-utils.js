function inferArrowIconFromText(value) {
  const text = String(value || "").replace(/\s+/g, "");
  if (!text || text.length > 3) {
    return "";
  }
  if (/^[›❯»>→➜➔]+$/.test(text)) {
    return "chevronright";
  }
  if (/^[‹❮«<←]+$/.test(text)) {
    return "chevronleft";
  }
  if (/^[⌄∨↓﹀]+$/.test(text)) {
    return "chevrondown";
  }
  if (/^[⌃∧↑︿]+$/.test(text)) {
    return "chevronup";
  }
  return "";
}

function safeLayerName(value) {
  const text = String(value || "layer")
    .replace(/\s+/g, "_")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return text || "layer";
}

function sanitizeHtmlPreviewForDisplay(html) {
  return String(html || "").replace(/<img\b[^>]*>/gi, (tag) => {
    const srcMatch = tag.match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const src = (srcMatch?.[1] || srcMatch?.[2] || srcMatch?.[3] || "").trim();
    return isFigmaImageDataUrl(src) || isSvgDataUrl(src) ? tag : "";
  });
}

function sanitizeEditableManifestForFigma(manifest) {
  if (!manifest || typeof manifest !== "object") {
    return manifest;
  }
  const dropped = [];
  const sanitizeNode = (node) => {
    if (!node || typeof node !== "object") {
      return null;
    }
    const type = String(node.type || "").toLowerCase();
    if (type === "image" && !isFigmaImageDataUrl(node.dataUrl)) {
      dropped.push(node.name || "image");
      return null;
    }
    if (type === "svg" && !String(node.svgData || "").trim()) {
      dropped.push(node.name || "svg");
      return null;
    }
    if (Array.isArray(node.children)) {
      node.children = node.children.map(sanitizeNode).filter(Boolean);
    }
    return node;
  };
  const nodes = (manifest.nodes || []).map(sanitizeNode).filter(Boolean);
  return {
    ...manifest,
    metadata: {
      ...(manifest.metadata || {}),
      droppedInvalidImageNodes: dropped.length
    },
    nodes
  };
}

async function prepareEditableManifestForFigma(manifest, convertRasterDataUrl) {
  const sourceImage = manifest?.sourceImage;
  let preparedManifest = manifest;
  if (sourceImage?.dataUrl && !isFigmaImageDataUrl(sourceImage.dataUrl)) {
    try {
      const dataUrl = await convertRasterDataUrl(sourceImage.dataUrl);
      if (!isFigmaImageDataUrl(dataUrl)) {
        throw new Error("转换结果不是 PNG 或 JPEG");
      }
      preparedManifest = {
        ...manifest,
        sourceImage: {
          ...sourceImage,
          dataUrl
        }
      };
    } catch (error) {
      throw new Error(`参考原图无法转换为 PNG 或 JPEG：${error?.message || String(error)}`);
    }
  }
  return sanitizeEditableManifestForFigma(preparedManifest);
}

function dedupeReferenceAssetNodes(nodes) {
  const seen = new Set();
  return nodes.filter((node) => {
    const assetId = String(node?.sourceAssetId || "").trim();
    if (!assetId) {
      return true;
    }
    const key = [assetId, node.x, node.y, node.width, node.height].join(":");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function sortEditableNodesByStackingOrder(nodes) {
  return (nodes || [])
    .map((node, index) => ({
      node,
      index,
      order: Number.isFinite(Number(node?.captureOrder)) ? Number(node.captureOrder) : index
    }))
    .sort((left, right) => left.order - right.order || left.index - right.index)
    .map(({ node }) => {
      const {
        captureZIndex,
        captureOrder,
        ...cleanNode
      } = node;
      return cleanNode;
    });
}

function resolveCapturedZIndex(style, inheritedZIndex = 0) {
  const rawValue = style?.zIndex ?? style?.["z-index"];
  const text = String(rawValue ?? "").trim();
  if (!text || text.toLowerCase() === "auto") {
    return inheritedZIndex;
  }
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) ? value : inheritedZIndex;
}

function resolveCapturedSemanticGroup(node, inheritedGroup = null) {
  const attributes = node?.attributes || {};
  const id = String(
    attributes["data-reference-owner-id"]
    || attributes.dataReferenceOwnerId
    || ""
  ).trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
    return inheritedGroup || null;
  }
  const name = String(
    attributes["data-reference-owner-name"]
    || attributes.dataReferenceOwnerName
    || id
  ).trim().slice(0, 80);
  return {
    id,
    name: name || id
  };
}

function resolveWebToFigmaAssetDataUrl(url, assets, baseHref = "") {
  const value = String(url || "").trim();
  if (!value || /^(?:linear|radial)-gradient\(/i.test(value)) {
    return "";
  }
  if (isFigmaImageDataUrl(value) || isSvgDataUrl(value)) {
    return value;
  }
  return normalizeWebToFigmaAssetDataUrl(findWebToFigmaAsset(value, assets, baseHref));
}

function isFigmaImageDataUrl(value) {
  return /^data:image\/(?:png|jpeg|jpg);base64,/i.test(String(value || "").trim());
}

function isSvgDataUrl(value) {
  return /^data:image\/svg\+xml(?:;charset=[^;,]+)?(?:;base64)?,/i.test(String(value || "").trim());
}

function decodeSvgDataUrl(value) {
  const text = String(value || "").trim();
  const commaIndex = text.indexOf(",");
  if (commaIndex < 0) {
    return "";
  }
  const meta = text.slice(0, commaIndex).toLowerCase();
  const payload = text.slice(commaIndex + 1);
  try {
    return meta.includes(";base64")
      ? decodeBase64Utf8(payload)
      : decodeURIComponent(payload);
  } catch (error) {
    return "";
  }
}

function findWebToFigmaAsset(url, assets, baseHref = "") {
  if (!assets || !url) {
    return null;
  }
  const candidates = new Set([
    url,
    decodeURIComponentSafe(url),
    stripCssUrlQuotes(url)
  ]);
  try {
    const resolved = new URL(url, baseHref);
    candidates.add(resolved.href);
    candidates.add(resolved.pathname);
    candidates.add(resolved.pathname.split("/").pop());
  } catch (error) {
    // Relative or synthetic asset URLs are still handled by direct lookup.
  }
  for (const key of candidates) {
    if (key && assets[key]) {
      return assets[key];
    }
  }
  for (const [key, asset] of Object.entries(assets)) {
    const normalizedKey = stripCssUrlQuotes(decodeURIComponentSafe(key));
    if (candidates.has(normalizedKey) || [...candidates].some((candidate) => candidate && normalizedKey.endsWith(candidate))) {
      return asset;
    }
  }
  return null;
}

function normalizeWebToFigmaAssetDataUrl(asset) {
  if (!asset) {
    return "";
  }
  const candidates = [
    asset.dataUrl,
    asset.dataURL,
    asset.base64Blob,
    asset.blob?.dataUrl,
    asset.blob?.dataURL,
    asset.blob?.base64Blob,
    asset.blob,
    asset
  ];
  const mimeType =
    asset.mimeType ||
    asset.type ||
    asset.blob?.type ||
    asset.contentType ||
    "image/png";
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const value = candidate.trim();
    if (isFigmaImageDataUrl(value) || isSvgDataUrl(value)) {
      return value;
    }
    if (/^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 80) {
      const mime = /svg/i.test(mimeType) ? "image/svg+xml" : (/jpe?g/i.test(mimeType) ? "image/jpeg" : "image/png");
      return `data:${mime};base64,${value.replace(/\s+/g, "")}`;
    }
  }
  return "";
}

function stripCssUrlQuotes(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "");
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch (error) {
    return String(value || "");
  }
}

function extractCssUrl(value) {
  const text = String(value || "").trim();
  if (!text || text === "none") {
    return "";
  }
  const match = text.match(/url\(\s*(["']?)(.*?)\1\s*\)/i);
  return match?.[2] || "";
}

function svgTextToDataUrl(svgText) {
  const text = String(svgText || "").trim();
  return `data:image/svg+xml;base64,${encodeBase64Utf8(text)}`;
}

function encodeBase64Utf8(value) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64");
  }
  return btoa(unescape(encodeURIComponent(value)));
}

function decodeBase64Utf8(value) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64").toString("utf8");
  }
  return decodeURIComponent(escape(atob(value)));
}

if (typeof module !== "undefined") {
  module.exports = {
    decodeSvgDataUrl,
    dedupeReferenceAssetNodes,
    extractCssUrl,
    inferArrowIconFromText,
    isFigmaImageDataUrl,
    isSvgDataUrl,
    normalizeWebToFigmaAssetDataUrl,
    prepareEditableManifestForFigma,
    resolveCapturedSemanticGroup,
    resolveCapturedZIndex,
    resolveWebToFigmaAssetDataUrl,
    safeLayerName,
    sanitizeEditableManifestForFigma,
    sanitizeHtmlPreviewForDisplay,
    sortEditableNodesByStackingOrder
  };
}
