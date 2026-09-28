import assert from "node:assert/strict";
import test from "node:test";

import { classify } from "../src/model/classify.js";

function settings(overrides = {}) {
  return {
    parents: "Parent",
    children: "Child",
    friends: "Friend, Previous",
    challengers: "Challenger, Next",
    hidden: "Hidden",
    maxPerZone: 24,
    showUntyped: true,
    showSiblings: true,
    showBadges: true,
    showOutline: false,
    ...overrides,
  };
}

function base(overrides = {}) {
  const settingOverrides = overrides.settings;
  const rest = { ...overrides };
  delete rest.settings;
  return {
    center: { uid: "center", title: "Center" },
    harcs: [],
    outbound: [],
    inbound: [],
    outline: [],
    namespaceParent: null,
    ...rest,
    settings: settings(settingOverrides),
  };
}

function harc(overrides = {}) {
  return {
    uid: "harc",
    entityUids: ["center"],
    attribute: { uid: "attr", title: "Child" },
    values: [],
    sourceUid: "src",
    sourceString: "Child::",
    valueSourceUids: [],
    labels: [],
    ...overrides,
  };
}

test("Child:: [[A]] on the center places A south, typed, writable", () => {
  const result = classify(base({
    harcs: [harc({
      values: [{ uid: "a", title: "A" }],
      sourceString: "Child:: [[A]]",
      valueSourceUids: ["src"],
    })],
  }));
  assert.deepEqual(result.nodes, [{ uid: "a", title: "A", zone: "children", kind: "typed" }]);
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0].from, "center");
  assert.equal(result.edges[0].to, "a");
  assert.equal(result.edges[0].zone, "children");
  assert.equal(result.edges[0].kind, "typed");
  assert.equal(result.edges[0].attribute, "Child");
  assert.equal(result.edges[0].sourceUid, "src");
  assert.equal(result.edges[0].writable, true);
  assert.deepEqual(result.badges, []);
});

test("center is a value of a Child harc: entity is north inverse, other page is a sibling", () => {
  const result = classify(base({
    harcs: [harc({
      uid: "harc-b",
      entityUids: ["b"],
      entities: [{ uid: "b", title: "B" }],
      values: [
        { uid: "center", title: "Center" },
        { uid: "c", title: "C" },
      ],
      sourceUid: "src-b",
      sourceString: "Child:: [[Center]]",
      valueSourceUids: ["src-b", "src-b"],
    })],
  }));
  assert.deepEqual(result.nodes.find((node) => node.uid === "b"), {
    uid: "b", title: "B", zone: "parents", kind: "inverse",
  });
  assert.deepEqual(result.nodes.find((node) => node.uid === "c"), {
    uid: "c", title: "C", zone: "siblings", kind: "inverse",
  });
  const edge = result.edges.find((item) => item.from === "b" && item.to === "center");
  assert.equal(edge.kind, "inverse");
  assert.equal(edge.writable, false);
  assert.equal(edge.zone, "parents");
  const sibling = result.edges.find((item) => item.to === "c");
  assert.equal(sibling.kind, "inverse");
  assert.equal(sibling.zone, "siblings");
  assert.equal(sibling.writable, false);
  assert.equal(result.nodes.some((node) => node.uid === "center"), false);
});

test("Parent:: [[center]] places the entity south as inverse", () => {
  const result = classify(base({
    harcs: [harc({
      entityUids: ["b"],
      entities: [{ uid: "b", title: "B" }],
      attribute: { uid: "attr-parent", title: "Parent" },
      values: [{ uid: "center", title: "Center" }],
      sourceString: "Parent:: [[Center]]",
    })],
  }));
  assert.deepEqual(result.nodes, [{ uid: "b", title: "B", zone: "children", kind: "inverse" }]);
  assert.equal(result.edges[0].writable, false);
  assert.equal(result.edges[0].kind, "inverse");
  assert.equal(result.edges[0].zone, "children");
});

test("Status:: Active is a badge, not a node", () => {
  const result = classify(base({
    harcs: [harc({
      attribute: { uid: "attr-status", title: "Status" },
      values: [{ uid: "v-1", vString: "Active" }],
      sourceString: "Status:: Active",
    })],
  }));
  assert.deepEqual(result.nodes, []);
  assert.deepEqual(result.edges, []);
  assert.deepEqual(result.badges, [{ attribute: "Status", text: "Active" }]);
});

