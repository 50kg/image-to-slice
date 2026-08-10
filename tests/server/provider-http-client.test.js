const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createProviderHttpClient,
  buildProviderModelsUrl,
  listProviderModels,
  parseOpenAIResponse,
  parseOpenAIStreamResponse
} = require("../../src/server/providers/provider-http-client");

function createAbortError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  error.statusCode = 499;
  return error;
}

test("parseOpenAIResponse returns parsed JSON for ok responses", async () => {
  const data = await parseOpenAIResponse({
    ok: true,
    text: async () => "{\"ok\":true}"
  });

  assert.deepEqual(data, { ok: true });
});

test("parseOpenAIResponse throws API error message and status", async () => {
  await assert.rejects(
    () => parseOpenAIResponse({
      ok: false,
      status: 429,
      text: async () => "{\"error\":{\"message\":\"rate limited\"}}"
    }),
    (error) => error.message === "rate limited" && error.statusCode === 429
  );
});

test("callOpenAIJson posts JSON with bearer auth", async () => {
  const calls = [];
  const client = createProviderHttpClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, text: async () => "{\"ok\":true}" };
    },
    createAbortError,
    getRequestSignal: () => null,
    getConfig: () => ({
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test",
      timeoutMs: 300000
    })
  });

  const data = await client.callOpenAIJson("/v1/test", { hello: "world" });

  assert.deepEqual(data, { ok: true });
  assert.equal(calls[0].url, "https://api.openai.com/v1/test");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.authorization, "Bearer sk-test");
  assert.equal(calls[0].options.headers["content-type"], "application/json");
  assert.equal(calls[0].options.body, "{\"hello\":\"world\"}");
});

test("static config binds requests without a mutable config getter", async () => {
  const calls = [];
  const client = createProviderHttpClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, text: async () => "{\"ok\":true}" };
    },
    createAbortError,
    getRequestSignal: () => null,
    config: {
      baseUrl: "https://snapshot.example.com",
      apiKey: "sk-snapshot",
      timeoutMs: 45000
    }
  });

  await client.callOpenAIJson("/v1/test", {});

  assert.equal(calls[0].url, "https://snapshot.example.com/v1/test");
  assert.equal(calls[0].options.headers.authorization, "Bearer sk-snapshot");
});

test("static config does not duplicate a trailing v1 path", async () => {
  const requests = [];
  const client = createProviderHttpClient({
    fetchImpl: async (url) => {
      requests.push(url);
      return { ok: true, text: async () => "{\"choices\":[]}" };
    },
    createAbortError,
    getRequestSignal: () => null,
    config: {
      baseUrl: "https://gateway.example.com/v1",
      apiKey: "sk-test",
      timeoutMs: 30000
    }
  });

  await client.callOpenAIJson("/v1/chat/completions", {});

  assert.equal(requests[0], "https://gateway.example.com/v1/chat/completions");
});

test("parseOpenAIStreamResponse joins OpenAI-compatible SSE text deltas", async () => {
  const data = await parseOpenAIStreamResponse({
    ok: true,
    status: 200,
    headers: { get: () => "text/event-stream; charset=utf-8" },
    text: async () => [
      'data: {"choices":[{"delta":{"content":"<!doctype html>"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":"<html></html>"}}]}',
      "",
      "data: [DONE]",
      ""
    ].join("\n")
  });

  assert.deepEqual(data, {
    choices: [{
      message: {
        content: "<!doctype html><html></html>"
      }
    }]
  });
});

test("callOpenAIStream posts JSON with event-stream response headers", async () => {
  const calls = [];
  const client = createProviderHttpClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        headers: { get: () => "text/event-stream" },
        text: async () => 'data: {"choices":[{"delta":{"content":"ready"}}]}\n\ndata: [DONE]\n'
      };
    },
    createAbortError,
    getRequestSignal: () => null,
    getConfig: () => ({
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test",
      timeoutMs: 300000
    })
  });

  const data = await client.callOpenAIStream("/v1/chat/completions", {
    model: "vision-model",
    stream: true
  });

  assert.equal(calls[0].options.headers.accept, "text/event-stream");
  assert.equal(calls[0].options.body, "{\"model\":\"vision-model\",\"stream\":true}");
  assert.equal(data.choices[0].message.content, "ready");
});

test("provider request converts timeout abort to 504", async () => {
  const client = createProviderHttpClient({
    fetchImpl: async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    },
    createAbortError,
    getRequestSignal: () => null,
    getConfig: () => ({
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test",
      timeoutMs: 300000
    })
  });

  await assert.rejects(
    () => client.callOpenAIJson("/v1/test", {}),
    (error) => error.message === "OpenAI request timed out after 300 seconds" && error.statusCode === 504
  );
});

test("provider request converts upstream cancellation to AbortError", async () => {
  const requestSignal = new AbortController();
  requestSignal.abort();
  const client = createProviderHttpClient({
    fetchImpl: async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    },
    createAbortError,
    getRequestSignal: () => requestSignal.signal,
    getConfig: () => ({
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test",
      timeoutMs: 300000
    })
  });

  await assert.rejects(
    () => client.callOpenAIJson("/v1/test", {}),
    (error) => error.name === "AbortError" && error.statusCode === 499
  );
});

test("buildProviderModelsUrl appends v1 models path only when needed", () => {
  assert.equal(buildProviderModelsUrl("https://api.openai.com"), "https://api.openai.com/v1/models");
  assert.equal(buildProviderModelsUrl("https://api.openai.com/v1"), "https://api.openai.com/v1/models");
});

test("listProviderModels rejects a missing API key", async () => {
  await assert.rejects(
    () => listProviderModels({ baseUrl: "https://api.openai.com", apiKey: "" }),
    (error) => error.message === "请先填写并保存 Api Key 后再下载模型列表" && error.statusCode === 400
  );
});

test("listProviderModels fetches, deduplicates, and sorts model ids", async () => {
  const calls = [];
  const result = await listProviderModels({
    baseUrl: "https://api.openai.com",
    apiKey: "sk-test",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({ data: [{ id: "z" }, { id: "a" }, { id: "z" }, {}] })
      };
    }
  });

  assert.equal(calls[0].url, "https://api.openai.com/v1/models");
  assert.equal(calls[0].options.headers.authorization, "Bearer sk-test");
  assert.deepEqual(result.models, ["a", "z"]);
  assert.equal(result.modelCount, 2);
});

test("listProviderModels converts failed responses to 502", async () => {
  await assert.rejects(
    () => listProviderModels({
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test",
      fetchImpl: async () => ({
        ok: false,
        status: 500,
        text: async () => "server exploded"
      })
    }),
    (error) => error.message === "模型列表请求失败（500）：server exploded" && error.statusCode === 502
  );
});
