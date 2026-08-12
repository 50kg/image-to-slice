const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { chromium } = require("playwright");
const {
  createPlaywrightFigmaCaptureService
} = require("../../src/server/services/playwright-figma-capture");

const captureRuntime = fs.readFileSync(
  path.join(__dirname, "../../src/vendor/figma-capture.js"),
  "utf8"
);

function countCaptureNodes(node) {
  if (!node) return 0;
  return 1 + (node.childNodes || []).reduce(
    (total, child) => total + countCaptureNodes(child),
    0
  );
}

function findCaptureNodes(node, predicate, results = []) {
  if (!node) return results;
  if (predicate(node)) results.push(node);
  for (const child of node.childNodes || []) {
    findCaptureNodes(child, predicate, results);
  }
  return results;
}

test("Playwright capture retries Chromium launch after a transient failure", async () => {
  let launches = 0;
  const service = createPlaywrightFigmaCaptureService({
    chromium: {
      async launch() {
        launches += 1;
        if (launches === 1) throw new Error("transient launch failure");
        return {
          async newContext() {
            throw new Error("second launch reached browser");
          }
        };
      }
    },
    captureRuntime: "runtime"
  });

  const payload = { html: '<div class="screen"></div>', width: 10, height: 10 };
  await assert.rejects(service.capture(payload), /transient launch failure/);
  await assert.rejects(service.capture(payload), /second launch reached browser/);
  assert.equal(launches, 2);
});

test("high-fidelity capture validates its HTML and fixed screen size", async () => {
  const service = createPlaywrightFigmaCaptureService({
    chromium,
    captureRuntime
  });

  await assert.rejects(
    () => service.capture({ html: "", width: 750, height: 1334 }),
    /HTML/
  );
  await assert.rejects(
    () => service.capture({ html: "<div></div>", width: 0, height: 1334 }),
    /画板尺寸/
  );
});

test("high-fidelity capture keeps text editable and rasterizes inline and host pseudos with transparency", async () => {
  const service = createPlaywrightFigmaCaptureService({
    chromium,
    captureRuntime
  });
  const html = `<!doctype html>
    <html>
      <style>
        html,body{margin:0;background:#f8edcf}
        .screen{position:relative;width:320px;height:240px;background:#f8edcf}
        .score{position:absolute;left:20px;top:20px;font:16px Arial;color:#163f2b}
        .score::before{
          content:"";display:inline-block;width:18px;height:12px;margin-right:6px;
          background:linear-gradient(145deg,#9acb35,#4c8c18);
          border-radius:100% 0 100% 0;transform:rotate(-16deg)
        }
        .mountain{position:absolute;left:20px;top:70px;width:220px;height:155px;opacity:.11;overflow:hidden}
        .mountain::before,.mountain::after{
          content:"";position:absolute;left:0;bottom:0;width:180px;height:120px;
          background:#173f72;filter:blur(2px);
          clip-path:polygon(0 100%,20% 55%,35% 70%,55% 20%,75% 70%,100% 100%)
        }
        .mountain::after{left:70px;width:150px;height:95px;opacity:.72}
      </style>
      <div class="screen">
        <p class="score">+10</p>
        <div class="mountain"></div>
      </div>
    </html>`;

  try {
    const result = await service.capture({
      html,
      width: 320,
      height: 240
    });

    assert.ok(result.capture?.root?.rect);
    assert.ok(countCaptureNodes(result.capture.root) > 3);
    assert.ok(findCaptureNodes(
      result.capture.root,
      (node) => node.nodeType === 3
        && String(node.text || "").trim() === "+10"
    ).length > 0);
    assert.ok(result.diagnostics.cdpPseudoNodeCount >= 3);
    assert.equal(result.diagnostics.inlinePseudoLayers, 1);
    assert.equal(result.diagnostics.hostDecorationLayers, 1);
    assert.ok(result.diagnostics.layers.every(
      (layer) => layer.transparentPixelCount > 0
        && layer.visiblePixelCount > 0
    ));
    assert.ok(Object.keys(result.capture.assets || {}).filter(
      (assetUrl) => /^data:image\/png;base64,/i.test(assetUrl)
    ).length >= 2);
  } finally {
    await service.close();
  }
});

