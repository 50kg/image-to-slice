const cssUtilsClampNumber = typeof require === "function" ? require("./app-utils").clampNumber : clampNumber;

function extractSolidCssColor(value) {
  const rgba = parseCssColor(value);
  if (!rgba || rgba.a <= 0.02) {
    return "";
  }
  return cssUtilsRgbToHex(rgba.r, rgba.g, rgba.b);
}

function extractSolidCssPaint(value) {
  const rgba = parseCssColor(value);
  if (!rgba || rgba.a <= 0.02) {
    return null;
  }
  return {
    color: cssUtilsRgbToHex(rgba.r, rgba.g, rgba.b),
    opacity: cssUtilsClampNumber(rgba.a, 0, 1, 1)
  };
}

function parseCssColor(value) {
  const text = String(value || "").trim();
  if (!text || text === "transparent") {
    return null;
  }
  const rgba = text.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const parts = rgba[1].split(",").map((part) => part.trim());
    return {
      r: cssUtilsClampNumber(Number.parseFloat(parts[0]), 0, 255, 0),
      g: cssUtilsClampNumber(Number.parseFloat(parts[1]), 0, 255, 0),
      b: cssUtilsClampNumber(Number.parseFloat(parts[2]), 0, 255, 0),
      a: parts.length > 3 ? cssUtilsClampNumber(Number.parseFloat(parts[3]), 0, 1, 1) : 1
    };
  }
  if (/^#[0-9a-f]{3,8}$/i.test(text)) {
    let hex = text.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.split("").map((char) => char + char).join("");
    }
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: hex.length >= 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1
    };
  }
  return null;
}

function parseCssGradient(value) {
  return parseCssLinearGradient(value) || parseCssRadialGradient(value);
}

function parseFigmaCompatibleCssGradient(style) {
  const background = String(style?.backgroundImage || style?.background || "");
  const layers = splitCssFunctionArgs(background)
    .map((layer) => layer.trim())
    .filter((layer) => layer && layer.toLowerCase() !== "none");
  const gradients = layers.map(parseCssGradient).filter(Boolean);
  if (layers.length > 1) {
    return gradients.find((gradient) => (
      gradient.stops.every((stop) => stop.opacity >= 0.999)
    )) || null;
  }
  if (layers.length !== 1 || gradients.length !== 1) {
    return null;
  }
  const [gradient] = gradients;
  const solidBackground = extractSolidCssPaint(style?.backgroundColor);
  if (
    solidBackground
    && gradient?.stops?.some((stop) => stop.opacity < 0.999)
  ) {
    return null;
  }
  return gradient;
}

function parseCssLinearGradient(value) {
  const text = extractCssFunction(value, "linear-gradient");
  if (!text) {
    return null;
  }
  const inner = text.replace(/^linear-gradient\(/i, "").replace(/\)\s*$/, "");
  const parts = splitCssFunctionArgs(inner);
  if (parts.length < 2) {
    return null;
  }
  let angle = 180;
  let colorParts = parts;
  const first = parts[0].trim().toLowerCase();
  if (first.endsWith("deg")) {
    angle = Number.parseFloat(first);
    colorParts = parts.slice(1);
  } else if (first.startsWith("to ")) {
    angle = cssGradientDirectionToAngle(first);
    colorParts = parts.slice(1);
  }
  const stops = colorParts
    .map((part, index) => parseCssGradientStop(part, index, colorParts.length))
    .filter(Boolean)
    .slice(0, 6);
  if (stops.length < 2) {
    return null;
  }
  return {
    type: "linear",
    angle,
    stops
  };
}

