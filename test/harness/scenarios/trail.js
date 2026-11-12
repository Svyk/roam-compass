export const SCENARIOS = {
  async trail(h) {
    await h.open("p-alpha");
    h.equal(h.text(".compass-node-center .compass-node-title"), "Project Alpha", "initial center is Project Alpha");

    const taskOne = h.qa('.compass-node[data-zone="south"]').find((el) => el.textContent.includes("Task One"));
    h.assert(Boolean(taskOne), "Task One node exists on Project Alpha");
    h.click(taskOne);
    await h.wait(450);
    h.equal(h.text(".compass-node-center .compass-node-title"), "Task One", "Task One becomes center");

    h.click(".compass-back");
    await h.wait(250);
    h.equal(h.text(".compass-node-center .compass-node-title"), "Project Alpha", "Back returns to Project Alpha");

    const taskTwo = h.qa('.compass-node[data-zone="south"]').find((el) => el.textContent.includes("Task Two"));
    h.assert(Boolean(taskTwo), "Task Two node exists on Project Alpha");
    h.click(taskTwo);
    await h.wait(450);
    h.equal(h.text(".compass-node-center .compass-node-title"), "Task Two", "Task Two becomes center");

    h.click(".compass-trail-btn");
    await h.wait(60);
    h.assert(Boolean(h.q(".compass-trail-panel:not([hidden])")), "Footprints panel opens");
    h.equal(h.q(".compass-trail-btn")?.getAttribute("aria-pressed"), "true", "Footprints button aria-pressed is true");
    h.equal(h.q(".compass-trail-btn")?.getAttribute("aria-expanded"), "true", "Footprints button aria-expanded is true");
    h.equal(h.text(".compass-trail-count"), "4 visits", "panel header shows 4 visits");

    const rows4 = h.qa(".compass-trail-panel:not([hidden]) .compass-trail-row");
    const titles4 = rows4.map((row) => h.text(row.querySelector(".compass-trail-title")));
    h.equal(
      JSON.stringify(titles4),
      JSON.stringify(["Task Two", "Project Alpha", "Task One", "Project Alpha"]),
      "four rows in order Task Two, Project Alpha, Task One, Project Alpha",
    );
    h.assert(rows4[0].classList.contains("compass-trail-row-current"), "newest row is marked as current center");
    h.equal(h.focused(), rows4[0], "opening focuses newest row");

    h.click(rows4[rows4.length - 1]);
    await h.wait(250);
    h.assert(Boolean(h.q(".compass-trail-panel[hidden]")), "choosing a row closes the panel");
    h.equal(h.text(".compass-node-center .compass-node-title"), "Project Alpha", "choosing last row focuses Project Alpha");

    h.click(".compass-trail-btn");
    await h.wait(60);
    const rows5 = h.qa(".compass-trail-panel:not([hidden]) .compass-trail-row");
    const titles5 = rows5.map((row) => h.text(row.querySelector(".compass-trail-title")));
    h.equal(titles5.length, 5, "list now has five rows");
    h.equal(
      JSON.stringify(titles5),
      JSON.stringify(["Project Alpha", "Task Two", "Project Alpha", "Task One", "Project Alpha"]),
      "choosing a row appends a new visit without erasing history",
    );

    h.click(".compass-trail-start");
    await h.wait(60);
    const rows1 = h.qa(".compass-trail-panel:not([hidden]) .compass-trail-row");
    h.equal(rows1.length, 1, "Start here keeps one row");
    h.equal(h.text(rows1[0].querySelector(".compass-trail-title")), "Project Alpha", "kept row is current center");
    h.equal(h.text(".compass-trail-count"), "1 visit", "header updates to 1 visit");
  },

  "trail-copy": async (h) => {
    await h.open("p-alpha");
    await h.open("b-alpha-budget");
    await h.open("p-task-1");

    const markdown = h.harness.overlay.features.get("trail").markdown();
    h.equal(
      markdown,
      "- [[Task One]]\n- ((b-alpha-budget))\n- [[Project Alpha]]",
      "markdown formats pages as [[Title]] and blocks as ((uid)) newest first",
    );

    h.click(".compass-trail-btn");
    await h.wait(60);
    h.assert(Boolean(h.q(".compass-trail-panel:not([hidden])")), "Footprints panel open for screenshot");
    h.equal(h.count(".compass-trail-panel:not([hidden]) .compass-trail-row"), 3, "three rows in open Footprints panel");
  },

  "trail-keys": async (h) => {
    const tempUid = h.harness.graph.addPage("Ephemeral Page", { uid: "p-ephemeral" });
    await h.open(tempUid);
    await h.open("p-alpha");
    await h.open("p-task-1");

    // Remove Ephemeral Page from the graph so it no longer exists when Footprints renders.
    h.harness.graph.pages = h.harness.graph.pages.filter((page) => page.uid !== tempUid);

    h.key("h", { altKey: true });
    await h.wait(60);
    h.assert(Boolean(h.q(".compass-trail-panel:not([hidden])")), "Alt+H opens Footprints");

    const rows = h.qa(".compass-trail-panel:not([hidden]) .compass-trail-row");
    h.equal(rows.length, 3, "three rows rendered");
    h.equal(rows[2].disabled, true, "deleted page row is disabled");
    h.assert(rows[2].classList.contains("compass-trail-row-missing"), "deleted page row is marked missing");

    h.key("ArrowDown");
    h.equal(h.focused(), rows[1], "ArrowDown moves to second row");
    h.key("End");
    h.equal(h.focused(), rows[1], "End stops on last enabled row");
    h.key("Home");
    h.equal(h.focused(), rows[0], "Home returns to newest row");

    h.key("Escape");
    await h.wait(50);
    h.assert(Boolean(h.q(".compass-trail-panel[hidden]")), "Escape closes Footprints panel");
    h.assert(h.harness.overlay.isOpen(), "Escape did not close Compass while Footprints was open");
    h.equal(h.focused(), h.q(".compass-trail-btn"), "Escape returns focus to Footprints button");
  },
};
