const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SAMPLE_MANUAL_DOCUMENT,
  collectManualAssetNames,
  findMissingManualAssets,
  formatManualDocument,
  parseManualJson,
  validateManualDocument
} = require("../src/ui/services/manual-mode");

test("manual mode sample is valid and formatted JSON can be parsed", () => {
  const result = parseManualJson(formatManualDocument());
  assert.deepEqual(result.errors, []);
  assert.equal(result.document.meta.width, 1080);
  assert.equal(result.document.elements[2].type, "group");
});

test("manual mode reports JSON syntax and precise schema paths", () => {
  assert.match(parseManualJson("{").errors[0], /JSON 语法错误/);
  assert.deepEqual(validateManualDocument({ elements: [{ type: "text" }] }), [
    "缺少 meta 根字段。",
    "elements[0].x 必须是数字。",
    "elements[0].y 必须是数字。",
    "elements[0].width 必须是大于 0 的数字。",
    "elements[0].height 必须是大于 0 的数字。",
    "elements[0].text 缺失。"
  ]);
});

test("manual mode validates nested container children", () => {
  const document = structuredClone(SAMPLE_MANUAL_DOCUMENT);
  document.elements[2].children[0].width = 0;
  assert.deepEqual(validateManualDocument(document), [
    "elements[2].children[0].width 必须是大于 0 的数字。"
  ]);
});

test("manual mode collects referenced assets and identifies missing files", () => {
  assert.deepEqual(collectManualAssetNames(SAMPLE_MANUAL_DOCUMENT), ["background.png", "person.png"]);
  assert.deepEqual(findMissingManualAssets(SAMPLE_MANUAL_DOCUMENT, new Map([["background.png", "data:image/png;base64,AA=="]])), [
    "person.png"
  ]);
});
