const test = require("node:test");
const assert = require("node:assert/strict");

const {
  canStartFigmaFrameHtmlExport,
  completeFigmaOperation,
  createFigmaImportIdleWatchdog,
  createFigmaImportRequestId,
  createFigmaFrameHtmlExportSelectionNotice,
  createFigmaFrameHtmlExportRequest,
  createFigmaFrameHtmlExportRequestId,
  getFigmaFrameHtmlExportButtonState,
  isActiveFigmaImportRequest,
  isActiveFigmaFrameHtmlExportRequest,
  readActiveFigmaImportMessage,
  readPendingFigmaGenerationError,
  readFigmaFrameHtmlExportData,
  readFigmaFrameHtmlExportSelectionState
} = require("../src/ui/state/figma-frame-html-export-state");

test("export button remains clickable but unavailable without a selected frame", () => {
  assert.deepEqual(getFigmaFrameHtmlExportButtonState({
    embedded: true,
    selectionEligible: false,
    selectionReason: "请选择一个要导出 HTML 的完整 Figma 画板"
  }), {
    disabled: false,
    ariaDisabled: true,
    title: "请选择一个要导出 HTML 的完整 Figma 画板"
  });

  assert.deepEqual(createFigmaFrameHtmlExportSelectionNotice(), {
    type: "show-notification",
    message: "请先选中要导出的 Figma 画布"
  });
});

test("export button uses native disabled only while an operation blocks export", () => {
  assert.deepEqual(getFigmaFrameHtmlExportButtonState({
    embedded: true,
    selectionEligible: true,
    uiBusy: true
  }), {
    disabled: true,
    ariaDisabled: false,
    title: "导出选中的完整 Figma 画板为 HTML"
  });
});

test("canStartFigmaFrameHtmlExport allows an idle empty workspace and rejects active UI work", () => {
  assert.equal(canStartFigmaFrameHtmlExport({
    uiBusy: false,
    figmaImportPending: false,
    figmaFrameHtmlExportPending: false,
    selectionEligible: true
  }), true);
  assert.equal(canStartFigmaFrameHtmlExport({
    uiBusy: false,
    figmaImportPending: false,
    figmaFrameHtmlExportPending: false,
    selectionEligible: false
  }), false);
  assert.equal(canStartFigmaFrameHtmlExport({
    uiBusy: true,
    figmaImportPending: false,
    figmaFrameHtmlExportPending: false
  }), false);
  assert.equal(canStartFigmaFrameHtmlExport({
    uiBusy: false,
    figmaImportPending: true,
    figmaFrameHtmlExportPending: false
  }), false);
  assert.equal(canStartFigmaFrameHtmlExport({
    uiBusy: false,
    figmaImportPending: false,
    figmaFrameHtmlExportPending: true
  }), false);
});

test("readFigmaFrameHtmlExportSelectionState normalizes selection messages", () => {
  assert.deepEqual(readFigmaFrameHtmlExportSelectionState({
    type: "figma-frame-export-selection-state",
    eligible: true,
    reason: "ignored"
  }), {
    eligible: true,
    reason: ""
  });
  assert.deepEqual(readFigmaFrameHtmlExportSelectionState({
    type: "figma-frame-export-selection-state",
    eligible: false,
    reason: "请选择完整画板"
  }), {
    eligible: false,
    reason: "请选择完整画板"
  });
  assert.equal(readFigmaFrameHtmlExportSelectionState({ type: "import-success" }), null);
});

