import { drawPlan } from "../../model/draw-map.js";
import { drawingTitle } from "../../model/text.js";

const COMMAND_ID = "draw-map";
const COMMAND_TITLE = "Draw this map…";
const DRAWING_CAP = 12;
const FOCUSABLE_SELECTOR = 'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), [tabindex="0"]';

function plexusApi() {
  const host = globalThis.window ?? globalThis;
  const api = host?.RoamPlexus;
  return api && typeof api === "object" ? api : null;
}

function canDraw() {
  const api = plexusApi();
  return Boolean(
    api
    && typeof api.create === "function"
    && typeof api.whenOpen === "function"
    && typeof api.build === "function",
  );
}

function countWord(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function regionsFromDom(root) {
  if (!root?.querySelectorAll) return [];
  const regions = [];
  for (const element of root.querySelectorAll('[data-paint="region"]')) {
    const id = element.dataset?.region || "";
    const name = element.querySelector?.(".compass-region-name")?.textContent?.trim()
      || element.querySelector?.(".compass-region-label")?.textContent?.trim()
      || id
      || "Region";
    const w = Number.parseFloat(element.style?.width) || element.offsetWidth || 0;
    const h = Number.parseFloat(element.style?.height) || element.offsetHeight || 0;
    const match = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\s*\)/.exec(element.style?.transform || "");
    let x = w / 2;
    let y = h / 2;
    if (match) {
      x = Number.parseFloat(match[1]) + w / 2;
      y = Number.parseFloat(match[2]) + h / 2;
    }
    regions.push({ id, name, label: name, x, y, w, h });
  }
  return regions;
}

