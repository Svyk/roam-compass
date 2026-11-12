import assert from "node:assert/strict";
import test from "node:test";

import { buildOntology, captionFor, inverseAttribute, parseRoleList } from "../src/model/ontology.js";

test("parseRoleList reads plain names and pairs, trims around pipes, treats half-pipes as plain names, and dedupes case-insensitively", () => {
  assert.deepEqual(
    parseRoleList("  Guide | Explains , Parent , guide|Other , PARENT , Trailing| , |Leading , | ,  "),
    {
      names: ["Guide", "Parent", "Trailing", "Leading"],
      pairs: [["Guide", "Explains"]],
    },
  );

  assert.deepEqual(
    parseRoleList(["Mentor | Mentee", "mentor", "Coach"]),
    {
      names: ["Mentor", "Coach"],
      pairs: [["Mentor", "Mentee"]],
    },
  );

  assert.deepEqual(parseRoleList(""), { names: [], pairs: [] });
  assert.deepEqual(parseRoleList(null), { names: [], pairs: [] });
  assert.deepEqual(parseRoleList(undefined), { names: [], pairs: [] });
});

test("buildOntology appends partner names after explicit inverse lists and builds two-way pair map", () => {
  const ontology = buildOntology({
    parent: "Guide|Explains, Parent, Author|Wrote",
    child: "Child, Has part",
    friend: "Mentor|Mentee, Friend",
    challenger: "Debates|Debated by",
    previous: "Precedes|Follows, Previous",
    next: "Next",
  });

  assert.deepEqual(ontology.lists.parent, ["Guide", "Parent", "Author"]);
  assert.deepEqual(ontology.lists.child, ["Child", "Has part", "Explains", "Wrote"]);
  assert.deepEqual(ontology.lists.friend, ["Mentor", "Friend", "Mentee"]);
  assert.deepEqual(ontology.lists.challenger, ["Debates", "Debated by"]);
  assert.deepEqual(ontology.lists.previous, ["Precedes", "Previous"]);
  assert.deepEqual(ontology.lists.next, ["Next", "Follows"]);

  assert.equal(ontology.pairs.get("guide"), "Explains");
  assert.equal(ontology.pairs.get("explains"), "Guide");
  assert.equal(ontology.pairs.get("author"), "Wrote");
  assert.equal(ontology.pairs.get("wrote"), "Author");
  assert.equal(ontology.pairs.get("mentor"), "Mentee");
  assert.equal(ontology.pairs.get("mentee"), "Mentor");
  assert.equal(ontology.pairs.get("precedes"), "Follows");
  assert.equal(ontology.pairs.get("follows"), "Precedes");
  assert.equal(ontology.pairs.get("parent"), "Child");
  assert.equal(ontology.pairs.get("child"), "Parent");
  assert.equal(ontology.pairs.get("previous"), "Next");
  assert.equal(ontology.pairs.get("next"), "Previous");
});

test("buildOntology preserves explicit order when a partner is already listed and lets first pair win", () => {
  const ontology = buildOntology({
    parent: "Guide|Explains, Teacher|Explains, Parent|Subitem",
    child: "Explains|Different, Child",
    previous: "Up_step",
    next: "Next",
  });

  assert.deepEqual(ontology.lists.parent, ["Guide", "Teacher", "Parent"]);
  assert.deepEqual(ontology.lists.child, ["Explains", "Child", "Subitem"]);
  assert.equal(ontology.pairs.get("guide"), "Explains");
  assert.equal(ontology.pairs.get("explains"), "Guide");
  assert.equal(ontology.pairs.has("teacher"), false);
  assert.equal(ontology.pairs.get("parent"), "Subitem");
  assert.equal(ontology.pairs.get("subitem"), "Parent");
  assert.equal(ontology.pairs.has("child"), false);
  assert.equal(ontology.pairs.has("previous"), false);
  assert.equal(ontology.pairs.has("next"), false);
});

test("captionFor uses raw attribute on outgoing edges and partner only on incoming paired edges", () => {
  const { pairs } = buildOntology({
    parent: "Guide|Explains, Parent, Up",
    child: "Child",
  });

  assert.equal(captionFor("Guide", "out", pairs), "Guide");
  assert.equal(captionFor("Guide", "in", pairs), "Explains");
  assert.equal(captionFor("guide", "in", pairs), "Explains");
  assert.equal(captionFor("Explains", "in", pairs), "Guide");
  assert.equal(captionFor("Up", "in", pairs), "Up");
  assert.equal(captionFor("Up", "out", pairs), "Up");
  assert.equal(captionFor("Guide", "in", null), "Guide");
});

test("inverseAttribute prefers writable partner and otherwise picks first safe name in inverse role list", () => {
  const ontology = buildOntology({
    parent: "BT_attrProject, Aliases, Guide|Explains, Up, Parent",
    child: "BT_attrSubtask, Child, Has part",
    friend: "Friend, Related",
    challenger: "BT_attrRisk",
    previous: "Previous",
    next: "Next",
  });

  assert.equal(inverseAttribute("Guide", "parent", ontology), "Explains");
  assert.equal(inverseAttribute("explains", "child", ontology), "Guide");
  assert.equal(inverseAttribute("Up", "parent", ontology), "Child");
  assert.equal(inverseAttribute("Has part", "child", ontology), "Guide");
  assert.equal(inverseAttribute("Related", "friend", ontology), "Friend");
  assert.equal(inverseAttribute("Anything", "challenger", ontology), null);
  assert.equal(inverseAttribute("Up", "unknown", ontology), null);
  assert.equal(inverseAttribute("Up", "parent", null), null);

  const unsafePartner = buildOntology({
    parent: "TaskOf|BT_attrProject, Parent",
    child: "Child",
  });
  assert.equal(inverseAttribute("TaskOf", "parent", unsafePartner), null);
});
