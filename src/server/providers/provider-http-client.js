function createProviderHttpClient({
  fetchImpl = fetch,
  createAbortError,
  getRequestSignal,
  getConfig,
  config
}) {
  async function requestProvider(path, body, { providerName, headers, parseResponse }) {
    const requestConfig = config || getConfig?.();
    if (!requestConfig) {
      throw new Error("Provider request config is required");
    }
    const { baseUrl, apiKey, timeoutMs } = requestConfig;
    const controller = new AbortController();
    const requestSignal = getRequestSignal?.();
    const cancelRequest = () => controller.abort();
    if (requestSignal?.aborted) cancelRequest();
    else requestSignal?.addEventListener("abort", cancelRequest, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(joinProviderRequestUrl(baseUrl, path), {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          ...headers
        },
        body,
        signal: controller.signal
      });
      return await parseResponse(response);
    } catch (error) {
      if (error.name === "AbortError") {
        if (requestSignal?.aborted) throw createAbortError("AI request cancelled");
        const timeoutError = new Error(`${providerName} request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
        timeoutError.statusCode = 504;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      requestSignal?.removeEventListener("abort", cancelRequest);
    }
  }

  function callOpenAIJson(path, body) {
    return requestProvider(path, JSON.stringify(body), {
      providerName: "OpenAI",
      headers: {
        "content-type": "application/json"
      },
      parseResponse: parseOpenAIResponse
    });
  }

  function callOpenAIForm(path, form) {
    return requestProvider(path, form, {
      providerName: "OpenAI",
      headers: {},
      parseResponse: parseOpenAIResponse
    });
  }

  function callOpenAIStream(path, body) {
    return requestProvider(path, JSON.stringify(body), {
      providerName: "OpenAI",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream"
      },
      parseResponse: parseOpenAIStreamResponse
    });
  }

  return {
    callOpenAIJson,
    callOpenAIStream,
    callOpenAIForm
  };
}

function joinProviderRequestUrl(baseUrl, requestPath) {
  const normalizedBaseUrl = String(baseUrl || "").replace(/\/+$/, "");
  const normalizedPath = String(requestPath || "").startsWith("/")
    ? String(requestPath)
    : `/${requestPath}`;
  if (/\/v1$/i.test(normalizedBaseUrl) && /^\/v1(?:\/|$)/i.test(normalizedPath)) {
    return `${normalizedBaseUrl}${normalizedPath.slice(3)}`;
  }
  return `${normalizedBaseUrl}${normalizedPath}`;
}

async function listProviderModels({ baseUrl, apiKey, signal, fetchImpl = fetch }) {
  if (!apiKey) {
    const error = new Error("请先填写并保存 Api Key 后再下载模型列表");
    error.statusCode = 400;
    throw error;
  }
  const modelsUrl = buildProviderModelsUrl(baseUrl);
  const response = await fetchImpl(modelsUrl, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal
  });
  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`模型列表请求失败（${response.status}）：${body.slice(0, 300)}`);
    error.statusCode = 502;
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  const models = [...new Set((Array.isArray(payload.data) ? payload.data : [])
    .map((item) => item?.id)
    .filter(Boolean)
    .map(String))]
    .sort((a, b) => a.localeCompare(b));
  return {
    ok: true,
    baseUrl,
    models,
    modelCount: models.length
  };
}

function buildProviderModelsUrl(baseUrl) {
  const normalized = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(normalized)) throw badRequest("Base URL 必须以 http:// 或 https:// 开头");
  return `${normalized}${/\/v1$/i.test(normalized) ? "" : "/v1"}/models`;
}

async function parseOpenAIResponse(response) {
  const text = await response.text();
  return parseOpenAIResponseText(response, text);
}

async function parseOpenAIStreamResponse(response) {
  const text = await response.text();
  if (!response.ok || !/^\s*data:/m.test(text)) {
    return parseOpenAIResponseText(response, text);
  }

  let content = "";
  let finalContent = "";
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*data:\s*(.*)$/);
    if (!match || match[1] === "[DONE]") continue;
    let event;
    try {
      event = JSON.parse(match[1]);
    } catch {
      throw Object.assign(new Error("AI 流式响应包含无效 JSON"), { statusCode: 502 });
    }
    if (event?.error) {
      throw Object.assign(
        new Error(event.error.message || "AI 流式请求失败"),
        { statusCode: Number(event.error.status || event.error.code) || 502 }
      );
    }
    const choice = Array.isArray(event?.choices) ? event.choices[0] : null;
    content += readCompletionContent(choice?.delta?.content);
    const messageContent = readCompletionContent(choice?.message?.content);
    if (messageContent) finalContent = messageContent;
  }

  return {
    choices: [{
      message: {
        content: content || finalContent
      }
    }]
  };
}

function parseOpenAIResponseText(response, text) {
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data.error && data.error.message ? data.error.message : `OpenAI request failed: ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

function readCompletionContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((item) => {
    if (typeof item === "string") return item;
    return item?.text || item?.content || "";
  }).join("");
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

module.exports = {
  createProviderHttpClient,
  buildProviderModelsUrl,
  listProviderModels,
  parseOpenAIResponse,
  parseOpenAIStreamResponse
};
