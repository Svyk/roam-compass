function makeDragEvent(type, { cancelable = true, relatedTarget = null } = {}) {
  let event;
  if (typeof DragEvent === "function") {
    event = new DragEvent(type, {
      bubbles: true,
      cancelable,
      composed: true,
      relatedTarget,
    });
  } else {
    event = new Event(type, { bubbles: true, cancelable, composed: true });
  }
  if (!event.dataTransfer) {
    const dt = { dropEffect: "none", effectAllowed: "all" };
    Object.defineProperty(event, "dataTransfer", { value: dt, configurable: true });
  }
  return event;
}

export const SCENARIOS = {
  async drop(h) {
    const sidebar = document.getElementById("right-sidebar");
    h.assert(Boolean(sidebar), "fake right sidebar exists");
    sidebar.style.width = "320px";

    // Build measured Roam sidebar DOM: a window header and a draggable block bullet.
    const winHeader = document.createElement("div");
    winHeader.className = "window-headers";
    winHeader.setAttribute("draggable", "true");
    winHeader.textContent = "Block Outline";

    const container = document.createElement("div");
    container.className = "roam-block-container";
    container.setAttribute("data-block-uid", "b-sb-note");

    const main = document.createElement("div");
    main.className = "rm-block-main";

    const bullet = document.createElement("span");
    bullet.className = "rm-bullet";
    bullet.setAttribute("draggable", "true");
    const inner = document.createElement("span");
    inner.className = "rm-bullet__inner";
    bullet.append(inner);

    const input = document.createElement("div");
    input.className = "rm-block__input";
    input.id = "block-input-sidebar-block-b-sb-note-b-sb-note";
    input.textContent = "Verify edge cases for Subtask B";

    main.append(bullet, input);
    container.append(main);
    sidebar.append(winHeader, container);

    await h.open("p-alpha");
    const root = h.q(".compass-root");
    const hint = h.q(".compass-drop-hint");
    h.assert(Boolean(hint && hint.hidden), "drop hint starts hidden");

    // 1. Drag bullet over map -> hint shows; dragend clears hint without centering.
    const start1 = makeDragEvent("dragstart");
    bullet.dispatchEvent(start1);
    h.equal(start1.defaultPrevented, false, "dragstart is not prevented so Roam keeps handling its own drag");

    const over1 = makeDragEvent("dragover");
    root.dispatchEvent(over1);
    h.equal(over1.defaultPrevented, true, "dragover with bullet uid is prevented");
    h.assert(!hint.hidden, "drop hint is visible during dragover");
    h.equal(h.text(".compass-drop-pill"), "Drop to center this block", "drop hint pill reads expected copy");
    h.equal(getComputedStyle(hint).pointerEvents, "none", "drop hint never takes pointer events");

    bullet.dispatchEvent(makeDragEvent("dragend"));
    await h.wait(20);
    h.assert(hint.hidden, "drop hint hides after dragend");

    // 2. Drag bullet and drop on map -> hint hides, center becomes dragged block, no graph writes.
    bullet.dispatchEvent(makeDragEvent("dragstart"));
    const over2 = makeDragEvent("dragover");
    root.dispatchEvent(over2);
    h.assert(!hint.hidden, "drop hint visible before drop");
    const dropEv = makeDragEvent("drop");
    root.dispatchEvent(dropEv);
    h.equal(dropEv.defaultPrevented, true, "drop event is prevented");
    await h.wait(250);
    h.assert(hint.hidden, "drop hint hides after drop");
    h.equal(
      h.text(".compass-node-center .compass-node-title"),
      "Verify edge cases for Subtask B",
      "dropping block centers that block",
    );
    h.equal(h.calls("move").length, 0, "drop performs no move writes");
    h.equal(h.calls("writeZoneAttribute").length, 0, "drop performs no attribute writes");
    h.equal(h.calls("applyPlan").length, 0, "drop performs no applyPlan writes");

    // 3. Drag starting on .window-headers shows no hint and does not prevent dragover.
    winHeader.dispatchEvent(makeDragEvent("dragstart"));
    const headerOver = makeDragEvent("dragover");
    root.dispatchEvent(headerOver);
    h.equal(headerOver.defaultPrevented, false, "window-headers dragover is not prevented");
    h.assert(hint.hidden, "window-headers drag shows no drop hint");
    winHeader.dispatchEvent(makeDragEvent("dragend"));

    // Leave drop hint active for visual inspection in screenshot.
    bullet.dispatchEvent(makeDragEvent("dragstart"));
    root.dispatchEvent(makeDragEvent("dragover"));
  },
};
