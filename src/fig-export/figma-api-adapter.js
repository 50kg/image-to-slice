const crypto = require("node:crypto");
const sharp = require("sharp");

const {
  createEmptyFigDocument,
  encodeFigDocument
} = require("./fig-codec");
const {
  appendSvgPayload,
  canAppendSvgAsVector
} = require("./svg-vector");
const {
  normalizeImageScaleMode
} = require("../plugin/image-data");

const FIRST_POSITION = 0x21;
const LAST_POSITION = 0x7d;
const POSITION_BASE = LAST_POSITION - FIRST_POSITION + 1;

class ExportNode {
  constructor(type, owner) {
    this.type = type;
    this.name = type.toLowerCase();
    this.x = 0;
    this.y = 0;
    this.width = 100;
    this.height = 100;
    this.visible = true;
    this.opacity = 1;
    this.fills = [];
    this.strokes = [];
    this.strokeWeight = 0;
    this.effects = [];
    this.children = [];
    this.parent = null;
    this.removed = false;
    this._owner = owner;
    this._pluginData = new Map();
  }

  resize(width, height) {
    this.width = Math.max(1, Number(width) || 1);
    this.height = Math.max(1, Number(height) || 1);
  }

  appendChild(node) {
    if (!node || node === this) throw new Error("无法添加无效的 Figma 子节点");
    node.parent?._removeChild(node);
    node.parent = this;
    this.children.push(node);
  }

  _removeChild(node) {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
  }

  remove() {
    this.parent?._removeChild(this);
    this.parent = null;
    this.removed = true;
  }

  setPluginData(key, value) {
    this._pluginData.set(String(key), String(value));
  }
}

class ExportPage extends ExportNode {
  constructor(owner) {
    super("CANVAS", owner);
    this.name = "Page 1";
  }
}

function createFigExportApi() {
  const api = {
    _images: new Map(),
    _page: null,
    base64Decode(value) {
      return Uint8Array.from(Buffer.from(String(value || ""), "base64"));
    },
    createFrame() {
      return createPageNode(api, "FRAME");
    },
    createRectangle() {
      return createPageNode(api, "RECTANGLE");
    },
    createText() {
      const node = createPageNode(api, "TEXT");
      node.characters = " ";
      node.fontName = { family: "Inter", style: "Regular" };
      node.fontSize = 16;
      return node;
    },
    createImage(bytes) {
      const data = Uint8Array.from(bytes || []);
      const hash = crypto.createHash("sha1").update(data).digest("hex");
      api._images.set(hash, data);
      return { hash };
    },
    createNodeFromSvg(svgData) {
      const node = createPageNode(api, "VECTOR");
      node._svgData = String(svgData || "");
      return node;
    },
    group(nodes, parent) {
      return createGroupNode(api, nodes, parent);
    },
    async loadFontAsync() {},
    viewport: {
      center: { x: 0, y: 0 },
      scrollAndZoomIntoView() {}
    }
  };
  api._page = new ExportPage(api);
  api.currentPage = api._page;
  api.currentPage.selection = [];
  return api;
}

function createPageNode(api, type) {
  const node = new ExportNode(type, api);
  api._page.appendChild(node);
  return node;
}

async function exportApiDocument(api, options = {}) {
  const document = createEmptyFigDocument();
  const page = document.nodes.find((node) => node.type === "CANVAS" && node.name === "Page 1");
  if (!page) throw new Error("空白 .fig 模板缺少 Page 1");

  await rasterizeUnsupportedSvgNodes(api);
  normalizeTopLevelPositions(api.currentPage.children);
  const imageAssets = await buildImageAssets(
    api._images,
    collectImageLabels(api.currentPage.children)
  );
  let localID = 1;
  const appendChildren = (parentGuid, children) => {
    children.filter((node) => !node.removed).forEach((node, index) => {
      const guid = { sessionID: 1, localID: localID++ };
      const change = serializeNode(document, node, guid, parentGuid, positionAt(index), imageAssets.metadata);
      document.message.nodeChanges.push(change);
      appendChildren(guid, node.children || []);
    });
  };
  appendChildren(page.guid, api.currentPage.children);
  document.images = imageAssets.files;
  document.meta = {
    ...(document.meta || {}),
    file_name: String(options.name || "Image To Slice")
  };
  return encodeFigDocument(document);
}

