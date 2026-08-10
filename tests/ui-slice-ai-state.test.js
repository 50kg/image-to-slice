const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applySliceSvgResult,
  applySliceTransparencyResult,
  createSliceTransparencyRestoreState,
  getSliceActiveImageDataUrl,
  getSliceTransparencyRestoreDataUrl,
  getSliceTransparencySourceDataUrl,
  getProcessedSliceResetMessage,
  hasProcessedSliceResult,
  isLockedAiCompleteAsset,
  restoreSliceSvgState,
  restoreSliceTransparencyState
} = require("../src/ui/state/slice-ai-state");

test("processed and locked AI slice checks preserve existing flags", () => {
  assert.equal(hasProcessedSliceResult({ aiTransparent: true }), true);
  assert.equal(hasProcessedSliceResult({ aiRedrawn: true }), true);
  assert.equal(hasProcessedSliceResult({ aiCompleted: true }), false);
  assert.equal(isLockedAiCompleteAsset({
    aiCompleted: true,
    aiCompletedDataUrl: "data:image/png;base64,abc",
    lastAiOperation: "complete"
  }), true);
  assert.equal(isLockedAiCompleteAsset({
    aiCompleted: true,
    aiCompletedDataUrl: "data:image/png;base64,abc",
    lastAiOperation: "backgroundRestore"
  }), true);
  assert.equal(isLockedAiCompleteAsset({
    aiCompleted: true,
    aiCompletedDataUrl: "data:image/png;base64,abc",
    lastAiOperation: "transparent"
  }), true);
  assert.equal(isLockedAiCompleteAsset({
    aiCompleted: true,
    aiCompletedDataUrl: "data:image/png;base64,abc",
    lastAiOperation: "redrawSvg"
  }), true);
});

test("getProcessedSliceResetMessage describes which processed results will reset", () => {
  assert.equal(
    getProcessedSliceResetMessage({ name: "logo", aiTransparent: true, aiRedrawn: true }),
    "“logo”已被透明化并转为 SVG，调整切图将取消透明和 SVG，是否继续？"
  );
  assert.equal(
    getProcessedSliceResetMessage({ name: "icon", aiTransparent: true }),
    "“icon”已被透明化，调整切图将取消透明，是否继续？"
  );
  assert.equal(
    getProcessedSliceResetMessage({ name: "mark", aiRedrawn: true }),
    "“mark”已被转为 SVG，调整切图将取消 SVG，是否继续？"
  );
  assert.equal(
    getProcessedSliceResetMessage({}),
    "“切图资产”已被处理，调整切图将取消处理结果，是否继续？"
  );
});

test("AI restored backgrounds use their current pixels for transparency and restore", () => {
  const asset = {
    dataUrl: "data:image/png;base64,AI_RESTORED_BACKGROUND",
    originalDataUrl: "data:image/png;base64,BEFORE_AI_RESTORE",
    aiCompleted: true,
    lastAiOperation: "backgroundRestore"
  };

  const sourceDataUrl = getSliceTransparencySourceDataUrl(asset);
  assert.equal(sourceDataUrl, "data:image/png;base64,AI_RESTORED_BACKGROUND");

  asset.transparencyRestoreDataUrl = sourceDataUrl;
  asset.dataUrl = "data:image/png;base64,TRANSPARENT";
  assert.equal(
    getSliceTransparencyRestoreDataUrl(asset),
    "data:image/png;base64,AI_RESTORED_BACKGROUND"
  );
  assert.equal(asset.originalDataUrl, "data:image/png;base64,BEFORE_AI_RESTORE");
});

test("legacy transparent assets still restore from originalDataUrl", () => {
  assert.equal(
    getSliceTransparencyRestoreDataUrl({
      dataUrl: "data:image/png;base64,TRANSPARENT",
      originalDataUrl: "data:image/png;base64,ORIGINAL"
    }),
    "data:image/png;base64,ORIGINAL"
  );
});

test("restoring transparency also restores the AI background processing state", () => {
  const asset = {
    dataUrl: "data:image/png;base64,AI_RESTORED_BACKGROUND",
    originalDataUrl: "data:image/png;base64,BEFORE_AI_RESTORE",
    aiCompleted: true,
    aiCompletedDataUrl: "data:image/png;base64,AI_RESTORED_BACKGROUND",
    lastAiOperation: "backgroundRestore",
    transparent: false,
    aiTransparent: false
  };
  asset.transparencyRestoreState = createSliceTransparencyRestoreState(asset);
  asset.dataUrl = "data:image/png;base64,TRANSPARENT";
  asset.aiCompleted = false;
  asset.lastAiOperation = "transparent";
  asset.transparent = true;
  asset.aiTransparent = true;

  assert.equal(restoreSliceTransparencyState(asset), true);
  assert.equal(asset.dataUrl, "data:image/png;base64,AI_RESTORED_BACKGROUND");
  assert.equal(asset.originalDataUrl, "data:image/png;base64,BEFORE_AI_RESTORE");
  assert.equal(asset.aiCompleted, true);
  assert.equal(asset.lastAiOperation, "backgroundRestore");
  assert.equal(asset.transparent, false);
  assert.equal(asset.aiTransparent, false);
  assert.equal("transparencyRestoreState" in asset, false);
});

