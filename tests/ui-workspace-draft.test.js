const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildWorkspaceDraftSnapshot,
  deleteWorkspaceDraftById,
  deleteWorkspaceDraft,
  duplicateWorkspaceDraft,
  formatWorkspaceDraftTime,
  loadWorkspaceDraftItem,
  normalizeWorkspaceDraftListPayload,
  readWorkspaceDraft,
  requireSuccessfulWorkspaceDraftSave,
  resolveWorkspaceRestoreAction,
  renderWorkspaceDraftListErrorHtml,
  renderWorkspaceDraftListHtml,
  saveWorkspaceRestorePreference,
  shouldFlushWorkspaceDraftOnVisibilityChange,
  updateWorkspaceDraftNote,
  writeWorkspaceDraft
} = require("../src/ui/api/workspace-draft");

test("buildWorkspaceDraftSnapshot strips in-flight AI state from slice assets", () => {
  const manifest = {
    sourcePrompt: "old",
    resultImages: [
      {
        sliceManifest: {
          assets: [
            {
              id: "a",
              aiProcessing: true,
              aiProcessingLabel: "running",
              aiProgressLogs: ["step"]
            }
          ]
        }
      }
    ]
  };

  const snapshot = buildWorkspaceDraftSnapshot({
    manifest,
    activeResultIndex: 2,
    activeSliceId: "a",
    currentMode: "image-to-image",
    currentRatio: "custom",
    currentStyle: "clean",
    width: "750",
    height: "1334",
    prompt: "prompt",
    referenceImages: [{ id: "ref" }],
    htmlPreview: {
      schemaVersion: 2,
      mode: "h5-fast-direct",
      canonicalHtml: "<main>preview</main>",
      contextSignature: "signature-a",
      metadata: {}
    },
    now: () => 12345
  });

  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.savedAt, 12345);
  assert.equal(snapshot.width, 750);
  assert.equal(snapshot.height, 1334);
  assert.deepEqual(snapshot.manifest.resultImages[0].sliceManifest.assets[0], {
    id: "a",
    aiProcessing: false,
    aiProcessingLabel: "",
    aiProgressLogs: []
  });
  assert.notEqual(snapshot.manifest, manifest);
  assert.notEqual(snapshot.referenceImages[0], snapshot.referenceImages);
  assert.equal(snapshot.htmlPreviewSchemaVersion, 2);
  assert.equal(snapshot.htmlPreview.canonicalHtml, "<main>preview</main>");
});

test("buildWorkspaceDraftSnapshot handles missing nested asset lists", () => {
  const snapshot = buildWorkspaceDraftSnapshot({
    manifest: { resultImages: [{}, { sliceManifest: {} }] },
    width: 390,
    height: 844
  });

  assert.deepEqual(snapshot.manifest.resultImages, [{}, { sliceManifest: {} }]);
  assert.equal(snapshot.prompt, "");
  assert.deepEqual(snapshot.referenceImages, []);
  assert.equal(snapshot.htmlPreview, null);
});

test("buildWorkspaceDraftSnapshot preserves per-image background decomposition caches", () => {
  const cache = {
    schemaVersion: 1,
    sourceImageId: "image-1",
    sourceWidth: 750,
    sourceHeight: 1334,
    review: {
      imageId: "image-1",
      screen: { width: 750, height: 1334 },
      activeBackgroundId: "hero",
      backgrounds: []
    }
  };

  const snapshot = buildWorkspaceDraftSnapshot({
    manifest: {
      resultImages: [{
        id: "image-1",
        backgroundDecompositionCache: cache
      }]
    }
  });

  assert.deepEqual(
    snapshot.manifest.resultImages[0].backgroundDecompositionCache,
    cache
  );
  assert.notEqual(
    snapshot.manifest.resultImages[0].backgroundDecompositionCache,
    cache
  );
});

