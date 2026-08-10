const {
  isFigmaMixedValue
} = require("./figma-frame-serializer");

const IMAGE_SIGNATURES = [
  { bytes: [0x89, 0x50, 0x4e, 0x47], format: "png", mimeType: "image/png" },
  { bytes: [0xff, 0xd8, 0xff], format: "jpg", mimeType: "image/jpeg" },
  { bytes: [0x47, 0x49, 0x46, 0x38], format: "gif", mimeType: "image/gif" }
];

async function extractFigmaFrameAssets({ figmaApi, frame, manifest }) {
  const assets = [];
  const warnings = [];
  const imageAssets = new Map();
  const reservedFilenames = new Set();
  const framePath = String(frame?.name || "Frame");

  const rootReplaced = await processNode(frame, manifest?.screen, framePath);
  if (!rootReplaced) await visitChildren(frame, manifest?.nodes || [], framePath);
  return { assets, warnings };

  async function visitChildren(node, manifestNodes, path) {
    const children = Array.from(node?.children || []);
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      const manifestNode = manifestNodes[index];
      const childPath = `${path}/${child.name || child.type || "Node"}`;
      const replaced = await processNode(child, manifestNode, childPath);
      if (!replaced) await visitChildren(child, manifestNode?.children || [], childPath);
    }
  }

  async function processNode(node, manifestNode, path) {
    const renderFormat = nodeRenderFormat(node);
    try {
      if (renderFormat === "png") {
        assets.push(await exportNodePng(node, manifestNode, reserveFilename));
      } else if (renderFormat === "svg") {
        assets.push(await exportNodeSvg(node, manifestNode, reserveFilename));
      } else {
        await extractImageFills(node, manifestNode, path);
      }
    } catch (error) {
      if (renderFormat !== null && manifestNode && typeof manifestNode === "object") {
        manifestNode.replacementFailed = true;
      }
      warnings.push(`${path}: ${error.message || String(error)}`);
    }
    return renderFormat !== null;
  }

  async function extractImageFills(node, manifestNode, path) {
    for (const fill of Array.from(node?.fills || [])) {
      if (!isOriginalImageFill(fill)) continue;
      const imageHash = String(fill.imageHash || "");
      if (!imageHash) continue;
      if (!imageAssets.has(imageHash)) {
        imageAssets.set(imageHash, readImageFill({ imageHash, manifestNode, path }));
      }
      const asset = await imageAssets.get(imageHash);
      if (asset && !assets.includes(asset)) assets.push(asset);
    }
  }

  async function readImageFill({ imageHash, manifestNode, path }) {
    const image = figmaApi.getImageByHash(imageHash);
    if (!image) throw new Error(`未找到图片资源 ${imageHash}`);
    const bytes = await image.getBytesAsync();
    let intrinsicWidth = null;
    let intrinsicHeight = null;
    if (typeof image.getSizeAsync === "function") {
      try {
        const size = await image.getSizeAsync();
        if (Number.isFinite(Number(size?.width))) intrinsicWidth = Number(size.width);
        if (Number.isFinite(Number(size?.height))) intrinsicHeight = Number(size.height);
      } catch (_error) {
        warnings.push(`${path}: 图片原始尺寸读取失败，已省略`);
      }
    }
    const fileType = detectImageFileType(bytes);
    const name = sanitizeAssetName(manifestNode?.name || path);
    return {
      nodeId: null,
      imageHash,
      name,
      filename: reserveFilename(name, "img", imageHash, fileType.format),
      kind: "image-fill",
      format: fileType.format,
      mimeType: fileType.mimeType,
      intrinsicWidth,
      intrinsicHeight,
      bytes
    };
  }

  function reserveFilename(name, kind, identifier, format) {
    const stem = `${sanitizeAssetName(name)}--${kind}-${sanitizeFilenameToken(identifier)}`;
    let filename = `${stem}.${format}`;
    let counter = 2;
    while (reservedFilenames.has(filename)) {
      filename = `${stem}--${counter}.${format}`;
      counter += 1;
    }
    reservedFilenames.add(filename);
    return filename;
  }
}

function isOriginalImageFill(fill) {
  if (fill?.type !== "IMAGE") return false;
  return ["FILL", "FIT", "TILE"].includes(String(fill.scaleMode || "").toUpperCase());
}

function nodeRenderFormat(node) {
  if (hasMixedTextStyle(node)) return "svg";
  if (hasUnstableImagePaint(node)) return "png";
  if (isVectorReplacement(node)) return "svg";
  if (isUnsupportedLeaf(node)) return "png";
  return null;
}

