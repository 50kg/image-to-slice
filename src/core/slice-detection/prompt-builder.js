function buildSliceAssetDetectionPrompt({ width, height, sourceImageName }) {
  return [
    "Analyze the attached UI image and return only raster assets that should be preserved as PNG crops.",
    `Source image: ${sourceImageName || "source-ui.png"}.`,
    `All bbox values must use original ${width}x${height} image pixel coordinates. Do not normalize to 750px or percentages.`,
    "Allowed kind values, in this exact vocabulary: icon, avatar, illustration, photo, product-image, complex-decoration, complex-chart, logo.",
    "Return assets whose exact raster appearance cannot be reliably reconstructed as ordinary text or simple CSS shapes.",
    "A logo, badge, or illustration containing inseparable artistic text may be returned as one complete PNG crop.",
    "Do not return ordinary UI text, button backgrounds, cards, dividers, simple rectangles, circles, or layout containers.",
    "Do not merge visually independent assets merely because their boxes overlap. Preserve source reading order.",
    "Return one JSON object with this shape:",
    '{"assets":[{"name":"asset name","kind":"icon","bbox":{"x":0,"y":0,"width":8,"height":8},"confidence":0.0,"containsEmbeddedText":false,"reason":"why raster is required"}]}',
    "Return JSON only. Do not include Markdown or explanations outside the JSON object."
  ].join("\n");
}

function buildSliceAssetJsonRepairPrompt(rawText) {
  return [
    "Repair the following model output without adding, deleting, merging, or deduplicating asset entries.",
    "Return one valid JSON object only with an assets array and the original values whenever recoverable.",
    String(rawText || "")
  ].join("\n\n");
}

module.exports = {
  buildSliceAssetDetectionPrompt,
  buildSliceAssetJsonRepairPrompt
};
