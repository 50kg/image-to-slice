const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeVectorSvg
} = require("../src/ui/services/svg-utils");

test("normalizeVectorSvg replaces size and viewBox on the opening svg tag", () => {
  const result = normalizeVectorSvg('<svg width="10" height="20" viewBox="0 0 1 2"><path /></svg>', 100, 200);

  assert.equal(result, '<svg width="100" height="200" viewBox="0 0 100 200"><path /></svg>');
});

test("normalizeVectorSvg preserves other svg attributes", () => {
  const result = normalizeVectorSvg('<svg xmlns="http://www.w3.org/2000/svg" fill="none"><path /></svg>', 12, 34);

  assert.equal(result, '<svg width="12" height="34" viewBox="0 0 12 34" xmlns="http://www.w3.org/2000/svg" fill="none"><path /></svg>');
});

test("normalizeVectorSvg rejects missing svg tags", () => {
  assert.throws(() => normalizeVectorSvg("<path />", 1, 1), /SVG/);
});
