import assert from "node:assert/strict";
import test from "node:test";

import {
  apiHas,
  boardPlan,
  cardPlan,
  connectionLabel,
  filterBoards,
  isBoardLike,
  needsBoardFilter,
  openArgs,
  pickerBoards,
  savedViews,
  showBoardPlan,
} from "../src/model/boards.js";

test("isBoardLike is a diagram macro", () => {
  assert.equal(isBoardLike("{{[[diagram]]}}"), true);
  assert.equal(isBoardLike("  {{[[diagram]]: Notes}}"), true);
  assert.equal(isBoardLike("{{diagram}}"), true);
  assert.equal(isBoardLike("{{diagram: Sketch}}"), true);
  assert.equal(isBoardLike("{{[[TODO]]}} call {{diagram}}"), false);
  assert.equal(isBoardLike("not a board"), false);
  assert.equal(isBoardLike(""), false);
  assert.equal(isBoardLike(null), false);
});

test("boardPlan maps a stub PlexusDiagram boardsWith to west nodes", () => {
  const PlexusDiagram = {
    boardsWith(centerUid) {
      assert.equal(centerUid, "page");
      return [
        { uid: "b1", title: "One", extra: 1 },
        { uid: "b2", title: "Two" },
      ];
    },
  };
  assert.deepEqual(boardPlan(PlexusDiagram, "page"), [
    { uid: "b1", title: "One", role: "west", label: "On board" },
    { uid: "b2", title: "Two", role: "west", label: "On board" },
  ]);
});

test("boardPlan returns [] when the API is missing or boardsWith throws", () => {
  assert.deepEqual(boardPlan(null, "page"), []);
  assert.deepEqual(boardPlan(undefined, "page"), []);
  assert.deepEqual(boardPlan({}, "page"), []);
  assert.deepEqual(boardPlan({ boardsWith: "nope" }, "page"), []);
  assert.deepEqual(boardPlan({
    boardsWith() {
      throw new Error("unloaded");
    },
  }, "page"), []);
});

test("cardPlan maps cardsOf to south nodes and slices to cap", () => {
  const PlexusDiagram = {
    cardsOf(boardUid) {
      assert.equal(boardUid, "board");
      return [
        { uid: "c1", title: "A" },
        { uid: "c2", title: "B" },
        { uid: "c3", title: "C" },
      ];
    },
  };
  assert.deepEqual(cardPlan(PlexusDiagram, "board", 2), [
    { uid: "c1", title: "A", role: "south" },
    { uid: "c2", title: "B", role: "south" },
  ]);
  assert.equal(cardPlan(PlexusDiagram, "board", 2).length, 2);
});

test("cardPlan returns [] when the API is missing or cardsOf throws", () => {
  assert.deepEqual(cardPlan(null, "board", 4), []);
  assert.deepEqual(cardPlan(undefined, "board", 4), []);
  assert.deepEqual(cardPlan({}, "board", 4), []);
  assert.deepEqual(cardPlan({
    cardsOf() {
      throw new Error("unloaded");
    },
  }, "board", 4), []);
});

test("connectionLabel is the text between Plexus arrows", () => {
  assert.equal(connectionLabel("((a)) → annotates → ((b))"), "annotates");
  assert.equal(connectionLabel("[[A]] → lead → [[B]]"), "lead");
  assert.equal(connectionLabel("[[A]] ↔ both ↔ [[B]]"), "both");
  assert.equal(connectionLabel("[[A]] — causes — [[B]]"), "causes");
  assert.equal(connectionLabel("[[A]] → [[B]]"), "");
  assert.equal(connectionLabel("no arrow here"), "");
  assert.equal(connectionLabel(""), "");
  assert.equal(connectionLabel(null), "");
});

test("showBoardPlan is none when boards are empty or missing", () => {
  assert.deepEqual(showBoardPlan(), { mode: "none" });
  assert.deepEqual(showBoardPlan(undefined), { mode: "none" });
  assert.deepEqual(showBoardPlan(null), { mode: "none" });
  assert.deepEqual(showBoardPlan([]), { mode: "none" });
  assert.deepEqual(showBoardPlan({}), { mode: "none" });
});

test("showBoardPlan opens one board and keeps its card", () => {
  const board = { uid: "board-1", title: "One", page: "page-uid", card: "card-9" };
  const plan = showBoardPlan([board]);
  assert.deepEqual(plan, { mode: "open", board });
  assert.equal(plan.board, board);
  assert.equal(plan.board.card, "card-9");
  assert.notEqual(plan.board.card, plan.board.page);
});

test("showBoardPlan returns a picker when there is more than one board", () => {
  const boards = [
    { uid: "b1", title: "One", page: "page-uid", card: "card-9" },
    { uid: "b2", title: "Two", page: "page-uid", card: "card-9" },
    { uid: "b3", title: "Three", page: "page-uid", card: "card-8" },
  ];
  const plan = showBoardPlan(boards);
  assert.deepEqual(plan, { mode: "picker", boards });
  assert.equal(plan.boards, boards);
  assert.equal(plan.boards.every((board) => board.card !== board.page), true);
});

test("boardPlan adds boards on the page after boards that hold the page", () => {
  const api = {
    boardsWith() {
      return [{ uid: "b1", title: "Held" }, { uid: "b2", title: "Only held" }];
    },
    boardsOn() {
      return [{ uid: "b1", title: "Held" }, { uid: "b3", title: "Page board" }];
    },
  };
  assert.deepEqual(boardPlan(api, "page"), [
    { uid: "b1", title: "Held", role: "west", label: "On board" },
    { uid: "b2", title: "Only held", role: "west", label: "On board" },
    { uid: "b3", title: "Page board", role: "west", label: "Board on this page" },
  ]);
});

