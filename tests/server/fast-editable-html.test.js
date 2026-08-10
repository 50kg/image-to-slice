const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
  reconstructFastEditableHtml
} = require("../../src/server/services/fast-editable-html");

test("editable HTML prompt preserves the proven 55db12d fast-mode contract", () => {
  const serverSource = fs.readFileSync("server.js", "utf8");
  const promptSource = serverSource.match(/function buildEditableDesignH5Prompt\([\s\S]*?\n}\n\nfunction extractHtmlDocument/)?.[0] || "";

  assert.match(promptSource, /Highest priority:/);
  assert.match(promptSource, /Absolute-positioning implementation rules:/);
  assert.match(promptSource, /Reference-asset usage rules:/);
  assert.match(promptSource, /Pixel reconstruction workflow:/);
  assert.match(promptSource, /ScreenCoder-style reasoning checklist/);
  assert.match(promptSource, /human-readable production-style HTML/i);
  assert.match(promptSource, /Choose tags and nesting from the screenshot content/i);
  assert.match(promptSource, /Do not force a fixed semantic tag checklist/i);
  assert.match(promptSource, /Use parent-local coordinates inside each visual component/i);
  assert.match(promptSource, /Do not use inline style attributes/i);
  assert.match(promptSource, /must contain a meaningful <title>/i);
  assert.match(promptSource, /\.fit-shell > \.fit-box > \.screen/);
  assert.match(promptSource, /must not use transform/i);
  assert.match(promptSource, /smallest coherent component owner/i);
  assert.match(promptSource, /parent-local left\/top coordinates/i);
  assert.match(promptSource, /Do not place all reference assets directly under \.screen/i);
  assert.match(promptSource, /page-wide|section-wide/i);
  assert.match(promptSource, /transcribe all visible text.*even when.*overlaps.*sliced asset/i);
  assert.doesNotMatch(promptSource, /inside (?:an?|the) (?:authoritative )?(?:reference asset|sliced asset).*(?:must not|do not).*(?:transcrib|recreat|redraw)/i);
  assert.doesNotMatch(promptSource, /Every visible element must be placed by absolute coordinates inside \.screen/);
  assert.doesNotMatch(promptSource, /inside a single \.screen root/);
  assert.doesNotMatch(promptSource, /Priority P0|Priority P1|Priority P2|Priority P3|Visual analysis JSON|visual analysis JSON|visualAnalysis|modelReferenceAssets/);
});

function createDependencies(overrides = {}) {
  const calls = {
    prompts: [],
    provider: [],
    progress: [],
    messageImages: []
  };
  return {
    calls,
    dependencies: {
      assertString: (value) => String(value || "").trim(),
      clampNumber: (value, min, max) => Math.min(max, Math.max(min, Number(value))),
      normalizeEditableReferenceAssets: (assets) => assets,
      buildFallbackH5PreviewHtml: () => "<html>fallback</html>",
      updateAiProgress: (id, message) => calls.progress.push({ id, message }),
      buildEditableDesignH5Prompt: (options) => {
        calls.prompts.push(options);
        return options.referenceAssets.map((asset) => `${asset.id}:${asset.kind}:${asset.placement.x},${asset.placement.y},${asset.placement.width},${asset.placement.height}`).join("\n");
      },
      buildVisionMessageContent: (prompt, images) => {
        calls.messageImages.push(images);
        return { prompt, images };
      },
      requestVisionChatCompletion: async (request, context) => {
        calls.provider.push({ request, context });
        return { output: "```html\n<html><body><div class=\"screen\"></div></body></html>\n```" };
      },
      extractChatCompletionText: (data) => data.output,
      extractHtmlDocument: (text) => text.replace(/^```html\s*|\s*```$/g, ""),
      sanitizeFastGeneratedHtml: (html, assets) => ({
        html: `${html}<!--${assets.map((asset) => asset.id).join(",")}-->`,
        missingReferenceAnchorCount: 0,
        referenceAnchorCount: assets.length
      }),
      formatEditableDesignError: (error) => error.message,
      isAiAbortError: (error) => error?.name === "AbortError",
      maxTokens: 12000,
      ...overrides
    }
  };
}

