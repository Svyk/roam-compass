const REGION_PREFIX = "{{[[plexus-region]]";
const DRAWING_PREFIXES = ["{{[[excalidraw]]}}", "{{excalidraw}}"];
const URL_RUN = /https?:\/\/[^\s)]+/gi;

function blockText(node) {
  return typeof node?.string === "string" ? node.string.trimStart() : "";
}

function isRegion(node) {
  return blockText(node).startsWith(REGION_PREFIX);
}

// An Excalidraw macro. A plexus region is never a drawing, even if the rest of the string says excalidraw.
function isDrawing(node) {
  if (isRegion(node)) return false;
  const text = blockText(node);
  return DRAWING_PREFIXES.some((prefix) => text.startsWith(prefix));
}

function chipKeeps(node, flags) {
  const region = isRegion(node);
  const drawing = isDrawing(node);
  if (flags.pages && node.kind === "page") return true;
  if (flags.blocks && node.kind === "block" && !drawing && !region) return true;
  if (flags.drawings && drawing) return true;
  if (flags.regions && region) return true;
  return false;
}

function keywordHits(node, keyword) {
  const needle = String(keyword ?? "").trim().toLowerCase();
  if (!needle) return true;
  const title = typeof node.title === "string" ? node.title.toLowerCase() : "";
  const alias = typeof node.alias === "string" ? node.alias.toLowerCase() : "";
  return title.includes(needle) || alias.includes(needle);
}

// Uids hidden by a chip or by the keyword. Every chip on and an empty keyword hides nothing.
export function hiddenUids(nodes, opts = {}) {
  const flags = {
    pages: opts.pages ?? true,
    blocks: opts.blocks ?? true,
    drawings: opts.drawings ?? true,
    regions: opts.regions ?? true,
  };
  if (!Array.isArray(nodes)) return [];
  const hidden = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    if (!chipKeeps(node, flags) || !keywordHits(node, opts.keyword ?? "")) hidden.push(node.uid);
  }
  return hidden;
}

function hostOf(raw) {
  let hostname;
  try {
    hostname = new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
  if (hostname.startsWith("www.")) hostname = hostname.slice(4);
  return hostname;
}

// http(s) runs, cut at whitespace or ")". Hosts are lowercased with one leading "www." removed.
export function urlGroups(strings, { hosts = 4, perHost = 4 } = {}) {
  const order = [];
  const grouped = new Map();
  if (!Array.isArray(strings)) return [];
  for (const item of strings) {
    if (typeof item !== "string") continue;
    URL_RUN.lastIndex = 0;
    let match;
    while ((match = URL_RUN.exec(item))) {
      const host = hostOf(match[0]);
      if (!host) continue;
      let urls = grouped.get(host);
      if (!urls) {
        if (order.length >= hosts) continue;
        urls = [];
        grouped.set(host, urls);
        order.push(host);
      }
      if (urls.length >= perHost) continue;
      urls.push(match[0]);
    }
  }
  return order.map((host) => ({ host, urls: grouped.get(host) }));
}

// The input uid is a :block/uid value on ?src. It is not bound as the entity id.
export const CROSS_QUERY = "[:find ?suid ?duid :in $ [?uid ...] :where [?src :block/uid ?uid] [?src :block/children ?ch] [?ch :block/refs ?dst] [?src :block/uid ?suid] [?dst :block/uid ?duid]]";

export function crossEdges(rows, uids, cap = 40) {
  const allowed = uids instanceof Set ? uids : new Set(Array.isArray(uids) ? uids : []);
  const limit = cap ?? 40;
  const seen = new Map();
  const edges = [];
  if (!Array.isArray(rows)) return [];
  for (const row of rows) {
    if (edges.length >= limit) break;
    if (!Array.isArray(row) || row.length !== 2) continue;
    const [source, target] = row;
    if (!allowed.has(source) || !allowed.has(target) || source === target) continue;
    let targets = seen.get(source);
    if (!targets) {
      targets = new Set();
      seen.set(source, targets);
    }
    if (targets.has(target)) continue;
    targets.add(target);
    edges.push({ source, target });
  }
  return edges;
}

export function isEmptyPage(kind, childCount) {
  return kind === "page" && childCount === 0;
}

export const ZONE_ATTR = Object.freeze({
  north: "Parent",
  south: "Child",
  west: "Friend",
  east: "Challenger",
});

export function planZoneCreate({ existingDrawingUid } = {}) {
  if (typeof existingDrawingUid === "string" && existingDrawingUid.length > 0) {
    return { create: false, drawingUid: existingDrawingUid };
  }
  return { create: true, drawingUid: null };
}

function refused(reason) {
  return { ops: [], reason };
}

export function planAttributeWrite({ attribute, title, existing } = {}) {
  if (typeof attribute !== "string" || attribute.trim() === "") return refused("attribute");
  if (typeof title !== "string" || title.includes("[") || title.includes("]")) return refused("title");
  const ref = `[[${title}]]`;
  if (existing == null) return { ops: [{ op: "create", string: `${attribute}:: ${ref}` }] };
  const current = typeof existing.string === "string" ? existing.string : String(existing.string ?? "");
  if (current.includes(ref)) return refused("have");
  return { ops: [{ op: "update", uid: existing.uid, string: `${current.trim()} ${ref}` }] };
}