test("boardPlan does not call boardsOn when boardsWith throws", () => {
  let called = false;
  const api = {
    boardsWith() {
      throw new Error("unloaded");
    },
    boardsOn() {
      called = true;
      return [{ uid: "b3", title: "Page board" }];
    },
  };
  assert.deepEqual(boardPlan(api, "page"), []);
  assert.equal(called, false);
});

test("boardPlan keeps boardsWith when boardsOn throws", () => {
  const api = {
    boardsWith() {
      return [{ uid: "b1", title: "Held" }];
    },
    boardsOn() {
      throw new Error("unloaded");
    },
  };
  assert.deepEqual(boardPlan(api, "page"), [
    { uid: "b1", title: "Held", role: "west", label: "On board" },
  ]);
});

test("apiHas requires a function and a listed capability", () => {
  assert.equal(apiHas({ listBoards() {}, capabilities: ["listBoards"] }, "listBoards"), true);
  assert.equal(apiHas({ listBoards() {}, capabilities: [] }, "listBoards"), false);
  assert.equal(apiHas({ capabilities: ["listBoards"] }, "listBoards"), false);
  assert.equal(apiHas(null, "listBoards"), false);
});

test("needsBoardFilter is true from 13 boards", () => {
  assert.equal(needsBoardFilter(12), false);
  assert.equal(needsBoardFilter(13), true);
});

test("pickerBoards uses listBoards labels, order, and held boards", () => {
  const api = {
    capabilities: ["listBoards"],
    listBoards() {
      return [
        { uid: "b2", title: "Planning", pageTitle: "Project Alpha" },
        { uid: "b1", title: "Archive", pageTitle: "Other" },
        { uid: "b2", title: "Planning", pageTitle: "Duplicate" },
        { uid: "b3", title: "Notes" },
      ];
    },
    boardsWith(uid) {
      assert.equal(uid, "node");
      return [{ uid: "b1", title: "Archive" }];
    },
  };
  assert.deepEqual(pickerBoards(api, { centerUid: "page", nodeUid: "node" }), [
    { uid: "b1", title: "Archive", pageTitle: "Other", label: "Archive \u2014 Other", already: true },
    { uid: "b3", title: "Notes", pageTitle: "", label: "Notes", already: false },
    { uid: "b2", title: "Planning", pageTitle: "Project Alpha", label: "Planning \u2014 Project Alpha", already: false },
  ]);
});

test("pickerBoards falls back when listBoards is not a capability", () => {
  let listed = false;
  const api = {
    capabilities: [],
    listBoards() {
      listed = true;
      return [{ uid: "nope", title: "Nope", pageTitle: "X" }];
    },
    boardsWith(uid) {
      if (uid === "page") return [{ uid: "b2", title: "Planning" }];
      if (uid === "node") return [{ uid: "b2", title: "Planning" }, { uid: "b1", title: "Notes" }];
      return [];
    },
    boardsOn() {
      return [{ uid: "b3", title: "On the page" }];
    },
  };
  assert.deepEqual(pickerBoards(api, { centerUid: "page", nodeUid: "node" }), [
    { uid: "b1", title: "Notes", pageTitle: "", label: "Notes", already: true },
    { uid: "b3", title: "On the page", pageTitle: "", label: "On the page", already: false },
    { uid: "b2", title: "Planning", pageTitle: "", label: "Planning", already: true },
  ]);
  assert.equal(listed, false);
});

test("pickerBoards can skip the already-on-it mark", () => {
  const api = {
    boardsWith() {
      return [{ uid: "b1", title: "Notes" }];
    },
  };
  const [board] = pickerBoards(api, { centerUid: "page", nodeUid: "page", markHeld: false });
  assert.equal(board.already, false);
});

test("filterBoards matches label or title", () => {
  const boards = [
    { uid: "b1", title: "Planning", label: "Planning \u2014 Alpha" },
    { uid: "b2", title: "Archive", label: "Archive" },
  ];
  assert.deepEqual(filterBoards(boards, " alpha ").map((board) => board.uid), ["b1"]);
  assert.deepEqual(filterBoards(boards, "").map((board) => board.uid), ["b1", "b2"]);
  assert.notEqual(filterBoards(boards, ""), boards);
});

test("savedViews keeps eight titled views and skips blank uids", () => {
  const rows = [
    { caption: "skip" },
    { uid: "v0", caption: "Wide" },
    { uid: "v1", caption: "  " },
  ];
  for (let i = 2; i < 10; i += 1) rows.push({ uid: `v${i}`, caption: `C${i}` });
  const views = savedViews({ viewsOf: () => rows }, "board");
  assert.equal(views.length, 8);
  assert.deepEqual(views[0], { uid: "v0", title: "View: Wide" });
  assert.deepEqual(views[1], { uid: "v1", title: "View" });
  assert.equal(views.some((view) => view.uid === "v9"), false);
  assert.deepEqual(savedViews({ viewsOf() { throw new Error("nope"); } }, "board"), []);
});

test("openArgs keeps the board uid distinct from the card", () => {
  const opened = openArgs("board-1", "card-9", true);
  assert.deepEqual(opened, { boardUid: "board-1", card: "card-9", sidebar: true });
  assert.notEqual(opened.boardUid, opened.card);
  assert.deepEqual(openArgs("board-1", "card-9", false), { boardUid: "board-1", card: "card-9", sidebar: false });
  assert.deepEqual(openArgs("board-1", "card-9"), { boardUid: "board-1", card: "card-9", sidebar: false });
  assert.deepEqual(openArgs("board-1", "card-9", "true"), { boardUid: "board-1", card: "card-9", sidebar: false });
});
