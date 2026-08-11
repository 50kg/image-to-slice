function createSimulatorRenderTree(figmaApi) {
  return (figmaApi?.currentPage?.children || [])
    .filter((node) => !node.removed && node.visible !== false)
    .map((node) => serializeRenderNode(figmaApi, node));
}

function serializeRenderNode(figmaApi, node) {
  const imagePaint = (node.fills || []).find((paint) => paint?.type === "IMAGE" && paint.visible !== false);
  const kind = node.type === "TEXT"
    ? "text"
    : node.type === "VECTOR"
      ? "svg"
      : imagePaint
        ? "image"
        : node.type === "FRAME"
          ? "frame"
          : node.type === "GROUP"
            ? "group"
            : "shape";
  return {
    kind,
    name: String(node.name || node.type || "node"),
    x: Number(node.x) || 0,
    y: Number(node.y) || 0,
    width: Math.max(1, Number(node.width) || 1),
    height: Math.max(1, Number(node.height) || 1),
    opacity: Number.isFinite(Number(node.opacity)) ? Number(node.opacity) : 1,
    rotation: Number(node.rotation) || 0,
    clipsContent: Boolean(node.clipsContent),
    source: kind === "svg"
      ? svgToDataUrl(node.svgData)
      : kind === "image"
        ? figmaApi._getImageDataUrl(imagePaint.imageHash)
        : "",
    scaleMode: imagePaint?.scaleMode || "FILL",
    background: paintsToCss(node.fills),
    border: paintsToBorder(node.strokes, node.strokeWeight),
    radius: readCornerRadius(node),
    shadow: effectsToCss(node.effects),
    text: kind === "text" ? String(node.characters || "") : "",
    color: kind === "text" ? paintsToCss(node.fills) : "",
    fontSize: Number(node.fontSize) || 16,
    fontWeight: fontWeightFromStyle(node.fontName?.style),
    lineHeight: Number(node.lineHeight?.value) || Number(node.fontSize) * 1.25 || 20,
    letterSpacing: Number(node.letterSpacing?.value) || 0,
    children: (node.children || [])
      .filter((child) => !child.removed && child.visible !== false)
      .map((child) => serializeRenderNode(figmaApi, child))
  };
}

function renderSimulatorPage({ document, stage, status, figmaApi }) {
  const roots = createSimulatorRenderTree(figmaApi);
  stage.innerHTML = "";
  if (!roots.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "等待导入 Figma 节点";
    stage.appendChild(empty);
    status.textContent = "等待插件消息";
    return;
  }

  const bounds = measureRoots(roots);
  const maxWidth = Math.max(1, stage.clientWidth - 44);
  const maxHeight = Math.max(1, stage.clientHeight - 44);
  const scale = Math.min(maxWidth / bounds.width, maxHeight / bounds.height, 1);
  const canvas = document.createElement("div");
  canvas.className = "mock-page";
  canvas.style.position = "relative";
  canvas.style.width = `${Math.max(1, Math.round(bounds.width * scale))}px`;
  canvas.style.height = `${Math.max(1, Math.round(bounds.height * scale))}px`;
  for (const root of roots) {
    canvas.appendChild(renderNode(document, root, scale, root.x - bounds.x, root.y - bounds.y));
  }
  stage.appendChild(canvas);
  status.textContent = `${countNodes(roots)} 个 Figma 节点已模拟回填`;
}

