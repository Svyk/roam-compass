// x/y are the top-left. The origin is the center of the center card.
const NODE_W = 160;
const NODE_H = 36;
const GAP_X = 12;
const GAP_Y = 10;
const SIB_W = 120;
const SIB_H = 28;
const SOUTH_GAP = 28;

function compareNodes(a, b) {
  const at = String(a.title ?? "");
  const bt = String(b.title ?? "");
  if (at < bt) return -1;
  if (at > bt) return 1;
  const au = String(a.uid ?? "");
  const bu = String(b.uid ?? "");
  if (au < bu) return -1;
  if (au > bu) return 1;
  return 0;
}

function byZone(nodes, zone) {
  return nodes.filter((node) => node && node.zone === zone && node.uid != null).slice().sort(compareNodes);
}

function placeRow(items, y, w, h) {
  const count = items.length;
  if (!count) return [];
  const total = count * w + (count - 1) * GAP_X;
  const start = -total / 2;
  return items.map((node, index) => ({
    uid: node.uid,
    zone: node.zone,
    x: start + index * (w + GAP_X),
    y,
    w,
    h,
  }));
}

function placeColumn(items, x, w, h) {
  const count = items.length;
  if (!count) return [];
  const total = count * h + (count - 1) * GAP_Y;
  const start = -total / 2;
  return items.map((node, index) => ({
    uid: node.uid,
    zone: node.zone,
    x,
    y: start + index * (h + GAP_Y),
    w,
    h,
  }));
}

function placeSouth(origin, children, related, siblings) {
  const rows = [
    [children, NODE_W, NODE_H],
    [related, NODE_W, NODE_H],
    [siblings, SIB_W, SIB_H],
  ];
  const placed = [];
  let y = origin;
  let started = false;
  for (const [items, w, h] of rows) {
    if (!items.length) continue;
    if (started) y += SOUTH_GAP;
    placed.push(...placeRow(items, y, w, h));
    y += h;
    started = true;
  }
  return placed;
}

export function layout(nodes, options = {}) {
  const list = Array.isArray(nodes) ? nodes : [];
  const showOutline = options.showOutline === true;
  const parents = byZone(list, "parents");
  const friends = byZone(list, "friends");
  const challengers = byZone(list, "challengers");
  const children = byZone(list, "children");
  const related = byZone(list, "related");
  const siblings = byZone(list, "siblings");
  const outline = showOutline ? byZone(list, "outline") : [];
  const childrenTop = 80 + outline.length * (NODE_H + GAP_Y);
  return [
    ...placeRow(parents, -70 - NODE_H, NODE_W, NODE_H),
    ...placeColumn(friends, -200 - NODE_W, NODE_W, NODE_H),
    ...placeColumn(challengers, 200, NODE_W, NODE_H),
    ...outline.map((node, index) => ({
      uid: node.uid,
      zone: node.zone,
      x: -NODE_W / 2,
      y: 80 + index * (NODE_H + GAP_Y),
      w: NODE_W,
      h: NODE_H,
    })),
    ...placeSouth(childrenTop, children, related, siblings),
  ];
}

function nameList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function lensOf(lens) {
  const source = lens ?? {};
  return {
    keyword: String(source.keyword ?? "").trim().toLowerCase(),
    include: nameList(source.attributes?.include),
    exclude: nameList(source.attributes?.exclude),
    kinds: nameList(source.kinds?.include),
  };
}

function attributesFor(node, edges) {
  const incident = (edges ?? []).filter((edge) => edge.from === node.uid || edge.to === node.uid);
  const primary = incident.filter((edge) => edge.zone === node.zone && edge.kind === node.kind);
  const chosen = primary.length ? primary : incident;
  const names = [];
  for (const edge of chosen) {
    if (edge.attribute && !names.includes(edge.attribute)) names.push(edge.attribute);
  }
  return names;
}

function nodeVisible(node, edges, lens) {
  if (lens.keyword && !String(node.title ?? "").toLowerCase().includes(lens.keyword)) return false;
  if (lens.kinds.length && !lens.kinds.includes(node.kind)) return false;
  const names = attributesFor(node, edges);
  if (lens.include.length && !names.some((name) => lens.include.includes(name))) return false;
  if (lens.exclude.length && names.some((name) => lens.exclude.includes(name))) return false;
  return true;
}

function badgeVisible(badge, lens) {
  if (lens.include.length && !lens.include.includes(badge.attribute)) return false;
  if (lens.exclude.length && lens.exclude.includes(badge.attribute)) return false;
  return true;
}

function showOutlineOf(classified, nodes) {
  if (classified?.showOutline === true) return true;
  if (classified?.showOutline === false) return false;
  return nodes.some((node) => node.zone === "outline");
}

function endVisible(uid, visible, nodeUids) {
  if (visible.has(uid)) return true;
  return !nodeUids.has(uid);
}

export function applyLens(classified, lens, mode) {
  const source = classified ?? {};
  const nodes = source.nodes ?? [];
  const edges = source.edges ?? [];
  const rule = lensOf(lens);
  const visible = new Set();
  const hidden = new Set();
  for (const node of nodes) {
    if (nodeVisible(node, edges, rule)) visible.add(node.uid);
    else hidden.add(node.uid);
  }
  const showOutline = showOutlineOf(source, nodes);
  const badges = (source.badges ?? []).filter((badge) => badgeVisible(badge, rule));
  if (mode === "keep") {
    const previous = Array.isArray(source.layout) ? source.layout : layout(nodes, { showOutline });
    return {
      nodes: nodes.map((node) => (hidden.has(node.uid) ? { ...node, hidden: true } : { ...node })),
      edges: edges.map((edge) => ({ ...edge })),
      badges,
      overflow: source.overflow ?? {},
      layout: previous.map((item) => ({ ...item })),
    };
  }
  const kept = nodes.filter((node) => visible.has(node.uid));
  const nodeUids = new Set(nodes.map((node) => node.uid));
  const keptEdges = edges.filter((edge) => (
    endVisible(edge.from, visible, nodeUids) && endVisible(edge.to, visible, nodeUids)
  ));
  return {
    nodes: kept.map((node) => ({ ...node })),
    edges: keptEdges.map((edge) => ({ ...edge })),
    badges,
    overflow: source.overflow ?? {},
    layout: layout(kept, { showOutline }),
  };
}
