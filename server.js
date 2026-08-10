const http = require("http");
const { AsyncLocalStorage } = require("async_hooks");
const { Buffer } = require("buffer");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const {
  buildBackgroundDecompositionPrompt,
  buildBackgroundDecompositionJsonRepairPrompt,
  parseUiDecompositionText
} = require("./src/core/background-decomposition");
const {
  createModelConfigId,
  createTaskConfigSnapshot,
  normalizeModelConfigState,
  resolveTaskConfig,
  summarizeModelConfig,
  validateModelConfigInput
} = require("./src/server/config/model-config");
const {
  loadLocalConfig,
  saveLocalConfig: saveLocalConfigFile
} = require("./src/server/storage/local-config-store");
const {
  createWorkspaceDraftStore
} = require("./src/server/storage/workspace-draft-store");
const {
  listProviderModels
} = require("./src/server/providers/provider-http-client");
const {
  reconstructFastEditableHtml
} = require("./src/server/services/fast-editable-html");
const {
  createModelRequestContext
} = require("./src/server/services/model-request-context");
const {
  createPlaywrightFigmaCaptureService
} = require("./src/server/services/playwright-figma-capture");
const {
  requestUiDecompositionText
} = require("./src/server/services/ui-decomposition-request");
const {
  testModelConfig
} = require("./src/server/services/model-config-tester");
const {
  sanitizeFastGeneratedHtml
} = require("./src/server/services/fast-html-sanitizer");
const {
  createAiInpaintCapabilityFixture,
  createNativeInpaintForm,
  prepareAiInpaintInputs,
  restoreAiInpaintImage,
  runAiInpaintRoute
} = require("./src/server/services/ai-inpaint");
const {
  createWorkspaceRoutes
} = require("./src/server/routes/workspace-routes");
const {
  createProgressRoutes
} = require("./src/server/routes/progress-routes");
const {
  createImageRoutes
} = require("./src/server/routes/image-routes");
const {
  createAssetRoutes
} = require("./src/server/routes/asset-routes");
const {
  createDesignRoutes
} = require("./src/server/routes/design-routes");
const {
  createModelConfigRoutes
} = require("./src/server/routes/model-config-routes");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 18787);
const CONFIG_FILE = path.join(__dirname, ".local-provider-config.json");
const WORKSPACE_HISTORY_DIR = path.join(__dirname, ".image-to-slice-history");
const FIGMA_CAPTURE_RUNTIME = fs.readFileSync(
  path.join(__dirname, "src/vendor/figma-capture.js"),
  "utf8"
);
const playwrightFigmaCaptureService = createPlaywrightFigmaCaptureService({
  chromium,
  captureRuntime: FIGMA_CAPTURE_RUNTIME
});
const workspaceDraftStore = createWorkspaceDraftStore({
  historyDir: WORKSPACE_HISTORY_DIR,
  createThumbnail: createWorkspaceDraftThumbnail
});
const handleWorkspaceRoutes = createWorkspaceRoutes({
  workspaceDraftStore,
  readJson,
  sendJson
});
const localConfig = loadLocalConfig(CONFIG_FILE);
let modelConfigState = normalizeModelConfigState(localConfig);
let vectorizerModulePromise = null;
let sharpModulePromise = null;
const aiProgressJobs = new Map();
const aiProgressControllers = new Map();
const aiRequestContext = new AsyncLocalStorage();
let activeAiRequestCount = 0;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization"
};
const handleModelConfigRoutes = createModelConfigRoutes({
  headers: JSON_HEADERS,
  readJson,
  sendJson,
  getState: () => modelConfigState,
  commitState: commitModelConfigState,
  createId: createModelConfigId,
  validateModelConfigInput,
  summarizeModelConfig,
  resolveTaskConfig,
  listProviderModels,
  testModelConfig: testSelectedModelConfig
});
const handleProgressRoutes = createProgressRoutes({
  getProgressJob: (id) => aiProgressJobs.get(id),
  getProgressController: (id) => aiProgressControllers.get(id),
  finishProgress: finishAiProgress,
  sendJson
});
const handleImageRoutes = createImageRoutes({
  getTaskRequestContext,
  readJson,
  runWithAiProgress,
  generateImage,
  editImage,
  sendJson
});
const handleAssetRoutes = createAssetRoutes({
  getTaskRequestContext,
  readJson,
  runWithAiProgress,
  generateTransparentAsset,
  redrawAsset,
  redrawAssetAsSvg,
  vectorizeAsset,
  sendJson
});
const handleDesignRoutes = createDesignRoutes({
  getTaskRequestContext,
  readJson,
  runWithAiProgress,
  planBackgroundDecomposition,
  reconstructEditableDesignH5,
  captureHighFidelityFigma: (payload) =>
    playwrightFigmaCaptureService.capture(payload),
  sendJson
});
const PROVIDER_TEST_IMAGE_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAAF1UlEQVR42u2Y+1MTVxzF75/jq9Vpx+lrrHVaW0EEH2hVqiIoKKKM1ic+CoJAoT4ApVhFMRQRiMrLVgQyIKIQEROQDb4FpaJRNExnVKqc3k1dyGN3czexTOLyw+dOhg3nfs+59373TkhsI6BmyLYmQM2Q7XpAzZCfLgNqhsTTQc2QhGZAzZDEK4CaIUktgJohKXTwJTJaLLjYWoRH7VvQzy210tMeiwb6N/6ZUj2SehXwFUqNjXjFhQHcQlH4Z6XGJkWaJM0A+AJlrfTaxoVImh8ixBoCqy7ZTQdv51eDRXblnXZCeziyjBYmbbLXCHg7TdeKmM0LNLYVM2mT9FbA2zFzmxUH8Jg2RhZtktFGO6uX069g+9s2RBZtsp8O3o57AYQzaZOsa4C3Y+a2KA7AzMUyaZPsdsDbucIpb4LN7VombXKQA7wdDWdRdAxecctwjOtj0iaH6OALVHNNzBehKk7PrEtyTICvUEND6KfNTW7la0x6RZrkaAfgSxR0WGAwFeMJbXL8seDhPxtMWvqsT7Eeyb0OqBmioYOaIb/fANQMOX4TUDOkgA5qhhTeAtQMKb4NeEp87Tkk1uvwLrSGG3LyDuAJuxv1CMpdYWWv3gBP9YYbcooO7nKgpQOzj61C0NFIK3M0a3C4tQueaA43pOQu4A45rZ0I1sQMmhdYcHwj8jt64a7ucEPK7tFfXBWSbzJjfv4GJ/MCYcWJOHXrJdzRtiW+thwJdX94rCMHqegElKC92YfFhTskzQtEl2ai7O4bKNUX2EnNC1q76ivd1nEFOUMHVkruvEC4dpdL8wJbqwqhRF/A1jzPzKMrkNZQ65aWK8ifXQALZzpfI7osndm8QFqDDqxz8CTUlYvq8CHsuVSvSIsFUnkfcMXZ+wPYVJmr2LwV+nrMbjGAZZ5ECfODIeSuxP7my0xarJCqB4Ar4nTF7pl/S3DeGhSYumTn2HW+nElrVm4UDl01gqVuFkg1HeRIvXDOZVFfJMzHpKSFst9ZSF+PJbd6RedIEjEfmBOBT3fMtRJ4JMIhhFXIMbbBVe0sEF03IEV289tbnpSxI5H4LG4eRq3ww6iVfpiS9oNsCMu1iajsfGk3R7KIef+D4ZjwY9B/upSPNs7CjEPL7b4zR7MammvXIVc/C6T2L0AMTZv9Lc9phaj5T7YFDxbJM3qlP77Zt1g2hJjyTOgevLHOkVLvbP7rPYsxJnq6nS7PBzGBmJYVZvfdeXkxOGG6CykPLJDzdHCkuKMTc/NipM3nRGJi7BynIq0hRPnju8xQ2RDiak7gZwfzfKD8URotoinABzM1fYnd/32ftxba610Q88ECqX8I2FJx20zP6wYZ8xH4eNNsySJ5xtJC/bLCmZvkdLq9+W0upzm0y/zwZbJ9v5mfvx6nb3bD0QsLpKEHEKju6kNokfQtL+AwLXTDTKZCP4yZgYDflrk0/23GEoxbE8CkaYtjc+QXrez2Q9j6YYFcegTw1HW/QOQp6VteAF2lCeuDFBU5fl2QNTSpBsqvJN83lJqXao6LCjbj7L0nEDyxQJr4Dw9fY22F9C2PX8nx6wLdLHKm02tsBg1FqocoxbE5hhZtQ03nM/C+WCBNjwewvUr6luefHW6dxJMiJ24NRuBbvWkHwjzWc9Ucl9JjrLtvgf4xXEKS66RveX402XGrA95JkZ/Hz8NXqSEYE+X/Ts0P4Y/JKUPNMUK7Exe6/0azGbIQKfPT9i/FOJH3sbdj2xyjTifjUs8LtDyBJKIBTM0IxdhVvmderDlGl6ZC3/MSBmpWDKcApqaH0m3qu+bFmuO6in10u/fD+BROEMdr6Oj/7YwOP7bNcf2ZdFw1/4O2XtgxGMCUXxZZG8n7Yl7s5hhbmY22p2/Q/gyDWAOYnBIiewd/HxCaY1z1EXC9AzBR8zxkUtKC99q4WHNM1B2D6fkAOp7TANRi3rE5pp0vxA2LCgOwbY6ZF0vUGYBtc1RtAAIjAYwEMBLASACqDuBfHnEGGM75hW0AAAAASUVORK5CYII=";
const EDITABLE_HTML_MAX_TOKENS = Number(process.env.EDITABLE_HTML_MAX_TOKENS || process.env.OPENROUTER_H5_MAX_TOKENS || 12000);
const SVG_MAX_TOKENS = Number(process.env.SVG_MAX_TOKENS || process.env.OPENROUTER_SVG_MAX_TOKENS || 4096);
const DECOMPOSITION_MAX_TOKENS = Number(process.env.DECOMPOSITION_MAX_TOKENS || process.env.OPENROUTER_DECOMPOSITION_MAX_TOKENS || 8192);

