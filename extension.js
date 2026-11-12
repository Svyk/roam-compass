/* Compass v1.0.0 | MIT | generated; edit src/ */

// src/lifecycle.js
function isPromiseLike(value) {
  return value != null && typeof value.then === "function";
}
async function callSafely(disposer) {
  const result = disposer();
  if (isPromiseLike(result)) await result;
}
function createLifecycle() {
  let disposed = false;
  const disposers = [];
  const add = (disposer) => {
    if (typeof disposer !== "function") throw new TypeError("A disposer must be a function");
    if (disposed) {
      void callSafely(disposer).catch((error) => console.error("[compass] Late cleanup failed", error));
      return disposer;
    }
    disposers.push(disposer);
    return disposer;
  };
  return {
    get disposed() {
      return disposed;
    },
    add,
    async command(commandApi, config) {
      if (!commandApi?.addCommand || !commandApi?.removeCommand) {
        throw new TypeError("A command API with addCommand/removeCommand is required");
      }
      await commandApi.addCommand(config);
      add(() => commandApi.removeCommand({ label: config.label }));
    },
    event(target, type, listener, options) {
      target.addEventListener(type, listener, options);
      add(() => target.removeEventListener(type, listener, options));
      return listener;
    },
    interval(callback, delay, ...args) {
      const id = globalThis.setInterval(callback, delay, ...args);
      add(() => globalThis.clearInterval(id));
      return id;
    },
    timeout(callback, delay, ...args) {
      const id = globalThis.setTimeout(callback, delay, ...args);
      add(() => globalThis.clearTimeout(id));
      return id;
    },
    observer(observer, target, options) {
      observer.observe(target, options);
      add(() => observer.disconnect());
      return observer;
    },
    node(node, parent = globalThis.document?.body) {
      if (!parent) throw new Error("A parent node is required outside the browser");
      parent.append(node);
      add(() => node.remove());
      return node;
    },
    pullWatch(dataApi, pattern, entity, callback) {
      if (!dataApi?.addPullWatch || !dataApi?.removePullWatch) {
        throw new TypeError("A Roam data API with addPullWatch/removePullWatch is required");
      }
      dataApi.addPullWatch(pattern, entity, callback);
      add(() => dataApi.removePullWatch(pattern, entity, callback));
      return callback;
    },
    async settingsPanel(extensionAPI, config) {
      await extensionAPI.settings.panel.create(config);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      const errors = [];
      for (const disposer of disposers.splice(0).reverse()) {
        try {
          await callSafely(disposer);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, "One or more extension cleanups failed");
    }
  };
}

// src/model/batch7.js
var REGION_PREFIX = "{{[[plexus-region]]";
var DRAWING_PREFIXES = ["{{[[excalidraw]]}}", "{{excalidraw}}"];
var URL_RUN = /https?:\/\/[^\s)]+/gi;
function blockText(node) {
  return typeof node?.string === "string" ? node.string.trimStart() : "";
}
function isRegion(node) {
  return blockText(node).startsWith(REGION_PREFIX);
}
function isDrawing(node) {
  if (isRegion(node)) return false;
  const text = blockText(node);
  return DRAWING_PREFIXES.some((prefix) => text.startsWith(prefix));
}
function chipKeeps(node, flags) {
  const region = isRegion(node);
  const drawing = isDrawing(node);
  if (flags.pages && node.kind === "page") return true;
  if (flags.blocks && node.kind === "block" && !drawing && !region) return true;
  if (flags.drawings && drawing) return true;
  if (flags.regions && region) return true;
  return false;
}
function keywordHits(node, keyword) {
  const needle = String(keyword ?? "").trim().toLowerCase();
  if (!needle) return true;
  const title = typeof node.title === "string" ? node.title.toLowerCase() : "";
  const alias = typeof node.alias === "string" ? node.alias.toLowerCase() : "";
  return title.includes(needle) || alias.includes(needle);
}
function hiddenUids(nodes, opts = {}) {
  const flags = {
    pages: opts.pages ?? true,
    blocks: opts.blocks ?? true,
    drawings: opts.drawings ?? true,
    regions: opts.regions ?? true
  };
  if (!Array.isArray(nodes)) return [];
  const hidden = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    if (!chipKeeps(node, flags) || !keywordHits(node, opts.keyword ?? "")) hidden.push(node.uid);
  }
  return hidden;
}
function hostOf(raw) {
  let hostname;
  try {
    hostname = new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
  if (hostname.startsWith("www.")) hostname = hostname.slice(4);
  return hostname;
}
function urlGroups(strings, { hosts = 4, perHost = 4 } = {}) {
  const order = [];
  const grouped = /* @__PURE__ */ new Map();
  if (!Array.isArray(strings)) return [];
  for (const item of strings) {
    if (typeof item !== "string") continue;
    URL_RUN.lastIndex = 0;
    let match;
    while (match = URL_RUN.exec(item)) {
      const host = hostOf(match[0]);
      if (!host) continue;
      let urls = grouped.get(host);
      if (!urls) {
        if (order.length >= hosts) continue;
        urls = [];
        grouped.set(host, urls);
        order.push(host);
      }
      if (urls.length >= perHost) continue;
      urls.push(match[0]);
    }
  }
  return order.map((host) => ({ host, urls: grouped.get(host) }));
}
var CROSS_QUERY = "[:find ?suid ?duid :in $ [?uid ...] :where [?src :block/uid ?uid] [?src :block/children ?ch] [?ch :block/refs ?dst] [?src :block/uid ?suid] [?dst :block/uid ?duid]]";
function crossEdges(rows, uids, cap = 40) {
  const allowed = uids instanceof Set ? uids : new Set(Array.isArray(uids) ? uids : []);
  const limit = cap ?? 40;
  const seen = /* @__PURE__ */ new Map();
  const edges = [];
  if (!Array.isArray(rows)) return [];
  for (const row of rows) {
    if (edges.length >= limit) break;
    if (!Array.isArray(row) || row.length !== 2) continue;
    const [source, target] = row;
    if (!allowed.has(source) || !allowed.has(target) || source === target) continue;
    let targets = seen.get(source);
    if (!targets) {
      targets = /* @__PURE__ */ new Set();
      seen.set(source, targets);
    }
    if (targets.has(target)) continue;
    targets.add(target);
    edges.push({ source, target });
  }
  return edges;
}
function isEmptyPage(kind, childCount) {
  return kind === "page" && childCount === 0;
}
var ZONE_ATTR = Object.freeze({
  north: "Parent",
  south: "Child",
  west: "Friend",
  east: "Challenger"
});
function planZoneCreate({ existingDrawingUid } = {}) {
  if (typeof existingDrawingUid === "string" && existingDrawingUid.length > 0) {
    return { create: false, drawingUid: existingDrawingUid };
  }
  return { create: true, drawingUid: null };
}
function refused(reason) {
  return { ops: [], reason };
}
function planAttributeWrite({ attribute, title, existing } = {}) {
  if (typeof attribute !== "string" || attribute.trim() === "") return refused("attribute");
  if (typeof title !== "string" || title.includes("[") || title.includes("]")) return refused("title");
  const ref = `[[${title}]]`;
  if (existing == null) return { ops: [{ op: "create", string: `${attribute}:: ${ref}` }] };
  const current = typeof existing.string === "string" ? existing.string : String(existing.string ?? "");
  if (current.includes(ref)) return refused("have");
  return { ops: [{ op: "update", uid: existing.uid, string: `${current.trim()} ${ref}` }] };
}

// src/model/ontology.js
var ROLES = ["parent", "child", "friend", "challenger", "previous", "next"];
var INVERSE = Object.freeze({
  parent: "child",
  child: "parent",
  friend: "friend",
  challenger: "challenger",
  previous: "next",
  next: "previous"
});
var READ_ONLY = [/^BT_attr/i, /^aliases$/i, /^roam\//i];
function sameName(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}
function isReadOnly(name) {
  return READ_ONLY.some((pattern) => pattern.test(String(name ?? "")));
}
function isWritableName(name) {
  if (typeof name !== "string") return false;
  const clean = name.trim();
  if (!clean || clean.includes("::") || /[[\]\n]/.test(clean) || isReadOnly(clean)) return false;
  return true;
}
function parseRoleList(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  const names = [];
  const pairs = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of raw) {
    const sides = String(item ?? "").split("|").map((part) => part.trim()).filter(Boolean);
    if (!sides.length) continue;
    const name = sides[0];
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (sides.length >= 2) {
      pairs.push([name, sides[1]]);
    }
  }
  return { names, pairs };
}
function buildOntology(rawLists = {}) {
  const parsed = {};
  const lists = {};
  for (const role of ROLES) {
    parsed[role] = parseRoleList(rawLists?.[role]);
    lists[role] = [...parsed[role].names];
  }
  const pairs = /* @__PURE__ */ new Map();
  const addPair = (left, right) => {
    const lk = left.toLowerCase();
    const rk = right.toLowerCase();
    if (pairs.has(lk) || pairs.has(rk)) return false;
    if (lk === rk) {
      pairs.set(lk, left);
      return true;
    }
    pairs.set(lk, right);
    pairs.set(rk, left);
    return true;
  };
  for (const role of ROLES) {
    const inverse = INVERSE[role];
    for (const [name, partner] of parsed[role].pairs) {
      if (addPair(name, partner) && !lists[inverse].some((item) => sameName(item, partner))) {
        lists[inverse].push(partner);
      }
    }
  }
  const builtins = [
    ["parent", "Parent", "child", "Child"],
    ["previous", "Previous", "next", "Next"]
  ];
  for (const [leftRole, leftDefault, rightRole, rightDefault] of builtins) {
    const leftName = lists[leftRole].find((item) => sameName(item, leftDefault));
    const rightName = lists[rightRole].find((item) => sameName(item, rightDefault));
    if (leftName && rightName) addPair(leftName, rightName);
  }
  return { lists, pairs };
}
function captionFor(attribute, direction, pairs) {
  const name = String(attribute ?? "");
  if (direction === "in" && pairs instanceof Map) {
    const partner = pairs.get(name.trim().toLowerCase());
    if (partner) return partner;
  }
  return name;
}
function inverseAttribute(attribute, role, ontology) {
  const key = String(attribute ?? "").trim().toLowerCase();
  if (key && ontology?.pairs instanceof Map) {
    const partner = ontology.pairs.get(key);
    if (partner) return isWritableName(partner) ? partner.trim() : null;
  }
  const inverse = INVERSE[role];
  if (!inverse) return null;
  const candidates = ontology?.lists?.[inverse];
  if (!Array.isArray(candidates)) return null;
  const chosen = candidates.find((item) => isWritableName(item));
  return chosen ? chosen.trim() : null;
}

// src/model/text.js
var TAG_CHAR = /[\p{L}\p{N}_\-/.@&%+=~*']/u;
var UID_RE = /^[\w-]{1,64}$/;
function matchBrackets(text, start) {
  let depth = 0;
  let index = start;
  while (index < text.length - 1) {
    if (text[index] === "[" && text[index + 1] === "[") {
      depth += 1;
      index += 2;
      continue;
    }
    if (text[index] === "]" && text[index + 1] === "]") {
      depth -= 1;
      index += 2;
      if (depth === 0) return index;
      continue;
    }
    index += 1;
  }
  return -1;
}
function skipCode(text, index) {
  if (text.startsWith("```", index)) {
    const end2 = text.indexOf("```", index + 3);
    return end2 < 0 ? text.length : end2 + 3;
  }
  const end = text.indexOf("`", index + 1);
  return end < 0 ? text.length : end + 1;
}
function tagEnd(text, index) {
  let end = index;
  while (end < text.length && TAG_CHAR.test(text[end])) end += 1;
  while (end > index && /[.,'*]/.test(text[end - 1])) end -= 1;
  return end;
}
function isClassTitle(title) {
  return title.startsWith(".");
}
function scanRefs(input, { nested = true } = {}) {
  const text = String(input ?? "");
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "`") {
      index = skipCode(text, index);
      continue;
    }
    if (char === "{" && text[index + 1] === "{") {
      index += 2;
      while (text[index] === " ") index += 1;
      if (text.startsWith("[[", index)) {
        const end = matchBrackets(text, index);
        index = end < 0 ? text.length : end;
      } else {
        while (index < text.length && !/[:}\s]/.test(text[index])) index += 1;
      }
      continue;
    }
    if (char === "(" && text[index + 1] === "(") {
      const end = text.indexOf("))", index + 2);
      const uid = end < 0 ? "" : text.slice(index + 2, end);
      if (UID_RE.test(uid)) {
        tokens.push({ type: "block", uid, raw: text.slice(index, end + 2), start: index, end: end + 2, nested: false });
        index = end + 2;
        continue;
      }
      index += 1;
      continue;
    }
    const hashed = char === "#";
    const open = hashed ? index + 1 : index;
    if (text[open] === "[" && text[open + 1] === "[") {
      const end = matchBrackets(text, open);
      if (end < 0) {
        index = open + 2;
        continue;
      }
      const title = text.slice(open + 2, end - 2);
      if (title.trim()) {
        tokens.push({
          type: "page",
          title,
          raw: text.slice(index, end),
          start: index,
          end,
          nested: false,
          classTag: hashed && isClassTitle(title)
        });
        if (nested && title.includes("[[")) {
          for (const inner of scanRefs(title, { nested })) {
            tokens.push({
              ...inner,
              start: inner.start + open + 2,
              end: inner.end + open + 2,
              nested: true
            });
          }
        }
      }
      index = end;
      continue;
    }
    if (hashed && (index === 0 || /[\s(]/.test(text[index - 1]))) {
      const end = tagEnd(text, index + 1);
      if (end > index + 1) {
        const title = text.slice(index + 1, end);
        tokens.push({
          type: "page",
          title,
          raw: text.slice(index, end),
          start: index,
          end,
          nested: false,
          classTag: isClassTitle(title)
        });
        index = end;
        continue;
      }
    }
    index += 1;
  }
  return tokens;
}
function parseAttribute(input) {
  const text = String(input ?? "");
  const match = /^(\s*(?:\[\[([^[\]\n]+)\]\]|([^\s:`[\]{}\n][^:`[\]{}\n]*?))\s*::)/.exec(text);
  if (!match) return null;
  const name = (match[2] ?? match[3] ?? "").trim();
  if (!name) return null;
  return { name, prefix: match[1], tail: text.slice(match[1].length) };
}
function tailShape(tail) {
  const text = String(tail ?? "");
  const tokens = scanRefs(text, { nested: false });
  let leftover = text;
  for (const token of [...tokens].sort((a, b) => b.start - a.start)) {
    leftover = leftover.slice(0, token.start) + " " + leftover.slice(token.end);
  }
  const values = tokens.filter((token) => !token.classTag);
  const blank = leftover.trim() === "";
  if (!blank) return { kind: "text", values: [] };
  if (!values.length) return { kind: "bare", values: [] };
  return { kind: "refs", values };
}
function tokenMatches(token, target) {
  if (!token || !target) return false;
  if (token.type === "block") return target.uid != null && token.uid === target.uid;
  return target.title != null && token.title === target.title;
}
function removeToken(text, token) {
  const before = text.slice(0, token.start).replace(/[ \t]+$/, "");
  const after = text.slice(token.end).replace(/^[ \t]+/, "");
  if (!before) return after;
  if (!after) return before;
  return `${before} ${after}`;
}
function refMarkup(target) {
  if (target?.title) return `[[${target.title}]]`;
  if (target?.uid) return `((${target.uid}))`;
  return "";
}
function plainText(input, max = 90) {
  let text = String(input ?? "");
  text = text.replace(/\{\{\s*\[\[(TODO|DONE)\]\]\s*\}\}/g, "$1");
  text = text.replace(/\{\{\s*\[\[([^\]]+)\]\][^}]*\}\}/g, "$1");
  text = text.replace(/\{\{([^}]*)\}\}/g, "$1");
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => alt || "image");
  text = text.replace(/\[([^\]]+)\]\((?:\[\[[^\]]*\]\]|\(\([^)]*\)\)|[^)]*)\)/g, "$1");
  text = text.replace(/#\[\[([^\]]+)\]\]/g, "#$1");
  for (let pass = 0; pass < 3 && text.includes("[["); pass += 1) {
    text = text.replace(/\[\[([^[\]]*)\]\]/g, "$1");
  }
  text = text.replace(/\(\(([\w-]+)\)\)/g, "(( ))");
  text = text.replace(/\*\*|__|\^\^|~~|`/g, "");
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > max) text = `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
  return text;
}
function drawingTitle(input, max = 90) {
  const text = String(input ?? "").trimStart();
  const region = /^\{\{\s*\[\[plexus-region\]\][^}]*\}\}/.exec(text);
  if (region) return plainText(text.slice(region[0].length), max) || "Region";
  if (/^\{\{\s*(\[\[excalidraw\]\]|excalidraw)\s*\}\}/.test(text)) {
    const info = /Text elements in drawing:\s*([^;}]*)/.exec(text);
    const first = info ? plainText(info[1], max) : "";
    return first ? `Drawing: ${first}` : "Drawing";
  }
  return null;
}
function regionOwner(input) {
  const head = /^\{\{\s*\[\[plexus-region\]\]([^}]*)\}\}/.exec(String(input ?? "").trimStart());
  return head ? /(?:^|[\s:])d=([\w-]+)/.exec(head[1])?.[1] ?? null : null;
}
function splitNames(value) {
  const parts = Array.isArray(value) ? value : String(value ?? "").split(",");
  const names = [];
  for (const part of parts) {
    const name = String(part).trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

// src/model/neighborhood.js
var ROLES2 = ["parent", "child", "friend", "challenger", "previous", "next"];
var ZONES = ["north", "south", "west", "east", "siblings"];
var ZONE_OF = Object.freeze({
  parent: "north",
  child: "south",
  friend: "west",
  previous: "west",
  challenger: "east",
  next: "east",
  sibling: "siblings"
});
var DROP_ROLE = Object.freeze({ north: "parent", south: "child", west: "friend", east: "challenger" });
var INVERSE2 = Object.freeze({
  parent: "child",
  child: "parent",
  friend: "friend",
  challenger: "challenger",
  previous: "next",
  next: "previous"
});
var READ_ONLY2 = [/^BT_attr/i, /^aliases$/i, /^roam\//i];
var STRENGTH = Object.freeze({ typed: 3, structural: 2, link: 1, mention: 1, sibling: 0 });
var BADGE_CAP = 8;
var MODEL_DEFAULTS = Object.freeze({
  parent: "Parent, Up, Part of, Is a, Type, Category, Project, BT_attrProject",
  child: "Child, Has part, Contains",
  friend: "Friend, Related, See also",
  challenger: "Challenger, Opposes, Contradicts",
  previous: "Previous",
  next: "Next",
  hidden: "Hidden"
});
function flag(value, fallback) {
  if (value == null || value === "") return fallback;
  if (value === true || value === "true" || value === "on" || value === 1) return true;
  if (value === false || value === "false" || value === "off" || value === 0) return false;
  return Boolean(value);
}
function count(value, fallback) {
  const number = Number(value);
  if (value == null || value === "" || !Number.isFinite(number) || number < 1) return fallback;
  return Math.floor(number);
}
var SORT_MODES = /* @__PURE__ */ new Set(["connections", "name", "edited", "created"]);
function sortMode(value) {
  return SORT_MODES.has(value) ? value : "connections";
}
function modelSettings(raw = {}) {
  let lists;
  let pairs;
  if (raw?.lists && raw?.pairs instanceof Map && ROLES2.every((role) => raw[role] == null)) {
    lists = {};
    for (const role of ROLES2) lists[role] = [...raw.lists[role] ?? []];
    pairs = new Map(raw.pairs);
  } else {
    const rawLists = {};
    for (const role of ROLES2) rawLists[role] = raw?.[role] ?? MODEL_DEFAULTS[role];
    ({ lists, pairs } = buildOntology(rawLists));
  }
  return {
    lists,
    pairs,
    hidden: splitNames(raw?.hidden ?? MODEL_DEFAULTS.hidden),
    links: flag(raw?.links, true),
    siblings: flag(raw?.siblings, true),
    badges: flag(raw?.badges, true),
    maxPerZone: count(raw?.maxPerZone, 12),
    sort: sortMode(raw?.sort)
  };
}
function sameName2(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}
function roleOf(attribute, settings) {
  const name = String(attribute ?? "").trim();
  if (!name) return null;
  if (settings.hidden.some((item) => sameName2(item, name))) return null;
  for (const role of ROLES2) {
    if (settings.lists[role].some((item) => sameName2(item, name))) return { role, explicit: true };
  }
  return { role: "child", explicit: false };
}
function inverseRole(role) {
  return INVERSE2[role] ?? role;
}
function isReadOnlyAttribute(name) {
  return READ_ONLY2.some((pattern) => pattern.test(String(name ?? "")));
}
function attributeForRole(role, settings) {
  const name = settings.lists[role]?.[0];
  if (!name || name.includes("::") || /[[\]\n]/.test(name) || isReadOnlyAttribute(name)) return null;
  return name;
}
function blockTitle(uid, string, max, resolveRegion) {
  if (resolveRegion && regionOwner(string) !== null) {
    const label = resolveRegion(uid, string);
    if (label) return label.length > max ? `${label.slice(0, Math.max(1, max - 1)).trimEnd()}…` : label;
  }
  return drawingTitle(string, max) ?? plainText(string ?? "", max);
}
function titleOf(entity, resolveRegion) {
  if (!entity) return "";
  if (typeof entity.title === "string" && entity.title) return entity.title;
  return blockTitle(entity.uid, entity.string, 90, resolveRegion);
}
function isDrawingLike(node) {
  const text = typeof node?.string === "string" ? node.string.trimStart() : "";
  return text.startsWith("{{[[excalidraw]]}}") || text.startsWith("{{excalidraw}}") || text.startsWith("{{[[plexus-region]]");
}
function plexusKind(node) {
  if (!isDrawingLike(node)) return null;
  return node.string.trimStart().startsWith("{{[[plexus-region]]") ? "region" : "drawing";
}
function plexusOpenPlan(api, target, sidebar) {
  if (!target || !api || !(api.apiVersion >= 2) || typeof api.open !== "function") return null;
  return { closeFirst: target === "region" || !sidebar };
}
function createPlexusOpener({ plexus: plexus2, close, host, plexusKindOf, nodeKind }) {
  function viaPlexus(uid, sidebar) {
    const api = plexus2();
    const plan = plexusOpenPlan(api, plexusKindOf(uid), sidebar);
    if (!plan) return null;
    if (plan.closeFirst) close();
    try {
      return Promise.resolve(api.open(uid, { sidebar })).catch((error) => console.error("[compass] open", error));
    } catch (error) {
      console.error("[compass] open", error);
      return null;
    }
  }
  function openSidebar(uid, kind = nodeKind(uid)) {
    const routed = viaPlexus(uid, true);
    if (routed) return routed;
    return host.openInSidebar(uid, kind).catch((error) => console.error("[compass] open", error));
  }
  function openMain(uid, kind = nodeKind(uid)) {
    const routed = viaPlexus(uid, false);
    if (routed) return routed;
    close();
    return host.openInMain(uid, kind).catch((error) => console.error("[compass] open", error));
  }
  return { openSidebar, openMain };
}
function kindOf(entity) {
  return typeof entity?.title === "string" && entity.title ? "page" : "block";
}
function isNode(entity) {
  return Boolean(entity?.uid) && (typeof entity.title === "string" || typeof entity.string === "string");
}
function labelsText(labels) {
  return (labels ?? []).map((label) => `${label.attribute}: ${label.text}`);
}
function walk(blocks, visit2, depth = 0, parentUid = null) {
  for (const block of blocks ?? []) {
    if (!block?.uid) continue;
    visit2(block, depth, parentUid);
    walk(block.children, visit2, depth + 1, block.uid);
  }
}
function resolveTokens(tokens, refs) {
  const byTitle = /* @__PURE__ */ new Map();
  const byUid = /* @__PURE__ */ new Map();
  for (const ref of refs ?? []) {
    if (!ref?.uid) continue;
    byUid.set(ref.uid, ref);
    if (typeof ref.title === "string") byTitle.set(ref.title, ref);
  }
  const found = [];
  for (const token of tokens) {
    if (token.classTag) continue;
    const ref = token.type === "block" ? byUid.get(token.uid) : byTitle.get(token.title);
    if (ref && !found.includes(ref)) found.push(ref);
  }
  return found;
}
function linkRefs(block) {
  const attribute = parseAttribute(block?.string);
  const text = attribute ? attribute.tail : block?.string;
  return resolveTokens(scanRefs(text), block?.refs);
}
function outlineIndex(outline, resolveRegion) {
  const index = /* @__PURE__ */ new Map();
  const rows = [];
  walk(outline, (block, depth, parentUid) => {
    index.set(block.uid, { parentUid, depth });
    rows.push({
      uid: block.uid,
      text: blockTitle(block.uid, block.string, 72, resolveRegion) || " ",
      depth,
      parentUid,
      childCount: (block.children ?? []).filter((child) => child?.uid).length,
      plexus: plexusKind(block)
    });
  });
  return { index, rows };
}
function finiteTime(value) {
  return Number.isFinite(value) ? value : 0;
}
function aliasOf(entity, aliases) {
  const named = entity?.nameAlias;
  if (typeof named === "string" && named !== "") return named;
  const listed = aliases?.[entity?.uid];
  if (typeof listed === "string" && listed !== "") return listed;
  return "";
}
function compareTitle(a, b) {
  const at = a.title.toLowerCase();
  const bt = b.title.toLowerCase();
  if (at !== bt) return at < bt ? -1 : 1;
  return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
}
function compareNodes(a, b, sort) {
  if (sort === "name") {
    const an = (a.alias || a.title).toLowerCase();
    const bn = (b.alias || b.title).toLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
  }
  if (sort === "edited" || sort === "created") {
    const key = sort === "edited" ? "editTime" : "createTime";
    const at = finiteTime(a[key]);
    const bt = finiteTime(b[key]);
    if (at === 0 !== (bt === 0)) return at === 0 ? 1 : -1;
    if (at !== bt) return bt - at;
    return compareTitle(a, b);
  }
  if (a.strength !== b.strength) return b.strength - a.strength;
  return compareTitle(a, b);
}
function pickRole(evidence) {
  const top = Math.max(...evidence.map((item) => STRENGTH[item.kind] ?? 0));
  let strongest = evidence.filter((item) => (STRENGTH[item.kind] ?? 0) === top);
  if (strongest.some((item) => item.explicit)) strongest = strongest.filter((item) => item.explicit);
  const roles = [...new Set(strongest.map((item) => item.role))];
  return { role: roles.length === 1 ? roles[0] : "friend", strength: top, strongest };
}
function typedParentUids(snapshot, rawSettings, limit = 6) {
  const settings = modelSettings(rawSettings);
  const uids = [];
  const push = (uid) => {
    if (uid && uid !== snapshot?.center?.uid && !uids.includes(uid) && uids.length < limit) uids.push(uid);
  };
  for (const harc of snapshot?.out ?? []) {
    if (roleOf(harc.attribute, settings)?.role !== "parent") continue;
    for (const value of harc.values ?? []) if (kindOf(value) === "page") push(value.uid);
  }
  for (const harc of snapshot?.in ?? []) {
    if (roleOf(harc.attribute, settings)?.role !== "child") continue;
    if (kindOf(harc.entity) === "page") push(harc.entity.uid);
  }
  return uids;
}
function plexusRegionLabels(api) {
  if (typeof api?.regionsOf !== "function") return null;
  const owners = /* @__PURE__ */ new Map();
  return (uid, string) => {
    const owner = regionOwner(string);
    if (!owner) return null;
    if (!owners.has(owner)) {
      let entries = [];
      try {
        const got = api.regionsOf(owner);
        if (Array.isArray(got)) entries = got;
      } catch (error) {
        console.warn("[compass] Plexus regionsOf failed", error);
      }
      owners.set(owner, entries);
    }
    const label = owners.get(owner).find((entry) => entry?.uid === uid)?.label;
    return typeof label === "string" && label.trim() ? label : null;
  };
}
function regionResolver(resolve) {
  return (uid, string) => {
    try {
      const label = resolve(uid, string);
      return typeof label === "string" && label.trim() ? label.trim() : null;
    } catch {
      return null;
    }
  };
}
function shapedExtra(raw, zone, role, style) {
  const uid = raw?.uid;
  if (typeof uid !== "string" || !uid) return null;
  const title = typeof raw.title === "string" && raw.title ? raw.title : uid;
  return {
    uid,
    kind: raw.kind || "page",
    title,
    string: typeof raw.string === "string" ? raw.string : "",
    alias: "",
    editTime: 0,
    createTime: 0,
    role,
    zone,
    strength: 2,
    style,
    evidence: [{ kind: style, role }],
    label: typeof raw.label === "string" ? raw.label : style === "board" ? "On board" : "",
    writable: null,
    via: null
  };
}
function appendExtras(kept, raws, zone, role, style, cap, centerUid) {
  if (!Array.isArray(raws)) return;
  const seen = new Set(kept.map((node) => node.uid));
  if (centerUid) seen.add(centerUid);
  const limit = Number.isFinite(cap) ? cap : raws.length;
  let added = 0;
  for (const raw of raws) {
    if (added >= limit) break;
    const node = shapedExtra(raw, zone, role, style);
    if (!node || node.uid === centerUid) continue;
    const existing = kept.find((item) => item.uid === node.uid);
    if (existing) {
      existing.style = style;
      existing.zone = zone;
      existing.role = role;
      existing.label = node.label;
      existing.evidence = node.evidence;
      added += 1;
      continue;
    }
    if (seen.has(node.uid)) continue;
    seen.add(node.uid);
    kept.push(node);
    added += 1;
  }
}
function buildNeighborhood(snapshot, rawSettings = {}, options = {}) {
  const settings = modelSettings(rawSettings);
  const source = snapshot ?? {};
  const center = source.center ?? {};
  const centerUid = center.uid ?? "";
  const expanded = options.expanded instanceof Set ? options.expanded : /* @__PURE__ */ new Set();
  const entities = /* @__PURE__ */ new Map();
  const evidence = /* @__PURE__ */ new Map();
  const badges = [];
  const resolveRegion = typeof options.regionLabel === "function" ? regionResolver(options.regionLabel) : null;
  const outline = outlineIndex(source.outline, resolveRegion);
  function add(entity, item) {
    if (!isNode(entity) || entity.uid === centerUid) return;
    if (!entities.has(entity.uid)) entities.set(entity.uid, entity);
    else if (!entities.get(entity.uid).title && entity.title) entities.set(entity.uid, entity);
    const list = evidence.get(entity.uid) ?? [];
    list.push(item);
    evidence.set(entity.uid, list);
  }
  const typedSources = /* @__PURE__ */ new Set();
  const typedValueBlocks = /* @__PURE__ */ new Set();
  for (const harc of source.out ?? []) {
    const mapping = roleOf(harc.attribute, settings);
    if (!mapping) continue;
    const readOnly = isReadOnlyAttribute(harc.attribute);
    if (harc.source?.uid) typedSources.add(harc.source.uid);
    if (harc.source && tailShape(parseAttribute(harc.source.string)?.tail).kind === "bare") {
      for (const child of harc.source.children ?? []) {
        if (!parseAttribute(child.string)) typedValueBlocks.add(child.uid);
      }
    }
    for (const value of harc.values ?? []) {
      if (!isNode(value)) {
        if (value?.text != null && settings.badges && badges.length < BADGE_CAP) {
          badges.push({ attribute: harc.attribute, text: String(value.text) });
        }
        continue;
      }
      add(value, {
        kind: "typed",
        role: mapping.role,
        explicit: mapping.explicit,
        attribute: harc.attribute,
        caption: captionFor(harc.attribute, "out", settings.pairs),
        labels: labelsText(harc.labels),
        sourceUid: harc.source?.uid ?? null,
        sourceString: harc.source?.string ?? null,
        direction: "out",
        harcUid: harc.uid,
        writable: Boolean(harc.source?.uid) && !readOnly
      });
    }
  }
  const inboundSources = /* @__PURE__ */ new Set();
  for (const harc of source.in ?? []) {
    for (const uid of [harc.source?.uid, ...harc.valueSourceUids ?? []]) if (uid) inboundSources.add(uid);
    const mapping = roleOf(harc.attribute, settings);
    if (!mapping) continue;
    add(harc.entity, {
      kind: "typed",
      role: inverseRole(mapping.role),
      explicit: mapping.explicit,
      attribute: harc.attribute,
      caption: captionFor(harc.attribute, "in", settings.pairs),
      labels: labelsText(harc.labels),
      sourceUid: harc.source?.uid ?? null,
      sourceString: harc.source?.string ?? null,
      direction: "in",
      harcUid: harc.uid,
      writable: Boolean(harc.source?.uid) && !isReadOnlyAttribute(harc.attribute)
    });
  }
  if (center.kind === "block") {
    if (center.page?.uid) {
      add(center.page, { kind: "structural", role: "parent", note: "page", sourceUid: null });
    }
    if (center.parent?.uid && center.parent.uid !== center.page?.uid) {
      add(center.parent, { kind: "structural", role: "parent", note: "parent block", sourceUid: center.parent.uid });
    }
  } else {
    const namespace = source.namespace ?? {};
    if (namespace.parent) add(namespace.parent, { kind: "structural", role: "parent", note: "namespace", sourceUid: null });
    for (const page of namespace.children ?? []) {
      add(page, { kind: "structural", role: "child", note: "namespace", sourceUid: null });
    }
    if (source.days?.previous) add(source.days.previous, { kind: "structural", role: "previous", note: "day", sourceUid: null });
    if (source.days?.next) add(source.days.next, { kind: "structural", role: "next", note: "day", sourceUid: null });
  }
  const mentionBlocks = [];
  if (settings.links) {
    walk(source.outline, (block) => {
      if (typedValueBlocks.has(block.uid)) return;
      const attribute = parseAttribute(block.string);
      if (attribute && typedSources.has(block.uid) && tailShape(attribute.tail).kind === "refs") return;
      for (const ref of linkRefs(block)) {
        add(ref, { kind: "link", role: "child", sourceUid: block.uid });
      }
    });
    for (const mention of source.mentions ?? []) {
      if (!mention?.uid || inboundSources.has(mention.uid) || outline.index.has(mention.uid)) continue;
      if (mention.uid === centerUid || !mention.page?.uid || mention.page.uid === centerUid) continue;
      add(mention.page, { kind: "mention", role: "parent", sourceUid: mention.uid });
      mentionBlocks.push(mention);
    }
  }
  const nodes = [];
  for (const [uid, items] of evidence) {
    const entity = entities.get(uid);
    const picked = pickRole(items);
    const typed = picked.strongest.filter((item) => item.kind === "typed");
    nodes.push({
      uid,
      kind: kindOf(entity),
      title: titleOf(entity, resolveRegion) || uid,
      string: typeof entity?.string === "string" ? entity.string : "",
      alias: aliasOf(entity, source.aliases),
      editTime: finiteTime(entity?.editTime),
      createTime: finiteTime(entity?.createTime),
      role: picked.role,
      zone: ZONE_OF[picked.role],
      strength: picked.strength,
      style: picked.strongest[0].kind,
      evidence: items,
      label: [...new Set(typed.map((item) => [item.caption ?? item.attribute, ...item.labels].join(" · ")))].join(" | "),
      writable: typed.length === 1 && typed[0].writable ? typed[0] : null,
      via: null
    });
  }
  const placed = new Set(nodes.map((node) => node.uid));
  if (settings.siblings) {
    const north = new Set(nodes.filter((node) => node.zone === "north").map((node) => node.uid));
    const siblings = /* @__PURE__ */ new Map();
    const addSibling = (entity, via, item) => {
      if (!isNode(entity) || entity.uid === centerUid || placed.has(entity.uid) || !north.has(via)) return;
      const existing = siblings.get(entity.uid);
      if (existing) {
        existing.evidence.push(item);
        return;
      }
      siblings.set(entity.uid, {
        uid: entity.uid,
        kind: kindOf(entity),
        title: titleOf(entity, resolveRegion) || entity.uid,
        string: typeof entity.string === "string" ? entity.string : "",
        alias: aliasOf(entity, source.aliases),
        editTime: finiteTime(entity?.editTime),
        createTime: finiteTime(entity?.createTime),
        role: "sibling",
        zone: "siblings",
        strength: 0,
        style: "sibling",
        evidence: [item],
        label: "",
        writable: null,
        via
      });
    };
    for (const peer of source.peers ?? []) {
      for (const item of peer.incoming ?? []) {
        if (roleOf(item.attribute, settings)?.role !== "parent") continue;
        addSibling(item.entity, peer.parentUid, { kind: "sibling", role: "sibling", attribute: item.attribute, sourceUid: null });
      }
      for (const item of peer.outgoing ?? []) {
        if (roleOf(item.attribute, settings)?.role !== "child") continue;
        addSibling(item.value, peer.parentUid, { kind: "sibling", role: "sibling", attribute: item.attribute, sourceUid: null });
      }
    }
    if (center.kind === "block") {
      const via = center.parent?.uid ?? center.page?.uid;
      for (const block of center.siblings ?? []) {
        addSibling(block, via, { kind: "sibling", role: "sibling", note: "sibling block", sourceUid: block.uid });
      }
    } else {
      for (const page of source.namespace?.siblings ?? []) {
        addSibling(page, source.namespace?.parent?.uid, { kind: "sibling", role: "sibling", note: "namespace", sourceUid: null });
      }
    }
    for (const mention of mentionBlocks) {
      for (const ref of linkRefs(mention)) {
        if (ref.uid === mention.page.uid) continue;
        addSibling(ref, mention.page.uid, { kind: "sibling", role: "sibling", note: "mentioned together", sourceUid: mention.uid });
      }
    }
    nodes.push(...siblings.values());
  }
  const overflow = {};
  const kept = [];
  for (const zone of ZONES) {
    const members = nodes.filter((node) => node.zone === zone).sort((a, b) => compareNodes(a, b, settings.sort));
    const limit = expanded.has(zone) ? Math.max(settings.maxPerZone, 200) : settings.maxPerZone;
    kept.push(...members.slice(0, limit));
    if (members.length > settings.maxPerZone) {
      overflow[zone] = { shown: Math.min(limit, members.length), total: members.length };
    }
  }
  appendExtras(kept, options.boards, "west", "friend", "board", settings.maxPerZone, centerUid);
  appendExtras(kept, options.cards, "south", "child", "card", settings.maxPerZone, centerUid);
  const keptUids = new Set(kept.map((node) => node.uid));
  for (const node of kept) if (node.via && !keptUids.has(node.via)) node.via = null;
  return {
    center: {
      uid: centerUid,
      kind: center.kind === "block" ? "block" : "page",
      title: center.kind === "block" ? blockTitle(centerUid, center.string, 120, resolveRegion) || centerUid : center.title || centerUid,
      badges,
      plexus: center.kind === "block" ? plexusKind(center) : null
    },
    nodes: kept,
    overflow,
    outline: outline.rows,
    outlineIndex: outline.index,
    settings
  };
}
var DRAWING_LINK_CAP = 50;
function drawingLinkEdges(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const row of rows) {
    const uid = typeof row?.uid === "string" ? row.uid : "";
    if (!uid.trim() || seen.has(uid)) continue;
    seen.add(uid);
    const text = typeof row.text === "string" ? row.text : "";
    out.push({ uid, text });
    if (out.length >= DRAWING_LINK_CAP) break;
  }
  return out;
}

// src/model/rewrite.js
var FORBIDDEN = [":harc", ":entity/attrs", ":attr/proxy"];
function same(a, b) {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}
function refused2(reason) {
  return { ops: [], reason };
}
function safe(ops) {
  for (const op of ops) {
    if (FORBIDDEN.some((token) => String(op.string ?? "").includes(token))) {
      return refused2("forbidden");
    }
  }
  return { ops, reason: null };
}
function refsIn(string) {
  const shape = tailShape(string);
  return shape.kind === "refs" ? shape.values : [];
}
function planMove({ source, fromAttribute, toAttribute, value, newUid }) {
  if (!source?.uid || typeof source.string !== "string") return refused2("missing");
  const name = String(toAttribute ?? "").trim();
  if (!name || name.includes("::") || /[[\]\n]/.test(name)) return refused2("no-attribute");
  const parsed = parseAttribute(source.string);
  if (!parsed || !same(parsed.name, fromAttribute)) return refused2("changed");
  if (isReadOnlyAttribute(parsed.name) || isReadOnlyAttribute(name)) return refused2("read-only");
  if (same(parsed.name, name)) return refused2("same");
  const renamed = `${name}::${parsed.tail}`;
  const after = { parentUid: source.parentUid, order: Number.isFinite(source.order) ? source.order + 1 : "last" };
  const shape = tailShape(parsed.tail);
  if (shape.kind === "refs") {
    const token2 = shape.values.find((item) => tokenMatches(item, value));
    if (!token2) return refused2("missing-value");
    if (shape.values.length === 1) return safe([{ op: "update", uid: source.uid, string: renamed }]);
    if (!after.parentUid) return refused2("no-parent");
    const offset = parsed.prefix.length;
    const shifted = { ...token2, start: token2.start + offset, end: token2.end + offset };
    return safe([
      { op: "update", uid: source.uid, string: removeToken(source.string, shifted) },
      { op: "create", parentUid: after.parentUid, order: after.order, uid: newUid, string: `${name}:: ${refMarkup(value)}` }
    ]);
  }
  if (shape.kind !== "bare") return refused2("text-value");
  const children = [...source.children ?? []].filter((child) => child?.uid).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const values = children.filter((child) => !parseAttribute(child.string));
  const holder = values.find((child) => child.uid === value?.uid || refsIn(child.string).some((item) => tokenMatches(item, value)));
  if (!holder) return refused2("missing-value");
  if (values.length === 1) return safe([{ op: "update", uid: source.uid, string: renamed }]);
  if (!after.parentUid) return refused2("no-parent");
  const holderRefs = refsIn(holder.string);
  if (holder.uid === value?.uid || holderRefs.length <= 1) {
    return safe([
      { op: "create", parentUid: after.parentUid, order: after.order, uid: newUid, string: `${name}::` },
      { op: "move", uid: holder.uid, parentUid: newUid, order: 0 }
    ]);
  }
  const token = scanRefs(holder.string, { nested: false }).find((item) => tokenMatches(item, value));
  return safe([
    { op: "update", uid: holder.uid, string: removeToken(holder.string, token) },
    { op: "create", parentUid: after.parentUid, order: after.order, uid: newUid, string: `${name}:: ${refMarkup(value)}` }
  ]);
}

// src/host.js
var LABELS = "{:harc/_e [{:harc/a [:node/title :edit/time :create/time]} {:harc/v [:block/uid :node/title :edit/time :create/time :block/string :harc/v-string]}]}";
var SOURCE = "[:block/uid :block/string :block/order {:block/_children [:block/uid]} {:block/children [:block/uid :block/string :block/order]}]";
var CENTER_PULL = `[:block/uid :node/title :edit/time :create/time :block/string :block/order
 {:block/refs [:block/uid :node/title :edit/time :create/time :block/string]}
 {:block/page [:block/uid :node/title :edit/time :create/time]}
 {:block/_children [:block/uid :node/title :edit/time :create/time :block/string {:block/children [:block/uid :block/string :block/order]}]}
 {:harc/_e [:block/uid
   {:harc/a [:node/title :edit/time :create/time]}
   {:harc/v [:block/uid :node/title :edit/time :create/time :block/string :harc/v-string]}
   {:harc/a-source ${SOURCE}}
   ${LABELS}]}
 {:harc/_v [:block/uid
   {:harc/e [:block/uid :node/title :edit/time :create/time :block/string]}
   {:harc/a [:node/title :edit/time :create/time]}
   {:harc/a-source ${SOURCE}}
   {:harc/v-source [:block/uid]}
   ${LABELS}]}
 {:block/_refs [:block/uid :block/string
   {:block/page [:block/uid :node/title :edit/time :create/time]}
   {:block/refs [:block/uid :node/title :edit/time :create/time :block/string]}]}]`;
var OUTLINE_PULL = "[:block/uid :block/string :block/order {:block/refs [:block/uid :node/title :block/string]} {:block/children ...}]";
var PEER_PULL = `[:block/uid
 {:harc/_v [{:harc/a [:node/title]} {:harc/e [:block/uid :node/title :block/string]}]}
 {:harc/_e [{:harc/a [:node/title]} {:harc/v [:block/uid :node/title :block/string]}]}]`;
var WATCHES = [
  "[:block/string :node/title {:block/_refs [:block/uid :block/string]} {:harc/_e [:block/uid]} {:harc/_v [:block/uid]}]",
  "[:block/uid :block/string {:block/children ...}]"
];
var TITLES_QUERY = "[:find ?uid ?title :where [?page :node/title ?title] [?page :block/uid ?uid]]";
var DRAWING_REF_QUERY = `[:find ?uid ?want ?time
 :in $ [?want ...]
 :where
 [?r :block/uid ?want]
 [?b :block/refs ?r]
 [?b :block/uid ?uid]
 [?b :block/string ?s]
 [(clojure.string/includes? ?s "excalidraw")]
 [?b :edit/time ?time]]`;
var PREFIX_QUERY = `[:find ?uid ?title ?edit ?create
 :in $ ?prefix
 :where
  [?page :node/title ?title]
  [(clojure.string/starts-with? ?title ?prefix)]
  [?page :block/uid ?uid]
  [?page :edit/time ?edit]
  [?page :create/time ?create]]`;
var ALIAS_QUERY = `[:find ?uid ?s :in $ [?uid ...] :where [?p :block/uid ?uid] [?p :block/children ?c] [?c :block/string ?s] [(clojure.string/includes? ?s "Name::")]]`;
var CHILD_COUNT_QUERY = "[:find ?uid (count ?c) :in $ [?uid ...] :where [?p :block/uid ?uid] [?p :block/children ?c]]";
var DRAWING_ON_PAGE_QUERY = "[:find ?uid ?s :in $ ?title :where [?p :node/title ?title] [?p :block/children ?b] [?b :block/uid ?uid] [?b :block/string ?s]]";
var ATTR_PULL = "[:block/uid {:block/children [:block/uid :block/string :block/order]}]";
var ATTR_BLOCK_PULL = "[:block/uid {:block/children [:block/uid :block/string :block/order {:block/children [:block/uid :block/string :block/order]}]}]";
var SOURCE_BLOCK_PULL = "[:block/uid :block/string :block/order {:block/_children [:block/uid]} {:block/children [:block/uid :block/string :block/order {:block/children [:block/uid]}]}]";
var RECENT_PAGES_QUERY = "[:find ?uid ?title ?edit ?create :where [?e :node/title ?title] [?e :block/uid ?uid] [?e :edit/time ?edit] [?e :create/time ?create]]";
var RECENT_DRAWINGS_QUERY = `[:find ?uid ?edit :where [?b :block/uid ?uid] [?b :block/string ?s] [(clojure.string/includes? ?s "excalidraw")] [?b :edit/time ?edit]]`;
var ENTITY_PULL = "[:block/uid :node/title :block/string]";
var GUARD_PULL = "[:block/uid :block/string]";
var PAGE_ATTRIBUTES_PULL = "[:block/uid {:harc/_e [{:harc/a [:node/title]} {:harc/v [:block/uid :node/title :block/string :harc/v-string]}]}]";
var PAGE_ATTRIBUTES_CAP = 200;
var FORBIDDEN_WRITE_TOKENS = [":harc/", ":entity/attrs", ":attr/proxy"];
var MENTION_CAP = 500;
var NAMESPACE_CAP = 200;
var DAILY_UID = /^(\d{2})-(\d{2})-(\d{4})$/;
function roamApi() {
  const host = globalThis.window ?? globalThis;
  return host.roamAlphaAPI ?? globalThis.roamAlphaAPI ?? null;
}
function asList(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
function entityString(uid) {
  return `[:block/uid "${String(uid).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
}
function byOrder(a, b) {
  return (a.order ?? 0) - (b.order ?? 0) || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);
}
function topicRefUid(entity) {
  if (typeof entity === "string") return entity || null;
  const uid = entity?.uid;
  if (typeof uid !== "string" || !uid) return null;
  if (entity.title === "excalidraw") return null;
  return uid;
}
function withTimes(entity, node) {
  if (Number.isFinite(node[":edit/time"])) entity.editTime = node[":edit/time"];
  if (Number.isFinite(node[":create/time"])) entity.createTime = node[":create/time"];
  return entity;
}
function entityOf(node) {
  const uid = node?.[":block/uid"];
  if (typeof uid !== "string" || !uid) return null;
  if (typeof node[":node/title"] === "string") return withTimes({ uid, title: node[":node/title"] }, node);
  if (typeof node[":block/string"] === "string") {
    const entity = { uid, string: node[":block/string"] };
    if (Number.isFinite(node[":block/order"])) entity.order = node[":block/order"];
    return withTimes(entity, node);
  }
  if (node[":harc/v-string"] != null) return { uid, text: String(node[":harc/v-string"]) };
  return { uid };
}
function aliasFromBlock(string) {
  const parsed = parseAttribute(string);
  if (!parsed || parsed.name.toLowerCase() !== "name") return "";
  const text = plainText(parsed.tail, 80);
  if (!text || text === "(( ))") return "";
  return text;
}
function displayText(node) {
  if (node?.[":harc/v-string"] != null) return String(node[":harc/v-string"]);
  if (typeof node?.[":node/title"] === "string") return node[":node/title"];
  if (typeof node?.[":block/string"] === "string") return node[":block/string"];
  return "";
}
function labelsOf(harc) {
  const labels = [];
  for (const nested of asList(harc?.[":harc/_e"])) {
    const attribute = asList(nested?.[":harc/a"])[0]?.[":node/title"];
    if (typeof attribute !== "string" || !attribute.trim()) continue;
    const text = asList(nested[":harc/v"]).map(displayText).filter(Boolean).join(", ");
    labels.push({ attribute: attribute.trim(), text });
  }
  return labels;
}
function sourceOf(node) {
  const uid = node?.[":block/uid"];
  if (typeof uid !== "string" || !uid || typeof node[":block/string"] !== "string") return null;
  const parentUid = asList(node[":block/_children"])[0]?.[":block/uid"];
  return {
    uid,
    string: node[":block/string"],
    order: Number.isFinite(node[":block/order"]) ? node[":block/order"] : null,
    parentUid: typeof parentUid === "string" ? parentUid : null,
    children: asList(node[":block/children"]).map((child) => entityOf(child)).filter((child) => child?.string != null).sort(byOrder)
  };
}
function attributeOf(harc) {
  const title = asList(harc?.[":harc/a"])[0]?.[":node/title"];
  return typeof title === "string" && title.trim() ? title.trim() : null;
}
function normalizeOut(list) {
  const harcs = [];
  for (const harc of asList(list)) {
    const attribute = attributeOf(harc);
    if (!attribute) continue;
    harcs.push({
      uid: harc[":block/uid"] ?? null,
      attribute,
      source: sourceOf(asList(harc[":harc/a-source"])[0]),
      values: asList(harc[":harc/v"]).map(entityOf).filter(Boolean),
      labels: labelsOf(harc)
    });
  }
  return harcs;
}
function normalizeIn(list) {
  const harcs = [];
  for (const harc of asList(list)) {
    const attribute = attributeOf(harc);
    const entity = entityOf(asList(harc?.[":harc/e"])[0]);
    if (!attribute || !entity) continue;
    harcs.push({
      uid: harc[":block/uid"] ?? null,
      attribute,
      entity,
      source: sourceOf(asList(harc[":harc/a-source"])[0]),
      valueSourceUids: asList(harc[":harc/v-source"]).map((item) => item?.[":block/uid"]).filter(Boolean),
      labels: labelsOf(harc)
    });
  }
  return harcs;
}
function normalizeMentions(list, cap = MENTION_CAP) {
  const mentions = [];
  for (const block of asList(list)) {
    const uid = block?.[":block/uid"];
    const page = entityOf(block?.[":block/page"]);
    if (typeof uid !== "string" || typeof block[":block/string"] !== "string" || !page?.title) continue;
    mentions.push({
      uid,
      string: block[":block/string"],
      page,
      refs: asList(block[":block/refs"]).map(entityOf).filter(Boolean)
    });
  }
  mentions.sort((a, b) => a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);
  return mentions.slice(0, cap);
}
function normalizeOutline(root) {
  const blocks = (node) => asList(node?.[":block/children"]).map((child) => {
    const entity = entityOf(child);
    if (!entity || entity.string == null) return null;
    return {
      uid: entity.uid,
      string: entity.string,
      order: entity.order ?? 0,
      refs: asList(child[":block/refs"]).map(entityOf).filter(Boolean),
      children: blocks(child)
    };
  }).filter(Boolean).sort(byOrder);
  return blocks(root);
}
function normalizeCenter(pulled, uid) {
  const title = pulled?.[":node/title"];
  if (typeof title === "string") return { uid, kind: "page", title };
  const parentNode = asList(pulled?.[":block/_children"])[0];
  const parent = entityOf(parentNode);
  return {
    uid,
    kind: "block",
    string: typeof pulled?.[":block/string"] === "string" ? pulled[":block/string"] : "",
    page: entityOf(pulled?.[":block/page"]),
    parent,
    siblings: asList(parentNode?.[":block/children"]).map(entityOf).filter((item) => item?.string != null && item.uid !== uid).sort(byOrder),
    refs: asList(pulled?.[":block/refs"]).map(entityOf).filter(Boolean)
  };
}
function normalizePeer(parentUid, pulled) {
  return {
    parentUid,
    incoming: asList(pulled?.[":harc/_v"]).flatMap((harc) => {
      const attribute = attributeOf(harc);
      const entity = entityOf(asList(harc?.[":harc/e"])[0]);
      return attribute && entity ? [{ attribute, entity }] : [];
    }),
    outgoing: asList(pulled?.[":harc/_e"]).flatMap((harc) => {
      const attribute = attributeOf(harc);
      if (!attribute) return [];
      return asList(harc[":harc/v"]).map(entityOf).filter(Boolean).map((value) => ({ attribute, value }));
    })
  };
}
function pad(number) {
  return String(number).padStart(2, "0");
}
async function mainUid() {
  try {
    const uid = await roamApi()?.ui?.mainWindow?.getOpenPageOrBlockUid?.();
    return typeof uid === "string" && uid ? uid : null;
  } catch (error) {
    console.error("[compass] main uid", error);
    return null;
  }
}
function uidFromHash(hash) {
  if (typeof hash !== "string" || !hash) return null;
  const read = (kind) => {
    const match = new RegExp(`/${kind}/([^/?#]+)`).exec(hash);
    if (!match?.[1]) return null;
    try {
      return decodeURIComponent(match[1]) || null;
    } catch {
      return match[1];
    }
  };
  return read("block") ?? read("page");
}
function adjacentDayUids(uid) {
  const match = DAILY_UID.exec(String(uid ?? ""));
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
  if (Number.isNaN(date.getTime())) return null;
  const shift = (days) => {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
    return `${pad(next.getMonth() + 1)}-${pad(next.getDate())}-${next.getFullYear()}`;
  };
  return { previous: shift(-1), next: shift(1) };
}
function pull(data, pattern, uid) {
  try {
    return data.pull(pattern, entityString(uid)) ?? null;
  } catch (error) {
    console.error("[compass] pull failed", error);
    return null;
  }
}
function prefixPages(data, prefix) {
  if (!data.q || !prefix) return [];
  let rows = [];
  try {
    rows = data.q(PREFIX_QUERY, prefix) ?? [];
  } catch (error) {
    console.error("[compass] namespace query failed", error);
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const pages = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const [uid, title, edit, create] = row;
    if (typeof uid !== "string" || typeof title !== "string") continue;
    const rest = title.slice(prefix.length);
    if (!rest || rest.includes("/")) continue;
    const page = { uid, title };
    if (Number.isFinite(edit)) page.editTime = edit;
    if (Number.isFinite(create)) page.createTime = create;
    pages.push(page);
  }
  pages.sort((a, b) => a.title < b.title ? -1 : a.title > b.title ? 1 : 0);
  return pages.slice(0, NAMESPACE_CAP);
}
function pageByTitle(data, title) {
  try {
    const found = data.pull("[:block/uid :node/title :edit/time :create/time]", `[:node/title "${title.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`);
    return entityOf(found);
  } catch (error) {
    console.error("[compass] page lookup", error);
    return null;
  }
}
function namespaceOf(data, center) {
  const title = center.title ?? "";
  const mark = title.lastIndexOf("/");
  const prefix = mark > 0 ? title.slice(0, mark) : "";
  const parent = prefix ? pageByTitle(data, prefix) : null;
  return {
    parent: parent?.title ? parent : null,
    children: prefixPages(data, `${title}/`),
    siblings: parent?.title ? prefixPages(data, `${prefix}/`).filter((page) => page.uid !== center.uid) : []
  };
}
function daysOf(data, uid) {
  const around = adjacentDayUids(uid);
  if (!around) return null;
  const page = (dayUid) => {
    const found = entityOf(pull(data, "[:block/uid :node/title :edit/time :create/time]", dayUid));
    return found?.title ? found : null;
  };
  return { previous: page(around.previous), next: page(around.next) };
}
function pageUidsOf(snap) {
  const uids = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (entity) => {
    if (typeof entity?.title !== "string") return;
    const uid = entity.uid;
    if (typeof uid !== "string" || !uid || seen.has(uid)) return;
    seen.add(uid);
    uids.push(uid);
  };
  for (const harc of snap.out ?? []) {
    for (const value of harc.values ?? []) add(value);
  }
  for (const harc of snap.in ?? []) add(harc.entity);
  for (const mention of snap.mentions ?? []) {
    add(mention.page);
    for (const ref of mention.refs ?? []) add(ref);
  }
  if (snap.namespace) {
    add(snap.namespace.parent);
    for (const page of snap.namespace.children ?? []) add(page);
    for (const page of snap.namespace.siblings ?? []) add(page);
  }
  if (snap.days) {
    add(snap.days.previous);
    add(snap.days.next);
  }
  const walk2 = (blocks) => {
    for (const block of blocks ?? []) {
      for (const ref of block?.refs ?? []) add(ref);
      walk2(block?.children);
    }
  };
  walk2(snap.outline);
  for (const ref of snap.center?.refs ?? []) add(ref);
  add(snap.center?.page);
  for (const peer of snap.peers ?? []) {
    for (const row of peer?.incoming ?? []) add(row?.entity);
    for (const row of peer?.outgoing ?? []) add(row?.value);
  }
  if (snap.center?.kind === "page") add(snap.center);
  return uids;
}
function aliasesOf(data, snap) {
  const uids = pageUidsOf(snap);
  if (!uids.length || typeof data.q !== "function") return {};
  let rows = [];
  try {
    rows = data.q(ALIAS_QUERY, uids) ?? [];
  } catch (error) {
    console.error("[compass] aliases failed", error);
    return {};
  }
  if (!Array.isArray(rows)) return {};
  const aliases = {};
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const [uid, string] = row;
    if (typeof uid !== "string" || !uid || aliases[uid]) continue;
    const text = aliasFromBlock(string);
    if (text) aliases[uid] = text;
  }
  return aliases;
}
function isDrawingBlockString(string) {
  const text = typeof string === "string" ? string.trimStart() : "";
  if (text.startsWith("{{[[plexus-region]]")) return false;
  return text.startsWith("{{[[excalidraw]]}}") || text.startsWith("{{excalidraw}}");
}
function graphName() {
  const name = roamApi()?.graph?.name;
  return typeof name === "string" && name ? name : "graph";
}
function withLock(name, task) {
  const locks = globalThis.navigator?.locks;
  if (!locks?.request) return task();
  let result = { ok: false, reason: "locked" };
  return locks.request(name, { ifAvailable: true }, async (lock) => {
    if (!lock) return;
    result = await task();
  }).then(() => result);
}
function hasForbiddenToken(string) {
  if (typeof string !== "string") return false;
  return FORBIDDEN_WRITE_TOKENS.some((token) => string.includes(token));
}
function attributeValueOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  const uid = raw[":block/uid"];
  if (typeof uid === "string" && uid && typeof raw[":node/title"] === "string") {
    return { uid, title: raw[":node/title"] };
  }
  if (typeof uid === "string" && uid && typeof raw[":block/string"] === "string") {
    return { uid, text: plainText(raw[":block/string"], 90) };
  }
  if (raw[":harc/v-string"] != null) {
    return { text: String(raw[":harc/v-string"]) };
  }
  return null;
}
async function applyOp(data, op) {
  if (op.op === "update") {
    await data.block.update({ block: { uid: op.uid, string: op.string } });
  } else if (op.op === "create") {
    const block = { string: op.string };
    if (op.uid) block.uid = op.uid;
    await data.block.create({ location: { "parent-uid": op.parentUid, order: op.order }, block });
  } else if (op.op === "move") {
    await data.block.move({ location: { "parent-uid": op.parentUid, order: op.order }, block: { uid: op.uid } });
  } else if (op.op === "delete") {
    await data.block.delete({ block: { uid: op.uid } });
  } else {
    throw new Error(`Unknown write ${op.op}`);
  }
}
function createHost({ lifecycle }) {
  if (!lifecycle?.add) throw new TypeError("A lifecycle is required");
  let watches = [];
  let sidecar = null;
  let alive = true;
  let queue = Promise.resolve();
  function data() {
    const api = roamApi()?.data;
    if (!api?.pull) throw new Error("roamAlphaAPI.data is unavailable");
    return api;
  }
  function unwatch() {
    const api = roamApi()?.data;
    for (const watch2 of watches.splice(0)) {
      try {
        api?.removePullWatch?.(watch2.pattern, watch2.entity, watch2.callback);
      } catch (error) {
        console.error("[compass] unwatch failed", error);
      }
    }
  }
  function watch(uid, onChange) {
    unwatch();
    const api = roamApi()?.data;
    if (!uid || !api?.addPullWatch || !api?.removePullWatch) return;
    const entity2 = entityString(uid);
    const callback = () => onChange();
    for (const pattern of WATCHES) {
      try {
        api.addPullWatch(pattern, entity2, callback);
        watches.push({ pattern, entity: entity2, callback });
      } catch (error) {
        console.error("[compass] watch failed", error);
      }
    }
  }
  function snapshot(uid, modelSettings2) {
    const api = data();
    const pulled = pull(api, CENTER_PULL, uid);
    if (!pulled || pulled[":node/title"] == null && pulled[":block/string"] == null) {
      return { center: { uid, kind: "page", title: uid }, missing: true };
    }
    const center = normalizeCenter(pulled, uid);
    const snap = {
      center,
      outline: normalizeOutline(pull(api, OUTLINE_PULL, uid)),
      out: normalizeOut(pulled[":harc/_e"]),
      in: normalizeIn(pulled[":harc/_v"]),
      mentions: normalizeMentions(pulled[":block/_refs"]),
      namespace: center.kind === "page" ? namespaceOf(api, center) : null,
      days: center.kind === "page" ? daysOf(api, uid) : null,
      peers: []
    };
    snap.peers = typedParentUids(snap, modelSettings2).map((parentUid) => normalizePeer(parentUid, pull(api, PEER_PULL, parentUid)));
    snap.aliases = aliasesOf(api, snap);
    return snap;
  }
  function titles() {
    const api = roamApi()?.data;
    if (!api?.q) return [];
    try {
      return (api.q(TITLES_QUERY) ?? []).flatMap(([uid, title]) => typeof uid === "string" && typeof title === "string" ? [{ uid, title }] : []);
    } catch (error) {
      console.error("[compass] titles failed", error);
      return [];
    }
  }
  async function openPageUid() {
    try {
      const uid = await roamApi()?.ui?.mainWindow?.getOpenPageOrBlockUid?.();
      if (typeof uid === "string" && uid) return uid;
    } catch (error) {
      console.error("[compass] open page", error);
    }
    try {
      const today = roamApi()?.util?.dateToPageUid?.(/* @__PURE__ */ new Date());
      return typeof today === "string" && today ? today : null;
    } catch {
      return null;
    }
  }
  function focusedBlock() {
    try {
      const uid = roamApi()?.ui?.getFocusedBlock?.()?.["block-uid"];
      return typeof uid === "string" && uid ? uid : null;
    } catch (error) {
      console.error("[compass] focus", error);
      return null;
    }
  }
  async function openInSidebar(uid, kind) {
    if (!uid) return;
    await roamApi()?.ui?.rightSidebar?.addWindow?.({
      window: { type: kind === "block" ? "block" : "outline", "block-uid": uid }
    });
  }
  async function openInMain(uid, kind) {
    const main = roamApi()?.ui?.mainWindow;
    if (!main || !uid) return;
    if (kind === "block") await main.openBlock({ block: { uid } });
    else await main.openPage({ page: { uid } });
  }
  function sidebarHas(uid) {
    try {
      return (roamApi()?.ui?.rightSidebar?.getWindows?.() ?? []).some((item) => item?.["block-uid"] === uid || item?.["page-uid"] === uid);
    } catch {
      return false;
    }
  }
  async function removeWindow(uid) {
    try {
      await roamApi()?.ui?.rightSidebar?.removeWindow?.({ window: { type: "outline", "block-uid": uid } });
    } catch (error) {
      console.error("[compass] sidecar", error);
    }
  }
  async function closeSidecar() {
    const current = sidecar;
    sidecar = null;
    if (current?.owned) await removeWindow(current.uid);
  }
  async function syncSidecar(uid, enabled) {
    if (!alive) return;
    if (!enabled || !uid) {
      await closeSidecar();
      return;
    }
    if (sidecar?.uid === uid) return;
    await closeSidecar();
    if (sidebarHas(uid)) {
      sidecar = { uid, owned: false };
      return;
    }
    try {
      await roamApi()?.ui?.rightSidebar?.addWindow?.({ window: { type: "outline", "block-uid": uid } });
      sidecar = { uid, owned: true };
      if (!alive) await closeSidecar();
    } catch (error) {
      console.error("[compass] sidecar", error);
    }
  }
  function releaseSidecar() {
    sidecar = null;
  }
  function move({ sourceUid, fromAttribute, toAttribute, value, expectedString }) {
    const task = () => withLock(`compass:${graphName()}:${sourceUid}`, async () => {
      const api = data();
      const source = sourceOf(pull(api, SOURCE, sourceUid));
      if (!source) return { ok: false, reason: "missing" };
      if (expectedString != null && source.string !== expectedString) return { ok: false, reason: "changed" };
      const newUid = roamApi()?.util?.generateUID?.();
      const plan = planMove({ source, fromAttribute, toAttribute, value, newUid });
      if (!plan.ops.length) return { ok: false, reason: plan.reason };
      if (plan.ops.some((op) => op.op === "create" && !op.uid)) return { ok: false, reason: "no-uid" };
      for (const op of plan.ops) await applyOp(api, op);
      return { ok: true, ops: plan.ops };
    });
    const run = queue.then(task, task);
    queue = run.then(() => void 0, () => void 0);
    return run;
  }
  function childCounts(uids) {
    const api = roamApi()?.data;
    const list = Array.isArray(uids) ? uids.filter((uid) => typeof uid === "string" && uid) : [];
    if (!list.length || typeof api?.q !== "function") return {};
    const counts = Object.fromEntries(list.map((uid) => [uid, 0]));
    let rows = [];
    try {
      rows = api.q(CHILD_COUNT_QUERY, list) ?? [];
    } catch (error) {
      console.error("[compass] child counts", error);
      return {};
    }
    if (!Array.isArray(rows)) return counts;
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const [uid, count2] = row;
      if (typeof uid === "string" && Object.prototype.hasOwnProperty.call(counts, uid)) counts[uid] = Number(count2) || 0;
    }
    return counts;
  }
  function crossRows(uids) {
    const api = roamApi()?.data;
    const list = Array.isArray(uids) ? uids.filter((uid) => typeof uid === "string" && uid) : [];
    if (!list.length || typeof api?.q !== "function") return [];
    try {
      const rows = api.q(CROSS_QUERY, list) ?? [];
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      console.error("[compass] cross links", error);
      return [];
    }
  }
  function findDrawingBlock(title) {
    const api = roamApi()?.data;
    if (typeof title !== "string" || !title.trim() || typeof api?.q !== "function") return null;
    let rows = [];
    try {
      rows = api.q(DRAWING_ON_PAGE_QUERY, `Drawings/${title}`) ?? [];
    } catch (error) {
      console.error("[compass] drawing lookup", error);
      return null;
    }
    if (!Array.isArray(rows)) return null;
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const [uid, string] = row;
      if (typeof uid === "string" && uid && isDrawingBlockString(string)) return uid;
    }
    return null;
  }
  function writeZoneAttribute({ centerUid, zone, title } = {}) {
    const attribute = ZONE_ATTR[zone];
    if (!attribute) return Promise.resolve({ ok: false, reason: "zone" });
    if (typeof centerUid !== "string" || !centerUid) return Promise.resolve({ ok: false, reason: "missing" });
    const task = () => withLock(`compass:${graphName()}:${centerUid}`, async () => {
      const api = data();
      const pulled = pull(api, ATTR_PULL, centerUid);
      let existing = null;
      for (const child of asList(pulled?.[":block/children"])) {
        const string = child?.[":block/string"];
        const parsed = parseAttribute(string);
        if (parsed?.name === attribute && typeof child?.[":block/uid"] === "string") {
          existing = { uid: child[":block/uid"], string };
          break;
        }
      }
      const plan = planAttributeWrite({ attribute, title, existing });
      if (!plan.ops.length) return { ok: false, reason: plan.reason };
      for (const op of plan.ops) {
        if (op.op === "create") await applyOp(api, { op: "create", string: op.string, parentUid: centerUid, order: "last" });
        else await applyOp(api, op);
      }
      return { ok: true };
    });
    const run = queue.then(task, task);
    queue = run.then(() => void 0, () => void 0);
    return run;
  }
  function drawingRows(centreUid, refUids) {
    const api = roamApi()?.data;
    if (!api?.q) return [];
    const wants = [];
    const seen = /* @__PURE__ */ new Set();
    const add = (uid) => {
      if (typeof uid !== "string" || !uid || seen.has(uid)) return;
      seen.add(uid);
      wants.push(uid);
    };
    add(centreUid);
    for (const uid of refUids || []) add(uid);
    if (!wants.length) return [];
    let found = [];
    try {
      found = api.q(DRAWING_REF_QUERY, wants) ?? [];
    } catch (error) {
      console.error("[compass] related query", error);
      return [];
    }
    const byUid = /* @__PURE__ */ new Map();
    for (const row of found) {
      if (!Array.isArray(row)) continue;
      const [uid, ref, time] = row;
      if (typeof uid !== "string" || !uid || uid === centreUid) continue;
      let item = byUid.get(uid);
      if (!item) {
        if (byUid.size >= 80) continue;
        item = { uid, refs: [], editTime: Number(time) || 0, title: uid };
        byUid.set(uid, item);
      }
      if (typeof ref === "string" && ref && !item.refs.includes(ref)) item.refs.push(ref);
      const edit = Number(time) || 0;
      if (edit > item.editTime) item.editTime = edit;
    }
    return [...byUid.values()];
  }
  function recents() {
    const api = roamApi()?.data;
    if (!api?.q) return { pages: [], drawings: [] };
    const ask = (query, label) => {
      try {
        const rows = api.q(query) ?? [];
        return Array.isArray(rows) ? rows : [];
      } catch (error) {
        console.error(label, error);
        return [];
      }
    };
    const pages = [];
    for (const row of ask(RECENT_PAGES_QUERY, "[compass] recents pages failed")) {
      if (!Array.isArray(row)) continue;
      const [uid, title, edit, create] = row;
      if (typeof uid !== "string" || !uid || typeof title !== "string") continue;
      if (!Number.isFinite(edit) || !Number.isFinite(create)) continue;
      pages.push({ uid, title, editTime: edit, createTime: create });
    }
    const candidates = [];
    for (const row of ask(RECENT_DRAWINGS_QUERY, "[compass] recents drawings failed")) {
      if (!Array.isArray(row)) continue;
      const [uid, edit] = row;
      if (typeof uid !== "string" || !uid || !Number.isFinite(edit)) continue;
      candidates.push({ uid, editTime: edit });
    }
    candidates.sort((a, b) => b.editTime - a.editTime);
    const drawings = [];
    for (const item of candidates.slice(0, 8)) {
      let title = "Drawing";
      try {
        const pulled = api.pull?.("[:block/string]", entityString(item.uid));
        const named = drawingTitle(pulled?.[":block/string"]);
        if (named) title = named;
      } catch (error) {
        console.error("[compass] recents drawing pull failed", error);
      }
      drawings.push({ uid: item.uid, editTime: item.editTime, title });
    }
    return { pages, drawings };
  }
  function entity(uid) {
    if (typeof uid !== "string" || !uid) return null;
    const api = roamApi()?.data;
    if (typeof api?.pull !== "function") return null;
    try {
      const pulled = api.pull(ENTITY_PULL, entityString(uid));
      if (!pulled) return null;
      const resolvedUid = typeof pulled[":block/uid"] === "string" && pulled[":block/uid"] ? pulled[":block/uid"] : uid;
      if (typeof pulled[":node/title"] === "string") {
        return { uid: resolvedUid, kind: "page", title: pulled[":node/title"] };
      }
      if (typeof pulled[":block/string"] === "string") {
        const string = pulled[":block/string"];
        return { uid: resolvedUid, kind: "block", title: drawingTitle(string) ?? plainText(string, 90) };
      }
      return null;
    } catch (error) {
      console.error("[compass] entity", error);
      return null;
    }
  }
  function findPageByTitle(title) {
    if (typeof title !== "string" || !title) return null;
    const api = roamApi()?.data;
    if (typeof api?.pull !== "function") return null;
    const found = pageByTitle(api, title);
    if (!found || typeof found.uid !== "string" || typeof found.title !== "string") return null;
    return { uid: found.uid, title: found.title };
  }
  async function createPage(title, uid) {
    if (typeof title !== "string" || !title.trim()) return null;
    try {
      const existing = findPageByTitle(title);
      if (existing?.uid) return existing.uid;
      const root = roamApi();
      const create = root?.data?.page?.create;
      const explicitUid = typeof uid === "string" ? uid.trim() : "";
      const targetUid = explicitUid || root?.util?.generateUID?.();
      if (typeof create !== "function" || typeof targetUid !== "string" || !targetUid) return null;
      await create({ page: { title, uid: targetUid } });
      return targetUid;
    } catch (error) {
      console.error("[compass] create page", error);
      return null;
    }
  }
  function dailyPage(date) {
    let target = date instanceof Date ? date : new Date(date ?? Date.now());
    if (Number.isNaN(target.getTime())) target = /* @__PURE__ */ new Date();
    const fallbackUid = `${pad(target.getMonth() + 1)}-${pad(target.getDate())}-${target.getFullYear()}`;
    const util = roamApi()?.util;
    let uid = fallbackUid;
    if (typeof util?.dateToPageUid === "function") {
      try {
        const made = util.dateToPageUid(target);
        if (typeof made === "string" && made) uid = made;
      } catch (error) {
        console.error("[compass] daily page", error);
      }
    }
    let title = uid;
    if (typeof util?.dateToPageTitle === "function") {
      try {
        const named = util.dateToPageTitle(target);
        if (typeof named === "string" && named) title = named;
      } catch (error) {
        console.error("[compass] daily page", error);
      }
    }
    return { uid, title };
  }
  function pageAttributes(uids) {
    if (!Array.isArray(uids)) return {};
    const api = roamApi()?.data;
    if (typeof api?.pull !== "function") return {};
    const clean = [];
    const seen = /* @__PURE__ */ new Set();
    for (const uid of uids) {
      if (typeof uid !== "string" || !uid || seen.has(uid)) continue;
      seen.add(uid);
      clean.push(uid);
      if (clean.length >= PAGE_ATTRIBUTES_CAP) break;
    }
    const out = {};
    for (const uid of clean) {
      const attrs = {};
      out[uid] = attrs;
      let pulled = null;
      try {
        pulled = api.pull(PAGE_ATTRIBUTES_PULL, entityString(uid));
      } catch (error) {
        console.error("[compass] page attributes", error);
        continue;
      }
      for (const harc of asList(pulled?.[":harc/_e"])) {
        const name = attributeOf(harc);
        if (!name) continue;
        const key = name.toLowerCase();
        let entry = attrs[key];
        if (!entry) {
          entry = { name, values: [] };
          attrs[key] = entry;
        }
        for (const raw of asList(harc[":harc/v"])) {
          const value = attributeValueOf(raw);
          if (value) entry.values.push(value);
        }
      }
    }
    return out;
  }
  function applyPlan({ lockUid, guards = [], ops = [] } = {}) {
    const key = typeof lockUid === "string" && lockUid ? lockUid : "plan";
    const task = () => withLock(`compass:${graphName()}:${key}`, async () => {
      try {
        if (!Array.isArray(ops) || !ops.length) return { ok: false, reason: "empty" };
        if (ops.some((op) => hasForbiddenToken(op?.string))) return { ok: false, reason: "forbidden" };
        const api = roamApi()?.data;
        if (!api) return { ok: false, reason: "unavailable" };
        const guardList = asList(guards);
        if (guardList.length && typeof api.pull !== "function") return { ok: false, reason: "unavailable" };
        for (const item of guardList) {
          if (typeof item?.uid !== "string" || !item.uid) return { ok: false, reason: "missing" };
          const pulled = pull(api, GUARD_PULL, item.uid);
          if (!pulled || typeof pulled[":block/string"] !== "string") return { ok: false, reason: "missing" };
          if (pulled[":block/string"] !== item.string) return { ok: false, reason: "changed" };
        }
        const prepared = [];
        for (const raw of ops) {
          if (!raw || typeof raw !== "object") return { ok: false, reason: "invalid" };
          const op = { ...raw };
          if (op.op === "create" && !op.uid) {
            const uid = roamApi()?.util?.generateUID?.();
            if (typeof uid !== "string" || !uid) return { ok: false, reason: "no-uid" };
            op.uid = uid;
          }
          prepared.push(op);
        }
        for (const op of prepared) await applyOp(api, op);
        return { ok: true, ops: prepared };
      } catch (error) {
        console.error("[compass] apply plan", error);
        return { ok: false, reason: "failed" };
      }
    });
    const run = queue.then(task, task).catch((error) => {
      console.error("[compass] apply plan", error);
      return { ok: false, reason: "failed" };
    });
    queue = run.then(() => void 0, () => void 0);
    return run;
  }
  function attributeBlock(pageUid, attribute) {
    const target = typeof attribute === "string" ? attribute.trim().toLowerCase() : "";
    if (typeof pageUid !== "string" || !pageUid || !target) return null;
    try {
      const api = roamApi()?.data;
      if (typeof api?.pull !== "function") return null;
      const pulled = pull(api, ATTR_BLOCK_PULL, pageUid);
      const children = [...asList(pulled?.[":block/children"])].sort((a, b) => (a?.[":block/order"] ?? 0) - (b?.[":block/order"] ?? 0));
      for (const child of children) {
        const uid = child?.[":block/uid"];
        const string = child?.[":block/string"];
        if (typeof uid !== "string" || !uid || typeof string !== "string") continue;
        const parsed = parseAttribute(string);
        if (parsed && parsed.name.toLowerCase() === target) {
          const nested = asList(child[":block/children"]).map((item) => {
            const itemUid = item?.[":block/uid"];
            const itemString = item?.[":block/string"];
            if (typeof itemUid !== "string" || !itemUid || typeof itemString !== "string") return null;
            return {
              uid: itemUid,
              string: itemString,
              order: Number.isFinite(item[":block/order"]) ? item[":block/order"] : 0
            };
          }).filter(Boolean).sort(byOrder);
          return { uid, string, children: nested };
        }
      }
      return null;
    } catch (error) {
      console.error("[compass] attribute block", error);
      return null;
    }
  }
  function sourceBlock(uid) {
    if (typeof uid !== "string" || !uid) return null;
    try {
      const api = roamApi()?.data;
      if (typeof api?.pull !== "function") return null;
      const node = pull(api, SOURCE_BLOCK_PULL, uid);
      const blockUid = node?.[":block/uid"];
      if (typeof blockUid !== "string" || !blockUid || typeof node[":block/string"] !== "string") return null;
      const parentUid = asList(node[":block/_children"])[0]?.[":block/uid"];
      const children = asList(node[":block/children"]).map((child) => {
        const childUid = child?.[":block/uid"];
        const childString = child?.[":block/string"];
        if (typeof childUid !== "string" || !childUid || typeof childString !== "string") return null;
        const childCount = asList(child[":block/children"]).filter((grand) => typeof grand?.[":block/uid"] === "string" && grand[":block/uid"]).length;
        return {
          uid: childUid,
          string: childString,
          order: Number.isFinite(child[":block/order"]) ? child[":block/order"] : 0,
          childCount
        };
      }).filter(Boolean).sort(byOrder);
      return {
        uid: blockUid,
        string: node[":block/string"],
        order: Number.isFinite(node[":block/order"]) ? node[":block/order"] : null,
        parentUid: typeof parentUid === "string" ? parentUid : null,
        children
      };
    } catch (error) {
      console.error("[compass] source block", error);
      return null;
    }
  }
  lifecycle.add(() => closeSidecar());
  lifecycle.add(() => unwatch());
  lifecycle.add(() => {
    alive = false;
  });
  return {
    snapshot,
    watch,
    unwatch,
    titles,
    recents,
    openPageUid,
    mainUid,
    focusedBlock,
    openInSidebar,
    openInMain,
    syncSidecar,
    releaseSidecar,
    closeSidecar,
    move,
    childCounts,
    crossRows,
    findDrawingBlock,
    writeZoneAttribute,
    drawingRows,
    entity,
    pageByTitle: findPageByTitle,
    createPage,
    dailyPage,
    pageAttributes,
    applyPlan,
    attributeBlock,
    sourceBlock,
    blockContextMenu() {
      return roamApi()?.ui?.blockContextMenu ?? null;
    }
  };
}

// src/model/boards.js
var ARROWS = ["→", "↔", "—"];
function listOf(value) {
  return Array.isArray(value) ? value : [];
}
function nodeOf(row, extra) {
  const source = row && typeof row === "object" ? row : {};
  return { uid: source.uid, title: source.title, ...extra };
}
function boardPlan(api, centerUid) {
  if (!api || typeof api.boardsWith !== "function") return [];
  try {
    return listOf(api.boardsWith(centerUid)).map((row) => nodeOf(row, { role: "west", label: "On board" }));
  } catch {
    return [];
  }
}
function showBoardPlan(boards) {
  if (!Array.isArray(boards) || boards.length === 0) return { mode: "none" };
  if (boards.length === 1) return { mode: "open", board: boards[0] };
  return { mode: "picker", boards };
}
function cardPlan(api, boardUid, cap) {
  if (!api || typeof api.cardsOf !== "function") return [];
  try {
    const nodes = listOf(api.cardsOf(boardUid)).map((row) => nodeOf(row, { role: "south" }));
    const limit = typeof cap === "number" && Number.isFinite(cap) ? Math.max(0, Math.trunc(cap)) : nodes.length;
    return nodes.slice(0, limit);
  } catch {
    return [];
  }
}
function arrowAt(text, from) {
  let at = -1;
  for (const arrow of ARROWS) {
    const found = text.indexOf(arrow, from);
    if (found !== -1 && (at === -1 || found < at)) at = found;
  }
  return at;
}
function connectionLabel(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  const first = arrowAt(text, 0);
  if (first < 0) return "";
  let last = first;
  for (let next = arrowAt(text, first + 1); next !== -1; next = arrowAt(text, next + 1)) last = next;
  if (last === first) return "";
  return text.slice(first + 1, last).trim();
}
function openArgs(boardUid, cardUid, sidebar) {
  return { boardUid, card: cardUid, sidebar: sidebar === true };
}
function connectionEnds(text) {
  const ends = [];
  const refs = /\[\[([^[\]]*)\]\]|\(\(([^)]*)\)\)/g;
  for (const match of text.matchAll(refs)) {
    const at = match.index ?? 0;
    if (match[1] != null) {
      if (text[at - 1] === "{") continue;
      if (match[1]) ends.push(match[1]);
    } else if (match[2]) ends.push(match[2]);
    if (ends.length >= 2) break;
  }
  return ends;
}
function childText(child) {
  if (typeof child === "string") return child;
  if (!child || typeof child !== "object") return "";
  if (typeof child.string === "string") return child.string;
  if (typeof child[":block/string"] === "string") return child[":block/string"];
  return "";
}
function connectionEdges(children) {
  const out = [];
  const list = Array.isArray(children) ? children : [];
  for (const child of list) {
    const text = childText(child);
    if (!text) continue;
    const ends = connectionEnds(text);
    if (ends.length < 2) continue;
    out.push({ from: ends[0], to: ends[1], label: connectionLabel(text) });
  }
  return out;
}

// src/model/layout.js
var NODE = Object.freeze({ w: 180, h: 34 });
var SIBLING = Object.freeze({ w: 148, h: 28 });
var ROW_H = 24;
var SUB_H = 20;
var COL_GAP = 14;
var ROW_GAP = 12;
var V_GAP = 64;
var H_GAP = 72;
var CHIP_GAP = 22;
var HEADER_H = 56;
var BADGE_H = 24;
var MAX_ROWS = 40;
function nodeHeight(uid, baseH, sub) {
  const count2 = sub?.[uid];
  return typeof count2 === "number" && Number.isFinite(count2) && count2 > 0 ? baseH + count2 * SUB_H : baseH;
}
function gridWidth(count2, columns, width) {
  const used = Math.min(count2, columns);
  return used ? used * width + (used - 1) * COL_GAP : 0;
}
function grid(nodes, columns, direction, edge, sub) {
  const rows = Math.ceil(nodes.length / columns);
  const out = [];
  let cursor = edge;
  for (let row = 0; row < rows; row += 1) {
    const start = row * columns;
    const rowNodes = nodes.slice(start, start + columns);
    const inRow = rowNodes.length;
    const width = gridWidth(inRow, columns, NODE.w);
    let rowH = 0;
    for (const node of rowNodes) {
      const h = nodeHeight(node.uid, NODE.h, sub);
      if (h > rowH) rowH = h;
    }
    for (let column2 = 0; column2 < inRow; column2 += 1) {
      const node = rowNodes[column2];
      const h = nodeHeight(node.uid, NODE.h, sub);
      out.push({
        uid: node.uid,
        zone: node.zone,
        x: -width / 2 + column2 * (NODE.w + COL_GAP) + NODE.w / 2,
        y: direction * (cursor + h / 2),
        w: NODE.w,
        h
      });
    }
    cursor += rowH + ROW_GAP;
  }
  return out;
}
function column(nodes, x, top, size, gap, sub) {
  let cursor = top;
  return nodes.map((node) => {
    const h = nodeHeight(node.uid, size.h, sub);
    const item = {
      uid: node.uid,
      zone: node.zone,
      x,
      y: cursor + h / 2,
      w: size.w,
      h
    };
    cursor += h + gap;
    return item;
  });
}
function columnHeight(nodes, size, gap, sub) {
  if (!nodes.length) return 0;
  let total = (nodes.length - 1) * gap;
  for (const node of nodes) total += nodeHeight(node.uid, size.h, sub);
  return total;
}
function centerSize({ badges = 0, rows = 0, more = false } = {}) {
  const expanded = rows > 0 || more;
  const shown = Math.min(rows, MAX_ROWS) + (more ? 1 : 0);
  return {
    w: expanded ? 320 : 240,
    h: HEADER_H + (badges ? BADGE_H : 0) + (expanded ? shown * ROW_H + 8 : 0)
  };
}
function layout(neighborhood, options = {}) {
  const nodes = Array.isArray(neighborhood?.nodes) ? neighborhood.nodes : [];
  const rowsIn = Array.isArray(options.rows) ? options.rows.slice(0, MAX_ROWS) : [];
  const more = rowsIn.length < (options.rows?.length ?? 0);
  const badges = neighborhood?.center?.badges?.length ?? 0;
  const size = centerSize({ badges, rows: rowsIn.length, more });
  const cw = size.w;
  const ch = size.h;
  const flip = options.flip === true;
  const oneSided = options.oneSided === true;
  const sub = options.sub && typeof options.sub === "object" ? options.sub : null;
  const zone = (name) => nodes.filter((node) => node.zone === name);
  const north = zone("north");
  const south = zone("south");
  const west = zone("west");
  const east = zone("east");
  const siblings = zone("siblings");
  const northColumns = 3;
  const southColumns = 4;
  const items = [
    ...grid(north, northColumns, -1, ch / 2 + V_GAP, sub),
    ...grid(south, southColumns, 1, ch / 2 + V_GAP, sub)
  ];
  const wideHalf = Math.max(
    cw / 2,
    gridWidth(north.length, northColumns, NODE.w) / 2,
    gridWidth(south.length, southColumns, NODE.w) / 2
  );
  const lateralX = (height) => {
    const half = height / 2;
    const clear = half <= ch / 2 + V_GAP - ROW_GAP;
    return (clear ? cw / 2 : wideHalf) + H_GAP + NODE.w / 2;
  };
  let eastOuter = 0;
  if (oneSided) {
    const westH = columnHeight(west, NODE, ROW_GAP, sub);
    const eastH = columnHeight(east, NODE, ROW_GAP, sub);
    const gapBetween = west.length && east.length ? ROW_GAP * 2 : 0;
    const sharedH = westH + gapBetween + eastH;
    const sharedClear = sharedH / 2 <= ch / 2;
    const sharedX = -((sharedClear ? cw / 2 : wideHalf) + H_GAP + NODE.w / 2);
    const sharedTop = -sharedH / 2;
    items.push(...column(west, sharedX, sharedTop, NODE, ROW_GAP, sub));
    const eastTop = west.length ? sharedTop + westH + gapBetween : sharedTop;
    items.push(...column(east, sharedX, eastTop, NODE, ROW_GAP, sub));
  } else {
    const westH = columnHeight(west, NODE, ROW_GAP, sub);
    const eastH = columnHeight(east, NODE, ROW_GAP, sub);
    const westX = -lateralX(westH);
    const eastX = lateralX(eastH);
    items.push(...column(west, westX, -westH / 2, NODE, ROW_GAP, sub));
    items.push(...column(east, eastX, -eastH / 2, NODE, ROW_GAP, sub));
    eastOuter = east.length ? eastX + NODE.w / 2 : 0;
  }
  const siblingX = Math.max(eastOuter, wideHalf) + H_GAP * 0.75 + SIBLING.w / 2;
  const siblingTop = -(ch / 2 + V_GAP + NODE.h);
  items.push(...column(siblings, siblingX, siblingTop, SIBLING, 8, sub));
  if (flip) {
    for (const item of items) {
      if (item.zone === "west" || item.zone === "east" || item.zone === "siblings") {
        item.x = item.x === 0 ? 0 : -item.x;
      }
    }
  }
  const rowTop = -ch / 2 + HEADER_H + (badges ? BADGE_H : 0);
  const rows = rowsIn.map((row, index) => ({
    uid: row.uid,
    depth: row.depth,
    x: 0,
    y: rowTop + ROW_H / 2 + index * ROW_H,
    w: cw - 16,
    h: ROW_H
  }));
  const chips = [];
  const byZone = (name) => items.filter((item) => item.zone === name);
  for (const name of Object.keys(neighborhood?.overflow ?? {})) {
    const members = byZone(name);
    if (!members.length) continue;
    const top = Math.min(...members.map((item) => item.y - item.h / 2));
    const bottom = Math.max(...members.map((item) => item.y + item.h / 2));
    const x = members[0].zone === "north" || members[0].zone === "south" ? 0 : members[0].x;
    chips.push({ zone: name, x, y: name === "north" ? top - CHIP_GAP : bottom + CHIP_GAP });
  }
  let minX = -cw / 2;
  let maxX = cw / 2;
  let minY = -ch / 2;
  let maxY = ch / 2;
  for (const item of items) {
    minX = Math.min(minX, item.x - item.w / 2);
    maxX = Math.max(maxX, item.x + item.w / 2);
    minY = Math.min(minY, item.y - item.h / 2);
    maxY = Math.max(maxY, item.y + item.h / 2);
  }
  for (const chip of chips) {
    minY = Math.min(minY, chip.y - 12);
    maxY = Math.max(maxY, chip.y + 12);
  }
  const out = {
    center: { x: 0, y: 0, w: cw, h: ch },
    items,
    rows,
    more,
    chips,
    bounds: { minX, minY, maxX, maxY }
  };
  if (flip) out.flip = true;
  if (oneSided) out.oneSided = true;
  return out;
}
function sideAt(point, center, flip = false) {
  const halfW = center.w / 2;
  const halfH = center.h / 2;
  if (Math.abs(point.x) <= halfW && Math.abs(point.y) <= halfH) return null;
  const nx = point.x / (halfW + H_GAP);
  const ny = point.y / (halfH + V_GAP);
  if (Math.abs(ny) >= Math.abs(nx)) return ny < 0 ? "north" : "south";
  if (flip) return nx < 0 ? "east" : "west";
  return nx < 0 ? "west" : "east";
}

// src/model/related.js
var CAP = 50;
function centreSet(centreRefs) {
  if (centreRefs instanceof Set) return centreRefs.size > 0 ? centreRefs : null;
  if (!Array.isArray(centreRefs) || centreRefs.length === 0) return null;
  return new Set(centreRefs);
}
function scoreOf(refs, centre) {
  if (!Array.isArray(refs) || refs.length === 0) return 0;
  const seen = /* @__PURE__ */ new Set();
  let score2 = 0;
  for (const ref of refs) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    if (centre.has(ref)) score2 += 1;
  }
  return score2;
}
function rankDrawings(centreRefs, rows) {
  const centre = centreSet(centreRefs);
  if (!centre || !Array.isArray(rows) || rows.length === 0) return [];
  const ranked = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const score2 = scoreOf(row.refs, centre);
    if (score2 > 0) ranked.push({ row, score: score2 });
  }
  ranked.sort((a, b) => b.score - a.score || (b.row.editTime ?? 0) - (a.row.editTime ?? 0));
  return ranked.slice(0, CAP).map((item) => item.row);
}

// src/model/facts.js
var SINGLE_FIELDS = /* @__PURE__ */ new Set(["kind", "group", "type", "role", "zone", "style", "label"]);
function stringField(value) {
  return typeof value === "string" ? value : "";
}
function valueString(raw) {
  if (typeof raw === "string") return raw.trim();
  if (!raw || typeof raw !== "object") return "";
  if (typeof raw.title === "string") return raw.title.trim();
  if (typeof raw.text === "string") return raw.text.trim();
  return "";
}
function normalizeAttributes(attributes) {
  const out = {};
  if (!attributes || typeof attributes !== "object") return out;
  for (const [rawKey, entry] of Object.entries(attributes)) {
    const key = rawKey.trim().toLowerCase();
    if (!key) continue;
    const rawValues = Array.isArray(entry?.values) ? entry.values : Array.isArray(entry) ? entry : [];
    const values = [];
    for (const item of rawValues) {
      const text = valueString(item);
      if (text) values.push(text);
    }
    if (!values.length) continue;
    if (out[key]) out[key].push(...values);
    else out[key] = values;
  }
  return out;
}
function typeOf(attributes, typeAttribute) {
  const target = typeof typeAttribute === "string" ? typeAttribute.trim().toLowerCase() : "";
  if (!target || !attributes || typeof attributes !== "object") return "";
  for (const [rawKey, entry] of Object.entries(attributes)) {
    const matchesKey = rawKey.trim().toLowerCase() === target;
    const matchesName = typeof entry?.name === "string" && entry.name.trim().toLowerCase() === target;
    if (!matchesKey && !matchesName) continue;
    const rawValues = Array.isArray(entry?.values) ? entry.values : Array.isArray(entry) ? entry : [];
    for (const item of rawValues) {
      const text = valueString(item);
      if (text) return text;
    }
  }
  return "";
}
function groupOf(node, { empty = false } = {}) {
  if (node?.kind === "group") return "group";
  if (node?.style === "board" || node?.style === "card") return node.style;
  const plexus2 = plexusKind(node) ?? (node?.plexus === "region" || node?.plexus === "drawing" ? node.plexus : null);
  if (plexus2 === "region" || plexus2 === "drawing") return plexus2;
  if (node?.kind === "page" && empty === true) return "empty";
  return stringField(node?.kind);
}
function factOf(node, attributes = {}, { typeAttribute = "Type", empty = false } = {}) {
  return {
    uid: stringField(node?.uid),
    title: stringField(node?.title),
    alias: stringField(node?.alias),
    kind: stringField(node?.kind),
    group: groupOf(node, { empty: Boolean(empty) }),
    type: typeOf(attributes, typeAttribute),
    role: stringField(node?.role),
    zone: stringField(node?.zone),
    style: stringField(node?.style),
    label: stringField(node?.label),
    attributes: normalizeAttributes(attributes)
  };
}
function factsFor(nodes, attributesByUid = {}, { typeAttribute = "Type", emptyUids = /* @__PURE__ */ new Set() } = {}) {
  const map = /* @__PURE__ */ new Map();
  if (!nodes || typeof nodes[Symbol.iterator] !== "function") return map;
  const emptySet = emptyUids instanceof Set ? emptyUids : new Set(Array.isArray(emptyUids) ? emptyUids : []);
  for (const node of nodes) {
    if (typeof node?.uid !== "string" || !node.uid) continue;
    const attrs = attributesByUid instanceof Map ? attributesByUid.get(node.uid) : attributesByUid?.[node.uid];
    map.set(node.uid, factOf(node, attrs ?? {}, { typeAttribute, empty: emptySet.has(node.uid) }));
  }
  return map;
}
function fieldValues(fact, field) {
  if (!fact || typeof fact !== "object" || typeof field !== "string") return [];
  if (field === "title") {
    const out = [];
    if (typeof fact.title === "string" && fact.title) out.push(fact.title);
    if (typeof fact.alias === "string" && fact.alias) out.push(fact.alias);
    return out;
  }
  if (SINGLE_FIELDS.has(field)) {
    const value = fact[field];
    return typeof value === "string" && value ? [value] : [];
  }
  if (field.startsWith("attr:")) {
    const key = field.slice(5).trim().toLowerCase();
    if (!key) return [];
    const values = fact.attributes?.[key];
    return Array.isArray(values) ? [...values] : [];
  }
  return [];
}
function matchCondition(condition, fact) {
  if (!condition || typeof condition !== "object") return false;
  const { field, op, value } = condition;
  const values = fieldValues(fact, field);
  if (op === "exists") return values.length > 0;
  if (op === "missing") return values.length === 0;
  const needle = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (op === "is") return needle !== "" && values.some((item) => item.trim() === needle);
  if (op === "is-not") return needle === "" || !values.some((item) => item.trim() === needle);
  if (op === "contains") {
    if (!needle) return false;
    const lower = needle.toLowerCase();
    return values.some((item) => item.toLowerCase().includes(lower));
  }
  if (op === "not-contains") {
    if (!needle) return true;
    const lower = needle.toLowerCase();
    return !values.some((item) => item.toLowerCase().includes(lower));
  }
  return false;
}
function matchConditions(match, fact) {
  if (!match || typeof match !== "object") return false;
  const all = Array.isArray(match.all) ? match.all : [];
  const any = Array.isArray(match.any) ? match.any : [];
  if (!all.length && !any.length) return false;
  if (all.length && !all.every((condition) => matchCondition(condition, fact))) return false;
  if (any.length && !any.some((condition) => matchCondition(condition, fact))) return false;
  return true;
}

// src/model/search.js
function subsequence(needle, haystack) {
  let at = 0;
  let gaps = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, at);
    if (found < 0) return -1;
    gaps += found - at;
    at = found + 1;
  }
  return gaps;
}
function score(query, title) {
  const text = title.toLowerCase();
  if (text === query) return 0;
  if (text.startsWith(query)) return 1 + text.length / 1e3;
  const word = text.search(new RegExp(`(^|[\\s/_(-])${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  if (word >= 0) return 2 + word / 1e3;
  const at = text.indexOf(query);
  if (at >= 0) return 3 + at / 1e3;
  const gaps = subsequence(query, text);
  if (gaps >= 0 && gaps <= query.length * 3) return 4 + gaps / 100;
  return null;
}
function rankTitles(entries, input, limit = 20) {
  const query = String(input ?? "").trim().toLowerCase();
  if (!query) return [];
  const ranked = [];
  for (const entry of entries ?? []) {
    if (!entry?.uid || typeof entry.title !== "string") continue;
    const value = score(query, entry.title);
    if (value != null) ranked.push({ ...entry, score: value });
  }
  ranked.sort((a, b) => a.score - b.score || a.title.length - b.title.length || (a.title < b.title ? -1 : 1));
  return ranked.slice(0, limit).map(({ uid, title }) => ({ uid, title }));
}
function shownTitle(row) {
  return row.title ?? row.uid;
}
function hasUid(row) {
  return row?.uid != null && row.uid !== "";
}
function emptyQueryRows({ pins = [], today = null, pages = [], drawings = [], limit = 8 } = {}) {
  const seen = /* @__PURE__ */ new Set();
  const rows = [];
  for (const pin of pins ?? []) {
    if (!hasUid(pin) || seen.has(pin.uid)) continue;
    seen.add(pin.uid);
    rows.push({ uid: pin.uid, title: shownTitle(pin), kind: "pin" });
  }
  if (hasUid(today) && !seen.has(today.uid)) {
    seen.add(today.uid);
    rows.push({ uid: today.uid, title: shownTitle(today), kind: "today" });
  }
  const recent = [];
  for (const row of [...pages ?? [], ...drawings ?? []]) {
    if (!hasUid(row) || !Number.isFinite(row.editTime)) continue;
    recent.push(row);
  }
  recent.sort((a, b) => {
    if (a.editTime !== b.editTime) return b.editTime - a.editTime;
    const left = shownTitle(a);
    const right = shownTitle(b);
    if (left < right) return -1;
    if (left > right) return 1;
    if (a.uid < b.uid) return -1;
    if (a.uid > b.uid) return 1;
    return 0;
  });
  let kept = 0;
  for (const row of recent) {
    if (kept >= limit) break;
    if (seen.has(row.uid)) continue;
    seen.add(row.uid);
    rows.push({ uid: row.uid, title: shownTitle(row), kind: "recent" });
    kept += 1;
  }
  return rows;
}

// src/model/views.js
var VIEWS = Object.freeze(["compass", "mindmap", "facets"]);
var VIEW_OPTIONS = Object.freeze([
  Object.freeze({ view: "compass", id: "view-compass", title: "View: Compass" }),
  Object.freeze({ view: "mindmap", id: "view-mindmap", title: "View: Mind Map" }),
  Object.freeze({ view: "facets", id: "view-facets", title: "View: Facets" })
]);
function isValidView(value) {
  return typeof value === "string" && VIEWS.includes(value);
}
function normalizeView(value) {
  return isValidView(value) ? value : "compass";
}
function viewEntries(currentView, onSelect) {
  const active = normalizeView(currentView);
  return VIEW_OPTIONS.map((item) => ({
    view: item.view,
    id: item.id,
    title: item.title,
    menuTitle: item.view === active ? `✓ ${item.title}` : item.title,
    active: item.view === active,
    run: typeof onSelect === "function" ? () => onSelect(item.view) : void 0
  }));
}

// src/settings.js
var SETTING_IDS = Object.freeze({
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
  wanderSeconds: "compass-wander-seconds"
});
var DEFAULTS = Object.freeze({
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
  "compass-wander-seconds": "6"
});
var SWITCHES = /* @__PURE__ */ new Set([
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
  SETTING_IDS.pinMonth
]);
var SELECT_ITEMS = Object.freeze({
  [SETTING_IDS.sort]: Object.freeze(["connections", "name", "edited", "created"]),
  [SETTING_IDS.view]: VIEWS,
  [SETTING_IDS.weekStart]: Object.freeze(["monday", "sunday"]),
  [SETTING_IDS.mindmapDirection]: Object.freeze(["right", "left", "balanced"])
});
var ROWS = [
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
  [SETTING_IDS.wanderSeconds, "Wander pace", "Seconds per move, 3 to 15."]
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
function flag2(value, fallback) {
  if (value == null || value === "") return fallback;
  if (value === true || value === "on" || value === "true" || value === 1) return true;
  if (value === false || value === "off" || value === "false" || value === 0) return false;
  return Boolean(value);
}
function readPins(value) {
  const list = readArray(value);
  const seen = /* @__PURE__ */ new Set();
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
function readCompassSettings(extensionAPI) {
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
      links: flag2(read(SETTING_IDS.links), true),
      siblings: flag2(read(SETTING_IDS.siblings), true),
      badges: flag2(read(SETTING_IDS.badges), true),
      maxPerZone: read(SETTING_IDS.maxZone),
      sort: readChoice(read(SETTING_IDS.sort), SELECT_ITEMS[SETTING_IDS.sort], "connections")
    },
    sidecar: flag2(read(SETTING_IDS.sidecar), true),
    outline: flag2(read(SETTING_IDS.outline), false),
    drawings: flag2(read(SETTING_IDS.drawings), true),
    boards: flag2(read(SETTING_IDS.boards), true),
    follow: flag2(read(SETTING_IDS.follow), false),
    relatedDrawings: flag2(read(SETTING_IDS.relatedDrawings), true),
    pins: readPins(read(SETTING_IDS.pins)),
    crossLinks: flag2(read(SETTING_IDS.crossLinks), false),
    view: readChoice(read(SETTING_IDS.view), SELECT_ITEMS[SETTING_IDS.view], "compass"),
    facetsPreset: readText(read(SETTING_IDS.facetsPreset), "roles"),
    facetsPresets: readArray(read(SETTING_IDS.facetsPresets)),
    lenses: readArray(read(SETTING_IDS.lenses)),
    filterReflow: flag2(read(SETTING_IDS.filterReflow), false),
    group: flag2(read(SETTING_IDS.group), false),
    expanded: flag2(read(SETTING_IDS.expanded), false),
    typeAttribute: readText(read(SETTING_IDS.typeAttribute), "Type"),
    flip: flag2(read(SETTING_IDS.flip), false),
    oneSided: flag2(read(SETTING_IDS.oneSided), false),
    trackpad: flag2(read(SETTING_IDS.trackpad), false),
    pinToday: flag2(read(SETTING_IDS.pinToday), true),
    pinWeek: flag2(read(SETTING_IDS.pinWeek), false),
    pinMonth: flag2(read(SETTING_IDS.pinMonth), false),
    weekFormat: readText(read(SETTING_IDS.weekFormat), DEFAULTS[SETTING_IDS.weekFormat]),
    monthFormat: readText(read(SETTING_IDS.monthFormat), DEFAULTS[SETTING_IDS.monthFormat]),
    weekStart: readChoice(read(SETTING_IDS.weekStart), SELECT_ITEMS[SETTING_IDS.weekStart], "monday"),
    mindmapDirection: readChoice(read(SETTING_IDS.mindmapDirection), SELECT_ITEMS[SETTING_IDS.mindmapDirection], "right"),
    mindmapGenerations: readClampedInt(read(SETTING_IDS.mindmapGenerations), 1, 5, 2),
    wanderSeconds: readClampedInt(read(SETTING_IDS.wanderSeconds), 3, 15, 6)
  };
}
async function writeSetting(extensionAPI, id, value) {
  if (extensionAPI?.settings?.canSet === false || !extensionAPI?.settings?.set) return;
  await extensionAPI.settings.set(id, value);
}
async function initializeSettings(extensionAPI) {
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
      onChange: (event) => persist(id, parseInput(id, typeof event === "string" ? event : event?.target?.value))
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
  }
  return text;
}
function createSettingsPanel({ extensionAPI, onChange } = {}) {
  const persist = (id, value) => Promise.resolve(writeSetting(extensionAPI, id, value)).catch((error) => console.error("[compass] setting", error)).then(() => {
    if (typeof onChange === "function") onChange(id, value);
  });
  return {
    tabTitle: "Compass",
    settings: ROWS.map(([id, name, description]) => ({
      id,
      name,
      description,
      action: settingAction(id, persist)
    }))
  };
}

// src/view/features.js
var SKIPPED = /* @__PURE__ */ Symbol("skipped");
function createFeatures() {
  const items = [];
  function call(feature, hook, args) {
    try {
      const fn = feature[hook];
      if (typeof fn !== "function") return SKIPPED;
      return feature[hook](...args);
    } catch (error) {
      console.error("[compass] feature", feature.name, hook, error);
      return void 0;
    }
  }
  return {
    add(feature) {
      if (feature == null) return null;
      if (typeof feature !== "object" || typeof feature.name !== "string" || !feature.name) {
        throw new TypeError("A feature must have a string name");
      }
      items.push(feature);
      return feature;
    },
    get(name) {
      return items.find((feature) => feature.name === name) ?? null;
    },
    list() {
      return [...items];
    },
    each(hook, ...args) {
      for (const feature of items) call(feature, hook, args);
    },
    any(hook, ...args) {
      for (const feature of items) {
        if (call(feature, hook, args) === true) return true;
      }
      return false;
    },
    first(hook, ...args) {
      for (const feature of items) {
        const result = call(feature, hook, args);
        if (result !== SKIPPED && result != null) return result;
      }
      return null;
    },
    pipe(hook, value, ...args) {
      let current = value;
      for (const feature of items) {
        const result = call(feature, hook, [current, ...args]);
        if (result !== SKIPPED && result != null) current = result;
      }
      return current;
    },
    collect(hook, ...args) {
      const out = [];
      for (const feature of items) {
        const result = call(feature, hook, args);
        if (Array.isArray(result)) out.push(...result);
      }
      return out;
    }
  };
}

// src/model/trail.js
var DEFAULT_CAP = 500;
function formatRelativeTime(at, now = Date.now()) {
  if (!Number.isFinite(at) || !Number.isFinite(now)) return "now";
  const diffMs = Math.max(0, now - at);
  if (diffMs < 6e4) return "now";
  const mins = Math.floor(diffMs / 6e4);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(diffMs / 36e5);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(diffMs / 864e5);
  return `${days} d`;
}
function normalizeCap(raw) {
  if (raw == null || raw === "") return DEFAULT_CAP;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_CAP;
  return Math.trunc(parsed);
}
function createTrail({ cap = DEFAULT_CAP, clock, now } = {}) {
  const limit = normalizeCap(cap);
  const readTime = typeof clock === "function" ? clock : typeof now === "function" ? now : () => Date.now();
  const items = [];
  let seq = 0;
  function copy(entry) {
    return entry ? { ...entry } : null;
  }
  return {
    get size() {
      return items.length;
    },
    visit({ uid, title, kind } = {}) {
      if (typeof uid !== "string" || !uid.trim()) return null;
      seq += 1;
      const entry = {
        uid,
        title: typeof title === "string" && title ? title : uid,
        kind: kind === "block" ? "block" : "page",
        at: Number(readTime()),
        seq
      };
      if (limit > 0) {
        items.push(entry);
        while (items.length > limit) items.shift();
      }
      return copy(entry);
    },
    entries() {
      const out = [];
      for (let i = items.length - 1; i >= 0; i -= 1) {
        out.push(copy(items[i]));
      }
      return out;
    },
    current() {
      return items.length ? copy(items[items.length - 1]) : null;
    },
    startHere() {
      if (items.length > 1) items.splice(0, items.length - 1);
      return items.length ? copy(items[0]) : null;
    },
    markdown() {
      if (!items.length) return "";
      const lines = [];
      for (let i = items.length - 1; i >= 0; i -= 1) {
        const entry = items[i];
        lines.push(entry.kind === "block" ? `- ((${entry.uid}))` : `- [[${entry.title || entry.uid}]]`);
      }
      return lines.join("\n");
    },
    retitle(uid, title) {
      if (typeof uid !== "string" || !uid || typeof title !== "string" || !title) return 0;
      let updated = 0;
      for (const entry of items) {
        if (entry.uid === uid) {
          entry.title = title;
          updated += 1;
        }
      }
      return updated;
    }
  };
}

// src/view/clipboard.js
function copyWithTextarea(value) {
  const doc = globalThis.document;
  if (!doc?.body || typeof doc.createElement !== "function" || typeof doc.execCommand !== "function") {
    return false;
  }
  let area = null;
  try {
    area = doc.createElement("textarea");
    area.value = value;
    area.setAttribute?.("readonly", "");
    if (area.style) {
      area.style.position = "fixed";
      area.style.top = "-9999px";
      area.style.left = "-9999px";
      area.style.opacity = "0";
    }
    doc.body.append(area);
    area.focus?.();
    area.select?.();
    return doc.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    try {
      area?.remove?.();
    } catch {
    }
  }
}
async function copyText(text) {
  const value = String(text ?? "");
  const clipboard = globalThis.navigator?.clipboard;
  if (typeof clipboard?.writeText === "function") {
    try {
      await clipboard.writeText(value);
      return true;
    } catch {
    }
  }
  return copyWithTextarea(value);
}
async function copyBlob(blob) {
  if (!blob) return false;
  const clipboard = globalThis.navigator?.clipboard;
  const Item = globalThis.ClipboardItem;
  if (typeof clipboard?.write !== "function" || typeof Item !== "function") return false;
  try {
    await clipboard.write([new Item({ [blob.type]: blob })]);
    return true;
  } catch {
    return false;
  }
}
function saveBlob(blob, filename) {
  if (!blob) return false;
  const doc = globalThis.document;
  const urlApi = globalThis.URL;
  if (!doc?.body || typeof doc.createElement !== "function" || typeof urlApi?.createObjectURL !== "function") {
    return false;
  }
  let url = null;
  let link = null;
  try {
    url = urlApi.createObjectURL(blob);
    link = doc.createElement("a");
    link.href = url;
    link.download = String(filename ?? "download");
    if (link.style) link.style.display = "none";
    doc.body.append(link);
    link.click();
    return true;
  } catch {
    return false;
  } finally {
    try {
      link?.remove?.();
    } catch {
    }
    if (url != null) {
      try {
        urlApi.revokeObjectURL?.(url);
      } catch {
      }
    }
  }
}

// src/view/features/trail.js
function visitCountLabel(count2) {
  return `${count2} ${count2 === 1 ? "visit" : "visits"}`;
}
function isAltShortcut(event, letter, code) {
  if (!event?.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (event.code === code) return true;
  return typeof event.key === "string" && event.key.toLowerCase() === letter;
}
function createTrail2(ctx) {
  const trail = createTrail();
  const hasDom = Boolean(
    ctx?.dom?.root && typeof ctx?.el === "function" && typeof ctx?.button === "function" && ctx?.lifecycle?.node && ctx?.lifecycle?.event
  );
  let barBtn = null;
  let panel = null;
  let countEl = null;
  let listEl = null;
  let copyBtn = null;
  let startBtn = null;
  let refreshTimer = null;
  let justOpened = false;
  function isPanelOpen() {
    return Boolean(panel && !panel.hidden);
  }
  function stopRefreshTimer() {
    if (refreshTimer != null && typeof ctx?.cancel === "function") {
      refreshTimer = ctx.cancel(refreshTimer);
    } else {
      refreshTimer = null;
    }
  }
  function armRefreshTimer() {
    stopRefreshTimer();
    if (!isPanelOpen() || typeof ctx?.later !== "function") return;
    refreshTimer = ctx.later(() => {
      refreshTimer = null;
      if (!isPanelOpen()) return;
      renderPanel({ preserveScroll: true, preserveFocus: true });
      armRefreshTimer();
    }, 3e4);
  }
  function recordVisit(uid) {
    if (typeof uid !== "string" || !uid.trim()) return;
    const found = ctx?.host?.entity?.(uid) ?? null;
    const entry = found ? {
      uid: found.uid || uid,
      kind: found.kind === "block" ? "block" : "page",
      title: found.title || ctx?.titleOf?.(uid) || uid
    } : {
      uid,
      kind: "page",
      title: ctx?.titleOf?.(uid) || uid
    };
    trail.visit(entry);
  }
  function renderPanel({ preserveScroll = false, preserveFocus = false } = {}) {
    if (!panel || !listEl || !countEl) return;
    const prevScroll = preserveScroll ? listEl.scrollTop : 0;
    const activeSeq = preserveFocus ? listEl.querySelector(".compass-trail-row:focus")?.dataset?.seq ?? null : null;
    const entries = trail.entries();
    countEl.textContent = visitCountLabel(entries.length);
    const nowMs = Date.now();
    listEl.replaceChildren();
    if (!entries.length) {
      listEl.append(ctx.el("div", "compass-trail-empty", "No visits yet"));
    } else {
      for (const [index, entry] of entries.entries()) {
        const live = ctx?.host?.entity?.(entry.uid) ?? null;
        const missing = live == null;
        if (!missing && live.kind === "page" && live.title && live.title !== entry.title) {
          trail.retitle(entry.uid, live.title);
          entry.title = live.title;
        }
        const row = ctx.button("compass-trail-row");
        row.dataset.uid = entry.uid;
        row.dataset.kind = entry.kind;
        row.dataset.seq = String(entry.seq);
        if (index === 0) {
          row.classList.add("compass-trail-row-current");
          row.setAttribute("aria-current", "true");
        }
        if (missing) {
          row.classList.add("compass-trail-row-missing");
          row.disabled = true;
        }
        const displayTitle = !missing && live?.title ? live.title : entry.title || entry.uid;
        row.title = displayTitle;
        const titleSpan = ctx.el("span", "compass-trail-title", displayTitle);
        const timeSpan = ctx.el("span", "compass-trail-time", formatRelativeTime(entry.at, nowMs));
        row.append(titleSpan, timeSpan);
        listEl.append(row);
      }
    }
    if (copyBtn) copyBtn.disabled = entries.length === 0;
    if (startBtn) startBtn.disabled = entries.length === 0;
    if (preserveScroll && prevScroll > 0) {
      listEl.scrollTop = prevScroll;
    } else {
      listEl.scrollTop = 0;
    }
    if (activeSeq) {
      const target = listEl.querySelector(`.compass-trail-row[data-seq="${activeSeq}"]:not(:disabled)`);
      target?.focus?.({ preventScroll: true });
    }
  }
  function placePanel() {
    if (!panel || !barBtn || typeof ctx?.placeFloating !== "function") return;
    const rect = barBtn.getBoundingClientRect();
    ctx.placeFloating(panel, rect.left, rect.bottom - 2);
  }
  function open() {
    if (!panel || !barBtn) return;
    ctx?.hideFloating?.();
    renderPanel({ preserveScroll: false });
    barBtn.setAttribute("aria-pressed", "true");
    barBtn.setAttribute("aria-expanded", "true");
    placePanel();
    justOpened = true;
    Promise.resolve().then(() => {
      justOpened = false;
    });
    armRefreshTimer();
    const newest = listEl.querySelector(".compass-trail-row:not(:disabled)") ?? listEl.querySelector(".compass-trail-row") ?? copyBtn;
    newest?.focus?.({ preventScroll: true });
  }
  function close({ restoreFocus = false } = {}) {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    stopRefreshTimer();
    if (barBtn) {
      barBtn.setAttribute("aria-pressed", "false");
      barBtn.setAttribute("aria-expanded", "false");
      if (restoreFocus) barBtn.focus({ preventScroll: true });
    }
  }
  function toggle() {
    if (isPanelOpen()) close({ restoreFocus: true });
    else open();
  }
  function startHere() {
    if (trail.size === 0 && ctx?.state?.current) {
      recordVisit(ctx.state.current);
    } else {
      trail.startHere();
    }
    if (isPanelOpen()) {
      renderPanel({ preserveScroll: false });
      const newest = listEl?.querySelector(".compass-trail-row:not(:disabled)") ?? startBtn;
      newest?.focus?.({ preventScroll: true });
    }
  }
  async function copyMarkdown() {
    const count2 = trail.size;
    const ok = await copyText(trail.markdown());
    ctx?.setStatus?.(ok ? `Copied ${visitCountLabel(count2)}` : "Could not copy");
    return ok;
  }
  function chooseRow(uid) {
    if (!uid) return;
    close({ restoreFocus: false });
    ctx?.focusUid?.(uid);
  }
  if (hasDom) {
    barBtn = ctx.button("compass-trail-btn", "Footprints", "Footprints (Alt+H)");
    barBtn.setAttribute("aria-pressed", "false");
    barBtn.setAttribute("aria-expanded", "false");
    ctx.addBarButton?.(barBtn);
    panel = ctx.el("div", "compass-trail-panel");
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Footprints");
    const header = ctx.el("div", "compass-trail-header");
    const heading = ctx.el("span", "compass-trail-heading", "Footprints");
    countEl = ctx.el("span", "compass-trail-count", "0 visits");
    header.append(heading, countEl);
    listEl = ctx.el("div", "compass-trail-list");
    const footer = ctx.el("div", "compass-trail-footer");
    copyBtn = ctx.button("compass-trail-copy", "Copy as Markdown");
    startBtn = ctx.button("compass-trail-start", "Start here");
    footer.append(copyBtn, startBtn);
    panel.append(header, listEl, footer);
    ctx.lifecycle.node(panel, ctx.dom.root);
    ctx.lifecycle.event(barBtn, "click", () => toggle());
    ctx.lifecycle.event(copyBtn, "click", () => {
      void copyMarkdown();
    });
    ctx.lifecycle.event(startBtn, "click", () => startHere());
    ctx.lifecycle.event(listEl, "click", (event) => {
      const row = event.target.closest?.(".compass-trail-row");
      if (!row || row.disabled) return;
      chooseRow(row.dataset.uid);
    });
    ctx.lifecycle.event(panel, "keydown", (event) => {
      const rows = [...listEl.querySelectorAll(".compass-trail-row:not(:disabled)")];
      const activeRow = event.target.closest?.(".compass-trail-row");
      const activeIndex = activeRow ? rows.indexOf(activeRow) : -1;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        if (!rows.length) return;
        const nextIndex = activeIndex < 0 ? 0 : Math.min(rows.length - 1, activeIndex + 1);
        rows[nextIndex].focus({ preventScroll: true });
        rows[nextIndex].scrollIntoView?.({ block: "nearest" });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        if (!rows.length) return;
        const prevIndex = activeIndex < 0 ? 0 : Math.max(0, activeIndex - 1);
        rows[prevIndex].focus({ preventScroll: true });
        rows[prevIndex].scrollIntoView?.({ block: "nearest" });
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        event.stopPropagation();
        if (!rows.length) return;
        listEl.scrollTop = 0;
        rows[0].focus({ preventScroll: true });
        rows[0].scrollIntoView?.({ block: "nearest" });
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        event.stopPropagation();
        if (!rows.length) return;
        const last = rows[rows.length - 1];
        last.focus({ preventScroll: true });
        last.scrollIntoView?.({ block: "nearest" });
        return;
      }
      if (event.key === "Enter" && activeRow && !activeRow.disabled) {
        event.preventDefault();
        event.stopPropagation();
        chooseRow(activeRow.dataset.uid);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close({ restoreFocus: true });
      }
    });
    const onOutside = (event) => {
      if (!isPanelOpen() || justOpened) return;
      const target = event.target;
      if (panel.contains(target) || barBtn.contains(target)) return;
      close({ restoreFocus: false });
    };
    const doc = globalThis.document ?? ctx.dom.root;
    ctx.lifecycle.event(doc, "pointerdown", onOutside);
    ctx.lifecycle.event(doc, "click", onOutside);
    if (globalThis.addEventListener) {
      ctx.lifecycle.event(globalThis, "resize", () => {
        if (isPanelOpen()) placePanel();
      });
    }
    ctx.lifecycle.add(() => stopRefreshTimer());
  }
  return {
    name: "trail",
    entries() {
      return trail.entries();
    },
    markdown() {
      return trail.markdown();
    },
    startHere,
    open,
    close: () => close({ restoreFocus: false }),
    toggle,
    onNavigate({ uid, changed } = {}) {
      if (!uid) return;
      if (changed || trail.size === 0) {
        recordVisit(uid);
        if (isPanelOpen()) {
          renderPanel({ preserveScroll: true });
        }
      }
    },
    afterRender({ hood } = {}) {
      const center = hood?.center;
      if (center?.kind === "page" && center.uid && center.title) {
        const changedCount = trail.retitle(center.uid, center.title);
        if (changedCount > 0 && isPanelOpen()) {
          renderPanel({ preserveScroll: true, preserveFocus: true });
        }
      }
    },
    onClose() {
      close({ restoreFocus: false });
    },
    onEscape() {
      if (!isPanelOpen()) return false;
      close({ restoreFocus: true });
      return true;
    },
    onKey(event) {
      if (isAltShortcut(event, "h", "KeyH")) {
        toggle();
        return true;
      }
      return false;
    },
    commands() {
      return [
        { id: "trail-open", title: "Footprints", hint: "Alt+H", run: () => toggle() },
        { id: "trail-copy", title: "Copy trail as Markdown", hint: "", run: () => copyMarkdown() },
        { id: "trail-start", title: "Start trail here", hint: "", run: () => startHere() }
      ];
    }
  };
}

// src/model/periodic.js
var MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
var SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];
var MS_PER_DAY = 864e5;
var DEFAULT_WEEK_FORMAT = "YYYY-[W]WW";
var DEFAULT_MONTH_FORMAT = "MMMM YYYY";
var TOKEN_PATTERN = /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|Do|D|WW|W|GGGG|gggg/g;
function pad2(value) {
  return String(value).padStart(2, "0");
}
function pad4(value) {
  const sign = value < 0 ? "-" : "";
  return `${sign}${String(Math.abs(value)).padStart(4, "0")}`;
}
function ordinalDay(day) {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  const mod10 = day % 10;
  if (mod10 === 1) return `${day}st`;
  if (mod10 === 2) return `${day}nd`;
  if (mod10 === 3) return `${day}rd`;
  return `${day}th`;
}
function weekParts(year, month, day, weekStart) {
  const utc = Date.UTC(year, month, day);
  const dow = new Date(utc).getUTCDay();
  if (weekStart === "sunday") {
    const sundayUtc = utc - dow * MS_PER_DAY;
    const saturdayUtc = sundayUtc + 6 * MS_PER_DAY;
    const weekYear2 = new Date(saturdayUtc).getUTCFullYear();
    const jan1Utc2 = Date.UTC(weekYear2, 0, 1);
    const jan1Dow = new Date(jan1Utc2).getUTCDay();
    const week1SundayUtc = jan1Utc2 - jan1Dow * MS_PER_DAY;
    const week2 = Math.round((sundayUtc - week1SundayUtc) / (7 * MS_PER_DAY)) + 1;
    return { week: week2, weekYear: weekYear2 };
  }
  const isoDow = dow === 0 ? 7 : dow;
  const thursdayUtc = utc + (4 - isoDow) * MS_PER_DAY;
  const weekYear = new Date(thursdayUtc).getUTCFullYear();
  const jan1Utc = Date.UTC(weekYear, 0, 1);
  const week = Math.floor((thursdayUtc - jan1Utc) / MS_PER_DAY / 7) + 1;
  return { week, weekYear };
}
function toValidDate(input) {
  const d = input instanceof Date ? input : new Date(input ?? Date.now());
  return Number.isNaN(d.getTime()) ? null : d;
}
function formatPeriod(date, pattern, { weekStart = "monday" } = {}) {
  const d = toValidDate(date);
  if (!d || typeof pattern !== "string" || !pattern) return "";
  const year = d.getFullYear();
  const monthIndex = d.getMonth();
  const month = monthIndex + 1;
  const day = d.getDate();
  const normalizedStart = weekStart === "sunday" ? "sunday" : "monday";
  const { week, weekYear } = weekParts(year, monthIndex, day, normalizedStart);
  return pattern.replace(TOKEN_PATTERN, (token, literal) => {
    if (literal !== void 0) return literal;
    switch (token) {
      case "YYYY":
        return pad4(year);
      case "YY":
        return pad2(Math.abs(year) % 100);
      case "MMMM":
        return MONTHS[monthIndex];
      case "MMM":
        return SHORT_MONTHS[monthIndex];
      case "MM":
        return pad2(month);
      case "M":
        return String(month);
      case "DD":
        return pad2(day);
      case "Do":
        return ordinalDay(day);
      case "D":
        return String(day);
      case "WW":
        return pad2(week);
      case "W":
        return String(week);
      case "GGGG":
      case "gggg":
        return pad4(weekYear);
      default:
        return token;
    }
  });
}
function settingText(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}
function periodTitle(kind, date, settings = {}) {
  const rawStart = settings?.weekStart ?? settings?.["compass-week-start"];
  const weekStart = rawStart === "sunday" ? "sunday" : "monday";
  if (kind === "week") {
    const pattern = settingText(settings?.weekFormat ?? settings?.["compass-week-format"], DEFAULT_WEEK_FORMAT);
    return formatPeriod(date, pattern, { weekStart });
  }
  if (kind === "month") {
    const pattern = settingText(settings?.monthFormat ?? settings?.["compass-month-format"], DEFAULT_MONTH_FORMAT);
    return formatPeriod(date, pattern, { weekStart });
  }
  return "";
}
function readFlag(value, fallback) {
  if (value == null || value === "") return fallback;
  if (value === true || value === "on" || value === "true" || value === 1) return true;
  if (value === false || value === "off" || value === "false" || value === 0) return false;
  return Boolean(value);
}
function periodicPins({ settings = {}, now, daily } = {}) {
  const date = toValidDate(now) ?? /* @__PURE__ */ new Date();
  const showToday = readFlag(settings?.pinToday ?? settings?.["compass-pin-today"], true);
  const showWeek = readFlag(settings?.pinWeek ?? settings?.["compass-pin-week"], false);
  const showMonth = readFlag(settings?.pinMonth ?? settings?.["compass-pin-month"], false);
  const out = [];
  if (showToday) {
    const fallbackUid = `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}-${pad4(date.getFullYear())}`;
    const uid = typeof daily?.uid === "string" && daily.uid ? daily.uid : fallbackUid;
    const title = typeof daily?.title === "string" && daily.title ? daily.title : formatPeriod(date, "MMMM Do, YYYY");
    out.push({ id: "today", label: "Today", title, uid });
  }
  if (showWeek) {
    out.push({
      id: "week",
      label: "This week",
      title: periodTitle("week", date, settings),
      uid: null
    });
  }
  if (showMonth) {
    out.push({
      id: "month",
      label: "This month",
      title: periodTitle("month", date, settings),
      uid: null
    });
  }
  return out;
}
function movePin(pins, uid, delta) {
  if (!Array.isArray(pins) || !pins.length || typeof uid !== "string" || !uid || !Number.isFinite(delta)) {
    return pins;
  }
  const from = pins.findIndex((pin) => pin?.uid === uid);
  if (from < 0) return pins;
  const to = Math.max(0, Math.min(pins.length - 1, from + Math.trunc(delta)));
  if (to === from) return pins;
  const next = [...pins];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
function reorderPins(pins, uid, beforeUid) {
  if (!Array.isArray(pins) || !pins.length || typeof uid !== "string" || !uid) {
    return pins;
  }
  const from = pins.findIndex((pin) => pin?.uid === uid);
  if (from < 0) return pins;
  if (beforeUid == null) {
    if (from === pins.length - 1) return pins;
    const next2 = [...pins];
    const [moved2] = next2.splice(from, 1);
    next2.push(moved2);
    return next2;
  }
  if (typeof beforeUid !== "string" || !beforeUid || beforeUid === uid) return pins;
  const beforeIndex = pins.findIndex((pin) => pin?.uid === beforeUid);
  if (beforeIndex < 0 || from + 1 === beforeIndex) return pins;
  const next = [...pins];
  const [moved] = next.splice(from, 1);
  const insertAt = from < beforeIndex ? beforeIndex - 1 : beforeIndex;
  next.splice(insertAt, 0, moved);
  return next;
}

// src/view/features/pins.js
function isAltShortcut2(event, letter, code) {
  if (!event?.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (event.code === code) return true;
  return typeof event.key === "string" && event.key.toLowerCase() === letter;
}
function hasTodaySource(ctx) {
  const settingsApi = ctx?.extensionAPI?.settings;
  if (!settingsApi || typeof settingsApi.get !== "function") return true;
  if (settingsApi.canSet === false) return true;
  if (settingsApi.get(SETTING_IDS.pinToday) != null) return true;
  const scope = globalThis.window ?? globalThis;
  const roam = scope?.roamAlphaAPI ?? globalThis.roamAlphaAPI;
  return typeof roam?.util?.dateToPageUid === "function";
}
function createPins(ctx) {
  const hasDom = Boolean(
    ctx?.dom?.root && ctx?.dom?.pinRow && typeof ctx?.el === "function" && typeof ctx?.button === "function" && ctx?.lifecycle?.node && ctx?.lifecycle?.event
  );
  let confirming = null;
  let confirmJustOpened = false;
  let pickerJustOpened = false;
  let creatingPage = false;
  let midnightTimer = null;
  let drag = null;
  let suppressPinClick = false;
  let dropMarker = null;
  let picker = null;
  function resolvePeriodic(now = /* @__PURE__ */ new Date()) {
    const rawSettings = ctx?.state?.settings ?? {};
    const settings = rawSettings.pinToday === true && !hasTodaySource(ctx) ? { ...rawSettings, pinToday: false } : rawSettings;
    const daily = ctx?.host?.dailyPage?.(now) ?? null;
    const base = periodicPins({ settings, now, daily });
    return base.map((item) => {
      if (item.id === "today") {
        const entity = item.uid ? ctx?.host?.entity?.(item.uid) : null;
        return {
          id: item.id,
          label: item.label,
          title: entity?.title || item.title,
          uid: entity?.uid || item.uid || null,
          exists: Boolean(entity)
        };
      }
      const found = item.title ? ctx?.host?.pageByTitle?.(item.title) : null;
      return {
        id: item.id,
        label: item.label,
        title: found?.title || item.title,
        uid: found?.uid ?? null,
        exists: Boolean(found?.uid)
      };
    });
  }
  function lookupDestination(id, now = /* @__PURE__ */ new Date()) {
    const settings = ctx?.state?.settings ?? {};
    if (id === "today") {
      const daily = ctx?.host?.dailyPage?.(now) ?? null;
      const uid = daily?.uid ?? null;
      const title = daily?.title || uid || "";
      const entity = uid ? ctx?.host?.entity?.(uid) : null;
      return {
        id: "today",
        label: "Today",
        title: entity?.title || title,
        uid: entity?.uid || uid,
        explicitUid: uid || void 0,
        exists: Boolean(entity)
      };
    }
    if (id === "week" || id === "month") {
      const title = periodTitle(id, now, settings);
      const found = title ? ctx?.host?.pageByTitle?.(title) : null;
      return {
        id,
        label: id === "week" ? "This week" : "This month",
        title: found?.title || title,
        uid: found?.uid ?? null,
        explicitUid: void 0,
        exists: Boolean(found?.uid)
      };
    }
    return null;
  }
  function stopMidnightTimer() {
    if (midnightTimer != null && typeof ctx?.cancel === "function") {
      midnightTimer = ctx.cancel(midnightTimer);
    } else {
      midnightTimer = null;
    }
  }
  function armMidnightTimer() {
    stopMidnightTimer();
    if (!ctx?.state?.isOpen || typeof ctx?.later !== "function") return;
    const now = /* @__PURE__ */ new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2, 0);
    const delay = Math.max(1e3, nextMidnight.getTime() - now.getTime());
    midnightTimer = ctx.later(() => {
      midnightTimer = null;
      if (!ctx?.state?.isOpen) return;
      decoratePinRow();
      armMidnightTimer();
    }, delay);
  }
  async function confirmCreate(info, createBtn, cancelBtn) {
    if (creatingPage) return;
    creatingPage = true;
    createBtn.disabled = true;
    cancelBtn.disabled = true;
    try {
      const createdUid = info.explicitUid ? await ctx.host.createPage(info.title, info.explicitUid) : await ctx.host.createPage(info.title);
      confirming = null;
      const targetUid = createdUid || info.explicitUid || ctx?.host?.pageByTitle?.(info.title)?.uid;
      if (targetUid) {
        ctx?.focusUid?.(targetUid);
      } else {
        decoratePinRow();
      }
    } catch (error) {
      console.error("[compass] create periodic page", error);
      confirming = null;
      decoratePinRow();
    } finally {
      creatingPage = false;
    }
  }
  function cancelConfirm({ restoreFocus = false } = {}) {
    if (!confirming) return;
    const id = confirming.id;
    confirming = null;
    decoratePinRow();
    if (restoreFocus && ctx?.dom?.pinRow) {
      const restored = ctx.dom.pinRow.querySelector(`.compass-pin-periodic-btn[data-periodic-id="${id}"]`);
      restored?.focus?.({ preventScroll: true });
    }
  }
  function buildConfirmChip(info) {
    const wrap = ctx.el("span", "compass-pin-chip compass-pin-confirm");
    wrap.dataset.periodicId = info.id;
    const prompt = ctx.el("span", "compass-pin-confirm-text", `Create [[${info.title}]]?`);
    const createBtn = ctx.button("compass-pin-confirm-create", "Create");
    const cancelBtn = ctx.button("compass-pin-confirm-cancel", "Cancel");
    createBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void confirmCreate(info, createBtn, cancelBtn);
    });
    cancelBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      cancelConfirm({ restoreFocus: true });
    });
    wrap.append(prompt, createBtn, cancelBtn);
    return wrap;
  }
  function decoratePinRow(pinRow = ctx?.dom?.pinRow) {
    if (!pinRow || !hasDom) return;
    for (const old of pinRow.querySelectorAll(".compass-pin-periodic, .compass-pin-confirm")) {
      old.remove();
    }
    for (const chip of pinRow.querySelectorAll(".compass-pin-chip")) {
      const jump2 = chip.querySelector(".compass-pin-jump");
      const uid = jump2?.dataset?.uid;
      if (uid) {
        chip.classList.add("compass-pin-user");
        chip.dataset.pinUid = uid;
      }
    }
    const periodicList = resolvePeriodic(/* @__PURE__ */ new Date());
    const nodes = [];
    let renderedConfirm = false;
    for (const item of periodicList) {
      if (confirming && confirming.id === item.id) {
        renderedConfirm = true;
        nodes.push(buildConfirmChip(confirming));
        continue;
      }
      const chip = ctx.el("span", "compass-pin-chip compass-pin-periodic");
      chip.dataset.periodicId = item.id;
      chip.dataset.exists = item.exists ? "true" : "false";
      chip.title = item.title;
      if (item.exists && item.uid && item.uid === ctx?.state?.current) {
        chip.classList.add("compass-pin-active");
      }
      const btn = ctx.button("compass-pin-periodic-btn");
      btn.dataset.periodicId = item.id;
      btn.title = item.title;
      const cal = ctx.el("span", "compass-pin-cal");
      cal.setAttribute("aria-hidden", "true");
      const label = ctx.el("span", "compass-pin-periodic-label", item.label);
      btn.append(cal, label);
      chip.append(btn);
      nodes.push(chip);
    }
    if (confirming && !renderedConfirm) {
      nodes.unshift(buildConfirmChip(confirming));
    }
    if (nodes.length) pinRow.prepend(...nodes);
    pinRow.hidden = pinRow.childElementCount === 0;
  }
  function activatePeriodic(id) {
    const dest = lookupDestination(id, /* @__PURE__ */ new Date());
    if (!dest || !dest.title) return;
    if (dest.exists && dest.uid) {
      if (confirming) {
        confirming = null;
        decoratePinRow();
      }
      ctx?.focusUid?.(dest.uid);
      return;
    }
    confirming = {
      id: dest.id,
      title: dest.title,
      explicitUid: dest.explicitUid
    };
    confirmJustOpened = true;
    Promise.resolve().then(() => {
      confirmJustOpened = false;
    });
    decoratePinRow();
    const createBtn = ctx?.dom?.pinRow?.querySelector(".compass-pin-confirm-create");
    createBtn?.focus?.({ preventScroll: true });
  }
  function openUserPinMenu(uid, clientX, clientY) {
    const pins = ctx?.state?.settings?.pins ?? [];
    const index = pins.findIndex((pin) => pin.uid === uid);
    if (index < 0) return;
    ctx.hideFloating();
    if (index > 0) {
      ctx.menuItem("Move left", async () => {
        const currentPins = ctx?.state?.settings?.pins ?? [];
        const next = movePin(currentPins, uid, -1);
        if (next !== currentPins) await ctx.savePins(next);
      });
    }
    if (index < pins.length - 1) {
      ctx.menuItem("Move right", async () => {
        const currentPins = ctx?.state?.settings?.pins ?? [];
        const next = movePin(currentPins, uid, 1);
        if (next !== currentPins) await ctx.savePins(next);
      });
    }
    ctx.menuItem("Unpin", async () => {
      const currentPins = ctx?.state?.settings?.pins ?? [];
      await ctx.savePins(currentPins.filter((pin) => pin.uid !== uid));
    });
    ctx.placeFloating(ctx.dom.menu, clientX, clientY);
    ctx.dom.menu.querySelector("button")?.focus();
  }
  function clearDrag() {
    if (!drag) return;
    drag.chip?.classList?.remove("compass-pin-dragging");
    ctx?.dom?.pinRow?.classList?.remove("compass-pins-dragging");
    if (dropMarker) dropMarker.hidden = true;
    drag = null;
  }
  function computeDropTarget(clientX, clientY) {
    const chips = [...ctx?.dom?.pinRow?.querySelectorAll(".compass-pin-user") ?? []];
    if (!chips.length) return null;
    const measured = chips.map((chip, index) => ({
      chip,
      index,
      uid: chip.dataset.pinUid,
      rect: chip.getBoundingClientRect()
    }));
    let rowItems = measured.filter(({ rect }) => clientY >= rect.top - 8 && clientY <= rect.bottom + 8);
    if (!rowItems.length) {
      let bestDist = Infinity;
      let bestCenterY = 0;
      for (const item of measured) {
        const cy = (item.rect.top + item.rect.bottom) / 2;
        const dist = Math.abs(clientY - cy);
        if (dist < bestDist) {
          bestDist = dist;
          bestCenterY = cy;
        }
      }
      rowItems = measured.filter(
        ({ rect }) => Math.abs((rect.top + rect.bottom) / 2 - bestCenterY) <= rect.height / 2 + 4
      );
    }
    for (let i = 0; i < rowItems.length; i += 1) {
      const currentItem = rowItems[i];
      const midX = currentItem.rect.left + currentItem.rect.width / 2;
      if (clientX < midX) {
        const prevInRow = i > 0 ? rowItems[i - 1] : null;
        const markerX = prevInRow ? (prevInRow.rect.right + currentItem.rect.left) / 2 : currentItem.rect.left - 3;
        return {
          beforeUid: currentItem.uid,
          x: markerX,
          top: currentItem.rect.top,
          height: currentItem.rect.height
        };
      }
    }
    const lastInRow = rowItems[rowItems.length - 1];
    const nextOverall = measured[lastInRow.index + 1] ?? null;
    return {
      beforeUid: nextOverall ? nextOverall.uid : null,
      x: lastInRow.rect.right + 3,
      top: lastInRow.rect.top,
      height: lastInRow.rect.height
    };
  }
  function isPickerOpen() {
    return Boolean(picker && !picker.hidden);
  }
  function closePicker({ restoreFocus = false } = {}) {
    if (!picker || picker.hidden) return;
    picker.hidden = true;
    picker.replaceChildren();
    if (restoreFocus) {
      ctx?.dom?.stage?.focus?.({ preventScroll: true });
    }
  }
  function openPicker() {
    if (!picker || !hasDom) return;
    ctx?.hideFloating?.();
    ctx?.features?.get?.("trail")?.close?.();
    picker.replaceChildren();
    const periodicList = resolvePeriodic(/* @__PURE__ */ new Date());
    const userPins = ctx?.state?.settings?.pins ?? [];
    for (const item of periodicList) {
      const row = ctx.button("compass-pins-picker-item");
      row.dataset.periodicId = item.id;
      const label = ctx.el("span", "compass-pins-picker-label", item.label);
      const meta = ctx.el(
        "span",
        "compass-pins-picker-meta",
        item.exists ? item.title : `${item.title} (new)`
      );
      row.append(label, meta);
      picker.append(row);
    }
    for (const pin of userPins) {
      const row = ctx.button("compass-pins-picker-item");
      row.dataset.uid = pin.uid;
      const label = ctx.el("span", "compass-pins-picker-label", pin.title);
      row.append(label);
      picker.append(row);
    }
    if (!periodicList.length && !userPins.length) {
      picker.append(ctx.el("div", "compass-pins-picker-empty", "No pins yet"));
    }
    const anchorEl = !ctx.dom.pinRow.hidden ? ctx.dom.pinRow : ctx.dom.bar;
    const rect = anchorEl.getBoundingClientRect();
    ctx.placeFloating(picker, rect.left + 8, rect.bottom - 2);
    pickerJustOpened = true;
    Promise.resolve().then(() => {
      pickerJustOpened = false;
    });
    picker.querySelector(".compass-pins-picker-item")?.focus?.({ preventScroll: true });
  }
  function choosePickerRow(row) {
    if (!row) return;
    const periodicId = row.dataset.periodicId;
    const uid = row.dataset.uid;
    closePicker({ restoreFocus: false });
    if (periodicId) activatePeriodic(periodicId);
    else if (uid) ctx?.focusUid?.(uid);
  }
  if (hasDom) {
    dropMarker = ctx.el("div", "compass-pin-drop-marker");
    dropMarker.hidden = true;
    ctx.lifecycle.node(dropMarker, ctx.dom.root);
    picker = ctx.el("div", "compass-pins-picker");
    picker.hidden = true;
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-label", "Pins");
    ctx.lifecycle.node(picker, ctx.dom.root);
    ctx.lifecycle.event(ctx.dom.pinRow, "click", (event) => {
      if (suppressPinClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const periodicBtn = event.target.closest?.(".compass-pin-periodic-btn");
      if (periodicBtn?.dataset?.periodicId) {
        event.preventDefault();
        event.stopPropagation();
        activatePeriodic(periodicBtn.dataset.periodicId);
      }
    }, true);
    ctx.lifecycle.event(ctx.dom.pinRow, "contextmenu", (event) => {
      const userChip = event.target.closest?.(".compass-pin-user");
      if (!userChip?.dataset?.pinUid) return;
      event.preventDefault();
      event.stopPropagation();
      openUserPinMenu(userChip.dataset.pinUid, event.clientX, event.clientY);
    });
    ctx.lifecycle.event(ctx.dom.pinRow, "pointerdown", (event) => {
      if (event.button !== 0 || drag) return;
      if (event.target.closest?.(".compass-pin-remove, .compass-pin-periodic, .compass-pin-confirm")) {
        return;
      }
      const userChip = event.target.closest?.(".compass-pin-user");
      const uid = userChip?.dataset?.pinUid;
      if (!userChip || !uid) return;
      drag = {
        uid,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
        beforeUid: void 0,
        chip: userChip
      };
    });
    ctx.lifecycle.event(globalThis, "pointermove", (event) => {
      if (!drag) return;
      if (drag.pointerId != null && event.pointerId != null && event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.active) {
        if (Math.hypot(dx, dy) < 5) return;
        drag.active = true;
        drag.chip.classList.add("compass-pin-dragging");
        ctx.dom.pinRow.classList.add("compass-pins-dragging");
      }
      const target = computeDropTarget(event.clientX, event.clientY);
      if (!target) {
        dropMarker.hidden = true;
        drag.beforeUid = void 0;
        return;
      }
      drag.beforeUid = target.beforeUid;
      const rootRect = ctx.dom.root.getBoundingClientRect();
      dropMarker.style.left = `${Math.round(target.x - rootRect.left - 1)}px`;
      dropMarker.style.top = `${Math.round(target.top - rootRect.top)}px`;
      dropMarker.style.height = `${Math.round(target.height)}px`;
      dropMarker.hidden = false;
    });
    ctx.lifecycle.event(globalThis, "pointerup", (event) => {
      if (!drag) return;
      if (drag.pointerId != null && event.pointerId != null && event.pointerId !== drag.pointerId) return;
      const state = drag;
      clearDrag();
      if (!state.active) return;
      suppressPinClick = true;
      ctx.later?.(() => {
        suppressPinClick = false;
      }, 0);
      if (state.beforeUid === void 0) return;
      const currentPins = ctx?.state?.settings?.pins ?? [];
      const next = reorderPins(currentPins, state.uid, state.beforeUid);
      if (next !== currentPins) {
        void Promise.resolve(ctx.savePins(next)).catch((error) => console.error("[compass] pins", error));
      }
    });
    ctx.lifecycle.event(globalThis, "pointercancel", (event) => {
      if (!drag) return;
      if (drag.pointerId != null && event.pointerId != null && event.pointerId !== drag.pointerId) return;
      clearDrag();
    });
    ctx.lifecycle.event(picker, "click", (event) => {
      const row = event.target.closest?.(".compass-pins-picker-item");
      if (row) choosePickerRow(row);
    });
    ctx.lifecycle.event(picker, "keydown", (event) => {
      const items = [...picker.querySelectorAll(".compass-pins-picker-item")];
      const activeItem = event.target.closest?.(".compass-pins-picker-item");
      const activeIndex = activeItem ? items.indexOf(activeItem) : -1;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        if (!items.length) return;
        const nextIndex = activeIndex < 0 ? 0 : Math.min(items.length - 1, activeIndex + 1);
        items[nextIndex].focus({ preventScroll: true });
        items[nextIndex].scrollIntoView?.({ block: "nearest" });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        if (!items.length) return;
        const prevIndex = activeIndex < 0 ? 0 : Math.max(0, activeIndex - 1);
        items[prevIndex].focus({ preventScroll: true });
        items[prevIndex].scrollIntoView?.({ block: "nearest" });
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        event.stopPropagation();
        if (!items.length) return;
        items[0].focus({ preventScroll: true });
        items[0].scrollIntoView?.({ block: "nearest" });
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        event.stopPropagation();
        if (!items.length) return;
        items[items.length - 1].focus({ preventScroll: true });
        items[items.length - 1].scrollIntoView?.({ block: "nearest" });
        return;
      }
      if (event.key === "Enter" && activeItem) {
        event.preventDefault();
        event.stopPropagation();
        choosePickerRow(activeItem);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closePicker({ restoreFocus: true });
      }
    });
    const onOutside = (event) => {
      const target = event.target;
      if (confirming && !confirmJustOpened) {
        const confirmEl = ctx.dom.pinRow.querySelector(".compass-pin-confirm");
        if (!confirmEl || !confirmEl.contains(target)) {
          cancelConfirm({ restoreFocus: false });
        }
      }
      if (isPickerOpen() && !pickerJustOpened && !picker.contains(target)) {
        closePicker({ restoreFocus: false });
      }
    };
    const doc = globalThis.document ?? ctx.dom.root;
    ctx.lifecycle.event(doc, "pointerdown", onOutside);
    ctx.lifecycle.event(doc, "click", onOutside);
    ctx.lifecycle.event(ctx.dom.root, "focusin", (event) => {
      if (isPickerOpen() && !pickerJustOpened && !picker.contains(event.target)) {
        closePicker({ restoreFocus: false });
      }
    });
    ctx.lifecycle.add(() => {
      stopMidnightTimer();
      clearDrag();
    });
  }
  return {
    name: "pins",
    periodic() {
      return resolvePeriodic(/* @__PURE__ */ new Date());
    },
    openPicker,
    onOpen() {
      armMidnightTimer();
    },
    onClose() {
      stopMidnightTimer();
      clearDrag();
      confirming = null;
      closePicker({ restoreFocus: false });
    },
    onNavigate({ changed } = {}) {
      if (changed) {
        confirming = null;
        closePicker({ restoreFocus: false });
      }
    },
    afterPins({ pinRow } = {}) {
      decoratePinRow(pinRow);
      if (ctx?.state?.isOpen && midnightTimer == null) {
        armMidnightTimer();
      }
    },
    onEscape() {
      if (drag) {
        const wasActive = drag.active;
        clearDrag();
        if (wasActive) return true;
      }
      if (isPickerOpen()) {
        closePicker({ restoreFocus: true });
        return true;
      }
      if (confirming) {
        cancelConfirm({ restoreFocus: true });
        return true;
      }
      return false;
    },
    onKey(event) {
      if (isAltShortcut2(event, "b", "KeyB")) {
        if (isPickerOpen()) closePicker({ restoreFocus: true });
        else openPicker();
        return true;
      }
      if (event?.key === "ContextMenu" || event?.shiftKey && event?.key === "F10") {
        const userChip = event.target?.closest?.(".compass-pin-user");
        if (userChip?.dataset?.pinUid) {
          const rect = userChip.getBoundingClientRect();
          openUserPinMenu(userChip.dataset.pinUid, rect.left + 8, rect.bottom);
          return true;
        }
      }
      return false;
    },
    commands() {
      const settings = ctx?.state?.settings ?? {};
      const out = [
        { id: "pins-open", title: "Open pins", hint: "Alt+B", run: () => openPicker() },
        { id: "pin-today", title: "Go to Today", hint: "", run: () => activatePeriodic("today") }
      ];
      if (settings.pinWeek === true) {
        out.push({ id: "pin-week", title: "Go to This week", hint: "", run: () => activatePeriodic("week") });
      }
      if (settings.pinMonth === true) {
        out.push({ id: "pin-month", title: "Go to This month", hint: "", run: () => activatePeriodic("month") });
      }
      return out;
    }
  };
}

// src/view/features/views.js
function readPreset(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "roles";
}
function createViews(ctx) {
  let view = normalizeView(ctx?.state?.settings?.view);
  let preset = readPreset(ctx?.state?.settings?.facetsPreset);
  let saving = 0;
  function current() {
    return { view, preset };
  }
  function onSettings(settings) {
    if (!settings || saving > 0) return;
    view = normalizeView(settings.view);
    preset = readPreset(settings.facetsPreset);
  }
  async function set(nextView, nextPreset) {
    if (!isValidView(nextView)) return;
    const hasPreset = typeof nextPreset === "string" && nextPreset.trim() !== "";
    const targetPreset = hasPreset ? nextPreset.trim() : null;
    view = nextView;
    if (hasPreset) preset = targetPreset;
    saving += 1;
    try {
      await ctx?.saveSetting?.(SETTING_IDS.view, nextView);
      if (hasPreset) await ctx?.saveSetting?.(SETTING_IDS.facetsPreset, targetPreset);
      ctx?.rebuild?.();
      ctx?.render?.();
      ctx?.fit?.(true);
    } catch (error) {
      console.error("[compass] views", error);
    } finally {
      saving -= 1;
    }
  }
  function commands() {
    return viewEntries(view, (next) => set(next)).map(({ id, title, run }) => ({
      id,
      title,
      hint: "",
      run
    }));
  }
  function stageMenu() {
    return viewEntries(view, (next) => set(next)).map(({ menuTitle, run }) => ({
      title: menuTitle,
      run
    }));
  }
  return { name: "views", current, set, onSettings, commands, stageMenu };
}

// src/model/mindmap.js
var DEFAULT_NODE = Object.freeze({ w: 180, h: 34 });
var DEFAULT_ROOT = Object.freeze({ w: 240, h: 56 });
var MORE_SIZE = Object.freeze({ w: 104, h: 26 });
var PARENT_COLUMNS = 3;
var BALANCED_PEER_CAP = 4;
var COL_GAP2 = 14;
function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}
function cleanNodes(list) {
  if (!Array.isArray(list)) return [];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const item of list) {
    if (!item || typeof item.uid !== "string" || !item.uid || seen.has(item.uid)) continue;
    seen.add(item.uid);
    out.push(item);
  }
  return out;
}
function normalizeState(state) {
  return {
    folded: state?.folded instanceof Set ? state.folded : /* @__PURE__ */ new Set(),
    opened: state?.opened instanceof Set ? state.opened : /* @__PURE__ */ new Set(),
    limits: state?.limits instanceof Map ? state.limits : /* @__PURE__ */ new Map()
  };
}
function cloneState(state) {
  const norm = normalizeState(state);
  return {
    folded: new Set(norm.folded),
    opened: new Set(norm.opened),
    limits: new Map(norm.limits)
  };
}
function positiveInt(value, fallback, min = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.trunc(num));
}
function readLimit(limits, key, fallback) {
  const custom = limits.get(key);
  if (typeof custom === "number" && Number.isFinite(custom) && custom >= 0) return Math.trunc(custom);
  return fallback;
}
function buildTree({
  root,
  children = [],
  parents = [],
  peers = [],
  childrenOf,
  state,
  generations = 2,
  maxChildren = 12,
  maxNodes = 300
} = {}) {
  const rootUid = typeof root?.uid === "string" ? root.uid : "";
  const rootNode = {
    ...root,
    uid: rootUid,
    title: typeof root?.title === "string" && root.title ? root.title : rootUid,
    kind: root?.kind === "block" ? "block" : "page"
  };
  const normState = normalizeState(state);
  const genLimit = positiveInt(generations, 2, 1);
  const childCap = positiveInt(maxChildren, 12, 0);
  const nodeCap = positiveInt(maxNodes, 300, 1);
  const fetchChildren = typeof childrenOf === "function" ? childrenOf : () => [];
  const rootOcc = {
    key: rootUid,
    uid: rootUid,
    node: rootNode,
    depth: 0,
    parentKey: null,
    status: "open",
    children: [],
    childCount: 0,
    hidden: 0
  };
  const expandedUids = /* @__PURE__ */ new Set();
  const queue = [{ occ: rootOcc, ancestors: /* @__PURE__ */ new Set() }];
  let count2 = 1;
  let truncated = false;
  for (let qIndex = 0; qIndex < queue.length; qIndex += 1) {
    const { occ, ancestors } = queue[qIndex];
    if (occ.depth > 0 && (ancestors.has(occ.uid) || expandedUids.has(occ.uid))) {
      occ.status = "repeat";
      occ.childCount = null;
      occ.children = [];
      occ.hidden = 0;
      continue;
    }
    const shouldOpen = occ.depth === 0 || (occ.depth < genLimit ? !normState.folded.has(occ.key) : normState.opened.has(occ.key));
    if (!shouldOpen) {
      occ.status = "folded";
      occ.childCount = null;
      occ.children = [];
      occ.hidden = 0;
      continue;
    }
    if (occ.depth > 0 && truncated && count2 >= nodeCap) {
      occ.status = "folded";
      occ.childCount = null;
      occ.children = [];
      occ.hidden = 0;
      continue;
    }
    const kids = cleanNodes(occ.depth === 0 ? children : fetchChildren(occ.uid));
    occ.childCount = kids.length;
    if (occ.depth > 0 && kids.length === 0) {
      expandedUids.add(occ.uid);
      occ.status = "leaf";
      occ.children = [];
      occ.hidden = 0;
      continue;
    }
    const limit = readLimit(normState.limits, occ.key, childCap);
    const wanted = kids.slice(0, limit);
    const budget = Math.max(0, nodeCap - count2);
    if (wanted.length > budget) truncated = true;
    const shown = wanted.slice(0, budget);
    if (occ.depth > 0 && shown.length === 0 && kids.length > 0) {
      occ.status = "folded";
      occ.children = [];
      occ.hidden = 0;
      continue;
    }
    expandedUids.add(occ.uid);
    occ.status = "open";
    occ.hidden = kids.length - shown.length;
    const nextAncestors = new Set(ancestors);
    if (occ.uid) nextAncestors.add(occ.uid);
    for (const childNode of shown) {
      const childOcc = {
        key: occ.key ? `${occ.key}/${childNode.uid}` : childNode.uid,
        uid: childNode.uid,
        node: childNode,
        depth: occ.depth + 1,
        parentKey: occ.key,
        status: "folded",
        children: [],
        childCount: null,
        hidden: 0
      };
      occ.children.push(childOcc);
      count2 += 1;
      queue.push({ occ: childOcc, ancestors: nextAncestors });
    }
  }
  return {
    root: rootOcc,
    parents: cleanNodes(parents),
    peers: cleanNodes(peers),
    count: count2,
    truncated
  };
}
function measureSlot(slot, nodeSize, moreSize, vGap) {
  if (slot.kind === "more") {
    return { slot, ownH: moreSize.h, blockH: moreSize.h, childMeasures: [], childrenH: 0 };
  }
  const occ = slot.occ;
  const childSlots = occ.children.map((child) => ({ kind: "node", occ: child }));
  if (occ.hidden > 0) {
    childSlots.push({
      kind: "more",
      key: `${occ.key}#more`,
      uid: occ.uid,
      parentKey: occ.key,
      depth: occ.depth + 1,
      hidden: occ.hidden
    });
  }
  const childMeasures = childSlots.map((child) => measureSlot(child, nodeSize, moreSize, vGap));
  const childrenH = childMeasures.length ? childMeasures.reduce((sum, m) => sum + m.blockH, 0) + (childMeasures.length - 1) * vGap : 0;
  const blockH = Math.max(nodeSize.h, childrenH);
  return { slot, ownH: nodeSize.h, blockH, childMeasures, childrenH };
}
function placeSide({
  rootKey,
  rootSize,
  nodeSize,
  moreSize,
  hGap,
  vGap,
  side,
  childOccurrences,
  extraMore,
  items,
  links
}) {
  const sign = side === "left" ? -1 : 1;
  const topSlots = childOccurrences.map((occ) => ({ kind: "node", occ }));
  if (extraMore > 0) {
    topSlots.push({
      kind: "more",
      key: `${rootKey}#more`,
      uid: rootKey,
      parentKey: rootKey,
      depth: 1,
      hidden: extraMore
    });
  }
  if (!topSlots.length) return;
  const measures = topSlots.map((slot) => measureSlot(slot, nodeSize, moreSize, vGap));
  const totalH = measures.reduce((sum, m) => sum + m.blockH, 0) + (measures.length - 1) * vGap;
  function emit(measure, blockTop, parentBox, parentKey) {
    const { slot, blockH, childMeasures, childrenH } = measure;
    const depth = slot.kind === "more" ? slot.depth : slot.occ.depth;
    const innerEdge = rootSize.w / 2 + depth * hGap + (depth - 1) * nodeSize.w;
    if (slot.kind === "more") {
      const w2 = Math.min(moreSize.w, nodeSize.w);
      const h2 = Math.min(moreSize.h, nodeSize.h);
      const x2 = sign * (innerEdge + w2 / 2);
      const y2 = blockTop + blockH / 2;
      const item2 = {
        key: slot.key,
        uid: slot.uid,
        parentKey: slot.parentKey,
        hidden: slot.hidden,
        kind: "more",
        zone: "south",
        x: x2,
        y: y2,
        w: w2,
        h: h2,
        depth,
        status: "more",
        side
      };
      items.push(item2);
      links.push({
        fromKey: parentKey,
        toKey: item2.key,
        from: { x: parentBox.x + sign * (parentBox.w / 2), y: parentBox.y },
        to: { x: item2.x - sign * (item2.w / 2), y: item2.y },
        side
      });
      return;
    }
    const occ = slot.occ;
    const w = nodeSize.w;
    const h = nodeSize.h;
    const x = sign * (innerEdge + w / 2);
    const y = blockTop + blockH / 2;
    const item = {
      key: occ.key,
      uid: occ.uid,
      kind: "node",
      zone: "south",
      x,
      y,
      w,
      h,
      depth: occ.depth,
      status: occ.status,
      side
    };
    items.push(item);
    links.push({
      fromKey: parentKey,
      toKey: item.key,
      from: { x: parentBox.x + sign * (parentBox.w / 2), y: parentBox.y },
      to: { x: item.x - sign * (item.w / 2), y: item.y },
      side
    });
    if (!childMeasures.length) return;
    let cursor2 = childrenH < blockH ? y - childrenH / 2 : blockTop;
    for (const childMeasure of childMeasures) {
      emit(childMeasure, cursor2, item, occ.key);
      cursor2 += childMeasure.blockH + vGap;
    }
  }
  const rootBox = { x: 0, y: 0, w: rootSize.w, h: rootSize.h };
  let cursor = -totalH / 2;
  for (const measure of measures) {
    emit(measure, cursor, rootBox, rootKey);
    cursor += measure.blockH + vGap;
  }
}
function boxesOverlap(a, b, padX = 0, padY = 0) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w + padX * 2 && Math.abs(a.y - b.y) * 2 < a.h + b.h + padY * 2;
}
function rowWidth(count2, itemW, gap) {
  return count2 > 0 ? count2 * itemW + (count2 - 1) * gap : 0;
}
function peerZone(peer) {
  if (peer?.zone === "east" || peer?.role === "challenger" || peer?.role === "next") return "east";
  return "west";
}
function layoutTree(tree, options = {}) {
  const direction = options.direction === "left" || options.direction === "balanced" ? options.direction : "right";
  const nodeSize = {
    w: positiveInt(options.node?.w, DEFAULT_NODE.w, 20),
    h: positiveInt(options.node?.h, DEFAULT_NODE.h, 16)
  };
  const rootSize = {
    w: positiveInt(options.root?.w, DEFAULT_ROOT.w, 40),
    h: positiveInt(options.root?.h, DEFAULT_ROOT.h, 24)
  };
  const hGap = positiveInt(options.hGap, 56, 8);
  const vGap = positiveInt(options.vGap, 10, 2);
  const moreSize = {
    w: Math.min(MORE_SIZE.w, nodeSize.w),
    h: Math.min(MORE_SIZE.h, nodeSize.h)
  };
  const center = { x: 0, y: 0, w: rootSize.w, h: rootSize.h };
  const items = [];
  const links = [];
  const rootOcc = tree?.root;
  const rootKey = rootOcc?.key ?? "";
  const rootChildren = Array.isArray(rootOcc?.children) ? rootOcc.children : [];
  const rootHidden = positiveInt(rootOcc?.hidden, 0, 0);
  if (direction === "balanced") {
    const split = Math.ceil(rootChildren.length / 2);
    const rightChildren = rootChildren.slice(0, split);
    const leftChildren = rootChildren.slice(split);
    const rightMore = leftChildren.length === 0 ? rootHidden : 0;
    const leftMore = leftChildren.length > 0 ? rootHidden : 0;
    placeSide({
      rootKey,
      rootSize,
      nodeSize,
      moreSize,
      hGap,
      vGap,
      side: "right",
      childOccurrences: rightChildren,
      extraMore: rightMore,
      items,
      links
    });
    placeSide({
      rootKey,
      rootSize,
      nodeSize,
      moreSize,
      hGap,
      vGap,
      side: "left",
      childOccurrences: leftChildren,
      extraMore: leftMore,
      items,
      links
    });
  } else {
    placeSide({
      rootKey,
      rootSize,
      nodeSize,
      moreSize,
      hGap,
      vGap,
      side: direction,
      childOccurrences: rootChildren,
      extraMore: rootHidden,
      items,
      links
    });
  }
  const peers = Array.isArray(tree?.peers) ? tree.peers : [];
  let peersOmitted = 0;
  if (peers.length > 0) {
    if (direction === "balanced") {
      const peerGap = Math.max(36, vGap * 3);
      if (peers.length <= BALANCED_PEER_CAP) {
        const width = rowWidth(peers.length, nodeSize.w, COL_GAP2);
        const y = -(rootSize.h / 2 + peerGap + nodeSize.h / 2);
        const candidates = peers.map((peer, index) => ({
          key: `peer:${peer.uid}`,
          uid: peer.uid,
          kind: "node",
          zone: peerZone(peer),
          x: -width / 2 + index * (nodeSize.w + COL_GAP2) + nodeSize.w / 2,
          y,
          w: nodeSize.w,
          h: nodeSize.h,
          depth: 1,
          status: "leaf",
          side: "north"
        }));
        const existing = [center, ...items];
        const collides = candidates.some((cand) => existing.some((box) => boxesOverlap(cand, box, COL_GAP2 / 2, vGap)));
        if (!collides) {
          for (const item of candidates) {
            items.push(item);
            links.push({
              fromKey: rootKey,
              toKey: item.key,
              from: { x: clamp(item.x, -rootSize.w / 2 + 16, rootSize.w / 2 - 16), y: -rootSize.h / 2 },
              to: { x: item.x, y: item.y + item.h / 2 },
              side: "north"
            });
          }
        } else {
          peersOmitted = peers.length;
        }
      } else {
        peersOmitted = peers.length;
      }
    } else {
      const peerSide = direction === "right" ? "left" : "right";
      const sign = peerSide === "left" ? -1 : 1;
      const peerX = sign * (rootSize.w / 2 + hGap + nodeSize.w / 2);
      const totalH = peers.length * nodeSize.h + (peers.length - 1) * vGap;
      peers.forEach((peer, index) => {
        const y = -totalH / 2 + nodeSize.h / 2 + index * (nodeSize.h + vGap);
        const item = {
          key: `peer:${peer.uid}`,
          uid: peer.uid,
          kind: "node",
          zone: peerZone(peer),
          x: peerX,
          y,
          w: nodeSize.w,
          h: nodeSize.h,
          depth: 1,
          status: "leaf",
          side: peerSide
        };
        items.push(item);
        links.push({
          fromKey: rootKey,
          toKey: item.key,
          from: {
            x: sign * (rootSize.w / 2),
            y: clamp(item.y, -rootSize.h / 2 + 12, rootSize.h / 2 - 12)
          },
          to: {
            x: item.x - sign * (item.w / 2),
            y: item.y
          },
          side: peerSide
        });
      });
    }
  }
  const parents = Array.isArray(tree?.parents) ? tree.parents : [];
  if (parents.length > 0) {
    const usedCols = Math.min(PARENT_COLUMNS, parents.length);
    const maxHalfW = rowWidth(usedCols, nodeSize.w, COL_GAP2) / 2;
    let bandMinY = -rootSize.h / 2;
    for (const existing of items) {
      if (Math.abs(existing.x) - existing.w / 2 <= maxHalfW + COL_GAP2) {
        bandMinY = Math.min(bandMinY, existing.y - existing.h / 2);
      }
    }
    const parentGap = Math.max(40, vGap * 3.5);
    const rowStep = nodeSize.h + Math.max(12, vGap);
    const totalRows = Math.ceil(parents.length / PARENT_COLUMNS);
    parents.forEach((parent, index) => {
      const row = Math.floor(index / PARENT_COLUMNS);
      const col = index % PARENT_COLUMNS;
      const inRow = row === totalRows - 1 ? parents.length - row * PARENT_COLUMNS : PARENT_COLUMNS;
      const width = rowWidth(inRow, nodeSize.w, COL_GAP2);
      const x = -width / 2 + col * (nodeSize.w + COL_GAP2) + nodeSize.w / 2;
      const y = bandMinY - parentGap - nodeSize.h / 2 - row * rowStep;
      const item = {
        key: `parent:${parent.uid}`,
        uid: parent.uid,
        kind: "node",
        zone: "north",
        x,
        y,
        w: nodeSize.w,
        h: nodeSize.h,
        depth: 1,
        status: "leaf",
        side: "north"
      };
      items.push(item);
      const toX = clamp(item.x * 0.72, item.x - item.w / 2 + 24, item.x + item.w / 2 - 24);
      links.push({
        fromKey: rootKey,
        toKey: item.key,
        from: { x: clamp(toX, -rootSize.w / 2 + 16, rootSize.w / 2 - 16), y: -rootSize.h / 2 },
        to: { x: toX, y: item.y + item.h / 2 },
        side: "north"
      });
    });
  }
  let minX = -center.w / 2;
  let maxX = center.w / 2;
  let minY = -center.h / 2;
  let maxY = center.h / 2;
  for (const item of items) {
    minX = Math.min(minX, item.x - item.w / 2);
    maxX = Math.max(maxX, item.x + item.w / 2);
    minY = Math.min(minY, item.y - item.h / 2);
    maxY = Math.max(maxY, item.y + item.h / 2);
  }
  return {
    center,
    items,
    links,
    bounds: { minX, minY, maxX, maxY },
    peersOmitted
  };
}
function toggleFold(state, occurrence, generations = 2) {
  const next = cloneState(state);
  if (!occurrence || typeof occurrence.key !== "string" || !occurrence.key) return next;
  const depth = Number(occurrence.depth);
  if (!Number.isFinite(depth) || depth <= 0) return next;
  if (occurrence.status === "repeat" || occurrence.status === "leaf") return next;
  const genLimit = positiveInt(generations, 2, 1);
  const key = occurrence.key;
  const isOpen = occurrence.status === "open" ? true : occurrence.status === "folded" ? false : depth < genLimit ? !next.folded.has(key) : next.opened.has(key);
  if (isOpen) {
    next.opened.delete(key);
    if (depth < genLimit) next.folded.add(key);
    else next.folded.delete(key);
  } else {
    next.folded.delete(key);
    if (depth >= genLimit) next.opened.add(key);
    else next.opened.delete(key);
  }
  return next;
}
function collectOccurrences(root) {
  const out = [];
  if (!root) return out;
  const stack = [root];
  while (stack.length > 0) {
    const cur = stack.pop();
    out.push(cur);
    const kids = Array.isArray(cur.children) ? cur.children : [];
    for (let i = kids.length - 1; i >= 0; i -= 1) {
      if (kids[i]) stack.push(kids[i]);
    }
  }
  return out;
}
function expandGeneration(tree, state) {
  const next = cloneState(state);
  const all = collectOccurrences(tree?.root);
  const folded = all.filter((occ) => occ.depth > 0 && occ.status === "folded");
  if (!folded.length) return next;
  const minDepth = Math.min(...folded.map((occ) => occ.depth));
  for (const occ of folded) {
    if (occ.depth !== minDepth) continue;
    const wasInFolded = next.folded.delete(occ.key);
    if (!wasInFolded) next.opened.add(occ.key);
  }
  return next;
}
function collapseGeneration(tree, state) {
  const next = cloneState(state);
  const all = collectOccurrences(tree?.root);
  const open = all.filter((occ) => occ.depth > 0 && occ.status === "open");
  if (!open.length) return next;
  const maxDepth = Math.max(...open.map((occ) => occ.depth));
  for (const occ of open) {
    if (occ.depth !== maxDepth) continue;
    const wasInOpened = next.opened.delete(occ.key);
    if (!wasInOpened) next.folded.add(occ.key);
  }
  return next;
}
function outlineItemFromOccurrence(occ) {
  const node = occ?.node;
  const uid = occ?.uid ?? node?.uid ?? "";
  return {
    uid,
    title: typeof node?.title === "string" && node.title ? node.title : uid,
    kind: node?.kind === "block" ? "block" : "page",
    label: typeof node?.label === "string" ? node.label : "",
    status: occ?.status ?? "leaf",
    children: Array.isArray(occ?.children) ? occ.children.map(outlineItemFromOccurrence) : []
  };
}
function outlineItemFromParent(parent) {
  const uid = typeof parent?.uid === "string" ? parent.uid : "";
  return {
    uid,
    title: typeof parent?.title === "string" && parent.title ? parent.title : uid,
    kind: parent?.kind === "block" ? "block" : "page",
    label: typeof parent?.label === "string" ? parent.label : "",
    status: "leaf",
    children: []
  };
}
function treeOutline(tree) {
  if (!tree?.root) return null;
  return {
    root: outlineItemFromOccurrence(tree.root),
    parents: Array.isArray(tree.parents) ? tree.parents.map(outlineItemFromParent) : []
  };
}

// src/view/features/mindmap.js
var EXPANDED_SOUTH = /* @__PURE__ */ new Set(["south"]);
function emptyState() {
  return { folded: /* @__PURE__ */ new Set(), opened: /* @__PURE__ */ new Set(), limits: /* @__PURE__ */ new Map() };
}
function findOccurrence(root, key) {
  if (!root || !key) return null;
  if (root.key === key) return root;
  const stack = [...root.children ?? []];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur) continue;
    if (cur.key === key) return cur;
    for (const kid of cur.children ?? []) stack.push(kid);
  }
  return null;
}
function placeElement(element, box) {
  element.style.width = `${box.w}px`;
  element.style.height = `${box.h}px`;
  element.style.transform = `translate(${box.x - box.w / 2}px, ${box.y - box.h / 2}px)`;
}
function chevronPath(status, side) {
  if (status === "open") return "M2.2 3.6 L5 6.6 L7.8 3.6";
  return side === "left" ? "M6.3 2.2 L3.3 5 L6.3 7.8" : "M3.7 2.2 L6.7 5 L3.7 7.8";
}
function buildChevron(ctx, status, side, count2, label) {
  const btn = ctx.button("compass-mm-chevron", "", label);
  btn.textContent = "";
  const icon = ctx.svg("svg", "compass-mm-chevron-icon");
  icon.setAttribute("viewBox", "0 0 10 10");
  icon.setAttribute("width", "10");
  icon.setAttribute("height", "10");
  icon.setAttribute("aria-hidden", "true");
  const path = ctx.svg("path", "compass-mm-chevron-stroke");
  path.setAttribute("d", chevronPath(status, side));
  icon.append(path);
  const hasCount = typeof count2 === "number" && Number.isFinite(count2) && count2 > 0;
  if (hasCount) {
    const num = ctx.el("span", "compass-mm-count", String(count2));
    if (side === "left") btn.append(num, icon);
    else btn.append(icon, num);
  } else {
    btn.append(icon);
  }
  return btn;
}
function plexusApi() {
  const api = globalThis.window?.RoamPlexus;
  return api && api.apiVersion >= 1 ? api : null;
}
function createMindMap(ctx) {
  if (!ctx) {
    return {
      name: "mindmap",
      tree: () => null,
      outline: () => null
    };
  }
  const childCache = /* @__PURE__ */ new Map();
  const stateByRoot = /* @__PURE__ */ new Map();
  const itemEls = /* @__PURE__ */ new Map();
  let layer = null;
  let edgesEl = null;
  let emptyEl = null;
  let lastTree = null;
  let lastDirection = null;
  let pendingFit = false;
  let lastNoticeKey = "";
  if (ctx.dom?.world) {
    layer = ctx.el("div", "compass-mindmap");
    layer.hidden = true;
    edgesEl = ctx.svg("svg", "compass-edges compass-mm-edges");
    edgesEl.setAttribute("width", "1");
    edgesEl.setAttribute("height", "1");
    emptyEl = ctx.el("p", "compass-mm-empty", "Nothing branches from here yet.");
    emptyEl.hidden = true;
    layer.append(edgesEl, emptyEl);
    ctx.lifecycle.node(layer, ctx.dom.world);
  }
  function isActive() {
    const views = ctx.features?.get?.("views");
    if (views?.current) return views.current()?.view === "mindmap";
    return ctx.state?.settings?.view === "mindmap";
  }
  function stateFor(rootUid) {
    if (!stateByRoot.has(rootUid)) stateByRoot.set(rootUid, emptyState());
    return stateByRoot.get(rootUid);
  }
  function currentGenerations(settings = ctx.state?.settings) {
    const raw = Number(settings?.mindmapGenerations);
    if (!Number.isFinite(raw)) return 2;
    return Math.min(5, Math.max(1, Math.trunc(raw)));
  }
  function currentDirection(settings = ctx.state?.settings) {
    const dir = settings?.mindmapDirection;
    return dir === "left" || dir === "balanced" ? dir : "right";
  }
  function childrenOf(uid, modelSettings2) {
    if (childCache.has(uid)) return childCache.get(uid);
    let kids = [];
    try {
      const snap = ctx.host.snapshot(uid, modelSettings2);
      if (snap && !snap.missing) {
        const sub = buildNeighborhood(snap, modelSettings2, {
          expanded: EXPANDED_SOUTH,
          regionLabel: plexusRegionLabels(plexusApi())
        });
        kids = sub.nodes.filter((node) => node.zone === "south");
      }
    } catch (error) {
      console.error("[compass] mindmap", error);
    }
    childCache.set(uid, kids);
    return kids;
  }
  function clearLayer() {
    for (const element of itemEls.values()) element.remove();
    itemEls.clear();
    if (edgesEl) edgesEl.replaceChildren();
    if (emptyEl) emptyEl.hidden = true;
    if (layer) layer.hidden = true;
    lastTree = null;
    lastDirection = null;
    pendingFit = false;
    lastNoticeKey = "";
  }
  function onSettings() {
    childCache.clear();
  }
  function clearView() {
    clearLayer();
  }
  function onClose() {
    childCache.clear();
    clearLayer();
  }
  function renderRootNode(center, box) {
    const key = center.uid;
    let element = itemEls.get(key);
    if (!element) {
      element = ctx.el("div");
      element.tabIndex = 0;
      element.setAttribute("role", "button");
      layer.append(element);
      itemEls.set(key, element);
    }
    element.className = "compass-node compass-node-center";
    element.dataset.uid = center.uid;
    element.dataset.key = key;
    element.dataset.zone = "center";
    element.dataset.kind = center.kind || "page";
    element.dataset.style = "center";
    element.title = center.title;
    element.setAttribute("aria-label", `Center: ${center.title}`);
    const sig = `center|${center.kind}|${center.title}`;
    if (element._mmSig !== sig) {
      element._mmSig = sig;
      const head = ctx.el("div", "compass-center-head");
      const kind = ctx.el("span", "compass-kind", center.kind === "block" ? "Block" : "Page");
      const title = ctx.el("span", "compass-node-title", center.title);
      head.append(kind, title);
      element.replaceChildren(head);
    }
    placeElement(element, box);
  }
  function renderItemNode(item, node, occ, isFaded) {
    let element = itemEls.get(item.key);
    if (!element) {
      element = ctx.el("div");
      element.tabIndex = 0;
      element.setAttribute("role", "button");
      layer.append(element);
      itemEls.set(item.key, element);
    }
    const isRepeat = item.status === "repeat";
    const classes = ["compass-node"];
    if (isRepeat) classes.push("compass-mm-repeat");
    if (isFaded) classes.push("compass-fade");
    element.className = classes.join(" ");
    const fullTitle = typeof node?.title === "string" && node.title ? node.title : item.uid;
    const visibleTitle = typeof node?.alias === "string" && node.alias ? node.alias : fullTitle;
    const relLabel = typeof node?.label === "string" && node.label ? node.label : "";
    const nodeKind = node?.kind === "block" ? "block" : "page";
    const nodeStyle = typeof node?.style === "string" && node.style ? node.style : "typed";
    element.dataset.uid = item.uid;
    element.dataset.key = item.key;
    element.dataset.zone = item.zone;
    element.dataset.kind = nodeKind;
    element.dataset.style = nodeStyle;
    element.dataset.status = item.status;
    element.dataset.side = item.side;
    if (isRepeat) {
      element.title = "Shown elsewhere in this map";
      element.setAttribute("aria-label", `${fullTitle} — Shown elsewhere in this map`);
    } else {
      const why = relLabel ? ` — ${relLabel}` : "";
      element.title = `${fullTitle}${why}`;
      element.setAttribute("aria-label", `${fullTitle}${why}`);
    }
    const isTreeBranch = Boolean(occ) && (item.status === "open" || item.status === "folded");
    const cachedKids = childCache.get(item.uid);
    const knownCount = occ?.childCount != null ? occ.childCount : Array.isArray(cachedKids) ? cachedKids.length : null;
    const sig = `${visibleTitle}|${item.status}|${item.side}|${isTreeBranch ? 1 : 0}|${knownCount ?? ""}`;
    if (element._mmSig !== sig) {
      element._mmSig = sig;
      const titleSpan = ctx.el("span", "compass-node-title", visibleTitle);
      if (isTreeBranch) {
        const expanded = item.status === "open";
        const label = expanded ? `Fold ${fullTitle}` : `Expand ${fullTitle}`;
        const chev = buildChevron(ctx, item.status, item.side, knownCount, label);
        chev.tabIndex = -1;
        chev.dataset.key = item.key;
        chev.setAttribute("aria-expanded", expanded ? "true" : "false");
        if (item.side === "left") element.replaceChildren(chev, titleSpan);
        else element.replaceChildren(titleSpan, chev);
      } else if (isRepeat) {
        const mark = ctx.el("span", "compass-mm-repeat-mark", "↺");
        mark.setAttribute("aria-hidden", "true");
        if (item.side === "left") element.replaceChildren(mark, titleSpan);
        else element.replaceChildren(titleSpan, mark);
      } else {
        element.replaceChildren(titleSpan);
      }
    }
    placeElement(element, item);
  }
  function renderMoreItem(item) {
    let element = itemEls.get(item.key);
    if (!element) {
      element = ctx.button("compass-mm-more", "", "Show more children");
      layer.append(element);
      itemEls.set(item.key, element);
    }
    element.className = "compass-mm-more";
    element.dataset.key = item.key;
    element.dataset.parentKey = item.parentKey ?? "";
    const text = `+${item.hidden} more`;
    if (element.textContent !== text) element.textContent = text;
    placeElement(element, item);
  }
  function computeHiddenSet(drawnNodes, hood) {
    const base = hiddenUids(drawnNodes, ctx.state?.lens);
    const piped = ctx.features?.pipe ? ctx.features.pipe("hiddenUids", base, hood) : base;
    const set = new Set(Array.isArray(piped) ? piped : base);
    const fromLenses = ctx.features?.get?.("lenses")?.hiddenFor?.(drawnNodes);
    if (fromLenses && typeof fromLenses[Symbol.iterator] === "function") {
      for (const uid of fromLenses) set.add(uid);
    }
    return set;
  }
  function renderView({ hood, settings, navigate }) {
    if (!isActive() || !hood?.center || !layer) return null;
    layer.hidden = false;
    const rootUid = hood.center.uid;
    const generations = currentGenerations(settings);
    const direction = currentDirection(settings);
    if (!navigate && lastDirection !== null && lastDirection !== direction) {
      pendingFit = true;
    }
    lastDirection = direction;
    let children = hood.nodes.filter((node) => node.zone === "south");
    if (hood.overflow?.south && ctx.state?.snapshot) {
      let fullHood = buildNeighborhood(ctx.state.snapshot, settings?.model, {
        expanded: EXPANDED_SOUTH,
        regionLabel: plexusRegionLabels(plexusApi())
      });
      if (ctx.features?.pipe) fullHood = ctx.features.pipe("transformHood", fullHood);
      children = fullHood.nodes.filter((node) => node.zone === "south");
    }
    const parents = hood.nodes.filter((node) => node.zone === "north");
    const peers = hood.nodes.filter((node) => node.zone === "west" || node.zone === "east");
    const built = buildTree({
      root: hood.center,
      children,
      parents,
      peers,
      childrenOf: (uid) => childrenOf(uid, settings?.model),
      state: stateFor(rootUid),
      generations
    });
    lastTree = built;
    const placed = layoutTree(built, { direction });
    const occByKey = /* @__PURE__ */ new Map();
    const walkOcc = (occ) => {
      occByKey.set(occ.key, occ);
      for (const child of occ.children) walkOcc(child);
    };
    walkOcc(built.root);
    const nodeByKey = /* @__PURE__ */ new Map();
    for (const [key, occ] of occByKey) {
      if (occ.depth > 0) nodeByKey.set(key, occ.node);
    }
    for (const parent of built.parents) nodeByKey.set(`parent:${parent.uid}`, parent);
    for (const peer of built.peers) nodeByKey.set(`peer:${peer.uid}`, peer);
    const drawnNodes = [];
    const seenNodeUids = /* @__PURE__ */ new Set();
    for (const item of placed.items) {
      if (item.kind !== "node") continue;
      const node = nodeByKey.get(item.key);
      if (!node || seenNodeUids.has(node.uid)) continue;
      seenNodeUids.add(node.uid);
      drawnNodes.push(node);
    }
    const hidden = computeHiddenSet(drawnNodes, hood);
    const keepKeys = /* @__PURE__ */ new Set([hood.center.uid]);
    for (const item of placed.items) keepKeys.add(item.key);
    for (const [key, element] of itemEls) {
      if (keepKeys.has(key)) continue;
      element.remove();
      itemEls.delete(key);
    }
    renderRootNode(hood.center, placed.center);
    for (const item of placed.items) {
      if (item.kind === "more") {
        renderMoreItem(item);
      } else {
        const node = nodeByKey.get(item.key);
        const occ = occByKey.get(item.key) ?? null;
        renderItemNode(item, node, occ, hidden.has(item.uid));
      }
    }
    edgesEl.replaceChildren();
    const itemByKey = new Map(placed.items.map((item) => [item.key, item]));
    for (const link of placed.links) {
      const targetItem = itemByKey.get(link.toKey);
      const targetNode = nodeByKey.get(link.toKey);
      const vertical = link.side === "north";
      const shape = ctx.curve(link.from.x, link.from.y, link.to.x, link.to.y, vertical);
      const group = ctx.svg("g", "compass-edge");
      if (targetItem?.uid) group.dataset.uid = targetItem.uid;
      if (targetNode?.style) group.dataset.style = targetNode.style;
      else if (targetItem?.kind === "more") group.dataset.style = "more";
      const path = ctx.svg("path", "compass-edge-line");
      path.setAttribute("d", shape.d);
      group.append(path);
      edgesEl.append(group);
    }
    const isEmptyRoot = built.root.children.length === 0 && built.parents.length === 0;
    emptyEl.hidden = !isEmptyRoot;
    const bounds = { ...placed.bounds };
    if (isEmptyRoot) {
      const emptyTop = placed.center.h / 2 + 24;
      emptyEl.style.transform = `translate(-50%, ${emptyTop}px)`;
      bounds.maxY = Math.max(bounds.maxY, emptyTop + 28);
      bounds.minX = Math.min(bounds.minX, -140);
      bounds.maxX = Math.max(bounds.maxX, 140);
    }
    if (built.truncated || placed.peersOmitted > 0) {
      const noticeKey = `${rootUid}:${built.truncated ? 1 : 0}:${placed.peersOmitted}`;
      if (noticeKey !== lastNoticeKey) {
        lastNoticeKey = noticeKey;
        const peerWord = placed.peersOmitted === 1 ? "peer" : "peers";
        if (built.truncated && placed.peersOmitted > 0) {
          ctx.setStatus(`Showing the first 300 nodes; ${placed.peersOmitted} ${peerWord} left out in balanced view.`);
        } else if (built.truncated) {
          ctx.setStatus("Showing the first 300 nodes.");
        } else {
          ctx.setStatus(`${placed.peersOmitted} ${peerWord} left out in balanced view.`);
        }
      }
    } else {
      lastNoticeKey = "";
    }
    const geometryItems = placed.items.filter((item) => item.kind === "node").map((item) => ({
      key: item.key,
      uid: item.uid,
      zone: item.zone,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      depth: item.depth,
      status: item.status,
      side: item.side
    }));
    return {
      view: "mindmap",
      geometry: {
        center: placed.center,
        items: geometryItems,
        rows: [],
        chips: [],
        more: false,
        bounds,
        nodes: drawnNodes
      }
    };
  }
  function afterRender({ view }) {
    if (view === "mindmap" && pendingFit) {
      pendingFit = false;
      ctx.fit(true);
    }
  }
  function onStageClick(event) {
    if (!isActive() || !lastTree) return false;
    const target = event?.target;
    const chevron = target?.closest?.(".compass-mm-chevron");
    if (chevron) {
      event.preventDefault?.();
      const occ = findOccurrence(lastTree.root, chevron.dataset?.key);
      if (occ) {
        const rootUid = lastTree.root.uid;
        stateByRoot.set(rootUid, toggleFold(stateFor(rootUid), occ, currentGenerations()));
        ctx.render();
      }
      return true;
    }
    const moreBtn = target?.closest?.(".compass-mm-more");
    if (moreBtn) {
      event.preventDefault?.();
      const parentKey = moreBtn.dataset?.parentKey;
      if (parentKey) {
        const rootUid = lastTree.root.uid;
        const prev = stateFor(rootUid);
        const nextLimits = new Map(prev.limits);
        nextLimits.set(parentKey, (nextLimits.get(parentKey) ?? 12) + 12);
        stateByRoot.set(rootUid, {
          folded: new Set(prev.folded),
          opened: new Set(prev.opened),
          limits: nextLimits
        });
        ctx.render();
      }
      return true;
    }
    return false;
  }
  function onStageDoubleClick(event) {
    if (!isActive()) return false;
    if (event?.target?.closest?.(".compass-mm-chevron, .compass-mm-more")) {
      event.preventDefault?.();
      return true;
    }
    return false;
  }
  function onKey(event) {
    if (!isActive() || !lastTree) return false;
    if (!event?.altKey || event.key !== "Enter" || event.metaKey || event.ctrlKey || event.shiftKey) {
      return false;
    }
    const activeEl = globalThis.document?.activeElement;
    const nodeEl = activeEl?.closest?.(".compass-node") ?? event.target?.closest?.(".compass-node");
    const key = nodeEl?.dataset?.key;
    if (!key) return false;
    const occ = findOccurrence(lastTree.root, key);
    if (!occ) return false;
    if (occ.depth > 0 && (occ.status === "open" || occ.status === "folded")) {
      const rootUid = lastTree.root.uid;
      stateByRoot.set(rootUid, toggleFold(stateFor(rootUid), occ, currentGenerations()));
      ctx.render();
      itemEls.get(key)?.focus?.({ preventScroll: true });
    }
    return true;
  }
  function runExpand() {
    if (!lastTree) return;
    const rootUid = lastTree.root.uid;
    stateByRoot.set(rootUid, expandGeneration(lastTree, stateFor(rootUid)));
    ctx.render();
  }
  function runCollapse() {
    if (!lastTree) return;
    const rootUid = lastTree.root.uid;
    stateByRoot.set(rootUid, collapseGeneration(lastTree, stateFor(rootUid)));
    ctx.render();
  }
  async function setDirection(value) {
    lastDirection = value;
    pendingFit = false;
    await ctx.saveSetting(SETTING_IDS.mindmapDirection, value);
    ctx.render();
    ctx.fit(true);
  }
  function commands() {
    if (!isActive()) return [];
    return [
      { id: "mm-expand", title: "Mind Map: expand one generation", hint: "", run: () => runExpand() },
      { id: "mm-collapse", title: "Mind Map: collapse one generation", hint: "", run: () => runCollapse() },
      { id: "mm-right", title: "Mind Map: grow right", hint: "", run: () => setDirection("right") },
      { id: "mm-left", title: "Mind Map: grow left", hint: "", run: () => setDirection("left") },
      { id: "mm-balanced", title: "Mind Map: grow both sides", hint: "", run: () => setDirection("balanced") }
    ];
  }
  function stageMenu() {
    if (!isActive()) return [];
    return [
      { title: "Expand one generation", run: () => runExpand() },
      { title: "Collapse one generation", run: () => runCollapse() }
    ];
  }
  function tree() {
    return isActive() ? lastTree : null;
  }
  function outline() {
    return isActive() && lastTree ? treeOutline(lastTree) : null;
  }
  return {
    name: "mindmap",
    onSettings,
    renderView,
    afterRender,
    clearView,
    onClose,
    onStageClick,
    onStageDoubleClick,
    onKey,
    commands,
    stageMenu,
    tree,
    outline
  };
}

// src/model/facets.js
var FACET_PALETTE = Object.freeze([
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#9333ea",
  "#dc2626",
  "#0891b2",
  "#db2777"
]);
var VALID_SOURCES = /* @__PURE__ */ new Set(["attribute", "type", "role", "kind", "rule"]);
var AUTO_SOURCES = /* @__PURE__ */ new Set(["attribute", "type", "kind"]);
var VALID_LAYOUTS = /* @__PURE__ */ new Set(["circular", "concentric", "horizontal", "vertical", "quadrants"]);
var VALID_ROLES = /* @__PURE__ */ new Set(["parent", "child", "friend", "challenger", "previous", "next", "sibling"]);
var VALID_KINDS = /* @__PURE__ */ new Set(["page", "block", "drawing", "region", "board", "card", "empty"]);
var RULE_SINGLE_FIELDS = /* @__PURE__ */ new Set(["title", "kind", "group", "type", "role", "zone", "style", "label"]);
var RULE_OPS = /* @__PURE__ */ new Set(["exists", "missing", "is", "is-not", "contains", "not-contains"]);
var VALUE_OPS = /* @__PURE__ */ new Set(["is", "is-not", "contains", "not-contains"]);
var RESERVED_CATEGORY_IDS = /* @__PURE__ */ new Set(["unassigned", "conflicting"]);
var ID_PATTERN = /^[a-z0-9-]+$/;
var SAFE_COLOR_PATTERN = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,32}|(?:rgb|hsl)a?\(\s*[-0-9.,%\s/]+\))$/;
var STATUS_NEUTRAL_COLOR = "#64748b";
var BUILTIN_PRESETS = Object.freeze([
  Object.freeze({
    id: "roles",
    name: "Local roles",
    help: "Each neighbor by the relationship it has to the center.",
    source: "role",
    categories: Object.freeze([
      Object.freeze({ id: "parents", label: "Parents", values: Object.freeze(["parent"]), color: FACET_PALETTE[0] }),
      Object.freeze({ id: "children", label: "Children", values: Object.freeze(["child"]), color: FACET_PALETTE[1] }),
      Object.freeze({ id: "friends", label: "Friends", values: Object.freeze(["friend", "previous"]), color: FACET_PALETTE[2] }),
      Object.freeze({ id: "challengers", label: "Challengers", values: Object.freeze(["challenger", "next"]), color: FACET_PALETTE[3] }),
      Object.freeze({ id: "siblings", label: "Siblings", values: Object.freeze(["sibling"]), color: FACET_PALETTE[4] })
    ]),
    layout: "circular",
    edges: true,
    focusInCategory: false,
    hideEmptyStatus: true
  }),
  Object.freeze({
    id: "types",
    name: "By type",
    help: "Neighbors grouped by the Node type attribute setting.",
    source: "type",
    categories: "auto",
    layout: "circular",
    edges: true,
    focusInCategory: false,
    hideEmptyStatus: true
  }),
  Object.freeze({
    id: "status",
    name: "Status board",
    help: "Neighbors by their Status:: value.",
    source: "attribute",
    attribute: "Status",
    categories: "auto",
    layout: "horizontal",
    edges: true,
    focusInCategory: false,
    hideEmptyStatus: true
  })
]);
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function slugify(text, fallback) {
  const slug = String(text ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || fallback;
}
function clonePreset(preset, builtin) {
  const categories = Array.isArray(preset.categories) ? preset.categories.map((cat) => ({
    id: cat.id,
    label: cat.label,
    color: cat.color,
    ...cat.match ? {
      match: {
        ...Array.isArray(cat.match.all) ? { all: cat.match.all.map((cond) => ({ ...cond })) } : {},
        ...Array.isArray(cat.match.any) ? { any: cat.match.any.map((cond) => ({ ...cond })) } : {}
      }
    } : { values: [...cat.values ?? []] }
  })) : preset.categories;
  const out = {
    id: preset.id,
    name: preset.name,
    help: preset.help ?? "",
    source: preset.source,
    ...preset.source === "attribute" ? { attribute: preset.attribute } : {},
    categories,
    layout: preset.layout,
    edges: preset.edges,
    focusInCategory: preset.focusInCategory,
    hideEmptyStatus: preset.hideEmptyStatus
  };
  if (typeof builtin === "boolean") out.builtin = builtin;
  return out;
}
function validateRuleCondition(cond, catIndex, errors) {
  if (!isPlainObject(cond)) {
    errors.push(`Category ${catIndex} has an invalid match condition.`);
    return null;
  }
  const field = typeof cond.field === "string" ? cond.field.trim() : "";
  const validAttr = field.startsWith("attr:") && field.slice(5).trim().length > 0;
  if (!RULE_SINGLE_FIELDS.has(field) && !validAttr) {
    errors.push(`Category ${catIndex} has an unknown condition field "${field || "(empty)"}".`);
    return null;
  }
  const normalizedField = validAttr ? `attr:${field.slice(5).trim()}` : field;
  const op = typeof cond.op === "string" ? cond.op.trim() : "";
  if (!RULE_OPS.has(op)) {
    errors.push(`Category ${catIndex} has an unknown operator "${op || "(empty)"}".`);
    return null;
  }
  if (!VALUE_OPS.has(op)) {
    return { field: normalizedField, op };
  }
  const rawVal = cond.value;
  const value = typeof rawVal === "string" ? rawVal.trim() : rawVal == null ? "" : String(rawVal).trim();
  if (!value) {
    errors.push(`Category ${catIndex} has a condition without a value.`);
    return null;
  }
  return { field: normalizedField, op, value };
}
function validateCategory(rawCat, index, source, seenIds, errors) {
  const num = index + 1;
  if (!isPlainObject(rawCat)) {
    errors.push(`Category ${num} must be an object.`);
    return null;
  }
  const label = typeof rawCat.label === "string" ? rawCat.label.trim() : "";
  if (!label) {
    errors.push(`Category ${num} needs a label.`);
  }
  let id = "";
  if (rawCat.id !== void 0 && rawCat.id !== null && String(rawCat.id).trim() !== "") {
    id = typeof rawCat.id === "string" ? rawCat.id.trim() : "";
    if (!ID_PATTERN.test(id)) {
      errors.push(`Category ${num} id must use lowercase letters, numbers, and hyphens.`);
    }
  } else if (label) {
    id = slugify(label, `category-${num}`);
  }
  if (id && RESERVED_CATEGORY_IDS.has(id)) {
    errors.push(`Category ${num} cannot use the reserved id "${id}".`);
  } else if (id && seenIds.has(id)) {
    errors.push(`Category ${num} has a duplicate id "${id}".`);
  } else if (id) {
    seenIds.add(id);
  }
  let color = FACET_PALETTE[index % FACET_PALETTE.length];
  if (rawCat.color !== void 0 && rawCat.color !== null && String(rawCat.color).trim() !== "") {
    const trimmedColor = typeof rawCat.color === "string" ? rawCat.color.trim() : "";
    if (!SAFE_COLOR_PATTERN.test(trimmedColor)) {
      errors.push(`Category ${num} has an invalid color.`);
    } else {
      color = trimmedColor;
    }
  }
  if (source === "rule") {
    const match = rawCat.match;
    if (!isPlainObject(match)) {
      errors.push(`Category ${num} needs a match rule.`);
      return null;
    }
    const rawAll = match.all !== void 0 ? match.all : [];
    const rawAny = match.any !== void 0 ? match.any : [];
    if (!Array.isArray(rawAll) || !Array.isArray(rawAny)) {
      errors.push(`Category ${num} match all/any must be arrays.`);
      return null;
    }
    if (!rawAll.length && !rawAny.length) {
      errors.push(`Category ${num} needs at least one match condition.`);
      return null;
    }
    const all = rawAll.map((item) => validateRuleCondition(item, num, errors)).filter(Boolean);
    const any = rawAny.map((item) => validateRuleCondition(item, num, errors)).filter(Boolean);
    const normalizedMatch = {};
    if (all.length) normalizedMatch.all = all;
    if (any.length) normalizedMatch.any = any;
    return { id, label, color, match: normalizedMatch };
  }
  if (!Array.isArray(rawCat.values)) {
    errors.push(`Category ${num} has no values.`);
    return null;
  }
  const values = [];
  const seenValues = /* @__PURE__ */ new Set();
  for (const item of rawCat.values) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seenValues.has(trimmed)) continue;
    seenValues.add(trimmed);
    values.push(trimmed);
  }
  if (!values.length) {
    errors.push(`Category ${num} has no values.`);
    return null;
  }
  if (source === "role") {
    for (const val of values) {
      if (!VALID_ROLES.has(val)) {
        errors.push(`Category ${num} has an unknown role "${val}".`);
      }
    }
  } else if (source === "kind") {
    for (const val of values) {
      if (!VALID_KINDS.has(val)) {
        errors.push(`Category ${num} has an unknown kind "${val}".`);
      }
    }
  }
  return { id, label, color, values };
}
function validatePreset(raw) {
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ["A preset must be a JSON object."] };
  }
  const errors = [];
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) {
    errors.push("Preset id is required.");
  } else if (!ID_PATTERN.test(id)) {
    errors.push("Preset id must use lowercase letters, numbers, and hyphens only.");
  }
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) {
    errors.push("Preset name is required.");
  }
  let help = "";
  if (raw.help !== void 0 && raw.help !== null) {
    if (typeof raw.help !== "string") errors.push("Help text must be a string.");
    else help = raw.help.trim();
  }
  const source = typeof raw.source === "string" ? raw.source.trim() : "";
  if (!VALID_SOURCES.has(source)) {
    errors.push("Source must be attribute, type, role, kind, or rule.");
  }
  let attribute = "";
  if (source === "attribute") {
    const rawAttr = typeof raw.attribute === "string" ? raw.attribute.trim().replace(/::$/, "").trim() : "";
    if (!rawAttr) {
      errors.push("Attribute name is required when source is attribute.");
    } else {
      attribute = rawAttr;
    }
  }
  let layout2 = "circular";
  if (raw.layout !== void 0 && raw.layout !== null && raw.layout !== "") {
    const rawLayout = typeof raw.layout === "string" ? raw.layout.trim() : "";
    if (!VALID_LAYOUTS.has(rawLayout)) {
      errors.push("Layout must be circular, concentric, horizontal, vertical, or quadrants.");
    } else {
      layout2 = rawLayout;
    }
  }
  let edges = true;
  if (raw.edges !== void 0) {
    if (typeof raw.edges !== "boolean") errors.push("Edges must be true or false.");
    else edges = raw.edges;
  }
  let focusInCategory = false;
  if (raw.focusInCategory !== void 0) {
    if (typeof raw.focusInCategory !== "boolean") errors.push("focusInCategory must be true or false.");
    else focusInCategory = raw.focusInCategory;
  }
  let hideEmptyStatus = true;
  if (raw.hideEmptyStatus !== void 0) {
    if (typeof raw.hideEmptyStatus !== "boolean") errors.push("hideEmptyStatus must be true or false.");
    else hideEmptyStatus = raw.hideEmptyStatus;
  }
  let categories = null;
  const rawCategories = typeof raw.categories === "string" ? raw.categories.trim() : raw.categories;
  if (rawCategories === "auto") {
    if (VALID_SOURCES.has(source) && !AUTO_SOURCES.has(source)) {
      errors.push("Auto categories are only supported for attribute, type, and kind sources.");
    } else {
      categories = "auto";
    }
  } else if (!Array.isArray(rawCategories) || rawCategories.length < 2 || rawCategories.length > 7) {
    errors.push("A preset needs 2 to 7 categories.");
  } else if (VALID_SOURCES.has(source)) {
    const seenIds = /* @__PURE__ */ new Set();
    const normalized = rawCategories.map((cat, idx) => validateCategory(cat, idx, source, seenIds, errors));
    if (!errors.length) categories = normalized;
  }
  if (errors.length) {
    return { ok: false, errors };
  }
  const preset = {
    id,
    name,
    help,
    source,
    ...source === "attribute" ? { attribute } : {},
    categories,
    layout: layout2,
    edges,
    focusInCategory,
    hideEmptyStatus
  };
  return { ok: true, preset };
}
function allPresets(custom = []) {
  const customById = /* @__PURE__ */ new Map();
  const customOrder = [];
  if (Array.isArray(custom)) {
    for (const raw of custom) {
      const checked = validatePreset(raw);
      if (!checked.ok) continue;
      const { id } = checked.preset;
      if (!customById.has(id)) customOrder.push(id);
      customById.set(id, checked.preset);
    }
  }
  const builtinIds = new Set(BUILTIN_PRESETS.map((preset) => preset.id));
  const out = [];
  for (const builtin of BUILTIN_PRESETS) {
    if (customById.has(builtin.id)) {
      out.push(clonePreset(customById.get(builtin.id), false));
    } else {
      out.push(clonePreset(builtin, true));
    }
  }
  for (const id of customOrder) {
    if (builtinIds.has(id)) continue;
    out.push(clonePreset(customById.get(id), false));
  }
  return out;
}
function findPreset(presets, id) {
  const list = Array.isArray(presets) ? presets : [];
  const target = typeof id === "string" ? id.trim() : "";
  if (target) {
    const hit = list.find((preset) => preset?.id === target);
    if (hit) return hit;
  }
  const firstBuiltin = list.find((preset) => preset?.id === BUILTIN_PRESETS[0].id) ?? list[0];
  return firstBuiltin ?? clonePreset(BUILTIN_PRESETS[0], true);
}
function attributeValues(fact, attributeName) {
  const target = typeof attributeName === "string" ? attributeName.trim().toLowerCase() : "";
  const attrs = fact?.attributes;
  if (!target || !attrs || typeof attrs !== "object") return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const pushAll = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const raw of arr) {
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
  };
  if (Array.isArray(attrs[target])) {
    pushAll(attrs[target]);
    return out;
  }
  for (const [key, values] of Object.entries(attrs)) {
    if (key.trim().toLowerCase() === target) pushAll(values);
  }
  return out;
}
function valuesForFact(preset, fact) {
  if (!preset || !fact || typeof fact !== "object") return [];
  if (preset.source === "attribute") return attributeValues(fact, preset.attribute);
  if (preset.source === "type") {
    const val = typeof fact.type === "string" ? fact.type.trim() : "";
    return val ? [val] : [];
  }
  if (preset.source === "role") {
    const val = typeof fact.role === "string" ? fact.role.trim() : "";
    return val ? [val] : [];
  }
  if (preset.source === "kind") {
    const raw = fact.group !== void 0 ? fact.group : fact.kind;
    const val = typeof raw === "string" ? raw.trim() : "";
    return val ? [val] : [];
  }
  return [];
}
function compareAutoValues(a, b, counts) {
  const diff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
  if (diff !== 0) return diff;
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al !== bl) return al < bl ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}
function uniqueCategoryId(base, usedIds) {
  let candidate = base;
  let suffix = 2;
  while (!candidate || RESERVED_CATEGORY_IDS.has(candidate) || usedIds.has(candidate)) {
    candidate = `${base || "cat"}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}
function resolveCategories(preset, facts) {
  if (preset?.categories === "auto") {
    const counts = /* @__PURE__ */ new Map();
    for (const fact of facts) {
      const vals = valuesForFact(preset, fact);
      for (const val of vals) {
        counts.set(val, (counts.get(val) ?? 0) + 1);
      }
    }
    const distinct = [...counts.keys()].sort((a, b) => compareAutoValues(a, b, counts));
    const usedIds = /* @__PURE__ */ new Set();
    if (distinct.length <= 7) {
      return distinct.map((val, index) => ({
        id: uniqueCategoryId(slugify(val, `cat-${index + 1}`), usedIds),
        label: val,
        color: FACET_PALETTE[index % FACET_PALETTE.length],
        values: [val]
      }));
    }
    const top = distinct.slice(0, 6).map((val, index) => ({
      id: uniqueCategoryId(slugify(val, `cat-${index + 1}`), usedIds),
      label: val,
      color: FACET_PALETTE[index % FACET_PALETTE.length],
      values: [val]
    }));
    top.push({
      id: uniqueCategoryId("other", usedIds),
      label: "Other",
      color: FACET_PALETTE[6],
      values: distinct.slice(6)
    });
    return top;
  }
  if (!Array.isArray(preset?.categories)) return [];
  return preset.categories.map((cat, index) => ({
    id: typeof cat?.id === "string" && cat.id.trim() ? cat.id.trim() : `category-${index + 1}`,
    label: typeof cat?.label === "string" && cat.label.trim() ? cat.label.trim() : `Category ${index + 1}`,
    color: typeof cat?.color === "string" && cat.color.trim() ? cat.color.trim() : FACET_PALETTE[index % FACET_PALETTE.length],
    ...preset.source === "rule" ? { match: cat?.match } : { values: (cat?.values ?? []).map((v) => String(v).trim()).filter(Boolean) }
  }));
}
function categoryMatchesFact(preset, category, fact, cachedValues = null) {
  if (!preset || !category || !fact) return false;
  if (preset.source === "rule") {
    return matchConditions(category.match, fact);
  }
  const values = cachedValues ?? valuesForFact(preset, fact);
  if (!values.length || !Array.isArray(category.values)) return false;
  return category.values.some((target) => values.includes(target.trim()));
}
function classify(preset, facts = []) {
  const list = Array.isArray(facts) ? facts.filter((fact) => typeof fact?.uid === "string" && fact.uid) : [];
  const resolved = resolveCategories(preset, list);
  const categories = resolved.map((cat) => ({
    id: cat.id,
    label: cat.label,
    color: cat.color,
    uids: []
  }));
  const unassigned = [];
  const conflicting = [];
  const matches2 = {};
  for (const fact of list) {
    const vals = preset?.source === "rule" ? null : valuesForFact(preset, fact);
    const matchedIndices = [];
    for (let i = 0; i < resolved.length; i += 1) {
      if (categoryMatchesFact(preset, resolved[i], fact, vals)) matchedIndices.push(i);
    }
    if (matchedIndices.length === 0) {
      unassigned.push(fact.uid);
    } else if (matchedIndices.length === 1) {
      categories[matchedIndices[0]].uids.push(fact.uid);
    } else {
      conflicting.push(fact.uid);
      matches2[fact.uid] = matchedIndices.map((idx) => categories[idx].id);
    }
  }
  return {
    preset,
    categories,
    unassigned,
    conflicting,
    matches: matches2
  };
}
function centerCategory(preset, fact, resolvedCategories = null) {
  if (!preset || !fact || typeof fact !== "object") return null;
  if (preset.categories === "auto") {
    if (!Array.isArray(resolvedCategories) || !resolvedCategories.length) return null;
    const vals2 = valuesForFact(preset, fact);
    if (!vals2.length) return null;
    const otherCat = resolvedCategories.length === 7 && resolvedCategories[6]?.label === "Other" && !Array.isArray(resolvedCategories[6]?.values) ? resolvedCategories[6] : null;
    const hits2 = /* @__PURE__ */ new Set();
    for (const val of vals2) {
      const direct = resolvedCategories.find((cat) => Array.isArray(cat?.values) ? cat.values.includes(val) : cat !== otherCat && cat?.label === val);
      if (direct?.id) hits2.add(direct.id);
      else if (otherCat?.id) hits2.add(otherCat.id);
    }
    return hits2.size === 1 ? [...hits2][0] : null;
  }
  if (!Array.isArray(preset.categories)) return null;
  const categories = resolveCategories(preset, []);
  if (!categories.length) return null;
  const vals = preset.source === "rule" ? null : valuesForFact(preset, fact);
  const hits = [];
  for (const cat of categories) {
    if (categoryMatchesFact(preset, cat, fact, vals)) hits.push(cat.id);
  }
  return hits.length === 1 ? hits[0] : null;
}
var REGION_PAD_X = 14;
var REGION_HEADER_H = 32;
var REGION_PAD_BOTTOM = 14;
var EMPTY_INNER_H = 20;
function columnsForCount(count2) {
  if (count2 <= 4) return 1;
  if (count2 <= 10) return 2;
  return 3;
}
function prepareBoxSpec(spec, { card, center, gap, maxRows, expandedRegions, focusCategory }) {
  const uids = Array.isArray(spec.uids) ? spec.uids : [];
  const count2 = uids.length;
  const cols = columnsForCount(count2);
  const colGap = Math.max(8, gap);
  const rowGap = Math.max(8, Math.round(gap * 0.75));
  const isExpanded = expandedRegions instanceof Set && expandedRegions.has(spec.id);
  const rowCap = isExpanded || !Number.isFinite(maxRows) ? Infinity : Math.max(1, Math.trunc(maxRows));
  const slotCap = Number.isFinite(rowCap) ? cols * rowCap : count2;
  const hasMore = count2 > slotCap;
  const shownCount = hasMore ? Math.max(0, slotCap - 1) : count2;
  const hidden = count2 - shownCount;
  const totalSlots = shownCount + (hasMore ? 1 : 0);
  const gridRows = totalSlots > 0 ? Math.ceil(totalSlots / cols) : 0;
  const gridW = totalSlots > 0 ? cols * card.w + (cols - 1) * colGap : card.w;
  const gridH = gridRows > 0 ? gridRows * card.h + (gridRows - 1) * rowGap : focusCategory === spec.id ? 0 : EMPTY_INNER_H;
  const isFocused = focusCategory === spec.id;
  const focusW = isFocused ? Math.max(card.w, center.w) : 0;
  const focusH = isFocused ? card.h * 2 : 0;
  const innerW = isFocused ? Math.max(gridW, focusW) : gridW;
  const innerH = isFocused ? focusH + (gridRows > 0 ? rowGap + gridH : 0) : gridH;
  return {
    ...spec,
    uids,
    count: count2,
    hidden,
    hasMore,
    shownCount,
    totalSlots,
    cols,
    gridRows,
    colGap,
    rowGap,
    gridW,
    gridH,
    isFocused,
    focusW,
    focusH,
    w: innerW + REGION_PAD_X * 2,
    h: REGION_HEADER_H + innerH + REGION_PAD_BOTTOM
  };
}
function materializeBoxRegion(prepared, rx, ry, card) {
  const region = {
    id: prepared.id,
    label: prepared.label,
    color: prepared.color,
    x: rx,
    y: ry,
    w: prepared.w,
    h: prepared.h,
    count: prepared.count,
    hidden: prepared.hidden,
    status: prepared.status ?? null
  };
  let focusBox = null;
  let cardsTop = ry - prepared.h / 2 + REGION_HEADER_H;
  if (prepared.isFocused) {
    focusBox = {
      x: rx,
      y: cardsTop + prepared.focusH / 2,
      w: prepared.focusW,
      h: prepared.focusH
    };
    cardsTop += prepared.focusH + prepared.rowGap;
  }
  const items = [];
  const more = [];
  const gridLeft = rx - prepared.gridW / 2;
  for (let s = 0; s < prepared.totalSlots; s += 1) {
    const row = Math.floor(s / prepared.cols);
    const col = s % prepared.cols;
    const x = gridLeft + col * (card.w + prepared.colGap) + card.w / 2;
    const y = cardsTop + row * (card.h + prepared.rowGap) + card.h / 2;
    if (s < prepared.shownCount) {
      const uid = prepared.uids[s];
      items.push({
        key: `${prepared.id}:${uid}`,
        uid,
        zone: prepared.id,
        x,
        y,
        w: card.w,
        h: card.h
      });
    } else {
      more.push({
        regionId: prepared.id,
        count: prepared.hidden,
        x,
        y,
        w: card.w,
        h: card.h
      });
    }
  }
  return { region, items, more, focusBox };
}
function pairRadius(a, angleA, b, angleB, clearance) {
  const dxFactor = Math.abs(Math.cos(angleA) - Math.cos(angleB));
  const dyFactor = Math.abs(Math.sin(angleA) - Math.sin(angleB));
  const rx = dxFactor > 1e-6 ? ((a.w + b.w) / 2 + clearance) / dxFactor : Infinity;
  const ry = dyFactor > 1e-6 ? ((a.h + b.h) / 2 + clearance) / dyFactor : Infinity;
  return Math.min(rx, ry);
}
function centerClearRadius(reg, angle, centerBox, clearance) {
  const cx = Math.abs(Math.cos(angle));
  const cy = Math.abs(Math.sin(angle));
  const rx = cx > 1e-6 ? ((reg.w + centerBox.w) / 2 + clearance) / cx : Infinity;
  const ry = cy > 1e-6 ? ((reg.h + centerBox.h) / 2 + clearance) / cy : Infinity;
  return Math.min(rx, ry);
}
function placeCircular(specs, centerBox, gap) {
  const count2 = specs.length;
  if (!count2) return [];
  if (count2 === 1 && !centerBox) {
    return [{ x: 0, y: 0 }];
  }
  const clearance = gap * 2;
  const angles = specs.map((_, idx) => -Math.PI / 2 + 2 * Math.PI * idx / count2);
  let radius = 0;
  if (centerBox) {
    for (let i = 0; i < count2; i += 1) {
      radius = Math.max(radius, centerClearRadius(specs[i], angles[i], centerBox, clearance));
    }
  }
  for (let i = 0; i < count2; i += 1) {
    for (let j = i + 1; j < count2; j += 1) {
      radius = Math.max(radius, pairRadius(specs[i], angles[i], specs[j], angles[j], clearance));
    }
  }
  radius = Math.ceil(radius);
  return angles.map((angle) => ({
    x: Math.round(radius * Math.cos(angle)),
    y: Math.round(radius * Math.sin(angle))
  }));
}
function boxesClear(ax, ay, aw, ah, bx, by, bw, bh, clearance) {
  const sepX = Math.abs(ax - bx) - (aw + bw) / 2;
  const sepY = Math.abs(ay - by) - (ah + bh) / 2;
  return sepX >= clearance - 1e-6 || sepY >= clearance - 1e-6;
}
function placeCircularExact(specs, centerBox, gap) {
  const count2 = specs.length;
  if (!count2) return [];
  if (count2 === 1 && !centerBox) return [{ x: 0, y: 0 }];
  const clearance = gap * 2;
  const angles = specs.map((_, idx) => -Math.PI / 2 + 2 * Math.PI * idx / count2);
  let base = placeCircular(specs, centerBox, gap);
  let radius = Math.hypot(base[0].x, base[0].y);
  for (let step2 = 0; step2 < 10; step2 += 1) {
    let ok = true;
    if (centerBox) {
      for (let i = 0; i < count2; i += 1) {
        if (!boxesClear(base[i].x, base[i].y, specs[i].w, specs[i].h, centerBox.x, centerBox.y, centerBox.w, centerBox.h, clearance)) {
          ok = false;
          break;
        }
      }
    }
    if (ok) {
      for (let i = 0; i < count2 && ok; i += 1) {
        for (let j = i + 1; j < count2; j += 1) {
          if (!boxesClear(base[i].x, base[i].y, specs[i].w, specs[i].h, base[j].x, base[j].y, specs[j].w, specs[j].h, clearance)) {
            ok = false;
            break;
          }
        }
      }
    }
    if (ok) break;
    radius += 4;
    base = angles.map((angle) => ({
      x: Math.round(radius * Math.cos(angle)),
      y: Math.round(radius * Math.sin(angle))
    }));
  }
  return base;
}
function placeHorizontal(specs, centerBox, gap) {
  if (!specs.length) return [];
  const regionGap = gap * 2;
  const totalW = specs.reduce((sum, item) => sum + item.w, 0) + Math.max(0, specs.length - 1) * regionGap;
  const maxH = Math.max(...specs.map((item) => item.h));
  const rowTop = centerBox ? centerBox.y + centerBox.h / 2 + gap * 3 : -Math.round(maxH / 2);
  let curX = -Math.round(totalW / 2);
  return specs.map((spec) => {
    const pos = { x: curX + spec.w / 2, y: rowTop + spec.h / 2 };
    curX += spec.w + regionGap;
    return pos;
  });
}
function placeVertical(specs, centerBox, gap) {
  if (!specs.length) return [];
  const regionGap = gap * 2;
  const totalH = specs.reduce((sum, item) => sum + item.h, 0) + Math.max(0, specs.length - 1) * regionGap;
  const maxW = Math.max(...specs.map((item) => item.w));
  const colLeft = centerBox ? centerBox.x + centerBox.w / 2 + gap * 3 : -Math.round(maxW / 2);
  let curY = -Math.round(totalH / 2);
  return specs.map((spec) => {
    const pos = { x: colLeft + spec.w / 2, y: curY + spec.h / 2 };
    curY += spec.h + regionGap;
    return pos;
  });
}
function placeQuadrants(specs, centerBox, gap) {
  const [tl, tr, bl, br] = specs;
  const innerX = gap * 2;
  const clearY = centerBox ? centerBox.h / 2 + gap * 2 : gap;
  return [
    { x: -(innerX + tl.w / 2), y: -(clearY + tl.h / 2) },
    { x: innerX + tr.w / 2, y: -(clearY + tr.h / 2) },
    { x: -(innerX + bl.w / 2), y: clearY + bl.h / 2 },
    { x: innerX + br.w / 2, y: clearY + br.h / 2 }
  ];
}
function layoutConcentricRings(rawSpecs, { card, center, gap, maxRows, expandedRegions, focusCategory }) {
  const regions = [];
  const items = [];
  const more = [];
  let focusBox = null;
  const hasFocus = rawSpecs.some((spec) => spec.id === focusCategory);
  let prevOuterW = hasFocus ? gap * 2 : center.w;
  let prevOuterH = hasFocus ? gap * 2 : center.h;
  const colGap = Math.max(8, gap);
  const rowGap = Math.max(8, Math.round(gap * 0.75));
  const bandInnerPad = Math.max(8, Math.round(gap * 0.75));
  for (const spec of rawSpecs) {
    const innerW = prevOuterW + gap * 4;
    const innerH = prevOuterH + gap * 4;
    const uids = Array.isArray(spec.uids) ? spec.uids : [];
    const count2 = uids.length;
    const isFocused = focusCategory === spec.id;
    const isExpanded = expandedRegions instanceof Set && expandedRegions.has(spec.id);
    const minCols = Math.max(2, Math.floor((innerW + colGap) / (card.w + colGap)));
    const cols = Math.max(minCols, Math.min(6, Math.max(2, Math.ceil(count2 / 2))));
    const rowCap = isExpanded || !Number.isFinite(maxRows) ? Infinity : Math.max(1, Math.trunc(maxRows));
    const slotCap = Number.isFinite(rowCap) ? cols * rowCap : count2;
    const hasMore = count2 > slotCap;
    const shownCount = hasMore ? Math.max(0, slotCap - 1) : count2;
    const hidden = count2 - shownCount;
    const totalSlots = shownCount + (hasMore ? 1 : 0);
    const topMaxRows = Number.isFinite(rowCap) ? Math.ceil(rowCap / 2) : Infinity;
    const botMaxRows = Number.isFinite(rowCap) ? Math.floor(rowCap / 2) : Infinity;
    const topCount = Number.isFinite(rowCap) ? Math.min(cols * topMaxRows, Math.max(totalSlots - cols * botMaxRows, Math.ceil(totalSlots / 2))) : Math.ceil(totalSlots / 2);
    const botCount = totalSlots - topCount;
    const topRows = topCount > 0 ? Math.ceil(topCount / cols) : 0;
    const botRows = botCount > 0 ? Math.ceil(botCount / cols) : 0;
    const focusW = isFocused ? Math.max(card.w, center.w) : 0;
    const focusH = isFocused ? card.h * 2 : 0;
    const topGridH = topRows > 0 ? topRows * card.h + (topRows - 1) * rowGap : 0;
    const botGridH = botRows > 0 ? botRows * card.h + (botRows - 1) * rowGap : 0;
    const topBandNeeded = REGION_HEADER_H + (isFocused ? focusH + (topRows > 0 ? rowGap : 0) : 0) + topGridH + bandInnerPad;
    const botBandNeeded = bandInnerPad + botGridH + REGION_PAD_BOTTOM;
    const bandH = Math.max(topBandNeeded, botBandNeeded, REGION_HEADER_H + bandInnerPad);
    const maxRowCols = Math.max(Math.min(topCount, cols), Math.min(botCount, cols), 1);
    const rowGridW = maxRowCols * card.w + (maxRowCols - 1) * colGap;
    const outerW = Math.max(
      innerW + gap * 4,
      rowGridW + REGION_PAD_X * 2,
      isFocused ? focusW + REGION_PAD_X * 2 : 0
    );
    const outerH = innerH + bandH * 2;
    regions.push({
      id: spec.id,
      label: spec.label,
      color: spec.color,
      x: 0,
      y: 0,
      w: outerW,
      h: outerH,
      count: count2,
      hidden,
      status: null
    });
    let topCursorY = -outerH / 2 + REGION_HEADER_H;
    if (isFocused) {
      focusBox = {
        x: 0,
        y: topCursorY + focusH / 2,
        w: focusW,
        h: focusH
      };
      topCursorY += focusH + rowGap;
    }
    for (let s = 0; s < topCount; s += 1) {
      const row = Math.floor(s / cols);
      const col = s % cols;
      const inRow = row === topRows - 1 ? topCount - row * cols : cols;
      const usedW = inRow * card.w + (inRow - 1) * colGap;
      const x = -usedW / 2 + col * (card.w + colGap) + card.w / 2;
      const y = topCursorY + row * (card.h + rowGap) + card.h / 2;
      if (s < shownCount) {
        const uid = uids[s];
        items.push({ key: `${spec.id}:${uid}`, uid, zone: spec.id, x, y, w: card.w, h: card.h });
      } else {
        more.push({ regionId: spec.id, count: hidden, x, y, w: card.w, h: card.h });
      }
    }
    const botStartY = innerH / 2 + bandInnerPad;
    for (let b = 0; b < botCount; b += 1) {
      const slotIndex = topCount + b;
      const row = Math.floor(b / cols);
      const col = b % cols;
      const inRow = row === botRows - 1 ? botCount - row * cols : cols;
      const usedW = inRow * card.w + (inRow - 1) * colGap;
      const x = -usedW / 2 + col * (card.w + colGap) + card.w / 2;
      const y = botStartY + row * (card.h + rowGap) + card.h / 2;
      if (slotIndex < shownCount) {
        const uid = uids[slotIndex];
        items.push({ key: `${spec.id}:${uid}`, uid, zone: spec.id, x, y, w: card.w, h: card.h });
      } else {
        more.push({ regionId: spec.id, count: hidden, x, y, w: card.w, h: card.h });
      }
    }
    prevOuterW = outerW;
    prevOuterH = outerH;
  }
  const centerBox = focusBox ?? { x: 0, y: 0, w: center.w, h: center.h };
  return { centerBox, regions, items, more };
}
function layoutFacets(classified, options = {}) {
  const card = { w: options?.card?.w ?? 168, h: options?.card?.h ?? 32 };
  const center = { w: options?.center?.w ?? 240, h: options?.center?.h ?? 56 };
  const gap = Number.isFinite(options?.gap) && options.gap > 0 ? options.gap : 12;
  const maxRows = options?.maxRows !== void 0 ? options.maxRows : 6;
  const expandedRegions = options?.expandedRegions instanceof Set ? options.expandedRegions : null;
  const rawCategories = Array.isArray(classified?.categories) ? classified.categories : [];
  const rawFocus = typeof options?.focusCategory === "string" && options.focusCategory ? options.focusCategory : null;
  const focusCategory = rawFocus && rawCategories.some((cat) => cat.id === rawFocus) ? rawFocus : null;
  const requestedLayout = classified?.preset?.layout || "circular";
  let effectiveLayout = requestedLayout;
  let fallback = null;
  if (requestedLayout === "quadrants" && rawCategories.length !== 4) {
    effectiveLayout = "circular";
    fallback = "circular";
  }
  let centerBox = focusCategory ? null : { x: 0, y: 0, w: center.w, h: center.h };
  const regions = [];
  const items = [];
  const more = [];
  if (effectiveLayout === "concentric") {
    const built = layoutConcentricRings(rawCategories, {
      card,
      center,
      gap,
      maxRows,
      expandedRegions,
      focusCategory
    });
    centerBox = built.centerBox;
    regions.push(...built.regions);
    items.push(...built.items);
    more.push(...built.more);
  } else {
    const prepared = rawCategories.map((cat) => prepareBoxSpec({ ...cat, status: null }, { card, center, gap, maxRows, expandedRegions, focusCategory }));
    let positions = [];
    if (effectiveLayout === "horizontal") positions = placeHorizontal(prepared, centerBox, gap);
    else if (effectiveLayout === "vertical") positions = placeVertical(prepared, centerBox, gap);
    else if (effectiveLayout === "quadrants") positions = placeQuadrants(prepared, centerBox, gap);
    else positions = placeCircularExact(prepared, centerBox, gap);
    for (let i = 0; i < prepared.length; i += 1) {
      const mat = materializeBoxRegion(prepared[i], positions[i].x, positions[i].y, card);
      regions.push(mat.region);
      items.push(...mat.items);
      more.push(...mat.more);
      if (mat.focusBox) centerBox = mat.focusBox;
    }
  }
  if (!centerBox) {
    centerBox = { x: 0, y: 0, w: center.w, h: center.h };
  }
  const hideEmpty = classified?.preset?.hideEmptyStatus !== false;
  const unassignedUids = Array.isArray(classified?.unassigned) ? classified.unassigned : [];
  const conflictingUids = Array.isArray(classified?.conflicting) ? classified.conflicting : [];
  const statusSpecs = [];
  if (unassignedUids.length > 0 || !hideEmpty) {
    statusSpecs.push({
      id: "unassigned",
      label: "Unassigned",
      color: STATUS_NEUTRAL_COLOR,
      uids: unassignedUids,
      status: "unassigned"
    });
  }
  if (conflictingUids.length > 0 || !hideEmpty) {
    statusSpecs.push({
      id: "conflicting",
      label: "Conflicting",
      color: STATUS_NEUTRAL_COLOR,
      uids: conflictingUids,
      status: "conflicting"
    });
  }
  if (statusSpecs.length > 0) {
    let mainMinX = centerBox.x - centerBox.w / 2;
    let mainMaxX = centerBox.x + centerBox.w / 2;
    let mainMaxY = centerBox.y + centerBox.h / 2;
    for (const reg of regions) {
      mainMinX = Math.min(mainMinX, reg.x - reg.w / 2);
      mainMaxX = Math.max(mainMaxX, reg.x + reg.w / 2);
      mainMaxY = Math.max(mainMaxY, reg.y + reg.h / 2);
    }
    const preparedStatus = statusSpecs.map((spec) => prepareBoxSpec(spec, { card, center, gap, maxRows, expandedRegions, focusCategory: null }));
    const statusGap = gap * 2;
    const totalStatusW = preparedStatus.reduce((sum, s) => sum + s.w, 0) + (preparedStatus.length - 1) * statusGap;
    const dockCenterX = Math.round((mainMinX + mainMaxX) / 2);
    const dockTop = mainMaxY + gap * 3;
    let curX = dockCenterX - Math.round(totalStatusW / 2);
    for (const prep of preparedStatus) {
      const rx = curX + prep.w / 2;
      const ry = dockTop + prep.h / 2;
      const mat = materializeBoxRegion(prep, rx, ry, card);
      regions.push(mat.region);
      items.push(...mat.items);
      more.push(...mat.more);
      curX += prep.w + statusGap;
    }
  }
  let minX = centerBox.x - centerBox.w / 2;
  let maxX = centerBox.x + centerBox.w / 2;
  let minY = centerBox.y - centerBox.h / 2;
  let maxY = centerBox.y + centerBox.h / 2;
  for (const reg of regions) {
    minX = Math.min(minX, reg.x - reg.w / 2);
    maxX = Math.max(maxX, reg.x + reg.w / 2);
    minY = Math.min(minY, reg.y - reg.h / 2);
    maxY = Math.max(maxY, reg.y + reg.h / 2);
  }
  return {
    center: centerBox,
    regions,
    items,
    more,
    bounds: { minX, minY, maxX, maxY },
    fallback
  };
}
function clampNum(value, low, high) {
  if (low > high) return (low + high) / 2;
  return Math.max(low, Math.min(high, value));
}
function pointInsideBox(px, py, box, margin = 0) {
  return px >= box.x - box.w / 2 - margin - 1e-6 && px <= box.x + box.w / 2 + margin + 1e-6 && py >= box.y - box.h / 2 - margin - 1e-6 && py <= box.y + box.h / 2 + margin + 1e-6;
}
function boxEncloses(outer, inner) {
  return outer.x - outer.w / 2 <= inner.x - inner.w / 2 + 1e-6 && outer.x + outer.w / 2 >= inner.x + inner.w / 2 - 1e-6 && outer.y - outer.h / 2 <= inner.y - inner.h / 2 + 1e-6 && outer.y + outer.h / 2 >= inner.y + inner.h / 2 - 1e-6;
}
function segmentHitsRect(x1, y1, x2, y2, minX, minY, maxX, maxY) {
  if (minX >= maxX || minY >= maxY) return false;
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - minX, maxX - x1, y1 - minY, maxY - y1];
  for (let i = 0; i < 4; i += 1) {
    if (Math.abs(p[i]) < 1e-9) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 <= t1;
}
function bezierAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}
function curveClearOfObstacles(cand, centerBox, targetReg, obstacles) {
  const { sx, sy, c1x, c1y, c2x, c2y, ex, ey } = cand;
  const steps = 64;
  const cMinX = centerBox.x - centerBox.w / 2 + 0.5;
  const cMaxX = centerBox.x + centerBox.w / 2 - 0.5;
  const cMinY = centerBox.y - centerBox.h / 2 + 0.5;
  const cMaxY = centerBox.y + centerBox.h / 2 - 0.5;
  const tMinX = targetReg.x - targetReg.w / 2 + 0.5;
  const tMaxX = targetReg.x + targetReg.w / 2 - 0.5;
  const tMinY = targetReg.y - targetReg.h / 2 + 0.5;
  const tMaxY = targetReg.y + targetReg.h / 2 - 0.5;
  let prevX = sx;
  let prevY = sy;
  for (let s = 1; s <= steps; s += 1) {
    const t = s / steps;
    const curX = bezierAt(sx, c1x, c2x, ex, t);
    const curY = bezierAt(sy, c1y, c2y, ey, t);
    if (segmentHitsRect(prevX, prevY, curX, curY, cMinX, cMinY, cMaxX, cMaxY)) return false;
    if (segmentHitsRect(prevX, prevY, curX, curY, tMinX, tMinY, tMaxX, tMaxY)) return false;
    for (let i = 0; i < obstacles.length; i += 1) {
      const ob = obstacles[i];
      if (segmentHitsRect(prevX, prevY, curX, curY, ob.minX, ob.minY, ob.maxX, ob.maxY)) return false;
    }
    prevX = curX;
    prevY = curY;
  }
  return true;
}
function candidateCurvesForRegion(centerBox, reg) {
  const cLeft = centerBox.x - centerBox.w / 2;
  const cRight = centerBox.x + centerBox.w / 2;
  const cTop = centerBox.y - centerBox.h / 2;
  const cBottom = centerBox.y + centerBox.h / 2;
  const padX = Math.min(18, centerBox.w / 4);
  const padY = Math.min(12, centerBox.h / 4);
  const rLeft = reg.x - reg.w / 2;
  const rRight = reg.x + reg.w / 2;
  const rTop = reg.y - reg.h / 2;
  const rBottom = reg.y + reg.h / 2;
  const facing = [];
  if (cBottom <= rTop + 1e-6) {
    facing.push({ side: "top", sep: rTop - cBottom, ex: reg.x, ey: rTop, vertical: true });
  }
  if (cTop >= rBottom - 1e-6) {
    facing.push({ side: "bottom", sep: cTop - rBottom, ex: reg.x, ey: rBottom, vertical: true });
  }
  if (cRight <= rLeft + 1e-6) {
    facing.push({ side: "left", sep: rLeft - cRight, ex: rLeft, ey: reg.y, vertical: false });
  }
  if (cLeft >= rRight - 1e-6) {
    facing.push({ side: "right", sep: cLeft - rRight, ex: rRight, ey: reg.y, vertical: false });
  }
  facing.sort((a, b) => b.sep - a.sep);
  const primary = [];
  const detours = [];
  const detourRatios = [
    [0.8, 0.9],
    [0.15, 0.25]
  ];
  for (const face of facing) {
    const { side, ex, ey, vertical } = face;
    if (vertical) {
      const fanSx = Math.round(clampNum(centerBox.x + (ex - centerBox.x) * 0.28, cLeft + padX, cRight - padX));
      const directSx = Math.round(clampNum(ex, cLeft + padX, cRight - padX));
      const sy = side === "top" ? cBottom : cTop;
      const startXs = fanSx === directSx ? [fanSx] : [fanSx, directSx];
      for (const sx of startXs) {
        const midY = Math.round((sy + (ey - sy) * 0.5) * 10) / 10;
        primary.push({ side, sx, sy, c1x: sx, c1y: midY, c2x: ex, c2y: midY, ex, ey });
        for (const [r1, r2] of detourRatios) {
          const c1y = Math.round((sy + (ey - sy) * r1) * 10) / 10;
          const c2y = Math.round((sy + (ey - sy) * r2) * 10) / 10;
          detours.push({ side, sx, sy, c1x: sx, c1y, c2x: ex, c2y, ex, ey });
        }
      }
      if (cRight <= ex - 4) {
        const lsx = cRight;
        const lsy = centerBox.y;
        const c1x = Math.round((lsx + (ex - lsx) * 0.65) * 10) / 10;
        const c2y = Math.round((lsy + (ey - lsy) * 0.35) * 10) / 10;
        detours.push({ side, sx: lsx, sy: lsy, c1x, c1y: lsy, c2x: ex, c2y, ex, ey });
      } else if (cLeft >= ex + 4) {
        const lsx = cLeft;
        const lsy = centerBox.y;
        const c1x = Math.round((lsx + (ex - lsx) * 0.65) * 10) / 10;
        const c2y = Math.round((lsy + (ey - lsy) * 0.35) * 10) / 10;
        detours.push({ side, sx: lsx, sy: lsy, c1x, c1y: lsy, c2x: ex, c2y, ex, ey });
      }
    } else {
      const sx = side === "left" ? cRight : cLeft;
      const fanSy = Math.round(clampNum(centerBox.y + (ey - centerBox.y) * 0.08, cTop + padY, cBottom - padY));
      const directSy = Math.round(clampNum(ey, cTop + padY, cBottom - padY));
      const startYs = fanSy === directSy ? [fanSy] : [fanSy, directSy];
      for (const sy of startYs) {
        const midX = Math.round((sx + (ex - sx) * 0.5) * 10) / 10;
        primary.push({ side, sx, sy, c1x: midX, c1y: sy, c2x: midX, c2y: ey, ex, ey });
        for (const [r1, r2] of detourRatios) {
          const c1x = Math.round((sx + (ex - sx) * r1) * 10) / 10;
          const c2x = Math.round((sx + (ex - sx) * r2) * 10) / 10;
          detours.push({ side, sx, sy, c1x, c1y: sy, c2x, c2y: ey, ex, ey });
        }
      }
      if (cBottom <= ey - 4) {
        const lsx = centerBox.x;
        const lsy = cBottom;
        const c1y = Math.round((lsy + (ey - lsy) * 0.65) * 10) / 10;
        const c2x = Math.round((lsx + (ex - lsx) * 0.35) * 10) / 10;
        detours.push({ side, sx: lsx, sy: lsy, c1x: lsx, c1y, c2x, c2y: ey, ex, ey });
      } else if (cTop >= ey + 4) {
        const lsx = centerBox.x;
        const lsy = cTop;
        const c1y = Math.round((lsy + (ey - lsy) * 0.65) * 10) / 10;
        const c2x = Math.round((lsx + (ex - lsx) * 0.35) * 10) / 10;
        detours.push({ side, sx: lsx, sy: lsy, c1x: lsx, c1y, c2x, c2y: ey, ex, ey });
      }
    }
  }
  return [...primary, ...detours];
}
function facetEdges(geo) {
  const centerBox = geo?.center;
  const regions = Array.isArray(geo?.regions) ? geo.regions : [];
  if (!centerBox || !regions.length) return [];
  const enclosingCenter = regions.filter((reg) => boxEncloses(reg, centerBox));
  if (enclosingCenter.length > 1) return [];
  const holderId = enclosingCenter.length === 1 ? enclosingCenter[0].id : null;
  const cardBoxes = [
    ...Array.isArray(geo?.items) ? geo.items : [],
    ...Array.isArray(geo?.more) ? geo.more : []
  ];
  const out = [];
  for (const reg of regions) {
    if (reg.status !== null && reg.status !== void 0) continue;
    if (reg.id === holderId) continue;
    if (boxEncloses(reg, centerBox)) continue;
    if (regions.some((other) => other.id !== reg.id && boxEncloses(other, reg))) continue;
    const obstacles = [];
    for (const other of regions) {
      if (other.id === reg.id) continue;
      if (other.id === holderId) {
        const hTop = other.y - other.h / 2;
        obstacles.push({
          minX: other.x - other.w / 2 + 2,
          maxX: other.x + other.w / 2 - 2,
          minY: hTop,
          maxY: hTop + REGION_HEADER_H - 4
        });
        continue;
      }
      obstacles.push({
        minX: other.x - other.w / 2 - 1.5,
        maxX: other.x + other.w / 2 + 1.5,
        minY: other.y - other.h / 2 - 1.5,
        maxY: other.y + other.h / 2 + 1.5
      });
    }
    for (const card of cardBoxes) {
      obstacles.push({
        minX: card.x - card.w / 2 - 1.5,
        maxX: card.x + card.w / 2 + 1.5,
        minY: card.y - card.h / 2 - 1.5,
        maxY: card.y + card.h / 2 + 1.5
      });
    }
    const candidates = candidateCurvesForRegion(centerBox, reg);
    let chosen = null;
    for (const cand of candidates) {
      const startInsideOther = regions.some(
        (other) => other.id !== reg.id && other.id !== holderId && pointInsideBox(cand.sx, cand.sy, other, 0.5)
      );
      if (startInsideOther) continue;
      const endInsideOther = regions.some(
        (other) => other.id !== reg.id && pointInsideBox(cand.ex, cand.ey, other, 0.5)
      );
      if (endInsideOther) continue;
      if (curveClearOfObstacles(cand, centerBox, reg, obstacles)) {
        chosen = cand;
        break;
      }
    }
    if (chosen) {
      out.push({
        regionId: reg.id,
        side: chosen.side,
        sx: chosen.sx,
        sy: chosen.sy,
        ex: chosen.ex,
        ey: chosen.ey,
        c1x: chosen.c1x,
        c1y: chosen.c1y,
        c2x: chosen.c2x,
        c2y: chosen.c2y,
        d: `M${chosen.sx},${chosen.sy} C${chosen.c1x},${chosen.c1y} ${chosen.c2x},${chosen.c2y} ${chosen.ex},${chosen.ey}`
      });
    }
  }
  return out;
}

// src/view/features/facets.js
var FOCUSABLE_SELECTOR = 'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), [tabindex="0"]';
function stripBuiltin(preset) {
  const copy = {
    id: preset.id,
    name: preset.name,
    ...preset.help ? { help: preset.help } : {},
    source: preset.source,
    ...preset.source === "attribute" ? { attribute: preset.attribute } : {},
    categories: Array.isArray(preset.categories) ? preset.categories.map((cat) => ({
      id: cat.id,
      label: cat.label,
      ...cat.color ? { color: cat.color } : {},
      ...cat.match ? { match: cat.match } : { values: [...cat.values ?? []] }
    })) : preset.categories,
    layout: preset.layout,
    edges: preset.edges,
    focusInCategory: preset.focusInCategory,
    hideEmptyStatus: preset.hideEmptyStatus
  };
  return copy;
}
function uniqueCopyPreset(source, existingPresets) {
  const taken = new Set(existingPresets.map((item) => item.id));
  const baseId = `${source.id}-copy`.replace(/[^a-z0-9-]+/g, "-");
  let nextId = baseId;
  let counter = 2;
  while (taken.has(nextId)) {
    nextId = `${baseId}-${counter}`;
    counter += 1;
  }
  const clean = stripBuiltin(source);
  return {
    ...clean,
    id: nextId,
    name: `${source.name} copy`
  };
}
function placeBox(element, box) {
  element.style.width = `${box.w}px`;
  element.style.height = `${box.h}px`;
  element.style.transform = `translate(${box.x - box.w / 2}px, ${box.y - box.h / 2}px)`;
}
function createGearIcon(svgHelper) {
  const icon = svgHelper("svg", "compass-facets-gear-icon");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("width", "14");
  icon.setAttribute("height", "14");
  icon.setAttribute("aria-hidden", "true");
  const outer = svgHelper("path");
  outer.setAttribute(
    "d",
    "M6.8 1.5h2.4l.4 1.7a5 5 0 0 1 1.2.7l1.6-.6 1.2 2.1-1.3 1.1a5 5 0 0 1 0 1.4l1.3 1.1-1.2 2.1-1.6-.6a5 5 0 0 1-1.2.7l-.4 1.7H6.8l-.4-1.7a5 5 0 0 1-1.2-.7l-1.6.6-1.2-2.1 1.3-1.1a5 5 0 0 1 0-1.4L2.4 5.4l1.2-2.1 1.6.6a5 5 0 0 1 1.2-.7l.4-1.7z"
  );
  outer.setAttribute("fill", "none");
  outer.setAttribute("stroke", "currentColor");
  outer.setAttribute("stroke-width", "1.3");
  outer.setAttribute("stroke-linejoin", "round");
  const inner = svgHelper("circle");
  inner.setAttribute("cx", "8");
  inner.setAttribute("cy", "7.2");
  inner.setAttribute("r", "2");
  inner.setAttribute("fill", "none");
  inner.setAttribute("stroke", "currentColor");
  inner.setAttribute("stroke-width", "1.3");
  icon.append(outer, inner);
  return icon;
}
function createFacets(ctx) {
  let lastClassified = null;
  let helpOpen = false;
  let currentGearBtn = null;
  let editorOpen = false;
  let returnFocusEl = null;
  const expandedByCenter = /* @__PURE__ */ new Map();
  const warnedFallbacks = /* @__PURE__ */ new Set();
  const hasDom = Boolean(ctx?.dom?.world && ctx?.dom?.root && typeof ctx?.el === "function");
  const layer = hasDom ? ctx.el("div", "compass-facets") : null;
  if (layer && ctx.lifecycle?.node) {
    ctx.lifecycle.node(layer, ctx.dom.world);
  } else if (layer) {
    ctx.dom.world.append(layer);
  }
  function updateRegionEdgeHover(activeNode) {
    if (!layer || typeof layer.querySelectorAll !== "function") return;
    const edgeGroups = layer.querySelectorAll(".compass-facet-edge");
    if (!edgeGroups.length) return;
    if (!activeNode) {
      for (const grp of edgeGroups) {
        grp.classList.toggle("is-hot", false);
        grp.classList.toggle("is-dim", false);
      }
      return;
    }
    const isCenter = activeNode.classList?.contains?.("compass-node-center");
    const hoveredRegion = activeNode.dataset?.region || "";
    for (const grp of edgeGroups) {
      const hot = Boolean(isCenter || hoveredRegion && grp.dataset?.region === hoveredRegion);
      grp.classList.toggle("is-hot", hot);
      grp.classList.toggle("is-dim", !hot);
    }
  }
  if (layer && typeof layer.addEventListener === "function") {
    const onOver = (event) => {
      const node = event.target?.closest?.(".compass-node") ?? null;
      updateRegionEdgeHover(node);
    };
    const onOut = (event) => {
      const next = event.relatedTarget?.closest?.(".compass-node") ?? null;
      if (!next || !layer.contains?.(next)) updateRegionEdgeHover(null);
    };
    if (ctx.lifecycle?.event) {
      ctx.lifecycle.event(layer, "pointerover", onOver);
      ctx.lifecycle.event(layer, "pointerout", onOut);
    } else {
      layer.addEventListener("pointerover", onOver);
      layer.addEventListener("pointerout", onOut);
    }
  }
  let backdrop = null;
  let dialogEl = null;
  let listEl = null;
  let jsonArea = null;
  let errorsEl = null;
  let loadedJsonSnapshot = "";
  function readCustomList(settingsOverride = null) {
    const settings = settingsOverride ?? ctx?.state?.settings;
    if (Array.isArray(settings?.facetsPresets)) return settings.facetsPresets;
    const raw = ctx?.extensionAPI?.settings?.get?.(SETTING_IDS.facetsPresets);
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return [];
      }
    }
    return [];
  }
  function viewSelection(settingsOverride = null) {
    const views = ctx?.features?.get?.("views");
    if (typeof views?.current === "function") {
      const cur = views.current();
      if (cur && typeof cur.view === "string") {
        return {
          view: cur.view,
          preset: cur.preset || settingsOverride?.facetsPreset || ctx?.state?.settings?.facetsPreset || "roles"
        };
      }
    }
    const settings = settingsOverride ?? ctx?.state?.settings;
    return {
      view: settings?.view || "compass",
      preset: settings?.facetsPreset || "roles"
    };
  }
  async function selectPreset(id) {
    const views = ctx?.features?.get?.("views");
    if (typeof views?.set === "function") {
      await views.set("facets", id);
      return;
    }
    await ctx?.saveSetting?.(SETTING_IDS.view, "facets");
    await ctx?.saveSetting?.(SETTING_IDS.facetsPreset, id);
    ctx?.rebuild?.();
    ctx?.render?.();
    ctx?.fit?.(true);
  }
  function expandedSetFor(centerUid, presetId = "") {
    if (!centerUid) return null;
    const key = `${centerUid}\0${presetId}`;
    if (!expandedByCenter.has(key)) expandedByCenter.set(key, /* @__PURE__ */ new Set());
    return expandedByCenter.get(key);
  }
  function presets() {
    return allPresets(readCustomList()).map(({ id, name, builtin }) => ({ id, name, builtin }));
  }
  function classified() {
    if (viewSelection().view !== "facets") return null;
    return lastClassified;
  }
  function clearView() {
    lastClassified = null;
    currentGearBtn = null;
    if (layer) layer.replaceChildren();
  }
  function renderErrors(messages) {
    if (!errorsEl) return;
    errorsEl.replaceChildren();
    if (!messages?.length) {
      errorsEl.hidden = true;
      return;
    }
    for (const msg of messages) {
      errorsEl.append(ctx.el("li", "compass-facets-error", msg));
    }
    errorsEl.hidden = false;
  }
  function setEditorJson(presetObj) {
    if (!jsonArea) return;
    const formatted = JSON.stringify(presetObj, null, 2);
    jsonArea.value = formatted;
    loadedJsonSnapshot = formatted;
    renderErrors([]);
  }
  function refreshEditorList(selectedId = null) {
    if (!listEl) return;
    listEl.replaceChildren();
    const list = allPresets(readCustomList());
    const activeId = selectedId ?? findPreset(list, viewSelection().preset).id;
    for (const item of list) {
      const row = ctx.el(
        "div",
        `compass-facets-preset-row${item.id === activeId ? " is-selected" : ""}`
      );
      row.dataset.presetId = item.id;
      const info = ctx.el("div", "compass-facets-preset-info");
      const titleBtn = ctx.button("compass-facets-preset-select", item.name, `Use ${item.name}`);
      titleBtn.addEventListener("click", () => {
        ctx.guard(async () => {
          await selectPreset(item.id);
          refreshEditorList(item.id);
        })();
      });
      const badge = ctx.el("span", "compass-facets-preset-badge", item.builtin ? "Built-in" : "Custom");
      info.append(titleBtn, badge);
      const actions = ctx.el("div", "compass-facets-preset-actions");
      if (!item.builtin) {
        const editBtn = ctx.button("compass-facets-action-edit", "Edit", `Edit ${item.name}`);
        editBtn.addEventListener("click", () => {
          setEditorJson(stripBuiltin(item));
          jsonArea?.focus();
        });
        actions.append(editBtn);
      }
      const dupBtn = ctx.button("compass-facets-action-duplicate", "Duplicate", `Duplicate ${item.name}`);
      dupBtn.addEventListener("click", () => {
        const copy = uniqueCopyPreset(item, list);
        setEditorJson(copy);
        jsonArea?.focus();
      });
      actions.append(dupBtn);
      if (!item.builtin) {
        const delBtn = ctx.button("compass-facets-action-delete", "Delete", `Delete ${item.name}`);
        delBtn.addEventListener("click", () => {
          ctx.guard(async () => {
            const rawList = readCustomList();
            const nextList = rawList.filter((entry) => {
              const checked = validatePreset(entry);
              const entryId = checked.ok ? checked.preset.id : entry?.id;
              return entryId !== item.id;
            });
            await ctx?.saveSetting?.(SETTING_IDS.facetsPresets, nextList);
            const wasSelected = viewSelection().preset === item.id;
            if (wasSelected) {
              await selectPreset(BUILTIN_PRESETS[0].id);
            } else {
              ctx?.render?.();
            }
            const updatedAll = allPresets(nextList);
            const fallbackActive = findPreset(updatedAll, wasSelected ? BUILTIN_PRESETS[0].id : viewSelection().preset);
            setEditorJson(fallbackActive.builtin ? uniqueCopyPreset(fallbackActive, updatedAll) : stripBuiltin(fallbackActive));
            refreshEditorList(fallbackActive.id);
          })();
        });
        actions.append(delBtn);
      }
      row.append(info, actions);
      listEl.append(row);
    }
  }
  async function handleSavePreset() {
    if (!jsonArea) return;
    const rawText = jsonArea.value.trim();
    if (!rawText) {
      renderErrors(["Paste or write a preset JSON object before saving."]);
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      renderErrors(["Invalid JSON. Check quotes, commas, and brackets."]);
      return;
    }
    const checked = validatePreset(parsed);
    if (!checked.ok) {
      renderErrors(checked.errors);
      return;
    }
    renderErrors([]);
    const saved = checked.preset;
    const existingValid = [];
    for (const item of readCustomList()) {
      const res = validatePreset(item);
      if (res.ok) existingValid.push(res.preset);
    }
    const idx = existingValid.findIndex((item) => item.id === saved.id);
    if (idx >= 0) existingValid[idx] = saved;
    else existingValid.push(saved);
    await ctx?.saveSetting?.(SETTING_IDS.facetsPresets, existingValid);
    await selectPreset(saved.id);
    setEditorJson(stripBuiltin(saved));
    refreshEditorList(saved.id);
    ctx?.setStatus?.(`Saved preset "${saved.name}".`);
  }
  function closePresetEditor({ restoreFocus = true } = {}) {
    if (!editorOpen || !backdrop) return;
    editorOpen = false;
    backdrop.hidden = true;
    renderErrors([]);
    if (!restoreFocus) return;
    const target = currentGearBtn?.isConnected ? currentGearBtn : returnFocusEl;
    if (target && typeof target.focus === "function") {
      target.focus({ preventScroll: true });
    }
  }
  function ensureDialog() {
    if (backdrop || !hasDom) return;
    backdrop = ctx.el("div", "compass-facets-backdrop");
    backdrop.hidden = true;
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "Facets presets");
    dialogEl = ctx.el("div", "compass-facets-dialog");
    const head = ctx.el("div", "compass-facets-dialog-head");
    const title = ctx.el("h2", "compass-facets-dialog-title", "Facets presets");
    const closeBtn = ctx.button("compass-facets-dialog-close", "×", "Close preset editor");
    head.append(title, closeBtn);
    const body = ctx.el("div", "compass-facets-dialog-body");
    const sidebar = ctx.el("div", "compass-facets-dialog-sidebar");
    const sidebarLabel = ctx.el("div", "compass-facets-section-label", "Presets");
    listEl = ctx.el("div", "compass-facets-preset-list");
    sidebar.append(sidebarLabel, listEl);
    const editorPane = ctx.el("div", "compass-facets-dialog-editor");
    const editorLabel = ctx.el("div", "compass-facets-section-label", "Preset JSON");
    jsonArea = ctx.el("textarea", "compass-facets-json");
    jsonArea.rows = 14;
    jsonArea.spellcheck = false;
    jsonArea.setAttribute("aria-label", "Preset JSON");
    errorsEl = ctx.el("ul", "compass-facets-errors");
    errorsEl.hidden = true;
    const actionRow = ctx.el("div", "compass-facets-editor-actions");
    const saveBtn = ctx.button("compass-facets-save", "Save");
    const cancelBtn = ctx.button("compass-facets-cancel", "Cancel");
    const copyBtn = ctx.button("compass-facets-copy", "Copy JSON");
    const importBtn = ctx.button("compass-facets-import", "Import");
    actionRow.append(saveBtn, cancelBtn, copyBtn, importBtn);
    editorPane.append(editorLabel, jsonArea, errorsEl, actionRow);
    body.append(sidebar, editorPane);
    dialogEl.append(head, body);
    backdrop.append(dialogEl);
    if (ctx.lifecycle?.node) ctx.lifecycle.node(backdrop, ctx.dom.root);
    else ctx.dom.root.append(backdrop);
    const register = (target, event, handler) => {
      if (ctx.lifecycle?.event) ctx.lifecycle.event(target, event, handler);
      else target.addEventListener(event, handler);
    };
    register(backdrop, "pointerdown", (event) => {
      event.stopPropagation();
    });
    register(backdrop, "click", (event) => {
      if (event.target === backdrop) closePresetEditor();
    });
    register(closeBtn, "click", () => closePresetEditor());
    register(cancelBtn, "click", () => closePresetEditor());
    register(saveBtn, "click", ctx.guard(() => handleSavePreset()));
    register(copyBtn, "click", ctx.guard(async () => {
      const ok = await copyText(jsonArea.value);
      ctx?.setStatus?.(ok ? "Copied preset JSON." : "Could not copy JSON.");
    }));
    register(importBtn, "click", ctx.guard(async () => {
      let clip = "";
      if (typeof globalThis.navigator?.clipboard?.readText === "function") {
        try {
          clip = await globalThis.navigator.clipboard.readText() ?? "";
        } catch {
          clip = "";
        }
      }
      if (clip.trim() && clip.trim() !== jsonArea.value.trim()) {
        jsonArea.value = clip;
        loadedJsonSnapshot = "";
        renderErrors([]);
        jsonArea.focus();
        ctx?.setStatus?.("Imported JSON from clipboard. Review and press Save.");
      } else if (jsonArea.value.trim() && jsonArea.value !== loadedJsonSnapshot) {
        await handleSavePreset();
      } else {
        jsonArea.value = "";
        loadedJsonSnapshot = "";
        jsonArea.placeholder = "Paste preset JSON here, then press Save.";
        renderErrors([]);
        jsonArea.focus();
      }
    }));
    register(backdrop, "keydown", (event) => {
      if (!editorOpen) return;
      if (event.key === "Escape") return;
      if (event.key === "Tab") {
        const focusable = [...dialogEl.querySelectorAll(FOCUSABLE_SELECTOR)].filter((item) => !item.hidden && item.offsetParent !== null);
        if (focusable.length) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const active = globalThis.document?.activeElement;
          if (event.shiftKey) {
            if (active === first || !dialogEl.contains(active)) {
              event.preventDefault();
              last.focus();
            }
          } else if (active === last || !dialogEl.contains(active)) {
            event.preventDefault();
            first.focus();
          }
        }
        event.stopPropagation();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.stopPropagation();
        return;
      }
      if (event.target !== jsonArea && event.key !== "Enter" && event.key !== " ") {
        event.stopPropagation();
      }
    });
  }
  function openPresetEditor() {
    ensureDialog();
    if (!backdrop) return;
    returnFocusEl = globalThis.document?.activeElement ?? null;
    const list = allPresets(readCustomList());
    const active = findPreset(list, viewSelection().preset);
    setEditorJson(active.builtin ? uniqueCopyPreset(active, list) : stripBuiltin(active));
    refreshEditorList(active.id);
    backdrop.hidden = false;
    editorOpen = true;
    jsonArea?.focus({ preventScroll: true });
  }
  function buildCenterCard(hood, box) {
    const element = ctx.el("div", "compass-node compass-node-center");
    element.dataset.uid = hood.center.uid;
    element.dataset.key = `center:${hood.center.uid}`;
    element.dataset.zone = "center";
    element.dataset.style = "center";
    element.dataset.kind = hood.center.kind;
    element.tabIndex = 0;
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", `Center: ${hood.center.title}`);
    element.title = hood.center.title;
    const head = ctx.el("div", "compass-center-head");
    const kind = ctx.el("span", "compass-kind", hood.center.kind === "block" ? "Block" : "Page");
    const title = ctx.el("span", "compass-node-title", hood.center.title);
    head.append(kind, title);
    element.append(head);
    placeBox(element, box);
    return element;
  }
  function buildHeader(preset, contentBounds) {
    const header = ctx.el("div", "compass-facets-header");
    const row = ctx.el("div", "compass-facets-header-row");
    const title = ctx.el("span", "compass-facets-title", preset.name);
    const helpBtn = ctx.button("compass-facets-help-toggle", "?", "Toggle preset help");
    helpBtn.setAttribute("aria-pressed", helpOpen ? "true" : "false");
    helpBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      helpOpen = !helpOpen;
      ctx?.render?.();
    });
    const gearBtn = ctx.button("compass-facets-gear", "", "Edit presets");
    gearBtn.append(createGearIcon(ctx.svg));
    gearBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPresetEditor();
    });
    currentGearBtn = gearBtn;
    row.append(title, helpBtn, gearBtn);
    header.append(row);
    const helpText = preset.help || "Custom facets preset.";
    if (helpOpen) {
      header.append(ctx.el("p", "compass-facets-help", helpText));
    }
    header.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    const reserveH = helpOpen ? 76 : 44;
    const headerX = contentBounds.minX;
    const headerY = contentBounds.minY - reserveH;
    header.style.transform = `translate(${headerX}px, ${headerY}px)`;
    return {
      element: header,
      bounds: {
        minX: Math.min(contentBounds.minX, headerX),
        minY: headerY,
        maxX: Math.max(contentBounds.maxX, headerX + 280),
        maxY: contentBounds.maxY
      }
    };
  }
  function renderView({ hood, settings }) {
    const state = viewSelection(settings);
    if (state.view !== "facets") {
      clearView();
      return null;
    }
    if (!hood || !layer) return null;
    const list = allPresets(readCustomList(settings));
    const preset = findPreset(list, state.preset);
    const neighbors = (hood.nodes ?? []).filter((node) => node && node.kind !== "group");
    layer.replaceChildren();
    if (neighbors.length === 0) {
      lastClassified = classify(preset, []);
      const centerBox = { x: 0, y: 0, w: 240, h: 56 };
      const emptyEl = ctx.el("p", "compass-facets-empty", "Nothing is connected here yet.");
      emptyEl.style.transform = `translate(-160px, ${centerBox.h / 2 + 28}px)`;
      const rawBounds = { minX: -160, minY: -centerBox.h / 2, maxX: 160, maxY: centerBox.h / 2 + 64 };
      const header2 = buildHeader(preset, rawBounds);
      layer.append(header2.element, buildCenterCard(hood, centerBox), emptyEl);
      return {
        view: "facets",
        geometry: {
          center: centerBox,
          items: [],
          rows: [],
          chips: [],
          more: false,
          bounds: header2.bounds,
          nodes: []
        }
      };
    }
    const queryNodes = hood.center?.uid ? [hood.center, ...neighbors] : neighbors;
    const factsMap = ctx.facts(queryNodes);
    const neighborFacts = neighbors.map((node) => factsMap.get(node.uid)).filter(Boolean);
    const result = classify(preset, neighborFacts);
    lastClassified = result;
    let focusCategory = null;
    if (preset.focusInCategory && hood.center?.uid) {
      const centerFact = factsMap.get(hood.center.uid);
      focusCategory = centerCategory(preset, centerFact, result.categories);
    }
    const expandedRegions = expandedSetFor(hood.center?.uid, preset.id);
    const geo = layoutFacets(result, { focusCategory, expandedRegions });
    if (geo.fallback === "circular" && !warnedFallbacks.has(preset.id)) {
      warnedFallbacks.add(preset.id);
      ctx?.setStatus?.("Quadrants needs four categories. Showing a circle instead.");
    }
    const isConcentric = preset.layout === "concentric" && !geo.fallback;
    const orderedRegions = isConcentric ? [
      ...[...geo.regions.filter((reg) => reg.status === null)].reverse(),
      ...geo.regions.filter((reg) => reg.status !== null)
    ] : geo.regions;
    const regionContainer = ctx.el("div", "compass-facets-regions");
    for (const reg of orderedRegions) {
      const classes = ["compass-facet-region"];
      if (reg.status) classes.push("compass-facet-region-status");
      if (isConcentric && !reg.status) classes.push("compass-facet-region-ring");
      const regEl = ctx.el("div", classes.join(" "));
      regEl.dataset.paint = "region";
      regEl.dataset.region = reg.id;
      if (reg.status) regEl.dataset.status = reg.status;
      else if (reg.color) regEl.style.setProperty("--compass-facet-color", reg.color);
      const labelEl = ctx.el("div", "compass-region-label");
      const nameSpan = ctx.el("span", "compass-region-name", reg.label);
      const countSpan = ctx.el("span", "compass-region-count", String(reg.count));
      labelEl.append(nameSpan, " ", countSpan);
      regEl.append(labelEl);
      placeBox(regEl, reg);
      regionContainer.append(regEl);
    }
    layer.append(regionContainer);
    const regionCurves = preset.edges !== false ? facetEdges(geo) : [];
    if (regionCurves.length > 0) {
      const edgeSvg = ctx.svg("svg", "compass-edges compass-facets-edges");
      edgeSvg.setAttribute("width", "1");
      edgeSvg.setAttribute("height", "1");
      for (const edge of regionCurves) {
        const group = ctx.svg("g", "compass-facet-edge");
        group.dataset.region = edge.regionId;
        const line = ctx.svg("path", "compass-edge-line");
        line.setAttribute("d", edge.d);
        group.append(line);
        edgeSvg.append(group);
      }
      layer.append(edgeSvg);
    }
    const nodeByUid = new Map(neighbors.map((node) => [node.uid, node]));
    const catLabelById = new Map(result.categories.map((cat) => [cat.id, cat.label]));
    const hiddenByLenses = ctx?.features?.get?.("lenses")?.hiddenFor?.(neighbors);
    const drawnNodes = [];
    layer.append(buildCenterCard(hood, geo.center));
    for (const item of geo.items) {
      const node = nodeByUid.get(item.uid);
      if (!node) continue;
      drawnNodes.push(node);
      const cardEl = ctx.el("div", "compass-node compass-facet-card");
      cardEl.dataset.uid = node.uid;
      cardEl.dataset.key = item.key;
      cardEl.dataset.zone = node.zone;
      cardEl.dataset.region = item.zone;
      cardEl.dataset.style = node.style;
      cardEl.dataset.kind = node.kind;
      cardEl.tabIndex = 0;
      cardEl.setAttribute("role", "button");
      if (hiddenByLenses instanceof Set && hiddenByLenses.has(node.uid)) {
        cardEl.classList.add("compass-fade");
      }
      const visibleTitle = typeof node.alias === "string" && node.alias ? node.alias : node.title;
      cardEl.append(ctx.el("span", "compass-node-title", visibleTitle));
      const matchedIds = result.matches?.[node.uid];
      if (Array.isArray(matchedIds) && matchedIds.length > 1) {
        const matchedLabels = matchedIds.map((id) => catLabelById.get(id) || id).join(", ");
        cardEl.title = `${node.title} — Matches: ${matchedLabels}`;
        cardEl.setAttribute("aria-label", `${node.title}, Conflicting (${matchedLabels})`);
      } else {
        const why = node.label ? ` — ${node.label}` : "";
        cardEl.title = `${node.title}${why}`;
        cardEl.setAttribute("aria-label", `${node.title}${why}`);
      }
      placeBox(cardEl, item);
      layer.append(cardEl);
    }
    for (const slot of geo.more) {
      const moreBtn = ctx.button("compass-facet-more", `+${slot.count} more`, `Show ${slot.count} more`);
      moreBtn.dataset.region = slot.regionId;
      moreBtn.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      moreBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const set = expandedSetFor(hood.center?.uid, preset.id);
        if (set) set.add(slot.regionId);
        ctx?.render?.();
        ctx?.fit?.(true);
      });
      placeBox(moreBtn, slot);
      layer.append(moreBtn);
    }
    const header = buildHeader(preset, geo.bounds);
    layer.prepend(header.element);
    return {
      view: "facets",
      geometry: {
        center: geo.center,
        items: geo.items,
        rows: [],
        chips: [],
        more: false,
        bounds: header.bounds,
        nodes: drawnNodes
      }
    };
  }
  function commands() {
    const list = allPresets(readCustomList());
    return [
      {
        id: "facets-edit",
        title: "Facets: edit presets",
        hint: "",
        run: () => openPresetEditor()
      },
      ...list.map((preset) => ({
        id: `facets-preset-${preset.id}`,
        title: `Facets: ${preset.name}`,
        hint: "",
        run: () => selectPreset(preset.id)
      }))
    ];
  }
  function stageMenu() {
    const state = viewSelection();
    if (state.view !== "facets") return [];
    const list = allPresets(readCustomList());
    const active = findPreset(list, state.preset);
    return [
      ...list.map((preset) => {
        const base = `Facets preset: ${preset.name}`;
        return {
          title: preset.id === active.id ? `✓ ${base}` : base,
          run: () => selectPreset(preset.id)
        };
      }),
      {
        title: "Edit presets…",
        run: () => openPresetEditor()
      }
    ];
  }
  function onEscape() {
    if (!editorOpen) return false;
    closePresetEditor({ restoreFocus: true });
    return true;
  }
  function onClose() {
    closePresetEditor({ restoreFocus: false });
    helpOpen = false;
    clearView();
  }
  function onSettings(settings) {
    if (editorOpen) {
      const list = allPresets(readCustomList(settings));
      const active = findPreset(list, viewSelection(settings).preset);
      refreshEditorList(active.id);
    }
  }
  return {
    name: "facets",
    presets,
    classified,
    openPresetEditor,
    renderView,
    clearView,
    commands,
    stageMenu,
    onEscape,
    onClose,
    onSettings
  };
}

// src/model/lens.js
var FIELDS = Object.freeze({
  node: Object.freeze([
    Object.freeze({ field: "title", label: "Title" }),
    Object.freeze({ field: "kind", label: "Kind" }),
    Object.freeze({ field: "type", label: "Type" }),
    Object.freeze({ field: "attr:", label: "Attribute…" })
  ]),
  relationship: Object.freeze([
    Object.freeze({ field: "role", label: "Role" }),
    Object.freeze({ field: "zone", label: "Zone" }),
    Object.freeze({ field: "style", label: "Style" }),
    Object.freeze({ field: "label", label: "Label" })
  ])
});
var OPERATORS = Object.freeze([
  Object.freeze({ op: "is", label: "Is", needsValue: true }),
  Object.freeze({ op: "is-not", label: "Is not", needsValue: true }),
  Object.freeze({ op: "contains", label: "Contains", needsValue: true }),
  Object.freeze({ op: "not-contains", label: "Does not contain", needsValue: true }),
  Object.freeze({ op: "exists", label: "Exists", needsValue: false }),
  Object.freeze({ op: "missing", label: "Missing", needsValue: false })
]);
var EXAMPLE_LENSES = Object.freeze([
  Object.freeze({
    id: "typed-only",
    name: "Typed relations only",
    enabled: false,
    scope: "relationship",
    effect: "hide",
    match: Object.freeze({
      any: Object.freeze([
        Object.freeze({ field: "style", op: "is", value: "link" }),
        Object.freeze({ field: "style", op: "is", value: "mention" })
      ])
    }),
    style: Object.freeze({ fill: "", border: "", text: "" })
  }),
  Object.freeze({
    id: "highlight-challengers",
    name: "Highlight challengers",
    enabled: false,
    scope: "relationship",
    effect: "style",
    match: Object.freeze({
      any: Object.freeze([
        Object.freeze({ field: "role", op: "is", value: "challenger" }),
        Object.freeze({ field: "role", op: "is", value: "next" })
      ])
    }),
    style: Object.freeze({ fill: "", border: "#ea580c", text: "" })
  }),
  Object.freeze({
    id: "tasks",
    name: "Tasks",
    enabled: false,
    scope: "node",
    effect: "show",
    match: Object.freeze({
      all: Object.freeze([
        Object.freeze({ field: "type", op: "is", value: "Task" })
      ])
    }),
    style: Object.freeze({ fill: "", border: "", text: "" })
  })
]);
var VALID_ID = /^[a-z0-9-]+$/;
var SCOPES = /* @__PURE__ */ new Set(["node", "relationship"]);
var EFFECTS = /* @__PURE__ */ new Set(["show", "hide", "style"]);
var DIRECT_FIELDS = /* @__PURE__ */ new Set(["title", "kind", "group", "type", "role", "zone", "style", "label"]);
var OPERATOR_BY_OP = new Map(OPERATORS.map((item) => [item.op, item]));
var COLOR_CHARS = /^[A-Za-z0-9#(),.% ]+$/;
var HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
var FUNC_COLOR = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\((?=.*[0-9])[A-Za-z0-9,%. ]+\)$/i;
function isPlainObject2(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function slugLensId(name, existingIds = []) {
  const base = String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "lens";
  const taken = existingIds instanceof Set ? existingIds : new Set(Array.isArray(existingIds) ? existingIds : []);
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
function isValidColor(value) {
  if (!value || value.length > 40) return false;
  if (!COLOR_CHARS.test(value)) return false;
  return HEX_COLOR.test(value) || FUNC_COLOR.test(value);
}
function normalizeCondition(raw, errors) {
  if (!isPlainObject2(raw)) {
    errors.push("Each condition must be an object.");
    return null;
  }
  const rawField = typeof raw.field === "string" ? raw.field.trim() : "";
  let field = "";
  if (rawField.startsWith("attr:")) {
    const attrName = rawField.slice(5).trim();
    if (!attrName) errors.push("Enter an attribute name.");
    else field = `attr:${attrName}`;
  } else if (DIRECT_FIELDS.has(rawField)) {
    field = rawField;
  } else {
    errors.push("Choose a valid condition field.");
  }
  const rawOp = typeof raw.op === "string" ? raw.op.trim() : "";
  const operator = OPERATOR_BY_OP.get(rawOp);
  if (!operator) {
    errors.push("Choose a valid operator.");
    return null;
  }
  if (!operator.needsValue) {
    return field ? { field, op: operator.op } : null;
  }
  const value = typeof raw.value === "string" ? raw.value.trim() : "";
  if (!value) {
    errors.push("Enter a value for every condition.");
    return null;
  }
  return field ? { field, op: operator.op, value } : null;
}
function validateLens(raw) {
  if (!isPlainObject2(raw)) return { ok: false, errors: ["Lens must be an object."] };
  const errors = [];
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) errors.push("Enter a name for the lens.");
  let id = "";
  if (raw.id === void 0) {
    id = slugLensId(name);
  } else if (typeof raw.id === "string" && VALID_ID.test(raw.id.trim())) {
    id = raw.id.trim();
  } else {
    errors.push("Lens ID may only use lowercase letters, digits, and hyphens.");
  }
  let enabled = false;
  if (raw.enabled !== void 0) {
    if (typeof raw.enabled === "boolean") enabled = raw.enabled;
    else errors.push("Enabled must be true or false.");
  }
  let scope = "node";
  if (raw.scope !== void 0) {
    if (SCOPES.has(raw.scope)) scope = raw.scope;
    else errors.push("Scope must be node or relationship.");
  }
  const effect = typeof raw.effect === "string" ? raw.effect.trim() : "";
  if (!EFFECTS.has(effect)) errors.push("Effect must be show, hide, or style.");
  const match = {};
  if (!isPlainObject2(raw.match)) {
    errors.push("Match rules are required.");
  } else {
    const hasAll = raw.match.all !== void 0;
    const hasAny = raw.match.any !== void 0;
    if (hasAll && !Array.isArray(raw.match.all)) errors.push("Match all must be a list.");
    if (hasAny && !Array.isArray(raw.match.any)) errors.push("Match any must be a list.");
    const rawAll = Array.isArray(raw.match.all) ? raw.match.all : [];
    const rawAny = Array.isArray(raw.match.any) ? raw.match.any : [];
    if (!rawAll.length && !rawAny.length) {
      errors.push("Add at least one condition.");
    } else {
      const all = rawAll.map((item) => normalizeCondition(item, errors)).filter(Boolean);
      const any = rawAny.map((item) => normalizeCondition(item, errors)).filter(Boolean);
      if (all.length) match.all = all;
      if (any.length) match.any = any;
    }
  }
  const style = { fill: "", border: "", text: "" };
  if (raw.style !== void 0 && !isPlainObject2(raw.style)) {
    errors.push("Style must be an object.");
  } else if (raw.style) {
    for (const key of ["fill", "border", "text"]) {
      const rawColor = raw.style[key];
      if (rawColor === void 0 || rawColor === "") continue;
      if (typeof rawColor !== "string") {
        errors.push(`Invalid ${key} color.`);
        continue;
      }
      const trimmed = rawColor.trim();
      if (!trimmed) continue;
      if (!isValidColor(trimmed)) {
        errors.push(`Invalid ${key} color.`);
      } else {
        style[key] = trimmed;
      }
    }
  }
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  return {
    ok: true,
    lens: { id, name, enabled, scope, effect, match, style }
  };
}
function normalizeLenses(list) {
  if (!Array.isArray(list)) return [];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const item of list) {
    const result = validateLens(item);
    if (!result.ok || seen.has(result.lens.id)) continue;
    seen.add(result.lens.id);
    out.push(result.lens);
  }
  return out;
}
function factEntries(facts) {
  if (!facts) return [];
  if (facts instanceof Map) return [...facts.entries()];
  if (Array.isArray(facts)) {
    const out = [];
    for (const fact of facts) {
      if (typeof fact?.uid === "string" && fact.uid) out.push([fact.uid, fact]);
    }
    return out;
  }
  if (typeof facts === "object") return Object.entries(facts);
  return [];
}
function evaluateLenses(lenses, facts) {
  const hidden = /* @__PURE__ */ new Set();
  const styles = /* @__PURE__ */ new Map();
  const entries = factEntries(facts);
  if (!entries.length) return { hidden, styles };
  const active = Array.isArray(lenses) ? lenses.filter((lens) => lens?.enabled === true) : [];
  const showLenses = active.filter((lens) => lens.effect === "show");
  const hideLenses = active.filter((lens) => lens.effect === "hide");
  const styleLenses = active.filter((lens) => lens.effect === "style");
  for (const [uid, fact] of entries) {
    if (typeof uid !== "string" || !uid || !fact || typeof fact !== "object") continue;
    if (showLenses.length > 0 && !showLenses.some((lens) => matchConditions(lens.match, fact))) {
      hidden.add(uid);
      continue;
    }
    if (hideLenses.some((lens) => matchConditions(lens.match, fact))) {
      hidden.add(uid);
      continue;
    }
    if (!styleLenses.length) continue;
    let fill = "";
    let border = "";
    let text = "";
    for (const lens of styleLenses) {
      if (!matchConditions(lens.match, fact)) continue;
      if (lens.style?.fill) fill = lens.style.fill;
      if (lens.style?.border) border = lens.style.border;
      if (lens.style?.text) text = lens.style.text;
    }
    if (fill || border || text) {
      styles.set(uid, { fill, border, text });
    }
  }
  return { hidden, styles };
}
function typeFilter(facts, selectedTypes) {
  const hidden = /* @__PURE__ */ new Set();
  const selected = selectedTypes instanceof Set ? selectedTypes : new Set(Array.isArray(selectedTypes) ? selectedTypes : []);
  if (selected.size === 0) return hidden;
  for (const [uid, fact] of factEntries(facts)) {
    if (typeof uid !== "string" || !uid || !fact || typeof fact !== "object") continue;
    const type = typeof fact.type === "string" ? fact.type : "";
    if (!selected.has(type)) hidden.add(uid);
  }
  return hidden;
}
function typesPresent(facts) {
  const counts = /* @__PURE__ */ new Map();
  for (const [, fact] of factEntries(facts)) {
    if (!fact || typeof fact !== "object") continue;
    const type = typeof fact.type === "string" ? fact.type : "";
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const named = [];
  let untypedCount = 0;
  for (const [type, count2] of counts.entries()) {
    if (type === "") untypedCount = count2;
    else named.push({ type, count: count2 });
  }
  named.sort((a, b) => b.count - a.count || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0));
  if (untypedCount > 0) named.push({ type: "", count: untypedCount });
  return named;
}
function lensToJson(lens) {
  const validated = validateLens(lens);
  return JSON.stringify(validated.ok ? validated.lens : lens, null, 2);
}
function lensFromJson(text) {
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, errors: ["Paste lens JSON to import."] };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["Invalid JSON."] };
  }
  return validateLens(parsed);
}

// src/view/features/lenses.js
var VIEW_BUTTONS = [
  ["compass", "Compass"],
  ["mindmap", "Mind Map"],
  ["facets", "Facets"]
];
var KIND_BUTTONS = [
  ["pages", "Pages"],
  ["blocks", "Blocks"],
  ["drawings", "Drawings"],
  ["regions", "Regions"]
];
var COLOR_KEYS = [
  ["fill", "Fill", "#fef3c7"],
  ["border", "Border", "#ea580c"],
  ["text", "Text", "#9a3412"]
];
var EFFECT_LABELS = {
  show: "Show",
  hide: "Hide",
  style: "Style"
};
var OPERATOR_MAP = new Map(OPERATORS.map((item) => [item.op, item]));
var SHORT_HEX = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/;
var FULL_HEX = /^#[0-9a-fA-F]{6}$/;
function pickerHex(raw, fallback) {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (FULL_HEX.test(trimmed)) return trimmed.toLowerCase();
  const short = SHORT_HEX.exec(trimmed);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return fallback;
}
function setCssVar(element, name, value) {
  if (typeof element?.style?.setProperty === "function") element.style.setProperty(name, value);
  else if (element?.style) element.style[name] = value;
}
function removeCssVar(element, name) {
  if (typeof element?.style?.removeProperty === "function") element.style.removeProperty(name);
  else if (element?.style) delete element.style[name];
}
function boxesOverlap2(a, b) {
  const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return dx > 1 && dy > 1;
}
function cloneLens(lens) {
  return {
    id: lens.id,
    name: lens.name,
    enabled: Boolean(lens.enabled),
    scope: lens.scope,
    effect: lens.effect,
    match: {
      ...Array.isArray(lens.match?.all) ? { all: lens.match.all.map((c) => ({ ...c })) } : {},
      ...Array.isArray(lens.match?.any) ? { any: lens.match.any.map((c) => ({ ...c })) } : {}
    },
    style: {
      fill: lens.style?.fill ?? "",
      border: lens.style?.border ?? "",
      text: lens.style?.text ?? ""
    }
  };
}
function conditionToDraft(cond) {
  const rawField = typeof cond?.field === "string" ? cond.field : "title";
  if (rawField.startsWith("attr:")) {
    return {
      field: "attr:",
      attrName: rawField.slice(5),
      op: OPERATOR_MAP.has(cond?.op) ? cond.op : "is",
      value: typeof cond?.value === "string" ? cond.value : ""
    };
  }
  return {
    field: rawField || "title",
    attrName: "",
    op: OPERATOR_MAP.has(cond?.op) ? cond.op : "is",
    value: typeof cond?.value === "string" ? cond.value : ""
  };
}
function makeEditorDraft(lens = null) {
  const scope = lens?.scope === "relationship" ? "relationship" : "node";
  const defaultField = FIELDS[scope][0].field;
  const rawAny = Array.isArray(lens?.match?.any) ? lens.match.any : [];
  const rawAll = Array.isArray(lens?.match?.all) ? lens.match.all : [];
  const matchMode = rawAny.length > 0 && rawAll.length === 0 ? "any" : "all";
  const sourceConds = matchMode === "any" ? rawAny : rawAll;
  const conditions = sourceConds.length ? sourceConds.map(conditionToDraft) : [{ field: defaultField, attrName: "", op: "is", value: "" }];
  const colors = {};
  for (const [key, , fallback] of COLOR_KEYS) {
    const raw = lens?.style?.[key] ?? "";
    colors[key] = {
      none: !raw,
      picker: pickerHex(raw, fallback),
      raw: raw || fallback
    };
  }
  return {
    editingId: lens?.id ?? null,
    enabled: lens ? Boolean(lens.enabled) : false,
    name: lens?.name ?? "",
    scope,
    effect: lens?.effect ?? "hide",
    matchMode,
    conditions,
    colors,
    errors: []
  };
}
function createLenses(ctx) {
  if (!ctx?.dom?.root) {
    return {
      name: "lenses",
      open() {
      },
      close() {
      },
      toggle() {
      },
      hiddenFor: () => /* @__PURE__ */ new Set()
    };
  }
  let lenses = normalizeLenses(ctx.state.settings?.lenses);
  let unfilteredNodes = null;
  const excludedTypes = /* @__PURE__ */ new Set();
  let panelOpen = false;
  let editorState = null;
  let importState = null;
  let savingCount = 0;
  const barBtn = ctx.button("compass-vl-btn", "", "Views and lenses");
  barBtn.setAttribute("aria-expanded", "false");
  const barBtnText = ctx.el("span", "compass-vl-btn-text", "Views and lenses");
  const badgeEl = ctx.el("span", "compass-vl-badge");
  badgeEl.hidden = true;
  barBtn.append(barBtnText, badgeEl);
  ctx.addBarButton(barBtn);
  const panel = ctx.el("div", "compass-vl-panel");
  panel.hidden = true;
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Views and lenses");
  const head = ctx.el("div", "compass-vl-head");
  const titleEl = ctx.el("p", "compass-vl-title", "Views and lenses");
  const closeBtn = ctx.button("compass-vl-close", "×", "Close panel");
  head.append(titleEl, closeBtn);
  const viewSec = ctx.el("section", "compass-vl-section");
  viewSec.dataset.section = "views";
  const viewHead = ctx.el("div", "compass-vl-section-head");
  viewHead.append(ctx.el("h3", "compass-vl-heading", "Canvas view"));
  const viewSeg = ctx.el("div", "compass-vl-seg");
  const viewBtnMap = /* @__PURE__ */ new Map();
  for (const [viewId, label] of VIEW_BUTTONS) {
    const btn = ctx.button("", label);
    btn.dataset.view = viewId;
    btn.setAttribute("aria-pressed", "false");
    viewBtnMap.set(viewId, btn);
    viewSeg.append(btn);
  }
  const facetsRow = ctx.el("div", "compass-vl-facets-row");
  facetsRow.hidden = true;
  const presetSelect = ctx.el("select", "compass-vl-preset-select");
  presetSelect.setAttribute("aria-label", "Facets preset");
  const editPresetsBtn = ctx.button("compass-vl-preset-edit", "Edit presets…");
  facetsRow.append(presetSelect, editPresetsBtn);
  viewSec.append(viewHead, viewSeg, facetsRow);
  const qfSec = ctx.el("section", "compass-vl-section");
  qfSec.dataset.section = "quick-filter";
  const qfHead = ctx.el("div", "compass-vl-section-head");
  qfHead.append(ctx.el("h3", "compass-vl-heading", "Quick filter"));
  const clearBtn = ctx.button("compass-qf-clear", "Clear");
  qfHead.append(clearBtn);
  const keywordInput = ctx.el("input", "compass-qf-keyword");
  keywordInput.type = "search";
  keywordInput.autocomplete = "off";
  keywordInput.placeholder = "Filter by title";
  keywordInput.setAttribute("aria-label", "Filter by keyword");
  const kindRow = ctx.el("div", "compass-qf-chips");
  const kindBtnMap = /* @__PURE__ */ new Map();
  for (const [kindKey, label] of KIND_BUTTONS) {
    const btn = ctx.button("compass-qf-chip", label);
    btn.dataset.kind = kindKey;
    btn.setAttribute("aria-pressed", "true");
    kindBtnMap.set(kindKey, btn);
    kindRow.append(btn);
  }
  const typeRow = ctx.el("div", "compass-qf-types");
  typeRow.hidden = true;
  qfSec.append(qfHead, keywordInput, kindRow, typeRow);
  const reflowSec = ctx.el("section", "compass-vl-section");
  reflowSec.dataset.section = "after-filtering";
  const reflowHead = ctx.el("div", "compass-vl-section-head");
  reflowHead.append(ctx.el("h3", "compass-vl-heading", "After filtering"));
  const radiosWrap = ctx.el("div", "compass-qf-radios");
  const keepLabel = ctx.el("label", "compass-qf-radio");
  const keepRadio = ctx.el("input");
  keepRadio.type = "radio";
  keepRadio.name = "compass-after-filtering";
  keepRadio.value = "keep";
  keepLabel.append(keepRadio, ctx.el("span", "", "Keep layout"));
  const reflowLabel = ctx.el("label", "compass-qf-radio");
  const reflowRadio = ctx.el("input");
  reflowRadio.type = "radio";
  reflowRadio.name = "compass-after-filtering";
  reflowRadio.value = "reflow";
  reflowLabel.append(reflowRadio, ctx.el("span", "", "Reflow"));
  radiosWrap.append(keepLabel, reflowLabel);
  reflowSec.append(reflowHead, radiosWrap);
  const lensesSec = ctx.el("section", "compass-vl-section");
  lensesSec.dataset.section = "lenses";
  const lensesHead = ctx.el("div", "compass-vl-section-head");
  lensesHead.append(ctx.el("h3", "compass-vl-heading", "Lenses"));
  const lensEmpty = ctx.el("p", "compass-gl-empty", "No saved lenses yet.");
  const lensList = ctx.el("div", "compass-gl-list");
  const lensFooter = ctx.el("div", "compass-gl-footer");
  const newLensBtn = ctx.button("compass-gl-new", "New lens");
  const importBtn = ctx.button("compass-gl-import-open", "Import");
  const examplesBtn = ctx.button("compass-gl-examples", "Add examples");
  lensFooter.append(newLensBtn, importBtn, examplesBtn);
  const editorWrap = ctx.el("div", "compass-gl-editor");
  editorWrap.hidden = true;
  const importWrap = ctx.el("div", "compass-gl-import");
  importWrap.hidden = true;
  lensesSec.append(lensesHead, lensEmpty, lensList, lensFooter, editorWrap, importWrap);
  panel.append(head, viewSec, qfSec, reflowSec, lensesSec);
  ctx.lifecycle.node(panel, ctx.dom.root);
  function mapNeighborNodes() {
    const viewName = ctx.dom.root.dataset?.view || "compass";
    const geoNodes = ctx.state.geometry?.nodes;
    if (viewName !== "compass" && !ctx.state.settings?.filterReflow && Array.isArray(geoNodes)) {
      const centerUid = ctx.state.hood?.center?.uid ?? ctx.state.current;
      return geoNodes.filter((node) => node && node.uid !== centerUid);
    }
    return unfilteredNodes ?? ctx.state.hood?.nodes ?? [];
  }
  function activeTypeHidden(facts) {
    if (excludedTypes.size === 0) return typeFilter(facts, /* @__PURE__ */ new Set());
    const known = /* @__PURE__ */ new Set();
    for (const entry of typesPresent(facts)) known.add(entry.type);
    const baseNodes = unfilteredNodes ?? ctx.state.hood?.nodes ?? [];
    if (baseNodes.length) {
      for (const entry of typesPresent(ctx.facts(baseNodes))) known.add(entry.type);
    }
    const selected = new Set([...known].filter((type) => !excludedTypes.has(type)));
    if (selected.size === 0) return typeFilter(facts, /* @__PURE__ */ new Set(["\0none"]));
    return typeFilter(facts, selected);
  }
  function hiddenFor(nodes) {
    const list = Array.isArray(nodes) ? nodes : [];
    if (!list.length) return /* @__PURE__ */ new Set();
    const out = new Set(hiddenUids(list, ctx.state.lens));
    const facts = ctx.facts(list);
    for (const uid of activeTypeHidden(facts)) out.add(uid);
    const { hidden } = evaluateLenses(lenses, facts);
    for (const uid of hidden) out.add(uid);
    return out;
  }
  function refreshCanvas() {
    if (ctx.state.settings?.filterReflow) ctx.rebuild();
    ctx.render();
  }
  async function persistLenses(nextList) {
    lenses = normalizeLenses(nextList);
    savingCount += 1;
    try {
      await ctx.saveSetting(SETTING_IDS.lenses, lenses);
    } finally {
      savingCount -= 1;
    }
    refreshCanvas();
    syncPanel();
  }
  function updateBadge() {
    const candidates = mapNeighborNodes();
    const count2 = hiddenFor(candidates).size;
    if (count2 > 0) {
      badgeEl.hidden = false;
      badgeEl.textContent = String(count2);
      const label = count2 === 1 ? "Views and lenses (1 hidden)" : `Views and lenses (${count2} hidden)`;
      barBtn.title = label;
      barBtn.setAttribute("aria-label", label);
    } else {
      badgeEl.hidden = true;
      badgeEl.textContent = "";
      barBtn.title = "Views and lenses";
      barBtn.setAttribute("aria-label", "Views and lenses");
    }
  }
  function positionPanel() {
    if (!panelOpen || panel.hidden) return;
    const rootRect = ctx.dom.root.getBoundingClientRect();
    if (!rootRect.width || !rootRect.height) return;
    const btnRect = barBtn.getBoundingClientRect();
    const barRect = ctx.dom.bar.getBoundingClientRect();
    const anchorBottom = btnRect.height > 0 ? btnRect.bottom : barRect.bottom;
    const top = Math.max(8, Math.round(anchorBottom - rootRect.top + 4));
    const maxHeight = Math.max(140, Math.floor(rootRect.height - top - 10));
    panel.style.top = `${top}px`;
    panel.style.maxHeight = `${maxHeight}px`;
    const panelWidth = panel.offsetWidth || 320;
    const panelHeight = Math.min(panel.offsetHeight || 360, maxHeight);
    const minLeft = 8;
    const maxLeft = Math.max(minLeft, Math.floor(rootRect.width - panelWidth - 8));
    const preferred = btnRect.width > 0 ? btnRect.left - rootRect.left : rootRect.width - panelWidth - 12;
    let left = ctx.clamp(Math.round(preferred), minLeft, maxLeft);
    const centerEl = ctx.dom.world.querySelector(".compass-node-center");
    if (centerEl) {
      const cRect = centerEl.getBoundingClientRect();
      if (cRect.width > 0 && cRect.height > 0) {
        const boxAt = (x) => ({
          left: rootRect.left + x,
          right: rootRect.left + x + panelWidth,
          top: rootRect.top + top,
          bottom: rootRect.top + top + panelHeight
        });
        if (boxesOverlap2(boxAt(left), cRect)) {
          const rightClear = !boxesOverlap2(boxAt(maxLeft), cRect);
          const leftClear = !boxesOverlap2(boxAt(minLeft), cRect);
          if (rightClear && leftClear) {
            left = Math.abs(maxLeft - left) <= Math.abs(minLeft - left) ? maxLeft : minLeft;
          } else if (rightClear) {
            left = maxLeft;
          } else if (leftClear) {
            left = minLeft;
          }
        }
      }
    }
    panel.style.left = `${left}px`;
  }
  function currentViewInfo() {
    const viewsFeature = ctx.features.get("views");
    if (typeof viewsFeature?.current === "function") {
      const info = viewsFeature.current();
      if (info && typeof info.view === "string") return info;
    }
    return {
      view: ctx.state.settings?.view || "compass",
      preset: ctx.state.settings?.facetsPreset || "roles"
    };
  }
  function syncViewsSection() {
    const { view, preset } = currentViewInfo();
    for (const [viewId, btn] of viewBtnMap.entries()) {
      btn.setAttribute("aria-pressed", viewId === view ? "true" : "false");
    }
    if (view !== "facets") {
      facetsRow.hidden = true;
      return;
    }
    facetsRow.hidden = false;
    const facetsFeature = ctx.features.get("facets");
    if (typeof facetsFeature?.presets !== "function") {
      presetSelect.hidden = true;
      presetSelect.replaceChildren();
    } else {
      const presets = facetsFeature.presets() ?? [];
      presetSelect.hidden = false;
      presetSelect.replaceChildren();
      for (const item of presets) {
        if (!item || typeof item.id !== "string") continue;
        const opt = ctx.el("option", "", item.name || item.id);
        opt.value = item.id;
        presetSelect.append(opt);
      }
      if (preset) presetSelect.value = preset;
    }
    editPresetsBtn.hidden = typeof facetsFeature?.openPresetEditor !== "function";
  }
  function syncQuickFilterSection() {
    const currentLens = ctx.state.lens;
    if (keywordInput.value !== currentLens.keyword) {
      keywordInput.value = currentLens.keyword;
    }
    for (const [kindKey, btn] of kindBtnMap.entries()) {
      btn.setAttribute("aria-pressed", currentLens[kindKey] ? "true" : "false");
    }
    const neighbors = mapNeighborNodes();
    const present = neighbors.length ? typesPresent(ctx.facts(neighbors)) : [];
    const hasNamedType = present.some((entry) => entry.type !== "");
    if (!hasNamedType) {
      typeRow.hidden = true;
      typeRow.replaceChildren();
      return;
    }
    typeRow.hidden = false;
    typeRow.replaceChildren();
    for (const entry of present) {
      const labelText = entry.type === "" ? "No type" : entry.type;
      const btn = ctx.button("compass-qf-chip", "");
      btn.dataset.type = entry.type;
      const active = !excludedTypes.has(entry.type);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      btn.setAttribute("aria-label", `Type: ${labelText}`);
      btn.title = `${labelText} (${entry.count})`;
      const nameSpan = ctx.el("span", "compass-qf-type-label", labelText);
      const countSpan = ctx.el("span", "compass-qf-count", String(entry.count));
      btn.append(nameSpan, countSpan);
      btn.addEventListener("click", () => {
        if (excludedTypes.has(entry.type)) excludedTypes.delete(entry.type);
        else excludedTypes.add(entry.type);
        refreshCanvas();
        syncPanel();
      });
      typeRow.append(btn);
    }
  }
  function syncReflowSection() {
    const reflow = Boolean(ctx.state.settings?.filterReflow);
    keepRadio.checked = !reflow;
    reflowRadio.checked = reflow;
  }
  function renderLensList() {
    lensList.replaceChildren();
    lensEmpty.hidden = lenses.length > 0;
    lensList.hidden = lenses.length === 0;
    examplesBtn.hidden = lenses.length > 0;
    for (const lens of lenses) {
      const row = ctx.el("div", "compass-gl-item");
      row.dataset.lensId = lens.id;
      const top = ctx.el("div", "compass-gl-item-top");
      const toggleLabel = ctx.el("label", "compass-gl-toggle-label");
      const checkbox = ctx.el("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(lens.enabled);
      checkbox.setAttribute("aria-label", `Enable ${lens.name}`);
      checkbox.addEventListener("change", ctx.guard(async () => {
        const next = lenses.map((item) => item.id === lens.id ? { ...cloneLens(item), enabled: checkbox.checked } : cloneLens(item));
        await persistLenses(next);
      }));
      const nameSpan = ctx.el("span", "compass-gl-name", lens.name);
      nameSpan.title = lens.name;
      toggleLabel.append(checkbox, nameSpan);
      const tag = ctx.el("span", "compass-gl-tag");
      if (lens.effect === "style") {
        const swatch = ctx.el("span", "compass-gl-swatch");
        const fill = lens.style?.fill || lens.style?.border || lens.style?.text || "transparent";
        const border = lens.style?.border || lens.style?.text || lens.style?.fill || "";
        setCssVar(swatch, "background-color", fill);
        if (border) setCssVar(swatch, "border-color", border);
        tag.append(swatch);
      }
      tag.append(ctx.el("span", "", EFFECT_LABELS[lens.effect] || lens.effect));
      top.append(toggleLabel, tag);
      const actions = ctx.el("div", "compass-gl-item-actions");
      const editBtn = ctx.button("compass-gl-edit", "Edit");
      editBtn.addEventListener("click", () => {
        importState = null;
        editorState = makeEditorDraft(lens);
        renderLensesMode();
        positionPanel();
      });
      const copyBtn = ctx.button("compass-gl-copy", "Copy JSON");
      copyBtn.addEventListener("click", ctx.guard(async () => {
        const copied = await copyText(lensToJson(lens));
        ctx.setStatus(copied ? "Copied lens JSON." : "Could not copy lens JSON.");
      }));
      const deleteBtn = ctx.button("compass-gl-delete", "Delete");
      deleteBtn.addEventListener("click", ctx.guard(async () => {
        const next = lenses.filter((item) => item.id !== lens.id).map(cloneLens);
        await persistLenses(next);
      }));
      actions.append(editBtn, copyBtn, deleteBtn);
      row.append(top, actions);
      lensList.append(row);
    }
  }
  function renderEditorErrors(errorListEl, errors) {
    errorListEl.replaceChildren();
    if (!errors?.length) {
      errorListEl.hidden = true;
      return;
    }
    errorListEl.hidden = false;
    for (const msg of errors) {
      errorListEl.append(ctx.el("li", "", msg));
    }
  }
  function renderEditor() {
    editorWrap.replaceChildren();
    if (!editorState) return;
    const draft = editorState;
    const nameField = ctx.el("label", "compass-gl-field");
    nameField.append(ctx.el("span", "compass-gl-label", "Name"));
    const nameInput = ctx.el("input");
    nameInput.type = "text";
    nameInput.placeholder = "Lens name";
    nameInput.dataset.editor = "name";
    nameInput.value = draft.name;
    nameInput.addEventListener("input", () => {
      draft.name = nameInput.value;
    });
    nameField.append(nameInput);
    const grid2 = ctx.el("div", "compass-gl-grid2");
    const scopeField = ctx.el("label", "compass-gl-field");
    scopeField.append(ctx.el("span", "compass-gl-label", "Scope"));
    const scopeSelect = ctx.el("select");
    scopeSelect.dataset.editor = "scope";
    for (const [val, text] of [["node", "Node"], ["relationship", "Relationship"]]) {
      const opt = ctx.el("option", "", text);
      opt.value = val;
      scopeSelect.append(opt);
    }
    scopeSelect.value = draft.scope;
    const onScopeChange = () => {
      const nextScope = scopeSelect.value === "relationship" ? "relationship" : "node";
      if (nextScope === draft.scope) return;
      draft.scope = nextScope;
      const allowed = new Set(FIELDS[nextScope].map((item) => item.field));
      for (const cond of draft.conditions) {
        if (!allowed.has(cond.field)) {
          cond.field = FIELDS[nextScope][0].field;
          cond.attrName = "";
        }
      }
      renderConditions();
      positionPanel();
    };
    scopeSelect.addEventListener("change", onScopeChange);
    scopeSelect.addEventListener("input", onScopeChange);
    scopeField.append(scopeSelect);
    const effectField = ctx.el("label", "compass-gl-field");
    effectField.append(ctx.el("span", "compass-gl-label", "Effect"));
    const effectSelect = ctx.el("select");
    effectSelect.dataset.editor = "effect";
    for (const [val, text] of [["show", "Show"], ["hide", "Hide"], ["style", "Style"]]) {
      const opt = ctx.el("option", "", text);
      opt.value = val;
      effectSelect.append(opt);
    }
    effectSelect.value = draft.effect;
    effectField.append(effectSelect);
    grid2.append(scopeField, effectField);
    const matchBar = ctx.el("div", "compass-gl-match-bar");
    const matchSelect = ctx.el("select");
    matchSelect.dataset.editor = "match";
    matchSelect.setAttribute("aria-label", "Match mode");
    for (const [val, text] of [["all", "Match all"], ["any", "Match any"]]) {
      const opt = ctx.el("option", "", text);
      opt.value = val;
      matchSelect.append(opt);
    }
    matchSelect.value = draft.matchMode;
    const onMatchChange = () => {
      draft.matchMode = matchSelect.value === "any" ? "any" : "all";
    };
    matchSelect.addEventListener("change", onMatchChange);
    matchSelect.addEventListener("input", onMatchChange);
    const addCondBtn = ctx.button("compass-gl-add-cond", "Add condition");
    addCondBtn.addEventListener("click", () => {
      draft.conditions.push({
        field: FIELDS[draft.scope][0].field,
        attrName: "",
        op: "is",
        value: ""
      });
      renderConditions();
      positionPanel();
    });
    matchBar.append(matchSelect, addCondBtn);
    const condsBox = ctx.el("div", "compass-gl-conds");
    function renderConditions() {
      condsBox.replaceChildren();
      const scopeFields = FIELDS[draft.scope] ?? FIELDS.node;
      const scopeFieldSet = new Set(scopeFields.map((f) => f.field));
      draft.conditions.forEach((cond, index) => {
        const card = ctx.el("div", "compass-gl-cond");
        card.dataset.condIndex = String(index);
        const topRow = ctx.el("div", "compass-gl-cond-top");
        const fieldSelect = ctx.el("select");
        fieldSelect.dataset.cond = "field";
        fieldSelect.setAttribute("aria-label", "Condition field");
        for (const item of scopeFields) {
          const opt = ctx.el("option", "", item.label);
          opt.value = item.field;
          fieldSelect.append(opt);
        }
        if (!scopeFieldSet.has(cond.field)) {
          const extra = ctx.el("option", "", cond.field);
          extra.value = cond.field;
          fieldSelect.append(extra);
        }
        fieldSelect.value = cond.field;
        const opSelect = ctx.el("select");
        opSelect.dataset.cond = "op";
        opSelect.setAttribute("aria-label", "Condition operator");
        for (const item of OPERATORS) {
          const opt = ctx.el("option", "", item.label);
          opt.value = item.op;
          opSelect.append(opt);
        }
        opSelect.value = cond.op;
        const removeBtn = ctx.button("compass-gl-cond-remove", "×", "Remove condition");
        removeBtn.addEventListener("click", () => {
          draft.conditions.splice(index, 1);
          renderConditions();
          positionPanel();
        });
        topRow.append(fieldSelect, opSelect, removeBtn);
        const attrInput = ctx.el("input");
        attrInput.type = "text";
        attrInput.placeholder = "Attribute name";
        attrInput.dataset.cond = "attr";
        attrInput.setAttribute("aria-label", "Attribute name");
        attrInput.value = cond.attrName;
        attrInput.hidden = cond.field !== "attr:";
        attrInput.addEventListener("input", () => {
          cond.attrName = attrInput.value;
        });
        const valueInput = ctx.el("input");
        valueInput.type = "text";
        valueInput.placeholder = "Value";
        valueInput.dataset.cond = "value";
        valueInput.setAttribute("aria-label", "Condition value");
        valueInput.value = cond.value;
        valueInput.hidden = !(OPERATOR_MAP.get(cond.op)?.needsValue ?? true);
        valueInput.addEventListener("input", () => {
          cond.value = valueInput.value;
        });
        const syncFieldVis = () => {
          cond.field = fieldSelect.value;
          attrInput.hidden = cond.field !== "attr:";
          positionPanel();
        };
        fieldSelect.addEventListener("change", syncFieldVis);
        fieldSelect.addEventListener("input", syncFieldVis);
        const syncOpVis = () => {
          cond.op = opSelect.value;
          valueInput.hidden = !(OPERATOR_MAP.get(cond.op)?.needsValue ?? true);
          positionPanel();
        };
        opSelect.addEventListener("change", syncOpVis);
        opSelect.addEventListener("input", syncOpVis);
        card.append(topRow, attrInput, valueInput);
        condsBox.append(card);
      });
    }
    renderConditions();
    const colorsBox = ctx.el("div", "compass-gl-colors");
    colorsBox.hidden = draft.effect !== "style";
    for (const [key, labelText] of COLOR_KEYS) {
      const state = draft.colors[key];
      const row = ctx.el("div", "compass-gl-color-row");
      row.append(ctx.el("span", "compass-gl-color-title", labelText));
      const controls = ctx.el("div", "compass-gl-color-controls");
      const picker = ctx.el("input", "compass-gl-color-picker");
      picker.type = "color";
      picker.dataset.color = key;
      picker.setAttribute("aria-label", `${labelText} color`);
      picker.value = state.picker;
      picker.dataset.none = state.none ? "true" : "false";
      const noneLabel = ctx.el("label", "compass-gl-none");
      const noneCheck = ctx.el("input");
      noneCheck.type = "checkbox";
      noneCheck.dataset.colorNone = key;
      noneCheck.checked = state.none;
      noneLabel.append(noneCheck, ctx.el("span", "", "None"));
      const onPickerInput = () => {
        state.picker = picker.value;
        state.raw = picker.value;
        state.none = false;
        noneCheck.checked = false;
        picker.dataset.none = "false";
      };
      picker.addEventListener("input", onPickerInput);
      picker.addEventListener("change", onPickerInput);
      noneCheck.addEventListener("change", () => {
        state.none = noneCheck.checked;
        if (!state.none && !state.raw) state.raw = picker.value;
        picker.dataset.none = state.none ? "true" : "false";
      });
      controls.append(picker, noneLabel);
      row.append(controls);
      colorsBox.append(row);
    }
    const onEffectChange = () => {
      draft.effect = effectSelect.value;
      colorsBox.hidden = draft.effect !== "style";
      positionPanel();
    };
    effectSelect.addEventListener("change", onEffectChange);
    effectSelect.addEventListener("input", onEffectChange);
    const errorsEl = ctx.el("ul", "compass-gl-errors");
    renderEditorErrors(errorsEl, draft.errors);
    const formActions = ctx.el("div", "compass-gl-form-actions");
    const cancelBtn = ctx.button("compass-gl-cancel", "Cancel");
    cancelBtn.addEventListener("click", () => {
      editorState = null;
      renderLensesMode();
      positionPanel();
    });
    const saveBtn = ctx.button("compass-gl-save", "Save");
    saveBtn.addEventListener("click", ctx.guard(async () => {
      const takenIds = new Set(
        lenses.filter((item) => item.id !== draft.editingId).map((item) => item.id)
      );
      const id = draft.editingId || slugLensId(draft.name, takenIds);
      const builtConditions = draft.conditions.map((cond) => ({
        field: cond.field === "attr:" ? `attr:${cond.attrName.trim()}` : cond.field,
        op: cond.op,
        value: cond.value
      }));
      const rawStyle = draft.effect === "style" ? {
        fill: draft.colors.fill.none ? "" : draft.colors.fill.raw,
        border: draft.colors.border.none ? "" : draft.colors.border.raw,
        text: draft.colors.text.none ? "" : draft.colors.text.raw
      } : { fill: "", border: "", text: "" };
      const validated = validateLens({
        id,
        name: draft.name,
        enabled: draft.enabled,
        scope: draft.scope,
        effect: draft.effect,
        match: { [draft.matchMode]: builtConditions },
        style: rawStyle
      });
      if (!validated.ok) {
        draft.errors = validated.errors;
        renderEditorErrors(errorsEl, draft.errors);
        positionPanel();
        return;
      }
      const next = draft.editingId ? lenses.map((item) => item.id === draft.editingId ? validated.lens : cloneLens(item)) : [...lenses.map(cloneLens), validated.lens];
      editorState = null;
      await persistLenses(next);
    }));
    formActions.append(cancelBtn, saveBtn);
    editorWrap.append(nameField, grid2, matchBar, condsBox, colorsBox, errorsEl, formActions);
  }
  function renderImportBox() {
    importWrap.replaceChildren();
    if (!importState) return;
    const state = importState;
    const areaField = ctx.el("label", "compass-gl-field");
    areaField.append(ctx.el("span", "compass-gl-label", "Paste lens JSON"));
    const area = ctx.el("textarea");
    area.placeholder = '{\n  "name": "My lens",\n  ...\n}';
    area.value = state.text;
    area.addEventListener("input", () => {
      state.text = area.value;
    });
    areaField.append(area);
    const errorsEl = ctx.el("ul", "compass-gl-errors");
    renderEditorErrors(errorsEl, state.errors);
    const actions = ctx.el("div", "compass-gl-form-actions");
    const cancelBtn = ctx.button("compass-gl-cancel", "Cancel");
    cancelBtn.addEventListener("click", () => {
      importState = null;
      renderLensesMode();
      positionPanel();
    });
    const submitBtn = ctx.button("compass-gl-save", "Import lens");
    submitBtn.addEventListener("click", ctx.guard(async () => {
      const parsed = lensFromJson(state.text);
      if (!parsed.ok) {
        state.errors = parsed.errors;
        renderEditorErrors(errorsEl, state.errors);
        positionPanel();
        return;
      }
      const taken = new Set(lenses.map((item) => item.id));
      const uniqueId = taken.has(parsed.lens.id) ? slugLensId(parsed.lens.id, taken) : parsed.lens.id;
      const imported = { ...parsed.lens, id: uniqueId };
      importState = null;
      await persistLenses([...lenses.map(cloneLens), imported]);
    }));
    actions.append(cancelBtn, submitBtn);
    importWrap.append(areaField, errorsEl, actions);
  }
  function renderLensesMode() {
    if (editorState) {
      lensEmpty.hidden = true;
      lensList.hidden = true;
      lensFooter.hidden = true;
      importWrap.hidden = true;
      editorWrap.hidden = false;
      renderEditor();
      return;
    }
    if (importState) {
      lensEmpty.hidden = true;
      lensList.hidden = true;
      lensFooter.hidden = true;
      editorWrap.hidden = true;
      importWrap.hidden = false;
      renderImportBox();
      return;
    }
    editorWrap.hidden = true;
    editorWrap.replaceChildren();
    importWrap.hidden = true;
    importWrap.replaceChildren();
    lensFooter.hidden = false;
    renderLensList();
  }
  function syncPanel() {
    updateBadge();
    if (!panelOpen) return;
    syncViewsSection();
    syncQuickFilterSection();
    syncReflowSection();
    if (!editorState && !importState) renderLensesMode();
    positionPanel();
  }
  function open() {
    panelOpen = true;
    panel.hidden = false;
    barBtn.setAttribute("aria-expanded", "true");
    syncViewsSection();
    syncQuickFilterSection();
    syncReflowSection();
    renderLensesMode();
    positionPanel();
  }
  function close() {
    panelOpen = false;
    editorState = null;
    importState = null;
    panel.hidden = true;
    barBtn.setAttribute("aria-expanded", "false");
  }
  function toggle() {
    if (panelOpen) close();
    else open();
  }
  function clearQuickFilter() {
    excludedTypes.clear();
    keywordInput.value = "";
    ctx.setLens({ pages: true, blocks: true, drawings: true, regions: true, keyword: "" });
    if (ctx.state.settings?.filterReflow) {
      ctx.rebuild();
      ctx.render();
    }
    syncPanel();
  }
  async function setReflow(nextReflow) {
    await ctx.saveSetting(SETTING_IDS.filterReflow, Boolean(nextReflow));
    ctx.rebuild();
    ctx.render();
    syncPanel();
  }
  async function toggleLensById(id) {
    const hit = lenses.find((item) => item.id === id);
    if (!hit) return;
    const next = lenses.map((item) => item.id === id ? { ...cloneLens(item), enabled: !item.enabled } : cloneLens(item));
    await persistLenses(next);
  }
  ctx.lifecycle.event(barBtn, "click", () => toggle());
  ctx.lifecycle.event(closeBtn, "click", () => close());
  for (const [viewId, btn] of viewBtnMap.entries()) {
    ctx.lifecycle.event(btn, "click", ctx.guard(async () => {
      const viewsFeature = ctx.features.get("views");
      await viewsFeature?.set?.(viewId);
      syncPanel();
    }));
  }
  const onPresetChange = ctx.guard(async () => {
    if (!presetSelect.value) return;
    await ctx.features.get("views")?.set?.("facets", presetSelect.value);
    syncPanel();
  });
  ctx.lifecycle.event(presetSelect, "change", onPresetChange);
  ctx.lifecycle.event(editPresetsBtn, "click", () => {
    ctx.features.get("facets")?.openPresetEditor?.();
  });
  ctx.lifecycle.event(keywordInput, "input", () => {
    ctx.setLens({ keyword: keywordInput.value });
    if (ctx.state.settings?.filterReflow) {
      ctx.rebuild();
      ctx.render();
    }
    syncPanel();
  });
  for (const [kindKey, btn] of kindBtnMap.entries()) {
    ctx.lifecycle.event(btn, "click", () => {
      const nextVal = !ctx.state.lens[kindKey];
      ctx.setLens({ [kindKey]: nextVal });
      if (ctx.state.settings?.filterReflow) {
        ctx.rebuild();
        ctx.render();
      }
      syncPanel();
    });
  }
  ctx.lifecycle.event(clearBtn, "click", () => clearQuickFilter());
  ctx.lifecycle.event(keepRadio, "change", ctx.guard(async () => {
    if (keepRadio.checked) await setReflow(false);
  }));
  ctx.lifecycle.event(reflowRadio, "change", ctx.guard(async () => {
    if (reflowRadio.checked) await setReflow(true);
  }));
  ctx.lifecycle.event(newLensBtn, "click", () => {
    importState = null;
    editorState = makeEditorDraft(null);
    renderLensesMode();
    positionPanel();
  });
  ctx.lifecycle.event(importBtn, "click", () => {
    editorState = null;
    importState = { text: "", errors: [] };
    renderLensesMode();
    positionPanel();
  });
  ctx.lifecycle.event(examplesBtn, "click", ctx.guard(async () => {
    if (lenses.length > 0) return;
    await persistLenses(EXAMPLE_LENSES.map(cloneLens));
  }));
  ctx.lifecycle.event(globalThis, "resize", () => {
    if (panelOpen) positionPanel();
  });
  function onSettings(settings) {
    if (!settings) return;
    if (savingCount === 0) {
      lenses = normalizeLenses(settings.lenses);
    }
    syncPanel();
  }
  function onClose() {
    excludedTypes.clear();
    unfilteredNodes = null;
    close();
    updateBadge();
  }
  function onEscape() {
    if (!panelOpen) return false;
    close();
    return true;
  }
  function transformHood(hood) {
    if (!hood || !Array.isArray(hood.nodes)) return hood;
    unfilteredNodes = [...hood.nodes];
    if (!ctx.state.settings?.filterReflow) return hood;
    const hidden = hiddenFor(hood.nodes);
    if (hidden.size === 0) return hood;
    const remaining = hood.nodes.filter((node) => !hidden.has(node.uid));
    const remainingUids = new Set(remaining.map((node) => node.uid));
    const nextNodes = remaining.map((node) => node.via && !remainingUids.has(node.via) ? { ...node, via: null } : node);
    return { ...hood, nodes: nextNodes };
  }
  function hiddenUids2(uids, hood) {
    const nodes = hood?.nodes ?? [];
    if (!nodes.length) return Array.isArray(uids) ? uids : [];
    const out = new Set(Array.isArray(uids) ? uids : []);
    const facts = ctx.facts(nodes);
    for (const uid of activeTypeHidden(facts)) out.add(uid);
    const { hidden } = evaluateLenses(lenses, facts);
    for (const uid of hidden) out.add(uid);
    return [...out];
  }
  function afterRender({ hood, geometry }) {
    const centerUid = hood?.center?.uid ?? ctx.state.current;
    const drawn = Array.isArray(geometry?.nodes) ? geometry.nodes : hood?.nodes ?? [];
    const neighbors = drawn.filter((node) => node && node.uid !== centerUid);
    const facts = neighbors.length ? ctx.facts(neighbors) : /* @__PURE__ */ new Map();
    const hidden = new Set(hiddenUids(neighbors, ctx.state.lens));
    for (const uid of activeTypeHidden(facts)) hidden.add(uid);
    const evaluated = evaluateLenses(lenses, facts);
    for (const uid of evaluated.hidden) hidden.add(uid);
    for (const element of ctx.dom.world.querySelectorAll(".compass-node[data-uid]")) {
      const uid = element.dataset?.uid;
      const isCenter = uid === centerUid || element.classList.contains("compass-node-center");
      if (isCenter) {
        element.classList.toggle("compass-lensed", false);
        removeCssVar(element, "--compass-lens-fill");
        removeCssVar(element, "--compass-lens-border");
        removeCssVar(element, "--compass-lens-text");
        continue;
      }
      const isHidden = Boolean(uid && hidden.has(uid));
      element.classList.toggle("compass-fade", isHidden);
      const style = !isHidden && uid ? evaluated.styles.get(uid) : null;
      if (style) {
        element.classList.toggle("compass-lensed", true);
        if (style.fill) setCssVar(element, "--compass-lens-fill", style.fill);
        else removeCssVar(element, "--compass-lens-fill");
        if (style.border) setCssVar(element, "--compass-lens-border", style.border);
        else removeCssVar(element, "--compass-lens-border");
        if (style.text) setCssVar(element, "--compass-lens-text", style.text);
        else removeCssVar(element, "--compass-lens-text");
      } else {
        element.classList.toggle("compass-lensed", false);
        removeCssVar(element, "--compass-lens-fill");
        removeCssVar(element, "--compass-lens-border");
        removeCssVar(element, "--compass-lens-text");
      }
    }
    syncPanel();
  }
  function commands() {
    return [
      { id: "lenses-open", title: "Views and lenses", hint: "", run: () => open() },
      { id: "filter-clear", title: "Clear filter", hint: "", run: () => clearQuickFilter() },
      {
        id: "filter-reflow",
        title: "Toggle reflow after filtering",
        hint: "",
        run: ctx.guard(() => setReflow(!ctx.state.settings?.filterReflow))
      },
      ...lenses.map((lens) => ({
        id: `lens-toggle-${lens.id}`,
        title: `Lens: ${lens.name}`,
        hint: "",
        run: ctx.guard(() => toggleLensById(lens.id))
      }))
    ];
  }
  return {
    name: "lenses",
    open,
    close,
    toggle,
    hiddenFor,
    onSettings,
    onClose,
    onEscape,
    transformHood,
    hiddenUids: hiddenUids2,
    afterRender,
    commands
  };
}

// src/model/group.js
var GROUP_LABEL = Object.freeze({
  page: "Pages",
  block: "Blocks",
  drawing: "Drawings",
  region: "Regions",
  board: "Boards",
  card: "Cards",
  empty: "Empty pages"
});
var AREAS = /* @__PURE__ */ new Set(["north", "south", "west", "east"]);
var AREA_ROLE = Object.freeze({
  north: "parent",
  south: "child",
  west: "friend",
  east: "challenger"
});
function groupKey(fact) {
  const type = typeof fact?.type === "string" ? fact.type.trim() : "";
  if (type) return `type:${type}`;
  const group = typeof fact?.group === "string" && fact.group ? fact.group : "page";
  return `kind:${group}`;
}
function groupLabel(key) {
  if (typeof key !== "string" || !key) return "";
  if (key.startsWith("type:")) return key.slice(5);
  const kind = key.startsWith("kind:") ? key.slice(5) : key;
  return GROUP_LABEL[kind] ?? kind;
}
function factFor(facts, uid) {
  if (!facts || typeof uid !== "string" || !uid) return null;
  if (facts instanceof Map) return facts.get(uid) ?? null;
  return facts[uid] ?? null;
}
function keyForNode(node, facts) {
  const fact = factFor(facts, node?.uid);
  if (fact) return groupKey(fact);
  const style = typeof node?.style === "string" ? node.style : "";
  const kind = typeof node?.kind === "string" ? node.kind : "";
  return `kind:${style || kind || "page"}`;
}
function areaForZone(zone, oneSided) {
  if (!AREAS.has(zone)) return null;
  if (oneSided && (zone === "west" || zone === "east")) return "west";
  return zone;
}
function makeGroupNode(area, key, bucket) {
  const first = bucket[0];
  const role = first.zone === area && typeof first.role === "string" && first.role ? first.role : AREA_ROLE[area];
  const strength = Math.max(...bucket.map((item) => Number.isFinite(item.strength) ? item.strength : 0));
  return {
    uid: `group:${area}:${key}`,
    kind: "group",
    title: groupLabel(key),
    count: bucket.length,
    members: bucket.map((item) => item.uid),
    zone: area,
    role,
    strength,
    style: "group",
    evidence: [{ kind: "group", role }],
    label: "",
    alias: "",
    string: "",
    editTime: 0,
    createTime: 0,
    writable: null,
    via: null
  };
}
function groupNodes(nodes, facts, { unfolded = /* @__PURE__ */ new Set(), oneSided = false } = {}) {
  if (!Array.isArray(nodes)) return [];
  const unfoldedSet = unfolded instanceof Set ? unfolded : new Set(Array.isArray(unfolded) ? unfolded : []);
  const sharedSides = oneSided === true;
  const buckets = /* @__PURE__ */ new Map();
  const nodeGroupId = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    if (!node || typeof node.uid !== "string" || !node.uid) continue;
    const area = areaForZone(node.zone, sharedSides);
    if (!area) continue;
    const key = keyForNode(node, facts);
    const id = `group:${area}:${key}`;
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = { area, key, items: [] };
      buckets.set(id, bucket);
    }
    bucket.items.push(node);
    nodeGroupId.set(node.uid, id);
  }
  const foldedGroups = /* @__PURE__ */ new Map();
  const foldedMembers = /* @__PURE__ */ new Set();
  for (const [id, bucket] of buckets) {
    if (bucket.items.length < 2 || unfoldedSet.has(id)) continue;
    foldedGroups.set(id, makeGroupNode(bucket.area, bucket.key, bucket.items));
    for (const member of bucket.items) foldedMembers.add(member.uid);
  }
  const emitted = /* @__PURE__ */ new Set();
  const out = [];
  for (const node of nodes) {
    if (!node || typeof node.uid !== "string" || !node.uid) continue;
    const id = nodeGroupId.get(node.uid);
    if (id && foldedGroups.has(id)) {
      if (!emitted.has(id)) {
        emitted.add(id);
        out.push(foldedGroups.get(id));
      }
      continue;
    }
    if (node.zone === "siblings" && node.via && foldedMembers.has(node.via)) {
      out.push({ ...node, via: null });
    } else {
      out.push(node);
    }
  }
  return out;
}

// src/view/features/layout-options.js
var EXPANDABLE_ZONES = /* @__PURE__ */ new Set(["north", "south", "west", "east"]);
var SUB_CAP = 4;
function isExpandableNeighbor(node) {
  if (!node || typeof node.uid !== "string" || !node.uid) return false;
  if (!EXPANDABLE_ZONES.has(node.zone)) return false;
  if (node.kind === "group") return false;
  if (node.style === "board" || node.style === "card") return false;
  return true;
}
function applyEdgeShape(edgeEl, shape) {
  const hit = edgeEl.querySelector(".compass-edge-hit");
  const line = edgeEl.querySelector(".compass-edge-line");
  const label = edgeEl.querySelector(".compass-edge-label");
  if (hit) hit.setAttribute("d", shape.d);
  if (line) line.setAttribute("d", shape.d);
  if (label) {
    label.setAttribute("x", String(shape.mid[0]));
    label.setAttribute("y", String(shape.mid[1] - 4));
  }
}
function anchorRowUid(uid, hood, visibleRowUids, outlineOn) {
  if (!outlineOn || !visibleRowUids.size) return null;
  let at = uid;
  while (at) {
    if (visibleRowUids.has(at)) return at;
    at = hood.outlineIndex?.get?.(at)?.parentUid ?? null;
  }
  return null;
}
function createLayoutOptions(ctx) {
  let groupOn = Boolean(ctx?.state?.settings?.group);
  let expandedOn = Boolean(ctx?.state?.settings?.expanded);
  let flipOn = Boolean(ctx?.state?.settings?.flip);
  let oneSidedOn = Boolean(ctx?.state?.settings?.oneSided);
  let trackpadOn = Boolean(ctx?.state?.settings?.trackpad);
  let saving = 0;
  const unfoldedByCenter = /* @__PURE__ */ new Map();
  const childrenCache = /* @__PURE__ */ new Map();
  let originalNodes = /* @__PURE__ */ new Map();
  let unfoldedGroupByMember = /* @__PURE__ */ new Map();
  const groupButton = ctx?.button?.("compass-group", "Group", "Group nodes by type") ?? null;
  const expandedButton = ctx?.button?.("compass-expanded", "Expanded", "Expanded view") ?? null;
  function syncButtons() {
    if (groupButton) groupButton.setAttribute("aria-pressed", groupOn ? "true" : "false");
    if (expandedButton) expandedButton.setAttribute("aria-pressed", expandedOn ? "true" : "false");
  }
  if (groupButton) {
    syncButtons();
    ctx?.addBarButton?.(groupButton);
    ctx?.lifecycle?.event?.(groupButton, "click", ctx.guard ? ctx.guard(() => toggleGroup()) : () => toggleGroup());
  }
  if (expandedButton) {
    syncButtons();
    ctx?.addBarButton?.(expandedButton);
    ctx?.lifecycle?.event?.(expandedButton, "click", ctx.guard ? ctx.guard(() => toggleExpanded()) : () => toggleExpanded());
  }
  ctx?.lifecycle?.add?.(() => {
    groupButton?.remove?.();
    expandedButton?.remove?.();
  });
  function isCompassView() {
    const view = ctx?.features?.get?.("views")?.current?.()?.view;
    return !view || view === "compass";
  }
  function syncRootAttributes(activeCompass) {
    const root = ctx?.dom?.root;
    if (!root?.dataset) return;
    if (activeCompass && flipOn) root.dataset.flip = "true";
    else delete root.dataset.flip;
    if (activeCompass && oneSidedOn) root.dataset.oneSided = "true";
    else delete root.dataset.oneSided;
  }
  function onSettings(settings) {
    childrenCache.clear();
    if (!settings || saving > 0) return;
    groupOn = Boolean(settings.group);
    expandedOn = Boolean(settings.expanded);
    flipOn = Boolean(settings.flip);
    oneSidedOn = Boolean(settings.oneSided);
    trackpadOn = Boolean(settings.trackpad);
    syncButtons();
  }
  function onNavigate({ uid, previous, changed } = {}) {
    if (!changed) return;
    if (previous) unfoldedByCenter.delete(previous);
    if (uid) unfoldedByCenter.delete(uid);
  }
  function onClose() {
    unfoldedByCenter.clear();
    childrenCache.clear();
    originalNodes = /* @__PURE__ */ new Map();
    unfoldedGroupByMember = /* @__PURE__ */ new Map();
    syncRootAttributes(false);
  }
  async function persistOption(id, value, { rebuild = false, fit = false } = {}) {
    saving += 1;
    try {
      await ctx?.saveSetting?.(id, value);
      if (rebuild) ctx?.rebuild?.();
      ctx?.render?.();
      if (fit && isCompassView()) ctx?.fit?.(true);
    } catch (error) {
      console.error("[compass] layout", error);
    } finally {
      saving -= 1;
    }
  }
  async function toggleGroup() {
    groupOn = !groupOn;
    if (!groupOn) unfoldedByCenter.clear();
    syncButtons();
    await persistOption(SETTING_IDS.group, groupOn, { rebuild: true });
  }
  async function toggleExpanded() {
    expandedOn = !expandedOn;
    if (!expandedOn) childrenCache.clear();
    syncButtons();
    await persistOption(SETTING_IDS.expanded, expandedOn);
  }
  async function toggleFlip() {
    flipOn = !flipOn;
    await persistOption(SETTING_IDS.flip, flipOn, { fit: true });
  }
  async function toggleOneSided() {
    oneSidedOn = !oneSidedOn;
    await persistOption(SETTING_IDS.oneSided, oneSidedOn, { rebuild: true, fit: true });
  }
  async function toggleTrackpad() {
    trackpadOn = !trackpadOn;
    await persistOption(SETTING_IDS.trackpad, trackpadOn);
  }
  function transformHood(hood) {
    originalNodes = /* @__PURE__ */ new Map();
    unfoldedGroupByMember = /* @__PURE__ */ new Map();
    if (!hood || !Array.isArray(hood.nodes)) return hood;
    if (!groupOn || !isCompassView()) return hood;
    for (const node of hood.nodes) {
      if (node?.uid) originalNodes.set(node.uid, node);
    }
    const factMap = ctx?.facts?.(hood.nodes) ?? /* @__PURE__ */ new Map();
    const centerUid = hood.center?.uid || ctx?.state?.current || "";
    const unfolded = unfoldedByCenter.get(centerUid) ?? /* @__PURE__ */ new Set();
    const allGrouped = groupNodes(hood.nodes, factMap, { unfolded: /* @__PURE__ */ new Set(), oneSided: oneSidedOn });
    if (unfolded.size > 0) {
      for (const item of allGrouped) {
        if (item.kind !== "group" || !unfolded.has(item.uid)) continue;
        for (const memberUid of item.members) unfoldedGroupByMember.set(memberUid, item.uid);
      }
    }
    const nodes = unfolded.size > 0 ? groupNodes(hood.nodes, factMap, { unfolded, oneSided: oneSidedOn }) : allGrouped;
    return { ...hood, nodes };
  }
  function childrenFor(uid, centerUid) {
    if (!expandedOn || !uid) return [];
    let raw = childrenCache.get(uid);
    if (!raw) {
      const model = ctx?.state?.settings?.model;
      raw = [];
      try {
        const snap = ctx?.host?.snapshot?.(uid, model);
        if (snap && !snap.missing) {
          raw = buildNeighborhood(snap, model).nodes.filter((child) => child.zone === "south");
        }
      } catch (error) {
        console.error("[compass] expanded", error);
        raw = [];
      }
      childrenCache.set(uid, raw);
    }
    return centerUid ? raw.filter((child) => child.uid !== centerUid) : raw;
  }
  function layoutOptions(options) {
    if (!isCompassView()) return options;
    const next = { ...options };
    if (flipOn) next.flip = true;
    if (oneSidedOn) next.oneSided = true;
    if (expandedOn) {
      const hood = ctx?.state?.hood;
      const centerUid = hood?.center?.uid || ctx?.state?.current || "";
      const sub = {};
      for (const node of hood?.nodes ?? []) {
        if (!isExpandableNeighbor(node)) continue;
        const count2 = childrenFor(node.uid, centerUid).length;
        if (count2 > 0) {
          sub[node.uid] = Math.min(count2, SUB_CAP) + (count2 > SUB_CAP ? 1 : 0);
        }
      }
      next.sub = sub;
    }
    return next;
  }
  function hiddenUids2(uids, hood) {
    if (!Array.isArray(uids) || !hood || !Array.isArray(hood.nodes)) return uids;
    const groups = hood.nodes.filter((node) => node?.kind === "group");
    if (!groups.length) return uids;
    const groupById = new Map(groups.map((item) => [item.uid, item]));
    const lensesFeature = ctx?.features?.get?.("lenses");
    const lensState = ctx?.state?.lens ?? { pages: true, blocks: true, drawings: true, regions: true, keyword: "" };
    const hiddenGroups = /* @__PURE__ */ new Set();
    for (const group of groups) {
      const members = (group.members ?? []).map((id) => originalNodes.get(id)).filter(Boolean);
      if (!members.length) continue;
      const hiddenMembers = typeof lensesFeature?.hiddenFor === "function" ? lensesFeature.hiddenFor(members) : new Set(hiddenUids(members, lensState));
      const keyword = String(lensState.keyword ?? "").trim().toLowerCase();
      const titleHit = !keyword || typeof group.title === "string" && group.title.toLowerCase().includes(keyword);
      const everyMemberHidden = members.every((member) => hiddenMembers?.has?.(member.uid));
      if (everyMemberHidden && (!keyword || !titleHit)) hiddenGroups.add(group.uid);
    }
    return uids.filter((id) => !groupById.has(id) || hiddenGroups.has(id));
  }
  function lateralEdgeFromCenter(center, box) {
    const sign = box.x < 0 ? -1 : 1;
    const sx = sign * (center.w / 2);
    const sy = ctx.clamp(box.y, -center.h / 2 + 12, center.h / 2 - 12);
    const ex = box.x - sign * (box.w / 2);
    return ctx.curve(sx, sy, ex, box.y, false);
  }
  function lateralEdgeFromRow(center, row, box) {
    const sign = box.x < 0 ? -1 : 1;
    const sx = sign * (center.w / 2);
    const end = [box.x - sign * (box.w / 2), box.y];
    const c1 = [sx + sign * 48, row.y];
    const c2 = [end[0] - sign * 48, end[1]];
    return {
      d: `M${sx},${row.y} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${end[0]},${end[1]}`,
      mid: [(sx + 3 * c1[0] + 3 * c2[0] + end[0]) / 8, (row.y + 3 * c1[1] + 3 * c2[1] + end[1]) / 8]
    };
  }
  function siblingEdge(via, box) {
    const sign = box.x < 0 ? -1 : 1;
    const sx = via.x;
    const sy = via.y - via.h / 2;
    const ex = box.x - sign * (box.w / 2);
    const lift = Math.min(sy, box.y) - 36;
    return {
      d: `M${sx},${sy} C${sx},${lift} ${ex - sign * 36},${lift} ${ex},${box.y}`,
      mid: [(sx + ex) / 2, lift]
    };
  }
  function fixEdges(hood, geometry, boxes) {
    const edgeLayer = ctx?.dom?.edgeLayer;
    if (!edgeLayer || !geometry || !geometry.flip && !geometry.oneSided) return;
    const edgesByUid = /* @__PURE__ */ new Map();
    for (const edgeEl of edgeLayer.querySelectorAll(".compass-edge:not(.compass-cross)")) {
      if (edgeEl.dataset.style === "card") continue;
      const uid = edgeEl.dataset.uid;
      if (!uid) continue;
      let list = edgesByUid.get(uid);
      if (!list) {
        list = [];
        edgesByUid.set(uid, list);
      }
      list.push(edgeEl);
    }
    const rows = geometry.rows ?? [];
    const rowBoxes = new Map(rows.map((row) => [row.uid, row]));
    const visibleRowUids = new Set(rowBoxes.keys());
    const outlineOn = Boolean(ctx?.state?.settings?.outline);
    for (const node of hood.nodes ?? []) {
      const box = boxes.get(node.uid);
      if (!box) continue;
      const needsFix = box.zone === "west" && box.x > 0 || box.zone === "east" && box.x < 0 || box.zone === "siblings" && box.x < 0;
      if (!needsFix) continue;
      const edgeEls = edgesByUid.get(node.uid);
      if (!edgeEls?.length) continue;
      if (node.zone === "siblings") {
        const via = node.via ? boxes.get(node.via) : null;
        if (via) applyEdgeShape(edgeEls[0], siblingEdge(via, box));
        for (let i = 1; i < edgeEls.length; i += 1) {
          applyEdgeShape(edgeEls[i], lateralEdgeFromCenter(geometry.center, box));
        }
        continue;
      }
      const anchors = /* @__PURE__ */ new Set();
      for (const item of node.evidence ?? []) {
        const rowUid = item.sourceUid ? anchorRowUid(item.sourceUid, hood, visibleRowUids, outlineOn) : null;
        if (rowUid && (item.kind === "link" || item.kind === "typed" && item.direction === "out")) anchors.add(rowUid);
        else anchors.add("");
      }
      const anchorList = [...anchors];
      for (let i = 0; i < edgeEls.length; i += 1) {
        const anchor = i < anchorList.length ? anchorList[i] : "";
        const shape = anchor && rowBoxes.has(anchor) ? lateralEdgeFromRow(geometry.center, rowBoxes.get(anchor), box) : lateralEdgeFromCenter(geometry.center, box);
        applyEdgeShape(edgeEls[i], shape);
      }
    }
  }
  function afterRender({ hood, geometry, boxes, nodeEls, view } = {}) {
    syncButtons();
    if (view !== "compass" || !hood || !nodeEls) {
      syncRootAttributes(false);
      return;
    }
    syncRootAttributes(true);
    const centerUid = hood.center?.uid || ctx?.state?.current || "";
    for (const node of hood.nodes ?? []) {
      const element = nodeEls.get(node.uid);
      if (!element) continue;
      if (node.kind === "group") {
        element.classList.add("compass-node-group");
        element.dataset.kind = "group";
        const titleEl = element.querySelector(".compass-node-title");
        if (titleEl) titleEl.textContent = node.title;
        if (!element.querySelector(".compass-group-count")) {
          element.append(ctx.el("span", "compass-group-count", String(node.count)));
        }
        const memberTitles = (node.members ?? []).slice(0, 8).map((id) => originalNodes.get(id)?.title || id);
        const remaining = (node.members?.length ?? 0) - memberTitles.length;
        element.title = remaining > 0 ? `${memberTitles.join(", ")} (+${remaining} more)` : memberTitles.join(", ");
        continue;
      }
      if (expandedOn && isExpandableNeighbor(node)) {
        const children = childrenFor(node.uid, centerUid);
        if (children.length > 0) {
          element.classList.add("compass-node-expanded");
          const subs = ctx.el("div", "compass-subs");
          for (const child of children.slice(0, SUB_CAP)) {
            const label = child.alias || child.title;
            const row = ctx.el("div", "compass-sub", label);
            row.dataset.uid = child.uid;
            row.setAttribute("role", "button");
            row.tabIndex = 0;
            row.title = child.title;
            subs.append(row);
          }
          if (children.length > SUB_CAP) {
            subs.append(ctx.el("div", "compass-sub-more", `+${children.length - SUB_CAP} more`));
          }
          element.append(subs);
        }
      }
    }
    if (boxes) fixEdges(hood, geometry, boxes);
  }
  function unfoldGroup(groupId, focusFirst = false) {
    const centerUid = ctx?.state?.current;
    if (!centerUid || !groupId) return false;
    const currentNode = (ctx?.state?.hood?.nodes ?? []).find((n) => n.uid === groupId);
    const firstMemberUid = currentNode?.members?.[0] ?? null;
    let unfolded = unfoldedByCenter.get(centerUid);
    if (!unfolded) {
      unfolded = /* @__PURE__ */ new Set();
      unfoldedByCenter.set(centerUid, unfolded);
    }
    unfolded.add(groupId);
    ctx?.rebuild?.();
    ctx?.render?.();
    if (focusFirst && firstMemberUid) {
      ctx?.state?.nodeEls?.get?.(firstMemberUid)?.focus?.({ preventScroll: true });
    }
    return true;
  }
  function foldGroup(groupId) {
    const centerUid = ctx?.state?.current;
    if (!centerUid || !groupId) return;
    const unfolded = unfoldedByCenter.get(centerUid);
    if (!unfolded || !unfolded.has(groupId)) return;
    unfolded.delete(groupId);
    ctx?.rebuild?.();
    ctx?.render?.();
  }
  function onStageClick(event) {
    if (!isCompassView()) return false;
    const target = event?.target;
    if (!target || typeof target.closest !== "function") return false;
    if (target.closest(".compass-sub-more")) return true;
    const subEl = target.closest(".compass-sub[data-uid]");
    if (subEl?.dataset?.uid) {
      ctx?.focusUid?.(subEl.dataset.uid);
      return true;
    }
    const groupEl = target.closest('.compass-node[data-kind="group"]');
    if (groupEl?.dataset?.uid) {
      return unfoldGroup(groupEl.dataset.uid, false);
    }
    return false;
  }
  function onStageDoubleClick(event) {
    if (!isCompassView()) return false;
    const target = event?.target;
    if (!target || typeof target.closest !== "function") return false;
    if (target.closest(".compass-sub-more")) return true;
    const subEl = target.closest(".compass-sub[data-uid]");
    if (subEl?.dataset?.uid) {
      event.preventDefault?.();
      void ctx?.openSidebar?.(subEl.dataset.uid);
      return true;
    }
    if (target.closest('.compass-node[data-kind="group"]')) {
      event.preventDefault?.();
      return true;
    }
    return false;
  }
  function onKey(event) {
    if (!isCompassView()) return false;
    const target = event?.target;
    if (!target || typeof target.closest !== "function") return false;
    const subEl = target.closest(".compass-sub[data-uid]");
    if (subEl?.dataset?.uid && (event.key === "Enter" || event.key === " ")) {
      ctx?.focusUid?.(subEl.dataset.uid);
      return true;
    }
    const groupEl = target.closest('.compass-node[data-kind="group"]');
    if (groupEl?.dataset?.uid && (event.key === "Enter" || event.key === " ")) {
      return unfoldGroup(groupEl.dataset.uid, true);
    }
    return false;
  }
  function nodeMenu(uid, node) {
    if (!isCompassView() || !groupOn) return [];
    if (node?.kind === "group") {
      return [{ title: "Unfold group", run: () => unfoldGroup(uid, false) }];
    }
    const groupId = unfoldedGroupByMember.get(uid);
    if (groupId) {
      return [{ title: "Fold group", run: () => foldGroup(groupId) }];
    }
    return [];
  }
  function onWheel(event) {
    if (!trackpadOn || !isCompassView()) return false;
    event.preventDefault();
    const { zoom, panX, panY } = ctx.state;
    if (event.ctrlKey || event.metaKey) {
      const rect = ctx.dom.stage.getBoundingClientRect();
      const ox = event.clientX - rect.left - rect.width / 2;
      const oy = event.clientY - rect.top - rect.height / 2;
      const wx = (ox - panX) / zoom;
      const wy = (oy - panY) / zoom;
      const factor = ctx.clamp(Math.exp(-event.deltaY * 0.01), 0.8, 1.2);
      const nextZoom = ctx.clamp(zoom * factor, 0.25, 2.5);
      ctx.setCamera({
        zoom: nextZoom,
        panX: ox - wx * nextZoom,
        panY: oy - wy * nextZoom
      }, false);
      return true;
    }
    const dx = Number.isFinite(event.deltaX) ? event.deltaX : 0;
    const dy = Number.isFinite(event.deltaY) ? event.deltaY : 0;
    ctx.setCamera({ panX: panX - dx, panY: panY - dy }, false);
    return true;
  }
  function commands() {
    return [
      { id: "layout-group", title: "Toggle grouping by type", hint: "", run: () => toggleGroup() },
      { id: "layout-expanded", title: "Toggle expanded view", hint: "", run: () => toggleExpanded() },
      { id: "layout-flip", title: "Flip East–West", hint: "", run: () => toggleFlip() },
      { id: "layout-one-sided", title: "Toggle one-sided layout", hint: "", run: () => toggleOneSided() },
      { id: "layout-trackpad", title: "Toggle trackpad navigation", hint: "", run: () => toggleTrackpad() }
    ];
  }
  return {
    name: "layout",
    toggleGroup,
    toggleExpanded,
    onSettings,
    onNavigate,
    onClose,
    transformHood,
    layoutOptions,
    hiddenUids: hiddenUids2,
    afterRender,
    onStageClick,
    onStageDoubleClick,
    onKey,
    nodeMenu,
    onWheel,
    commands
  };
}

// src/model/keynav.js
var DIRECTIONS = /* @__PURE__ */ new Set(["up", "down", "left", "right"]);
var SHORTCUTS = Object.freeze([
  Object.freeze({ keys: "Arrow keys", action: "Move selection across the map", group: "Move and select" }),
  Object.freeze({ keys: "Alt+Arrow keys", action: "Jump to the area in that direction", group: "Move and select" }),
  Object.freeze({ keys: "Alt+0", action: "Select the center card", group: "Move and select" }),
  Object.freeze({ keys: "Letters, digits, Space", action: "Type to select a visible node", group: "Move and select" }),
  Object.freeze({ keys: "Tab / Shift+Tab", action: "Next or previous match while selecting", group: "Move and select" }),
  Object.freeze({ keys: "Escape", action: "Clear phrase, exit Zen or close Compass", group: "Move and select" }),
  Object.freeze({ keys: "Enter / Space", action: "Center the selected node", group: "Actions" }),
  Object.freeze({ keys: "Shift+Enter", action: "Open the selected node in the sidebar", group: "Actions" }),
  Object.freeze({ keys: "Ctrl/Cmd+Enter", action: "Open the selected node in the main window", group: "Actions" }),
  Object.freeze({ keys: "Backspace / Shift+Backspace", action: "Back or forward in history", group: "Actions" }),
  Object.freeze({ keys: "Alt+Left / Alt+Right", action: "Back or forward from the center", group: "Actions" }),
  Object.freeze({ keys: "Ctrl/Cmd+Arrow keys", action: "Add a related page on that side", group: "Actions" }),
  Object.freeze({ keys: "Alt+P", action: "Pin or unpin the selected node", group: "Actions" }),
  Object.freeze({ keys: "Alt+B", action: "Open periodic pins", group: "Actions" }),
  Object.freeze({ keys: "Alt+H", action: "Toggle trail", group: "Actions" }),
  Object.freeze({ keys: "Alt+M", action: "Open the selected node menu", group: "Actions" }),
  Object.freeze({ keys: "Alt+/ or Ctrl/Cmd+F", action: "Focus the search box", group: "Actions" }),
  Object.freeze({ keys: "Alt+.", action: "Open the command palette", group: "Actions" }),
  Object.freeze({ keys: "Alt+?", action: "Show keyboard help", group: "Actions" })
]);
function keyOf(item) {
  if (typeof item?.key === "string" && item.key) return item.key;
  if (typeof item?.uid === "string" && item.uid) return item.uid;
  return "";
}
function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const raw of items) {
    const key = keyOf(raw);
    if (!key || !Number.isFinite(raw?.x) || !Number.isFinite(raw?.y)) continue;
    out.push({
      key,
      uid: typeof raw.uid === "string" ? raw.uid : key,
      zone: typeof raw.zone === "string" ? raw.zone : "",
      x: raw.x,
      y: raw.y,
      w: Number.isFinite(raw.w) ? raw.w : 0,
      h: Number.isFinite(raw.h) ? raw.h : 0
    });
  }
  return out;
}
function axes(dx, dy, direction) {
  if (direction === "up") return { primary: -dy, sideways: Math.abs(dx) };
  if (direction === "down") return { primary: dy, sideways: Math.abs(dx) };
  if (direction === "left") return { primary: -dx, sideways: Math.abs(dy) };
  if (direction === "right") return { primary: dx, sideways: Math.abs(dy) };
  return null;
}
function inCone(dx, dy, direction) {
  const projected = axes(dx, dy, direction);
  return Boolean(projected && projected.primary > 0 && projected.sideways <= projected.primary);
}
function readingOrder(a, b) {
  return a.y - b.y || a.x - b.x;
}
function bestByScore(pool, origin, direction) {
  let best = null;
  let bestScore = Infinity;
  let bestDist = Infinity;
  for (const item of pool) {
    if (item.key === origin.key) continue;
    const dx = item.x - origin.x;
    const dy = item.y - origin.y;
    const projected = axes(dx, dy, direction);
    if (!projected || projected.primary <= 0) continue;
    const score2 = projected.primary + 2 * projected.sideways;
    const dist = Math.hypot(dx, dy);
    if (score2 < bestScore || score2 === bestScore && dist < bestDist || score2 === bestScore && dist === bestDist && best && readingOrder(item, best) < 0) {
      best = item;
      bestScore = score2;
      bestDist = dist;
    }
  }
  return best;
}
function step(items, currentKey, direction) {
  if (!DIRECTIONS.has(direction)) return null;
  const list = normalizeItems(items);
  if (!list.length) return null;
  const current = typeof currentKey === "string" && currentKey ? list.find((item) => item.key === currentKey) ?? null : null;
  if (!current || current.zone === "center") {
    const ox = current ? current.x : 0;
    const oy = current ? current.y : 0;
    let nearest = null;
    let nearestDist = Infinity;
    for (const item of list) {
      if (item.zone === "center" || item.key === current?.key) continue;
      const dx = item.x - ox;
      const dy = item.y - oy;
      if (!inCone(dx, dy, direction)) continue;
      const dist = Math.hypot(dx, dy);
      if (dist < nearestDist || dist === nearestDist && nearest && readingOrder(item, nearest) < 0) {
        nearest = item;
        nearestDist = dist;
      }
    }
    return nearest ? nearest.key : null;
  }
  if (current.zone) {
    const sameZone = list.filter((item) => item.zone === current.zone);
    const within = bestByScore(sameZone, current, direction);
    if (within) return within.key;
  }
  const crossed = bestByScore(list, current, direction);
  return crossed ? crossed.key : null;
}
function jump(items, direction) {
  if (!DIRECTIONS.has(direction)) return null;
  const list = normalizeItems(items);
  if (!list.length) return null;
  const center = list.find((item) => item.zone === "center") ?? null;
  const cx = center ? center.x : 0;
  const cy = center ? center.y : 0;
  const byZone = /* @__PURE__ */ new Map();
  for (const item of list) {
    if (!item.zone || item.zone === "center") continue;
    const group = byZone.get(item.zone);
    if (group) group.push(item);
    else byZone.set(item.zone, [item]);
  }
  let bestMembers = null;
  let bestPrimary = -Infinity;
  for (const members of byZone.values()) {
    let sumDx = 0;
    let sumDy = 0;
    for (const item of members) {
      sumDx += item.x - cx;
      sumDy += item.y - cy;
    }
    const avgDx = sumDx / members.length;
    const avgDy = sumDy / members.length;
    if (!inCone(avgDx, avgDy, direction)) continue;
    const projected = axes(avgDx, avgDy, direction);
    if (projected && projected.primary > bestPrimary) {
      bestPrimary = projected.primary;
      bestMembers = members;
    }
  }
  if (!bestMembers) return null;
  let nearest = null;
  let nearestDist = Infinity;
  for (const item of bestMembers) {
    const dist = Math.hypot(item.x - cx, item.y - cy);
    if (dist < nearestDist || dist === nearestDist && nearest && readingOrder(item, nearest) < 0) {
      nearest = item;
      nearestDist = dist;
    }
  }
  return nearest ? nearest.key : null;
}
function readLabel(labels, key) {
  if (!labels) return "";
  const raw = labels instanceof Map ? labels.get(key) : labels[key];
  return typeof raw === "string" ? raw : "";
}
function matches(items, labels, phrase) {
  if (typeof phrase !== "string" || phrase.length === 0) return [];
  const list = normalizeItems(items);
  if (!list.length || !labels) return [];
  const needle = phrase.toLowerCase();
  const hits = [];
  for (const item of list) {
    const label = readLabel(labels, item.key);
    if (label && label.toLowerCase().includes(needle)) hits.push(item);
  }
  hits.sort(readingOrder);
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of hits) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    out.push(item.key);
  }
  return out;
}
function cycle(keys, currentKey, delta = 1) {
  if (!Array.isArray(keys) || keys.length === 0) return null;
  const index = keys.indexOf(currentKey);
  if (index < 0) return keys[0];
  const stepCount = Number.isFinite(delta) ? Math.trunc(delta) : 1;
  const next = ((index + stepCount) % keys.length + keys.length) % keys.length;
  return keys[next];
}

// src/view/features/keys.js
var ARROW_DIR = Object.freeze({
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right"
});
var PHRASE_TIMEOUT_MS = 4e3;
var HELP_GROUPS = Object.freeze(["Move and select", "Actions"]);
function escapeSelector(value) {
  if (typeof globalThis.CSS?.escape === "function") return globalThis.CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}
function isPhraseChar(key, hasPhrase) {
  if (key === " ") return hasPhrase;
  return typeof key === "string" && key.length === 1 && /[\p{L}\p{N}]/u.test(key);
}
function createKeys(ctx) {
  let phrase = "";
  let phraseTimer = null;
  let helpOpen = false;
  let savedFocus = null;
  let pill = null;
  let helpBackdrop = null;
  let closeHelpBtn = null;
  if (ctx?.el && ctx?.button && ctx?.lifecycle && ctx?.dom?.stage && ctx?.dom?.root) {
    pill = ctx.el("div", "compass-select-pill");
    pill.hidden = true;
    pill.setAttribute("role", "status");
    pill.setAttribute("aria-live", "polite");
    ctx.lifecycle.node(pill, ctx.dom.stage);
    helpBackdrop = ctx.el("div", "compass-help-backdrop");
    helpBackdrop.hidden = true;
    const panel = ctx.el("div", "compass-help");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Keyboard shortcuts");
    const head = ctx.el("div", "compass-help-head");
    const title = ctx.el("h2", "compass-help-title", "Keyboard shortcuts");
    closeHelpBtn = ctx.button("compass-help-close", "×", "Close keyboard help");
    head.append(title, closeHelpBtn);
    const body = ctx.el("div", "compass-help-body");
    for (const groupName of HELP_GROUPS) {
      const group = ctx.el("section", "compass-help-group");
      group.append(ctx.el("h3", "compass-help-group-title", groupName));
      const rows = ctx.el("div", "compass-help-rows");
      for (const item of SHORTCUTS) {
        if (item.group !== groupName) continue;
        const row = ctx.el("div", "compass-help-row");
        row.append(
          ctx.el("kbd", "compass-help-keys", item.keys),
          ctx.el("span", "compass-help-action", item.action)
        );
        rows.append(row);
      }
      group.append(rows);
      body.append(group);
    }
    panel.append(head, body);
    helpBackdrop.append(panel);
    ctx.lifecycle.node(helpBackdrop, ctx.dom.root);
    ctx.lifecycle.event(helpBackdrop, "pointerdown", (event) => {
      event.stopPropagation();
      if (event.target === helpBackdrop) closeHelp();
    });
    ctx.lifecycle.event(helpBackdrop, "click", (event) => {
      event.stopPropagation();
    });
    ctx.lifecycle.event(closeHelpBtn, "click", () => {
      closeHelp();
    });
    ctx.lifecycle.event(helpBackdrop, "keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeHelp();
      }
    });
  }
  function clearPhrase() {
    phrase = "";
    if (ctx?.cancel) phraseTimer = ctx.cancel(phraseTimer);
    if (pill) {
      pill.hidden = true;
      pill.textContent = "";
    }
  }
  function armPhraseTimer() {
    if (!ctx?.later || !ctx?.cancel) return;
    phraseTimer = ctx.cancel(phraseTimer);
    phraseTimer = ctx.later(clearPhrase, PHRASE_TIMEOUT_MS);
  }
  function updatePill(matchedKeys, activeKey) {
    if (!pill) return;
    if (!phrase) {
      pill.hidden = true;
      pill.textContent = "";
      return;
    }
    if (matchedKeys.length > 0) {
      const index = Math.max(0, matchedKeys.indexOf(activeKey));
      pill.textContent = `Select: ${phrase} — ${index + 1} of ${matchedKeys.length}`;
    } else {
      pill.textContent = `Select: ${phrase} — no match`;
    }
    pill.hidden = false;
  }
  function elementFor(item) {
    if (!item) return null;
    const world = ctx?.dom?.world;
    if (typeof item.key === "string" && item.key && world) {
      const byKey = world.querySelector(`.compass-node[data-key="${escapeSelector(item.key)}"]`);
      if (byKey) return byKey;
    }
    if (typeof item.uid === "string" && item.uid) {
      const mapped = ctx?.state?.nodeEls?.get?.(item.uid);
      if (mapped) return mapped;
      if (world) {
        if (item.zone === "center") {
          const centerEl = world.querySelector(".compass-node-center");
          if (centerEl) return centerEl;
        }
        const byUid = world.querySelector(`.compass-node[data-uid="${escapeSelector(item.uid)}"]`);
        if (byUid) return byUid;
      }
    }
    return null;
  }
  function collectScene() {
    const geometry = ctx?.state?.geometry;
    const hood = ctx?.state?.hood;
    if (!geometry || !hood?.center) {
      return { items: [], elements: /* @__PURE__ */ new Map(), itemMap: /* @__PURE__ */ new Map(), labels: /* @__PURE__ */ new Map(), centerKey: null };
    }
    const items = [];
    const elements = /* @__PURE__ */ new Map();
    const itemMap = /* @__PURE__ */ new Map();
    const labels = /* @__PURE__ */ new Map();
    const centerKey = hood.center.uid;
    const centerItem = {
      key: centerKey,
      uid: centerKey,
      zone: "center",
      x: geometry.center?.x ?? 0,
      y: geometry.center?.y ?? 0,
      w: geometry.center?.w ?? 240,
      h: geometry.center?.h ?? 56
    };
    const centerEl = elementFor(centerItem);
    if (centerEl && !centerEl.classList.contains("compass-fade")) {
      items.push(centerItem);
      elements.set(centerKey, centerEl);
      itemMap.set(centerKey, centerItem);
      const centerTitle = centerEl.querySelector(".compass-node-title")?.textContent ?? "";
      if (centerTitle) labels.set(centerKey, centerTitle);
    }
    for (const raw of geometry.items ?? []) {
      const key = typeof raw?.key === "string" && raw.key ? raw.key : raw?.uid;
      if (!key) continue;
      const item = { ...raw, key };
      const nodeEl = elementFor(item);
      if (!nodeEl || nodeEl.classList.contains("compass-fade")) continue;
      items.push(item);
      elements.set(key, nodeEl);
      itemMap.set(key, item);
      const text = nodeEl.querySelector(".compass-node-title")?.textContent ?? "";
      if (text) labels.set(key, text);
    }
    return { items, elements, itemMap, labels, centerKey: centerEl ? centerKey : null };
  }
  function focusedNodeElement() {
    const active = globalThis.document?.activeElement;
    if (!active || !ctx?.dom?.world?.contains?.(active)) return null;
    return active.closest?.(".compass-node") ?? null;
  }
  function keyOfElement(nodeEl, centerKey) {
    if (!nodeEl) return null;
    if (nodeEl.classList.contains("compass-node-center")) return centerKey || nodeEl.dataset.uid || null;
    return nodeEl.dataset.key || nodeEl.dataset.uid || null;
  }
  function ensureInView(item) {
    const stage = ctx?.dom?.stage;
    if (!item || typeof stage?.getBoundingClientRect !== "function" || typeof ctx?.setCamera !== "function") return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const zoom = ctx.state?.zoom || 1;
    const panX = ctx.state?.panX || 0;
    const panY = ctx.state?.panY || 0;
    const margin = 16;
    const halfW = Math.max(0, rect.width / 2 - margin);
    const halfH = Math.max(0, rect.height / 2 - margin);
    const w = Number.isFinite(item.w) ? item.w : 0;
    const h = Number.isFinite(item.h) ? item.h : 0;
    const left = panX + (item.x - w / 2) * zoom;
    const right = panX + (item.x + w / 2) * zoom;
    const top = panY + (item.y - h / 2) * zoom;
    const bottom = panY + (item.y + h / 2) * zoom;
    let nextPanX = panX;
    let nextPanY = panY;
    if (w * zoom > halfW * 2) nextPanX = -item.x * zoom;
    else if (left < -halfW) nextPanX += -halfW - left;
    else if (right > halfW) nextPanX -= right - halfW;
    if (h * zoom > halfH * 2) nextPanY = -item.y * zoom;
    else if (top < -halfH) nextPanY += -halfH - top;
    else if (bottom > halfH) nextPanY -= bottom - halfH;
    if (nextPanX !== panX || nextPanY !== panY) {
      ctx.setCamera({ panX: nextPanX, panY: nextPanY }, true);
    }
  }
  function selectKey(scene, targetKey) {
    if (!targetKey) return false;
    const nodeEl = scene.elements.get(targetKey);
    if (!nodeEl) return false;
    nodeEl.focus({ preventScroll: true });
    ensureInView(scene.itemMap.get(targetKey));
    return true;
  }
  function focusCenter() {
    clearPhrase();
    const scene = collectScene();
    if (scene.centerKey) selectKey(scene, scene.centerKey);
  }
  function help() {
    clearPhrase();
    ctx?.hideFloating?.();
    if (!helpOpen) {
      const active = globalThis.document?.activeElement;
      savedFocus = active && ctx?.dom?.root?.contains?.(active) ? active : null;
    }
    helpOpen = true;
    if (helpBackdrop) {
      helpBackdrop.hidden = false;
      closeHelpBtn?.focus({ preventScroll: true });
    }
  }
  function closeHelp(restore = true) {
    if (!helpOpen) return;
    helpOpen = false;
    if (helpBackdrop) helpBackdrop.hidden = true;
    const target = savedFocus;
    savedFocus = null;
    if (restore && target?.isConnected && ctx?.state?.isOpen) {
      target.focus({ preventScroll: true });
    }
  }
  function openCenterZonePop(arrowKey) {
    const flipped = Boolean(ctx?.state?.geometry?.flip ?? ctx?.state?.settings?.flip);
    let zone = "south";
    if (arrowKey === "ArrowUp") zone = "north";
    else if (arrowKey === "ArrowDown") zone = "south";
    else if (arrowKey === "ArrowLeft") zone = flipped ? "east" : "west";
    else if (arrowKey === "ArrowRight") zone = flipped ? "west" : "east";
    const centerEl = ctx?.dom?.world?.querySelector?.(".compass-node-center") ?? (ctx?.state?.current ? ctx?.state?.nodeEls?.get?.(ctx.state.current) : null);
    const rect = centerEl?.getBoundingClientRect?.() ?? ctx?.dom?.stage?.getBoundingClientRect?.();
    let x = NaN;
    let y = NaN;
    if (rect) {
      if (arrowKey === "ArrowUp") {
        x = rect.left + rect.width / 2;
        y = rect.top - 8;
      } else if (arrowKey === "ArrowDown") {
        x = rect.left + rect.width / 2;
        y = rect.bottom + 8;
      } else if (arrowKey === "ArrowLeft") {
        x = rect.left - 8;
        y = rect.top + rect.height / 2;
      } else {
        x = rect.right + 8;
        y = rect.top + rect.height / 2;
      }
    }
    ctx?.openZonePop?.(zone, x, y);
  }
  function notifyWander(event) {
    if (event?.target === globalThis.document?.body) {
      ctx?.features?.get?.("wander")?.pause?.();
    }
  }
  function onKey(event) {
    if (!event) return false;
    if (helpOpen) {
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        if (event.code === "Slash" && event.shiftKey || event.key === "?") {
          closeHelp();
          return true;
        }
        if (!event.shiftKey && (event.code === "Period" || event.key === ".")) {
          closeHelp(false);
          ctx?.features?.get?.("palette")?.open?.();
          return true;
        }
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "PageDown" || event.key === "PageUp") {
        return false;
      }
      return true;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if (!event.shiftKey && event.key === "Enter") {
        const nodeEl = focusedNodeElement();
        if (!nodeEl?.dataset?.uid) return false;
        clearPhrase();
        notifyWander(event);
        void ctx?.openMain?.(nodeEl.dataset.uid);
        return true;
      }
      if (!event.shiftKey && ARROW_DIR[event.key]) {
        if (!ctx?.state?.current) return false;
        clearPhrase();
        notifyWander(event);
        openCenterZonePop(event.key);
        return true;
      }
      return false;
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      if (event.code === "Slash" && event.shiftKey || event.key === "?") {
        notifyWander(event);
        help();
        return true;
      }
      if (!event.shiftKey && (event.code === "Slash" || event.key === "/")) {
        clearPhrase();
        notifyWander(event);
        ctx?.dom?.searchInput?.focus?.();
        ctx?.dom?.searchInput?.select?.();
        return true;
      }
      if (!event.shiftKey && (event.code === "Period" || event.key === ".")) {
        clearPhrase();
        notifyWander(event);
        ctx?.features?.get?.("palette")?.open?.();
        return true;
      }
      if (!event.shiftKey && (event.code === "Digit0" || event.code === "Numpad0" || event.key === "0")) {
        notifyWander(event);
        focusCenter();
        return true;
      }
      if (!event.shiftKey && (event.code === "KeyP" || event.key?.toLowerCase?.() === "p")) {
        clearPhrase();
        notifyWander(event);
        const uid = focusedNodeElement()?.dataset?.uid || ctx?.state?.current;
        if (uid && ctx?.togglePin) {
          if (ctx.guard) ctx.guard(() => ctx.togglePin(uid))();
          else void ctx.togglePin(uid);
        }
        return true;
      }
      if (!event.shiftKey && (event.code === "KeyB" || event.key?.toLowerCase?.() === "b")) {
        clearPhrase();
        notifyWander(event);
        ctx?.features?.get?.("pins")?.openPicker?.();
        return true;
      }
      if (!event.shiftKey && (event.code === "KeyH" || event.key?.toLowerCase?.() === "h")) {
        clearPhrase();
        notifyWander(event);
        ctx?.features?.get?.("trail")?.toggle?.();
        return true;
      }
      if (!event.shiftKey && (event.code === "KeyM" || event.key?.toLowerCase?.() === "m")) {
        clearPhrase();
        notifyWander(event);
        const nodeEl = focusedNodeElement();
        if (nodeEl && !nodeEl.classList.contains("compass-node-center") && nodeEl.dataset.uid) {
          const rect = nodeEl.getBoundingClientRect();
          ctx?.showMenu?.(nodeEl.dataset.uid, rect.left + 8, rect.bottom);
        }
        return true;
      }
      if (!event.shiftKey && ARROW_DIR[event.key]) {
        const direction = ARROW_DIR[event.key];
        const nodeEl = focusedNodeElement();
        const atCenterOrNone = !nodeEl || nodeEl.classList.contains("compass-node-center");
        if ((direction === "left" || direction === "right") && atCenterOrNone) {
          clearPhrase();
          return false;
        }
        clearPhrase();
        notifyWander(event);
        const scene = collectScene();
        const target = jump(scene.items, direction);
        if (target) selectKey(scene, target);
        return true;
      }
      return false;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (ARROW_DIR[event.key] && !event.shiftKey) {
      clearPhrase();
      notifyWander(event);
      const scene = collectScene();
      const currentKey = keyOfElement(focusedNodeElement(), scene.centerKey);
      const target = step(scene.items, currentKey, ARROW_DIR[event.key]);
      if (target) selectKey(scene, target);
      return true;
    }
    if (event.key === "Enter") {
      if (phrase) clearPhrase();
      return false;
    }
    if (event.key === "Tab") {
      if (!phrase) return false;
      notifyWander(event);
      armPhraseTimer();
      const scene = collectScene();
      const matched = matches(scene.items, scene.labels, phrase);
      const currentKey = keyOfElement(focusedNodeElement(), scene.centerKey);
      let chosen = currentKey;
      if (matched.length > 0) {
        chosen = cycle(matched, currentKey, event.shiftKey ? -1 : 1);
        selectKey(scene, chosen);
      }
      updatePill(matched, chosen);
      return true;
    }
    if (event.key === "Backspace") {
      notifyWander(event);
      if (phrase) {
        const chars = Array.from(phrase);
        chars.pop();
        phrase = chars.join("");
        if (!phrase) {
          clearPhrase();
          return true;
        }
        armPhraseTimer();
        const scene = collectScene();
        const matched = matches(scene.items, scene.labels, phrase);
        const chosen = matched[0] ?? null;
        if (chosen) selectKey(scene, chosen);
        updatePill(matched, chosen);
        return true;
      }
      if (event.shiftKey) ctx?.goForward?.();
      else ctx?.goBack?.();
      return true;
    }
    if (isPhraseChar(event.key, phrase.length > 0)) {
      const nextPhrase = phrase + event.key;
      const scene = collectScene();
      const matched = matches(scene.items, scene.labels, nextPhrase);
      if (!phrase && matched.length === 0) return false;
      notifyWander(event);
      phrase = nextPhrase;
      armPhraseTimer();
      const chosen = matched[0] ?? null;
      if (chosen) selectKey(scene, chosen);
      updatePill(matched, chosen);
      return true;
    }
    return false;
  }
  function onEscape() {
    if (helpOpen) {
      closeHelp();
      return true;
    }
    if (phrase) {
      clearPhrase();
      return true;
    }
    return false;
  }
  function onNavigate() {
    clearPhrase();
  }
  function onClose() {
    clearPhrase();
    closeHelp(false);
  }
  function commands() {
    return [
      { id: "keys-help", title: "Keyboard help", hint: "Alt+?", run: () => help() },
      { id: "select-center", title: "Select the center", hint: "Alt+0", run: () => focusCenter() }
    ];
  }
  return {
    name: "keys",
    help,
    onKey,
    onEscape,
    onNavigate,
    onClose,
    commands
  };
}

// src/view/features/palette.js
function escapeSelector2(value) {
  if (typeof globalThis.CSS?.escape === "function") return globalThis.CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}
function createPalette(ctx) {
  let isOpen = false;
  let allCommands = [];
  let shown = [];
  let activeIndex = 0;
  let savedUid = null;
  let savedKey = null;
  let backdrop = null;
  let dialog = null;
  let input = null;
  let listEl = null;
  if (ctx?.el && ctx?.button && ctx?.lifecycle && ctx?.dom?.root) {
    backdrop = ctx.el("div", "compass-palette-backdrop");
    backdrop.hidden = true;
    dialog = ctx.el("div", "compass-palette");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Command palette");
    input = ctx.el("input", "compass-palette-input");
    input.type = "text";
    input.autocomplete = "off";
    input.placeholder = "Type a command";
    input.setAttribute("aria-label", "Type a command");
    listEl = ctx.el("div", "compass-palette-list");
    listEl.setAttribute("role", "listbox");
    dialog.append(input, listEl);
    backdrop.append(dialog);
    ctx.lifecycle.node(backdrop, ctx.dom.root);
    ctx.lifecycle.event(backdrop, "pointerdown", (event) => {
      event.stopPropagation();
      if (event.target === backdrop) closePalette(true);
    });
    ctx.lifecycle.event(backdrop, "click", (event) => {
      event.stopPropagation();
    });
    ctx.lifecycle.event(listEl, "mousedown", (event) => {
      event.preventDefault();
    });
    ctx.lifecycle.event(listEl, "click", (event) => {
      const row = event.target?.closest?.(".compass-palette-item");
      if (!row) return;
      const index = Number(row.dataset.index);
      if (Number.isInteger(index) && shown[index]) execute(shown[index]);
    });
    ctx.lifecycle.event(input, "input", () => {
      filterCommands(input.value);
    });
    ctx.lifecycle.event(dialog, "keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        if (!shown.length) return;
        activeIndex = Math.min(shown.length - 1, activeIndex + 1);
        markActive();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        if (!shown.length) return;
        activeIndex = Math.max(0, activeIndex - 1);
        markActive();
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        const chosen = shown[activeIndex];
        if (chosen) execute(chosen);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closePalette(true);
      }
    });
  }
  function collectCommands() {
    const raw = ctx?.commands?.() ?? [];
    const seenIds = /* @__PURE__ */ new Set();
    const out = [];
    for (let index = 0; index < raw.length; index += 1) {
      const cmd = raw[index];
      if (!cmd || typeof cmd.run !== "function") continue;
      const title = typeof cmd.title === "string" ? cmd.title.trim() : "";
      if (!title) continue;
      const hasId = typeof cmd.id === "string" && cmd.id.trim() !== "";
      const id = hasId ? cmd.id.trim() : "";
      if (id) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
      }
      out.push({
        key: id || `__cmd_${index}`,
        id,
        title,
        hint: typeof cmd.hint === "string" ? cmd.hint.trim() : "",
        run: cmd.run
      });
    }
    return out;
  }
  function markActive() {
    if (!listEl) return;
    const rows = [...listEl.querySelectorAll(".compass-palette-item")];
    rows.forEach((row, index) => {
      const active = index === activeIndex;
      row.classList.toggle("compass-palette-item-active", active);
      row.setAttribute("aria-selected", active ? "true" : "false");
    });
    rows[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  }
  function renderList() {
    if (!listEl) return;
    listEl.replaceChildren();
    if (!shown.length) {
      listEl.append(ctx.el("div", "compass-palette-empty", "No matching commands"));
      return;
    }
    for (let index = 0; index < shown.length; index += 1) {
      const cmd = shown[index];
      const active = index === activeIndex;
      const item = ctx.button(
        `compass-palette-item${active ? " compass-palette-item-active" : ""}`
      );
      item.dataset.index = String(index);
      if (cmd.id) item.dataset.command = cmd.id;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", active ? "true" : "false");
      item.append(ctx.el("span", "compass-palette-title", cmd.title));
      if (cmd.hint) item.append(ctx.el("span", "compass-palette-hint", cmd.hint));
      listEl.append(item);
    }
  }
  function filterCommands(rawQuery) {
    const query = String(rawQuery ?? "").trim();
    if (!query) {
      shown = [...allCommands];
    } else {
      const byKey = new Map(allCommands.map((cmd) => [cmd.key, cmd]));
      const adapted = allCommands.map((cmd) => ({ uid: cmd.key, title: cmd.title }));
      const ranked = rankTitles(adapted, query, Math.max(50, allCommands.length));
      shown = ranked.map((entry) => byKey.get(entry.uid)).filter(Boolean);
    }
    activeIndex = shown.length ? 0 : -1;
    renderList();
  }
  function restoreNodeFocus() {
    const uid = savedUid;
    const key = savedKey;
    savedUid = null;
    savedKey = null;
    if (!ctx?.state?.isOpen) return;
    const world = ctx?.dom?.world;
    let target = null;
    if (key && world) {
      target = world.querySelector(`.compass-node[data-key="${escapeSelector2(key)}"]`);
    }
    if (!target && uid) {
      target = ctx?.state?.nodeEls?.get?.(uid) ?? world?.querySelector?.(`.compass-node[data-uid="${escapeSelector2(uid)}"]`) ?? null;
    }
    if (target?.isConnected) target.focus({ preventScroll: true });
  }
  function closePalette(restore = true) {
    if (!isOpen) return;
    isOpen = false;
    if (backdrop) backdrop.hidden = true;
    if (listEl) listEl.replaceChildren();
    shown = [];
    allCommands = [];
    activeIndex = 0;
    if (restore) restoreNodeFocus();
    else {
      savedUid = null;
      savedKey = null;
    }
  }
  function execute(cmd) {
    closePalette(true);
    if (ctx?.guard) ctx.guard(cmd.run)();
    else cmd.run();
  }
  function open() {
    if (!isOpen) {
      const active = globalThis.document?.activeElement;
      const nodeEl = active?.closest?.(".compass-node");
      if (nodeEl && ctx?.dom?.root?.contains?.(nodeEl)) {
        savedUid = nodeEl.dataset.uid || null;
        savedKey = nodeEl.dataset.key || null;
      } else {
        savedUid = null;
        savedKey = null;
      }
    }
    ctx?.hideFloating?.();
    allCommands = collectCommands();
    isOpen = true;
    if (input) input.value = "";
    filterCommands("");
    if (backdrop) backdrop.hidden = false;
    input?.focus({ preventScroll: true });
  }
  function onEscape() {
    if (!isOpen) return false;
    closePalette(true);
    return true;
  }
  function onClose() {
    closePalette(false);
  }
  function stageMenu() {
    return [
      { title: "Command palette…", run: () => open() },
      { title: "Keyboard help", run: () => ctx?.features?.get?.("keys")?.help?.() }
    ];
  }
  return {
    name: "palette",
    open,
    onEscape,
    onClose,
    stageMenu
  };
}

// src/model/wander.js
var MIN_SECONDS = 3;
var MAX_SECONDS = 15;
var DEFAULT_SECONDS = 6;
function clampSeconds(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return DEFAULT_SECONDS;
    return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.trunc(value)));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return DEFAULT_SECONDS;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return DEFAULT_SECONDS;
    return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.trunc(parsed)));
  }
  return DEFAULT_SECONDS;
}
function pickNext(candidates, recent, random = Math.random) {
  if (!candidates || typeof candidates[Symbol.iterator] !== "function") return null;
  const visited = /* @__PURE__ */ new Set();
  if (recent && typeof recent[Symbol.iterator] !== "function") {
  } else if (recent) {
    for (const uid of recent) {
      if (typeof uid === "string" && uid) visited.add(uid);
    }
  }
  const unvisited = [];
  const seen = /* @__PURE__ */ new Set();
  for (const uid of candidates) {
    if (typeof uid !== "string" || !uid || seen.has(uid) || visited.has(uid)) continue;
    seen.add(uid);
    unvisited.push(uid);
  }
  if (!unvisited.length) return null;
  const fn = typeof random === "function" ? random : Math.random;
  const raw = Number(fn());
  const unit = Number.isFinite(raw) ? Math.min(0.999999999999, Math.max(0, raw)) : 0;
  return unvisited[Math.floor(unit * unvisited.length)];
}
function reduce(state, event) {
  const mode = state?.mode === "playing" || state?.mode === "paused" ? state.mode : "idle";
  const reason = typeof state?.reason === "string" && state.reason ? state.reason : null;
  const type = typeof event === "string" ? event : event?.type;
  if (type === "stop") return { mode: "idle", reason: null };
  if (mode === "idle") {
    if (type === "start") return { mode: "playing", reason: null };
    return { mode: "idle", reason: null };
  }
  if (mode === "playing") {
    if (type === "pause" || type === "manual") return { mode: "paused", reason: null };
    if (type === "exhausted") return { mode: "paused", reason: "exhausted" };
    return { mode: "playing", reason: null };
  }
  if (type === "resume" || type === "start") return { mode: "playing", reason: null };
  if (type === "exhausted") return { mode: "paused", reason: "exhausted" };
  return { mode: "paused", reason };
}

// src/view/features/wander.js
var HIGHLIGHT_MS = 900;
var EXHAUSTED_STATUS = "Nowhere new from here. Pick a direction or press Play.";
function escapeSelector3(value) {
  if (typeof globalThis.CSS?.escape === "function") return globalThis.CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}
function createWander(ctx) {
  let state = { mode: "idle", reason: null };
  let pace = clampSeconds(ctx?.state?.settings?.wanderSeconds);
  let wasZen = false;
  let recent = [];
  let stepTimer = null;
  let moveTimer = null;
  let wanderNavigating = false;
  let savingPace = 0;
  let strip = null;
  let noteEl = null;
  let toggleBtn = null;
  let slider = null;
  let paceValue = null;
  let stopBtn = null;
  if (ctx?.el && ctx?.button && ctx?.lifecycle && ctx?.dom?.stage && ctx?.dom?.root) {
    strip = ctx.el("div", "compass-wander-strip");
    strip.hidden = true;
    strip.dataset.mode = "idle";
    noteEl = ctx.el("div", "compass-wander-note", EXHAUSTED_STATUS);
    noteEl.hidden = true;
    toggleBtn = ctx.button("compass-wander-toggle", "Pause", "Pause wandering");
    const paceWrap = ctx.el("label", "compass-wander-pace-wrap");
    const paceCaption = ctx.el("span", "compass-wander-pace-caption", "Pace");
    slider = ctx.el("input", "compass-wander-pace");
    slider.type = "range";
    slider.min = "3";
    slider.max = "15";
    slider.step = "1";
    slider.value = String(pace);
    slider.setAttribute("aria-label", "Wander pace in seconds");
    paceValue = ctx.el("span", "compass-wander-pace-value", `${pace}s`);
    paceWrap.append(paceCaption, slider, paceValue);
    stopBtn = ctx.button("compass-wander-stop", "×", "Stop wandering");
    strip.append(noteEl, toggleBtn, paceWrap, stopBtn);
    ctx.lifecycle.node(strip, ctx.dom.stage);
    for (const type of ["pointerdown", "click", "dblclick", "contextmenu", "wheel"]) {
      ctx.lifecycle.event(strip, type, (event) => {
        event.stopPropagation();
      });
    }
    ctx.lifecycle.event(toggleBtn, "click", () => {
      if (state.mode === "playing") pauseByButton();
      else if (state.mode === "paused") resumeWalk();
    });
    ctx.lifecycle.event(stopBtn, "click", () => {
      stop();
    });
    ctx.lifecycle.event(slider, "input", () => {
      pace = clampSeconds(slider.value);
      syncPaceUi();
      if (state.mode === "playing" && moveTimer == null) {
        scheduleNextStep();
      }
      persistPace(pace);
    });
    ctx.lifecycle.event(ctx.dom.root, "pointerdown", (event) => {
      if (state.mode !== "playing") return;
      if (strip && strip.contains(event.target)) return;
      pauseManual();
    }, true);
    ctx.lifecycle.event(ctx.dom.root, "wheel", (event) => {
      if (state.mode !== "playing") return;
      if (strip && strip.contains(event.target)) return;
      pauseManual();
    }, { capture: true, passive: true });
    ctx.lifecycle.event(ctx.dom.root, "keydown", (event) => {
      if (state.mode !== "playing") return;
      if (strip && strip.contains(event.target)) return;
      pauseManual();
    }, true);
  }
  function syncPaceUi() {
    if (slider) slider.value = String(pace);
    if (paceValue) paceValue.textContent = `${pace}s`;
  }
  function persistPace(seconds) {
    if (typeof ctx?.saveSetting !== "function") return;
    savingPace += 1;
    Promise.resolve(ctx.saveSetting(SETTING_IDS.wanderSeconds, String(seconds))).catch((error) => console.error("[compass] wander", error)).finally(() => {
      savingPace -= 1;
    });
  }
  function clearHighlight() {
    const world = ctx?.dom?.world;
    if (!world?.querySelectorAll) return;
    for (const el2 of world.querySelectorAll(".compass-wander-next")) {
      el2.classList.remove("compass-wander-next");
    }
  }
  function clearTimers() {
    if (ctx?.cancel) {
      stepTimer = ctx.cancel(stepTimer);
      moveTimer = ctx.cancel(moveTimer);
    } else {
      stepTimer = null;
      moveTimer = null;
    }
    clearHighlight();
  }
  function syncStripUi() {
    const active = state.mode !== "idle";
    ctx?.dom?.root?.classList?.toggle?.("compass-wandering", active);
    if (!strip) return;
    strip.hidden = !active;
    strip.dataset.mode = state.mode;
    if (toggleBtn) {
      const playing = state.mode === "playing";
      const label = playing ? "Pause wandering" : "Resume wandering";
      toggleBtn.textContent = playing ? "Pause" : "Play";
      toggleBtn.title = label;
      toggleBtn.setAttribute("aria-label", label);
    }
    if (noteEl) {
      noteEl.hidden = state.reason !== "exhausted";
    }
    syncPaceUi();
  }
  function elementForItem(item) {
    const world = ctx?.dom?.world;
    if (typeof item?.key === "string" && item.key && world) {
      const byKey = world.querySelector(`.compass-node[data-key="${escapeSelector3(item.key)}"]`);
      if (byKey) return byKey;
    }
    if (typeof item?.uid === "string" && item.uid) {
      const mapped = ctx?.state?.nodeEls?.get?.(item.uid);
      if (mapped) return mapped;
      if (world) {
        const byUid = world.querySelector(`.compass-node[data-uid="${escapeSelector3(item.uid)}"]`);
        if (byUid) return byUid;
      }
    }
    return null;
  }
  function currentCandidates() {
    const geometry = ctx?.state?.geometry;
    const hood = ctx?.state?.hood;
    if (!geometry?.items) return { uids: [], elements: /* @__PURE__ */ new Map() };
    const nodeByUid = /* @__PURE__ */ new Map();
    for (const node of hood?.nodes ?? []) {
      if (node?.uid) nodeByUid.set(node.uid, node);
    }
    for (const node of geometry.nodes ?? []) {
      if (node?.uid && !nodeByUid.has(node.uid)) nodeByUid.set(node.uid, node);
    }
    const uids = [];
    const elements = /* @__PURE__ */ new Map();
    const seen = /* @__PURE__ */ new Set();
    for (const item of geometry.items) {
      const uid = item?.uid;
      if (typeof uid !== "string" || !uid || uid === ctx?.state?.current || seen.has(uid)) continue;
      const node = nodeByUid.get(uid);
      if (!node) continue;
      if (node.kind !== "page" && node.kind !== "block") continue;
      if (node.kind === "group" || node.style === "board" || node.style === "card") continue;
      const el2 = elementForItem(item);
      if (!el2 || el2.classList.contains("compass-fade")) continue;
      seen.add(uid);
      uids.push(uid);
      elements.set(uid, el2);
    }
    return { uids, elements };
  }
  function scheduleNextStep() {
    clearTimers();
    if (state.mode !== "playing" || !ctx?.later) return;
    stepTimer = ctx.later(() => {
      stepTimer = null;
      if (state.mode !== "playing" || !ctx?.state?.isOpen) return;
      const { uids, elements } = currentCandidates();
      const targetUid = pickNext(uids, recent);
      if (!targetUid) {
        state = reduce(state, "exhausted");
        syncStripUi();
        ctx?.setStatus?.(EXHAUSTED_STATUS);
        return;
      }
      const targetEl = elements.get(targetUid);
      targetEl?.classList.add("compass-wander-next");
      moveTimer = ctx.later(() => {
        moveTimer = null;
        clearHighlight();
        if (state.mode !== "playing" || !ctx?.state?.isOpen) return;
        if (!recent.includes(targetUid)) recent.push(targetUid);
        wanderNavigating = true;
        try {
          ctx?.focusUid?.(targetUid);
        } finally {
          wanderNavigating = false;
        }
        if (state.mode === "playing") scheduleNextStep();
      }, HIGHLIGHT_MS);
    }, pace * 1e3);
  }
  function isActive() {
    return state.mode !== "idle";
  }
  function pauseByButton() {
    if (state.mode !== "playing") return;
    clearTimers();
    state = reduce(state, "pause");
    syncStripUi();
  }
  function pauseManual() {
    if (state.mode !== "playing") return;
    clearTimers();
    state = reduce(state, "manual");
    syncStripUi();
  }
  function resumeWalk() {
    if (state.mode !== "paused") return;
    const { uids } = currentCandidates();
    if (state.reason === "exhausted" || pickNext(uids, recent) == null) {
      recent = ctx?.state?.current ? [ctx.state.current] : [];
    }
    if (state.reason === "exhausted") ctx?.setStatus?.("");
    state = reduce(state, "resume");
    syncStripUi();
    scheduleNextStep();
  }
  function start() {
    const firstActivation = !isActive();
    if (firstActivation) {
      const zenFeature = ctx?.features?.get?.("zen");
      wasZen = Boolean(zenFeature?.isZen?.() ?? ctx?.dom?.root?.classList?.contains?.("compass-zen"));
      if (zenFeature?.setZen) zenFeature.setZen(true);
      else ctx?.dom?.root?.classList?.add?.("compass-zen");
      recent = ctx?.state?.current ? [ctx.state.current] : [];
      pace = clampSeconds(ctx?.state?.settings?.wanderSeconds ?? pace);
    } else if (state.reason === "exhausted") {
      recent = ctx?.state?.current ? [ctx.state.current] : [];
      ctx?.setStatus?.("");
    }
    state = reduce(state, "start");
    syncStripUi();
    scheduleNextStep();
  }
  function stop({ closing = false } = {}) {
    if (!isActive()) return;
    clearTimers();
    if (state.reason === "exhausted") ctx?.setStatus?.("");
    state = reduce(state, "stop");
    recent = [];
    syncStripUi();
    if (!closing) {
      const zenFeature = ctx?.features?.get?.("zen");
      if (zenFeature?.setZen) zenFeature.setZen(wasZen);
      else ctx?.dom?.root?.classList?.toggle?.("compass-zen", wasZen);
    }
    wasZen = false;
  }
  function onSettings(settings) {
    if (!settings || savingPace > 0) return;
    pace = clampSeconds(settings.wanderSeconds);
    syncPaceUi();
  }
  function onNavigate({ uid } = {}) {
    if (!isActive()) return;
    if (uid && !recent.includes(uid)) recent.push(uid);
    if (!wanderNavigating && state.mode === "playing") {
      pauseManual();
    }
  }
  function onWheel(event) {
    if (state.mode === "playing" && (!strip || !strip.contains(event?.target))) {
      pauseManual();
    }
    return false;
  }
  function onKey(event) {
    if (state.mode === "playing" && (!strip || !strip.contains(event?.target))) {
      pauseManual();
    }
    return false;
  }
  function onEscape() {
    if (!isActive()) return false;
    stop();
    return true;
  }
  function onClose() {
    stop({ closing: true });
  }
  function commands() {
    return [
      {
        id: "wander",
        title: isActive() ? "Stop wandering" : "Wander",
        hint: "",
        run: () => isActive() ? stop() : start()
      }
    ];
  }
  function stageMenu() {
    return [
      { title: "Wander", run: () => start() }
    ];
  }
  return {
    name: "wander",
    start,
    stop: () => stop(),
    pause: pauseManual,
    isActive,
    onSettings,
    onNavigate,
    onWheel,
    onKey,
    onEscape,
    onClose,
    commands,
    stageMenu
  };
}

// src/view/features/zen.js
function createZen(ctx) {
  let zen = false;
  let full = false;
  let zenBtn = null;
  let fullBtn = null;
  if (ctx?.el && ctx?.button && ctx?.lifecycle && ctx?.dom?.stage) {
    const cluster = ctx.el("div", "compass-corner");
    const fitBtn = ctx.button("compass-corner-btn compass-corner-fit", "Fit", "Fit to screen");
    zenBtn = ctx.button("compass-corner-btn compass-corner-zen", "Zen", "Toggle Zen mode");
    zenBtn.setAttribute("aria-pressed", "false");
    fullBtn = ctx.button("compass-corner-btn compass-corner-full", "Full", "Toggle fullscreen");
    fullBtn.setAttribute("aria-pressed", "false");
    cluster.append(fitBtn, zenBtn, fullBtn);
    ctx.lifecycle.node(cluster, ctx.dom.stage);
    ctx.lifecycle.event(cluster, "pointerdown", (event) => {
      event.stopPropagation();
    });
    ctx.lifecycle.event(cluster, "click", (event) => {
      event.stopPropagation();
    });
    ctx.lifecycle.event(cluster, "dblclick", (event) => {
      event.stopPropagation();
    });
    ctx.lifecycle.event(fitBtn, "click", () => {
      ctx?.fit?.(true);
    });
    ctx.lifecycle.event(zenBtn, "click", () => {
      toggleZen();
    });
    ctx.lifecycle.event(fullBtn, "click", () => {
      toggleFull();
    });
  }
  function isZen() {
    return zen;
  }
  function setZen(on) {
    zen = Boolean(on);
    ctx?.dom?.root?.classList?.toggle?.("compass-zen", zen);
    zenBtn?.setAttribute("aria-pressed", zen ? "true" : "false");
    if (zen) {
      const active = globalThis.document?.activeElement;
      if (active && (ctx?.dom?.bar?.contains?.(active) || ctx?.dom?.pinRow?.contains?.(active))) {
        active.blur?.();
      }
    }
  }
  function toggleZen() {
    setZen(!zen);
  }
  function setFull(on) {
    full = Boolean(on);
    ctx?.dom?.root?.classList?.toggle?.("compass-full", full);
    fullBtn?.setAttribute("aria-pressed", full ? "true" : "false");
  }
  function toggleFull() {
    setFull(!full);
  }
  function onEscape() {
    if (zen) {
      setZen(false);
      return true;
    }
    if (full) {
      setFull(false);
      return true;
    }
    return false;
  }
  function onClose() {
    setZen(false);
    setFull(false);
  }
  function commands() {
    return [
      { id: "zen", title: "Toggle Zen mode", hint: "", run: () => toggleZen() },
      { id: "fullscreen", title: "Toggle fullscreen", hint: "", run: () => toggleFull() }
    ];
  }
  function stageMenu() {
    return [
      { title: "Toggle Zen mode", run: () => toggleZen() },
      { title: "Toggle fullscreen", run: () => toggleFull() }
    ];
  }
  return {
    name: "zen",
    isZen,
    setZen,
    toggleZen,
    toggleFull,
    onEscape,
    onClose,
    commands,
    stageMenu
  };
}

// src/model/outline-export.js
var INDENT = "    ";
var SIDES = Object.freeze([
  Object.freeze(["north", "Parents"]),
  Object.freeze(["south", "Children"]),
  Object.freeze(["west", "Friends"]),
  Object.freeze(["east", "Challengers"]),
  Object.freeze(["siblings", "Siblings"])
]);
function resolveOptions(options) {
  if (Array.isArray(options)) {
    return { labels: "visible", hidden: /* @__PURE__ */ new Set(), warnings: options };
  }
  const raw = options && typeof options === "object" ? options : {};
  const labels = raw.labels === "none" || raw.labels === "all" ? raw.labels : "visible";
  const hidden = raw.hidden instanceof Set ? raw.hidden : new Set(Array.isArray(raw.hidden) ? raw.hidden : []);
  const warnings = Array.isArray(raw.warnings) ? raw.warnings : null;
  return { labels, hidden, warnings };
}
function createTracker() {
  return {
    unlinked: /* @__PURE__ */ new Set(),
    hidden: /* @__PURE__ */ new Set()
  };
}
function flushWarnings(tracker, target) {
  if (!Array.isArray(target)) return;
  const unlinkedCount = tracker.unlinked.size;
  if (unlinkedCount > 0) {
    target.push(
      unlinkedCount === 1 ? "1 title could not be written as a link." : `${unlinkedCount} titles could not be written as a link.`
    );
  }
  const hiddenCount = tracker.hidden.size;
  if (hiddenCount > 0) {
    target.push(
      hiddenCount === 1 ? "1 hidden node was left out." : `${hiddenCount} hidden nodes were left out.`
    );
  }
}
function groupText(node) {
  const alias = typeof node?.alias === "string" ? node.alias.trim() : "";
  const title = typeof node?.title === "string" ? node.title.trim() : "";
  const fallback = typeof node?.uid === "string" ? node.uid.trim() : "";
  const base = alias || title || fallback || "Group";
  const count2 = Number.isFinite(node?.count) ? node.count : Array.isArray(node?.members) ? node.members.length : Array.isArray(node?.nodes) ? node.nodes.length : Array.isArray(node?.uids) ? node.uids.length : Array.isArray(node?.items) ? node.items.length : null;
  if (count2 == null) return base;
  if (base.includes(`(${count2})`) || new RegExp(`(?:^|\\D)${count2}(?:\\D|$)`).test(base)) {
    return base;
  }
  return `${title || base} (${count2})`;
}
function formatNodeRef(node, tracker) {
  if (!node || typeof node !== "object") return "";
  if (node.kind === "group") return groupText(node);
  if (node.kind === "block") {
    const uid = typeof node.uid === "string" ? node.uid.trim() : "";
    if (uid) return `((${uid}))`;
    return typeof node.title === "string" ? node.title.trim() : "";
  }
  const title = typeof node.title === "string" && node.title ? node.title : typeof node.uid === "string" ? node.uid : "";
  if (!title) return "";
  if (title.includes("]]")) {
    tracker.unlinked.add(typeof node.uid === "string" && node.uid ? `uid:${node.uid}` : `title:${title}`);
    return title;
  }
  return `[[${title}]]`;
}
function untypedEvidenceLabel(node) {
  const kinds = [];
  const add = (value) => {
    if (value && !kinds.includes(value)) kinds.push(value);
  };
  if (Array.isArray(node?.evidence)) {
    for (const item of node.evidence) {
      if (!item || typeof item !== "object") continue;
      if (item.kind === "typed") {
        const parts = [item.attribute, ...Array.isArray(item.labels) ? item.labels : []].filter(Boolean);
        if (parts.length) add(parts.join(" · "));
      } else if (item.kind === "structural") {
        if (item.note === "day") add("day");
        else if (item.note === "namespace") add("namespace");
        else if (typeof item.note === "string" && item.note.trim()) add(item.note.trim());
      } else if (item.kind === "link" || item.kind === "mention" || item.kind === "sibling" || item.kind === "namespace" || item.kind === "day") {
        add(item.kind);
      }
    }
  }
  if (!kinds.length) {
    const style = typeof node?.style === "string" ? node.style.trim() : "";
    if (style === "link" || style === "mention" || style === "sibling" || style === "namespace" || style === "day") {
      add(style);
    } else if (style === "structural") {
      add(node?.role === "previous" || node?.role === "next" ? "day" : "namespace");
    } else if (node?.role === "sibling") {
      add("sibling");
    }
  }
  return kinds.join(" | ");
}
function relationLabel(node, labelsMode) {
  if (labelsMode === "none") return "";
  const explicit = typeof node?.label === "string" ? node.label.trim() : "";
  if (explicit) return explicit;
  if (labelsMode !== "all" || node?.kind === "group") return "";
  return untypedEvidenceLabel(node);
}
function formatBulletText(node, labelsMode, tracker) {
  const ref = formatNodeRef(node, tracker);
  if (!ref) return "";
  const rel = relationLabel(node, labelsMode);
  return rel ? `${ref} — ${rel}` : ref;
}
function lineAt(depth, text) {
  return `${INDENT.repeat(depth)}- ${text}`;
}
function compassOutline(hood, options = {}) {
  const { labels, hidden, warnings } = resolveOptions(options);
  const center = hood?.center;
  if (!center || typeof center !== "object") return "";
  const tracker = createTracker();
  const topText = formatNodeRef(center, tracker);
  if (!topText) return "";
  const lines = [lineAt(0, topText)];
  const nodes = Array.isArray(hood?.nodes) ? hood.nodes : [];
  for (const [zone, heading] of SIDES) {
    const section = [];
    for (const node of nodes) {
      if (!node || node.zone !== zone) continue;
      if (typeof node.uid === "string" && node.uid && hidden.has(node.uid)) {
        tracker.hidden.add(node.uid);
        continue;
      }
      const bullet = formatBulletText(node, labels, tracker);
      if (bullet) section.push(lineAt(2, bullet));
    }
    if (section.length > 0) {
      lines.push(lineAt(1, heading), ...section);
    }
  }
  flushWarnings(tracker, warnings);
  return lines.join("\n");
}
function treeOutline2(outline, options = {}) {
  const { labels, hidden, warnings } = resolveOptions(options);
  const root = outline?.root;
  if (!root || typeof root !== "object") return "";
  const tracker = createTracker();
  const rootText = formatNodeRef(root, tracker);
  if (!rootText) return "";
  const lines = [lineAt(0, rootText)];
  function writeItem(item, depth, out) {
    if (!item || typeof item !== "object") return;
    if (typeof item.uid === "string" && item.uid && hidden.has(item.uid)) {
      tracker.hidden.add(item.uid);
      return;
    }
    const repeat = item.status === "repeat" || item.repeat === true;
    const base = formatBulletText(item, labels, tracker);
    if (!base) return;
    out.push(lineAt(depth, repeat ? `${base} ↺` : base));
    if (repeat || !Array.isArray(item.children)) return;
    for (const child of item.children) {
      writeItem(child, depth + 1, out);
    }
  }
  const parents = Array.isArray(outline?.parents) ? outline.parents : [];
  if (parents.length > 0) {
    const parentLines = [];
    for (const parent of parents) {
      writeItem(parent, 2, parentLines);
    }
    if (parentLines.length > 0) {
      lines.push(lineAt(1, "Parents"), ...parentLines);
    }
  }
  const rootRepeat = root.status === "repeat" || root.repeat === true;
  if (!rootRepeat && Array.isArray(root.children)) {
    for (const child of root.children) {
      writeItem(child, 1, lines);
    }
  }
  flushWarnings(tracker, warnings);
  return lines.join("\n");
}
function lookupNode(nodesByUid, uid) {
  if (!uid || !nodesByUid) return null;
  if (nodesByUid instanceof Map) return nodesByUid.get(uid) ?? null;
  if (typeof nodesByUid === "object") return nodesByUid[uid] ?? null;
  return null;
}
function resolveFacetEntry(entry, nodesByUid) {
  if (typeof entry === "string") {
    const trimmed = entry.trim();
    if (!trimmed) return null;
    return lookupNode(nodesByUid, trimmed) ?? { uid: trimmed, kind: "page", title: trimmed };
  }
  if (!entry || typeof entry !== "object") return null;
  const uid = typeof entry.uid === "string" ? entry.uid : "";
  const stored = uid ? lookupNode(nodesByUid, uid) : null;
  return stored ? { ...entry, ...stored } : entry;
}
function facetsOutline(classified, nodesByUid, center, options = {}) {
  const { labels, hidden, warnings } = resolveOptions(options);
  const effectiveCenter = center ?? classified?.center;
  if (!classified || typeof classified !== "object" || !effectiveCenter || typeof effectiveCenter !== "object") {
    return "";
  }
  const tracker = createTracker();
  const topText = formatNodeRef(effectiveCenter, tracker);
  if (!topText) return "";
  const lines = [lineAt(0, topText)];
  function writeBucket(heading, rawEntries) {
    if (!heading || !Array.isArray(rawEntries) || rawEntries.length === 0) return;
    const section = [];
    for (const raw of rawEntries) {
      const node = resolveFacetEntry(raw, nodesByUid);
      if (!node) continue;
      if (typeof node.uid === "string" && node.uid && hidden.has(node.uid)) {
        tracker.hidden.add(node.uid);
        continue;
      }
      const bullet = formatBulletText(node, labels, tracker);
      if (bullet) section.push(lineAt(2, bullet));
    }
    if (section.length > 0) {
      lines.push(lineAt(1, heading), ...section);
    }
  }
  const categories = Array.isArray(classified.categories) ? classified.categories : Array.isArray(classified.buckets) ? classified.buckets : Array.isArray(classified.columns) ? classified.columns : [];
  for (const cat of categories) {
    if (!cat || typeof cat !== "object") continue;
    const heading = String(cat.label ?? cat.name ?? cat.title ?? cat.id ?? "").trim();
    const entries = cat.uids ?? cat.nodes ?? cat.items ?? cat.members ?? [];
    writeBucket(heading, entries);
  }
  writeBucket("Unassigned", classified.unassigned);
  writeBucket("Conflicting", classified.conflicting ?? classified.conflicts);
  flushWarnings(tracker, warnings);
  return lines.join("\n");
}
function breadcrumbs(entries, options = {}) {
  const { warnings } = resolveOptions(options);
  if (!Array.isArray(entries) || entries.length === 0) return "";
  const valid = entries.filter((item) => item && typeof item === "object");
  if (valid.length === 0) return "";
  const hasTimestamps = valid.some((item) => Number.isFinite(item.at));
  const ordered = hasTimestamps ? [...valid].sort((a, b) => {
    const atA = Number.isFinite(a.at) ? a.at : -Infinity;
    const atB = Number.isFinite(b.at) ? b.at : -Infinity;
    return atB - atA;
  }) : valid;
  const tracker = createTracker();
  const lines = [];
  for (const entry of ordered) {
    const ref = formatNodeRef(entry, tracker);
    if (ref) lines.push(lineAt(0, ref));
  }
  flushWarnings(tracker, warnings);
  return lines.join("\n");
}

// src/model/paint.js
function clamp2(value, low, high) {
  return Math.max(low, Math.min(high, value));
}
function fmt(value) {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
function resolveDash(dashed, scale) {
  if (!dashed || dashed === "none" || dashed === "solid") return [];
  if (Array.isArray(dashed)) {
    return dashed.map((item) => Number(item) * scale).filter((num) => Number.isFinite(num) && num > 0).map((num) => Math.max(0.5, Math.round(num * 100) / 100));
  }
  if (typeof dashed === "string") {
    const trimmed = dashed.trim().toLowerCase();
    if (!trimmed || trimmed === "none" || trimmed === "solid") return [];
    if (trimmed === "dotted") return [fmtNum(2 * scale), fmtNum(3 * scale)];
    if (trimmed === "dashed") return [fmtNum(5 * scale), fmtNum(4 * scale)];
    const matches2 = trimmed.match(/[-+]?(?:\d+\.?\d*|\.\d+)/g);
    if (matches2) {
      return matches2.map((raw) => Number(raw) * scale).filter((num) => Number.isFinite(num) && num > 0).map((num) => Math.max(0.5, fmtNum(num)));
    }
    return [];
  }
  if (dashed === true) return [fmtNum(5 * scale), fmtNum(4 * scale)];
  return [];
}
function fmtNum(value) {
  return Math.round(value * 100) / 100;
}
function scaleFont(font, scale, bold = false) {
  const raw = typeof font === "string" && font.trim() ? font.trim() : "13px sans-serif";
  const scaled = raw.replace(
    /(\d+(?:\.\d+)?)px(\s*\/\s*(\d+(?:\.\d+)?)px)?/i,
    (_all, size, slashPart, lineHeight) => {
      const nextSize = fmt(Math.max(1, Number(size) * scale));
      if (!slashPart || !lineHeight) return `${nextSize}px`;
      const nextLh = fmt(Math.max(1, Number(lineHeight) * scale));
      return `${nextSize}px/${nextLh}px`;
    }
  );
  if (bold && !/\b(?:bold|[6-9]00)\b/i.test(scaled)) {
    return `600 ${scaled}`;
  }
  return scaled;
}
var PATH_TOKEN = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
var CMD_ARITY = Object.freeze({
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0
});
function transformPath(d, originX, originY, scale) {
  if (typeof d !== "string" || !d.trim()) return null;
  const tokens = d.match(PATH_TOKEN);
  if (!tokens || !tokens.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasPoint = false;
  const mark = (wx, wy) => {
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) return;
    hasPoint = true;
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
  };
  const pxX = (wx) => fmt((wx - originX) * scale);
  const pxY = (wy) => fmt((wy - originY) * scale);
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let cmd = "";
  const parts = [];
  let idx = 0;
  while (idx < tokens.length) {
    const tok = tokens[idx];
    if (/^[A-Za-z]$/.test(tok)) {
      cmd = tok;
      idx += 1;
      if (cmd.toUpperCase() === "Z") {
        cx = sx;
        cy = sy;
        parts.push("Z");
        cmd = "";
      }
      continue;
    }
    if (!cmd) {
      idx += 1;
      continue;
    }
    const upper = cmd.toUpperCase();
    const arity = CMD_ARITY[upper];
    if (!arity || idx + arity > tokens.length) break;
    const nums = [];
    let validNums = true;
    for (let k = 0; k < arity; k += 1) {
      const val = Number(tokens[idx + k]);
      if (!Number.isFinite(val)) {
        validNums = false;
        break;
      }
      nums.push(val);
    }
    if (!validNums) break;
    idx += arity;
    const rel = cmd !== upper;
    if (upper === "M") {
      const wx = rel ? cx + nums[0] : nums[0];
      const wy = rel ? cy + nums[1] : nums[1];
      mark(wx, wy);
      cx = wx;
      cy = wy;
      sx = wx;
      sy = wy;
      parts.push(`M${pxX(wx)},${pxY(wy)}`);
      cmd = rel ? "l" : "L";
    } else if (upper === "L") {
      const wx = rel ? cx + nums[0] : nums[0];
      const wy = rel ? cy + nums[1] : nums[1];
      mark(wx, wy);
      cx = wx;
      cy = wy;
      parts.push(`L${pxX(wx)},${pxY(wy)}`);
    } else if (upper === "H") {
      const wx = rel ? cx + nums[0] : nums[0];
      mark(wx, cy);
      cx = wx;
      parts.push(`L${pxX(wx)},${pxY(cy)}`);
    } else if (upper === "V") {
      const wy = rel ? cy + nums[0] : nums[0];
      mark(cx, wy);
      cy = wy;
      parts.push(`L${pxX(cx)},${pxY(wy)}`);
    } else if (upper === "C") {
      const x1 = rel ? cx + nums[0] : nums[0];
      const y1 = rel ? cy + nums[1] : nums[1];
      const x2 = rel ? cx + nums[2] : nums[2];
      const y2 = rel ? cy + nums[3] : nums[3];
      const x = rel ? cx + nums[4] : nums[4];
      const y = rel ? cy + nums[5] : nums[5];
      mark(x1, y1);
      mark(x2, y2);
      mark(x, y);
      cx = x;
      cy = y;
      parts.push(`C${pxX(x1)},${pxY(y1)} ${pxX(x2)},${pxY(y2)} ${pxX(x)},${pxY(y)}`);
    } else if (upper === "S") {
      const x2 = rel ? cx + nums[0] : nums[0];
      const y2 = rel ? cy + nums[1] : nums[1];
      const x = rel ? cx + nums[2] : nums[2];
      const y = rel ? cy + nums[3] : nums[3];
      mark(x2, y2);
      mark(x, y);
      cx = x;
      cy = y;
      parts.push(`S${pxX(x2)},${pxY(y2)} ${pxX(x)},${pxY(y)}`);
    } else if (upper === "Q") {
      const x1 = rel ? cx + nums[0] : nums[0];
      const y1 = rel ? cy + nums[1] : nums[1];
      const x = rel ? cx + nums[2] : nums[2];
      const y = rel ? cy + nums[3] : nums[3];
      mark(x1, y1);
      mark(x, y);
      cx = x;
      cy = y;
      parts.push(`Q${pxX(x1)},${pxY(y1)} ${pxX(x)},${pxY(y)}`);
    } else if (upper === "T") {
      const x = rel ? cx + nums[0] : nums[0];
      const y = rel ? cy + nums[1] : nums[1];
      mark(x, y);
      cx = x;
      cy = y;
      parts.push(`T${pxX(x)},${pxY(y)}`);
    } else if (upper === "A") {
      const rx = Math.abs(nums[0]);
      const ry = Math.abs(nums[1]);
      const rot = nums[2];
      const large = nums[3] ? 1 : 0;
      const sweep = nums[4] ? 1 : 0;
      const x = rel ? cx + nums[5] : nums[5];
      const y = rel ? cy + nums[6] : nums[6];
      mark(x - rx, y - ry);
      mark(x + rx, y + ry);
      mark(x, y);
      cx = x;
      cy = y;
      parts.push(`A${fmt(rx * scale)},${fmt(ry * scale)} ${fmt(rot)} ${large} ${sweep} ${pxX(x)},${pxY(y)}`);
    }
  }
  if (!hasPoint || !parts.length) return null;
  return { d: parts.join(" "), minX, minY, maxX, maxY };
}
function rectOutside(x, y, w, h, scopeMinX, scopeMinY, scopeMaxX, scopeMaxY) {
  if (!(w > 0) || !(h > 0)) return true;
  return x + w <= scopeMinX || x >= scopeMaxX || y + h <= scopeMinY || y >= scopeMaxY;
}
function pathOutside(bbox, scopeMinX, scopeMinY, scopeMaxX, scopeMaxY) {
  const outX = bbox.minX < bbox.maxX ? bbox.maxX <= scopeMinX || bbox.minX >= scopeMaxX : bbox.minX < scopeMinX || bbox.minX > scopeMaxX;
  if (outX) return true;
  const outY = bbox.minY < bbox.maxY ? bbox.maxY <= scopeMinY || bbox.minY >= scopeMaxY : bbox.minY < scopeMinY || bbox.minY > scopeMaxY;
  return outY;
}
function fallbackBounds(boxes, regions) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const list of [boxes, regions]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || !Number.isFinite(item.x) || !Number.isFinite(item.y)) continue;
      const w = Number.isFinite(item.w) ? item.w : 0;
      const h = Number.isFinite(item.h) ? item.h : 0;
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + w);
      maxY = Math.max(maxY, item.y + h);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  return { minX, minY, maxX, maxY };
}
function fitText(text, maxWidth, measure) {
  const str = String(text ?? "");
  if (!str) return "";
  if (typeof measure !== "function") return str;
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return "";
  if (measure(str) <= maxWidth) return str;
  if (measure("…") > maxWidth) return "";
  const chars = Array.from(str);
  let low = 0;
  let high = chars.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${chars.slice(0, mid).join("")}…`;
    if (measure(candidate) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return `${chars.slice(0, low).join("")}…`;
}
function paintPlan({
  boxes = [],
  paths = [],
  regions = [],
  labels = [],
  bounds = null,
  viewport = null,
  scope = "all",
  scale = 1,
  transparent = false,
  paper = "#ffffff",
  maxSide = 8192,
  pad: pad3 = 24
} = {}) {
  const padding = Number.isFinite(pad3) && pad3 >= 0 ? pad3 : 24;
  let originX;
  let originY;
  let worldW;
  let worldH;
  if (scope === "viewport" && viewport && Number.isFinite(viewport.x) && Number.isFinite(viewport.y) && Number.isFinite(viewport.w) && Number.isFinite(viewport.h)) {
    originX = viewport.x;
    originY = viewport.y;
    worldW = Math.max(1, viewport.w);
    worldH = Math.max(1, viewport.h);
  } else {
    const b = bounds && Number.isFinite(bounds.minX) && Number.isFinite(bounds.minY) && Number.isFinite(bounds.maxX) && Number.isFinite(bounds.maxY) ? bounds : fallbackBounds(boxes, regions);
    originX = b.minX - padding;
    originY = b.minY - padding;
    worldW = Math.max(1, b.maxX - b.minX + padding * 2);
    worldH = Math.max(1, b.maxY - b.minY + padding * 2);
  }
  const scopeMinX = originX;
  const scopeMinY = originY;
  const scopeMaxX = originX + worldW;
  const scopeMaxY = originY + worldH;
  const requestedScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const limit = Number.isFinite(maxSide) && maxSide > 0 ? maxSide : 8192;
  let effectiveScale = requestedScale;
  let reduced = false;
  const warnings = [];
  if (worldW * requestedScale > limit || worldH * requestedScale > limit) {
    effectiveScale = Math.min(limit / worldW, limit / worldH);
    reduced = true;
    warnings.push("The image was reduced to fit the size limit.");
  }
  const s = effectiveScale;
  const width = Math.min(Math.floor(limit), Math.max(1, Math.round(worldW * s)));
  const height = Math.min(Math.floor(limit), Math.max(1, Math.round(worldH * s)));
  const effectiveScaleRounded = Math.round(s * 1e4) / 1e4;
  const ops = [];
  if (!transparent) {
    ops.push({
      op: "rect",
      layer: "background",
      x: 0,
      y: 0,
      w: width,
      h: height,
      fill: paper || "#ffffff",
      stroke: null,
      lineWidth: 0,
      dash: [],
      radius: 0,
      opacity: 1
    });
  }
  if (Array.isArray(regions)) {
    for (const region of regions) {
      if (!region || typeof region !== "object") continue;
      const rx = Number(region.x);
      const ry = Number(region.y);
      const rw = Number(region.w);
      const rh = Number(region.h);
      if (!Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(rw) || !Number.isFinite(rh)) continue;
      if (rectOutside(rx, ry, rw, rh, scopeMinX, scopeMinY, scopeMaxX, scopeMaxY)) continue;
      const px = fmtNum((rx - originX) * s);
      const py = fmtNum((ry - originY) * s);
      const pw = fmtNum(rw * s);
      const ph = fmtNum(rh * s);
      const opacity = Number.isFinite(region.opacity) ? clamp2(region.opacity, 0, 1) : 1;
      const radius = Math.max(0, Math.min(pw / 2, ph / 2, fmtNum((Number(region.radius) || 0) * s)));
      ops.push({
        op: "rect",
        layer: "region",
        x: px,
        y: py,
        w: pw,
        h: ph,
        fill: region.fill || null,
        stroke: region.stroke || null,
        lineWidth: region.stroke ? Math.max(0.5, fmtNum((Number(region.width) || 1) * s)) : 0,
        dash: resolveDash(region.dashed, s),
        radius,
        opacity
      });
      const regionLabel = typeof region.label === "string" ? region.label.trim() : "";
      if (regionLabel) {
        const insetX = fmtNum(12 * s);
        const insetY = fmtNum(16 * s);
        ops.push({
          op: "text",
          layer: "region",
          x: fmtNum(px + insetX),
          y: fmtNum(py + insetY),
          text: regionLabel,
          color: region.color || "#000000",
          font: scaleFont(region.font || "600 12px sans-serif", s),
          bold: true,
          maxWidth: Math.max(0, fmtNum(pw - insetX * 2)),
          align: "left",
          baseline: "middle",
          halo: null,
          haloWidth: 0,
          opacity
        });
      }
    }
  }
  if (Array.isArray(paths)) {
    for (const path of paths) {
      if (!path || typeof path !== "object") continue;
      const parsed = transformPath(path.d, originX, originY, s);
      if (!parsed) continue;
      if (pathOutside(parsed, scopeMinX, scopeMinY, scopeMaxX, scopeMaxY)) continue;
      const opacity = Number.isFinite(path.opacity) ? clamp2(path.opacity, 0, 1) : 1;
      if (opacity <= 0) continue;
      ops.push({
        op: "path",
        layer: "path",
        d: parsed.d,
        stroke: path.stroke || "#888888",
        lineWidth: Math.max(0.5, fmtNum((Number(path.width) || 1.25) * s)),
        dash: resolveDash(path.dashed, s),
        opacity
      });
    }
  }
  if (Array.isArray(boxes)) {
    for (const box of boxes) {
      if (!box || typeof box !== "object") continue;
      const bx = Number(box.x);
      const by = Number(box.y);
      const bw = Number(box.w);
      const bh = Number(box.h);
      if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bw) || !Number.isFinite(bh)) continue;
      if (rectOutside(bx, by, bw, bh, scopeMinX, scopeMinY, scopeMaxX, scopeMaxY)) continue;
      const opacity = Number.isFinite(box.opacity) ? clamp2(box.opacity, 0, 1) : 1;
      if (opacity <= 0) continue;
      const px = fmtNum((bx - originX) * s);
      const py = fmtNum((by - originY) * s);
      const pw = fmtNum(bw * s);
      const ph = fmtNum(bh * s);
      const radius = Math.max(0, Math.min(pw / 2, ph / 2, fmtNum((Number(box.radius) || 0) * s)));
      const strokeWidth = Number(box.borderWidth ?? box.width) || 1.25;
      ops.push({
        op: "rect",
        layer: "box",
        x: px,
        y: py,
        w: pw,
        h: ph,
        fill: box.fill || null,
        stroke: box.stroke || null,
        lineWidth: box.stroke ? Math.max(0.5, fmtNum(strokeWidth * s)) : 0,
        dash: resolveDash(box.dashed, s),
        radius,
        opacity
      });
      const boxText = typeof box.text === "string" ? box.text.trim() : "";
      if (boxText) {
        const padX = fmtNum((Number.isFinite(box.padX) ? box.padX : 10) * s);
        const align = box.align === "center" ? "center" : "left";
        const tx = align === "center" ? fmtNum(px + pw / 2) : fmtNum(px + padX);
        const ty = fmtNum(py + ph / 2);
        ops.push({
          op: "text",
          layer: "box",
          x: tx,
          y: ty,
          text: boxText,
          color: box.color || "#000000",
          font: scaleFont(box.font, s, Boolean(box.bold)),
          bold: Boolean(box.bold),
          maxWidth: Math.max(0, fmtNum(pw - padX * 2)),
          align,
          baseline: "middle",
          halo: null,
          haloWidth: 0,
          opacity
        });
      }
    }
  }
  if (Array.isArray(labels)) {
    for (const label of labels) {
      if (!label || typeof label !== "object") continue;
      const lx = Number(label.x);
      const ly = Number(label.y);
      const text = typeof label.text === "string" ? label.text.trim() : "";
      if (!text || !Number.isFinite(lx) || !Number.isFinite(ly)) continue;
      if (lx < scopeMinX || lx > scopeMaxX || ly < scopeMinY || ly > scopeMaxY) continue;
      const opacity = Number.isFinite(label.opacity) ? clamp2(label.opacity, 0, 1) : 1;
      if (opacity <= 0) continue;
      const halo = label.halo !== void 0 ? label.halo : transparent ? null : paper || null;
      ops.push({
        op: "text",
        layer: "label",
        x: fmtNum((lx - originX) * s),
        y: fmtNum((ly - originY) * s),
        text,
        color: label.color || "#000000",
        font: scaleFont(label.font || "11px sans-serif", s, Boolean(label.bold)),
        bold: Boolean(label.bold),
        maxWidth: fmtNum((Number(label.maxWidth) || 260) * s),
        align: label.align || "center",
        baseline: label.baseline || "alphabetic",
        halo,
        haloWidth: halo ? fmtNum(4 * s) : 0,
        opacity
      });
    }
  }
  return {
    width,
    height,
    scale: reduced ? effectiveScaleRounded : effectiveScale,
    reduced,
    ops,
    warnings
  };
}

// src/view/features/export.js
function safeFilename(title, ext) {
  const cleaned = String(title ?? "").trim().replace(/[/\\:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80).toLowerCase();
  return `compass-${cleaned || "map"}.${ext}`;
}
function getStyle(element) {
  const fn = globalThis.getComputedStyle;
  if (typeof fn !== "function" || !element) return null;
  try {
    return fn(element);
  } catch {
    return null;
  }
}
function nonTransparent(color) {
  if (typeof color !== "string") return null;
  const trimmed = color.trim();
  if (!trimmed || trimmed === "transparent" || trimmed === "none" || trimmed === "rgba(0, 0, 0, 0)") {
    return null;
  }
  return trimmed;
}
function isBoldStyle(style) {
  const weight = style?.fontWeight;
  if (!weight) return false;
  if (weight === "bold" || weight === "bolder") return true;
  const num = Number(weight);
  return Number.isFinite(num) && num >= 600;
}
function fontFromStyle(style, fallback) {
  if (!style) return fallback;
  const size = style.fontSize;
  const family = style.fontFamily;
  if (!size || !family) {
    return typeof style.font === "string" && style.font.trim() ? style.font.trim() : fallback;
  }
  const slope = style.fontStyle && style.fontStyle !== "normal" ? `${style.fontStyle} ` : "";
  const weight = style.fontWeight && style.fontWeight !== "normal" && style.fontWeight !== "400" ? `${style.fontWeight} ` : "";
  return `${slope}${weight}${size} ${family}`;
}
function collectTreeNodes(outline, extraNodes) {
  const map = /* @__PURE__ */ new Map();
  const add = (node) => {
    if (!node || typeof node.uid !== "string" || !node.uid) return;
    if (!map.has(node.uid)) map.set(node.uid, node);
  };
  for (const node of extraNodes ?? []) add(node);
  const walk2 = (item) => {
    if (!item || typeof item !== "object") return;
    add(item);
    if (Array.isArray(item.children)) {
      for (const child of item.children) walk2(child);
    }
  };
  if (Array.isArray(outline?.parents)) {
    for (const parent of outline.parents) walk2(parent);
  }
  if (Array.isArray(outline?.root?.children)) {
    for (const child of outline.root.children) walk2(child);
  }
  return [...map.values()];
}
function drawRoundedRect(ctx2d, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r || 0, w / 2, h / 2));
  ctx2d.beginPath();
  if (radius <= 0) {
    ctx2d.rect(x, y, w, h);
  } else if (typeof ctx2d.roundRect === "function") {
    ctx2d.roundRect(x, y, w, h, radius);
  } else {
    ctx2d.moveTo(x + radius, y);
    ctx2d.arcTo(x + w, y, x + w, y + h, radius);
    ctx2d.arcTo(x + w, y + h, x, y + h, radius);
    ctx2d.arcTo(x, y + h, x, y, radius);
    ctx2d.arcTo(x, y, x + w, y, radius);
    ctx2d.closePath();
  }
}
function executePlan(canvas, plan) {
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx2d = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  if (!ctx2d) return false;
  ctx2d.clearRect(0, 0, plan.width, plan.height);
  for (const op of plan.ops) {
    ctx2d.save();
    if (Number.isFinite(op.opacity) && op.opacity < 1) {
      ctx2d.globalAlpha = Math.max(0, op.opacity);
    }
    if (op.op === "rect") {
      drawRoundedRect(ctx2d, op.x, op.y, op.w, op.h, op.radius);
      if (nonTransparent(op.fill)) {
        ctx2d.fillStyle = op.fill;
        ctx2d.fill();
      }
      if (nonTransparent(op.stroke) && op.lineWidth > 0) {
        ctx2d.strokeStyle = op.stroke;
        ctx2d.lineWidth = op.lineWidth;
        if (typeof ctx2d.setLineDash === "function") {
          ctx2d.setLineDash(Array.isArray(op.dash) ? op.dash : []);
        }
        ctx2d.stroke();
      }
    } else if (op.op === "path") {
      if (op.d && nonTransparent(op.stroke) && typeof globalThis.Path2D === "function") {
        const path2d = new globalThis.Path2D(op.d);
        ctx2d.strokeStyle = op.stroke;
        ctx2d.lineWidth = op.lineWidth || 1;
        ctx2d.lineCap = "round";
        ctx2d.lineJoin = "round";
        if (typeof ctx2d.setLineDash === "function") {
          ctx2d.setLineDash(Array.isArray(op.dash) ? op.dash : []);
        }
        ctx2d.stroke(path2d);
      }
    } else if (op.op === "text") {
      ctx2d.font = op.font || "13px sans-serif";
      ctx2d.textAlign = op.align || "left";
      ctx2d.textBaseline = op.baseline || "middle";
      const measure = (text) => ctx2d.measureText?.(text)?.width ?? text.length * 7;
      const shown = op.maxWidth > 0 ? fitText(op.text, op.maxWidth, measure) : String(op.text ?? "");
      if (shown) {
        if (nonTransparent(op.halo) && op.haloWidth > 0 && typeof ctx2d.strokeText === "function") {
          ctx2d.strokeStyle = op.halo;
          ctx2d.lineWidth = op.haloWidth;
          ctx2d.lineJoin = "round";
          ctx2d.miterLimit = 2;
          ctx2d.strokeText(shown, op.x, op.y);
        }
        ctx2d.fillStyle = op.color || "#000000";
        ctx2d.fillText(shown, op.x, op.y);
      }
    }
    ctx2d.restore();
  }
  return true;
}
function canvasToPngBlob(canvas) {
  if (!canvas || typeof canvas.toBlob !== "function") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob || null), "image/png");
    } catch {
      resolve(null);
    }
  });
}
function withClipboardTimeout(promise, timeoutMs = 250) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, timeoutMs);
    timer?.unref?.();
    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(Boolean(value));
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(false);
      }
    );
  });
}
function createExport(ctx) {
  if (!ctx?.dom?.root) {
    return {
      name: "export",
      openOutline() {
      },
      openImage() {
      },
      copyBreadcrumbs() {
        return Promise.resolve(false);
      }
    };
  }
  const { el: el2, button: button2, lifecycle, dom, state } = ctx;
  const barBtn = button2("compass-export-btn", "Export image", "Export image");
  ctx.addBarButton(barBtn);
  const backdrop = el2("div", "compass-export-backdrop");
  backdrop.hidden = true;
  lifecycle.node(backdrop, dom.root);
  const localVisits = [];
  let activeMode = null;
  let returnFocusEl = null;
  let previewUrl = null;
  let renderToken = 0;
  function revokePreviewUrl() {
    if (!previewUrl) return;
    const url = previewUrl;
    previewUrl = null;
    try {
      globalThis.URL?.revokeObjectURL?.(url);
    } catch {
    }
  }
  function closeDialog({ restoreFocus = true } = {}) {
    if (!activeMode && backdrop.hidden) return;
    renderToken += 1;
    revokePreviewUrl();
    activeMode = null;
    backdrop.hidden = true;
    backdrop.replaceChildren();
    const prev = returnFocusEl;
    returnFocusEl = null;
    if (!restoreFocus) return;
    if (prev && prev.isConnected && dom.root.contains(prev) && typeof prev.focus === "function") {
      prev.focus({ preventScroll: true });
    } else if (state.isOpen && typeof dom.stage?.focus === "function") {
      dom.stage.focus({ preventScroll: true });
    }
  }
  function prepareDialog(mode) {
    ctx.hideFloating?.();
    if (!activeMode) {
      returnFocusEl = globalThis.document?.activeElement ?? null;
    }
    renderToken += 1;
    revokePreviewUrl();
    activeMode = mode;
    backdrop.replaceChildren();
    backdrop.hidden = false;
  }
  function renderWarnings(listEl, items) {
    listEl.replaceChildren();
    const valid = (items ?? []).filter((item) => typeof item === "string" && item.trim());
    listEl.hidden = valid.length === 0;
    for (const note of valid) {
      listEl.append(el2("li", "compass-export-warning", note));
    }
  }
  function hiddenNodesFor(nodes) {
    const lenses = ctx.features?.get?.("lenses");
    if (typeof lenses?.hiddenFor === "function") {
      const hidden = lenses.hiddenFor(nodes);
      if (hidden instanceof Set) return hidden;
      if (Array.isArray(hidden)) return new Set(hidden);
    }
    return new Set(hiddenUids(nodes, state.lens));
  }
  function buildCurrentOutline(labelsMode) {
    const warnings = [];
    const hood = state.hood;
    const view = ctx.features?.get?.("views")?.current?.()?.view ?? "compass";
    if (view === "mindmap") {
      const tree = ctx.features?.get?.("mindmap")?.outline?.();
      if (tree && tree.root) {
        const hidden2 = hiddenNodesFor(collectTreeNodes(tree, hood?.nodes));
        const md = treeOutline2(tree, { labels: labelsMode, hidden: hidden2, warnings });
        if (md) return { markdown: md, warnings };
      }
    } else if (view === "facets") {
      const classified = ctx.features?.get?.("facets")?.classified?.();
      if (classified && hood?.center) {
        const hidden2 = hiddenNodesFor(hood.nodes ?? []);
        const nodesByUid = new Map((hood.nodes ?? []).map((node) => [node.uid, node]));
        const md = facetsOutline(classified, nodesByUid, hood.center, {
          labels: labelsMode,
          hidden: hidden2,
          warnings: []
        });
        if (md) {
          warnings.length = 0;
          const finalMd = facetsOutline(classified, nodesByUid, hood.center, {
            labels: labelsMode,
            hidden: hidden2,
            warnings
          });
          return { markdown: finalMd, warnings };
        }
      }
    }
    const hidden = hiddenNodesFor(hood?.nodes ?? []);
    const markdown = compassOutline(hood, { labels: labelsMode, hidden, warnings });
    return { markdown, warnings };
  }
  function openOutline() {
    prepareDialog("outline");
    let labelsMode = "visible";
    let currentMarkdown = "";
    const dialog = el2("div", "compass-export-dialog compass-export-dialog-outline");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Export outline as Markdown");
    const head = el2("div", "compass-export-head");
    head.append(el2("h2", "compass-export-title", "Export outline as Markdown"));
    const controls = el2("div", "compass-export-controls");
    const labelGroup = el2("div", "compass-export-group");
    labelGroup.append(el2("span", "compass-export-group-label", "Labels"));
    const seg = el2("div", "compass-export-seg");
    const labelOptions = [
      ["none", "No labels"],
      ["visible", "Labels shown on the map"],
      ["all", "All relationship labels"]
    ];
    const modeButtons = /* @__PURE__ */ new Map();
    for (const [mode, title] of labelOptions) {
      const btn = button2("compass-export-seg-btn", title);
      btn.dataset.labels = mode;
      btn.setAttribute("aria-pressed", mode === labelsMode ? "true" : "false");
      btn.addEventListener("click", () => {
        if (labelsMode === mode) return;
        labelsMode = mode;
        for (const [key, item] of modeButtons) {
          item.setAttribute("aria-pressed", key === labelsMode ? "true" : "false");
        }
        refreshOutline();
      });
      modeButtons.set(mode, btn);
      seg.append(btn);
    }
    labelGroup.append(seg);
    controls.append(labelGroup);
    const preview = el2("pre", "compass-export-preview");
    preview.tabIndex = 0;
    preview.setAttribute("aria-label", "Markdown preview");
    const warningsEl = el2("ul", "compass-export-warnings");
    warningsEl.hidden = true;
    const actions = el2("div", "compass-export-actions");
    const copyBtn = button2("compass-export-primary compass-export-copy-md", "Copy Markdown");
    const saveBtn = button2("compass-export-save-md", "Save .md");
    const closeBtn = button2("compass-export-close", "Close");
    copyBtn.addEventListener("click", ctx.guard(async () => {
      const ok = await withClipboardTimeout(copyText(currentMarkdown));
      if (ok) {
        ctx.setStatus?.("Outline copied");
      } else {
        ctx.setStatus?.("Could not copy the outline.");
      }
    }));
    saveBtn.addEventListener("click", () => {
      const blob = new Blob([currentMarkdown], { type: "text/markdown;charset=utf-8" });
      const filename = safeFilename(state.hood?.center?.title || "outline", "md");
      const ok = saveBlob(blob, filename);
      ctx.setStatus?.(ok ? `Saved ${filename}` : "Could not save the file.");
    });
    closeBtn.addEventListener("click", () => closeDialog());
    actions.append(copyBtn, saveBtn, closeBtn);
    dialog.append(head, controls, preview, warningsEl, actions);
    backdrop.append(dialog);
    function refreshOutline() {
      const built = buildCurrentOutline(labelsMode);
      currentMarkdown = built.markdown;
      preview.textContent = currentMarkdown;
      renderWarnings(warningsEl, built.warnings);
      const empty = !currentMarkdown;
      copyBtn.disabled = empty;
      saveBtn.disabled = empty;
    }
    refreshOutline();
    copyBtn.focus?.({ preventScroll: true });
  }
  function resolvePaper() {
    const rootStyle = getStyle(dom.root);
    const bg = nonTransparent(rootStyle?.backgroundColor);
    if (bg) return bg;
    const custom = rootStyle?.getPropertyValue?.("--compass-paper")?.trim() ?? "";
    if (custom && custom !== "Canvas" && custom !== "transparent") return custom;
    return dom.root.dataset?.tone === "dark" ? "#182026" : "#ffffff";
  }
  function isVisibleInWorld(element) {
    let cur = element;
    while (cur && cur !== dom.world) {
      if (cur.hidden === true) return false;
      const cs = getStyle(cur);
      if (cs && (cs.display === "none" || cs.visibility === "hidden")) return false;
      cur = cur.parentElement ?? null;
    }
    return true;
  }
  function effectiveOpacity(element, ignoreEntryZero = false) {
    let opacity = 1;
    let cur = element;
    while (cur && cur !== dom.world) {
      if (ignoreEntryZero && cur === element && cur.style?.opacity === "0") {
        if (cur.classList?.contains("compass-fade")) opacity *= 0.15;
      } else {
        const raw = parseFloat(getStyle(cur)?.opacity);
        if (Number.isFinite(raw)) opacity *= raw;
      }
      cur = cur.parentElement ?? null;
    }
    return opacity;
  }
  function collectScene() {
    dom.root.classList?.add?.("compass-export-measuring");
    try {
      const zoom = Number(state.zoom) > 0 ? state.zoom : 1;
      const panX = Number(state.panX) || 0;
      const panY = Number(state.panY) || 0;
      const stageRect = dom.stage.getBoundingClientRect();
      const stageW = stageRect.width || 800;
      const stageH = stageRect.height || 600;
      const stageCenterX = stageRect.left + stageW / 2;
      const stageCenterY = stageRect.top + stageH / 2;
      const toWorldRect = (rect) => ({
        x: (rect.left - stageCenterX - panX) / zoom,
        y: (rect.top - stageCenterY - panY) / zoom,
        w: rect.width / zoom,
        h: rect.height / zoom
      });
      const paper = resolvePaper();
      const defaultInk = dom.root.dataset?.tone === "dark" ? "#f5f8fa" : "#182026";
      const viewport = {
        x: (-stageW / 2 - panX) / zoom,
        y: (-stageH / 2 - panY) / zoom,
        w: stageW / zoom,
        h: stageH / zoom
      };
      const regularBoxes = [];
      const centerBoxes = [];
      for (const nodeEl of dom.world.querySelectorAll(".compass-node")) {
        if (!isVisibleInWorld(nodeEl)) continue;
        let pendingTarget = null;
        if (nodeEl.dataset?.target) {
          try {
            pendingTarget = JSON.parse(nodeEl.dataset.target);
          } catch {
            pendingTarget = null;
          }
        }
        const opacity = effectiveOpacity(nodeEl, Boolean(pendingTarget));
        if (opacity <= 0.02) continue;
        let wr = null;
        if (pendingTarget && Number.isFinite(pendingTarget.x) && Number.isFinite(pendingTarget.y) && Number.isFinite(pendingTarget.w) && Number.isFinite(pendingTarget.h) && pendingTarget.w > 0 && pendingTarget.h > 0) {
          wr = {
            x: pendingTarget.x - pendingTarget.w / 2,
            y: pendingTarget.y - pendingTarget.h / 2,
            w: pendingTarget.w,
            h: pendingTarget.h
          };
        } else {
          const rect = nodeEl.getBoundingClientRect();
          if (!(rect.width > 0) || !(rect.height > 0)) continue;
          wr = toWorldRect(rect);
        }
        const isCenter = Boolean(nodeEl.classList?.contains("compass-node-center"));
        const titleEl = nodeEl.querySelector?.(".compass-node-title") ?? null;
        const text = (titleEl ? titleEl.textContent : nodeEl.textContent)?.trim() ?? "";
        const cs = getStyle(nodeEl);
        const tcs = titleEl ? getStyle(titleEl) ?? cs : cs;
        const borderStyle = cs?.borderTopStyle || cs?.borderStyle || "solid";
        const borderWidth = parseFloat(cs?.borderTopWidth || cs?.borderWidth) || (isCenter ? 2 : 1);
        const hasBorder = borderStyle !== "none" && borderWidth > 0;
        const dashed = !hasBorder ? false : borderStyle === "dashed" ? "dashed" : borderStyle === "dotted" ? "dotted" : false;
        const box = {
          ...wr,
          text,
          fill: nonTransparent(cs?.backgroundColor) ?? paper,
          stroke: hasBorder ? nonTransparent(cs?.borderTopColor || cs?.borderColor) ?? defaultInk : null,
          borderWidth,
          color: nonTransparent(tcs?.color || cs?.color) ?? defaultInk,
          dashed,
          radius: parseFloat(cs?.borderTopLeftRadius || cs?.borderRadius) || (isCenter ? 8 : 6),
          bold: isBoldStyle(tcs) || isCenter,
          opacity,
          font: fontFromStyle(tcs, isCenter ? "600 15px sans-serif" : "13px sans-serif"),
          padX: isCenter ? 12 : Math.max(6, parseFloat(cs?.paddingLeft) || 10)
        };
        if (isCenter) centerBoxes.push(box);
        else regularBoxes.push(box);
      }
      const paths = [];
      for (const pathEl of dom.world.querySelectorAll("path.compass-edge-line")) {
        if (!isVisibleInWorld(pathEl)) continue;
        const opacity = effectiveOpacity(pathEl);
        if (opacity <= 0.02) continue;
        const d = pathEl.getAttribute?.("d") ?? "";
        if (!d.trim()) continue;
        const cs = getStyle(pathEl);
        const stroke = nonTransparent(cs?.stroke) ?? nonTransparent(pathEl.getAttribute?.("stroke"));
        if (!stroke) continue;
        const width = parseFloat(cs?.strokeWidth || pathEl.getAttribute?.("stroke-width")) || 1.25;
        const dashRaw = cs?.strokeDasharray || pathEl.getAttribute?.("stroke-dasharray") || "";
        const dashed = dashRaw && dashRaw !== "none" ? dashRaw : false;
        paths.push({ d, stroke, width, dashed, opacity });
      }
      const labels = [];
      for (const textEl of dom.world.querySelectorAll("text.compass-edge-label")) {
        if (!isVisibleInWorld(textEl)) continue;
        const opacity = effectiveOpacity(textEl);
        if (opacity <= 0.02) continue;
        const text = textEl.textContent?.trim() ?? "";
        if (!text) continue;
        const attrX = parseFloat(textEl.getAttribute?.("x"));
        const attrY = parseFloat(textEl.getAttribute?.("y"));
        let x = attrX;
        let y = attrY;
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          const wr = toWorldRect(textEl.getBoundingClientRect());
          x = wr.x + wr.w / 2;
          y = wr.y + wr.h / 2;
        }
        const cs = getStyle(textEl);
        const color = nonTransparent(cs?.fill) ?? nonTransparent(cs?.color) ?? defaultInk;
        const anchor = cs?.textAnchor || textEl.getAttribute?.("text-anchor") || "middle";
        const align = anchor === "end" ? "right" : anchor === "start" ? "left" : "center";
        labels.push({
          x,
          y,
          text,
          color,
          font: fontFromStyle(cs, "11px sans-serif"),
          align,
          opacity
        });
      }
      const regions = [];
      for (const regEl of dom.world.querySelectorAll('[data-paint="region"]')) {
        if (!isVisibleInWorld(regEl)) continue;
        const opacity = effectiveOpacity(regEl);
        if (opacity <= 0.02) continue;
        const rect = regEl.getBoundingClientRect();
        if (!(rect.width > 0) || !(rect.height > 0)) continue;
        const wr = toWorldRect(rect);
        const cs = getStyle(regEl);
        const borderStyle = cs?.borderTopStyle || cs?.borderStyle || "solid";
        const borderWidth = parseFloat(cs?.borderTopWidth || cs?.borderWidth) || 0;
        const hasBorder = borderStyle !== "none" && borderWidth > 0;
        const labelEl = regEl.querySelector?.(".compass-region-label") ?? null;
        const lcs = labelEl ? getStyle(labelEl) ?? cs : cs;
        regions.push({
          ...wr,
          fill: nonTransparent(cs?.backgroundColor),
          stroke: hasBorder ? nonTransparent(cs?.borderTopColor || cs?.borderColor) : null,
          width: borderWidth || 1,
          dashed: !hasBorder ? false : borderStyle === "dashed" ? "dashed" : borderStyle === "dotted" ? "dotted" : false,
          radius: parseFloat(cs?.borderTopLeftRadius || cs?.borderRadius) || 0,
          label: labelEl?.textContent?.trim() ?? "",
          color: nonTransparent(lcs?.color || cs?.color) ?? defaultInk,
          font: fontFromStyle(lcs, "600 12px sans-serif"),
          opacity
        });
      }
      return {
        boxes: [...regularBoxes, ...centerBoxes],
        paths,
        regions,
        labels,
        bounds: state.geometry?.bounds ?? null,
        viewport,
        paper
      };
    } finally {
      dom.root.classList?.remove?.("compass-export-measuring");
    }
  }
  function openImage() {
    prepareDialog("image");
    let scope = "all";
    let scale = 2;
    let transparent = false;
    let currentBlob = null;
    let lastPlanWarnings = [];
    const dialog = el2("div", "compass-export-dialog compass-export-dialog-image");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Export image");
    const head = el2("div", "compass-export-head");
    head.append(el2("h2", "compass-export-title", "Export image"));
    const metaEl = el2("span", "compass-export-meta", "");
    head.append(metaEl);
    const controls = el2("div", "compass-export-controls");
    const scopeGroup = el2("div", "compass-export-group");
    scopeGroup.append(el2("span", "compass-export-group-label", "Area"));
    const scopeSeg = el2("div", "compass-export-seg");
    const scopeButtons = /* @__PURE__ */ new Map();
    for (const [val, label] of [["all", "Whole canvas"], ["viewport", "Current viewport"]]) {
      const btn = button2("compass-export-seg-btn", label);
      btn.dataset.scope = val;
      btn.setAttribute("aria-pressed", val === scope ? "true" : "false");
      btn.addEventListener("click", () => {
        if (scope === val) return;
        scope = val;
        for (const [k, b] of scopeButtons) b.setAttribute("aria-pressed", k === scope ? "true" : "false");
        void renderImagePreview();
      });
      scopeButtons.set(val, btn);
      scopeSeg.append(btn);
    }
    scopeGroup.append(scopeSeg);
    const scaleGroup = el2("div", "compass-export-group");
    scaleGroup.append(el2("span", "compass-export-group-label", "Scale"));
    const scaleSeg = el2("div", "compass-export-seg");
    const scaleButtons = /* @__PURE__ */ new Map();
    for (const val of [1, 2, 3]) {
      const btn = button2("compass-export-seg-btn", `${val}×`);
      btn.dataset.scale = String(val);
      btn.setAttribute("aria-pressed", val === scale ? "true" : "false");
      btn.addEventListener("click", () => {
        if (scale === val) return;
        scale = val;
        for (const [k, b] of scaleButtons) b.setAttribute("aria-pressed", k === scale ? "true" : "false");
        void renderImagePreview();
      });
      scaleButtons.set(val, btn);
      scaleSeg.append(btn);
    }
    scaleGroup.append(scaleSeg);
    const transparentBtn = button2("compass-export-toggle compass-export-transparent", "Transparent background");
    transparentBtn.setAttribute("aria-pressed", "false");
    transparentBtn.addEventListener("click", () => {
      transparent = !transparent;
      transparentBtn.setAttribute("aria-pressed", transparent ? "true" : "false");
      void renderImagePreview();
    });
    controls.append(scopeGroup, scaleGroup, transparentBtn);
    const frameEl = el2("div", "compass-export-image-frame");
    frameEl.dataset.transparent = "false";
    const previewImg = el2("img", "compass-export-image-preview");
    previewImg.alt = "Map preview";
    previewImg.hidden = true;
    frameEl.append(previewImg);
    const warningsEl = el2("ul", "compass-export-warnings");
    warningsEl.hidden = true;
    const actions = el2("div", "compass-export-actions");
    const copyBtn = button2("compass-export-primary compass-export-copy-png", "Copy PNG");
    const saveBtn = button2("compass-export-save-png", "Save PNG");
    const closeBtn = button2("compass-export-close", "Close");
    copyBtn.disabled = true;
    saveBtn.disabled = true;
    copyBtn.addEventListener("click", ctx.guard(async () => {
      if (!currentBlob) return;
      const ok = await withClipboardTimeout(copyBlob(currentBlob));
      if (ok) {
        closeDialog();
        ctx.setStatus?.("Image copied");
      } else {
        const msg = "Copying images is not supported here. Use Save.";
        renderWarnings(warningsEl, [...lastPlanWarnings, msg]);
        ctx.setStatus?.(msg);
      }
    }));
    saveBtn.addEventListener("click", () => {
      if (!currentBlob) return;
      const filename = safeFilename(state.hood?.center?.title || "map", "png");
      const ok = saveBlob(currentBlob, filename);
      ctx.setStatus?.(ok ? `Saved ${filename}` : "Could not save the image.");
    });
    closeBtn.addEventListener("click", () => closeDialog());
    actions.append(copyBtn, saveBtn, closeBtn);
    dialog.append(head, controls, frameEl, warningsEl, actions);
    backdrop.append(dialog);
    async function renderImagePreview() {
      const token = ++renderToken;
      currentBlob = null;
      copyBtn.disabled = true;
      saveBtn.disabled = true;
      previewImg.dataset.rendering = "true";
      previewImg.dataset.decoded = "false";
      frameEl.dataset.transparent = transparent ? "true" : "false";
      const scene = collectScene();
      const plan = paintPlan({
        ...scene,
        scope,
        scale,
        transparent
      });
      lastPlanWarnings = plan.warnings;
      metaEl.textContent = `${plan.width} × ${plan.height} px`;
      const doc = globalThis.document;
      const canvas = typeof doc?.createElement === "function" ? doc.createElement("canvas") : null;
      let painted = false;
      if (canvas && typeof canvas.toBlob === "function") {
        try {
          painted = executePlan(canvas, plan);
        } catch {
          painted = false;
        }
      }
      if (!painted) {
        revokePreviewUrl();
        previewImg.hidden = true;
        previewImg.dataset.rendering = "false";
        previewImg.removeAttribute("src");
        renderWarnings(warningsEl, [...plan.warnings, "This browser could not make the image."]);
        return;
      }
      const blob = await canvasToPngBlob(canvas);
      if (token !== renderToken) return;
      const createUrl = globalThis.URL?.createObjectURL;
      if (!blob || typeof createUrl !== "function") {
        revokePreviewUrl();
        previewImg.hidden = true;
        previewImg.dataset.rendering = "false";
        previewImg.removeAttribute("src");
        renderWarnings(warningsEl, [...plan.warnings, "This browser could not make the image."]);
        return;
      }
      revokePreviewUrl();
      currentBlob = blob;
      previewUrl = createUrl.call(globalThis.URL, blob);
      const onDecoded = () => {
        if (token === renderToken) {
          previewImg.dataset.decoded = "true";
        }
      };
      previewImg.onload = onDecoded;
      previewImg.onerror = onDecoded;
      previewImg.dataset.width = String(plan.width);
      previewImg.dataset.height = String(plan.height);
      previewImg.src = previewUrl;
      previewImg.hidden = false;
      previewImg.dataset.rendering = "false";
      copyBtn.disabled = false;
      saveBtn.disabled = false;
      renderWarnings(warningsEl, plan.warnings);
    }
    void renderImagePreview();
    closeBtn.focus?.({ preventScroll: true });
  }
  async function copyBreadcrumbs() {
    const trail = ctx.features?.get?.("trail");
    let md = "";
    let count2 = 0;
    if (typeof trail?.markdown === "function") {
      md = String(trail.markdown() ?? "").trim();
      const entries = typeof trail?.entries === "function" ? trail.entries() : null;
      if (Array.isArray(entries)) {
        count2 = entries.length;
      } else if (md) {
        count2 = md.split("\n").filter((line) => line.trim().length > 0).length;
      }
    } else if (typeof trail?.entries === "function") {
      const entries = trail.entries();
      if (Array.isArray(entries) && entries.length > 0) {
        count2 = entries.length;
        md = breadcrumbs(entries);
      }
    } else if (localVisits.length > 0) {
      count2 = localVisits.length;
      md = breadcrumbs(localVisits);
    }
    if (!md || count2 === 0) {
      ctx.setStatus?.("There is no trail yet.");
      return false;
    }
    const ok = await withClipboardTimeout(copyText(md));
    const word = count2 === 1 ? "visit" : "visits";
    if (ok) {
      ctx.setStatus?.(`Copied ${count2} ${word}`);
    } else {
      ctx.setStatus?.(`Could not copy ${count2} ${word}.`);
    }
    return ok;
  }
  function onNavigate(info) {
    const uid = info?.uid;
    if (typeof uid !== "string" || !uid) return;
    const nextAt = Math.max(Date.now(), (localVisits[0]?.at ?? 0) + 1);
    if (localVisits[0]?.uid === uid) {
      localVisits[0].at = nextAt;
      return;
    }
    const existingIdx = localVisits.findIndex((item) => item.uid === uid);
    const prev = existingIdx >= 0 ? localVisits.splice(existingIdx, 1)[0] : null;
    localVisits.unshift({
      uid,
      title: ctx.titleOf?.(uid) || prev?.title || uid,
      kind: ctx.nodeKind?.(uid) || prev?.kind || "page",
      at: nextAt
    });
    if (localVisits.length > 100) localVisits.length = 100;
  }
  function afterRender(info) {
    const center = info?.hood?.center;
    if (!center?.uid) return;
    const hit = localVisits.find((item) => item.uid === center.uid);
    if (hit) {
      if (center.title) hit.title = center.title;
      if (center.kind) hit.kind = center.kind;
    }
  }
  function onEscape() {
    if (!activeMode || backdrop.hidden) return false;
    closeDialog();
    return true;
  }
  function onClose() {
    closeDialog({ restoreFocus: false });
  }
  function stageMenu() {
    return [
      { title: "Export outline as Markdown…", run: () => openOutline() },
      { title: "Export image…", run: () => openImage() },
      { title: "Copy breadcrumbs as Markdown", run: () => copyBreadcrumbs() }
    ];
  }
  function commands() {
    return [
      { id: "export-outline", title: "Export outline as Markdown…", hint: "", run: () => openOutline() },
      { id: "export-image", title: "Export image…", hint: "", run: () => openImage() },
      { id: "export-breadcrumbs", title: "Copy breadcrumbs as Markdown", hint: "", run: () => copyBreadcrumbs() }
    ];
  }
  lifecycle.event(barBtn, "click", ctx.guard(() => openImage()));
  lifecycle.event(backdrop, "click", (event) => {
    if (event.target === backdrop) closeDialog();
  });
  lifecycle.add(() => {
    revokePreviewUrl();
  });
  return {
    name: "export",
    openOutline,
    openImage,
    copyBreadcrumbs,
    onNavigate,
    afterRender,
    onEscape,
    onClose,
    stageMenu,
    commands
  };
}

// src/model/edit.js
var FORBIDDEN2 = [":harc", ":entity/attrs", ":attr/proxy"];
function same2(a, b) {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}
function hasForbidden(ops) {
  return ops.some((op) => FORBIDDEN2.some((token) => String(op?.string ?? "").includes(token)));
}
function unlinkRefused(reason) {
  return { ops: [], reason, removesBlock: false, removesLabels: 0 };
}
function safeUnlink(ops, removesBlock, removesLabels = 0) {
  if (hasForbidden(ops)) return unlinkRefused("forbidden");
  return {
    ops,
    reason: null,
    removesBlock: Boolean(removesBlock),
    removesLabels: removesBlock ? removesLabels : 0
  };
}
function flipRefused(reason) {
  return { ops: [], reason, guards: [] };
}
function safeFlip(ops, guards) {
  if (hasForbidden(ops)) return flipRefused("forbidden");
  return { ops, reason: null, guards };
}
function refsIn2(string) {
  const shape = tailShape(string);
  return shape.kind === "refs" ? shape.values : [];
}
function childCountOf(block) {
  if (Number.isFinite(block?.childCount) && block.childCount >= 0) return Math.floor(block.childCount);
  if (Array.isArray(block?.children)) return block.children.filter((child) => child?.uid).length;
  return 0;
}
function isRelationLabel(child) {
  return Boolean(parseAttribute(child?.string)) && childCountOf(child) === 0;
}
function isPageEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== "object") return false;
  if (endpoint.kind != null && endpoint.kind !== "page") return false;
  if (typeof endpoint.uid !== "string" || !endpoint.uid) return false;
  if (typeof endpoint.title !== "string" || !endpoint.title.trim()) return false;
  if (endpoint.title.includes("[") || endpoint.title.includes("]")) return false;
  return true;
}
function planUnlink({ source, attribute, value } = {}) {
  if (!source?.uid || typeof source.string !== "string") return unlinkRefused("missing");
  const parsed = parseAttribute(source.string);
  if (!parsed || !same2(parsed.name, attribute)) return unlinkRefused("changed");
  if (isReadOnlyAttribute(parsed.name)) return unlinkRefused("read-only");
  const shape = tailShape(parsed.tail);
  const children = [...source.children ?? []].filter((child) => child?.uid).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (shape.kind === "refs") {
    const token = shape.values.find((item) => tokenMatches(item, value));
    if (!token) return unlinkRefused("missing-value");
    if (shape.values.length === 1) {
      if (!children.every(isRelationLabel)) return unlinkRefused("has-children");
      return safeUnlink([{ op: "delete", uid: source.uid }], true, children.length);
    }
    const offset = parsed.prefix.length;
    const shifted = { ...token, start: token.start + offset, end: token.end + offset };
    return safeUnlink([{ op: "update", uid: source.uid, string: removeToken(source.string, shifted) }], false, 0);
  }
  if (shape.kind !== "bare") return unlinkRefused("text-value");
  const values = children.filter((child) => !parseAttribute(child.string));
  const holder = values.find((child) => child.uid === value?.uid || refsIn2(child.string).some((item) => tokenMatches(item, value)));
  if (!holder) return unlinkRefused("missing-value");
  const holderRefs = refsIn2(holder.string);
  if (holder.uid !== value?.uid && holderRefs.length > 1) {
    const token = scanRefs(holder.string, { nested: false }).find((item) => tokenMatches(item, value));
    return safeUnlink([{ op: "update", uid: holder.uid, string: removeToken(holder.string, token) }], false, 0);
  }
  if (childCountOf(holder) > 0) return unlinkRefused("has-children");
  if (values.length === 1) {
    const rest = children.filter((child) => child.uid !== holder.uid);
    if (!rest.every(isRelationLabel)) return unlinkRefused("has-children");
    return safeUnlink([{ op: "delete", uid: source.uid }], true, rest.length);
  }
  return safeUnlink([{ op: "delete", uid: holder.uid }], false, 0);
}
function planFlipOwner({ source, attribute, owner, value, inverse, target } = {}) {
  if (!isPageEndpoint(owner) || !isPageEndpoint(value)) return flipRefused("not-pages");
  const inverseName = typeof inverse === "string" ? inverse.trim() : "";
  if (!inverseName || inverseName.includes("::") || /[[\]\n]/.test(inverseName)) {
    return flipRefused("no-attribute");
  }
  if (isReadOnlyAttribute(attribute) || isReadOnlyAttribute(inverseName)) {
    return flipRefused("read-only");
  }
  const writeOps = [];
  if (target != null) {
    if (!target?.uid || typeof target.string !== "string") return flipRefused("changed");
    const targetParsed = parseAttribute(target.string);
    if (!targetParsed || !same2(targetParsed.name, inverseName)) return flipRefused("changed");
    const targetShape = tailShape(targetParsed.tail);
    if (targetShape.kind === "text") return flipRefused("target-text");
    if (targetShape.kind === "refs") {
      const hasOwner = targetShape.values.some((token) => tokenMatches(token, owner));
      if (!hasOwner) {
        writeOps.push({
          op: "update",
          uid: target.uid,
          string: `${target.string.replace(/[ \t]+$/, "")} [[${owner.title}]]`
        });
      }
    } else {
      const targetChildren = Array.isArray(target.children) ? target.children : [];
      const hasOwner = targetChildren.some((child) => child?.uid === owner.uid || !parseAttribute(child?.string) && refsIn2(child?.string).some((token) => tokenMatches(token, owner)));
      if (!hasOwner) {
        writeOps.push({
          op: "create",
          parentUid: target.uid,
          order: "last",
          string: `[[${owner.title}]]`
        });
      }
    }
  } else {
    writeOps.push({
      op: "create",
      parentUid: value.uid,
      order: "last",
      string: `${inverseName}:: [[${owner.title}]]`
    });
  }
  const unlink = planUnlink({ source, attribute, value });
  if (unlink.reason) return flipRefused(unlink.reason);
  const guards = [{ uid: source.uid, string: source.string }];
  if (target && target.uid !== source.uid) {
    guards.push({ uid: target.uid, string: target.string });
  }
  return safeFlip([...writeOps, ...unlink.ops], guards);
}
function formatEndpoint(endpoint) {
  const isBlock = endpoint?.kind === "block" || endpoint?.kind !== "page" && !(typeof endpoint?.title === "string" && endpoint.title);
  if (isBlock) {
    const raw = typeof endpoint?.string === "string" && endpoint.string ? endpoint.string : endpoint?.title ?? endpoint?.uid ?? "";
    const text = plainText(raw) || String(endpoint?.uid ?? "");
    return `"${text}"`;
  }
  return `[[${endpoint.title}]]`;
}
function describeRelation({ owner, attribute, value } = {}) {
  return `${formatEndpoint(owner)} — ${String(attribute ?? "").trim()}:: ${formatEndpoint(value)}`;
}

// src/view/features/edit.js
var REASONS = Object.freeze({
  changed: "That block changed in Roam. Compass reloaded it; try again.",
  missing: "The source block is gone. Compass reloaded.",
  "missing-value": "That value is no longer in its block. Compass reloaded.",
  "has-children": "That block has nested content, so Compass left it alone and opened it for you.",
  "read-only": "That attribute belongs to another plugin. Compass reloaded.",
  "text-value": "That value is plain text, not a link. Compass reloaded.",
  "not-pages": "Both ends must be pages to move a relation. Compass reloaded.",
  "no-attribute": "No matching attribute is set for the other page. Compass reloaded.",
  "target-text": "The attribute on the other page holds plain text. Compass reloaded.",
  locked: "Another Roam tab is writing this block. Compass reloaded.",
  forbidden: "Refused a write that touched derived attribute data. Compass reloaded.",
  empty: "Nothing needed to be written. Compass reloaded."
});
var GENERIC_FAILURE = "The write failed. Compass reloaded.";
function reasonMessage(reason) {
  return REASONS[reason] ?? GENERIC_FAILURE;
}
function evidenceKey(entry) {
  return `${entry.kind ?? ""}:${entry.direction ?? ""}:${entry.attribute ?? ""}:${entry.sourceUid ?? ""}:${entry.note ?? ""}`;
}
function countOtherEvidence(node, targetItem) {
  if (!Array.isArray(node?.evidence)) return 0;
  const seen = /* @__PURE__ */ new Set([evidenceKey(targetItem)]);
  let count2 = 0;
  for (const entry of node.evidence) {
    if (!entry) continue;
    const key = evidenceKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    count2 += 1;
  }
  return count2;
}
function isLinkablePage(endpoint) {
  return endpoint?.kind === "page" && typeof endpoint.uid === "string" && Boolean(endpoint.uid) && typeof endpoint.title === "string" && Boolean(endpoint.title.trim()) && !endpoint.title.includes("[") && !endpoint.title.includes("]");
}
function unlinkValueFor(endpoint) {
  return endpoint.kind === "page" ? { uid: endpoint.uid, title: endpoint.title } : { uid: endpoint.uid };
}
function createEdit(ctx) {
  let pending = null;
  let busy = false;
  let backdrop = null;
  let titleEl = null;
  let bodyEl = null;
  let cancelBtn = null;
  let confirmBtn = null;
  function ensureDialog() {
    if (backdrop || !ctx?.dom?.root || typeof ctx.el !== "function") return backdrop;
    backdrop = ctx.el("div", "compass-edit-backdrop");
    backdrop.hidden = true;
    const dialog = ctx.el("div", "compass-edit-dialog");
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "compass-edit-title");
    dialog.setAttribute("aria-describedby", "compass-edit-body");
    titleEl = ctx.el("h2", "compass-edit-title");
    titleEl.id = "compass-edit-title";
    bodyEl = ctx.el("div", "compass-edit-body");
    bodyEl.id = "compass-edit-body";
    const actions = ctx.el("div", "compass-edit-actions");
    cancelBtn = ctx.button("compass-edit-cancel", "Cancel");
    confirmBtn = ctx.button("compass-edit-confirm", "Unlink");
    actions.append(cancelBtn, confirmBtn);
    dialog.append(titleEl, bodyEl, actions);
    backdrop.append(dialog);
    ctx.lifecycle.node(backdrop, ctx.dom.root);
    ctx.lifecycle.event(backdrop, "click", (event) => {
      if (event.target === backdrop) closeDialog();
    });
    ctx.lifecycle.event(backdrop, "keydown", (event) => {
      if (event.key !== "Tab" || backdrop.hidden) return;
      const focusable = [cancelBtn, confirmBtn];
      const index = focusable.indexOf(globalThis.document?.activeElement);
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        confirmBtn.focus();
      } else if (!event.shiftKey && (index < 0 || index >= focusable.length - 1)) {
        event.preventDefault();
        cancelBtn.focus();
      }
    });
    ctx.lifecycle.event(cancelBtn, "click", () => closeDialog());
    ctx.lifecycle.event(confirmBtn, "click", ctx.guard(() => confirmPending()));
    return backdrop;
  }
  function closeDialog() {
    pending = null;
    if (backdrop) backdrop.hidden = true;
  }
  function resolveContext(node, item) {
    if (!node || !item || item.kind !== "typed" || item.writable !== true || !item.sourceUid) return null;
    const hood = ctx?.state?.hood;
    if (!hood?.center?.uid) return null;
    const center = hood.center;
    const centerSnap = ctx.state?.snapshot?.center;
    const centerEndpoint = {
      uid: center.uid,
      kind: center.kind === "block" ? "block" : "page",
      title: center.title,
      ...center.kind === "block" && typeof centerSnap?.string === "string" ? { string: centerSnap.string } : {}
    };
    const nodeEndpoint = {
      uid: node.uid,
      kind: node.kind === "block" ? "block" : "page",
      title: node.title,
      ...node.kind === "block" && typeof node.string === "string" ? { string: node.string } : {}
    };
    let owner;
    let value;
    if (item.direction === "out") {
      owner = centerEndpoint;
      value = nodeEndpoint;
    } else if (item.direction === "in") {
      owner = nodeEndpoint;
      value = centerEndpoint;
    } else {
      return null;
    }
    const ownerRole = item.direction === "out" ? item.role : inverseRole(item.role);
    const inverse = isLinkablePage(owner) && isLinkablePage(value) ? inverseAttribute(item.attribute, ownerRole, hood.settings) : null;
    return {
      sourceUid: item.sourceUid,
      sourceString: item.sourceString ?? null,
      attribute: item.attribute,
      owner,
      value,
      inverse,
      otherCount: countOtherEvidence(node, item)
    };
  }
  function openDialog(mode, resolved) {
    ctx.hideFloating?.();
    if (!ensureDialog()) return;
    pending = { mode, ...resolved };
    bodyEl.replaceChildren();
    if (mode === "unlink") {
      titleEl.textContent = "Unlink this relation?";
      confirmBtn.textContent = "Unlink";
      const relation = describeRelation({
        owner: resolved.owner,
        attribute: resolved.attribute,
        value: resolved.value
      });
      bodyEl.append(
        ctx.el("p", "compass-edit-relation", relation),
        ctx.el("p", "compass-edit-note", "This removes one block value. The page and its other links stay.")
      );
      const fresh = ctx.host?.sourceBlock?.(resolved.sourceUid) ?? null;
      const preview = fresh ? planUnlink({ source: fresh, attribute: resolved.attribute, value: unlinkValueFor(resolved.value) }) : null;
      const labelCount = preview?.removesLabels ?? 0;
      if (labelCount > 0) {
        const noun = labelCount === 1 ? "label" : "labels";
        bodyEl.append(
          ctx.el("p", "compass-edit-note compass-edit-labels", `This also removes its ${labelCount} ${noun}.`)
        );
      }
      if (resolved.otherCount > 0) {
        const noun = resolved.otherCount === 1 ? "block" : "blocks";
        bodyEl.append(
          ctx.el(
            "p",
            "compass-edit-note compass-edit-other",
            `These two are still connected by ${resolved.otherCount} other ${noun}.`
          )
        );
      }
    } else {
      titleEl.textContent = "Move this relation to the other page?";
      confirmBtn.textContent = "Save relation";
      const compare = ctx.el("div", "compass-edit-compare");
      const nowCard = ctx.el("div", "compass-edit-step compass-edit-step-now");
      nowCard.append(
        ctx.el("div", "compass-edit-label", "Now"),
        ctx.el("p", "compass-edit-relation", describeRelation({
          owner: resolved.owner,
          attribute: resolved.attribute,
          value: resolved.value
        }))
      );
      const afterCard = ctx.el("div", "compass-edit-step compass-edit-step-after");
      afterCard.append(
        ctx.el("div", "compass-edit-label", "After saving"),
        ctx.el("p", "compass-edit-relation", describeRelation({
          owner: resolved.value,
          attribute: resolved.inverse,
          value: resolved.owner
        }))
      );
      compare.append(nowCard, afterCard);
      bodyEl.append(compare);
    }
    backdrop.hidden = false;
    cancelBtn.focus();
  }
  function handlePlanRefusal(reason, sourceUid) {
    ctx.setStatus(reasonMessage(reason));
    if (reason === "has-children") {
      void ctx.openSidebar?.(sourceUid, "block");
    }
    ctx.load?.();
  }
  async function confirmPending() {
    if (!pending || busy) return;
    const job = pending;
    closeDialog();
    busy = true;
    try {
      const source = ctx.host.sourceBlock(job.sourceUid);
      if (job.mode === "unlink") {
        const plan2 = planUnlink({
          source,
          attribute: job.attribute,
          value: unlinkValueFor(job.value)
        });
        if (plan2.reason) {
          handlePlanRefusal(plan2.reason, job.sourceUid);
          return;
        }
        const expected = typeof job.sourceString === "string" ? job.sourceString : source.string;
        const guards2 = [{ uid: job.sourceUid, string: expected }];
        let result2;
        try {
          result2 = await ctx.host.applyPlan({ lockUid: job.sourceUid, guards: guards2, ops: plan2.ops });
        } catch (error) {
          console.error("[compass] unlink", error);
          result2 = { ok: false, reason: "failed" };
        }
        if (result2?.ok) ctx.setStatus("Unlinked.");
        else ctx.setStatus(reasonMessage(result2?.reason));
        ctx.load();
        return;
      }
      const target = ctx.host.attributeBlock(job.value.uid, job.inverse);
      const plan = planFlipOwner({
        source,
        attribute: job.attribute,
        owner: job.owner,
        value: job.value,
        inverse: job.inverse,
        target
      });
      if (plan.reason) {
        handlePlanRefusal(plan.reason, job.sourceUid);
        return;
      }
      const guards = plan.guards.map((entry) => entry.uid === job.sourceUid && typeof job.sourceString === "string" ? { uid: entry.uid, string: job.sourceString } : entry);
      let result;
      try {
        result = await ctx.host.applyPlan({ lockUid: job.sourceUid, guards, ops: plan.ops });
      } catch (error) {
        console.error("[compass] flip owner", error);
        result = { ok: false, reason: "failed" };
      }
      if (result?.ok) ctx.setStatus(`Moved to [[${job.value.title}]] as ${job.inverse}::`);
      else ctx.setStatus(reasonMessage(result?.reason));
      ctx.load();
    } finally {
      busy = false;
    }
  }
  return {
    name: "edit",
    evidenceActions({ node, item } = {}) {
      const resolved = resolveContext(node, item);
      if (!resolved) return [];
      const actions = [{ title: "Unlink", run: () => openDialog("unlink", resolved) }];
      if (resolved.inverse) {
        actions.push({ title: "Flip owner", run: () => openDialog("flip", resolved) });
      }
      return actions;
    },
    nodeMenu(_uid, node) {
      if (!node?.writable) return [];
      const resolved = resolveContext(node, node.writable);
      if (!resolved) return [];
      const items = [{ title: "Unlink…", run: () => openDialog("unlink", resolved) }];
      if (resolved.inverse) {
        items.push({ title: "Flip owner…", run: () => openDialog("flip", resolved) });
      }
      return items;
    },
    onEscape() {
      if (!pending || !backdrop || backdrop.hidden) return false;
      closeDialog();
      return true;
    },
    onKey(event) {
      if (!pending || !backdrop || backdrop.hidden) return false;
      if (event.key === "Tab" || event.key === "Enter" || event.key === " ") return false;
      return true;
    },
    onClose() {
      closeDialog();
    },
    onNavigate(info) {
      if (info?.changed) closeDialog();
    }
  };
}

// src/view/features/index.js
var FEATURES = Object.freeze([
  createTrail2,
  createPins,
  createViews,
  createMindMap,
  createFacets,
  createLenses,
  createLayoutOptions,
  createKeys,
  createPalette,
  createWander,
  createZen,
  createExport,
  createEdit
]);

// src/view/hover-dim.js
var MARKS = ["compass-node-hot", "compass-node-dim", "compass-edge-hot", "compass-edge-dim"];
function visit(root, selector, apply) {
  for (const element of root?.querySelectorAll?.(selector) ?? []) apply(element);
}
function clearElement(element) {
  for (const name of MARKS) element.classList.toggle(name, false);
}
function markHover(root, node) {
  const uid = node?.dataset?.uid;
  if (!uid) {
    root?.classList.toggle("compass-dimming", false);
    visit(root, ".compass-node", clearElement);
    visit(root, ".compass-edge", clearElement);
    return;
  }
  root?.classList.toggle("compass-dimming", true);
  const center = node.classList.contains("compass-node-center");
  node.classList.toggle("compass-node-hot", true);
  node.classList.toggle("compass-node-dim", false);
  visit(root, ".compass-node", (element) => {
    if (element === node) return;
    element.classList.toggle("compass-node-hot", false);
    element.classList.toggle("compass-node-dim", true);
  });
  visit(root, ".compass-edge", (element) => {
    const hot = center || element.dataset?.uid === uid;
    element.classList.toggle("compass-edge-hot", hot);
    element.classList.toggle("compass-edge-dim", !hot);
  });
}

// src/view/overlay.js
var SVG_NS = "http://www.w3.org/2000/svg";
var SIDE_NAME = { north: "Parents", south: "Children", west: "Friends", east: "Challengers", siblings: "Siblings" };
var ENTER_FROM = { north: [0, -36], south: [0, 36], west: [-36, 0], east: [36, 0], siblings: [36, 0] };
var CLICK_DELAY = 230;
var HISTORY_CAP = 100;
var THUMB_WIDTH = 160;
var HOVER_WIDTH = 480;
var BLOCK_REF = /^\(\(([^)]+)\)\)$/;
var PAGE_REF = /^\[\[(.+)\]\]$/;
function plexus() {
  const api = globalThis.window?.RoamPlexus;
  return api && api.apiVersion >= 1 ? api : null;
}
function diagramApi() {
  const api = globalThis.window?.PlexusDiagram;
  return api && typeof api.boardsWith === "function" ? api : null;
}
function asBlocks(value) {
  if (Array.isArray(value)) return value;
  return value && typeof value === "object" ? [value] : [];
}
function readConnectionChildren(boardUid) {
  const pull2 = globalThis.roamAlphaAPI?.data?.pull;
  if (typeof pull2 !== "function" || !boardUid) return [];
  let raw = null;
  try {
    raw = pull2("[:block/uid {:block/children [:block/uid :block/string {:block/children [:block/uid :block/string]}]}]", [":block/uid", boardUid]);
  } catch {
    return [];
  }
  const out = [];
  for (const child of asBlocks(raw?.[":block/children"])) {
    out.push(child);
    for (const grand of asBlocks(child?.[":block/children"])) out.push(grand);
  }
  return out;
}
function embeddedTarget(uid) {
  const pull2 = globalThis.roamAlphaAPI?.data?.pull;
  if (typeof pull2 !== "function" || !uid) return "";
  let raw = null;
  try {
    raw = pull2("[:block/string]", [":block/uid", uid]);
  } catch {
    raw = null;
  }
  const text = String(raw?.[":block/string"] ?? "").trim();
  const block = /^\(\(([^)]+)\)\)$/.exec(text);
  if (block) return block[1];
  const page = /^(?:#)?\[\[(.+)\]\]$/.exec(text);
  return page ? page[1] : "";
}
var REASONS2 = {
  changed: "That block changed in Roam. Compass reloaded it; try again.",
  "missing-value": "That value is no longer in its block. Compass reloaded.",
  "read-only": "That attribute belongs to another plugin. Compass does not rewrite it.",
  "text-value": "That value is text, not a link. Nothing to move.",
  "no-parent": "Compass could not find where to put the new block.",
  "no-uid": "Roam did not hand out a new block uid.",
  locked: "Another Roam tab is writing this block.",
  missing: "The source block is gone. Compass reloaded.",
  same: "It is already on that side.",
  forbidden: "Refused a write that touched derived attribute data."
};
function guard(work) {
  return (...args) => {
    try {
      Promise.resolve(work(...args)).catch((error) => console.error("[compass]", error));
    } catch (error) {
      console.error("[compass]", error);
    }
  };
}
function isPaletteChord(event) {
  const key = event?.key;
  if (typeof key !== "string" || key.toLowerCase() !== "p") return false;
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
}
async function registerCommands({ extensionAPI, lifecycle, host, view }) {
  const palette = extensionAPI?.ui?.commandPalette;
  if (!palette?.addCommand || !palette?.removeCommand) throw new TypeError("A command palette is required");
  const paletteCommands = [
    { label: "Compass: Open", callback: guard(() => view.toggle()) },
    { label: "Compass: Focus page", callback: guard(() => view.focusPage()) },
    { label: "Compass: Focus block", callback: guard(() => view.focusBlock()) }
  ];
  let paletteOn = false;
  const enablePalette = () => {
    if (paletteOn || lifecycle.disposed) return;
    paletteOn = true;
    for (const command of paletteCommands) {
      const added = palette.addCommand(command);
      if (added?.then) added.catch((error) => console.error("[compass] command", error));
    }
  };
  const disablePalette = () => {
    if (!paletteOn) return;
    paletteOn = false;
    for (const command of paletteCommands) {
      try {
        palette.removeCommand({ label: command.label });
      } catch {
      }
    }
  };
  const releaseIfClosed = () => {
    if (!paletteOn || document.querySelector(".rm-command-palette")) return;
    disablePalette();
  };
  const doc = globalThis.document;
  if (typeof doc?.addEventListener !== "function") {
    enablePalette();
  } else {
    lifecycle.event(doc, "keydown", (event) => {
      if (isPaletteChord(event)) enablePalette();
    }, true);
    lifecycle.event(doc, "keyup", () => {
      if (paletteOn) setTimeout(releaseIfClosed, 0);
    }, true);
    lifecycle.event(doc, "pointerup", () => {
      if (paletteOn) setTimeout(releaseIfClosed, 0);
    }, true);
  }
  lifecycle.add(disablePalette);
  const menu = host.blockContextMenu?.();
  if (menu?.addCommand && menu?.removeCommand) {
    await lifecycle.command(menu, {
      label: "Compass: Focus block",
      callback: guard((info) => view.focusBlock(info?.["block-uid"]))
    });
  }
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function button(className, text, label) {
  const node = el("button", className, text);
  node.type = "button";
  if (label) {
    node.title = label;
    node.setAttribute("aria-label", label);
  }
  return node;
}
function svg(tag, className) {
  const node = document.createElementNS(SVG_NS, tag);
  if (className) node.setAttribute("class", className);
  return node;
}
function visibleRows(rows, open) {
  const shown = [];
  const visible = /* @__PURE__ */ new Set();
  for (const row of rows ?? []) {
    if (row.parentUid && (!visible.has(row.parentUid) || !open.has(row.parentUid))) continue;
    visible.add(row.uid);
    shown.push(row);
  }
  return shown;
}
function clamp3(value, low, high) {
  return Math.max(low, Math.min(high, value));
}
function curve(sx, sy, ex, ey, vertical) {
  const c1 = vertical ? [sx, sy + (ey - sy) / 2] : [sx + (ex - sx) / 2, sy];
  const c2 = vertical ? [ex, ey - (ey - sy) / 2] : [ex - (ex - sx) / 2, ey];
  return {
    d: `M${sx},${sy} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${ex},${ey}`,
    mid: [(sx + 3 * c1[0] + 3 * c2[0] + ex) / 8, (sy + 3 * c1[1] + 3 * c2[1] + ey) / 8]
  };
}
function luminance(color) {
  const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(color ?? "");
  if (!match) return null;
  const [r, g, b] = match.slice(1, 4).map((value) => {
    const channel = Number(value) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function describe(item, titleOf2) {
  if (item.kind === "typed") {
    const labels = item.labels?.length ? ` (${item.labels.join(", ")})` : "";
    return item.direction === "out" ? `${item.attribute}:: on the center${labels}` : `${item.attribute}:: on this node, pointing at the center${labels}`;
  }
  if (item.kind === "link") return "Linked from a block in the center's outline";
  if (item.kind === "mention") return "Links to the center from a block here";
  if (item.kind === "structural") {
    if (item.note === "namespace") return "Namespace";
    if (item.note === "day") return "Adjacent daily note";
    if (item.note === "page") return "The page this block is on";
    return "The block this block sits under";
  }
  if (item.attribute) return `Shares ${item.attribute}:: under ${titleOf2(item.via) || "a parent"}`;
  if (item.note === "mentioned together") return "Mentioned in the same block";
  return item.note === "sibling block" ? "Sibling block" : "Same namespace";
}
var TYPING_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
function isTypingTarget(target) {
  return typeof target?.matches === "function" && target.matches(TYPING_SELECTOR);
}
function mountOverlay({ extensionAPI, lifecycle, host }) {
  const doc = globalThis.document;
  if (!doc?.body || typeof doc.createElement !== "function") {
    const view = {
      repullIfOpen() {
      },
      toggle() {
        return Promise.resolve();
      },
      focusPage() {
        return Promise.resolve();
      },
      focusBlock(uid) {
        view.focusUid(uid);
        return Promise.resolve();
      },
      focusUid() {
      },
      isOpen() {
        return false;
      },
      hideResults() {
      }
    };
    return {
      ...view,
      ctx: null,
      features: createFeatures(),
      installCommands: () => registerCommands({ extensionAPI, lifecycle, host, view })
    };
  }
  return mountReal({ extensionAPI, lifecycle, host });
}
function mountReal({ extensionAPI, lifecycle, host }) {
  const root = el("div", "compass-root");
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Compass");
  const bar = el("div", "compass-bar");
  const backButton = button("compass-back", "Back", "Back (Alt+Left)");
  const forwardButton = button("compass-forward", "Forward", "Forward (Alt+Right)");
  const find = el("div", "compass-find");
  const searchInput = el("input", "compass-search");
  searchInput.type = "search";
  searchInput.autocomplete = "off";
  searchInput.placeholder = "Find a page";
  searchInput.setAttribute("aria-label", "Find a page");
  const results = el("div", "compass-results");
  results.hidden = true;
  results.setAttribute("role", "listbox");
  find.append(searchInput, results);
  const pinButton = button("compass-pin", "Pin", "Pin the center");
  const outlineButton = button("compass-outline", "Outline", "Expand the center into its blocks");
  outlineButton.setAttribute("aria-pressed", "false");
  const fitButton = button("compass-fit", "Fit", "Fit the neighborhood");
  const refreshButton = button("compass-refresh", "Refresh", "Read the graph again");
  const linkedButton = button("compass-linked", "Show linked window", "Open this page in the main window");
  const crossButton = button("compass-cross", "Cross links", "Faint edges between neighbours");
  crossButton.setAttribute("aria-pressed", "false");
  const linksButton = button("compass-with-links", "With links", "Snapshot text includes page links");
  linksButton.setAttribute("aria-pressed", "false");
  const sendButton = button("compass-send", "Send to drawing", "Commit this neighborhood to the open drawing");
  sendButton.hidden = true;
  const status = el("span", "compass-status");
  status.setAttribute("role", "status");
  const closeButton = button("compass-close", "Close", "Close (Esc)");
  bar.append(
    backButton,
    forwardButton,
    find,
    pinButton,
    outlineButton,
    fitButton,
    refreshButton,
    linkedButton,
    crossButton,
    linksButton,
    sendButton,
    status,
    closeButton
  );
  const pinRow = el("div", "compass-pins");
  pinRow.hidden = true;
  const urls = el("div", "compass-urls");
  urls.hidden = true;
  const stage = el("div", "compass-stage");
  stage.tabIndex = 0;
  const world = el("div", "compass-world");
  const edgeLayer = svg("svg", "compass-edges");
  edgeLayer.setAttribute("width", "1");
  edgeLayer.setAttribute("height", "1");
  const empty = el("p", "compass-empty");
  empty.hidden = true;
  world.append(edgeLayer, empty);
  const hints = {};
  for (const side of ["north", "south", "west", "east"]) {
    const hint = el("div", `compass-hint compass-hint-${side}`);
    hint.dataset.side = side;
    hints[side] = hint;
    stage.append(hint);
  }
  const zoneAdds = {};
  for (const side of ["north", "south", "west", "east"]) {
    const add = button(`compass-zone-add compass-zone-add-${side}`, "+", `Add to the ${side}`);
    add.dataset.zone = side;
    zoneAdds[side] = add;
    stage.append(add);
  }
  const zoneCounts = {};
  for (const side of ["north", "south", "west", "east", "siblings"]) {
    const label = el("span", `compass-zone-count compass-zone-count-${side}`);
    label.hidden = true;
    zoneCounts[side] = label;
    stage.append(label);
  }
  stage.prepend(world);
  const menu = el("div", "compass-menu");
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  const details = el("div", "compass-details");
  details.hidden = true;
  const ghost = el("div", "compass-ghost");
  ghost.hidden = true;
  const hover = el("div", "compass-hover");
  hover.hidden = true;
  const related = el("div", "compass-related");
  related.hidden = true;
  const zonePopEl = el("div", "compass-zone-pop");
  zonePopEl.hidden = true;
  zonePopEl.setAttribute("role", "dialog");
  zonePopEl.setAttribute("aria-label", "Add a related page");
  const zoneInput = el("input", "compass-zone-input");
  zoneInput.setAttribute("aria-label", "Find a page or name a drawing");
  const zoneResults = el("div", "compass-zone-results");
  const zoneCreate = button("compass-zone-create", "Create drawing here");
  zoneCreate.disabled = true;
  zonePopEl.append(zoneInput, zoneResults, zoneCreate);
  root.append(bar, pinRow, urls, stage, menu, details, ghost, hover, related, zonePopEl);
  const features = createFeatures();
  const nodeEls = /* @__PURE__ */ new Map();
  const chipEls = /* @__PURE__ */ new Map();
  const timers = /* @__PURE__ */ new Set();
  const back = [];
  const forward = [];
  const expandedZones = /* @__PURE__ */ new Map();
  const openRows = /* @__PURE__ */ new Map();
  let current = null;
  let snapshot = null;
  let hood = null;
  let openBoardUid = null;
  let geometry = null;
  let settings = null;
  let nodeByUid = /* @__PURE__ */ new Map();
  let panX = 0;
  let panY = 0;
  let zoom = 1;
  let pointer = null;
  let suppressClick = false;
  let clickTimer = null;
  let reloadTimer = null;
  let statusTimer = null;
  let searchTimer = null;
  let titleCache = null;
  let recentCache = null;
  let activeResult = 0;
  const thumbUrls = /* @__PURE__ */ new Map();
  const thumbRenderTried = /* @__PURE__ */ new Set();
  let thumbRenderChain = Promise.resolve();
  let plexusOff = null;
  let plexusApi2 = null;
  let plexusFramePending = false;
  let followGen = 0;
  let compassNavUntil = 0;
  let hoverToken = 0;
  let hoverUid = null;
  let hoverUrl = null;
  let hoverNode = null;
  let hoverX = 0;
  let hoverY = 0;
  let lens = { pages: true, blocks: true, drawings: true, regions: true, keyword: "" };
  let customView = false;
  let emptyCounts = {};
  const pageAttrCache = /* @__PURE__ */ new Map();
  let linksMode = false;
  let zoneTarget = null;
  let forceSidecar = false;
  const partUrls = /* @__PURE__ */ new Set();
  const rawOpenInMain = host.openInMain.bind(host);
  host.openInMain = (uid, kind) => {
    compassNavUntil = Date.now() + 800;
    return rawOpenInMain(uid, kind);
  };
  function later(fn, ms) {
    const id = globalThis.setTimeout(() => {
      timers.delete(id);
      if (!lifecycle.disposed) fn();
    }, ms);
    timers.add(id);
    return id;
  }
  function cancel(id) {
    if (id == null) return null;
    globalThis.clearTimeout(id);
    timers.delete(id);
    return null;
  }
  function frame(fn) {
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf !== "function") return later(fn, 16);
    raf(() => {
      if (!lifecycle.disposed) fn();
    });
    return null;
  }
  function setStatus(text, sticky = false) {
    status.textContent = text || "";
    statusTimer = cancel(statusTimer);
    if (text && !sticky) statusTimer = later(() => {
      status.textContent = "";
    }, 5e3);
  }
  function readSettings() {
    try {
      return readCompassSettings(extensionAPI);
    } catch (error) {
      console.error("[compass] settings", error);
      return null;
    }
  }
  function titleOf2(uid) {
    if (!uid) return "";
    if (uid === hood?.center?.uid) return hood.center.title;
    return nodeByUid.get(uid)?.title ?? "";
  }
  function sampleTheme() {
    const body = getComputedStyle(document.body);
    let paper = body.backgroundColor;
    if (!paper || paper === "transparent" || paper === "rgba(0, 0, 0, 0)") {
      paper = getComputedStyle(document.documentElement).backgroundColor;
    }
    if (paper && paper !== "transparent" && paper !== "rgba(0, 0, 0, 0)") root.style.setProperty("--compass-paper", paper);
    if (body.color) root.style.setProperty("--compass-ink", body.color);
    const light = luminance(paper);
    root.dataset.tone = light != null && light < 0.35 ? "dark" : "light";
  }
  function placeFrame() {
    const sidebar = document.getElementById("right-sidebar");
    const viewport = globalThis.innerWidth || 0;
    let inset = 0;
    if (sidebar?.getBoundingClientRect && viewport) {
      const width = sidebar.getBoundingClientRect().width;
      if (width > 48 && width < viewport * 0.6) inset = Math.round(width);
    }
    root.style.right = `${inset}px`;
  }
  function applyCamera(glide = false) {
    world.classList.toggle("compass-glide", glide);
    world.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    if (glide) later(() => world.classList.remove("compass-glide"), 320);
  }
  function fit(glide = true) {
    if (!geometry) return;
    const rect = stage.getBoundingClientRect();
    const { minX, minY, maxX, maxY } = geometry.bounds;
    const width = Math.max(1, maxX - minX + 48);
    const height = Math.max(1, maxY - minY + 48);
    zoom = clamp3(Math.min(1, (rect.width || width) / width, (rect.height || height) / height), 0.3, 1);
    panX = -((minX + maxX) / 2) * zoom;
    panY = -((minY + maxY) / 2) * zoom;
    applyCamera(glide);
  }
  function clientToWorld(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    return {
      x: (clientX - rect.left - rect.width / 2 - panX) / zoom,
      y: (clientY - rect.top - rect.height / 2 - panY) / zoom
    };
  }
  function setCamera(camera = {}, glide = false) {
    if (Number.isFinite(camera?.panX)) panX = camera.panX;
    if (Number.isFinite(camera?.panY)) panY = camera.panY;
    if (Number.isFinite(camera?.zoom)) zoom = clamp3(camera.zoom, 0.25, 2.5);
    applyCamera(glide === true);
  }
  function setGeometry(next) {
    geometry = next;
  }
  function setLens(patch) {
    if (patch && typeof patch === "object") {
      for (const key of ["pages", "blocks", "drawings", "regions"]) {
        if (key in patch && patch[key] !== void 0) lens[key] = Boolean(patch[key]);
      }
      if ("keyword" in patch && patch.keyword !== void 0) lens.keyword = String(patch.keyword);
    }
    render();
  }
  async function saveSetting(id, value) {
    await writeSetting(extensionAPI, id, value);
    const next = readSettings();
    if (next) settings = next;
    features.each("onSettings", settings);
  }
  function addBarButton(element) {
    if (!element) return element;
    return bar.insertBefore(element, status);
  }
  function commands() {
    return [
      { id: "back", title: "Back", hint: "Alt+Left", run: () => goBack() },
      { id: "forward", title: "Forward", hint: "Alt+Right", run: () => goForward() },
      {
        id: "find",
        title: "Find a page",
        hint: "Cmd/Ctrl+F",
        run: () => {
          searchInput.focus();
          searchInput.select();
        }
      },
      { id: "fit", title: "Fit to screen", hint: "", run: () => fit(true) },
      { id: "refresh", title: "Refresh", hint: "", run: () => load() },
      { id: "pin", title: "Pin or unpin the center", hint: "", run: () => togglePin() },
      { id: "outline", title: "Toggle outline", hint: "", run: () => toggleOutline() },
      { id: "close", title: "Close Compass", hint: "Esc", run: () => close() },
      ...features.collect("commands")
    ];
  }
  function facts(nodes) {
    const list = Array.isArray(nodes) ? nodes : [];
    const missing = [];
    const seen = /* @__PURE__ */ new Set();
    for (const node of list) {
      const uid = node?.uid;
      if (node?.kind !== "page" || typeof uid !== "string" || !uid) continue;
      if (pageAttrCache.has(uid) || seen.has(uid)) continue;
      seen.add(uid);
      missing.push(uid);
    }
    if (missing.length && typeof host.pageAttributes === "function") {
      for (let index = 0; index < missing.length; index += 200) {
        const batch = missing.slice(index, index + 200);
        try {
          const fetched = host.pageAttributes(batch);
          for (const uid of batch) pageAttrCache.set(uid, fetched?.[uid] ?? {});
        } catch (error) {
          console.error("[compass] page attributes", error);
          break;
        }
      }
    }
    const emptyUids = /* @__PURE__ */ new Set();
    for (const node of list) {
      if (node && typeof node.uid === "string" && isEmptyPage(node.kind, emptyCounts[node.uid])) {
        emptyUids.add(node.uid);
      }
    }
    const typeAttribute = settings?.typeAttribute || "Type";
    return factsFor(list, pageAttrCache, { typeAttribute, emptyUids });
  }
  function expandedFor(uid) {
    if (!expandedZones.has(uid)) expandedZones.set(uid, /* @__PURE__ */ new Set());
    return expandedZones.get(uid);
  }
  function rowsFor(uid) {
    if (!openRows.has(uid)) openRows.set(uid, /* @__PURE__ */ new Set());
    return openRows.get(uid);
  }
  function rebuild() {
    if (!snapshot || !settings) return;
    const diagram = settings.boards === false ? null : diagramApi();
    const cap = Number(settings.model?.maxPerZone);
    const limit = Number.isFinite(cap) && cap > 0 ? cap : 12;
    let boards = [];
    let cards = [];
    if (diagram && current) {
      boards = boardPlan(diagram, current);
      if (openBoardUid) cards = cardPlan(diagram, openBoardUid, limit);
    }
    hood = buildNeighborhood(snapshot, settings.model, {
      expanded: expandedFor(current),
      regionLabel: plexusRegionLabels(plexus()),
      boards,
      cards
    });
    const refreshEmptyCounts = (nodes) => {
      try {
        const pageUids = nodes.filter((node) => node.kind === "page").map((node) => node.uid);
        emptyCounts = typeof host.childCounts === "function" ? host.childCounts(pageUids) ?? {} : {};
      } catch (error) {
        console.error("[compass] child counts", error);
        emptyCounts = {};
      }
    };
    refreshEmptyCounts(hood.nodes);
    const initialPages = hood.nodes.filter((node) => node.kind === "page").map((node) => node.uid).join("\0");
    hood = features.pipe("transformHood", hood);
    nodeByUid = new Map(hood.nodes.map((node) => [node.uid, node]));
    const finalPages = hood.nodes.filter((node) => node.kind === "page").map((node) => node.uid).join("\0");
    if (finalPages !== initialPages) refreshEmptyCounts(hood.nodes);
  }
  function load({ navigate = false } = {}) {
    pageAttrCache.clear();
    if (!current || root.hidden || lifecycle.disposed) return;
    const next = readSettings();
    if (!next) return;
    settings = next;
    features.each("onSettings", settings);
    try {
      snapshot = host.snapshot(current, settings.model);
    } catch (error) {
      console.error("[compass] read failed", error);
      setStatus("Could not read this neighborhood.", true);
      return;
    }
    rebuild();
    render({ navigate });
    renderPins();
    if (snapshot.missing) setStatus("Nothing in this graph has that uid.", true);
    const uid = current;
    const sidecar = forceSidecar === true || settings.sidecar === true;
    forceSidecar = false;
    void host.syncSidecar(uid, sidecar).catch((error) => console.error("[compass] sidecar", error)).then(() => {
      placeFrame();
      later(placeFrame, 350);
    });
  }
  function scheduleReload() {
    if (root.hidden || lifecycle.disposed) return;
    reloadTimer = cancel(reloadTimer);
    reloadTimer = later(() => {
      reloadTimer = null;
      load();
    }, 300);
  }
  function repullIfOpen() {
    scheduleReload();
  }
  function updateButtons() {
    backButton.disabled = back.length === 0;
    forwardButton.disabled = forward.length === 0;
    const pinned = (settings?.pins ?? []).some((pin) => pin.uid === current);
    pinButton.textContent = pinned ? "Unpin" : "Pin";
    pinButton.setAttribute("aria-pressed", pinned ? "true" : "false");
    outlineButton.setAttribute("aria-pressed", settings?.outline ? "true" : "false");
    crossButton.setAttribute("aria-pressed", settings?.crossLinks ? "true" : "false");
    sendButton.hidden = plexus()?.isAvailable?.() !== true;
  }
  function reveal() {
    if (!root.hidden) return;
    sampleTheme();
    root.hidden = false;
    placeFrame();
    features.each("onOpen");
  }
  function focusUid(uid, options = {}) {
    const record = options.record !== false;
    if (!uid) return;
    if (options.sidecar === true) forceSidecar = true;
    hideFloating();
    const previous = current;
    if (record && current && current !== uid) {
      back.push(current);
      if (back.length > HISTORY_CAP) back.shift();
      forward.length = 0;
    }
    const changed = current !== uid;
    if (changed) openBoardUid = null;
    current = uid;
    reveal();
    features.each("onNavigate", { uid, previous, changed, record, follow: false });
    host.watch(uid, scheduleReload);
    load({ navigate: changed });
    updateButtons();
    if (document.activeElement === searchInput) {
      if (searchInput.value.trim()) runSearch();
      else showEmptyQuery();
    } else {
      hideResults();
    }
  }
  function goBack() {
    if (!back.length) return;
    if (current) forward.push(current);
    focusUid(back.pop(), { record: false });
  }
  function goForward() {
    if (!forward.length) return;
    if (current) back.push(current);
    focusUid(forward.pop(), { record: false });
  }
  function close() {
    root.hidden = true;
    host.unwatch();
    host.releaseSidecar();
    reloadTimer = cancel(reloadTimer);
    clickTimer = cancel(clickTimer);
    titleCache = null;
    recentCache = null;
    pointer = null;
    hideFloating();
    clearHover();
    markHover(root, null);
    hoverNode = null;
    endDrag();
    setStatus("");
    lens = { pages: true, blocks: true, drawings: true, regions: true, keyword: "" };
    linksMode = false;
    linksButton.setAttribute("aria-pressed", "false");
    emptyCounts = {};
    pageAttrCache.clear();
    features.each("onClose");
  }
  function recenter(uid) {
    if (!uid || root.hidden || lifecycle.disposed) return;
    pageAttrCache.clear();
    hideFloating();
    const previous = current;
    const changed = current !== uid;
    current = uid;
    features.each("onNavigate", { uid, previous, changed, record: false, follow: true });
    host.watch(uid, scheduleReload);
    const next = readSettings();
    if (!next) return;
    settings = next;
    features.each("onSettings", settings);
    try {
      snapshot = host.snapshot(current, settings.model);
    } catch (error) {
      console.error("[compass] read failed", error);
      setStatus("Could not read this neighborhood.", true);
      return;
    }
    rebuild();
    render({ navigate: true });
    renderPins();
    if (snapshot.missing) setStatus("Nothing in this graph has that uid.", true);
    updateButtons();
  }
  function sleep(ms) {
    return new Promise((resolve) => {
      const id = globalThis.setTimeout(() => {
        timers.delete(id);
        resolve();
      }, ms);
      timers.add(id);
    });
  }
  function followPaused() {
    if (root.hidden || lifecycle.disposed || !settings?.follow) return true;
    if ((settings.pins ?? []).some((pin) => pin.uid === current)) return true;
    if (Date.now() < compassNavUntil) return true;
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || active.isContentEditable === true;
  }
  async function onHashChange() {
    const gen = ++followGen;
    const uid = uidFromHash(globalThis.location?.hash ?? "");
    if (!uid || followPaused()) return;
    for (let i = 0; i < 12; i += 1) {
      if (gen !== followGen || lifecycle.disposed) return;
      let open = null;
      try {
        open = await host.mainUid();
      } catch (error) {
        console.error("[compass] follow", error);
        return;
      }
      if (gen !== followGen || followPaused()) return;
      if (open === uid) {
        if (uid !== current) recenter(uid);
        return;
      }
      await sleep(40);
    }
  }
  async function toggle() {
    if (!root.hidden) {
      close();
      return;
    }
    const uid = await host.openPageUid();
    if (uid) focusUid(uid);
    else if (current) focusUid(current, { record: false });
  }
  async function focusPage() {
    const uid = await host.openPageUid();
    if (uid) focusUid(uid);
  }
  function isOpen() {
    return root.hidden !== true;
  }
  async function focusBlock(uid) {
    const target = uid || host.focusedBlock();
    if (target) focusUid(target);
    else setStatus("Put the cursor in a block first.");
  }
  function nodeClass(node, isCenter) {
    const parts = ["compass-node"];
    if (isCenter) parts.push("compass-node-center");
    if (!isCenter && node?.writable) parts.push("compass-writable");
    return parts.join(" ");
  }
  function renderCenterContent(element, box) {
    element.replaceChildren();
    const head = el("div", "compass-center-head");
    const kind = el("span", "compass-kind", hood.center.kind === "block" ? "Block" : "Page");
    const title = el("span", "compass-node-title", hood.center.title);
    head.append(kind, title);
    element.append(head);
    if (hood.center.badges.length) {
      const badges = el("div", "compass-badges");
      for (const badge of hood.center.badges) {
        const chip = el("span", "compass-badge", `${badge.attribute}: ${badge.text}`);
        chip.title = chip.textContent;
        badges.append(chip);
      }
      element.append(badges);
    }
    const top = box.y - box.h / 2;
    const open = rowsFor(current);
    for (const row of geometry.rows) {
      const info = hood.outline.find((item) => item.uid === row.uid);
      const line = el("div", "compass-row");
      line.dataset.uid = row.uid;
      line.style.top = `${row.y - row.h / 2 - top}px`;
      line.style.paddingLeft = `${4 + row.depth * 14}px`;
      if (info?.childCount) {
        const caret = button("compass-caret", open.has(row.uid) ? "−" : "+", open.has(row.uid) ? "Fold" : "Unfold");
        caret.dataset.uid = row.uid;
        line.append(caret);
      } else {
        line.append(el("span", "compass-caret-space"));
      }
      line.append(el("span", "compass-row-text", info?.text ?? ""));
      line.title = info?.text ?? "";
      element.append(line);
    }
    if (geometry.more) {
      const more = el("div", "compass-row compass-row-more", "More blocks in the sidebar");
      more.style.top = `${box.h - 8 - 24}px`;
      element.append(more);
    }
    if (hood.center.plexus === "drawing") renderDrawingParts(element, box);
  }
  function placeElement2(element, box) {
    element.style.width = `${box.w}px`;
    element.style.height = `${box.h}px`;
    element.style.transform = `translate(${box.x - box.w / 2}px, ${box.y - box.h / 2}px)`;
  }
  function dropThumb(uid) {
    const held = thumbUrls.get(uid);
    if (held == null) return;
    thumbUrls.delete(uid);
    try {
      globalThis.URL.revokeObjectURL(held.url);
    } catch {
    }
  }
  function dropAllThumbs() {
    for (const uid of [...thumbUrls.keys()]) dropThumb(uid);
  }
  function showThumb(element, uid, string, url) {
    const img = el("img", "compass-node-thumb");
    img.alt = "";
    img.draggable = false;
    img.src = url;
    thumbUrls.set(uid, { url, string });
    element.prepend(img);
  }
  function requestThumb(api, uid, render2) {
    try {
      return Promise.resolve(api.thumbnail(uid, render2 ? { maxWidth: THUMB_WIDTH, render: true } : { maxWidth: THUMB_WIDTH }));
    } catch (error) {
      console.error("[compass] thumbnail", error);
      return Promise.resolve(null);
    }
  }
  function attachThumb(element, node) {
    if (node?.style === "board") {
      attachDiagramThumb(element, node);
      return;
    }
    const held = thumbUrls.get(node.uid);
    const api = plexus();
    if (!settings?.drawings || !isDrawingLike(node) || !api || typeof api.thumbnail !== "function") {
      dropThumb(node.uid);
      return;
    }
    if (held && held.string === node.string) {
      showThumb(element, node.uid, node.string, held.url);
      return;
    }
    dropThumb(node.uid);
    const accept = (blob) => {
      if (!blob || lifecycle.disposed || !element.isConnected || nodeEls.get(node.uid) !== element) return false;
      if (element.querySelector(".compass-node-thumb")) return true;
      showThumb(element, node.uid, node.string, globalThis.URL.createObjectURL(blob));
      return true;
    };
    requestThumb(api, node.uid, false).then((blob) => {
      if (accept(blob)) return;
      const key = `${node.uid}|${node.string}`;
      if (blob || thumbRenderTried.has(key) || lifecycle.disposed) return;
      thumbRenderTried.add(key);
      thumbRenderChain = thumbRenderChain.then(() => lifecycle.disposed ? null : requestThumb(plexus() ?? api, node.uid, true)).then(accept).catch((error) => console.error("[compass] thumbnail", error));
    }).catch((error) => console.error("[compass] thumbnail", error));
  }
  function revokePartUrls() {
    for (const url of partUrls) {
      try {
        globalThis.URL.revokeObjectURL(url);
      } catch {
      }
    }
    partUrls.clear();
  }
  function resolveRef(ref) {
    if (typeof ref !== "string") return null;
    const block = BLOCK_REF.exec(ref);
    if (block?.[1]) return block[1];
    const page = PAGE_REF.exec(ref);
    if (!page?.[1]) return null;
    if (!titleCache) titleCache = host.titles();
    const hit = (titleCache ?? []).find((row) => row.title === page[1]);
    return hit?.uid ?? null;
  }
  function centreRefs() {
    const refs = /* @__PURE__ */ new Set();
    if (current) refs.add(current);
    const api = plexus();
    if (typeof api?.linksOf === "function") {
      try {
        for (const row of api.linksOf(current) ?? []) {
          const uid = resolveRef(row.ref);
          if (uid) refs.add(uid);
        }
      } catch (error) {
        console.error("[compass] links", error);
      }
    }
    for (const ref of snapshot?.center?.refs ?? []) {
      const uid = topicRefUid(ref);
      if (uid) refs.add(uid);
    }
    for (const mention of snapshot?.mentions ?? []) {
      if (mention?.uid) refs.add(mention.uid);
      if (mention?.page?.uid) refs.add(mention.page.uid);
      for (const ref of mention?.refs ?? []) {
        const uid = topicRefUid(ref);
        if (uid) refs.add(uid);
      }
    }
    return refs;
  }
  function renderDrawingParts(element, box) {
    const api = plexus();
    revokePartUrls();
    const list = el("div", "compass-parts");
    list.style.top = `${box.h}px`;
    element.append(list);
    if (typeof api?.framesOf !== "function") return;
    let frames = [];
    let regions = [];
    try {
      frames = api.framesOf(current) ?? [];
      regions = typeof api.regionsOf === "function" ? api.regionsOf(current) ?? [] : [];
    } catch (error) {
      console.error("[compass] parts", error);
      return;
    }
    for (const frame2 of frames) {
      if (!frame2?.elementId) continue;
      const row = button("compass-part", frame2.name || "Frame");
      row.dataset.kind = "frame";
      row.dataset.id = frame2.elementId;
      list.append(row);
    }
    for (const region of regions) {
      if (!region?.uid) continue;
      const row = button("compass-part", region.label || region.uid);
      row.dataset.kind = "region";
      row.dataset.uid = region.uid;
      list.append(row);
      if (typeof api.thumbnail !== "function") continue;
      const uid = region.uid;
      Promise.resolve(api.thumbnail(uid, { maxWidth: THUMB_WIDTH })).then((blob) => {
        if (!blob || !row.isConnected) return;
        const url = globalThis.URL.createObjectURL(blob);
        partUrls.add(url);
        const img = el("img", "compass-part-thumb");
        img.alt = "";
        img.src = url;
        row.prepend(img);
      }).catch((error) => console.error("[compass] part thumb", error));
    }
  }
  function drawLinkEdges(boxes) {
    const api = plexus();
    if (typeof api?.linksOf !== "function" || !current || !geometry) return;
    let rows = [];
    try {
      rows = api.linksOf(current) ?? [];
    } catch (error) {
      console.error("[compass] links", error);
      return;
    }
    const prepared = [];
    for (const row of rows) {
      const uid = resolveRef(row?.ref);
      if (!uid || uid === current || !boxes.has(uid)) continue;
      prepared.push({ uid, text: typeof row.text === "string" ? row.text : "" });
    }
    for (const edge of drawingLinkEdges(prepared)) {
      const box = boxes.get(edge.uid);
      if (!box) continue;
      const shape = edgeFromCenter(box);
      const group = svg("g", "compass-edge");
      group.dataset.uid = edge.uid;
      group.dataset.style = "link";
      const hit = svg("path", "compass-edge-hit");
      hit.setAttribute("d", shape.d);
      const line = svg("path", "compass-edge-line");
      line.setAttribute("d", shape.d);
      group.append(hit, line);
      if (edge.text) {
        const text = svg("text", "compass-edge-label");
        text.setAttribute("x", String(shape.mid[0]));
        text.setAttribute("y", String(shape.mid[1] - 4));
        text.textContent = edge.text.length > 48 ? `${edge.text.slice(0, 47)}…` : edge.text;
        group.append(text);
      }
      edgeLayer.append(group);
    }
  }
  function edgeBetween(a, b) {
    return { d: `M${a.x},${a.y} L${b.x},${b.y}` };
  }
  function renderCross(boxes) {
    if (!settings?.crossLinks || typeof host.crossRows !== "function") return;
    const uids = hood.nodes.map((node) => node.uid);
    let rows = [];
    try {
      rows = host.crossRows(uids);
    } catch (error) {
      console.error("[compass] cross links", error);
      return;
    }
    for (const edge of crossEdges(rows, uids, 40)) {
      const from = boxes.get(edge.source);
      const to = boxes.get(edge.target);
      if (!from || !to) continue;
      const shape = edgeBetween(from, to);
      const group = svg("g", "compass-edge compass-cross");
      group.dataset.source = edge.source;
      group.dataset.target = edge.target;
      const line = svg("path", "compass-edge-line");
      line.setAttribute("d", shape.d);
      group.append(line);
      edgeLayer.append(group);
    }
  }
  function markCross(uid) {
    for (const edge of edgeLayer.querySelectorAll(".compass-cross")) {
      edge.classList.toggle("compass-edge-hot", Boolean(uid) && (edge.dataset.source === uid || edge.dataset.target === uid));
    }
  }
  function renderZoneCounts(hidden) {
    for (const side of ["north", "south", "west", "east", "siblings"]) {
      const members = hood.nodes.filter((node) => node.zone === side);
      const label = zoneCounts[side];
      const total = members.length;
      label.hidden = total === 0;
      label.textContent = `${members.filter((node) => !hidden.has(node.uid)).length}/${total}`;
    }
  }
  function outlineStrings(nodes, out) {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (typeof node?.string === "string") out.push(node.string);
      outlineStrings(node.children, out);
    }
  }
  function renderUrls() {
    urls.replaceChildren();
    const strings = [];
    outlineStrings(snapshot?.outline, strings);
    if (hood?.center?.plexus === "drawing") {
      const api = plexus();
      if (typeof api?.linksOf === "function") {
        try {
          for (const row of api.linksOf(current) ?? []) {
            if (typeof row?.ref === "string") strings.push(row.ref);
            if (typeof row?.text === "string") strings.push(row.text);
          }
        } catch (error) {
          console.error("[compass] urls", error);
        }
      }
    }
    const groups = urlGroups(strings);
    urls.hidden = groups.length === 0;
    for (const group of groups) {
      const block = el("div", "compass-url-host", group.host);
      for (const url of group.urls) {
        const link = el("a", "compass-url", url);
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        block.append(link);
      }
      urls.append(block);
    }
  }
  function hideZonePop() {
    zonePopEl.hidden = true;
    zoneInput.value = "";
    zoneResults.replaceChildren();
    zoneCreate.disabled = true;
    zoneTarget = null;
  }
  function openZonePop(zone, clientX, clientY) {
    hideFloating();
    zoneTarget = zone;
    zonePopEl.hidden = false;
    const rect = stage.getBoundingClientRect();
    const x = Number.isFinite(clientX) ? clientX : rect.left + rect.width / 2;
    const y = Number.isFinite(clientY) ? clientY : rect.top + rect.height / 2;
    placeFloating(zonePopEl, x, y);
    zoneInput.focus();
  }
  function paintZoneResults(text) {
    if (!titleCache) titleCache = host.titles();
    const found = rankTitles(titleCache, text, 20);
    zoneResults.replaceChildren();
    for (const row of found) {
      const item = button("compass-result", row.title);
      item.dataset.uid = row.uid;
      item.dataset.title = row.title;
      zoneResults.append(item);
    }
    zoneCreate.disabled = text.trim() === "";
  }
  async function writeZone(zone, title) {
    if (!zone || !current || !title) return;
    let result;
    try {
      result = await host.writeZoneAttribute({ centerUid: current, zone, title });
    } catch (error) {
      console.error("[compass] zone", error);
      setStatus("The write failed.");
      return;
    }
    if (!result?.ok) {
      if (result?.reason === "have") setStatus("That relation is already there.");
      else if (result?.reason === "title") setStatus("That title cannot be written as a link.");
      else setStatus("The write failed.");
      return;
    }
    load();
  }
  async function createDrawingHere() {
    const zone = zoneTarget;
    const name = zoneInput.value.trim();
    hideZonePop();
    if (!zone || !name || !current) return;
    let existing = null;
    try {
      existing = host.findDrawingBlock(name);
    } catch (error) {
      console.error("[compass] drawing lookup", error);
    }
    const plan = planZoneCreate({ existingDrawingUid: existing });
    if (plan.create) {
      const api = plexus();
      if (typeof api?.create !== "function") {
        setStatus("Plexus is needed");
        return;
      }
      try {
        await api.create({ title: name });
      } catch (error) {
        console.error("[compass] create drawing", error);
        setStatus("Plexus could not create the drawing.");
        return;
      }
    }
    await writeZone(zone, `Drawings/${name}`);
  }
  async function sendToDrawing() {
    if (!hood) return;
    const nodes = [
      { uid: hood.center.uid, title: hood.center.title, zone: "center" },
      ...hood.nodes.map((node) => ({ uid: node.uid, title: node.title, zone: node.zone }))
    ];
    const edges = hood.nodes.map((node) => ({ source: hood.center.uid, target: node.uid }));
    const mode = linksMode ? "links" : "plain";
    const api = plexus();
    if (typeof api?.dropSubgraph !== "function") {
      setStatus("Plexus is needed");
      return;
    }
    try {
      await api.dropSubgraph({ nodes, edges, mode });
      setStatus("Sent to the open drawing.");
    } catch (error) {
      const message = String(error?.message || error);
      if (/not open/i.test(message)) setStatus("Open a drawing first.");
      else setStatus("Could not send the snapshot.");
    }
  }
  function renderRelated() {
    related.replaceChildren();
    related.hidden = true;
    const api = plexus();
    if (!settings?.relatedDrawings || typeof api?.linksOf !== "function" || !current || typeof host.drawingRows !== "function") return;
    const refs = centreRefs();
    let rows = [];
    try {
      rows = host.drawingRows(current, [...refs]) ?? [];
    } catch (error) {
      console.error("[compass] related", error);
      return;
    }
    for (const row of rows) {
      try {
        for (const link of api.linksOf(row.uid) ?? []) {
          const uid = resolveRef(link?.ref);
          if (uid && refs.has(uid) && !row.refs.includes(uid)) row.refs.push(uid);
        }
      } catch (error) {
        console.error("[compass] related links", error);
      }
    }
    const ranked = rankDrawings(refs, rows).filter((row) => row.uid && row.uid !== current);
    if (!ranked.length) return;
    related.hidden = false;
    related.append(el("div", "compass-related-title", "Related drawings"));
    for (const row of ranked) {
      const item = button("compass-related-item", row.title || row.uid);
      item.dataset.uid = row.uid;
      related.append(item);
    }
  }
  function clearHover() {
    hoverToken += 1;
    hoverUid = null;
    hover.hidden = true;
    hover.replaceChildren();
    if (hoverUrl) {
      try {
        globalThis.URL.revokeObjectURL(hoverUrl);
      } catch {
      }
      hoverUrl = null;
    }
  }
  function placeHover(clientX, clientY) {
    hover.style.left = `${clientX + 12}px`;
    hover.style.top = `${clientY + 12}px`;
  }
  function attachDiagramThumb(element, node) {
    const api = diagramApi();
    if (settings?.boards === false || !api || typeof api.thumbnail !== "function") {
      dropThumb(node.uid);
      return;
    }
    const held = thumbUrls.get(node.uid);
    if (held && held.string === "board") {
      showThumb(element, node.uid, "board", held.url);
      return;
    }
    dropThumb(node.uid);
    const accept = (blob) => {
      if (!blob || lifecycle.disposed || !element.isConnected || nodeEls.get(node.uid) !== element) return false;
      if (element.querySelector(".compass-node-thumb")) return true;
      const url = typeof blob === "string" ? blob : globalThis.URL.createObjectURL(blob);
      showThumb(element, node.uid, "board", url);
      return true;
    };
    let pending = null;
    try {
      pending = api.thumbnail(node.uid, { maxWidth: THUMB_WIDTH });
    } catch {
      pending = null;
    }
    Promise.resolve(pending).then((blob) => {
      accept(blob);
    }).catch((error) => console.error("[compass] board thumb", error));
  }
  function showHover(uid, clientX, clientY) {
    const node = uid === hood?.center?.uid ? snapshot?.center : nodeByUid.get(uid);
    const boardNode = node?.style === "board";
    const api = boardNode ? diagramApi() : plexus();
    const allowed = boardNode ? settings?.boards !== false : Boolean(node && isDrawingLike(node));
    if (!node || !allowed || typeof api?.thumbnail !== "function") {
      if (hoverUid) clearHover();
      return;
    }
    if (hoverUid === uid) {
      placeHover(clientX, clientY);
      return;
    }
    const token = ++hoverToken;
    hoverUid = uid;
    hover.hidden = true;
    hover.replaceChildren();
    let pending;
    try {
      pending = api.thumbnail(uid, { maxWidth: HOVER_WIDTH });
    } catch (error) {
      console.error("[compass] hover", error);
      return;
    }
    Promise.resolve(pending).then((blob) => {
      if (token !== hoverToken) return;
      if (!blob) {
        hover.hidden = true;
        return;
      }
      if (hoverUrl) {
        try {
          globalThis.URL.revokeObjectURL(hoverUrl);
        } catch {
        }
      }
      hoverUrl = globalThis.URL.createObjectURL(blob);
      const img = el("img", "compass-hover-img");
      img.alt = "";
      img.src = hoverUrl;
      hover.replaceChildren(img);
      placeHover(clientX, clientY);
      hover.hidden = false;
    }).catch((error) => console.error("[compass] hover", error));
  }
  function plexusChanged() {
    if (plexusFramePending || lifecycle.disposed) return;
    plexusFramePending = true;
    frame(() => {
      plexusFramePending = false;
      dropAllThumbs();
      thumbRenderTried.clear();
      repullIfOpen();
    });
  }
  function subscribePlexus() {
    const api = plexus();
    if (plexusOff && plexusApi2 === api) return;
    if (plexusOff) plexusOff();
    if (!api || typeof api.addEventListener !== "function") return;
    api.addEventListener("change", plexusChanged);
    plexusApi2 = api;
    plexusOff = () => {
      try {
        api.removeEventListener?.("change", plexusChanged);
      } catch {
      }
      plexusOff = null;
      plexusApi2 = null;
    };
  }
  function onPlexusReady() {
    subscribePlexus();
    if (titleCache) titleCache = null;
    repullIfOpen();
  }
  function onPlexusUnload() {
    if (plexusOff) plexusOff();
    subscribePlexus();
    dropAllThumbs();
    thumbRenderTried.clear();
    for (const img of root.querySelectorAll(".compass-node-thumb")) img.remove();
    repullIfOpen();
  }
  function render({ navigate = false } = {}) {
    if (!hood) return;
    const custom = features.first("renderView", { hood, settings, navigate });
    if (custom) {
      customView = true;
      root.dataset.view = custom.view;
      for (const [uid, element] of nodeEls) {
        element.remove();
        dropThumb(uid);
      }
      nodeEls.clear();
      for (const element of chipEls.values()) element.remove();
      chipEls.clear();
      edgeLayer.replaceChildren();
      empty.hidden = true;
      for (const label of Object.values(zoneCounts)) label.hidden = true;
      urls.hidden = true;
      related.hidden = true;
      geometry = custom.geometry;
      updateButtons();
      if (navigate) fit(true);
      features.each("afterRender", { hood, geometry, boxes: /* @__PURE__ */ new Map(), nodeEls, view: custom.view });
      return;
    }
    if (customView) {
      customView = false;
      features.each("clearView");
    }
    root.dataset.view = "compass";
    const open = rowsFor(current);
    const rows = settings?.outline ? visibleRows(hood.outline, open) : [];
    geometry = layout(hood, features.pipe("layoutOptions", { rows }));
    const boxes = new Map(geometry.items.map((item) => [item.uid, item]));
    const keep = /* @__PURE__ */ new Set([hood.center.uid, ...boxes.keys()]);
    for (const [uid, element] of nodeEls) {
      if (keep.has(uid)) continue;
      element.remove();
      nodeEls.delete(uid);
      dropThumb(uid);
    }
    const entering = [];
    const place = (uid, box, isCenter, node) => {
      let element = nodeEls.get(uid);
      if (!element) {
        element = el("div");
        element.dataset.uid = uid;
        element.tabIndex = 0;
        element.setAttribute("role", "button");
        world.append(element);
        nodeEls.set(uid, element);
        const [dx, dy] = ENTER_FROM[box.zone] ?? [0, 0];
        element.style.opacity = "0";
        placeElement2(element, { ...box, x: box.x + dx, y: box.y + dy });
        entering.push(element);
      }
      element.className = nodeClass(node, isCenter);
      element.dataset.zone = isCenter ? "center" : box.zone;
      element.dataset.style = isCenter ? "center" : node.style;
      element.dataset.kind = isCenter ? hood.center.kind : node.kind;
      if (isCenter) {
        renderCenterContent(element, box);
        element.setAttribute("aria-label", `Center: ${hood.center.title}`);
        element.title = hood.center.title;
      } else {
        const visible = typeof node.alias === "string" && node.alias ? node.alias : node.title;
        element.replaceChildren(el("span", "compass-node-title", visible));
        if (isEmptyPage(node.kind, emptyCounts[node.uid])) {
          const start = button("compass-start", "Start writing");
          start.dataset.uid = node.uid;
          element.append(start);
        }
        const why = node.label ? ` — ${node.label}` : "";
        element.setAttribute("aria-label", `${node.title}, ${SIDE_NAME[box.zone]}${why}`);
        element.title = `${node.title}${why}`;
        attachThumb(element, node);
      }
      if (!entering.includes(element)) placeElement2(element, box);
      else element.dataset.target = JSON.stringify(box);
    };
    place(hood.center.uid, { ...geometry.center, zone: "center" }, true, null);
    for (const node of hood.nodes) {
      const box = boxes.get(node.uid);
      if (box) place(node.uid, box, false, node);
    }
    if (entering.length) {
      frame(() => {
        for (const element of entering) {
          if (!element.isConnected) continue;
          const box = JSON.parse(element.dataset.target ?? "null");
          delete element.dataset.target;
          element.style.opacity = "";
          if (box) placeElement2(element, box);
        }
      });
    }
    renderChips();
    renderEdges(boxes);
    drawLinkEdges(boxes);
    renderCross(boxes);
    const hidden = new Set(features.pipe("hiddenUids", hiddenUids(hood.nodes, lens), hood));
    for (const node of hood.nodes) {
      const element = nodeEls.get(node.uid);
      if (!element) continue;
      element.classList.toggle("compass-fade", hidden.has(node.uid));
      const empty2 = isEmptyPage(node.kind, emptyCounts[node.uid]);
      element.classList.toggle("compass-empty-page", empty2);
      if (empty2) element.title = "Empty page";
    }
    renderZoneCounts(hidden);
    renderUrls();
    renderRelated();
    empty.hidden = hood.nodes.length > 0;
    if (!empty.hidden) {
      empty.textContent = "Nothing is connected here yet. Write Name:: [[Page]] in this outline, or link a page, and it appears here.";
      empty.style.transform = `translate(-50%, ${geometry.center.h / 2 + 36}px)`;
    }
    updateButtons();
    if (navigate) fit(true);
    features.each("afterRender", { hood, geometry, boxes, nodeEls, view: "compass" });
  }
  function renderChips() {
    const keep = /* @__PURE__ */ new Set();
    for (const chip of geometry.chips) {
      keep.add(chip.zone);
      let element = chipEls.get(chip.zone);
      if (!element) {
        element = button("compass-chip");
        element.dataset.zone = chip.zone;
        world.append(element);
        chipEls.set(chip.zone, element);
      }
      const info = hood.overflow[chip.zone];
      element.textContent = info.shown < info.total ? `Show all ${info.total}` : "Show fewer";
      element.style.transform = `translate(${chip.x}px, ${chip.y}px) translate(-50%, -50%)`;
    }
    for (const [zone, element] of chipEls) {
      if (keep.has(zone)) continue;
      element.remove();
      chipEls.delete(zone);
    }
  }
  function anchorRow(uid) {
    if (!settings?.outline || !geometry.rows.length) return null;
    const visible = new Set(geometry.rows.map((row) => row.uid));
    let at = uid;
    while (at) {
      if (visible.has(at)) return at;
      at = hood.outlineIndex.get(at)?.parentUid ?? null;
    }
    return null;
  }
  function edgeFromCenter(box) {
    const c = geometry.center;
    if (box.zone === "north") {
      return curve(clamp3(box.x, -c.w / 2 + 16, c.w / 2 - 16), -c.h / 2, box.x, box.y + box.h / 2, true);
    }
    if (box.zone === "south") {
      return curve(clamp3(box.x, -c.w / 2 + 16, c.w / 2 - 16), c.h / 2, box.x, box.y - box.h / 2, true);
    }
    if (box.zone === "west") {
      return curve(-c.w / 2, clamp3(box.y, -c.h / 2 + 12, c.h / 2 - 12), box.x + box.w / 2, box.y, false);
    }
    return curve(c.w / 2, clamp3(box.y, -c.h / 2 + 12, c.h / 2 - 12), box.x - box.w / 2, box.y, false);
  }
  function edgeFromRow(row, box) {
    const c = geometry.center;
    const sign = box.zone === "west" || box.zone !== "east" && box.x < 0 ? -1 : 1;
    const sx = sign * (c.w / 2);
    if (box.zone === "north" || box.zone === "south") {
      const dir = box.zone === "north" ? -1 : 1;
      const side = sx + sign * 18;
      const end2 = [box.x, box.y - dir * (box.h / 2)];
      const c12 = [side, dir * (c.h / 2 + 20)];
      const c22 = [end2[0], end2[1] - dir * 30];
      return {
        d: `M${sx},${row.y} L${side},${row.y} C${c12[0]},${c12[1]} ${c22[0]},${c22[1]} ${end2[0]},${end2[1]}`,
        mid: [(side + 3 * c12[0] + 3 * c22[0] + end2[0]) / 8, (row.y + 3 * c12[1] + 3 * c22[1] + end2[1]) / 8]
      };
    }
    const end = [box.x - sign * (box.w / 2), box.y];
    const c1 = [sx + sign * 48, row.y];
    const c2 = [end[0] - sign * 48, end[1]];
    return {
      d: `M${sx},${row.y} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${end[0]},${end[1]}`,
      mid: [(sx + 3 * c1[0] + 3 * c2[0] + end[0]) / 8, (row.y + 3 * c1[1] + 3 * c2[1] + end[1]) / 8]
    };
  }
  function edgeToSibling(via, box) {
    const sx = via.x;
    const sy = via.y - via.h / 2;
    const ex = box.x - box.w / 2;
    const lift = Math.min(sy, box.y) - 36;
    return {
      d: `M${sx},${sy} C${sx},${lift} ${ex - 36},${lift} ${ex},${box.y}`,
      mid: [(sx + ex) / 2, lift]
    };
  }
  function drawCardLinks(boxes) {
    if (!openBoardUid) return;
    let kids = [];
    try {
      kids = readConnectionChildren(openBoardUid);
    } catch {
      kids = [];
    }
    const alias = /* @__PURE__ */ new Map();
    for (const node of hood?.nodes || []) {
      if (node.style !== "card") continue;
      alias.set(node.uid, node.uid);
      const target = embeddedTarget(node.uid);
      if (target) alias.set(target, node.uid);
      if (node.kind === "page" && node.title) alias.set(node.title, node.uid);
    }
    const endOf = (token) => boxes.get(token) || boxes.get(alias.get(token));
    for (const edge of connectionEdges(kids)) {
      const from = endOf(edge.from);
      const to = endOf(edge.to);
      if (!from || !to || from === to) continue;
      const shape = { d: `M${from.x},${from.y} L${to.x},${to.y}`, mid: [(from.x + to.x) / 2, (from.y + to.y) / 2] };
      const group = svg("g", "compass-edge");
      group.dataset.uid = edge.to;
      group.dataset.style = "card";
      const hit = svg("path", "compass-edge-hit");
      hit.setAttribute("d", shape.d);
      const line = svg("path", "compass-edge-line");
      line.setAttribute("d", shape.d);
      group.append(hit, line);
      if (edge.label) {
        const text = svg("text", "compass-edge-label");
        text.setAttribute("x", String(shape.mid[0]));
        text.setAttribute("y", String(shape.mid[1] - 4));
        text.textContent = edge.label.length > 48 ? `${edge.label.slice(0, 47)}…` : edge.label;
        group.append(text);
      }
      edgeLayer.append(group);
    }
  }
  function renderEdges(boxes) {
    edgeLayer.replaceChildren();
    const rowBoxes = new Map(geometry.rows.map((row) => [row.uid, row]));
    const draw = (node, shape, label) => {
      const group = svg("g", "compass-edge");
      group.dataset.uid = node.uid;
      group.dataset.style = node.style;
      const hit = svg("path", "compass-edge-hit");
      hit.setAttribute("d", shape.d);
      const line = svg("path", "compass-edge-line");
      line.setAttribute("d", shape.d);
      group.append(hit, line);
      if (label) {
        const text = svg("text", "compass-edge-label");
        text.setAttribute("x", String(shape.mid[0]));
        text.setAttribute("y", String(shape.mid[1] - 4));
        text.textContent = label.length > 48 ? `${label.slice(0, 47)}…` : label;
        group.append(text);
      }
      edgeLayer.append(group);
    };
    drawCardLinks(boxes);
    for (const node of hood.nodes) {
      const box = boxes.get(node.uid);
      if (!box) continue;
      if (node.zone === "siblings") {
        const via = node.via ? boxes.get(node.via) : null;
        if (via) draw(node, edgeToSibling(via, box), "");
        continue;
      }
      const anchors = /* @__PURE__ */ new Set();
      for (const item of node.evidence) {
        const row = item.sourceUid ? anchorRow(item.sourceUid) : null;
        if (row && (item.kind === "link" || item.kind === "typed" && item.direction === "out")) anchors.add(row);
        else anchors.add("");
      }
      let labeled = false;
      for (const anchor of anchors) {
        const shape = anchor ? edgeFromRow(rowBoxes.get(anchor), box) : edgeFromCenter(box);
        draw(node, shape, labeled ? "" : node.label);
        labeled = true;
      }
    }
  }
  function renderPins() {
    const pins = settings?.pins ?? [];
    pinRow.replaceChildren();
    for (const pin of pins) {
      const chip = el("span", "compass-pin-chip");
      const jump2 = button("compass-pin-jump", pin.title);
      jump2.dataset.uid = pin.uid;
      const remove = button("compass-pin-remove", "×", `Unpin ${pin.title}`);
      remove.dataset.uid = pin.uid;
      chip.append(jump2, remove);
      pinRow.append(chip);
    }
    features.each("afterPins", { pinRow, pins });
    pinRow.hidden = pinRow.childElementCount === 0;
  }
  async function savePins(pins) {
    await writeSetting(extensionAPI, SETTING_IDS.pins, pins);
    if (settings) settings.pins = pins;
    renderPins();
    updateButtons();
  }
  async function togglePin(uid = current) {
    if (!uid || !settings) return;
    const pins = settings.pins ?? [];
    if (pins.some((pin) => pin.uid === uid)) {
      await savePins(pins.filter((pin) => pin.uid !== uid));
      return;
    }
    await savePins([...pins, { uid, title: titleOf2(uid) || uid }]);
  }
  async function toggleOutline() {
    if (!settings) return;
    settings.outline = !settings.outline;
    await writeSetting(extensionAPI, SETTING_IDS.outline, settings.outline);
    render();
  }
  function hideFloating() {
    menu.hidden = true;
    menu.replaceChildren();
    details.hidden = true;
    details.replaceChildren();
    hideResults();
    hideZonePop();
  }
  function placeFloating(element, clientX, clientY) {
    const rect = root.getBoundingClientRect();
    element.hidden = false;
    const width = element.offsetWidth || 240;
    const height = element.offsetHeight || 160;
    element.style.left = `${clamp3(clientX - rect.left, 8, Math.max(8, rect.width - width - 8))}px`;
    element.style.top = `${clamp3(clientY - rect.top + 6, 8, Math.max(8, rect.height - height - 8))}px`;
  }
  function nodeKind(uid) {
    if (uid === hood?.center?.uid) return hood.center.kind;
    return nodeByUid.get(uid)?.kind ?? "page";
  }
  function plexusOpenKind(uid) {
    const entity = uid === hood?.center?.uid ? hood.center : nodeByUid.get(uid) ?? hood?.outline?.find((row) => row.uid === uid);
    return entity?.plexus !== void 0 ? entity.plexus : plexusKind(entity);
  }
  const { openSidebar, openMain } = createPlexusOpener({
    plexus: () => {
      const api = plexus();
      if (!api || typeof api.open !== "function") return api;
      return {
        apiVersion: api.apiVersion,
        open(...args) {
          compassNavUntil = Date.now() + 800;
          return api.open(...args);
        }
      };
    },
    close,
    host,
    plexusKindOf: plexusOpenKind,
    nodeKind
  });
  function menuItem(text, action) {
    const item = button("compass-menu-item", text);
    item.setAttribute("role", "menuitem");
    item.addEventListener("click", () => {
      hideFloating();
      guard(action)();
    });
    menu.append(item);
    return item;
  }
  function showMenu(uid, clientX, clientY) {
    hideFloating();
    const node = nodeByUid.get(uid);
    if (node?.kind === "group") {
      for (const extra of features.collect("nodeMenu", uid, node)) {
        if (extra?.title && typeof extra.run === "function") menuItem(extra.title, extra.run);
      }
      if (menu.childElementCount > 0) {
        placeFloating(menu, clientX, clientY);
        menu.querySelector("button")?.focus();
      }
      return;
    }
    const isCenter = uid === hood?.center?.uid;
    if (!isCenter) menuItem("Focus here", () => focusUid(uid));
    addShowOnBoard(uid);
    if (node?.style === "card" && openBoardUid && typeof diagramApi()?.open === "function") {
      menuItem("Open on board", () => {
        const api = diagramApi();
        const args = openArgs(openBoardUid, uid, false);
        compassNavUntil = Date.now() + 800;
        try {
          Promise.resolve(api.open(args.boardUid, { card: args.card, sidebar: args.sidebar })).catch((error) => console.error("[compass] board", error));
        } catch (error) {
          console.error("[compass] board", error);
        }
      });
    }
    menuItem("Open in sidebar", () => openSidebar(uid));
    menuItem("Open in main window", () => openMain(uid));
    const pinned = (settings?.pins ?? []).some((pin) => pin.uid === uid);
    if (nodeKind(uid) === "page" || isCenter) menuItem(pinned ? "Unpin" : "Pin", () => togglePin(uid));
    if (node && isEmptyPage(node.kind, emptyCounts[node.uid])) menuItem("Start writing", () => openMain(uid));
    if (node) menuItem("Why is this here?", () => showDetails(uid, clientX, clientY));
    if (node?.writable) {
      for (const side of ["north", "south", "west", "east"]) {
        if (side === node.zone) continue;
        const attribute = targetAttribute(node, side);
        if (attribute) menuItem(`Move to ${SIDE_NAME[side]} (${attribute}::)`, () => moveNode(node, side));
      }
    }
    for (const extra of features.collect("nodeMenu", uid, node)) {
      if (extra?.title && typeof extra.run === "function") menuItem(extra.title, extra.run);
    }
    placeFloating(menu, clientX, clientY);
    menu.querySelector("button")?.focus();
  }
  function boardsHolding(uid) {
    const api = diagramApi();
    if (!api || !uid) return [];
    try {
      const found = api.boardsWith(uid);
      return Array.isArray(found) ? found : [];
    } catch (error) {
      console.error("[compass] board", error);
      return [];
    }
  }
  function openShownBoard(board) {
    const api = diagramApi();
    if (!board?.uid || typeof api?.open !== "function") return;
    compassNavUntil = Date.now() + 800;
    try {
      Promise.resolve(api.open(board.uid, { card: board.card })).catch((error) => console.error("[compass] board", error));
    } catch (error) {
      console.error("[compass] board", error);
    }
  }
  function addShowOnBoard(uid) {
    const plan = showBoardPlan(boardsHolding(uid));
    if (plan.mode === "open") {
      menuItem("Show on board…", () => openShownBoard(plan.board));
      return;
    }
    if (plan.mode !== "picker") return;
    const opener = button("compass-menu-item", "Show on board…");
    opener.setAttribute("role", "menuitem");
    opener.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      menu.replaceChildren();
      for (const board of plan.boards) {
        const title = typeof board?.title === "string" && board.title ? board.title : "Untitled board";
        menuItem(title, () => openShownBoard(board));
      }
    });
    menu.append(opener);
  }
  function showDetails(uid, clientX, clientY) {
    hideFloating();
    const node = nodeByUid.get(uid);
    if (!node) return;
    details.append(el("p", "compass-details-title", node.title));
    details.append(el("p", "compass-details-side", `${SIDE_NAME[node.zone]}${node.writable ? " · drag to another side to rewrite" : ""}`));
    const list = el("ul", "compass-details-list");
    const seen = /* @__PURE__ */ new Set();
    for (const item of node.evidence) {
      const key = `${item.kind}:${item.attribute ?? ""}:${item.sourceUid ?? ""}:${item.note ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = el("li", "compass-details-item");
      entry.append(el("span", "", describe({ ...item, via: node.via }, titleOf2)));
      if (item.sourceUid) {
        const open = button("compass-details-open", "Open block");
        open.addEventListener("click", () => {
          void openSidebar(item.sourceUid, "block");
        });
        entry.append(open);
      }
      for (const action of features.collect("evidenceActions", { node, item })) {
        if (!action?.title || typeof action.run !== "function") continue;
        const extra = button("compass-details-open", action.title);
        extra.addEventListener("click", () => {
          hideFloating();
          guard(action.run)();
        });
        entry.append(extra);
      }
      list.append(entry);
    }
    details.append(list);
    const actions = el("div", "compass-details-actions");
    const focus = button("", "Focus here");
    focus.addEventListener("click", () => focusUid(uid));
    const side = button("", "Open in sidebar");
    side.addEventListener("click", () => {
      void openSidebar(uid);
    });
    actions.append(focus, side);
    details.append(actions);
    placeFloating(details, clientX, clientY);
  }
  function targetAttribute(node, side) {
    const edge = node?.writable;
    const role = DROP_ROLE[side];
    if (!edge || !role || !hood) return null;
    return attributeForRole(edge.direction === "out" ? role : inverseRole(role), hood.settings);
  }
  async function moveNode(node, side) {
    const edge = node.writable;
    const attribute = targetAttribute(node, side);
    if (!attribute) {
      setStatus(`No attribute is set for ${SIDE_NAME[side]}. Add one under Settings → Compass.`);
      return;
    }
    const value = edge.direction === "out" ? node.kind === "page" ? { uid: node.uid, title: node.title } : { uid: node.uid } : hood.center.kind === "page" ? { uid: hood.center.uid, title: hood.center.title } : { uid: hood.center.uid };
    node.zone = side;
    render();
    setStatus(`Writing ${attribute}::`, true);
    let result;
    try {
      result = await host.move({
        sourceUid: edge.sourceUid,
        fromAttribute: edge.attribute,
        toAttribute: attribute,
        value,
        expectedString: edge.sourceString
      });
    } catch (error) {
      console.error("[compass] write failed", error);
      result = { ok: false, reason: "failed" };
    }
    if (result?.ok) setStatus(`Moved to ${SIDE_NAME[side]} as ${attribute}::`);
    else setStatus(REASONS2[result?.reason] ?? "The write failed. Compass reloaded.");
    load();
  }
  function handleDrop(uid, side) {
    const node = nodeByUid.get(uid);
    if (!node || !side || side === node.zone) return;
    if (node.writable) {
      void moveNode(node, side);
      return;
    }
    const typed = node.evidence.filter((item) => item.kind === "typed");
    if (typed.length > 1) {
      setStatus("Several blocks make this edge. Pick one to edit.");
      const rect = stage.getBoundingClientRect();
      showDetails(uid, rect.left + rect.width / 2, rect.top + 60);
      return;
    }
    const source = node.evidence.find((item) => item.sourceUid)?.sourceUid;
    if (typed.length === 1) {
      setStatus("That attribute belongs to another plugin, so Compass opened its block instead.");
    } else if (source) {
      setStatus("Plain links are not rewritten. Compass opened the block that links them.");
    } else {
      setStatus("This edge comes from the page structure. There is no block to rewrite.");
      return;
    }
    if (source) void openSidebar(source, "block");
  }
  function hintText(side, node) {
    const attribute = node?.writable ? targetAttribute(node, side) : null;
    return attribute ? `${SIDE_NAME[side]} · ${attribute}::` : SIDE_NAME[side];
  }
  function startDrag(state2) {
    state2.dragging = true;
    root.classList.add("compass-dragging");
    const node = nodeByUid.get(state2.uid);
    for (const side of Object.keys(hints)) hints[side].textContent = hintText(side, node);
    ghost.textContent = node?.title ?? "";
    ghost.hidden = false;
    nodeEls.get(state2.uid)?.classList.add("compass-lifted");
  }
  function endDrag() {
    root.classList.remove("compass-dragging");
    ghost.hidden = true;
    for (const hint of Object.values(hints)) hint.classList.remove("compass-hint-hot");
    for (const element of nodeEls.values()) element.classList.remove("compass-lifted");
  }
  function onPointerDown(event) {
    if (root.hidden || event.button !== 0 || pointer) return;
    const target = event.target;
    if (!zonePopEl.hidden && !zonePopEl.contains(target) && !target.closest?.(".compass-zone-add")) hideZonePop();
    if (!menu.hidden && !menu.contains(target)) hideFloating();
    if (!details.hidden && !details.contains(target)) {
      details.hidden = true;
      details.replaceChildren();
    }
    if (target.closest?.(".compass-zone-add, .compass-start, .compass-zone-pop")) return;
    if (!stage.contains(target) || target.closest?.(".compass-chip, .compass-caret, .compass-row")) return;
    const element = target.closest?.(".compass-node");
    const directionalView = !root.dataset.view || root.dataset.view === "compass";
    if (directionalView && element && !element.classList.contains("compass-node-center")) {
      pointer = { type: "node", uid: element.dataset.uid, x: event.clientX, y: event.clientY, dragging: false };
      return;
    }
    if (element || target.closest?.(".compass-edge")) return;
    pointer = { type: "pan", x: event.clientX, y: event.clientY, panX, panY, dragging: false };
  }
  function onPointerMove(event) {
    if (!pointer) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!pointer.dragging && Math.hypot(dx, dy) < 5) return;
    if (pointer.type === "pan") {
      pointer.dragging = true;
      panX = pointer.panX + dx;
      panY = pointer.panY + dy;
      applyCamera(false);
      return;
    }
    if (!pointer.dragging) startDrag(pointer);
    const rect = root.getBoundingClientRect();
    ghost.style.left = `${event.clientX - rect.left + 10}px`;
    ghost.style.top = `${event.clientY - rect.top + 10}px`;
    const side = geometry ? sideAt(clientToWorld(event.clientX, event.clientY), geometry.center, geometry.flip === true) : null;
    for (const [name, hint] of Object.entries(hints)) hint.classList.toggle("compass-hint-hot", name === side);
  }
  function onPointerUp(event) {
    if (!pointer) return;
    const state2 = pointer;
    pointer = null;
    if (!state2.dragging) return;
    suppressClick = true;
    later(() => {
      suppressClick = false;
    }, 0);
    if (state2.type !== "node") return;
    endDrag();
    if (event.type === "pointercancel" || !geometry) return;
    handleDrop(state2.uid, sideAt(clientToWorld(event.clientX, event.clientY), geometry.center, geometry.flip === true));
  }
  function onWheel(event) {
    if (root.hidden) return;
    if (features.any("onWheel", event)) return;
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    const ox = event.clientX - rect.left - rect.width / 2;
    const oy = event.clientY - rect.top - rect.height / 2;
    const wx = (ox - panX) / zoom;
    const wy = (oy - panY) / zoom;
    const step2 = event.ctrlKey ? 1.04 : 1.12;
    zoom = clamp3(zoom * (event.deltaY < 0 ? step2 : 1 / step2), 0.25, 2.5);
    panX = ox - wx * zoom;
    panY = oy - wy * zoom;
    applyCamera(false);
  }
  function openPart(part) {
    const api = plexus();
    if (typeof api?.open !== "function" || !part) return;
    compassNavUntil = Date.now() + 800;
    const work = part.dataset.kind === "frame" ? api.open(current, { frame: part.dataset.id }) : api.open(part.dataset.uid);
    Promise.resolve(work).catch((error) => console.error("[compass] part", error));
  }
  function onStageClick(event) {
    if (suppressClick) return;
    if (features.any("onStageClick", event)) return;
    const target = event.target;
    const add = target.closest?.(".compass-zone-add");
    if (add) {
      event.preventDefault();
      openZonePop(add.dataset.zone, event.clientX, event.clientY);
      return;
    }
    const start = target.closest?.(".compass-start");
    if (start) {
      event.preventDefault();
      event.stopPropagation();
      void openMain(start.dataset.uid);
      return;
    }
    const part = target.closest?.(".compass-part");
    if (part) {
      event.preventDefault();
      event.stopPropagation();
      openPart(part);
      return;
    }
    const chip = target.closest?.(".compass-chip");
    if (chip) {
      const zones = expandedFor(current);
      if (zones.has(chip.dataset.zone)) zones.delete(chip.dataset.zone);
      else zones.add(chip.dataset.zone);
      rebuild();
      render();
      return;
    }
    if (target.closest?.(".compass-row-more")) {
      void openSidebar(current);
      return;
    }
    const caret = target.closest?.(".compass-caret");
    if (caret) {
      const open = rowsFor(current);
      if (open.has(caret.dataset.uid)) open.delete(caret.dataset.uid);
      else open.add(caret.dataset.uid);
      render();
      return;
    }
    const row = target.closest?.(".compass-row[data-uid]");
    const element = target.closest?.(".compass-node");
    const edge = target.closest?.(".compass-edge");
    if (edge) {
      showDetails(edge.dataset.uid, event.clientX, event.clientY);
      return;
    }
    if (!row && !element) {
      hideFloating();
      return;
    }
    const uid = row ? row.dataset.uid : element.dataset.uid;
    if (!row && element.classList.contains("compass-node-center")) return;
    if (!row && nodeByUid.get(uid)?.style === "board") {
      openBoardUid = uid;
      rebuild();
      render();
      return;
    }
    if (event.shiftKey) {
      void openSidebar(uid, row ? "block" : nodeKind(uid));
      return;
    }
    clickTimer = cancel(clickTimer);
    clickTimer = later(() => {
      clickTimer = null;
      focusUid(uid);
    }, CLICK_DELAY);
  }
  function onStageDoubleClick(event) {
    clickTimer = cancel(clickTimer);
    if (features.any("onStageDoubleClick", event)) return;
    const target = event.target;
    if (target.closest?.(".compass-part, .compass-caret, .compass-chip, .compass-start, .compass-zone-add")) return;
    const row = target.closest?.(".compass-row[data-uid]");
    const element = target.closest?.(".compass-node");
    if (!row && !element) return;
    event.preventDefault();
    if (row) void openSidebar(row.dataset.uid, "block");
    else void openSidebar(element.dataset.uid);
  }
  function onContextMenu(event) {
    if (event.target.closest?.(".compass-part")) {
      event.preventDefault();
      return;
    }
    const element = event.target.closest?.(".compass-node, .compass-edge, .compass-row[data-uid]");
    if (!element) {
      if (!stage.contains(event.target)) return;
      event.preventDefault();
      hideFloating();
      let added = 0;
      for (const item of features.collect("stageMenu", event)) {
        if (!item?.title || typeof item.run !== "function") continue;
        menuItem(item.title, item.run);
        added += 1;
      }
      if (added > 0) {
        placeFloating(menu, event.clientX, event.clientY);
        menu.querySelector("button")?.focus();
      }
      return;
    }
    event.preventDefault();
    if (element.classList.contains("compass-row")) {
      hideFloating();
      menuItem("Focus here", () => focusUid(element.dataset.uid));
      menuItem("Open in sidebar", () => openSidebar(element.dataset.uid, "block"));
      placeFloating(menu, event.clientX, event.clientY);
      return;
    }
    if (element.classList.contains("compass-edge")) showDetails(element.dataset.uid, event.clientX, event.clientY);
    else showMenu(element.dataset.uid, event.clientX, event.clientY);
  }
  function hideResults() {
    results.hidden = true;
    results.replaceChildren();
    activeResult = 0;
  }
  function cachedRecents() {
    if (recentCache) return recentCache;
    try {
      recentCache = host.recents();
    } catch (error) {
      console.error("[compass] recents", error);
      recentCache = { pages: [], drawings: [] };
    }
    if (!recentCache || typeof recentCache !== "object") recentCache = { pages: [], drawings: [] };
    return recentCache;
  }
  function todayPage(pages) {
    const scope = globalThis.window ?? globalThis;
    const dateToPageUid = (scope.roamAlphaAPI ?? globalThis.roamAlphaAPI)?.util?.dateToPageUid;
    if (typeof dateToPageUid !== "function") return null;
    let uid;
    try {
      uid = dateToPageUid(/* @__PURE__ */ new Date());
    } catch (error) {
      console.error("[compass] today", error);
      return null;
    }
    if (typeof uid !== "string") return null;
    const match = (pages ?? []).find((row) => row?.uid === uid);
    const title = typeof match?.title === "string" && match.title ? match.title : uid;
    return { uid, title };
  }
  function showEmptyQuery() {
    const cache = cachedRecents();
    const rows = emptyQueryRows({
      pins: settings?.pins ?? [],
      today: todayPage(cache.pages),
      pages: cache.pages,
      drawings: cache.drawings,
      limit: 8
    });
    if (!rows.length) {
      hideResults();
      return;
    }
    results.replaceChildren();
    activeResult = 0;
    for (const [index, row] of rows.entries()) {
      const item = button(`compass-result${index === 0 ? " compass-result-active" : ""}`, row.title);
      item.dataset.uid = row.uid;
      item.setAttribute("role", "option");
      results.append(item);
    }
    results.hidden = false;
  }
  function markResult() {
    const items = [...results.querySelectorAll(".compass-result")];
    items.forEach((item, index) => item.classList.toggle("compass-result-active", index === activeResult));
    items[activeResult]?.scrollIntoView?.({ block: "nearest" });
  }
  function runSearch() {
    const text = searchInput.value.trim();
    if (!text) {
      showEmptyQuery();
      return;
    }
    if (!titleCache) titleCache = host.titles();
    const found = rankTitles(titleCache, text, 20);
    results.replaceChildren();
    activeResult = 0;
    const canDraw = Boolean(settings?.drawings ?? readSettings()?.drawings) && Boolean(plexus());
    if (!found.length) activeResult = -1;
    if (!found.length && !canDraw) results.append(el("div", "compass-result-none", "No page by that name"));
    for (const [index, row] of found.entries()) {
      const item = button(`compass-result${index === 0 ? " compass-result-active" : ""}`, row.title);
      item.dataset.uid = row.uid;
      item.setAttribute("role", "option");
      results.append(item);
    }
    if (canDraw) {
      const item = button("compass-result compass-result-drawing", `New drawing: ${text}`);
      item.dataset.newDrawing = text;
      item.setAttribute("role", "option");
      results.append(item);
    }
    results.hidden = false;
  }
  function chooseResult(uid) {
    if (!uid) return;
    hideResults();
    searchInput.value = "";
    stage.focus({ preventScroll: true });
    focusUid(uid);
  }
  async function newDrawing(title) {
    const api = plexus();
    if (!api || !title) return;
    hideResults();
    searchInput.value = "";
    stage.focus({ preventScroll: true });
    try {
      const made = await api.create({ title });
      titleCache = null;
      if (made?.pageUid && !lifecycle.disposed) focusUid(made.pageUid);
    } catch (error) {
      console.error("[compass] new drawing", error);
      setStatus("Plexus could not create the drawing.");
    }
  }
  function chooseItem(item) {
    if (item?.dataset.newDrawing) void newDrawing(searchInput.value.trim() || item.dataset.newDrawing);
    else chooseResult(item?.dataset.uid);
  }
  function onSearchKey(event) {
    const items = [...results.querySelectorAll(".compass-result")];
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!items.length) return;
      activeResult = clamp3(activeResult + (event.key === "ArrowDown" ? 1 : -1), 0, items.length - 1);
      markResult();
    } else if (event.key === "Enter") {
      event.preventDefault();
      chooseItem(items[activeResult]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!results.hidden) hideResults();
      else stage.focus({ preventScroll: true });
    }
  }
  function firstIn(zone) {
    return hood?.nodes.find((node) => node.zone === zone)?.uid ?? null;
  }
  function onKey(event) {
    if (root.hidden) return;
    if ((event.key === "Control" || event.key === "Meta") && hoverNode?.dataset?.uid) {
      showHover(hoverNode.dataset.uid, hoverX, hoverY);
    }
    if (!root.contains(event.target) && event.target !== document.body) return;
    const typing = isTypingTarget(event.target);
    if (event.key === "Escape") {
      if (!menu.hidden || !details.hidden || !results.hidden || !zonePopEl.hidden) hideFloating();
      else if (features.any("onEscape", event)) {
      } else close();
      event.preventDefault();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }
    if (typing) return;
    if (features.any("onKey", event)) {
      event.preventDefault();
      return;
    }
    if (event.altKey && event.key === "ArrowLeft") {
      event.preventDefault();
      goBack();
      return;
    }
    if (event.altKey && event.key === "ArrowRight") {
      event.preventDefault();
      goForward();
      return;
    }
    const element = event.target.closest?.(".compass-node");
    if (element && element.dataset.kind !== "group" && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      if (event.shiftKey) void openSidebar(element.dataset.uid);
      else if (!element.classList.contains("compass-node-center")) focusUid(element.dataset.uid);
      return;
    }
    if (element && (event.key === "ContextMenu" || event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      showMenu(element.dataset.uid, rect.left + 8, rect.bottom);
      return;
    }
    const arrows = { ArrowUp: "north", ArrowDown: "south", ArrowLeft: "west", ArrowRight: "east" };
    if (arrows[event.key] && !event.altKey && (event.target === stage || element?.classList.contains("compass-node-center"))) {
      const uid = firstIn(arrows[event.key]);
      if (uid) {
        event.preventDefault();
        nodeEls.get(uid)?.focus({ preventScroll: true });
      }
    }
  }
  function onKeyUp(event) {
    if (event.key !== "Control" && event.key !== "Meta") return;
    clearHover();
  }
  const dom = Object.freeze({
    root,
    bar,
    stage,
    world,
    edgeLayer,
    pinRow,
    menu,
    details,
    status,
    searchInput
  });
  const state = Object.freeze({
    get current() {
      return current;
    },
    get hood() {
      return hood;
    },
    get geometry() {
      return geometry;
    },
    get settings() {
      return settings;
    },
    get snapshot() {
      return snapshot;
    },
    get zoom() {
      return zoom;
    },
    get panX() {
      return panX;
    },
    get panY() {
      return panY;
    },
    get isOpen() {
      return !root.hidden;
    },
    get lens() {
      return { ...lens };
    },
    nodeEls,
    back,
    forward
  });
  const ctx = Object.freeze({
    extensionAPI,
    lifecycle,
    host,
    features,
    dom,
    el,
    button,
    svg,
    guard,
    clamp: clamp3,
    curve,
    later,
    cancel,
    frame,
    state,
    titleOf: titleOf2,
    nodeKind,
    focusUid,
    goBack,
    goForward,
    load,
    rebuild,
    render,
    fit,
    close,
    setStatus,
    placeFloating,
    hideFloating,
    menuItem,
    showMenu,
    showDetails,
    openZonePop,
    openSidebar,
    openMain,
    togglePin,
    savePins,
    clientToWorld,
    setCamera,
    setGeometry,
    setLens,
    saveSetting,
    addBarButton,
    commands,
    facts
  });
  for (const create of FEATURES) features.add(create(ctx));
  lifecycle.node(root, document.body);
  lifecycle.event(closeButton, "click", () => close());
  lifecycle.event(backButton, "click", () => goBack());
  lifecycle.event(forwardButton, "click", () => goForward());
  lifecycle.event(pinButton, "click", guard(() => togglePin()));
  lifecycle.event(outlineButton, "click", guard(() => toggleOutline()));
  lifecycle.event(crossButton, "click", guard(async () => {
    if (!settings) settings = readSettings();
    if (!settings) return;
    const next = settings.crossLinks !== true;
    settings.crossLinks = next;
    crossButton.setAttribute("aria-pressed", next ? "true" : "false");
    await writeSetting(extensionAPI, SETTING_IDS.crossLinks, next);
    render();
  }));
  lifecycle.event(linksButton, "click", () => {
    linksMode = !linksMode;
    linksButton.setAttribute("aria-pressed", linksMode ? "true" : "false");
  });
  lifecycle.event(sendButton, "click", guard(() => sendToDrawing()));
  lifecycle.event(zoneInput, "input", () => paintZoneResults(zoneInput.value));
  lifecycle.event(zoneInput, "keydown", (event) => {
    if (event.key === "Enter" && !zoneCreate.disabled) {
      event.preventDefault();
      void createDrawingHere();
    }
  });
  lifecycle.event(zoneResults, "click", (event) => {
    const item = event.target.closest?.(".compass-result");
    if (!item) return;
    const zone = zoneTarget;
    const title = item.dataset.title || item.textContent;
    hideZonePop();
    void writeZone(zone, title);
  });
  lifecycle.event(zoneCreate, "click", () => {
    void createDrawingHere();
  });
  lifecycle.event(fitButton, "click", () => fit(true));
  lifecycle.event(refreshButton, "click", () => load());
  lifecycle.event(linkedButton, "click", guard(() => {
    if (current) void host.openInMain(current);
  }));
  lifecycle.event(related, "click", (event) => {
    const item = event.target.closest?.(".compass-related-item");
    if (!item?.dataset.uid) return;
    event.preventDefault();
    event.stopPropagation();
    const uid = item.dataset.uid;
    const api = plexus();
    if (typeof api?.open === "function") {
      compassNavUntil = Date.now() + 800;
      Promise.resolve(api.open(uid)).catch((error) => console.error("[compass] related open", error));
      return;
    }
    void host.openInMain(uid);
  });
  lifecycle.event(stage, "pointerover", (event) => {
    const node = event.target.closest?.(".compass-node");
    if (!node?.dataset.uid) return;
    markHover(root, node);
    hoverNode = node;
    hoverX = event.clientX;
    hoverY = event.clientY;
    if (event.ctrlKey || event.metaKey) showHover(node.dataset.uid, event.clientX, event.clientY);
    else clearHover();
    markCross(node.dataset.uid);
  });
  lifecycle.event(stage, "pointerout", (event) => {
    if (event.relatedTarget?.closest?.(".compass-node")) return;
    clearHover();
    markHover(root, null);
    markCross(null);
    hoverNode = null;
  });
  lifecycle.event(globalThis, "hashchange", () => {
    void onHashChange();
  });
  lifecycle.event(pinRow, "click", (event) => {
    const remove = event.target.closest?.(".compass-pin-remove");
    if (remove) {
      void savePins((settings?.pins ?? []).filter((pin) => pin.uid !== remove.dataset.uid)).catch((error) => console.error("[compass]", error));
      return;
    }
    const jump2 = event.target.closest?.(".compass-pin-jump");
    if (jump2) focusUid(jump2.dataset.uid);
  });
  lifecycle.event(searchInput, "focus", () => {
    if (!searchInput.value.trim()) showEmptyQuery();
  });
  lifecycle.event(searchInput, "input", () => {
    searchTimer = cancel(searchTimer);
    searchTimer = later(() => {
      searchTimer = null;
      runSearch();
    }, 60);
  });
  lifecycle.event(searchInput, "keydown", onSearchKey);
  lifecycle.event(results, "mousedown", (event) => event.preventDefault());
  lifecycle.event(results, "click", (event) => chooseItem(event.target.closest?.(".compass-result")));
  lifecycle.event(stage, "click", onStageClick);
  lifecycle.event(stage, "dblclick", onStageDoubleClick);
  lifecycle.event(stage, "contextmenu", onContextMenu);
  lifecycle.event(stage, "wheel", onWheel, { passive: false });
  lifecycle.event(root, "pointerdown", onPointerDown);
  lifecycle.event(globalThis, "pointermove", onPointerMove);
  lifecycle.event(globalThis, "pointerup", onPointerUp);
  lifecycle.event(globalThis, "pointercancel", onPointerUp);
  lifecycle.event(globalThis, "resize", () => {
    if (!root.hidden) placeFrame();
  });
  lifecycle.event(document, "keydown", onKey);
  lifecycle.event(document, "keyup", onKeyUp);
  lifecycle.event(globalThis, "roam-plexus:ready", onPlexusReady);
  lifecycle.event(globalThis, "roam-plexus:unload", onPlexusUnload);
  subscribePlexus();
  lifecycle.add(() => {
    if (plexusOff) plexusOff();
    dropAllThumbs();
    revokePartUrls();
    clearHover();
    for (const id of timers) globalThis.clearTimeout(id);
    timers.clear();
    root.hidden = true;
  });
  applyCamera(false);
  updateButtons();
  const view = { repullIfOpen, toggle, focusPage, focusBlock, focusUid, isOpen, hideResults };
  return { ...view, ctx, features, installCommands: () => registerCommands({ extensionAPI, lifecycle, host, view }) };
}

// src/extension.js
var VERSION_FLAG = "__ROAM_COMPASS_VERSION";
var activeLifecycle = null;
function versionHost() {
  return globalThis.window ?? globalThis;
}
function stampVersion(version) {
  versionHost()[VERSION_FLAG] = version;
}
function installRoamCompass(win, overlay) {
  const api = Object.freeze({
    apiVersion: 1,
    isAvailable() {
      return true;
    },
    focus(uid) {
      if (typeof overlay?.focusUid === "function") overlay.focusUid(uid);
    },
    open(uid, options) {
      const sidecar = options?.sidecar === true;
      if (typeof overlay?.focusUid === "function") overlay.focusUid(uid, sidecar ? { sidecar: true } : void 0);
      if (typeof overlay?.hideResults === "function") overlay.hideResults();
    },
    focusBlock(uid) {
      if (typeof overlay?.focusUid === "function") overlay.focusUid(uid);
    },
    isOpen() {
      return typeof overlay?.isOpen === "function" ? overlay.isOpen() === true : false;
    }
  });
  win.RoamCompass = api;
  const emit = (type) => {
    try {
      const EventType = win.CustomEvent;
      if (typeof EventType === "function" && typeof win.dispatchEvent === "function") {
        win.dispatchEvent(new EventType(type));
      }
    } catch (error) {
      console.warn("[compass] event failed", error);
    }
  };
  emit("roam-compass:ready");
  return () => {
    if (win.RoamCompass === api) {
      try {
        delete win.RoamCompass;
      } catch {
        win.RoamCompass = void 0;
      }
    }
    emit("roam-compass:unload");
  };
}
function clearVersion() {
  const host = versionHost();
  try {
    delete host[VERSION_FLAG];
  } catch {
    host[VERSION_FLAG] = void 0;
  }
}
async function onload({ extensionAPI, extension }) {
  if (!extensionAPI) throw new TypeError("Roam did not provide extensionAPI");
  if (activeLifecycle) await activeLifecycle.dispose();
  const lifecycle = createLifecycle();
  activeLifecycle = lifecycle;
  const version = extension?.version || "development";
  try {
    stampVersion(version);
    const host = createHost({ lifecycle });
    const overlay = mountOverlay({ extensionAPI, lifecycle, host });
    lifecycle.add(installRoamCompass(versionHost(), overlay));
    await initializeSettings(extensionAPI);
    await lifecycle.settingsPanel(extensionAPI, createSettingsPanel({
      extensionAPI,
      onChange: () => overlay.repullIfOpen()
    }));
    await overlay.installCommands();
    console.info(`[compass] Loaded v${version}`);
  } catch (error) {
    if (activeLifecycle === lifecycle) {
      activeLifecycle = null;
      clearVersion();
    }
    await lifecycle.dispose().catch((cleanupError) => console.error("[compass]", cleanupError));
    throw error;
  }
  return async () => {
    if (activeLifecycle === lifecycle) {
      activeLifecycle = null;
      clearVersion();
    }
    await lifecycle.dispose();
  };
}
async function onunload() {
  const lifecycle = activeLifecycle;
  activeLifecycle = null;
  clearVersion();
  if (lifecycle) await lifecycle.dispose();
  console.info("[compass] Unloaded");
}
var extension_default = { onload, onunload };
export {
  extension_default as default,
  onload,
  onunload
};
