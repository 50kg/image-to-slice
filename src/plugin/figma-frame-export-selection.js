const {
  getSelectedFigmaFrame
} = require("./figma-frame-serializer");

function createFigmaFrameExportSelectionState(figmaApi) {
  try {
    getSelectedFigmaFrame(figmaApi);
    return {
      type: "figma-frame-export-selection-state",
      eligible: true,
      reason: ""
    };
  } catch (error) {
    return {
      type: "figma-frame-export-selection-state",
      eligible: false,
      reason: error?.message || String(error)
    };
  }
}

function bindFigmaFrameExportSelectionState({ figmaApi, postMessage }) {
  const publish = () => postMessage(createFigmaFrameExportSelectionState(figmaApi));
  figmaApi.on("selectionchange", publish);
  publish();
  return publish;
}

module.exports = {
  bindFigmaFrameExportSelectionState,
  createFigmaFrameExportSelectionState
};
