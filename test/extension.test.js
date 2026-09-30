import assert from "node:assert/strict";
import test from "node:test";

import extension from "../src/extension.js";

const SETTING_IDS = [
  "compass-north",
  "compass-south",
  "compass-west",
  "compass-east",
  "compass-previous",
  "compass-next",
  "compass-hidden",
  "compass-links",
  "compass-siblings",
  "compass-badges",
  "compass-sidecar",
  "compass-outline",
  "compass-drawings",
  "compass-follow",
  "compass-related-drawings",
  "compass-max-zone",
  "compass-pins",
];

const SWITCH_IDS = [
  "compass-links",
  "compass-siblings",
  "compass-badges",
  "compass-sidecar",
  "compass-outline",
  "compass-drawings",
  "compass-follow",
  "compass-related-drawings",
];

function versionHost() {
  return globalThis.window ?? globalThis;
}

function fakeExtensionApi() {
  const values = new Map();
  const calls = [];
  const api = {
    calls,
    commands: [],
    command: null,
    panel: null,
    settings: {
      canSet: true,
      get: (key) => values.get(key) ?? null,
      set: async (key, value) => {
        values.set(key, value);
        calls.push(["setting:set", key, value]);
        return null;
      },
      panel: {
        create: async (config) => {
          calls.push(["panel:create", config.tabTitle]);
          api.panel = config;
          return null;
        },
      },
    },
    ui: {
      commandPalette: {
        addCommand: async (config) => {
          calls.push(["command:add", config.label]);
          api.commands.push(config);
          api.command = config;
          return null;
        },
        removeCommand: async ({ label }) => {
          calls.push(["command:remove", label]);
          return null;
        },
      },
    },
  };
  return api;
}

function installRoam(calls) {
  const menu = {
    command: null,
    addCommand: async (config) => {
      calls.push(["menu:add", config.label]);
      menu.command = config;
      return null;
    },
    removeCommand: async ({ label }) => {
      calls.push(["menu:remove", label]);
      return null;
    },
  };
  globalThis.roamAlphaAPI = {
    graph: { name: "compass-test" },
    ui: {
      blockContextMenu: menu,
      getFocusedBlock: () => null,
      mainWindow: {
        getOpenPageOrBlockUid: async () => null,
        openPage: async () => null,
        openBlock: async () => null,
      },
      rightSidebar: {
        addWindow: async () => null,
        removeWindow: async () => null,
        getWindows: () => [],
      },
    },
    data: {
      pull: () => null,
      q: () => [],
      addPullWatch() {},
      removePullWatch() {},
      block: {
        create: async () => {},
        update: async () => {},
        delete: async () => {},
      },
      page: { create: async () => {} },
    },
  };
  return menu;
}

