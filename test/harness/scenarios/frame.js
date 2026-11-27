function twoFrames() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function checkFit(h, label) {
  const stageRect = h.rect(".compass-stage");
  const nodes = h.qa(".compass-node");
  const adds = h.qa(".compass-zone-add").filter((el) => !el.hidden && el.getBoundingClientRect().width > 0);
  const counts = h.qa(".compass-zone-count").filter((el) => !el.hidden && el.getBoundingClientRect().width > 0);
  h.assert(nodes.length > 0, `${label}: nodes rendered`);
  h.equal(adds.length, 4, `${label}: all 4 .compass-zone-add buttons are visible`);
  h.assert(counts.length >= 4, `${label}: at least 4 .compass-zone-count labels are visible (got ${counts.length})`);
  let allInside = true;
  let noAddHit = true;
  let noCountHit = true;
  for (const node of nodes) {
    const r = node.getBoundingClientRect();
    if (
      r.left < stageRect.left - 1
      || r.right > stageRect.right + 1
      || r.top < stageRect.top - 1
      || r.bottom > stageRect.bottom + 1
    ) {
      allInside = false;
    }
    for (const add of adds) {
      if (h.overlaps(r, add)) noAddHit = false;
    }
    for (const count of counts) {
      if (h.overlaps(r, count)) noCountHit = false;
    }
  }
  h.assert(allInside, `${label}: every node rect is inside the stage rect`);
  h.assert(noAddHit, `${label}: no node rect intersects a .compass-zone-add rect`);
  h.assert(noCountHit, `${label}: no node rect intersects a .compass-zone-count rect`);
}

export const SCENARIOS = {
  async frame(h) {
    const shell = document.querySelector(".roam-body-main");
    const sidebar = document.getElementById("right-sidebar");
    h.assert(Boolean(shell && sidebar && document.querySelector(".roam-main")), "fake Roam shell exists");

    // Step 1: open with sidebar at 400px
    sidebar.style.width = "400px";
    await twoFrames();
    await h.open("p-alpha");
    await twoFrames();
    let rootRect = h.rect(".compass-root");
    let sideRect = sidebar.getBoundingClientRect();
    h.assert(
      Math.abs(rootRect.right - sideRect.left) <= 1,
      `400px sidebar: root.right (${rootRect.right}) matches sidebar.left (${sideRect.left})`,
    );
    checkFit(h, "400px sidebar");

    // Step 2: collapse sidebar to 0
    sidebar.style.width = "0px";
    await twoFrames();
    rootRect = h.rect(".compass-root");
    h.assert(
      Math.abs(rootRect.right - window.innerWidth) <= 1,
      `0px sidebar: root.right (${rootRect.right}) matches viewport (${window.innerWidth})`,
    );
    checkFit(h, "0px sidebar");

    // Step 3: widen sidebar to 500px
    sidebar.style.width = "500px";
    await twoFrames();
    rootRect = h.rect(".compass-root");
    sideRect = sidebar.getBoundingClientRect();
    h.assert(
      Math.abs(rootRect.right - sideRect.left) <= 1,
      `500px sidebar: root.right (${rootRect.right}) matches sidebar.left (${sideRect.left})`,
    );
    checkFit(h, "500px sidebar");

    // Step 4: remove sidebar element
    sidebar.remove();
    await twoFrames();
    rootRect = h.rect(".compass-root");
    h.assert(
      Math.abs(rootRect.right - window.innerWidth) <= 1,
      `removed sidebar: root.right (${rootRect.right}) matches viewport (${window.innerWidth})`,
    );
    checkFit(h, "removed sidebar");

    // Step 5: pan by hand, re-add sidebar at 360px, verify pan is unchanged while frame follows
    const stage = h.q(".compass-stage");
    const sr = stage.getBoundingClientRect();
    const startX = sr.left + 30;
    const startY = sr.top + 30;
    stage.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: startX, clientY: startY,
    }));
    window.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: startX + 75, clientY: startY + 45,
    }));
    window.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true, cancelable: true, button: 0, buttons: 0, clientX: startX + 75, clientY: startY + 45,
    }));
    await twoFrames();
    const pannedX = h.harness.overlay.ctx.state.panX;
    const pannedY = h.harness.overlay.ctx.state.panY;

    const restored = document.createElement("div");
    restored.id = "right-sidebar";
    restored.style.width = "360px";
    shell.append(restored);
    await twoFrames();
    rootRect = h.rect(".compass-root");
    sideRect = restored.getBoundingClientRect();
    h.assert(
      Math.abs(rootRect.right - sideRect.left) <= 1,
      `re-added 360px sidebar: root.right (${rootRect.right}) matches sidebar.left (${sideRect.left})`,
    );
    h.equal(h.harness.overlay.ctx.state.panX, pannedX, "manual panX unchanged after sidebar resize");
    h.equal(h.harness.overlay.ctx.state.panY, pannedY, "manual panY unchanged after sidebar resize");
  },
};
