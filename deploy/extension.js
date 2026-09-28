/* Compass v0.1.0 | MIT | generated; edit src/ */

// src/lifecycle.js
function isPromiseLike(value) {
  return value != null && typeof value.then === "function";
}
async function callSafely(disposer) {
  const result = disposer();
  if (isPromiseLike(result)) await result;
}
function createLifecycle() {
  let disposed = false;
  const disposers = [];
  const add = (disposer) => {
    if (typeof disposer !== "function") throw new TypeError("A disposer must be a function");
    if (disposed) {
      void callSafely(disposer).catch((error) => console.error("[compass] Late cleanup failed", error));
      return disposer;
    }
    disposers.push(disposer);
    return disposer;
  };
  return {
    get disposed() {
      return disposed;
    },
    add,
    async command(commandApi, config) {
      if (!commandApi?.addCommand || !commandApi?.removeCommand) {
        throw new TypeError("A command API with addCommand/removeCommand is required");
      }
      await commandApi.addCommand(config);
      add(() => commandApi.removeCommand({ label: config.label }));
    },
    event(target, type, listener, options) {
      target.addEventListener(type, listener, options);
      add(() => target.removeEventListener(type, listener, options));
      return listener;
    },
    interval(callback, delay, ...args) {
      const id = globalThis.setInterval(callback, delay, ...args);
      add(() => globalThis.clearInterval(id));
      return id;
    },
    timeout(callback, delay, ...args) {
      const id = globalThis.setTimeout(callback, delay, ...args);
      add(() => globalThis.clearTimeout(id));
      return id;
    },
    observer(observer, target, options) {
      observer.observe(target, options);
      add(() => observer.disconnect());
      return observer;
    },
    node(node, parent = globalThis.document?.body) {
      if (!parent) throw new Error("A parent node is required outside the browser");
      parent.append(node);
      add(() => node.remove());
      return node;
    },
    pullWatch(dataApi2, pattern, entity, callback) {
      if (!dataApi2?.addPullWatch || !dataApi2?.removePullWatch) {
        throw new TypeError("A Roam data API with addPullWatch/removePullWatch is required");
      }
      dataApi2.addPullWatch(pattern, entity, callback);
      add(() => dataApi2.removePullWatch(pattern, entity, callback));
      return callback;
    },
    async settingsPanel(extensionAPI, config) {
      await extensionAPI.settings.panel.create(config);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      const errors = [];
      for (const disposer of disposers.splice(0).reverse()) {
        try {
          await callSafely(disposer);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, "One or more extension cleanups failed");
    }
  };
}

// src/model/classify.js
var DEFAULTS = {
  parents: "Parent",
  children: "Child",
  friends: "Friend, Previous",
  challengers: "Challenger, Next",
  hidden: "Hidden"
};
var RELATION_ZONES = ["parents", "children", "friends", "challengers", "related", "siblings"];
var OUTLINE_CAP = 40;
var BADGE_CAP = 6;
function splitList(value) {
  const parts = Array.isArray(value) ? value : String(value).split(",");
  const titles = [];
  for (const part of parts) {
    const title = String(part).trim();
    if (title && !titles.includes(title)) titles.push(title);
  }
  return titles;
}
function readList(value, fallback) {
  if (value == null) return splitList(fallback);
  return splitList(value);
}
function readFlag(value, fallback) {
  if (value == null) return fallback;
  if (value === true || value === "on" || value === 1) return true;
  if (value === false || value === "off" || value === 0) return false;
  return Boolean(value);
}
function readMax(value) {
  if (value == null || value === "") return 24;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 24;
  return Math.floor(number);
}
function readSettings(settings) {
  const source = settings ?? {};
  return {
    parents: readList(source.parents, DEFAULTS.parents),
    children: readList(source.children, DEFAULTS.children),
    friends: readList(source.friends, DEFAULTS.friends),
    challengers: readList(source.challengers, DEFAULTS.challengers),
    hidden: new Set(readList(source.hidden, DEFAULTS.hidden)),
    maxPerZone: readMax(source.maxPerZone),
    showUntyped: readFlag(source.showUntyped, true),
    showSiblings: readFlag(source.showSiblings, true),
    showBadges: readFlag(source.showBadges, true),
    showOutline: readFlag(source.showOutline, false)
  };
}
function assignedZone(title, lists) {
  if (lists.children.includes(title)) return "children";
  if (lists.parents.includes(title)) return "parents";
  if (lists.friends.includes(title)) return "friends";
  if (lists.challengers.includes(title)) return "challengers";
  return null;
}
function isDenied(title) {
  return title === "Aliases" || title.startsWith("BT_attr");
}
function valueShape(value) {
  if (!value || typeof value !== "object") return "empty";
  if (typeof value.title === "string" && value.title.length > 0) return "page";
  if (value.vString != null && (value.string == null || value.string === "")) return "scalar";
  if (typeof value.string === "string") return "block";
  if (value.vString != null) return "scalar";
  return "empty";
}
function isScalarHarc(harc) {
  const values = harc.values ?? [];
  return values.length > 0 && values.every((value) => valueShape(value) === "scalar");
}
function copyLabels(labels) {
  if (!Array.isArray(labels)) return [];
  return labels.map((label) => ({
    attribute: label?.attribute ?? "",
    text: label?.text ?? ""
  }));
}
function indexTitles(fixture) {
  const pages = /* @__PURE__ */ new Map();
  const addTitle = (item) => {
    if (!item || typeof item !== "object") return;
    if (typeof item.uid !== "string" || typeof item.title !== "string" || !item.title) return;
    if (!pages.has(item.uid)) pages.set(item.uid, item.title);
  };
  addTitle(fixture.center);
  addTitle(fixture.namespaceParent);
  for (const item of fixture.outbound ?? []) addTitle(item);
  for (const item of fixture.inbound ?? []) addTitle(item);
  for (const item of fixture.pages ?? []) addTitle(item);
  for (const harc of fixture.harcs ?? []) {
    if (!harc) continue;
    addTitle(harc.attribute);
    addTitle(harc.entity);
    for (const entity of harc.entities ?? []) addTitle(entity);
    for (const item of harc.entityUids ?? []) {
      if (item && typeof item === "object") addTitle(item);
    }
    for (const value of harc.values ?? []) addTitle(value);
  }
  return pages;
}
function entityRecords(harc, pages) {
  const records = [];
  const push = (uid, title) => {
    if (typeof uid !== "string" || !uid) return;
    const resolved = title || pages.get(uid) || "";
    const existing = records.find((record) => record.uid === uid);
    if (existing) {
      if (!existing.title && resolved) existing.title = resolved;
      return;
    }
    records.push({ uid, title: resolved });
  };
  if (Array.isArray(harc.entities)) {
    for (const entity of harc.entities) push(entity?.uid, entity?.title);
  }
  if (harc.entity) push(harc.entity.uid, harc.entity.title);
  if (Array.isArray(harc.entityUids)) {
    for (const item of harc.entityUids) {
      if (item && typeof item === "object") push(item.uid, item.title);
      else push(item, "");
    }
  }
  return records;
}
function inversePlacement(title, lists) {
  if (lists.hidden.has(title)) return null;
  if (lists.children.includes(title)) return { zone: "parents", siblings: true };
  if (lists.parents.includes(title)) return { zone: "children", siblings: false };
  if (lists.friends.includes(title)) return { zone: "friends", siblings: false };
  if (lists.challengers.includes(title)) return { zone: "challengers", siblings: false };
  return null;
}
function capNodes(nodes, maxPerZone2) {
  const limits = {
    parents: maxPerZone2,
    children: maxPerZone2,
    friends: maxPerZone2,
    challengers: maxPerZone2,
    related: maxPerZone2,
    siblings: maxPerZone2,
    outline: OUTLINE_CAP
  };
  const counts = {};
  const kept = [];
  const overflow = {};
  for (const node of nodes) {
    const limit = limits[node.zone];
    if (limit == null) {
      kept.push(node);
      continue;
    }
    const seen = (counts[node.zone] ?? 0) + 1;
    counts[node.zone] = seen;
    if (seen <= limit) kept.push(node);
  }
  for (const zone of [...RELATION_ZONES, "outline"]) {
    const count = counts[zone] ?? 0;
    if (count > limits[zone]) overflow[zone] = count - limits[zone];
  }
  return { kept, overflow };
}
function classify(fixture) {
  const source = fixture ?? {};
  const centerUid = source.center?.uid ?? "";
  const lists = readSettings(source.settings);
  const pages = indexTitles(source);
  const nodes = [];
  const edges = [];
  const badges = [];
  const seen = /* @__PURE__ */ new Set();
  const edgeSeen = /* @__PURE__ */ new Set();
  function addNode(node) {
    if (!node?.uid || node.uid === centerUid || seen.has(node.uid)) return false;
    seen.add(node.uid);
    nodes.push({
      uid: node.uid,
      title: node.title ?? "",
      zone: node.zone,
      kind: node.kind
    });
    return true;
  }
  function addEdge(edge) {
    const key = [edge.from, edge.to, edge.zone, edge.kind, edge.attribute, edge.sourceUid].join("\0");
    if (edgeSeen.has(key)) return;
    edgeSeen.add(key);
    edges.push(edge);
  }
  for (const harc of source.harcs ?? []) {
    if (!harc?.attribute?.title) continue;
    if (!entityRecords(harc, pages).some((entity) => entity.uid === centerUid)) continue;
    const title = String(harc.attribute.title).trim();
    if (!title || lists.hidden.has(title)) continue;
    const assigned = assignedZone(title, lists);
    if (assigned == null && isDenied(title)) continue;
    if (isScalarHarc(harc)) {
      if (!lists.showBadges) continue;
      for (const value of harc.values ?? []) {
        if (badges.length >= BADGE_CAP) break;
        badges.push({ attribute: title, text: value.vString });
      }
      continue;
    }
    const zone = assigned ?? "related";
    for (const value of harc.values ?? []) {
      if (valueShape(value) !== "page" || value.uid === centerUid) continue;
      addNode({ uid: value.uid, title: value.title, zone, kind: "typed" });
      addEdge({
        from: centerUid,
        to: value.uid,
        zone,
        kind: "typed",
        attribute: title,
        sourceUid: harc.sourceUid ?? null,
        labels: copyLabels(harc.labels),
        writable: true
      });
    }
  }
  for (const harc of source.harcs ?? []) {
    if (!harc?.attribute?.title) continue;
    const values = harc.values ?? [];
    if (!values.some((value) => value?.uid === centerUid)) continue;
    const title = String(harc.attribute.title).trim();
    const placement = inversePlacement(title, lists);
    if (!placement) continue;
    const entities = entityRecords(harc, pages).filter((entity) => entity.uid !== centerUid);
    for (const entity of entities) {
      addNode({ uid: entity.uid, title: entity.title, zone: placement.zone, kind: "inverse" });
      addEdge({
        from: entity.uid,
        to: centerUid,
        zone: placement.zone,
        kind: "inverse",
        attribute: title,
        sourceUid: harc.sourceUid ?? null,
        labels: copyLabels(harc.labels),
        writable: false
      });
    }
    if (!placement.siblings || !lists.showSiblings) continue;
    const from = entities[0]?.uid;
    if (!from) continue;
    const entityUids = new Set(entities.map((entity) => entity.uid));
    for (const value of values) {
      if (valueShape(value) !== "page" || value.uid === centerUid || entityUids.has(value.uid)) continue;
      addNode({ uid: value.uid, title: value.title, zone: "siblings", kind: "inverse" });
      addEdge({
        from,
        to: value.uid,
        zone: "siblings",
        kind: "inverse",
        attribute: title,
        sourceUid: harc.sourceUid ?? null,
        labels: copyLabels(harc.labels),
        writable: false
      });
    }
  }
  if (lists.showUntyped) {
    for (const page of source.outbound ?? []) {
      if (!page?.uid || page.uid === centerUid) continue;
      if (!addNode({ uid: page.uid, title: page.title ?? "", zone: "children", kind: "link" })) continue;
      addEdge({
        from: centerUid,
        to: page.uid,
        zone: "children",
        kind: "link",
        attribute: null,
        sourceUid: null,
        labels: [],
        writable: false
      });
    }
    for (const page of source.inbound ?? []) {
      if (!page?.uid || page.uid === centerUid) continue;
      if (!addNode({ uid: page.uid, title: page.title ?? "", zone: "parents", kind: "mention" })) continue;
      addEdge({
        from: page.uid,
        to: centerUid,
        zone: "parents",
        kind: "mention",
        attribute: null,
        sourceUid: null,
        labels: [],
        writable: false
      });
    }
  }
  const namespaceParent = source.namespaceParent;
  if (namespaceParent?.uid && namespaceParent.uid !== centerUid) {
    const added = addNode({
      uid: namespaceParent.uid,
      title: namespaceParent.title ?? "",
      zone: "parents",
      kind: "namespace"
    });
    if (added) {
      addEdge({
        from: namespaceParent.uid,
        to: centerUid,
        zone: "parents",
        kind: "namespace",
        attribute: null,
        sourceUid: null,
        labels: [],
        writable: false
      });
    }
  }
  if (lists.showOutline) {
    for (const entry of source.outline ?? []) {
      if (!entry?.uid || entry.uid === centerUid) continue;
      addNode({
        uid: entry.uid,
        title: entry.string ?? entry.title ?? "",
        zone: "outline",
        kind: "outline"
      });
    }
  }
  const capped = capNodes(nodes, lists.maxPerZone);
  const keptIds = new Set(capped.kept.map((node) => node.uid));
  const keptEdges = edges.filter((edge) => (edge.from === centerUid || keptIds.has(edge.from)) && (edge.to === centerUid || keptIds.has(edge.to)));
  return { nodes: capped.kept, edges: keptEdges, badges, overflow: capped.overflow };
}

// src/model/layout.js
var NODE_W = 160;
var NODE_H = 36;
var GAP_X = 12;
var GAP_Y = 10;
var SIB_W = 120;
var SIB_H = 28;
var SOUTH_GAP = 28;
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
    h
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
    h
  }));
}
function placeSouth(origin, children, related, siblings) {
  const rows = [
    [children, NODE_W, NODE_H],
    [related, NODE_W, NODE_H],
    [siblings, SIB_W, SIB_H]
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
function layout(nodes, options = {}) {
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
      h: NODE_H
    })),
    ...placeSouth(childrenTop, children, related, siblings)
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
    kinds: nameList(source.kinds?.include)
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
function applyLens(classified, lens, mode) {
  const source = classified ?? {};
  const nodes = source.nodes ?? [];
  const edges = source.edges ?? [];
  const rule = lensOf(lens);
  const visible = /* @__PURE__ */ new Set();
  const hidden = /* @__PURE__ */ new Set();
  for (const node of nodes) {
    if (nodeVisible(node, edges, rule)) visible.add(node.uid);
    else hidden.add(node.uid);
  }
  const showOutline = showOutlineOf(source, nodes);
  const badges = (source.badges ?? []).filter((badge) => badgeVisible(badge, rule));
  if (mode === "keep") {
    const previous = Array.isArray(source.layout) ? source.layout : layout(nodes, { showOutline });
    return {
      nodes: nodes.map((node) => hidden.has(node.uid) ? { ...node, hidden: true } : { ...node }),
      edges: edges.map((edge) => ({ ...edge })),
      badges,
      overflow: source.overflow ?? {},
      layout: previous.map((item) => ({ ...item }))
    };
  }
  const kept = nodes.filter((node) => visible.has(node.uid));
  const nodeUids = new Set(nodes.map((node) => node.uid));
  const keptEdges = edges.filter((edge) => endVisible(edge.from, visible, nodeUids) && endVisible(edge.to, visible, nodeUids));
  return {
    nodes: kept.map((node) => ({ ...node })),
    edges: keptEdges.map((edge) => ({ ...edge })),
    badges,
    overflow: source.overflow ?? {},
    layout: layout(kept, { showOutline })
  };
}

