import { timed } from "./model.mjs";

export function videoObservations(entry, race) {
  const record = entry.video_laps;
  if (!record || record.youtube_id !== race.clip?.youtube_id || !/^[\w-]{11}$/.test(record.youtube_id)) return [];
  const n = record.expected_segments, laps = record.observations;
  if (!["partial", "matched", "unavailable", "broadcast_difference"].includes(record.total_check) || ![0.5, 1].includes(record.opening_fraction) ||
      !Number.isInteger(n) || n < 1 || n > 100 ||
      !Array.isArray(laps) || !laps.every((p, i) => Number.isInteger(p?.counter) && p.counter >= -1 && p.counter <= n - 2 &&
        Number.isInteger(p.at_ms) && p.at_ms >= race.clip.start * 1000 && p.at_ms <= race.clip.end * 1000 &&
        Number.isInteger(p.confirmed_at_ms) && p.confirmed_at_ms >= p.at_ms + 700 && p.confirmed_at_ms <= Math.min(p.at_ms + 15000, race.clip.end * 1000) &&
        Number.isInteger(p.time_ms) && p.time_ms > 0 && (!i || p.counter < laps[i-1].counter && p.at_ms > laps[i-1].at_ms))) return [];
  if (record.total_check === "broadcast_difference") {
    if (laps.length !== n || !timed(entry)) return [];
    const deltaMs = laps.reduce((total, p) => total + p.time_ms, 0) - entry.time_ms;
    if (record.sum_delta_ms !== deltaMs) return [];
  }
  return laps;
}

