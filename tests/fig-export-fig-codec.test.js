const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createEmptyFigDocument,
  decodeFigDocument,
  encodeFigDocument
} = require("../src/fig-export/fig-codec");

test("empty fig document round-trips with document and page nodes", async () => {
  const document = createEmptyFigDocument();
  const bytes = await encodeFigDocument(document);
  const decoded = decodeFigDocument(bytes);

  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 100);
  assert.equal(decoded.nodes[0].type, "DOCUMENT");
  assert.equal(decoded.nodes[1].type, "CANVAS");
  assert.equal(decoded.nodes[1].name, "Page 1");
});

