import assert from "node:assert/strict";
import test from "node:test";

import { factOf } from "../src/model/facts.js";
import {
  BUILTIN_PRESETS,
  FACET_PALETTE,
  allPresets,
  centerCategory,
  classify,
  facetEdges,
  findPreset,
  layoutFacets,
  validatePreset,
} from "../src/model/facets.js";
import { createFacets } from "../src/view/features/facets.js";

function pointInBox(px, py, box, inset = 0) {
  return (
    px >= box.x - box.w / 2 + inset &&
    px <= box.x + box.w / 2 - inset &&
    py >= box.y - box.h / 2 + inset &&
    py <= box.y + box.h / 2 - inset
  );
}

function sampleBezier(edge, t) {
  const u = 1 - t;
  return {
    x: u * u * u * edge.sx + 3 * u * u * t * edge.c1x + 3 * u * t * t * edge.c2x + t * t * t * edge.ex,
    y: u * u * u * edge.sy + 3 * u * u * t * edge.c1y + 3 * u * t * t * edge.c2y + t * t * t * edge.ey,
  };
}

function boxesOverlap(a, b) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
}

function boxInside(inner, outer) {
  return (
    inner.x - inner.w / 2 >= outer.x - outer.w / 2 - 1e-6 &&
    inner.x + inner.w / 2 <= outer.x + outer.w / 2 + 1e-6 &&
    inner.y - inner.h / 2 >= outer.y - outer.h / 2 - 1e-6 &&
    inner.y + inner.h / 2 <= outer.y + outer.h / 2 + 1e-6
  );
}

function strictlyEncloses(outer, inner, margin = 0) {
  return (
    outer.x - outer.w / 2 <= inner.x - inner.w / 2 - margin + 1e-6 &&
    outer.x + outer.w / 2 >= inner.x + inner.w / 2 + margin - 1e-6 &&
    outer.y - outer.h / 2 <= inner.y - inner.h / 2 - margin + 1e-6 &&
    outer.y + outer.h / 2 >= inner.y + inner.h / 2 + margin - 1e-6
  );
}

test("BUILTIN_PRESETS defines roles, types, and status in order", () => {
  assert.deepEqual(
    BUILTIN_PRESETS.map((p) => ({ id: p.id, name: p.name, source: p.source, layout: p.layout })),
    [
      { id: "roles", name: "Local roles", source: "role", layout: "circular" },
      { id: "types", name: "By type", source: "type", layout: "circular" },
      { id: "status", name: "Status board", source: "attribute", layout: "horizontal" },
    ],
  );
  assert.ok(BUILTIN_PRESETS[1].help.includes("Node type attribute"));
  for (const builtin of BUILTIN_PRESETS) {
    assert.equal(validatePreset(builtin).ok, true);
  }
});

test("validatePreset normalizes valid presets, fills defaults, and drops unknown keys", () => {
  const checked = validatePreset({
    id: "  sprint-board ",
    name: "  Sprint board ",
    help: "  Weekly status  ",
    source: " attribute ",
    attribute: "  Status:: ",
    extraRootKey: 123,
    categories: [
      { id: "todo", label: " To do ", values: [" Todo ", "To do", "Todo", "  "], color: "#c2410c", bogus: true },
      { label: "In Progress", values: ["Doing"] },
      { id: "done", label: "Done", values: ["Done"] },
    ],
  });

  assert.equal(checked.ok, true);
  assert.deepEqual(checked.preset, {
    id: "sprint-board",
    name: "Sprint board",
    help: "Weekly status",
    source: "attribute",
    attribute: "Status",
    categories: [
      { id: "todo", label: "To do", values: ["Todo", "To do"], color: "#c2410c" },
      { id: "in-progress", label: "In Progress", values: ["Doing"], color: FACET_PALETTE[1] },
      { id: "done", label: "Done", values: ["Done"], color: FACET_PALETTE[2] },
    ],
    layout: "circular",
    edges: true,
    focusInCategory: false,
    hideEmptyStatus: true,
  });

  const nonFourQuadrants = validatePreset({
    id: "three-quads",
    name: "Three quads",
    source: "type",
    layout: "quadrants",
    categories: [
      { id: "a", label: "A", values: ["A"] },
      { id: "b", label: "B", values: ["B"] },
      { id: "c", label: "C", values: ["C"] },
    ],
  });
  assert.equal(nonFourQuadrants.ok, true);
  assert.equal(nonFourQuadrants.preset.layout, "quadrants");
});

