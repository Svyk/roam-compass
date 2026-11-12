const DIRECTIONS = new Set(["up", "down", "left", "right"]);

export const SHORTCUTS = Object.freeze([
  Object.freeze({ keys: "Arrow keys", action: "Move selection across the map", group: "Move and select" }),
  Object.freeze({ keys: "Alt+Arrow keys", action: "Jump to the area in that direction", group: "Move and select" }),
  Object.freeze({ keys: "Alt+0", action: "Select the center card", group: "Move and select" }),
  Object.freeze({ keys: "Letters, digits, Space", action: "Type to select a visible node", group: "Move and select" }),
  Object.freeze({ keys: "Tab / Shift+Tab", action: "Next or previous match while selecting", group: "Move and select" }),
  Object.freeze({ keys: "Escape", action: "Clear phrase, exit Zen or close Compass", group: "Move and select" }),
  Object.freeze({ keys: "Enter / Space", action: "Center the selected node", group: "Actions" }),
  Object.freeze({ keys: "Shift+Enter", action: "Open the selected node in the sidebar", group: "Actions" }),
  Object.freeze({ keys: "Ctrl/Cmd+Enter", action: "Open the selected node in the main window", group: "Actions" }),
  Object.freeze({ keys: "Backspace / Shift+Backspace", action: "Back or forward in history", group: "Actions" }),
  Object.freeze({ keys: "Alt+Left / Alt+Right", action: "Back or forward from the center", group: "Actions" }),
  Object.freeze({ keys: "Ctrl/Cmd+Arrow keys", action: "Add a related page on that side", group: "Actions" }),
  Object.freeze({ keys: "Alt+P", action: "Pin or unpin the selected node", group: "Actions" }),
  Object.freeze({ keys: "Alt+B", action: "Open periodic pins", group: "Actions" }),
  Object.freeze({ keys: "Alt+H", action: "Toggle trail", group: "Actions" }),
  Object.freeze({ keys: "Alt+M", action: "Open the selected node menu", group: "Actions" }),
  Object.freeze({ keys: "Alt+/ or Ctrl/Cmd+F", action: "Focus the search box", group: "Actions" }),
  Object.freeze({ keys: "Alt+.", action: "Open the command palette", group: "Actions" }),
  Object.freeze({ keys: "Alt+?", action: "Show keyboard help", group: "Actions" }),
]);

function keyOf(item) {
  if (typeof item?.key === "string" && item.key) return item.key;
  if (typeof item?.uid === "string" && item.uid) return item.uid;
  return "";
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const raw of items) {
    const key = keyOf(raw);
    if (!key || !Number.isFinite(raw?.x) || !Number.isFinite(raw?.y)) continue;
    out.push({
      key,
      uid: typeof raw.uid === "string" ? raw.uid : key,
      zone: typeof raw.zone === "string" ? raw.zone : "",
      x: raw.x,
      y: raw.y,
      w: Number.isFinite(raw.w) ? raw.w : 0,
      h: Number.isFinite(raw.h) ? raw.h : 0,
    });
  }
  return out;
}

function axes(dx, dy, direction) {
  if (direction === "up") return { primary: -dy, sideways: Math.abs(dx) };
  if (direction === "down") return { primary: dy, sideways: Math.abs(dx) };
  if (direction === "left") return { primary: -dx, sideways: Math.abs(dy) };
  if (direction === "right") return { primary: dx, sideways: Math.abs(dy) };
  return null;
}

function inCone(dx, dy, direction) {
  const projected = axes(dx, dy, direction);
  return Boolean(projected && projected.primary > 0 && projected.sideways <= projected.primary);
}

function readingOrder(a, b) {
  return a.y - b.y || a.x - b.x;
}

function bestByScore(pool, origin, direction) {
  let best = null;
  let bestScore = Infinity;
  let bestDist = Infinity;
  for (const item of pool) {
    if (item.key === origin.key) continue;
    const dx = item.x - origin.x;
    const dy = item.y - origin.y;
    const projected = axes(dx, dy, direction);
    if (!projected || projected.primary <= 0) continue;
    const score = projected.primary + 2 * projected.sideways;
    const dist = Math.hypot(dx, dy);
    if (
      score < bestScore
      || (score === bestScore && dist < bestDist)
      || (score === bestScore && dist === bestDist && best && readingOrder(item, best) < 0)
    ) {
      best = item;
      bestScore = score;
      bestDist = dist;
    }
  }
  return best;
}

