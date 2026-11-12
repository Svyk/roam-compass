import { apiHas, filterBoards, needsBoardFilter, pickerBoards, savedViews } from "../../model/boards.js";
import {
  addFailure,
  BASIC_LIMIT,
  cardText,
  cardsAt,
  centerCardUid,
  connectPayload,
  edgesForAdded,
  placeBelow,
  SEND_LIMIT,
  sendPlan,
  sendSummary,
} from "../../model/board-send.js";

const DIAGRAM_EVENTS = ["change", "mount", "unmount"];
const RELOAD_MS = 300;
const EMPTY_BOARDS = "No boards found. Open a board once, or update Plexus Diagram.";
const BRACKET_STATUS = "That title contains brackets, so it cannot be a card.";
const SWITCH_STATUS = "Switch to the Compass view to send the map.";
const SEND_TITLE = "Send map to board…";
const ADD_TITLE = "Add to board…";

function diagramApi() {
  const api = globalThis.window?.PlexusDiagram;
  return api && typeof api.boardsWith === "function" ? api : null;
}

function inCompass(ctx) {
  const view = ctx.features?.get?.("views")?.current?.()?.view;
  return !view || view === "compass";
}

function fullWrite(api) {
  return apiHas(api, "addSection") && apiHas(api, "addCards") && apiHas(api, "connect");
}

