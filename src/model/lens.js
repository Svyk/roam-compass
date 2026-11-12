import { matchConditions } from "./facts.js";

export const FIELDS = Object.freeze({
  node: Object.freeze([
    Object.freeze({ field: "title", label: "Title" }),
    Object.freeze({ field: "kind", label: "Kind" }),
    Object.freeze({ field: "type", label: "Type" }),
    Object.freeze({ field: "attr:", label: "Attribute…" }),
  ]),
  relationship: Object.freeze([
    Object.freeze({ field: "role", label: "Role" }),
    Object.freeze({ field: "zone", label: "Zone" }),
    Object.freeze({ field: "style", label: "Style" }),
    Object.freeze({ field: "label", label: "Label" }),
  ]),
});

export const OPERATORS = Object.freeze([
  Object.freeze({ op: "is", label: "Is", needsValue: true }),
  Object.freeze({ op: "is-not", label: "Is not", needsValue: true }),
  Object.freeze({ op: "contains", label: "Contains", needsValue: true }),
  Object.freeze({ op: "not-contains", label: "Does not contain", needsValue: true }),
  Object.freeze({ op: "exists", label: "Exists", needsValue: false }),
  Object.freeze({ op: "missing", label: "Missing", needsValue: false }),
]);

export const EXAMPLE_LENSES = Object.freeze([
  Object.freeze({
    id: "typed-only",
    name: "Typed relations only",
    enabled: false,
    scope: "relationship",
    effect: "hide",
    match: Object.freeze({
      any: Object.freeze([
        Object.freeze({ field: "style", op: "is", value: "link" }),
        Object.freeze({ field: "style", op: "is", value: "mention" }),
      ]),
    }),
    style: Object.freeze({ fill: "", border: "", text: "" }),
  }),
  Object.freeze({
    id: "highlight-challengers",
    name: "Highlight challengers",
    enabled: false,
    scope: "relationship",
    effect: "style",
    match: Object.freeze({
      any: Object.freeze([
        Object.freeze({ field: "role", op: "is", value: "challenger" }),
        Object.freeze({ field: "role", op: "is", value: "next" }),
      ]),
    }),
    style: Object.freeze({ fill: "", border: "#ea580c", text: "" }),
  }),
  Object.freeze({
    id: "tasks",
    name: "Tasks",
    enabled: false,
    scope: "node",
    effect: "show",
    match: Object.freeze({
      all: Object.freeze([
        Object.freeze({ field: "type", op: "is", value: "Task" }),
      ]),
    }),
    style: Object.freeze({ fill: "", border: "", text: "" }),
  }),
]);

const VALID_ID = /^[a-z0-9-]+$/;
const SCOPES = new Set(["node", "relationship"]);
const EFFECTS = new Set(["show", "hide", "style"]);
const DIRECT_FIELDS = new Set(["title", "kind", "group", "type", "role", "zone", "style", "label"]);
const OPERATOR_BY_OP = new Map(OPERATORS.map((item) => [item.op, item]));
const COLOR_CHARS = /^[A-Za-z0-9#(),.% ]+$/;
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FUNC_COLOR = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\((?=.*[0-9])[A-Za-z0-9,%. ]+\)$/i;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function slugLensId(name, existingIds = []) {
  const base = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "lens";
  const taken = existingIds instanceof Set ? existingIds : new Set(Array.isArray(existingIds) ? existingIds : []);
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function isValidColor(value) {
  if (!value || value.length > 40) return false;
  if (!COLOR_CHARS.test(value)) return false;
  return HEX_COLOR.test(value) || FUNC_COLOR.test(value);
}

function normalizeCondition(raw, errors) {
  if (!isPlainObject(raw)) {
    errors.push("Each condition must be an object.");
    return null;
  }
  const rawField = typeof raw.field === "string" ? raw.field.trim() : "";
  let field = "";
  if (rawField.startsWith("attr:")) {
    const attrName = rawField.slice(5).trim();
    if (!attrName) errors.push("Enter an attribute name.");
    else field = `attr:${attrName}`;
  } else if (DIRECT_FIELDS.has(rawField)) {
    field = rawField;
  } else {
    errors.push("Choose a valid condition field.");
  }

  const rawOp = typeof raw.op === "string" ? raw.op.trim() : "";
  const operator = OPERATOR_BY_OP.get(rawOp);
  if (!operator) {
    errors.push("Choose a valid operator.");
    return null;
  }

  if (!operator.needsValue) {
    return field ? { field, op: operator.op } : null;
  }

  const value = typeof raw.value === "string" ? raw.value.trim() : "";
  if (!value) {
    errors.push("Enter a value for every condition.");
    return null;
  }
  return field ? { field, op: operator.op, value } : null;
}

export function validateLens(raw) {
  if (!isPlainObject(raw)) return { ok: false, errors: ["Lens must be an object."] };
  const errors = [];

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) errors.push("Enter a name for the lens.");

  let id = "";
  if (raw.id === undefined) {
    id = slugLensId(name);
  } else if (typeof raw.id === "string" && VALID_ID.test(raw.id.trim())) {
    id = raw.id.trim();
  } else {
    errors.push("Lens ID may only use lowercase letters, digits, and hyphens.");
  }

  let enabled = false;
  if (raw.enabled !== undefined) {
    if (typeof raw.enabled === "boolean") enabled = raw.enabled;
    else errors.push("Enabled must be true or false.");
  }

  let scope = "node";
  if (raw.scope !== undefined) {
    if (SCOPES.has(raw.scope)) scope = raw.scope;
    else errors.push("Scope must be node or relationship.");
  }

  const effect = typeof raw.effect === "string" ? raw.effect.trim() : "";
  if (!EFFECTS.has(effect)) errors.push("Effect must be show, hide, or style.");

  const match = {};
  if (!isPlainObject(raw.match)) {
    errors.push("Match rules are required.");
  } else {
    const hasAll = raw.match.all !== undefined;
    const hasAny = raw.match.any !== undefined;
    if (hasAll && !Array.isArray(raw.match.all)) errors.push("Match all must be a list.");
    if (hasAny && !Array.isArray(raw.match.any)) errors.push("Match any must be a list.");
    const rawAll = Array.isArray(raw.match.all) ? raw.match.all : [];
    const rawAny = Array.isArray(raw.match.any) ? raw.match.any : [];
    if (!rawAll.length && !rawAny.length) {
      errors.push("Add at least one condition.");
    } else {
      const all = rawAll.map((item) => normalizeCondition(item, errors)).filter(Boolean);
      const any = rawAny.map((item) => normalizeCondition(item, errors)).filter(Boolean);
      if (all.length) match.all = all;
      if (any.length) match.any = any;
    }
  }

  const style = { fill: "", border: "", text: "" };
  if (raw.style !== undefined && !isPlainObject(raw.style)) {
    errors.push("Style must be an object.");
  } else if (raw.style) {
    for (const key of ["fill", "border", "text"]) {
      const rawColor = raw.style[key];
      if (rawColor === undefined || rawColor === "") continue;
      if (typeof rawColor !== "string") {
        errors.push(`Invalid ${key} color.`);
        continue;
      }
      const trimmed = rawColor.trim();
      if (!trimmed) continue;
      if (!isValidColor(trimmed)) {
        errors.push(`Invalid ${key} color.`);
      } else {
        style[key] = trimmed;
      }
    }
  }

  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  return {
    ok: true,
    lens: { id, name, enabled, scope, effect, match, style },
  };
}

export function normalizeLenses(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const result = validateLens(item);
    if (!result.ok || seen.has(result.lens.id)) continue;
    seen.add(result.lens.id);
    out.push(result.lens);
  }
  return out;
}

