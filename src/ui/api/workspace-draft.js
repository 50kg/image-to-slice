function cloneDraftValue(value) {
  return structuredClone(value);
}

const workspaceProxyBaseUrl = typeof require === "function" ? require("./backend-client").PROXY_BASE_URL : PROXY_BASE_URL;
const workspaceEscapeHtml = typeof require === "function" ? require("../services/app-utils").escapeHtml : escapeHtml;
const workspaceNormalizeHtmlPreviewCache = typeof require === "function"
  ? require("../state/html-preview-cache").normalizeHtmlPreviewCache
  : normalizeHtmlPreviewCache;

function buildWorkspaceDraftSnapshot({
  manifest,
  activeResultIndex = 0,
  activeSliceId = null,
  currentMode = "text-to-image",
  currentRatio = "9:16",
  currentStyle = "",
  width = 0,
  height = 0,
  prompt = "",
  referenceImages = [],
  htmlPreview = null,
  htmlPreviews = null,
  now = Date.now
}) {
  const draftManifest = cloneDraftValue(manifest);
  for (const image of draftManifest.resultImages || []) {
    for (const asset of image.sliceManifest?.assets || []) {
      asset.aiProcessing = false;
      asset.aiProcessingLabel = "";
      asset.aiProgressLogs = [];
    }
  }
  return {
    version: 1,
    savedAt: now(),
    manifest: draftManifest,
    activeResultIndex,
    activeSliceId,
    currentMode,
    currentRatio,
    currentStyle,
    width: Number(width),
    height: Number(height),
    prompt: String(prompt || ""),
    referenceImages: cloneDraftValue(referenceImages),
    htmlPreviewSchemaVersion: 2,
    htmlPreview: cloneDraftValue(workspaceNormalizeHtmlPreviewCache({
      htmlPreviewSchemaVersion: 2,
      htmlPreview,
      htmlPreviews
    }))
  };
}

function formatWorkspaceDraftTime(value) {
  const date = new Date(Number(value) || Date.now());
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function renderWorkspaceDraftListHtml(drafts, activeDraftId) {
  if (!drafts.length) {
    return '<div class="drafts-empty">还没有切图记录</div>';
  }
  return drafts.map((item) => {
    const title = item.note || item.title || "未命名记录";
    return `
            <article class="draft-item${item.id === activeDraftId ? " active" : ""}" data-draft-id="${workspaceEscapeHtml(item.id)}">
              <div class="draft-item-main" data-open-draft="${workspaceEscapeHtml(item.id)}" role="button" tabindex="0">
                <img class="draft-item-image" src="${workspaceEscapeHtml(item.thumbnail || "")}" alt="" />
                <div class="draft-item-info">
                  <div class="draft-item-title-row">
                    <div class="draft-item-title">${workspaceEscapeHtml(title)}</div>
                    <button class="draft-item-note-edit" type="button" data-note-draft="${workspaceEscapeHtml(item.id)}" data-current-note="${workspaceEscapeHtml(title)}" aria-label="修改备注" title="修改备注">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
                    </button>
                  </div>
                  <div class="draft-item-meta">${Number(item.sliceCount) || 0} 个切图 · ${formatWorkspaceDraftTime(item.updatedAt)}</div>
                </div>
              </div>
              <button class="draft-item-delete" type="button" data-delete-draft="${workspaceEscapeHtml(item.id)}" aria-label="删除切图记录">×</button>
            </article>
          `;
  }).join("");
}

function renderWorkspaceDraftListErrorHtml(error) {
  return `<div class="drafts-empty">读取失败：${workspaceEscapeHtml(error.message || String(error))}</div>`;
}

function normalizeWorkspaceDraftListPayload(payload) {
  return {
    drafts: Array.isArray(payload?.drafts) ? payload.drafts : [],
    activeDraftId: typeof payload?.activeDraftId === "string" ? payload.activeDraftId : null
  };
}

async function readWorkspaceDraft({ fetchWithTimeout }) {
  const response = await fetchWithTimeout(`${workspaceProxyBaseUrl}/api/workspace-draft`, {}, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return {
    draftId: payload.draftId || null,
    restorePreference: payload.restorePreference || "ask",
    hasDraftRecords: Number(payload.recordCount) > 0,
    draft: payload.draft || null
  };
}

function resolveWorkspaceRestoreAction(preference) {
  if (preference === "restore" || preference === "new") return preference;
  return "prompt";
}

function requireSuccessfulWorkspaceDraftSave(result) {
  if (result === true) return true;
  const error = result instanceof Error
    ? result
    : new Error("切图记录保存失败");
  error.name = "WorkspaceDraftSaveError";
  throw error;
}

function shouldFlushWorkspaceDraftOnVisibilityChange(visibilityState) {
  return visibilityState === "hidden";
}

async function writeWorkspaceDraft({ draft, draftId }, { fetchBackend }) {
  const response = await fetchBackend("/api/workspace-draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ draft, draftId })
  });
  const payload = await response.json().catch(() => ({}));
  if (response.ok) {
    return {
      draftId: payload.draftId || draftId || null
    };
  }
  throw new Error(payload.error || `HTTP ${response.status}`);
}

async function deleteWorkspaceDraft({ fetchBackend }) {
  const response = await fetchBackend("/api/workspace-draft", { method: "DELETE" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

async function saveWorkspaceRestorePreference(choice, { fetchBackend }) {
  const response = await fetchBackend("/api/workspace-restore-preference", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ preference: choice })
  });
  return response.ok;
}

async function deleteWorkspaceDraftById(id, { fetchBackend }) {
  const response = await fetchBackend(`/api/workspace-drafts/${encodeURIComponent(id)}`, { method: "DELETE" });
  return response.ok;
}

async function updateWorkspaceDraftNote(id, note, { fetchBackend }) {
  const response = await fetchBackend(`/api/workspace-drafts/${encodeURIComponent(id)}/note`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "保存备注失败");
  return payload;
}

async function loadWorkspaceDraftItem(id, { fetchBackend }) {
  const response = await fetchBackend(`/api/workspace-drafts/${encodeURIComponent(id)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.item?.draft) throw new Error(payload.error || "切图记录不存在");
  return payload.item;
}

async function duplicateWorkspaceDraft(id, { fetchBackend }) {
  const response = await fetchBackend(`/api/workspace-drafts/${encodeURIComponent(id)}/duplicate`, { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.item?.draft) throw new Error(payload.error || "创建副本失败");
  return payload.item;
}

const readWorkspaceDraftApi = readWorkspaceDraft;
const writeWorkspaceDraftApi = writeWorkspaceDraft;
const deleteWorkspaceDraftApi = deleteWorkspaceDraft;
const saveWorkspaceRestorePreferenceApi = saveWorkspaceRestorePreference;
const deleteWorkspaceDraftByIdApi = deleteWorkspaceDraftById;
const updateWorkspaceDraftNoteApi = updateWorkspaceDraftNote;
const loadWorkspaceDraftItemApi = loadWorkspaceDraftItem;
const duplicateWorkspaceDraftApi = duplicateWorkspaceDraft;

if (typeof module !== "undefined") {
  module.exports = {
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
  };
}
