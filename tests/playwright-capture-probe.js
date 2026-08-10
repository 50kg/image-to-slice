const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const zlib = require("node:zlib");

const { chromium } = require("playwright");
const sharp = require("sharp");
const {
  hydrateCanonicalAssetHtml,
  selectCanonicalReferenceAssets
} = require("../src/ui/services/editable-reference-assets");
const {
  createPlaywrightFigmaCaptureService
} = require("../src/server/services/playwright-figma-capture");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const HISTORY_DIR = path.join(PROJECT_ROOT, ".image-to-slice-history");
const CAPTURE_RUNTIME_PATH = path.join(PROJECT_ROOT, "src/vendor/figma-capture.js");

const COMPUTED_STYLE_NAMES = [
  "display",
  "position",
  "background-color",
  "background-image",
  "clip-path",
  "filter",
  "mask-image",
  "mix-blend-mode"
];

function loadAllRealWorkspaces() {
  const index = JSON.parse(
    fs.readFileSync(path.join(HISTORY_DIR, "index.json"), "utf8")
  );
  assert.match(index.activeDraftId || "", /^draft_[A-Za-z0-9_-]+$/);
  return fs.readdirSync(HISTORY_DIR)
    .filter((filename) => /^draft_[A-Za-z0-9_-]+\.json\.gz$/.test(filename))
    .sort()
    .map((filename) => {
      const compressed = fs.readFileSync(path.join(HISTORY_DIR, filename));
      const id = filename.replace(/\.json\.gz$/, "");
      return {
        id,
        active: id === index.activeDraftId,
        draft: JSON.parse(zlib.gunzipSync(compressed).toString("utf8"))
      };
    });
}

function countCaptureNodes(node) {
  if (!node) return 0;
  return 1 + (node.childNodes || []).reduce(
    (total, child) => total + countCaptureNodes(child),
    0
  );
}

function decodeRareStringData(data, strings) {
  if (!Array.isArray(data?.index) || !Array.isArray(data?.value)) {
    return [];
  }
  return data.index.map((nodeIndex, index) => ({
    nodeIndex,
    value: strings[data.value[index]] || ""
  }));
}

function inspectCdpSnapshot(snapshot) {
  const document = snapshot.documents[0];
  const layoutRows = new Map(
    document.layout.nodeIndex.map((nodeIndex, row) => [nodeIndex, row])
  );
  const pseudoNodes = decodeRareStringData(
    document.nodes.pseudoType,
    snapshot.strings
  )
    .filter((entry) => entry.value === "before" || entry.value === "after")
    .map((entry) => {
      const row = layoutRows.get(entry.nodeIndex);
      return {
        type: entry.value,
        bounds: Number.isInteger(row) ? document.layout.bounds[row] : null,
        paintOrder: Number.isInteger(row)
          ? document.layout.paintOrders[row]
          : null
      };
    });
  const complexFeatureCounts = {
    clipPath: 0,
    filter: 0,
    maskImage: 0,
    mixBlendMode: 0,
    complexBackground: 0
  };
  for (const styleIndexes of document.layout.styles) {
    const styles = Object.fromEntries(COMPUTED_STYLE_NAMES.map(
      (name, index) => [name, snapshot.strings[styleIndexes[index]] || ""]
    ));
    if (styles["clip-path"] && styles["clip-path"] !== "none") {
      complexFeatureCounts.clipPath += 1;
    }
    if (styles.filter && styles.filter !== "none") {
      complexFeatureCounts.filter += 1;
    }
    if (styles["mask-image"] && styles["mask-image"] !== "none") {
      complexFeatureCounts.maskImage += 1;
    }
    if (
      styles["mix-blend-mode"]
      && styles["mix-blend-mode"] !== "normal"
    ) {
      complexFeatureCounts.mixBlendMode += 1;
    }
    if (
      /(?:conic-gradient|repeating-(?:linear|radial|conic)-gradient)\(/i
        .test(styles["background-image"])
    ) {
      complexFeatureCounts.complexBackground += 1;
    }
  }
  return {
    layoutNodeCount: document.layout.nodeIndex.length,
    pseudoNodes,
    complexFeatureCounts
  };
}

async function waitForPageResources(page) {
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await Promise.all([...document.images].map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    }));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
  });
}

