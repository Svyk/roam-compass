import assert from "node:assert/strict";
import test from "node:test";

import {
  factOf,
  factsFor,
  fieldValues,
  groupOf,
  matchCondition,
  matchConditions,
  typeOf,
} from "../src/model/facts.js";

test("typeOf reads page titles, text values, and block texts case-insensitively", () => {
  const attrs = {
    type: {
      name: "Type",
      values: [
        { uid: "p-proj", title: "  Project  " },
        { uid: "p-extra", title: "Secondary" },
      ],
    },
    category: {
      name: "Category",
      values: [{ text: "  Reference " }],
    },
    source: {
      name: "Source",
      values: [{ uid: "b-1", text: "  Block note  " }],
    },
  };

  assert.equal(typeOf(attrs, "Type"), "Project");
  assert.equal(typeOf(attrs, "TYPE"), "Project");
  assert.equal(typeOf(attrs, "  category "), "Reference");
  assert.equal(typeOf(attrs, "source"), "Block note");
  assert.equal(typeOf(attrs, "Missing"), "");
  assert.equal(typeOf(attrs, ""), "");
  assert.equal(typeOf({}, "Type"), "");
  assert.equal(typeOf(null, "Type"), "");
});

test("groupOf resolves group, board, card, region, drawing, empty page, page, and block in order", () => {
  assert.equal(groupOf({ kind: "group", style: "board" }, { empty: true }), "group");
  assert.equal(groupOf({ kind: "page", style: "board" }, { empty: true }), "board");
  assert.equal(groupOf({ kind: "block", style: "card" }), "card");
  assert.equal(
    groupOf({ kind: "block", string: "{{[[plexus-region]] d=draw1}}" }),
    "region",
  );
  assert.equal(
    groupOf({ kind: "block", string: "{{[[excalidraw]]}} data" }),
    "drawing",
  );
  assert.equal(groupOf({ kind: "page" }, { empty: true }), "empty");
  assert.equal(groupOf({ kind: "page" }, { empty: false }), "page");
  assert.equal(groupOf({ kind: "block" }, { empty: true }), "block");
  assert.equal(groupOf({}), "");
});

test("factOf and factsFor normalize node fields, attributes, custom typeAttribute, and emptyUids", () => {
  const pageNode = {
    uid: "p-1",
    title: "Roadmap",
    alias: "Q4 Plan",
    kind: "page",
    role: "child",
    zone: "south",
    style: "typed",
    label: "Child",
  };
  const emptyNode = {
    uid: "p-empty",
    title: "Stub",
    kind: "page",
    role: "friend",
    zone: "west",
    style: "link",
  };
  const blockNode = {
    uid: "b-1",
    kind: "block",
    title: "A thought",
  };

  const attributesByUid = {
    "p-1": {
      kind: {
        name: "Kind",
        values: [{ uid: "k-1", title: " Milestone " }, { text: "   " }],
      },
      owner: {
        name: "Owner",
        values: [{ uid: "u-ada", title: "Ada" }, { text: " Core Team " }],
      },
      blank: {
        name: "Blank",
        values: [{ text: "   " }],
      },
    },
  };

  const single = factOf({}, {});
  assert.deepEqual(single, {
    uid: "",
    title: "",
    alias: "",
    kind: "",
    group: "",
    type: "",
    role: "",
    zone: "",
    style: "",
    label: "",
    attributes: {},
  });

  const map = factsFor(
    [pageNode, emptyNode, blockNode, { title: "No uid" }, null],
    attributesByUid,
    { typeAttribute: "Kind", emptyUids: new Set(["p-empty", "b-1"]) },
  );

  assert.equal(map.size, 3);
  assert.deepEqual(map.get("p-1"), {
    uid: "p-1",
    title: "Roadmap",
    alias: "Q4 Plan",
    kind: "page",
    group: "page",
    type: "Milestone",
    role: "child",
    zone: "south",
    style: "typed",
    label: "Child",
    attributes: {
      kind: ["Milestone"],
      owner: ["Ada", "Core Team"],
    },
  });
  assert.equal(map.get("p-empty").group, "empty");
  assert.equal(map.get("p-empty").alias, "");
  assert.equal(map.get("b-1").group, "block");
});

