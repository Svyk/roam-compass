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
  },
};