test("high-fidelity capture keeps plain pseudo text editable and rasterizes visual pseudo text", async () => {
  const service = createPlaywrightFigmaCaptureService({
    chromium,
    captureRuntime
  });
  const html = `<!doctype html>
    <html>
      <style>
        html,body{margin:0;background:#fff}
        .screen{position:relative;width:320px;height:180px;background:#fff}
        .badge,.icon,.outlined,.image-content{
          position:absolute;left:20px;font:18px Arial;color:#222
        }
        .badge{top:20px}
        .icon{top:65px}
        .outlined{top:110px}
        .image-content{left:180px;top:20px}
        .badge::before{content:"NEW";color:#d00;font-weight:700}
        .icon::before{
          content:"★";font-family:"Example Icon",Arial;color:#079447;font-size:24px
        }
        .outlined::before{
          content:"VIP";color:#fff;font-weight:700;
          text-shadow:0 1px 3px #000
        }
        .image-content::before{
          content:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18'%3E%3Crect width='18' height='18' rx='4' fill='%232563eb'/%3E%3C/svg%3E");
          display:inline-block;width:18px;height:18px
        }
      </style>
      <div class="screen">
        <p class="badge"></p>
        <p class="icon"></p>
        <p class="outlined"></p>
        <p class="image-content"></p>
      </div>
    </html>`;

  try {
    const result = await service.capture({
      html,
      width: 320,
      height: 180
    });
    const capturedText = findCaptureNodes(
      result.capture.root,
      (node) => node.nodeType === 3 && String(node.text || "").trim()
    ).map((node) => String(node.text || "").trim());
    const pngAssets = Object.keys(result.capture.assets || {}).filter(
      (assetUrl) => /^data:image\/png;base64,/i.test(assetUrl)
    );

    assert.ok(capturedText.includes("NEW"));
    assert.equal(capturedText.includes("★"), false);
    assert.equal(capturedText.includes("VIP"), false);
    assert.equal(result.diagnostics.textPseudoLayers, 1);
    assert.equal(result.diagnostics.inlinePseudoLayers, 3);
    assert.ok(pngAssets.length >= 3);
    assert.ok(result.diagnostics.layers.every(
      (layer) => layer.transparentPixelCount > 0
        && layer.visiblePixelCount > 0
    ));
  } finally {
    await service.close();
  }
});

test("high-fidelity capture keeps simple conic backgrounds editable without flattening children", async () => {
  const service = createPlaywrightFigmaCaptureService({
    chromium,
    captureRuntime
  });
  const html = `<!doctype html>
    <html>
      <style>
        html,body{margin:0;background:#fff}
        .screen{position:relative;width:320px;height:240px;background:#fff}
        .distribution-chart{
          position:absolute;left:40px;top:30px;width:137px;height:137px;
          border-radius:50%;
          background:conic-gradient(
            #a58aee 0deg 244.8deg,
            #d2b7ba 244.8deg 309.6deg,
            #c6c8a9 309.6deg 345.6deg,
            #f0b779 345.6deg 360deg
          )
        }
        .distribution-hole{
          position:absolute;left:29px;top:29px;width:79px;height:79px;
          display:grid;place-items:center;border-radius:50%;background:#fff
        }
        .distribution-total{font:24px Georgia;color:#523751}
      </style>
      <div class="screen">
        <div class="distribution-chart">
          <div class="distribution-hole">
            <span class="distribution-total">1280</span>
          </div>
        </div>
      </div>
    </html>`;

  try {
    const result = await service.capture({
      html,
      width: 320,
      height: 240
    });
    const capturedText = findCaptureNodes(
      result.capture.root,
      (node) => node.nodeType === 3 && String(node.text || "").trim()
    ).map((node) => String(node.text || "").trim());
    const pngAssets = Object.keys(result.capture.assets || {}).filter(
      (assetUrl) => /^data:image\/png;base64,/i.test(assetUrl)
    );
    const remainingConicBackgrounds = findCaptureNodes(
      result.capture.root,
      (node) => /conic-gradient/i.test(
        String(node.styles?.backgroundImage || "")
      )
    );
    const editableAngularNodes = findCaptureNodes(
      result.capture.root,
      (node) => node.editableGradient?.type === "angular"
    );

    assert.equal(result.diagnostics.editableConicLayers, 1);
    assert.equal(result.diagnostics.complexBackgroundLayers, 0);
    assert.ok(capturedText.includes("1280"));
    assert.equal(pngAssets.length, 0);
    assert.equal(remainingConicBackgrounds.length, 1);
    assert.equal(editableAngularNodes.length, 1);
    assert.deepEqual(editableAngularNodes[0].editableGradient, {
      type: "angular",
      angle: 0,
      stops: [
        { color: "#a58aee", opacity: 1, position: 0 },
        { color: "#a58aee", opacity: 1, position: 0.68 },
        { color: "#d2b7ba", opacity: 1, position: 0.68 },
        { color: "#d2b7ba", opacity: 1, position: 0.86 },
        { color: "#c6c8a9", opacity: 1, position: 0.86 },
        { color: "#c6c8a9", opacity: 1, position: 0.96 },
        { color: "#f0b779", opacity: 1, position: 0.96 },
        { color: "#f0b779", opacity: 1, position: 1 }
      ]
    });
  } finally {
    await service.close();
  }
});

