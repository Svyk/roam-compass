import { typedParentUids } from "./model/neighborhood.js";
import { planMove } from "./model/rewrite.js";
import { drawingTitle, parseAttribute, plainText } from "./model/text.js";

// Harc labels: attributes nested under a relation block (Role:: Lead under Owner::).
const LABELS = "{:harc/_e [{:harc/a [:node/title :edit/time :create/time]} {:harc/v [:block/uid :node/title :edit/time :create/time :block/string :harc/v-string]}]}";
const SOURCE = "[:block/uid :block/string :block/order {:block/_children [:block/uid]} {:block/children [:block/uid :block/string :block/order]}]";

export const CENTER_PULL = `[:block/uid :node/title :edit/time :create/time :block/string :block/order
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

export const OUTLINE_PULL = "[:block/uid :block/string :block/order {:block/refs [:block/uid :node/title :block/string]} {:block/children ...}]";

export const PEER_PULL = `[:block/uid
 {:harc/_v [{:harc/a [:node/title]} {:harc/e [:block/uid :node/title :block/string]}]}
 {:harc/_e [{:harc/a [:node/title]} {:harc/v [:block/uid :node/title :block/string]}]}]`;

const WATCHES = [
  "[:block/string :node/title {:block/_refs [:block/uid :block/string]} {:harc/_e [:block/uid]} {:harc/_v [:block/uid]}]",
  "[:block/uid :block/string {:block/children ...}]",
];

const TITLES_QUERY = "[:find ?uid ?title :where [?page :node/title ?title] [?page :block/uid ?uid]]";
const DRAWING_REF_QUERY = `[:find ?uid ?want ?time
 :in $ [?want ...]
 :where
 [?r :block/uid ?want]
 [?b :block/refs ?r]
 [?b :block/uid ?uid]
 [?b :block/string ?s]
 [(clojure.string/includes? ?s "excalidraw")]
 [?b :edit/time ?time]]`;
const PREFIX_QUERY = `[:find ?uid ?title ?edit ?create
 :in $ ?prefix
 :where
  [?page :node/title ?title]
  [(clojure.string/starts-with? ?title ?prefix)]
  [?page :block/uid ?uid]
  [?page :edit/time ?edit]
  [?page :create/time ?create]]`;
const ALIAS_QUERY = `[:find ?uid ?s :in $ [?uid ...] :where [?p :block/uid ?uid] [?p :block/children ?c] [?c :block/string ?s] [(clojure.string/includes? ?s "Name::")]]`;
const RECENT_PAGES_QUERY = "[:find ?uid ?title ?edit ?create :where [?e :node/title ?title] [?e :block/uid ?uid] [?e :edit/time ?edit] [?e :create/time ?create]]";
const RECENT_DRAWINGS_QUERY = `[:find ?uid ?edit :where [?b :block/uid ?uid] [?b :block/string ?s] [(clojure.string/includes? ?s "excalidraw")] [?b :edit/time ?edit]]`;

const MENTION_CAP = 500;
const NAMESPACE_CAP = 200;
const DAILY_UID = /^(\d{2})-(\d{2})-(\d{4})$/;

function roamApi() {
  const host = globalThis.window ?? globalThis;
  return host.roamAlphaAPI ?? globalThis.roamAlphaAPI ?? null;
}

function asList(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function entityString(uid) {
  return `[:block/uid "${String(uid).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"]`;
}

function byOrder(a, b) {
  return (a.order ?? 0) - (b.order ?? 0) || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);
}

export function topicRefUid(entity) {
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

export function entityOf(node) {
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

// Only a Name:: attribute. A bare block ref plain-texts to "(( ))" and is not an alias.
export function aliasFromBlock(string) {
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

export function labelsOf(harc) {
  const labels = [];
  for (const nested of asList(harc?.[":harc/_e"])) {
    const attribute = asList(nested?.[":harc/a"])[0]?.[":node/title"];
    if (typeof attribute !== "string" || !attribute.trim()) continue;
    const text = asList(nested[":harc/v"]).map(displayText).filter(Boolean).join(", ");
    labels.push({ attribute: attribute.trim(), text });
  }
  return labels;
}

export function sourceOf(node) {
  const uid = node?.[":block/uid"];
  if (typeof uid !== "string" || !uid || typeof node[":block/string"] !== "string") return null;
  const parentUid = asList(node[":block/_children"])[0]?.[":block/uid"];
  return {
    uid,
    string: node[":block/string"],
    order: Number.isFinite(node[":block/order"]) ? node[":block/order"] : null,
    parentUid: typeof parentUid === "string" ? parentUid : null,
    children: asList(node[":block/children"])
      .map((child) => entityOf(child))
      .filter((child) => child?.string != null)
      .sort(byOrder),
  };
}

function attributeOf(harc) {
  const title = asList(harc?.[":harc/a"])[0]?.[":node/title"];
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

export function normalizeOut(list) {
  const harcs = [];
  for (const harc of asList(list)) {
    const attribute = attributeOf(harc);
    if (!attribute) continue;
    harcs.push({
      uid: harc[":block/uid"] ?? null,
      attribute,
      source: sourceOf(asList(harc[":harc/a-source"])[0]),
      values: asList(harc[":harc/v"]).map(entityOf).filter(Boolean),
      labels: labelsOf(harc),
    });
  }
  return harcs;
}

export function normalizeIn(list) {
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
      labels: labelsOf(harc),
    });
  }
  return harcs;
}

export function normalizeMentions(list, cap = MENTION_CAP) {
  const mentions = [];
  for (const block of asList(list)) {
    const uid = block?.[":block/uid"];
    const page = entityOf(block?.[":block/page"]);
    if (typeof uid !== "string" || typeof block[":block/string"] !== "string" || !page?.title) continue;
    mentions.push({
      uid,
      string: block[":block/string"],
      page,
      refs: asList(block[":block/refs"]).map(entityOf).filter(Boolean),
    });
  }
  mentions.sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  return mentions.slice(0, cap);
}

export function normalizeOutline(root) {
  const blocks = (node) => asList(node?.[":block/children"])
    .map((child) => {
      const entity = entityOf(child);
      if (!entity || entity.string == null) return null;
      return {
        uid: entity.uid,
        string: entity.string,
        order: entity.order ?? 0,
        refs: asList(child[":block/refs"]).map(entityOf).filter(Boolean),
        children: blocks(child),
      };
    })
    .filter(Boolean)
    .sort(byOrder);
  return blocks(root);
}

export function normalizeCenter(pulled, uid) {
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
    siblings: asList(parentNode?.[":block/children"])
      .map(entityOf)
      .filter((item) => item?.string != null && item.uid !== uid)
      .sort(byOrder),
    refs: asList(pulled?.[":block/refs"]).map(entityOf).filter(Boolean),
  };
}

export function normalizePeer(parentUid, pulled) {
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
    }),
  };
}

function pad(number) {
  return String(number).padStart(2, "0");
}

// The open page or block, or null. Never today's daily note.
export async function mainUid() {
  try {
    const uid = await roamApi()?.ui?.mainWindow?.getOpenPageOrBlockUid?.();
    return typeof uid === "string" && uid ? uid : null;
  } catch (error) {
    console.error("[compass] main uid", error);
    return null;
  }
}

// Page or block route only. A graph prefix is ignored. Block wins when both are present.
export function uidFromHash(hash) {
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

export function adjacentDayUids(uid) {
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
  pages.sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  return pages.slice(0, NAMESPACE_CAP);
}

function pageByTitle(data, title) {
  try {
    const found = data.pull("[:block/uid :node/title :edit/time :create/time]", `[:node/title "${title.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"]`);
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
    siblings: parent?.title ? prefixPages(data, `${prefix}/`).filter((page) => page.uid !== center.uid) : [],
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
  const seen = new Set();
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
  const walk = (blocks) => {
    for (const block of blocks ?? []) {
      for (const ref of block?.refs ?? []) add(ref);
      walk(block?.children);
    }
  };
  walk(snap.outline);
  for (const ref of snap.center?.refs ?? []) add(ref);
  add(snap.center?.page);
  for (const peer of snap.peers ?? []) {
    for (const row of peer?.incoming ?? []) add(row?.entity);
    for (const row of peer?.outgoing ?? []) add(row?.value);
  }
  if (snap.center?.kind === "page") add(snap.center);
  return uids;
}

// Pages already on the snap. The first non-empty Name:: wins; a failed query leaves {}.
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

export function createHost({ lifecycle }) {
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
    for (const watch of watches.splice(0)) {
      try {
        api?.removePullWatch?.(watch.pattern, watch.entity, watch.callback);
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
    // Our own writes come back through these too; the view repulls and the keyed DOM absorbs them.
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

  function snapshot(uid, modelSettings) {
    const api = data();
    const pulled = pull(api, CENTER_PULL, uid);
    if (!pulled || (pulled[":node/title"] == null && pulled[":block/string"] == null)) {
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
      peers: [],
    };
    snap.peers = typedParentUids(snap, modelSettings).map((parentUid) => normalizePeer(parentUid, pull(api, PEER_PULL, parentUid)));
    snap.aliases = aliasesOf(api, snap);
    return snap;
  }

  function titles() {
    const api = roamApi()?.data;
    if (!api?.q) return [];
    try {
      return (api.q(TITLES_QUERY) ?? []).flatMap(([uid, title]) => (
        typeof uid === "string" && typeof title === "string" ? [{ uid, title }] : []
      ));
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
    // The daily notes log has no single open page; today's note stands in.
    try {
      const today = roamApi()?.util?.dateToPageUid?.(new Date());
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
      window: { type: kind === "block" ? "block" : "outline", "block-uid": uid },
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
      return (roamApi()?.ui?.rightSidebar?.getWindows?.() ?? []).some((item) => (
        item?.["block-uid"] === uid || item?.["page-uid"] === uid
      ));
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

  // Compass only removes a sidebar window it opened itself.
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

  // Rewrites the Name:: block behind one typed edge. Plans against a fresh pull of that block.
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
    queue = run.then(() => undefined, () => undefined);
    return run;
  }

  function drawingRows(centreUid, refUids) {
    const api = roamApi()?.data;
    if (!api?.q) return [];
    const wants = [];
    const seen = new Set();
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
    const byUid = new Map();
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

  lifecycle.add(() => closeSidecar());
  lifecycle.add(() => unwatch());
  lifecycle.add(() => { alive = false; });

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
    drawingRows,
    blockContextMenu() {
      return roamApi()?.ui?.blockContextMenu ?? null;
    },
  };
}
