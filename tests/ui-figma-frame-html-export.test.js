const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const {
  APP_SCRIPT_PLACEHOLDER,
  STYLE_PLACEHOLDER,
  buildUiHtml
} = require("../scripts/build-ui-html");

const {
  createFigmaFrameHtmlExport,
  renderFigmaFrameHtml
} = require("../src/ui/services/figma-frame-html-export");
const {
  extractFigmaFrameAssets
} = require("../src/plugin/figma-frame-assets");

test("renderFigmaFrameHtml emits a fixed-size escaped screen with local assets", () => {
  const manifest = {
    screen: {
      name: "Checkout",
      width: 320,
      height: 640,
      clipsContent: true,
      fills: [{ type: "SOLID", color: { r: 0.95, g: 0.96, b: 0.98 } }]
    },
    nodes: [
      {
        id: "2:1",
        type: "frame",
        name: "Card",
        x: 12,
        y: 24,
        width: 296,
        height: 180,
        fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
        strokes: [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }],
        strokeWeight: 1,
        cornerRadius: 16,
        effects: [{ type: "DROP_SHADOW", visible: true, offset: { x: 0, y: 4 }, radius: 12, color: { r: 0, g: 0, b: 0, a: 0.25 } }],
        children: [
          {
            id: "2:2",
            type: "text",
            name: "Title",
            x: 16,
            y: 20,
            width: 240,
            height: 32,
            characters: "Hello <script>",
            fontFamily: "Inter",
            fontSize: 20,
            fontWeight: 600
          },
          {
            id: "2:3",
            type: "rectangle",
            name: "Hero",
            x: 16,
            y: 64,
            width: 264,
            height: 96,
            fills: [{ type: "IMAGE", imageHash: "hero-hash", scaleMode: "FILL" }]
          }
        ]
      }
    ]
  };
  const assets = [
    { kind: "image-fill", imageHash: "hero-hash", filename: "hero-banner.png", bytes: new Uint8Array([1]) }
  ];

  const { html, css, warnings } = renderFigmaFrameHtml({ manifest, assets });

  assert.match(html, /class="figma-screen"/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /data:image|blob:/);
  assert.match(css, /width:320px/);
  assert.match(css, /height:640px/);
  assert.match(css, /\.figma-screen\{[^}]*background-color:rgba\(242,245,250,1\)/);
  assert.match(css, /url\("\.\/assets\/hero-banner\.png"\)/);
  assert.match(css, /box-shadow:/);
  assert.deepEqual(warnings, []);
});

