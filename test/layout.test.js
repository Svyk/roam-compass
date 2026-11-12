import assert from "node:assert/strict";
import test from "node:test";

import { centerSize, layout, NODE, sideAt, SUB_H } from "../src/model/layout.js";

function hood(counts, overflow = {}) {
  const nodes = [];
  for (const [zone, count] of Object.entries(counts)) {
    for (let index = 0; index < count; index += 1) nodes.push({ uid: `${zone}-${index}`, zone });
  }
  return { center: { badges: [] }, nodes, overflow };
}

function overlaps(a, b) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
}

test("each side keeps its direction around the center", () => {
  const placed = layout(hood({ north: 2, south: 3, west: 2, east: 1, siblings: 2 }));
  const { center } = placed;
  const byZone = (zone) => placed.items.filter((item) => item.zone === zone);
  for (const item of byZone("north")) assert.ok(item.y + item.h / 2 < -center.h / 2);
  for (const item of byZone("south")) assert.ok(item.y - item.h / 2 > center.h / 2);
  for (const item of byZone("west")) assert.ok(item.x + item.w / 2 < -center.w / 2);
  for (const item of byZone("east")) assert.ok(item.x - item.w / 2 > center.w / 2);
  const eastEdge = Math.max(...byZone("east").map((item) => item.x + item.w / 2));
  for (const item of byZone("siblings")) assert.ok(item.x - item.w / 2 > eastEdge);
});

test("no two boxes overlap, even with crowded sides", () => {
  const placed = layout(hood({ north: 12, south: 12, west: 12, east: 12, siblings: 12 }));
  const boxes = [{ ...placed.center }, ...placed.items];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      assert.ok(!overlaps(boxes[i], boxes[j]), `${boxes[i].uid ?? "center"} overlaps ${boxes[j].uid}`);
    }
  }
});

test("a short lateral column hugs the center; a tall one clears the north and south grids", () => {
  const short = layout(hood({ north: 4, west: 2 }));
  const tall = layout(hood({ north: 4, west: 9 }));
  const x = (placed) => placed.items.find((item) => item.zone === "west").x;
  assert.ok(x(tall) < x(short));
});

test("layout is deterministic", () => {
  const input = hood({ north: 5, south: 7, west: 3, east: 3, siblings: 4 });
  assert.deepEqual(layout(input), layout(input));
});

test("outline rows grow the center and sit inside it", () => {
  const rows = [{ uid: "a", depth: 0 }, { uid: "b", depth: 1 }];
  const placed = layout(hood({ south: 1 }), { rows });
  assert.deepEqual(placed.center, { x: 0, y: 0, ...centerSize({ rows: 2 }) });
  for (const row of placed.rows) {
    assert.ok(row.y - row.h / 2 >= -placed.center.h / 2);
    assert.ok(row.y + row.h / 2 <= placed.center.h / 2);
  }
  const south = placed.items[0];
  assert.ok(south.y - south.h / 2 > placed.center.h / 2);
  const capped = layout(hood({}), { rows: Array.from({ length: 50 }, (_, i) => ({ uid: `r${i}`, depth: 0 })) });
  assert.equal(capped.rows.length, 40);
  assert.equal(capped.more, true);
});

test("overflow chips sit beyond the end of their side", () => {
  const placed = layout(hood({ north: 3, west: 2 }, { north: { shown: 3, total: 9 }, west: { shown: 2, total: 5 } }));
  const north = placed.chips.find((chip) => chip.zone === "north");
  const west = placed.chips.find((chip) => chip.zone === "west");
  const top = Math.min(...placed.items.filter((item) => item.zone === "north").map((item) => item.y - item.h / 2));
  assert.ok(north.y < top);
  assert.ok(west.x < 0);
});

test("sideAt splits the plane into four sides around the center", () => {
  const center = { w: 240, h: 56 };
  assert.equal(sideAt({ x: 0, y: 0 }, center), null);
  assert.equal(sideAt({ x: 10, y: -200 }, center), "north");
  assert.equal(sideAt({ x: -10, y: 200 }, center), "south");
  assert.equal(sideAt({ x: -400, y: 20 }, center), "west");
  assert.equal(sideAt({ x: 400, y: -20 }, center), "east");
});

test("sideAt with flip swaps west and east while keeping north and south", () => {
  const center = { w: 240, h: 56 };
  assert.equal(sideAt({ x: 0, y: 0 }, center, true), null);
  assert.equal(sideAt({ x: 10, y: -200 }, center, true), "north");
  assert.equal(sideAt({ x: -10, y: 200 }, center, true), "south");
  assert.equal(sideAt({ x: -400, y: 20 }, center, true), "east");
  assert.equal(sideAt({ x: 400, y: -20 }, center, true), "west");
});

test("defaults are unchanged when new options are false or empty", () => {
  const input = hood(
    { north: 4, south: 6, west: 2, east: 3, siblings: 2 },
    { north: { shown: 4, total: 8 }, west: { shown: 2, total: 5 } },
  );
  const plain = layout(input);
  const explicit = layout(input, { flip: false, oneSided: false, sub: {} });
  assert.deepEqual(explicit, plain);
  assert.equal("flip" in plain, false);
  assert.equal("oneSided" in plain, false);
});

