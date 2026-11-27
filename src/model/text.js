// Roam string helpers. Pure functions; no roamAlphaAPI access.

const TAG_CHAR = /[\p{L}\p{N}_\-/.@&%+=~*']/u;
const UID_RE = /^[\w-]{1,64}$/;

function matchBrackets(text, start) {
  // text[start..start+1] is "[[". Returns the index just past the matching "]]", or -1.
  let depth = 0;
  let index = start;
  while (index < text.length - 1) {
    if (text[index] === "[" && text[index + 1] === "[") {
      depth += 1;
      index += 2;
      continue;
    }
    if (text[index] === "]" && text[index + 1] === "]") {
      depth -= 1;
      index += 2;
      if (depth === 0) return index;
      continue;
    }
    index += 1;
  }
  return -1;
}

function skipCode(text, index) {
  if (text.startsWith("```", index)) {
    const end = text.indexOf("```", index + 3);
    return end < 0 ? text.length : end + 3;
  }
  const end = text.indexOf("`", index + 1);
  return end < 0 ? text.length : end + 1;
}

function tagEnd(text, index) {
  let end = index;
  while (end < text.length && TAG_CHAR.test(text[end])) end += 1;
  while (end > index && /[.,'*]/.test(text[end - 1])) end -= 1;
  return end;
}

function isClassTitle(title) {
  return title.startsWith(".");
}

// Ref tokens in a Roam string. Macro names ({{[[TODO]]}}, {{embed: …}}) and inline code are
// skipped; macro arguments are scanned. Class tags (#.x, #[[.x]]) are reported with classTag.
export function scanRefs(input, { nested = true } = {}) {
  const text = String(input ?? "");
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "`") {
      index = skipCode(text, index);
      continue;
    }
    if (char === "{" && text[index + 1] === "{") {
      index += 2;
      while (text[index] === " ") index += 1;
      if (text.startsWith("[[", index)) {
        const end = matchBrackets(text, index);
        index = end < 0 ? text.length : end;
      } else {
        while (index < text.length && !/[:}\s]/.test(text[index])) index += 1;
      }
      continue;
    }
    if (char === "(" && text[index + 1] === "(") {
      const end = text.indexOf("))", index + 2);
      const uid = end < 0 ? "" : text.slice(index + 2, end);
      if (UID_RE.test(uid)) {
        tokens.push({ type: "block", uid, raw: text.slice(index, end + 2), start: index, end: end + 2, nested: false });
        index = end + 2;
        continue;
      }
      index += 1;
      continue;
    }
    const hashed = char === "#";
    const open = hashed ? index + 1 : index;
    if (text[open] === "[" && text[open + 1] === "[") {
      const end = matchBrackets(text, open);
      if (end < 0) {
        index = open + 2;
        continue;
      }
      const title = text.slice(open + 2, end - 2);
      if (title.trim()) {
        tokens.push({
          type: "page",
          title,
          raw: text.slice(index, end),
          start: index,
          end,
          nested: false,
          classTag: hashed && isClassTitle(title),
        });
        if (nested && title.includes("[[")) {
          for (const inner of scanRefs(title, { nested })) {
            tokens.push({
              ...inner,
              start: inner.start + open + 2,
              end: inner.end + open + 2,
              nested: true,
            });
          }
        }
      }
      index = end;
      continue;
    }
    if (hashed && (index === 0 || /[\s(]/.test(text[index - 1]))) {
      const end = tagEnd(text, index + 1);
      if (end > index + 1) {
        const title = text.slice(index + 1, end);
        tokens.push({
          type: "page",
          title,
          raw: text.slice(index, end),
          start: index,
          end,
          nested: false,
          classTag: isClassTitle(title),
        });
        index = end;
        continue;
      }
    }
    index += 1;
  }
  return tokens;
}

// "Name:: tail" → { name, tail, prefix }. Returns null for a block that is not an attribute.
export function parseAttribute(input) {
  const text = String(input ?? "");
  const match = /^(\s*(?:\[\[([^[\]\n]+)\]\]|([^\s:`[\]{}\n][^:`[\]{}\n]*?))\s*::)/.exec(text);
  if (!match) return null;
  const name = (match[2] ?? match[3] ?? "").trim();
  if (!name) return null;
  return { name, prefix: match[1], tail: text.slice(match[1].length) };
}

// A tail is refs-only when nothing but refs (and class tags) remain once refs are removed.
export function tailShape(tail) {
  const text = String(tail ?? "");
  const tokens = scanRefs(text, { nested: false });
  let leftover = text;
  for (const token of [...tokens].sort((a, b) => b.start - a.start)) {
    leftover = leftover.slice(0, token.start) + " " + leftover.slice(token.end);
  }
  const values = tokens.filter((token) => !token.classTag);
  const blank = leftover.trim() === "";
  if (!blank) return { kind: "text", values: [] };
  if (!values.length) return { kind: "bare", values: [] };
  return { kind: "refs", values };
}

export function tokenMatches(token, target) {
  if (!token || !target) return false;
  if (token.type === "block") return target.uid != null && token.uid === target.uid;
  return target.title != null && token.title === target.title;
}

export function removeToken(text, token) {
  const before = text.slice(0, token.start).replace(/[ \t]+$/, "");
  const after = text.slice(token.end).replace(/^[ \t]+/, "");
  if (!before) return after;
  if (!after) return before;
  return `${before} ${after}`;
}

export function refMarkup(target) {
  if (target?.title) return `[[${target.title}]]`;
  if (target?.uid) return `((${target.uid}))`;
  return "";
}

const SMARTBLOCK_RE = /\{\{\s*([^:}][^:}]*?)\s*:(?:42)?SmartBlock:([^:}]+)(?::[^}]*)?\}\}/g;
const BLOCK_REF_RE = /\(\(([\w-]+)\)\)/g;
const MAX_REF_DEPTH = 2;

