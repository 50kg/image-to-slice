const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertFixedCaptureRootSize,
  createFastAuthoritativeAssetNode,
  getFastPreviewCaptureDocument,
  lockFastCaptureScreenSize,
  materializeVisibleCapturePseudos,
  runFastVendorCapture,
  waitForFastCaptureLayout,
  waitForFastCaptureStep
} = require("../src/ui/services/editable-layer-spec");

test("fast capture keeps local slice pixels at their authoritative placement and captured layer", () => {
  const node = createFastAuthoritativeAssetNode({
    id: "hero",
    name: "Hero",
    dataUrl: "data:image/png;base64,HERO",
    placement: { x: 0, y: 1, width: 1728, height: 1174 }
  }, 0, 0);

  assert.deepEqual(node, {
    type: "image",
    name: "Hero",
    dataUrl: "data:image/png;base64,HERO",
    x: 0,
    y: 1,
    width: 1728,
    height: 1174,
    radius: 0,
    scaleMode: "FIT",
    sourceAssetId: "hero",
    captureZIndex: 0
  });
});

test("fast capture preserves an explicit HTML z-index for a reference asset", () => {
  const node = createFastAuthoritativeAssetNode({
    id: "badge",
    name: "Badge",
    dataUrl: "data:image/png;base64,BADGE",
    placement: { x: 20, y: 30, width: 40, height: 50 }
  }, 4, 12);

  assert.equal(node.captureZIndex, 12);
});

test("fast capture authoritative assets preserve independent corner radii", () => {
  const radii = { topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 };
  const node = createFastAuthoritativeAssetNode({
    id: "corners",
    name: "Corners",
    dataUrl: "data:image/png;base64,CORNERS",
    radii,
    placement: { x: 0, y: 0, width: 30, height: 40 }
  }, 4, 0);

  assert.deepEqual(node.radii, radii);
});

test("fast capture locks a flex screen to the dynamic source dimensions", () => {
  const declarations = new Map();
  const screenElement = {
    style: {
      setProperty(name, value, priority) {
        declarations.set(name, { value, priority });
      }
    }
  };

  lockFastCaptureScreenSize(screenElement, { width: 1728, height: 3642 });

  assert.deepEqual(Object.fromEntries(declarations), {
    width: { value: "1728px", priority: "important" },
    "min-width": { value: "1728px", priority: "important" },
    height: { value: "3642px", priority: "important" },
    "min-height": { value: "3642px", priority: "important" },
    flex: { value: "0 0 auto", priority: "important" }
  });
});

test("fast capture temporarily materializes a visible decorative pseudo element", () => {
  assert.equal(typeof materializeVisibleCapturePseudos, "function");

  const inserted = [];
  const removed = [];
  const firstChild = { id: "existing-child" };
  const owner = {
    firstChild,
    insertBefore(node, reference) {
      inserted.push({ node, reference, position: "before" });
    },
    appendChild(node) {
      inserted.push({ node, reference: null, position: "after" });
    }
  };
  const root = {
    querySelectorAll() {
      return [owner];
    }
  };
  const visibleBefore = createComputedStyle({
    content: '""',
    display: "block",
    visibility: "visible",
    opacity: "1",
    position: "absolute",
    left: "19px",
    top: "-4px",
    width: "106px",
    height: "58px",
    borderRadius: "31px",
    backgroundColor: "rgb(255, 241, 217)",
    backgroundImage: "none",
    boxShadow: "none",
    color: "rgb(215, 60, 43)",
    fontFamily: "Arial"
  });
  const hiddenAfter = createComputedStyle({
    content: "none",
    display: "block",
    visibility: "visible",
    opacity: "1",
    position: "absolute",
    width: "10px",
    height: "10px",
    backgroundColor: "rgb(255, 0, 0)",
    backgroundImage: "none",
    boxShadow: "none"
  });
  const document = {
    defaultView: {
      getComputedStyle(element, pseudo) {
        if (element === root) return hiddenAfter;
        return pseudo === "::before" ? visibleBefore : hiddenAfter;
      }
    },
    createElement() {
      const declarations = new Map();
      return {
        style: {
          setProperty(name, value, priority) {
            declarations.set(name, { value, priority });
          }
        },
        declarations,
        setAttribute() {},
        remove() {
          removed.push(this);
        }
      };
    }
  };

  const cleanup = materializeVisibleCapturePseudos(document, root);

  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].position, "before");
  assert.equal(inserted[0].reference, firstChild);
  assert.deepEqual(inserted[0].node.declarations.get("background-color"), {
    value: "rgb(255, 241, 217)",
    priority: ""
  });
  assert.deepEqual(inserted[0].node.declarations.get("left"), {
    value: "19px",
    priority: ""
  });
  assert.deepEqual(inserted[0].node.declarations.get("border-radius"), {
    value: "31px",
    priority: ""
  });
  assert.equal(inserted[0].node.declarations.has("font-family"), false);
  assert.equal(inserted[0].node.declarations.has("color"), false);
  assert.ok(
    inserted[0].node.declarations.size <= 32,
    `pseudo capture copied ${inserted[0].node.declarations.size} styles`
  );

  cleanup();
  assert.deepEqual(removed, [inserted[0].node]);
});

