const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const {
  createModelConfigRoutes
} = require("../../src/server/routes/model-config-routes");
const {
  resolveTaskConfig,
  summarizeModelConfig,
  validateModelConfigInput
} = require("../../src/server/config/model-config");

function fixtureConfig(overrides = {}) {
  return {
    id: "vision-a",
    name: "理解 A",
    baseUrl: "https://api.example.com",
    apiKey: "sk-test",
    model: "vision-model",
    timeoutMs: 300000,
    tasks: ["vision"],
    testResults: {},
    ...overrides
  };
}

function createHarness({
  payload = {},
  modelConfigs = [fixtureConfig()],
  taskRouting = { vision: null, generation: null, inpaint: null },
  testModelConfig,
  listProviderModelsImpl
} = {}) {
  let state = {
    version: 2,
    modelConfigs,
    taskRouting,
    legacy: {}
  };
  let saved = 0;
  const sent = [];
  const ended = [];
  const modelListCalls = [];
  let nextId = 0;
  let mutationQueue = Promise.resolve();
  const handle = createModelConfigRoutes({
    headers: { "content-type": "application/json" },
    readJson: async (request) => typeof payload === "function" ? payload(request) : payload,
    sendJson: (response, status, body) => sent.push({ response, status, body }),
    getState: () => state,
    commitState: (nextState) => {
      saved += 1;
      state = nextState;
    },
    mutateState: (mutator) => {
      const result = mutationQueue.then(() => {
        const nextState = mutator(state);
        saved += 1;
        state = nextState;
        return nextState;
      });
      mutationQueue = result.catch(() => {});
      return result;
    },
    createId: () => `new-${++nextId}`,
    validateModelConfigInput,
    summarizeModelConfig,
    resolveTaskConfig,
    listProviderModels: async (options) => {
      modelListCalls.push(options);
      if (listProviderModelsImpl) return listProviderModelsImpl(options);
      return { ok: true, models: ["model-a"], modelCount: 1 };
    },
    testModelConfig
  });
  const response = {
    writeHead: (status, headers) => ended.push({ type: "head", status, headers }),
    end: (body) => ended.push({ type: "end", body })
  };
  return {
    handle,
    response,
    sent,
    ended,
    modelListCalls,
    get state() { return state; },
    get saved() { return saved; }
  };
}

test("GET /api/model-configs returns redacted configs and task routing", async () => {
  const harness = createHarness({
    modelConfigs: [fixtureConfig({
      testResults: { vision: { status: "success", testedAt: "expired" } }
    })],
    taskRouting: { vision: "vision-a", generation: null, inpaint: null }
  });

  assert.equal(await harness.handle({ method: "GET", url: "/api/model-configs" }, {}), true);
  assert.equal(harness.sent[0].body.modelConfigs[0].hasApiKey, true);
  assert.equal(harness.sent[0].body.modelConfigs[0].apiKeyLength, 7);
  assert.equal("apiKey" in harness.sent[0].body.modelConfigs[0], false);
  assert.deepEqual(harness.sent[0].body.modelConfigs[0].testResults, {});
  assert.deepEqual(harness.sent[0].body.taskRouting, {
    vision: "vision-a",
    generation: null,
    inpaint: null
  });
});

test("GET projects a legacy mixed config to its currently routed model type", async () => {
  const harness = createHarness({
    modelConfigs: [fixtureConfig({
      tasks: ["vision", "generation", "inpaint"]
    })],
    taskRouting: { vision: "vision-a", generation: null, inpaint: null }
  });

  await harness.handle({ method: "GET", url: "/api/model-configs" }, {});

  assert.deepEqual(harness.sent[0].body.modelConfigs[0].tasks, ["vision"]);
});

test("POST /api/model-configs creates an untested config with a generated ID", async () => {
  const harness = createHarness({
    payload: {
      name: "生成 B",
      baseUrl: "https://images.example.com/",
      apiKey: "sk-image",
      model: "image-model",
      timeoutSeconds: 420,
      tasks: ["generation", "inpaint"]
    }
  });

  assert.equal(await harness.handle({ method: "POST", url: "/api/model-configs" }, {}), true);
  assert.equal(harness.saved, 1);
  assert.equal(harness.state.modelConfigs[1].id, "new-1");
  assert.equal(harness.state.modelConfigs[1].timeoutMs, 420000);
  assert.deepEqual(harness.state.modelConfigs[1].testResults, {});
  assert.equal(harness.sent[0].status, 201);
});

