const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");

const {
  createAiInpaintCapabilityFixture,
  createNativeInpaintForm,
  isNativeMaskUnsupportedError,
  prepareAiInpaintInputs,
  restoreAiInpaintImage,
  runAiInpaintRoute,
  shouldFallbackNativeMask
} = require("../../src/server/services/ai-inpaint");

async function createSourceDataUrl(width, height) {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 220, g: 30, b: 40, alpha: 1 }
    }
  }).png().toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function createMaskDataUrl(width, height, region) {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 }
    }
  }).composite([{
    input: {
      create: {
        width: region.width,
        height: region.height,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    },
    left: region.x,
    top: region.y
  }]).png().toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function dataUrlBuffer(dataUrl) {
  return Buffer.from(String(dataUrl).split(",")[1], "base64");
}

test("inpaint preparation preserves aspect ratio and creates native and semantic masks", async () => {
  const prepared = await prepareAiInpaintInputs({
    sourceDataUrl: await createSourceDataUrl(100, 20),
    maskDataUrl: await createMaskDataUrl(100, 20, { x: 40, y: 5, width: 20, height: 10 }),
    targetWidth: 96,
    targetHeight: 64
  });

  assert.deepEqual(
    { width: prepared.width, height: prepared.height },
    { width: 96, height: 64 }
  );
  assert.deepEqual(prepared.contentBox, { x: 0, y: 22, width: 96, height: 19 });

  const native = await sharp(dataUrlBuffer(prepared.nativeMaskDataUrl))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const semantic = await sharp(dataUrlBuffer(prepared.semanticInputDataUrl))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const protectedOffset = ((prepared.contentBox.y + 2) * prepared.width + 5) * 4;
  const selectedOffset = ((prepared.contentBox.y + 9) * prepared.width + 48) * 4;

  assert.equal(native.data[protectedOffset + 3], 255);
  assert.equal(native.data[selectedOffset + 3], 0);
  assert.equal(semantic.data[protectedOffset + 3], 255);
  assert.equal(semantic.data[selectedOffset + 3], 0);
});

test("inpaint restoration removes model padding without stretching the content", async () => {
  const prepared = await prepareAiInpaintInputs({
    sourceDataUrl: await createSourceDataUrl(100, 20),
    maskDataUrl: await createMaskDataUrl(100, 20, { x: 40, y: 5, width: 20, height: 10 }),
    targetWidth: 96,
    targetHeight: 64
  });
  const generated = await createSourceDataUrl(96, 64);

  const restored = await restoreAiInpaintImage(generated, prepared);
  const metadata = await sharp(dataUrlBuffer(restored)).metadata();

  assert.deepEqual(
    { width: metadata.width, height: metadata.height },
    { width: prepared.contentBox.width, height: prepared.contentBox.height }
  );
});

test("native mask fallback is limited to explicit provider compatibility errors", () => {
  assert.equal(isNativeMaskUnsupportedError(Object.assign(
    new Error("Unknown multipart field: mask"),
    { statusCode: 400 }
  )), true);
  assert.equal(isNativeMaskUnsupportedError(Object.assign(
    new Error("OpenAI request failed: 524"),
    { statusCode: 524 }
  )), false);
  assert.equal(isNativeMaskUnsupportedError(Object.assign(
    new Error("invalid API key"),
    { statusCode: 401 }
  )), false);
});

test("native inpaint multipart sends one source image and a dedicated mask field", async () => {
  const sourceDataUrl = await createSourceDataUrl(32, 32);
  const maskDataUrl = await createMaskDataUrl(32, 32, { x: 8, y: 8, width: 16, height: 16 });

  const form = createNativeInpaintForm({
    model: "gpt-image-2",
    prompt: "Remove the selected overlay.",
    size: "1024x1024",
    quality: "high",
    sourceDataUrl,
    nativeMaskDataUrl: maskDataUrl,
    name: "source.png"
  });

  assert.equal(form.getAll("image[]").length, 1);
  assert.equal(form.getAll("mask").length, 1);
  assert.equal(form.get("size"), "1024x1024");
});

test("native Mask falls back only for explicit compatibility errors", () => {
  const unsupported = Object.assign(new Error("Unknown parameter: mask"), { statusCode: 400 });

  assert.equal(shouldFallbackNativeMask({ error: unsupported }), true);
  assert.equal(shouldFallbackNativeMask({
    error: Object.assign(new Error("OpenAI request failed: 524"), { statusCode: 524 })
  }), false);
});

test("inpaint route reports native Mask when the native request succeeds", async () => {
  let semanticCalls = 0;
  const routed = await runAiInpaintRoute({
    runNative: async () => ({ images: [{ dataUrl: "native" }] }),
    runSemantic: async () => {
      semanticCalls += 1;
      return { images: [{ dataUrl: "semantic" }] };
    }
  });

  assert.equal(routed.maskMode, "native-mask");
  assert.equal(routed.result.images[0].dataUrl, "native");
  assert.equal(semanticCalls, 0);
});

test("inpaint route falls back only after a custom endpoint rejects Mask", async () => {
  let semanticCalls = 0;
  const routed = await runAiInpaintRoute({
    runNative: async () => {
      throw Object.assign(new Error("Unknown parameter: mask"), { statusCode: 400 });
    },
    runSemantic: async () => {
      semanticCalls += 1;
      return { images: [{ dataUrl: "semantic" }] };
    }
  });

  assert.equal(routed.maskMode, "semantic-reference-fallback");
  assert.equal(semanticCalls, 1);
});

test("inpaint route does not hide timeout or authentication errors", async () => {
  for (const error of [
    Object.assign(new Error("OpenAI request failed: 524"), { statusCode: 524 }),
    Object.assign(new Error("invalid API key"), { statusCode: 401 })
  ]) {
    await assert.rejects(
      runAiInpaintRoute({
        runNative: async () => { throw error; },
        runSemantic: async () => ({})
      }),
      (received) => received === error
    );
  }
});

test("inpaint capability fixture contains aligned source and selection Mask images", async () => {
  const fixture = await createAiInpaintCapabilityFixture();
  const source = await sharp(dataUrlBuffer(fixture.sourceDataUrl)).metadata();
  const mask = await sharp(dataUrlBuffer(fixture.maskDataUrl)).metadata();

  assert.deepEqual(
    { width: source.width, height: source.height },
    { width: 64, height: 64 }
  );
  assert.deepEqual(
    { width: mask.width, height: mask.height },
    { width: 64, height: 64 }
  );
});