test("fast capture reuses the rendered preview document after its screen is laid out", async () => {
  const rects = [
    { width: 0, height: 0 },
    { width: 320, height: 640 }
  ];
  const document = {
    querySelector(selector) {
      assert.equal(selector, ".screen");
      return {
        style: {
          setProperty() {}
        },
        getBoundingClientRect() {
          return rects.shift() || { width: 320, height: 640 };
        }
      };
    }
  };

  const result = await getFastPreviewCaptureDocument(
    { contentDocument: document },
    { width: 320, height: 640 },
    100,
    1
  );

  assert.equal(result, document);
});

test("fixed capture accepts exact source dimensions within one pixel", () => {
  assert.doesNotThrow(() => assertFixedCaptureRootSize(
    { width: 319.5, height: 640.5 },
    { width: 320, height: 640 }
  ));
});

test("fixed capture rejects viewport-clipped root dimensions", () => {
  assert.throws(
    () => assertFixedCaptureRootSize(
      { width: 240, height: 640 },
      { width: 320, height: 640 }
    ),
    /画板尺寸与原图不一致/
  );
});

test("fast capture stops waiting when an iframe resource never settles", async () => {
  const neverSettles = new Promise(() => {});
  const startedAt = Date.now();

  const completed = await waitForFastCaptureStep(neverSettles, 10);

  assert.equal(completed, false);
  assert.ok(Date.now() - startedAt < 250);
});

test("fast capture reports a resource step that completes before its deadline", async () => {
  const completed = await waitForFastCaptureStep(Promise.resolve(), 50);

  assert.equal(completed, true);
});

test("fast capture waits until the preview screen has its source dimensions", async () => {
  const rects = [
    { width: 0, height: 0 },
    { width: 0, height: 0 },
    { width: 320, height: 640 }
  ];

  const rect = await waitForFastCaptureLayout(
    () => rects.shift() || { width: 320, height: 640 },
    { width: 320, height: 640 },
    100,
    1
  );

  assert.equal(rect.width, 320);
  assert.equal(rect.height, 640);
});

test("fast capture rejects a preview screen that never receives layout", async () => {
  await assert.rejects(
    waitForFastCaptureLayout(
      () => ({ width: 0, height: 0 }),
      { width: 320, height: 640 },
      10,
      1
    ),
    /捕获 0x0，原图 320x640/
  );
});

test("fast vendor capture maps a successful raw capture", async () => {
  const manifest = await runFastVendorCapture({
    screen: { width: 320, height: 640 },
    captureRaw: async () => ({ root: { rect: { width: 320, height: 640 } } }),
    mapCapture: (_capture, options) => ({ metadata: { options } }),
    timeoutMs: 50
  });

  assert.deepEqual(manifest.metadata.options, { fixedSize: true });
});

test("fast vendor capture rejects when raw capture times out", async () => {
  await assert.rejects(
    runFastVendorCapture({
      screen: { width: 320, height: 640 },
      captureRaw: () => new Promise(() => {}),
      mapCapture: () => assert.fail("timed-out capture must not map"),
      timeoutMs: 10
    }),
    /超时/
  );
});

test("fast vendor capture rejects a mismatched root", async () => {
  await assert.rejects(
    runFastVendorCapture({
      screen: { width: 320, height: 640 },
      captureRaw: async () => JSON.stringify({ root: { rect: { width: 240, height: 640 } } }),
      mapCapture: () => assert.fail("mismatched capture must not map"),
      timeoutMs: 50
    }),
    /画板尺寸与原图不一致/
  );
});

function createComputedStyle(values) {
  const entries = Object.entries(values);
  return {
    ...values,
    length: entries.length,
    getPropertyValue(name) {
      const camelName = name.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      return values[camelName] || "";
    },
    getPropertyPriority() {
      return "";
    },
    ...Object.fromEntries(entries.map(([name], index) => [
      index,
      name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
    ]))
  };
}
