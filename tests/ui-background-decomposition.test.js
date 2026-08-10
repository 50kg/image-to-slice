const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBackgroundRepairJobs,
  createBackgroundDecompositionCache,
  createBackgroundDecompositionReview,
  getBackgroundDecompositionNavigation,
  getCachedBackgroundDecomposition,
  moveDecompositionBackground,
  moveDecompositionOverlay,
  resizeDecompositionBackground,
  resizeDecompositionOverlay,
  toggleDecompositionBackground,
  toggleDecompositionOverlay,
  updateDecompositionBackground,
  updateDecompositionBackgroundCornerRadius,
  updateDecompositionBackgroundRadius
} = require("../src/ui/state/background-decomposition");

const plan = {
  backgrounds: [{
    id: "hero",
    name: "完整主视觉",
    bbox: { x: 10, y: 20, width: 80, height: 100 },
    bakedVisuals: ["艺术标题"],
    overlays: [
      {
        id: "back",
        name: "返回按钮",
        kind: "code-overlay",
        bbox: { x: 14, y: 24, width: 20, height: 20 }
      },
      {
        id: "photo",
        name: "独立照片",
        kind: "raster-overlay",
        bbox: { x: 50, y: 60, width: 20, height: 20 }
      }
    ]
  }]
};

test("decomposition review enables backgrounds and code overlays by default", () => {
  const review = createBackgroundDecompositionReview(plan, { width: 100, height: 140 });

  assert.equal(review.activeBackgroundId, "hero");
  assert.equal(review.backgrounds[0].enabled, true);
  assert.equal(review.backgrounds[0].radius, 0);
  assert.deepEqual(review.backgrounds[0].radii, {
    topLeft: 0,
    topRight: 0,
    bottomRight: 0,
    bottomLeft: 0
  });
  assert.equal(review.backgrounds[0].overlays[0].remove, true);
  assert.equal(review.backgrounds[0].overlays[1].remove, false);
});

test("background navigation reports current position and non-wrapping neighbors", () => {
  const review = createBackgroundDecompositionReview({
    backgrounds: [
      { ...plan.backgrounds[0], id: "hero", name: "主视觉" },
      { ...plan.backgrounds[0], id: "menu", name: "金刚位" },
      { ...plan.backgrounds[0], id: "offer", name: "优惠区" }
    ]
  }, { width: 100, height: 140 });
  review.activeBackgroundId = "menu";

  assert.deepEqual(getBackgroundDecompositionNavigation(review), {
    activeBackgroundId: "menu",
    activeIndex: 1,
    total: 3,
    previousBackgroundId: "hero",
    nextBackgroundId: "offer"
  });
});

test("background navigation falls back to the first task and handles an empty review", () => {
  const review = createBackgroundDecompositionReview({
    backgrounds: [
      { ...plan.backgrounds[0], id: "hero" },
      { ...plan.backgrounds[0], id: "menu" }
    ]
  }, { width: 100, height: 140 });
  review.activeBackgroundId = "missing";

  assert.deepEqual(getBackgroundDecompositionNavigation(review), {
    activeBackgroundId: "hero",
    activeIndex: 0,
    total: 2,
    previousBackgroundId: null,
    nextBackgroundId: "menu"
  });
  assert.deepEqual(getBackgroundDecompositionNavigation({ backgrounds: [] }), {
    activeBackgroundId: null,
    activeIndex: -1,
    total: 0,
    previousBackgroundId: null,
    nextBackgroundId: null
  });
});

test("background navigation includes disabled tasks in navigation order", () => {
  const review = createBackgroundDecompositionReview({
    backgrounds: [
      { ...plan.backgrounds[0], id: "hero" },
      { ...plan.backgrounds[0], id: "menu" },
      { ...plan.backgrounds[0], id: "offer" }
    ]
  }, { width: 100, height: 140 });
  review.backgrounds[1].enabled = false;
  review.activeBackgroundId = "hero";

  assert.equal(getBackgroundDecompositionNavigation(review).nextBackgroundId, "menu");
});

test("decomposition cache preserves a completed analysis with no background candidates", () => {
  const image = {
    id: "image-1",
    naturalWidth: 100,
    naturalHeight: 140
  };
  const review = createBackgroundDecompositionReview({ backgrounds: [] }, {
    width: 100,
    height: 140
  });
  review.imageId = image.id;

  const cache = createBackgroundDecompositionCache(review, image);
  const restored = getCachedBackgroundDecomposition(cache, image);

  assert.ok(cache);
  assert.deepEqual(restored.backgrounds, []);
  assert.equal(restored.activeBackgroundId, null);
});

