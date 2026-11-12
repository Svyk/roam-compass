export const SCENARIOS = {
  async compass(h) {
    await h.open("p-alpha");
    h.equal(h.text(".compass-node-center .compass-node-title"), "Project Alpha", "center title is Project Alpha");
    for (const zone of ["north", "south", "west", "east", "siblings"]) {
      h.assert(h.count(`.compass-node[data-zone="${zone}"]`) >= 1, `at least one node in ${zone}`);
    }
    const southTitles = h.qa('.compass-node[data-zone="south"] .compass-node-title').map((el) => el.textContent.trim());
    for (const task of ["Task One", "Task Two", "Task Three"]) {
      h.assert(southTitles.includes(task), `${task} sits south`);
    }
    const edgeLabels = h.qa(".compass-edge-label").map((el) => el.textContent.trim());
    const ownerLabel = edgeLabels.find((label) => label.includes("Owner")) ?? "";
    h.assert(
      ownerLabel.includes("Owner") && ownerLabel.includes("Role") && ownerLabel.includes("Lead"),
      `Owner edge label mentions role (got "${ownerLabel}")`,
    );
  },

  async navigate(h) {
    await h.open("p-alpha");
    const taskOne = h.qa('.compass-node[data-zone="south"]').find((el) => el.textContent.includes("Task One"));
    h.assert(Boolean(taskOne), "Task One node exists on Project Alpha");
    h.click(taskOne);
    await h.wait(550);
    h.equal(h.text(".compass-node-center .compass-node-title"), "Task One", "Task One becomes the center");
    const northTitles = h.qa('.compass-node[data-zone="north"] .compass-node-title').map((el) => el.textContent.trim());
    h.assert(northTitles.includes("Project Alpha"), "Project Alpha sits north of Task One");
    h.key("ArrowLeft", { altKey: true });
    await h.wait(500);
    h.equal(h.text(".compass-node-center .compass-node-title"), "Project Alpha", "Alt+Left returns to Project Alpha");
  },

  async outline(h) {
    await h.open("p-alpha");
    h.click(".compass-outline");
    await h.wait(400);
    h.assert(h.count(".compass-row") > 0, "Outline button expands .compass-row elements");
    h.click(".compass-outline");
    await h.wait(400);
    h.equal(h.count(".compass-row"), 0, "second Outline click collapses .compass-row elements");
  },

  async search(h) {
    await h.open("p-alpha");
    h.type(".compass-search", "task");
    await h.wait(120);
    const items = h.qa(".compass-results:not([hidden]) .compass-result");
    h.assert(items.length >= 3, `search for "task" shows at least 3 results (got ${items.length})`);
    const firstTitle = items[0]?.textContent?.trim() ?? "";
    if (items[0]) h.click(items[0]);
    await h.wait(350);
    h.equal(h.text(".compass-node-center .compass-node-title"), firstTitle, "choosing first search result focuses it");
  },

  async menu(h) {
    await h.open("p-alpha");
    const southNode = h.q('.compass-node[data-zone="south"]');
    h.assert(Boolean(southNode), "south node exists");
    h.contextmenu(southNode);
    await h.wait(50);
    const items = h.qa(".compass-menu:not([hidden]) .compass-menu-item").map((el) => el.textContent.trim());
    h.assert(items.includes("Focus here"), "context menu contains Focus here");
    h.assert(items.includes("Why is this here?"), "context menu contains Why is this here?");
  },
};
