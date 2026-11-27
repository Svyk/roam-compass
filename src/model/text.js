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

const BLOCK_REF_RE = /\(\(([\w-]+)\)\)/g;
const MAX_REF_DEPTH = 2;
const RAW_CAP = 2000;
const EMBED_NAMES = new Set(["embed", "embed-path", "embed-children"]);
const GRAPHEME_SEGMENTER = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

function lookupRef(refs, uid) {
  if (!refs || !uid) return null;
  let value;
  if (typeof refs === "function") value = refs(uid);
  else if (refs instanceof Map) value = refs.get(uid);
  else if (typeof refs === "object" && Object.prototype.hasOwnProperty.call(refs, uid)) value = refs[uid];
  return typeof value === "string" ? value : null;
}

function capInput(raw) {
  const text = String(raw ?? "");
  if (text.length <= RAW_CAP) return { text, cut: false };
  return { text: safeSlice(text, RAW_CAP), cut: true };
}

function closedCodeEnd(text, index) {
  if (text.startsWith("```", index)) {
    const end = text.indexOf("```", index + 3);
    return end < 0 ? -1 : end + 3;
  }
  const end = text.indexOf("`", index + 1);
  return end < 0 ? -1 : end + 1;
}

function findCodeRanges(text, cut) {
  const ranges = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "`") {
      let end = closedCodeEnd(text, i);
      if (end < 0 && cut) end = text.length;
      if (end > i) {
        ranges.push([i, end]);
        i = end;
        continue;
      }
    }
    i += 1;
  }
  return ranges;
}

function matchBracePairs(text, codeRanges = null) {
  if (!text.includes("{{") || !text.includes("}}")) return null;
  const pairs = new Map();
  const stack = [];
  let rIdx = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (codeRanges && rIdx < codeRanges.length && i === codeRanges[rIdx][0]) {
      i = codeRanges[rIdx][1] - 1;
      rIdx += 1;
      continue;
    }
    const ch = text[i];
    if (ch === "{") stack.push(i);
    else if (ch === "}" && stack.length) pairs.set(stack.pop(), i);
  }
  return pairs;
}

function doubleBraceEnd(pairs, start) {
  if (!pairs) return -1;
  const outer = pairs.get(start);
  const inner = pairs.get(start + 1);
  if (outer === undefined || inner === undefined) return -1;
  return outer === inner + 1 ? outer + 1 : -1;
}

function matchLinkTarget(text, openParen, allowCut = false) {
  if (text[openParen] !== "(") return -1;
  if (text.startsWith("((", openParen + 1)) {
    const end = text.indexOf(")))", openParen + 3);
    if (end >= 0) return end + 3;
    return allowCut ? text.length : -1;
  }
  if (text.startsWith("[[", openParen + 1)) {
    const end = matchBrackets(text, openParen + 1);
    if (end >= 0 && text[end] === ")") return end + 1;
    return allowCut ? text.length : -1;
  }
  const end = text.indexOf(")", openParen + 1);
  if (end >= 0) return end + 1;
  return allowCut ? text.length : -1;
}

function matchAliasOrImage(text, index, lastCloseBracket) {
  if (index >= lastCloseBracket) return null;
  const isImage = text[index] === "!" && text[index + 1] === "[" && text[index + 2] !== "[";
  if (!isImage && (text[index] !== "[" || text[index + 1] === "[")) return null;
  const labelStart = isImage ? index + 2 : index + 1;
  let p = labelStart;
  while (p < text.length) {
    if (text[p] === "[" && text[p + 1] === "[") {
      const bEnd = matchBrackets(text, p);
      p = bEnd > p ? bEnd : p + 2;
      continue;
    }
    if (text[p] === "]") {
      if (text[p + 1] !== "(") return null;
      if (!isImage && p === labelStart) return null;
      const end = matchLinkTarget(text, p + 1, false);
      if (end < 0) return null;
      return { isImage, label: text.slice(labelStart, p), end };
    }
    p += 1;
  }
  return null;
}

