// Deterministic geometry. Coordinates are box centers; the center card sits at (0, 0).
export const NODE = Object.freeze({ w: 180, h: 34 });
export const SIBLING = Object.freeze({ w: 148, h: 28 });
export const ROW_H = 24;
export const SUB_H = 20;

const COL_GAP = 14;
const ROW_GAP = 12;
const V_GAP = 64;
const H_GAP = 72;
const CHIP_GAP = 22;
const HEADER_H = 56;
const BADGE_H = 24;
const MAX_ROWS = 40;

function nodeHeight(uid, baseH, sub) {
  const count = sub?.[uid];
  return typeof count === "number" && Number.isFinite(count) && count > 0
    ? baseH + count * SUB_H
    : baseH;
}

function gridWidth(count, columns, width) {
  const used = Math.min(count, columns);
  return used ? used * width + (used - 1) * COL_GAP : 0;
}

function grid(nodes, columns, direction, edge, sub) {
  const rows = Math.ceil(nodes.length / columns);
  const out = [];
  let cursor = edge;
  for (let row = 0; row < rows; row += 1) {
    const start = row * columns;
    const rowNodes = nodes.slice(start, start + columns);
    const inRow = rowNodes.length;
    const width = gridWidth(inRow, columns, NODE.w);
    let rowH = 0;
    for (const node of rowNodes) {
      const h = nodeHeight(node.uid, NODE.h, sub);
      if (h > rowH) rowH = h;
    }
    for (let column = 0; column < inRow; column += 1) {
      const node = rowNodes[column];
      const h = nodeHeight(node.uid, NODE.h, sub);
      out.push({
        uid: node.uid,
        zone: node.zone,
        x: -width / 2 + column * (NODE.w + COL_GAP) + NODE.w / 2,
        y: direction * (cursor + h / 2),
        w: NODE.w,
        h,
      });
    }
    cursor += rowH + ROW_GAP;
  }
  return out;
}

function column(nodes, x, top, size, gap, sub) {
  let cursor = top;
  return nodes.map((node) => {
    const h = nodeHeight(node.uid, size.h, sub);
    const item = {
      uid: node.uid,
      zone: node.zone,
      x,
      y: cursor + h / 2,
      w: size.w,
      h,
    };
    cursor += h + gap;
    return item;
  });
}

function columnHeight(nodes, size, gap, sub) {
  if (!nodes.length) return 0;
  let total = (nodes.length - 1) * gap;
  for (const node of nodes) total += nodeHeight(node.uid, size.h, sub);
  return total;
}

export function centerSize({ badges = 0, rows = 0, more = false } = {}) {
  const expanded = rows > 0 || more;
  const shown = Math.min(rows, MAX_ROWS) + (more ? 1 : 0);
  return {
    w: expanded ? 320 : 240,
    h: HEADER_H + (badges ? BADGE_H : 0) + (expanded ? shown * ROW_H + 8 : 0),
  };
}

