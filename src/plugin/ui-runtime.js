const {
  UI_WINDOW_STORAGE_KEY,
  normalizeStoredUiWindowState,
  getUiWindowRestoreSize,
  buildCollapsedUiWindowState,
  buildSavedUiWindowState,
  normalizeResizeSize
} = require("./ui-window-state");

function createUiRuntime(figmaApi, logger) {
  const runtimeLogger = logger || console;

  async function restoreUiWindowState() {
    const state = {
      ...await getStoredUiWindowState(),
      collapsed: false
    };
    const nextSize = getUiWindowRestoreSize(state);
    safeResizeUi(nextSize.width, nextSize.height, state.collapsed);
    safePostMessage({
      type: "ui-window-state",
      state: {
        width: nextSize.width,
        height: nextSize.height,
        collapsed: Boolean(state.collapsed)
      }
    });
  }

  async function setUiCollapsed(collapsed) {
    const previous = await getStoredUiWindowState();
    const { persistedState: nextState, resizeSize: nextSize } = buildCollapsedUiWindowState(previous, collapsed);
    await figmaApi.clientStorage.setAsync(UI_WINDOW_STORAGE_KEY, nextState);
    safeResizeUi(nextSize.width, nextSize.height, collapsed);
    safePostMessage({
      type: "ui-window-state",
      state: {
        width: nextSize.width,
        height: nextSize.height,
        collapsed: Boolean(nextState.collapsed)
      }
    });
  }

  async function saveUiWindowState(state) {
    const previous = await getStoredUiWindowState();
    const nextState = buildSavedUiWindowState(state, previous);
    await figmaApi.clientStorage.setAsync(UI_WINDOW_STORAGE_KEY, nextState);
  }

  async function getStoredUiWindowState() {
    const stored = await figmaApi.clientStorage.getAsync(UI_WINDOW_STORAGE_KEY).catch(() => null);
    return normalizeStoredUiWindowState(stored);
  }

  function safeResizeUi(width, height, allowCollapsed) {
    const size = normalizeResizeSize(width, height, allowCollapsed);
    try {
      figmaApi.ui.resize(size.width, size.height);
    } catch (error) {
      notifyRecoverableError("窗口尺寸调整失败", error);
    }
  }

  function safePostMessage(message) {
    try {
      figmaApi.ui.postMessage(message);
      return true;
    } catch (error) {
      notifyRecoverableError("消息同步失败", error);
      return false;
    }
  }

  function notifyRecoverableError(prefix, error) {
    const reason = error && error.message ? error.message : String(error);
    runtimeLogger.warn(`${prefix}: ${reason}`);
  }

  function showNotification(message) {
    const normalizedMessage = String(message || "").trim();
    if (!normalizedMessage) return false;
    figmaApi.notify(normalizedMessage);
    return true;
  }

  return {
    restoreUiWindowState,
    setUiCollapsed,
    saveUiWindowState,
    getStoredUiWindowState,
    safeResizeUi,
    safePostMessage,
    showNotification,
    notifyRecoverableError
  };
}

module.exports = {
  createUiRuntime
};
