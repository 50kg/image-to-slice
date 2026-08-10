function createProgressRoutes({
  getProgressJob,
  getProgressController,
  finishProgress,
  sendJson,
  now = Date.now
}) {
  return async function handleProgressRoutes(request, response) {
    const progressMatch = request.method === "GET" && request.url.match(/^\/api\/progress\/([A-Za-z0-9_-]+)$/);
    if (progressMatch) {
      const job = getProgressJob(progressMatch[1]);
      if (!job) {
        sendJson(response, 404, { error: "AI progress job not found" });
        return true;
      }
      sendJson(response, 200, {
        ...job,
        elapsedSeconds: Math.max(0, Math.floor((now() - job.startedAt) / 1000)),
        silentSeconds: Math.max(0, Math.floor((now() - job.lastEventAt) / 1000))
      });
      return true;
    }

    const cancelProgressMatch = request.method === "POST" && request.url.match(/^\/api\/progress\/([A-Za-z0-9_-]+)\/cancel$/);
    if (cancelProgressMatch) {
      const progressId = cancelProgressMatch[1];
      const controller = getProgressController(progressId);
      if (!controller) {
        sendJson(response, 404, { error: "AI progress job is not running" });
        return true;
      }
      controller.abort();
      finishProgress(progressId, "cancelled", "AI 处理已取消");
      sendJson(response, 200, { ok: true });
      return true;
    }

    return false;
  };
}

module.exports = {
  createProgressRoutes
};
