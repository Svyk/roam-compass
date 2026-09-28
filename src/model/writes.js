const DEFAULTS = {
  parents: "Parent",
  children: "Child",
  friends: "Friend, Previous",
  challengers: "Challenger, Next",
};

const ZONE_ALIAS = {
  parents: "parents",
  north: "parents",
  children: "children",
  south: "children",
  friends: "friends",
  west: "friends",
  challengers: "challengers",
  east: "challengers",
  related: "related",
  southeast: "related",
};

function splitList(value) {
  const parts = Array.isArray(value) ? value : String(value).split(",");
  const titles = [];
  for (const part of parts) {
    const title = String(part).trim();
    if (title && !titles.includes(title)) titles.push(title);
  }
  return titles;
}

function readList(value, fallback) {
  if (value == null) return splitList(fallback);
  return splitList(value);
}

function directionLists(settings) {
  const source = settings ?? {};
  return {
    parents: readList(source.parents, DEFAULTS.parents),
    children: readList(source.children, DEFAULTS.children),
    friends: readList(source.friends, DEFAULTS.friends),
    challengers: readList(source.challengers, DEFAULTS.challengers),
  };
}

function canonicalZone(zone) {
  return ZONE_ALIAS[String(zone ?? "").trim().toLowerCase()] ?? null;
}

function attributeForZone(settings, zone, action) {
  if (!zone) return null;
  if (zone === "related") {
    const name = String(action?.attribute ?? "").trim();
    if (!name || name.includes("::") || name.includes(":harc")) return null;
    return name;
  }
  const list = directionLists(settings)[zone];
  if (!list?.length) return null;
  return list[0];
}

function allowedNames(settings, action) {
  const lists = directionLists(settings);
  const names = new Set([
    ...lists.parents,
    ...lists.children,
    ...lists.friends,
    ...lists.challengers,
  ]);
  const zone = canonicalZone(action?.toZone ?? action?.zone);
  if ((action?.type === "link" || action?.type === "relink") && zone === "related") {
    const extra = String(action.attribute ?? "").trim();
    if (extra) names.add(extra);
  }
  return names;
}

function isProtected(name) {
  return name === "Aliases" || (typeof name === "string" && name.startsWith("BT_attr"));
}

