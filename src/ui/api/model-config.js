const MODEL_CONFIG_TASKS = ["vision", "generation", "inpaint"];
const MODEL_CONFIG_PURPOSES = ["vision", "image"];

function tasksForModelPurpose(purpose) {
  return purpose === "image"
    ? ["generation", "inpaint"]
    : ["vision"];
}

function getModelPurposeDefaults(purpose) {
  return purpose === "image"
    ? { purpose: "image", model: "gpt-image-2", timeoutSeconds: 500 }
    : { purpose: "vision", model: "gpt-5.6-sol", timeoutSeconds: 500 };
}

function getPurposeSwitchModelValue(currentModel, previousPurpose, nextPurpose) {
  const value = String(currentModel || "").trim();
  const previousDefault = getModelPurposeDefaults(previousPurpose).model;
  return !value || value === previousDefault
    ? getModelPurposeDefaults(nextPurpose).model
    : value;
}

function normalizeModelConfigPayload(data = {}) {
  const modelConfigs = Array.isArray(data.modelConfigs)
    ? data.modelConfigs.map((config) => ({
        id: String(config.id || ""),
        name: String(config.name || ""),
        baseUrl: String(config.baseUrl || ""),
        model: String(config.model || ""),
        timeoutSeconds: Number(config.timeoutSeconds) || 300,
        tasks: MODEL_CONFIG_TASKS.filter((task) => config.tasks?.includes(task)),
        testResults: config.testResults && typeof config.testResults === "object"
          ? JSON.parse(JSON.stringify(config.testResults))
          : {},
        hasApiKey: Boolean(config.hasApiKey),
        apiKeyLength: Number(config.apiKeyLength) || 0
      }))
    : [];
  return {
    modelConfigs,
    taskRouting: Object.fromEntries(MODEL_CONFIG_TASKS.map((task) => [
      task,
      typeof data.taskRouting?.[task] === "string" ? data.taskRouting[task] : null
    ]))
  };
}

function buildModelConfigSaveRequest(formState) {
  return {
    name: String(formState.name || "").trim(),
    baseUrl: String(formState.baseUrl || "").trim().replace(/\/+$/, ""),
    model: String(formState.model || "").trim(),
    timeoutSeconds: Number(formState.timeoutSeconds) || 300,
    tasks: tasksForModelPurpose(formState.purpose),
    ...(formState.apiKeyChanged ? { apiKey: String(formState.apiKey || "").trim() } : {})
  };
}

function applyTaskRouteSaveSuccess(state, task, configId) {
  const routing = task === "image"
    ? {
        ...state.taskRouting,
        generation: configId,
        inpaint: configId
      }
    : {
        ...state.taskRouting,
        [task]: configId
      };
  return {
    ...state,
    taskRouting: routing
  };
}

function getSavedTaskRouteValue(state, task) {
  if (task !== "image") return state?.taskRouting?.[task] || "";
  return state?.taskRouting?.generation === state?.taskRouting?.inpaint
    ? state.taskRouting.generation || ""
    : "";
}

function getEligibleModelConfigs(state, task) {
  return (state?.modelConfigs || []).filter((config) => config.tasks.includes(task));
}

if (typeof module !== "undefined") {
  module.exports = {
    MODEL_CONFIG_TASKS,
    MODEL_CONFIG_PURPOSES,
    applyTaskRouteSaveSuccess,
    buildModelConfigSaveRequest,
    getEligibleModelConfigs,
    getModelPurposeDefaults,
    getPurposeSwitchModelValue,
    getSavedTaskRouteValue,
    normalizeModelConfigPayload,
    tasksForModelPurpose
  };
}
