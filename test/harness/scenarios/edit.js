function openDetailsFor(h, uid) {
  const node = h.q(`.compass-node[data-uid="${uid}"]`);
  h.assert(Boolean(node), `node ${uid} exists`);
  h.contextmenu(node);
  const why = h.qa(".compass-menu:not([hidden]) .compass-menu-item")
    .find((el) => el.textContent.trim() === "Why is this here?");
  h.assert(Boolean(why), "Why is this here? menu item exists");
  if (why) h.click(why);
}

function clickDetailsAction(h, label) {
  const btn = h.qa(".compass-details:not([hidden]) .compass-details-open")
    .find((el) => el.textContent.trim() === label);
  h.assert(Boolean(btn), `details action "${label}" exists`);
  if (btn) h.click(btn);
}

function pageBlocks(h, pageUid) {
  const page = h.harness.graph.pages.find((entry) => entry.uid === pageUid);
  return page?.children ?? [];
}

export const SCENARIOS = {
  async pairs(h) {
    h.harness.graph.addBlock("p-task-2", "Guide:: [[Programs]]");
    await h.setting("north", "Guide|Explains, Parent");

    await h.open("p-task-2");
    h.equal(
      h.text('.compass-edge[data-uid="p-programs"] .compass-edge-label'),
      "Guide",
      "outgoing edge from Task Two to Programs reads Guide",
    );

    await h.open("p-programs");
    h.equal(
      h.text('.compass-edge[data-uid="p-task-2"] .compass-edge-label'),
      "Explains",
      "incoming edge on Programs from Task Two reads Explains",
    );
    h.noOverlap(".compass-node");
  },

  async unlink(h) {
    await h.open("p-alpha");
    openDetailsFor(h, "p-beta");
    await h.wait(40);
    clickDetailsAction(h, "Unlink");
    await h.wait(40);

    const dialog = h.q('.compass-edit-backdrop:not([hidden]) [role="alertdialog"]');
    h.assert(Boolean(dialog), "Unlink confirmation alertdialog opens");
    h.equal(h.text(".compass-edit-title"), "Unlink this relation?", "Unlink dialog title");
    h.equal(
      h.text(".compass-edit-relation"),
      "[[Project Alpha]] — Friend:: [[Project Beta]]",
      "Unlink dialog shows relation description",
    );
    h.equal(h.focused(), h.q(".compass-edit-cancel"), "Cancel button receives initial focus");

    h.click(".compass-edit-confirm");
    await h.wait(450);

    const calls = h.calls("applyPlan");
    h.equal(calls.length, 1, "applyPlan called once");
    const ops = calls[0]?.[1]?.ops ?? [];
    h.assert(
      ops.some((op) => (op.op === "delete" || op.op === "update") && op.uid === "b-alpha-friend"),
      "applyPlan deletes or updates the Friend:: block",
    );
    h.equal(h.q('.compass-node[data-uid="p-beta"]'), null, "Project Beta is gone after reload");
    h.equal(h.status(), "Unlinked.", "status reads Unlinked.");
  },

  async "unlink-cancel"(h) {
    await h.open("p-alpha");
    openDetailsFor(h, "p-beta");
    await h.wait(40);
    clickDetailsAction(h, "Unlink");
    await h.wait(40);

    h.assert(Boolean(h.q(".compass-edit-backdrop:not([hidden])")), "Unlink dialog is open");
    h.key("Escape");
    await h.wait(60);
    h.assert(Boolean(h.q(".compass-edit-backdrop[hidden]")), "Escape closes Unlink dialog");
    h.assert(!h.q(".compass-root").hidden, "Escape keeps overlay open");

    openDetailsFor(h, "p-beta");
    await h.wait(40);
    clickDetailsAction(h, "Unlink");
    await h.wait(40);
    h.click(".compass-edit-cancel");
    await h.wait(100);

    h.assert(Boolean(h.q(".compass-edit-backdrop[hidden]")), "Unlink dialog closes on Cancel");
    h.equal(h.calls("applyPlan").length, 0, "applyPlan was not called");
    h.assert(Boolean(h.q('.compass-node[data-uid="p-beta"]')), "Project Beta remains on map");

    openDetailsFor(h, "p-beta");
    await h.wait(40);
    h.noOverlap(".compass-details-item button");
  },

  async "unlink-nested"(h) {
    h.harness.graph.addBlock("p-alpha", "Keep this nested note", { parentUid: "b-alpha-friend" });
    await h.open("p-alpha");
    openDetailsFor(h, "p-beta");
    await h.wait(40);
    clickDetailsAction(h, "Unlink");
    await h.wait(40);

    h.assert(Boolean(h.q('.compass-edit-backdrop:not([hidden]) [role="alertdialog"]')), "Unlink dialog opens");
    h.click(".compass-edit-confirm");
    await h.wait(300);

    h.equal(h.calls("applyPlan").length, 0, "no applyPlan call was made");
    h.equal(
      h.status(),
      "That block has nested content, so Compass left it alone and opened it for you.",
      "status shows nested-content refusal message",
    );
    const sidebarCalls = h.calls("openInSidebar");
    h.assert(
      sidebarCalls.some((entry) => entry[1] === "b-alpha-friend" && entry[2] === "block"),
      "openInSidebar was called for source block b-alpha-friend",
    );
    h.assert(Boolean(h.q('.compass-node[data-uid="p-beta"]')), "Project Beta remains on map");
    const friendBlock = pageBlocks(h, "p-alpha").find((blk) => blk.uid === "b-alpha-friend");
    h.equal(friendBlock?.children?.length, 1, "nested note under Friend:: block was preserved");
  },

  async "flip-owner"(h) {
    await h.open("p-alpha");
    openDetailsFor(h, "p-programs");
    await h.wait(40);
    clickDetailsAction(h, "Flip owner");
    await h.wait(40);

    const dialog = h.q('.compass-edit-backdrop:not([hidden]) [role="alertdialog"]');
    h.assert(Boolean(dialog), "Flip owner confirmation alertdialog opens");
    h.equal(h.text(".compass-edit-title"), "Move this relation to the other page?", "Flip owner title");
    h.equal(
      h.text(".compass-edit-step-now .compass-edit-relation"),
      "[[Project Alpha]] — Parent:: [[Programs]]",
      "Now line shows relation on Project Alpha",
    );
    h.equal(
      h.text(".compass-edit-step-after .compass-edit-relation"),
      "[[Programs]] — Child:: [[Project Alpha]]",
      "After saving line shows inverse relation on Programs",
    );

    h.click(".compass-edit-confirm");
    await h.wait(450);

    const progBlocks = pageBlocks(h, "p-programs");
    const alphaBlocks = pageBlocks(h, "p-alpha");
    h.assert(
      progBlocks.some((blk) => blk.string.startsWith("Child::") && blk.string.includes("[[Project Alpha]]")),
      "Programs now has Child:: referencing [[Project Alpha]]",
    );
    h.assert(
      !alphaBlocks.some((blk) => blk.string.includes("Parent:: [[Programs]]")),
      "Project Alpha no longer has Parent:: [[Programs]]",
    );
    const programsNode = h.q('.compass-node[data-uid="p-programs"]');
    h.assert(Boolean(programsNode), "Programs node remains visible");
    h.equal(programsNode?.dataset?.zone, "north", "Programs stays north of Project Alpha");
    h.equal(h.status(), "Moved to [[Programs]] as Child::", "status confirms moved relation");
  },

  async "edit-guard"(h) {
    await h.open("p-alpha");
    openDetailsFor(h, "p-beta");
    await h.wait(40);
    clickDetailsAction(h, "Unlink");
    await h.wait(40);

    h.harness.graph.setBlock("b-alpha-friend", "Friend:: [[Project Beta]] [[Jane]]");
    await h.wait(200);

    h.click(".compass-edit-confirm");
    await h.wait(450);

    const friendBlock = pageBlocks(h, "p-alpha").find((blk) => blk.uid === "b-alpha-friend");
    h.equal(
      friendBlock?.string,
      "Friend:: [[Project Beta]] [[Jane]]",
      "edited source block in fake graph was not overwritten",
    );
    h.assert(
      h.status().toLowerCase().includes("changed"),
      `status mentions changed block (got "${h.status()}")`,
    );
  },

  async "unlink-dialog"(h) {
    h.harness.graph.addBlock("p-alpha", "Sync timeline with [[Project Beta]]");
    h.harness.graph.addBlock("p-alpha", "Since:: 2025", { parentUid: "b-alpha-friend" });
    h.harness.graph.addBlock("p-alpha", "Scope:: Core", { parentUid: "b-alpha-friend" });
    await h.open("p-alpha");
    openDetailsFor(h, "p-beta");
    await h.wait(40);
    clickDetailsAction(h, "Unlink");
    await h.wait(60);

    h.assert(Boolean(h.q('.compass-edit-backdrop:not([hidden]) [role="alertdialog"]')), "Unlink dialog visible");
    h.equal(
      h.text(".compass-edit-labels"),
      "This also removes its 2 labels.",
      "Unlink dialog notes removed labels",
    );
    h.equal(
      h.text(".compass-edit-other"),
      "These two are still connected by 1 other block.",
      "Unlink dialog notes remaining connection",
    );
    h.equal(h.focused(), h.q(".compass-edit-cancel"), "Cancel button focused");
    h.noOverlap(".compass-edit-actions button");
  },

  async "flip-owner-dialog"(h) {
    await h.open("p-alpha");
    const programsNode = h.q('.compass-node[data-uid="p-programs"]');
    h.assert(Boolean(programsNode), "Programs node exists");
    h.contextmenu(programsNode);
    await h.wait(40);
    const flipItem = h.qa(".compass-menu:not([hidden]) .compass-menu-item")
      .find((el) => el.textContent.trim() === "Flip owner…");
    h.assert(Boolean(flipItem), "Flip owner… context menu item exists");
    if (flipItem) h.click(flipItem);
    await h.wait(60);

    h.assert(Boolean(h.q('.compass-edit-backdrop:not([hidden]) [role="alertdialog"]')), "Flip owner dialog visible");
    h.equal(h.focused(), h.q(".compass-edit-cancel"), "Cancel button focused");
    h.noOverlap(".compass-edit-step");
    h.noOverlap(".compass-edit-actions button");
  },
};
