import { hiddenUids } from "../../model/batch7.js";
import { breadcrumbs, compassOutline, facetsOutline, treeOutline } from "../../model/outline-export.js";
import { fitText, paintPlan } from "../../model/paint.js";
import { copyBlob, copyText, saveBlob } from "../clipboard.js";

function safeFilename(title, ext) {
  const cleaned = String(title ?? "")
    .trim()
    .replace(/[/\\:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .toLowerCase();
  return `compass-${cleaned || "map"}.${ext}`;
}

function getStyle(element) {
  const fn = globalThis.getComputedStyle;
  if (typeof fn !== "function" || !element) return null;
  try {
    return fn(element);
  } catch {
    return null;
  }
}

function nonTransparent(color) {
  if (typeof color !== "string") return null;
  const trimmed = color.trim();
  if (!trimmed || trimmed === "transparent" || trimmed === "none" || trimmed === "rgba(0, 0, 0, 0)") {
    return null;
  }
  return trimmed;
}

function isBoldStyle(style) {
  const weight = style?.fontWeight;
  if (!weight) return false;
  if (weight === "bold" || weight === "bolder") return true;
  const num = Number(weight);
  return Number.isFinite(num) && num >= 600;
}

function fontFromStyle(style, fallback) {
  if (!style) return fallback;
  const size = style.fontSize;
  const family = style.fontFamily;
  if (!size || !family) {
    return typeof style.font === "string" && style.font.trim() ? style.font.trim() : fallback;
  }
  const slope = style.fontStyle && style.fontStyle !== "normal" ? `${style.fontStyle} ` : "";
  const weight = style.fontWeight && style.fontWeight !== "normal" && style.fontWeight !== "400"
    ? `${style.fontWeight} `
    : "";
  return `${slope}${weight}${size} ${family}`;
}

function collectTreeNodes(outline, extraNodes) {
  const map = new Map();
  const add = (node) => {
    if (!node || typeof node.uid !== "string" || !node.uid) return;
    if (!map.has(node.uid)) map.set(node.uid, node);
  };
  for (const node of extraNodes ?? []) add(node);
  const walk = (item) => {
    if (!item || typeof item !== "object") return;
    add(item);
    if (Array.isArray(item.children)) {
      for (const child of item.children) walk(child);
    }
  };
  if (Array.isArray(outline?.parents)) {
    for (const parent of outline.parents) walk(parent);
  }
  if (Array.isArray(outline?.root?.children)) {
    for (const child of outline.root.children) walk(child);
  }
  return [...map.values()];
}

function drawRoundedRect(ctx2d, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r || 0, w / 2, h / 2));
  ctx2d.beginPath();
  if (radius <= 0) {
    ctx2d.rect(x, y, w, h);
  } else if (typeof ctx2d.roundRect === "function") {
    ctx2d.roundRect(x, y, w, h, radius);
  } else {
    ctx2d.moveTo(x + radius, y);
    ctx2d.arcTo(x + w, y, x + w, y + h, radius);
    ctx2d.arcTo(x + w, y + h, x, y + h, radius);
    ctx2d.arcTo(x, y + h, x, y, radius);
    ctx2d.arcTo(x, y, x + w, y, radius);
    ctx2d.closePath();
  }
}

