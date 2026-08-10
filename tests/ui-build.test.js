const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
  APP_SCRIPT_PLACEHOLDER,
  CAPTURE_RUNTIME_PLACEHOLDER,
  DEFAULT_APP_SCRIPT_PATHS,
  DEFAULT_CAPTURE_RUNTIME_PATHS,
  DEFAULT_VENDOR_SCRIPT_PATHS,
  STYLE_PLACEHOLDER,
  VENDOR_SCRIPT_PLACEHOLDER,
  buildUiHtml
} = require("../scripts/build-ui-html");

test("inlined app functions do not shadow shared module functions", () => {
  const sharedSources = DEFAULT_APP_SCRIPT_PATHS
    .filter((filePath) => filePath !== "src/ui/app.js")
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const sharedNames = new Set([...sharedSources.matchAll(/^(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm)].map((match) => match[1]));
  const appNames = new Set([...appSource.matchAll(/^\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm)].map((match) => match[1]));

  assert.deepEqual([...appNames].filter((name) => sharedNames.has(name)), []);
});

test("buildUiHtml inlines CSS into the UI template", () => {
  const template = `<style>\n  ${STYLE_PLACEHOLDER}\n</style>`;
  const css = "body { color: red; }\n";

  assert.equal(buildUiHtml(template, css), "<style>\n  body { color: red; }\n</style>");
});

test("buildUiHtml rejects templates without the style placeholder", () => {
  assert.throws(() => buildUiHtml("<style></style>", ""), /missing/);
});

test("buildUiHtml inlines app script when the template includes a script placeholder", () => {
  const template = `<style>\n${STYLE_PLACEHOLDER}\n</style>\n<script>\n${APP_SCRIPT_PLACEHOLDER}\n</script>`;

  assert.equal(
    buildUiHtml(template, "body {}", "window.answer = 42;\n"),
    "<style>\nbody {}\n</style>\n<script>\nwindow.answer = 42;\n</script>"
  );
});

test("buildUiHtml preserves dollar sequences in inlined app script", () => {
  const template = `<style>\n${STYLE_PLACEHOLDER}\n</style>\n<script>\n${APP_SCRIPT_PLACEHOLDER}\n</script>`;
  const script = "const value = `(?:_${suffix})+$`;\n";

  assert.equal(buildUiHtml(template, "", script).includes(script.trimEnd()), true);
});

test("buildUiHtml joins multiple app script sources in order", () => {
  const template = `<style>\n${STYLE_PLACEHOLDER}\n</style>\n<script>\n${APP_SCRIPT_PLACEHOLDER}\n</script>`;

  assert.equal(
    buildUiHtml(template, "", ["window.first = true;", "window.second = window.first;"]),
    "<style>\n\n</style>\n<script>\nwindow.first = true;\nwindow.second = window.first;\n</script>"
  );
});

test("buildUiHtml inlines capture runtime and vendor scripts separately", () => {
  const template = `<style>\n${STYLE_PLACEHOLDER}\n</style>\n<script type="text/plain">\n${CAPTURE_RUNTIME_PLACEHOLDER}\n</script>\n<script>\n${VENDOR_SCRIPT_PLACEHOLDER}\n</script>\n<script>\n${APP_SCRIPT_PLACEHOLDER}\n</script>`;

  assert.equal(
    buildUiHtml(template, "", "window.app = true;", "window.vendor = true;", "window.capture = true;"),
    "<style>\n\n</style>\n<script type=\"text/plain\">\nwindow.capture = true;\n</script>\n<script>\nwindow.vendor = true;\n</script>\n<script>\nwindow.app = true;\n</script>"
  );
});

test("default UI build paths keep vendor scripts before app bootstrap", () => {
  assert.deepEqual(DEFAULT_CAPTURE_RUNTIME_PATHS, ["src/vendor/figma-capture.js"]);
  assert.deepEqual(DEFAULT_VENDOR_SCRIPT_PATHS, ["src/vendor/imagetracer.js"]);
  assert.equal(DEFAULT_APP_SCRIPT_PATHS.at(-1), "src/ui/app.js");
  assert.ok(DEFAULT_APP_SCRIPT_PATHS.includes("src/ui/api/backend-client.js"));
  assert.ok(DEFAULT_APP_SCRIPT_PATHS.includes("src/ui/services/web-to-figma-utils.js"));
  assert.ok(DEFAULT_APP_SCRIPT_PATHS.includes("src/ui/api/model-config.js"));
  assert.ok(DEFAULT_APP_SCRIPT_PATHS.includes("src/ui/renderers/model-settings.js"));
  assert.equal(DEFAULT_APP_SCRIPT_PATHS.includes("src/ui/api/provider-config.js"), false);
  assert.equal(DEFAULT_APP_SCRIPT_PATHS.includes("src/ui/renderers/provider-settings.js"), false);
});

test("shared AI image dimension validation is inlined before the UI bootstrap", () => {
  const validatorPath = "src/core/ai-image-dimensions.js";
  const appPath = "src/ui/app.js";

  assert.ok(DEFAULT_APP_SCRIPT_PATHS.includes(validatorPath));
  assert.ok(DEFAULT_APP_SCRIPT_PATHS.indexOf(validatorPath) < DEFAULT_APP_SCRIPT_PATHS.indexOf(appPath));
  assert.ok(DEFAULT_APP_SCRIPT_PATHS.includes("src/ui/services/canvas-viewport.js"));
  assert.ok(DEFAULT_APP_SCRIPT_PATHS.indexOf("src/ui/services/canvas-viewport.js") < DEFAULT_APP_SCRIPT_PATHS.indexOf(appPath));
});

test("AI layer import exposes one button and one reconstruction endpoint", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const template = fs.readFileSync("src/ui/ui.template.html", "utf8");

  assert.equal((template.match(/id="placeAiLayers"/g) || []).length, 1);
  assert.doesNotMatch(template, /placeAiLayersFast|AI 图层导入\(快速\)|速度更快但还原细节可能不如原模式/);
  assert.match(template, /data-import-help='确认切图后，AI识别画布内的文字、布局、切图资产，导入为可编辑的图层，识别准度依赖于"设置"->"图片理解模型"能力'/);
  assert.doesNotMatch(appSource, /placeAiLayersFast|reconstruct-h5-local|strategy === "local"|"legacy"/);
  assert.match(appSource, /fetchBackend\("\/api\/design\/reconstruct-h5"/);
});

test("locked inspector selection uses a distinct light red highlight", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const styles = fs.readFileSync("src/ui/styles.css", "utf8");

  assert.match(appSource, /classList\.toggle\(\s*"selection-locked",\s*htmlPreviewInspectorSelectionLocked/);
  assert.match(styles, /\.html-preview-inspector-highlight\.selection-locked\s*\{[^}]*background:\s*rgba\([^}]+\);/s);
  assert.match(styles, /\.html-preview-inspector-tree-row\.selected\.selection-locked\s*\{[^}]*background:\s*#fff0f0;/s);
});

test("AI layer preview does not delete generated elements based on slice overlap", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const inspectorSource = fs.readFileSync("src/ui/services/html-preview-inspector.js", "utf8");

  assert.doesNotMatch(appSource, /removeGeneratedElementsCoveredByReferenceAssets/);
  assert.doesNotMatch(inspectorSource, /isGeneratedElementCoveredByReferenceAsset/);
});

