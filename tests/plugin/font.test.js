const test = require("node:test");
const assert = require("node:assert/strict");

const {
  loadPreferredTextFont,
  cjkFontCandidates,
  fontStyleFromWeight
} = require("../../src/plugin/font");

test("cjkFontCandidates maps PingFang bold styles to Semibold", () => {
  assert.equal(cjkFontCandidates("Bold")[0].style, "Semibold");
  assert.equal(cjkFontCandidates("Semi Bold")[0].style, "Semibold");
  assert.equal(cjkFontCandidates("Medium")[0].style, "Medium");
});

test("cjkFontCandidates includes Figma-provided Noto Sans SC after system fonts", () => {
  assert.deepEqual(cjkFontCandidates("Semi Bold").slice(0, 4), [
    { family: "PingFang SC", style: "Semibold" },
    { family: "PingFang SC", style: "Regular" },
    { family: "Microsoft YaHei", style: "Regular" },
    { family: "Noto Sans SC", style: "SemiBold" }
  ]);
});

test("fontStyleFromWeight preserves weight thresholds", () => {
  assert.equal(fontStyleFromWeight(700), "Bold");
  assert.equal(fontStyleFromWeight(600), "Semi Bold");
  assert.equal(fontStyleFromWeight(500), "Medium");
  assert.equal(fontStyleFromWeight(400), "Regular");
  assert.equal(fontStyleFromWeight("bad"), "Regular");
});

test("loadPreferredTextFont uses the first available system CJK font for metric text", async () => {
  const attempts = [];
  const result = await loadPreferredTextFont("$99", "Bold", async (font) => {
    attempts.push(font);
    if (font.family !== "Microsoft YaHei") throw new Error("missing");
  });

  assert.deepEqual(result, { family: "Microsoft YaHei", style: "Bold" });
  assert.deepEqual(attempts.map((font) => font.family), ["PingFang SC", "PingFang SC", "Microsoft YaHei"]);
});

test("loadPreferredTextFont falls back to Inter Regular when all candidates fail", async () => {
  const attempts = [];
  const result = await loadPreferredTextFont("中文", "Medium", async (font) => {
    attempts.push(font);
    if (font.family !== "Inter" || font.style !== "Regular") throw new Error("missing");
  });

  assert.deepEqual(result, { family: "Inter", style: "Regular" });
  assert.deepEqual(attempts.at(-1), { family: "Inter", style: "Regular" });
});
