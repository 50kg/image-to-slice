const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeImageScaleMode,
  dataUrlToBytes
} = require("../../src/plugin/image-data");

test("normalizeImageScaleMode accepts supported Figma image scale modes", () => {
  assert.equal(normalizeImageScaleMode("fill"), "FILL");
  assert.equal(normalizeImageScaleMode("FIT"), "FIT");
  assert.equal(normalizeImageScaleMode("crop"), "CROP");
  assert.equal(normalizeImageScaleMode("tile"), "TILE");
});

test("normalizeImageScaleMode falls back to FIT for unsupported values", () => {
  assert.equal(normalizeImageScaleMode("stretch"), "FIT");
  assert.equal(normalizeImageScaleMode(null), "FIT");
});

test("dataUrlToBytes decodes PNG and JPEG data URLs", () => {
  const atob = (value) => Buffer.from(value, "base64").toString("binary");

  assert.deepEqual(Array.from(dataUrlToBytes("data:image/png;base64,AQID", { atob })), [1, 2, 3]);
  assert.deepEqual(Array.from(dataUrlToBytes("data:image/jpeg;base64,BAUG", { atob })), [4, 5, 6]);
  assert.deepEqual(Array.from(dataUrlToBytes("data:image/jpg;base64,BwgJ", { atob })), [7, 8, 9]);
});

test("dataUrlToBytes prefers injected base64 decoder", () => {
  const result = new Uint8Array([9, 8, 7]);

  assert.equal(dataUrlToBytes("data:image/png;base64,AQID", { base64Decode: () => result }), result);
});

test("dataUrlToBytes rejects non-image base64 data URLs", () => {
  assert.throws(() => dataUrlToBytes("data:text/plain;base64,abc"), /图片数据必须是 base64 PNG\/JPEG data URL/);
});
