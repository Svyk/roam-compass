import { ROLES, modelSettings } from "./neighborhood.js";
import { normalizeView } from "./views.js";

function extractPairs(pairMap) {
  if (!(pairMap instanceof Map)) return [];
  const out = [];
  const seen = new Set();
  for (const [lk, right] of pairMap) {
    if (seen.has(lk)) continue;
    const rk = String(right ?? "").toLowerCase();
    seen.add(lk);
    seen.add(rk);
    if (lk === rk) {
      out.push([right, right]);
    } else {
      const left = pairMap.get(rk) ?? lk;
      out.push([left, right]);
    }
  }
  return out;
}

export function shapeCenter(center) {
  if (!center || typeof center.uid !== "string" || !center.uid) return null;
  const kind = typeof center.kind === "string" && center.kind ? center.kind : "page";
  return {
    uid: center.uid,
    kind,
    title: typeof center.title === "string" && center.title ? center.title : center.uid,
  };
}

export function shapeOntology(settings = {}) {
  const rawModel = settings?.model && typeof settings.model === "object" ? settings.model : settings;
  const model = modelSettings(rawModel ?? {});
  const roles = {};
  for (const role of ROLES) {
    roles[role] = [...(model.lists[role] ?? [])];
  }
  const rawType = typeof settings?.typeAttribute === "string" ? settings.typeAttribute.trim() : "";
  return {
    roles,
    pairs: extractPairs(model.pairs),
    hidden: [...(model.hidden ?? [])],
    typeAttribute: rawType || "Type",
  };
}

export function shapeNeighborhood(hood, snapshot) {
  const missing = Boolean(snapshot?.missing ?? hood?.missing);
  const fallbackCenter = snapshot?.center ? shapeCenter(snapshot.center) : null;
  const center = shapeCenter(hood?.center) ?? fallbackCenter ?? { uid: "", kind: "page", title: "" };
  const nodes = (hood?.nodes ?? []).map((node) => ({
    uid: String(node?.uid ?? ""),
    kind: typeof node?.kind === "string" && node.kind ? node.kind : "page",
    title: String(node?.title ?? node?.uid ?? ""),
    role: String(node?.role ?? ""),
    zone: String(node?.zone ?? ""),
    label: String(node?.label ?? ""),
    evidence: (node?.evidence ?? []).map((item) => ({
      kind: String(item?.kind ?? ""),
      attribute: typeof item?.attribute === "string" ? item.attribute : null,
      direction: typeof item?.direction === "string" ? item.direction : null,
      sourceUid: typeof item?.sourceUid === "string" ? item.sourceUid : null,
    })),
  }));
  const overflow = {};
  if (hood?.overflow && typeof hood.overflow === "object") {
    for (const [zone, counts] of Object.entries(hood.overflow)) {
      if (counts && typeof counts === "object") {
        overflow[zone] = {
          shown: Number(counts.shown) || 0,
          total: Number(counts.total) || 0,
        };
      }
    }
  }
  return { center, nodes, overflow, missing };
}

export function shapeSearch(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row.uid !== "string" || !row.uid) return [];
    return [{
      uid: row.uid,
      title: typeof row.title === "string" && row.title ? row.title : row.uid,
    }];
  });
}

export function shapeTrail(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry) => {
    if (!entry || typeof entry.uid !== "string" || !entry.uid) return [];
    const kind = typeof entry.kind === "string" && entry.kind ? entry.kind : "page";
    return [{
      uid: entry.uid,
      title: typeof entry.title === "string" && entry.title ? entry.title : entry.uid,
      kind,
      at: Number(entry.at) || 0,
    }];
  });
}

export function shapeCanvas({ open = false, center = null, view = "compass", preset = "roles", zen = false, trail = [] } = {}) {
  const cleanPreset = typeof preset === "string" && preset.trim() ? preset.trim() : "roles";
  return {
    open: Boolean(open),
    center: shapeCenter(center),
    view: normalizeView(view),
    preset: cleanPreset,
    zen: Boolean(zen),
    trail: shapeTrail(trail),
  };
}

export function shapeCommands(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (!item || typeof item !== "object" || typeof item.run !== "function") continue;
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!title) continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const key = id || `title:${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id,
      title,
      hint: typeof item.hint === "string" ? item.hint : "",
    });
  }
  return out;
}
