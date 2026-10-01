import assert from "node:assert/strict";
import test from "node:test";

import { emptyQueryRows, rankTitles } from "../src/model/search.js";

const pages = ["Apollo", "Project Apollo", "Apollo/Docs", "Capollonia", "A. P. O. L. L. O.", "Gemini"]
  .map((title, index) => ({ uid: `u${index}`, title }));

test("exact, prefix, word start, substring, then loose matches", () => {
  assert.deepEqual(rankTitles(pages, "apollo").map((row) => row.title), [
    "Apollo",
    "Apollo/Docs",
    "Project Apollo",
    "Capollonia",
    "A. P. O. L. L. O.",
  ]);
});

test("blank queries and misses return nothing", () => {
  assert.deepEqual(rankTitles(pages, "  "), []);
  assert.deepEqual(rankTitles(pages, "zzz"), []);
  assert.equal(rankTitles(pages, "o", 2).length, 2);
});

test("pins, then today, then the newer recent row, and a duplicate uid is not repeated", () => {
  const rows = emptyQueryRows({
    pins: [
      { uid: "Pin" },
      { uid: "Pin", title: "Pin" },
    ],
    today: { uid: "today", title: "Today" },
    pages: [
      { uid: "alpha", title: "Alpha", editTime: 10 },
      { uid: "Pin", title: "Pin", editTime: 40 },
    ],
    drawings: [{ uid: "draw", title: "Drawing", editTime: 20 }],
  });
  assert.deepEqual(rows, [
    { uid: "Pin", title: "Pin", kind: "pin" },
    { uid: "today", title: "Today", kind: "today" },
    { uid: "draw", title: "Drawing", kind: "recent" },
    { uid: "alpha", title: "Alpha", kind: "recent" },
  ]);
});

test("limit 1 yields one recent row after the pin and today", () => {
  const rows = emptyQueryRows({
    pins: [{ uid: "pin", title: "Pin" }],
    today: { uid: "today", title: "Today" },
    pages: [{ uid: "alpha", title: "Alpha", editTime: 10 }],
    drawings: [{ uid: "draw", title: "Drawing", editTime: 20 }],
    limit: 1,
  });
  assert.deepEqual(rows, [
    { uid: "pin", title: "Pin", kind: "pin" },
    { uid: "today", title: "Today", kind: "today" },
    { uid: "draw", title: "Drawing", kind: "recent" },
  ]);
});

test("a today uid that is also the newest page appears once, as today, and the next page fills the recent slot", () => {
  const rows = emptyQueryRows({
    today: { uid: "today", title: "Today" },
    pages: [
      { uid: "today", title: "Today", editTime: 30 },
      { uid: "alpha", title: "Alpha", editTime: 20 },
    ],
    drawings: [{ uid: "draw", title: "Drawing", editTime: 10 }],
    limit: 1,
  });
  assert.deepEqual(rows, [
    { uid: "today", title: "Today", kind: "today" },
    { uid: "alpha", title: "Alpha", kind: "recent" },
  ]);
});

test("missing editTime is left out", () => {
  const rows = emptyQueryRows({
    pages: [
      { uid: "alpha", title: "Alpha" },
      { uid: "pin", title: "Pin", editTime: 2 },
      { title: "Today", editTime: 99 },
    ],
    drawings: [
      { uid: "draw", title: "Drawing" },
      { uid: "today", title: "Today", editTime: Number.NaN },
    ],
  });
  assert.deepEqual(rows, [{ uid: "pin", title: "Pin", kind: "recent" }]);
});
