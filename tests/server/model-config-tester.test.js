const test = require("node:test");
const assert = require("node:assert/strict");

const {
  testModelConfig
} = require("../../src/server/services/model-config-tester");

const TESTED_AT = "2026-07-30T00:00:00.000Z";

test("one test action runs every declared task and reports Mask support", async () => {
  const result = await testModelConfig({
    id: "combo",
    tasks: ["generation", "inpaint"]
  }, {
    vision: async () => assert.fail("vision is not declared"),
    generation: async () => ({ ok: true }),
    inpaint: async () => ({ ok: true, maskMode: "native-mask" }),
    now: () => new Date(TESTED_AT)
  });

  assert.deepEqual(result, {
    configId: "combo",
    results: {
      generation: { status: "success", testedAt: TESTED_AT },
      inpaint: {
        status: "success",
        maskMode: "native-mask",
        nativeMaskSupported: true,
        testedAt: TESTED_AT
      }
    }
  });
});

test("semantic inpaint is usable but reports unsupported native Mask", async () => {
  const result = await testModelConfig({ id: "compat", tasks: ["inpaint"] }, {
    inpaint: async () => ({ ok: true, maskMode: "semantic-reference-fallback" }),
    now: () => new Date(TESTED_AT)
  });

  assert.equal(result.results.inpaint.status, "success");
  assert.equal(result.results.inpaint.nativeMaskSupported, false);
});

test("a failed task keeps the original upstream message and does not stop later tests", async () => {
  const calls = [];
  const result = await testModelConfig({
    id: "mixed",
    tasks: ["vision", "generation"]
  }, {
    vision: async () => {
      calls.push("vision");
      throw new Error("OpenAI request failed: 524");
    },
    generation: async () => {
      calls.push("generation");
      return { ok: true };
    },
    now: () => new Date(TESTED_AT)
  });

  assert.deepEqual(calls, ["vision", "generation"]);
  assert.deepEqual(result.results.vision, {
    status: "failed",
    error: "OpenAI request failed: 524",
    testedAt: TESTED_AT
  });
  assert.equal(result.results.generation.status, "success");
});
