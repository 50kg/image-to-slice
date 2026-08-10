const zipCrc32 = typeof require === "function" ? require("./app-utils").crc32 : crc32;

function textToUint8Array(text) {
  return new TextEncoder().encode(text);
}

function dataUrlToUint8Array(dataUrl) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) {
    throw new Error("Invalid data URL");
  }
  const base64 = dataUrl.slice(commaIndex + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function createZipBlob(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  files.forEach((file) => {
    const filename = textToUint8Array(file.name);
    const data = file.data;
    const crc = zipCrc32(data);
    const localHeader = createZipLocalHeader(filename, data.length, crc);
    localParts.push(localHeader, data);
    centralParts.push(createZipCentralHeader(filename, data.length, crc, offset));
    offset += localHeader.length + data.length;
  });
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = createZipEndRecord(files.length, centralSize, offset);
  return new Blob([...localParts, ...centralParts, endRecord], { type: "application/zip" });
}

const ZIP_UTF8_FLAG = 0x0800;

function createZipLocalHeader(filename, size, crc) {
  const header = new Uint8Array(30 + filename.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, ZIP_UTF8_FLAG, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, getDosTime(), true);
  view.setUint16(12, getDosDate(), true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, filename.length, true);
  header.set(filename, 30);
  return header;
}

function createZipCentralHeader(filename, size, crc, offset) {
  const header = new Uint8Array(46 + filename.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, ZIP_UTF8_FLAG, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, getDosTime(), true);
  view.setUint16(14, getDosDate(), true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, filename.length, true);
  view.setUint32(42, offset, true);
  header.set(filename, 46);
  return header;
}

function createZipEndRecord(fileCount, centralSize, centralOffset) {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  return record;
}

function getDosTime() {
  const now = new Date();
  return (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
}

function getDosDate() {
  const now = new Date();
  return ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
}

if (typeof module !== "undefined") {
  module.exports = {
    createZipBlob,
    dataUrlToUint8Array,
    textToUint8Array
  };
}