async function rasterizeUnsupportedSvgNodes(api) {
  const visit = async (node) => {
    if (node.type === "VECTOR" && node._svgData && !canAppendSvgAsVector(node._svgData)) {
      const width = Math.max(1, Math.round(Number(node.width) || 1));
      const height = Math.max(1, Math.round(Number(node.height) || 1));
      const bytes = await sharp(Buffer.from(node._svgData), { density: 144 })
        .resize(width, height, { fit: "fill" })
        .png()
        .toBuffer();
      const hash = crypto.createHash("sha1").update(bytes).digest("hex");
      api._images.set(hash, Uint8Array.from(bytes));
      node.type = "RECTANGLE";
      node.fills = [{ type: "IMAGE", scaleMode: "FILL", imageHash: hash }];
      node.strokes = [];
      if (node.exportSettings?.length) {
        node.exportSettings = [{
          format: "PNG",
          constraint: { type: "SCALE", value: 1 }
        }];
      }
      delete node._svgData;
    }
    for (const child of node.children || []) await visit(child);
  };
  for (const node of api.currentPage.children || []) await visit(node);
}

function normalizeTopLevelPositions(nodes) {
  const visibleNodes = (nodes || []).filter((node) => !node.removed);
  if (!visibleNodes.length) return;
  const minX = Math.min(...visibleNodes.map((node) => Number(node.x) || 0));
  const minY = Math.min(...visibleNodes.map((node) => Number(node.y) || 0));
  visibleNodes.forEach((node) => {
    node.x = (Number(node.x) || 0) - minX;
    node.y = (Number(node.y) || 0) - minY;
  });
}

function serializeNode(document, node, guid, parentGuid, position, imageMetadata) {
  const change = {
    guid,
    phase: "CREATED",
    parentIndex: { guid: parentGuid, position },
    type: serializeNodeType(node.type),
    name: String(node.name || node.type),
    visible: node.visible !== false,
    opacity: clampOpacity(node.opacity),
    size: { x: node.width, y: node.height },
    transform: {
      m00: 1,
      m01: 0,
      m02: Number(node.x) || 0,
      m10: 0,
      m11: 1,
      m12: Number(node.y) || 0
    },
    strokeWeight: Math.max(0, Number(node.strokeWeight) || 0),
    strokeAlign: String(node.strokeAlign || (node.type === "TEXT" ? "OUTSIDE" : "INSIDE")),
    strokeJoin: "MITER",
    fillPaints: serializePaints(node.fills, imageMetadata),
    strokePaints: serializePaints(node.strokes, imageMetadata)
  };

  if (node.locked) change.locked = true;

  applyCorners(change, node);
  if (node.type === "FRAME" || node.type === "GROUP") {
    change.frameMaskDisabled = !Boolean(node.clipsContent);
  }
  if (node.effects?.length) {
    change.effects = node.effects.map(serializeEffect);
  }
  if (node.type === "TEXT") {
    applyText(change, node);
  }
  if (node.type === "VECTOR" && node._svgData) {
    Object.assign(change, appendSvgPayload(document, node._svgData, node.width, node.height));
  }
  if (node.resizeToFit) change.resizeToFit = true;
  if (node.exportSettings?.length) {
    change.exportSettings = node.exportSettings.map(serializeExportSetting);
  }
  if (node._pluginData.size) {
    change.pluginData = [...node._pluginData].map(([key, value]) => ({
      pluginID: "image-to-slice",
      key,
      value
    }));
  }
  return change;
}

function serializeExportSetting(setting) {
  const imageType = String(setting?.format || setting?.imageType || "PNG").toUpperCase();
  const constraintType = String(setting?.constraint?.type || "SCALE").toUpperCase();
  return {
    suffix: String(setting?.suffix || ""),
    imageType,
    constraint: {
      type: constraintType === "SCALE" ? "CONTENT_SCALE" : constraintType,
      value: Math.max(0.01, Number(setting?.constraint?.value) || 1)
    },
    contentsOnly: setting?.contentsOnly !== false,
    useAbsoluteBounds: Boolean(setting?.useAbsoluteBounds),
    colorProfile: String(setting?.colorProfile || "DOCUMENT"),
    useBicubicSampler: setting?.useBicubicSampler !== false
  };
}

