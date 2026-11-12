import assert from "node:assert/strict";
import test from "node:test";

import { copyBlob, copyText, saveBlob } from "../src/view/clipboard.js";

test("clipboard and file helpers degrade to false in Node without DOM or clipboard APIs", async () => {
  assert.equal(await copyText("hello"), false);
  assert.equal(await copyBlob(new Blob(["abc"], { type: "text/plain" })), false);
  assert.equal(saveBlob(new Blob(["abc"], { type: "text/plain" }), "note.txt"), false);
});

test("copyText prefers navigator.clipboard.writeText and falls back to a hidden textarea on failure", async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const previousDocument = globalThis.document;
  try {
    const written = [];
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          async writeText(text) {
            written.push(text);
          },
        },
      },
    });
    assert.equal(await copyText("direct"), true);
    assert.deepEqual(written, ["direct"]);

    let removed = false;
    let selected = false;
    let appendedValue = null;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          async writeText() {
            throw new Error("denied");
          },
        },
      },
    });
    globalThis.document = {
      body: {
        append(node) {
          appendedValue = node.value;
        },
      },
      createElement(tag) {
        assert.equal(tag, "textarea");
        return {
          value: "",
          style: {},
          setAttribute() {},
          focus() {},
          select() {
            selected = true;
          },
          remove() {
            removed = true;
          },
        };
      },
      execCommand(cmd) {
        assert.equal(cmd, "copy");
        return true;
      },
    };
    assert.equal(await copyText("fallback text"), true);
    assert.equal(appendedValue, "fallback text");
    assert.equal(selected, true);
    assert.equal(removed, true);
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else delete globalThis.navigator;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("copyBlob uses ClipboardItem and returns false when unsupported or rejected", async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const previousItem = globalThis.ClipboardItem;
  try {
    const items = [];
    globalThis.ClipboardItem = function ClipboardItem(map) {
      this.map = map;
    };
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          async write(list) {
            items.push(...list);
          },
        },
      },
    });
    const blob = new Blob(["<svg/>"], { type: "image/svg+xml" });
    assert.equal(await copyBlob(blob), true);
    assert.equal(items.length, 1);
    assert.equal(items[0].map["image/svg+xml"], blob);

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          async write() {
            throw new Error("blocked");
          },
        },
      },
    });
    assert.equal(await copyBlob(blob), false);
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else delete globalThis.navigator;
    if (previousItem === undefined) delete globalThis.ClipboardItem;
    else globalThis.ClipboardItem = previousItem;
  }
});

test("saveBlob clicks a temporary download link, removes it, and revokes the object URL", () => {
  const previousDocument = globalThis.document;
  const previousURL = globalThis.URL;
  try {
    const events = [];
    globalThis.URL = {
      createObjectURL(blob) {
        events.push(["create", blob.type]);
        return "blob:compass-test";
      },
      revokeObjectURL(url) {
        events.push(["revoke", url]);
      },
    };
    globalThis.document = {
      body: {
        append(node) {
          events.push(["append", node.href, node.download]);
        },
      },
      createElement(tag) {
        assert.equal(tag, "a");
        return {
          href: "",
          download: "",
          style: {},
          click() {
            events.push(["click"]);
          },
          remove() {
            events.push(["remove"]);
          },
        };
      },
    };
    const ok = saveBlob(new Blob(["data"], { type: "image/png" }), "compass.png");
    assert.equal(ok, true);
    assert.deepEqual(events, [
      ["create", "image/png"],
      ["append", "blob:compass-test", "compass.png"],
      ["click"],
      ["remove"],
      ["revoke", "blob:compass-test"],
    ]);

    globalThis.URL = {};
    assert.equal(saveBlob(new Blob(["data"]), "compass.png"), false);
  } finally {
    globalThis.URL = previousURL;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("copyText falls back to textarea and copyBlob returns false when clipboard permission hangs past 1.5 s", async (t) => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const previousDocument = globalThis.document;
  const previousItem = globalThis.ClipboardItem;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let fallbackCopied = null;
    globalThis.ClipboardItem = function ClipboardItem(map) {
      this.map = map;
    };
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText() {
            return new Promise(() => {});
          },
          write() {
            return new Promise(() => {});
          },
        },
      },
    });
    globalThis.document = {
      body: {
        append(node) {
          fallbackCopied = node.value;
        },
      },
      createElement() {
        return {
          value: "",
          style: {},
          setAttribute() {},
          focus() {},
          select() {},
          remove() {},
        };
      },
      execCommand(cmd) {
        return cmd === "copy";
      },
    };

    const textPromise = copyText("hung text");
    t.mock.timers.tick(1500);
    assert.equal(await textPromise, true);
    assert.equal(fallbackCopied, "hung text");

    const blobPromise = copyBlob(new Blob(["png"], { type: "image/png" }));
    t.mock.timers.tick(1500);
    assert.equal(await blobPromise, false);
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else delete globalThis.navigator;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousItem === undefined) delete globalThis.ClipboardItem;
    else globalThis.ClipboardItem = previousItem;
  }
});
