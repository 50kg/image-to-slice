const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createAiCompleteEditableCopy,
  createAiInpaintResultPair,
  getAiInpaintTypeLabel
} = require("../src/ui/services/ai-inpaint-results");

test("AI inpaint produces raw and locally composited slice assets", () => {
  const source = {
    id: "background",
    name: "完整背景",
    dataUrl: "data:image/png;base64,SOURCE",
    originalDataUrl: "data:image/png;base64,ORIGINAL",
    placement: { x: 10, y: 20, width: 300, height: 200 },
    selected: true,
    aiCompleted: true,
    aiProcessing: true,
    aiCompleteSourceAssetId: "old-source",
    svgRestoreState: {
      svgData: "<svg/>",
      aiRedrawn: true,
      lastAiOperation: "redrawSvg"
    }
  };

  const pair = createAiInpaintResultPair({
    compositeAsset: source,
    compositeDataUrl: "data:image/png;base64,COMPOSITE",
    rawFullDataUrl: "data:image/png;base64,RAW",
    groupId: "group-2",
    rawFullId: "background-raw"
  });

  assert.equal(pair.composite.id, "background");
  assert.equal(pair.composite.name, "完整背景_局部合成");
  assert.equal(pair.composite.dataUrl, "data:image/png;base64,COMPOSITE");
  assert.equal(pair.composite.selected, true);
  assert.equal(pair.composite.aiInpaintResultGroupId, "group-2");
  assert.equal(pair.composite.aiInpaintResultRole, "composite");
  assert.equal("svgRestoreState" in pair.composite, false);

  assert.equal(pair.rawFull.id, "background-raw");
  assert.equal(pair.rawFull.name, "完整背景_AI原图");
  assert.equal(pair.rawFull.dataUrl, "data:image/png;base64,RAW");
  assert.equal(pair.rawFull.aiInpaintResultRole, "raw-full");
  assert.equal(pair.rawFull.aiProcessing, false);
  assert.equal("aiCompleteSourceAssetId" in pair.rawFull, false);
  assert.equal("svgRestoreState" in pair.rawFull, false);
  assert.equal(source.name, "完整背景");
});

test("AI inpaint result roles expose distinct slice-list type labels", () => {
  assert.equal(getAiInpaintTypeLabel({
    aiCompleted: true,
    aiInpaintResultRole: "composite"
  }), "AI补齐·局部合成");
  assert.equal(getAiInpaintTypeLabel({
    aiCompleted: true,
    aiInpaintResultRole: "raw-full"
  }), "AI补齐·原图");
  assert.equal(getAiInpaintTypeLabel({ aiCompleted: true }), "AI补齐");
  assert.equal(getAiInpaintTypeLabel({ aiCompleted: false }), "");
});

test("moving an AI complete result creates an ordinary copy from the pre-repair image", () => {
  const source = {
    id: "background-full",
    name: "完整背景_AI完整图",
    dataUrl: "data:image/png;base64,FULL",
    originalDataUrl: "data:image/png;base64,ORIGINAL",
    placement: { x: 10, y: 20, width: 300, height: 200 },
    selected: true,
    aiCompleted: true,
    aiCompletedDataUrl: "data:image/png;base64,FULL",
    lastAiOperation: "backgroundRestore",
    svgRestoreState: {
      svgData: "<svg/>",
      aiRedrawn: true,
      lastAiOperation: "redrawSvg"
    },
    aiInpaintResultGroupId: "group-2",
    aiInpaintResultRole: "full"
  };

  const copy = createAiCompleteEditableCopy({
    sourceAsset: source,
    id: "background-full-editable",
    name: "完整背景_原始图副本"
  });

  assert.equal(copy.id, "background-full-editable");
  assert.equal(copy.name, "完整背景_原始图副本");
  assert.equal(copy.dataUrl, "data:image/png;base64,ORIGINAL");
  assert.equal(copy.originalDataUrl, "data:image/png;base64,ORIGINAL");
  assert.equal(copy.aiCompleteSourceAssetId, "background-full");
  assert.equal(copy.aiCompleted, false);
  assert.equal(copy.aiCompletedDataUrl, null);
  assert.equal(copy.lastAiOperation, null);
  assert.equal("aiInpaintResultGroupId" in copy, false);
  assert.equal("aiInpaintResultRole" in copy, false);
  assert.equal("svgRestoreState" in copy, false);

  assert.equal(source.dataUrl, "data:image/png;base64,FULL");
  assert.equal(source.aiInpaintResultRole, "full");
});
