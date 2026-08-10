const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractFigmaFrameAssets
} = require("../../src/plugin/figma-frame-assets");

function createImageFill(imageHash, scaleMode = "FILL") {
  return { type: "IMAGE", imageHash, scaleMode };
}

function createNode({
  id,
  type = "RECTANGLE",
  name,
  fills = [],
  children = []
}) {
  return { id, type, name, fills, children };
}

function createManifestNode(node) {
  return {
    id: node.id,
    name: node.name,
    fills: node.fills,
    children: node.children.map(createManifestNode)
  };
}

test("extractFigmaFrameAssets reads an original image fill from the selected root frame", async () => {
  const frame = createNode({
    id: "1:1",
    type: "FRAME",
    name: "Landing",
    fills: [createImageFill("root-image-hash")]
  });
  const manifest = {
    screen: { name: "Landing", fills: frame.fills },
    nodes: []
  };

  const result = await extractFigmaFrameAssets({
    figmaApi: {
      getImageByHash(hash) {
        assert.equal(hash, "root-image-hash");
        return {
          async getBytesAsync() {
            return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00]);
          }
        };
      }
    },
    frame,
    manifest
  });

  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].kind, "image-fill");
  assert.equal(result.assets[0].imageHash, "root-image-hash");
  assert.equal(result.assets[0].filename, "landing--img-root-image-hash.png");
  assert.deepEqual(result.warnings, []);
});

test("extractFigmaFrameAssets reads one original image for duplicate FILL hashes", async () => {
  const first = createNode({
    id: "2:1",
    name: "Hero banner",
    fills: [createImageFill("image-hash")]
  });
  const second = createNode({
    id: "2:2",
    name: "Hero duplicate",
    fills: [createImageFill("image-hash")]
  });
  const frame = createNode({ id: "1:1", type: "FRAME", name: "Landing", children: [first, second] });
  const manifest = { nodes: frame.children.map(createManifestNode) };
  let imageReadCount = 0;

  const result = await extractFigmaFrameAssets({
    figmaApi: {
      getImageByHash(hash) {
        assert.equal(hash, "image-hash");
        return {
          async getBytesAsync() {
            imageReadCount += 1;
            return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00]);
          }
        };
      }
    },
    frame,
    manifest
  });

  assert.equal(imageReadCount, 1);
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].kind, "image-fill");
  assert.equal(result.assets[0].imageHash, "image-hash");
  assert.equal(result.assets[0].format, "png");
  assert.equal(result.assets[0].filename, "hero-banner--img-image-hash.png");
  assert.deepEqual(result.warnings, []);
});

test("extractFigmaFrameAssets creates stable globally unique filenames", async () => {
  const nodes = [
    createNode({ id: "2:10", name: "图片", fills: [createImageFill("cn-image-a")] }),
    createNode({ id: "2:11", name: "图片", fills: [createImageFill("cn-image-b")] }),
    createNode({ id: "2:12", name: "Shared", fills: [createImageFill("en-image-a")] }),
    createNode({ id: "2:13", name: "Shared", fills: [createImageFill("en-image-b")] }),
    createNode({ id: "2:14", type: "VECTOR", name: "Shared" })
  ];
  nodes[4].exportAsync = async () => "<svg></svg>";
  const frame = createNode({ id: "1:1", type: "FRAME", name: "Landing", children: nodes });
  const manifest = { nodes: frame.children.map(createManifestNode) };
  const figmaApi = {
    getImageByHash() {
      return {
        async getBytesAsync() {
          return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00]);
        }
      };
    }
  };

  const first = await extractFigmaFrameAssets({ figmaApi, frame, manifest });
  const second = await extractFigmaFrameAssets({ figmaApi, frame, manifest });
  const filenames = first.assets.map((asset) => asset.filename);

  assert.deepEqual(filenames, [
    "asset--img-cn-image-a.png",
    "asset--img-cn-image-b.png",
    "shared--img-en-image-a.png",
    "shared--img-en-image-b.png",
    "shared--node-2-14.svg"
  ]);
  assert.equal(new Set(filenames).size, filenames.length);
  assert.deepEqual(second.assets.map((asset) => asset.filename), filenames);
});

