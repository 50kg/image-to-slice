async function loadPreferredTextFont(text, fontStyle, loadFont) {
  const candidates = cjkFontCandidates(fontStyle);
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

function cjkFontCandidates(fontStyle) {
  const pingFangStyle = fontStyle === "Bold" ? "Semibold" : fontStyle === "Semi Bold" ? "Semibold" : fontStyle;
  const notoStyle = fontStyle === "Semi Bold" ? "SemiBold" : fontStyle;
  return [
    { family: "PingFang SC", style: pingFangStyle },
    { family: "PingFang SC", style: "Regular" },
    { family: "Microsoft YaHei", style: fontStyle === "Bold" ? "Bold" : "Regular" },
    { family: "Noto Sans SC", style: notoStyle },
    { family: "Noto Sans SC", style: "Regular" },
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
  cjkFontCandidates,
  fontStyleFromWeight
};