function lookupRef(refs, uid) {
  if (!refs || !uid) return null;
  let value;
  if (typeof refs === "function") value = refs(uid);
  else if (refs instanceof Map) value = refs.get(uid);
  else if (typeof refs === "object" && Object.prototype.hasOwnProperty.call(refs, uid)) value = refs[uid];
  return typeof value === "string" ? value : null;
}

function cleanMarkup(raw) {
  let text = String(raw ?? "");
  text = text.replace(/\{\{\s*\[\[(TODO|DONE)\]\]\s*\}\}/g, "$1");
  text = text.replace(/\{\{\s*\[\[([^\]]+)\]\][^}]*\}\}/g, "$1");
  text = text.replace(/\{\{([^}]*)\}\}/g, "$1");
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => alt || "image");
  text = text.replace(/\[([^\]]+)\]\((?:\[\[[^\]]*\]\]|\(\([^)]*\)\)|[^)]*)\)/g, "$1");
  text = text.replace(/#\[\[([^\]]+)\]\]/g, "#$1");
  for (let pass = 0; pass < 3 && text.includes("[["); pass += 1) {
    text = text.replace(/\[\[([^[\]]*)\]\]/g, "$1");
  }
  text = text.replace(/\(\(([\w-]+)\)\)/g, "(( ))");
  text = text.replace(/\*\*|__|\^\^|~~|`/g, "");
  return text;
}

function safeSlice(text, len) {
  if (len <= 0) return "";
  if (len >= text.length) return text;
  let end = len;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return text.slice(0, end);
}

function isSpecialPart(part) {
  return Boolean(part?.button || part?.ref);
}

function normalizeParts(rawParts) {
  const merged = [];
  for (const part of rawParts) {
    if (!part || !part.text) continue;
    if (part.button) {
      const label = part.text.replace(/\s+/g, " ").trim();
      if (!label) continue;
      if (merged.length && isSpecialPart(merged[merged.length - 1])) {
        merged.push({ text: " " });
      }
      merged.push({ text: label, button: true });
      continue;
    }
    if (part.ref) {
      const text = part.text.replace(/\s+/g, " ").trim();
      if (!text) continue;
      if (merged.length && isSpecialPart(merged[merged.length - 1])) {
        merged.push({ text: " " });
      }
      merged.push({ text, ref: true });
      continue;
    }
    let text = part.text.replace(/\s+/g, " ");
    if (!text) continue;
    const prev = merged[merged.length - 1];
    if (prev && !isSpecialPart(prev)) {
      if (prev.text.endsWith(" ") && text.startsWith(" ")) text = text.slice(1);
      prev.text += text;
    } else {
      merged.push({ text });
    }
  }
  while (merged.length && !isSpecialPart(merged[0])) {
    merged[0].text = merged[0].text.replace(/^ +/, "");
    if (!merged[0].text) merged.shift();
    else break;
  }
  while (merged.length && !isSpecialPart(merged[merged.length - 1])) {
    merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/ +$/, "");
    if (!merged[merged.length - 1].text) merged.pop();
    else break;
  }
  return merged;
}

function truncateParts(parts, max) {
  const full = parts.map((part) => part.text).join("");
  if (full.length <= max) return { text: full, parts };
  const target = safeSlice(full, Math.max(1, max - 1)).trimEnd();
  let remaining = target.length;
  const cut = [];
  for (const part of parts) {
    if (remaining <= 0) break;
    if (part.text.length <= remaining) {
      cut.push({ ...part });
      remaining -= part.text.length;
    } else {
      const slice = safeSlice(part.text, remaining);
      if (slice) cut.push({ ...part, text: slice });
      remaining = 0;
    }
  }
  while (cut.length && !isSpecialPart(cut[cut.length - 1])) {
    cut[cut.length - 1].text = cut[cut.length - 1].text.replace(/ +$/, "");
    if (!cut[cut.length - 1].text) cut.pop();
    else break;
  }
  if (cut.length && !isSpecialPart(cut[cut.length - 1])) {
    cut[cut.length - 1].text += "…";
  } else {
    cut.push({ text: "…" });
  }
  return { text: cut.map((part) => part.text).join(""), parts: cut };
}

function expandSegment(rawSegment, refs, depth, seen) {
  if (!rawSegment) return [];
  const pieces = [];
  const re = new RegExp(BLOCK_REF_RE.source, "g");
  let cursor = 0;
  let match;
  while ((match = re.exec(rawSegment))) {
    if (match.index > cursor) {
      const text = cleanMarkup(rawSegment.slice(cursor, match.index));
      if (text) pieces.push({ text });
    }
    const uid = match[1];
    const target = depth < MAX_REF_DEPTH && !seen.has(uid) ? lookupRef(refs, uid) : null;
    if (target != null) {
      const nextSeen = new Set(seen);
      nextSeen.add(uid);
      const resolved = buildRawParts(target, refs, depth + 1, nextSeen)
        .map((part) => part.text)
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      if (resolved) pieces.push({ text: resolved, ref: true });
      else pieces.push({ text: "(( ))" });
    } else {
      pieces.push({ text: "(( ))" });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < rawSegment.length) {
    const text = cleanMarkup(rawSegment.slice(cursor));
    if (text) pieces.push({ text });
  }
  return pieces;
}

function buildRawParts(raw, refs, depth, seen) {
  const tokens = [];
  let cursor = 0;
  const sbRe = new RegExp(SMARTBLOCK_RE.source, "g");
  let match;
  while ((match = sbRe.exec(raw))) {
    if (match.index > cursor) {
      tokens.push({ button: false, pieces: expandSegment(raw.slice(cursor, match.index), refs, depth, seen) });
    }
    tokens.push({
      button: true,
      label: match[1].trim(),
      workflow: cleanMarkup(match[2]).replace(/\s+/g, " ").trim(),
    });
    cursor = match.index + match[0].length;
  }
  if (cursor < raw.length) {
    tokens.push({ button: false, pieces: expandSegment(raw.slice(cursor), refs, depth, seen) });
  }

  const hasOtherText = tokens.some(
    (token) => !token.button && token.pieces.some((piece) => piece.text.trim() !== ""),
  );
  const rawParts = [];
  for (const token of tokens) {
    if (!token.button) {
      for (const piece of token.pieces) rawParts.push(piece);
      continue;
    }
    if (token.label) rawParts.push({ text: token.label, button: true });
    if (!hasOtherText && token.workflow) {
      rawParts.push({ text: ` ${token.workflow}` });
    }
  }
  return normalizeParts(rawParts);
}

// Structured one-line label parts for a block string: plain text, SmartBlock button chips, and resolved block refs.
export function labelParts(input, max = 90, options = {}) {
  const raw = String(input ?? "");
  const refs = options?.refs ?? null;
  const seen = new Set();
  if (typeof options?.selfUid === "string" && options.selfUid) seen.add(options.selfUid);
  const normalized = buildRawParts(raw, refs, 0, seen);
  return truncateParts(normalized, max);
}

// Plain one-line text for a node label. Keeps the words, drops Roam markup.
export function plainText(input, max = 90, options = {}) {
  return labelParts(input, max, options).text;
}

// Title for Plexus region and Excalidraw drawing blocks; null for any other block.
export function drawingTitle(input, max = 90) {
  const text = String(input ?? "").trimStart();
  const region = /^\{\{\s*\[\[plexus-region\]\][^}]*\}\}/.exec(text);
  if (region) return plainText(text.slice(region[0].length), max) || "Region";
  if (/^\{\{\s*(\[\[excalidraw\]\]|excalidraw)\s*\}\}/.test(text)) {
    const info = /Text elements in drawing:\s*([^;}]*)/.exec(text);
    const first = info ? plainText(info[1], max) : "";
    return first ? `Drawing: ${first}` : "Drawing";
  }
  return null;
}

// Owner drawing uid (the d= token) of a Plexus region block string; null for anything else.
export function regionOwner(input) {
  const head = /^\{\{\s*\[\[plexus-region\]\]([^}]*)\}\}/.exec(String(input ?? "").trimStart());
  return head ? /(?:^|[\s:])d=([\w-]+)/.exec(head[1])?.[1] ?? null : null;
}

export function splitNames(value) {
  const parts = Array.isArray(value) ? value : String(value ?? "").split(",");
  const names = [];
  for (const part of parts) {
    const name = String(part).trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}
