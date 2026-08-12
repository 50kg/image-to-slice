function normalizeSliceAssetName(value) {
  const normalized = String(value || "")
    .replace(/\.(?:png|jpe?g|webp|gif|svg|avif)$/i, "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64)
    .replace(/_+$/g, "");
  return /[a-z]/.test(normalized) ? normalized : "";
}

function reserveSliceAssetName(value, usedNames) {
  const used = usedNames instanceof Set ? usedNames : new Set();
  const normalized = normalizeSliceAssetName(value);
  if (!normalized) {
    let index = 1;
    let fallback = "";
    do {
      fallback = `slice_${String(index).padStart(2, "0")}`;
      index += 1;
    } while (used.has(fallback));
    used.add(fallback);
    return fallback;
  }
  let name = normalized;
  let suffix = 2;
  while (used.has(name)) {
    name = `${normalized}_${suffix}`;
    suffix += 1;
  }
  used.add(name);
  return name;
}

function normalizeSliceAssetNames(assets) {
  const used = new Set();
  let changed = false;
  for (const asset of Array.isArray(assets) ? assets : []) {
    const name = reserveSliceAssetName(asset?.name, used);
    if (asset && asset.name !== name) {
      asset.name = name;
      changed = true;
    }
  }
  return changed;
}

if (typeof module !== "undefined") {
  module.exports = {
    normalizeSliceAssetName,
    normalizeSliceAssetNames,
    reserveSliceAssetName
  };
}
