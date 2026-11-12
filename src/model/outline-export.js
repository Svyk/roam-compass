const INDENT = "    ";

const SIDES = Object.freeze([
  Object.freeze(["north", "Parents"]),
  Object.freeze(["south", "Children"]),
  Object.freeze(["west", "Friends"]),
  Object.freeze(["east", "Challengers"]),
  Object.freeze(["siblings", "Siblings"]),
]);

function resolveOptions(options) {
  if (Array.isArray(options)) {
    return { labels: "visible", hidden: new Set(), warnings: options };
  }
  const raw = options && typeof options === "object" ? options : {};
  const labels = raw.labels === "none" || raw.labels === "all" ? raw.labels : "visible";
  const hidden = raw.hidden instanceof Set
    ? raw.hidden
    : new Set(Array.isArray(raw.hidden) ? raw.hidden : []);
  const warnings = Array.isArray(raw.warnings) ? raw.warnings : null;
  return { labels, hidden, warnings };
}

function createTracker() {
  return {
    unlinked: new Set(),
    hidden: new Set(),
  };
}

function flushWarnings(tracker, target) {
  if (!Array.isArray(target)) return;
  const unlinkedCount = tracker.unlinked.size;
  if (unlinkedCount > 0) {
    target.push(
      unlinkedCount === 1
        ? "1 title could not be written as a link."
        : `${unlinkedCount} titles could not be written as a link.`,
    );
  }
  const hiddenCount = tracker.hidden.size;
  if (hiddenCount > 0) {
    target.push(
      hiddenCount === 1
        ? "1 hidden node was left out."
        : `${hiddenCount} hidden nodes were left out.`,
    );
  }
}

function groupText(node) {
  const alias = typeof node?.alias === "string" ? node.alias.trim() : "";
  const title = typeof node?.title === "string" ? node.title.trim() : "";
  const fallback = typeof node?.uid === "string" ? node.uid.trim() : "";
  const base = alias || title || fallback || "Group";
  const count = Number.isFinite(node?.count)
    ? node.count
    : Array.isArray(node?.members)
      ? node.members.length
      : Array.isArray(node?.nodes)
        ? node.nodes.length
        : Array.isArray(node?.uids)
          ? node.uids.length
          : Array.isArray(node?.items)
            ? node.items.length
            : null;
  if (count == null) return base;
  if (base.includes(`(${count})`) || new RegExp(`(?:^|\\D)${count}(?:\\D|$)`).test(base)) {
    return base;
  }
  return `${title || base} (${count})`;
}

function formatNodeRef(node, tracker) {
  if (!node || typeof node !== "object") return "";
  if (node.kind === "group") return groupText(node);
  if (node.kind === "block") {
    const uid = typeof node.uid === "string" ? node.uid.trim() : "";
    if (uid) return `((${uid}))`;
    return typeof node.title === "string" ? node.title.trim() : "";
  }
  const title = typeof node.title === "string" && node.title
    ? node.title
    : (typeof node.uid === "string" ? node.uid : "");
  if (!title) return "";
  if (title.includes("]]")) {
    tracker.unlinked.add(typeof node.uid === "string" && node.uid ? `uid:${node.uid}` : `title:${title}`);
    return title;
  }
  return `[[${title}]]`;
}

