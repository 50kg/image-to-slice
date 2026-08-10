const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTransparentAssetPng
} = require("../src/ui/services/preview-image");

function installCanvasStub() {
  const canvases = [];
  const previousDocument = global.document;
  global.document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      const calls = [];
      const context = {
        calls,
        set fillStyle(value) { calls.push(["fillStyle", value]); },
        set strokeStyle(value) { calls.push(["strokeStyle", value]); },
        set lineWidth(value) { calls.push(["lineWidth", value]); },
        set lineCap(value) { calls.push(["lineCap", value]); },
        set lineJoin(value) { calls.push(["lineJoin", value]); },
        set font(value) { calls.push(["font", value]); },
        beginPath() { calls.push(["beginPath"]); },
        arc(...args) { calls.push(["arc", ...args]); },
        clearRect(...args) { calls.push(["clearRect", ...args]); },
        closePath() { calls.push(["closePath"]); },
        fill() { calls.push(["fill"]); },
        fillRect(...args) { calls.push(["fillRect", ...args]); },
        fillText(...args) { calls.push(["fillText", ...args]); },
        lineTo(...args) { calls.push(["lineTo", ...args]); },
        moveTo(...args) { calls.push(["moveTo", ...args]); },
        quadraticCurveTo(...args) { calls.push(["quadraticCurveTo", ...args]); },
        roundRect(...args) { calls.push(["roundRect", ...args]); },
        stroke() { calls.push(["stroke"]); }
      };
      const canvas = {
        width: 0,
        height: 0,
        context,
        getContext(type) {
          assert.equal(type, "2d");
          return context;
        },
        toDataURL(type) {
          assert.equal(type, "image/png");
          return `data:image/png;base64,stub-${this.width}x${this.height}`;
        }
      };
      canvases.push(canvas);
      return canvas;
    }
  };
  return () => {
    global.document = previousDocument;
    return canvases;
  };
}

test("createTransparentAssetPng renders transparent asset variants", () => {
  let restore = installCanvasStub();
  try {
    assert.equal(createTransparentAssetPng(100, 80, "bolt"), "data:image/png;base64,stub-100x80");
    const [canvas] = restore();
    assert.ok(canvas.context.calls.some((call) => call[0] === "closePath"));
  } finally {
    if (global.document?.createElement) restore();
  }

  restore = installCanvasStub();
  try {
    assert.equal(createTransparentAssetPng(100, 80, "illustration"), "data:image/png;base64,stub-100x80");
    const [canvas] = restore();
    assert.ok(canvas.context.calls.some((call) => call[0] === "stroke"));
  } finally {
    if (global.document?.createElement) restore();
  }
});
