export function createZen(ctx) {
  let zen = false;
  let full = false;
  let zenBtn = null;
  let fullBtn = null;

  if (ctx?.el && ctx?.button && ctx?.lifecycle && ctx?.dom?.stage) {
    const cluster = ctx.el("div", "compass-corner");
    const fitBtn = ctx.button("compass-corner-btn compass-corner-fit", "Fit", "Fit to screen");
    zenBtn = ctx.button("compass-corner-btn compass-corner-zen", "Zen", "Toggle Zen mode");
    zenBtn.setAttribute("aria-pressed", "false");
    fullBtn = ctx.button("compass-corner-btn compass-corner-full", "Full", "Toggle fullscreen");
    fullBtn.setAttribute("aria-pressed", "false");

    cluster.append(fitBtn, zenBtn, fullBtn);
    ctx.lifecycle.node(cluster, ctx.dom.stage);

    ctx.lifecycle.event(cluster, "pointerdown", (event) => {
      event.stopPropagation();
    });
    ctx.lifecycle.event(cluster, "click", (event) => {
      event.stopPropagation();
    });
    ctx.lifecycle.event(cluster, "dblclick", (event) => {
      event.stopPropagation();
    });
    ctx.lifecycle.event(fitBtn, "click", () => {
      ctx?.fit?.(true);
    });
    ctx.lifecycle.event(zenBtn, "click", () => {
      toggleZen();
    });
    ctx.lifecycle.event(fullBtn, "click", () => {
      toggleFull();
    });
  }

  function isZen() {
    return zen;
  }

  function setZen(on) {
    zen = Boolean(on);
    ctx?.dom?.root?.classList?.toggle?.("compass-zen", zen);
    zenBtn?.setAttribute("aria-pressed", zen ? "true" : "false");
    if (zen) {
      const active = globalThis.document?.activeElement;
      if (active && (ctx?.dom?.bar?.contains?.(active) || ctx?.dom?.pinRow?.contains?.(active))) {
        active.blur?.();
      }
    }
  }

  function toggleZen() {
    setZen(!zen);
  }

  function setFull(on) {
    full = Boolean(on);
    ctx?.dom?.root?.classList?.toggle?.("compass-full", full);
    fullBtn?.setAttribute("aria-pressed", full ? "true" : "false");
  }

  function toggleFull() {
    setFull(!full);
  }

  function onEscape() {
    if (zen) {
      setZen(false);
      return true;
    }
    if (full) {
      setFull(false);
      return true;
    }
    return false;
  }

  function onClose() {
    setZen(false);
    setFull(false);
  }

  function commands() {
    return [
      { id: "zen", title: "Toggle Zen mode", hint: "", run: () => toggleZen() },
      { id: "fullscreen", title: "Toggle fullscreen", hint: "", run: () => toggleFull() },
    ];
  }

  function stageMenu() {
    return [
      { title: "Toggle Zen mode", run: () => toggleZen() },
      { title: "Toggle fullscreen", run: () => toggleFull() },
    ];
  }

  return {
    name: "zen",
    isZen,
    setZen,
    toggleZen,
    toggleFull,
    onEscape,
    onClose,
    commands,
    stageMenu,
  };
}
