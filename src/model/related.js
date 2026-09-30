const CAP = 50;

function centreSet(centreRefs) {
  if (centreRefs instanceof Set) return centreRefs.size > 0 ? centreRefs : null;
  if (!Array.isArray(centreRefs) || centreRefs.length === 0) return null;
  return new Set(centreRefs);
}

function scoreOf(refs, centre) {
  if (!Array.isArray(refs) || refs.length === 0) return 0;
  const seen = new Set();
  let score = 0;
  for (const ref of refs) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    if (centre.has(ref)) score += 1;
  }
  return score;
}

export function rankDrawings(centreRefs, rows) {
  const centre = centreSet(centreRefs);
  if (!centre || !Array.isArray(rows) || rows.length === 0) return [];
  const ranked = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const score = scoreOf(row.refs, centre);
    if (score > 0) ranked.push({ row, score });
  }
  ranked.sort((a, b) => b.score - a.score || (b.row.editTime ?? 0) - (a.row.editTime ?? 0));
  return ranked.slice(0, CAP).map((item) => item.row);
}
