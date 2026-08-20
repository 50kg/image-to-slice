const test = require("node:test");
const assert = require("node:assert/strict");

const { createManualModeRuntime } = require("../../src/plugin/manual-mode-runtime");

function createNode(type) {
  return {
    type,
    children: [],
    removed: false,
    setPluginData(key, value) { this.pluginData = { ...(this.pluginData || {}), [key]: value }; },
    appendChild(child) {
      const previous = child.parent;
      if (previous?.children) previous.children = previous.children.filter((candidate) => candidate !== child);
      child.parent = this;
      this.children.push(child);
    },
    resize(width, height) { this.width = width; this.height = height; },
    remove() {
      this.removed = true;
      if (this.parent?.children) this.parent.children = this.parent.children.filter((candidate) => candidate !== this);
    }
  };
}

function createFigmaApi() {
  const page = createNode("PAGE");
  page.selection = [];
  const pages = [page];
  const api = {
    currentPage: page,
    viewport: { center: { x: 0, y: 0 }, scrollAndZoomIntoView(nodes) { this.lastNodes = nodes; } },
    base64Decode: () => new Uint8Array([1]),
    createImage: () => ({ hash: "image-hash" }),
    createFrame: () => createNode("FRAME"),
    createRectangle: () => createNode("RECTANGLE"),
    createText: () => createNode("TEXT"),
    loadFontAsync: async () => {},
    createPage() {
      const newPage = createNode("PAGE");
      newPage.selection = [];
      pages.push(newPage);
      return newPage;
    },
    pages
  };
  return api;
}

function createPayload(overrides = {}) {
  return {
    document: {
      version: "1.0",
      meta: { name: "Manual poster", width: 600, height: 800, backgroundColor: "#F0F0F0" },
      background: { type: "image", src: "background.png" },
      elements: [
        { type: "text", name: "Title", text: "Hello", x: 20, y: 30, width: 200, height: 40, style: { fontSize: 24, textAlign: "center" } },
        { type: "image", name: "Photo", src: "photo.png", x: 100, y: 120, width: 240, height: 300, fit: "fit" },
        { type: "group", name: "Button", x: 20, y: 700, width: 160, height: 50, children: [
          { type: "rectangle", name: "Button background", x: 0, y: 0, width: 160, height: 50, style: { fill: "#2255FF", cornerRadius: 12 } }
        ] }
      ]
    },
    assetMap: {
      "background.png": "data:image/png;base64,AQ==",
      "photo.png": "data:image/png;base64,AQ=="
    },
    target: "current-page",
    backgroundMode: "image-node",
    ...overrides
  };
}

test("manual runtime creates ordered editable layers and nested containers", async () => {
  const figmaApi = createFigmaApi();
  const messages = [];
  const runtime = createManualModeRuntime({ figmaApi, postMessage: (message) => messages.push(message) });

  assert.equal(await runtime.handle({ type: "create-manual-design-screen", requestId: "r1", payload: createPayload() }), true);
  assert.equal(figmaApi.currentPage.children.length, 1);
  const frame = figmaApi.currentPage.children[0];
  assert.equal(frame.name, "Manual poster");
  assert.deepEqual(frame.children.map((node) => node.name), ["背景图", "Title", "Photo", "Button"]);
  assert.equal(frame.children[0].locked, true);
  assert.equal(frame.children[1].characters, "Hello");
  assert.equal(frame.children[1].textAlignHorizontal, "CENTER");
  assert.equal(frame.children[2].fills[0].scaleMode, "FIT");
  assert.equal(frame.children[3].children[0].name, "Button background");
  assert.deepEqual(messages, [{ type: "manual-import-success", requestId: "r1", createdCount: 4, frameName: "Manual poster" }]);
});

test("manual runtime can use the background as frame fill and create a page", async () => {
  const figmaApi = createFigmaApi();
  const messages = [];
  const runtime = createManualModeRuntime({ figmaApi, postMessage: (message) => messages.push(message) });
  const payload = createPayload({ target: "new-page", backgroundMode: "frame-fill" });

  await runtime.handle({ type: "create-manual-design-screen", requestId: "r2", payload });
  assert.equal(figmaApi.pages.length, 2);
  assert.equal(figmaApi.currentPage.name, "Manual poster - 手动导入");
  assert.equal(figmaApi.currentPage.children[0].fills[0].type, "IMAGE");
  assert.equal(figmaApi.currentPage.children[0].children[0].name, "Title");
  assert.equal(messages[0].type, "manual-import-success");
});

test("manual runtime returns a request-scoped error for missing assets", async () => {
  const figmaApi = createFigmaApi();
  const messages = [];
  const runtime = createManualModeRuntime({ figmaApi, postMessage: (message) => messages.push(message) });
  const payload = createPayload({ assetMap: { "background.png": "data:image/png;base64,AQ==" } });

  await runtime.handle({ type: "create-manual-design-screen", requestId: "r3", payload });
  assert.equal(figmaApi.currentPage.children.length, 0);
  assert.equal(messages[0].operation, "manual-import");
  assert.equal(messages[0].requestId, "r3");
  assert.match(messages[0].message, /photo\.png/);
});

test("manual runtime ignores unrelated plugin messages", async () => {
  const runtime = createManualModeRuntime({ figmaApi: createFigmaApi(), postMessage: () => {} });
  assert.equal(await runtime.handle({ type: "other" }), false);
});
