export const SCENARIOS = {
  async smartblock(h) {
    await h.open("b-sb-1");
    const centerTitle = h.q(".compass-node-center .compass-node-title");
    const centerHead = h.q(".compass-node-center .compass-center-head");
    const centerCard = h.q(".compass-node-center");
    h.assert(Boolean(centerTitle && centerHead && centerCard), "center card elements exist");

    const titleText = centerTitle.textContent.trim();
    h.assert(!titleText.includes("SmartBlock"), `center title has no SmartBlock (got ${JSON.stringify(titleText)})`);
    const centerChips = Array.from(centerTitle.querySelectorAll(".compass-btn-chip"));
    h.equal(centerChips.length, 1, "center title holds one .compass-btn-chip");
    h.equal(centerChips[0]?.textContent?.trim(), "⇥🕞", "center chip reads ⇥🕞");
    h.assert(
      centerHead.scrollHeight <= centerHead.clientHeight + 1,
      `center header not clipped (scrollHeight=${centerHead.scrollHeight}, clientHeight=${centerHead.clientHeight})`,
    );
    h.assert(
      centerCard.scrollHeight <= centerCard.clientHeight + 1,
      `center card not clipped (scrollHeight=${centerCard.scrollHeight}, clientHeight=${centerCard.clientHeight})`,
    );

    const childNode = h.q('.compass-node[data-uid="b-sb-2"]');
    h.assert(Boolean(childNode), "child SmartBlock node b-sb-2 is rendered");
    const childChip = childNode?.querySelector(".compass-btn-chip");
    h.equal(childChip?.textContent?.trim(), "🕗↦", "child node chip reads 🕗↦");
    const childText = childNode?.querySelector(".compass-node-title")?.textContent?.trim() ?? "";
    h.assert(
      childText.includes("Double timestamp buttons2") && !childText.includes("SmartBlock"),
      `child node shows workflow name without SmartBlock (got ${JSON.stringify(childText)})`,
    );

    // D2: two-line center header is also unclipped in Mind Map and Facets.
    const views = h.features("views");
    await views.set("mindmap");
    await h.wait(60);
    const mmCard = h.q(".compass-mindmap .compass-node-center");
    const mmHead = mmCard?.querySelector(".compass-center-head");
    h.assert(Boolean(mmCard && mmHead), "Mind Map renders center card and header");
    h.assert(
      mmHead.scrollHeight <= mmHead.clientHeight + 1,
      `Mind Map center header not clipped (scrollHeight=${mmHead.scrollHeight}, clientHeight=${mmHead.clientHeight})`,
    );
    h.assert(
      mmCard.scrollHeight <= mmCard.clientHeight + 1,
      `Mind Map center card not clipped (scrollHeight=${mmCard.scrollHeight}, clientHeight=${mmCard.clientHeight})`,
    );

    await views.set("facets");
    await h.wait(60);
    const fCard = h.q(".compass-facets .compass-node-center");
    const fHead = fCard?.querySelector(".compass-center-head");
    h.assert(Boolean(fCard && fHead), "Facets renders center card and header");
    h.assert(
      fHead.scrollHeight <= fHead.clientHeight + 1,
      `Facets center header not clipped (scrollHeight=${fHead.scrollHeight}, clientHeight=${fHead.clientHeight})`,
    );
    h.assert(
      fCard.scrollHeight <= fCard.clientHeight + 1,
      `Facets center card not clipped (scrollHeight=${fCard.scrollHeight}, clientHeight=${fCard.clientHeight})`,
    );

    await views.set("compass");
    await h.wait(60);
  },
};
