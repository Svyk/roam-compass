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
