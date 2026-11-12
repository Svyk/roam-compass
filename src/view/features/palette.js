import { rankTitles } from "../../model/search.js";

function escapeSelector(value) {
  if (typeof globalThis.CSS?.escape === "function") return globalThis.CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

export function createPalette(ctx) {
  let isOpen = false;
  let allCommands = [];
  let shown = [];
  let activeIndex = 0;
  let savedUid = null;
  let savedKey = null;

  let backdrop = null;
  let dialog = null;
  let input = null;
  let listEl = null;

  if (ctx?.el && ctx?.button && ctx?.lifecycle && ctx?.dom?.root) {
    backdrop = ctx.el("div", "compass-palette-backdrop");
    backdrop.hidden = true;

    dialog = ctx.el("div", "compass-palette");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Command palette");

    input = ctx.el("input", "compass-palette-input");
    input.type = "text";
    input.autocomplete = "off";
    input.placeholder = "Type a command";
    input.setAttribute("aria-label", "Type a command");

    listEl = ctx.el("div", "compass-palette-list");
    listEl.setAttribute("role", "listbox");

    dialog.append(input, listEl);
    backdrop.append(dialog);
    ctx.lifecycle.node(backdrop, ctx.dom.root);

    ctx.lifecycle.event(backdrop, "pointerdown", (event) => {
      event.stopPropagation();
      if (event.target === backdrop) closePalette(true);
    });
    ctx.lifecycle.event(backdrop, "click", (event) => {
      event.stopPropagation();
    });
    ctx.lifecycle.event(listEl, "mousedown", (event) => {
      event.preventDefault();
    });
    ctx.lifecycle.event(listEl, "click", (event) => {
      const row = event.target?.closest?.(".compass-palette-item");
      if (!row) return;
      const index = Number(row.dataset.index);
      if (Number.isInteger(index) && shown[index]) execute(shown[index]);
    });
    ctx.lifecycle.event(input, "input", () => {
      filterCommands(input.value);
    });
    ctx.lifecycle.event(dialog, "keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        if (!shown.length) return;
        activeIndex = Math.min(shown.length - 1, activeIndex + 1);
        markActive();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        if (!shown.length) return;
        activeIndex = Math.max(0, activeIndex - 1);
        markActive();
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        const chosen = shown[activeIndex];
        if (chosen) execute(chosen);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closePalette(true);
      }
    });
  }

  function collectCommands() {
    const raw = ctx?.commands?.() ?? [];
    const seenIds = new Set();
    const out = [];
    for (let index = 0; index < raw.length; index += 1) {
      const cmd = raw[index];
      if (!cmd || typeof cmd.run !== "function") continue;
      const title = typeof cmd.title === "string" ? cmd.title.trim() : "";
      if (!title) continue;
      const hasId = typeof cmd.id === "string" && cmd.id.trim() !== "";
      const id = hasId ? cmd.id.trim() : "";
      if (id) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
      }
      out.push({
        key: id || `__cmd_${index}`,
        id,
        title,
        hint: typeof cmd.hint === "string" ? cmd.hint.trim() : "",
        run: cmd.run,
      });
    }
    return out;
  }

  function markActive() {
    if (!listEl) return;
    const rows = [...listEl.querySelectorAll(".compass-palette-item")];
    rows.forEach((row, index) => {
      const active = index === activeIndex;
      row.classList.toggle("compass-palette-item-active", active);
      row.setAttribute("aria-selected", active ? "true" : "false");
    });
    rows[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  }

  function renderList() {
    if (!listEl) return;
    listEl.replaceChildren();
    if (!shown.length) {
      listEl.append(ctx.el("div", "compass-palette-empty", "No matching commands"));
      return;
    }
    for (let index = 0; index < shown.length; index += 1) {
      const cmd = shown[index];
      const active = index === activeIndex;
      const item = ctx.button(
        `compass-palette-item${active ? " compass-palette-item-active" : ""}`,
      );
      item.dataset.index = String(index);
      if (cmd.id) item.dataset.command = cmd.id;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", active ? "true" : "false");
      item.append(ctx.el("span", "compass-palette-title", cmd.title));
      if (cmd.hint) item.append(ctx.el("span", "compass-palette-hint", cmd.hint));
      listEl.append(item);
    }
  }

  function filterCommands(rawQuery) {
    const query = String(rawQuery ?? "").trim();
    if (!query) {
      shown = [...allCommands];
    } else {
      const byKey = new Map(allCommands.map((cmd) => [cmd.key, cmd]));
      const adapted = allCommands.map((cmd) => ({ uid: cmd.key, title: cmd.title }));
      const ranked = rankTitles(adapted, query, Math.max(50, allCommands.length));
      shown = ranked.map((entry) => byKey.get(entry.uid)).filter(Boolean);
    }
    activeIndex = shown.length ? 0 : -1;
    renderList();
  }

  function restoreNodeFocus() {
    const uid = savedUid;
    const key = savedKey;
    savedUid = null;
    savedKey = null;
    if (!ctx?.state?.isOpen) return;
    const world = ctx?.dom?.world;
    let target = null;
    if (key && world) {
      target = world.querySelector(`.compass-node[data-key="${escapeSelector(key)}"]`);
    }
    if (!target && uid) {
      target = ctx?.state?.nodeEls?.get?.(uid)
        ?? world?.querySelector?.(`.compass-node[data-uid="${escapeSelector(uid)}"]`)
        ?? null;
    }
    if (target?.isConnected) target.focus({ preventScroll: true });
  }

  function closePalette(restore = true) {
    if (!isOpen) return;
    isOpen = false;
    if (backdrop) backdrop.hidden = true;
    if (listEl) listEl.replaceChildren();
    shown = [];
    allCommands = [];
    activeIndex = 0;
    if (restore) restoreNodeFocus();
    else {
      savedUid = null;
      savedKey = null;
    }
  }

  function execute(cmd) {
    closePalette(true);
    if (ctx?.guard) ctx.guard(cmd.run)();
    else cmd.run();
  }

  function open() {
    if (!isOpen) {
      const active = globalThis.document?.activeElement;
      const nodeEl = active?.closest?.(".compass-node");
      if (nodeEl && ctx?.dom?.root?.contains?.(nodeEl)) {
        savedUid = nodeEl.dataset.uid || null;
        savedKey = nodeEl.dataset.key || null;
      } else {
        savedUid = null;
        savedKey = null;
      }
    }
    ctx?.hideFloating?.();
    allCommands = collectCommands();
    isOpen = true;
    if (input) input.value = "";
    filterCommands("");
    if (backdrop) backdrop.hidden = false;
    input?.focus({ preventScroll: true });
  }

  function onEscape() {
    if (!isOpen) return false;
    closePalette(true);
    return true;
  }

  function onClose() {
    closePalette(false);
  }

  function stageMenu() {
    return [
      { title: "Command palette…", run: () => open() },
      { title: "Keyboard help", run: () => ctx?.features?.get?.("keys")?.help?.() },
    ];
  }

  return {
    name: "palette",
    open,
    onEscape,
    onClose,
    stageMenu,
  };
}
