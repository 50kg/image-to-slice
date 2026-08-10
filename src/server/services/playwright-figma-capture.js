const sharp = require("sharp");

const CDP_COMPUTED_STYLES = [
  "display",
  "position",
  "background-color",
  "background-image",
  "clip-path",
  "filter",
  "mask-image",
  "mix-blend-mode"
];

function createPlaywrightFigmaCaptureService({
  chromium,
  captureRuntime
}) {
  if (!chromium?.launch) {
    throw new Error("Playwright Chromium 未配置");
  }
  if (!String(captureRuntime || "").trim()) {
    throw new Error("figma-capture.js runtime 未配置");
  }

  let browserPromise = null;

  async function getBrowser() {
    if (!browserPromise) {
      browserPromise = chromium.launch({ headless: true });
    }
    return browserPromise;
  }

  async function capture(payload = {}) {
    const html = String(payload.html || "");
    const width = Math.round(Number(payload.width));
    const height = Math.round(Number(payload.height));
    if (!html.trim()) {
      throw badRequest("高保真捕获缺少 HTML");
    }
    if (
      !Number.isFinite(width)
      || width < 1
      || !Number.isFinite(height)
      || height < 1
    ) {
      throw badRequest("高保真捕获缺少有效画板尺寸");
    }

    const browser = await getBrowser();
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1
    });
    try {
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await waitForPageResources(page);
      await assertScreenSize(page, { width, height });

      const cdp = await context.newCDPSession(page);
      const snapshot = await cdp.send("DOMSnapshot.captureSnapshot", {
        computedStyles: CDP_COMPUTED_STYLES,
        includePaintOrder: true,
        includeDOMRects: true
      });
      const cdpPseudoNodeCount = (
        snapshot.documents?.[0]?.nodes?.pseudoType?.index || []
      ).length;

      const enhancement = await enhancePseudoLayers({
        context,
        page
      });
      const complexEnhancement = await enhanceComplexDomLayers({
        context,
        page
      });
      await page.addScriptTag({ content: captureRuntime });
      const rawCapture = await page.evaluate(() =>
        window.figma.captureRawForDesign(".screen")
      );
      const parsedCapture = typeof rawCapture === "string"
        ? JSON.parse(rawCapture)
        : rawCapture;
      if (!parsedCapture?.root?.rect) {
        throw new Error("Playwright 高保真捕获没有返回有效 DOM 数据");
      }
      attachEditableConicGradients(
        parsedCapture,
        complexEnhancement.layers
      );

      return {
        capture: parsedCapture,
        diagnostics: {
          cdpPseudoNodeCount,
          textPseudoLayers: enhancement.textLayers.length,
          inlinePseudoLayers: enhancement.layers.filter(
            (layer) => layer.mode === "inline-pseudo"
          ).length,
          hostDecorationLayers: enhancement.layers.filter(
            (layer) => layer.mode === "host-decoration"
          ).length,
          complexDomLayers: complexEnhancement.layers.filter(
            (layer) => layer.mode === "complex-dom"
          ).length,
          complexBackgroundLayers: complexEnhancement.layers.filter(
            (layer) => layer.mode === "complex-background"
          ).length,
          editableConicLayers: complexEnhancement.layers.filter(
            (layer) => layer.mode === "editable-conic"
          ).length,
          layers: [
            ...enhancement.layers,
            ...complexEnhancement.layers
          ]
        }
      };
    } finally {
      await context.close();
    }
  }

  async function close() {
    const activeBrowser = await browserPromise;
    browserPromise = null;
    if (activeBrowser) {
      await activeBrowser.close();
    }
  }

  return {
    capture,
    close
  };
}

async function enhancePseudoLayers({ context, page }) {
  const plan = await createPseudoCapturePlan(page);
  if (!plan.layers.length) {
    return { layers: [], textLayers: [] };
  }

  const isolatedPage = await context.newPage();
  const layers = [];
  const textLayers = plan.layers.filter(
    (layer) => layer.mode === "inline-text"
  );
  try {
    for (const layer of plan.layers.filter(
      (item) => item.mode !== "inline-text"
    )) {
      const png = layer.mode === "host-decoration"
        ? await captureHostDecorationLayer(isolatedPage, layer)
        : await captureInlinePseudoLayer(isolatedPage, layer);
      const alpha = await analyzePngAlpha(png);
      if (!alpha.visiblePixelCount) {
        continue;
      }
      const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
      await applyRasterLayer(page, layer, dataUrl);
      layers.push({
        id: layer.id,
        mode: layer.mode,
        pseudo: layer.pseudo || "",
        bounds: layer.bounds,
        ...alpha
      });
    }
  } finally {
    await isolatedPage.close();
  }
  await waitForPageResources(page);
  return { layers, textLayers };
}

