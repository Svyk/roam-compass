import { MODEL_DEFAULTS } from "./model/neighborhood.js";
import { VIEWS } from "./model/views.js";

export const SETTING_IDS = Object.freeze({
  north: "compass-north",
  south: "compass-south",
  west: "compass-west",
  east: "compass-east",
  previous: "compass-previous",
  next: "compass-next",
  hidden: "compass-hidden",
  links: "compass-links",
  siblings: "compass-siblings",
  badges: "compass-badges",
  sidecar: "compass-sidecar",
  outline: "compass-outline",
  maxZone: "compass-max-zone",
  pins: "compass-pins",
  drawings: "compass-drawings",
  boards: "compass-boards",
  follow: "compass-follow",
  relatedDrawings: "compass-related-drawings",
  sort: "compass-sort",
  crossLinks: "compass-cross-links",
  view: "compass-view",
  facetsPreset: "compass-facets-preset",
  facetsPresets: "compass-facets-presets",
  lenses: "compass-lenses",
  filterReflow: "compass-filter-reflow",
  group: "compass-group",
  expanded: "compass-expanded",
  typeAttribute: "compass-type-attribute",
  flip: "compass-flip",
  oneSided: "compass-one-sided",
  trackpad: "compass-trackpad",
  pinToday: "compass-pin-today",
  pinWeek: "compass-pin-week",
  pinMonth: "compass-pin-month",
  weekFormat: "compass-week-format",
  monthFormat: "compass-month-format",
  weekStart: "compass-week-start",
  mindmapDirection: "compass-mindmap-direction",
  mindmapGenerations: "compass-mindmap-generations",
  wanderSeconds: "compass-wander-seconds",
});

export const DEFAULTS = Object.freeze({
  "compass-north": MODEL_DEFAULTS.parent,
  "compass-south": MODEL_DEFAULTS.child,
  "compass-west": MODEL_DEFAULTS.friend,
  "compass-east": MODEL_DEFAULTS.challenger,
  "compass-previous": MODEL_DEFAULTS.previous,
  "compass-next": MODEL_DEFAULTS.next,
  "compass-hidden": MODEL_DEFAULTS.hidden,
  "compass-links": true,
  "compass-siblings": true,
  "compass-badges": true,
  "compass-sidecar": true,
  "compass-outline": false,
  "compass-max-zone": "12",
  "compass-pins": [],
  "compass-drawings": true,
  "compass-boards": true,
  "compass-follow": false,
  "compass-related-drawings": true,
  "compass-sort": "connections",
  "compass-cross-links": false,
  "compass-view": "compass",
  "compass-facets-preset": "roles",
  "compass-facets-presets": [],
  "compass-lenses": [],
  "compass-filter-reflow": false,
  "compass-group": false,
  "compass-expanded": false,
  "compass-type-attribute": "Type",
  "compass-flip": false,
  "compass-one-sided": false,
  "compass-trackpad": false,
  "compass-pin-today": true,
  "compass-pin-week": false,
  "compass-pin-month": false,
  "compass-week-format": "YYYY-[W]WW",
  "compass-month-format": "MMMM YYYY",
  "compass-week-start": "monday",
  "compass-mindmap-direction": "right",
  "compass-mindmap-generations": "2",
  "compass-wander-seconds": "6",
});

const SWITCHES = new Set([
  SETTING_IDS.links,
  SETTING_IDS.siblings,
  SETTING_IDS.badges,
  SETTING_IDS.sidecar,
  SETTING_IDS.outline,
  SETTING_IDS.drawings,
  SETTING_IDS.boards,
  SETTING_IDS.follow,
  SETTING_IDS.relatedDrawings,
  SETTING_IDS.crossLinks,
  SETTING_IDS.filterReflow,
  SETTING_IDS.group,
  SETTING_IDS.expanded,
  SETTING_IDS.flip,
  SETTING_IDS.oneSided,
  SETTING_IDS.trackpad,
  SETTING_IDS.pinToday,
  SETTING_IDS.pinWeek,
  SETTING_IDS.pinMonth,
]);

const SELECT_ITEMS = Object.freeze({
  [SETTING_IDS.sort]: Object.freeze(["connections", "name", "edited", "created"]),
  [SETTING_IDS.view]: VIEWS,
  [SETTING_IDS.weekStart]: Object.freeze(["monday", "sunday"]),
  [SETTING_IDS.mindmapDirection]: Object.freeze(["right", "left", "balanced"]),
});

