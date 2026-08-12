const test = require("node:test");
const assert = require("node:assert/strict");

const {
  cssImageScaleMode,
  extractSolidCssColor,
  extractSolidCssPaint,
  normalizeCssFontWeight,
  parseCssBoxShadow,
  parseCssColor,
  parseFigmaCompatibleCssGradient,
  parseCssGradient,
  parseCssGradientStop,
  parseCssLineHeight,
  sizeCapturedTextBox,
  readCssBackground,
  createCssClipPathSvg,
  scaleCssRadius,
  scaleWebToFigmaRadii,
  scaleWebToFigmaRadius
} = require("../src/ui/services/css-utils");

test("parseCssColor handles rgb rgba hex and transparent colors", () => {
  assert.deepEqual(parseCssColor("rgba(10, 20, 30, 0.5)"), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseCssColor("#0f38"), { r: 0, g: 255, b: 51, a: 0x88 / 255 });
  assert.equal(parseCssColor("transparent"), null);
  assert.equal(extractSolidCssColor("rgba(12, 34, 56, 0.01)"), "");
  assert.equal(extractSolidCssColor("rgb(12, 34, 56)"), "#0c2238");
});

test("solid CSS paint preserves translucent background alpha for Figma fills", () => {
  assert.deepEqual(extractSolidCssPaint("rgba(255, 255, 255, 0.2)"), {
    color: "#ffffff",
    opacity: 0.2
  });
  assert.equal(extractSolidCssPaint("rgba(255, 255, 255, 0.01)"), null);
});

test("parseCssGradient reads linear and radial gradients", () => {
  assert.deepEqual(parseCssGradient("linear-gradient(to right, #000 0%, rgba(255,255,255,.5) 100%)"), {
    type: "linear",
    angle: 90,
    stops: [
      { color: "#000000", opacity: 1, position: 0 },
      { color: "#ffffff", opacity: 0.5, position: 1 }
    ]
  });
  assert.deepEqual(parseCssGradient("radial-gradient(circle, #111 10%, #eee 90%)"), {
    type: "radial",
    stops: [
      { color: "#111111", opacity: 1, position: 0.1 },
      { color: "#eeeeee", opacity: 1, position: 0.9 }
    ]
  });
});

test("parseCssGradient preserves both axes of corner directions", () => {
  const cases = [
    ["to top right", 45],
    ["to bottom right", 135],
    ["to bottom left", 225],
    ["to top left", 315]
  ];

  for (const [direction, angle] of cases) {
    assert.equal(
      parseCssGradient(`linear-gradient(${direction}, #000 0%, #fff 100%)`).angle,
      angle
    );
  }
});

test("Figma gradient parsing rejects multi-layer CSS backgrounds instead of dropping their base color", () => {
  assert.deepEqual(parseFigmaCompatibleCssGradient({
    backgroundImage: "linear-gradient(90deg, #111 0%, #eee 100%)"
  }), {
    type: "linear",
    angle: 90,
    stops: [
      { color: "#111111", opacity: 1, position: 0 },
      { color: "#eeeeee", opacity: 1, position: 1 }
    ]
  });
  assert.equal(parseFigmaCompatibleCssGradient({
    backgroundColor: "rgb(11, 44, 77)",
    backgroundImage: "linear-gradient(90deg, rgba(255,255,255,.025), rgba(0,0,0,0) 100%), none"
  }), null);
  assert.deepEqual(parseFigmaCompatibleCssGradient({
    backgroundColor: "rgba(0, 0, 0, 0)",
    backgroundImage: "linear-gradient(90deg, rgba(255,255,255,.5), rgba(0,0,0,0) 100%)"
  }), {
    type: "linear",
    angle: 90,
    stops: [
      { color: "#ffffff", opacity: 0.5, position: 0 },
      { color: "#000000", opacity: 0, position: 1 }
    ]
  });
  assert.equal(parseFigmaCompatibleCssGradient({
    backgroundImage: [
      "radial-gradient(circle, rgba(255,255,255,.2) 0%, transparent 100%)",
      "linear-gradient(90deg, rgba(0,0,0,.1), transparent)",
      "none"
    ].join(", ")
  }), null);
});

test("Figma gradient parsing keeps an opaque base gradient beneath a translucent overlay", () => {
  assert.deepEqual(parseFigmaCompatibleCssGradient({
    backgroundColor: "rgba(0, 0, 0, 0)",
    backgroundImage: [
      "radial-gradient(circle at 82% 40%, rgba(255, 102, 52, 0.25), transparent 33%)",
      "linear-gradient(104deg, #bd291d 0%, #dc3627 54%, #c8281e 100%)"
    ].join(", ")
  }), {
    type: "linear",
    angle: 104,
    stops: [
      { color: "#bd291d", opacity: 1, position: 0 },
      { color: "#dc3627", opacity: 1, position: 0.54 },
      { color: "#c8281e", opacity: 1, position: 1 }
    ]
  });
});