function untypedEvidenceLabel(node) {
  const kinds = [];
  const add = (value) => {
    if (value && !kinds.includes(value)) kinds.push(value);
  };
  if (Array.isArray(node?.evidence)) {
    for (const item of node.evidence) {
      if (!item || typeof item !== "object") continue;
      if (item.kind === "typed") {
        const parts = [item.attribute, ...(Array.isArray(item.labels) ? item.labels : [])].filter(Boolean);
        if (parts.length) add(parts.join(" · "));
      } else if (item.kind === "structural") {
        if (item.note === "day") add("day");
        else if (item.note === "namespace") add("namespace");
        else if (typeof item.note === "string" && item.note.trim()) add(item.note.trim());
      } else if (
        item.kind === "link"
        || item.kind === "mention"
        || item.kind === "sibling"
        || item.kind === "namespace"
        || item.kind === "day"
      ) {
        add(item.kind);
      }
    }
  }
  if (!kinds.length) {
    const style = typeof node?.style === "string" ? node.style.trim() : "";
    if (
      style === "link"
      || style === "mention"
      || style === "sibling"
      || style === "namespace"
      || style === "day"
    ) {
      add(style);
    } else if (style === "structural") {
      add(node?.role === "previous" || node?.role === "next" ? "day" : "namespace");
    } else if (node?.role === "sibling") {
      add("sibling");
    }
  }
  return kinds.join(" | ");
}

function relationLabel(node, labelsMode) {
  if (labelsMode === "none") return "";
  const explicit = typeof node?.label === "string" ? node.label.trim() : "";
  if (explicit) return explicit;
  if (labelsMode !== "all" || node?.kind === "group") return "";
  return untypedEvidenceLabel(node);
}

function formatBulletText(node, labelsMode, tracker) {
  const ref = formatNodeRef(node, tracker);
  if (!ref) return "";
  const rel = relationLabel(node, labelsMode);
  return rel ? `${ref} — ${rel}` : ref;
}

function lineAt(depth, text) {
  return `${INDENT.repeat(depth)}- ${text}`;
}

export function linkOf(node, options = {}) {
  const { warnings } = resolveOptions(options);
  const tracker = createTracker();
  const text = formatNodeRef(node, tracker);
  flushWarnings(tracker, warnings);
  return text;
}

export function compassOutline(hood, options = {}) {
  const { labels, hidden, warnings } = resolveOptions(options);
  const center = hood?.center;
  if (!center || typeof center !== "object") return "";
  const tracker = createTracker();
  const topText = formatNodeRef(center, tracker);
  if (!topText) return "";

  const lines = [lineAt(0, topText)];
  const nodes = Array.isArray(hood?.nodes) ? hood.nodes : [];

  for (const [zone, heading] of SIDES) {
    const section = [];
    for (const node of nodes) {
      if (!node || node.zone !== zone) continue;
      if (typeof node.uid === "string" && node.uid && hidden.has(node.uid)) {
        tracker.hidden.add(node.uid);
        continue;
      }
      const bullet = formatBulletText(node, labels, tracker);
      if (bullet) section.push(lineAt(2, bullet));
    }
    if (section.length > 0) {
      lines.push(lineAt(1, heading), ...section);
    }
  }

  flushWarnings(tracker, warnings);
  return lines.join("\n");
}

export function treeOutline(outline, options = {}) {
  const { labels, hidden, warnings } = resolveOptions(options);
  const root = outline?.root;
  if (!root || typeof root !== "object") return "";
  const tracker = createTracker();
  const rootText = formatNodeRef(root, tracker);
  if (!rootText) return "";

  const lines = [lineAt(0, rootText)];

  function writeItem(item, depth, out) {
    if (!item || typeof item !== "object") return;
    if (typeof item.uid === "string" && item.uid && hidden.has(item.uid)) {
      tracker.hidden.add(item.uid);
      return;
    }
    const repeat = item.status === "repeat" || item.repeat === true;
    const base = formatBulletText(item, labels, tracker);
    if (!base) return;
    out.push(lineAt(depth, repeat ? `${base} ↺` : base));
    if (repeat || !Array.isArray(item.children)) return;
    for (const child of item.children) {
      writeItem(child, depth + 1, out);
    }
  }

  const parents = Array.isArray(outline?.parents) ? outline.parents : [];
  if (parents.length > 0) {
    const parentLines = [];
    for (const parent of parents) {
      writeItem(parent, 2, parentLines);
    }
    if (parentLines.length > 0) {
      lines.push(lineAt(1, "Parents"), ...parentLines);
    }
  }

  const rootRepeat = root.status === "repeat" || root.repeat === true;
  if (!rootRepeat && Array.isArray(root.children)) {
    for (const child of root.children) {
      writeItem(child, 1, lines);
    }
  }

  flushWarnings(tracker, warnings);
  return lines.join("\n");
}

