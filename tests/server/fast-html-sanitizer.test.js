const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
  sanitizeFastGeneratedHtml
} = require("../../src/server/services/fast-html-sanitizer");

const dimensions = {
  previewWidth: 320,
  previewHeight: 640,
  sourceWidth: 320,
  sourceHeight: 640
};

test("fast sanitizer keeps a known anchor in place with trusted identity", () => {
  const source = `<!doctype html><html><head></head><body><div class="screen"><div id="before"></div><img class="brand-logo" data-reference-asset="logo" src="https://bad.test/logo.png" alt="Brand"><div id="after"></div></div></body></html>`;

  const result = sanitizeFastGeneratedHtml(source, [{
    id: "logo",
    name: "Logo",
    radius: 6,
    placement: { x: 10, y: 20, width: 30, height: 40 }
  }], dimensions);

  assert.equal(result.missingReferenceAnchorCount, 0);
  assert.equal(result.referenceAnchorCount, 1);
  assert.ok(result.html.indexOf('id="before"') < result.html.indexOf('data-reference-asset="logo"'));
  assert.ok(result.html.indexOf('data-reference-asset="logo"') < result.html.indexOf('id="after"'));
  assert.match(result.html, /class="brand-logo"/);
  assert.match(result.html, /src="asset:logo"/);
  assert.match(result.html, /alt="Brand"/);
  assert.doesNotMatch(result.html, /data:image\//);
  assert.doesNotMatch(result.html, /style="[^"]*left:10px/);
});

test("semantic sanitizer preserves nested readable markup and trusted asset classes", () => {
  const html = `<!doctype html>
    <html lang="zh-CN">
      <head>
        <title>活动页面</title>
        <style>
          .feature { position:absolute; left:100px; top:200px; width:300px; height:180px; }
          .feature-icon { position:absolute; left:20px; top:16px; width:80px; height:80px; }
        </style>
      </head>
      <body>
        <main class="fit-shell"><div class="fit-box"><div class="screen">
          <section class="features">
            <a class="feature" href="#">
              <img class="feature-icon" data-reference-asset="icon" src="asset:icon" alt="活动入口">
              <strong>活动入口</strong>
            </a>
          </section>
        </div></div></main>
      </body>
    </html>`;
  const result = sanitizeFastGeneratedHtml(html, [{
    id: "icon",
    name: "活动入口",
    radius: 6,
    placement: { x: 120, y: 216, width: 80, height: 80 }
  }], {
    previewWidth: 750,
    previewHeight: 1600,
    sourceWidth: 750,
    sourceHeight: 1600
  });

  assert.match(result.html, /<section class="features">/);
  assert.match(result.html, /<a class="feature" href="#">/);
  assert.match(result.html, /class="feature-icon"/);
  assert.match(result.html, /src="asset:icon"/);
  assert.match(result.html, /alt="活动入口"/);
  assert.doesNotMatch(result.html, /style="[^"]*left:120px/);
  assert.equal(result.referenceAnchorCount, 1);
});

test("semantic sanitizer supplies the fixed preview shell when AI returns only a screen root", () => {
  const result = sanitizeFastGeneratedHtml(`
    <!doctype html>
    <html>
      <head><title>活动页面</title></head>
      <body>
        <div class="screen">
          <section class="campaign">
            <article class="reward-card"><strong>每日任务</strong></article>
          </section>
        </div>
      </body>
    </html>
  `, [], dimensions);

  assert.match(
    result.html,
    /<main class="fit-shell"><div class="fit-box"><div class="screen">/
  );
  assert.match(
    result.html,
    /<section class="campaign">\s*<article class="reward-card"><strong>每日任务<\/strong><\/article>\s*<\/section>/
  );
});

test("semantic sanitizer removes unsafe behavior without flattening the component", () => {
  const result = sanitizeFastGeneratedHtml(`
    <html><head><title>Safe</title></head><body><div class="screen">
      <article class="card" onclick="steal()">
        <img class="trusted" data-reference-asset="trusted" src="https://bad.test/a.png" onerror="steal()">
        <img class="unknown" src="https://bad.test/b.png">
        <script>steal()</script>
      </article>
    </div></body></html>
  `, [{
    id: "trusted",
    name: "Trusted",
    placement: { x: 10, y: 20, width: 30, height: 40 }
  }], dimensions);

  assert.match(result.html, /<article class="card">/);
  assert.match(result.html, /class="trusted"/);
  assert.doesNotMatch(result.html, /onclick|onerror|bad\.test|<script/i);
  assert.doesNotMatch(result.html, /class="unknown"/);
});

