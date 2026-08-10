const sliceGeometryClampNumber = typeof require === "function" ? require("./app-utils").clampNumber : clampNumber;

function pointToScreenCoords(clientX, clientY, imageRect, screen) {
  const x = ((clientX - imageRect.left) / imageRect.width) * screen.width;
  const y = ((clientY - imageRect.top) / imageRect.height) * screen.height;
  return {
    x: sliceGeometryClampNumber(Math.round(x), 0, screen.width, 0),
    y: sliceGeometryClampNumber(Math.round(y), 0, screen.height, 0)
  };
}

function normalizeDraftRect(draft, screen) {
  const x1 = sliceGeometryClampNumber(Math.min(draft.startX, draft.currentX), 0, screen.width, 0);
  const y1 = sliceGeometryClampNumber(Math.min(draft.startY, draft.currentY), 0, screen.height, 0);
  const x2 = sliceGeometryClampNumber(Math.max(draft.startX, draft.currentX), 0, screen.width, screen.width);
  const y2 = sliceGeometryClampNumber(Math.max(draft.startY, draft.currentY), 0, screen.height, screen.height);
  return {
    x: Math.round(x1),
    y: Math.round(y1),
    width: Math.max(1, Math.round(x2 - x1)),
    height: Math.max(1, Math.round(y2 - y1))
  };
}

function getSliceFieldMax(asset, field, screen = { width: 4096, height: 4096 }) {
  const placement = asset?.placement || {};
  if (field === "x") {
    return Math.max(0, Math.round(screen.width - Math.max(1, Number(placement.width) || 1)));
  }
  if (field === "y") {
    return Math.max(0, Math.round(screen.height - Math.max(1, Number(placement.height) || 1)));
  }
  if (field === "width") {
    return Math.max(1, Math.round(screen.width - Math.max(0, Number(placement.x) || 0)));
  }
  if (field === "height") {
    return Math.max(1, Math.round(screen.height - Math.max(0, Number(placement.y) || 0)));
  }
  if (field === "radius") {
    return Math.max(0, Math.floor(Math.min(Number(placement.width) || 0, Number(placement.height) || 0) / 2));
  }
  return 4096;
}

function getSliceRadius(asset, screen = { width: 4096, height: 4096 }) {
  if (!asset) {
    return 0;
  }
  if (asset.radii && typeof asset.radii === "object") {
    return Math.max(...Object.values(getSliceRadii(asset, screen)));
  }
  return Math.round(sliceGeometryClampNumber(Number(asset.radius) || 0, 0, getSliceFieldMax(asset, "radius", screen), 0));
}

const SLICE_RADIUS_CORNERS = ["topLeft", "topRight", "bottomRight", "bottomLeft"];

function getSliceRadii(asset, screen = { width: 4096, height: 4096 }) {
  const maxRadius = getSliceFieldMax(asset, "radius", screen);
  const fallback = Math.round(sliceGeometryClampNumber(
    Number(asset?.radius) || 0,
    0,
    maxRadius,
    0
  ));
  const explicit = asset?.radii && typeof asset.radii === "object" ? asset.radii : null;
  return Object.fromEntries(SLICE_RADIUS_CORNERS.map((corner) => [
    corner,
    Math.round(sliceGeometryClampNumber(
      explicit ? explicit[corner] : fallback,
      0,
      maxRadius,
      fallback
    ))
  ]));
}

function setSliceCornerRadius(asset, corner, value, screen = { width: 4096, height: 4096 }) {
  if (!asset || !SLICE_RADIUS_CORNERS.includes(corner)) return asset;
  const radii = getSliceRadii(asset, screen);
  radii[corner] = Math.round(sliceGeometryClampNumber(
    value,
    0,
    getSliceFieldMax(asset, "radius", screen),
    radii[corner]
  ));
  asset.radii = radii;
  asset.radius = Math.max(...Object.values(radii));
  return asset;
}

function formatSliceRadiusPercent(value) {
  return `${Math.round(value * 10000) / 10000}%`;
}

