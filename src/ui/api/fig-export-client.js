async function requestFigExport({ kind, manifest }, dependencies = {}) {
  const fetchBackendImpl = dependencies.fetchBackend;
  if (typeof fetchBackendImpl !== "function") {
    throw new Error("缺少 .fig 导出请求客户端");
  }
  const response = await fetchBackendImpl("/api/design/export-fig", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, manifest })
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.error || `.fig 导出失败：${response.status}`);
  }
  return {
    blob: await response.blob(),
    filename: readAttachmentFilename(response.headers.get("content-disposition"))
      || `${kind === "editable" ? "editable-design" : "image-slices"}.fig`
  };
}

function readAttachmentFilename(value) {
  const source = String(value || "");
  const utf8Match = source.match(/filename\*\s*=\s*UTF-8'[^']*'([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ""));
    } catch (_) {}
  }
  const match = source.match(/filename="([^"]+)"/i);
  return match?.[1] || "";
}

if (typeof module !== "undefined") {
  module.exports = {
    readAttachmentFilename,
    requestFigExport
  };
}
