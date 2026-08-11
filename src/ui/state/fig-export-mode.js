function getFigExportUiMode(embedded) {
  if (embedded) {
    return {
      sliceLabel: "切图导入",
      editableLabel: "导入此设计稿到 Figma",
      editableTitle: "把当前预览捕获为 Figma 可编辑图层",
      downloadsFig: false
    };
  }
  return {
    sliceLabel: "下载切图 .fig",
    editableLabel: "下载设计稿 .fig",
    editableTitle: "捕获当前预览并下载可导入 Figma 的 .fig 文件",
    downloadsFig: true
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    getFigExportUiMode
  };
}

