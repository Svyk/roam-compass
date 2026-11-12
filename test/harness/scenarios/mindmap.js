function findNodeByTitle(h, title) {
  return h.qa(".compass-mindmap .compass-node").find((el) => (
    el.querySelector(".compass-node-title")?.textContent?.trim() === title
  )) ?? null;
}

function drawnTitles(h) {
  return h.qa(".compass-mindmap .compass-node .compass-node-title").map((el) => el.textContent.trim());
}

export const SCENARIOS = {
  async mindmap(h) {
    await h.features("views").set("mindmap");
    await h.open("p-alpha");

    h.equal(h.text(".compass-mindmap .compass-node-center .compass-node-title"), "Project Alpha", "root is Project Alpha");

    const initial = drawnTitles(h);
    for (const expected of ["Task One", "Task Two", "Task Three", "Subtask A", "Subtask B"]) {
      h.assert(initial.includes(expected), `${expected} is drawn initially`);
    }
    h.assert(!initial.includes("Detail A1"), "Detail A1 is not drawn before expanding Subtask A");
    h.noOverlap(".compass-node");

    const subtaskA = findNodeByTitle(h, "Subtask A");
    const subtaskAChevron = subtaskA?.querySelector(".compass-mm-chevron");
    h.assert(Boolean(subtaskAChevron), "Subtask A has a chevron");
    h.click(subtaskAChevron);
    await h.wait(60);

    h.assert(drawnTitles(h).includes("Detail A1"), "Detail A1 appears after clicking Subtask A chevron");
    h.noOverlap(".compass-node");

    const taskOne = findNodeByTitle(h, "Task One");
    const taskOneChevron = taskOne?.querySelector(".compass-mm-chevron");
    h.assert(Boolean(taskOneChevron), "Task One has a chevron");
    h.click(taskOneChevron);
    await h.wait(60);

    const afterFold = drawnTitles(h);
    for (const gone of ["Subtask A", "Subtask B", "Detail A1"]) {
      h.assert(!afterFold.includes(gone), `${gone} is gone after folding Task One`);
    }

    const programs = findNodeByTitle(h, "Programs");
    h.assert(Boolean(programs), "Programs is drawn");
    const rootRect = h.rect(".compass-mindmap .compass-node-center");
    const programsRect = h.rect(programs);
    h.assert(programsRect.bottom < rootRect.top, "Programs is drawn above the root");

    h.noOverlap(".compass-node");
  },

  async "mindmap-root"(h) {
    await h.features("views").set("mindmap");
    await h.open("p-alpha");

    const taskOne = findNodeByTitle(h, "Task One");
    h.assert(Boolean(taskOne), "Task One exists in Mind Map");
    h.click(taskOne);
    await h.wait(550);

    h.equal(h.text(".compass-mindmap .compass-node-center .compass-node-title"), "Task One", "Task One becomes the root");
    const alphaParent = findNodeByTitle(h, "Project Alpha");
    h.assert(Boolean(alphaParent), "Project Alpha is drawn");
    h.equal(alphaParent.dataset.zone, "north", "Project Alpha has zone north");
    const rootRect = h.rect(".compass-mindmap .compass-node-center");
    const alphaRect = h.rect(alphaParent);
    h.assert(alphaRect.bottom < rootRect.top, "Project Alpha sits above Task One");
    h.noOverlap(".compass-node");
  },

  async "mindmap-balanced"(h) {
    await h.features("views").set("mindmap");
    await h.setting("compass-mindmap-direction", "balanced");
    await h.open("p-alpha");

    const rootRect = h.rect(".compass-mindmap .compass-node-center");
    const others = h.qa(".compass-mindmap .compass-node:not(.compass-node-center)");
    const leftSide = others.filter((el) => h.rect(el).right < rootRect.left);
    const rightSide = others.filter((el) => h.rect(el).left > rootRect.right);
    h.assert(leftSide.length >= 1, `nodes exist left of the root (got ${leftSide.length})`);
    h.assert(rightSide.length >= 1, `nodes exist right of the root (got ${rightSide.length})`);
    h.noOverlap(".compass-node");
  },

  async "mindmap-back"(h) {
    await h.features("views").set("mindmap");
    await h.open("p-alpha");
    h.assert(h.count(".compass-mindmap .compass-node") > 0, "Mind Map drew nodes");

    await h.features("views").set("compass");
    await h.wait(100);

    h.equal(h.count(".compass-mindmap .compass-node"), 0, ".compass-mindmap holds no nodes");
    h.equal(h.text(".compass-world > .compass-node-center .compass-node-title"), "Project Alpha", "Compass center node is back");
    h.assert(h.count('.compass-world > .compass-node[data-zone="south"]') >= 3, "normal Compass south nodes are back");
  },

  async "mindmap-extra"(h) {
    const g = h.harness.graph;
    g.addPage("Isolated Root", { uid: "p-isolated" });
    g.addPage("Crowded Hub", { uid: "p-crowded" });
    for (let i = 1; i <= 14; i += 1) {
      g.addBlock("p-crowded", `Child:: [[Branch ${i}]]`);
    }
    g.addBlock("p-detail-a1", "Child:: [[Task One]]");

    await h.features("views").set("mindmap");
    await h.open("p-isolated");
    h.equal(h.text(".compass-mm-empty"), "Nothing branches from here yet.", "empty root shows quiet line");

    await h.open("p-crowded");
    const moreBtn = h.q(".compass-mm-more");
    h.assert(Boolean(moreBtn), "+N more button is shown when >12 children");
    h.equal(h.text(moreBtn), "+2 more", "more button shows hidden count");
    h.click(moreBtn);
    await h.wait(60);
    h.equal(h.count(".compass-mm-more"), 0, "clicking +N more reveals remaining children");
    h.assert(drawnTitles(h).includes("Branch 14"), "Branch 14 is now drawn");
    h.noOverlap(".compass-node");

    await h.open("p-alpha");
    const saNode = findNodeByTitle(h, "Subtask A");
    h.assert(Boolean(saNode), "Subtask A exists");
    saNode.focus();
    h.key("Enter", { altKey: true });
    await h.wait(60);
    const da1Node = findNodeByTitle(h, "Detail A1");
    h.assert(Boolean(da1Node), "Detail A1 opened via Alt+Enter");
    da1Node.focus();
    h.key("Enter", { altKey: true });
    await h.wait(60);
    const repeatNode = h.q(".compass-mindmap .compass-node.compass-mm-repeat");
    h.assert(Boolean(repeatNode), "cycle node Task One under Detail A1 renders as repeat");
    h.equal(repeatNode.title, "Shown elsewhere in this map", "repeat tooltip matches contract");
    h.assert(Boolean(repeatNode.querySelector(".compass-mm-repeat-mark")), "repeat node has ↺ mark");
    const fitBtn = h.qa(".compass-bar button").find((btn) => btn.textContent.trim() === "Fit");
    if (fitBtn) {
      h.click(fitBtn);
      await h.wait(60);
    }
    h.noOverlap(".compass-node");

    const outline = h.features("mindmap").outline();
    h.equal(outline?.root?.title, "Project Alpha", "outline() returns root item");
    h.assert(Array.isArray(outline?.parents) && outline.parents.length >= 1, "outline() includes parents");
  },
};
