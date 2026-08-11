const {
  DEFAULT_UI_WINDOW
} = require("./ui-window-state");
const {
  createUiRuntime
} = require("./ui-runtime");
const {
  createScreenImportRuntime
} = require("./screen-import-runtime");
const {
  createFigmaGenerationErrorMessage,
  prepareSelectedFigmaFrameHtmlExport
} = require("./figma-frame-html-export");
const {
  bindFigmaFrameExportSelectionState
} = require("./figma-frame-export-selection");

figma.showUI(__html__, { width: DEFAULT_UI_WINDOW.width, height: DEFAULT_UI_WINDOW.height, themeColors: true });

const uiRuntime = createUiRuntime(figma);
const screenImportRuntime = createScreenImportRuntime({
  figmaApi: figma,
  atob: typeof atob === "function" ? atob : undefined,
  postMessage: uiRuntime.safePostMessage,
  notifyRecoverableError: uiRuntime.notifyRecoverableError,
  onError(error) {
    figma.notify(`生成失败：${error?.message || String(error)}`, { error: true });
  }
});
const publishFigmaFrameExportSelectionState = bindFigmaFrameExportSelectionState({
  figmaApi: figma,
  postMessage: uiRuntime.safePostMessage
});

uiRuntime.restoreUiWindowState().catch((error) => {
  uiRuntime.notifyRecoverableError("窗口状态恢复失败", error);
});

figma.ui.onmessage = async (message) => {
  if (await screenImportRuntime.handle(message)) return;

  try {
    if (message.type === "export-selected-figma-frame-html") {
      await prepareSelectedFigmaFrameHtmlExport({
        figmaApi: figma,
        postMessage: uiRuntime.safePostMessage,
        requestId: message.requestId
      });
    }

    if (message.type === "request-figma-frame-export-selection-state") {
      publishFigmaFrameExportSelectionState();
    }

    if (message.type === "show-notification") {
      uiRuntime.showNotification(message.message);
    }

    if (message.type === "resize-ui") {
      uiRuntime.safeResizeUi(message.width, message.height);
    }

    if (message.type === "save-ui-window-state") {
      await uiRuntime.saveUiWindowState(message.state);
    }

    if (message.type === "set-ui-collapsed") {
      await uiRuntime.setUiCollapsed(Boolean(message.collapsed));
    }

    if (message.type === "close") {
      figma.closePlugin();
    }
  } catch (error) {
    const reason = error && error.message ? error.message : String(error);
    const errorPosted = uiRuntime.safePostMessage(createFigmaGenerationErrorMessage(message, reason));
    if (!errorPosted) {
      figma.notify(`生成失败：${reason}`, { error: true });
    }
  }
};
