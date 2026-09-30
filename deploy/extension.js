/* Compass v0.5.0 | MIT | generated; edit src/ */

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
var ROLES = ["parent", "child", "friend", "challenger", "previous", "next"];
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
var INVERSE = Object.freeze({
  parent: "child",
  child: "parent",
  friend: "friend",
  challenger: "challenger",
  previous: "next",
  next: "previous"
});
var READ_ONLY = [/^BT_attr/i, /^aliases$/i, /^roam\//i];
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
function modelSettings(raw = {}) {
  const lists = {};
  for (const role of ROLES) lists[role] = splitNames(raw[role] ?? MODEL_DEFAULTS[role]);
  return {
    lists,
    hidden: splitNames(raw.hidden ?? MODEL_DEFAULTS.hidden),
    links: flag(raw.links, true),
    siblings: flag(raw.siblings, true),
    badges: flag(raw.badges, true),
    maxPerZone: count(raw.maxPerZone, 12)
  };
}
function sameName(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}
function roleOf(attribute, settings) {
  const name = String(attribute ?? "").trim();
  if (!name) return null;
  if (settings.hidden.some((item) => sameName(item, name))) return null;
  for (const role of ROLES) {
    if (settings.lists[role].some((item) => sameName(item, name))) return { role, explicit: true };
  }
  return { role: "child", explicit: false };
}
function inverseRole(role) {
  return INVERSE[role] ?? role;
}
function isReadOnlyAttribute(name) {
  return READ_ONLY.some((pattern) => pattern.test(String(name ?? "")));
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
function walk(blocks, visit, depth = 0, parentUid = null) {
  for (const block of blocks ?? []) {
    if (!block?.uid) continue;
    visit(block, depth, parentUid);
    walk(block.children, visit, depth + 1, block.uid);
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
function compareNodes(a, b) {
  if (a.strength !== b.strength) return b.strength - a.strength;
  const at = a.title.toLowerCase();
  const bt = b.title.toLowerCase();
  if (at !== bt) return at < bt ? -1 : 1;
  return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
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
      role: picked.role,
      zone: ZONE_OF[picked.role],
      strength: picked.strength,
      style: picked.strongest[0].kind,
      evidence: items,
      label: [...new Set(typed.map((item) => [item.attribute, ...item.labels].join(" · ")))].join(" | "),
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
    const members = nodes.filter((node) => node.zone === zone).sort(compareNodes);
    const limit = expanded.has(zone) ? Math.max(settings.maxPerZone, 200) : settings.maxPerZone;
    kept.push(...members.slice(0, limit));
    if (members.length > settings.maxPerZone) {
      overflow[zone] = { shown: Math.min(limit, members.length), total: members.length };
    }
  }
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
function refused(reason) {
  return { ops: [], reason };
}
function safe(ops) {
  for (const op of ops) {
    if (FORBIDDEN.some((token) => String(op.string ?? "").includes(token))) {
      return refused("forbidden");
    }
  }
  return { ops, reason: null };
}
function refsIn(string) {
  const shape = tailShape(string);
  return shape.kind === "refs" ? shape.values : [];
}
function planMove({ source, fromAttribute, toAttribute, value, newUid }) {
  if (!source?.uid || typeof source.string !== "string") return refused("missing");
  const name = String(toAttribute ?? "").trim();
  if (!name || name.includes("::") || /[[\]\n]/.test(name)) return refused("no-attribute");
  const parsed = parseAttribute(source.string);
  if (!parsed || !same(parsed.name, fromAttribute)) return refused("changed");
  if (isReadOnlyAttribute(parsed.name) || isReadOnlyAttribute(name)) return refused("read-only");
  if (same(parsed.name, name)) return refused("same");
  const renamed = `${name}::${parsed.tail}`;
  const after = { parentUid: source.parentUid, order: Number.isFinite(source.order) ? source.order + 1 : "last" };
  const shape = tailShape(parsed.tail);
  if (shape.kind === "refs") {
    const token2 = shape.values.find((item) => tokenMatches(item, value));
    if (!token2) return refused("missing-value");
    if (shape.values.length === 1) return safe([{ op: "update", uid: source.uid, string: renamed }]);
    if (!after.parentUid) return refused("no-parent");
    const offset = parsed.prefix.length;
    const shifted = { ...token2, start: token2.start + offset, end: token2.end + offset };
    return safe([
      { op: "update", uid: source.uid, string: removeToken(source.string, shifted) },
      { op: "create", parentUid: after.parentUid, order: after.order, uid: newUid, string: `${name}:: ${refMarkup(value)}` }
    ]);
  }
  if (shape.kind !== "bare") return refused("text-value");
  const children = [...source.children ?? []].filter((child) => child?.uid).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const values = children.filter((child) => !parseAttribute(child.string));
  const holder = values.find((child) => child.uid === value?.uid || refsIn(child.string).some((item) => tokenMatches(item, value)));
  if (!holder) return refused("missing-value");
  if (values.length === 1) return safe([{ op: "update", uid: source.uid, string: renamed }]);
  if (!after.parentUid) return refused("no-parent");
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
var LABELS = "{:harc/_e [{:harc/a [:node/title]} {:harc/v [:block/uid :node/title :block/string :harc/v-string]}]}";
var SOURCE = "[:block/uid :block/string :block/order {:block/_children [:block/uid]} {:block/children [:block/uid :block/string :block/order]}]";
var CENTER_PULL = `[:block/uid :node/title :block/string :block/order
 {:block/refs [:block/uid :node/title :block/string]}
 {:block/page [:block/uid :node/title]}
 {:block/_children [:block/uid :node/title :block/string {:block/children [:block/uid :block/string :block/order]}]}
 {:harc/_e [:block/uid
   {:harc/a [:node/title]}
   {:harc/v [:block/uid :node/title :block/string :harc/v-string]}
   {:harc/a-source ${SOURCE}}
   ${LABELS}]}
 {:harc/_v [:block/uid
   {:harc/e [:block/uid :node/title :block/string]}
   {:harc/a [:node/title]}
   {:harc/a-source ${SOURCE}}
   {:harc/v-source [:block/uid]}
   ${LABELS}]}
 {:block/_refs [:block/uid :block/string
   {:block/page [:block/uid :node/title]}
   {:block/refs [:block/uid :node/title :block/string]}]}]`;
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
var PREFIX_QUERY = `[:find ?uid ?title
 :in $ ?prefix
 :where
  [?page :node/title ?title]
  [(clojure.string/starts-with? ?title ?prefix)]
  [?page :block/uid ?uid]]`;
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
function entityOf(node) {
  const uid = node?.[":block/uid"];
  if (typeof uid !== "string" || !uid) return null;
  if (typeof node[":node/title"] === "string") return { uid, title: node[":node/title"] };
  if (typeof node[":block/string"] === "string") {
    const entity = { uid, string: node[":block/string"] };
    if (Number.isFinite(node[":block/order"])) entity.order = node[":block/order"];
    return entity;
  }
  if (node[":harc/v-string"] != null) return { uid, text: String(node[":harc/v-string"]) };
  return { uid };
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
  const pages = [];
  for (const [uid, title] of rows) {
    if (typeof uid !== "string" || typeof title !== "string") continue;
    const rest = title.slice(prefix.length);
    if (!rest || rest.includes("/")) continue;
    pages.push({ uid, title });
  }
  pages.sort((a, b) => a.title < b.title ? -1 : a.title > b.title ? 1 : 0);
  return pages.slice(0, NAMESPACE_CAP);
}
function pageByTitle(data, title) {
  try {
    const found = data.pull("[:block/uid :node/title]", `[:node/title "${title.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`);
    return entityOf(found);
  } catch {
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
    const found = entityOf(pull(data, "[:block/uid :node/title]", dayUid));
    return found?.title ? found : null;
  };
  return { previous: page(around.previous), next: page(around.next) };
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
    const entity = entityString(uid);
    const callback = () => onChange();
    for (const pattern of WATCHES) {
      try {
        api.addPullWatch(pattern, entity, callback);
        watches.push({ pattern, entity, callback });
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
    openPageUid,
    mainUid,
    focusedBlock,
    openInSidebar,
    openInMain,
    syncSidecar,
    releaseSidecar,
    closeSidecar,
    move,
    drawingRows,
    blockContextMenu() {
      return roamApi()?.ui?.blockContextMenu ?? null;
    }
  };
}

// src/model/layout.js
var NODE = Object.freeze({ w: 180, h: 34 });
var SIBLING = Object.freeze({ w: 148, h: 28 });
var ROW_H = 24;
var COL_GAP = 14;
var ROW_GAP = 12;
var V_GAP = 64;
var H_GAP = 72;
var CHIP_GAP = 22;
var HEADER_H = 56;
var BADGE_H = 24;
var MAX_ROWS = 40;
function gridWidth(count2, columns, width) {
  const used = Math.min(count2, columns);
  return used ? used * width + (used - 1) * COL_GAP : 0;
}
function grid(nodes, columns, direction, edge) {
  const rows = Math.ceil(nodes.length / columns);
  return nodes.map((node, index) => {
    const row = Math.floor(index / columns);
    const column2 = index % columns;
    const inRow = row === rows - 1 ? nodes.length - row * columns : columns;
    const width = gridWidth(inRow, columns, NODE.w);
    return {
      uid: node.uid,
      zone: node.zone,
      x: -width / 2 + column2 * (NODE.w + COL_GAP) + NODE.w / 2,
      y: direction * (edge + NODE.h / 2 + row * (NODE.h + ROW_GAP)),
      w: NODE.w,
      h: NODE.h
    };
  });
}
function column(nodes, x, top, size, gap) {
  return nodes.map((node, index) => ({
    uid: node.uid,
    zone: node.zone,
    x,
    y: top + size.h / 2 + index * (size.h + gap),
    w: size.w,
    h: size.h
  }));
}
function columnHeight(count2, size, gap) {
  return count2 ? count2 * size.h + (count2 - 1) * gap : 0;
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
  const zone = (name) => nodes.filter((node) => node.zone === name);
  const north = zone("north");
  const south = zone("south");
  const west = zone("west");
  const east = zone("east");
  const siblings = zone("siblings");
  const northColumns = 3;
  const southColumns = 4;
  const items = [
    ...grid(north, northColumns, -1, ch / 2 + V_GAP),
    ...grid(south, southColumns, 1, ch / 2 + V_GAP)
  ];
  const wideHalf = Math.max(
    cw / 2,
    gridWidth(north.length, northColumns, NODE.w) / 2,
    gridWidth(south.length, southColumns, NODE.w) / 2
  );
  const lateralX = (count2) => {
    const half = columnHeight(count2, NODE, ROW_GAP) / 2;
    const clear = half <= ch / 2 + V_GAP - ROW_GAP;
    return (clear ? cw / 2 : wideHalf) + H_GAP + NODE.w / 2;
  };
  const westX = -lateralX(west.length);
  const eastX = lateralX(east.length);
  items.push(...column(west, westX, -columnHeight(west.length, NODE, ROW_GAP) / 2, NODE, ROW_GAP));
  items.push(...column(east, eastX, -columnHeight(east.length, NODE, ROW_GAP) / 2, NODE, ROW_GAP));
  const eastOuter = east.length ? eastX + NODE.w / 2 : 0;
  const siblingX = Math.max(eastOuter, wideHalf) + H_GAP * 0.75 + SIBLING.w / 2;
  const siblingTop = -(ch / 2 + V_GAP + NODE.h);
  items.push(...column(siblings, siblingX, siblingTop, SIBLING, 8));
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
  return {
    center: { x: 0, y: 0, w: cw, h: ch },
    items,
    rows,
    more,
    chips,
    bounds: { minX, minY, maxX, maxY }
  };
}
function sideAt(point, center) {
  const halfW = center.w / 2;
  const halfH = center.h / 2;
  if (Math.abs(point.x) <= halfW && Math.abs(point.y) <= halfH) return null;
  const nx = point.x / (halfW + H_GAP);
  const ny = point.y / (halfH + V_GAP);
  if (Math.abs(ny) >= Math.abs(nx)) return ny < 0 ? "north" : "south";
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
  follow: "compass-follow",
  relatedDrawings: "compass-related-drawings"
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
  "compass-follow": false,
  "compass-related-drawings": true
});
var SWITCHES = /* @__PURE__ */ new Set([
  SETTING_IDS.links,
  SETTING_IDS.siblings,
  SETTING_IDS.badges,
  SETTING_IDS.sidecar,
  SETTING_IDS.outline,
  SETTING_IDS.drawings,
  SETTING_IDS.follow,
  SETTING_IDS.relatedDrawings
]);
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
  [SETTING_IDS.follow, "Follow main window", "Recentre when the main window opens another page or block. Off skips that. A pin, typing, or a Compass navigation also skips it."],
  [SETTING_IDS.relatedDrawings, "Related drawings", "When Plexus exposes linksOf, list drawings that share block or link refs with the centre."],
  [SETTING_IDS.maxZone, "Nodes per side", "How many nodes a side shows before it offers Show all."],
  [SETTING_IDS.pins, "Pins", "JSON list of {uid, title}. Use the Pin button instead of editing this."]
];
function flag2(value, fallback) {
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
      maxPerZone: read(SETTING_IDS.maxZone)
    },
    sidecar: flag2(read(SETTING_IDS.sidecar), true),
    outline: flag2(read(SETTING_IDS.outline), false),
    drawings: flag2(read(SETTING_IDS.drawings), true),
    follow: flag2(read(SETTING_IDS.follow), false),
    relatedDrawings: flag2(read(SETTING_IDS.relatedDrawings), true),
    pins: readPins(read(SETTING_IDS.pins))
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
      action: SWITCHES.has(id) ? { type: "switch", onChange: (event) => persist(id, Boolean(event?.target?.checked)) } : { type: "input", onChange: (event) => persist(id, parseInput(id, event?.target?.value)) }
    }))
  };
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
var REASONS = {
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
function clamp(value, low, high) {
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
      focusBlock() {
        return Promise.resolve();
      },
      focusUid() {
      }
    };
    return { ...view, installCommands: () => registerCommands({ extensionAPI, lifecycle, host, view }) };
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
  const status = el("span", "compass-status");
  status.setAttribute("role", "status");
  const closeButton = button("compass-close", "Close", "Close (Esc)");
  bar.append(backButton, forwardButton, find, pinButton, outlineButton, fitButton, refreshButton, linkedButton, status, closeButton);
  const pinRow = el("div", "compass-pins");
  pinRow.hidden = true;
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
  root.append(bar, pinRow, stage, menu, details, ghost, hover, related);
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
  let activeResult = 0;
  const thumbUrls = /* @__PURE__ */ new Map();
  const thumbRenderTried = /* @__PURE__ */ new Set();
  let thumbRenderChain = Promise.resolve();
  let plexusOff = null;
  let plexusApi = null;
  let plexusFramePending = false;
  let followGen = 0;
  let compassNavUntil = 0;
  let hoverToken = 0;
  let hoverUid = null;
  let hoverUrl = null;
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
    zoom = clamp(Math.min(1, (rect.width || width) / width, (rect.height || height) / height), 0.3, 1);
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
    hood = buildNeighborhood(snapshot, settings.model, { expanded: expandedFor(current), regionLabel: plexusRegionLabels(plexus()) });
    nodeByUid = new Map(hood.nodes.map((node) => [node.uid, node]));
  }
  function load({ navigate = false } = {}) {
    if (!current || root.hidden || lifecycle.disposed) return;
    const next = readSettings();
    if (!next) return;
    settings = next;
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
    void host.syncSidecar(uid, settings.sidecar).catch((error) => console.error("[compass] sidecar", error)).then(() => {
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
  }
  function reveal() {
    if (!root.hidden) return;
    sampleTheme();
    root.hidden = false;
    placeFrame();
  }
  function focusUid(uid, { record = true } = {}) {
    if (!uid) return;
    hideFloating();
    if (record && current && current !== uid) {
      back.push(current);
      if (back.length > HISTORY_CAP) back.shift();
      forward.length = 0;
    }
    const changed = current !== uid;
    current = uid;
    reveal();
    host.watch(uid, scheduleReload);
    load({ navigate: changed });
    updateButtons();
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
    pointer = null;
    hideFloating();
    clearHover();
    endDrag();
    setStatus("");
  }
  function recenter(uid) {
    if (!uid || root.hidden || lifecycle.disposed) return;
    hideFloating();
    current = uid;
    host.watch(uid, scheduleReload);
    const next = readSettings();
    if (!next) return;
    settings = next;
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
  function placeElement(element, box) {
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
  function showHover(uid, clientX, clientY) {
    const node = uid === hood?.center?.uid ? snapshot?.center : nodeByUid.get(uid);
    const api = plexus();
    if (!node || !isDrawingLike(node) || typeof api?.thumbnail !== "function") {
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
    if (plexusOff && plexusApi === api) return;
    if (plexusOff) plexusOff();
    if (!api || typeof api.addEventListener !== "function") return;
    api.addEventListener("change", plexusChanged);
    plexusApi = api;
    plexusOff = () => {
      try {
        api.removeEventListener?.("change", plexusChanged);
      } catch {
      }
      plexusOff = null;
      plexusApi = null;
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
    const open = rowsFor(current);
    const rows = settings?.outline ? visibleRows(hood.outline, open) : [];
    geometry = layout(hood, { rows });
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
        placeElement(element, { ...box, x: box.x + dx, y: box.y + dy });
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
        element.replaceChildren(el("span", "compass-node-title", node.title));
        const why = node.label ? ` — ${node.label}` : "";
        element.setAttribute("aria-label", `${node.title}, ${SIDE_NAME[box.zone]}${why}`);
        element.title = `${node.title}${why}`;
        attachThumb(element, node);
      }
      if (!entering.includes(element)) placeElement(element, box);
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
          if (box) placeElement(element, box);
        }
      });
    }
    renderChips();
    renderEdges(boxes);
    drawLinkEdges(boxes);
    renderRelated();
    empty.hidden = hood.nodes.length > 0;
    if (!empty.hidden) {
      empty.textContent = "Nothing is connected here yet. Write Name:: [[Page]] in this outline, or link a page, and it appears here.";
      empty.style.transform = `translate(-50%, ${geometry.center.h / 2 + 36}px)`;
    }
    updateButtons();
    if (navigate) fit(true);
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
      return curve(clamp(box.x, -c.w / 2 + 16, c.w / 2 - 16), -c.h / 2, box.x, box.y + box.h / 2, true);
    }
    if (box.zone === "south") {
      return curve(clamp(box.x, -c.w / 2 + 16, c.w / 2 - 16), c.h / 2, box.x, box.y - box.h / 2, true);
    }
    if (box.zone === "west") {
      return curve(-c.w / 2, clamp(box.y, -c.h / 2 + 12, c.h / 2 - 12), box.x + box.w / 2, box.y, false);
    }
    return curve(c.w / 2, clamp(box.y, -c.h / 2 + 12, c.h / 2 - 12), box.x - box.w / 2, box.y, false);
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
    pinRow.hidden = pins.length === 0;
    for (const pin of pins) {
      const chip = el("span", "compass-pin-chip");
      const jump = button("compass-pin-jump", pin.title);
      jump.dataset.uid = pin.uid;
      const remove = button("compass-pin-remove", "×", `Unpin ${pin.title}`);
      remove.dataset.uid = pin.uid;
      chip.append(jump, remove);
      pinRow.append(chip);
    }
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
  }
  function placeFloating(element, clientX, clientY) {
    const rect = root.getBoundingClientRect();
    element.hidden = false;
    const width = element.offsetWidth || 240;
    const height = element.offsetHeight || 160;
    element.style.left = `${clamp(clientX - rect.left, 8, Math.max(8, rect.width - width - 8))}px`;
    element.style.top = `${clamp(clientY - rect.top + 6, 8, Math.max(8, rect.height - height - 8))}px`;
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
    const isCenter = uid === hood?.center?.uid;
    if (!isCenter) menuItem("Focus here", () => focusUid(uid));
    menuItem("Open in sidebar", () => openSidebar(uid));
    menuItem("Open in main window", () => openMain(uid));
    const pinned = (settings?.pins ?? []).some((pin) => pin.uid === uid);
    if (nodeKind(uid) === "page" || isCenter) menuItem(pinned ? "Unpin" : "Pin", () => togglePin(uid));
    if (node) menuItem("Why is this here?", () => showDetails(uid, clientX, clientY));
    if (node?.writable) {
      for (const side of ["north", "south", "west", "east"]) {
        if (side === node.zone) continue;
        const attribute = targetAttribute(node, side);
        if (attribute) menuItem(`Move to ${SIDE_NAME[side]} (${attribute}::)`, () => moveNode(node, side));
      }
    }
    placeFloating(menu, clientX, clientY);
    menu.querySelector("button")?.focus();
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
    else setStatus(REASONS[result?.reason] ?? "The write failed. Compass reloaded.");
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
  function startDrag(state) {
    state.dragging = true;
    root.classList.add("compass-dragging");
    const node = nodeByUid.get(state.uid);
    for (const side of Object.keys(hints)) hints[side].textContent = hintText(side, node);
    ghost.textContent = node?.title ?? "";
    ghost.hidden = false;
    nodeEls.get(state.uid)?.classList.add("compass-lifted");
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
    if (!menu.hidden && !menu.contains(target)) hideFloating();
    if (!details.hidden && !details.contains(target)) {
      details.hidden = true;
      details.replaceChildren();
    }
    if (!stage.contains(target) || target.closest?.(".compass-chip, .compass-caret, .compass-row")) return;
    const element = target.closest?.(".compass-node");
    if (element && !element.classList.contains("compass-node-center")) {
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
    const side = geometry ? sideAt(clientToWorld(event.clientX, event.clientY), geometry.center) : null;
    for (const [name, hint] of Object.entries(hints)) hint.classList.toggle("compass-hint-hot", name === side);
  }
  function onPointerUp(event) {
    if (!pointer) return;
    const state = pointer;
    pointer = null;
    if (!state.dragging) return;
    suppressClick = true;
    later(() => {
      suppressClick = false;
    }, 0);
    if (state.type !== "node") return;
    endDrag();
    if (event.type === "pointercancel" || !geometry) return;
    handleDrop(state.uid, sideAt(clientToWorld(event.clientX, event.clientY), geometry.center));
  }
  function onWheel(event) {
    if (root.hidden) return;
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    const ox = event.clientX - rect.left - rect.width / 2;
    const oy = event.clientY - rect.top - rect.height / 2;
    const wx = (ox - panX) / zoom;
    const wy = (oy - panY) / zoom;
    const step = event.ctrlKey ? 1.04 : 1.12;
    zoom = clamp(zoom * (event.deltaY < 0 ? step : 1 / step), 0.25, 2.5);
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
    const target = event.target;
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
    const target = event.target;
    if (target.closest?.(".compass-part, .compass-caret, .compass-chip")) return;
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
    if (!element) return;
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
  function markResult() {
    const items = [...results.querySelectorAll(".compass-result")];
    items.forEach((item, index) => item.classList.toggle("compass-result-active", index === activeResult));
    items[activeResult]?.scrollIntoView?.({ block: "nearest" });
  }
  function runSearch() {
    const text = searchInput.value.trim();
    if (!text) {
      hideResults();
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
    focusUid(uid);
    stage.focus({ preventScroll: true });
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
      activeResult = clamp(activeResult + (event.key === "ArrowDown" ? 1 : -1), 0, items.length - 1);
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
    if (!root.contains(event.target) && event.target !== document.body) return;
    const typing = event.target === searchInput;
    if (event.key === "Escape") {
      if (!menu.hidden || !details.hidden || !results.hidden) hideFloating();
      else close();
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
    if (element && (event.key === "Enter" || event.key === " ")) {
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
  lifecycle.node(root, document.body);
  lifecycle.event(closeButton, "click", () => close());
  lifecycle.event(backButton, "click", () => goBack());
  lifecycle.event(forwardButton, "click", () => goForward());
  lifecycle.event(pinButton, "click", guard(() => togglePin()));
  lifecycle.event(outlineButton, "click", guard(() => toggleOutline()));
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
    showHover(node.dataset.uid, event.clientX, event.clientY);
  });
  lifecycle.event(stage, "pointerout", (event) => {
    if (event.relatedTarget?.closest?.(".compass-node")) return;
    clearHover();
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
    const jump = event.target.closest?.(".compass-pin-jump");
    if (jump) focusUid(jump.dataset.uid);
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
  const view = { repullIfOpen, toggle, focusPage, focusBlock, focusUid };
  return { ...view, installCommands: () => registerCommands({ extensionAPI, lifecycle, host, view }) };
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
    isAvailable() {
      return true;
    },
    focus(uid) {
      if (typeof overlay?.focusUid === "function") overlay.focusUid(uid);
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
