const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isTransparentBackgroundUnsupportedError,
  requestWithTransparentBackgroundFallback
} = require("../../src/server/services/transparent-image-request");

test("transparent background fallback is limited to explicit provider compatibility errors", () => {
  assert.equal(isTransparentBackgroundUnsupportedError(Object.assign(
    new Error("Transparent background is not supported for this model."),
    { statusCode: 400 }
  )), true);
  assert.equal(isTransparentBackgroundUnsupportedError(Object.assign(
    new Error("Unsupported value: 'transparent' for background"),
    { statusCode: 422 }
  )), true);
  assert.equal(isTransparentBackgroundUnsupportedError(Object.assign(
    new Error("invalid API key"),
    { statusCode: 401 }
  )), false);
  assert.equal(isTransparentBackgroundUnsupportedError(Object.assign(
    new Error("OpenAI request failed: 524"),
    { statusCode: 524 }
  )), false);
});

test("transparent image request retries once without the background option", async () => {
  const calls = [];
  const result = await requestWithTransparentBackgroundFallback({
    createRequest: (transparent) => ({ transparent }),
    callRequest: async (request) => {
      calls.push(request);
      if (request.transparent) {
        throw Object.assign(
          new Error("Transparent background is not supported for this model."),
          { statusCode: 400 }
        );
      }
      return { images: [{ dataUrl: "opaque-result" }] };
    }
  });

  assert.deepEqual(calls, [{ transparent: true }, { transparent: false }]);
  assert.deepEqual(result, {
    data: { images: [{ dataUrl: "opaque-result" }] },
    usedFallback: true
  });
});

test("transparent image request preserves unrelated provider errors", async () => {
  let calls = 0;
  await assert.rejects(
    () => requestWithTransparentBackgroundFallback({
      createRequest: (transparent) => ({ transparent }),
      callRequest: async () => {
        calls += 1;
        throw Object.assign(new Error("rate limited"), { statusCode: 429 });
      }
    }),
    (error) => error.message === "rate limited" && error.statusCode === 429
  );
  assert.equal(calls, 1);
});