test("createFigmaFrameHtmlExport emits only local HTML, CSS, and asset files", () => {
  const result = createFigmaFrameHtmlExport({
    manifest: {
      screen: { name: "Checkout", width: 320, height: 640 },
      nodes: [{
        id: "2:1",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 320,
        height: 120,
        fills: [{ type: "IMAGE", imageHash: "hero-hash", scaleMode: "FILL" }]
      }]
    },
    assets: [
      { kind: "image-fill", imageHash: "hero-hash", filename: "hero-banner.png", bytes: new Uint8Array([1]) },
      { kind: "node-render", nodeId: "2:1", filename: "brand-icon.svg", format: "svg", text: "<svg></svg>" }
    ],
    textToBytes: (value) => new TextEncoder().encode(value)
  });

  assert.equal(result.zipFilename, "Checkout-html.zip");
  assert.deepEqual(result.files.map((file) => file.name), [
    "index.html",
    "styles.css",
    "assets/hero-banner.png",
    "assets/brand-icon.svg"
  ]);
  const indexHtml = new TextDecoder().decode(result.files[0].data);
  assert.match(indexHtml, /href="\.\/styles\.css"/);
  assert.match(indexHtml, /\.\/assets\//);
  assert.doesNotMatch(indexHtml, /data:|blob:/);
});

test("inlining the frame exporter preserves the existing global escapeHtml", () => {
  const appUtils = fs.readFileSync("src/ui/services/app-utils.js", "utf8");
  const exporter = fs.readFileSync("src/ui/services/figma-frame-html-export.js", "utf8");
  const html = buildUiHtml(
    `<style>\n${STYLE_PLACEHOLDER}\n</style>\n<script>\n${APP_SCRIPT_PLACEHOLDER}\n</script>`,
    "",
    [appUtils, exporter, "globalThis.escaped = escapeHtml(\"\\\"'&<>\");"]
  );
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const context = { Uint32Array };

  vm.runInNewContext(script, context);

  assert.equal(context.escaped, "&quot;&#039;&amp;&lt;&gt;");
});

test("renderFigmaFrameHtml uses a node-render SVG instead of duplicate mixed-style text", () => {
  const { html } = renderFigmaFrameHtml({
    manifest: {
      screen: { width: 120, height: 40 },
      nodes: [{
        id: "3:1",
        type: "text",
        x: 0,
        y: 0,
        width: 120,
        height: 40,
        characters: "Mixed <text>"
      }]
    },
    assets: [{
      kind: "node-render",
      nodeId: "3:1",
      filename: "mixed-text.svg",
      format: "svg",
      text: "<svg></svg>"
    }]
  });

  assert.match(html, /src="\.\/assets\/mixed-text\.svg"/);
  assert.doesNotMatch(html, /Mixed &lt;text&gt;/);
});

test("renderFigmaFrameHtml converts linear and radial gradient fills deterministically", () => {
  const { css, warnings } = renderFigmaFrameHtml({
    manifest: {
      screen: { width: 320, height: 200 },
      nodes: [
        {
          id: "5:1",
          type: "rectangle",
          name: "Linear",
          x: 0,
          y: 0,
          width: 160,
          height: 100,
          fills: [{
            type: "GRADIENT_LINEAR",
            opacity: 0.5,
            gradientTransform: [[0, 1, 0], [-1, 0, 1]],
            gradientStops: [
              { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
              { position: 1, color: { r: 0, g: 0, b: 1, a: 0.5 } }
            ]
          }]
        },
        {
          id: "5:2",
          type: "rectangle",
          name: "Radial",
          x: 160,
          y: 0,
          width: 160,
          height: 100,
          fills: [{
            type: "GRADIENT_RADIAL",
            gradientTransform: [[0.8, 0, 0.1], [0, 0.6, -0.1]],
            gradientStops: [
              { position: 0.25, color: { r: 1, g: 1, b: 1, a: 0.75 } },
              { position: 0.75, color: { r: 0, g: 0, b: 0, a: 0 } }
            ]
          }]
        },
        {
          id: "5:3",
          type: "rectangle",
          name: "Angular",
          x: 0,
          y: 100,
          width: 320,
          height: 100,
          fills: [{ type: "GRADIENT_ANGULAR", gradientStops: [] }]
        },
        {
          id: "5:4",
          type: "rectangle",
          name: "Identity",
          x: 0,
          y: 0,
          width: 80,
          height: 40,
          fills: [{
            type: "GRADIENT_LINEAR",
            gradientTransform: [[1, 0, 0], [0, 1, 0]],
            gradientStops: [
              { position: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
              { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } }
            ]
          }]
        }
      ]
    }
  });

  assert.match(css, /\.node-5-1\{[^}]*background-image:linear-gradient\(0deg,rgba\(255,0,0,0\.5\) 0%,rgba\(0,0,255,0\.25\) 100%\)/);
  assert.match(css, /\.node-5-2\{[^}]*background-image:radial-gradient\(ellipse 40% 30% at 60% 40%,rgba\(255,255,255,0\.75\) 25%,rgba\(0,0,0,0\) 75%\)/);
  assert.match(css, /\.node-5-4\{[^}]*background-image:linear-gradient\(90deg,rgba\(0,0,0,1\) 0%,rgba\(255,255,255,1\) 100%\)/);
  assert.deepEqual(warnings, ["Angular: 不支持的填充 GRADIENT_ANGULAR"]);
});

test("renderFigmaFrameHtml converts visible blur effects without replacing shadows", () => {
  const { css, warnings } = renderFigmaFrameHtml({
    manifest: {
      screen: { width: 120, height: 80 },
      nodes: [{
        id: "6:1",
        type: "rectangle",
        name: "Glass",
        x: 0,
        y: 0,
        width: 120,
        height: 80,
        effects: [
          { type: "DROP_SHADOW", visible: true, offset: { x: 0, y: 2 }, radius: 6, color: { r: 0, g: 0, b: 0, a: 0.2 } },
          { type: "LAYER_BLUR", visible: true, radius: 4 },
          { type: "BACKGROUND_BLUR", visible: true, radius: 8 },
          { type: "LAYER_BLUR", visible: false, radius: 99 },
          { type: "TEXTURE", visible: true, radius: 3 }
        ]
      }]
    }
  });

  assert.match(css, /\.node-6-1\{[^}]*box-shadow:0px 2px 6px 0px rgba\(0,0,0,0\.2\)/);
  assert.match(css, /\.node-6-1\{[^}]*filter:blur\(4px\)/);
  assert.match(css, /\.node-6-1\{[^}]*-webkit-backdrop-filter:blur\(8px\);backdrop-filter:blur\(8px\)/);
  assert.doesNotMatch(css, /blur\(99px\)/);
  assert.deepEqual(warnings, ["Glass: 不支持的效果 TEXTURE"]);
});

test("renderFigmaFrameHtml renders solid text fills as color without painting a background", () => {
  const { css, warnings } = renderFigmaFrameHtml({
    manifest: {
      screen: { width: 240, height: 120 },
      nodes: [
        {
          id: "11:1",
          type: "text",
          name: "White title",
          x: 0,
          y: 0,
          width: 240,
          height: 32,
          characters: "White",
          fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }]
        },
        {
          id: "11:2",
          type: "text",
          name: "Transparent title",
          x: 0,
          y: 40,
          width: 240,
          height: 32,
          characters: "Transparent",
          fills: [{
            type: "SOLID",
            opacity: 0.5,
            color: { r: 0.2, g: 0.4, b: 0.8, a: 0.4 }
          }]
        },
        {
          id: "11:3",
          type: "text",
          name: "Missing gradient replacement",
          x: 0,
          y: 80,
          width: 240,
          height: 32,
          characters: "Gradient",
          fills: [{
            type: "GRADIENT_LINEAR",
            gradientTransform: [[1, 0, 0], [0, 1, 0]],
            gradientStops: [
              { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
              { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } }
            ]
          }]
        }
      ]
    }
  });
  const whiteRule = css.match(/\.node-11-1\{[^}]*\}/)[0];
  const transparentRule = css.match(/\.node-11-2\{[^}]*\}/)[0];
  const missingReplacementRule = css.match(/\.node-11-3\{[^}]*\}/)[0];

  assert.match(whiteRule, /color:rgba\(255,255,255,1\)/);
  assert.doesNotMatch(whiteRule, /background-/);
  assert.match(transparentRule, /color:rgba\(51,102,204,0\.2\)/);
  assert.doesNotMatch(transparentRule, /background-/);
  assert.doesNotMatch(missingReplacementRule, /background-|color:/);
  assert.deepEqual(warnings, [
    "Missing gradient replacement: 非纯色文本填充缺少 node-render 资源"
  ]);
});

