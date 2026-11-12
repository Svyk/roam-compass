import { SETTING_IDS } from "../../../src/settings.js";

function regionNameOf(regionEl) {
  return regionEl.querySelector(".compass-region-name")?.textContent?.trim()
    || regionEl.querySelector(".compass-region-label")?.textContent?.trim()
    || "";
}

function cardsInRegion(h, regionId) {
  return h
    .qa(`.compass-facets .compass-facet-card[data-region="${regionId}"] .compass-node-title`)
    .map((el) => el.textContent.trim());
}

function findRegionByName(h, label) {
  return h.qa('.compass-facets [data-paint="region"]').find((el) => regionNameOf(el) === label) ?? null;
}

function assertRegionsAndCardsClean(h) {
  h.noOverlap('.compass-facets [data-paint="region"]');
  h.noOverlap(".compass-facets .compass-node");
  const centerEl = h.q(".compass-facets .compass-node-center");
  h.assert(Boolean(centerEl), "center card exists in facets view");
  for (const reg of h.qa('.compass-facets [data-paint="region"]')) {
    h.assert(!h.overlaps(reg, centerEl), `region ${regionNameOf(reg)} does not overlap center`);
    const rRect = h.rect(reg);
    const regionId = reg.dataset.region;
    for (const card of h.qa(`.compass-facets .compass-facet-card[data-region="${regionId}"]`)) {
      const cRect = h.rect(card);
      h.assert(
        cRect.left > rRect.left + 2 &&
        cRect.right < rRect.right - 2 &&
        cRect.top > rRect.top + 2 &&
        cRect.bottom < rRect.bottom - 2,
        `card ${card.textContent.trim()} stays inside region ${regionNameOf(reg)} without touching borders`,
      );
    }
  }
}

