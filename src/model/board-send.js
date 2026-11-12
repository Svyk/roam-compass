// Pure layout for "Send map to board". Compass coordinates become board slots.
// One slot is a card. Nothing here writes the graph.

export const SLOT_W = 300;
export const SLOT_H = 180;
export const PAD = 24;
export const TITLE_BAND = 60;
export const SEND_LIMIT = 45;
export const BASIC_LIMIT = 20;

const ROW_BAND = 16;
const COL_BAND = 36;
const STRENGTH = Object.freeze({ typed: 3, structural: 2, link: 1, mention: 1, sibling: 0 });

function finite(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function cardText(node) {
  if (!node || typeof node !== "object") return "";
  if (node.kind === "block") {
    const uid = typeof node.uid === "string" ? node.uid.trim() : "";
    if (!uid || uid.includes("(") || uid.includes(")")) return "";
    return `((${uid}))`;
  }
  const title = typeof node.title === "string" ? node.title.trim() : "";
  if (!title || title.includes("[") || title.includes("]")) return "";
  return `[[${title}]]`;
}

export function compassSectionTitle(title) {
  const name = typeof title === "string" && title.trim() ? title.trim() : "Map";
  return `${name} \u2014 Compass`;
}

export function placeBelow(cards) {
  const rects = [];
  for (const card of Array.isArray(cards) ? cards : []) {
    const rect = card?.rect;
    if (!rect || typeof rect !== "object") continue;
    const x = Number(rect.x);
    const y = Number(rect.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const h = Number(rect.h);
    rects.push({ x, y, h: Number.isFinite(h) ? h : 0 });
  }
  if (!rects.length) return { x: 40, y: 40 };
  let left = rects[0].x;
  let bottom = rects[0].y + rects[0].h;
  for (const rect of rects) {
    if (rect.x < left) left = rect.x;
    const end = rect.y + rect.h;
    if (end > bottom) bottom = end;
  }
  return { x: left, y: bottom + 40 };
}

export function addFailure(error) {
  const text = String(error?.message ?? error ?? "");
  if (/not a board/i.test(text)) return "That board could not be found.";
  return "Plexus Diagram could not add the card.";
}

export function sendSummary({ count, boardLabel, sectionTitle, arrows, basic, omitted } = {}) {
  const cards = count === 1 ? "card" : "cards";
  let text = `Adds ${count} ${cards} to ${boardLabel}`;
  if (sectionTitle) text += ` in a new section "${sectionTitle}"`;
  const arrowCount = Number(arrows) || 0;
  if (arrowCount > 0) {
    const word = arrowCount === 1 ? "arrow" : "arrows";
    text += `, with ${arrowCount} ${word} labelled by relation`;
  }
  text += ".";
  const leftOut = Number(omitted) || 0;
  if (leftOut > 0) {
    const word = leftOut === 1 ? "card was" : "cards were";
    text += ` ${leftOut} ${word} left out.`;
  }
  if (basic) text += " Each card is its own undo step.";
  return text;
}

function skipStyle(node) {
  return node?.style === "board" || node?.style === "card" || node?.style === "group" || node?.kind === "group";
}

function isSiblingNode(node) {
  if (!node) return false;
  if (node.zone === "siblings" || node.style === "sibling" || node.role === "sibling") return true;
  const items = Array.isArray(node.evidence) ? node.evidence : [];
  return items.length > 0 && items.every((item) => item?.kind === "sibling" || item?.role === "sibling");
}

function primaryEvidence(node) {
  const items = Array.isArray(node?.evidence) ? node.evidence : [];
  if (!items.length) return [];
  let top = 0;
  for (const item of items) {
    const score = STRENGTH[item?.kind] ?? 0;
    if (score > top) top = score;
  }
  return items.filter((item) => (STRENGTH[item?.kind] ?? 0) === top);
}

function directionOf(node) {
  if (isSiblingNode(node)) return null;
  const primary = primaryEvidence(node);
  if (primary.some((item) => item?.kind === "typed" && item.direction === "out")) return "out";
  if (primary.some((item) => item?.kind === "typed" && item.direction === "in")) return "in";
  if (primary.some((item) => item?.kind === "link")) return "out";
  if (primary.some((item) => item?.kind === "mention")) return "in";
  if (primary.some((item) => item?.role === "child" || item?.role === "next")) return "out";
  if (primary.some((item) => item?.role === "parent" || item?.role === "previous")) return "in";
  if (primary.some((item) => item?.direction === "out")) return "out";
  if (primary.some((item) => item?.direction === "in")) return "in";
  if (node?.zone === "north") return "in";
  if (node?.zone === "south" || node?.zone === "west" || node?.zone === "east") return "out";
  return "out";
}

function edgeLabel(node) {
  const primary = primaryEvidence(node);
  if (!primary.some((item) => item?.kind === "typed")) return "";
  return typeof node?.label === "string" ? node.label : "";
}

function edgeFor(centerUid, node) {
  const direction = directionOf(node);
  if (!direction || !node?.uid) return null;
  const label = edgeLabel(node);
  if (direction === "out") {
    return { fromUid: centerUid, toUid: node.uid, label, direction: "one" };
  }
  return { fromUid: node.uid, toUid: centerUid, label, direction: "one" };
}

function boxFor(geometry, uid, isCenter) {
  if (isCenter) {
    const center = geometry?.center;
    return { x: finite(center?.x, 0), y: finite(center?.y, 0) };
  }
  const items = Array.isArray(geometry?.items) ? geometry.items : [];
  const found = items.find((item) => item?.uid === uid);
  return { x: finite(found?.x, 0), y: finite(found?.y, 0) };
}

function zoneOf(node) {
  if (node?.zone === "north" || node?.zone === "south" || node?.zone === "west" || node?.zone === "east" || node?.zone === "siblings") {
    return node.zone;
  }
  return "south";
}

function groupBands(entries, key, band) {
  const sorted = [...entries].sort((a, b) => a.box[key] - b.box[key] || a.box.x - b.box.x || a.node.uid.localeCompare(b.node.uid));
  const groups = [];
  for (const entry of sorted) {
    let group = null;
    for (const candidate of groups) {
      if (Math.abs(candidate.at - entry.box[key]) <= band) {
        group = candidate;
        break;
      }
    }
    if (!group) {
      group = { at: entry.box[key], items: [] };
      groups.push(group);
    }
    group.items.push(entry);
  }
  return groups;
}

function groupRows(entries) {
  const rows = groupBands(entries, "y", ROW_BAND);
  for (const row of rows) {
    row.y = row.at;
    row.items.sort((a, b) => a.box.x - b.box.x || a.node.uid.localeCompare(b.node.uid));
  }
  return rows;
}

function groupCols(entries) {
  const cols = groupBands(entries, "x", COL_BAND);
  for (const col of cols) {
    col.x = col.at;
    col.items.sort((a, b) => a.box.y - b.box.y || a.node.uid.localeCompare(b.node.uid));
  }
  return cols;
}

function takenKey(col, row) {
  return `${col},${row}`;
}

function placeBand(entries, prefer, dir, axis, taken, slots) {
  if (!entries.length) return;
  const start = -Math.floor((entries.length - 1) / 2);
  const offsets = entries.map((_, index) => start + index);
  for (let step = 0; step < 48; step += 1) {
    const main = prefer + dir * step;
    const fits = offsets.every((offset) => {
      const col = axis === "row" ? offset : main;
      const row = axis === "row" ? main : offset;
      return !taken.has(takenKey(col, row));
    });
    if (!fits) continue;
    entries.forEach((entry, index) => {
      const offset = offsets[index];
      const col = axis === "row" ? offset : main;
      const row = axis === "row" ? main : offset;
      taken.add(takenKey(col, row));
      slots.set(entry.node.uid, { col, row });
    });
    return;
  }
  entries.forEach((entry, index) => {
    let col = axis === "row" ? offsets[index] : prefer + dir * 48;
    let row = axis === "row" ? prefer + dir * 48 : offsets[index];
    while (taken.has(takenKey(col, row))) {
      col += 1;
      if (col > (axis === "row" ? offsets[index] : prefer) + 70) {
        col = axis === "row" ? offsets[index] : prefer;
        row += 1;
      }
    }
    taken.add(takenKey(col, row));
    slots.set(entry.node.uid, { col, row });
  });
}

export function sendPlan(input = {}) {
  const center = input.center && typeof input.center === "object" ? input.center : {};
  const centerUid = typeof center.uid === "string" ? center.uid : "";
  const sectionTitle = compassSectionTitle(center.title);
  const empty = { width: 0, height: 0, cards: [], edges: [], omitted: 0, sectionTitle };
  if (!centerUid || !cardText(center)) return empty;

  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.trunc(input.limit)) : SEND_LIMIT;
  const geometry = input.geometry && typeof input.geometry === "object" ? input.geometry : {};
  const rawNodes = Array.isArray(input.nodes) ? input.nodes : [];
  const ranked = [];
  for (const node of rawNodes) {
    if (!node || typeof node.uid !== "string" || !node.uid || node.uid === centerUid) continue;
    if (skipStyle(node) || !cardText(node)) continue;
    const box = boxFor(geometry, node.uid, false);
    ranked.push({ node, box, dist: box.x * box.x + box.y * box.y });
  }
  ranked.sort((a, b) => a.dist - b.dist || a.node.uid.localeCompare(b.node.uid));
  const room = Math.max(0, limit - 1);
  const kept = ranked.slice(0, room);
  const omitted = ranked.length - kept.length;

  const buckets = { north: [], south: [], west: [], east: [], siblings: [] };
  for (const entry of kept) buckets[zoneOf(entry.node)].push(entry);

  const slots = new Map();
  const taken = new Set();
  slots.set(centerUid, { col: 0, row: 0 });
  taken.add(takenKey(0, 0));

  const north = groupRows(buckets.north).sort((a, b) => b.y - a.y);
  north.forEach((row, index) => placeBand(row.items, -(index + 1), -1, "row", taken, slots));
  const south = groupRows(buckets.south).sort((a, b) => a.y - b.y);
  south.forEach((row, index) => placeBand(row.items, index + 1, 1, "row", taken, slots));
  const west = groupCols(buckets.west).sort((a, b) => b.x - a.x);
  west.forEach((col, index) => placeBand(col.items, -(index + 1), -1, "col", taken, slots));
  const east = groupCols(buckets.east).sort((a, b) => a.x - b.x);
  east.forEach((col, index) => placeBand(col.items, index + 1, 1, "col", taken, slots));

  let maxCol = 0;
  for (const slot of slots.values()) if (slot.col > maxCol) maxCol = slot.col;
  const siblings = groupCols(buckets.siblings).sort((a, b) => a.x - b.x);
  siblings.forEach((col, index) => placeBand(col.items, maxCol + 1 + index, 1, "col", taken, slots));

  let minCol = 0;
  let maxSlotCol = 0;
  let minRow = 0;
  let maxRow = 0;
  for (const slot of slots.values()) {
    if (slot.col < minCol) minCol = slot.col;
    if (slot.col > maxSlotCol) maxSlotCol = slot.col;
    if (slot.row < minRow) minRow = slot.row;
    if (slot.row > maxRow) maxRow = slot.row;
  }
  const width = PAD * 2 + (maxSlotCol - minCol + 1) * SLOT_W;
  const height = PAD * 2 + TITLE_BAND + (maxRow - minRow + 1) * SLOT_H;
  const byUid = new Map([[centerUid, center]]);
  for (const entry of kept) byUid.set(entry.node.uid, entry.node);

  const placed = [];
  for (const [uid, slot] of slots) {
    placed.push({
      uid,
      slot,
      x: PAD + (slot.col - minCol) * SLOT_W,
      y: PAD + TITLE_BAND + (slot.row - minRow) * SLOT_H,
    });
  }
  placed.sort((a, b) => {
    if (a.uid === centerUid) return -1;
    if (b.uid === centerUid) return 1;
    return a.slot.row - b.slot.row || a.slot.col - b.slot.col || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);
  });

  const cards = placed.map((item) => ({
    uid: item.uid,
    text: cardText(byUid.get(item.uid)),
    x: item.x,
    y: item.y,
  }));
  const edges = [];
  for (const card of cards) {
    if (card.uid === centerUid) continue;
    const edge = edgeFor(centerUid, byUid.get(card.uid));
    if (edge) edges.push(edge);
  }
  return { width, height, cards, edges, omitted, sectionTitle };
}

