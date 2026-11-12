import assert from "node:assert/strict";
import test from "node:test";

import {
  addFailure,
  BASIC_LIMIT,
  cardText,
  cardsAt,
  centerCardUid,
  connectPayload,
  edgesForAdded,
  placeBelow,
  SEND_LIMIT,
  sendPlan,
  sendSummary,
} from "../src/model/board-send.js";

test("cardText writes a page ref or a block ref", () => {
  assert.equal(cardText({ kind: "page", title: "Task One" }), "[[Task One]]");
  assert.equal(cardText({ kind: "page", title: "A [b]" }), "");
  assert.equal(cardText({ kind: "page", title: "   " }), "");
  assert.equal(cardText({ kind: "block", uid: "block-1" }), "((block-1))");
  assert.equal(cardText({ kind: "block", uid: "bad)" }), "");
  assert.equal(cardText(null), "");
});

test("placeBelow sits under the lowest card, or at the empty origin", () => {
  assert.deepEqual(placeBelow([
    { rect: { x: 10, y: 20, w: 200, h: 100 } },
    { rect: { x: 40, y: 200, w: 180, h: 90 } },
  ]), { x: 10, y: 330 });
  assert.deepEqual(placeBelow([]), { x: 40, y: 40 });
  assert.deepEqual(placeBelow([{ rect: { x: "nope", y: 1 } }]), { x: 40, y: 40 });
});

test("addFailure names a missing board and hides other failures", () => {
  assert.equal(addFailure(new Error("Not a board")), "That board could not be found.");
  assert.equal(addFailure("Bad ref"), "Plexus Diagram could not add the card.");
});

test("sendSummary describes the section, arrows, leftovers, and basic undo", () => {
  assert.equal(
    sendSummary({
      count: 2,
      boardLabel: "Planning",
      sectionTitle: "Project Alpha \u2014 Compass",
      arrows: 1,
      omitted: 3,
    }),
    'Adds 2 cards to Planning in a new section "Project Alpha \u2014 Compass", with 1 arrow labelled by relation. 3 cards were left out.',
  );
  assert.equal(
    sendSummary({ count: 1, boardLabel: "Planning", basic: true }),
    "Adds 1 card to Planning. Each card is its own undo step.",
  );
});

test("sendPlan keeps sides, slots, and relation direction", () => {
  const center = { uid: "c", title: "Center", kind: "page" };
  const parent = { uid: "p", title: "Parent", kind: "page", zone: "north", evidence: [{ kind: "structural", role: "parent" }] };
  const child = { uid: "k", title: "Child", kind: "page", zone: "south", evidence: [{ kind: "structural", role: "child" }] };
  const friend = {
    uid: "f",
    title: "Friend",
    kind: "page",
    zone: "west",
    label: "Owner \u00b7 Role: Lead",
    evidence: [{ kind: "typed", direction: "out", role: "friend" }],
  };
  const challenger = { uid: "e", title: "Challenger", kind: "page", zone: "east", evidence: [{ kind: "link" }] };
  const sibling = { uid: "s", title: "Sibling", kind: "page", zone: "siblings", evidence: [{ kind: "sibling", role: "sibling" }] };
  const mention = { uid: "m", title: "Mention", kind: "page", zone: "south", evidence: [{ kind: "mention" }] };
  const geometry = {
    center: { x: 0, y: 0 },
    items: [
      { uid: "p", x: 0, y: -200 },
      { uid: "k", x: 10, y: 200 },
      { uid: "f", x: -220, y: 0 },
      { uid: "e", x: 220, y: 0 },
      { uid: "s", x: 500, y: 20 },
      { uid: "m", x: 40, y: 240 },
    ],
  };
  const plan = sendPlan({ center, nodes: [sibling, mention, challenger, friend, child, parent], geometry });
  const at = Object.fromEntries(plan.cards.map((card) => [card.uid, card]));
  assert.equal(plan.sectionTitle, "Center \u2014 Compass");
  assert.equal(plan.omitted, 0);
  assert.ok(at.p.y < at.c.y);
  assert.ok(at.k.y > at.c.y);
  assert.ok(at.m.y > at.k.y);
  assert.ok(at.f.x < at.c.x);
  assert.ok(at.e.x > at.c.x);
  assert.ok(at.s.x > at.e.x);
  const slots = new Set(plan.cards.map((card) => `${card.x},${card.y}`));
  assert.equal(slots.size, plan.cards.length);
  assert.equal(at.f.x, 24);
  assert.equal(at.c.x - at.f.x, 300);
  assert.equal(at.k.y - at.c.y, 180);
  assert.equal(plan.width, 48 + 4 * 300);
  assert.equal(plan.height, 48 + 60 + 4 * 180);
  const edge = Object.fromEntries(plan.edges.map((item) => [item.toUid === "c" ? item.fromUid : item.toUid, item]));
  assert.deepEqual(edge.f, { fromUid: "c", toUid: "f", label: "Owner \u00b7 Role: Lead", direction: "one" });
  assert.deepEqual(edge.e, { fromUid: "c", toUid: "e", label: "", direction: "one" });
  assert.deepEqual(edge.m, { fromUid: "m", toUid: "c", label: "", direction: "one" });
  assert.equal(edge.p.fromUid, "p");
  assert.equal(edge.k.fromUid, "c");
  assert.equal(plan.edges.some((item) => item.fromUid === "s" || item.toUid === "s"), false);
});

