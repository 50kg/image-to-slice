const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PROXY_BASE_URL,
  createBackendClient,
  fetchWithTimeout
} = require("../src/ui/api/backend-client");

test("fetchWithTimeout sends an AbortSignal and returns the fetch result", async () => {
  const calls = [];
  const response = { ok: true };

  const result = await fetchWithTimeout("http://localhost/health", { method: "POST" }, 100, {
    fetchImpl: async (url, options) => {
      calls.push([url, options]);
      return response;
    }
  });

  assert.equal(result, response);
  assert.equal(calls[0][0], "http://localhost/health");
  assert.equal(calls[0][1].method, "POST");
  assert.equal(calls[0][1].signal instanceof AbortSignal, true);
});

test("createBackendClient checks health before backend requests", async () => {
  const urls = [];
  const client = createBackendClient({
    fetchImpl: async (url) => {
      urls.push(url);
      return { ok: true };
    }
  });

  await client.fetchBackend("/api/config");

  assert.deepEqual(urls, [
    `${PROXY_BASE_URL}/health`,
    `${PROXY_BASE_URL}/api/config`
  ]);
});

test("createBackendClient shares concurrent health checks", async () => {
  let healthChecks = 0;
  let releaseHealth;
  const healthReady = new Promise((resolve) => {
    releaseHealth = resolve;
  });
  const client = createBackendClient({
    fetchImpl: async (url) => {
      if (url.endsWith("/health")) {
        healthChecks += 1;
        await healthReady;
      }
      return { ok: true };
    }
  });

  const first = client.ensureLocalServiceConnected();
  const second = client.ensureLocalServiceConnected();
  releaseHealth();
  await Promise.all([first, second]);

  assert.equal(healthChecks, 1);
});

test("createBackendClient reports disconnected service for failed health", async () => {
  const errors = [];
  const client = createBackendClient({
    fetchImpl: async () => ({ ok: false, status: 503 }),
    onDisconnected: (error) => errors.push(error.message)
  });

  await assert.rejects(() => client.ensureLocalServiceConnected(), /本地服务已断开/);
  assert.deepEqual(errors, ["本地服务异常：503"]);
});

test("createBackendClient preserves AbortError from backend fetch", async () => {
  const client = createBackendClient({
    fetchImpl: async (url) => {
      if (url.endsWith("/health")) return { ok: true };
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }
  });

  await assert.rejects(() => client.fetchBackend("/api/config"), { name: "AbortError" });
});
