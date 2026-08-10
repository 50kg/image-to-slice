const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createPluginDataAssetManifest
} = require("../../src/plugin/asset-manifest");

test("createPluginDataAssetManifest preserves stored asset summary rules", () => {
  const placement = { x: 1, y: 2, width: 30, height: 40 };

  assert.deepEqual(createPluginDataAssetManifest({
    id: "asset-1",
    name: "Logo",
    type: "image",
    kind: "logo",
    placement,
    radius: 1200,
    transparent: "yes",
    selected: false,
    svgData: "<svg />"
  }), {
    id: "asset-1",
    name: "Logo",
    type: "image",
    kind: "logo",
    placement,
    radius: 999,
    transparent: true,
    selected: false,
    hasSvg: true
  });
});

test("createPluginDataAssetManifest preserves normalized independent corner radii", () => {
  assert.deepEqual(createPluginDataAssetManifest({
    id: "asset-corners",
    name: "Corners",
    placement: { x: 0, y: 0, width: 20, height: 20 },
    radius: 8,
    radii: { topLeft: 1, topRight: 2, bottomRight: 1200, bottomLeft: -1 }
  }).radii, {
    topLeft: 1,
    topRight: 2,
    bottomRight: 999,
    bottomLeft: 0
  });
});
