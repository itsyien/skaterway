import { videoObservations, videoLaps } from "./video-lap-chart.mjs";
import { compactDistance, longRaceTitle, programGroups } from "./event-program.mjs";
import { compareSeason, comparableGap, seasonEvent } from "./season-compare.mjs";
import { localDay, renderPrepare, renderMeetPage } from "./prep.mjs";
import { meetLinks } from "./meet-links.mjs";
import { watchResults } from "./race-live.mjs";
import { updateEntryCheck } from "./entry-check.mjs";
import { meetBadges } from "./meet-badges.mjs";
import { organizationSearch } from "./organization-search.mjs";
import { chartStatus, historyPlot } from "./history-plot.mjs";
import {
  matches,
  displayName,
  groupAthleteNames,
  condition,
  timed,
  time,
  resultTime,
  best,
  unique,
  dateOrder,
  raceDate,
  startOrder,
  safeSource,
  beforeRace,
} from "./model.mjs";

const main = document.querySelector("main");
const cache = new Map();
const locales = { en: "en-CA", zh: "zh-CN", fr: "fr-CA" };
const languagePicker = document.querySelector("#language");
let savedLanguage;
try { savedLanguage = localStorage.getItem("oval-locale"); } catch { /* Storage is optional in private browsing. */ }
let language = Object.hasOwn(locales, savedLanguage) ? savedLanguage : "en";
const locale = () => locales[language];
const txt = (en, zh, fr) => (language === "fr" ? fr : language === "zh" ? zh : en) ?? en;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
let index,
  generation = 0;
// A history entry owns its view, even when two visits have the same address.
const views = new Map();
let visitNumber = 0;
const newVisit = (parent = null) => ({ id: performance.timeOrigin + "/" + ++visitNumber, parent });
let visit = history.state?.ovalVisit || newVisit();
let currentHash = location.hash || "#/";
history.replaceState({ ...history.state, ovalVisit: visit }, "");
const fmt = (n) => Number(n || 0).toLocaleString(locale());
const season = (v) =>
  String(v || "").replace(
    /^(\d{4})-(\d{4})$/,
    (_, a, b) => a + "–" + b.slice(2),
  );
const labels = {
  ST: ["Short track", "短道", "Courte piste"],
  LT: ["Long track", "大道", "Longue piste"],
  complete: ["Verified results", "成绩已核齐", "Résultats vérifiés"],
  partial: ["Partial results", "部分成绩", "Résultats partiels"],
  listed: ["Meet listed", "仅有赛事目录", "Compétition au répertoire"],
  unknown: ["Unspecified", "未注明", "Non indiqué"],
  electronic: ["Electronic", "电子计时", "Électronique"],
  manual: ["Hand timed", "手计时", "Manuel"],
  individual: ["Individual", "个人项目", "Individuel"],
  "oval-system": ["Oval timing system", "场馆计时系统", "Système de chronométrage de l’anneau"],
  semifinal: ["Semifinal", "半决赛", "Demi-finale"],
  "semifinal repechage": ["Semifinal repechage", "半决赛复活赛", "Repêchage de demi-finale"],
  heat: ["Heat", "预赛", "Série"],
  final: ["Final", "决赛", "Finale"],
  "semi final": ["Semifinal", "半决赛", "Demi-finale"],
};
const local = (v) =>
  labels[v]
    ? txt(...labels[v])
    : labels[String(v).toLowerCase()]
      ? txt(...labels[String(v).toLowerCase()])
      : String(v ?? "");
