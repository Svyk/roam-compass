import { isReadOnlyAttribute } from "./neighborhood.js";
import { parseAttribute, plainText, removeToken, scanRefs, tailShape, tokenMatches } from "./text.js";

const FORBIDDEN = [":harc", ":entity/attrs", ":attr/proxy"];

function same(a, b) {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

function hasForbidden(ops) {
  return ops.some((op) => FORBIDDEN.some((token) => String(op?.string ?? "").includes(token)));
}

function unlinkRefused(reason) {
  return { ops: [], reason, removesBlock: false, removesLabels: 0 };
}

function safeUnlink(ops, removesBlock, removesLabels = 0) {
  if (hasForbidden(ops)) return unlinkRefused("forbidden");
  return {
    ops,
    reason: null,
    removesBlock: Boolean(removesBlock),
    removesLabels: removesBlock ? removesLabels : 0,
  };
}

function flipRefused(reason) {
  return { ops: [], reason, guards: [] };
}

function safeFlip(ops, guards) {
  if (hasForbidden(ops)) return flipRefused("forbidden");
  return { ops, reason: null, guards };
}

function refsIn(string) {
  const shape = tailShape(string);
  return shape.kind === "refs" ? shape.values : [];
}

function childCountOf(block) {
  if (Number.isFinite(block?.childCount) && block.childCount >= 0) return Math.floor(block.childCount);
  if (Array.isArray(block?.children)) return block.children.filter((child) => child?.uid).length;
  return 0;
}

function isRelationLabel(child) {
  return Boolean(parseAttribute(child?.string)) && childCountOf(child) === 0;
}

function isPageEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== "object") return false;
  if (endpoint.kind != null && endpoint.kind !== "page") return false;
  if (typeof endpoint.uid !== "string" || !endpoint.uid) return false;
  if (typeof endpoint.title !== "string" || !endpoint.title.trim()) return false;
  if (endpoint.title.includes("[") || endpoint.title.includes("]")) return false;
  return true;
}

export function planUnlink({ source, attribute, value } = {}) {
  if (!source?.uid || typeof source.string !== "string") return unlinkRefused("missing");
  const parsed = parseAttribute(source.string);
  if (!parsed || !same(parsed.name, attribute)) return unlinkRefused("changed");
  if (isReadOnlyAttribute(parsed.name)) return unlinkRefused("read-only");
  const shape = tailShape(parsed.tail);
  const children = [...(source.children ?? [])]
    .filter((child) => child?.uid)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (shape.kind === "refs") {
    const token = shape.values.find((item) => tokenMatches(item, value));
    if (!token) return unlinkRefused("missing-value");
    if (shape.values.length === 1) {
      if (!children.every(isRelationLabel)) return unlinkRefused("has-children");
      return safeUnlink([{ op: "delete", uid: source.uid }], true, children.length);
    }
    const offset = parsed.prefix.length;
    const shifted = { ...token, start: token.start + offset, end: token.end + offset };
    return safeUnlink([{ op: "update", uid: source.uid, string: removeToken(source.string, shifted) }], false, 0);
  }

  if (shape.kind !== "bare") return unlinkRefused("text-value");
  const values = children.filter((child) => !parseAttribute(child.string));
  const holder = values.find((child) => (
    child.uid === value?.uid || refsIn(child.string).some((item) => tokenMatches(item, value))
  ));
  if (!holder) return unlinkRefused("missing-value");
  const holderRefs = refsIn(holder.string);
  if (holder.uid !== value?.uid && holderRefs.length > 1) {
    const token = scanRefs(holder.string, { nested: false }).find((item) => tokenMatches(item, value));
    return safeUnlink([{ op: "update", uid: holder.uid, string: removeToken(holder.string, token) }], false, 0);
  }
  if (childCountOf(holder) > 0) return unlinkRefused("has-children");
  if (values.length === 1) {
    const rest = children.filter((child) => child.uid !== holder.uid);
    if (!rest.every(isRelationLabel)) return unlinkRefused("has-children");
    return safeUnlink([{ op: "delete", uid: source.uid }], true, rest.length);
  }
  return safeUnlink([{ op: "delete", uid: holder.uid }], false, 0);
}

export function planFlipOwner({ source, attribute, owner, value, inverse, target } = {}) {
  if (!isPageEndpoint(owner) || !isPageEndpoint(value)) return flipRefused("not-pages");
  const inverseName = typeof inverse === "string" ? inverse.trim() : "";
  if (!inverseName || inverseName.includes("::") || /[[\]\n]/.test(inverseName)) {
    return flipRefused("no-attribute");
  }
  if (isReadOnlyAttribute(attribute) || isReadOnlyAttribute(inverseName)) {
    return flipRefused("read-only");
  }

  const writeOps = [];
  if (target != null) {
    if (!target?.uid || typeof target.string !== "string") return flipRefused("changed");
    const targetParsed = parseAttribute(target.string);
    if (!targetParsed || !same(targetParsed.name, inverseName)) return flipRefused("changed");
    const targetShape = tailShape(targetParsed.tail);
    if (targetShape.kind === "text") return flipRefused("target-text");
    if (targetShape.kind === "refs") {
      const hasOwner = targetShape.values.some((token) => tokenMatches(token, owner));
      if (!hasOwner) {
        writeOps.push({
          op: "update",
          uid: target.uid,
          string: `${target.string.replace(/[ \t]+$/, "")} [[${owner.title}]]`,
        });
      }
    } else {
      const targetChildren = Array.isArray(target.children) ? target.children : [];
      const hasOwner = targetChildren.some((child) => (
        child?.uid === owner.uid
        || (!parseAttribute(child?.string) && refsIn(child?.string).some((token) => tokenMatches(token, owner)))
      ));
      if (!hasOwner) {
        writeOps.push({
          op: "create",
          parentUid: target.uid,
          order: "last",
          string: `[[${owner.title}]]`,
        });
      }
    }
  } else {
    writeOps.push({
      op: "create",
      parentUid: value.uid,
      order: "last",
      string: `${inverseName}:: [[${owner.title}]]`,
    });
  }

  const unlink = planUnlink({ source, attribute, value });
  if (unlink.reason) return flipRefused(unlink.reason);

  const guards = [{ uid: source.uid, string: source.string }];
  if (target && target.uid !== source.uid) {
    guards.push({ uid: target.uid, string: target.string });
  }
  return safeFlip([...writeOps, ...unlink.ops], guards);
}

function formatEndpoint(endpoint) {
  const isBlock = endpoint?.kind === "block"
    || (endpoint?.kind !== "page" && !(typeof endpoint?.title === "string" && endpoint.title));
  if (isBlock) {
    const raw = typeof endpoint?.string === "string" && endpoint.string
      ? endpoint.string
      : (endpoint?.title ?? endpoint?.uid ?? "");
    const text = plainText(raw) || String(endpoint?.uid ?? "");
    return `"${text}"`;
  }
  return `[[${endpoint.title}]]`;
}

export function describeRelation({ owner, attribute, value } = {}) {
  return `${formatEndpoint(owner)} — ${String(attribute ?? "").trim()}:: ${formatEndpoint(value)}`;
}