function factEntries(facts) {
  if (!facts) return [];
  if (facts instanceof Map) return [...facts.entries()];
  if (Array.isArray(facts)) {
    const out = [];
    for (const fact of facts) {
      if (typeof fact?.uid === "string" && fact.uid) out.push([fact.uid, fact]);
    }
    return out;
  }
  if (typeof facts === "object") return Object.entries(facts);
  return [];
}

export function evaluateLenses(lenses, facts) {
  const hidden = new Set();
  const styles = new Map();
  const entries = factEntries(facts);
  if (!entries.length) return { hidden, styles };

  const active = Array.isArray(lenses) ? lenses.filter((lens) => lens?.enabled === true) : [];
  const showLenses = active.filter((lens) => lens.effect === "show");
  const hideLenses = active.filter((lens) => lens.effect === "hide");
  const styleLenses = active.filter((lens) => lens.effect === "style");

  for (const [uid, fact] of entries) {
    if (typeof uid !== "string" || !uid || !fact || typeof fact !== "object") continue;
    if (showLenses.length > 0 && !showLenses.some((lens) => matchConditions(lens.match, fact))) {
      hidden.add(uid);
      continue;
    }
    if (hideLenses.some((lens) => matchConditions(lens.match, fact))) {
      hidden.add(uid);
      continue;
    }
    if (!styleLenses.length) continue;
    let fill = "";
    let border = "";
    let text = "";
    for (const lens of styleLenses) {
      if (!matchConditions(lens.match, fact)) continue;
      if (lens.style?.fill) fill = lens.style.fill;
      if (lens.style?.border) border = lens.style.border;
      if (lens.style?.text) text = lens.style.text;
    }
    if (fill || border || text) {
      styles.set(uid, { fill, border, text });
    }
  }
  return { hidden, styles };
}

export function typeFilter(facts, selectedTypes) {
  const hidden = new Set();
  const selected = selectedTypes instanceof Set
    ? selectedTypes
    : new Set(Array.isArray(selectedTypes) ? selectedTypes : []);
  if (selected.size === 0) return hidden;
  for (const [uid, fact] of factEntries(facts)) {
    if (typeof uid !== "string" || !uid || !fact || typeof fact !== "object") continue;
    const type = typeof fact.type === "string" ? fact.type : "";
    if (!selected.has(type)) hidden.add(uid);
  }
  return hidden;
}

export function typesPresent(facts) {
  const counts = new Map();
  for (const [, fact] of factEntries(facts)) {
    if (!fact || typeof fact !== "object") continue;
    const type = typeof fact.type === "string" ? fact.type : "";
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const named = [];
  let untypedCount = 0;
  for (const [type, count] of counts.entries()) {
    if (type === "") untypedCount = count;
    else named.push({ type, count });
  }
  named.sort((a, b) => b.count - a.count || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0));
  if (untypedCount > 0) named.push({ type: "", count: untypedCount });
  return named;
}

export function lensToJson(lens) {
  const validated = validateLens(lens);
  return JSON.stringify(validated.ok ? validated.lens : lens, null, 2);
}

export function lensFromJson(text) {
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, errors: ["Paste lens JSON to import."] };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["Invalid JSON."] };
  }
  return validateLens(parsed);
}