const pretty = (date, style = "long") => {
  const s = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  return new Date(s + "T12:00:00Z").toLocaleDateString(
    locale(),
    {
      month: style === "long" ? "long" : "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    },
  );
};
const length = (v) =>
  /^\d+(\.\d+)?$/.test(String(v)) ? v + " m" : String(v || "—");
const underReview = () => txt("Update under review", "修订待核实", "Mise à jour en cours de vérification");
const coverage = (v) =>
  `<span class="state ${esc(v)}"><i></i>${esc(local(v))}</span>`;
const svg = (name) => {
  const paths = {
    search: '<circle cx="9.8" cy="9.8" r="6.6"/><path d="m15 15 5.4 5.4"/>',
    arrow: '<path d="M4 12h15m-6.5-6.5L19 12l-6.5 6.5"/>',
    external: '<path d="M7 17 18 6m-9 0h9v9"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    filter:
      '<path d="M3 7h8m5 0h5M3 17h3m6 0h9"/><circle cx="13" cy="7" r="2.6"/><circle cx="9" cy="17" r="2.6"/>',
    play: '<path fill="currentColor" stroke="none" d="M7 4.8a.8.8 0 0 1 1.2-.7l11.2 7.2a.8.8 0 0 1 0 1.4L8.2 19.9A.8.8 0 0 1 7 19.2z"/>',
    compare: '<path d="M3 7h15l-3-3m3 3-3 3M21 17H6l3-3m-3 3 3 3"/>',
    back: '<path d="M20 12H5l6-6m-6 6 6 6"/>',
    pin: '<path d="M18 10c0 4-6 10-6 10s-6-6-6-10a6 6 0 0 1 12 0z"/><circle cx="12" cy="10" r="2"/>',
  };
  return `<svg class="icon" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ""}</svg>`;
};
function route(path = "", params = {}) {
  if (path.startsWith("athlete/")) {
    const segment = path.slice("athlete/".length);
    const person = athletesById.get(canonicalAthlete(segment));
    path = "athlete/" + encodeURIComponent(person?.slug || person?.id || segment);
  }
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && String(v) !== "") q.set(k, v);
  return "#/" + path + (q.size ? "?" + q : "");
}
function pathState(hash = location.hash) {
  const [p, query = ""] = hash.slice(1).replace(/^\/?/, "").split("?");
  const parts = p.split("/").filter(Boolean);
  if (parts[0] === "athlete" && parts[1]?.includes("%")) {
    try { parts[1] = decodeURIComponent(parts[1]); } catch { /* Unknown route. */ }
  }
  return {
    parts,
    params: Object.fromEntries(new URLSearchParams(query)),
  };
}
function link(path, params, label, cls = "") {
  return `<a class="${cls}" href="${esc(route(path, params))}">${label}</a>`;
}
function source(url, label) {
  const safe = safeSource(url);
  if (!label)
    label =
      safe && /(^|\.)speedskatingresults\.com$/i.test(new URL(safe).hostname)
        ? "SpeedskatingResults.com"
        : txt("Official source", "官方来源", "Source officielle");
  return safe
    ? `<a class="source" href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(label)} ${svg("external")}</a>`
    : "";
}
let athletesById = new Map(), slugOwners = new Map();
let organizations;
function useIndex(next) {
  if (next === index) return;
  index = next;
  organizations = organizationSearch(index.organizations);
  athletesById = new Map(index.athletes.map((person) => [person.id, person]));
  slugOwners = new Map(Object.entries(index.athlete_slug_aliases || {}));
  for (const person of index.athletes) {
    if (person.slug) slugOwners.set(person.slug, person.id);
  }
}
function canonicalAthlete(id) {
  const aliases = index?.athlete_aliases;
  return aliases && Object.hasOwn(aliases, id) ? aliases[id] : slugOwners.get(id) || id;
}
class PageNotFound extends Error {}
async function data(path) {
  if (path.startsWith("athletes/")) {
    path = "athletes/" + encodeURIComponent(canonicalAthlete(decodeURIComponent(path.slice(9))));
  }
  const resource =
    path !== "index" && index?.generation
      ? index.generation + "/" + path
      : path;
  if (!cache.has(resource))
    cache.set(
      resource,
      fetch(
        "./data/" + resource + ".json",
        path === "index" ? { cache: "no-cache" } : {},
      )
        .then(async (r) => {
          if (
            path !== "index" &&
            index?.generation &&
            [404, 410].includes(r.status)
          ) {
            const previousVersion = index.generation;
            cache.delete("index");
            const latestIndex = await data("index");
            if (latestIndex.generation !== previousVersion) {
              useIndex(latestIndex);
              return data(path);
            }
            const [kind, id] = path.split("/");
            const key = decodeURIComponent(id);
            if ((kind === "events" && !latestIndex.events.some(e => e.id === key)) ||
                (kind === "athletes" && !athletesById.has(key))) throw new PageNotFound();
          }
          if (!r.ok) throw Error(String(r.status));
          return r.json();
        })
        .catch((e) => {
          cache.delete(resource);
          throw e;
        }),
    );
  return cache.get(resource);
}
let prepFeed, prepFetched = 0;
async function preparationData() {
  if (prepFeed && Date.now() - prepFetched < 300_000) return prepFeed;
  try {
    const response = await fetch("./data/prep.json", { cache: "no-cache" });
    if (!response.ok) throw Error(String(response.status));
    const feed = await response.json();
    if (!Array.isArray(feed.events)) throw Error("Invalid calendar");
    prepFeed = feed;
    prepFetched = Date.now();
  } catch (error) {
    if (!prepFeed) throw error;
  }
  return prepFeed;
}
let linkedCalendar;
function calendarLinks(feed) {
  if (!linkedCalendar || linkedCalendar.feed !== feed || linkedCalendar.index !== index) {
    linkedCalendar = { feed, index, links: meetLinks([...feed.events, ...(feed.past || [])], index.events) };
  }
  return linkedCalendar.links;
}
let pendingLinks;
async function incomingPrepResults(id, generation) {
  const feed = prepFeed;
  if (!feed) return [];
  if (pendingLinks?.generation !== generation || pendingLinks.feed !== feed) {
    const links = fetch("./data/index.json", { cache: "no-cache" }).then(async response => {
      if (!response.ok) throw Error(String(response.status));
      const incoming = await response.json();
      if (incoming.generation !== generation || !Array.isArray(incoming.events)) throw Error("Snapshot changed");
      return meetLinks([...feed.events, ...(feed.past || [])], incoming.events).byPrep;
    });
    pendingLinks = { generation, feed, links };
  }
  const pending = pendingLinks;
  try {
    return ((await pending.links).get(id) || []).map(event => event.id);
  } catch (error) {
    if (pendingLinks === pending) pendingLinks = null;
    throw error;
  }
}
async function preparationMeet(feed, id) {
  const current = feed.events.find(e => e.id === id);
  if (current) return current;
  if (!/^[\w-]{1,160}$/.test(id)) throw new PageNotFound();
  const response = await fetch("./data/prep-meets/" + id + ".json", { cache: "no-cache" });
  if (response.status === 404 && !(feed.past || []).some(e => e.id === id)) throw new PageNotFound();
  if (!response.ok) throw Error(String(response.status));
  const archived = await response.json();
  if (archived.id !== id) throw Error("Mismatched meet ID");
  return archived;
}
function header(section) {
  document.documentElement.lang = language;
  languagePicker.value = language;
  languagePicker.setAttribute("aria-label", txt("Language", "语言", "Langue"));
  document.querySelector("#site-info").setAttribute("aria-label", txt("Information", "网站信息", "Informations"));
  document.querySelector("#preview-notice").textContent = txt(
    "Beta · Results from meets with ties to Alberta. More regions to come.",
    "测试版 · 成绩暂限阿尔伯塔省相关赛事，更多地区将陆续加入。",
    "Bêta · Résultats des compétitions liées à l’Alberta. D’autres régions suivront.",
  );
  const description = txt(
    "Check the Canadian meet calendar, find results and replays for Alberta-related meets, or compare two skaters.",
    "查看加拿大速滑赛历、阿尔伯塔省相关赛事的成绩和录像，或对比两位运动员。",
    "Consultez le calendrier canadien, les résultats et les vidéos des compétitions liées à l’Alberta. Comparez deux patineurs.",
  );
  for (const meta of document.querySelectorAll('meta[name="description"], meta[property="og:description"]'))
    meta.content = description;
  document.querySelector("#skip").textContent = txt(
    "Skip to content",
    "跳到正文",
    "Aller au contenu",
  );
  document
    .querySelector("nav")
    .setAttribute("aria-label", txt("Main navigation", "主导航", "Navigation principale"));
  document.querySelector("nav").innerHTML = [
    ["", txt("Overview", "概览", "Accueil")],
    ["athletes", txt("Athletes", "运动员", "Athlètes")],
    ["events", txt("Competitions", "赛事", "Compétitions"), txt("Meets", "赛事", "Épreuves")],
    ["prepare", txt("Race prep", "赛前准备", "Avant-course")],
    ["tools", txt("Tools", "工具", "Outils")],
  ]
    .map(
      ([p, label, short]) =>
        `<a href="${route(p)}" ${short && short !== label ? `aria-label="${label} · ${short}"` : ""} ${section === p ? 'aria-current="page"' : ""}>${short ? `<span class="nav-full">${label}</span><span class="nav-short">${short}</span>` : label}</a>`,
    )
    .join("");
  const syncStamp = (value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date.toLocaleString(locale(), {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—";
  };
  document.querySelector("#source-note").textContent = txt(
    "Profiles use public meet records. We never collect contact details or other private information for them. For reference only. Official results take precedence.",
    "档案来自公开赛事记录。建档时不收集运动员的联系方式或其他非公开个人信息。档案仅供参考，成绩以主办方正式发布为准。",
    "Les profils reprennent les résultats publics des compétitions. Nous ne recueillons ni coordonnées ni renseignements privés pour ces profils. Les résultats officiels font foi.",
  );
  document.querySelector("#updated").textContent = [
    section !== "prepare" && index?.checked
      ? txt("Last checked ", "最近检查 ", "Dernière vérification le ") + syncStamp(index.checked)
      : "",
    section !== "prepare" && index?.updated
      ? txt("Results updated ", "成绩更新 ", "Résultats mis à jour le ") + syncStamp(index.updated)
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
function select(key, label, items, selected, all = txt("All", "全部", "Tout")) {
  const options =
    (all === null ? "" : `<option value="">${esc(all)}</option>`) +
    items
      .map((value) => {
        const [v, l] = Array.isArray(value) ? value : [value, local(value)];
        return `<option value="${esc(v)}" ${String(selected ?? "") === String(v) ? "selected" : ""}>${esc(l)}</option>`;
      })
      .join("");
  return `<label class="select"><span>${esc(label)}</span><select data-filter="${esc(key)}">${options}</select></label>`;
}
function queryForm(path, q, placeholder, hero = false, extra = {}, label) {
  return `<form class="find ${hero ? "hero-find" : ""}" data-path="${esc(path)}">${svg("search")}<label class="search-field"><span>${label || (path === "events" ? txt("Find a meet", "赛事搜索", "Rechercher une compétition") : txt("Find a skater", "运动员搜索", "Rechercher un athlète"))}</span><input type="search" name="q" placeholder="${esc(placeholder)}" value="${esc(q)}"></label>${Object.entries(
    extra,
  )
    .filter(([k, v]) => k !== "q" && v)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join(
      "",
    )}<button class="primary" aria-label="${txt("Search", "搜索", "Rechercher")}" type="submit"><span>${txt("Search", "搜索", "Rechercher")}</span>${svg("arrow")}</button></form>`;
}
function filters(path, params, html) {
  const active = Object.entries(params).filter(
    ([k, v]) =>
      v &&
      [
        "season",
        "discipline",
        "location",
        "province",
        "club",
        "round",
        "distance",
        "group",
        "coverage",
      ].includes(k),
  );
  return `<details class="more" ${active.length ? "open" : ""}><summary>${svg("filter")}${txt("Filters", "筛选", "Filtres")}${active.length ? ` (${active.length})` : ""}</summary><div class="filter-fields">${html}${active.length ? link(path, { q: params.q }, txt("Clear filters", "清除筛选", "Effacer les filtres"), "under") : ""}</div></details>`;
}
const latest = () => [...index.events].sort((a, b) => dateOrder(b, a));
const recentVerified = () => latest().find((e) => e.count > 0);
function home() {
  const rec = recentVerified();
  return `<section class="hero" data-enter><div class="lanes" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><b></b></div><div class="hero-copy"><p class="eyebrow"><i></i>${txt("Canadian competition archive", "加拿大赛事档案", "Archives des compétitions canadiennes")}</p><h1>${txt("Speed skating<br>results.", "速滑成绩库。", "Résultats de<br>patinage de vitesse.")}</h1>${queryForm("athletes", "", athleteSearchHint(), true)}</div>${rec ? link("event/" + rec.id, {}, `<small>${txt("Latest meet results", "最近赛事成绩", "Derniers résultats")}</small><strong>${esc(rec.name)}</strong><span>${esc(pretty(rec.date, "short"))}</span>${svg("arrow")}`, "featured") : ""}</section>
 <div class="counts">${[
   [fmt(index.athletes.length), txt("Athlete profiles", "运动员档案", "Profils d’athlètes")],
   [fmt(index.events.length), txt("Competitions", "赛事", "Compétitions")],
   [
     fmt(unique(index.events.map((e) => e.season)).length),
     txt("Seasons covered", "已收录赛季", "Saisons couvertes"),
   ],
 ]
   .map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`)
   .join("")}</div>
 <section class="block"><div class="section-head"><h2>${txt("Recent competitions", "近期赛事", "Compétitions récentes")}</h2>${link("events", {}, txt("All competitions", "全部赛事", "Toutes les compétitions") + " " + svg("arrow"), "under")}</div>${eventRows(latest().slice(0, 6))}</section>`;
}
function eventRows(rows) {
  if (!rows.length) return empty();
  return `<div class="rows">${rows
    .map((e) => {
      const date = String(e.date || "").slice(0, 10);
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
      const d = new Date(valid ? date + "T12:00:00Z" : "2000-01-01T12:00:00Z");
      return link(
        "event/" + e.id,
        {},
        `<span class="date-tile">${valid ? `<small>${esc(d.toLocaleDateString(locale(), { month: "short", timeZone: "UTC" }))}</small><b>${date.slice(8)}</b>` : "—"}</span><span class="row-main"><strong>${esc(e.name)}</strong><small>${esc([e.location, e.season ? season(e.season) : ""].filter(Boolean).join(" · "))}</small></span><span class="event-meta">${meetBadges(e, txt)}${e.review ? '<span class="state partial"><i></i>' + underReview() + "</span>" : coverage(e.coverage)}</span>${svg("chevron")}`,
        "row event-row",
      );
    })
    .join("")}</div>`;
}
function empty(label = txt("No matching results", "没有符合条件的结果", "Aucun résultat")) {
  return `<div class="empty">${esc(label)}</div>`;
}
const ordered = (arr) =>
  unique(arr).sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true }),
  );
function pager(path, p, n, limit = 30) {
  if (n <= limit) return "";
  const pages = Math.ceil(n / limit),
    page = Math.min(pages, Math.max(1, Number(p.page) || 1));
  return `<div class="pager">${page > 1 ? link(path, { ...p, page: page - 1 }, txt("Previous", "上一页", "Précédent"), "secondary") : ""}<span>${page} / ${pages}</span>${page < pages ? link(path, { ...p, page: page + 1 }, txt("Next", "下一页", "Suivant"), "secondary") : ""}</div>`;
}
function pageSlice(rows, page) {
  const n = Math.min(
    Math.ceil(rows.length / 30) || 1,
    Math.max(1, Number(page) || 1),
  );
  return rows.slice((n - 1) * 30, n * 30);
}
function athleteRows(groups, path, params = {}, directory = false) {
  const avatar = (name) => directory
    ? `<span class="avatar" aria-hidden="true">${esc(initials(name))}</span>` : "";
  const starts = (a) => `<span class="count">${fmt(a.count)} ${txt(a.count === 1 ? "start" : "starts", "场", a.count === 1 ? "départ" : "départs")}</span>`;
  if (!groups.length) return empty();
  return `<div class="rows${directory ? "" : " compact"}">${groups.map(([first, ...others]) => {
    const name = displayName(first.name);
    if (!others.length) {
      return link(path + first.id, params, `${avatar(name)}<span class="row-main"><strong>${esc(name)}</strong><small>${esc(identity(first) || "—")}</small></span>${directory ? starts(first) : ""}${svg("chevron")}`, "row");
    }
    const count = fmt(others.length + 1) + " " + txt("profiles", "份档案", " profils");
    const choices = [first, ...others].map(a => {
      const affiliation = identity(a) || txt("Club unspecified", "俱乐部未注明", "Club non indiqué");
      return link(path + a.id, params, `<span class="row-main"><span class="sr-only">${esc(name)} · </span><strong>${esc(affiliation)}</strong></span>${starts(a)}${svg("chevron")}`, "row athlete-option");
    }).join("");
    return `<details class="athlete-group"><summary class="row">${avatar(name)}<span class="row-main"><strong>${esc(name)}</strong></span><span class="count">${count}</span>${svg("chevron")}</summary><div class="athlete-options">${choices}</div></details>`;
  }).join("")}</div>`;
}
function directory(p, athletes) {
  const path = athletes ? "athletes" : "events",
    title = athletes ? txt("Athletes", "运动员", "Athlètes") : txt("Competitions", "赛事", "Compétitions");
  let rows, fields;
  if (athletes) {
    const matchesAthlete = organizations.compile(p.q);
    const matchesClub = organizations.organization(p.club)
      ? organizations.compile(p.club)
      : a => !p.club || [a.club, ...(a.clubs || [])].includes(p.club);
    rows = groupAthleteNames(index.athletes
      .filter(a => matchesAthlete(a) && matchesClub(a))
      .sort(
        (a, b) =>
          (p.q
            ? Number(Boolean(a.scope_event)) - Number(Boolean(b.scope_event))
            : 0) ||
          displayName(a.name).localeCompare(displayName(b.name)) ||
          String(b.scope_date || "").localeCompare(String(a.scope_date || "")),
      ));
    fields = select(
      "club",
      txt("Club", "俱乐部", "Club"),
      ordered(index.athletes.flatMap((a) => a.clubs || [a.club])),
      p.club,
    );
  } else {
    rows = latest().filter(
      (e) =>
        matches(p.q, e.name, e.location, e.province) &&
        ["season", "discipline", "location", "province", "coverage"].every(
          (k) => !p[k] || p[k] === String(e[k]),
        ),
    );
    fields = [
      ["discipline", txt("Discipline", "项目", "Discipline")],
      ["season", txt("Season", "赛季", "Saison")],
      ["location", txt("Location", "城市", "Lieu")],
      ["province", txt("Province", "省份", "Province")],
      ["coverage", txt("Coverage", "收录状态", "État des résultats")],
    ]
      .map(([k, l]) =>
        select(
          k,
          l,
          ordered(index.events.map((x) => x[k])).map((v) => [
            v,
            k === "season" ? season(v) : local(v),
          ]),
          p[k],
        ),
      )
      .join("");
  }
  const list = pageSlice(rows, p.page);
  return `<div class="page-heading"><h1>${title}</h1><span class="total">${fmt(rows.length)}</span></div><div class="toolbar">${queryForm(path, p.q, athletes ? athleteSearchHint() : txt("Meet name or city", "赛事名称或城市", "Compétition ou ville"), false, p)}${filters(path, p, fields)}</div>${athletes ? organizationCard(p.q) || organizationCard(p.club) : ""}${athletes ? athleteRows(list, "athlete/", {}, true) : eventRows(list)}${pager(path, p, rows.length)}`;
}
function athleteSearchHint() {
  return txt("Name, club or region", "姓名、俱乐部或地区", "Nom, club ou région");
}
function organizationCard(query) {
  const org = organizations.organization(query) || organizations.area(query);
  if (!org) return "";
  const url = safeSource(org.url || index.organizations?.clubDirectory);
  if (!url) return "";
  const label = org.listing || !org.url ? txt("Official directory", "官方名录", "Répertoire officiel") : txt("Official website", "官方网站", "Site officiel");
  const kind = org.area ? txt("City", "城市", "Ville") : org.code ? txt("Regional association", "省区协会", "Association régionale") : txt("Skating club", "速滑俱乐部", "Club de patinage");
  return `<a class="organization-card" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><span class="organization-title"><small>${kind} · ${esc(org.code || org.region)}</small><strong>${esc(org.name)}</strong></span><span class="organization-website">${label} ${svg("external")}</span></a>`;
}
function initials(name) {
  return displayName(name)
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0])
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .join("")
    .toUpperCase();
}
function pageLabel(hash) {
  const [page, id, second] = pathState(hash).parts;
  if (page === "athlete") {
    const person = athletesById.get(canonicalAthlete(id));
    return person && displayName(person.name);
  }
  if (page === "event") return index?.events.find((e) => e.id === id)?.name;
  if (page === "compare") {
    if (second) return txt("Athlete comparison", "运动员对比", "Comparer des athlètes");
    return id ? txt("Choose a second athlete", "选择另一位运动员", "Choisir le deuxième athlète") : txt("Choose the first athlete", "选择第一位运动员", "Choisir le premier athlète");
  }
  if (page === "tools") return txt("Tools", "工具", "Outils");
  if (page === "prepare") {
    if (id) return [...(prepFeed?.events || []), ...(prepFeed?.past || [])].find(e => e.id === id)?.name || txt("Meet information", "赛事资料", "Informations sur la compétition");
    return txt("Race prep", "赛前准备", "Avant-course");
  }
  if (page === "race") return txt("Race results", "单场成绩", "Résultats par course");
  if (page === "athletes") return txt("Athletes", "运动员", "Athlètes");
  if (page === "events") return txt("Competitions", "赛事", "Compétitions");
  if (!page) return txt("Overview", "概览", "Accueil");
}
function breadcrumb(path, params, label, sharedOrigin) {
  const origin = visit.parent?.hash || sharedOrigin;
  const originLabel = origin && pageLabel(origin);
  const href = originLabel ? origin : route(path, params);
  return `<a class="back" href="${esc(href)}">${svg("back")} ${esc(originLabel || label)}</a>`;
}
function racePath(r, who) {
  return route("race/" + r.event_id + "/" + r.race_id, { athlete: who, from: currentHash });
}
// Shared race links may point back to one internal source view and its filters.
function sharedRaceOrigin(hash, event, athlete) {
  if (!hash?.startsWith("#/")) return;
  const { parts, params } = pathState(hash);
  const [page, first] = parts;
  const ids = parts.slice(1);
  if (page === "event") {
    if (ids.length !== 1 || first !== event.id) return;
  } else {
    const expected = { athlete: 1, compare: 2 }[page];
    if (!expected || ids.length !== expected || !athlete) return;
    const people = ids.map(canonicalAthlete);
    if (!people.includes(athlete.id) || !people.every((id) => athletesById.has(id))) return;
    parts.splice(1, ids.length, ...people);
  }
  delete params.from;
  return route(parts.join("/"), params);
}
function condLabel(r) {
  const extra = [
    r.track ? length(r.track) : "",
    r.timing ? local(r.timing) : "",
    r.format ? local(r.format) : "",
  ].filter(Boolean);
  const meet = JSON.parse(condition(r)).at(-1)
    ? [r.event_name, season(r.season)].filter(Boolean).join(" · ")
    : "";
  return [local(r.discipline) + " " + length(r.distance), meet, ...extra]
    .filter(Boolean)
    .join(" · ");
}
function optionsFor(rows) {
  const by = new Map();
  for (const r of [...rows].sort(
    (a, b) => Number(a.distance) - Number(b.distance) || dateOrder(b, a),
  ))
    if (r.distance) by.set(condition(r), r);
  return [...by].map(([k, r]) => [k, condLabel(r)]);
}

function identity(a) {
  const scope = a.scope_meet
    ? [
        txt("Meet record", "单站记录", "Fiche de la compétition"),
        a.scope_meet,
        a.scope_date ? pretty(a.scope_date, "short") : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  return [a.club, scope].filter(Boolean).join(" · ");
}


function raceDateText(r) {
  return r.date
    ? pretty(r.date, "short")
    : [r.event_date, r.event_end_date]
        .filter((x, i, a) => x && a.indexOf(x) === i)
        .map((d) => pretty(d, "short"))
        .join(" – ") || "—";
}
function resultsRows(rows, who) {
  if (!rows.length)
    return empty(
      txt("No starts for this selection.", "当前条件下没有参赛记录。", "Aucun départ pour cette sélection."),
    );
  return `<div class="rows">${[...rows]
    .sort((a, b) => startOrder(b, a))
    .map(
      (r) =>
        `<a class="row result-row" href="${esc(racePath(r, who))}"><span class="row-main"><strong>${esc(r.event_name)}</strong><small>${esc([raceDateText(r), length(r.distance), local(r.round), r.label, r.group].filter(Boolean).join(" · "))}</small></span><span class="time">${esc(resultTime(r))}</span><span class="rank">${r.rank ? txt("Place ", "第 ", "Rang ") + esc(r.rank) : "—"}</span>${svg("chevron")}</a>`,
    )
    .join("")}</div>`;
}
function metrics(items) {
  return `<div class="metrics">${items.map(([k, v]) => `<div><small>${esc(k)}</small><strong>${esc(v)}</strong></div>`).join("")}</div>`;
}
const pointPreview = document.createElement("span");
pointPreview.className = "point-preview";
pointPreview.setAttribute("aria-hidden", "true");
let previewOwner;
function showPointTime(e) {
  const lap = e.target.closest(".lap-evidence a");
  if (lap && !lap.contains(e.relatedTarget) && e.pointerType !== "touch") {
    const chart = lap.closest(".lap-evidence");
    const target = e.type === "pointerout" ? document.activeElement : e.type === "focusout" ? null : lap;
    const at = target && chart.contains(target) && target.getAttribute("href");
    for (const peer of chart.querySelectorAll("a[href]"))
      peer.classList.toggle("lap-highlight", peer.getAttribute("href") === at);
  }
  const point = e.target.closest("[data-seconds], [data-verdict]");
  if (!point || e.pointerType === "touch" || point.contains(e.relatedTarget)) return;
  if (e.type === "pointerout" || e.type === "focusout") {
    if (previewOwner === point && (e.type === "focusout" || document.activeElement !== point)) pointPreview.remove();
    return;
  }
  previewOwner = point;
  const plot = point.closest(".plot, .lap-evidence");
  pointPreview.textContent = point.dataset.verdict || point.dataset.seconds + txt(" s", " 秒", " s");
  plot.append(pointPreview);
  const bounds = plot.getBoundingClientRect(), mark = point.getBoundingClientRect();
  const centered = mark.left + mark.width / 2 - bounds.left - pointPreview.offsetWidth / 2;
  const above = mark.top - bounds.top - pointPreview.offsetHeight - 3;
  pointPreview.style.left = Math.max(0, Math.min(centered, bounds.width - pointPreview.offsetWidth)) + "px";
  pointPreview.style.top = (above >= 0 ? above : mark.bottom - bounds.top + 3) + "px";
}
for (const type of ["pointerover", "pointerout", "focusin", "focusout"]) {
  main.addEventListener(type, showPointTime);
}
document.addEventListener("keydown", e => { if (e.key === "Escape") pointPreview.remove(); });
window.addEventListener("resize", () => pointPreview.remove());
function verdictName(code) {
  const names = {
    PEN: ["Penalty", "判罚", "Pénalité"], DNS: ["Did not start", "未出发", "Absent au départ"], DNF: ["Did not finish", "未完赛", "Abandon"],
    YC: ["Yellow card", "黄牌", "Carton jaune"], RC: ["Red card", "红牌", "Carton rouge"], RED: ["Red card", "红牌", "Carton rouge"],
    DQ: ["Disqualified", "取消资格", "Disqualifié"], DSQ: ["Disqualified", "取消资格", "Disqualifié"],
    ADV: ["Advanced", "获准晋级", "Qualifié pour le tour suivant"], WD: ["Withdrawn", "退赛", "Retiré"], WDR: ["Withdrawn", "退赛", "Retiré"],
    NT: ["No time", "无有效用时", "Temps non enregistré"], "FIN-NT": ["Finished without a time", "完赛但无计时", "Arrivée sans temps"],
  };
  const meaning = names[code] || names[code.split("-")[0]];
  return meaning ? txt(...meaning) + " · " + code : code;
}
function chart(series) {
  const { series: plotted, rows, low: lo, high: hi } = historyPlot(series);
  if (!rows.length)
    return empty(
      txt("No race times or official outcomes for this selection.", "当前条件下没有用时或官方判定。", "Aucun temps ni verdict officiel pour cette sélection."),
    );
  const clipped = rows.some(r => timed(r) && r.time_ms > hi);
  const left = 69, top = 21, bottom = clipped ? 148 : 160;
  const timeY = (t) =>
    hi === lo
      ? (top + bottom) / 2
      : top + ((t - lo) / (hi - lo)) * (bottom - top);
  const markY = (r) => !timed(r) ? -10 : r.time_ms > hi ? bottom + 9 : timeY(r.time_ms);
  const races = new Map();
  for (const r of rows) {
    const key = JSON.stringify([r.event_id, r.race_id]);
    if (!races.has(key)) races.set(key, []);
    races.get(key).push(r);
  }
  // Head-to-head marks share a start unless their touch targets would overlap.
  // Adjacent columns separate close finishes, overlapping verdicts and off-scale points.
  const positions = new Map();
  let columns = 0;
  for (const starts of races.values()) {
    const split = starts.length > 1 && Math.abs(markY(starts[0]) - markY(starts[1])) < 30;
    starts.forEach((r, i) => positions.set(r, columns + (split ? i : 0)));
    columns += split ? starts.length : 1;
  }
  const minimumWidth = left + 22 + Math.max(0, columns - 1) * 32;
  const width = Math.max(minimumWidth, matchMedia("(max-width:570px)").matches ? 250 : 650);
  const dense = minimumWidth > main.clientWidth - 32;
  const right = width - 22;
  const x = (r) => columns === 1 ? (left + right) / 2
    : left + positions.get(r) * (right - left) / (columns - 1);
  const lanes = [], verdictMarks = new Map();
  for (const r of rows.filter(r => !timed(r))) {
    const code = chartStatus(r), size = Math.max(25, code.length * 6 + 8);
    const target = Math.max(28, size);
    const center = Math.max(target / 2 + 2, Math.min(x(r), width - target / 2 - 2));
    const bounds = [center - target / 2 - 2, center + target / 2 + 2];
    let lane = lanes.findIndex(used => used.every(([left, right]) => bounds[1] < left || bounds[0] > right));
    if (lane === -1) lane = lanes.push([]) - 1;
    lanes[lane].push(bounds);
    verdictMarks.set(r, { code, size, target, center, cy: 16 + lane * 30 });
  }
  const verdictHeight = 30 * lanes.length;
  const y = t => timeY(t) + verdictHeight;
  const scaleTimes = lo === null ? [] : unique([lo, Math.round((lo + hi) / 2), hi]);
  const grid = scaleTimes
    .map(
      (t) =>
        `<path class="grid-line" d="M${left} ${y(t)}H${right}"/><text x="${left - 9}" y="${y(t) + 4}" text-anchor="end">${esc(time(t))}</text>`,
    )
    .join("");
  const layer = plotted
    .map(
      (s, i) => {
        let segment = [];
        const lines = [];
        function endSegment() {
          if (segment.length > 1) lines.push(`<polyline points="${segment.join(" ")}"/>`);
          segment = [];
        }
        const starts = s.rows.map((r) => {
          const label = [displayName(s.name), r.event_name, raceDateText(r), r.label, local(r.round), resultTime(r)].filter(Boolean).join(" · ");
          const cx = x(r), link = esc(racePath(r, s.id));
          if (!timed(r)) {
            endSegment();
            const { code, size, target, center, cy } = verdictMarks.get(r);
            const meaning = verdictName(code);
            return `<a class="verdict" href="${link}" aria-label="${esc(label + " · " + meaning)}" data-verdict="${esc(meaning)}"><rect x="${center - size / 2}" y="${cy - 8}" width="${size}" height="16" rx="4"/><text x="${center}" y="${cy + 3.5}" text-anchor="middle">${esc(code)}</text><rect class="verdict-hit" x="${center - target / 2}" y="${cy - 14}" width="${target}" height="28"/></a>`;
          }
          const precision = String(r.time_raw || "").trim().match(/[.,](\d{1,3})$/)?.[1].length ?? 3;
          const seconds = (r.time_ms / 1000).toFixed(precision);
          if (r.time_ms > hi) {
            endSegment();
            const cy = bottom + verdictHeight + 9;
            return `<a class="slow-start" href="${link}" aria-label="${esc(label + " · " + txt("Below chart range", "超出图中用时范围", "Temps hors échelle"))}" data-seconds="${seconds}"><circle class="point" cx="${cx}" cy="${cy}" r="5"/><circle class="hit" cx="${cx}" cy="${cy}" r="14"/></a>`;
          }
          const cy = y(r.time_ms);
          segment.push(`${cx},${cy}`);
          const marker = i ? `<path class="point" d="M${cx} ${cy-5}l5 5-5 5-5-5z"/>`
            : `<circle class="point" cx="${cx}" cy="${cy}" r="4.5"/>`;
          return `<a href="${link}" aria-label="${esc(label)}" data-seconds="${seconds}">${marker}<circle class="hit" cx="${cx}" cy="${cy}" r="14"/></a>`;
        });
        endSegment();
        return `<g class="series s${i}">${lines.join("")}${starts.join("")}</g>`;
      },
    )
    .join("");
  const first = raceDate(rows[0]), last = raceDate(rows.at(-1));
  const tickY = verdictHeight + (hi === null ? 16 : bottom + 32);
  const between = [];
  if (dense) {
    let previous = first, previousX = left;
    for (const row of rows) {
      const day = raceDate(row), cx = x(row);
      if (day === previous || day === last || cx - previousX < 130 || right - cx < 130) continue;
      between.push(`<text x="${cx}" y="${tickY}" text-anchor="middle">${esc(pretty(day,"short"))}</text>`);
      previous = day;
      previousX = cx;
    }
  }
  const ticks = first === last
    ? `<text x="${(left+right)/2}" y="${tickY}" text-anchor="middle">${esc(pretty(first,"short"))}</text>`
    : `<text x="${left}" y="${tickY}">${esc(pretty(first,"short"))}</text><text x="${right}" y="${tickY}" text-anchor="end">${esc(pretty(last,"short"))}</text>`;
  const edgeKey = clipped ? `<span class="edge-key">${txt("Slower time outside scale", "超出纵轴范围的较慢用时", "Temps plus lent, hors échelle")}</span>` : "";
  const codes = unique(rows.filter(r => !timed(r)).map(chartStatus));
  const meanings = codes.length ? `<ul class="verdict-key" aria-label="${txt("Official outcomes", "官方判定", "Verdicts officiels")}">${codes.map(code => `<li>${esc(verdictName(code))}</li>`).join("")}</ul>` : "";
  const scrollHint = dense ? txt("Scroll for earlier races", "横滑查看较早场次", "Défilez pour voir les courses précédentes") : "";
  const stickyScale = dense && scaleTimes.length
    ? `<div class="plot-fixed-axis" aria-hidden="true">${scaleTimes.map(t => `<span style="top:${100 * y(t) / (tickY + 10)}%">${esc(time(t))}</span>`).join("")}</div>` : "";
  return `<div class="plot">${series.length > 1 ? `<div class="legend">${series.map((s, i) => `<span class="l${i}">${esc(displayName(s.name))}</span>`).join("")}</div>` : ""}<div class="plot-scroll${dense ? " dense" : ""}" style="--plot-min:${minimumWidth}px"><div class="plot-strip"><svg role="group" aria-label="${txt("Race times and official outcomes, ordered by date", "逐场用时及官方判定，按日期排列", "Temps et verdicts officiels par date")}" viewBox="0 0 ${width} ${tickY+10}">${grid}${layer}${between.join("")}${ticks}</svg>${stickyScale}</div></div>${scrollHint || edgeKey ? `<small class="chart-axis">${scrollHint}${edgeKey}</small>` : ""}${meanings}</div>`;
}
function emptyProfile() {
  return empty(
    txt("No individual race results are available yet.", "暂无个人逐场成绩。", "Les résultats individuels ne sont pas encore disponibles."),
  );
}
function chartNotes(rows, mixedConditions) {
  const notes = [
    rows.some(r => !r.date && r.event_date) && txt(
      "If the race day is unknown, the chart uses the first day of the meet. See the results list for the full date range.",
      "具体比赛日未知时，图表采用赛事首日。完整日期范围见逐场成绩。",
      "Si la date de la course est inconnue, le graphique utilise le premier jour de la compétition. La liste des résultats indique toutes les dates.",
    ),
    mixedConditions && txt("Track or timing conditions vary by race.", "不同场次的冰道或计时条件可能不同。", "La piste ou le chronométrage varie selon la course."),
  ].filter(Boolean);
  return notes.length ? `<details class="compact-notes"><summary>${txt("About this chart", "图表说明", "À propos du graphique")}</summary>${notes.map(note => `<p>${esc(note)}</p>`).join("")}</details>` : "";
}
function advanced(fields, active) {
  return `<details class="advanced" ${active ? "open" : ""}><summary>${svg("filter")}${txt("Season & conditions", "赛季和计时条件", "Saison et conditions")}</summary><div class="filter-fields">${fields}</div></details>`;
}
function profile(a, p) {
  const rows = a.results || [],
    type = (r) => JSON.stringify([r.discipline, Number(r.distance)]),
    types = ordered(rows.filter((r) => r.distance).map(type)).sort(
      (x, y) =>
        JSON.parse(x)[0].localeCompare(JSON.parse(y)[0]) ||
        JSON.parse(x)[1] - JSON.parse(y)[1],
    );
  const commonType = [...types].sort(
    (x, y) =>
      rows.filter((r) => type(r) === y).length -
      rows.filter((r) => type(r) === x).length,
  )[0];
  const selectedType = types.includes(p.eventType) ? p.eventType : commonType;
  const distanceRows = rows.filter((r) => type(r) === selectedType),
    opts = optionsFor(distanceRows);
  const key = opts.some(([k]) => k === p.condition) ? p.condition : "";
  const comparable = distanceRows.filter((r) => !key || condition(r) === key),
    seasons = ordered(comparable.map((r) => r.season)).reverse(),
    selected = comparable.filter((r) => !p.season || r.season === p.season);
  const homogeneous = unique(selected.map(condition)).length === 1,
    careerBest = best(selected);
  const latestSeason = seasons[0],
    seasonBest =
      homogeneous &&
      best(selected.filter((r) => r.season === (p.season || latestSeason)));
  const figures = [
    [
      homogeneous
        ? p.season
          ? txt("Season best", "赛季最佳", "Meilleur temps de la saison")
          : txt("Best in this archive", "本站最佳成绩", "Meilleur temps aux archives")
        : txt("Fastest shown", "当前筛选最快", "Meilleur temps affiché"),
      careerBest ? resultTime(careerBest) : "—",
    ],
    homogeneous && !p.season && seasons.length > 1
      ? [
          txt("Season best", "赛季最佳", "Meilleur temps de la saison") + " · " + season(latestSeason),
          seasonBest ? resultTime(seasonBest) : "—",
        ]
      : [
          txt("Competitions", "赛事", "Compétitions"),
          String(unique(selected.map((r) => r.event_id)).length),
        ],
    [txt("Starts", "参赛场次", "Départs"), String(selected.length)],
  ];
  return `${breadcrumb("athletes", {}, txt("Athletes", "运动员", "Athlètes"))}<div class="profile-heading"><span class="avatar big">${esc(initials(a.name))}</span><div><h1>${esc(displayName(a.name))}</h1><p>${esc(identity(a))}</p></div>${link("compare/" + a.id, { condition: key }, svg("compare") + " " + txt("Compare athletes", "对比运动员", "Comparer les athlètes"), "secondary")}</div>${
    rows.length
      ? `<div class="chart-panel"><div class="section-head"><h2>${txt("Race history", "成绩走势", "Historique des courses")}</h2></div><div class="filter-fields">${select(
          "eventType",
          txt("Discipline & distance", "项目和距离", "Discipline et distance"),
          types.map((t) => {
            const [d, v] = JSON.parse(t);
            return [t, local(d) + " · " + length(v)];
          }),
          selectedType,
          null,
        )}${advanced(
          select(
            "season",
            txt("Season", "赛季", "Saison"),
            seasons.map((v) => [v, season(v)]),
            p.season,
          ) +
            select(
              "condition",
              txt("Track & timing", "冰道和计时", "Piste et chronométrage"),
              opts,
              key,
              txt("All conditions", "全部条件", "Toutes les conditions"),
            ),
          p.season || key,
        )}</div>${metrics(figures)}${chart([{ name: a.name, id: a.id, rows: selected }])}${chartNotes(selected, !homogeneous)}${careerBest ? `<small class="explain"><a class="under" href="${esc(racePath(careerBest, a.id))}">${esc(careerBest.event_name)} · ${esc(raceDateText(careerBest))}</a></small>` : ""}</div><section class="block"><div class="section-head"><h2>${txt("Race results", "逐场成绩", "Résultats par course")}</h2></div>${resultsRows(selected, a.id)}</section>`
      : emptyProfile()
  }`;
}
function toolsPage() {
  const scope = { scope: "season" };
  const search = queryForm("compare", "", athleteSearchHint(), false, scope, txt("First athlete", "第一位运动员", "Premier athlète"));
  return `<div class="page-heading"><h1>${txt("Tools", "工具", "Outils")}</h1></div>
    <section class="panel tool-panel"><div class="tool-heading"><span class="avatar" aria-hidden="true">${svg("compare")}</span>
      <h2>${link("compare", scope, txt("Compare athletes", "对比运动员", "Comparer des athlètes") + " " + svg("arrow"))}</h2></div>
      <p>${txt("See both skaters’ season results, or compare times under matching conditions.", "并排看两位选手的赛季成绩，或只比较比赛条件相同的用时。", "Consultez les résultats de deux patineurs sur une saison ou comparez leurs temps dans les mêmes conditions.")}</p>${search}</section>`;
}
function athletePicker(a, p) {
  const matchesAthlete = organizations.compile(p.q);
  const list = groupAthleteNames(index.athletes
    .filter(
      (o) =>
        o.id !== a?.id &&
        matchesAthlete(o),
    )
    .sort(
      (x, y) =>
        (p.q
          ? Number(Boolean(x.scope_event)) - Number(Boolean(y.scope_event))
          : 0) ||
        displayName(x.name).localeCompare(displayName(y.name)) ||
        String(y.scope_date || "").localeCompare(String(x.scope_date || "")),
    ));
  const path = a ? "compare/" + a.id : "compare";
  const filters = { scope: p.scope, season: p.season, seasonEvent: p.seasonEvent, condition: p.condition };
  const step = a ? txt("Choose a second athlete", "选择另一位运动员", "Choisir le deuxième athlète") : txt("Choose the first athlete", "选择第一位运动员", "Choisir le premier athlète");
  const chosen = a ? `<p class="picked-athlete">${txt("First athlete", "第一位运动员", "Premier athlète")} · <strong>${esc(displayName(a.name))}</strong></p>` : "";
  return `<div class="panel">${chosen}<h2>${step}</h2>${queryForm(path, p.q, athleteSearchHint(), false, filters)}${organizationCard(p.q)}${athleteRows(pageSlice(list, p.page), path + "/", filters)}${pager(path, p, list.length)}</div>`;
}
function compare(a, b, p) {
  const title = `${breadcrumb("athlete/" + a.id, {}, displayName(a.name))}<div class="page-heading"><h1>${txt("Athlete comparison", "运动员对比", "Comparer des athlètes")}</h1></div>`;
  if (!b || String(a.id) === String(b.id)) return title + athletePicker(a, p);
  const names = [a, b],
    opts = optionsFor(a.results || []).filter(([k]) =>
      (b.results || []).some((r) => condition(r) === k),
    ),
    key = opts.find(([k]) => k === p.condition)?.[0] || opts[0]?.[0];
  const bySeason = p.scope === "season" || (!p.scope && !opts.length);
  const picker = "compare/" + a.id;
  const priorPicker = visit.parent?.hash.split("?")[0] === route(picker) && visit.parent.hash;
  const pickerParams = { scope: p.scope, season: p.season, seasonEvent: p.seasonEvent, condition: p.condition };
  const changeAthlete = `<a class="under" ${priorPicker ? "data-return" : ""} href="${esc(priorPicker || route(picker, pickerParams))}">${txt("Choose another athlete", "更换运动员", "Choisir un autre athlète")}</a>`;
  const banner = `<div class="pair">${names.map((o, i) => `<div><span class="avatar mark${i}">${esc(initials(o.name))}</span><div>${link("athlete/" + o.id, {}, esc(displayName(o.name)), "person")}<small>${esc(identity(o))}</small></div></div>`).join("")}</div>${changeAthlete}`;
  const all = names.map((o) => ({
      name: o.name,
      id: o.id,
      rows: o.results.filter((r) => condition(r) === key),
    })),
    seasons = ordered(
      all.flatMap((s) => s.rows.map((r) => r.season)),
    ).reverse(),
    seasonFilter = seasons.includes(p.season) ? p.season : "",
    context = all[0].rows[0];
  const seasonView = compareSeason(names, {
    season: p.season, seasonEvent: p.seasonEvent || (p.condition === key && context && seasonEvent(context)),
  });
  const pairPath = picker + "/" + b.id;
  const scopeOptions = [
    [false, txt("Matching conditions", "相同条件", "Conditions équivalentes"), { scope: "conditions", condition: key, season: seasonFilter }],
    [true, txt("Full season", "全赛季", "Saison entière"), {
      scope: "season", season: seasonView.season, seasonEvent: seasonView.event, condition: p.condition,
    }],
  ];
  const heading = `<h2>${bySeason ? txt("Season results", "赛季成绩", "Résultats de la saison") : txt("Comparable times", "可比成绩", "Temps comparables")}</h2>
    <div class="program-picker compare-scope" role="group" aria-label="${txt("Comparison scope", "对比范围", "Période de comparaison")}">${scopeOptions.map(([active, label, params]) =>
      `<a href="${esc(route(pairPath, params))}" ${active === bySeason ? 'aria-current="true"' : ""}>${label}</a>`
    ).join("")}</div>`;
  if (bySeason ? !seasonView.event : !opts.length) {
    const message = bySeason
      ? txt("We haven’t recorded a distance both skaters raced in the same discipline.", "本站还没有两人在同一道别、同一距离的成绩。", "Aucun résultat pour les deux patineurs sur la même distance dans la même discipline.")
      : txt("We have no results for these two skaters under the same race and timing conditions.", "本站还没有两人在相同道别、距离和计时条件下的成绩。", "Ces deux patineurs n’ont pas de résultats dans les mêmes conditions de course et de chronométrage dans nos archives.");
    return title + banner + `<section class="chart-panel">${heading}${empty(message)}</section>`;
  }
  const series = bySeason ? seasonView.series : all.map((s) => ({
    ...s, rows: s.rows.filter((r) => !seasonFilter || r.season === seasonFilter),
  }));
  const bests = series.map((s) => best(s.rows)),
    gap = comparableGap(...bests);
  const singleMeet = !bySeason && Boolean(JSON.parse(key).at(-1));
  const otherEntries = new Map(
    series[1].rows.map((r) => [r.event_id + "/" + r.race_id, r]),
  );
  const shared = series[0].rows.filter((r) =>
    otherEntries.has(r.event_id + "/" + r.race_id),
  );
  const headToHead = shared.length
    ? `<details class="list-detail"><summary>${txt("Head-to-head races", "同场交锋", "Courses en confrontation directe")} (${shared.length})</summary><div class="rows">${shared
        .map((r) => {
          const opponent = otherEntries.get(r.event_id + "/" + r.race_id);
          return `<a class="row" href="${esc(racePath(r, a.id))}"><span class="row-main"><strong>${esc(r.event_name)}</strong><small>${esc([r.label, local(r.round), raceDateText(r)].filter(Boolean).join(" · "))}</small><small>${esc(displayName(a.name))} · ${esc(resultTime(r))}　/　${esc(displayName(b.name))} · ${esc(resultTime(opponent))}</small></span>${svg("chevron")}</a>`;
        })
        .join("")}</div></details>`
    : "";
  const comparisonContext = !bySeason && context
    ? `<div class="comparison-context">${singleMeet ? link("event/" + context.event_id, {}, esc(context.event_name) + " " + svg("chevron"), "under") : ""}<span>${esc([local(context.discipline), length(context.distance), context.track === "unknown" ? txt("Track unspecified", "冰道未注明", "Piste non indiquée") : length(context.track), context.timing === "unknown" ? txt("Timing unspecified", "计时方式未注明", "Chronométrage non indiqué") : local(context.timing), singleMeet ? season(context.season) : ""].filter(Boolean).join(" · "))}</span></div>`
    : "";
  const controls = bySeason
    ? select("season", txt("Season", "赛季", "Saison"), [
        ...seasonView.seasons.map((v) => [v, season(v)]),
        ["all", txt("All seasons", "全部赛季", "Toutes les saisons")],
      ], seasonView.season, null)
      + select("seasonEvent", txt("Discipline & distance", "项目和距离", "Discipline et distance"),
        seasonView.events.map((r) => [seasonEvent(r), local(r.discipline) + " · " + length(r.distance)]),
        seasonView.event, null)
    : select("condition", txt("Comparable event", "可比项目", "Course comparable"), opts, key, null)
      + select("season", txt("Season", "赛季", "Saison"), seasons.map((v) => [v, season(v)]), seasonFilter);
  const rows = series.flatMap((s) => s.rows);
  const meetCount = unique(rows.map((r) => r.event_id)).length;
  const figures = bests.map((r, i) => [
    displayName(names[i].name) + " · " + (bySeason ? txt("fastest", "最快", "meilleur temps") : txt("best", "最佳", "meilleur temps")),
    r ? resultTime(r) : "—",
  ]);
  figures.push(bySeason && gap === null
    ? [txt("Competitions", "赛事数", "Compétitions"), fmt(meetCount)]
    : [txt("Best-time gap", "最佳用时差", "Écart entre les meilleurs temps"), gap === null ? "—" : (gap / 1000).toFixed(3) + " s"]);
  const lists = series.map((s) => `<details class="list-detail"><summary>${esc(displayName(s.name))} · ${txt("Race results", "逐场成绩", "Résultats par course")} (${s.rows.length})</summary>${resultsRows(s.rows, s.id)}</details>`).join("");
  return title + banner + `<section class="chart-panel">${heading}<div class="filter-fields">${controls}</div>${comparisonContext}${metrics(figures)}${chart(series)}${chartNotes(rows, bySeason && unique(rows.map(condition)).length > 1)}</section>${headToHead}${lists}`;
}
function eventPage(e, p, prepId) {
  const replays = (e.broadcasts || []).filter(b => /^[A-Za-z0-9_-]{11}$/.test(b.youtube_id));
  const broadcasts = replays.length ? `<div class="meet-broadcasts"><span>${txt("Meet replays", "整场录像", "Rediffusions intégrales")}</span>${replays.map(b =>
    source("https://www.youtube.com/watch?v=" + b.youtube_id, pretty(b.date, "short"))
  ).join("")}</div>` : "";
  const prepLink = prepId ? link("prepare/" + prepId, {}, txt("Meet information", "赛事资料", "Informations sur la compétition"), "under") : "";
  const isLong = e.discipline === "LT",
    multipleDays = e.end_date && e.end_date !== e.date,
    races = e.races || [],
    groups = programGroups(races, e.discipline)
      .map((group) => ({
        ...group,
        races: group.races.filter((r) =>
          ["distance", "round", "group"].every(
            (k) => !p[k] || p[k] === String(r[k]),
          ),
        ),
      }))
      .filter((group) => group.races.length),
    current = groups.find((group) => group.key === p.program) || groups[0];
  const fields = [
    ["distance", txt("Distance", "距离", "Distance")],
    ["round", txt("Round", "轮次", "Tour")],
    ["group", txt("Group", "组别", "Groupe")],
  ]
    .map(([k, l]) => {
      const values = ordered(races.map((r) => r[k]));
      return values.length
        ? select(
            k,
            l,
            values.map((v) => [v, k === "distance" ? length(v) : local(v)]),
            p[k],
          )
        : "";
    })
    .join("");
  const path = "event/" + e.id;
  const navigation =
    groups.length > 1
      ? `<div class="program-picker" role="group" aria-label="${txt("Events by distance", "比赛项目", "Épreuves par distance")}">${groups
          .map(
            (g) => {
              const full = g.key + " m";
              const short = isLong ? g.key.replace(/^\d+/, compactDistance(g.distance)) : full;
              return `<a href="${esc(route(path, { ...p, program: g.key, page: undefined }))}" aria-label="${esc(full)}" ${g === current ? 'aria-current="true"' : ""}>${esc(short)}</a>`;
            },
          )
          .join("")}</div>`
      : "";
  const body = current
    ? `${navigation}<div class="program-title"><h3>${esc(current.key)} m</h3><span>${fmt(current.races.length)} ${txt(current.races.length === 1 ? "race" : "races", "场比赛", current.races.length === 1 ? "course" : "courses")}</span></div><div class="rows program-races">${pageSlice(
        current.races,
        p.page,
      )
        .map((r) => {
          const heat = /^\d+[A-Z]+$/i.test(r.label);
          const title = heat
            ? local(r.round) || txt("Race", "比赛", "Course")
            : (isLong ? longRaceTitle(r) : r.label) || local(r.round) || txt("Race", "比赛", "Course");
          const detail = [
            r.group,
            !heat && r.round !== "Results" && local(r.round) !== title ? local(r.round) : null,
            r.date && (multipleDays || r.date !== e.date) ? pretty(r.date, "short") : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return link(
            "race/" + e.id + "/" + r.id,
            { from: currentHash },
            `${heat ? `<span class="program-heat">${esc(r.label)}</span>` : isLong ? `<span class="program-distance" aria-hidden="true">${esc(compactDistance(r.distance))}</span><span class="program-sr">${esc(length(r.distance))}</span>` : ""}<span class="row-main"><strong>${esc(title)}</strong>${detail ? `<small>${esc(detail)}</small>` : ""}</span><span class="program-count">${fmt(r.entries?.length)} ${txt("starters", "人", "partants")}</span>${svg("chevron")}`,
            "row program-race",
          );
        })
        .join(
          "",
        )}</div>${pager(path, { ...p, program: current.key }, current.races.length)}`
    : empty(
        races.length
          ? undefined
          : txt(
              "We haven’t verified the individual results yet. Check the official source above.",
              "逐场成绩尚未核实，可先看上方的官方资料。",
              "Nous n’avons pas encore vérifié les résultats individuels. Le lien officiel figure plus haut.",
            ),
      );
  return `${breadcrumb("events", {}, txt("Competitions", "赛事", "Compétitions"))}${e.review ? `<p class="notice">${txt("Source update under review. Showing the last verified results.", "官方资料有修订正在核对，当前展示上一次已核实的成绩。", "Mise à jour en cours de vérification. Les derniers résultats vérifiés sont affichés.")}</p>` : ""}<div class="event-heading">${meetBadges(e, txt)}<h1>${esc(e.name)}</h1><p>${esc(pretty(e.date))}${e.end_date && e.end_date !== e.date ? " – " + esc(pretty(e.end_date)) : ""} · ${esc(e.location)}</p><div class="metadata">${prepLink}${coverage(e.coverage)}${source(e.source)}${e.index_source && e.index_source !== e.source ? source(e.index_source, /speedskatingresults\.com/i.test(e.index_source) ? "SpeedskatingResults.com" : txt("Competition listing", "赛事目录来源", "Répertoire des compétitions")) : ""}</div>${broadcasts}</div><div class="section-head"><h2>${txt("Race results", "逐场成绩", "Résultats par course")}</h2></div>${races.length ? filters(path, p, fields) : ""}${body}`;
}
function splitTime(ms) {
  return time(ms).replace(/(\.\d{2})0$/, "$1");
}
function finisher(entry, selectedId, lapSection) {
  const name = displayName(entry.name);
  const athlete = entry.athlete_id
    ? link("athlete/" + entry.athlete_id, {}, esc(name))
    : esc(name);
  const splits = entry.splits || [];
  const label = txt("Official splits", "官方分段", "Temps intermédiaires officiels");
  const splitTimes = splits.map((s) =>
    `<div><dt>${esc(length(s.distance_m))}</dt><dd>${esc(s.time_raw || splitTime(s.time_ms))}</dd></div>`
  ).join("");
  return `<li class="finish-card${selectedId && entry.athlete_id === selectedId ? " chosen" : ""}">
    <div class="finish-head"><span class="place">${entry.rank ? esc(entry.rank) : "—"}</span>
      <div class="row-main"><strong>${athlete}</strong>${entry.club ? `<small>${esc(entry.club)}</small>` : ""}</div>
      <strong class="time">${esc(resultTime(entry))}</strong>
    </div>
    ${splits.length ? `<details class="splits">
      <summary aria-label="${esc(name)} · ${esc(label)}">${svg("chevron")}${label}</summary>
      <dl class="split-times" aria-label="${txt("Elapsed times at each distance", "各距离累计用时", "Temps cumulés à chaque distance")}">${splitTimes}</dl>
    </details>` : ""}${lapSection}
  </li>`;
}
function racePage(e, r, a, from) {
  const program = programGroups(e.races, e.discipline).find((g) => g.races.includes(r))?.key;
  const rows = [...(r.entries || [])].sort(
      (a, b) => (Number(a.rank) || Infinity) - (Number(b.rank) || Infinity),
    ),
    person = a && rows.find((v) => String(v.athlete_id) === String(a.id));
  const current = a?.results.find(
    (v) =>
      String(v.race_id) === String(r.id) && String(v.event_id) === String(e.id),
  );
  const previous =
    current &&
    best(
      a.results.filter(
        (v) => condition(v) === condition(current) && beforeRace(v, current),
      ),
    );
  const video =
    r.clip?.youtube_id && /^[A-Za-z0-9_-]{11}$/.test(r.clip.youtube_id)
      ? `https://www.youtube.com/watch?v=${r.clip.youtube_id}&t=${Math.max(0, Math.floor(r.clip.start || 0))}s`
      : "";
  const watchOnly = video && r.clip.watch_only === true;
  const play = watchOnly
    ? `<a class="primary play-race" href="${esc(video)}" target="_blank" rel="noopener noreferrer">${svg("play")}${txt("Play race on YouTube", "在 YouTube 播放本场录像", "Voir la course sur YouTube")}</a>`
    : video ? `<button class="primary play-race" type="button" data-video="${esc(r.clip.youtube_id)}" data-start="${Math.max(0, Math.floor(r.clip.start || 0))}" data-end="${Math.floor(r.clip.end || 0)}">${svg("play")}${txt("Play race video", "播放本场录像", "Voir la course")}</button>` : "";
  const official = source(r.source || e.source, /speedskatingresults\.com/i.test(r.source || e.source) ? "SpeedskatingResults.com" : undefined);
  const up = a ? breadcrumb("athlete/" + a.id, {}, displayName(a.name), from)
    : breadcrumb("event/" + e.id, {program}, e.name, from);
  const eventPath = "event/" + e.id;
  const origin = visit.parent?.hash || from;
  const showMeet = origin ? origin.split("?")[0] !== route(eventPath) : Boolean(a);
  const meetLink = showMeet ? link(eventPath, {program}, esc(e.name), "race-meet") : "";
  const showLaps = e.discipline === "ST" && video;
  const lapRows = showLaps ? rows.map(entry => videoObservations(entry, r)) : [];
  const count = lapRows.filter(laps => laps.length).length;
  const selected = rows.indexOf(person);
  const mostSplits = Math.max(0, ...lapRows.map(laps => laps.length));
  const open = lapRows[selected]?.length ? selected : lapRows.findIndex(laps => laps.length === mostSplits);
  const lapCoverage = showLaps ? `<p class="lap-coverage">${count
    ? txt(`Video lap times · ${fmt(count)} of ${fmt(rows.length)} skaters`, `录像圈时 · 已核实 ${fmt(count)}／${fmt(rows.length)} 人`, `Temps par tour · ${fmt(count)} sur ${fmt(rows.length)} athlètes`)
    : txt("No individual lap times verified from this replay yet.", "这段录像暂未核实到个人圈时。", "Aucun temps individuel par tour vérifié pour cette vidéo.")}</p>` : "";
  return `${up}<div class="event-heading"><div class="race-identity">${meetBadges(e, txt)}${meetLink}</div><h1>${esc(length(r.distance))} · ${esc(local(r.round) || txt("Race", "比赛", "Course"))}</h1><p>${esc([r.label, r.group, pretty(r.date || e.date), e.location].filter(Boolean).join(" · "))}</p><div class="metadata race-actions">${play}<span class="race-sources">${official}${video && !watchOnly ? source(video, "YouTube") : ""}</span></div></div>${
    person
      ? `<div class="panel"><h2>${link("athlete/" + a.id, {}, esc(displayName(a.name)))}</h2>${metrics(
          [
            [txt("Official result", "正式成绩", "Résultat officiel"), resultTime(person)],
            [txt("Place", "名次", "Rang"), String(person.rank || "—")],
            [
              txt(
                "Gap to previous best on this site",
                "与本站此前最佳成绩的差距",
                "Écart avec le meilleur temps déjà répertorié ici",
              ),
              previous && timed(person)
                ? ((person.time_ms - previous.time_ms) / 1000 >= 0 ? "+" : "") +
                  ((person.time_ms - previous.time_ms) / 1000).toFixed(3) +
                  " s"
                : "—",
            ],
          ],
        )}</div>`
      : ""
  }<section class="block"><div class="section-head"><h2>${txt("Finish order", "完赛名次", "Classement à l’arrivée")}</h2></div>${lapCoverage}<ol class="finish-list" role="list">${rows.map((entry, i) =>
    finisher(entry, a?.id, lapRows[i]?.length ? videoLaps(entry, lapRows[i], displayName(entry.name), i === open, { txt, esc, svg }, r.distance)
      : showLaps && ["difference", "counter_conflict"].includes(entry.video_laps?.total_check)
        ? `<p class="lap-review-note">${txt("Individual lap times could not be verified from the replay.", "暂未能从录像中核实这位选手的逐圈用时。", "Impossible de vérifier les temps individuels par tour dans la vidéo.")}</p>` : "")
  ).join("")}</ol></section>`;
}
async function render(focusTarget, view, scroll = 0) {
  const id = ++generation;
  const { parts, params } = pathState();
  const [page, one, two] = parts;
  const section = !page ? "" : ["compare", "tools"].includes(page) ? "tools"
    : ["athlete", "athletes"].includes(page) ? "athletes" : page === "prepare" ? "prepare" : "events";
  header(section);
  main.setAttribute("aria-busy", "true");
  try {
    if (page !== "prepare") useIndex(await data("index"));
    let body;
    if (!page) body = home();
    else if (page === "prepare") {
      const feed = await preparationData();
      const ui = { txt, esc, route, select, svg };
      if (!one) body = renderPrepare(feed, params, ui);
      else {
        const meet = await preparationMeet(feed, one);
        let results = [];
        if (!meet.listing_removed && meet.start <= localDay()) {
          try {
            useIndex(await data("index"));
            const linked = calendarLinks(feed).byPrep.get(meet.id) || [];
            results = await Promise.all(linked.map(r => data("events/" + encodeURIComponent(r.id))));
          } catch { results = null; }
        }
        const source = feed.sources?.find(s => s.id === meet.source_id);
        body = breadcrumb("prepare", {}, txt("Race prep", "赛前准备", "Avant-course")) + renderMeetPage(meet, source, results, ui);
      }
    }
    else if (page === "tools") body = toolsPage();
    else if (page === "compare" && !one) {
      body = breadcrumb("tools", {}, txt("Tools", "工具", "Outils")) +
        `<div class="page-heading"><h1>${txt("Athlete comparison", "运动员对比", "Comparer des athlètes")}</h1></div>` + athletePicker(null, params);
    }
    else if (page === "athletes" || page === "events")
      body = directory(params, page === "athletes");
    else if (page === "athlete" || page === "compare") {
      const a = await data("athletes/" + encodeURIComponent(one)),
        b =
          page === "compare" && two
            ? await data("athletes/" + encodeURIComponent(two))
            : null;
      parts[1] = a.id;
      if (b && b.id !== a.id) parts[2] = b.id;
      else parts.length = 2;
      body = page === "athlete" ? profile(a, params) : compare(a, b?.id === a.id ? null : b, params);
    } else if (page === "event" || page === "race") {
      const e = await data("events/" + encodeURIComponent(one));
      if (page === "event") {
        const feed = await preparationData().catch(() => null);
        body = eventPage(e, params, feed && calendarLinks(feed).byResult.get(e.id));
      }
      else {
        const r = e.races.find((r) => String(r.id) === two);
        if (!r) throw new PageNotFound();
        if (params.athlete) params.athlete = canonicalAthlete(params.athlete);
        const who = r.entries.find(
          (v) => String(v.athlete_id) === params.athlete,
        )?.athlete_id;
        const a = who
          ? await data("athletes/" + encodeURIComponent(who))
          : null;
        let origin = sharedRaceOrigin(params.from, e, a);
        if (!origin && params.from?.startsWith("#/prepare/")) {
          const feed = await preparationData().catch(() => null);
          const meet = feed && calendarLinks(feed).byResult.get(e.id);
          if (meet && params.from === route("prepare/" + meet)) origin = params.from;
        }
        body = racePage(e, r, a, origin);
      }
    } else throw new PageNotFound();
    if (id !== generation) return;
    if (["athlete", "compare", "race"].includes(page)) {
      const canonical = route(parts.join("/"), params);
      if (canonical !== location.hash) {
        history.replaceState(history.state, "", canonical);
        currentHash = canonical;
      }
    }
    previewOwner = null;
    pointPreview.remove();
    main.innerHTML = body;
    const name = document.querySelector('meta[property="og:title"]').content;
    document.title = page ? (main.querySelector("h1")?.textContent || "") + " · " + name : name;
    header(section);
  } catch (err) {
    if (id !== generation) return;
    const missing = err instanceof PageNotFound;
    const message = missing ? txt("Page not found", "找不到这个页面", "Page introuvable") :
      page === "prepare" ? txt("Calendar unavailable", "暂时无法读取赛历", "Calendrier indisponible") : txt("Results unavailable", "暂时无法读取成绩", "Résultats indisponibles");
    let recovery;
    if (missing) {
      const [path, label] = section === "athletes" || section === "tools" ? ["athletes", txt("Find an athlete", "查找运动员", "Trouver un athlète")] :
        section === "prepare" ? ["prepare", txt("View calendar", "查看赛历", "Voir le calendrier")] :
        ["events", txt("Browse competitions", "浏览赛事", "Voir les compétitions")];
      recovery = link(path, {}, label, "secondary");
    } else {
      recovery = `<p>${txt("Check your connection and try again, or return to the overview.", "请检查网络后重试，或返回首页。", "Vérifiez votre connexion et réessayez, ou revenez à l’accueil.")}</p>
        <button class="secondary" id="retry">${txt("Try again", "重新加载", "Réessayer")}</button>`;
    }
    main.innerHTML = `<div class="panel"><h1>${message}</h1>${recovery} ${link("", {}, txt("Overview", "概览", "Accueil"), "under")}</div>`;
    document.title = message + " · Skaterway";
    if (!missing) document.querySelector("#retry").onclick = () => {
      cache.clear();
      render("main");
    };
  }
  main.setAttribute("aria-busy", "false");
  checkLiveResults();
  if (view) {
    main.querySelectorAll("details").forEach((el, i) => { el.open = view.open.includes(i); });
  }
  if (view?.focus >= 0) {
    (main.querySelectorAll(focusable)[view.focus] || main).focus({ preventScroll: true });
  } else if (focusTarget) {
    const selector = focusTarget === "program" ? ".program-picker [aria-current]"
      : focusTarget === "agenda" ? "#prep-agenda-title"
      : focusTarget === "prev-month" ? ".prep-calendar-arrow.prev"
      : focusTarget === "next-month" ? ".prep-calendar-arrow:not(.prev)"
      : '[data-filter="' + CSS.escape(focusTarget) + '"]';
    (main.querySelector(selector) || main).focus({ preventScroll: true });
  }
  requestAnimationFrame(() => {
    if (id !== generation) return;
    const plotScroll = main.querySelector(".plot-scroll");
    if (plotScroll) plotScroll.scrollLeft = view?.plotScroll ?? plotScroll.scrollWidth - plotScroll.clientWidth;
    window.scrollTo({ top: view?.scroll ?? scroll, behavior: "instant" });
    if (focusTarget === "agenda" && !view) {
      const agenda = main.querySelector("#prep-agenda-title");
      const box = agenda?.getBoundingClientRect();
      if (box && (box.top < 0 || box.top > innerHeight / 2)) agenda.scrollIntoView({ block: "start", behavior: "instant" });
    }
  });
}
const focusable = "a[href], button, input, select, summary";
function rememberView(control = document.activeElement) {
  if (main.getAttribute("aria-busy") === "true") return;
  const open = [...main.querySelectorAll("details")].flatMap((el, i) => el.open ? [i] : []);
  views.set(visit.id, {
    scroll: scrollY, plotScroll: main.querySelector(".plot-scroll")?.scrollLeft, open,
    focus: [...main.querySelectorAll(focusable)].indexOf(control),
  });
}
function saveVisit(control) {
  rememberView(control);
  history.replaceState({ ...history.state, ovalVisit: visit, ovalView: views.get(visit.id) }, "");
}
function navigate(hash, control, { back = false, focus, scroll = 0 } = {}) {
  if (hash === currentHash) return;
  saveVisit(control);
  if (back && visit.parent?.hash === hash) {
    history.go(-visit.parent.steps);
    return;
  }
  const samePage = hash.split("?")[0] === currentHash.split("?")[0];
  let parent = null;
  if (!back && samePage && visit.parent) {
    parent = { ...visit.parent, steps: visit.parent.steps + 1 };
  } else if (!back && !samePage) {
    parent = { hash: currentHash, steps: 1 };
  }
  visit = newVisit(parent);
  history.pushState({ ovalVisit: visit }, "", hash);
  currentHash = hash;
  render(focus || "main", null, scroll);
}
function restoreVisit() {
  const hash = location.hash || "#/";
  if (hash === currentHash && history.state?.ovalVisit?.id === visit.id) return;
  rememberView();
  currentHash = hash;
  visit = history.state?.ovalVisit || newVisit();
  if (!history.state?.ovalVisit) history.replaceState({ ...history.state, ovalVisit: visit }, "");
  render("main", views.get(visit.id) || history.state?.ovalView);
}
main.addEventListener("input", e => updateEntryCheck(e, txt));
main.addEventListener("submit", (e) => {
  const f = e.target.closest("form.find");
  if (!f) return;
  e.preventDefault();
  const params = Object.fromEntries(new FormData(f));
  delete params.page;
  navigate(route(f.dataset.path, params), e.submitter || f.querySelector("input"));
});
main.addEventListener("change", (e) => {
  const el = e.target.closest("[data-filter]");
  if (!el) return;
  const { parts, params } = pathState();
  params[el.dataset.filter] = el.value;
  delete params.page;
  if (el.dataset.filter === "condition") delete params.season;
  if (el.dataset.filter === "eventType") {
    delete params.condition;
    delete params.season;
  }
  const url = route(parts.join("/"), params);
  navigate(url, el, { focus: el.dataset.filter, scroll: scrollY });
});
document.addEventListener("click", (e) => {
  const anchor = e.target.closest("a[href]");
  const hash = anchor?.getAttribute("href");
  if (hash?.startsWith("#/") && !e.defaultPrevented && !e.button &&
      !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && !anchor.hasAttribute("target")) {
    e.preventDefault();
    const options = { back: anchor.classList.contains("back") || anchor.hasAttribute("data-return") };
    if (anchor.closest(".program-picker")) Object.assign(options, { focus: "program", scroll: scrollY });
    if (anchor.matches(".prep-day, .prep-cal-foot a, .prep-pager a")) Object.assign(options, { focus: "agenda", scroll: scrollY });
    if (anchor.matches(".prep-calendar-arrow")) Object.assign(options, { focus: anchor.matches(".prev") ? "prev-month" : "next-month", scroll: scrollY });
    navigate(hash, anchor, options);
    return;
  }
  const play = e.target.closest("[data-video]");
  if (!play) return;
  const frame = document.createElement("iframe");
  frame.className = "video";
  frame.title = txt("Race video", "比赛录像", "Vidéo de la course");
  const player = new URL(
    "https://www.youtube-nocookie.com/embed/" + play.dataset.video,
  );
  player.searchParams.set("start", play.dataset.start);
  if (Number(play.dataset.end) > Number(play.dataset.start))
    player.searchParams.set("end", play.dataset.end);
  player.searchParams.set("autoplay", "1");
  frame.src = player.href;
  frame.allow = "autoplay; encrypted-media; picture-in-picture";
  frame.allowFullscreen = true;
  play.closest(".event-heading").append(frame);
  play.remove();
});
document.querySelector("#skip").onclick = (e) => {
  e.preventDefault();
  main.dataset.skipTarget = "";
  main.focus();
};
main.addEventListener("blur", () => delete main.dataset.skipTarget);
languagePicker.onchange = () => {
  rememberView();
  language = languagePicker.value;
  try { localStorage.setItem("oval-locale", language); } catch { /* Keep the selection for this visit. */ }
  render(null, views.get(visit.id));
};
history.scrollRestoration = "manual";
matchMedia("(max-width:570px)").addEventListener("change", () => {
  rememberView();
  render(null, views.get(visit.id));
});
window.addEventListener("pagehide", () => saveVisit());
window.addEventListener("popstate", restoreVisit);
window.addEventListener("hashchange", restoreVisit);
const checkLiveResults = watchResults(main, () => {
  const [page, id] = pathState().parts;
  if (page === "prepare" && !main.querySelector(".meet-recap")) return null;
  return id && ["event", "race", "prepare"].includes(page) ? { page, id, version: index?.generation, published: index?.updated } : null;
}, async () => {
  const current = visit.id;
  cache.delete("index");
  const fresh = await data("index");
  if (current !== visit.id) return;
  rememberView(main);
  useIndex(fresh);
  await render("main", views.get(visit.id));
}, txt, incomingPrepResults);
render(null, history.state?.ovalView);
