import assert from "node:assert/strict";
import test from "node:test";

import { boardPlan, cardPlan, connectionLabel, isBoardLike, openArgs, showBoardPlan } from "../src/model/boards.js";

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

test("openArgs keeps the board uid distinct from the card", () => {
  const opened = openArgs("board-1", "card-9", true);
  assert.deepEqual(opened, { boardUid: "board-1", card: "card-9", sidebar: true });
  assert.notEqual(opened.boardUid, opened.card);
  assert.deepEqual(openArgs("board-1", "card-9", false), { boardUid: "board-1", card: "card-9", sidebar: false });
  assert.deepEqual(openArgs("board-1", "card-9"), { boardUid: "board-1", card: "card-9", sidebar: false });
  assert.deepEqual(openArgs("board-1", "card-9", "true"), { boardUid: "board-1", card: "card-9", sidebar: false });
});