test("background radius is linked, clamped, and follows later geometry changes", () => {
  const review = createBackgroundDecompositionReview(plan, { width: 100, height: 140 });
  const rounded = updateDecompositionBackgroundRadius(review, "hero", 999);
  const resized = updateDecompositionBackground(rounded, "hero", {
    x: 10,
    y: 20,
    width: 30,
    height: 20
  });

  assert.equal(rounded.backgrounds[0].radius, 40);
  assert.equal(resized.backgrounds[0].radius, 10);
  assert.equal(updateDecompositionBackgroundRadius(review, "hero", -5).backgrounds[0].radius, 0);
  assert.equal(review.backgrounds[0].radius, 0);
});

test("background corner radii update independently and clamp after geometry shrinks", () => {
  const review = createBackgroundDecompositionReview({
    backgrounds: [{
      ...plan.backgrounds[0],
      radius: 12
    }]
  }, { width: 100, height: 140 });
  const rounded = updateDecompositionBackgroundCornerRadius(review, "hero", "topRight", 30);
  const resized = updateDecompositionBackground(rounded, "hero", {
    x: 10,
    y: 20,
    width: 30,
    height: 20
  });

  assert.deepEqual(rounded.backgrounds[0].radii, {
    topLeft: 12,
    topRight: 30,
    bottomRight: 12,
    bottomLeft: 12
  });
  assert.deepEqual(resized.backgrounds[0].radii, {
    topLeft: 10,
    topRight: 10,
    bottomRight: 10,
    bottomLeft: 10
  });
});

test("background geometry updates are clamped to the screen", () => {
  const review = createBackgroundDecompositionReview(plan, { width: 100, height: 140 });
  const updated = updateDecompositionBackground(review, "hero", {
    x: -20,
    y: 130,
    width: 150,
    height: 80
  });

  assert.deepEqual(updated.backgrounds[0].bbox, {
    x: 0,
    y: 130,
    width: 100,
    height: 10
  });
  assert.deepEqual(review.backgrounds[0].bbox, plan.backgrounds[0].bbox);
});

test("moving a decomposition background stops at every screen edge without resizing it", () => {
  const review = createBackgroundDecompositionReview(plan, { width: 100, height: 140 });
  const expectedByDelta = [
    [{ dx: 200, dy: 0 }, { x: 20, y: 20, width: 80, height: 100 }],
    [{ dx: -200, dy: 0 }, { x: 0, y: 20, width: 80, height: 100 }],
    [{ dx: 0, dy: 200 }, { x: 10, y: 40, width: 80, height: 100 }],
    [{ dx: 0, dy: -200 }, { x: 10, y: 0, width: 80, height: 100 }]
  ];

  for (const [delta, expected] of expectedByDelta) {
    const moved = moveDecompositionBackground(review, "hero", {
      bbox: review.backgrounds[0].bbox,
      ...delta
    });
    assert.deepEqual(moved.backgrounds[0].bbox, expected);
  }
});

test("all eight decomposition handles resize the expected edges", () => {
  const review = createBackgroundDecompositionReview(plan, { width: 120, height: 160 });
  const expectedByHandle = {
    nw: { x: 15, y: 27, width: 75, height: 93 },
    n: { x: 10, y: 27, width: 80, height: 93 },
    ne: { x: 10, y: 27, width: 85, height: 93 },
    e: { x: 10, y: 20, width: 85, height: 100 },
    se: { x: 10, y: 20, width: 85, height: 107 },
    s: { x: 10, y: 20, width: 80, height: 107 },
    sw: { x: 15, y: 20, width: 75, height: 107 },
    w: { x: 15, y: 20, width: 75, height: 100 }
  };

  for (const handle of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
    const updated = resizeDecompositionBackground(review, "hero", {
      handle,
      bbox: { x: 10, y: 20, width: 80, height: 100 },
      dx: 5,
      dy: 7
    });
    assert.deepEqual(updated.backgrounds[0].bbox, expectedByHandle[handle], handle);
  }
});

test("moving a decomposition overlay stops at every screen edge without resizing it", () => {
  const review = createBackgroundDecompositionReview(plan, { width: 100, height: 140 });
  const overlay = review.backgrounds[0].overlays[0];
  const expectedByDelta = [
    [{ dx: 200, dy: 0 }, { x: 80, y: 24, width: 20, height: 20 }],
    [{ dx: -200, dy: 0 }, { x: 0, y: 24, width: 20, height: 20 }],
    [{ dx: 0, dy: 200 }, { x: 14, y: 120, width: 20, height: 20 }],
    [{ dx: 0, dy: -200 }, { x: 14, y: 0, width: 20, height: 20 }]
  ];

  for (const [delta, expected] of expectedByDelta) {
    const moved = moveDecompositionOverlay(review, "hero", "back", {
      bbox: overlay.bbox,
      ...delta
    });
    assert.deepEqual(moved.backgrounds[0].overlays[0].bbox, expected);
  }
});

