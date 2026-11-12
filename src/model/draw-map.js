const SCALE = 1.4;
const GAP = 24;
const BOX_CAP = 120;
const FRAME_PAD = 16;
const SEPARATE_PASSES = 80;

function num(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function emptyPlan() {
  return { boxes: [], arrows: [], frames: [], omitted: 0 };
}

function linkText(node, linksOn) {
  if (node?.kind === "group") {
    const label = typeof node.title === "string" && node.title ? node.title : "Group";
    const count = Number.isFinite(node.count) ? node.count : 0;
    return `${label} (${count})`;
  }
  const title = typeof node?.title === "string" && node.title
    ? node.title
    : (typeof node?.uid === "string" ? node.uid : "");
  if (linksOn === false) return title;
  if (node?.kind === "block") return `((${node.uid}))`;
  if (!title.includes("[") && !title.includes("]")) return `[[${title}]]`;
  return title;
}

function scaledBox(box, fallbackW, fallbackH) {
  const w = num(box?.w, fallbackW) * SCALE;
  const h = num(box?.h, fallbackH) * SCALE;
  const cx = num(box?.x) * SCALE;
  const cy = num(box?.y) * SCALE;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function axisGap(a, b, axis) {
  const size = axis === "x" ? "w" : "h";
  const a0 = a[axis];
  const a1 = a0 + a[size];
  const b0 = b[axis];
  const b1 = b0 + b[size];
  if (a1 <= b0) return b0 - a1;
  if (b1 <= a0) return a0 - b1;
  return -(Math.min(a1, b1) - Math.max(a0, b0));
}

function separate(boxes) {
  for (let pass = 0; pass < SEPARATE_PASSES; pass += 1) {
    let moved = false;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const gx = axisGap(a, b, "x");
        const gy = axisGap(a, b, "y");
        if (gx >= GAP - 0.01 || gy >= GAP - 0.01) continue;
        const defX = GAP - gx;
        const defY = GAP - gy;
        const axis = defX <= defY ? "x" : "y";
        const size = axis === "x" ? "w" : "h";
        const deficit = axis === "x" ? defX : defY;
        const half = deficit / 2;
        const aCenter = a[axis] + a[size] / 2;
        const bCenter = b[axis] + b[size] / 2;
        if (aCenter < bCenter || (aCenter === bCenter && i < j)) {
          a[axis] -= half;
          b[axis] += half;
        } else {
          a[axis] += half;
          b[axis] -= half;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function hiddenSet(hidden) {
  if (hidden instanceof Set) return hidden;
  if (Array.isArray(hidden)) return new Set(hidden);
  return new Set();
}

function nodeMap(nodes) {
  const map = new Map();
  if (!Array.isArray(nodes)) return map;
  for (const node of nodes) {
    if (!node || typeof node.uid !== "string" || !node.uid || map.has(node.uid)) continue;
    map.set(node.uid, node);
  }
  return map;
}

function centerOwns(node) {
  if (!node || node.kind === "group") return true;
  if (node.style === "mention") return false;
  if (node.style === "link") return true;
  const evidence = Array.isArray(node.evidence) ? node.evidence : [];
  if (node.style === "typed") {
    let out = false;
    let inbound = false;
    for (const item of evidence) {
      if (item?.kind !== "typed") continue;
      if (item.direction === "out") out = true;
      if (item.direction === "in") inbound = true;
    }
    if (out) return true;
    if (inbound) return false;
    return !(node.role === "parent" || node.zone === "north");
  }
  if (node.style === "structural") {
    for (const item of evidence) {
      if (item?.kind !== "structural") continue;
      if (item.note === "page" || item.note === "parent block") return false;
      if (item.note === "namespace" && (node.role === "parent" || node.zone === "north")) return false;
    }
    return true;
  }
  if (node.role === "parent" || node.zone === "north") return false;
  return true;
}

function isSibling(node) {
  return node?.role === "sibling" || node?.zone === "siblings" || node?.style === "sibling";
}

function pushArrow(arrows, seen, from, to, label) {
  if (!from || !to || from === to) return;
  const key = `${from}\0${to}`;
  if (seen.has(key)) return;
  seen.add(key);
  arrows.push({ from, to, label: typeof label === "string" ? label : "" });
}

function compassArrows(boxes, byUid) {
  const arrows = [];
  const seen = new Set();
  const center = boxes.find((box) => box.center);
  if (!center) return arrows;
  for (const box of boxes) {
    if (box.center) continue;
    const node = box.node;
    const label = typeof node?.label === "string" ? node.label : "";
    if (isSibling(node)) {
      const via = typeof node?.via === "string" ? byUid.get(node.via) : "";
      pushArrow(arrows, seen, via, box.key, label);
      continue;
    }
    if (centerOwns(node)) pushArrow(arrows, seen, center.key, box.key, label);
    else pushArrow(arrows, seen, box.key, center.key, label);
  }
  return arrows;
}

function resolveTreeKey(occKey, uid, centerUid, centerKey, byKey, byUid) {
  if (uid === centerUid || occKey === centerUid) return centerKey;
  if (occKey && byKey.has(occKey)) return occKey;
  return byUid.get(uid) || "";
}

function mindmapArrows(tree, boxes, centerUid, centerKey) {
  const arrows = [];
  const seen = new Set();
  const byKey = new Set(boxes.map((box) => box.key));
  const byUid = new Map(boxes.map((box) => [box.uid, box.key]));
  const walk = (occ) => {
    if (!occ) return;
    const from = resolveTreeKey(occ.key, occ.uid, centerUid, centerKey, byKey, byUid);
    const children = Array.isArray(occ.children) ? occ.children : [];
    for (const child of children) {
      const to = resolveTreeKey(child?.key, child?.uid, centerUid, centerKey, byKey, byUid);
      pushArrow(arrows, seen, from, to, "");
      walk(child);
    }
  };
  if (tree?.root) walk(tree.root);
  const parents = Array.isArray(tree?.parents) ? tree.parents : [];
  for (const parent of parents) {
    const from = byUid.get(parent?.uid) || "";
    pushArrow(arrows, seen, from, centerKey, "");
  }
  return arrows;
}

function facetArrows(boxes) {
  const arrows = [];
  const seen = new Set();
  const center = boxes.find((box) => box.center);
  if (!center) return arrows;
  for (const box of boxes) {
    if (box.center) continue;
    pushArrow(arrows, seen, center.key, box.key, "");
  }
  return arrows;
}

function facetFrames(regions, boxes) {
  if (!Array.isArray(regions)) return [];
  const frames = [];
  for (const region of regions) {
    if (!region || typeof region !== "object") continue;
    const id = typeof region.id === "string" && region.id ? region.id : "";
    const name = (typeof region.name === "string" && region.name)
      || (typeof region.label === "string" && region.label)
      || id
      || "Region";
    let members = [];
    if (Array.isArray(region.members)) {
      const have = new Set(boxes.map((box) => box.key));
      members = region.members.filter((key) => typeof key === "string" && have.has(key));
    } else if (id) {
      members = boxes.filter((box) => !box.center && box.zone === id).map((box) => box.key);
    }
    const rw = num(region.w) * SCALE;
    const rh = num(region.h) * SCALE;
    let x = num(region.x) * SCALE - rw / 2;
    let y = num(region.y) * SCALE - rh / 2;
    let w = rw;
    let h = rh;
    for (const key of members) {
      const box = boxes.find((item) => item.key === key);
      if (!box) continue;
      const minX = Math.min(x, box.x - FRAME_PAD);
      const minY = Math.min(y, box.y - FRAME_PAD);
      const maxX = Math.max(x + w, box.x + box.w + FRAME_PAD);
      const maxY = Math.max(y + h, box.y + box.h + FRAME_PAD);
      x = minX;
      y = minY;
      w = maxX - minX;
      h = maxY - minY;
    }
    frames.push({ name, x, y, w, h, members });
  }
  return frames;
}

function publish(box) {
  return {
    key: box.key,
    uid: box.uid,
    text: box.text,
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    center: box.center === true,
    zone: box.zone || "",
  };
}

export function drawPlan({
  view,
  center,
  geometry,
  nodes,
  links,
  tree,
  hidden,
} = {}) {
  const mode = view === "mindmap" || view === "facets" ? view : "compass";
  const linksOn = links !== false;
  if (!center || typeof center.uid !== "string" || !center.uid) return emptyPlan();

  const centerUid = center.uid;
  const byNode = nodeMap(nodes);
  const hiddenUids = hiddenSet(hidden);
  const chosen = new Map();
  const items = Array.isArray(geometry?.items) ? geometry.items : [];
  for (const item of items) {
    if (!item || item.kind === "more" || item.kind === "chip") continue;
    const uid = item.uid;
    if (typeof uid !== "string" || !uid || uid === centerUid) continue;
    if (hiddenUids.has(uid) || !byNode.has(uid)) continue;
    const prev = chosen.get(uid);
    if (!prev || (prev.item.status === "repeat" && item.status !== "repeat")) {
      chosen.set(uid, { item, node: byNode.get(uid) });
    }
  }

  const centerGeom = geometry?.center && typeof geometry.center === "object"
    ? geometry.center
    : { x: 0, y: 0, w: 240, h: 56 };
  const centerPlaced = scaledBox(centerGeom, 240, 56);
  const centerBox = {
    key: `center:${centerUid}`,
    uid: centerUid,
    text: linkText(center, linksOn),
    ...centerPlaced,
    center: true,
    zone: "center",
    node: center,
  };

  const rest = [];
  for (const { item, node } of chosen.values()) {
    const placed = scaledBox(item, 180, 34);
    rest.push({
      key: typeof item.key === "string" && item.key ? item.key : item.uid,
      uid: node.uid,
      text: linkText(node, linksOn),
      ...placed,
      center: false,
      zone: typeof item.zone === "string" && item.zone ? item.zone : (node.zone || ""),
      node,
    });
  }
  rest.sort((a, b) => a.y - b.y || a.x - b.x || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const kept = rest.slice(0, BOX_CAP - 1);
  const omitted = rest.length - kept.length;
  const boxes = [centerBox, ...kept];
  separate(boxes);

  const byUid = new Map(boxes.map((box) => [box.uid, box.key]));
  let arrows = [];
  if (mode === "mindmap") arrows = mindmapArrows(tree, boxes, centerUid, centerBox.key);
  else if (mode === "facets") arrows = facetArrows(boxes);
  else arrows = compassArrows(boxes, byUid);

  const keptKeys = new Set(boxes.map((box) => box.key));
  arrows = arrows.filter((arrow) => keptKeys.has(arrow.from) && keptKeys.has(arrow.to));
  const frames = mode === "facets" ? facetFrames(geometry?.regions, boxes) : [];
  return {
    boxes: boxes.map(publish),
    arrows,
    frames,
    omitted,
  };
}
