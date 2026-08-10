const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildReferenceAssetCorrectionCss,
  chooseReferenceAssetOwnerCandidate,
  createEditableAssetDescriptors,
  createEditablePreviewContextSignature,
  createReferenceAssetLocalGeometry,
  createReferenceAssetGeometryCorrections,
  dehydrateCanonicalAssetHtml,
  hydrateCanonicalAssetHtml,
  selectCanonicalReferenceAssets
} = require("../src/ui/services/editable-reference-assets");

test("descriptor projection keeps geometry and removes image bytes", () => {
  const descriptors = createEditableAssetDescriptors([{
    id: "logo",
    name: "Logo",
    kind: "logo",
    type: "image",
    dataUrl: "data:image/png;base64,AAA",
    radius: 6,
    placement: { x: 10, y: 20, width: 30, height: 40 }
  }]);

  assert.deepEqual(descriptors, [{
    id: "logo",
    name: "Logo",
    kind: "logo",
    type: "image",
    radius: 6,
    placement: { x: 10, y: 20, width: 30, height: 40 }
  }]);
  assert.equal(JSON.stringify(descriptors).includes("base64"), false);
});

test("descriptor projection rejects empty and duplicate IDs", () => {
  assert.throws(
    () => createEditableAssetDescriptors([{ id: "", placement: {} }]),
    /切图资产 ID 不能为空/
  );
  assert.throws(
    () => createEditableAssetDescriptors([
      { id: "logo", placement: {} },
      { id: "logo", placement: {} }
    ]),
    /切图资产 ID 重复：logo/
  );
});

test("canonical hydration resolves every local asset and reports missing IDs", () => {
  const canonical = '<img data-reference-asset="logo" src="asset:logo">';
  assert.match(
    hydrateCanonicalAssetHtml(canonical, [{
      id: "logo",
      dataUrl: "data:image/png;base64,AAA"
    }]),
    /data:image\/png;base64,AAA/
  );
  assert.throws(
    () => hydrateCanonicalAssetHtml(canonical, []),
    /无法读取切图资产：logo/
  );
});

test("stale canonical preview ignores assets added after recognition", () => {
  const canonical = [
    '<img data-reference-asset="existing" src="asset:existing">',
    '<div class="generated-copy">cached layout</div>'
  ].join("");
  const assets = [
    { id: "existing", dataUrl: "data:image/png;base64,EXISTING" },
    { id: "added-later", dataUrl: "data:image/png;base64,ADDED" }
  ];

  assert.deepEqual(
    selectCanonicalReferenceAssets(canonical, assets).map((asset) => asset.id),
    ["existing"]
  );
  assert.doesNotThrow(() =>
    hydrateCanonicalAssetHtml(
      canonical,
      selectCanonicalReferenceAssets(canonical, assets)
    )
  );
});

test("descriptor projection and hydration preserve all 60 assets", () => {
  const localAssets = Array.from({ length: 60 }, (_, index) => ({
    id: `asset_${index}`,
    name: `Asset ${index}`,
    kind: "image",
    type: "image",
    dataUrl: `data:image/png;base64,ASSET_${index}`,
    radius: index % 8,
    placement: { x: index, y: index + 1, width: 20, height: 20 }
  }));
  const descriptors = createEditableAssetDescriptors(localAssets);
  const canonicalHtml = descriptors
    .map((asset) => `<img data-reference-asset="${asset.id}" src="asset:${asset.id}">`)
    .join("");
  const hydrated = hydrateCanonicalAssetHtml(canonicalHtml, localAssets);

  assert.equal(descriptors.length, 60);
  assert.equal((hydrated.match(/data:image\/png;base64,/g) || []).length, 60);
});

test("preview context signature changes for every reconstruction input", () => {
  const base = {
    sourceImageDataUrl: "data:image/png;base64,SOURCE_A",
    width: 320,
    height: 640,
    prompt: "trace",
    provider: "thirdParty",
    model: "vision-model",
    assets: [{
      id: "logo",
      name: "Logo",
      kind: "logo",
      type: "image",
      dataUrl: "data:image/png;base64,ASSET_A",
      radius: 4,
      placement: { x: 10, y: 20, width: 30, height: 40 }
    }]
  };
  const baseSignature = createEditablePreviewContextSignature(base);
  assert.equal(
    createEditablePreviewContextSignature(structuredClone(base)),
    baseSignature
  );

  const mutations = [
    (value) => { value.sourceImageDataUrl += "_B"; },
    (value) => { value.width += 1; },
    (value) => { value.height += 1; },
    (value) => { value.prompt += " changed"; },
    (value) => { value.provider = "openai"; },
    (value) => { value.model += "-next"; },
    (value) => { value.assets[0].dataUrl += "_B"; },
    (value) => { value.assets[0].placement.x += 1; },
    (value) => { value.assets[0].placement.y += 1; },
    (value) => { value.assets[0].placement.width += 1; },
    (value) => { value.assets[0].placement.height += 1; },
    (value) => { value.assets[0].radius += 1; }
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(base);
    mutate(changed);
    assert.notEqual(createEditablePreviewContextSignature(changed), baseSignature);
  }
});

