export const SCENARIOS = {
  "keys-arrows": async (h) => {
    await h.open("p-alpha");
    h.key("ArrowDown");
    h.equal(h.focused()?.dataset?.zone, "south", "Down from start focuses a south node");

    h.key("ArrowUp");
    h.assert(
      Boolean(h.focused()?.classList?.contains("compass-node-center")),
      "Up from first south row focuses the center card",
    );

    h.key("ArrowUp");
    const northNode = h.focused();
    h.equal(northNode?.dataset?.zone, "north", "Up from center focuses a north node");
    const chosenTitle = northNode?.querySelector(".compass-node-title")?.textContent?.trim() ?? "";
    h.assert(Boolean(chosenTitle), "focused north node has a title");

    h.key("Enter");
    await h.wait(350);
    h.equal(h.text(".compass-node-center .compass-node-title"), chosenTitle, "Enter centers the focused north node");
  },

  "keys-type": async (h) => {
    await h.open("p-alpha");
    h.key("t");
    h.key("a");
    h.key("s");

    const pill = h.q(".compass-select-pill");
    h.assert(Boolean(pill && !pill.hidden), "type-to-select pill is visible");
    h.assert(h.text(".compass-select-pill").includes("Select: tas"), "pill reads the typed phrase");

    const first = h.focused();
    const firstTitle = first?.querySelector(".compass-node-title")?.textContent?.trim() ?? "";
    h.assert(firstTitle.includes("Task"), `first match is a Task node (got "${firstTitle}")`);

    h.key("Tab");
    const second = h.focused();
    const secondTitle = second?.querySelector(".compass-node-title")?.textContent?.trim() ?? "";
    h.assert(second !== first && secondTitle.includes("Task"), `Tab advances to another Task node (got "${secondTitle}")`);
    h.assert(h.text(".compass-select-pill").includes("2 of 3"), "pill updates match counter on Tab");

    h.key("Escape");
    h.assert(Boolean(h.q(".compass-select-pill")?.hidden), "Escape hides the phrase pill");
    h.assert(!h.q(".compass-root")?.hidden, "Compass remains open after clearing phrase");
  },

  "keys-history": async (h) => {
    await h.open("p-alpha");
    for (const ch of "task one") h.key(ch);
    h.equal(
      h.focused()?.querySelector(".compass-node-title")?.textContent?.trim(),
      "Task One",
      "typing 'task one' focuses Task One",
    );
    h.key("Enter");
    await h.wait(350);
    h.equal(h.text(".compass-node-center .compass-node-title"), "Task One", "Task One becomes center");

    h.key("Backspace");
    await h.wait(350);
    h.equal(h.text(".compass-node-center .compass-node-title"), "Project Alpha", "Backspace navigates Back to Project Alpha");

    h.key("Backspace", { shiftKey: true });
    await h.wait(350);
    h.equal(h.text(".compass-node-center .compass-node-title"), "Task One", "Shift+Backspace navigates Forward to Task One");
  },

  async palette(h) {
    await h.open("p-alpha");
    h.key("ArrowDown");
    const selectedUid = h.focused()?.dataset?.uid ?? "";
    h.assert(Boolean(selectedUid), "a node is focused before opening the palette");

    h.key(".", { code: "Period", altKey: true });
    h.assert(Boolean(h.q(".compass-palette-backdrop") && !h.q(".compass-palette-backdrop").hidden), "Alt+. opens palette");

    h.type(".compass-palette-input", "fit");
    h.equal(h.text(".compass-palette-item .compass-palette-title"), "Fit to screen", "Fit to screen is listed first");

    h.key("Enter");
    h.assert(Boolean(h.q(".compass-palette-backdrop")?.hidden), "Enter runs command and closes palette");
    h.equal(h.focused()?.dataset?.uid, selectedUid, "palette restores focus to previously selected node");

    h.key(".", { code: "Period", altKey: true });
    h.type(".compass-palette-input", "zen");
    h.key("Enter");
    h.assert(Boolean(h.q(".compass-root")?.classList.contains("compass-zen")), "running Toggle Zen mode sets compass-zen");

    h.features("zen")?.setZen(false);
    h.key(".", { code: "Period", altKey: true });
  },

  async zen(h) {
    await h.open("p-alpha");
    h.click(".compass-corner-zen");
    h.assert(Boolean(h.q(".compass-root")?.classList.contains("compass-zen")), "Zen class is applied");
    h.equal(window.getComputedStyle(h.q(".compass-bar")).display, "none", "bar is hidden in Zen");
    h.assert(window.getComputedStyle(h.q(".compass-corner")).display !== "none", "corner controls remain visible in Zen");
    h.assert(h.rect(".compass-corner").width > 40, "corner controls have visible dimensions");

    h.key("Escape");
    h.assert(!h.q(".compass-root")?.classList.contains("compass-zen"), "Escape exits Zen first");
    h.assert(!h.q(".compass-root")?.hidden, "Compass stays open after exiting Zen");
  },

  async wander(h) {
    await h.harness.extensionAPI.settings.set("compass-wander-seconds", "3");
    await h.open("p-alpha");

    h.features("wander")?.start();
    h.assert(Boolean(h.features("wander")?.isActive()), "Wander is active after start()");
    h.assert(Boolean(h.q(".compass-root")?.classList.contains("compass-zen")), "Wander enters Zen mode");
    h.assert(Boolean(h.q(".compass-wander-strip") && !h.q(".compass-wander-strip").hidden), "Wander strip is visible");

    await h.wait(4200);
    h.assert(
      h.text(".compass-node-center .compass-node-title") !== "Project Alpha",
      "Wander moved the center at least once",
    );
    h.assert(Boolean(h.q(".compass-root")?.classList.contains("compass-zen")), "root still has compass-zen while wandering");

    h.q(".compass-stage").dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      isPrimary: true,
    }));
    h.equal(h.q(".compass-wander-strip")?.dataset?.mode, "paused", "pointerdown on stage pauses Wander");
    h.equal(h.text(".compass-wander-toggle"), "Play", "toggle button shows Play when paused");

    h.click(".compass-wander-stop");
    h.assert(!h.features("wander")?.isActive(), "Stop ends Wander");
    h.assert(!h.q(".compass-root")?.classList.contains("compass-zen"), "Stop restores Zen to off");
  },

  async help(h) {
    await h.open("p-alpha");
    h.key("?", { code: "Slash", altKey: true, shiftKey: true });
    h.assert(Boolean(h.q(".compass-help-backdrop") && !h.q(".compass-help-backdrop").hidden), "Alt+? opens help panel");
    h.assert(h.text(".compass-help").includes("Arrow keys"), "help panel lists Arrow keys");
    h.assert(h.text(".compass-help").includes("Move and select"), "help panel shows Move and select group");
    h.assert(h.text(".compass-help").includes("Actions"), "help panel shows Actions group");
  },

  "zen-view": async (h) => {
    await h.open("p-alpha");
    h.click(".compass-corner-zen");
    h.key("ArrowDown");
    h.noOverlap(".compass-node");
    h.assert(!h.overlaps(".compass-corner", ".compass-node-center"), "corner controls do not overlap center");
  },

  "wander-view": async (h) => {
    await h.harness.extensionAPI.settings.set("compass-wander-seconds", "7");
    await h.open("p-alpha");
    h.features("wander")?.start();
    await h.wait(7200);
    h.equal(h.q(".compass-wander-strip")?.dataset?.mode, "playing", "wander strip is in playing mode");
    h.assert(h.count(".compass-wander-next") === 1, "next wander destination is highlighted");
    h.assert(!h.overlaps(".compass-wander-strip", ".compass-corner"), "wander strip and corner controls do not overlap");
  },

  "keys-pill": async (h) => {
    await h.open("p-alpha");
    await h.wait(4800);
    h.key("t");
    h.key("a");
    h.key("s");
    h.key("Tab");
    h.assert(h.text(".compass-select-pill").includes("Select: tas — 2 of 3"), "pill displays active match counter");
    h.assert(!h.overlaps(".compass-select-pill", ".compass-corner"), "select pill and corner controls do not overlap");
  },
};
