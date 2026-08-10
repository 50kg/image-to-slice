const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createImageRoutes
} = require("../../src/server/routes/image-routes");

function createHarness({ payload = { prompt: "x" } } = {}) {
  const sent = [];
  const progressCalls = [];
  const taskCalls = [];
  let generatedPayload = null;
  let editedPayload = null;
  const context = { config: { type: "openaiCompatible", model: "image-a" } };
  const handle = createImageRoutes({
    getTaskRequestContext: (task) => {
      taskCalls.push(task);
      return context;
    },
    readJson: async () => payload,
    runWithAiProgress: async (nextPayload, message, operation) => {
      progressCalls.push({ payload: nextPayload, message });
      return operation();
    },
    generateImage: async (nextPayload, nextContext) => {
      generatedPayload = nextPayload;
      return { ok: true, kind: "generate", model: nextContext.config.model };
    },
    editImage: async (nextPayload, nextContext) => {
      editedPayload = nextPayload;
      return { ok: true, kind: "edit", model: nextContext.config.model };
    },
    sendJson: (response, status, body) => sent.push({ response, status, body })
  });
  return {
    handle,
    sent,
    progressCalls,
    taskCalls,
    get generatedPayload() { return generatedPayload; },
    get editedPayload() { return editedPayload; }
  };
}

test("image routes ignore unrelated requests", async () => {
  const { handle, sent } = createHarness();

  assert.equal(await handle({ method: "GET", url: "/api/images/generate" }, {}), false);
  assert.deepEqual(sent, []);
});

test("POST /api/images/generate resolves generation and runs with its request context", async () => {
  const harness = createHarness();

  assert.equal(await harness.handle({ method: "POST", url: "/api/images/generate" }, {}), true);
  assert.deepEqual(harness.taskCalls, ["generation"]);
  assert.equal(harness.generatedPayload.prompt, "x");
  assert.equal(harness.progressCalls[0].message, "图片生成请求已发送，正在等待上游返回");
  assert.deepEqual(harness.sent[0].body, { ok: true, kind: "generate", model: "image-a" });
});

test("POST /api/images/edit resolves generation and runs with its request context", async () => {
  const harness = createHarness();

  assert.equal(await harness.handle({ method: "POST", url: "/api/images/edit" }, {}), true);
  assert.deepEqual(harness.taskCalls, ["generation"]);
  assert.equal(harness.editedPayload.prompt, "x");
  assert.equal(harness.progressCalls[0].message, "图片编辑请求已发送，正在等待上游返回");
  assert.deepEqual(harness.sent[0].body, { ok: true, kind: "edit", model: "image-a" });
});