const ROWS = [
  [SETTING_IDS.north, "Parents (north)", "Attributes whose value sits above the center. The first one is written when you drag a node north."],
  [SETTING_IDS.south, "Children (south)", "Attributes whose value sits below. Any attribute not listed anywhere also lands here."],
  [SETTING_IDS.west, "Friends (west)", "Attributes whose value sits to the left, from either end."],
  [SETTING_IDS.east, "Challengers (east)", "Attributes whose value sits to the right, from either end."],
  [SETTING_IDS.previous, "Previous (west)", "The value sits left; seen from the value, this page sits right."],
  [SETTING_IDS.next, "Next (east)", "The value sits right; seen from the value, this page sits left."],
  [SETTING_IDS.hidden, "Hidden", "Attributes Compass leaves out."],
  [SETTING_IDS.links, "Plain links", "Show [[links]] inside the outline (south) and linked references (north)."],
  [SETTING_IDS.siblings, "Siblings", "Show other children of the center's parents."],
  [SETTING_IDS.badges, "Text values", "Show Name:: text values on the center card."],
  [SETTING_IDS.sidecar, "Sidecar", "Keep the center open in the right sidebar."],
  [SETTING_IDS.outline, "Outline", "Expand the center into its blocks."],
  [SETTING_IDS.drawings, "Drawings", "Show drawing thumbnails on nodes and offer New drawing in search when the Plexus extension is installed."],
  [SETTING_IDS.boards, "Boards", "Show boards that contain this page, with a thumbnail, when Plexus Diagram is installed."],
  [SETTING_IDS.follow, "Follow main window", "Recentre when the main window opens another page or block. Off skips that. A pin, typing, or a Compass navigation also skips it."],
  [SETTING_IDS.relatedDrawings, "Related drawings", "When Plexus exposes linksOf, list drawings that share block or link refs with the centre."],
  [SETTING_IDS.maxZone, "Nodes per side", "How many nodes a side shows before it offers Show all."],
  [SETTING_IDS.pins, "Pins", "JSON list of {uid, title}. Use the Pin button instead of editing this."],
  [SETTING_IDS.sort, "Sort nodes", "Order inside a side: connections, name, edited, or created."],
  [SETTING_IDS.crossLinks, "Cross links", "Faint edges between neighbours that reference each other. Off until you turn this on."],
  [SETTING_IDS.view, "Canvas view", "Compass shows directions, Mind Map shows a hierarchy, Facets sorts neighbors into categories."],
  [SETTING_IDS.filterReflow, "Reflow when filtering", "Close the gaps when a filter or lens hides nodes. Off keeps every node in place."],
  [SETTING_IDS.group, "Group nodes by type", "Fold neighbors of the same type into one group on each side."],
  [SETTING_IDS.expanded, "Expanded view", "Show each neighbor's children one level further."],
  [SETTING_IDS.typeAttribute, "Node type attribute", "The attribute whose value names a page's type, used by grouping, lenses and Facets."],
  [SETTING_IDS.flip, "Flip East–West", "Friends and Previous on the right, Challengers and Next on the left. Meanings stay the same."],
  [SETTING_IDS.oneSided, "One-sided layout", "Friends and Challengers share one list on the left."],
  [SETTING_IDS.trackpad, "Trackpad navigation", "Scroll pans and pinch zooms. Off keeps scroll-to-zoom."],
  [SETTING_IDS.pinToday, "Pin Today", "Keep today's daily note in the pin row."],
  [SETTING_IDS.pinWeek, "Pin This week", "Keep this week's page in the pin row."],
  [SETTING_IDS.pinMonth, "Pin This month", "Keep this month's page in the pin row."],
  [SETTING_IDS.weekFormat, "Week page title", "Title pattern for the weekly page. YYYY, MM, DD, WW, GGGG and [text] are understood."],
  [SETTING_IDS.monthFormat, "Month page title", "Title pattern for the monthly page."],
  [SETTING_IDS.weekStart, "Week starts on", "Used by the This week pin."],
  [SETTING_IDS.mindmapDirection, "Mind Map direction", "Where the child tree grows."],
  [SETTING_IDS.mindmapGenerations, "Mind Map generations", "How many generations open at first, 1 to 5."],
  [SETTING_IDS.wanderSeconds, "Wander pace", "Seconds per move, 3 to 15."],
];

function readChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function readText(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function readArray(value) {
  let list = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(list) ? [...list] : [];
}

function readClampedInt(value, min, max, fallback) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(value)));
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return fallback;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  }
  return fallback;
}

function flag(value, fallback) {
  if (value == null || value === "") return fallback;
  if (value === true || value === "on" || value === "true" || value === 1) return true;
  if (value === false || value === "off" || value === "false" || value === 0) return false;
  return Boolean(value);
}

function readPins(value) {
  const list = readArray(value);
  const seen = new Set();
  return list.flatMap((item) => {
    if (!item || typeof item.uid !== "string" || !item.uid || seen.has(item.uid)) return [];
    seen.add(item.uid);
    return [{ uid: item.uid, title: typeof item.title === "string" && item.title ? item.title : item.uid }];
  });
}

function readKey(extensionAPI, id) {
  const value = extensionAPI.settings.get(id);
  return value == null ? DEFAULTS[id] : value;
}

