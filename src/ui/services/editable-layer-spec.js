function assertFixedCaptureRootSize(rootRect, targetScreen, tolerance = 1) {
  const width = Number(rootRect?.width);
  const height = Number(rootRect?.height);
  const targetWidth = Number(targetScreen?.width);
  const targetHeight = Number(targetScreen?.height);
  if (
    !Number.isFinite(width)
    || !Number.isFinite(height)
    || !Number.isFinite(targetWidth)
    || !Number.isFinite(targetHeight)
    || Math.abs(width - targetWidth) > tolerance
    || Math.abs(height - targetHeight) > tolerance
  ) {
    throw new Error(`快速导入画板尺寸与原图不一致：捕获 ${Math.round(width || 0)}x${Math.round(height || 0)}，原图 ${Math.round(targetWidth || 0)}x${Math.round(targetHeight || 0)}`);
  }
}

function createFastAuthoritativeAssetNode(asset, radius = 0, captureZIndex = 0) {
  const placement = asset?.placement;
  const sourceAssetId = String(asset?.id || "").trim();
  if (!placement || !sourceAssetId) {
    return null;
  }
  const x = Math.round(Number(placement.x));
  const y = Math.round(Number(placement.y));
  const width = Math.max(1, Math.round(Number(placement.width)));
  const height = Math.max(1, Math.round(Number(placement.height)));
  if (![x, y, width, height].every(Number.isFinite)) {
    return null;
  }
  const common = {
    name: asset.name || sourceAssetId,
    x,
    y,
    width,
    height,
    radius: Math.max(0, Math.round(Number(radius) || 0)),
    ...(asset.radii && typeof asset.radii === "object" ? {
      radii: {
        topLeft: Math.max(0, Math.round(Number(asset.radii.topLeft) || 0)),
        topRight: Math.max(0, Math.round(Number(asset.radii.topRight) || 0)),
        bottomRight: Math.max(0, Math.round(Number(asset.radii.bottomRight) || 0)),
        bottomLeft: Math.max(0, Math.round(Number(asset.radii.bottomLeft) || 0))
      }
    } : {}),
    sourceAssetId,
    captureZIndex: Number.isFinite(Number(captureZIndex)) ? Number(captureZIndex) : 0
  };
  if (String(asset.svgData || "").trim()) {
    return {
      type: "svg",
      ...common,
      svgData: asset.svgData
    };
  }
  if (/^data:image\/(?:png|jpeg|jpg);base64,/i.test(String(asset.dataUrl || "").trim())) {
    return {
      type: "image",
      ...common,
      dataUrl: asset.dataUrl,
      scaleMode: "FIT"
    };
  }
  return null;
}