const server = http.createServer(async (request, response) => {
  try {
    if (!isAllowedRequestOrigin(request.headers.origin)) {
      sendJson(response, 403, { error: "Origin is not allowed" });
      return;
    }
    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (await handleModelConfigRoutes(request, response)) {
      return;
    }

    if (await handleWorkspaceRoutes(request, response)) {
      return;
    }

    if (await handleProgressRoutes(request, response)) {
      return;
    }

    if (await handleImageRoutes(request, response)) {
      return;
    }

    if (await handleAssetRoutes(request, response)) {
      return;
    }

    if (await handleDesignRoutes(request, response)) {
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(response, status, {
      error: error.message || "Internal server error"
    });
  }
});

async function createWorkspaceDraftThumbnail(draft) {
  const source = draft?.manifest?.resultImages?.[0]?.dataUrl;
  if (!source) return "";
  try {
    const sharp = await loadSharpModule();
    const buffer = await sharp(dataUrlToBuffer(source)).resize(112, 112, { fit: "cover" }).webp({ quality: 72 }).toBuffer();
    return `data:image/webp;base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.warn("Failed to create workspace thumbnails:", error.message || String(error));
    return "";
  }
}

server.listen(PORT, HOST, () => {
  console.log(`Image To Slice API listening on http://${HOST}:${PORT}`);
  console.log(`Model configs: ${modelConfigState.modelConfigs.length}`);
});

function commitModelConfigState(nextState) {
  saveLocalConfigFile(CONFIG_FILE, nextState);
  modelConfigState = nextState;
}

function getTaskRequestContext(task) {
  const config = resolveTaskConfig(modelConfigState, task);
  return getConfigRequestContext(config);
}

function getConfigRequestContext(config) {
  const snapshot = createTaskConfigSnapshot(config);
  if (snapshot.type === "openaiCompatible" && !snapshot.apiKey) {
    throw badRequest(`模型配置“${snapshot.name}”缺少 Api Key`);
  }
  return createModelRequestContext(snapshot, {
    createAbortError,
    getRequestSignal: () => aiRequestContext.getStore()?.signal
  });
}

async function testSelectedModelConfig(config) {
  const requestContext = getConfigRequestContext(config);
  return testModelConfig(config, {
    vision: async () => {
      const data = await requestVisionChatCompletion({
        model: requestContext.config.model,
        messages: [{
          role: "user",
          content: buildVisionMessageContent(
            "Reply with exactly OK after inspecting this image.",
            [{ dataUrl: PROVIDER_TEST_IMAGE_DATA_URL, name: "connection-test.png" }]
          )
        }],
        max_tokens: 32,
        stream: false
      }, requestContext);
      if (!extractChatCompletionText(data).trim()) {
        throw Object.assign(new Error("图片理解模型没有返回内容"), { statusCode: 502 });
      }
      return { ok: true };
    },
    generation: async () => {
      const result = await generateImage({
        prompt: "Create one plain white square image with no text or objects.",
        width: 256,
        height: 256,
        quality: "low"
      }, requestContext);
      if (!result.images?.[0]?.dataUrl) {
        throw Object.assign(new Error("图片生成模型没有返回图片"), { statusCode: 502 });
      }
      return { ok: true };
    },
    inpaint: async () => {
      const fixture = await createAiInpaintCapabilityFixture();
      const result = await redrawInpaintAsset({
        dataUrl: fixture.sourceDataUrl,
        maskDataUrl: fixture.maskDataUrl,
        name: "inpaint-capability-source.png",
        width: 64,
        height: 64,
        prompt: "Reconstruct only the selected center square using the surrounding pale blue background.",
        quality: "low"
      }, requestContext);
      if (!result.images?.[0]?.dataUrl) {
        throw Object.assign(new Error("AI补图模型没有返回图片"), { statusCode: 502 });
      }
      return {
        ok: true,
        maskMode: result.provider?.maskMode || "semantic-reference"
      };
    }
  });
}

function initializeAiProgress(progressId, message) {
  if (!progressId) return;
  const now = Date.now();
  aiProgressJobs.set(progressId, {
    status: "running",
    message,
    startedAt: now,
    lastEventAt: now,
    logs: [{ at: now, message }]
  });
}

async function runWithAiProgress(payload, message, operation) {
  const progressId = payload?.progressId;
  const controller = new AbortController();
  initializeAiProgress(progressId, message);
  if (progressId) aiProgressControllers.set(progressId, controller);
  activeAiRequestCount += 1;
  try {
    const result = await aiRequestContext.run({ signal: controller.signal }, operation);
    completeAiProgress(progressId, "AI 处理完成");
    return result;
  } catch (error) {
    if (error?.name === "AbortError") {
      finishAiProgress(progressId, "cancelled", "AI 处理已取消");
    } else {
      failAiProgress(progressId, error.message || String(error));
    }
    throw error;
  } finally {
    if (progressId && aiProgressControllers.get(progressId) === controller) {
      aiProgressControllers.delete(progressId);
    }
    activeAiRequestCount = Math.max(0, activeAiRequestCount - 1);
  }
}

function updateAiProgress(progressId, message) {
  if (!progressId || !message) return;
  const job = aiProgressJobs.get(progressId);
  if (!job) return;
  const now = Date.now();
  if (job.message !== message) {
    job.logs = [...job.logs, { at: now, message }].slice(-12);
  }
  job.message = message;
  job.lastEventAt = now;
}

function finishAiProgress(progressId, status, message) {
  if (!progressId) return;
  const job = aiProgressJobs.get(progressId);
  if (!job) return;
  const now = Date.now();
  job.status = status;
  job.message = message;
  job.lastEventAt = now;
  job.logs = [...job.logs, { at: now, message }].slice(-12);
  setTimeout(() => aiProgressJobs.delete(progressId), 10 * 60 * 1000).unref?.();
}

function completeAiProgress(progressId, message) {
  finishAiProgress(progressId, "completed", message);
}

function failAiProgress(progressId, message) {
  finishAiProgress(progressId, "failed", message);
}

async function generateImage(payload, requestContext) {
  const config = requestContext.config;
  const prompt = buildRequestedAspectPrompt(
    buildUiScreenshotPrompt(assertString(payload.prompt, "prompt")),
    payload.width,
    payload.height
  );
  const count = 1;
  const body = {
    model: config.model,
    prompt,
    size: toProviderImageSize(payload.width, payload.height, config),
    quality: payload.quality || "high",
    output_format: payload.outputFormat || "png",
    background: payload.background || "opaque",
    n: count
  };

  const data = await requestContext.callJson("/v1/images/generations", body);
  return {
    ...(await normalizeImageResponse(data)),
    provider: {
      baseUrl: config.baseUrl,
      model: config.model,
      size: body.size
    }
  };
}

async function editImage(payload, requestContext) {
  const config = requestContext.config;
  const prompt = buildRequestedAspectPrompt(
    buildUiScreenshotPrompt(assertString(payload.prompt, "prompt")),
    payload.width,
    payload.height
  );
  const count = 1;
  const images = Array.isArray(payload.images) ? payload.images : [];
  if (images.length === 0) {
    throw badRequest("images must contain at least one data URL image");
  }
  const form = new FormData();
  form.set("model", config.model);
  form.set("prompt", prompt);
  form.set("size", toProviderImageSize(payload.width, payload.height, config));
  form.set("quality", payload.quality || "high");
  form.set("output_format", payload.outputFormat || "png");
  form.set("background", payload.background || "opaque");
  form.set("n", String(count));

  images.slice(0, 16).forEach((image, index) => {
    const file = dataUrlToFile(image.dataUrl, image.name || `reference-${index + 1}.png`);
    form.append("image[]", file);
  });

  const data = await requestContext.callForm("/v1/images/edits", form);
  return {
    ...(await normalizeImageResponse(data)),
    provider: {
      baseUrl: config.baseUrl,
      model: config.model,
      size: toProviderImageSize(payload.width, payload.height, config)
    }
  };
}

async function generateTransparentAsset(payload, requestContext) {
  const config = requestContext.config;
  const prompt = assertString(payload.prompt, "prompt");
  const body = {
    model: config.model,
    prompt: `${prompt}\n\nTransparent background. Isolated UI asset. No mockup, no device frame, no background.`,
    size: toOpenAIImageSize(payload.width, payload.height),
    quality: payload.quality || "high",
    output_format: "png",
    background: "transparent",
    n: 1
  };

  const data = await requestContext.callJson("/v1/images/generations", body);
  return {
    ...(await normalizeImageResponse(data)),
    provider: {
      baseUrl: config.baseUrl,
      model: config.model,
      size: body.size
    }
  };
}

async function redrawAsset(payload, requestContext) {
  const config = requestContext.config;
  const dataUrl = assertString(payload.dataUrl, "dataUrl");
  const maskDataUrl = payload.maskDataUrl;
  const width = payload.width;
  const height = payload.height;
  const preserveBackground = payload.preserveBackground === true;
  const sourcePrompt = assertString(payload.prompt || "Redraw this UI asset.", "prompt");
  if (preserveBackground && maskDataUrl) {
    return redrawInpaintAsset({
      ...payload,
      dataUrl,
      maskDataUrl,
      prompt: sourcePrompt,
      width,
      height
    }, requestContext);
  }
  const prompt = buildAssetRedrawPrompt(sourcePrompt);
  const optimizedReference = { dataUrl, maskDataUrl: null, width, height };
  const requestDataUrl = optimizedReference.dataUrl;
  const requestMaskDataUrl = optimizedReference.maskDataUrl;
  const requestWidth = optimizedReference.width;
  const requestHeight = optimizedReference.height;
  const referenceImages = [
    { dataUrl: requestDataUrl, name: payload.name || "slice-reference.png" }
  ];
  if (requestMaskDataUrl) {
    referenceImages.push({ dataUrl: requestMaskDataUrl, name: "slice-completion-mask.png" });
  }
  const form = new FormData();
  const editSize = toOpenAIImageSize(requestWidth, requestHeight);
  form.set("model", config.model);
  form.set("prompt", prompt);
  form.set("size", editSize);
  form.set("quality", payload.quality || "high");
  form.set("output_format", "png");
  form.set("background", "transparent");
  form.set("n", "1");
  form.append("image[]", dataUrlToFile(requestDataUrl, payload.name || "slice-reference.png"));
  if (requestMaskDataUrl) {
    form.append("image[]", dataUrlToFile(requestMaskDataUrl, "slice-completion-mask.png"));
  }

  const data = await requestContext.callForm("/v1/images/edits", form);
  return {
    ...(await normalizeImageResponse(data)),
    provider: {
      baseUrl: config.baseUrl,
      model: config.model,
      size: editSize
    },
    transparent: true
  };
}

async function redrawInpaintAsset(payload, requestContext) {
  const config = requestContext.config;
  const editSize = toOpenAIImageSize(payload.width, payload.height);
  const [targetWidth, targetHeight] = editSize.split("x").map(Number);
  const prepared = await prepareAiInpaintInputs({
    sourceDataUrl: payload.dataUrl,
    maskDataUrl: payload.maskDataUrl,
    targetWidth,
    targetHeight
  });
  const prompt = scaleAiInpaintRegionPrompt(
    payload.prompt,
    payload.completeRegions,
    payload.width,
    payload.height,
    prepared
  );
  const semanticImages = [
    {
      dataUrl: prepared.semanticInputDataUrl,
      name: payload.name || "inpaint-source.png"
    },
    {
      dataUrl: prepared.semanticMaskDataUrl,
      name: "inpaint-selection-mask.png"
    }
  ];
  const routed = await runAiInpaintRoute({
    runNative: async () => {
      const nativeForm = createNativeInpaintForm({
        model: config.model,
        prompt,
        size: editSize,
        quality: payload.quality || "high",
        sourceDataUrl: prepared.sourceDataUrl,
        nativeMaskDataUrl: prepared.nativeMaskDataUrl,
        name: payload.name || "inpaint-source.png"
      });
      return normalizeImageResponse(await requestContext.callForm("/v1/images/edits", nativeForm));
    },
    runSemantic: async () => {
      const compatibilityForm = createSemanticInpaintForm({
        model: config.model,
        prompt,
        size: editSize,
        quality: payload.quality || "high",
        images: semanticImages
      });
      return normalizeImageResponse(await requestContext.callForm("/v1/images/edits", compatibilityForm));
    }
  });
  const response = routed.result;
  const maskMode = routed.maskMode;
  const restoredImages = await Promise.all((response.images || []).map(async (image) => ({
    ...image,
    dataUrl: await restoreAiInpaintImage(image.dataUrl, prepared)
  })));
  return {
    ...response,
    images: restoredImages,
    provider: {
      ...(response.provider || {}),
      baseUrl: response.provider?.baseUrl || config.baseUrl,
      model: response.provider?.model || config.model,
      size: editSize,
      maskMode
    },
    transparent: false
  };
}

function createSemanticInpaintForm({ model, prompt, size, quality, images }) {
  const form = new FormData();
  form.set("model", model);
  form.set("prompt", prompt);
  form.set("size", size);
  form.set("quality", quality);
  form.set("output_format", "png");
  form.set("n", "1");
  images.forEach((image) => {
    form.append("image[]", dataUrlToFile(image.dataUrl, image.name));
  });
  return form;
}

function scaleAiInpaintRegionPrompt(prompt, regions, sourceWidth, sourceHeight, prepared) {
  if (!Array.isArray(regions) || regions.length === 0) return prompt;
  const scaleX = prepared.contentBox.width / Math.max(1, Number(sourceWidth) || prepared.contentBox.width);
  const scaleY = prepared.contentBox.height / Math.max(1, Number(sourceHeight) || prepared.contentBox.height);
  const scaledRegions = regions.map((region) => ({
    x: Math.round(prepared.contentBox.x + (Number(region.x) || 0) * scaleX),
    y: Math.round(prepared.contentBox.y + (Number(region.y) || 0) * scaleY),
    width: Math.max(1, Math.round((Number(region.width) || 0) * scaleX)),
    height: Math.max(1, Math.round((Number(region.height) || 0) * scaleY))
  }));
  return prompt.replace(
    /Only reconstruct these slice-local rectangles: .*?\./,
    `Only reconstruct these rectangles in the prepared ${prepared.width}x${prepared.height} image: ${JSON.stringify(scaledRegions)}.`
  );
}

async function redrawAssetAsSvg(payload, requestContext) {
  const config = requestContext.config;
  const dataUrl = assertString(payload.dataUrl, "dataUrl");
  const width = clampNumber(payload.width || 512, 16, 4096);
  const height = clampNumber(payload.height || 512, 16, 4096);
  const basePrompt = buildAssetSvgPrompt({
    prompt: payload.prompt || "",
    name: payload.name || "ui_asset",
    width,
    height
  });
  const attempts = [
    { prompt: basePrompt, label: "primary" },
    { prompt: buildAssetSvgRetryPrompt(basePrompt), label: "retry-clean-vector" }
  ];
  let lastError = null;
  let svg = "";
  let usedAttempt = attempts[0].label;

  for (const attempt of attempts) {
    try {
      const data = await requestSvgChatCompletion({
        prompt: attempt.prompt,
        dataUrl,
        name: payload.name || "slice-reference.png",
        requestContext
      });
      const text = extractChatCompletionText(data);
      svg = sanitizeGeneratedSvg(text);
      usedAttempt = attempt.label;
      break;
    } catch (error) {
      lastError = error;
      if (!error.isSvgValidationError || attempt === attempts[attempts.length - 1]) {
        throw error;
      }
    }
  }

  if (!svg) {
    throw lastError || svgValidationError("模型没有返回有效 SVG");
  }

  return {
    ok: true,
    engine: "ai-direct-svg",
    svg,
    attempt: usedAttempt,
    provider: {
      baseUrl: config.baseUrl,
      model: config.model,
      size: `${width}x${height}`
    }
  };
}

async function requestSvgChatCompletion({ prompt, dataUrl, name, requestContext }) {
  const config = requestContext.config;
  const body = {
    model: config.model,
    messages: [
      {
        role: "user",
        content: buildVisionMessageContent(prompt, [
          {
            dataUrl,
            name
          }
        ])
      }
    ],
    stream: false,
    temperature: 0.08,
    max_tokens: SVG_MAX_TOKENS
  };
  return requestContext.callJson("/v1/chat/completions", body);
}

async function vectorizeAsset(payload) {
  const dataUrl = assertString(payload.dataUrl, "dataUrl");
  const imageBuffer = dataUrlToBuffer(dataUrl);
  const { buffer: vectorImageBuffer, info: preprocessInfo } = await preprocessImageForVectorization(imageBuffer);
  const {
    vectorize,
    ColorMode,
    Hierarchical,
    PathSimplifyMode
  } = await loadVectorizerModule();

  const svg = await vectorize(vectorImageBuffer, {
    colorMode: ColorMode.Color,
    colorPrecision: 7,
    filterSpeckle: 8,
    spliceThreshold: 55,
    cornerThreshold: 68,
    hierarchical: Hierarchical.Stacked,
    mode: PathSimplifyMode.Spline,
    layerDifference: 8,
    lengthThreshold: 6,
    maxIterations: 3,
    pathPrecision: 4
  });

  const pathCount = (svg.match(/<path/g) || []).length;
  if (!pathCount) {
    throw badRequest("没有检测到可转换的 SVG 路径");
  }
  if (pathCount > 900) {
    throw badRequest("路径过多，这个素材更适合保留 PNG");
  }

  return {
    ok: true,
    engine: "vtracer",
    preprocess: preprocessInfo,
    pathCount,
    svg
  };
}

async function preprocessImageForVectorization(imageBuffer) {
  try {
    const sharp = await loadSharpModule();
    const image = sharp(imageBuffer, {
      animated: false,
      failOn: "none",
      limitInputPixels: false
    }).rotate().ensureAlpha();
    const metadata = await image.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    if (!width || !height) {
      return { buffer: imageBuffer, info: { applied: false, reason: "missing-size" } };
    }

    const longest = Math.max(width, height);
    const targetLongest = longest < 384 ? Math.min(768, longest * 3) : Math.min(1400, longest);
    const scale = targetLongest > longest ? targetLongest / longest : 1;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    let pipeline = image;
    if (scale > 1.01) {
      pipeline = pipeline.resize({
        width: targetWidth,
        height: targetHeight,
        fit: "fill",
        kernel: sharp.kernel.lanczos3
      });
    }

    const buffer = await pipeline
      .median(1)
      .blur(0.18)
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true
      })
      .toBuffer();

    return {
      buffer,
      info: {
        applied: true,
        width,
        height,
        targetWidth,
        targetHeight,
        scale: Number(scale.toFixed(2))
      }
    };
  } catch (error) {
    console.warn(`Vectorize preprocessing skipped: ${error.message}`);
    return { buffer: imageBuffer, info: { applied: false, reason: error.message } };
  }
}