async function enhanceComplexDomLayers({ context, page }) {
  const plan = await createComplexDomCapturePlan(page);
  if (!plan.layers.length) {
    return { layers: [] };
  }

  const editableLayers = plan.layers.filter(
    (layer) => layer.mode === "editable-conic"
  );
  const rasterLayers = plan.layers.filter(
    (layer) => layer.mode !== "editable-conic"
  );
  const isolatedPage = await context.newPage();
  const capturedLayers = [];
  try {
    for (const layer of rasterLayers) {
      const png = layer.mode === "complex-background"
        ? await captureComplexBackgroundLayer(isolatedPage, layer)
        : await page.locator(
          `[data-codex-playwright-complex-layer="${layer.id}"]`
        ).screenshot({
          animations: "disabled",
          omitBackground: true
        });
      const alpha = await analyzePngAlpha(png);
      if (!alpha.visiblePixelCount) {
        continue;
      }
      capturedLayers.push({
        ...layer,
        dataUrl: `data:image/png;base64,${png.toString("base64")}`,
        alpha
      });
    }
  } finally {
    await isolatedPage.close();
  }

  for (const layer of [...capturedLayers].reverse()) {
    await applyComplexDomRasterLayer(page, layer);
  }
  await waitForPageResources(page);
  return {
    layers: [
      ...editableLayers,
      ...capturedLayers.map(({ dataUrl, alpha, ...layer }) => ({
        ...layer,
        ...alpha
      }))
    ]
  };
}

function attachEditableConicGradients(capture, layers) {
  const editableLayers = layers.filter(
    (layer) => layer.mode === "editable-conic" && layer.gradient
  );
  if (!editableLayers.length) {
    return;
  }
  const rootRect = capture.root.rect;
  const candidates = [];
  const visit = (node) => {
    if (
      node?.nodeType === 1
      && /conic-gradient/i.test(String(node.styles?.backgroundImage || ""))
      && node.rect
    ) {
      candidates.push(node);
    }
    for (const child of node?.childNodes || []) {
      visit(child);
    }
  };
  visit(capture.root);
  const claimed = new Set();
  for (const layer of editableLayers) {
    const match = candidates.find((node, index) => (
      !claimed.has(index)
      && Math.abs((node.rect.x - rootRect.x) - layer.bounds.x) <= 0.5
      && Math.abs((node.rect.y - rootRect.y) - layer.bounds.y) <= 0.5
      && Math.abs(node.rect.width - layer.bounds.width) <= 0.5
      && Math.abs(node.rect.height - layer.bounds.height) <= 0.5
      && String(node.styles?.backgroundImage || "") === layer.sourceBackground
    ));
    if (!match) continue;
    claimed.add(candidates.indexOf(match));
    match.editableGradient = layer.gradient;
  }
}

async function captureComplexBackgroundLayer(page, layer) {
  const width = Math.max(1, Math.ceil(layer.bounds.width));
  const height = Math.max(1, Math.ceil(layer.bounds.height));
  await page.setViewportSize({ width, height });
  await page.setContent("<!doctype html><html><body><div id=\"layer\"></div></body></html>");
  await page.evaluate(({ background, width, height }) => {
    const element = document.querySelector("#layer");
    document.documentElement.style.cssText = "margin:0;background:transparent";
    document.body.style.cssText = "margin:0;background:transparent";
    element.style.cssText = [
      "position:absolute",
      "left:0",
      "top:0",
      `width:${width}px`,
      `height:${height}px`,
      "box-sizing:border-box"
    ].join(";");
    element.style.backgroundImage = background.image;
    element.style.backgroundColor = background.color;
    element.style.backgroundPosition = background.position;
    element.style.backgroundSize = background.size;
    element.style.backgroundRepeat = background.repeat;
    element.style.backgroundOrigin = background.origin;
    element.style.backgroundClip = background.clip;
    element.style.backgroundAttachment = background.attachment;
    element.style.backgroundBlendMode = background.blendMode;
    element.style.borderRadius = background.borderRadius;
  }, {
    background: layer.background,
    width: layer.bounds.width,
    height: layer.bounds.height
  });
  return page.locator("#layer").screenshot({
    animations: "disabled",
    omitBackground: true
  });
}

