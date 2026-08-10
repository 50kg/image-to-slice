const { normalizeRadius } = require("./paint");

function createPluginDataAssetManifest(asset) {
  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    kind: asset.kind,
    placement: asset.placement,
    radius: normalizeRadius(asset.radius),
    ...(asset.radii && typeof asset.radii === "object" ? {
      radii: {
        topLeft: normalizeRadius(asset.radii.topLeft),
        topRight: normalizeRadius(asset.radii.topRight),
        bottomRight: normalizeRadius(asset.radii.bottomRight),
        bottomLeft: normalizeRadius(asset.radii.bottomLeft)
      }
    } : {}),
    transparent: Boolean(asset.transparent),
    selected: asset.selected !== false,
    hasSvg: Boolean(asset.svgData)
  };
}

module.exports = {
  createPluginDataAssetManifest
};
