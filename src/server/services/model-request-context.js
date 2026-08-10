const {
  createProviderHttpClient
} = require("../providers/provider-http-client");

function createModelRequestContext(snapshot, dependencies = {}) {
  const config = Object.freeze({ ...snapshot });
  const client = createProviderHttpClient({
    fetchImpl: dependencies.fetchImpl,
    createAbortError: dependencies.createAbortError,
    getRequestSignal: dependencies.getRequestSignal,
    config
  });
  return {
    config,
    callJson: client.callOpenAIJson,
    callForm: client.callOpenAIForm,
    callStream: client.callOpenAIStream
  };
}

module.exports = {
  createModelRequestContext
};
