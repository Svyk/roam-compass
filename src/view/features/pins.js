import { movePin, periodTitle, periodicPins, reorderPins } from "../../model/periodic.js";

function isAltShortcut(event, letter, code) {
  if (!event?.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (event.code === code) return true;
  return typeof event.key === "string" && event.key.toLowerCase() === letter;
}

export function createPins(ctx) {
  const hasDom = Boolean(
    ctx?.dom?.root
    && ctx?.dom?.pinRow
    && typeof ctx?.el === "function"
    && typeof ctx?.button === "function"
    && ctx?.lifecycle?.node
    && ctx?.lifecycle?.event,
  );

  let confirming = null;
  let confirmJustOpened = false;
  let pickerJustOpened = false;
  let creatingPage = false;
  let midnightTimer = null;
  let drag = null;
  let suppressPinClick = false;
  let dropMarker = null;
  let picker = null;

  function resolvePeriodic(now = new Date()) {
    const settings = ctx?.state?.settings ?? {};
    const daily = ctx?.host?.dailyPage?.(now) ?? null;
    const base = periodicPins({ settings, now, daily });
    return base.map((item) => {
      if (item.id === "today") {
        const entity = item.uid ? ctx?.host?.entity?.(item.uid) : null;
        return {
          id: item.id,
          label: item.label,
          title: entity?.title || item.title,
          uid: entity?.uid || item.uid || null,
          exists: Boolean(entity),
        };
      }
      const found = item.title ? ctx?.host?.pageByTitle?.(item.title) : null;
      return {
        id: item.id,
        label: item.label,
        title: found?.title || item.title,
        uid: found?.uid ?? null,
        exists: Boolean(found?.uid),
      };
    });
  }

  function lookupDestination(id, now = new Date()) {
    const settings = ctx?.state?.settings ?? {};
    if (id === "today") {
      const daily = ctx?.host?.dailyPage?.(now) ?? null;
      const uid = daily?.uid ?? null;
      const title = daily?.title || uid || "";
      const entity = uid ? ctx?.host?.entity?.(uid) : null;
      return {
        id: "today",
        label: "Today",
        title: entity?.title || title,
        uid: entity?.uid || uid,
        explicitUid: uid || undefined,
        exists: Boolean(entity),
      };
    }
    if (id === "week" || id === "month") {
      const title = periodTitle(id, now, settings);
      const found = title ? ctx?.host?.pageByTitle?.(title) : null;
      return {
        id,
        label: id === "week" ? "This week" : "This month",
        title: found?.title || title,
        uid: found?.uid ?? null,
        explicitUid: undefined,
        exists: Boolean(found?.uid),
      };
    }
    return null;
  }

  function stopMidnightTimer() {
    if (midnightTimer != null && typeof ctx?.cancel === "function") {
      midnightTimer = ctx.cancel(midnightTimer);
    } else {
      midnightTimer = null;
    }
  }

  function armMidnightTimer() {
    stopMidnightTimer();
    if (!ctx?.state?.isOpen || typeof ctx?.later !== "function") return;
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2, 0);
    const delay = Math.max(1_000, nextMidnight.getTime() - now.getTime());
    midnightTimer = ctx.later(() => {
      midnightTimer = null;
      if (!ctx?.state?.isOpen) return;
      decoratePinRow();
      armMidnightTimer();
    }, delay);
  }

  async function confirmCreate(info, createBtn, cancelBtn) {
    if (creatingPage) return;
    creatingPage = true;
    createBtn.disabled = true;
    cancelBtn.disabled = true;
    try {
      const createdUid = info.explicitUid
        ? await ctx.host.createPage(info.title, info.explicitUid)
        : await ctx.host.createPage(info.title);
      confirming = null;
      const targetUid = createdUid || info.explicitUid || ctx?.host?.pageByTitle?.(info.title)?.uid;
      if (targetUid) {
        ctx?.focusUid?.(targetUid);
      } else {
        decoratePinRow();
      }
    } catch (error) {
      console.error("[compass] create periodic page", error);
      confirming = null;
      decoratePinRow();
    } finally {
      creatingPage = false;
    }
  }

  function cancelConfirm({ restoreFocus = false } = {}) {
    if (!confirming) return;
    const id = confirming.id;
    confirming = null;
    decoratePinRow();
    if (restoreFocus && ctx?.dom?.pinRow) {
      const restored = ctx.dom.pinRow.querySelector(`.compass-pin-periodic-btn[data-periodic-id="${id}"]`);
      restored?.focus?.({ preventScroll: true });
    }
  }

  function buildConfirmChip(info) {
    const wrap = ctx.el("span", "compass-pin-chip compass-pin-confirm");
    wrap.dataset.periodicId = info.id;
    const prompt = ctx.el("span", "compass-pin-confirm-text", `Create [[${info.title}]]?`);
    const createBtn = ctx.button("compass-pin-confirm-create", "Create");
    const cancelBtn = ctx.button("compass-pin-confirm-cancel", "Cancel");
    createBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void confirmCreate(info, createBtn, cancelBtn);
    });
    cancelBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      cancelConfirm({ restoreFocus: true });
    });
    wrap.append(prompt, createBtn, cancelBtn);
    return wrap;
  }

  function decoratePinRow(pinRow = ctx?.dom?.pinRow) {
    if (!pinRow || !hasDom) return;
    for (const old of pinRow.querySelectorAll(".compass-pin-periodic, .compass-pin-confirm")) {
      old.remove();
    }
    for (const chip of pinRow.querySelectorAll(".compass-pin-chip")) {
      const jump = chip.querySelector(".compass-pin-jump");
      const uid = jump?.dataset?.uid;
      if (uid) {
        chip.classList.add("compass-pin-user");
        chip.dataset.pinUid = uid;
      }
    }

    const periodicList = resolvePeriodic(new Date());
    const nodes = [];
    let renderedConfirm = false;

    for (const item of periodicList) {
      if (confirming && confirming.id === item.id) {
        renderedConfirm = true;
        nodes.push(buildConfirmChip(confirming));
        continue;
      }
      const chip = ctx.el("span", "compass-pin-chip compass-pin-periodic");
      chip.dataset.periodicId = item.id;
      chip.dataset.exists = item.exists ? "true" : "false";
      chip.title = item.title;
      if (item.exists && item.uid && item.uid === ctx?.state?.current) {
        chip.classList.add("compass-pin-active");
      }
      const btn = ctx.button("compass-pin-periodic-btn");
      btn.dataset.periodicId = item.id;
      btn.title = item.title;
      const cal = ctx.el("span", "compass-pin-cal");
      cal.setAttribute("aria-hidden", "true");
      const label = ctx.el("span", "compass-pin-periodic-label", item.label);
      btn.append(cal, label);
      chip.append(btn);
      nodes.push(chip);
    }

    if (confirming && !renderedConfirm) {
      nodes.unshift(buildConfirmChip(confirming));
    }

    if (nodes.length) pinRow.prepend(...nodes);
    pinRow.hidden = pinRow.childElementCount === 0;
  }

  function activatePeriodic(id) {
    const dest = lookupDestination(id, new Date());
    if (!dest || !dest.title) return;
    if (dest.exists && dest.uid) {
      if (confirming) {
        confirming = null;
        decoratePinRow();
      }
      ctx?.focusUid?.(dest.uid);
      return;
    }
    confirming = {
      id: dest.id,
      title: dest.title,
      explicitUid: dest.explicitUid,
    };
    confirmJustOpened = true;
    Promise.resolve().then(() => { confirmJustOpened = false; });
    decoratePinRow();
    const createBtn = ctx?.dom?.pinRow?.querySelector(".compass-pin-confirm-create");
    createBtn?.focus?.({ preventScroll: true });
  }

  function openUserPinMenu(uid, clientX, clientY) {
    const pins = ctx?.state?.settings?.pins ?? [];
    const index = pins.findIndex((pin) => pin.uid === uid);
    if (index < 0) return;
    ctx.hideFloating();
    if (index > 0) {
      ctx.menuItem("Move left", async () => {
        const currentPins = ctx?.state?.settings?.pins ?? [];
        const next = movePin(currentPins, uid, -1);
        if (next !== currentPins) await ctx.savePins(next);
      });
    }
    if (index < pins.length - 1) {
      ctx.menuItem("Move right", async () => {
        const currentPins = ctx?.state?.settings?.pins ?? [];
        const next = movePin(currentPins, uid, 1);
        if (next !== currentPins) await ctx.savePins(next);
      });
    }
    ctx.menuItem("Unpin", async () => {
      const currentPins = ctx?.state?.settings?.pins ?? [];
      await ctx.savePins(currentPins.filter((pin) => pin.uid !== uid));
    });
    ctx.placeFloating(ctx.dom.menu, clientX, clientY);
    ctx.dom.menu.querySelector("button")?.focus();
  }

  function clearDrag() {
    if (!drag) return;
    drag.chip?.classList?.remove("compass-pin-dragging");
    ctx?.dom?.pinRow?.classList?.remove("compass-pins-dragging");
    if (dropMarker) dropMarker.hidden = true;
    drag = null;
  }

  function computeDropTarget(clientX, clientY) {
    const chips = [...(ctx?.dom?.pinRow?.querySelectorAll(".compass-pin-user") ?? [])];
    if (!chips.length) return null;
    const measured = chips.map((chip, index) => ({
      chip,
      index,
      uid: chip.dataset.pinUid,
      rect: chip.getBoundingClientRect(),
    }));
    let rowItems = measured.filter(({ rect }) => clientY >= rect.top - 8 && clientY <= rect.bottom + 8);
    if (!rowItems.length) {
      let bestDist = Infinity;
      let bestCenterY = 0;
      for (const item of measured) {
        const cy = (item.rect.top + item.rect.bottom) / 2;
        const dist = Math.abs(clientY - cy);
        if (dist < bestDist) {
          bestDist = dist;
          bestCenterY = cy;
        }
      }
      rowItems = measured.filter(
        ({ rect }) => Math.abs((rect.top + rect.bottom) / 2 - bestCenterY) <= rect.height / 2 + 4,
      );
    }

    for (let i = 0; i < rowItems.length; i += 1) {
      const currentItem = rowItems[i];
      const midX = currentItem.rect.left + currentItem.rect.width / 2;
      if (clientX < midX) {
        const prevInRow = i > 0 ? rowItems[i - 1] : null;
        const markerX = prevInRow
          ? (prevInRow.rect.right + currentItem.rect.left) / 2
          : currentItem.rect.left - 3;
        return {
          beforeUid: currentItem.uid,
          x: markerX,
          top: currentItem.rect.top,
          height: currentItem.rect.height,
        };
      }
    }

    const lastInRow = rowItems[rowItems.length - 1];
    const nextOverall = measured[lastInRow.index + 1] ?? null;
    return {
      beforeUid: nextOverall ? nextOverall.uid : null,
      x: lastInRow.rect.right + 3,
      top: lastInRow.rect.top,
      height: lastInRow.rect.height,
    };
  }

  function isPickerOpen() {
    return Boolean(picker && !picker.hidden);
  }

  function closePicker({ restoreFocus = false } = {}) {
    if (!picker || picker.hidden) return;
    picker.hidden = true;
    picker.replaceChildren();
    if (restoreFocus) {
      ctx?.dom?.stage?.focus?.({ preventScroll: true });
    }
  }

  function openPicker() {
    if (!picker || !hasDom) return;
    ctx?.hideFloating?.();
    ctx?.features?.get?.("trail")?.close?.();
    picker.replaceChildren();

    const periodicList = resolvePeriodic(new Date());
    const userPins = ctx?.state?.settings?.pins ?? [];

    for (const item of periodicList) {
      const row = ctx.button("compass-pins-picker-item");
      row.dataset.periodicId = item.id;
      const label = ctx.el("span", "compass-pins-picker-label", item.label);
      const meta = ctx.el(
        "span",
        "compass-pins-picker-meta",
        item.exists ? item.title : `${item.title} (new)`,
      );
      row.append(label, meta);
      picker.append(row);
    }

    for (const pin of userPins) {
      const row = ctx.button("compass-pins-picker-item");
      row.dataset.uid = pin.uid;
      const label = ctx.el("span", "compass-pins-picker-label", pin.title);
      row.append(label);
      picker.append(row);
    }

    if (!periodicList.length && !userPins.length) {
      picker.append(ctx.el("div", "compass-pins-picker-empty", "No pins yet"));
    }

    const anchorEl = !ctx.dom.pinRow.hidden ? ctx.dom.pinRow : ctx.dom.bar;
    const rect = anchorEl.getBoundingClientRect();
    ctx.placeFloating(picker, rect.left + 8, rect.bottom - 2);
    pickerJustOpened = true;
    Promise.resolve().then(() => { pickerJustOpened = false; });

    picker.querySelector(".compass-pins-picker-item")?.focus?.({ preventScroll: true });
  }

  function choosePickerRow(row) {
    if (!row) return;
    const periodicId = row.dataset.periodicId;
    const uid = row.dataset.uid;
    closePicker({ restoreFocus: false });
    if (periodicId) activatePeriodic(periodicId);
    else if (uid) ctx?.focusUid?.(uid);
  }

  if (hasDom) {
    dropMarker = ctx.el("div", "compass-pin-drop-marker");
    dropMarker.hidden = true;
    ctx.lifecycle.node(dropMarker, ctx.dom.root);

    picker = ctx.el("div", "compass-pins-picker");
    picker.hidden = true;
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-label", "Pins");
    ctx.lifecycle.node(picker, ctx.dom.root);

    ctx.lifecycle.event(ctx.dom.pinRow, "click", (event) => {
      if (suppressPinClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const periodicBtn = event.target.closest?.(".compass-pin-periodic-btn");
      if (periodicBtn?.dataset?.periodicId) {
        event.preventDefault();
        event.stopPropagation();
        activatePeriodic(periodicBtn.dataset.periodicId);
      }
    }, true);

    ctx.lifecycle.event(ctx.dom.pinRow, "contextmenu", (event) => {
      const userChip = event.target.closest?.(".compass-pin-user");
      if (!userChip?.dataset?.pinUid) return;
      event.preventDefault();
      event.stopPropagation();
      openUserPinMenu(userChip.dataset.pinUid, event.clientX, event.clientY);
    });

    ctx.lifecycle.event(ctx.dom.pinRow, "pointerdown", (event) => {
      if (event.button !== 0 || drag) return;
      if (event.target.closest?.(".compass-pin-remove, .compass-pin-periodic, .compass-pin-confirm")) {
        return;
      }
      const userChip = event.target.closest?.(".compass-pin-user");
      const uid = userChip?.dataset?.pinUid;
      if (!userChip || !uid) return;
      drag = {
        uid,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
        beforeUid: undefined,
        chip: userChip,
      };
    });

    ctx.lifecycle.event(globalThis, "pointermove", (event) => {
      if (!drag) return;
      if (drag.pointerId != null && event.pointerId != null && event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.active) {
        if (Math.hypot(dx, dy) < 5) return;
        drag.active = true;
        drag.chip.classList.add("compass-pin-dragging");
        ctx.dom.pinRow.classList.add("compass-pins-dragging");
      }
      const target = computeDropTarget(event.clientX, event.clientY);
      if (!target) {
        dropMarker.hidden = true;
        drag.beforeUid = undefined;
        return;
      }
      drag.beforeUid = target.beforeUid;
      const rootRect = ctx.dom.root.getBoundingClientRect();
      dropMarker.style.left = `${Math.round(target.x - rootRect.left - 1)}px`;
      dropMarker.style.top = `${Math.round(target.top - rootRect.top)}px`;
      dropMarker.style.height = `${Math.round(target.height)}px`;
      dropMarker.hidden = false;
    });

    ctx.lifecycle.event(globalThis, "pointerup", (event) => {
      if (!drag) return;
      if (drag.pointerId != null && event.pointerId != null && event.pointerId !== drag.pointerId) return;
      const state = drag;
      clearDrag();
      if (!state.active) return;
      suppressPinClick = true;
      ctx.later?.(() => { suppressPinClick = false; }, 0);
      if (state.beforeUid === undefined) return;
      const currentPins = ctx?.state?.settings?.pins ?? [];
      const next = reorderPins(currentPins, state.uid, state.beforeUid);
      if (next !== currentPins) {
        void Promise.resolve(ctx.savePins(next)).catch((error) => console.error("[compass] pins", error));
      }
    });

    ctx.lifecycle.event(globalThis, "pointercancel", (event) => {
      if (!drag) return;
      if (drag.pointerId != null && event.pointerId != null && event.pointerId !== drag.pointerId) return;
      clearDrag();
    });

    ctx.lifecycle.event(picker, "click", (event) => {
      const row = event.target.closest?.(".compass-pins-picker-item");
      if (row) choosePickerRow(row);
    });

    ctx.lifecycle.event(picker, "keydown", (event) => {
      const items = [...picker.querySelectorAll(".compass-pins-picker-item")];
      const activeItem = event.target.closest?.(".compass-pins-picker-item");
      const activeIndex = activeItem ? items.indexOf(activeItem) : -1;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        if (!items.length) return;
        const nextIndex = activeIndex < 0 ? 0 : Math.min(items.length - 1, activeIndex + 1);
        items[nextIndex].focus({ preventScroll: true });
        items[nextIndex].scrollIntoView?.({ block: "nearest" });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        if (!items.length) return;
        const prevIndex = activeIndex < 0 ? 0 : Math.max(0, activeIndex - 1);
        items[prevIndex].focus({ preventScroll: true });
        items[prevIndex].scrollIntoView?.({ block: "nearest" });
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        event.stopPropagation();
        if (!items.length) return;
        items[0].focus({ preventScroll: true });
        items[0].scrollIntoView?.({ block: "nearest" });
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        event.stopPropagation();
        if (!items.length) return;
        items[items.length - 1].focus({ preventScroll: true });
        items[items.length - 1].scrollIntoView?.({ block: "nearest" });
        return;
      }
      if (event.key === "Enter" && activeItem) {
        event.preventDefault();
        event.stopPropagation();
        choosePickerRow(activeItem);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closePicker({ restoreFocus: true });
      }
    });

    const onOutside = (event) => {
      const target = event.target;
      if (confirming && !confirmJustOpened) {
        const confirmEl = ctx.dom.pinRow.querySelector(".compass-pin-confirm");
        if (!confirmEl || !confirmEl.contains(target)) {
          cancelConfirm({ restoreFocus: false });
        }
      }
      if (isPickerOpen() && !pickerJustOpened && !picker.contains(target)) {
        closePicker({ restoreFocus: false });
      }
    };
    const doc = globalThis.document ?? ctx.dom.root;
    ctx.lifecycle.event(doc, "pointerdown", onOutside);
    ctx.lifecycle.event(doc, "click", onOutside);
    ctx.lifecycle.event(ctx.dom.root, "focusin", (event) => {
      if (isPickerOpen() && !pickerJustOpened && !picker.contains(event.target)) {
        closePicker({ restoreFocus: false });
      }
    });
    ctx.lifecycle.add(() => {
      stopMidnightTimer();
      clearDrag();
    });
  }

  return {
    name: "pins",

    periodic() {
      return resolvePeriodic(new Date());
    },

    openPicker,

    onOpen() {
      armMidnightTimer();
    },

    onClose() {
      stopMidnightTimer();
      clearDrag();
      confirming = null;
      closePicker({ restoreFocus: false });
    },

    onNavigate({ changed } = {}) {
      if (changed) {
        confirming = null;
        closePicker({ restoreFocus: false });
      }
    },

    afterPins({ pinRow } = {}) {
      decoratePinRow(pinRow);
      if (ctx?.state?.isOpen && midnightTimer == null) {
        armMidnightTimer();
      }
    },

    onEscape() {
      if (drag) {
        const wasActive = drag.active;
        clearDrag();
        if (wasActive) return true;
      }
      if (isPickerOpen()) {
        closePicker({ restoreFocus: true });
        return true;
      }
      if (confirming) {
        cancelConfirm({ restoreFocus: true });
        return true;
      }
      return false;
    },

    onKey(event) {
      if (isAltShortcut(event, "b", "KeyB")) {
        if (isPickerOpen()) closePicker({ restoreFocus: true });
        else openPicker();
        return true;
      }
      if (event?.key === "ContextMenu" || (event?.shiftKey && event?.key === "F10")) {
        const userChip = event.target?.closest?.(".compass-pin-user");
        if (userChip?.dataset?.pinUid) {
          const rect = userChip.getBoundingClientRect();
          openUserPinMenu(userChip.dataset.pinUid, rect.left + 8, rect.bottom);
          return true;
        }
      }
      return false;
    },

    commands() {
      const settings = ctx?.state?.settings ?? {};
      const out = [
        { id: "pins-open", title: "Open pins", hint: "Alt+B", run: () => openPicker() },
        { id: "pin-today", title: "Go to Today", hint: "", run: () => activatePeriodic("today") },
      ];
      if (settings.pinWeek === true) {
        out.push({ id: "pin-week", title: "Go to This week", hint: "", run: () => activatePeriodic("week") });
      }
      if (settings.pinMonth === true) {
        out.push({ id: "pin-month", title: "Go to This month", hint: "", run: () => activatePeriodic("month") });
      }
      return out;
    },
  };
}
