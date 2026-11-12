const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MS_PER_DAY = 86_400_000;
const DEFAULT_WEEK_FORMAT = "YYYY-[W]WW";
const DEFAULT_MONTH_FORMAT = "MMMM YYYY";
const TOKEN_PATTERN = /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|Do|D|WW|W|GGGG|gggg/g;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function pad4(value) {
  const sign = value < 0 ? "-" : "";
  return `${sign}${String(Math.abs(value)).padStart(4, "0")}`;
}

function ordinalDay(day) {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  const mod10 = day % 10;
  if (mod10 === 1) return `${day}st`;
  if (mod10 === 2) return `${day}nd`;
  if (mod10 === 3) return `${day}rd`;
  return `${day}th`;
}

function weekParts(year, month, day, weekStart) {
  const utc = Date.UTC(year, month, day);
  const dow = new Date(utc).getUTCDay();
  if (weekStart === "sunday") {
    const sundayUtc = utc - dow * MS_PER_DAY;
    const saturdayUtc = sundayUtc + 6 * MS_PER_DAY;
    const weekYear = new Date(saturdayUtc).getUTCFullYear();
    const jan1Utc = Date.UTC(weekYear, 0, 1);
    const jan1Dow = new Date(jan1Utc).getUTCDay();
    const week1SundayUtc = jan1Utc - jan1Dow * MS_PER_DAY;
    const week = Math.round((sundayUtc - week1SundayUtc) / (7 * MS_PER_DAY)) + 1;
    return { week, weekYear };
  }
  const isoDow = dow === 0 ? 7 : dow;
  const thursdayUtc = utc + (4 - isoDow) * MS_PER_DAY;
  const weekYear = new Date(thursdayUtc).getUTCFullYear();
  const jan1Utc = Date.UTC(weekYear, 0, 1);
  const week = Math.floor((thursdayUtc - jan1Utc) / MS_PER_DAY / 7) + 1;
  return { week, weekYear };
}

function toValidDate(input) {
  const d = input instanceof Date ? input : new Date(input ?? Date.now());
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatPeriod(date, pattern, { weekStart = "monday" } = {}) {
  const d = toValidDate(date);
  if (!d || typeof pattern !== "string" || !pattern) return "";
  const year = d.getFullYear();
  const monthIndex = d.getMonth();
  const month = monthIndex + 1;
  const day = d.getDate();
  const normalizedStart = weekStart === "sunday" ? "sunday" : "monday";
  const { week, weekYear } = weekParts(year, monthIndex, day, normalizedStart);

  return pattern.replace(TOKEN_PATTERN, (token, literal) => {
    if (literal !== undefined) return literal;
    switch (token) {
      case "YYYY":
        return pad4(year);
      case "YY":
        return pad2(Math.abs(year) % 100);
      case "MMMM":
        return MONTHS[monthIndex];
      case "MMM":
        return SHORT_MONTHS[monthIndex];
      case "MM":
        return pad2(month);
      case "M":
        return String(month);
      case "DD":
        return pad2(day);
      case "Do":
        return ordinalDay(day);
      case "D":
        return String(day);
      case "WW":
        return pad2(week);
      case "W":
        return String(week);
      case "GGGG":
      case "gggg":
        return pad4(weekYear);
      default:
        return token;
    }
  });
}

function settingText(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

export function periodTitle(kind, date, settings = {}) {
  const rawStart = settings?.weekStart ?? settings?.["compass-week-start"];
  const weekStart = rawStart === "sunday" ? "sunday" : "monday";
  if (kind === "week") {
    const pattern = settingText(settings?.weekFormat ?? settings?.["compass-week-format"], DEFAULT_WEEK_FORMAT);
    return formatPeriod(date, pattern, { weekStart });
  }
  if (kind === "month") {
    const pattern = settingText(settings?.monthFormat ?? settings?.["compass-month-format"], DEFAULT_MONTH_FORMAT);
    return formatPeriod(date, pattern, { weekStart });
  }
  return "";
}

function readFlag(value, fallback) {
  if (value == null || value === "") return fallback;
  if (value === true || value === "on" || value === "true" || value === 1) return true;
  if (value === false || value === "off" || value === "false" || value === 0) return false;
  return Boolean(value);
}

export function periodicPins({ settings = {}, now, daily } = {}) {
  const date = toValidDate(now) ?? new Date();
  const showToday = readFlag(settings?.pinToday ?? settings?.["compass-pin-today"], true);
  const showWeek = readFlag(settings?.pinWeek ?? settings?.["compass-pin-week"], false);
  const showMonth = readFlag(settings?.pinMonth ?? settings?.["compass-pin-month"], false);
  const out = [];

  if (showToday) {
    const fallbackUid = `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}-${pad4(date.getFullYear())}`;
    const uid = typeof daily?.uid === "string" && daily.uid ? daily.uid : fallbackUid;
    const title = typeof daily?.title === "string" && daily.title
      ? daily.title
      : formatPeriod(date, "MMMM Do, YYYY");
    out.push({ id: "today", label: "Today", title, uid });
  }
  if (showWeek) {
    out.push({
      id: "week",
      label: "This week",
      title: periodTitle("week", date, settings),
      uid: null,
    });
  }
  if (showMonth) {
    out.push({
      id: "month",
      label: "This month",
      title: periodTitle("month", date, settings),
      uid: null,
    });
  }
  return out;
}

export function movePin(pins, uid, delta) {
  if (!Array.isArray(pins) || !pins.length || typeof uid !== "string" || !uid || !Number.isFinite(delta)) {
    return pins;
  }
  const from = pins.findIndex((pin) => pin?.uid === uid);
  if (from < 0) return pins;
  const to = Math.max(0, Math.min(pins.length - 1, from + Math.trunc(delta)));
  if (to === from) return pins;
  const next = [...pins];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function reorderPins(pins, uid, beforeUid) {
  if (!Array.isArray(pins) || !pins.length || typeof uid !== "string" || !uid) {
    return pins;
  }
  const from = pins.findIndex((pin) => pin?.uid === uid);
  if (from < 0) return pins;

  if (beforeUid == null) {
    if (from === pins.length - 1) return pins;
    const next = [...pins];
    const [moved] = next.splice(from, 1);
    next.push(moved);
    return next;
  }

  if (typeof beforeUid !== "string" || !beforeUid || beforeUid === uid) return pins;
  const beforeIndex = pins.findIndex((pin) => pin?.uid === beforeUid);
  if (beforeIndex < 0 || from + 1 === beforeIndex) return pins;

  const next = [...pins];
  const [moved] = next.splice(from, 1);
  const insertAt = from < beforeIndex ? beforeIndex - 1 : beforeIndex;
  next.splice(insertAt, 0, moved);
  return next;
}
