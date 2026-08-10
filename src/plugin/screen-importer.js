const {
  validateManifest,
  validateEditableDesignManifest
} = require("./manifest-validation");
const { createEditableFills } = require("./paint");
const { createPluginDataAssetManifest } = require("./asset-manifest");
const { findEmptyImportPosition } = require("./import-position");
const {
  createImageRectangle,
  createAssetNode
} = require("./asset-node");
const { createEditableNode } = require("./editable-node");
const { markEditableDesignFrame } = require("./figma-frame-serializer");

async function createUiAssetScreen({ figmaApi, atob, notifyRecoverableError, manifest }) {
  validateManifest(manifest);

  const importPosition = findImportPosition(figmaApi, manifest.screen.width, manifest.screen.height);
  const frame = figmaApi.createFrame();
  try {
    frame.name = manifest.screen.name || "ai_generated_app_screen";
    frame.resize(manifest.screen.width, manifest.screen.height);
    frame.x = importPosition.x;
    frame.y = importPosition.y;
    frame.clipsContent = false;
    frame.fills = [{ type: "SOLID", color: { r: 0.96, g: 0.97, b: 0.98 } }];

    const preview = await createImageRectangle({
      figmaApi,
      atob,
      name: "preview_full_ui_reference",
      imageDataUrl: manifest.previewImage.dataUrl,
      width: manifest.screen.width,
      height: manifest.screen.height
    });
    preview.locked = true;
    frame.appendChild(preview);

    const selectedAssets = manifest.assets.filter((asset) => asset.selected !== false);
    for (const asset of selectedAssets) {
      const node = await createAssetNode({
        figmaApi,
        atob,
        notifyRecoverableError,
        asset
      });
      node.x = asset.placement.x;
      node.y = asset.placement.y;
      const useSvgExport = Boolean(asset.svgData && node.type !== "RECTANGLE");
      node.exportSettings = [
        useSvgExport
          ? { format: "SVG" }
          : { format: "PNG", constraint: { type: "SCALE", value: 1 } }
      ];
      node.setPluginData("assetManifest", JSON.stringify(createPluginDataAssetManifest(asset)));
      frame.appendChild(node);
    }

    figmaApi.currentPage.selection = [frame];
    figmaApi.viewport.scrollAndZoomIntoView([frame]);
  } catch (error) {
    if (!frame.removed) frame.remove();
    throw error;
  }
}

async function createEditableDesignScreen({
  figmaApi,
  atob,
  manifest,
  batchSize = 50,
  yieldControl = () => new Promise((resolve) => setTimeout(resolve, 0)),
  onProgress,
  createNode = createEditableNode
}) {
  validateEditableDesignManifest(manifest);

  const designName = manifest.screen.name || "editable_design_experiment";
  const hasSourceReference = Boolean(manifest.sourceImage && manifest.sourceImage.dataUrl);
  const importWidth = manifest.screen.width * (hasSourceReference ? 2 : 1) + (hasSourceReference ? 48 : 0);
  const importPosition = findImportPosition(figmaApi, importWidth, manifest.screen.height);
  const frame = figmaApi.createFrame();
  let reference = null;
  let createdCount = 0;
  let processedCount = 0;
  const skipped = [];
  const createdEntries = [];
  const groupWarnings = [];
  let groupedCount = 0;
  try {
    frame.name = designName;
    frame.resize(manifest.screen.width, manifest.screen.height);
    frame.x = importPosition.x;
    frame.y = importPosition.y;
    frame.clipsContent = Boolean(manifest.screen.clipsContent);
    frame.fills = createEditableFills(manifest.screen, "#F7F8FA");
    markEditableDesignFrame(frame, manifest);

    const definitions = manifest.nodes || [];
    const normalizedBatchSize = Math.max(1, Number(batchSize) || 50);
    for (let start = 0; start < definitions.length; start += normalizedBatchSize) {
      const batch = definitions.slice(start, start + normalizedBatchSize);
      for (const definition of batch) {
        const pageChildrenBefore = new Set(figmaApi.currentPage.children);
        try {
          const node = await createNode({
            figmaApi,
            atob,
            definition
          });
          frame.appendChild(node);
          createdEntries.push({ definition, node });
          createdCount += 1;
        } catch (error) {
          for (const candidate of figmaApi.currentPage.children) {
            if (
              !pageChildrenBefore.has(candidate)
              && candidate !== frame
              && !candidate.removed
            ) {
              candidate.remove();
            }
          }
          skipped.push({
            name: String(definition.name || definition.type || "editable_node"),
            reason: error?.message || String(error)
          });
        }
        processedCount += 1;
      }
      onProgress?.({
        createdCount,
        processedCount,
        totalCount: definitions.length,
        skippedCount: skipped.length
      });
      if (processedCount < definitions.length) {
        await yieldControl();
      }
    }

    const semanticGroups = new Map();
    for (const entry of createdEntries) {
      const semanticGroupId = String(entry.definition.semanticGroupId || "").trim();
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(semanticGroupId)) continue;
      if (!semanticGroups.has(semanticGroupId)) {
        semanticGroups.set(semanticGroupId, {
          name: String(entry.definition.semanticGroupName || semanticGroupId).trim().slice(0, 80) || semanticGroupId,
          nodes: []
        });
      }
      semanticGroups.get(semanticGroupId).nodes.push(entry.node);
    }
    for (const [semanticGroupId, semanticGroup] of semanticGroups) {
      if (semanticGroup.nodes.length < 2) continue;
      try {
        const group = figmaApi.group(semanticGroup.nodes, frame);
        group.name = semanticGroup.name;
        groupedCount += 1;
      } catch (error) {
        groupWarnings.push({
          id: semanticGroupId,
          reason: error?.message || String(error)
        });
      }
    }

    const createdNodes = [frame];
    if (hasSourceReference) {
      reference = await createImageRectangle({
        figmaApi,
        atob,
        name: `${designName}-参考原图`,
        imageDataUrl: manifest.sourceImage.dataUrl,
        width: manifest.screen.width,
        height: manifest.screen.height
      });
      reference.x = frame.x + manifest.screen.width + 48;
      reference.y = frame.y;
      figmaApi.currentPage.appendChild(reference);
      createdNodes.push(reference);
    }

    figmaApi.currentPage.selection = [frame];
    figmaApi.viewport.scrollAndZoomIntoView(createdNodes);
    return { createdCount, skipped, groupedCount, groupWarnings };
  } catch (error) {
    if (reference && !reference.removed) reference.remove();
    if (!frame.removed) frame.remove();
    throw error;
  }
}

function findImportPosition(figmaApi, width, height) {
  return findEmptyImportPosition(figmaApi.currentPage.children, figmaApi.viewport.center, width, height);
}

module.exports = {
  createUiAssetScreen,
  createEditableDesignScreen,
  findImportPosition
};
