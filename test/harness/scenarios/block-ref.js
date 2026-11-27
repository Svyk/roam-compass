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

    // Re-center b-tb-slot for the screenshot so the resolved center title and dotted underline are clearly visible.
    await h.open("b-tb-slot");
  },
};
