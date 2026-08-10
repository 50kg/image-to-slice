const {
  ALLOWED_BACKGROUND_OVERLAY_KINDS,
  MAX_BACKGROUND_CANDIDATES,
  MAX_BACKGROUND_OVERLAYS,
  MIN_BACKGROUND_SIZE,
  MIN_OVERLAY_SIZE
} = require("./constants");
const {
  buildBackgroundDecompositionPrompt,
  buildBackgroundDecompositionJsonRepairPrompt
} = require("./prompt-builder");
const {
  parseBackgroundDecompositionText
} = require("./result-parser");
const {
  parseSliceAssetDetectionText
} = require("../slice-detection");

function parseUiDecompositionText(text, dimensions) {
  return {
    ...parseSliceAssetDetectionText(text, dimensions),
    ...parseBackgroundDecompositionText(text, dimensions)
  };
}

module.exports = {
  ALLOWED_BACKGROUND_OVERLAY_KINDS,
  MAX_BACKGROUND_CANDIDATES,
  MAX_BACKGROUND_OVERLAYS,
  MIN_BACKGROUND_SIZE,
  MIN_OVERLAY_SIZE,
  buildBackgroundDecompositionPrompt,
  buildBackgroundDecompositionJsonRepairPrompt,
  parseBackgroundDecompositionText,
  parseUiDecompositionText
};