export function layout(neighborhood, options = {}) {
  const nodes = Array.isArray(neighborhood?.nodes) ? neighborhood.nodes : [];
  const rowsIn = Array.isArray(options.rows) ? options.rows.slice(0, MAX_ROWS) : [];
  const more = rowsIn.length < (options.rows?.length ?? 0);
  const badges = neighborhood?.center?.badges?.length ?? 0;
  const size = centerSize({ badges, rows: rowsIn.length, more });
  const cw = size.w;
  const ch = size.h;
  const flip = options.flip === true;
  const oneSided = options.oneSided === true;
  const sub = options.sub && typeof options.sub === "object" ? options.sub : null;
  const zone = (name) => nodes.filter((node) => node.zone === name);
  const north = zone("north");
  const south = zone("south");
  const west = zone("west");
  const east = zone("east");
  const siblings = zone("siblings");
  const northColumns = 3;
  const southColumns = 4;

  const items = [
    ...grid(north, northColumns, -1, ch / 2 + V_GAP, sub),
    ...grid(south, southColumns, 1, ch / 2 + V_GAP, sub),
  ];
  const wideHalf = Math.max(
    cw / 2,
    gridWidth(north.length, northColumns, NODE.w) / 2,
    gridWidth(south.length, southColumns, NODE.w) / 2,
  );
  // A short lateral column fits between the north and south bands; a tall one moves outside them.
  const lateralX = (height) => {
    const half = height / 2;
    const clear = half <= ch / 2 + V_GAP - ROW_GAP;
    return (clear ? cw / 2 : wideHalf) + H_GAP + NODE.w / 2;
  };

  let eastOuter = 0;
  if (oneSided) {
    const westH = columnHeight(west, NODE, ROW_GAP, sub);
    const eastH = columnHeight(east, NODE, ROW_GAP, sub);
    const gapBetween = west.length && east.length ? ROW_GAP * 2 : 0;
    const sharedH = westH + gapBetween + eastH;
    const sharedClear = sharedH / 2 <= ch / 2;
    const sharedX = -((sharedClear ? cw / 2 : wideHalf) + H_GAP + NODE.w / 2);
    const sharedTop = -sharedH / 2;
    items.push(...column(west, sharedX, sharedTop, NODE, ROW_GAP, sub));
    const eastTop = west.length ? sharedTop + westH + gapBetween : sharedTop;
    items.push(...column(east, sharedX, eastTop, NODE, ROW_GAP, sub));
  } else {
    const westH = columnHeight(west, NODE, ROW_GAP, sub);
    const eastH = columnHeight(east, NODE, ROW_GAP, sub);
    const westX = -lateralX(westH);
    const eastX = lateralX(eastH);
    items.push(...column(west, westX, -westH / 2, NODE, ROW_GAP, sub));
    items.push(...column(east, eastX, -eastH / 2, NODE, ROW_GAP, sub));
    eastOuter = east.length ? eastX + NODE.w / 2 : 0;
  }

  const siblingX = Math.max(eastOuter, wideHalf) + H_GAP * 0.75 + SIBLING.w / 2;
  const siblingTop = -(ch / 2 + V_GAP + NODE.h);
  items.push(...column(siblings, siblingX, siblingTop, SIBLING, 8, sub));

  if (flip) {
    for (const item of items) {
      if (item.zone === "west" || item.zone === "east" || item.zone === "siblings") {
        item.x = item.x === 0 ? 0 : -item.x;
      }
    }
  }

  const rowTop = -ch / 2 + HEADER_H + (badges ? BADGE_H : 0);
  const rows = rowsIn.map((row, index) => ({
    uid: row.uid,
    depth: row.depth,
    x: 0,
    y: rowTop + ROW_H / 2 + index * ROW_H,
    w: cw - 16,
    h: ROW_H,
  }));

  const chips = [];
  const byZone = (name) => items.filter((item) => item.zone === name);
  for (const name of Object.keys(neighborhood?.overflow ?? {})) {
    const members = byZone(name);
    if (!members.length) continue;
    const top = Math.min(...members.map((item) => item.y - item.h / 2));
    const bottom = Math.max(...members.map((item) => item.y + item.h / 2));
    const x = members[0].zone === "north" || members[0].zone === "south" ? 0 : members[0].x;
    chips.push({ zone: name, x, y: name === "north" ? top - CHIP_GAP : bottom + CHIP_GAP });
  }

  let minX = -cw / 2;
  let maxX = cw / 2;
  let minY = -ch / 2;
  let maxY = ch / 2;
  for (const item of items) {
    minX = Math.min(minX, item.x - item.w / 2);
    maxX = Math.max(maxX, item.x + item.w / 2);
    minY = Math.min(minY, item.y - item.h / 2);
    maxY = Math.max(maxY, item.y + item.h / 2);
  }
  for (const chip of chips) {
    minY = Math.min(minY, chip.y - 12);
    maxY = Math.max(maxY, chip.y + 12);
  }

  const out = {
    center: { x: 0, y: 0, w: cw, h: ch },
    items,
    rows,
    more,
    chips,
    bounds: { minX, minY, maxX, maxY },
  };
  if (flip) out.flip = true;
  if (oneSided) out.oneSided = true;
  return out;
}

// Which side a point (world coordinates) falls on, for drag-to-reclassify.
export function sideAt(point, center, flip = false) {
  const halfW = center.w / 2;
  const halfH = center.h / 2;
  if (Math.abs(point.x) <= halfW && Math.abs(point.y) <= halfH) return null;
  const nx = point.x / (halfW + H_GAP);
  const ny = point.y / (halfH + V_GAP);
  if (Math.abs(ny) >= Math.abs(nx)) return ny < 0 ? "north" : "south";
  if (flip) return nx < 0 ? "east" : "west";
  return nx < 0 ? "west" : "east";
}