function executePlan(canvas, plan) {
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx2d = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  if (!ctx2d) return false;

  ctx2d.clearRect(0, 0, plan.width, plan.height);

  for (const op of plan.ops) {
    ctx2d.save();
    if (Number.isFinite(op.opacity) && op.opacity < 1) {
      ctx2d.globalAlpha = Math.max(0, op.opacity);
    }
    if (op.op === "rect") {
      drawRoundedRect(ctx2d, op.x, op.y, op.w, op.h, op.radius);
      if (nonTransparent(op.fill)) {
        ctx2d.fillStyle = op.fill;
        ctx2d.fill();
      }
      if (nonTransparent(op.stroke) && op.lineWidth > 0) {
        ctx2d.strokeStyle = op.stroke;
        ctx2d.lineWidth = op.lineWidth;
        if (typeof ctx2d.setLineDash === "function") {
          ctx2d.setLineDash(Array.isArray(op.dash) ? op.dash : []);
        }
        ctx2d.stroke();
      }
    } else if (op.op === "path") {
      if (op.d && nonTransparent(op.stroke) && typeof globalThis.Path2D === "function") {
        const path2d = new globalThis.Path2D(op.d);
        ctx2d.strokeStyle = op.stroke;
        ctx2d.lineWidth = op.lineWidth || 1;
        ctx2d.lineCap = "round";
        ctx2d.lineJoin = "round";
        if (typeof ctx2d.setLineDash === "function") {
          ctx2d.setLineDash(Array.isArray(op.dash) ? op.dash : []);
        }
        ctx2d.stroke(path2d);
      }
    } else if (op.op === "text") {
      ctx2d.font = op.font || "13px sans-serif";
      ctx2d.textAlign = op.align || "left";
      ctx2d.textBaseline = op.baseline || "middle";
      const measure = (text) => (ctx2d.measureText?.(text)?.width ?? text.length * 7);
      const shown = op.maxWidth > 0 ? fitText(op.text, op.maxWidth, measure) : String(op.text ?? "");
      if (shown) {
        if (nonTransparent(op.halo) && op.haloWidth > 0 && typeof ctx2d.strokeText === "function") {
          ctx2d.strokeStyle = op.halo;
          ctx2d.lineWidth = op.haloWidth;
          ctx2d.lineJoin = "round";
          ctx2d.miterLimit = 2;
          ctx2d.strokeText(shown, op.x, op.y);
        }
        ctx2d.fillStyle = op.color || "#000000";
        ctx2d.fillText(shown, op.x, op.y);
      }
    }
    ctx2d.restore();
  }
  return true;
}

function canvasToPngBlob(canvas) {
  if (!canvas || typeof canvas.toBlob !== "function") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob || null), "image/png");
    } catch {
      resolve(null);
    }
  });
}

function withClipboardTimeout(promise, timeoutMs = 250) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, timeoutMs);
    timer?.unref?.();
    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(Boolean(value));
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
}

