const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFigExportApi,
  exportApiDocument
} = require("../src/fig-export/figma-api-adapter");
const { decodeFigDocument } = require("../src/fig-export/fig-codec");
const { resolveVectorNodePaths } = require("openfig-core");

test("fig export api serializes frame, rectangle, and text hierarchy", async () => {
  const api = createFigExportApi();
  const frame = api.createFrame();
  frame.name = "Screen";
  frame.resize(750, 1334);
  frame.x = 0;
  frame.y = 0;
  frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 }];

  const rectangle = api.createRectangle();
  rectangle.name = "Card";
  rectangle.resize(300, 120);
  rectangle.x = 24;
  rectangle.y = 80;
  rectangle.cornerRadius = 16;
  rectangle.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.4, b: 0.6 }, opacity: 0.8 }];
  frame.appendChild(rectangle);

  const text = api.createText();
  text.name = "Title";
  text.resize(240, 40);
  text.x = 40;
  text.y = 100;
  text.fontName = { family: "Inter", style: "Bold" };
  text.fontSize = 24;
  text.characters = "Hello";
  text.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 1 }];
  frame.appendChild(text);

  const bytes = await exportApiDocument(api, { name: "adapter-test" });
  const decoded = decodeFigDocument(bytes);
  const screen = decoded.nodes.find((node) => node.name === "Screen");
  const card = decoded.nodes.find((node) => node.name === "Card");
  const title = decoded.nodes.find((node) => node.name === "Title");

  assert.equal(screen.type, "FRAME");
  assert.deepEqual(screen.size, { x: 750, y: 1334 });
  assert.equal(card.type, "ROUNDED_RECTANGLE");
  assert.equal(card.parentIndex.guid.localID, screen.guid.localID);
  assert.equal(card.cornerRadius, 16);
  assert.ok(Math.abs(card.fillPaints[0].opacity - 0.8) < 1e-6);
  assert.equal(title.type, "TEXT");
  assert.equal(title.textData.characters, "Hello");
  assert.equal(title.fontName.postscript, "Inter-Bold");
});

test("fig export adapter exposes Figma node types before mapping them to Kiwi", async () => {
  const api = createFigExportApi();
  const rectangle = api.createRectangle();
  rectangle.name = "Figma Rectangle";

  assert.equal(rectangle.type, "RECTANGLE");

  const decoded = decodeFigDocument(await exportApiDocument(api));
  const exported = decoded.nodes.find((node) => node.name === "Figma Rectangle");
  assert.equal(exported.type, "ROUNDED_RECTANGLE");
});

test("fig export api writes the design name to fig file metadata", async () => {
  const api = createFigExportApi();
  const decoded = decodeFigDocument(await exportApiDocument(api, { name: "端午活动页" }));

  assert.equal(decoded.meta.file_name, "端午活动页");
});

test("fig export api writes Chinese text with Figma-provided Noto Sans SC", async () => {
  const api = createFigExportApi();
  const text = api.createText();
  text.name = "中文标题";
  text.characters = "端午安康";
  text.fontName = { family: "PingFang SC", style: "Semibold" };

  const decoded = decodeFigDocument(await exportApiDocument(api));
  const exported = decoded.nodes.find((node) => node.name === "中文标题");

  assert.equal(exported.fontName.family, "Noto Sans SC");
  assert.equal(exported.fontName.style, "SemiBold");
});

test("fig export api writes Latin and metric text with Inter", async () => {
  const api = createFigExportApi();
  const text = api.createText();
  text.name = "Metric";
  text.characters = "$99";
  text.fontName = { family: "DIN Alternate", style: "Bold" };

  const decoded = decodeFigDocument(await exportApiDocument(api));
  const exported = decoded.nodes.find((node) => node.name === "Metric");

  assert.equal(exported.fontName.family, "Inter");
  assert.equal(exported.fontName.style, "Bold");
});

