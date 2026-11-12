const DEFAULT_NODE = Object.freeze({ w: 180, h: 34 });
const DEFAULT_ROOT = Object.freeze({ w: 240, h: 56 });
const MORE_SIZE = Object.freeze({ w: 104, h: 26 });
const PARENT_COLUMNS = 3;
const BALANCED_PEER_CAP = 4;
const COL_GAP = 14;

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function cleanNodes(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item || typeof item.uid !== "string" || !item.uid || seen.has(item.uid)) continue;
    seen.add(item.uid);
    out.push(item);
  }
  return out;
}

function normalizeState(state) {
  return {
    folded: state?.folded instanceof Set ? state.folded : new Set(),
    opened: state?.opened instanceof Set ? state.opened : new Set(),
    limits: state?.limits instanceof Map ? state.limits : new Map(),
  };
}

function cloneState(state) {
  const norm = normalizeState(state);
  return {
    folded: new Set(norm.folded),
    opened: new Set(norm.opened),
    limits: new Map(norm.limits),
  };
}

function positiveInt(value, fallback, min = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.trunc(num));
}

function readLimit(limits, key, fallback) {
  const custom = limits.get(key);
  if (typeof custom === "number" && Number.isFinite(custom) && custom >= 0) return Math.trunc(custom);
  return fallback;
}

export function buildTree({
  root,
  children = [],
  parents = [],
  peers = [],
  childrenOf,
  state,
  generations = 2,
  maxChildren = 12,
  maxNodes = 300,
} = {}) {
  const rootUid = typeof root?.uid === "string" ? root.uid : "";
  const rootNode = {
    ...root,
    uid: rootUid,
    title: typeof root?.title === "string" && root.title ? root.title : rootUid,
    kind: root?.kind === "block" ? "block" : "page",
  };
  const normState = normalizeState(state);
  const genLimit = positiveInt(generations, 2, 1);
  const childCap = positiveInt(maxChildren, 12, 0);
  const nodeCap = positiveInt(maxNodes, 300, 1);
  const fetchChildren = typeof childrenOf === "function" ? childrenOf : () => [];

  const rootOcc = {
    key: rootUid,
    uid: rootUid,
    node: rootNode,
    depth: 0,
    parentKey: null,
    status: "open",
    children: [],
    childCount: 0,
    hidden: 0,
  };

  const expandedUids = new Set();
  const queue = [{ occ: rootOcc, ancestors: new Set() }];
  let count = 1;
  let truncated = false;

  for (let qIndex = 0; qIndex < queue.length; qIndex += 1) {
    const { occ, ancestors } = queue[qIndex];
    if (occ.depth > 0 && (ancestors.has(occ.uid) || expandedUids.has(occ.uid))) {
      occ.status = "repeat";
      occ.childCount = null;
      occ.children = [];
      occ.hidden = 0;
      continue;
    }

    const shouldOpen = occ.depth === 0
      || (occ.depth < genLimit ? !normState.folded.has(occ.key) : normState.opened.has(occ.key));

    if (!shouldOpen) {
      occ.status = "folded";
      occ.childCount = null;
      occ.children = [];
      occ.hidden = 0;
      continue;
    }

    if (occ.depth > 0 && truncated && count >= nodeCap) {
      occ.status = "folded";
      occ.childCount = null;
      occ.children = [];
      occ.hidden = 0;
      continue;
    }

    const kids = cleanNodes(occ.depth === 0 ? children : fetchChildren(occ.uid));
    occ.childCount = kids.length;

    if (occ.depth > 0 && kids.length === 0) {
      expandedUids.add(occ.uid);
      occ.status = "leaf";
      occ.children = [];
      occ.hidden = 0;
      continue;
    }

    const limit = readLimit(normState.limits, occ.key, childCap);
    const wanted = kids.slice(0, limit);
    const budget = Math.max(0, nodeCap - count);
    if (wanted.length > budget) truncated = true;
    const shown = wanted.slice(0, budget);

    if (occ.depth > 0 && shown.length === 0 && kids.length > 0) {
      occ.status = "folded";
      occ.children = [];
      occ.hidden = 0;
      continue;
    }

    expandedUids.add(occ.uid);
    occ.status = "open";
    occ.hidden = kids.length - shown.length;

    const nextAncestors = new Set(ancestors);
    if (occ.uid) nextAncestors.add(occ.uid);

    for (const childNode of shown) {
      const childOcc = {
        key: occ.key ? `${occ.key}/${childNode.uid}` : childNode.uid,
        uid: childNode.uid,
        node: childNode,
        depth: occ.depth + 1,
        parentKey: occ.key,
        status: "folded",
        children: [],
        childCount: null,
        hidden: 0,
      };
      occ.children.push(childOcc);
      count += 1;
      queue.push({ occ: childOcc, ancestors: nextAncestors });
    }
  }

  return {
    root: rootOcc,
    parents: cleanNodes(parents),
    peers: cleanNodes(peers),
    count,
    truncated,
  };
}

