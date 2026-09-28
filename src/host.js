import { classify } from "./model/classify.js";
import { layout } from "./model/layout.js";
import { planWrite } from "./model/writes.js";

// Neighborhood pull. :db/id is included so the inbound query can take an entity id.
export const CENTER_PULL = `[
  :db/id
  :block/uid
  :node/title
  :block/string
  {:block/children [:block/uid :block/string :block/order]}
  {:block/refs [:block/uid :node/title]}
  {:harc/_e [
    :block/uid
    {:harc/a [:block/uid :node/title]}
    {:harc/v [:block/uid :node/title :block/string :harc/v-string]}
    {:harc/a-source [:block/uid :block/string]}
    {:harc/v-source [:block/uid]}
    {:harc/_e [
      :block/uid
      {:harc/a [:block/uid :node/title]}
      {:harc/v [:block/uid :node/title :block/string :harc/v-string]}
    ]}
  ]}
  {:harc/_v [
    :block/uid
    {:harc/e [:block/uid :node/title :block/string]}
    {:harc/a [:block/uid :node/title]}
    {:harc/v [:block/uid :node/title :block/string :harc/v-string]}
    {:harc/a-source [:block/uid :block/string]}
    {:harc/v-source [:block/uid]}
  ]}
]`;

export const INBOUND_QUERY = `[:find ?uid ?title
 :in $ ?center
 :where
  [?b :block/refs ?center]
  [?b :block/page ?page]
  [(not= ?page ?center)]
  [?page :block/uid ?uid]
  [?page :node/title ?title]]`;

const SEARCH_RE = `[:find ?uid ?title
 :in $ ?pattern
 :where
  [?page :node/title ?title]
  [(re-pattern ?pattern) ?re]
  [(re-find ?re ?title)]
  [?page :block/uid ?uid]]`;

const SEARCH_INCLUDES = `[:find ?uid ?title
 :in $ ?needle
 :where
  [?page :node/title ?title]
  [(clojure.string/includes? ?title ?needle)]
  [?page :block/uid ?uid]]`;

const PROTECTED = [":harc", ":entity/attrs", ":attr/proxy"];

function roamApi() {
  const host = globalThis.window ?? globalThis;
  return host.roamAlphaAPI ?? globalThis.roamAlphaAPI ?? null;
}