test("fieldValues extracts title+alias, scalar fields, lowercased attr:<name>, and [] for empty or unknown", () => {
  const fact = factOf(
    {
      uid: "p-1",
      title: "Alpha",
      alias: "First",
      kind: "page",
      role: "parent",
      zone: "north",
      style: "typed",
      label: "",
    },
    {
      type: { name: "Type", values: [{ text: "Area" }] },
      status: { name: "Status", values: [{ text: "Active" }, { text: "Pinned" }] },
    },
  );

  assert.deepEqual(fieldValues(fact, "title"), ["Alpha", "First"]);
  assert.deepEqual(fieldValues({ ...fact, alias: "" }, "title"), ["Alpha"]);
  assert.deepEqual(fieldValues(fact, "kind"), ["page"]);
  assert.deepEqual(fieldValues(fact, "group"), ["page"]);
  assert.deepEqual(fieldValues(fact, "type"), ["Area"]);
  assert.deepEqual(fieldValues(fact, "role"), ["parent"]);
  assert.deepEqual(fieldValues(fact, "zone"), ["north"]);
  assert.deepEqual(fieldValues(fact, "style"), ["typed"]);
  assert.deepEqual(fieldValues(fact, "label"), []);
  assert.deepEqual(fieldValues(fact, "attr:Status"), ["Active", "Pinned"]);
  assert.deepEqual(fieldValues(fact, "attr:missing"), []);
  assert.deepEqual(fieldValues(fact, "unknown"), []);
});

test("matchCondition and matchConditions evaluate all operators, edge cases, and boolean combinators", () => {
  const fact = factOf(
    {
      uid: "p-1",
      title: "Compass Design",
      alias: "Nav Spec",
      kind: "page",
      role: "child",
      zone: "south",
      style: "typed",
      label: "Child",
    },
    {
      type: { name: "Type", values: [{ text: "Project" }] },
      tags: { name: "Tags", values: [{ text: "UI" }, { text: "Graph" }] },
    },
  );

  assert.equal(matchCondition({ field: "type", op: "is", value: "  Project " }, fact), true);
  assert.equal(matchCondition({ field: "type", op: "is", value: "project" }, fact), false);
  assert.equal(matchCondition({ field: "type", op: "is", value: "" }, fact), false);
  assert.equal(matchCondition({ field: "type", op: "is-not", value: "project" }, fact), true);
  assert.equal(matchCondition({ field: "type", op: "is-not", value: "Project" }, fact), false);

  assert.equal(matchCondition({ field: "title", op: "contains", value: "design" }, fact), true);
  assert.equal(matchCondition({ field: "title", op: "contains", value: "NAV" }, fact), true);
  assert.equal(matchCondition({ field: "title", op: "contains", value: "" }, fact), false);
  assert.equal(matchCondition({ field: "title", op: "not-contains", value: "nav" }, fact), false);
  assert.equal(matchCondition({ field: "title", op: "not-contains", value: "other" }, fact), true);

  assert.equal(matchCondition({ field: "attr:tags", op: "exists" }, fact), true);
  assert.equal(matchCondition({ field: "attr:tags", op: "missing" }, fact), false);
  assert.equal(matchCondition({ field: "attr:owner", op: "exists" }, fact), false);
  assert.equal(matchCondition({ field: "attr:owner", op: "missing" }, fact), true);

  assert.equal(matchCondition({ field: "type", op: "regex", value: ".*" }, fact), false);

  assert.equal(matchConditions({}, fact), false);
  assert.equal(matchConditions({ all: [], any: [] }, fact), false);
  assert.equal(
    matchConditions(
      {
        all: [
          { field: "kind", op: "is", value: "page" },
          { field: "type", op: "is", value: "Project" },
        ],
      },
      fact,
    ),
    true,
  );
  assert.equal(
    matchConditions(
      {
        any: [
          { field: "zone", op: "is", value: "north" },
          { field: "attr:tags", op: "is", value: "Graph" },
        ],
      },
      fact,
    ),
    true,
  );
  assert.equal(
    matchConditions(
      {
        all: [{ field: "kind", op: "is", value: "page" }],
        any: [
          { field: "type", op: "is", value: "Area" },
          { field: "type", op: "is", value: "Resource" },
        ],
      },
      fact,
    ),
    false,
  );
  assert.equal(
    matchConditions(
      {
        all: [{ field: "kind", op: "is", value: "page" }],
        any: [
          { field: "type", op: "is", value: "Area" },
          { field: "type", op: "is", value: "Project" },
        ],
      },
      fact,
    ),
    true,
  );
});