test("extractFigmaFrameAssets records intrinsic image dimensions when available", async () => {
  const imageNode = createNode({
    id: "3:1",
    name: "Tile texture",
    fills: [createImageFill("tile-image-hash", "TILE")]
  });
  const frame = createNode({ id: "1:1", type: "FRAME", name: "Landing", children: [imageNode] });
  const manifest = { nodes: frame.children.map(createManifestNode) };

  const result = await extractFigmaFrameAssets({
    figmaApi: {
      getImageByHash() {
        return {
          async getBytesAsync() {
            return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
          },
          async getSizeAsync() {
            return { width: 640, height: 480 };
          }
        };
      }
    },
    frame,
    manifest
  });

  assert.equal(result.assets[0].intrinsicWidth, 640);
  assert.equal(result.assets[0].intrinsicHeight, 480);
});

test("extractFigmaFrameAssets renders CROP image fills as PNG nodes", async () => {
  const cropNode = createNode({
    id: "2:3",
    name: "Cropped hero",
    fills: [createImageFill("crop-hash", "CROP")]
  });
  const frame = createNode({ id: "1:1", type: "FRAME", name: "Landing", children: [cropNode] });
  const manifest = { nodes: frame.children.map(createManifestNode) };
  let exportSettings;
  cropNode.exportAsync = async (settings) => {
    exportSettings = settings;
    cropNode.exportSettings = settings;
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00]);
  };

  const result = await extractFigmaFrameAssets({ figmaApi: {}, frame, manifest });

  assert.deepEqual(cropNode.exportSettings, {
    format: "PNG",
    constraint: { type: "SCALE", value: 1 },
    contentsOnly: true,
    useAbsoluteBounds: true
  });
  assert.deepEqual(exportSettings, cropNode.exportSettings);
  assert.equal(result.assets[0].nodeId, "2:3");
  assert.equal(result.assets[0].kind, "node-render");
  assert.equal(result.assets[0].format, "png");
});

test("extractFigmaFrameAssets replaces a BOOLEAN_OPERATION without extracting its children", async () => {
  let childExportCount = 0;
  const child = createNode({ id: "6:2", type: "VECTOR", name: "Boolean child" });
  child.exportAsync = async () => {
    childExportCount += 1;
    return "<svg></svg>";
  };
  const booleanNode = createNode({
    id: "6:1",
    type: "BOOLEAN_OPERATION",
    name: "Combined mark",
    children: [child]
  });
  booleanNode.exportAsync = async () => "<svg><path /></svg>";
  const frame = createNode({ id: "1:1", type: "FRAME", name: "Landing", children: [booleanNode] });
  const manifest = { nodes: frame.children.map(createManifestNode) };

  const result = await extractFigmaFrameAssets({ figmaApi: {}, frame, manifest });

  assert.deepEqual(result.assets.map((asset) => asset.nodeId), ["6:1"]);
  assert.equal(result.assets[0].format, "svg");
  assert.equal(childExportCount, 0);
  assert.equal("replacementFailed" in manifest.nodes[0], false);
});

test("extractFigmaFrameAssets marks a failed BOOLEAN replacement and continues its sibling", async () => {
  let childExportCount = 0;
  const child = createNode({ id: "6:4", type: "VECTOR", name: "Failed boolean child" });
  child.exportAsync = async () => {
    childExportCount += 1;
    return "<svg></svg>";
  };
  const failedBoolean = createNode({
    id: "6:3",
    type: "BOOLEAN_OPERATION",
    name: "Failed combined mark",
    children: [child]
  });
  failedBoolean.exportAsync = async () => {
    throw new Error("boolean export unavailable");
  };
  const sibling = createNode({ id: "6:5", type: "VECTOR", name: "Working sibling" });
  sibling.exportAsync = async () => "<svg></svg>";
  const frame = createNode({
    id: "1:1",
    type: "FRAME",
    name: "Landing",
    children: [failedBoolean, sibling]
  });
  const manifest = { nodes: frame.children.map(createManifestNode) };

  const result = await extractFigmaFrameAssets({ figmaApi: {}, frame, manifest });

  assert.deepEqual(result.assets.map((asset) => asset.nodeId), ["6:5"]);
  assert.equal(manifest.nodes[0].replacementFailed, true);
  assert.equal("replacementFailed" in manifest.nodes[1], false);
  assert.equal(childExportCount, 0);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /Landing\/Failed combined mark/);
});

