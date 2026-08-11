const { XMLParser } = require("fast-xml-parser");
const makerjs = require("makerjs");
const SvgPath = require("svgpath");
const {
  appendVectorPayloadToDocument,
  cssColorToFigColor
} = require("openfig-core");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  preserveOrder: true,
  processEntities: false
});

const UNSUPPORTED_SVG_PATTERN = /<(?:defs|linearGradient|radialGradient|clipPath|mask|filter|pattern|use|image|text|tspan|foreignObject|style|symbol)\b|\b(?:fill|stroke)\s*=\s*["'](?:url\(|currentColor)|\bstyle\s*=\s*["'][^"']*(?:url\(|currentColor)|\b(?:clip-path|mask|filter)\s*=/i;

function canAppendSvgAsVector(svgData) {
  const source = String(svgData || "");
  return source.trim().length > 0 && !UNSUPPORTED_SVG_PATTERN.test(source);
}

function appendSvgPayload(document, svgData, width, height) {
  const parsed = parser.parse(String(svgData || ""));
  const root = parsed.find((entry) => entry.svg);
  if (!root) throw new Error("SVG 缺少根节点");

  const viewBox = parseViewBox(root[":@"], width, height);
  const entries = [];
  collectSvgEntries(root.svg, root[":@"] || {}, "", entries);
  if (!entries.length) throw new Error("SVG 中没有可转换的图形");

  const fillPaths = [];
  const strokePaths = [];
  const styleOverrideTable = [];
  entries.forEach((entry, index) => {
    const styleID = index + 1;
    const override = { styleID };
    const path = viewBox.x || viewBox.y
      ? new SvgPath(entry.path).translate(-viewBox.x, -viewBox.y).round(4).toString()
      : entry.path;
    if (entry.fill && entry.fill !== "none") {
      override.fillPaints = [createSolidPaint(entry.fill, entry.fillOpacity * entry.opacity)];
      fillPaths.push({
        svgPath: new SvgPath(path).unarc().abs().round(4).toString(),
        styleID,
        windingRule: entry.fillRule
      });
    }
    if (entry.stroke && entry.stroke !== "none" && entry.strokeWidth > 0) {
      const outlinedPath = expandStrokePath(path, entry.strokeWidth, entry.strokeLinejoin);
      override.strokePaints = [createSolidPaint(entry.stroke, entry.strokeOpacity * entry.opacity)];
      override.strokeWeight = entry.strokeWidth;
      override.strokeCap = normalizeStrokeCap(entry.strokeLinecap);
      override.strokeJoin = normalizeStrokeJoin(entry.strokeLinejoin);
      strokePaths.push({ svgPath: outlinedPath, styleID, windingRule: "NONZERO" });
    }
    styleOverrideTable.push(override);
  });

  const payload = appendVectorPayloadToDocument(document, {
    width,
    height,
    normalizedWidth: viewBox.width,
    normalizedHeight: viewBox.height,
    fillPaths,
    strokePaths,
    styleOverrideTable
  });
  return {
    ...payload,
    fillPaints: firstPaint(styleOverrideTable, "fillPaints"),
    strokePaints: firstPaint(styleOverrideTable, "strokePaints"),
    strokeWeight: firstNumber(styleOverrideTable, "strokeWeight"),
    strokeCap: firstValue(styleOverrideTable, "strokeCap"),
    strokeJoin: firstValue(styleOverrideTable, "strokeJoin")
  };
}

function expandStrokePath(path, strokeWidth, strokeLinejoin) {
  const model = makerjs.importer.fromSVGPathData(path, { bezierAccuracy: 0.05 });
  const join = String(strokeLinejoin || "miter").toLowerCase();
  const expanded = makerjs.model.expandPaths(
    model,
    strokeWidth / 2,
    join === "bevel" ? 2 : join === "miter" ? 1 : 0
  );
  const outlined = makerjs.exporter.toSVGPathData(expanded, {
    origin: [0, 0],
    accuracy: 0.001
  });
  if (!outlined) throw new Error("SVG 描边无法转换为闭合轮廓");
  return new SvgPath(outlined).unarc().abs().round(4).toString();
}

function collectSvgEntries(children, inherited, inheritedTransform, output) {
  for (const child of children || []) {
    const tag = Object.keys(child).find((key) => key !== ":@" && key !== "#text");
    if (!tag) continue;
    const attributes = mergeStyle(inherited, child[":@"] || {});
    const transform = [inheritedTransform, attributes.transform].filter(Boolean).join(" ");
    if (["g", "svg", "a"].includes(tag)) {
      collectSvgEntries(child[tag], attributes, transform, output);
      continue;
    }
    const rawPath = elementToPath(tag, attributes);
    if (!rawPath) continue;
    const path = transform
      ? new SvgPath(rawPath).abs().transform(transform).round(4).toString()
      : new SvgPath(rawPath).abs().round(4).toString();
    output.push({
      path,
      fill: attributes.fill === undefined ? "#000000" : String(attributes.fill),
      stroke: attributes.stroke === undefined ? "none" : String(attributes.stroke),
      strokeWidth: numeric(attributes["stroke-width"], 1),
      strokeLinecap: attributes["stroke-linecap"],
      strokeLinejoin: attributes["stroke-linejoin"],
      fillRule: String(attributes["fill-rule"] || "nonzero").toUpperCase() === "EVENODD" ? "EVENODD" : "NONZERO",
      opacity: numeric(attributes.opacity, 1),
      fillOpacity: numeric(attributes["fill-opacity"], 1),
      strokeOpacity: numeric(attributes["stroke-opacity"], 1)
    });
  }
}

function elementToPath(tag, attributes) {
  if (tag === "path") return String(attributes.d || "").trim();
  if (tag === "line") {
    return `M${numeric(attributes.x1, 0)} ${numeric(attributes.y1, 0)}L${numeric(attributes.x2, 0)} ${numeric(attributes.y2, 0)}`;
  }
  if (tag === "polyline" || tag === "polygon") {
    const points = String(attributes.points || "").trim().replace(/,/g, " ").split(/\s+/).map(Number);
    if (points.length < 4 || points.some((value) => !Number.isFinite(value))) return "";
    let path = `M${points[0]} ${points[1]}`;
    for (let index = 2; index < points.length; index += 2) path += `L${points[index]} ${points[index + 1]}`;
    return tag === "polygon" ? `${path}Z` : path;
  }
  if (tag === "circle") {
    const cx = numeric(attributes.cx, 0);
    const cy = numeric(attributes.cy, 0);
    const radius = Math.max(0, numeric(attributes.r, 0));
    return ellipsePath(cx, cy, radius, radius);
  }
  if (tag === "ellipse") {
    return ellipsePath(
      numeric(attributes.cx, 0),
      numeric(attributes.cy, 0),
      Math.max(0, numeric(attributes.rx, 0)),
      Math.max(0, numeric(attributes.ry, 0))
    );
  }
  if (tag === "rect") {
    const x = numeric(attributes.x, 0);
    const y = numeric(attributes.y, 0);
    const width = Math.max(0, numeric(attributes.width, 0));
    const height = Math.max(0, numeric(attributes.height, 0));
    const rx = Math.min(width / 2, Math.max(0, numeric(attributes.rx, numeric(attributes.ry, 0))));
    const ry = Math.min(height / 2, Math.max(0, numeric(attributes.ry, rx)));
    if (!rx && !ry) return `M${x} ${y}H${x + width}V${y + height}H${x}Z`;
    return `M${x + rx} ${y}H${x + width - rx}A${rx} ${ry} 0 0 1 ${x + width} ${y + ry}V${y + height - ry}A${rx} ${ry} 0 0 1 ${x + width - rx} ${y + height}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + height - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
  }
  return "";
}

function ellipsePath(cx, cy, rx, ry) {
  if (!rx || !ry) return "";
  return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
}

function mergeStyle(inherited, attributes) {
  const style = parseStyle(attributes.style);
  return { ...inherited, ...attributes, ...style };
}

function parseStyle(value) {
  const output = {};
  String(value || "").split(";").forEach((declaration) => {
    const separator = declaration.indexOf(":");
    if (separator < 0) return;
    const key = declaration.slice(0, separator).trim();
    const entry = declaration.slice(separator + 1).trim();
    if (key) output[key] = entry;
  });
  return output;
}

function parseViewBox(attributes, fallbackWidth, fallbackHeight) {
  const values = String(attributes?.viewBox || "").trim().split(/[\s,]+/).map(Number);
  if (values.length === 4 && values.every(Number.isFinite)) {
    return { x: values[0], y: values[1], width: Math.max(1, values[2]), height: Math.max(1, values[3]) };
  }
  return {
    x: 0,
    y: 0,
    width: Math.max(1, numeric(attributes?.width, fallbackWidth)),
    height: Math.max(1, numeric(attributes?.height, fallbackHeight))
  };
}

function createSolidPaint(value, opacity) {
  const source = String(value || "#000000");
  const normalized = /^#[0-9a-f]{3}$/i.test(source)
    ? `#${source.slice(1).split("").map((character) => character + character).join("")}`
    : source;
  const color = cssColorToFigColor(normalized) || { r: 0, g: 0, b: 0, a: 1 };
  color.a = Math.min(1, Math.max(0, color.a * opacity));
  return { type: "SOLID", color, opacity: 1, visible: true, blendMode: "NORMAL" };
}

function normalizeStrokeCap(value) {
  const cap = String(value || "NONE").toUpperCase();
  return cap === "BUTT" ? "NONE" : (["ROUND", "SQUARE"].includes(cap) ? cap : "NONE");
}

function normalizeStrokeJoin(value) {
  const join = String(value || "MITER").toUpperCase();
  return ["ROUND", "BEVEL", "MITER"].includes(join) ? join : "MITER";
}

function numeric(value, fallback) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

function firstPaint(table, field) {
  return table.find((entry) => entry[field]?.length)?.[field] || [];
}

function firstNumber(table, field) {
  return Number(table.find((entry) => Number.isFinite(entry[field]))?.[field]) || 0;
}

function firstValue(table, field) {
  return table.find((entry) => entry[field])?.[field];
}

module.exports = {
  appendSvgPayload,
  canAppendSvgAsVector
};
