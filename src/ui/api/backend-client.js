const PROXY_BASE_URL = "http://127.0.0.1:18787";

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function createBackendClient({
  baseUrl = PROXY_BASE_URL,
  fetchImpl = fetch,
  onDisconnected = () => {}
} = {}) {
  let serviceHealthCheckPromise = null;

  async function ensureLocalServiceConnected() {
    if (!serviceHealthCheckPromise) {
      serviceHealthCheckPromise = (async () => {
        try {
          const response = await fetchWithTimeout(`${baseUrl}/health`, {}, 3000, { fetchImpl });
          if (!response.ok) throw new Error(`本地服务异常：${response.status}`);
          return true;
        } catch (error) {
          onDisconnected(error);
          throw new Error("本地服务已断开");
        } finally {
          serviceHealthCheckPromise = null;
        }
      })();
    }
    return serviceHealthCheckPromise;
  }

  async function fetchBackend(path, options = {}) {
    await ensureLocalServiceConnected();
    try {
      return await fetchImpl(`${baseUrl}${path}`, options);
    } catch (error) {
      if (error?.name === "AbortError") {
        throw error;
      }
      onDisconnected(error);
      throw new Error("本地服务已断开");
    }
  }

  return {
    ensureLocalServiceConnected,
    fetchBackend
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    PROXY_BASE_URL,
    createBackendClient,
    fetchWithTimeout
  };
}
