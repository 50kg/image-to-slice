function renderFigmaFrameHtml({ manifest, assets = [] }) {
  const warnings = [];
  const screen = manifest?.screen || {};
  const width = pixelValue(screen.width, 1);
  const height = pixelValue(screen.height, 1);
  const normalizedAssets = normalizeAssetFilenames(assets);
  const assetIndex = indexAssets(normalizedAssets);
  const rootNodeRender = assetIndex.nodeRender.get(String(manifest?.source?.frameId || ""));
  const rootReplacementFailed = screen.replacementFailed === true;
  const screenRules = ["position:relative", `width:${width}px`, `height:${height}px`];
  if (screen.clipsContent) screenRules.push("overflow:hidden");
  if (!rootNodeRender && !rootReplacementFailed) renderFillRules(screen, screenRules, warnings, assetIndex);
  const css = [
    "*{box-sizing:border-box;}",
    "html,body{margin:0;min-height:100%;}",
    `:root{--figma-screen-width:${width}px;--figma-screen-height:${height}px;--figma-fit-scale:min(1,calc(100vw / var(--figma-screen-width)));}`,
    ".fit-shell{width:100%;display:grid;place-items:start center;overflow-x:auto;}",
    ".fit-box{position:relative;width:calc(var(--figma-screen-width) * var(--figma-fit-scale));height:calc(var(--figma-screen-height) * var(--figma-fit-scale));overflow:hidden;}",
    `.fit-canvas{position:absolute;left:0;top:0;width:${width}px;height:${height}px;transform:scale(var(--figma-fit-scale));transform-origin:0 0;}`,
    `.figma-screen{${screenRules.join(";")};}`,
    ".figma-node-image{display:block;position:absolute;max-width:none;}"
  ];
  const body = rootNodeRender
    ? renderReplacementImage(rootNodeRender, ".figma-screen", css)
    : rootReplacementFailed
      ? ""
      : renderNodes(Array.isArray(manifest?.nodes) ? manifest.nodes : [], css, warnings, assetIndex);
  const html = [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><link rel=\"stylesheet\" href=\"./styles.css\"></head>",
    "<body><main class=\"fit-shell\"><div class=\"fit-box\"><div class=\"fit-canvas\"><section class=\"figma-screen\">",
    body,
    "</section></div></div></main></body>",
    "</html>"
  ].join("\n");

  return { html, css: css.join("\n"), warnings };
}

function createFigmaFrameHtmlExport({ manifest, assets = [], textToBytes }) {
  if (typeof textToBytes !== "function") throw new TypeError("textToBytes must be a function");
  const normalizedAssets = normalizeAssetFilenames(assets);
  const rendered = renderFigmaFrameHtml({ manifest, assets: normalizedAssets });
  const warnings = [...rendered.warnings];
  const files = [
    { name: "index.html", data: textToBytes(rendered.html) },
    { name: "styles.css", data: textToBytes(rendered.css) }
  ];
  const filenames = new Set(files.map((file) => file.name));

  for (const asset of normalizedAssets) {
    const filename = safeAssetFilename(asset?.filename);
    if (!filename) {
      warnings.push("已跳过缺少文件名的资源");
      continue;
    }
    const name = `assets/${filename}`;
    if (filenames.has(name)) {
      warnings.push(`已跳过重复资源 ${name}`);
      continue;
    }
    const data = asset.format === "svg" && typeof asset.text === "string"
      ? textToBytes(asset.text)
      : asset.bytes;
    if (!(data instanceof Uint8Array)) {
      warnings.push(`已跳过缺少内容的资源 ${name}`);
      continue;
    }
    filenames.add(name);
    files.push({ name, data });
  }

  return {
    zipFilename: `${safeZipName(manifest?.screen?.name)}-html.zip`,
    files,
    warnings
  };
}

function renderNodes(nodes, css, warnings, assetIndex) {
  return nodes.map((node) => renderNode(node, css, warnings, assetIndex)).join("\n");
}

