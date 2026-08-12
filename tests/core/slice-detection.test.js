const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ALLOWED_SLICE_ASSET_KINDS,
  buildSliceAssetDetectionPrompt,
  buildSliceAssetJsonRepairPrompt,
  parseSliceAssetDetectionText
} = require("../../src/core/slice-detection");

test("buildSliceAssetDetectionPrompt includes exact dimensions and allowed vocabulary", () => {
  const prompt = buildSliceAssetDetectionPrompt({
    width: 750,
    height: 1334,
    sourceImageName: "screen.png"
  });

  assert.match(prompt, /screen\.png/);
  assert.match(prompt, /750x1334/);
  assert.match(prompt, /icon, avatar, illustration, photo, product-image, complex-decoration, complex-chart, logo/);
  assert.match(prompt, /Return JSON only/);
});

test("buildSliceAssetJsonRepairPrompt asks for one valid JSON object", () => {
  const prompt = buildSliceAssetJsonRepairPrompt("```json\n{\"assets\":[]}\n```");

  assert.match(prompt, /Repair the following model output/);
  assert.match(prompt, /Return one valid JSON object only/);
  assert.match(prompt, /"assets"/);
});

test("parseSliceAssetDetectionText parses and clamps valid model assets", () => {
  const result = parseSliceAssetDetectionText(JSON.stringify({
    assets: [
      {
        name: "logo",
        kind: "logo",
        bbox: { x: -4, y: 10.2, width: 32.8, height: 24.1 },
        confidence: 1.5,
        containsEmbeddedText: true,
        reason: "brand mark"
      }
    ]
  }), { width: 100, height: 80 });

  assert.deepEqual(result, {
    assets: [
      {
        name: "logo",
        kind: "logo",
        bbox: { x: 0, y: 10, width: 29, height: 24 },
        confidence: 1,
        containsEmbeddedText: true,
        reason: "brand mark"
      }
    ]
  });
});

test("parseSliceAssetDetectionText normalizes AI names and falls back without Chinese guesses", () => {
  const result = parseSliceAssetDetectionText(JSON.stringify({
    assets: [
      { name: "Woodcarving Course Cover", kind: "photo", bbox: { x: 0, y: 0, width: 20, height: 20 } },
      { name: "木雕课程封面", kind: "photo", bbox: { x: 30, y: 0, width: 20, height: 20 } }
    ]
  }), { width: 100, height: 100 });

  assert.deepEqual(result.assets.map((asset) => asset.name), [
    "woodcarving_course_cover",
    "slice_02"
  ]);
});

test("parseSliceAssetDetectionText filters unsupported kinds and tiny boxes", () => {
  const result = parseSliceAssetDetectionText(JSON.stringify({
    assets: [
      {
        name: "Text",
        kind: "text",
        bbox: { x: 10, y: 10, width: 80, height: 20 },
        confidence: 0.9
      },
      {
        name: "Tiny icon",
        kind: "icon",
        bbox: { x: 1, y: 1, width: 4, height: 4 },
        confidence: 0.9
      },
      {
        name: "",
        kind: "icon",
        bbox: { x: 20, y: 20, width: 12, height: 12 },
        confidence: 0.5
      }
    ]
  }), { width: 100, height: 80 });

  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].name, "slice_03");
  assert.equal(result.assets[0].kind, "icon");
});

test("parseSliceAssetDetectionText throws a readable error for invalid JSON", () => {
  assert.throws(
    () => parseSliceAssetDetectionText("not json", { width: 100, height: 80 }),
    /模型没有返回 JSON 对象/
  );
});

test("ALLOWED_SLICE_ASSET_KINDS exposes the current allowed values", () => {
  assert.deepEqual([...ALLOWED_SLICE_ASSET_KINDS], [
    "icon",
    "avatar",
    "illustration",
    "photo",
    "product-image",
    "complex-decoration",
    "complex-chart",
    "logo"
  ]);
});