test("buildWorkspaceDraftSnapshot discards former HTML preview caches", () => {
  const snapshot = buildWorkspaceDraftSnapshot({
    manifest: { resultImages: [] },
    htmlPreviews: {
      legacy: { html: "<main>ordinary</main>" },
      local: { strategy: "local", html: "<main>fast</main>" }
    }
  });

  assert.equal(snapshot.htmlPreview, null);
  assert.equal("htmlPreviews" in snapshot, false);
});

test("formatWorkspaceDraftTime formats timestamps with padded time", () => {
  const timestamp = new Date(2026, 0, 2, 3, 4).getTime();

  assert.equal(formatWorkspaceDraftTime(timestamp), "1/2 03:04");
});

test("readWorkspaceDraft returns normalized draft metadata", async () => {
  let observedTimeoutMs = 0;
  const result = await readWorkspaceDraft({
    fetchWithTimeout: async (url, options, timeoutMs) => {
      observedTimeoutMs = timeoutMs;
      return {
        ok: true,
        json: async () => ({
          draftId: "draft-1",
          restorePreference: "restore",
          recordCount: 2,
          draft: { manifest: {} },
          url
        })
      };
    }
  });

  assert.equal(observedTimeoutMs, 30000);
  assert.deepEqual(result, {
    draftId: "draft-1",
    restorePreference: "restore",
    hasDraftRecords: true,
    draft: { manifest: {} }
  });
});

test("resolveWorkspaceRestoreAction preserves the three startup choices", () => {
  assert.equal(resolveWorkspaceRestoreAction("ask"), "prompt");
  assert.equal(resolveWorkspaceRestoreAction("restore"), "restore");
  assert.equal(resolveWorkspaceRestoreAction("new"), "new");
  assert.equal(resolveWorkspaceRestoreAction("unexpected"), "prompt");
});

test("requireSuccessfulWorkspaceDraftSave blocks navigation after a failed save", () => {
  const failure = new Error("disk full");

  assert.equal(requireSuccessfulWorkspaceDraftSave(true), true);
  assert.throws(
    () => requireSuccessfulWorkspaceDraftSave(failure),
    (error) => error === failure
  );
  assert.throws(
    () => requireSuccessfulWorkspaceDraftSave(false),
    /切图记录保存失败/
  );
});

test("workspace visibility only triggers an immediate save when the page becomes hidden", () => {
  assert.equal(shouldFlushWorkspaceDraftOnVisibilityChange("hidden"), true);
  assert.equal(shouldFlushWorkspaceDraftOnVisibilityChange("visible"), false);
  assert.equal(shouldFlushWorkspaceDraftOnVisibilityChange("prerender"), false);
});

test("writeWorkspaceDraft posts draft with current draft id and returns next id", async () => {
  const requests = [];
  const result = await writeWorkspaceDraft({ draft: { version: 1 }, draftId: "draft-1" }, {
    fetchBackend: async (path, options) => {
      assert.equal(typeof options.body, "string");
      assert.deepEqual(options.headers, { "content-type": "application/json" });
      requests.push([path, JSON.parse(options.body)]);
      return {
        ok: true,
        json: async () => ({ draftId: "draft-2" })
      };
    }
  });

  assert.equal(result.draftId, "draft-2");
  assert.deepEqual(requests, [["/api/workspace-draft", { draft: { version: 1 }, draftId: "draft-1" }]]);
});

test("deleteWorkspaceDraft sends a delete request and rejects failed responses", async () => {
  await deleteWorkspaceDraft({
    fetchBackend: async (path, options) => {
      assert.equal(path, "/api/workspace-draft");
      assert.equal(options.method, "DELETE");
      return { ok: true };
    }
  });

  await assert.rejects(() => deleteWorkspaceDraft({
    fetchBackend: async () => ({ ok: false, status: 500 })
  }), /HTTP 500/);
});

test("saveWorkspaceRestorePreference posts restore preference", async () => {
  let postedBody = null;
  const saved = await saveWorkspaceRestorePreference("new", {
    fetchBackend: async (path, options) => {
      assert.equal(path, "/api/workspace-restore-preference");
      postedBody = JSON.parse(options.body);
      return { ok: true };
    }
  });

  assert.equal(saved, true);
  assert.deepEqual(postedBody, { preference: "new" });
});

