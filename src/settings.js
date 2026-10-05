import { MODEL_DEFAULTS } from "./model/neighborhood.js";

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
]);

const SORTS = Object.freeze(["connections", "name", "edited", "created"]);

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
];

function readSort(value) {
  return SORTS.includes(value) ? value : "connections";
}

function flag(value, fallback) {
  if (value == null || value === "") return fallback;
  if (value === true || value === "on" || value === "true" || value === 1) return true;
  if (value === false || value === "off" || value === "false" || value === 0) return false;
  return Boolean(value);
}

function readPins(value) {
  let list = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value);
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
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
      sort: readSort(read(SETTING_IDS.sort)),
    },
    sidecar: flag(read(SETTING_IDS.sidecar), true),
    outline: flag(read(SETTING_IDS.outline), false),
    drawings: flag(read(SETTING_IDS.drawings), true),
    boards: flag(read(SETTING_IDS.boards), true),
    follow: flag(read(SETTING_IDS.follow), false),
    relatedDrawings: flag(read(SETTING_IDS.relatedDrawings), true),
    pins: readPins(read(SETTING_IDS.pins)),
    crossLinks: flag(read(SETTING_IDS.crossLinks), false),
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
  if (id === SETTING_IDS.sort) {
    return {
      type: "select",
      items: ["connections", "name", "edited", "created"],
      onChange: (event) => persist(id, parseInput(id, event?.target?.value)),
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
