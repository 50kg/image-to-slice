function createHugeiconsStyleSvg(options) {
  const width = Math.max(1, Math.round(Number(options.width) || 24));
  const height = Math.max(1, Math.round(Number(options.height) || 24));
  const name = normalizeIconName(options.name);
  const color = sanitizeSvgColor(options.color || "#111318");
  const strokeWidth = Math.max(1, Math.min(5, Number(options.strokeWidth) || 2));
  const body = getHugeiconsPathBody(name);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + width + '" height="' + height + '" fill="none">',
    '<g stroke="' + color + '" stroke-width="' + strokeWidth + '" stroke-linecap="round" stroke-linejoin="round">',
    body,
    '</g>',
    '</svg>'
  ].join("");
}

function normalizeIconName(value) {
  const text = String(value || "").toLowerCase().replace(/[\s_-]+/g, "");
  const aliases = {
    favourite: "star",
    favorite: "star",
    collect: "star",
    history: "clock",
    recent: "clock",
    bookshelf: "bookmark",
    book: "bookmark",
    download: "download",
    filedownload: "download",
    file: "download",
    order: "calendarcheck",
    orders: "calendarcheck",
    task: "calendarcheck",
    cloud: "cloud",
    drive: "cloud",
    netdisk: "cloud",
    wallet: "wallet",
    money: "wallet",
    miniapp: "code",
    miniprogram: "code",
    more: "plus",
    add: "plus",
    home: "home",
    video: "play",
    play: "play",
    microphone: "mic",
    mic: "mic",
    message: "message",
    chat: "message",
    user: "user",
    profile: "user",
    search: "search",
    settings: "settings",
    scan: "scan",
    right: "chevronright",
    next: "chevronright",
    chevronright: "chevronright",
    arrowright: "arrowright",
    left: "chevronleft",
    back: "chevronleft",
    chevronleft: "chevronleft",
    arrowleft: "arrowleft",
    down: "chevrondown",
    dropdown: "chevrondown",
    chevrondown: "chevrondown",
    up: "chevronup",
    chevronup: "chevronup",
    refresh: "refresh",
    reload: "refresh"
  };
  return aliases[text] || text || "circle";
}

function sanitizeSvgColor(value) {
  const text = String(value || "#111318").trim();
  if (/^#[0-9a-fA-F]{3}$/.test(text) || /^#[0-9a-fA-F]{6}$/.test(text)) {
    return text;
  }
  return "#111318";
}