export function readCompassSettings(extensionAPI) {
  if (!extensionAPI?.settings?.get) throw new TypeError("extensionAPI.settings is required");
  const read = (id) => readKey(extensionAPI, id);
  return {
    model: {
      parent: read(SETTING_IDS.north),
      child: read(SETTING_IDS.south),
      friend: read(SETTING_IDS.west),
      challenger: read(SETTING_IDS.east),
      previous: read(SETTING_IDS.previous),
      next: read(SETTING_IDS.next),
      hidden: read(SETTING_IDS.hidden),
      links: flag(read(SETTING_IDS.links), true),
      siblings: flag(read(SETTING_IDS.siblings), true),
      badges: flag(read(SETTING_IDS.badges), true),
      maxPerZone: read(SETTING_IDS.maxZone),
      sort: readChoice(read(SETTING_IDS.sort), SELECT_ITEMS[SETTING_IDS.sort], "connections"),
    },
    sidecar: flag(read(SETTING_IDS.sidecar), true),
    outline: flag(read(SETTING_IDS.outline), false),
    drawings: flag(read(SETTING_IDS.drawings), true),
    boards: flag(read(SETTING_IDS.boards), true),
    follow: flag(read(SETTING_IDS.follow), false),
    relatedDrawings: flag(read(SETTING_IDS.relatedDrawings), true),
    pins: readPins(read(SETTING_IDS.pins)),
    crossLinks: flag(read(SETTING_IDS.crossLinks), false),
    view: readChoice(read(SETTING_IDS.view), SELECT_ITEMS[SETTING_IDS.view], "compass"),
    facetsPreset: readText(read(SETTING_IDS.facetsPreset), "roles"),
    facetsPresets: readArray(read(SETTING_IDS.facetsPresets)),
    lenses: readArray(read(SETTING_IDS.lenses)),
    filterReflow: flag(read(SETTING_IDS.filterReflow), false),
    group: flag(read(SETTING_IDS.group), false),
    expanded: flag(read(SETTING_IDS.expanded), false),
    typeAttribute: readText(read(SETTING_IDS.typeAttribute), "Type"),
    flip: flag(read(SETTING_IDS.flip), false),
    oneSided: flag(read(SETTING_IDS.oneSided), false),
    trackpad: flag(read(SETTING_IDS.trackpad), false),
    pinToday: flag(read(SETTING_IDS.pinToday), true),
    pinWeek: flag(read(SETTING_IDS.pinWeek), false),
    pinMonth: flag(read(SETTING_IDS.pinMonth), false),
    weekFormat: readText(read(SETTING_IDS.weekFormat), DEFAULTS[SETTING_IDS.weekFormat]),
    monthFormat: readText(read(SETTING_IDS.monthFormat), DEFAULTS[SETTING_IDS.monthFormat]),
    weekStart: readChoice(read(SETTING_IDS.weekStart), SELECT_ITEMS[SETTING_IDS.weekStart], "monday"),
    mindmapDirection: readChoice(read(SETTING_IDS.mindmapDirection), SELECT_ITEMS[SETTING_IDS.mindmapDirection], "right"),
    mindmapGenerations: readClampedInt(read(SETTING_IDS.mindmapGenerations), 1, 5, 2),
    wanderSeconds: readClampedInt(read(SETTING_IDS.wanderSeconds), 3, 15, 6),
  };
}

export async function writeSetting(extensionAPI, id, value) {
  if (extensionAPI?.settings?.canSet === false || !extensionAPI?.settings?.set) return;
  await extensionAPI.settings.set(id, value);
}

export async function initializeSettings(extensionAPI) {
  if (!extensionAPI?.settings?.get || !extensionAPI.settings.set) {
    throw new TypeError("extensionAPI.settings is required");
  }
  if (extensionAPI.settings.canSet === false) return;
  for (const [id, value] of Object.entries(DEFAULTS)) {
    if (extensionAPI.settings.get(id) == null) await extensionAPI.settings.set(id, value);
  }
}

function settingAction(id, persist) {
  const items = SELECT_ITEMS[id];
  if (items) {
    return {
      type: "select",
      items: [...items],
      onChange: (event) => persist(id, parseInput(id, typeof event === "string" ? event : event?.target?.value)),
    };
  }
  if (SWITCHES.has(id)) {
    return { type: "switch", onChange: (event) => persist(id, Boolean(event?.target?.checked)) };
  }
  return { type: "input", onChange: (event) => persist(id, parseInput(id, event?.target?.value)) };
}

function parseInput(id, raw) {
  if (id !== SETTING_IDS.pins) return raw ?? "";
  const text = String(raw ?? "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Draft text stays a string until it parses.
  }
  return text;
}

export function createSettingsPanel({ extensionAPI, onChange } = {}) {
  const persist = (id, value) => Promise.resolve(writeSetting(extensionAPI, id, value))
    .catch((error) => console.error("[compass] setting", error))
    .then(() => {
      if (typeof onChange === "function") onChange(id, value);
    });
  return {
    tabTitle: "Compass",
    settings: ROWS.map(([id, name, description]) => ({
      id,
      name,
      description,
      action: settingAction(id, persist),
    })),
  };
}
