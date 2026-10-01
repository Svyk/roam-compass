import assert from "node:assert/strict";
import test from "node:test";

import { markHover } from "../src/view/hover-dim.js";

function classes(initial = []) {
  const names = new Set(initial);
  return {
    toggle(name, on) {
      if (on) names.add(name);
      else names.delete(name);
    },
    contains(name) {
      return names.has(name);
    },
  };
}

function element(names, uid) {
  return {
    classList: classes(names),
    dataset: { uid },
    style: { left: "10px" },
  };
}

function scene() {
  const center = element(["compass-node", "compass-node-center"], "center");
  const neighbour = element(["compass-node"], "north");
  const other = element(["compass-node"], "south");
  const northEdge = element(["compass-edge"], "north");
  const southEdge = element(["compass-edge"], "south");
  const all = [center, neighbour, other, northEdge, southEdge];
  const root = {
    classList: classes(["compass-root"]),
    dataset: {},
    style: { left: "10px" },
    querySelectorAll(selector) {
      const wanted = selector.split(",").map((part) => part.trim().replace(/^\./, ""));
      return all.filter((item) => wanted.some((name) => item.classList.contains(name)));
    },
  };
  return { root, center, neighbour, other, northEdge, southEdge, all };
}

test("a neighbour hover marks that edge hot, the other edge dim, and style.left stays \"10px\"", () => {
  const { root, center, neighbour, other, northEdge, southEdge } = scene();
  markHover(root, neighbour);
  assert.equal(root.classList.contains("compass-dimming"), true);
  assert.equal(neighbour.classList.contains("compass-node-hot"), true);
  assert.equal(neighbour.classList.contains("compass-node-dim"), false);
  assert.equal(center.classList.contains("compass-node-dim"), true);
  assert.equal(center.classList.contains("compass-node-hot"), false);
  assert.equal(other.classList.contains("compass-node-dim"), true);
  assert.equal(other.classList.contains("compass-node-hot"), false);
  assert.equal(northEdge.classList.contains("compass-edge-hot"), true);
  assert.equal(northEdge.classList.contains("compass-edge-dim"), false);
  assert.equal(southEdge.classList.contains("compass-edge-hot"), false);
  assert.equal(southEdge.classList.contains("compass-edge-dim"), true);
  assert.equal(neighbour.style.left, "10px");
  assert.equal(northEdge.style.left, "10px");
  assert.equal(southEdge.style.left, "10px");
  assert.equal(neighbour.style.top, undefined);
  assert.equal(neighbour.style.transform, undefined);
});

test("a center hover marks every edge hot", () => {
  const { root, center, neighbour, northEdge, southEdge } = scene();
  markHover(root, neighbour);
  markHover(root, center);
  assert.equal(northEdge.classList.contains("compass-edge-hot"), true);
  assert.equal(southEdge.classList.contains("compass-edge-hot"), true);
  assert.equal(northEdge.classList.contains("compass-edge-dim"), false);
  assert.equal(southEdge.classList.contains("compass-edge-dim"), false);
  assert.equal(center.classList.contains("compass-node-hot"), true);
  assert.equal(center.classList.contains("compass-node-dim"), false);
  assert.equal(neighbour.classList.contains("compass-node-dim"), true);
  assert.equal(neighbour.classList.contains("compass-node-hot"), false);
  assert.equal(center.style.left, "10px");
});

test("markHover(root, null) clears the classes and removes compass-dimming", () => {
  const { root, all, neighbour } = scene();
  markHover(root, neighbour);
  markHover(root, null);
  assert.equal(root.classList.contains("compass-dimming"), false);
  for (const item of all) {
    assert.equal(item.classList.contains("compass-node-hot"), false);
    assert.equal(item.classList.contains("compass-node-dim"), false);
    assert.equal(item.classList.contains("compass-edge-hot"), false);
    assert.equal(item.classList.contains("compass-edge-dim"), false);
  }
  markHover(root, neighbour);
  markHover(root, {});
  assert.equal(root.classList.contains("compass-dimming"), false);
  for (const item of all) {
    assert.equal(item.classList.contains("compass-node-hot"), false);
    assert.equal(item.classList.contains("compass-node-dim"), false);
    assert.equal(item.classList.contains("compass-edge-hot"), false);
    assert.equal(item.classList.contains("compass-edge-dim"), false);
  }
});