test("validatePreset reports actionable errors for invalid presets", () => {
  assert.equal(validatePreset(null).ok, false);
  assert.equal(validatePreset([]).ok, false);

  const badCount = validatePreset({
    id: "one-only",
    name: "One only",
    source: "type",
    categories: [{ id: "a", label: "A", values: ["A"] }],
  });
  assert.equal(badCount.ok, false);
  assert.ok(badCount.errors.includes("A preset needs 2 to 7 categories."));

  const tooMany = validatePreset({
    id: "eight",
    name: "Eight",
    source: "type",
    categories: Array.from({ length: 8 }, (_, idx) => ({
      id: `c-${idx}`,
      label: `C${idx}`,
      values: [`V${idx}`],
    })),
  });
  assert.equal(tooMany.ok, false);
  assert.ok(tooMany.errors.includes("A preset needs 2 to 7 categories."));

  const emptyCatValues = validatePreset({
    id: "status-custom",
    name: "Status custom",
    source: "attribute",
    attribute: "Status",
    categories: [
      { id: "todo", label: "Todo", values: ["Todo"] },
      { id: "doing", label: "Doing", values: ["Doing"] },
      { id: "done", label: "Done", values: ["   "] },
    ],
  });
  assert.equal(emptyCatValues.ok, false);
  assert.ok(emptyCatValues.errors.includes("Category 3 has no values."));

  const badMeta = validatePreset({
    id: "Bad_ID!",
    name: "  ",
    source: "attribute",
    attribute: "  ",
    layout: "diagonal",
    edges: "yes",
    categories: "auto",
  });
  assert.equal(badMeta.ok, false);
  assert.ok(badMeta.errors.length >= 4);

  const badAutoRole = validatePreset({
    id: "auto-role",
    name: "Auto role",
    source: "role",
    categories: "auto",
  });
  assert.equal(badAutoRole.ok, false);

  const badRule = validatePreset({
    id: "bad-rule",
    name: "Bad rule",
    source: "rule",
    categories: [
      { id: "r1", label: "R1", match: {} },
      { id: "r1", label: "R2", match: { all: [{ field: "bogus", op: "is", value: "x" }] } },
    ],
  });
  assert.equal(badRule.ok, false);
  assert.ok(badRule.errors.some((msg) => msg.includes("duplicate id")));

  const badRoleValue = validatePreset({
    id: "bad-role-val",
    name: "Bad role val",
    source: "role",
    categories: [
      { id: "p", label: "Parents", values: ["parent"] },
      { id: "u", label: "Unknown", values: ["cousin"] },
    ],
  });
  assert.equal(badRoleValue.ok, false);
  assert.ok(badRoleValue.errors.some((msg) => msg.includes("cousin")));
});

test("allPresets and findPreset merge custom presets and allow overriding built-ins", () => {
  const customStatus = {
    id: "status",
    name: "Custom status",
    source: "attribute",
    attribute: "Stage",
    categories: "auto",
    layout: "vertical",
  };
  const customQuad = {
    id: "eisenhower",
    name: "Eisenhower",
    source: "attribute",
    attribute: "Priority",
    layout: "quadrants",
    categories: [
      { id: "q1", label: "Do now", values: ["P0"] },
      { id: "q2", label: "Schedule", values: ["P1"] },
      { id: "q3", label: "Delegate", values: ["P2"] },
      { id: "q4", label: "Drop", values: ["P3"] },
    ],
  };
  const invalidCustom = { id: "BROKEN", name: "" };

  const merged = allPresets([customStatus, invalidCustom, customQuad]);
  assert.deepEqual(
    merged.map((p) => ({ id: p.id, name: p.name, builtin: p.builtin })),
    [
      { id: "roles", name: "Local roles", builtin: true },
      { id: "types", name: "By type", builtin: true },
      { id: "status", name: "Custom status", builtin: false },
      { id: "eisenhower", name: "Eisenhower", builtin: false },
    ],
  );
  assert.equal(merged[2].attribute, "Stage");
  assert.equal(findPreset(merged, "eisenhower").name, "Eisenhower");
  assert.equal(findPreset(merged, "unknown-id").id, "roles");
  assert.equal(findPreset([], "missing").id, "roles");
});

