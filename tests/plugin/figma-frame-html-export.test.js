const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFigmaGenerationErrorMessage,
  prepareSelectedFigmaFrameHtmlExport
} = require("../../src/plugin/figma-frame-html-export");

test("prepareSelectedFigmaFrameHtmlExport posts an unmarked frame with assets and warnings", async () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00]);
  const frame = {
    id: "1:2",
    type: "FRAME",
    name: "Hand-drawn landing",
    width: 320,
    height: 640,
    children: [
      {
        id: "2:1",
        type: "RECTANGLE",
        name: "Hero",
        fills: [{ type: "IMAGE", imageHash: "hero-hash", scaleMode: "FILL" }]
      },
      {
        id: "2:2",
        type: "VECTOR",
        name: "Broken icon",
        async exportAsync() {
          throw new Error("export unavailable");
        }
      }
    ],
    getPluginData() {
      return "";
    }
  };
  const posted = [];

  const result = await prepareSelectedFigmaFrameHtmlExport({
    requestId: "export-42",
    figmaApi: {
      currentPage: { selection: [frame] },
      getImageByHash(hash) {
        assert.equal(hash, "hero-hash");
        return {
          async getBytesAsync() {
            return bytes;
          }
        };
      }
    },
    postMessage(message) {
      posted.push(message);
    }
  });

  assert.equal(result.manifest.source.pluginGenerated, false);
  assert.equal(result.assets[0].bytes, bytes);
  assert.deepEqual(result.manifest.warnings, [
    "Hand-drawn landing/Broken icon: export unavailable"
  ]);
  assert.equal(posted[0].assets[0].bytes, bytes);
  assert.deepEqual(posted, [{
    type: "figma-frame-html-export-data",
    requestId: "export-42",
    manifest: result.manifest,
    assets: result.assets
  }]);
});

test("prepareSelectedFigmaFrameHtmlExport rejects when the export payload cannot be posted", async () => {
  const frame = {
    id: "1:3",
    type: "FRAME",
    name: "Checkout",
    width: 320,
    height: 640,
    children: [],
    getPluginData() {
      return "";
    }
  };

  await assert.rejects(
    prepareSelectedFigmaFrameHtmlExport({
      requestId: "export-43",
      figmaApi: { currentPage: { selection: [frame] } },
      postMessage() {
        return false;
      }
    }),
    { message: "Figma 画板 HTML 导出数据发送失败" }
  );
});

test("createFigmaGenerationErrorMessage correlates export errors and classifies other operations", () => {
  assert.deepEqual(createFigmaGenerationErrorMessage({
    type: "export-selected-figma-frame-html",
    requestId: "export-44"
  }, "payload too large"), {
    type: "generation-error",
    operation: "figma-frame-html-export",
    requestId: "export-44",
    message: "payload too large"
  });
  assert.deepEqual(createFigmaGenerationErrorMessage({
    type: "create-ui-asset-screen",
    requestId: "import-source-1"
  }, "source import failed"), {
    type: "generation-error",
    operation: "import",
    requestId: "import-source-1",
    message: "source import failed"
  });
  assert.deepEqual(createFigmaGenerationErrorMessage({
    type: "create-editable-design-screen",
    requestId: "import-editable-1"
  }, "editable import failed"), {
    type: "generation-error",
    operation: "import",
    requestId: "import-editable-1",
    message: "editable import failed"
  });
  assert.deepEqual(createFigmaGenerationErrorMessage({
    type: "save-ui-window-state"
  }, "storage failed"), {
    type: "generation-error",
    operation: "general",
    message: "storage failed"
  });
});