test("all eight decomposition overlay handles resize the expected edges", () => {
  const review = createBackgroundDecompositionReview(plan, { width: 120, height: 160 });
  const expectedByHandle = {
    nw: { x: 19, y: 31, width: 15, height: 13 },
    n: { x: 14, y: 31, width: 20, height: 13 },
    ne: { x: 14, y: 31, width: 25, height: 13 },
    e: { x: 14, y: 24, width: 25, height: 20 },
    se: { x: 14, y: 24, width: 25, height: 27 },
    s: { x: 14, y: 24, width: 20, height: 27 },
    sw: { x: 19, y: 24, width: 15, height: 27 },
    w: { x: 19, y: 24, width: 15, height: 20 }
  };

  for (const handle of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
    const updated = resizeDecompositionOverlay(review, "hero", "back", {
      handle,
      bbox: { x: 14, y: 24, width: 20, height: 20 },
      dx: 5,
      dy: 7
    });
    assert.deepEqual(updated.backgrounds[0].overlays[0].bbox, expectedByHandle[handle], handle);
  }
});

test("decomposition resize keeps the opposite edge fixed at canvas and minimum-size limits", () => {
  const review = createBackgroundDecompositionReview(plan, { width: 120, height: 160 });
  const backgroundCases = [
    ["w", -100, 0, { x: 0, y: 20, width: 90, height: 100 }],
    ["n", 0, -100, { x: 10, y: 0, width: 80, height: 120 }],
    ["e", 100, 0, { x: 10, y: 20, width: 110, height: 100 }],
    ["s", 0, 100, { x: 10, y: 20, width: 80, height: 140 }],
    ["w", 1000, 0, { x: 89, y: 20, width: 1, height: 100 }],
    ["n", 0, 1000, { x: 10, y: 119, width: 80, height: 1 }]
  ];

  for (const [handle, dx, dy, expected] of backgroundCases) {
    const updated = resizeDecompositionBackground(review, "hero", {
      handle,
      bbox: { x: 10, y: 20, width: 80, height: 100 },
      dx,
      dy
    });
    assert.deepEqual(updated.backgrounds[0].bbox, expected, `background ${handle}`);
  }

  const overlayCases = [
    ["w", -100, 0, { x: 0, y: 24, width: 34, height: 20 }],
    ["n", 0, -100, { x: 14, y: 0, width: 20, height: 44 }],
    ["w", 1000, 0, { x: 33, y: 24, width: 1, height: 20 }],
    ["n", 0, 1000, { x: 14, y: 43, width: 20, height: 1 }]
  ];

  for (const [handle, dx, dy, expected] of overlayCases) {
    const updated = resizeDecompositionOverlay(review, "hero", "back", {
      handle,
      bbox: { x: 14, y: 24, width: 20, height: 20 },
      dx,
      dy
    });
    assert.deepEqual(updated.backgrounds[0].overlays[0].bbox, expected, `overlay ${handle}`);
  }
});

test("background and overlay toggles do not mutate the original review", () => {
  const review = {
    ...createBackgroundDecompositionReview(plan, { width: 100, height: 140 }),
    activeOverlayId: "back"
  };
  const overlayUpdated = toggleDecompositionOverlay(review, "hero", "back");
  const backgroundUpdated = toggleDecompositionBackground(overlayUpdated, "hero");

  assert.equal(overlayUpdated.backgrounds[0].overlays[0].remove, false);
  assert.equal(overlayUpdated.activeOverlayId, null);
  assert.equal(backgroundUpdated.backgrounds[0].enabled, false);
  assert.equal(review.backgrounds[0].overlays[0].remove, true);
  assert.equal(review.backgrounds[0].enabled, true);
});

test("repair jobs include enabled backgrounds and selected overlays in local coordinates", () => {
  const review = createBackgroundDecompositionReview(plan, { width: 100, height: 140 });
  const withRaster = toggleDecompositionOverlay(review, "hero", "photo");
  const jobs = buildBackgroundRepairJobs(withRaster);

  assert.deepEqual(jobs, [{
    backgroundId: "hero",
    name: "完整主视觉",
    bbox: { x: 10, y: 20, width: 80, height: 100 },
    radius: 0,
    radii: {
      topLeft: 0,
      topRight: 0,
      bottomRight: 0,
      bottomLeft: 0
    },
    bakedVisuals: ["艺术标题"],
    regions: [
      { x: 0, y: 0, width: 28, height: 28 },
      { x: 36, y: 36, width: 28, height: 28 }
    ]
  }]);
});

