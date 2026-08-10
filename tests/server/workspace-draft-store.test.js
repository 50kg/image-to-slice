const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const {
  createWorkspaceDraftStore,
  getWorkspaceDraftSliceCount,
  getWorkspaceDraftTitle
} = require("../../src/server/storage/workspace-draft-store");

function tempHistoryDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "figma-design-history-test-"));
}

function createDraft(name = "Screen A", sliceCount = 2) {
  return {
    manifest: {
      sourcePrompt: "Prompt title",
      resultImages: [
        {
          name,
          dataUrl: "data:image/png;base64,abc",
          sliceManifest: {
            assets: Array.from({ length: sliceCount }, (_, index) => ({ id: `asset_${index}` }))
          }
        }
      ]
    }
  };
}

test("loadIndex returns default index when index file is missing", () => {
  const store = createWorkspaceDraftStore({ historyDir: tempHistoryDir() });

  assert.deepEqual(store.loadIndex(), {
    version: 1,
    activeDraftId: null,
    restorePreference: "ask",
    records: []
  });
});

test("loadIndex returns default index and warns for invalid JSON", () => {
  const historyDir = tempHistoryDir();
  fs.writeFileSync(path.join(historyDir, "index.json"), "{bad json");
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...parts) => warnings.push(parts.join(" "));
  try {
    const store = createWorkspaceDraftStore({ historyDir });
    assert.deepEqual(store.loadIndex(), {
      version: 1,
      activeDraftId: null,
      restorePreference: "ask",
      records: []
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Failed to load workspace index:/);
});

test("saveIndex writes index and updates cache", () => {
  const historyDir = tempHistoryDir();
  const store = createWorkspaceDraftStore({ historyDir });
  const index = { version: 1, activeDraftId: "draft_a", restorePreference: "restore", records: [] };

  store.saveIndex(index);

  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(historyDir, "index.json"), "utf8")), index);
  assert.strictEqual(store.loadIndex(), index);
});

test("saveDraft creates gzipped draft, active id, metadata, and thumbnail", async () => {
  const historyDir = tempHistoryDir();
  const store = createWorkspaceDraftStore({
    historyDir,
    createThumbnail: async () => "thumb",
    now: () => 123456789
  });
  const draft = createDraft("Screen A", 3);

  const item = await store.saveDraft(draft);

  assert.equal(item.id, "draft_21i3v9");
  assert.equal(item.title, "Screen A");
  assert.equal(item.sliceCount, 3);
  assert.equal(item.thumbnail, "thumb");
  assert.equal(store.loadIndex().activeDraftId, item.id);
  assert.deepEqual(store.loadDraft(item.id), draft);
});

test("saveDraft updates existing draft metadata without creating another record", async () => {
  const historyDir = tempHistoryDir();
  let tick = 1000;
  const store = createWorkspaceDraftStore({
    historyDir,
    createThumbnail: async () => "thumb",
    now: () => tick
  });
  const first = await store.saveDraft(createDraft("First", 1));
  tick = 2000;

  const updated = await store.saveDraft(createDraft("Second", 4), first.id);

  assert.equal(updated.id, first.id);
  assert.equal(updated.createdAt, 1000);
  assert.equal(updated.updatedAt, 2000);
  assert.equal(updated.title, "Second");
  assert.equal(updated.sliceCount, 4);
  assert.equal(store.loadIndex().records.length, 1);
});

test("duplicateDraft copies draft file and activates copy", async () => {
  const historyDir = tempHistoryDir();
  let tick = 1000;
  const store = createWorkspaceDraftStore({
    historyDir,
    createThumbnail: async () => "thumb",
    now: () => tick
  });
  const source = await store.saveDraft(createDraft("Screen", 1));
  tick = 2000;

  const copy = store.duplicateDraft(source.id);

  assert.equal(copy.id, "draft_1jk");
  assert.equal(copy.title, "Screen 副本");
  assert.equal(copy.note, "Screen 副本");
  assert.equal(store.loadIndex().activeDraftId, copy.id);
  assert.deepEqual(store.loadDraft(copy.id), store.loadDraft(source.id));
});

test("deleteDraft removes record, clears active id, and deletes draft file", async () => {
  const historyDir = tempHistoryDir();
  const store = createWorkspaceDraftStore({
    historyDir,
    createThumbnail: async () => "",
    now: () => 1000
  });
  const item = await store.saveDraft(createDraft());
  const draftPath = store.getDraftPath(item.id);

  assert.equal(fs.existsSync(draftPath), true);
  assert.equal(store.deleteDraft(item.id), true);
  assert.equal(fs.existsSync(draftPath), false);
  assert.equal(store.loadIndex().activeDraftId, null);
  assert.equal(store.loadIndex().records.length, 0);
});

test("updateDraftNote trims note, limits length, and updates timestamp", async () => {
  const historyDir = tempHistoryDir();
  let tick = 1000;
  const store = createWorkspaceDraftStore({
    historyDir,
    createThumbnail: async () => "",
    now: () => tick
  });
  const item = await store.saveDraft(createDraft());
  tick = 2000;

  const updated = store.updateDraftNote(item.id, `  ${"a".repeat(90)}  `);

  assert.equal(updated.note, "a".repeat(80));
  assert.equal(updated.updatedAt, 2000);
  assert.equal(store.updateDraftNote("missing", "note"), null);
});

test("activateDraft sets active draft and returns item", async () => {
  const historyDir = tempHistoryDir();
  const store = createWorkspaceDraftStore({
    historyDir,
    createThumbnail: async () => "",
    now: () => 1000
  });
  const item = await store.saveDraft(createDraft());
  store.setActiveDraftId(null);

  const activated = store.activateDraft(item.id);

  assert.equal(activated.id, item.id);
  assert.equal(store.loadIndex().activeDraftId, item.id);
  assert.equal(store.activateDraft("missing"), null);
});

test("setRestorePreference accepts restore/new and falls back to ask", () => {
  const store = createWorkspaceDraftStore({ historyDir: tempHistoryDir() });

  assert.equal(store.setRestorePreference("restore"), "restore");
  assert.equal(store.setRestorePreference("new"), "new");
  assert.equal(store.setRestorePreference("invalid"), "ask");
  assert.equal(store.loadIndex().restorePreference, "ask");
});

test("title and slice count match legacy rules", () => {
  assert.equal(getWorkspaceDraftTitle(createDraft("Named", 2)), "Named");
  assert.equal(getWorkspaceDraftTitle({ manifest: { sourcePrompt: "123456789012345678901234567890999" } }), "123456789012345678901234567890");
  assert.equal(getWorkspaceDraftTitle({}), "本地图片");
  assert.equal(getWorkspaceDraftSliceCount(createDraft("Named", 2)), 2);
});
