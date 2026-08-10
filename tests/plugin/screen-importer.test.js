const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createUiAssetScreen,
  createEditableDesignScreen
} = require("../../src/plugin/screen-importer");

function createNode(type) {
  return {
    type,
    children: [],
    resize(width, height) {
      this.width = width;
      this.height = height;
    },
    appendChild(child) {
      this.children.push(child);
    },
    setPluginData(key, value) {
      this.pluginData = this.pluginData || {};
      this.pluginData[key] = value;
    },
    remove() {
      this.removed = true;
    }
  };
}

test("createUiAssetScreen imports selected assets and records plugin data", async () => {
  const frame = createNode("FRAME");
  const rectangles = [];
  const figmaApi = {
    currentPage: {
      children: [],
      selection: []
    },
    viewport: {
      center: { x: 500, y: 300 },
      scrollAndZoomIntoView(nodes) {
        this.scrolled = nodes;
      }
    },
    createFrame: () => frame,
    createRectangle: () => {
      const rectangle = createNode("RECTANGLE");
      rectangles.push(rectangle);
      return rectangle;
    },
    createImage: () => ({ hash: "image-hash" }),
    base64Decode: () => new Uint8Array([1])
  };

  await createUiAssetScreen({
    figmaApi,
    notifyRecoverableError() {},
    manifest: {
      screen: { name: "Screen", width: 320, height: 640 },
      previewImage: { dataUrl: "data:image/png;base64,AQ==" },
      assets: [
        {
          id: "asset-1",
          name: "Logo",
          type: "image",
          kind: "logo",
          dataUrl: "data:image/png;base64,AQ==",
          placement: { x: 10, y: 20, width: 30, height: 40 },
          selected: true
        },
        {
          id: "asset-2",
          name: "Skipped",
          type: "image",
          kind: "photo",
          dataUrl: "data:image/png;base64,AQ==",
          placement: { x: 0, y: 0, width: 10, height: 10 },
          selected: false
        }
      ]
    }
  });

  assert.equal(frame.name, "Screen");
  assert.equal(frame.children.length, 2);
  assert.equal(frame.children[0].locked, true);
  assert.equal(frame.children[1].x, 10);
  assert.equal(frame.children[1].y, 20);
  assert.deepEqual(frame.children[1].exportSettings, [{ format: "PNG", constraint: { type: "SCALE", value: 1 } }]);
  assert.equal(JSON.parse(frame.children[1].pluginData.assetManifest).id, "asset-1");
  assert.deepEqual(figmaApi.currentPage.selection, [frame]);
});

test("createEditableDesignScreen imports editable nodes and optional source reference", async () => {
  const frames = [createNode("FRAME")];
  const rectangles = [];
  const appended = [];
  const figmaApi = {
    currentPage: {
      children: [],
      selection: [],
      appendChild(node) {
        appended.push(node);
      }
    },
    viewport: {
      center: { x: 500, y: 300 },
      scrollAndZoomIntoView(nodes) {
        this.scrolled = nodes;
      }
    },
    createFrame: () => frames.shift(),
    createRectangle: () => {
      const rectangle = createNode("RECTANGLE");
      rectangles.push(rectangle);
      return rectangle;
    },
    createImage: () => ({ hash: "source-hash" }),
    base64Decode: () => new Uint8Array([1])
  };

  await createEditableDesignScreen({
    figmaApi,
    manifest: {
      version: "editable-design-1",
      screen: { name: "Editable", width: 320, height: 640 },
      sourceImage: { dataUrl: "data:image/png;base64,AQ==" },
      nodes: [
        { type: "rectangle", name: "Button", width: 80, height: 32 }
      ]
    }
  });

  const frame = figmaApi.currentPage.selection[0];
  assert.equal(frame.name, "Editable");
  assert.equal(frame.children.length, 1);
  assert.equal(frame.children[0].name, "Button");
  assert.equal(appended.length, 1);
  assert.equal(appended[0].name, "Editable-参考原图");
  assert.equal(figmaApi.viewport.scrolled.length, 2);
  assert.deepEqual(JSON.parse(frame.pluginData.imageToSliceEditableFrame), {
    version: 1,
    source: "editable-design-import",
    manifestVersion: "editable-design-1"
  });
});

function createEditableManifest(nodeCount) {
  return {
    version: "editable-design-1",
    screen: { name: "Batched", width: 320, height: 640 },
    nodes: Array.from({ length: nodeCount }, (_, index) => ({
      type: "rectangle",
      name: `node-${index}`,
      x: index,
      y: 0,
      width: 1,
      height: 1
    }))
  };
}

