const test = require("node:test");
const assert = require("node:assert/strict");

const {
  markEditableDesignFrame,
  getSelectedFigmaFrame,
  serializeFigmaFrame
} = require("../../src/plugin/figma-frame-serializer");

function createFrame({ marked = false } = {}) {
  const pluginData = {};
  const frame = {
    id: "1:2",
    type: "FRAME",
    name: "Editable",
    setPluginData(key, value) {
      pluginData[key] = value;
    },
    getPluginData(key) {
      return pluginData[key] || "";
    }
  };
  if (marked) markEditableDesignFrame(frame, { version: "editable-design-1" });
  return frame;
}

function createFigmaApi(selection) {
  return {
    currentPage: { selection }
  };
}

test("getSelectedFigmaFrame accepts an unmarked frame", () => {
  const frame = createFrame();
  assert.equal(getSelectedFigmaFrame(createFigmaApi([frame])), frame);
});

test("getSelectedFigmaFrame reports export-specific selection errors", () => {
  assert.throws(
    () => getSelectedFigmaFrame(createFigmaApi([])),
    { message: "请选择一个要导出 HTML 的完整 Figma 画板" }
  );
  assert.throws(
    () => getSelectedFigmaFrame(createFigmaApi([createFrame(), createFrame()])),
    { message: "一次只能导出一个完整 Figma 画板" }
  );
  assert.throws(
    () => getSelectedFigmaFrame(createFigmaApi([{ type: "TEXT" }])),
    { message: "请选择完整 Figma 画板，不要选择画板内的子图层" }
  );
});

test("serializeFigmaFrame creates a deterministic complete-page manifest", () => {
  const frame = createFrame({ marked: true });
  Object.assign(frame, {
    width: 320,
    height: 640,
    clipsContent: true,
    fills: [{ type: "SOLID", color: { r: 1, g: 0.5, b: 0 }, opacity: 0.9 }],
    children: [
      {
        id: "2:1",
        type: "RECTANGLE",
        name: "Card",
        x: 12,
        y: 24,
        width: 296,
        height: 80,
        visible: true,
        opacity: 0.8,
        rotation: 0,
        cornerRadius: 12,
        fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
        strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.1 }],
        strokeWeight: 1,
        effects: [{
          type: "DROP_SHADOW",
          color: { r: 0, g: 0, b: 0, a: 0.2 },
          offset: { x: 0, y: 4 },
          radius: 8,
          visible: true,
          blendMode: "NORMAL"
        }]
      },
      {
        id: "2:2",
        type: "TEXT",
        name: "Title",
        x: 24,
        y: 40,
        width: 120,
        height: 28,
        relativeTransform: [[1, 0, 24], [0, 1, 40]],
        characters: "限时秒杀",
        fontName: { family: "PingFang SC", style: "Semibold" },
        fontSize: 18,
        fontWeight: 600,
        lineHeight: { unit: "PIXELS", value: 24 },
        letterSpacing: { unit: "PERCENT", value: 0 },
        textAlignHorizontal: "LEFT",
        textAlignVertical: "CENTER",
        textDecoration: "UNDERLINE",
        textCase: "ORIGINAL",
        fills: [{ type: "SOLID", color: { r: 0.8, g: 0.1, b: 0.1 } }]
      },
      {
        id: "2:3",
        type: "FRAME",
        name: "Hero",
        x: 0,
        y: 120,
        width: 320,
        height: 180,
        clipsContent: true,
        children: [{
          id: "3:1",
          type: "RECTANGLE",
          name: "Hero image",
          x: 0,
          y: 0,
          width: 320,
          height: 180,
          fills: [{
            type: "IMAGE",
            imageHash: "image-hash",
            scaleMode: "FILL",
            imageTransform: [[1, 0, 0], [0, 1, 0]]
          }]
        }]
      }
    ]
  });

  assert.deepEqual(serializeFigmaFrame(frame), {
    version: "figma-frame-manifest-1",
    source: {
      sourceType: "figma",
      pluginGenerated: true,
      importedManifestVersion: "editable-design-1",
      frameId: "1:2",
      frameName: "Editable"
    },
    screen: {
      name: "Editable",
      width: 320,
      height: 640,
      clipsContent: true,
      fills: [{ type: "SOLID", color: { r: 1, g: 0.5, b: 0 }, opacity: 0.9 }]
    },
    nodes: [
      {
        id: "2:1",
        type: "rectangle",
        figmaType: "RECTANGLE",
        name: "Card",
        x: 12,
        y: 24,
        width: 296,
        height: 80,
        visible: true,
        opacity: 0.8,
        rotation: 0,
        fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
        strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.1 }],
        strokeWeight: 1,
        cornerRadius: 12,
        effects: [{
          type: "DROP_SHADOW",
          color: { r: 0, g: 0, b: 0, a: 0.2 },
          offset: { x: 0, y: 4 },
          radius: 8,
          visible: true,
          blendMode: "NORMAL"
        }]
      },
      {
        id: "2:2",
        type: "text",
        figmaType: "TEXT",
        name: "Title",
        x: 24,
        y: 40,
        width: 120,
        height: 28,
        visible: true,
        opacity: 1,
        rotation: 0,
        relativeTransform: [[1, 0, 24], [0, 1, 40]],
        fills: [{ type: "SOLID", color: { r: 0.8, g: 0.1, b: 0.1 } }],
        characters: "限时秒杀",
        fontFamily: "PingFang SC",
        fontStyle: "Semibold",
        fontSize: 18,
        fontWeight: 600,
        lineHeight: { unit: "PIXELS", value: 24 },
        letterSpacing: { unit: "PERCENT", value: 0 },
        textAlignHorizontal: "LEFT",
        textAlignVertical: "CENTER",
        textDecoration: "UNDERLINE",
        textCase: "ORIGINAL"
      },
      {
        id: "2:3",
        type: "frame",
        figmaType: "FRAME",
        name: "Hero",
        x: 0,
        y: 120,
        width: 320,
        height: 180,
        visible: true,
        opacity: 1,
        rotation: 0,
        clipsContent: true,
        children: [{
          id: "3:1",
          type: "image",
          figmaType: "RECTANGLE",
          name: "Hero image",
          x: 0,
          y: 0,
          width: 320,
          height: 180,
          visible: true,
          opacity: 1,
          rotation: 0,
          fills: [{
            type: "IMAGE",
            imageHash: "image-hash",
            scaleMode: "FILL",
            imageTransform: [[1, 0, 0], [0, 1, 0]]
          }]
        }]
      }
    ],
    warnings: []
  });
});

test("serializeFigmaFrame records a warning instead of failing on mixed values", () => {
  const frame = createFrame({ marked: true });
  Object.assign(frame, {
    width: 320,
    height: 640,
    children: [{
      id: "2:4",
      type: "TEXT",
      name: "Mixed Title",
      x: 0,
      y: 0,
      width: 100,
      height: 24,
      characters: "Mixed",
      fills: Symbol("mixed"),
      fontName: Symbol("mixed"),
      fontSize: Symbol("mixed")
    }]
  });

  const manifest = serializeFigmaFrame(frame);

  assert.equal("fontFamily" in manifest.nodes[0], false);
  assert.equal("fontSize" in manifest.nodes[0], false);
  assert.equal("fills" in manifest.nodes[0], false);
  assert.deepEqual(manifest.warnings, [
    "Editable/Mixed Title.fills 使用混合或不支持的值，已省略",
    "Editable/Mixed Title.fontName 使用混合或不支持的值，已省略",
    "Editable/Mixed Title.fontSize 使用混合或不支持的值，已省略"
  ]);
});
