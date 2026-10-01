// Dim unrelated marks while a node is hovered. The center card keeps every edge hot.
const MARKS = ["compass-node-hot", "compass-node-dim", "compass-edge-hot", "compass-edge-dim"];

function visit(root, selector, apply) {
  for (const element of root?.querySelectorAll?.(selector) ?? []) apply(element);
}

function clearElement(element) {
  for (const name of MARKS) element.classList.toggle(name, false);
}

export function markHover(root, node) {
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