test("fast sanitizer removes invented images and duplicate known anchors", () => {
  const source = `<html><head></head><body><div class="screen"><img src="https://bad.test/a.png"><img src="data:image/png;base64,INVENTED"><img data-reference-asset="logo" src="asset:logo"><img data-reference-asset="logo" src="asset:logo"></div></body></html>`;

  const result = sanitizeFastGeneratedHtml(source, [{
    id: "logo",
    name: "Logo",
    radius: 0,
    placement: { x: 0, y: 0, width: 20, height: 20 }
  }], dimensions);

  assert.equal((result.html.match(/<img\b/g) || []).length, 1);
  assert.equal((result.html.match(/data-reference-asset="logo"/g) || []).length, 1);
  assert.doesNotMatch(result.html, /INVENTED|bad\.test/);
});

test("fast sanitizer injects missing known anchors and reports the fallback", () => {
  const result = sanitizeFastGeneratedHtml(
    `<html><head></head><body><div class="screen"><p>Text</p></div></body></html>`,
    [{
      id: "hero",
      name: "Hero",
      radius: 8,
      placement: { x: 5, y: 6, width: 70, height: 80 }
    }],
    dimensions
  );

  assert.equal(result.missingReferenceAnchorCount, 1);
  assert.equal(result.referenceAnchorCount, 1);
  assert.equal((result.html.match(/data-reference-asset="hero"/g) || []).length, 1);
  assert.match(result.html, /class="plugin-reference-fallback plugin-reference-fallback-1"/);
  assert.match(result.html, /\.plugin-reference-fallback-1\{[^}]*left:5px!important/);
  assert.deepEqual(result.qualityWarnings, ["模型遗漏 1 个切图锚点，已按人工坐标补入。"]);
});