test("fast reconstruction makes one source-only provider request and keeps all cut metadata", async () => {
  const { calls, dependencies } = createDependencies();
  const context = {
    config: {
      type: "openaiCompatible",
      baseUrl: "https://example.test",
      model: "vision-model"
    }
  };
  const referenceAssets = [
    { id: "logo", kind: "logo", radius: 4, dataUrl: "data:image/png;base64,AAA", placement: { x: 10, y: 20, width: 30, height: 40 } },
    { id: "hero", kind: "illustration", radius: 0, dataUrl: "data:image/png;base64,BBB", placement: { x: 50, y: 60, width: 70, height: 80 } }
  ];

  const result = await reconstructFastEditableHtml({
    prompt: "trace",
    width: 320,
    height: 640,
    imageDataUrl: "data:image/png;base64,SOURCE",
    sourceImageName: "screen.png",
    referenceAssets,
    progressId: "job-1"
  }, dependencies, context);

  assert.equal(calls.provider.length, 1);
  assert.equal(calls.provider[0].request.stream, true);
  assert.equal(calls.provider[0].request.model, "vision-model");
  assert.equal(calls.provider[0].context, context);
  assert.equal(calls.messageImages.length, 1);
  assert.deepEqual(calls.messageImages[0], [{ dataUrl: "data:image/png;base64,SOURCE", name: "screen.png" }]);
  assert.equal(calls.messageImages[0].some((image) => /AAA|BBB/.test(image.dataUrl)), false);
  assert.deepEqual(calls.prompts[0].referenceAssets, referenceAssets);
  assert.equal("modelReferenceAssets" in calls.prompts[0], false);
  assert.equal("visualAnalysis" in calls.prompts[0], false);
  assert.match(calls.provider[0].request.messages[0].content.prompt, /logo:logo:10,20,30,40/);
  assert.match(calls.provider[0].request.messages[0].content.prompt, /hero:illustration:50,60,70,80/);
  assert.equal(result.mode, "h5-fast-direct");
  assert.equal("modelReferenceAssetCount" in result.metadata, false);
  assert.equal("hasVisualAnalysis" in result.metadata, false);
  assert.equal(result.metadata.referenceAssetCount, 2);
  assert.match(result.html, /<!--logo,hero-->/);
});

test("fast reconstruction returns a template without calling the provider when the source image is missing", async () => {
  const { calls, dependencies } = createDependencies();

  const result = await reconstructFastEditableHtml({
    prompt: "trace",
    width: 320,
    height: 640,
    imageDataUrl: "",
    referenceAssets: []
  }, dependencies, {
    config: { type: "openaiCompatible", baseUrl: "https://example.test", model: "vision-model" }
  });

  assert.equal(calls.provider.length, 0);
  assert.equal(result.mode, "h5-template");
  assert.match(result.warning, /缺少原图/);
});

test("fast reconstruction exposes sanitizer quality warnings", async () => {
  const { dependencies } = createDependencies({
    sanitizeFastGeneratedHtml: (html, assets) => ({
      html,
      missingReferenceAnchorCount: 0,
      referenceAnchorCount: assets.length,
      qualityWarnings: ["结构仍较扁平。", "缺少可读 class。"]
    })
  });

  const result = await reconstructFastEditableHtml({
    prompt: "trace",
    width: 320,
    height: 640,
    imageDataUrl: "data:image/png;base64,SOURCE",
    referenceAssets: []
  }, dependencies, {
    config: { type: "openaiCompatible", baseUrl: "https://example.test", model: "vision-model" }
  });

  assert.equal(result.warning, "结构仍较扁平。 缺少可读 class。");
});

test("fast reconstruction preserves provider abort errors without retrying", async () => {
  const abortError = Object.assign(new Error("cancelled"), { name: "AbortError" });
  const { calls, dependencies } = createDependencies({
    requestVisionChatCompletion: async (request, context) => {
      calls.provider.push({ request, context });
      throw abortError;
    }
  });

  await assert.rejects(
    reconstructFastEditableHtml({
      prompt: "trace",
      width: 320,
      height: 640,
      imageDataUrl: "data:image/png;base64,SOURCE",
      referenceAssets: []
    }, dependencies, {
      config: { type: "openaiCompatible", baseUrl: "https://example.test", model: "vision-model" }
    }),
    (error) => error === abortError
  );
  assert.equal(calls.provider.length, 1);
});

test("fast reconstruction preserves non-abort provider errors without a business prefix", async () => {
  const { calls, dependencies } = createDependencies({
    requestVisionChatCompletion: async (request, context) => {
      calls.provider.push({ request, context });
      const error = new Error("upstream failed");
      error.statusCode = 503;
      throw error;
    }
  });

  await assert.rejects(
    reconstructFastEditableHtml({
      prompt: "trace",
      width: 320,
      height: 640,
      imageDataUrl: "data:image/png;base64,SOURCE",
      referenceAssets: []
    }, dependencies, {
      config: { type: "openaiCompatible", baseUrl: "https://example.test", model: "vision-model" }
    }),
    (error) => error.statusCode === 503 && error.message === "upstream failed"
  );
  assert.equal(calls.provider.length, 1);
});

test("fast reconstruction rejects oversized images before calling the provider", async () => {
  const { calls, dependencies } = createDependencies();

  await assert.rejects(
    reconstructFastEditableHtml({
      prompt: "trace",
      width: 4097,
      height: 750,
      imageDataUrl: "data:image/png;base64,SOURCE",
      referenceAssets: []
    }, dependencies, {
      config: { type: "openaiCompatible", baseUrl: "https://example.test", model: "vision-model" }
    }),
    /最大支持 4096 × 4096/
  );
  assert.equal(calls.provider.length, 0);
});
