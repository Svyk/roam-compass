export const GROUP_LABEL = Object.freeze({
  page: "Pages",
  block: "Blocks",
  drawing: "Drawings",
  region: "Regions",
  board: "Boards",
  card: "Cards",
  empty: "Empty pages",
});

const AREAS = new Set(["north", "south", "west", "east"]);
const AREA_ROLE = Object.freeze({
  north: "parent",
  south: "child",
  west: "friend",
  east: "challenger",
});

export function groupKey(fact) {
  const type = typeof fact?.type === "string" ? fact.type.trim() : "";
  if (type) return `type:${type}`;
  const group = typeof fact?.group === "string" && fact.group ? fact.group : "page";
  return `kind:${group}`;
}

export function groupLabel(key) {
  if (typeof key !== "string" || !key) return "";
  if (key.startsWith("type:")) return key.slice(5);
  const kind = key.startsWith("kind:") ? key.slice(5) : key;
  return GROUP_LABEL[kind] ?? kind;
}

function factFor(facts, uid) {
  if (!facts || typeof uid !== "string" || !uid) return null;
  if (facts instanceof Map) return facts.get(uid) ?? null;
  return facts[uid] ?? null;
}

function keyForNode(node, facts) {
  const fact = factFor(facts, node?.uid);
  if (fact) return groupKey(fact);
  const style = typeof node?.style === "string" ? node.style : "";
  const kind = typeof node?.kind === "string" ? node.kind : "";
  return `kind:${style || kind || "page"}`;
}

function areaForZone(zone, oneSided) {
  if (!AREAS.has(zone)) return null;
  if (oneSided && (zone === "west" || zone === "east")) return "west";
  return zone;
}

function makeGroupNode(area, key, bucket) {
  const first = bucket[0];
  const role = first.zone === area && typeof first.role === "string" && first.role
    ? first.role
    : AREA_ROLE[area];
  const strength = Math.max(...bucket.map((item) => (Number.isFinite(item.strength) ? item.strength : 0)));
  return {
    uid: `group:${area}:${key}`,
    kind: "group",
    title: groupLabel(key),
    count: bucket.length,
    members: bucket.map((item) => item.uid),
    zone: area,
    role,
    strength,
    style: "group",
    evidence: [{ kind: "group", role }],
    label: "",
    alias: "",
    string: "",
    editTime: 0,
    createTime: 0,
    writable: null,
    via: null,
  };
}

export function groupNodes(nodes, facts, { unfolded = new Set(), oneSided = false } = {}) {
  if (!Array.isArray(nodes)) return [];
  const unfoldedSet = unfolded instanceof Set ? unfolded : new Set(Array.isArray(unfolded) ? unfolded : []);
  const sharedSides = oneSided === true;
  const buckets = new Map();
  const nodeGroupId = new Map();

  for (const node of nodes) {
    if (!node || typeof node.uid !== "string" || !node.uid) continue;
    const area = areaForZone(node.zone, sharedSides);
    if (!area) continue;
    const key = keyForNode(node, facts);
    const id = `group:${area}:${key}`;
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = { area, key, items: [] };
      buckets.set(id, bucket);
    }
    bucket.items.push(node);
    nodeGroupId.set(node.uid, id);
  }

  const foldedGroups = new Map();
  const foldedMembers = new Set();
  for (const [id, bucket] of buckets) {
    if (bucket.items.length < 2 || unfoldedSet.has(id)) continue;
    foldedGroups.set(id, makeGroupNode(bucket.area, bucket.key, bucket.items));
    for (const member of bucket.items) foldedMembers.add(member.uid);
  }

  const emitted = new Set();
  const out = [];
  for (const node of nodes) {
    if (!node || typeof node.uid !== "string" || !node.uid) continue;
    const id = nodeGroupId.get(node.uid);
    if (id && foldedGroups.has(id)) {
      if (!emitted.has(id)) {
        emitted.add(id);
        out.push(foldedGroups.get(id));
      }
      continue;
    }
    if (node.zone === "siblings" && node.via && foldedMembers.has(node.via)) {
      out.push({ ...node, via: null });
    } else {
      out.push(node);
    }
  }
  return out;
}

export function groupIds(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes
    .filter((node) => node?.kind === "group" && typeof node.uid === "string")
    .map((node) => node.uid);
}