test("fig export api normalizes top-level nodes without changing their spacing", async () => {
  const api = createFigExportApi();
  const frame = api.createFrame();
  frame.name = "Editable";
  frame.resize(750, 1334);
  frame.x = -774;
  frame.y = -667;

  const reference = api.createRectangle();
  reference.name = "Reference";
  reference.resize(750, 1334);
  reference.x = 24;
  reference.y = -667;

  const decoded = decodeFigDocument(await exportApiDocument(api));
  const exportedFrame = decoded.nodes.find((node) => node.name === "Editable");
  const exportedReference = decoded.nodes.find((node) => node.name === "Reference");

  assert.equal(exportedFrame.transform.m02, 0);
  assert.equal(exportedFrame.transform.m12, 0);
  assert.equal(exportedReference.transform.m02, 798);
  assert.equal(exportedReference.transform.m12, 0);
});

test("fig export api keeps simple SVG editable and rasterizes unsupported SVG", async () => {
  const api = createFigExportApi();
  const simple = api.createNodeFromSvg('<svg viewBox="0 0 24 24"><path fill="#0a0" d="M0 0h24v24H0z"/></svg>');
  simple.name = "Simple icon";
  simple.resize(24, 24);

  const complex = api.createNodeFromSvg('<svg viewBox="0 0 24 24"><defs><linearGradient id="g"><stop stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs><rect width="24" height="24" fill="url(#g)"/></svg>');
  complex.name = "Gradient icon";
  complex.resize(24, 24);
  complex.x = 32;

  const decoded = decodeFigDocument(await exportApiDocument(api));
  const simpleNode = decoded.nodes.find((node) => node.name === "Simple icon");
  const complexNode = decoded.nodes.find((node) => node.name === "Gradient icon");

  assert.equal(simpleNode.type, "VECTOR");
  assert.ok(Number.isInteger(simpleNode.vectorData?.vectorNetworkBlob));
  assert.equal(complexNode.type, "ROUNDED_RECTANGLE");
  assert.equal(complexNode.fillPaints[0].type, "IMAGE");
  assert.ok(decoded.images.size >= 1);
});

test("fig export api normalizes SVG paths from an offset viewBox", async () => {
  const api = createFigExportApi();
  const vector = api.createNodeFromSvg(
    '<svg viewBox="10 20 100 100"><rect x="10" y="20" width="100" height="100" fill="#000"/></svg>'
  );
  vector.name = "Offset viewBox";
  vector.resize(100, 100);

  const decoded = decodeFigDocument(await exportApiDocument(api));
  const exported = decoded.nodes.find((node) => node.name === "Offset viewBox");
  const paths = resolveVectorNodePaths(decoded, exported);

  assert.equal(paths.fill[0].svgPath, "M0 0L100 0L100 100L0 100Z");
});

test("fig export api expands open SVG strokes into closed vector outlines", async () => {
  const api = createFigExportApi();
  const vector = api.createNodeFromSvg(
    '<svg viewBox="0 0 24 24" fill="none"><path d="M4 12L20 12" stroke="#0a0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  );
  vector.name = "Round stroke";
  vector.resize(24, 24);

  const decoded = decodeFigDocument(await exportApiDocument(api));
  const exported = decoded.nodes.find((node) => node.name === "Round stroke");
  const paths = resolveVectorNodePaths(decoded, exported);

  assert.equal(paths.stroke.length, 1);
  assert.match(paths.stroke[0].svgPath, /Z$/);
  assert.notEqual(paths.stroke[0].svgPath, "M4 12L20 12");
});

test("fig export api rasterizes unsupported paint values declared in SVG style", async () => {
  const api = createFigExportApi();
  const vector = api.createNodeFromSvg(
    '<svg viewBox="0 0 24 24" color="#0a0"><path style="fill:currentColor" d="M0 0h24v24H0z"/></svg>'
  );
  vector.name = "Styled currentColor";
  vector.resize(24, 24);

  const decoded = decodeFigDocument(await exportApiDocument(api));
  const exported = decoded.nodes.find((node) => node.name === "Styled currentColor");

  assert.equal(exported.type, "ROUNDED_RECTANGLE");
  assert.equal(exported.fillPaints[0].type, "IMAGE");
});

test("fig export api identifies the node that contains a corrupt image", async () => {
  const api = createFigExportApi();
  const image = api.createImage(Buffer.from("not an image"));
  const rectangle = api.createRectangle();
  rectangle.name = "损坏的商品切图";
  rectangle.fills = [{ type: "IMAGE", scaleMode: "FILL", imageHash: image.hash }];

  await assert.rejects(
    exportApiDocument(api),
    /图片资源无法解析：损坏的商品切图/
  );
});
