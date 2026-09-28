import assert from "node:assert/strict";
import test from "node:test";

import { centerSize, layout, sideAt } from "../src/model/layout.js";

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
