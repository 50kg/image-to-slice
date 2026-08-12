function getModelConfigTestButtonState(config) {
  const results = config.testResults || {};
  const declaredResults = config.tasks.map((task) => results[task]).filter(Boolean);
  if (declaredResults.some((result) => result.status === "failed")) {
    return { text: "测试失败", tone: "failure" };
  }
  if (declaredResults.length !== config.tasks.length || declaredResults.length === 0) {
    return { text: "测试", tone: "neutral" };
  }
  if (!declaredResults.every((result) => result.status === "success")) {
    return { text: "测试", tone: "neutral" };
  }
  const inpaint = results.inpaint;
  if (config.tasks.includes("inpaint") && inpaint?.status === "success") {
    return inpaint.nativeMaskSupported
      ? { text: "支持 Mask", tone: "success" }
      : { text: "不支持 Mask", tone: "failure" };
  }
  return { text: "测试通过", tone: "success" };
}

function renderModelConfigListView({ modelConfigs = [], taskRouting = {} }) {
  if (!modelConfigs.length) {
    return '<div class="model-config-empty">还没有模型配置</div>';
  }
  const understandingConfigs = modelConfigs.filter((config) => (
    !config.tasks.includes("generation") && !config.tasks.includes("inpaint")
  ));
  const imageConfigs = modelConfigs.filter((config) => (
    config.tasks.includes("generation") || config.tasks.includes("inpaint")
  ));
  return [
    renderModelConfigGroup("图片理解", understandingConfigs, taskRouting),
    renderModelConfigGroup("图片生成 / 图片修补", imageConfigs, taskRouting)
  ].filter(Boolean).join("");
}

function renderTaskRoutingView(state) {
  const rows = [
    [
      "vision",
      "图片理解",
      "AI拆图、AI图层导入和 SVG 理解",
      "调用 POST /v1/chat/completions。模型需要支持图片输入。"
    ],
    [
      "image",
      "图片生成 / 修补",
      "文生图、透明资产、背景还原和局部修复",
      "图片生成调用 POST /v1/images/generations；图片修补调用 POST /v1/images/edits，并优先使用独立 Mask，不支持独立 Mask 时回退到语义参考图方案。"
    ]
  ];
  return rows.map(([task, label, hint, help]) => {
    const eligibleTask = task === "image" ? "generation" : task;
    const selectedConfigId = task === "image"
      && state.taskRouting?.generation === state.taskRouting?.inpaint
      ? state.taskRouting.generation
      : state.taskRouting?.[task];
    const eligibleConfigs = (state.modelConfigs || [])
      .filter((config) => config.tasks.includes(eligibleTask));
    const selectedConfig = eligibleConfigs.find((config) => config.id === selectedConfigId);
    const selectedName = selectedConfig ? getModelConfigDisplayName(selectedConfig) : "请选择配置";
    const selectedDetail = selectedConfig?.baseUrl || "尚未配置";
    const options = eligibleConfigs.length
      ? eligibleConfigs.map((config) => renderTaskRouteOption(
        task,
        config,
        selectedConfigId === config.id
      )).join("")
      : '<div class="model-route-picker-empty">暂无可用 API</div>';
    const menuId = `taskRoute${task[0].toUpperCase()}${task.slice(1)}Menu`;
    return `
      <div class="task-route-row">
        <span class="task-route-copy">
          <span class="task-route-title">
            <strong>${label}</strong>
            <button class="import-help" type="button" aria-label="说明${label}" data-import-help="${escapeModelSettingsHtml(help)}" data-import-help-placement="right">?</button>
          </span>
          <small>${hint}</small>
        </span>
        <div class="model-route-picker" data-route-picker="${task}">
          <button class="model-route-picker-trigger" type="button" data-route-picker-trigger="${task}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${menuId}">
            <span>
              <strong>${escapeModelSettingsHtml(selectedName)}</strong>
              <small>${escapeModelSettingsHtml(selectedDetail)}</small>
            </span>
            <span class="model-route-picker-chevron" aria-hidden="true">⌄</span>
          </button>
          <div id="${menuId}" class="model-route-picker-menu" role="listbox" data-route-picker-menu="${task}" hidden>
            ${options}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderTaskRouteOption(task, config, selected) {
  const configId = config.id;
  const name = getModelConfigDisplayName(config);
  const detail = config.baseUrl;
  return `
    <button class="${selected ? "selected" : ""}" type="button" role="option" aria-selected="${String(selected)}" data-route-picker-option="${task}" data-config-id="${escapeModelSettingsHtml(configId)}">
      <strong>${escapeModelSettingsHtml(name)}</strong>
      <small>${escapeModelSettingsHtml(detail)}</small>
    </button>
  `;
}

function renderModelConfigGroup(title, configs, taskRouting) {
  if (!configs.length) return "";
  return `
    <section class="model-config-group">
      <div class="model-config-group-title">${escapeModelSettingsHtml(title)}</div>
      <div class="model-config-group-list">
        ${configs.map((config) => renderModelConfigCard(config, taskRouting)).join("")}
      </div>
    </section>
  `;
}

function renderModelConfigCard(config, taskRouting) {
  const detail = `${config.baseUrl} · ${config.model} · ${config.timeoutSeconds} 秒`;
  const testState = getModelConfigTestButtonState(config);
  const activeUsage = getModelConfigActiveUsage(config.id, taskRouting);
  return `
    <article class="model-config-card${activeUsage ? " active" : ""}" data-model-config-id="${escapeModelSettingsHtml(config.id)}">
      <div class="model-config-card-main">
        <div class="model-config-card-title">${escapeModelSettingsHtml(getModelConfigDisplayName(config))}</div>
        <div class="model-config-detail">${escapeModelSettingsHtml(detail)}</div>
        ${activeUsage ? `<div class="model-config-active-use">正在用于${escapeModelSettingsHtml(activeUsage)}</div>` : ""}
      </div>
      <div class="model-config-actions">
        <button class="model-config-test ${testState.tone}" type="button" data-model-config-test="${escapeModelSettingsHtml(config.id)}">${escapeModelSettingsHtml(testState.text)}</button>
        <button type="button" data-model-config-edit="${escapeModelSettingsHtml(config.id)}">编辑</button>
      </div>
    </article>
  `;
}

function getModelConfigDisplayName(config) {
  return String(config?.name || "").trim() || "未命名 API";
}

function getModelConfigActiveUsage(configId, taskRouting = {}) {
  const usages = [];
  if (taskRouting.vision === configId) usages.push("图片理解");
  if (taskRouting.generation === configId && taskRouting.inpaint === configId) {
    usages.push("图片生成 / 修补");
  } else {
    if (taskRouting.generation === configId) usages.push("图片生成");
    if (taskRouting.inpaint === configId) usages.push("图片修补");
  }
  return usages.join("、");
}

function escapeModelSettingsHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

if (typeof module !== "undefined") {
  module.exports = {
    getModelConfigTestButtonState,
    renderModelConfigListView,
    renderTaskRoutingView
  };
}
