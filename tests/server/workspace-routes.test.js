const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createWorkspaceRoutes
} = require("../../src/server/routes/workspace-routes");

function createHarness({ payload = {}, store = {} } = {}) {
  const sent = [];
  const workspaceDraftStore = {
    loadIndex: () => ({ activeDraftId: null, restorePreference: "ask", records: [] }),
    loadDraft: () => null,
    saveDraft: async () => ({ id: "draft_a" }),
    setActiveDraftId: async () => {},
    setRestorePreference: async (preference) => ["restore", "new"].includes(preference) ? preference : "ask",
    duplicateDraft: async () => null,
    updateDraftNote: async () => null,
    activateDraft: async () => null,
    deleteDraft: async () => true,
    ...store
  };
  const handle = createWorkspaceRoutes({
    workspaceDraftStore,
    readJson: async () => payload,
    sendJson: (response, status, body) => sent.push({ response, status, body })
  });
  return { handle, sent };
}

test("workspace routes ignore unrelated requests", async () => {
  const { handle, sent } = createHarness();

  assert.equal(await handle({ method: "GET", url: "/health" }, {}), false);
  assert.deepEqual(sent, []);
});

test("GET /api/workspace-draft returns active draft response shape", async () => {
  const { handle, sent } = createHarness({
    store: {
      loadIndex: () => ({
        activeDraftId: "draft_a",
        restorePreference: "restore",
        records: [{ id: "draft_a" }]
      }),
      loadDraft: () => ({ manifest: { resultImages: [{}] } })
    }
  });

  assert.equal(await handle({ method: "GET", url: "/api/workspace-draft" }, {}), true);
  assert.deepEqual(sent[0].body, {
    draft: { manifest: { resultImages: [{}] } },
    draftId: "draft_a",
    restorePreference: "restore",
    recordCount: 1
  });
});

test("GET /api/workspace-draft returns null when no draft is active", async () => {
  const { handle, sent } = createHarness({
    store: {
      loadIndex: () => ({
        activeDraftId: null,
        restorePreference: "restore",
        records: [{ id: "draft_latest" }]
      }),
      loadDraft: (id) => ({ manifest: { resultImages: [{}] }, id })
    }
  });

  assert.equal(await handle({ method: "GET", url: "/api/workspace-draft" }, {}), true);
  assert.deepEqual(sent[0].body, {
    draft: null,
    draftId: null,
    restorePreference: "restore",
    recordCount: 1
  });
});

test("GET /api/workspace-draft keeps selected active draft instead of newest record", async () => {
  const { handle, sent } = createHarness({
    store: {
      loadIndex: () => ({
        activeDraftId: "draft_old",
        restorePreference: "ask",
        records: [
          { id: "draft_old", updatedAt: 100 },
          { id: "draft_new", updatedAt: 200 }
        ]
      }),
      loadDraft: (id) => ({ manifest: { resultImages: [{}] }, id })
    }
  });

  assert.equal(await handle({ method: "GET", url: "/api/workspace-draft" }, {}), true);
  assert.equal(sent[0].body.draftId, "draft_old");
  assert.deepEqual(sent[0].body.draft, { manifest: { resultImages: [{}] }, id: "draft_old" });
});

test("GET /api/workspace-draft does not fall back when active draft has no result images", async () => {
  const { handle, sent } = createHarness({
    store: {
      loadIndex: () => ({
        activeDraftId: "draft_empty",
        restorePreference: "ask",
        records: [
          { id: "draft_empty", updatedAt: 300 },
          { id: "draft_with_image", updatedAt: 200 }
        ]
      }),
      loadDraft: (id) => id === "draft_with_image"
        ? { manifest: { resultImages: [{ id: "image-1" }] }, id }
        : { manifest: { resultImages: [] }, id }
    }
  });

  assert.equal(await handle({ method: "GET", url: "/api/workspace-draft" }, {}), true);
  assert.equal(sent[0].body.draftId, null);
  assert.equal(sent[0].body.draft, null);
});

test("POST restore preference returns normalized preference", async () => {
  const { handle, sent } = createHarness({ payload: { preference: "invalid" } });

  assert.equal(await handle({ method: "POST", url: "/api/workspace-restore-preference" }, {}), true);
  assert.deepEqual(sent[0], {
    response: {},
    status: 200,
    body: { ok: true, restorePreference: "ask" }
  });
});

test("duplicate missing draft returns 404", async () => {
  const { handle, sent } = createHarness();

  assert.equal(await handle({ method: "POST", url: "/api/workspace-drafts/missing/duplicate" }, {}), true);
  assert.equal(sent[0].status, 404);
  assert.deepEqual(sent[0].body, { error: "Workspace draft not found" });
});
