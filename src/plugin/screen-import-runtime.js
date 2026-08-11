const {
  createUiAssetScreen,
  createEditableDesignScreen
} = require("./screen-importer");
const {
  createFigmaGenerationErrorMessage
} = require("./figma-frame-html-export");

function createScreenImportRuntime({
  figmaApi,
  postMessage,
  notifyRecoverableError = () => {},
  onImported,
  onError,
  atob: atobImpl = globalThis.atob
}) {
  async function handle(message) {
    if (
      message?.type !== "create-ui-asset-screen"
      && message?.type !== "create-editable-design-screen"
    ) {
      return false;
    }

    try {
      if (message.type === "create-ui-asset-screen") {
        await createUiAssetScreen({
          figmaApi,
          atob: atobImpl,
          notifyRecoverableError,
          manifest: message.manifest
        });
        onImported?.();
        postMessage({
          type: "import-success",
          importType: "source",
          requestId: message.requestId
        });
        return true;
      }

      const result = await createEditableDesignScreen({
        figmaApi,
        atob: atobImpl,
        manifest: message.manifest,
        onProgress(progress) {
          postMessage({
            type: "import-progress",
            importType: "editable",
            requestId: message.requestId,
            ...progress
          });
        }
      });
      onImported?.();
      postMessage({
        type: "import-success",
        importType: "editable",
        requestId: message.requestId,
        ...result
      });
      return true;
    } catch (error) {
      const posted = postMessage(createFigmaGenerationErrorMessage(
        message,
        error?.message || String(error)
      ));
      if (posted === false) onError?.(error);
      return true;
    }
  }

  return { handle };
}

module.exports = {
  createScreenImportRuntime
};
