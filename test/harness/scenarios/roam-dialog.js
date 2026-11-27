export const SCENARIOS = {
  async "roam-dialog"(h) {
    // Fake Roam confirm dialog portal as first child of body (z-index: 19).
    const portal = document.createElement("div");
    portal.id = "rm-modal-portal";
    portal.className = "roam-lift-modal";
    portal.style.position = "relative";
    portal.style.zIndex = "19";

    const box = document.createElement("div");
    box.className = "fake-roam-dialog";
    box.style.position = "fixed";
    box.style.left = "50%";
    box.style.top = "50%";
    box.style.width = "300px";
    box.style.height = "160px";
    box.style.transform = "translate(-50%, -50%)";
    box.style.background = "#293742";
    box.style.color = "#f5f8fa";
    box.style.borderRadius = "6px";
    box.style.padding = "16px";
    box.style.boxSizing = "border-box";
    box.style.boxShadow = "0 8px 28px rgba(0, 0, 0, 0.35)";
    const heading = document.createElement("div");
    heading.className = "fake-roam-dialog-title";
    heading.textContent = "Unpin this pinned window?";
    heading.style.fontWeight = "600";
    box.append(heading);
    portal.append(box);
    document.body.prepend(portal);

    const sidebar = document.getElementById("right-sidebar");
    let handle = null;
    if (sidebar) {
      sidebar.style.width = "320px";
      handle = document.createElement("div");
      handle.className = "rm-resize-handle";
      handle.style.position = "absolute";
      handle.style.left = "0";
      handle.style.top = "0";
      handle.style.width = "8px";
      handle.style.height = "100%";
      handle.style.zIndex = "1000";
      sidebar.append(handle);
    }

    h.assert(!document.documentElement.classList.contains("compass-full-open"), "compass-full-open absent before open");
    await h.open("p-alpha");

    const boxRect = box.getBoundingClientRect();
    const cx = boxRect.left + boxRect.width / 2;
    const cy = boxRect.top + boxRect.height / 2;

    const hitNormal = document.elementFromPoint(cx, cy);
    h.assert(Boolean(hitNormal && box.contains(hitNormal)), "normal mode: elementFromPoint at dialog center hits inside dialog");
    h.assert(!document.documentElement.classList.contains("compass-full-open"), "normal mode: compass-full-open is absent");

    // Turn on Full mode
    h.click(".compass-corner-full");
    await h.wait(60);
    h.assert(document.documentElement.classList.contains("compass-full-open"), "Full mode open: compass-full-open is present");
    const hitFull = document.elementFromPoint(cx, cy);
    h.assert(Boolean(hitFull && box.contains(hitFull)), "Full mode: elementFromPoint at dialog center hits inside dialog");
    if (handle) {
      h.equal(getComputedStyle(handle).pointerEvents, "none", "Full mode disables pointer-events on sidebar resize handle");
    }

    // Turn off Full mode
    h.click(".compass-corner-full");
    await h.wait(60);
    h.assert(!document.documentElement.classList.contains("compass-full-open"), "Full mode off: compass-full-open removed");

    // Turn Full mode back on, then close Compass -> class removed
    h.click(".compass-corner-full");
    await h.wait(60);
    h.assert(document.documentElement.classList.contains("compass-full-open"), "Full mode re-enabled: compass-full-open present");
    h.click(".compass-close");
    await h.wait(60);
    h.assert(!document.documentElement.classList.contains("compass-full-open"), "Compass closed: compass-full-open removed");

    // Reopen in Full mode so screenshot shows dialog cleanly on top of Full Compass
    await h.open("p-alpha");
    h.click(".compass-corner-full");
    await h.wait(60);
    h.assert(document.documentElement.classList.contains("compass-full-open"), "reopened Full mode: compass-full-open present");
  },
};
