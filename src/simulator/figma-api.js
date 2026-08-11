function createSimulatorFigmaApi({ onPageChange } = {}) {
  let nodeSequence = 0;
  let imageSequence = 0;
  const images = new Map();

  class SimulatorNode {
    constructor(type) {
      this.id = `sim-node-${++nodeSequence}`;
      this.type = type;
      this.name = type.toLowerCase();
      this.x = 0;
      this.y = 0;
      this.width = 100;
      this.height = 100;
      this.visible = true;
      this.opacity = 1;
      this.rotation = 0;
      this.fills = [];
      this.strokes = [];
      this.strokeWeight = 0;
      this.effects = [];
      this.children = [];
      this.parent = null;
      this.removed = false;
      this.pluginData = new Map();
    }

    resize(width, height) {
      this.width = Math.max(1, Number(width) || 1);
      this.height = Math.max(1, Number(height) || 1);
    }

    appendChild(node) {
      if (!node || node === this) throw new Error("无法添加无效的模拟节点");
      node.parent?._removeChild(node);
      node.parent = this;
      this.children.push(node);
      onPageChange?.();
      return node;
    }

    _removeChild(node) {
      const index = this.children.indexOf(node);
      if (index >= 0) this.children.splice(index, 1);
    }

    remove() {
      this.parent?._removeChild(this);
      this.parent = null;
      this.removed = true;
      onPageChange?.();
    }

    setPluginData(key, value) {
      this.pluginData.set(String(key), String(value));
    }

    getPluginData(key) {
      return this.pluginData.get(String(key)) || "";
    }
  }

  const page = new SimulatorNode("PAGE");
  page.name = "Page 1";
  page.selection = [];

  const api = {
    currentPage: page,
    viewport: {
      center: { x: 0, y: 0 },
      scrollAndZoomIntoView() {
        onPageChange?.();
      }
    },
    base64Decode(value) {
      const binary = globalThis.atob(String(value || ""));
      return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    },
    createFrame() {
      return createPageNode("FRAME");
    },
    createRectangle() {
      return createPageNode("RECTANGLE");
    },
    createText() {
      const node = createPageNode("TEXT");
      node.characters = "";
      node.fontName = { family: "Inter", style: "Regular" };
      node.fontSize = 16;
      node.lineHeight = { unit: "AUTO" };
      return node;
    },
    createNodeFromSvg(svgData) {
      const node = createPageNode("VECTOR");
      node.svgData = String(svgData || "");
      return node;
    },
    createImage(bytes) {
      const hash = `sim-image-${++imageSequence}`;
      images.set(hash, Uint8Array.from(bytes || []));
      return { hash };
    },
    getImageByHash(hash) {
      const bytes = images.get(String(hash || ""));
      if (!bytes) return null;
      return {
        async getBytesAsync() {
          return Uint8Array.from(bytes);
        }
      };
    },
    group(nodes, parent) {
      const candidates = (nodes || []).filter((node) => node && !node.removed);
      if (!candidates.length) throw new Error("无法创建空的 Figma 分组");
      const minX = Math.min(...candidates.map((node) => node.x));
      const minY = Math.min(...candidates.map((node) => node.y));
      const maxX = Math.max(...candidates.map((node) => node.x + node.width));
      const maxY = Math.max(...candidates.map((node) => node.y + node.height));
      const group = createPageNode("GROUP");
      group.name = "Group";
      group.x = minX;
      group.y = minY;
      group.resize(maxX - minX, maxY - minY);
      parent.appendChild(group);
      for (const node of candidates) {
        node.x -= minX;
        node.y -= minY;
        group.appendChild(node);
      }
      return group;
    },
    async loadFontAsync() {},
    _getImageDataUrl(hash) {
      const bytes = images.get(String(hash || ""));
      if (!bytes) return "";
      return `data:${detectImageMimeType(bytes)};base64,${bytesToBase64(bytes)}`;
    }
  };

  function createPageNode(type) {
    const node = new SimulatorNode(type);
    page.appendChild(node);
    return node;
  }

  return api;
}

function detectImageMimeType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  return "image/png";
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

module.exports = {
  createSimulatorFigmaApi
};