function stripClassTags(tail) {
  return String(tail ?? "")
    .replace(/#\[\[\.[^[\]]*\]\]/g, " ")
    .replace(/#\.[^\s,[\]]+/g, " ");
}

function parseBlock(sourceString) {
  const source = String(sourceString ?? "");
  const idx = source.indexOf("::");
  if (idx < 0) return { rawName: "", name: "", bare: false, refsOnly: false, refs: [] };
  const rawName = source.slice(0, idx).trim();
  const wrapped = rawName.match(/^\[\[(.+)\]\]$/);
  const name = wrapped ? wrapped[1] : rawName;
  const cleaned = stripClassTags(source.slice(idx + 2));
  const refs = [...cleaned.matchAll(/\[\[([^[\]]+)\]\]/g)].map((match) => match[1].trim());
  const leftover = cleaned.replace(/\[\[([^[\]]+)\]\]/g, " ").replace(/,/g, " ").trim();
  return {
    rawName,
    name,
    bare: cleaned.trim() === "",
    refsOnly: refs.length > 0 && leftover === "",
    refs,
  };
}

function entityOnCenter(harc, centerUid) {
  const uids = [];
  const push = (uid) => {
    if (typeof uid === "string" && uid) uids.push(uid);
  };
  for (const entity of harc?.entities ?? []) push(entity?.uid);
  if (harc?.entity) push(harc.entity.uid);
  for (const item of harc?.entityUids ?? []) push(typeof item === "object" ? item?.uid : item);
  return uids.includes(centerUid);
}

function centerHarc(fixture, sourceUid) {
  return (fixture.harcs ?? []).find((harc) => harc?.sourceUid === sourceUid) ?? null;
}

function alreadyLinked(harc, title) {
  if ((harc.values ?? []).some((value) => value?.title === title)) return true;
  const parsed = parseBlock(harc.sourceString);
  if ((parsed.refsOnly || parsed.bare) && parsed.refs.includes(title)) return true;
  return String(harc.sourceString ?? "").trim() === `${parsed.rawName}:: [[${title}]]`;
}

function pageExists(fixture, title) {
  const found = [];
  const addTitle = (item) => {
    if (item?.title) found.push(item.title);
  };
  addTitle(fixture.center);
  addTitle(fixture.namespaceParent);
  for (const list of [fixture.outbound, fixture.inbound, fixture.pages]) {
    for (const item of list ?? []) addTitle(item);
  }
  for (const harc of fixture.harcs ?? []) {
    addTitle(harc?.attribute);
    addTitle(harc?.entity);
    for (const entity of harc?.entities ?? []) addTitle(entity);
    for (const value of harc?.values ?? []) addTitle(value);
  }
  return found.includes(title);
}

function attributeName(string) {
  const mark = String(string ?? "").indexOf("::");
  if (mark < 0) return null;
  let name = string.slice(0, mark).trim();
  const wrapped = name.match(/^\[\[(.+)\]\]$/);
  if (wrapped) name = wrapped[1];
  return name;
}

function forbidden(ops, allowed) {
  for (const op of ops) {
    const blob = `${op.string ?? ""}\n${op.title ?? ""}`;
    if (blob.includes(":harc") || blob.includes(":entity/attrs") || blob.includes(":attr/proxy")) return true;
    const name = attributeName(op.string);
    if (name && isProtected(name) && !allowed.has(name)) return true;
  }
  return false;
}

function openUid(action) {
  return action.sourceUid
    ?? action.edge?.sourceUid
    ?? action.uid
    ?? action.valueUid
    ?? action.edge?.to
    ?? action.to
    ?? null;
}

function openOp(action) {
  const uid = openUid(action);
  if (!uid) return [];
  return [{ op: "open", uid }];
}

function actionKind(action) {
  return action.kind ?? action.edgeKind ?? action.edge?.kind ?? null;
}

function planLink(fixture, action) {
  const title = String(action.title ?? "").trim();
  const zone = canonicalZone(action.zone);
  const attr = attributeForZone(fixture.settings, zone, action);
  const centerUid = fixture.center?.uid;
  if (!title || !attr || !centerUid) return [];
  const group = (fixture.harcs ?? []).filter((harc) => (
    harc && entityOnCenter(harc, centerUid) && harc.attribute?.title === attr
  ));
  if (group.some((harc) => alreadyLinked(harc, title))) return [];
  const bare = group.find((harc) => harc.sourceUid && parseBlock(harc.sourceString).bare);
  if (bare) {
    return [{ op: "create", parentUid: bare.sourceUid, order: "last", string: `[[${title}]]` }];
  }
  const refs = group.find((harc) => harc.sourceUid && parseBlock(harc.sourceString).refsOnly);
  if (refs) {
    const parsed = parseBlock(refs.sourceString);
    const ops = [{ op: "update", uid: refs.sourceUid, string: `${parsed.rawName}::` }];
    for (const old of parsed.refs) {
      ops.push({ op: "create", parentUid: refs.sourceUid, order: "last", string: `[[${old}]]` });
    }
    ops.push({ op: "create", parentUid: refs.sourceUid, order: "last", string: `[[${title}]]` });
    return ops;
  }
  return [{ op: "create", parentUid: centerUid, order: "last", string: `${attr}:: [[${title}]]` }];
}

function withCreatePage(fixture, action, ops) {
  if (action.create !== true || !ops.length) return ops;
  const title = String(action.title ?? "").trim();
  if (!title || pageExists(fixture, title)) return ops;
  return [{ op: "create-page", title }, ...ops];
}

function withoutRef(refs, title, index, confident) {
  if (title) {
    const at = refs.indexOf(title);
    if (at >= 0) return refs.filter((_, i) => i !== at);
  }
  if (refs.length === 1 && confident) return [];
  if (Number.isInteger(index) && index >= 0 && index < refs.length) {
    return refs.filter((_, i) => i !== index);
  }
  return null;
}

function planUnlink(fixture, action, allowed) {
  const kind = actionKind(action);
  if (kind && kind !== "typed") return openOp(action);
  const harc = centerHarc(fixture, action.sourceUid);
  const centerUid = fixture.center?.uid;
  if (!harc || !entityOnCenter(harc, centerUid)) return openOp(action);
  const name = harc.attribute?.title ?? "";
  if (isProtected(name) && !allowed.has(name)) return openOp(action);
  const parsed = parseBlock(harc.sourceString);
  const values = harc.values ?? [];
  const index = values.findIndex((value) => value?.uid === action.valueUid);
  const value = index >= 0 ? values[index] : null;
  const childUid = action.valueBlockUid ?? (index >= 0 ? harc.valueSourceUids?.[index] : undefined);
  if (childUid && childUid !== harc.sourceUid) {
    const ops = [{ op: "delete", uid: childUid }];
    const remaining = values.filter((item) => item?.uid !== action.valueUid);
    if (remaining.length === 0 && parsed.bare) ops.push({ op: "delete", uid: harc.sourceUid });
    return ops;
  }
  if (parsed.refsOnly) {
    const remaining = withoutRef(
      parsed.refs,
      value?.title ?? action.title,
      index,
      Boolean(value) || values.length <= 1,
    );
    if (remaining == null || remaining.length === parsed.refs.length) return [];
    if (remaining.length === 0) return [{ op: "delete", uid: harc.sourceUid }];
    if (remaining.length === 1) {
      return [{
        op: "update",
        uid: harc.sourceUid,
        string: `${parsed.rawName}:: [[${remaining[0]}]]`,
      }];
    }
    const ops = [{ op: "update", uid: harc.sourceUid, string: `${parsed.rawName}::` }];
    for (const ref of remaining) {
      ops.push({ op: "create", parentUid: harc.sourceUid, order: "last", string: `[[${ref}]]` });
    }
    return ops;
  }
  if (parsed.bare && values.length <= 1 && (value || values.length === 1)) {
    return [{ op: "delete", uid: harc.sourceUid }];
  }
  return [];
}

function project(fixture, action, ops) {
  const harcs = [];
  for (const harc of fixture.harcs ?? []) {
    if (harc?.sourceUid !== action.sourceUid) {
      harcs.push(harc);
      continue;
    }
    if (ops.some((op) => op.op === "delete" && op.uid === harc.sourceUid)) continue;
    const update = ops.find((op) => op.op === "update" && op.uid === harc.sourceUid);
    const deleted = new Set(ops.filter((op) => op.op === "delete").map((op) => op.uid));
    const values = [];
    const sources = [];
    (harc.values ?? []).forEach((value, index) => {
      const sourceUid = harc.valueSourceUids?.[index];
      if (value?.uid === action.valueUid) return;
      if (sourceUid && deleted.has(sourceUid)) return;
      values.push(value);
      if (harc.valueSourceUids) sources.push(sourceUid);
    });
    harcs.push({
      ...harc,
      sourceString: update ? update.string : harc.sourceString,
      values,
      valueSourceUids: harc.valueSourceUids ? sources : harc.valueSourceUids,
    });
  }
  return { ...fixture, harcs };
}

function planAnnotate(action, allowed) {
  const attribute = String(action.attribute ?? "").trim();
  if (!attribute || attribute.includes("::") || !action.sourceUid) return [];
  if (isProtected(attribute) && !allowed.has(attribute)) return [];
  const text = action.text == null ? "" : String(action.text).trim();
  const string = text ? `${attribute}:: ${text}` : `${attribute}::`;
  return [{ op: "create", parentUid: action.sourceUid, order: "last", string }];
}

function relinkTitle(fixture, action) {
  const given = String(action.title ?? "").trim();
  if (given) return given;
  const harc = centerHarc(fixture, action.sourceUid);
  const value = harc?.values?.find((item) => item?.uid === action.valueUid);
  return String(value?.title ?? "").trim();
}

export function planWrite(fixture, action) {
  const source = fixture ?? {};
  if (!action || typeof action.type !== "string") return { ops: [] };
  const allowed = allowedNames(source.settings, action);
  let ops = [];
  if (action.type === "link") {
    ops = withCreatePage(source, action, planLink(source, action));
  } else if (action.type === "unlink") {
    ops = planUnlink(source, action, allowed);
  } else if (action.type === "open") {
    ops = openOp(action);
  } else if (action.type === "annotate") {
    ops = planAnnotate(action, allowed);
  } else if (action.type === "relink") {
    const zone = canonicalZone(action.toZone ?? action.zone);
    const title = relinkTitle(source, action);
    const linkAction = {
      type: "link",
      zone,
      title,
      attribute: action.attribute,
      create: action.create === true,
    };
    if (!title || !attributeForZone(source.settings, zone, linkAction)) return { ops: [] };
    const unlinkOps = planUnlink(source, action, allowed);
    if (unlinkOps.some((op) => op.op === "open")) {
      ops = unlinkOps;
    } else if (centerHarc(source, action.sourceUid) && unlinkOps.length === 0) {
      ops = [];
    } else {
      const next = project(source, action, unlinkOps);
      ops = [...unlinkOps, ...withCreatePage(source, linkAction, planLink(next, linkAction))];
    }
  }
  if (forbidden(ops, allowed)) return { ops: [] };
  return { ops };
}