test("flip mirrors west, east, and siblings items and chips without moving north or south", () => {
  const input = hood(
    { north: 3, south: 4, west: 2, east: 3, siblings: 2 },
    { north: { shown: 3, total: 6 }, west: { shown: 2, total: 4 }, east: { shown: 3, total: 5 }, siblings: { shown: 2, total: 4 } },
  );
  const base = layout(input);
  const flipped = layout(input, { flip: true });
  assert.equal(flipped.flip, true);

  for (let i = 0; i < base.items.length; i += 1) {
    const a = base.items[i];
    const b = flipped.items[i];
    assert.equal(b.uid, a.uid);
    assert.equal(b.y, a.y);
    assert.equal(b.w, a.w);
    assert.equal(b.h, a.h);
    if (a.zone === "north" || a.zone === "south") {
      assert.equal(b.x, a.x);
    } else {
      assert.equal(b.x, -a.x);
    }
  }

  for (const baseChip of base.chips) {
    const flippedChip = flipped.chips.find((c) => c.zone === baseChip.zone);
    assert.equal(flippedChip.y, baseChip.y);
    if (baseChip.zone === "north" || baseChip.zone === "south") {
      assert.equal(flippedChip.x, baseChip.x);
    } else {
      assert.equal(flippedChip.x, -baseChip.x);
    }
  }
});

test("oneSided stacks east below west with two row gaps, centers the shared column, and combines with flip", () => {
  const input = hood({ north: 3, south: 4, west: 2, east: 2, siblings: 2 });
  const single = layout(input, { oneSided: true });
  assert.equal(single.oneSided, true);

  const westItems = single.items.filter((item) => item.zone === "west");
  const eastItems = single.items.filter((item) => item.zone === "east");
  const sibItems = single.items.filter((item) => item.zone === "siblings");
  const sharedX = westItems[0].x;
  assert.ok(sharedX < 0);
  for (const item of [...westItems, ...eastItems]) assert.equal(item.x, sharedX);
  for (const item of sibItems) assert.ok(item.x > single.center.w / 2);

  const lastWestBottom = westItems[westItems.length - 1].y + westItems[westItems.length - 1].h / 2;
  const firstEastTop = eastItems[0].y - eastItems[0].h / 2;
  assert.equal(firstEastTop - lastWestBottom, 24);

  const blockTop = westItems[0].y - westItems[0].h / 2;
  const blockBottom = eastItems[eastItems.length - 1].y + eastItems[eastItems.length - 1].h / 2;
  assert.equal(blockTop + blockBottom, 0);

  const allSingle = [{ ...single.center }, ...single.items];
  for (let i = 0; i < allSingle.length; i += 1) {
    for (let j = i + 1; j < allSingle.length; j += 1) {
      assert.ok(!overlaps(allSingle[i], allSingle[j]));
    }
  }

  const singleFlipped = layout(input, { oneSided: true, flip: true });
  assert.equal(singleFlipped.oneSided, true);
  assert.equal(singleFlipped.flip, true);
  for (const item of singleFlipped.items.filter((item) => item.zone === "west" || item.zone === "east")) {
    assert.equal(item.x, -sharedX);
    assert.ok(item.x > 0);
  }
  const allFlipped = [{ ...singleFlipped.center }, ...singleFlipped.items];
  for (let i = 0; i < allFlipped.length; i += 1) {
    for (let j = i + 1; j < allFlipped.length; j += 1) {
      assert.ok(!overlaps(allFlipped[i], allFlipped[j]));
    }
  }
});

test("variable heights via sub align row edges and never overlap in any zone", () => {
  assert.equal(SUB_H, 20);
  const input = hood({ north: 5, south: 6, west: 3, east: 3, siblings: 3 });
  const sub = {
    "north-0": 3,
    "north-2": 1,
    "north-3": 4,
    "south-1": 4,
    "south-4": 2,
    "west-0": 4,
    "west-1": 3,
    "east-1": 5,
    "siblings-0": 2,
  };
  const placed = layout(input, { sub });
  const byUid = new Map(placed.items.map((item) => [item.uid, item]));
  assert.equal(byUid.get("north-0").h, NODE.h + 3 * SUB_H);
  assert.equal(byUid.get("north-1").h, NODE.h);
  assert.equal(byUid.get("south-1").h, NODE.h + 4 * SUB_H);

  // North row 0 items share bottom edge; row 1 sits above the tallest item in row 0.
  const n0Bottom = byUid.get("north-0").y + byUid.get("north-0").h / 2;
  const n1Bottom = byUid.get("north-1").y + byUid.get("north-1").h / 2;
  const n2Bottom = byUid.get("north-2").y + byUid.get("north-2").h / 2;
  assert.equal(n0Bottom, n1Bottom);
  assert.equal(n1Bottom, n2Bottom);
  const n0Top = byUid.get("north-0").y - byUid.get("north-0").h / 2;
  const n3Bottom = byUid.get("north-3").y + byUid.get("north-3").h / 2;
  assert.ok(n3Bottom < n0Top);

  // South row 0 items share top edge; row 1 sits below the tallest item in row 0.
  const s0Top = byUid.get("south-0").y - byUid.get("south-0").h / 2;
  const s1Top = byUid.get("south-1").y - byUid.get("south-1").h / 2;
  assert.equal(s0Top, s1Top);
  const s1Bottom = byUid.get("south-1").y + byUid.get("south-1").h / 2;
  const s4Top = byUid.get("south-4").y - byUid.get("south-4").h / 2;
  assert.ok(s4Top > s1Bottom);

  const boxes = [{ ...placed.center }, ...placed.items];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      assert.ok(!overlaps(boxes[i], boxes[j]), `${boxes[i].uid ?? "center"} overlaps ${boxes[j].uid}`);
    }
  }
});
