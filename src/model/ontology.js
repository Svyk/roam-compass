const ROLES = ["parent", "child", "friend", "challenger", "previous", "next"];

const INVERSE = Object.freeze({
  parent: "child",
  child: "parent",
  friend: "friend",
  challenger: "challenger",
  previous: "next",
  next: "previous",
});

const READ_ONLY = [/^BT_attr/i, /^aliases$/i, /^roam\//i];

function sameName(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}

function isReadOnly(name) {
  return READ_ONLY.some((pattern) => pattern.test(String(name ?? "")));
}

function isWritableName(name) {
  if (typeof name !== "string") return false;
  const clean = name.trim();
  if (!clean || clean.includes("::") || /[[\]\n]/.test(clean) || isReadOnly(clean)) return false;
  return true;
}

export function parseRoleList(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  const names = [];
  const pairs = [];
  const seen = new Set();

  for (const item of raw) {
    const sides = String(item ?? "")
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!sides.length) continue;
    const name = sides[0];
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (sides.length >= 2) {
      pairs.push([name, sides[1]]);
    }
  }

  return { names, pairs };
}

export function buildOntology(rawLists = {}) {
  const parsed = {};
  const lists = {};
  for (const role of ROLES) {
    parsed[role] = parseRoleList(rawLists?.[role]);
    lists[role] = [...parsed[role].names];
  }

  const pairs = new Map();
  const addPair = (left, right) => {
    const lk = left.toLowerCase();
    const rk = right.toLowerCase();
    if (pairs.has(lk) || pairs.has(rk)) return false;
    if (lk === rk) {
      pairs.set(lk, left);
      return true;
    }
    pairs.set(lk, right);
    pairs.set(rk, left);
    return true;
  };

  for (const role of ROLES) {
    const inverse = INVERSE[role];
    for (const [name, partner] of parsed[role].pairs) {
      if (addPair(name, partner) && !lists[inverse].some((item) => sameName(item, partner))) {
        lists[inverse].push(partner);
      }
    }
  }

  const builtins = [
    ["parent", "Parent", "child", "Child"],
    ["previous", "Previous", "next", "Next"],
  ];
  for (const [leftRole, leftDefault, rightRole, rightDefault] of builtins) {
    const leftName = lists[leftRole].find((item) => sameName(item, leftDefault));
    const rightName = lists[rightRole].find((item) => sameName(item, rightDefault));
    if (leftName && rightName) addPair(leftName, rightName);
  }

  return { lists, pairs };
}

export function captionFor(attribute, direction, pairs) {
  const name = String(attribute ?? "");
  if (direction === "in" && pairs instanceof Map) {
    const partner = pairs.get(name.trim().toLowerCase());
    if (partner) return partner;
  }
  return name;
}

export function inverseAttribute(attribute, role, ontology) {
  const key = String(attribute ?? "").trim().toLowerCase();
  if (key && ontology?.pairs instanceof Map) {
    const partner = ontology.pairs.get(key);
    if (partner) return isWritableName(partner) ? partner.trim() : null;
  }
  const inverse = INVERSE[role];
  if (!inverse) return null;
  const candidates = ontology?.lists?.[inverse];
  if (!Array.isArray(candidates)) return null;
  const chosen = candidates.find((item) => isWritableName(item));
  return chosen ? chosen.trim() : null;
}
