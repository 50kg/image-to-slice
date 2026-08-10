const { MODEL_TASKS } = require("../config/model-config");

function createModelConfigRoutes({
  headers,
  readJson,
  sendJson,
  getState,
  commitState,
  createId,
  validateModelConfigInput,
  summarizeModelConfig,
  resolveTaskConfig,
  listProviderModels,
  testModelConfig
}) {
  return async function handleModelConfigRoutes(request, response) {
    const pathname = parsePathname(request.url);
    const state = getState();

    if (request.method === "GET" && pathname === "/api/model-configs") {
      sendJson(response, 200, summarizeState(state, summarizeModelConfig));
      return true;
    }

    if (request.method === "POST" && pathname === "/api/model-configs") {
      const payload = await readJson(request);
      const config = validateModelConfigInput({
        ...payload,
        id: createId(),
        testResults: {}
      });
      const nextState = cloneState(state);
      nextState.modelConfigs.push(config);
      await commitState(nextState);
      sendJson(response, 201, { config: summarizeModelConfig(config) });
      return true;
    }

    if (request.method === "POST" && pathname === "/api/model-configs/preview/models") {
      const payload = await readJson(request);
      const config = createPreviewConfig(payload, state, validateModelConfigInput);
      const result = await listProviderModels({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        signal: request.signal
      });
      sendJson(response, 200, result);
      return true;
    }

    if (
      request.method === "POST"
      && pathname === "/api/model-configs/preview/test"
      && typeof testModelConfig === "function"
    ) {
      const payload = await readJson(request);
      const config = createPreviewConfig(payload, state, validateModelConfigInput);
      const result = await testModelConfig(config);
      sendJson(response, 200, {
        config: {
          ...summarizeModelConfig(config),
          testResults: JSON.parse(JSON.stringify(result.results || {}))
        }
      });
      return true;
    }

    const taskMatch = pathname.match(/^\/api\/task-routing\/([^/]+)$/);
    if (request.method === "PUT" && taskMatch) {
      const task = decodeSegment(taskMatch[1]);
      const payload = await readJson(request);
      const nextState = cloneState(state);
      if (task === "image") {
        nextState.taskRouting.generation = String(payload.configId || "");
        nextState.taskRouting.inpaint = String(payload.configId || "");
        const generationConfig = resolveTaskConfig(nextState, MODEL_TASKS.GENERATION);
        resolveTaskConfig(nextState, MODEL_TASKS.INPAINT);
        await commitState(nextState);
        sendJson(response, 200, {
          purpose: "image",
          config: summarizeModelConfig(generationConfig),
          taskRouting: { ...nextState.taskRouting }
        });
        return true;
      }
      if (!Object.values(MODEL_TASKS).includes(task)) throw badRequest("模型任务类型无效");
      nextState.taskRouting[task] = String(payload.configId || "");
      const config = resolveTaskConfig(nextState, task);
      await commitState(nextState);
      sendJson(response, 200, {
        task,
        config: summarizeModelConfig(config),
        taskRouting: { ...nextState.taskRouting }
      });
      return true;
    }

    const configMatch = pathname.match(/^\/api\/model-configs\/([^/]+)(?:\/([^/]+))?$/);
    if (!configMatch) return false;
    const configId = decodeSegment(configMatch[1]);
    const action = configMatch[2] ? decodeSegment(configMatch[2]) : "";
    const existingIndex = state.modelConfigs.findIndex((item) => item.id === configId);
    if (existingIndex < 0) throw notFound(`模型配置不存在：${configId}`);
    const existing = state.modelConfigs[existingIndex];

    if (request.method === "PUT" && !action) {
      const payload = await readJson(request);
      const hasApiKey = Object.prototype.hasOwnProperty.call(payload, "apiKey");
      const merged = {
        ...existing,
        ...payload,
        id: existing.id,
        apiKey: hasApiKey ? payload.apiKey : existing.apiKey
      };
      if (hasMaterialConfigChange(existing, merged)) merged.testResults = {};
      const config = validateModelConfigInput(merged);
      const nextState = cloneState(state);
      nextState.modelConfigs[existingIndex] = config;
      clearInvalidRoutes(nextState, config.id);
      await commitState(nextState);
      sendJson(response, 200, { config: summarizeModelConfig(config) });
      return true;
    }

    if (request.method === "DELETE" && !action) {
      const nextState = cloneState(state);
      for (const task of Object.values(MODEL_TASKS)) {
        if (nextState.taskRouting[task] === configId) {
          nextState.taskRouting[task] = null;
        }
      }
      nextState.modelConfigs.splice(existingIndex, 1);
      await commitState(nextState);
      sendJson(response, 200, {
        ok: true,
        deletedId: configId,
        taskRouting: { ...nextState.taskRouting }
      });
      return true;
    }

    if (request.method === "POST" && action === "reveal-key") {
      if (!existing.apiKey) throw notFound(`模型配置“${existing.name}”没有已保存的 API Key`);
      response.writeHead(200, { ...headers, "cache-control": "no-store" });
      response.end(JSON.stringify({ apiKey: existing.apiKey }));
      return true;
    }

    if (request.method === "POST" && action === "models") {
      const result = await listProviderModels({
        baseUrl: existing.baseUrl,
        apiKey: existing.apiKey,
        signal: request.signal
      });
      sendJson(response, 200, result);
      return true;
    }

    if (request.method === "POST" && action === "test" && typeof testModelConfig === "function") {
      const transientConfig = {
        ...existing,
        tasks: getVisibleConfigTasks(existing, state.taskRouting)
      };
      const result = await testModelConfig(transientConfig);
      sendJson(response, 200, {
        config: {
          ...summarizeModelConfig(transientConfig),
          testResults: JSON.parse(JSON.stringify(result.results || {}))
        }
      });
      return true;
    }

    return false;
  };
}

