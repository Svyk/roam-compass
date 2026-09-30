import assert from "node:assert/strict";
import test from "node:test";

import { rankDrawings } from "../src/model/related.js";

function row(uid, refs, editTime, title = uid) {
  return { uid, refs, editTime, title };
}

test("higher overlap ranks first", () => {
  const centre = ["a", "b", "c"];
  const one = row("one", ["a"], 300, "One");
  const three = row("three", ["a", "b", "c"], 100, "Three");
  const none = row("none", ["z"], 999, "None");
  const two = row("two", ["b", "c"], 200, "Two");
  assert.deepEqual(rankDrawings(centre, [one, three, none, two]), [three, two, one]);
});

test("equal overlap prefers the newer editTime", () => {
  const centre = ["a", "b"];
  const old = row("old", ["a"], 10, "Old");
  const newer = row("new", ["b"], 50, "New");
  const mid = row("mid", ["a", "x"], 30, "Mid");
  assert.deepEqual(rankDrawings(centre, [old, newer, mid]), [newer, mid, old]);
});

test("caps at 50", () => {
  const centre = ["a"];
  const rows = Array.from({ length: 60 }, (_, index) => row(`u${index}`, ["a"], index));
  const ranked = rankDrawings(centre, rows);
  assert.equal(ranked.length, 50);
  assert.equal(ranked[0].uid, "u59");
  assert.equal(ranked[49].uid, "u10");
});

test("empty inputs return []", () => {
  assert.deepEqual(rankDrawings([], []), []);
  assert.deepEqual(rankDrawings(null, null), []);
  assert.deepEqual(rankDrawings(undefined, undefined), []);
  assert.deepEqual(rankDrawings(["a"], []), []);
  assert.deepEqual(rankDrawings([], [row("u", ["a"], 1)]), []);
  assert.deepEqual(rankDrawings(), []);
});
