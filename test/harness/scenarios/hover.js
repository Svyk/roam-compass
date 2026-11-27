function hoverNode(el) {
  el.dispatchEvent(new PointerEvent("pointerover", {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
  }));
}

export const SCENARIOS = {
  async hover(h) {
    // Compass view: Project Alpha has parent Programs and sibling Project Gamma (via Programs).
    await h.open("p-alpha");

    const sibling = h.q('.compass-world .compass-node[data-uid="p-gamma"]');
    const parent = h.q('.compass-world .compass-node[data-uid="p-programs"]');
    const unrelated = h.q('.compass-world .compass-node[data-uid="p-task-1"]');
    h.assert(Boolean(sibling && parent && unrelated), "Compass renders sibling p-gamma, parent p-programs, and p-task-1");

    hoverNode(sibling);
    h.equal(parent.classList.contains("compass-node-hot"), true, "hovering sibling keeps its parent hot");
    h.equal(parent.classList.contains("compass-node-dim"), false, "hovering sibling does not dim its parent");
    h.equal(unrelated.classList.contains("compass-node-dim"), true, "hovering sibling dims an unrelated node");
    const sibArc = h.q('.compass-world .compass-edge[data-uid="p-gamma"]');
    h.equal(sibArc?.classList.contains("compass-edge-hot"), true, "sibling arc is hot while sibling is hovered");

    hoverNode(parent);
    h.equal(sibling.classList.contains("compass-node-hot"), true, "hovering parent keeps its sibling hot");
    h.equal(sibling.classList.contains("compass-node-dim"), false, "hovering parent does not dim its sibling");
    h.equal(sibArc?.classList.contains("compass-edge-hot"), true, "sibling arc is hot while parent is hovered");

    // Mind Map view: two generations (Task One -> Subtask A) plus unrelated branch Task Two.
    await h.features("views").set("mindmap");
    await h.wait(80);

    const grand = h.q('.compass-mindmap .compass-node[data-uid="p-subtask-a"]');
    const branchParent = h.q('.compass-mindmap .compass-node[data-uid="p-task-1"]');
    const otherBranch = h.q('.compass-mindmap .compass-node[data-uid="p-task-2"]');
    h.assert(Boolean(grand && branchParent && otherBranch), "Mind Map renders depth-2 p-subtask-a, depth-1 p-task-1, and p-task-2");

    hoverNode(grand);
    h.equal(branchParent.classList.contains("compass-node-dim"), false, "hovering depth-2 node does not dim its depth-1 parent");
    h.equal(branchParent.classList.contains("compass-node-hot"), true, "hovering depth-2 node keeps its depth-1 parent hot");
    h.equal(otherBranch.classList.contains("compass-node-dim"), true, "hovering depth-2 node dims an unrelated branch");

    hoverNode(branchParent);
    h.equal(grand.classList.contains("compass-node-dim"), false, "hovering depth-1 parent does not dim its depth-2 child");
    h.equal(grand.classList.contains("compass-node-hot"), true, "hovering depth-1 parent keeps its depth-2 child hot");
    h.equal(otherBranch.classList.contains("compass-node-dim"), true, "hovering depth-1 parent dims an unrelated branch");

    // Return to Compass view with sibling hovered for a clean screenshot.
    await h.features("views").set("compass");
    await h.wait(80);
    hoverNode(h.q('.compass-world .compass-node[data-uid="p-gamma"]'));
  },
};
