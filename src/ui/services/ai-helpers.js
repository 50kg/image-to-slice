function createAiProgressId(prefix = "ai") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function formatAiRedrawError(status, message) {
  if (status === 404) {
    return "后端没有 AI 重绘 SVG 接口，请停止旧的 npm run api 后重新启动";
  }
  return message || `AI 重绘接口失败：${status}`;
}

function buildAiRedrawPrompt(asset) {
  const width = asset?.placement?.width || 512;
  const height = asset?.placement?.height || 512;
  return [
    `Vectorize this sliced UI icon asset as an editable SVG named "${asset?.name || "ui_asset"}".`,
    "Use the attached PNG as the only source of truth. The result should look carefully traced and vectorized, not redesigned.",
    "Core principles: 1:1 similarity first, faithful restoration first, no redesign, no style change, no key-structure simplification, no added elements, no generic replacement icon.",
    "Silently analyze the icon type, main contour blocks, subject position, scale, padding, direction, tilt, visual weight, asymmetry, internal highlights, shadows, facets, cutouts, lines, decoration, layer order, and color relationships.",
    "The outer silhouette is mandatory and must closely match the source. Preserve rounded corners, sharp corners, concave/convex areas, notches, tilt, asymmetry, and special curves.",
    "For abstract icons and symbols, prioritize geometric contour accuracy over illustration style. Do not round, blobify, inflate, smooth, or regularize the shape unless the source does.",
    "Keep only details actually present in the source. Preserve highlight and gradient placement, internal white/negative shapes, shadow strength, detail size, angle, and layer order.",
    "Clean only screenshot noise, blur, compression artifacts, background contamination, and neighboring UI fragments.",
    "Match source colors, gradient direction, opacity, highlights, and dark areas. If the source is flat color, keep it flat.",
    "Use editable path/circle/rect/ellipse/polygon/line/g/defs/linearGradient/radialGradient/mask/clipPath elements. Prefer Bezier paths for main contours.",
    "Do not embed raster images, base64, external href, HTML, foreignObject, CSS imports, script, or animation.",
    `Return raw SVG only. Transparent background. Use viewBox: 0 0 ${width} ${height}. Preserve the original crop padding and do not arbitrarily fill the canvas.`
  ].join("\n");
}

function buildAiTransparentPrompt() {
  return [
    "Use the attached image as the only source of truth.",
    "Only remove the background and make it transparent.",
    "Preserve the subject's shape, colors, proportions, angle, shadows, antialiased edges, composition, and canvas size exactly.",
    "Do not redraw, regenerate, complete, replace, crop, resize, reposition, recolor, or add anything.",
    "Output one transparent PNG with the original canvas dimensions."
  ].join("\n");
}

function buildAiCompletePrompt(asset, regions) {
  const localRegions = regions.map((region) => ({
    x: Math.round(region.x - asset.placement.x),
    y: Math.round(region.y - asset.placement.y),
    width: Math.round(region.width),
    height: Math.round(region.height)
  }));
  return [
    `Restore the background hidden by foreground UI slices in the image named "${asset?.name || "ui_asset"}".`,
    "Reference image 1 is the current slice with the reconstruction area already cleared to transparent pixels.",
    "Reference image 2 is a black-and-white mask aligned pixel-for-pixel with image 1. Reconstruct only the white pixels; black pixels are context and must remain unchanged.",
    `Only reconstruct these slice-local rectangles: ${JSON.stringify(localRegions)}.`,
    "Inside those rectangles, remove the overlapping foreground elements and infer the original background from the surrounding pixels, continuing colors, textures, gradients, lighting, perspective, and background details naturally.",
    "Match the protected source pixels' white balance, color temperature, tint, exposure, gamma, contrast, saturation, black point, and white point exactly.",
    "Do not apply global relighting, HDR, auto-enhancement, cinematic grading, sharpening, or color styling.",
    "Outside those rectangles, reproduce the input pixels unchanged. Do not redesign, crop, resize, reposition, sharpen, recolor, or add any object or text.",
    "Return one image at the same canvas size and preserve the original background and opacity. Avoid seams, halos, duplicated elements, or rectangular patch edges."
  ].join("\n");
}

function buildBackgroundRestorePrompt(background) {
  const width = Math.max(1, Math.round(Number(background?.bbox?.width) || 1));
  const height = Math.max(1, Math.round(Number(background?.bbox?.height) || 1));
  const bakedVisuals = (Array.isArray(background?.bakedVisuals) ? background.bakedVisuals : [])
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
  const regions = (Array.isArray(background?.regions) ? background.regions : []).map((region) => ({
    x: Math.round(Number(region.x) || 0),
    y: Math.round(Number(region.y) || 0),
    width: Math.max(1, Math.round(Number(region.width) || 1)),
    height: Math.max(1, Math.round(Number(region.height) || 1))
  }));
  return [
    `Restore the complete reusable UI background named "${background?.name || "complete_background"}".`,
    "Reference image 1 is the original background crop with confirmed interface-overlay areas already cleared to transparent pixels.",
    "Reference image 2 is a black-and-white mask aligned pixel-for-pixel with image 1. Reconstruct only the white pixels; black pixels are protected source pixels.",
    `The following baked visual content is part of the background and must remain unchanged: ${bakedVisuals.length ? bakedVisuals.join("; ") : "all unmasked artwork, artistic text, integrated branding, scenery, and decoration"}.`,
    `Only reconstruct these slice-local rectangles: ${JSON.stringify(regions)}.`,
    "Remove only the confirmed foreground interface overlays inside those rectangles. Continue the underlying texture, illustration, lighting, perspective, borders, and decorative details naturally.",
    "Match the protected source pixels' white balance, color temperature, tint, exposure, gamma, contrast, saturation, black point, and white point exactly.",
    "Do not apply global relighting, HDR, auto-enhancement, cinematic grading, sharpening, or color styling.",
    "Outside those rectangles, reproduce the input pixels unchanged. Do not remove or rewrite artistic text, calligraphy, integrated branding, illustrations, products, scenery, or decoration.",
    `Return one image at the same ${width}x${height} canvas size. Avoid seams, halos, duplicated controls, or rectangular patch edges.`
  ].join("\n");
}

if (typeof module !== "undefined") {
  module.exports = {
    buildAiCompletePrompt,
    buildAiRedrawPrompt,
    buildAiTransparentPrompt,
    buildBackgroundRestorePrompt,
    createAiProgressId,
    formatAiRedrawError
  };
}
