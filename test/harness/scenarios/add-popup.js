export const SCENARIOS = {
  async "add-popup"(h) {
    // Seed 22 pages so we can verify the popup stays inside root with 20 results.
    for (let i = 1; i <= 22; i += 1) {
      h.harness.graph.addPage(`Popup Option ${String(i).padStart(2, "0")}`);
    }

    await h.open("p-alpha");

    // Verify + tooltips read "Add a parent" etc.
    h.equal(h.q(".compass-zone-add-north")?.title, "Add a parent", "north + tooltip reads Add a parent");
    h.equal(h.q(".compass-zone-add-south")?.title, "Add a child", "south + tooltip reads Add a child");
    h.equal(h.q(".compass-zone-add-west")?.title, "Add a friend", "west + tooltip reads Add a friend");
    h.equal(h.q(".compass-zone-add-east")?.title, "Add a challenger", "east + tooltip reads Add a challenger");

    // Open south +
    h.click(".compass-zone-add-south");
    await h.wait(50);
    h.assert(!h.q(".compass-zone-pop").hidden, "add popup opens");
    h.equal(h.text(".compass-zone-title"), "Add a child", "heading reads Add a child");
    h.equal(
      h.text(".compass-zone-sub"),
      "Writes Child:: [[page]] on Project Alpha",
      "muted subtitle names the attribute write",
    );
    h.equal(h.q(".compass-zone-input")?.placeholder, "Find a page", "input placeholder reads Find a page");

    // Type a known title not yet south of Project Alpha; Enter adds it.
    h.type(".compass-zone-input", "Project Gamma");
    await h.wait(50);
    h.assert(
      h.q(".compass-zone-results .compass-result-active")?.textContent?.trim() === "Project Gamma",
      "first matching row is highlighted by default",
    );
    h.assert(h.count(".compass-zone-create-drawing") === 0, "no Create drawing row without Plexus");
    h.key("Enter");
    await h.wait(250);
    const southAfterKnown = h.qa('.compass-node[data-zone="south"] .compass-node-title').map((el) => el.textContent.trim());
    h.assert(southAfterKnown.includes("Project Gamma"), "Enter adds known page to south");
    h.assert(!h.status().includes("Plexus"), `status never says Plexus (got ${JSON.stringify(h.status())})`);

    // Type an unknown title: Create page row appears, no Create drawing row, Enter links it.
    h.click(".compass-zone-add-south");
    await h.wait(50);
    h.type(".compass-zone-input", "Fresh Milestone");
    await h.wait(50);
    const createRow = h.q(".compass-zone-create-page");
    h.assert(Boolean(createRow), "Create page row appears for unknown title");
    h.equal(createRow?.textContent?.trim(), 'Create page "Fresh Milestone"', "Create page row reads expected text");
    h.equal(h.count(".compass-zone-create-drawing"), 0, "still no Create drawing row without Plexus");
    h.key("Enter");
    await h.wait(250);
    const southAfterNew = h.qa('.compass-node[data-zone="south"] .compass-node-title').map((el) => el.textContent.trim());
    h.assert(southAfterNew.includes("Fresh Milestone"), "Enter links new page through writeZone");
    h.assert(!h.status().includes("Plexus"), `status never says Plexus after create (got ${JSON.stringify(h.status())})`);

    // 20 results: verify ArrowDown/ArrowUp and that popup stays strictly inside .compass-root.
    h.click(".compass-zone-add-south");
    await h.wait(50);
    h.type(".compass-zone-input", "Popup Option");
    await h.wait(50);
    const items = h.qa(".compass-zone-results .compass-result");
    h.assert(items.length >= 20, `at least 20 result rows rendered (got ${items.length})`);
    h.assert(items[0].classList.contains("compass-result-active"), "first row highlighted initially");
    h.key("ArrowDown");
    await h.wait(20);
    h.assert(items[1].classList.contains("compass-result-active"), "ArrowDown moves highlight to second row");
    h.key("ArrowUp");
    await h.wait(20);
    h.assert(items[0].classList.contains("compass-result-active"), "ArrowUp moves highlight back to first row");

    const rootRect = h.rect(".compass-root");
    const popRect = h.rect(".compass-zone-pop");
    h.assert(
      popRect.left >= rootRect.left
        && popRect.right <= rootRect.right + 1
        && popRect.top >= rootRect.top
        && popRect.bottom <= rootRect.bottom + 1,
      `popup rect stays inside root rect (pop=${JSON.stringify(popRect)}, root=${JSON.stringify(rootRect)})`,
    );

    // Esc closes popup and returns focus to south + button.
    h.key("Escape");
    await h.wait(40);
    h.assert(h.q(".compass-zone-pop").hidden, "Escape closes add popup");
    h.equal(h.focused(), h.q(".compass-zone-add-south"), "Escape returns focus to the + button that opened it");

    // Un-linkable title without Plexus: no Create rows, muted unselectable warning line.
    h.click(".compass-zone-add-south");
    await h.wait(50);
    h.type(".compass-zone-input", "[Draft]");
    await h.wait(50);
    h.equal(h.count(".compass-zone-create-page"), 0, "no Create page row for [Draft]");
    h.equal(h.count(".compass-zone-create-drawing"), 0, "no Create drawing row for [Draft]");
    h.equal(
      h.text(".compass-zone-results .compass-result-none"),
      "A page title cannot contain [ or ].",
      "muted notice explains why [Draft] cannot be linked",
    );
    h.key("Enter");
    await h.wait(40);
    h.assert(!h.q(".compass-zone-pop").hidden, "Enter on unselectable notice does not close popup");

    // Ctrl+F with popup open closes popup before focusing search input.
    h.key("f", { ctrlKey: true });
    await h.wait(40);
    h.assert(h.q(".compass-zone-pop").hidden, "Ctrl+F closes add popup");
    h.equal(h.focused(), h.q(".compass-search"), "Ctrl+F moves focus to search input");

    // With RoamPlexus stub: Create drawing row appears, is not default Enter pick, and is absent for bad titles.
    const createdDrawings = [];
    window.RoamPlexus = {
      apiVersion: 2,
      create(opts) {
        createdDrawings.push(opts);
        return Promise.resolve({ pageUid: "p-drawing-stub" });
      },
    };
    try {
      h.click(".compass-zone-add-south");
      await h.wait(50);
      h.type(".compass-zone-input", "Arch Diagram");
      await h.wait(50);
      const drawRow = h.q(".compass-zone-create-drawing");
      h.assert(Boolean(drawRow), "Create drawing row appears when RoamPlexus is present");
      h.equal(drawRow?.textContent?.trim(), 'Create drawing "Arch Diagram"', "Create drawing row text matches");
      h.assert(!drawRow.classList.contains("compass-result-active"), "Create drawing is not what Enter picks by default");
      h.assert(
        h.q(".compass-zone-create-page")?.classList.contains("compass-result-active"),
        "Create page row is highlighted by default",
      );
      h.key("Enter");
      await h.wait(250);
      h.equal(createdDrawings.length, 0, "Enter creates page rather than calling RoamPlexus.create");
      const southAfterArch = h.qa('.compass-node[data-zone="south"] .compass-node-title').map((el) => el.textContent.trim());
      h.assert(southAfterArch.includes("Arch Diagram"), "Enter linked Arch Diagram as a page");

      h.click(".compass-zone-add-south");
      await h.wait(50);
      h.type(".compass-zone-input", "foo]bar");
      await h.wait(50);
      h.equal(h.count(".compass-zone-create-page"), 0, "Create page absent for foo]bar with Plexus");
      h.equal(h.count(".compass-zone-create-drawing"), 0, "Create drawing absent for foo]bar with Plexus");
      h.equal(
        h.text(".compass-zone-results .compass-result-none"),
        "A page title cannot contain [ or ].",
        "muted notice shown for foo]bar with Plexus",
      );
      h.key("Enter");
      await h.wait(40);
      h.equal(createdDrawings.length, 0, "Enter on foo]bar never calls RoamPlexus.create");
      h.key("Escape");
      await h.wait(40);
    } finally {
      delete window.RoamPlexus;
    }

    // Reopen with 20 results for visual inspection in the screenshot.
    h.click(".compass-zone-add-south");
    await h.wait(50);
    h.type(".compass-zone-input", "Popup Option");
    await h.wait(50);
  },
};
