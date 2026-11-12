import { adjacentDayUids, aliasFromBlock } from "../../src/host.js";
import { ZONE_ATTR, planAttributeWrite } from "../../src/model/batch7.js";
import { typedParentUids } from "../../src/model/neighborhood.js";
import { planMove } from "../../src/model/rewrite.js";
import { drawingTitle, parseAttribute, plainText, scanRefs, tailShape } from "../../src/model/text.js";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const FORBIDDEN = [":harc", ":entity/attrs", ":attr/proxy"];

function ordinal(day) {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  const mod10 = day % 10;
  if (mod10 === 1) return `${day}st`;
  if (mod10 === 2) return `${day}nd`;
  if (mod10 === 3) return `${day}rd`;
  return `${day}th`;
}

function formatDailyPage(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return {
    uid: `${mm}-${dd}-${yyyy}`,
    title: `${MONTHS[d.getMonth()]} ${ordinal(d.getDate())}, ${yyyy}`,
  };
}

function byOrder(a, b) {
  return (a.order ?? 0) - (b.order ?? 0) || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);
}

function makeBlock(uid, string, children = [], baseTime = 1_700_000_000_000, order = 0) {
  return {
    uid,
    string,
    order,
    editTime: baseTime,
    createTime: baseTime - 3_600_000,
    children: children.map((child, idx) => ({ ...child, order: idx })),
  };
}

export function createGraph(now = new Date()) {
  const today = formatDailyPage(now);
  const base = now instanceof Date && !Number.isNaN(now.getTime()) ? now.getTime() : 1_762_900_000_000;
  let step = 0;
  const stamp = () => {
    step += 1;
    return base - step * 60_000;
  };
  const b = (uid, string, children = []) => makeBlock(uid, string, children, stamp());
  const p = (uid, title, children = []) => {
    const t = stamp();
    return {
      uid,
      title,
      editTime: t,
      createTime: t - 86_400_000,
      children: children.map((child, idx) => ({ ...child, order: idx })),
    };
  };

  const pages = [
    p("p-alpha", "Project Alpha", [
      b("b-alpha-parent", "Parent:: [[Programs]]"),
      b("b-alpha-child", "Child::", [
        b("b-alpha-c1", "[[Task One]]"),
        b("b-alpha-c2", "[[Task Two]]"),
        b("b-alpha-c3", "[[Task Three]]"),
      ]),
      b("b-alpha-friend", "Friend:: [[Project Beta]]"),
      b("b-alpha-challenger", "Challenger:: [[Risk Register]]"),
      b("b-alpha-prev", "Previous:: [[Kickoff]]"),
      b("b-alpha-next", "Next:: [[Launch]]"),
      b("b-alpha-owner", "Owner:: [[Jane]]", [
        b("b-alpha-owner-role", "Role:: Lead"),
      ]),
      b("b-alpha-status", "Status:: Active"),
      b("b-alpha-type", "Type:: Project"),
      b("b-alpha-budget", "Review [[Budget]] numbers"),
      b("b-alpha-roadmap", "Align milestones with [[Roadmap]]"),
      b("b-alpha-empty", "Scratchpad: [[Empty Page]]"),
      b("b-alpha-url", "Architecture spec at https://example.com/project-alpha/spec"),
    ]),
    p("p-task-1", "Task One", [
      b("b-t1-child", "Child::", [
        b("b-t1-c1", "[[Subtask A]]"),
        b("b-t1-c2", "[[Subtask B]]"),
      ]),
      b("b-t1-type", "Type:: Task"),
      b("b-t1-status", "Status:: Doing"),
    ]),
    p("p-task-2", "Task Two", [
      b("b-t2-type", "Type:: Task"),
      b("b-t2-status", "Status:: Todo"),
    ]),
    p("p-task-3", "Task Three", [
      b("b-t3-type", "Type:: Task"),
      b("b-t3-status", "Status:: Done"),
    ]),
    p("p-subtask-a", "Subtask A", [
      b("b-sa-child", "Child:: [[Detail A1]]"),
    ]),
    p("p-subtask-b", "Subtask B", [
      b("b-sb-note", "Verify edge cases for Subtask B"),
    ]),
    p("p-detail-a1", "Detail A1", [
      b("b-da1-note", "Concrete checklist for Detail A1"),
    ]),
    p("p-budget", "Budget", [
      b("b-budget-type", "Type:: Source"),
    ]),
    p("p-roadmap", "Roadmap", [
      b("b-roadmap-type", "Type:: Source"),
    ]),
    p("p-programs", "Programs", [
      b("b-prog-child", "Child:: [[Project Gamma]]"),
    ]),
    p("p-gamma", "Project Gamma", [
      b("b-gamma-type", "Type:: Project"),
      b("b-gamma-status", "Status:: Planned"),
    ]),
    p("p-beta", "Project Beta", [
      b("b-beta-type", "Type:: Project"),
    ]),
    p("p-risk", "Risk Register", [
      b("b-risk-note", "Track open delivery risks"),
    ]),
    p("p-kickoff", "Kickoff", [
      b("b-kickoff-note", "Kickoff goals and charter"),
    ]),
    p("p-launch", "Launch", [
      b("b-launch-note", "Launch readiness checklist"),
    ]),
    p("p-jane", "Jane", [
      b("b-jane-note", "Engineering lead"),
    ]),
    p("p-meeting", "Meeting Notes", [
      b("b-meeting-1", "Synced on [[Project Alpha]] with [[Jane]]"),
    ]),
    p("p-alpha-notes", "Project Alpha/Notes", [
      b("b-anotes-1", "Working notes for Project Alpha"),
    ]),
    p("p-empty", "Empty Page", []),
    p(today.uid, today.title, [
      b("b-today-1", "Daily check-in on [[Project Alpha]]"),
    ]),
  ];

  return {
    defaultCenterUid: "p-alpha",
    nextId: 1,
    pages,
  };
}

