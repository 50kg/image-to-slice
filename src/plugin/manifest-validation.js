function validateManifest(manifest) {
  if (!manifest || !manifest.screen || !manifest.previewImage) {
    throw new Error("缺少 screen 或 previewImage 数据");
  }

  if (!Number.isFinite(manifest.screen.width) || !Number.isFinite(manifest.screen.height)) {
    throw new Error("screen.width 和 screen.height 必须是数字");
  }

  if (!Array.isArray(manifest.assets)) {
    throw new Error("assets 必须是数组");
  }

  for (const asset of manifest.assets) {
    if (!asset.name || !asset.placement || (!asset.dataUrl && !asset.svgData)) {
      throw new Error("每个 asset 必须包含 name、placement、dataUrl 或 svgData");
    }

    const placement = asset.placement;
    const fields = [placement.x, placement.y, placement.width, placement.height];
    if (fields.some((value) => !Number.isFinite(value))) {
      throw new Error(`asset ${asset.name} 的 placement 坐标必须是数字`);
    }
  }
}

function validateEditableDesignManifest(manifest) {
  if (!manifest || !manifest.screen) {
    throw new Error("缺少 editable design screen 数据");
  }
  if (!Number.isFinite(manifest.screen.width) || !Number.isFinite(manifest.screen.height)) {
    throw new Error("editable design screen.width 和 screen.height 必须是数字");
  }
  if (!Array.isArray(manifest.nodes)) {
    throw new Error("editable design nodes 必须是数组");
  }
}

module.exports = {
  validateManifest,
  validateEditableDesignManifest
};
