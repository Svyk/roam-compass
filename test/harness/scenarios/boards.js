function installDiagram(spec = {}) {
  const calls = [];
  const listeners = { change: new Set(), mount: new Set(), unmount: new Set() };
  const caps = Array.isArray(spec.capabilities) ? spec.capabilities : [];
  let made = 0;
  const api = {
    apiVersion: 1,
    capabilities: Object.freeze([...caps]),
    boardsWith(uid) {
      calls.push(["boardsWith", uid]);
      return spec.boardsWith ? spec.boardsWith(uid) : [];
    },
    boardsOn(uid) {
      calls.push(["boardsOn", uid]);
      return spec.boardsOn ? spec.boardsOn(uid) : [];
    },
    cardsOf(uid) {
      calls.push(["cardsOf", uid]);
      return spec.cardsOf ? spec.cardsOf(uid) : [];
    },
    viewsOf(uid) {
      calls.push(["viewsOf", uid]);
      return spec.viewsOf ? spec.viewsOf(uid) : [];
    },
    open(uid, opts) {
      calls.push(["open", uid, opts]);
      return Promise.resolve();
    },
    addCard(uid, body) {
      made += 1;
      calls.push(["addCard", uid, body]);
      return Promise.resolve({ uid: `made-${made}` });
    },
    addEventListener(type, fn) {
      listeners[type]?.add(fn);
    },
    removeEventListener(type, fn) {
      listeners[type]?.delete(fn);
    },
  };
  if (caps.includes("listBoards")) {
    api.listBoards = () => {
      calls.push(["listBoards"]);
      return spec.list ?? [];
    };
  }
  if (caps.includes("addSection")) {
    api.addSection = (uid, body) => {
      calls.push(["addSection", uid, body]);
      return Promise.resolve({
        uid: "section-1",
        rect: { x: 80, y: 400, w: body?.w, h: body?.h },
      });
    };
  }
  if (caps.includes("addCards")) {
    api.addCards = (uid, cards, opts) => {
      calls.push(["addCards", uid, cards, opts]);
      return Promise.resolve({
        added: (cards ?? []).map((card, index) => ({ uid: `added-${index}`, text: card.text })),
        count: cards?.length ?? 0,
      });
    };
  }
  if (caps.includes("connect")) {
    api.connect = (uid, edges) => {
      calls.push(["connect", uid, edges]);
      return Promise.resolve({ uids: ["edge-1"] });
    };
  }
  window.PlexusDiagram = api;
  window.dispatchEvent(new Event("plexus-diagram:ready"));
  return {
    calls,
    emit(type, detail) {
      for (const fn of listeners[type] ?? []) fn(detail);
    },
  };
}

function itemByText(h, text) {
  const found = h.qa(".compass-menu-item").find((el) => (el.textContent || "").trim() === text);
  if (!found) throw new Error(`Menu item not found: ${text}`);
  return found;
}

function boardNodes(h) {
  return h.qa('.compass-node[data-style="board"]');
}

function drawnCards(h) {
  return h.qa(".compass-node:not(.compass-fade)").filter((el) => {
    const style = el.dataset.style;
    return style !== "board" && style !== "card" && style !== "group";
  });
}

const DASH = "\u2014";

