// Board plans for Compass. Reads a Plexus API and never writes the graph.
// Arrow glyphs are copied from Plexus connection blocks; Compass does not import Plexus.

const ARROWS = ["→", "↔", "—"];

export function isBoardLike(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.startsWith("{{[[diagram]]") || text.startsWith("{{diagram");
}

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function nodeOf(row, extra) {
  const source = row && typeof row === "object" ? row : {};
  return { uid: source.uid, title: source.title, ...extra };
}

export function boardPlan(api, centerUid) {
  if (!api || typeof api.boardsWith !== "function") return [];
  try {
    return listOf(api.boardsWith(centerUid)).map((row) => nodeOf(row, { role: "west", label: "On board" }));
  } catch {
    return [];
  }
}

export function cardPlan(api, boardUid, cap) {
  if (!api || typeof api.cardsOf !== "function") return [];
  try {
    const nodes = listOf(api.cardsOf(boardUid)).map((row) => nodeOf(row, { role: "south" }));
    const limit = typeof cap === "number" && Number.isFinite(cap) ? Math.max(0, Math.trunc(cap)) : nodes.length;
    return nodes.slice(0, limit);
  } catch {
    return [];
  }
}

function arrowAt(text, from) {
  let at = -1;
  for (const arrow of ARROWS) {
    const found = text.indexOf(arrow, from);
    if (found !== -1 && (at === -1 || found < at)) at = found;
  }
  return at;
}

export function connectionLabel(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  const first = arrowAt(text, 0);
  if (first < 0) return "";
  let last = first;
  for (let next = arrowAt(text, first + 1); next !== -1; next = arrowAt(text, next + 1)) last = next;
  if (last === first) return "";
  return text.slice(first + 1, last).trim();
}

export function openArgs(boardUid, cardUid, sidebar) {
  return { boardUid, card: cardUid, sidebar: sidebar === true };
}

const BLOCK_REF = /\(\(([^)]+)\)\)/g;

// Connection children are read by the overlay. This only splits the string.
function childText(child) {
  if (typeof child === "string") return child;
  if (!child || typeof child !== "object") return "";
  if (typeof child.string === "string") return child.string;
  if (typeof child[":block/string"] === "string") return child[":block/string"];
  return "";
}

export function connectionEdges(children) {
  const out = [];
  const list = Array.isArray(children) ? children : [];
  for (const child of list) {
    const text = childText(child);
    if (!text) continue;
    const uids = [...text.matchAll(BLOCK_REF)].map((match) => match[1]);
    if (uids.length < 2) continue;
    out.push({ from: uids[0], to: uids[1], label: connectionLabel(text) });
  }
  return out;
}
