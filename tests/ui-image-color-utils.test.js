const test = require("node:test");
const assert = require("node:assert/strict");

const {
  averageBackgroundColors,
  averageColors,
  colorDistance,
  getPixelColor,
  mixColors,
  rgbToHex,
  sampleEdgeColor,
  sampleEdgeStats,
  toRgb
} = require("../src/ui/services/image-color-utils");

test("color format helpers clamp and mix values", () => {
  assert.equal(toRgb({ r: 12.2, g: 34.6, b: 56.5 }), "12, 35, 57");
  assert.equal(rgbToHex(15, 256, -3), "#0fff00");
  assert.equal(colorDistance(0, 0, 0, 3, 4, 12), 13);
  const mixed = mixColors(
    { r: 0, g: 20, b: 40 },
    { r: 100, g: 120, b: 140 },
    0.25
  );
  assert.equal(mixed.r, 25);
  assert.equal(mixed.g, 45);
  assert.equal(mixed.b, 65);
  assert.ok(Math.abs(mixed.luma - 42.192) < 0.000001);
});

test("pixel sampling computes luma and saturation", () => {
  const pixels = Uint8ClampedArray.from([
    10, 20, 30, 255,
    80, 90, 100, 255,
    120, 130, 140, 255,
    200, 210, 220, 255
  ]);

  assert.deepEqual(getPixelColor(pixels, 2, 1, 0), {
    r: 80,
    g: 90,
    b: 100,
    luma: 88.596,
    saturation: 20
  });
});

test("average helpers preserve fallback and background selection rules", () => {
  const fallback = { r: 1, g: 2, b: 3, luma: 2 };
  assert.equal(averageColors([], fallback), fallback);
  const average = averageColors([
    { r: 10, g: 20, b: 30 },
    { r: 30, g: 40, b: 50 }
  ]);
  assert.equal(average.r, 20);
  assert.equal(average.g, 30);
  assert.equal(average.b, 40);
  assert.ok(Math.abs(average.luma - 28.596) < 0.000001);

  const samples = [
    { r: 10, g: 10, b: 10, luma: 10, saturation: 0 },
    { r: 20, g: 20, b: 20, luma: 20, saturation: 0 },
    { r: 30, g: 30, b: 30, luma: 30, saturation: 0 },
    { r: 40, g: 40, b: 40, luma: 40, saturation: 0 },
    { r: 50, g: 50, b: 50, luma: 50, saturation: 0 },
    { r: 200, g: 20, b: 20, luma: 58.28, saturation: 180 }
  ];
  const background = averageBackgroundColors(samples);
  assert.ok(Math.abs(background.r - 58.333333333333336) < 0.000001);
  assert.ok(Math.abs(background.g - 28.333333333333332) < 0.000001);
  assert.ok(Math.abs(background.b - 28.333333333333332) < 0.000001);
  assert.ok(Math.abs(background.luma - 34.711333333333336) < 0.000001);
});

test("edge sampling summarizes border colors", () => {
  const pixels = Uint8ClampedArray.from([
    10, 10, 10, 255,
    20, 20, 20, 255,
    30, 30, 30, 255,
    40, 40, 40, 255
  ]);

  assert.deepEqual(sampleEdgeColor(pixels, 2, 2), {
    r: 25,
    g: 25,
    b: 25,
    luma: 25
  });
  assert.deepEqual(sampleEdgeStats(pixels, 2, 2).sides.top, {
    r: 15,
    g: 15,
    b: 15,
    luma: 15
  });
});
