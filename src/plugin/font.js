async function loadPreferredTextFont(text, fontStyle, loadFont) {
  const candidates = numericTextLooksLikeMetric(text)
    ? numericFontCandidates(fontStyle).concat(cjkFontCandidates(fontStyle))
    : cjkFontCandidates(fontStyle);
  candidates.push(
    { family: "Inter", style: fontStyle },
    { family: "Inter", style: "Regular" }
  );
  for (const candidate of candidates) {
    try {
      await loadFont(candidate);
      return candidate;
    } catch (error) {
      // Try the next installed font. Figma font availability differs by machine.
    }
  }
  await loadFont({ family: "Inter", style: "Regular" });
  return { family: "Inter", style: "Regular" };
}

function numericTextLooksLikeMetric(text) {
  const value = String(text || "").trim();
  return !!value && /^[¥￥$€£+\-−–—.,:/%()\s0-9]+$/.test(value) && /\d/.test(value);
}

function numericFontCandidates(fontStyle) {
  const style = fontStyle === "Bold" || fontStyle === "Semi Bold" ? "Bold" : "Regular";
  return [
    { family: "DIN Alternate", style },
    { family: "DIN Alternate", style: "Bold" },
    { family: "DIN Condensed", style: "Bold" },
    { family: "DIN 2014", style },
    { family: "D-DIN", style },
    { family: "Arial", style }
  ];
}

function cjkFontCandidates(fontStyle) {
  const pingFangStyle = fontStyle === "Bold" ? "Semibold" : fontStyle === "Semi Bold" ? "Semibold" : fontStyle;
  return [
    { family: "PingFang SC", style: pingFangStyle },
    { family: "PingFang SC", style: "Regular" },
    { family: "Microsoft YaHei", style: fontStyle === "Bold" ? "Bold" : "Regular" },
    { family: "Noto Sans CJK SC", style: fontStyle === "Bold" ? "Bold" : "Regular" },
    { family: "Source Han Sans SC", style: fontStyle === "Bold" ? "Bold" : "Regular" }
  ];
}

function fontStyleFromWeight(weight) {
  const numericWeight = Number(weight);
  if (numericWeight >= 700) {
    return "Bold";
  }
  if (numericWeight >= 600) {
    return "Semi Bold";
  }
  if (numericWeight >= 500) {
    return "Medium";
  }
  return "Regular";
}

module.exports = {
  loadPreferredTextFont,
  numericTextLooksLikeMetric,
  numericFontCandidates,
  cjkFontCandidates,
  fontStyleFromWeight
};