function getHugeiconsPathBody(name) {
  const icons = {
    star: '<path d="M12 3.6l2.35 4.75 5.25.76-3.8 3.7.9 5.23L12 15.57 7.3 18.04l.9-5.23-3.8-3.7 5.25-.76L12 3.6z"/>',
    clock: '<circle cx="12" cy="12" r="8.25"/><path d="M12 7.8v4.55l3.05 1.85"/>',
    bookmark: '<path d="M7.2 4.5h9.6c.66 0 1.2.54 1.2 1.2v14l-6-3.35-6 3.35v-14c0-.66.54-1.2 1.2-1.2z"/>',
    download: '<path d="M12 4.5v9.2"/><path d="M8.4 10.2l3.6 3.6 3.6-3.6"/><path d="M5.2 18.7h13.6"/>',
    calendarcheck: '<rect x="4.4" y="5.6" width="15.2" height="14" rx="3"/><path d="M8 3.8v3.6M16 3.8v3.6M4.8 9.4h14.4"/><path d="M8.6 14.4l2.1 2.1 4.6-4.8"/>',
    cloud: '<path d="M7.4 18.4h9.2a4 4 0 0 0 .5-7.96A5.6 5.6 0 0 0 6.25 9.2 4.6 4.6 0 0 0 7.4 18.4z"/>',
    wallet: '<path d="M4.2 7.4h14.9c.8 0 1.45.65 1.45 1.45v8.25c0 .8-.65 1.45-1.45 1.45H4.9c-.8 0-1.45-.65-1.45-1.45V6.9c0-.8.65-1.45 1.45-1.45h12.2"/><path d="M15.9 12.2h4.65v3.4H15.9a1.7 1.7 0 0 1 0-3.4z"/>',
    code: '<path d="M8.5 7.4L4.2 12l4.3 4.6"/><path d="M15.5 7.4l4.3 4.6-4.3 4.6"/>',
    plus: '<circle cx="12" cy="12" r="8.2"/><path d="M12 8.3v7.4M8.3 12h7.4"/>',
    home: '<path d="M4.2 11.4L12 4.8l7.8 6.6"/><path d="M6.4 10.2v8.4h11.2v-8.4"/><path d="M9.8 18.6v-5.2h4.4v5.2"/>',
    play: '<circle cx="12" cy="12" r="8.25"/><path d="M10.2 8.8l5.1 3.2-5.1 3.2V8.8z"/>',
    mic: '<path d="M12 4.2a3 3 0 0 0-3 3v4.2a3 3 0 0 0 6 0V7.2a3 3 0 0 0-3-3z"/><path d="M6.8 11.2a5.2 5.2 0 0 0 10.4 0"/><path d="M12 16.4v3.4M9.2 19.8h5.6"/>',
    message: '<path d="M5.2 5.4h13.6c.88 0 1.6.72 1.6 1.6v8.4c0 .88-.72 1.6-1.6 1.6H9.1l-4.3 3v-13c0-.88.72-1.6 1.6-1.6z"/><path d="M8.2 10h7.6M8.2 13.2h4.8"/>',
    user: '<circle cx="12" cy="8.6" r="3.5"/><path d="M5.4 19.4c1.25-3.25 3.45-4.85 6.6-4.85s5.35 1.6 6.6 4.85"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.2"/><path d="M15.4 15.4l4.2 4.2"/>',
    settings: '<path d="M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z"/><path d="M19.1 13.6v-3.2l-2.05-.45a6.2 6.2 0 0 0-.65-1.55l1.15-1.75-2.25-2.25-1.75 1.15c-.5-.28-1.02-.5-1.55-.65L11.6 2.9H8.4l-.45 2.05c-.53.15-1.05.37-1.55.65L4.65 4.45 2.4 6.7 3.55 8.45c-.28.5-.5 1.02-.65 1.55L.9 10.4v3.2l2 .45c.15.53.37 1.05.65 1.55L2.4 17.35l2.25 2.25 1.75-1.15c.5.28 1.02.5 1.55.65l.45 2.05h3.2l.45-2.05c.53-.15 1.05-.37 1.55-.65l1.75 1.15 2.25-2.25-1.15-1.75c.28-.5.5-1.02.65-1.55l2.05-.45z"/>',
    scan: '<path d="M5.2 8V5.2H8M16 5.2h2.8V8M18.8 16v2.8H16M8 18.8H5.2V16"/><path d="M8 12h8"/>',
    chevronright: '<path d="M9 5.2l6.8 6.8L9 18.8"/>',
    chevronleft: '<path d="M15 5.2L8.2 12 15 18.8"/>',
    chevrondown: '<path d="M5.2 9l6.8 6.8L18.8 9"/>',
    chevronup: '<path d="M5.2 15l6.8-6.8L18.8 15"/>',
    arrowright: '<path d="M4.5 12h14"/><path d="M13.2 6.2L19 12l-5.8 5.8"/>',
    arrowleft: '<path d="M19.5 12h-14"/><path d="M10.8 6.2L5 12l5.8 5.8"/>',
    refresh: '<path d="M18.4 9.1a6.5 6.5 0 1 0 1 4.1"/><path d="M18.8 4.8v4.4h-4.4"/>',
    circle: '<circle cx="12" cy="12" r="7.8"/>'
  };
  return icons[name] || icons.circle;
}

module.exports = {
  createHugeiconsStyleSvg,
  normalizeIconName,
  sanitizeSvgColor,
  getHugeiconsPathBody
};
