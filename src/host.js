import { typedParentUids } from "./model/neighborhood.js";
import { planMove } from "./model/rewrite.js";

// Harc labels: attributes nested under a relation block (Role:: Lead under Owner::).
const LABELS = "{:harc/_e [{:harc/a [:node/title]} {:harc/v [:block/uid :node/title :block/string :harc/v-string]}]}";
const SOURCE = "[:block/uid :block/string :block/order {:block/_children [:block/uid]} {:block/children [:block/uid :block/string :block/order]}]";

export const CENTER_PULL = `[:block/uid :node/title :block/string :block/order
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

export const OUTLINE_PULL = "[:block/uid :block/string :block/order {:block/refs [:block/uid :node/title :block/string]} {:block/children ...}]";

export const PEER_PULL = `[:block/uid
 {:harc/_v [{:harc/a [:node/title]} {:harc/e [:block/uid :node/title :block/string]}]}
 {:harc/_e [{:harc/a [:node/title]} {:harc/v [:block/uid :node/title :block/string]}]}]`;

const WATCHES = [
  "[:block/string :node/title {:block/_refs [:block/uid :block/string]} {:harc/_e [:block/uid]} {:harc/_v [:block/uid]}]",
  "[:block/uid :block/string {:block/children ...}]",
];

const TITLES_QUERY = "[:find ?uid ?title :where [?page :node/title ?title] [?page :block/uid ?uid]]";
const PREFIX_QUERY = `[:find ?uid ?title
 :in $ ?prefix
 :where
  [?page :node/title ?title]
  [(clojure.string/starts-with? ?title ?prefix)]
  [?page :block/uid ?uid]]`;

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

export function entityOf(node) {
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
  const pages = [];
  for (const [uid, title] of rows) {
    if (typeof uid !== "string" || typeof title !== "string") continue;
    const rest = title.slice(prefix.length);
    if (!rest || rest.includes("/")) continue;
    pages.push({ uid, title });
  }
  pages.sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  return pages.slice(0, NAMESPACE_CAP);
}

function pageByTitle(data, title) {
  try {
    const found = data.pull("[:block/uid :node/title]", `[:node/title "${title.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"]`);
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

  lifecycle.add(() => closeSidecar());
  lifecycle.add(() => unwatch());
  lifecycle.add(() => { alive = false; });

  return {
    snapshot,
    watch,
    unwatch,
    titles,
    openPageUid,
    focusedBlock,
    openInSidebar,
    openInMain,
    syncSidecar,
    releaseSidecar,
    closeSidecar,
    move,
    blockContextMenu() {
      return roamApi()?.ui?.blockContextMenu ?? null;
    },
  };
}
