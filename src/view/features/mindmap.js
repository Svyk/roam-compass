import { hiddenUids } from "../../model/batch7.js";
import {
  buildTree,
  collapseGeneration,
  expandGeneration,
  layoutTree,
  toggleFold,
  treeOutline,
} from "../../model/mindmap.js";
import { buildNeighborhood, plexusRegionLabels } from "../../model/neighborhood.js";
import { SETTING_IDS } from "../../settings.js";

const EXPANDED_SOUTH = new Set(["south"]);

function emptyState() {
  return { folded: new Set(), opened: new Set(), limits: new Map() };
}

function findOccurrence(root, key) {
  if (!root || !key) return null;
  if (root.key === key) return root;
  const stack = [...(root.children ?? [])];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur) continue;
    if (cur.key === key) return cur;
    for (const kid of cur.children ?? []) stack.push(kid);
  }
  return null;
}

function placeElement(element, box) {
  element.style.width = `${box.w}px`;
  element.style.height = `${box.h}px`;
  element.style.transform = `translate(${box.x - box.w / 2}px, ${box.y - box.h / 2}px)`;
}

function chevronPath(status, side) {
  if (status === "open") return "M2.2 3.6 L5 6.6 L7.8 3.6";
  return side === "left" ? "M6.3 2.2 L3.3 5 L6.3 7.8" : "M3.7 2.2 L6.7 5 L3.7 7.8";
}

function buildChevron(ctx, status, side, count, label) {
  const btn = ctx.button("compass-mm-chevron", "", label);
  btn.textContent = "";
  const icon = ctx.svg("svg", "compass-mm-chevron-icon");
  icon.setAttribute("viewBox", "0 0 10 10");
  icon.setAttribute("width", "10");
  icon.setAttribute("height", "10");
  icon.setAttribute("aria-hidden", "true");
  const path = ctx.svg("path", "compass-mm-chevron-stroke");
  path.setAttribute("d", chevronPath(status, side));
  icon.append(path);

  const hasCount = typeof count === "number" && Number.isFinite(count) && count > 0;
  if (hasCount) {
    const num = ctx.el("span", "compass-mm-count", String(count));
    if (side === "left") btn.append(num, icon);
    else btn.append(icon, num);
  } else {
    btn.append(icon);
  }
  return btn;
}

function plexusApi() {
  const api = globalThis.window?.RoamPlexus;
  return api && api.apiVersion >= 1 ? api : null;
}

