export const SETTING_IDS = Object.freeze({
  parents: "compass-parents",
  children: "compass-children",
  friends: "compass-friends",
  challengers: "compass-challengers",
  hidden: "compass-hidden",
  untyped: "compass-untyped",
  siblings: "compass-siblings",
  badges: "compass-badges",
  outline: "compass-outline",
  sidecar: "compass-sidecar",
  maxZone: "compass-max-zone",
  pins: "compass-pins",
  lenses: "compass-lenses",
});

export const DEFAULTS = Object.freeze({
  "compass-parents": "Parent",
  "compass-children": "Child",
  "compass-friends": "Friend, Previous",
  "compass-challengers": "Challenger, Next",
  "compass-hidden": "Hidden",
  "compass-untyped": true,
  "compass-siblings": true,
  "compass-badges": true,
  "compass-outline": false,
  "compass-sidecar": true,
  "compass-max-zone": "24",
  "compass-pins": [],
  "compass-lenses": [],
});

const SWITCHES = new Set([
  SETTING_IDS.untyped,
  SETTING_IDS.siblings,
  SETTING_IDS.badges,
  SETTING_IDS.outline,
  SETTING_IDS.sidecar,
]);

const ROWS = [
  [SETTING_IDS.parents, "Parents", "Comma-separated attribute titles for north."],
  [SETTING_IDS.children, "Children", "Comma-separated attribute titles for south."],
  [SETTING_IDS.friends, "Friends", "Comma-separated attribute titles for west."],
  [SETTING_IDS.challengers, "Challengers", "Comma-separated attribute titles for east."],
  [SETTING_IDS.hidden, "Hidden", "Comma-separated attribute titles to drop."],
  [SETTING_IDS.untyped, "Untyped links", "Show plain page links and mentions."],
  [SETTING_IDS.siblings, "Siblings", "Show sibling pages from an inverse parent."],
  [SETTING_IDS.badges, "Badges", "Show scalar text on the center card."],
  [SETTING_IDS.outline, "Outline", "Show direct child blocks under the center."],
  [SETTING_IDS.sidecar, "Sidecar", "Open the center in the right sidebar."],
  [SETTING_IDS.maxZone, "Max per zone", "Relation nodes kept in each zone."],
  [SETTING_IDS.pins, "Pins", "JSON list of uid and title."],
  [SETTING_IDS.lenses, "Lenses", "JSON list of named lenses."],
];

function flag(value, fallback) {
  if (value == null || value === "") return fallback;
  if (value === true || value === "on" || value === "true" || value === 1) return true;
  if (value === false || value === "off" || value === "false" || value === 0) return false;
  return Boolean(value);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readPins(value) {
  return asArray(value).flatMap((item) => {
    if (!item || typeof item.uid !== "string" || !item.uid) return [];
    const title = typeof item.title === "string" && item.title ? item.title : item.uid;
    return [{ uid: item.uid, title }];
  });
}

function nameList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function readLenses(value) {
  return asArray(value).flatMap((item) => {
    if (!item || typeof item.name !== "string" || !item.name.trim()) return [];
    return [{
      name: item.name.trim(),
      keyword: typeof item.keyword === "string" ? item.keyword : "",
      attributes: {
        include: nameList(item.attributes?.include),
        exclude: nameList(item.attributes?.exclude),
      },
      kinds: { include: nameList(item.kinds?.include) },
    }];
  });
}

function readKey(extensionAPI, id) {
  const value = extensionAPI.settings.get(id);
  return value == null ? DEFAULTS[id] : value;
}

export function readCompassSettings(extensionAPI) {
  if (!extensionAPI?.settings?.get) throw new TypeError("extensionAPI.settings is required");
  const parents = readKey(extensionAPI, SETTING_IDS.parents);
  const children = readKey(extensionAPI, SETTING_IDS.children);
  const friends = readKey(extensionAPI, SETTING_IDS.friends);
  const challengers = readKey(extensionAPI, SETTING_IDS.challengers);
  const hidden = readKey(extensionAPI, SETTING_IDS.hidden);
  const maxZone = readKey(extensionAPI, SETTING_IDS.maxZone);
  const untyped = flag(readKey(extensionAPI, SETTING_IDS.untyped), true);
  const siblings = flag(readKey(extensionAPI, SETTING_IDS.siblings), true);
  const badges = flag(readKey(extensionAPI, SETTING_IDS.badges), true);
  const outline = flag(readKey(extensionAPI, SETTING_IDS.outline), false);
  const sidecar = flag(readKey(extensionAPI, SETTING_IDS.sidecar), true);
  return {
    parents,
    children,
    friends,
    challengers,
    hidden,
    maxZone,
    untyped,
    siblings,
    badges,
    outline,
    sidecar,
    pins: readPins(readKey(extensionAPI, SETTING_IDS.pins)),
    lenses: readLenses(readKey(extensionAPI, SETTING_IDS.lenses)),
    model: {
      parents,
      children,
      friends,
      challengers,
      hidden,
      maxPerZone: maxZone,
      showUntyped: untyped,
      showSiblings: siblings,
      showBadges: badges,
      showOutline: outline,
    },
  };
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

function parseInput(id, raw) {
  if (id === SETTING_IDS.pins || id === SETTING_IDS.lenses) {
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
  return raw ?? "";
}

export function createSettingsPanel({ extensionAPI, onChange } = {}) {
  const persist = (id, value) => {
    const write = extensionAPI?.settings?.canSet === false || !extensionAPI?.settings?.set
      ? Promise.resolve()
      : Promise.resolve(extensionAPI.settings.set(id, value)).catch((error) => {
        console.error("[compass] setting", error);
      });
    return write.then(() => {
      if (typeof onChange === "function") onChange(id, value);
    });
  };
  return {
    tabTitle: "Compass",
    settings: ROWS.map(([id, name, description]) => ({
      id,
      name,
      description,
      action: SWITCHES.has(id)
        ? {
          type: "switch",
          onChange: (event) => persist(id, Boolean(event?.target?.checked)),
        }
        : {
          type: "input",
          onChange: (event) => persist(id, parseInput(id, event?.target?.value)),
        },
    })),
  };
}
