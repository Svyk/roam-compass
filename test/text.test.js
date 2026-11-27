import assert from "node:assert/strict";
import test from "node:test";

import { drawingTitle, labelParts, parseAttribute, plainText, removeToken, safeSlice, scanRefs, tailShape } from "../src/model/text.js";

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

test("labelParts renders SmartBlock buttons with surrounding text as chips only", () => {
  const raw = "21:13 {{⇥🕞:SmartBlock:Elapsed time}}   [[League Of Legends/16.3]] and watching random youtube videos. ";
  const result = labelParts(raw, 120);
  assert.equal(result.text, "21:13 ⇥🕞 League Of Legends/16.3 and watching random youtube videos.");
  assert.deepEqual(result.parts, [
    { text: "21:13 " },
    { text: "⇥🕞", button: true },
    { text: " League Of Legends/16.3 and watching random youtube videos." },
  ]);
  assert.equal(plainText(raw, 120), result.text);
  assert.ok(!result.text.includes("SmartBlock"));
});

test("labelParts renders button-only SmartBlock blocks with chip and workflow name", () => {
  const a = labelParts("{{🕗↦:SmartBlock:Double timestamp buttons2}}");
  assert.equal(a.text, "🕗↦ Double timestamp buttons2");
  assert.deepEqual(a.parts, [
    { text: "🕗↦", button: true },
    { text: " Double timestamp buttons2" },
  ]);

  const b = labelParts("{{Run:SmartBlock:Daily review:RemoveButton=false}}");
  assert.equal(b.text, "Run Daily review");
  assert.deepEqual(b.parts, [
    { text: "Run", button: true },
    { text: " Daily review" },
  ]);
  assert.ok(!b.text.includes("RemoveButton"));

  const c = labelParts("{{Go:42SmartBlock:Old flow}}");
  assert.equal(c.text, "Go Old flow");
  assert.deepEqual(c.parts, [
    { text: "Go", button: true },
    { text: " Old flow" },
  ]);
  assert.equal(plainText("{{Go:42SmartBlock:Old flow}}"), "Go Old flow");
});

test("labelParts truncates parts in lockstep with plain text", () => {
  const raw = "21:13 {{⇥🕞:SmartBlock:Elapsed time}}   [[League Of Legends/16.3]] and watching random youtube videos. ";
  const cut = labelParts(raw, 25);
  assert.equal(cut.text.length <= 25, true);
  assert.ok(cut.text.endsWith("…"));
  assert.equal(cut.parts.map((part) => part.text).join(""), cut.text);
  assert.equal(cut.parts.some((part) => part.button && part.text === "⇥🕞"), true);
});

