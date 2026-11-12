import { matchConditions } from "./facts.js";

export const FACET_PALETTE = Object.freeze([
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#9333ea",
  "#dc2626",
  "#0891b2",
  "#db2777",
]);

const VALID_SOURCES = new Set(["attribute", "type", "role", "kind", "rule"]);
const AUTO_SOURCES = new Set(["attribute", "type", "kind"]);
const VALID_LAYOUTS = new Set(["circular", "concentric", "horizontal", "vertical", "quadrants"]);
const VALID_ROLES = new Set(["parent", "child", "friend", "challenger", "previous", "next", "sibling"]);
const VALID_KINDS = new Set(["page", "block", "drawing", "region", "board", "card", "empty"]);
const RULE_SINGLE_FIELDS = new Set(["title", "kind", "group", "type", "role", "zone", "style", "label"]);
const RULE_OPS = new Set(["exists", "missing", "is", "is-not", "contains", "not-contains"]);
const VALUE_OPS = new Set(["is", "is-not", "contains", "not-contains"]);
const RESERVED_CATEGORY_IDS = new Set(["unassigned", "conflicting"]);
const ID_PATTERN = /^[a-z0-9-]+$/;
const SAFE_COLOR_PATTERN = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,32}|(?:rgb|hsl)a?\(\s*[-0-9.,%\s/]+\))$/;

const STATUS_NEUTRAL_COLOR = "#64748b";

