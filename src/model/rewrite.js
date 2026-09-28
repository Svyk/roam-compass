import { isReadOnlyAttribute } from "./neighborhood.js";
import { parseAttribute, refMarkup, removeToken, scanRefs, tailShape, tokenMatches } from "./text.js";

const FORBIDDEN = [":harc", ":entity/attrs", ":attr/proxy"];

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

// Move one value of a Name:: block to another attribute. The source block is the only
// thing rewritten: a sole value renames the attribute in place; one of several values
// is split out into a new attribute block right after the source.
//
// source: freshly pulled { uid, string, order, parentUid, children: [{ uid, string, order }] }
// value:  { uid, title? } — the page or block being moved
export function planMove({ source, fromAttribute, toAttribute, value, newUid }) {
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
    const token = shape.values.find((item) => tokenMatches(item, value));
    if (!token) return refused("missing-value");
    if (shape.values.length === 1) return safe([{ op: "update", uid: source.uid, string: renamed }]);
    if (!after.parentUid) return refused("no-parent");
    const offset = parsed.prefix.length;
    const shifted = { ...token, start: token.start + offset, end: token.end + offset };
    return safe([
      { op: "update", uid: source.uid, string: removeToken(source.string, shifted) },
      { op: "create", parentUid: after.parentUid, order: after.order, uid: newUid, string: `${name}:: ${refMarkup(value)}` },
    ]);
  }

  if (shape.kind !== "bare") return refused("text-value");
  const children = [...(source.children ?? [])]
    .filter((child) => child?.uid)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const values = children.filter((child) => !parseAttribute(child.string));
  const holder = values.find((child) => (
    child.uid === value?.uid || refsIn(child.string).some((item) => tokenMatches(item, value))
  ));
  if (!holder) return refused("missing-value");
  if (values.length === 1) return safe([{ op: "update", uid: source.uid, string: renamed }]);
  if (!after.parentUid) return refused("no-parent");
  const holderRefs = refsIn(holder.string);
  if (holder.uid === value?.uid || holderRefs.length <= 1) {
    return safe([
      { op: "create", parentUid: after.parentUid, order: after.order, uid: newUid, string: `${name}::` },
      { op: "move", uid: holder.uid, parentUid: newUid, order: 0 },
    ]);
  }
  const token = scanRefs(holder.string, { nested: false }).find((item) => tokenMatches(item, value));
  return safe([
    { op: "update", uid: holder.uid, string: removeToken(holder.string, token) },
    { op: "create", parentUid: after.parentUid, order: after.order, uid: newUid, string: `${name}:: ${refMarkup(value)}` },
  ]);
}