function nextUid(graph) {
  graph.nextId = (graph.nextId ?? 1) + 1;
  let candidate = `u-${graph.nextId}`;
  const used = new Set();
  for (const page of graph.pages ?? []) {
    used.add(page.uid);
    const walk = (blocks) => {
      for (const block of blocks ?? []) {
        used.add(block.uid);
        walk(block.children);
      }
    };
    walk(page.children);
  }
  while (used.has(candidate)) {
    graph.nextId += 1;
    candidate = `u-${graph.nextId}`;
  }
  return candidate;
}

function pageEntity(page) {
  if (!page) return null;
  const out = { uid: page.uid, title: page.title };
  if (Number.isFinite(page.editTime)) out.editTime = page.editTime;
  if (Number.isFinite(page.createTime)) out.createTime = page.createTime;
  return out;
}

function blockEntity(block) {
  if (!block) return null;
  const out = { uid: block.uid, string: block.string ?? "", order: block.order ?? 0 };
  if (Number.isFinite(block.editTime)) out.editTime = block.editTime;
  if (Number.isFinite(block.createTime)) out.createTime = block.createTime;
  return out;
}

function buildIndex(graph) {
  const pagesByUid = new Map();
  const pagesByTitle = new Map();
  const blocksByUid = new Map();

  for (const page of graph.pages ?? []) {
    if (!page?.uid) continue;
    pagesByUid.set(page.uid, page);
    if (typeof page.title === "string") pagesByTitle.set(page.title, page);
    const walk = (children, parent) => {
      const sorted = [...(children ?? [])].sort(byOrder);
      for (const block of sorted) {
        if (!block?.uid) continue;
        blocksByUid.set(block.uid, { block, parent, page });
        walk(block.children, block);
      }
    };
    walk(page.children, page);
  }

  function resolveToken(token) {
    if (!token) return null;
    if (token.type === "block") {
      const hit = blocksByUid.get(token.uid);
      return hit ? blockEntity(hit.block) : null;
    }
    if (token.type === "page") {
      const hit = pagesByTitle.get(token.title);
      return hit ? pageEntity(hit) : null;
    }
    return null;
  }

  function refsOfString(string) {
    const refs = [];
    const seen = new Set();
    for (const token of scanRefs(string)) {
      const entity = resolveToken(token);
      if (entity && !seen.has(entity.uid)) {
        seen.add(entity.uid);
        refs.push(entity);
      }
    }
    return refs;
  }

  function sourceSnapshot(block, parent) {
    return {
      uid: block.uid,
      string: block.string ?? "",
      order: Number.isFinite(block.order) ? block.order : 0,
      parentUid: parent?.uid ?? null,
      children: [...(block.children ?? [])]
        .map((child) => blockEntity(child))
        .filter(Boolean)
        .sort(byOrder),
    };
  }

  function extractAttributeValues(block) {
    const parsed = parseAttribute(block.string);
    if (!parsed) return null;
    const shape = tailShape(parsed.tail);
    const values = [];
    const valueSources = new Map();

    const addTarget = (entity, srcUid) => {
      if (!entity) return;
      values.push(entity);
      if (entity.uid && srcUid) {
        const list = valueSources.get(entity.uid) ?? [];
        if (!list.includes(srcUid)) list.push(srcUid);
        valueSources.set(entity.uid, list);
      }
    };

    if (shape.kind === "refs") {
      for (const token of shape.values) {
        addTarget(resolveToken(token), block.uid);
      }
    } else if (shape.kind === "bare") {
      const sortedChildren = [...(block.children ?? [])].sort(byOrder);
      for (const child of sortedChildren) {
        if (parseAttribute(child.string)) continue;
        const childShape = tailShape(child.string);
        if (childShape.kind === "refs") {
          for (const token of childShape.values) {
            addTarget(resolveToken(token), child.uid);
          }
        } else {
          const refs = scanRefs(child.string).filter((t) => !t.classTag);
          if (refs.length) {
            for (const token of refs) addTarget(resolveToken(token), child.uid);
          } else {
            const text = (child.string ?? "").trim();
            if (text) values.push({ uid: `v-${child.uid}`, text });
          }
        }
      }
    } else {
      const refs = scanRefs(parsed.tail).filter((t) => !t.classTag);
      if (refs.length) {
        for (const token of refs) addTarget(resolveToken(token), block.uid);
      } else {
        const text = parsed.tail.trim();
        if (text) values.push({ uid: `v-${block.uid}`, text });
      }
    }

    const labels = [];
    for (const child of [...(block.children ?? [])].sort(byOrder)) {
      const nestedParsed = parseAttribute(child.string);
      if (!nestedParsed) continue;
      const nested = extractAttributeValues(child);
      if (!nested) continue;
      const labelText = nested.values
        .map((val) => val.text ?? val.title ?? val.string ?? "")
        .filter(Boolean)
        .join(", ");
      labels.push({ attribute: nestedParsed.name, text: labelText });
    }

    return {
      attribute: parsed.name,
      values,
      valueSources,
      labels,
    };
  }

  const harcsByEntityUid = new Map();
  const harcsByTargetUid = new Map();

  for (const { block, parent, page } of blocksByUid.values()) {
    // Nested attributes under another attribute block become labels on that harc, not standalone harcs.
    if (parent !== page && parseAttribute(parent.string)) continue;
    const extracted = extractAttributeValues(block);
    if (!extracted) continue;
    const ownerEntity = parent === page ? pageEntity(page) : blockEntity(parent);
    const harc = {
      uid: `h-${block.uid}`,
      attribute: extracted.attribute,
      owner: ownerEntity,
      source: sourceSnapshot(block, parent),
      values: extracted.values,
      valueSources: extracted.valueSources,
      labels: extracted.labels,
    };
    const outList = harcsByEntityUid.get(ownerEntity.uid) ?? [];
    outList.push(harc);
    harcsByEntityUid.set(ownerEntity.uid, outList);

    const seenTargets = new Set();
    for (const val of extracted.values) {
      if (!val?.uid || val.text != null || seenTargets.has(val.uid)) continue;
      seenTargets.add(val.uid);
      const inList = harcsByTargetUid.get(val.uid) ?? [];
      inList.push({
        uid: harc.uid,
        attribute: harc.attribute,
        entity: ownerEntity,
        source: harc.source,
        valueSourceUids: extracted.valueSources.get(val.uid) ?? [],
        labels: harc.labels,
      });
      harcsByTargetUid.set(val.uid, inList);
    }
  }

  return {
    pagesByUid,
    pagesByTitle,
    blocksByUid,
    refsOfString,
    sourceSnapshot,
    harcsByEntityUid,
    harcsByTargetUid,
  };
}