function parseSmartBlockBody(body) {
  const idxA = body.indexOf(":SmartBlock:");
  const idxB = body.indexOf(":42SmartBlock:");
  let sepIndex = -1;
  let sepLen = 0;
  if (idxA >= 0 && (idxB < 0 || idxA < idxB)) {
    sepIndex = idxA;
    sepLen = ":SmartBlock:".length;
  } else if (idxB >= 0) {
    sepIndex = idxB;
    sepLen = ":42SmartBlock:".length;
  }
  if (sepIndex < 0) return null;
  const rawLabel = body.slice(0, sepIndex).trim();
  if (!rawLabel) return null;
  const afterSep = body.slice(sepIndex + sepLen);
  const nextColon = afterSep.indexOf(":");
  const rawWorkflow = (nextColon >= 0 ? afterSep.slice(0, nextColon) : afterSep).trim();
  if (!rawWorkflow) return null;
  const label = cleanMarkup(rawLabel).replace(/\s+/g, " ").trim();
  const workflow = cleanMarkup(rawWorkflow).replace(/\s+/g, " ").trim();
  if (!label) return null;
  return { label, workflow };
}

function parseEmbedBody(body) {
  const colon = body.indexOf(":");
  if (colon < 0) return null;
  let name = body.slice(0, colon).trim();
  if (name.startsWith("[[") && name.endsWith("]]")) name = name.slice(2, -2);
  if (!EMBED_NAMES.has(name)) return null;
  const tail = body.slice(colon + 1).trim();
  if (!tail.startsWith("((") || !tail.endsWith("))")) return null;
  const uid = tail.slice(2, -2);
  return UID_RE.test(uid) ? uid : null;
}

function renderOtherMacro(body) {
  const trimmed = body.trimStart();
  if (trimmed.startsWith("[[")) {
    const end = matchBrackets(trimmed, 0);
    if (end >= 0) return cleanMarkup(trimmed.slice(2, end - 2));
  }
  return cleanMarkup(body);
}

function stripMacrosLinear(text) {
  const pairs = matchBracePairs(text);
  if (!pairs) return text;
  let out = "";
  let cursor = 0;
  let i = 0;
  const skip = new Set();
  while (i < text.length) {
    if (skip.has(i)) {
      if (i > cursor) out += text.slice(cursor, i);
      i += 1;
      cursor = i;
      continue;
    }
    if (text[i] === "{" && text[i + 1] === "{") {
      const end = doubleBraceEnd(pairs, i);
      if (end > i) {
        if (i > cursor) out += text.slice(cursor, i);
        const body = text.slice(i + 2, end - 2);
        const trimmed = body.trimStart();
        if (trimmed.startsWith("[[")) {
          const bEnd = matchBrackets(trimmed, 0);
          if (bEnd >= 0) {
            out += trimmed.slice(2, bEnd - 2);
            i = end;
            cursor = end;
            continue;
          }
        }
        skip.add(end - 2);
        skip.add(end - 1);
        i += 2;
        cursor = i;
        continue;
      }
    }
    i += 1;
  }
  if (cursor === 0) return text;
  return out + text.slice(cursor);
}

function stripAliasesLinear(text) {
  if (!text.includes("](")) return text;
  const lastCloseBracket = text.lastIndexOf("]");
  let out = "";
  let cursor = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] === "[" && text[i + 1] === "[") {
      const bEnd = matchBrackets(text, i);
      i = bEnd > i ? bEnd : i + 2;
      continue;
    }
    const hit = matchAliasOrImage(text, i, lastCloseBracket);
    if (hit) {
      if (i > cursor) out += text.slice(cursor, i);
      out += hit.isImage ? (hit.label || "image") : hit.label;
      i = hit.end;
      cursor = hit.end;
      continue;
    }
    i += 1;
  }
  if (cursor === 0) return text;
  return out + text.slice(cursor);
}

