async function requestUiDecompositionText(
  {
    prompt,
    imageDataUrl = ""
  },
  {
    buildVisionMessageContent,
    requestVisionChatCompletion,
    extractChatCompletionText,
    maxTokens
  },
  requestContext
) {
  const images = imageDataUrl
    ? [{
        dataUrl: imageDataUrl,
        name: "full-ui-screenshot.png"
      }]
    : [];
  const data = await requestVisionChatCompletion({
    model: requestContext.config.model,
    messages: [{
      role: "user",
      content: buildVisionMessageContent(prompt, images)
    }],
    response_format: {
      type: "json_object"
    },
    stream: true,
    max_tokens: maxTokens
  }, requestContext);
  return extractChatCompletionText(data);
}

module.exports = {
  requestUiDecompositionText
};
