const fs = require("node:fs");
const path = require("node:path");

const STYLE_PLACEHOLDER = "/* __UI_STYLES__ */";
const CAPTURE_RUNTIME_PLACEHOLDER = "/* __WEB_TO_FIGMA_CAPTURE_RUNTIME__ */";
const VENDOR_SCRIPT_PLACEHOLDER = "/* __UI_VENDOR_SCRIPTS__ */";
const APP_SCRIPT_PLACEHOLDER = "/* __UI_APP_SCRIPT__ */";

const DEFAULT_CAPTURE_RUNTIME_PATHS = [
  path.join("src", "vendor", "figma-capture.js")
];

const DEFAULT_VENDOR_SCRIPT_PATHS = [
  path.join("src", "vendor", "imagetracer.js")
];

const DEFAULT_APP_SCRIPT_PATHS = [
  // Shared UI helpers and pure business utilities.
  path.join("src", "core", "ai-image-dimensions.js"),
  path.join("src", "core", "slice-asset-name.js"),
  path.join("src", "ui", "services", "app-utils.js"),
  path.join("src", "ui", "services", "canvas-viewport.js"),
  path.join("src", "ui", "services", "ai-helpers.js"),
  path.join("src", "ui", "services", "ai-inpaint.js"),
  path.join("src", "ui", "services", "ai-inpaint-results.js"),
  path.join("src", "ui", "services", "slice-geometry.js"),
  path.join("src", "ui", "services", "export-manifest.js"),
  path.join("src", "ui", "services", "svg-utils.js"),
  path.join("src", "ui", "services", "css-utils.js"),
  path.join("src", "ui", "services", "image-color-utils.js"),
  path.join("src", "ui", "services", "slice-repair.js"),
  path.join("src", "ui", "services", "preview-image.js"),
  path.join("src", "ui", "services", "editable-reference-assets.js"),
  path.join("src", "ui", "services", "web-to-figma-utils.js"),
  path.join("src", "ui", "services", "editable-html-export.js"),
  path.join("src", "ui", "services", "editable-layer-spec.js"),
  path.join("src", "ui", "services", "html-preview-inspector.js"),
  path.join("src", "ui", "services", "zip.js"),
  path.join("src", "ui", "services", "figma-frame-html-export.js"),

  // Local UI state helpers.
  path.join("src", "ui", "state", "slice-ai-state.js"),
  path.join("src", "ui", "state", "background-decomposition.js"),
  path.join("src", "ui", "state", "html-preview-cache.js"),
  path.join("src", "ui", "state", "figma-frame-html-export-state.js"),
  path.join("src", "ui", "state", "fig-export-mode.js"),

  // Backend, storage, provider, and workspace APIs.
  path.join("src", "ui", "api", "storage.js"),
  path.join("src", "ui", "api", "model-config.js"),
  path.join("src", "ui", "api", "backend-client.js"),
  path.join("src", "ui", "api", "fig-export-client.js"),
  path.join("src", "ui", "api", "workspace-draft.js"),

  // DOM renderers used by app.js.
  path.join("src", "ui", "renderers", "model-settings.js"),

  // Bootstrap and event orchestration. Keep this last.
  path.join("src", "ui", "app.js")
];

function buildUiHtml(templateHtml, stylesCss, appScript = "", vendorScript = "", captureRuntime = "") {
  const appScriptContent = Array.isArray(appScript) ? appScript.join("\n") : appScript;
  const vendorScriptContent = Array.isArray(vendorScript) ? vendorScript.join("\n") : vendorScript;
  const captureRuntimeContent = Array.isArray(captureRuntime) ? captureRuntime.join("\n") : captureRuntime;
  let html = replacePlaceholder(templateHtml, STYLE_PLACEHOLDER, stylesCss);
  if (html.includes(CAPTURE_RUNTIME_PLACEHOLDER)) {
    html = replacePlaceholder(html, CAPTURE_RUNTIME_PLACEHOLDER, captureRuntimeContent);
  }
  if (html.includes(VENDOR_SCRIPT_PLACEHOLDER)) {
    html = replacePlaceholder(html, VENDOR_SCRIPT_PLACEHOLDER, vendorScriptContent);
  }
  if (html.includes(APP_SCRIPT_PLACEHOLDER)) {
    html = replacePlaceholder(html, APP_SCRIPT_PLACEHOLDER, appScriptContent);
  }
  return html;
}

function replacePlaceholder(templateHtml, placeholder, content) {
  const placeholderPattern = new RegExp(`(^[ \\t]*)${escapeRegExp(placeholder)}`, "m");
  const match = templateHtml.match(placeholderPattern);
  if (!match) {
    throw new Error(`UI template missing ${placeholder}`);
  }
  const indentation = match[1];
  const inlinedContent = content
    .trimEnd()
    .split("\n")
    .map((line) => line ? `${indentation}${line}` : "")
    .join("\n");
  return templateHtml.replace(placeholderPattern, () => inlinedContent);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildUiHtmlFile({
  templatePath = path.join("src", "ui", "ui.template.html"),
  stylesPath = path.join("src", "ui", "styles.css"),
  captureRuntimePaths = DEFAULT_CAPTURE_RUNTIME_PATHS,
  vendorScriptPaths = DEFAULT_VENDOR_SCRIPT_PATHS,
  appScriptPaths = DEFAULT_APP_SCRIPT_PATHS,
  outputPath = path.join("dist", "ui.html")
} = {}) {
  const templateHtml = fs.readFileSync(templatePath, "utf8");
  const stylesCss = fs.readFileSync(stylesPath, "utf8");
  const missingAppScriptPaths = appScriptPaths.filter((appScriptPath) => !fs.existsSync(appScriptPath));
  if (missingAppScriptPaths.length) {
    throw new Error(`Missing required app script: ${missingAppScriptPaths.join(", ")}`);
  }
  if (!templateHtml.includes(APP_SCRIPT_PLACEHOLDER)) {
    throw new Error(`UI template missing ${APP_SCRIPT_PLACEHOLDER}`);
  }
  const captureRuntime = captureRuntimePaths
    .filter((captureRuntimePath) => fs.existsSync(captureRuntimePath))
    .map((captureRuntimePath) => fs.readFileSync(captureRuntimePath, "utf8"));
  const vendorScript = vendorScriptPaths
    .filter((vendorScriptPath) => fs.existsSync(vendorScriptPath))
    .map((vendorScriptPath) => fs.readFileSync(vendorScriptPath, "utf8"));
  const appScript = appScriptPaths
    .map((appScriptPath) => fs.readFileSync(appScriptPath, "utf8"));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buildUiHtml(templateHtml, stylesCss, appScript, vendorScript, captureRuntime));
}

if (require.main === module) {
  buildUiHtmlFile();
}

module.exports = {
  APP_SCRIPT_PLACEHOLDER,
  CAPTURE_RUNTIME_PLACEHOLDER,
  DEFAULT_APP_SCRIPT_PATHS,
  DEFAULT_CAPTURE_RUNTIME_PATHS,
  DEFAULT_VENDOR_SCRIPT_PATHS,
  STYLE_PLACEHOLDER,
  VENDOR_SCRIPT_PLACEHOLDER,
  buildUiHtml,
  buildUiHtmlFile
};