test("extractFigmaFrameAssets stops below a CROP container replacement", async () => {
  let childExportCount = 0;
  const child = createNode({ id: "7:2", type: "VECTOR", name: "Crop child" });
  child.exportAsync = async () => {
    childExportCount += 1;
    return "<svg></svg>";
  };
  const cropFrame = createNode({
    id: "7:1",
    type: "FRAME",
    name: "Crop group",
    fills: [createImageFill("crop-container-hash", "CROP")],
    children: [child]
  });
  cropFrame.exportAsync = async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const frame = createNode({ id: "1:1", type: "FRAME", name: "Landing", children: [cropFrame] });
  const manifest = { nodes: frame.children.map(createManifestNode) };

  const result = await extractFigmaFrameAssets({ figmaApi: {}, frame, manifest });

  assert.deepEqual(result.assets.map((asset) => asset.nodeId), ["7:1"]);
  assert.equal(result.assets[0].format, "png");
  assert.equal(childExportCount, 0);
  assert.equal("replacementFailed" in manifest.nodes[0], false);
});

test("extractFigmaFrameAssets marks a failed CROP container and stops its subtree", async () => {
  let childExportCount = 0;
  const child = createNode({ id: "7:4", type: "VECTOR", name: "Failed crop child" });
  child.exportAsync = async () => {
    childExportCount += 1;
    return "<svg></svg>";
  };
  const cropFrame = createNode({
    id: "7:3",
    type: "FRAME",
    name: "Failed crop group",
    fills: [createImageFill("failed-crop-container-hash", "CROP")],
    children: [child]
  });
  cropFrame.exportAsync = async () => {
    throw new Error("crop export unavailable");
  };
  const sibling = createNode({ id: "7:5", type: "VECTOR", name: "Working crop sibling" });
  sibling.exportAsync = async () => "<svg></svg>";
  const frame = createNode({
    id: "1:1",
    type: "FRAME",
    name: "Landing",
    children: [cropFrame, sibling]
  });
  const manifest = { nodes: frame.children.map(createManifestNode) };

  const result = await extractFigmaFrameAssets({ figmaApi: {}, frame, manifest });

  assert.deepEqual(result.assets.map((asset) => asset.nodeId), ["7:5"]);
  assert.equal(manifest.nodes[0].replacementFailed, true);
  assert.equal("replacementFailed" in manifest.nodes[1], false);
  assert.equal(childExportCount, 0);
  assert.equal(result.warnings.length, 1);
});

test("extractFigmaFrameAssets replaces image paints with unstable opacity or transform", async () => {
  const opacityFill = createImageFill("opacity-hash");
  opacityFill.opacity = 0.5;
  const transformFill = createImageFill("transform-hash");
  transformFill.imageTransform = [[1, 0, 8], [0, 1, 0]];
  const opacityNode = createNode({ id: "8:1", name: "Opacity image", fills: [opacityFill] });
  const transformNode = createNode({ id: "8:2", name: "Transform image", fills: [transformFill] });
  opacityNode.exportAsync = async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  transformNode.exportAsync = async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const frame = createNode({
    id: "1:1",
    type: "FRAME",
    name: "Landing",
    children: [opacityNode, transformNode]
  });
  const manifest = { nodes: frame.children.map(createManifestNode) };

  const result = await extractFigmaFrameAssets({
    figmaApi: {
      getImageByHash() {
        throw new Error("original image should not be read for a replacement");
      }
    },
    frame,
    manifest
  });

  assert.deepEqual(result.assets.map((asset) => asset.nodeId), ["8:1", "8:2"]);
  assert.ok(result.assets.every((asset) => asset.format === "png"));
  assert.deepEqual(result.warnings, []);
});

test("extractFigmaFrameAssets replaces an unstable root frame and stops its children", async () => {
  let childExportCount = 0;
  const child = createNode({ id: "9:2", type: "VECTOR", name: "Root child" });
  child.exportAsync = async () => {
    childExportCount += 1;
    return "<svg></svg>";
  };
  const frame = createNode({
    id: "9:1",
    type: "FRAME",
    name: "Root crop",
    fills: [createImageFill("root-crop-hash", "CROP")],
    children: [child]
  });
  frame.exportAsync = async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const manifest = {
    screen: { name: frame.name, fills: frame.fills },
    nodes: frame.children.map(createManifestNode)
  };

  const result = await extractFigmaFrameAssets({ figmaApi: {}, frame, manifest });

  assert.deepEqual(result.assets.map((asset) => asset.nodeId), ["9:1"]);
  assert.equal(result.assets[0].format, "png");
  assert.equal(childExportCount, 0);
  assert.equal("replacementFailed" in manifest.screen, false);
});

