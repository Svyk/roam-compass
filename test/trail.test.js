import assert from "node:assert/strict";
import test from "node:test";

import { createTrail, formatRelativeTime } from "../src/model/trail.js";
import { createTrail as createTrailFeature } from "../src/view/features/trail.js";

test("createTrail records visits newest first, preserves duplicates, and stamps clock + seq", () => {
  let tick = 1_000;
  const trail = createTrail({ clock: () => (tick += 500) });

  assert.equal(trail.size, 0);
  assert.equal(trail.current(), null);
  assert.deepEqual(trail.entries(), []);
  assert.equal(trail.markdown(), "");

  const first = trail.visit({ uid: "p-alpha", title: "Project Alpha", kind: "page" });
  const second = trail.visit({ uid: "b-1", title: "Review budget", kind: "block" });
  const third = trail.visit({ uid: "p-alpha", title: "Project Alpha", kind: "page" });

  assert.deepEqual(first, { uid: "p-alpha", title: "Project Alpha", kind: "page", at: 1_500, seq: 1 });
  assert.deepEqual(second, { uid: "b-1", title: "Review budget", kind: "block", at: 2_000, seq: 2 });
  assert.deepEqual(third, { uid: "p-alpha", title: "Project Alpha", kind: "page", at: 2_500, seq: 3 });

  assert.equal(trail.size, 3);
  assert.deepEqual(trail.current(), third);
  assert.deepEqual(trail.entries(), [third, second, first]);

  // Returned entries are defensive copies.
  first.title = "Mutated";
  const snapshot = trail.entries();
  snapshot[0].title = "Changed";
  assert.equal(trail.current().title, "Project Alpha");
  assert.equal(trail.entries()[2].title, "Project Alpha");
});

test("createTrail ignores missing uids and falls back on defaults", () => {
  const trail = createTrail({ now: () => 42 });

  assert.equal(trail.visit(), null);
  assert.equal(trail.visit({}), null);
  assert.equal(trail.visit({ uid: "" }), null);
  assert.equal(trail.visit({ uid: "   " }), null);
  assert.equal(trail.visit({ uid: null, title: "Nope" }), null);
  assert.equal(trail.size, 0);

  const entry = trail.visit({ uid: "p-raw" });
  assert.deepEqual(entry, {
    uid: "p-raw",
    title: "p-raw",
    kind: "page",
    at: 42,
    seq: 1,
  });
});

test("createTrail drops oldest entries past cap", () => {
  let t = 0;
  const trail = createTrail({ cap: 3, clock: () => (t += 10) });

  trail.visit({ uid: "u-1", title: "One", kind: "page" });
  trail.visit({ uid: "u-2", title: "Two", kind: "page" });
  trail.visit({ uid: "u-3", title: "Three", kind: "page" });
  trail.visit({ uid: "u-4", title: "Four", kind: "page" });
  trail.visit({ uid: "u-5", title: "Five", kind: "page" });

  assert.equal(trail.size, 3);
  assert.deepEqual(
    trail.entries().map((item) => [item.uid, item.seq]),
    [
      ["u-5", 5],
      ["u-4", 4],
      ["u-3", 3],
    ],
  );
});

test("startHere keeps only the newest entry", () => {
  const trail = createTrail({ clock: () => 100 });
  assert.equal(trail.startHere(), null);
  assert.equal(trail.size, 0);

  trail.visit({ uid: "p-1", title: "First", kind: "page" });
  trail.visit({ uid: "p-2", title: "Second", kind: "page" });
  trail.visit({ uid: "b-3", title: "Third block", kind: "block" });

  const kept = trail.startHere();
  assert.equal(trail.size, 1);
  assert.deepEqual(kept, { uid: "b-3", title: "Third block", kind: "block", at: 100, seq: 3 });
  assert.deepEqual(trail.entries(), [kept]);
});

test("markdown formats pages as [[Title]] and blocks as ((uid)), newest first without trailing newline", () => {
  const trail = createTrail({ clock: () => 1 });
  assert.equal(trail.markdown(), "");

  trail.visit({ uid: "p-alpha", title: "Project Alpha", kind: "page" });
  trail.visit({ uid: "b-note-1", title: "Sync with Jane", kind: "block" });
  trail.visit({ uid: "p-task-2", title: "Task Two", kind: "page" });

  const md = trail.markdown();
  assert.equal(md, "- [[Task Two]]\n- ((b-note-1))\n- [[Project Alpha]]");
  assert.equal(md.endsWith("\n"), false);
});