async function captureWorkspace(browser, workspace, captureRuntime, outputDir) {
  const startedAt = performance.now();
  const { id, active, draft } = workspace;
  const screen = draft.manifest?.screen;
  const resultImage = draft.manifest?.resultImages?.[0];
  const canonicalHtml = draft.htmlPreview?.canonicalHtml;
  const allAssets = resultImage?.sliceManifest?.assets || [];
  const prepareStartedAt = performance.now();
  const referencedAssets = selectCanonicalReferenceAssets(
    canonicalHtml,
    allAssets
  );
  const hydratedHtml = hydrateCanonicalAssetHtml(
    canonicalHtml,
    referencedAssets
  );

  assert.ok(screen?.width > 0);
  assert.ok(screen?.height > 0);
  assert.match(canonicalHtml, /class=["'][^"']*\bscreen\b/);
  assert.ok(referencedAssets.length > 0);

  const prepareMs = performance.now() - prepareStartedAt;
  const contextStartedAt = performance.now();
  const context = await browser.newContext({
    viewport: {
      width: Math.ceil(screen.width),
      height: Math.ceil(screen.height)
    },
    deviceScaleFactor: 1
  });
  try {
    const page = await context.newPage();
    const contextMs = performance.now() - contextStartedAt;
    const loadStartedAt = performance.now();
    await page.setContent(hydratedHtml, { waitUntil: "domcontentloaded" });
    await waitForPageResources(page);
    const loadMs = performance.now() - loadStartedAt;

    await page.addScriptTag({
      content: captureRuntime
    });
    const vendorCaptureStartedAt = performance.now();
    const rawCapture = await page.evaluate(() =>
      window.figma.captureRawForDesign(".screen")
    );
    const capture = typeof rawCapture === "string"
      ? JSON.parse(rawCapture)
      : rawCapture;

    assert.ok(capture?.root?.rect);
    assert.ok(Math.abs(capture.root.rect.width - screen.width) <= 1);
    assert.ok(Math.abs(capture.root.rect.height - screen.height) <= 1);
    assert.ok(countCaptureNodes(capture.root) > 1);
    const vendorCaptureMs = performance.now() - vendorCaptureStartedAt;

    const cdp = await context.newCDPSession(page);
    const cdpStartedAt = performance.now();
    const snapshot = await cdp.send("DOMSnapshot.captureSnapshot", {
      computedStyles: COMPUTED_STYLE_NAMES,
      includePaintOrder: true,
      includeDOMRects: true
    });
    assert.equal(snapshot.documents.length, 1);
    assert.ok(snapshot.documents[0].layout.nodeIndex.length > 0);
    assert.equal(
      snapshot.documents[0].layout.paintOrders.length,
      snapshot.documents[0].layout.nodeIndex.length
    );
    const cdpMs = performance.now() - cdpStartedAt;
    const cdpInspection = inspectCdpSnapshot(snapshot);

    const screenshotPath = path.join(outputDir, `${id}.png`);
    const screenshotStartedAt = performance.now();
    await page.locator(".screen").screenshot({
      path: screenshotPath,
      omitBackground: true
    });
    const screenshot = fs.readFileSync(screenshotPath);
    assert.deepEqual(
      [...screenshot.subarray(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10]
    );
    const screenshotMs = performance.now() - screenshotStartedAt;

    return {
      draftId: id,
      active,
      screen: {
        width: screen.width,
        height: screen.height
      },
      referencedAssetCount: referencedAssets.length,
      captureNodeCount: countCaptureNodes(capture.root),
      cdpLayoutNodeCount: cdpInspection.layoutNodeCount,
      pseudoNodeCount: cdpInspection.pseudoNodes.length,
      pseudoNodes: cdpInspection.pseudoNodes,
      complexFeatureCounts: cdpInspection.complexFeatureCounts,
      screenshotPath,
      screenshotBytes: screenshot.length,
      timingMs: {
        prepare: Math.round(prepareMs),
        context: Math.round(contextMs),
        load: Math.round(loadMs),
        figmaCapture: Math.round(vendorCaptureMs),
        cdp: Math.round(cdpMs),
        screenshot: Math.round(screenshotMs),
        total: Math.round(performance.now() - startedAt)
      }
    };
  } finally {
    await context.close();
  }
}

function countMatchingCaptureNodes(node, predicate) {
  if (!node) return 0;
  return (predicate(node) ? 1 : 0) + (node.childNodes || []).reduce(
    (total, child) => total + countMatchingCaptureNodes(child, predicate),
    0
  );
}

async function captureInlinePseudoProbe(workspace) {
  const screen = workspace.draft.manifest?.screen;
  const resultImage = workspace.draft.manifest?.resultImages?.[0];
  const canonicalHtml = workspace.draft.htmlPreview?.canonicalHtml;
  const allAssets = resultImage?.sliceManifest?.assets || [];
  const referencedAssets = selectCanonicalReferenceAssets(
    canonicalHtml,
    allAssets
  );
  const hydratedHtml = hydrateCanonicalAssetHtml(
    canonicalHtml,
    referencedAssets
  );
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: {
        width: Math.ceil(screen.width),
        height: Math.ceil(screen.height)
      },
      deviceScaleFactor: 1
    });
    try {
      const page = await context.newPage();
      await page.setContent(hydratedHtml, { waitUntil: "domcontentloaded" });
      await waitForPageResources(page);
      const materialized = await page.evaluate(async () => {
        const owner = [...document.querySelectorAll(".task-item p")]
          .find((element) => element.textContent.trim() === "+10");
        if (!owner) {
          throw new Error("真实案例里没有找到 +10 任务积分");
        }
        const pseudoStyle = getComputedStyle(owner, "::before");
        const marker = "inline-leaf-before";
        owner.setAttribute("data-playwright-pseudo-owner", marker);
        const disableStyle = document.createElement("style");
        disableStyle.textContent = `[data-playwright-pseudo-owner="${marker}"]::before{content:none!important}`;
        document.head.appendChild(disableStyle);

        const pseudo = document.createElement("span");
        pseudo.setAttribute("aria-hidden", "true");
        pseudo.setAttribute("data-playwright-pseudo-probe", marker);
        for (const property of pseudoStyle) {
          const value = pseudoStyle.getPropertyValue(property);
          if (!value) continue;
          pseudo.style.setProperty(
            property,
            value,
            pseudoStyle.getPropertyPriority(property)
          );
        }
        pseudo.style.setProperty("content", "none");
        pseudo.style.setProperty("pointer-events", "none");
        owner.insertBefore(pseudo, owner.firstChild);
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
        const rect = pseudo.getBoundingClientRect();
        return {
          text: [...owner.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent)
            .join("")
            .trim(),
          style: [...getComputedStyle(pseudo)].map((property) => ({
            property,
            value: getComputedStyle(pseudo).getPropertyValue(property),
            priority: getComputedStyle(pseudo).getPropertyPriority(property)
          })),
          bounds: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          }
        };
      });

      assert.ok(materialized.bounds.width > 0);
      assert.ok(materialized.bounds.height > 0);
      await page.addScriptTag({
        content: fs.readFileSync(CAPTURE_RUNTIME_PATH, "utf8")
      });
      const rawCapture = await page.evaluate(() =>
        window.figma.captureRawForDesign(".screen")
      );
      const capture = typeof rawCapture === "string"
        ? JSON.parse(rawCapture)
        : rawCapture;
      const outputDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "playwright-inline-pseudo-")
      );
      const pngPath = path.join(outputDir, "inline-leaf-before.png");
      const isolatedPage = await context.newPage();
      await isolatedPage.setViewportSize({
        width: Math.max(1, Math.ceil(materialized.bounds.width)),
        height: Math.max(1, Math.ceil(materialized.bounds.height))
      });
      await isolatedPage.setContent([
        "<!doctype html>",
        '<html style="margin:0;background:transparent;">',
        '<body style="margin:0;background:transparent;overflow:hidden;">',
        '<span id="pseudo"></span>',
        "</body>",
        "</html>"
      ].join(""));
      await isolatedPage.evaluate(({ declarations, width, height }) => {
        const pseudo = document.getElementById("pseudo");
        declarations.forEach(({ property, value, priority }) => {
          if (value) pseudo.style.setProperty(
            property,
            value,
            priority || ""
          );
        });
        pseudo.style.setProperty("content", "none", "important");
        pseudo.style.setProperty("position", "relative", "important");
        pseudo.style.setProperty("left", "0px", "important");
        pseudo.style.setProperty("top", "0px", "important");
        pseudo.style.setProperty("margin", "0px", "important");
        pseudo.style.setProperty("width", `${width}px`, "important");
        pseudo.style.setProperty("height", `${height}px`, "important");
      }, {
        declarations: materialized.style,
        width: materialized.bounds.width,
        height: materialized.bounds.height
      });
      await isolatedPage.locator("#pseudo").screenshot({
        path: pngPath,
        omitBackground: true
      });
      await isolatedPage.close();
      const png = fs.readFileSync(pngPath);
      const alpha = await analyzePngAlpha(pngPath);

      return {
        text: materialized.text,
        bounds: materialized.bounds,
        textCaptureCount: countMatchingCaptureNodes(
          capture.root,
          (node) => node.nodeType === 3
            && String(node.text || "").trim() === "+10"
        ),
        pseudoCaptureCount: countMatchingCaptureNodes(
          capture.root,
          (node) => node.nodeType === 1
            && String(node.tag || "").toLowerCase() === "span"
            && Math.abs(Number(node.rect?.x) - materialized.bounds.x) <= 0.5
            && Math.abs(Number(node.rect?.y) - materialized.bounds.y) <= 0.5
            && Math.abs(Number(node.rect?.width) - materialized.bounds.width)
              <= 0.5
            && Math.abs(Number(node.rect?.height) - materialized.bounds.height)
              <= 0.5
            && /gradient\(/i.test(String(node.styles?.backgroundImage || ""))
        ),
        pngPath,
        pngBytes: png.length,
        ...alpha
      };
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

async function readPngRgba(filePath) {
  return sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function comparePngPixels(expectedPath, actualPath, channelTolerance = 3) {
  const [expected, actual] = await Promise.all([
    readPngRgba(expectedPath),
    readPngRgba(actualPath)
  ]);
  assert.equal(actual.info.width, expected.info.width);
  assert.equal(actual.info.height, expected.info.height);
  let differentPixels = 0;
  let absoluteDifference = 0;
  const pixelCount = expected.info.width * expected.info.height;
  for (let offset = 0; offset < expected.data.length; offset += 4) {
    let pixelDifferent = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const difference = Math.abs(
        expected.data[offset + channel] - actual.data[offset + channel]
      );
      absoluteDifference += difference;
      if (difference > channelTolerance) pixelDifferent = true;
    }
    if (pixelDifferent) differentPixels += 1;
  }
  return {
    differenceRatio: differentPixels / pixelCount,
    meanAbsoluteDifference: absoluteDifference / expected.data.length
  };
}

async function analyzePngAlpha(filePath) {
  const image = await readPngRgba(filePath);
  let transparentPixelCount = 0;
  let visiblePixelCount = 0;
  for (let offset = 3; offset < image.data.length; offset += 4) {
    if (image.data[offset] === 0) transparentPixelCount += 1;
    if (image.data[offset] > 0) visiblePixelCount += 1;
  }
  return {
    width: image.info.width,
    height: image.info.height,
    transparentPixelCount,
    visiblePixelCount
  };
}

async function captureMountainWashPixelLoop(workspace) {
  const screen = workspace.draft.manifest?.screen;
  const resultImage = workspace.draft.manifest?.resultImages?.[0];
  const canonicalHtml = workspace.draft.htmlPreview?.canonicalHtml;
  const allAssets = resultImage?.sliceManifest?.assets || [];
  const referencedAssets = selectCanonicalReferenceAssets(
    canonicalHtml,
    allAssets
  );
  const hydratedHtml = hydrateCanonicalAssetHtml(
    canonicalHtml,
    referencedAssets
  );
  const outputDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "playwright-mountain-wash-")
  );
  const baselinePath = path.join(outputDir, "baseline.png");
  const isolatedLayerPath = path.join(outputDir, "isolated-layer.png");
  const reconstructedPath = path.join(outputDir, "reconstructed.png");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: {
        width: Math.ceil(screen.width),
        height: Math.ceil(screen.height)
      },
      deviceScaleFactor: 1
    });
    try {
      const page = await context.newPage();
      await page.setContent(hydratedHtml, { waitUntil: "domcontentloaded" });
      await waitForPageResources(page);
      const owner = page.locator(".mountain-wash");
      const bounds = await owner.boundingBox();
      assert.ok(bounds);
      await owner.screenshot({ path: baselinePath });

      const computedLayers = await page.evaluate(() => {
        const owner = document.querySelector(".mountain-wash");
        if (!owner) throw new Error("真实青花瓷案例缺少 mountain-wash");
        const readStyle = (style) => [...style].map((property) => ({
          property,
          value: style.getPropertyValue(property),
          priority: style.getPropertyPriority(property)
        }));
        return {
          owner: readStyle(getComputedStyle(owner)),
          before: readStyle(getComputedStyle(owner, "::before")),
          after: readStyle(getComputedStyle(owner, "::after"))
        };
      });

      const isolatedPage = await context.newPage();
      await isolatedPage.setViewportSize({
        width: Math.ceil(bounds.width),
        height: Math.ceil(bounds.height)
      });
      await isolatedPage.setContent([
        "<!doctype html>",
        '<html style="margin:0;background:transparent;">',
        '<body style="margin:0;background:transparent;overflow:hidden;">',
        '<div id="owner"><span id="before"></span><span id="after"></span></div>',
        "</body>",
        "</html>"
      ].join(""));
      await isolatedPage.evaluate(({ layers, width, height }) => {
        const applyStyle = (element, declarations) => {
          declarations.forEach(({ property, value, priority }) => {
            if (value) element.style.setProperty(
              property,
              value,
              priority || ""
            );
          });
        };
        const owner = document.getElementById("owner");
        const before = document.getElementById("before");
        const after = document.getElementById("after");
        applyStyle(owner, layers.owner);
        applyStyle(before, layers.before);
        applyStyle(after, layers.after);
        owner.style.setProperty("position", "relative", "important");
        owner.style.setProperty("left", "0px", "important");
        owner.style.setProperty("top", "0px", "important");
        owner.style.setProperty("margin", "0px", "important");
        owner.style.setProperty("width", `${width}px`, "important");
        owner.style.setProperty("height", `${height}px`, "important");
        before.style.setProperty("content", "none", "important");
        after.style.setProperty("content", "none", "important");
      }, {
        layers: computedLayers,
        width: bounds.width,
        height: bounds.height
      });
      await isolatedPage.locator("#owner").screenshot({
        path: isolatedLayerPath,
        omitBackground: true
      });
      const isolatedLayerDataUrl = `data:image/png;base64,${
        fs.readFileSync(isolatedLayerPath).toString("base64")
      }`;
      await page.evaluate(async (dataUrl) => {
        const owner = document.querySelector(".mountain-wash");
        owner.setAttribute("data-pixel-loop-owner", "true");
        const disableStyle = document.createElement("style");
        disableStyle.textContent = [
          '[data-pixel-loop-owner="true"]::before,',
          '[data-pixel-loop-owner="true"]::after{content:none!important}'
        ].join("");
        document.head.appendChild(disableStyle);
        owner.style.setProperty("opacity", "1", "important");
        const image = document.createElement("img");
        image.src = dataUrl;
        image.alt = "";
        image.style.cssText = [
          "position:absolute",
          "left:0",
          "top:0",
          "width:100%",
          "height:100%",
          "display:block",
          "pointer-events:none"
        ].join(";");
        owner.appendChild(image);
        await image.decode();
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
      }, isolatedLayerDataUrl);
      await owner.screenshot({ path: reconstructedPath });

      const alpha = await analyzePngAlpha(isolatedLayerPath);
      const difference = await comparePngPixels(
        baselinePath,
        reconstructedPath
      );
      const result = {
        mode: "owner-decoration-layer",
        bounds: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height
        },
        ...alpha,
        ...difference,
        baselinePath,
        isolatedLayerPath,
        reconstructedPath,
        outputDir
      };
      fs.writeFileSync(
        path.join(outputDir, "report.json"),
        `${JSON.stringify(result, null, 2)}\n`
      );
      console.log(JSON.stringify(result, null, 2));
      return result;
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