test("extractFigmaFrameAssets marks a failed root CROP replacement and stops all children", async () => {
  let childExportCount = 0;
  const child = createNode({ id: "9:4", type: "VECTOR", name: "Failed root child" });
  child.exportAsync = async () => {
    childExportCount += 1;
    return "<svg></svg>";
  };
  const frame = createNode({
    id: "9:3",
    type: "FRAME",
    name: "Failed root crop",
    fills: [createImageFill("failed-root-crop-hash", "CROP")],
    children: [child]
  });
  frame.exportAsync = async () => {
    throw new Error("root crop export unavailable");
  };
  const manifest = {
    screen: { name: frame.name, fills: frame.fills },
    nodes: frame.children.map(createManifestNode)
  };

  const result = await extractFigmaFrameAssets({ figmaApi: {}, frame, manifest });

  assert.deepEqual(result.assets, []);
  assert.equal(manifest.screen.replacementFailed, true);
  assert.equal("replacementFailed" in manifest.nodes[0], false);
  assert.equal(childExportCount, 0);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /Failed root crop/);
});

test("extractFigmaFrameAssets does not mark an ordinary image read failure as replacement", async () => {
  const imageNode = createNode({
    id: "9:5",
    name: "Missing original image",
    fills: [createImageFill("missing-image-hash")]
  });
  const frame = createNode({ id: "1:1", type: "FRAME", name: "Landing", children: [imageNode] });
  const manifest = { nodes: frame.children.map(createManifestNode) };

  const result = await extractFigmaFrameAssets({
    figmaApi: {
      getImageByHash() {
        throw new Error("image read unavailable");
      }
    },
    frame,
    manifest
  });

  assert.deepEqual(result.assets, []);
  assert.equal("replacementFailed" in manifest.nodes[0], false);
  assert.equal(result.warnings.length, 1);
});

test("extractFigmaFrameAssets renders vector leaves as SVG", async () => {
  const vector = createNode({ id: "2:4", type: "VECTOR", name: "Logo" });
  vector.exportAsync = async (settings) => {
    assert.deepEqual(settings, {
      format: "SVG_STRING",
      contentsOnly: true,
      useAbsoluteBounds: true
    });
    return "<svg viewBox=\"0 0 1 1\"></svg>";
  };
  const frame = createNode({ id: "1:1", type: "FRAME", name: "Landing", children: [vector] });
  const manifest = { nodes: frame.children.map(createManifestNode) };
  manifest.nodes[0].id = "stale-manifest-id";

  const result = await extractFigmaFrameAssets({ figmaApi: {}, frame, manifest });
  const vectorAsset = result.assets[0];

  assert.equal(vectorAsset.nodeId, "2:4");
  assert.equal(vectorAsset.format, "svg");
  assert.match(vectorAsset.text, /^<svg/);
});

test("extractFigmaFrameAssets records relative render bounds for node replacements", async () => {
  const shadowVector = createNode({ id: "10:1", type: "VECTOR", name: "Shadow logo" });
  shadowVector.absoluteBoundingBox = { x: 100, y: 200, width: 40, height: 30 };
  shadowVector.absoluteRenderBounds = { x: 96, y: 194, width: 50, height: 45 };
  shadowVector.exportAsync = async () => "<svg></svg>";
  const plainVector = createNode({ id: "10:2", type: "VECTOR", name: "Plain logo" });
  plainVector.exportAsync = async () => "<svg></svg>";
  const frame = createNode({
    id: "1:1",
    type: "FRAME",
    name: "Landing",
    children: [shadowVector, plainVector]
  });
  const manifest = { nodes: frame.children.map(createManifestNode) };

  const result = await extractFigmaFrameAssets({ figmaApi: {}, frame, manifest });

  assert.deepEqual(result.assets[0].renderBounds, {
    x: -4,
    y: -6,
    width: 50,
    height: 45
  });
  assert.equal(result.assets[1].renderBounds, null);
});

