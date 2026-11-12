function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function fmt(value) {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function resolveDash(dashed, scale) {
  if (!dashed || dashed === "none" || dashed === "solid") return [];
  if (Array.isArray(dashed)) {
    return dashed
      .map((item) => Number(item) * scale)
      .filter((num) => Number.isFinite(num) && num > 0)
      .map((num) => Math.max(0.5, Math.round(num * 100) / 100));
  }
  if (typeof dashed === "string") {
    const trimmed = dashed.trim().toLowerCase();
    if (!trimmed || trimmed === "none" || trimmed === "solid") return [];
    if (trimmed === "dotted") return [fmtNum(2 * scale), fmtNum(3 * scale)];
    if (trimmed === "dashed") return [fmtNum(5 * scale), fmtNum(4 * scale)];
    const matches = trimmed.match(/[-+]?(?:\d+\.?\d*|\.\d+)/g);
    if (matches) {
      return matches
        .map((raw) => Number(raw) * scale)
        .filter((num) => Number.isFinite(num) && num > 0)
        .map((num) => Math.max(0.5, fmtNum(num)));
    }
    return [];
  }
  if (dashed === true) return [fmtNum(5 * scale), fmtNum(4 * scale)];
  return [];
}

function fmtNum(value) {
  return Math.round(value * 100) / 100;
}

function scaleFont(font, scale, bold = false) {
  const raw = typeof font === "string" && font.trim() ? font.trim() : "13px sans-serif";
  const scaled = raw.replace(
    /(\d+(?:\.\d+)?)px(\s*\/\s*(\d+(?:\.\d+)?)px)?/i,
    (_all, size, slashPart, lineHeight) => {
      const nextSize = fmt(Math.max(1, Number(size) * scale));
      if (!slashPart || !lineHeight) return `${nextSize}px`;
      const nextLh = fmt(Math.max(1, Number(lineHeight) * scale));
      return `${nextSize}px/${nextLh}px`;
    },
  );
  if (bold && !/\b(?:bold|[6-9]00)\b/i.test(scaled)) {
    return `600 ${scaled}`;
  }
  return scaled;
}

const PATH_TOKEN = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const CMD_ARITY = Object.freeze({
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
});

function transformPath(d, originX, originY, scale) {
  if (typeof d !== "string" || !d.trim()) return null;
  const tokens = d.match(PATH_TOKEN);
  if (!tokens || !tokens.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasPoint = false;

  const mark = (wx, wy) => {
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) return;
    hasPoint = true;
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
  };

  const pxX = (wx) => fmt((wx - originX) * scale);
  const pxY = (wy) => fmt((wy - originY) * scale);

  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let cmd = "";
  const parts = [];
  let idx = 0;

  while (idx < tokens.length) {
    const tok = tokens[idx];
    if (/^[A-Za-z]$/.test(tok)) {
      cmd = tok;
      idx += 1;
      if (cmd.toUpperCase() === "Z") {
        cx = sx;
        cy = sy;
        parts.push("Z");
        cmd = "";
      }
      continue;
    }
    if (!cmd) {
      idx += 1;
      continue;
    }
    const upper = cmd.toUpperCase();
    const arity = CMD_ARITY[upper];
    if (!arity || idx + arity > tokens.length) break;

    const nums = [];
    let validNums = true;
    for (let k = 0; k < arity; k += 1) {
      const val = Number(tokens[idx + k]);
      if (!Number.isFinite(val)) {
        validNums = false;
        break;
      }
      nums.push(val);
    }
    if (!validNums) break;
    idx += arity;

    const rel = cmd !== upper;
    if (upper === "M") {
      const wx = rel ? cx + nums[0] : nums[0];
      const wy = rel ? cy + nums[1] : nums[1];
      mark(wx, wy);
      cx = wx;
      cy = wy;
      sx = wx;
      sy = wy;
      parts.push(`M${pxX(wx)},${pxY(wy)}`);
      cmd = rel ? "l" : "L";
    } else if (upper === "L") {
      const wx = rel ? cx + nums[0] : nums[0];
      const wy = rel ? cy + nums[1] : nums[1];
      mark(wx, wy);
      cx = wx;
      cy = wy;
      parts.push(`L${pxX(wx)},${pxY(wy)}`);
    } else if (upper === "H") {
      const wx = rel ? cx + nums[0] : nums[0];
      mark(wx, cy);
      cx = wx;
      parts.push(`L${pxX(wx)},${pxY(cy)}`);
    } else if (upper === "V") {
      const wy = rel ? cy + nums[0] : nums[0];
      mark(cx, wy);
      cy = wy;
      parts.push(`L${pxX(cx)},${pxY(wy)}`);
    } else if (upper === "C") {
      const x1 = rel ? cx + nums[0] : nums[0];
      const y1 = rel ? cy + nums[1] : nums[1];
      const x2 = rel ? cx + nums[2] : nums[2];
      const y2 = rel ? cy + nums[3] : nums[3];
      const x = rel ? cx + nums[4] : nums[4];
      const y = rel ? cy + nums[5] : nums[5];
      mark(x1, y1);
      mark(x2, y2);
      mark(x, y);
      cx = x;
      cy = y;
      parts.push(`C${pxX(x1)},${pxY(y1)} ${pxX(x2)},${pxY(y2)} ${pxX(x)},${pxY(y)}`);
    } else if (upper === "S") {
      const x2 = rel ? cx + nums[0] : nums[0];
      const y2 = rel ? cy + nums[1] : nums[1];
      const x = rel ? cx + nums[2] : nums[2];
      const y = rel ? cy + nums[3] : nums[3];
      mark(x2, y2);
      mark(x, y);
      cx = x;
      cy = y;
      parts.push(`S${pxX(x2)},${pxY(y2)} ${pxX(x)},${pxY(y)}`);
    } else if (upper === "Q") {
      const x1 = rel ? cx + nums[0] : nums[0];
      const y1 = rel ? cy + nums[1] : nums[1];
      const x = rel ? cx + nums[2] : nums[2];
      const y = rel ? cy + nums[3] : nums[3];
      mark(x1, y1);
      mark(x, y);
      cx = x;
      cy = y;
      parts.push(`Q${pxX(x1)},${pxY(y1)} ${pxX(x)},${pxY(y)}`);
    } else if (upper === "T") {
      const x = rel ? cx + nums[0] : nums[0];
      const y = rel ? cy + nums[1] : nums[1];
      mark(x, y);
      cx = x;
      cy = y;
      parts.push(`T${pxX(x)},${pxY(y)}`);
    } else if (upper === "A") {
      const rx = Math.abs(nums[0]);
      const ry = Math.abs(nums[1]);
      const rot = nums[2];
      const large = nums[3] ? 1 : 0;
      const sweep = nums[4] ? 1 : 0;
      const x = rel ? cx + nums[5] : nums[5];
      const y = rel ? cy + nums[6] : nums[6];
      mark(x - rx, y - ry);
      mark(x + rx, y + ry);
      mark(x, y);
      cx = x;
      cy = y;
      parts.push(`A${fmt(rx * scale)},${fmt(ry * scale)} ${fmt(rot)} ${large} ${sweep} ${pxX(x)},${pxY(y)}`);
    }
  }

  if (!hasPoint || !parts.length) return null;
  return { d: parts.join(" "), minX, minY, maxX, maxY };
}

function rectOutside(x, y, w, h, scopeMinX, scopeMinY, scopeMaxX, scopeMaxY) {
  if (!(w > 0) || !(h > 0)) return true;
  return x + w <= scopeMinX || x >= scopeMaxX || y + h <= scopeMinY || y >= scopeMaxY;
}

function pathOutside(bbox, scopeMinX, scopeMinY, scopeMaxX, scopeMaxY) {
  const outX = bbox.minX < bbox.maxX
    ? (bbox.maxX <= scopeMinX || bbox.minX >= scopeMaxX)
    : (bbox.minX < scopeMinX || bbox.minX > scopeMaxX);
  if (outX) return true;
  const outY = bbox.minY < bbox.maxY
    ? (bbox.maxY <= scopeMinY || bbox.minY >= scopeMaxY)
    : (bbox.minY < scopeMinY || bbox.minY > scopeMaxY);
  return outY;
}

function fallbackBounds(boxes, regions) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const list of [boxes, regions]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || !Number.isFinite(item.x) || !Number.isFinite(item.y)) continue;
      const w = Number.isFinite(item.w) ? item.w : 0;
      const h = Number.isFinite(item.h) ? item.h : 0;
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + w);
      maxY = Math.max(maxY, item.y + h);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  return { minX, minY, maxX, maxY };
}

