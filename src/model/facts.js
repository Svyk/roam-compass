import { plexusKind } from "./neighborhood.js";

const SINGLE_FIELDS = new Set(["kind", "group", "type", "role", "zone", "style", "label"]);

function stringField(value) {
  return typeof value === "string" ? value : "";
}

function valueString(raw) {
  if (typeof raw === "string") return raw.trim();
  if (!raw || typeof raw !== "object") return "";
  if (typeof raw.title === "string") return raw.title.trim();
  if (typeof raw.text === "string") return raw.text.trim();
  return "";
}

function normalizeAttributes(attributes) {
  const out = {};
  if (!attributes || typeof attributes !== "object") return out;
  for (const [rawKey, entry] of Object.entries(attributes)) {
    const key = rawKey.trim().toLowerCase();
    if (!key) continue;
    const rawValues = Array.isArray(entry?.values) ? entry.values : Array.isArray(entry) ? entry : [];
    const values = [];
    for (const item of rawValues) {
      const text = valueString(item);
      if (text) values.push(text);
    }
    if (!values.length) continue;
    if (out[key]) out[key].push(...values);
    else out[key] = values;
  }
  return out;
}

export function typeOf(attributes, typeAttribute) {
  const target = typeof typeAttribute === "string" ? typeAttribute.trim().toLowerCase() : "";
  if (!target || !attributes || typeof attributes !== "object") return "";
  for (const [rawKey, entry] of Object.entries(attributes)) {
    const matchesKey = rawKey.trim().toLowerCase() === target;
    const matchesName = typeof entry?.name === "string" && entry.name.trim().toLowerCase() === target;
    if (!matchesKey && !matchesName) continue;
    const rawValues = Array.isArray(entry?.values) ? entry.values : Array.isArray(entry) ? entry : [];
    for (const item of rawValues) {
      const text = valueString(item);
      if (text) return text;
    }
  }
  return "";
}

export function groupOf(node, { empty = false } = {}) {
  if (node?.kind === "group") return "group";
  if (node?.style === "board" || node?.style === "card") return node.style;
  const plexus = plexusKind(node) ?? (node?.plexus === "region" || node?.plexus === "drawing" ? node.plexus : null);
  if (plexus === "region" || plexus === "drawing") return plexus;
  if (node?.kind === "page" && empty === true) return "empty";
  return stringField(node?.kind);
}

export function factOf(node, attributes = {}, { typeAttribute = "Type", empty = false } = {}) {
  return {
    uid: stringField(node?.uid),
    title: stringField(node?.title),
    alias: stringField(node?.alias),
    kind: stringField(node?.kind),
    group: groupOf(node, { empty: Boolean(empty) }),
    type: typeOf(attributes, typeAttribute),
    role: stringField(node?.role),
    zone: stringField(node?.zone),
    style: stringField(node?.style),
    label: stringField(node?.label),
    attributes: normalizeAttributes(attributes),
  };
}

export function factsFor(nodes, attributesByUid = {}, { typeAttribute = "Type", emptyUids = new Set() } = {}) {
  const map = new Map();
  if (!nodes || typeof nodes[Symbol.iterator] !== "function") return map;
  const emptySet = emptyUids instanceof Set ? emptyUids : new Set(Array.isArray(emptyUids) ? emptyUids : []);
  for (const node of nodes) {
    if (typeof node?.uid !== "string" || !node.uid) continue;
    const attrs = attributesByUid instanceof Map ? attributesByUid.get(node.uid) : attributesByUid?.[node.uid];
    map.set(node.uid, factOf(node, attrs ?? {}, { typeAttribute, empty: emptySet.has(node.uid) }));
  }
  return map;
}

export function fieldValues(fact, field) {
  if (!fact || typeof fact !== "object" || typeof field !== "string") return [];
  if (field === "title") {
    const out = [];
    if (typeof fact.title === "string" && fact.title) out.push(fact.title);
    if (typeof fact.alias === "string" && fact.alias) out.push(fact.alias);
    return out;
  }
  if (SINGLE_FIELDS.has(field)) {
    const value = fact[field];
    return typeof value === "string" && value ? [value] : [];
  }
  if (field.startsWith("attr:")) {
    const key = field.slice(5).trim().toLowerCase();
    if (!key) return [];
    const values = fact.attributes?.[key];
    return Array.isArray(values) ? [...values] : [];
  }
  return [];
}

export function matchCondition(condition, fact) {
  if (!condition || typeof condition !== "object") return false;
  const { field, op, value } = condition;
  const values = fieldValues(fact, field);
  if (op === "exists") return values.length > 0;
  if (op === "missing") return values.length === 0;
  const needle = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (op === "is") return needle !== "" && values.some((item) => item.trim() === needle);
  if (op === "is-not") return needle === "" || !values.some((item) => item.trim() === needle);
  if (op === "contains") {
    if (!needle) return false;
    const lower = needle.toLowerCase();
    return values.some((item) => item.toLowerCase().includes(lower));
  }
  if (op === "not-contains") {
    if (!needle) return true;
    const lower = needle.toLowerCase();
    return !values.some((item) => item.toLowerCase().includes(lower));
  }
  return false;
}

export function matchConditions(match, fact) {
  if (!match || typeof match !== "object") return false;
  const all = Array.isArray(match.all) ? match.all : [];
  const any = Array.isArray(match.any) ? match.any : [];
  if (!all.length && !any.length) return false;
  if (all.length && !all.every((condition) => matchCondition(condition, fact))) return false;
  if (any.length && !any.some((condition) => matchCondition(condition, fact))) return false;
  return true;
}
