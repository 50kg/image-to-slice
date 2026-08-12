function createWorkspaceRoutes({ workspaceDraftStore, readJson, sendJson }) {
  return async function handleWorkspaceRoutes(request, response) {
    if (request.method === "GET" && request.url === "/api/workspace-draft") {
      const index = workspaceDraftStore.loadIndex();
      const activeDraft = findActiveRestorableDraft(index, workspaceDraftStore.loadDraft);
      sendJson(response, 200, {
        draft: activeDraft,
        draftId: activeDraft ? index.activeDraftId : null,
        restorePreference: index.restorePreference || "ask",
        recordCount: index.records.length
      });
      return true;
    }

    if (request.method === "POST" && request.url === "/api/workspace-draft") {
      const payload = await readJson(request, 150 * 1024 * 1024);
      const item = await workspaceDraftStore.saveDraft(payload.draft, payload.draftId);
      sendJson(response, 200, { ok: true, draftId: item.id });
      return true;
    }

    if (request.method === "DELETE" && request.url === "/api/workspace-draft") {
      await workspaceDraftStore.setActiveDraftId(null);
      sendJson(response, 200, { ok: true });
      return true;
    }

    if (request.method === "GET" && request.url === "/api/workspace-drafts") {
      const index = workspaceDraftStore.loadIndex();
      sendJson(response, 200, {
        drafts: index.records,
        activeDraftId: index.activeDraftId
      });
      return true;
    }

    if (request.method === "POST" && request.url === "/api/workspace-restore-preference") {
      const payload = await readJson(request);
      const restorePreference = await workspaceDraftStore.setRestorePreference(payload.preference);
      sendJson(response, 200, { ok: true, restorePreference });
      return true;
    }

    const duplicateDraftMatch = request.url.match(/^\/api\/workspace-drafts\/([A-Za-z0-9_-]+)\/duplicate$/);
    if (request.method === "POST" && duplicateDraftMatch) {
      const copy = await workspaceDraftStore.duplicateDraft(duplicateDraftMatch[1]);
      if (!copy) {
        sendJson(response, 404, { error: "Workspace draft not found" });
        return true;
      }
      sendJson(response, 200, { ok: true, item: { ...copy, draft: workspaceDraftStore.loadDraft(copy.id) } });
      return true;
    }

    const draftNoteMatch = request.url.match(/^\/api\/workspace-drafts\/([A-Za-z0-9_-]+)\/note$/);
    if (request.method === "POST" && draftNoteMatch) {
      const payload = await readJson(request);
      const item = await workspaceDraftStore.updateDraftNote(draftNoteMatch[1], payload.note);
      if (!item) {
        sendJson(response, 404, { error: "Workspace draft not found" });
        return true;
      }
      sendJson(response, 200, { ok: true, item });
      return true;
    }

    const workspaceDraftMatch = request.url.match(/^\/api\/workspace-drafts\/([A-Za-z0-9_-]+)$/);
    if (request.method === "GET" && workspaceDraftMatch) {
      const item = await workspaceDraftStore.activateDraft(workspaceDraftMatch[1]);
      if (!item) {
        sendJson(response, 404, { error: "Workspace draft not found" });
        return true;
      }
      sendJson(response, 200, { item: { ...item, draft: workspaceDraftStore.loadDraft(item.id) } });
      return true;
    }

    if (request.method === "DELETE" && workspaceDraftMatch) {
      await workspaceDraftStore.deleteDraft(workspaceDraftMatch[1]);
      sendJson(response, 200, { ok: true });
      return true;
    }

    return false;
  };
}

function findActiveRestorableDraft(index, loadDraft) {
  if (!index.activeDraftId) return null;
  const activeRecord = index.records.find((record) => record.id === index.activeDraftId);
  if (!activeRecord) return null;
  const draft = loadDraft(activeRecord.id);
  if (!Array.isArray(draft?.manifest?.resultImages) || draft.manifest.resultImages.length === 0) return null;
  return draft;
}

module.exports = {
  createWorkspaceRoutes,
  findActiveRestorableDraft
};