async function createComplexDomCapturePlan(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".screen");
    if (!root) {
      throw new Error("高保真捕获页面缺少 .screen");
    }
    const isSvgRootWithComplexPaint = (element) => {
      if (element.tagName.toLowerCase() !== "svg") return false;
      return Boolean(
        element.matches("[filter],[mask]")
        || element.querySelector("[filter],[mask],filter,mask")
      );
    };
    const hasUnsupportedComplexPaint = (element, style) => {
      const tag = element.tagName.toLowerCase();
      return (
        tag === "canvas"
        || isSvgRootWithComplexPaint(element)
        || (style.filter && style.filter !== "none")
        || (
          style.backdropFilter
          && style.backdropFilter !== "none"
        )
        || (
          style.webkitBackdropFilter
          && style.webkitBackdropFilter !== "none"
        )
        || (style.maskImage && style.maskImage !== "none")
        || (
          style.webkitMaskImage
          && style.webkitMaskImage !== "none"
        )
        || (
          style.mixBlendMode
          && style.mixBlendMode !== "normal"
        )
      );
    };
    const hasUnsupportedComplexBackground = (style) => (
      /(?:conic-gradient|repeating-(?:linear|radial|conic)-gradient)\(/i
        .test(String(style.backgroundImage || ""))
    );
    const splitFunctionArgs = (value) => {
      const parts = [];
      let current = "";
      let depth = 0;
      for (const character of String(value || "")) {
        if (character === "(") depth += 1;
        if (character === ")") depth = Math.max(0, depth - 1);
        if (character === "," && depth === 0) {
          parts.push(current.trim());
          current = "";
        } else {
          current += character;
        }
      }
      if (current.trim()) parts.push(current.trim());
      return parts;
    };
    const clampByte = (value) => Math.round(
      Math.min(255, Math.max(0, Number(value) || 0))
    );
    const parseComputedColor = (value) => {
      const text = String(value || "").trim();
      const hex = text.match(/^#([0-9a-f]{3,8})$/i);
      if (hex) {
        let digits = hex[1];
        if (digits.length === 3 || digits.length === 4) {
          digits = digits.split("").map((digit) => digit + digit).join("");
        }
        if (digits.length !== 6 && digits.length !== 8) return null;
        return {
          color: `#${digits.slice(0, 6).toLowerCase()}`,
          opacity: digits.length === 8
            ? Number.parseInt(digits.slice(6, 8), 16) / 255
            : 1
        };
      }
      const rgb = text.match(/^rgba?\((.*)\)$/i);
      if (!rgb) return null;
      const sections = rgb[1].split("/").map((part) => part.trim());
      const channels = sections[0].includes(",")
        ? sections[0].split(",").map((part) => part.trim())
        : sections[0].split(/\s+/).filter(Boolean);
      let alpha = sections[1];
      if (channels.length === 4 && alpha === undefined) {
        alpha = channels.pop();
      }
      if (channels.length !== 3) return null;
      const bytes = channels.map((channel) => channel.endsWith("%")
        ? clampByte(Number.parseFloat(channel) * 2.55)
        : clampByte(Number.parseFloat(channel)));
      const opacity = alpha === undefined
        ? 1
        : Math.min(1, Math.max(0, Number.parseFloat(alpha) || 0));
      return {
        color: `#${bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`,
        opacity
      };
    };
    const parseStopPosition = (value) => {
      const match = String(value || "").trim().match(
        /^(-?\d+(?:\.\d+)?)(deg|%|turn)$/i
      );
      if (!match) return null;
      const number = Number.parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      const position = unit === "%"
        ? number / 100
        : unit === "turn"
          ? number
          : number / 360;
      return Number.isFinite(position) && position >= 0 && position <= 1
        ? Number(position.toFixed(6))
        : null;
    };
    const parseSimpleConicGradient = (style) => {
      if (style.clipPath && style.clipPath !== "none") return null;
      const image = String(style.backgroundImage || "").trim();
      if (!/^conic-gradient\([\s\S]*\)$/i.test(image)) return null;
      const inner = image.replace(/^conic-gradient\(/i, "").replace(/\)$/, "");
      const parts = splitFunctionArgs(inner);
      if (parts.length < 2) return null;
      let angle = 0;
      if (/^from\s+/i.test(parts[0])) {
        const header = parts.shift().match(
          /^from\s+(-?\d+(?:\.\d+)?)(deg|turn)$/i
        );
        if (!header) return null;
        angle = header[2].toLowerCase() === "turn"
          ? Number.parseFloat(header[1]) * 360
          : Number.parseFloat(header[1]);
      }
      const stops = parts.map((part) => {
        const colorMatch = part.match(/^(rgba?\([^)]*\)|#[0-9a-f]{3,8})\s+(.+)$/i);
        if (!colorMatch) return null;
        const color = parseComputedColor(colorMatch[1]);
        const position = parseStopPosition(colorMatch[2]);
        return color && position !== null ? { ...color, position } : null;
      });
      if (
        stops.some((stop) => !stop)
        || stops.length < 2
        || stops.some((stop, index) => (
          index > 0 && stop.position < stops[index - 1].position
        ))
      ) {
        return null;
      }
      const backgroundColor = parseComputedColor(style.backgroundColor);
      if (
        backgroundColor?.opacity > 0
        && stops.some((stop) => stop.opacity < 0.999)
      ) {
        return null;
      }
      return {
        type: "angular",
        angle,
        stops
      };
    };
    const candidates = [...root.querySelectorAll("*")].map((element) => {
      if (
        element.hasAttribute("data-codex-playwright-pseudo-layer")
        || element.hasAttribute("data-codex-playwright-decoration-layer")
      ) {
        return null;
      }
      const style = getComputedStyle(element);
      if (
        style.display === "none"
        || style.visibility === "hidden"
        || Number(style.opacity || 1) <= 0.01
      ) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      if (hasUnsupportedComplexPaint(element, style)) {
        return { element, mode: "complex-dom" };
      }
      const editableGradient = parseSimpleConicGradient(style);
      if (editableGradient) {
        return { element, mode: "editable-conic", editableGradient };
      }
      if (hasUnsupportedComplexBackground(style)) {
        return { element, mode: "complex-background" };
      }
      return null;
    }).filter(Boolean);
    const selected = [];
    for (const candidate of candidates) {
      if (selected.some((ancestor) => (
        ancestor.mode === "complex-dom"
        && ancestor.element.contains(candidate.element)
      ))) {
        continue;
      }
      selected.push(candidate);
    }

    const rootRect = root.getBoundingClientRect();
    return {
      layers: selected.map(({ element, mode, editableGradient }, index) => {
        const id = `${mode}-${index + 1}`;
        element.setAttribute("data-codex-playwright-complex-layer", id);
        let anchor = element;
        while (anchor.parentElement && anchor.parentElement !== root) {
          anchor = anchor.parentElement;
        }
        const anchorId = `complex-anchor-${index + 1}`;
        anchor.setAttribute(
          "data-codex-playwright-complex-anchor",
          anchorId
        );
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          id,
          anchorId,
          mode,
          tag: element.tagName.toLowerCase(),
          bounds: {
            x: rect.x - rootRect.x,
            y: rect.y - rootRect.y,
            width: rect.width,
            height: rect.height
          },
          background: mode === "complex-background" ? {
            image: style.backgroundImage,
            color: style.backgroundColor,
            position: style.backgroundPosition,
            size: style.backgroundSize,
            repeat: style.backgroundRepeat,
            origin: style.backgroundOrigin,
            clip: style.backgroundClip,
            attachment: style.backgroundAttachment,
            blendMode: style.backgroundBlendMode,
            borderRadius: style.borderRadius
          } : null,
          gradient: mode === "editable-conic" ? editableGradient : null,
          sourceBackground: mode === "editable-conic"
            ? style.backgroundImage
            : "",
          zIndex: style.zIndex === "auto" ? "" : style.zIndex
        };
      })
    };
  });
}