function renderNode(node, css, warnings, assetIndex) {
  const nodeId = String(node?.id || "node");
  const className = `node-${sanitizeNodeId(nodeId)}`;
  const selector = `.${className}`;
  const nodeRender = assetIndex.nodeRender.get(nodeId);
  const replacement = Boolean(nodeRender) || node?.replacementFailed === true;
  css.push(`${selector}{${renderNodeCss(node, warnings, assetIndex, replacement)}}`);

  const image = nodeRender ? renderReplacementImage(nodeRender, selector, css) : "";
  const text = !replacement && String(node?.type || "").toLowerCase() === "text"
    ? escapeFigmaFrameText(node?.characters || "")
    : "";
  const children = replacement
    ? ""
    : renderNodes(Array.isArray(node?.children) ? node.children : [], css, warnings, assetIndex);
  return `<div class=\"figma-node ${className}\" data-node-id=\"${escapeFigmaFrameAttribute(nodeId)}\">${image}${text}${children ? `\n${children}\n` : ""}</div>`;
}

function renderReplacementImage(asset, parentSelector, css) {
  const bounds = validRenderBounds(asset?.renderBounds);
  const geometry = bounds
    ? `left:${pixelValue(bounds.x, 0)}px;top:${pixelValue(bounds.y, 0)}px;width:${pixelValue(bounds.width, 0)}px;height:${pixelValue(bounds.height, 0)}px;`
    : "left:0;top:0;width:100%;height:100%;";
  css.push(`${parentSelector}>.figma-node-image{${geometry}}`);
  return `<img class=\"figma-node-image\" src=\"./assets/${escapeFigmaFrameAttribute(asset.filename)}\" alt=\"\">`;
}

function validRenderBounds(bounds) {
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every((value) => Number.isFinite(Number(value)))) {
    return null;
  }
  return Number(bounds.width) >= 0 && Number(bounds.height) >= 0 ? bounds : null;
}

function renderNodeCss(node, warnings, assetIndex, replacement = false) {
  const rules = ["position:absolute"];
  const matrix = transformMatrix(node?.relativeTransform);
  if (matrix) {
    rules.push("left:0", "top:0", `transform:matrix(${matrix.join(",")})`, "transform-origin:0 0");
  } else {
    rules.push(`left:${pixelValue(node?.x, 0)}px`, `top:${pixelValue(node?.y, 0)}px`);
    if (finiteNumber(node?.rotation, 0) !== 0) rules.push(`transform:rotate(${finiteNumber(node.rotation, 0)}deg)`, "transform-origin:0 0");
  }
  rules.push(`width:${pixelValue(node?.width, 0)}px`, `height:${pixelValue(node?.height, 0)}px`);
  if (node?.visible === false) rules.push("display:none");
  if (replacement) return `${rules.join(";")};`;
  if (node?.clipsContent) rules.push("overflow:hidden");
  if (finiteNumber(node?.opacity, 1) !== 1) rules.push(`opacity:${numberText(finiteNumber(node.opacity, 1))}`);
  if (String(node?.type || "").toLowerCase() === "text") {
    renderTextFillRules(node, rules, warnings);
  } else {
    renderFillRules(node, rules, warnings, assetIndex);
  }
  renderStrokeRules(node, rules, warnings);
  renderRadiusRules(node, rules);
  renderShadowRules(node, rules, warnings);
  if (String(node?.type || "").toLowerCase() === "text") renderTextRules(node, rules, warnings);
  return `${rules.join(";")};`;
}

function renderTextFillRules(node, rules, warnings) {
  const fills = Array.from(node?.fills || []).filter((fill) => fill?.visible !== false);
  if (fills.length === 0) return;
  if (fills.length !== 1 || fills[0]?.type !== "SOLID") {
    warnings.push(`${nodeLabel(node)}: 非纯色文本填充缺少 node-render 资源`);
    return;
  }
  const color = cssColor(fills[0].color, fills[0].opacity);
  if (color) rules.push(`color:${color}`);
  else warnings.push(`${nodeLabel(node)}: 不支持的纯色文本填充`);
}

