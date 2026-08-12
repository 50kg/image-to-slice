const { Buffer } = require("buffer");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function createWorkspaceDraftStore({ historyDir, createThumbnail = async () => "", now = () => Date.now() }) {
  const indexFile = path.join(historyDir, "index.json");
  let indexCache = null;
  let mutationQueue = Promise.resolve();

  function defaultIndex() {
    return { version: 1, activeDraftId: null, restorePreference: "ask", records: [] };
  }

  function loadIndex() {
    if (indexCache) return indexCache;
    if (!fs.existsSync(indexFile)) {
      indexCache = defaultIndex();
      return indexCache;
    }
    try {
      const value = JSON.parse(fs.readFileSync(indexFile, "utf8"));
      indexCache = {
        version: 1,
        activeDraftId: typeof value.activeDraftId === "string" ? value.activeDraftId : null,
        restorePreference: ["restore", "new"].includes(value.restorePreference) ? value.restorePreference : "ask",
        records: Array.isArray(value.records) ? value.records : []
      };
      return indexCache;
    } catch (error) {
      console.warn("Failed to load workspace index:", error.message || String(error));
      indexCache = defaultIndex();
      return indexCache;
    }
  }

  function ensureHistoryDir() {
    fs.mkdirSync(historyDir, { recursive: true, mode: 0o700 });
  }

  function getDraftPath(id) {
    return path.join(historyDir, `${id}.json.gz`);
  }

  function loadDraft(id) {
    const draftPath = getDraftPath(id);
    if (!fs.existsSync(draftPath)) return null;
    return JSON.parse(zlib.gunzipSync(fs.readFileSync(draftPath)).toString("utf8"));
  }

  function saveIndex(index) {
    ensureHistoryDir();
    indexCache = index;
    const temporaryFile = `${indexFile}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(index), { mode: 0o600 });
    fs.renameSync(temporaryFile, indexFile);
  }

  function enqueueMutation(mutation) {
    const result = mutationQueue.then(mutation);
    mutationQueue = result.catch(() => {});
    return result;
  }

  function copyIndex() {
    const index = loadIndex();
    return {
      ...index,
      records: index.records.map((record) => ({ ...record }))
    };
  }

  function createUniqueDraftId(timestamp, index) {
    const baseId = `draft_${timestamp.toString(36)}`;
    let id = baseId;
    let suffix = 2;
    while (index.records.some((record) => record.id === id) || fs.existsSync(getDraftPath(id))) {
      id = `${baseId}_${suffix}`;
      suffix += 1;
    }
    return id;
  }

  async function saveDraft(draft, draftId) {
    if (!draft || typeof draft !== "object") throw badRequest("Invalid workspace draft");
    return enqueueMutation(async () => {
      const index = copyIndex();
      let item = draftId ? index.records.find((candidate) => candidate.id === draftId) : null;
      if (item) {
        item.updatedAt = now();
        item.title = getWorkspaceDraftTitle(draft);
        item.sliceCount = getWorkspaceDraftSliceCount(draft);
      } else {
        const timestamp = now();
        item = createWorkspaceDraftItem(draft, () => timestamp);
        item.id = createUniqueDraftId(timestamp, index);
        index.records.unshift(item);
      }
      if (!item.thumbnail) item.thumbnail = await createThumbnail(draft);
      ensureHistoryDir();
      const draftPath = getDraftPath(item.id);
      const temporaryPath = `${draftPath}.tmp`;
      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(draft)), { level: 1 });
      fs.writeFileSync(temporaryPath, compressed, { mode: 0o600 });
      fs.renameSync(temporaryPath, draftPath);
      index.activeDraftId = item.id;
      saveIndex(index);
      return item;
    });
  }

  function duplicateDraft(id) {
    return enqueueMutation(() => {
      const index = copyIndex();
      const source = index.records.find((record) => record.id === id);
      if (!source) return null;
      const timestamp = now();
      const copy = {
        ...source,
        id: createUniqueDraftId(timestamp, index),
        title: `${source.title} 副本`,
        note: `${source.note || source.title || "未命名记录"} 副本`.slice(0, 80),
        createdAt: timestamp,
        updatedAt: timestamp
      };
      ensureHistoryDir();
      fs.copyFileSync(getDraftPath(source.id), getDraftPath(copy.id));
      index.records.unshift(copy);
      index.activeDraftId = copy.id;
      saveIndex(index);
      return copy;
    });
  }

  function updateDraftNote(id, note) {
    return enqueueMutation(() => {
      const index = copyIndex();
      const item = index.records.find((record) => record.id === id);
      if (!item) return null;
      item.note = typeof note === "string" ? note.trim().slice(0, 80) : "";
      item.updatedAt = now();
      saveIndex(index);
      return item;
    });
  }

  function activateDraft(id) {
    return enqueueMutation(() => {
      const index = copyIndex();
      const item = index.records.find((record) => record.id === id);
      if (!item) return null;
      index.activeDraftId = item.id;
      saveIndex(index);
      return item;
    });
  }

  function deleteDraft(id) {
    return enqueueMutation(() => {
      const index = copyIndex();
      const beforeCount = index.records.length;
      index.records = index.records.filter((item) => item.id !== id);
      if (index.activeDraftId === id) index.activeDraftId = null;
      const draftPath = getDraftPath(id);
      if (fs.existsSync(draftPath)) fs.unlinkSync(draftPath);
      saveIndex(index);
      return index.records.length !== beforeCount;
    });
  }

  function setActiveDraftId(id) {
    return enqueueMutation(() => {
      const index = copyIndex();
      index.activeDraftId = typeof id === "string" ? id : null;
      saveIndex(index);
      return index;
    });
  }

  function setRestorePreference(preference) {
    return enqueueMutation(() => {
      const index = copyIndex();
      index.restorePreference = ["restore", "new"].includes(preference) ? preference : "ask";
      saveIndex(index);
      return index.restorePreference;
    });
  }

  return {
    loadIndex,
    saveIndex,
    setActiveDraftId,
    setRestorePreference,
    getDraftPath,
    loadDraft,
    saveDraft,
    duplicateDraft,
    updateDraftNote,
    activateDraft,
    deleteDraft
  };
}

function createWorkspaceDraftItem(draft, now = () => Date.now()) {
  const timestamp = now();
  return {
    id: `draft_${timestamp.toString(36)}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    title: getWorkspaceDraftTitle(draft),
    sliceCount: getWorkspaceDraftSliceCount(draft),
    thumbnail: ""
  };
}

function getWorkspaceDraftTitle(draft) {
  return draft?.manifest?.resultImages?.[0]?.name
    || draft?.manifest?.sourcePrompt?.trim().slice(0, 30)
    || "本地图片";
}

function getWorkspaceDraftSliceCount(draft) {
  return draft?.manifest?.resultImages?.reduce(
    (total, image) => total + (image.sliceManifest?.assets?.length || 0),
    0
  ) || 0;
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

module.exports = {
  createWorkspaceDraftStore,
  createWorkspaceDraftItem,
  getWorkspaceDraftTitle,
  getWorkspaceDraftSliceCount
};
