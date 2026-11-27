import { norm } from "./model.mjs";
const monthDayLabel = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
const weekdayLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });

function title(name, date) {
  const day = new Date(date + "T12:00:00Z");
  if (!Number.isFinite(+day)) return "";
  const monthDay = monthDayLabel.format(day).toLowerCase();
  const weekday = weekdayLabel.format(day).toLowerCase();
  return norm(name).replace(/^(?:20\d\d|\d\d \d\d) /, "").replace(/\b(?:long|short) track\b/g, "")
    .replace(new RegExp("^" + monthDay + " "), "").replace(new RegExp(" " + weekday + "$"), "")
    .replace(/\btime trials\b/g, "time trial").replace(/\s+/g, " ").trim();
}

function sameVenue(prep, result) {
  const places = (row) => String(row.location || "").split(/[,·]/).map(norm)
    .filter(v => v.length > 2 && !["canada", "unknown", "tbc", "tbd", "various"].includes(v));
  const city = places(prep).at(-1);
  return city && city === places(result).at(-1);
}

export function meetLinks(preparations, results) {
  const byPrep = new Map(), byResult = new Map();
  for (const prep of preparations) {
    if (!prep.province || prep.listing_removed) continue;
    const name = title(prep.name, prep.start);
    if (!name) continue;
    const tracks = String(prep.discipline || "").split("/");
    const candidates = results.filter(r => r.date >= prep.start && (r.end_date || r.date) >= r.date
      && (r.end_date || r.date) <= (prep.end || prep.start)
      && r.province === prep.province && tracks.includes(r.discipline)
      && sameVenue(prep, r) && name === title(r.name, r.date));
    for (const result of candidates) {
      if (candidates.filter(other => other.discipline === result.discipline).length !== 1) continue;
      // Two independently listed meets may still have the same date and name in one city.
      if (byResult.has(result.id)) byResult.set(result.id, null);
      else byResult.set(result.id, prep.id);
    }
  }
  for (const result of results) {
    const prepId = byResult.get(result.id);
    if (!prepId) continue;
    if (!byPrep.has(prepId)) byPrep.set(prepId, []);
    byPrep.get(prepId).push(result);
  }
  return { byPrep, byResult };
}
