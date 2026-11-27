import { raceDate, startOrder, timed } from "./model.mjs";

export function chartStatus(row) {
  const value = String(row.status || "").trim().toUpperCase();
  if (["OK", "FIN", "FINISHED", "VALID"].includes(value)) return "";
  return /^[A-Z][A-Z0-9 /-]*$/.test(value) ? value : "";
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
}

function ordinaryTimes(rows) {
  const times = rows.filter(timed).map(r => r.time_ms);
  if (times.length < 4) return times;
  const middle = median(times);
  const deviation = median(times.map(t => Math.abs(t - middle)));
  const limit = middle + Math.max(middle * 0.15, 6 * deviation);
  const core = times.filter(t => t <= limit);
  // A sustained change of pace belongs on the axis, even with tightly clustered earlier times.
  return core.length >= times.length * 0.75 ? core : times;
}

export function historyPlot(input) {
  const series = input.map(s => ({ ...s, rows: s.rows.filter(r =>
    Number.isFinite(Date.parse(raceDate(r))) && (timed(r) || chartStatus(r))).sort(startOrder) }));
  const times = series.flatMap(s => ordinaryTimes(s.rows));
  return { series, rows: series.flatMap(s => s.rows).sort(startOrder),
    low: times.length ? Math.min(...times) : null, high: times.length ? Math.max(...times) : null };
}
