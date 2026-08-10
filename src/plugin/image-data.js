function normalizeImageScaleMode(scaleMode) {
  const mode = String(scaleMode || "").toUpperCase();
  if (mode === "FILL" || mode === "FIT" || mode === "CROP" || mode === "TILE") {
    return mode;
  }
  return "FIT";
}

function dataUrlToBytes(dataUrl, options = {}) {
  const match = /^data:image\/(?:png|jpeg|jpg);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("图片数据必须是 base64 PNG/JPEG data URL");
  }

  const base64Decode = options.base64Decode;
  if (typeof base64Decode === "function") {
    return base64Decode(match[1]);
  }

  const atobImpl = options.atob || globalThis.atob;
  const binary = atobImpl(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

module.exports = {
  normalizeImageScaleMode,
  dataUrlToBytes
};
