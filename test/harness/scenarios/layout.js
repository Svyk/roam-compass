function centerX(rect) {
  return rect.left + rect.width / 2;
}

function centerY(rect) {
  return rect.top + rect.height / 2;
}

function parseTransform(transform) {
  const translate = /translate\(\s*([-\d.]+)px,\s*([-\d.]+)px\s*\)/.exec(transform ?? "");
  const scale = /scale\(\s*([-\d.]+)\s*\)/.exec(transform ?? "");
  return {
    tx: translate ? Number(translate[1]) : 0,
    ty: translate ? Number(translate[2]) : 0,
    scale: scale ? Number(scale[1]) : 1,
  };
}

export const SCENARIOS = {
  async group(h) {
    await h.setting("group", true);
    await h.open("p-alpha");
    h.equal(h.q(".compass-group")?.getAttribute("aria-pressed"), "true", "Group bar toggle is pressed");

    const southGroups = h.qa('.compass-node[data-zone="south"][data-kind="group"]');
    const taskGroups = southGroups.filter((el) => h.text(el.querySelector(".compass-node-title")) === "Task");
    h.equal(taskGroups.length, 1, "south side shows one Task group");
    const taskGroup = taskGroups[0];
    h.equal(h.text(taskGroup?.querySelector(".compass-group-count")), "3", "Task group has count 3");
    h.assert(
      (taskGroup?.title ?? "").includes("Task One") && (taskGroup?.title ?? "").includes("Task Three"),
      "group tooltip lists member titles",
    );

    const southUngrouped = h.qa('.compass-node[data-zone="south"]:not([data-kind="group"])');
    h.assert(southUngrouped.length >= 1, "ungrouped south nodes stay visible alongside groups");

    h.contextmenu(taskGroup);
    await h.wait(40);
    const groupMenu = h.qa(".compass-menu:not([hidden]) .compass-menu-item").map((el) => el.textContent.trim());
    const onlyUnfold = groupMenu.length === 1 && groupMenu[0] === "Unfold group";
    h.assert(onlyUnfold, `group menu has only Unfold group (got ${JSON.stringify(groupMenu)})`);
    h.key("Escape");
    await h.wait(30);

    h.click(taskGroup);
    await h.wait(100);
    const afterUnfoldGroups = h.qa('.compass-node[data-zone="south"][data-kind="group"]')
      .filter((el) => h.text(el.querySelector(".compass-node-title")) === "Task");
    h.equal(afterUnfoldGroups.length, 0, "Task group is gone after click");

    const southTitles = h.qa('.compass-node[data-zone="south"] .compass-node-title').map((el) => el.textContent.trim());
    for (const name of ["Task One", "Task Two", "Task Three"]) {
      h.assert(southTitles.includes(name), `${name} is restored after unfolding`);
    }

    const taskOne = h.qa('.compass-node[data-zone="south"]').find((el) => h.text(el.querySelector(".compass-node-title")) === "Task One");
    h.assert(Boolean(taskOne), "Task One element found");
    h.contextmenu(taskOne);
    await h.wait(40);
    const memberMenu = h.qa(".compass-menu:not([hidden]) .compass-menu-item").map((el) => el.textContent.trim());
    h.assert(memberMenu.includes("Fold group"), "unfolded member context menu offers Fold group");
    h.key("Escape");
    await h.wait(30);

    h.click(taskOne);
    await h.wait(450);
    h.equal(h.text(".compass-node-center .compass-node-title"), "Task One", "navigated to Task One");

    h.key("ArrowLeft", { altKey: true });
    await h.wait(450);
    h.equal(h.text(".compass-node-center .compass-node-title"), "Project Alpha", "returned to Project Alpha");

    const refolded = h.qa('.compass-node[data-zone="south"][data-kind="group"]')
      .filter((el) => h.text(el.querySelector(".compass-node-title")) === "Task");
    h.equal(refolded.length, 1, "Task group is folded again after returning");
    h.equal(h.text(refolded[0]?.querySelector(".compass-group-count")), "3", "refolded Task group shows count 3");
    h.noOverlap(".compass-node");
  },

  async expanded(h) {
    await h.setting("expanded", true);
    await h.open("p-alpha");
    h.equal(h.q(".compass-expanded")?.getAttribute("aria-pressed"), "true", "Expanded bar toggle is pressed");

    const taskOne = h.qa('.compass-node[data-zone="south"]')
      .find((el) => h.text(el.querySelector(".compass-node-title")) === "Task One");
    h.assert(Boolean(taskOne), "Task One sits in south");
    const subRows = taskOne ? Array.from(taskOne.querySelectorAll(".compass-sub")) : [];
    const subTitles = subRows.map((el) => el.textContent.trim());
    h.assert(subTitles.includes("Subtask A"), "Task One shows Subtask A sub-row");
    h.assert(subTitles.includes("Subtask B"), "Task One shows Subtask B sub-row");
    h.noOverlap(".compass-node");

    const subtaskA = subRows.find((el) => el.textContent.trim() === "Subtask A");
    h.assert(Boolean(subtaskA), "Subtask A sub-row is clickable");
    h.click(subtaskA);
    await h.wait(450);
    h.equal(h.text(".compass-node-center .compass-node-title"), "Subtask A", "Subtask A becomes the center");
    h.noOverlap(".compass-node");

    h.key("ArrowLeft", { altKey: true });
    await h.wait(450);
    h.equal(h.text(".compass-node-center .compass-node-title"), "Project Alpha", "returns to Project Alpha with expanded cards");
    h.noOverlap(".compass-node");
  },

  async flip(h) {
    await h.open("p-alpha");
    const cBefore = h.rect(".compass-node-center");
    const beforeOffsets = new Map();
    for (const el of h.qa('.compass-node[data-zone="north"], .compass-node[data-zone="south"]')) {
      const r = h.rect(el);
      beforeOffsets.set(el.dataset.uid, {
        dx: centerX(r) - centerX(cBefore),
        dy: centerY(r) - centerY(cBefore),
      });
    }

    await h.setting("flip", true);
    h.equal(h.q(".compass-root")?.dataset?.flip, "true", "root carries data-flip=true");
    const cAfter = h.rect(".compass-node-center");

    const westNodes = h.qa('.compass-node[data-zone="west"]');
    const eastNodes = h.qa('.compass-node[data-zone="east"]');
    h.assert(westNodes.length >= 1 && eastNodes.length >= 1, "west and east nodes exist");
    for (const el of westNodes) {
      h.assert(centerX(h.rect(el)) > cAfter.right, `west node ${el.dataset.uid} sits right of center card`);
    }
    for (const el of eastNodes) {
      h.assert(centerX(h.rect(el)) < cAfter.left, `east node ${el.dataset.uid} sits left of center card`);
    }

    for (const el of h.qa('.compass-node[data-zone="north"], .compass-node[data-zone="south"]')) {
      const prev = beforeOffsets.get(el.dataset.uid);
      const r = h.rect(el);
      const dx = centerX(r) - centerX(cAfter);
      const dy = centerY(r) - centerY(cAfter);
      h.assert(
        prev && Math.abs(dx - prev.dx) < 1.5 && Math.abs(dy - prev.dy) < 1.5,
        `${el.dataset.zone} node ${el.dataset.uid} did not move relative to center`,
      );
    }
    h.noOverlap(".compass-node");
  },

  "one-sided": async (h) => {
    await h.setting("oneSided", true);
    await h.open("p-alpha");
    h.equal(h.q(".compass-root")?.dataset?.oneSided, "true", "root carries data-one-sided=true");

    const westNodes = h.qa('.compass-node[data-zone="west"]');
    const eastNodes = h.qa('.compass-node[data-zone="east"]');
    h.assert(westNodes.length >= 1 && eastNodes.length >= 1, "both west and east nodes exist");

    const sharedX = centerX(h.rect(westNodes[0]));
    const centerRect = h.rect(".compass-node-center");
    h.assert(sharedX < centerRect.left, "shared column sits left of center card");
    for (const el of [...westNodes, ...eastNodes]) {
      const x = centerX(h.rect(el));
      h.assert(Math.abs(x - sharedX) < 1, `node ${el.dataset.uid} shares column x`);
    }
    h.noOverlap(".compass-node");
  },

  async trackpad(h) {
    await h.setting("trackpad", true);
    await h.open("p-alpha");

    const world = h.q(".compass-world");
    const before = parseTransform(world.style.transform);

    h.wheel(".compass-stage", { deltaY: 120 });
    await h.wait(30);
    const panned = parseTransform(world.style.transform);
    h.assert(Math.abs((before.ty - panned.ty) - 120) < 1, `wheel deltaY pans world translate (before=${before.ty}, after=${panned.ty})`);
    h.equal(panned.scale, before.scale, "plain wheel does not change scale");

    h.wheel(".compass-stage", { deltaY: -120, ctrlKey: true });
    await h.wait(30);
    const zoomed = parseTransform(world.style.transform);
    h.assert(zoomed.scale !== panned.scale && zoomed.scale > panned.scale, `ctrlKey wheel zooms world scale (before=${panned.scale}, after=${zoomed.scale})`);
  },

  "layout-off": async (h) => {
    await h.open("p-alpha");
    h.equal(h.count('.compass-node[data-kind="group"]'), 0, "no group nodes when grouping is off");
    h.equal(h.count(".compass-sub"), 0, "no sub-rows when expanded is off");
    h.equal(h.q(".compass-root")?.dataset?.flip, undefined, "data-flip is unset");
    h.equal(h.q(".compass-root")?.dataset?.oneSided, undefined, "data-one-sided is unset");

    const centerRect = h.rect(".compass-node-center");
    const westNodes = h.qa('.compass-node[data-zone="west"]');
    const eastNodes = h.qa('.compass-node[data-zone="east"]');
    h.assert(westNodes.length >= 1 && eastNodes.length >= 1, "west and east nodes exist");
    for (const el of westNodes) {
      h.assert(centerX(h.rect(el)) < centerRect.left, `west node ${el.dataset.uid} sits on the left`);
    }
    for (const el of eastNodes) {
      h.assert(centerX(h.rect(el)) > centerRect.right, `east node ${el.dataset.uid} sits on the right`);
    }
    h.noOverlap(".compass-node");
  },
};
