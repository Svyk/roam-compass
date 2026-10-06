// ECO-5 wire. Board nodes and card nodes come from the Plexus API the overlay passes in.
import assert from "node:assert/strict";
import test from "node:test";

import { connectionEdges } from "../src/model/boards.js";
import { buildNeighborhood } from "../src/model/neighborhood.js";
import { DEFAULTS, SETTING_IDS, readCompassSettings } from "../src/settings.js";

const center = { center: { uid: "page1", kind: "page", title: "Page" } };

test("boards default on and sit beside drawings in the setting list", () => {
  assert.equal(SETTING_IDS.boards, "compass-boards");
  assert.equal(DEFAULTS["compass-boards"], true);
  const read = readCompassSettings({ settings: { get() { return null; } } });
  assert.equal(read.boards, true);
});

test("a missing board list adds nothing and does not throw", () => {
  const hood = buildNeighborhood(center, {}, {});
  assert.equal(hood.nodes.some((node) => node.style === "board"), false);
});

test("board nodes stay west and labelled On board", () => {
  const hood = buildNeighborhood(center, { maxPerZone: 12 }, {
    boards: [{ uid: "b1", title: "One", label: "On board" }, { uid: "b2", title: "Two", label: "On board" }],
  });
  const boards = hood.nodes.filter((node) => node.style === "board");
  assert.equal(boards.length, 2);
  assert.equal(boards.every((node) => node.zone === "west" && node.label === "On board"), true);
});

test("card nodes are capped on their own and keep a south place", () => {
  const cards = Array.from({ length: 5 }, (_, i) => ({ uid: `c${i}`, title: `Card ${i}` }));
  const hood = buildNeighborhood(center, { maxPerZone: 2 }, { cards });
  const shown = hood.nodes.filter((node) => node.style === "card");
  assert.equal(shown.length, 2);
  assert.equal(shown.every((node) => node.zone === "south"), true);
});

test("a card already linked on the page becomes a card node", () => {
  const hood = buildNeighborhood({
    center: { uid: "page1", kind: "page", title: "Page" },
    outline: [{
      uid: "edge",
      string: "((cardA)) → annotates → ((cardB))",
      refs: [
        { uid: "cardA", string: "[[Page]]" },
        { uid: "cardB", string: "Second card" },
      ],
      children: [],
    }],
  }, { maxPerZone: 12 }, {
    cards: [{ uid: "cardA", title: "Page" }, { uid: "cardB", title: "Second card" }],
  });
  const cards = hood.nodes.filter((node) => node.style === "card");
  assert.deepEqual(cards.map((node) => node.uid).sort(), ["cardA", "cardB"]);
  assert.equal(cards.every((node) => node.zone === "south"), true);
  assert.equal(hood.nodes.filter((node) => node.uid === "cardA").length, 1);
});

test("connection children become one labelled edge", () => {
  const edges = connectionEdges([
    { string: "((cardA)) → annotates → ((cardB))" },
    { ":block/string": "((cardA)) → annotates → ((cardB))" },
    { string: "plain" },
  ]);
  assert.deepEqual(edges, [
    { from: "cardA", to: "cardB", label: "annotates" },
    { from: "cardA", to: "cardB", label: "annotates" },
  ]);
});

test("page refs, block refs, and a mix become edges; one end does not", () => {
  const edges = connectionEdges([
    { string: "[[Page A]] → cites → [[Page B]]" },
    { string: "((cardA)) → annotates → ((cardB))" },
    { string: "[[Page A]] → cites → ((cardB))" },
    { string: "((cardA)) → annotates → [[Page B]]" },
    { string: "[[Page A]] → leftover" },
    { string: "((only))" },
    { string: "[[Page A]]" },
    "[[Only]] → nowhere",
  ]);
  assert.deepEqual(edges, [
    { from: "Page A", to: "Page B", label: "cites" },
    { from: "cardA", to: "cardB", label: "annotates" },
    { from: "Page A", to: "cardB", label: "cites" },
    { from: "cardA", to: "Page B", label: "annotates" },
  ]);
});
