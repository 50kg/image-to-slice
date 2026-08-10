const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createHugeiconsStyleSvg,
  normalizeIconName,
  sanitizeSvgColor,
  getHugeiconsPathBody
} = require("../../src/plugin/icon-svg");

test("normalizeIconName maps aliases and normalizes separators", () => {
  assert.equal(normalizeIconName("favorite"), "star");
  assert.equal(normalizeIconName("file-download"), "download");
  assert.equal(normalizeIconName("mini app"), "code");
  assert.equal(normalizeIconName("chevron_right"), "chevronright");
  assert.equal(normalizeIconName(""), "circle");
});

test("sanitizeSvgColor accepts hex colors and falls back for unsafe values", () => {
  assert.equal(sanitizeSvgColor("#abc"), "#abc");
  assert.equal(sanitizeSvgColor("#AABBCC"), "#AABBCC");
  assert.equal(sanitizeSvgColor("red"), "#111318");
  assert.equal(sanitizeSvgColor("url(#paint)"), "#111318");
});

test("getHugeiconsPathBody returns requested icon body or circle fallback", () => {
  assert.match(getHugeiconsPathBody("search"), /circle cx="10\.8"/);
  assert.match(getHugeiconsPathBody("missing"), /circle cx="12"/);
});

test("createHugeiconsStyleSvg builds bounded icon SVG", () => {
  const svg = createHugeiconsStyleSvg({
    name: "favorite",
    color: "#00AAFF",
    width: 18.6,
    height: 0,
    strokeWidth: 99
  });

  assert.match(svg, /^<svg /);
  assert.match(svg, /width="19"/);
  assert.match(svg, /height="24"/);
  assert.match(svg, /stroke="#00AAFF"/);
  assert.match(svg, /stroke-width="5"/);
  assert.match(svg, /M12 3\.6/);
});
