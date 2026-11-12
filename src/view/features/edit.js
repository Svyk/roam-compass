import { describeRelation, planFlipOwner, planUnlink } from "../../model/edit.js";
import { inverseRole } from "../../model/neighborhood.js";
import { inverseAttribute } from "../../model/ontology.js";
import { parseAttribute } from "../../model/text.js";

const REASONS = Object.freeze({
  changed: "That block changed in Roam. Compass reloaded it; try again.",
  missing: "The source block is gone. Compass reloaded.",
  "missing-value": "That value is no longer in its block. Compass reloaded.",
  "read-only": "That attribute belongs to another plugin. Compass reloaded.",
  "text-value": "That value is plain text, not a link. Compass reloaded.",
  "not-pages": "Both ends must be pages to move a relation. Compass reloaded.",
  "no-attribute": "No matching attribute is set for the other page. Compass reloaded.",
  "target-text": "The attribute on the other page holds plain text. Compass reloaded.",
  locked: "Another Roam tab is writing this block. Compass reloaded.",
  forbidden: "Refused a write that touched derived attribute data. Compass reloaded.",
  empty: "Nothing needed to be written. Compass reloaded.",
});

const GENERIC_FAILURE = "The write failed. Compass reloaded.";

function reasonMessage(reason) {
  return REASONS[reason] ?? GENERIC_FAILURE;
}

function evidenceKey(entry) {
  return `${entry.kind ?? ""}:${entry.direction ?? ""}:${entry.attribute ?? ""}:${entry.sourceUid ?? ""}:${entry.note ?? ""}`;
}

function countOtherEvidence(node, targetItem) {
  if (!Array.isArray(node?.evidence)) return 0;
  const seen = new Set([evidenceKey(targetItem)]);
  let count = 0;
  for (const entry of node.evidence) {
    if (!entry) continue;
    const key = evidenceKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    count += 1;
  }
  return count;
}

function isLinkablePage(endpoint) {
  return endpoint?.kind === "page"
    && typeof endpoint.uid === "string"
    && Boolean(endpoint.uid)
    && typeof endpoint.title === "string"
    && Boolean(endpoint.title.trim())
    && !endpoint.title.includes("[")
    && !endpoint.title.includes("]");
}

