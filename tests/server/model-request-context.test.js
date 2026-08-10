const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createModelRequestContext
} = require("../../src/server/services/model-request-context");

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload)
  };
}

test("request context keeps its original URL, key, model and timeout snapshot", async () => {
  const calls = [];
  const mutable = {
    configId: "vision-a",
    name: "理解 A",
    baseUrl: "https://first.example.com",
    apiKey: "sk-first",
    model: "vision-a",
    timeoutMs: 90000
  };
  const context = createModelRequestContext(mutable, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ choices: [] });
    },
    createAbortError: (message) => Object.assign(new Error(message), { name: "AbortError" }),
    getRequestSignal: () => null
  });
  mutable.baseUrl = "https://second.example.com";
  mutable.apiKey = "sk-second";
  mutable.model = "vision-b";

  await context.callJson("/v1/chat/completions", { model: context.config.model });

  assert.equal(calls[0].url, "https://first.example.com/v1/chat/completions");
  assert.equal(calls[0].options.headers.authorization, "Bearer sk-first");
  assert.equal(calls[0].options.body, "{\"model\":\"vision-a\"}");
  assert.equal(context.config.timeoutMs, 90000);
  assert.equal(Object.isFrozen(context.config), true);
});
