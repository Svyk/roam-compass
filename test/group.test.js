import assert from "node:assert/strict";
import test from "node:test";

import { GROUP_LABEL, groupIds, groupKey, groupLabel, groupNodes } from "../src/model/group.js";
import { modelSettings } from "../src/model/neighborhood.js";
import { SETTING_IDS } from "../src/settings.js";
import { createLayoutOptions } from "../src/view/features/layout-options.js";

function node(uid, zone, extra = {}) {
  const defaultRole = {
    north: "parent",
    south: "child",
    west: "friend",
    east: "challenger",
    siblings: "sibling",
  }[zone];
  return {
    uid,
    kind: "page",
    title: uid.toUpperCase(),
    string: "",
    alias: "",
    editTime: 0,
    createTime: 0,
    role: defaultRole,
    zone,
    strength: 1,
    style: zone === "siblings" ? "sibling" : "typed",
    evidence: [{ kind: zone === "siblings" ? "sibling" : "typed", role: defaultRole }],
    label: "",
    writable: null,
    via: null,
    ...extra,
  };
}

function fact(uid, { type = "", group = "page" } = {}) {
  return { uid, type, group };
}

test("groupKey and groupLabel handle explicit types and every kind label", () => {
  assert.equal(groupKey({ type: "Task", group: "page" }), "type:Task");
  assert.equal(groupLabel("type:Task"), "Task");
  for (const [kind, label] of Object.entries(GROUP_LABEL)) {
    const key = groupKey({ type: "", group: kind });
    assert.equal(key, `kind:${kind}`);
    assert.equal(groupLabel(key), label);
  }
});

test("groupNodes separates areas, keeps singles, never groups siblings, and preserves stable order", () => {
  const nodes = [
    node("n1", "north", { strength: 1 }),
    node("n2", "north", { strength: 3 }),
    node("s1", "south", { strength: 2 }),
    node("solo", "south"),
    node("s2", "south", { strength: 3 }),
    node("src1", "south"),
    node("s3", "south", { strength: 1 }),
    node("src2", "south"),
    node("sib1", "siblings"),
    node("sib2", "siblings"),
  ];
  const facts = new Map([
    ["n1", fact("n1", { type: "Task" })],
    ["n2", fact("n2", { type: "Task" })],
    ["s1", fact("s1", { type: "Task" })],
    ["solo", fact("solo", { group: "empty" })],
    ["s2", fact("s2", { type: "Task" })],
    ["src1", fact("src1", { type: "Source" })],
    ["s3", fact("s3", { type: "Task" })],
    ["src2", fact("src2", { type: "Source" })],
    ["sib1", fact("sib1", { type: "Task" })],
    ["sib2", fact("sib2", { type: "Task" })],
  ]);

  const out = groupNodes(nodes, facts);
  assert.deepEqual(
    out.map((item) => item.uid),
    [
      "group:north:type:Task",
      "group:south:type:Task",
      "solo",
      "group:south:type:Source",
      "sib1",
      "sib2",
    ],
  );
  assert.deepEqual(groupIds(out), [
    "group:north:type:Task",
    "group:south:type:Task",
    "group:south:type:Source",
  ]);

  const southTasks = out[1];
  assert.deepEqual(southTasks, {
    uid: "group:south:type:Task",
    kind: "group",
    title: "Task",
    count: 3,
    members: ["s1", "s2", "s3"],
    zone: "south",
    role: "child",
    strength: 3,
    style: "group",
    evidence: [{ kind: "group", role: "child" }],
    label: "",
    alias: "",
    string: "",
    editTime: 0,
    createTime: 0,
    writable: null,
    via: null,
  });
});

test("unfolded group ids leave their members in original order", () => {
  const nodes = [
    node("t1", "south"),
    node("src1", "south"),
    node("t2", "south"),
    node("src2", "south"),
  ];
  const facts = new Map([
    ["t1", fact("t1", { type: "Task" })],
    ["t2", fact("t2", { type: "Task" })],
    ["src1", fact("src1", { type: "Source" })],
    ["src2", fact("src2", { type: "Source" })],
  ]);

  const out = groupNodes(nodes, facts, { unfolded: new Set(["group:south:type:Task"]) });
  assert.deepEqual(
    out.map((item) => item.uid),
    ["t1", "group:south:type:Source", "t2"],
  );
});

