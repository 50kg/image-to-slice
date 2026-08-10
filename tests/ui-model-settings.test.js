const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getModelConfigTestButtonState,
  renderModelConfigListView,
  renderTaskRoutingView
} = require("../src/ui/renderers/model-settings");

function fixture(overrides = {}) {
  return {
    id: "config-a",
    name: "官方 OpenAI · 精确补图",
    baseUrl: "https://api.example.com",
    model: "gpt-image-2",
    timeoutSeconds: 300,
    tasks: ["generation", "inpaint"],
    testResults: {},
    hasApiKey: true,
    ...overrides
  };
}

test("test button distinguishes success, failure, and native Mask support", () => {
  assert.deepEqual(getModelConfigTestButtonState(fixture({
    tasks: ["vision"],
    testResults: { vision: { status: "success" } }
  })), { text: "测试通过", tone: "success" });
  assert.deepEqual(getModelConfigTestButtonState(fixture({
    tasks: ["generation", "inpaint"],
    testResults: {
      generation: { status: "failed" },
      inpaint: { status: "success" }
    }
  })), { text: "测试失败", tone: "failure" });
  assert.deepEqual(getModelConfigTestButtonState(fixture({
    testResults: {
      generation: { status: "success" },
      inpaint: { status: "success", nativeMaskSupported: true }
    }
  })), { text: "支持 Mask", tone: "success" });
});

test("config cards escape dynamic values and expose one unified test action", () => {
  const html = renderModelConfigListView({
    modelConfigs: [fixture({
      name: "<script>alert(1)</script>",
      baseUrl: "https://example.test/?x=<bad>",
      model: "model<&"
    })]
  });

  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.equal((html.match(/data-model-config-test=/g) || []).length, 1);
  assert.match(html, /data-model-config-test="config-a"[^>]*>测试<\/button>/);
  assert.doesNotMatch(html, /data-model-config-duplicate|>复制</);
  assert.doesNotMatch(html, /model-config-tag|model-config-tags/);
  assert.match(html, />编辑</);
});

test("empty API remarks use a display-only fallback", () => {
  const html = renderModelConfigListView({
    modelConfigs: [fixture({ name: "" })]
  });

  assert.match(html, />未命名 API</);
});

test("config cards group understanding separately from generation and repair", () => {
  const html = renderModelConfigListView({
    modelConfigs: [
      fixture({ id: "vision", name: "理解 A", tasks: ["vision"] }),
      fixture({ id: "image", name: "图片 A", tasks: ["generation", "inpaint"] })
    ]
  });

  assert.match(html, /图片理解[\s\S]*理解 A/);
  assert.match(html, /图片生成 \/ 图片修补[\s\S]*图片 A/);
  assert.ok(html.indexOf("理解 A") < html.indexOf("图片 A"));
});

test("task routing renders only eligible configs", () => {
  const html = renderTaskRoutingView({
    modelConfigs: [
      fixture({ id: "vision", name: "理解 A", tasks: ["vision"] }),
      fixture({ id: "image", name: "生成 A", tasks: ["generation", "inpaint"] })
    ],
    taskRouting: { vision: "vision", generation: "image", inpaint: null }
  });

  assert.match(html, /data-route-picker="vision"[\s\S]*理解 A/);
  assert.doesNotMatch(
    html.match(/data-route-picker="vision"[\s\S]*?<\/div>\s*<\/div>/)?.[0] || "",
    /生成 A/
  );
  assert.match(html, /图片理解[\s\S]*data-route-picker="vision"/);
  assert.match(html, /图片生成 \/ 修补[\s\S]*data-route-picker="image"/);
  assert.equal((html.match(/data-route-picker-trigger=/g) || []).length, 2);
  assert.match(
    html,
    /class="model-route-picker-trigger"[^>]*data-route-picker-trigger="vision"/
  );
  assert.match(
    html,
    /class="model-route-picker-trigger"[^>]*data-route-picker-trigger="image"/
  );
  assert.doesNotMatch(html, /model-route-picker-trigger selected/);
  assert.match(
    html,
    /class="selected"[^>]*aria-selected="true"[^>]*data-route-picker-option="vision"/
  );
  assert.equal((html.match(/data-import-help-placement="right"/g) || []).length, 2);
  assert.match(html, /role="listbox"[\s\S]*data-route-picker-option="vision"/);
  assert.match(html, /理解 A[\s\S]*https:\/\/api\.example\.com/);
  assert.match(html, /\/v1\/chat\/completions/);
  assert.match(html, /\/v1\/images\/generations/);
  assert.match(html, /\/v1\/images\/edits/);
  assert.match(html, /不支持独立 Mask 时回退/);
});

test("routed configs are highlighted and identify their active purpose", () => {
  const html = renderModelConfigListView({
    modelConfigs: [
      fixture({ id: "vision", name: "理解 A", tasks: ["vision"] }),
      fixture({ id: "image", name: "图片 A", tasks: ["generation", "inpaint"] })
    ],
    taskRouting: { vision: "vision", generation: "image", inpaint: "image" }
  });

  assert.match(html, /model-config-card active[\s\S]*理解 A[\s\S]*正在用于图片理解/);
  assert.match(html, /model-config-card active[\s\S]*图片 A[\s\S]*正在用于图片生成 \/ 修补/);
});
