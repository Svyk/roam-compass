function neighborNodes(h) {
  return h.qa(".compass-node[data-uid]:not(.compass-node-center)");
}

function findNodeByTitle(h, title) {
  return neighborNodes(h).find(
    (el) => el.querySelector(".compass-node-title")?.textContent?.trim() === title,
  ) ?? null;
}

function selectValue(h, selector, value) {
  const element = typeof selector === "string" ? h.q(selector) : selector;
  h.assert(Boolean(element), `select target exists: ${String(selector)}`);
  if (!element) return;
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
}

function assertPanelPlacement(h, label = "panel placement") {
  const root = h.rect(".compass-root");
  const panel = h.rect(".compass-vl-panel:not([hidden])");
  const center = h.rect(".compass-node-center");
  h.assert(
    panel.left >= root.left && panel.right <= root.right && panel.top >= root.top && panel.bottom <= root.bottom,
    `${label}: panel stays inside overlay (${Math.round(panel.left)}..${Math.round(panel.right)}, ${Math.round(panel.top)}..${Math.round(panel.bottom)})`,
  );
  h.assert(
    !h.overlaps(".compass-vl-panel:not([hidden])", ".compass-node-center"),
    `${label}: panel does not cover center card (center ${Math.round(center.left)}..${Math.round(center.right)})`,
  );
}

