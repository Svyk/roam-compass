import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DEFAULTS, readCompassSettings } from "../src/settings.js";
import { uidFromHash } from "../src/host.js";
import { isPaletteChord, registerCommands } from "../src/view/overlay.js";

test("follow defaults off and related drawings default on", () => {
  assert.equal(DEFAULTS["compass-follow"], false);
  assert.equal(DEFAULTS["compass-related-drawings"], true);
  const settings = readCompassSettings({ settings: { get: () => undefined } });
  assert.equal(settings.follow, false);
  assert.equal(settings.relatedDrawings, true);
});

test("uidFromHash reads page and block uids only", () => {
  assert.equal(uidFromHash("#/page/abc123"), "abc123");
  assert.equal(uidFromHash("/page/abc123"), "abc123");
  assert.equal(uidFromHash("#/block/def456"), "def456");
  assert.equal(uidFromHash("/block/def456"), "def456");
  assert.equal(uidFromHash("#/page"), null);
  assert.equal(uidFromHash(""), null);
  assert.equal(uidFromHash("#/daily-notes"), null);
});

test("palette stays the three Compass commands", () => {
  const source = readFileSync(new URL("../src/view/overlay.js", import.meta.url), "utf8");
  const start = source.indexOf("async function registerCommands");
  const end = source.indexOf("function el(", start);
  const labels = [...source.slice(start, end).matchAll(/label:\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(labels, [
    "Compass: Open",
    "Compass: Focus page",
    "Compass: Focus block",
    "Compass: Focus block",
  ]);
  assert.equal(source.includes("Show linked window"), true);
  assert.equal(source.includes('label: "Show linked window"'), false);
});

test("a keyup while the palette is closed does not schedule a timer", async () => {
  const listeners = [];
  const doc = {
    addEventListener(type, fn, capture) { listeners.push({ type, fn, capture }); },
    removeEventListener() {},
    querySelector() { return null; },
  };
  const previousDocument = globalThis.document;
  const previousTimeout = globalThis.setTimeout;
  globalThis.document = doc;
  const scheduled = [];
  globalThis.setTimeout = (fn, ms) => {
    scheduled.push(ms);
    return 0;
  };
  try {
    const added = [];
    await registerCommands({
      extensionAPI: {
        ui: {
          commandPalette: {
            addCommand(command) { added.push(command.label); },
            removeCommand() {},
          },
        },
      },
      lifecycle: {
        disposed: false,
        event(target, type, fn, capture) { target.addEventListener(type, fn, capture); },
        add() {},
      },
      host: {},
      view: { toggle() {}, focusPage() {}, focusBlock() {} },
    });
    assert.deepEqual(added, []);
    const keyup = listeners.find((entry) => entry.type === "keyup")?.fn;
    const keydown = listeners.find((entry) => entry.type === "keydown")?.fn;
    assert.equal(typeof keyup, "function");
    keyup({ key: "a" });
    assert.deepEqual(scheduled, []);
    keydown({ key: "p", metaKey: true });
    assert.deepEqual(added, ["Compass: Open", "Compass: Focus page", "Compass: Focus block"]);
    keyup({ key: "p" });
    assert.deepEqual(scheduled, [0]);
  } finally {
    globalThis.setTimeout = previousTimeout;
    globalThis.document = previousDocument;
  }
});

test("palette commands attach on command-p and not on other chords", () => {
  assert.equal(isPaletteChord({ key: "p", metaKey: true }), true);
  assert.equal(isPaletteChord({ key: "P", ctrlKey: true }), true);
  assert.equal(isPaletteChord({ key: "p", metaKey: true, shiftKey: true }), false);
  assert.equal(isPaletteChord({ key: "p", metaKey: true, altKey: true }), false);
  assert.equal(isPaletteChord({ key: "k", metaKey: true }), false);
  assert.equal(isPaletteChord(null), false);
});
