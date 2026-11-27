export const norm = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function matches(needle, ...fields) {
  const haystack = fields.flat(Infinity).map(norm).join(" ");
  return norm(needle)
    .split(" ")
    .every((token) => haystack.includes(token));
}
export function displayName(name = "") {
  const parts = String(name).split(",");
  return parts.length === 2
    ? parts[1].trim() + " " + parts[0].trim()
    : String(name);
}
export function groupAthleteNames(athletes) {
  const groups = new Map();
  for (const athlete of athletes) {
    const name = displayName(athlete.name).normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
    const key = name || athlete;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(athlete);
  }
  return [...groups.values()];
}
export function timed(row) {
  const status = String(row.status ?? "")
    .trim()
    .toUpperCase();
  return (
    typeof row.time_ms === "number" &&
    Number.isFinite(row.time_ms) &&
    row.time_ms > 0 &&
    !row.suspect &&
    (!status || ["OK", "FIN", "FINISHED", "VALID"].includes(status))
  );
}
export function condition(row) {
  const fields = [
    row.discipline,
    row.distance,
    row.track,
    row.timing,
    row.format,
  ].map((x) =>
    String(x ?? "")
      .trim()
      .toLowerCase(),
  );
  return JSON.stringify([
    ...fields,
    fields.some(
      (x) =>
        !x || ["unknown", "unspecified", "n/a", "?", "unreported"].includes(x),
    )
      ? String(row.event_id)
      : "",
  ]);
}
export function time(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.floor(ms / 1000),
    min = Math.floor(seconds / 60);
  return (
    (min
      ? min + ":" + String(seconds % 60).padStart(2, "0")
      : String(seconds)) +
    "." +
    String(Math.round(ms) % 1000).padStart(3, "0")
  );
}
export function resultTime(r) {
  if (!timed(r)) return r.status || "—";
  return r.time_raw?.replace(/\s*:\s*/g, ":") || time(r.time_ms);
}
export function best(rows) {
  return rows
    .filter(timed)
    .reduce((a, b) => (!a || b.time_ms < a.time_ms ? b : a), null);
}
export const unique = (a) => [
  ...new Set(
    a.filter((x) => x !== null && x !== undefined && String(x) !== ""),
  ),
];
export const dateOrder = (a, b) =>
  String(a.date || "").localeCompare(String(b.date || ""));
export const raceDate = (r) => r.date || r.event_date || "";
const raceLabels = new Intl.Collator("en", {numeric: true, sensitivity: "base"});
export function startOrder(a, b) {
  return raceDate(a).localeCompare(raceDate(b))
    || raceLabels.compare(a.event_id, b.event_id)
    || raceLabels.compare(a.label || a.race_id, b.label || b.race_id)
    || raceLabels.compare(a.race_id, b.race_id);
}
export const safeSource = (url) => {
  try {
    const u = new URL(url);
    return ["https:", "http:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
};

export function beforeRace(row, current) {
  if (!row.date || !current.date) return false;
  if (row.date !== current.date) return row.date < current.date;
  if (
    row.event_id !== current.event_id ||
    row.discipline !== "ST" ||
    current.discipline !== "ST"
  )
    return false;
  const sourceNumber = (r) =>
    String(r.label ?? "").match(/^(\d+)[A-Z]+$/i)?.[1];
  const earlier = sourceNumber(row),
    later = sourceNumber(current);
  return Boolean(earlier && later && Number(earlier) < Number(later));
}
