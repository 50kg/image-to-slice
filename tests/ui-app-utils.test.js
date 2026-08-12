const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateAnchoredPreviewScroll,
  calculatePreviewPlacement,
  calculatePreviewFitZoom,
  clampNumber,
  clampPreviewZoom,
  crc32,
  escapeHtml,
  getStatusPolicy,
  isPointInsideRect,
  normalizeStatusType,
  normalizeWindowSize,
  readErrorMessage,
  readNetworkErrorMessage,
  sanitizeFilename,
  sanitizeHtmlAssetStem,
  scalePlacement
} = require("../src/ui/services/app-utils");

test("preview zoom keeps the source point under the pointer anchored", () => {
  assert.deepEqual(calculateAnchoredPreviewScroll({
    scrollLeft: 100,
    scrollTop: 200,
    pointerX: 50,
    pointerY: 75,
    oldZoom: 0.5,
    newZoom: 1
  }), { left: 250, top: 475 });
});

test("scalePlacement scales a 390x844 base placement to the target screen", () => {
  assert.deepEqual(
    scalePlacement({ x: 195, y: 422, width: 39, height: 84.4 }, { width: 780, height: 1688 }),
    { x: 390, y: 844, width: 78, height: 169 }
  );
});

test("clampNumber clamps finite values and returns fallback for non-finite values", () => {
  assert.equal(clampNumber(5, 1, 10, 3), 5);
  assert.equal(clampNumber(-1, 1, 10, 3), 1);
  assert.equal(clampNumber(12, 1, 10, 3), 10);
  assert.equal(clampNumber(Number.NaN, 1, 10, 3), 3);
});

test("normalizeWindowSize clamps UI window dimensions", () => {
  assert.deepEqual(normalizeWindowSize(100, 100, { width: 540, height: 740 }), { width: 360, height: 240 });
  assert.deepEqual(normalizeWindowSize(5000, 3000, { width: 540, height: 740 }), { width: 3200, height: 2200 });
  assert.deepEqual(normalizeWindowSize("bad", null, { width: 540, height: 740 }), { width: 540, height: 240 });
  assert.deepEqual(normalizeWindowSize("bad", undefined), { width: 1280, height: 860 });
});

test("preview zoom helpers clamp and calculate fit zoom", () => {
  assert.equal(clampPreviewZoom(0), 1);
  assert.equal(clampPreviewZoom(0.01), 0.1);
  assert.equal(clampPreviewZoom(10), 4);
  assert.equal(calculatePreviewFitZoom(1000, 500, 500, 500), 0.5);
  assert.equal(calculatePreviewFitZoom(0, 500, 500, 500), 1);
});

test("status policy normalizes supported types and durations", () => {
  assert.equal(normalizeStatusType("success"), "success");
  assert.equal(normalizeStatusType("info"), "info");
  assert.equal(normalizeStatusType("warning"), "warning");
  assert.equal(normalizeStatusType("error"), "error");
  assert.equal(normalizeStatusType(true), "error");
  assert.equal(normalizeStatusType("unknown"), "info");
  assert.deepEqual(getStatusPolicy("success"), { type: "success", duration: 3000, persistent: false });
  assert.deepEqual(getStatusPolicy("info"), { type: "info", duration: 3000, persistent: false });
  assert.deepEqual(getStatusPolicy("warning"), { type: "warning", duration: 6000, persistent: false });
  assert.deepEqual(getStatusPolicy("error"), { type: "error", duration: 0, persistent: true });
});

test("preview placement centers small content and anchors oversized content", () => {
  assert.deepEqual(calculatePreviewPlacement({
    contentWidth: 300,
    contentHeight: 500,
    viewportWidth: 700,
    viewportHeight: 900
  }), { left: 200, top: 200 });
  assert.deepEqual(calculatePreviewPlacement({
    contentWidth: 900,
    contentHeight: 1200,
    viewportWidth: 700,
    viewportHeight: 900
  }), { left: 0, top: 0 });
  assert.deepEqual(calculatePreviewPlacement({
    contentWidth: 300,
    contentHeight: 1200,
    viewportWidth: 700,
    viewportHeight: 900
  }), { left: 200, top: 0 });
});

test("readErrorMessage extracts useful messages from common API error shapes", () => {
  assert.equal(readErrorMessage("plain"), "plain");
  assert.equal(readErrorMessage({ message: "top-level" }), "top-level");
  assert.equal(readErrorMessage({ error: "nested string" }), "nested string");
  assert.equal(readErrorMessage({ error: { message: "nested message" } }), "nested message");
  assert.equal(readErrorMessage(null, "fallback"), "fallback");
});

test("readNetworkErrorMessage converts fetch and abort failures to local backend guidance", () => {
  assert.match(readNetworkErrorMessage(new TypeError("Failed to fetch")), /本地后端未启动/);
  assert.match(readNetworkErrorMessage({ name: "AbortError", message: "aborted" }), /本地后端未启动/);
  assert.equal(readNetworkErrorMessage(new Error("bad request")), "bad request");
});

test("escapeHtml escapes text used in generated HTML snippets", () => {
  assert.equal(escapeHtml(`<img alt="A&B's">`), "&lt;img alt=&quot;A&amp;B&#039;s&quot;&gt;");
});

test("crc32 returns the standard checksum for byte content", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("sanitizeFilename normalizes unsafe or empty asset names", () => {
  assert.equal(sanitizeFilename(` icon: user/avatar?.png `), "icon__user_avatar_.png");
  assert.equal(sanitizeFilename("   "), "asset");
  assert.equal(sanitizeFilename(null), "asset");
  assert.equal(sanitizeFilename("a".repeat(90)), "a".repeat(80));
});

test("sanitizeHtmlAssetStem creates lowercase underscore-only HTML asset names", () => {
  assert.equal(sanitizeHtmlAssetStem("AI experience-center icon"), "ai_experience_center_icon");
  assert.equal(sanitizeHtmlAssetStem("Alibaba Cloud Logo.PNG"), "alibaba_cloud_logo");
  assert.equal(sanitizeHtmlAssetStem("Qwen3.8-Max release_完整背景_AI原图"), "qwen3_8_max_release_ai");
  assert.equal(sanitizeHtmlAssetStem("完整背景"), "asset");
  assert.equal(sanitizeHtmlAssetStem("  Alibaba__Cloud---Logo  "), "alibaba_cloud_logo");
});

test("isPointInsideRect allows a small boundary tolerance", () => {
  const rect = { left: 10, top: 20, right: 110, bottom: 220 };
  assert.equal(isPointInsideRect(8, 18, rect), true);
  assert.equal(isPointInsideRect(112, 222, rect), true);
  assert.equal(isPointInsideRect(7, 18, rect), false);
  assert.equal(isPointInsideRect(112, 223, rect), false);
});
