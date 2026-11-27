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
    if (sidebar) sidebar.style.width = "320px";

    await h.open("p-alpha");

    const root = h.q(".compass-root");
    const boxRect = box.getBoundingClientRect();
    const cx = boxRect.left + boxRect.width / 2;
    const cy = boxRect.top + boxRect.height / 2;

    const hitNormal = document.elementFromPoint(cx, cy);
    h.equal(getComputedStyle(root).zIndex, "18", "normal mode: overlay z-index is 18");
    h.assert(Boolean(hitNormal && box.contains(hitNormal)), "normal mode: elementFromPoint at dialog center hits inside dialog");

    // Turn on Full mode: z-index restores to 1000 so Compass covers left and right sidebars.
    h.click(".compass-corner-full");
    await h.wait(60);
    h.equal(getComputedStyle(root).zIndex, "1000", "Full mode: overlay computed z-index is 1000");

    // Turn off Full mode: dialog is back on top in normal mode for the screenshot.
    h.click(".compass-corner-full");
    await h.wait(60);
    h.equal(getComputedStyle(root).zIndex, "18", "normal mode restored: overlay z-index is 18");
    const hitRestored = document.elementFromPoint(cx, cy);
    h.assert(Boolean(hitRestored && box.contains(hitRestored)), "normal mode restored: dialog stays on top");
  },
};