function asList(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function entityString(uid) {
  const escaped = String(uid).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  return `[:block/uid "${escaped}"]`;
}

function maxPerZone(settings) {
  const value = settings?.maxPerZone;
  if (value == null || value === "") return 24;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 24;
  return Math.floor(number);
}

function namespacePrefix(title) {
  if (typeof title !== "string") return null;
  const mark = title.lastIndexOf("/");
  if (mark <= 0) return null;
  const prefix = title.slice(0, mark).trim();
  return prefix || null;
}

function compareText(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function labelText(node) {
  if (!node || typeof node !== "object") return "";
  if (node[":harc/v-string"] != null) return String(node[":harc/v-string"]);
  if (typeof node[":node/title"] === "string") return node[":node/title"];
  if (typeof node[":block/string"] === "string") return node[":block/string"];
  return "";
}

function annotationLabels(node) {
  const labels = [];
  for (const nested of asList(node?.[":harc/_e"])) {
    const attribute = asList(nested?.[":harc/a"])[0]?.[":node/title"];
    if (typeof attribute !== "string" || !attribute.trim()) continue;
    const name = attribute.trim();
    for (const value of asList(nested?.[":harc/v"])) {
      labels.push({ attribute: name, text: labelText(value) });
    }
  }
  return labels;
}

function valueRecord(node) {
  const uid = node?.[":block/uid"];
  if (typeof uid !== "string" || !uid) return null;
  if (typeof node[":node/title"] === "string" && node[":node/title"]) {
    return { uid, title: node[":node/title"] };
  }
  if (node[":harc/v-string"] != null && node[":block/string"] == null) {
    return { uid, vString: node[":harc/v-string"] };
  }
  if (typeof node[":block/string"] === "string") return { uid, string: node[":block/string"] };
  if (node[":harc/v-string"] != null) return { uid, vString: node[":harc/v-string"] };
  return { uid };
}

function remember(node, pages, blocks) {
  const uid = node?.[":block/uid"];
  if (typeof uid !== "string" || !uid) return null;
  if (typeof node[":node/title"] === "string") {
    pages.add(uid);
    return { uid, title: node[":node/title"] };
  }
  blocks.add(uid);
  const title = typeof node[":block/string"] === "string" ? node[":block/string"] : "";
  return { uid, title };
}

function trackValue(value, pages, blocks) {
  if (!value?.uid) return;
  if (value.title) pages.add(value.uid);
  else if (value.string != null) blocks.add(value.uid);
}

function harcRecord(node, entities, withLabels) {
  const uid = node?.[":block/uid"];
  const attributeNode = asList(node?.[":harc/a"])[0];
  const title = attributeNode?.[":node/title"];
  if (typeof uid !== "string" || !uid || typeof title !== "string" || !title.trim()) return null;
  const source = asList(node[":harc/a-source"])[0];
  const values = [];
  for (const value of asList(node[":harc/v"])) {
    const record = valueRecord(value);
    if (record) values.push(record);
  }
  const valueSourceUids = [];
  for (const item of asList(node[":harc/v-source"])) {
    if (typeof item?.[":block/uid"] === "string") valueSourceUids.push(item[":block/uid"]);
  }
  const entityUids = [];
  const entityRecords = [];
  for (const entity of entities) {
    if (!entity?.uid || entityUids.includes(entity.uid)) continue;
    entityUids.push(entity.uid);
    entityRecords.push({ uid: entity.uid, title: entity.title || "" });
  }
  return {
    uid,
    entityUids,
    entities: entityRecords,
    attribute: {
      uid: typeof attributeNode?.[":block/uid"] === "string" ? attributeNode[":block/uid"] : "",
      title: title.trim(),
    },
    values,
    sourceUid: typeof source?.[":block/uid"] === "string" ? source[":block/uid"] : null,
    sourceString: typeof source?.[":block/string"] === "string" ? source[":block/string"] : "",
    valueSourceUids,
    labels: withLabels ? annotationLabels(node) : [],
  };
}

function pageRows(rows, limit) {
  const found = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!Array.isArray(row)) continue;
    const uid = row[0];
    const title = row[1];
    if (typeof uid !== "string" || typeof title !== "string" || !uid || !title || seen.has(uid)) continue;
    seen.add(uid);
    found.push({ uid, title });
  }
  found.sort((a, b) => compareText(a.title, b.title) || compareText(a.uid, b.uid));
  return found.slice(0, limit == null ? found.length : limit);
}