test("Playwright captures all current real slice workspaces with figma-capture and CDP", async () => {
  const workspaces = loadAllRealWorkspaces();
  assert.ok(workspaces.length > 0);
  const outputDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "playwright-capture-four-cases-")
  );
  const captureRuntime = fs.readFileSync(CAPTURE_RUNTIME_PATH, "utf8");
  const launchStartedAt = performance.now();
  const browser = await chromium.launch({ headless: true });
  const browserLaunchMs = Math.round(performance.now() - launchStartedAt);
  try {
    const cases = [];
    for (const workspace of workspaces) {
      cases.push(await captureWorkspace(
        browser,
        workspace,
        captureRuntime,
        outputDir
      ));
    }
    assert.equal(cases.length, workspaces.length);
    assert.ok(cases.every((item) => item.captureNodeCount > 1));
    assert.ok(cases.reduce(
      (total, item) => total + item.pseudoNodeCount,
      0
    ) > 0);

    const totalMs = cases.reduce(
      (total, item) => total + item.timingMs.total,
      browserLaunchMs
    );
    const report = {
      browserLaunchMs,
      totalMs,
      averageWarmCaseMs: Math.round(
        cases.reduce(
          (total, item) => total + item.timingMs.total,
          0
        ) / cases.length
      ),
      outputDir,
      cases
    };
    const reportPath = path.join(outputDir, "report.json");
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  } finally {
    await browser.close();
  }
});