function hasUnstableImagePaint(node) {
  const visibleFills = Array.isArray(node?.fills)
    ? node.fills.filter((fill) => fill?.visible !== false)
    : [];
  const imageFills = visibleFills.filter((fill) => fill?.type === "IMAGE");
  if (imageFills.length === 0) return false;
  if (visibleFills.length !== 1) return true;
  return imageFills.some((fill) => {
    const mode = String(fill.scaleMode || "").toUpperCase();
    const opacity = fill.opacity === undefined ? 1 : Number(fill.opacity);
    return !["FILL", "FIT", "TILE"].includes(mode)
      || !Number.isFinite(opacity)
      || opacity !== 1
      || !isStableImageTransform(fill.imageTransform);
  });
}

function isStableImageTransform(transform) {
  if (transform === undefined || transform === null) return true;
  return Array.isArray(transform)
    && transform.length === 2
    && Array.isArray(transform[0])
    && Array.isArray(transform[1])
    && transform[0][0] === 1
    && transform[0][1] === 0
    && transform[0][2] === 0
    && transform[1][0] === 0
    && transform[1][1] === 1
    && transform[1][2] === 0;
}

function isVectorReplacement(node) {
  const type = String(node?.type || "");
  if (type === "BOOLEAN_OPERATION") return true;
  if (Array.from(node?.children || []).length > 0) return false;
  return ["VECTOR", "LINE", "STAR", "POLYGON"].includes(type);
}

function hasMixedTextStyle(node) {
  if (node?.type !== "TEXT") return false;
  const mixedProperties = [
    "fills",
    "fontName",
    "fontSize",
    "lineHeight",
    "fontWeight",
    "letterSpacing",
    "textCase",
    "textDecoration"
  ];
  if (mixedProperties.some((property) => isFigmaMixedValue(node[property]))) return true;

  const visibleFills = Array.isArray(node.fills)
    ? node.fills.filter((fill) => fill?.visible !== false)
    : [];
  return visibleFills.length > 1
    || (visibleFills.length === 1 && visibleFills[0]?.type !== "SOLID");
}

function isUnsupportedLeaf(node) {
  if (Array.from(node?.children || []).length > 0) return false;
  return ![
    "FRAME", "GROUP", "SECTION", "COMPONENT", "INSTANCE", "RECTANGLE", "ELLIPSE", "TEXT",
    "VECTOR", "BOOLEAN_OPERATION", "LINE", "STAR", "POLYGON"
  ].includes(String(node?.type || ""));
}

async function exportNodePng(node, manifestNode, reserveFilename) {
  const bytes = await node.exportAsync({
    format: "PNG",
    constraint: { type: "SCALE", value: 1 },
    contentsOnly: true,
    useAbsoluteBounds: true
  });
  const name = sanitizeAssetName(manifestNode?.name || node.name || node.id);
  return {
    nodeId: String(node.id || ""),
    imageHash: null,
    name,
    filename: reserveFilename(name, "node", node.id, "png"),
    kind: "node-render",
    format: "png",
    mimeType: "image/png",
    renderBounds: relativeRenderBounds(node),
    bytes
  };
}

async function exportNodeSvg(node, manifestNode, reserveFilename) {
  const text = await node.exportAsync({
    format: "SVG_STRING",
    contentsOnly: true,
    useAbsoluteBounds: true
  });
  const name = sanitizeAssetName(manifestNode?.name || node.name || node.id);
  return {
    nodeId: String(node.id || ""),
    imageHash: null,
    name,
    filename: reserveFilename(name, "node", node.id, "svg"),
    kind: "node-render",
    format: "svg",
    mimeType: "image/svg+xml",
    renderBounds: relativeRenderBounds(node),
    text
  };
}

function relativeRenderBounds(node) {
  const nodeBounds = node?.absoluteBoundingBox;
  const renderBounds = node?.absoluteRenderBounds;
  const values = [
    nodeBounds?.x,
    nodeBounds?.y,
    renderBounds?.x,
    renderBounds?.y,
    renderBounds?.width,
    renderBounds?.height
  ];
  if (!values.every((value) => Number.isFinite(Number(value)))) return null;
  return {
    x: Number(renderBounds.x) - Number(nodeBounds.x),
    y: Number(renderBounds.y) - Number(nodeBounds.y),
    width: Number(renderBounds.width),
    height: Number(renderBounds.height)
  };
}

function detectImageFileType(bytes) {
  const data = Array.from(bytes || []);
  return IMAGE_SIGNATURES.find((signature) =>
    signature.bytes.every((byte, index) => data[index] === byte)
  ) || { format: "png", mimeType: "image/png" };
}

function sanitizeAssetName(value) {
  const name = String(value || "asset")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return name || "asset";
}

function sanitizeFilenameToken(value) {
  const text = String(value || "");
  const token = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return token || stableTextHash(text);
}

function stableTextHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

module.exports = {
  extractFigmaFrameAssets
};
