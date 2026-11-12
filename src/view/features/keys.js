import { SHORTCUTS, cycle, jump, matches, step } from "../../model/keynav.js";

const ARROW_DIR = Object.freeze({
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
});

const PHRASE_TIMEOUT_MS = 4000;
const HELP_GROUPS = Object.freeze(["Move and select", "Actions"]);

function escapeSelector(value) {
  if (typeof globalThis.CSS?.escape === "function") return globalThis.CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

function isPhraseChar(key, hasPhrase) {
  if (key === " ") return hasPhrase;
  return typeof key === "string" && key.length === 1 && /[\p{L}\p{N}]/u.test(key);
}

export function createKeys(ctx) {
  let phrase = "";
  let phraseTimer = null;
  let helpOpen = false;
  let savedFocus = null;
  let pill = null;
  let helpBackdrop = null;
  let closeHelpBtn = null;

  if (ctx?.el && ctx?.button && ctx?.lifecycle && ctx?.dom?.stage && ctx?.dom?.root) {
    pill = ctx.el("div", "compass-select-pill");
    pill.hidden = true;
    pill.setAttribute("role", "status");
    pill.setAttribute("aria-live", "polite");
    ctx.lifecycle.node(pill, ctx.dom.stage);

    helpBackdrop = ctx.el("div", "compass-help-backdrop");
    helpBackdrop.hidden = true;
    const panel = ctx.el("div", "compass-help");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Keyboard shortcuts");

    const head = ctx.el("div", "compass-help-head");
    const title = ctx.el("h2", "compass-help-title", "Keyboard shortcuts");
    closeHelpBtn = ctx.button("compass-help-close", "×", "Close keyboard help");
    head.append(title, closeHelpBtn);

    const body = ctx.el("div", "compass-help-body");
    for (const groupName of HELP_GROUPS) {
      const group = ctx.el("section", "compass-help-group");
      group.append(ctx.el("h3", "compass-help-group-title", groupName));
      const rows = ctx.el("div", "compass-help-rows");
      for (const item of SHORTCUTS) {
        if (item.group !== groupName) continue;
        const row = ctx.el("div", "compass-help-row");
        row.append(
          ctx.el("kbd", "compass-help-keys", item.keys),
          ctx.el("span", "compass-help-action", item.action),
        );
        rows.append(row);
      }
      group.append(rows);
      body.append(group);
    }

    panel.append(head, body);
    helpBackdrop.append(panel);
    ctx.lifecycle.node(helpBackdrop, ctx.dom.root);

    ctx.lifecycle.event(helpBackdrop, "pointerdown", (event) => {
      event.stopPropagation();
      if (event.target === helpBackdrop) closeHelp();
    });
    ctx.lifecycle.event(helpBackdrop, "click", (event) => {
      event.stopPropagation();
    });
    ctx.lifecycle.event(closeHelpBtn, "click", () => {
      closeHelp();
    });
    ctx.lifecycle.event(helpBackdrop, "keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeHelp();
      }
    });
  }

  function clearPhrase() {
    phrase = "";
    if (ctx?.cancel) phraseTimer = ctx.cancel(phraseTimer);
    if (pill) {
      pill.hidden = true;
      pill.textContent = "";
    }
  }

  function armPhraseTimer() {
    if (!ctx?.later || !ctx?.cancel) return;
    phraseTimer = ctx.cancel(phraseTimer);
    phraseTimer = ctx.later(clearPhrase, PHRASE_TIMEOUT_MS);
  }

  function updatePill(matchedKeys, activeKey) {
    if (!pill) return;
    if (!phrase) {
      pill.hidden = true;
      pill.textContent = "";
      return;
    }
    if (matchedKeys.length > 0) {
      const index = Math.max(0, matchedKeys.indexOf(activeKey));
      pill.textContent = `Select: ${phrase} — ${index + 1} of ${matchedKeys.length}`;
    } else {
      pill.textContent = `Select: ${phrase} — no match`;
    }
    pill.hidden = false;
  }

  function elementFor(item) {
    if (!item) return null;
    const world = ctx?.dom?.world;
    if (typeof item.key === "string" && item.key && world) {
      const byKey = world.querySelector(`.compass-node[data-key="${escapeSelector(item.key)}"]`);
      if (byKey) return byKey;
    }
    if (typeof item.uid === "string" && item.uid) {
      const mapped = ctx?.state?.nodeEls?.get?.(item.uid);
      if (mapped) return mapped;
      if (world) {
        if (item.zone === "center") {
          const centerEl = world.querySelector(".compass-node-center");
          if (centerEl) return centerEl;
        }
        const byUid = world.querySelector(`.compass-node[data-uid="${escapeSelector(item.uid)}"]`);
        if (byUid) return byUid;
      }
    }
    return null;
  }

  function collectScene() {
    const geometry = ctx?.state?.geometry;
    const hood = ctx?.state?.hood;
    if (!geometry || !hood?.center) {
      return { items: [], elements: new Map(), itemMap: new Map(), labels: new Map(), centerKey: null };
    }
    const items = [];
    const elements = new Map();
    const itemMap = new Map();
    const labels = new Map();

    const centerKey = hood.center.uid;
    const centerItem = {
      key: centerKey,
      uid: centerKey,
      zone: "center",
      x: geometry.center?.x ?? 0,
      y: geometry.center?.y ?? 0,
      w: geometry.center?.w ?? 240,
      h: geometry.center?.h ?? 56,
    };
    const centerEl = elementFor(centerItem);
    if (centerEl && !centerEl.classList.contains("compass-fade")) {
      items.push(centerItem);
      elements.set(centerKey, centerEl);
      itemMap.set(centerKey, centerItem);
      const centerTitle = centerEl.querySelector(".compass-node-title")?.textContent ?? "";
      if (centerTitle) labels.set(centerKey, centerTitle);
    }

    for (const raw of geometry.items ?? []) {
      const key = typeof raw?.key === "string" && raw.key ? raw.key : raw?.uid;
      if (!key) continue;
      const item = { ...raw, key };
      const nodeEl = elementFor(item);
      if (!nodeEl || nodeEl.classList.contains("compass-fade")) continue;
      items.push(item);
      elements.set(key, nodeEl);
      itemMap.set(key, item);
      const text = nodeEl.querySelector(".compass-node-title")?.textContent ?? "";
      if (text) labels.set(key, text);
    }

    return { items, elements, itemMap, labels, centerKey: centerEl ? centerKey : null };
  }

  function focusedNodeElement() {
    const active = globalThis.document?.activeElement;
    if (!active || !ctx?.dom?.world?.contains?.(active)) return null;
    return active.closest?.(".compass-node") ?? null;
  }

  function keyOfElement(nodeEl, centerKey) {
    if (!nodeEl) return null;
    if (nodeEl.classList.contains("compass-node-center")) return centerKey || nodeEl.dataset.uid || null;
    return nodeEl.dataset.key || nodeEl.dataset.uid || null;
  }

  function ensureInView(item) {
    const stage = ctx?.dom?.stage;
    if (!item || typeof stage?.getBoundingClientRect !== "function" || typeof ctx?.setCamera !== "function") return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const zoom = ctx.state?.zoom || 1;
    const panX = ctx.state?.panX || 0;
    const panY = ctx.state?.panY || 0;
    const margin = 16;
    const halfW = Math.max(0, rect.width / 2 - margin);
    const halfH = Math.max(0, rect.height / 2 - margin);
    const w = Number.isFinite(item.w) ? item.w : 0;
    const h = Number.isFinite(item.h) ? item.h : 0;
    const left = panX + (item.x - w / 2) * zoom;
    const right = panX + (item.x + w / 2) * zoom;
    const top = panY + (item.y - h / 2) * zoom;
    const bottom = panY + (item.y + h / 2) * zoom;

    let nextPanX = panX;
    let nextPanY = panY;
    if (w * zoom > halfW * 2) nextPanX = -item.x * zoom;
    else if (left < -halfW) nextPanX += -halfW - left;
    else if (right > halfW) nextPanX -= right - halfW;

    if (h * zoom > halfH * 2) nextPanY = -item.y * zoom;
    else if (top < -halfH) nextPanY += -halfH - top;
    else if (bottom > halfH) nextPanY -= bottom - halfH;

    if (nextPanX !== panX || nextPanY !== panY) {
      ctx.setCamera({ panX: nextPanX, panY: nextPanY }, true);
    }
  }

  function selectKey(scene, targetKey) {
    if (!targetKey) return false;
    const nodeEl = scene.elements.get(targetKey);
    if (!nodeEl) return false;
    nodeEl.focus({ preventScroll: true });
    ensureInView(scene.itemMap.get(targetKey));
    return true;
  }

  function focusCenter() {
    clearPhrase();
    const scene = collectScene();
    if (scene.centerKey) selectKey(scene, scene.centerKey);
  }

  function help() {
    clearPhrase();
    ctx?.hideFloating?.();
    if (!helpOpen) {
      const active = globalThis.document?.activeElement;
      savedFocus = active && ctx?.dom?.root?.contains?.(active) ? active : null;
    }
    helpOpen = true;
    if (helpBackdrop) {
      helpBackdrop.hidden = false;
      closeHelpBtn?.focus({ preventScroll: true });
    }
  }

  function closeHelp(restore = true) {
    if (!helpOpen) return;
    helpOpen = false;
    if (helpBackdrop) helpBackdrop.hidden = true;
    const target = savedFocus;
    savedFocus = null;
    if (restore && target?.isConnected && ctx?.state?.isOpen) {
      target.focus({ preventScroll: true });
    }
  }

  function openCenterZonePop(arrowKey) {
    const flipped = Boolean(ctx?.state?.geometry?.flip ?? ctx?.state?.settings?.flip);
    let zone = "south";
    if (arrowKey === "ArrowUp") zone = "north";
    else if (arrowKey === "ArrowDown") zone = "south";
    else if (arrowKey === "ArrowLeft") zone = flipped ? "east" : "west";
    else if (arrowKey === "ArrowRight") zone = flipped ? "west" : "east";

    const centerEl = ctx?.dom?.world?.querySelector?.(".compass-node-center")
      ?? (ctx?.state?.current ? ctx?.state?.nodeEls?.get?.(ctx.state.current) : null);
    const rect = centerEl?.getBoundingClientRect?.() ?? ctx?.dom?.stage?.getBoundingClientRect?.();
    let x = NaN;
    let y = NaN;
    if (rect) {
      if (arrowKey === "ArrowUp") {
        x = rect.left + rect.width / 2;
        y = rect.top - 8;
      } else if (arrowKey === "ArrowDown") {
        x = rect.left + rect.width / 2;
        y = rect.bottom + 8;
      } else if (arrowKey === "ArrowLeft") {
        x = rect.left - 8;
        y = rect.top + rect.height / 2;
      } else {
        x = rect.right + 8;
        y = rect.top + rect.height / 2;
      }
    }
    ctx?.openZonePop?.(zone, x, y);
  }

  function notifyWander(event) {
    if (event?.target === globalThis.document?.body) {
      ctx?.features?.get?.("wander")?.pause?.();
    }
  }

  function onKey(event) {
    if (!event) return false;

    if (helpOpen) {
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        if ((event.code === "Slash" && event.shiftKey) || event.key === "?") {
          closeHelp();
          return true;
        }
        if (!event.shiftKey && (event.code === "Period" || event.key === ".")) {
          closeHelp(false);
          ctx?.features?.get?.("palette")?.open?.();
          return true;
        }
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "PageDown" || event.key === "PageUp") {
        return false;
      }
      return true;
    }

    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if (!event.shiftKey && event.key === "Enter") {
        const nodeEl = focusedNodeElement();
        if (!nodeEl?.dataset?.uid) return false;
        clearPhrase();
        notifyWander(event);
        void ctx?.openMain?.(nodeEl.dataset.uid);
        return true;
      }
      if (!event.shiftKey && ARROW_DIR[event.key]) {
        if (!ctx?.state?.current) return false;
        clearPhrase();
        notifyWander(event);
        openCenterZonePop(event.key);
        return true;
      }
      return false;
    }

    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      if ((event.code === "Slash" && event.shiftKey) || event.key === "?") {
        notifyWander(event);
        help();
        return true;
      }
      if (!event.shiftKey && (event.code === "Slash" || event.key === "/")) {
        clearPhrase();
        notifyWander(event);
        ctx?.dom?.searchInput?.focus?.();
        ctx?.dom?.searchInput?.select?.();
        return true;
      }
      if (!event.shiftKey && (event.code === "Period" || event.key === ".")) {
        clearPhrase();
        notifyWander(event);
        ctx?.features?.get?.("palette")?.open?.();
        return true;
      }
      if (!event.shiftKey && (event.code === "Digit0" || event.code === "Numpad0" || event.key === "0")) {
        notifyWander(event);
        focusCenter();
        return true;
      }
      if (!event.shiftKey && (event.code === "KeyP" || event.key?.toLowerCase?.() === "p")) {
        clearPhrase();
        notifyWander(event);
        const uid = focusedNodeElement()?.dataset?.uid || ctx?.state?.current;
        if (uid && ctx?.togglePin) {
          if (ctx.guard) ctx.guard(() => ctx.togglePin(uid))();
          else void ctx.togglePin(uid);
        }
        return true;
      }
      if (!event.shiftKey && (event.code === "KeyB" || event.key?.toLowerCase?.() === "b")) {
        clearPhrase();
        notifyWander(event);
        ctx?.features?.get?.("pins")?.openPicker?.();
        return true;
      }
      if (!event.shiftKey && (event.code === "KeyH" || event.key?.toLowerCase?.() === "h")) {
        clearPhrase();
        notifyWander(event);
        ctx?.features?.get?.("trail")?.toggle?.();
        return true;
      }
      if (!event.shiftKey && (event.code === "KeyM" || event.key?.toLowerCase?.() === "m")) {
        clearPhrase();
        notifyWander(event);
        const nodeEl = focusedNodeElement();
        if (nodeEl && !nodeEl.classList.contains("compass-node-center") && nodeEl.dataset.uid) {
          const rect = nodeEl.getBoundingClientRect();
          ctx?.showMenu?.(nodeEl.dataset.uid, rect.left + 8, rect.bottom);
        }
        return true;
      }
      if (!event.shiftKey && ARROW_DIR[event.key]) {
        const direction = ARROW_DIR[event.key];
        const nodeEl = focusedNodeElement();
        const atCenterOrNone = !nodeEl || nodeEl.classList.contains("compass-node-center");
        if ((direction === "left" || direction === "right") && atCenterOrNone) {
          clearPhrase();
          return false;
        }
        clearPhrase();
        notifyWander(event);
        const scene = collectScene();
        const target = jump(scene.items, direction);
        if (target) selectKey(scene, target);
        return true;
      }
      return false;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) return false;

    if (ARROW_DIR[event.key] && !event.shiftKey) {
      clearPhrase();
      notifyWander(event);
      const scene = collectScene();
      const currentKey = keyOfElement(focusedNodeElement(), scene.centerKey);
      const target = step(scene.items, currentKey, ARROW_DIR[event.key]);
      if (target) selectKey(scene, target);
      return true;
    }

    if (event.key === "Enter") {
      if (phrase) clearPhrase();
      return false;
    }

    if (event.key === "Tab") {
      if (!phrase) return false;
      notifyWander(event);
      armPhraseTimer();
      const scene = collectScene();
      const matched = matches(scene.items, scene.labels, phrase);
      const currentKey = keyOfElement(focusedNodeElement(), scene.centerKey);
      let chosen = currentKey;
      if (matched.length > 0) {
        chosen = cycle(matched, currentKey, event.shiftKey ? -1 : 1);
        selectKey(scene, chosen);
      }
      updatePill(matched, chosen);
      return true;
    }

    if (event.key === "Backspace") {
      notifyWander(event);
      if (phrase) {
        const chars = Array.from(phrase);
        chars.pop();
        phrase = chars.join("");
        if (!phrase) {
          clearPhrase();
          return true;
        }
        armPhraseTimer();
        const scene = collectScene();
        const matched = matches(scene.items, scene.labels, phrase);
        const chosen = matched[0] ?? null;
        if (chosen) selectKey(scene, chosen);
        updatePill(matched, chosen);
        return true;
      }
      if (event.shiftKey) ctx?.goForward?.();
      else ctx?.goBack?.();
      return true;
    }

    if (isPhraseChar(event.key, phrase.length > 0)) {
      const nextPhrase = phrase + event.key;
      const scene = collectScene();
      const matched = matches(scene.items, scene.labels, nextPhrase);
      if (!phrase && matched.length === 0) return false;
      notifyWander(event);
      phrase = nextPhrase;
      armPhraseTimer();
      const chosen = matched[0] ?? null;
      if (chosen) selectKey(scene, chosen);
      updatePill(matched, chosen);
      return true;
    }

    return false;
  }

  function onEscape() {
    if (helpOpen) {
      closeHelp();
      return true;
    }
    if (phrase) {
      clearPhrase();
      return true;
    }
    return false;
  }

  function onNavigate() {
    clearPhrase();
  }

  function onClose() {
    clearPhrase();
    closeHelp(false);
  }

  function commands() {
    return [
      { id: "keys-help", title: "Keyboard help", hint: "Alt+?", run: () => help() },
      { id: "select-center", title: "Select the center", hint: "Alt+0", run: () => focusCenter() },
    ];
  }

  return {
    name: "keys",
    help,
    onKey,
    onEscape,
    onNavigate,
    onClose,
    commands,
  };
}
