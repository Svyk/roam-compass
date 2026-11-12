function visibleBarChildren(h) {
  return h.qa(".compass-bar > *").filter((el) => {
    if (el.hidden) return false;
    const cs = window.getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden";
  });
}

function assertBarOneLine(h, label) {
  const children = visibleBarChildren(h);
  h.assert(children.length >= 10, `${label}: toolbar renders expected visible controls`);
  const exportBtn = h.q(".compass-bar .compass-export-btn");
  if (exportBtn) {
    h.equal(window.getComputedStyle(exportBtn).display, "none", `${label}: export bar button is hidden`);
  }
  const tops = children.map((el) => Math.round(el.getBoundingClientRect().top));
  const minTop = Math.min(...tops);
  const maxTop = Math.max(...tops);
  h.assert(
    maxTop - minTop <= 1,
    `${label}: every visible bar child shares one top offset (got ${JSON.stringify(tops)})`,
  );
}

function isRendered(el) {
  if (!el || el.hidden) return false;
  let cur = el;
  while (cur && cur.nodeType === 1) {
    if (cur.hidden) return false;
    const cs = window.getComputedStyle(cur);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    cur = cur.parentElement;
  }
  return true;
}

function activeViewLayerCounts(h) {
  const compassNodes = h.qa(".compass-world > .compass-node").filter(isRendered).length;
  const mindmapNodes = h.qa(".compass-mindmap .compass-node").filter(isRendered).length;
  const facetsNodes = h.qa(".compass-facets .compass-node").filter(isRendered).length;
  return { compassNodes, mindmapNodes, facetsNodes };
}

export const SCENARIOS = {
  async toolbar(h) {
    await h.open("p-alpha");
    await h.wait(400);

    h.equal(Math.round(h.rect(".compass-root").width), 1440, "overlay starts at 1440 px wide");
    assertBarOneLine(h, "1440px");

    const root = h.q(".compass-root");
    const applyNarrow = () => {
      document.documentElement.style.width = "1100px";
      root.style.right = `${window.innerWidth - 1100}px`;
    };
    applyNarrow();
    h.harness.lifecycle.event(window, "resize", applyNarrow);
    h.harness.overlay.ctx.fit(false);
    await h.wait(60);

    h.equal(Math.round(h.rect(".compass-root").width), 1100, "overlay resized to 1100 px wide");
    assertBarOneLine(h, "1100px");

    h.click(".compass-more");
    await h.wait(40);
    const menu = h.q(".compass-menu");
    h.assert(Boolean(menu && !menu.hidden), "More opens the floating menu");

    const titles = h.qa(".compass-menu .compass-menu-item").map((el) => el.textContent.trim());
    h.assert(titles.includes("Fit to screen"), 'More menu contains "Fit to screen"');
    h.assert(titles.includes("Export image…"), 'More menu contains "Export image…"');

    const zenItem = h.qa(".compass-menu .compass-menu-item").find(
      (el) => el.textContent.trim() === "Toggle Zen mode",
    );
    h.assert(Boolean(zenItem), 'More menu contains "Toggle Zen mode"');
    h.click(zenItem);
    await h.wait(40);

    h.equal(root.classList.contains("compass-zen"), true, 'choosing "Toggle Zen mode" sets Zen');
    h.equal(h.features("zen")?.isZen?.(), true, "zen feature reports isZen() === true");

    // Exit Zen and reopen More at 1100 px so the toolbar + More menu appear in the screenshot.
    h.key("Escape");
    await h.wait(40);
    h.equal(root.classList.contains("compass-zen"), false, "Escape exits Zen");
    assertBarOneLine(h, "1100px after Zen");
    h.click(".compass-more");
    await h.wait(40);
  },

  async api(h) {
    const api = window.RoamCompass;
    h.assert(Boolean(api), "window.RoamCompass is installed");
    h.equal(api.apiVersion, 2, "RoamCompass.apiVersion === 2");
    h.assert(api.ontology().roles.parent.includes("Parent"), "ontology().roles.parent includes Parent");

    const hood = api.neighborhood("p-alpha");
    h.assert(
      hood.nodes.some((node) => node.title === "Task One" && node.role === "child"),
      'neighborhood("p-alpha").nodes includes Task One with role "child"',
    );
    h.assert(api.search("task").length >= 3, 'search("task").length >= 3');

    await h.open("p-alpha");
    const afterSet = await api.setView("mindmap");
    await h.wait(80);
    h.equal(afterSet?.view, "mindmap", "setView resolves canvas() with mindmap");
    h.equal(api.canvas().view, "mindmap", 'canvas().view === "mindmap"');
    h.assert(api.commands().length > 0, "commands() is non-empty");
    h.equal(await api.run("nope"), false, 'run("nope") resolves false');
  },

  async "all-views"(h) {
    await h.open("p-alpha");

    h.equal(h.q(".compass-root").dataset.view, "compass", "starts in Compass view");
    let counts = activeViewLayerCounts(h);
    h.assert(
      counts.compassNodes > 0 && counts.mindmapNodes === 0 && counts.facetsNodes === 0,
      "Compass view shows only Compass nodes",
    );

    await h.features("views").set("mindmap");
    await h.wait(120);
    h.equal(h.q(".compass-root").dataset.view, "mindmap", "switched to Mind Map view");
    counts = activeViewLayerCounts(h);
    h.assert(
      counts.compassNodes === 0 && counts.mindmapNodes > 0 && counts.facetsNodes === 0,
      "Mind Map view shows only Mind Map nodes",
    );

    await h.features("views").set("facets");
    await h.wait(120);
    h.equal(h.q(".compass-root").dataset.view, "facets", "switched to Facets view");
    counts = activeViewLayerCounts(h);
    h.assert(
      counts.compassNodes === 0 && counts.mindmapNodes === 0 && counts.facetsNodes > 0,
      "Facets view shows only Facets nodes",
    );

    await h.features("views").set("compass");
    await h.wait(120);
    h.equal(h.q(".compass-root").dataset.view, "compass", "returned to Compass view");
    counts = activeViewLayerCounts(h);
    h.assert(
      counts.compassNodes > 0 && counts.mindmapNodes === 0 && counts.facetsNodes === 0,
      "Compass view shows only Compass nodes after cycling back",
    );
  },
};
