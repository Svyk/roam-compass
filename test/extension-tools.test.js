import assert from "node:assert/strict";
import test from "node:test";

import {
  createCompassExtensionTools,
  EXTENSION_TOOLS_KEY,
  installCompassExtensionTools,
} from "../src/extension-tools.js";

test("Compass extension tool resolves uid or page_title and returns neighborhood", () => {
  const api = {
    neighborhood: (uid) => (
      uid === "pg-1"
        ? { center: { uid: "pg-1", title: "Alpha" }, north: [], south: [] }
        : { center: { uid, title: uid }, nodes: [], missing: true }
    ),
  };
  const roam = {
    data: {
      q: (_query, title) => (title === "Alpha" ? "pg-1" : null),
    },
  };
  const reg = createCompassExtensionTools({ api, roam });
  const tool = reg.tools[0];
  assert.equal(tool.name, "compass_get_neighborhood");
  assert.equal(tool.readOnly, true);

  assert.equal(tool.execute({ uid: "pg-1" }).ok, true);
  assert.equal(tool.execute({ uid: "does-not-exist" }).ok, false);
  assert.equal(tool.execute({ page_title: "Alpha" }).uid, "pg-1");
  assert.equal(tool.execute({ page_title: "Missing" }).ok, false);
  assert.equal(tool.execute({}).ok, false);

  const win = {};
  const remove = installCompassExtensionTools(win, reg);
  assert.equal(win.RoamExtensionTools[EXTENSION_TOOLS_KEY], reg);
  remove();
  assert.equal(win.RoamExtensionTools[EXTENSION_TOOLS_KEY], undefined);
});
