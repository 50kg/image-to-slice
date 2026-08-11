const {
  assembleCanvasFig,
  createEmptyFigDoc,
  createFigZip,
  encodeFigParts,
  parseFig
} = require("openfig-core");
const { ZstdCodec } = require("zstd-codec");

let zstdPromise = null;

function loadZstd() {
  if (!zstdPromise) {
    zstdPromise = new Promise((resolve) => {
      ZstdCodec.run((zstd) => resolve(new zstd.Simple()));
    });
  }
  return zstdPromise;
}

function createEmptyFigDocument() {
  return createEmptyFigDoc();
}

async function encodeFigDocument(document) {
  const parts = encodeFigParts(document);
  const zstd = await loadZstd();
  const messageCompressed = zstd.compress(parts.messageRaw, 3);
  const canvasFig = assembleCanvasFig({
    ...parts,
    messageCompressed
  });
  return createFigZip({
    canvasFig,
    meta: document.meta,
    thumbnail: document.thumbnail,
    images: document.images
  });
}

function decodeFigDocument(bytes) {
  return parseFig(bytes);
}

module.exports = {
  createEmptyFigDocument,
  decodeFigDocument,
  encodeFigDocument
};