test("renderFigmaFrameHtml treats node-render assets as complete visual replacements", () => {
  const { html, css, warnings } = renderFigmaFrameHtml({
    manifest: {
      screen: { width: 320, height: 240 },
      nodes: [
        {
          id: "12:1",
          type: "text",
          name: "Mixed text",
          relativeTransform: [[1, 0, 12], [0, 1, 18]],
          width: 120,
          height: 32,
          visible: true,
          opacity: 0.4,
          clipsContent: true,
          characters: "Do not duplicate",
          fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
          strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
          strokeWeight: 2,
          effects: [{
            type: "DROP_SHADOW",
            offset: { x: 0, y: 4 },
            radius: 8,
            color: { r: 0, g: 0, b: 0, a: 0.5 }
          }],
          children: [{
            id: "12:2",
            type: "rectangle",
            x: 0,
            y: 0,
            width: 10,
            height: 10
          }]
        },
        {
          id: "12:3",
          type: "frame",
          name: "Crop frame",
          x: 0,
          y: 60,
          width: 160,
          height: 100,
          opacity: 0.5,
          fills: [{ type: "IMAGE", imageHash: "crop-hash", scaleMode: "CROP" }],
          children: [{
            id: "12:4",
            type: "text",
            x: 8,
            y: 8,
            width: 100,
            height: 20,
            characters: "Crop child"
          }]
        },
        {
          id: "12:5",
          type: "svg",
          figmaType: "BOOLEAN_OPERATION",
          name: "Boolean",
          x: 180,
          y: 60,
          width: 80,
          height: 80,
          children: [{
            id: "12:6",
            type: "svg",
            x: 0,
            y: 0,
            width: 80,
            height: 80
          }]
        }
      ]
    },
    assets: [
      {
        kind: "node-render",
        nodeId: "12:1",
        filename: "mixed.svg",
        renderBounds: { x: -4, y: -6, width: 130, height: 45 },
        text: "<svg></svg>",
        format: "svg"
      },
      {
        kind: "node-render",
        nodeId: "12:3",
        filename: "crop.png",
        renderBounds: null,
        bytes: new Uint8Array([1]),
        format: "png"
      },
      {
        kind: "node-render",
        nodeId: "12:5",
        filename: "boolean.svg",
        renderBounds: null,
        text: "<svg></svg>",
        format: "svg"
      }
    ]
  });
  const replacementRule = css.match(/\.node-12-1\{[^}]*\}/)[0];

  assert.match(html, /src="\.\/assets\/mixed\.svg"/);
  assert.match(html, /src="\.\/assets\/crop\.png"/);
  assert.match(html, /src="\.\/assets\/boolean\.svg"/);
  assert.doesNotMatch(html, /Do not duplicate|Crop child|data-node-id="12:(?:2|4|6)"/);
  assert.match(replacementRule, /transform:matrix\(1,0,0,1,12,18\)/);
  assert.doesNotMatch(replacementRule, /overflow:hidden/);
  assert.doesNotMatch(replacementRule, /opacity|background|border|box-shadow|color|font-/);
  assert.doesNotMatch(css, /\.node-12-(?:2|4|6)\{/);
  assert.match(css, /\.figma-node-image\{display:block;position:absolute/);
  assert.match(css, /\.node-12-1>\.figma-node-image\{left:-4px;top:-6px;width:130px;height:45px;\}/);
  assert.match(css, /\.node-12-3>\.figma-node-image\{left:0;top:0;width:100%;height:100%;\}/);
  assert.deepEqual(warnings, []);
});

test("renderFigmaFrameHtml replaces the root frame and suppresses its manifest nodes", () => {
  const { html, css, warnings } = renderFigmaFrameHtml({
    manifest: {
      source: { frameId: "1:1" },
      screen: {
        name: "Root crop",
        width: 320,
        height: 640,
        clipsContent: true,
        fills: [{ type: "IMAGE", imageHash: "root-crop", scaleMode: "CROP" }]
      },
      nodes: [{
        id: "13:1",
        type: "text",
        x: 0,
        y: 0,
        width: 100,
        height: 24,
        characters: "Already in root asset"
      }]
    },
    assets: [{
      kind: "node-render",
      nodeId: "1:1",
      filename: "root.png",
      renderBounds: { x: -2, y: -3, width: 324, height: 646 },
      bytes: new Uint8Array([1]),
      format: "png"
    }]
  });
  const screenRule = css.match(/\.figma-screen\{[^}]*\}/)[0];

  assert.match(html, /src="\.\/assets\/root\.png"/);
  assert.doesNotMatch(html, /Already in root asset|data-node-id="13:1"/);
  assert.doesNotMatch(screenRule, /background|opacity|box-shadow/);
  assert.match(screenRule, /overflow:hidden/);
  assert.match(css, /\.figma-screen>\.figma-node-image\{left:-2px;top:-3px;width:324px;height:646px;\}/);
  assert.deepEqual(warnings, []);
});

