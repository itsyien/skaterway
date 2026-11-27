import { condition, timed, unique } from "./model.mjs";

export const seasonEvent = (row) => row.discipline + "-" + Number(row.distance);

export function compareSeason(athletes, selection) {
  const results = athletes.map((a) => (a.results || []).filter(
    (r) => r.season && r.discipline && Number(r.distance) > 0,
  ));
  const eventsFor = (sets) => {
    const right = new Set(sets[1].map(seasonEvent));
    return [...new Map(sets[0].map((r) => [seasonEvent(r), r])).values()]
      .filter((r) => right.has(seasonEvent(r)))
      .sort((a, b) => a.discipline.localeCompare(b.discipline) || a.distance - b.distance);
  };
  const inSeason = (value) => results.map((rows) => rows.filter((r) => r.season === value));
  const seasons = unique(results[0].map((r) => r.season))
    .filter((s) => eventsFor(inSeason(s)).length).sort().reverse();
  const season = selection.season === "all" || seasons.includes(selection.season)
    ? selection.season : seasons[0] || "all";
  const rows = season === "all" ? results : inSeason(season);
  const events = eventsFor(rows);
  const counts = rows.map((starts) => {
    const byEvent = new Map();
    for (const r of starts.filter(timed)) {
      const key = seasonEvent(r);
      byEvent.set(key, (byEvent.get(key) || 0) + 1);
    }
    return byEvent;
  });
  const support = (r) => Math.min(...counts.map((values) => values.get(seasonEvent(r)) || 0));
  const selected = events.find((r) => seasonEvent(r) === selection.seasonEvent)
    || [...events].sort((a, b) => support(b) - support(a))[0];
  const event = selected && seasonEvent(selected);
  const series = athletes.map((a, i) => ({
    id: a.id, name: a.name, rows: rows[i].filter((r) => seasonEvent(r) === event),
  }));
  return { seasons, season, events, event, series };
}

export function comparableGap(a, b) {
  return a && b && timed(a) && timed(b) && condition(a) === condition(b)
    ? Math.abs(a.time_ms - b.time_ms) : null;
}
