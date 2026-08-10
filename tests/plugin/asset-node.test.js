const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createImageRectangle,
  createSvgAssetNode,
  createAssetNode,
  applyAssetCornerRadius
} = require("../../src/plugin/asset-node");

test("createImageRectangle builds image-filled rectangle with normalized scale mode", async () => {
  const rectangle = {
    resizeCalls: [],
    resize(width, height) {
      this.resizeCalls.push([width, height]);
    }
  };
  const figmaApi = {
    base64Decode: () => new Uint8Array([1, 2, 3]),
    createImage(bytes) {
      assert.deepEqual(Array.from(bytes), [1, 2, 3]);
      return { hash: "image-hash" };
    },
    createRectangle() {
      return rectangle;
    }
  };

  const node = await createImageRectangle({
    figmaApi,
    name: "preview",
    imageDataUrl: "data:image/png;base64,AQID",
    width: 120,
    height: 80,
    scaleMode: "fill"
  });

  assert.equal(node.name, "preview");
  assert.deepEqual(node.resizeCalls, [[120, 80]]);
  assert.deepEqual(node.fills, [{
    type: "IMAGE",
    scaleMode: "FILL",
    imageHash: "image-hash"
  }]);
});

test("createSvgAssetNode creates and resizes SVG nodes", () => {
  const svgNode = {
    resizeCalls: [],
    resize(width, height) {
      this.resizeCalls.push([width, height]);
    }
  };
  const figmaApi = {
    createNodeFromSvg(svgData) {
      assert.equal(svgData, "<svg />");
      return svgNode;
    }
  };

  const node = createSvgAssetNode({
    figmaApi,
    name: "icon",
    svgData: "<svg />",
    width: 24,
    height: 32
  });

  assert.equal(node.name, "icon");
  assert.deepEqual(node.resizeCalls, [[24, 32]]);
});

test("createAssetNode falls back to PNG when SVG creation fails", async () => {
  const notices = [];
  const imageNode = {};
  const figmaApi = {
    base64Decode: () => new Uint8Array([1]),
    createNodeFromSvg() {
      throw new Error("bad svg");
    },
    createImage() {
      return { hash: "fallback-hash" };
    },
    createRectangle() {
      return {
        resize() {}
      };
    }
  };

  Object.assign(imageNode, await createAssetNode({
    figmaApi,
    notifyRecoverableError: (message, error) => notices.push([message, error.message]),
    asset: {
      name: "fallback",
      svgData: "<svg />",
      dataUrl: "data:image/png;base64,AQ==",
      placement: { width: 10, height: 20 },
      radius: null
    }
  }));

  assert.equal(imageNode.name, "fallback");
  assert.deepEqual(imageNode.fills[0], {
    type: "IMAGE",
    scaleMode: "FIT",
    imageHash: "fallback-hash"
  });
  assert.deepEqual(notices, [["SVG 回填失败，已回退 PNG", "bad svg"]]);
});

test("applyAssetCornerRadius prefers independent corner radii", () => {
  const node = {};
  applyAssetCornerRadius(node, {
    name: "corners",
    radius: 99,
    radii: { topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 }
  }, assert.fail);

  assert.deepEqual(node, {
    topLeftRadius: 1,
    topRightRadius: 2,
    bottomRightRadius: 3,
    bottomLeftRadius: 4
  });
});
