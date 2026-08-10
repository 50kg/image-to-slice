const HTML_PREVIEW_INSPECTOR_DEFAULT_WIDTH = 360;
const HTML_PREVIEW_INSPECTOR_MIN_WIDTH = 280;
const HTML_PREVIEW_INSPECTOR_MAX_WIDTH = 560;

function clampInspectorWidth(value) {
  const width = Number(value);
  if (!Number.isFinite(width)) return HTML_PREVIEW_INSPECTOR_DEFAULT_WIDTH;
  return Math.min(HTML_PREVIEW_INSPECTOR_MAX_WIDTH, Math.max(HTML_PREVIEW_INSPECTOR_MIN_WIDTH, width));
}

function formatInspectorElementLabel(element, referenceAssets = []) {
  const tag = String(element?.localName || element?.tagName || "element").toLowerCase();
  const id = String(element?.id || "");
  const classes = Array.from(element?.classList || []).map(String).filter(Boolean);
  const directText = Array.from(element?.childNodes || [])
    .filter((node) => node?.nodeType === 3)
    .map((node) => String(node.textContent || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
  const label = {
    tag,
    id,
    classes,
    text: directText.length > 40 ? `${directText.slice(0, 37)}...` : directText
  };
  const imageAsset = readInspectorImageAsset(element, referenceAssets);
  if (imageAsset) label.assetName = imageAsset.name;
  return label;
}

function readInspectorImageAsset(element, referenceAssets = []) {
  const tag = String(element?.localName || element?.tagName || "").toLowerCase();
  if (tag !== "img" || typeof element?.getAttribute !== "function") return null;
  const id = String(element.getAttribute("data-reference-asset") || "");
  if (!id) return null;
  const referenceAsset = referenceAssets.find((asset) => String(asset?.id || "") === id);
  return {
    id,
    name: String(referenceAsset?.name || element.getAttribute("alt") || id),
    dataUrl: String(referenceAsset?.dataUrl || element.getAttribute("src") || "")
  };
}

function findInspectorElement(target, screenElement) {
  let element = target?.nodeType === 3 ? target.parentElement : target;
  while (element) {
    if (element === screenElement) return element;
    if (screenElement?.contains?.(element)) return element;
    element = element.parentElement;
  }
  return null;
}

function findInspectorReferenceAssetElement(target, screenElement) {
  let element = target;
  while (element) {
    const tag = String(element.localName || element.tagName || "").toLowerCase();
    if (tag === "img" && element.getAttribute?.("data-reference-asset")) {
      return screenElement?.contains?.(element) ? element : null;
    }
    if (element === screenElement) break;
    element = element.parentElement;
  }
  return null;
}

function findInspectorReferenceAssetAtPoint(screenElement, clientX, clientY) {
  const images = Array.from(screenElement?.querySelectorAll?.("img[data-reference-asset]") || []);
  for (let index = images.length - 1; index >= 0; index -= 1) {
    const image = images[index];
    const rect = image.getBoundingClientRect?.();
    if (
      rect
      && clientX >= rect.left
      && clientX <= rect.right
      && clientY >= rect.top
      && clientY <= rect.bottom
    ) {
      return image;
    }
  }
  return null;
}

function canDeleteInspectorElement(element, screenElement) {
  if (
    !element
    || !screenElement
    || element === screenElement
    || !screenElement.contains?.(element)
    || element.matches?.(".fit-shell,.fit-box,[data-reference-asset]")
    || element.querySelector?.("[data-reference-asset]")
  ) {
    return false;
  }
  return true;
}

function reduceInspectorSelection(state = {}, interaction = {}) {
  const selectedElement = state.selectedElement || null;
  const locked = Boolean(state.locked);
  const targetElement = interaction.targetElement || null;
  if (interaction.type === "hover") {
    return locked
      ? { selectedElement, locked }
      : { selectedElement: targetElement, locked: false };
  }
  if (interaction.type === "click") {
    if (locked && selectedElement === targetElement) {
      return { selectedElement: null, locked: false };
    }
    return { selectedElement: targetElement, locked: Boolean(targetElement) };
  }
  if (interaction.type === "lock") {
    return { selectedElement: targetElement, locked: Boolean(targetElement) };
  }
  return { selectedElement, locked };
}

function readInspectorLayout(element, screenElement) {
  if (!element || !screenElement || element.isConnected === false || screenElement.isConnected === false) {
    return null;
  }
  const view = element.ownerDocument?.defaultView;
  if (!view || typeof view.getComputedStyle !== "function") return null;
  const elementRect = element.getBoundingClientRect?.();
  const screenRect = screenElement.getBoundingClientRect?.();
  if (!elementRect || !screenRect) return null;
  const style = view.getComputedStyle(element);
  return {
    geometry: {
      x: roundInspectorNumber(elementRect.left - screenRect.left),
      y: roundInspectorNumber(elementRect.top - screenRect.top),
      width: roundInspectorNumber(elementRect.width),
      height: roundInspectorNumber(elementRect.height)
    },
    margin: readInspectorSides(style, "margin"),
    border: {
      top: style.borderTopWidth,
      right: style.borderRightWidth,
      bottom: style.borderBottomWidth,
      left: style.borderLeftWidth
    },
    padding: readInspectorSides(style, "padding"),
    layout: {
      display: style.display,
      position: style.position,
      overflow: style.overflow,
      zIndex: style.zIndex
    },
    typography: {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      textAlign: style.textAlign,
      color: style.color
    },
    appearance: {
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius
    }
  };
}

function readInspectorSides(style, prefix) {
  return {
    top: style[`${prefix}Top`],
    right: style[`${prefix}Right`],
    bottom: style[`${prefix}Bottom`],
    left: style[`${prefix}Left`]
  };
}

function roundInspectorNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function calculateInspectorHighlightRect({ elementRect, iframeRect, viewportRect, zoom } = {}) {
  const scale = Number.isFinite(Number(zoom)) && Number(zoom) > 0 ? Number(zoom) : 1;
  return {
    left: roundInspectorNumber(Number(iframeRect?.left || 0) - Number(viewportRect?.left || 0) + Number(elementRect?.left || 0) * scale),
    top: roundInspectorNumber(Number(iframeRect?.top || 0) - Number(viewportRect?.top || 0) + Number(elementRect?.top || 0) * scale),
    width: roundInspectorNumber(Math.max(0, Number(elementRect?.width || 0) * scale)),
    height: roundInspectorNumber(Math.max(0, Number(elementRect?.height || 0) * scale))
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    calculateInspectorHighlightRect,
    canDeleteInspectorElement,
    clampInspectorWidth,
    findInspectorElement,
    findInspectorReferenceAssetAtPoint,
    findInspectorReferenceAssetElement,
    formatInspectorElementLabel,
    reduceInspectorSelection,
    readInspectorImageAsset,
    readInspectorLayout
  };
}