function summarizeState(state, summarizeModelConfig) {
  return {
    modelConfigs: state.modelConfigs.map((config) => ({
      ...summarizeModelConfig(config),
      tasks: getVisibleConfigTasks(config, state.taskRouting),
      testResults: {}
    })),
    taskRouting: { ...state.taskRouting }
  };
}

function getVisibleConfigTasks(config, taskRouting) {
  const hasVision = config.tasks.includes(MODEL_TASKS.VISION);
  const imageTasks = config.tasks.filter((task) => (
    task === MODEL_TASKS.GENERATION || task === MODEL_TASKS.INPAINT
  ));
  if (!hasVision || imageTasks.length === 0) return [...config.tasks];
  const routedToVision = taskRouting?.vision === config.id;
  const routedToImage = imageTasks.some((task) => taskRouting?.[task] === config.id);
  if (routedToVision && !routedToImage) return [MODEL_TASKS.VISION];
  if (routedToImage && !routedToVision) return imageTasks;
  return [...config.tasks];
}

function createPreviewConfig(payload, state, validateModelConfigInput) {
  const configId = String(payload.configId || "");
  const existing = configId
    ? state.modelConfigs.find((config) => config.id === configId)
    : null;
  if (configId && !existing) throw notFound(`模型配置不存在：${configId}`);
  const hasApiKey = Object.prototype.hasOwnProperty.call(payload, "apiKey");
  return validateModelConfigInput({
    ...existing,
    ...payload,
    id: existing?.id || "preview",
    apiKey: hasApiKey ? payload.apiKey : (existing?.apiKey || ""),
    testResults: {}
  });
}

function cloneState(state) {
  return {
    version: 2,
    modelConfigs: state.modelConfigs.map((config) => ({
      ...config,
      tasks: [...config.tasks],
      testResults: JSON.parse(JSON.stringify(config.testResults || {}))
    })),
    taskRouting: { ...state.taskRouting },
    legacy: JSON.parse(JSON.stringify(state.legacy || {}))
  };
}

function clearInvalidRoutes(state, configId) {
  const config = state.modelConfigs.find((item) => item.id === configId);
  for (const task of Object.values(MODEL_TASKS)) {
    if (state.taskRouting[task] === configId && !config.tasks.includes(task)) {
      state.taskRouting[task] = null;
    }
  }
}

function hasMaterialConfigChange(previous, next) {
  return previous.baseUrl !== String(next.baseUrl || "").trim().replace(/\/+$/, "")
    || previous.apiKey !== String(next.apiKey || "").trim()
    || previous.model !== String(next.model || "").trim()
    || previous.timeoutMs !== normalizeInputTimeoutMs(next)
    || JSON.stringify(previous.tasks) !== JSON.stringify(next.tasks);
}

function normalizeInputTimeoutMs(input) {
  if (input.timeoutMs !== undefined) return Number(input.timeoutMs);
  return Number(input.timeoutSeconds) * 1000;
}

function parsePathname(url) {
  return new URL(url, "http://127.0.0.1").pathname;
}

function decodeSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw badRequest("请求路径编码无效");
  }
}

function badRequest(message) {
  return httpError(400, message);
}

function notFound(message) {
  return httpError(404, message);
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  createModelConfigRoutes
};