function createGroupNode(api, nodes, parent) {
  const candidates = (nodes || []).filter((node) => node && !node.removed);
  if (!candidates.length) throw new Error("无法创建空的 Figma 分组");
  const container = parent || api.currentPage;
  const minX = Math.min(...candidates.map((node) => node.x));
  const minY = Math.min(...candidates.map((node) => node.y));
  const maxX = Math.max(...candidates.map((node) => node.x + node.width));
  const maxY = Math.max(...candidates.map((node) => node.y + node.height));
  const group = new ExportNode("GROUP", api);
  group.name = "Group";
  group.x = minX;
  group.y = minY;
  group.resize(maxX - minX, maxY - minY);
  group.resizeToFit = true;
  group.fills = [];
  container.appendChild(group);
  for (const node of candidates) {
    node.x -= minX;
    node.y -= minY;
    group.appendChild(node);
  }
  return group;
}

function serializePaints(paints, imageMetadata) {
  return (Array.isArray(paints) ? paints : []).map((paint) => {
    const type = String(paint?.type || "SOLID");
    if (type === "IMAGE") {
      const entry = imageMetadata.get(String(paint.imageHash || ""));
      if (!entry) throw new Error(`.fig 图片资源不存在：${paint.imageHash || "unknown"}`);
      return {
        type: "IMAGE",
        opacity: clampOpacity(paint.opacity),
        visible: paint.visible !== false,
        blendMode: String(paint.blendMode || "NORMAL"),
        transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
        image: { hash: hexToBytes(entry.hash), name: entry.hash },
        imageThumbnail: { hash: hexToBytes(entry.thumbnailHash), name: entry.thumbnailHash },
        imageScaleMode: normalizeImageScaleMode(paint.scaleMode),
        scale: 0.5,
        originalImageWidth: entry.width,
        originalImageHeight: entry.height,
        thumbHash: new Uint8Array(0),
        altText: ""
      };
    }
    if (type.startsWith("GRADIENT_")) {
      return {
        type,
        opacity: clampOpacity(paint.opacity),
        visible: paint.visible !== false,
        blendMode: String(paint.blendMode || "NORMAL"),
        stops: (paint.gradientStops || []).map((stop) => ({
          position: Number(stop.position) || 0,
          color: serializeColor(stop.color, 1)
        })),
        transform: arrayTransformToObject(paint.gradientTransform)
      };
    }
    return {
      type,
      color: serializeColor(paint.color, 1),
      opacity: clampOpacity(paint.opacity),
      visible: paint.visible !== false,
      blendMode: String(paint.blendMode || "NORMAL")
    };
  });
}

function collectImageLabels(nodes, labels = new Map()) {
  for (const node of nodes || []) {
    if (node.removed) continue;
    for (const paint of node.fills || []) {
      if (paint?.type !== "IMAGE" || !paint.imageHash) continue;
      const hash = String(paint.imageHash);
      if (!labels.has(hash)) labels.set(hash, new Set());
      labels.get(hash).add(String(node.name || node.type || "未命名图层"));
    }
    collectImageLabels(node.children, labels);
  }
  return labels;
}

async function buildImageAssets(images, imageLabels) {
  const files = new Map();
  const metadata = new Map();
  for (const [hash, bytes] of images) {
    try {
      const image = sharp(bytes, { failOn: "none" });
      const info = await image.metadata();
      const width = Math.max(1, Number(info.width) || 1);
      const height = Math.max(1, Number(info.height) || 1);
      const thumbnail = width > 320
        ? await image.clone().resize({ width: 320, withoutEnlargement: true }).png().toBuffer()
        : await image.clone().png().toBuffer();
      const thumbnailHash = crypto.createHash("sha1").update(thumbnail).digest("hex");
      files.set(hash, Uint8Array.from(bytes));
      files.set(thumbnailHash, Uint8Array.from(thumbnail));
      metadata.set(hash, { hash, thumbnailHash, width, height });
    } catch (error) {
      const names = [...(imageLabels?.get(hash) || [])];
      const source = names.length ? names.join("、") : hash;
      throw new Error(`.fig 图片资源无法解析：${source}（${error.message}）`, { cause: error });
    }
  }
  return { files, metadata };
}

function hexToBytes(value) {
  return Uint8Array.from(Buffer.from(String(value || ""), "hex"));
}

function serializeNodeType(type) {
  if (type === "RECTANGLE") return "ROUNDED_RECTANGLE";
  if (type === "GROUP") return "FRAME";
  return type;
}

