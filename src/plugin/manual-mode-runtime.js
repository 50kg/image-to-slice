const { createManualDesignScreen } = require("./manual-mode-renderer");

function createManualModeRuntime({ figmaApi, postMessage, atob: atobImpl = globalThis.atob }) {
  async function handle(message) {
    if (message?.type !== "create-manual-design-screen") return false;
    try {
      const result = await createManualDesignScreen({ figmaApi, atob: atobImpl, payload: message.payload });
      postMessage({
        type: "manual-import-success",
        requestId: message.requestId,
        ...result
      });
    } catch (error) {
      postMessage({
        type: "generation-error",
        operation: "manual-import",
        requestId: message.requestId,
        message: error?.message || String(error)
      });
    }
    return true;
  }
  return { handle };
}

module.exports = { createManualModeRuntime };
