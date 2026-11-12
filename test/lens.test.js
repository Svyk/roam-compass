import assert from "node:assert/strict";
import test from "node:test";

import { factOf, factsFor } from "../src/model/facts.js";
import {
  EXAMPLE_LENSES,
  FIELDS,
  OPERATORS,
  evaluateLenses,
  lensFromJson,
  lensToJson,
  normalizeLenses,
  slugLensId,
  typeFilter,
  typesPresent,
  validateLens,
} from "../src/model/lens.js";
import { createLenses } from "../src/view/features/lenses.js";

test("FIELDS and OPERATORS expose scope fields and operator metadata", () => {
  assert.deepEqual(
    FIELDS.node.map((item) => item.field),
    ["title", "kind", "type", "attr:"],
  );
  assert.deepEqual(
    FIELDS.relationship.map((item) => item.field),
    ["role", "zone", "style", "label"],
  );
  for (const list of [FIELDS.node, FIELDS.relationship]) {
    for (const entry of list) {
      assert.equal(typeof entry.label, "string");
      assert.ok(entry.label.length > 0);
    }
  }

  assert.deepEqual(
    OPERATORS.map(({ op, needsValue }) => [op, needsValue]),
    [
      ["is", true],
      ["is-not", true],
      ["contains", true],
      ["not-contains", true],
      ["exists", false],
      ["missing", false],
    ],
  );
});

test("EXAMPLE_LENSES provides the three disabled examples and each validates cleanly", () => {
  assert.equal(EXAMPLE_LENSES.length, 3);
  assert.deepEqual(
    EXAMPLE_LENSES.map((lens) => [lens.name, lens.enabled, lens.effect]),
    [
      ["Typed relations only", false, "hide"],
      ["Highlight challengers", false, "style"],
      ["Tasks", false, "show"],
    ],
  );
  for (const example of EXAMPLE_LENSES) {
    const res = validateLens(example);
    assert.equal(res.ok, true);
    assert.equal(res.lens.enabled, false);
  }
});

test("validateLens normalizes valid lenses, strips unknown keys, and validates colors strictly", () => {
  const valid = validateLens({
    id: "  tasks-orange ",
    name: "  Tasks orange  ",
    enabled: true,
    scope: "node",
    effect: "style",
    extraTop: "dropped",
    match: {
      all: [
        { field: "type", op: "is", value: "  Task  ", extraCond: 1 },
        { field: "attr: Status ", op: "exists", value: "ignored-value" },
      ],
      extraMatch: true,
    },
    style: {
      fill: " rgba(254, 243, 199, 0.5) ",
      border: "#ea580c",
      text: "",
      extraStyle: "dropped",
    },
  });

  assert.equal(valid.ok, true);
  assert.deepEqual(valid.lens, {
    id: "tasks-orange",
    name: "Tasks orange",
    enabled: true,
    scope: "node",
    effect: "style",
    match: {
      all: [
        { field: "type", op: "is", value: "Task" },
        { field: "attr:Status", op: "exists" },
      ],
    },
    style: {
      fill: "rgba(254, 243, 199, 0.5)",
      border: "#ea580c",
      text: "",
    },
  });

  for (const goodColor of ["#f90", "#f90a", "#ea580c", "#ea580c80", "rgb(234, 88, 12)", "hsl(24, 90%, 48%)", "oklch(0.65 0.18 45)"]) {
    const res = validateLens({
      id: "c",
      name: "Color check",
      effect: "style",
      match: { all: [{ field: "kind", op: "is", value: "page" }] },
      style: { border: goodColor },
    });
    assert.equal(res.ok, true, `expected color ${goodColor} to pass`);
    assert.equal(res.lens.style.border, goodColor);
  }

  const badColors = [
    "red; background: url(x)",
    "url(x)",
    "url(https://evil.test/a.png)",
    "var(--compass-ink)",
    "expression(alert(1))",
    "#12",
    "#12345",
    "#gggggg",
    "rgb()",
    "rgba(255, 255, 255, 0.12345678901234567890)",
  ];
  for (const badColor of badColors) {
    const res = validateLens({
      id: "bad-color",
      name: "Bad color",
      effect: "style",
      match: { all: [{ field: "kind", op: "is", value: "page" }] },
      style: { fill: badColor },
    });
    assert.equal(res.ok, false, `expected color ${badColor} to be refused`);
    assert.ok(res.errors.some((err) => err.includes("fill")));
  }
});