function renderFillRules(node, rules, warnings, assetIndex) {
  const fills = Array.from(node?.fills || []).filter((fill) => fill?.visible !== false);
  if (fills.length > 1) warnings.push(`${nodeLabel(node)}: 多个填充仅导出第一个`);
  const fill = fills[0];
  if (!fill) return;
  if (fill.type === "SOLID") {
    const color = cssColor(fill.color, fill.opacity);
    if (color) rules.push(`background-color:${color}`);
    else warnings.push(`${nodeLabel(node)}: 不支持的纯色填充`);
    return;
  }
  if (["GRADIENT_LINEAR", "GRADIENT_RADIAL"].includes(fill.type)) {
    const gradient = cssGradient(fill);
    if (gradient) rules.push(`background-image:${gradient}`);
    else warnings.push(`${nodeLabel(node)}: 渐变数据无效`);
    return;
  }
  if (fill.type !== "IMAGE") {
    warnings.push(`${nodeLabel(node)}: 不支持的填充 ${String(fill.type || "UNKNOWN")}`);
    return;
  }
  const asset = assetIndex.imageFill.get(String(fill.imageHash || ""));
  if (!asset) {
    warnings.push(`${nodeLabel(node)}: 找不到图片填充资源`);
    return;
  }
  warnForUnstableImagePaint(node, fill, warnings);
  rules.push(`background-image:url("./assets/${escapeCssUrl(asset.filename)}")`);
  const mode = String(fill.scaleMode || "FILL").toUpperCase();
  if (mode === "FILL") rules.push("background-size:cover", "background-position:center", "background-repeat:no-repeat");
  else if (mode === "FIT") rules.push("background-size:contain", "background-position:center", "background-repeat:no-repeat");
  else if (mode === "TILE") {
    rules.push("background-repeat:repeat");
    renderTileSize(node, fill, asset, rules, warnings);
  }
  else warnings.push(`${nodeLabel(node)}: 不支持的图片缩放模式 ${mode}`);
}

function warnForUnstableImagePaint(node, fill, warnings) {
  const opacity = fill.opacity === undefined ? 1 : Number(fill.opacity);
  if (!Number.isFinite(opacity) || opacity !== 1) {
    warnings.push(`${nodeLabel(node)}: 图片填充 opacity 未通过 node-render 回退`);
  }
  if (fill.imageTransform !== undefined && fill.imageTransform !== null && !isStableImagePaintTransform(fill.imageTransform)) {
    warnings.push(`${nodeLabel(node)}: 图片填充 transform 未通过 node-render 回退`);
  }
}

function renderTileSize(node, fill, asset, rules, warnings) {
  const factor = Number(fill.scalingFactor);
  if (!Number.isFinite(factor) || factor <= 0) {
    warnings.push(`${nodeLabel(node)}: TILE 图片 scalingFactor 无效`);
    return;
  }
  const width = Number(asset.intrinsicWidth);
  const height = Number(asset.intrinsicHeight);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    warnings.push(`${nodeLabel(node)}: TILE 图片缺少有效原始尺寸`);
    return;
  }
  rules.push(`background-size:${roundedNumber(width * factor)}px ${roundedNumber(height * factor)}px`);
}

