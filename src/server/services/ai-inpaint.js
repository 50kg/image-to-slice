const sharp = require("sharp");

async function createAiInpaintCapabilityFixture() {
  const selection = {
    input: {
      create: {
        width: 24,
        height: 24,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    },
    left: 20,
    top: 20
  };
  const sourceBuffer = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 4,
      background: { r: 210, g: 225, b: 235, alpha: 1 }
    }
  }).composite([{
    ...selection,
    input: {
      create: {
        width: 24,
        height: 24,
        channels: 4,
        background: { r: 70, g: 90, b: 110, alpha: 1 }
      }
    }
  }]).png().toBuffer();
  const maskBuffer = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 }
    }
  }).composite([selection]).png().toBuffer();
  return {
    sourceDataUrl: bufferToDataUrl(sourceBuffer),
    maskDataUrl: bufferToDataUrl(maskBuffer)
  };
}

function createNativeInpaintForm({
  model,
  prompt,
  size,
  quality,
  sourceDataUrl,
  nativeMaskDataUrl,
  name
}) {
  const form = new FormData();
  form.set("model", model);
  form.set("prompt", prompt);
  form.set("size", size);
  form.set("quality", quality || "high");
  form.set("output_format", "png");
  form.set("n", "1");
  form.append("image[]", dataUrlToFile(sourceDataUrl, name || "inpaint-source.png"));
  form.append("mask", dataUrlToFile(nativeMaskDataUrl, "inpaint-mask.png"));
  return form;
}

async function prepareAiInpaintInputs({
  sourceDataUrl,
  maskDataUrl,
  targetWidth,
  targetHeight
}) {
  const sourceBuffer = dataUrlToBuffer(sourceDataUrl);
  const maskBuffer = dataUrlToBuffer(maskDataUrl);
  const sourceMetadata = await sharp(sourceBuffer).metadata();
  const sourceWidth = Math.max(1, Number(sourceMetadata.width) || 1);
  const sourceHeight = Math.max(1, Number(sourceMetadata.height) || 1);
  const width = Math.max(1, Math.round(Number(targetWidth) || sourceWidth));
  const height = Math.max(1, Math.round(Number(targetHeight) || sourceHeight));
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const contentWidth = Math.max(1, Math.round(sourceWidth * scale));
  const contentHeight = Math.max(1, Math.round(sourceHeight * scale));
  const contentBox = {
    x: Math.floor((width - contentWidth) / 2),
    y: Math.floor((height - contentHeight) / 2),
    width: contentWidth,
    height: contentHeight
  };
  const padding = {
    left: contentBox.x,
    top: contentBox.y,
    right: width - contentBox.x - contentBox.width,
    bottom: height - contentBox.y - contentBox.height
  };
  const preparedSource = await sharp(sourceBuffer)
    .ensureAlpha()
    .resize({ width: contentWidth, height: contentHeight, fit: "fill", kernel: "lanczos3" })
    .extend({ ...padding, extendWith: "copy" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const selection = await sharp(maskBuffer)
    .resize({ width: contentWidth, height: contentHeight, fit: "fill", kernel: "nearest" })
    .greyscale()
    .extend({ ...padding, background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .raw()
    .toBuffer();
  const sourcePixels = await sharp(preparedSource)
    .ensureAlpha()
    .raw()
    .toBuffer();
  const nativeMaskPixels = Buffer.alloc(width * height * 4);
  const semanticInputPixels = Buffer.from(sourcePixels);
  for (let pixel = 0; pixel < selection.length; pixel += 1) {
    const selectionValue = selection[pixel];
    const offset = pixel * 4;
    nativeMaskPixels[offset] = 255;
    nativeMaskPixels[offset + 1] = 255;
    nativeMaskPixels[offset + 2] = 255;
    nativeMaskPixels[offset + 3] = 255 - selectionValue;
    semanticInputPixels[offset + 3] = Math.round(
      semanticInputPixels[offset + 3] * (1 - selectionValue / 255)
    );
  }
  const nativeMaskBuffer = await sharp(nativeMaskPixels, {
    raw: { width, height, channels: 4 }
  }).png({ compressionLevel: 9 }).toBuffer();
  const semanticInputBuffer = await sharp(semanticInputPixels, {
    raw: { width, height, channels: 4 }
  }).png({ compressionLevel: 9 }).toBuffer();
  const semanticMaskBuffer = await sharp(selection, {
    raw: { width, height, channels: 1 }
  }).png({ compressionLevel: 9 }).toBuffer();

  return {
    width,
    height,
    contentBox,
    sourceDataUrl: bufferToDataUrl(preparedSource),
    nativeMaskDataUrl: bufferToDataUrl(nativeMaskBuffer),
    semanticInputDataUrl: bufferToDataUrl(semanticInputBuffer),
    semanticMaskDataUrl: bufferToDataUrl(semanticMaskBuffer)
  };
}

async function restoreAiInpaintImage(dataUrl, prepared) {
  const width = Math.max(1, Number(prepared?.width) || 1);
  const height = Math.max(1, Number(prepared?.height) || 1);
  const contentBox = prepared?.contentBox || { x: 0, y: 0, width, height };
  const restored = await sharp(dataUrlToBuffer(dataUrl))
    .resize({ width, height, fit: "fill", kernel: "lanczos3" })
    .extract({
      left: Math.max(0, Math.round(contentBox.x)),
      top: Math.max(0, Math.round(contentBox.y)),
      width: Math.max(1, Math.round(contentBox.width)),
      height: Math.max(1, Math.round(contentBox.height))
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return bufferToDataUrl(restored);
}

function isNativeMaskUnsupportedError(error) {
  const statusCode = Number(error?.statusCode);
  if (![400, 404, 415, 422].includes(statusCode)) return false;
  return /(?:mask|multipart).*(?:unknown|unsupported|unrecognized|unexpected|invalid)|(?:unknown|unsupported|unrecognized|unexpected|invalid).*(?:mask|multipart)/i
    .test(String(error?.message || ""));
}

function shouldFallbackNativeMask({ error }) {
  return isNativeMaskUnsupportedError(error);
}

async function runAiInpaintRoute({
  runNative,
  runSemantic
}) {
  try {
    return {
      result: await runNative(),
      maskMode: "native-mask"
    };
  } catch (error) {
    if (!shouldFallbackNativeMask({ error })) throw error;
    return {
      result: await runSemantic(),
      maskMode: "semantic-reference-fallback"
    };
  }
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || "").match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
  if (!match) throw new Error("Expected a base64 image data URL");
  return Buffer.from(match[1], "base64");
}

function bufferToDataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function dataUrlToFile(dataUrl, name) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) throw new Error("Expected a base64 image data URL");
  const blob = new Blob([Buffer.from(match[2], "base64")], { type: match[1] });
  return new File([blob], name, { type: match[1] });
}

module.exports = {
  createAiInpaintCapabilityFixture,
  createNativeInpaintForm,
  isNativeMaskUnsupportedError,
  prepareAiInpaintInputs,
  restoreAiInpaintImage,
  runAiInpaintRoute,
  shouldFallbackNativeMask
};