test("sendPlan keeps the nearest cards and drops refs that cannot be written", () => {
  const center = { uid: "c", title: "Center", kind: "page" };
  const near = { uid: "n", title: "Near", kind: "page", zone: "south" };
  const far = { uid: "far", title: "Far", kind: "page", zone: "south" };
  const bad = { uid: "bad", title: "A [b]", kind: "page", zone: "south" };
  const board = { uid: "board", title: "Board", kind: "page", style: "board", zone: "west" };
  const plan = sendPlan({
    center,
    nodes: [far, bad, board, near],
    geometry: {
      center: { x: 0, y: 0 },
      items: [
        { uid: "n", x: 0, y: 10 },
        { uid: "far", x: 0, y: 400 },
        { uid: "bad", x: 0, y: 5 },
      ],
    },
    limit: 2,
  });
  assert.deepEqual(plan.cards.map((card) => card.uid), ["c", "n"]);
  assert.equal(plan.omitted, 1);
  assert.equal(plan.cards.some((card) => card.uid === "bad" || card.uid === "board"), false);
  assert.equal(SEND_LIMIT, 45);
  assert.equal(BASIC_LIMIT, 20);
});

test("send helpers place cards, map edges, and find the center card", () => {
  const plan = {
    cards: [
      { uid: "c", text: "[[Center]]", x: 24, y: 84 },
      { uid: "n", text: "[[Near]]", x: 24, y: 264 },
    ],
    edges: [{ fromUid: "c", toUid: "n", label: "Child", direction: "one" }],
  };
  assert.deepEqual(cardsAt(plan.cards, { x: 80, y: 400 }), [
    { text: "[[Center]]", x: 104, y: 484 },
    { text: "[[Near]]", x: 104, y: 664 },
  ]);
  const added = [{ uid: "card-c" }, { uid: "card-n" }];
  assert.deepEqual(edgesForAdded(plan, added), [
    { from: "card-c", to: "card-n", label: "Child", direction: "one" },
  ]);
  assert.equal(centerCardUid(plan, added, "c"), "card-c");
  assert.equal(connectPayload([]), null);
  assert.deepEqual(connectPayload([{ from: "a", to: "b", label: "", direction: "one" }]).from, "a");
  assert.equal(connectPayload(Array.from({ length: 50 }, (_, index) => ({ from: String(index) }))).length, 45);
});
