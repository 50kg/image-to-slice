const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateInspectorHighlightRect,
  canDeleteInspectorElement,
  clampInspectorWidth,
  findInspectorElement,
  findInspectorReferenceAssetAtPoint,
  findInspectorReferenceAssetElement,
  formatInspectorElementLabel,
  reduceInspectorSelection,
  readInspectorImageAsset,
  readInspectorLayout
} = require("../src/ui/services/html-preview-inspector");

function createInspectorElement({
  tag = "div",
  text = "",
  rect = { left: 0, top: 0, width: 10, height: 10 },
  matches = () => false,
  containsReferenceAsset = false,
  childElementCount = 0
} = {}) {
  return {
    localName: tag,
    textContent: text,
    childElementCount,
    getBoundingClientRect: () => ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height
    }),
    matches,
    querySelector: (selector) => selector === "[data-reference-asset]" && containsReferenceAsset ? {} : null
  };
}

test("inspector width stays within the supported panel range", () => {
  assert.equal(clampInspectorWidth(100), 280);
  assert.equal(clampInspectorWidth(420), 420);
  assert.equal(clampInspectorWidth(900), 560);
  assert.equal(clampInspectorWidth("bad"), 360);
});

test("inspector element labels use direct text and ignore nested content", () => {
  assert.deepEqual(formatInspectorElementLabel({
    localName: "button",
    id: "submit",
    classList: ["primary", "wide"],
    childNodes: [
      { nodeType: 3, textContent: "  Submit now  " },
      { nodeType: 1, textContent: "nested text is ignored" }
    ]
  }), {
    tag: "button",
    id: "submit",
    classes: ["primary", "wide"],
    text: "Submit now"
  });
});

test("inspector img labels expose the corresponding cut asset name", () => {
  const element = {
    localName: "img",
    classList: [],
    childNodes: [],
    getAttribute: (name) => ({
      "data-reference-asset": "slice-2",
      alt: "fallback-name"
    })[name] || ""
  };

  assert.deepEqual(formatInspectorElementLabel(element, [
    { id: "slice-2", name: "flash-sale-gift-icon", dataUrl: "data:image/png;base64,abc" }
  ]), {
    tag: "img",
    id: "",
    classes: [],
    text: "",
    assetName: "flash-sale-gift-icon"
  });
});

test("inspector hover resolves only cut images inside the preview screen", () => {
  const screen = { contains: (element) => element?.inside === true };
  const image = {
    inside: true,
    localName: "img",
    getAttribute: (name) => name === "data-reference-asset" ? "slice-2" : ""
  };
  const child = { parentElement: image };
  const outsideImage = { ...image, inside: false };

  assert.equal(findInspectorReferenceAssetElement(child, screen), image);
  assert.equal(findInspectorReferenceAssetElement(outsideImage, screen), null);
  assert.equal(findInspectorReferenceAssetElement({ localName: "div", inside: true }, screen), null);
});

test("inspector hover resolves ordinary preview elements inside the screen", () => {
  const screen = { contains: (element) => element?.inside === true };
  const text = { inside: true, localName: "div", parentElement: screen };
  const child = { inside: true, localName: "span", parentElement: text };
  const outside = { inside: false, localName: "div", parentElement: null };

  assert.equal(findInspectorElement(child, screen), child);
  assert.equal(findInspectorElement(text, screen), text);
  assert.equal(findInspectorElement(screen, screen), screen);
  assert.equal(findInspectorElement(outside, screen), null);
});

test("inspector hover hit-tests cut images that ignore pointer events", () => {
  const first = { getBoundingClientRect: () => ({ left: 10, top: 20, right: 60, bottom: 80 }) };
  const second = { getBoundingClientRect: () => ({ left: 70, top: 20, right: 120, bottom: 80 }) };
  const screen = { querySelectorAll: () => [first, second] };

  assert.equal(findInspectorReferenceAssetAtPoint(screen, 35, 50), first);
  assert.equal(findInspectorReferenceAssetAtPoint(screen, 95, 50), second);
  assert.equal(findInspectorReferenceAssetAtPoint(screen, 150, 50), null);
});

test("inspector image details resolve the selected cut asset preview", () => {
  const element = {
    localName: "img",
    getAttribute: (name) => ({
      "data-reference-asset": "slice-2",
      src: "data:image/png;base64,fallback",
      alt: "fallback-name"
    })[name] || ""
  };

  assert.deepEqual(readInspectorImageAsset(element, [
    { id: "slice-2", name: "flash-sale-gift-icon", dataUrl: "data:image/png;base64,abc" }
  ]), {
    id: "slice-2",
    name: "flash-sale-gift-icon",
    dataUrl: "data:image/png;base64,abc"
  });
  assert.equal(readInspectorImageAsset({ localName: "div" }, []), null);
});