test("Playwright keeps +10 as text and captures its inline leaf pseudo as a separate PNG", async () => {
  const workspace = loadAllRealWorkspaces()
    .find((item) => item.id === "draft_ms852jfv");
  assert.ok(workspace);

  const result = await captureInlinePseudoProbe(workspace);
  console.log(JSON.stringify(result, null, 2));

  assert.equal(result.text, "+10");
  assert.ok(result.textCaptureCount > 0);
  assert.ok(result.pseudoCaptureCount > 0);
  assert.ok(result.bounds.width > 0);
  assert.ok(result.bounds.height > 0);
  assert.ok(result.pngBytes > 100);
  assert.ok(result.transparentPixelCount > 0);
  assert.ok(result.visiblePixelCount > 0);
});

test("Playwright rebuilds the blue-and-white mountain wash from a transparent isolated layer", async () => {
  const workspace = loadAllRealWorkspaces()
    .find((item) => item.id === "draft_ms82vly7");
  assert.ok(workspace);

  const result = await captureMountainWashPixelLoop(workspace);

  assert.equal(result.mode, "owner-decoration-layer");
  assert.equal(result.bounds.width, 220);
  assert.equal(result.bounds.height, 155);
  assert.ok(result.transparentPixelCount > 0);
  assert.ok(result.visiblePixelCount > 0);
  assert.ok(result.differenceRatio <= 0.01);
});

