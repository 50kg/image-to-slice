const DEFAULT_UI_WINDOW = { width: 1280, height: 860 };
const MIN_UI_WINDOW = { width: 360, height: 240 };
const COLLAPSED_UI_WINDOW = { width: 320, height: 72 };
const UI_WINDOW_STORAGE_KEY = "ai-ui-window-state-v2";

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeUiSize(width, height) {
  return {
    width: clampNumber(Number(width), MIN_UI_WINDOW.width, 3200, DEFAULT_UI_WINDOW.width),
    height: clampNumber(Number(height), MIN_UI_WINDOW.height, 2200, DEFAULT_UI_WINDOW.height)
  };
}

function normalizeStoredUiWindowState(stored) {
  if (!stored || typeof stored !== "object") {
    return {
      width: DEFAULT_UI_WINDOW.width,
      height: DEFAULT_UI_WINDOW.height,
      collapsed: false
    };
  }

  const size = normalizeUiSize(stored.width, stored.height);
  return {
    width: size.width,
    height: size.height,
    collapsed: Boolean(stored.collapsed)
  };
}

function getUiWindowRestoreSize(state) {
  return state.collapsed ? COLLAPSED_UI_WINDOW : normalizeUiSize(state.width, state.height);
}

function buildCollapsedUiWindowState(previous, collapsed) {
  const normalSize = normalizeUiSize(previous.width, previous.height);
  return {
    persistedState: {
      width: normalSize.width,
      height: normalSize.height,
      collapsed
    },
    resizeSize: collapsed ? COLLAPSED_UI_WINDOW : normalSize
  };
}

function buildSavedUiWindowState(state, previous) {
  const size = normalizeUiSize(state && state.width, state && state.height);
  return {
    width: size.width,
    height: size.height,
    collapsed: Boolean(state && Object.prototype.hasOwnProperty.call(state, "collapsed") ? state.collapsed : previous.collapsed)
  };
}

function normalizeResizeSize(width, height, allowCollapsed) {
  if (allowCollapsed) {
    return {
      width: clampNumber(Number(width), COLLAPSED_UI_WINDOW.width, 3200, COLLAPSED_UI_WINDOW.width),
      height: clampNumber(Number(height), COLLAPSED_UI_WINDOW.height, 2200, COLLAPSED_UI_WINDOW.height)
    };
  }
  return normalizeUiSize(width, height);
}

module.exports = {
  DEFAULT_UI_WINDOW,
  MIN_UI_WINDOW,
  COLLAPSED_UI_WINDOW,
  UI_WINDOW_STORAGE_KEY,
  clampNumber,
  normalizeUiSize,
  normalizeStoredUiWindowState,
  getUiWindowRestoreSize,
  buildCollapsedUiWindowState,
  buildSavedUiWindowState,
  normalizeResizeSize
};
