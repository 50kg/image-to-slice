const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDownloadFilename,
  buildSliceExportManifest,
  createScreenFromResultImage
} = require("../src/ui/services/export-manifest");

test("buildDownloadFilename preserves padded GPT image names", () => {
  assert.equal(buildDownloadFilename(0), "gpt-image-01.png");
  assert.equal(buildDownloadFilename(11), "gpt-image-12.png");
});

test("createScreenFromResultImage prefers image metadata over fallback size", () => {
  assert.deepEqual(createScreenFromResultImage({ naturalWidth: 390.4, naturalHeight: 843.6 }, {
    name: "Screen",
    width: 100,
    height: 200
  }), {
    name: "Screen",
    width: 390,
    height: 844
  });
});

test("buildSliceExportManifest preserves legacy asset export shape", () => {
  const manifest = {
    sourcePrompt: "Prompt",
    screen: {
      name: "Home",
      width: 390,
      height: 844
    }
  };
  const activeImage = {
    sliceManifest: {
      assets: [
        {
          id: "asset-1",
          name: " icon: user/avatar? ",
          svgData: "<svg />",
          transparent: true,
          aiTransparent: true,
          aiRedrawn: false,
          originalDataUrl: "data:image/png;base64,abc",
          radius: 12,
          placement: { x: 1, y: 2, width: 30, height: 40 }
        }
      ]
    }
  };

  const result = buildSliceExportManifest({
    manifest,
    activeImage,
    imageIndex: 2,
    getSliceRadius: (asset) => asset.radius
  });

  assert.equal(result.version, "1.0.0");
  assert.match(result.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual({ ...result, exportedAt: "DATE" }, {
    version: "1.0.0",
    exportedAt: "DATE",
    sourcePrompt: "Prompt",
    selectedImageIndex: 2,
    screen: {
      name: "Home",
      width: 390,
      height: 844
    },
    assets: [{
      id: "asset-1",
      name: " icon: user/avatar? ",
      filename: "assets/icon__user_avatar_.png",
      svgFilename: "assets/icon__user_avatar_.svg",
      format: "png",
      formats: ["png", "svg"],
      transparent: true,
      aiTransparent: true,
      aiRedrawn: false,
      hasOriginalRaster: true,
      selectedImageIndex: 2,
      radius: 12,
      placement: { x: 1, y: 2, width: 30, height: 40 }
    }]
  });
});

test("buildSliceExportManifest includes both ordinary AI inpaint results", () => {
  const result = buildSliceExportManifest({
    manifest: {
      screen: { name: "Screen", width: 100, height: 100 }
    },
    activeImage: {
      sliceManifest: {
        assets: [
          {
            id: "safe",
            name: "背景_局部合成",
            aiInpaintResultGroupId: "group-1",
            placement: { x: 0, y: 0, width: 100, height: 100 }
          },
          {
            id: "full",
            name: "背景_AI完整图",
            aiInpaintResultGroupId: "group-1",
            placement: { x: 0, y: 0, width: 100, height: 100 }
          }
        ]
      }
    },
    imageIndex: 0,
    getSliceRadius: () => 0
  });

  assert.deepEqual(result.assets.map((asset) => asset.id), ["safe", "full"]);
});

test("buildSliceExportManifest preserves independent corner radii", () => {
  const radii = { topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 };
  const result = buildSliceExportManifest({
    manifest: { screen: { name: "Screen", width: 100, height: 100 } },
    activeImage: {
      sliceManifest: {
        assets: [{
          id: "corners",
          name: "Corners",
          radius: 4,
          radii,
          placement: { x: 0, y: 0, width: 40, height: 30 }
        }]
      }
    },
    imageIndex: 0,
    getSliceRadius: () => 4,
    getSliceRadii: () => radii
  });

  assert.deepEqual(result.assets[0].radii, radii);
});

test("buildSliceExportManifest assigns stable unique filenames to duplicate asset names", () => {
  const result = buildSliceExportManifest({
    manifest: { screen: { name: "Screen", width: 100, height: 100 } },
    activeImage: {
      sliceManifest: {
        assets: ["icon", "icon", "icon--2"].map((name, index) => ({
          id: `asset-${index}`,
          name,
          svgData: index === 1 ? "<svg />" : null,
          placement: { x: 0, y: 0, width: 10, height: 10 }
        }))
      }
    },
    imageIndex: 0,
    getSliceRadius: () => 0
  });

  assert.deepEqual(result.assets.map((asset) => asset.filename), [
    "assets/icon.png",
    "assets/icon--2.png",
    "assets/icon--2--2.png"
  ]);
  assert.equal(result.assets[1].svgFilename, "assets/icon--2.svg");
});
