import { hiddenUids as quickFilterHiddenUids } from "../../model/batch7.js";
import {
  EXAMPLE_LENSES,
  FIELDS,
  OPERATORS,
  evaluateLenses,
  lensFromJson,
  lensToJson,
  normalizeLenses,
  slugLensId,
  typeFilter,
  typesPresent,
  validateLens,
} from "../../model/lens.js";
import { SETTING_IDS } from "../../settings.js";
import { copyText } from "../clipboard.js";

const VIEW_BUTTONS = [
  ["compass", "Compass"],
  ["mindmap", "Mind Map"],
  ["facets", "Facets"],
];

const KIND_BUTTONS = [
  ["pages", "Pages"],
  ["blocks", "Blocks"],
  ["drawings", "Drawings"],
  ["regions", "Regions"],
];

const COLOR_KEYS = [
  ["fill", "Fill", "#fef3c7"],
  ["border", "Border", "#ea580c"],
  ["text", "Text", "#9a3412"],
];

const EFFECT_LABELS = {
  show: "Show",
  hide: "Hide",
  style: "Style",
};

const OPERATOR_MAP = new Map(OPERATORS.map((item) => [item.op, item]));
const SHORT_HEX = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/;
const FULL_HEX = /^#[0-9a-fA-F]{6}$/;

function pickerHex(raw, fallback) {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (FULL_HEX.test(trimmed)) return trimmed.toLowerCase();
  const short = SHORT_HEX.exec(trimmed);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return fallback;
}

function setCssVar(element, name, value) {
  if (typeof element?.style?.setProperty === "function") element.style.setProperty(name, value);
  else if (element?.style) element.style[name] = value;
}

function removeCssVar(element, name) {
  if (typeof element?.style?.removeProperty === "function") element.style.removeProperty(name);
  else if (element?.style) delete element.style[name];
}

function boxesOverlap(a, b) {
  const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return dx > 1 && dy > 1;
}

function cloneLens(lens) {
  return {
    id: lens.id,
    name: lens.name,
    enabled: Boolean(lens.enabled),
    scope: lens.scope,
    effect: lens.effect,
    match: {
      ...(Array.isArray(lens.match?.all) ? { all: lens.match.all.map((c) => ({ ...c })) } : {}),
      ...(Array.isArray(lens.match?.any) ? { any: lens.match.any.map((c) => ({ ...c })) } : {}),
    },
    style: {
      fill: lens.style?.fill ?? "",
      border: lens.style?.border ?? "",
      text: lens.style?.text ?? "",
    },
  };
}

function conditionToDraft(cond) {
  const rawField = typeof cond?.field === "string" ? cond.field : "title";
  if (rawField.startsWith("attr:")) {
    return {
      field: "attr:",
      attrName: rawField.slice(5),
      op: OPERATOR_MAP.has(cond?.op) ? cond.op : "is",
      value: typeof cond?.value === "string" ? cond.value : "",
    };
  }
  return {
    field: rawField || "title",
    attrName: "",
    op: OPERATOR_MAP.has(cond?.op) ? cond.op : "is",
    value: typeof cond?.value === "string" ? cond.value : "",
  };
}

function makeEditorDraft(lens = null) {
  const scope = lens?.scope === "relationship" ? "relationship" : "node";
  const defaultField = FIELDS[scope][0].field;
  const rawAny = Array.isArray(lens?.match?.any) ? lens.match.any : [];
  const rawAll = Array.isArray(lens?.match?.all) ? lens.match.all : [];
  const matchMode = rawAny.length > 0 && rawAll.length === 0 ? "any" : "all";
  const sourceConds = matchMode === "any" ? rawAny : rawAll;
  const conditions = sourceConds.length
    ? sourceConds.map(conditionToDraft)
    : [{ field: defaultField, attrName: "", op: "is", value: "" }];

  const colors = {};
  for (const [key, , fallback] of COLOR_KEYS) {
    const raw = lens?.style?.[key] ?? "";
    colors[key] = {
      none: !raw,
      picker: pickerHex(raw, fallback),
      raw: raw || fallback,
    };
  }

  return {
    editingId: lens?.id ?? null,
    enabled: lens ? Boolean(lens.enabled) : false,
    name: lens?.name ?? "",
    scope,
    effect: lens?.effect ?? "hide",
    matchMode,
    conditions,
    colors,
    errors: [],
  };
}

