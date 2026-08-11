const test = require("node:test");
const assert = require("node:assert/strict");

const { createUiAssetScreen } = require("../src/plugin/screen-importer");
const {
  createFigExportApi,
  exportApiDocument
} = require("../src/fig-export/figma-api-adapter");
const { decodeFigDocument } = require("../src/fig-export/fig-codec");

const RED_PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFgAI/ScL2WQAAAABJRU5ErkJggg==";

test("slice importer exports reference and positioned image assets into fig", async () => {
  const api = createFigExportApi();
  await createUiAssetScreen({
    figmaApi: api,
    notifyRecoverableError() {},
    manifest: {
      screen: { name: "Slice Screen", width: 750, height: 1334 },
      previewImage: { dataUrl: RED_PIXEL_PNG },
      assets: [{
        id: "asset-1",
        name: "Product",
        dataUrl: RED_PIXEL_PNG,
        selected: true,
        radius: 12,
        placement: { x: 30, y: 40, width: 120, height: 160 }
      }, {
        id: "asset-2",
        name: "Complex SVG",
        dataUrl: RED_PIXEL_PNG,
        svgData: '<svg viewBox="0 0 24 24"><defs><linearGradient id="g"><stop stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs><rect width="24" height="24" fill="url(#g)"/></svg>',
        selected: true,
        placement: { x: 180, y: 40, width: 24, height: 24 }
      }]
    }
  });

  const decoded = decodeFigDocument(await exportApiDocument(api));
  const frame = decoded.nodes.find((node) => node.name === "Slice Screen");
  const reference = decoded.nodes.find((node) => node.name === "preview_full_ui_reference");
  const product = decoded.nodes.find((node) => node.name === "Product");
  const complexSvg = decoded.nodes.find((node) => node.name === "Complex SVG");

  assert.equal(frame.type, "FRAME");
  assert.equal(reference.fillPaints[0].type, "IMAGE");
  assert.equal(reference.locked, true);
  assert.equal(product.transform.m02, 30);
  assert.equal(product.transform.m12, 40);
  assert.equal(product.cornerRadius, 12);
  assert.equal(product.fillPaints[0].image.name.length, 40);
  assert.equal(product.fillPaints[0].imageThumbnail.name.length, 40);
  assert.ok(decoded.images.has(product.fillPaints[0].image.name));
  assert.ok(decoded.images.has(product.fillPaints[0].imageThumbnail.name));
  assert.equal(product.exportSettings[0].imageType, "PNG");
  assert.equal(product.exportSettings[0].constraint.type, "CONTENT_SCALE");
  assert.equal(product.pluginData[0].pluginID, "image-to-slice");
  assert.equal(complexSvg.type, "ROUNDED_RECTANGLE");
  assert.equal(complexSvg.fillPaints[0].type, "IMAGE");
  assert.equal(complexSvg.exportSettings[0].imageType, "PNG");
});
