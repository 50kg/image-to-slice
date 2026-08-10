const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createAssetRoutes
} = require("../../src/server/routes/asset-routes");

function createHarness({ payload = { id: "asset" }, payloads = null } = {}) {
  const sent = [];
  const progressCalls = [];
  const operations = [];
  const taskCalls = [];
  const requestPayloads = payloads ? [...payloads] : null;
  const handle = createAssetRoutes({
    getTaskRequestContext: (task) => {
      taskCalls.push(task);
      return { config: { type: "openaiCompatible", model: task } };
    },
    readJson: async () => requestPayloads ? requestPayloads.shift() : payload,
    runWithAiProgress: async (nextPayload, message, operation) => {
      progressCalls.push({ payload: nextPayload, message });
      return operation();
    },
    generateTransparentAsset: async (nextPayload, context) => {
      operations.push({ name: "generateTransparentAsset", payload: nextPayload, context });
      return { ok: true, kind: "transparent" };
    },
    redrawAsset: async (nextPayload, context) => {
      operations.push({ name: "redrawAsset", payload: nextPayload, context });
      return { ok: true, kind: "redraw" };
    },
    redrawAssetAsSvg: async (nextPayload, context) => {
      operations.push({ name: "redrawAssetAsSvg", payload: nextPayload, context });
      return { ok: true, kind: "svg" };
    },
    vectorizeAsset: async (nextPayload) => {
      operations.push({ name: "vectorizeAsset", payload: nextPayload });
      return { ok: true, kind: "vector" };
    },
    sendJson: (response, status, body) => sent.push({ response, status, body })
  });
  return {
    handle,
    sent,
    progressCalls,
    operations,
    taskCalls
  };
}

test("asset routes ignore unrelated requests", async () => {
  const { handle, sent } = createHarness();

  assert.equal(await handle({ method: "GET", url: "/api/assets/vectorize" }, {}), false);
  assert.deepEqual(sent, []);
});

test("POST /api/assets/generate-transparent resolves generation and runs with progress", async () => {
  const harness = createHarness();

  assert.equal(await harness.handle({ method: "POST", url: "/api/assets/generate-transparent" }, {}), true);
  assert.deepEqual(harness.taskCalls, ["generation"]);
  assert.equal(harness.operations[0].name, "generateTransparentAsset");
  assert.equal(harness.progressCalls[0].message, "透明图片请求已发送，正在等待上游返回");
  assert.deepEqual(harness.sent[0].body, { ok: true, kind: "transparent" });
});

test("POST /api/assets/ai-redraw resolves inpaint for Mask edits and generation otherwise", async () => {
  const harness = createHarness({
    payloads: [
      { preserveBackground: true, maskDataUrl: "data:image/png;base64,bWFzaw==" },
      { preserveBackground: false, dataUrl: "data:image/png;base64,aW1hZ2U=" }
    ]
  });

  assert.equal(await harness.handle({ method: "POST", url: "/api/assets/ai-redraw" }, {}), true);
  assert.equal(await harness.handle({ method: "POST", url: "/api/assets/ai-redraw" }, {}), true);
  assert.deepEqual(harness.taskCalls, ["inpaint", "generation"]);
  assert.equal(harness.operations[0].name, "redrawAsset");
  assert.equal(harness.progressCalls[0].message, "AI 图片处理请求已发送，正在等待上游返回");
  assert.deepEqual(harness.sent[0].body, { ok: true, kind: "redraw" });
});

test("POST /api/assets/redraw-svg resolves vision and runs with progress", async () => {
  const harness = createHarness();

  assert.equal(await harness.handle({ method: "POST", url: "/api/assets/redraw-svg" }, {}), true);
  assert.deepEqual(harness.taskCalls, ["vision"]);
  assert.equal(harness.operations[0].name, "redrawAssetAsSvg");
  assert.equal(harness.progressCalls[0].message, "正在发送 AI 重绘 SVG 请求");
  assert.deepEqual(harness.sent[0].body, { ok: true, kind: "svg" });
});

test("POST /api/assets/vectorize runs without API key or progress", async () => {
  const harness = createHarness();

  assert.equal(await harness.handle({ method: "POST", url: "/api/assets/vectorize" }, {}), true);
  assert.deepEqual(harness.taskCalls, []);
  assert.deepEqual(harness.progressCalls, []);
  assert.equal(harness.operations[0].name, "vectorizeAsset");
  assert.deepEqual(harness.sent[0].body, { ok: true, kind: "vector" });
});
