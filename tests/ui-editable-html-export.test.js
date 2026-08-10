const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildReferenceAssetExportCss,
  buildFastEditableExportCss,
  buildFastEditableExportScript,
  createFastEditableExportFiles,
  normalizeEditableExportHead
} = require("../src/ui/services/editable-html-export");

function createHeadDocument(metaDefinitions) {
  const children = metaDefinitions.map((definition) => createMetaNode(definition));
  const head = {
    children,
    querySelectorAll(selector) {
      if (selector === "meta[charset]") {
        return children.filter((node) => node.parentNode === head && node.getAttribute("charset") !== null);
      }
      if (selector === "meta[name]") {
        return children.filter((node) => node.parentNode === head && node.getAttribute("name") !== null);
      }
      return [];
    },
    prepend(node) {
      node.parentNode = head;
      children.unshift(node);
    },
    appendChild(node) {
      node.parentNode = head;
      children.push(node);
    }
  };
  children.forEach((node) => {
    node.parentNode = head;
  });
  return {
    head,
    createElement(tagName) {
      assert.equal(tagName, "meta");
      return createMetaNode({});
    }
  };
}

function createMetaNode(attributes) {
  const values = new Map(Object.entries(attributes));
  return {
    parentNode: null,
    getAttribute(name) {
      return values.has(name) ? values.get(name) : null;
    },
    setAttribute(name, value) {
      values.set(name, String(value));
    },
    remove() {
      this.parentNode = null;
    }
  };
}

test("fast export CSS keeps the semantic screen at source size and scales it in place", () => {
  const css = buildFastEditableExportCss({ width: 1728, height: 3642 });

  assert.match(css, /--board-width:1728/);
  assert.match(css, /--board-height:3642/);
  assert.match(css, /\.screen\{[^}]*transform-origin:top left/);
  assert.doesNotMatch(css, /\.fit-canvas/);
});

test("fast export script calculates one global scale from container width", () => {
  const script = buildFastEditableExportScript({ width: 750, height: 1624 });

  assert.match(script, /availableWidth \/ 750/);
  assert.match(script, /Math\.min\(1,/);
  assert.match(script, /scale\(\$\{scale\}\)/);
  assert.match(script, /1624 \* scale/);
  assert.match(script, /document\.querySelector\("\.screen"\)/);
  assert.doesNotMatch(script, /document\.querySelector\("\.fit-canvas"\)/);
});

test("editable export contains separate HTML, CSS, script, and assets", () => {
  const files = createFastEditableExportFiles({
    html: "<!doctype html><html></html>",
    css: ".screen{}",
    script: "fit();",
    assets: [
      { name: "assets/logo.png", data: new Uint8Array([1]) },
      { name: "assets/hero.png", data: new Uint8Array([2]) }
    ],
    textToBytes: (value) => new TextEncoder().encode(value)
  });

  assert.deepEqual(files.map((file) => file.name), ["index.html", "styles.css", "script.js", "assets/logo.png", "assets/hero.png"]);
  assert.equal(new TextDecoder().decode(files[0].data), "<!doctype html><html></html>");
  assert.equal(new TextDecoder().decode(files[1].data), ".screen{}");
  assert.equal(new TextDecoder().decode(files[2].data), "fit();");
});

test("reference asset export CSS uses readable parent-local geometry", () => {
  const css = buildReferenceAssetExportCss("export-reference-asset-2", {
    left: 73,
    top: 69,
    width: 185,
    height: 168,
    radius: 8
  });

  assert.match(css, /left:73px!important/);
  assert.match(css, /top:69px!important/);
  assert.match(css, /width:185px!important/);
  assert.match(css, /height:168px!important/);
  assert.match(css, /border-radius:8px!important/);
  assert.match(css, /transform:none!important/);
  assert.doesNotMatch(css, /translate\(/);
  assert.throws(
    () => buildReferenceAssetExportCss("unsafe class", {}),
    /导出切图 class 无效/
  );
});

test("reference asset export CSS prefers independent corner radii", () => {
  const css = buildReferenceAssetExportCss("corners", {
    left: 0,
    top: 0,
    width: 30,
    height: 40,
    radius: 9,
    radii: { topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 }
  });

  assert.match(css, /border-radius:1px 2px 3px 4px!important/);
  assert.doesNotMatch(css, /border-radius:9px/);
});

test("editable export head keeps exactly one UTF-8 charset declaration", () => {
  const doc = createHeadDocument([
    { charset: "UTF-8" },
    { charset: "utf-8" },
    { name: "description", content: "活动页面" }
  ]);

  normalizeEditableExportHead(doc);

  const charsetMetas = doc.head.querySelectorAll("meta[charset]");
  assert.equal(charsetMetas.length, 1);
  assert.equal(charsetMetas[0].getAttribute("charset"), "UTF-8");
  assert.equal(
    doc.head.querySelectorAll("meta[name]")
      .filter((node) => node.getAttribute("name") === "description").length,
    1
  );
});

test("editable export head adds one canonical mobile viewport declaration", () => {
  const doc = createHeadDocument([
    { charset: "UTF-8" },
    { name: "viewport", content: "width=980" },
    { name: "VIEWPORT", content: "initial-scale=2" }
  ]);

  normalizeEditableExportHead(doc);

  const viewportMetas = doc.head
    .querySelectorAll("meta[name]")
    .filter((node) => node.getAttribute("name").toLowerCase() === "viewport");
  assert.equal(viewportMetas.length, 1);
  assert.equal(viewportMetas[0].getAttribute("name"), "viewport");
  assert.equal(viewportMetas[0].getAttribute("content"), "width=device-width, initial-scale=1");
});