// src/model/writes.js
var DEFAULTS2 = {
  parents: "Parent",
  children: "Child",
  friends: "Friend, Previous",
  challengers: "Challenger, Next"
};
var ZONE_ALIAS = {
  parents: "parents",
  north: "parents",
  children: "children",
  south: "children",
  friends: "friends",
  west: "friends",
  challengers: "challengers",
  east: "challengers",
  related: "related",
  southeast: "related"
};
function splitList2(value) {
  const parts = Array.isArray(value) ? value : String(value).split(",");
  const titles = [];
  for (const part of parts) {
    const title = String(part).trim();
    if (title && !titles.includes(title)) titles.push(title);
  }
  return titles;
}
function readList2(value, fallback) {
  if (value == null) return splitList2(fallback);
  return splitList2(value);
}
function directionLists(settings) {
  const source = settings ?? {};
  return {
    parents: readList2(source.parents, DEFAULTS2.parents),
    children: readList2(source.children, DEFAULTS2.children),
    friends: readList2(source.friends, DEFAULTS2.friends),
    challengers: readList2(source.challengers, DEFAULTS2.challengers)
  };
}
function canonicalZone(zone) {
  return ZONE_ALIAS[String(zone ?? "").trim().toLowerCase()] ?? null;
}
function attributeForZone(settings, zone, action) {
  if (!zone) return null;
  if (zone === "related") {
    const name = String(action?.attribute ?? "").trim();
    if (!name || name.includes("::") || name.includes(":harc")) return null;
    return name;
  }
  const list = directionLists(settings)[zone];
  if (!list?.length) return null;
  return list[0];
}
function allowedNames(settings, action) {
  const lists = directionLists(settings);
  const names = /* @__PURE__ */ new Set([
    ...lists.parents,
    ...lists.children,
    ...lists.friends,
    ...lists.challengers
  ]);
  const zone = canonicalZone(action?.toZone ?? action?.zone);
  if ((action?.type === "link" || action?.type === "relink") && zone === "related") {
    const extra = String(action.attribute ?? "").trim();
    if (extra) names.add(extra);
  }
  return names;
}
function isProtected(name) {
  return name === "Aliases" || typeof name === "string" && name.startsWith("BT_attr");
}
function stripClassTags(tail) {
  return String(tail ?? "").replace(/#\[\[\.[^[\]]*\]\]/g, " ").replace(/#\.[^\s,[\]]+/g, " ");
}
function parseBlock(sourceString) {
  const source = String(sourceString ?? "");
  const idx = source.indexOf("::");
  if (idx < 0) return { rawName: "", name: "", bare: false, refsOnly: false, refs: [] };
  const rawName = source.slice(0, idx).trim();
  const wrapped = rawName.match(/^\[\[(.+)\]\]$/);
  const name = wrapped ? wrapped[1] : rawName;
  const cleaned = stripClassTags(source.slice(idx + 2));
  const refs = [...cleaned.matchAll(/\[\[([^[\]]+)\]\]/g)].map((match) => match[1].trim());
  const leftover = cleaned.replace(/\[\[([^[\]]+)\]\]/g, " ").replace(/,/g, " ").trim();
  return {
    rawName,
    name,
    bare: cleaned.trim() === "",
    refsOnly: refs.length > 0 && leftover === "",
    refs
  };
}
function entityOnCenter(harc, centerUid) {
  const uids = [];
  const push = (uid) => {
    if (typeof uid === "string" && uid) uids.push(uid);
  };
  for (const entity of harc?.entities ?? []) push(entity?.uid);
  if (harc?.entity) push(harc.entity.uid);
  for (const item of harc?.entityUids ?? []) push(typeof item === "object" ? item?.uid : item);
  return uids.includes(centerUid);
}
function centerHarc(fixture, sourceUid) {
  return (fixture.harcs ?? []).find((harc) => harc?.sourceUid === sourceUid) ?? null;
}
function alreadyLinked(harc, title) {
  if ((harc.values ?? []).some((value) => value?.title === title)) return true;
  const parsed = parseBlock(harc.sourceString);
  if ((parsed.refsOnly || parsed.bare) && parsed.refs.includes(title)) return true;
  return String(harc.sourceString ?? "").trim() === `${parsed.rawName}:: [[${title}]]`;
}
function pageExists(fixture, title) {
  const found = [];
  const addTitle = (item) => {
    if (item?.title) found.push(item.title);
  };
  addTitle(fixture.center);
  addTitle(fixture.namespaceParent);
  for (const list of [fixture.outbound, fixture.inbound, fixture.pages]) {
    for (const item of list ?? []) addTitle(item);
  }
  for (const harc of fixture.harcs ?? []) {
    addTitle(harc?.attribute);
    addTitle(harc?.entity);
    for (const entity of harc?.entities ?? []) addTitle(entity);
    for (const value of harc?.values ?? []) addTitle(value);
  }
  return found.includes(title);
}
function attributeName(string) {
  const mark = String(string ?? "").indexOf("::");
  if (mark < 0) return null;
  let name = string.slice(0, mark).trim();
  const wrapped = name.match(/^\[\[(.+)\]\]$/);
  if (wrapped) name = wrapped[1];
  return name;
}
function forbidden(ops, allowed) {
  for (const op of ops) {
    const blob = `${op.string ?? ""}
${op.title ?? ""}`;
    if (blob.includes(":harc") || blob.includes(":entity/attrs") || blob.includes(":attr/proxy")) return true;
    const name = attributeName(op.string);
    if (name && isProtected(name) && !allowed.has(name)) return true;
  }
  return false;
}
function openUid(action) {
  return action.sourceUid ?? action.edge?.sourceUid ?? action.uid ?? action.valueUid ?? action.edge?.to ?? action.to ?? null;
}
function openOp(action) {
  const uid = openUid(action);
  if (!uid) return [];
  return [{ op: "open", uid }];
}
function actionKind(action) {
  return action.kind ?? action.edgeKind ?? action.edge?.kind ?? null;
}
function planLink(fixture, action) {
  const title = String(action.title ?? "").trim();
  const zone = canonicalZone(action.zone);
  const attr = attributeForZone(fixture.settings, zone, action);
  const centerUid = fixture.center?.uid;
  if (!title || !attr || !centerUid) return [];
  const group = (fixture.harcs ?? []).filter((harc) => harc && entityOnCenter(harc, centerUid) && harc.attribute?.title === attr);
  if (group.some((harc) => alreadyLinked(harc, title))) return [];
  const bare = group.find((harc) => harc.sourceUid && parseBlock(harc.sourceString).bare);
  if (bare) {
    return [{ op: "create", parentUid: bare.sourceUid, order: "last", string: `[[${title}]]` }];
  }
  const refs = group.find((harc) => harc.sourceUid && parseBlock(harc.sourceString).refsOnly);
  if (refs) {
    const parsed = parseBlock(refs.sourceString);
    const ops = [{ op: "update", uid: refs.sourceUid, string: `${parsed.rawName}::` }];
    for (const old of parsed.refs) {
      ops.push({ op: "create", parentUid: refs.sourceUid, order: "last", string: `[[${old}]]` });
    }
    ops.push({ op: "create", parentUid: refs.sourceUid, order: "last", string: `[[${title}]]` });
    return ops;
  }
  return [{ op: "create", parentUid: centerUid, order: "last", string: `${attr}:: [[${title}]]` }];
}
function withCreatePage(fixture, action, ops) {
  if (action.create !== true || !ops.length) return ops;
  const title = String(action.title ?? "").trim();
  if (!title || pageExists(fixture, title)) return ops;
  return [{ op: "create-page", title }, ...ops];
}
function withoutRef(refs, title, index, confident) {
  if (title) {
    const at = refs.indexOf(title);
    if (at >= 0) return refs.filter((_, i) => i !== at);
  }
  if (refs.length === 1 && confident) return [];
  if (Number.isInteger(index) && index >= 0 && index < refs.length) {
    return refs.filter((_, i) => i !== index);
  }
  return null;
}
function planUnlink(fixture, action, allowed) {
  const kind = actionKind(action);
  if (kind && kind !== "typed") return openOp(action);
  const harc = centerHarc(fixture, action.sourceUid);
  const centerUid = fixture.center?.uid;
  if (!harc || !entityOnCenter(harc, centerUid)) return openOp(action);
  const name = harc.attribute?.title ?? "";
  if (isProtected(name) && !allowed.has(name)) return openOp(action);
  const parsed = parseBlock(harc.sourceString);
  const values = harc.values ?? [];
  const index = values.findIndex((value2) => value2?.uid === action.valueUid);
  const value = index >= 0 ? values[index] : null;
  const childUid = action.valueBlockUid ?? (index >= 0 ? harc.valueSourceUids?.[index] : void 0);
  if (childUid && childUid !== harc.sourceUid) {
    const ops = [{ op: "delete", uid: childUid }];
    const remaining = values.filter((item) => item?.uid !== action.valueUid);
    if (remaining.length === 0 && parsed.bare) ops.push({ op: "delete", uid: harc.sourceUid });
    return ops;
  }
  if (parsed.refsOnly) {
    const remaining = withoutRef(
      parsed.refs,
      value?.title ?? action.title,
      index,
      Boolean(value) || values.length <= 1
    );
    if (remaining == null || remaining.length === parsed.refs.length) return [];
    if (remaining.length === 0) return [{ op: "delete", uid: harc.sourceUid }];
    if (remaining.length === 1) {
      return [{
        op: "update",
        uid: harc.sourceUid,
        string: `${parsed.rawName}:: [[${remaining[0]}]]`
      }];
    }
    const ops = [{ op: "update", uid: harc.sourceUid, string: `${parsed.rawName}::` }];
    for (const ref of remaining) {
      ops.push({ op: "create", parentUid: harc.sourceUid, order: "last", string: `[[${ref}]]` });
    }
    return ops;
  }
  if (parsed.bare && values.length <= 1 && (value || values.length === 1)) {
    return [{ op: "delete", uid: harc.sourceUid }];
  }
  return [];
}
function project(fixture, action, ops) {
  const harcs = [];
  for (const harc of fixture.harcs ?? []) {
    if (harc?.sourceUid !== action.sourceUid) {
      harcs.push(harc);
      continue;
    }
    if (ops.some((op) => op.op === "delete" && op.uid === harc.sourceUid)) continue;
    const update = ops.find((op) => op.op === "update" && op.uid === harc.sourceUid);
    const deleted = new Set(ops.filter((op) => op.op === "delete").map((op) => op.uid));
    const values = [];
    const sources = [];
    (harc.values ?? []).forEach((value, index) => {
      const sourceUid = harc.valueSourceUids?.[index];
      if (value?.uid === action.valueUid) return;
      if (sourceUid && deleted.has(sourceUid)) return;
      values.push(value);
      if (harc.valueSourceUids) sources.push(sourceUid);
    });
    harcs.push({
      ...harc,
      sourceString: update ? update.string : harc.sourceString,
      values,
      valueSourceUids: harc.valueSourceUids ? sources : harc.valueSourceUids
    });
  }
  return { ...fixture, harcs };
}
function planAnnotate(action, allowed) {
  const attribute = String(action.attribute ?? "").trim();
  if (!attribute || attribute.includes("::") || !action.sourceUid) return [];
  if (isProtected(attribute) && !allowed.has(attribute)) return [];
  const text = action.text == null ? "" : String(action.text).trim();
  const string = text ? `${attribute}:: ${text}` : `${attribute}::`;
  return [{ op: "create", parentUid: action.sourceUid, order: "last", string }];
}
function relinkTitle(fixture, action) {
  const given = String(action.title ?? "").trim();
  if (given) return given;
  const harc = centerHarc(fixture, action.sourceUid);
  const value = harc?.values?.find((item) => item?.uid === action.valueUid);
  return String(value?.title ?? "").trim();
}
function planWrite(fixture, action) {
  const source = fixture ?? {};
  if (!action || typeof action.type !== "string") return { ops: [] };
  const allowed = allowedNames(source.settings, action);
  let ops = [];
  if (action.type === "link") {
    ops = withCreatePage(source, action, planLink(source, action));
  } else if (action.type === "unlink") {
    ops = planUnlink(source, action, allowed);
  } else if (action.type === "open") {
    ops = openOp(action);
  } else if (action.type === "annotate") {
    ops = planAnnotate(action, allowed);
  } else if (action.type === "relink") {
    const zone = canonicalZone(action.toZone ?? action.zone);
    const title = relinkTitle(source, action);
    const linkAction = {
      type: "link",
      zone,
      title,
      attribute: action.attribute,
      create: action.create === true
    };
    if (!title || !attributeForZone(source.settings, zone, linkAction)) return { ops: [] };
    const unlinkOps = planUnlink(source, action, allowed);
    if (unlinkOps.some((op) => op.op === "open")) {
      ops = unlinkOps;
    } else if (centerHarc(source, action.sourceUid) && unlinkOps.length === 0) {
      ops = [];
    } else {
      const next = project(source, action, unlinkOps);
      ops = [...unlinkOps, ...withCreatePage(source, linkAction, planLink(next, linkAction))];
    }
  }
  if (forbidden(ops, allowed)) return { ops: [] };
  return { ops };
}

// src/host.js
var CENTER_PULL = `[
  :db/id
  :block/uid
  :node/title
  :block/string
  {:block/children [:block/uid :block/string :block/order]}
  {:block/refs [:block/uid :node/title]}
  {:harc/_e [
    :block/uid
    {:harc/a [:block/uid :node/title]}
    {:harc/v [:block/uid :node/title :block/string :harc/v-string]}
    {:harc/a-source [:block/uid :block/string]}
    {:harc/v-source [:block/uid]}
    {:harc/_e [
      :block/uid
      {:harc/a [:block/uid :node/title]}
      {:harc/v [:block/uid :node/title :block/string :harc/v-string]}
    ]}
  ]}
  {:harc/_v [
    :block/uid
    {:harc/e [:block/uid :node/title :block/string]}
    {:harc/a [:block/uid :node/title]}
    {:harc/v [:block/uid :node/title :block/string :harc/v-string]}
    {:harc/a-source [:block/uid :block/string]}
    {:harc/v-source [:block/uid]}
  ]}
]`;
var INBOUND_QUERY = `[:find ?uid ?title
 :in $ ?center
 :where
  [?b :block/refs ?center]
  [?b :block/page ?page]
  [(not= ?page ?center)]
  [?page :block/uid ?uid]
  [?page :node/title ?title]]`;
var SEARCH_RE = `[:find ?uid ?title
 :in $ ?pattern
 :where
  [?page :node/title ?title]
  [(re-pattern ?pattern) ?re]
  [(re-find ?re ?title)]
  [?page :block/uid ?uid]]`;
var SEARCH_INCLUDES = `[:find ?uid ?title
 :in $ ?needle
 :where
  [?page :node/title ?title]
  [(clojure.string/includes? ?title ?needle)]
  [?page :block/uid ?uid]]`;
var PROTECTED = [":harc", ":entity/attrs", ":attr/proxy"];
function roamApi() {
  const host = globalThis.window ?? globalThis;
  return host.roamAlphaAPI ?? globalThis.roamAlphaAPI ?? null;
}
function asList(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
function entityString(uid) {
  const escaped = String(uid).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `[:block/uid "${escaped}"]`;
}
function maxPerZone(settings) {
  const value = settings?.maxPerZone;
  if (value == null || value === "") return 24;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 24;
  return Math.floor(number);
}
function namespacePrefix(title) {
  if (typeof title !== "string") return null;
  const mark = title.lastIndexOf("/");
  if (mark <= 0) return null;
  const prefix = title.slice(0, mark).trim();
  return prefix || null;
}
function compareText(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
function labelText(node) {
  if (!node || typeof node !== "object") return "";
  if (node[":harc/v-string"] != null) return String(node[":harc/v-string"]);
  if (typeof node[":node/title"] === "string") return node[":node/title"];
  if (typeof node[":block/string"] === "string") return node[":block/string"];
  return "";
}
function annotationLabels(node) {
  const labels = [];
  for (const nested of asList(node?.[":harc/_e"])) {
    const attribute = asList(nested?.[":harc/a"])[0]?.[":node/title"];
    if (typeof attribute !== "string" || !attribute.trim()) continue;
    const name = attribute.trim();
    for (const value of asList(nested?.[":harc/v"])) {
      labels.push({ attribute: name, text: labelText(value) });
    }
  }
  return labels;
}
function valueRecord(node) {
  const uid = node?.[":block/uid"];
  if (typeof uid !== "string" || !uid) return null;
  if (typeof node[":node/title"] === "string" && node[":node/title"]) {
    return { uid, title: node[":node/title"] };
  }
  if (node[":harc/v-string"] != null && node[":block/string"] == null) {
    return { uid, vString: node[":harc/v-string"] };
  }
  if (typeof node[":block/string"] === "string") return { uid, string: node[":block/string"] };
  if (node[":harc/v-string"] != null) return { uid, vString: node[":harc/v-string"] };
  return { uid };
}
function remember(node, pages, blocks) {
  const uid = node?.[":block/uid"];
  if (typeof uid !== "string" || !uid) return null;
  if (typeof node[":node/title"] === "string") {
    pages.add(uid);
    return { uid, title: node[":node/title"] };
  }
  blocks.add(uid);
  const title = typeof node[":block/string"] === "string" ? node[":block/string"] : "";
  return { uid, title };
}
function trackValue(value, pages, blocks) {
  if (!value?.uid) return;
  if (value.title) pages.add(value.uid);
  else if (value.string != null) blocks.add(value.uid);
}
function harcRecord(node, entities, withLabels) {
  const uid = node?.[":block/uid"];
  const attributeNode = asList(node?.[":harc/a"])[0];
  const title = attributeNode?.[":node/title"];
  if (typeof uid !== "string" || !uid || typeof title !== "string" || !title.trim()) return null;
  const source = asList(node[":harc/a-source"])[0];
  const values = [];
  for (const value of asList(node[":harc/v"])) {
    const record = valueRecord(value);
    if (record) values.push(record);
  }
  const valueSourceUids = [];
  for (const item of asList(node[":harc/v-source"])) {
    if (typeof item?.[":block/uid"] === "string") valueSourceUids.push(item[":block/uid"]);
  }
  const entityUids = [];
  const entityRecords2 = [];
  for (const entity of entities) {
    if (!entity?.uid || entityUids.includes(entity.uid)) continue;
    entityUids.push(entity.uid);
    entityRecords2.push({ uid: entity.uid, title: entity.title || "" });
  }
  return {
    uid,
    entityUids,
    entities: entityRecords2,
    attribute: {
      uid: typeof attributeNode?.[":block/uid"] === "string" ? attributeNode[":block/uid"] : "",
      title: title.trim()
    },
    values,
    sourceUid: typeof source?.[":block/uid"] === "string" ? source[":block/uid"] : null,
    sourceString: typeof source?.[":block/string"] === "string" ? source[":block/string"] : "",
    valueSourceUids,
    labels: withLabels ? annotationLabels(node) : []
  };
}
function pageRows(rows, limit) {
  const found = [];
  const seen = /* @__PURE__ */ new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!Array.isArray(row)) continue;
    const uid = row[0];
    const title = row[1];
    if (typeof uid !== "string" || typeof title !== "string" || !uid || !title || seen.has(uid)) continue;
    seen.add(uid);
    found.push({ uid, title });
  }
  found.sort((a, b) => compareText(a.title, b.title) || compareText(a.uid, b.uid));
  return found.slice(0, limit == null ? found.length : limit);
}
function normalizePull(pulled, context = {}) {
  const uid = context.uid;
  const pages = context.pages instanceof Set ? context.pages : /* @__PURE__ */ new Set();
  const blocks = context.blocks instanceof Set ? context.blocks : /* @__PURE__ */ new Set();
  const center = { uid };
  if (typeof pulled?.[":node/title"] === "string" && uid) {
    center.title = pulled[":node/title"];
    pages.add(uid);
  } else if (pulled && uid) {
    blocks.add(uid);
  }
  if (typeof pulled?.[":block/string"] === "string") center.string = pulled[":block/string"];
  const centerEntity = [{ uid, title: center.title || center.string || "" }];
  const harcs = [];
  for (const node of asList(pulled?.[":harc/_e"])) {
    const record = harcRecord(node, centerEntity, true);
    if (!record) continue;
    for (const value of record.values) trackValue(value, pages, blocks);
    harcs.push(record);
  }
  for (const node of asList(pulled?.[":harc/_v"])) {
    const entities = [];
    for (const entityNode of asList(node?.[":harc/e"])) {
      const entity = remember(entityNode, pages, blocks);
      if (entity) entities.push(entity);
    }
    const record = harcRecord(node, entities, false);
    if (!record) continue;
    for (const value of record.values) trackValue(value, pages, blocks);
    harcs.push(record);
  }
  const outbound = [];
  const seenOut = /* @__PURE__ */ new Set();
  for (const ref of asList(pulled?.[":block/refs"])) {
    const refUid = ref?.[":block/uid"];
    const title = ref?.[":node/title"];
    if (typeof refUid !== "string" || refUid === uid || typeof title !== "string" || !title || seenOut.has(refUid)) {
      continue;
    }
    seenOut.add(refUid);
    pages.add(refUid);
    outbound.push({ uid: refUid, title });
  }
  const children = asList(pulled?.[":block/children"]).filter((child) => typeof child?.[":block/uid"] === "string");
  children.sort((a, b) => {
    const ao = Number.isFinite(a[":block/order"]) ? a[":block/order"] : Number.MAX_SAFE_INTEGER;
    const bo = Number.isFinite(b[":block/order"]) ? b[":block/order"] : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return compareText(a[":block/uid"], b[":block/uid"]);
  });
  const outline = children.map((child) => {
    blocks.add(child[":block/uid"]);
    return {
      uid: child[":block/uid"],
      string: typeof child[":block/string"] === "string" ? child[":block/string"] : "",
      order: Number.isFinite(child[":block/order"]) ? child[":block/order"] : 0
    };
  });
  for (const page of context.inbound ?? []) if (page?.uid) pages.add(page.uid);
  if (context.namespaceParent?.uid) pages.add(context.namespaceParent.uid);
  return {
    fixture: {
      center,
      harcs,
      outbound,
      inbound: context.inbound ?? [],
      outline,
      namespaceParent: context.namespaceParent ?? null,
      settings: context.settings ?? {}
    },
    pageUids: pages,
    blockUids: blocks
  };
}
function graphName() {
  const name = roamApi()?.graph?.name;
  return typeof name === "string" && name ? name : "graph";
}
function dataApi() {
  const data = roamApi()?.data;
  if (!data?.pull) throw new Error("roamAlphaAPI.data is unavailable");
  return data;
}
function lookupNamespace(data, title, centerUid, pages) {
  const prefix = namespacePrefix(title);
  if (!prefix) return null;
  try {
    const found = data.pull("[:block/uid :node/title]", [":node/title", prefix]);
    const foundUid = found?.[":block/uid"];
    const name = found?.[":node/title"];
    if (typeof foundUid !== "string" || !foundUid || foundUid === centerUid || typeof name !== "string" || !name) {
      return null;
    }
    pages.add(foundUid);
    return { uid: foundUid, title: name };
  } catch (error) {
    console.error("[compass] namespace lookup failed", error);
    return null;
  }
}
function lookupInbound(data, uid, pulled, limit, pages) {
  if (!data?.q) return [];
  let eid = pulled?.[":db/id"];
  if (typeof eid !== "number") {
    try {
      eid = data.pull("[:db/id]", [":block/uid", uid])?.[":db/id"];
    } catch (error) {
      console.error("[compass] inbound failed", error);
      return [];
    }
  }
  if (typeof eid !== "number") return [];
  try {
    const rows = data.q(INBOUND_QUERY, eid);
    const found = pageRows(rows, limit);
    for (const page of found) pages.add(page.uid);
    return found;
  } catch (error) {
    console.error("[compass] inbound failed", error);
    return [];
  }
}
async function pullFixture(uid, settings) {
  const data = dataApi();
  let pulled = null;
  try {
    pulled = data.pull(CENTER_PULL, [":block/uid", uid]);
  } catch (error) {
    console.error("[compass] pull failed", error);
    pulled = null;
  }
  const pages = /* @__PURE__ */ new Set();
  const blocks = /* @__PURE__ */ new Set();
  const inbound = lookupInbound(data, uid, pulled, maxPerZone(settings), pages);
  const title = typeof pulled?.[":node/title"] === "string" ? pulled[":node/title"] : null;
  const namespaceParent = lookupNamespace(data, title, uid, pages);
  const normalized = normalizePull(pulled, {
    uid,
    settings,
    inbound,
    namespaceParent,
    pages,
    blocks
  });
  return { ...normalized, missing: pulled == null };
}
function present(fixture) {
  const classified = classify(fixture);
  const showOutline = classified.nodes.some((node) => node.zone === "outline");
  return {
    fixture,
    classified,
    placed: layout(classified.nodes, { showOutline }),
    showOutline
  };
}
function isProtectedOp(op) {
  const blob = `${op?.string ?? ""}
${op?.title ?? ""}`;
  return PROTECTED.some((token) => blob.includes(token));
}
function editedSourceIds(fixture, ops) {
  const sources = /* @__PURE__ */ new Set();
  for (const harc of fixture?.harcs ?? []) if (harc?.sourceUid) sources.add(harc.sourceUid);
  const ids = /* @__PURE__ */ new Set();
  for (const op of ops ?? []) {
    if ((op.op === "update" || op.op === "delete") && sources.has(op.uid)) ids.add(op.uid);
    if (op.op === "create" && sources.has(op.parentUid)) ids.add(op.parentUid);
  }
  return [...ids];
}
async function sourcesStale(fixture, ops) {
  const data = dataApi();
  for (const uid of editedSourceIds(fixture, ops)) {
    const harc = (fixture.harcs ?? []).find((item) => item?.sourceUid === uid);
    if (!harc) continue;
    let pulled = null;
    try {
      pulled = data.pull("[:block/uid :block/string]", [":block/uid", uid]);
    } catch (error) {
      console.error("[compass] source pull failed", error);
      return true;
    }
    if (pulled == null || pulled[":block/string"] !== harc.sourceString) return true;
  }
  return false;
}
async function applyOp(op) {
  const api = roamApi();
  const data = api?.data;
  if (!data) throw new Error("roamAlphaAPI.data is unavailable");
  if (op.op === "create") {
    await data.block.create({
      location: { "parent-uid": op.parentUid, order: op.order || "last" },
      block: { string: op.string }
    });
    return;
  }
  if (op.op === "update") {
    await data.block.update({ block: { uid: op.uid, string: op.string } });
    return;
  }
  if (op.op === "delete") {
    await data.block.delete({ block: { uid: op.uid } });
    return;
  }
  if (op.op === "create-page") {
    await data.page.create({ page: { title: op.title } });
    return;
  }
  if (op.op === "open") {
    await api.ui.mainWindow.openBlock({ block: { uid: op.uid } });
  }
}
function escapeReg(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function createHost({ lifecycle }) {
  if (!lifecycle?.add) throw new TypeError("A lifecycle is required");
  let displayed = null;
  let latest = null;
  let currentWatch = null;
  let schedule = () => {
  };
  let sidecarUid = null;
  let alive = true;
  let chain = Promise.resolve();
  function clearWatch() {
    if (!currentWatch) return;
    const watch2 = currentWatch;
    currentWatch = null;
    try {
      roamApi()?.data?.removePullWatch?.(watch2.pattern, watch2.entity, watch2.callback);
    } catch (error) {
      console.error("[compass] unwatch failed", error);
    }
  }
  async function removeSidecar(uid) {
    if (!uid) return;
    try {
      await roamApi()?.ui?.rightSidebar?.removeWindow?.({
        window: { type: "outline", "block-uid": uid }
      });
    } catch (error) {
      console.error("[compass] sidecar", error);
    }
  }
  async function closeSidecar() {
    const uid = sidecarUid;
    sidecarUid = null;
    await removeSidecar(uid);
  }
  lifecycle.add(() => closeSidecar());
  lifecycle.add(() => {
    clearWatch();
  });
  lifecycle.add(() => {
    alive = false;
  });
  function enqueue(task) {
    const run = chain.then(task, task);
    chain = run.then(() => void 0, () => void 0);
    return run;
  }
  async function load(uid, settings) {
    const bundle = await pullFixture(uid, settings);
    const view = present(bundle.fixture);
    if (displayed === uid) latest = { fixture: bundle.fixture, settings };
    return {
      ...view,
      pageUids: bundle.pageUids,
      blockUids: bundle.blockUids,
      missing: bundle.missing
    };
  }
  function watch(uid) {
    if (!uid) return;
    const data = roamApi()?.data;
    if (!data?.addPullWatch || !data?.removePullWatch) return;
    const entity = entityString(uid);
    if (currentWatch && currentWatch.entity === entity && currentWatch.pattern === CENTER_PULL) return;
    clearWatch();
    const callback = () => {
      schedule();
    };
    try {
      data.addPullWatch(CENTER_PULL, entity, callback);
      currentWatch = { pattern: CENTER_PULL, entity, callback };
    } catch (error) {
      console.error("[compass] watch failed", error);
    }
  }
  async function runCommit(snapshot, action) {
    if (!snapshot?.center?.uid) return { ok: false, reason: "empty" };
    let fixture = snapshot;
    let ops = planWrite(fixture, action).ops ?? [];
    if (ops.some(isProtectedOp)) throw new Error("Refusing a protected write");
    if (await sourcesStale(fixture, ops)) {
      const rebuilt = await pullFixture(fixture.center.uid, fixture.settings);
      fixture = rebuilt.fixture;
      if (displayed === fixture.center.uid) latest = { fixture, settings: fixture.settings };
      ops = planWrite(fixture, action).ops ?? [];
      if (ops.some(isProtectedOp)) throw new Error("Refusing a protected write");
    }
    if (!ops.length) return { ok: true, empty: true };
    for (const op of ops) await applyOp(op);
    if (displayed !== fixture.center.uid) return { ok: true };
    const model = await load(fixture.center.uid, fixture.settings);
    return { ok: true, model };
  }
  function withLock(snapshot, action) {
    const uid = snapshot?.center?.uid;
    if (!uid) return Promise.resolve({ ok: false, reason: "empty" });
    const locks = globalThis.navigator?.locks;
    if (!locks?.request) return runCommit(snapshot, action);
    const name = `compass:${graphName()}:${uid}`;
    let result = { ok: false, reason: "lock" };
    return locks.request(name, { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      result = await runCommit(snapshot, action);
    }).then(() => result);
  }
  function commit(action) {
    const snapshot = latest?.fixture ?? null;
    return enqueue(() => withLock(snapshot, action));
  }
  function search(text) {
    const needle = String(text ?? "").trim();
    if (!needle) return [];
    const data = roamApi()?.data;
    if (!data?.q) return [];
    try {
      return pageRows(data.q(SEARCH_RE, `(?i)${escapeReg(needle)}`), 20);
    } catch {
      try {
        return pageRows(data.q(SEARCH_INCLUDES, needle), 20);
      } catch (error) {
        console.error("[compass] search failed", error);
        return [];
      }
    }
  }
  async function openPageUid() {
    try {
      const uid = await roamApi()?.ui?.mainWindow?.getOpenPageOrBlockUid?.();
      return typeof uid === "string" && uid ? uid : null;
    } catch (error) {
      console.error("[compass] open page", error);
      return null;
    }
  }
  function focusedBlock() {
    try {
      const uid = roamApi()?.ui?.getFocusedBlock?.()?.["block-uid"];
      return typeof uid === "string" && uid ? uid : null;
    } catch (error) {
      console.error("[compass] focus", error);
      return null;
    }
  }
  async function openNode(uid, page) {
    const main = roamApi()?.ui?.mainWindow;
    if (!main || !uid) return;
    if (page) await main.openPage({ page: { uid } });
    else await main.openBlock({ block: { uid } });
  }
  async function syncSidecar(uid, enabled) {
    if (!alive) return;
    if (!enabled || !uid) {
      await closeSidecar();
      return;
    }
    if (sidecarUid === uid) return;
    const previous = sidecarUid;
    sidecarUid = null;
    if (previous && previous !== uid) await removeSidecar(previous);
    if (!alive) return;
    try {
      await roamApi()?.ui?.rightSidebar?.addWindow?.({
        window: { type: "outline", "block-uid": uid }
      });
      if (!alive) {
        await removeSidecar(uid);
        return;
      }
      sidecarUid = uid;
    } catch (error) {
      console.error("[compass] sidecar", error);
    }
  }
  return {
    load,
    commit,
    watch,
    unwatch: clearWatch,
    search,
    openPageUid,
    focusedBlock,
    openNode,
    syncSidecar,
    closeSidecar,
    blockContextMenu() {
      return roamApi()?.ui?.blockContextMenu ?? null;
    },
    setDisplayed(uid) {
      displayed = uid;
    },
    setScheduler(fn) {
      schedule = typeof fn === "function" ? fn : () => {
      };
    }
  };
}

// src/settings.js
var SETTING_IDS = Object.freeze({
  parents: "compass-parents",
  children: "compass-children",
  friends: "compass-friends",
  challengers: "compass-challengers",
  hidden: "compass-hidden",
  untyped: "compass-untyped",
  siblings: "compass-siblings",
  badges: "compass-badges",
  outline: "compass-outline",
  sidecar: "compass-sidecar",
  maxZone: "compass-max-zone",
  pins: "compass-pins",
  lenses: "compass-lenses"
});
var DEFAULTS3 = Object.freeze({
  "compass-parents": "Parent",
  "compass-children": "Child",
  "compass-friends": "Friend, Previous",
  "compass-challengers": "Challenger, Next",
  "compass-hidden": "Hidden",
  "compass-untyped": true,
  "compass-siblings": true,
  "compass-badges": true,
  "compass-outline": false,
  "compass-sidecar": true,
  "compass-max-zone": "24",
  "compass-pins": [],
  "compass-lenses": []
});
var SWITCHES = /* @__PURE__ */ new Set([
  SETTING_IDS.untyped,
  SETTING_IDS.siblings,
  SETTING_IDS.badges,
  SETTING_IDS.outline,
  SETTING_IDS.sidecar
]);
var ROWS = [
  [SETTING_IDS.parents, "Parents", "Comma-separated attribute titles for north."],
  [SETTING_IDS.children, "Children", "Comma-separated attribute titles for south."],
  [SETTING_IDS.friends, "Friends", "Comma-separated attribute titles for west."],
  [SETTING_IDS.challengers, "Challengers", "Comma-separated attribute titles for east."],
  [SETTING_IDS.hidden, "Hidden", "Comma-separated attribute titles to drop."],
  [SETTING_IDS.untyped, "Untyped links", "Show plain page links and mentions."],
  [SETTING_IDS.siblings, "Siblings", "Show sibling pages from an inverse parent."],
  [SETTING_IDS.badges, "Badges", "Show scalar text on the center card."],
  [SETTING_IDS.outline, "Outline", "Show direct child blocks under the center."],
  [SETTING_IDS.sidecar, "Sidecar", "Open the center in the right sidebar."],
  [SETTING_IDS.maxZone, "Max per zone", "Relation nodes kept in each zone."],
  [SETTING_IDS.pins, "Pins", "JSON list of uid and title."],
  [SETTING_IDS.lenses, "Lenses", "JSON list of named lenses."]
];
function flag(value, fallback) {
  if (value == null || value === "") return fallback;
  if (value === true || value === "on" || value === "true" || value === 1) return true;
  if (value === false || value === "off" || value === "false" || value === 0) return false;
  return Boolean(value);
}
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function readPins(value) {
  return asArray(value).flatMap((item) => {
    if (!item || typeof item.uid !== "string" || !item.uid) return [];
    const title = typeof item.title === "string" && item.title ? item.title : item.uid;
    return [{ uid: item.uid, title }];
  });
}
function nameList2(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}
function readLenses(value) {
  return asArray(value).flatMap((item) => {
    if (!item || typeof item.name !== "string" || !item.name.trim()) return [];
    return [{
      name: item.name.trim(),
      keyword: typeof item.keyword === "string" ? item.keyword : "",
      attributes: {
        include: nameList2(item.attributes?.include),
        exclude: nameList2(item.attributes?.exclude)
      },
      kinds: { include: nameList2(item.kinds?.include) }
    }];
  });
}
function readKey(extensionAPI, id) {
  const value = extensionAPI.settings.get(id);
  return value == null ? DEFAULTS3[id] : value;
}
function readCompassSettings(extensionAPI) {
  if (!extensionAPI?.settings?.get) throw new TypeError("extensionAPI.settings is required");
  const parents = readKey(extensionAPI, SETTING_IDS.parents);
  const children = readKey(extensionAPI, SETTING_IDS.children);
  const friends = readKey(extensionAPI, SETTING_IDS.friends);
  const challengers = readKey(extensionAPI, SETTING_IDS.challengers);
  const hidden = readKey(extensionAPI, SETTING_IDS.hidden);
  const maxZone = readKey(extensionAPI, SETTING_IDS.maxZone);
  const untyped = flag(readKey(extensionAPI, SETTING_IDS.untyped), true);
  const siblings = flag(readKey(extensionAPI, SETTING_IDS.siblings), true);
  const badges = flag(readKey(extensionAPI, SETTING_IDS.badges), true);
  const outline = flag(readKey(extensionAPI, SETTING_IDS.outline), false);
  const sidecar = flag(readKey(extensionAPI, SETTING_IDS.sidecar), true);
  return {
    parents,
    children,
    friends,
    challengers,
    hidden,
    maxZone,
    untyped,
    siblings,
    badges,
    outline,
    sidecar,
    pins: readPins(readKey(extensionAPI, SETTING_IDS.pins)),
    lenses: readLenses(readKey(extensionAPI, SETTING_IDS.lenses)),
    model: {
      parents,
      children,
      friends,
      challengers,
      hidden,
      maxPerZone: maxZone,
      showUntyped: untyped,
      showSiblings: siblings,
      showBadges: badges,
      showOutline: outline
    }
  };
}
async function initializeSettings(extensionAPI) {
  if (!extensionAPI?.settings?.get || !extensionAPI.settings.set) {
    throw new TypeError("extensionAPI.settings is required");
  }
  if (extensionAPI.settings.canSet === false) return;
  for (const [id, value] of Object.entries(DEFAULTS3)) {
    if (extensionAPI.settings.get(id) == null) await extensionAPI.settings.set(id, value);
  }
}
function parseInput(id, raw) {
  if (id === SETTING_IDS.pins || id === SETTING_IDS.lenses) {
    const text = String(raw ?? "").trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
    } catch {
    }
    return text;
  }
  return raw ?? "";
}
function createSettingsPanel({ extensionAPI, onChange } = {}) {
  const persist = (id, value) => {
    const write = extensionAPI?.settings?.canSet === false || !extensionAPI?.settings?.set ? Promise.resolve() : Promise.resolve(extensionAPI.settings.set(id, value)).catch((error) => {
      console.error("[compass] setting", error);
    });
    return write.then(() => {
      if (typeof onChange === "function") onChange(id, value);
    });
  };
  return {
    tabTitle: "Compass",
    settings: ROWS.map(([id, name, description]) => ({
      id,
      name,
      description,
      action: SWITCHES.has(id) ? {
        type: "switch",
        onChange: (event) => persist(id, Boolean(event?.target?.checked))
      } : {
        type: "input",
        onChange: (event) => persist(id, parseInput(id, event?.target?.value))
      }
    }))
  };
}

// src/view/overlay.js
var CENTER = { x: -100, y: -32, w: 200, h: 64 };
var ANCHORS = {
  parents: [-80, -130],
  children: [-80, 90],
  friends: [-280, -20],
  challengers: [210, -20],
  related: [-80, 150],
  siblings: [-70, 190],
  outline: [80, 90]
};
function guard(work) {
  return () => {
    try {
      Promise.resolve(work()).catch((error) => console.error("[compass]", error));
    } catch (error) {
      console.error("[compass]", error);
    }
  };
}
async function registerCommands({ extensionAPI, lifecycle, host, view }) {
  const palette = extensionAPI?.ui?.commandPalette;
  if (!palette?.addCommand || !palette?.removeCommand) {
    throw new TypeError("A command palette is required");
  }
  await lifecycle.command(palette, {
    label: "Compass: Open",
    callback: guard(() => view.toggle())
  });
  await lifecycle.command(palette, {
    label: "Compass: Focus page",
    callback: guard(() => view.focusPage())
  });
  await lifecycle.command(palette, {
    label: "Compass: Focus block",
    callback: guard(() => view.focusBlock())
  });
  const menu = host.blockContextMenu?.();
  if (menu?.addCommand && menu?.removeCommand) {
    await lifecycle.command(menu, {
      label: "Compass: Focus block",
      callback: (info) => {
        try {
          Promise.resolve(view.focusBlock(info?.["block-uid"])).catch((error) => {
            console.error("[compass]", error);
          });
        } catch (error) {
          console.error("[compass]", error);
        }
      }
    });
  }
}
function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
function textInput(placeholder) {
  const node = el("input");
  node.type = "text";
  node.autocomplete = "off";
  node.placeholder = placeholder;
  return node;
}
function labeled(text, input) {
  const wrap = el("label", "compass-field");
  const name = el("span", "compass-field-name");
  name.textContent = text;
  wrap.append(name, input);
  return wrap;
}
function blankLens() {
  return { keyword: "", attributes: { include: [], exclude: [] }, kinds: { include: [] } };
}
function splitList3(value) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}
function parseAnnotation(value) {
  const raw = String(value ?? "").trim();
  const doubled = raw.indexOf("::");
  const marker = doubled >= 0 ? doubled : raw.indexOf(":");
  const width = doubled >= 0 ? 2 : 1;
  if (marker < 0) return { attribute: "", text: "" };
  return {
    attribute: raw.slice(0, marker).trim(),
    text: raw.slice(marker + width).trim()
  };
}
function boundaryPoint(x, y, w, h, tx, ty) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const sx = dx === 0 ? Infinity : w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : h / 2 / Math.abs(dy);
  const scale = Math.min(sx, sy);
  return { x: cx + dx * scale, y: cy + dy * scale };
}
function segmentDistance(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = dx * dx + dy * dy;
  if (!len) return Math.hypot(px - x0, py - y0);
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}
function strokeFor(kind) {
  if (kind === "typed") return { width: 2, dash: [] };
  if (kind === "inverse") return { width: 1, dash: [] };
  return { width: 1.25, dash: [5, 4] };
}
function caption(edge) {
  const parts = [];
  if (edge.attribute) parts.push(edge.attribute);
  for (const label of edge.labels ?? []) {
    if (label?.attribute) parts.push(`${label.attribute}: ${label.text ?? ""}`);
  }
  return parts.join(" · ");
}
function endpoint(edge, centerUid) {
  if (edge.to && edge.to !== centerUid) return edge.to;
  if (edge.from && edge.from !== centerUid) return edge.from;
  return null;
}
function centerLabel(center) {
  return center?.title || center?.string || center?.uid || "Nothing centered";
}
function mountOverlay({ extensionAPI, lifecycle, host }) {
  const doc = globalThis.document;
  if (!doc?.body || typeof doc.createElement !== "function") {
    const view = {
      repullIfOpen() {
      },
      toggle() {
        return Promise.resolve();
      },
      focusPage() {
        return Promise.resolve();
      },
      focusBlock() {
        return Promise.resolve();
      }
    };
    return {
      ...view,
      installCommands() {
        return registerCommands({ extensionAPI, lifecycle, host, view });
      }
    };
  }
  return mountReal({ extensionAPI, lifecycle, host });
}
function mountReal({ extensionAPI, lifecycle, host }) {
  const root = el("div", "compass-root");
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Compass");
  const bar = el("div", "compass-bar");
  const backButton = el("button", "compass-back");
  backButton.type = "button";
  backButton.textContent = "Back";
  const forwardButton = el("button", "compass-forward");
  forwardButton.type = "button";
  forwardButton.textContent = "Forward";
  const searchInput = el("input", "compass-search");
  searchInput.type = "search";
  searchInput.autocomplete = "off";
  searchInput.placeholder = "Find a page";
  searchInput.setAttribute("aria-label", "Search pages");
  const results = el("div", "compass-results");
  results.hidden = true;
  const pinButton = el("button", "compass-pin");
  pinButton.type = "button";
  pinButton.textContent = "Pin";
  const outlineButton = el("button", "compass-outline");
  outlineButton.type = "button";
  outlineButton.textContent = "Outline";
  outlineButton.setAttribute("aria-pressed", "false");
  const closeButton = el("button", "compass-close");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  const status = el("span", "compass-status");
  bar.append(backButton, forwardButton, searchInput, results, pinButton, outlineButton, closeButton, status);
  const body = el("div", "compass-body");
  const stage = el("div", "compass-stage");
  const world = el("div", "compass-world");
  const canvas = el("canvas", "compass-edges");
  const centerCard = el("div", "compass-center");
  const centerTitle = el("div", "compass-center-title");
  const centerBadges = el("div", "compass-badges");
  centerCard.append(centerTitle, centerBadges);
  world.append(canvas, centerCard);
  const gutters = [
    ["compass-gutter compass-gutter-north", "parents", "Parents"],
    ["compass-gutter compass-gutter-south", "children", "Children"],
    ["compass-gutter compass-gutter-west", "friends", "Friends"],
    ["compass-gutter compass-gutter-east", "challengers", "Challengers"]
  ].map(([className, zone, label]) => {
    const gutter = el("div", className);
    gutter.dataset.zone = zone;
    gutter.textContent = label;
    return gutter;
  });
  stage.append(world, ...gutters);
  const side = el("aside", "compass-side");
  const pinHeading = el("p", "compass-section");
  pinHeading.textContent = "Pins";
  const pinList = el("div", "compass-pin-list");
  const lensHeading = el("p", "compass-section");
  lensHeading.textContent = "Lens";
  const keywordInput = textInput("Keyword");
  const includeInput = textInput("Attributes to keep");
  const excludeInput = textInput("Attributes to hide");
  const kindsInput = textInput("Kinds");
  const lensNameInput = textInput("Lens name");
  const actions = el("div", "compass-actions");
  const keepButton = el("button", "compass-keep");
  keepButton.type = "button";
  keepButton.textContent = "Keep layout";
  const reflowButton = el("button", "compass-reflow");
  reflowButton.type = "button";
  reflowButton.textContent = "Reflow";
  const saveButton = el("button", "compass-save");
  saveButton.type = "button";
  saveButton.textContent = "Save";
  actions.append(keepButton, reflowButton, saveButton);
  const lensList = el("div", "compass-lens-list");
  side.append(
    pinHeading,
    pinList,
    lensHeading,
    labeled("Keyword", keywordInput),
    labeled("Include", includeInput),
    labeled("Exclude", excludeInput),
    labeled("Kinds", kindsInput),
    labeled("Name", lensNameInput),
    actions,
    lensList
  );
  const popover = el("div", "compass-popover");
  popover.hidden = true;
  const ghost = el("div", "compass-ghost");
  ghost.hidden = true;
  root.append(bar, body, popover, ghost);
  body.append(stage, side);
  const palette = { ink: "#222222", paper: "#ffffff" };
  const timers = /* @__PURE__ */ new Set();
  let colored = false;
  let panX = 0;
  let panY = 0;
  let zoom = 1;
  let current = null;
  const back = [];
  const forward = [];
  let lastModel = null;
  let lastLayout = null;
  let lastEdges = [];
  let lensMode = null;
  let activeLens = null;
  let pullToken = 0;
  let watchTimer = null;
  let searchTimer = null;
  let clickTimer = null;
  let pointer = null;
  let suppressClick = false;
  let activeResult = 0;
  let segments = [];
  function delay(fn, ms) {
    const id = globalThis.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }
  function cancelDelay(id) {
    if (id == null) return;
    globalThis.clearTimeout(id);
    timers.delete(id);
  }
  function setStatus(text) {
    status.textContent = text || "";
  }
  function applyTransform() {
    world.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }
  function sampleColors() {
    if (colored) return;
    const bodyStyle = getComputedStyle(document.body);
    let paper = bodyStyle.backgroundColor || "";
    const ink = bodyStyle.color || "";
    if (!paper || paper === "transparent" || paper === "rgba(0, 0, 0, 0)") {
      paper = getComputedStyle(document.documentElement).backgroundColor || "";
    }
    if (ink) {
      root.style.color = ink;
      root.style.setProperty("--compass-ink", ink);
      palette.ink = ink;
    }
    if (paper && paper !== "transparent" && paper !== "rgba(0, 0, 0, 0)") {
      root.style.backgroundColor = paper;
      root.style.setProperty("--compass-paper", paper);
      palette.paper = paper;
    }
    colored = true;
  }
  function placeFrame() {
    const sidebar = document.getElementById("right-sidebar");
    const viewport = globalThis.innerWidth || 0;
    let inset = 0;
    if (sidebar?.getBoundingClientRect && viewport) {
      const width = sidebar.getBoundingClientRect().width;
      if (width > 48 && width < viewport * 0.55) inset = Math.round(width);
    }
    root.style.right = `${inset}px`;
  }
  function reveal() {
    if (root.hidden) {
      sampleColors();
      root.hidden = false;
      placeFrame();
    }
  }
  function hideResults() {
    results.hidden = true;
    results.replaceChildren();
    activeResult = 0;
  }
  function hidePopover() {
    popover.hidden = true;
    popover.replaceChildren();
  }
  function hideGhost() {
    ghost.hidden = true;
    root.classList.remove("compass-dragging");
  }
  function updateHistory() {
    backButton.disabled = back.length === 0;
    forwardButton.disabled = forward.length === 0;
  }
  function close() {
    root.hidden = true;
    pullToken += 1;
    host.unwatch();
    if (watchTimer != null) globalThis.clearTimeout(watchTimer);
    watchTimer = null;
    hidePopover();
    hideResults();
    hideGhost();
    setStatus("");
  }
  function scheduleReload() {
    if (root.hidden || lifecycle.disposed) return;
    if (watchTimer != null) globalThis.clearTimeout(watchTimer);
    watchTimer = lifecycle.timeout(() => {
      watchTimer = null;
      void reload();
    }, 80);
  }
  async function reload() {
    if (lifecycle.disposed || root.hidden || !current) return;
    const token = ++pullToken;
    const uid = current;
    let settings;
    try {
      settings = readCompassSettings(extensionAPI);
    } catch (error) {
      console.error("[compass] settings", error);
      return;
    }
    let model;
    try {
      model = await host.load(uid, settings.model);
    } catch (error) {
      console.error("[compass] pull failed", error);
      setStatus("Could not load this neighborhood");
      return;
    }
    if (token !== pullToken || lifecycle.disposed || root.hidden || current !== uid) return;
    paint(model);
    renderPins(settings.pins);
    renderLensList(settings.lenses);
    outlineButton.setAttribute("aria-pressed", settings.outline ? "true" : "false");
    updateHistory();
    if (model.missing) setStatus("No block for this uid");
    try {
      await host.syncSidecar(uid, settings.sidecar);
    } catch (error) {
      console.error("[compass] sidecar", error);
    }
    if (token === pullToken && !lifecycle.disposed) placeFrame();
  }
  function repullIfOpen() {
    if (root.hidden || lifecycle.disposed) return;
    scheduleReload();
  }
  async function showUid(uid, record) {
    if (!uid) return;
    if (record && current && current !== uid) {
      back.push(current);
      forward.length = 0;
    }
    if (current !== uid && lensMode === "keep") lensMode = "reflow";
    current = uid;
    host.setDisplayed(uid);
    reveal();
    host.watch(uid);
    updateHistory();
    hidePopover();
    hideResults();
    await reload();
  }
  async function goBack() {
    if (!back.length) return;
    if (current) forward.push(current);
    const uid = back.pop();
    updateHistory();
    await showUid(uid, false);
  }
  async function goForward() {
    if (!forward.length) return;
    if (current) back.push(current);
    const uid = forward.pop();
    updateHistory();
    await showUid(uid, false);
  }
  async function revealCurrent() {
    reveal();
    if (!current) return;
    host.setDisplayed(current);
    host.watch(current);
    await reload();
  }
  async function toggle() {
    if (!root.hidden) {
      close();
      return;
    }
    const uid = await host.openPageUid();
    if (uid) await showUid(uid, true);
    else await revealCurrent();
  }
  async function focusPage() {
    const uid = await host.openPageUid();
    if (uid) await showUid(uid, true);
    else await revealCurrent();
  }
  async function focusBlock(uid) {
    const target = uid || host.focusedBlock();
    if (target) await showUid(target, true);
    else await revealCurrent();
  }
  function readLensForm() {
    return {
      keyword: keywordInput.value,
      attributes: {
        include: splitList3(includeInput.value),
        exclude: splitList3(excludeInput.value)
      },
      kinds: { include: splitList3(kindsInput.value) }
    };
  }
  function paint(model) {
    lastModel = model;
    const classified = model.classified;
    const showOutline = classified.nodes.some((node) => node.zone === "outline");
    let view2;
    if (lensMode) {
      view2 = applyLens({
        nodes: classified.nodes,
        edges: classified.edges,
        badges: classified.badges,
        overflow: classified.overflow,
        layout: lensMode === "keep" ? lastLayout ?? model.placed : model.placed,
        showOutline
      }, activeLens ?? blankLens(), lensMode);
    } else {
      view2 = {
        nodes: classified.nodes,
        edges: classified.edges,
        badges: classified.badges,
        overflow: classified.overflow,
        layout: model.placed
      };
    }
    lastLayout = view2.layout;
    lastEdges = view2.edges ?? [];
    renderScene(view2, model);
  }
  function renderScene(view2, model) {
    for (const child of [...world.children]) {
      if (child !== canvas && child !== centerCard) child.remove();
    }
    centerTitle.textContent = centerLabel(model.fixture?.center);
    centerBadges.replaceChildren();
    for (const badge of view2.badges ?? []) {
      const chip = el("span", "compass-badge");
      chip.textContent = `${badge.attribute}: ${badge.text}`;
      chip.title = chip.textContent;
      centerBadges.append(chip);
    }
    const positions = new Map((view2.layout ?? []).map((item) => [item.uid, item]));
    for (const node of view2.nodes ?? []) {
      const box = positions.get(node.uid);
      if (!box) continue;
      world.append(renderNode(node, box));
    }
    renderOverflow(model, view2.layout);
    drawEdges(view2, model.fixture?.center?.uid);
  }
  function renderNode(node, box) {
    const slot = el("div", "compass-slot");
    if (node.hidden) slot.hidden = true;
    slot.style.left = `${box.x}px`;
    slot.style.top = `${box.y}px`;
    slot.style.width = `${box.w}px`;
    slot.style.height = `${box.h}px`;
    const button = el("button", "compass-node");
    button.type = "button";
    button.dataset.uid = node.uid;
    button.dataset.zone = node.zone;
    button.dataset.kind = node.kind;
    button.textContent = node.title || node.uid;
    button.title = node.title || node.uid;
    if (writableEdge(node.uid)) button.classList.add("compass-node-writable");
    const open = el("button", "compass-open");
    open.type = "button";
    open.textContent = "Open";
    open.addEventListener("click", (event) => {
      event.stopPropagation();
      void openMapped(node.uid, node.kind);
    });
    button.addEventListener("click", (event) => onNodeClick(event, node));
    button.addEventListener("dblclick", (event) => {
      event.preventDefault();
      cancelDelay(clickTimer);
      clickTimer = null;
      void openMapped(node.uid, node.kind);
    });
    slot.append(button, open);
    return slot;
  }
  function writableEdge(uid) {
    return (lastEdges ?? []).find((edge) => edge.writable && edge.kind === "typed" && edge.to === uid) ?? null;
  }
  function renderOverflow(model, layoutItems) {
    const overflow = model.classified?.overflow ?? {};
    const byUid = new Map((layoutItems ?? []).map((item) => [item.uid, item]));
    for (const zone of Object.keys(overflow)) {
      const extra = overflow[zone];
      if (!extra) continue;
      const members = (model.classified.nodes ?? []).filter((node) => node.zone === zone);
      const boxes = members.map((node) => byUid.get(node.uid)).filter(Boolean);
      const badge = el("div", "compass-overflow");
      badge.dataset.zone = zone;
      badge.textContent = `${members.length}/${members.length + extra}`;
      badge.title = zone;
      const anchor = ANCHORS[zone] ?? [0, 0];
      let x = anchor[0];
      let y = anchor[1];
      if (boxes.length) {
        x = Math.max(...boxes.map((box) => box.x + box.w)) + 8;
        y = Math.min(...boxes.map((box) => box.y));
      }
      badge.style.left = `${x}px`;
      badge.style.top = `${y}px`;
      world.append(badge);
    }
  }
  function drawEdges(view2, centerUid) {
    segments = [];
    const boxes = view2.layout ?? [];
    let minX = CENTER.x;
    let minY = CENTER.y;
    let maxX = CENTER.x + CENTER.w;
    let maxY = CENTER.y + CENTER.h;
    for (const box of boxes) {
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.w);
      maxY = Math.max(maxY, box.y + box.h);
    }
    const pad = 48;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const dpr = globalThis.devicePixelRatio || 1;
    canvas.style.left = `${minX}px`;
    canvas.style.top = `${minY}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, -minX * dpr, -minY * dpr);
    ctx.clearRect(minX, minY, width, height);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const byUid = new Map(boxes.map((box) => [box.uid, box]));
    const hidden = new Set((view2.nodes ?? []).filter((node) => node.hidden).map((node) => node.uid));
    for (const edge of view2.edges ?? []) {
      const uid = endpoint(edge, centerUid);
      if (!uid || hidden.has(uid)) continue;
      const box = byUid.get(uid);
      if (!box) continue;
      const nx = box.x + box.w / 2;
      const ny = box.y + box.h / 2;
      const start = boundaryPoint(CENTER.x, CENTER.y, CENTER.w, CENTER.h, nx, ny);
      const end = boundaryPoint(box.x, box.y, box.w, box.h, 0, 0);
      const style = strokeFor(edge.kind);
      ctx.beginPath();
      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = style.width;
      ctx.setLineDash(style.dash);
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const length = 8;
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - length * Math.cos(angle - 0.45), end.y - length * Math.sin(angle - 0.45));
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - length * Math.cos(angle + 0.45), end.y - length * Math.sin(angle + 0.45));
      ctx.stroke();
      const text = caption(edge);
      if (text) {
        const mx = (start.x + end.x) / 2;
        const my = (start.y + end.y) / 2 - 8;
        ctx.setLineDash([]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = palette.paper;
        ctx.strokeText(text, mx, my);
        ctx.fillStyle = palette.ink;
        ctx.fillText(text, mx, my);
      }
      segments.push({ edge, x0: start.x, y0: start.y, x1: end.x, y1: end.y });
    }
    ctx.setLineDash([]);
  }
  function clientToModel(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;
    return {
      x: (clientX - originX - panX) / zoom,
      y: (clientY - originY - panY) / zoom
    };
  }
  function hitEdge(event) {
    const point = clientToModel(event.clientX, event.clientY);
    let best = null;
    let bestDist = 8 / zoom;
    for (const segment of segments) {
      const dist = segmentDistance(point.x, point.y, segment.x0, segment.y0, segment.x1, segment.y1);
      if (dist <= bestDist) {
        best = segment;
        bestDist = dist;
      }
    }
    return best?.edge ?? null;
  }
  function showPopover(edge, event) {
    popover.replaceChildren();
    const title = el("p", "compass-popover-title");
    title.textContent = edge.attribute || "Untyped";
    popover.append(title);
    for (const label of edge.labels ?? []) {
      const line = el("p", "compass-popover-label");
      line.textContent = `${label.attribute}: ${label.text ?? ""}`;
      popover.append(line);
    }
    const open = el("button", "compass-popover-open");
    open.type = "button";
    open.textContent = "Open source";
    open.disabled = !edge.sourceUid;
    open.addEventListener("click", () => {
      if (!edge.sourceUid) return;
      void commitAction({ type: "open", sourceUid: edge.sourceUid });
    });
    const form = el("form", "compass-annotate");
    const field = textInput("Attribute: text");
    field.className = "compass-annotate-text";
    const submit = el("button", "compass-annotate-submit");
    submit.type = "submit";
    submit.textContent = "Annotate";
    form.append(field, submit);
    form.addEventListener("submit", (submitEvent) => {
      submitEvent.preventDefault();
      const parsed = parseAnnotation(field.value);
      if (!edge.sourceUid || !parsed.attribute || parsed.attribute.includes("::") || !parsed.text) {
        setStatus("Use Attribute: text");
        return;
      }
      void commitAction({
        type: "annotate",
        sourceUid: edge.sourceUid,
        attribute: parsed.attribute,
        text: parsed.text
      });
    });
    popover.append(open, form);
    popover.hidden = false;
    const rect = root.getBoundingClientRect();
    const left = Math.max(8, Math.min(event.clientX - rect.left, rect.width - 230));
    const top = Math.max(8, Math.min(event.clientY - rect.top + 8, Math.max(8, rect.height - 180)));
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }
  function openMapped(uid, kind) {
    const page = kind !== "outline" && !lastModel?.blockUids?.has(uid);
    return host.openNode(uid, page).catch((error) => console.error("[compass]", error));
  }
  function onNodeClick(event, node) {
    if (suppressClick) return;
    if (event.shiftKey) {
      void openMapped(node.uid, node.kind);
      return;
    }
    cancelDelay(clickTimer);
    clickTimer = delay(() => {
      clickTimer = null;
      void showUid(node.uid, true);
    }, 220);
  }
  async function commitAction(action) {
    setStatus("Writing…");
    try {
      const result = await host.commit(action);
      if (!result?.ok && result?.reason === "lock") {
        setStatus("Another tab is writing this center");
        return;
      }
      if (!result?.ok || result.empty) {
        setStatus("Nothing to change");
        return;
      }
      if (result.model && result.model.fixture?.center?.uid === current && !root.hidden) {
        paint(result.model);
        const settings = readCompassSettings(extensionAPI);
        renderPins(settings.pins);
        renderLensList(settings.lenses);
        await host.syncSidecar(current, settings.sidecar);
        placeFrame();
      } else {
        await reload();
      }
      setStatus("");
    } catch (error) {
      console.error("[compass] write failed", error);
      setStatus("Write failed");
      try {
        await reload();
      } catch (reloadError) {
        console.error("[compass] pull failed", reloadError);
      }
    }
  }
  function gutterAt(x, y) {
    const stack = document.elementsFromPoint?.(x, y) ?? [];
    for (const item of stack) {
      if (!item?.closest || !root.contains(item) || item.closest(".compass-ghost")) continue;
      const gutter = item.closest(".compass-gutter");
      if (gutter) return gutter.dataset.zone || null;
    }
    return null;
  }
  function setHotGutter(zone) {
    for (const gutter of root.querySelectorAll(".compass-gutter")) {
      gutter.classList.toggle("compass-gutter-hot", Boolean(zone) && gutter.dataset.zone === zone);
    }
  }
  function showGhost(title, x, y) {
    ghost.hidden = false;
    ghost.textContent = title || "";
    const rect = root.getBoundingClientRect();
    ghost.style.left = `${x - rect.left + 8}px`;
    ghost.style.top = `${y - rect.top + 8}px`;
    root.classList.add("compass-dragging");
  }
  function onPointerDown(event) {
    if (root.hidden || event.button !== 0 || pointer) return;
    const target = event.target;
    if (target?.closest?.(".compass-open")) return;
    const node = target?.closest?.(".compass-node");
    if (node && root.contains(node)) {
      if (!event.shiftKey) {
        const edge = writableEdge(node.dataset.uid);
        if (edge) {
          pointer = {
            type: "node",
            uid: node.dataset.uid,
            edge,
            x: event.clientX,
            y: event.clientY,
            title: node.textContent || "",
            moved: false
          };
        }
      }
      return;
    }
    if (target?.closest?.(".compass-bar, .compass-side, .compass-popover, .compass-results, .compass-gutter")) return;
    if (target !== stage && !stage.contains(target)) return;
    pointer = { type: "pan", x: event.clientX, y: event.clientY, panX, panY, moved: false };
  }
  function onPointerMove(event) {
    if (!pointer) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!pointer.moved && Math.hypot(dx, dy) < 4) return;
    pointer.moved = true;
    if (pointer.type === "pan") {
      panX = pointer.panX + dx;
      panY = pointer.panY + dy;
      applyTransform();
      return;
    }
    showGhost(pointer.title, event.clientX, event.clientY);
    setHotGutter(gutterAt(event.clientX, event.clientY));
  }
  function onPointerUp(event) {
    if (!pointer) return;
    const active = pointer;
    pointer = null;
    const zone = active.type === "node" && active.moved ? gutterAt(event.clientX, event.clientY) : null;
    setHotGutter(null);
    hideGhost();
    if (active.type !== "node" || !active.moved) return;
    suppressClick = true;
    delay(() => {
      suppressClick = false;
    }, 0);
    if (zone) void relink(active.edge, active.uid, zone);
  }
  function relink(edge, uid, zone) {
    const node = (lastModel?.classified?.nodes ?? []).find((item) => item.uid === uid);
    return commitAction({
      type: "relink",
      sourceUid: edge.sourceUid,
      valueUid: uid,
      toZone: zone,
      title: node?.title ?? ""
    });
  }
  function renderPins(pins) {
    pinList.replaceChildren();
    for (const pin of pins ?? []) {
      const row = el("div", "compass-pin-row");
      const jump = el("button", "compass-pin-jump");
      jump.type = "button";
      jump.textContent = pin.title || pin.uid;
      jump.addEventListener("click", () => {
        void showUid(pin.uid, true);
      });
      const remove = el("button", "compass-pin-remove");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        void unpin(pin.uid);
      });
      row.append(jump, remove);
      pinList.append(row);
    }
  }
  async function pinCurrent() {
    if (!current || !lastModel) return;
    const settings = readCompassSettings(extensionAPI);
    if (settings.pins.some((pin) => pin.uid === current)) return;
    const pins = settings.pins.concat([{ uid: current, title: centerLabel(lastModel.fixture?.center) }]);
    if (extensionAPI.settings.canSet !== false) await extensionAPI.settings.set(SETTING_IDS.pins, pins);
    renderPins(pins);
  }
  async function unpin(uid) {
    const settings = readCompassSettings(extensionAPI);
    const pins = settings.pins.filter((pin) => pin.uid !== uid);
    if (extensionAPI.settings.canSet !== false) await extensionAPI.settings.set(SETTING_IDS.pins, pins);
    renderPins(pins);
  }
  function renderLensList(lenses) {
    lensList.replaceChildren();
    for (const lens of lenses ?? []) {
      const row = el("div", "compass-lens-row");
      const apply = el("button", "compass-lens-apply");
      apply.type = "button";
      apply.textContent = lens.name;
      apply.addEventListener("click", () => {
        keywordInput.value = lens.keyword ?? "";
        includeInput.value = (lens.attributes?.include ?? []).join(", ");
        excludeInput.value = (lens.attributes?.exclude ?? []).join(", ");
        kindsInput.value = (lens.kinds?.include ?? []).join(", ");
        lensNameInput.value = lens.name;
        lensMode = "reflow";
        activeLens = readLensForm();
        if (lastModel) paint(lastModel);
      });
      const remove = el("button", "compass-lens-delete");
      remove.type = "button";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => {
        void deleteLens(lens.name);
      });
      row.append(apply, remove);
      lensList.append(row);
    }
  }
  async function saveLens() {
    const name = lensNameInput.value.trim();
    if (!name) {
      setStatus("Name the lens");
      return;
    }
    const settings = readCompassSettings(extensionAPI);
    const lenses = settings.lenses.filter((item) => item.name !== name);
    lenses.push({ name, ...readLensForm() });
    if (extensionAPI.settings.canSet !== false) await extensionAPI.settings.set(SETTING_IDS.lenses, lenses);
    renderLensList(lenses);
    setStatus("");
  }
  async function deleteLens(name) {
    const settings = readCompassSettings(extensionAPI);
    const lenses = settings.lenses.filter((item) => item.name !== name);
    if (extensionAPI.settings.canSet !== false) await extensionAPI.settings.set(SETTING_IDS.lenses, lenses);
    renderLensList(lenses);
  }
  function applyLensMode(mode) {
    lensMode = mode;
    activeLens = readLensForm();
    if (lastModel) paint(lastModel);
  }
  function renderResults(rows) {
    results.replaceChildren();
    if (!rows.length) {
      const empty = el("div", "compass-result");
      empty.textContent = "No pages";
      results.append(empty);
      results.hidden = false;
      activeResult = -1;
      return;
    }
    activeResult = 0;
    rows.forEach((row, index) => {
      const button = el("button", "compass-result");
      button.type = "button";
      button.dataset.uid = row.uid;
      button.textContent = row.title;
      if (index === 0) button.classList.add("compass-result-active");
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        hideResults();
        void showUid(row.uid, true);
      });
      results.append(button);
    });
    results.hidden = false;
  }
  function markResults() {
    const items = [...results.querySelectorAll(".compass-result")];
    items.forEach((item, index) => {
      item.classList.toggle("compass-result-active", index === activeResult);
    });
    items[activeResult]?.scrollIntoView?.({ block: "nearest" });
  }
  function runSearch() {
    const text = searchInput.value.trim();
    if (!text) {
      hideResults();
      return;
    }
    try {
      renderResults(host.search(text));
    } catch (error) {
      console.error("[compass] search failed", error);
      setStatus("Page search failed");
      hideResults();
    }
  }
  function onSearchKey(event) {
    const items = [...results.querySelectorAll(".compass-result[data-uid]")];
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!items.length) return;
      activeResult = Math.min(items.length - 1, activeResult + 1);
      markResults();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!items.length) return;
      activeResult = Math.max(0, activeResult - 1);
      markResults();
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[activeResult] || items[0];
      if (!item?.dataset?.uid) return;
      hideResults();
      void showUid(item.dataset.uid, true);
    } else if (event.key === "Escape" && !results.hidden) {
      event.preventDefault();
      event.stopPropagation();
      hideResults();
    }
  }
  function onKey(event) {
    if (root.hidden || event.key !== "Escape") return;
    if (!results.hidden) {
      hideResults();
      event.preventDefault();
      return;
    }
    if (!popover.hidden) {
      hidePopover();
      event.preventDefault();
      return;
    }
    close();
    event.preventDefault();
  }
  function onWheel(event) {
    if (root.hidden) return;
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;
    const modelX = (event.clientX - originX - panX) / zoom;
    const modelY = (event.clientY - originY - panY) / zoom;
    const next = Math.min(2.5, Math.max(0.4, zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
    panX = event.clientX - originX - modelX * next;
    panY = event.clientY - originY - modelY * next;
    zoom = next;
    applyTransform();
  }
  async function toggleOutline() {
    const settings = readCompassSettings(extensionAPI);
    const next = !settings.outline;
    if (extensionAPI.settings.canSet !== false) await extensionAPI.settings.set(SETTING_IDS.outline, next);
    outlineButton.setAttribute("aria-pressed", next ? "true" : "false");
    if (!root.hidden && current) await reload();
  }
  lifecycle.node(root, document.body);
  lifecycle.event(closeButton, "click", () => close());
  lifecycle.event(backButton, "click", () => {
    void goBack();
  });
  lifecycle.event(forwardButton, "click", () => {
    void goForward();
  });
  lifecycle.event(pinButton, "click", () => {
    void pinCurrent().catch((error) => console.error("[compass]", error));
  });
  lifecycle.event(outlineButton, "click", () => {
    void toggleOutline().catch((error) => console.error("[compass]", error));
  });
  lifecycle.event(keepButton, "click", () => applyLensMode("keep"));
  lifecycle.event(reflowButton, "click", () => applyLensMode("reflow"));
  lifecycle.event(saveButton, "click", () => {
    void saveLens().catch((error) => console.error("[compass]", error));
  });
  lifecycle.event(searchInput, "input", () => {
    cancelDelay(searchTimer);
    searchTimer = delay(() => {
      searchTimer = null;
      runSearch();
    }, 80);
  });
  lifecycle.event(searchInput, "keydown", onSearchKey);
  lifecycle.event(stage, "click", (event) => {
    const target = event.target;
    if (target?.closest?.(".compass-node, .compass-open, .compass-gutter, .compass-center, .compass-overflow, .compass-slot")) {
      return;
    }
    const hit = hitEdge(event);
    if (hit) showPopover(hit, event);
    else hidePopover();
  });
  lifecycle.event(stage, "wheel", onWheel, { passive: false });
  lifecycle.event(root, "pointerdown", onPointerDown);
  lifecycle.event(globalThis, "pointermove", onPointerMove);
  lifecycle.event(globalThis, "pointerup", onPointerUp);
  lifecycle.event(globalThis, "pointercancel", onPointerUp);
  lifecycle.event(globalThis, "resize", () => {
    if (!root.hidden) placeFrame();
  });
  lifecycle.event(document, "keydown", onKey);
  lifecycle.add(() => {
    for (const id of timers) globalThis.clearTimeout(id);
    timers.clear();
    if (watchTimer != null) globalThis.clearTimeout(watchTimer);
    root.hidden = true;
  });
  host.setScheduler(scheduleReload);
  applyTransform();
  updateHistory();
  const view = { repullIfOpen, toggle, focusPage, focusBlock };
  return {
    ...view,
    installCommands() {
      return registerCommands({ extensionAPI, lifecycle, host, view });
    }
  };
}

// src/extension.js
var VERSION_FLAG = "__ROAM_COMPASS_VERSION";
var activeLifecycle = null;
function versionHost() {
  return globalThis.window ?? globalThis;
}
function stampVersion(version) {
  versionHost()[VERSION_FLAG] = version;
}
function clearVersion() {
  const host = versionHost();
  try {
    delete host[VERSION_FLAG];
  } catch {
    host[VERSION_FLAG] = void 0;
  }
}
async function onload({ extensionAPI, extension }) {
  if (!extensionAPI) throw new TypeError("Roam did not provide extensionAPI");
  if (activeLifecycle) await activeLifecycle.dispose();
  const lifecycle = createLifecycle();
  activeLifecycle = lifecycle;
  const version = extension?.version || "development";
  try {
    stampVersion(version);
    const host = createHost({ lifecycle });
    const overlay = mountOverlay({ extensionAPI, lifecycle, host });
    await initializeSettings(extensionAPI);
    await lifecycle.settingsPanel(extensionAPI, createSettingsPanel({
      extensionAPI,
      onChange: () => overlay.repullIfOpen()
    }));
    await overlay.installCommands();
    console.info(`[compass] Loaded v${version}`);
  } catch (error) {
    if (activeLifecycle === lifecycle) {
      activeLifecycle = null;
      clearVersion();
    }
    await lifecycle.dispose().catch((cleanupError) => console.error("[compass]", cleanupError));
    throw error;
  }
  return async () => {
    if (activeLifecycle === lifecycle) {
      activeLifecycle = null;
      clearVersion();
    }
    await lifecycle.dispose();
  };
}
async function onunload() {
  const lifecycle = activeLifecycle;
  activeLifecycle = null;
  clearVersion();
  if (lifecycle) await lifecycle.dispose();
  console.info("[compass] Unloaded");
}
var extension_default = { onload, onunload };
export {
  extension_default as default,
  onload,
  onunload
};
