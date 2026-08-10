async function requestAiInpaint({
  fetchBackend,
  signal,
  sourceDataUrl,
  maskDataUrl,
  name,
  width,
  height,
  prompt,
  completeRegions,
  progressId,
  quality = "high"
}) {
  const response = await fetchBackend("/api/assets/ai-redraw", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataUrl: sourceDataUrl,
      maskDataUrl,
      name,
      width,
      height,
      prompt,
      ...(Array.isArray(completeRegions) ? { completeRegions } : {}),
      progressId,
      preserveBackground: true,
      quality
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || `AI complete request failed: ${response.status}`);
  }
  const image = result.images && result.images[0];
  if (!image?.dataUrl) throw new Error("AI 补齐没有返回图片");
  return image;
}

if (typeof module !== "undefined") {
  module.exports = {
    requestAiInpaint
  };
}
