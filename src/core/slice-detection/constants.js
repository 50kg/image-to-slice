const ALLOWED_SLICE_ASSET_KINDS = new Set([
  "icon",
  "avatar",
  "illustration",
  "photo",
  "product-image",
  "complex-decoration",
  "complex-chart",
  "logo"
]);

const MIN_SLICE_ASSET_SIZE = 8;

module.exports = {
  ALLOWED_SLICE_ASSET_KINDS,
  MIN_SLICE_ASSET_SIZE
};