export function createExport(ctx) {
  if (!ctx?.dom?.root) {
    return {
      name: "export",
      openOutline() {},
      openImage() {},
      copyBreadcrumbs() {
        return Promise.resolve(false);
      },
    };
  }

  const { el, button, lifecycle, dom, state } = ctx;

  const barBtn = button("compass-export-btn", "Export image", "Export image");
  ctx.addBarButton(barBtn);

  const backdrop = el("div", "compass-export-backdrop");
  backdrop.hidden = true;
  lifecycle.node(backdrop, dom.root);

  const localVisits = [];
  let activeMode = null;
  let returnFocusEl = null;
  let previewUrl = null;
  let renderToken = 0;

  function revokePreviewUrl() {
    if (!previewUrl) return;
    const url = previewUrl;
    previewUrl = null;
    try {
      globalThis.URL?.revokeObjectURL?.(url);
    } catch {
      // Best effort.
    }
  }

  function closeDialog({ restoreFocus = true } = {}) {
    if (!activeMode && backdrop.hidden) return;
    renderToken += 1;
    revokePreviewUrl();
    activeMode = null;
    backdrop.hidden = true;
    backdrop.replaceChildren();
    const prev = returnFocusEl;
    returnFocusEl = null;
    if (!restoreFocus) return;
    if (prev && prev.isConnected && dom.root.contains(prev) && typeof prev.focus === "function") {
      prev.focus({ preventScroll: true });
    } else if (state.isOpen && typeof dom.stage?.focus === "function") {
      dom.stage.focus({ preventScroll: true });
    }
  }

  function prepareDialog(mode) {
    ctx.hideFloating?.();
    if (!activeMode) {
      returnFocusEl = globalThis.document?.activeElement ?? null;
    }
    renderToken += 1;
    revokePreviewUrl();
    activeMode = mode;
    backdrop.replaceChildren();
    backdrop.hidden = false;
  }

  function renderWarnings(listEl, items) {
    listEl.replaceChildren();
    const valid = (items ?? []).filter((item) => typeof item === "string" && item.trim());
    listEl.hidden = valid.length === 0;
    for (const note of valid) {
      listEl.append(el("li", "compass-export-warning", note));
    }
  }

  function hiddenNodesFor(nodes) {
    const lenses = ctx.features?.get?.("lenses");
    if (typeof lenses?.hiddenFor === "function") {
      const hidden = lenses.hiddenFor(nodes);
      if (hidden instanceof Set) return hidden;
      if (Array.isArray(hidden)) return new Set(hidden);
    }
    return new Set(hiddenUids(nodes, state.lens));
  }

  function buildCurrentOutline(labelsMode) {
    const warnings = [];
    const hood = state.hood;
    const view = ctx.features?.get?.("views")?.current?.()?.view ?? "compass";

    if (view === "mindmap") {
      const tree = ctx.features?.get?.("mindmap")?.outline?.();
      if (tree && tree.root) {
        const hidden = hiddenNodesFor(collectTreeNodes(tree, hood?.nodes));
        const md = treeOutline(tree, { labels: labelsMode, hidden, warnings });
        if (md) return { markdown: md, warnings };
      }
    } else if (view === "facets") {
      const classified = ctx.features?.get?.("facets")?.classified?.();
      if (classified && hood?.center) {
        const hidden = hiddenNodesFor(hood.nodes ?? []);
        const nodesByUid = new Map((hood.nodes ?? []).map((node) => [node.uid, node]));
        const md = facetsOutline(classified, nodesByUid, hood.center, {
          labels: labelsMode,
          hidden,
          warnings: [],
        });
        if (md) {
          warnings.length = 0;
          const finalMd = facetsOutline(classified, nodesByUid, hood.center, {
            labels: labelsMode,
            hidden,
            warnings,
          });
          return { markdown: finalMd, warnings };
        }
      }
    }

    const hidden = hiddenNodesFor(hood?.nodes ?? []);
    const markdown = compassOutline(hood, { labels: labelsMode, hidden, warnings });
    return { markdown, warnings };
  }

  function openOutline() {
    prepareDialog("outline");

    let labelsMode = "visible";
    let currentMarkdown = "";

    const dialog = el("div", "compass-export-dialog compass-export-dialog-outline");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Export outline as Markdown");

    const head = el("div", "compass-export-head");
    head.append(el("h2", "compass-export-title", "Export outline as Markdown"));

    const controls = el("div", "compass-export-controls");
    const labelGroup = el("div", "compass-export-group");
    labelGroup.append(el("span", "compass-export-group-label", "Labels"));
    const seg = el("div", "compass-export-seg");
    const labelOptions = [
      ["none", "No labels"],
      ["visible", "Labels shown on the map"],
      ["all", "All relationship labels"],
    ];
    const modeButtons = new Map();
    for (const [mode, title] of labelOptions) {
      const btn = button("compass-export-seg-btn", title);
      btn.dataset.labels = mode;
      btn.setAttribute("aria-pressed", mode === labelsMode ? "true" : "false");
      btn.addEventListener("click", () => {
        if (labelsMode === mode) return;
        labelsMode = mode;
        for (const [key, item] of modeButtons) {
          item.setAttribute("aria-pressed", key === labelsMode ? "true" : "false");
        }
        refreshOutline();
      });
      modeButtons.set(mode, btn);
      seg.append(btn);
    }
    labelGroup.append(seg);
    controls.append(labelGroup);

    const preview = el("pre", "compass-export-preview");
    preview.tabIndex = 0;
    preview.setAttribute("aria-label", "Markdown preview");

    const warningsEl = el("ul", "compass-export-warnings");
    warningsEl.hidden = true;

    const actions = el("div", "compass-export-actions");
    const copyBtn = button("compass-export-primary compass-export-copy-md", "Copy Markdown");
    const saveBtn = button("compass-export-save-md", "Save .md");
    const closeBtn = button("compass-export-close", "Close");

    copyBtn.addEventListener("click", ctx.guard(async () => {
      const ok = await withClipboardTimeout(copyText(currentMarkdown));
      if (ok) {
        ctx.setStatus?.("Outline copied");
      } else {
        ctx.setStatus?.("Could not copy the outline.");
      }
    }));

    saveBtn.addEventListener("click", () => {
      const blob = new Blob([currentMarkdown], { type: "text/markdown;charset=utf-8" });
      const filename = safeFilename(state.hood?.center?.title || "outline", "md");
      const ok = saveBlob(blob, filename);
      ctx.setStatus?.(ok ? `Saved ${filename}` : "Could not save the file.");
    });

    closeBtn.addEventListener("click", () => closeDialog());

    actions.append(copyBtn, saveBtn, closeBtn);
    dialog.append(head, controls, preview, warningsEl, actions);
    backdrop.append(dialog);

    function refreshOutline() {
      const built = buildCurrentOutline(labelsMode);
      currentMarkdown = built.markdown;
      preview.textContent = currentMarkdown;
      renderWarnings(warningsEl, built.warnings);
      const empty = !currentMarkdown;
      copyBtn.disabled = empty;
      saveBtn.disabled = empty;
    }

    refreshOutline();
    copyBtn.focus?.({ preventScroll: true });
  }

  function resolvePaper() {
    const rootStyle = getStyle(dom.root);
    const bg = nonTransparent(rootStyle?.backgroundColor);
    if (bg) return bg;
    const custom = rootStyle?.getPropertyValue?.("--compass-paper")?.trim() ?? "";
    if (custom && custom !== "Canvas" && custom !== "transparent") return custom;
    return dom.root.dataset?.tone === "dark" ? "#182026" : "#ffffff";
  }

  function isVisibleInWorld(element) {
    let cur = element;
    while (cur && cur !== dom.world) {
      if (cur.hidden === true) return false;
      const cs = getStyle(cur);
      if (cs && (cs.display === "none" || cs.visibility === "hidden")) return false;
      cur = cur.parentElement ?? null;
    }
    return true;
  }

  function effectiveOpacity(element, ignoreEntryZero = false) {
    let opacity = 1;
    let cur = element;
    while (cur && cur !== dom.world) {
      if (ignoreEntryZero && cur === element && cur.style?.opacity === "0") {
        if (cur.classList?.contains("compass-fade")) opacity *= 0.15;
      } else {
        const raw = parseFloat(getStyle(cur)?.opacity);
        if (Number.isFinite(raw)) opacity *= raw;
      }
      cur = cur.parentElement ?? null;
    }
    return opacity;
  }

  function collectScene() {
    dom.root.classList?.add?.("compass-export-measuring");
    try {
      const zoom = Number(state.zoom) > 0 ? state.zoom : 1;
      const panX = Number(state.panX) || 0;
      const panY = Number(state.panY) || 0;
      const stageRect = dom.stage.getBoundingClientRect();
      const stageW = stageRect.width || 800;
      const stageH = stageRect.height || 600;
      const stageCenterX = stageRect.left + stageW / 2;
      const stageCenterY = stageRect.top + stageH / 2;

      const toWorldRect = (rect) => ({
        x: (rect.left - stageCenterX - panX) / zoom,
        y: (rect.top - stageCenterY - panY) / zoom,
        w: rect.width / zoom,
        h: rect.height / zoom,
      });

      const paper = resolvePaper();
      const defaultInk = dom.root.dataset?.tone === "dark" ? "#f5f8fa" : "#182026";
      const viewport = {
        x: (-stageW / 2 - panX) / zoom,
        y: (-stageH / 2 - panY) / zoom,
        w: stageW / zoom,
        h: stageH / zoom,
      };

      const regularBoxes = [];
      const centerBoxes = [];
      for (const nodeEl of dom.world.querySelectorAll(".compass-node")) {
        if (!isVisibleInWorld(nodeEl)) continue;
        let pendingTarget = null;
        if (nodeEl.dataset?.target) {
          try {
            pendingTarget = JSON.parse(nodeEl.dataset.target);
          } catch {
            pendingTarget = null;
          }
        }
        const opacity = effectiveOpacity(nodeEl, Boolean(pendingTarget));
        if (opacity <= 0.02) continue;

        let wr = null;
        if (
          pendingTarget
          && Number.isFinite(pendingTarget.x)
          && Number.isFinite(pendingTarget.y)
          && Number.isFinite(pendingTarget.w)
          && Number.isFinite(pendingTarget.h)
          && pendingTarget.w > 0
          && pendingTarget.h > 0
        ) {
          wr = {
            x: pendingTarget.x - pendingTarget.w / 2,
            y: pendingTarget.y - pendingTarget.h / 2,
            w: pendingTarget.w,
            h: pendingTarget.h,
          };
        } else {
          const rect = nodeEl.getBoundingClientRect();
          if (!(rect.width > 0) || !(rect.height > 0)) continue;
          wr = toWorldRect(rect);
        }

        const isCenter = Boolean(nodeEl.classList?.contains("compass-node-center"));
        const titleEl = nodeEl.querySelector?.(".compass-node-title") ?? null;
        const text = (titleEl ? titleEl.textContent : nodeEl.textContent)?.trim() ?? "";

        const cs = getStyle(nodeEl);
        const tcs = titleEl ? (getStyle(titleEl) ?? cs) : cs;
        const borderStyle = cs?.borderTopStyle || cs?.borderStyle || "solid";
        const borderWidth = parseFloat(cs?.borderTopWidth || cs?.borderWidth) || (isCenter ? 2 : 1);
        const hasBorder = borderStyle !== "none" && borderWidth > 0;
        const dashed = !hasBorder
          ? false
          : borderStyle === "dashed"
            ? "dashed"
            : borderStyle === "dotted"
              ? "dotted"
              : false;

        const box = {
          ...wr,
          text,
          fill: nonTransparent(cs?.backgroundColor) ?? paper,
          stroke: hasBorder ? (nonTransparent(cs?.borderTopColor || cs?.borderColor) ?? defaultInk) : null,
          borderWidth,
          color: nonTransparent(tcs?.color || cs?.color) ?? defaultInk,
          dashed,
          radius: parseFloat(cs?.borderTopLeftRadius || cs?.borderRadius) || (isCenter ? 8 : 6),
          bold: isBoldStyle(tcs) || isCenter,
          opacity,
          font: fontFromStyle(tcs, isCenter ? "600 15px sans-serif" : "13px sans-serif"),
          padX: isCenter ? 12 : Math.max(6, parseFloat(cs?.paddingLeft) || 10),
        };
        if (isCenter) centerBoxes.push(box);
        else regularBoxes.push(box);
      }

      const paths = [];
      for (const pathEl of dom.world.querySelectorAll("path.compass-edge-line")) {
        if (!isVisibleInWorld(pathEl)) continue;
        const opacity = effectiveOpacity(pathEl);
        if (opacity <= 0.02) continue;
        const d = pathEl.getAttribute?.("d") ?? "";
        if (!d.trim()) continue;
        const cs = getStyle(pathEl);
        const stroke = nonTransparent(cs?.stroke) ?? nonTransparent(pathEl.getAttribute?.("stroke"));
        if (!stroke) continue;
        const width = parseFloat(cs?.strokeWidth || pathEl.getAttribute?.("stroke-width")) || 1.25;
        const dashRaw = cs?.strokeDasharray || pathEl.getAttribute?.("stroke-dasharray") || "";
        const dashed = dashRaw && dashRaw !== "none" ? dashRaw : false;
        paths.push({ d, stroke, width, dashed, opacity });
      }

      const labels = [];
      for (const textEl of dom.world.querySelectorAll("text.compass-edge-label")) {
        if (!isVisibleInWorld(textEl)) continue;
        const opacity = effectiveOpacity(textEl);
        if (opacity <= 0.02) continue;
        const text = textEl.textContent?.trim() ?? "";
        if (!text) continue;
        const attrX = parseFloat(textEl.getAttribute?.("x"));
        const attrY = parseFloat(textEl.getAttribute?.("y"));
        let x = attrX;
        let y = attrY;
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          const wr = toWorldRect(textEl.getBoundingClientRect());
          x = wr.x + wr.w / 2;
          y = wr.y + wr.h / 2;
        }
        const cs = getStyle(textEl);
        const color = nonTransparent(cs?.fill) ?? nonTransparent(cs?.color) ?? defaultInk;
        const anchor = cs?.textAnchor || textEl.getAttribute?.("text-anchor") || "middle";
        const align = anchor === "end" ? "right" : anchor === "start" ? "left" : "center";
        labels.push({
          x,
          y,
          text,
          color,
          font: fontFromStyle(cs, "11px sans-serif"),
          align,
          opacity,
        });
      }

      const regions = [];
      for (const regEl of dom.world.querySelectorAll('[data-paint="region"]')) {
        if (!isVisibleInWorld(regEl)) continue;
        const opacity = effectiveOpacity(regEl);
        if (opacity <= 0.02) continue;
        const rect = regEl.getBoundingClientRect();
        if (!(rect.width > 0) || !(rect.height > 0)) continue;
        const wr = toWorldRect(rect);
        const cs = getStyle(regEl);
        const borderStyle = cs?.borderTopStyle || cs?.borderStyle || "solid";
        const borderWidth = parseFloat(cs?.borderTopWidth || cs?.borderWidth) || 0;
        const hasBorder = borderStyle !== "none" && borderWidth > 0;
        const labelEl = regEl.querySelector?.(".compass-region-label") ?? null;
        const lcs = labelEl ? (getStyle(labelEl) ?? cs) : cs;
        regions.push({
          ...wr,
          fill: nonTransparent(cs?.backgroundColor),
          stroke: hasBorder ? nonTransparent(cs?.borderTopColor || cs?.borderColor) : null,
          width: borderWidth || 1,
          dashed: !hasBorder
            ? false
            : borderStyle === "dashed"
              ? "dashed"
              : borderStyle === "dotted"
                ? "dotted"
                : false,
          radius: parseFloat(cs?.borderTopLeftRadius || cs?.borderRadius) || 0,
          label: labelEl?.textContent?.trim() ?? "",
          color: nonTransparent(lcs?.color || cs?.color) ?? defaultInk,
          font: fontFromStyle(lcs, "600 12px sans-serif"),
          opacity,
        });
      }

      return {
        boxes: [...regularBoxes, ...centerBoxes],
        paths,
        regions,
        labels,
        bounds: state.geometry?.bounds ?? null,
        viewport,
        paper,
      };
    } finally {
      dom.root.classList?.remove?.("compass-export-measuring");
    }
  }

  function openImage() {
    prepareDialog("image");

    let scope = "all";
    let scale = 2;
    let transparent = false;
    let currentBlob = null;
    let lastPlanWarnings = [];

    const dialog = el("div", "compass-export-dialog compass-export-dialog-image");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Export image");

    const head = el("div", "compass-export-head");
    head.append(el("h2", "compass-export-title", "Export image"));
    const metaEl = el("span", "compass-export-meta", "");
    head.append(metaEl);

    const controls = el("div", "compass-export-controls");

    const scopeGroup = el("div", "compass-export-group");
    scopeGroup.append(el("span", "compass-export-group-label", "Area"));
    const scopeSeg = el("div", "compass-export-seg");
    const scopeButtons = new Map();
    for (const [val, label] of [["all", "Whole canvas"], ["viewport", "Current viewport"]]) {
      const btn = button("compass-export-seg-btn", label);
      btn.dataset.scope = val;
      btn.setAttribute("aria-pressed", val === scope ? "true" : "false");
      btn.addEventListener("click", () => {
        if (scope === val) return;
        scope = val;
        for (const [k, b] of scopeButtons) b.setAttribute("aria-pressed", k === scope ? "true" : "false");
        void renderImagePreview();
      });
      scopeButtons.set(val, btn);
      scopeSeg.append(btn);
    }
    scopeGroup.append(scopeSeg);

    const scaleGroup = el("div", "compass-export-group");
    scaleGroup.append(el("span", "compass-export-group-label", "Scale"));
    const scaleSeg = el("div", "compass-export-seg");
    const scaleButtons = new Map();
    for (const val of [1, 2, 3]) {
      const btn = button("compass-export-seg-btn", `${val}×`);
      btn.dataset.scale = String(val);
      btn.setAttribute("aria-pressed", val === scale ? "true" : "false");
      btn.addEventListener("click", () => {
        if (scale === val) return;
        scale = val;
        for (const [k, b] of scaleButtons) b.setAttribute("aria-pressed", k === scale ? "true" : "false");
        void renderImagePreview();
      });
      scaleButtons.set(val, btn);
      scaleSeg.append(btn);
    }
    scaleGroup.append(scaleSeg);

    const transparentBtn = button("compass-export-toggle compass-export-transparent", "Transparent background");
    transparentBtn.setAttribute("aria-pressed", "false");
    transparentBtn.addEventListener("click", () => {
      transparent = !transparent;
      transparentBtn.setAttribute("aria-pressed", transparent ? "true" : "false");
      void renderImagePreview();
    });

    controls.append(scopeGroup, scaleGroup, transparentBtn);

    const frameEl = el("div", "compass-export-image-frame");
    frameEl.dataset.transparent = "false";
    const previewImg = el("img", "compass-export-image-preview");
    previewImg.alt = "Map preview";
    previewImg.hidden = true;
    frameEl.append(previewImg);

    const warningsEl = el("ul", "compass-export-warnings");
    warningsEl.hidden = true;

    const actions = el("div", "compass-export-actions");
    const copyBtn = button("compass-export-primary compass-export-copy-png", "Copy PNG");
    const saveBtn = button("compass-export-save-png", "Save PNG");
    const closeBtn = button("compass-export-close", "Close");
    copyBtn.disabled = true;
    saveBtn.disabled = true;

    copyBtn.addEventListener("click", ctx.guard(async () => {
      if (!currentBlob) return;
      const ok = await withClipboardTimeout(copyBlob(currentBlob));
      if (ok) {
        closeDialog();
        ctx.setStatus?.("Image copied");
      } else {
        const msg = "Copying images is not supported here. Use Save.";
        renderWarnings(warningsEl, [...lastPlanWarnings, msg]);
        ctx.setStatus?.(msg);
      }
    }));

    saveBtn.addEventListener("click", () => {
      if (!currentBlob) return;
      const filename = safeFilename(state.hood?.center?.title || "map", "png");
      const ok = saveBlob(currentBlob, filename);
      ctx.setStatus?.(ok ? `Saved ${filename}` : "Could not save the image.");
    });

    closeBtn.addEventListener("click", () => closeDialog());

    actions.append(copyBtn, saveBtn, closeBtn);
    dialog.append(head, controls, frameEl, warningsEl, actions);
    backdrop.append(dialog);

    async function renderImagePreview() {
      const token = ++renderToken;
      currentBlob = null;
      copyBtn.disabled = true;
      saveBtn.disabled = true;
      previewImg.dataset.rendering = "true";
      previewImg.dataset.decoded = "false";
      frameEl.dataset.transparent = transparent ? "true" : "false";

      const scene = collectScene();
      const plan = paintPlan({
        ...scene,
        scope,
        scale,
        transparent,
      });
      lastPlanWarnings = plan.warnings;
      metaEl.textContent = `${plan.width} × ${plan.height} px`;

      const doc = globalThis.document;
      const canvas = typeof doc?.createElement === "function" ? doc.createElement("canvas") : null;
      let painted = false;
      if (canvas && typeof canvas.toBlob === "function") {
        try {
          painted = executePlan(canvas, plan);
        } catch {
          painted = false;
        }
      }

      if (!painted) {
        revokePreviewUrl();
        previewImg.hidden = true;
        previewImg.dataset.rendering = "false";
        previewImg.removeAttribute("src");
        renderWarnings(warningsEl, [...plan.warnings, "This browser could not make the image."]);
        return;
      }

      const blob = await canvasToPngBlob(canvas);
      if (token !== renderToken) return;

      const createUrl = globalThis.URL?.createObjectURL;
      if (!blob || typeof createUrl !== "function") {
        revokePreviewUrl();
        previewImg.hidden = true;
        previewImg.dataset.rendering = "false";
        previewImg.removeAttribute("src");
        renderWarnings(warningsEl, [...plan.warnings, "This browser could not make the image."]);
        return;
      }

      revokePreviewUrl();
      currentBlob = blob;
      previewUrl = createUrl.call(globalThis.URL, blob);
      const onDecoded = () => {
        if (token === renderToken) {
          previewImg.dataset.decoded = "true";
        }
      };
      previewImg.onload = onDecoded;
      previewImg.onerror = onDecoded;
      previewImg.dataset.width = String(plan.width);
      previewImg.dataset.height = String(plan.height);
      previewImg.src = previewUrl;
      previewImg.hidden = false;
      previewImg.dataset.rendering = "false";
      copyBtn.disabled = false;
      saveBtn.disabled = false;
      renderWarnings(warningsEl, plan.warnings);
    }

    void renderImagePreview();
    closeBtn.focus?.({ preventScroll: true });
  }

  async function copyBreadcrumbs() {
    const trail = ctx.features?.get?.("trail");
    let md = "";
    let count = 0;

    if (typeof trail?.markdown === "function") {
      md = String(trail.markdown() ?? "").trim();
      const entries = typeof trail?.entries === "function" ? trail.entries() : null;
      if (Array.isArray(entries)) {
        count = entries.length;
      } else if (md) {
        count = md.split("\n").filter((line) => line.trim().length > 0).length;
      }
    } else if (typeof trail?.entries === "function") {
      const entries = trail.entries();
      if (Array.isArray(entries) && entries.length > 0) {
        count = entries.length;
        md = breadcrumbs(entries);
      }
    } else if (localVisits.length > 0) {
      count = localVisits.length;
      md = breadcrumbs(localVisits);
    }

    if (!md || count === 0) {
      ctx.setStatus?.("There is no trail yet.");
      return false;
    }

    const ok = await withClipboardTimeout(copyText(md));
    const word = count === 1 ? "visit" : "visits";
    if (ok) {
      ctx.setStatus?.(`Copied ${count} ${word}`);
    } else {
      ctx.setStatus?.(`Could not copy ${count} ${word}.`);
    }
    return ok;
  }

  function onNavigate(info) {
    const uid = info?.uid;
    if (typeof uid !== "string" || !uid) return;
    const nextAt = Math.max(Date.now(), (localVisits[0]?.at ?? 0) + 1);
    if (localVisits[0]?.uid === uid) {
      localVisits[0].at = nextAt;
      return;
    }
    const existingIdx = localVisits.findIndex((item) => item.uid === uid);
    const prev = existingIdx >= 0 ? localVisits.splice(existingIdx, 1)[0] : null;
    localVisits.unshift({
      uid,
      title: ctx.titleOf?.(uid) || prev?.title || uid,
      kind: ctx.nodeKind?.(uid) || prev?.kind || "page",
      at: nextAt,
    });
    if (localVisits.length > 100) localVisits.length = 100;
  }

  function afterRender(info) {
    const center = info?.hood?.center;
    if (!center?.uid) return;
    const hit = localVisits.find((item) => item.uid === center.uid);
    if (hit) {
      if (center.title) hit.title = center.title;
      if (center.kind) hit.kind = center.kind;
    }
  }

  function onEscape() {
    if (!activeMode || backdrop.hidden) return false;
    closeDialog();
    return true;
  }

  function onClose() {
    closeDialog({ restoreFocus: false });
  }

  function stageMenu() {
    return [
      { title: "Export outline as Markdown…", run: () => openOutline() },
      { title: "Export image…", run: () => openImage() },
      { title: "Copy breadcrumbs as Markdown", run: () => copyBreadcrumbs() },
    ];
  }

  function commands() {
    return [
      { id: "export-outline", title: "Export outline as Markdown…", hint: "", run: () => openOutline() },
      { id: "export-image", title: "Export image…", hint: "", run: () => openImage() },
      { id: "export-breadcrumbs", title: "Copy breadcrumbs as Markdown", hint: "", run: () => copyBreadcrumbs() },
    ];
  }

  lifecycle.event(barBtn, "click", ctx.guard(() => openImage()));
  lifecycle.event(backdrop, "click", (event) => {
    if (event.target === backdrop) closeDialog();
  });
  lifecycle.add(() => {
    revokePreviewUrl();
  });

  return {
    name: "export",
    openOutline,
    openImage,
    copyBreadcrumbs,
    onNavigate,
    afterRender,
    onEscape,
    onClose,
    stageMenu,
    commands,
  };
}
