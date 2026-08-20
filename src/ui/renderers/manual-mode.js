function initializeManualModeUi({ setStatus, isEmbeddedHost }) {
  const workflowButtons = [...document.querySelectorAll("[data-workflow-mode]")];
  const jsonInput = document.getElementById("manualJsonInput");
  const jsonFileButton = document.getElementById("manualJsonFileButton");
  const jsonFileInput = document.getElementById("manualJsonFile");
  const formatButton = document.getElementById("manualFormatJson");
  const exampleButton = document.getElementById("manualExampleJson");
  const downloadButton = document.getElementById("manualDownloadJson");
  const backgroundInput = document.getElementById("manualBackgroundFile");
  const assetInput = document.getElementById("manualAssetFiles");
  const assetList = document.getElementById("manualAssetList");
  const assetSummary = document.getElementById("manualAssetSummary");
  const jsonSummary = document.getElementById("manualJsonSummary");
  const targetSelect = document.getElementById("manualTarget");
  const backgroundModeSelect = document.getElementById("manualBackgroundMode");
  const validation = document.getElementById("manualValidation");
  const validateButton = document.getElementById("manualValidate");
  const generateButton = document.getElementById("manualGenerate");
  const assetMap = new Map();
  let backgroundAssetName = "";
  let activeRequestId = "";
  let requestSequence = 0;

  jsonInput.value = formatManualDocument();
  updateJsonSummary();

  workflowButtons.forEach((button) => button.addEventListener("click", () => {
    setWorkflowMode(button.dataset.workflowMode || "automatic");
  }));
  jsonInput.addEventListener("input", () => {
    updateJsonSummary();
    setValidation("JSON 已修改，请重新校验。", "");
  });
  jsonFileButton.addEventListener("click", () => jsonFileInput.click());
  jsonFileInput.addEventListener("change", async () => {
    const file = jsonFileInput.files?.[0];
    jsonFileInput.value = "";
    if (!file) return;
    try {
      jsonInput.value = await file.text();
      updateJsonSummary();
      validateCurrentDocument();
    } catch (error) {
      setValidation(`读取 JSON 文件失败：${error.message || String(error)}`, "error");
    }
  });
  formatButton.addEventListener("click", () => {
    const result = parseManualJson(jsonInput.value);
    if (!result.document) {
      setValidation(result.errors.join("\n"), "error");
      return;
    }
    jsonInput.value = formatManualDocument(result.document);
    updateJsonSummary();
    showValidationResult(result.document, result.errors);
  });
  exampleButton.addEventListener("click", () => {
    jsonInput.value = formatManualDocument();
    updateJsonSummary();
    validateCurrentDocument();
  });
  downloadButton.addEventListener("click", () => {
    const result = parseManualJson(jsonInput.value);
    if (!result.document) {
      setValidation(result.errors.join("\n"), "error");
      return;
    }
    const blob = new Blob([formatManualDocument(result.document)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${String(result.document.meta?.name || "manual-design").replace(/[\\/:*?\"<>|]+/g, "_")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });
  backgroundInput.addEventListener("change", async () => {
    const file = backgroundInput.files?.[0];
    if (!file) return;
    if (backgroundAssetName && backgroundAssetName !== file.name) assetMap.delete(backgroundAssetName);
    backgroundAssetName = file.name;
    await addAssetFiles([file]);
  });
  assetInput.addEventListener("change", async () => {
    await addAssetFiles([...assetInput.files || []]);
    assetInput.value = "";
  });
  assetList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-manual-remove-asset]");
    if (!button) return;
    const name = button.dataset.manualRemoveAsset;
    assetMap.delete(name);
    if (backgroundAssetName === name) {
      backgroundAssetName = "";
      backgroundInput.value = "";
    }
    renderAssetList();
  });
  validateButton.addEventListener("click", validateCurrentDocument);
  generateButton.addEventListener("click", () => {
    if (activeRequestId) return;
    const result = validateCurrentDocument();
    if (!result) return;
    if (!isEmbeddedHost()) {
      setStatus("请在 Figma 插件环境中点击生成；当前页面只能完成 JSON 和素材校验。", "warning");
      return;
    }
    activeRequestId = `manual-import-${Date.now()}-${++requestSequence}`;
    generateButton.disabled = true;
    generateButton.textContent = "正在生成…";
    parent.postMessage({
      pluginMessage: {
        type: "create-manual-design-screen",
        requestId: activeRequestId,
        payload: {
          document: result.document,
          assetMap: Object.fromEntries(assetMap),
          target: targetSelect.value,
          backgroundMode: backgroundModeSelect.value
        }
      }
    }, "*");
  });

  async function addAssetFiles(files) {
    const supported = files.filter((file) => /^image\/(?:png|jpe?g|webp|gif)$/i.test(file.type));
    if (supported.length !== files.length) {
      setStatus("已忽略不支持的素材格式；请使用 PNG、JPG、WebP 或 GIF。", "warning");
    }
    for (const file of supported) assetMap.set(file.name, await readFileAsDataUrl(file));
    renderAssetList();
    validateCurrentDocument();
  }

  function renderAssetList() {
    assetList.replaceChildren();
    if (!assetMap.size) {
      const empty = document.createElement("span");
      empty.textContent = "上传后将按完整文件名与 JSON 的 src 匹配。";
      assetList.appendChild(empty);
    } else {
      for (const name of assetMap.keys()) {
        const row = document.createElement("div");
        row.className = "manual-asset-row";
        const label = document.createElement("span");
        label.textContent = name;
        const kind = document.createElement("em");
        kind.textContent = name === backgroundAssetName ? "背景" : "素材";
        const remove = document.createElement("button");
        remove.className = "manual-asset-remove";
        remove.type = "button";
        remove.dataset.manualRemoveAsset = name;
        remove.textContent = "删除";
        row.append(label, kind, remove);
        assetList.appendChild(row);
      }
    }
    assetSummary.textContent = assetMap.size ? `已上传 ${assetMap.size} 个` : "尚未上传";
  }

  function validateCurrentDocument() {
    const result = parseManualJson(jsonInput.value);
    showValidationResult(result.document, result.errors);
    return result.document && result.errors.length === 0 && findMissingManualAssets(result.document, assetMap).length === 0
      ? result
      : null;
  }

  function showValidationResult(documentValue, schemaErrors) {
    const errors = [...schemaErrors];
    if (documentValue && !schemaErrors.length) {
      const missing = findMissingManualAssets(documentValue, assetMap);
      if (missing.length) errors.push(`缺少素材：${missing.join("、")}。请上传与 src 同名的文件。`);
    }
    if (errors.length) {
      setValidation(errors.map((error, index) => `${index + 1}. ${error}`).join("\n"), "error");
      return false;
    }
    const count = countManualElements(documentValue.elements);
    setValidation(`校验通过：画布 ${documentValue.meta.width} × ${documentValue.meta.height}，共 ${count} 个图层。`, "success");
    return true;
  }

  function updateJsonSummary() {
    const result = parseManualJson(jsonInput.value);
    jsonSummary.textContent = result.document && !result.errors.length
      ? `${result.document.meta.width} × ${result.document.meta.height}`
      : "待校验";
  }

  function setValidation(message, type) {
    validation.textContent = message;
    validation.classList.toggle("success", type === "success");
    validation.classList.toggle("error", type === "error");
  }

  function setWorkflowMode(mode) {
    const manual = mode === "manual";
    document.body.classList.toggle("manual-mode", manual);
    workflowButtons.forEach((button) => button.classList.toggle("active", button.dataset.workflowMode === mode));
    if (manual) document.getElementById("manualModePanel").scrollTop = 0;
  }

  function handlePluginMessage(message) {
    if (!message || message.requestId !== activeRequestId) return false;
    if (message.type === "manual-import-success") {
      finishRequest();
      setValidation(`生成完成：已创建 ${Number(message.createdCount) || 0} 个可编辑图层。`, "success");
      setStatus(`“${message.frameName || "手动设计"}”已导入 Figma。`, "success");
      return true;
    }
    if (message.type === "generation-error" && message.operation === "manual-import") {
      finishRequest();
      setValidation(`生成失败：${message.message || "未知错误"}`, "error");
      setStatus(`手动导入失败：${message.message || "未知错误"}`, "error");
      return true;
    }
    return false;
  }

  function finishRequest() {
    activeRequestId = "";
    generateButton.disabled = false;
    generateButton.textContent = "生成 Figma 图层";
  }

  return {
    activateManualMode() { setWorkflowMode("manual"); },
    handlePluginMessage
  };
}

function countManualElements(elements) {
  return (elements || []).reduce((count, element) => count + 1 + countManualElements(element.children), 0);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error(`读取 ${file.name} 失败`));
    reader.readAsDataURL(file);
  });
}

if (typeof module !== "undefined") {
  module.exports = { countManualElements };
}