test("oneSided merges west and east into one shared west area", () => {
  const nodes = [
    node("w1", "west"),
    node("w-solo", "west"),
    node("e1", "east"),
    node("e2", "east"),
    node("e3", "east"),
  ];
  const facts = new Map([
    ["w1", fact("w1", { type: "Project" })],
    ["w-solo", fact("w-solo", { group: "page" })],
    ["e1", fact("e1", { type: "Project" })],
    ["e2", fact("e2", { type: "Risk" })],
    ["e3", fact("e3", { type: "Risk" })],
  ]);

  const separate = groupNodes(nodes, facts, { oneSided: false });
  assert.deepEqual(
    separate.map((item) => item.uid),
    ["w1", "w-solo", "e1", "group:east:type:Risk"],
  );

  const merged = groupNodes(nodes, facts, { oneSided: true });
  assert.deepEqual(
    merged.map((item) => item.uid),
    ["group:west:type:Project", "w-solo", "group:west:type:Risk"],
  );
  assert.equal(merged[0].zone, "west");
  assert.deepEqual(merged[0].members, ["w1", "e1"]);
  assert.equal(merged[2].zone, "west");
  assert.deepEqual(merged[2].members, ["e2", "e3"]);
});

test("sibling via is cleared when its parent folds into a group and kept otherwise", () => {
  const sibFolded = node("sib-a", "siblings", { via: "p1" });
  const sibKept = node("sib-b", "siblings", { via: "p-solo" });
  const nodes = [
    node("p1", "north"),
    node("p2", "north"),
    node("p-solo", "north"),
    sibFolded,
    sibKept,
  ];
  const facts = new Map([
    ["p1", fact("p1", { type: "Program" })],
    ["p2", fact("p2", { type: "Program" })],
    ["p-solo", fact("p-solo", { type: "Goal" })],
  ]);

  const folded = groupNodes(nodes, facts);
  assert.equal(folded.find((item) => item.uid === "sib-a").via, null);
  assert.equal(folded.find((item) => item.uid === "sib-b").via, "p-solo");
  assert.equal(sibFolded.via, "p1");

  const unfolded = groupNodes(nodes, facts, { unfolded: new Set(["group:north:type:Program"]) });
  assert.equal(unfolded.find((item) => item.uid === "sib-a").via, "p1");
});

test("nodes without a fact (boards and cards) bucket by style", () => {
  const nodes = [
    node("b1", "west", { style: "board" }),
    node("b2", "west", { style: "board" }),
    node("c1", "south", { style: "card" }),
    node("c2", "south", { style: "card" }),
  ];
  const out = groupNodes(nodes, new Map());
  assert.deepEqual(
    out.map((item) => ({ uid: item.uid, title: item.title, count: item.count })),
    [
      { uid: "group:west:kind:board", title: "Boards", count: 2 },
      { uid: "group:south:kind:card", title: "Cards", count: 2 },
    ],
  );
});