export const BUILTIN_PRESETS = Object.freeze([
  Object.freeze({
    id: "roles",
    name: "Local roles",
    help: "Each neighbor by the relationship it has to the center.",
    source: "role",
    categories: Object.freeze([
      Object.freeze({ id: "parents", label: "Parents", values: Object.freeze(["parent"]), color: FACET_PALETTE[0] }),
      Object.freeze({ id: "children", label: "Children", values: Object.freeze(["child"]), color: FACET_PALETTE[1] }),
      Object.freeze({ id: "friends", label: "Friends", values: Object.freeze(["friend", "previous"]), color: FACET_PALETTE[2] }),
      Object.freeze({ id: "challengers", label: "Challengers", values: Object.freeze(["challenger", "next"]), color: FACET_PALETTE[3] }),
      Object.freeze({ id: "siblings", label: "Siblings", values: Object.freeze(["sibling"]), color: FACET_PALETTE[4] }),
    ]),
    layout: "circular",
    edges: true,
    focusInCategory: false,
    hideEmptyStatus: true,
  }),
  Object.freeze({
    id: "types",
    name: "By type",
    help: "Neighbors grouped by the Node type attribute setting.",
    source: "type",
    categories: "auto",
    layout: "circular",
    edges: true,
    focusInCategory: false,
    hideEmptyStatus: true,
  }),
  Object.freeze({
    id: "status",
    name: "Status board",
    help: "Neighbors by their Status:: value.",
    source: "attribute",
    attribute: "Status",
    categories: "auto",
    layout: "horizontal",
    edges: true,
    focusInCategory: false,
    hideEmptyStatus: true,
  }),
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function slugify(text, fallback) {
  const slug = String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function clonePreset(preset, builtin) {
  const categories = Array.isArray(preset.categories)
    ? preset.categories.map((cat) => ({
      id: cat.id,
      label: cat.label,
      color: cat.color,
      ...(cat.match
        ? {
          match: {
            ...(Array.isArray(cat.match.all) ? { all: cat.match.all.map((cond) => ({ ...cond })) } : {}),
            ...(Array.isArray(cat.match.any) ? { any: cat.match.any.map((cond) => ({ ...cond })) } : {}),
          },
        }
        : { values: [...(cat.values ?? [])] }),
    }))
    : preset.categories;
  const out = {
    id: preset.id,
    name: preset.name,
    help: preset.help ?? "",
    source: preset.source,
    ...(preset.source === "attribute" ? { attribute: preset.attribute } : {}),
    categories,
    layout: preset.layout,
    edges: preset.edges,
    focusInCategory: preset.focusInCategory,
    hideEmptyStatus: preset.hideEmptyStatus,
  };
  if (typeof builtin === "boolean") out.builtin = builtin;
  return out;
}

function validateRuleCondition(cond, catIndex, errors) {
  if (!isPlainObject(cond)) {
    errors.push(`Category ${catIndex} has an invalid match condition.`);
    return null;
  }
  const field = typeof cond.field === "string" ? cond.field.trim() : "";
  const validAttr = field.startsWith("attr:") && field.slice(5).trim().length > 0;
  if (!RULE_SINGLE_FIELDS.has(field) && !validAttr) {
    errors.push(`Category ${catIndex} has an unknown condition field "${field || "(empty)"}".`);
    return null;
  }
  const normalizedField = validAttr ? `attr:${field.slice(5).trim()}` : field;
  const op = typeof cond.op === "string" ? cond.op.trim() : "";
  if (!RULE_OPS.has(op)) {
    errors.push(`Category ${catIndex} has an unknown operator "${op || "(empty)"}".`);
    return null;
  }
  if (!VALUE_OPS.has(op)) {
    return { field: normalizedField, op };
  }
  const rawVal = cond.value;
  const value = typeof rawVal === "string" ? rawVal.trim() : rawVal == null ? "" : String(rawVal).trim();
  if (!value) {
    errors.push(`Category ${catIndex} has a condition without a value.`);
    return null;
  }
  return { field: normalizedField, op, value };
}

function validateCategory(rawCat, index, source, seenIds, errors) {
  const num = index + 1;
  if (!isPlainObject(rawCat)) {
    errors.push(`Category ${num} must be an object.`);
    return null;
  }
  const label = typeof rawCat.label === "string" ? rawCat.label.trim() : "";
  if (!label) {
    errors.push(`Category ${num} needs a label.`);
  }
  let id = "";
  if (rawCat.id !== undefined && rawCat.id !== null && String(rawCat.id).trim() !== "") {
    id = typeof rawCat.id === "string" ? rawCat.id.trim() : "";
    if (!ID_PATTERN.test(id)) {
      errors.push(`Category ${num} id must use lowercase letters, numbers, and hyphens.`);
    }
  } else if (label) {
    id = slugify(label, `category-${num}`);
  }
  if (id && RESERVED_CATEGORY_IDS.has(id)) {
    errors.push(`Category ${num} cannot use the reserved id "${id}".`);
  } else if (id && seenIds.has(id)) {
    errors.push(`Category ${num} has a duplicate id "${id}".`);
  } else if (id) {
    seenIds.add(id);
  }

  let color = FACET_PALETTE[index % FACET_PALETTE.length];
  if (rawCat.color !== undefined && rawCat.color !== null && String(rawCat.color).trim() !== "") {
    const trimmedColor = typeof rawCat.color === "string" ? rawCat.color.trim() : "";
    if (!SAFE_COLOR_PATTERN.test(trimmedColor)) {
      errors.push(`Category ${num} has an invalid color.`);
    } else {
      color = trimmedColor;
    }
  }

  if (source === "rule") {
    const match = rawCat.match;
    if (!isPlainObject(match)) {
      errors.push(`Category ${num} needs a match rule.`);
      return null;
    }
    const rawAll = match.all !== undefined ? match.all : [];
    const rawAny = match.any !== undefined ? match.any : [];
    if (!Array.isArray(rawAll) || !Array.isArray(rawAny)) {
      errors.push(`Category ${num} match all/any must be arrays.`);
      return null;
    }
    if (!rawAll.length && !rawAny.length) {
      errors.push(`Category ${num} needs at least one match condition.`);
      return null;
    }
    const all = rawAll.map((item) => validateRuleCondition(item, num, errors)).filter(Boolean);
    const any = rawAny.map((item) => validateRuleCondition(item, num, errors)).filter(Boolean);
    const normalizedMatch = {};
    if (all.length) normalizedMatch.all = all;
    if (any.length) normalizedMatch.any = any;
    return { id, label, color, match: normalizedMatch };
  }

  if (!Array.isArray(rawCat.values)) {
    errors.push(`Category ${num} has no values.`);
    return null;
  }
  const values = [];
  const seenValues = new Set();
  for (const item of rawCat.values) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seenValues.has(trimmed)) continue;
    seenValues.add(trimmed);
    values.push(trimmed);
  }
  if (!values.length) {
    errors.push(`Category ${num} has no values.`);
    return null;
  }
  if (source === "role") {
    for (const val of values) {
      if (!VALID_ROLES.has(val)) {
        errors.push(`Category ${num} has an unknown role "${val}".`);
      }
    }
  } else if (source === "kind") {
    for (const val of values) {
      if (!VALID_KINDS.has(val)) {
        errors.push(`Category ${num} has an unknown kind "${val}".`);
      }
    }
  }
  return { id, label, color, values };
}

export function validatePreset(raw) {
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ["A preset must be a JSON object."] };
  }
  const errors = [];

  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) {
    errors.push("Preset id is required.");
  } else if (!ID_PATTERN.test(id)) {
    errors.push("Preset id must use lowercase letters, numbers, and hyphens only.");
  }

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) {
    errors.push("Preset name is required.");
  }

  let help = "";
  if (raw.help !== undefined && raw.help !== null) {
    if (typeof raw.help !== "string") errors.push("Help text must be a string.");
    else help = raw.help.trim();
  }

  const source = typeof raw.source === "string" ? raw.source.trim() : "";
  if (!VALID_SOURCES.has(source)) {
    errors.push("Source must be attribute, type, role, kind, or rule.");
  }

  let attribute = "";
  if (source === "attribute") {
    const rawAttr = typeof raw.attribute === "string" ? raw.attribute.trim().replace(/::$/, "").trim() : "";
    if (!rawAttr) {
      errors.push("Attribute name is required when source is attribute.");
    } else {
      attribute = rawAttr;
    }
  }

  let layout = "circular";
  if (raw.layout !== undefined && raw.layout !== null && raw.layout !== "") {
    const rawLayout = typeof raw.layout === "string" ? raw.layout.trim() : "";
    if (!VALID_LAYOUTS.has(rawLayout)) {
      errors.push("Layout must be circular, concentric, horizontal, vertical, or quadrants.");
    } else {
      layout = rawLayout;
    }
  }

  let edges = true;
  if (raw.edges !== undefined) {
    if (typeof raw.edges !== "boolean") errors.push("Edges must be true or false.");
    else edges = raw.edges;
  }

  let focusInCategory = false;
  if (raw.focusInCategory !== undefined) {
    if (typeof raw.focusInCategory !== "boolean") errors.push("focusInCategory must be true or false.");
    else focusInCategory = raw.focusInCategory;
  }

  let hideEmptyStatus = true;
  if (raw.hideEmptyStatus !== undefined) {
    if (typeof raw.hideEmptyStatus !== "boolean") errors.push("hideEmptyStatus must be true or false.");
    else hideEmptyStatus = raw.hideEmptyStatus;
  }

  let categories = null;
  const rawCategories = typeof raw.categories === "string" ? raw.categories.trim() : raw.categories;
  if (rawCategories === "auto") {
    if (VALID_SOURCES.has(source) && !AUTO_SOURCES.has(source)) {
      errors.push("Auto categories are only supported for attribute, type, and kind sources.");
    } else {
      categories = "auto";
    }
  } else if (!Array.isArray(rawCategories) || rawCategories.length < 2 || rawCategories.length > 7) {
    errors.push("A preset needs 2 to 7 categories.");
  } else if (VALID_SOURCES.has(source)) {
    const seenIds = new Set();
    const normalized = rawCategories.map((cat, idx) => validateCategory(cat, idx, source, seenIds, errors));
    if (!errors.length) categories = normalized;
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  const preset = {
    id,
    name,
    help,
    source,
    ...(source === "attribute" ? { attribute } : {}),
    categories,
    layout,
    edges,
    focusInCategory,
    hideEmptyStatus,
  };
  return { ok: true, preset };
}

