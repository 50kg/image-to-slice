const test = require("node:test");
const assert = require("node:assert/strict");

const {
  providerStorageKey,
  safeStorageGet,
  safeStorageRemove,
  safeStorageSet
} = require("../src/ui/api/storage");

test("providerStorageKey preserves provider config storage naming", () => {
  assert.equal(providerStorageKey("openai", "model"), "ai-ui-provider-openai-model");
});

test("safeStorage helpers read, write, and remove values through localStorage", () => {
  const calls = [];
  const storage = {
    getItem(key) {
      calls.push(["get", key]);
      return key === "saved" ? "value" : null;
    },
    setItem(key, value) {
      calls.push(["set", key, value]);
    },
    removeItem(key) {
      calls.push(["remove", key]);
    }
  };

  assert.equal(safeStorageGet("saved", { storage }), "value");
  safeStorageSet("saved", "next", { storage });
  safeStorageRemove("saved", { storage });
  assert.deepEqual(calls, [
    ["get", "saved"],
    ["set", "saved", "next"],
    ["remove", "saved"]
  ]);
});

test("safeStorage helpers ignore missing or throwing localStorage", () => {
  const throwingStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    }
  };

  assert.equal(safeStorageGet("missing", { storage: null }), null);
  assert.equal(safeStorageGet("blocked", { storage: throwingStorage }), null);
  assert.doesNotThrow(() => safeStorageSet("blocked", "value", { storage: throwingStorage }));
  assert.doesNotThrow(() => safeStorageRemove("blocked", { storage: throwingStorage }));
});