test("validateLens reports errors for invalid structure, ids, fields, operators, and values", () => {
  assert.equal(validateLens(null).ok, false);
  assert.equal(validateLens([]).ok, false);

  const invalid = validateLens({
    id: "Bad_ID!",
    name: "   ",
    enabled: "yes",
    scope: "global",
    effect: "blink",
    match: { all: [] },
    style: "orange",
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.length >= 5);

  const emptyAttr = validateLens({
    id: "attr-empty",
    name: "Empty attr",
    effect: "hide",
    match: { all: [{ field: "attr:   ", op: "exists" }] },
  });
  assert.equal(emptyAttr.ok, false);
  assert.ok(emptyAttr.errors.some((msg) => msg.toLowerCase().includes("attribute")));

  const missingVal = validateLens({
    id: "missing-val",
    name: "Missing val",
    effect: "hide",
    match: { all: [{ field: "type", op: "is", value: "   " }] },
  });
  assert.equal(missingVal.ok, false);
  assert.ok(missingVal.errors.some((msg) => msg.toLowerCase().includes("value")));
});

test("normalizeLenses filters invalid items and deduplicates ids keeping the first", () => {
  const normalized = normalizeLenses([
    {
      id: "dup",
      name: "First wins",
      enabled: true,
      scope: "node",
      effect: "hide",
      match: { all: [{ field: "kind", op: "is", value: "block" }] },
    },
    {
      id: "dup",
      name: "Second dropped",
      enabled: false,
      scope: "node",
      effect: "show",
      match: { all: [{ field: "kind", op: "is", value: "page" }] },
    },
    { id: "BAD!", name: "Invalid" },
    null,
  ]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].name, "First wins");
  assert.deepEqual(normalizeLenses("not-an-array"), []);
  assert.equal(slugLensId("Tasks Orange!", ["tasks-orange"]), "tasks-orange-2");
});