function ensureReferencedPages(graph, string) {
  const index = buildIndex(graph);
  for (const token of scanRefs(string)) {
    if (token.type !== "page" || token.classTag) continue;
    const title = token.title.trim();
    if (!title || index.pagesByTitle.has(title)) continue;
    const now = Date.now();
    const uid = nextUid(graph);
    const created = { uid, title, editTime: now, createTime: now, children: [] };
    graph.pages.push(created);
    index.pagesByTitle.set(title, created);
    index.pagesByUid.set(uid, created);
  }
}

function normalizeOrders(children) {
  for (let i = 0; i < children.length; i += 1) {
    children[i].order = i;
  }
}

function insertAtOrder(children, block, order) {
  children.sort(byOrder);
  let index;
  if (order === "last" || order == null || !Number.isFinite(order) || order >= children.length) {
    index = children.length;
  } else if (order === "first" || order <= 0) {
    index = 0;
  } else {
    index = Math.floor(order);
  }
  children.splice(index, 0, block);
  normalizeOrders(children);
}

function collectPageUidsOnSnap(snap) {
  const uids = [];
  const seen = new Set();
  const add = (entity) => {
    if (typeof entity?.title !== "string" || typeof entity.uid !== "string" || !entity.uid || seen.has(entity.uid)) return;
    seen.add(entity.uid);
    uids.push(entity.uid);
  };
  for (const harc of snap.out ?? []) {
    for (const val of harc.values ?? []) add(val);
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

export function createFakeHost(graph = createGraph(), { lifecycle } = {}) {
  const calls = [];
  let watchState = null;
  let sidecar = null;
  let sidebarWindows = [];
  let currentMainUid = graph.defaultCenterUid ?? "p-alpha";
  let currentFocusedBlock = null;
  let alive = true;
  let queue = Promise.resolve();

  function record(name, args) {
    calls.push([name, ...args]);
  }

  function notifyWatch() {
    if (alive && typeof watchState?.onChange === "function") {
      watchState.onChange();
    }
  }

  function outlineTree(children, index) {
    return [...(children ?? [])]
      .sort(byOrder)
      .map((child) => ({
        uid: child.uid,
        string: child.string ?? "",
        order: child.order ?? 0,
        refs: index.refsOfString(child.string ?? ""),
        children: outlineTree(child.children, index),
      }));
  }

  function namespaceFor(page, index) {
    const title = page.title ?? "";
    const mark = title.lastIndexOf("/");
    const prefix = mark > 0 ? title.slice(0, mark) : "";
    const parentPage = prefix ? index.pagesByTitle.get(prefix) : null;
    const directChildren = (nsPrefix) => {
      const found = [];
      for (const candidate of graph.pages ?? []) {
        if (!candidate?.title?.startsWith(nsPrefix)) continue;
        const rest = candidate.title.slice(nsPrefix.length);
        if (!rest || rest.includes("/")) continue;
        found.push(pageEntity(candidate));
      }
      found.sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
      return found.slice(0, 200);
    };
    return {
      parent: parentPage ? pageEntity(parentPage) : null,
      children: directChildren(`${title}/`),
      siblings: parentPage ? directChildren(`${prefix}/`).filter((item) => item.uid !== page.uid) : [],
    };
  }

  function daysFor(uid, index) {
    const around = adjacentDayUids(uid);
    if (!around) return null;
    const prev = index.pagesByUid.get(around.previous);
    const next = index.pagesByUid.get(around.next);
    return {
      previous: prev ? pageEntity(prev) : null,
      next: next ? pageEntity(next) : null,
    };
  }

  function mentionsFor(targetUid, index) {
    const mentions = [];
    for (const { block, page } of index.blocksByUid.values()) {
      const refs = index.refsOfString(block.string ?? "");
      if (!refs.some((ref) => ref.uid === targetUid)) continue;
      mentions.push({
        uid: block.uid,
        string: block.string ?? "",
        page: pageEntity(page),
        refs,
      });
    }
    mentions.sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
    return mentions.slice(0, 500);
  }

  function peerFor(parentUid, index) {
    const incoming = (index.harcsByTargetUid.get(parentUid) ?? []).map((harc) => ({
      attribute: harc.attribute,
      entity: harc.entity,
    }));
    const outgoing = (index.harcsByEntityUid.get(parentUid) ?? []).flatMap((harc) => (
      (harc.values ?? []).map((value) => ({ attribute: harc.attribute, value }))
    ));
    return { parentUid, incoming, outgoing };
  }

  function aliasesFor(snap, index) {
    const aliases = {};
    for (const uid of collectPageUidsOnSnap(snap)) {
      const page = index.pagesByUid.get(uid);
      if (!page) continue;
      for (const child of [...(page.children ?? [])].sort(byOrder)) {
        const text = aliasFromBlock(child.string ?? "");
        if (text) {
          aliases[uid] = text;
          break;
        }
      }
    }
    return aliases;
  }

  function computeSnapshot(uid, modelSettings) {
    const index = buildIndex(graph);
    const page = index.pagesByUid.get(uid);
    const blockHit = page ? null : index.blocksByUid.get(uid);
    if (!page && !blockHit) {
      return { center: { uid, kind: "page", title: uid }, missing: true };
    }

    let center;
    let rawChildren;
    if (page) {
      center = { uid: page.uid, kind: "page", title: page.title };
      rawChildren = page.children;
    } else {
      const { block, parent, page: ownerPage } = blockHit;
      center = {
        uid: block.uid,
        kind: "block",
        string: block.string ?? "",
        page: pageEntity(ownerPage),
        parent: parent === ownerPage ? pageEntity(ownerPage) : blockEntity(parent),
        siblings: [...(parent.children ?? [])]
          .filter((sib) => sib.uid !== block.uid)
          .map(blockEntity)
          .sort(byOrder),
        refs: index.refsOfString(block.string ?? ""),
      };
      rawChildren = block.children;
    }

    const out = (index.harcsByEntityUid.get(uid) ?? []).map((harc) => ({
      uid: harc.uid,
      attribute: harc.attribute,
      source: harc.source,
      values: harc.values,
      labels: harc.labels,
    }));
    const inbound = index.harcsByTargetUid.get(uid) ?? [];

    const snap = {
      center,
      outline: outlineTree(rawChildren, index),
      out,
      in: inbound,
      mentions: mentionsFor(uid, index),
      namespace: center.kind === "page" ? namespaceFor(page, index) : null,
      days: center.kind === "page" ? daysFor(uid, index) : null,
      peers: [],
      aliases: {},
    };
    snap.peers = typedParentUids(snap, modelSettings).map((parentUid) => peerFor(parentUid, index));
    snap.aliases = aliasesFor(snap, index);
    return snap;
  }

  function executeOps(ops) {
    const applied = [];
    for (const op of ops) {
      if (!op || typeof op !== "object") throw new Error("Invalid op");
      if (op.string != null && FORBIDDEN.some((token) => String(op.string).includes(token))) {
        return { ok: false, reason: "forbidden" };
      }
    }
    for (const op of ops) {
      const index = buildIndex(graph);
      const now = Date.now();
      if (op.op === "update") {
        const hit = index.blocksByUid.get(op.uid);
        if (!hit) return { ok: false, reason: "missing" };
        hit.block.string = String(op.string ?? "");
        hit.block.editTime = now;
        ensureReferencedPages(graph, hit.block.string);
        applied.push({ ...op });
      } else if (op.op === "create") {
        const parent = index.pagesByUid.get(op.parentUid) ?? index.blocksByUid.get(op.parentUid)?.block;
        if (!parent) return { ok: false, reason: "missing" };
        if (!Array.isArray(parent.children)) parent.children = [];
        const uid = op.uid || nextUid(graph);
        const string = String(op.string ?? "");
        const block = {
          uid,
          string,
          order: 0,
          editTime: now,
          createTime: now,
          children: [],
        };
        insertAtOrder(parent.children, block, op.order);
        ensureReferencedPages(graph, string);
        applied.push({ ...op, uid });
      } else if (op.op === "move") {
        const hit = index.blocksByUid.get(op.uid);
        const dest = index.pagesByUid.get(op.parentUid) ?? index.blocksByUid.get(op.parentUid)?.block;
        if (!hit || !dest) return { ok: false, reason: "missing" };
        if (!Array.isArray(dest.children)) dest.children = [];
        hit.parent.children = (hit.parent.children ?? []).filter((item) => item.uid !== op.uid);
        normalizeOrders(hit.parent.children);
        hit.block.editTime = now;
        insertAtOrder(dest.children, hit.block, op.order);
        applied.push({ ...op });
      } else if (op.op === "delete") {
        const hit = index.blocksByUid.get(op.uid);
        if (!hit) return { ok: false, reason: "missing" };
        hit.parent.children = (hit.parent.children ?? []).filter((item) => item.uid !== op.uid);
        normalizeOrders(hit.parent.children);
        applied.push({ ...op });
      } else {
        return { ok: false, reason: `unknown-op:${String(op.op)}` };
      }
    }
    return { ok: true, ops: applied };
  }

  function checkGuards(guards) {
    if (!guards) return null;
    const index = buildIndex(graph);
    const list = Array.isArray(guards)
      ? guards
      : typeof guards === "object"
        ? Object.entries(guards).map(([uid, val]) => (
          val && typeof val === "object" ? { uid, ...val } : { uid, expectedString: val }
        ))
        : [];
    for (const guard of list) {
      if (!guard || typeof guard !== "object") continue;
      const uid = guard.uid ?? guard.sourceUid;
      if (typeof uid !== "string" || !uid) return "missing";
      const page = index.pagesByUid.get(uid);
      const blockHit = index.blocksByUid.get(uid);
      if (!page && !blockHit) return "missing";
      const expected = guard.expectedString !== undefined ? guard.expectedString : guard.string;
      if (expected != null) {
        if (!blockHit) return "missing";
        if (blockHit.block.string !== expected) return "changed";
      }
    }
    return null;
  }

  function enqueue(task) {
    const run = queue.then(task, task);
    queue = run.then(() => undefined, () => undefined);
    return run;
  }

  function snapshot(...args) {
    record("snapshot", args);
    const [uid, modelSettings] = args;
    return computeSnapshot(uid, modelSettings);
  }

  function watch(...args) {
    record("watch", args);
    const [uid, onChange] = args;
    watchState = uid && typeof onChange === "function" ? { uid, onChange } : null;
  }

  function unwatch(...args) {
    record("unwatch", args);
    watchState = null;
  }

  function titles(...args) {
    record("titles", args);
    return (graph.pages ?? []).map((page) => ({ uid: page.uid, title: page.title }));
  }

  function recents(...args) {
    record("recents", args);
    const index = buildIndex(graph);
    const pages = (graph.pages ?? [])
      .filter((page) => Number.isFinite(page.editTime) && Number.isFinite(page.createTime))
      .map((page) => ({
        uid: page.uid,
        title: page.title,
        editTime: page.editTime,
        createTime: page.createTime,
      }));
    const candidates = [];
    for (const { block } of index.blocksByUid.values()) {
      if (typeof block.string === "string" && block.string.includes("excalidraw") && Number.isFinite(block.editTime)) {
        candidates.push({
          uid: block.uid,
          editTime: block.editTime,
          title: drawingTitle(block.string) || "Drawing",
        });
      }
    }
    candidates.sort((a, b) => b.editTime - a.editTime);
    return { pages, drawings: candidates.slice(0, 8) };
  }

  async function openPageUid(...args) {
    record("openPageUid", args);
    if (currentMainUid) return currentMainUid;
    return formatDailyPage(new Date())?.uid ?? null;
  }

  async function mainUid(...args) {
    record("mainUid", args);
    return currentMainUid;
  }

  function focusedBlock(...args) {
    record("focusedBlock", args);
    return currentFocusedBlock;
  }

  async function openInSidebar(...args) {
    record("openInSidebar", args);
    const [uid, kind] = args;
    if (!uid) return;
    if (!sidebarWindows.some((item) => item["block-uid"] === uid)) {
      sidebarWindows.push({ type: kind === "block" ? "block" : "outline", "block-uid": uid });
    }
  }

  async function openInMain(...args) {
    record("openInMain", args);
    const [uid] = args;
    if (uid) currentMainUid = uid;
  }

  async function closeSidecarInternal() {
    const current = sidecar;
    sidecar = null;
    if (current?.owned) {
      sidebarWindows = sidebarWindows.filter((item) => item["block-uid"] !== current.uid);
    }
  }

  async function closeSidecar(...args) {
    record("closeSidecar", args);
    await closeSidecarInternal();
  }

  async function syncSidecar(...args) {
    record("syncSidecar", args);
    const [uid, enabled] = args;
    if (!alive) return;
    if (!enabled || !uid) {
      await closeSidecarInternal();
      return;
    }
    if (sidecar?.uid === uid) return;
    await closeSidecarInternal();
    if (sidebarWindows.some((item) => item["block-uid"] === uid)) {
      sidecar = { uid, owned: false };
      return;
    }
    sidebarWindows.push({ type: "outline", "block-uid": uid });
    sidecar = { uid, owned: true };
  }

  function releaseSidecar(...args) {
    record("releaseSidecar", args);
    sidecar = null;
  }

  function move(...args) {
    record("move", args);
    const [{ sourceUid, fromAttribute, toAttribute, value, expectedString } = {}] = args;
    return enqueue(async () => {
      const index = buildIndex(graph);
      const hit = index.blocksByUid.get(sourceUid);
      if (!hit) return { ok: false, reason: "missing" };
      const source = index.sourceSnapshot(hit.block, hit.parent);
      if (expectedString != null && source.string !== expectedString) return { ok: false, reason: "changed" };
      const newUid = nextUid(graph);
      const plan = planMove({ source, fromAttribute, toAttribute, value, newUid });
      if (!plan.ops.length) return { ok: false, reason: plan.reason };
      const applied = executeOps(plan.ops);
      if (!applied.ok) return applied;
      notifyWatch();
      return { ok: true, ops: applied.ops };
    });
  }

  function childCounts(...args) {
    record("childCounts", args);
    const [uids] = args;
    const list = Array.isArray(uids) ? uids.filter((uid) => typeof uid === "string" && uid) : [];
    if (!list.length) return {};
    const index = buildIndex(graph);
    const counts = {};
    for (const uid of list) {
      const entityNode = index.pagesByUid.get(uid) ?? index.blocksByUid.get(uid)?.block;
      counts[uid] = entityNode ? (entityNode.children?.length ?? 0) : 0;
    }
    return counts;
  }

  function crossRows(...args) {
    record("crossRows", args);
    const [uids] = args;
    const list = Array.isArray(uids) ? uids.filter((uid) => typeof uid === "string" && uid) : [];
    if (!list.length) return [];
    const index = buildIndex(graph);
    const rows = [];
    for (const suid of list) {
      const src = index.pagesByUid.get(suid) ?? index.blocksByUid.get(suid)?.block;
      if (!src) continue;
      for (const child of src.children ?? []) {
        for (const ref of index.refsOfString(child.string ?? "")) {
          rows.push([suid, ref.uid]);
        }
      }
    }
    return rows;
  }

  function findDrawingBlock(...args) {
    record("findDrawingBlock", args);
    const [title] = args;
    if (typeof title !== "string" || !title.trim()) return null;
    const index = buildIndex(graph);
    const page = index.pagesByTitle.get(`Drawings/${title}`);
    if (!page) return null;
    for (const child of [...(page.children ?? [])].sort(byOrder)) {
      const text = (child.string ?? "").trimStart();
      if (text.startsWith("{{[[plexus-region]]")) continue;
      if (text.startsWith("{{[[excalidraw]]}}") || text.startsWith("{{excalidraw}}")) return child.uid;
    }
    return null;
  }

  function writeZoneAttribute(...args) {
    record("writeZoneAttribute", args);
    const [{ centerUid, zone, title } = {}] = args;
    const attribute = ZONE_ATTR[zone];
    if (!attribute) return Promise.resolve({ ok: false, reason: "zone" });
    if (typeof centerUid !== "string" || !centerUid) return Promise.resolve({ ok: false, reason: "missing" });
    return enqueue(async () => {
      const index = buildIndex(graph);
      const center = index.pagesByUid.get(centerUid) ?? index.blocksByUid.get(centerUid)?.block;
      if (!center) return { ok: false, reason: "missing" };
      let existing = null;
      for (const child of [...(center.children ?? [])].sort(byOrder)) {
        const parsed = parseAttribute(child.string);
        if (parsed?.name === attribute) {
          existing = { uid: child.uid, string: child.string };
          break;
        }
      }
      const plan = planAttributeWrite({ attribute, title, existing });
      if (!plan.ops.length) return { ok: false, reason: plan.reason };
      const mapped = plan.ops.map((op) => (
        op.op === "create" ? { op: "create", string: op.string, parentUid: centerUid, order: "last" } : op
      ));
      const applied = executeOps(mapped);
      if (!applied.ok) return applied;
      notifyWatch();
      return { ok: true };
    });
  }

  function drawingRows(...args) {
    record("drawingRows", args);
    const [centreUid, refUids] = args;
    const wants = new Set();
    if (typeof centreUid === "string" && centreUid) wants.add(centreUid);
    for (const uid of refUids ?? []) {
      if (typeof uid === "string" && uid) wants.add(uid);
    }
    if (!wants.size) return [];
    const index = buildIndex(graph);
    const out = [];
    for (const { block } of index.blocksByUid.values()) {
      if (block.uid === centreUid || !(block.string ?? "").includes("excalidraw")) continue;
      const refs = index.refsOfString(block.string ?? "")
        .map((ref) => ref.uid)
        .filter((uid) => wants.has(uid));
      if (!refs.length) continue;
      out.push({
        uid: block.uid,
        refs,
        editTime: Number(block.editTime) || 0,
        title: block.uid,
      });
    }
    return out.slice(0, 80);
  }

  const menuApi = {
    async addCommand() {},
    async removeCommand() {},
  };

  function blockContextMenu(...args) {
    record("blockContextMenu", args);
    return menuApi;
  }

  function entity(...args) {
    record("entity", args);
    const [uid] = args;
    if (typeof uid !== "string" || !uid) return null;
    const index = buildIndex(graph);
    const page = index.pagesByUid.get(uid);
    if (page) return { uid: page.uid, kind: "page", title: page.title };
    const blockHit = index.blocksByUid.get(uid);
    if (!blockHit) return null;
    const raw = blockHit.block.string ?? "";
    const title = drawingTitle(raw, 90) ?? (plainText(raw, 90) || blockHit.block.uid);
    return { uid: blockHit.block.uid, kind: "block", title };
  }

  function pageByTitle(...args) {
    record("pageByTitle", args);
    const [title] = args;
    if (typeof title !== "string" || !title.trim()) return null;
    const index = buildIndex(graph);
    const found = index.pagesByTitle.get(title) ?? index.pagesByTitle.get(title.trim());
    return found ? { uid: found.uid, title: found.title } : null;
  }

  function createPage(...args) {
    record("createPage", args);
    const [title] = args;
    return enqueue(async () => {
      if (typeof title !== "string") return null;
      const clean = title.trim();
      if (!clean) return null;
      const index = buildIndex(graph);
      const existing = index.pagesByTitle.get(clean);
      if (existing) return existing.uid;
      const uid = nextUid(graph);
      const now = Date.now();
      graph.pages.push({
        uid,
        title: clean,
        editTime: now,
        createTime: now,
        children: [],
      });
      notifyWatch();
      return uid;
    });
  }

  function dailyPage(...args) {
    record("dailyPage", args);
    const [date] = args;
    return formatDailyPage(date ?? new Date());
  }

  function pageAttributes(...args) {
    record("pageAttributes", args);
    const [uids] = args;
    const list = Array.isArray(uids) ? uids.filter((uid) => typeof uid === "string" && uid) : [];
    if (!list.length) return {};
    const index = buildIndex(graph);
    const out = {};
    for (const uid of list) {
      out[uid] = {};
      if (!index.pagesByUid.has(uid)) continue;
      for (const harc of index.harcsByEntityUid.get(uid) ?? []) {
        const key = harc.attribute.toLowerCase();
        if (!out[uid][key]) out[uid][key] = { name: harc.attribute, values: [] };
        for (const val of harc.values ?? []) {
          if (typeof val?.title === "string") {
            out[uid][key].values.push({ uid: val.uid, title: val.title });
          } else if (val?.text != null) {
            out[uid][key].values.push({ text: String(val.text) });
          } else if (typeof val?.string === "string") {
            out[uid][key].values.push({ text: plainText(val.string, 90) || val.uid });
          }
        }
      }
    }
    return out;
  }

  function applyPlan(...args) {
    record("applyPlan", args);
    const [{ guards, ops } = {}] = args;
    return enqueue(async () => {
      const guardFailure = checkGuards(guards);
      if (guardFailure) return { ok: false, reason: guardFailure };
      if (!Array.isArray(ops)) return { ok: false, reason: "invalid" };
      const applied = executeOps(ops);
      if (!applied.ok) return applied;
      notifyWatch();
      return { ok: true, ops: applied.ops };
    });
  }

  if (lifecycle?.add) {
    lifecycle.add(() => closeSidecarInternal());
    lifecycle.add(() => { watchState = null; });
    lifecycle.add(() => { alive = false; });
  }

  return {
    calls,
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
    blockContextMenu,
    entity,
    pageByTitle,
    createPage,
    dailyPage,
    pageAttributes,
    applyPlan,
  };
}
