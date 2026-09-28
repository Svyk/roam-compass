const DEFAULTS = {
  parents: "Parent",
  children: "Child",
  friends: "Friend, Previous",
  challengers: "Challenger, Next",
  hidden: "Hidden",
};

const RELATION_ZONES = ["parents", "children", "friends", "challengers", "related", "siblings"];
const OUTLINE_CAP = 40;
const BADGE_CAP = 6;

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
    showOutline: readFlag(source.showOutline, false),
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
    text: label?.text ?? "",
  }));
}

function indexTitles(fixture) {
  const pages = new Map();
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

function capNodes(nodes, maxPerZone) {
  const limits = {
    parents: maxPerZone,
    children: maxPerZone,
    friends: maxPerZone,
    challengers: maxPerZone,
    related: maxPerZone,
    siblings: maxPerZone,
    outline: OUTLINE_CAP,
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

export function classify(fixture) {
  const source = fixture ?? {};
  const centerUid = source.center?.uid ?? "";
  const lists = readSettings(source.settings);
  const pages = indexTitles(source);
  const nodes = [];
  const edges = [];
  const badges = [];
  const seen = new Set();
  const edgeSeen = new Set();

  function addNode(node) {
    if (!node?.uid || node.uid === centerUid || seen.has(node.uid)) return false;
    seen.add(node.uid);
    nodes.push({
      uid: node.uid,
      title: node.title ?? "",
      zone: node.zone,
      kind: node.kind,
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
        writable: true,
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
        writable: false,
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
        writable: false,
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
        writable: false,
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
        writable: false,
      });
    }
  }

  const namespaceParent = source.namespaceParent;
  if (namespaceParent?.uid && namespaceParent.uid !== centerUid) {
    const added = addNode({
      uid: namespaceParent.uid,
      title: namespaceParent.title ?? "",
      zone: "parents",
      kind: "namespace",
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
        writable: false,
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
        kind: "outline",
      });
    }
  }

  const capped = capNodes(nodes, lists.maxPerZone);
  const keptIds = new Set(capped.kept.map((node) => node.uid));
  const keptEdges = edges.filter((edge) => (
    (edge.from === centerUid || keptIds.has(edge.from))
    && (edge.to === centerUid || keptIds.has(edge.to))
  ));
  return { nodes: capped.kept, edges: keptEdges, badges, overflow: capped.overflow };
}