test("evaluateLenses handles show + hide + style interplay, field-by-field overrides, and skips styling hidden nodes", () => {
  const nodes = [
    { uid: "t1", title: "Task One", kind: "page", role: "child", zone: "south", style: "typed" },
    { uid: "t2", title: "Task Two", kind: "page", role: "challenger", zone: "east", style: "typed" },
    { uid: "t3", title: "Task Link", kind: "page", role: "child", zone: "south", style: "link" },
    { uid: "doc", title: "Budget", kind: "page", role: "child", zone: "south", style: "link" },
  ];
  const attrs = {
    t1: { type: { name: "Type", values: [{ text: "Task" }] }, status: { name: "Status", values: [{ text: "Doing" }] } },
    t2: { type: { name: "Type", values: [{ text: "Task" }] }, status: { name: "Status", values: [{ text: "Doing" }] } },
    t3: { type: { name: "Type", values: [{ text: "Task" }] } },
    doc: { type: { name: "Type", values: [{ text: "Source" }] } },
  };
  const facts = factsFor(nodes, attrs);

  const lenses = normalizeLenses([
    {
      id: "disabled-hide-all",
      name: "Disabled",
      enabled: false,
      scope: "node",
      effect: "hide",
      match: { all: [{ field: "kind", op: "is", value: "page" }] },
    },
    {
      id: "show-tasks",
      name: "Show tasks",
      enabled: true,
      scope: "node",
      effect: "show",
      match: { all: [{ field: "type", op: "is", value: "Task" }] },
    },
    {
      id: "hide-links",
      name: "Hide links",
      enabled: true,
      scope: "relationship",
      effect: "hide",
      match: { all: [{ field: "style", op: "is", value: "link" }] },
    },
    {
      id: "style-tasks",
      name: "Style tasks",
      enabled: true,
      scope: "node",
      effect: "style",
      match: { all: [{ field: "type", op: "is", value: "Task" }] },
      style: { fill: "#fef3c7", border: "#d97706", text: "#78350f" },
    },
    {
      id: "style-challenger",
      name: "Override challenger border",
      enabled: true,
      scope: "relationship",
      effect: "style",
      match: { all: [{ field: "role", op: "is", value: "challenger" }] },
      style: { fill: "", border: "#dc2626", text: "" },
    },
  ]);

  const { hidden, styles } = evaluateLenses(lenses, facts);

  // doc fails show-tasks; t3 matches show-tasks but is hidden by hide-links.
  assert.deepEqual([...hidden].sort(), ["doc", "t3"]);
  // Hidden nodes receive no style even though t3 matched style-tasks.
  assert.equal(styles.has("t3"), false);
  assert.equal(styles.has("doc"), false);

  // t1 gets style-tasks; t2 gets style-tasks overridden on border only by style-challenger.
  assert.deepEqual(styles.get("t1"), { fill: "#fef3c7", border: "#d97706", text: "#78350f" });
  assert.deepEqual(styles.get("t2"), { fill: "#fef3c7", border: "#dc2626", text: "#78350f" });
});

test("typeFilter and typesPresent handle empty selections, untyped facts, and frequency ordering", () => {
  const facts = new Map([
    ["a", factOf({ uid: "a", title: "A", kind: "page" }, { type: { values: [{ text: "Task" }] } })],
    ["b", factOf({ uid: "b", title: "B", kind: "page" }, { type: { values: [{ text: "Task" }] } })],
    ["c", factOf({ uid: "c", title: "C", kind: "page" }, { type: { values: [{ text: "Source" }] } })],
    ["d", factOf({ uid: "d", title: "D", kind: "page" }, {})],
    ["e", factOf({ uid: "e", title: "E", kind: "block" }, {})],
    ["f", factOf({ uid: "f", title: "F", kind: "block" }, {})],
  ]);

  assert.deepEqual(typesPresent(facts), [
    { type: "Task", count: 2 },
    { type: "Source", count: 1 },
    { type: "", count: 3 },
  ]);

  assert.deepEqual([...typeFilter(facts, [])], []);
  assert.deepEqual([...typeFilter(facts, new Set())], []);
  assert.deepEqual([...typeFilter(facts, new Set(["Source", ""]))].sort(), ["a", "b"]);
  assert.deepEqual([...typeFilter(facts, ["Task"])].sort(), ["c", "d", "e", "f"]);
});

test("lensToJson and lensFromJson round-trip valid lenses and reject bad JSON", () => {
  const text = lensToJson(EXAMPLE_LENSES[0]);
  assert.ok(text.includes('\n  "id": "typed-only"'));
  const parsed = lensFromJson(text);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.lens, validateLens(EXAMPLE_LENSES[0]).lens);

  assert.equal(lensFromJson("").ok, false);
  assert.equal(lensFromJson("{not json").ok, false);
  assert.equal(lensFromJson('{"name": "Only name"}').ok, false);
});

