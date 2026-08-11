const test = require("node:test");
const assert = require("node:assert/strict");

const {
  decodeSvgDataUrl,
  dedupeReferenceAssetNodes,
  extractCssUrl,
  inferArrowIconFromText,
  isFigmaImageDataUrl,
  isSvgDataUrl,
  normalizeWebToFigmaAssetDataUrl,
  prepareEditableManifestForFigma,
  resolveCapturedSemanticGroup,
  resolveCapturedZIndex,
  resolveWebToFigmaAssetDataUrl,
  safeLayerName,
  sanitizeEditableManifestForFigma,
  sanitizeHtmlPreviewForDisplay,
  sortEditableNodesByStackingOrder
} = require("../src/ui/services/web-to-figma-utils");

test("inferArrowIconFromText recognizes compact arrow glyphs", () => {
  assert.equal(inferArrowIconFromText("›"), "chevronright");
  assert.equal(inferArrowIconFromText(" « "), "chevronleft");
  assert.equal(inferArrowIconFromText("↓"), "chevrondown");
  assert.equal(inferArrowIconFromText("⌃"), "chevronup");
  assert.equal(inferArrowIconFromText("next"), "");
});

test("safeLayerName strips unsafe characters and keeps CJK names", () => {
  assert.equal(safeLayerName(" hero/card 01? "), "hero_card_01");
  assert.equal(safeLayerName("按钮 / 主操作"), "按钮_主操作");
  assert.equal(safeLayerName("!!!"), "layer");
  assert.equal(safeLayerName("a".repeat(80)), "a".repeat(48));
});

test("image data URL helpers recognize raster and SVG data URLs", () => {
  assert.equal(isFigmaImageDataUrl("data:image/png;base64,aaaa"), true);
  assert.equal(isFigmaImageDataUrl("data:image/webp;base64,aaaa"), false);
  assert.equal(isSvgDataUrl("data:image/svg+xml,%3Csvg%3E%3C/svg%3E"), true);
  assert.equal(isSvgDataUrl("data:image/svg+xml;charset=utf-8;base64,PHN2Zy8+"), true);
});

test("decodeSvgDataUrl decodes encoded and base64 SVG payloads", () => {
  assert.equal(decodeSvgDataUrl("data:image/svg+xml,%3Csvg%3E%E4%B8%AD%3C%2Fsvg%3E"), "<svg>中</svg>");
  assert.equal(decodeSvgDataUrl("data:image/svg+xml;base64,PHN2Zz7kuK08L3N2Zz4="), "<svg>中</svg>");
  assert.equal(decodeSvgDataUrl("data:image/svg+xml"), "");
});

test("extractCssUrl reads quoted CSS url values", () => {
  assert.equal(extractCssUrl('url("/assets/icon%201.png")'), "/assets/icon%201.png");
  assert.equal(extractCssUrl("none"), "");
});

test("normalizeWebToFigmaAssetDataUrl wraps long base64 blobs with inferred mime", () => {
  const blob = "a".repeat(84);

  assert.equal(normalizeWebToFigmaAssetDataUrl({ base64Blob: blob, mimeType: "image/jpeg" }), `data:image/jpeg;base64,${blob}`);
  assert.equal(normalizeWebToFigmaAssetDataUrl({ blob: { base64Blob: blob, type: "image/svg+xml" } }), `data:image/svg+xml;base64,${blob}`);
});

test("resolveWebToFigmaAssetDataUrl returns direct data URLs and matched assets", () => {
  const png = "data:image/png;base64,aaaa";
  const assetData = `data:image/png;base64,${"b".repeat(84)}`;
  const assets = {
    "/assets/icon.png": { dataUrl: assetData },
    "hero image.png": { dataUrl: png }
  };

  assert.equal(resolveWebToFigmaAssetDataUrl(png, assets, "https://example.com/page/"), png);
  assert.equal(resolveWebToFigmaAssetDataUrl("linear-gradient(#000,#fff)", assets, "https://example.com/page/"), "");
  assert.equal(resolveWebToFigmaAssetDataUrl("./assets/icon.png", assets, "https://example.com/page/index.html"), assetData);
  assert.equal(resolveWebToFigmaAssetDataUrl("hero%20image.png", assets, "https://example.com/page/"), png);
});

test("sanitizeHtmlPreviewForDisplay removes image tags without supported data URLs", () => {
  const png = "data:image/png;base64,aaaa";
  const svg = "data:image/svg+xml,%3Csvg%2F%3E";
  const html = `<div><img src="${png}"><img src="https://example.com/a.png"><img src='${svg}'></div>`;

  assert.equal(sanitizeHtmlPreviewForDisplay(html), `<div><img src="${png}"><img src='${svg}'></div>`);
});

test("sanitizeEditableManifestForFigma drops unsupported image and empty SVG nodes", () => {
  const manifest = {
    metadata: { mode: "test" },
    nodes: [
      { type: "image", name: "valid", dataUrl: "data:image/png;base64,aaaa" },
      { type: "image", name: "bad", dataUrl: "https://example.com/a.png" },
      { type: "svg", name: "empty", svgData: "" },
      {
        type: "frame",
        children: [
          { type: "svg", name: "ok-svg", svgData: "<svg />" },
          { type: "image", name: "bad-child", dataUrl: "" }
        ]
      }
    ]
  };

  const result = sanitizeEditableManifestForFigma(manifest);

  assert.equal(result.metadata.droppedInvalidImageNodes, 3);
  assert.deepEqual(result.nodes.map((node) => node.name), ["valid", undefined]);
  assert.deepEqual(result.nodes[1].children.map((node) => node.name), ["ok-svg"]);
});