function parseCssRadialGradient(value) {
  const text = extractCssFunction(value, "radial-gradient");
  if (!text) {
    return null;
  }
  const inner = text.replace(/^radial-gradient\(/i, "").replace(/\)\s*$/, "");
  const parts = splitCssFunctionArgs(inner);
  if (parts.length < 2) {
    return null;
  }
  const colorParts = parts.filter((part) => /(rgba?\(|#[0-9a-f]{3,8})/i.test(part));
  const stops = colorParts
    .map((part, index) => parseCssGradientStop(part, index, colorParts.length))
    .filter(Boolean)
    .slice(0, 6);
  if (stops.length < 2) {
    return null;
  }
  return {
    type: "radial",
    stops
  };
}

function extractCssFunction(value, functionName) {
  const text = String(value || "");
  const lower = text.toLowerCase();
  const needle = `${functionName.toLowerCase()}(`;
  const start = lower.indexOf(needle);
  if (start < 0) {
    return "";
  }
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }
  return "";
}

function splitCssFunctionArgs(value) {
  const args = [];
  let current = "";
  let depth = 0;
  for (const character of String(value || "")) {
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth = Math.max(0, depth - 1);
    }
    if (character === "," && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim()) {
    args.push(current.trim());
  }
  return args;
}

function parseCssGradientStop(value, index, count) {
  const colorMatch = String(value || "").match(/(rgba?\([^)]+\)|#[0-9a-f]{3,8})/i);
  if (!colorMatch) {
    return null;
  }
  const color = parseCssColor(colorMatch[1]);
  if (!color) {
    return null;
  }
  const rest = String(value || "").replace(colorMatch[1], "").trim();
  const percent = rest.match(/(-?\d+(?:\.\d+)?)%/);
  const position = percent
    ? cssUtilsClampNumber(Number.parseFloat(percent[1]) / 100, 0, 1, index / Math.max(1, count - 1))
    : index / Math.max(1, count - 1);
  return {
    color: cssUtilsRgbToHex(color.r, color.g, color.b),
    opacity: cssUtilsClampNumber(color.a, 0, 1, 1),
    position
  };
}

function cssGradientDirectionToAngle(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("right")) return 90;
  if (text.includes("left")) return 270;
  if (text.includes("top")) return 0;
  return 180;
}

function parseCssBoxShadow(value, scaleY) {
  const numbers = String(value || "").match(/-?\d+(?:\.\d+)?px/g) || [];
  const color = parseCssColor((String(value || "").match(/rgba?\([^)]+\)/i) || [])[0]);
  return {
    y: Math.round((Number.parseFloat(numbers[1]) || 0) * scaleY),
    blur: Math.round((Number.parseFloat(numbers[2]) || 12) * scaleY),
    opacity: color ? Math.max(0.02, Math.min(0.35, color.a)) : 0.12
  };
}

function parseCssLineHeight(style, fontSize) {
  const value = style.lineHeight;
  if (!value || value === "normal") {
    return fontSize * 1.25;
  }
  if (value.endsWith("px")) {
    return Number.parseFloat(value) || fontSize * 1.25;
  }
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric * fontSize : fontSize * 1.25;
}

function normalizeCssFontWeight(value) {
  if (value === "bold") {
    return 700;
  }
  if (value === "normal") {
    return 400;
  }
  return cssUtilsClampNumber(Number.parseInt(value, 10), 100, 900, 400);
}

function readCssBackground(style) {
  if (!style) {
    return "";
  }
  return [
    style.backgroundImage,
    style.background,
    style.backgroundColor
  ].filter(Boolean).join(", ");
}

function scaleCssRadius(value, scaleX, scaleY) {
  const radius = Number.parseFloat(String(value || "0").split(" ")[0]);
  return Math.max(0, Math.round((Number.isFinite(radius) ? radius : 0) * Math.min(scaleX, scaleY)));
}

function scaleWebToFigmaRadius(style, scaleX, scaleY) {
  const radius =
    style.borderRadius ||
    style.borderTopLeftRadius ||
    style.borderTopRightRadius ||
    style.borderBottomRightRadius ||
    style.borderBottomLeftRadius ||
    "0";
  return scaleCssRadius(radius, scaleX, scaleY);
}

function scaleWebToFigmaRadii(style, scaleX, scaleY) {
  if (!style) {
    return null;
  }
  const radii = {
    topLeft: scaleCssRadius(style.borderTopLeftRadius || style.borderRadius || "0", scaleX, scaleY),
    topRight: scaleCssRadius(style.borderTopRightRadius || style.borderRadius || "0", scaleX, scaleY),
    bottomRight: scaleCssRadius(style.borderBottomRightRadius || style.borderRadius || "0", scaleX, scaleY),
    bottomLeft: scaleCssRadius(style.borderBottomLeftRadius || style.borderRadius || "0", scaleX, scaleY)
  };
  const values = Object.values(radii);
  return values.some((value) => value !== values[0]) ? radii : null;
}

function createCssClipPathSvg(value, width, height, fill = "#ffffff", opacity = 1) {
  const polygon = extractCssFunction(value, "polygon");
  const targetWidth = Number(width);
  const targetHeight = Number(height);
  if (!polygon || !Number.isFinite(targetWidth) || targetWidth <= 0 || !Number.isFinite(targetHeight) || targetHeight <= 0) {
    return "";
  }
  const inner = polygon.replace(/^polygon\(/i, "").replace(/\)\s*$/, "");
  let parts = splitCssFunctionArgs(inner);
  if (/^(?:evenodd|nonzero)$/i.test(parts[0] || "")) {
    parts = parts.slice(1);
  }
  const points = parts.map((part) => {
    const coordinates = String(part || "").trim().split(/\s+/);
    if (coordinates.length < 2) {
      return null;
    }
    const x = parseCssClipCoordinate(coordinates[0], targetWidth);
    const y = parseCssClipCoordinate(coordinates[1], targetHeight);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }).filter(Boolean);
  if (points.length < 3) {
    return "";
  }
  const paint = createCssClipSvgPaint(fill);
  const path = `M${formatCssClipNumber(points[0].x)} ${formatCssClipNumber(points[0].y)}${
    points.slice(1).map((point) => `L${formatCssClipNumber(point.x)} ${formatCssClipNumber(point.y)}`).join("")
  }Z`;
  const fillOpacity = cssUtilsClampNumber(Number(opacity) * paint.opacity, 0, 1, 1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${formatCssClipNumber(targetWidth)}" height="${formatCssClipNumber(targetHeight)}" viewBox="0 0 ${formatCssClipNumber(targetWidth)} ${formatCssClipNumber(targetHeight)}">${paint.defs}<path d="${path}" fill="${paint.fill}" fill-opacity="${formatCssClipNumber(fillOpacity)}"/></svg>`;
}

function createCssClipSvgPaint(value) {
  if (value && typeof value === "object" && Array.isArray(value.stops) && value.stops.length >= 2) {
    const stops = value.stops.map((stop) => {
      const color = parseCssColor(stop.color) || { r: 255, g: 255, b: 255, a: 1 };
      const offset = cssUtilsClampNumber(Number(stop.position), 0, 1, 0);
      const stopOpacity = cssUtilsClampNumber(Number(stop.opacity) * color.a, 0, 1, 1);
      return `<stop offset="${formatCssClipNumber(offset * 100)}%" stop-color="${cssUtilsRgbToHex(color.r, color.g, color.b)}" stop-opacity="${formatCssClipNumber(stopOpacity)}"/>`;
    }).join("");
    if (value.type === "radial") {
      return {
        defs: `<defs><radialGradient id="clipGradient" cx="50%" cy="50%" r="50%">${stops}</radialGradient></defs>`,
        fill: "url(#clipGradient)",
        opacity: 1
      };
    }
    const angle = Number(value.angle) || 180;
    const radians = angle * Math.PI / 180;
    const x1 = 50 - Math.sin(radians) * 50;
    const y1 = 50 + Math.cos(radians) * 50;
    const x2 = 50 + Math.sin(radians) * 50;
    const y2 = 50 - Math.cos(radians) * 50;
    return {
      defs: `<defs><linearGradient id="clipGradient" x1="${formatCssClipNumber(x1)}%" y1="${formatCssClipNumber(y1)}%" x2="${formatCssClipNumber(x2)}%" y2="${formatCssClipNumber(y2)}%">${stops}</linearGradient></defs>`,
      fill: "url(#clipGradient)",
      opacity: 1
    };
  }
  const color = parseCssColor(value) || { r: 255, g: 255, b: 255, a: 1 };
  return {
    defs: "",
    fill: cssUtilsRgbToHex(color.r, color.g, color.b),
    opacity: color.a
  };
}

function parseCssClipCoordinate(value, dimension) {
  const text = String(value || "").trim();
  if (text.endsWith("%")) {
    return (Number.parseFloat(text) / 100) * dimension;
  }
  if (text.endsWith("px") || /^-?\d+(?:\.\d+)?$/.test(text)) {
    return Number.parseFloat(text);
  }
  return Number.NaN;
}

function formatCssClipNumber(value) {
  return Number(Number(value).toFixed(2)).toString();
}

function cssImageScaleMode(style, referenceAssetId) {
  if (referenceAssetId) {
    return "FIT";
  }
  const objectFit = String(style?.objectFit || "").toLowerCase();
  const backgroundSize = String(style?.backgroundSize || "").toLowerCase();
  if (objectFit === "contain" || backgroundSize.includes("contain")) {
    return "FIT";
  }
  if (objectFit === "cover" || backgroundSize.includes("cover")) {
    return "FILL";
  }
  return "FIT";
}

function cssUtilsRgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => cssUtilsClampNumber(value, 0, 255, 0).toString(16).padStart(2, "0")).join("")}`;
}

if (typeof module !== "undefined") {
  module.exports = {
    cssImageScaleMode,
    createCssClipPathSvg,
    extractSolidCssColor,
    extractSolidCssPaint,
    normalizeCssFontWeight,
    parseCssBoxShadow,
    parseCssColor,
    parseFigmaCompatibleCssGradient,
    parseCssGradient,
    parseCssGradientStop,
    parseCssLineHeight,
    readCssBackground,
    scaleCssRadius,
    scaleWebToFigmaRadii,
    scaleWebToFigmaRadius
  };
}
