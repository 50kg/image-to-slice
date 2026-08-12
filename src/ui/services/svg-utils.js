function normalizeVectorSvg(svg, width, height) {
  const openTagMatch = svg.match(/<svg\b[^>]*>/);
  if (!openTagMatch) {
    throw new Error("SVG 生成失败");
  }
  const openTag = openTagMatch[0];
  const normalizedOpenTag = openTag
    .replace(/\s(?:width|height|viewbox)\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
    .replace("<svg", `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"`);
  return svg.replace(openTag, normalizedOpenTag);
}

if (typeof module !== "undefined") {
  module.exports = {
    normalizeVectorSvg
  };
}