export function createDrawings(ctx) {
  if (!ctx?.dom?.root || typeof ctx.el !== "function") {
    return { name: "drawings" };
  }

  let cache = null;
  let backdrop = null;
  let dialogEl = null;
  let summaryEl = null;
  let cutEl = null;
  let linksInput = null;
  let goBtn = null;
  let cancelBtn = null;
  let dialogOpen = false;
  let busy = false;
  let returnFocus = null;

  function drawingPage() {
    const center = ctx.state?.hood?.center;
    if (!center || typeof center.uid !== "string" || !center.uid) return null;
    if (center.kind === "block") {
      const page = ctx.state?.snapshot?.center?.page;
      if (!page || typeof page.uid !== "string" || !page.uid) return null;
      const title = typeof page.title === "string" && page.title ? page.title : page.uid;
      return { uid: page.uid, title };
    }
    const title = typeof center.title === "string" && center.title ? center.title : center.uid;
    return { uid: center.uid, title };
  }

  function currentPlan(linksOn) {
    const view = ctx.features?.get?.("views")?.current?.()?.view || "compass";
    const hood = ctx.state?.hood;
    const base = ctx.state?.geometry && typeof ctx.state.geometry === "object"
      ? ctx.state.geometry
      : { center: { x: 0, y: 0, w: 240, h: 56 }, items: [] };
    const geomNodes = base.nodes;
    const nodes = Array.isArray(geomNodes) && geomNodes.length
      ? geomNodes
      : (Array.isArray(hood?.nodes) ? hood.nodes : []);
    let hidden = null;
    try {
      const lenses = ctx.features?.get?.("lenses");
      if (typeof lenses?.hiddenFor === "function") hidden = lenses.hiddenFor(nodes);
    } catch (error) {
      console.error("[compass] draw map", error);
    }
    const regions = view === "facets" ? regionsFromDom(ctx.dom.root) : null;
    const geometry = regions ? { ...base, regions } : base;
    const tree = view === "mindmap" ? (ctx.features?.get?.("mindmap")?.tree?.() ?? null) : null;
    return drawPlan({
      view,
      center: hood?.center,
      geometry,
      nodes,
      links: linksOn,
      tree,
      hidden,
    });
  }

  function closeDialog() {
    dialogOpen = false;
    if (backdrop) backdrop.hidden = true;
    const back = returnFocus;
    returnFocus = null;
    if (back && back.isConnected && backdrop && !backdrop.contains(back)) {
      back.focus?.({ preventScroll: true });
    }
  }

  function ensureDialog() {
    if (backdrop) return;
    backdrop = ctx.el("div", "compass-draw-backdrop");
    backdrop.hidden = true;

    dialogEl = ctx.el("div", "compass-draw-dialog");
    dialogEl.setAttribute("role", "dialog");
    dialogEl.setAttribute("aria-modal", "true");
    dialogEl.setAttribute("aria-labelledby", "compass-draw-title");

    const title = ctx.el("h2", "compass-draw-title", "Draw this map");
    title.id = "compass-draw-title";
    summaryEl = ctx.el("p", "compass-draw-summary");
    cutEl = ctx.el("p", "compass-draw-cut");
    cutEl.hidden = true;

    const label = ctx.el("label", "compass-draw-check");
    linksInput = ctx.el("input", "compass-draw-links");
    linksInput.type = "checkbox";
    linksInput.checked = true;
    linksInput.setAttribute("aria-describedby", "compass-draw-hint");
    const labelText = ctx.el("span", "compass-draw-check-text", "Write page links");
    label.append(linksInput, labelText);

    const hint = ctx.el(
      "p",
      "compass-draw-hint",
      "Boxes become [[links]] you can Cmd-click, and the drawing shows up as related on those pages.",
    );
    hint.id = "compass-draw-hint";

    const actions = ctx.el("div", "compass-draw-actions");
    cancelBtn = ctx.button("compass-draw-cancel", "Cancel");
    goBtn = ctx.button("compass-draw-go", "Draw");
    actions.append(cancelBtn, goBtn);

    dialogEl.append(title, summaryEl, cutEl, label, hint, actions);
    backdrop.append(dialogEl);
    if (ctx.lifecycle?.node) ctx.lifecycle.node(backdrop, ctx.dom.root);
    else ctx.dom.root.append(backdrop);

    const register = (target, event, handler) => {
      if (ctx.lifecycle?.event) ctx.lifecycle.event(target, event, handler);
      else target.addEventListener(event, handler);
    };

    register(backdrop, "pointerdown", (event) => {
      event.stopPropagation();
    });
    register(backdrop, "click", (event) => {
      if (event.target === backdrop) closeDialog();
    });
    register(cancelBtn, "click", () => closeDialog());
    register(goBtn, "click", () => {
      void confirmDraw();
    });
    register(backdrop, "keydown", (event) => {
      if (!dialogOpen) return;
      if (event.key === "Escape") return;
      if (event.key === "Tab") {
        const focusable = [...dialogEl.querySelectorAll(FOCUSABLE_SELECTOR)]
          .filter((item) => !item.hidden && item.offsetParent !== null);
        if (focusable.length) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const active = globalThis.document?.activeElement;
          if (event.shiftKey) {
            if (active === first || !dialogEl.contains(active)) {
              event.preventDefault();
              last.focus();
            }
          } else if (active === last || !dialogEl.contains(active)) {
            event.preventDefault();
            first.focus();
          }
        }
        event.stopPropagation();
        return;
      }
      event.stopPropagation();
    });
  }

  function openDialog() {
    if (!canDraw()) return;
    const page = drawingPage();
    if (!page) {
      ctx.setStatus?.("Roam Plexus could not create the drawing.", true);
      return;
    }
    ensureDialog();
    const plan = currentPlan(true);
    summaryEl.textContent = `Draws ${countWord(plan.boxes.length, "box", "boxes")} and ${countWord(plan.arrows.length, "arrow", "arrows")} in a new drawing on [[${page.title}]]. Compass closes and the drawing opens.`;
    if (plan.omitted > 0) {
      const left = plan.omitted === 1 ? "1 was left out." : `${plan.omitted} were left out.`;
      cutEl.textContent = `Only the first 120 boxes are drawn. ${left}`;
      cutEl.hidden = false;
    } else {
      cutEl.textContent = "";
      cutEl.hidden = true;
    }
    linksInput.checked = true;
    goBtn.disabled = false;
    cancelBtn.disabled = false;
    returnFocus = globalThis.document?.activeElement ?? null;
    backdrop.hidden = false;
    dialogOpen = true;
    goBtn.focus?.({ preventScroll: true });
  }

  async function confirmDraw() {
    if (busy || !dialogOpen) return;
    busy = true;
    const useLinks = linksInput?.checked !== false;
    const page = drawingPage();
    const centerUid = ctx.state?.current || ctx.state?.hood?.center?.uid || "";
    const plan = currentPlan(useLinks);
    const pageTitle = page?.title || "";
    closeDialog();
    if (!page?.uid) {
      ctx.setStatus?.("Roam Plexus could not create the drawing.", true);
      busy = false;
      return;
    }
    ctx.close?.();
    const api = plexusApi();
    let created = null;
    try {
      created = await api.create({ parentUid: page.uid, order: "last" });
    } catch (error) {
      console.error("[compass] draw map", error);
      created = null;
    }
    const drawingUid = typeof created?.uid === "string" ? created.uid : "";
    if (!drawingUid) {
      if (centerUid) ctx.focusUid?.(centerUid);
      ctx.setStatus?.("Roam Plexus could not create the drawing.", true);
      busy = false;
      return;
    }
    try {
      await api.whenOpen(drawingUid, { timeoutMs: 15000 });
    } catch (error) {
      console.error("[compass] draw map", error);
      ctx.setStatus?.(
        `The new drawing is on [[${pageTitle}]], but it did not open. Open it and run Draw this map again.`,
        true,
      );
      busy = false;
      return;
    }
    try {
      const builder = api.build();
      builder.style({ fontSize: 20 });
      const ids = new Map();
      for (const box of plan.boxes) {
        const opts = { x: box.x, y: box.y, width: box.w, height: box.h };
        if (box.center) opts.strokeWidth = 2;
        ids.set(box.key, builder.box(box.text, opts));
      }
      for (const frame of plan.frames) {
        const children = frame.members.map((key) => ids.get(key)).filter(Boolean);
        builder.frame(frame.x, frame.y, frame.w, frame.h, { name: frame.name, children });
      }
      for (const arrow of plan.arrows) {
        const fromId = ids.get(arrow.from);
        const toId = ids.get(arrow.to);
        if (!fromId || !toId) continue;
        if (arrow.label) builder.arrow(fromId, toId, { label: arrow.label });
        else builder.arrow(fromId, toId);
      }
      await Promise.resolve(builder.commit(drawingUid));
    } catch (error) {
      console.error("[compass] draw map", error);
      ctx.setStatus?.("Roam Plexus could not draw the map.", true);
    }
    busy = false;
  }

  function drawingNodes(hood) {
    const center = hood?.center;
    if (!center || center.kind !== "page" || typeof center.uid !== "string" || !center.uid) return null;
    const api = plexusApi();
    if (typeof api?.drawingsOn !== "function") return null;
    let entries = cache && cache.centerUid === center.uid ? cache.entries : null;
    if (!entries) {
      entries = [];
      try {
        const listed = api.drawingsOn(center.uid);
        const uids = Array.isArray(listed)
          ? listed.filter((uid) => typeof uid === "string" && uid)
          : [];
        let strings = {};
        if (typeof ctx.host?.blockStrings === "function") {
          try {
            strings = ctx.host.blockStrings(uids) ?? {};
          } catch (error) {
            console.error("[compass] drawings", error);
            strings = {};
          }
        }
        for (const uid of uids) {
          const string = typeof strings?.[uid] === "string" ? strings[uid] : "";
          entries.push({ uid, string });
        }
      } catch (error) {
        console.error("[compass] drawings", error);
        entries = [];
      }
      cache = { centerUid: center.uid, entries };
    }
    const existing = new Set(Array.isArray(hood.nodes) ? hood.nodes.map((node) => node.uid) : []);
    existing.add(center.uid);
    const added = [];
    for (const entry of entries) {
      if (added.length >= DRAWING_CAP) break;
      if (!entry.uid || existing.has(entry.uid)) continue;
      existing.add(entry.uid);
      added.push({
        uid: entry.uid,
        kind: "block",
        title: drawingTitle(entry.string) || "Drawing",
        string: entry.string,
        style: "link",
        role: "child",
        zone: "south",
        strength: 1,
        label: "Drawing on this page",
        evidence: [{
          kind: "structural",
          role: "child",
          note: "drawing on page",
          sourceUid: entry.uid,
        }],
        alias: "",
        editTime: 0,
        createTime: 0,
        writable: null,
        via: null,
      });
    }
    return added;
  }

  return {
    name: "drawings",

    onSettings() {
      cache = null;
    },

    onClose() {
      closeDialog();
    },

    onEscape() {
      if (!dialogOpen) return false;
      closeDialog();
      return true;
    },

    transformHood(hood) {
      const added = drawingNodes(hood);
      if (!added?.length) return hood;
      const nodes = Array.isArray(hood.nodes) ? hood.nodes : [];
      return { ...hood, nodes: nodes.concat(added) };
    },

    commands() {
      if (!canDraw()) return [];
      return [{ id: COMMAND_ID, title: COMMAND_TITLE, run: () => openDialog() }];
    },

    stageMenu() {
      if (!canDraw()) return [];
      return [{ title: COMMAND_TITLE, run: () => openDialog() }];
    },
  };
}