test("createLayoutOptions manages commands, toggles, grouping, unfolded menu/navigation, hiddenUids, expanded sub-rows, trackpad wheel, and Compass-only guard", async () => {
  assert.equal(createLayoutOptions(null).name, "layout");

  let viewName = "compass";
  let currentUid = "alpha";
  let currentHood = null;
  let lens = { pages: true, blocks: true, drawings: true, regions: true, keyword: "" };
  let settings = {
    group: false,
    expanded: false,
    flip: false,
    oneSided: false,
    trackpad: false,
    model: modelSettings(),
  };
  let camera = { zoom: 1, panX: 0, panY: 0 };
  const calls = [];
  const snapshotCalls = [];

  function fakeEl(tag, cls = "", text = "") {
    const el = {
      tag,
      className: cls,
      textContent: text,
      dataset: {},
      attrs: {},
      children: [],
      title: "",
      tabIndex: -1,
      setAttribute(k, v) { el.attrs[k] = String(v); },
      getAttribute(k) { return el.attrs[k] ?? null; },
      classList: {
        add(...names) {
          const set = new Set(String(el.className).split(/\s+/).filter(Boolean));
          for (const n of names) set.add(n);
          el.className = [...set].join(" ");
        },
        contains(n) {
          return String(el.className).split(/\s+/).includes(n);
        },
      },
      append(...kids) { el.children.push(...kids); },
      querySelector(sel) {
        if (sel === ".compass-node-title") return el.children.find((c) => c.className === "compass-node-title") ?? null;
        if (sel === ".compass-group-count") return el.children.find((c) => c.className === "compass-group-count") ?? null;
        return null;
      },
      remove() {},
    };
    return el;
  }

  let layoutFeat = null;
  const rootDataset = {};
  const ctx = {
    dom: {
      root: { dataset: rootDataset },
      stage: {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      },
    },
    state: {
      get current() { return currentUid; },
      get hood() { return currentHood; },
      get settings() { return settings; },
      get lens() { return lens; },
      get zoom() { return camera.zoom; },
      get panX() { return camera.panX; },
      get panY() { return camera.panY; },
      nodeEls: new Map(),
    },
    features: {
      get(name) {
        if (name === "views") return { current: () => ({ view: viewName, preset: "roles" }) };
        return null;
      },
    },
    host: {
      snapshot(uid) {
        snapshotCalls.push(uid);
        if (uid === "t1") {
          const refs = [
            { uid: "alpha", title: "Alpha" },
            { uid: "sub1", title: "Sub 1" },
            { uid: "sub2", title: "Sub 2" },
            { uid: "sub3", title: "Sub 3" },
            { uid: "sub4", title: "Sub 4" },
            { uid: "sub5", title: "Sub 5" },
          ];
          return {
            center: { uid: "t1", kind: "page", title: "Task 1" },
            outline: [{
              uid: "b-t1",
              string: refs.map((r) => `[[${r.title}]]`).join(" "),
              order: 0,
              refs,
              children: [],
            }],
            out: [],
            in: [],
            mentions: [],
            namespace: null,
            days: null,
            peers: [],
          };
        }
        return {
          center: { uid, kind: "page", title: uid },
          outline: [],
          out: [],
          in: [],
          mentions: [],
          namespace: null,
          days: null,
          peers: [],
        };
      },
    },
    el: fakeEl,
    button: (cls, text, title) => {
      const btn = fakeEl("button", cls, text);
      btn.title = title ?? "";
      return btn;
    },
    addBarButton() {},
    lifecycle: { event() {}, add() {} },
    guard: (fn) => fn,
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    curve: () => ({ d: "", mid: [0, 0] }),
    facts: () => new Map([
      ["t1", fact("t1", { type: "Task" })],
      ["t2", fact("t2", { type: "Task" })],
      ["solo", fact("solo", { type: "Note" })],
    ]),
    async saveSetting(id, value) {
      calls.push(["saveSetting", id, value]);
      const entry = Object.entries(SETTING_IDS).find(([, key]) => key === id);
      if (entry) settings = { ...settings, [entry[0]]: value };
      layoutFeat.onSettings(settings);
    },
    rebuild() { calls.push(["rebuild"]); },
    render() { calls.push(["render"]); },
    fit(glide) { calls.push(["fit", glide]); },
    focusUid(uid) { calls.push(["focusUid", uid]); },
    setCamera(next, animate) {
      camera = { ...camera, ...next };
      calls.push(["setCamera", { ...camera }, animate]);
    },
  };

  layoutFeat = createLayoutOptions(ctx);
  assert.deepEqual(
    layoutFeat.commands().map((c) => [c.id, c.title]),
    [
      ["layout-group", "Toggle grouping by type"],
      ["layout-expanded", "Toggle expanded view"],
      ["layout-flip", "Flip East–West"],
      ["layout-one-sided", "Toggle one-sided layout"],
      ["layout-trackpad", "Toggle trackpad navigation"],
    ],
  );

  // Toggle group and verify transformHood + hiddenUids + nodeMenu + onNavigate reset.
  await layoutFeat.toggleGroup();
  assert.equal(settings.group, true);

  const rawHood = {
    center: { uid: "alpha" },
    nodes: [node("t1", "south", { title: "Task 1" }), node("t2", "south", { title: "Task 2" }), node("solo", "south", { title: "Solo" })],
  };
  currentHood = layoutFeat.transformHood(rawHood);
  assert.deepEqual(currentHood.nodes.map((n) => n.uid), ["group:south:type:Task", "solo"]);

  // Group node passes kind filters and fades only when all of its members are hidden.
  assert.deepEqual(layoutFeat.hiddenUids([], currentHood), []);
  assert.deepEqual(layoutFeat.hiddenUids(["group:south:type:Task"], currentHood), []);
  lens = { ...lens, pages: false };
  assert.deepEqual(layoutFeat.hiddenUids([], currentHood), ["group:south:type:Task"]);
  lens = { ...lens, pages: true, keyword: "Task 1" };
  assert.deepEqual(layoutFeat.hiddenUids(["group:south:type:Task"], currentHood), []);
  lens = { ...lens, keyword: "" };

  // Unfold via nodeMenu, verify Fold group appears on members, and verify onNavigate resets unfolded state.
  const groupNode = currentHood.nodes[0];
  const groupMenu = layoutFeat.nodeMenu(groupNode.uid, groupNode);
  assert.deepEqual(groupMenu.map((m) => m.title), ["Unfold group"]);
  groupMenu[0].run();
  currentHood = layoutFeat.transformHood(rawHood);
  assert.deepEqual(currentHood.nodes.map((n) => n.uid), ["t1", "t2", "solo"]);
  const memberMenu = layoutFeat.nodeMenu("t1", currentHood.nodes[0]);
  assert.deepEqual(memberMenu.map((m) => m.title), ["Fold group"]);

  layoutFeat.onNavigate({ uid: "other", previous: "alpha", changed: true });
  currentHood = layoutFeat.transformHood(rawHood);
  assert.deepEqual(currentHood.nodes.map((n) => n.uid), ["group:south:type:Task", "solo"]);

  // Expanded view computes capped sub-row count (4 + 1 more = 5, excluding center "alpha") and caches per uid until onSettings.
  await layoutFeat.toggleGroup();
  currentHood = rawHood;
  await layoutFeat.toggleExpanded();
  const opts1 = layoutFeat.layoutOptions({ rows: [] });
  assert.deepEqual(opts1.sub, { t1: 5 });
  const countAfterFirst = snapshotCalls.length;
  layoutFeat.layoutOptions({ rows: [] });
  assert.equal(snapshotCalls.length, countAfterFirst);
  layoutFeat.onSettings(settings);
  layoutFeat.layoutOptions({ rows: [] });
  assert.ok(snapshotCalls.length > countAfterFirst);

  // Non-Compass views bypass transformHood, layoutOptions, and root attributes.
  const cmds = layoutFeat.commands();
  await cmds.find((c) => c.id === "layout-flip").run();
  await cmds.find((c) => c.id === "layout-one-sided").run();
  viewName = "mindmap";
  assert.equal(layoutFeat.transformHood(rawHood), rawHood);
  assert.deepEqual(layoutFeat.layoutOptions({ rows: [] }), { rows: [] });
  layoutFeat.afterRender({ hood: rawHood, nodeEls: new Map(), view: "mindmap" });
  assert.equal(rootDataset.flip, undefined);
  assert.equal(rootDataset.oneSided, undefined);

  // Trackpad wheel: pans normally, zooms with ctrlKey or metaKey clamped within 20% per event.
  viewName = "compass";
  await cmds.find((c) => c.id === "layout-trackpad").run();
  let prevented = 0;
  assert.equal(layoutFeat.onWheel({
    deltaX: 30,
    deltaY: 50,
    ctrlKey: false,
    metaKey: false,
    preventDefault() { prevented += 1; },
  }), true);
  assert.equal(prevented, 1);
  assert.deepEqual({ panX: camera.panX, panY: camera.panY, zoom: camera.zoom }, { panX: -30, panY: -50, zoom: 1 });

  assert.equal(layoutFeat.onWheel({
    deltaX: 0,
    deltaY: -1000,
    clientX: 400,
    clientY: 300,
    ctrlKey: true,
    metaKey: false,
    preventDefault() { prevented += 1; },
  }), true);
  assert.equal(camera.zoom, 1.2);
});