export function createEdit(ctx) {
  let pending = null;
  let busy = false;
  let backdrop = null;
  let titleEl = null;
  let bodyEl = null;
  let cancelBtn = null;
  let confirmBtn = null;

  function ensureDialog() {
    if (backdrop || !ctx?.dom?.root || typeof ctx.el !== "function") return backdrop;
    backdrop = ctx.el("div", "compass-edit-backdrop");
    backdrop.hidden = true;
    const dialog = ctx.el("div", "compass-edit-dialog");
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "compass-edit-title");
    dialog.setAttribute("aria-describedby", "compass-edit-body");

    titleEl = ctx.el("h2", "compass-edit-title");
    titleEl.id = "compass-edit-title";
    bodyEl = ctx.el("div", "compass-edit-body");
    bodyEl.id = "compass-edit-body";

    const actions = ctx.el("div", "compass-edit-actions");
    cancelBtn = ctx.button("compass-edit-cancel", "Cancel");
    confirmBtn = ctx.button("compass-edit-confirm", "Unlink");
    actions.append(cancelBtn, confirmBtn);
    dialog.append(titleEl, bodyEl, actions);
    backdrop.append(dialog);

    ctx.lifecycle.node(backdrop, ctx.dom.root);
    ctx.lifecycle.event(backdrop, "click", (event) => {
      if (event.target === backdrop) closeDialog();
    });
    ctx.lifecycle.event(backdrop, "keydown", (event) => {
      if (event.key !== "Tab" || backdrop.hidden) return;
      const focusable = [cancelBtn, confirmBtn];
      const index = focusable.indexOf(globalThis.document?.activeElement);
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        confirmBtn.focus();
      } else if (!event.shiftKey && (index < 0 || index >= focusable.length - 1)) {
        event.preventDefault();
        cancelBtn.focus();
      }
    });
    ctx.lifecycle.event(cancelBtn, "click", () => closeDialog());
    ctx.lifecycle.event(confirmBtn, "click", ctx.guard(() => confirmPending()));
    return backdrop;
  }

  function closeDialog() {
    pending = null;
    if (backdrop) backdrop.hidden = true;
  }

  function resolveContext(node, item) {
    if (!node || !item || item.kind !== "typed" || item.writable !== true || !item.sourceUid) return null;
    const hood = ctx?.state?.hood;
    if (!hood?.center?.uid) return null;
    const center = hood.center;
    const centerSnap = ctx.state?.snapshot?.center;
    const centerEndpoint = {
      uid: center.uid,
      kind: center.kind === "block" ? "block" : "page",
      title: center.title,
      ...(center.kind === "block" && typeof centerSnap?.string === "string" ? { string: centerSnap.string } : {}),
    };
    const nodeEndpoint = {
      uid: node.uid,
      kind: node.kind === "block" ? "block" : "page",
      title: node.title,
      ...(node.kind === "block" && typeof node.string === "string" ? { string: node.string } : {}),
    };
    let owner;
    let value;
    if (item.direction === "out") {
      owner = centerEndpoint;
      value = nodeEndpoint;
    } else if (item.direction === "in") {
      owner = nodeEndpoint;
      value = centerEndpoint;
    } else {
      return null;
    }
    const ownerRole = item.direction === "out" ? item.role : inverseRole(item.role);
    const inverse = isLinkablePage(owner) && isLinkablePage(value)
      ? inverseAttribute(item.attribute, ownerRole, hood.settings)
      : null;
    return {
      sourceUid: item.sourceUid,
      sourceString: item.sourceString ?? null,
      attribute: item.attribute,
      owner,
      value,
      inverse,
      otherCount: countOtherEvidence(node, item),
    };
  }

  function openDialog(mode, resolved) {
    ctx.hideFloating?.();
    if (!ensureDialog()) return;
    pending = { mode, ...resolved };
    bodyEl.replaceChildren();

    if (mode === "unlink") {
      titleEl.textContent = "Unlink this relation?";
      confirmBtn.textContent = "Unlink";
      const relation = describeRelation({
        owner: resolved.owner,
        attribute: resolved.attribute,
        value: resolved.value,
      });
      bodyEl.append(
        ctx.el("p", "compass-edit-relation", relation),
        ctx.el("p", "compass-edit-note", "This removes one block value. The page and its other links stay."),
      );
      if (resolved.otherCount > 0) {
        const noun = resolved.otherCount === 1 ? "block" : "blocks";
        bodyEl.append(
          ctx.el(
            "p",
            "compass-edit-note compass-edit-other",
            `These two are still connected by ${resolved.otherCount} other ${noun}.`,
          ),
        );
      }
    } else {
      titleEl.textContent = "Move this relation to the other page?";
      confirmBtn.textContent = "Save relation";
      const compare = ctx.el("div", "compass-edit-compare");
      const nowCard = ctx.el("div", "compass-edit-step compass-edit-step-now");
      nowCard.append(
        ctx.el("div", "compass-edit-label", "Now"),
        ctx.el("p", "compass-edit-relation", describeRelation({
          owner: resolved.owner,
          attribute: resolved.attribute,
          value: resolved.value,
        })),
      );
      const afterCard = ctx.el("div", "compass-edit-step compass-edit-step-after");
      afterCard.append(
        ctx.el("div", "compass-edit-label", "After saving"),
        ctx.el("p", "compass-edit-relation", describeRelation({
          owner: resolved.value,
          attribute: resolved.inverse,
          value: resolved.owner,
        })),
      );
      compare.append(nowCard, afterCard);
      bodyEl.append(compare);
    }

    backdrop.hidden = false;
    cancelBtn.focus();
  }

  function pullFreshSource(sourceUid) {
    if (typeof ctx.host?.sourceBlock === "function") {
      return ctx.host.sourceBlock(sourceUid);
    }
    const snap = ctx.host?.snapshot?.(sourceUid, ctx.state?.settings?.model);
    if (!snap || snap.missing || snap.center?.kind !== "block") return null;
    return {
      uid: snap.center.uid,
      string: snap.center.string ?? "",
      order: null,
      parentUid: snap.center.parent?.uid ?? snap.center.page?.uid ?? null,
      children: (snap.outline ?? []).map((child, index) => ({
        uid: child.uid,
        string: child.string ?? "",
        order: Number.isFinite(child.order) ? child.order : index,
      })),
    };
  }

  function pullFreshTarget(pageUid, attribute) {
    if (typeof ctx.host?.attributeBlock === "function") {
      return ctx.host.attributeBlock(pageUid, attribute);
    }
    const target = typeof attribute === "string" ? attribute.trim().toLowerCase() : "";
    if (!pageUid || !target) return null;
    const snap = ctx.host?.snapshot?.(pageUid, ctx.state?.settings?.model);
    if (!snap || snap.missing) return null;
    for (const child of snap.outline ?? []) {
      const parsed = parseAttribute(child?.string);
      if (parsed && parsed.name.toLowerCase() === target && typeof child.uid === "string") {
        return { uid: child.uid, string: child.string };
      }
    }
    return null;
  }

  async function confirmPending() {
    if (!pending || busy) return;
    const job = pending;
    closeDialog();
    busy = true;
    try {
      const source = pullFreshSource(job.sourceUid);
      if (job.mode === "unlink") {
        const unlinkValue = job.value.kind === "page"
          ? { uid: job.value.uid, title: job.value.title }
          : { uid: job.value.uid };
        const plan = planUnlink({ source, attribute: job.attribute, value: unlinkValue });
        if (plan.reason) {
          ctx.setStatus(reasonMessage(plan.reason));
          ctx.load();
          return;
        }
        const expected = typeof job.sourceString === "string" ? job.sourceString : source.string;
        const guards = [{ uid: job.sourceUid, string: expected }];
        let result;
        try {
          result = await ctx.host.applyPlan({ lockUid: job.sourceUid, guards, ops: plan.ops });
        } catch (error) {
          console.error("[compass] unlink", error);
          result = { ok: false, reason: "failed" };
        }
        if (result?.ok) ctx.setStatus("Unlinked.");
        else ctx.setStatus(reasonMessage(result?.reason));
        ctx.load();
        return;
      }

      const target = pullFreshTarget(job.value.uid, job.inverse);
      const plan = planFlipOwner({
        source,
        attribute: job.attribute,
        owner: job.owner,
        value: job.value,
        inverse: job.inverse,
        target,
      });
      if (plan.reason) {
        ctx.setStatus(reasonMessage(plan.reason));
        ctx.load();
        return;
      }
      const guards = plan.guards.map((entry) => (
        entry.uid === job.sourceUid && typeof job.sourceString === "string"
          ? { uid: entry.uid, string: job.sourceString }
          : entry
      ));
      let result;
      try {
        result = await ctx.host.applyPlan({ lockUid: job.sourceUid, guards, ops: plan.ops });
      } catch (error) {
        console.error("[compass] flip owner", error);
        result = { ok: false, reason: "failed" };
      }
      if (result?.ok) ctx.setStatus(`Moved to [[${job.value.title}]] as ${job.inverse}::`);
      else ctx.setStatus(reasonMessage(result?.reason));
      ctx.load();
    } finally {
      busy = false;
    }
  }

  return {
    name: "edit",

    evidenceActions({ node, item } = {}) {
      const resolved = resolveContext(node, item);
      if (!resolved) return [];
      const actions = [{ title: "Unlink", run: () => openDialog("unlink", resolved) }];
      if (resolved.inverse) {
        actions.push({ title: "Flip owner", run: () => openDialog("flip", resolved) });
      }
      return actions;
    },

    nodeMenu(_uid, node) {
      if (!node?.writable) return [];
      const resolved = resolveContext(node, node.writable);
      if (!resolved) return [];
      const items = [{ title: "Unlink…", run: () => openDialog("unlink", resolved) }];
      if (resolved.inverse) {
        items.push({ title: "Flip owner…", run: () => openDialog("flip", resolved) });
      }
      return items;
    },

    onEscape() {
      if (!pending || !backdrop || backdrop.hidden) return false;
      closeDialog();
      return true;
    },

    onKey(event) {
      if (!pending || !backdrop || backdrop.hidden) return false;
      if (event.key === "Tab" || event.key === "Enter" || event.key === " ") return false;
      return true;
    },

    onClose() {
      closeDialog();
    },

    onNavigate(info) {
      if (info?.changed) closeDialog();
    },
  };
}