function lookupNode(nodesByUid, uid) {
  if (!uid || !nodesByUid) return null;
  if (nodesByUid instanceof Map) return nodesByUid.get(uid) ?? null;
  if (typeof nodesByUid === "object") return nodesByUid[uid] ?? null;
  return null;
}

function resolveFacetEntry(entry, nodesByUid) {
  if (typeof entry === "string") {
    const trimmed = entry.trim();
    if (!trimmed) return null;
    return lookupNode(nodesByUid, trimmed) ?? { uid: trimmed, kind: "page", title: trimmed };
  }
  if (!entry || typeof entry !== "object") return null;
  const uid = typeof entry.uid === "string" ? entry.uid : "";
  const stored = uid ? lookupNode(nodesByUid, uid) : null;
  return stored ? { ...entry, ...stored } : entry;
}

export function facetsOutline(classified, nodesByUid, center, options = {}) {
  const { labels, hidden, warnings } = resolveOptions(options);
  const effectiveCenter = center ?? classified?.center;
  if (!classified || typeof classified !== "object" || !effectiveCenter || typeof effectiveCenter !== "object") {
    return "";
  }
  const tracker = createTracker();
  const topText = formatNodeRef(effectiveCenter, tracker);
  if (!topText) return "";

  const lines = [lineAt(0, topText)];

  function writeBucket(heading, rawEntries) {
    if (!heading || !Array.isArray(rawEntries) || rawEntries.length === 0) return;
    const section = [];
    for (const raw of rawEntries) {
      const node = resolveFacetEntry(raw, nodesByUid);
      if (!node) continue;
      if (typeof node.uid === "string" && node.uid && hidden.has(node.uid)) {
        tracker.hidden.add(node.uid);
        continue;
      }
      const bullet = formatBulletText(node, labels, tracker);
      if (bullet) section.push(lineAt(2, bullet));
    }
    if (section.length > 0) {
      lines.push(lineAt(1, heading), ...section);
    }
  }

  const categories = Array.isArray(classified.categories)
    ? classified.categories
    : Array.isArray(classified.buckets)
      ? classified.buckets
      : Array.isArray(classified.columns)
        ? classified.columns
        : [];

  for (const cat of categories) {
    if (!cat || typeof cat !== "object") continue;
    const heading = String(cat.label ?? cat.name ?? cat.title ?? cat.id ?? "").trim();
    const entries = cat.uids ?? cat.nodes ?? cat.items ?? cat.members ?? [];
    writeBucket(heading, entries);
  }

  writeBucket("Unassigned", classified.unassigned);
  writeBucket("Conflicting", classified.conflicting ?? classified.conflicts);

  flushWarnings(tracker, warnings);
  return lines.join("\n");
}

export function breadcrumbs(entries, options = {}) {
  const { warnings } = resolveOptions(options);
  if (!Array.isArray(entries) || entries.length === 0) return "";
  const valid = entries.filter((item) => item && typeof item === "object");
  if (valid.length === 0) return "";

  const hasTimestamps = valid.some((item) => Number.isFinite(item.at));
  const ordered = hasTimestamps
    ? [...valid].sort((a, b) => {
        const atA = Number.isFinite(a.at) ? a.at : -Infinity;
        const atB = Number.isFinite(b.at) ? b.at : -Infinity;
        return atB - atA;
      })
    : valid;

  const tracker = createTracker();
  const lines = [];
  for (const entry of ordered) {
    const ref = formatNodeRef(entry, tracker);
    if (ref) lines.push(lineAt(0, ref));
  }
  flushWarnings(tracker, warnings);
  return lines.join("\n");
}
