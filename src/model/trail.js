const DEFAULT_CAP = 500;

export function formatRelativeTime(at, now = Date.now()) {
  if (!Number.isFinite(at) || !Number.isFinite(now)) return "now";
  const diffMs = Math.max(0, now - at);
  if (diffMs < 60_000) return "now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(diffMs / 86_400_000);
  return `${days} d`;
}

function normalizeCap(raw) {
  if (raw == null || raw === "") return DEFAULT_CAP;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_CAP;
  return Math.trunc(parsed);
}

export function createTrail({ cap = DEFAULT_CAP, clock, now } = {}) {
  const limit = normalizeCap(cap);
  const readTime = typeof clock === "function"
    ? clock
    : typeof now === "function"
      ? now
      : () => Date.now();
  const items = [];
  let seq = 0;

  function copy(entry) {
    return entry ? { ...entry } : null;
  }

  return {
    get size() {
      return items.length;
    },

    visit({ uid, title, kind } = {}) {
      if (typeof uid !== "string" || !uid.trim()) return null;
      seq += 1;
      const entry = {
        uid,
        title: typeof title === "string" && title ? title : uid,
        kind: kind === "block" ? "block" : "page",
        at: Number(readTime()),
        seq,
      };
      if (limit > 0) {
        items.push(entry);
        while (items.length > limit) items.shift();
      }
      return copy(entry);
    },

    entries() {
      const out = [];
      for (let i = items.length - 1; i >= 0; i -= 1) {
        out.push(copy(items[i]));
      }
      return out;
    },

    current() {
      return items.length ? copy(items[items.length - 1]) : null;
    },

    startHere() {
      if (items.length > 1) items.splice(0, items.length - 1);
      return items.length ? copy(items[0]) : null;
    },

    markdown() {
      if (!items.length) return "";
      const lines = [];
      for (let i = items.length - 1; i >= 0; i -= 1) {
        const entry = items[i];
        lines.push(entry.kind === "block" ? `- ((${entry.uid}))` : `- [[${entry.title || entry.uid}]]`);
      }
      return lines.join("\n");
    },

    retitle(uid, title) {
      if (typeof uid !== "string" || !uid || typeof title !== "string" || !title) return 0;
      let updated = 0;
      for (const entry of items) {
        if (entry.uid === uid) {
          entry.title = title;
          updated += 1;
        }
      }
      return updated;
    },
  };
}
