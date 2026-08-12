const exportManifestSanitizeFilename = typeof require === "function" ? require("./app-utils").sanitizeFilename : sanitizeFilename;

function buildSliceExportManifest({
  manifest,
  activeImage,
  imageIndex,
  getSliceRadius,
  getSliceRadii
}) {
  const screen = manifest.screen;
  const usedFilenames = new Set();
  const assets = activeImage.sliceManifest.assets.map((asset, index) => {
    const basename = exportManifestSanitizeFilename(asset.name || `slice_${index + 1}`);
    let filename = `assets/${basename}.png`;
    let duplicateIndex = 2;
    while (usedFilenames.has(filename)) {
      filename = `assets/${basename}--${duplicateIndex}.png`;
      duplicateIndex += 1;
    }
    usedFilenames.add(filename);
    return {
      id: asset.id,
      name: asset.name,
      filename,
      svgFilename: asset.svgData ? filename.replace(/\.png$/, ".svg") : null,
      format: "png",
      formats: asset.svgData ? ["png", "svg"] : ["png"],
      transparent: Boolean(asset.transparent),
      aiTransparent: Boolean(asset.aiTransparent),
      aiRedrawn: Boolean(asset.aiRedrawn),
      hasOriginalRaster: Boolean(asset.originalDataUrl),
      selectedImageIndex: imageIndex,
      radius: getSliceRadius(asset),
      ...(typeof getSliceRadii === "function" && asset.radii
        ? { radii: { ...getSliceRadii(asset) } }
        : {}),
      placement: { ...asset.placement }
    };
  });
  return {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    sourcePrompt: manifest.sourcePrompt || "",
    selectedImageIndex: imageIndex,
    screen: {
      name: screen.name,
      width: screen.width,
      height: screen.height
    },
    assets
  };
}

function buildDownloadFilename(index) {
  const paddedIndex = String(index + 1).padStart(2, "0");
  return `gpt-image-${paddedIndex}.png`;
}

function createScreenFromResultImage(image, fallback) {
  const width = Math.round(image?.naturalWidth || fallback.width);
  const height = Math.round(image?.naturalHeight || fallback.height);
  return {
    name: fallback.name,
    width,
    height
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    buildDownloadFilename,
    buildSliceExportManifest,
    createScreenFromResultImage
  };
}
