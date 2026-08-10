const test = require("node:test");
const assert = require("node:assert/strict");

const {
  loadPreferredTextFont,
  numericTextLooksLikeMetric,
  numericFontCandidates,
  cjkFontCandidates,
  fontStyleFromWeight
} = require("../../src/plugin/font");

test("numericTextLooksLikeMetric recognizes metric-like numeric text", () => {
  assert.equal(numericTextLooksLikeMetric("¥ 1,299.00"), true);
  assert.equal(numericTextLooksLikeMetric("+12.5%"), true);
  assert.equal(numericTextLooksLikeMetric("订单 12"), false);
  assert.equal(numericTextLooksLikeMetric("abc"), false);
});

test("numericFontCandidates prefers numeric fonts with legacy style mapping", () => {
  assert.deepEqual(numericFontCandidates("Semi Bold").slice(0, 2), [
    { family: "DIN Alternate", style: "Bold" },
    { family: "DIN Alternate", style: "Bold" }
  ]);
  assert.equal(numericFontCandidates("Medium")[0].style, "Regular");
});

test("cjkFontCandidates maps PingFang bold styles to Semibold", () => {
  assert.equal(cjkFontCandidates("Bold")[0].style, "Semibold");
  assert.equal(cjkFontCandidates("Semi Bold")[0].style, "Semibold");
  assert.equal(cjkFontCandidates("Medium")[0].style, "Medium");
});

test("fontStyleFromWeight preserves weight thresholds", () => {
  assert.equal(fontStyleFromWeight(700), "Bold");
  assert.equal(fontStyleFromWeight(600), "Semi Bold");
  assert.equal(fontStyleFromWeight(500), "Medium");
  assert.equal(fontStyleFromWeight(400), "Regular");
  assert.equal(fontStyleFromWeight("bad"), "Regular");
});

test("loadPreferredTextFont returns first loadable metric font", async () => {
  const attempts = [];
  const result = await loadPreferredTextFont("$99", "Bold", async (font) => {
    attempts.push(font);
    if (font.family !== "DIN Condensed") throw new Error("missing");
  });

  assert.deepEqual(result, { family: "DIN Condensed", style: "Bold" });
  assert.deepEqual(attempts.map((font) => font.family), ["DIN Alternate", "DIN Alternate", "DIN Condensed"]);
});

test("loadPreferredTextFont falls back to Inter Regular when all candidates fail", async () => {
  const attempts = [];
  const result = await loadPreferredTextFont("中文", "Medium", async (font) => {
    attempts.push(font);
    if (attempts.length < 8) throw new Error("missing");
  });

  assert.deepEqual(result, { family: "Inter", style: "Regular" });
  assert.deepEqual(attempts.at(-1), { family: "Inter", style: "Regular" });
});
