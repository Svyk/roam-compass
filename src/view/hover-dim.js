// Dim unrelated marks while a neighbor node is hovered. Hovering the center dims nothing.
const MARKS = ["compass-node-hot", "compass-node-dim", "compass-edge-hot", "compass-edge-dim"];

function visit(root, selector, apply) {
  for (const element of root?.querySelectorAll?.(selector) ?? []) apply(element);
}

function clearElement(element) {
  for (const name of MARKS) element.classList.toggle(name, false);
}

function hasSubUid(element, uid) {
  if (!uid || typeof element?.querySelectorAll !== "function") return false;
  for (const sub of element.querySelectorAll(".compass-sub")) {
    if (sub?.dataset?.uid === uid) return true;
  }
  return false;
}

export function markHover(root, node) {
  const uid = node?.dataset?.uid;
  const center = Boolean(node?.classList?.contains?.("compass-node-center"));
  if (!uid || center) {
    root?.classList.toggle("compass-dimming", false);
    visit(root, ".compass-node", clearElement);
    visit(root, ".compass-edge", clearElement);
    return;
  }

  const litUids = new Set([uid]);
  visit(root, ".compass-cross", (edge) => {
    const source = edge?.dataset?.source;
    const target = edge?.dataset?.target;
    if (source === uid && target) litUids.add(target);
    if (target === uid && source) litUids.add(source);
  });
  if (typeof node.querySelectorAll === "function") {
    for (const sub of node.querySelectorAll(".compass-sub")) {
      if (sub?.dataset?.uid) litUids.add(sub.dataset.uid);
    }
  }

  root?.classList.toggle("compass-dimming", true);
  visit(root, ".compass-node", (element) => {
    const lit = element === node
      || element.classList.contains("compass-node-center")
      || litUids.has(element.dataset?.uid)
      || hasSubUid(element, uid);
    element.classList.toggle("compass-node-hot", lit);
    element.classList.toggle("compass-node-dim", !lit);
  });
  visit(root, ".compass-edge", (element) => {
    const hot = element.dataset?.uid === uid;
    element.classList.toggle("compass-edge-hot", hot);
    element.classList.toggle("compass-edge-dim", !hot);
  });
}
