function createAiInpaintResultPair({
  compositeAsset,
  compositeDataUrl,
  rawFullDataUrl,
  groupId,
  rawFullId
}) {
  const baseName = String(compositeAsset?.name || "切图")
    .replace(/_(?:局部合成|AI原图|AI完整图)$/, "");
  const composite = {
    ...compositeAsset,
    name: `${baseName}_局部合成`,
    dataUrl: compositeDataUrl,
    aiCompletedDataUrl: compositeDataUrl,
    selected: true,
    aiInpaintResultGroupId: groupId,
    aiInpaintResultRole: "composite"
  };
  delete composite.transparencyRestoreState;
  delete composite.transparencyRestoreDataUrl;
  delete composite.svgRestoreState;
  const createFullAsset = ({ id, name, dataUrl, role }) => {
    const asset = {
      ...composite,
      id,
      name,
      dataUrl,
      aiCompletedDataUrl: dataUrl,
      selected: true,
      aiInpaintResultRole: role,
      aiProcessing: false,
      aiProcessingLabel: "",
      aiProgressLogs: []
    };
    delete asset.aiCompleteSourceAssetId;
    delete asset.transparencyRestoreState;
    delete asset.transparencyRestoreDataUrl;
    delete asset.svgRestoreState;
    return asset;
  };
  const rawFull = createFullAsset({
    id: rawFullId,
    name: `${baseName}_AI原图`,
    dataUrl: rawFullDataUrl,
    role: "raw-full"
  });
  return { composite, rawFull };
}

function createAiCompleteEditableCopy({ sourceAsset, id, name }) {
  const sourceDataUrl = sourceAsset.originalDataUrl || sourceAsset.dataUrl;
  const copy = {
    ...sourceAsset,
    id,
    name,
    placement: { ...sourceAsset.placement },
    selected: true,
    aiCompleteSourceAssetId: sourceAsset.id,
    isAiProcessedVariant: false,
    processedResetConfirmed: false,
    aiProcessing: false,
    aiProcessingLabel: "",
    aiProgressLogs: [],
    originalDataUrl: sourceDataUrl,
    dataUrl: sourceDataUrl,
    transparentDataUrl: null,
    aiTransparentDataUrl: null,
    aiTransparentPlacement: null,
    aiCompletedDataUrl: null,
    aiCompletedPlacement: null,
    aiRedrawnPlacement: null,
    lastAiOperation: null,
    transparent: false,
    aiTransparent: false,
    aiCompleted: false,
    aiRedrawn: false,
    svgData: null
  };
  delete copy.aiInpaintResultGroupId;
  delete copy.aiInpaintResultRole;
  delete copy.transparencyRestoreState;
  delete copy.transparencyRestoreDataUrl;
  delete copy.svgRestoreState;
  return copy;
}

function getAiInpaintTypeLabel(asset) {
  if (!asset?.aiCompleted) return "";
  if (asset.aiInpaintResultRole === "composite") return "AI补齐·局部合成";
  if (asset.aiInpaintResultRole === "raw-full") return "AI补齐·原图";
  return "AI补齐";
}

if (typeof module !== "undefined") {
  module.exports = {
    createAiCompleteEditableCopy,
    createAiInpaintResultPair,
    getAiInpaintTypeLabel
  };
}
