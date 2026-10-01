function subsequence(needle, haystack) {
  let at = 0;
  let gaps = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, at);
    if (found < 0) return -1;
    gaps += found - at;
    at = found + 1;
  }
  return gaps;
}

function score(query, title) {
  const text = title.toLowerCase();
  if (text === query) return 0;
  if (text.startsWith(query)) return 1 + text.length / 1000;
  const word = text.search(new RegExp(`(^|[\\s/_(-])${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  if (word >= 0) return 2 + word / 1000;
  const at = text.indexOf(query);
  if (at >= 0) return 3 + at / 1000;
  const gaps = subsequence(query, text);
  if (gaps >= 0 && gaps <= query.length * 3) return 4 + gaps / 100;
  return null;
}

// Exact, then prefix, then word-start, then substring, then a loose in-order match.
export function rankTitles(entries, input, limit = 20) {
  const query = String(input ?? "").trim().toLowerCase();
  if (!query) return [];
  const ranked = [];
  for (const entry of entries ?? []) {
    if (!entry?.uid || typeof entry.title !== "string") continue;
    const value = score(query, entry.title);
    if (value != null) ranked.push({ ...entry, score: value });
  }
  ranked.sort((a, b) => a.score - b.score || a.title.length - b.title.length || (a.title < b.title ? -1 : 1));
  return ranked.slice(0, limit).map(({ uid, title }) => ({ uid, title }));
}

function shownTitle(row) {
  return row.title ?? row.uid;
}

function hasUid(row) {
  return row?.uid != null && row.uid !== "";
}

export function emptyQueryRows({ pins = [], today = null, pages = [], drawings = [], limit = 8 } = {}) {
  const seen = new Set();
  const rows = [];

  for (const pin of pins ?? []) {
    if (!hasUid(pin) || seen.has(pin.uid)) continue;
    seen.add(pin.uid);
    rows.push({ uid: pin.uid, title: shownTitle(pin), kind: "pin" });
  }

  if (hasUid(today) && !seen.has(today.uid)) {
    seen.add(today.uid);
    rows.push({ uid: today.uid, title: shownTitle(today), kind: "today" });
  }

  const recent = [];
  for (const row of [...(pages ?? []), ...(drawings ?? [])]) {
    if (!hasUid(row) || !Number.isFinite(row.editTime)) continue;
    recent.push(row);
  }
  recent.sort((a, b) => {
    if (a.editTime !== b.editTime) return b.editTime - a.editTime;
    const left = shownTitle(a);
    const right = shownTitle(b);
    if (left < right) return -1;
    if (left > right) return 1;
    if (a.uid < b.uid) return -1;
    if (a.uid > b.uid) return 1;
    return 0;
  });

  let kept = 0;
  for (const row of recent) {
    if (kept >= limit) break;
    if (seen.has(row.uid)) continue;
    seen.add(row.uid);
    rows.push({ uid: row.uid, title: shownTitle(row), kind: "recent" });
    kept += 1;
  }
  return rows;
}