test("parseCssGradientStop falls back to evenly spaced positions", () => {
  assert.deepEqual(parseCssGradientStop("rgba(10,20,30,.25)", 1, 3), {
    color: "#0a141e",
    opacity: 0.25,
    position: 0.5
  });
});

test("parseCssBoxShadow scales y blur and clamps opacity", () => {
  assert.deepEqual(parseCssBoxShadow("0px 4px 16px rgba(0,0,0,0.8)", 2), {
    y: 8,
    blur: 32,
    opacity: 0.35
  });
});

test("parseCssLineHeight and normalizeCssFontWeight preserve legacy CSS parsing", () => {
  assert.equal(parseCssLineHeight({ lineHeight: "normal" }, 16), 20);
  assert.equal(parseCssLineHeight({ lineHeight: "24px" }, 16), 24);
  assert.equal(parseCssLineHeight({ lineHeight: "1.5" }, 16), 24);
  assert.equal(normalizeCssFontWeight("bold"), 700);
  assert.equal(normalizeCssFontWeight("normal"), 400);
  assert.equal(normalizeCssFontWeight("950"), 900);
  assert.equal(normalizeCssFontWeight("oops"), 400);
});

test("sizeCapturedTextBox rounds fractional glyph width without extra padding", () => {
  assert.deepEqual(sizeCapturedTextBox({
    width: 62.40625,
    height: 37,
    fontSize: 26,
    lineHeight: 38,
    scaleX: 1,
    scaleY: 1
  }), {
    width: 63,
    height: 38
  });
});

test("readCssBackground joins available background fields", () => {
  assert.equal(readCssBackground(null), "");
  assert.equal(readCssBackground({
    backgroundImage: "url(a.png)",
    background: "red",
    backgroundColor: "rgb(1, 2, 3)"
  }), "url(a.png), red, rgb(1, 2, 3)");
});

test("radius helpers scale uniform and per-corner CSS radii", () => {
  assert.equal(scaleCssRadius("12px 4px", 2, 3), 24);
  assert.equal(scaleWebToFigmaRadius({ borderTopLeftRadius: "5px" }, 2, 4), 10);
  assert.equal(scaleWebToFigmaRadii({ borderRadius: "8px" }, 2, 2), null);
  assert.deepEqual(scaleWebToFigmaRadii({
    borderTopLeftRadius: "2px",
    borderTopRightRadius: "4px",
    borderBottomRightRadius: "6px",
    borderBottomLeftRadius: "8px"
  }, 3, 2), {
    topLeft: 4,
    topRight: 8,
    bottomRight: 12,
    bottomLeft: 16
  });
});

test("createCssClipPathSvg converts percentage polygon edges into an editable SVG", () => {
  const svg = createCssClipPathSvg(
    "polygon(0 0, 100% 0, 100% 78%, 92% 50%, 100% 22%, 100% 100%, 0 100%)",
    200,
    40,
    "#367346",
    0.8
  );

  assert.match(svg, /^<svg\b/);
  assert.match(svg, /viewBox="0 0 200 40"/);
  assert.match(svg, /fill="#367346"/);
  assert.match(svg, /fill-opacity="0\.8"/);
  assert.match(svg, /M0 0L200 0L200 31\.2L184 20L200 8\.8L200 40L0 40Z/);
});

test("createCssClipPathSvg preserves a linear gradient inside the polygon", () => {
  const svg = createCssClipPathSvg(
    "polygon(0 0, 91% 0, 100% 10%, 94% 24%, 100% 37%, 95% 50%, 100% 64%, 95% 77%, 98% 90%, 90% 100%, 0 100%)",
    353,
    101,
    parseCssGradient("linear-gradient(90deg, #23673a 0%, #4f945c 52%, #82ad78 100%)"),
    1
  );

  assert.match(svg, /<linearGradient\b/);
  assert.match(svg, /stop-color="#23673a"/);
  assert.match(svg, /stop-color="#4f945c"/);
  assert.match(svg, /stop-color="#82ad78"/);
  assert.match(svg, /fill="url\(#clipGradient\)"/);
});

test("cssImageScaleMode maps cover and contain rules", () => {
  assert.equal(cssImageScaleMode({ objectFit: "cover" }, ""), "FILL");
  assert.equal(cssImageScaleMode({ backgroundSize: "contain no-repeat" }, ""), "FIT");
  assert.equal(cssImageScaleMode({ objectFit: "cover" }, "asset-id"), "FIT");
});