test("readPendingFigmaGenerationError correlates import, export, and general errors", () => {
  assert.deepEqual(readPendingFigmaGenerationError({
    type: "generation-error",
    operation: "import",
    requestId: "import-42",
    message: "Import failed"
  }, {
    figmaImportPending: true,
    activeFigmaImportRequestId: "import-42",
    figmaFrameHtmlExportPending: true,
    activeFigmaFrameHtmlExportRequestId: "export-42"
  }), { operation: "import", requestId: "import-42", message: "Import failed" });
  assert.deepEqual(readPendingFigmaGenerationError({
    type: "generation-error",
    operation: "figma-frame-html-export",
    requestId: "export-42",
    message: "Export failed"
  }, {
    figmaImportPending: true,
    figmaFrameHtmlExportPending: true,
    activeFigmaFrameHtmlExportRequestId: "export-42"
  }), {
    operation: "figma-frame-html-export",
    requestId: "export-42",
    message: "Export failed"
  });
  assert.deepEqual(readPendingFigmaGenerationError({
    type: "generation-error",
    operation: "general",
    message: "Resize failed"
  }, {
    figmaImportPending: true,
    figmaFrameHtmlExportPending: true,
    activeFigmaFrameHtmlExportRequestId: "export-42"
  }), { operation: "general", message: "Resize failed" });
  assert.deepEqual(readPendingFigmaGenerationError({
    type: "generation-error",
    message: "Legacy failure"
  }), { operation: "general", message: "Legacy failure" });
});

test("readPendingFigmaGenerationError ignores stale or inactive correlated errors", () => {
  assert.equal(readPendingFigmaGenerationError({
    type: "generation-error",
    operation: "figma-frame-html-export",
    requestId: "export-old",
    message: "Old export failed"
  }, {
    figmaFrameHtmlExportPending: true,
    activeFigmaFrameHtmlExportRequestId: "export-new"
  }), null);
  assert.equal(readPendingFigmaGenerationError({
    type: "generation-error",
    operation: "import",
    requestId: "import-old",
    message: "Old import failed"
  }, {
    figmaImportPending: true,
    activeFigmaImportRequestId: "import-new"
  }), null);
});

test("Figma import messages are accepted only for the active request", () => {
  const firstRequestId = createFigmaImportRequestId(1720000000000, 1);
  const secondRequestId = createFigmaImportRequestId(1720000000000, 2);

  assert.notEqual(firstRequestId, secondRequestId);
  assert.equal(isActiveFigmaImportRequest(firstRequestId, {
    figmaImportPending: true,
    activeFigmaImportRequestId: firstRequestId
  }), true);
  assert.equal(isActiveFigmaImportRequest(firstRequestId, {
    figmaImportPending: true,
    activeFigmaImportRequestId: secondRequestId
  }), false);
  assert.deepEqual(readActiveFigmaImportMessage({
    type: "import-progress",
    requestId: firstRequestId,
    processedCount: 50
  }, {
    figmaImportPending: true,
    activeFigmaImportRequestId: firstRequestId
  }), {
    type: "import-progress",
    requestId: firstRequestId,
    processedCount: 50
  });
  assert.equal(readActiveFigmaImportMessage({
    type: "import-success",
    requestId: firstRequestId
  }, {
    figmaImportPending: true,
    activeFigmaImportRequestId: secondRequestId
  }), null);
});

test("Figma import idle watchdog restarts on progress and stops after completion", () => {
  const scheduled = [];
  const cleared = [];
  let timeoutCount = 0;
  const watchdog = createFigmaImportIdleWatchdog({
    timeoutMs: 120000,
    setTimeoutImpl(callback, timeoutMs) {
      const timer = { callback, timeoutMs };
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutImpl(timer) {
      cleared.push(timer);
    },
    onTimeout() {
      timeoutCount += 1;
    }
  });

  watchdog.restart(5000);
  watchdog.restart();
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[0].timeoutMs, 5000);
  assert.equal(scheduled[1].timeoutMs, 120000);
  assert.deepEqual(cleared, [scheduled[0]]);
  scheduled[1].callback();
  assert.equal(timeoutCount, 1);

  watchdog.restart();
  watchdog.stop();
  assert.equal(cleared.at(-1), scheduled[2]);
});

