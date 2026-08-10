const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateManifest,
  validateEditableDesignManifest
} = require("../../src/plugin/manifest-validation");

function createValidAssetManifest(overrides = {}) {
  return {
    screen: { width: 390, height: 844 },
    previewImage: { dataUrl: "data:image/png;base64,abc" },
    assets: [
      {
        name: "icon",
        placement: { x: 1, y: 2, width: 24, height: 24 },
        dataUrl: "data:image/png;base64,abc"
      }
    ],
    ...overrides
  };
}

test("validateManifest accepts a valid asset import manifest", () => {
  assert.doesNotThrow(() => validateManifest(createValidAssetManifest()));
});

test("validateManifest requires screen and preview image data", () => {
  assert.throws(() => validateManifest(null), /缺少 screen 或 previewImage 数据/);
  assert.throws(() => validateManifest({ screen: { width: 1, height: 1 } }), /缺少 screen 或 previewImage 数据/);
});

test("validateManifest requires numeric screen dimensions and assets array", () => {
  assert.throws(
    () => validateManifest(createValidAssetManifest({ screen: { width: "390", height: 844 } })),
    /screen\.width 和 screen\.height 必须是数字/
  );
  assert.throws(() => validateManifest(createValidAssetManifest({ assets: null })), /assets 必须是数组/);
});

test("validateManifest requires each asset placement and image or SVG data", () => {
  assert.throws(
    () => validateManifest(createValidAssetManifest({ assets: [{ name: "bad", placement: { x: 0, y: 0, width: 1, height: 1 } }] })),
    /每个 asset 必须包含 name、placement、dataUrl 或 svgData/
  );
  assert.throws(
    () => validateManifest(createValidAssetManifest({ assets: [{ name: "bad", placement: { x: 0, y: Number.NaN, width: 1, height: 1 }, dataUrl: "x" }] })),
    /asset bad 的 placement 坐标必须是数字/
  );
});

test("validateEditableDesignManifest accepts a valid editable design manifest", () => {
  assert.doesNotThrow(() => validateEditableDesignManifest({
    screen: { width: 390, height: 844 },
    nodes: []
  }));
});

test("validateEditableDesignManifest validates required editable design shape", () => {
  assert.throws(() => validateEditableDesignManifest(null), /缺少 editable design screen 数据/);
  assert.throws(
    () => validateEditableDesignManifest({ screen: { width: "390", height: 844 }, nodes: [] }),
    /editable design screen\.width 和 screen\.height 必须是数字/
  );
  assert.throws(
    () => validateEditableDesignManifest({ screen: { width: 390, height: 844 }, nodes: null }),
    /editable design nodes 必须是数组/
  );
});
