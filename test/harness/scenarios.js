import { installRoamCompass } from "../../src/extension.js";
import { SETTING_IDS } from "../../src/settings.js";
import * as baseModule from "./scenarios/base.js";
import * as trailModule from "./scenarios/trail.js";
import * as pinsModule from "./scenarios/pins.js";
import * as mindmapModule from "./scenarios/mindmap.js";
import * as facetsModule from "./scenarios/facets.js";
import * as lensesModule from "./scenarios/lenses.js";
import * as layoutModule from "./scenarios/layout.js";
import * as keysModule from "./scenarios/keys.js";
import * as exportModule from "./scenarios/export.js";
import * as editModule from "./scenarios/edit.js";
import * as boardsModule from "./scenarios/boards.js";
import * as drawingsModule from "./scenarios/drawings.js";
import * as releaseModule from "./scenarios/release.js";

const SCENARIO_SOURCES = [
  ["test/harness/scenarios/base.js", baseModule],
  ["test/harness/scenarios/trail.js", trailModule],
  ["test/harness/scenarios/pins.js", pinsModule],
  ["test/harness/scenarios/mindmap.js", mindmapModule],
  ["test/harness/scenarios/facets.js", facetsModule],
  ["test/harness/scenarios/lenses.js", lensesModule],
  ["test/harness/scenarios/layout.js", layoutModule],
  ["test/harness/scenarios/keys.js", keysModule],
  ["test/harness/scenarios/export.js", exportModule],
  ["test/harness/scenarios/edit.js", editModule],
  ["test/harness/scenarios/boards.js", boardsModule],
  ["test/harness/scenarios/drawings.js", drawingsModule],
  ["test/harness/scenarios/release.js", releaseModule],
];

function extractScenarios(mod) {
  if (mod?.SCENARIOS && typeof mod.SCENARIOS === "object") return mod.SCENARIOS;
  if (mod?.default && typeof mod.default === "object") return mod.default;
  if (mod?.scenarios && typeof mod.scenarios === "object") return mod.scenarios;
  const named = {};
  for (const [key, value] of Object.entries(mod ?? {})) {
    if (typeof value === "function") named[key] = value;
  }
  return named;
}

export const SCENARIOS = {};
export const SCENARIO_ERRORS = [];

const definedIn = new Map();
for (const [file, mod] of SCENARIO_SOURCES) {
  const entries = extractScenarios(mod);
  for (const [name, fn] of Object.entries(entries)) {
    if (definedIn.has(name)) {
      SCENARIO_ERRORS.push(`Duplicate scenario "${name}" defined in ${definedIn.get(name)} and ${file}`);
    } else {
      definedIn.set(name, file);
    }
    SCENARIOS[name] = fn;
  }
}

async function wait(ms) {
  const step = 50;
  let remaining = Math.max(0, Number(ms) || 0);
  if (remaining === 0) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    return;
  }
  while (remaining > 0) {
    const slice = Math.min(step, remaining);
    await new Promise((resolve) => setTimeout(resolve, slice));
    remaining -= slice;
  }
}

function centerOf(element) {
  const rect = element.getBoundingClientRect();
  return {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
}

function nextFrame() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(finish);
    setTimeout(finish, 20);
  });
}

function describeElement(el, index) {
  const rawTitle = el?.querySelector?.(".compass-node-title")?.textContent?.trim()
    || el?.getAttribute?.("aria-label")?.trim()
    || el?.textContent?.trim()
    || "";
  const label = rawTitle.length > 40 ? `${rawTitle.slice(0, 39)}…` : rawTitle;
  const uid = el?.dataset?.uid || el?.dataset?.lens || el?.dataset?.zone || "";
  if (label && uid && label !== uid) return `${JSON.stringify(label)} (${uid})`;
  if (label) return JSON.stringify(label);
  if (uid) return uid;
  const tag = el?.tagName?.toLowerCase() || "element";
  return `${tag}#${index}`;
}