test("extractor and renderer suppress a failed BOOLEAN replacement subtree while keeping its sibling", async () => {
  const failedChild = {
    id: "20:2",
    type: "TEXT",
    name: "Failed boolean child",
    fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
    children: []
  };
  const failedBoolean = {
    id: "20:1",
    type: "BOOLEAN_OPERATION",
    name: "Failed boolean",
    fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
    children: [failedChild],
    async exportAsync() {
      throw new Error("boolean export unavailable");
    }
  };
  const sibling = {
    id: "20:3",
    type: "RECTANGLE",
    name: "Working sibling",
    fills: [{ type: "SOLID", color: { r: 0, g: 1, b: 0 } }],
    children: []
  };
  const frame = {
    id: "20:0",
    type: "FRAME",
    name: "Boolean integration",
    fills: [],
    children: [failedBoolean, sibling]
  };
  const manifest = {
    screen: { name: frame.name, width: 320, height: 200, fills: [] },
    nodes: [
      {
        id: failedBoolean.id,
        type: "svg",
        figmaType: failedBoolean.type,
        name: failedBoolean.name,
        relativeTransform: [[1, 0, 12], [0, 1, 18]],
        width: 120,
        height: 80,
        visible: true,
        opacity: 0.4,
        clipsContent: true,
        fills: failedBoolean.fills,
        strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
        strokeWeight: 2,
        effects: [{
          type: "DROP_SHADOW",
          offset: { x: 0, y: 4 },
          radius: 8,
          color: { r: 0, g: 0, b: 0, a: 0.5 }
        }],
        children: [{
          id: failedChild.id,
          type: "text",
          name: failedChild.name,
          x: 0,
          y: 0,
          width: 100,
          height: 24,
          characters: "Do not render failed boolean child",
          fills: failedChild.fills
        }]
      },
      {
        id: sibling.id,
        type: "rectangle",
        name: sibling.name,
        x: 180,
        y: 20,
        width: 80,
        height: 60,
        fills: sibling.fills
      }
    ]
  };

  const extracted = await extractFigmaFrameAssets({ figmaApi: {}, frame, manifest });
  const rendered = renderFigmaFrameHtml({ manifest, assets: extracted.assets });
  const failedRule = rendered.css.match(/\.node-20-1\{[^}]*\}/)[0];

  assert.equal(manifest.nodes[0].replacementFailed, true);
  assert.match(rendered.html, /data-node-id="20:1"/);
  assert.match(rendered.html, /data-node-id="20:3"/);
  assert.doesNotMatch(rendered.html, /data-node-id="20:2"|Do not render failed boolean child|figma-node-image/);
  assert.match(failedRule, /transform:matrix\(1,0,0,1,12,18\)/);
  assert.doesNotMatch(failedRule, /overflow|opacity|background|border|box-shadow|color|font-/);
  assert.match(rendered.css, /\.node-20-3\{[^}]*background-color:rgba\(0,255,0,1\)/);
  assert.deepEqual(rendered.warnings, []);
});

