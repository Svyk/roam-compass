import { createTrail as createTrailModel, formatRelativeTime } from "../../model/trail.js";
import { copyText } from "../clipboard.js";

function visitCountLabel(count) {
  return `${count} ${count === 1 ? "visit" : "visits"}`;
}

function isAltShortcut(event, letter, code) {
  if (!event?.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (event.code === code) return true;
  return typeof event.key === "string" && event.key.toLowerCase() === letter;
}

export function createTrail(ctx) {
  const trail = createTrailModel();
  const hasDom = Boolean(
    ctx?.dom?.root
    && typeof ctx?.el === "function"
    && typeof ctx?.button === "function"
    && ctx?.lifecycle?.node
    && ctx?.lifecycle?.event,
  );

  let barBtn = null;
  let panel = null;
  let countEl = null;
  let listEl = null;
  let copyBtn = null;
  let startBtn = null;
  let refreshTimer = null;
  let justOpened = false;

  function isPanelOpen() {
    return Boolean(panel && !panel.hidden);
  }

  function stopRefreshTimer() {
    if (refreshTimer != null && typeof ctx?.cancel === "function") {
      refreshTimer = ctx.cancel(refreshTimer);
    } else {
      refreshTimer = null;
    }
  }

  function armRefreshTimer() {
    stopRefreshTimer();
    if (!isPanelOpen() || typeof ctx?.later !== "function") return;
    refreshTimer = ctx.later(() => {
      refreshTimer = null;
      if (!isPanelOpen()) return;
      renderPanel({ preserveScroll: true, preserveFocus: true });
      armRefreshTimer();
    }, 30_000);
  }

  function recordVisit(uid) {
    if (typeof uid !== "string" || !uid.trim()) return;
    const found = ctx?.host?.entity?.(uid) ?? null;
    const entry = found
      ? {
          uid: found.uid || uid,
          kind: found.kind === "block" ? "block" : "page",
          title: found.title || ctx?.titleOf?.(uid) || uid,
        }
      : {
          uid,
          kind: "page",
          title: ctx?.titleOf?.(uid) || uid,
        };
    trail.visit(entry);
  }

  function renderPanel({ preserveScroll = false, preserveFocus = false } = {}) {
    if (!panel || !listEl || !countEl) return;
    const prevScroll = preserveScroll ? listEl.scrollTop : 0;
    const activeSeq = preserveFocus
      ? listEl.querySelector(".compass-trail-row:focus")?.dataset?.seq ?? null
      : null;

    const entries = trail.entries();
    countEl.textContent = visitCountLabel(entries.length);
    const nowMs = Date.now();
    listEl.replaceChildren();

    if (!entries.length) {
      listEl.append(ctx.el("div", "compass-trail-empty", "No visits yet"));
    } else {
      for (const [index, entry] of entries.entries()) {
        const live = ctx?.host?.entity?.(entry.uid) ?? null;
        const missing = live == null;
        if (!missing && live.kind === "page" && live.title && live.title !== entry.title) {
          trail.retitle(entry.uid, live.title);
          entry.title = live.title;
        }
        const row = ctx.button("compass-trail-row");
        row.dataset.uid = entry.uid;
        row.dataset.kind = entry.kind;
        row.dataset.seq = String(entry.seq);
        if (index === 0) {
          row.classList.add("compass-trail-row-current");
          row.setAttribute("aria-current", "true");
        }
        if (missing) {
          row.classList.add("compass-trail-row-missing");
          row.disabled = true;
        }
        const displayTitle = (!missing && live?.title) ? live.title : (entry.title || entry.uid);
        row.title = displayTitle;
        const titleSpan = ctx.el("span", "compass-trail-title", displayTitle);
        const timeSpan = ctx.el("span", "compass-trail-time", formatRelativeTime(entry.at, nowMs));
        row.append(titleSpan, timeSpan);
        listEl.append(row);
      }
    }

    if (copyBtn) copyBtn.disabled = entries.length === 0;
    if (startBtn) startBtn.disabled = entries.length === 0;

    if (preserveScroll && prevScroll > 0) {
      listEl.scrollTop = prevScroll;
    } else {
      listEl.scrollTop = 0;
    }

    if (activeSeq) {
      const target = listEl.querySelector(`.compass-trail-row[data-seq="${activeSeq}"]:not(:disabled)`);
      target?.focus?.({ preventScroll: true });
    }
  }

  function placePanel() {
    if (!panel || !barBtn || typeof ctx?.placeFloating !== "function") return;
    const rect = barBtn.getBoundingClientRect();
    ctx.placeFloating(panel, rect.left, rect.bottom - 2);
  }

  function open() {
    if (!panel || !barBtn) return;
    ctx?.hideFloating?.();
    renderPanel({ preserveScroll: false });
    barBtn.setAttribute("aria-pressed", "true");
    barBtn.setAttribute("aria-expanded", "true");
    placePanel();
    justOpened = true;
    Promise.resolve().then(() => { justOpened = false; });
    armRefreshTimer();
    const newest = listEl.querySelector(".compass-trail-row:not(:disabled)")
      ?? listEl.querySelector(".compass-trail-row")
      ?? copyBtn;
    newest?.focus?.({ preventScroll: true });
  }

  function close({ restoreFocus = false } = {}) {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    stopRefreshTimer();
    if (barBtn) {
      barBtn.setAttribute("aria-pressed", "false");
      barBtn.setAttribute("aria-expanded", "false");
      if (restoreFocus) barBtn.focus({ preventScroll: true });
    }
  }

  function toggle() {
    if (isPanelOpen()) close({ restoreFocus: true });
    else open();
  }

  function startHere() {
    if (trail.size === 0 && ctx?.state?.current) {
      recordVisit(ctx.state.current);
    } else {
      trail.startHere();
    }
    if (isPanelOpen()) {
      renderPanel({ preserveScroll: false });
      const newest = listEl?.querySelector(".compass-trail-row:not(:disabled)") ?? startBtn;
      newest?.focus?.({ preventScroll: true });
    }
  }

  async function copyMarkdown() {
    const count = trail.size;
    const ok = await copyText(trail.markdown());
    ctx?.setStatus?.(ok ? `Copied ${visitCountLabel(count)}` : "Could not copy");
    return ok;
  }

  function chooseRow(uid) {
    if (!uid) return;
    close({ restoreFocus: false });
    ctx?.focusUid?.(uid);
  }

  if (hasDom) {
    barBtn = ctx.button("compass-trail-btn", "Footprints", "Footprints (Alt+H)");
    barBtn.setAttribute("aria-pressed", "false");
    barBtn.setAttribute("aria-expanded", "false");
    ctx.addBarButton?.(barBtn);

    panel = ctx.el("div", "compass-trail-panel");
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Footprints");

    const header = ctx.el("div", "compass-trail-header");
    const heading = ctx.el("span", "compass-trail-heading", "Footprints");
    countEl = ctx.el("span", "compass-trail-count", "0 visits");
    header.append(heading, countEl);

    listEl = ctx.el("div", "compass-trail-list");

    const footer = ctx.el("div", "compass-trail-footer");
    copyBtn = ctx.button("compass-trail-copy", "Copy as Markdown");
    startBtn = ctx.button("compass-trail-start", "Start here");
    footer.append(copyBtn, startBtn);

    panel.append(header, listEl, footer);
    ctx.lifecycle.node(panel, ctx.dom.root);

    ctx.lifecycle.event(barBtn, "click", () => toggle());
    ctx.lifecycle.event(copyBtn, "click", () => { void copyMarkdown(); });
    ctx.lifecycle.event(startBtn, "click", () => startHere());

    ctx.lifecycle.event(listEl, "click", (event) => {
      const row = event.target.closest?.(".compass-trail-row");
      if (!row || row.disabled) return;
      chooseRow(row.dataset.uid);
    });

    ctx.lifecycle.event(panel, "keydown", (event) => {
      const rows = [...listEl.querySelectorAll(".compass-trail-row:not(:disabled)")];
      const activeRow = event.target.closest?.(".compass-trail-row");
      const activeIndex = activeRow ? rows.indexOf(activeRow) : -1;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        if (!rows.length) return;
        const nextIndex = activeIndex < 0 ? 0 : Math.min(rows.length - 1, activeIndex + 1);
        rows[nextIndex].focus({ preventScroll: true });
        rows[nextIndex].scrollIntoView?.({ block: "nearest" });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        if (!rows.length) return;
        const prevIndex = activeIndex < 0 ? 0 : Math.max(0, activeIndex - 1);
        rows[prevIndex].focus({ preventScroll: true });
        rows[prevIndex].scrollIntoView?.({ block: "nearest" });
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        event.stopPropagation();
        if (!rows.length) return;
        listEl.scrollTop = 0;
        rows[0].focus({ preventScroll: true });
        rows[0].scrollIntoView?.({ block: "nearest" });
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        event.stopPropagation();
        if (!rows.length) return;
        const last = rows[rows.length - 1];
        last.focus({ preventScroll: true });
        last.scrollIntoView?.({ block: "nearest" });
        return;
      }
      if (event.key === "Enter" && activeRow && !activeRow.disabled) {
        event.preventDefault();
        event.stopPropagation();
        chooseRow(activeRow.dataset.uid);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close({ restoreFocus: true });
      }
    });

    const onOutside = (event) => {
      if (!isPanelOpen() || justOpened) return;
      const target = event.target;
      if (panel.contains(target) || barBtn.contains(target)) return;
      close({ restoreFocus: false });
    };
    const doc = globalThis.document ?? ctx.dom.root;
    ctx.lifecycle.event(doc, "pointerdown", onOutside);
    ctx.lifecycle.event(doc, "click", onOutside);
    if (globalThis.addEventListener) {
      ctx.lifecycle.event(globalThis, "resize", () => {
        if (isPanelOpen()) placePanel();
      });
    }
    ctx.lifecycle.add(() => stopRefreshTimer());
  }

  return {
    name: "trail",

    entries() {
      return trail.entries();
    },

    markdown() {
      return trail.markdown();
    },

    startHere,
    open,
    close: () => close({ restoreFocus: false }),
    toggle,

    onNavigate({ uid, changed } = {}) {
      if (!uid) return;
      if (changed || trail.size === 0) {
        recordVisit(uid);
        if (isPanelOpen()) {
          renderPanel({ preserveScroll: true });
        }
      }
    },

    afterRender({ hood } = {}) {
      const center = hood?.center;
      if (center?.kind === "page" && center.uid && center.title) {
        const changedCount = trail.retitle(center.uid, center.title);
        if (changedCount > 0 && isPanelOpen()) {
          renderPanel({ preserveScroll: true, preserveFocus: true });
        }
      }
    },

    onClose() {
      close({ restoreFocus: false });
    },

    onEscape() {
      if (!isPanelOpen()) return false;
      close({ restoreFocus: true });
      return true;
    },

    onKey(event) {
      if (isAltShortcut(event, "h", "KeyH")) {
        toggle();
        return true;
      }
      return false;
    },

    commands() {
      return [
        { id: "trail-open", title: "Footprints", hint: "Alt+H", run: () => toggle() },
        { id: "trail-copy", title: "Copy trail as Markdown", hint: "", run: () => copyMarkdown() },
        { id: "trail-start", title: "Start trail here", hint: "", run: () => startHere() },
      ];
    },
  };
}
