const MIN_SECONDS = 3;
const MAX_SECONDS = 15;
const DEFAULT_SECONDS = 6;

export function clampSeconds(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return DEFAULT_SECONDS;
    return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.trunc(value)));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return DEFAULT_SECONDS;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return DEFAULT_SECONDS;
    return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.trunc(parsed)));
  }
  return DEFAULT_SECONDS;
}

export function pickNext(candidates, recent, random = Math.random) {
  if (!candidates || typeof candidates[Symbol.iterator] !== "function") return null;
  const visited = new Set();
  if (recent && typeof recent[Symbol.iterator] !== "function") {
    // Ignore non-iterable recent values.
  } else if (recent) {
    for (const uid of recent) {
      if (typeof uid === "string" && uid) visited.add(uid);
    }
  }
  const unvisited = [];
  const seen = new Set();
  for (const uid of candidates) {
    if (typeof uid !== "string" || !uid || seen.has(uid) || visited.has(uid)) continue;
    seen.add(uid);
    unvisited.push(uid);
  }
  if (!unvisited.length) return null;
  const fn = typeof random === "function" ? random : Math.random;
  const raw = Number(fn());
  const unit = Number.isFinite(raw) ? Math.min(0.999999999999, Math.max(0, raw)) : 0;
  return unvisited[Math.floor(unit * unvisited.length)];
}

export function reduce(state, event) {
  const mode = state?.mode === "playing" || state?.mode === "paused" ? state.mode : "idle";
  const reason = typeof state?.reason === "string" && state.reason ? state.reason : null;
  const type = typeof event === "string" ? event : event?.type;

  if (type === "stop") return { mode: "idle", reason: null };

  if (mode === "idle") {
    if (type === "start") return { mode: "playing", reason: null };
    return { mode: "idle", reason: null };
  }

  if (mode === "playing") {
    if (type === "pause" || type === "manual") return { mode: "paused", reason: null };
    if (type === "exhausted") return { mode: "paused", reason: "exhausted" };
    return { mode: "playing", reason: null };
  }

  if (type === "resume" || type === "start") return { mode: "playing", reason: null };
  if (type === "exhausted") return { mode: "paused", reason: "exhausted" };
  return { mode: "paused", reason };
}