function getSliceRadiiCssValue(asset, screen = { width: 4096, height: 4096 }) {
  const radii = getSliceRadii(asset, screen);
  const width = Math.max(1, Number(asset?.placement?.width) || 1);
  const height = Math.max(1, Number(asset?.placement?.height) || 1);
  const values = SLICE_RADIUS_CORNERS.map((corner) => radii[corner]);
  if (values.every((value) => value === 0)) return "0";
  if (values.every((value) => value === values[0])) {
    return `${formatSliceRadiusPercent(values[0] * 100 / width)} / ${formatSliceRadiusPercent(values[0] * 100 / height)}`;
  }
  const horizontal = values.map((value) => formatSliceRadiusPercent(value * 100 / width));
  const vertical = values.map((value) => formatSliceRadiusPercent(value * 100 / height));
  return `${horizontal.join(" ")} / ${vertical.join(" ")}`;
}

function getSliceRadiusCssValue(asset, screen = { width: 4096, height: 4096 }) {
  return getSliceRadiiCssValue(asset, screen);
}

function calculateDraggedSliceRadius(edit, point, maxRadius) {
  const deltaX = point.x - edit.startX;
  const deltaY = point.y - edit.startY;
  const direction = {
    nw: [1, 1],
    ne: [-1, 1],
    se: [-1, -1],
    sw: [1, -1]
  }[edit.corner] || [1, 1];
  const inwardDelta = (deltaX * direction[0] + deltaY * direction[1]) / 2;
  return Math.round(sliceGeometryClampNumber(
    edit.startRadius + inwardDelta,
    0,
    Math.max(0, Number(maxRadius) || 0),
    0
  ));
}

function calculateSliceRadiusHandleInset(radius, renderedWidth, renderedHeight) {
  const maxInset = Math.max(4, Math.min(Number(renderedWidth) || 0, Number(renderedHeight) || 0) / 2 - 2);
  return sliceGeometryClampNumber(Number(radius) || 0, Math.min(10, maxInset), maxInset, Math.min(10, maxInset));
}

function normalizeSlicePlacement(placement, screen = { width: 4096, height: 4096 }) {
  const minSize = 1;
  const baseX = Math.round(sliceGeometryClampNumber(Number(placement.x) || 0, 0, screen.width - minSize, 0));
  const baseY = Math.round(sliceGeometryClampNumber(Number(placement.y) || 0, 0, screen.height - minSize, 0));
  const width = Math.round(sliceGeometryClampNumber(Number(placement.width) || minSize, minSize, screen.width - baseX, minSize));
  const height = Math.round(sliceGeometryClampNumber(Number(placement.height) || minSize, minSize, screen.height - baseY, minSize));
  return {
    x: baseX,
    y: baseY,
    width,
    height
  };
}

function normalizeEditedPlacement(edit, point, screen) {
  const minSize = 8;
  const original = edit.original;
  const deltaX = point.x - edit.startX;
  const deltaY = point.y - edit.startY;
  let x1 = original.x;
  let y1 = original.y;
  let x2 = original.x + original.width;
  let y2 = original.y + original.height;

  if (edit.mode === "move") {
    const nextX = sliceGeometryClampNumber(original.x + deltaX, 0, screen.width - original.width, 0);
    const nextY = sliceGeometryClampNumber(original.y + deltaY, 0, screen.height - original.height, 0);
    return {
      x: Math.round(nextX),
      y: Math.round(nextY),
      width: original.width,
      height: original.height
    };
  }

  if (edit.mode.includes("w")) {
    x1 = sliceGeometryClampNumber(original.x + deltaX, 0, x2 - minSize, 0);
  }
  if (edit.mode.includes("e")) {
    x2 = sliceGeometryClampNumber(original.x + original.width + deltaX, x1 + minSize, screen.width, screen.width);
  }
  if (edit.mode.includes("n")) {
    y1 = sliceGeometryClampNumber(original.y + deltaY, 0, y2 - minSize, 0);
  }
  if (edit.mode.includes("s")) {
    y2 = sliceGeometryClampNumber(original.y + original.height + deltaY, y1 + minSize, screen.height, screen.height);
  }

  return {
    x: Math.round(x1),
    y: Math.round(y1),
    width: Math.max(minSize, Math.round(x2 - x1)),
    height: Math.max(minSize, Math.round(y2 - y1))
  };
}

function hasSlicePlacementChanged(previous, next) {
  return ["x", "y", "width", "height"].some((field) => previous[field] !== next[field]);
}

if (typeof module !== "undefined") {
  module.exports = {
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
  };
}