test("extension exports the Roam lifecycle contract and survives repeated unload", async () => {
  const api = fakeExtensionApi();
  const menu = installRoam(api.calls);
  const lines = [];
  const events = [];
  const originalInfo = console.info;
  const priorDispatch = globalThis.dispatchEvent;
  const priorCustom = globalThis.CustomEvent;
  console.info = (...parts) => {
    lines.push(parts.map(String).join(" "));
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type) { this.type = type; }
  };
  globalThis.dispatchEvent = (event) => {
    events.push(event.type);
    return true;
  };
  try {
    const cleanup = await extension.onload({ extensionAPI: api, extension: { version: "test" } });
    const compass = versionHost().RoamCompass;
    assert.equal(typeof compass?.isAvailable, "function");
    assert.equal(compass.isAvailable(), true);
    assert.equal(typeof compass.focus, "function");
    assert.equal(Object.isFrozen(compass), true);
    compass.focus("block-x");
    assert.ok(events.includes("roam-compass:ready"));
    assert.equal(typeof cleanup, "function");
    assert.equal(versionHost().__ROAM_COMPASS_VERSION, "test");
    assert.equal(api.settings.get("compass-north"), "Parent, Up, Part of, Is a, Type, Category, Project, BT_attrProject");
    assert.equal(api.settings.get("compass-south"), "Child, Has part, Contains");
    assert.equal(api.settings.get("compass-west"), "Friend, Related, See also");
    assert.equal(api.settings.get("compass-east"), "Challenger, Opposes, Contradicts");
    assert.equal(api.settings.get("compass-previous"), "Previous");
    assert.equal(api.settings.get("compass-next"), "Next");
    assert.equal(api.settings.get("compass-hidden"), "Hidden");
    assert.equal(api.settings.get("compass-links"), true);
    assert.equal(api.settings.get("compass-siblings"), true);
    assert.equal(api.settings.get("compass-badges"), true);
    assert.equal(api.settings.get("compass-sidecar"), true);
    assert.equal(api.settings.get("compass-outline"), false);
    assert.equal(api.settings.get("compass-follow"), false);
    assert.equal(api.settings.get("compass-related-drawings"), true);
    assert.equal(api.settings.get("compass-max-zone"), "12");
    assert.deepEqual(api.settings.get("compass-pins"), []);
    assert.deepEqual(api.panel.settings.map((row) => row.id), SETTING_IDS);
    for (const row of api.panel.settings) {
      assert.equal(row.action.type, SWITCH_IDS.includes(row.id) ? "switch" : "input");
    }
    await api.panel.settings.find((row) => row.id === "compass-outline").action.onChange({
      target: { checked: true },
    });
    await api.panel.settings.find((row) => row.id === "compass-north").action.onChange({
      target: { value: "Mother" },
    });
    assert.equal(api.settings.get("compass-outline"), true);
    assert.equal(api.settings.get("compass-north"), "Mother");
    for (const command of api.commands) command.callback();
    menu.command.callback({ "block-uid": "block-1" });
    await cleanup();
    assert.equal(versionHost().__ROAM_COMPASS_VERSION, undefined);
    assert.equal(versionHost().RoamCompass, undefined);
    assert.ok(events.includes("roam-compass:unload"));
    await extension.onunload();
    await extension.onunload();
  } finally {
    console.info = originalInfo;
    if (priorDispatch === undefined) delete globalThis.dispatchEvent;
    else globalThis.dispatchEvent = priorDispatch;
    if (priorCustom === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = priorCustom;
    delete globalThis.roamAlphaAPI;
    await extension.onunload();
  }

  const names = api.calls.map(([name]) => name);
  assert.ok(names.indexOf("setting:set") < names.indexOf("panel:create"));
  assert.ok(names.indexOf("panel:create") < names.indexOf("command:add"));
  assert.deepEqual(
    api.calls.filter(([name]) => name === "command:add").map(([, label]) => label),
    ["Compass: Open", "Compass: Focus page", "Compass: Focus block"],
  );
  assert.equal(api.calls.filter(([name]) => name === "command:remove").length, 3);
  assert.deepEqual(
    api.calls.filter(([name]) => name === "menu:add").map(([, label]) => label),
    ["Compass: Focus block"],
  );
  assert.equal(api.calls.filter(([name]) => name === "menu:remove").length, 1);
  assert.equal(api.panel.tabTitle, "Compass");
  assert.ok(lines.includes("[compass] Loaded vtest"));
  assert.ok(lines.includes("[compass] Unloaded"));
});

test("a second load disposes the previous runtime before registering again", async () => {
  const firstApi = fakeExtensionApi();
  const secondApi = fakeExtensionApi();
  const menuCalls = [];
  installRoam(menuCalls);

  try {
    await extension.onload({ extensionAPI: firstApi, extension: { version: "one" } });
    const cleanup = await extension.onload({ extensionAPI: secondApi, extension: { version: "two" } });

    assert.equal(versionHost().__ROAM_COMPASS_VERSION, "two");
    assert.equal(firstApi.calls.filter(([name]) => name === "command:remove").length, 3);
    assert.equal(secondApi.calls.filter(([name]) => name === "command:add").length, 3);
    assert.equal(menuCalls.filter(([name]) => name === "menu:add").length, 2);
    assert.equal(menuCalls.filter(([name]) => name === "menu:remove").length, 1);
    await cleanup();
    assert.equal(versionHost().__ROAM_COMPASS_VERSION, undefined);
  } finally {
    delete globalThis.roamAlphaAPI;
    await extension.onunload();
  }
});
