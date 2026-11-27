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

function element(names, dataset = {}, subs = []) {
  return {
    classList: classes(names),
    dataset: typeof dataset === "string" ? { uid: dataset } : { ...dataset },
    style: { left: "10px" },
    querySelectorAll(selector) {
      if (selector === ".compass-sub") return subs;
      return [];
    },
  };
}

function scene(extra = []) {
  const center = element(["compass-node", "compass-node-center"], "center");
  const neighbour = element(["compass-node"], "north");
  const other = element(["compass-node"], "south");
  const northEdge = element(["compass-edge"], "north");
  const southEdge = element(["compass-edge"], "south");
  const all = [center, neighbour, other, northEdge, southEdge, ...extra];
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

test("a neighbour hover keeps itself and the center lit, dims unrelated nodes, and marks edges", () => {
  const { root, center, neighbour, other, northEdge, southEdge } = scene();
  markHover(root, neighbour);
  assert.equal(root.classList.contains("compass-dimming"), true);
  assert.equal(neighbour.classList.contains("compass-node-hot"), true);
  assert.equal(neighbour.classList.contains("compass-node-dim"), false);
  assert.equal(center.classList.contains("compass-node-hot"), true);
  assert.equal(center.classList.contains("compass-node-dim"), false);
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

test("hovering the center dims nothing and clears all hover marks", () => {
  const { root, center, neighbour, other, northEdge, southEdge, all } = scene();
  markHover(root, neighbour);
  markHover(root, center);
  assert.equal(root.classList.contains("compass-dimming"), false);
  for (const item of all) {
    assert.equal(item.classList.contains("compass-node-hot"), false);
    assert.equal(item.classList.contains("compass-node-dim"), false);
    assert.equal(item.classList.contains("compass-edge-hot"), false);
    assert.equal(item.classList.contains("compass-edge-dim"), false);
  }
  assert.equal(center.style.left, "10px");
  assert.equal(other.classList.contains("compass-node-dim"), false);
  assert.equal(northEdge.classList.contains("compass-edge-dim"), false);
  assert.equal(southEdge.classList.contains("compass-edge-dim"), false);
});

test("hovering a node keeps cross-edge peers lit in either direction", () => {
  const peerOut = element(["compass-node"], "west");
  const peerIn = element(["compass-node"], "east");
  const crossOut = element(["compass-edge", "compass-cross"], { source: "north", target: "west" });
  const crossIn = element(["compass-edge", "compass-cross"], { source: "east", target: "north" });
  const { root, center, neighbour, other } = scene([peerOut, peerIn, crossOut, crossIn]);

  markHover(root, neighbour);
  assert.equal(root.classList.contains("compass-dimming"), true);
  assert.equal(neighbour.classList.contains("compass-node-hot"), true);
  assert.equal(center.classList.contains("compass-node-hot"), true);
  assert.equal(peerOut.classList.contains("compass-node-hot"), true);
  assert.equal(peerOut.classList.contains("compass-node-dim"), false);
  assert.equal(peerIn.classList.contains("compass-node-hot"), true);
  assert.equal(peerIn.classList.contains("compass-node-dim"), false);
  assert.equal(other.classList.contains("compass-node-dim"), true);
  assert.equal(other.classList.contains("compass-node-hot"), false);
});

test("hovering a node in Expanded keeps its children and its parent lit", () => {
  const childNode = element(["compass-node"], "child-1");
  const parentNode = element(["compass-node", "compass-node-expanded"], "parent-1", [
    { dataset: { uid: "child-1" } },
  ]);
  const { root, other } = scene([parentNode, childNode]);

  markHover(root, parentNode);
  assert.equal(parentNode.classList.contains("compass-node-hot"), true);
  assert.equal(childNode.classList.contains("compass-node-hot"), true);
  assert.equal(childNode.classList.contains("compass-node-dim"), false);
  assert.equal(other.classList.contains("compass-node-dim"), true);

  markHover(root, childNode);
  assert.equal(childNode.classList.contains("compass-node-hot"), true);
  assert.equal(parentNode.classList.contains("compass-node-hot"), true);
  assert.equal(parentNode.classList.contains("compass-node-dim"), false);
  assert.equal(other.classList.contains("compass-node-dim"), true);
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
