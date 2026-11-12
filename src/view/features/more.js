export const MORE_COMMAND_IDS = Object.freeze([
  "fit",
  "refresh",
  "linked",
  "cross",
  "with-links",
  "send",
  "send-to-board",
  "draw-map",
  "export-image",
  "export-outline",
  "export-breadcrumbs",
  "wander",
  "zen",
  "fullscreen",
  "keys-help",
  "palette",
]);

export function createMore(ctx) {
  if (!ctx?.dom?.root || !ctx?.dom?.menu || typeof ctx?.addBarButton !== "function") {
    return {
      name: "more",
      open() {},
      close() {},
      toggle() {},
    };
  }

  const { button, lifecycle, dom } = ctx;
  const moreBtn = button("compass-more", "More", "More actions");
  moreBtn.setAttribute("aria-haspopup", "menu");
  moreBtn.setAttribute("aria-expanded", "false");
  ctx.addBarButton(moreBtn);

  let firstItem = null;
  let closedOnPointerDown = false;

  function isOpen() {
    return Boolean(firstItem && !dom.menu.hidden && dom.menu.contains(firstItem));
  }

  function syncButton() {
    moreBtn.setAttribute("aria-expanded", isOpen() ? "true" : "false");
  }

  function close({ restoreFocus = false } = {}) {
    if (!isOpen()) {
      firstItem = null;
      syncButton();
      return;
    }
    firstItem = null;
    ctx.hideFloating?.();
    syncButton();
    if (restoreFocus && moreBtn.isConnected) {
      moreBtn.focus?.({ preventScroll: true });
    }
  }

  function open() {
    ctx.hideFloating?.();
    firstItem = null;
    const byId = new Map();
    for (const cmd of ctx.commands?.() ?? []) {
      if (!cmd || typeof cmd.id !== "string" || !cmd.id) continue;
      if (typeof cmd.title !== "string" || !cmd.title.trim()) continue;
      if (typeof cmd.run !== "function") continue;
      if (!byId.has(cmd.id)) byId.set(cmd.id, cmd);
    }
    for (const id of MORE_COMMAND_IDS) {
      const cmd = byId.get(id);
      if (!cmd) continue;
      const item = ctx.menuItem(cmd.title, cmd.run);
      item.dataset.command = id;
      if (!firstItem) firstItem = item;
    }
    if (!firstItem) {
      syncButton();
      return;
    }
    const rect = moreBtn.getBoundingClientRect();
    ctx.placeFloating(dom.menu, rect.left, rect.bottom);
    syncButton();
    firstItem.focus?.({ preventScroll: true });
  }

  function toggle() {
    if (isOpen()) close();
    else open();
  }

  lifecycle.event(moreBtn, "pointerdown", (event) => {
    if (event?.button === 0) closedOnPointerDown = isOpen();
  });

  lifecycle.event(moreBtn, "click", (event) => {
    if (closedOnPointerDown && (event?.detail ?? 0) > 0) {
      closedOnPointerDown = false;
      syncButton();
      return;
    }
    closedOnPointerDown = false;
    toggle();
  });

  lifecycle.event(moreBtn, "keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      open();
    }
  });

  const win = globalThis.window ?? globalThis;
  if (typeof win?.addEventListener === "function") {
    lifecycle.event(win, "resize", () => {
      if (!isOpen()) return;
      ctx.frame?.(() => {
        if (!isOpen()) return;
        const rect = moreBtn.getBoundingClientRect();
        ctx.placeFloating(dom.menu, rect.left, rect.bottom);
      });
    });
  }

  lifecycle.event(dom.menu, "keydown", (event) => {
    if (dom.menu.hidden) return;
    if (event.key === "Escape" && isOpen()) {
      event.preventDefault();
      event.stopPropagation();
      close({ restoreFocus: true });
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...dom.menu.querySelectorAll(".compass-menu-item")];
    if (!items.length) return;
    event.preventDefault();
    event.stopPropagation();
    const active = globalThis.document?.activeElement;
    const cur = items.indexOf(active);
    let next = 0;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "ArrowDown") next = cur < 0 ? 0 : (cur + 1) % items.length;
    else if (event.key === "ArrowUp") next = cur <= 0 ? items.length - 1 : cur - 1;
    items[next]?.focus?.({ preventScroll: true });
  });

  if (typeof globalThis.MutationObserver === "function") {
    try {
      const observer = new globalThis.MutationObserver(() => syncButton());
      observer.observe(dom.menu, { attributes: true, attributeFilter: ["hidden"], childList: true });
      lifecycle.add(() => observer.disconnect());
    } catch {
      // Non-DOM test stub — click and close paths still update aria-expanded.
    }
  }

  function onClose() {
    firstItem = null;
    closedOnPointerDown = false;
    syncButton();
  }

  return {
    name: "more",
    open,
    close,
    toggle,
    onClose,
  };
}