export function fitText(text, maxWidth, measure) {
  const str = String(text ?? "");
  if (!str) return "";
  if (typeof measure !== "function") return str;
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return "";
  if (measure(str) <= maxWidth) return str;
  if (measure("…") > maxWidth) return "";

  const chars = Array.from(str);
  let low = 0;
  let high = chars.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${chars.slice(0, mid).join("")}…`;
    if (measure(candidate) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return `${chars.slice(0, low).join("")}…`;
}

export function paintPlan({
  boxes = [],
  paths = [],
  regions = [],
  labels = [],
  bounds = null,
  viewport = null,
  scope = "all",
  scale = 1,
  transparent = false,
  paper = "#ffffff",
  maxSide = 8192,
  pad = 24,
} = {}) {
  const padding = Number.isFinite(pad) && pad >= 0 ? pad : 24;

  let originX;
  let originY;
  let worldW;
  let worldH;

  if (
    scope === "viewport"
    && viewport
    && Number.isFinite(viewport.x)
    && Number.isFinite(viewport.y)
    && Number.isFinite(viewport.w)
    && Number.isFinite(viewport.h)
  ) {
    originX = viewport.x;
    originY = viewport.y;
    worldW = Math.max(1, viewport.w);
    worldH = Math.max(1, viewport.h);
  } else {
    const b = (
      bounds
      && Number.isFinite(bounds.minX)
      && Number.isFinite(bounds.minY)
      && Number.isFinite(bounds.maxX)
      && Number.isFinite(bounds.maxY)
    )
      ? bounds
      : fallbackBounds(boxes, regions);
    originX = b.minX - padding;
    originY = b.minY - padding;
    worldW = Math.max(1, (b.maxX - b.minX) + padding * 2);
    worldH = Math.max(1, (b.maxY - b.minY) + padding * 2);
  }

  const scopeMinX = originX;
  const scopeMinY = originY;
  const scopeMaxX = originX + worldW;
  const scopeMaxY = originY + worldH;

  const requestedScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const limit = Number.isFinite(maxSide) && maxSide > 0 ? maxSide : 8192;

  let effectiveScale = requestedScale;
  let reduced = false;
  const warnings = [];

  if (worldW * requestedScale > limit || worldH * requestedScale > limit) {
    effectiveScale = Math.min(limit / worldW, limit / worldH);
    reduced = true;
    warnings.push("The image was reduced to fit the size limit.");
  }

  const s = effectiveScale;
  const width = Math.min(Math.floor(limit), Math.max(1, Math.round(worldW * s)));
  const height = Math.min(Math.floor(limit), Math.max(1, Math.round(worldH * s)));
  const effectiveScaleRounded = Math.round(s * 10000) / 10000;

  const ops = [];

  if (!transparent) {
    ops.push({
      op: "rect",
      layer: "background",
      x: 0,
      y: 0,
      w: width,
      h: height,
      fill: paper || "#ffffff",
      stroke: null,
      lineWidth: 0,
      dash: [],
      radius: 0,
      opacity: 1,
    });
  }

  if (Array.isArray(regions)) {
    for (const region of regions) {
      if (!region || typeof region !== "object") continue;
      const rx = Number(region.x);
      const ry = Number(region.y);
      const rw = Number(region.w);
      const rh = Number(region.h);
      if (!Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(rw) || !Number.isFinite(rh)) continue;
      if (rectOutside(rx, ry, rw, rh, scopeMinX, scopeMinY, scopeMaxX, scopeMaxY)) continue;

      const px = fmtNum((rx - originX) * s);
      const py = fmtNum((ry - originY) * s);
      const pw = fmtNum(rw * s);
      const ph = fmtNum(rh * s);
      const opacity = Number.isFinite(region.opacity) ? clamp(region.opacity, 0, 1) : 1;
      const radius = Math.max(0, Math.min(pw / 2, ph / 2, fmtNum((Number(region.radius) || 0) * s)));

      ops.push({
        op: "rect",
        layer: "region",
        x: px,
        y: py,
        w: pw,
        h: ph,
        fill: region.fill || null,
        stroke: region.stroke || null,
        lineWidth: region.stroke ? Math.max(0.5, fmtNum((Number(region.width) || 1) * s)) : 0,
        dash: resolveDash(region.dashed, s),
        radius,
        opacity,
      });

      const regionLabel = typeof region.label === "string" ? region.label.trim() : "";
      if (regionLabel) {
        const insetX = fmtNum(12 * s);
        const insetY = fmtNum(16 * s);
        ops.push({
          op: "text",
          layer: "region",
          x: fmtNum(px + insetX),
          y: fmtNum(py + insetY),
          text: regionLabel,
          color: region.color || "#000000",
          font: scaleFont(region.font || "600 12px sans-serif", s),
          bold: true,
          maxWidth: Math.max(0, fmtNum(pw - insetX * 2)),
          align: "left",
          baseline: "middle",
          halo: null,
          haloWidth: 0,
          opacity,
        });
      }
    }
  }

  if (Array.isArray(paths)) {
    for (const path of paths) {
      if (!path || typeof path !== "object") continue;
      const parsed = transformPath(path.d, originX, originY, s);
      if (!parsed) continue;
      if (pathOutside(parsed, scopeMinX, scopeMinY, scopeMaxX, scopeMaxY)) continue;
      const opacity = Number.isFinite(path.opacity) ? clamp(path.opacity, 0, 1) : 1;
      if (opacity <= 0) continue;
      ops.push({
        op: "path",
        layer: "path",
        d: parsed.d,
        stroke: path.stroke || "#888888",
        lineWidth: Math.max(0.5, fmtNum((Number(path.width) || 1.25) * s)),
        dash: resolveDash(path.dashed, s),
        opacity,
      });
    }
  }

  if (Array.isArray(boxes)) {
    for (const box of boxes) {
      if (!box || typeof box !== "object") continue;
      const bx = Number(box.x);
      const by = Number(box.y);
      const bw = Number(box.w);
      const bh = Number(box.h);
      if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bw) || !Number.isFinite(bh)) continue;
      if (rectOutside(bx, by, bw, bh, scopeMinX, scopeMinY, scopeMaxX, scopeMaxY)) continue;

      const opacity = Number.isFinite(box.opacity) ? clamp(box.opacity, 0, 1) : 1;
      if (opacity <= 0) continue;

      const px = fmtNum((bx - originX) * s);
      const py = fmtNum((by - originY) * s);
      const pw = fmtNum(bw * s);
      const ph = fmtNum(bh * s);
      const radius = Math.max(0, Math.min(pw / 2, ph / 2, fmtNum((Number(box.radius) || 0) * s)));
      const strokeWidth = Number(box.borderWidth ?? box.width) || 1.25;

      ops.push({
        op: "rect",
        layer: "box",
        x: px,
        y: py,
        w: pw,
        h: ph,
        fill: box.fill || null,
        stroke: box.stroke || null,
        lineWidth: box.stroke ? Math.max(0.5, fmtNum(strokeWidth * s)) : 0,
        dash: resolveDash(box.dashed, s),
        radius,
        opacity,
      });

      const boxText = typeof box.text === "string" ? box.text.trim() : "";
      if (boxText) {
        const padX = fmtNum((Number.isFinite(box.padX) ? box.padX : 10) * s);
        const align = box.align === "center" ? "center" : "left";
        const tx = align === "center" ? fmtNum(px + pw / 2) : fmtNum(px + padX);
        const ty = fmtNum(py + ph / 2);
        ops.push({
          op: "text",
          layer: "box",
          x: tx,
          y: ty,
          text: boxText,
          color: box.color || "#000000",
          font: scaleFont(box.font, s, Boolean(box.bold)),
          bold: Boolean(box.bold),
          maxWidth: Math.max(0, fmtNum(pw - padX * 2)),
          align,
          baseline: "middle",
          halo: null,
          haloWidth: 0,
          opacity,
        });
      }
    }
  }

  if (Array.isArray(labels)) {
    for (const label of labels) {
      if (!label || typeof label !== "object") continue;
      const lx = Number(label.x);
      const ly = Number(label.y);
      const text = typeof label.text === "string" ? label.text.trim() : "";
      if (!text || !Number.isFinite(lx) || !Number.isFinite(ly)) continue;
      if (lx < scopeMinX || lx > scopeMaxX || ly < scopeMinY || ly > scopeMaxY) continue;

      const opacity = Number.isFinite(label.opacity) ? clamp(label.opacity, 0, 1) : 1;
      if (opacity <= 0) continue;

      const halo = label.halo !== undefined
        ? label.halo
        : (transparent ? null : (paper || null));

      ops.push({
        op: "text",
        layer: "label",
        x: fmtNum((lx - originX) * s),
        y: fmtNum((ly - originY) * s),
        text,
        color: label.color || "#000000",
        font: scaleFont(label.font || "11px sans-serif", s, Boolean(label.bold)),
        bold: Boolean(label.bold),
        maxWidth: fmtNum((Number(label.maxWidth) || 260) * s),
        align: label.align || "center",
        baseline: label.baseline || "alphabetic",
        halo,
        haloWidth: halo ? fmtNum(4 * s) : 0,
        opacity,
      });
    }
  }

  return {
    width,
    height,
    scale: reduced ? effectiveScaleRounded : effectiveScale,
    reduced,
    ops,
    warnings,
  };
}
