const test = require("node:test");
const assert = require("node:assert/strict");

const { getFigExportUiMode } = require("../src/ui/state/fig-export-mode");

test("embedded mode keeps direct Figma import labels", () => {
  assert.deepEqual(getFigExportUiMode(true), {
    sliceLabel: "切图导入",
    editableLabel: "导入此设计稿到 Figma",
    editableTitle: "把当前预览捕获为 Figma 可编辑图层",
    downloadsFig: false
  });
});

test("standalone mode exposes fig download labels", () => {
  assert.deepEqual(getFigExportUiMode(false), {
    sliceLabel: "下载切图 .fig",
    editableLabel: "下载设计稿 .fig",
    editableTitle: "捕获当前预览并下载可导入 Figma 的 .fig 文件",
    downloadsFig: true
  });
});

