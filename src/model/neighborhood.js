import { drawingTitle, parseAttribute, plainText, scanRefs, splitNames, tailShape } from "./text.js";

// One center, six relationship roles, four directions. Siblings sit in their own band.
export const ROLES = ["parent", "child", "friend", "challenger", "previous", "next"];
export const ZONES = ["north", "south", "west", "east", "siblings"];

export const ZONE_OF = Object.freeze({
  parent: "north",
  child: "south",
  friend: "west",
  previous: "west",
  challenger: "east",
  next: "east",
  sibling: "siblings",
});

// The role a side stands for when the user drops a node there.
export const DROP_ROLE = Object.freeze({ north: "parent", south: "child", west: "friend", east: "challenger" });

const INVERSE = Object.freeze({
  parent: "child",
  child: "parent",
  friend: "friend",
  challenger: "challenger",
  previous: "next",
  next: "previous",
});

// Better Tasks owns BT_attr*; the aliases plugin owns Aliases::. Compass shows them, never rewrites them.
const READ_ONLY = [/^BT_attr/i, /^aliases$/i, /^roam\//i];

const STRENGTH = Object.freeze({ typed: 3, structural: 2, link: 1, mention: 1, sibling: 0 });
const BADGE_CAP = 8;

export const MODEL_DEFAULTS = Object.freeze({
  parent: "Parent, Up, Part of, Is a, Type, Category, Project, BT_attrProject",
  child: "Child, Has part, Contains",
  friend: "Friend, Related, See also",
  challenger: "Challenger, Opposes, Contradicts",
  previous: "Previous",
  next: "Next",
  hidden: "Hidden",
});

function flag(value, fallback) {
  if (value == null || value === "") return fallback;
  if (value === true || value === "true" || value === "on" || value === 1) return true;
  if (value === false || value === "false" || value === "off" || value === 0) return false;
  return Boolean(value);
}

function count(value, fallback) {
  const number = Number(value);
  if (value == null || value === "" || !Number.isFinite(number) || number < 1) return fallback;
  return Math.floor(number);
}

export function modelSettings(raw = {}) {
  const lists = {};
  for (const role of ROLES) lists[role] = splitNames(raw[role] ?? MODEL_DEFAULTS[role]);
  return {
    lists,
    hidden: splitNames(raw.hidden ?? MODEL_DEFAULTS.hidden),
    links: flag(raw.links, true),
    siblings: flag(raw.siblings, true),
    badges: flag(raw.badges, true),
    maxPerZone: count(raw.maxPerZone, 12),
  };
}

function sameName(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}

// Where an attribute points from its entity. Unlisted attributes read as children,
// the way a plain forward link does.
export function roleOf(attribute, settings) {
  const name = String(attribute ?? "").trim();
  if (!name) return null;
  if (settings.hidden.some((item) => sameName(item, name))) return null;
  for (const role of ROLES) {
    if (settings.lists[role].some((item) => sameName(item, name))) return { role, explicit: true };
  }
  return { role: "child", explicit: false };
}

export function inverseRole(role) {
  return INVERSE[role] ?? role;
}

export function isReadOnlyAttribute(name) {
  return READ_ONLY.some((pattern) => pattern.test(String(name ?? "")));
}

// The attribute Compass writes for a role, from the entity's side.
export function attributeForRole(role, settings) {
  const name = settings.lists[role]?.[0];
  if (!name || name.includes("::") || /[[\]\n]/.test(name) || isReadOnlyAttribute(name)) return null;
  return name;
}

function titleOf(entity) {
  if (!entity) return "";
  if (typeof entity.title === "string" && entity.title) return entity.title;
  return drawingTitle(entity.string) ?? plainText(entity.string ?? "");
}

export function isDrawingLike(node) {
  const text = typeof node?.string === "string" ? node.string.trimStart() : "";
  return text.startsWith("{{[[excalidraw]]}}") || text.startsWith("{{excalidraw}}") || text.startsWith("{{[[plexus-region]]");
}

function kindOf(entity) {
  return typeof entity?.title === "string" && entity.title ? "page" : "block";
}

function isNode(entity) {
  return Boolean(entity?.uid) && (typeof entity.title === "string" || typeof entity.string === "string");
}

function labelsText(labels) {
  return (labels ?? []).map((label) => `${label.attribute}: ${label.text}`);
}

function walk(blocks, visit, depth = 0, parentUid = null) {
  for (const block of blocks ?? []) {
    if (!block?.uid) continue;
    visit(block, depth, parentUid);
    walk(block.children, visit, depth + 1, block.uid);
  }
}

function resolveTokens(tokens, refs) {
  const byTitle = new Map();
  const byUid = new Map();
  for (const ref of refs ?? []) {
    if (!ref?.uid) continue;
    byUid.set(ref.uid, ref);
    if (typeof ref.title === "string") byTitle.set(ref.title, ref);
  }
  const found = [];
  for (const token of tokens) {
    if (token.classTag) continue;
    const ref = token.type === "block" ? byUid.get(token.uid) : byTitle.get(token.title);
    if (ref && !found.includes(ref)) found.push(ref);
  }
  return found;
}

// Refs a reader would call links: not the attribute name, not a macro name, not a class tag.
export function linkRefs(block) {
  const attribute = parseAttribute(block?.string);
  const text = attribute ? attribute.tail : block?.string;
  return resolveTokens(scanRefs(text), block?.refs);
}

function outlineIndex(outline) {
  const index = new Map();
  const rows = [];
  walk(outline, (block, depth, parentUid) => {
    index.set(block.uid, { parentUid, depth });
    rows.push({
      uid: block.uid,
      text: (drawingTitle(block.string, 72) ?? plainText(block.string, 72)) || " ",
      depth,
      parentUid,
      childCount: (block.children ?? []).filter((child) => child?.uid).length,
    });
  });
  return { index, rows };
}

function compareNodes(a, b) {
  if (a.strength !== b.strength) return b.strength - a.strength;
  const at = a.title.toLowerCase();
  const bt = b.title.toLowerCase();
  if (at !== bt) return at < bt ? -1 : 1;
  return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
}

function pickRole(evidence) {
  const top = Math.max(...evidence.map((item) => STRENGTH[item.kind] ?? 0));
  let strongest = evidence.filter((item) => (STRENGTH[item.kind] ?? 0) === top);
  if (strongest.some((item) => item.explicit)) strongest = strongest.filter((item) => item.explicit);
  const roles = [...new Set(strongest.map((item) => item.role))];
  // Two different claims about one neighbor (a mutual link, or typed edges both ways)
  // read as a lateral relationship.
  return { role: roles.length === 1 ? roles[0] : "friend", strength: top, strongest };
}

// Parents reached through a typed edge. The host pulls their other children as siblings.
export function typedParentUids(snapshot, rawSettings, limit = 6) {
  const settings = modelSettings(rawSettings);
  const uids = [];
  const push = (uid) => {
    if (uid && uid !== snapshot?.center?.uid && !uids.includes(uid) && uids.length < limit) uids.push(uid);
  };
  for (const harc of snapshot?.out ?? []) {
    if (roleOf(harc.attribute, settings)?.role !== "parent") continue;
    for (const value of harc.values ?? []) if (kindOf(value) === "page") push(value.uid);
  }
  for (const harc of snapshot?.in ?? []) {
    if (roleOf(harc.attribute, settings)?.role !== "child") continue;
    if (kindOf(harc.entity) === "page") push(harc.entity.uid);
  }
  return uids;
}

export function buildNeighborhood(snapshot, rawSettings = {}, options = {}) {
  const settings = modelSettings(rawSettings);
  const source = snapshot ?? {};
  const center = source.center ?? {};
  const centerUid = center.uid ?? "";
  const expanded = options.expanded instanceof Set ? options.expanded : new Set();
  const entities = new Map();
  const evidence = new Map();
  const badges = [];
  const outline = outlineIndex(source.outline);

  function add(entity, item) {
    if (!isNode(entity) || entity.uid === centerUid) return;
    if (!entities.has(entity.uid)) entities.set(entity.uid, entity);
    else if (!entities.get(entity.uid).title && entity.title) entities.set(entity.uid, entity);
    const list = evidence.get(entity.uid) ?? [];
    list.push(item);
    evidence.set(entity.uid, list);
  }

  const typedSources = new Set();
  const typedValueBlocks = new Set();

  for (const harc of source.out ?? []) {
    const mapping = roleOf(harc.attribute, settings);
    if (!mapping) continue;
    const readOnly = isReadOnlyAttribute(harc.attribute);
    if (harc.source?.uid) typedSources.add(harc.source.uid);
    if (harc.source && tailShape(parseAttribute(harc.source.string)?.tail).kind === "bare") {
      for (const child of harc.source.children ?? []) {
        if (!parseAttribute(child.string)) typedValueBlocks.add(child.uid);
      }
    }
    for (const value of harc.values ?? []) {
      if (!isNode(value)) {
        if (value?.text != null && settings.badges && badges.length < BADGE_CAP) {
          badges.push({ attribute: harc.attribute, text: String(value.text) });
        }
        continue;
      }
      add(value, {
        kind: "typed",
        role: mapping.role,
        explicit: mapping.explicit,
        attribute: harc.attribute,
        labels: labelsText(harc.labels),
        sourceUid: harc.source?.uid ?? null,
        sourceString: harc.source?.string ?? null,
        direction: "out",
        harcUid: harc.uid,
        writable: Boolean(harc.source?.uid) && !readOnly,
      });
    }
  }

  const inboundSources = new Set();
  for (const harc of source.in ?? []) {
    for (const uid of [harc.source?.uid, ...(harc.valueSourceUids ?? [])]) if (uid) inboundSources.add(uid);
    const mapping = roleOf(harc.attribute, settings);
    if (!mapping) continue;
    add(harc.entity, {
      kind: "typed",
      role: inverseRole(mapping.role),
      explicit: mapping.explicit,
      attribute: harc.attribute,
      labels: labelsText(harc.labels),
      sourceUid: harc.source?.uid ?? null,
      sourceString: harc.source?.string ?? null,
      direction: "in",
      harcUid: harc.uid,
      writable: Boolean(harc.source?.uid) && !isReadOnlyAttribute(harc.attribute),
    });
  }

  if (center.kind === "block") {
    if (center.page?.uid) {
      add(center.page, { kind: "structural", role: "parent", note: "page", sourceUid: null });
    }
    if (center.parent?.uid && center.parent.uid !== center.page?.uid) {
      add(center.parent, { kind: "structural", role: "parent", note: "parent block", sourceUid: center.parent.uid });
    }
  } else {
    const namespace = source.namespace ?? {};
    if (namespace.parent) add(namespace.parent, { kind: "structural", role: "parent", note: "namespace", sourceUid: null });
    for (const page of namespace.children ?? []) {
      add(page, { kind: "structural", role: "child", note: "namespace", sourceUid: null });
    }
    if (source.days?.previous) add(source.days.previous, { kind: "structural", role: "previous", note: "day", sourceUid: null });
    if (source.days?.next) add(source.days.next, { kind: "structural", role: "next", note: "day", sourceUid: null });
  }

  const mentionBlocks = [];
  if (settings.links) {
    walk(source.outline, (block) => {
      if (typedValueBlocks.has(block.uid)) return;
      const attribute = parseAttribute(block.string);
      if (attribute && typedSources.has(block.uid) && tailShape(attribute.tail).kind === "refs") return;
      for (const ref of linkRefs(block)) {
        add(ref, { kind: "link", role: "child", sourceUid: block.uid });
      }
    });
    for (const mention of source.mentions ?? []) {
      if (!mention?.uid || inboundSources.has(mention.uid) || outline.index.has(mention.uid)) continue;
      if (mention.uid === centerUid || !mention.page?.uid || mention.page.uid === centerUid) continue;
      add(mention.page, { kind: "mention", role: "parent", sourceUid: mention.uid });
      mentionBlocks.push(mention);
    }
  }

  const nodes = [];
  for (const [uid, items] of evidence) {
    const entity = entities.get(uid);
    const picked = pickRole(items);
    const typed = picked.strongest.filter((item) => item.kind === "typed");
    nodes.push({
      uid,
      kind: kindOf(entity),
      title: titleOf(entity) || uid,
      string: typeof entity?.string === "string" ? entity.string : "",
      role: picked.role,
      zone: ZONE_OF[picked.role],
      strength: picked.strength,
      style: picked.strongest[0].kind,
      evidence: items,
      label: [...new Set(typed.map((item) => [item.attribute, ...item.labels].join(" · ")))].join(" | "),
      writable: typed.length === 1 && typed[0].writable ? typed[0] : null,
      via: null,
    });
  }

  const placed = new Set(nodes.map((node) => node.uid));
  if (settings.siblings) {
    const north = new Set(nodes.filter((node) => node.zone === "north").map((node) => node.uid));
    const siblings = new Map();
    const addSibling = (entity, via, item) => {
      if (!isNode(entity) || entity.uid === centerUid || placed.has(entity.uid) || !north.has(via)) return;
      const existing = siblings.get(entity.uid);
      if (existing) {
        existing.evidence.push(item);
        return;
      }
      siblings.set(entity.uid, {
        uid: entity.uid,
        kind: kindOf(entity),
        title: titleOf(entity) || entity.uid,
        string: typeof entity.string === "string" ? entity.string : "",
        role: "sibling",
        zone: "siblings",
        strength: 0,
        style: "sibling",
        evidence: [item],
        label: "",
        writable: null,
        via,
      });
    };
    for (const peer of source.peers ?? []) {
      for (const item of peer.incoming ?? []) {
        if (roleOf(item.attribute, settings)?.role !== "parent") continue;
        addSibling(item.entity, peer.parentUid, { kind: "sibling", role: "sibling", attribute: item.attribute, sourceUid: null });
      }
      for (const item of peer.outgoing ?? []) {
        if (roleOf(item.attribute, settings)?.role !== "child") continue;
        addSibling(item.value, peer.parentUid, { kind: "sibling", role: "sibling", attribute: item.attribute, sourceUid: null });
      }
    }
    if (center.kind === "block") {
      const via = center.parent?.uid ?? center.page?.uid;
      for (const block of center.siblings ?? []) {
        addSibling(block, via, { kind: "sibling", role: "sibling", note: "sibling block", sourceUid: block.uid });
      }
    } else {
      for (const page of source.namespace?.siblings ?? []) {
        addSibling(page, source.namespace?.parent?.uid, { kind: "sibling", role: "sibling", note: "namespace", sourceUid: null });
      }
    }
    for (const mention of mentionBlocks) {
      for (const ref of linkRefs(mention)) {
        if (ref.uid === mention.page.uid) continue;
        addSibling(ref, mention.page.uid, { kind: "sibling", role: "sibling", note: "mentioned together", sourceUid: mention.uid });
      }
    }
    nodes.push(...siblings.values());
  }

  const overflow = {};
  const kept = [];
  for (const zone of ZONES) {
    const members = nodes.filter((node) => node.zone === zone).sort(compareNodes);
    const limit = expanded.has(zone) ? Math.max(settings.maxPerZone, 200) : settings.maxPerZone;
    kept.push(...members.slice(0, limit));
    if (members.length > settings.maxPerZone) {
      overflow[zone] = { shown: Math.min(limit, members.length), total: members.length };
    }
  }
  const keptUids = new Set(kept.map((node) => node.uid));
  for (const node of kept) if (node.via && !keptUids.has(node.via)) node.via = null;

  return {
    center: {
      uid: centerUid,
      kind: center.kind === "block" ? "block" : "page",
      title: center.kind === "block" ? (drawingTitle(center.string, 120) ?? plainText(center.string, 120)) || centerUid : center.title || centerUid,
      badges,
    },
    nodes: kept,
    overflow,
    outline: outline.rows,
    outlineIndex: outline.index,
    settings,
  };
}
