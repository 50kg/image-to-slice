const {
  createSimulatorFigmaApi
} = require("./figma-api");
const {
  renderSimulatorPage
} = require("./canvas-renderer");
const {
  createScreenImportRuntime
} = require("../plugin/screen-import-runtime");
const {
  createFigmaFrameExportSelectionState
} = require("../plugin/figma-frame-export-selection");
const {
  normalizeStoredUiWindowState,
  getUiWindowRestoreSize,
  buildCollapsedUiWindowState,
  buildSavedUiWindowState,
  normalizeResizeSize
} = require("../plugin/ui-window-state");

const SIMULATOR_UI_WINDOW_STORAGE_KEY = "image-to-slice-simulator-window-state-v1";
const DEFAULT_SIMULATOR_UI_WINDOW_STATE = { width: 980, height: 700, collapsed: false };

const stage = document.getElementById("stage");
const status = document.getElementById("status");
const sim = document.querySelector(".sim");
const pluginWindow = document.querySelector(".plugin-window");
const pluginFrame = document.querySelector("iframe");

const figmaApi = createSimulatorFigmaApi();
const renderPage = () => renderSimulatorPage({
  document,
  stage,
  status,
  figmaApi
});
const postPluginMessage = (message) => {
  pluginFrame.contentWindow?.postMessage({ pluginMessage: message }, "*");
};
const importRuntime = createScreenImportRuntime({
  figmaApi,
  postMessage: postPluginMessage,
  onImported: renderPage
});

restorePluginWindowState();

window.addEventListener("message", async (event) => {
  const message = event.data?.pluginMessage;
  if (!message) return;

  if (await importRuntime.handle(message)) {
    postPluginMessage(createFigmaFrameExportSelectionState(figmaApi));
    return;
  }

  if (message.type === "request-figma-frame-export-selection-state") {
    postPluginMessage(createFigmaFrameExportSelectionState(figmaApi));
    return;
  }

  if (message.type === "close") {
    status.textContent = "收到关闭消息";
    return;
  }

  if (message.type === "resize-ui") {
    resizePluginWindow(message.width, message.height);
    return;
  }

  if (message.type === "save-ui-window-state") {
    saveWindowState(message.state);
    return;
  }

  if (message.type === "set-ui-collapsed") {
    const { persistedState, resizeSize } = buildCollapsedUiWindowState(
      readWindowState(),
      Boolean(message.collapsed)
    );
    writeWindowState(persistedState);
    resizePluginWindow(resizeSize.width, resizeSize.height, persistedState.collapsed);
    postPluginMessage({
      type: "ui-window-state",
      state: {
        width: resizeSize.width,
        height: resizeSize.height,
        collapsed: persistedState.collapsed
      }
    });
  }
});

function restorePluginWindowState() {
  const state = { ...readWindowState(), collapsed: false };
  const size = getUiWindowRestoreSize(state);
  resizePluginWindow(size.width, size.height);
  pluginFrame.addEventListener("load", () => {
    postPluginMessage({
      type: "ui-window-state",
      state: {
        ...state,
        width: size.width,
        height: size.height
      }
    });
  });
}

function resizePluginWindow(width, height, allowCollapsed = false) {
  const size = normalizeResizeSize(width, height, allowCollapsed);
  pluginWindow.style.width = `${size.width}px`;
  pluginWindow.style.height = `${size.height}px`;
  sim.style.setProperty("--plugin-width", `${size.width}px`);
}

function readWindowState() {
  try {
    const raw = window.localStorage.getItem(SIMULATOR_UI_WINDOW_STORAGE_KEY);
    return raw
      ? normalizeStoredUiWindowState(JSON.parse(raw))
      : { ...DEFAULT_SIMULATOR_UI_WINDOW_STATE };
  } catch {
    // Ignore invalid simulator storage.
  }
  return { ...DEFAULT_SIMULATOR_UI_WINDOW_STATE };
}

function saveWindowState(state) {
  if (!state || typeof state !== "object") return;
  writeWindowState(buildSavedUiWindowState(state, readWindowState()));
}

function writeWindowState(state) {
  window.localStorage.setItem(SIMULATOR_UI_WINDOW_STORAGE_KEY, JSON.stringify(state));
}

window.ImageToSliceSimulatorLoaded = true;
