import assert from "node:assert/strict";
import test from "node:test";

import { drawingTitle, parseAttribute, plainText, removeToken, scanRefs, tailShape } from "../src/model/text.js";

const titles = (text) => scanRefs(text).map((token) => (token.type === "block" ? `((${token.uid}))` : token.title));

test("scanRefs finds links, tags, and block refs", () => {
  assert.deepEqual(
    titles("Met [[Jane]] about #[[Project Apollo]] and #tag, see ((abc123def))"),
    ["Jane", "Project Apollo", "tag", "((abc123def))"],
  );
});

test("scanRefs skips macro names and inline code but reads macro arguments", () => {
  assert.deepEqual(titles("{{[[TODO]]}} call [[Jane]]"), ["Jane"]);
  assert.deepEqual(titles("{{embed: [[Spec]]}}"), ["Spec"]);
  assert.deepEqual(titles("{{[[table]]}}"), []);
  assert.deepEqual(titles("`[[not]]` [[yes]]"), ["yes"]);
  assert.deepEqual(titles("```\n[[fenced]]\n``` [[after]]"), ["after"]);
});

test("scanRefs reports nested page refs and class tags", () => {
  assert.deepEqual(titles("[[hello [[world]]]]"), ["hello [[world]]", "world"]);
  const tokens = scanRefs("#.hidden #[[.also]] [[A]]");
  assert.deepEqual(tokens.map((token) => token.classTag), [true, true, false]);
});

test("a # inside a word or URL is not a tag", () => {
  assert.deepEqual(titles("https://example.com/#frag and C#"), []);
});

test("parseAttribute reads Name:: and [[Name]]::", () => {
  assert.deepEqual(parseAttribute("Owner:: [[Jane]]"), { name: "Owner", prefix: "Owner::", tail: " [[Jane]]" });
  assert.equal(parseAttribute("[[Owner]]:: x").name, "Owner");
  assert.equal(parseAttribute("Part of:: [[X]]").name, "Part of");
  assert.equal(parseAttribute("plain text"), null);
  assert.equal(parseAttribute("see https://example.com"), null);
  assert.equal(parseAttribute("{{[[TODO]]}} a:: b"), null);
});

test("tailShape follows the attribute value rules", () => {
  assert.equal(tailShape(" [[A]] [[B]]").kind, "refs");
  assert.equal(tailShape(" [[A]] [[B]]").values.length, 2);
  assert.equal(tailShape("").kind, "bare");
  assert.equal(tailShape(" #.x").kind, "bare");
  assert.equal(tailShape(" [[A]], [[B]]").kind, "text");
  assert.equal(tailShape(" Active").kind, "text");
  assert.equal(tailShape(" [[A]] #.x").values.length, 1);
});

test("plainText strips Roam markup for labels", () => {
  assert.equal(plainText("{{[[TODO]]}} Call [[Jane]] **now** #[[Project X]]"), "TODO Call Jane now #Project X");
  assert.equal(plainText("See [this](https://example.com) and ((abc123def))"), "See this and (( ))");
  assert.equal(plainText("x".repeat(20), 10), `${"x".repeat(9)}…`);
});

test("removeToken drops one ref and its spacing", () => {
  const text = "Owner:: [[Jane]] [[Bob]]";
  const token = scanRefs(text).find((item) => item.title === "Jane");
  assert.equal(removeToken(text, token), "Owner:: [[Bob]]");
});

test("drawingTitle strips plexus-region components and names drawings", () => {
  assert.equal(drawingTitle("{{[[plexus-region]]: image rect 0.1 0.2}} Tail rotor"), "Tail rotor");
  assert.equal(drawingTitle("{{[[plexus-region]]: image rect 0.1 0.2}}"), "Region");
  assert.equal(drawingTitle("{{[[excalidraw]]}} {{-: Text elements in drawing: Flow ; Other }}"), "Drawing: Flow");
  assert.equal(drawingTitle("{{[[excalidraw]]}}"), "Drawing");
  assert.equal(drawingTitle("plain [[Jane]]"), null);
});

test("regionOwner reads the d= token of a region block only", async () => {
  const { regionOwner } = await import("../src/model/text.js");
  assert.equal(regionOwner("{{[[plexus-region]]: k=area d=abc123 ids=a}} Tail"), "abc123");
  assert.equal(regionOwner("{{[[plexus-region]]: k=area ids=a}}"), null);
  assert.equal(regionOwner("{{[[excalidraw]]}} d=abc"), null);
  assert.equal(regionOwner(null), null);
});
