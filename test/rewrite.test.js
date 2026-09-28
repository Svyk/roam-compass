import assert from "node:assert/strict";
import test from "node:test";

import { planMove } from "../src/model/rewrite.js";

const jane = { uid: "jane", title: "Jane" };

function source(string, children = []) {
  return { uid: "src", string, order: 3, parentUid: "page", children };
}

function move(string, options = {}) {
  return planMove({
    source: source(string, options.children),
    fromAttribute: options.from ?? "Owner",
    toAttribute: options.to ?? "Parent",
    value: options.value ?? jane,
    newUid: "new-uid",
  });
}

test("a sole value renames the attribute in place", () => {
  assert.deepEqual(move("Owner:: [[Jane]]").ops, [{ op: "update", uid: "src", string: "Parent:: [[Jane]]" }]);
  assert.deepEqual(move("[[Owner]]:: #[[Jane]] #.x").ops, [{ op: "update", uid: "src", string: "Parent:: #[[Jane]] #.x" }]);
  assert.deepEqual(
    move("Owner:: ((abc123def))", { value: { uid: "abc123def" } }).ops,
    [{ op: "update", uid: "src", string: "Parent:: ((abc123def))" }],
  );
});

test("one of several tail refs is split into a new block after the source", () => {
  assert.deepEqual(move("Owner:: [[Jane]] [[Bob]]").ops, [
    { op: "update", uid: "src", string: "Owner:: [[Bob]]" },
    { op: "create", parentUid: "page", order: 4, uid: "new-uid", string: "Parent:: [[Jane]]" },
  ]);
});

test("a bare attribute with one value child is renamed, keeping labels", () => {
  const children = [
    { uid: "v1", string: "[[Jane]]", order: 0 },
    { uid: "l1", string: "Role:: Lead", order: 1 },
  ];
  assert.deepEqual(move("Owner::", { children }).ops, [{ op: "update", uid: "src", string: "Parent::" }]);
});

test("one child of several moves under a new attribute block", () => {
  const children = [
    { uid: "v1", string: "[[Jane]]", order: 0 },
    { uid: "v2", string: "[[Bob]]", order: 1 },
  ];
  assert.deepEqual(move("Owner::", { children }).ops, [
    { op: "create", parentUid: "page", order: 4, uid: "new-uid", string: "Parent::" },
    { op: "move", uid: "v1", parentUid: "new-uid", order: 0 },
  ]);
  const block = move("Notes::", {
    from: "Notes",
    value: { uid: "v2" },
    children: [{ uid: "v1", string: "first", order: 0 }, { uid: "v2", string: "second", order: 1 }],
  });
  assert.deepEqual(block.ops[1], { op: "move", uid: "v2", parentUid: "new-uid", order: 0 });
});

test("a child holding several refs loses only the moved one", () => {
  const children = [
    { uid: "v1", string: "[[Jane]] [[Bob]]", order: 0 },
    { uid: "v2", string: "[[Ann]]", order: 1 },
  ];
  assert.deepEqual(move("Owner::", { children }).ops, [
    { op: "update", uid: "v1", string: "[[Bob]]" },
    { op: "create", parentUid: "page", order: 4, uid: "new-uid", string: "Parent:: [[Jane]]" },
  ]);
});

test("refusals: read-only, changed, text, same, missing", () => {
  assert.equal(move("BT_attrProject:: [[Jane]]", { from: "BT_attrProject" }).reason, "read-only");
  assert.equal(move("Owner:: [[Jane]]", { to: "BT_attrDue" }).reason, "read-only");
  assert.equal(move("Lead:: [[Jane]]").reason, "changed");
  assert.equal(move("Owner:: Jane and co").reason, "text-value");
  assert.equal(move("Owner:: [[Jane]]", { to: "owner" }).reason, "same");
  assert.equal(move("Owner:: [[Bob]]").reason, "missing-value");
  assert.equal(move("Owner:: [[Jane]]", { to: "Bad:: name" }).reason, "no-attribute");
  assert.equal(move("Owner:: [[Jane]] [[Bob]]", { to: ":harc/e" }).reason, "forbidden");
  assert.deepEqual(move("Owner:: [[Jane]]").reason, null);
});
