import { createLifecycle } from "../../../src/lifecycle.js";
import { SETTING_IDS } from "../../../src/settings.js";
import { mountOverlay } from "../../../src/view/overlay.js";

const EXPECTED_LINES = [
  "The card in the middle is the page or block you are looking at.",
  "Parents sit above it, children below, friends on the left, challengers on the right, siblings on the far right.",
  "Click a neighbor to make it the center. Double-click to open it in the sidebar.",
  "Use + on a side to link a page there. Drag a solid-bordered node to another side to change its relation.",
  "Drag a block from the sidebar or the page onto the map to center it.",
  "Esc closes Compass.",
];

const FLIPPED_LINE_2 = "Parents sit above it, children below, friends on the right, challengers on the left, siblings on the far left.";

export const SCENARIOS = {
  async guide(h) {
    // Unset first-run flag so we can test Wander/Mind Map gating before Compass view auto-opens the guide.
    await h.harness.extensionAPI.settings.set(SETTING_IDS.guideSeen, false);
    const backdrop = h.q(".compass-help-backdrop");

    // C6: opening through Wander does not auto-open the guide and leaves guideSeen unset.
    await h.harness.overlay.openWander();
    await h.wait(60);
    h.assert(Boolean(backdrop && backdrop.hidden), "opening through Wander does not auto-open guide");
    h.equal(h.harness.extensionAPI.settings.get(SETTING_IDS.guideSeen), false, "guideSeen stays unset after Wander");
    h.click(".compass-close");
    await h.wait(40);

    // C6: opening through Mind Map does not auto-open the guide and leaves guideSeen unset.
    await h.harness.overlay.openView("mindmap");
    await h.wait(60);
    h.assert(Boolean(backdrop && backdrop.hidden), "opening through Mind Map does not auto-open guide");
    h.equal(h.harness.extensionAPI.settings.get(SETTING_IDS.guideSeen), false, "guideSeen stays unset after Mind Map");
    h.click(".compass-close");
    await h.wait(40);
    await h.harness.extensionAPI.settings.set(SETTING_IDS.view, "compass");

    // C5 + G3: even when settings.set rejects, first Compass-view open shows the guide once,
    // marks it seen immediately, and stays closed across a second and third open (and even if Compass
    // is closed while the auto-opened guide is still showing).
    const originalSet = h.harness.extensionAPI.settings.set.bind(h.harness.extensionAPI.settings);
    let guideSetCalls = 0;
    h.harness.extensionAPI.settings.set = (id, value) => {
      if (id === SETTING_IDS.guideSeen) {
        guideSetCalls += 1;
        return Promise.reject(new Error("read-only settings"));
      }
      return originalSet(id, value);
    };
    try {
      await h.open("p-alpha");
      await h.wait(50);

      h.assert(Boolean(backdrop && !backdrop.hidden), "first Compass-view open shows guide automatically");
      h.assert(guideSetCalls >= 1, "guideSeen write attempted immediately when guide auto-opened");
      h.equal(h.text(".compass-help-title"), "How Compass works", "guide title is How Compass works");
      h.equal(h.text(".compass-help-guide .compass-help-group-title"), "The map", "first section is The map");
      const items = h.qa(".compass-help-guide-item").map((el) => el.textContent.trim());
      h.equal(items.length, 6, "guide lists all 6 lines");
      for (let i = 0; i < EXPECTED_LINES.length; i += 1) {
        h.equal(items[i], EXPECTED_LINES[i], `guide line ${i + 1} matches`);
      }

      // Close Compass directly while the auto-opened guide is still showing.
      h.click(".compass-close");
      await h.wait(40);
      h.assert(backdrop.hidden, "closing Compass hides auto-opened guide");

      // Second open: guide stays closed and load() runs onSettings({ guideSeen: false }).
      await h.open("p-alpha");
      await h.wait(40);
      h.assert(backdrop.hidden, "second open does not auto-open guide again when settings.set rejects");

      // Third open: catches any onSettings overwrite of the local latch from the second open.
      h.click(".compass-close");
      await h.wait(40);
      await h.open("p-alpha");
      await h.wait(40);
      h.assert(backdrop.hidden, "third open still keeps guide closed when settings.set rejects");
    } finally {
      h.harness.extensionAPI.settings.set = originalSet;
    }

    // G3: read-only settings (canSet = false) also latch across three opens.
    const roLife = createLifecycle();
    const roApi = {
      settings: {
        canSet: false,
        get(id) {
          if (id === SETTING_IDS.guideSeen) return false;
          if (id === SETTING_IDS.view) return "unrecognized-view-name";
          return h.harness.extensionAPI.settings.get(id);
        },
        async set() {
          throw new Error("should not call set when canSet is false");
        },
      },
      ui: { commandPalette: { async addCommand() {}, async removeCommand() {} } },
    };
    const roOverlay = mountOverlay({ extensionAPI: roApi, lifecycle: roLife, host: h.harness.host });
    try {
      const roBackdrop = roOverlay.ctx.dom.root.querySelector(".compass-help-backdrop");
      roOverlay.focusUid("p-alpha");
      await h.wait(50);
      h.assert(Boolean(roBackdrop && !roBackdrop.hidden), "canSet=false (and unrecognized stored view) auto-opens guide on first open");
      roOverlay.ctx.close();
      await h.wait(40);
      roOverlay.focusUid("p-alpha");
      await h.wait(40);
      h.assert(Boolean(roBackdrop && roBackdrop.hidden), "canSet=false: second open keeps guide closed");
      roOverlay.ctx.close();
      await h.wait(40);
      roOverlay.focusUid("p-alpha");
      await h.wait(40);
      h.assert(Boolean(roBackdrop && roBackdrop.hidden), "canSet=false: third open keeps guide closed");
    } finally {
      roLife.dispose();
    }

    // C7: Alt+? command is titled "How Compass works" (not "Keyboard help").
    const commandTitles = h.harness.overlay.ctx.commands().map((cmd) => cmd.title);
    h.assert(commandTitles.includes("How Compass works"), "commands list includes How Compass works");
    h.assert(!commandTitles.includes("Keyboard help"), "commands list no longer uses Keyboard help");

    // Verify "?" button is in the bar just before More, with expected title, and reopens the guide.
    const helpBtn = h.q(".compass-bar .compass-help-btn");
    const moreBtn = h.q(".compass-bar .compass-more");
    h.assert(Boolean(helpBtn && moreBtn), "? and More buttons exist in bar");
    h.equal(helpBtn.textContent.trim(), "?", "button reads ?");
    h.equal(helpBtn.title, "How Compass works (Alt+?)", "? button title matches");
    h.assert(
      helpBtn.getBoundingClientRect().right <= moreBtn.getBoundingClientRect().left + 1,
      "? button sits immediately before More",
    );

    h.click(helpBtn);
    await h.wait(40);
    h.assert(!backdrop.hidden, "clicking ? button opens guide again");
    h.click(".compass-help-close");
    await h.wait(40);

    // Side labels on base fixture (without Flip)
    h.equal(h.text(".compass-zone-count-north"), "Parents 3", "north label reads Parents 3");
    h.equal(h.text(".compass-zone-count-south"), "Children 8", "south label reads Children 8");
    h.equal(h.text(".compass-zone-count-west"), "Friends 2", "west label reads Friends 2");
    h.equal(h.text(".compass-zone-count-east"), "Challengers 2", "east label reads Challengers 2");
    h.equal(h.text(".compass-zone-count-siblings"), "Siblings 1", "siblings label reads Siblings 1");
    h.assert(
      h.rect(".compass-zone-count-west").left < h.rect(".compass-zone-count-east").left,
      "without Flip: Friends label sits left of Challengers label",
    );

    // Enable Flip East–West: west/east labels follow Flip and line 2 swaps left/right.
    await h.setting("flip", true);
    h.equal(h.text(".compass-zone-count-west"), "Friends 2", "with Flip: west label still names Friends 2");
    h.equal(h.text(".compass-zone-count-east"), "Challengers 2", "with Flip: east label still names Challengers 2");
    h.assert(
      h.rect(".compass-zone-count-west").left > h.rect(".compass-zone-count-east").left,
      "with Flip: Friends label sits right of Challengers label",
    );
    h.click(helpBtn);
    await h.wait(40);
    const flippedItems = h.qa(".compass-help-guide-item").map((el) => el.textContent.trim());
    h.equal(flippedItems[1], FLIPPED_LINE_2, "with Flip: guide line 2 swaps left and right");
    h.click(".compass-help-close");
    await h.wait(40);

    // Empty sides keep their side name (dimmer) while siblings stays hidden when empty.
    await h.setting("flip", false);
    await h.open("p-empty");
    h.equal(h.text(".compass-zone-count-south"), "Children", "empty south reads Children");
    h.assert(
      !h.q(".compass-zone-count-south").hidden
        && h.q(".compass-zone-count-south").classList.contains("compass-zone-count-empty"),
      "empty south label stays visible and dimmer",
    );
    h.equal(h.text(".compass-zone-count-west"), "Friends", "empty west reads Friends");
    h.equal(h.text(".compass-zone-count-east"), "Challengers", "empty east reads Challengers");
    h.assert(h.q(".compass-zone-count-siblings").hidden, "empty siblings label stays hidden");

    // Return to Project Alpha and open guide for screenshot inspection.
    await h.open("p-alpha");
    h.click(helpBtn);
    await h.wait(40);
  },
};
