const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_UI_WINDOW,
  COLLAPSED_UI_WINDOW,
  clampNumber,
  normalizeUiSize,
  normalizeStoredUiWindowState,
  getUiWindowRestoreSize,
  buildCollapsedUiWindowState,
  buildSavedUiWindowState,
  normalizeResizeSize
} = require("../../src/plugin/ui-window-state");

test("clampNumber rounds finite values and falls back for invalid values", () => {
  assert.equal(clampNumber(10.6, 0, 20, 5), 11);
  assert.equal(clampNumber(-1, 0, 20, 5), 0);
  assert.equal(clampNumber(21, 0, 20, 5), 20);
  assert.equal(clampNumber(Number.NaN, 0, 20, 5), 5);
});

test("normalizeUiSize clamps to plugin window bounds", () => {
  assert.deepEqual(normalizeUiSize(100, 100), { width: 360, height: 240 });
  assert.deepEqual(normalizeUiSize(5000, 5000), { width: 3200, height: 2200 });
  assert.deepEqual(normalizeUiSize("640.7", "480.2"), { width: 641, height: 480 });
  assert.deepEqual(normalizeUiSize("bad", null), {
    width: DEFAULT_UI_WINDOW.width,
    height: 240
  });
});

test("normalizeStoredUiWindowState returns defaults for missing stored state", () => {
  assert.deepEqual(normalizeStoredUiWindowState(null), {
    width: DEFAULT_UI_WINDOW.width,
    height: DEFAULT_UI_WINDOW.height,
    collapsed: false
  });
});

test("normalizeStoredUiWindowState clamps persisted dimensions and collapsed flag", () => {
  assert.deepEqual(normalizeStoredUiWindowState({ width: 120, height: 9000, collapsed: 1 }), {
    width: 360,
    height: 2200,
    collapsed: true
  });
});

test("getUiWindowRestoreSize uses collapsed dimensions when state is collapsed", () => {
  assert.deepEqual(getUiWindowRestoreSize({ width: 800, height: 600, collapsed: true }), COLLAPSED_UI_WINDOW);
  assert.deepEqual(getUiWindowRestoreSize({ width: 800, height: 600, collapsed: false }), { width: 800, height: 600 });
});

test("buildCollapsedUiWindowState persists normal dimensions while resizing to collapsed size", () => {
  assert.deepEqual(buildCollapsedUiWindowState({ width: 900, height: 700 }, true), {
    persistedState: { width: 900, height: 700, collapsed: true },
    resizeSize: COLLAPSED_UI_WINDOW
  });
});

test("buildSavedUiWindowState preserves previous collapsed value when omitted", () => {
  assert.deepEqual(buildSavedUiWindowState({ width: 1000, height: 700 }, { collapsed: true }), {
    width: 1000,
    height: 700,
    collapsed: true
  });
});

test("normalizeResizeSize allows smaller collapsed dimensions only when explicitly allowed", () => {
  assert.deepEqual(normalizeResizeSize(100, 50, true), COLLAPSED_UI_WINDOW);
  assert.deepEqual(normalizeResizeSize(100, 50, false), { width: 360, height: 240 });
});