test("high-fidelity capture keeps repeating conic backgrounds on the PNG fallback", async () => {
  const service = createPlaywrightFigmaCaptureService({
    chromium,
    captureRuntime
  });
  const html = `<!doctype html>
    <html>
      <style>
        html,body{margin:0;background:#fff}
        .screen{position:relative;width:240px;height:180px;background:#fff}
        .pattern{
          position:absolute;left:30px;top:20px;width:120px;height:120px;
          background:repeating-conic-gradient(#111 0deg 12deg,#eee 12deg 24deg)
        }
      </style>
      <div class="screen"><div class="pattern"></div></div>
    </html>`;

  try {
    const result = await service.capture({ html, width: 240, height: 180 });
    const pngAssets = Object.keys(result.capture.assets || {}).filter(
      (assetUrl) => /^data:image\/png;base64,/i.test(assetUrl)
    );
    const editableAngularNodes = findCaptureNodes(
      result.capture.root,
      (node) => node.editableGradient?.type === "angular"
    );

    assert.equal(result.diagnostics.editableConicLayers, 0);
    assert.equal(result.diagnostics.complexBackgroundLayers, 1);
    assert.ok(pngAssets.length >= 1);
    assert.equal(editableAngularNodes.length, 0);
  } finally {
    await service.close();
  }
});

test("high-fidelity capture keeps clipped conic backgrounds on the PNG fallback", async () => {
  const service = createPlaywrightFigmaCaptureService({
    chromium,
    captureRuntime
  });
  const html = `<!doctype html>
    <html>
      <style>
        html,body{margin:0;background:#fff}
        .screen{position:relative;width:240px;height:180px;background:#fff}
        .fan{
          position:absolute;left:30px;top:20px;width:120px;height:120px;
          background:conic-gradient(#111 0deg 180deg,#eee 180deg 360deg);
          clip-path:polygon(50% 50%,100% 0,100% 100%)
        }
      </style>
      <div class="screen"><div class="fan"></div></div>
    </html>`;

  try {
    const result = await service.capture({ html, width: 240, height: 180 });
    const pngAssets = Object.keys(result.capture.assets || {}).filter(
      (assetUrl) => /^data:image\/png;base64,/i.test(assetUrl)
    );

    assert.equal(result.diagnostics.editableConicLayers, 0);
    assert.equal(result.diagnostics.complexBackgroundLayers, 1);
    assert.ok(pngAssets.length >= 1);
  } finally {
    await service.close();
  }
});

test("high-fidelity capture rasterizes unsupported complex DOM without duplicating its children", async () => {
  const service = createPlaywrightFigmaCaptureService({
    chromium,
    captureRuntime
  });
  const html = `<!doctype html>
    <html>
      <style>
        html,body{margin:0;background:#fff}
        .screen{position:relative;width:360px;height:260px;background:#fff}
        .chart{position:absolute;left:20px;top:20px;width:90px;height:60px}
        .filtered-svg{position:absolute;left:135px;top:20px;width:90px;height:60px}
        .filtered-card{
          position:absolute;left:20px;top:110px;width:180px;height:70px;
          display:grid;place-items:center;background:#ef476f;color:#fff;
          filter:drop-shadow(0 5px 4px rgba(0,0,0,.35))
        }
        .outside{position:absolute;left:20px;top:215px;font:18px Arial;color:#222}
      </style>
      <div class="screen">
        <canvas class="chart" width="90" height="60"></canvas>
        <svg class="filtered-svg" viewBox="0 0 90 60">
          <defs>
            <filter id="blur"><feGaussianBlur stdDeviation="3"/></filter>
          </defs>
          <circle cx="45" cy="30" r="23" fill="#2563eb" filter="url(#blur)"/>
        </svg>
        <div class="filtered-card"><strong>Filtered child</strong></div>
        <p class="outside">Outside text</p>
      </div>
      <script>
        const context = document.querySelector(".chart").getContext("2d");
        context.fillStyle = "#10b981";
        context.fillRect(0, 0, 90, 60);
        context.fillStyle = "#fff";
        context.fillRect(15, 15, 60, 30);
      </script>
    </html>`;

  try {
    const result = await service.capture({
      html,
      width: 360,
      height: 260
    });
    const capturedText = findCaptureNodes(
      result.capture.root,
      (node) => node.nodeType === 3 && String(node.text || "").trim()
    ).map((node) => String(node.text || "").trim());
    const pngAssets = Object.keys(result.capture.assets || {}).filter(
      (assetUrl) => /^data:image\/png;base64,/i.test(assetUrl)
    );
    const hiddenComplexNodes = findCaptureNodes(
      result.capture.root,
      (node) => (
        ["CANVAS", "SVG", "DIV"].includes(node.tag)
        && node.styles?.visibility === "hidden"
      )
    );

    assert.equal(result.diagnostics.complexDomLayers, 3);
    assert.equal(hiddenComplexNodes.length, 3);
    assert.ok(capturedText.includes("Outside text"));
    assert.ok(pngAssets.length >= 3);
    assert.ok(result.diagnostics.layers.filter(
      (layer) => layer.mode === "complex-dom"
    ).every(
      (layer) => layer.visiblePixelCount > 0
    ));
  } finally {
    await service.close();
  }
});