test("classify supports attribute, type, role, kind, and rule sources with conflicts and unassigned", () => {
  const f1 = factOf(
    { uid: "u1", title: "Task A", kind: "page", role: "child", zone: "south", style: "typed" },
    { status: { name: "Status", values: [{ text: " Todo " }] }, type: { name: "Type", values: [{ text: "Task" }] } },
  );
  const f2 = factOf(
    { uid: "u2", title: "Task B", kind: "page", role: "friend", zone: "west", style: "link" },
    {
      status: { name: "Status", values: [{ text: "Doing" }, { text: "Done" }] },
      type: { name: "Type", values: [{ text: "Task" }] },
    },
  );
  const f3 = factOf(
    { uid: "u3", title: "Note C", kind: "block", role: "previous", zone: "west", style: "structural" },
    {},
  );
  const f4 = factOf(
    { uid: "u4", title: "Lowercase todo", kind: "page", role: "sibling", zone: "siblings", style: "sibling" },
    { status: { name: "Status", values: [{ text: "todo" }] } },
    { empty: true },
  );

  // 1. attribute source (case-sensitive, trimmed, conflict + unassigned)
  const attrPreset = validatePreset({
    id: "st",
    name: "Status",
    source: "attribute",
    attribute: "Status",
    categories: [
      { id: "todo", label: "To do", values: ["Todo"] },
      { id: "doing", label: "Doing", values: ["Doing"] },
      { id: "done", label: "Done", values: ["Done"] },
    ],
  }).preset;
  const attrRes = classify(attrPreset, [f1, f2, f3, f4]);
  assert.deepEqual(
    attrRes.categories.map((c) => ({ id: c.id, uids: c.uids })),
    [
      { id: "todo", uids: ["u1"] },
      { id: "doing", uids: [] },
      { id: "done", uids: [] },
    ],
  );
  assert.deepEqual(attrRes.conflicting, ["u2"]);
  assert.deepEqual(attrRes.matches, { u2: ["doing", "done"] });
  assert.deepEqual(attrRes.unassigned, ["u3", "u4"]);

  // 2. type source
  const typePreset = validatePreset({
    id: "tp",
    name: "Types",
    source: "type",
    categories: [
      { id: "task", label: "Task", values: ["Task"] },
      { id: "source", label: "Source", values: ["Source"] },
    ],
  }).preset;
  const typeRes = classify(typePreset, [f2, f1, f3]);
  assert.deepEqual(typeRes.categories[0].uids, ["u2", "u1"]);
  assert.deepEqual(typeRes.unassigned, ["u3"]);

  // 3. role source (built-in roles preset)
  const roleRes = classify(BUILTIN_PRESETS[0], [f1, f2, f3, f4]);
  assert.deepEqual(
    roleRes.categories.map((c) => [c.id, c.uids]),
    [
      ["parents", []],
      ["children", ["u1"]],
      ["friends", ["u2", "u3"]],
      ["challengers", []],
      ["siblings", ["u4"]],
    ],
  );

  // 4. kind source (matches fact.group)
  const kindPreset = validatePreset({
    id: "kd",
    name: "Kinds",
    source: "kind",
    categories: [
      { id: "pages", label: "Pages", values: ["page"] },
      { id: "blocks", label: "Blocks", values: ["block"] },
      { id: "empties", label: "Empty pages", values: ["empty"] },
    ],
  }).preset;
  const kindRes = classify(kindPreset, [f1, f2, f3, f4]);
  assert.deepEqual(
    kindRes.categories.map((c) => [c.id, c.uids]),
    [
      ["pages", ["u1", "u2"]],
      ["blocks", ["u3"]],
      ["empties", ["u4"]],
    ],
  );

  // 5. rule source
  const rulePreset = validatePreset({
    id: "rl",
    name: "Rules",
    source: "rule",
    categories: [
      {
        id: "tasks",
        label: "Tasks",
        match: { all: [{ field: "type", op: "is", value: "Task" }] },
      },
      {
        id: "west-side",
        label: "West",
        match: { any: [{ field: "zone", op: "is", value: "west" }] },
      },
    ],
  }).preset;
  const ruleRes = classify(rulePreset, [f1, f2, f3, f4]);
  assert.deepEqual(ruleRes.categories[0].uids, ["u1"]);
  assert.deepEqual(ruleRes.categories[1].uids, ["u3"]);
  assert.deepEqual(ruleRes.conflicting, ["u2"]);
  assert.deepEqual(ruleRes.matches, { u2: ["tasks", "west-side"] });
  assert.deepEqual(ruleRes.unassigned, ["u4"]);
});

test("classify builds auto categories by frequency then alphabetical and groups overflow into Other", () => {
  const make = (uid, tag) => factOf(
    { uid, title: uid, kind: "page" },
    tag ? { tag: { name: "Tag", values: [{ text: tag }] } } : {},
  );
  const autoPreset = validatePreset({
    id: "tags",
    name: "Tags",
    source: "attribute",
    attribute: "Tag",
    categories: "auto",
  }).preset;

  const facts = [
    make("n1", "Zeta"),
    make("n2", "Alpha"),
    make("n3", "Alpha"),
    make("n4", "Alpha"),
    make("n5", "Beta"),
    make("n6", "Beta"),
    make("n7", "Gamma"),
    make("n8", "Gamma"),
    make("n9", "Delta"),
    make("n10", "Epsilon"),
    make("n11", "Eta"),
    make("n12", "Theta"),
    make("n13", "Iota"),
    make("n14", ""),
  ];

  const res = classify(autoPreset, facts);
  assert.equal(res.categories.length, 7);
  assert.deepEqual(
    res.categories.map((c) => ({ label: c.label, uids: c.uids })),
    [
      { label: "Alpha", uids: ["n2", "n3", "n4"] },
      { label: "Beta", uids: ["n5", "n6"] },
      { label: "Gamma", uids: ["n7", "n8"] },
      { label: "Delta", uids: ["n9"] },
      { label: "Epsilon", uids: ["n10"] },
      { label: "Eta", uids: ["n11"] },
      { label: "Other", uids: ["n1", "n12", "n13"] },
    ],
  );
  assert.deepEqual(res.unassigned, ["n14"]);
  assert.deepEqual(res.conflicting, []);
});