test("canonical preview dehydration restores asset references without cached image bytes", () => {
  const html = '<img class="banner" data-reference-asset="slice-1" src="data:image/png;base64,SECRET"><span>保留文字</span>';
  const canonical = dehydrateCanonicalAssetHtml(html);

  assert.equal(canonical, '<img class="banner" data-reference-asset="slice-1" src="asset:slice-1"><span>保留文字</span>');
  assert.equal(canonical.includes("base64"), false);
});

test("nested asset geometry corrections use final screen-relative bounds", () => {
  const corrections = createReferenceAssetGeometryCorrections([{
    id: "icon",
    radius: 6,
    placement: { x: 120, y: 216, width: 80, height: 80 }
  }], [{
    id: "icon",
    x: 147,
    y: 212,
    width: 76,
    height: 78
  }], 0.5);

  assert.deepEqual(corrections, [{
    id: "icon",
    width: 80,
    height: 80,
    radius: 6,
    translateX: -27,
    translateY: 4,
    corrected: true
  }]);
});

test("asset geometry within tolerance produces no visual translation", () => {
  const corrections = createReferenceAssetGeometryCorrections([{
    id: "icon",
    radius: 0,
    placement: { x: 10, y: 20, width: 30, height: 40 }
  }], [{
    id: "icon",
    x: 10.2,
    y: 19.8,
    width: 30.1,
    height: 39.9
  }], 0.5);

  assert.equal(corrections[0].translateX, 0);
  assert.equal(corrections[0].translateY, 0);
  assert.equal(corrections[0].corrected, false);
});

test("asset correction CSS keeps DOM nesting and applies deterministic overrides", () => {
  const css = buildReferenceAssetCorrectionCss([{
    id: 'icon"unsafe',
    width: 80,
    height: 80,
    radius: 6,
    translateX: -27,
    translateY: 4,
    corrected: true
  }]);

  assert.match(css, /data-reference-asset="icon\\"unsafe"/);
  assert.match(css, /width:80px!important/);
  assert.match(css, /height:80px!important/);
  assert.match(css, /border-radius:6px!important/);
  assert.match(css, /translate\(-27px,4px\)!important/);
  assert.doesNotMatch(css, /left:|top:/);
});

test("owner selection chooses the smallest reliable component around an asset", () => {
  const assetRect = { x: 184, y: 1241, width: 185, height: 168 };
  const nav = {
    element: "nav",
    rect: { x: 67, y: 1172, width: 1594, height: 427 },
    depth: 1
  };
  const item = {
    element: "feature-item-one",
    rect: { x: 111, y: 1172, width: 330, height: 427 },
    depth: 2
  };

  assert.equal(
    chooseReferenceAssetOwnerCandidate(assetRect, [nav, item]).element,
    "feature-item-one"
  );
});

test("owner selection rejects missing centers and weak overlap", () => {
  const assetRect = { x: 0, y: 0, width: 100, height: 100 };

  assert.equal(chooseReferenceAssetOwnerCandidate(assetRect, [{
    element: "outside",
    rect: { x: 60, y: 60, width: 200, height: 200 },
    depth: 1
  }]), null);
  assert.equal(chooseReferenceAssetOwnerCandidate(assetRect, [{
    element: "weak-overlap",
    rect: { x: 50, y: 25, width: 100, height: 50 },
    depth: 1
  }]), null);
});

test("owner selection prefers deeper candidates with equal bounds", () => {
  const assetRect = { x: 20, y: 20, width: 40, height: 40 };
  const result = chooseReferenceAssetOwnerCandidate(assetRect, [{
    element: "shallow",
    rect: { x: 0, y: 0, width: 100, height: 100 },
    depth: 2
  }, {
    element: "deep",
    rect: { x: 0, y: 0, width: 100, height: 100 },
    depth: 4
  }]);

  assert.equal(result.element, "deep");
  assert.equal(chooseReferenceAssetOwnerCandidate(assetRect, []), null);
});

test("local asset geometry converts authoritative placement into parent coordinates", () => {
  assert.deepEqual(
    createReferenceAssetLocalGeometry({
      id: "menu-icon",
      radius: 8,
      placement: { x: 184, y: 1241, width: 185, height: 168 }
    }, {
      x: 111,
      y: 1172
    }),
    {
      id: "menu-icon",
      left: 73,
      top: 69,
      width: 185,
      height: 168,
      radius: 8
    }
  );
});

test("editable reference geometry and CSS preserve independent corner radii", () => {
  const radii = { topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 };
  const geometry = createReferenceAssetLocalGeometry({
    id: "corners",
    radius: 4,
    radii,
    placement: { x: 10, y: 20, width: 30, height: 40 }
  });
  assert.deepEqual(geometry.radii, radii);

  const css = buildReferenceAssetCorrectionCss([{
    id: "corners",
    width: 30,
    height: 40,
    radius: 4,
    radii,
    translateX: 0,
    translateY: 0
  }]);
  assert.match(css, /border-radius:1px 2px 3px 4px!important/);
});
