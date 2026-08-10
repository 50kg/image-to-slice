const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyBaseNodeProperties
} = require("../../src/plugin/node-properties");

test("applyBaseNodeProperties preserves legacy name, position, and size rules", () => {
  const resizeCalls = [];
  const node = {
    resize(width, height) {
      resizeCalls.push([width, height]);
    }
  };

  applyBaseNodeProperties(node, {
    type: "text",
    x: 1000000,
    y: -1000000,
    width: "123.6",
    height: "bad"
  });

  assert.equal(node.name, "text");
  assert.equal(node.x, 100000);
  assert.equal(node.y, -100000);
  assert.deepEqual(resizeCalls, [[124, 40]]);
});
