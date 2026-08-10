const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findEmptyImportPosition
} = require("../../src/plugin/import-position");

test("findEmptyImportPosition centers import when no visible nodes exist", () => {
  assert.deepEqual(findEmptyImportPosition([], { x: 500, y: 300 }, 200, 100), {
    x: 400,
    y: 250
  });
});

test("findEmptyImportPosition places import after visible node right edge", () => {
  assert.deepEqual(findEmptyImportPosition([
    { visible: false, absoluteBoundingBox: { x: 1000, y: 0, width: 1000, height: 100 } },
    { absoluteBoundingBox: { x: 10, y: 0, width: 100, height: 100 } },
    { x: 300.2, width: 49.4 }
  ], { x: 500, y: 300 }, 200, 100), {
    x: 446,
    y: 250
  });
});