function measureSlot(slot, nodeSize, moreSize, vGap) {
  if (slot.kind === "more") {
    return { slot, ownH: moreSize.h, blockH: moreSize.h, childMeasures: [], childrenH: 0 };
  }
  const occ = slot.occ;
  const childSlots = occ.children.map((child) => ({ kind: "node", occ: child }));
  if (occ.hidden > 0) {
    childSlots.push({
      kind: "more",
      key: `${occ.key}#more`,
      uid: occ.uid,
      parentKey: occ.key,
      depth: occ.depth + 1,
      hidden: occ.hidden,
    });
  }
  const childMeasures = childSlots.map((child) => measureSlot(child, nodeSize, moreSize, vGap));
  const childrenH = childMeasures.length
    ? childMeasures.reduce((sum, m) => sum + m.blockH, 0) + (childMeasures.length - 1) * vGap
    : 0;
  const blockH = Math.max(nodeSize.h, childrenH);
  return { slot, ownH: nodeSize.h, blockH, childMeasures, childrenH };
}

function placeSide({
  rootKey,
  rootSize,
  nodeSize,
  moreSize,
  hGap,
  vGap,
  side,
  childOccurrences,
  extraMore,
  items,
  links,
}) {
  const sign = side === "left" ? -1 : 1;
  const topSlots = childOccurrences.map((occ) => ({ kind: "node", occ }));
  if (extraMore > 0) {
    topSlots.push({
      kind: "more",
      key: `${rootKey}#more`,
      uid: rootKey,
      parentKey: rootKey,
      depth: 1,
      hidden: extraMore,
    });
  }
  if (!topSlots.length) return;

  const measures = topSlots.map((slot) => measureSlot(slot, nodeSize, moreSize, vGap));
  const totalH = measures.reduce((sum, m) => sum + m.blockH, 0) + (measures.length - 1) * vGap;

  function emit(measure, blockTop, parentBox, parentKey) {
    const { slot, blockH, childMeasures, childrenH } = measure;
    const depth = slot.kind === "more" ? slot.depth : slot.occ.depth;
    const innerEdge = rootSize.w / 2 + depth * hGap + (depth - 1) * nodeSize.w;

    if (slot.kind === "more") {
      const w = Math.min(moreSize.w, nodeSize.w);
      const h = Math.min(moreSize.h, nodeSize.h);
      const x = sign * (innerEdge + w / 2);
      const y = blockTop + blockH / 2;
      const item = {
        key: slot.key,
        uid: slot.uid,
        parentKey: slot.parentKey,
        hidden: slot.hidden,
        kind: "more",
        zone: "south",
        x,
        y,
        w,
        h,
        depth,
        status: "more",
        side,
      };
      items.push(item);
      links.push({
        fromKey: parentKey,
        toKey: item.key,
        from: { x: parentBox.x + sign * (parentBox.w / 2), y: parentBox.y },
        to: { x: item.x - sign * (item.w / 2), y: item.y },
        side,
      });
      return;
    }

    const occ = slot.occ;
    const w = nodeSize.w;
    const h = nodeSize.h;
    const x = sign * (innerEdge + w / 2);
    const y = blockTop + blockH / 2;
    const item = {
      key: occ.key,
      uid: occ.uid,
      kind: "node",
      zone: "south",
      x,
      y,
      w,
      h,
      depth: occ.depth,
      status: occ.status,
      side,
    };
    items.push(item);
    links.push({
      fromKey: parentKey,
      toKey: item.key,
      from: { x: parentBox.x + sign * (parentBox.w / 2), y: parentBox.y },
      to: { x: item.x - sign * (item.w / 2), y: item.y },
      side,
    });

    if (!childMeasures.length) return;
    let cursor = childrenH < blockH ? y - childrenH / 2 : blockTop;
    for (const childMeasure of childMeasures) {
      emit(childMeasure, cursor, item, occ.key);
      cursor += childMeasure.blockH + vGap;
    }
  }

  const rootBox = { x: 0, y: 0, w: rootSize.w, h: rootSize.h };
  let cursor = -totalH / 2;
  for (const measure of measures) {
    emit(measure, cursor, rootBox, rootKey);
    cursor += measure.blockH + vGap;
  }
}

