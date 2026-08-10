function createFigmaFrameHtmlExportRequest(requestId) {
  const normalizedRequestId = normalizeFigmaFrameHtmlExportRequestId(requestId);
  if (!normalizedRequestId) {
    throw new TypeError("requestId must be a non-empty string");
  }
  return {
    type: "export-selected-figma-frame-html",
    requestId: normalizedRequestId
  };
}

function createFigmaFrameHtmlExportRequestId(timestamp, sequence) {
  return `figma-frame-html-export-${String(timestamp)}-${String(sequence)}`;
}

function createFigmaImportRequestId(timestamp, sequence) {
  return `figma-import-${String(timestamp)}-${String(sequence)}`;
}

function isActiveFigmaImportRequest(requestId, {
  figmaImportPending = false,
  activeFigmaImportRequestId = ""
} = {}) {
  const normalizedRequestId = normalizeFigmaImportRequestId(requestId);
  return Boolean(
    figmaImportPending
    && normalizedRequestId
    && normalizedRequestId === normalizeFigmaImportRequestId(activeFigmaImportRequestId)
  );
}

function readActiveFigmaImportMessage(message, state = {}) {
  if (
    message?.type !== "import-progress"
    && message?.type !== "import-success"
  ) {
    return null;
  }
  return isActiveFigmaImportRequest(message.requestId, state) ? message : null;
}

function createFigmaImportIdleWatchdog({
  timeoutMs,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  onTimeout
}) {
  const deadline = Math.max(1, Math.round(Number(timeoutMs) || 120000));
  let timer = null;
  return {
    restart() {
      if (timer !== null) clearTimeoutImpl(timer);
      timer = setTimeoutImpl(() => {
        timer = null;
        onTimeout?.();
      }, deadline);
    },
    stop() {
      if (timer === null) return;
      clearTimeoutImpl(timer);
      timer = null;
    }
  };
}

function canStartFigmaFrameHtmlExport({
  uiBusy = false,
  figmaImportPending = false,
  figmaFrameHtmlExportPending = false,
  selectionEligible = false
} = {}) {
  return selectionEligible && !uiBusy && !figmaImportPending && !figmaFrameHtmlExportPending;
}

function createFigmaFrameHtmlExportSelectionNotice() {
  return {
    type: "show-notification",
    message: "请先选中要导出的 Figma 画布"
  };
}

function getFigmaFrameHtmlExportButtonState({
  embedded = false,
  selectionEligible = false,
  selectionReason = "",
  uiBusy = false,
  figmaImportPending = false,
  figmaFrameHtmlExportPending = false
} = {}) {
  const ariaDisabled = !embedded || !selectionEligible;
  return {
    disabled: uiBusy || figmaImportPending || figmaFrameHtmlExportPending,
    ariaDisabled,
    title: ariaDisabled
      ? (selectionReason || "请在 Figma 中选择一个完整画板")
      : "导出选中的完整 Figma 画板为 HTML"
  };
}

function readFigmaFrameHtmlExportSelectionState(message) {
  if (message?.type !== "figma-frame-export-selection-state") return null;
  const eligible = message.eligible === true;
  return {
    eligible,
    reason: eligible ? "" : String(message.reason || "请选择一个要导出 HTML 的完整 Figma 画板")
  };
}

function completeFigmaOperation(operation, {
  figmaImportPending = false,
  figmaFrameHtmlExportPending = false
} = {}) {
  const nextState = {
    figmaImportPending: operation === "import" ? false : figmaImportPending,
    figmaFrameHtmlExportPending: operation === "figma-frame-html-export" ? false : figmaFrameHtmlExportPending
  };
  return {
    ...nextState,
    shouldReleaseBusy: !nextState.figmaImportPending && !nextState.figmaFrameHtmlExportPending
  };
}

function readPendingFigmaGenerationError(message, {
  figmaImportPending = false,
  activeFigmaImportRequestId = "",
  figmaFrameHtmlExportPending = false,
  activeFigmaFrameHtmlExportRequestId = ""
} = {}) {
  if (message?.type !== "generation-error") {
    return null;
  }
  const operation = message.operation === "import" || message.operation === "figma-frame-html-export"
    ? message.operation
    : "general";
  if (operation === "general") {
    return {
      operation,
      message: message.message
    };
  }
  if (operation === "import") {
    if (!isActiveFigmaImportRequest(message.requestId, {
      figmaImportPending,
      activeFigmaImportRequestId
    })) {
      return null;
    }
    return {
      operation,
      requestId: normalizeFigmaImportRequestId(message.requestId),
      message: message.message
    };
  }
  if (!isActiveFigmaFrameHtmlExportRequest(message.requestId, {
    figmaFrameHtmlExportPending,
    activeFigmaFrameHtmlExportRequestId
  })) {
    return null;
  }
  return {
    operation,
    requestId: normalizeFigmaFrameHtmlExportRequestId(message.requestId),
    message: message.message
  };
}

function readFigmaFrameHtmlExportData(message, activeRequestId) {
  const normalizedActiveRequestId = normalizeFigmaFrameHtmlExportRequestId(activeRequestId);
  if (
    message?.type !== "figma-frame-html-export-data"
    || !normalizedActiveRequestId
    || normalizeFigmaFrameHtmlExportRequestId(message.requestId) !== normalizedActiveRequestId
    || !message.manifest
    || typeof message.manifest !== "object"
    || !Array.isArray(message.assets)
  ) {
    return null;
  }
  return {
    manifest: message.manifest,
    assets: message.assets,
    warningCount: Array.isArray(message.manifest.warnings) ? message.manifest.warnings.length : 0
  };
}

function isActiveFigmaFrameHtmlExportRequest(requestId, {
  figmaFrameHtmlExportPending = false,
  activeFigmaFrameHtmlExportRequestId = ""
} = {}) {
  const normalizedRequestId = normalizeFigmaFrameHtmlExportRequestId(requestId);
  return Boolean(
    figmaFrameHtmlExportPending
    && normalizedRequestId
    && normalizedRequestId === normalizeFigmaFrameHtmlExportRequestId(activeFigmaFrameHtmlExportRequestId)
  );
}

function normalizeFigmaFrameHtmlExportRequestId(requestId) {
  return typeof requestId === "string" ? requestId.trim() : "";
}

function normalizeFigmaImportRequestId(requestId) {
  return typeof requestId === "string" ? requestId.trim() : "";
}

if (typeof module !== "undefined") {
  module.exports = {
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
  };
}
