import assert from "node:assert/strict";
import test from "node:test";

import { VIEWS, isValidView, normalizeView, viewEntries } from "../src/model/views.js";
import { SETTING_IDS } from "../src/settings.js";
import { createViews } from "../src/view/features/views.js";

test("isValidView and normalizeView accept only compass, mindmap, and facets", () => {
  assert.deepEqual(VIEWS, ["compass", "mindmap", "facets"]);
  for (const name of VIEWS) {
    assert.equal(isValidView(name), true);
    assert.equal(normalizeView(name), name);
  }
  for (const bad of ["", "grid", "Compass", null, undefined, 42, {}]) {
    assert.equal(isValidView(bad), false);
    assert.equal(normalizeView(bad), "compass");
  }
});

test("viewEntries marks only the active view and runs the callback with its view id", () => {
  const chosen = [];
  const entries = viewEntries("mindmap", (view) => chosen.push(view));
  assert.deepEqual(
    entries.map(({ view, id, title, menuTitle, active }) => ({ view, id, title, menuTitle, active })),
    [
      { view: "compass", id: "view-compass", title: "View: Compass", menuTitle: "View: Compass", active: false },
      { view: "mindmap", id: "view-mindmap", title: "View: Mind Map", menuTitle: "✓ View: Mind Map", active: true },
      { view: "facets", id: "view-facets", title: "View: Facets", menuTitle: "View: Facets", active: false },
    ],
  );
  entries[2].run();
  assert.deepEqual(chosen, ["facets"]);

  const fallback = viewEntries("bogus");
  assert.equal(fallback[0].menuTitle, "✓ View: Compass");
  assert.equal(fallback[0].run, undefined);
});

test("createViews tracks view and preset, persists settings, renders, fits, and exposes commands and stageMenu", async () => {
  const calls = [];
  let stored = { view: "compass", facetsPreset: "roles" };
  let views = null;
  const ctx = {
    state: {
      get settings() {
        return stored;
      },
    },
    async saveSetting(id, value) {
      calls.push(["saveSetting", id, value]);
      if (id === SETTING_IDS.view) stored = { ...stored, view: value };
      if (id === SETTING_IDS.facetsPreset) stored = { ...stored, facetsPreset: value };
      views.onSettings(stored);
    },
    rebuild() {
      calls.push(["rebuild"]);
    },
    render() {
      calls.push(["render"]);
    },
    fit(glide) {
      calls.push(["fit", glide]);
    },
  };
  views = createViews(ctx);

  assert.equal(views.name, "views");
  assert.deepEqual(views.current(), { view: "compass", preset: "roles" });
  assert.deepEqual(
    views.stageMenu().map((item) => item.title),
    ["✓ View: Compass", "View: Mind Map", "View: Facets"],
  );

  await views.set("unknown-view", "ignored");
  assert.deepEqual(views.current(), { view: "compass", preset: "roles" });
  assert.deepEqual(calls, []);

  const pending = views.set("facets", "projects");
  assert.deepEqual(views.current(), { view: "facets", preset: "projects" });
  await pending;
  assert.deepEqual(views.current(), { view: "facets", preset: "projects" });
  assert.deepEqual(calls, [
    ["saveSetting", "compass-view", "facets"],
    ["saveSetting", "compass-facets-preset", "projects"],
    ["rebuild"],
    ["render"],
    ["fit", true],
  ]);
  assert.deepEqual(
    views.stageMenu().map((item) => item.title),
    ["View: Compass", "View: Mind Map", "✓ View: Facets"],
  );

  calls.length = 0;
  const cmds = views.commands();
  assert.deepEqual(
    cmds.map(({ id, title }) => ({ id, title })),
    [
      { id: "view-compass", title: "View: Compass" },
      { id: "view-mindmap", title: "View: Mind Map" },
      { id: "view-facets", title: "View: Facets" },
    ],
  );
  await cmds[1].run();
  assert.deepEqual(views.current(), { view: "mindmap", preset: "projects" });
  assert.deepEqual(calls, [
    ["saveSetting", "compass-view", "mindmap"],
    ["rebuild"],
    ["render"],
    ["fit", true],
  ]);
});

test("createViews logs and swallows persistence errors instead of throwing", async () => {
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    const views = createViews({
      async saveSetting() {
        throw new Error("disk full");
      },
      render() {},
      fit() {},
    });
    await views.set("mindmap");
    assert.deepEqual(views.current(), { view: "mindmap", preset: "roles" });
    assert.equal(errors.length, 1);
    assert.equal(errors[0][0], "[compass] views");
  } finally {
    console.error = originalError;
  }
});
