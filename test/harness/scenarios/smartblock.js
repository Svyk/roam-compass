import { SETTING_IDS } from "../../../src/settings.js";

function assertCenterUnclipped(h, scope, label) {
  const card = h.q(`${scope} .compass-node-center`);
  const title = card?.querySelector(".compass-node-title");
  h.assert(Boolean(card && title), `${label} renders center card and title`);
  h.assert(
    card.clientHeight >= 70,
    `${label} center card is tall enough for two lines (clientHeight=${card.clientHeight})`,
  );
  h.assert(
    title.scrollHeight <= title.clientHeight + 1,
    `${label} center title not clipped (scrollHeight=${title.scrollHeight}, clientHeight=${title.clientHeight})`,
  );
}

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
      centerCard.clientHeight >= 70,
      `Compass center card is tall enough for two lines (clientHeight=${centerCard.clientHeight})`,
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

    // D2 / G2: verify a two-line SmartBlock title is unclipped on the title element itself
    // and card is >= 70px tall in Compass, Mind Map, Facets, and Facets with focusInCategory.
    const twoLineUid = h.harness.graph.addBlock(
      "p-smartblock",
      "21:13 {{⇥🕞:SmartBlock:Elapsed time}} [[League Of Legends/16.3]]",
    );
    h.harness.graph.addBlock("p-smartblock", "Child:: ((b-sb-2))", { parentUid: twoLineUid });
    await h.open(twoLineUid);
    assertCenterUnclipped(h, ".compass-world", "Compass");

    const views = h.features("views");
    await views.set("mindmap");
    await h.wait(60);
    assertCenterUnclipped(h, ".compass-mindmap", "Mind Map");

    await views.set("facets", "roles");
    await h.wait(60);
    assertCenterUnclipped(h, ".compass-facets", "Facets");

    await h.harness.extensionAPI.settings.set(SETTING_IDS.facetsPresets, [
      {
        id: "focus-kind",
        name: "Focus by kind",
        source: "kind",
        categories: [
          { id: "blocks", label: "Blocks", values: ["block"] },
          { id: "pages", label: "Pages", values: ["page"] },
        ],
        layout: "horizontal",
        edges: true,
        focusInCategory: true,
        hideEmptyStatus: true,
      },
    ]);
    await views.set("facets", "focus-kind");
    await h.wait(60);
    assertCenterUnclipped(h, ".compass-facets", "Facets (focusInCategory)");

    await h.harness.extensionAPI.settings.set(SETTING_IDS.facetsPresets, []);
    await views.set("compass");
    // I1 / M4: invoke the second render synchronously in the same frame so we can assert
    // stale dataset.target and inline opacity 0 are cleared before the queued frame callback runs.
    h.harness.overlay.focusUid("b-sb-1");
    const immediateCenter = h.q(".compass-world .compass-node-center");
    h.equal(
      "target" in (immediateCenter?.dataset ?? {}),
      false,
      "reused center node clears stale dataset.target before frame callback",
    );
    h.equal(
      immediateCenter?.style?.opacity === "0",
      false,
      "reused center node clears inline opacity 0 before frame callback",
    );
    await h.wait(350);
    h.harness.overlay.hideResults();

    // I1: a second render inside the same frame must not leave nodes stranded at stale enter targets.
    const reopenedCard = h.q(".compass-world .compass-node-center");
    const reopenedTitle = reopenedCard?.querySelector(".compass-node-title");
    h.assert(Boolean(reopenedCard && reopenedTitle), "reopened Compass renders center card and title");
    h.assert(
      reopenedCard.clientHeight >= 70,
      `reopened Compass center card is tall enough for two lines (clientHeight=${reopenedCard.clientHeight})`,
    );
    h.assert(
      reopenedTitle.clientHeight >= 37,
      `reopened Compass center title shows two full lines (clientHeight=${reopenedTitle.clientHeight})`,
    );
    const nodes = h.qa(".compass-world .compass-node");
    h.assert(nodes.length >= 2, `reopened Compass rendered nodes (got ${nodes.length})`);
    let anyOverlap = false;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        if (h.overlaps(nodes[i], nodes[j])) anyOverlap = true;
      }
    }
    h.equal(anyOverlap, false, "no .compass-node overlaps another after back-to-back renders");
  },
};
