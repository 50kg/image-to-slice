const EDITABLE_FRAME_PLUGIN_DATA_KEY = "imageToSliceEditableFrame";
const EDITABLE_FRAME_MARKER_VERSION = 1;
const EDITABLE_FRAME_MARKER_SOURCE = "editable-design-import";
const FIGMA_FRAME_MANIFEST_VERSION = "figma-frame-manifest-1";

function markEditableDesignFrame(frame, manifest) {
  frame.setPluginData(EDITABLE_FRAME_PLUGIN_DATA_KEY, JSON.stringify({
    version: EDITABLE_FRAME_MARKER_VERSION,
    source: EDITABLE_FRAME_MARKER_SOURCE,
    manifestVersion: typeof manifest?.version === "string" ? manifest.version : ""
  }));
}

function getSelectedFigmaFrame(figmaApi) {
  const selection = Array.from(figmaApi?.currentPage?.selection || []);
  if (!selection.length) throw new Error("请选择一个要导出 HTML 的完整 Figma 画板");
  if (selection.length !== 1) throw new Error("一次只能导出一个完整 Figma 画板");

  const frame = selection[0];
  if (frame.type !== "FRAME") {
    throw new Error("请选择完整 Figma 画板，不要选择画板内的子图层");
  }
  return frame;
}

function serializeFigmaFrame(frame) {
  const marker = readEditableFrameMarker(frame);
  const pluginGenerated = marker?.source === EDITABLE_FRAME_MARKER_SOURCE;
  const warnings = [];
  const framePath = String(frame.name || "Frame");
  return {
    version: FIGMA_FRAME_MANIFEST_VERSION,
    source: {
      sourceType: "figma",
      pluginGenerated,
      importedManifestVersion: pluginGenerated ? marker.manifestVersion || "" : "",
      frameId: String(frame.id || ""),
      frameName: String(frame.name || "")
    },
    screen: {
      name: String(frame.name || ""),
      width: finiteNumber(frame.width, 0),
      height: finiteNumber(frame.height, 0),
      clipsContent: Boolean(frame.clipsContent),
      fills: readJsonProperty(frame, "fills", framePath, warnings) || []
    },
    nodes: Array.from(frame.children || []).map((node) =>
      serializeNode(node, `${framePath}/${node.name || node.type}`, warnings)
    ),
    warnings
  };
}

function serializeNode(node, path, warnings) {
  const fills = readJsonProperty(node, "fills", path, warnings);
  const output = {
    id: String(node.id || ""),
    type: normalizeNodeType(node, fills),
    figmaType: String(node.type || "UNKNOWN"),
    name: String(node.name || ""),
    x: finiteNumber(node.x, 0),
    y: finiteNumber(node.y, 0),
    width: finiteNumber(node.width, 0),
    height: finiteNumber(node.height, 0),
    visible: node.visible !== false,
    opacity: finiteNumber(node.opacity, 1),
    rotation: finiteNumber(node.rotation, 0)
  };

  assignArray(output, "relativeTransform", readJsonProperty(node, "relativeTransform", path, warnings));
  assignArray(output, "fills", fills);
  assignArray(output, "strokes", readJsonProperty(node, "strokes", path, warnings));
  assignFiniteProperty(output, "strokeWeight", node, path, warnings);
  serializeCornerRadius(node, output, path, warnings);
  assignArray(output, "effects", readJsonProperty(node, "effects", path, warnings));

  if (node.type === "TEXT") {
    output.characters = String(node.characters || "");
    const fontName = readJsonProperty(node, "fontName", path, warnings);
    if (fontName && typeof fontName === "object") {
      output.fontFamily = String(fontName.family || "");
      output.fontStyle = String(fontName.style || "");
    }
    assignFiniteProperty(output, "fontSize", node, path, warnings);
    assignFiniteProperty(output, "fontWeight", node, path, warnings);
    assignValue(output, "lineHeight", readJsonProperty(node, "lineHeight", path, warnings));
    assignValue(output, "letterSpacing", readJsonProperty(node, "letterSpacing", path, warnings));
    assignString(output, "textAlignHorizontal", node.textAlignHorizontal);
    assignString(output, "textAlignVertical", node.textAlignVertical);
    assignString(output, "textDecoration", readJsonProperty(node, "textDecoration", path, warnings));
    assignString(output, "textCase", readJsonProperty(node, "textCase", path, warnings));
  }

  if ("clipsContent" in node) {
    output.clipsContent = Boolean(node.clipsContent);
  }
  if (Array.isArray(node.children)) {
    output.children = node.children.map((child) =>
      serializeNode(child, `${path}/${child.name || child.type}`, warnings)
    );
  }
  return output;
}

function normalizeNodeType(node, fills) {
  if (Array.isArray(fills) && fills.some((paint) => paint?.type === "IMAGE")) {
    return "image";
  }
  const type = String(node.type || "").toLowerCase();
  if (type === "vector" || type === "boolean_operation") return "svg";
  if (["frame", "group", "text", "rectangle", "ellipse", "line", "component", "instance"].includes(type)) {
    return type;
  }
  return "fallback";
}

function serializeCornerRadius(node, output, path, warnings) {
  if (isUnsupportedValue(node.cornerRadius)) {
    addUnsupportedWarning(warnings, path, "cornerRadius");
  } else if (Number.isFinite(Number(node.cornerRadius))) {
    output.cornerRadius = Number(node.cornerRadius);
    return;
  }
  for (const property of ["topLeftRadius", "topRightRadius", "bottomRightRadius", "bottomLeftRadius"]) {
    assignFiniteProperty(output, property, node, path, warnings);
  }
}

function readEditableFrameMarker(frame) {
  try {
    return JSON.parse(frame.getPluginData(EDITABLE_FRAME_PLUGIN_DATA_KEY) || "null");
  } catch (_error) {
    return null;
  }
}

function copyJsonValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    return value.map(copyJsonValue).filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const output = {};
    for (const key of Object.keys(value)) {
      const nextValue = copyJsonValue(value[key]);
      if (nextValue !== undefined) output[key] = nextValue;
    }
    return output;
  }
  return undefined;
}

function readJsonProperty(source, property, path, warnings) {
  const value = source[property];
  if (isUnsupportedValue(value)) {
    addUnsupportedWarning(warnings, path, property);
    return undefined;
  }
  return copyJsonValue(value);
}

function assignArray(target, key, value) {
  if (Array.isArray(value) && value.length > 0) target[key] = value;
}

function assignFiniteProperty(target, key, source, path, warnings) {
  const value = source[key];
  if (isUnsupportedValue(value)) {
    addUnsupportedWarning(warnings, path, key);
    return;
  }
  if (Number.isFinite(Number(value))) target[key] = Number(value);
}

function assignString(target, key, value) {
  if (typeof value === "string") target[key] = value;
}

function assignValue(target, key, value) {
  if (value !== undefined) target[key] = value;
}

function finiteNumber(value, fallback) {
  if (isUnsupportedValue(value)) return fallback;
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function isUnsupportedValue(value) {
  return isFigmaMixedValue(value) || ["function", "bigint"].includes(typeof value);
}

function isFigmaMixedValue(value) {
  return typeof value === "symbol";
}

function addUnsupportedWarning(warnings, path, property) {
  warnings.push(`${path}.${property} 使用混合或不支持的值，已省略`);
}

module.exports = {
  EDITABLE_FRAME_PLUGIN_DATA_KEY,
  markEditableDesignFrame,
  getSelectedFigmaFrame,
  serializeFigmaFrame,
  isFigmaMixedValue
};
