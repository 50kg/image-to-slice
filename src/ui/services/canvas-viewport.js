const canvasViewportUtils = typeof require === "function"
  ? require("./app-utils")
  : {
      calculatePreviewFitZoom,
      calculatePreviewPlacement,
      clampPreviewZoom
    };

function createCanvasViewportController({
  viewport,
  controls = null,
  getSourceSize,
  render,
  onViewChange = () => {},
  fitPadding = 0,
  resizeObserverFactory = typeof ResizeObserver === "undefined"
    ? null
    : (callback) => new ResizeObserver(callback)
}) {
  if (!viewport || typeof getSourceSize !== "function" || typeof render !== "function") {
    throw new Error("Canvas viewport requires viewport, getSourceSize, and render");
  }

  let zoom = 1;
  let mode = "fit";
  let lastView = null;
  let wheelTarget = null;
  let destroyed = false;

  function getSource() {
    const source = getSourceSize() || {};
    return {
      width: Math.max(0, Number(source.width) || 0),
      height: Math.max(0, Number(source.height) || 0)
    };
  }

  function updateControls() {
    if (!controls) return;
    const valueButton = controls.querySelector('[data-canvas-zoom="reset"]');
    const outButton = controls.querySelector('[data-canvas-zoom="out"]');
    const inButton = controls.querySelector('[data-canvas-zoom="in"]');
    const fitButton = controls.querySelector('[data-canvas-zoom="fit"]');
    if (valueButton) valueButton.textContent = `${Math.round(zoom * 100)}%`;
    if (outButton) outButton.disabled = zoom <= 0.1;
    if (inButton) inButton.disabled = zoom >= 4;
    fitButton?.classList.toggle("active", mode === "fit");
  }

  function renderCurrentView() {
    const source = getSource();
    const contentWidth = source.width * zoom;
    const contentHeight = source.height * zoom;
    const placement = canvasViewportUtils.calculatePreviewPlacement({
      contentWidth,
      contentHeight,
      viewportWidth: viewport.clientWidth,
      viewportHeight: viewport.clientHeight
    });
    lastView = {
      zoom,
      mode,
      contentWidth,
      contentHeight,
      left: placement.left,
      top: placement.top
    };
    render(lastView);
    updateControls();
    onViewChange(lastView);
    return lastView;
  }

  function setZoom(value, anchor = null) {
    if (destroyed) return;
    const previousView = lastView || renderCurrentView();
    const previousZoom = zoom;
    const nextZoom = canvasViewportUtils.clampPreviewZoom(value);
    const sourceAnchor = anchor ? {
      x: (viewport.scrollLeft + anchor.x - previousView.left) / previousZoom,
      y: (viewport.scrollTop + anchor.y - previousView.top) / previousZoom
    } : null;
    zoom = nextZoom;
    mode = "manual";
    const nextView = renderCurrentView();
    if (sourceAnchor) {
      viewport.scrollLeft = Math.max(0, sourceAnchor.x * zoom + nextView.left - anchor.x);
      viewport.scrollTop = Math.max(0, sourceAnchor.y * zoom + nextView.top - anchor.y);
    }
  }

  function fit() {
    if (destroyed) return;
    const source = getSource();
    mode = "fit";
    zoom = canvasViewportUtils.calculatePreviewFitZoom(
      source.width,
      source.height,
      Math.max(1, viewport.clientWidth - fitPadding * 2),
      Math.max(1, viewport.clientHeight - fitPadding * 2)
    );
    renderCurrentView();
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }

  function refresh() {
    if (destroyed) return;
    if (mode === "fit") {
      fit();
      return;
    }
    renderCurrentView();
  }

  function handleWheel(event) {
    const forwarded = wheelTarget !== viewport;
    if (!event.ctrlKey && !event.metaKey) {
      if (!forwarded) return;
      event.preventDefault();
      viewport.scrollLeft += Number(event.deltaX) || 0;
      viewport.scrollTop += Number(event.deltaY) || 0;
      return;
    }
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const anchor = {
      x: (Number(event.clientX) || rect.left + rect.width / 2) - rect.left,
      y: (Number(event.clientY) || rect.top + rect.height / 2) - rect.top
    };
    setZoom(zoom * Math.exp(-(Number(event.deltaY) || 0) * 0.01), anchor);
  }

  function bindWheelTarget(target = viewport) {
    wheelTarget?.removeEventListener("wheel", handleWheel);
    wheelTarget = target || viewport;
    wheelTarget.addEventListener("wheel", handleWheel, { passive: false });
  }

  function handleControlsClick(event) {
    const button = event.target.closest("[data-canvas-zoom]");
    if (!button || !controls.contains(button)) return;
    const action = button.dataset.canvasZoom;
    if (action === "out") setZoom(zoom - 0.1);
    if (action === "reset") setZoom(1);
    if (action === "in") setZoom(zoom + 0.1);
    if (action === "fit") fit();
  }

  function handleKeydown(event) {
    if (event.target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
    const key = String(event.key || "").toLowerCase();
    if (!["+", "=", "-", "_", "0", "f"].includes(key)) return;
    event.preventDefault();
    if (key === "+" || key === "=") setZoom(zoom + 0.1);
    if (key === "-" || key === "_") setZoom(zoom - 0.1);
    if (key === "0") setZoom(1);
    if (key === "f") fit();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    wheelTarget?.removeEventListener("wheel", handleWheel);
    controls?.removeEventListener("click", handleControlsClick);
    viewport.removeEventListener("keydown", handleKeydown);
    resizeObserver?.disconnect();
    wheelTarget = null;
  }

  controls?.addEventListener("click", handleControlsClick);
  viewport.addEventListener("keydown", handleKeydown);
  bindWheelTarget(viewport);
  const resizeObserver = resizeObserverFactory ? resizeObserverFactory(refresh) : null;
  resizeObserver?.observe(viewport);
  fit();

  return {
    bindWheelTarget,
    destroy,
    fit,
    getState: () => ({ zoom, mode }),
    refresh,
    setZoom
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    createCanvasViewportController
  };
}