function loadVectorizerModule() {
  if (!vectorizerModulePromise) {
    vectorizerModulePromise = import("@neplex/vectorizer");
  }
  return vectorizerModulePromise;
}

function loadSharpModule() {
  if (!sharpModulePromise) {
    sharpModulePromise = import("sharp").then((module) => module.default || module);
  }
  return sharpModulePromise;
}

function buildVisionMessageContent(prompt, images) {
  if (!images.length) {
    return prompt;
  }
  return [
    { type: "text", text: prompt },
    ...images.slice(0, 16).map((image) => ({
      type: "image_url",
      image_url: {
        url: image.dataUrl
      }
    }))
  ];
}

async function requestVisionChatCompletion(body, requestContext) {
  return body?.stream
    ? requestContext.callStream("/v1/chat/completions", body)
    : requestContext.callJson("/v1/chat/completions", body);
}

function extractChatCompletionText(data) {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  for (const choice of choices) {
    const content = choice?.message?.content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }
    if (Array.isArray(content)) {
      const text = content
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }
          return item?.text || item?.content || "";
        })
        .join("\n")
        .trim();
      if (text) {
        return text;
      }
    }
  }
  throw new Error("模型没有返回文本内容");
}

function sanitizeGeneratedSvg(text) {
  const withoutFence = String(text || "")
    .replace(/^```(?:svg|xml)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const match = withoutFence.match(/<svg\b[\s\S]*?<\/svg>/i);
  if (!match) {
    throw svgValidationError("模型没有返回有效 SVG");
  }
  const svg = match[0].trim();
  const blockedPatterns = [
    /<script\b/i,
    /<foreignObject\b/i,
    /<image\b/i,
    /\bon[a-z]+\s*=/i,
    /\b(?:href|xlink:href)\s*=/i,
    /data:image\//i,
    /javascript:/i
  ];
  if (blockedPatterns.some((pattern) => pattern.test(svg))) {
    throw svgValidationError("模型返回的 SVG 包含不允许的嵌入内容");
  }
  const openTag = svg.match(/<svg\b[^>]*>/i)?.[0] || "";
  if (!/\bviewBox\s*=/i.test(openTag)) {
    throw svgValidationError("模型返回的 SVG 缺少 viewBox");
  }
  const shapeCount = (svg.match(/<(path|rect|circle|ellipse|line|polyline|polygon)\b/gi) || []).length;
  if (!shapeCount) {
    throw svgValidationError("模型返回的 SVG 没有可编辑图形元素");
  }
  if (shapeCount > 220) {
    throw svgValidationError("AI SVG 图层过多，请重新切更小的区域或简化素材");
  }
  return svg;
}

function createAbortError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  error.statusCode = 499;
  return error;
}

function isAiAbortError(error) {
  return error?.name === "AbortError" || error?.statusCode === 504;
}

async function normalizeImageResponse(data) {
  const images = await Promise.all((data.data || []).map(async (item, index) => {
    const base64 = item.b64_json || item.image_base64 || item.base64;
    if (base64) {
      return {
        id: `image_${index + 1}`,
        dataUrl: `data:image/png;base64,${base64}`,
        revisedPrompt: item.revised_prompt || ""
      };
    }

    const remoteUrl = item.url || "";
    const dataUrl = remoteUrl ? await fetchRemoteImageAsDataUrl(remoteUrl) : "";
    return {
      id: `image_${index + 1}`,
      dataUrl,
      revisedPrompt: item.revised_prompt || ""
    };
  }));

  return { images };
}

async function reconstructEditableDesignH5(payload, requestContext) {
  return reconstructFastEditableHtml(payload, {
    assertString,
    clampNumber,
    normalizeEditableReferenceAssets,
    buildFallbackH5PreviewHtml,
    updateAiProgress,
    buildEditableDesignH5Prompt,
    buildVisionMessageContent,
    requestVisionChatCompletion,
    extractChatCompletionText,
    extractHtmlDocument,
    sanitizeFastGeneratedHtml,
    isAiAbortError,
    maxTokens: EDITABLE_HTML_MAX_TOKENS
  }, requestContext);
}

async function requestBackgroundDecompositionText(
  prompt,
  imageDataUrl,
  requestContext
) {
  return requestUiDecompositionText({
    prompt,
    imageDataUrl
  }, {
    buildVisionMessageContent,
    requestVisionChatCompletion,
    extractChatCompletionText,
    maxTokens: DECOMPOSITION_MAX_TOKENS
  }, requestContext);
}

async function planBackgroundDecomposition(payload, requestContext) {
  const imageDataUrl = assertString(payload.imageDataUrl || "", "imageDataUrl");
  if (!/^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(imageDataUrl)) {
    throw badRequest("imageDataUrl must be a PNG, JPEG, or WebP data URL");
  }
  const requestedWidth = Number(payload.width);
  const requestedHeight = Number(payload.height);
  if (!Number.isFinite(requestedWidth) || requestedWidth < 1 || !Number.isFinite(requestedHeight) || requestedHeight < 1) {
    throw badRequest("width and height must be positive numbers");
  }
  const width = Math.round(clampNumber(requestedWidth, 1, 32768));
  const height = Math.round(clampNumber(requestedHeight, 1, 32768));
  const prompt = buildBackgroundDecompositionPrompt({
    width,
    height,
    sourceImageName: String(payload.sourceImageName || "source-ui.png")
  });
  updateAiProgress(payload.progressId, "正在识别完整背景、保留内容和界面覆盖层");
  const rawText = await requestBackgroundDecompositionText(
    prompt,
    imageDataUrl,
    requestContext
  );
  let parsed;
  try {
    parsed = parseUiDecompositionText(rawText, { width, height });
  } catch (firstError) {
    updateAiProgress(payload.progressId, "正在修复模型返回的拆图计划 JSON");
    const repairedText = await requestBackgroundDecompositionText(
      buildBackgroundDecompositionJsonRepairPrompt(rawText),
      "",
      requestContext
    );
    parsed = parseUiDecompositionText(repairedText, { width, height });
  }
  updateAiProgress(
    payload.progressId,
    `已识别 ${parsed.assets.length} 个普通切图和 ${parsed.backgrounds.length} 个完整背景候选`
  );
  return {
    ok: true,
    assets: parsed.assets,
    backgrounds: parsed.backgrounds,
    provider: {
      baseUrl: requestContext.config.baseUrl,
      model: requestContext.config.model
    }
  };
}

function normalizeEditableReferenceAssets(value, width, height) {
  if (!Array.isArray(value)) {
    return [];
  }
  const ids = new Set();
  return value.map((asset, index) => {
    if (!asset || typeof asset !== "object") {
      throw badRequest(`切图资产 ${index + 1} 格式无效`);
    }
    const id = String(asset.id || "").trim();
    if (!id) {
      throw badRequest(`切图资产 ${index + 1} 缺少 ID`);
    }
    if (ids.has(id)) {
      throw badRequest(`切图资产 ID 重复：${id}`);
    }
    ids.add(id);
    const placement = asset.placement && typeof asset.placement === "object"
      ? asset.placement
      : null;
    const x = Number(placement?.x);
    const y = Number(placement?.y);
    const assetWidth = Number(placement?.width);
    const assetHeight = Number(placement?.height);
    const radius = Number(asset.radius || 0);
    if (
      !Number.isFinite(x) || x < 0
      || !Number.isFinite(y) || y < 0
      || !Number.isFinite(assetWidth) || assetWidth <= 0
      || !Number.isFinite(assetHeight) || assetHeight <= 0
      || x + assetWidth > width
      || y + assetHeight > height
      || !Number.isFinite(radius) || radius < 0
      || radius > Math.min(assetWidth, assetHeight) / 2
    ) {
      throw badRequest(`切图资产 ${id} 的坐标或圆角超出画板范围`);
    }
    return {
      id,
      name: safeNodeName(asset.name || id),
      kind: safeNodeName(asset.kind || asset.type || "asset"),
      type: safeNodeName(asset.type || "image"),
      radius: Math.round(radius),
      placement: {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(assetWidth),
        height: Math.round(assetHeight)
      }
    };
  });
}

function buildEditableDesignH5Prompt({ prompt, width, height, previewWidth, previewHeight, referenceAssets = [] }) {
  const assetLines = referenceAssets.length
    ? referenceAssets.map((asset, index) => {
        const p = asset.placement;
        const sx = Math.round(p.x * (previewWidth / width));
        const sy = Math.round(p.y * (previewHeight / height));
        const sw = Math.round(p.width * (previewWidth / width));
        const sh = Math.round(p.height * (previewHeight / height));
        const radius = Math.round((asset.radius || 0) * (previewWidth / width));
        return `- asset ${index + 1}: id=${asset.id}, name=${asset.name}, metadata only, source x=${p.x}, y=${p.y}, w=${p.width}, h=${p.height}, radius=${asset.radius || 0}; preview x=${sx}, y=${sy}, w=${sw}, h=${sh}, radius=${radius}. REQUIRED ANCHOR HTML: <img class="readable-name" data-reference-asset="${asset.id}" src="asset:${asset.id}" alt="${asset.name || asset.id}">. Put its geometry in class-based CSS. Do not redraw, replace, simplify, recolor, crop, or move it.`;
      }).join("\n")
    : "- No user-sliced assets were provided.";
  return [
    "You are a senior UI screenshot-to-HTML reconstruction engineer and mobile UI tracing specialist.",
    "Convert the attached UI screenshot into one standalone HTML document for visual inspection and later Figma import.",
    "Return human-readable production-style HTML that a frontend developer can continue editing.",
    "Choose tags and nesting from the screenshot content. Do not force a fixed semantic tag checklist.",
    "Group each coherent visual unit so its image, title, description, badge, and action live under one readable parent.",
    "Repeated units must use a consistent DOM shape and readable reusable class names.",
    "This is a pixel-reconstruction task. The goal is not a nicer similar app, but a faithful HTML trace of the provided screenshot.",
    "Think of this as manually tracing the screenshot on an artboard that matches the source image width, not redesigning an app screen.",
    "",
    "Highest priority:",
    `- The output artboard width MUST be exactly ${previewWidth}px.`,
    `- The output artboard height MUST be exactly ${previewHeight}px, derived from the original screenshot ${width}x${height}.`,
    "- Reconstruct the screenshot, do not redesign it, do not improve it, do not simplify it, and do not create a new visual style.",
    "- Preserve relative position, proportion, visual hierarchy, colors, gradients, shadows, border radii, strokes, spacing, typography, and layer order.",
    "- Use .fit-shell > .fit-box > .screen as the stable outer structure.",
    "- Keep .screen at the exact source width and height. Use parent-local coordinates inside each visual component.",
    "- Major visual geometry remains fixed and pixel-accurate; semantic nesting must not trigger responsive reflow.",
    "- Use the screenshot as the coordinate source: status bar, header, cards, icons, tabs, list rows, and bottom navigation must keep their original x/y/width/height relationships.",
    "- The screenshot is the only source of truth. The user prompt is only theme context and must not be copied as interface text.",
    "- Do not use the full screenshot as a background image. Build the UI with HTML/CSS shapes, editable text, and provided sliced assets.",
    "- Every provided sliced asset is mandatory and is a locked visual anchor. Place each one as an <img> inside .screen at its exact preview x/y/width/height.",
    "- If a sliced asset is an icon, mascot, avatar, decorative badge, product image, or complex graphic, DO NOT redraw it with CSS/SVG and DO NOT replace it with a similar icon. Use the exact asset:<id> image.",
    "- The injected asset must be visible in the final page. Do not cover it with white cards, text blocks, masks, or gradients.",
    "- Put sliced assets above their matching card/background but below only text that truly overlays the original image. Do not hide them behind white cards.",
    "- Do not invent large blank cards. If a region exists, fill it with its visible content.",
    "- Transcribe all visible text from the screenshot, even when it partially or fully overlaps a sliced asset. If unreadable, use a very short plausible placeholder only where text exists.",
    "- Text must not reflow differently from the screenshot. Short labels, currency values, dates, tab labels, button labels, nav labels, and list titles should use white-space:nowrap.",
    "- Multi-line text is allowed only when the screenshot itself clearly shows multiple lines.",
    "- Currency and numeric values must stay on one line, e.g. ¥268.00 must not become two lines or lose decimals.",
    "- Do not replace real icons with empty squares, checkboxes, emoji, generic placeholders, or unrelated icon glyphs.",
    "- If an icon is not provided as a sliced asset, draw a simple inline SVG with matching size, stroke weight, and position.",
    "- Never use literal arrow characters such as ›, ‹, →, ←, ↓, ↑, >, or < as UI arrows. Draw chevrons, back arrows, refresh arrows, and dropdown arrows as inline SVG shapes so they remain vector icons after Figma import.",
    "- Avoid oversized text. Match the screenshot's apparent font scale in the source image: header text, card labels, secondary text, badges, and navigation labels must stay visually proportional to the screenshot.",
    "- All layout and presentation must be class-based CSS in <style>. Do not use inline style attributes.",
    "- No JavaScript. No external URLs. No web fonts.",
    "- Use CSS gradients and shadows where the screenshot has them.",
    "- For complex avatars, colorful icons, mascot IP, product photos, decorative illustrations, and all user-sliced assets, use <img> layers.",
    "- For generic simple line icons not provided as slices, draw only very simple monochrome inline SVG paths or CSS strokes. Do not create colorful decorative SVG icons, do not redesign icons, and do not use emoji as icons.",
    "- Do not output any <img> tag unless it is one of the provided asset:<id> references. For unsliced simple icons, use inline <svg>.",
    "- Reference asset elements and their positioned ancestors must not use transform, rotate, skew, or scale.",
    "- Do not invent real URLs, API calls, application state, or complex JavaScript interactions.",
    "",
    "Absolute-positioning implementation rules:",
    "- .screen must be position:relative; each major visual region should have explicit geometry.",
    "- Use nested positioned containers for coherent cards, banners, list rows, navigation groups, and repeated components.",
    "- Inside each component, use parent-local left/top coordinates or stable flex/grid layout when it preserves the screenshot exactly.",
    "- For every text and SVG element, set explicit geometry, typography, and white-space where appropriate.",
    "- Do not let line-height, margins, padding, flex wrapping, or browser defaults change the screenshot geometry.",
    "- Reset h1,h2,h3,p,button margins to 0 in CSS.",
    "",
    "Provided sliced assets:",
    assetLines,
    "",
    "Reference-asset usage rules:",
    "- Treat every listed asset as an already-cut real UI element. Its coordinates are authoritative.",
    "- A sliced asset rectangle only defines that image asset's geometry. Do not use overlap with it as evidence that nearby or overlapping text, icons, badges, decoration, or controls should be omitted.",
    "- Place each reference asset inside its smallest coherent component owner: the item, row, card, entry, or action that owns its related text.",
    "- Use parent-local left/top coordinates for a nested reference asset while preserving its authoritative screen-relative rectangle.",
    "- Do not place all reference assets directly under .screen merely to keep global coordinates.",
    "- Page-wide artwork, section-wide decoration, and assets with no reliable component owner may remain at a broad container.",
    "- Create surrounding text, card backgrounds, dividers, buttons, and labels around these assets, but do not synthesize replacement artwork for them.",
    "- If an asset belongs to a grid item or card, reconstruct the whole grid/card around the fixed asset coordinate.",
    "- If an asset overlaps a section that the model thinks is blank, the asset wins: keep the asset and reconstruct the nearby UI.",
    "",
    "Pixel reconstruction workflow:",
    "1. Read the screenshot directly and create the main screen background and section bounding boxes first.",
    "2. Place all cards, banners, list rows, nav bars, search boxes, buttons, dividers, and gradients at their approximate screenshot coordinates.",
    "3. Place all required <img data-reference-asset> anchors at the exact coordinates listed above.",
    "4. Add visible text from the screenshot, preserving line breaks, font weight, size hierarchy, and color.",
    "5. Add simple unsliced line icons only where the screenshot has unsliced line icons.",
    "6. Review for common failures: no empty giant cards, no copied user prompt as UI text, no missing sliced assets, no rearranged grid, no unrelated icon set.",
    "",
    "HTML requirements:",
    "- Return only the complete HTML document, no Markdown fences and no explanation.",
    "- The document must contain <!doctype html>, <html>, <head>, <meta charset=\"UTF-8\">, <style>, and <body>.",
    "- The document must contain a meaningful <title> inferred from the visible page.",
    "- Body background may be neutral gray for preview only; the UI itself must be inside .screen.",
    "- .screen must have width and height exactly as specified and overflow hidden.",
    "- Asset references must use src=\"asset:<id>\". Do not embed base64 yourself.",
    "- Asset references should include data-reference-asset=\"<id>\" so the importer can preserve them.",
    "- Keep CSS readable and grouped by major regions.",
    "- Prefer border-box sizing.",
    "",
    "ScreenCoder-style reasoning checklist to apply silently before writing HTML:",
    "1. Identify all UI regions from top to bottom.",
    "2. Estimate the bounding box of every card/list/grid/nav/header/banner.",
    "3. Transcribe visible text and place it at matching coordinates.",
    "4. Reuse every provided sliced asset in its exact position. Treat these assets as locked visual anchors.",
    "5. Recreate gradients/backgrounds before placing foreground content.",
    "6. Compare mentally against screenshot and adjust obvious spacing/size issues.",
    "",
    "User prompt, for topic context only:",
    prompt || "(empty)"
  ].join("\n");
}

function extractHtmlDocument(text) {
  const raw = String(text || "")
    .trim()
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const fullMatch = raw.match(/<!doctype html[\s\S]*<\/html>/i) || raw.match(/<html[\s\S]*<\/html>/i);
  if (fullMatch) {
    const html = fullMatch[0].trim();
    return /^<!doctype html/i.test(html) ? html : `<!doctype html>\n${html}`;
  }
  const bodyMatch = raw.match(/<body[\s\S]*<\/body>/i);
  if (bodyMatch) {
    return `<!doctype html><html><head><meta charset="UTF-8"></head>${bodyMatch[0]}</html>`;
  }
  return `<!doctype html><html><head><meta charset="UTF-8"></head><body>${raw}</body></html>`;
}

function buildFallbackH5PreviewHtml({ width, height, previewWidth, previewHeight, imageDataUrl, referenceAssets = [] }) {
  const scaleX = previewWidth / width;
  const scaleY = previewHeight / height;
  const assetHtml = referenceAssets.map((asset) => {
    const p = asset.placement;
    return `<img class="slice-asset" data-reference-asset="${escapeHtmlAttribute(asset.id)}" src="asset:${escapeHtmlAttribute(asset.id)}" alt="${escapeHtmlAttribute(asset.name)}" style="left:${Math.round(p.x * scaleX)}px;top:${Math.round(p.y * scaleY)}px;width:${Math.round(p.width * scaleX)}px;height:${Math.round(p.height * scaleY)}px;border-radius:${Math.round((asset.radius || 0) * Math.min(scaleX, scaleY))}px;">`;
  }).join("");
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    "<meta charset=\"UTF-8\">",
    "<style>",
    "html,body{margin:0;padding:0;background:#eef0f4;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Arial,\"PingFang SC\",\"Microsoft YaHei\",sans-serif;}",
    "body{min-height:100vh;display:flex;justify-content:center;align-items:flex-start;}",
    "*{box-sizing:border-box;}",
    `.screen{position:relative;width:${previewWidth}px;height:${previewHeight}px;overflow:hidden;background:#f7f8fb;box-shadow:0 18px 60px rgba(20,24,36,.16);}`,
    ".source{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:.2;}",
    ".slice-asset{position:absolute;object-fit:contain;border-radius:8px;}",
    "</style>",
    "</head>",
    "<body>",
    "<main class=\"screen\">",
    imageDataUrl ? `<img class="source" src="${escapeHtmlAttribute(imageDataUrl)}" alt="">` : "",
    assetHtml,
    "</main>",
    "</body>",
    "</html>"
  ].join("");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  const withoutFence = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("模型没有返回 JSON 对象");
  }
  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch (error) {
    throw new Error(`JSON 解析失败：${error.message || String(error)}`);
  }
}