test("concurrent model config mutations derive from the latest committed state", async () => {
  const harness = createHarness({
    payload: (request) => request.payload
  });

  await Promise.all([
    harness.handle({
      method: "POST",
      url: "/api/model-configs",
      payload: {
        name: "生成 B",
        baseUrl: "https://b.example.com",
        apiKey: "sk-b",
        model: "model-b",
        timeoutSeconds: 300,
        tasks: ["generation", "inpaint"]
      }
    }, {}),
    harness.handle({
      method: "POST",
      url: "/api/model-configs",
      payload: {
        name: "理解 C",
        baseUrl: "https://c.example.com",
        apiKey: "sk-c",
        model: "model-c",
        timeoutSeconds: 300,
        tasks: ["vision"]
      }
    }, {})
  ]);

  assert.deepEqual(harness.state.modelConfigs.map((config) => config.id), [
    "vision-a",
    "new-1",
    "new-2"
  ]);
  assert.equal(harness.saved, 2);
});

test("PUT /api/model-configs/:id preserves the stored key when omitted", async () => {
  const harness = createHarness({
    payload: {
      name: "理解 A 更新",
      baseUrl: "https://next.example.com",
      model: "next-vision",
      timeoutSeconds: 180,
      tasks: ["vision"]
    }
  });

  assert.equal(await harness.handle({ method: "PUT", url: "/api/model-configs/vision-a" }, {}), true);
  assert.equal(harness.state.modelConfigs[0].apiKey, "sk-test");
  assert.equal(harness.state.modelConfigs[0].name, "理解 A 更新");
  assert.deepEqual(harness.state.modelConfigs[0].testResults, {});
});

test("PUT /api/task-routing/:task atomically selects an eligible config", async () => {
  const harness = createHarness({
    payload: { configId: "vision-a" }
  });

  assert.equal(await harness.handle({ method: "PUT", url: "/api/task-routing/vision" }, {}), true);
  assert.equal(harness.state.taskRouting.vision, "vision-a");
  assert.equal(harness.saved, 1);
  assert.equal(harness.sent[0].body.config.id, "vision-a");
});

test("PUT /api/task-routing/image atomically selects generation and repair", async () => {
  const harness = createHarness({
    payload: { configId: "image-a" },
    modelConfigs: [fixtureConfig({
      id: "image-a",
      name: "图片 A",
      model: "image-model",
      tasks: ["generation", "inpaint"]
    })]
  });

  assert.equal(await harness.handle({ method: "PUT", url: "/api/task-routing/image" }, {}), true);
  assert.deepEqual(harness.state.taskRouting, {
    vision: null,
    generation: "image-a",
    inpaint: "image-a"
  });
  assert.equal(harness.saved, 1);
  assert.equal(harness.sent[0].body.purpose, "image");
});

test("task routing rejects a config without the requested task and does not save", async () => {
  const harness = createHarness({
    payload: { configId: "image-a" },
    modelConfigs: [fixtureConfig({
      id: "image-a",
      name: "生成 A",
      tasks: ["generation", "inpaint"]
    })]
  });

  await assert.rejects(
    () => harness.handle({ method: "PUT", url: "/api/task-routing/vision" }, {}),
    /未声明图片理解用途/
  );
  assert.equal(harness.state.taskRouting.vision, null);
  assert.equal(harness.saved, 0);
});

test("DELETE removes a referenced config and clears every matching task route", async () => {
  const harness = createHarness({
    taskRouting: { vision: "vision-a", generation: null, inpaint: "vision-a" }
  });

  assert.equal(
    await harness.handle({ method: "DELETE", url: "/api/model-configs/vision-a" }, {}),
    true
  );
  assert.equal(harness.saved, 1);
  assert.equal(harness.state.modelConfigs.length, 0);
  assert.deepEqual(harness.state.taskRouting, {
    vision: null,
    generation: null,
    inpaint: null
  });
  assert.deepEqual(harness.sent[0].body.taskRouting, harness.state.taskRouting);
});

test("POST reveal-key uses no-store and returns only the selected key", async () => {
  const harness = createHarness();

  assert.equal(
    await harness.handle({ method: "POST", url: "/api/model-configs/vision-a/reveal-key" }, harness.response),
    true
  );
  assert.equal(harness.ended[0].status, 200);
  assert.equal(harness.ended[0].headers["cache-control"], "no-store");
  assert.deepEqual(JSON.parse(harness.ended[1].body), { apiKey: "sk-test" });
});