async function applyComplexDomRasterLayer(page, layer) {
  await page.evaluate(async ({ layer }) => {
    const original = document.querySelector(
      `[data-codex-playwright-complex-layer="${layer.id}"]`
    );
    const anchor = document.querySelector(
      `[data-codex-playwright-complex-anchor="${layer.anchorId}"]`
    );
    const root = document.querySelector(".screen");
    if (!original || !anchor || !root) return;

    if (layer.mode === "complex-background") {
      original.style.setProperty("background-image", "none", "important");
      original.style.setProperty("background-color", "transparent", "important");
      if (getComputedStyle(original).position === "static") {
        original.style.setProperty("position", "relative", "important");
      }
      const image = document.createElement("img");
      image.src = layer.dataUrl;
      image.alt = "";
      image.setAttribute(
        "data-codex-playwright-complex-background-raster",
        layer.id
      );
      image.style.cssText = [
        "position:absolute",
        "left:0",
        "top:0",
        "width:100%",
        "height:100%",
        "display:block",
        "pointer-events:none",
        "object-fit:fill",
        `border-radius:${layer.background?.borderRadius || "0px"}`
      ].join(";");
      original.insertBefore(image, original.firstChild);
      await image.decode();
      return;
    }

    original.style.setProperty("visibility", "hidden", "important");
    const image = document.createElement("img");
    image.src = layer.dataUrl;
    image.alt = "";
    image.setAttribute("data-codex-playwright-complex-raster", layer.id);
    image.style.cssText = [
      "position:absolute",
      `left:${layer.bounds.x}px`,
      `top:${layer.bounds.y}px`,
      `width:${layer.bounds.width}px`,
      `height:${layer.bounds.height}px`,
      "display:block",
      "pointer-events:none",
      "object-fit:fill"
    ].join(";");
    if (layer.zIndex) {
      image.style.zIndex = layer.zIndex;
    }
    anchor.insertAdjacentElement("afterend", image);
    await image.decode();
  }, { layer });
}

