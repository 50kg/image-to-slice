const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCanvasViewportController
} = require("../src/ui/services/canvas-viewport");

function createEventTarget(initial = {}) {
  const listeners = new Map();
  return {
    clientWidth: 500,
    clientHeight: 500,
    scrollLeft: 0,
    scrollTop: 0,
    ...initial,
    addEventListener(type, listener) {
      const entries = listeners.get(type) || [];
      entries.push(listener);
      listeners.set(type, entries);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter((entry) => entry !== listener));
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener(event);
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    },
    getBoundingClientRect() {
      return { left: 10, top: 20, width: this.clientWidth, height: this.clientHeight };
    }
  };
}

function createFixture() {
  const viewport = createEventTarget();
  const wheelTarget = createEventTarget();
  const rendered = [];
  const resizeObserver = {
    observed: null,
    disconnected: false,
    observe(target) {
      this.observed = target;
    },
    disconnect() {
      this.disconnected = true;
    }
  };
  const controller = createCanvasViewportController({
    viewport,
    getSourceSize: () => ({ width: 500, height: 500 }),
    render: (view) => rendered.push(view),
    resizeObserverFactory: () => resizeObserver
  });
  return { controller, rendered, resizeObserver, viewport, wheelTarget };
}

test("canvas viewport clamps zoom and anchors scroll around the pointer", () => {
  const { controller, viewport } = createFixture();

  controller.setZoom(2, { x: 100, y: 80 });

  assert.deepEqual(controller.getState(), { zoom: 2, mode: "manual" });
  assert.equal(viewport.scrollLeft, 100);
  assert.equal(viewport.scrollTop, 80);

  controller.setZoom(99);
  assert.equal(controller.getState().zoom, 4);
});

test("canvas viewport wheel separates pinch zoom from forwarded scrolling", () => {
  const { controller, viewport, wheelTarget } = createFixture();
  controller.bindWheelTarget(wheelTarget);
  let prevented = 0;

  wheelTarget.dispatch("wheel", {
    ctrlKey: false,
    metaKey: false,
    deltaX: 12,
    deltaY: 30,
    preventDefault() {
      prevented += 1;
    }
  });
  assert.deepEqual([viewport.scrollLeft, viewport.scrollTop], [12, 30]);

  wheelTarget.dispatch("wheel", {
    ctrlKey: true,
    metaKey: false,
    clientX: 110,
    clientY: 100,
    deltaX: 0,
    deltaY: -20,
    preventDefault() {
      prevented += 1;
    }
  });
  assert.ok(controller.getState().zoom > 1);
  assert.equal(prevented, 2);
});

test("canvas viewport keyboard shortcuts are scoped to its viewport", () => {
  const { controller, viewport } = createFixture();

  viewport.dispatch("keydown", {
    key: "+",
    target: { closest: () => null },
    preventDefault() {}
  });
  assert.equal(controller.getState().zoom, 1.1);

  viewport.dispatch("keydown", {
    key: "f",
    target: { closest: () => null },
    preventDefault() {}
  });
  assert.deepEqual(controller.getState(), { zoom: 1, mode: "fit" });
});

test("destroy removes wheel, keyboard, controls, and resize listeners", () => {
  const { controller, resizeObserver, viewport, wheelTarget } = createFixture();
  controller.bindWheelTarget(wheelTarget);

  controller.destroy();

  assert.equal(wheelTarget.listenerCount("wheel"), 0);
  assert.equal(viewport.listenerCount("keydown"), 0);
  assert.equal(resizeObserver.disconnected, true);
});
