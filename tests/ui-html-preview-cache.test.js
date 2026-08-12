const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createHtmlPreviewCacheEntry,
  createEmptyHtmlPreviewCache,
  getCachedHtmlPreview,
  getHtmlPreviewCacheOpenRecovery,
  getHtmlPreviewCacheReuseState,
  isActiveHtmlPreviewRequest,
  normalizeHtmlPreviewCache
} = require("../src/ui/state/html-preview-cache");

test("HTML preview responses are accepted only from the current non-aborted request", () => {
  assert.equal(isActiveHtmlPreviewRequest(2, {
    activeRequestId: 2,
    aborted: false
  }), true);
  assert.equal(isActiveHtmlPreviewRequest(1, {
    activeRequestId: 2,
    aborted: false
  }), false);
  assert.equal(isActiveHtmlPreviewRequest(2, {
    activeRequestId: 2,
    aborted: true
  }), false);
});

test("HTML preview cache stores canonical schema v2 without asset bytes", () => {
  let cache = createEmptyHtmlPreviewCache();
  assert.equal(cache, null);

  cache = createHtmlPreviewCacheEntry({
    mode: "h5-fast-direct",
    html: '<img src="asset:logo">',
    referenceAssets: [{ dataUrl: "data:image/png;base64,ASSET" }]
  }, "signature-a");
  assert.deepEqual(cache, {
    schemaVersion: 2,
    mode: "h5-fast-direct",
    canonicalHtml: '<img src="asset:logo">',
    contextSignature: "signature-a",
    metadata: {}
  });
  assert.equal(getCachedHtmlPreview(cache).canonicalHtml, '<img src="asset:logo">');
  assert.equal(JSON.stringify(cache).includes("base64"), false);
});

test("HTML preview cache accepts only the current schema and mode", () => {
  assert.equal(normalizeHtmlPreviewCache({
    htmlPreviews: {
      legacy: { html: "<main>ordinary</main>" },
      local: { strategy: "local", html: "<main>fast</main>" }
    }
  }), null);
  assert.equal(normalizeHtmlPreviewCache({
    htmlPreviews: {
      legacy: { html: "<main>ordinary</main>" },
      local: null
    }
  }), null);
  assert.equal(normalizeHtmlPreviewCache({
    htmlPreviewSchemaVersion: 1,
    htmlPreview: { mode: "h5-fast-direct", html: "<main>old</main>" }
  }), null);
  assert.equal(normalizeHtmlPreviewCache({
    htmlPreviewSchemaVersion: 2,
    htmlPreview: {
      schemaVersion: 2,
      mode: "h5-fast-direct",
      canonicalHtml: "<main>current</main>",
      contextSignature: "signature-a",
      metadata: {}
    }
  }).canonicalHtml, "<main>current</main>");
  assert.equal(normalizeHtmlPreviewCache({
    htmlPreviewSchemaVersion: 1,
    htmlPreview: { mode: "h5-direct", html: "<main>old-ordinary-saved-as-current</main>" }
  }), null);
  assert.equal(normalizeHtmlPreviewCache({
    htmlPreview: { html: "<main>old-ordinary</main>" }
  }), null);
  assert.equal(normalizeHtmlPreviewCache({
    htmlPreview: { strategy: "local", html: "<main>old-fast</main>" }
  }), null);
  assert.equal(normalizeHtmlPreviewCache({
    htmlPreview: { mode: "h5-fast-direct", html: "<main>missing-schema</main>" }
  }), null);
});

test("HTML preview cache rejects responses from the removed ordinary pipeline", () => {
  assert.equal(createHtmlPreviewCacheEntry({
    mode: "h5-direct",
    html: "<main>ordinary</main>"
  }, "signature-a"), null);
  assert.equal(createHtmlPreviewCacheEntry({
    mode: "h5-fast-direct",
    html: "<main>fast</main>"
  }, "signature-a").canonicalHtml, "<main>fast</main>");
});

test("HTML preview cache reuses stale entries until recognition is explicitly forced", () => {
  const cache = createHtmlPreviewCacheEntry({
    mode: "h5-fast-direct",
    html: "<main>cached</main>"
  }, "signature-a");

  assert.deepEqual(getHtmlPreviewCacheReuseState(null, "signature-a"), {
    entry: null,
    shouldReuse: false,
    stale: false,
    warning: ""
  });
  assert.deepEqual(getHtmlPreviewCacheReuseState(cache, "signature-a"), {
    entry: cache,
    shouldReuse: true,
    stale: false,
    warning: ""
  });
  assert.deepEqual(getHtmlPreviewCacheReuseState(cache, "signature-b"), {
    entry: cache,
    shouldReuse: true,
    stale: true,
    warning: "切图资产已发生变化，请点击“重新 AI 识别”更新预览。"
  });
  assert.deepEqual(getHtmlPreviewCacheReuseState(cache, "signature-b", true), {
    entry: cache,
    shouldReuse: false,
    stale: true,
    warning: ""
  });
});

test("missing cached assets trigger recognition while other cache errors stay visible", () => {
  const missingAssetError = new Error("无法读取切图资产：deleted-asset");
  missingAssetError.name = "EditableAssetHydrationError";

  assert.deepEqual(getHtmlPreviewCacheOpenRecovery(missingAssetError), {
    regenerate: true,
    message: "缓存引用的切图已不存在，正在重新 AI 识别。"
  });
  assert.deepEqual(getHtmlPreviewCacheOpenRecovery(new Error("预览文档解析失败")), {
    regenerate: false,
    message: "预览文档解析失败"
  });
});
