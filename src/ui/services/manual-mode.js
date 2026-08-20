const MANUAL_ELEMENT_TYPES = new Set(["text", "rectangle", "image", "group", "container", "frame"]);

const SAMPLE_MANUAL_DOCUMENT = {
  version: "1.0",
  meta: {
    name: "手动导入示例",
    width: 1080,
    height: 1440
  },
  background: {
    type: "image",
    src: "background.png"
  },
  assets: ["background.png", "person.png"],
  elements: [
    {
      id: "title",
      type: "text",
      name: "主标题",
      text: "手动 JSON 模式",
      x: 72,
      y: 80,
      width: 720,
      height: 76,
      style: {
        fontSize: 52,
        fontWeight: 700,
        lineHeight: 68,
        color: "#FFFFFF",
        textAlign: "left"
      }
    },
    {
      id: "person",
      type: "image",
      name: "人物素材",
      src: "person.png",
      x: 650,
      y: 260,
      width: 330,
      height: 620,
      fit: "fit"
    },
    {
      id: "button",
      type: "group",
      name: "报名按钮",
      x: 72,
      y: 1220,
      width: 280,
      height: 80,
      children: [
        {
          id: "button-bg",
          type: "rectangle",
          name: "按钮背景",
          x: 0,
          y: 0,
          width: 280,
          height: 80,
          style: { fill: "#2D8CFF", cornerRadius: 18 }
        },
        {
          id: "button-label",
          type: "text",
          name: "按钮文字",
          text: "立即报名",
          x: 42,
          y: 22,
          width: 196,
          height: 38,
          style: { fontSize: 28, fontWeight: 600, color: "#FFFFFF", textAlign: "center" }
        }
      ]
    }
  ]
};

function formatManualDocument(document = SAMPLE_MANUAL_DOCUMENT) {
  return JSON.stringify(document, null, 2);
}

function parseManualJson(text) {
  const source = String(text || "").trim();
  if (!source) {
    return { document: null, errors: ["JSON 内容不能为空。"] };
  }
  try {
    const document = JSON.parse(source);
    return { document, errors: validateManualDocument(document) };
  } catch (error) {
    return { document: null, errors: [`JSON 语法错误：${error.message || String(error)}`] };
  }
}

function validateManualDocument(document) {
  const errors = [];
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return ["根节点必须是一个 JSON 对象。"];
  }
  if (!document.meta || typeof document.meta !== "object") {
    errors.push("缺少 meta 根字段。");
  } else {
    validatePositiveNumber(document.meta.width, "meta.width", errors);
    validatePositiveNumber(document.meta.height, "meta.height", errors);
  }
  if (!Array.isArray(document.elements)) {
    errors.push("elements 必须是数组。");
  } else {
    document.elements.forEach((element, index) => validateManualElement(element, `elements[${index}]`, errors));
  }
  if (document.background !== undefined && (!document.background || typeof document.background !== "object" || Array.isArray(document.background))) {
    errors.push("background 必须是对象。");
  }
  if (document.background?.type === "image" && !normalizeAssetName(document.background.src)) {
    errors.push("background.src：图片背景必须指定素材文件名。");
  }
  if (document.assets !== undefined && !Array.isArray(document.assets)) {
    errors.push("assets 必须是文件名数组。");
  }
  return errors;
}

function validateManualElement(element, path, errors) {
  if (!element || typeof element !== "object" || Array.isArray(element)) {
    errors.push(`${path} 必须是对象。`);
    return;
  }
  const type = String(element.type || "").toLowerCase();
  if (!type) errors.push(`${path}.type 缺失。`);
  else if (!MANUAL_ELEMENT_TYPES.has(type)) errors.push(`${path}.type 不支持“${element.type}”。`);
  ["x", "y"].forEach((field) => validateFiniteNumber(element[field], `${path}.${field}`, errors));
  ["width", "height"].forEach((field) => validatePositiveNumber(element[field], `${path}.${field}`, errors));
  if (type === "text" && element.text === undefined) errors.push(`${path}.text 缺失。`);
  if (type === "image" && !normalizeAssetName(element.src)) errors.push(`${path}.src 缺失。`);
  if (["group", "container", "frame"].includes(type)) {
    if (!Array.isArray(element.children)) errors.push(`${path}.children 必须是数组。`);
    else element.children.forEach((child, index) => validateManualElement(child, `${path}.children[${index}]`, errors));
  }
}

function validateFiniteNumber(value, path, errors) {
  if (!Number.isFinite(Number(value))) errors.push(`${path} 必须是数字。`);
}

function validatePositiveNumber(value, path, errors) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) errors.push(`${path} 必须是大于 0 的数字。`);
}

function collectManualAssetNames(document) {
  const names = new Set();
  const add = (value) => {
    const name = normalizeAssetName(value);
    if (name) names.add(name);
  };
  if (document?.background?.type === "image") add(document.background.src);
  const visit = (elements) => (elements || []).forEach((element) => {
    if (String(element?.type || "").toLowerCase() === "image") add(element.src);
    if (Array.isArray(element?.children)) visit(element.children);
  });
  visit(document?.elements);
  return [...names];
}

function findMissingManualAssets(document, assetMap) {
  const available = assetMap instanceof Map ? assetMap : new Map(Object.entries(assetMap || {}));
  return collectManualAssetNames(document).filter((name) => !available.has(name));
}

function normalizeAssetName(value) {
  return String(value || "").trim().replace(/^.*[\\/]/, "");
}

if (typeof module !== "undefined") {
  module.exports = {
    MANUAL_ELEMENT_TYPES,
    SAMPLE_MANUAL_DOCUMENT,
    collectManualAssetNames,
    findMissingManualAssets,
    formatManualDocument,
    normalizeAssetName,
    parseManualJson,
    validateManualDocument
  };
}