export function createBoards(ctx) {
  if (!ctx?.dom?.root) return { name: "boards" };

  const { el, button, lifecycle, dom } = ctx;
  let diagram = null;
  let reloadTimer = null;
  let openButton = null;
  let returnFocus = null;

  const backdrop = el("div", "compass-board-backdrop");
  backdrop.hidden = true;
  lifecycle.node(backdrop, dom.root);

  function onDiagramEvent() {
    queueReload();
  }

  function unsubscribe() {
    const api = diagram;
    diagram = null;
    if (!api || typeof api.removeEventListener !== "function") return;
    for (const type of DIAGRAM_EVENTS) {
      try {
        api.removeEventListener(type, onDiagramEvent);
      } catch {
        // The diagram is already gone.
      }
    }
  }

  function subscribe() {
    const api = diagramApi();
    if (api === diagram) return;
    unsubscribe();
    if (!api) return;
    diagram = api;
    if (typeof api.addEventListener !== "function") return;
    for (const type of DIAGRAM_EVENTS) {
      try {
        api.addEventListener(type, onDiagramEvent);
      } catch {
        // A stub API can still be read.
      }
    }
  }

  function queueReload() {
    if (!ctx.state?.isOpen || typeof ctx.later !== "function") return;
    if (typeof ctx.cancel === "function") reloadTimer = ctx.cancel(reloadTimer);
    reloadTimer = ctx.later(() => {
      reloadTimer = null;
      if (ctx.state?.isOpen) ctx.load?.();
    }, RELOAD_MS);
  }

  function onReady() {
    subscribe();
    queueReload();
  }

  function onUnload() {
    unsubscribe();
    queueReload();
  }

  const win = globalThis.window ?? globalThis;
  if (win && typeof win.addEventListener === "function") {
    lifecycle.event(win, "plexus-diagram:ready", onReady);
    lifecycle.event(win, "plexus-diagram:unload", onUnload);
  }
  subscribe();

  function clearOpenButton() {
    openButton?.remove?.();
    openButton = null;
  }

  function showOpenButton(boardUid, cardUid) {
    clearOpenButton();
    const opener = button("compass-board-open", "Open board", "Open board");
    opener.addEventListener("click", () => {
      clearOpenButton();
      const opts = cardUid ? { card: cardUid } : {};
      ctx.openBoard?.(boardUid, opts);
    });
    if (dom.bar && dom.status && typeof dom.bar.insertBefore === "function") {
      dom.bar.insertBefore(opener, dom.status);
    } else {
      dom.root.append(opener);
    }
    openButton = opener;
  }

  function closeDialog(restore = true) {
    backdrop.hidden = true;
    backdrop.replaceChildren();
    const back = returnFocus;
    returnFocus = null;
    if (restore && back?.isConnected) back.focus?.({ preventScroll: true });
  }

  function menuPoint() {
    const rect = typeof dom.root.getBoundingClientRect === "function"
      ? dom.root.getBoundingClientRect()
      : { left: 0, top: 0 };
    const left = Number.parseFloat(dom.menu?.style?.left);
    const top = Number.parseFloat(dom.menu?.style?.top);
    return {
      x: rect.left + (Number.isFinite(left) ? left : 24),
      y: rect.top + (Number.isFinite(top) ? top : 48) - 6,
    };
  }

  function subjectFor(uid, node) {
    if (node?.style === "board" || node?.style === "card" || node?.style === "group" || node?.kind === "group") {
      return null;
    }
    const center = ctx.state?.hood?.center;
    const source = node ?? (center && uid === center.uid ? center : null);
    if (!source || (source.kind !== "page" && source.kind !== "block")) return null;
    const shaped = source.kind === "block" ? source : { ...source, kind: "page" };
    return {
      uid: source.uid,
      kind: source.kind,
      title: typeof source.title === "string" ? source.title : "",
      text: cardText(shaped),
    };
  }

  function chooseBoard(board, request) {
    if (board.already && request.mode === "add") return;
    if (request.mode === "add") void addOne(board, request.subject);
    else openConfirm(board);
  }

  function boardLabel(board, request) {
    if (board.already && request.mode === "add") return `${board.label} (already on it)`;
    return board.label;
  }

  function appendBoards(menu, boards, request) {
    const items = [];
    for (const board of boards) {
      const item = ctx.menuItem(boardLabel(board, request), () => chooseBoard(board, request));
      item.classList.add("compass-board-pick");
      if (board.already && request.mode === "add") item.setAttribute("aria-disabled", "true");
      items.push(item);
    }
    return items;
  }

  function openFiltered(menu, boards, request) {
    const input = el("input", "compass-board-filter");
    input.type = "search";
    input.placeholder = "Filter boards";
    input.setAttribute("aria-label", "Filter boards");
    input.autocomplete = "off";
    input.spellcheck = false;
    menu.append(input);
    let active = 0;
    let shown = boards;

    function paint(resetActive) {
      if (resetActive) active = 0;
      shown = filterBoards(boards, input.value);
      for (const child of [...menu.children]) {
        if (child !== input) child.remove();
      }
      if (!shown.length) {
        const empty = button("compass-menu-item compass-board-none", "No boards match.");
        empty.disabled = true;
        empty.setAttribute("role", "menuitem");
        menu.append(empty);
        active = 0;
        return;
      }
      const items = appendBoards(menu, shown, request);
      if (active >= items.length) active = items.length - 1;
      if (active < 0) active = 0;
      items.forEach((item, index) => item.classList.toggle("compass-board-active", index === active));
      items[active]?.scrollIntoView?.({ block: "nearest" });
    }

    input.addEventListener("input", () => paint(true));
    input.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter" && event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        ctx.hideFloating?.();
        return;
      }
      if (event.key === "Enter") {
        const board = shown[active];
        if (!board) return;
        ctx.hideFloating?.();
        chooseBoard(board, request);
        return;
      }
      if (!shown.length) return;
      active += event.key === "ArrowDown" ? 1 : -1;
      if (active < 0) active = shown.length - 1;
      if (active >= shown.length) active = 0;
      paint(false);
    });
    paint(true);
    input.focus?.({ preventScroll: true });
  }

  function openPicker(request) {
    const point = menuPoint();
    const centerUid = ctx.state?.hood?.center?.uid ?? "";
    const boards = pickerBoards(diagramApi(), {
      centerUid,
      nodeUid: request.subject?.uid ?? "",
      markHeld: request.mode === "add",
    });
    ctx.hideFloating?.();
    const menu = dom.menu;
    if (!boards.length) {
      const empty = button("compass-menu-item compass-board-none", EMPTY_BOARDS);
      empty.disabled = true;
      empty.setAttribute("role", "menuitem");
      menu.append(empty);
    } else if (needsBoardFilter(boards.length)) {
      openFiltered(menu, boards, request);
    } else {
      appendBoards(menu, boards, request);
      menu.querySelector("button")?.focus?.({ preventScroll: true });
    }
    ctx.placeFloating?.(menu, point.x, point.y);
  }

  async function addOne(board, subject) {
    if (!subject?.text) {
      ctx.setStatus?.(BRACKET_STATUS, true);
      return;
    }
    const api = diagramApi();
    if (typeof api?.addCard !== "function") {
      ctx.setStatus?.("Plexus Diagram could not add the card.");
      return;
    }
    let cards = [];
    if (typeof api.cardsOf === "function") {
      try {
        const value = api.cardsOf(board.uid);
        cards = Array.isArray(value) ? value : [];
      } catch {
        cards = [];
      }
    }
    const at = placeBelow(cards);
    try {
      await api.addCard(board.uid, { ref: subject.text, at });
      if (ctx.state?.isOpen) ctx.setStatus?.(`Added to ${board.title}.`, true);
    } catch (error) {
      if (ctx.state?.isOpen) ctx.setStatus?.(addFailure(error));
    }
  }

  function drawnNodes() {
    const hood = ctx.state?.hood;
    const center = hood?.center;
    if (!center?.uid) return null;
    const byUid = new Map();
    for (const node of hood.nodes ?? []) {
      if (node?.uid) byUid.set(node.uid, node);
    }
    const nodes = [];
    const elements = typeof dom.root.querySelectorAll === "function"
      ? dom.root.querySelectorAll(".compass-node")
      : [];
    for (const element of elements) {
      if (element.classList?.contains("compass-node-center")) continue;
      if (element.classList?.contains("compass-fade")) continue;
      const node = byUid.get(element.dataset?.uid);
      if (!node) continue;
      if (node.style === "board" || node.style === "card" || node.style === "group" || node.kind === "group") continue;
      nodes.push(node);
    }
    return { center, nodes };
  }

  function summaryFor(plan, board, full, drawArrows) {
    const basic = !full;
    let text = sendSummary({
      count: plan.cards.length,
      boardLabel: board.title,
      sectionTitle: full ? plan.sectionTitle : "",
      arrows: full && drawArrows ? plan.edges.length : 0,
      basic,
      omitted: plan.omitted,
    });
    if (basic && plan.cards.length > BASIC_LIMIT) {
      text += " Compass can send at most 20 cards this way.";
    }
    return text;
  }

  function trapDialog(event, dialog) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll("button, input, [href], [tabindex]")].filter((node) => {
      if (node.disabled || node.hidden) return false;
      return node.tabIndex !== -1;
    });
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = globalThis.document?.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus?.();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus?.();
    }
  }

  async function writeFull(api, board, plan, drawArrows) {
    const section = await api.addSection(board.uid, {
      title: plan.sectionTitle,
      w: plan.width,
      h: plan.height,
    });
    const origin = section?.rect && typeof section.rect === "object" ? section.rect : { x: 0, y: 0 };
    const placed = cardsAt(plan.cards, origin);
    const result = await api.addCards(board.uid, placed, { section: section?.uid });
    const added = Array.isArray(result?.added) ? result.added : [];
    if (drawArrows) {
      const payload = connectPayload(edgesForAdded(plan, added));
      if (payload) await api.connect(board.uid, payload);
    }
    return added;
  }

  async function writeBasic(api, board, plan) {
    let existing = [];
    if (typeof api.cardsOf === "function") {
      try {
        const value = api.cardsOf(board.uid);
        existing = Array.isArray(value) ? value : [];
      } catch {
        existing = [];
      }
    }
    const placed = cardsAt(plan.cards, placeBelow(existing));
    const added = [];
    for (const card of placed) {
      const result = await api.addCard(board.uid, { ref: card.text, at: { x: card.x, y: card.y } });
      added.push({ uid: result?.uid ?? "", text: card.text });
    }
    return added;
  }

  async function runSend(board, plan, full, drawArrows) {
    closeDialog(false);
    const api = diagramApi();
    try {
      const added = full
        ? await writeFull(api, board, plan, drawArrows)
        : await writeBasic(api, board, plan);
      if (!ctx.state?.isOpen) return;
      const count = plan.cards.length;
      const word = count === 1 ? "card" : "cards";
      ctx.setStatus?.(`Sent ${count} ${word} to ${board.title}.`, true);
      const centerUid = plan.cards[0]?.uid ?? "";
      showOpenButton(board.uid, centerCardUid(plan, added, centerUid));
    } catch (error) {
      if (!ctx.state?.isOpen) return;
      const text = addFailure(error);
      ctx.setStatus?.(text === "Plexus Diagram could not add the card." ? "Plexus Diagram could not add the cards." : text);
    }
  }

  function openConfirm(board) {
    const pack = drawnNodes();
    if (!pack) return;
    const api = diagramApi();
    const full = fullWrite(api);
    const plan = sendPlan({
      center: pack.center,
      nodes: pack.nodes,
      geometry: ctx.state?.geometry,
      limit: SEND_LIMIT,
    });
    let drawArrows = full;
    returnFocus = globalThis.document?.activeElement ?? null;
    const dialog = el("div", "compass-board-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Send map to board");
    const summary = el("p", "compass-board-summary");
    dialog.append(summary);

    const refused = !full && plan.cards.length > BASIC_LIMIT;
    const sendBtn = button("compass-board-send", "Send");
    const cancelBtn = button("compass-board-cancel", "Cancel");
    sendBtn.disabled = refused || plan.cards.length === 0;

    function paintSummary() {
      summary.textContent = summaryFor(plan, board, full, drawArrows);
    }

    if (full) {
      const row = el("label", "compass-board-check");
      const checkbox = el("input", "compass-board-arrows");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      row.append(checkbox, el("span", "compass-board-check-text", "Draw arrows"));
      dialog.append(row);
      dialog.append(el("p", "compass-board-hint", "Each arrow is a block on the board that links both ends."));
      checkbox.addEventListener("change", () => {
        drawArrows = checkbox.checked;
        paintSummary();
      });
    }

    paintSummary();
    const actions = el("div", "compass-board-actions");
    actions.append(cancelBtn, sendBtn);
    dialog.append(actions);
    cancelBtn.addEventListener("click", () => closeDialog());
    sendBtn.addEventListener("click", () => {
      if (sendBtn.disabled) return;
      sendBtn.disabled = true;
      void runSend(board, plan, full, full && drawArrows);
    });
    dialog.addEventListener("keydown", (event) => trapDialog(event, dialog));
    backdrop.replaceChildren(dialog);
    backdrop.hidden = false;
    (sendBtn.disabled ? cancelBtn : sendBtn).focus?.({ preventScroll: true });
  }

  function startSend() {
    if (!inCompass(ctx)) {
      ctx.setStatus?.(SWITCH_STATUS);
      return;
    }
    openPicker({ mode: "send" });
  }

  function nodeMenu(uid, node) {
    if (node?.style === "board") {
      return savedViews(diagramApi(), uid).map((view) => ({
        title: view.title,
        run: () => ctx.openBoard?.(uid, { view: view.uid }),
      }));
    }
    const subject = subjectFor(uid, node);
    if (!subject) return [];
    return [{ title: ADD_TITLE, run: () => openPicker({ mode: "add", subject }) }];
  }

  function stageMenu() {
    if (!inCompass(ctx)) return [];
    return [{ title: SEND_TITLE, run: startSend }];
  }

  function commands() {
    return [{ id: "send-to-board", title: SEND_TITLE, run: startSend }];
  }

  function onEscape() {
    if (backdrop.hidden) return false;
    closeDialog();
    return true;
  }

  function onClose() {
    closeDialog(false);
    clearOpenButton();
    if (typeof ctx.cancel === "function") reloadTimer = ctx.cancel(reloadTimer);
  }

  lifecycle.event(backdrop, "click", (event) => {
    if (event.target === backdrop) closeDialog();
  });
  lifecycle.add(() => {
    if (typeof ctx.cancel === "function") reloadTimer = ctx.cancel(reloadTimer);
    unsubscribe();
    clearOpenButton();
  });

  return {
    name: "boards",
    nodeMenu,
    stageMenu,
    commands,
    onEscape,
    onClose,
  };
}
