const {
  getSelectedFigmaFrame,
  serializeFigmaFrame
} = require("./figma-frame-serializer");
const {
  extractFigmaFrameAssets
} = require("./figma-frame-assets");

async function prepareSelectedFigmaFrameHtmlExport({ figmaApi, postMessage, requestId }) {
  const frame = getSelectedFigmaFrame(figmaApi);
  const manifest = serializeFigmaFrame(frame);
  const { assets, warnings } = await extractFigmaFrameAssets({ figmaApi, frame, manifest });
  manifest.warnings.push(...warnings);
  const posted = postMessage({
    type: "figma-frame-html-export-data",
    requestId,
    manifest,
    assets
  });
  if (posted === false) {
    throw new Error("Figma 画板 HTML 导出数据发送失败");
  }
  return { manifest, assets };
}

function createFigmaGenerationErrorMessage(requestMessage, reason) {
  const type = requestMessage?.type;
  if (type === "export-selected-figma-frame-html") {
    return {
      type: "generation-error",
      operation: "figma-frame-html-export",
      requestId: requestMessage.requestId,
      message: reason
    };
  }
  if (type === "create-ui-asset-screen" || type === "create-editable-design-screen") {
    return {
      type: "generation-error",
      operation: "import",
      requestId: requestMessage.requestId,
      message: reason
    };
  }
  return {
    type: "generation-error",
    operation: "general",
    message: reason
  };
}

module.exports = {
  createFigmaGenerationErrorMessage,
  prepareSelectedFigmaFrameHtmlExport
};