test("production high-fidelity provider captures all current real slice workspaces", async () => {
  const workspaces = loadAllRealWorkspaces();
  assert.ok(workspaces.length > 0);
  const service = createPlaywrightFigmaCaptureService({
    chromium,
    captureRuntime: fs.readFileSync(CAPTURE_RUNTIME_PATH, "utf8")
  });
  const cases = [];
  const startedAt = performance.now();
  try {
    for (const workspace of workspaces) {
      const screen = workspace.draft.manifest?.screen;
      const resultImage = workspace.draft.manifest?.resultImages?.[0];
      const canonicalHtml = workspace.draft.htmlPreview?.canonicalHtml;
      const allAssets = resultImage?.sliceManifest?.assets || [];
      const referencedAssets = selectCanonicalReferenceAssets(
        canonicalHtml,
        allAssets
      );
      const hydratedHtml = hydrateCanonicalAssetHtml(
        canonicalHtml,
        referencedAssets
      );
      const caseStartedAt = performance.now();
      const result = await service.capture({
        html: hydratedHtml,
        width: screen.width,
        height: screen.height
      });
      const sourceConicCount = (
        canonicalHtml.match(/(?:repeating-)?conic-gradient\(/gi) || []
      ).length;
      if (sourceConicCount > 0) {
        assert.ok(
          result.diagnostics.editableConicLayers
          + result.diagnostics.complexBackgroundLayers
          > 0
        );
      }
      if (workspace.id === "draft_ms82vly7") {
        const mountainLayer = result.diagnostics.layers.find((layer) => (
          layer.mode === "host-decoration"
          && Math.round(layer.bounds.width) === 220
          && Math.round(layer.bounds.height) === 155
        ));
        assert.ok(mountainLayer);
        assert.ok(mountainLayer.transparentPixelCount > 0);
        assert.ok(mountainLayer.visiblePixelCount > 0);
      }
      if (workspace.id === "draft_ms852jfv") {
        const leafLayer = result.diagnostics.layers.find((layer) => (
          layer.mode === "inline-pseudo"
          && Math.round(layer.width) === 18
          && Math.round(layer.height) === 12
        ));
        assert.ok(leafLayer);
        assert.ok(leafLayer.transparentPixelCount > 0);
        assert.ok(leafLayer.visiblePixelCount > 0);
        assert.ok(countMatchingCaptureNodes(
          result.capture.root,
          (node) => node.nodeType === 3
            && String(node.text || "").trim() === "+10"
        ) > 0);
      }
      cases.push({
        draftId: workspace.id,
        captureNodeCount: countCaptureNodes(result.capture.root),
        totalPseudoLayers: result.diagnostics.layers.length,
        inlinePseudoLayers: result.diagnostics.inlinePseudoLayers,
        hostDecorationLayers: result.diagnostics.hostDecorationLayers,
        editableConicLayers: result.diagnostics.editableConicLayers,
        complexBackgroundLayers: result.diagnostics.complexBackgroundLayers,
        elapsedMs: Math.round(performance.now() - caseStartedAt)
      });
    }
  } finally {
    await service.close();
  }

  assert.equal(cases.length, workspaces.length);
  assert.ok(cases.every((item) => item.captureNodeCount > 1));
  assert.ok(cases.reduce(
    (total, item) => total + item.totalPseudoLayers,
    0
  ) > 0);
  console.log(JSON.stringify({
    totalMs: Math.round(performance.now() - startedAt),
    cases
  }, null, 2));
});