export function normalizePull(pulled, context = {}) {
  const uid = context.uid;
  const pages = context.pages instanceof Set ? context.pages : new Set();
  const blocks = context.blocks instanceof Set ? context.blocks : new Set();
  const center = { uid };
  if (typeof pulled?.[":node/title"] === "string" && uid) {
    center.title = pulled[":node/title"];
    pages.add(uid);
  } else if (pulled && uid) {
    blocks.add(uid);
  }
  if (typeof pulled?.[":block/string"] === "string") center.string = pulled[":block/string"];
  const centerEntity = [{ uid, title: center.title || center.string || "" }];
  const harcs = [];
  for (const node of asList(pulled?.[":harc/_e"])) {
    const record = harcRecord(node, centerEntity, true);
    if (!record) continue;
    for (const value of record.values) trackValue(value, pages, blocks);
    harcs.push(record);
  }
  for (const node of asList(pulled?.[":harc/_v"])) {
    const entities = [];
    for (const entityNode of asList(node?.[":harc/e"])) {
      const entity = remember(entityNode, pages, blocks);
      if (entity) entities.push(entity);
    }
    const record = harcRecord(node, entities, false);
    if (!record) continue;
    for (const value of record.values) trackValue(value, pages, blocks);
    harcs.push(record);
  }
  const outbound = [];
  const seenOut = new Set();
  for (const ref of asList(pulled?.[":block/refs"])) {
    const refUid = ref?.[":block/uid"];
    const title = ref?.[":node/title"];
    if (typeof refUid !== "string" || refUid === uid || typeof title !== "string" || !title || seenOut.has(refUid)) {
      continue;
    }
    seenOut.add(refUid);
    pages.add(refUid);
    outbound.push({ uid: refUid, title });
  }
  const children = asList(pulled?.[":block/children"]).filter((child) => typeof child?.[":block/uid"] === "string");
  children.sort((a, b) => {
    const ao = Number.isFinite(a[":block/order"]) ? a[":block/order"] : Number.MAX_SAFE_INTEGER;
    const bo = Number.isFinite(b[":block/order"]) ? b[":block/order"] : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return compareText(a[":block/uid"], b[":block/uid"]);
  });
  const outline = children.map((child) => {
    blocks.add(child[":block/uid"]);
    return {
      uid: child[":block/uid"],
      string: typeof child[":block/string"] === "string" ? child[":block/string"] : "",
      order: Number.isFinite(child[":block/order"]) ? child[":block/order"] : 0,
    };
  });
  for (const page of context.inbound ?? []) if (page?.uid) pages.add(page.uid);
  if (context.namespaceParent?.uid) pages.add(context.namespaceParent.uid);
  return {
    fixture: {
      center,
      harcs,
      outbound,
      inbound: context.inbound ?? [],
      outline,
      namespaceParent: context.namespaceParent ?? null,
      settings: context.settings ?? {},
    },
    pageUids: pages,
    blockUids: blocks,
  };
}

function graphName() {
  const name = roamApi()?.graph?.name;
  return typeof name === "string" && name ? name : "graph";
}

function dataApi() {
  const data = roamApi()?.data;
  if (!data?.pull) throw new Error("roamAlphaAPI.data is unavailable");
  return data;
}

function lookupNamespace(data, title, centerUid, pages) {
  const prefix = namespacePrefix(title);
  if (!prefix) return null;
  try {
    const found = data.pull("[:block/uid :node/title]", [":node/title", prefix]);
    const foundUid = found?.[":block/uid"];
    const name = found?.[":node/title"];
    if (typeof foundUid !== "string" || !foundUid || foundUid === centerUid || typeof name !== "string" || !name) {
      return null;
    }
    pages.add(foundUid);
    return { uid: foundUid, title: name };
  } catch (error) {
    console.error("[compass] namespace lookup failed", error);
    return null;
  }
}

function lookupInbound(data, uid, pulled, limit, pages) {
  if (!data?.q) return [];
  let eid = pulled?.[":db/id"];
  if (typeof eid !== "number") {
    try {
      eid = data.pull("[:db/id]", [":block/uid", uid])?.[":db/id"];
    } catch (error) {
      console.error("[compass] inbound failed", error);
      return [];
    }
  }
  if (typeof eid !== "number") return [];
  try {
    const rows = data.q(INBOUND_QUERY, eid);
    const found = pageRows(rows, limit);
    for (const page of found) pages.add(page.uid);
    return found;
  } catch (error) {
    console.error("[compass] inbound failed", error);
    return [];
  }
}

async function pullFixture(uid, settings) {
  const data = dataApi();
  let pulled = null;
  try {
    pulled = data.pull(CENTER_PULL, [":block/uid", uid]);
  } catch (error) {
    console.error("[compass] pull failed", error);
    pulled = null;
  }
  const pages = new Set();
  const blocks = new Set();
  const inbound = lookupInbound(data, uid, pulled, maxPerZone(settings), pages);
  const title = typeof pulled?.[":node/title"] === "string" ? pulled[":node/title"] : null;
  const namespaceParent = lookupNamespace(data, title, uid, pages);
  const normalized = normalizePull(pulled, {
    uid,
    settings,
    inbound,
    namespaceParent,
    pages,
    blocks,
  });
  return { ...normalized, missing: pulled == null };
}

function present(fixture) {
  const classified = classify(fixture);
  const showOutline = classified.nodes.some((node) => node.zone === "outline");
  return {
    fixture,
    classified,
    placed: layout(classified.nodes, { showOutline }),
    showOutline,
  };
}