export const SCENARIOS = {
  async "lenses-panel"(h) {
    await h.open("p-alpha");
    h.click(".compass-vl-btn");
    await h.wait(80);

    const panel = h.q(".compass-vl-panel:not([hidden])");
    h.assert(Boolean(panel), "Views and lenses panel opens");
    h.equal(h.q(".compass-vl-btn")?.getAttribute("aria-expanded"), "true", "bar button has aria-expanded=true");

    for (const sec of ["views", "quick-filter", "after-filtering", "lenses"]) {
      h.assert(Boolean(h.q(`.compass-vl-section[data-section="${sec}"]`)), `section ${sec} exists`);
    }
    assertPanelPlacement(h, "lenses-panel");

    const views = h.features("views");
    h.equal(views?.current()?.view, "compass", "Compass is initial active view");
    h.equal(h.q('.compass-vl-seg button[data-view="compass"]')?.getAttribute("aria-pressed"), "true", "Compass button active");
    h.equal(h.q('.compass-vl-seg button[data-view="mindmap"]')?.getAttribute("aria-pressed"), "false", "Mind Map button inactive");

    h.click('.compass-vl-seg button[data-view="mindmap"]');
    await h.wait(150);
    h.equal(views?.current()?.view, "mindmap", "Mind Map becomes active view");
    h.equal(h.q('.compass-vl-seg button[data-view="mindmap"]')?.getAttribute("aria-pressed"), "true", "Mind Map button active");
    h.equal(h.q('.compass-vl-seg button[data-view="compass"]')?.getAttribute("aria-pressed"), "false", "Compass button inactive");

    h.click('.compass-vl-seg button[data-view="compass"]');
    await h.wait(150);
    h.equal(views?.current()?.view, "compass", "Compass becomes active view again");
    h.equal(h.q('.compass-vl-seg button[data-view="compass"]')?.getAttribute("aria-pressed"), "true", "Compass button active again");
  },

  async "quick-filter"(h) {
    await h.open("p-alpha");
    h.click(".compass-vl-btn");
    await h.wait(60);

    h.type(".compass-qf-keyword", "task");
    await h.wait(80);

    const neighbors = neighborNodes(h);
    h.assert(neighbors.length >= 6, "neighborhood has multiple nodes");
    for (const node of neighbors) {
      const title = node.querySelector(".compass-node-title")?.textContent?.trim() ?? "";
      const hasTask = title.toLowerCase().includes("task");
      h.equal(
        node.classList.contains("compass-fade"),
        !hasTask,
        `node "${title}" fade matches lack of "task"`,
      );
    }
    for (const taskTitle of ["Task One", "Task Two", "Task Three"]) {
      const taskEl = findNodeByTitle(h, taskTitle);
      h.assert(Boolean(taskEl) && !taskEl.classList.contains("compass-fade"), `${taskTitle} is not faded`);
    }

    const badge = h.q(".compass-vl-badge:not([hidden])");
    h.assert(Boolean(badge) && Number(badge.textContent.trim()) > 0, "bar button shows hidden count badge");
    h.assert((h.q(".compass-vl-btn")?.title ?? "").includes(badge?.textContent?.trim() ?? "x"), "bar button tooltip reports hidden count");

    h.click(".compass-qf-clear");
    await h.wait(80);
    h.equal(h.count(".compass-node.compass-fade"), 0, "pressing Clear unfades all nodes");
    h.assert(Boolean(h.q(".compass-vl-badge")?.hidden), "badge hides when nothing is filtered");
  },

  async "filter-reflow"(h) {
    await h.open("p-alpha");
    const initialCount = neighborNodes(h).length;
    h.assert(initialCount > 3, "more than 3 neighbor nodes initially");

    h.click(".compass-vl-btn");
    await h.wait(60);
    h.type(".compass-qf-keyword", "task");
    await h.wait(60);

    h.click('.compass-qf-radios input[value="reflow"]');
    await h.wait(120);

    const remainingTitles = neighborNodes(h)
      .map((el) => el.querySelector(".compass-node-title")?.textContent?.trim())
      .sort();
    h.equal(
      JSON.stringify(remainingTitles),
      JSON.stringify(["Task One", "Task Three", "Task Two"]),
      "only the three tasks remain on the canvas when Reflow is on",
    );
    h.equal(h.count(".compass-node.compass-fade"), 0, "remaining nodes are not faded");

    h.click('.compass-qf-radios input[value="keep"]');
    await h.wait(120);
    h.equal(neighborNodes(h).length, initialCount, "turning Keep layout back on restores non-matching nodes");
    h.assert(h.count(".compass-node.compass-fade") > 0, "restored non-matching nodes are faded again");
  },

  async "type-filter"(h) {
    await h.open("p-alpha");
    h.click(".compass-vl-btn");
    await h.wait(60);

    const taskTypeBtn = h.q('.compass-qf-types button[data-type="Task"]');
    h.assert(Boolean(taskTypeBtn), "Task type toggle is shown");
    h.click(taskTypeBtn);
    await h.wait(80);

    for (const taskTitle of ["Task One", "Task Two", "Task Three"]) {
      const node = findNodeByTitle(h, taskTitle);
      h.assert(Boolean(node) && node.classList.contains("compass-fade"), `${taskTitle} fades when Task type is deselected`);
    }
    for (const sourceTitle of ["Budget", "Roadmap"]) {
      const node = findNodeByTitle(h, sourceTitle);
      h.assert(Boolean(node) && !node.classList.contains("compass-fade"), `${sourceTitle} does not fade`);
    }
    assertPanelPlacement(h, "type-filter");
  },

  async "lens-style"(h) {
    await h.open("p-alpha");
    h.click(".compass-vl-btn");
    await h.wait(60);

    h.click(".compass-gl-new");
    await h.wait(60);

    h.click(".compass-gl-save");
    await h.wait(40);
    h.assert(
      Boolean(h.q(".compass-gl-errors:not([hidden]) li")),
      "saving an incomplete lens lists validation errors under the form",
    );

    h.type('.compass-gl-editor input[data-editor="name"]', "Tasks orange");
    selectValue(h, '.compass-gl-editor select[data-editor="scope"]', "node");
    selectValue(h, '.compass-gl-editor select[data-editor="effect"]', "style");
    selectValue(h, '.compass-gl-cond select[data-cond="field"]', "type");
    selectValue(h, '.compass-gl-cond select[data-cond="op"]', "is");
    h.type('.compass-gl-cond input[data-cond="value"]', "Task");
    h.type('.compass-gl-colors input[data-color="border"]', "#ea580c");

    h.click(".compass-gl-save");
    await h.wait(100);

    h.equal(h.q(".compass-gl-editor")?.hidden, true, "editor closes after saving");
    h.equal(h.q(".compass-gl-footer")?.hidden, false, "lens footer returns after saving");
    const lensRow = h.q('.compass-gl-item[data-lens-id="tasks-orange"]');
    h.assert(Boolean(lensRow), "saved lens appears in list");
    const enableBox = lensRow?.querySelector('input[type="checkbox"]');
    h.click(enableBox);
    await h.wait(100);

    for (const taskTitle of ["Task One", "Task Two", "Task Three"]) {
      const node = findNodeByTitle(h, taskTitle);
      h.assert(Boolean(node), `${taskTitle} exists`);
      h.assert(node.classList.contains("compass-lensed"), `${taskTitle} has class compass-lensed`);
      h.equal(
        node.style.getPropertyValue("--compass-lens-border").trim(),
        "#ea580c",
        `${taskTitle} has --compass-lens-border custom property`,
      );
    }
    h.assert(
      !h.q(".compass-node-center").classList.contains("compass-lensed"),
      "center card is never lensed",
    );

    const stored = h.harness.extensionAPI.settings.get("compass-lenses");
    h.assert(
      Array.isArray(stored) && stored.length === 1 && stored[0].id === "tasks-orange" && stored[0].enabled === true,
      "lens is persisted in compass-lenses",
    );

    h.click('.compass-gl-item[data-lens-id="tasks-orange"] .compass-gl-delete');
    await h.wait(100);

    h.equal(h.count(".compass-node.compass-lensed"), 0, "no nodes remain lensed after deleting lens");
    const taskOneAfter = findNodeByTitle(h, "Task One");
    h.equal(taskOneAfter?.style.getPropertyValue("--compass-lens-border") ?? "", "", "border custom property removed");
    const storedAfter = h.harness.extensionAPI.settings.get("compass-lenses");
    h.equal(Array.isArray(storedAfter) ? storedAfter.length : -1, 0, "compass-lenses is empty after delete");
  },

  async "lens-hide"(h) {
    await h.open("p-alpha");
    h.click(".compass-vl-btn");
    await h.wait(60);

    h.click(".compass-gl-examples");
    await h.wait(100);
    h.equal(h.count(".compass-gl-item"), 3, "three example lenses added");

    const typedOnlyCheckbox = h.q('.compass-gl-item[data-lens-id="typed-only"] input[type="checkbox"]');
    h.assert(Boolean(typedOnlyCheckbox), "Typed relations only checkbox exists");
    h.click(typedOnlyCheckbox);
    await h.wait(100);

    for (const plainTitle of ["Budget", "Roadmap"]) {
      const node = findNodeByTitle(h, plainTitle);
      h.assert(Boolean(node) && node.classList.contains("compass-fade"), `${plainTitle} (plain link) is faded`);
    }
    const taskOne = findNodeByTitle(h, "Task One");
    h.assert(Boolean(taskOne) && !taskOne.classList.contains("compass-fade"), "Task One (typed relation) is not faded");
    assertPanelPlacement(h, "lens-hide");
  },

  async "lenses-active"(h) {
    await h.open("p-alpha");
    h.click(".compass-vl-btn");
    await h.wait(60);

    h.click(".compass-gl-new");
    await h.wait(50);
    h.type('.compass-gl-editor input[data-editor="name"]', "Tasks orange");
    selectValue(h, '.compass-gl-editor select[data-editor="scope"]', "node");
    selectValue(h, '.compass-gl-editor select[data-editor="effect"]', "style");
    selectValue(h, '.compass-gl-cond select[data-cond="field"]', "type");
    selectValue(h, '.compass-gl-cond select[data-cond="op"]', "is");
    h.type('.compass-gl-cond input[data-cond="value"]', "Task");
    h.type('.compass-gl-colors input[data-color="border"]', "#ea580c");
    h.click(".compass-gl-save");
    await h.wait(80);

    h.equal(h.q(".compass-gl-editor")?.hidden, true, "editor closes after saving");
    h.equal(h.q(".compass-gl-footer")?.hidden, false, "lens footer visible after saving");
    h.click('.compass-gl-item[data-lens-id="tasks-orange"] input[type="checkbox"]');
    await h.wait(80);

    h.click('.compass-qf-types button[data-type="Source"]');
    await h.wait(80);

    h.equal(h.count(".compass-node.compass-lensed"), 3, "three tasks styled");
    h.assert(findNodeByTitle(h, "Budget")?.classList.contains("compass-fade"), "Source nodes faded by type filter");
    assertPanelPlacement(h, "lenses-active");
  },

  async "lenses-editor"(h) {
    await h.open("p-alpha");
    h.click(".compass-vl-btn");
    await h.wait(60);

    h.click(".compass-gl-new");
    await h.wait(60);
    h.type('.compass-gl-editor input[data-editor="name"]', "Active tasks");
    selectValue(h, '.compass-gl-editor select[data-editor="scope"]', "node");
    selectValue(h, '.compass-gl-editor select[data-editor="effect"]', "style");
    selectValue(h, '.compass-gl-cond select[data-cond="field"]', "type");
    selectValue(h, '.compass-gl-cond select[data-cond="op"]', "is");
    h.type('.compass-gl-cond input[data-cond="value"]', "Task");

    h.click(".compass-gl-add-cond");
    await h.wait(50);
    const secondCond = h.q('.compass-gl-cond[data-cond-index="1"]');
    h.assert(Boolean(secondCond), "second condition row added");
    selectValue(h, '.compass-gl-cond[data-cond-index="1"] select[data-cond="field"]', "attr:");
    h.type('.compass-gl-cond[data-cond-index="1"] input[data-cond="attr"]', "Status");
    selectValue(h, '.compass-gl-cond[data-cond-index="1"] select[data-cond="op"]', "is");
    h.type('.compass-gl-cond[data-cond-index="1"] input[data-cond="value"]', "Doing");
    h.type('.compass-gl-colors input[data-color="border"]', "#ea580c");
    await h.wait(60);

    assertPanelPlacement(h, "lenses-editor");
  },
};
