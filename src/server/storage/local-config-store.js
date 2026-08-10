const fs = require("fs");

function loadLocalConfig(configFile) {
  try {
    if (!fs.existsSync(configFile)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch (error) {
    console.warn(`Failed to read local provider config: ${error.message}`);
    return {};
  }
}

function buildLocalConfigPayload(state, now = new Date()) {
  return {
    version: 2,
    modelConfigs: state.modelConfigs,
    taskRouting: state.taskRouting,
    legacy: state.legacy,
    updatedAt: now.toISOString()
  };
}

function saveLocalConfig(configFile, state, now = new Date()) {
  const payload = buildLocalConfigPayload(state, now);
  fs.writeFileSync(configFile, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

module.exports = {
  loadLocalConfig,
  buildLocalConfigPayload,
  saveLocalConfig
};
