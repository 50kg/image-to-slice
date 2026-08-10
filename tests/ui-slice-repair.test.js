const test = require("node:test");
const assert = require("node:assert/strict");

const {
  collectRectColors,
  getExpandedSampleRect,
  paintEdgeBlendRepairPatch
} = require("../src/ui/services/slice-repair");

test("getExpandedSampleRect expands placement and clamps to source bounds", () => {
  assert.deepEqual(getExpandedSampleRect(
    { naturalWidth: 100, naturalHeight: 80 },
    { x: 10, y: 12, width: 20, height: 10 }
  ), {
    x: 0,
    y: 0,
    width: 46,
    height: 38
  });
  assert.deepEqual(getExpandedSampleRect(
    { width: 100, height: 80 },
    { x: 90, y: 70, width: 20, height: 20 }
  ), {
    x: 74,
    y: 54,
    width: 26,
    height: 26
  });
});

test("collectRectColors samples rectangle pixels through a canvas context", () => {
  const calls = [];
  const context = {
    getImageData(x, y, width, height) {
      calls.push({ x, y, width, height });
      return {
        data: Uint8ClampedArray.from([
          10, 20, 30, 255,
          40, 50, 60, 255,
          70, 80, 90, 255,
          100, 110, 120, 255
        ])
      };
    }
  };

  assert.deepEqual(collectRectColors(context, 1.8, 2.2, 2, 2).map(({ r, g, b }) => ({ r, g, b })), [
    { r: 10, g: 20, b: 30 },
    { r: 40, g: 50, b: 60 },
    { r: 70, g: 80, b: 90 },
    { r: 100, g: 110, b: 120 }
  ]);
  assert.deepEqual(calls, [{ x: 1, y: 2, width: 2, height: 2 }]);
  assert.deepEqual(collectRectColors(context, 0, 0, 0, 2), []);
});

test("paintEdgeBlendRepairPatch fills an opaque image buffer", () => {
  let painted = null;
  const context = {
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4) };
    },
    putImageData(imageData, x, y) {
      painted = { imageData, x, y };
    }
  };
  const color = { r: 10, g: 20, b: 30, luma: 20 };

  paintEdgeBlendRepairPatch(context, 1, 1, {}, color);

  assert.equal(painted.x, 0);
  assert.equal(painted.y, 0);
  assert.deepEqual([...painted.imageData.data], [10, 20, 30, 255]);
});
