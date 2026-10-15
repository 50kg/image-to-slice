const { clampNumber } = require("./ui-window-state");
const { createHugeiconsStyleSvg } = require("./icon-svg");
const {
  createDropShadow,
  applyCornerRadius,
  hexToSolidPaint,
  createEditableFills
} = require("./paint");
const {
  loadPreferredTextFont,
  fontStyleFromWeight
} = require("./font");
const { applyBaseNodeProperties } = require("./node-properties");
const {
  createImageRectangle,
  createSvgAssetNode
} = require("./asset-node");

async function createEditableNode({ figmaApi, atob, definition }) {
  const type = String(definition.type || "").toLowerCase();
  if (type === "text") {
    return createEditableText({ figmaApi, definition });
  }
  if (type === "icon") {
    return createEditableIcon({ figmaApi, definition });
  }
  if (type === "svg") {
    return createEditableSvg({ figmaApi, definition });
  }
  if (type === "image") {
    return createEditableImage({ figmaApi, atob, definition });
  }
  if (type === "frame") {
    return createEditableFrame({ figmaApi, atob, definition });
  }
  return createEditableRectangle({ figmaApi, definition });
}

async function createEditableFrame({ figmaApi, atob, definition }) {
  const frame = figmaApi.createFrame();
  applyBaseNodeProperties(frame, definition);
  frame.clipsContent = Boolean(definition.clipsContent);
  frame.fills = createEditableFills(definition, "#FFFFFF");
  applyCornerRadius(frame, definition);
  if (definition.shadow) {
    frame.effects = [createDropShadow(definition.shadow)];
  }
  for (const child of definition.children || []) {
    frame.appendChild(await createEditableNode({ figmaApi, atob, definition: child }));
  }
  return frame;
}

function createEditableRectangle({ figmaApi, definition }) {
  const rectangle = figmaApi.createRectangle();
  applyBaseNodeProperties(rectangle, definition);
  rectangle.fills = createEditableFills(definition, "#FFFFFF");
  applyCornerRadius(rectangle, definition);
  if (definition.stroke) {
    rectangle.strokes = [hexToSolidPaint(definition.stroke, definition.strokeOpacity)];
    rectangle.strokeWeight = clampNumber(Number(definition.strokeWidth), 0, 24, 1);
  }
  if (definition.shadow) {
    rectangle.effects = [createDropShadow(definition.shadow)];
  }
  return rectangle;
}

async function createEditableImage({ figmaApi, atob, definition }) {
  if (!definition.dataUrl) {
    const fallbackDefinition = Object.assign({}, definition, {
      fill: definition.fill || "#EEF1F6"
    });
    return createEditableRectangle({ figmaApi, definition: fallbackDefinition });
  }
  const image = await createImageRectangle({
    figmaApi,
    atob,
    name: definition.name || "image_asset",
    imageDataUrl: definition.dataUrl,
    width: definition.width,
    height: definition.height,
    scaleMode: definition.scaleMode
  });
  applyBaseNodeProperties(image, definition);
  applyCornerRadius(image, definition);
  return image;
}

async function createEditableText({ figmaApi, definition }) {
  const fontStyle = fontStyleFromWeight(definition.fontWeight);
  let fontName = null;
  const requestedFontFamily = String(definition.fontFamily || "").trim();
  if (requestedFontFamily) {
    const requestedFont = { family: requestedFontFamily, style: fontStyle };
    try {
      await figmaApi.loadFontAsync(requestedFont);
      fontName = requestedFont;
    } catch (error) {
      // Fall back to the existing CJK-safe font chain when the requested font is unavailable.
    }
  }
  if (!fontName) {
    fontName = await loadPreferredTextFont(String(definition.text || ""), fontStyle, (font) => figmaApi.loadFontAsync(font));
  }

  const text = figmaApi.createText();
  applyBaseNodeProperties(text, definition);
  text.fontName = fontName;
  text.characters = String(definition.text || "");
  text.fontSize = clampNumber(Number(definition.fontSize), 8, 160, 16);
  text.lineHeight = { unit: "PIXELS", value: clampNumber(Number(definition.lineHeight), text.fontSize, 240, Math.round(text.fontSize * 1.25)) };
  text.fills = [hexToSolidPaint(definition.color || "#111318", definition.opacity)];
  const letterSpacing = Number.parseFloat(definition.letterSpacing);
  if (Number.isFinite(letterSpacing)) {
    text.letterSpacing = { unit: "PIXELS", value: letterSpacing };
  }
  try {
    text.textAutoResize = "NONE";
    text.resize(
      Math.max(1, clampNumber(Number(definition.width), 1, 100000, 100)),
      Math.max(1, clampNumber(Number(definition.height), 1, 100000, 40))
    );
  } catch (error) {
    // Older Figma runtimes may not allow text auto-resize changes here.
  }
  return text;
}

async function createEditableIcon({ figmaApi, definition }) {
  const width = clampNumber(Number(definition.width), 1, 512, 24);
  const height = clampNumber(Number(definition.height), 1, 512, 24);
  const svgData = createHugeiconsStyleSvg({
    name: definition.iconName || definition.name || "circle",
    color: definition.color || definition.stroke || "#111318",
    width: width,
    height: height,
    strokeWidth: definition.strokeWidth || Math.max(1.6, Math.min(width, height) * 0.08)
  });
  const node = createSvgAssetNode({
    figmaApi,
    name: definition.name || "icon",
    svgData: svgData,
    width: width,
    height: height
  });
  applyBaseNodeProperties(node, definition);
  return node;
}

function createEditableSvg({ figmaApi, definition }) {
  const svgData = String(definition.svgData || "").trim();
  if (!svgData) {
    const fallbackDefinition = Object.assign({}, definition, {
      fill: definition.fill || "#EEF1F6"
    });
    return createEditableRectangle({ figmaApi, definition: fallbackDefinition });
  }
  const node = createSvgAssetNode({
    figmaApi,
    name: definition.name || "svg_asset",
    svgData,
    width: clampNumber(Number(definition.width), 1, 100000, 24),
    height: clampNumber(Number(definition.height), 1, 100000, 24)
  });
  applyBaseNodeProperties(node, definition);
  return node;
}

module.exports = {
  createEditableNode,
  createEditableFrame,
  createEditableRectangle,
  createEditableImage,
  createEditableText,
  createEditableIcon,
  createEditableSvg
};
