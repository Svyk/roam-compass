import assert from "node:assert/strict";
import test from "node:test";

import { draggedBlockUid } from "../src/view/features/drop.js";

function makeTarget({ bullet = null, container = null, main = null, windowHeaders = false } = {}) {
  const target = {
    closest(selector) {
      if (selector === ".window-headers") return windowHeaders ? {} : null;
      if (selector === "span.rm-bullet") return bullet;
      return null;
    },
  };
  if (bullet) {
    bullet.closest = (selector) => {
      if (selector === ".roam-block-container") return container;
      if (selector === ".rm-block-main") return main;
      return null;
    };
  }
  return target;
}

test("draggedBlockUid reads data-block-uid from closest .roam-block-container", () => {
  const target = makeTarget({
    bullet: {},
    container: { getAttribute: (name) => (name === "data-block-uid" ? "l8we40Z2I" : null) },
  });
  assert.equal(draggedBlockUid(target), "l8we40Z2I");
});

test("draggedBlockUid falls back to the last 9 chars of .rm-block__input id only when preceded by -", () => {
  const target = makeTarget({
    bullet: {},
    container: { getAttribute: () => null },
    main: {
      querySelector: (sel) => (sel === ".rm-block__input" ? { id: "block-input-sidebar-block-l8we40Z2I-l8we40Z2I" } : null),
    },
  });
  assert.equal(draggedBlockUid(target), "l8we40Z2I");

  const longCustom = makeTarget({
    bullet: {},
    container: { getAttribute: () => null },
    main: {
      querySelector: (sel) => (sel === ".rm-block__input" ? { id: "block-input-customlonguid12345" } : null),
    },
  });
  assert.equal(draggedBlockUid(longCustom), null);
});

test("draggedBlockUid ignores window-headers and non-bullet drags", () => {
  assert.equal(draggedBlockUid(makeTarget({ windowHeaders: true })), null);
  assert.equal(draggedBlockUid(makeTarget({ bullet: null })), null);
  assert.equal(draggedBlockUid(null), null);
});