test("repair jobs exclude disabled backgrounds and backgrounds without selected overlays", () => {
  const review = createBackgroundDecompositionReview(plan, { width: 100, height: 140 });
  const withoutOverlay = toggleDecompositionOverlay(review, "hero", "back");
  const disabled = toggleDecompositionBackground(review, "hero");

  assert.deepEqual(buildBackgroundRepairJobs(withoutOverlay), []);
  assert.deepEqual(buildBackgroundRepairJobs(disabled), []);
});

test("repair jobs expand overlay regions to remove antialiased edges without leaving the background", () => {
  const review = createBackgroundDecompositionReview({
    backgrounds: [{
      id: "hero",
      name: "完整主视觉",
      bbox: { x: 10, y: 20, width: 80, height: 100 },
      overlays: [{
        id: "back",
        name: "返回按钮",
        kind: "code-overlay",
        bbox: { x: 14, y: 24, width: 20, height: 20 }
      }]
    }]
  }, { width: 100, height: 140 });

  assert.deepEqual(buildBackgroundRepairJobs(review)[0].regions, [
    { x: 0, y: 0, width: 28, height: 28 }
  ]);
});

test("decomposition cache restores the edited review for the same source image", () => {
  const image = { id: "image-1", naturalWidth: 100, naturalHeight: 140 };
  let review = createBackgroundDecompositionReview(plan, { width: 100, height: 140 });
  review = updateDecompositionBackground(review, "hero", {
    x: 5,
    y: 8,
    width: 90,
    height: 120
  });
  review = updateDecompositionBackgroundRadius(review, "hero", 24);
  review = updateDecompositionBackgroundCornerRadius(review, "hero", "bottomLeft", 10);
  review = toggleDecompositionBackground(review, "hero");
  review = toggleDecompositionOverlay(review, "hero", "back");
  review = toggleDecompositionOverlay(review, "hero", "photo");
  review = {
    ...review,
    imageId: image.id,
    activeBackgroundId: "hero",
    activeOverlayId: "photo"
  };

  const restored = getCachedBackgroundDecomposition(
    createBackgroundDecompositionCache(review, image),
    image
  );

  assert.deepEqual(restored.backgrounds[0].bbox, { x: 5, y: 8, width: 90, height: 120 });
  assert.equal(restored.backgrounds[0].radius, 24);
  assert.deepEqual(restored.backgrounds[0].radii, {
    topLeft: 24,
    topRight: 24,
    bottomRight: 24,
    bottomLeft: 10
  });
  assert.equal(restored.backgrounds[0].enabled, false);
  assert.equal(restored.backgrounds[0].overlays[0].remove, false);
  assert.equal(restored.activeBackgroundId, "hero");
  assert.equal(restored.activeOverlayId, "photo");
  assert.equal(restored.imageId, "image-1");
});

test("decomposition cache rejects another image, changed dimensions, and malformed versions", () => {
  const image = { id: "image-1", naturalWidth: 100, naturalHeight: 140 };
  const review = {
    ...createBackgroundDecompositionReview(plan, { width: 100, height: 140 }),
    imageId: image.id
  };
  const cache = createBackgroundDecompositionCache(review, image);

  assert.equal(getCachedBackgroundDecomposition(cache, {
    id: "image-2",
    naturalWidth: 100,
    naturalHeight: 140
  }), null);
  assert.equal(getCachedBackgroundDecomposition(cache, {
    id: "image-1",
    naturalWidth: 101,
    naturalHeight: 140
  }), null);
  assert.equal(getCachedBackgroundDecomposition({ ...cache, schemaVersion: 99 }, image), null);
  assert.equal(getCachedBackgroundDecomposition({ schemaVersion: 1 }, image), null);
});

test("decomposition cache clamps persisted geometry while preserving user choices", () => {
  const image = { id: "image-1", naturalWidth: 100, naturalHeight: 140 };
  const cache = {
    schemaVersion: 1,
    sourceImageId: "image-1",
    sourceWidth: 100,
    sourceHeight: 140,
    review: {
      imageId: "image-1",
      screen: { width: 100, height: 140 },
      activeBackgroundId: "hero",
      backgrounds: [{
        ...plan.backgrounds[0],
        enabled: false,
        bbox: { x: -20, y: 130, width: 150, height: 80 },
        overlays: plan.backgrounds[0].overlays.map((overlay) => ({
          ...overlay,
          remove: overlay.id === "photo"
        }))
      }]
    }
  };

  const restored = getCachedBackgroundDecomposition(cache, image);

  assert.deepEqual(restored.backgrounds[0].bbox, {
    x: 0,
    y: 130,
    width: 100,
    height: 10
  });
  assert.equal(restored.backgrounds[0].enabled, false);
  assert.equal(restored.backgrounds[0].overlays[0].remove, false);
  assert.equal(restored.backgrounds[0].overlays[1].remove, true);
});
