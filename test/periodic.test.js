import assert from "node:assert/strict";
import test from "node:test";

import {
  formatPeriod,
  movePin,
  periodTitle,
  periodicPins,
  reorderPins,
} from "../src/model/periodic.js";
import { createPins } from "../src/view/features/pins.js";

test("formatPeriod formats calendar tokens, ordinals, and bracketed literals in one pass", () => {
  const march5 = new Date(2026, 2, 5);
  assert.equal(formatPeriod(march5, "YYYY-MM-DD"), "2026-03-05");
  assert.equal(formatPeriod(march5, "YY/M/D"), "26/3/5");
  assert.equal(formatPeriod(march5, "MMMM Do, YYYY (MMM)"), "March 5th, 2026 (Mar)");
  assert.equal(
    formatPeriod(new Date(2026, 11, 25), "[Month of] MMMM [YYYY-MM-DD] D"),
    "Month of December YYYY-MM-DD 25",
  );
  assert.equal(formatPeriod(march5, "Q1: [literal] & plain!"), "Q1: literal & plain!");

  const expectedOrdinals = [
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [10, "10th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [14, "14th"],
    [20, "20th"],
    [21, "21st"],
    [22, "22nd"],
    [23, "23rd"],
    [24, "24th"],
    [30, "30th"],
    [31, "31st"],
  ];
  for (const [day, expected] of expectedOrdinals) {
    assert.equal(formatPeriod(new Date(2026, 0, day), "Do"), expected, `ordinal for day ${day}`);
  }
});

test("formatPeriod computes ISO 8601 week and week-year when weekStart is monday", () => {
  const cases = [
    [new Date(2026, 11, 31), "2026-W53 (53 / 2026)"],
    [new Date(2027, 0, 1), "2026-W53 (53 / 2026)"],
    [new Date(2027, 0, 3), "2026-W53 (53 / 2026)"],
    [new Date(2027, 0, 4), "2027-W01 (1 / 2027)"],
    [new Date(2024, 11, 30), "2025-W01 (1 / 2025)"],
    [new Date(2024, 11, 29), "2024-W52 (52 / 2024)"],
    [new Date(2021, 0, 3), "2020-W53 (53 / 2020)"],
    [new Date(2021, 0, 4), "2021-W01 (1 / 2021)"],
  ];
  for (const [date, expected] of cases) {
    assert.equal(
      formatPeriod(date, "GGGG-[W]WW (W / gggg)", { weekStart: "monday" }),
      expected,
      `ISO week for ${date.toDateString()}`,
    );
  }
});

test("formatPeriod computes Sunday-start week and Saturday week-year when weekStart is sunday", () => {
  const cases = [
    [new Date(2026, 11, 31), "2027-W01 (1 / 2027)"],
    [new Date(2027, 0, 1), "2027-W01 (1 / 2027)"],
    [new Date(2027, 0, 2), "2027-W01 (1 / 2027)"],
    [new Date(2027, 0, 3), "2027-W02 (2 / 2027)"],
    [new Date(2024, 11, 28), "2024-W52 (52 / 2024)"],
    [new Date(2024, 11, 29), "2025-W01 (1 / 2025)"],
    [new Date(2024, 11, 30), "2025-W01 (1 / 2025)"],
    [new Date(2021, 0, 2), "2021-W01 (1 / 2021)"],
    [new Date(2021, 0, 3), "2021-W02 (2 / 2021)"],
    [new Date(2022, 11, 31), "2022-W53 (53 / 2022)"],
    [new Date(2023, 0, 1), "2023-W01 (1 / 2023)"],
  ];
  for (const [date, expected] of cases) {
    assert.equal(
      formatPeriod(date, "GGGG-[W]WW (W / gggg)", { weekStart: "sunday" }),
      expected,
      `Sunday week for ${date.toDateString()}`,
    );
  }
});

test("periodTitle formats week and month using settings and defaults", () => {
  const jan1 = new Date(2027, 0, 1);
  assert.equal(
    periodTitle("week", jan1, { weekFormat: "GGGG-[W]WW", weekStart: "monday" }),
    "2026-W53",
  );
  assert.equal(
    periodTitle("week", jan1, { weekFormat: "GGGG-[W]WW", weekStart: "sunday" }),
    "2027-W01",
  );
  assert.equal(
    periodTitle("month", new Date(2026, 10, 11), { monthFormat: "YYYY-MM (MMMM)" }),
    "2026-11 (November)",
  );
  assert.equal(periodTitle("month", new Date(2026, 10, 11), {}), "November 2026");
  assert.equal(periodTitle("other", jan1, {}), "");
});

test("periodicPins returns enabled pins in Today, This week, This month order", () => {
  const now = new Date(2026, 10, 11);
  const daily = { uid: "11-11-2026", title: "November 11th, 2026" };

  assert.deepEqual(
    periodicPins({
      settings: {
        pinToday: true,
        pinWeek: true,
        pinMonth: true,
        weekFormat: "GGGG-[W]WW",
        monthFormat: "MMMM YYYY",
        weekStart: "monday",
      },
      now,
      daily,
    }),
    [
      { id: "today", label: "Today", title: "November 11th, 2026", uid: "11-11-2026" },
      { id: "week", label: "This week", title: "2026-W46", uid: null },
      { id: "month", label: "This month", title: "November 2026", uid: null },
    ],
  );

  assert.deepEqual(
    periodicPins({
      settings: { pinToday: false, pinWeek: true, pinMonth: false, weekFormat: "YYYY-[W]WW" },
      now,
      daily,
    }),
    [{ id: "week", label: "This week", title: "2026-W46", uid: null }],
  );

  assert.deepEqual(
    periodicPins({
      settings: { pinToday: false, pinWeek: false, pinMonth: false },
      now,
      daily,
    }),
    [],
  );
});

test("movePin moves by delta, clamps to ends, and preserves reference when unchanged", () => {
  const pins = [
    { uid: "a", title: "Alpha" },
    { uid: "b", title: "Beta" },
    { uid: "c", title: "Gamma" },
  ];

  assert.deepEqual(movePin(pins, "b", -1).map((p) => p.uid), ["b", "a", "c"]);
  assert.deepEqual(movePin(pins, "b", 1).map((p) => p.uid), ["a", "c", "b"]);
  assert.deepEqual(movePin(pins, "a", 10).map((p) => p.uid), ["b", "c", "a"]);
  assert.deepEqual(movePin(pins, "c", -10).map((p) => p.uid), ["c", "a", "b"]);

  assert.equal(movePin(pins, "a", -1), pins);
  assert.equal(movePin(pins, "c", 1), pins);
  assert.equal(movePin(pins, "b", 0), pins);
  assert.equal(movePin(pins, "unknown", 1), pins);
  const empty = [];
  assert.equal(movePin(empty, "a", 1), empty);
});

test("reorderPins places pin before target or at end and preserves reference when unchanged", () => {
  const pins = [
    { uid: "a", title: "Alpha" },
    { uid: "b", title: "Beta" },
    { uid: "c", title: "Gamma" },
    { uid: "d", title: "Delta" },
  ];

  assert.deepEqual(reorderPins(pins, "d", "a").map((p) => p.uid), ["d", "a", "b", "c"]);
  assert.deepEqual(reorderPins(pins, "a", "c").map((p) => p.uid), ["b", "a", "c", "d"]);
  assert.deepEqual(reorderPins(pins, "b", null).map((p) => p.uid), ["a", "c", "d", "b"]);

  // Unchanged cases must return the exact same array instance.
  assert.equal(reorderPins(pins, "a", "b"), pins);
  assert.equal(reorderPins(pins, "d", null), pins);
  assert.equal(reorderPins(pins, "b", "b"), pins);
  assert.equal(reorderPins(pins, "missing", "a"), pins);
  assert.equal(reorderPins(pins, "a", "missing"), pins);
  const empty = [];
  assert.equal(reorderPins(empty, "a", null), empty);
});

test("pins feature resolves periodic exists flags, filters commands by enabled settings, and manages midnight timer", () => {
  let settings = {
    pinToday: true,
    pinWeek: false,
    pinMonth: true,
    weekFormat: "YYYY-[W]WW",
    monthFormat: "MMMM YYYY",
    weekStart: "monday",
    pins: [],
  };
  let isOpen = false;
  const scheduled = [];
  const cancelled = [];

  const feature = createPins({
    state: {
      get settings() {
        return settings;
      },
      get isOpen() {
        return isOpen;
      },
    },
    host: {
      dailyPage() {
        return { uid: "11-11-2026", title: "November 11th, 2026" };
      },
      entity(uid) {
        return uid === "11-11-2026" ? { uid, kind: "page", title: "November 11th, 2026" } : null;
      },
      pageByTitle() {
        return null;
      },
    },
    later(fn, ms) {
      const id = scheduled.length + 1;
      scheduled.push({ id, fn, ms });
      return id;
    },
    cancel(id) {
      if (id != null) cancelled.push(id);
      return null;
    },
  });

  assert.equal(feature.name, "pins");
  const list = feature.periodic();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, "today");
  assert.equal(list[0].exists, true);
  assert.equal(list[1].id, "month");
  assert.equal(list[1].exists, false);

  // Commands only expose week/month when enabled.
  assert.deepEqual(
    feature.commands().map((cmd) => cmd.id),
    ["pins-open", "pin-today", "pin-month"],
  );
  settings = { ...settings, pinWeek: true, pinMonth: false };
  assert.deepEqual(
    feature.commands().map((cmd) => cmd.id),
    ["pins-open", "pin-today", "pin-week"],
  );

  // Midnight timer arms on open and cancels on close.
  isOpen = true;
  feature.onOpen();
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].ms >= 1_000, true);
  feature.onClose();
  assert.deepEqual(cancelled, [1]);
});