export function createMindMap(ctx) {
  if (!ctx) {
    return {
      name: "mindmap",
      tree: () => null,
      outline: () => null,
    };
  }

  const childCache = new Map();
  const stateByRoot = new Map();
  const itemEls = new Map();

  let layer = null;
  let edgesEl = null;
  let emptyEl = null;
  let lastTree = null;
  let lastDirection = null;
  let pendingFit = false;
  let lastNoticeKey = "";

  if (ctx.dom?.world) {
    layer = ctx.el("div", "compass-mindmap");
    layer.hidden = true;
    edgesEl = ctx.svg("svg", "compass-edges compass-mm-edges");
    edgesEl.setAttribute("width", "1");
    edgesEl.setAttribute("height", "1");
    emptyEl = ctx.el("p", "compass-mm-empty", "Nothing branches from here yet.");
    emptyEl.hidden = true;
    layer.append(edgesEl, emptyEl);
    ctx.lifecycle.node(layer, ctx.dom.world);
  }

  function isActive() {
    const views = ctx.features?.get?.("views");
    if (views?.current) return views.current()?.view === "mindmap";
    return ctx.state?.settings?.view === "mindmap";
  }

  function stateFor(rootUid) {
    if (!stateByRoot.has(rootUid)) stateByRoot.set(rootUid, emptyState());
    return stateByRoot.get(rootUid);
  }

  function currentGenerations(settings = ctx.state?.settings) {
    const raw = Number(settings?.mindmapGenerations);
    if (!Number.isFinite(raw)) return 2;
    return Math.min(5, Math.max(1, Math.trunc(raw)));
  }

  function currentDirection(settings = ctx.state?.settings) {
    const dir = settings?.mindmapDirection;
    return dir === "left" || dir === "balanced" ? dir : "right";
  }

  function childrenOf(uid, modelSettings) {
    if (childCache.has(uid)) return childCache.get(uid);
    let kids = [];
    try {
      const snap = ctx.host.snapshot(uid, modelSettings);
      if (snap && !snap.missing) {
        const sub = buildNeighborhood(snap, modelSettings, {
          expanded: EXPANDED_SOUTH,
          regionLabel: plexusRegionLabels(plexusApi()),
        });
        kids = sub.nodes.filter((node) => node.zone === "south");
      }
    } catch (error) {
      console.error("[compass] mindmap", error);
    }
    childCache.set(uid, kids);
    return kids;
  }

  function clearLayer() {
    for (const element of itemEls.values()) element.remove();
    itemEls.clear();
    if (edgesEl) edgesEl.replaceChildren();
    if (emptyEl) emptyEl.hidden = true;
    if (layer) layer.hidden = true;
    lastTree = null;
    lastDirection = null;
    pendingFit = false;
    lastNoticeKey = "";
  }

  function onSettings() {
    childCache.clear();
  }

  function clearView() {
    clearLayer();
  }

  function onClose() {
    childCache.clear();
    clearLayer();
  }

  function renderRootNode(center, box) {
    const key = center.uid;
    let element = itemEls.get(key);
    if (!element) {
      element = ctx.el("div");
      element.tabIndex = 0;
      element.setAttribute("role", "button");
      layer.append(element);
      itemEls.set(key, element);
    }
    element.className = "compass-node compass-node-center";
    element.dataset.uid = center.uid;
    element.dataset.key = key;
    element.dataset.zone = "center";
    element.dataset.kind = center.kind || "page";
    element.dataset.style = "center";
    element.title = center.title;
    element.setAttribute("aria-label", `Center: ${center.title}`);

    const sig = `center|${center.kind}|${center.title}`;
    if (element._mmSig !== sig) {
      element._mmSig = sig;
      const head = ctx.el("div", "compass-center-head");
      const kind = ctx.el("span", "compass-kind", center.kind === "block" ? "Block" : "Page");
      const title = ctx.el("span", "compass-node-title", center.title);
      head.append(kind, title);
      element.replaceChildren(head);
    }
    placeElement(element, box);
  }

  function renderItemNode(item, node, occ, isFaded) {
    let element = itemEls.get(item.key);
    if (!element) {
      element = ctx.el("div");
      element.tabIndex = 0;
      element.setAttribute("role", "button");
      layer.append(element);
      itemEls.set(item.key, element);
    }

    const isRepeat = item.status === "repeat";
    const classes = ["compass-node"];
    if (isRepeat) classes.push("compass-mm-repeat");
    if (isFaded) classes.push("compass-fade");
    element.className = classes.join(" ");

    const fullTitle = typeof node?.title === "string" && node.title ? node.title : item.uid;
    const visibleTitle = typeof node?.alias === "string" && node.alias ? node.alias : fullTitle;
    const relLabel = typeof node?.label === "string" && node.label ? node.label : "";
    const nodeKind = node?.kind === "block" ? "block" : "page";
    const nodeStyle = typeof node?.style === "string" && node.style ? node.style : "typed";

    element.dataset.uid = item.uid;
    element.dataset.key = item.key;
    element.dataset.zone = item.zone;
    element.dataset.kind = nodeKind;
    element.dataset.style = nodeStyle;
    element.dataset.status = item.status;
    element.dataset.side = item.side;

    if (isRepeat) {
      element.title = "Shown elsewhere in this map";
      element.setAttribute("aria-label", `${fullTitle} — Shown elsewhere in this map`);
    } else {
      const why = relLabel ? ` — ${relLabel}` : "";
      element.title = `${fullTitle}${why}`;
      element.setAttribute("aria-label", `${fullTitle}${why}`);
    }

    const isTreeBranch = Boolean(occ) && (item.status === "open" || item.status === "folded");
    const cachedKids = childCache.get(item.uid);
    const knownCount = occ?.childCount != null
      ? occ.childCount
      : (Array.isArray(cachedKids) ? cachedKids.length : null);

    const sig = `${visibleTitle}|${item.status}|${item.side}|${isTreeBranch ? 1 : 0}|${knownCount ?? ""}`;
    if (element._mmSig !== sig) {
      element._mmSig = sig;
      const titleSpan = ctx.el("span", "compass-node-title", visibleTitle);
      if (isTreeBranch) {
        const expanded = item.status === "open";
        const label = expanded ? `Fold ${fullTitle}` : `Expand ${fullTitle}`;
        const chev = buildChevron(ctx, item.status, item.side, knownCount, label);
        chev.tabIndex = -1;
        chev.dataset.key = item.key;
        chev.setAttribute("aria-expanded", expanded ? "true" : "false");
        if (item.side === "left") element.replaceChildren(chev, titleSpan);
        else element.replaceChildren(titleSpan, chev);
      } else if (isRepeat) {
        const mark = ctx.el("span", "compass-mm-repeat-mark", "↺");
        mark.setAttribute("aria-hidden", "true");
        if (item.side === "left") element.replaceChildren(mark, titleSpan);
        else element.replaceChildren(titleSpan, mark);
      } else {
        element.replaceChildren(titleSpan);
      }
    }

    placeElement(element, item);
  }

  function renderMoreItem(item) {
    let element = itemEls.get(item.key);
    if (!element) {
      element = ctx.button("compass-mm-more", "", "Show more children");
      layer.append(element);
      itemEls.set(item.key, element);
    }
    element.className = "compass-mm-more";
    element.dataset.key = item.key;
    element.dataset.parentKey = item.parentKey ?? "";
    const text = `+${item.hidden} more`;
    if (element.textContent !== text) element.textContent = text;
    placeElement(element, item);
  }

  function computeHiddenSet(drawnNodes, hood) {
    const base = hiddenUids(drawnNodes, ctx.state?.lens);
    const piped = ctx.features?.pipe ? ctx.features.pipe("hiddenUids", base, hood) : base;
    const set = new Set(Array.isArray(piped) ? piped : base);
    const fromLenses = ctx.features?.get?.("lenses")?.hiddenFor?.(drawnNodes);
    if (fromLenses && typeof fromLenses[Symbol.iterator] === "function") {
      for (const uid of fromLenses) set.add(uid);
    }
    return set;
  }

  function renderView({ hood, settings, navigate }) {
    if (!isActive() || !hood?.center || !layer) return null;

    layer.hidden = false;
    const rootUid = hood.center.uid;
    const generations = currentGenerations(settings);
    const direction = currentDirection(settings);
    if (!navigate && lastDirection !== null && lastDirection !== direction) {
      pendingFit = true;
    }
    lastDirection = direction;

    let children = hood.nodes.filter((node) => node.zone === "south");
    if (hood.overflow?.south && ctx.state?.snapshot) {
      let fullHood = buildNeighborhood(ctx.state.snapshot, settings?.model, {
        expanded: EXPANDED_SOUTH,
        regionLabel: plexusRegionLabels(plexusApi()),
      });
      if (ctx.features?.pipe) fullHood = ctx.features.pipe("transformHood", fullHood);
      children = fullHood.nodes.filter((node) => node.zone === "south");
    }
    const parents = hood.nodes.filter((node) => node.zone === "north");
    const peers = hood.nodes.filter((node) => node.zone === "west" || node.zone === "east");

    const built = buildTree({
      root: hood.center,
      children,
      parents,
      peers,
      childrenOf: (uid) => childrenOf(uid, settings?.model),
      state: stateFor(rootUid),
      generations,
    });
    lastTree = built;

    const placed = layoutTree(built, { direction });

    const occByKey = new Map();
    const walkOcc = (occ) => {
      occByKey.set(occ.key, occ);
      for (const child of occ.children) walkOcc(child);
    };
    walkOcc(built.root);

    const nodeByKey = new Map();
    for (const [key, occ] of occByKey) {
      if (occ.depth > 0) nodeByKey.set(key, occ.node);
    }
    for (const parent of built.parents) nodeByKey.set(`parent:${parent.uid}`, parent);
    for (const peer of built.peers) nodeByKey.set(`peer:${peer.uid}`, peer);

    const drawnNodes = [];
    const seenNodeUids = new Set();
    for (const item of placed.items) {
      if (item.kind !== "node") continue;
      const node = nodeByKey.get(item.key);
      if (!node || seenNodeUids.has(node.uid)) continue;
      seenNodeUids.add(node.uid);
      drawnNodes.push(node);
    }

    const hidden = computeHiddenSet(drawnNodes, hood);

    const keepKeys = new Set([hood.center.uid]);
    for (const item of placed.items) keepKeys.add(item.key);
    for (const [key, element] of itemEls) {
      if (keepKeys.has(key)) continue;
      element.remove();
      itemEls.delete(key);
    }

    renderRootNode(hood.center, placed.center);
    for (const item of placed.items) {
      if (item.kind === "more") {
        renderMoreItem(item);
      } else {
        const node = nodeByKey.get(item.key);
        const occ = occByKey.get(item.key) ?? null;
        renderItemNode(item, node, occ, hidden.has(item.uid));
      }
    }

    edgesEl.replaceChildren();
    const itemByKey = new Map(placed.items.map((item) => [item.key, item]));
    for (const link of placed.links) {
      const targetItem = itemByKey.get(link.toKey);
      const targetNode = nodeByKey.get(link.toKey);
      const vertical = link.side === "north";
      const shape = ctx.curve(link.from.x, link.from.y, link.to.x, link.to.y, vertical);
      const group = ctx.svg("g", "compass-edge");
      if (targetItem?.uid) group.dataset.uid = targetItem.uid;
      if (targetNode?.style) group.dataset.style = targetNode.style;
      else if (targetItem?.kind === "more") group.dataset.style = "more";
      const path = ctx.svg("path", "compass-edge-line");
      path.setAttribute("d", shape.d);
      group.append(path);
      edgesEl.append(group);
    }

    const isEmptyRoot = built.root.children.length === 0 && built.parents.length === 0;
    emptyEl.hidden = !isEmptyRoot;
    const bounds = { ...placed.bounds };
    if (isEmptyRoot) {
      const emptyTop = placed.center.h / 2 + 24;
      emptyEl.style.transform = `translate(-50%, ${emptyTop}px)`;
      bounds.maxY = Math.max(bounds.maxY, emptyTop + 28);
      bounds.minX = Math.min(bounds.minX, -140);
      bounds.maxX = Math.max(bounds.maxX, 140);
    }

    if (built.truncated || placed.peersOmitted > 0) {
      const noticeKey = `${rootUid}:${built.truncated ? 1 : 0}:${placed.peersOmitted}`;
      if (noticeKey !== lastNoticeKey) {
        lastNoticeKey = noticeKey;
        const peerWord = placed.peersOmitted === 1 ? "peer" : "peers";
        if (built.truncated && placed.peersOmitted > 0) {
          ctx.setStatus(`Showing the first 300 nodes; ${placed.peersOmitted} ${peerWord} left out in balanced view.`);
        } else if (built.truncated) {
          ctx.setStatus("Showing the first 300 nodes.");
        } else {
          ctx.setStatus(`${placed.peersOmitted} ${peerWord} left out in balanced view.`);
        }
      }
    } else {
      lastNoticeKey = "";
    }

    const geometryItems = placed.items
      .filter((item) => item.kind === "node")
      .map((item) => ({
        key: item.key,
        uid: item.uid,
        zone: item.zone,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        depth: item.depth,
        status: item.status,
        side: item.side,
      }));

    return {
      view: "mindmap",
      geometry: {
        center: placed.center,
        items: geometryItems,
        rows: [],
        chips: [],
        more: false,
        bounds,
        nodes: drawnNodes,
      },
    };
  }

  function afterRender({ view }) {
    if (view === "mindmap" && pendingFit) {
      pendingFit = false;
      ctx.fit(true);
    }
  }

  function onStageClick(event) {
    if (!isActive() || !lastTree) return false;
    const target = event?.target;
    const chevron = target?.closest?.(".compass-mm-chevron");
    if (chevron) {
      event.preventDefault?.();
      const occ = findOccurrence(lastTree.root, chevron.dataset?.key);
      if (occ) {
        const rootUid = lastTree.root.uid;
        stateByRoot.set(rootUid, toggleFold(stateFor(rootUid), occ, currentGenerations()));
        ctx.render();
      }
      return true;
    }
    const moreBtn = target?.closest?.(".compass-mm-more");
    if (moreBtn) {
      event.preventDefault?.();
      const parentKey = moreBtn.dataset?.parentKey;
      if (parentKey) {
        const rootUid = lastTree.root.uid;
        const prev = stateFor(rootUid);
        const nextLimits = new Map(prev.limits);
        nextLimits.set(parentKey, (nextLimits.get(parentKey) ?? 12) + 12);
        stateByRoot.set(rootUid, {
          folded: new Set(prev.folded),
          opened: new Set(prev.opened),
          limits: nextLimits,
        });
        ctx.render();
      }
      return true;
    }
    return false;
  }

  function onStageDoubleClick(event) {
    if (!isActive()) return false;
    if (event?.target?.closest?.(".compass-mm-chevron, .compass-mm-more")) {
      event.preventDefault?.();
      return true;
    }
    return false;
  }

  function onKey(event) {
    if (!isActive() || !lastTree) return false;
    if (!event?.altKey || event.key !== "Enter" || event.metaKey || event.ctrlKey || event.shiftKey) {
      return false;
    }
    const activeEl = globalThis.document?.activeElement;
    const nodeEl = activeEl?.closest?.(".compass-node") ?? event.target?.closest?.(".compass-node");
    const key = nodeEl?.dataset?.key;
    if (!key) return false;
    const occ = findOccurrence(lastTree.root, key);
    if (!occ) return false;
    if (occ.depth > 0 && (occ.status === "open" || occ.status === "folded")) {
      const rootUid = lastTree.root.uid;
      stateByRoot.set(rootUid, toggleFold(stateFor(rootUid), occ, currentGenerations()));
      ctx.render();
      itemEls.get(key)?.focus?.({ preventScroll: true });
    }
    return true;
  }

  function runExpand() {
    if (!lastTree) return;
    const rootUid = lastTree.root.uid;
    stateByRoot.set(rootUid, expandGeneration(lastTree, stateFor(rootUid)));
    ctx.render();
  }

  function runCollapse() {
    if (!lastTree) return;
    const rootUid = lastTree.root.uid;
    stateByRoot.set(rootUid, collapseGeneration(lastTree, stateFor(rootUid)));
    ctx.render();
  }

  async function setDirection(value) {
    lastDirection = value;
    pendingFit = false;
    await ctx.saveSetting(SETTING_IDS.mindmapDirection, value);
    ctx.render();
    ctx.fit(true);
  }

  function commands() {
    if (!isActive()) return [];
    return [
      { id: "mm-expand", title: "Mind Map: expand one generation", hint: "", run: () => runExpand() },
      { id: "mm-collapse", title: "Mind Map: collapse one generation", hint: "", run: () => runCollapse() },
      { id: "mm-right", title: "Mind Map: grow right", hint: "", run: () => setDirection("right") },
      { id: "mm-left", title: "Mind Map: grow left", hint: "", run: () => setDirection("left") },
      { id: "mm-balanced", title: "Mind Map: grow both sides", hint: "", run: () => setDirection("balanced") },
    ];
  }

  function stageMenu() {
    if (!isActive()) return [];
    return [
      { title: "Expand one generation", run: () => runExpand() },
      { title: "Collapse one generation", run: () => runCollapse() },
    ];
  }

  function tree() {
    return isActive() ? lastTree : null;
  }

  function outline() {
    return isActive() && lastTree ? treeOutline(lastTree) : null;
  }

  return {
    name: "mindmap",
    onSettings,
    renderView,
    afterRender,
    clearView,
    onClose,
    onStageClick,
    onStageDoubleClick,
    onKey,
    commands,
    stageMenu,
    tree,
    outline,
  };
}