test("centerCategory identifies the single matching category or returns null", () => {
  const preset = validatePreset({
    id: "st",
    name: "Status",
    source: "attribute",
    attribute: "Status",
    categories: [
      { id: "todo", label: "Todo", values: ["Todo"] },
      { id: "doing", label: "Doing", values: ["Doing"] },
    ],
  }).preset;

  const matching = factOf({ uid: "c", kind: "page" }, { status: { values: [{ text: "Doing" }] } });
  const none = factOf({ uid: "c", kind: "page" }, {});
  const both = factOf({ uid: "c", kind: "page" }, { status: { values: [{ text: "Todo" }, { text: "Doing" }] } });

  assert.equal(centerCategory(preset, matching), "doing");
  assert.equal(centerCategory(preset, none), null);
  assert.equal(centerCategory(preset, both), null);
  assert.equal(centerCategory(BUILTIN_PRESETS[2], matching), null);
  assert.equal(
    centerCategory(BUILTIN_PRESETS[2], matching, [{ id: "doing", label: "Doing" }]),
    "doing",
  );
  assert.equal(
    centerCategory(BUILTIN_PRESETS[2], matching, [
      { id: "todo", label: "Todo" },
      { id: "other", label: "Other" },
    ]),
    null,
  );
  const sevenWithOther = [
    { id: "c1", label: "C1" },
    { id: "c2", label: "C2" },
    { id: "c3", label: "C3" },
    { id: "c4", label: "C4" },
    { id: "c5", label: "C5" },
    { id: "c6", label: "C6" },
    { id: "other", label: "Other" },
  ];
  assert.equal(centerCategory(BUILTIN_PRESETS[2], matching, sevenWithOther), "other");
});