export function createLenses(ctx) {
  if (!ctx?.dom?.root) {
    return {
      name: "lenses",
      open() {},
      close() {},
      toggle() {},
      hiddenFor: () => new Set(),
    };
  }

  let lenses = normalizeLenses(ctx.state.settings?.lenses);
  let unfilteredNodes = null;
  const excludedTypes = new Set();
  let panelOpen = false;
  let editorState = null;
  let importState = null;
  let savingCount = 0;

  const barBtn = ctx.button("compass-vl-btn", "", "Views and lenses");
  barBtn.setAttribute("aria-expanded", "false");
  const barBtnText = ctx.el("span", "compass-vl-btn-text", "Views and lenses");
  const badgeEl = ctx.el("span", "compass-vl-badge");
  badgeEl.hidden = true;
  barBtn.append(barBtnText, badgeEl);
  ctx.addBarButton(barBtn);

  const panel = ctx.el("div", "compass-vl-panel");
  panel.hidden = true;
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Views and lenses");

  const head = ctx.el("div", "compass-vl-head");
  const titleEl = ctx.el("p", "compass-vl-title", "Views and lenses");
  const closeBtn = ctx.button("compass-vl-close", "×", "Close panel");
  head.append(titleEl, closeBtn);

  const viewSec = ctx.el("section", "compass-vl-section");
  viewSec.dataset.section = "views";
  const viewHead = ctx.el("div", "compass-vl-section-head");
  viewHead.append(ctx.el("h3", "compass-vl-heading", "Canvas view"));
  const viewSeg = ctx.el("div", "compass-vl-seg");
  const viewBtnMap = new Map();
  for (const [viewId, label] of VIEW_BUTTONS) {
    const btn = ctx.button("", label);
    btn.dataset.view = viewId;
    btn.setAttribute("aria-pressed", "false");
    viewBtnMap.set(viewId, btn);
    viewSeg.append(btn);
  }
  const facetsRow = ctx.el("div", "compass-vl-facets-row");
  facetsRow.hidden = true;
  const presetSelect = ctx.el("select", "compass-vl-preset-select");
  presetSelect.setAttribute("aria-label", "Facets preset");
  const editPresetsBtn = ctx.button("compass-vl-preset-edit", "Edit presets…");
  facetsRow.append(presetSelect, editPresetsBtn);
  viewSec.append(viewHead, viewSeg, facetsRow);

  const qfSec = ctx.el("section", "compass-vl-section");
  qfSec.dataset.section = "quick-filter";
  const qfHead = ctx.el("div", "compass-vl-section-head");
  qfHead.append(ctx.el("h3", "compass-vl-heading", "Quick filter"));
  const clearBtn = ctx.button("compass-qf-clear", "Clear");
  qfHead.append(clearBtn);
  const keywordInput = ctx.el("input", "compass-qf-keyword");
  keywordInput.type = "search";
  keywordInput.autocomplete = "off";
  keywordInput.placeholder = "Filter by title";
  keywordInput.setAttribute("aria-label", "Filter by keyword");
  const kindRow = ctx.el("div", "compass-qf-chips");
  const kindBtnMap = new Map();
  for (const [kindKey, label] of KIND_BUTTONS) {
    const btn = ctx.button("compass-qf-chip", label);
    btn.dataset.kind = kindKey;
    btn.setAttribute("aria-pressed", "true");
    kindBtnMap.set(kindKey, btn);
    kindRow.append(btn);
  }
  const typeRow = ctx.el("div", "compass-qf-types");
  typeRow.hidden = true;
  qfSec.append(qfHead, keywordInput, kindRow, typeRow);

  const reflowSec = ctx.el("section", "compass-vl-section");
  reflowSec.dataset.section = "after-filtering";
  const reflowHead = ctx.el("div", "compass-vl-section-head");
  reflowHead.append(ctx.el("h3", "compass-vl-heading", "After filtering"));
  const radiosWrap = ctx.el("div", "compass-qf-radios");
  const keepLabel = ctx.el("label", "compass-qf-radio");
  const keepRadio = ctx.el("input");
  keepRadio.type = "radio";
  keepRadio.name = "compass-after-filtering";
  keepRadio.value = "keep";
  keepLabel.append(keepRadio, ctx.el("span", "", "Keep layout"));
  const reflowLabel = ctx.el("label", "compass-qf-radio");
  const reflowRadio = ctx.el("input");
  reflowRadio.type = "radio";
  reflowRadio.name = "compass-after-filtering";
  reflowRadio.value = "reflow";
  reflowLabel.append(reflowRadio, ctx.el("span", "", "Reflow"));
  radiosWrap.append(keepLabel, reflowLabel);
  reflowSec.append(reflowHead, radiosWrap);

  const lensesSec = ctx.el("section", "compass-vl-section");
  lensesSec.dataset.section = "lenses";
  const lensesHead = ctx.el("div", "compass-vl-section-head");
  lensesHead.append(ctx.el("h3", "compass-vl-heading", "Lenses"));
  const lensEmpty = ctx.el("p", "compass-gl-empty", "No saved lenses yet.");
  const lensList = ctx.el("div", "compass-gl-list");
  const lensFooter = ctx.el("div", "compass-gl-footer");
  const newLensBtn = ctx.button("compass-gl-new", "New lens");
  const importBtn = ctx.button("compass-gl-import-open", "Import");
  const examplesBtn = ctx.button("compass-gl-examples", "Add examples");
  lensFooter.append(newLensBtn, importBtn, examplesBtn);
  const editorWrap = ctx.el("div", "compass-gl-editor");
  editorWrap.hidden = true;
  const importWrap = ctx.el("div", "compass-gl-import");
  importWrap.hidden = true;
  lensesSec.append(lensesHead, lensEmpty, lensList, lensFooter, editorWrap, importWrap);

  panel.append(head, viewSec, qfSec, reflowSec, lensesSec);
  ctx.lifecycle.node(panel, ctx.dom.root);

  function mapNeighborNodes() {
    const viewName = ctx.dom.root.dataset?.view || "compass";
    const geoNodes = ctx.state.geometry?.nodes;
    if (viewName !== "compass" && !ctx.state.settings?.filterReflow && Array.isArray(geoNodes)) {
      const centerUid = ctx.state.hood?.center?.uid ?? ctx.state.current;
      return geoNodes.filter((node) => node && node.uid !== centerUid);
    }
    return unfilteredNodes ?? ctx.state.hood?.nodes ?? [];
  }

  function activeTypeHidden(facts) {
    if (excludedTypes.size === 0) return typeFilter(facts, new Set());
    const known = new Set();
    for (const entry of typesPresent(facts)) known.add(entry.type);
    const baseNodes = unfilteredNodes ?? ctx.state.hood?.nodes ?? [];
    if (baseNodes.length) {
      for (const entry of typesPresent(ctx.facts(baseNodes))) known.add(entry.type);
    }
    const selected = new Set([...known].filter((type) => !excludedTypes.has(type)));
    if (selected.size === 0) return typeFilter(facts, new Set(["\0none"]));
    return typeFilter(facts, selected);
  }

  function hiddenFor(nodes) {
    const list = Array.isArray(nodes) ? nodes : [];
    if (!list.length) return new Set();
    const out = new Set(quickFilterHiddenUids(list, ctx.state.lens));
    const facts = ctx.facts(list);
    for (const uid of activeTypeHidden(facts)) out.add(uid);
    const { hidden } = evaluateLenses(lenses, facts);
    for (const uid of hidden) out.add(uid);
    return out;
  }

  function refreshCanvas() {
    if (ctx.state.settings?.filterReflow) ctx.rebuild();
    ctx.render();
  }

  async function persistLenses(nextList) {
    lenses = normalizeLenses(nextList);
    savingCount += 1;
    try {
      await ctx.saveSetting(SETTING_IDS.lenses, lenses);
    } finally {
      savingCount -= 1;
    }
    refreshCanvas();
    syncPanel();
  }

  function updateBadge() {
    const candidates = mapNeighborNodes();
    const count = hiddenFor(candidates).size;
    if (count > 0) {
      badgeEl.hidden = false;
      badgeEl.textContent = String(count);
      const label = count === 1 ? "Views and lenses (1 hidden)" : `Views and lenses (${count} hidden)`;
      barBtn.title = label;
      barBtn.setAttribute("aria-label", label);
    } else {
      badgeEl.hidden = true;
      badgeEl.textContent = "";
      barBtn.title = "Views and lenses";
      barBtn.setAttribute("aria-label", "Views and lenses");
    }
  }

  function positionPanel() {
    if (!panelOpen || panel.hidden) return;
    const rootRect = ctx.dom.root.getBoundingClientRect();
    if (!rootRect.width || !rootRect.height) return;
    const btnRect = barBtn.getBoundingClientRect();
    const barRect = ctx.dom.bar.getBoundingClientRect();
    const anchorBottom = btnRect.height > 0 ? btnRect.bottom : barRect.bottom;
    const top = Math.max(8, Math.round(anchorBottom - rootRect.top + 4));
    const maxHeight = Math.max(140, Math.floor(rootRect.height - top - 10));
    panel.style.top = `${top}px`;
    panel.style.maxHeight = `${maxHeight}px`;

    const panelWidth = panel.offsetWidth || 320;
    const panelHeight = Math.min(panel.offsetHeight || 360, maxHeight);
    const minLeft = 8;
    const maxLeft = Math.max(minLeft, Math.floor(rootRect.width - panelWidth - 8));
    const preferred = btnRect.width > 0 ? btnRect.left - rootRect.left : rootRect.width - panelWidth - 12;
    let left = ctx.clamp(Math.round(preferred), minLeft, maxLeft);

    const centerEl = ctx.dom.world.querySelector(".compass-node-center");
    if (centerEl) {
      const cRect = centerEl.getBoundingClientRect();
      if (cRect.width > 0 && cRect.height > 0) {
        const boxAt = (x) => ({
          left: rootRect.left + x,
          right: rootRect.left + x + panelWidth,
          top: rootRect.top + top,
          bottom: rootRect.top + top + panelHeight,
        });
        if (boxesOverlap(boxAt(left), cRect)) {
          const rightClear = !boxesOverlap(boxAt(maxLeft), cRect);
          const leftClear = !boxesOverlap(boxAt(minLeft), cRect);
          if (rightClear && leftClear) {
            left = Math.abs(maxLeft - left) <= Math.abs(minLeft - left) ? maxLeft : minLeft;
          } else if (rightClear) {
            left = maxLeft;
          } else if (leftClear) {
            left = minLeft;
          }
        }
      }
    }
    panel.style.left = `${left}px`;
  }

  function currentViewInfo() {
    const viewsFeature = ctx.features.get("views");
    if (typeof viewsFeature?.current === "function") {
      const info = viewsFeature.current();
      if (info && typeof info.view === "string") return info;
    }
    return {
      view: ctx.state.settings?.view || "compass",
      preset: ctx.state.settings?.facetsPreset || "roles",
    };
  }

  function syncViewsSection() {
    const { view, preset } = currentViewInfo();
    for (const [viewId, btn] of viewBtnMap.entries()) {
      btn.setAttribute("aria-pressed", viewId === view ? "true" : "false");
    }
    if (view !== "facets") {
      facetsRow.hidden = true;
      return;
    }
    facetsRow.hidden = false;
    const facetsFeature = ctx.features.get("facets");
    if (typeof facetsFeature?.presets !== "function") {
      presetSelect.hidden = true;
      presetSelect.replaceChildren();
    } else {
      const presets = facetsFeature.presets() ?? [];
      presetSelect.hidden = false;
      presetSelect.replaceChildren();
      for (const item of presets) {
        if (!item || typeof item.id !== "string") continue;
        const opt = ctx.el("option", "", item.name || item.id);
        opt.value = item.id;
        presetSelect.append(opt);
      }
      if (preset) presetSelect.value = preset;
    }
    editPresetsBtn.hidden = typeof facetsFeature?.openPresetEditor !== "function";
  }

  function syncQuickFilterSection() {
    const currentLens = ctx.state.lens;
    if (keywordInput.value !== currentLens.keyword) {
      keywordInput.value = currentLens.keyword;
    }
    for (const [kindKey, btn] of kindBtnMap.entries()) {
      btn.setAttribute("aria-pressed", currentLens[kindKey] ? "true" : "false");
    }

    const neighbors = mapNeighborNodes();
    const present = neighbors.length ? typesPresent(ctx.facts(neighbors)) : [];
    const hasNamedType = present.some((entry) => entry.type !== "");
    if (!hasNamedType) {
      typeRow.hidden = true;
      typeRow.replaceChildren();
      return;
    }
    typeRow.hidden = false;
    typeRow.replaceChildren();
    for (const entry of present) {
      const labelText = entry.type === "" ? "No type" : entry.type;
      const btn = ctx.button("compass-qf-chip", "");
      btn.dataset.type = entry.type;
      const active = !excludedTypes.has(entry.type);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      btn.setAttribute("aria-label", `Type: ${labelText}`);
      btn.title = `${labelText} (${entry.count})`;
      const nameSpan = ctx.el("span", "compass-qf-type-label", labelText);
      const countSpan = ctx.el("span", "compass-qf-count", String(entry.count));
      btn.append(nameSpan, countSpan);
      btn.addEventListener("click", () => {
        if (excludedTypes.has(entry.type)) excludedTypes.delete(entry.type);
        else excludedTypes.add(entry.type);
        refreshCanvas();
        syncPanel();
      });
      typeRow.append(btn);
    }
  }

  function syncReflowSection() {
    const reflow = Boolean(ctx.state.settings?.filterReflow);
    keepRadio.checked = !reflow;
    reflowRadio.checked = reflow;
  }

  function renderLensList() {
    lensList.replaceChildren();
    lensEmpty.hidden = lenses.length > 0;
    lensList.hidden = lenses.length === 0;
    examplesBtn.hidden = lenses.length > 0;

    for (const lens of lenses) {
      const row = ctx.el("div", "compass-gl-item");
      row.dataset.lensId = lens.id;

      const top = ctx.el("div", "compass-gl-item-top");
      const toggleLabel = ctx.el("label", "compass-gl-toggle-label");
      const checkbox = ctx.el("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(lens.enabled);
      checkbox.setAttribute("aria-label", `Enable ${lens.name}`);
      checkbox.addEventListener("change", ctx.guard(async () => {
        const next = lenses.map((item) => (
          item.id === lens.id ? { ...cloneLens(item), enabled: checkbox.checked } : cloneLens(item)
        ));
        await persistLenses(next);
      }));
      const nameSpan = ctx.el("span", "compass-gl-name", lens.name);
      nameSpan.title = lens.name;
      toggleLabel.append(checkbox, nameSpan);

      const tag = ctx.el("span", "compass-gl-tag");
      if (lens.effect === "style") {
        const swatch = ctx.el("span", "compass-gl-swatch");
        const fill = lens.style?.fill || lens.style?.border || lens.style?.text || "transparent";
        const border = lens.style?.border || lens.style?.text || lens.style?.fill || "";
        setCssVar(swatch, "background-color", fill);
        if (border) setCssVar(swatch, "border-color", border);
        tag.append(swatch);
      }
      tag.append(ctx.el("span", "", EFFECT_LABELS[lens.effect] || lens.effect));
      top.append(toggleLabel, tag);

      const actions = ctx.el("div", "compass-gl-item-actions");
      const editBtn = ctx.button("compass-gl-edit", "Edit");
      editBtn.addEventListener("click", () => {
        importState = null;
        editorState = makeEditorDraft(lens);
        renderLensesMode();
        positionPanel();
      });
      const copyBtn = ctx.button("compass-gl-copy", "Copy JSON");
      copyBtn.addEventListener("click", ctx.guard(async () => {
        const copied = await copyText(lensToJson(lens));
        ctx.setStatus(copied ? "Copied lens JSON." : "Could not copy lens JSON.");
      }));
      const deleteBtn = ctx.button("compass-gl-delete", "Delete");
      deleteBtn.addEventListener("click", ctx.guard(async () => {
        const next = lenses.filter((item) => item.id !== lens.id).map(cloneLens);
        await persistLenses(next);
      }));
      actions.append(editBtn, copyBtn, deleteBtn);

      row.append(top, actions);
      lensList.append(row);
    }
  }

  function renderEditorErrors(errorListEl, errors) {
    errorListEl.replaceChildren();
    if (!errors?.length) {
      errorListEl.hidden = true;
      return;
    }
    errorListEl.hidden = false;
    for (const msg of errors) {
      errorListEl.append(ctx.el("li", "", msg));
    }
  }

  function renderEditor() {
    editorWrap.replaceChildren();
    if (!editorState) return;
    const draft = editorState;

    const nameField = ctx.el("label", "compass-gl-field");
    nameField.append(ctx.el("span", "compass-gl-label", "Name"));
    const nameInput = ctx.el("input");
    nameInput.type = "text";
    nameInput.placeholder = "Lens name";
    nameInput.dataset.editor = "name";
    nameInput.value = draft.name;
    nameInput.addEventListener("input", () => { draft.name = nameInput.value; });
    nameField.append(nameInput);

    const grid = ctx.el("div", "compass-gl-grid2");
    const scopeField = ctx.el("label", "compass-gl-field");
    scopeField.append(ctx.el("span", "compass-gl-label", "Scope"));
    const scopeSelect = ctx.el("select");
    scopeSelect.dataset.editor = "scope";
    for (const [val, text] of [["node", "Node"], ["relationship", "Relationship"]]) {
      const opt = ctx.el("option", "", text);
      opt.value = val;
      scopeSelect.append(opt);
    }
    scopeSelect.value = draft.scope;
    const onScopeChange = () => {
      const nextScope = scopeSelect.value === "relationship" ? "relationship" : "node";
      if (nextScope === draft.scope) return;
      draft.scope = nextScope;
      const allowed = new Set(FIELDS[nextScope].map((item) => item.field));
      for (const cond of draft.conditions) {
        if (!allowed.has(cond.field)) {
          cond.field = FIELDS[nextScope][0].field;
          cond.attrName = "";
        }
      }
      renderConditions();
      positionPanel();
    };
    scopeSelect.addEventListener("change", onScopeChange);
    scopeSelect.addEventListener("input", onScopeChange);
    scopeField.append(scopeSelect);

    const effectField = ctx.el("label", "compass-gl-field");
    effectField.append(ctx.el("span", "compass-gl-label", "Effect"));
    const effectSelect = ctx.el("select");
    effectSelect.dataset.editor = "effect";
    for (const [val, text] of [["show", "Show"], ["hide", "Hide"], ["style", "Style"]]) {
      const opt = ctx.el("option", "", text);
      opt.value = val;
      effectSelect.append(opt);
    }
    effectSelect.value = draft.effect;
    effectField.append(effectSelect);
    grid.append(scopeField, effectField);

    const matchBar = ctx.el("div", "compass-gl-match-bar");
    const matchSelect = ctx.el("select");
    matchSelect.dataset.editor = "match";
    matchSelect.setAttribute("aria-label", "Match mode");
    for (const [val, text] of [["all", "Match all"], ["any", "Match any"]]) {
      const opt = ctx.el("option", "", text);
      opt.value = val;
      matchSelect.append(opt);
    }
    matchSelect.value = draft.matchMode;
    const onMatchChange = () => {
      draft.matchMode = matchSelect.value === "any" ? "any" : "all";
    };
    matchSelect.addEventListener("change", onMatchChange);
    matchSelect.addEventListener("input", onMatchChange);

    const addCondBtn = ctx.button("compass-gl-add-cond", "Add condition");
    addCondBtn.addEventListener("click", () => {
      draft.conditions.push({
        field: FIELDS[draft.scope][0].field,
        attrName: "",
        op: "is",
        value: "",
      });
      renderConditions();
      positionPanel();
    });
    matchBar.append(matchSelect, addCondBtn);

    const condsBox = ctx.el("div", "compass-gl-conds");
    function renderConditions() {
      condsBox.replaceChildren();
      const scopeFields = FIELDS[draft.scope] ?? FIELDS.node;
      const scopeFieldSet = new Set(scopeFields.map((f) => f.field));

      draft.conditions.forEach((cond, index) => {
        const card = ctx.el("div", "compass-gl-cond");
        card.dataset.condIndex = String(index);

        const topRow = ctx.el("div", "compass-gl-cond-top");
        const fieldSelect = ctx.el("select");
        fieldSelect.dataset.cond = "field";
        fieldSelect.setAttribute("aria-label", "Condition field");
        for (const item of scopeFields) {
          const opt = ctx.el("option", "", item.label);
          opt.value = item.field;
          fieldSelect.append(opt);
        }
        if (!scopeFieldSet.has(cond.field)) {
          const extra = ctx.el("option", "", cond.field);
          extra.value = cond.field;
          fieldSelect.append(extra);
        }
        fieldSelect.value = cond.field;

        const opSelect = ctx.el("select");
        opSelect.dataset.cond = "op";
        opSelect.setAttribute("aria-label", "Condition operator");
        for (const item of OPERATORS) {
          const opt = ctx.el("option", "", item.label);
          opt.value = item.op;
          opSelect.append(opt);
        }
        opSelect.value = cond.op;

        const removeBtn = ctx.button("compass-gl-cond-remove", "×", "Remove condition");
        removeBtn.addEventListener("click", () => {
          draft.conditions.splice(index, 1);
          renderConditions();
          positionPanel();
        });
        topRow.append(fieldSelect, opSelect, removeBtn);

        const attrInput = ctx.el("input");
        attrInput.type = "text";
        attrInput.placeholder = "Attribute name";
        attrInput.dataset.cond = "attr";
        attrInput.setAttribute("aria-label", "Attribute name");
        attrInput.value = cond.attrName;
        attrInput.hidden = cond.field !== "attr:";
        attrInput.addEventListener("input", () => { cond.attrName = attrInput.value; });

        const valueInput = ctx.el("input");
        valueInput.type = "text";
        valueInput.placeholder = "Value";
        valueInput.dataset.cond = "value";
        valueInput.setAttribute("aria-label", "Condition value");
        valueInput.value = cond.value;
        valueInput.hidden = !(OPERATOR_MAP.get(cond.op)?.needsValue ?? true);
        valueInput.addEventListener("input", () => { cond.value = valueInput.value; });

        const syncFieldVis = () => {
          cond.field = fieldSelect.value;
          attrInput.hidden = cond.field !== "attr:";
          positionPanel();
        };
        fieldSelect.addEventListener("change", syncFieldVis);
        fieldSelect.addEventListener("input", syncFieldVis);

        const syncOpVis = () => {
          cond.op = opSelect.value;
          valueInput.hidden = !(OPERATOR_MAP.get(cond.op)?.needsValue ?? true);
          positionPanel();
        };
        opSelect.addEventListener("change", syncOpVis);
        opSelect.addEventListener("input", syncOpVis);

        card.append(topRow, attrInput, valueInput);
        condsBox.append(card);
      });
    }
    renderConditions();

    const colorsBox = ctx.el("div", "compass-gl-colors");
    colorsBox.hidden = draft.effect !== "style";
    for (const [key, labelText] of COLOR_KEYS) {
      const state = draft.colors[key];
      const row = ctx.el("div", "compass-gl-color-row");
      row.append(ctx.el("span", "compass-gl-color-title", labelText));

      const controls = ctx.el("div", "compass-gl-color-controls");
      const picker = ctx.el("input", "compass-gl-color-picker");
      picker.type = "color";
      picker.dataset.color = key;
      picker.setAttribute("aria-label", `${labelText} color`);
      picker.value = state.picker;
      picker.dataset.none = state.none ? "true" : "false";

      const noneLabel = ctx.el("label", "compass-gl-none");
      const noneCheck = ctx.el("input");
      noneCheck.type = "checkbox";
      noneCheck.dataset.colorNone = key;
      noneCheck.checked = state.none;
      noneLabel.append(noneCheck, ctx.el("span", "", "None"));

      const onPickerInput = () => {
        state.picker = picker.value;
        state.raw = picker.value;
        state.none = false;
        noneCheck.checked = false;
        picker.dataset.none = "false";
      };
      picker.addEventListener("input", onPickerInput);
      picker.addEventListener("change", onPickerInput);

      noneCheck.addEventListener("change", () => {
        state.none = noneCheck.checked;
        if (!state.none && !state.raw) state.raw = picker.value;
        picker.dataset.none = state.none ? "true" : "false";
      });

      controls.append(picker, noneLabel);
      row.append(controls);
      colorsBox.append(row);
    }

    const onEffectChange = () => {
      draft.effect = effectSelect.value;
      colorsBox.hidden = draft.effect !== "style";
      positionPanel();
    };
    effectSelect.addEventListener("change", onEffectChange);
    effectSelect.addEventListener("input", onEffectChange);

    const errorsEl = ctx.el("ul", "compass-gl-errors");
    renderEditorErrors(errorsEl, draft.errors);

    const formActions = ctx.el("div", "compass-gl-form-actions");
    const cancelBtn = ctx.button("compass-gl-cancel", "Cancel");
    cancelBtn.addEventListener("click", () => {
      editorState = null;
      renderLensesMode();
      positionPanel();
    });
    const saveBtn = ctx.button("compass-gl-save", "Save");
    saveBtn.addEventListener("click", ctx.guard(async () => {
      const takenIds = new Set(
        lenses.filter((item) => item.id !== draft.editingId).map((item) => item.id),
      );
      const id = draft.editingId || slugLensId(draft.name, takenIds);
      const builtConditions = draft.conditions.map((cond) => ({
        field: cond.field === "attr:" ? `attr:${cond.attrName.trim()}` : cond.field,
        op: cond.op,
        value: cond.value,
      }));
      const rawStyle = draft.effect === "style"
        ? {
            fill: draft.colors.fill.none ? "" : draft.colors.fill.raw,
            border: draft.colors.border.none ? "" : draft.colors.border.raw,
            text: draft.colors.text.none ? "" : draft.colors.text.raw,
          }
        : { fill: "", border: "", text: "" };

      const validated = validateLens({
        id,
        name: draft.name,
        enabled: draft.enabled,
        scope: draft.scope,
        effect: draft.effect,
        match: { [draft.matchMode]: builtConditions },
        style: rawStyle,
      });

      if (!validated.ok) {
        draft.errors = validated.errors;
        renderEditorErrors(errorsEl, draft.errors);
        positionPanel();
        return;
      }

      const next = draft.editingId
        ? lenses.map((item) => (item.id === draft.editingId ? validated.lens : cloneLens(item)))
        : [...lenses.map(cloneLens), validated.lens];
      editorState = null;
      await persistLenses(next);
    }));
    formActions.append(cancelBtn, saveBtn);

    editorWrap.append(nameField, grid, matchBar, condsBox, colorsBox, errorsEl, formActions);
  }

  function renderImportBox() {
    importWrap.replaceChildren();
    if (!importState) return;
    const state = importState;

    const areaField = ctx.el("label", "compass-gl-field");
    areaField.append(ctx.el("span", "compass-gl-label", "Paste lens JSON"));
    const area = ctx.el("textarea");
    area.placeholder = '{\n  "name": "My lens",\n  ...\n}';
    area.value = state.text;
    area.addEventListener("input", () => { state.text = area.value; });
    areaField.append(area);

    const errorsEl = ctx.el("ul", "compass-gl-errors");
    renderEditorErrors(errorsEl, state.errors);

    const actions = ctx.el("div", "compass-gl-form-actions");
    const cancelBtn = ctx.button("compass-gl-cancel", "Cancel");
    cancelBtn.addEventListener("click", () => {
      importState = null;
      renderLensesMode();
      positionPanel();
    });
    const submitBtn = ctx.button("compass-gl-save", "Import lens");
    submitBtn.addEventListener("click", ctx.guard(async () => {
      const parsed = lensFromJson(state.text);
      if (!parsed.ok) {
        state.errors = parsed.errors;
        renderEditorErrors(errorsEl, state.errors);
        positionPanel();
        return;
      }
      const taken = new Set(lenses.map((item) => item.id));
      const uniqueId = taken.has(parsed.lens.id)
        ? slugLensId(parsed.lens.id, taken)
        : parsed.lens.id;
      const imported = { ...parsed.lens, id: uniqueId };
      importState = null;
      await persistLenses([...lenses.map(cloneLens), imported]);
    }));
    actions.append(cancelBtn, submitBtn);

    importWrap.append(areaField, errorsEl, actions);
  }

  function renderLensesMode() {
    if (editorState) {
      lensEmpty.hidden = true;
      lensList.hidden = true;
      lensFooter.hidden = true;
      importWrap.hidden = true;
      editorWrap.hidden = false;
      renderEditor();
      return;
    }
    if (importState) {
      lensEmpty.hidden = true;
      lensList.hidden = true;
      lensFooter.hidden = true;
      editorWrap.hidden = true;
      importWrap.hidden = false;
      renderImportBox();
      return;
    }
    editorWrap.hidden = true;
    editorWrap.replaceChildren();
    importWrap.hidden = true;
    importWrap.replaceChildren();
    lensFooter.hidden = false;
    renderLensList();
  }

  function syncPanel() {
    updateBadge();
    if (!panelOpen) return;
    syncViewsSection();
    syncQuickFilterSection();
    syncReflowSection();
    if (!editorState && !importState) renderLensesMode();
    positionPanel();
  }

  function open() {
    panelOpen = true;
    panel.hidden = false;
    barBtn.setAttribute("aria-expanded", "true");
    syncViewsSection();
    syncQuickFilterSection();
    syncReflowSection();
    renderLensesMode();
    positionPanel();
  }

  function close() {
    panelOpen = false;
    editorState = null;
    importState = null;
    panel.hidden = true;
    barBtn.setAttribute("aria-expanded", "false");
  }

  function toggle() {
    if (panelOpen) close();
    else open();
  }

  function clearQuickFilter() {
    excludedTypes.clear();
    keywordInput.value = "";
    ctx.setLens({ pages: true, blocks: true, drawings: true, regions: true, keyword: "" });
    if (ctx.state.settings?.filterReflow) {
      ctx.rebuild();
      ctx.render();
    }
    syncPanel();
  }

  async function setReflow(nextReflow) {
    await ctx.saveSetting(SETTING_IDS.filterReflow, Boolean(nextReflow));
    ctx.rebuild();
    ctx.render();
    syncPanel();
  }

  async function toggleLensById(id) {
    const hit = lenses.find((item) => item.id === id);
    if (!hit) return;
    const next = lenses.map((item) => (
      item.id === id ? { ...cloneLens(item), enabled: !item.enabled } : cloneLens(item)
    ));
    await persistLenses(next);
  }

  ctx.lifecycle.event(barBtn, "click", () => toggle());
  ctx.lifecycle.event(closeBtn, "click", () => close());

  for (const [viewId, btn] of viewBtnMap.entries()) {
    ctx.lifecycle.event(btn, "click", ctx.guard(async () => {
      const viewsFeature = ctx.features.get("views");
      await viewsFeature?.set?.(viewId);
      syncPanel();
    }));
  }

  const onPresetChange = ctx.guard(async () => {
    if (!presetSelect.value) return;
    await ctx.features.get("views")?.set?.("facets", presetSelect.value);
    syncPanel();
  });
  ctx.lifecycle.event(presetSelect, "change", onPresetChange);
  ctx.lifecycle.event(editPresetsBtn, "click", () => {
    ctx.features.get("facets")?.openPresetEditor?.();
  });

  ctx.lifecycle.event(keywordInput, "input", () => {
    ctx.setLens({ keyword: keywordInput.value });
    if (ctx.state.settings?.filterReflow) {
      ctx.rebuild();
      ctx.render();
    }
    syncPanel();
  });

  for (const [kindKey, btn] of kindBtnMap.entries()) {
    ctx.lifecycle.event(btn, "click", () => {
      const nextVal = !ctx.state.lens[kindKey];
      ctx.setLens({ [kindKey]: nextVal });
      if (ctx.state.settings?.filterReflow) {
        ctx.rebuild();
        ctx.render();
      }
      syncPanel();
    });
  }

  ctx.lifecycle.event(clearBtn, "click", () => clearQuickFilter());

  ctx.lifecycle.event(keepRadio, "change", ctx.guard(async () => {
    if (keepRadio.checked) await setReflow(false);
  }));
  ctx.lifecycle.event(reflowRadio, "change", ctx.guard(async () => {
    if (reflowRadio.checked) await setReflow(true);
  }));

  ctx.lifecycle.event(newLensBtn, "click", () => {
    importState = null;
    editorState = makeEditorDraft(null);
    renderLensesMode();
    positionPanel();
  });

  ctx.lifecycle.event(importBtn, "click", () => {
    editorState = null;
    importState = { text: "", errors: [] };
    renderLensesMode();
    positionPanel();
  });

  ctx.lifecycle.event(examplesBtn, "click", ctx.guard(async () => {
    if (lenses.length > 0) return;
    await persistLenses(EXAMPLE_LENSES.map(cloneLens));
  }));

  ctx.lifecycle.event(globalThis, "resize", () => {
    if (panelOpen) positionPanel();
  });

  function onSettings(settings) {
    if (!settings) return;
    if (savingCount === 0) {
      lenses = normalizeLenses(settings.lenses);
    }
    syncPanel();
  }

  function onClose() {
    excludedTypes.clear();
    unfilteredNodes = null;
    close();
    updateBadge();
  }

  function onEscape() {
    if (!panelOpen) return false;
    close();
    return true;
  }

  function transformHood(hood) {
    if (!hood || !Array.isArray(hood.nodes)) return hood;
    unfilteredNodes = [...hood.nodes];
    if (!ctx.state.settings?.filterReflow) return hood;
    const hidden = hiddenFor(hood.nodes);
    if (hidden.size === 0) return hood;
    const remaining = hood.nodes.filter((node) => !hidden.has(node.uid));
    const remainingUids = new Set(remaining.map((node) => node.uid));
    const nextNodes = remaining.map((node) => (
      node.via && !remainingUids.has(node.via) ? { ...node, via: null } : node
    ));
    return { ...hood, nodes: nextNodes };
  }

  function hiddenUids(uids, hood) {
    const nodes = hood?.nodes ?? [];
    if (!nodes.length) return Array.isArray(uids) ? uids : [];
    const out = new Set(Array.isArray(uids) ? uids : []);
    const facts = ctx.facts(nodes);
    for (const uid of activeTypeHidden(facts)) out.add(uid);
    const { hidden } = evaluateLenses(lenses, facts);
    for (const uid of hidden) out.add(uid);
    return [...out];
  }

  function afterRender({ hood, geometry }) {
    const centerUid = hood?.center?.uid ?? ctx.state.current;
    const drawn = Array.isArray(geometry?.nodes) ? geometry.nodes : (hood?.nodes ?? []);
    const neighbors = drawn.filter((node) => node && node.uid !== centerUid);
    const facts = neighbors.length ? ctx.facts(neighbors) : new Map();

    const hidden = new Set(quickFilterHiddenUids(neighbors, ctx.state.lens));
    for (const uid of activeTypeHidden(facts)) hidden.add(uid);
    const evaluated = evaluateLenses(lenses, facts);
    for (const uid of evaluated.hidden) hidden.add(uid);

    for (const element of ctx.dom.world.querySelectorAll(".compass-node[data-uid]")) {
      const uid = element.dataset?.uid;
      const isCenter = uid === centerUid || element.classList.contains("compass-node-center");
      if (isCenter) {
        element.classList.toggle("compass-lensed", false);
        removeCssVar(element, "--compass-lens-fill");
        removeCssVar(element, "--compass-lens-border");
        removeCssVar(element, "--compass-lens-text");
        continue;
      }
      const isHidden = Boolean(uid && hidden.has(uid));
      element.classList.toggle("compass-fade", isHidden);
      const style = !isHidden && uid ? evaluated.styles.get(uid) : null;
      if (style) {
        element.classList.toggle("compass-lensed", true);
        if (style.fill) setCssVar(element, "--compass-lens-fill", style.fill);
        else removeCssVar(element, "--compass-lens-fill");
        if (style.border) setCssVar(element, "--compass-lens-border", style.border);
        else removeCssVar(element, "--compass-lens-border");
        if (style.text) setCssVar(element, "--compass-lens-text", style.text);
        else removeCssVar(element, "--compass-lens-text");
      } else {
        element.classList.toggle("compass-lensed", false);
        removeCssVar(element, "--compass-lens-fill");
        removeCssVar(element, "--compass-lens-border");
        removeCssVar(element, "--compass-lens-text");
      }
    }

    syncPanel();
  }

  function commands() {
    return [
      { id: "lenses-open", title: "Views and lenses", hint: "", run: () => open() },
      { id: "filter-clear", title: "Clear filter", hint: "", run: () => clearQuickFilter() },
      {
        id: "filter-reflow",
        title: "Toggle reflow after filtering",
        hint: "",
        run: ctx.guard(() => setReflow(!ctx.state.settings?.filterReflow)),
      },
      ...lenses.map((lens) => ({
        id: `lens-toggle-${lens.id}`,
        title: `Lens: ${lens.name}`,
        hint: "",
        run: ctx.guard(() => toggleLensById(lens.id)),
      })),
    ];
  }

  return {
    name: "lenses",
    open,
    close,
    toggle,
    hiddenFor,
    onSettings,
    onClose,
    onEscape,
    transformHood,
    hiddenUids,
    afterRender,
    commands,
  };
}
