function createImageRoutes({
  getTaskRequestContext,
  readJson,
  runWithAiProgress,
  generateImage,
  editImage,
  sendJson
}) {
  return async function handleImageRoutes(request, response) {
    if (request.method === "POST" && request.url === "/api/images/generate") {
      const payload = await readJson(request);
      const context = getTaskRequestContext("generation");
      const result = await runWithAiProgress(payload, "图片生成请求已发送，正在等待上游返回", () => generateImage(payload, context));
      sendJson(response, 200, result);
      return true;
    }

    if (request.method === "POST" && request.url === "/api/images/edit") {
      const payload = await readJson(request);
      const context = getTaskRequestContext("generation");
      const result = await runWithAiProgress(payload, "图片编辑请求已发送，正在等待上游返回", () => editImage(payload, context));
      sendJson(response, 200, result);
      return true;
    }

    return false;
  };
}

module.exports = {
  createImageRoutes
};
