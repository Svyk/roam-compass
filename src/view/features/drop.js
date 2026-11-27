// Drop a Roam block bullet onto the Compass map to center that block (navigation only).

export function draggedBlockUid(target) {
  if (!target || typeof target.closest !== "function") return null;
  if (target.closest(".window-headers")) return null;
  const bullet = target.closest("span.rm-bullet");
  if (!bullet) return null;
  const container = bullet.closest(".roam-block-container");
  const fromAttr = container?.getAttribute?.("data-block-uid");
  if (typeof fromAttr === "string" && fromAttr.trim()) return fromAttr.trim();
  const main = bullet.closest(".rm-block-main");
  const input = main?.querySelector?.(".rm-block__input");
  const id = typeof input?.id === "string" ? input.id.trim() : "";
  if (id.length >= 10 && id[id.length - 10] === "-") {
    const tail = id.slice(-9);
    if (/^[\w-]{9}$/.test(tail)) return tail;
  }
  return null;
}

export function createDrop(ctx) {
  const root = ctx?.dom?.root;
  const stage = ctx?.dom?.stage;
  const doc = globalThis.document;
  if (!root || !stage || !doc || !ctx?.lifecycle || !ctx?.el) {
    return { name: "drop" };
  }

  const hint = ctx.el("div", "compass-drop-hint");
  hint.hidden = true;
  hint.setAttribute("aria-hidden", "true");
  hint.append(ctx.el("div", "compass-drop-pill", "Drop to center this block"));
  ctx.lifecycle.node(hint, stage);

  let draggedUid = null;
  let clearTimer = null;

  function cancelClear() {
    if (clearTimer != null) {
      globalThis.clearTimeout(clearTimer);
      clearTimer = null;
    }
  }

  function showHint() {
    if (hint.hidden) hint.hidden = false;
  }

  function hideHint() {
    if (!hint.hidden) hint.hidden = true;
  }

  function onDragStart(event) {
    cancelClear();
    // Capture-phase observation only: never preventDefault or stopPropagation so Roam keeps its own drag.
    draggedUid = draggedBlockUid(event?.target);
  }

  function onDragEnd() {
    cancelClear();
    draggedUid = null;
    hideHint();
  }

  function onDocDrop() {
    // Capture-phase cleanup only: never preventDefault or stopPropagation.
    // Defer to a macrotask so root's own drop handler still reads draggedUid first.
    cancelClear();
    clearTimer = globalThis.setTimeout(() => {
      clearTimer = null;
      draggedUid = null;
      hideHint();
    }, 0);
  }

  function onDragOver(event) {
    if (!draggedUid || !ctx?.state?.isOpen) return;
    event.preventDefault();
    if (event.dataTransfer) {
      try {
        event.dataTransfer.dropEffect = "link";
      } catch {
        // Synthetic DragEvent in tests may have a read-only or stubbed dataTransfer.
      }
    }
    showHint();
  }

  function onDragLeave(event) {
    if (hint.hidden) return;
    const related = event?.relatedTarget;
    if (related && root.contains(related)) return;
    hideHint();
  }

  function onDrop(event) {
    if (!draggedUid || !ctx?.state?.isOpen) return;
    event.preventDefault();
    cancelClear();
    const uid = draggedUid;
    draggedUid = null;
    hideHint();
    ctx.focusUid?.(uid);
  }

  ctx.lifecycle.event(doc, "dragstart", onDragStart, true);
  ctx.lifecycle.event(doc, "dragend", onDragEnd, true);
  ctx.lifecycle.event(doc, "drop", onDocDrop, true);
  ctx.lifecycle.event(root, "dragover", onDragOver);
  ctx.lifecycle.event(root, "dragleave", onDragLeave);
  ctx.lifecycle.event(root, "drop", onDrop);
  ctx.lifecycle.add?.(() => cancelClear());

  function onClose() {
    cancelClear();
    draggedUid = null;
    hideHint();
  }

  return {
    name: "drop",
    onClose,
  };
}
