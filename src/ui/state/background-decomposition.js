function clampDecompositionNumber(value, min, max, fallback = min) {
  const number = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : fallback));
}

function normalizeDecompositionBox(bbox, screen) {
  const width = Math.max(1, Math.round(Number(screen?.width) || 1));
  const height = Math.max(1, Math.round(Number(screen?.height) || 1));
  const x = Math.round(clampDecompositionNumber(bbox?.x, 0, width - 1, 0));
  const y = Math.round(clampDecompositionNumber(bbox?.y, 0, height - 1, 0));
  return {
    x,
    y,
    width: Math.round(clampDecompositionNumber(bbox?.width, 1, width - x, width - x)),
    height: Math.round(clampDecompositionNumber(bbox?.height, 1, height - y, height - y))
  };
}

function normalizeDecompositionRadius(radius, bbox) {
  const maxRadius = Math.max(0, Math.floor(Math.min(
    Number(bbox?.width) || 0,
    Number(bbox?.height) || 0
  ) / 2));
  return Math.round(clampDecompositionNumber(radius, 0, maxRadius, 0));
}

const DECOMPOSITION_RADIUS_CORNERS = ["topLeft", "topRight", "bottomRight", "bottomLeft"];

function normalizeDecompositionRadii(radii, radius, bbox) {
  const fallback = normalizeDecompositionRadius(radius, bbox);
  const explicit = radii && typeof radii === "object" ? radii : null;
  return Object.fromEntries(DECOMPOSITION_RADIUS_CORNERS.map((corner) => [
    corner,
    normalizeDecompositionRadius(explicit ? explicit[corner] : fallback, bbox)
  ]));
}

function summarizeDecompositionRadii(radii) {
  return Math.max(0, ...Object.values(radii || {}).map((value) => Number(value) || 0));
}

function createBackgroundDecompositionReview(plan, screen) {
  const normalizedScreen = {
    width: Math.max(1, Math.round(Number(screen?.width) || 1)),
    height: Math.max(1, Math.round(Number(screen?.height) || 1))
  };
  const backgrounds = (Array.isArray(plan?.backgrounds) ? plan.backgrounds : []).map((background) => {
    const bbox = normalizeDecompositionBox(background.bbox, normalizedScreen);
    const radii = normalizeDecompositionRadii(background.radii, background.radius, bbox);
    return {
      ...background,
      bbox,
      radius: summarizeDecompositionRadii(radii),
      radii,
      bakedVisuals: Array.isArray(background.bakedVisuals) ? [...background.bakedVisuals] : [],
      enabled: true,
      overlays: (Array.isArray(background.overlays) ? background.overlays : []).map((overlay) => ({
        ...overlay,
        bbox: normalizeDecompositionBox(overlay.bbox, normalizedScreen),
        remove: overlay.kind === "code-overlay"
      }))
    };
  });
  return {
    screen: normalizedScreen,
    activeBackgroundId: backgrounds[0]?.id || null,
    backgrounds
  };
}

function getBackgroundDecompositionSource(image) {
  return {
    id: typeof image?.id === "string" ? image.id : "",
    width: Math.max(1, Math.round(Number(image?.naturalWidth || image?.width) || 1)),
    height: Math.max(1, Math.round(Number(image?.naturalHeight || image?.height) || 1))
  };
}

function normalizeCachedBackgroundDecomposition(review, source) {
  if (
    !review
    || review.imageId !== source.id
    || !Array.isArray(review.backgrounds)
  ) return null;
  const normalized = createBackgroundDecompositionReview(
    { backgrounds: review.backgrounds },
    { width: source.width, height: source.height }
  );
  normalized.backgrounds = normalized.backgrounds.map((background, backgroundIndex) => {
    const cachedBackground = review.backgrounds[backgroundIndex];
    return {
      ...background,
      enabled: typeof cachedBackground.enabled === "boolean" ? cachedBackground.enabled : background.enabled,
      overlays: background.overlays.map((overlay, overlayIndex) => {
        const cachedOverlay = cachedBackground.overlays?.[overlayIndex];
        return {
          ...overlay,
          remove: typeof cachedOverlay?.remove === "boolean" ? cachedOverlay.remove : overlay.remove
        };
      })
    };
  });
  normalized.activeBackgroundId = normalized.backgrounds.some(
    (background) => background.id === review.activeBackgroundId
  ) ? review.activeBackgroundId : normalized.backgrounds[0]?.id || null;
  const activeBackground = normalized.backgrounds.find(
    (background) => background.id === normalized.activeBackgroundId
  );
  normalized.activeOverlayId = activeBackground?.overlays.some(
    (overlay) => overlay.id === review.activeOverlayId && overlay.remove
  ) ? review.activeOverlayId : null;
  normalized.imageId = source.id;
  return normalized;
}