test("inspector layout reads geometry relative to the source screen", () => {
  const computedStyle = {
    marginTop: "1px",
    marginRight: "2px",
    marginBottom: "3px",
    marginLeft: "4px",
    borderTopWidth: "5px",
    borderRightWidth: "6px",
    borderBottomWidth: "7px",
    borderLeftWidth: "8px",
    paddingTop: "9px",
    paddingRight: "10px",
    paddingBottom: "11px",
    paddingLeft: "12px",
    display: "flex",
    position: "absolute",
    overflow: "hidden",
    zIndex: "2",
    fontFamily: "Inter",
    fontSize: "16px",
    fontWeight: "600",
    lineHeight: "24px",
    letterSpacing: "0px",
    textAlign: "center",
    color: "rgb(1, 2, 3)",
    backgroundColor: "rgb(4, 5, 6)",
    borderRadius: "8px"
  };
  const view = { getComputedStyle: () => computedStyle };
  const element = {
    isConnected: true,
    ownerDocument: { defaultView: view },
    getBoundingClientRect: () => ({ left: 120, top: 230, width: 300, height: 80 })
  };
  const screen = {
    isConnected: true,
    getBoundingClientRect: () => ({ left: 20, top: 30, width: 750, height: 1334 })
  };

  assert.deepEqual(readInspectorLayout(element, screen), {
    geometry: { x: 100, y: 200, width: 300, height: 80 },
    margin: { top: "1px", right: "2px", bottom: "3px", left: "4px" },
    border: { top: "5px", right: "6px", bottom: "7px", left: "8px" },
    padding: { top: "9px", right: "10px", bottom: "11px", left: "12px" },
    layout: { display: "flex", position: "absolute", overflow: "hidden", zIndex: "2" },
    typography: {
      fontFamily: "Inter",
      fontSize: "16px",
      fontWeight: "600",
      lineHeight: "24px",
      letterSpacing: "0px",
      textAlign: "center",
      color: "rgb(1, 2, 3)"
    },
    appearance: { backgroundColor: "rgb(4, 5, 6)", borderRadius: "8px" }
  });
});

test("inspector highlight maps source geometry into the parent viewport", () => {
  assert.deepEqual(calculateInspectorHighlightRect({
    elementRect: { left: 20, top: 30, width: 100, height: 40 },
    iframeRect: { left: 50, top: 80 },
    viewportRect: { left: 10, top: 20 },
    zoom: 0.5
  }), { left: 50, top: 75, width: 50, height: 20 });
});

test("inspector click locks a target and clicking it again unlocks selection", () => {
  const first = {};
  const locked = reduceInspectorSelection(
    { selectedElement: null, locked: false },
    { type: "click", targetElement: first }
  );
  assert.deepEqual(locked, { selectedElement: first, locked: true });

  assert.deepEqual(
    reduceInspectorSelection(locked, { type: "click", targetElement: first }),
    { selectedElement: null, locked: false }
  );
});

test("inspector hover cannot replace a locked selection", () => {
  const first = {};
  const second = {};

  assert.deepEqual(
    reduceInspectorSelection(
      { selectedElement: first, locked: true },
      { type: "hover", targetElement: second }
    ),
    { selectedElement: first, locked: true }
  );
  assert.deepEqual(
    reduceInspectorSelection(
      { selectedElement: first, locked: false },
      { type: "hover", targetElement: second }
    ),
    { selectedElement: second, locked: false }
  );
});

test("inspector deletion protects the screen shell and every cut asset owner", () => {
  const screen = createInspectorElement();
  screen.contains = () => true;
  const generatedText = createInspectorElement({ tag: "span", text: "活动标题" });
  const referenceImage = createInspectorElement({
    tag: "img",
    matches: (selector) => selector.includes("[data-reference-asset]")
  });
  const assetOwner = createInspectorElement({ containsReferenceAsset: true });

  assert.equal(canDeleteInspectorElement(generatedText, screen), true);
  assert.equal(canDeleteInspectorElement(screen, screen), false);
  assert.equal(canDeleteInspectorElement(referenceImage, screen), false);
  assert.equal(canDeleteInspectorElement(assetOwner, screen), false);
});
