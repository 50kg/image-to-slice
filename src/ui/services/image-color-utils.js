const imageColorClampNumber = typeof require === "function" ? require("./app-utils").clampNumber : clampNumber;

function toRgb(color) {
  return `${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}`;
}

function mixColors(a, b, weight = 0.5) {
  const amount = imageColorClampNumber(weight, 0, 1, 0.5);
  const inverse = 1 - amount;
  const color = {
    r: a.r * inverse + b.r * amount,
    g: a.g * inverse + b.g * amount,
    b: a.b * inverse + b.b * amount,
    luma: 0
  };
  color.luma = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  return color;
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => imageColorClampNumber(value, 0, 255, 0).toString(16).padStart(2, "0")).join("")}`;
}

function sampleEdgeStats(pixels, width, height) {
  const sideSamples = {
    top: [],
    right: [],
    bottom: [],
    left: []
  };
  const step = Math.max(1, Math.floor(Math.min(width, height) / 18));
  for (let x = 0; x < width; x += step) {
    sideSamples.top.push(getPixelColor(pixels, width, x, 0));
    sideSamples.bottom.push(getPixelColor(pixels, width, x, height - 1));
  }
  for (let y = 0; y < height; y += step) {
    sideSamples.left.push(getPixelColor(pixels, width, 0, y));
    sideSamples.right.push(getPixelColor(pixels, width, width - 1, y));
  }
  const samples = [
    ...sideSamples.top,
    ...sideSamples.right,
    ...sideSamples.bottom,
    ...sideSamples.left
  ].sort((a, b) => a.luma - b.luma);
  const start = Math.floor(samples.length * 0.2);
  const end = Math.max(start + 1, Math.ceil(samples.length * 0.8));
  const middleSamples = samples.slice(start, end);
  const color = averageColors(middleSamples);
  const variance = middleSamples.reduce((sum, sample) => {
    const distance = colorDistance(sample.r, sample.g, sample.b, color.r, color.g, color.b);
    return sum + distance * distance;
  }, 0) / middleSamples.length;
  return {
    color,
    variance,
    sides: {
      top: averageColors(sideSamples.top, color),
      right: averageColors(sideSamples.right, color),
      bottom: averageColors(sideSamples.bottom, color),
      left: averageColors(sideSamples.left, color)
    }
  };
}

function averageColors(samples, fallback = { r: 244, g: 246, b: 250, luma: 246 }) {
  if (!samples.length) {
    return fallback;
  }
  const total = samples.reduce(
    (sum, color) => ({
      r: sum.r + color.r,
      g: sum.g + color.g,
      b: sum.b + color.b
    }),
    { r: 0, g: 0, b: 0 }
  );
  const color = {
    r: total.r / samples.length,
    g: total.g / samples.length,
    b: total.b / samples.length,
    luma: 0
  };
  color.luma = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  return color;
}

function averageBackgroundColors(samples, fallback = { r: 244, g: 246, b: 250, luma: 246 }) {
  if (!samples.length) {
    return fallback;
  }
  const bySaturation = [...samples].sort((a, b) => a.saturation - b.saturation);
  const lowSaturationCount = Math.max(6, Math.ceil(bySaturation.length * 0.68));
  const backgroundCandidates = bySaturation.slice(0, lowSaturationCount).sort((a, b) => a.luma - b.luma);
  const start = Math.floor(backgroundCandidates.length * 0.12);
  const end = Math.max(start + 1, Math.ceil(backgroundCandidates.length * 0.88));
  return averageColors(backgroundCandidates.slice(start, end), fallback);
}

function sampleEdgeColor(pixels, width, height) {
  return sampleEdgeStats(pixels, width, height).color;
}

function getPixelColor(pixels, width, x, y) {
  const index = (y * width + x) * 4;
  const r = pixels[index];
  const g = pixels[index + 1];
  const b = pixels[index + 2];
  return {
    r,
    g,
    b,
    luma: 0.2126 * r + 0.7152 * g + 0.0722 * b,
    saturation: Math.max(r, g, b) - Math.min(r, g, b)
  };
}

function colorDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

if (typeof module !== "undefined") {
  module.exports = {
    averageBackgroundColors,
    averageColors,
    colorDistance,
    getPixelColor,
    mixColors,
    rgbToHex,
    sampleEdgeColor,
    sampleEdgeStats,
    toRgb
  };
}