test("extractFigmaFrameAssets renders mixed-style text as SVG", async () => {
  const text = createNode({ id: "2:5", type: "TEXT", name: "Symbol text" });
  text.fontName = Symbol("mixed");
  text.exportAsync = async (settings) => {
    assert.deepEqual(settings, {
      format: "SVG_STRING",
      contentsOnly: true,
      useAbsoluteBounds: true
    });
    return "<svg><text>Mixed</text></svg>";
  };
  const frame = createNode({ id: "1:1", type: "FRAME", name: "Landing", children: [text] });
  const manifest = { nodes: frame.children.map(createManifestNode) };

  const result = await extractFigmaFrameAssets({ figmaApi: {}, frame, manifest });

  assert.equal(result.assets[0].nodeId, "2:5");
  assert.equal(result.assets[0].format, "svg");
  assert.match(result.assets[0].text, /^<svg/);
});

test("extractFigmaFrameAssets renders every mixed text style as an SVG replacement", async () => {
  const mixedProperties = [
    "fills",
    "fontName",
    "fontSize",
    "lineHeight",
    "fontWeight",
    "letterSpacing",
    "textCase",
    "textDecoration"
  ];
  const nodes = mixedProperties.map((property, index) => {
    const text = createNode({
      id: `4:${index + 1}`,
      type: "TEXT",
      name: `Mixed ${property}`,
      fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }]
    });
    text[property] = Symbol("mixed");
    text.exportAsync = async () => "<svg></svg>";
    return text;
  });
  const frame = createNode({ id: "1:1", type: "FRAME", name: "Landing", children: nodes });
  const manifest = { nodes: frame.children.map(createManifestNode) };

  const result = await extractFigmaFrameAssets({ figmaApi: {}, frame, manifest });

  assert.deepEqual(
    result.assets.map((asset) => asset.nodeId),
    nodes.map((node) => node.id)
  );
  assert.ok(result.assets.every((asset) => asset.format === "svg"));
  assert.deepEqual(result.warnings, []);
});

test("extractFigmaFrameAssets replaces non-solid or multiple visible text fills", async () => {
  const gradientText = createNode({
    id: "5:1",
    type: "TEXT",
    name: "Gradient text",
    fills: [{ type: "GRADIENT_LINEAR", visible: true }]
  });
  const multipleFillText = createNode({
    id: "5:2",
    type: "TEXT",
    name: "Multiple fill text",
    fills: [
      { type: "SOLID", visible: true },
      { type: "SOLID", visible: true },
      { type: "GRADIENT_LINEAR", visible: false }
    ]
  });
  const multipleImageFillText = createNode({
    id: "5:3",
    type: "TEXT",
    name: "Multiple image fill text",
    fills: [
      createImageFill("text-image-hash"),
      { type: "SOLID", visible: true }
    ]
  });
  gradientText.exportAsync = async () => "<svg></svg>";
  multipleFillText.exportAsync = async () => "<svg></svg>";
  multipleImageFillText.exportAsync = async () => "<svg></svg>";
  const frame = createNode({
    id: "1:1",
    type: "FRAME",
    name: "Landing",
    children: [gradientText, multipleFillText, multipleImageFillText]
  });
  const manifest = { nodes: frame.children.map(createManifestNode) };

  const result = await extractFigmaFrameAssets({ figmaApi: {}, frame, manifest });

  assert.deepEqual(result.assets.map((asset) => asset.nodeId), ["5:1", "5:2", "5:3"]);
  assert.ok(result.assets.every((asset) => asset.format === "svg"));
});

test("extractFigmaFrameAssets warns for a failed node render and continues", async () => {
  const failedVector = createNode({ id: "2:6", type: "VECTOR", name: "Broken logo" });
  failedVector.exportAsync = async () => {
    throw new Error("export unavailable");
  };
  const workingVector = createNode({ id: "2:7", type: "VECTOR", name: "Working logo" });
  workingVector.exportAsync = async () => "<svg></svg>";
  const frame = createNode({
    id: "1:1",
    type: "FRAME",
    name: "Landing",
    children: [failedVector, workingVector]
  });
  const manifest = { nodes: frame.children.map(createManifestNode) };

  const result = await extractFigmaFrameAssets({ figmaApi: {}, frame, manifest });

  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].nodeId, "2:7");
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /Landing\/Broken logo/);
});
