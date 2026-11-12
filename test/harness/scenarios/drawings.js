const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function tinyBlob() {
  const binary = atob(TINY_PNG);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

function blockStringIndex(graph) {
  const map = new Map();
  const walk = (block) => {
    if (!block || typeof block.uid !== "string") return;
    if (typeof block.string === "string") map.set(block.uid, block.string);
    for (const child of block.children || []) walk(child);
  };
  for (const page of graph.pages || []) {
    for (const child of page.children || []) walk(child);
  }
  return map;
}

function installBlockStrings(h) {
  const host = h.harness.host;
  host.blockStrings = (uids) => {
    if (!Array.isArray(uids)) return {};
    const map = blockStringIndex(h.harness.graph);
    const out = {};
    const seen = new Set();
    for (const uid of uids) {
      if (typeof uid !== "string" || !uid || seen.has(uid)) continue;
      seen.add(uid);
      if (seen.size > 50) break;
      if (!map.has(uid)) continue;
      out[uid] = map.get(uid);
    }
    return out;
  };
}

function isDrawingString(string) {
  return /^\{\{\s*(\[\[excalidraw\]\]|excalidraw)\s*\}\}/.test(String(string ?? "").trimStart());
}

function installPlexus(h, { whenOpen } = {}) {
  const calls = [];
  let boxCount = 0;
  const api = {
    apiVersion: 7,
    calls,
    async create({ parentUid, order } = {}) {
      const uid = h.harness.graph.addBlock(parentUid, "{{[[excalidraw]]}}", { order: order ?? "last" });
      calls.push({ method: "create", parentUid, order, uid });
      return { uid };
    },
    async whenOpen(uid, opts) {
      calls.push({ method: "whenOpen", uid, opts });
      if (whenOpen) return whenOpen(uid, opts);
      return {};
    },
    build() {
      calls.push({ method: "build" });
      boxCount = 0;
      return {
        style(patch) {
          calls.push({ method: "style", patch });
        },
        box(text, opts) {
          boxCount += 1;
          const id = `b${boxCount}`;
          calls.push({ method: "box", id, text, opts });
          return id;
        },
        frame(x, y, w, h, opts) {
          boxCount += 1;
          const id = `b${boxCount}`;
          calls.push({ method: "frame", id, x, y, w, h, opts });
          return id;
        },
        arrow(fromId, toId, opts) {
          boxCount += 1;
          const id = `b${boxCount}`;
          calls.push({ method: "arrow", id, fromId, toId, opts });
          return id;
        },
        commit(uid) {
          calls.push({ method: "commit", uid });
          return [];
        },
      };
    },
    drawingsOn(pageUid) {
      const page = (h.harness.graph.pages || []).find((item) => item.uid === pageUid);
      if (!page) return [];
      return (page.children || [])
        .filter((child) => isDrawingString(child.string))
        .map((child) => child.uid);
    },
    thumbnail() {
      return Promise.resolve(tinyBlob());
    },
  };
  window.RoamPlexus = api;
  return api;
}

function boxesOverlap(a, b) {
  const ax2 = a.opts.x + a.opts.width;
  const ay2 = a.opts.y + a.opts.height;
  const bx2 = b.opts.x + b.opts.width;
  const by2 = b.opts.y + b.opts.height;
  const iw = Math.min(ax2, bx2) - Math.max(a.opts.x, b.opts.x);
  const ih = Math.min(ay2, by2) - Math.max(a.opts.y, b.opts.y);
  return iw > 0.5 && ih > 0.5;
}

async function openDrawDialog(h) {
  h.click(".compass-more");
  await h.wait(40);
  const item = h.q('[data-command="draw-map"]');
  h.assert(Boolean(item), "Draw this map is listed");
  h.click(item);
  await h.wait(40);
  const dialog = h.q(".compass-draw-dialog");
  h.assert(Boolean(dialog) && dialog.closest(".compass-root"), "confirm dialog is inside Compass");
  h.assert(dialog.getAttribute("role") === "dialog", "dialog role");
  h.assert(!h.q(".compass-draw-backdrop").hidden, "dialog is open");
}

function recorded(api, method) {
  return api.calls.filter((call) => call.method === method);
}

function drawingNodes(h) {
  return h.qa(".compass-node[data-zone='south']").filter((node) => (
    (node.getAttribute("aria-label") || "").includes("Drawing on this page")
  ));
}

export const SCENARIOS = {
  "draw-map": async (h) => {
    const api = installPlexus(h);
    installBlockStrings(h);
    await h.open("p-alpha");
    const drawn = h.qa(".compass-node:not(.compass-fade)").length;
    await openDrawDialog(h);
    h.assert(h.q(".compass-draw-links")?.checked === true, "Write page links starts checked");
    h.assert(
      (h.text(".compass-draw-summary") || "").includes("[[Project Alpha]]"),
      "summary names the center page",
    );
    h.click(".compass-draw-go");
    await h.wait(80);
    const created = recorded(api, "create");
    h.equal(created.length, 1, "create once");
    h.equal(created[0].parentUid, "p-alpha", "create parent");
    h.equal(created[0].order, "last", "create order");
    const opened = recorded(api, "whenOpen");
    h.equal(opened.length, 1, "whenOpen once");
    h.equal(opened[0].uid, created[0].uid, "whenOpen uid");
    h.equal(opened[0].opts?.timeoutMs, 15000, "whenOpen timeout");
    const boxes = recorded(api, "box");
    h.equal(boxes.length, drawn, "one box per drawn node plus the center");
    h.assert(boxes.some((box) => box.text === "[[Project Alpha]]" && box.opts?.strokeWidth === 2), "center box");
    const arrows = recorded(api, "arrow");
    h.assert(
      arrows.some((arrow) => String(arrow.opts?.label || "").includes("Owner · Role: Lead")),
      "owner arrow label",
    );
    const commits = recorded(api, "commit");
    h.equal(commits.length, 1, "commit once");
    h.equal(commits[0].uid, created[0].uid, "commit uid");
    h.equal(h.q(".compass-root").hidden, true, "Compass closed");
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        h.assert(!boxesOverlap(boxes[i], boxes[j]), `boxes ${boxes[i].text} and ${boxes[j].text} overlap`);
      }
    }
    await h.open("p-alpha");
    await openDrawDialog(h);
    h.equal(recorded(api, "create").length, 1, "reopening the dialog does not draw again");
  },

  "draw-map-plain": async (h) => {
    const api = installPlexus(h);
    installBlockStrings(h);
    await h.open("p-alpha");
    await openDrawDialog(h);
    h.click(".compass-draw-links");
    h.assert(h.q(".compass-draw-links")?.checked === false, "Write page links unchecked");
    h.click(".compass-draw-go");
    await h.wait(80);
    const boxes = recorded(api, "box");
    h.assert(boxes.length > 0, "boxes were drawn");
    h.assert(boxes.every((box) => !String(box.text).includes("[[")), "no page-link markup");
  },

  "draw-map-mindmap": async (h) => {
    const api = installPlexus(h);
    installBlockStrings(h);
    await h.open("p-alpha");
    await h.features("views").set("mindmap");
    await h.wait(200);
    await openDrawDialog(h);
    h.click(".compass-draw-go");
    await h.wait(80);
    const boxes = recorded(api, "box");
    const idFor = (text) => boxes.find((box) => box.text === text)?.id;
    const alpha = idFor("[[Project Alpha]]");
    const task = idFor("[[Task One]]");
    const sub = idFor("[[Subtask A]]");
    h.assert(Boolean(alpha && task && sub), "mind map boxes include the tree");
    const arrows = recorded(api, "arrow");
    h.assert(arrows.some((arrow) => arrow.fromId === alpha && arrow.toId === task), "Project Alpha → Task One");
    h.assert(arrows.some((arrow) => arrow.fromId === task && arrow.toId === sub), "Task One → Subtask A");
  },

  "draw-map-facets": async (h) => {
    const api = installPlexus(h);
    installBlockStrings(h);
    await h.open("p-alpha");
    await h.features("views").set("facets", "roles");
    await h.wait(250);
    const names = h.qa('[data-paint="region"]').map((region) => (
      region.querySelector(".compass-region-name")?.textContent?.trim() || ""
    )).filter(Boolean);
    h.assert(names.length > 0, "facet regions are on screen");
    await openDrawDialog(h);
    h.click(".compass-draw-go");
    await h.wait(80);
    const frames = recorded(api, "frame");
    h.equal(frames.length, names.length, "one frame per region");
    const frameNames = frames.map((frame) => frame.opts?.name);
    for (const name of names) {
      h.assert(frameNames.includes(name), `frame named ${name}`);
    }
    for (const role of ["Parents", "Children", "Friends", "Challengers", "Siblings"]) {
      h.assert(frameNames.includes(role), `roles frame ${role}`);
    }
  },

  "drawings-on-page": async (h) => {
    const api = installPlexus(h);
    installBlockStrings(h);
    h.harness.graph.addBlock(
      "p-alpha",
      "{{[[excalidraw]]}} Text elements in drawing: Map;",
      { uid: "draw-map-1" },
    );
    h.harness.graph.addBlock(
      "p-alpha",
      "{{[[excalidraw]]}} Text elements in drawing: Notes;",
      { uid: "draw-notes-1" },
    );
    h.equal(api.drawingsOn("p-alpha").length, 2, "fixture drawings");
    await h.open("p-alpha");
    await h.wait(250);
    let nodes = drawingNodes(h);
    h.equal(nodes.length, 2, "two drawing nodes");
    h.assert(nodes.every((node) => node.dataset.zone === "south"), "drawing nodes sit south");
    h.assert(nodes.every((node) => node.querySelector(".compass-node-thumb")), "drawing nodes have thumbnails");
    const titles = nodes.map((node) => node.querySelector(".compass-node-title")?.textContent?.trim());
    h.assert(titles.includes("Drawing: Map") && titles.includes("Drawing: Notes"), "drawing titles");
    const uid = nodes[0].dataset.uid;
    h.click(nodes[0]);
    await h.wait(500);
    h.equal(h.q(".compass-node-center")?.dataset.uid, uid, "clicking a drawing centers it");
    await h.open("p-alpha");
    await h.wait(200);
    nodes = drawingNodes(h);
    h.equal(nodes.length, 2, "back on the page with both drawings");
    h.assert(nodes.every((node) => node.querySelector(".compass-node-thumb")), "thumbnails still shown");
  },

  "draw-map-errors": async (h) => {
    const api = installPlexus(h, {
      whenOpen() {
        throw new Error("Timed out");
      },
    });
    installBlockStrings(h);
    const wrapped = console.error;
    const logged = [];
    console.error = (...args) => {
      const text = args.map((item) => (item instanceof Error ? item.message : String(item))).join(" ");
      if (text.includes("[compass]")) {
        logged.push(text);
        return;
      }
      wrapped(...args);
    };
    try {
      await h.open("p-alpha");
      await openDrawDialog(h);
      h.click(".compass-draw-go");
      await h.wait(80);
      h.equal(
        h.status(),
        "The new drawing is on [[Project Alpha]], but it did not open. Open it and run Draw this map again.",
        "whenOpen failure status",
      );
      h.assert(logged.some((line) => line.includes("[compass]")), "failure is logged with [compass]");
      const page = h.harness.graph.pages.find((item) => item.uid === "p-alpha");
      const drawings = (page?.children || []).filter((child) => isDrawingString(child.string));
      h.assert(drawings.length >= 1, "the new drawing block is kept");
      h.equal(recorded(api, "create").length, 1, "create still ran");
      h.equal(recorded(api, "commit").length, 0, "commit did not run");
      h.equal(h.q(".compass-root").hidden, true, "Compass stays closed");
    } finally {
      console.error = wrapped;
    }
  },
};