test("extractor and renderer suppress a failed CROP replacement subtree while keeping its sibling", async () => {
  const failedChild = {
    id: "21:2",
    type: "TEXT",
    name: "Failed crop child",
    fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
    children: []
  };
  const failedCrop = {
    id: "21:1",
    type: "FRAME",
    name: "Failed crop",
    fills: [{ type: "IMAGE", imageHash: "failed-crop", scaleMode: "CROP" }],
    children: [failedChild],
    async exportAsync() {
      throw new Error("crop export unavailable");
    }
  };
  const sibling = {
    id: "21:3",
    type: "RECTANGLE",
    name: "Working crop sibling",
    fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 1 } }],
    children: []
  };
  const frame = {
    id: "21:0",
    type: "FRAME",
    name: "Crop integration",
    fills: [],
    children: [failedCrop, sibling]
  };
  const manifest = {
    screen: { name: frame.name, width: 320, height: 200, fills: [] },
    nodes: [
      {
        id: failedCrop.id,
        type: "image",
        figmaType: failedCrop.type,
        name: failedCrop.name,
        x: 12,
        y: 20,
        width: 140,
        height: 90,
        visible: true,
        opacity: 0.5,
        clipsContent: true,
        fills: failedCrop.fills,
        children: [{
          id: failedChild.id,
          type: "text",
          name: failedChild.name,
          x: 8,
          y: 8,
          width: 100,
          height: 24,
          characters: "Do not render failed crop child",
          fills: failedChild.fills
        }]
      },
      {
        id: sibling.id,
        type: "rectangle",
        name: sibling.name,
        x: 180,
        y: 20,
        width: 80,
        height: 60,
        fills: sibling.fills
      }
    ]
  };

  const extracted = await extractFigmaFrameAssets({ figmaApi: {}, frame, manifest });
  const rendered = renderFigmaFrameHtml({ manifest, assets: extracted.assets });
  const failedRule = rendered.css.match(/\.node-21-1\{[^}]*\}/)[0];

  assert.equal(manifest.nodes[0].replacementFailed, true);
  assert.match(rendered.html, /data-node-id="21:1"/);
  assert.match(rendered.html, /data-node-id="21:3"/);
  assert.doesNotMatch(rendered.html, /data-node-id="21:2"|Do not render failed crop child|figma-node-image/);
  assert.match(failedRule, /left:12px;top:20px;width:140px;height:90px/);
  assert.doesNotMatch(failedRule, /overflow|opacity|background|border|box-shadow|color|font-/);
  assert.match(rendered.css, /\.node-21-3\{[^}]*background-color:rgba\(0,0,255,1\)/);
  assert.deepEqual(rendered.warnings, []);
});