test("layoutFacets places 2 to 7 mixed-size categories across all layouts without overlap and keeps cards inside regions", () => {
  const sizePool = [0, 1, 4, 7, 10, 14, 21];
  const layouts = ["circular", "concentric", "horizontal", "vertical", "quadrants"];

  for (const layoutName of layouts) {
    for (let catCount = 2; catCount <= 7; catCount += 1) {
      const categories = Array.from({ length: catCount }, (_, idx) => {
        const cardCount = sizePool[(idx * 2 + catCount) % sizePool.length];
        return {
          id: `cat-${idx}`,
          label: `Category ${idx}`,
          color: FACET_PALETTE[idx % FACET_PALETTE.length],
          uids: Array.from({ length: cardCount }, (__, k) => `u-${idx}-${k}`),
        };
      });
      const classified = {
        preset: {
          id: "test",
          name: "Test",
          layout: layoutName,
          hideEmptyStatus: false,
        },
        categories,
        unassigned: ["u-un-1", "u-un-2"],
        conflicting: ["u-cf-1"],
        matches: { "u-cf-1": ["cat-0", "cat-1"] },
      };

      for (const focusCategory of [null, "cat-1"]) {
        const gap = 12;
        const geo = layoutFacets(classified, { gap, focusCategory });

        if (layoutName === "quadrants" && catCount !== 4) {
          assert.equal(geo.fallback, "circular");
        } else {
          assert.equal(geo.fallback, null);
        }

        const regionById = new Map(geo.regions.map((reg) => [reg.id, reg]));
        assert.equal(geo.regions.length, catCount + 2);

        if (focusCategory) {
          assert.equal(geo.center.h, 64);
          assert.ok(boxInside(geo.center, regionById.get(focusCategory)));
        }

        // Every item and +N more slot lies strictly inside its region
        for (const item of geo.items) {
          const reg = regionById.get(item.zone);
          assert.ok(reg, `missing region ${item.zone}`);
          assert.ok(
            boxInside(item, reg),
            `${layoutName} (${catCount}): card ${item.key} outside region ${reg.id}`,
          );
        }
        for (const moreSlot of geo.more) {
          const reg = regionById.get(moreSlot.regionId);
          assert.ok(reg, `missing region ${moreSlot.regionId}`);
          assert.ok(
            boxInside(moreSlot, reg),
            `${layoutName} (${catCount}): more slot outside region ${reg.id}`,
          );
        }

        // No two cards (center, items, more slots) overlap in any layout
        const allCards = [geo.center, ...geo.items, ...geo.more];
        for (let i = 0; i < allCards.length; i += 1) {
          for (let j = i + 1; j < allCards.length; j += 1) {
            assert.ok(
              !boxesOverlap(allCards[i], allCards[j]),
              `${layoutName} (${catCount}, focus=${focusCategory}): card ${i} overlaps card ${j}`,
            );
          }
        }

        // Bounds enclose center and every region
        assert.ok(boxInside(geo.center, {
          x: (geo.bounds.minX + geo.bounds.maxX) / 2,
          y: (geo.bounds.minY + geo.bounds.maxY) / 2,
          w: geo.bounds.maxX - geo.bounds.minX,
          h: geo.bounds.maxY - geo.bounds.minY,
        }));

        if (layoutName === "concentric") {
          const ringRegions = geo.regions.filter((r) => r.status === null);
          const statusRegions = geo.regions.filter((r) => r.status !== null);
          if (!focusCategory) {
            assert.ok(strictlyEncloses(ringRegions[0], geo.center, gap * 2));
          }
          for (let i = 1; i < ringRegions.length; i += 1) {
            assert.ok(
              strictlyEncloses(ringRegions[i], ringRegions[i - 1], gap * 2),
              `ring ${i} must enclose ring ${i - 1}`,
            );
            // Cards of ring i must sit outside ring i - 1
            for (const item of geo.items.filter((it) => it.zone === ringRegions[i].id)) {
              assert.ok(!boxesOverlap(item, ringRegions[i - 1]));
            }
          }
          if (!focusCategory) {
            for (const item of geo.items.filter((it) => it.zone === ringRegions[0].id)) {
              assert.ok(!boxesOverlap(item, geo.center));
            }
          }
          const outerRing = ringRegions[ringRegions.length - 1];
          for (const st of statusRegions) {
            assert.ok(!boxesOverlap(st, outerRing));
          }
          if (statusRegions.length === 2) {
            assert.ok(!boxesOverlap(statusRegions[0], statusRegions[1]));
          }
        } else {
          // Solid-box layouts: no two regions overlap, and no non-focused region overlaps center
          for (let i = 0; i < geo.regions.length; i += 1) {
            const regA = geo.regions[i];
            if (regA.id !== focusCategory) {
              assert.ok(
                !boxesOverlap(regA, geo.center),
                `${layoutName} (${catCount}): region ${regA.id} overlaps center`,
              );
            }
            for (let j = i + 1; j < geo.regions.length; j += 1) {
              const regB = geo.regions[j];
              assert.ok(
                !boxesOverlap(regA, regB),
                `${layoutName} (${catCount}): region ${regA.id} overlaps ${regB.id}`,
              );
            }
          }
        }

        // Verify facetEdges endpoints and curve clearance across every layout, size, and focusCategory
        const edges = facetEdges(geo);
        if (!focusCategory) {
          if (layoutName === "concentric") {
            assert.equal(edges.length, 0, "concentric rings enclose center and omit curves");
          } else {
            assert.equal(edges.length, catCount, `${layoutName} (${catCount}): expected one curve per category region`);
          }
        }
        const seenEdgeRegions = new Set();
        for (const edge of edges) {
          assert.equal(seenEdgeRegions.has(edge.regionId), false, "at most one curve per region");
          seenEdgeRegions.add(edge.regionId);
          const target = regionById.get(edge.regionId);
          assert.ok(target, `edge references existing region ${edge.regionId}`);
          assert.equal(target.status, null, "no curve to Unassigned or Conflicting status regions");
          assert.notEqual(edge.regionId, focusCategory, "focused region holding center gets no curve");

          // Start endpoint sits on center border; end endpoint sits at middle of a border of target region
          assert.ok(pointInBox(edge.sx, edge.sy, geo.center, -1e-6));
          assert.equal(pointInBox(edge.sx, edge.sy, geo.center, 0.5), false);
          const sideMids = {
            top: [target.x, target.y - target.h / 2],
            bottom: [target.x, target.y + target.h / 2],
            left: [target.x - target.w / 2, target.y],
            right: [target.x + target.w / 2, target.y],
          };
          assert.deepEqual([edge.ex, edge.ey], sideMids[edge.side]);

          // No returned segment's endpoints lie inside any other region
          for (const other of geo.regions) {
            if (other.id === edge.regionId) continue;
            assert.equal(
              pointInBox(edge.ex, edge.ey, other, 0),
              false,
              `${layoutName} (${catCount}): end endpoint for ${edge.regionId} lies inside ${other.id}`,
            );
            if (other.id !== focusCategory) {
              assert.equal(
                pointInBox(edge.sx, edge.sy, other, 0),
                false,
                `${layoutName} (${catCount}): start endpoint for ${edge.regionId} lies inside ${other.id}`,
              );
            }
          }
          if (!focusCategory) {
            assert.equal(pointInBox(edge.sx, edge.sy, target, 0), false);
          }

          // Sampled curve never enters center, target region, any other region, or any card
          for (let step = 1; step < 80; step += 1) {
            const pt = sampleBezier(edge, step / 80);
            assert.equal(pointInBox(pt.x, pt.y, geo.center, 0.5), false, "curve enters center");
            assert.equal(pointInBox(pt.x, pt.y, target, 0.5), false, "curve enters target region");
            for (const other of geo.regions) {
              if (other.id === edge.regionId || other.id === focusCategory) continue;
              assert.equal(
                pointInBox(pt.x, pt.y, other, 0),
                false,
                `${layoutName} (${catCount}): curve to ${edge.regionId} passes through region ${other.id}`,
              );
            }
            for (const card of [...geo.items, ...geo.more]) {
              assert.equal(
                pointInBox(pt.x, pt.y, card, 0),
                false,
                `${layoutName} (${catCount}): curve to ${edge.regionId} crosses card ${card.key || card.regionId}`,
              );
            }
          }
        }
      }
    }
  }
});