export function allPresets(custom = []) {
  const customById = new Map();
  const customOrder = [];
  if (Array.isArray(custom)) {
    for (const raw of custom) {
      const checked = validatePreset(raw);
      if (!checked.ok) continue;
      const { id } = checked.preset;
      if (!customById.has(id)) customOrder.push(id);
      customById.set(id, checked.preset);
    }
  }

  const builtinIds = new Set(BUILTIN_PRESETS.map((preset) => preset.id));
  const out = [];
  for (const builtin of BUILTIN_PRESETS) {
    if (customById.has(builtin.id)) {
      out.push(clonePreset(customById.get(builtin.id), false));
    } else {
      out.push(clonePreset(builtin, true));
    }
  }
  for (const id of customOrder) {
    if (builtinIds.has(id)) continue;
    out.push(clonePreset(customById.get(id), false));
  }
  return out;
}

export function findPreset(presets, id) {
  const list = Array.isArray(presets) ? presets : [];
  const target = typeof id === "string" ? id.trim() : "";
  if (target) {
    const hit = list.find((preset) => preset?.id === target);
    if (hit) return hit;
  }
  const firstBuiltin = list.find((preset) => preset?.id === BUILTIN_PRESETS[0].id) ?? list[0];
  return firstBuiltin ?? clonePreset(BUILTIN_PRESETS[0], true);
}

function attributeValues(fact, attributeName) {
  const target = typeof attributeName === "string" ? attributeName.trim().toLowerCase() : "";
  const attrs = fact?.attributes;
  if (!target || !attrs || typeof attrs !== "object") return [];
  const out = [];
  const seen = new Set();
  const pushAll = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const raw of arr) {
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
  };
  if (Array.isArray(attrs[target])) {
    pushAll(attrs[target]);
    return out;
  }
  for (const [key, values] of Object.entries(attrs)) {
    if (key.trim().toLowerCase() === target) pushAll(values);
  }
  return out;
}

function valuesForFact(preset, fact) {
  if (!preset || !fact || typeof fact !== "object") return [];
  if (preset.source === "attribute") return attributeValues(fact, preset.attribute);
  if (preset.source === "type") {
    const val = typeof fact.type === "string" ? fact.type.trim() : "";
    return val ? [val] : [];
  }
  if (preset.source === "role") {
    const val = typeof fact.role === "string" ? fact.role.trim() : "";
    return val ? [val] : [];
  }
  if (preset.source === "kind") {
    const raw = fact.group !== undefined ? fact.group : fact.kind;
    const val = typeof raw === "string" ? raw.trim() : "";
    return val ? [val] : [];
  }
  return [];
}