test("createLenses tolerates null ctx and wires reflow, via fixup, custom view afterRender, and commands", async () => {
  const stub = createLenses(null);
  assert.equal(stub.name, "lenses");
  assert.deepEqual([...stub.hiddenFor([])], []);

  // Build minimal DOM harness for feature seam checks (custom view geometry.nodes + reflow via fixup).
  function el(tag, className = "", text = "") {
    const node = {
      tag,
      className,
      textContent: text,
      value: "",
      checked: false,
      hidden: false,
      dataset: {},
      attrs: {},
      style: {
        setProperty(k, v) { this[k] = v; },
        removeProperty(k) { delete this[k]; },
      },
      children: [],
      parentElement: null,
      _listeners: new Map(),
      addEventListener(type, fn) {
        const list = this._listeners.get(type) ?? [];
        list.push(fn);
        this._listeners.set(type, list);
      },
      removeEventListener(type, fn) {
        const list = this._listeners.get(type) ?? [];
        const idx = list.indexOf(fn);
        if (idx >= 0) list.splice(idx, 1);
      },
      dispatchEvent(ev) {
        for (const fn of this._listeners.get(ev.type) ?? []) fn(ev);
      },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k] ?? null; },
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 1440, bottom: 900, width: 1440, height: 900 }),
      classList: {
        _set() { return new Set(String(node.className || "").split(/\s+/).filter(Boolean)); },
        contains(c) { return this._set().has(c); },
        toggle(c, force) {
          const s = this._set();
          const on = force === undefined ? !s.has(c) : Boolean(force);
          if (on) s.add(c);
          else s.delete(c);
          node.className = [...s].join(" ");
          return on;
        },
      },
      append(...kids) {
        for (const k of kids) {
          if (!k) continue;
          k.parentElement = node;
          node.children.push(k);
        }
      },
      replaceChildren(...kids) {
        node.children = [];
        node.append(...kids);
      },
      remove() {},
      querySelectorAll(sel) {
        const out = [];
        const walk = (cur) => {
          for (const child of cur.children) {
            if (sel === ".compass-node[data-uid]" && child.classList.contains("compass-node") && child.dataset.uid) {
              out.push(child);
            }
            walk(child);
          }
        };
        walk(node);
        return out;
      },
      querySelector(sel) {
        if (sel === ".compass-node-center") {
          return node.querySelectorAll(".compass-node[data-uid]").find((c) => c.classList.contains("compass-node-center")) ?? null;
        }
        return null;
      },
    };
    return node;
  }

  const root = el("div", "compass-root");
  const bar = el("div", "compass-bar");
  const world = el("div", "compass-world");
  let settings = {
    view: "facets",
    facetsPreset: "roles",
    filterReflow: true,
    lenses: [
      {
        id: "hide-parent",
        name: "Hide parent",
        enabled: true,
        scope: "relationship",
        effect: "hide",
        match: { all: [{ field: "zone", op: "is", value: "north" }] },
        style: { fill: "", border: "", text: "" },
      },
      {
        id: "style-sib",
        name: "Style sibling",
        enabled: true,
        scope: "relationship",
        effect: "style",
        match: { all: [{ field: "zone", op: "is", value: "siblings" }] },
        style: { fill: "#fef3c7", border: "#ea580c", text: "" },
      },
    ],
  };
  let lensState = { pages: true, blocks: true, drawings: true, regions: true, keyword: "" };
  let hood = {
    center: { uid: "c", kind: "page", title: "Center" },
    nodes: [
      { uid: "p1", kind: "page", title: "Parent One", role: "parent", zone: "north", style: "typed", via: null },
      { uid: "s1", kind: "page", title: "Sibling One", role: "sibling", zone: "siblings", style: "sibling", via: "p1" },
    ],
  };

  const ctx = {
    dom: { root, bar, world },
    el,
    button(cls, text, label) {
      const b = el("button", cls, text);
      if (label) b.setAttribute("aria-label", label);
      return b;
    },
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    guard: (fn) => (...args) => fn(...args),
    lifecycle: {
      node(n, p) { p.append(n); return n; },
      event(t, type, fn) { t?.addEventListener?.(type, fn); },
    },
    features: {
      get(name) {
        if (name === "views") return { current: () => ({ view: settings.view, preset: settings.facetsPreset }), set: async () => {} };
        return null;
      },
    },
    state: {
      get current() { return "c"; },
      get hood() { return hood; },
      get geometry() { return { nodes: hood.nodes }; },
      get settings() { return settings; },
      get lens() { return { ...lensState }; },
    },
    setLens(patch) { lensState = { ...lensState, ...patch }; },
    async saveSetting(id, val) {
      if (id === "compass-lenses") settings = { ...settings, lenses: val };
      if (id === "compass-filter-reflow") settings = { ...settings, filterReflow: val };
    },
    addBarButton(b) { bar.append(b); return b; },
    rebuild() {},
    render() {},
    setStatus() {},
    facts: (nodes) => factsFor(nodes, {}),
  };

  const feature = createLenses(ctx);
  feature.onSettings(settings);

  // transformHood removes p1 (north) and clears s1.via from "p1" to null without mutating original node.
  const reflowed = feature.transformHood(hood);
  assert.deepEqual(reflowed.nodes.map((n) => [n.uid, n.via]), [["s1", null]]);
  assert.equal(hood.nodes[1].via, "p1");

  // Custom view afterRender fades hidden nodes, styles surviving nodes, and never touches center card.
  const centerCard = el("div", "compass-node compass-node-center");
  centerCard.dataset.uid = "c";
  setCenterDirty: {
    centerCard.classList.toggle("compass-lensed", true);
    centerCard.style.setProperty("--compass-lens-border", "#000000");
    break setCenterDirty;
  }
  const p1Card = el("div", "compass-node");
  p1Card.dataset.uid = "p1";
  const s1Card = el("div", "compass-node");
  s1Card.dataset.uid = "s1";
  world.append(centerCard, p1Card, s1Card);

  feature.afterRender({ hood, geometry: { nodes: [hood.center, ...hood.nodes] }, view: "facets" });
  assert.equal(centerCard.classList.contains("compass-lensed"), false);
  assert.equal(centerCard.style["--compass-lens-border"], undefined);
  assert.equal(p1Card.classList.contains("compass-fade"), true);
  assert.equal(p1Card.classList.contains("compass-lensed"), false);
  assert.equal(s1Card.classList.contains("compass-fade"), false);
  assert.equal(s1Card.classList.contains("compass-lensed"), true);
  assert.equal(s1Card.style["--compass-lens-fill"], "#fef3c7");
  assert.equal(s1Card.style["--compass-lens-border"], "#ea580c");

  // Open + Escape closes panel and consumes Escape.
  assert.equal(feature.onEscape(), false);
  feature.open();
  assert.equal(feature.onEscape(), true);

  // Commands include fixed entries and per-lens toggle commands.
  assert.deepEqual(
    feature.commands().map((c) => c.id),
    ["lenses-open", "filter-clear", "filter-reflow", "lens-toggle-hide-parent", "lens-toggle-style-sib"],
  );
});

