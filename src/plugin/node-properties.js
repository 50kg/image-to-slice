const { clampNumber } = require("./ui-window-state");

function applyBaseNodeProperties(node, definition) {
  node.name = definition.name || definition.type || "editable_node";
  node.x = clampNumber(Number(definition.x), -100000, 100000, 0);
  node.y = clampNumber(Number(definition.y), -100000, 100000, 0);
  node.resize(
    Math.max(1, clampNumber(Number(definition.width), 1, 100000, 100)),
    Math.max(1, clampNumber(Number(definition.height), 1, 100000, 40))
  );
}

module.exports = {
  applyBaseNodeProperties
};