function compareAutoValues(a, b, counts) {
  const diff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
  if (diff !== 0) return diff;
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al !== bl) return al < bl ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function uniqueCategoryId(base, usedIds) {
  let candidate = base;
  let suffix = 2;
  while (!candidate || RESERVED_CATEGORY_IDS.has(candidate) || usedIds.has(candidate)) {
    candidate = `${base || "cat"}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function resolveCategories(preset, facts) {
  if (preset?.categories === "auto") {
    const counts = new Map();
    for (const fact of facts) {
      const vals = valuesForFact(preset, fact);
      for (const val of vals) {
        counts.set(val, (counts.get(val) ?? 0) + 1);
      }
    }
    const distinct = [...counts.keys()].sort((a, b) => compareAutoValues(a, b, counts));
    const usedIds = new Set();
    if (distinct.length <= 7) {
      return distinct.map((val, index) => ({
        id: uniqueCategoryId(slugify(val, `cat-${index + 1}`), usedIds),
        label: val,
        color: FACET_PALETTE[index % FACET_PALETTE.length],
        values: [val],
      }));
    }
    const top = distinct.slice(0, 6).map((val, index) => ({
      id: uniqueCategoryId(slugify(val, `cat-${index + 1}`), usedIds),
      label: val,
      color: FACET_PALETTE[index % FACET_PALETTE.length],
      values: [val],
    }));
    top.push({
      id: uniqueCategoryId("other", usedIds),
      label: "Other",
      color: FACET_PALETTE[6],
      values: distinct.slice(6),
    });
    return top;
  }

  if (!Array.isArray(preset?.categories)) return [];
  return preset.categories.map((cat, index) => ({
    id: typeof cat?.id === "string" && cat.id.trim() ? cat.id.trim() : `category-${index + 1}`,
    label: typeof cat?.label === "string" && cat.label.trim() ? cat.label.trim() : `Category ${index + 1}`,
    color: typeof cat?.color === "string" && cat.color.trim()
      ? cat.color.trim()
      : FACET_PALETTE[index % FACET_PALETTE.length],
    ...(preset.source === "rule"
      ? { match: cat?.match }
      : { values: (cat?.values ?? []).map((v) => String(v).trim()).filter(Boolean) }),
  }));
}

function categoryMatchesFact(preset, category, fact, cachedValues = null) {
  if (!preset || !category || !fact) return false;
  if (preset.source === "rule") {
    return matchConditions(category.match, fact);
  }
  const values = cachedValues ?? valuesForFact(preset, fact);
  if (!values.length || !Array.isArray(category.values)) return false;
  return category.values.some((target) => values.includes(target.trim()));
}

export function classify(preset, facts = []) {
  const list = Array.isArray(facts) ? facts.filter((fact) => typeof fact?.uid === "string" && fact.uid) : [];
  const resolved = resolveCategories(preset, list);
  const categories = resolved.map((cat) => ({
    id: cat.id,
    label: cat.label,
    color: cat.color,
    uids: [],
  }));
  const unassigned = [];
  const conflicting = [];
  const matches = {};

  for (const fact of list) {
    const vals = preset?.source === "rule" ? null : valuesForFact(preset, fact);
    const matchedIndices = [];
    for (let i = 0; i < resolved.length; i += 1) {
      if (categoryMatchesFact(preset, resolved[i], fact, vals)) matchedIndices.push(i);
    }
    if (matchedIndices.length === 0) {
      unassigned.push(fact.uid);
    } else if (matchedIndices.length === 1) {
      categories[matchedIndices[0]].uids.push(fact.uid);
    } else {
      conflicting.push(fact.uid);
      matches[fact.uid] = matchedIndices.map((idx) => categories[idx].id);
    }
  }

  return {
    preset,
    categories,
    unassigned,
    conflicting,
    matches,
  };
}

export function centerCategory(preset, fact, resolvedCategories = null) {
  if (!preset || !fact || typeof fact !== "object") return null;
  if (preset.categories === "auto") {
    if (!Array.isArray(resolvedCategories) || !resolvedCategories.length) return null;
    const vals = valuesForFact(preset, fact);
    if (!vals.length) return null;
    const otherCat = resolvedCategories.length === 7 && resolvedCategories[6]?.label === "Other"
      && !Array.isArray(resolvedCategories[6]?.values)
      ? resolvedCategories[6]
      : null;
    const hits = new Set();
    for (const val of vals) {
      const direct = resolvedCategories.find((cat) => (
        Array.isArray(cat?.values) ? cat.values.includes(val) : (cat !== otherCat && cat?.label === val)
      ));
      if (direct?.id) hits.add(direct.id);
      else if (otherCat?.id) hits.add(otherCat.id);
    }
    return hits.size === 1 ? [...hits][0] : null;
  }
  if (!Array.isArray(preset.categories)) return null;
  const categories = resolveCategories(preset, []);
  if (!categories.length) return null;

  const vals = preset.source === "rule" ? null : valuesForFact(preset, fact);
  const hits = [];
  for (const cat of categories) {
    if (categoryMatchesFact(preset, cat, fact, vals)) hits.push(cat.id);
  }
  return hits.length === 1 ? hits[0] : null;
}

// ---- geometry ----

const REGION_PAD_X = 14;
const REGION_HEADER_H = 32;
const REGION_PAD_BOTTOM = 14;
const EMPTY_INNER_H = 20;

function columnsForCount(count) {
  if (count <= 4) return 1;
  if (count <= 10) return 2;
  return 3;
}

function prepareBoxSpec(spec, { card, center, gap, maxRows, expandedRegions, focusCategory }) {
  const uids = Array.isArray(spec.uids) ? spec.uids : [];
  const count = uids.length;
  const cols = columnsForCount(count);
  const colGap = Math.max(8, gap);
  const rowGap = Math.max(8, Math.round(gap * 0.75));
  const isExpanded = expandedRegions instanceof Set && expandedRegions.has(spec.id);
  const rowCap = isExpanded || !Number.isFinite(maxRows) ? Infinity : Math.max(1, Math.trunc(maxRows));
  const slotCap = Number.isFinite(rowCap) ? cols * rowCap : count;
  const hasMore = count > slotCap;
  const shownCount = hasMore ? Math.max(0, slotCap - 1) : count;
  const hidden = count - shownCount;
  const totalSlots = shownCount + (hasMore ? 1 : 0);
  const gridRows = totalSlots > 0 ? Math.ceil(totalSlots / cols) : 0;
  const gridW = totalSlots > 0 ? cols * card.w + (cols - 1) * colGap : card.w;
  const gridH = gridRows > 0 ? gridRows * card.h + (gridRows - 1) * rowGap : (focusCategory === spec.id ? 0 : EMPTY_INNER_H);
  const isFocused = focusCategory === spec.id;
  const focusW = isFocused ? Math.max(card.w, center.w) : 0;
  const focusH = isFocused ? card.h * 2 : 0;
  const innerW = isFocused ? Math.max(gridW, focusW) : gridW;
  const innerH = isFocused ? focusH + (gridRows > 0 ? rowGap + gridH : 0) : gridH;

  return {
    ...spec,
    uids,
    count,
    hidden,
    hasMore,
    shownCount,
    totalSlots,
    cols,
    gridRows,
    colGap,
    rowGap,
    gridW,
    gridH,
    isFocused,
    focusW,
    focusH,
    w: innerW + REGION_PAD_X * 2,
    h: REGION_HEADER_H + innerH + REGION_PAD_BOTTOM,
  };
}

function materializeBoxRegion(prepared, rx, ry, card) {
  const region = {
    id: prepared.id,
    label: prepared.label,
    color: prepared.color,
    x: rx,
    y: ry,
    w: prepared.w,
    h: prepared.h,
    count: prepared.count,
    hidden: prepared.hidden,
    status: prepared.status ?? null,
  };

  let focusBox = null;
  let cardsTop = ry - prepared.h / 2 + REGION_HEADER_H;
  if (prepared.isFocused) {
    focusBox = {
      x: rx,
      y: cardsTop + prepared.focusH / 2,
      w: prepared.focusW,
      h: prepared.focusH,
    };
    cardsTop += prepared.focusH + prepared.rowGap;
  }

  const items = [];
  const more = [];
  const gridLeft = rx - prepared.gridW / 2;
  for (let s = 0; s < prepared.totalSlots; s += 1) {
    const row = Math.floor(s / prepared.cols);
    const col = s % prepared.cols;
    const x = gridLeft + col * (card.w + prepared.colGap) + card.w / 2;
    const y = cardsTop + row * (card.h + prepared.rowGap) + card.h / 2;
    if (s < prepared.shownCount) {
      const uid = prepared.uids[s];
      items.push({
        key: `${prepared.id}:${uid}`,
        uid,
        zone: prepared.id,
        x,
        y,
        w: card.w,
        h: card.h,
      });
    } else {
      more.push({
        regionId: prepared.id,
        count: prepared.hidden,
        x,
        y,
        w: card.w,
        h: card.h,
      });
    }
  }

  return { region, items, more, focusBox };
}

function pairRadius(a, angleA, b, angleB, clearance) {
  const dxFactor = Math.abs(Math.cos(angleA) - Math.cos(angleB));
  const dyFactor = Math.abs(Math.sin(angleA) - Math.sin(angleB));
  const rx = dxFactor > 1e-6 ? ((a.w + b.w) / 2 + clearance) / dxFactor : Infinity;
  const ry = dyFactor > 1e-6 ? ((a.h + b.h) / 2 + clearance) / dyFactor : Infinity;
  return Math.min(rx, ry);
}

function centerClearRadius(reg, angle, centerBox, clearance) {
  const cx = Math.abs(Math.cos(angle));
  const cy = Math.abs(Math.sin(angle));
  const rx = cx > 1e-6 ? ((reg.w + centerBox.w) / 2 + clearance) / cx : Infinity;
  const ry = cy > 1e-6 ? ((reg.h + centerBox.h) / 2 + clearance) / cy : Infinity;
  return Math.min(rx, ry);
}

function placeCircular(specs, centerBox, gap) {
  const count = specs.length;
  if (!count) return [];
  if (count === 1 && !centerBox) {
    return [{ x: 0, y: 0 }];
  }
  const clearance = gap * 2;
  const angles = specs.map((_, idx) => -Math.PI / 2 + (2 * Math.PI * idx) / count);
  let radius = 0;

  if (centerBox) {
    for (let i = 0; i < count; i += 1) {
      radius = Math.max(radius, centerClearRadius(specs[i], angles[i], centerBox, clearance));
    }
  }
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      radius = Math.max(radius, pairRadius(specs[i], angles[i], specs[j], angles[j], clearance));
    }
  }
  radius = Math.ceil(radius);
  return angles.map((angle) => ({
    x: Math.round(radius * Math.cos(angle)),
    y: Math.round(radius * Math.sin(angle)),
  }));
}

// Re-verify rounding never shaved 1px off the required clearance.
function boxesClear(ax, ay, aw, ah, bx, by, bw, bh, clearance) {
  const sepX = Math.abs(ax - bx) - (aw + bw) / 2;
  const sepY = Math.abs(ay - by) - (ah + bh) / 2;
  return sepX >= clearance - 1e-6 || sepY >= clearance - 1e-6;
}

function placeCircularExact(specs, centerBox, gap) {
  const count = specs.length;
  if (!count) return [];
  if (count === 1 && !centerBox) return [{ x: 0, y: 0 }];
  const clearance = gap * 2;
  const angles = specs.map((_, idx) => -Math.PI / 2 + (2 * Math.PI * idx) / count);
  let base = placeCircular(specs, centerBox, gap);
  let radius = Math.hypot(base[0].x, base[0].y);

  for (let step = 0; step < 10; step += 1) {
    let ok = true;
    if (centerBox) {
      for (let i = 0; i < count; i += 1) {
        if (!boxesClear(base[i].x, base[i].y, specs[i].w, specs[i].h, centerBox.x, centerBox.y, centerBox.w, centerBox.h, clearance)) {
          ok = false;
          break;
        }
      }
    }
    if (ok) {
      for (let i = 0; i < count && ok; i += 1) {
        for (let j = i + 1; j < count; j += 1) {
          if (!boxesClear(base[i].x, base[i].y, specs[i].w, specs[i].h, base[j].x, base[j].y, specs[j].w, specs[j].h, clearance)) {
            ok = false;
            break;
          }
        }
      }
    }
    if (ok) break;
    radius += 4;
    base = angles.map((angle) => ({
      x: Math.round(radius * Math.cos(angle)),
      y: Math.round(radius * Math.sin(angle)),
    }));
  }
  return base;
}

function placeHorizontal(specs, centerBox, gap) {
  if (!specs.length) return [];
  const regionGap = gap * 2;
  const totalW = specs.reduce((sum, item) => sum + item.w, 0) + Math.max(0, specs.length - 1) * regionGap;
  const maxH = Math.max(...specs.map((item) => item.h));
  const rowTop = centerBox ? centerBox.y + centerBox.h / 2 + gap * 3 : -Math.round(maxH / 2);
  let curX = -Math.round(totalW / 2);
  return specs.map((spec) => {
    const pos = { x: curX + spec.w / 2, y: rowTop + spec.h / 2 };
    curX += spec.w + regionGap;
    return pos;
  });
}

function placeVertical(specs, centerBox, gap) {
  if (!specs.length) return [];
  const regionGap = gap * 2;
  const totalH = specs.reduce((sum, item) => sum + item.h, 0) + Math.max(0, specs.length - 1) * regionGap;
  const maxW = Math.max(...specs.map((item) => item.w));
  const colLeft = centerBox ? centerBox.x + centerBox.w / 2 + gap * 3 : -Math.round(maxW / 2);
  let curY = -Math.round(totalH / 2);
  return specs.map((spec) => {
    const pos = { x: colLeft + spec.w / 2, y: curY + spec.h / 2 };
    curY += spec.h + regionGap;
    return pos;
  });
}

function placeQuadrants(specs, centerBox, gap) {
  const [tl, tr, bl, br] = specs;
  const innerX = gap * 2;
  const clearY = centerBox ? centerBox.h / 2 + gap * 2 : gap;

  return [
    { x: -(innerX + tl.w / 2), y: -(clearY + tl.h / 2) },
    { x: innerX + tr.w / 2, y: -(clearY + tr.h / 2) },
    { x: -(innerX + bl.w / 2), y: clearY + bl.h / 2 },
    { x: innerX + br.w / 2, y: clearY + br.h / 2 },
  ];
}

function layoutConcentricRings(rawSpecs, { card, center, gap, maxRows, expandedRegions, focusCategory }) {
  const regions = [];
  const items = [];
  const more = [];
  let focusBox = null;

  const hasFocus = rawSpecs.some((spec) => spec.id === focusCategory);
  let prevOuterW = hasFocus ? gap * 2 : center.w;
  let prevOuterH = hasFocus ? gap * 2 : center.h;
  const colGap = Math.max(8, gap);
  const rowGap = Math.max(8, Math.round(gap * 0.75));
  const bandInnerPad = Math.max(8, Math.round(gap * 0.75));

  for (const spec of rawSpecs) {
    const innerW = prevOuterW + gap * 4;
    const innerH = prevOuterH + gap * 4;
    const uids = Array.isArray(spec.uids) ? spec.uids : [];
    const count = uids.length;
    const isFocused = focusCategory === spec.id;
    const isExpanded = expandedRegions instanceof Set && expandedRegions.has(spec.id);

    const minCols = Math.max(2, Math.floor((innerW + colGap) / (card.w + colGap)));
    const cols = Math.max(minCols, Math.min(6, Math.max(2, Math.ceil(count / 2))));
    const rowCap = isExpanded || !Number.isFinite(maxRows) ? Infinity : Math.max(1, Math.trunc(maxRows));
    const slotCap = Number.isFinite(rowCap) ? cols * rowCap : count;
    const hasMore = count > slotCap;
    const shownCount = hasMore ? Math.max(0, slotCap - 1) : count;
    const hidden = count - shownCount;
    const totalSlots = shownCount + (hasMore ? 1 : 0);

    const topMaxRows = Number.isFinite(rowCap) ? Math.ceil(rowCap / 2) : Infinity;
    const botMaxRows = Number.isFinite(rowCap) ? Math.floor(rowCap / 2) : Infinity;
    const topCount = Number.isFinite(rowCap)
      ? Math.min(cols * topMaxRows, Math.max(totalSlots - cols * botMaxRows, Math.ceil(totalSlots / 2)))
      : Math.ceil(totalSlots / 2);
    const botCount = totalSlots - topCount;
    const topRows = topCount > 0 ? Math.ceil(topCount / cols) : 0;
    const botRows = botCount > 0 ? Math.ceil(botCount / cols) : 0;

    const focusW = isFocused ? Math.max(card.w, center.w) : 0;
    const focusH = isFocused ? card.h * 2 : 0;
    const topGridH = topRows > 0 ? topRows * card.h + (topRows - 1) * rowGap : 0;
    const botGridH = botRows > 0 ? botRows * card.h + (botRows - 1) * rowGap : 0;

    const topBandNeeded = REGION_HEADER_H
      + (isFocused ? focusH + (topRows > 0 ? rowGap : 0) : 0)
      + topGridH
      + bandInnerPad;
    const botBandNeeded = bandInnerPad + botGridH + REGION_PAD_BOTTOM;
    const bandH = Math.max(topBandNeeded, botBandNeeded, REGION_HEADER_H + bandInnerPad);

    const maxRowCols = Math.max(Math.min(topCount, cols), Math.min(botCount, cols), 1);
    const rowGridW = maxRowCols * card.w + (maxRowCols - 1) * colGap;
    const outerW = Math.max(
      innerW + gap * 4,
      rowGridW + REGION_PAD_X * 2,
      isFocused ? focusW + REGION_PAD_X * 2 : 0,
    );
    const outerH = innerH + bandH * 2;

    regions.push({
      id: spec.id,
      label: spec.label,
      color: spec.color,
      x: 0,
      y: 0,
      w: outerW,
      h: outerH,
      count,
      hidden,
      status: null,
    });

    let topCursorY = -outerH / 2 + REGION_HEADER_H;
    if (isFocused) {
      focusBox = {
        x: 0,
        y: topCursorY + focusH / 2,
        w: focusW,
        h: focusH,
      };
      topCursorY += focusH + rowGap;
    }

    for (let s = 0; s < topCount; s += 1) {
      const row = Math.floor(s / cols);
      const col = s % cols;
      const inRow = row === topRows - 1 ? topCount - row * cols : cols;
      const usedW = inRow * card.w + (inRow - 1) * colGap;
      const x = -usedW / 2 + col * (card.w + colGap) + card.w / 2;
      const y = topCursorY + row * (card.h + rowGap) + card.h / 2;
      if (s < shownCount) {
        const uid = uids[s];
        items.push({ key: `${spec.id}:${uid}`, uid, zone: spec.id, x, y, w: card.w, h: card.h });
      } else {
        more.push({ regionId: spec.id, count: hidden, x, y, w: card.w, h: card.h });
      }
    }

    const botStartY = innerH / 2 + bandInnerPad;
    for (let b = 0; b < botCount; b += 1) {
      const slotIndex = topCount + b;
      const row = Math.floor(b / cols);
      const col = b % cols;
      const inRow = row === botRows - 1 ? botCount - row * cols : cols;
      const usedW = inRow * card.w + (inRow - 1) * colGap;
      const x = -usedW / 2 + col * (card.w + colGap) + card.w / 2;
      const y = botStartY + row * (card.h + rowGap) + card.h / 2;
      if (slotIndex < shownCount) {
        const uid = uids[slotIndex];
        items.push({ key: `${spec.id}:${uid}`, uid, zone: spec.id, x, y, w: card.w, h: card.h });
      } else {
        more.push({ regionId: spec.id, count: hidden, x, y, w: card.w, h: card.h });
      }
    }

    prevOuterW = outerW;
    prevOuterH = outerH;
  }

  const centerBox = focusBox ?? { x: 0, y: 0, w: center.w, h: center.h };
  return { centerBox, regions, items, more };
}

export function layoutFacets(classified, options = {}) {
  const card = { w: options?.card?.w ?? 168, h: options?.card?.h ?? 32 };
  const center = { w: options?.center?.w ?? 240, h: options?.center?.h ?? 56 };
  const gap = Number.isFinite(options?.gap) && options.gap > 0 ? options.gap : 12;
  const maxRows = options?.maxRows !== undefined ? options.maxRows : 6;
  const expandedRegions = options?.expandedRegions instanceof Set ? options.expandedRegions : null;

  const rawCategories = Array.isArray(classified?.categories) ? classified.categories : [];
  const rawFocus = typeof options?.focusCategory === "string" && options.focusCategory ? options.focusCategory : null;
  const focusCategory = rawFocus && rawCategories.some((cat) => cat.id === rawFocus) ? rawFocus : null;

  const requestedLayout = classified?.preset?.layout || "circular";
  let effectiveLayout = requestedLayout;
  let fallback = null;
  if (requestedLayout === "quadrants" && rawCategories.length !== 4) {
    effectiveLayout = "circular";
    fallback = "circular";
  }

  let centerBox = focusCategory ? null : { x: 0, y: 0, w: center.w, h: center.h };
  const regions = [];
  const items = [];
  const more = [];

  if (effectiveLayout === "concentric") {
    const built = layoutConcentricRings(rawCategories, {
      card,
      center,
      gap,
      maxRows,
      expandedRegions,
      focusCategory,
    });
    centerBox = built.centerBox;
    regions.push(...built.regions);
    items.push(...built.items);
    more.push(...built.more);
  } else {
    const prepared = rawCategories.map((cat) => (
      prepareBoxSpec({ ...cat, status: null }, { card, center, gap, maxRows, expandedRegions, focusCategory })
    ));

    let positions = [];
    if (effectiveLayout === "horizontal") positions = placeHorizontal(prepared, centerBox, gap);
    else if (effectiveLayout === "vertical") positions = placeVertical(prepared, centerBox, gap);
    else if (effectiveLayout === "quadrants") positions = placeQuadrants(prepared, centerBox, gap);
    else positions = placeCircularExact(prepared, centerBox, gap);

    for (let i = 0; i < prepared.length; i += 1) {
      const mat = materializeBoxRegion(prepared[i], positions[i].x, positions[i].y, card);
      regions.push(mat.region);
      items.push(...mat.items);
      more.push(...mat.more);
      if (mat.focusBox) centerBox = mat.focusBox;
    }
  }

  if (!centerBox) {
    centerBox = { x: 0, y: 0, w: center.w, h: center.h };
  }

  // Docked status row under everything else
  const hideEmpty = classified?.preset?.hideEmptyStatus !== false;
  const unassignedUids = Array.isArray(classified?.unassigned) ? classified.unassigned : [];
  const conflictingUids = Array.isArray(classified?.conflicting) ? classified.conflicting : [];
  const statusSpecs = [];
  if (unassignedUids.length > 0 || !hideEmpty) {
    statusSpecs.push({
      id: "unassigned",
      label: "Unassigned",
      color: STATUS_NEUTRAL_COLOR,
      uids: unassignedUids,
      status: "unassigned",
    });
  }
  if (conflictingUids.length > 0 || !hideEmpty) {
    statusSpecs.push({
      id: "conflicting",
      label: "Conflicting",
      color: STATUS_NEUTRAL_COLOR,
      uids: conflictingUids,
      status: "conflicting",
    });
  }

  if (statusSpecs.length > 0) {
    let mainMinX = centerBox.x - centerBox.w / 2;
    let mainMaxX = centerBox.x + centerBox.w / 2;
    let mainMaxY = centerBox.y + centerBox.h / 2;
    for (const reg of regions) {
      mainMinX = Math.min(mainMinX, reg.x - reg.w / 2);
      mainMaxX = Math.max(mainMaxX, reg.x + reg.w / 2);
      mainMaxY = Math.max(mainMaxY, reg.y + reg.h / 2);
    }

    const preparedStatus = statusSpecs.map((spec) => (
      prepareBoxSpec(spec, { card, center, gap, maxRows, expandedRegions, focusCategory: null })
    ));
    const statusGap = gap * 2;
    const totalStatusW = preparedStatus.reduce((sum, s) => sum + s.w, 0)
      + (preparedStatus.length - 1) * statusGap;
    const dockCenterX = Math.round((mainMinX + mainMaxX) / 2);
    const dockTop = mainMaxY + gap * 3;
    let curX = dockCenterX - Math.round(totalStatusW / 2);

    for (const prep of preparedStatus) {
      const rx = curX + prep.w / 2;
      const ry = dockTop + prep.h / 2;
      const mat = materializeBoxRegion(prep, rx, ry, card);
      regions.push(mat.region);
      items.push(...mat.items);
      more.push(...mat.more);
      curX += prep.w + statusGap;
    }
  }

  let minX = centerBox.x - centerBox.w / 2;
  let maxX = centerBox.x + centerBox.w / 2;
  let minY = centerBox.y - centerBox.h / 2;
  let maxY = centerBox.y + centerBox.h / 2;
  for (const reg of regions) {
    minX = Math.min(minX, reg.x - reg.w / 2);
    maxX = Math.max(maxX, reg.x + reg.w / 2);
    minY = Math.min(minY, reg.y - reg.h / 2);
    maxY = Math.max(maxY, reg.y + reg.h / 2);
  }

  return {
    center: centerBox,
    regions,
    items,
    more,
    bounds: { minX, minY, maxX, maxY },
    fallback,
  };
}