function createBackgroundDecompositionCache(review, image) {
  const source = getBackgroundDecompositionSource(image);
  const normalizedReview = normalizeCachedBackgroundDecomposition(review, source);
  if (!source.id || !normalizedReview) return null;
  return {
    schemaVersion: 1,
    sourceImageId: source.id,
    sourceWidth: source.width,
    sourceHeight: source.height,
    review: normalizedReview
  };
}

function getCachedBackgroundDecomposition(cache, image) {
  const source = getBackgroundDecompositionSource(image);
  if (
    cache?.schemaVersion !== 1
    || !source.id
    || cache.sourceImageId !== source.id
    || Number(cache.sourceWidth) !== source.width
    || Number(cache.sourceHeight) !== source.height
  ) return null;
  return normalizeCachedBackgroundDecomposition(cache.review, source);
}

function updateReviewBackground(review, backgroundId, update) {
  return {
    ...review,
    backgrounds: review.backgrounds.map((background) => (
      background.id === backgroundId ? update(background) : background
    ))
  };
}

function updateReviewOverlay(review, backgroundId, overlayId, update) {
  return updateReviewBackground(review, backgroundId, (background) => ({
    ...background,
    overlays: background.overlays.map((overlay) => (
      overlay.id === overlayId ? update(overlay) : overlay
    ))
  }));
}

function updateDecompositionBackground(review, backgroundId, bbox) {
  return updateReviewBackground(review, backgroundId, (background) => {
    const normalizedBox = normalizeDecompositionBox(bbox, review.screen);
    const radii = normalizeDecompositionRadii(background.radii, background.radius, normalizedBox);
    return {
      ...background,
      bbox: normalizedBox,
      radius: summarizeDecompositionRadii(radii),
      radii
    };
  });
}

function updateDecompositionBackgroundRadius(review, backgroundId, radius) {
  return updateReviewBackground(review, backgroundId, (background) => {
    const normalizedRadius = normalizeDecompositionRadius(radius, background.bbox);
    return {
      ...background,
      radius: normalizedRadius,
      radii: Object.fromEntries(DECOMPOSITION_RADIUS_CORNERS.map((corner) => [
        corner,
        normalizedRadius
      ]))
    };
  });
}

function updateDecompositionBackgroundCornerRadius(review, backgroundId, corner, radius) {
  if (!DECOMPOSITION_RADIUS_CORNERS.includes(corner)) return review;
  return updateReviewBackground(review, backgroundId, (background) => {
    const radii = normalizeDecompositionRadii(background.radii, background.radius, background.bbox);
    radii[corner] = normalizeDecompositionRadius(radius, background.bbox);
    return {
      ...background,
      radius: summarizeDecompositionRadii(radii),
      radii
    };
  });
}

function moveDecompositionBox(bbox, screen, dx = 0, dy = 0) {
  const screenWidth = Math.max(1, Math.round(Number(screen?.width) || 1));
  const screenHeight = Math.max(1, Math.round(Number(screen?.height) || 1));
  const width = Math.min(screenWidth, Math.max(1, Math.round(Number(bbox?.width) || 1)));
  const height = Math.min(screenHeight, Math.max(1, Math.round(Number(bbox?.height) || 1)));
  return {
    x: Math.round(clampDecompositionNumber(Number(bbox?.x) + Number(dx), 0, screenWidth - width, 0)),
    y: Math.round(clampDecompositionNumber(Number(bbox?.y) + Number(dy), 0, screenHeight - height, 0)),
    width,
    height
  };
}

function resizeDecompositionBox(bbox, screen, handle, dx = 0, dy = 0) {
  const normalized = normalizeDecompositionBox(bbox, screen);
  const screenWidth = Math.max(1, Math.round(Number(screen?.width) || 1));
  const screenHeight = Math.max(1, Math.round(Number(screen?.height) || 1));
  let left = normalized.x;
  let top = normalized.y;
  let right = normalized.x + normalized.width;
  let bottom = normalized.y + normalized.height;
  if (handle.includes("w")) {
    left = clampDecompositionNumber(left + Number(dx), 0, right - 1, left);
  }
  if (handle.includes("e")) {
    right = clampDecompositionNumber(right + Number(dx), left + 1, screenWidth, right);
  }
  if (handle.includes("n")) {
    top = clampDecompositionNumber(top + Number(dy), 0, bottom - 1, top);
  }
  if (handle.includes("s")) {
    bottom = clampDecompositionNumber(bottom + Number(dy), top + 1, screenHeight, bottom);
  }
  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.max(1, Math.round(right - left)),
    height: Math.max(1, Math.round(bottom - top))
  };
}