function serializeColor(color, fallbackAlpha) {
  return {
    r: clampUnit(color?.r),
    g: clampUnit(color?.g),
    b: clampUnit(color?.b),
    a: clampOpacity(color?.a ?? fallbackAlpha)
  };
}

function serializeEffect(effect) {
  return {
    type: String(effect.type || "DROP_SHADOW"),
    color: serializeColor(effect.color, 1),
    offset: {
      x: Number(effect.offset?.x) || 0,
      y: Number(effect.offset?.y) || 0
    },
    radius: Math.max(0, Number(effect.radius) || 0),
    spread: Number(effect.spread) || 0,
    visible: effect.visible !== false,
    blendMode: String(effect.blendMode || "NORMAL"),
    showShadowBehindNode: Boolean(effect.showShadowBehindNode)
  };
}

function applyCorners(change, node) {
  const values = [
    node.topLeftRadius,
    node.topRightRadius,
    node.bottomRightRadius,
    node.bottomLeftRadius
  ];
  const uniform = node.cornerRadius;
  const radii = values.map((value) => Math.max(0, Number(value ?? uniform) || 0));
  change.cornerRadius = radii.every((value) => value === radii[0]) ? radii[0] : 0;
  change.rectangleTopLeftCornerRadius = radii[0];
  change.rectangleTopRightCornerRadius = radii[1];
  change.rectangleBottomRightCornerRadius = radii[2];
  change.rectangleBottomLeftCornerRadius = radii[3];
}

function applyText(change, node) {
  const characters = String(node.characters || " ");
  const usesChineseFont = /\p{Script=Han}/u.test(characters);
  const family = usesChineseFont ? "Noto Sans SC" : "Inter";
  const sourceStyle = String(node.fontName?.style || "Regular");
  const style = /^semi\s*bold$/i.test(sourceStyle)
    ? (usesChineseFont ? "SemiBold" : "Semi Bold")
    : sourceStyle;
  change.textData = {
    characters,
    lines: characters.split("\n").map(() => ({
      lineType: "PLAIN",
      styleId: 0,
      indentationLevel: 0,
      sourceDirectionality: "AUTO",
      listStartOffset: 0,
      isFirstLineOfList: false
    }))
  };
  change.fontName = {
    family,
    style,
    postscript: String(node.fontName?.postscript || `${family.replace(/\s+/g, "")}-${style.replace(/\s+/g, "")}`)
  };
  change.fontSize = Math.max(1, Number(node.fontSize) || 16);
  change.lineHeight = serializeTextUnit(node.lineHeight, Math.round(change.fontSize * 1.25));
  change.letterSpacing = serializeTextUnit(node.letterSpacing, 0, "PIXELS");
  change.textAutoResize = String(node.textAutoResize || "NONE");
  change.textAlignHorizontal = String(node.textAlignHorizontal || "LEFT");
  change.textAlignVertical = String(node.textAlignVertical || "TOP");
  change.styleIdForText = { guid: { sessionID: 0xffffffff, localID: 0xffffffff } };
}

function serializeTextUnit(value, fallback, fallbackUnits = "PIXELS") {
  if (value && typeof value === "object") {
    return {
      value: Number(value.value) || fallback,
      units: value.unit === "PERCENT" ? "PERCENT" : (value.unit === "AUTO" ? "AUTO" : "PIXELS")
    };
  }
  return { value: fallback, units: fallbackUnits };
}

function arrayTransformToObject(value) {
  if (!Array.isArray(value) || !Array.isArray(value[0]) || !Array.isArray(value[1])) {
    return { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
  }
  return {
    m00: Number(value[0][0]) || 0,
    m01: Number(value[0][1]) || 0,
    m02: Number(value[0][2]) || 0,
    m10: Number(value[1][0]) || 0,
    m11: Number(value[1][1]) || 0,
    m12: Number(value[1][2]) || 0
  };
}

function positionAt(index) {
  let output = "";
  let value = Math.max(0, Number(index) || 0);
  while (value >= POSITION_BASE) {
    output += "~";
    value -= POSITION_BASE;
  }
  return output + String.fromCharCode(FIRST_POSITION + value);
}

function clampOpacity(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 1;
}

function clampUnit(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
}

module.exports = {
  createFigExportApi,
  exportApiDocument,
  positionAt
};
