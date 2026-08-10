const test = require("node:test");
const assert = require("node:assert/strict");

const {
  requestUiDecompositionText
} = require("../../src/server/services/ui-decomposition-request");

test("AI decomposition uses the shared streaming vision request for analysis and JSON repair", async () => {
  const calls = [];
  const context = {
    config: {
      model: "vision-model"
    }
  };
  const dependencies = {
    buildVisionMessageContent: (prompt, images) => ({ prompt, images }),
    requestVisionChatCompletion: async (request, requestContext) => {
      calls.push({ request, requestContext });
      return {
        choices: [{
          message: {
            content: calls.length === 1 ? "{\"backgrounds\":[]}" : "{\"assets\":[]}"
          }
        }]
      };
    },
    extractChatCompletionText: (data) => data.choices[0].message.content,
    maxTokens: 8192
  };

  const analysis = await requestUiDecompositionText({
    prompt: "analyze",
    imageDataUrl: "data:image/png;base64,SOURCE"
  }, dependencies, context);
  const repair = await requestUiDecompositionText({
    prompt: "repair",
    imageDataUrl: ""
  }, dependencies, context);

  assert.equal(analysis, "{\"backgrounds\":[]}");
  assert.equal(repair, "{\"assets\":[]}");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].request.stream, true);
  assert.equal(calls[1].request.stream, true);
  assert.deepEqual(calls[0].request.response_format, {
    type: "json_object"
  });
  assert.deepEqual(calls[0].request.messages[0].content.images, [{
    dataUrl: "data:image/png;base64,SOURCE",
    name: "full-ui-screenshot.png"
  }]);
  assert.deepEqual(calls[1].request.messages[0].content.images, []);
  assert.equal(calls[0].requestContext, context);
  assert.equal(calls[1].requestContext, context);
});
