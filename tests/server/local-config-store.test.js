const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  loadLocalConfig,
  buildLocalConfigPayload,
  saveLocalConfig
} = require("../../src/server/storage/local-config-store");

function tempConfigPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "figma-design-config-test-"));
  return path.join(dir, ".local-provider-config.json");
}

test("loadLocalConfig returns empty object when file is missing", () => {
  assert.deepEqual(loadLocalConfig(tempConfigPath()), {});
});

test("loadLocalConfig returns empty object and warns for invalid JSON", () => {
  const configFile = tempConfigPath();
  fs.writeFileSync(configFile, "{bad json");
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    assert.deepEqual(loadLocalConfig(configFile), {});
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Failed to read local provider config:/);
});

test("loadLocalConfig parses valid JSON", () => {
  const configFile = tempConfigPath();
  fs.writeFileSync(configFile, JSON.stringify({ activeProvider: "openai" }));

  assert.deepEqual(loadLocalConfig(configFile), { activeProvider: "openai" });
});

test("buildLocalConfigPayload writes the version 2 model config shape", () => {
  const now = new Date("2026-07-23T01:02:03.000Z");
  const payload = buildLocalConfigPayload({
    version: 2,
    modelConfigs: [{
      id: "config-1",
      type: "openaiCompatible",
      apiKey: "sk-test"
    }],
    taskRouting: {
      vision: "config-1",
      generation: null,
      inpaint: null
    },
    legacy: {
      activeProvider: "openai"
    }
  }, now);

  assert.deepEqual(payload, {
    version: 2,
    modelConfigs: [{
      id: "config-1",
      type: "openaiCompatible",
      apiKey: "sk-test"
    }],
    taskRouting: {
      vision: "config-1",
      generation: null,
      inpaint: null
    },
    legacy: {
      activeProvider: "openai"
    },
    updatedAt: "2026-07-23T01:02:03.000Z"
  });
});

test("saveLocalConfig writes pretty JSON with trailing newline and private mode", () => {
  const configFile = tempConfigPath();
  const now = new Date("2026-07-23T01:02:03.000Z");

  saveLocalConfig(configFile, {
    version: 2,
    modelConfigs: [{
      id: "config-1",
      type: "openaiCompatible",
      apiKey: "sk-test"
    }],
    taskRouting: {
      vision: "config-1",
      generation: null,
      inpaint: null
    },
    legacy: {
      activeProvider: "openai"
    }
  }, now);

  const source = fs.readFileSync(configFile, "utf8");
  assert.equal(source.endsWith("\n"), true);
  assert.deepEqual(JSON.parse(source), {
    version: 2,
    modelConfigs: [{
      id: "config-1",
      type: "openaiCompatible",
      apiKey: "sk-test"
    }],
    taskRouting: {
      vision: "config-1",
      generation: null,
      inpaint: null
    },
    legacy: {
      activeProvider: "openai"
    },
    updatedAt: "2026-07-23T01:02:03.000Z"
  });
  assert.equal(fs.statSync(configFile).mode & 0o777, 0o600);
});
