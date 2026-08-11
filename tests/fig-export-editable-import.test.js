const test = require("node:test");
const assert = require("node:assert/strict");

const { createEditableDesignScreen } = require("../src/plugin/screen-importer");
const {
  createFigExportApi,
  exportApiDocument
} = require("../src/fig-export/figma-api-adapter");
const { decodeFigDocument } = require("../src/fig-export/fig-codec");

const RED_PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFgAI/ScL2WQAAAABJRU5ErkJggg==";

test("editable importer exports every current editable node family and semantic groups", async () => {
  const api = createFigExportApi();
  const result = await createEditableDesignScreen({
    figmaApi: api,
    manifest: {
      screen: {
        name: "Editable Screen",
        width: 750,
        height: 1334,
        clipsContent: true,
        gradient: {
          type: "linear",
          angle: 90,
          stops: [
            { position: 0, color: "#ffffff" },
            { position: 1, color: "#eeeeee" }
          ]
        }
      },
      sourceImage: { dataUrl: RED_PIXEL_PNG },
      nodes: [
        {
          type: "frame",
          name: "Nested Frame",
          x: 20,
          y: 30,
          width: 400,
          height: 300,
          clipsContent: true,
          fill: "#ffffff",
          radius: 20,
          shadow: { x: 0, y: 8, blur: 24, spread: 1, color: "#000000", opacity: 0.2 },
          children: [{
            type: "text",
            name: "Heading",
            x: 16,
            y: 18,
            width: 260,
            height: 50,
            text: "端午习俗",
            fontSize: 32,
            fontWeight: 700,
            lineHeight: 42,
            letterSpacing: 1,
            color: "#123456"
          }]
        },
        {
          type: "image",
          name: "Photo",
          x: 40,
          y: 360,
          width: 160,
          height: 120,
          radius: 14,
          dataUrl: RED_PIXEL_PNG,
          scaleMode: "FILL"
        },
        {
          type: "svg",
          name: "Badge SVG",
          x: 220,
          y: 360,
          width: 80,
          height: 80,
          svgData: '<svg viewBox="0 0 40 40"><rect x="2" y="2" width="36" height="36" rx="8" fill="#ff0000"/><path d="M10 20 L18 28 L30 12" fill="none" stroke="#ffffff" stroke-width="3"/></svg>'
        },
        {
          type: "icon",
          name: "Arrow",
          iconName: "chevronright",
          x: 320,
          y: 360,
          width: 32,
          height: 32,
          color: "#334455"
        },
        {
          type: "rectangle",
          name: "Grouped A",
          semanticGroupId: "menu",
          semanticGroupName: "Menu Group",
          x: 20,
          y: 520,
          width: 100,
          height: 50,
          fill: "#abcdef",
          stroke: "#123456",
          strokeWidth: 2
        },
        {
          type: "rectangle",
          name: "Grouped B",
          semanticGroupId: "menu",
          semanticGroupName: "Menu Group",
          x: 140,
          y: 520,
          width: 100,
          height: 50,
          fill: "#fedcba"
        },
        {
          type: "rectangle",
          name: "Radial",
          x: 20,
          y: 600,
          width: 100,
          height: 80,
          opacity: 0.7,
          radii: { topLeft: 2, topRight: 4, bottomRight: 6, bottomLeft: 8 },
          gradient: {
            type: "radial",
            stops: [
              { position: 0, color: "#ff0000", opacity: 0.5 },
              { position: 1, color: "#0000ff" }
            ]
          }
        },
        {
          type: "rectangle",
          name: "Angular",
          x: 140,
          y: 600,
          width: 100,
          height: 80,
          gradient: {
            type: "angular",
            angle: 45,
            stops: [
              { position: 0, color: "#ffffff" },
              { position: 1, color: "#000000" }
            ]
          }
        }
      ]
    }
  });

  assert.equal(result.skipped.length, 0);
  assert.equal(result.groupedCount, 1);

  const decoded = decodeFigDocument(await exportApiDocument(api));
  const screen = decoded.nodes.find((node) => node.name === "Editable Screen");
  const nested = decoded.nodes.find((node) => node.name === "Nested Frame");
  const heading = decoded.nodes.find((node) => node.name === "Heading");
  const photo = decoded.nodes.find((node) => node.name === "Photo");
  const badge = decoded.nodes.find((node) => node.name === "Badge SVG");
  const arrow = decoded.nodes.find((node) => node.name === "Arrow");
  const group = decoded.nodes.find((node) => node.name === "Menu Group");
  const radial = decoded.nodes.find((node) => node.name === "Radial");
  const angular = decoded.nodes.find((node) => node.name === "Angular");

  assert.equal(screen.type, "FRAME");
  assert.equal(screen.frameMaskDisabled, false);
  assert.equal(screen.fillPaints[0].type, "GRADIENT_LINEAR");
  assert.equal(nested.effects[0].type, "DROP_SHADOW");
  assert.equal(heading.type, "TEXT");
  assert.equal(heading.textData.characters, "端午习俗");
  assert.equal(photo.fillPaints[0].type, "IMAGE");
  assert.equal(badge.type, "VECTOR");
  assert.equal(arrow.type, "VECTOR");
  assert.equal(group.type, "FRAME");
  assert.equal(group.resizeToFit, true);
  assert.equal(group.frameMaskDisabled, true);
  assert.equal(radial.fillPaints[0].type, "GRADIENT_RADIAL");
  assert.ok(Math.abs(radial.fillPaints[0].stops[0].color.a - 0.35) < 1e-6);
  assert.equal(radial.rectangleTopLeftCornerRadius, 2);
  assert.equal(radial.rectangleTopRightCornerRadius, 4);
  assert.equal(radial.rectangleBottomRightCornerRadius, 6);
  assert.equal(radial.rectangleBottomLeftCornerRadius, 8);
  assert.equal(angular.fillPaints[0].type, "GRADIENT_ANGULAR");
});