test("labelParts resolves block references with depth cap, cycle guard, and missing fallback", () => {
  const refs = {
    b1: "Reply to [[Lori]] — recurring costs",
    b2: "Follow up on ((b3))",
    b3: "Budget review ((b4))",
    b4: "Too deep",
    self: "Loop ((self))",
  };

  const single = labelParts("19:15 - 19:45 (30') ((b1))", 90, { refs });
  assert.equal(single.text, "19:15 - 19:45 (30') Reply to Lori — recurring costs");
  assert.deepEqual(single.parts, [
    { text: "19:15 - 19:45 (30') " },
    { text: "Reply to Lori — recurring costs", ref: true },
  ]);
  assert.equal(plainText("19:15 - 19:45 (30') ((b1))", 90, { refs }), single.text);

  // Ref inside a ref resolves once more (depth 2), then stops at (( )).
  const nested = labelParts("Slot ((b2))", 90, { refs });
  assert.equal(nested.text, "Slot Follow up on Budget review (( ))");
  assert.deepEqual(nested.parts, [
    { text: "Slot " },
    { text: "Follow up on Budget review (( ))", ref: true },
  ]);

  // Self-reference does not loop.
  const cyc = labelParts("Note ((self))", 90, { refs });
  assert.equal(cyc.text, "Note Loop (( ))");
  const directSelf = labelParts("Loop ((self))", 90, { refs, selfUid: "self" });
  assert.equal(directSelf.text, "Loop (( ))");

  // Missing ref keeps (( )).
  const missing = labelParts("See ((nope123))", 90, { refs });
  assert.equal(missing.text, "See (( ))");
  assert.deepEqual(missing.parts, [{ text: "See (( ))" }]);

  // Ref next to a SmartBlock button.
  const combo = labelParts("21:13 {{⇥🕞:SmartBlock:Elapsed time}} ((b1))", 120, { refs });
  assert.equal(combo.text, "21:13 ⇥🕞 Reply to Lori — recurring costs");
  assert.deepEqual(combo.parts, [
    { text: "21:13 " },
    { text: "⇥🕞", button: true },
    { text: " " },
    { text: "Reply to Lori — recurring costs", ref: true },
  ]);

  // Truncation applies after resolving refs.
  const cut = labelParts("19:15 - 19:45 (30') ((b1))", 30, { refs });
  assert.equal(cut.text.length <= 30, true);
  assert.ok(cut.text.endsWith("…"));
  assert.ok(cut.text.includes("Reply"));
  assert.equal(cut.parts.map((part) => part.text).join(""), cut.text);
  assert.equal(cut.parts.some((part) => part.ref), true);
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

const MAIN_PLAINTEXT_TABLE = [
  [
    'Schedule #TimeBlock [[Nautilus Log]] {{[[roam/render]]:((roam-render-Nautilus-Log-cljs)) 22 15 5 "" 21}}',
    "Schedule #TimeBlock Nautilus Log roam/render",
  ],
  ["See [this note](((abc123def))) today", "See this note today"],
  ["Claim#sup^^[(1)](((fn1aaaaaa)))^^ continues", "Claim#sup(1) continues"],
  ["{{roam-grid-range: ((abc123def)) B2:D5}}", "roam-grid-range: (( )) B2:D5"],
  ["{{[[plexus-region]]: d=abc123def r=1}} Region title", "plexus-region Region title"],
  [
    "{{[[TODO]]}} #[[task-status/Active]] Reply to [[Lori]] — recurring costs",
    "TODO #task-status/Active Reply to Lori — recurring costs",
  ],
  ["{{[[DONE]]}} Call [[Jane]] **now** #[[Project X]]", "DONE Call Jane now #Project X"],
  ["Read `((abc123def))` in code", "Read (( )) in code"],
  ["[link](https://example.com) and ![img](https://example.com/a.png)", "link and img"],
  // Intentional improvement over main's brace-matching bug ("query}}").
  ["{{[[query]]: {and: [[TODO]] {not: [[DONE]]}}}}", "query"],
  ["{{[[table]]}}", "table"],
  ["{{[[pdf]]: https://example.com/a.pdf}}", "pdf"],
  ["BT_attrDue:: [[November 22nd, 2026]]", "BT_attrDue:: November 22nd, 2026"],
  ["plain text with ^^highlight^^ and ~~strike~~ and __italics__", "plain text with highlight and strike and italics"],
];

test("plainText matches main regression table without refs", () => {
  for (const [input, expected] of MAIN_PLAINTEXT_TABLE) {
    assert.equal(plainText(input), expected, `mismatch for ${input}`);
  }
});

test("macros, aliases, and code stay atomic with refs supplied, while embeds resolve", () => {
  const refs = {
    "roam-render-Nautilus-Log-cljs": "(defn render [] :nope)",
    abc123def: "Reply to Lori about costs",
    fn1aaaaaa: "Footnote body",
  };
  assert.equal(
    plainText(
      'Schedule #TimeBlock [[Nautilus Log]] {{[[roam/render]]:((roam-render-Nautilus-Log-cljs)) 22 15 5 "" 21}}',
      90,
      { refs },
    ),
    "Schedule #TimeBlock Nautilus Log roam/render",
  );
  assert.equal(plainText("See [this note](((abc123def))) today", 90, { refs }), "See this note today");
  assert.equal(plainText("Claim#sup^^[(1)](((fn1aaaaaa)))^^ continues", 90, { refs }), "Claim#sup(1) continues");
  assert.equal(plainText("{{roam-grid-range: ((abc123def)) B2:D5}}", 90, { refs }), "roam-grid-range: (( )) B2:D5");
  assert.equal(plainText("Read `((abc123def))` in code", 90, { refs }), "Read (( )) in code");
  assert.equal(plainText("Read ```((abc123def))``` in code", 90, { refs }), "Read (( )) in code");

  for (const variant of [
    "{{[[embed]]: ((abc123def))}}",
    "{{embed: ((abc123def))}}",
    "{{[[embed-path]]: ((abc123def))}}",
    "{{embed-path: ((abc123def))}}",
    "{{[[embed-children]]: ((abc123def))}}",
    "{{embed-children: ((abc123def))}}",
  ]) {
    const resolved = labelParts(variant, 90, { refs });
    assert.equal(resolved.text, "Reply to Lori about costs", variant);
    assert.deepEqual(resolved.parts, [{ text: "Reply to Lori about costs", ref: true }], variant);

    const missing = labelParts(variant, 90);
    assert.equal(missing.text, "(( ))", variant);
    assert.deepEqual(missing.parts, [{ text: "(( ))" }], variant);
  }
});

test("SmartBlock labels allow colons and strip Roam markup", () => {
  const timed = labelParts("{{08:00:SmartBlock:Morning routine}} start");
  assert.equal(timed.text, "08:00 start");
  assert.deepEqual(timed.parts, [{ text: "08:00", button: true }, { text: " start" }]);

  const linked = labelParts("{{[[Run]]:SmartBlock:Daily review}}");
  assert.equal(linked.text, "Run Daily review");
  assert.deepEqual(linked.parts, [{ text: "Run", button: true }, { text: " Daily review" }]);
});

test("plainText handles 25,000 spaces after {{ without backtracking", () => {
  const shortUncut = `{{${" ".repeat(1000)}x`;
  assert.equal(plainText(shortUncut, 90), "{{ x");

  const input = `{{${" ".repeat(25000)}x`;
  const start = performance.now();
  const out = plainText(input, 90);
  const elapsed = performance.now() - start;
  assert.equal(out, "");
  assert.ok(elapsed < 100, `expected < 100ms, got ${elapsed.toFixed(1)}ms`);
});

test("labelParts bounds adversarial inputs to 2000 chars and handles macros cut at the boundary", () => {
  const cases = [
    ["nested braces", `${"{{".repeat(8000)}x${"}}".repeat(8000)}`, `${"{{".repeat(44)}{…`],
    ["alias bracket chain", `${"[a]([[".repeat(8000)}]]`, "a"],
    ["unclosed aliases", "[a](".repeat(8000), "a"],
    ["unclosed brackets", `${"[x ".repeat(8000)}] end ](`, `${"[x ".repeat(29)}[x…`],
  ];
  for (const [name, input, expected] of cases) {
    const start = performance.now();
    const res = labelParts(input, 90);
    const elapsed = performance.now() - start;
    assert.ok(res.text.length <= 90, `${name}: length ${res.text.length} <= 90`);
    assert.equal(res.text, expected, name);
    assert.ok(elapsed < 50, `${name}: expected < 50ms, got ${elapsed.toFixed(1)}ms`);
  }

  const prefix = `${"Plain opening text for a very long block with details ".repeat(2)}`;
  const longBlock = `${prefix}${"z".repeat(5000)}`;
  assert.equal(plainText(longBlock), plainText(longBlock.slice(0, 2000)));

  const hugeQuery = `{{[[query]]: {and: [[TODO]] ${"x ".repeat(1500)}}}}`;
  assert.ok(hugeQuery.length > 3000);
  assert.equal(plainText(hugeQuery), "query");
});

test("labelParts bounds reference fan-out without truncating across long whitespace", () => {
  const start400 = performance.now();
  const res400 = labelParts("((a))".repeat(400), 90, {
    refs: { a: "((b))".repeat(400), b: "x".repeat(2000) },
  });
  const elapsed400 = performance.now() - start400;
  assert.ok(elapsed400 < 50, `400x400 took ${elapsed400.toFixed(1)}ms`);
  const res3 = labelParts("((a))".repeat(3), 90, {
    refs: { a: "((b))".repeat(3), b: "x".repeat(2000) },
  });
  assert.equal(res400.text, `${"x".repeat(89)}…`);
  assert.equal(res400.text, res3.text);

  const start50 = performance.now();
  const res50 = labelParts("((a))".repeat(50), 90, {
    refs: { a: "((b))".repeat(50), b: `${"[a".repeat(999)}](` },
  });
  const elapsed50 = performance.now() - start50;
  assert.ok(elapsed50 < 50, `50x50 took ${elapsed50.toFixed(1)}ms`);
  assert.equal(res50.text.length, 90);

  const uniqueRefs = { b: "y" };
  let outer = "";
  for (let i = 0; i < 300; i += 1) {
    const uid = `a${i}`;
    outer += `((${uid}))`;
    uniqueRefs[uid] = "((b))".repeat(300);
  }
  const start300 = performance.now();
  const res300 = labelParts(outer, 90, { refs: uniqueRefs });
  const elapsed300 = performance.now() - start300;
  assert.ok(elapsed300 < 50, `300 unique outer refs took ${elapsed300.toFixed(1)}ms`);
  assert.equal(res300.text, `${"y ".repeat(44)}y…`);

  const spaced = labelParts(`a${" ".repeat(500)}((u1)) tail`, 90, {
    refs: { u1: "Reply to Lori" },
  });
  assert.equal(spaced.text, "a Reply to Lori tail");
});

test("SmartBlock buttons always render as chips and never leak marker text", () => {
  const emptyLabel = labelParts("{{:SmartBlock:Daily}}");
  assert.equal(emptyLabel.text, "Daily");
  assert.deepEqual(emptyLabel.parts, [{ text: "Daily", button: true }]);

  const markupOnlyLabel = labelParts("{{****:SmartBlock:Daily}}");
  assert.equal(markupOnlyLabel.text, "Daily");
  assert.deepEqual(markupOnlyLabel.parts, [{ text: "Daily", button: true }]);

  const emptyWorkflow = labelParts("{{Run:SmartBlock:}}");
  assert.equal(emptyWorkflow.text, "Run");
  assert.deepEqual(emptyWorkflow.parts, [{ text: "Run", button: true }]);

  const emptyWorkflow42 = labelParts("{{Run:42SmartBlock:}}");
  assert.equal(emptyWorkflow42.text, "Run");
  assert.deepEqual(emptyWorkflow42.parts, [{ text: "Run", button: true }]);

  const bothEmpty = labelParts("{{:SmartBlock:}}");
  assert.equal(bothEmpty.text, "SmartBlock");
  assert.deepEqual(bothEmpty.parts, [{ text: "SmartBlock", button: true }]);

  const cutFull = labelParts(`${"a".repeat(1983)}{{Run:SmartBlock:Workflow}}`, 4000);
  assert.deepEqual(cutFull.parts[cutFull.parts.length - 1], { text: "Run", button: true });
  assert.equal(cutFull.text.includes("SmartBlock:"), false);
  assert.equal(cutFull.text.includes("SmartBl"), false);

  for (const cutCase of [
    `${"a".repeat(1987)}{{Run:SmartBlock:Workflow}}`, // cut inside :SmartBl
    `${"a".repeat(1991)}{{Run:42SmartBlock:Workflow}}`, // cut at Run:42S
    `${"a".repeat(1993)}{{Run:SmartBlock:Workflow}}`, // cut at Run:S
  ]) {
    const res = labelParts(cutCase, 4000);
    assert.deepEqual(res.parts[res.parts.length - 1], { text: "Run", button: true }, cutCase.slice(1980));
    assert.equal(res.text.includes("SmartBlock:"), false);
    assert.equal(res.text.includes("SmartBl"), false);
  }
});

test("expansion budget preserves SmartBlock workflow suppression, non-finite max, and cut-macro colons", () => {
  const buttons = Array.from(
    { length: 12 },
    (_, i) => `{{Button${String(i).padStart(4, "0")}:SmartBlock:flow${i}}}`,
  ).join(" ");

  // K1: trailing text past the budget still suppresses workflow names on every chip.
  const withNote = labelParts(`${buttons} trailing note`, 90);
  assert.equal(
    withNote.text,
    "Button0000 Button0001 Button0002 Button0003 Button0004 Button0005 Button0006 Button0007 B…",
  );
  assert.deepEqual(withNote.parts, [
    { text: "Button0000", button: true },
    { text: " " },
    { text: "Button0001", button: true },
    { text: " " },
    { text: "Button0002", button: true },
    { text: " " },
    { text: "Button0003", button: true },
    { text: " " },
    { text: "Button0004", button: true },
    { text: " " },
    { text: "Button0005", button: true },
    { text: " " },
    { text: "Button0006", button: true },
    { text: " " },
    { text: "Button0007", button: true },
    { text: " " },
    { text: "B", button: true },
    { text: "…" },
  ]);

  // K1: a trailing block ref past the budget also counts as other text without resolving it.
  const withRef = labelParts(`${buttons} ((u1))`, 90);
  assert.equal(withRef.text, withNote.text);
  assert.deepEqual(withRef.parts, withNote.parts);

  // K1: the same twelve buttons with no trailing text still show workflow names.
  const buttonsOnly = labelParts(buttons, 90);
  assert.equal(
    buttonsOnly.text,
    "Button0000 flow0 Button0001 flow1 Button0002 flow2 Button0003 flow3 Button0004 flow4 Butt…",
  );

  // K2: non-finite max disables the expansion budget.
  const allSixty = labelParts("word ((u1)) ".repeat(60), Infinity, { refs: { u1: "ref" } });
  assert.equal(allSixty.text, Array(60).fill("word ref").join(" "));

  // K3: a 2,000-character cut ending in `{{[[query]]:` with only markup before it reads `query`, not a chip.
  const cutQuery = `${"****".repeat(497)}{{[[query]]: {and: [[TODO]]}}}`;
  assert.equal(cutQuery.slice(0, 2000).endsWith("{{[[query]]:"), true);
  const queryRes = labelParts(cutQuery, 90);
  assert.equal(queryRes.text, "query");
  assert.deepEqual(queryRes.parts, [{ text: "query" }]);
  assert.equal(queryRes.parts.some((part) => part.button), false);
});

test("page-link and tag brackets that span code, macros, aliases, or block references are stripped", () => {
  const cases = [
    ["[[`code span`]]", "code span"],
    ["#[[`code span`]]", "#code span"],
    ["[[{{[[DONE]]}}]]", "DONE"],
    ["#[[{{[[TODO]]}}]]", "#TODO"],
    ["[[[alias]([[Page]])]]", "alias"],
    ["#[[[alias]([[Page]])]]", "#alias"],
    ["[[Notes on ((abc123def))]]", "Notes on (( ))"],
    ["#[[Topic ((abc123def))]]", "#Topic (( ))"],
    ["[[nested [[#[[long tag]] ```js\nlet a = 1;```]] page]]", "nested #long tag js let a = 1; page"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(plainText(input), expected, input);
  }

  const withRefs = labelParts("[[Notes on ((b1))]]", 90, { refs: { b1: "Subtask B" } });
  assert.equal(withRefs.text, "Notes on Subtask B");
  assert.deepEqual(withRefs.parts, [
    { text: "Notes on " },
    { text: "Subtask B", ref: true },
  ]);

  const startLong = performance.now();
  const longResult = plainText(`${"[[".repeat(1000)}\`a\`${"]]".repeat(1000)}`);
  const elapsedLong = performance.now() - startLong;
  assert.ok(elapsedLong < 50, `1000-bracket timing case took ${elapsedLong.toFixed(1)}ms`);
  assert.equal(longResult.length, 90);

  const startDeep = performance.now();
  const deepResult = plainText(`${"[[".repeat(499)}\`a\`${"]]".repeat(499)}`);
  const elapsedDeep = performance.now() - startDeep;
  assert.ok(elapsedDeep < 50, `499-pair cross-token timing case took ${elapsedDeep.toFixed(1)}ms`);
  assert.equal(deepResult, "a");
});

test("stage-ordered tokenization handles macros and page links inside aliases without expanding alias targets", () => {
  const refs = { abc123def: "Reply to Lori" };

  const todoAlias = labelParts("[{{[[TODO]]}} task](((abc123def)))", 90, { refs });
  assert.equal(todoAlias.text, "TODO task");
  assert.equal(todoAlias.parts.some((part) => part.ref), false);

  const pageAlias = labelParts("[see [[Page]]](((abc123def)))", 90, { refs });
  assert.equal(pageAlias.text, "see Page");
  assert.equal(pageAlias.parts.some((part) => part.ref), false);

  const sbAlias = labelParts("[{{Run:SmartBlock:Flow}}](https://example.com)", 90, { refs });
  assert.equal(sbAlias.parts.some((part) => part.button && part.text === "Run"), true);
  assert.equal(sbAlias.text.includes(":SmartBlock:"), false);
});

test("safeSlice cuts on grapheme boundaries for complex emoji and truncateParts preserves cross-part graphemes", () => {
  assert.equal(safeSlice("ab👨‍👩‍👧‍👦cd", 8), "ab");
  assert.equal(safeSlice("ab👍🏽cd", 4), "ab");
  assert.equal(safeSlice("ab🇺🇸cd", 4), "ab");
  assert.equal(safeSlice("ab❤️cd", 3), "ab");
  assert.equal(plainText("ab👨‍👩‍👧‍👦cd", 9), "ab…");
  assert.equal(plainText("ab🇺🇸cd", 5), "ab…");

  const crossPart = labelParts("((u1))🇸🇦xyz", 5, { refs: { u1: "🇺" } });
  assert.equal(crossPart.text, "🇺🇸…");
});