test("extractor and renderer keep only geometry and clipping for a failed root replacement", async () => {
  const child = {
    id: "22:1",
    type: "TEXT",
    name: "Failed root child",
    fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
    children: []
  };
  const frame = {
    id: "22:0",
    type: "FRAME",
    name: "Failed root crop",
    fills: [{ type: "IMAGE", imageHash: "failed-root-crop", scaleMode: "CROP" }],
    children: [child],
    async exportAsync() {
      throw new Error("root crop export unavailable");
    }
  };
  const manifest = {
    source: { frameId: frame.id },
    screen: {
      name: frame.name,
      width: 320,
      height: 640,
      clipsContent: true,
      fills: frame.fills
    },
    nodes: [{
      id: child.id,
      type: "text",
      name: child.name,
      x: 12,
      y: 20,
      width: 180,
      height: 24,
      characters: "Do not render failed root child",
      fills: child.fills
    }]
  };

  const extracted = await extractFigmaFrameAssets({ figmaApi: {}, frame, manifest });
  const rendered = renderFigmaFrameHtml({ manifest, assets: extracted.assets });
  const screenRule = rendered.css.match(/\.figma-screen\{[^}]*\}/)[0];

  assert.equal(manifest.screen.replacementFailed, true);
  assert.deepEqual(extracted.assets, []);
  assert.doesNotMatch(rendered.html, /data-node-id="22:1"|Do not render failed root child|figma-node-image/);
  assert.match(screenRule, /width:320px;height:640px/);
  assert.match(screenRule, /overflow:hidden/);
  assert.doesNotMatch(screenRule, /background|opacity|box-shadow/);
  assert.deepEqual(rendered.warnings, []);
});

test("renderFigmaFrameHtml preserves ellipses and letter-spacing units", () => {
  const { css, warnings } = renderFigmaFrameHtml({
    manifest: {
      screen: { width: 320, height: 160 },
      nodes: [
        {
          id: "14:1",
          type: "ellipse",
          name: "Oval",
          x: 0,
          y: 0,
          width: 120,
          height: 80,
          fills: [{ type: "SOLID", color: { r: 1, g: 0.5, b: 0 } }],
          strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
          strokeWeight: 1
        },
        {
          id: "14:2",
          type: "text",
          name: "Percent spacing",
          x: 0,
          y: 90,
          width: 140,
          height: 24,
          characters: "Percent",
          letterSpacing: { unit: "PERCENT", value: 10 },
          fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }]
        },
        {
          id: "14:3",
          type: "text",
          name: "Pixel spacing",
          x: 160,
          y: 90,
          width: 140,
          height: 24,
          characters: "Pixels",
          letterSpacing: { unit: "PIXELS", value: 2 },
          fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }]
        }
      ]
    }
  });

  assert.match(css, /\.node-14-1\{[^}]*border-radius:50%/);
  assert.match(css, /\.node-14-2\{[^}]*letter-spacing:0\.1em/);
  assert.match(css, /\.node-14-3\{[^}]*letter-spacing:2px/);
  assert.deepEqual(warnings, []);
});