test("Role:: Lead nested on the Owner harc is edge labels, and Jane is a node", () => {
  const result = classify(base({
    harcs: [
      harc({
        attribute: { uid: "attr-owner", title: "Owner" },
        values: [{ uid: "jane", title: "Jane" }],
        sourceString: "Owner:: [[Jane]]",
        labels: [{ attribute: "Role", text: "Lead" }],
      }),
      harc({
        uid: "harc-role",
        entityUids: ["harc"],
        attribute: { uid: "attr-role", title: "Role" },
        values: [{ uid: "v-role", vString: "Lead" }],
        sourceUid: "src-role",
        sourceString: "Role:: Lead",
      }),
    ],
  }));
  assert.deepEqual(result.nodes, [{ uid: "jane", title: "Jane", zone: "related", kind: "typed" }]);
  assert.deepEqual(result.edges[0].labels, [{ attribute: "Role", text: "Lead" }]);
  assert.equal(result.edges[0].writable, true);
  assert.equal(result.badges.length, 0);
  assert.equal(result.nodes.some((node) => node.uid === "v-role"), false);
});

test("an outbound link to a page that is already a child does not add a second node", () => {
  const result = classify(base({
    harcs: [harc({
      values: [{ uid: "a", title: "A" }],
      sourceString: "Child:: [[A]]",
    })],
    outbound: [{ uid: "a", title: "A" }, { uid: "b", title: "B" }],
  }));
  assert.equal(result.nodes.filter((node) => node.uid === "a").length, 1);
  assert.equal(result.nodes.find((node) => node.uid === "a").kind, "typed");
  assert.deepEqual(result.nodes.find((node) => node.uid === "b"), {
    uid: "b", title: "B", zone: "children", kind: "link",
  });
  assert.equal(result.edges.some((edge) => edge.kind === "link" && edge.to === "a"), false);
  assert.equal(result.edges.some((edge) => edge.kind === "link" && edge.to === "b"), true);
});

test("Hidden:: [[A]] with Hidden in the hidden list omits A", () => {
  const result = classify(base({
    harcs: [harc({
      attribute: { uid: "attr-hidden", title: "Hidden" },
      values: [{ uid: "a", title: "A" }],
      sourceString: "Hidden:: [[A]]",
    })],
  }));
  assert.deepEqual(result.nodes, []);
  assert.deepEqual(result.edges, []);
  assert.deepEqual(result.badges, []);
});

test("BT_attrProject:: [[P]] is omitted", () => {
  const result = classify(base({
    harcs: [harc({
      attribute: { uid: "attr-bt", title: "BT_attrProject" },
      values: [{ uid: "p", title: "P" }],
      sourceString: "BT_attrProject:: [[P]]",
    })],
  }));
  assert.deepEqual(result.nodes, []);
  assert.deepEqual(result.edges, []);
});

test("BT_attrProject listed under friends places P west", () => {
  const result = classify(base({
    settings: { friends: "BT_attrProject" },
    harcs: [harc({
      attribute: { uid: "attr-bt", title: "BT_attrProject" },
      values: [{ uid: "p", title: "P" }],
      sourceString: "BT_attrProject:: [[P]]",
    })],
  }));
  assert.deepEqual(result.nodes, [{ uid: "p", title: "P", zone: "friends", kind: "typed" }]);
  assert.equal(result.edges[0].writable, true);
  assert.equal(result.edges[0].zone, "friends");
});

test("Working on:: [[P]] goes to related", () => {
  const result = classify(base({
    harcs: [harc({
      attribute: { uid: "attr-work", title: "Working on" },
      values: [{ uid: "p", title: "P" }],
      sourceString: "Working on:: [[P]]",
    })],
  }));
  assert.deepEqual(result.nodes, [{ uid: "p", title: "P", zone: "related", kind: "typed" }]);
});

test("zone cap 1 with two children reports overflow.children === 1", () => {
  const result = classify(base({
    settings: { maxPerZone: 1 },
    harcs: [harc({
      values: [{ uid: "a", title: "A" }, { uid: "b", title: "B" }],
      sourceString: "Child::",
      valueSourceUids: ["blk-a", "blk-b"],
    })],
  }));
  assert.equal(result.nodes.filter((node) => node.zone === "children").length, 1);
  assert.equal(result.nodes[0].uid, "a");
  assert.equal(result.overflow.children, 1);
  assert.equal(result.edges.some((edge) => edge.to === "b"), false);
  assert.equal(result.edges.some((edge) => edge.to === "a"), true);
});

test("Aliases is denied unless that title is assigned a direction", () => {
  const omitted = classify(base({
    harcs: [harc({
      attribute: { uid: "attr-alias", title: "Aliases" },
      values: [{ uid: "a", title: "A" }],
      sourceString: "Aliases:: [[A]]",
    })],
  }));
  assert.deepEqual(omitted.nodes, []);
  const placed = classify(base({
    settings: { friends: "Aliases" },
    harcs: [harc({
      attribute: { uid: "attr-alias", title: "Aliases" },
      values: [{ uid: "a", title: "A" }],
      sourceString: "Aliases:: [[A]]",
    })],
  }));
  assert.equal(placed.nodes[0].zone, "friends");
});

