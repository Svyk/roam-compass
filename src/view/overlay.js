import { attributeForRole, buildNeighborhood, createPlexusOpener, DROP_ROLE, inverseRole, isDrawingLike, plexusKind, plexusRegionLabels } from "../model/neighborhood.js";
import { layout, sideAt } from "../model/layout.js";
import { rankTitles } from "../model/search.js";
import { readCompassSettings, SETTING_IDS, writeSetting } from "../settings.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const SIDE_NAME = { north: "Parents", south: "Children", west: "Friends", east: "Challengers", siblings: "Siblings" };
const ENTER_FROM = { north: [0, -36], south: [0, 36], west: [-36, 0], east: [36, 0], siblings: [36, 0] };
const CLICK_DELAY = 230;
const HISTORY_CAP = 100;
const THUMB_WIDTH = 160;

function plexus() {
  const api = globalThis.window?.RoamPlexus;
  return api && api.apiVersion >= 1 ? api : null;
}

const REASONS = {
  changed: "That block changed in Roam. Compass reloaded it; try again.",
  "missing-value": "That value is no longer in its block. Compass reloaded.",
  "read-only": "That attribute belongs to another plugin. Compass does not rewrite it.",
  "text-value": "That value is text, not a link. Nothing to move.",
  "no-parent": "Compass could not find where to put the new block.",
  "no-uid": "Roam did not hand out a new block uid.",
  locked: "Another Roam tab is writing this block.",
  missing: "The source block is gone. Compass reloaded.",
  same: "It is already on that side.",
  forbidden: "Refused a write that touched derived attribute data.",
};

function guard(work) {
  return (...args) => {
    try {
      Promise.resolve(work(...args)).catch((error) => console.error("[compass]", error));
    } catch (error) {
      console.error("[compass]", error);
    }
  };
}

