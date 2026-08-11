const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createUiAssetScreen,
  createEditableDesignScreen
} = require("../src/plugin/screen-importer");
const {
  createSimulatorFigmaApi
} = require("../src/simulator/figma-api");
const {
  createSimulatorRenderTree
} = require("../src/simulator/canvas-renderer");
const {
  createScreenImportRuntime
} = require("../src/plugin/screen-import-runtime");
const {
  createFigExportApi
} = require("../src/fig-export/figma-api-adapter");

test("simulator runs the real editable importer for image, SVG, and text nodes", async () => {
  const figmaApi = createSimulatorFigmaApi();
  const progress = [];
  const result = await createEditableDesignScreen({
    figmaApi,
    manifest: {
      screen: { name: "模拟画板", width: 750, height: 1334, fill: "#fff" },
      nodes: [
        { type: "image", name: "切图", x: 0, y: 0, width: 100, height: 80, dataUrl: "data:image/png;base64,iVBORw0KGgo=" },
        { type: "svg", name: "矢量", x: 100, y: 0, width: 40, height: 40, svgData: '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>' },
        { type: "text", name: "文字", x: 0, y: 100, width: 100, height: 20, text: "测试" }
      ]
    },
    onProgress: (entry) => progress.push(entry)
  });

  const frame = figmaApi.currentPage.children.find((node) => node.name === "模拟画板");
  assert.deepEqual(frame.children.map((node) => node.type), ["RECTANGLE", "VECTOR", "TEXT"]);
  assert.equal(frame.children[0].fills[0].type, "IMAGE");
  assert.match(frame.children[1].svgData, /^<svg/);
  assert.equal(frame.children[2].characters, "测试");
  const renderedFrame = createSimulatorRenderTree(figmaApi).find((node) => node.name === "模拟画板");
  assert.deepEqual(renderedFrame.children.map((node) => node.kind), ["image", "svg", "text"]);
  assert.match(renderedFrame.children[0].source, /^data:image\/png;base64,/);
  assert.match(renderedFrame.children[1].source, /^data:image\/svg\+xml/);
  assert.deepEqual(result, { createdCount: 3, skipped: [], groupedCount: 0, groupWarnings: [] });
  assert.deepEqual(progress.at(-1), {
    createdCount: 3,
    processedCount: 3,
    totalCount: 3,
    skippedCount: 0
  });
});

test("simulator runs the real slice importer and keeps preview plus cut assets", async () => {
  const figmaApi = createSimulatorFigmaApi();
  await createUiAssetScreen({
    figmaApi,
    notifyRecoverableError() {},
    manifest: {
      screen: { name: "切图画板", width: 100, height: 100 },
      previewImage: { dataUrl: "data:image/png;base64,iVBORw0KGgo=" },
      assets: [{
        id: "asset-1",
        name: "商品切图",
        dataUrl: "data:image/png;base64,iVBORw0KGgo=",
        selected: true,
        placement: { x: 10, y: 20, width: 30, height: 40 }
      }]
    }
  });

  const frame = figmaApi.currentPage.children.find((node) => node.name === "切图画板");
  assert.equal(frame.children.length, 2);
  assert.equal(frame.children[0].name, "preview_full_ui_reference");
  assert.equal(frame.children[1].name, "商品切图");
  assert.equal(frame.children[1].fills[0].type, "IMAGE");
  assert.deepEqual(figmaApi.currentPage.selection, [frame]);
});

test("simulator import runtime mirrors Figma progress and success messages", async () => {
  const figmaApi = createSimulatorFigmaApi();
  const messages = [];
  const runtime = createScreenImportRuntime({
    figmaApi,
    postMessage: (message) => messages.push(message),
    onImported() {}
  });

  await runtime.handle({
    type: "create-editable-design-screen",
    requestId: "figma-import-3",
    manifest: {
      screen: { width: 100, height: 100 },
      nodes: [{ type: "rect", width: 20, height: 20, fill: "#fff" }]
    }
  });

  assert.equal(messages[0].type, "import-progress");
  assert.deepEqual(messages.at(-1), {
    type: "import-success",
    importType: "editable",
    requestId: "figma-import-3",
    createdCount: 1,
    skipped: [],
    groupedCount: 0,
    groupWarnings: []
  });
});

test("fig export and simulator adapters expose the same Figma-facing node tree", async () => {
  const manifest = {
    screen: { name: "兼容画板", width: 200, height: 300, fill: "#fff" },
    nodes: [
      {
        type: "rectangle",
        name: "卡片",
        x: 10,
        y: 20,
        width: 100,
        height: 60,
        fill: "#eee",
        semanticGroupId: "card",
        semanticGroupName: "卡片组"
      },
      {
        type: "rectangle",
        name: "图标底",
        x: 30,
        y: 40,
        width: 20,
        height: 20,
        fill: "#ccc",
        semanticGroupId: "card",
        semanticGroupName: "卡片组"
      },
      { type: "text", name: "标题", x: 20, y: 30, width: 80, height: 24, text: "测试" }
    ]
  };
  const figExportApi = createFigExportApi();
  const simulatorApi = createSimulatorFigmaApi();

  await createEditableDesignScreen({ figmaApi: figExportApi, manifest });
  await createEditableDesignScreen({ figmaApi: simulatorApi, manifest });

  const readTree = (api) => api.currentPage.children.map((node) => ({
    type: node.type,
    name: node.name,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    children: node.children.map((child) => ({
      type: child.type,
      name: child.name,
      x: child.x,
      y: child.y,
      width: child.width,
      height: child.height,
      children: child.children.map((grandchild) => ({
        type: grandchild.type,
        name: grandchild.name,
        x: grandchild.x,
        y: grandchild.y,
        width: grandchild.width,
        height: grandchild.height
      }))
    }))
  }));
  assert.deepEqual(readTree(figExportApi), readTree(simulatorApi));
});