test("createEditableDesignScreen imports 125 definitions in ordered batches", async () => {
  const frame = createNode("FRAME");
  const progress = [];
  let yields = 0;
  const figmaApi = {
    currentPage: { children: [], selection: [] },
    viewport: {
      center: { x: 500, y: 300 },
      scrollAndZoomIntoView() {}
    },
    createFrame: () => frame
  };

  const result = await createEditableDesignScreen({
    figmaApi,
    manifest: createEditableManifest(125),
    batchSize: 50,
    yieldControl: async () => { yields += 1; },
    onProgress: (value) => progress.push(value),
    createNode: async ({ definition }) => ({ ...createNode("RECTANGLE"), name: definition.name })
  });

  assert.equal(frame.children.length, 125);
  assert.deepEqual(frame.children.map((node) => node.name), createEditableManifest(125).nodes.map((node) => node.name));
  assert.equal(result.createdCount, 125);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(progress.map((item) => item.processedCount), [50, 100, 125]);
  assert.equal(yields, 2);
});

test("createEditableDesignScreen skips one recoverable node and removes its orphan", async () => {
  const frame = createNode("FRAME");
  const page = {
    children: [frame],
    selection: []
  };
  frame.appendChild = (node) => {
    page.children = page.children.filter((candidate) => candidate !== node);
    frame.children.push(node);
  };
  const figmaApi = {
    currentPage: page,
    viewport: {
      center: { x: 500, y: 300 },
      scrollAndZoomIntoView() {}
    },
    createFrame: () => frame
  };

  const result = await createEditableDesignScreen({
    figmaApi,
    manifest: createEditableManifest(125),
    batchSize: 50,
    yieldControl: async () => {},
    createNode: async ({ definition }) => {
      const node = {
        ...createNode("RECTANGLE"),
        name: definition.name,
        remove() {
          this.removed = true;
          page.children = page.children.filter((candidate) => candidate !== this);
        }
      };
      page.children.push(node);
      if (definition.name === "node-51") {
        throw new Error("unsupported node");
      }
      return node;
    }
  });

  assert.equal(result.createdCount, 124);
  assert.deepEqual(result.skipped, [{
    name: "node-51",
    reason: "unsupported node"
  }]);
  assert.equal(frame.removed, undefined);
  assert.deepEqual(page.children.filter((node) => node !== frame), []);
});

test("createEditableDesignScreen restores semantic groups after importing nodes", async () => {
  const frame = createNode("FRAME");
  const groupedCalls = [];
  const figmaApi = {
    currentPage: { children: [], selection: [] },
    viewport: {
      center: { x: 500, y: 300 },
      scrollAndZoomIntoView() {}
    },
    createFrame: () => frame,
    group(nodes, parent) {
      const group = createNode("GROUP");
      group.children = [...nodes];
      parent.children = parent.children.filter((node) => !nodes.includes(node));
      parent.children.push(group);
      groupedCalls.push({ nodes, parent, group });
      return group;
    }
  };
  const manifest = createEditableManifest(3);
  manifest.nodes[0].semanticGroupId = "feature-item-1";
  manifest.nodes[0].semanticGroupName = "每日任务";
  manifest.nodes[1].semanticGroupId = "feature-item-1";
  manifest.nodes[1].semanticGroupName = "每日任务";

  const result = await createEditableDesignScreen({
    figmaApi,
    manifest,
    createNode: async ({ definition }) => ({ ...createNode("RECTANGLE"), name: definition.name })
  });

  assert.equal(groupedCalls.length, 1);
  assert.equal(groupedCalls[0].parent, frame);
  assert.deepEqual(groupedCalls[0].nodes.map((node) => node.name), ["node-0", "node-1"]);
  assert.equal(groupedCalls[0].group.name, "每日任务");
  assert.equal(frame.children.length, 2);
  assert.equal(result.createdCount, 3);
  assert.equal(result.groupedCount, 1);
  assert.deepEqual(result.groupWarnings, []);
});

test("createEditableDesignScreen skips one-node groups and reports grouping failures", async () => {
  const frame = createNode("FRAME");
  let groupCalls = 0;
  const figmaApi = {
    currentPage: { children: [], selection: [] },
    viewport: {
      center: { x: 500, y: 300 },
      scrollAndZoomIntoView() {}
    },
    createFrame: () => frame,
    group() {
      groupCalls += 1;
      throw new Error("group failed");
    }
  };
  const manifest = createEditableManifest(3);
  manifest.nodes[0].semanticGroupId = "single";
  manifest.nodes[1].semanticGroupId = "broken";
  manifest.nodes[2].semanticGroupId = "broken";

  const result = await createEditableDesignScreen({
    figmaApi,
    manifest,
    createNode: async ({ definition }) => ({ ...createNode("RECTANGLE"), name: definition.name })
  });

  assert.equal(groupCalls, 1);
  assert.equal(frame.children.length, 3);
  assert.equal(result.groupedCount, 0);
  assert.deepEqual(result.groupWarnings, [{
    id: "broken",
    reason: "group failed"
  }]);
});