test("completeFigmaOperation retains busy until the second Figma operation completes", () => {
  const afterImport = completeFigmaOperation("import", {
    figmaImportPending: true,
    figmaFrameHtmlExportPending: true
  });
  assert.deepEqual(afterImport, {
    figmaImportPending: false,
    figmaFrameHtmlExportPending: true,
    shouldReleaseBusy: false
  });
  assert.deepEqual(completeFigmaOperation("figma-frame-html-export", afterImport), {
    figmaImportPending: false,
    figmaFrameHtmlExportPending: false,
    shouldReleaseBusy: true
  });

  const afterExport = completeFigmaOperation("figma-frame-html-export", {
    figmaImportPending: true,
    figmaFrameHtmlExportPending: true
  });
  assert.deepEqual(afterExport, {
    figmaImportPending: true,
    figmaFrameHtmlExportPending: false,
    shouldReleaseBusy: false
  });
  assert.deepEqual(completeFigmaOperation("import", afterExport), {
    figmaImportPending: false,
    figmaFrameHtmlExportPending: false,
    shouldReleaseBusy: true
  });
});

test("createFigmaFrameHtmlExportRequest requires and preserves a unique request id", () => {
  const firstRequestId = createFigmaFrameHtmlExportRequestId(1720000000000, 1);
  const secondRequestId = createFigmaFrameHtmlExportRequestId(1720000000000, 2);

  assert.notEqual(firstRequestId, secondRequestId);
  assert.deepEqual(createFigmaFrameHtmlExportRequest(firstRequestId), {
    type: "export-selected-figma-frame-html",
    requestId: firstRequestId
  });
  assert.throws(() => createFigmaFrameHtmlExportRequest("  "), {
    name: "TypeError",
    message: "requestId must be a non-empty string"
  });
});

test("readFigmaFrameHtmlExportData accepts only the active request payload", () => {
  const manifest = {
    screen: { name: "Checkout" },
    warnings: ["Mixed font", "Unsupported fill"]
  };
  const assets = [{ filename: "hero.png", bytes: new Uint8Array([1]) }];

  assert.deepEqual(readFigmaFrameHtmlExportData({
    type: "figma-frame-html-export-data",
    requestId: "export-42",
    manifest,
    assets
  }, "export-42"), {
    manifest,
    assets,
    warningCount: 2
  });
  assert.equal(readFigmaFrameHtmlExportData({
    type: "figma-frame-html-export-data",
    requestId: "export-old",
    manifest,
    assets
  }, "export-new"), null);
  assert.equal(readFigmaFrameHtmlExportData({
    type: "figma-frame-html-export-data",
    manifest,
    assets
  }, "export-new"), null);
});

test("readFigmaFrameHtmlExportData ignores unrelated or malformed messages", () => {
  assert.equal(readFigmaFrameHtmlExportData({ type: "import-success" }), null);
  assert.equal(readFigmaFrameHtmlExportData({ type: "figma-frame-html-export-data" }), null);
  assert.equal(readFigmaFrameHtmlExportData({
    type: "figma-frame-html-export-data",
    requestId: "export-42",
    manifest: {},
    assets: {}
  }, "export-42"), null);
});

test("isActiveFigmaFrameHtmlExportRequest rejects stale response and timeout ids", () => {
  assert.equal(isActiveFigmaFrameHtmlExportRequest("export-42", {
    figmaFrameHtmlExportPending: true,
    activeFigmaFrameHtmlExportRequestId: "export-42"
  }), true);
  assert.equal(isActiveFigmaFrameHtmlExportRequest("export-old", {
    figmaFrameHtmlExportPending: true,
    activeFigmaFrameHtmlExportRequestId: "export-new"
  }), false);
  assert.equal(isActiveFigmaFrameHtmlExportRequest("export-42", {
    figmaFrameHtmlExportPending: false,
    activeFigmaFrameHtmlExportRequestId: "export-42"
  }), false);
});
