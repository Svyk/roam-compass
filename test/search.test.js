import assert from "node:assert/strict";
import test from "node:test";

import { rankTitles } from "../src/model/search.js";

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