test("createLenses handles Facets preset controls with or without facets feature and resets types on close", async () => {
  function el(tag, className = "", text = "") {
    const node = {
      tag,
      className,
      textContent: text,
      value: "",
      checked: false,
      hidden: false,
      dataset: {},
      attrs: {},
      style: {
        setProperty(k, v) { this[k] = v; },
        removeProperty(k) { delete this[k]; },
      },
      children: [],
      parentElement: null,
      _listeners: new Map(),
      addEventListener(type, fn) {
        const list = this._listeners.get(type) ?? [];
        list.push(fn);
        this._listeners.set(type, list);
      },
      dispatchEvent(ev) {
        for (const fn of this._listeners.get(ev.type) ?? []) fn(ev);
      },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k] ?? null; },
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 1440, bottom: 900, width: 1440, height: 900 }),
      classList: {
        _set() { return new Set(String(node.className || "").split(/\s+/).filter(Boolean)); },
        contains(c) { return this._set().has(c); },
        toggle(c, force) {
          const s = this._set();
          const on = force === undefined ? !s.has(c) : Boolean(force);
          if (on) s.add(c);
          else s.delete(c);
          node.className = [...s].join(" ");
          return on;
        },
      },
      append(...kids) {
        for (const k of kids) {
          if (!k) continue;
          k.parentElement = node;
          node.children.push(k);
        }
      },
      replaceChildren(...kids) {
        node.children = [];
        node.append(...kids);
      },
      querySelectorAll: () => [],
      querySelector: () => null,
    };
    return node;
  }

  function findByClass(rootNode, cls) {
    let found = null;
    const walk = (cur) => {
      if (found) return;
      if (cur.classList?.contains(cls)) {
        found = cur;
        return;
      }
      for (const child of cur.children ?? []) walk(child);
    };
    walk(rootNode);
    return found;
  }

  const root = el("div", "compass-root");
  const bar = el("div", "compass-bar");
  const world = el("div", "compass-world");
  let facetsImpl = null;
  const viewCalls = [];
  let openedPresetEditor = 0;

  const nodes = [
    { uid: "t1", kind: "page", title: "Task One", role: "child", zone: "south", style: "typed" },
    { uid: "b1", kind: "page", title: "Budget", role: "child", zone: "south", style: "link" },
  ];
  const attrs = {
    t1: { type: { name: "Type", values: [{ text: "Task" }] } },
    b1: { type: { name: "Type", values: [{ text: "Source" }] } },
  };

  const ctx = {
    dom: { root, bar, world },
    el,
    button(cls, text, label) {
      const b = el("button", cls, text);
      if (label) b.setAttribute("aria-label", label);
      return b;
    },
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    guard: (fn) => (...args) => fn(...args),
    lifecycle: {
      node(n, p) { p.append(n); return n; },
      event(t, type, fn) { t?.addEventListener?.(type, fn); },
    },
    features: {
      get(name) {
        if (name === "views") {
          return {
            current: () => ({ view: "facets", preset: "roles" }),
            set: async (v, p) => { viewCalls.push([v, p]); },
          };
        }
        if (name === "facets") return facetsImpl;
        return null;
      },
    },
    state: {
      current: "c",
      hood: { center: { uid: "c" }, nodes },
      geometry: { nodes },
      settings: { view: "facets", facetsPreset: "roles", filterReflow: false, lenses: [] },
      lens: { pages: true, blocks: true, drawings: true, regions: true, keyword: "" },
    },
    setLens() {},
    async saveSetting() {},
    addBarButton(b) { bar.append(b); return b; },
    rebuild() {},
    render() {},
    setStatus() {},
    facts: (list) => factsFor(list, attrs),
  };

  const feature = createLenses(ctx);
  feature.open();

  const selectEl = findByClass(root, "compass-vl-preset-select");
  const editBtn = findByClass(root, "compass-vl-preset-edit");
  assert.equal(selectEl.hidden, true);
  assert.equal(editBtn.hidden, true);

  facetsImpl = {
    presets: () => [{ id: "roles", name: "Roles", builtin: true }, { id: "status", name: "By status", builtin: false }],
    openPresetEditor: () => { openedPresetEditor += 1; },
  };
  feature.open();
  assert.equal(selectEl.hidden, false);
  assert.equal(editBtn.hidden, false);
  assert.equal(selectEl.children.length, 2);

  selectEl.value = "status";
  await selectEl._listeners.get("change")[0]();
  assert.deepEqual(viewCalls, [["facets", "status"]]);

  editBtn.dispatchEvent({ type: "click" });
  assert.equal(openedPresetEditor, 1);

  const typesWrap = findByClass(root, "compass-qf-types");
  const taskChip = typesWrap.children.find((btn) => btn.dataset.type === "Task");
  taskChip.dispatchEvent({ type: "click" });
  assert.deepEqual([...feature.hiddenFor(nodes)], ["t1"]);

  feature.onClose();
  assert.deepEqual([...feature.hiddenFor(nodes)], []);
});