function waitForFastCaptureStep(promise, timeoutMs = 1500) {
  const deadline = Math.max(1, Math.round(Number(timeoutMs) || 1500));
  return new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      finished = true;
      resolve(false);
    }, deadline);
    Promise.resolve(promise).then(
      () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve(true);
      },
      (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function waitForFastCaptureLayout(readRect, targetScreen, timeoutMs = 5000, pollMs = 25) {
  const deadline = Date.now() + Math.max(1, Math.round(Number(timeoutMs) || 5000));
  const interval = Math.max(1, Math.round(Number(pollMs) || 25));
  let lastRect = { width: 0, height: 0 };
  let lastError = null;

  return new Promise((resolve, reject) => {
    const check = () => {
      try {
        lastRect = readRect() || lastRect;
        assertFixedCaptureRootSize(lastRect, targetScreen);
        resolve(lastRect);
        return;
      } catch (error) {
        lastError = error;
      }
      if (Date.now() >= deadline) {
        reject(lastError);
        return;
      }
      setTimeout(check, interval);
    };
    check();
  });
}

function lockFastCaptureScreenSize(screenElement, targetScreen) {
  const width = Math.round(Number(targetScreen?.width));
  const height = Math.round(Number(targetScreen?.height));
  if (!screenElement?.style || !Number.isFinite(width) || width < 1 || !Number.isFinite(height) || height < 1) {
    throw new Error("快速导入缺少有效画板尺寸");
  }
  screenElement.style.setProperty("width", `${width}px`, "important");
  screenElement.style.setProperty("min-width", `${width}px`, "important");
  screenElement.style.setProperty("height", `${height}px`, "important");
  screenElement.style.setProperty("min-height", `${height}px`, "important");
  screenElement.style.setProperty("flex", "0 0 auto", "important");
}

function materializeVisibleCapturePseudos(doc, rootElement) {
  if (!doc?.defaultView?.getComputedStyle || !doc.createElement || !rootElement) {
    return () => {};
  }
  const candidates = [];
  const elements = [rootElement, ...(rootElement.querySelectorAll?.("*") || [])];
  for (const element of elements) {
    for (const pseudo of ["::before", "::after"]) {
      const style = doc.defaultView.getComputedStyle(element, pseudo);
      if (isVisibleCapturePseudoStyle(style)) {
        candidates.push({ element, pseudo, style });
      }
    }
  }

  const materialized = candidates.map(({ element, pseudo, style }) => {
    const node = doc.createElement("span");
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("data-codex-capture-pseudo", pseudo.slice(2));
    for (const property of CAPTURE_PSEUDO_STYLE_PROPERTIES) {
      const value = style.getPropertyValue(property);
      if (!value) {
        continue;
      }
      node.style.setProperty(
        property,
        value,
        style.getPropertyPriority?.(property) || ""
      );
    }
    node.style.setProperty("content", "none");
    node.style.setProperty("pointer-events", "none");
    if (pseudo === "::before") {
      element.insertBefore(node, element.firstChild || null);
    } else {
      element.appendChild(node);
    }
    return node;
  });

  return () => {
    materialized.forEach((node) => node.remove());
  };
}

const CAPTURE_PSEUDO_STYLE_PROPERTIES = [
  "display",
  "visibility",
  "position",
  "box-sizing",
  "left",
  "top",
  "right",
  "bottom",
  "inset",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "overflow",
  "opacity",
  "z-index",
  "transform",
  "transform-origin",
  "background-color",
  "background-image",
  "background-size",
  "background-position",
  "background-repeat",
  "background-origin",
  "background-clip",
  "background-blend-mode",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "box-shadow",
  "clip-path",
  "filter",
  "mix-blend-mode"
];

function isVisibleCapturePseudoStyle(style) {
  const content = String(style?.content || "").trim().toLowerCase();
  if (!content || content === "none" || content === "normal") {
    return false;
  }
  if (
    style.display === "none"
    || style.visibility === "hidden"
    || Number(style.opacity || 1) <= 0.01
    || !["absolute", "fixed"].includes(String(style.position || "").toLowerCase())
    || Number.parseFloat(style.width || "0") <= 0
    || Number.parseFloat(style.height || "0") <= 0
  ) {
    return false;
  }
  const backgroundColor = String(style.backgroundColor || "").toLowerCase();
  const backgroundImage = String(style.backgroundImage || "").toLowerCase();
  const hasBackground = (
    (backgroundImage && backgroundImage !== "none")
    || (backgroundColor && backgroundColor !== "transparent" && !/rgba?\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(backgroundColor))
  );
  const hasBorder = ["Top", "Right", "Bottom", "Left"].some((side) => (
    Number.parseFloat(style[`border${side}Width`] || "0") > 0
    && String(style[`border${side}Style`] || "none") !== "none"
  ));
  return hasBackground || hasBorder || (style.boxShadow && style.boxShadow !== "none");
}

async function getFastPreviewCaptureDocument(
  previewFrame,
  targetScreen,
  timeoutMs = 5000,
  pollMs = 25
) {
  const doc = previewFrame?.contentDocument;
  if (!doc) {
    throw new Error("无法读取快速导入预览 iframe");
  }
  await waitForFastCaptureLayout(() => {
    const screenElement = doc.querySelector(".screen");
    if (screenElement) {
      lockFastCaptureScreenSize(screenElement, targetScreen);
    }
    return screenElement?.getBoundingClientRect() || { width: 0, height: 0 };
  }, targetScreen, timeoutMs, pollMs);
  return doc;
}

function requireFastCaptureResult(promise, timeoutMs, message) {
  const deadline = Math.max(1, Math.round(Number(timeoutMs) || 8000));
  return new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      finished = true;
      reject(new Error(message || "快速导入捕获超时"));
    }, deadline);
    Promise.resolve(promise).then(
      (value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function runFastVendorCapture({
  screen,
  captureRaw,
  mapCapture,
  timeoutMs = 8000
}) {
  const raw = await requireFastCaptureResult(
    captureRaw(),
    timeoutMs,
    "快速导入 DOM 捕获超时"
  );
  const capture = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!capture?.root?.rect) {
    throw new Error("web-to-figma 没有返回有效 DOM 捕获数据");
  }
  assertFixedCaptureRootSize(capture.root.rect, screen);
  return mapCapture(capture, { fixedSize: true });
}

if (typeof module !== "undefined") {
  module.exports = {
    assertFixedCaptureRootSize,
    createFastAuthoritativeAssetNode,
    getFastPreviewCaptureDocument,
    lockFastCaptureScreenSize,
    materializeVisibleCapturePseudos,
    requireFastCaptureResult,
    runFastVendorCapture,
    waitForFastCaptureLayout,
    waitForFastCaptureStep
  };
}