test("facetEdges routes in the corridor gap for horizontal/vertical and omits collinear blocked regions", () => {
  // Horizontal with Unassigned + Conflicting: 4 category curves via top corridor, 0 status curves
  const horizGeo = layoutFacets({
    preset: { layout: "horizontal", hideEmptyStatus: false },
    categories: [
      { id: "c0", label: "Doing", color: "#2563eb", uids: ["u1"] },
      { id: "c1", label: "Done", color: "#16a34a", uids: ["u2"] },
      { id: "c2", label: "Planned", color: "#d97706", uids: ["u3"] },
      { id: "c3", label: "Todo", color: "#9333ea", uids: ["u4"] },
    ],
    unassigned: ["u5"],
    conflicting: ["u6"],
  });
  const horizEdges = facetEdges(horizGeo);
  assert.deepEqual(horizEdges.map((e) => [e.regionId, e.side]), [
    ["c0", "top"],
    ["c1", "top"],
    ["c2", "top"],
    ["c3", "top"],
  ]);

  // Vertical stack: outer regions route through left corridor rather than crossing middle regions
  const vertGeo = layoutFacets({
    preset: { layout: "vertical", hideEmptyStatus: true },
    categories: [
      { id: "v0", label: "V0", color: "#2563eb", uids: ["1", "2"] },
      { id: "v1", label: "V1", color: "#16a34a", uids: ["3", "4"] },
      { id: "v2", label: "V2", color: "#d97706", uids: ["5", "6"] },
      { id: "v3", label: "V3", color: "#9333ea", uids: ["7", "8"] },
    ],
    unassigned: [],
    conflicting: [],
  });
  const vertEdges = facetEdges(vertGeo);
  assert.deepEqual(vertEdges.map((e) => [e.regionId, e.side]), [
    ["v0", "left"],
    ["v1", "left"],
    ["v2", "left"],
    ["v3", "left"],
  ]);

  // Collinear blocking geometry: near region gets a curve; far region behind near is left out
  const blockedEdges = facetEdges({
    center: { x: 0, y: 0, w: 200, h: 56 },
    regions: [
      { id: "near", label: "Near", color: "#2563eb", x: 240, y: 0, w: 180, h: 120, status: null },
      { id: "far", label: "Far", color: "#16a34a", x: 480, y: 0, w: 180, h: 120, status: null },
    ],
    items: [],
    more: [],
  });
  assert.deepEqual(blockedEdges.map((e) => [e.regionId, e.side]), [["near", "left"]]);
});

