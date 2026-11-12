function pinRowLabels(h) {
  return h.qa(".compass-pins .compass-pin-chip").map((chip) => {
    const btn = chip.querySelector(".compass-pin-periodic-btn, .compass-pin-jump");
    return btn ? btn.textContent.trim() : chip.textContent.trim();
  });
}

function dispatchPointer(target, type, clientX, clientY, buttons = 1) {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    buttons,
    clientX,
    clientY,
  }));
}

export const SCENARIOS = {
  async pins(h) {
    await h.setting("compass-pin-week", true);
    await h.setting("compass-pin-month", true);
    await h.open("p-alpha");

    // Pin Project Alpha with the bar Pin button.
    h.click(".compass-pin");
    await h.wait(80);

    // Pin Task One from its node context menu.
    const taskOneNode = h.qa('.compass-node[data-zone="south"]').find((el) => el.textContent.includes("Task One"));
    h.assert(Boolean(taskOneNode), "Task One node exists on canvas");
    h.contextmenu(taskOneNode);
    await h.wait(50);
    const pinItem = h.qa(".compass-menu:not([hidden]) .compass-menu-item").find((el) => el.textContent.trim() === "Pin");
    h.assert(Boolean(pinItem), "node context menu offers Pin");
    h.click(pinItem);
    await h.wait(80);

    h.equal(
      JSON.stringify(pinRowLabels(h)),
      JSON.stringify(["Today", "This week", "This month", "Project Alpha", "Task One"]),
      "row order is Today, This week, This month, Project Alpha, Task One",
    );

    // Run Move left on Task One.
    const taskOneChip = h.qa(".compass-pins .compass-pin-user").find((el) => el.dataset.pinUid === "p-task-1");
    h.assert(Boolean(taskOneChip), "Task One user pin chip exists");
    h.contextmenu(taskOneChip);
    await h.wait(50);
    const menuTitles = h.qa(".compass-menu:not([hidden]) .compass-menu-item").map((el) => el.textContent.trim());
    h.equal(JSON.stringify(menuTitles), JSON.stringify(["Move left", "Unpin"]), "last pin omits Move right");
    const moveLeft = h.qa(".compass-menu:not([hidden]) .compass-menu-item").find((el) => el.textContent.trim() === "Move left");
    h.click(moveLeft);
    await h.wait(80);

    h.equal(
      JSON.stringify(pinRowLabels(h)),
      JSON.stringify(["Today", "This week", "This month", "Task One", "Project Alpha"]),
      "Move left moves Task One before Project Alpha",
    );
    const saved = h.harness.extensionAPI.settings.get("compass-pins") ?? [];
    h.equal(
      JSON.stringify(saved.map((item) => item.uid)),
      JSON.stringify(["p-task-1", "p-alpha"]),
      "compass-pins saved in new order",
    );

    // Click This week (missing) -> inline confirmation -> Create -> focuses new page.
    const weekInfo = h.features("pins").periodic().find((item) => item.id === "week");
    h.assert(Boolean(weekInfo) && weekInfo.exists === false, "This week page is initially missing");
    const createBefore = h.calls("createPage").length;

    h.click('.compass-pin-periodic-btn[data-periodic-id="week"]');
    await h.wait(60);
    h.assert(Boolean(h.q(".compass-pins .compass-pin-confirm")), "inline confirmation replaces This week chip");
    h.equal(
      h.text(".compass-pin-confirm-text"),
      `Create [[${weekInfo.title}]]?`,
      "inline confirmation names weekly page title",
    );
    h.equal(h.calls("createPage").length, createBefore, "clicking chip does not create page silently");

    h.click(".compass-pin-confirm-create");
    await h.wait(350);
    h.equal(h.calls("createPage").length - createBefore, 1, "createPage was called once");
    h.equal(h.text(".compass-node-center .compass-node-title"), weekInfo.title, "new weekly page is focused as center");

    // Open inline confirmation on This month (also missing) so screenshot shows the pin row with inline confirmation.
    const monthInfo = h.features("pins").periodic().find((item) => item.id === "month");
    h.assert(Boolean(monthInfo) && monthInfo.exists === false, "This month page is missing");
    h.click('.compass-pin-periodic-btn[data-periodic-id="month"]');
    await h.wait(60);
    h.equal(
      h.text(".compass-pin-confirm-text"),
      `Create [[${monthInfo.title}]]?`,
      "This month inline confirmation is displayed in pin row",
    );
    h.equal(h.calls("createPage").length - createBefore, 1, "createPage still called once");
  },

  "pins-drag-picker": async (h) => {
    await h.setting("compass-pin-week", true);
    await h.setting("compass-pins", [
      { uid: "p-alpha", title: "Project Alpha" },
      { uid: "p-task-1", title: "Task One" },
      { uid: "p-task-2", title: "Task Two" },
    ]);
    await h.open("p-alpha");

    // Drag Task Two before Project Alpha, verify marker appears, then release.
    const userChips = h.qa(".compass-pins .compass-pin-user");
    h.equal(userChips.length, 3, "three user pin chips rendered");
    const firstRect = h.rect(userChips[0]);
    const thirdJump = userChips[2].querySelector(".compass-pin-jump");
    const thirdRect = h.rect(thirdJump);

    dispatchPointer(thirdJump, "pointerdown", thirdRect.left + 10, thirdRect.top + 8, 1);
    dispatchPointer(window, "pointermove", firstRect.left + 4, firstRect.top + 8, 1);
    await h.wait(30);
    h.assert(Boolean(h.q(".compass-pin-drop-marker:not([hidden])")), "insertion marker is visible while dragging");
    dispatchPointer(window, "pointerup", firstRect.left + 4, firstRect.top + 8, 0);
    await h.wait(100);

    const savedAfterDrag = h.harness.extensionAPI.settings.get("compass-pins") ?? [];
    h.equal(
      JSON.stringify(savedAfterDrag.map((item) => item.uid)),
      JSON.stringify(["p-task-2", "p-alpha", "p-task-1"]),
      "pointer drag saves new pin order",
    );
    h.equal(h.text(".compass-node-center .compass-node-title"), "Project Alpha", "dragging pin did not trigger jump click");

    // Start another drag and cancel with Escape -> order stays unchanged.
    const reorderedChips = h.qa(".compass-pins .compass-pin-user");
    const lastJump = reorderedChips[2].querySelector(".compass-pin-jump");
    const lastRect = h.rect(lastJump);
    const leadRect = h.rect(reorderedChips[0]);
    dispatchPointer(lastJump, "pointerdown", lastRect.left + 10, lastRect.top + 8, 1);
    dispatchPointer(window, "pointermove", leadRect.left + 2, leadRect.top + 8, 1);
    await h.wait(30);
    h.key("Escape");
    dispatchPointer(window, "pointerup", leadRect.left + 2, leadRect.top + 8, 0);
    await h.wait(60);
    const savedAfterCancel = h.harness.extensionAPI.settings.get("compass-pins") ?? [];
    h.equal(
      JSON.stringify(savedAfterCancel.map((item) => item.uid)),
      JSON.stringify(["p-task-2", "p-alpha", "p-task-1"]),
      "Esc cancels pin drag and leaves order unchanged",
    );

    // Open keyboard picker (Alt+B), navigate with ArrowDown, press Enter on Task Two.
    h.key("b", { altKey: true });
    await h.wait(60);
    h.assert(Boolean(h.q(".compass-pins-picker:not([hidden])")), "Alt+B opens pins picker");
    const pickerItems = h.qa(".compass-pins-picker:not([hidden]) .compass-pins-picker-item");
    h.equal(pickerItems.length, 5, "picker lists 2 periodic + 3 user pins");
    h.key("ArrowDown");
    h.key("ArrowDown");
    h.equal(h.focused(), pickerItems[2], "ArrowDown moves to first user pin (Task Two)");
    h.key("Enter");
    await h.wait(300);
    h.assert(Boolean(h.q(".compass-pins-picker[hidden]")), "choosing picker item closes picker");
    h.equal(h.text(".compass-node-center .compass-node-title"), "Task Two", "Enter in picker focuses Task Two");

    // Re-open picker at end so screenshot captures the floating picker cleanly.
    h.features("pins").openPicker();
    await h.wait(50);
    h.assert(Boolean(h.q(".compass-pins-picker:not([hidden])")), "picker open for screenshot");
  },
};
