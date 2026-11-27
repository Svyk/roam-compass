import { SETTING_IDS } from "../../../src/settings.js";

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
    // Unset first-run flag so opening Compass auto-shows the guide.
    await h.harness.extensionAPI.settings.set(SETTING_IDS.guideSeen, false);
    await h.open("p-alpha");

    const backdrop = h.q(".compass-help-backdrop");
    h.assert(Boolean(backdrop && !backdrop.hidden), "first open shows guide automatically");
    h.equal(h.text(".compass-help-title"), "How Compass works", "guide title is How Compass works");
    h.equal(h.text(".compass-help-guide .compass-help-group-title"), "The map", "first section is The map");
    const items = h.qa(".compass-help-guide-item").map((el) => el.textContent.trim());
    h.equal(items.length, 6, "guide lists all 6 lines");
    for (let i = 0; i < EXPECTED_LINES.length; i += 1) {
      h.equal(items[i], EXPECTED_LINES[i], `guide line ${i + 1} matches`);
    }

    // Close the guide, close Compass, reopen Compass -> must NOT auto-open again.
    h.click(".compass-help-close");
    await h.wait(40);
    h.assert(backdrop.hidden, "closing guide hides panel");
    h.click(".compass-close");
    await h.wait(40);
    await h.open("p-alpha");
    h.assert(backdrop.hidden, "reopening Compass does not auto-open guide again");

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