export const SCENARIOS = {
  "facets-roles": async (h) => {
    await h.open("p-alpha");
    await h.features("views").set("facets", "roles");
    await h.wait(250);

    const regions = h.qa('.compass-facets [data-paint="region"]');
    const names = regions.map(regionNameOf);
    h.equal(regions.length, 5, "five role regions are drawn");
    for (const expected of ["Parents", "Children", "Friends", "Challengers", "Siblings"]) {
      h.assert(names.includes(expected), `region ${expected} is drawn`);
    }

    const childrenRegion = findRegionByName(h, "Children");
    const childTitles = cardsInRegion(h, childrenRegion.dataset.region);
    for (const task of ["Task One", "Task Two", "Task Three"]) {
      h.assert(childTitles.includes(task), `${task} is under Children`);
    }
    const parentTitles = cardsInRegion(h, findRegionByName(h, "Parents").dataset.region);
    h.assert(parentTitles.includes("Programs"), "Programs is under Parents");
    const friendTitles = cardsInRegion(h, findRegionByName(h, "Friends").dataset.region);
    h.assert(friendTitles.includes("Project Beta") && friendTitles.includes("Kickoff"), "Friends holds Project Beta and Kickoff");
    const challengerTitles = cardsInRegion(h, findRegionByName(h, "Challengers").dataset.region);
    h.assert(challengerTitles.includes("Risk Register") && challengerTitles.includes("Launch"), "Challengers holds Risk Register and Launch");
    const siblingTitles = cardsInRegion(h, findRegionByName(h, "Siblings").dataset.region);
    h.assert(siblingTitles.includes("Project Gamma"), "Siblings holds Project Gamma");

    const facets = h.features("facets");
    h.equal(facets.presets().length, 3, "three built-in presets listed");
    h.assert(
      facets.commands().some((cmd) => cmd.id === "facets-edit") &&
      facets.commands().some((cmd) => cmd.id === "facets-preset-roles"),
      "facets commands registered",
    );
    h.assert(
      facets.stageMenu().some((item) => item.title.includes("Local roles") && item.title.includes("✓")),
      "stageMenu marks active preset",
    );

    assertRegionsAndCardsClean(h);
  },

  "facets-status": async (h) => {
    await h.open("p-alpha");
    await h.features("views").set("facets", "status");
    await h.wait(250);

    const doingReg = findRegionByName(h, "Doing");
    const todoReg = findRegionByName(h, "Todo");
    const doneReg = findRegionByName(h, "Done");
    const unassignedReg = findRegionByName(h, "Unassigned");

    h.assert(Boolean(doingReg), "Doing region exists");
    h.assert(Boolean(todoReg), "Todo region exists");
    h.assert(Boolean(doneReg), "Done region exists");
    h.assert(Boolean(unassignedReg), "Unassigned region exists");

    h.assert(cardsInRegion(h, doingReg.dataset.region).includes("Task One"), "Doing holds Task One");
    h.assert(cardsInRegion(h, todoReg.dataset.region).includes("Task Two"), "Todo holds Task Two");
    h.assert(cardsInRegion(h, doneReg.dataset.region).includes("Task Three"), "Done holds Task Three");

    const unassignedCards = cardsInRegion(h, unassignedReg.dataset.region);
    for (const title of ["Programs", "Project Beta", "Risk Register", "Budget", "Roadmap"]) {
      h.assert(unassignedCards.includes(title), `${title} sits in Unassigned`);
    }

    assertRegionsAndCardsClean(h);
  },

  "facets-types": async (h) => {
    await h.open("p-alpha");
    await h.features("views").set("facets", "types");
    await h.wait(250);

    const taskReg = findRegionByName(h, "Task");
    const sourceReg = findRegionByName(h, "Source");
    h.assert(Boolean(taskReg), "Task region exists");
    h.assert(Boolean(sourceReg), "Source region exists");

    const taskCards = cardsInRegion(h, taskReg.dataset.region);
    const sourceCards = cardsInRegion(h, sourceReg.dataset.region);
    h.equal(taskCards.length, 3, "Task region has three cards");
    h.equal(sourceCards.length, 2, "Source region has two cards");
    for (const task of ["Task One", "Task Two", "Task Three"]) {
      h.assert(taskCards.includes(task), `Task region includes ${task}`);
    }
    for (const src of ["Budget", "Roadmap"]) {
      h.assert(sourceCards.includes(src), `Source region includes ${src}`);
    }

    assertRegionsAndCardsClean(h);
  },

  "facets-custom": async (h) => {
    await h.open("p-alpha");
    await h.features("views").set("facets", "roles");
    await h.wait(200);

    const facets = h.features("facets");
    facets.openPresetEditor();
    await h.wait(80);

    const customPreset = {
      id: "project-quadrants",
      name: "Project quadrants",
      help: "Four-way split around the center.",
      source: "role",
      layout: "quadrants",
      edges: true,
      hideEmptyStatus: true,
      categories: [
        { id: "upstream", label: "Upstream", values: ["parent"], color: "#2563eb" },
        { id: "delivery", label: "Delivery", values: ["child"], color: "#16a34a" },
        { id: "allies", label: "Allies", values: ["friend", "previous", "sibling"], color: "#d97706" },
        { id: "risks", label: "Risks", values: ["challenger", "next"], color: "#dc2626" },
      ],
    };

    h.type(".compass-facets-json", JSON.stringify(customPreset, null, 2));
    h.click(".compass-facets-save");
    await h.wait(250);

    h.equal(h.features("views").current().preset, "project-quadrants", "custom preset is selected");
    const stored = h.harness.extensionAPI.settings.get(SETTING_IDS.facetsPresets);
    h.assert(
      Array.isArray(stored) && stored.some((item) => item?.id === "project-quadrants"),
      "custom preset is persisted in compass-facets-presets",
    );
    h.equal(h.count('.compass-facets [data-paint="region"]'), 4, "four quadrant regions are drawn");

    // Type invalid JSON and assert an error is listed and nothing changes
    h.type(".compass-facets-json", "{ broken json ");
    h.click(".compass-facets-save");
    await h.wait(100);

    const errors = h.qa(".compass-facets-errors:not([hidden]) .compass-facets-error");
    h.assert(errors.length >= 1, "invalid JSON lists an error under the text area");
    h.equal(h.features("views").current().preset, "project-quadrants", "selected preset did not change");
    const storedAfterError = h.harness.extensionAPI.settings.get(SETTING_IDS.facetsPresets);
    h.equal(storedAfterError.length, stored.length, "saved presets list did not change");
    h.equal(h.count('.compass-facets [data-paint="region"]'), 4, "four quadrant regions remain unchanged");

    // Verify Tab focus trap inside dialog
    h.q(".compass-facets-import").focus();
    h.key("Tab");
    h.equal(h.focused(), h.q(".compass-facets-dialog-close"), "Tab wraps focus inside preset dialog");
    h.key("Tab", { shiftKey: true });
    h.equal(h.focused(), h.q(".compass-facets-import"), "Shift+Tab wraps focus inside preset dialog");

    // Close dialog via Escape so focus returns to gear and screenshot shows the four quadrants cleanly
    h.key("Escape");
    await h.wait(100);
    h.assert(h.q(".compass-facets-backdrop").hidden === true, "Escape closes preset editor");
    h.equal(h.focused(), h.q(".compass-facets-gear"), "focus returns to gear button");

    assertRegionsAndCardsClean(h);
  },

  "facets-back": async (h) => {
    await h.open("p-alpha");
    await h.features("views").set("facets", "roles");
    await h.wait(200);
    h.assert(h.count('.compass-facets [data-paint="region"]') === 5, "facets regions drawn while active");
    h.assert(h.features("facets").classified() !== null, "classified() returns data while active");

    await h.features("views").set("compass");
    await h.wait(250);

    const layer = h.q(".compass-facets");
    h.assert(Boolean(layer), ".compass-facets container exists");
    h.equal(layer.childElementCount, 0, ".compass-facets is empty after switching to Compass");
    h.equal(h.features("facets").classified(), null, "classified() is null when inactive");
    for (const zone of ["north", "south", "west", "east", "siblings"]) {
      h.assert(h.count(`.compass-node[data-zone="${zone}"]`) >= 1, `Compass ${zone} nodes are back`);
    }
  },
};
