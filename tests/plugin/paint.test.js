const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createDropShadow,
  normalizeRadius,
  applyCornerRadius,
  hexToSolidPaint,
  createEditableFills,
  createAngularGradientPaint,
  createLinearGradientPaint,
  createRadialGradientPaint,
  gradientTransformFromAngle,
  hexToRgbColor,
  clampOpacity
} = require("../../src/plugin/paint");

test("clampOpacity clamps finite values and falls back to 1", () => {
  assert.equal(clampOpacity(-0.5), 0);
  assert.equal(clampOpacity(0.4), 0.4);
  assert.equal(clampOpacity(2), 1);
  assert.equal(clampOpacity("bad"), 1);
});

test("hexToRgbColor expands short hex and applies opacity", () => {
  assert.deepEqual(hexToRgbColor("#0f8", 0.5), {
    r: 0,
    g: 1,
    b: 0x88 / 255,
    a: 0.5
  });
});

test("hexToSolidPaint converts RGBA color into Figma solid paint shape", () => {
  assert.deepEqual(hexToSolidPaint("#336699", 0.25), {
    type: "SOLID",
    color: {
      r: 0x33 / 255,
      g: 0x66 / 255,
      b: 0x99 / 255
    },
    opacity: 0.25
  });
});

test("gradientTransformFromAngle preserves legacy quadrant mapping", () => {
  assert.deepEqual(gradientTransformFromAngle(90), [[1, 0, 0], [0, 1, 0]]);
  assert.deepEqual(gradientTransformFromAngle(180), [[0, 1, 0], [-1, 0, 1]]);
  assert.deepEqual(gradientTransformFromAngle(270), [[-1, 0, 1], [0, -1, 1]]);
  assert.deepEqual(gradientTransformFromAngle(0), [[0, -1, 1], [1, 0, 0]]);
});

test("gradientTransformFromAngle preserves diagonal angles instead of snapping to a quadrant", () => {
  const transform = gradientTransformFromAngle(45);

  assert.notDeepEqual(transform, gradientTransformFromAngle(90));
  assert.ok(Math.abs(transform[0][0] - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(transform[0][1] + Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(transform[0][2] - 0.5) < 1e-12);
  assert.ok(Math.abs(transform[1][0] - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(transform[1][1] - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(transform[1][2] - (0.5 - Math.SQRT1_2)) < 1e-12);
});

test("createLinearGradientPaint sorts stops and multiplies opacity", () => {
  const paint = createLinearGradientPaint({
    angle: 90,
    stops: [
      { position: 1, color: "#ffffff", opacity: 0.5 },
      { position: 0, color: "#000000" }
    ]
  }, 0.5);

  assert.equal(paint.type, "GRADIENT_LINEAR");
  assert.deepEqual(paint.gradientTransform, [[1, 0, 0], [0, 1, 0]]);
  assert.equal(paint.gradientStops[0].position, 0);
  assert.equal(paint.gradientStops[0].color.a, 0.5);
  assert.equal(paint.gradientStops[1].position, 1);
  assert.equal(paint.gradientStops[1].color.a, 0.25);
});

test("createRadialGradientPaint uses identity transform", () => {
  const paint = createRadialGradientPaint({
    stops: [
      { color: "#000000" },
      { color: "#ffffff" }
    ]
  }, 1);

  assert.equal(paint.type, "GRADIENT_RADIAL");
  assert.deepEqual(paint.gradientTransform, [[1, 0, 0], [0, 1, 0]]);
});

test("linear and radial gradient paints preserve fractional stop positions", () => {
  const gradient = {
    stops: [-0.2, 0.33, 0.5, 0.66, 1.2].map((position) => ({
      position,
      color: "#ffffff"
    }))
  };

  assert.deepEqual(
    createLinearGradientPaint(gradient, 1).gradientStops.map((stop) => stop.position),
    [0, 0.33, 0.5, 0.66, 1]
  );
  assert.deepEqual(
    createRadialGradientPaint(gradient, 1).gradientStops.map((stop) => stop.position),
    [0, 0.33, 0.5, 0.66, 1]
  );
});

test("createAngularGradientPaint creates a centered editable angular fill", () => {
  const paint = createAngularGradientPaint({
    angle: 0,
    stops: [
      { position: 0.68, color: "#a58aee" },
      { position: 0.68, color: "#d2b7ba" },
      { position: 1, color: "#f0b779" }
    ]
  }, 0.5);

  assert.equal(paint.type, "GRADIENT_ANGULAR");
  assert.deepEqual(paint.gradientTransform, [[0, -2, 1], [2, 0, -1]]);
  assert.equal(paint.gradientStops[0].position, 0.68);
  assert.equal(paint.gradientStops[0].color.a, 0.5);
  assert.equal(paint.gradientStops[1].position, 0.68);
  assert.equal(paint.gradientStops[2].position, 1);
});

test("createEditableFills chooses angular, radial, linear, or solid fills", () => {
  assert.equal(createEditableFills({ gradient: { type: "angular", stops: [{}, {}] } })[0].type, "GRADIENT_ANGULAR");
  assert.equal(createEditableFills({ gradient: { type: "radial", stops: [{}, {}] } })[0].type, "GRADIENT_RADIAL");
  assert.equal(createEditableFills({ gradient: { type: "linear", stops: [{}, {}] } })[0].type, "GRADIENT_LINEAR");
  assert.equal(createEditableFills({ fill: "#123456" })[0].type, "SOLID");
  assert.deepEqual(createEditableFills({ fill: null }, "#abcdef"), []);
  assert.deepEqual(createEditableFills(null, "#abcdef")[0].color, {
    r: 0xab / 255,
    g: 0xcd / 255,
    b: 0xef / 255
  });
});

test("normalizeRadius clamps corner radius values", () => {
  assert.equal(normalizeRadius(-10), 0);
  assert.equal(normalizeRadius(1200), 999);
  assert.equal(normalizeRadius("bad"), 0);
});

test("applyCornerRadius supports uniform and per-corner radii", () => {
  const uniform = {};
  applyCornerRadius(uniform, { radius: 12 });
  assert.equal(uniform.cornerRadius, 12);

  const corners = {};
  applyCornerRadius(corners, { radii: { topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 } });
  assert.deepEqual(corners, {
    topLeftRadius: 1,
    topRightRadius: 2,
    bottomRightRadius: 3,
    bottomLeftRadius: 4
  });
});

test("createDropShadow preserves default shadow fields", () => {
  assert.deepEqual(createDropShadow({ color: "#000000" }), {
    type: "DROP_SHADOW",
    color: { r: 0, g: 0, b: 0, a: 0.12 },
    offset: { x: 0, y: 10 },
    radius: 24,
    spread: 0,
    visible: true,
    blendMode: "NORMAL"
  });
});
