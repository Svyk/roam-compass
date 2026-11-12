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
  let onBoard = [];
  try {
    onBoard = listOf(api.boardsWith(centerUid)).map((row) => nodeOf(row, { role: "west", label: "On board" }));
  } catch {
    return [];
  }
  if (typeof api.boardsOn !== "function") return onBoard;
  let onPage = [];
  try {
    onPage = listOf(api.boardsOn(centerUid)).map((row) => nodeOf(row, { role: "west", label: "Board on this page" }));
  } catch {
    return onBoard;
  }
  const seen = new Set();
  for (const node of onBoard) {
    if (typeof node.uid === "string" && node.uid) seen.add(node.uid);
  }
  const extra = [];
  for (const node of onPage) {
    if (typeof node.uid !== "string" || !node.uid || seen.has(node.uid)) continue;
    seen.add(node.uid);
    extra.push(node);
  }
  return [...onBoard, ...extra];
}

// One board opens. Several boards pick. This does not call PlexusDiagram.
export function showBoardPlan(boards) {
  if (!Array.isArray(boards) || boards.length === 0) return { mode: "none" };
  if (boards.length === 1) return { mode: "open", board: boards[0] };
  return { mode: "picker", boards };
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

// Block refs and page refs, in string order. A `{{[[macro]]}}` name is not a page.
function connectionEnds(text) {
  const ends = [];
  const refs = /\[\[([^[\]]*)\]\]|\(\(([^)]*)\)\)/g;
  for (const match of text.matchAll(refs)) {
    const at = match.index ?? 0;
    if (match[1] != null) {
      if (text[at - 1] === "{") continue;
      if (match[1]) ends.push(match[1]);
    } else if (match[2]) ends.push(match[2]);
    if (ends.length >= 2) break;
  }
  return ends;
}

// Connection children are read by the overlay. This only splits the string.
function childText(child) {
  if (typeof child === "string") return child;
  if (!child || typeof child !== "object") return "";
  if (typeof child.string === "string") return child.string;
  if (typeof child[":block/string"] === "string") return child[":block/string"];
  return "";
}

export const BOARD_FILTER_MIN = 13;

export function apiHas(api, name) {
  if (!api || typeof api[name] !== "function") return false;
  const caps = api.capabilities;
  return Array.isArray(caps) && caps.includes(name);
}

export function needsBoardFilter(count) {
  return count >= BOARD_FILTER_MIN;
}

function readRows(fn, ...args) {
  if (typeof fn !== "function") return [];
  try {
    const value = fn(...args);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function boardTitle(row) {
  return typeof row?.title === "string" && row.title.trim() ? row.title.trim() : "Untitled board";
}

function byBoardTitle(a, b) {
  const at = a.title.toLowerCase();
  const bt = b.title.toLowerCase();
  if (at !== bt) return at < bt ? -1 : 1;
  return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
}

// Boards the picker can offer. listBoards wins when that capability is present.
export function pickerBoards(api, options = {}) {
  if (!api || typeof api !== "object") return [];
  const centerUid = typeof options.centerUid === "string" ? options.centerUid : "";
  const nodeUid = typeof options.nodeUid === "string" ? options.nodeUid : "";
  const markHeld = options.markHeld !== false;
  const held = new Set();
  if (markHeld && nodeUid && typeof api.boardsWith === "function") {
    for (const row of readRows(api.boardsWith, nodeUid)) {
      if (typeof row?.uid === "string" && row.uid) held.add(row.uid);
    }
  }
  if (apiHas(api, "listBoards")) {
    const seen = new Set();
    const mapped = [];
    for (const row of readRows(api.listBoards)) {
      if (typeof row?.uid !== "string" || !row.uid || seen.has(row.uid)) continue;
      seen.add(row.uid);
      const title = boardTitle(row);
      const pageTitle = typeof row.pageTitle === "string" ? row.pageTitle.trim() : "";
      mapped.push({
        uid: row.uid,
        title,
        pageTitle,
        label: pageTitle ? `${title} \u2014 ${pageTitle}` : title,
        already: held.has(row.uid),
      });
    }
    mapped.sort(byBoardTitle);
    return mapped;
  }
  const seen = new Set();
  const out = [];
  const push = (row) => {
    if (typeof row?.uid !== "string" || !row.uid || seen.has(row.uid)) return;
    seen.add(row.uid);
    const title = boardTitle(row);
    out.push({
      uid: row.uid,
      title,
      pageTitle: "",
      label: title,
      already: held.has(row.uid),
    });
  };
  if (centerUid) {
    for (const row of readRows(api.boardsWith, centerUid)) push(row);
    for (const row of readRows(api.boardsOn, centerUid)) push(row);
  }
  if (nodeUid && nodeUid !== centerUid) {
    for (const row of readRows(api.boardsWith, nodeUid)) push(row);
  }
  out.sort(byBoardTitle);
  return out;
}

export function filterBoards(boards, query) {
  const list = Array.isArray(boards) ? boards : [];
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return [...list];
  return list.filter((board) => {
    const label = `${board?.label ?? ""} ${board?.title ?? ""}`.toLowerCase();
    return label.includes(needle);
  });
}

export function savedViews(api, boardUid) {
  if (!api || typeof api.viewsOf !== "function" || !boardUid) return [];
  let rows = [];
  try {
    const value = api.viewsOf(boardUid);
    rows = Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
  const out = [];
  for (const view of rows) {
    if (out.length >= 8) break;
    if (!view || typeof view.uid !== "string" || !view.uid) continue;
    const caption = typeof view.caption === "string" ? view.caption.trim() : "";
    out.push({ uid: view.uid, title: caption ? `View: ${caption}` : "View" });
  }
  return out;
}

export function connectionEdges(children) {
  const out = [];
  const list = Array.isArray(children) ? children : [];
  for (const child of list) {
    const text = childText(child);
    if (!text) continue;
    const ends = connectionEnds(text);
    if (ends.length < 2) continue;
    out.push({ from: ends[0], to: ends[1], label: connectionLabel(text) });
  }
  return out;
}