test("renderFigmaFrameHtml maps TILE sizing and warns for unstable image paints", () => {
  const { css, warnings } = renderFigmaFrameHtml({
    manifest: {
      screen: { width: 400, height: 240 },
      nodes: [
        {
          id: "15:1",
          type: "image",
          name: "Valid tile",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fills: [{
            type: "IMAGE",
            imageHash: "tile-valid",
            scaleMode: "TILE",
            scalingFactor: 2
          }]
        },
        {
          id: "15:2",
          type: "image",
          name: "Missing tile size",
          x: 100,
          y: 0,
          width: 100,
          height: 100,
          fills: [{
            type: "IMAGE",
            imageHash: "tile-missing-size",
            scaleMode: "TILE",
            scalingFactor: 1
          }]
        },
        {
          id: "15:3",
          type: "image",
          name: "Invalid tile factor",
          x: 200,
          y: 0,
          width: 100,
          height: 100,
          fills: [{
            type: "IMAGE",
            imageHash: "tile-invalid-factor",
            scaleMode: "TILE",
            scalingFactor: 0
          }]
        },
        {
          id: "15:4",
          type: "image",
          name: "Unexpected opacity",
          x: 0,
          y: 120,
          width: 100,
          height: 100,
          fills: [{
            type: "IMAGE",
            imageHash: "fill-opacity",
            scaleMode: "FILL",
            opacity: 0.5
          }]
        },
        {
          id: "15:5",
          type: "image",
          name: "Unexpected transform",
          x: 120,
          y: 120,
          width: 100,
          height: 100,
          fills: [{
            type: "IMAGE",
            imageHash: "fit-transform",
            scaleMode: "FIT",
            imageTransform: [[1, 0, 2], [0, 1, 0]]
          }]
        }
      ]
    },
    assets: [
      {
        kind: "image-fill",
        imageHash: "tile-valid",
        filename: "tile-valid.png",
        intrinsicWidth: 20,
        intrinsicHeight: 10,
        bytes: new Uint8Array([1])
      },
      {
        kind: "image-fill",
        imageHash: "tile-missing-size",
        filename: "tile-missing.png",
        intrinsicWidth: null,
        intrinsicHeight: null,
        bytes: new Uint8Array([2])
      },
      {
        kind: "image-fill",
        imageHash: "tile-invalid-factor",
        filename: "tile-invalid.png",
        intrinsicWidth: 16,
        intrinsicHeight: 12,
        bytes: new Uint8Array([3])
      },
      {
        kind: "image-fill",
        imageHash: "fill-opacity",
        filename: "fill-opacity.png",
        bytes: new Uint8Array([4])
      },
      {
        kind: "image-fill",
        imageHash: "fit-transform",
        filename: "fit-transform.png",
        bytes: new Uint8Array([5])
      }
    ]
  });
  const validTileRule = css.match(/\.node-15-1\{[^}]*\}/)[0];
  const missingSizeRule = css.match(/\.node-15-2\{[^}]*\}/)[0];
  const invalidFactorRule = css.match(/\.node-15-3\{[^}]*\}/)[0];
  const fillRule = css.match(/\.node-15-4\{[^}]*\}/)[0];
  const fitRule = css.match(/\.node-15-5\{[^}]*\}/)[0];

  assert.match(validTileRule, /background-repeat:repeat/);
  assert.match(validTileRule, /background-size:40px 20px/);
  assert.doesNotMatch(missingSizeRule, /background-size:/);
  assert.doesNotMatch(invalidFactorRule, /background-size:/);
  assert.match(fillRule, /background-size:cover/);
  assert.match(fitRule, /background-size:contain/);
  assert.deepEqual(warnings, [
    "Missing tile size: TILE 图片缺少有效原始尺寸",
    "Invalid tile factor: TILE 图片 scalingFactor 无效",
    "Unexpected opacity: 图片填充 opacity 未通过 node-render 回退",
    "Unexpected transform: 图片填充 transform 未通过 node-render 回退"
  ]);
});

