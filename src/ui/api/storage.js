function getStorage(options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, "storage")) {
    return options.storage;
  }
  return window.localStorage;
}

function safeStorageGet(key, options = {}) {
  try {
    const storage = getStorage(options);
    return storage ? storage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeStorageSet(key, value, options = {}) {
  try {
    const storage = getStorage(options);
    if (storage) {
      storage.setItem(key, value);
    }
  } catch {
    // Ignore storage failures in embedded/plugin contexts.
  }
}

function safeStorageRemove(key, options = {}) {
  try {
    const storage = getStorage(options);
    if (storage) {
      storage.removeItem(key);
    }
  } catch {
    // Ignore storage failures in embedded/plugin contexts.
  }
}

function providerStorageKey(provider, field) {
  return `ai-ui-provider-${provider}-${field}`;
}

if (typeof module !== "undefined") {
  module.exports = {
    providerStorageKey,
    safeStorageGet,
    safeStorageRemove,
    safeStorageSet
  };
}