function isProtectedOp(op) {
  const blob = `${op?.string ?? ""}\n${op?.title ?? ""}`;
  return PROTECTED.some((token) => blob.includes(token));
}

function editedSourceIds(fixture, ops) {
  const sources = new Set();
  for (const harc of fixture?.harcs ?? []) if (harc?.sourceUid) sources.add(harc.sourceUid);
  const ids = new Set();
  for (const op of ops ?? []) {
    if ((op.op === "update" || op.op === "delete") && sources.has(op.uid)) ids.add(op.uid);
    if (op.op === "create" && sources.has(op.parentUid)) ids.add(op.parentUid);
  }
  return [...ids];
}

async function sourcesStale(fixture, ops) {
  const data = dataApi();
  for (const uid of editedSourceIds(fixture, ops)) {
    const harc = (fixture.harcs ?? []).find((item) => item?.sourceUid === uid);
    if (!harc) continue;
    let pulled = null;
    try {
      pulled = data.pull("[:block/uid :block/string]", [":block/uid", uid]);
    } catch (error) {
      console.error("[compass] source pull failed", error);
      return true;
    }
    if (pulled == null || pulled[":block/string"] !== harc.sourceString) return true;
  }
  return false;
}

async function applyOp(op) {
  const api = roamApi();
  const data = api?.data;
  if (!data) throw new Error("roamAlphaAPI.data is unavailable");
  if (op.op === "create") {
    await data.block.create({
      location: { "parent-uid": op.parentUid, order: op.order || "last" },
      block: { string: op.string },
    });
    return;
  }
  if (op.op === "update") {
    await data.block.update({ block: { uid: op.uid, string: op.string } });
    return;
  }
  if (op.op === "delete") {
    await data.block.delete({ block: { uid: op.uid } });
    return;
  }
  if (op.op === "create-page") {
    await data.page.create({ page: { title: op.title } });
    return;
  }
  if (op.op === "open") {
    await api.ui.mainWindow.openBlock({ block: { uid: op.uid } });
  }
}

