const sliceRepairClampNumber = typeof require === "function" ? require("./app-utils").clampNumber : clampNumber;
const {
  averageBackgroundColors: sliceRepairAverageBackgroundColors,
  colorDistance: sliceRepairColorDistance,
  getPixelColor: sliceRepairGetPixelColor,
  mixColors: sliceRepairMixColors,
  toRgb: sliceRepairToRgb
} = typeof require === "function" ? require("./image-color-utils") : {
  averageBackgroundColors,
  colorDistance,
  getPixelColor,
  mixColors,
  toRgb
};

async function createSliceRepairPatch(dataUrl, placement) {
  const source = await loadImageElement(dataUrl);
  const patchWidth = Math.max(1, Math.round(placement.width));
  const patchHeight = Math.max(1, Math.round(placement.height));
  const canvas = document.createElement("canvas");
  canvas.width = patchWidth;
  canvas.height = patchHeight;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const edgeStats = sampleImmediatePlacementEdgeStats(source, placement);
  const background = edgeStats.color;
  const sides = edgeStats.sides || {
    top: background,
    right: background,
    bottom: background,
    left: background
  };
  const colorA = sliceRepairToRgb(sliceRepairMixColors(sides.left, sides.top, 0.42));
  const colorB = sliceRepairToRgb(sliceRepairMixColors(sides.right, sides.bottom, 0.42));
  paintEdgeBlendRepairPatch(context, patchWidth, patchHeight, sides, background);

  return {
    repairDataUrl: canvas.toDataURL("image/png"),
    repairBackground: `linear-gradient(135deg, rgba(${colorA}, 0.92), rgba(${colorB}, 0.94))`,
    repairMode: "edge-blend"
  };
}

function sampleImmediatePlacementEdgeStats(source, placement) {
  const naturalWidth = source.naturalWidth || source.width;
  const naturalHeight = source.naturalHeight || source.height;
  const x = sliceRepairClampNumber(Math.round(placement.x), 0, naturalWidth - 1, 0);
  const y = sliceRepairClampNumber(Math.round(placement.y), 0, naturalHeight - 1, 0);
  const width = sliceRepairClampNumber(Math.round(placement.width), 1, naturalWidth - x, 1);
  const height = sliceRepairClampNumber(Math.round(placement.height), 1, naturalHeight - y, 1);
  const band = Math.max(2, Math.min(10, Math.round(Math.min(width, height) * 0.12)));
  const canvas = document.createElement("canvas");
  canvas.width = naturalWidth;
  canvas.height = naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(source, 0, 0, naturalWidth, naturalHeight);

  const sideSamples = {
    top: collectRectColors(context, x, Math.max(0, y - band), width, Math.min(band, y)),
    right: collectRectColors(context, Math.min(naturalWidth - 1, x + width), y, Math.min(band, naturalWidth - x - width), height),
    bottom: collectRectColors(context, x, Math.min(naturalHeight - 1, y + height), width, Math.min(band, naturalHeight - y - height)),
    left: collectRectColors(context, Math.max(0, x - band), y, Math.min(band, x), height)
  };
  const allSamples = [
    ...sideSamples.top,
    ...sideSamples.right,
    ...sideSamples.bottom,
    ...sideSamples.left
  ];
  const color = sliceRepairAverageBackgroundColors(allSamples);
  const variance = allSamples.length
    ? allSamples.reduce((sum, sample) => {
        const distance = sliceRepairColorDistance(sample.r, sample.g, sample.b, color.r, color.g, color.b);
        return sum + distance * distance;
      }, 0) / allSamples.length
    : 0;
  return {
    color,
    variance,
    sides: {
      top: sliceRepairAverageBackgroundColors(sideSamples.top, color),
      right: sliceRepairAverageBackgroundColors(sideSamples.right, color),
      bottom: sliceRepairAverageBackgroundColors(sideSamples.bottom, color),
      left: sliceRepairAverageBackgroundColors(sideSamples.left, color)
    }
  };
}

function collectRectColors(context, x, y, width, height) {
  const rectWidth = Math.max(0, Math.floor(width));
  const rectHeight = Math.max(0, Math.floor(height));
  if (!rectWidth || !rectHeight) {
    return [];
  }
  const imageData = context.getImageData(Math.floor(x), Math.floor(y), rectWidth, rectHeight);
  const pixels = imageData.data;
  const samples = [];
  const step = Math.max(1, Math.floor(Math.sqrt((rectWidth * rectHeight) / 160)));
  for (let row = 0; row < rectHeight; row += step) {
    for (let col = 0; col < rectWidth; col += step) {
      samples.push(sliceRepairGetPixelColor(pixels, rectWidth, col, row));
    }
  }
  return samples;
}

function paintEdgeBlendRepairPatch(context, width, height, sides, center) {
  const imageData = context.createImageData(width, height);
  const pixels = imageData.data;
  const safeSides = {
    top: sides.top || center,
    right: sides.right || center,
    bottom: sides.bottom || center,
    left: sides.left || center
  };
  for (let y = 0; y < height; y += 1) {
    const verticalAmount = height <= 1 ? 0.5 : y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const horizontalAmount = width <= 1 ? 0.5 : x / (width - 1);
      const horizontal = sliceRepairMixColors(safeSides.left, safeSides.right, horizontalAmount);
      const vertical = sliceRepairMixColors(safeSides.top, safeSides.bottom, verticalAmount);
      const edgeBias = Math.min(x, y, width - 1 - x, height - 1 - y) / Math.max(width, height);
      const centerWeight = sliceRepairClampNumber(edgeBias * 1.35, 0, 0.32, 0);
      const blended = sliceRepairMixColors(sliceRepairMixColors(horizontal, vertical, 0.46), center, centerWeight);
      const index = (y * width + x) * 4;
      pixels[index] = Math.round(blended.r);
      pixels[index + 1] = Math.round(blended.g);
      pixels[index + 2] = Math.round(blended.b);
      pixels[index + 3] = 255;
    }
  }
  context.putImageData(imageData, 0, 0);
}

if (typeof module !== "undefined") {
  module.exports = {
    collectRectColors,
    createSliceRepairPatch,
    paintEdgeBlendRepairPatch,
    sampleImmediatePlacementEdgeStats
  };
}