test("renderWorkspaceDraftListHtml renders an empty state", () => {
  assert.equal(renderWorkspaceDraftListHtml([], null), '<div class="drafts-empty">还没有切图记录</div>');
});

test("renderWorkspaceDraftListHtml escapes draft fields and marks the active draft", () => {
  const html = renderWorkspaceDraftListHtml([
    {
      id: "draft-<1>",
      note: "A&B",
      title: "Fallback",
      thumbnail: `data:image/svg+xml,<svg></svg>`,
      sliceCount: 3,
      updatedAt: new Date(2026, 0, 2, 3, 4).getTime()
    }
  ], "draft-<1>");

  assert.equal(html.includes("draft-item active"), true);
  assert.equal(html.includes("draft-&lt;1&gt;"), true);
  assert.equal(html.includes("A&amp;B"), true);
  assert.equal(html.includes("3 个切图 · 1/2 03:04"), true);
  assert.equal(html.includes("<svg></svg>"), false);
});

test("renderWorkspaceDraftListErrorHtml escapes error messages", () => {
  assert.equal(
    renderWorkspaceDraftListErrorHtml(new Error("<failed>")),
    '<div class="drafts-empty">读取失败：&lt;failed&gt;</div>'
  );
});

test("normalizeWorkspaceDraftListPayload keeps the persisted active record", () => {
  assert.deepEqual(normalizeWorkspaceDraftListPayload({
    drafts: [{ id: "draft-new" }, { id: "draft-selected" }],
    activeDraftId: "draft-selected"
  }), {
    drafts: [{ id: "draft-new" }, { id: "draft-selected" }],
    activeDraftId: "draft-selected"
  });
  assert.deepEqual(normalizeWorkspaceDraftListPayload({ drafts: null, activeDraftId: 123 }), {
    drafts: [],
    activeDraftId: null
  });
});

test("deleteWorkspaceDraftById deletes an encoded draft id", async () => {
  let requestPath = "";
  const deleted = await deleteWorkspaceDraftById("draft/1", {
    fetchBackend: async (path, options) => {
      requestPath = path;
      assert.equal(options.method, "DELETE");
      return { ok: true };
    }
  });

  assert.equal(deleted, true);
  assert.equal(requestPath, "/api/workspace-drafts/draft%2F1");
});

test("updateWorkspaceDraftNote posts note content and returns payload", async () => {
  const payload = await updateWorkspaceDraftNote("draft 1", "hello", {
    fetchBackend: async (path, options) => {
      assert.equal(path, "/api/workspace-drafts/draft%201/note");
      assert.deepEqual(JSON.parse(options.body), { note: "hello" });
      return {
        ok: true,
        json: async () => ({ ok: true })
      };
    }
  });

  assert.deepEqual(payload, { ok: true });
});

test("loadWorkspaceDraftItem returns item payload and rejects missing drafts", async () => {
  const item = { id: "draft-1", draft: { manifest: {} } };
  assert.deepEqual(await loadWorkspaceDraftItem("draft-1", {
    fetchBackend: async () => ({
      ok: true,
      json: async () => ({ item })
    })
  }), item);

  await assert.rejects(() => loadWorkspaceDraftItem("missing", {
    fetchBackend: async () => ({
      ok: false,
      json: async () => ({ error: "nope" })
    })
  }), /nope/);
});

test("duplicateWorkspaceDraft returns duplicated item payload", async () => {
  const item = { id: "copy", draft: { manifest: {} } };
  assert.deepEqual(await duplicateWorkspaceDraft("source", {
    fetchBackend: async (path, options) => {
      assert.equal(path, "/api/workspace-drafts/source/duplicate");
      assert.equal(options.method, "POST");
      return {
        ok: true,
        json: async () => ({ item })
      };
    }
  }), item);
});