function boxesOverlap(a, b, padX = 0, padY = 0) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w + padX * 2
    && Math.abs(a.y - b.y) * 2 < a.h + b.h + padY * 2;
}

function rowWidth(count, itemW, gap) {
  return count > 0 ? count * itemW + (count - 1) * gap : 0;
}

function peerZone(peer) {
  if (peer?.zone === "east" || peer?.role === "challenger" || peer?.role === "next") return "east";
  return "west";
}

export function layoutTree(tree, options = {}) {
  const direction = options.direction === "left" || options.direction === "balanced" ? options.direction : "right";
  const nodeSize = {
    w: positiveInt(options.node?.w, DEFAULT_NODE.w, 20),
    h: positiveInt(options.node?.h, DEFAULT_NODE.h, 16),
  };
  const rootSize = {
    w: positiveInt(options.root?.w, DEFAULT_ROOT.w, 40),
    h: positiveInt(options.root?.h, DEFAULT_ROOT.h, 24),
  };
  const hGap = positiveInt(options.hGap, 56, 8);
  const vGap = positiveInt(options.vGap, 10, 2);
  const moreSize = {
    w: Math.min(MORE_SIZE.w, nodeSize.w),
    h: Math.min(MORE_SIZE.h, nodeSize.h),
  };

  const center = { x: 0, y: 0, w: rootSize.w, h: rootSize.h };
  const items = [];
  const links = [];
  const rootOcc = tree?.root;
  const rootKey = rootOcc?.key ?? "";
  const rootChildren = Array.isArray(rootOcc?.children) ? rootOcc.children : [];
  const rootHidden = positiveInt(rootOcc?.hidden, 0, 0);

  if (direction === "balanced") {
    const split = Math.ceil(rootChildren.length / 2);
    const rightChildren = rootChildren.slice(0, split);
    const leftChildren = rootChildren.slice(split);
    const rightMore = leftChildren.length === 0 ? rootHidden : 0;
    const leftMore = leftChildren.length > 0 ? rootHidden : 0;
    placeSide({
      rootKey,
      rootSize,
      nodeSize,
      moreSize,
      hGap,
      vGap,
      side: "right",
      childOccurrences: rightChildren,
      extraMore: rightMore,
      items,
      links,
    });
    placeSide({
      rootKey,
      rootSize,
      nodeSize,
      moreSize,
      hGap,
      vGap,
      side: "left",
      childOccurrences: leftChildren,
      extraMore: leftMore,
      items,
      links,
    });
  } else {
    placeSide({
      rootKey,
      rootSize,
      nodeSize,
      moreSize,
      hGap,
      vGap,
      side: direction,
      childOccurrences: rootChildren,
      extraMore: rootHidden,
      items,
      links,
    });
  }

  const peers = Array.isArray(tree?.peers) ? tree.peers : [];
  let peersOmitted = 0;

  if (peers.length > 0) {
    if (direction === "balanced") {
      const peerGap = Math.max(36, vGap * 3);
      if (peers.length <= BALANCED_PEER_CAP) {
        const width = rowWidth(peers.length, nodeSize.w, COL_GAP);
        const y = -(rootSize.h / 2 + peerGap + nodeSize.h / 2);
        const candidates = peers.map((peer, index) => ({
          key: `peer:${peer.uid}`,
          uid: peer.uid,
          kind: "node",
          zone: peerZone(peer),
          x: -width / 2 + index * (nodeSize.w + COL_GAP) + nodeSize.w / 2,
          y,
          w: nodeSize.w,
          h: nodeSize.h,
          depth: 1,
          status: "leaf",
          side: "north",
        }));
        const existing = [center, ...items];
        const collides = candidates.some((cand) => (
          existing.some((box) => boxesOverlap(cand, box, COL_GAP / 2, vGap))
        ));
        if (!collides) {
          for (const item of candidates) {
            items.push(item);
            links.push({
              fromKey: rootKey,
              toKey: item.key,
              from: { x: clamp(item.x, -rootSize.w / 2 + 16, rootSize.w / 2 - 16), y: -rootSize.h / 2 },
              to: { x: item.x, y: item.y + item.h / 2 },
              side: "north",
            });
          }
        } else {
          peersOmitted = peers.length;
        }
      } else {
        peersOmitted = peers.length;
      }
    } else {
      const peerSide = direction === "right" ? "left" : "right";
      const sign = peerSide === "left" ? -1 : 1;
      const peerX = sign * (rootSize.w / 2 + hGap + nodeSize.w / 2);
      const totalH = peers.length * nodeSize.h + (peers.length - 1) * vGap;
      peers.forEach((peer, index) => {
        const y = -totalH / 2 + nodeSize.h / 2 + index * (nodeSize.h + vGap);
        const item = {
          key: `peer:${peer.uid}`,
          uid: peer.uid,
          kind: "node",
          zone: peerZone(peer),
          x: peerX,
          y,
          w: nodeSize.w,
          h: nodeSize.h,
          depth: 1,
          status: "leaf",
          side: peerSide,
        };
        items.push(item);
        links.push({
          fromKey: rootKey,
          toKey: item.key,
          from: {
            x: sign * (rootSize.w / 2),
            y: clamp(item.y, -rootSize.h / 2 + 12, rootSize.h / 2 - 12),
          },
          to: {
            x: item.x - sign * (item.w / 2),
            y: item.y,
          },
          side: peerSide,
        });
      });
    }
  }

  const parents = Array.isArray(tree?.parents) ? tree.parents : [];
  if (parents.length > 0) {
    const usedCols = Math.min(PARENT_COLUMNS, parents.length);
    const maxHalfW = rowWidth(usedCols, nodeSize.w, COL_GAP) / 2;
    let bandMinY = -rootSize.h / 2;
    for (const existing of items) {
      if (Math.abs(existing.x) - existing.w / 2 <= maxHalfW + COL_GAP) {
        bandMinY = Math.min(bandMinY, existing.y - existing.h / 2);
      }
    }
    const parentGap = Math.max(40, vGap * 3.5);
    const rowStep = nodeSize.h + Math.max(12, vGap);
    const totalRows = Math.ceil(parents.length / PARENT_COLUMNS);
    parents.forEach((parent, index) => {
      const row = Math.floor(index / PARENT_COLUMNS);
      const col = index % PARENT_COLUMNS;
      const inRow = row === totalRows - 1 ? parents.length - row * PARENT_COLUMNS : PARENT_COLUMNS;
      const width = rowWidth(inRow, nodeSize.w, COL_GAP);
      const x = -width / 2 + col * (nodeSize.w + COL_GAP) + nodeSize.w / 2;
      const y = bandMinY - parentGap - nodeSize.h / 2 - row * rowStep;
      const item = {
        key: `parent:${parent.uid}`,
        uid: parent.uid,
        kind: "node",
        zone: "north",
        x,
        y,
        w: nodeSize.w,
        h: nodeSize.h,
        depth: 1,
        status: "leaf",
        side: "north",
      };
      items.push(item);
      const toX = clamp(item.x * 0.72, item.x - item.w / 2 + 24, item.x + item.w / 2 - 24);
      links.push({
        fromKey: rootKey,
        toKey: item.key,
        from: { x: clamp(toX, -rootSize.w / 2 + 16, rootSize.w / 2 - 16), y: -rootSize.h / 2 },
        to: { x: toX, y: item.y + item.h / 2 },
        side: "north",
      });
    });
  }

  let minX = -center.w / 2;
  let maxX = center.w / 2;
  let minY = -center.h / 2;
  let maxY = center.h / 2;
  for (const item of items) {
    minX = Math.min(minX, item.x - item.w / 2);
    maxX = Math.max(maxX, item.x + item.w / 2);
    minY = Math.min(minY, item.y - item.h / 2);
    maxY = Math.max(maxY, item.y + item.h / 2);
  }

  return {
    center,
    items,
    links,
    bounds: { minX, minY, maxX, maxY },
    peersOmitted,
  };
}

