function isTransparentBackgroundUnsupportedError(error) {
  if (![400, 422].includes(Number(error?.statusCode))) return false;
  const message = String(error?.message || "");
  const mentionsTransparentBackground = /transparent(?:\s+background)?|background[^\n]*transparent/i.test(message);
  const indicatesUnsupportedValue = /not supported|unsupported|invalid (?:value|parameter)|unknown parameter/i.test(message);
  return mentionsTransparentBackground && indicatesUnsupportedValue;
}

async function requestWithTransparentBackgroundFallback({ createRequest, callRequest }) {
  try {
    return {
      data: await callRequest(createRequest(true)),
      usedFallback: false
    };
  } catch (error) {
    if (!isTransparentBackgroundUnsupportedError(error)) throw error;
    return {
      data: await callRequest(createRequest(false)),
      usedFallback: true
    };
  }
}

module.exports = {
  isTransparentBackgroundUnsupportedError,
  requestWithTransparentBackgroundFallback
};
