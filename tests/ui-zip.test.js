const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createZipBlob,
  dataUrlToUint8Array,
  textToUint8Array
} = require("../src/ui/services/zip");

test("textToUint8Array encodes text as UTF-8 bytes", () => {
  assert.deepEqual([...textToUint8Array("切图")], [...new TextEncoder().encode("切图")]);
});

test("dataUrlToUint8Array decodes base64 data URLs", () => {
  assert.deepEqual([...dataUrlToUint8Array("data:text/plain;base64,SGk=")], [72, 105]);
  assert.throws(() => dataUrlToUint8Array("not-a-data-url"), /Invalid data URL/);
});

test("createZipBlob creates a stored zip with filename and content bytes", async () => {
  const blob = createZipBlob([
    {
      name: "assets/切图.png",
      data: new Uint8Array([1, 2, 3])
    }
  ]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const text = new TextDecoder().decode(bytes);

  assert.equal(blob.type, "application/zip");
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.equal(text.includes("assets/切图.png"), true);
  assert.deepEqual([...bytes.slice(30 + textToUint8Array("assets/切图.png").length, 33 + textToUint8Array("assets/切图.png").length)], [1, 2, 3]);
  assert.deepEqual([...bytes.slice(-22, -18)], [0x50, 0x4b, 0x05, 0x06]);
});