function moveDecompositionBackground(review, backgroundId, {
  bbox,
  dx = 0,
  dy = 0
}) {
  return updateReviewBackground(review, backgroundId, (background) => ({
    ...background,
    bbox: moveDecompositionBox(bbox, review.screen, dx, dy)
  }));
}

function resizeDecompositionBackground(review, backgroundId, {
  handle,
  bbox,
  dx = 0,
  dy = 0
}) {
  return updateReviewBackground(review, backgroundId, (background) => {
    const resizedBox = resizeDecompositionBox(bbox, review.screen, handle, dx, dy);
    const radii = normalizeDecompositionRadii(background.radii, background.radius, resizedBox);
    return {
      ...background,
      bbox: resizedBox,
      radius: summarizeDecompositionRadii(radii),
      radii
    };
  });
}

function moveDecompositionOverlay(review, backgroundId, overlayId, {
  bbox,
  dx = 0,
  dy = 0
}) {
  return updateReviewOverlay(review, backgroundId, overlayId, (overlay) => ({
    ...overlay,
    bbox: moveDecompositionBox(bbox, review.screen, dx, dy)
  }));
}

function resizeDecompositionOverlay(review, backgroundId, overlayId, {
  handle,
  bbox,
  dx = 0,
  dy = 0
}) {
  return updateReviewOverlay(review, backgroundId, overlayId, (overlay) => ({
    ...overlay,
    bbox: resizeDecompositionBox(bbox, review.screen, handle, dx, dy)
  }));
}

function toggleDecompositionBackground(review, backgroundId) {
  return updateReviewBackground(review, backgroundId, (background) => ({
    ...background,
    enabled: !background.enabled
  }));
}

function toggleDecompositionOverlay(review, backgroundId, overlayId) {
  const updated = updateReviewBackground(review, backgroundId, (background) => ({
    ...background,
    overlays: background.overlays.map((overlay) => (
      overlay.id === overlayId ? { ...overlay, remove: !overlay.remove } : overlay
    ))
  }));
  return review.activeOverlayId === overlayId
    ? { ...updated, activeOverlayId: null }
    : updated;
}

function intersectDecompositionBoxes(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

function expandDecompositionRepairRegion(region, background) {
  const padding = Math.round(clampDecompositionNumber(
    Math.min(region.width, region.height) * 0.1,
    4,
    16,
    4
  ));
  const x = Math.max(background.x, region.x - padding);
  const y = Math.max(background.y, region.y - padding);
  const right = Math.min(background.x + background.width, region.x + region.width + padding);
  const bottom = Math.min(background.y + background.height, region.y + region.height + padding);
  return {
    x,
    y,
    width: right - x,
    height: bottom - y
  };
}

function getBackgroundDecompositionNavigation(review) {
  const backgrounds = Array.isArray(review?.backgrounds) ? review.backgrounds : [];
  if (backgrounds.length === 0) {
    return {
      activeBackgroundId: null,
      activeIndex: -1,
      total: 0,
      previousBackgroundId: null,
      nextBackgroundId: null
    };
  }
  const requestedIndex = backgrounds.findIndex(
    (background) => background.id === review.activeBackgroundId
  );
  const activeIndex = requestedIndex >= 0 ? requestedIndex : 0;
  return {
    activeBackgroundId: backgrounds[activeIndex].id,
    activeIndex,
    total: backgrounds.length,
    previousBackgroundId: activeIndex > 0 ? backgrounds[activeIndex - 1].id : null,
    nextBackgroundId: activeIndex + 1 < backgrounds.length
      ? backgrounds[activeIndex + 1].id
      : null
  };
}

function buildBackgroundRepairJobs(review) {
  return review.backgrounds.flatMap((background) => {
    if (!background.enabled) return [];
    const regions = background.overlays.flatMap((overlay) => {
      if (!overlay.remove) return [];
      const intersection = intersectDecompositionBoxes(background.bbox, overlay.bbox);
      if (!intersection) return [];
      const expanded = expandDecompositionRepairRegion(intersection, background.bbox);
      return [{
        x: expanded.x - background.bbox.x,
        y: expanded.y - background.bbox.y,
        width: expanded.width,
        height: expanded.height
      }];
    });
    if (regions.length === 0) return [];
    return [{
      backgroundId: background.id,
      name: background.name,
      bbox: { ...background.bbox },
      radius: background.radius,
      radii: { ...background.radii },
      bakedVisuals: [...background.bakedVisuals],
      regions
    }];
  });
}

if (typeof module !== "undefined") {
  module.exports = {
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
  };
}