export function cardsAt(cards, origin) {
  const x0 = finite(origin?.x, 0);
  const y0 = finite(origin?.y, 0);
  return (Array.isArray(cards) ? cards : []).map((card) => ({
    text: card.text,
    x: x0 + finite(card?.x, 0),
    y: y0 + finite(card?.y, 0),
  }));
}

export function edgesForAdded(plan, added) {
  const map = new Map();
  const rows = Array.isArray(added) ? added : [];
  const cards = Array.isArray(plan?.cards) ? plan.cards : [];
  cards.forEach((card, index) => {
    const uid = rows[index]?.uid;
    if (typeof uid === "string" && uid) map.set(card.uid, uid);
  });
  const edges = [];
  for (const edge of plan?.edges ?? []) {
    const from = map.get(edge.fromUid);
    const to = map.get(edge.toUid);
    if (!from || !to) continue;
    edges.push({
      from,
      to,
      label: typeof edge.label === "string" ? edge.label : "",
      direction: "one",
    });
  }
  return edges;
}

export function connectPayload(edges) {
  if (!Array.isArray(edges) || edges.length === 0) return null;
  if (edges.length === 1) return edges[0];
  return edges.slice(0, SEND_LIMIT);
}

export function centerCardUid(plan, added, centerUid) {
  const cards = Array.isArray(plan?.cards) ? plan.cards : [];
  const rows = Array.isArray(added) ? added : [];
  const index = cards.findIndex((card) => card?.uid === centerUid);
  if (index >= 0 && rows[index]?.uid) return rows[index].uid;
  return rows[0]?.uid ?? null;
}
