import {
  BUILTIN_PRESETS,
  allPresets,
  centerCategory,
  classify,
  findPreset,
  layoutFacets,
  validatePreset,
} from "../../model/facets.js";
import { SETTING_IDS } from "../../settings.js";
import { copyText } from "../clipboard.js";

const FOCUSABLE_SELECTOR = 'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), [tabindex="0"]';

function stripBuiltin(preset) {
  const copy = {
    id: preset.id,
    name: preset.name,
    ...(preset.help ? { help: preset.help } : {}),
    source: preset.source,
    ...(preset.source === "attribute" ? { attribute: preset.attribute } : {}),
    categories: Array.isArray(preset.categories)
      ? preset.categories.map((cat) => ({
        id: cat.id,
        label: cat.label,
        ...(cat.color ? { color: cat.color } : {}),
        ...(cat.match ? { match: cat.match } : { values: [...(cat.values ?? [])] }),
      }))
      : preset.categories,
    layout: preset.layout,
    edges: preset.edges,
    focusInCategory: preset.focusInCategory,
    hideEmptyStatus: preset.hideEmptyStatus,
  };
  return copy;
}

function uniqueCopyPreset(source, existingPresets) {
  const taken = new Set(existingPresets.map((item) => item.id));
  const baseId = `${source.id}-copy`.replace(/[^a-z0-9-]+/g, "-");
  let nextId = baseId;
  let counter = 2;
  while (taken.has(nextId)) {
    nextId = `${baseId}-${counter}`;
    counter += 1;
  }
  const clean = stripBuiltin(source);
  return {
    ...clean,
    id: nextId,
    name: `${source.name} copy`,
  };
}

function placeBox(element, box) {
  element.style.width = `${box.w}px`;
  element.style.height = `${box.h}px`;
  element.style.transform = `translate(${box.x - box.w / 2}px, ${box.y - box.h / 2}px)`;
}

function createGearIcon(svgHelper) {
  const icon = svgHelper("svg", "compass-facets-gear-icon");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("width", "14");
  icon.setAttribute("height", "14");
  icon.setAttribute("aria-hidden", "true");
  const outer = svgHelper("path");
  outer.setAttribute(
    "d",
    "M6.8 1.5h2.4l.4 1.7a5 5 0 0 1 1.2.7l1.6-.6 1.2 2.1-1.3 1.1a5 5 0 0 1 0 1.4l1.3 1.1-1.2 2.1-1.6-.6a5 5 0 0 1-1.2.7l-.4 1.7H6.8l-.4-1.7a5 5 0 0 1-1.2-.7l-1.6.6-1.2-2.1 1.3-1.1a5 5 0 0 1 0-1.4L2.4 5.4l1.2-2.1 1.6.6a5 5 0 0 1 1.2-.7l.4-1.7z",
  );
  outer.setAttribute("fill", "none");
  outer.setAttribute("stroke", "currentColor");
  outer.setAttribute("stroke-width", "1.3");
  outer.setAttribute("stroke-linejoin", "round");
  const inner = svgHelper("circle");
  inner.setAttribute("cx", "8");
  inner.setAttribute("cy", "7.2");
  inner.setAttribute("r", "2");
  inner.setAttribute("fill", "none");
  inner.setAttribute("stroke", "currentColor");
  inner.setAttribute("stroke-width", "1.3");
  icon.append(outer, inner);
  return icon;
}

