function createEmptyHtmlPreviewCache() {
  return null;
}

function isSupportedHtmlPreviewResult(result) {
  if (!result?.html && !result?.canonicalHtml) return false;
  return result.mode === "h5-fast-direct"
    || result.mode === "h5-template";
}

function normalizeHtmlPreviewCache(source = {}) {
  const entry = source?.htmlPreviewSchemaVersion === 2
    ? source.htmlPreview
    : source;
  if (
    entry?.schemaVersion !== 2
    || !isSupportedHtmlPreviewResult(entry)
    || !String(entry.contextSignature || "")
  ) {
    return null;
  }
  return {
    schemaVersion: 2,
    mode: entry.mode,
    canonicalHtml: String(entry.canonicalHtml),
    contextSignature: String(entry.contextSignature),
    metadata: entry.metadata && typeof entry.metadata === "object"
      ? { ...entry.metadata }
      : {}
  };
}

function getCachedHtmlPreview(cache) {
  return normalizeHtmlPreviewCache(cache);
}

function createHtmlPreviewCacheEntry(result, contextSignature) {
  if (!isSupportedHtmlPreviewResult(result) || !String(contextSignature || "")) {
    return null;
  }
  return {
    schemaVersion: 2,
    mode: result.mode,
    canonicalHtml: String(result.canonicalHtml || result.html),
    contextSignature: String(contextSignature),
    metadata: result.metadata && typeof result.metadata === "object"
      ? { ...result.metadata }
      : {}
  };
}

function getHtmlPreviewCacheReuseState(cache, contextSignature, forceRecognition = false) {
  const entry = normalizeHtmlPreviewCache(cache);
  if (!entry) {
    return {
      entry: null,
      shouldReuse: false,
      stale: false,
      warning: ""
    };
  }
  const stale = entry.contextSignature !== String(contextSignature || "");
  return {
    entry,
    shouldReuse: !forceRecognition,
    stale,
    warning: stale && !forceRecognition
      ? "切图资产已发生变化，请点击“重新 AI 识别”更新预览。"
      : ""
  };
}

function getHtmlPreviewCacheOpenRecovery(error) {
  if (error?.name === "EditableAssetHydrationError") {
    return {
      regenerate: true,
      message: "缓存引用的切图已不存在，正在重新 AI 识别。"
    };
  }
  return {
    regenerate: false,
    message: error?.message || String(error || "AI图层导入缓存无法打开")
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    createHtmlPreviewCacheEntry,
    createEmptyHtmlPreviewCache,
    getCachedHtmlPreview,
    getHtmlPreviewCacheOpenRecovery,
    getHtmlPreviewCacheReuseState,
    isSupportedHtmlPreviewResult,
    normalizeHtmlPreviewCache
  };
}