function escapeReg(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createHost({ lifecycle }) {
  if (!lifecycle?.add) throw new TypeError("A lifecycle is required");
  let displayed = null;
  let latest = null;
  let currentWatch = null;
  let schedule = () => {};
  let sidecarUid = null;
  let alive = true;
  let chain = Promise.resolve();

  function clearWatch() {
    if (!currentWatch) return;
    const watch = currentWatch;
    currentWatch = null;
    try {
      roamApi()?.data?.removePullWatch?.(watch.pattern, watch.entity, watch.callback);
    } catch (error) {
      console.error("[compass] unwatch failed", error);
    }
  }

  async function removeSidecar(uid) {
    if (!uid) return;
    try {
      await roamApi()?.ui?.rightSidebar?.removeWindow?.({
        window: { type: "outline", "block-uid": uid },
      });
    } catch (error) {
      console.error("[compass] sidecar", error);
    }
  }

  async function closeSidecar() {
    const uid = sidecarUid;
    sidecarUid = null;
    await removeSidecar(uid);
  }

  lifecycle.add(() => closeSidecar());
  lifecycle.add(() => { clearWatch(); });
  lifecycle.add(() => { alive = false; });

  function enqueue(task) {
    const run = chain.then(task, task);
    chain = run.then(() => undefined, () => undefined);
    return run;
  }

  async function load(uid, settings) {
    const bundle = await pullFixture(uid, settings);
    const view = present(bundle.fixture);
    if (displayed === uid) latest = { fixture: bundle.fixture, settings };
    return {
      ...view,
      pageUids: bundle.pageUids,
      blockUids: bundle.blockUids,
      missing: bundle.missing,
    };
  }

  function watch(uid) {
    if (!uid) return;
    const data = roamApi()?.data;
    if (!data?.addPullWatch || !data?.removePullWatch) return;
    const entity = entityString(uid);
    if (currentWatch && currentWatch.entity === entity && currentWatch.pattern === CENTER_PULL) return;
    clearWatch();
    // Own writes echo back through the watch. Schedule a repull; do not apply the delta.
    const callback = () => { schedule(); };
    try {
      data.addPullWatch(CENTER_PULL, entity, callback);
      currentWatch = { pattern: CENTER_PULL, entity, callback };
    } catch (error) {
      console.error("[compass] watch failed", error);
    }
  }

  async function runCommit(snapshot, action) {
    if (!snapshot?.center?.uid) return { ok: false, reason: "empty" };
    let fixture = snapshot;
    let ops = planWrite(fixture, action).ops ?? [];
    if (ops.some(isProtectedOp)) throw new Error("Refusing a protected write");
    if (await sourcesStale(fixture, ops)) {
      const rebuilt = await pullFixture(fixture.center.uid, fixture.settings);
      fixture = rebuilt.fixture;
      if (displayed === fixture.center.uid) latest = { fixture, settings: fixture.settings };
      ops = planWrite(fixture, action).ops ?? [];
      if (ops.some(isProtectedOp)) throw new Error("Refusing a protected write");
    }
    if (!ops.length) return { ok: true, empty: true };
    for (const op of ops) await applyOp(op);
    if (displayed !== fixture.center.uid) return { ok: true };
    const model = await load(fixture.center.uid, fixture.settings);
    return { ok: true, model };
  }

  function withLock(snapshot, action) {
    const uid = snapshot?.center?.uid;
    if (!uid) return Promise.resolve({ ok: false, reason: "empty" });
    const locks = globalThis.navigator?.locks;
    if (!locks?.request) return runCommit(snapshot, action);
    const name = `compass:${graphName()}:${uid}`;
    let result = { ok: false, reason: "lock" };
    return locks.request(name, { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      result = await runCommit(snapshot, action);
    }).then(() => result);
  }

  function commit(action) {
    const snapshot = latest?.fixture ?? null;
    return enqueue(() => withLock(snapshot, action));
  }

  function search(text) {
    const needle = String(text ?? "").trim();
    if (!needle) return [];
    const data = roamApi()?.data;
    if (!data?.q) return [];
    try {
      return pageRows(data.q(SEARCH_RE, `(?i)${escapeReg(needle)}`), 20);
    } catch {
      try {
        return pageRows(data.q(SEARCH_INCLUDES, needle), 20);
      } catch (error) {
        console.error("[compass] search failed", error);
        return [];
      }
    }
  }

  async function openPageUid() {
    try {
      const uid = await roamApi()?.ui?.mainWindow?.getOpenPageOrBlockUid?.();
      return typeof uid === "string" && uid ? uid : null;
    } catch (error) {
      console.error("[compass] open page", error);
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

  async function openNode(uid, page) {
    const main = roamApi()?.ui?.mainWindow;
    if (!main || !uid) return;
    if (page) await main.openPage({ page: { uid } });
    else await main.openBlock({ block: { uid } });
  }

  async function syncSidecar(uid, enabled) {
    if (!alive) return;
    if (!enabled || !uid) {
      await closeSidecar();
      return;
    }
    if (sidecarUid === uid) return;
    const previous = sidecarUid;
    sidecarUid = null;
    if (previous && previous !== uid) await removeSidecar(previous);
    if (!alive) return;
    try {
      await roamApi()?.ui?.rightSidebar?.addWindow?.({
        window: { type: "outline", "block-uid": uid },
      });
      if (!alive) {
        await removeSidecar(uid);
        return;
      }
      sidecarUid = uid;
    } catch (error) {
      console.error("[compass] sidecar", error);
    }
  }

  return {
    load,
    commit,
    watch,
    unwatch: clearWatch,
    search,
    openPageUid,
    focusedBlock,
    openNode,
    syncSidecar,
    closeSidecar,
    blockContextMenu() {
      return roamApi()?.ui?.blockContextMenu ?? null;
    },
    setDisplayed(uid) { displayed = uid; },
    setScheduler(fn) { schedule = typeof fn === "function" ? fn : () => {}; },
  };
}
