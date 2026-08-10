const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateDraggedSliceRadius,
  calculateSliceRadiusHandleInset,
  getSliceFieldMax,
  getSliceRadius,
  getSliceRadiusCssValue,
  getSliceRadii,
  getSliceRadiiCssValue,
  hasSlicePlacementChanged,
  normalizeDraftRect,
  normalizeEditedPlacement,
  normalizeSlicePlacement,
  pointToScreenCoords,
  setSliceCornerRadius
} = require("../src/ui/services/slice-geometry");

test("calculateDraggedSliceRadius projects every corner drag toward the center", () => {
  const cases = [
    ["nw", { x: 30, y: 30 }],
    ["ne", { x: 70, y: 30 }],
    ["se", { x: 70, y: 70 }],
    ["sw", { x: 30, y: 70 }]
  ];
  const starts = {
    nw: { x: 20, y: 20 },
    ne: { x: 80, y: 20 },
    se: { x: 80, y: 80 },
    sw: { x: 20, y: 80 }
  };

  for (const [corner, point] of cases) {
    assert.equal(calculateDraggedSliceRadius({
      corner,
      startRadius: 10,
      startX: starts[corner].x,
      startY: starts[corner].y
    }, point, 50), 20);
  }
});

test("calculateDraggedSliceRadius clamps the linked radius", () => {
  const edit = {
    corner: "nw",
    startRadius: 10,
    startX: 20,
    startY: 20
  };

  assert.equal(calculateDraggedSliceRadius(edit, { x: -100, y: -100 }, 50), 0);
  assert.equal(calculateDraggedSliceRadius(edit, { x: 200, y: 200 }, 50), 50);
});

test("calculateSliceRadiusHandleInset keeps zero and maximum radius controls inside the box", () => {
  assert.equal(calculateSliceRadiusHandleInset(0, 100, 60), 10);
  assert.equal(calculateSliceRadiusHandleInset(50, 100, 60), 28);
  assert.equal(calculateSliceRadiusHandleInset(0, 8, 8), 4);
});

test("pointToScreenCoords maps viewport points into clamped screen pixels", () => {
  const screen = { width: 390, height: 844 };
  const imageRect = { left: 10, top: 20, width: 195, height: 422 };

  assert.deepEqual(pointToScreenCoords(107.5, 231, imageRect, screen), {
    x: 195,
    y: 422
  });
  assert.deepEqual(pointToScreenCoords(-10, 900, imageRect, screen), {
    x: 0,
    y: 844
  });
});

test("normalizeDraftRect clamps reversed drags to the screen", () => {
  const screen = { width: 390, height: 844 };

  assert.deepEqual(normalizeDraftRect({
    startX: 410,
    startY: 100.4,
    currentX: 20.2,
    currentY: -20
  }, screen), {
    x: 20,
    y: 0,
    width: 370,
    height: 100
  });
});

test("normalizeDraftRect keeps tiny drafts at least one pixel", () => {
  assert.deepEqual(normalizeDraftRect({
    startX: 12,
    startY: 18,
    currentX: 12,
    currentY: 18
  }, { width: 100, height: 100 }), {
    x: 12,
    y: 18,
    width: 1,
    height: 1
  });
});

test("slice field helpers clamp max values and radius", () => {
  const screen = { width: 100, height: 80 };
  const asset = { radius: 999, placement: { x: 10, y: 20, width: 30, height: 40 } };

  assert.equal(getSliceFieldMax(asset, "x", screen), 70);
  assert.equal(getSliceFieldMax(asset, "y", screen), 40);
  assert.equal(getSliceFieldMax(asset, "width", screen), 90);
  assert.equal(getSliceFieldMax(asset, "height", screen), 60);
  assert.equal(getSliceFieldMax(asset, "radius", screen), 15);
  assert.equal(getSliceRadius(asset, screen), 15);
});

test("slice radius CSS preserves the same physical corner proportions in image previews", () => {
  const asset = {
    radius: 24,
    placement: { x: 0, y: 0, width: 240, height: 120 }
  };

  assert.equal(getSliceRadiusCssValue(asset, { width: 750, height: 1334 }), "10% / 20%");
  assert.equal(getSliceRadiusCssValue({ ...asset, radius: 0 }), "0");
});

test("slice radii migrate the legacy uniform radius and prefer explicit corners", () => {
  const placement = { x: 0, y: 0, width: 120, height: 80 };

  assert.deepEqual(getSliceRadii({ placement, radius: 12 }), {
    topLeft: 12,
    topRight: 12,
    bottomRight: 12,
    bottomLeft: 12
  });
  assert.deepEqual(getSliceRadii({
    placement,
    radius: 12,
    radii: { topLeft: -5, topRight: 8, bottomRight: 999, bottomLeft: 16 }
  }), {
    topLeft: 0,
    topRight: 8,
    bottomRight: 40,
    bottomLeft: 16
  });
});

test("setSliceCornerRadius changes one corner without changing the others", () => {
  const asset = {
    placement: { x: 0, y: 0, width: 120, height: 80 },
    radius: 12
  };

  setSliceCornerRadius(asset, "topRight", 30);

  assert.deepEqual(asset.radii, {
    topLeft: 12,
    topRight: 30,
    bottomRight: 12,
    bottomLeft: 12
  });
  assert.equal(asset.radius, 30);
});

test("slice radii CSS preserves corner order and independent physical proportions", () => {
  const asset = {
    placement: { x: 0, y: 0, width: 200, height: 100 },
    radii: { topLeft: 10, topRight: 20, bottomRight: 30, bottomLeft: 40 }
  };

  assert.equal(
    getSliceRadiiCssValue(asset, { width: 750, height: 1334 }),
    "5% 10% 15% 20% / 10% 20% 30% 40%"
  );
});

test("normalizeSlicePlacement keeps slices inside the screen", () => {
  assert.deepEqual(normalizeSlicePlacement({
    x: -10,
    y: 99,
    width: 500,
    height: 0
  }, { width: 120, height: 100 }), {
    x: 0,
    y: 99,
    width: 120,
    height: 1
  });
});

test("normalizeEditedPlacement moves and resizes within screen bounds", () => {
  const screen = { width: 100, height: 100 };
  const original = { x: 20, y: 30, width: 40, height: 20 };

  assert.deepEqual(normalizeEditedPlacement({
    mode: "move",
    original,
    startX: 50,
    startY: 50
  }, { x: 100, y: 0 }, screen), {
    x: 60,
    y: 0,
    width: 40,
    height: 20
  });
  assert.deepEqual(normalizeEditedPlacement({
    mode: "se",
    original,
    startX: 50,
    startY: 50
  }, { x: 150, y: 10 }, screen), {
    x: 20,
    y: 30,
    width: 80,
    height: 8
  });
});

test("hasSlicePlacementChanged compares placement fields only", () => {
  assert.equal(hasSlicePlacementChanged(
    { x: 1, y: 2, width: 3, height: 4, radius: 5 },
    { x: 1, y: 2, width: 3, height: 4, radius: 6 }
  ), false);
  assert.equal(hasSlicePlacementChanged(
    { x: 1, y: 2, width: 3, height: 4 },
    { x: 1, y: 2, width: 4, height: 4 }
  ), true);
});