test("retitle updates every matching entry in the trail", () => {
  const trail = createTrail({ clock: () => 10 });
  trail.visit({ uid: "p-alpha", title: "Alpha Old", kind: "page" });
  trail.visit({ uid: "p-beta", title: "Beta", kind: "page" });
  trail.visit({ uid: "p-alpha", title: "Alpha Old", kind: "page" });

  assert.equal(trail.retitle("", "Ignored"), 0);
  assert.equal(trail.retitle("p-alpha", ""), 0);
  assert.equal(trail.retitle("p-missing", "Nope"), 0);
  assert.equal(trail.retitle("p-alpha", "Project Alpha"), 2);

  assert.deepEqual(
    trail.entries().map((item) => item.title),
    ["Project Alpha", "Beta", "Project Alpha"],
  );
  assert.equal(trail.markdown(), "- [[Project Alpha]]\n- [[Beta]]\n- [[Project Alpha]]");
});

test("formatRelativeTime formats quiet relative labels", () => {
  const base = 1_000_000;
  assert.equal(formatRelativeTime(base, base), "now");
  assert.equal(formatRelativeTime(base + 5_000, base), "now");
  assert.equal(formatRelativeTime(base - 59_999, base), "now");
  assert.equal(formatRelativeTime(base - 60_000, base), "1 min");
  assert.equal(formatRelativeTime(base - 3 * 60_000, base), "3 min");
  assert.equal(formatRelativeTime(base - 59 * 60_000, base), "59 min");
  assert.equal(formatRelativeTime(base - 60 * 60_000, base), "1 h");
  assert.equal(formatRelativeTime(base - 23 * 3_600_000, base), "23 h");
  assert.equal(formatRelativeTime(base - 24 * 3_600_000, base), "1 d");
  assert.equal(formatRelativeTime(base - 5 * 86_400_000, base), "5 d");
});

test("trail feature records navigations, ignores same-center refreshes, falls back when entity is missing, and exposes commands", async () => {
  const entities = new Map([
    ["p-alpha", { uid: "p-alpha", kind: "page", title: "Project Alpha" }],
    ["b-1", { uid: "b-1", kind: "block", title: "First block" }],
  ]);
  const statuses = [];
  let current = "p-alpha";
  const feature = createTrailFeature({
    state: {
      get current() {
        return current;
      },
    },
    host: {
      entity(uid) {
        return entities.get(uid) ?? null;
      },
    },
    titleOf(uid) {
      return uid === "p-fallback" ? "Fallback Title" : "";
    },
    setStatus(msg) {
      statuses.push(msg);
    },
  });

  assert.equal(feature.name, "trail");
  assert.equal(feature.stageMenu, undefined);

  // First navigation records even if changed is false because trail is empty.
  feature.onNavigate({ uid: "p-alpha", changed: false });
  assert.equal(feature.entries().length, 1);

  // Subsequent refresh of same center adds nothing.
  feature.onNavigate({ uid: "p-alpha", changed: false });
  assert.equal(feature.entries().length, 1);

  // Block and missing-entity fallback.
  current = "b-1";
  feature.onNavigate({ uid: "b-1", changed: true });
  current = "p-fallback";
  feature.onNavigate({ uid: "p-fallback", changed: true });

  assert.equal(
    feature.markdown(),
    "- [[Fallback Title]]\n- ((b-1))\n- [[Project Alpha]]",
  );

  // Closing the overlay preserves the trail.
  feature.onClose();
  assert.equal(feature.entries().length, 3);

  // Rename via afterRender updates stored page title.
  feature.afterRender({ hood: { center: { uid: "p-alpha", kind: "page", title: "Alpha Renamed" } } });
  assert.equal(
    feature.markdown(),
    "- [[Fallback Title]]\n- ((b-1))\n- [[Alpha Renamed]]",
  );

  const cmds = feature.commands();
  assert.deepEqual(
    cmds.map(({ id, title, hint }) => ({ id, title, hint })),
    [
      { id: "trail-open", title: "Footprints", hint: "Alt+H" },
      { id: "trail-copy", title: "Copy trail as Markdown", hint: "" },
      { id: "trail-start", title: "Start trail here", hint: "" },
    ],
  );

  // Without clipboard API in Node, copy fails with "Could not copy".
  await cmds[1].run();
  assert.deepEqual(statuses, ["Could not copy"]);

  // With mocked clipboard, copy reports exact visit count.
  const prevDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let copiedText = "";
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        async writeText(value) {
          copiedText = value;
        },
      },
    },
  });
  try {
    await cmds[1].run();
    assert.equal(copiedText, "- [[Fallback Title]]\n- ((b-1))\n- [[Alpha Renamed]]");
    assert.equal(statuses[statuses.length - 1], "Copied 3 visits");
  } finally {
    if (prevDescriptor) Object.defineProperty(globalThis, "navigator", prevDescriptor);
    else delete globalThis.navigator;
  }

  feature.startHere();
  assert.equal(feature.entries().length, 1);
  assert.equal(feature.entries()[0].uid, "p-fallback");
});


