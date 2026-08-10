function findEmptyImportPosition(existingNodes, viewportCenter, width, height) {
  const visibleNodes = existingNodes.filter((node) => node.visible !== false);
  if (visibleNodes.length === 0) {
    return {
      x: Math.round(viewportCenter.x - width / 2),
      y: Math.round(viewportCenter.y - height / 2)
    };
  }

  const rightEdge = visibleNodes.reduce((maximum, node) => {
    const bounds = node.absoluteBoundingBox;
    const nodeRight = bounds
      ? bounds.x + bounds.width
      : Number(node.x || 0) + Number(node.width || 0);
    return Math.max(maximum, nodeRight);
  }, -Infinity);

  return {
    x: Math.ceil(rightEdge + 96),
    y: Math.round(viewportCenter.y - height / 2)
  };
}

module.exports = {
  findEmptyImportPosition
};