test("prepareEditableManifestForFigma converts an unsupported source reference to PNG", async () => {
  const webp = "data:image/webp;base64,webp-source";
  const png = "data:image/png;base64,png-source";
  const manifest = {
    sourceImage: { dataUrl: webp, name: "source.webp" },
    nodes: [{ type: "text", name: "title", text: "测试" }]
  };

  const result = await prepareEditableManifestForFigma(manifest, async (dataUrl) => {
    assert.equal(dataUrl, webp);
    return png;
  });

  assert.deepEqual(result.sourceImage, { dataUrl: png, name: "source.webp" });
  assert.equal(result.nodes.length, 1);
  assert.equal(manifest.sourceImage.dataUrl, webp);
});

test("prepareEditableManifestForFigma rejects a source reference that cannot become PNG or JPEG", async () => {
  await assert.rejects(
    prepareEditableManifestForFigma(
      { sourceImage: { dataUrl: "data:image/gif;base64,gif-source" }, nodes: [] },
      async () => "data:image/gif;base64,still-gif"
    ),
    /参考原图无法转换为 PNG 或 JPEG/
  );
});

test("dedupeReferenceAssetNodes removes duplicate source asset placements only", () => {
  const nodes = [
    { sourceAssetId: "a", x: 1, y: 2, width: 3, height: 4 },
    { sourceAssetId: "a", x: 1, y: 2, width: 3, height: 4 },
    { sourceAssetId: "a", x: 1, y: 2, width: 3, height: 5 },
    { x: 1, y: 2, width: 3, height: 4 },
    { x: 1, y: 2, width: 3, height: 4 }
  ];

  assert.deepEqual(dedupeReferenceAssetNodes(nodes), [nodes[0], nodes[2], nodes[3], nodes[4]]);
});

test("sortEditableNodesByStackingOrder preserves captured DOM paint order across nested CSS layers", () => {
  const nodes = [
    { name: "asset", captureZIndex: 900, captureOrder: 0 },
    { name: "background", captureZIndex: 0, captureOrder: 1 },
    { name: "overlay-text", captureZIndex: 901, captureOrder: 2 },
    { name: "later-background", captureZIndex: 0, captureOrder: 3 }
  ];

  assert.deepEqual(
    sortEditableNodesByStackingOrder(nodes),
    [
      { name: "asset" },
      { name: "background" },
      { name: "overlay-text" },
      { name: "later-background" }
    ]
  );
});

test("stacking order keeps child slice assets above their parent card background", () => {
  const nodes = [
    { name: "hero-background", captureZIndex: 0, captureOrder: 0 },
    { name: "navigation-card", captureZIndex: 1, captureOrder: 1 },
    { name: "navigation-icon", captureZIndex: 0, captureOrder: 2 }
  ];

  assert.deepEqual(
    sortEditableNodesByStackingOrder(nodes),
    [
      { name: "hero-background" },
      { name: "navigation-card" },
      { name: "navigation-icon" }
    ]
  );
});

test("resolveCapturedZIndex keeps auto-positioned children in their parent stacking layer", () => {
  assert.equal(resolveCapturedZIndex({ zIndex: "auto" }, 200), 200);
  assert.equal(resolveCapturedZIndex({ "z-index": "" }, 200), 200);
  assert.equal(resolveCapturedZIndex({ zIndex: "950" }, 200), 950);
  assert.equal(resolveCapturedZIndex({ zIndex: "0" }, 200), 0);
});

test("nested semantic children keep their inherited stacking layer", () => {
  const sectionLayer = 20;
  const articleLayer = resolveCapturedZIndex({ zIndex: "auto" }, sectionLayer);
  const imageLayer = resolveCapturedZIndex({ zIndex: "auto" }, articleLayer);
  const textLayer = resolveCapturedZIndex({ zIndex: "21" }, articleLayer);

  assert.equal(articleLayer, 20);
  assert.equal(imageLayer, 20);
  assert.equal(textLayer, 21);
});

test("captured semantic groups use the nearest valid owner marker", () => {
  const owner = resolveCapturedSemanticGroup({
    attributes: {
      "data-reference-owner-id": "reference-owner-1",
      "data-reference-owner-name": "feature-item-one"
    }
  }, null);

  assert.deepEqual(owner, {
    id: "reference-owner-1",
    name: "feature-item-one"
  });
  assert.deepEqual(
    resolveCapturedSemanticGroup({ attributes: {} }, owner),
    owner
  );
  assert.equal(resolveCapturedSemanticGroup({ attributes: {} }, null), null);
});

test("captured semantic groups reject unsafe IDs and trim readable names", () => {
  assert.equal(resolveCapturedSemanticGroup({
    attributes: {
      "data-reference-owner-id": "unsafe owner",
      "data-reference-owner-name": "ignored"
    }
  }, null), null);

  const result = resolveCapturedSemanticGroup({
    attributes: {
      "data-reference-owner-id": "owner_2",
      "data-reference-owner-name": `  ${"a".repeat(100)}  `
    }
  }, null);
  assert.equal(result.id, "owner_2");
  assert.equal(result.name, "a".repeat(80));
});

test("stacking order keeps every node including topmost layers", () => {
  const nodes = Array.from({ length: 1005 }, (_, index) => ({
    name: `node-${index}`,
    captureZIndex: index === 0 ? -1 : (index === 1004 ? 901 : 0),
    captureOrder: index
  }));
  const result = sortEditableNodesByStackingOrder(nodes);

  assert.equal(result.length, 1005);
  assert.equal(result[0].name, "node-0");
  assert.equal(result.at(-1).name, "node-1004");
  assert.equal("captureZIndex" in result.at(-1), false);
  assert.equal("captureOrder" in result.at(-1), false);
});
