const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createUiRuntime
} = require("../../src/plugin/ui-runtime");

test("restoreUiWindowState always reopens a previously collapsed plugin at its expanded size", async () => {
  const resized = [];
  const posted = [];
  const runtime = createUiRuntime({
    clientStorage: {
      getAsync: async () => ({ width: 900, height: 700, collapsed: true })
    },
    ui: {
      resize: (width, height) => resized.push([width, height]),
      postMessage: (message) => posted.push(message)
    }
  }, { warn() {} });

  await runtime.restoreUiWindowState();

  assert.deepEqual(resized, [[900, 700]]);
  assert.deepEqual(posted, [{
    type: "ui-window-state",
    state: { width: 900, height: 700, collapsed: false }
  }]);
});

test("setUiCollapsed persists collapsed state and resizes to collapsed size", async () => {
  const saved = [];
  const resized = [];
  const runtime = createUiRuntime({
    clientStorage: {
      getAsync: async () => ({ width: 900, height: 700, collapsed: false }),
      setAsync: async (key, value) => saved.push([key, value])
    },
    ui: {
      resize: (width, height) => resized.push([width, height]),
      postMessage() {}
    }
  }, { warn() {} });

  await runtime.setUiCollapsed(true);

  assert.equal(saved.length, 1);
  assert.equal(saved[0][1].collapsed, true);
  assert.deepEqual(resized, [[320, 72]]);
});

test("safeResizeUi logs recoverable resize failures", () => {
  const warnings = [];
  const runtime = createUiRuntime({
    ui: {
      resize() {
        throw new Error("cannot resize");
      },
      postMessage() {}
    },
    clientStorage: {}
  }, {
    warn: (message) => warnings.push(message)
  });

  runtime.safeResizeUi(800, 600);

  assert.match(warnings[0], /窗口尺寸调整失败: cannot resize/);
});

test("safePostMessage returns true after posting a message", () => {
  const posted = [];
  const runtime = createUiRuntime({
    ui: {
      postMessage(message) {
        posted.push(message);
      }
    },
    clientStorage: {}
  }, { warn() {} });

  assert.equal(runtime.safePostMessage({ type: "ready" }), true);
  assert.deepEqual(posted, [{ type: "ready" }]);
});

test("safePostMessage logs a recoverable failure and returns false", () => {
  const warnings = [];
  const runtime = createUiRuntime({
    ui: {
      postMessage() {
        throw new Error("payload too large");
      }
    },
    clientStorage: {}
  }, {
    warn(message) {
      warnings.push(message);
    }
  });

  assert.equal(runtime.safePostMessage({ type: "large-payload" }), false);
  assert.deepEqual(warnings, ["消息同步失败: payload too large"]);
});

test("showNotification displays a non-empty UI message through Figma", () => {
  const notifications = [];
  const runtime = createUiRuntime({
    notify(message) {
      notifications.push(message);
    },
    ui: {
      resize() {},
      postMessage() {}
    },
    clientStorage: {}
  }, { warn() {} });

  assert.equal(runtime.showNotification("  请先选中要导出的 Figma 画布  "), true);
  assert.deepEqual(notifications, ["请先选中要导出的 Figma 画布"]);
  assert.equal(runtime.showNotification("   "), false);
  assert.deepEqual(notifications, ["请先选中要导出的 Figma 画布"]);
});