test("layoutFacets preserves directional invariants for circular, horizontal, vertical, quadrants, and overflow", () => {
  const mkCats = (n, cardsEach = 2) => Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    label: `C${i}`,
    color: FACET_PALETTE[i],
    uids: Array.from({ length: cardsEach }, (__, k) => `u-${i}-${k}`),
  }));

  // Circular: first at top, clockwise
  const circ = layoutFacets({ preset: { layout: "circular" }, categories: mkCats(4), unassigned: [], conflicting: [] });
  assert.equal(circ.regions.length, 4);
  assert.equal(circ.regions[0].x, 0);
  assert.ok(circ.regions[0].y < 0);
  assert.ok(circ.regions[1].x > 0);
  assert.equal(circ.regions[2].x, 0);
  assert.ok(circ.regions[2].y > 0);
  assert.ok(circ.regions[3].x < 0);

  // Horizontal: one row left to right below center, tops aligned
  const horiz = layoutFacets({
    preset: { layout: "horizontal" },
    categories: [
      { id: "a", label: "A", color: "#2563eb", uids: ["1"] },
      { id: "b", label: "B", color: "#16a34a", uids: ["2", "3", "4", "5", "6"] },
      { id: "c", label: "C", color: "#d97706", uids: ["7", "8"] },
    ],
    unassigned: [],
    conflicting: [],
  });
  const topA = horiz.regions[0].y - horiz.regions[0].h / 2;
  const topB = horiz.regions[1].y - horiz.regions[1].h / 2;
  const topC = horiz.regions[2].y - horiz.regions[2].h / 2;
  assert.equal(topA, topB);
  assert.equal(topB, topC);
  assert.ok(topA > horiz.center.y + horiz.center.h / 2);
  assert.ok(horiz.regions[0].x < horiz.regions[1].x && horiz.regions[1].x < horiz.regions[2].x);

  // Vertical: stacked top to bottom to the right of center, left edges aligned
  const vert = layoutFacets({
    preset: { layout: "vertical" },
    categories: [
      { id: "a", label: "A", color: "#2563eb", uids: ["1"] },
      { id: "b", label: "B", color: "#16a34a", uids: ["2", "3", "4", "5", "6"] },
    ],
    unassigned: [],
    conflicting: [],
  });
  const leftA = vert.regions[0].x - vert.regions[0].w / 2;
  const leftB = vert.regions[1].x - vert.regions[1].w / 2;
  assert.equal(leftA, leftB);
  assert.ok(leftA > vert.center.x + vert.center.w / 2);
  assert.ok(vert.regions[0].y < vert.regions[1].y);

  // Quadrants: TL, TR, BL, BR
  const quad = layoutFacets({ preset: { layout: "quadrants" }, categories: mkCats(4), unassigned: [], conflicting: [] });
  assert.equal(quad.fallback, null);
  assert.ok(quad.regions[0].x < 0 && quad.regions[0].y < 0);
  assert.ok(quad.regions[1].x > 0 && quad.regions[1].y < 0);
  assert.ok(quad.regions[2].x < 0 && quad.regions[2].y > 0);
  assert.ok(quad.regions[3].x > 0 && quad.regions[3].y > 0);

  // Overflow and expandedRegions
  const crowded = {
    preset: { layout: "horizontal" },
    categories: [
      { id: "big", label: "Big", color: "#2563eb", uids: Array.from({ length: 20 }, (_, i) => `b-${i}`) },
      { id: "small", label: "Small", color: "#16a34a", uids: ["s-0"] },
    ],
    unassigned: [],
    conflicting: [],
  };
  const folded = layoutFacets(crowded, { maxRows: 6 });
  assert.equal(folded.regions[0].count, 20);
  assert.equal(folded.regions[0].hidden, 3);
  assert.equal(folded.more.length, 1);
  assert.equal(folded.more[0].regionId, "big");
  assert.equal(folded.more[0].count, 3);

  const unfolded = layoutFacets(crowded, { maxRows: 6, expandedRegions: new Set(["big"]) });
  assert.equal(unfolded.regions[0].hidden, 0);
  assert.equal(unfolded.more.length, 0);
  assert.equal(unfolded.items.filter((it) => it.zone === "big").length, 20);
});

function createMockNode(tag, className = "", text = "") {
  const attrs = new Map();
  const listeners = new Map();
  const styleProps = new Map();
  const classSet = new Set(String(className || "").split(/\s+/).filter(Boolean));
  const node = {
    tagName: String(tag).toUpperCase(),
    dataset: {},
    style: {
      width: "",
      height: "",
      transform: "",
      setProperty(k, v) { styleProps.set(k, v); },
      getPropertyValue(k) { return styleProps.get(k) ?? ""; },
    },
    classList: {
      add(...names) { for (const n of names) classSet.add(n); },
      contains(name) { return classSet.has(name); },
    },
    children: [],
    hidden: false,
    tabIndex: -1,
    title: "",
    value: "",
    textContent: text ? String(text) : "",
    isConnected: true,
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.get(k) ?? null; },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    trigger(type, ev = {}) {
      for (const fn of listeners.get(type) ?? []) fn({ preventDefault() {}, stopPropagation() {}, ...ev });
    },
    append(...items) {
      for (const item of items) {
        if (typeof item === "string") this.textContent += item;
        else if (item) this.children.push(item);
      }
    },
    prepend(...items) {
      const els = items.filter((it) => it && typeof it !== "string");
      this.children.unshift(...els);
    },
    replaceChildren(...items) {
      this.children = [];
      this.textContent = "";
      this.append(...items);
    },
    focus() {},
  };
  return node;
}