test("applying transparency suspends SVG without losing an AI-completed background", () => {
  const asset = {
    dataUrl: "data:image/png;base64,AI_COMPLETE",
    aiCompleted: true,
    aiCompletedDataUrl: "data:image/png;base64,AI_COMPLETE",
    lastAiOperation: "backgroundRestore",
    svgData: "<svg id=\"before-transparent\"/>",
    aiRedrawn: true,
    aiRedrawnPlacement: { x: 1, y: 2, width: 30, height: 40 },
    placement: { x: 1, y: 2, width: 30, height: 40 }
  };

  applySliceTransparencyResult(asset, {
    dataUrl: "data:image/png;base64,AI_TRANSPARENT",
    ai: true
  });

  assert.equal(asset.aiCompleted, true);
  assert.equal(isLockedAiCompleteAsset(asset), true);
  assert.equal(asset.svgData, null);
  assert.equal(asset.aiRedrawn, false);
  assert.equal(asset.aiTransparent, true);
  assert.equal(asset.lastAiOperation, "transparent");

  restoreSliceTransparencyState(asset);
  assert.equal(asset.dataUrl, "data:image/png;base64,AI_COMPLETE");
  assert.equal(asset.svgData, "<svg id=\"before-transparent\"/>");
  assert.equal(asset.aiRedrawn, true);
  assert.deepEqual(asset.aiRedrawnPlacement, { x: 1, y: 2, width: 30, height: 40 });
  assert.equal(asset.lastAiOperation, "backgroundRestore");
  assert.equal(isLockedAiCompleteAsset(asset), true);
});

test("local transparency remains outside AI geometry protection and clears stale AI data", () => {
  const asset = {
    dataUrl: "data:image/png;base64,AI_TRANSPARENT",
    placement: { x: 0, y: 0, width: 20, height: 20 },
    transparent: true,
    aiTransparent: true,
    aiTransparentDataUrl: "data:image/png;base64,AI_TRANSPARENT",
    aiTransparentPlacement: { x: 0, y: 0, width: 20, height: 20 },
    lastAiOperation: "transparent",
    transparencyRestoreState: {
      dataUrl: "data:image/png;base64,BASE",
      aiCompleted: false,
      aiRedrawn: false,
      svgData: null,
      aiRedrawnPlacement: null,
      lastAiOperation: null
    }
  };

  applySliceTransparencyResult(asset, {
    dataUrl: "data:image/png;base64,LOCAL_TRANSPARENT",
    ai: false
  });

  assert.equal(asset.aiTransparent, false);
  assert.equal(asset.aiTransparentDataUrl, null);
  assert.equal(asset.aiTransparentPlacement, null);
  assert.equal(asset.lastAiOperation, null);
  assert.equal(hasProcessedSliceResult(asset), false);
});

test("local and AI SVG share one reversible state without stale AI flags", () => {
  const asset = {
    dataUrl: "data:image/png;base64,AI_COMPLETE",
    placement: { x: 0, y: 0, width: 40, height: 50 },
    aiCompleted: true,
    aiCompletedDataUrl: "data:image/png;base64,AI_COMPLETE",
    lastAiOperation: "complete"
  };

  applySliceSvgResult(asset, { svgData: "<svg id=\"ai\"/>", ai: true });
  assert.equal(asset.aiRedrawn, true);
  assert.equal(asset.lastAiOperation, "redrawSvg");
  assert.equal(isLockedAiCompleteAsset(asset), true);

  applySliceSvgResult(asset, { svgData: "<svg id=\"local\"/>", ai: false });
  assert.equal(asset.svgData, "<svg id=\"local\"/>");
  assert.equal(asset.aiRedrawn, false);
  assert.equal(asset.aiRedrawnPlacement, null);
  assert.equal(asset.lastAiOperation, "complete");
  assert.equal(hasProcessedSliceResult(asset), false);

  assert.equal(restoreSliceSvgState(asset), true);
  assert.equal(asset.svgData, null);
  assert.equal(asset.aiRedrawn, false);
  assert.equal(asset.lastAiOperation, "complete");
  assert.equal(isLockedAiCompleteAsset(asset), true);
});

test("active slice image uses SVG while SVG is active and raster otherwise", () => {
  assert.match(
    getSliceActiveImageDataUrl({
      dataUrl: "data:image/png;base64,RASTER",
      svgData: "<svg><rect width=\"1\" height=\"1\"/></svg>"
    }),
    /^data:image\/svg\+xml/
  );
  assert.equal(
    getSliceActiveImageDataUrl({
      dataUrl: "data:image/png;base64,RASTER",
      svgData: null
    }),
    "data:image/png;base64,RASTER"
  );
});