async function createPseudoCapturePlan(page) {
  return page.evaluate(async () => {
    const root = document.querySelector(".screen");
    if (!root) {
      throw new Error("高保真捕获页面缺少 .screen");
    }
    const readStyle = (style) => [...style].map((property) => ({
      property,
      value: style.getPropertyValue(property),
      priority: style.getPropertyPriority(property)
    }));
    const decodeQuotedContent = (value) => {
      const content = String(value || "").trim();
      if (
        content.length < 2
        || !["\"", "'"].includes(content[0])
        || content.at(-1) !== content[0]
      ) {
        return "";
      }
      return content.slice(1, -1)
        .replace(/\\([0-9a-f]{1,6})\s?/gi, (_, code) =>
          String.fromCodePoint(Number.parseInt(code, 16))
        )
        .replace(/\\a\s?/gi, "\n")
        .replace(/\\(["'\\])/g, "$1");
    };
    const hasVisibleBackground = (style) => {
      const backgroundImage = String(style.backgroundImage || "");
      const backgroundColor = String(style.backgroundColor || "");
      return (
        backgroundImage !== "none"
        || (
          backgroundColor
          && backgroundColor !== "transparent"
          && !/rgba?\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(backgroundColor)
        )
      );
    };
    const hasVisibleBorder = (style) => (
      ["Top", "Right", "Bottom", "Left"].some((side) => (
        Number.parseFloat(style[`border${side}Width`] || "0") > 0
        && style[`border${side}Style`] !== "none"
      ))
    );
    const hasPrivateUseCharacter = (value) => [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return (
        (codePoint >= 0xe000 && codePoint <= 0xf8ff)
        || (codePoint >= 0xf0000 && codePoint <= 0xffffd)
        || (codePoint >= 0x100000 && codePoint <= 0x10fffd)
      );
    });
    const extractContentImageUrl = (value) => {
      const match = String(value || "").trim().match(/^url\((.*)\)$/i);
      if (!match) return "";
      const candidate = match[1].trim();
      if (
        candidate.length >= 2
        && ["\"", "'"].includes(candidate[0])
        && candidate.at(-1) === candidate[0]
      ) {
        return candidate.slice(1, -1);
      }
      return candidate;
    };
    const hasComplexVisualPaint = (style, content, text) => {
      const contentUsesImage = /^(?:url|image|image-set|linear-gradient|radial-gradient)\(/i.test(
        content
      );
      const iconFont = (
        /(?:icon|awesome|icomoon|material\s*(?:icons|symbols))/i.test(
          String(style.fontFamily || "")
        )
        || hasPrivateUseCharacter(text)
      );
      return (
        contentUsesImage
        || iconFont
        || hasVisibleBackground(style)
        || hasVisibleBorder(style)
        || (style.boxShadow && style.boxShadow !== "none")
        || (style.textShadow && style.textShadow !== "none")
        || (
          Number.parseFloat(style.outlineWidth || "0") > 0
          && style.outlineStyle !== "none"
        )
        || (style.filter && style.filter !== "none")
        || (style.clipPath && style.clipPath !== "none")
        || (style.maskImage && style.maskImage !== "none")
        || (style.webkitMaskImage && style.webkitMaskImage !== "none")
      );
    };
    const classifyPseudo = (style) => {
      const content = String(style.content || "").trim().toLowerCase();
      if (
        !content
        || content === "none"
        || content === "normal"
        || style.display === "none"
        || style.visibility === "hidden"
        || Number(style.opacity || 1) <= 0.01
      ) {
        return null;
      }
      const originalContent = String(style.content || "").trim();
      const text = decodeQuotedContent(originalContent);
      return {
        mode: text && !hasComplexVisualPaint(
          style,
          originalContent,
          text
        )
          ? "inline-text"
          : "inline-pseudo",
        text,
        contentImageUrl: extractContentImageUrl(originalContent)
      };
    };
    const elements = [root, ...root.querySelectorAll("*")];
    const owners = [];
    let ownerIndex = 0;
    for (const owner of elements) {
      const pseudos = [];
      for (const pseudo of ["::before", "::after"]) {
        const style = getComputedStyle(owner, pseudo);
        const classification = classifyPseudo(style);
        if (classification) {
          pseudos.push({
            pseudo,
            mode: classification.mode,
            text: classification.text,
            contentImageUrl: classification.contentImageUrl,
            declarations: readStyle(style)
          });
        }
      }
      if (!pseudos.length) continue;
      const id = `pseudo-owner-${++ownerIndex}`;
      owner.setAttribute("data-codex-playwright-pseudo-owner", id);
      const ownerStyle = getComputedStyle(owner);
      const hasMeaningfulContent = [...owner.childNodes].some((node) => (
        node.nodeType === Node.ELEMENT_NODE
        || (
          node.nodeType === Node.TEXT_NODE
          && String(node.textContent || "").trim()
        )
      ));
      const rasterPseudos = pseudos.filter(
        (pseudo) => pseudo.mode === "inline-pseudo"
      );
      const promoteHost = (
        !pseudos.some((pseudo) => pseudo.mode === "inline-text")
        && !hasMeaningfulContent
        && (
          rasterPseudos.length > 1
        || Number(ownerStyle.opacity || 1) < 0.999
        || ownerStyle.filter !== "none"
        || ownerStyle.clipPath !== "none"
        || ownerStyle.overflow === "hidden"
        )
      );
      owners.push({
        id,
        promoteHost,
        ownerDeclarations: readStyle(ownerStyle),
        pseudos
      });
    }

    const disableStyle = document.createElement("style");
    disableStyle.setAttribute("data-codex-playwright-pseudo-disable", "");
    disableStyle.textContent = owners.flatMap(({ id }) => [
      `[data-codex-playwright-pseudo-owner="${id}"]::before{content:none!important}`,
      `[data-codex-playwright-pseudo-owner="${id}"]::after{content:none!important}`
    ]).join("\n");
    document.head.appendChild(disableStyle);

    const layers = [];
    for (const ownerPlan of owners) {
      const owner = document.querySelector(
        `[data-codex-playwright-pseudo-owner="${ownerPlan.id}"]`
      );
      if (!owner) continue;
      if (ownerPlan.promoteHost) {
        const rect = owner.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          layers.push({
            id: ownerPlan.id,
            mode: "host-decoration",
            bounds: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            },
            ownerDeclarations: ownerPlan.ownerDeclarations,
            pseudos: ownerPlan.pseudos
          });
        }
        continue;
      }

      for (const pseudoPlan of ownerPlan.pseudos) {
        const node = document.createElement("span");
        const pseudoName = pseudoPlan.pseudo.slice(2);
        const layerId = `${ownerPlan.id}-${pseudoName}`;
        node.setAttribute("aria-hidden", "true");
        node.setAttribute("data-codex-playwright-pseudo-layer", layerId);
        node.textContent = pseudoPlan.text || "";
        for (const { property, value, priority } of pseudoPlan.declarations) {
          if (value) node.style.setProperty(property, value, priority || "");
        }
        if (pseudoPlan.contentImageUrl) {
          node.style.setProperty(
            "background-image",
            `url(${JSON.stringify(pseudoPlan.contentImageUrl)})`,
            "important"
          );
          node.style.setProperty("background-size", "100% 100%", "important");
          node.style.setProperty("background-repeat", "no-repeat", "important");
        }
        node.style.setProperty("content", "none", "important");
        node.style.setProperty("pointer-events", "none", "important");
        if (pseudoPlan.pseudo === "::before") {
          owner.insertBefore(node, owner.firstChild);
        } else {
          owner.appendChild(node);
        }
        layers.push({
          id: layerId,
          ownerId: ownerPlan.id,
          mode: pseudoPlan.mode,
          pseudo: pseudoPlan.pseudo,
          text: pseudoPlan.text,
          contentImageUrl: pseudoPlan.contentImageUrl,
          declarations: pseudoPlan.declarations
        });
      }
    }

    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
    return {
      layers: layers.map((layer) => {
        if (layer.mode === "host-decoration") return layer;
        const node = document.querySelector(
          `[data-codex-playwright-pseudo-layer="${layer.id}"]`
        );
        const rect = node?.getBoundingClientRect();
        return {
          ...layer,
          bounds: rect
            ? {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              }
            : null
        };
      }).filter((layer) => (
        layer.bounds?.width > 0 && layer.bounds?.height > 0
      ))
    };
  });
}

async function captureInlinePseudoLayer(page, layer) {
  const width = stylePixelValue(layer.declarations, "width", layer.bounds.width);
  const height = stylePixelValue(
    layer.declarations,
    "height",
    layer.bounds.height
  );
  const padding = 48;
  await page.setViewportSize({
    width: Math.max(1, Math.ceil(width + padding * 2)),
    height: Math.max(1, Math.ceil(height + padding * 2))
  });
  await page.setContent(transparentFixture('<span id="layer"></span>'));
  await page.evaluate(async ({
    declarations,
    padding: inset,
    width,
    height,
    text,
    contentImageUrl
  }) => {
    const applyStyles = (element, styles) => {
      for (const { property, value, priority } of styles || []) {
        if (value) element.style.setProperty(
          property,
          value,
          priority || ""
        );
      }
    };
    const node = document.getElementById("layer");
    node.textContent = text || "";
    applyStyles(node, declarations);
    if (contentImageUrl) {
      await new Promise((resolve) => {
        const image = new Image();
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
        image.src = contentImageUrl;
      });
      node.style.setProperty(
        "background-image",
        `url(${JSON.stringify(contentImageUrl)})`,
        "important"
      );
      node.style.setProperty("background-size", "100% 100%", "important");
      node.style.setProperty("background-repeat", "no-repeat", "important");
    }
    node.style.setProperty("content", "none", "important");
    node.style.setProperty("position", "absolute", "important");
    node.style.setProperty("left", `${inset}px`, "important");
    node.style.setProperty("top", `${inset}px`, "important");
    node.style.setProperty("right", "auto", "important");
    node.style.setProperty("bottom", "auto", "important");
    node.style.setProperty("margin", "0", "important");
    node.style.setProperty("transform", "none", "important");
    node.style.setProperty("width", `${width}px`, "important");
    node.style.setProperty("height", `${height}px`, "important");
  }, {
    declarations: layer.declarations,
    padding,
    width,
    height,
    text: layer.text,
    contentImageUrl: layer.contentImageUrl
  });
  return page.locator("#layer").screenshot({ omitBackground: true });
}

async function captureHostDecorationLayer(page, layer) {
  const width = stylePixelValue(
    layer.ownerDeclarations,
    "width",
    layer.bounds.width
  );
  const height = stylePixelValue(
    layer.ownerDeclarations,
    "height",
    layer.bounds.height
  );
  await page.setViewportSize({
    width: Math.max(1, Math.ceil(width)),
    height: Math.max(1, Math.ceil(height))
  });
  await page.setContent(transparentFixture(
    '<div id="owner"><span id="before"></span><span id="after"></span></div>'
  ));
  await page.evaluate(({ ownerDeclarations, pseudos, width, height }) => {
    const applyStyles = (element, styles) => {
      for (const { property, value, priority } of styles || []) {
        if (value) element.style.setProperty(
          property,
          value,
          priority || ""
        );
      }
    };
    const owner = document.getElementById("owner");
    const before = document.getElementById("before");
    const after = document.getElementById("after");
    applyStyles(owner, ownerDeclarations);
    const beforePlan = pseudos.find((item) => item.pseudo === "::before");
    const afterPlan = pseudos.find((item) => item.pseudo === "::after");
    if (beforePlan) applyStyles(before, beforePlan.declarations);
    else before.remove();
    if (afterPlan) applyStyles(after, afterPlan.declarations);
    else after.remove();
    owner.style.setProperty("position", "relative", "important");
    owner.style.setProperty("left", "0", "important");
    owner.style.setProperty("top", "0", "important");
    owner.style.setProperty("right", "auto", "important");
    owner.style.setProperty("bottom", "auto", "important");
    owner.style.setProperty("margin", "0", "important");
    owner.style.setProperty("transform", "none", "important");
    owner.style.setProperty("width", `${width}px`, "important");
    owner.style.setProperty("height", `${height}px`, "important");
    before?.style.setProperty("content", "none", "important");
    after?.style.setProperty("content", "none", "important");
  }, {
    ownerDeclarations: layer.ownerDeclarations,
    pseudos: layer.pseudos,
    width,
    height
  });
  return page.locator("#owner").screenshot({ omitBackground: true });
}

async function applyRasterLayer(page, layer, dataUrl) {
  await page.evaluate(async ({ layer, dataUrl }) => {
    if (layer.mode === "inline-pseudo") {
      const node = document.querySelector(
        `[data-codex-playwright-pseudo-layer="${layer.id}"]`
      );
      if (!node) return;
      node.textContent = "";
      node.style.setProperty(
        "background-image",
        `url("${dataUrl}")`,
        "important"
      );
      node.style.setProperty("background-color", "transparent", "important");
      node.style.setProperty("background-size", "100% 100%", "important");
      node.style.setProperty("background-position", "center", "important");
      node.style.setProperty("background-repeat", "no-repeat", "important");
      node.style.setProperty("clip-path", "none", "important");
      node.style.setProperty("filter", "none", "important");
      node.style.setProperty("box-shadow", "none", "important");
      node.style.setProperty("border", "0", "important");
      node.style.setProperty("opacity", "1", "important");
      return;
    }

    const owner = document.querySelector(
      `[data-codex-playwright-pseudo-owner="${layer.id}"]`
    );
    if (!owner) return;
    const position = getComputedStyle(owner).position;
    if (position === "static") {
      owner.style.setProperty("position", "relative", "important");
    }
    owner.style.setProperty("background", "none", "important");
    owner.style.setProperty("border", "0", "important");
    owner.style.setProperty("box-shadow", "none", "important");
    owner.style.setProperty("clip-path", "none", "important");
    owner.style.setProperty("filter", "none", "important");
    owner.style.setProperty("opacity", "1", "important");
    const image = document.createElement("img");
    image.src = dataUrl;
    image.alt = "";
    image.setAttribute("data-codex-playwright-decoration-layer", layer.id);
    image.style.cssText = [
      "position:absolute",
      "left:0",
      "top:0",
      "width:100%",
      "height:100%",
      "display:block",
      "pointer-events:none"
    ].join(";");
    owner.appendChild(image);
    await image.decode();
  }, { layer, dataUrl });
}

async function waitForPageResources(page) {
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await Promise.all([...document.images].map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    }));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
  });
}