export function createFacets(ctx) {
  let lastClassified = null;
  let helpOpen = false;
  let currentGearBtn = null;
  let editorOpen = false;
  let returnFocusEl = null;
  const expandedByCenter = new Map();
  const warnedFallbacks = new Set();

  const hasDom = Boolean(ctx?.dom?.world && ctx?.dom?.root && typeof ctx?.el === "function");
  const layer = hasDom ? ctx.el("div", "compass-facets") : null;
  if (layer && ctx.lifecycle?.node) {
    ctx.lifecycle.node(layer, ctx.dom.world);
  } else if (layer) {
    ctx.dom.world.append(layer);
  }

  let backdrop = null;
  let dialogEl = null;
  let listEl = null;
  let jsonArea = null;
  let errorsEl = null;
  let loadedJsonSnapshot = "";

  function readCustomList(settingsOverride = null) {
    const settings = settingsOverride ?? ctx?.state?.settings;
    if (Array.isArray(settings?.facetsPresets)) return settings.facetsPresets;
    const raw = ctx?.extensionAPI?.settings?.get?.(SETTING_IDS.facetsPresets);
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return [];
      }
    }
    return [];
  }

  function viewSelection(settingsOverride = null) {
    const views = ctx?.features?.get?.("views");
    if (typeof views?.current === "function") {
      const cur = views.current();
      if (cur && typeof cur.view === "string") {
        return {
          view: cur.view,
          preset: cur.preset || settingsOverride?.facetsPreset || ctx?.state?.settings?.facetsPreset || "roles",
        };
      }
    }
    const settings = settingsOverride ?? ctx?.state?.settings;
    return {
      view: settings?.view || "compass",
      preset: settings?.facetsPreset || "roles",
    };
  }

  async function selectPreset(id) {
    const views = ctx?.features?.get?.("views");
    if (typeof views?.set === "function") {
      await views.set("facets", id);
      return;
    }
    await ctx?.saveSetting?.(SETTING_IDS.view, "facets");
    await ctx?.saveSetting?.(SETTING_IDS.facetsPreset, id);
    ctx?.rebuild?.();
    ctx?.render?.();
    ctx?.fit?.(true);
  }

  function expandedSetFor(centerUid, presetId = "") {
    if (!centerUid) return null;
    const key = `${centerUid}\0${presetId}`;
    if (!expandedByCenter.has(key)) expandedByCenter.set(key, new Set());
    return expandedByCenter.get(key);
  }

  function presets() {
    return allPresets(readCustomList()).map(({ id, name, builtin }) => ({ id, name, builtin }));
  }

  function classified() {
    if (viewSelection().view !== "facets") return null;
    return lastClassified;
  }

  function clearView() {
    lastClassified = null;
    currentGearBtn = null;
    if (layer) layer.replaceChildren();
  }

  function renderErrors(messages) {
    if (!errorsEl) return;
    errorsEl.replaceChildren();
    if (!messages?.length) {
      errorsEl.hidden = true;
      return;
    }
    for (const msg of messages) {
      errorsEl.append(ctx.el("li", "compass-facets-error", msg));
    }
    errorsEl.hidden = false;
  }

  function setEditorJson(presetObj) {
    if (!jsonArea) return;
    const formatted = JSON.stringify(presetObj, null, 2);
    jsonArea.value = formatted;
    loadedJsonSnapshot = formatted;
    renderErrors([]);
  }

  function refreshEditorList(selectedId = null) {
    if (!listEl) return;
    listEl.replaceChildren();
    const list = allPresets(readCustomList());
    const activeId = selectedId ?? findPreset(list, viewSelection().preset).id;

    for (const item of list) {
      const row = ctx.el(
        "div",
        `compass-facets-preset-row${item.id === activeId ? " is-selected" : ""}`,
      );
      row.dataset.presetId = item.id;

      const info = ctx.el("div", "compass-facets-preset-info");
      const titleBtn = ctx.button("compass-facets-preset-select", item.name, `Use ${item.name}`);
      titleBtn.addEventListener("click", () => {
        ctx.guard(async () => {
          await selectPreset(item.id);
          refreshEditorList(item.id);
        })();
      });
      const badge = ctx.el("span", "compass-facets-preset-badge", item.builtin ? "Built-in" : "Custom");
      info.append(titleBtn, badge);

      const actions = ctx.el("div", "compass-facets-preset-actions");
      if (!item.builtin) {
        const editBtn = ctx.button("compass-facets-action-edit", "Edit", `Edit ${item.name}`);
        editBtn.addEventListener("click", () => {
          setEditorJson(stripBuiltin(item));
          jsonArea?.focus();
        });
        actions.append(editBtn);
      }

      const dupBtn = ctx.button("compass-facets-action-duplicate", "Duplicate", `Duplicate ${item.name}`);
      dupBtn.addEventListener("click", () => {
        const copy = uniqueCopyPreset(item, list);
        setEditorJson(copy);
        jsonArea?.focus();
      });
      actions.append(dupBtn);

      if (!item.builtin) {
        const delBtn = ctx.button("compass-facets-action-delete", "Delete", `Delete ${item.name}`);
        delBtn.addEventListener("click", () => {
          ctx.guard(async () => {
            const rawList = readCustomList();
            const nextList = rawList.filter((entry) => {
              const checked = validatePreset(entry);
              const entryId = checked.ok ? checked.preset.id : entry?.id;
              return entryId !== item.id;
            });
            await ctx?.saveSetting?.(SETTING_IDS.facetsPresets, nextList);
            const wasSelected = viewSelection().preset === item.id;
            if (wasSelected) {
              await selectPreset(BUILTIN_PRESETS[0].id);
            } else {
              ctx?.render?.();
            }
            const updatedAll = allPresets(nextList);
            const fallbackActive = findPreset(updatedAll, wasSelected ? BUILTIN_PRESETS[0].id : viewSelection().preset);
            setEditorJson(fallbackActive.builtin ? uniqueCopyPreset(fallbackActive, updatedAll) : stripBuiltin(fallbackActive));
            refreshEditorList(fallbackActive.id);
          })();
        });
        actions.append(delBtn);
      }

      row.append(info, actions);
      listEl.append(row);
    }
  }

  async function handleSavePreset() {
    if (!jsonArea) return;
    const rawText = jsonArea.value.trim();
    if (!rawText) {
      renderErrors(["Paste or write a preset JSON object before saving."]);
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      renderErrors(["Invalid JSON. Check quotes, commas, and brackets."]);
      return;
    }
    const checked = validatePreset(parsed);
    if (!checked.ok) {
      renderErrors(checked.errors);
      return;
    }

    renderErrors([]);
    const saved = checked.preset;
    const existingValid = [];
    for (const item of readCustomList()) {
      const res = validatePreset(item);
      if (res.ok) existingValid.push(res.preset);
    }
    const idx = existingValid.findIndex((item) => item.id === saved.id);
    if (idx >= 0) existingValid[idx] = saved;
    else existingValid.push(saved);

    await ctx?.saveSetting?.(SETTING_IDS.facetsPresets, existingValid);
    await selectPreset(saved.id);
    setEditorJson(stripBuiltin(saved));
    refreshEditorList(saved.id);
    ctx?.setStatus?.(`Saved preset "${saved.name}".`);
  }

  function closePresetEditor({ restoreFocus = true } = {}) {
    if (!editorOpen || !backdrop) return;
    editorOpen = false;
    backdrop.hidden = true;
    renderErrors([]);
    if (!restoreFocus) return;
    const target = currentGearBtn?.isConnected ? currentGearBtn : returnFocusEl;
    if (target && typeof target.focus === "function") {
      target.focus({ preventScroll: true });
    }
  }

  function ensureDialog() {
    if (backdrop || !hasDom) return;
    backdrop = ctx.el("div", "compass-facets-backdrop");
    backdrop.hidden = true;
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "Facets presets");

    dialogEl = ctx.el("div", "compass-facets-dialog");

    const head = ctx.el("div", "compass-facets-dialog-head");
    const title = ctx.el("h2", "compass-facets-dialog-title", "Facets presets");
    const closeBtn = ctx.button("compass-facets-dialog-close", "×", "Close preset editor");
    head.append(title, closeBtn);

    const body = ctx.el("div", "compass-facets-dialog-body");

    const sidebar = ctx.el("div", "compass-facets-dialog-sidebar");
    const sidebarLabel = ctx.el("div", "compass-facets-section-label", "Presets");
    listEl = ctx.el("div", "compass-facets-preset-list");
    sidebar.append(sidebarLabel, listEl);

    const editorPane = ctx.el("div", "compass-facets-dialog-editor");
    const editorLabel = ctx.el("div", "compass-facets-section-label", "Preset JSON");
    jsonArea = ctx.el("textarea", "compass-facets-json");
    jsonArea.rows = 14;
    jsonArea.spellcheck = false;
    jsonArea.setAttribute("aria-label", "Preset JSON");

    errorsEl = ctx.el("ul", "compass-facets-errors");
    errorsEl.hidden = true;

    const actionRow = ctx.el("div", "compass-facets-editor-actions");
    const saveBtn = ctx.button("compass-facets-save", "Save");
    const cancelBtn = ctx.button("compass-facets-cancel", "Cancel");
    const copyBtn = ctx.button("compass-facets-copy", "Copy JSON");
    const importBtn = ctx.button("compass-facets-import", "Import");
    actionRow.append(saveBtn, cancelBtn, copyBtn, importBtn);

    editorPane.append(editorLabel, jsonArea, errorsEl, actionRow);
    body.append(sidebar, editorPane);
    dialogEl.append(head, body);
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
      if (event.target === backdrop) closePresetEditor();
    });
    register(closeBtn, "click", () => closePresetEditor());
    register(cancelBtn, "click", () => closePresetEditor());
    register(saveBtn, "click", ctx.guard(() => handleSavePreset()));
    register(copyBtn, "click", ctx.guard(async () => {
      const ok = await copyText(jsonArea.value);
      ctx?.setStatus?.(ok ? "Copied preset JSON." : "Could not copy JSON.");
    }));
    register(importBtn, "click", ctx.guard(async () => {
      let clip = "";
      if (typeof globalThis.navigator?.clipboard?.readText === "function") {
        try {
          clip = (await globalThis.navigator.clipboard.readText()) ?? "";
        } catch {
          clip = "";
        }
      }
      if (clip.trim() && clip.trim() !== jsonArea.value.trim()) {
        jsonArea.value = clip;
        loadedJsonSnapshot = "";
        renderErrors([]);
        jsonArea.focus();
        ctx?.setStatus?.("Imported JSON from clipboard. Review and press Save.");
      } else if (jsonArea.value.trim() && jsonArea.value !== loadedJsonSnapshot) {
        await handleSavePreset();
      } else {
        jsonArea.value = "";
        loadedJsonSnapshot = "";
        jsonArea.placeholder = "Paste preset JSON here, then press Save.";
        renderErrors([]);
        jsonArea.focus();
      }
    }));
    register(backdrop, "keydown", (event) => {
      if (!editorOpen) return;
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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.stopPropagation();
        return;
      }
      if (event.target !== jsonArea && event.key !== "Enter" && event.key !== " ") {
        event.stopPropagation();
      }
    });
  }

  function openPresetEditor() {
    ensureDialog();
    if (!backdrop) return;
    returnFocusEl = globalThis.document?.activeElement ?? null;
    const list = allPresets(readCustomList());
    const active = findPreset(list, viewSelection().preset);
    setEditorJson(active.builtin ? uniqueCopyPreset(active, list) : stripBuiltin(active));
    refreshEditorList(active.id);
    backdrop.hidden = false;
    editorOpen = true;
    jsonArea?.focus({ preventScroll: true });
  }

  function drawEdgeCurve(centerBox, itemBox) {
    const dx = itemBox.x - centerBox.x;
    const dy = itemBox.y - centerBox.y;
    if (Math.abs(dy) >= Math.abs(dx)) {
      const dir = dy >= 0 ? 1 : -1;
      const sx = ctx.clamp(itemBox.x, centerBox.x - centerBox.w / 2 + 16, centerBox.x + centerBox.w / 2 - 16);
      const sy = centerBox.y + dir * (centerBox.h / 2);
      const ex = itemBox.x;
      const ey = itemBox.y - dir * (itemBox.h / 2);
      return ctx.curve(sx, sy, ex, ey, true).d;
    }
    const dir = dx >= 0 ? 1 : -1;
    const sx = centerBox.x + dir * (centerBox.w / 2);
    const sy = ctx.clamp(itemBox.y, centerBox.y - centerBox.h / 2 + 12, centerBox.y + centerBox.h / 2 - 12);
    const ex = itemBox.x - dir * (itemBox.w / 2);
    const ey = itemBox.y;
    return ctx.curve(sx, sy, ex, ey, false).d;
  }

  function buildCenterCard(hood, box) {
    const element = ctx.el("div", "compass-node compass-node-center");
    element.dataset.uid = hood.center.uid;
    element.dataset.key = `center:${hood.center.uid}`;
    element.dataset.zone = "center";
    element.dataset.style = "center";
    element.dataset.kind = hood.center.kind;
    element.tabIndex = 0;
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", `Center: ${hood.center.title}`);
    element.title = hood.center.title;

    const head = ctx.el("div", "compass-center-head");
    const kind = ctx.el("span", "compass-kind", hood.center.kind === "block" ? "Block" : "Page");
    const title = ctx.el("span", "compass-node-title", hood.center.title);
    head.append(kind, title);
    element.append(head);
    placeBox(element, box);
    return element;
  }

  function buildHeader(preset, contentBounds) {
    const header = ctx.el("div", "compass-facets-header");
    const row = ctx.el("div", "compass-facets-header-row");
    const title = ctx.el("span", "compass-facets-title", preset.name);

    const helpBtn = ctx.button("compass-facets-help-toggle", "?", "Toggle preset help");
    helpBtn.setAttribute("aria-pressed", helpOpen ? "true" : "false");
    helpBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      helpOpen = !helpOpen;
      ctx?.render?.();
    });

    const gearBtn = ctx.button("compass-facets-gear", "", "Edit presets");
    gearBtn.append(createGearIcon(ctx.svg));
    gearBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPresetEditor();
    });
    currentGearBtn = gearBtn;

    row.append(title, helpBtn, gearBtn);
    header.append(row);

    const helpText = preset.help || "Custom facets preset.";
    if (helpOpen) {
      header.append(ctx.el("p", "compass-facets-help", helpText));
    }

    header.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });

    const reserveH = helpOpen ? 76 : 44;
    const headerX = contentBounds.minX;
    const headerY = contentBounds.minY - reserveH;
    header.style.transform = `translate(${headerX}px, ${headerY}px)`;

    return {
      element: header,
      bounds: {
        minX: Math.min(contentBounds.minX, headerX),
        minY: headerY,
        maxX: Math.max(contentBounds.maxX, headerX + 280),
        maxY: contentBounds.maxY,
      },
    };
  }

  function renderView({ hood, settings }) {
    const state = viewSelection(settings);
    if (state.view !== "facets") {
      clearView();
      return null;
    }
    if (!hood || !layer) return null;

    const list = allPresets(readCustomList(settings));
    const preset = findPreset(list, state.preset);
    const neighbors = (hood.nodes ?? []).filter((node) => node && node.kind !== "group");

    layer.replaceChildren();

    if (neighbors.length === 0) {
      lastClassified = classify(preset, []);
      const centerBox = { x: 0, y: 0, w: 240, h: 56 };
      const emptyEl = ctx.el("p", "compass-facets-empty", "Nothing is connected here yet.");
      emptyEl.style.transform = `translate(-160px, ${centerBox.h / 2 + 28}px)`;
      const rawBounds = { minX: -160, minY: -centerBox.h / 2, maxX: 160, maxY: centerBox.h / 2 + 64 };
      const header = buildHeader(preset, rawBounds);
      layer.append(header.element, buildCenterCard(hood, centerBox), emptyEl);
      return {
        view: "facets",
        geometry: {
          center: centerBox,
          items: [],
          rows: [],
          chips: [],
          more: false,
          bounds: header.bounds,
          nodes: [],
        },
      };
    }

    const queryNodes = hood.center?.uid ? [hood.center, ...neighbors] : neighbors;
    const factsMap = ctx.facts(queryNodes);
    const neighborFacts = neighbors.map((node) => factsMap.get(node.uid)).filter(Boolean);
    const result = classify(preset, neighborFacts);
    lastClassified = result;

    let focusCategory = null;
    if (preset.focusInCategory && hood.center?.uid) {
      const centerFact = factsMap.get(hood.center.uid);
      focusCategory = centerCategory(preset, centerFact, result.categories);
    }

    const expandedRegions = expandedSetFor(hood.center?.uid, preset.id);
    const geo = layoutFacets(result, { focusCategory, expandedRegions });

    if (geo.fallback === "circular" && !warnedFallbacks.has(preset.id)) {
      warnedFallbacks.add(preset.id);
      ctx?.setStatus?.("Quadrants needs four categories. Showing a circle instead.");
    }

    const isConcentric = preset.layout === "concentric" && !geo.fallback;
    const orderedRegions = isConcentric
      ? [
        ...[...geo.regions.filter((reg) => reg.status === null)].reverse(),
        ...geo.regions.filter((reg) => reg.status !== null),
      ]
      : geo.regions;

    const regionContainer = ctx.el("div", "compass-facets-regions");
    for (const reg of orderedRegions) {
      const classes = ["compass-facet-region"];
      if (reg.status) classes.push("compass-facet-region-status");
      if (isConcentric && !reg.status) classes.push("compass-facet-region-ring");
      const regEl = ctx.el("div", classes.join(" "));
      regEl.dataset.paint = "region";
      regEl.dataset.region = reg.id;
      if (reg.status) regEl.dataset.status = reg.status;
      else if (reg.color) regEl.style.setProperty("--compass-facet-color", reg.color);

      const labelEl = ctx.el("div", "compass-region-label");
      const nameSpan = ctx.el("span", "compass-region-name", reg.label);
      const countSpan = ctx.el("span", "compass-region-count", String(reg.count));
      labelEl.append(nameSpan, " ", countSpan);
      regEl.append(labelEl);
      placeBox(regEl, reg);
      regionContainer.append(regEl);
    }
    layer.append(regionContainer);

    if (preset.edges !== false && geo.items.length > 0) {
      const edgeSvg = ctx.svg("svg", "compass-edges compass-facets-edges");
      edgeSvg.setAttribute("width", "1");
      edgeSvg.setAttribute("height", "1");
      for (const item of geo.items) {
        const group = ctx.svg("g", "compass-edge compass-facet-edge");
        group.dataset.uid = item.uid;
        const line = ctx.svg("path", "compass-edge-line");
        line.setAttribute("d", drawEdgeCurve(geo.center, item));
        group.append(line);
        edgeSvg.append(group);
      }
      layer.append(edgeSvg);
    }

    const nodeByUid = new Map(neighbors.map((node) => [node.uid, node]));
    const catLabelById = new Map(result.categories.map((cat) => [cat.id, cat.label]));
    const hiddenByLenses = ctx?.features?.get?.("lenses")?.hiddenFor?.(neighbors);
    const drawnNodes = [];

    layer.append(buildCenterCard(hood, geo.center));

    for (const item of geo.items) {
      const node = nodeByUid.get(item.uid);
      if (!node) continue;
      drawnNodes.push(node);

      const cardEl = ctx.el("div", "compass-node compass-facet-card");
      cardEl.dataset.uid = node.uid;
      cardEl.dataset.key = item.key;
      cardEl.dataset.zone = node.zone;
      cardEl.dataset.region = item.zone;
      cardEl.dataset.style = node.style;
      cardEl.dataset.kind = node.kind;
      cardEl.tabIndex = 0;
      cardEl.setAttribute("role", "button");
      if (hiddenByLenses instanceof Set && hiddenByLenses.has(node.uid)) {
        cardEl.classList.add("compass-fade");
      }

      const visibleTitle = typeof node.alias === "string" && node.alias ? node.alias : node.title;
      cardEl.append(ctx.el("span", "compass-node-title", visibleTitle));

      const matchedIds = result.matches?.[node.uid];
      if (Array.isArray(matchedIds) && matchedIds.length > 1) {
        const matchedLabels = matchedIds.map((id) => catLabelById.get(id) || id).join(", ");
        cardEl.title = `${node.title} — Matches: ${matchedLabels}`;
        cardEl.setAttribute("aria-label", `${node.title}, Conflicting (${matchedLabels})`);
      } else {
        const why = node.label ? ` — ${node.label}` : "";
        cardEl.title = `${node.title}${why}`;
        cardEl.setAttribute("aria-label", `${node.title}${why}`);
      }

      placeBox(cardEl, item);
      layer.append(cardEl);
    }

    for (const slot of geo.more) {
      const moreBtn = ctx.button("compass-facet-more", `+${slot.count} more`, `Show ${slot.count} more`);
      moreBtn.dataset.region = slot.regionId;
      moreBtn.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      moreBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const set = expandedSetFor(hood.center?.uid, preset.id);
        if (set) set.add(slot.regionId);
        ctx?.render?.();
        ctx?.fit?.(true);
      });
      placeBox(moreBtn, slot);
      layer.append(moreBtn);
    }

    const header = buildHeader(preset, geo.bounds);
    layer.prepend(header.element);

    return {
      view: "facets",
      geometry: {
        center: geo.center,
        items: geo.items,
        rows: [],
        chips: [],
        more: false,
        bounds: header.bounds,
        nodes: drawnNodes,
      },
    };
  }

  function commands() {
    const list = allPresets(readCustomList());
    return [
      {
        id: "facets-edit",
        title: "Facets: edit presets",
        hint: "",
        run: () => openPresetEditor(),
      },
      ...list.map((preset) => ({
        id: `facets-preset-${preset.id}`,
        title: `Facets: ${preset.name}`,
        hint: "",
        run: () => selectPreset(preset.id),
      })),
    ];
  }

  function stageMenu() {
    const state = viewSelection();
    if (state.view !== "facets") return [];
    const list = allPresets(readCustomList());
    const active = findPreset(list, state.preset);
    return [
      ...list.map((preset) => {
        const base = `Facets preset: ${preset.name}`;
        return {
          title: preset.id === active.id ? `✓ ${base}` : base,
          run: () => selectPreset(preset.id),
        };
      }),
      {
        title: "Edit presets…",
        run: () => openPresetEditor(),
      },
    ];
  }

  function onEscape() {
    if (!editorOpen) return false;
    closePresetEditor({ restoreFocus: true });
    return true;
  }

  function onClose() {
    closePresetEditor({ restoreFocus: false });
    helpOpen = false;
    clearView();
  }

  function onSettings(settings) {
    if (editorOpen) {
      const list = allPresets(readCustomList(settings));
      const active = findPreset(list, viewSelection(settings).preset);
      refreshEditorList(active.id);
    }
  }

  return {
    name: "facets",
    presets,
    classified,
    openPresetEditor,
    renderView,
    clearView,
    commands,
    stageMenu,
    onEscape,
    onClose,
    onSettings,
  };
}