export function videoLaps(entry, laps, name, open, { txt, esc, svg }, distance) {
  const record = entry.video_laps;
  const n = record.expected_segments;
  const half = record.opening_fraction === 0.5;
  const sprint = distance === 500;
  const label = i => {
    if (i === 0 && half) return txt("Opening half-lap", "起步半圈", "Demi-tour de départ");
    if (i === 0 && sprint) return txt("Lap 1 · start", "第 1 圈 · 起步", "Tour 1 · départ");
    return txt("Lap ", "整圈 ", "Tour ") + (i + (half ? 0 : 1));
  };
  const segments = Array(n).fill(null);
  for (const lap of laps) segments[n - 2 - lap.counter] = lap;
  // A 500 m standing start is shown separately even when it covers a whole lap.
  const firstPlotted = half || sprint ? 1 : 0;
  const plottedCount = n - firstPlotted;
  const plottedLaps = segments.slice(firstPlotted).filter(Boolean);
  // Beside the 500 m start, the plot narrows on phones. Relative x positions keep
  // the labels and dots at their native pixel size while the time axis stays linear.
  const left = sprint ? 65 : 51, right = sprint ? 334 : 320;
  const horizontal = value => sprint ? `${value / 344 * 100}%` : value;
  const x = i => horizontal(plottedCount === 1 ? Math.floor((left + right) / 2) : left + (i - firstPlotted) * (right - left) / (plottedCount - 1));
  const source = p => `https://www.youtube.com/watch?v=${record.youtube_id}&t=${Math.floor(p.at_ms / 1000)}s`;
  const clock = p => esc(p.time_raw);
  const attrs = (p, title) => `href="${source(p)}" target="_blank" rel="noopener noreferrer" aria-label="${title} · ${clock(p)} ${txt("seconds", "秒", "secondes")}"`;
  function reading(p, i) {
    const title = label(i);
    if (!p) return `<span class="lap-missing"><small>${title}</small><span aria-label="${txt("Time unavailable", "缺少读数", "Temps indisponible")}">—</span></span>`;
    return `<a ${attrs(p, title)}${i < firstPlotted ? ` data-seconds="${clock(p)}"` : ""}><small>${title}</small><b>${clock(p)}</b>${svg("external")}</a>`;
  }
  const opening = firstPlotted ? `<div class="lap-opening lap-readings">${reading(segments[0], 0)}</div>` : "";
  const readings = segments.slice(firstPlotted).map((p, index) => reading(p, index + firstPlotted)).join("");
  const title = txt("Video lap times", "录像圈时", "Temps par tour");
  const scaleLabel = txt("Full laps · seconds", "整圈用时 · 秒", "Tours complets · secondes");
  let diagram = "";
  if (plottedLaps.length) {
    const times = plottedLaps.map(p => p.time_ms);
    const min = Math.min(...times), max = Math.max(...times);
    // Use linear ticks in integer milliseconds and leave room around near-identical readings.
    const target = Math.max(100, (max - min) / 3);
    const unit = 10 ** Math.floor(Math.log10(target));
    const step = [1, 2, 5, 10].find(v => v * unit >= target) * unit;
    let low = Math.floor(min / step) * step, high = Math.ceil(max / step) * step;
    if (high - low < 2 * step) {
      low = Math.max(0, low - step);
      high = Math.max(high, low + 2 * step);
    }
    const y = t => 18 + (t - low) * 69 / (high - low);
    const grid = [];
    for (let t = low; t <= high; t += step) {
      const guide = sprint
        ? `<rect class="lap-grid" x="${horizontal(left)}" y="${y(t)}" width="${horizontal(right - left)}" height="1"/>`
        : `<path class="lap-grid" d="M51 ${y(t)}H320"/>`;
      grid.push(`${guide}<text x="${horizontal(left - 8)}" y="${y(t)+4}" text-anchor="end">${(t / 1000).toFixed(step >= 1000 ? 0 : 1)}</text>`);
    }
    const lines = [], dots = [];
    for (let i = firstPlotted; i < n; i++) {
      const p = segments[i];
      if (!p) continue;
      if (i > firstPlotted && segments[i-1]) lines.push(`<line x1="${x(i-1)}" y1="${y(segments[i-1].time_ms)}" x2="${x(i)}" y2="${y(p.time_ms)}"/>`);
      dots.push(`<a ${attrs(p, label(i))} data-seconds="${clock(p)}"><circle class="point" cx="${x(i)}" cy="${y(p.time_ms)}" r="4"/><circle class="hit" cx="${x(i)}" cy="${y(p.time_ms)}" r="9"/></a>`);
    }
    const ticks = (plottedCount > 1 ? [firstPlotted, n-1] : [firstPlotted]).map(i =>
      `<text x="${x(i)}" y="108" text-anchor="${plottedCount === 1 ? "middle" : i === firstPlotted ? "start" : "end"}">${label(i)}</text>`).join("");
    diagram = `<svg class="lap-plot" ${sprint ? 'height="114"' : 'viewBox="0 0 344 114"'} role="group" aria-label="${esc(name)} · ${scaleLabel}">${grid.join("")}${lines.join("")}${dots.join("")}${ticks}</svg>`;
  }
  const emptyPlot = sprint && !diagram ? `<p class="lap-no-plot">${txt("No later lap times verified.", "后续圈时尚未核实。", "Aucun autre temps par tour vérifié.")}</p>` : "";
  const fullPlot = plottedCount ? `<div class="lap-full"><p class="lap-scale-label">${scaleLabel}</p>${diagram || emptyPlot}<div class="lap-readings">${readings}</div></div>` : "";
  const chart = sprint ? `<div class="lap-start-chart">${opening}${fullPlot}</div>` : opening + fullPlot;
  let status;
  if (["matched", "broadcast_difference"].includes(record.total_check) && Number.isInteger(entry.time_ms) && entry.time_ms > 0) {
    const sumMs = laps.reduce((total, p) => total + p.time_ms, 0);
    const sum = (sumMs / 1000).toFixed(sumMs % 10 === 0 ? 2 : 3);
    const decimals = /[.,](\d{1,3})$/.exec(entry.time_raw || "")?.[1].length ?? 3;
    const official = (entry.time_ms / 1000).toFixed(decimals);
    status = txt(`Broadcast total ${sum} s · Official finish ${official} s`, `转播合计 ${sum} 秒 · 官方完赛 ${official} 秒`, `Total vidéo : ${sum} s · Temps officiel : ${official} s`);
    if (record.total_check === "broadcast_difference") {
      const deltaMs = sumMs - entry.time_ms;
      const gap = (deltaMs < 0 ? "−" : "+") + (Math.abs(deltaMs) / 1000).toFixed(3);
      status += txt(` · ${gap} s vs official`, ` · 相对官方 ${gap} 秒`, ` · ${gap} s par rapport au temps officiel`);
    }
  } else {
    status = laps.length < n ? txt("Dashes mark splits without a confirmed time.", "横杠表示该段尚无可核实的读数。", "Les tirets indiquent des temps qui restent à confirmer.")
      : txt("Official finish time unavailable for comparison.", "暂无官方完赛用时可供核对。", "Temps officiel indisponible pour la comparaison.");
  }
  return `<details class="splits video-laps" name="race-video-laps"${open ? " open" : ""}><summary aria-label="${esc(name)} · ${title}">${svg("chevron")}${title}<span class="lap-count">${laps.length}/${n} ${txt("splits","段", "temps intermédiaires")}</span></summary><div class="lap-evidence"><p class="lap-caption">${txt("Unofficial broadcast timing · seconds","非官方转播计时 · 秒", "Chronométrage vidéo non officiel · secondes")}</p>${chart}${status ? `<p class="lap-status">${status}</p>` : ""}</div></details>`;
}