async function registerCommands({ extensionAPI, lifecycle, host, view }) {
  const palette = extensionAPI?.ui?.commandPalette;
  if (!palette?.addCommand || !palette?.removeCommand) throw new TypeError("A command palette is required");
  await lifecycle.command(palette, { label: "Compass: Open", callback: guard(() => view.toggle()) });
  await lifecycle.command(palette, { label: "Compass: Focus page", callback: guard(() => view.focusPage()) });
  await lifecycle.command(palette, { label: "Compass: Focus block", callback: guard(() => view.focusBlock()) });
  const menu = host.blockContextMenu?.();
  if (menu?.addCommand && menu?.removeCommand) {
    await lifecycle.command(menu, {
      label: "Compass: Focus block",
      callback: guard((info) => view.focusBlock(info?.["block-uid"])),
    });
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(className, text, label) {
  const node = el("button", className, text);
  node.type = "button";
  if (label) {
    node.title = label;
    node.setAttribute("aria-label", label);
  }
  return node;
}

function svg(tag, className) {
  const node = document.createElementNS(SVG_NS, tag);
  if (className) node.setAttribute("class", className);
  return node;
}

function visibleRows(rows, open) {
  const shown = [];
  const visible = new Set();
  for (const row of rows ?? []) {
    if (row.parentUid && (!visible.has(row.parentUid) || !open.has(row.parentUid))) continue;
    visible.add(row.uid);
    shown.push(row);
  }
  return shown;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function curve(sx, sy, ex, ey, vertical) {
  const c1 = vertical ? [sx, sy + (ey - sy) / 2] : [sx + (ex - sx) / 2, sy];
  const c2 = vertical ? [ex, ey - (ey - sy) / 2] : [ex - (ex - sx) / 2, ey];
  return {
    d: `M${sx},${sy} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${ex},${ey}`,
    mid: [(sx + 3 * c1[0] + 3 * c2[0] + ex) / 8, (sy + 3 * c1[1] + 3 * c2[1] + ey) / 8],
  };
}

function luminance(color) {
  const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(color ?? "");
  if (!match) return null;
  const [r, g, b] = match.slice(1, 4).map((value) => {
    const channel = Number(value) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function describe(item, titleOf) {
  if (item.kind === "typed") {
    const labels = item.labels?.length ? ` (${item.labels.join(", ")})` : "";
    return item.direction === "out"
      ? `${item.attribute}:: on the center${labels}`
      : `${item.attribute}:: on this node, pointing at the center${labels}`;
  }
  if (item.kind === "link") return "Linked from a block in the center's outline";
  if (item.kind === "mention") return "Links to the center from a block here";
  if (item.kind === "structural") {
    if (item.note === "namespace") return "Namespace";
    if (item.note === "day") return "Adjacent daily note";
    if (item.note === "page") return "The page this block is on";
    return "The block this block sits under";
  }
  if (item.attribute) return `Shares ${item.attribute}:: under ${titleOf(item.via) || "a parent"}`;
  if (item.note === "mentioned together") return "Mentioned in the same block";
  return item.note === "sibling block" ? "Sibling block" : "Same namespace";
}

export function mountOverlay({ extensionAPI, lifecycle, host }) {
  const doc = globalThis.document;
  if (!doc?.body || typeof doc.createElement !== "function") {
    const view = {
      repullIfOpen() {},
      toggle() { return Promise.resolve(); },
      focusPage() { return Promise.resolve(); },
      focusBlock() { return Promise.resolve(); },
    };
    return { ...view, installCommands: () => registerCommands({ extensionAPI, lifecycle, host, view }) };
  }
  return mountReal({ extensionAPI, lifecycle, host });
}

function mountReal({ extensionAPI, lifecycle, host }) {
  const root = el("div", "compass-root");
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Compass");

  const bar = el("div", "compass-bar");
  const backButton = button("compass-back", "Back", "Back (Alt+Left)");
  const forwardButton = button("compass-forward", "Forward", "Forward (Alt+Right)");
  const find = el("div", "compass-find");
  const searchInput = el("input", "compass-search");
  searchInput.type = "search";
  searchInput.autocomplete = "off";
  searchInput.placeholder = "Find a page";
  searchInput.setAttribute("aria-label", "Find a page");
  const results = el("div", "compass-results");
  results.hidden = true;
  results.setAttribute("role", "listbox");
  find.append(searchInput, results);
  const pinButton = button("compass-pin", "Pin", "Pin the center");
  const outlineButton = button("compass-outline", "Outline", "Expand the center into its blocks");
  outlineButton.setAttribute("aria-pressed", "false");
  const fitButton = button("compass-fit", "Fit", "Fit the neighborhood");
  const refreshButton = button("compass-refresh", "Refresh", "Read the graph again");
  const status = el("span", "compass-status");
  status.setAttribute("role", "status");
  const closeButton = button("compass-close", "Close", "Close (Esc)");
  bar.append(backButton, forwardButton, find, pinButton, outlineButton, fitButton, refreshButton, status, closeButton);

  const pinRow = el("div", "compass-pins");
  pinRow.hidden = true;

  const stage = el("div", "compass-stage");
  stage.tabIndex = 0;
  const world = el("div", "compass-world");
  const edgeLayer = svg("svg", "compass-edges");
  edgeLayer.setAttribute("width", "1");
  edgeLayer.setAttribute("height", "1");
  const empty = el("p", "compass-empty");
  empty.hidden = true;
  world.append(edgeLayer, empty);
  const hints = {};
  for (const side of ["north", "south", "west", "east"]) {
    const hint = el("div", `compass-hint compass-hint-${side}`);
    hint.dataset.side = side;
    hints[side] = hint;
    stage.append(hint);
  }
  stage.prepend(world);

  const menu = el("div", "compass-menu");
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  const details = el("div", "compass-details");
  details.hidden = true;
  const ghost = el("div", "compass-ghost");
  ghost.hidden = true;
  root.append(bar, pinRow, stage, menu, details, ghost);

  const nodeEls = new Map();
  const chipEls = new Map();
  const timers = new Set();
  const back = [];
  const forward = [];
  const expandedZones = new Map();
  const openRows = new Map();
  let current = null;
  let snapshot = null;
  let hood = null;
  let geometry = null;
  let settings = null;
  let nodeByUid = new Map();
  let panX = 0;
  let panY = 0;
  let zoom = 1;
  let pointer = null;
  let suppressClick = false;
  let clickTimer = null;
  let reloadTimer = null;
  let statusTimer = null;
  let searchTimer = null;
  let titleCache = null;
  let activeResult = 0;
  const thumbUrls = new Map();
  const thumbRenderTried = new Set();
  let thumbRenderChain = Promise.resolve();
  let plexusOff = null;
  let plexusApi = null;
  let plexusFramePending = false;

  function later(fn, ms) {
    const id = globalThis.setTimeout(() => {
      timers.delete(id);
      if (!lifecycle.disposed) fn();
    }, ms);
    timers.add(id);
    return id;
  }

  function cancel(id) {
    if (id == null) return null;
    globalThis.clearTimeout(id);
    timers.delete(id);
    return null;
  }

  function frame(fn) {
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf !== "function") return later(fn, 16);
    raf(() => {
      if (!lifecycle.disposed) fn();
    });
    return null;
  }

  function setStatus(text, sticky = false) {
    status.textContent = text || "";
    statusTimer = cancel(statusTimer);
    if (text && !sticky) statusTimer = later(() => { status.textContent = ""; }, 5000);
  }

  function readSettings() {
    try {
      return readCompassSettings(extensionAPI);
    } catch (error) {
      console.error("[compass] settings", error);
      return null;
    }
  }

  function titleOf(uid) {
    if (!uid) return "";
    if (uid === hood?.center?.uid) return hood.center.title;
    return nodeByUid.get(uid)?.title ?? "";
  }

  // ---- frame, theme, camera ----

  function sampleTheme() {
    const body = getComputedStyle(document.body);
    let paper = body.backgroundColor;
    if (!paper || paper === "transparent" || paper === "rgba(0, 0, 0, 0)") {
      paper = getComputedStyle(document.documentElement).backgroundColor;
    }
    if (paper && paper !== "transparent" && paper !== "rgba(0, 0, 0, 0)") root.style.setProperty("--compass-paper", paper);
    if (body.color) root.style.setProperty("--compass-ink", body.color);
    const light = luminance(paper);
    root.dataset.tone = light != null && light < 0.35 ? "dark" : "light";
  }

  function placeFrame() {
    const sidebar = document.getElementById("right-sidebar");
    const viewport = globalThis.innerWidth || 0;
    let inset = 0;
    if (sidebar?.getBoundingClientRect && viewport) {
      const width = sidebar.getBoundingClientRect().width;
      if (width > 48 && width < viewport * 0.6) inset = Math.round(width);
    }
    root.style.right = `${inset}px`;
  }

  function applyCamera(glide = false) {
    world.classList.toggle("compass-glide", glide);
    world.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    if (glide) later(() => world.classList.remove("compass-glide"), 320);
  }

  function fit(glide = true) {
    if (!geometry) return;
    const rect = stage.getBoundingClientRect();
    const { minX, minY, maxX, maxY } = geometry.bounds;
    const width = Math.max(1, maxX - minX + 48);
    const height = Math.max(1, maxY - minY + 48);
    zoom = clamp(Math.min(1, (rect.width || width) / width, (rect.height || height) / height), 0.3, 1);
    panX = -((minX + maxX) / 2) * zoom;
    panY = -((minY + maxY) / 2) * zoom;
    applyCamera(glide);
  }

  function clientToWorld(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    return {
      x: (clientX - rect.left - rect.width / 2 - panX) / zoom,
      y: (clientY - rect.top - rect.height / 2 - panY) / zoom,
    };
  }

  // ---- loading ----

  function expandedFor(uid) {
    if (!expandedZones.has(uid)) expandedZones.set(uid, new Set());
    return expandedZones.get(uid);
  }

  function rowsFor(uid) {
    if (!openRows.has(uid)) openRows.set(uid, new Set());
    return openRows.get(uid);
  }

  function rebuild() {
    if (!snapshot || !settings) return;
    hood = buildNeighborhood(snapshot, settings.model, { expanded: expandedFor(current), regionLabel: plexusRegionLabels(plexus()) });
    nodeByUid = new Map(hood.nodes.map((node) => [node.uid, node]));
  }

  function load({ navigate = false } = {}) {
    if (!current || root.hidden || lifecycle.disposed) return;
    const next = readSettings();
    if (!next) return;
    settings = next;
    try {
      snapshot = host.snapshot(current, settings.model);
    } catch (error) {
      console.error("[compass] read failed", error);
      setStatus("Could not read this neighborhood.", true);
      return;
    }
    rebuild();
    render({ navigate });
    renderPins();
    if (snapshot.missing) setStatus("Nothing in this graph has that uid.", true);
    const uid = current;
    void host.syncSidecar(uid, settings.sidecar)
      .catch((error) => console.error("[compass] sidecar", error))
      .then(() => {
        placeFrame();
        later(placeFrame, 350);
      });
  }

  function scheduleReload() {
    if (root.hidden || lifecycle.disposed) return;
    reloadTimer = cancel(reloadTimer);
    reloadTimer = later(() => {
      reloadTimer = null;
      load();
    }, 300);
  }

  function repullIfOpen() {
    scheduleReload();
  }

  function updateButtons() {
    backButton.disabled = back.length === 0;
    forwardButton.disabled = forward.length === 0;
    const pinned = (settings?.pins ?? []).some((pin) => pin.uid === current);
    pinButton.textContent = pinned ? "Unpin" : "Pin";
    pinButton.setAttribute("aria-pressed", pinned ? "true" : "false");
    outlineButton.setAttribute("aria-pressed", settings?.outline ? "true" : "false");
  }

  function reveal() {
    if (!root.hidden) return;
    sampleTheme();
    root.hidden = false;
    placeFrame();
  }

  function focusUid(uid, { record = true } = {}) {
    if (!uid) return;
    hideFloating();
    if (record && current && current !== uid) {
      back.push(current);
      if (back.length > HISTORY_CAP) back.shift();
      forward.length = 0;
    }
    const changed = current !== uid;
    current = uid;
    reveal();
    host.watch(uid, scheduleReload);
    load({ navigate: changed });
    updateButtons();
  }

  function goBack() {
    if (!back.length) return;
    if (current) forward.push(current);
    focusUid(back.pop(), { record: false });
  }

  function goForward() {
    if (!forward.length) return;
    if (current) back.push(current);
    focusUid(forward.pop(), { record: false });
  }

  function close() {
    root.hidden = true;
    host.unwatch();
    host.releaseSidecar();
    reloadTimer = cancel(reloadTimer);
    clickTimer = cancel(clickTimer);
    titleCache = null;
    pointer = null;
    hideFloating();
    endDrag();
    setStatus("");
  }

  async function toggle() {
    if (!root.hidden) {
      close();
      return;
    }
    const uid = await host.openPageUid();
    if (uid) focusUid(uid);
    else if (current) focusUid(current, { record: false });
  }

  async function focusPage() {
    const uid = await host.openPageUid();
    if (uid) focusUid(uid);
  }

  async function focusBlock(uid) {
    const target = uid || host.focusedBlock();
    if (target) focusUid(target);
    else setStatus("Put the cursor in a block first.");
  }

  // ---- rendering ----

  function nodeClass(node, isCenter) {
    const parts = ["compass-node"];
    if (isCenter) parts.push("compass-node-center");
    if (!isCenter && node?.writable) parts.push("compass-writable");
    return parts.join(" ");
  }

  function renderCenterContent(element, box) {
    element.replaceChildren();
    const head = el("div", "compass-center-head");
    const kind = el("span", "compass-kind", hood.center.kind === "block" ? "Block" : "Page");
    const title = el("span", "compass-node-title", hood.center.title);
    head.append(kind, title);
    element.append(head);
    if (hood.center.badges.length) {
      const badges = el("div", "compass-badges");
      for (const badge of hood.center.badges) {
        const chip = el("span", "compass-badge", `${badge.attribute}: ${badge.text}`);
        chip.title = chip.textContent;
        badges.append(chip);
      }
      element.append(badges);
    }
    const top = box.y - box.h / 2;
    const open = rowsFor(current);
    for (const row of geometry.rows) {
      const info = hood.outline.find((item) => item.uid === row.uid);
      const line = el("div", "compass-row");
      line.dataset.uid = row.uid;
      line.style.top = `${row.y - row.h / 2 - top}px`;
      line.style.paddingLeft = `${4 + row.depth * 14}px`;
      if (info?.childCount) {
        const caret = button("compass-caret", open.has(row.uid) ? "−" : "+", open.has(row.uid) ? "Fold" : "Unfold");
        caret.dataset.uid = row.uid;
        line.append(caret);
      } else {
        line.append(el("span", "compass-caret-space"));
      }
      line.append(el("span", "compass-row-text", info?.text ?? ""));
      line.title = info?.text ?? "";
      element.append(line);
    }
    if (geometry.more) {
      const more = el("div", "compass-row compass-row-more", "More blocks in the sidebar");
      more.style.top = `${box.h - 8 - 24}px`;
      element.append(more);
    }
  }

  function placeElement(element, box) {
    element.style.width = `${box.w}px`;
    element.style.height = `${box.h}px`;
    element.style.transform = `translate(${box.x - box.w / 2}px, ${box.y - box.h / 2}px)`;
  }

  function dropThumb(uid) {
    const held = thumbUrls.get(uid);
    if (held == null) return;
    thumbUrls.delete(uid);
    try {
      globalThis.URL.revokeObjectURL(held.url);
    } catch {
      // Best effort.
    }
  }

  function dropAllThumbs() {
    for (const uid of [...thumbUrls.keys()]) dropThumb(uid);
  }

  function showThumb(element, uid, string, url) {
    const img = el("img", "compass-node-thumb");
    img.alt = "";
    img.draggable = false;
    img.src = url;
    thumbUrls.set(uid, { url, string });
    element.prepend(img);
  }

  function requestThumb(api, uid, render) {
    try {
      return Promise.resolve(api.thumbnail(uid, render ? { maxWidth: THUMB_WIDTH, render: true } : { maxWidth: THUMB_WIDTH }));
    } catch (error) {
      console.error("[compass] thumbnail", error);
      return Promise.resolve(null);
    }
  }

  function attachThumb(element, node) {
    const held = thumbUrls.get(node.uid);
    const api = plexus();
    if (!settings?.drawings || !isDrawingLike(node) || !api || typeof api.thumbnail !== "function") {
      dropThumb(node.uid);
      return;
    }
    if (held && held.string === node.string) {
      showThumb(element, node.uid, node.string, held.url);
      return;
    }
    dropThumb(node.uid);
    const accept = (blob) => {
      if (!blob || lifecycle.disposed || !element.isConnected || nodeEls.get(node.uid) !== element) return false;
      if (element.querySelector(".compass-node-thumb")) return true;
      showThumb(element, node.uid, node.string, globalThis.URL.createObjectURL(blob));
      return true;
    };
    requestThumb(api, node.uid, false).then((blob) => {
      if (accept(blob)) return;
      const key = `${node.uid}|${node.string}`;
      if (blob || thumbRenderTried.has(key) || lifecycle.disposed) return;
      thumbRenderTried.add(key);
      thumbRenderChain = thumbRenderChain
        .then(() => (lifecycle.disposed ? null : requestThumb(plexus() ?? api, node.uid, true)))
        .then(accept)
        .catch((error) => console.error("[compass] thumbnail", error));
    }).catch((error) => console.error("[compass] thumbnail", error));
  }

  function plexusChanged() {
    if (plexusFramePending || lifecycle.disposed) return;
    plexusFramePending = true;
    frame(() => {
      plexusFramePending = false;
      dropAllThumbs();
      thumbRenderTried.clear();
      repullIfOpen();
    });
  }

  function subscribePlexus() {
    const api = plexus();
    if (plexusOff && plexusApi === api) return;
    if (plexusOff) plexusOff();
    if (!api || typeof api.addEventListener !== "function") return;
    api.addEventListener("change", plexusChanged);
    plexusApi = api;
    plexusOff = () => {
      try {
        api.removeEventListener?.("change", plexusChanged);
      } catch {
        // Plexus may already be gone.
      }
      plexusOff = null;
      plexusApi = null;
    };
  }

  function onPlexusReady() {
    subscribePlexus();
    if (titleCache) titleCache = null;
    repullIfOpen();
  }

  function onPlexusUnload() {
    if (plexusOff) plexusOff();
    subscribePlexus();
    dropAllThumbs();
    thumbRenderTried.clear();
    for (const img of root.querySelectorAll(".compass-node-thumb")) img.remove();
    repullIfOpen();
  }

  function render({ navigate = false } = {}) {
    if (!hood) return;
    const open = rowsFor(current);
    const rows = settings?.outline ? visibleRows(hood.outline, open) : [];
    geometry = layout(hood, { rows });
    const boxes = new Map(geometry.items.map((item) => [item.uid, item]));
    const keep = new Set([hood.center.uid, ...boxes.keys()]);

    for (const [uid, element] of nodeEls) {
      if (keep.has(uid)) continue;
      element.remove();
      nodeEls.delete(uid);
      dropThumb(uid);
    }

    const entering = [];
    const place = (uid, box, isCenter, node) => {
      let element = nodeEls.get(uid);
      if (!element) {
        element = el("div");
        element.dataset.uid = uid;
        element.tabIndex = 0;
        element.setAttribute("role", "button");
        world.append(element);
        nodeEls.set(uid, element);
        const [dx, dy] = ENTER_FROM[box.zone] ?? [0, 0];
        element.style.opacity = "0";
        placeElement(element, { ...box, x: box.x + dx, y: box.y + dy });
        entering.push(element);
      }
      element.className = nodeClass(node, isCenter);
      element.dataset.zone = isCenter ? "center" : box.zone;
      element.dataset.style = isCenter ? "center" : node.style;
      element.dataset.kind = isCenter ? hood.center.kind : node.kind;
      if (isCenter) {
        renderCenterContent(element, box);
        element.setAttribute("aria-label", `Center: ${hood.center.title}`);
        element.title = hood.center.title;
      } else {
        element.replaceChildren(el("span", "compass-node-title", node.title));
        const why = node.label ? ` — ${node.label}` : "";
        element.setAttribute("aria-label", `${node.title}, ${SIDE_NAME[box.zone]}${why}`);
        element.title = `${node.title}${why}`;
        attachThumb(element, node);
      }
      if (!entering.includes(element)) placeElement(element, box);
      else element.dataset.target = JSON.stringify(box);
    };

    place(hood.center.uid, { ...geometry.center, zone: "center" }, true, null);
    for (const node of hood.nodes) {
      const box = boxes.get(node.uid);
      if (box) place(node.uid, box, false, node);
    }
    if (entering.length) {
      frame(() => {
        for (const element of entering) {
          if (!element.isConnected) continue;
          const box = JSON.parse(element.dataset.target ?? "null");
          delete element.dataset.target;
          element.style.opacity = "";
          if (box) placeElement(element, box);
        }
      });
    }

    renderChips();
    renderEdges(boxes);
    empty.hidden = hood.nodes.length > 0;
    if (!empty.hidden) {
      empty.textContent = "Nothing is connected here yet. Write Name:: [[Page]] in this outline, or link a page, and it appears here.";
      empty.style.transform = `translate(-50%, ${geometry.center.h / 2 + 36}px)`;
    }
    updateButtons();
    if (navigate) fit(true);
  }

  function renderChips() {
    const keep = new Set();
    for (const chip of geometry.chips) {
      keep.add(chip.zone);
      let element = chipEls.get(chip.zone);
      if (!element) {
        element = button("compass-chip");
        element.dataset.zone = chip.zone;
        world.append(element);
        chipEls.set(chip.zone, element);
      }
      const info = hood.overflow[chip.zone];
      element.textContent = info.shown < info.total ? `Show all ${info.total}` : "Show fewer";
      element.style.transform = `translate(${chip.x}px, ${chip.y}px) translate(-50%, -50%)`;
    }
    for (const [zone, element] of chipEls) {
      if (keep.has(zone)) continue;
      element.remove();
      chipEls.delete(zone);
    }
  }

  function anchorRow(uid) {
    if (!settings?.outline || !geometry.rows.length) return null;
    const visible = new Set(geometry.rows.map((row) => row.uid));
    let at = uid;
    while (at) {
      if (visible.has(at)) return at;
      at = hood.outlineIndex.get(at)?.parentUid ?? null;
    }
    return null;
  }

  function edgeFromCenter(box) {
    const c = geometry.center;
    if (box.zone === "north") {
      return curve(clamp(box.x, -c.w / 2 + 16, c.w / 2 - 16), -c.h / 2, box.x, box.y + box.h / 2, true);
    }
    if (box.zone === "south") {
      return curve(clamp(box.x, -c.w / 2 + 16, c.w / 2 - 16), c.h / 2, box.x, box.y - box.h / 2, true);
    }
    if (box.zone === "west") {
      return curve(-c.w / 2, clamp(box.y, -c.h / 2 + 12, c.h / 2 - 12), box.x + box.w / 2, box.y, false);
    }
    return curve(c.w / 2, clamp(box.y, -c.h / 2 + 12, c.h / 2 - 12), box.x - box.w / 2, box.y, false);
  }

  // Leaves the card at the row's height, on the side facing the node.
  function edgeFromRow(row, box) {
    const c = geometry.center;
    const sign = box.zone === "west" || (box.zone !== "east" && box.x < 0) ? -1 : 1;
    const sx = sign * (c.w / 2);
    if (box.zone === "north" || box.zone === "south") {
      // Run down (or up) the card's side, then swing into the gap before the node.
      const dir = box.zone === "north" ? -1 : 1;
      const side = sx + sign * 18;
      const end = [box.x, box.y - dir * (box.h / 2)];
      const c1 = [side, dir * (c.h / 2 + 20)];
      const c2 = [end[0], end[1] - dir * 30];
      return {
        d: `M${sx},${row.y} L${side},${row.y} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${end[0]},${end[1]}`,
        mid: [(side + 3 * c1[0] + 3 * c2[0] + end[0]) / 8, (row.y + 3 * c1[1] + 3 * c2[1] + end[1]) / 8],
      };
    }
    const end = [box.x - sign * (box.w / 2), box.y];
    const c1 = [sx + sign * 48, row.y];
    const c2 = [end[0] - sign * 48, end[1]];
    return {
      d: `M${sx},${row.y} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${end[0]},${end[1]}`,
      mid: [(sx + 3 * c1[0] + 3 * c2[0] + end[0]) / 8, (row.y + 3 * c1[1] + 3 * c2[1] + end[1]) / 8],
    };
  }

  // Arcs over the north band from the shared parent's top edge.
  function edgeToSibling(via, box) {
    const sx = via.x;
    const sy = via.y - via.h / 2;
    const ex = box.x - box.w / 2;
    const lift = Math.min(sy, box.y) - 36;
    return {
      d: `M${sx},${sy} C${sx},${lift} ${ex - 36},${lift} ${ex},${box.y}`,
      mid: [(sx + ex) / 2, lift],
    };
  }

  function renderEdges(boxes) {
    edgeLayer.replaceChildren();
    const rowBoxes = new Map(geometry.rows.map((row) => [row.uid, row]));
    const draw = (node, shape, label) => {
      const group = svg("g", "compass-edge");
      group.dataset.uid = node.uid;
      group.dataset.style = node.style;
      const hit = svg("path", "compass-edge-hit");
      hit.setAttribute("d", shape.d);
      const line = svg("path", "compass-edge-line");
      line.setAttribute("d", shape.d);
      group.append(hit, line);
      if (label) {
        const text = svg("text", "compass-edge-label");
        text.setAttribute("x", String(shape.mid[0]));
        text.setAttribute("y", String(shape.mid[1] - 4));
        text.textContent = label.length > 48 ? `${label.slice(0, 47)}…` : label;
        group.append(text);
      }
      edgeLayer.append(group);
    };
    for (const node of hood.nodes) {
      const box = boxes.get(node.uid);
      if (!box) continue;
      if (node.zone === "siblings") {
        const via = node.via ? boxes.get(node.via) : null;
        if (via) draw(node, edgeToSibling(via, box), "");
        continue;
      }
      const anchors = new Set();
      for (const item of node.evidence) {
        const row = item.sourceUid ? anchorRow(item.sourceUid) : null;
        if (row && (item.kind === "link" || (item.kind === "typed" && item.direction === "out"))) anchors.add(row);
        else anchors.add("");
      }
      let labeled = false;
      for (const anchor of anchors) {
        const shape = anchor ? edgeFromRow(rowBoxes.get(anchor), box) : edgeFromCenter(box);
        draw(node, shape, labeled ? "" : node.label);
        labeled = true;
      }
    }
  }

  function renderPins() {
    const pins = settings?.pins ?? [];
    pinRow.replaceChildren();
    pinRow.hidden = pins.length === 0;
    for (const pin of pins) {
      const chip = el("span", "compass-pin-chip");
      const jump = button("compass-pin-jump", pin.title);
      jump.dataset.uid = pin.uid;
      const remove = button("compass-pin-remove", "×", `Unpin ${pin.title}`);
      remove.dataset.uid = pin.uid;
      chip.append(jump, remove);
      pinRow.append(chip);
    }
  }

  async function savePins(pins) {
    await writeSetting(extensionAPI, SETTING_IDS.pins, pins);
    if (settings) settings.pins = pins;
    renderPins();
    updateButtons();
  }

  async function togglePin(uid = current) {
    if (!uid || !settings) return;
    const pins = settings.pins ?? [];
    if (pins.some((pin) => pin.uid === uid)) {
      await savePins(pins.filter((pin) => pin.uid !== uid));
      return;
    }
    await savePins([...pins, { uid, title: titleOf(uid) || uid }]);
  }

  async function toggleOutline() {
    if (!settings) return;
    settings.outline = !settings.outline;
    await writeSetting(extensionAPI, SETTING_IDS.outline, settings.outline);
    render();
  }

  // ---- floating UI ----

  function hideFloating() {
    menu.hidden = true;
    menu.replaceChildren();
    details.hidden = true;
    details.replaceChildren();
    hideResults();
  }

  function placeFloating(element, clientX, clientY) {
    const rect = root.getBoundingClientRect();
    element.hidden = false;
    const width = element.offsetWidth || 240;
    const height = element.offsetHeight || 160;
    element.style.left = `${clamp(clientX - rect.left, 8, Math.max(8, rect.width - width - 8))}px`;
    element.style.top = `${clamp(clientY - rect.top + 6, 8, Math.max(8, rect.height - height - 8))}px`;
  }

  function nodeKind(uid) {
    if (uid === hood?.center?.uid) return hood.center.kind;
    return nodeByUid.get(uid)?.kind ?? "page";
  }

  function plexusOpenKind(uid) {
    const entity = uid === hood?.center?.uid ? hood.center : nodeByUid.get(uid) ?? hood?.outline?.find((row) => row.uid === uid);
    return entity?.plexus !== undefined ? entity.plexus : plexusKind(entity);
  }

  const { openSidebar, openMain } = createPlexusOpener({ plexus, close, host, plexusKindOf: plexusOpenKind, nodeKind });

  function menuItem(text, action) {
    const item = button("compass-menu-item", text);
    item.setAttribute("role", "menuitem");
    item.addEventListener("click", () => {
      hideFloating();
      guard(action)();
    });
    menu.append(item);
    return item;
  }

  function showMenu(uid, clientX, clientY) {
    hideFloating();
    const node = nodeByUid.get(uid);
    const isCenter = uid === hood?.center?.uid;
    if (!isCenter) menuItem("Focus here", () => focusUid(uid));
    menuItem("Open in sidebar", () => openSidebar(uid));
    menuItem("Open in main window", () => openMain(uid));
    const pinned = (settings?.pins ?? []).some((pin) => pin.uid === uid);
    if (nodeKind(uid) === "page" || isCenter) menuItem(pinned ? "Unpin" : "Pin", () => togglePin(uid));
    if (node) menuItem("Why is this here?", () => showDetails(uid, clientX, clientY));
    if (node?.writable) {
      for (const side of ["north", "south", "west", "east"]) {
        if (side === node.zone) continue;
        const attribute = targetAttribute(node, side);
        if (attribute) menuItem(`Move to ${SIDE_NAME[side]} (${attribute}::)`, () => moveNode(node, side));
      }
    }
    placeFloating(menu, clientX, clientY);
    menu.querySelector("button")?.focus();
  }

  function showDetails(uid, clientX, clientY) {
    hideFloating();
    const node = nodeByUid.get(uid);
    if (!node) return;
    details.append(el("p", "compass-details-title", node.title));
    details.append(el("p", "compass-details-side", `${SIDE_NAME[node.zone]}${node.writable ? " · drag to another side to rewrite" : ""}`));
    const list = el("ul", "compass-details-list");
    const seen = new Set();
    for (const item of node.evidence) {
      const key = `${item.kind}:${item.attribute ?? ""}:${item.sourceUid ?? ""}:${item.note ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = el("li", "compass-details-item");
      entry.append(el("span", "", describe({ ...item, via: node.via }, titleOf)));
      if (item.sourceUid) {
        const open = button("compass-details-open", "Open block");
        open.addEventListener("click", () => { void openSidebar(item.sourceUid, "block"); });
        entry.append(open);
      }
      list.append(entry);
    }
    details.append(list);
    const actions = el("div", "compass-details-actions");
    const focus = button("", "Focus here");
    focus.addEventListener("click", () => focusUid(uid));
    const side = button("", "Open in sidebar");
    side.addEventListener("click", () => { void openSidebar(uid); });
    actions.append(focus, side);
    details.append(actions);
    placeFloating(details, clientX, clientY);
  }

  // ---- rewriting ----

  function targetAttribute(node, side) {
    const edge = node?.writable;
    const role = DROP_ROLE[side];
    if (!edge || !role || !hood) return null;
    return attributeForRole(edge.direction === "out" ? role : inverseRole(role), hood.settings);
  }

  async function moveNode(node, side) {
    const edge = node.writable;
    const attribute = targetAttribute(node, side);
    if (!attribute) {
      setStatus(`No attribute is set for ${SIDE_NAME[side]}. Add one under Settings → Compass.`);
      return;
    }
    const value = edge.direction === "out"
      ? (node.kind === "page" ? { uid: node.uid, title: node.title } : { uid: node.uid })
      : (hood.center.kind === "page" ? { uid: hood.center.uid, title: hood.center.title } : { uid: hood.center.uid });
    node.zone = side;
    render();
    setStatus(`Writing ${attribute}::`, true);
    let result;
    try {
      result = await host.move({
        sourceUid: edge.sourceUid,
        fromAttribute: edge.attribute,
        toAttribute: attribute,
        value,
        expectedString: edge.sourceString,
      });
    } catch (error) {
      console.error("[compass] write failed", error);
      result = { ok: false, reason: "failed" };
    }
    if (result?.ok) setStatus(`Moved to ${SIDE_NAME[side]} as ${attribute}::`);
    else setStatus(REASONS[result?.reason] ?? "The write failed. Compass reloaded.");
    load();
  }

  function handleDrop(uid, side) {
    const node = nodeByUid.get(uid);
    if (!node || !side || side === node.zone) return;
    if (node.writable) {
      void moveNode(node, side);
      return;
    }
    const typed = node.evidence.filter((item) => item.kind === "typed");
    if (typed.length > 1) {
      setStatus("Several blocks make this edge. Pick one to edit.");
      const rect = stage.getBoundingClientRect();
      showDetails(uid, rect.left + rect.width / 2, rect.top + 60);
      return;
    }
    const source = node.evidence.find((item) => item.sourceUid)?.sourceUid;
    if (typed.length === 1) {
      setStatus("That attribute belongs to another plugin, so Compass opened its block instead.");
    } else if (source) {
      setStatus("Plain links are not rewritten. Compass opened the block that links them.");
    } else {
      setStatus("This edge comes from the page structure. There is no block to rewrite.");
      return;
    }
    if (source) void openSidebar(source, "block");
  }

  // ---- pointer ----

  function hintText(side, node) {
    const attribute = node?.writable ? targetAttribute(node, side) : null;
    return attribute ? `${SIDE_NAME[side]} · ${attribute}::` : SIDE_NAME[side];
  }

  function startDrag(state) {
    state.dragging = true;
    root.classList.add("compass-dragging");
    const node = nodeByUid.get(state.uid);
    for (const side of Object.keys(hints)) hints[side].textContent = hintText(side, node);
    ghost.textContent = node?.title ?? "";
    ghost.hidden = false;
    nodeEls.get(state.uid)?.classList.add("compass-lifted");
  }

  function endDrag() {
    root.classList.remove("compass-dragging");
    ghost.hidden = true;
    for (const hint of Object.values(hints)) hint.classList.remove("compass-hint-hot");
    for (const element of nodeEls.values()) element.classList.remove("compass-lifted");
  }

  function onPointerDown(event) {
    if (root.hidden || event.button !== 0 || pointer) return;
    const target = event.target;
    if (!menu.hidden && !menu.contains(target)) hideFloating();
    if (!details.hidden && !details.contains(target)) {
      details.hidden = true;
      details.replaceChildren();
    }
    if (!stage.contains(target) || target.closest?.(".compass-chip, .compass-caret, .compass-row")) return;
    const element = target.closest?.(".compass-node");
    if (element && !element.classList.contains("compass-node-center")) {
      pointer = { type: "node", uid: element.dataset.uid, x: event.clientX, y: event.clientY, dragging: false };
      return;
    }
    if (element || target.closest?.(".compass-edge")) return;
    pointer = { type: "pan", x: event.clientX, y: event.clientY, panX, panY, dragging: false };
  }

  function onPointerMove(event) {
    if (!pointer) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!pointer.dragging && Math.hypot(dx, dy) < 5) return;
    if (pointer.type === "pan") {
      pointer.dragging = true;
      panX = pointer.panX + dx;
      panY = pointer.panY + dy;
      applyCamera(false);
      return;
    }
    if (!pointer.dragging) startDrag(pointer);
    const rect = root.getBoundingClientRect();
    ghost.style.left = `${event.clientX - rect.left + 10}px`;
    ghost.style.top = `${event.clientY - rect.top + 10}px`;
    const side = geometry ? sideAt(clientToWorld(event.clientX, event.clientY), geometry.center) : null;
    for (const [name, hint] of Object.entries(hints)) hint.classList.toggle("compass-hint-hot", name === side);
  }

  function onPointerUp(event) {
    if (!pointer) return;
    const state = pointer;
    pointer = null;
    if (!state.dragging) return;
    suppressClick = true;
    later(() => { suppressClick = false; }, 0);
    if (state.type !== "node") return;
    endDrag();
    if (event.type === "pointercancel" || !geometry) return;
    handleDrop(state.uid, sideAt(clientToWorld(event.clientX, event.clientY), geometry.center));
  }

  function onWheel(event) {
    if (root.hidden) return;
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    const ox = event.clientX - rect.left - rect.width / 2;
    const oy = event.clientY - rect.top - rect.height / 2;
    const wx = (ox - panX) / zoom;
    const wy = (oy - panY) / zoom;
    const step = event.ctrlKey ? 1.04 : 1.12;
    zoom = clamp(zoom * (event.deltaY < 0 ? step : 1 / step), 0.25, 2.5);
    panX = ox - wx * zoom;
    panY = oy - wy * zoom;
    applyCamera(false);
  }

  // ---- clicks ----

  function onStageClick(event) {
    if (suppressClick) return;
    const target = event.target;
    const chip = target.closest?.(".compass-chip");
    if (chip) {
      const zones = expandedFor(current);
      if (zones.has(chip.dataset.zone)) zones.delete(chip.dataset.zone);
      else zones.add(chip.dataset.zone);
      rebuild();
      render();
      return;
    }
    if (target.closest?.(".compass-row-more")) {
      void openSidebar(current);
      return;
    }
    const caret = target.closest?.(".compass-caret");
    if (caret) {
      const open = rowsFor(current);
      if (open.has(caret.dataset.uid)) open.delete(caret.dataset.uid);
      else open.add(caret.dataset.uid);
      render();
      return;
    }
    const row = target.closest?.(".compass-row[data-uid]");
    const element = target.closest?.(".compass-node");
    const edge = target.closest?.(".compass-edge");
    if (edge) {
      showDetails(edge.dataset.uid, event.clientX, event.clientY);
      return;
    }
    if (!row && !element) {
      hideFloating();
      return;
    }
    const uid = row ? row.dataset.uid : element.dataset.uid;
    if (!row && element.classList.contains("compass-node-center")) return;
    if (event.shiftKey) {
      void openSidebar(uid, row ? "block" : nodeKind(uid));
      return;
    }
    clickTimer = cancel(clickTimer);
    clickTimer = later(() => {
      clickTimer = null;
      focusUid(uid);
    }, CLICK_DELAY);
  }

  function onStageDoubleClick(event) {
    clickTimer = cancel(clickTimer);
    const target = event.target;
    if (target.closest?.(".compass-caret, .compass-chip")) return;
    const row = target.closest?.(".compass-row[data-uid]");
    const element = target.closest?.(".compass-node");
    if (!row && !element) return;
    event.preventDefault();
    if (row) void openSidebar(row.dataset.uid, "block");
    else void openSidebar(element.dataset.uid);
  }

  function onContextMenu(event) {
    const element = event.target.closest?.(".compass-node, .compass-edge, .compass-row[data-uid]");
    if (!element) return;
    event.preventDefault();
    if (element.classList.contains("compass-row")) {
      hideFloating();
      menuItem("Focus here", () => focusUid(element.dataset.uid));
      menuItem("Open in sidebar", () => openSidebar(element.dataset.uid, "block"));
      placeFloating(menu, event.clientX, event.clientY);
      return;
    }
    if (element.classList.contains("compass-edge")) showDetails(element.dataset.uid, event.clientX, event.clientY);
    else showMenu(element.dataset.uid, event.clientX, event.clientY);
  }

  // ---- search ----

  function hideResults() {
    results.hidden = true;
    results.replaceChildren();
    activeResult = 0;
  }

  function markResult() {
    const items = [...results.querySelectorAll(".compass-result")];
    items.forEach((item, index) => item.classList.toggle("compass-result-active", index === activeResult));
    items[activeResult]?.scrollIntoView?.({ block: "nearest" });
  }

  function runSearch() {
    const text = searchInput.value.trim();
    if (!text) {
      hideResults();
      return;
    }
    if (!titleCache) titleCache = host.titles();
    const found = rankTitles(titleCache, text, 20);
    results.replaceChildren();
    activeResult = 0;
    const canDraw = Boolean(settings?.drawings ?? readSettings()?.drawings) && Boolean(plexus());
    if (!found.length) activeResult = -1;
    if (!found.length && !canDraw) results.append(el("div", "compass-result-none", "No page by that name"));
    for (const [index, row] of found.entries()) {
      const item = button(`compass-result${index === 0 ? " compass-result-active" : ""}`, row.title);
      item.dataset.uid = row.uid;
      item.setAttribute("role", "option");
      results.append(item);
    }
    if (canDraw) {
      const item = button("compass-result compass-result-drawing", `New drawing: ${text}`);
      item.dataset.newDrawing = text;
      item.setAttribute("role", "option");
      results.append(item);
    }
    results.hidden = false;
  }

  function chooseResult(uid) {
    if (!uid) return;
    hideResults();
    searchInput.value = "";
    focusUid(uid);
    stage.focus({ preventScroll: true });
  }

  async function newDrawing(title) {
    const api = plexus();
    if (!api || !title) return;
    hideResults();
    searchInput.value = "";
    stage.focus({ preventScroll: true });
    try {
      const made = await api.create({ title });
      titleCache = null;
      if (made?.pageUid && !lifecycle.disposed) focusUid(made.pageUid);
    } catch (error) {
      console.error("[compass] new drawing", error);
      setStatus("Plexus could not create the drawing.");
    }
  }

  function chooseItem(item) {
    if (item?.dataset.newDrawing) void newDrawing(searchInput.value.trim() || item.dataset.newDrawing);
    else chooseResult(item?.dataset.uid);
  }

  function onSearchKey(event) {
    const items = [...results.querySelectorAll(".compass-result")];
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!items.length) return;
      activeResult = clamp(activeResult + (event.key === "ArrowDown" ? 1 : -1), 0, items.length - 1);
      markResult();
    } else if (event.key === "Enter") {
      event.preventDefault();
      chooseItem(items[activeResult]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!results.hidden) hideResults();
      else stage.focus({ preventScroll: true });
    }
  }

  // ---- keyboard ----

  function firstIn(zone) {
    return hood?.nodes.find((node) => node.zone === zone)?.uid ?? null;
  }

  function onKey(event) {
    if (root.hidden) return;
    // Keys typed in Roam itself (the sidecar, a block) belong to Roam.
    if (!root.contains(event.target) && event.target !== document.body) return;
    const typing = event.target === searchInput;
    if (event.key === "Escape") {
      if (!menu.hidden || !details.hidden || !results.hidden) hideFloating();
      else close();
      event.preventDefault();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }
    if (typing) return;
    if (event.altKey && event.key === "ArrowLeft") {
      event.preventDefault();
      goBack();
      return;
    }
    if (event.altKey && event.key === "ArrowRight") {
      event.preventDefault();
      goForward();
      return;
    }
    const element = event.target.closest?.(".compass-node");
    if (element && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      if (event.shiftKey) void openSidebar(element.dataset.uid);
      else if (!element.classList.contains("compass-node-center")) focusUid(element.dataset.uid);
      return;
    }
    if (element && (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      showMenu(element.dataset.uid, rect.left + 8, rect.bottom);
      return;
    }
    const arrows = { ArrowUp: "north", ArrowDown: "south", ArrowLeft: "west", ArrowRight: "east" };
    if (arrows[event.key] && !event.altKey && (event.target === stage || element?.classList.contains("compass-node-center"))) {
      const uid = firstIn(arrows[event.key]);
      if (uid) {
        event.preventDefault();
        nodeEls.get(uid)?.focus({ preventScroll: true });
      }
    }
  }

  // ---- wiring ----

  lifecycle.node(root, document.body);
  lifecycle.event(closeButton, "click", () => close());
  lifecycle.event(backButton, "click", () => goBack());
  lifecycle.event(forwardButton, "click", () => goForward());
  lifecycle.event(pinButton, "click", guard(() => togglePin()));
  lifecycle.event(outlineButton, "click", guard(() => toggleOutline()));
  lifecycle.event(fitButton, "click", () => fit(true));
  lifecycle.event(refreshButton, "click", () => load());
  lifecycle.event(pinRow, "click", (event) => {
    const remove = event.target.closest?.(".compass-pin-remove");
    if (remove) {
      void savePins((settings?.pins ?? []).filter((pin) => pin.uid !== remove.dataset.uid))
        .catch((error) => console.error("[compass]", error));
      return;
    }
    const jump = event.target.closest?.(".compass-pin-jump");
    if (jump) focusUid(jump.dataset.uid);
  });
  lifecycle.event(searchInput, "input", () => {
    searchTimer = cancel(searchTimer);
    searchTimer = later(() => {
      searchTimer = null;
      runSearch();
    }, 60);
  });
  lifecycle.event(searchInput, "keydown", onSearchKey);
  lifecycle.event(results, "mousedown", (event) => event.preventDefault());
  lifecycle.event(results, "click", (event) => chooseItem(event.target.closest?.(".compass-result")));
  lifecycle.event(stage, "click", onStageClick);
  lifecycle.event(stage, "dblclick", onStageDoubleClick);
  lifecycle.event(stage, "contextmenu", onContextMenu);
  lifecycle.event(stage, "wheel", onWheel, { passive: false });
  lifecycle.event(root, "pointerdown", onPointerDown);
  lifecycle.event(globalThis, "pointermove", onPointerMove);
  lifecycle.event(globalThis, "pointerup", onPointerUp);
  lifecycle.event(globalThis, "pointercancel", onPointerUp);
  lifecycle.event(globalThis, "resize", () => { if (!root.hidden) placeFrame(); });
  lifecycle.event(document, "keydown", onKey);
  lifecycle.event(globalThis, "roam-plexus:ready", onPlexusReady);
  lifecycle.event(globalThis, "roam-plexus:unload", onPlexusUnload);
  subscribePlexus();
  lifecycle.add(() => {
    if (plexusOff) plexusOff();
    dropAllThumbs();
    for (const id of timers) globalThis.clearTimeout(id);
    timers.clear();
    root.hidden = true;
  });
  applyCamera(false);
  updateButtons();

  const view = { repullIfOpen, toggle, focusPage, focusBlock };
  return { ...view, installCommands: () => registerCommands({ extensionAPI, lifecycle, host, view }) };
}