test("fast sanitizer emits canonical anchors for all 60 descriptors", () => {
  const assets = Array.from({ length: 60 }, (_, index) => ({
    id: `asset_${index}`,
    name: `Asset ${index}`,
    radius: 0,
    placement: { x: index, y: index, width: 20, height: 20 }
  }));

  const result = sanitizeFastGeneratedHtml(
    `<html><head></head><body><div class="screen"></div></body></html>`,
    assets,
    dimensions
  );

  assert.equal(result.referenceAnchorCount, 60);
  assert.equal((result.html.match(/src="asset:/g) || []).length, 60);
  assert.doesNotMatch(result.html, /data:image\//);
});

test("fast sanitizer removes executable markup and handlers", () => {
  const source = `<html><head></head><body onload="alert(1)"><script>alert(1)</script><iframe src="x"></iframe><object></object><embed src="x"><div class="screen"><a href="javascript:alert(1)" onclick="bad()">Link</a></div></body></html>`;

  const result = sanitizeFastGeneratedHtml(source, [], dimensions);

  assert.doesNotMatch(result.html, /<script|<iframe|<object|<embed|onload=|onclick=|javascript:/i);
});

test("fast sanitizer removes CSS imports and remote URLs while preserving local SVG paint references", () => {
  const source = `<html><head>
    <style>
      @import url("https://bad.test/theme.css");
      @import "./relative.css" screen;
      .screen {
        background-image: linear-gradient(#fff, #eee), url(https://bad.test/background.png);
        box-shadow: 0 4px 12px rgba(0,0,0,.2);
      }
      .shape { fill: url(#paint0); filter: url("#shadow0"); }
    </style>
  </head><body><div class="screen" style="background:url('../bad.png');border-radius:16px">
    <svg viewBox="0 0 10 10">
      <defs>
        <linearGradient id="paint0"><stop offset="0" stop-color="#fff"/></linearGradient>
        <filter id="shadow0"><feGaussianBlur stdDeviation="1"/></filter>
      </defs>
      <rect class="shape" width="10" height="10"/>
      <circle fill="url(https://bad.test/paint.svg#paint)" r="4"/>
    </svg>
  </div></body></html>`;

  const result = sanitizeFastGeneratedHtml(source, [], dimensions);

  assert.doesNotMatch(result.html, /@import|bad\.test|relative\.css|\.\.\/bad\.png/i);
  assert.match(result.html, /linear-gradient\(#fff, #eee\)/);
  assert.match(result.html, /box-shadow:\s*0 4px 12px/);
  assert.match(result.html, /fill:\s*url\(#paint0\)/);
  assert.match(result.html, /filter:\s*url\(["']?#shadow0["']?\)/);
  assert.match(result.html, /border-radius:\s*16px/);
});

test("fast sanitizer removes document redirects, external resource tags, and alternate execution elements", () => {
  const source = `<html><head>
    <meta http-equiv="refresh" content="0;url=https://bad.test">
    <meta name="theme-color" content="#fff">
    <link rel="stylesheet" href="https://bad.test/theme.css">
    <base href="https://bad.test/">
  </head><body><div class="screen">
    <a class="safe-fragment" href="#details">Details</a>
    <a class="remote" href="https://bad.test/next">Remote</a>
    <form action="/submit"><button formaction="//bad.test/send">Send</button></form>
    <portal src="https://bad.test/portal"></portal>
    <applet code="Bad.class"></applet>
    <frameset><frame src="https://bad.test/frame"></frameset>
    <svg viewBox="0 0 10 10">
      <defs><linearGradient id="paint"><stop offset="0" stop-color="#fff"/></linearGradient></defs>
      <rect width="10" height="10" fill="url(#paint)"/>
      <use href="https://bad.test/icons.svg#icon"/>
      <foreignObject><script>alert(1)</script></foreignObject>
      <animate attributeName="x" from="0" to="10"/>
      <set attributeName="visibility" to="hidden"/>
    </svg>
  </div></body></html>`;

  const result = sanitizeFastGeneratedHtml(source, [], dimensions);

  assert.doesNotMatch(result.html, /<link|<base|http-equiv|bad\.test|action=|formaction=/i);
  assert.doesNotMatch(result.html, /<portal|<applet|<frame|<frameset|<foreignObject|<animate|<set\b/i);
  assert.match(result.html, /<meta charset="UTF-8">/);
  assert.match(result.html, /<meta name="theme-color" content="#fff">/);
  assert.match(result.html, /class="safe-fragment" href="#details"/);
  assert.match(result.html, /<linearGradient id="paint">/);
  assert.match(result.html, /fill="url\(#paint\)"/);
});

test("fast sanitizer prevents the source-sized screen from shrinking in a flex preview", () => {
  const result = sanitizeFastGeneratedHtml(
    `<html><head></head><body><div class="screen"></div></body></html>`,
    [],
    dimensions
  );

  assert.match(result.html, /\.screen\{[^}]*width:320px!important/);
  assert.match(result.html, /\.screen\{[^}]*min-width:320px!important/);
  assert.match(result.html, /\.screen\{[^}]*height:640px!important/);
  assert.match(result.html, /\.screen\{[^}]*min-height:640px!important/);
  assert.match(result.html, /\.screen\{[^}]*flex:0 0 auto!important/);
});

test("semantic golden document preserves readable nested structure", () => {
  const source = fs.readFileSync("tests/fixtures/semantic-editable-document.html", "utf8");
  const result = sanitizeFastGeneratedHtml(source, [{
    id: "feature-icon",
    name: "功能入口",
    radius: 0,
    placement: { x: 85, y: 236, width: 100, height: 100 }
  }], {
    previewWidth: 800,
    previewHeight: 1600,
    sourceWidth: 800,
    sourceHeight: 1600
  });

  assert.match(result.html, /<title>示例活动<\/title>/);
  assert.match(result.html, /<section class="feature-panel"/);
  assert.match(result.html, /<a class="feature-link"/);
  assert.match(result.html, /<img class="feature-icon"/);
  assert.equal(result.referenceAnchorCount, 1);
});