export function toggleFold(state, occurrence, generations = 2) {
  const next = cloneState(state);
  if (!occurrence || typeof occurrence.key !== "string" || !occurrence.key) return next;
  const depth = Number(occurrence.depth);
  if (!Number.isFinite(depth) || depth <= 0) return next;
  if (occurrence.status === "repeat" || occurrence.status === "leaf") return next;

  const genLimit = positiveInt(generations, 2, 1);
  const key = occurrence.key;
  const isOpen = occurrence.status === "open"
    ? true
    : occurrence.status === "folded"
      ? false
      : (depth < genLimit ? !next.folded.has(key) : next.opened.has(key));

  if (isOpen) {
    next.opened.delete(key);
    if (depth < genLimit) next.folded.add(key);
    else next.folded.delete(key);
  } else {
    next.folded.delete(key);
    if (depth >= genLimit) next.opened.add(key);
    else next.opened.delete(key);
  }
  return next;
}

function collectOccurrences(root) {
  const out = [];
  if (!root) return out;
  const stack = [root];
  while (stack.length > 0) {
    const cur = stack.pop();
    out.push(cur);
    const kids = Array.isArray(cur.children) ? cur.children : [];
    for (let i = kids.length - 1; i >= 0; i -= 1) {
      if (kids[i]) stack.push(kids[i]);
    }
  }
  return out;
}