function renderNode(document, node, scale, x = node.x, y = node.y) {
  const element = document.createElement(node.kind === "image" || node.kind === "svg" ? "img" : "div");
  element.className = `sim-figma-node sim-${node.kind}`;
  element.title = node.name;
  element.style.position = "absolute";
  element.style.left = `${Math.round(x * scale)}px`;
  element.style.top = `${Math.round(y * scale)}px`;
  element.style.width = `${Math.max(1, Math.round(node.width * scale))}px`;
  element.style.height = `${Math.max(1, Math.round(node.height * scale))}px`;
  element.style.opacity = String(node.opacity);
  element.style.borderRadius = `${Math.max(0, Math.round(node.radius * scale))}px`;
  element.style.overflow = node.clipsContent ? "hidden" : "visible";
  if (node.rotation) element.style.transform = `rotate(${node.rotation}deg)`;
  if (node.border) element.style.border = node.border;
  if (node.shadow) element.style.boxShadow = node.shadow;

  if (node.kind === "image" || node.kind === "svg") {
    element.src = node.source;
    element.style.display = "block";
    element.style.objectFit = node.scaleMode === "FIT" ? "contain" : "cover";
  } else if (node.kind === "text") {
    element.textContent = node.text;
    element.style.color = node.color || "#111318";
    element.style.fontSize = `${Math.max(1, node.fontSize * scale)}px`;
    element.style.fontWeight = String(node.fontWeight);
    element.style.lineHeight = `${Math.max(1, node.lineHeight * scale)}px`;
    element.style.letterSpacing = `${node.letterSpacing * scale}px`;
    element.style.whiteSpace = "pre-wrap";
  } else if (node.kind !== "group") {
    element.style.background = node.background || "transparent";
  }

  for (const child of node.children) {
    element.appendChild(renderNode(document, child, scale));
  }
  return element;
}

function measureRoots(roots) {
  const x = Math.min(...roots.map((node) => node.x));
  const y = Math.min(...roots.map((node) => node.y));
  const right = Math.max(...roots.map((node) => node.x + node.width));
  const bottom = Math.max(...roots.map((node) => node.y + node.height));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

function countNodes(nodes) {
  return nodes.reduce((count, node) => count + 1 + countNodes(node.children), 0);
}

function svgToDataUrl(svgData) {
  const source = String(svgData || "").trim();
  return source ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}` : "";
}

function paintsToCss(paints) {
  const paint = (paints || []).find((entry) => entry?.visible !== false);
  if (!paint) return "transparent";
  if (paint.type === "SOLID") return colorToCss(paint.color, paint.opacity);
  if (paint.type === "GRADIENT_LINEAR") {
    return `linear-gradient(90deg, ${stopsToCss(paint.gradientStops)})`;
  }
  if (paint.type === "GRADIENT_RADIAL") {
    return `radial-gradient(circle, ${stopsToCss(paint.gradientStops)})`;
  }
  if (paint.type === "GRADIENT_ANGULAR") {
    return `conic-gradient(${stopsToCss(paint.gradientStops)})`;
  }
  return "transparent";
}

function stopsToCss(stops) {
  return (stops || []).map((stop) => `${colorToCss(stop.color)} ${Math.round(Number(stop.position) * 100)}%`).join(", ");
}

function colorToCss(color, opacity = 1) {
  const alpha = Math.max(0, Math.min(1, Number(color?.a ?? 1) * Number(opacity ?? 1)));
  const channels = [color?.r, color?.g, color?.b].map((value) => Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 255));
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`;
}

function paintsToBorder(strokes, strokeWeight) {
  const paint = (strokes || []).find((entry) => entry?.type === "SOLID" && entry.visible !== false);
  return paint ? `${Math.max(0, Number(strokeWeight) || 1)}px solid ${colorToCss(paint.color, paint.opacity)}` : "";
}

function effectsToCss(effects) {
  const shadow = (effects || []).find((effect) => effect?.type === "DROP_SHADOW" && effect.visible !== false);
  if (!shadow) return "";
  return `${Number(shadow.offset?.x) || 0}px ${Number(shadow.offset?.y) || 0}px ${Number(shadow.radius) || 0}px ${Number(shadow.spread) || 0}px ${colorToCss(shadow.color)}`;
}

function readCornerRadius(node) {
  if (Number.isFinite(Number(node.cornerRadius))) return Number(node.cornerRadius);
  return Math.max(0, Number(node.topLeftRadius) || 0);
}

function fontWeightFromStyle(style) {
  const value = String(style || "").toLowerCase();
  if (value.includes("bold")) return 700;
  if (value.includes("semi")) return 600;
  if (value.includes("medium")) return 500;
  return 400;
}

module.exports = {
  createSimulatorRenderTree,
  renderSimulatorPage
};