function safeNodeName(value) {
  return String(value || "node")
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "_")
    .slice(0, 64) || "node";
}

async function fetchRemoteImageAsDataUrl(url) {
  const response = await fetch(url, { signal: aiRequestContext.getStore()?.signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch generated image: ${response.status}`);
  }
  const mimeType = response.headers.get("content-type") || "image/png";
  const bytes = Buffer.from(await response.arrayBuffer());
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function dataUrlToFile(dataUrl, name) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw badRequest("image dataUrl must be a base64 data URL");
  }

  const mimeType = match[1];
  const bytes = Buffer.from(match[2], "base64");
  const blob = new Blob([bytes], { type: mimeType });
  return new File([blob], name, { type: mimeType });
}

function dataUrlToBuffer(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw badRequest("image dataUrl must be a base64 data URL");
  }
  return Buffer.from(match[2], "base64");
}

function buildUiScreenshotPrompt(prompt) {
  return [
    prompt,
    "Generate a full-screen app UI screenshot.",
    "Fill the entire image with the interface.",
    "No phone mockup, no device frame, no floating poster, no outer grey background, no table, no wall, no presentation board.",
    "Keep the UI aligned to the requested orientation and make it read like a real in-app screen."
  ].join("\n\n");
}

function buildRequestedAspectPrompt(prompt, width, height) {
  const targetWidth = Math.round(clampNumber(width, 256, 4096));
  const targetHeight = Math.round(clampNumber(height, 256, 4096));
  return [
    prompt,
    `The required final canvas is exactly ${targetWidth}x${targetHeight} pixels (${targetWidth}:${targetHeight} aspect ratio).`,
    "Compose specifically for this aspect ratio. Keep all important text, controls, subjects, and navigation inside the central safe area because only edge overflow may be cropped when the provider returns a fallback size.",
    "Do not place the requested screen inside a differently shaped canvas, frame, border, or letterbox."
  ].join("\n\n");
}

function buildAssetRedrawPrompt(prompt) {
  return [
    prompt,
    "This is not a full-screen UI generation task.",
    "Use the attached image only as the source asset reference.",
    "Redraw a single clean standalone UI asset.",
    "Preserve the source asset meaning, rough shape, color family, and orientation.",
    "Remove screenshot noise, neighboring UI fragments, accidental background, compression artifacts, and blurry edges.",
    "Output a transparent PNG when the provider supports transparency.",
    "Do not add a phone frame, app screen, mockup, poster, labels, extra icons, or extra background."
  ].join("\n\n");
}

function buildAssetSvgPrompt({ prompt, name, width, height }) {
  return [
    "You are a senior SVG vectorization engineer and UI icon restoration expert.",
    "Generate a high-fidelity, editable SVG icon based on the attached UI icon asset.",
    "The attached image is the only source of truth. The goal is to look like the original was carefully traced and vectorized, not redesigned.",
    prompt || `Redraw "${name}" as an SVG asset.`,
    "",
    "Core principles:",
    "- 1:1 similarity is more important than making a prettier new icon.",
    "- Faithful restoration is more important than simplification.",
    "- Do not redesign, restyle, normalize into an icon set, or change the category of the icon.",
    "- Do not simplify key structures or add elements that are not present in the source.",
    "- Do not convert a small UI icon into a large illustration.",
    "",
    "Before drawing, silently analyze the source:",
    "1. Identify the icon type: object, animal, person, symbol, abstract shape, functional icon, etc.",
    "2. Count the main contour blocks and major visual pieces.",
    "3. Identify the subject position, scale, visual center, and padding inside the crop.",
    "4. Identify the main contour direction, angles, posture, weight, asymmetry, concave/convex corners, notches, and special curves.",
    "5. Identify internal structures: highlights, shadows, facets, holes, lines, patterns, decorations, and local details.",
    "6. Identify layer order: what is in front, what is behind, and which parts overlap.",
    "7. Identify color relationships: main colors, gradient direction, opacity, highlights, dark areas, and shadows.",
    "Do not output this analysis. Use it only to guide the SVG.",
    "",
    "Canvas requirements:",
    "- Transparent background.",
    `- Use viewBox=\"0 0 ${width} ${height}\".`,
    "- Preserve the original crop's position, scale, and padding ratio.",
    "- Do not arbitrarily enlarge the subject to fill the canvas.",
    "- Do not crop the subject.",
    "- Do not add a background color, base plate, rounded rectangle, glow field, or decorative backdrop unless it exists in the source asset.",
    "",
    "Contour requirements:",
    "- The outer silhouette is mandatory and must closely match the source. Trace-like accuracy is preferred over creative interpretation.",
    "- Preserve the original proportions, posture, direction, visual weight, rounded corners, sharp corners, concave areas, convex areas, notches, tilt, asymmetry, and special curves.",
    "- For abstract icons and symbols, prioritize geometric contour accuracy over illustration style.",
    "- Do not round, blobify, inflate, smooth, or regularize the shape unless the source does.",
    "- Do not turn a complex contour into a generic geometric shape.",
    "- Do not add complexity to a simple source icon.",
    "",
    "Detail requirements:",
    "- Keep only details that are actually present in the source.",
    "- Preserve key highlights, shadows, gradients, facets, cutouts, lines, patterns, local decorations, and internal white/negative shapes.",
    "- Detail position, size, angle, and layer order should stay close to the original.",
    "- Clean up only screenshot noise, compression artifacts, accidental background contamination, blurry pixel edges, and neighboring UI fragments.",
    "- Do not add new textures, lighting effects, decorations, expressions, accessories, or backgrounds.",
    "",
    "Color requirements:",
    "- Match the source colors as closely as possible.",
    "- Preserve gradient direction, brightness relationships, opacity, highlights, and dark areas.",
    "- If the source uses gradients, use linearGradient or radialGradient.",
    "- If the source is flat color, keep it flat. Do not force gradients.",
    "- For soft shadows, prefer low-opacity paths, ellipses, or gradients. Use only simple filters when absolutely necessary.",
    "- Do not use heavy drop shadows or colors outside the source palette.",
    "",
    "SVG requirements:",
    `- Return exactly one complete <svg>...</svg> element sized ${width} by ${height}.`,
    "- Output SVG code only. No explanation, no Markdown, no surrounding text.",
    "- Do not embed base64, raster images, <image>, foreignObject, external href, CSS imports, script, animation, or HTML.",
    "- Use editable SVG elements: path, circle, rect, ellipse, polygon, polyline, line, g, defs, linearGradient, radialGradient, mask, clipPath, and simple filter when needed.",
    "- Prefer path and Bezier curves for the main contour.",
    "- Each major visual block should be grouped clearly for later editing.",
    "- Keep path count reasonable: not over-simplified, but no meaningless pixel fragments.",
    "- Use clear ids such as main-shape, highlight, shadow, detail, outline, inner-cutout, gradient-main.",
    "- Do not use strokes to fake filled shapes unless the source itself is a line icon.",
    "- If the source has a stroke, preserve stroke width, cap style, join style, and rounded corner behavior.",
    "",
    "Forbidden:",
    "- No redesign. No category changes. No direction changes. No proportion changes. No visual weight changes.",
    "- No added elements. No background. No bitmap output. No PNG/JPG/base64.",
    "- Do not turn it into a generic icon. Do not turn a simple UI icon into a complex illustration. Do not over-simplify a complex icon."
  ].join("\n");
}

function buildAssetSvgRetryPrompt(basePrompt) {
  return [
    basePrompt,
    "",
    "The previous SVG candidate failed quality validation.",
    "Regenerate it with stricter contour lock:",
    "- First create the exact outer contour, then add internal highlights, shadows, gradients, and details.",
    "- Preserve source silhouette point-by-point at the visual level: angles, corners, concave areas, convex areas, notches, tilt, and padding.",
    "- For small abstract icons, do not reinterpret the shape as a soft blob or a new symbol.",
    "- Do not redesign it into a generic simplified icon or remove small details that make the source recognizable.",
    "- Do not use raster images or embedded data.",
    "- Include a correct viewBox on the <svg> element.",
    "- Use enough clean vector layers, gradients, and opacity to preserve the source look, but merge tiny fragments into purposeful shapes.",
    "- The final SVG should look like a carefully vectorized version of the reference, not a newly generated icon."
  ].join("\n");
}

function toOpenAIImageSize(width, height) {
  const numericWidth = Number(width);
  const numericHeight = Number(height);
  if (!Number.isFinite(numericWidth) || !Number.isFinite(numericHeight)) {
    return "auto";
  }

  const ratio = numericWidth / numericHeight;
  if (ratio > 1.2) {
    return "1536x1024";
  }
  if (ratio < 0.85) {
    return "1024x1536";
  }
  return "1024x1024";
}

function toProviderImageSize(width, height, config) {
  let isOfficialOpenAI = false;
  try {
    isOfficialOpenAI = new URL(config?.baseUrl || "").hostname.toLowerCase() === "api.openai.com";
  } catch {
    isOfficialOpenAI = false;
  }
  if (!isOfficialOpenAI) {
    const targetWidth = Math.round(clampNumber(width, 256, 4096));
    const targetHeight = Math.round(clampNumber(height, 256, 4096));
    return `${targetWidth}x${targetHeight}`;
  }
  return toOpenAIImageSize(width, height);
}

function readJson(request, maxBytes = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    let rejected = false;
    request.on("data", (chunk) => {
      if (rejected) return;
      body += chunk;
      if (body.length > maxBytes) {
        rejected = true;
        body = "";
        request.pause();
        reject(badRequest("Request body is too large"));
      }
    });
    request.on("end", () => {
      if (rejected) return;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(badRequest("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function isAllowedRequestOrigin(origin) {
  if (!origin || origin === "null") return true;
  try {
    const url = new URL(origin);
    return url.hostname === "localhost"
      || url.hostname === "127.0.0.1"
      || url.hostname === "::1"
      || url.hostname === "figma.com"
      || url.hostname.endsWith(".figma.com");
  } catch {
    return false;
  }
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, JSON_HEADERS);
  if (statusCode === 204) {
    response.end();
    return;
  }
  response.end(JSON.stringify(data));
}

function assertString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw badRequest(`${name} is required`);
  }
  return value.trim();
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(max, Math.max(min, number));
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    };
    return entities[character] || character;
  });
}

function svgValidationError(message) {
  const error = new Error(message);
  error.statusCode = 422;
  error.isSvgValidationError = true;
  return error;
}