export function createScenarioHelper(harness, assertions) {
  if (typeof window !== "undefined" && !window.RoamCompass && harness?.overlay) {
    const cleanupApi = installRoamCompass(window, {
      overlay: harness.overlay,
      host: harness.host,
      extensionAPI: harness.extensionAPI,
      version: "1.0.0",
    });
    harness.lifecycle?.add?.(cleanupApi);
  }
  const root = () => document.querySelector(".compass-root");
  const q = (selector) => {
    const container = root();
    if (!container) return null;
    if (container.matches?.(selector)) return container;
    return container.querySelector(selector);
  };
  const qa = (selector) => {
    const container = root();
    return container ? Array.from(container.querySelectorAll(selector)) : [];
  };
  const resolveTarget = (target) => {
    const element = typeof target === "string"
      ? (q(target) ?? document.querySelector(target))
      : target;
    if (!element || typeof element.dispatchEvent !== "function") {
      throw new Error(`Target not found: ${String(target)}`);
    }
    return element;
  };
  const asRect = (value) => {
    if (!value) throw new Error(`Invalid rect target: ${String(value)}`);
    if (typeof value === "string") return resolveTarget(value).getBoundingClientRect();
    if (typeof value.getBoundingClientRect === "function") return value.getBoundingClientRect();
    return value;
  };
  const rectsOverlap = (a, b) => {
    const ra = asRect(a);
    const rb = asRect(b);
    const aLeft = ra.left ?? ra.x ?? 0;
    const aRight = ra.right ?? (aLeft + (ra.width ?? 0));
    const aTop = ra.top ?? ra.y ?? 0;
    const aBottom = ra.bottom ?? (aTop + (ra.height ?? 0));
    const bLeft = rb.left ?? rb.x ?? 0;
    const bRight = rb.right ?? (bLeft + (rb.width ?? 0));
    const bTop = rb.top ?? rb.y ?? 0;
    const bBottom = rb.bottom ?? (bTop + (rb.height ?? 0));
    const dx = Math.min(aRight, bRight) - Math.max(aLeft, bLeft);
    const dy = Math.min(aBottom, bBottom) - Math.max(aTop, bTop);
    return dx > 1 && dy > 1;
  };

  return {
    harness,

    async open(uid) {
      harness.overlay.focusUid(uid);
      await nextFrame();
      await wait(350);
      harness.overlay.hideResults();
    },

    async setting(id, value) {
      const key = Object.prototype.hasOwnProperty.call(SETTING_IDS, id) ? SETTING_IDS[id] : id;
      await harness.extensionAPI.settings.set(key, value);
      harness.overlay.repullIfOpen();
      await wait(400);
    },

    wait,
    q,
    qa,

    focused() {
      return document.activeElement;
    },

    rect(target) {
      return resolveTarget(target).getBoundingClientRect();
    },

    overlaps(a, b) {
      return rectsOverlap(a, b);
    },

    noOverlap(selector) {
      const elements = qa(selector);
      const rects = elements.map((el) => el.getBoundingClientRect());
      for (let i = 0; i < elements.length; i += 1) {
        for (let j = i + 1; j < elements.length; j += 1) {
          if (rectsOverlap(rects[i], rects[j])) {
            const pair = `${describeElement(elements[i], i)} overlaps ${describeElement(elements[j], j)}`;
            assertions.push({ ok: false, message: `noOverlap(${selector}): ${pair}` });
            return false;
          }
        }
      }
      assertions.push({ ok: true, message: `noOverlap(${selector})` });
      return true;
    },

    click(target, init = {}) {
      const element = resolveTarget(target);
      const { clientX, clientY } = centerOf(element);
      const base = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        button: 0,
        clientX,
        clientY,
        ...init,
      };
      element.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, isPrimary: true, buttons: 1, ...base }));
      element.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, isPrimary: true, buttons: 0, ...base }));
      element.dispatchEvent(new MouseEvent("click", { buttons: 0, detail: 1, ...base }));
    },

    dblclick(target, init = {}) {
      const element = resolveTarget(target);
      const { clientX, clientY } = centerOf(element);
      element.dispatchEvent(new MouseEvent("dblclick", {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        button: 0,
        buttons: 0,
        detail: 2,
        clientX,
        clientY,
        ...init,
      }));
    },

    contextmenu(target, init = {}) {
      const element = resolveTarget(target);
      const { clientX, clientY } = centerOf(element);
      element.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        button: 2,
        buttons: 2,
        clientX,
        clientY,
        ...init,
      }));
    },

    wheel(target, init = {}) {
      const element = resolveTarget(target);
      const { clientX, clientY } = centerOf(element);
      element.dispatchEvent(new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX,
        clientY,
        deltaX: 0,
        deltaY: 0,
        deltaZ: 0,
        deltaMode: 0,
        ...init,
      }));
    },

    key(key, init = {}) {
      const active = document.activeElement && document.activeElement !== document.documentElement
        ? document.activeElement
        : document.body;
      const opts = {
        bubbles: true,
        cancelable: true,
        composed: true,
        key,
        ...init,
      };
      active.dispatchEvent(new KeyboardEvent("keydown", opts));
      const upTarget = active.isConnected
        ? active
        : (document.activeElement && document.activeElement !== document.documentElement
          ? document.activeElement
          : document.body);
      upTarget.dispatchEvent(new KeyboardEvent("keyup", opts));
    },

    type(target, text) {
      const element = resolveTarget(target);
      element.focus();
      element.value = String(text ?? "");
      element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    },

    text(selector) {
      const element = typeof selector === "string" ? q(selector) : selector;
      return element?.textContent?.trim() ?? "";
    },

    count(selector) {
      return qa(selector).length;
    },

    status() {
      return q(".compass-status")?.textContent?.trim() ?? "";
    },

    features(name) {
      return harness.overlay.features?.get?.(name) ?? null;
    },

    assert(condition, message = "assertion") {
      assertions.push({ ok: Boolean(condition), message: String(message) });
    },

    equal(actual, expected, message = "equal") {
      const ok = Object.is(actual, expected);
      const detail = ok
        ? String(message)
        : `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`;
      assertions.push({ ok, message: detail });
    },

    calls(name) {
      if (name == null) return [...harness.host.calls];
      return harness.host.calls.filter((entry) => entry[0] === name);
    },
  };
}
