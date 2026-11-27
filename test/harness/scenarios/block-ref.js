export const SCENARIOS = {
  async "block-ref"(h) {
    const expectedText = "19:15 - 19:45 (30') Verify edge cases for Subtask B";
    const expectedRef = "Verify edge cases for Subtask B";

    // Center the TimeBlock slot block directly.
    await h.open("b-tb-slot");
    const centerTitle = h.q(".compass-node-center .compass-node-title");
    h.assert(Boolean(centerTitle), "center title exists");
    h.equal(centerTitle.textContent.trim(), expectedText, "center title resolves referenced task text");
    const centerRefs = Array.from(centerTitle.querySelectorAll(".compass-ref"));
    h.equal(centerRefs.length, 1, "center title has one .compass-ref span");
    h.equal(centerRefs[0]?.textContent?.trim(), expectedRef, "center .compass-ref holds referenced block text");

    const visibleLabelsOnSlot = h.qa(".compass-node-title, .compass-row-text, .compass-badge")
      .map((el) => el.textContent);
    h.assert(
      visibleLabelsOnSlot.every((text) => !text.includes("(( ))")),
      "no visible label contains (( )) when centered on b-tb-slot",
    );

    // Center the parent block so b-tb-slot appears as a neighbor node.
    await h.open("b-tb-parent");
    const neighbor = h.q('.compass-node[data-uid="b-tb-slot"]');
    h.assert(Boolean(neighbor), "b-tb-slot appears as a neighbor of b-tb-parent");
    const neighborTitle = neighbor?.querySelector(".compass-node-title");
    h.equal(neighborTitle?.textContent?.trim(), expectedText, "neighbor title resolves referenced task text");
    const neighborRefs = Array.from(neighborTitle?.querySelectorAll(".compass-ref") ?? []);
    h.equal(neighborRefs.length, 1, "neighbor title has one .compass-ref span");
    h.equal(neighborRefs[0]?.textContent?.trim(), expectedRef, "neighbor .compass-ref holds referenced block text");

    const visibleLabelsOnParent = h.qa(".compass-node-title, .compass-row-text, .compass-badge")
      .map((el) => el.textContent);
    h.assert(
      visibleLabelsOnParent.every((text) => !text.includes("(( ))")),
      "no visible label contains (( )) when centered on b-tb-parent",
    );

    // Deep reference chains (J1): outline block, center block, and linked-reference block.
    h.harness.graph.addPage("Ref Depth", { uid: "p-rd-pool" });
    h.harness.graph.addBlock("p-rd-pool", "Leaf", { uid: "b-rd-3" });
    h.harness.graph.addBlock("p-rd-pool", "Task ((b-rd-3))", { uid: "b-rd-2" });
    h.harness.graph.addBlock("p-rd-pool", "Slot ((b-rd-2))", { uid: "b-rd-1" });
    h.harness.graph.addBlock("p-rd-pool", "Task", { uid: "b-rd-m2" });
    h.harness.graph.addBlock("p-rd-pool", "Slot ((b-rd-m2))", { uid: "b-rd-m1" });

    // 1. Outline block `See ((b-rd-1))` gives neighbor `b-rd-1` titled `Slot Task Leaf`.
    h.harness.graph.addPage("Outline Ref Depth", { uid: "p-rd-outline" });
    h.harness.graph.addBlock("p-rd-outline", "See ((b-rd-1))", { uid: "b-rd-outline" });
    await h.open("p-rd-outline");
    const outlineNeighbor = h.q('.compass-node[data-uid="b-rd-1"] .compass-node-title');
    h.equal(outlineNeighbor?.textContent?.trim(), "Slot Task Leaf", "outline ref neighbor resolves two levels of its own refs");

    // 2. Center block `See ((b-rd-1))` carries b-rd-1 -> b-rd-2 -> b-rd-3 so co-mentioned neighbor b-rd-1 reads `Slot Task Leaf`.
    h.harness.graph.addPage("Center Ref Depth", { uid: "p-rd-center" });
    h.harness.graph.addBlock("p-rd-center", "See ((b-rd-1))", { uid: "b-rd-center" });
    h.harness.graph.addPage("Center Co Mention", { uid: "p-rd-co" });
    h.harness.graph.addBlock("p-rd-co", "Co ((b-rd-center)) ((b-rd-1))", { uid: "b-rd-co" });
    await h.open("b-rd-center");
    const centerNeighbor = h.q('.compass-node[data-uid="b-rd-1"] .compass-node-title');
    h.equal(centerNeighbor?.textContent?.trim(), "Slot Task Leaf", "center block ref carries two levels for neighbor b-rd-1");

    // 3. Linked-reference block `Meeting ((b-rd-m1))` resolves b-rd-m1 -> b-rd-m2.
    h.harness.graph.addPage("Linked Ref Target", { uid: "p-rd-linked-target" });
    h.harness.graph.addPage("Linked Ref Source", { uid: "p-rd-linked-src" });
    h.harness.graph.addBlock("p-rd-linked-src", "Meeting ((b-rd-m1)) [[Linked Ref Target]]", { uid: "b-rd-mention" });
    await h.open("p-rd-linked-target");
    const mentionSibling = h.q('.compass-node[data-uid="b-rd-m1"] .compass-node-title');
    h.equal(mentionSibling?.textContent?.trim(), "Slot Task", "linked-reference co-mentioned block resolves its nested ref");

    // Re-center b-tb-slot for the screenshot so the resolved center title and dotted underline are clearly visible.
    await h.open("b-tb-slot");
  },
};