export const SCENARIOS = {
  async "boards-live"(h) {
    const boards = [{ uid: "board-plan", title: "Planning" }];
    const diagram = installDiagram({
      boardsWith: () => boards.map((board) => ({ ...board })),
    });
    await h.open("p-alpha");
    h.assert(
      boardNodes(h).some((el) => (el.getAttribute("aria-label") || "").includes("Planning")),
      "the first board is drawn",
    );
    boards.push({ uid: "board-arch", title: "Archive" });
    diagram.emit("change", { boardUid: "board-arch" });
    await h.wait(800);
    const labels = boardNodes(h).map((el) => el.getAttribute("aria-label") || "");
    h.assert(labels.some((label) => label.includes("Archive")), "the second board appears after change");
    h.assert(labels.some((label) => label.includes("Planning")), "the first board stays");
  },

  async "boards-on-page"(h) {
    installDiagram({
      boardsWith: () => [
        { uid: "board-hold", title: "Holding" },
        { uid: "board-both", title: "Both" },
      ],
      boardsOn: (uid) => (uid === "p-alpha" ? [
        { uid: "board-page", title: "Page Board" },
        { uid: "board-both", title: "Both" },
      ] : []),
    });
    await h.open("p-alpha");
    const nodes = boardNodes(h);
    const labels = nodes.map((el) => el.getAttribute("aria-label") || el.title || "");
    h.assert(
      labels.some((label) => label.includes("Page Board") && label.includes("Board on this page")),
      "a board on this page is labelled",
    );
    const both = nodes.filter((el) => el.dataset.uid === "board-both");
    h.equal(both.length, 1, "a board in both lists is drawn once");
    const bothLabel = both[0]?.getAttribute("aria-label") || "";
    h.assert(bothLabel.includes("On board"), "the shared board keeps On board");
    h.assert(!bothLabel.includes("Board on this page"), "the shared board is not labelled as on the page");
  },

  async "board-views"(h) {
    const diagram = installDiagram({
      boardsWith: (uid) => (uid === "p-alpha" ? [{ uid: "board-v", title: "Views Board" }] : []),
      viewsOf: (uid) => (uid === "board-v" ? [
        { uid: "view-1", caption: "Wide" },
        { uid: "view-2", caption: "" },
      ] : []),
    });
    await h.open("p-alpha");
    const node = boardNodes(h).find((el) => el.dataset.uid === "board-v");
    h.assert(node, "the board node is drawn");
    h.contextmenu(node);
    h.assert(h.qa(".compass-menu-item").some((el) => el.textContent.trim() === "View: Wide"), "captioned view");
    h.assert(h.qa(".compass-menu-item").some((el) => el.textContent.trim() === "View"), "empty caption");
    h.click(itemByText(h, "View: Wide"));
    await h.wait(40);
    const opened = diagram.calls.filter((call) => call[0] === "open");
    h.equal(opened.at(-1)?.[1], "board-v", "open receives the board");
    h.equal(opened.at(-1)?.[2]?.view, "view-1", "open receives the view");
  },

  async "add-to-board"(h) {
    const diagram = installDiagram({
      boardsWith: (uid) => {
        if (uid === "p-alpha") return [
          { uid: "board-plan", title: "Planning" },
          { uid: "board-arch", title: "Archive" },
        ];
        if (uid === "p-task-1") return [{ uid: "board-notes", title: "Notes" }];
        return [];
      },
      boardsOn: (uid) => (uid === "p-alpha" ? [{ uid: "board-page", title: "On the page" }] : []),
      cardsOf: (uid) => (uid === "board-plan" ? [
        { uid: "c1", rect: { x: 10, y: 20, w: 200, h: 100 } },
        { uid: "c2", rect: { x: 40, y: 200, w: 180, h: 90 } },
      ] : []),
    });
    await h.open("p-alpha");
    const task = h.qa(".compass-node").find((el) => el.dataset.uid === "p-task-1");
    h.assert(task, "Task One is drawn");
    h.contextmenu(task);
    h.click(itemByText(h, "Add to board…"));
    h.click(itemByText(h, "Planning"));
    await h.wait(40);
    const added = diagram.calls.filter((call) => call[0] === "addCard");
    h.equal(added.length, 1, "one card is added");
    h.equal(added[0][1], "board-plan", "the chosen board");
    h.equal(added[0][2].ref, "[[Task One]]", "page ref");
    h.equal(added[0][2].at.x, 10, "left edge of the content");
    h.equal(added[0][2].at.y, 330, "below the lowest card");
    h.assert(h.status().includes("Added to"), `status says added (${h.status()})`);
    h.contextmenu(task);
    h.click(itemByText(h, "Add to board…"));
    const labels = h.qa(".compass-menu-item").map((el) => el.textContent.trim());
    h.assert(labels.includes("Notes (already on it)"), "held board is marked");
    h.assert(labels.includes("Archive"), "archive is offered");
    h.assert(labels.includes("On the page"), "board on the page is offered");
    h.noOverlap(".compass-menu .compass-menu-item");
  },

  async "send-to-board"(h) {
    const diagram = installDiagram({
      capabilities: ["listBoards", "addSection", "addCards", "connect"],
      boardsWith: () => [],
      list: [
        { uid: "board-plan", title: "Planning", pageTitle: "Project Alpha", pageUid: "p-alpha" },
        { uid: "board-arch", title: "Archive", pageTitle: "Other", pageUid: "p-other" },
      ],
    });
    await h.open("p-alpha");
    const drawn = drawnCards(h);
    h.click(".compass-more");
    h.click('[data-command="send-to-board"]');
    h.click(itemByText(h, `Planning ${DASH} Project Alpha`));
    const summary = h.text(".compass-board-summary");
    h.assert(summary.includes(`Project Alpha ${DASH} Compass`), "section title is in the dialog");
    h.assert(summary.includes("labelled by relation"), "arrows are described");
    h.click(".compass-board-send");
    await h.wait(80);
    const sections = diagram.calls.filter((call) => call[0] === "addSection");
    const batches = diagram.calls.filter((call) => call[0] === "addCards");
    const links = diagram.calls.filter((call) => call[0] === "connect");
    h.equal(sections.length, 1, "one section");
    h.equal(sections[0][2].title, `Project Alpha ${DASH} Compass`, "section title");
    h.equal("x" in sections[0][2], false, "section has no x");
    h.equal("y" in sections[0][2], false, "section has no y");
    h.equal(batches.length, 1, "one addCards");
    h.equal(batches[0][3].section, "section-1", "cards go into the section");
    h.assert(batches[0][2].length === drawn.length, `cards ${batches[0][2].length} drawn ${drawn.length}`);
    h.assert(batches[0][2].length <= 45, "at most 45 cards");
    h.assert(batches[0][2].some((card) => card.text === "[[Project Alpha]]"), "center card");
    const spots = batches[0][2].map((card) => `${card.x},${card.y}`);
    h.equal(new Set(spots).size, spots.length, "no shared positions");
    h.equal(links.length, 1, "one connect");
    const edges = Array.isArray(links[0][2]) ? links[0][2] : [links[0][2]];
    h.assert(edges.some((edge) => String(edge.label).includes("Owner \u00b7 Role: Lead")), "Jane's relation is labelled");
    h.click(".compass-board-open");
    await h.wait(40);
    const opened = diagram.calls.filter((call) => call[0] === "open");
    h.equal(opened.at(-1)?.[1], "board-plan", "open board");
    h.equal(opened.at(-1)?.[2]?.card, "added-0", "center card is pulsed");
    h.click(".compass-more");
    h.click('[data-command="send-to-board"]');
    h.click(itemByText(h, `Planning ${DASH} Project Alpha`));
    h.assert(h.q(".compass-board-dialog"), "confirm dialog stays open");
    h.equal(diagram.calls.filter((call) => call[0] === "addSection").length, 1, "the dialog was not sent again");
    h.noOverlap(".compass-board-dialog button");
  },

  async "send-to-board-basic"(h) {
    const diagram = installDiagram({
      boardsWith: (uid) => (uid === "p-alpha" ? [{ uid: "board-plan", title: "Planning" }] : []),
      cardsOf: () => [{ uid: "c1", rect: { x: 10, y: 20, w: 200, h: 80 } }],
    });
    await h.open("p-alpha");
    const drawn = drawnCards(h);
    h.contextmenu(".compass-stage", { clientX: 24, clientY: 280 });
    h.click(itemByText(h, "Send map to board…"));
    h.click(itemByText(h, "Planning"));
    const summary = h.text(".compass-board-summary");
    h.assert(summary.includes("Each card is its own undo step."), "basic mode names undo steps");
    h.assert(!h.q(".compass-board-arrows"), "no arrow checkbox without connect");
    h.click(".compass-board-send");
    await h.wait(120);
    const added = diagram.calls.filter((call) => call[0] === "addCard");
    h.equal(added.length, drawn.length, "one addCard per card");
    h.equal(diagram.calls.filter((call) => call[0] === "addSection").length, 0, "no section");
    h.equal(diagram.calls.filter((call) => call[0] === "connect").length, 0, "no arrows");
    h.assert(added.some((call) => call[2].ref === "[[Project Alpha]]"), "center ref");
    const spots = added.map((call) => `${call[2].at.x},${call[2].at.y}`);
    h.equal(new Set(spots).size, spots.length, "basic cards do not share a position");
    h.assert(h.status().includes("Sent"), `status says sent (${h.status()})`);
  },
};
