const test = require("node:test");
const assert = require("node:assert/strict");

const {
  readAttachmentFilename,
  requestFigExport
} = require("../src/ui/api/fig-export-client");

test("requestFigExport returns fig blob and server filename", async () => {
  const calls = [];
  const result = await requestFigExport({
    kind: "slice",
    manifest: { screen: { name: "Slice" } }
  }, {
    fetchBackend: async (path, options) => {
      calls.push({ path, options });
      return new Response(Uint8Array.from([80, 75, 3, 4]), {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": 'attachment; filename="slice.fig"'
        }
      });
    }
  });

  assert.equal(calls[0].path, "/api/design/export-fig");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    kind: "slice",
    manifest: { screen: { name: "Slice" } }
  });
  assert.equal(result.filename, "slice.fig");
  assert.equal(result.blob.size, 4);
});

test("requestFigExport reports backend JSON errors", async () => {
  await assert.rejects(
    requestFigExport({ kind: "editable", manifest: {} }, {
      fetchBackend: async () => new Response(JSON.stringify({ error: "manifest 无效" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      })
    }),
    /manifest 无效/
  );
});

test("fig export client prefers the UTF-8 attachment filename", () => {
  assert.equal(
    readAttachmentFilename(
      "attachment; filename=\"image-to-slice.fig\"; filename*=UTF-8''%E7%AB%AF%E5%8D%88%E6%B4%BB%E5%8A%A8%E9%A1%B5.fig"
    ),
    "端午活动页.fig"
  );
});
