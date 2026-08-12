const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createEditableNode
} = require("../../src/plugin/editable-node");

function createResizableNode(type) {
  return {
    type,
    children: [],
    resizeCalls: [],
    appendChild(child) {
      this.children.push(child);
    },
    resize(width, height) {
      this.resizeCalls.push([width, height]);
      this.width = width;
      this.height = height;
    }
  };
}

test("createEditableNode creates rectangles for unknown node types", async () => {
  const rectangle = createResizableNode("RECTANGLE");
  const figmaApi = {
    createRectangle: () => rectangle
  };

  const node = await createEditableNode({
    figmaApi,
    definition: {
      type: "unknown",
      name: "Card",
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      fill: "#123456",
      radius: 8,
      stroke: "#ffffff",
      strokeWidth: 2
    }
  });

  assert.equal(node, rectangle);
  assert.equal(node.name, "Card");
  assert.equal(node.x, 10);
  assert.equal(node.y, 20);
  assert.deepEqual(node.resizeCalls, [[100, 50]]);
  assert.equal(node.cornerRadius, 8);
  assert.equal(node.strokeWeight, 2);
});

test("createEditableNode falls back to rectangle when editable image has no data URL", async () => {
  const rectangle = createResizableNode("RECTANGLE");
  const figmaApi = {
    createRectangle: () => rectangle
  };

  const node = await createEditableNode({
    figmaApi,
    definition: {
      type: "image",
      name: "Empty image",
      width: 80,
      height: 40
    }
  });

  assert.equal(node, rectangle);
  assert.equal(node.name, "Empty image");
  assert.equal(node.fills[0].type, "SOLID");
});

test("createEditableNode loads preferred font and creates text nodes", async () => {
  const text = createResizableNode("TEXT");
  const loadedFonts = [];
  const figmaApi = {
    createText: () => text,
    loadFontAsync: async (font) => {
      loadedFonts.push(font);
    }
  };

  const node = await createEditableNode({
    figmaApi,
    definition: {
      type: "text",
      text: "Hello",
      fontWeight: 700,
      fontSize: 18,
      width: 120,
      height: 30
    }
  });

  assert.equal(node, text);
  assert.equal(node.characters, "Hello");
  assert.equal(node.fontSize, 18);
  assert.deepEqual(loadedFonts[0], { family: "PingFang SC", style: "Semibold" });
});

test("createEditableNode ignores non-numeric letter spacing and accepts pixel values", async () => {
  const loadedFonts = [];
  const figmaApi = {
    createText: () => createResizableNode("TEXT"),
    loadFontAsync: async (font) => loadedFonts.push(font)
  };

  const normal = await createEditableNode({
    figmaApi,
    definition: { type: "text", text: "Normal", letterSpacing: "normal", width: 100, height: 20 }
  });
  const pixels = await createEditableNode({
    figmaApi,
    definition: { type: "text", text: "Pixels", letterSpacing: "1.5px", width: 100, height: 20 }
  });

  assert.equal("letterSpacing" in normal, false);
  assert.deepEqual(pixels.letterSpacing, { unit: "PIXELS", value: 1.5 });
  assert.equal(loadedFonts.length, 2);
});

test("createEditableNode creates frames with nested children", async () => {
  const frame = createResizableNode("FRAME");
  const child = createResizableNode("RECTANGLE");
  const figmaApi = {
    createFrame: () => frame,
    createRectangle: () => child
  };

  const node = await createEditableNode({
    figmaApi,
    definition: {
      type: "frame",
      name: "Group",
      width: 200,
      height: 100,
      children: [
        { type: "rectangle", name: "Child", width: 20, height: 10 }
      ]
    }
  });

  assert.equal(node, frame);
  assert.equal(node.children.length, 1);
  assert.equal(node.children[0].name, "Child");
});
