import { hiddenUids as baseHiddenUids } from "../../model/batch7.js";
import { groupNodes } from "../../model/group.js";
import { buildNeighborhood } from "../../model/neighborhood.js";
import { SETTING_IDS } from "../../settings.js";

const EXPANDABLE_ZONES = new Set(["north", "south", "west", "east"]);
const SUB_CAP = 4;

function isExpandableNeighbor(node) {
  if (!node || typeof node.uid !== "string" || !node.uid) return false;
  if (!EXPANDABLE_ZONES.has(node.zone)) return false;
  if (node.kind === "group") return false;
  if (node.style === "board" || node.style === "card") return false;
  return true;
}

export function createLayoutOptions(ctx) {
  let groupOn = Boolean(ctx?.state?.settings?.group);
  let expandedOn = Boolean(ctx?.state?.settings?.expanded);
  let flipOn = Boolean(ctx?.state?.settings?.flip);
  let oneSidedOn = Boolean(ctx?.state?.settings?.oneSided);
  let trackpadOn = Boolean(ctx?.state?.settings?.trackpad);
  let saving = 0;

  const unfoldedByCenter = new Map();
  const childrenCache = new Map();
  let originalNodes = new Map();
  let unfoldedGroupByMember = new Map();

  const groupButton = ctx?.button?.("compass-group", "Group", "Group nodes by type") ?? null;
  const expandedButton = ctx?.button?.("compass-expanded", "Expanded", "Expanded view") ?? null;

  function syncButtons() {
    if (groupButton) groupButton.setAttribute("aria-pressed", groupOn ? "true" : "false");
    if (expandedButton) expandedButton.setAttribute("aria-pressed", expandedOn ? "true" : "false");
  }

  if (groupButton) {
    syncButtons();
    ctx?.addBarButton?.(groupButton);
    ctx?.lifecycle?.event?.(groupButton, "click", ctx.guard ? ctx.guard(() => toggleGroup()) : () => toggleGroup());
  }
  if (expandedButton) {
    syncButtons();
    ctx?.addBarButton?.(expandedButton);
    ctx?.lifecycle?.event?.(expandedButton, "click", ctx.guard ? ctx.guard(() => toggleExpanded()) : () => toggleExpanded());
  }
  ctx?.lifecycle?.add?.(() => {
    groupButton?.remove?.();
    expandedButton?.remove?.();
  });

  function isCompassView() {
    const view = ctx?.features?.get?.("views")?.current?.()?.view;
    return !view || view === "compass";
  }

  function syncRootAttributes(activeCompass) {
    const root = ctx?.dom?.root;
    if (!root?.dataset) return;
    if (activeCompass && flipOn) root.dataset.flip = "true";
    else delete root.dataset.flip;
    if (activeCompass && oneSidedOn) root.dataset.oneSided = "true";
    else delete root.dataset.oneSided;
  }

  function onSettings(settings) {
    childrenCache.clear();
    if (!settings || saving > 0) return;
    groupOn = Boolean(settings.group);
    expandedOn = Boolean(settings.expanded);
    flipOn = Boolean(settings.flip);
    oneSidedOn = Boolean(settings.oneSided);
    trackpadOn = Boolean(settings.trackpad);
    syncButtons();
  }

  function onNavigate({ uid, previous, changed } = {}) {
    if (!changed) return;
    if (previous) unfoldedByCenter.delete(previous);
    if (uid) unfoldedByCenter.delete(uid);
  }

  function onClose() {
    unfoldedByCenter.clear();
    childrenCache.clear();
    originalNodes = new Map();
    unfoldedGroupByMember = new Map();
    syncRootAttributes(false);
  }

  async function persistOption(id, value, { rebuild = false, fit = false } = {}) {
    saving += 1;
    try {
      await ctx?.saveSetting?.(id, value);
      if (rebuild) ctx?.rebuild?.();
      ctx?.render?.();
      if (fit && isCompassView()) ctx?.fit?.(true);
    } catch (error) {
      console.error("[compass] layout", error);
    } finally {
      saving -= 1;
    }
  }

  async function toggleGroup() {
    groupOn = !groupOn;
    if (!groupOn) unfoldedByCenter.clear();
    syncButtons();
    await persistOption(SETTING_IDS.group, groupOn, { rebuild: true });
  }

  async function toggleExpanded() {
    expandedOn = !expandedOn;
    if (!expandedOn) childrenCache.clear();
    syncButtons();
    await persistOption(SETTING_IDS.expanded, expandedOn);
  }

  async function toggleFlip() {
    flipOn = !flipOn;
    await persistOption(SETTING_IDS.flip, flipOn, { fit: true });
  }

  async function toggleOneSided() {
    oneSidedOn = !oneSidedOn;
    await persistOption(SETTING_IDS.oneSided, oneSidedOn, { rebuild: true, fit: true });
  }

  async function toggleTrackpad() {
    trackpadOn = !trackpadOn;
    await persistOption(SETTING_IDS.trackpad, trackpadOn);
  }

  function transformHood(hood) {
    originalNodes = new Map();
    unfoldedGroupByMember = new Map();
    if (!hood || !Array.isArray(hood.nodes)) return hood;
    if (!groupOn || !isCompassView()) return hood;

    for (const node of hood.nodes) {
      if (node?.uid) originalNodes.set(node.uid, node);
    }
    const factMap = ctx?.facts?.(hood.nodes) ?? new Map();
    const centerUid = hood.center?.uid || ctx?.state?.current || "";
    const unfolded = unfoldedByCenter.get(centerUid) ?? new Set();

    const allGrouped = groupNodes(hood.nodes, factMap, { unfolded: new Set(), oneSided: oneSidedOn });
    if (unfolded.size > 0) {
      for (const item of allGrouped) {
        if (item.kind !== "group" || !unfolded.has(item.uid)) continue;
        for (const memberUid of item.members) unfoldedGroupByMember.set(memberUid, item.uid);
      }
    }

    const nodes = unfolded.size > 0
      ? groupNodes(hood.nodes, factMap, { unfolded, oneSided: oneSidedOn })
      : allGrouped;
    return { ...hood, nodes };
  }

  function childrenFor(uid, centerUid) {
    if (!expandedOn || !uid) return [];
    let raw = childrenCache.get(uid);
    if (!raw) {
      const model = ctx?.state?.settings?.model;
      raw = [];
      try {
        const snap = ctx?.host?.snapshot?.(uid, model);
        if (snap && !snap.missing) {
          raw = buildNeighborhood(snap, model).nodes.filter((child) => child.zone === "south");
        }
      } catch (error) {
        console.error("[compass] expanded", error);
        raw = [];
      }
      childrenCache.set(uid, raw);
    }
    return centerUid ? raw.filter((child) => child.uid !== centerUid) : raw;
  }

  function layoutOptions(options) {
    if (!isCompassView()) return options;
    const next = { ...options };
    if (flipOn) next.flip = true;
    if (oneSidedOn) next.oneSided = true;
    if (expandedOn) {
      const hood = ctx?.state?.hood;
      const centerUid = hood?.center?.uid || ctx?.state?.current || "";
      const sub = {};
      for (const node of hood?.nodes ?? []) {
        if (!isExpandableNeighbor(node)) continue;
        const count = childrenFor(node.uid, centerUid).length;
        if (count > 0) {
          sub[node.uid] = Math.min(count, SUB_CAP) + (count > SUB_CAP ? 1 : 0);
        }
      }
      next.sub = sub;
    }
    return next;
  }

  function isGroupHidden(group) {
    const members = (group?.members ?? []).map((id) => originalNodes.get(id)).filter(Boolean);
    if (!members.length) return false;
    const lensesFeature = ctx?.features?.get?.("lenses");
    const lensState = ctx?.state?.lens ?? { pages: true, blocks: true, drawings: true, regions: true, keyword: "" };
    const hiddenMembers = typeof lensesFeature?.hiddenFor === "function"
      ? lensesFeature.hiddenFor(members)
      : new Set(baseHiddenUids(members, lensState));
    return members.every((member) => hiddenMembers?.has?.(member.uid));
  }

  function hiddenUids(uids, hood) {
    if (!Array.isArray(uids) || !hood || !Array.isArray(hood.nodes)) return uids;
    const groups = hood.nodes.filter((node) => node?.kind === "group");
    if (!groups.length) return uids;
    const out = new Set(uids);
    for (const group of groups) {
      if (!(group.members ?? []).some((id) => originalNodes.has(id))) continue;
      if (isGroupHidden(group)) out.add(group.uid);
      else out.delete(group.uid);
    }
    return [...out];
  }

  function afterRender({ hood, nodeEls, view } = {}) {
    syncButtons();
    if (view !== "compass" || !hood || !nodeEls) {
      syncRootAttributes(false);
      return;
    }
    syncRootAttributes(true);

    const centerUid = hood.center?.uid || ctx?.state?.current || "";
    for (const node of hood.nodes ?? []) {
      const element = nodeEls.get(node.uid);
      if (!element) continue;

      if (node.kind === "group") {
        element.classList.add("compass-node-group");
        element.dataset.kind = "group";
        if ((node.members ?? []).some((id) => originalNodes.has(id))) {
          element.classList.toggle?.("compass-fade", isGroupHidden(node));
        }
        const titleEl = element.querySelector(".compass-node-title");
        if (titleEl) titleEl.textContent = node.title;
        if (!element.querySelector(".compass-group-count")) {
          element.append(ctx.el("span", "compass-group-count", String(node.count)));
        }
        const memberTitles = (node.members ?? [])
          .slice(0, 8)
          .map((id) => originalNodes.get(id)?.title || id);
        const remaining = (node.members?.length ?? 0) - memberTitles.length;
        element.title = remaining > 0
          ? `${memberTitles.join(", ")} (+${remaining} more)`
          : memberTitles.join(", ");
        continue;
      }

      if (expandedOn && isExpandableNeighbor(node)) {
        const children = childrenFor(node.uid, centerUid);
        if (children.length > 0) {
          element.classList.add("compass-node-expanded");
          const subs = ctx.el("div", "compass-subs");
          for (const child of children.slice(0, SUB_CAP)) {
            const label = child.alias || child.title;
            const row = ctx.el("div", "compass-sub", label);
            row.dataset.uid = child.uid;
            row.setAttribute("role", "button");
            row.tabIndex = 0;
            row.title = child.title;
            subs.append(row);
          }
          if (children.length > SUB_CAP) {
            subs.append(ctx.el("div", "compass-sub-more", `+${children.length - SUB_CAP} more`));
          }
          element.append(subs);
        }
      }
    }
  }

  function unfoldGroup(groupId, focusFirst = false) {
    const centerUid = ctx?.state?.current;
    if (!centerUid || !groupId) return false;
    const currentNode = (ctx?.state?.hood?.nodes ?? []).find((n) => n.uid === groupId);
    const firstMemberUid = currentNode?.members?.[0] ?? null;
    let unfolded = unfoldedByCenter.get(centerUid);
    if (!unfolded) {
      unfolded = new Set();
      unfoldedByCenter.set(centerUid, unfolded);
    }
    unfolded.add(groupId);
    ctx?.rebuild?.();
    ctx?.render?.();
    if (focusFirst && firstMemberUid) {
      ctx?.state?.nodeEls?.get?.(firstMemberUid)?.focus?.({ preventScroll: true });
    }
    return true;
  }

  function foldGroup(groupId) {
    const centerUid = ctx?.state?.current;
    if (!centerUid || !groupId) return;
    const unfolded = unfoldedByCenter.get(centerUid);
    if (!unfolded || !unfolded.has(groupId)) return;
    unfolded.delete(groupId);
    ctx?.rebuild?.();
    ctx?.render?.();
  }

  function onStageClick(event) {
    if (!isCompassView()) return false;
    const target = event?.target;
    if (!target || typeof target.closest !== "function") return false;
    if (target.closest(".compass-sub-more")) return true;
    const subEl = target.closest(".compass-sub[data-uid]");
    if (subEl?.dataset?.uid) {
      ctx?.focusUid?.(subEl.dataset.uid);
      return true;
    }
    const groupEl = target.closest('.compass-node[data-kind="group"]');
    if (groupEl?.dataset?.uid) {
      return unfoldGroup(groupEl.dataset.uid, false);
    }
    return false;
  }

  function onStageDoubleClick(event) {
    if (!isCompassView()) return false;
    const target = event?.target;
    if (!target || typeof target.closest !== "function") return false;
    if (target.closest(".compass-sub-more")) return true;
    const subEl = target.closest(".compass-sub[data-uid]");
    if (subEl?.dataset?.uid) {
      event.preventDefault?.();
      void ctx?.openSidebar?.(subEl.dataset.uid);
      return true;
    }
    if (target.closest('.compass-node[data-kind="group"]')) {
      event.preventDefault?.();
      return true;
    }
    return false;
  }

  function onKey(event) {
    if (!isCompassView()) return false;
    const target = event?.target;
    if (!target || typeof target.closest !== "function") return false;
    const subEl = target.closest(".compass-sub[data-uid]");
    if (subEl?.dataset?.uid && (event.key === "Enter" || event.key === " ")) {
      ctx?.focusUid?.(subEl.dataset.uid);
      return true;
    }
    const groupEl = target.closest('.compass-node[data-kind="group"]');
    if (groupEl?.dataset?.uid && (event.key === "Enter" || event.key === " ")) {
      return unfoldGroup(groupEl.dataset.uid, true);
    }
    return false;
  }

  function nodeMenu(uid, node) {
    if (!isCompassView() || !groupOn) return [];
    if (node?.kind === "group") {
      return [{ title: "Unfold group", run: () => unfoldGroup(uid, false) }];
    }
    const groupId = unfoldedGroupByMember.get(uid);
    if (groupId) {
      return [{ title: "Fold group", run: () => foldGroup(groupId) }];
    }
    return [];
  }

  function onWheel(event) {
    if (!trackpadOn || !isCompassView()) return false;
    event.preventDefault();
    const { zoom, panX, panY } = ctx.state;
    if (event.ctrlKey || event.metaKey) {
      const rect = ctx.dom.stage.getBoundingClientRect();
      const ox = event.clientX - rect.left - rect.width / 2;
      const oy = event.clientY - rect.top - rect.height / 2;
      const wx = (ox - panX) / zoom;
      const wy = (oy - panY) / zoom;
      const factor = ctx.clamp(Math.exp(-event.deltaY * 0.01), 0.8, 1.2);
      const nextZoom = ctx.clamp(zoom * factor, 0.25, 2.5);
      ctx.setCamera({
        zoom: nextZoom,
        panX: ox - wx * nextZoom,
        panY: oy - wy * nextZoom,
      }, false);
      return true;
    }
    const dx = Number.isFinite(event.deltaX) ? event.deltaX : 0;
    const dy = Number.isFinite(event.deltaY) ? event.deltaY : 0;
    ctx.setCamera({ panX: panX - dx, panY: panY - dy }, false);
    return true;
  }

  function commands() {
    return [
      { id: "layout-group", title: "Toggle grouping by type", hint: "", run: () => toggleGroup() },
      { id: "layout-expanded", title: "Toggle expanded view", hint: "", run: () => toggleExpanded() },
      { id: "layout-flip", title: "Flip East–West", hint: "", run: () => toggleFlip() },
      { id: "layout-one-sided", title: "Toggle one-sided layout", hint: "", run: () => toggleOneSided() },
      { id: "layout-trackpad", title: "Toggle trackpad navigation", hint: "", run: () => toggleTrackpad() },
    ];
  }

  return {
    name: "layout",
    toggleGroup,
    toggleExpanded,
    onSettings,
    onNavigate,
    onClose,
    transformHood,
    layoutOptions,
    hiddenUids,
    afterRender,
    onStageClick,
    onStageDoubleClick,
    onKey,
    nodeMenu,
    onWheel,
    commands,
  };
}