export function expandGeneration(tree, state) {
  const next = cloneState(state);
  const all = collectOccurrences(tree?.root);
  const folded = all.filter((occ) => occ.depth > 0 && occ.status === "folded");
  if (!folded.length) return next;
  const minDepth = Math.min(...folded.map((occ) => occ.depth));
  for (const occ of folded) {
    if (occ.depth !== minDepth) continue;
    const wasInFolded = next.folded.delete(occ.key);
    if (!wasInFolded) next.opened.add(occ.key);
  }
  return next;
}

export function collapseGeneration(tree, state) {
  const next = cloneState(state);
  const all = collectOccurrences(tree?.root);
  const open = all.filter((occ) => occ.depth > 0 && occ.status === "open");
  if (!open.length) return next;
  const maxDepth = Math.max(...open.map((occ) => occ.depth));
  for (const occ of open) {
    if (occ.depth !== maxDepth) continue;
    const wasInOpened = next.opened.delete(occ.key);
    if (!wasInOpened) next.folded.add(occ.key);
  }
  return next;
}

function outlineItemFromOccurrence(occ) {
  const node = occ?.node;
  const uid = occ?.uid ?? node?.uid ?? "";
  return {
    uid,
    title: typeof node?.title === "string" && node.title ? node.title : uid,
    kind: node?.kind === "block" ? "block" : "page",
    label: typeof node?.label === "string" ? node.label : "",
    status: occ?.status ?? "leaf",
    children: Array.isArray(occ?.children) ? occ.children.map(outlineItemFromOccurrence) : [],
  };
}

function outlineItemFromParent(parent) {
  const uid = typeof parent?.uid === "string" ? parent.uid : "";
  return {
    uid,
    title: typeof parent?.title === "string" && parent.title ? parent.title : uid,
    kind: parent?.kind === "block" ? "block" : "page",
    label: typeof parent?.label === "string" ? parent.label : "",
    status: "leaf",
    children: [],
  };
}

export function treeOutline(tree) {
  if (!tree?.root) return null;
  return {
    root: outlineItemFromOccurrence(tree.root),
    parents: Array.isArray(tree.parents) ? tree.parents.map(outlineItemFromParent) : [],
  };
}
