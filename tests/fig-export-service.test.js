const test = require("node:test");
const assert = require("node:assert/strict");

const { exportFigManifest } = require("../src/fig-export/export-fig");
const { decodeFigDocument } = require("../src/fig-export/fig-codec");

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFgAI/ScL2WQAAAABJRU5ErkJggg==";

test("exportFigManifest dispatches slice manifests through the existing importer", async () => {
  const bytes = await exportFigManifest({
    kind: "slice",
    manifest: {
      screen: { name: "Slice", width: 100, height: 200 },
      previewImage: { dataUrl: PIXEL },
      assets: []
    }
  });
  assert.equal(decodeFigDocument(bytes).nodes.some((node) => node.name === "Slice"), true);
});

test("exportFigManifest dispatches editable manifests through the existing importer", async () => {
  const bytes = await exportFigManifest({
    kind: "editable",
    manifest: {
      screen: { name: "Editable", width: 100, height: 200 },
      nodes: []
    }
  });
  assert.equal(decodeFigDocument(bytes).nodes.some((node) => node.name === "Editable"), true);
});

test("exportFigManifest rejects unknown export kinds", async () => {
  await assert.rejects(
    exportFigManifest({ kind: "unknown", manifest: {} }),
    /不支持的 .fig 导出类型/
  );
});