export function step(items, currentKey, direction) {
  if (!DIRECTIONS.has(direction)) return null;
  const list = normalizeItems(items);
  if (!list.length) return null;
  const current = typeof currentKey === "string" && currentKey
    ? list.find((item) => item.key === currentKey) ?? null
    : null;

  if (!current || current.zone === "center") {
    const ox = current ? current.x : 0;
    const oy = current ? current.y : 0;
    let nearest = null;
    let nearestDist = Infinity;
    for (const item of list) {
      if (item.zone === "center" || item.key === current?.key) continue;
      const dx = item.x - ox;
      const dy = item.y - oy;
      if (!inCone(dx, dy, direction)) continue;
      const dist = Math.hypot(dx, dy);
      if (dist < nearestDist || (dist === nearestDist && nearest && readingOrder(item, nearest) < 0)) {
        nearest = item;
        nearestDist = dist;
      }
    }
    return nearest ? nearest.key : null;
  }

  if (current.zone) {
    const sameZone = list.filter((item) => item.zone === current.zone);
    const within = bestByScore(sameZone, current, direction);
    if (within) return within.key;
  }
  const crossed = bestByScore(list, current, direction);
  return crossed ? crossed.key : null;
}

export function jump(items, direction) {
  if (!DIRECTIONS.has(direction)) return null;
  const list = normalizeItems(items);
  if (!list.length) return null;
  const center = list.find((item) => item.zone === "center") ?? null;
  const cx = center ? center.x : 0;
  const cy = center ? center.y : 0;

  const byZone = new Map();
  for (const item of list) {
    if (!item.zone || item.zone === "center") continue;
    const group = byZone.get(item.zone);
    if (group) group.push(item);
    else byZone.set(item.zone, [item]);
  }

  let bestMembers = null;
  let bestPrimary = -Infinity;
  for (const members of byZone.values()) {
    let sumDx = 0;
    let sumDy = 0;
    for (const item of members) {
      sumDx += item.x - cx;
      sumDy += item.y - cy;
    }
    const avgDx = sumDx / members.length;
    const avgDy = sumDy / members.length;
    if (!inCone(avgDx, avgDy, direction)) continue;
    const projected = axes(avgDx, avgDy, direction);
    if (projected && projected.primary > bestPrimary) {
      bestPrimary = projected.primary;
      bestMembers = members;
    }
  }

  if (!bestMembers) return null;
  let nearest = null;
  let nearestDist = Infinity;
  for (const item of bestMembers) {
    const dist = Math.hypot(item.x - cx, item.y - cy);
    if (dist < nearestDist || (dist === nearestDist && nearest && readingOrder(item, nearest) < 0)) {
      nearest = item;
      nearestDist = dist;
    }
  }
  return nearest ? nearest.key : null;
}

function readLabel(labels, key) {
  if (!labels) return "";
  const raw = labels instanceof Map ? labels.get(key) : labels[key];
  return typeof raw === "string" ? raw : "";
}

export function matches(items, labels, phrase) {
  if (typeof phrase !== "string" || phrase.length === 0) return [];
  const list = normalizeItems(items);
  if (!list.length || !labels) return [];
  const needle = phrase.toLowerCase();
  const hits = [];
  for (const item of list) {
    const label = readLabel(labels, item.key);
    if (label && label.toLowerCase().includes(needle)) hits.push(item);
  }
  hits.sort(readingOrder);
  const out = [];
  const seen = new Set();
  for (const item of hits) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    out.push(item.key);
  }
  return out;
}

export function cycle(keys, currentKey, delta = 1) {
  if (!Array.isArray(keys) || keys.length === 0) return null;
  const index = keys.indexOf(currentKey);
  if (index < 0) return keys[0];
  const stepCount = Number.isFinite(delta) ? Math.trunc(delta) : 1;
  const next = ((index + stepCount) % keys.length + keys.length) % keys.length;
  return keys[next];
}
