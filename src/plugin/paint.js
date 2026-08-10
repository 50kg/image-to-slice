const { clampNumber } = require("./ui-window-state");

function createDropShadow(shadow) {
  const shadowOpacity = shadow.opacity === undefined || shadow.opacity === null ? 0.12 : shadow.opacity;
  return {
    type: "DROP_SHADOW",
    color: hexToRgbColor(shadow.color || "#000000", shadowOpacity),
    offset: {
      x: Number.isFinite(Number(shadow.x)) ? Number(shadow.x) : 0,
      y: Number.isFinite(Number(shadow.y)) ? Number(shadow.y) : 10
    },
    radius: clampNumber(Number(shadow.blur), 0, 120, 24),
    spread: Number.isFinite(Number(shadow.spread)) ? Number(shadow.spread) : 0,
    visible: true,
    blendMode: "NORMAL"
  };
}

function normalizeRadius(radius) {
  return clampNumber(Number(radius), 0, 999, 0);
}

function applyCornerRadius(node, definition) {
  const radii = definition && definition.radii;
  if (radii && typeof radii === "object") {
    node.topLeftRadius = normalizeRadius(radii.topLeft);
    node.topRightRadius = normalizeRadius(radii.topRight);
    node.bottomRightRadius = normalizeRadius(radii.bottomRight);
    node.bottomLeftRadius = normalizeRadius(radii.bottomLeft);
    return;
  }
  node.cornerRadius = normalizeRadius(definition && definition.radius);
}

function hexToSolidPaint(hex, opacity) {
  const color = hexToRgbColor(hex, opacity);
  return {
    type: "SOLID",
    color: {
      r: color.r,
      g: color.g,
      b: color.b
    },
    opacity: color.a
  };
}

function createEditableFills(definition, fallbackHex) {
  const gradient = definition && definition.gradient;
  if (gradient && Array.isArray(gradient.stops) && gradient.stops.length >= 2) {
    if (gradient.type === "angular") {
      return [createAngularGradientPaint(gradient, definition.opacity)];
    }
    if (gradient.type === "radial") {
      return [createRadialGradientPaint(gradient, definition.opacity)];
    }
    return [createLinearGradientPaint(gradient, definition.opacity)];
  }
  if (definition && definition.fill === null) {
    return [];
  }
  return [hexToSolidPaint((definition && definition.fill) || fallbackHex || "#FFFFFF", definition && definition.opacity)];
}

function createLinearGradientPaint(gradient, opacity) {
  const stops = gradient.stops
    .map((stop, index) => ({
      position: clampNumber(Number(stop.position), 0, 1, index / Math.max(1, gradient.stops.length - 1)),
      color: hexToRgbColor(stop.color || "#FFFFFF", (stop.opacity === undefined ? 1 : stop.opacity) * clampOpacity(opacity))
    }))
    .sort((a, b) => a.position - b.position);
  return {
    type: "GRADIENT_LINEAR",
    gradientTransform: gradientTransformFromAngle(gradient.angle),
    gradientStops: stops
  };
}

function createRadialGradientPaint(gradient, opacity) {
  const stops = gradient.stops
    .map((stop, index) => ({
      position: clampNumber(Number(stop.position), 0, 1, index / Math.max(1, gradient.stops.length - 1)),
      color: hexToRgbColor(stop.color || "#FFFFFF", (stop.opacity === undefined ? 1 : stop.opacity) * clampOpacity(opacity))
    }))
    .sort((a, b) => a.position - b.position);
  return {
    type: "GRADIENT_RADIAL",
    gradientTransform: [[1, 0, 0], [0, 1, 0]],
    gradientStops: stops
  };
}

function createAngularGradientPaint(gradient, opacity) {
  const stops = gradient.stops
    .map((stop, index) => ({
      position: clampUnitFloat(
        Number(stop.position),
        index / Math.max(1, gradient.stops.length - 1)
      ),
      color: hexToRgbColor(stop.color || "#FFFFFF", (stop.opacity === undefined ? 1 : stop.opacity) * clampOpacity(opacity))
    }))
    .sort((a, b) => a.position - b.position);
  return {
    type: "GRADIENT_ANGULAR",
    gradientTransform: angularGradientTransformFromAngle(gradient.angle),
    gradientStops: stops
  };
}

function clampUnitFloat(value, fallback) {
  return Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function angularGradientTransformFromAngle(angle) {
  const radians = (((Number(angle) || 0) % 360) + 360) % 360 * Math.PI / 180;
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);
  const clean = (value) => Math.abs(value) < 1e-12 ? 0 : value;
  return [
    [clean(2 * sin), clean(-2 * cos), clean(cos - sin)],
    [clean(2 * cos), clean(2 * sin), clean(-(cos + sin))]
  ];
}

function gradientTransformFromAngle(angle) {
  const normalized = ((Number(angle) % 360) + 360) % 360;
  if (normalized >= 45 && normalized < 135) {
    return [[1, 0, 0], [0, 1, 0]];
  }
  if (normalized >= 135 && normalized < 225) {
    return [[0, 1, 0], [-1, 0, 1]];
  }
  if (normalized >= 225 && normalized < 315) {
    return [[-1, 0, 1], [0, -1, 1]];
  }
  return [[0, -1, 1], [1, 0, 0]];
}

function hexToRgbColor(hex, opacity) {
  const normalized = String(hex || "#000000").replace("#", "").trim();
  const value = normalized.length === 3
    ? normalized.split("").map((character) => `${character}${character}`).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  const number = Number.parseInt(value, 16);
  return {
    r: ((number >> 16) & 255) / 255,
    g: ((number >> 8) & 255) / 255,
    b: (number & 255) / 255,
    a: clampOpacity(opacity)
  };
}

function clampOpacity(opacity) {
  const value = Number(opacity);
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(1, Math.max(0, value));
}

module.exports = {
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
};
