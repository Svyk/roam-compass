import { clampSeconds, pickNext, reduce } from "../../model/wander.js";
import { SETTING_IDS } from "../../settings.js";

const HIGHLIGHT_MS = 900;
const EXHAUSTED_STATUS = "Nowhere new from here. Pick a direction or press Play.";

function escapeSelector(value) {
  if (typeof globalThis.CSS?.escape === "function") return globalThis.CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

export function createWander(ctx) {
  let state = { mode: "idle", reason: null };
  let pace = clampSeconds(ctx?.state?.settings?.wanderSeconds);
  let wasZen = false;
  let recent = [];
  let stepTimer = null;
  let moveTimer = null;
  let wanderNavigating = false;
  let savingPace = 0;

  let strip = null;
  let noteEl = null;
  let toggleBtn = null;
  let slider = null;
  let paceValue = null;
  let stopBtn = null;

  if (ctx?.el && ctx?.button && ctx?.lifecycle && ctx?.dom?.stage && ctx?.dom?.root) {
    strip = ctx.el("div", "compass-wander-strip");
    strip.hidden = true;
    strip.dataset.mode = "idle";

    noteEl = ctx.el("div", "compass-wander-note", EXHAUSTED_STATUS);
    noteEl.hidden = true;

    toggleBtn = ctx.button("compass-wander-toggle", "Pause", "Pause wandering");

    const paceWrap = ctx.el("label", "compass-wander-pace-wrap");
    const paceCaption = ctx.el("span", "compass-wander-pace-caption", "Pace");
    slider = ctx.el("input", "compass-wander-pace");
    slider.type = "range";
    slider.min = "3";
    slider.max = "15";
    slider.step = "1";
    slider.value = String(pace);
    slider.setAttribute("aria-label", "Wander pace in seconds");
    paceValue = ctx.el("span", "compass-wander-pace-value", `${pace}s`);
    paceWrap.append(paceCaption, slider, paceValue);

    stopBtn = ctx.button("compass-wander-stop", "×", "Stop wandering");

    strip.append(noteEl, toggleBtn, paceWrap, stopBtn);
    ctx.lifecycle.node(strip, ctx.dom.stage);

    for (const type of ["pointerdown", "click", "dblclick", "contextmenu", "wheel"]) {
      ctx.lifecycle.event(strip, type, (event) => {
        event.stopPropagation();
      });
    }

    ctx.lifecycle.event(toggleBtn, "click", () => {
      if (state.mode === "playing") pauseByButton();
      else if (state.mode === "paused") resumeWalk();
    });

    ctx.lifecycle.event(stopBtn, "click", () => {
      stop();
    });

    ctx.lifecycle.event(slider, "input", () => {
      pace = clampSeconds(slider.value);
      syncPaceUi();
      if (state.mode === "playing" && moveTimer == null) {
        scheduleNextStep();
      }
      persistPace(pace);
    });

    ctx.lifecycle.event(ctx.dom.root, "pointerdown", (event) => {
      if (state.mode !== "playing") return;
      if (strip && strip.contains(event.target)) return;
      pauseManual();
    }, true);

    ctx.lifecycle.event(ctx.dom.root, "wheel", (event) => {
      if (state.mode !== "playing") return;
      if (strip && strip.contains(event.target)) return;
      pauseManual();
    }, { capture: true, passive: true });

    ctx.lifecycle.event(ctx.dom.root, "keydown", (event) => {
      if (state.mode !== "playing") return;
      if (strip && strip.contains(event.target)) return;
      pauseManual();
    }, true);
  }

  function syncPaceUi() {
    if (slider) slider.value = String(pace);
    if (paceValue) paceValue.textContent = `${pace}s`;
  }

  function persistPace(seconds) {
    if (typeof ctx?.saveSetting !== "function") return;
    savingPace += 1;
    Promise.resolve(ctx.saveSetting(SETTING_IDS.wanderSeconds, String(seconds)))
      .catch((error) => console.error("[compass] wander", error))
      .finally(() => {
        savingPace -= 1;
      });
  }

  function clearHighlight() {
    const world = ctx?.dom?.world;
    if (!world?.querySelectorAll) return;
    for (const el of world.querySelectorAll(".compass-wander-next")) {
      el.classList.remove("compass-wander-next");
    }
  }

  function clearTimers() {
    if (ctx?.cancel) {
      stepTimer = ctx.cancel(stepTimer);
      moveTimer = ctx.cancel(moveTimer);
    } else {
      stepTimer = null;
      moveTimer = null;
    }
    clearHighlight();
  }

  function syncStripUi() {
    const active = state.mode !== "idle";
    ctx?.dom?.root?.classList?.toggle?.("compass-wandering", active);
    if (!strip) return;
    strip.hidden = !active;
    strip.dataset.mode = state.mode;
    if (toggleBtn) {
      const playing = state.mode === "playing";
      const label = playing ? "Pause wandering" : "Resume wandering";
      toggleBtn.textContent = playing ? "Pause" : "Play";
      toggleBtn.title = label;
      toggleBtn.setAttribute("aria-label", label);
    }
    if (noteEl) {
      noteEl.hidden = state.reason !== "exhausted";
    }
    syncPaceUi();
  }

  function elementForItem(item) {
    const world = ctx?.dom?.world;
    if (typeof item?.key === "string" && item.key && world) {
      const byKey = world.querySelector(`.compass-node[data-key="${escapeSelector(item.key)}"]`);
      if (byKey) return byKey;
    }
    if (typeof item?.uid === "string" && item.uid) {
      const mapped = ctx?.state?.nodeEls?.get?.(item.uid);
      if (mapped) return mapped;
      if (world) {
        const byUid = world.querySelector(`.compass-node[data-uid="${escapeSelector(item.uid)}"]`);
        if (byUid) return byUid;
      }
    }
    return null;
  }

  function currentCandidates() {
    const geometry = ctx?.state?.geometry;
    const hood = ctx?.state?.hood;
    if (!geometry?.items) return { uids: [], elements: new Map() };

    const nodeByUid = new Map();
    for (const node of hood?.nodes ?? []) {
      if (node?.uid) nodeByUid.set(node.uid, node);
    }
    for (const node of geometry.nodes ?? []) {
      if (node?.uid && !nodeByUid.has(node.uid)) nodeByUid.set(node.uid, node);
    }

    const uids = [];
    const elements = new Map();
    const seen = new Set();
    for (const item of geometry.items) {
      const uid = item?.uid;
      if (typeof uid !== "string" || !uid || uid === ctx?.state?.current || seen.has(uid)) continue;
      const node = nodeByUid.get(uid);
      if (!node) continue;
      if (node.kind !== "page" && node.kind !== "block") continue;
      if (node.kind === "group" || node.style === "board" || node.style === "card") continue;
      const el = elementForItem(item);
      if (!el || el.classList.contains("compass-fade")) continue;
      seen.add(uid);
      uids.push(uid);
      elements.set(uid, el);
    }
    return { uids, elements };
  }

  function scheduleNextStep() {
    clearTimers();
    if (state.mode !== "playing" || !ctx?.later) return;
    stepTimer = ctx.later(() => {
      stepTimer = null;
      if (state.mode !== "playing" || !ctx?.state?.isOpen) return;
      const { uids, elements } = currentCandidates();
      const targetUid = pickNext(uids, recent);
      if (!targetUid) {
        state = reduce(state, "exhausted");
        syncStripUi();
        ctx?.setStatus?.(EXHAUSTED_STATUS);
        return;
      }
      const targetEl = elements.get(targetUid);
      targetEl?.classList.add("compass-wander-next");
      moveTimer = ctx.later(() => {
        moveTimer = null;
        clearHighlight();
        if (state.mode !== "playing" || !ctx?.state?.isOpen) return;
        if (!recent.includes(targetUid)) recent.push(targetUid);
        wanderNavigating = true;
        try {
          ctx?.focusUid?.(targetUid);
        } finally {
          wanderNavigating = false;
        }
        if (state.mode === "playing") scheduleNextStep();
      }, HIGHLIGHT_MS);
    }, pace * 1000);
  }

  function isActive() {
    return state.mode !== "idle";
  }

  function pauseByButton() {
    if (state.mode !== "playing") return;
    clearTimers();
    state = reduce(state, "pause");
    syncStripUi();
  }

  function pauseManual() {
    if (state.mode !== "playing") return;
    clearTimers();
    state = reduce(state, "manual");
    syncStripUi();
  }

  function resumeWalk() {
    if (state.mode !== "paused") return;
    const { uids } = currentCandidates();
    if (state.reason === "exhausted" || pickNext(uids, recent) == null) {
      recent = ctx?.state?.current ? [ctx.state.current] : [];
    }
    if (state.reason === "exhausted") ctx?.setStatus?.("");
    state = reduce(state, "resume");
    syncStripUi();
    scheduleNextStep();
  }

  function start() {
    const firstActivation = !isActive();
    if (firstActivation) {
      const zenFeature = ctx?.features?.get?.("zen");
      wasZen = Boolean(zenFeature?.isZen?.() ?? ctx?.dom?.root?.classList?.contains?.("compass-zen"));
      if (zenFeature?.setZen) zenFeature.setZen(true);
      else ctx?.dom?.root?.classList?.add?.("compass-zen");
      recent = ctx?.state?.current ? [ctx.state.current] : [];
      pace = clampSeconds(ctx?.state?.settings?.wanderSeconds ?? pace);
    } else if (state.reason === "exhausted") {
      recent = ctx?.state?.current ? [ctx.state.current] : [];
      ctx?.setStatus?.("");
    }
    state = reduce(state, "start");
    syncStripUi();
    scheduleNextStep();
  }

  function stop({ closing = false } = {}) {
    if (!isActive()) return;
    clearTimers();
    if (state.reason === "exhausted") ctx?.setStatus?.("");
    state = reduce(state, "stop");
    recent = [];
    syncStripUi();
    if (!closing) {
      const zenFeature = ctx?.features?.get?.("zen");
      if (zenFeature?.setZen) zenFeature.setZen(wasZen);
      else ctx?.dom?.root?.classList?.toggle?.("compass-zen", wasZen);
    }
    wasZen = false;
  }

  function onSettings(settings) {
    if (!settings || savingPace > 0) return;
    pace = clampSeconds(settings.wanderSeconds);
    syncPaceUi();
  }

  function onNavigate({ uid } = {}) {
    if (!isActive()) return;
    if (uid && !recent.includes(uid)) recent.push(uid);
    if (!wanderNavigating && state.mode === "playing") {
      pauseManual();
    }
  }

  function onWheel(event) {
    if (state.mode === "playing" && (!strip || !strip.contains(event?.target))) {
      pauseManual();
    }
    return false;
  }

  function onKey(event) {
    if (state.mode === "playing" && (!strip || !strip.contains(event?.target))) {
      pauseManual();
    }
    return false;
  }

  function onEscape() {
    if (!isActive()) return false;
    stop();
    return true;
  }

  function onClose() {
    stop({ closing: true });
  }

  function commands() {
    return [
      {
        id: "wander",
        title: isActive() ? "Stop wandering" : "Wander",
        hint: "",
        run: () => (isActive() ? stop() : start()),
      },
    ];
  }

  function stageMenu() {
    return [
      { title: "Wander", run: () => start() },
    ];
  }

  return {
    name: "wander",
    start,
    stop: () => stop(),
    pause: pauseManual,
    isActive,
    onSettings,
    onNavigate,
    onWheel,
    onKey,
    onEscape,
    onClose,
    commands,
    stageMenu,
  };
}
