const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyTaskRouteSaveSuccess,
  buildModelConfigSaveRequest,
  getModelPurposeDefaults,
  getPurposeSwitchModelValue,
  getEligibleModelConfigs,
  normalizeModelConfigPayload
} = require("../src/ui/api/model-config");

function fixture(overrides = {}) {
  return {
    id: "vision",
    name: "理解",
    baseUrl: "https://example.test",
    model: "vision-model",
    timeoutSeconds: 300,
    tasks: ["vision"],
    testResults: {},
    hasApiKey: true,
    apiKeyLength: 7,
    ...overrides
  };
}

test("eligible configs are filtered by declared task without requiring a test", () => {
  const state = normalizeModelConfigPayload({
    modelConfigs: [
      fixture({ id: "vision", tasks: ["vision"], testResults: {} }),
      fixture({ id: "image", tasks: ["generation"], testResults: {} })
    ]
  });

  assert.deepEqual(
    getEligibleModelConfigs(state, "vision").map((item) => item.id),
    ["vision"]
  );
});

test("save request includes an API Key only when the field changed", () => {
  const base = {
    name: "生成",
    baseUrl: "https://example.test/",
    model: "image-model",
    timeoutSeconds: "420",
    purpose: "image"
  };

  assert.deepEqual(buildModelConfigSaveRequest(base).tasks, ["generation", "inpaint"]);
  assert.equal("type" in buildModelConfigSaveRequest(base), false);
  assert.equal("apiKey" in buildModelConfigSaveRequest(base), false);
  assert.equal(buildModelConfigSaveRequest({
    ...base,
    apiKey: " sk-new ",
    apiKeyChanged: true
  }).apiKey, "sk-new");
});

test("task routing success returns new state without mutating the previous state", () => {
  const state = normalizeModelConfigPayload({
    modelConfigs: [fixture()],
    taskRouting: { vision: null, generation: null, inpaint: null }
  });
  const next = applyTaskRouteSaveSuccess(state, "vision", "vision");

  assert.equal(state.taskRouting.vision, null);
  assert.equal(next.taskRouting.vision, "vision");
});

test("image routing success updates generation and repair together", () => {
  const state = normalizeModelConfigPayload({
    modelConfigs: [fixture({
      id: "image",
      tasks: ["generation", "inpaint"]
    })],
    taskRouting: { vision: null, generation: null, inpaint: null }
  });
  const next = applyTaskRouteSaveSuccess(state, "image", "image");

  assert.equal(state.taskRouting.generation, null);
  assert.equal(next.taskRouting.generation, "image");
  assert.equal(next.taskRouting.inpaint, "image");
});

test("new model purpose defaults use the requested models and 500 second timeout", () => {
  assert.deepEqual(getModelPurposeDefaults("vision"), {
    purpose: "vision",
    model: "gpt-5.6-sol",
    timeoutSeconds: 500
  });
  assert.deepEqual(getModelPurposeDefaults("image"), {
    purpose: "image",
    model: "gpt-image-2",
    timeoutSeconds: 500
  });
});

test("purpose changes replace only blank or previous-default model values", () => {
  assert.equal(getPurposeSwitchModelValue("", "vision", "image"), "gpt-image-2");
  assert.equal(getPurposeSwitchModelValue("gpt-5.6-sol", "vision", "image"), "gpt-image-2");
  assert.equal(getPurposeSwitchModelValue("custom-vision", "vision", "image"), "custom-vision");
  assert.equal(getPurposeSwitchModelValue("gpt-image-2", "image", "vision"), "gpt-5.6-sol");
});