test("POST models uses the selected config instead of task routing", async () => {
  const harness = createHarness();

  assert.equal(
    await harness.handle({ method: "POST", url: "/api/model-configs/vision-a/models", signal: null }, {}),
    true
  );
  assert.equal(harness.modelListCalls[0].baseUrl, "https://api.example.com");
  assert.equal(harness.modelListCalls[0].apiKey, "sk-test");
  assert.ok(harness.modelListCalls[0].signal instanceof AbortSignal);
});

test("model list requests abort when the client response closes unfinished", async () => {
  let observedSignal = null;
  const harness = createHarness({
    listProviderModelsImpl: ({ signal }) => new Promise((resolve, reject) => {
      observedSignal = signal;
      signal.addEventListener("abort", () => reject(new Error("provider request aborted")), { once: true });
    })
  });
  const request = new EventEmitter();
  request.method = "POST";
  request.url = "/api/model-configs/vision-a/models";
  const response = new EventEmitter();
  response.writableEnded = false;

  const pending = harness.handle(request, response);
  await Promise.resolve();
  response.emit("close");

  await assert.rejects(pending, /provider request aborted/);
  assert.equal(observedSignal.aborted, true);
});

test("POST preview models uses unsaved form values without creating a config", async () => {
  const harness = createHarness({
    payload: {
      name: "新建理解 API",
      baseUrl: "https://draft.example.com/",
      apiKey: "sk-draft",
      model: "draft-model",
      timeoutSeconds: 500,
      tasks: ["vision"]
    }
  });

  assert.equal(
    await harness.handle({ method: "POST", url: "/api/model-configs/preview/models", signal: null }, {}),
    true
  );
  assert.equal(harness.saved, 0);
  assert.equal(harness.modelListCalls[0].baseUrl, "https://draft.example.com");
  assert.equal(harness.modelListCalls[0].apiKey, "sk-draft");
  assert.ok(harness.modelListCalls[0].signal instanceof AbortSignal);
});

test("POST preview test reuses an edited config key without persisting form values", async () => {
  let testedConfig = null;
  const harness = createHarness({
    payload: {
      configId: "vision-a",
      name: "理解 A 编辑中",
      baseUrl: "https://draft.example.com",
      model: "draft-model",
      timeoutSeconds: 500,
      tasks: ["vision"]
    },
    testModelConfig: async (config) => {
      testedConfig = config;
      return {
        results: {
          vision: { status: "success", testedAt: "2026-07-30T00:00:00.000Z" }
        }
      };
    }
  });

  assert.equal(
    await harness.handle({ method: "POST", url: "/api/model-configs/preview/test" }, {}),
    true
  );
  assert.equal(harness.saved, 0);
  assert.equal(testedConfig.apiKey, "sk-test");
  assert.equal(testedConfig.baseUrl, "https://draft.example.com");
  assert.equal(harness.state.modelConfigs[0].baseUrl, "https://api.example.com");
  assert.equal(harness.sent[0].body.config.testResults.vision.status, "success");
});

test("removed duplicate action is not handled", async () => {
  const harness = createHarness();

  assert.equal(
    await harness.handle({ method: "POST", url: "/api/model-configs/vision-a/duplicate" }, {}),
    false
  );
  assert.equal(harness.saved, 0);
});

test("POST test returns transient results without persisting them", async () => {
  const harness = createHarness({
    modelConfigs: [fixtureConfig({
      id: "image-a",
      tasks: ["generation", "inpaint"],
      testResults: { generation: { status: "failed" } }
    })],
    taskRouting: { vision: null, generation: "image-a", inpaint: "image-a" },
    testModelConfig: async (config) => ({
      configId: config.id,
      results: {
        generation: { status: "success", testedAt: "2026-07-30T00:00:00.000Z" },
        inpaint: {
          status: "success",
          nativeMaskSupported: false,
          testedAt: "2026-07-30T00:00:00.000Z"
        }
      }
    })
  });

  assert.equal(
    await harness.handle({ method: "POST", url: "/api/model-configs/image-a/test" }, {}),
    true
  );
  assert.equal(harness.saved, 0);
  assert.deepEqual(harness.state.taskRouting, {
    vision: null,
    generation: "image-a",
    inpaint: "image-a"
  });
  assert.deepEqual(harness.state.modelConfigs[0].testResults, {
    generation: { status: "failed" }
  });
  assert.equal(harness.sent[0].body.config.testResults.generation.status, "success");
  assert.equal(harness.sent[0].body.config.testResults.inpaint.nativeMaskSupported, false);
});