test("siblings stay off when showSiblings is false", () => {
  const result = classify(base({
    settings: { showSiblings: false },
    harcs: [harc({
      entityUids: ["b"],
      entities: [{ uid: "b", title: "B" }],
      values: [{ uid: "center", title: "Center" }, { uid: "c", title: "C" }],
    })],
  }));
  assert.equal(result.nodes.some((node) => node.uid === "c"), false);
  assert.equal(result.nodes.some((node) => node.uid === "b"), true);
});

test("untyped links stay off when showUntyped is false", () => {
  const result = classify(base({
    settings: { showUntyped: false },
    outbound: [{ uid: "b", title: "B" }],
    inbound: [{ uid: "m", title: "M" }],
  }));
  assert.deepEqual(result.nodes, []);
});

test("namespace parent lands north when it is not already placed", () => {
  const result = classify(base({
    namespaceParent: { uid: "np", title: "Proj" },
  }));
  assert.deepEqual(result.nodes, [{ uid: "np", title: "Proj", zone: "parents", kind: "namespace" }]);
  assert.equal(result.edges[0].writable, false);
  assert.equal(result.edges[0].kind, "namespace");
});

test("outline is capped at 40 and ignores the relation cap", () => {
  const outline = Array.from({ length: 41 }, (_, index) => ({
    uid: `o${index}`,
    string: `block ${index}`,
    order: index,
  }));
  const result = classify(base({
    settings: { showOutline: true, maxPerZone: 1 },
    outline,
    harcs: [harc({
      values: [{ uid: "a", title: "A" }, { uid: "b", title: "B" }],
    })],
  }));
  assert.equal(result.nodes.filter((node) => node.zone === "outline").length, 40);
  assert.equal(result.overflow.outline, 1);
  assert.equal(result.nodes.filter((node) => node.zone === "children").length, 1);
  assert.equal(result.overflow.children, 1);
});

test("badges cap at 6 and skip denied or hidden scalars", () => {
  const harcs = Array.from({ length: 7 }, (_, index) => harc({
    uid: `h${index}`,
    attribute: { uid: `a${index}`, title: "Status" },
    values: [{ uid: `v${index}`, vString: `t${index}` }],
    sourceUid: `s${index}`,
    sourceString: `Status:: t${index}`,
  }));
  harcs.push(harc({
    uid: "hidden-scalar",
    attribute: { uid: "attr-hidden", title: "Hidden" },
    values: [{ uid: "vh", vString: "nope" }],
    sourceString: "Hidden:: nope",
  }));
  harcs.push(harc({
    uid: "bt-scalar",
    attribute: { uid: "attr-bt", title: "BT_attrStatus" },
    values: [{ uid: "vb", vString: "nope" }],
    sourceString: "BT_attrStatus:: nope",
  }));
  const result = classify(base({ harcs }));
  assert.equal(result.badges.length, 6);
  assert.deepEqual(result.badges[0], { attribute: "Status", text: "t0" });
  assert.equal(result.badges.some((badge) => badge.text === "nope"), false);
  assert.deepEqual(result.nodes, []);
});

test("block-valued harc values are not nodes", () => {
  const result = classify(base({
    harcs: [harc({
      values: [{ uid: "blk", string: "plain note" }, { uid: "a", title: "A" }],
    })],
  }));
  assert.deepEqual(result.nodes.map((node) => node.uid), ["a"]);
});

test("an inverse status harc is noise", () => {
  const result = classify(base({
    harcs: [harc({
      entityUids: ["b"],
      entities: [{ uid: "b", title: "B" }],
      attribute: { uid: "attr-status", title: "Status" },
      values: [{ uid: "center", title: "Center" }],
      sourceString: "Status:: [[Center]]",
    })],
  }));
  assert.deepEqual(result.nodes, []);
});

test("first placement wins and a later edge still attaches", () => {
  const result = classify(base({
    harcs: [
      harc({ values: [{ uid: "a", title: "A" }], sourceString: "Child:: [[A]]" }),
      harc({
        uid: "harc-friend",
        attribute: { uid: "attr-friend", title: "Friend" },
        values: [{ uid: "a", title: "A" }],
        sourceUid: "src-friend",
        sourceString: "Friend:: [[A]]",
      }),
    ],
  }));
  assert.deepEqual(result.nodes, [{ uid: "a", title: "A", zone: "children", kind: "typed" }]);
  assert.equal(result.edges.length, 2);
  assert.equal(result.edges[1].attribute, "Friend");
  assert.equal(result.edges[1].zone, "friends");
});

test("siblings use the same zone cap", () => {
  const result = classify(base({
    settings: { maxPerZone: 1 },
    harcs: [harc({
      entityUids: ["b"],
      entities: [{ uid: "b", title: "B" }],
      values: [
        { uid: "center", title: "Center" },
        { uid: "c", title: "C" },
        { uid: "d", title: "D" },
      ],
    })],
  }));
  assert.equal(result.nodes.filter((node) => node.zone === "siblings").length, 1);
  assert.equal(result.overflow.siblings, 1);
  assert.equal(result.nodes.some((node) => node.uid === "b"), true);
});