test("AI slice detection does not run PNG audit or audit expansion", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");

  assert.doesNotMatch(appSource, /auditAiSlicePng/);
  assert.doesNotMatch(appSource, /expandSlicePlacementForAudit/);
  assert.doesNotMatch(appSource, /正在审计 PNG 切图/);
});

test("AI decomposition is the single entry for ordinary slices and background restoration", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const template = fs.readFileSync("src/ui/ui.template.html", "utf8");
  const styles = fs.readFileSync("src/ui/styles.css", "utf8");

  assert.equal((template.match(/id="decomposeBackground"/g) || []).length, 1);
  assert.equal((template.match(/>AI拆图<\/button>/g) || []).length, 1);
  assert.doesNotMatch(template, />AI切图<\/button>/);
  assert.doesNotMatch(template, /id="sliceDetectionLoadingDialog"/);
  assert.match(template, />AI拆图<\/button>/);
  assert.match(template, /id="backgroundDecompositionDialog"/);
  assert.match(template, /id="backgroundDecompositionStage"/);
  assert.match(template, /id="backgroundDecompositionList"/);
  assert.match(template, /id="backgroundDecompositionRegenerate"[^>]*>重新 AI 识别</);
  assert.match(template, /id="backgroundDecompositionCancel"/);
  assert.match(template, /id="backgroundDecompositionGenerate"[^>]*>生成完整背景</);
  assert.match(template, /id="backgroundDecompositionTitle">选择修补背景</);
  assert.match(appSource, /fetchBackend\("\/api\/design\/plan-background-decomposition"/);
  assert.doesNotMatch(appSource, /fetchBackend\("\/api\/design\/detect-slice-assets"/);
  assert.match(appSource, /const detectedAssets = Array\.isArray\(result\.assets\)[\s\S]*appendDetectedSliceAssets\(\s*activeImage,\s*detectedAssets/);
  assert.match(appSource, /response\.status === 404/);
  assert.match(appSource, /本地服务版本过旧，请关闭并重新运行“一键部署环境”/);
  assert.match(appSource, /createBackgroundDecompositionReview/);
  assert.match(appSource, /updateDecompositionBackground/);
  assert.match(appSource, /toggleDecompositionOverlay/);
  assert.match(styles, /\.background-decomposition-dialog/);
  assert.match(styles, /\.background-decomposition-overlay\.remove/);
  assert.match(template, /id="backgroundDecompositionZoomControls"/);
  assert.match(template, /id="backgroundDecompositionSizer"/);
  assert.match(appSource, /backgroundDecompositionCanvasViewport\s*=\s*createCanvasViewportController/);
  assert.match(appSource, /\["nw", "n", "ne", "e", "se", "s", "sw", "w"\]/);
  assert.match(appSource, /background\.overlays\.filter\(\(overlay\)\s*=>\s*overlay\.remove\)\.map/);
  assert.match(appSource, /data-decomposition-overlay="[^"]*"[^>]*title=/);
  assert.match(appSource, /targetType:\s*"overlay"/);
  assert.match(appSource, /moveDecompositionOverlay\(/);
  assert.match(appSource, /resizeDecompositionOverlay\(/);
  assert.match(appSource, /width:\s*"宽"/);
  assert.match(appSource, /height:\s*"高"/);
  assert.match(appSource, /function undoBackgroundDecompositionChange\(/);
  assert.match(appSource, /function redoBackgroundDecompositionChange\(/);
  assert.match(appSource, /backgroundDecompositionDialog\.classList\.contains\("open"\)/);
  assert.match(appSource, /\["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"\]/);
  assert.match(appSource, /moveDecompositionOverlay\([\s\S]*deltaX[\s\S]*deltaY/);
  assert.match(appSource, /if\s*\(!event\.repeat\)\s*recordBackgroundDecompositionHistory\(\)/);
  assert.match(appSource, /event\.key !== "Delete"[\s\S]*event\.key !== "Backspace"/);
  assert.match(appSource, /data-decomposition-overlay-row=/);
  const decompositionPointerDownSource = appSource.slice(
    appSource.indexOf("function beginBackgroundDecompositionDrag("),
    appSource.indexOf("function moveBackgroundDecompositionDrag(")
  );
  assert.match(
    decompositionPointerDownSource,
    /activeOverlayId:\s*overlayState\.id[\s\S]*renderBackgroundDecompositionReview\(\);[\s\S]*backgroundDecompositionDrag\s*=/
  );
  assert.match(styles, /\.background-decomposition-(?:background|overlay)-label[\s\S]*text-overflow:\s*ellipsis/);
  assert.match(appSource, /decomposeBackgroundButton\.addEventListener\("click",\s*\(\)\s*=>\s*\{\s*runBackgroundDecompositionPlanning\(false\);/s);
  assert.match(appSource, /backgroundDecompositionRegenerate\.addEventListener\("click",\s*\(\)\s*=>\s*\{[^}]*runBackgroundDecompositionPlanning\(true\);/s);
  assert.ok(
    appSource.indexOf("getCachedBackgroundDecomposition(")
      < appSource.indexOf('fetchBackend("/api/design/plan-background-decomposition"')
  );
  assert.match(appSource, /function persistBackgroundDecompositionReview\(/);
  const generationSource = appSource.slice(
    appSource.indexOf("async function generateBackgroundDecompositionAssets()"),
    appSource.indexOf("function updateSliceAiProgress(")
  );
  assert.doesNotMatch(generationSource, /backgroundDecompositionReview\s*=\s*null/);
  assert.match(
    styles,
    /body\.loading-interaction-locked button:not\(#windowToggle\):not\(#editablePreviewCancel\):not\(#backgroundDecompositionLoadingCancel\)/
  );
});

test("slice canvas fit uses an explicit scroll sizer and centered controller placement", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const styles = fs.readFileSync("src/ui/styles.css", "utf8");
  const renderSource = appSource.slice(
    appSource.indexOf("function renderActiveResult("),
    appSource.indexOf("function getResultFrameScrollState(")
  );

  assert.match(renderSource, /class="result-sizer"/);
  assert.match(renderSource, /fitPadding:\s*12/);
  assert.match(renderSource, /render:\s*\(\{\s*contentWidth,\s*contentHeight,\s*left,\s*top\s*\}\)/);
  assert.match(renderSource, /sizer\.style\.width\s*=\s*`\$\{Math\.max\(contentWidth,\s*frame\.clientWidth\)\}px`/);
  assert.match(renderSource, /canvas\.style\.left\s*=\s*`\$\{left\}px`/);
  assert.match(renderSource, /canvas\.style\.top\s*=\s*`\$\{top\}px`/);
  assert.match(styles, /\.result-sizer\s*\{[^}]*position:\s*relative;/s);
  assert.match(styles, /\.result-canvas\s*\{[^}]*position:\s*absolute;/s);
});

test("slice canvas fills the remaining workspace before fitting the whole image", () => {
  const styles = fs.readFileSync("src/ui/styles.css", "utf8");

  assert.match(styles, /\.result-view\s*\{[^}]*flex:\s*1 1 auto;/s);
  assert.match(styles, /\.result-card\s*\{[^}]*flex:\s*1 1 auto;/s);
});

test("startup gate stays visible until health and config both load successfully", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const startupSource = appSource.slice(
    appSource.indexOf("async function initializeLocalService()"),
    appSource.indexOf("async function offerWorkspaceDraftRestore()")
  );
  const healthCheckIndex = startupSource.indexOf("await fetchAppWithTimeout");
  const configLoadIndex = startupSource.indexOf("await loadApiConfigFromBackend(true)");
  const gateHideIndex = startupSource.indexOf("startupGate.hidden = true");

  assert.doesNotMatch(startupSource, /startupFallback/);
  assert.ok(healthCheckIndex >= 0);
  assert.ok(configLoadIndex > healthCheckIndex);
  assert.ok(gateHideIndex > configLoadIndex);
  assert.match(startupSource, /catch \(error\)[\s\S]*startupGate\.hidden = false/);
  assert.match(startupSource, /startupRetry\.hidden = false/);
});

test("local API exposes the health endpoint used by the startup gate", () => {
  const serverSource = fs.readFileSync("server.js", "utf8");
  assert.match(serverSource, /request\.method === "GET" && request\.url === "\/health"/);
  assert.match(serverSource, /sendJson\(response, 200, \{ ok: true \}\)/);
});

test("slice processing actions use shared reversible state transitions", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");

  assert.match(appSource, /applySliceTransparencyResult\(asset,\s*\{\s*dataUrl:\s*transparentDataUrl,\s*ai:\s*false\s*\}\)/);
  assert.match(appSource, /applySliceTransparencyResult\(asset,\s*\{\s*dataUrl:\s*image\.dataUrl,\s*ai:\s*true\s*\}\)/);
  assert.match(appSource, /applySliceSvgResult\(asset,\s*\{\s*svgData,\s*ai:\s*false\s*\}\)/);
  assert.match(appSource, /applySliceSvgResult\(asset,\s*\{\s*svgData,\s*ai:\s*true\s*\}\)/);
  assert.match(appSource, /restoreSliceSvgState\(asset\)/);
  assert.match(appSource, /getSliceActiveImageDataUrl\(asset\)/);
  assert.match(appSource, /delete processedAsset\.svgRestoreState/);
});

test("stale AI layer preview calibrates only assets referenced by cached HTML", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const openPreviewSource = appSource.slice(
    appSource.indexOf("function openHtmlPreview("),
    appSource.indexOf("function getHtmlPreviewSourceSize(")
  );

  assert.match(
    openPreviewSource,
    /const previewAssets = selectCanonicalReferenceAssets\(cacheEntry\.canonicalHtml,\s*localAssets\)/
  );
  assert.match(openPreviewSource, /hydrateCanonicalAssetHtml\(cacheEntry\.canonicalHtml,\s*previewAssets\)/);
  assert.match(openPreviewSource, /activeHtmlPreviewAssets = previewAssets/);

  const refreshSource = appSource.slice(
    appSource.indexOf("async function refreshCurrentEditablePreviewAssets("),
    appSource.indexOf("function updateEditablePreviewElapsed(")
  );
  assert.match(
    refreshSource,
    /selectCanonicalReferenceAssets\(activeHtmlPreviewResult\.canonicalHtml,\s*context\.localAssets\)/
  );

  const appendMissingSource = appSource.slice(
    appSource.indexOf("function appendMissingReferenceAssetNodes("),
    appSource.indexOf("async function captureHtmlPreviewAsEditableManifest(")
  );
  assert.match(appendMissingSource, /const activeIds = new Set\(activeHtmlPreviewAssets\.map/);
  assert.match(appendMissingSource, /!activeIds\.has\(String\(asset\.id \|\| ""\)\)/);
});

test("AI decomposition review exposes task navigation and only expands the active background", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");

  assert.match(appSource, /getBackgroundDecompositionNavigation\(backgroundDecompositionReview\)/);
  assert.match(appSource, /data-decomposition-previous/);
  assert.match(appSource, /data-decomposition-next/);
  assert.match(appSource, /background-decomposition-candidate-index/);
  assert.match(
    appSource,
    /background\.id === navigation\.activeBackgroundId[\s\S]*?background-decomposition-candidate-details/
  );
  assert.match(appSource, /previousBackgroundId[\s\S]*?activeBackgroundId/);
  assert.match(appSource, /nextBackgroundId[\s\S]*?activeBackgroundId/);
});

test("AI decomposition generation copy reflects real repair jobs", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");

  assert.match(appSource, /const regionCount = jobs\.reduce/);
  assert.match(appSource, /没有可生成的完整背景/);
  assert.match(appSource, /将生成 \$\{jobs\.length\} 个完整背景，共移除 \$\{regionCount\} 个区域/);
  assert.match(
    appSource,
    /jobs\.length === 1[\s\S]*?"生成完整背景"[\s\S]*?jobs\.length > 1[\s\S]*?`生成 \$\{jobs\.length\} 个完整背景`[\s\S]*?: "生成完整背景"/
  );
  assert.match(appSource, /backgroundDecompositionGenerate\.disabled = jobs\.length === 0/);
});

test("AI decomposition task list visually separates navigation, active details, and disabled tasks", () => {
  const styles = fs.readFileSync("src/ui/styles.css", "utf8");

  assert.match(styles, /\.background-decomposition-task-navigation\s*\{/);
  assert.match(styles, /\.background-decomposition-candidate-details\s*\{/);
  assert.match(styles, /\.background-decomposition-candidate-index\s*\{/);
  assert.match(styles, /\.background-decomposition-candidate-count\s*\{/);
  assert.match(styles, /\.background-decomposition-candidate\.disabled\s*\{/);
  assert.match(styles, /\.background-decomposition-candidate\.active\s*\{/);
});

test("AI layer import always reuses fixed-size vendor capture", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");

  assert.match(appSource, /captureHtmlPreviewWithWebToFigma\(doc\)/);
  assert.match(appSource, /mapWebToFigmaCaptureToEditableManifest\(capture, \{ fixedSize: true \}\)/);
  assert.equal(
    (appSource.match(/parseFigmaCompatibleCssGradient\(/g) || []).length,
    2
  );
  assert.match(appSource, /node\.editableGradient\s*\|\|\s*parseFigmaCompatibleCssGradient\(style\)/);
  assert.match(appSource, /resolveCapturedSemanticGroup\(node, inheritedSemanticGroup\)/);
  assert.match(appSource, /semanticGroupId:\s*semanticGroup\.id/);
  assert.match(appSource, /semanticGroupId:\s*inheritedSemanticGroup\.id/);
  assert.doesNotMatch(appSource, /captureHtmlPreviewWithWebToFigma\(\)/);
});

test("AI layer preview waits for nested asset calibration before actions", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");

  assert.match(appSource, /let htmlPreviewReadyPromise = Promise\.resolve\(\)/);
  assert.match(appSource, /async function calibrateHtmlPreviewReferenceAssets/);
  assert.match(appSource, /function waitForHtmlPreviewReady/);
  assert.match(appSource, /function inspectLoadedEditableDocumentQuality/);
  assert.match(appSource, /function normalizeHtmlPreviewReferenceAssetOwnership/);
  assert.match(
    appSource,
    /normalizeHtmlPreviewReferenceAssetOwnership\(\)[\s\S]*?await calibrateHtmlPreviewReferenceAssets\(\)/
  );
  assert.match(appSource, /data-reference-owner-id/);
  assert.match(appSource, /querySelectorAll\("\.screen"\)\.length !== 1/);
  assert.match(appSource, /querySelector\("\.fit-shell > \.fit-box > \.screen"\)/);
  assert.match(appSource, /await waitForHtmlPreviewReady\(\)/);
  assert.doesNotMatch(
    appSource,
    /function alignHtmlPreviewReferenceAssets[\s\S]*?node\.style\.setProperty\("left"/
  );
});

test("AI layer capture waits for the calibrated screen document", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");

  assert.match(
    appSource,
    /async function captureHtmlPreviewAsEditableManifest\([^)]*\)[\s\S]*?await waitForHtmlPreviewReady\(\)/
  );
  assert.match(appSource, /captureRawForDesign\("\.screen"\)/);
  assert.match(
    appSource,
    /const cleanupCapturePseudos = highFidelity[\s\S]*?materializeVisibleCapturePseudos\([\s\S]*?doc\.querySelector\("\.screen"\)[\s\S]*?finally\s*\{[\s\S]*?cleanupCapturePseudos\(\)/
  );
  assert.match(
    appSource,
    /runFastVendorCapture\(\{[\s\S]*?timeoutMs:\s*highFidelity\s*\?\s*60000\s*:\s*15000/
  );
  assert.doesNotMatch(appSource, /captureHtmlPreviewAsEditableManifestFallback/);
  assert.doesNotMatch(appSource, /captureFallback\s*:/);
  assert.doesNotMatch(appSource, /兼容模式/);
});

test("AI layer import exposes a session-only high-fidelity capture setting", () => {
  const templateSource = fs.readFileSync("src/ui/ui.template.html", "utf8");
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const styles = fs.readFileSync("src/ui/styles.css", "utf8");

  assert.match(templateSource, /id="htmlPreviewImportSettings"/);
  assert.match(
    templateSource,
    /id="htmlPreviewImportSettings"[^>]*aria-label="导入设置"[^>]*>[\s\S]*?<svg[^>]*class="html-preview-import-settings-icon"/
  );
  assert.doesNotMatch(
    templateSource,
    /id="htmlPreviewImportSettings"[^>]*>\s*设置\s*<\/button>/
  );
  assert.match(templateSource, /id="htmlPreviewImportSettingsPopover"/);
  assert.match(templateSource, /id="htmlPreviewHighFidelityCapture"/);
  assert.match(templateSource, /高保真捕获（Playwright\/CDP）/);
  assert.doesNotMatch(templateSource, /导入速度会稍慢/);
  assert.match(
    appSource,
    /let htmlPreviewHighFidelityCaptureEnabled = false;/
  );
  assert.match(
    appSource,
    /htmlPreviewHighFidelityCaptureEnabled = htmlPreviewHighFidelityCapture\.checked/
  );
  assert.match(appSource, /function closeHtmlPreviewImportSettings\(\)/);
  assert.match(styles, /\.html-preview-import-settings-popover\s*\{/);
  assert.match(
    styles,
    /\.html-preview-import-settings-group\s*\{[^}]*gap:\s*0\s*;/s
  );
  assert.match(
    styles,
    /\.html-preview-import\s*\{[^}]*border-radius:\s*9px 0 0 9px\s*;/s
  );
  assert.match(
    styles,
    /\.html-preview-import-settings\s*\{[^}]*border-radius:\s*0 9px 9px 0\s*;[^}]*color:\s*#ffffff\s*;[^}]*background:\s*#111318\s*;/s
  );
  assert.doesNotMatch(
    appSource,
    /(?:localStorage|pluginStorage|scheduleWorkspaceDraftSave)\([^)]*htmlPreviewHighFidelity/
  );
});

test("AI layer import selects one capture provider before the shared fixed-size map", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const playwrightProviderSource = appSource.match(
    /async function captureHtmlPreviewWithPlaywright[\s\S]*?\n      async function ensureWebToFigmaCaptureRuntime/
  )?.[0] || "";

  assert.match(
    appSource,
    /captureHtmlPreviewAsEditableManifest\(\{\s*highFidelity:\s*htmlPreviewHighFidelityCaptureEnabled\s*\}\)/
  );
  assert.match(
    appSource,
    /async function captureHtmlPreviewWithPlaywright\(doc,\s*screen\)/
  );
  assert.match(appSource, /fetchBackend\("\/api\/design\/capture-figma"/);
  assert.match(
    appSource,
    /highFidelity[\s\S]*?captureHtmlPreviewWithPlaywright\(doc,\s*screen\)[\s\S]*?:\s*captureHtmlPreviewWithWebToFigma\(doc\)/
  );
  assert.match(
    appSource,
    /mapWebToFigmaCaptureToEditableManifest\(capture,\s*\{\s*fixedSize:\s*true\s*\}\)/
  );
  assert.doesNotMatch(
    playwrightProviderSource,
    /captureHtmlPreviewWithWebToFigma/
  );
});

test("editable HTML download preserves the preview DOM and externalizes runtime files", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const downloadSource = appSource.match(
    /async function downloadEditableHtmlZip\(\)[\s\S]*?\n      async function importHtmlPreviewToFigma/
  )?.[0] || "";

  assert.match(downloadSource, /await waitForHtmlPreviewReady\(\)/);
  assert.match(downloadSource, /fitScript\.src = "\.\/script\.js"/);
  assert.match(downloadSource, /script:\s*buildFastEditableExportScript\(screen\)/);
  assert.match(downloadSource, /buildReferenceAssetExportCss/);
  assert.match(downloadSource, /activeHtmlPreviewExportGeometries/);
  assert.doesNotMatch(downloadSource, /transform:translate\(\$\{correction\.translateX/);
  assert.doesNotMatch(downloadSource, /createElement\("main"\)/);
  assert.doesNotMatch(downloadSource, /replaceChild\(/);
  assert.doesNotMatch(downloadSource, /fitScript\.textContent/);
});

test("AI layer import capture paths do not truncate node definitions", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");

  assert.doesNotMatch(appSource, /nodes\.length\s*>=\s*260/);
  assert.doesNotMatch(appSource, /querySelectorAll\("\*"\)\]\.slice\(0,\s*260\)/);
  assert.doesNotMatch(appSource, /stackedNodes\.slice\(0,\s*240\)/);
  assert.doesNotMatch(appSource, /stackedNodes\.slice\(0,\s*220\)/);
});

test("editable Figma import reports batch progress and partial success", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const pluginSource = fs.readFileSync("src/plugin/main.js", "utf8");

  assert.match(pluginSource, /type:\s*"import-progress"/);
  assert.match(pluginSource, /createdCount:\s*result\.createdCount/);
  assert.match(pluginSource, /skipped:\s*result\.skipped/);
  assert.match(pluginSource, /groupedCount:\s*result\.groupedCount/);
  assert.match(pluginSource, /groupWarnings:\s*result\.groupWarnings/);
  assert.match(appSource, /activeImportMessage\.type === "import-progress"/);
  assert.match(appSource, /正在导入 \$\{activeImportMessage\.processedCount\} \/ \$\{activeImportMessage\.totalCount\} 个图层/);
  assert.match(pluginSource, /requestId:\s*message\.requestId/);
  const finishImportSource = appSource.slice(
    appSource.indexOf("function finishFigmaImportRequest("),
    appSource.indexOf("function finishFigmaFrameHtmlExportRequest(")
  );
  assert.equal((finishImportSource.match(/completePendingFigmaOperation\("import"\)/g) || []).length, 1);
  assert.match(appSource, /个不支持的图层未导入/);
  assert.match(appSource, /个组件未分组/);
});

test("fast capture maps CSS polygon backgrounds to SVG instead of rounded rectangles", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");

  assert.match(appSource, /createCssClipPathSvg\(/);
  assert.match(appSource, /style\.clipPath \|\| style\["clip-path"\]/);
  assert.match(appSource, /type: "svg"[\s\S]*svgData: clipPathSvg/);
});

test("border-only captured shapes stay transparent instead of receiving a white fallback", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");

  assert.doesNotMatch(appSource, /fill:\s*background\s*\|\|\s*"#FFFFFF"/);
  assert.equal(
    (appSource.match(/fill:\s*background\s*\|\|\s*null/g) || []).length,
    1
  );
});

test("HTML preview provides outer zoom controls and a scroll stage", () => {
  const template = fs.readFileSync("src/ui/ui.template.html", "utf8");

  assert.match(template, /id="htmlPreviewZoomControls"/);
  assert.match(template, /id="htmlPreviewStage"/);
  assert.match(template, /id="htmlPreviewSizer"/);
});

test("Figma HTML export is a collapsed-only action with compact copy", () => {
  const template = fs.readFileSync("src/ui/ui.template.html", "utf8");
  const styles = fs.readFileSync("src/ui/styles.css", "utf8");

  assert.match(template, /id="exportFigmaFrameHtml"[^>]*>导出 HTML<\/button>/);
  assert.match(styles, /#exportFigmaFrameHtml\s*\{[^}]*display:\s*none;/s);
  assert.match(styles, /body\.collapsed #exportFigmaFrameHtml\s*\{[^}]*display:\s*[^n][^;]*;/s);
  assert.match(styles, /body\.collapsed \.brand\s*\{[^}]*display:\s*none;/s);
  assert.match(styles, /body\.collapsed \.topbar-actions\s*\{[^}]*margin-left:\s*auto;/s);
  assert.match(template, /id="exportFigmaFrameHtml"[^>]*aria-disabled="true"[^>]*>导出 HTML<\/button>/);
  assert.doesNotMatch(template, /id="exportFigmaFrameHtml"[^>]*\sdisabled(?:\s|>)/);
});

test("UI bootstrap ignores a persisted collapsed flag when reopening the plugin", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const initSource = appSource.match(
    /function initUiWindowState\(\)\s*\{[\s\S]*?\n      \}\n\n      function applyHostWindowState/
  )?.[0] || "";

  assert.match(initSource, /setUiCollapsed\(false,\s*false\)/);
  assert.doesNotMatch(initSource, /setUiCollapsed\(Boolean\(stored\.collapsed\),\s*false\)/);
});

test("active slice overlay renders four independent inner radius handles", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const styles = fs.readFileSync("src/ui/styles.css", "utf8");

  assert.match(appSource, /data-slice-radius-handle/);
  assert.match(appSource, /calculateDraggedSliceRadius/);
  assert.match(appSource, /setSliceCornerRadius/);
  assert.match(appSource, /data-slice-corner=/);
  assert.match(appSource, /"topLeft",\s*"左上"/);
  assert.match(appSource, /"topRight",\s*"右上"/);
  assert.match(appSource, /"bottomRight",\s*"右下"/);
  assert.match(appSource, /"bottomLeft",\s*"左下"/);
  assert.match(styles, /\.slice-radius-handle\s*\{/);
  assert.match(styles, /--slice-radius-nw-x/);
  assert.match(styles, /--slice-radius-sw-y/);
});

test("slice image editor previews the asset's non-destructive radius", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const openEditorSource = appSource.match(
    /async function openSliceImagePreview\([\s\S]*?\n      function finishCloseSliceImageEditor/
  )?.[0] || "";

  assert.match(openEditorSource, /getSliceRadiusCssValue/);
  assert.match(openEditorSource, /sliceImageEditorStage\.style\.overflow\s*=\s*"hidden"/);
});

test("AI decomposition backgrounds expose four corner radii and pass them to generated assets", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const styles = fs.readFileSync("src/ui/styles.css", "utf8");

  assert.match(appSource, /data-decomposition-corner-radius=/);
  assert.match(appSource, /\["nw",\s*"ne",\s*"se",\s*"sw"\][\s\S]*data-decomposition-radius-handle/);
  assert.match(appSource, /updateDecompositionBackgroundCornerRadius/);
  assert.match(appSource, /radii:\s*\{\s*\.\.\.job\.radii\s*\}/);
  assert.match(styles, /\.background-decomposition-radius-handle\s*\{/);
  assert.match(styles, /--decomposition-radius-nw-x/);
  assert.match(styles, /--decomposition-radius-sw-y/);
});

test("AI decomposition labels stay outside both background and overlay boxes", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const styles = fs.readFileSync("src/ui/styles.css", "utf8");

  assert.match(appSource, /getDecompositionLabelAlignmentClass/);
  assert.match(appSource, /background-decomposition-background-label\$\{getDecompositionLabelAlignmentClass/);
  assert.match(appSource, /background-decomposition-overlay-label\$\{getDecompositionLabelAlignmentClass/);
  assert.match(styles, /\.background-decomposition-stage\s*\{[^}]*overflow:\s*visible;/s);
  assert.match(styles, /\.background-decomposition-background-label,[\s\S]*top:\s*-\d+px;/);
  assert.match(styles, /width:\s*max-content;/);
  assert.match(styles, /\.background-decomposition-(?:background|overlay)-label\.align-right[\s\S]*right:\s*0;/);
  assert.match(styles, /pointer-events:\s*none;/);
});

test("AI decomposition drag applies the final pointer sample and repaints only the canvas while moving", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const moveSource = appSource.match(
    /function moveBackgroundDecompositionDrag\(event\)[\s\S]*?\n      function endBackgroundDecompositionDrag\(/
  )?.[0] || "";
  const endSource = appSource.match(
    /function endBackgroundDecompositionDrag\(event\)[\s\S]*?\n      async function generateBackgroundDecompositionAssets\(/
  )?.[0] || "";

  assert.match(
    appSource,
    /backgroundDecompositionLayer\.addEventListener\("lostpointercapture", endBackgroundDecompositionDrag\)/
  );
  assert.match(moveSource, /renderBackgroundDecompositionStage\(\)/);
  assert.doesNotMatch(moveSource, /renderBackgroundDecompositionReview\(\)/);
  assert.match(
    endSource,
    /moveBackgroundDecompositionDrag\(event\)[\s\S]*?releasePointerCapture/
  );
  assert.match(endSource, /renderBackgroundDecompositionReview\(\)/);
});

test("slice canvas owns keyboard focus and handles additive selection on pointer down", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const styles = fs.readFileSync("src/ui/styles.css", "utf8");
  const bindSliceLayerSource = appSource.match(
    /function bindSliceLayer\([\s\S]*?\n      function renderSliceOverlay\(/
  )?.[0] || "";

  assert.match(bindSliceLayerSource, /layer\.tabIndex = -1/);
  assert.match(bindSliceLayerSource, /layer\.focus\(\{ preventScroll: true \}\)/);
  assert.match(bindSliceLayerSource, /event\.shiftKey \|\| event\.metaKey \|\| event\.ctrlKey/);
  assert.match(bindSliceLayerSource, /toggleSliceSelection\(asset\.id\)/);
  assert.match(styles, /\.slice-layer:focus\s*\{[^}]*outline:\s*none;/s);
});

test("slice edits apply the pointer-up position before releasing capture", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const bindSliceLayerSource = appSource.match(
    /function bindSliceLayer\([\s\S]*?\n      function renderSliceOverlay\(/
  )?.[0] || "";

  assert.match(bindSliceLayerSource, /function applySlicePointerEdit\(event\)/);
  assert.match(
    bindSliceLayerSource,
    /layer\.addEventListener\("pointermove"[\s\S]*?applySlicePointerEdit\(event\)/
  );
  assert.match(
    bindSliceLayerSource,
    /layer\.addEventListener\("pointerup"[\s\S]*?applySlicePointerEdit\(event\)[\s\S]*?releasePointerCapture/
  );
});

test("keyboard delete removes the complete current slice selection without confirmation", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");

  assert.match(appSource, /removeSelectedSliceAssets\(false\)/);
  assert.match(appSource, /function removeSelectedSliceAssets\(confirmRemoval = true\)/);
  assert.match(appSource, /if \(confirmRemoval && !window\.confirm\(message\)\) return/);
});

test("HTML preview zoom stays outside the captured iframe document", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");

  assert.match(appSource, /htmlPreviewStage/);
  assert.match(appSource, /htmlPreviewSizer/);
  assert.match(appSource, /htmlPreviewCanvasViewport\s*=\s*createCanvasViewportController/);
  assert.match(appSource, /htmlPreviewCanvasViewport\.bindWheelTarget\(frameWindow\)/);
  assert.match(appSource, /previewCanvasViewport\s*=\s*createCanvasViewportController/);
  assert.doesNotMatch(appSource, /function bindHtmlPreviewWheel/);
  assert.doesNotMatch(appSource, /resultGrid\.addEventListener\("wheel"/);
  assert.match(appSource, /htmlPreviewFrame\.style\.transform\s*=\s*`scale\(/);
  assert.doesNotMatch(appSource, /screen(?:Element)?\.style\.setProperty\("transform",\s*`scale\(/);
});

test("HTML preview inspector is a parent-owned sibling of the preview viewport", () => {
  const template = fs.readFileSync("src/ui/ui.template.html", "utf8");
  const requiredIds = [
    "htmlPreviewBody",
    "htmlPreviewViewport",
    "htmlPreviewInspectorHighlight",
    "htmlPreviewInspectorResize",
    "htmlPreviewInspector",
    "htmlPreviewInspectorTree",
    "htmlPreviewInspectorDetails"
  ];

  for (const id of requiredIds) {
    assert.match(template, new RegExp(`id="${id}"`));
  }
  const viewportStart = template.indexOf('id="htmlPreviewViewport"');
  const stage = template.indexOf('id="htmlPreviewStage"');
  const inspector = template.indexOf('id="htmlPreviewInspector"');
  const frame = template.indexOf('id="htmlPreviewFrame"');
  assert.ok(viewportStart < stage && stage < frame);
  assert.ok(frame < inspector);
  assert.doesNotMatch(template, /检查布局/);
  assert.doesNotMatch(template, /htmlPreviewInspectorPicker|>选择元素<\/button>/);
  assert.doesNotMatch(template, /id="htmlPreviewInspectorToggle"/);
  assert.doesNotMatch(template, /id="htmlPreviewInspectorClose"/);
});

test("AI HTML preview iframe remains able to initialize the capture runtime", () => {
  const template = fs.readFileSync("src/ui/ui.template.html", "utf8");
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const frameTag = template.match(/<iframe\b[^>]*id="htmlPreviewFrame"[^>]*>/i)?.[0] || "";

  assert.doesNotMatch(frameTag, /\bsandbox=/);
  assert.match(appSource, /const script = doc\.createElement\("script"\)/);
  assert.match(appSource, /doc\.documentElement\.appendChild\(script\)/);
});

test("HTML preview inspector reads the iframe and owns its lifecycle in the parent UI", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const template = fs.readFileSync("src/ui/ui.template.html", "utf8");

  assert.match(appSource, /htmlPreviewInspectorTree/);
  assert.match(appSource, /htmlPreviewInspectorDetails/);
  assert.match(appSource, /formatInspectorElementLabel/);
  assert.match(appSource, /readInspectorLayout/);
  assert.match(appSource, /function initializeHtmlPreviewInspector\(/);
  assert.match(appSource, /function renderHtmlPreviewInspectorTree\(/);
  assert.match(appSource, /function selectHtmlPreviewInspectorElement\(/);
  assert.match(appSource, /function renderHtmlPreviewInspectorDetails\(/);
  assert.match(appSource, /function resetHtmlPreviewInspector\(/);
  assert.match(template, /id="htmlPreviewInspectorDelete"/);
  assert.match(appSource, /function deleteSelectedHtmlPreviewInspectorElement\(/);
  assert.match(appSource, /(?:Delete|Backspace)/);
  assert.match(appSource, /dehydrateCanonicalAssetHtml/);
  assert.match(appSource, /activeHtmlPreviewResult\.canonicalHtml\s*=/);
  assert.match(appSource, /htmlPreviewFrame\.addEventListener\("load",[\s\S]*?initializeHtmlPreviewInspector\(\)/);
  assert.match(appSource, /function closeHtmlPreview\([\s\S]*?resetHtmlPreviewInspector\(\)/);
  assert.doesNotMatch(appSource, /htmlPreviewFrame\.contentDocument\.(?:appendChild|insertBefore|setAttribute)/);
});

test("HTML preview inspector highlight and panel controls stay in parent view state", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");

  assert.match(appSource, /calculateInspectorHighlightRect/);
  assert.match(appSource, /function updateHtmlPreviewInspectorHighlight\(/);
  assert.match(appSource, /htmlPreviewStage\.addEventListener\("scroll"/);
  assert.match(appSource, /htmlPreviewCanvasViewport\s*=\s*createCanvasViewportController\([\s\S]*?updateHtmlPreviewInspectorHighlight\(\)/);
  assert.match(appSource, /clampInspectorWidth\(/);
  assert.match(appSource, /htmlPreviewInspectorResize\.addEventListener\("pointerdown"/);
  assert.doesNotMatch(appSource, /htmlPreviewInspectorOpen/);
  assert.doesNotMatch(appSource, /setHtmlPreviewInspectorOpen/);
  assert.doesNotMatch(appSource, /inspector-collapsed/);
  assert.doesNotMatch(appSource, /htmlPreviewInspector(?:Selected|Hovered)Element\.style/);
});

test("busy dialogs do not duplicate progress in the global status toast", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const setBusySource = appSource.match(/function setBusy\([\s\S]*?\n      \}/)?.[0] || "";

  assert.doesNotMatch(setBusySource, /setStatus|setActiveAiRequestStatus|showStatus/);
  assert.doesNotMatch(appSource, /window\.alert/);
});

test("editable preview failures stay raw and only appear in the loading dialog", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const serverSource = fs.readFileSync("server.js", "utf8");
  const fastServiceSource = fs.readFileSync("src/server/services/fast-editable-html.js", "utf8");
  const previewErrorSource = appSource.match(/function showEditablePreviewLoadingError\([\s\S]*?\n      \}/)?.[0] || "";

  assert.doesNotMatch(appSource, /AI图层导入预览失败/);
  assert.doesNotMatch(previewErrorSource, /失败：\$\{message\}/);
  assert.doesNotMatch(serverSource, /AI H5 还原失败/);
  assert.doesNotMatch(fastServiceSource, /AI H5 还原失败/);
  assert.doesNotMatch(serverSource, /上游连接被中断，通常是请求体过大或模型响应超时/);
});

test("editable preview failure state is explicit and offers retry without loading lock", () => {
  const template = fs.readFileSync("src/ui/ui.template.html", "utf8");
  const styles = fs.readFileSync("src/ui/styles.css", "utf8");
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");

  assert.match(template, /id="editablePreviewLoadingTitle"[^>]*>正在AI图层导入<\/strong>/);
  assert.match(template, /id="editablePreviewRetry"/);
  assert.match(appSource, /editablePreviewLoadingDialog\.dataset\.state\s*=\s*"error"/);
  assert.match(appSource, /editablePreviewLoadingTitle\.textContent\s*=\s*"AI图层导入失败"/);
  assert.match(appSource, /editablePreviewRetry\.addEventListener\("click"/);
  assert.match(appSource, /specializedLoading = .*editablePreviewLoadingDialog\.dataset\.state !== "error"/s);
  assert.match(styles, /\.editable-preview-loading-dialog\[data-state="error"\]/);
});

test("model settings expose two purposes, OpenAI-compatible fields, and one unified test action", () => {
  const template = fs.readFileSync("src/ui/ui.template.html", "utf8");
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const rendererSource = fs.readFileSync("src/ui/renderers/model-settings.js", "utf8");
  const serverSource = fs.readFileSync("server.js", "utf8");

  assert.doesNotMatch(template, /data-provider="openrouter"|测试生图|测试补图|测试连接|连接类型|modelConfigType/);
  assert.doesNotMatch(`${template}\n${appSource}\n${rendererSource}\n${serverSource}`, /codexCli|Codex CLI/);
  assert.match(rendererSource, /data-route-picker="\$\{task\}"/);
  assert.doesNotMatch(template, /id="taskRouteGeneration"|id="taskRouteInpaint"/);
  assert.match(template, /value="vision"[^>]*\/?>图片理解/);
  assert.match(template, /value="image"[^>]*\/?>图片生成 \/ 修补/);
  assert.match(template, /id="newModelConfig"/);
  assert.match(appSource, /getSavedTaskRouteValue\(modelConfigState,\s*task\)/);
  assert.match(appSource, /fetchBackend\(`\/api\/model-configs\/\$\{encodeURIComponent\(configId\)\}\/test`/);
  assert.match(rendererSource, /\/v1\/chat\/completions/);
  assert.match(rendererSource, /\/v1\/images\/generations/);
  assert.match(rendererSource, /\/v1\/images\/edits/);
  assert.match(
    appSource,
    /taskRoutingView\.addEventListener\("click"[\s\S]*?event\.stopPropagation\(\)[\s\S]*?toggleImportHelp\(helpButton\)/
  );
});

test("model settings combine routing and API management on one page with a modal editor", () => {
  const template = fs.readFileSync("src/ui/ui.template.html", "utf8");
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const styles = fs.readFileSync("src/ui/styles.css", "utf8");

  assert.doesNotMatch(template, /modelSettingsTabRouting|modelSettingsTabApi|modelSettingsRoutingView|modelSettingsApiView/);
  assert.doesNotMatch(appSource, /activeModelSettingsTab|setModelSettingsTab|modelSettingsTabRouting|modelSettingsTabApi/);
  assert.match(
    template,
    /class="settings-head"[\s\S]*id="newModelConfig"[^>]*>＋ 新建 API<\/button>[\s\S]*id="settingsClose"/
  );
  assert.ok(template.indexOf("当前使用") < template.indexOf("模型 API"));
  assert.match(template, /id="modelConfigDialog"[^>]*aria-modal="true"/);
  assert.match(template, /id="modelConfigDialogClose"/);
  assert.match(template, /id="modelConfigDialog"[\s\S]*?<form id="modelConfigForm"[\s\S]*?<\/section>/);
  assert.match(appSource, /modelConfigDialogClose\.addEventListener\("click",\s*closeModelConfigEditor\)/);
  assert.match(template, /id="modelConfigTest"[^>]*>测试<\/button>/);
  assert.doesNotMatch(template, /id="modelConfigTest"[^>]*hidden/);
  assert.doesNotMatch(`${template}\n${appSource}`, /modelConfigCancel/);
  assert.match(template, /id="modelConfigModelMenu"[^>]*role="listbox"/);
  assert.match(appSource, /renderEditedModelConfigOptions\(data\.models \|\| \[\]\)/);
  assert.match(appSource, /\/api\/model-configs\/preview\/test/);
  assert.match(appSource, /\/api\/model-configs\/preview\/models/);
  assert.doesNotMatch(appSource, /请先保存配置，再获取模型列表/);
  assert.match(styles, /\.model-config-form-actions\s*{[^}]*display:\s*flex/);
  assert.match(styles, /\.model-config-form-actions\s*>\s*span\s*{[^}]*flex:\s*1/);
  assert.doesNotMatch(appSource, /createElement\("datalist"\)/);
  assert.match(template, /name="modelConfigPurpose"[\s\S]*value="vision"/);
  assert.match(template, /name="modelConfigPurpose"[\s\S]*value="image"/);
  assert.doesNotMatch(appSource, /syncModelConfigTaskExclusivity/);
  assert.match(appSource, /clearTransientModelConfigTestResults\(\);\s*renderModelSettings\(\)/);
  assert.doesNotMatch(`${template}\n${appSource}`, /data-model-config-duplicate|duplicateModelConfig/);
});

test("model route pickers save on click and support closing and keyboard navigation", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");

  assert.doesNotMatch(appSource, /taskRoutingView\.addEventListener\("change"/);
  assert.match(appSource, /taskRoutingView\.addEventListener\("click"[\s\S]*data-route-picker-trigger/);
  assert.match(appSource, /data-route-picker-option/);
  assert.match(appSource, /saveTaskRouteSelection\(\{\s*task,\s*configId/);
  assert.match(appSource, /function closeModelRoutePickers/);
  assert.match(appSource, /event\.key === "Escape"/);
  assert.match(appSource, /event\.key === "ArrowDown"/);
  assert.match(appSource, /event\.key === "ArrowUp"/);
  assert.match(appSource, /event\.key === "Enter"/);
});

test("model editor uses purpose defaults and routes newly created APIs immediately", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");

  assert.match(appSource, /getModelPurposeDefaults\("vision"\)/);
  assert.match(appSource, /getPurposeSwitchModelValue\(/);
  assert.match(appSource, /modelConfigPurposeInputs\.forEach[\s\S]*addEventListener\("change"/);
  assert.match(appSource, /data\.config\?\.id/);
  assert.match(appSource, /saveTaskRouteSelection\(\{\s*task:\s*purpose,\s*configId:\s*savedConfigId/);
});

test("model settings reopen without stale status and use clear active-state styling", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const styles = fs.readFileSync("src/ui/styles.css", "utf8");
  const rendererSource = fs.readFileSync("src/ui/renderers/model-settings.js", "utf8");

  assert.match(
    appSource,
    /settingsTrigger\.addEventListener\("click",\s*\(\)\s*=>\s*\{[\s\S]*?clearModelConfigStatus\(\)/
  );
  assert.match(appSource, /function clearModelConfigStatus\(\)/);
  assert.doesNotMatch(rendererSource, /model-config-tag|model-config-tags/);
  assert.match(styles, /\.model-config-card\.active\s*\{[^}]*#b9dfc7[^}]*#f5fbf7/s);
  assert.match(styles, /\.model-config-active-use\s*\{[^}]*#287449/s);
  assert.match(styles, /\.task-route-row\s*\{[^}]*border:\s*1px solid var\(--line\)[^}]*background:\s*#fff/s);
  assert.match(
    styles,
    /\.task-route-title \.import-help\s*\{[^}]*color:\s*#20232a[^}]*background:\s*#fff/s
  );
  assert.doesNotMatch(styles, /\.model-route-picker-trigger\.selected\s*\{/);
  assert.match(
    styles,
    /\.model-route-picker-menu button\.selected\s*\{[^}]*background:\s*#e8f7ee/s
  );
  assert.match(
    appSource,
    /button\.dataset\.importHelpPlacement === "right"[\s\S]*?buttonRect\.right \+ 8/
  );
  assert.match(
    styles,
    /\.model-route-picker-trigger strong,[\s\S]*?font-size:\s*12px/s
  );
  assert.match(
    styles,
    /\.model-route-picker-trigger small,[\s\S]*?font-size:\s*10px/s
  );
  assert.match(styles, /\.model-config-active-use\s*\{[^}]*font-size:\s*10px/s);
});

test("AI inpaint results stay ordinary assets without an activation interaction", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");
  const styles = fs.readFileSync("src/ui/styles.css", "utf8");

  assert.doesNotMatch(appSource, /data-activate-inpaint-variant/);
  assert.doesNotMatch(appSource, /getEffectiveSliceAssets/);
  assert.doesNotMatch(styles, /\.cut-item\.inpaint-alternative/);
  assert.match(appSource, /const visibleAssets = repairPreviewActive \? \[\] : assets\.filter/);
});

test("all three AI inpaint workflows retain raw and locally composited candidates without local color correction", () => {
  const appSource = fs.readFileSync("src/ui/app.js", "utf8");

  assert.match(appSource, /function installAiInpaintResultPair\(/);
  assert.match(appSource, /async function makeSliceAiComplete[\s\S]*?installAiInpaintResultPair\(/);
  assert.match(appSource, /async function generateBackgroundDecompositionAssets[\s\S]*?createAiInpaintResultPair\(/);
  assert.match(appSource, /pendingAiInpaintRawFullDataUrl/);
  assert.doesNotMatch(appSource, /pendingAiInpaintCorrectedFullDataUrl/);
  assert.doesNotMatch(appSource, /colorCorrectAiInpaintResult/);
  assert.match(appSource, /async function saveSliceImageEditor[\s\S]*?installAiInpaintResultPair/);
  assert.match(appSource, /function buildSliceImageEditorCompletePrompt[\s\S]*?white balance, color temperature, tint, exposure, gamma, contrast, saturation, black point, and white point/);
  assert.match(appSource, /selectedSliceIds\.add\(pair\.composite\.id\)/);
});

test("Figma generation errors notify natively only when UI posting fails", () => {
  const mainSource = fs.readFileSync("src/plugin/main.js", "utf8");

  assert.match(mainSource, /const errorPosted = uiRuntime\.safePostMessage/);
  assert.match(mainSource, /if \(!errorPosted\)\s*\{\s*figma\.notify/);
});