async function assertScreenSize(page, target) {
  const rect = await page.locator(".screen").boundingBox();
  if (
    !rect
    || Math.abs(rect.width - target.width) > 1
    || Math.abs(rect.height - target.height) > 1
  ) {
    throw badRequest(
      `高保真捕获画板尺寸不一致：捕获 ${Math.round(rect?.width || 0)}x${Math.round(rect?.height || 0)}，预期 ${target.width}x${target.height}`
    );
  }
}

async function analyzePngAlpha(buffer) {
  const image = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let transparentPixelCount = 0;
  let visiblePixelCount = 0;
  for (let offset = 3; offset < image.data.length; offset += 4) {
    if (image.data[offset] === 0) transparentPixelCount += 1;
    if (image.data[offset] > 0) visiblePixelCount += 1;
  }
  return {
    width: image.info.width,
    height: image.info.height,
    transparentPixelCount,
    visiblePixelCount
  };
}

function stylePixelValue(declarations, property, fallback) {
  const declaration = declarations.find((item) => item.property === property);
  const value = Number.parseFloat(declaration?.value || "");
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function transparentFixture(content) {
  return [
    "<!doctype html>",
    '<html style="margin:0;background:transparent;">',
    '<body style="margin:0;background:transparent;overflow:hidden;">',
    content,
    "</body>",
    "</html>"
  ].join("");
}

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

module.exports = {
  createPlaywrightFigmaCaptureService
};
