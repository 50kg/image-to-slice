const test = require("node:test");
const assert = require("node:assert/strict");

const {
  requestAiInpaint
} = require("../src/ui/services/ai-inpaint");

test("shared AI inpaint request sends the untouched source and selection mask", async () => {
  let received;
  const image = await requestAiInpaint({
    fetchBackend: async (path, options) => {
      received = { path, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        async json() {
          return { images: [{ dataUrl: "data:image/png;base64,RESULT" }] };
        }
      };
    },
    sourceDataUrl: "data:image/png;base64,ORIGINAL",
    maskDataUrl: "data:image/png;base64,MASK",
    name: "hero.png",
    width: 750,
    height: 300,
    prompt: "Remove the selected overlay.",
    completeRegions: [{ x: 1, y: 2, width: 3, height: 4 }],
    progressId: "progress_1"
  });

  assert.equal(received.path, "/api/assets/ai-redraw");
  assert.equal(received.body.dataUrl, "data:image/png;base64,ORIGINAL");
  assert.equal(received.body.maskDataUrl, "data:image/png;base64,MASK");
  assert.equal(received.body.preserveBackground, true);
  assert.equal(image.dataUrl, "data:image/png;base64,RESULT");
});

test("shared AI inpaint request preserves the backend error message", async () => {
  await assert.rejects(
    requestAiInpaint({
      fetchBackend: async () => ({
        ok: false,
        status: 422,
        async json() {
          return { error: "mask dimensions must match image" };
        }
      }),
      sourceDataUrl: "data:image/png;base64,ORIGINAL",
      maskDataUrl: "data:image/png;base64,MASK",
      width: 10,
      height: 10,
      prompt: "Repair."
    }),
    /mask dimensions must match image/
  );
});
