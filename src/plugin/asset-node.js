const {
  normalizeImageScaleMode,
  dataUrlToBytes
} = require("./image-data");
const { applyCornerRadius } = require("./paint");

async function createImageRectangle({ figmaApi, name, imageDataUrl, width, height, scaleMode, atob }) {
  const bytes = dataUrlToBytes(imageDataUrl, {
    base64Decode: figmaApi.base64Decode,
    atob
  });
  const image = figmaApi.createImage(bytes);
  const rectangle = figmaApi.createRectangle();
  rectangle.name = name;
  rectangle.resize(width, height);
  rectangle.fills = [
    {
      type: "IMAGE",
      scaleMode: normalizeImageScaleMode(scaleMode),
      imageHash: image.hash
    }
  ];
  return rectangle;
}

async function createAssetNode({ figmaApi, notifyRecoverableError, asset, atob }) {
  if (asset.svgData) {
    try {
      const svgNode = createSvgAssetNode({
        figmaApi,
        name: asset.name,
        svgData: asset.svgData,
        width: asset.placement.width,
        height: asset.placement.height
      });
      applyAssetCornerRadius(svgNode, asset, notifyRecoverableError);
      return svgNode;
    } catch (error) {
      notifyRecoverableError("SVG 回填失败，已回退 PNG", error);
    }
  }

  const imageNode = await createImageRectangle({
    figmaApi,
    atob,
    name: asset.name,
    imageDataUrl: asset.dataUrl,
    width: asset.placement.width,
    height: asset.placement.height
  });
  applyAssetCornerRadius(imageNode, asset, notifyRecoverableError);
  return imageNode;
}

function applyAssetCornerRadius(node, asset, notifyRecoverableError) {
  const hasRadii = asset.radii && typeof asset.radii === "object";
  if (!node || (!hasRadii && (asset.radius === undefined || asset.radius === null))) {
    return;
  }
  try {
    applyCornerRadius(node, hasRadii ? { radii: asset.radii } : { radius: asset.radius });
  } catch (error) {
    notifyRecoverableError(`切图圆角应用失败：${asset.name || "asset"}`, error);
  }
}

function createSvgAssetNode({ figmaApi, name, svgData, width, height }) {
  if (typeof figmaApi.createNodeFromSvg !== "function") {
    throw new Error("当前 Figma 环境不支持创建 SVG 节点");
  }
  const node = figmaApi.createNodeFromSvg(svgData);
  node.name = name;
  node.resize(width, height);
  return node;
}

module.exports = {
  createImageRectangle,
  createAssetNode,
  applyAssetCornerRadius,
  createSvgAssetNode
};