test("createFacets implements commands, stageMenu, fallback status, empty center, edges:false, and conflict tooltips", async () => {
  let activeView = { view: "compass", preset: "roles" };
  const statusMessages = [];
  let settingsObj = {
    facetsPresets: [
      {
        id: "tri-quads",
        name: "Tri quads",
        source: "attribute",
        attribute: "Tag",
        layout: "quadrants",
        edges: false,
        categories: [
          { id: "alpha", label: "Alpha", values: ["A"] },
          { id: "beta", label: "Beta", values: ["B"] },
          { id: "gamma", label: "Gamma", values: ["C"] },
        ],
      },
    ],
  };

  const root = createMockNode("div", "compass-root");
  const world = createMockNode("div", "compass-world");
  const factsByUid = new Map();

  const ctx = {
    dom: { root, world },
    lifecycle: {
      node(el, parent) { parent.append(el); },
      event(target, type, fn) { target.addEventListener(type, fn); },
    },
    el: (tag, cls, txt) => createMockNode(tag, cls, txt),
    button: (cls, txt, label) => {
      const btn = createMockNode("button", cls, txt);
      if (label) btn.setAttribute("aria-label", label);
      return btn;
    },
    svg: (tag, cls) => createMockNode(tag, cls),
    guard: (fn) => (...args) => fn(...args),
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
    curve: (sx, sy, ex, ey) => ({ d: `M ${sx} ${sy} L ${ex} ${ey}` }),
    state: {
      get settings() { return settingsObj; },
    },
    features: {
      get(name) {
        if (name === "views") {
          return {
            current: () => activeView,
            async set(view, preset) { activeView = { view, preset: preset || "roles" }; },
          };
        }
        return null;
      },
    },
    facts: () => factsByUid,
    setStatus: (msg) => statusMessages.push(msg),
    render: () => {},
    fit: () => {},
    saveSetting: async () => {},
  };

  const facets = createFacets(ctx);

  // presets(), commands(), inactive stageMenu()
  assert.equal(facets.presets().length, 4);
  assert.equal(facets.classified(), null);
  assert.deepEqual(facets.stageMenu(), []);

  const cmds = facets.commands();
  assert.equal(cmds[0].id, "facets-edit");
  assert.equal(cmds[0].title, "Facets: edit presets");
  assert.ok(cmds.some((c) => c.id === "facets-preset-tri-quads" && c.title === "Facets: Tri quads"));

  //Inactive renderView returns null
  assert.equal(facets.renderView({ hood: { center: { uid: "c", title: "Center", kind: "page" }, nodes: [] }, settings: settingsObj }), null);

  // Switch via command
  await cmds.find((c) => c.id === "facets-preset-tri-quads").run();
  assert.deepEqual(activeView, { view: "facets", preset: "tri-quads" });

  const menu = facets.stageMenu();
  assert.ok(menu.some((m) => m.title === "✓ Facets preset: Tri quads"));
  assert.ok(menu.some((m) => m.title === "Facets preset: Local roles"));
  assert.equal(menu[menu.length - 1].title, "Edit presets…");

  // Empty center state
  const emptyRes = facets.renderView({
    hood: { center: { uid: "c", title: "Lonely Page", kind: "page" }, nodes: [{ uid: "g1", kind: "group", title: "Group" }] },
    settings: settingsObj,
  });
  assert.equal(emptyRes.view, "facets");
  assert.equal(emptyRes.geometry.items.length, 0);
  const layer = world.children[0];
  assert.ok(layer.children.some((ch) => ch.textContent === "Nothing is connected here yet."));

  // Fallback warning once per preset, edges: false, and conflicting card tooltip
  factsByUid.set("c", factOf({ uid: "c", title: "Hub", kind: "page" }, {}));
  factsByUid.set(
    "n1",
    factOf({ uid: "n1", title: "Dual Item", kind: "page", zone: "south", style: "typed" }, {
      tag: { values: [{ text: "A" }, { text: "B" }] },
    }),
  );
  const hoodWithConflict = {
    center: { uid: "c", title: "Hub", kind: "page" },
    nodes: [
      { uid: "n1", title: "Dual Item", kind: "page", zone: "south", style: "typed" },
      { uid: "grp", title: "Ignored group", kind: "group", zone: "south" },
    ],
  };

  const firstRender = facets.renderView({ hood: hoodWithConflict, settings: settingsObj });
  assert.equal(firstRender.geometry.nodes.length, 1);
  assert.deepEqual(statusMessages, ["Quadrants needs four categories. Showing a circle instead."]);
  // Second render of same preset does not repeat fallback notice
  facets.renderView({ hood: hoodWithConflict, settings: settingsObj });
  assert.equal(statusMessages.length, 1);
  // edges: false draws no svg edges
  assert.equal(layer.children.some((ch) => ch.tagName === "SVG"), false);
  // Conflicting card tooltip names matched categories
  const conflictCard = layer.children.find((ch) => ch.dataset?.uid === "n1");
  assert.ok(conflictCard.title.includes("Alpha"));
  assert.ok(conflictCard.title.includes("Beta"));
  assert.notEqual(facets.classified(), null);

  // edges: true draws one .compass-edge-line per category region, none for Conflicting
  settingsObj.facetsPresets[0].edges = true;
  facets.renderView({ hood: hoodWithConflict, settings: settingsObj });
  const svgEl = layer.children.find((ch) => ch.tagName === "SVG");
  assert.ok(svgEl);
  assert.equal(svgEl.children.length, 3);
  assert.ok(svgEl.children.every((g) => g.children[0]?.classList?.contains("compass-edge-line")));

  facets.clearView();
  assert.equal(facets.classified(), null);
  assert.equal(layer.children.length, 0);
});