test("renderFigmaFrameHtml scales only the fit display shell on narrow viewports", () => {
  const { css } = renderFigmaFrameHtml({
    manifest: {
      screen: { width: 320, height: 640 },
      nodes: [{
        id: "16:1",
        type: "rectangle",
        x: 12,
        y: 24,
        width: 100,
        height: 80
      }]
    }
  });

  assert.match(css, /:root\{--figma-screen-width:320px;--figma-screen-height:640px;--figma-fit-scale:min\(1,calc\(100vw \/ var\(--figma-screen-width\)\)\);\}/);
  assert.match(css, /\.fit-box\{[^}]*width:calc\(var\(--figma-screen-width\) \* var\(--figma-fit-scale\)\)/);
  assert.match(css, /\.fit-box\{[^}]*height:calc\(var\(--figma-screen-height\) \* var\(--figma-fit-scale\)\)/);
  assert.match(css, /\.fit-canvas\{[^}]*width:320px;height:640px;[^}]*transform:scale\(var\(--figma-fit-scale\)\)/);
  assert.match(css, /\.figma-screen\{[^}]*width:320px;height:640px/);
  assert.match(css, /\.node-16-1\{[^}]*left:12px;top:24px;width:100px;height:80px/);
});

test("createFigmaFrameHtmlExport renames duplicate assets and synchronizes every reference", () => {
  const result = createFigmaFrameHtmlExport({
    manifest: {
      screen: { name: "Duplicates", width: 200, height: 120 },
      nodes: [
        {
          id: "17:1",
          type: "image",
          x: 0,
          y: 0,
          width: 80,
          height: 80,
          fills: [{ type: "IMAGE", imageHash: "hash-a", scaleMode: "FILL" }]
        },
        {
          id: "17:2",
          type: "image",
          x: 80,
          y: 0,
          width: 80,
          height: 80,
          fills: [{ type: "IMAGE", imageHash: "hash-b", scaleMode: "FIT" }]
        },
        {
          id: "17:3",
          type: "svg",
          x: 160,
          y: 0,
          width: 40,
          height: 40
        }
      ]
    },
    assets: [
      {
        kind: "image-fill",
        imageHash: "hash-a",
        filename: "shared.png",
        bytes: new Uint8Array([1]),
        format: "png"
      },
      {
        kind: "image-fill",
        imageHash: "hash-b",
        filename: "shared.png",
        bytes: new Uint8Array([2]),
        format: "png"
      },
      {
        kind: "node-render",
        nodeId: "17:3",
        filename: "shared.png",
        bytes: new Uint8Array([3]),
        format: "png"
      }
    ],
    textToBytes: (value) => new TextEncoder().encode(value)
  });
  const indexHtml = new TextDecoder().decode(result.files[0].data);
  const stylesCss = new TextDecoder().decode(result.files[1].data);

  assert.deepEqual(result.files.map((file) => file.name), [
    "index.html",
    "styles.css",
    "assets/shared.png",
    "assets/shared--2.png",
    "assets/shared--3.png"
  ]);
  assert.deepEqual(
    result.files.slice(2).map((file) => Array.from(file.data)),
    [[1], [2], [3]]
  );
  assert.match(stylesCss, /\.node-17-1\{[^}]*url\("\.\/assets\/shared\.png"\)/);
  assert.match(stylesCss, /\.node-17-2\{[^}]*url\("\.\/assets\/shared--2\.png"\)/);
  assert.match(indexHtml, /src="\.\/assets\/shared--3\.png"/);
  assert.deepEqual(result.warnings, []);
});