function isStableImagePaintTransform(transform) {
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

function renderStrokeRules(node, rules, warnings) {
  const strokes = Array.from(node?.strokes || []).filter((stroke) => stroke?.visible !== false);
  if (strokes.length > 1) warnings.push(`${nodeLabel(node)}: 多个描边仅导出第一个`);
  const stroke = strokes[0];
  if (!stroke) return;
  if (stroke.type !== "SOLID") {
    warnings.push(`${nodeLabel(node)}: 不支持的描边 ${String(stroke.type || "UNKNOWN")}`);
    return;
  }
  const color = cssColor(stroke.color, stroke.opacity);
  if (color) rules.push(`border:${pixelValue(node?.strokeWeight, 1)}px solid ${color}`);
}

function renderRadiusRules(node, rules) {
  if (String(node?.type || "").toLowerCase() === "ellipse") {
    rules.push("border-radius:50%");
    return;
  }
  if (Number.isFinite(Number(node?.cornerRadius))) {
    rules.push(`border-radius:${pixelValue(node.cornerRadius, 0)}px`);
    return;
  }
  const radii = [node?.topLeftRadius, node?.topRightRadius, node?.bottomRightRadius, node?.bottomLeftRadius];
  if (radii.some((radius) => Number.isFinite(Number(radius)))) {
    rules.push(`border-radius:${radii.map((radius) => `${pixelValue(radius, 0)}px`).join(" ")}`);
  }
}

function renderShadowRules(node, rules, warnings) {
  const shadows = [];
  const layerBlurs = [];
  const backgroundBlurs = [];
  for (const effect of Array.from(node?.effects || [])) {
    if (effect?.visible === false) continue;
    if (effect?.type === "LAYER_BLUR" || effect?.type === "BACKGROUND_BLUR") {
      if (!Number.isFinite(Number(effect.radius))) {
        warnings.push(`${nodeLabel(node)}: 不支持的效果 ${effect.type}`);
        continue;
      }
      const blur = `blur(${pixelValue(Math.max(0, Number(effect.radius)), 0)}px)`;
      (effect.type === "LAYER_BLUR" ? layerBlurs : backgroundBlurs).push(blur);
      continue;
    }
    if (!["DROP_SHADOW", "INNER_SHADOW"].includes(effect?.type)) {
      warnings.push(`${nodeLabel(node)}: 不支持的效果 ${String(effect?.type || "UNKNOWN")}`);
      continue;
    }
    const color = cssColor(effect.color);
    if (!color) {
      warnings.push(`${nodeLabel(node)}: 不支持的阴影颜色`);
      continue;
    }
    shadows.push(`${effect.type === "INNER_SHADOW" ? "inset " : ""}${pixelValue(effect?.offset?.x, 0)}px ${pixelValue(effect?.offset?.y, 0)}px ${pixelValue(effect?.radius, 0)}px ${pixelValue(effect?.spread, 0)}px ${color}`);
  }
  if (shadows.length) rules.push(`box-shadow:${shadows.join(",")}`);
  if (layerBlurs.length) rules.push(`filter:${layerBlurs.join(" ")}`);
  if (backgroundBlurs.length) {
    const value = backgroundBlurs.join(" ");
    rules.push(`-webkit-backdrop-filter:${value}`, `backdrop-filter:${value}`);
  }
}

function renderTextRules(node, rules, warnings) {
  rules.push("white-space:pre-wrap");
  if (node?.fontFamily) rules.push(`font-family:${cssFontFamily(node.fontFamily)}`);
  if (Number.isFinite(Number(node?.fontSize))) rules.push(`font-size:${pixelValue(node.fontSize, 0)}px`);
  if (Number.isFinite(Number(node?.fontWeight))) rules.push(`font-weight:${numberText(Number(node.fontWeight))}`);
  if (String(node?.fontStyle || "").toLowerCase().includes("italic")) rules.push("font-style:italic");
  const lineHeight = lineHeightValue(node?.lineHeight);
  if (lineHeight) rules.push(`line-height:${lineHeight}`);
  const letterSpacing = letterSpacingValue(node?.letterSpacing);
  if (letterSpacing) rules.push(`letter-spacing:${letterSpacing}`);
  const textAlign = { LEFT: "left", CENTER: "center", RIGHT: "right", JUSTIFIED: "justify" }[node?.textAlignHorizontal];
  if (textAlign) rules.push(`text-align:${textAlign}`);
  const verticalAlign = { TOP: "flex-start", CENTER: "center", BOTTOM: "flex-end" }[node?.textAlignVertical];
  if (verticalAlign) rules.push("display:flex", `align-items:${verticalAlign}`);
  const textCase = { UPPER: "uppercase", LOWER: "lowercase", TITLE: "capitalize", SMALL_CAPS: "uppercase" }[node?.textCase];
  if (textCase) rules.push(`text-transform:${textCase}`);
  if (node?.textCase && !textCase && node.textCase !== "ORIGINAL") warnings.push(`${nodeLabel(node)}: 不支持的文本大小写 ${node.textCase}`);
  if (node?.textDecoration === "UNDERLINE") rules.push("text-decoration:underline");
  else if (node?.textDecoration === "STRIKETHROUGH") rules.push("text-decoration:line-through");
  else if (node?.textDecoration && node.textDecoration !== "NONE") warnings.push(`${nodeLabel(node)}: 不支持的文本装饰 ${node.textDecoration}`);
}

function indexAssets(assets) {
  const imageFill = new Map();
  const nodeRender = new Map();
  for (const asset of assets) {
    if (!safeAssetFilename(asset?.filename)) continue;
    if (asset?.kind === "image-fill" && asset.imageHash && !imageFill.has(String(asset.imageHash))) {
      imageFill.set(String(asset.imageHash), asset);
    }
    if (asset?.kind === "node-render" && asset.nodeId && !nodeRender.has(String(asset.nodeId))) {
      nodeRender.set(String(asset.nodeId), asset);
    }
  }
  return { imageFill, nodeRender };
}

function normalizeAssetFilenames(assets) {
  const used = new Set();
  return Array.from(assets || []).map((asset) => {
    const filename = safeAssetFilename(asset?.filename);
    if (!filename) return asset;
    const extensionIndex = filename.lastIndexOf(".");
    const stem = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
    const extension = extensionIndex > 0 ? filename.slice(extensionIndex) : "";
    let candidate = filename;
    let counter = 2;
    while (used.has(candidate)) {
      candidate = `${stem}--${counter}${extension}`;
      counter += 1;
    }
    used.add(candidate);
    return candidate === filename ? asset : { ...asset, filename: candidate };
  });
}

function transformMatrix(value) {
  if (!Array.isArray(value) || value.length !== 2 || !Array.isArray(value[0]) || !Array.isArray(value[1])) return null;
  const numbers = [value[0][0], value[1][0], value[0][1], value[1][1], value[0][2], value[1][2]];
  return numbers.every((number) => Number.isFinite(Number(number))) ? numbers.map((number) => numberText(Number(number))) : null;
}

function cssColor(color, opacity = 1) {
  if (!color || ![color.r, color.g, color.b].every((value) => Number.isFinite(Number(value)))) return null;
  const alpha = finiteNumber(color.a, 1) * finiteNumber(opacity, 1);
  return `rgba(${rgbChannel(color.r)},${rgbChannel(color.g)},${rgbChannel(color.b)},${numberText(alpha)})`;
}

function cssGradient(fill) {
  const stops = Array.from(fill?.gradientStops || [])
    .map((stop) => cssGradientStop(stop, fill.opacity))
    .filter(Boolean)
    .sort((left, right) => left.position - right.position);
  if (stops.length < 2) return "";
  const stopText = stops.map((stop) => stop.text).join(",");
  if (fill.type === "GRADIENT_LINEAR") {
    return `linear-gradient(${linearGradientAngle(fill.gradientTransform)}deg,${stopText})`;
  }
  return `radial-gradient(${radialGradientGeometry(fill.gradientTransform)},${stopText})`;
}

function cssGradientStop(stop, fillOpacity) {
  if (!stop || !Number.isFinite(Number(stop.position))) return null;
  const opacity = finiteNumber(fillOpacity, 1) * finiteNumber(stop.opacity, 1);
  const color = cssColor(stop.color, opacity);
  if (!color) return null;
  const position = Math.max(0, Math.min(1, Number(stop.position)));
  return {
    position,
    text: `${color} ${roundedNumber(position * 100)}%`
  };
}

function linearGradientAngle(transform) {
  const matrix = gradientMatrix(transform);
  if (!matrix) return 90;
  const degrees = Math.atan2(matrix[1][0], matrix[0][0]) * 180 / Math.PI + 90;
  return roundedNumber((degrees % 360 + 360) % 360);
}

function radialGradientGeometry(transform) {
  const matrix = gradientMatrix(transform);
  if (!matrix) return "ellipse 50% 50% at 50% 50%";
  const radiusX = Math.hypot(matrix[0][0], matrix[1][0]) * 50;
  const radiusY = Math.hypot(matrix[0][1], matrix[1][1]) * 50;
  const centerX = Math.max(0, Math.min(100, 50 + matrix[0][2] * 100));
  const centerY = Math.max(0, Math.min(100, 50 + matrix[1][2] * 100));
  return `ellipse ${roundedNumber(radiusX)}% ${roundedNumber(radiusY)}% at ${roundedNumber(centerX)}% ${roundedNumber(centerY)}%`;
}

function gradientMatrix(value) {
  if (!Array.isArray(value) || value.length !== 2 || !Array.isArray(value[0]) || !Array.isArray(value[1])) return null;
  if (value[0].length < 3 || value[1].length < 3) return null;
  return value.every((row) => row.slice(0, 3).every((number) => Number.isFinite(Number(number))))
    ? value.map((row) => row.slice(0, 3).map(Number))
    : null;
}

function roundedNumber(value) {
  return numberText(Math.round(Number(value) * 1000000) / 1000000);
}

function rgbChannel(value) {
  const numeric = Number(value);
  return String(Math.round(Math.max(0, Math.min(255, numeric <= 1 ? numeric * 255 : numeric))));
}

function lineHeightValue(value) {
  if (Number.isFinite(Number(value))) return `${numberText(Number(value))}px`;
  if (!value || typeof value !== "object" || !Number.isFinite(Number(value.value))) return "";
  return value.unit === "PERCENT" ? `${numberText(Number(value.value))}%` : `${numberText(Number(value.value))}px`;
}

function letterSpacingValue(value) {
  if (Number.isFinite(Number(value))) return `${numberText(Number(value))}px`;
  if (!value || typeof value !== "object" || !Number.isFinite(Number(value.value))) return "";
  if (value.unit === "PERCENT") return `${roundedNumber(Number(value.value) / 100)}em`;
  if (value.unit === "PIXELS") return `${numberText(Number(value.value))}px`;
  return "";
}

function pixelValue(value, fallback) {
  return numberText(finiteNumber(value, fallback));
}

function finiteNumber(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function numberText(value) {
  return String(Object.is(value, -0) ? 0 : value);
}

function sanitizeNodeId(value) {
  return String(value || "node").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "node";
}

function safeAssetFilename(value) {
  const filename = String(value || "");
  return filename && !filename.includes("/") && !filename.includes("\\") && !filename.includes("..") ? filename : "";
}

function safeZipName(value) {
  return String(value || "Figma-frame").trim().replace(/[\\/:*?"<>|]+/g, "-") || "Figma-frame";
}

function cssFontFamily(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function escapeCssUrl(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function escapeFigmaFrameText(value) {
  return String(value).replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]);
}

function escapeFigmaFrameAttribute(value) {
  return escapeFigmaFrameText(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function nodeLabel(node) {
  return String(node?.name || node?.id || "节点");
}

if (typeof module !== "undefined") {
  module.exports = {
    createFigmaFrameHtmlExport,
    renderFigmaFrameHtml
  };
}
