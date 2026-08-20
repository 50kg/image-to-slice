const { createEditableNode } = require("./editable-node");
const { createImageRectangle } = require("./asset-node");
const { createEditableFills, hexToSolidPaint } = require("./paint");
const { findEmptyImportPosition } = require("./import-position");

const SUPPORTED_TYPES = new Set(["text", "rectangle", "image", "group", "container", "frame"]);

async function createManualDesignScreen({ figmaApi, atob, payload }) {
  validateManualPayload(payload);
  const document = payload.document;
  const assetMap = payload.assetMap || {};
  const targetPage = createTargetPage(figmaApi, payload.target, document.meta.name);
  const frame = figmaApi.createFrame();
  try {
    frame.name = String(document.meta.name || "手动 JSON 导入").slice(0, 120);
    frame.resize(Number(document.meta.width), Number(document.meta.height));
    const position = findEmptyImportPosition(targetPage.children, figmaApi.viewport.center, frame.width, frame.height);
    frame.x = position.x;
    frame.y = position.y;
    frame.clipsContent = document.meta.clipsContent !== false;
    frame.fills = createEditableFills({ fill: document.meta.backgroundColor || "#FFFFFF" }, "#FFFFFF");
    targetPage.appendChild(frame);

    const background = document.background;
    if (background?.type === "image") {
      const dataUrl = requireAsset(assetMap, background.src, "背景图");
      const backgroundNode = await createImageRectangle({
        figmaApi,
        atob,
        name: background.name || "背景图",
        imageDataUrl: dataUrl,
        width: frame.width,
        height: frame.height,
        scaleMode: background.fit || "fill"
      });
      if (payload.backgroundMode === "frame-fill") {
        frame.fills = backgroundNode.fills;
        backgroundNode.remove();
      } else {
        backgroundNode.x = 0;
        backgroundNode.y = 0;
        backgroundNode.locked = true;
        frame.appendChild(backgroundNode);
      }
    } else if (background?.type === "color" && background.color) {
      frame.fills = [hexToSolidPaint(background.color, background.opacity)];
    }

    let createdCount = 0;
    for (const element of document.elements) {
      createdCount += await appendManualElement({ figmaApi, atob, parent: frame, element, assetMap });
    }
    frame.setPluginData("imageToSliceManualVersion", String(document.version || "1.0"));
    figmaApi.currentPage.selection = [frame];
    figmaApi.viewport.scrollAndZoomIntoView([frame]);
    return { createdCount, frameName: frame.name };
  } catch (error) {
    if (!frame.removed) frame.remove();
    throw error;
  }
}

async function appendManualElement({ figmaApi, atob, parent, element, assetMap }) {
  const type = String(element.type).toLowerCase();
  const definition = toEditableDefinition(element, assetMap);
  let node;
  if (["group", "container", "frame"].includes(type)) {
    node = figmaApi.createFrame();
    node.name = definition.name;
    node.x = definition.x;
    node.y = definition.y;
    node.resize(definition.width, definition.height);
    node.clipsContent = type === "frame" ? element.clipsContent !== false : false;
    node.fills = element.style?.fill || element.style?.backgroundColor
      ? createEditableFills(definition, null)
      : [];
    applyManualProperties(node, element);
    node.setPluginData("manualContainerType", type);
    parent.appendChild(node);
    let count = 1;
    for (const child of element.children) {
      count += await appendManualElement({ figmaApi, atob, parent: node, element: child, assetMap });
    }
    return count;
  }
  node = await createEditableNode({ figmaApi, atob, definition });
  applyManualProperties(node, element);
  parent.appendChild(node);
  return 1;
}

function toEditableDefinition(element, assetMap) {
  const style = element.style || {};
  const type = String(element.type).toLowerCase();
  return {
    type: type === "rectangle" ? "rectangle" : type,
    name: String(element.name || element.id || element.type || "手动图层").slice(0, 120),
    x: Number(element.x),
    y: Number(element.y),
    width: Number(element.width),
    height: Number(element.height),
    text: element.text,
    dataUrl: type === "image" ? requireAsset(assetMap, element.src, `图层 ${element.name || element.id || element.src}`) : undefined,
    scaleMode: String(element.fit || "fill").toLowerCase() === "fit" ? "FIT" : "FILL",
    fill: style.fill ?? style.backgroundColor ?? (type === "rectangle" ? "#FFFFFF" : null),
    color: style.color,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontFamily: style.fontFamily,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    radius: style.cornerRadius,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth
  };
}

function applyManualProperties(node, element) {
  node.visible = element.visible !== false;
  if (Number.isFinite(Number(element.opacity))) node.opacity = Math.min(1, Math.max(0, Number(element.opacity)));
  if (Number.isFinite(Number(element.rotation))) node.rotation = Number(element.rotation);
  const textAlign = String(element.style?.textAlign || "").toUpperCase();
  if (node.type === "TEXT" && ["LEFT", "CENTER", "RIGHT", "JUSTIFIED"].includes(textAlign)) {
    node.textAlignHorizontal = textAlign;
  }
}

function requireAsset(assetMap, source, label) {
  const name = String(source || "").trim().replace(/^.*[\\/]/, "");
  const dataUrl = assetMap[name];
  if (!dataUrl) throw new Error(`${label} 缺少素材“${name}”，请上传同名文件。`);
  return dataUrl;
}

function createTargetPage(figmaApi, target, name) {
  if (target !== "new-page") return figmaApi.currentPage;
  const page = figmaApi.createPage();
  page.name = `${String(name || "手动导入").slice(0, 80)} - 手动导入`;
  figmaApi.currentPage = page;
  return page;
}

function validateManualPayload(payload) {
  const document = payload?.document;
  if (!document || typeof document !== "object") throw new Error("缺少手动 JSON 根节点。");
  if (!document.meta || !Number.isFinite(Number(document.meta.width)) || Number(document.meta.width) <= 0) {
    throw new Error("meta.width 必须是大于 0 的数字。");
  }
  if (!Number.isFinite(Number(document.meta.height)) || Number(document.meta.height) <= 0) {
    throw new Error("meta.height 必须是大于 0 的数字。");
  }
  if (!Array.isArray(document.elements)) throw new Error("elements 必须是数组。");
  validateElements(document.elements, "elements");
}

function validateElements(elements, path) {
  elements.forEach((element, index) => {
    const elementPath = `${path}[${index}]`;
    const type = String(element?.type || "").toLowerCase();
    if (!SUPPORTED_TYPES.has(type)) throw new Error(`${elementPath}.type 不受支持。`);
    for (const field of ["x", "y", "width", "height"]) {
      if (!Number.isFinite(Number(element[field]))) throw new Error(`${elementPath}.${field} 必须是数字。`);
    }
    if (Number(element.width) <= 0 || Number(element.height) <= 0) throw new Error(`${elementPath} 的宽高必须大于 0。`);
    if (["group", "container", "frame"].includes(type)) {
      if (!Array.isArray(element.children)) throw new Error(`${elementPath}.children 必须是数组。`);
      validateElements(element.children, `${elementPath}.children`);
    }
  });
}

module.exports = {
  appendManualElement,
  createManualDesignScreen,
  toEditableDefinition,
  validateManualPayload
};