function cleanMarkup(raw) {
  let text = String(raw ?? "");
  text = stripMacrosLinear(text);
  text = stripAliasesLinear(text);
  if (text.includes("[[")) {
    text = text.replace(/#\[\[([^\]]+)\]\]/g, "#$1");
    for (let pass = 0; pass < 3 && text.includes("[["); pass += 1) {
      text = text.replace(/\[\[([^[\]]*)\]\]/g, "$1");
    }
  }
  if (text.includes("((") && text.includes("))")) {
    text = text.replace(/\(\(([\w-]+)\)\)/g, "(( ))");
  }
  text = text.replace(/\*\*|__|\^\^|~~|`/g, "");
  return text;
}

export function safeSlice(text, len) {
  if (len <= 0) return "";
  if (len >= text.length) return text;
  if (GRAPHEME_SEGMENTER) {
    let end = 0;
    for (const { index, segment } of GRAPHEME_SEGMENTER.segment(text)) {
      const next = index + segment.length;
      if (next > len) break;
      end = next;
    }
    return text.slice(0, end);
  }
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
      const slice = part.text.slice(0, remaining);
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

function resolveBlockRef(uid, refs, depth, seen) {
  const target = depth < MAX_REF_DEPTH && !seen.has(uid) ? lookupRef(refs, uid) : null;
  if (target != null) {
    const nextSeen = new Set(seen);
    nextSeen.add(uid);
    const resolved = buildRawParts(target, refs, depth + 1, nextSeen)
      .map((part) => part.text)
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (resolved) return { text: resolved, ref: true };
  }
  return { text: "(( ))" };
}

function expandBareRefs(rawSegment, refs, depth, seen) {
  if (!rawSegment) return [];
  if (!rawSegment.includes("((") || !rawSegment.includes("))")) {
    const text = cleanMarkup(rawSegment);
    return text ? [{ text }] : [];
  }
  const pieces = [];
  const re = new RegExp(BLOCK_REF_RE.source, "g");
  let cursor = 0;
  let match;
  while ((match = re.exec(rawSegment))) {
    if (match.index > cursor) {
      const text = cleanMarkup(rawSegment.slice(cursor, match.index));
      if (text) pieces.push({ text });
    }
    pieces.push(resolveBlockRef(match[1], refs, depth, seen));
    cursor = match.index + match[0].length;
  }
  if (cursor < rawSegment.length) {
    const text = cleanMarkup(rawSegment.slice(cursor));
    if (text) pieces.push({ text });
  }
  return pieces;
}

function tokenizeCodeAndMacros(text, cut) {
  const codeRanges = findCodeRanges(text, cut);
  const pairs = matchBracePairs(text, codeRanges);
  const tokens = [];
  let cursor = 0;
  let rIdx = 0;
  let i = 0;
  const flushRaw = (end) => {
    if (end > cursor) tokens.push({ kind: "raw", text: text.slice(cursor, end) });
  };
  while (i < text.length) {
    if (rIdx < codeRanges.length && i === codeRanges[rIdx][0]) {
      const cEnd = codeRanges[rIdx][1];
      flushRaw(i);
      tokens.push({ kind: "code", raw: text.slice(i, cEnd) });
      i = cEnd;
      cursor = cEnd;
      rIdx += 1;
      continue;
    }
    if (text[i] === "{" && text[i + 1] === "{") {
      const matchedEnd = doubleBraceEnd(pairs, i);
      const closedAtCut = matchedEnd < 0 && cut;
      const end = closedAtCut ? text.length : matchedEnd;
      if (end > i) {
        flushRaw(i);
        const body = closedAtCut ? text.slice(i + 2) : text.slice(i + 2, end - 2);
        const sb = parseSmartBlockBody(body);
        if (sb) {
          tokens.push({ kind: "smartblock", label: sb.label, workflow: sb.workflow });
        } else {
          const embedUid = parseEmbedBody(body);
          if (embedUid) tokens.push({ kind: "embed", uid: embedUid });
          else tokens.push({ kind: "macro", body });
        }
        i = end;
        cursor = end;
        while (rIdx < codeRanges.length && codeRanges[rIdx][0] < end) rIdx += 1;
        continue;
      }
    }
    i += 1;
  }
  flushRaw(text.length);
  return tokens;
}

function matchAliasAcrossTokens(tokens, startT, startI, isImage, cut) {
  const labelTokens = [];
  let scanT = startT;
  let scanI = isImage ? startI + 2 : startI + 1;
  while (scanT < tokens.length) {
    const tok = tokens[scanT];
    if (tok.kind !== "raw") {
      labelTokens.push(tok);
      scanT += 1;
      scanI = 0;
      continue;
    }
    const rs = tok.text;
    let p = scanI;
    while (p < rs.length) {
      if (rs[p] === "[" && rs[p + 1] === "[") {
        const bEnd = matchBrackets(rs, p);
        p = bEnd > p ? bEnd : p + 2;
        continue;
      }
      if (rs[p] === "]") {
        if (rs[p + 1] !== "(") return null;
        if (p > scanI) labelTokens.push({ kind: "raw", text: rs.slice(scanI, p) });
        if (!isImage && labelTokens.length === 0) return null;
        const isLastRaw = scanT === tokens.length - 1;
        const targetEnd = matchLinkTarget(rs, p + 1, cut && isLastRaw);
        if (targetEnd < 0) return null;
        return { labelTokens, endT: scanT, endI: targetEnd };
      }
      p += 1;
    }
    if (rs.length > scanI) labelTokens.push({ kind: "raw", text: rs.slice(scanI) });
    scanT += 1;
    scanI = 0;
  }
  return null;
}

function tokenizeAliases(tokens, cut) {
  const hasMarker = tokens.some((tok) => tok.kind === "raw" && tok.text.includes("]("));
  if (!hasMarker) return tokens;
  const out = [];
  for (let tIdx = 0; tIdx < tokens.length; tIdx += 1) {
    const tok = tokens[tIdx];
    if (tok.kind !== "raw") {
      out.push(tok);
      continue;
    }
    let s = tok.text;
    let cursor = 0;
    let i = 0;
    while (i < s.length) {
      if (s[i] === "[" && s[i + 1] === "[") {
        const bEnd = matchBrackets(s, i);
        i = bEnd > i ? bEnd : i + 2;
        continue;
      }
      const isImage = s[i] === "!" && s[i + 1] === "[" && s[i + 2] !== "[";
      const isAlias = !isImage && s[i] === "[" && s[i + 1] !== "[";
      if (isImage || isAlias) {
        const hit = matchAliasAcrossTokens(tokens, tIdx, i, isImage, cut);
        if (hit) {
          if (i > cursor) out.push({ kind: "raw", text: s.slice(cursor, i) });
          out.push({ kind: "alias", isImage, labelTokens: hit.labelTokens });
          if (hit.endT === tIdx) {
            i = hit.endI;
            cursor = hit.endI;
          } else {
            tIdx = hit.endT;
            s = tokens[tIdx].text;
            i = hit.endI;
            cursor = hit.endI;
          }
          continue;
        }
      }
      i += 1;
    }
    if (cursor < s.length) out.push({ kind: "raw", text: s.slice(cursor) });
  }
  return out;
}

function expandToken(token, refs, depth, seen, expandRefs) {
  if (token.kind === "smartblock") return [token];
  if (token.kind === "code") {
    const text = cleanMarkup(token.raw);
    return [{ kind: "pieces", pieces: text ? [{ text }] : [] }];
  }
  if (token.kind === "embed") {
    return [{ kind: "pieces", pieces: [resolveBlockRef(token.uid, refs, depth, seen)] }];
  }
  if (token.kind === "macro") {
    const text = renderOtherMacro(token.body);
    return [{ kind: "pieces", pieces: text ? [{ text }] : [] }];
  }
  if (token.kind === "alias") {
    const inner = [];
    for (const child of token.labelTokens) {
      inner.push(...expandToken(child, refs, depth, seen, false));
    }
    if (token.isImage) {
      const hasContent = inner.some((item) => (
        item.kind === "smartblock" || item.pieces.some((piece) => piece.text.trim() !== "")
      ));
      if (!hasContent) return [{ kind: "pieces", pieces: [{ text: "image" }] }];
    }
    return inner;
  }
  const pieces = expandRefs
    ? expandBareRefs(token.text, refs, depth, seen)
    : (() => {
      const text = cleanMarkup(token.text);
      return text ? [{ text }] : [];
    })();
  return [{ kind: "pieces", pieces }];
}

function buildRawParts(raw, refs, depth, seen) {
  const { text, cut } = capInput(raw);
  const stage2 = tokenizeCodeAndMacros(text, cut);
  const stage3 = tokenizeAliases(stage2, cut);
  const expanded = [];
  for (const token of stage3) {
    expanded.push(...expandToken(token, refs, depth, seen, true));
  }

  const hasOtherText = expanded.some(
    (token) => token.kind !== "smartblock" && token.pieces.some((piece) => piece.text.trim() !== ""),
  );
  const rawParts = [];
  for (const token of expanded) {
    if (token.kind !== "smartblock") {
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
