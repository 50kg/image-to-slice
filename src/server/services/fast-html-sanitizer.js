function sanitizeFastGeneratedHtml(html, referenceAssets = [], dimensions = {}) {
  const previewWidth = positiveNumber(dimensions.previewWidth, 1);
  const previewHeight = positiveNumber(dimensions.previewHeight, 1);
  const sourceWidth = positiveNumber(dimensions.sourceWidth, previewWidth);
  const sourceHeight = positiveNumber(dimensions.sourceHeight, previewHeight);
  const scaleX = previewWidth / sourceWidth;
  const scaleY = previewHeight / sourceHeight;
  const assets = new Map(referenceAssets.map((asset) => [String(asset?.id || ""), asset]).filter(([id]) => id));
  const seen = new Set();

  let safe = sanitizeGeneratedCss(String(html || ""));
  safe = removeExecutableElements(safe)
    .replace(/<(?:link|base)\b[^>]*>/gi, "")
    .replace(/<meta\b[^>]*>/gi, (tag) => (
      readHtmlAttribute(tag, "http-equiv").toLowerCase() === "refresh" ? "" : tag
    ))
    .replace(/\son[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");
  safe = sanitizeGeneratedUrlAttributes(safe);

  safe = safe.replace(/<img\b[^>]*>/gi, (tag) => {
    const id = readHtmlAttribute(tag, "data-reference-asset");
    const asset = assets.get(id);
    if (!asset || seen.has(id)) {
      return "";
    }
    seen.add(id);
    return buildTrustedAssetTag(asset, tag);
  });
  safe = ensureFastPreviewShell(safe);

  const missingAssets = referenceAssets.filter((asset) => asset?.id && asset?.placement && !seen.has(String(asset.id)));
  const fallbackRules = [];
  if (missingAssets.length) {
    const fallbackTags = missingAssets.map((asset, index) => {
      const className = `plugin-reference-fallback-${index + 1}`;
      fallbackRules.push(buildFallbackAssetRule(asset, className, scaleX, scaleY));
      return buildFallbackAssetTag(asset, className);
    }).join("\n");
    safe = injectAfterScreenOpen(safe, `\n${fallbackTags}\n`);
    missingAssets.forEach((asset) => seen.add(String(asset.id)));
  }

  const guardStyle = [
    "<style data-fast-preview-guard>",
    "html,body{margin:0;padding:0;background:#eef0f4;}",
    "body{min-height:100vh;display:flex;justify-content:center;align-items:flex-start;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Arial,\"PingFang SC\",\"Microsoft YaHei\",sans-serif;}",
    "*{box-sizing:border-box;}",
    `.screen{width:${previewWidth}px!important;min-width:${previewWidth}px!important;height:${previewHeight}px!important;min-height:${previewHeight}px!important;max-width:none;overflow:hidden;position:relative;flex:0 0 auto!important;padding:0!important;border:0!important;transform:none!important;}`,
    "img{display:block;}",
    ".screen [data-reference-asset]{position:absolute!important;object-fit:contain!important;object-position:center!important;background:transparent!important;}",
    ...fallbackRules,
    "</style>"
  ].join("");
  safe = injectIntoHead(safe, guardStyle);

  return {
    html: safe,
    missingReferenceAnchorCount: missingAssets.length,
    referenceAnchorCount: seen.size,
    qualityWarnings: missingAssets.length
      ? [`模型遗漏 ${missingAssets.length} 个切图锚点，已按人工坐标补入。`]
      : []
  };
}

function sanitizeGeneratedCss(html) {
  let safe = String(html || "").replace(
    /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
    (_match, attributes, css) => `<style${attributes}>${sanitizeCssText(css)}</style>`
  );
  safe = safe.replace(
    /(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/gi,
    (_match, prefix, quote, css) => `${prefix}${quote}${sanitizeCssText(css)}${quote}`
  );
  return safe;
}

function sanitizeCssText(css) {
  return String(css || "")
    .replace(/@import\s+(?:url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)|"[^"]*"|'[^']*')[^;]*;?/gi, "")
    .replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi, (_match, doubleQuoted, singleQuoted, unquoted) => {
      const value = String(doubleQuoted || singleQuoted || unquoted || "").trim();
      return value.startsWith("#") ? `url(${value})` : "none";
    });
}

function removeExecutableElements(html) {
  const blockedElements = [
    "script",
    "iframe",
    "object",
    "embed",
    "applet",
    "portal",
    "frame",
    "frameset",
    "foreignObject",
    "animate",
    "animateMotion",
    "animateTransform",
    "set"
  ];
  return blockedElements.reduce((safe, tagName) => {
    const escapedName = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return safe
      .replace(new RegExp(`<${escapedName}\\b[^>]*>[\\s\\S]*?<\\/${escapedName}\\s*>`, "gi"), "")
      .replace(new RegExp(`<${escapedName}\\b[^>]*\\/?>`, "gi"), "")
      .replace(new RegExp(`<\\/${escapedName}\\s*>`, "gi"), "");
  }, String(html || ""));
}

function sanitizeGeneratedUrlAttributes(html) {
  return String(html || "").replace(/<[a-z][\w:-]*\b[^>]*>/gi, (tag) => {
    const withoutResourceAttributes = tag.replace(
      /\s(?:src|srcset|href|xlink:href|action|formaction|poster|data|ping)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      (attribute, doubleQuoted, singleQuoted, unquoted) => {
        const name = attribute.trimStart().split(/\s*=/, 1)[0].toLowerCase();
        const value = String(doubleQuoted || singleQuoted || unquoted || "").trim();
        if ((name === "href" || name === "xlink:href") && value.startsWith("#")) {
          return attribute;
        }
        return "";
      }
    );
    return withoutResourceAttributes.replace(
      /(\s(?:fill|stroke|filter|clip-path|mask|marker-start|marker-mid|marker-end)\s*=\s*)(["'])([\s\S]*?)\2/gi,
      (_attribute, prefix, quote, value) => `${prefix}${quote}${sanitizeCssText(value)}${quote}`
    );
  });
}

function ensureFastPreviewShell(html) {
  const canonicalShell = /<[a-z][\w:-]*\b[^>]*class\s*=\s*(["'])[^"']*\bfit-shell\b[^"']*\1[^>]*>\s*<[a-z][\w:-]*\b[^>]*class\s*=\s*(["'])[^"']*\bfit-box\b[^"']*\2[^>]*>\s*<[a-z][\w:-]*\b[^>]*class\s*=\s*(["'])[^"']*\bscreen\b[^"']*\3[^>]*>/i;
  if (canonicalShell.test(html)) return html;

  const screenOpen = /<([a-z][\w:-]*)\b[^>]*class\s*=\s*(["'])[^"']*\bscreen\b[^"']*\2[^>]*>/i;
  const opening = screenOpen.exec(html);
  if (!opening || /\/\s*>$/.test(opening[0])) return html;

  const tagName = opening[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = opening.index + opening[0].length;
  let depth = 1;
  let closingEnd = -1;
  let match;
  while ((match = tagPattern.exec(html))) {
    if (/^<\//.test(match[0])) {
      depth -= 1;
      if (depth === 0) {
        closingEnd = tagPattern.lastIndex;
        break;
      }
    } else if (!/\/\s*>$/.test(match[0])) {
      depth += 1;
    }
  }
  if (closingEnd < 0) return html;

  return [
    html.slice(0, opening.index),
    '<main class="fit-shell"><div class="fit-box">',
    html.slice(opening.index, closingEnd),
    "</div></main>",
    html.slice(closingEnd)
  ].join("");
}

function buildTrustedAssetTag(asset, originalTag) {
  const className = sanitizeHtmlClassList(readHtmlAttribute(originalTag, "class"));
  const alt = readHtmlAttribute(originalTag, "alt") || asset.name || asset.id || "reference_asset";
  const classAttribute = className ? ` class="${escapeHtmlAttribute(className)}"` : "";
  return `<img${classAttribute} src="asset:${escapeHtmlAttribute(asset.id)}" alt="${escapeHtmlAttribute(alt)}" data-reference-asset="${escapeHtmlAttribute(asset.id)}">`;
}

function buildFallbackAssetTag(asset, className) {
  const id = escapeHtmlAttribute(asset.id || "");
  const alt = escapeHtmlAttribute(asset.name || asset.id || "reference_asset");
  return `<img class="plugin-reference-fallback ${className}" src="asset:${id}" alt="${alt}" data-reference-asset="${id}">`;
}

function buildFallbackAssetRule(asset, className, scaleX, scaleY) {
  const placement = asset.placement || {};
  const left = Math.round(Number(placement.x || 0) * scaleX);
  const top = Math.round(Number(placement.y || 0) * scaleY);
  const width = Math.max(1, Math.round(Number(placement.width || 1) * scaleX));
  const height = Math.max(1, Math.round(Number(placement.height || 1) * scaleY));
  const radius = Math.max(0, Math.round(Number(asset.radius || 0) * Math.min(scaleX, scaleY)));
  return `.${className}{position:absolute!important;left:${left}px!important;top:${top}px!important;width:${width}px!important;height:${height}px!important;border-radius:${radius}px!important;object-fit:contain!important;z-index:900;}`;
}

function sanitizeHtmlClassList(value) {
  return String(value || "")
    .split(/\s+/)
    .filter((token) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(token))
    .join(" ");
}

function readHtmlAttribute(tag, name) {
  const escapedName = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(tag || "").match(new RegExp(`\\s${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return String(match?.[1] || match?.[2] || match?.[3] || "").trim();
}

function injectAfterScreenOpen(html, payload) {
  const screenOpen = /(<[^>]+class=(["'])[^"']*\bscreen\b[^"']*\2[^>]*>)/i;
  if (screenOpen.test(html)) {
    return html.replace(screenOpen, `$1${payload}`);
  }
  if (/<body\b[^>]*>/i.test(html)) {
    return html.replace(/<body\b([^>]*)>/i, `<body$1>${payload}`);
  }
  return `${payload}${html}`;
}

function injectIntoHead(html, payload) {
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b([^>]*)>/i, `<head$1><meta charset="UTF-8">${payload}`);
  }
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b([^>]*)>/i, `<html$1><head><meta charset="UTF-8">${payload}</head>`);
  }
  return `<!doctype html><html><head><meta charset="UTF-8">${payload}</head><body>${html}</body></html>`;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function escapeHtmlAttribute(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

module.exports = {
  sanitizeFastGeneratedHtml
};
