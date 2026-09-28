import { applyLens } from "../model/layout.js";
import { readCompassSettings, SETTING_IDS } from "../settings.js";

const CENTER = { x: -100, y: -32, w: 200, h: 64 };
const ANCHORS = {
  parents: [-80, -130],
  children: [-80, 90],
  friends: [-280, -20],
  challengers: [210, -20],
  related: [-80, 150],
  siblings: [-70, 190],
  outline: [80, 90],
};

function guard(work) {
  return () => {
    try {
      Promise.resolve(work()).catch((error) => console.error("[compass]", error));
    } catch (error) {
      console.error("[compass]", error);
    }
  };
}

async function registerCommands({ extensionAPI, lifecycle, host, view }) {
  const palette = extensionAPI?.ui?.commandPalette;
  if (!palette?.addCommand || !palette?.removeCommand) {
    throw new TypeError("A command palette is required");
  }
  await lifecycle.command(palette, {
    label: "Compass: Open",
    callback: guard(() => view.toggle()),
  });
  await lifecycle.command(palette, {
    label: "Compass: Focus page",
    callback: guard(() => view.focusPage()),
  });
  await lifecycle.command(palette, {
    label: "Compass: Focus block",
    callback: guard(() => view.focusBlock()),
  });
  const menu = host.blockContextMenu?.();
  if (menu?.addCommand && menu?.removeCommand) {
    await lifecycle.command(menu, {
      label: "Compass: Focus block",
      callback: (info) => {
        try {
          Promise.resolve(view.focusBlock(info?.["block-uid"])).catch((error) => {
            console.error("[compass]", error);
          });
        } catch (error) {
          console.error("[compass]", error);
        }
      },
    });
  }
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function textInput(placeholder) {
  const node = el("input");
  node.type = "text";
  node.autocomplete = "off";
  node.placeholder = placeholder;
  return node;
}

function labeled(text, input) {
  const wrap = el("label", "compass-field");
  const name = el("span", "compass-field-name");
  name.textContent = text;
  wrap.append(name, input);
  return wrap;
}

function blankLens() {
  return { keyword: "", attributes: { include: [], exclude: [] }, kinds: { include: [] } };
}

function splitList(value) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function parseAnnotation(value) {
  const raw = String(value ?? "").trim();
  const doubled = raw.indexOf("::");
  const marker = doubled >= 0 ? doubled : raw.indexOf(":");
  const width = doubled >= 0 ? 2 : 1;
  if (marker < 0) return { attribute: "", text: "" };
  return {
    attribute: raw.slice(0, marker).trim(),
    text: raw.slice(marker + width).trim(),
  };
}

function boundaryPoint(x, y, w, h, tx, ty) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const sx = dx === 0 ? Infinity : (w / 2) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (h / 2) / Math.abs(dy);
  const scale = Math.min(sx, sy);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function segmentDistance(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = dx * dx + dy * dy;
  if (!len) return Math.hypot(px - x0, py - y0);
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

function strokeFor(kind) {
  if (kind === "typed") return { width: 2, dash: [] };
  if (kind === "inverse") return { width: 1, dash: [] };
  return { width: 1.25, dash: [5, 4] };
}

function caption(edge) {
  const parts = [];
  if (edge.attribute) parts.push(edge.attribute);
  for (const label of edge.labels ?? []) {
    if (label?.attribute) parts.push(`${label.attribute}: ${label.text ?? ""}`);
  }
  return parts.join(" · ");
}

function endpoint(edge, centerUid) {
  if (edge.to && edge.to !== centerUid) return edge.to;
  if (edge.from && edge.from !== centerUid) return edge.from;
  return null;
}

function centerLabel(center) {
  return center?.title || center?.string || center?.uid || "Nothing centered";
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
    return {
      ...view,
      installCommands() {
        return registerCommands({ extensionAPI, lifecycle, host, view });
      },
    };
  }
  return mountReal({ extensionAPI, lifecycle, host });
}

function mountReal({ extensionAPI, lifecycle, host }) {
  const root = el("div", "compass-root");
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Compass");

  const bar = el("div", "compass-bar");
  const backButton = el("button", "compass-back");
  backButton.type = "button";
  backButton.textContent = "Back";
  const forwardButton = el("button", "compass-forward");
  forwardButton.type = "button";
  forwardButton.textContent = "Forward";
  const searchInput = el("input", "compass-search");
  searchInput.type = "search";
  searchInput.autocomplete = "off";
  searchInput.placeholder = "Find a page";
  searchInput.setAttribute("aria-label", "Search pages");
  const results = el("div", "compass-results");
  results.hidden = true;
  const pinButton = el("button", "compass-pin");
  pinButton.type = "button";
  pinButton.textContent = "Pin";
  const outlineButton = el("button", "compass-outline");
  outlineButton.type = "button";
  outlineButton.textContent = "Outline";
  outlineButton.setAttribute("aria-pressed", "false");
  const closeButton = el("button", "compass-close");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  const status = el("span", "compass-status");
  bar.append(backButton, forwardButton, searchInput, results, pinButton, outlineButton, closeButton, status);

  const body = el("div", "compass-body");
  const stage = el("div", "compass-stage");
  const world = el("div", "compass-world");
  const canvas = el("canvas", "compass-edges");
  const centerCard = el("div", "compass-center");
  const centerTitle = el("div", "compass-center-title");
  const centerBadges = el("div", "compass-badges");
  centerCard.append(centerTitle, centerBadges);
  world.append(canvas, centerCard);
  const gutters = [
    ["compass-gutter compass-gutter-north", "parents", "Parents"],
    ["compass-gutter compass-gutter-south", "children", "Children"],
    ["compass-gutter compass-gutter-west", "friends", "Friends"],
    ["compass-gutter compass-gutter-east", "challengers", "Challengers"],
  ].map(([className, zone, label]) => {
    const gutter = el("div", className);
    gutter.dataset.zone = zone;
    gutter.textContent = label;
    return gutter;
  });
  stage.append(world, ...gutters);

  const side = el("aside", "compass-side");
  const pinHeading = el("p", "compass-section");
  pinHeading.textContent = "Pins";
  const pinList = el("div", "compass-pin-list");
  const lensHeading = el("p", "compass-section");
  lensHeading.textContent = "Lens";
  const keywordInput = textInput("Keyword");
  const includeInput = textInput("Attributes to keep");
  const excludeInput = textInput("Attributes to hide");
  const kindsInput = textInput("Kinds");
  const lensNameInput = textInput("Lens name");
  const actions = el("div", "compass-actions");
  const keepButton = el("button", "compass-keep");
  keepButton.type = "button";
  keepButton.textContent = "Keep layout";
  const reflowButton = el("button", "compass-reflow");
  reflowButton.type = "button";
  reflowButton.textContent = "Reflow";
  const saveButton = el("button", "compass-save");
  saveButton.type = "button";
  saveButton.textContent = "Save";
  actions.append(keepButton, reflowButton, saveButton);
  const lensList = el("div", "compass-lens-list");
  side.append(
    pinHeading,
    pinList,
    lensHeading,
    labeled("Keyword", keywordInput),
    labeled("Include", includeInput),
    labeled("Exclude", excludeInput),
    labeled("Kinds", kindsInput),
    labeled("Name", lensNameInput),
    actions,
    lensList,
  );

  const popover = el("div", "compass-popover");
  popover.hidden = true;
  const ghost = el("div", "compass-ghost");
  ghost.hidden = true;
  root.append(bar, body, popover, ghost);
  body.append(stage, side);

  const palette = { ink: "#222222", paper: "#ffffff" };
  const timers = new Set();
  let colored = false;
  let panX = 0;
  let panY = 0;
  let zoom = 1;
  let current = null;
  const back = [];
  const forward = [];
  let lastModel = null;
  let lastLayout = null;
  let lastEdges = [];
  let lensMode = null;
  let activeLens = null;
  let pullToken = 0;
  let watchTimer = null;
  let searchTimer = null;
  let clickTimer = null;
  let pointer = null;
  let suppressClick = false;
  let activeResult = 0;
  let segments = [];

  function delay(fn, ms) {
    const id = globalThis.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }

  function cancelDelay(id) {
    if (id == null) return;
    globalThis.clearTimeout(id);
    timers.delete(id);
  }

  function setStatus(text) {
    status.textContent = text || "";
  }

  function applyTransform() {
    world.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }

  function sampleColors() {
    if (colored) return;
    const bodyStyle = getComputedStyle(document.body);
    let paper = bodyStyle.backgroundColor || "";
    const ink = bodyStyle.color || "";
    if (!paper || paper === "transparent" || paper === "rgba(0, 0, 0, 0)") {
      paper = getComputedStyle(document.documentElement).backgroundColor || "";
    }
    if (ink) {
      root.style.color = ink;
      root.style.setProperty("--compass-ink", ink);
      palette.ink = ink;
    }
    if (paper && paper !== "transparent" && paper !== "rgba(0, 0, 0, 0)") {
      root.style.backgroundColor = paper;
      root.style.setProperty("--compass-paper", paper);
      palette.paper = paper;
    }
    colored = true;
  }

  function placeFrame() {
    const sidebar = document.getElementById("right-sidebar");
    const viewport = globalThis.innerWidth || 0;
    let inset = 0;
    if (sidebar?.getBoundingClientRect && viewport) {
      const width = sidebar.getBoundingClientRect().width;
      if (width > 48 && width < viewport * 0.55) inset = Math.round(width);
    }
    root.style.right = `${inset}px`;
  }

  function reveal() {
    if (root.hidden) {
      sampleColors();
      root.hidden = false;
      placeFrame();
    }
  }

  function hideResults() {
    results.hidden = true;
    results.replaceChildren();
    activeResult = 0;
  }

  function hidePopover() {
    popover.hidden = true;
    popover.replaceChildren();
  }

  function hideGhost() {
    ghost.hidden = true;
    root.classList.remove("compass-dragging");
  }

  function updateHistory() {
    backButton.disabled = back.length === 0;
    forwardButton.disabled = forward.length === 0;
  }

  function close() {
    root.hidden = true;
    pullToken += 1;
    host.unwatch();
    if (watchTimer != null) globalThis.clearTimeout(watchTimer);
    watchTimer = null;
    hidePopover();
    hideResults();
    hideGhost();
    setStatus("");
  }

  function scheduleReload() {
    if (root.hidden || lifecycle.disposed) return;
    if (watchTimer != null) globalThis.clearTimeout(watchTimer);
    watchTimer = lifecycle.timeout(() => {
      watchTimer = null;
      void reload();
    }, 80);
  }

  async function reload() {
    if (lifecycle.disposed || root.hidden || !current) return;
    const token = ++pullToken;
    const uid = current;
    let settings;
    try {
      settings = readCompassSettings(extensionAPI);
    } catch (error) {
      console.error("[compass] settings", error);
      return;
    }
    let model;
    try {
      model = await host.load(uid, settings.model);
    } catch (error) {
      console.error("[compass] pull failed", error);
      setStatus("Could not load this neighborhood");
      return;
    }
    if (token !== pullToken || lifecycle.disposed || root.hidden || current !== uid) return;
    paint(model);
    renderPins(settings.pins);
    renderLensList(settings.lenses);
    outlineButton.setAttribute("aria-pressed", settings.outline ? "true" : "false");
    updateHistory();
    if (model.missing) setStatus("No block for this uid");
    try {
      await host.syncSidecar(uid, settings.sidecar);
    } catch (error) {
      console.error("[compass] sidecar", error);
    }
    if (token === pullToken && !lifecycle.disposed) placeFrame();
  }

  function repullIfOpen() {
    if (root.hidden || lifecycle.disposed) return;
    scheduleReload();
  }

  async function showUid(uid, record) {
    if (!uid) return;
    if (record && current && current !== uid) {
      back.push(current);
      forward.length = 0;
    }
    if (current !== uid && lensMode === "keep") lensMode = "reflow";
    current = uid;
    host.setDisplayed(uid);
    reveal();
    host.watch(uid);
    updateHistory();
    hidePopover();
    hideResults();
    await reload();
  }

  async function goBack() {
    if (!back.length) return;
    if (current) forward.push(current);
    const uid = back.pop();
    updateHistory();
    await showUid(uid, false);
  }

  async function goForward() {
    if (!forward.length) return;
    if (current) back.push(current);
    const uid = forward.pop();
    updateHistory();
    await showUid(uid, false);
  }

  async function revealCurrent() {
    reveal();
    if (!current) return;
    host.setDisplayed(current);
    host.watch(current);
    await reload();
  }

  async function toggle() {
    if (!root.hidden) {
      close();
      return;
    }
    const uid = await host.openPageUid();
    if (uid) await showUid(uid, true);
    else await revealCurrent();
  }

  async function focusPage() {
    const uid = await host.openPageUid();
    if (uid) await showUid(uid, true);
    else await revealCurrent();
  }

  async function focusBlock(uid) {
    const target = uid || host.focusedBlock();
    if (target) await showUid(target, true);
    else await revealCurrent();
  }

  function readLensForm() {
    return {
      keyword: keywordInput.value,
      attributes: {
        include: splitList(includeInput.value),
        exclude: splitList(excludeInput.value),
      },
      kinds: { include: splitList(kindsInput.value) },
    };
  }

  function paint(model) {
    lastModel = model;
    const classified = model.classified;
    const showOutline = classified.nodes.some((node) => node.zone === "outline");
    let view;
    if (lensMode) {
      view = applyLens({
        nodes: classified.nodes,
        edges: classified.edges,
        badges: classified.badges,
        overflow: classified.overflow,
        layout: lensMode === "keep" ? (lastLayout ?? model.placed) : model.placed,
        showOutline,
      }, activeLens ?? blankLens(), lensMode);
    } else {
      view = {
        nodes: classified.nodes,
        edges: classified.edges,
        badges: classified.badges,
        overflow: classified.overflow,
        layout: model.placed,
      };
    }
    lastLayout = view.layout;
    lastEdges = view.edges ?? [];
    renderScene(view, model);
  }

  function renderScene(view, model) {
    for (const child of [...world.children]) {
      if (child !== canvas && child !== centerCard) child.remove();
    }
    centerTitle.textContent = centerLabel(model.fixture?.center);
    centerBadges.replaceChildren();
    for (const badge of view.badges ?? []) {
      const chip = el("span", "compass-badge");
      chip.textContent = `${badge.attribute}: ${badge.text}`;
      chip.title = chip.textContent;
      centerBadges.append(chip);
    }
    const positions = new Map((view.layout ?? []).map((item) => [item.uid, item]));
    for (const node of view.nodes ?? []) {
      const box = positions.get(node.uid);
      if (!box) continue;
      world.append(renderNode(node, box));
    }
    renderOverflow(model, view.layout);
    drawEdges(view, model.fixture?.center?.uid);
  }

  function renderNode(node, box) {
    const slot = el("div", "compass-slot");
    if (node.hidden) slot.hidden = true;
    slot.style.left = `${box.x}px`;
    slot.style.top = `${box.y}px`;
    slot.style.width = `${box.w}px`;
    slot.style.height = `${box.h}px`;
    const button = el("button", "compass-node");
    button.type = "button";
    button.dataset.uid = node.uid;
    button.dataset.zone = node.zone;
    button.dataset.kind = node.kind;
    button.textContent = node.title || node.uid;
    button.title = node.title || node.uid;
    if (writableEdge(node.uid)) button.classList.add("compass-node-writable");
    const open = el("button", "compass-open");
    open.type = "button";
    open.textContent = "Open";
    open.addEventListener("click", (event) => {
      event.stopPropagation();
      void openMapped(node.uid, node.kind);
    });
    button.addEventListener("click", (event) => onNodeClick(event, node));
    button.addEventListener("dblclick", (event) => {
      event.preventDefault();
      cancelDelay(clickTimer);
      clickTimer = null;
      void openMapped(node.uid, node.kind);
    });
    slot.append(button, open);
    return slot;
  }

  function writableEdge(uid) {
    return (lastEdges ?? []).find((edge) => edge.writable && edge.kind === "typed" && edge.to === uid) ?? null;
  }

  function renderOverflow(model, layoutItems) {
    const overflow = model.classified?.overflow ?? {};
    const byUid = new Map((layoutItems ?? []).map((item) => [item.uid, item]));
    for (const zone of Object.keys(overflow)) {
      const extra = overflow[zone];
      if (!extra) continue;
      const members = (model.classified.nodes ?? []).filter((node) => node.zone === zone);
      const boxes = members.map((node) => byUid.get(node.uid)).filter(Boolean);
      const badge = el("div", "compass-overflow");
      badge.dataset.zone = zone;
      badge.textContent = `${members.length}/${members.length + extra}`;
      badge.title = zone;
      const anchor = ANCHORS[zone] ?? [0, 0];
      let x = anchor[0];
      let y = anchor[1];
      if (boxes.length) {
        x = Math.max(...boxes.map((box) => box.x + box.w)) + 8;
        y = Math.min(...boxes.map((box) => box.y));
      }
      badge.style.left = `${x}px`;
      badge.style.top = `${y}px`;
      world.append(badge);
    }
  }

  function drawEdges(view, centerUid) {
    segments = [];
    const boxes = view.layout ?? [];
    let minX = CENTER.x;
    let minY = CENTER.y;
    let maxX = CENTER.x + CENTER.w;
    let maxY = CENTER.y + CENTER.h;
    for (const box of boxes) {
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.w);
      maxY = Math.max(maxY, box.y + box.h);
    }
    const pad = 48;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const dpr = globalThis.devicePixelRatio || 1;
    canvas.style.left = `${minX}px`;
    canvas.style.top = `${minY}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, -minX * dpr, -minY * dpr);
    ctx.clearRect(minX, minY, width, height);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const byUid = new Map(boxes.map((box) => [box.uid, box]));
    const hidden = new Set((view.nodes ?? []).filter((node) => node.hidden).map((node) => node.uid));
    for (const edge of view.edges ?? []) {
      const uid = endpoint(edge, centerUid);
      if (!uid || hidden.has(uid)) continue;
      const box = byUid.get(uid);
      if (!box) continue;
      const nx = box.x + box.w / 2;
      const ny = box.y + box.h / 2;
      const start = boundaryPoint(CENTER.x, CENTER.y, CENTER.w, CENTER.h, nx, ny);
      const end = boundaryPoint(box.x, box.y, box.w, box.h, 0, 0);
      const style = strokeFor(edge.kind);
      ctx.beginPath();
      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = style.width;
      ctx.setLineDash(style.dash);
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const length = 8;
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - length * Math.cos(angle - 0.45), end.y - length * Math.sin(angle - 0.45));
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - length * Math.cos(angle + 0.45), end.y - length * Math.sin(angle + 0.45));
      ctx.stroke();
      const text = caption(edge);
      if (text) {
        const mx = (start.x + end.x) / 2;
        const my = (start.y + end.y) / 2 - 8;
        ctx.setLineDash([]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = palette.paper;
        ctx.strokeText(text, mx, my);
        ctx.fillStyle = palette.ink;
        ctx.fillText(text, mx, my);
      }
      segments.push({ edge, x0: start.x, y0: start.y, x1: end.x, y1: end.y });
    }
    ctx.setLineDash([]);
  }

  function clientToModel(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;
    return {
      x: (clientX - originX - panX) / zoom,
      y: (clientY - originY - panY) / zoom,
    };
  }

  function hitEdge(event) {
    const point = clientToModel(event.clientX, event.clientY);
    let best = null;
    let bestDist = 8 / zoom;
    for (const segment of segments) {
      const dist = segmentDistance(point.x, point.y, segment.x0, segment.y0, segment.x1, segment.y1);
      if (dist <= bestDist) {
        best = segment;
        bestDist = dist;
      }
    }
    return best?.edge ?? null;
  }

  function showPopover(edge, event) {
    popover.replaceChildren();
    const title = el("p", "compass-popover-title");
    title.textContent = edge.attribute || "Untyped";
    popover.append(title);
    for (const label of edge.labels ?? []) {
      const line = el("p", "compass-popover-label");
      line.textContent = `${label.attribute}: ${label.text ?? ""}`;
      popover.append(line);
    }
    const open = el("button", "compass-popover-open");
    open.type = "button";
    open.textContent = "Open source";
    open.disabled = !edge.sourceUid;
    open.addEventListener("click", () => {
      if (!edge.sourceUid) return;
      void commitAction({ type: "open", sourceUid: edge.sourceUid });
    });
    const form = el("form", "compass-annotate");
    const field = textInput("Attribute: text");
    field.className = "compass-annotate-text";
    const submit = el("button", "compass-annotate-submit");
    submit.type = "submit";
    submit.textContent = "Annotate";
    form.append(field, submit);
    form.addEventListener("submit", (submitEvent) => {
      submitEvent.preventDefault();
      const parsed = parseAnnotation(field.value);
      if (!edge.sourceUid || !parsed.attribute || parsed.attribute.includes("::") || !parsed.text) {
        setStatus("Use Attribute: text");
        return;
      }
      void commitAction({
        type: "annotate",
        sourceUid: edge.sourceUid,
        attribute: parsed.attribute,
        text: parsed.text,
      });
    });
    popover.append(open, form);
    popover.hidden = false;
    const rect = root.getBoundingClientRect();
    const left = Math.max(8, Math.min(event.clientX - rect.left, rect.width - 230));
    const top = Math.max(8, Math.min(event.clientY - rect.top + 8, Math.max(8, rect.height - 180)));
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function openMapped(uid, kind) {
    const page = kind !== "outline" && !lastModel?.blockUids?.has(uid);
    return host.openNode(uid, page).catch((error) => console.error("[compass]", error));
  }

  function onNodeClick(event, node) {
    if (suppressClick) return;
    if (event.shiftKey) {
      void openMapped(node.uid, node.kind);
      return;
    }
    cancelDelay(clickTimer);
    clickTimer = delay(() => {
      clickTimer = null;
      void showUid(node.uid, true);
    }, 220);
  }

  async function commitAction(action) {
    setStatus("Writing…");
    try {
      const result = await host.commit(action);
      if (!result?.ok && result?.reason === "lock") {
        setStatus("Another tab is writing this center");
        return;
      }
      if (!result?.ok || result.empty) {
        setStatus("Nothing to change");
        return;
      }
      if (result.model && result.model.fixture?.center?.uid === current && !root.hidden) {
        paint(result.model);
        const settings = readCompassSettings(extensionAPI);
        renderPins(settings.pins);
        renderLensList(settings.lenses);
        await host.syncSidecar(current, settings.sidecar);
        placeFrame();
      } else {
        await reload();
      }
      setStatus("");
    } catch (error) {
      console.error("[compass] write failed", error);
      setStatus("Write failed");
      try {
        await reload();
      } catch (reloadError) {
        console.error("[compass] pull failed", reloadError);
      }
    }
  }

  function gutterAt(x, y) {
    const stack = document.elementsFromPoint?.(x, y) ?? [];
    for (const item of stack) {
      if (!item?.closest || !root.contains(item) || item.closest(".compass-ghost")) continue;
      const gutter = item.closest(".compass-gutter");
      if (gutter) return gutter.dataset.zone || null;
    }
    return null;
  }

  function setHotGutter(zone) {
    for (const gutter of root.querySelectorAll(".compass-gutter")) {
      gutter.classList.toggle("compass-gutter-hot", Boolean(zone) && gutter.dataset.zone === zone);
    }
  }

  function showGhost(title, x, y) {
    ghost.hidden = false;
    ghost.textContent = title || "";
    const rect = root.getBoundingClientRect();
    ghost.style.left = `${x - rect.left + 8}px`;
    ghost.style.top = `${y - rect.top + 8}px`;
    root.classList.add("compass-dragging");
  }

  function onPointerDown(event) {
    if (root.hidden || event.button !== 0 || pointer) return;
    const target = event.target;
    if (target?.closest?.(".compass-open")) return;
    const node = target?.closest?.(".compass-node");
    if (node && root.contains(node)) {
      if (!event.shiftKey) {
        const edge = writableEdge(node.dataset.uid);
        if (edge) {
          pointer = {
            type: "node",
            uid: node.dataset.uid,
            edge,
            x: event.clientX,
            y: event.clientY,
            title: node.textContent || "",
            moved: false,
          };
        }
      }
      return;
    }
    if (target?.closest?.(".compass-bar, .compass-side, .compass-popover, .compass-results, .compass-gutter")) return;
    if (target !== stage && !stage.contains(target)) return;
    pointer = { type: "pan", x: event.clientX, y: event.clientY, panX, panY, moved: false };
  }

  function onPointerMove(event) {
    if (!pointer) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!pointer.moved && Math.hypot(dx, dy) < 4) return;
    pointer.moved = true;
    if (pointer.type === "pan") {
      panX = pointer.panX + dx;
      panY = pointer.panY + dy;
      applyTransform();
      return;
    }
    showGhost(pointer.title, event.clientX, event.clientY);
    setHotGutter(gutterAt(event.clientX, event.clientY));
  }

  function onPointerUp(event) {
    if (!pointer) return;
    const active = pointer;
    pointer = null;
    const zone = active.type === "node" && active.moved ? gutterAt(event.clientX, event.clientY) : null;
    setHotGutter(null);
    hideGhost();
    if (active.type !== "node" || !active.moved) return;
    suppressClick = true;
    delay(() => { suppressClick = false; }, 0);
    if (zone) void relink(active.edge, active.uid, zone);
  }

  function relink(edge, uid, zone) {
    const node = (lastModel?.classified?.nodes ?? []).find((item) => item.uid === uid);
    return commitAction({
      type: "relink",
      sourceUid: edge.sourceUid,
      valueUid: uid,
      toZone: zone,
      title: node?.title ?? "",
    });
  }

  function renderPins(pins) {
    pinList.replaceChildren();
    for (const pin of pins ?? []) {
      const row = el("div", "compass-pin-row");
      const jump = el("button", "compass-pin-jump");
      jump.type = "button";
      jump.textContent = pin.title || pin.uid;
      jump.addEventListener("click", () => { void showUid(pin.uid, true); });
      const remove = el("button", "compass-pin-remove");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => { void unpin(pin.uid); });
      row.append(jump, remove);
      pinList.append(row);
    }
  }

  async function pinCurrent() {
    if (!current || !lastModel) return;
    const settings = readCompassSettings(extensionAPI);
    if (settings.pins.some((pin) => pin.uid === current)) return;
    const pins = settings.pins.concat([{ uid: current, title: centerLabel(lastModel.fixture?.center) }]);
    if (extensionAPI.settings.canSet !== false) await extensionAPI.settings.set(SETTING_IDS.pins, pins);
    renderPins(pins);
  }

  async function unpin(uid) {
    const settings = readCompassSettings(extensionAPI);
    const pins = settings.pins.filter((pin) => pin.uid !== uid);
    if (extensionAPI.settings.canSet !== false) await extensionAPI.settings.set(SETTING_IDS.pins, pins);
    renderPins(pins);
  }

  function renderLensList(lenses) {
    lensList.replaceChildren();
    for (const lens of lenses ?? []) {
      const row = el("div", "compass-lens-row");
      const apply = el("button", "compass-lens-apply");
      apply.type = "button";
      apply.textContent = lens.name;
      apply.addEventListener("click", () => {
        keywordInput.value = lens.keyword ?? "";
        includeInput.value = (lens.attributes?.include ?? []).join(", ");
        excludeInput.value = (lens.attributes?.exclude ?? []).join(", ");
        kindsInput.value = (lens.kinds?.include ?? []).join(", ");
        lensNameInput.value = lens.name;
        lensMode = "reflow";
        activeLens = readLensForm();
        if (lastModel) paint(lastModel);
      });
      const remove = el("button", "compass-lens-delete");
      remove.type = "button";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => { void deleteLens(lens.name); });
      row.append(apply, remove);
      lensList.append(row);
    }
  }

  async function saveLens() {
    const name = lensNameInput.value.trim();
    if (!name) {
      setStatus("Name the lens");
      return;
    }
    const settings = readCompassSettings(extensionAPI);
    const lenses = settings.lenses.filter((item) => item.name !== name);
    lenses.push({ name, ...readLensForm() });
    if (extensionAPI.settings.canSet !== false) await extensionAPI.settings.set(SETTING_IDS.lenses, lenses);
    renderLensList(lenses);
    setStatus("");
  }

  async function deleteLens(name) {
    const settings = readCompassSettings(extensionAPI);
    const lenses = settings.lenses.filter((item) => item.name !== name);
    if (extensionAPI.settings.canSet !== false) await extensionAPI.settings.set(SETTING_IDS.lenses, lenses);
    renderLensList(lenses);
  }

  function applyLensMode(mode) {
    lensMode = mode;
    activeLens = readLensForm();
    if (lastModel) paint(lastModel);
  }

  function renderResults(rows) {
    results.replaceChildren();
    if (!rows.length) {
      const empty = el("div", "compass-result");
      empty.textContent = "No pages";
      results.append(empty);
      results.hidden = false;
      activeResult = -1;
      return;
    }
    activeResult = 0;
    rows.forEach((row, index) => {
      const button = el("button", "compass-result");
      button.type = "button";
      button.dataset.uid = row.uid;
      button.textContent = row.title;
      if (index === 0) button.classList.add("compass-result-active");
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        hideResults();
        void showUid(row.uid, true);
      });
      results.append(button);
    });
    results.hidden = false;
  }

  function markResults() {
    const items = [...results.querySelectorAll(".compass-result")];
    items.forEach((item, index) => {
      item.classList.toggle("compass-result-active", index === activeResult);
    });
    items[activeResult]?.scrollIntoView?.({ block: "nearest" });
  }

  function runSearch() {
    const text = searchInput.value.trim();
    if (!text) {
      hideResults();
      return;
    }
    try {
      renderResults(host.search(text));
    } catch (error) {
      console.error("[compass] search failed", error);
      setStatus("Page search failed");
      hideResults();
    }
  }

  function onSearchKey(event) {
    const items = [...results.querySelectorAll(".compass-result[data-uid]")];
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!items.length) return;
      activeResult = Math.min(items.length - 1, activeResult + 1);
      markResults();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!items.length) return;
      activeResult = Math.max(0, activeResult - 1);
      markResults();
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[activeResult] || items[0];
      if (!item?.dataset?.uid) return;
      hideResults();
      void showUid(item.dataset.uid, true);
    } else if (event.key === "Escape" && !results.hidden) {
      event.preventDefault();
      event.stopPropagation();
      hideResults();
    }
  }

  function onKey(event) {
    if (root.hidden || event.key !== "Escape") return;
    if (!results.hidden) {
      hideResults();
      event.preventDefault();
      return;
    }
    if (!popover.hidden) {
      hidePopover();
      event.preventDefault();
      return;
    }
    close();
    event.preventDefault();
  }

  function onWheel(event) {
    if (root.hidden) return;
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;
    const modelX = (event.clientX - originX - panX) / zoom;
    const modelY = (event.clientY - originY - panY) / zoom;
    const next = Math.min(2.5, Math.max(0.4, zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
    panX = event.clientX - originX - modelX * next;
    panY = event.clientY - originY - modelY * next;
    zoom = next;
    applyTransform();
  }

  async function toggleOutline() {
    const settings = readCompassSettings(extensionAPI);
    const next = !settings.outline;
    if (extensionAPI.settings.canSet !== false) await extensionAPI.settings.set(SETTING_IDS.outline, next);
    outlineButton.setAttribute("aria-pressed", next ? "true" : "false");
    if (!root.hidden && current) await reload();
  }

  lifecycle.node(root, document.body);
  lifecycle.event(closeButton, "click", () => close());
  lifecycle.event(backButton, "click", () => { void goBack(); });
  lifecycle.event(forwardButton, "click", () => { void goForward(); });
  lifecycle.event(pinButton, "click", () => {
    void pinCurrent().catch((error) => console.error("[compass]", error));
  });
  lifecycle.event(outlineButton, "click", () => {
    void toggleOutline().catch((error) => console.error("[compass]", error));
  });
  lifecycle.event(keepButton, "click", () => applyLensMode("keep"));
  lifecycle.event(reflowButton, "click", () => applyLensMode("reflow"));
  lifecycle.event(saveButton, "click", () => {
    void saveLens().catch((error) => console.error("[compass]", error));
  });
  lifecycle.event(searchInput, "input", () => {
    cancelDelay(searchTimer);
    searchTimer = delay(() => {
      searchTimer = null;
      runSearch();
    }, 80);
  });
  lifecycle.event(searchInput, "keydown", onSearchKey);
  lifecycle.event(stage, "click", (event) => {
    const target = event.target;
    if (target?.closest?.(".compass-node, .compass-open, .compass-gutter, .compass-center, .compass-overflow, .compass-slot")) {
      return;
    }
    const hit = hitEdge(event);
    if (hit) showPopover(hit, event);
    else hidePopover();
  });
  lifecycle.event(stage, "wheel", onWheel, { passive: false });
  lifecycle.event(root, "pointerdown", onPointerDown);
  lifecycle.event(globalThis, "pointermove", onPointerMove);
  lifecycle.event(globalThis, "pointerup", onPointerUp);
  lifecycle.event(globalThis, "pointercancel", onPointerUp);
  lifecycle.event(globalThis, "resize", () => { if (!root.hidden) placeFrame(); });
  lifecycle.event(document, "keydown", onKey);
  lifecycle.add(() => {
    for (const id of timers) globalThis.clearTimeout(id);
    timers.clear();
    if (watchTimer != null) globalThis.clearTimeout(watchTimer);
    root.hidden = true;
  });
  host.setScheduler(scheduleReload);
  applyTransform();
  updateHistory();

  const view = { repullIfOpen, toggle, focusPage, focusBlock };
  return {
    ...view,
    installCommands() {
      return registerCommands({ extensionAPI, lifecycle, host, view });
    },
  };
}
