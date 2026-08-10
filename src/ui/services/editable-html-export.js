function buildFastEditableExportCss({ width, height }) {
  const boardWidth = Math.max(1, Math.round(Number(width) || 1));
  const boardHeight = Math.max(1, Math.round(Number(height) || 1));
  return [
    `:root{--board-width:${boardWidth};--board-height:${boardHeight};}`,
    "html,body{margin:0;min-height:100%;background:#eef0f4;}",
    "body{overflow-x:hidden;}",
    ".fit-shell{width:100%;display:grid;place-items:start center;overflow-x:clip;}",
    ".fit-box{position:relative;overflow:hidden;}",
    `.screen{width:${boardWidth}px;height:${boardHeight}px;transform-origin:top left;}`
  ].join("\n");
}

function buildFastEditableExportScript({ width, height }) {
  const boardWidth = Math.max(1, Math.round(Number(width) || 1));
  const boardHeight = Math.max(1, Math.round(Number(height) || 1));
  return `(() => {
  const shell = document.querySelector(".fit-shell");
  const box = document.querySelector(".fit-box");
  const screen = document.querySelector(".screen");
  if (!shell || !box || !screen) return;
  const fit = () => {
    const availableWidth = shell.getBoundingClientRect().width;
    const scale = Math.min(1, availableWidth / ${boardWidth});
    box.style.width = (${boardWidth} * scale) + "px";
    box.style.height = (${boardHeight} * scale) + "px";
    screen.style.setProperty("transform", \`scale(\${scale})\`, "important");
    screen.style.setProperty("transform-origin", "top left", "important");
  };
  new ResizeObserver(fit).observe(shell);
  window.addEventListener("resize", fit);
  fit();
})();`;
}

function buildReferenceAssetExportCss(className, geometry = {}) {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(String(className || ""))) {
    throw new Error("导出切图 class 无效");
  }
  return [
    `.${className}{`,
    "position:absolute!important;",
    `left:${normalizeExportNumber(geometry.left)}px!important;`,
    `top:${normalizeExportNumber(geometry.top)}px!important;`,
    `width:${normalizeExportNumber(geometry.width)}px!important;`,
    `height:${normalizeExportNumber(geometry.height)}px!important;`,
    `border-radius:${formatEditableExportRadius(geometry)}!important;`,
    "transform:none!important;",
    "}"
  ].join("");
}

function formatEditableExportRadius(geometry) {
  if (geometry?.radii && typeof geometry.radii === "object") {
    return ["topLeft", "topRight", "bottomRight", "bottomLeft"]
      .map((corner) => `${normalizeExportNumber(geometry.radii[corner])}px`)
      .join(" ");
  }
  return `${normalizeExportNumber(geometry?.radius)}px`;
}

function normalizeEditableExportHead(doc) {
  if (!doc?.head || typeof doc.createElement !== "function") return;

  const charsetMetas = [...doc.head.querySelectorAll("meta[charset]")];
  const charsetMeta = charsetMetas.shift() || doc.createElement("meta");
  charsetMeta.setAttribute("charset", "UTF-8");
  charsetMetas.forEach((node) => node.remove());
  if (!charsetMeta.parentNode) doc.head.prepend(charsetMeta);

  const viewportMetas = [...doc.head.querySelectorAll("meta[name]")]
    .filter((node) => String(node.getAttribute("name") || "").toLowerCase() === "viewport");
  const viewportMeta = viewportMetas.shift() || doc.createElement("meta");
  viewportMeta.setAttribute("name", "viewport");
  viewportMeta.setAttribute("content", "width=device-width, initial-scale=1");
  viewportMetas.forEach((node) => node.remove());
  if (!viewportMeta.parentNode) doc.head.appendChild(viewportMeta);
}

function normalizeExportNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 1000) / 1000;
}

function createFastEditableExportFiles({ html, css, script, assets = [], textToBytes }) {
  return [
    { name: "index.html", data: textToBytes(html) },
    { name: "styles.css", data: textToBytes(css) },
    { name: "script.js", data: textToBytes(script) },
    ...assets
  ];
}

if (typeof module !== "undefined") {
  module.exports = {
    buildFastEditableExportCss,
    buildFastEditableExportScript,
    buildReferenceAssetExportCss,
    createFastEditableExportFiles,
    normalizeEditableExportHead
  };
}
