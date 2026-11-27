import { safeSource } from "./model.mjs";
import { entryCheck } from "./entry-check.mjs";
import { meetBadges } from "./meet-badges.mjs";

const iso = (date) => date.toISOString().slice(0, 10);
const utcDate = (day) => new Date(day + "T12:00:00Z");
const validDay = (s) =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(+utcDate(s)) && iso(utcDate(s)) === s;
const pageSize = 8;
const monday = Date.UTC(1970, 0, 5, 12);

export function localDay(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")].join("-");
}

function checkedDay(value) {
  if (validDay(value)) return value;
  const timestamp = value && new Date(value);
  return timestamp && Number.isFinite(+timestamp) ? localDay(timestamp) : "";
}

export function calendarModel(events, params, today) {
  const day = validDay(params.day) ? params.day : "";
  const month = day.slice(0, 7) || (validDay(params.month + "-01") ? params.month : "");
  const displayed = month || today.slice(0, 7);
  const first = utcDate(displayed + "-01");
  const previous = new Date(first), next = new Date(first);
  previous.setUTCMonth(first.getUTCMonth() - 1);
  next.setUTCMonth(first.getUTCMonth() + 1);
  const days = [];
  const nextMonth = iso(next).slice(0, 7);
  const matching = events.filter((event) =>
    validDay(event.start) && (!params.province || event.province === params.province) &&
    (!params.discipline || String(event.discipline || "").split("/").includes(params.discipline)));
  const end = (e) => validDay(e.end) && e.end >= e.start ? e.end : e.start;
  const overlap = (event, start, last) => event.start <= last && end(event) >= start;
  const inMonth = matching.filter((e) => e.start < nextMonth + "-01" && end(e) >= iso(first));
  for (const date = new Date(first); date < next; date.setUTCDate(date.getUTCDate() + 1)) {
    const value = iso(date);
    days.push({ value, number: date.getUTCDate(), count: inMonth.filter((e) => overlap(e, value, value)).length });
  }
  const list = (day ? inMonth.filter((e) => overlap(e, day, day))
    : month ? inMonth : matching.filter((e) => end(e) >= today)).sort((a, b) =>
    a.start.localeCompare(b.start) || String(a.name).localeCompare(String(b.name)));
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const requested = Math.floor(Number(params.page)) || 1;
  const page = Math.max(1, Math.min(pages, requested));
  return {
    today, month, day, displayed, previous: iso(previous).slice(0, 7), next: nextMonth,
    offset: (first.getUTCDay() + 6) % 7, days, page, pages, total: list.length,
    events: list.slice((page - 1) * pageSize, page * pageSize),
  };
}

const trackText = {
  ST: ["Short track", "短道", "Courte piste"], LT: ["Long track", "大道", "Longue piste"],
};

function dateLabels(locale) {
  const format = (options) => new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options });
  const month = format({ month: "long", year: "numeric" });
  const full = format({ month: "short", day: "numeric", year: "numeric" });
  const compact = format({ month: "short", day: "numeric" });
  const weekday = format({ weekday: "short" });
  return {
    month: (value) => month.format(utcDate(value + "-01")),
    day: (value) => full.format(utcDate(value)),
    range: (start, end, today) => {
      const through = validDay(end) && end >= start ? end : start;
      const label = start.slice(0, 4) === today.slice(0, 4) && through.slice(0, 4) === today.slice(0, 4)
        ? compact : full;
      return label.formatRange(utcDate(start), utcDate(through));
    },
    weekdays: Array.from({ length: 7 }, (_, i) => weekday.format(new Date(monday + i * 86_400_000))),
  };
}

function registration(event, today, txt) {
  const method = event.registration_status;
  if ((event.end || event.start) < today) return { kind: "ended", text: txt("Meet finished", "比赛已结束", "Compétition terminée") };
  if (method === "closed") return { kind: "closed", text: txt("Entries closed", "报名已关闭", "Inscriptions closes") };
  if (validDay(event.deadline) && event.deadline < today)
    return { kind: "past-deadline", text: txt("Entry deadline passed", "已过报名截止日", "Date limite dépassée") };
  if (method === "club") return { kind: "club", text: txt("Enter through your club", "通过俱乐部报名", "Inscription par le club") };
  if (method === "waitlist") return { kind: "waitlist", text: txt("Waitlist only", "仅限候补", "Liste d’attente seulement") };
  if (method === "portal") return { kind: "portal", text: txt("Organizer’s portal", "主办方报名平台", "Portail de l’organisateur") };
  if (safeSource(event.registration_url) && ["direct", "published", "open"].includes(method))
    return { kind: "direct", text: txt("Entry link available", "已公布报名链接", "Lien d’inscription disponible") };
  return { kind: "pending", text: txt("Entry details pending", "暂无报名信息", "Modalités d’inscription à venir") };
}

function eventCard(event, today, sourceRecord, ui, labels, standalone = false) {
  const { esc, txt, svg } = ui;
  const reg = registration(event, today, txt);
  const upcoming = !["closed", "ended", "past-deadline"].includes(reg.kind);
  const href = (value, label, cls = "source") => {
    const url = safeSource(value);
    return url ? `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ${svg("external")}</a>` : "";
  };
  const method = txt(event.registration_method, event.registration_method_zh, event.registration_method_fr);
  const eligibility = txt(event.eligibility, event.eligibility_zh, event.eligibility_fr);
  const source = safeSource(event.source_url);
  const details = safeSource(event.details_url);
  const requirements = safeSource(event.requirements_url);
  const booking = safeSource(event.registration_url);
  const entryUrl = ["direct", "portal", "waitlist"].includes(reg.kind) ? booking : "";
  const entryLabel = reg.kind === "portal" ? txt("Open registration portal", "打开主办方报名平台", "Ouvrir le portail d’inscription")
    : reg.kind === "waitlist" ? txt("View waitlist", "查看候补报名页", "Voir la liste d’attente") : txt("Go to registration page", "前往赛事报名页", "Ouvrir la page d’inscription");
  const sourceLinks = [
    requirements && ![details, source, booking].includes(requirements)
      ? href(requirements, txt("Eligibility requirements", "参赛资格要求", "Critères d’admissibilité")) : "",
    !upcoming && booking && booking !== details && booking !== source && event.registration_status !== "portal"
      ? href(booking, reg.kind === "past-deadline" ? txt("Check entry page", "查看报名页面", "Consulter la page d’inscription") : txt("Past entry information", "查看原报名资料", "Anciennes modalités d’inscription")) : "",
    reg.kind === "past-deadline" && booking && booking !== details && booking !== source && event.registration_status === "portal"
      ? href(booking, txt("Organizer’s booking portal", "主办方报名平台", "Portail d’inscription de l’organisateur")) : "",
    details && details !== entryUrl ? href(details, txt("Competition details", "赛事规程", "Règlement de la compétition")) : "",
    source && source !== details && source !== entryUrl ? href(source, txt("Official listing", "官方赛事页面", "Page officielle")) : "",
  ].join("");
  const registerNote = method && !entryUrl ? method : !entryUrl && (standalone || reg.kind === "club") ? reg.text : "";
  const windows = [...(event.entry_windows || [])].sort((a, b) => a.date.localeCompare(b.date));
  const windowNames = {
    early: txt("Early entry", "提前报名截止", "Inscription hâtive"), regular: txt("General entry", "常规报名截止", "Inscription régulière"),
    late: txt("Late entries", "补报名截止", "Inscription tardive"), alternate: txt("Invited alternates", "受邀候补报名截止", "Remplaçants invités"),
    club: txt("Club submission", "俱乐部提交截止", "Inscription par le club"),
  };
  const facts = [
    ...(event.deadline && !windows.some(w => w.date === event.deadline) ? [[txt("Entry deadline", "报名截止", "Date limite d’inscription"), validDay(event.deadline) ? labels.day(event.deadline) : event.deadline]] : []),
    ...windows.map(w => [windowNames[w.kind], [labels.day(w.date), w.time].filter(Boolean).join(" · ")]),
    ...(event.fee ? [[txt("Entry fee", "报名费用", "Frais d’inscription"), txt(event.fee, event.fee_zh, event.fee_fr)]] : []),
  ];
  const checked = checkedDay(event.verified_at || event.checked || event.calendar_checked || sourceRecord?.checked);
  const checkedLabel = event.verified_at ? txt("Entry information checked ", "报名资料核查于 ", "Inscription vérifiée le ") : txt("Listing checked ", "赛事页面核查于 ", "Page vérifiée le ");
  const sourceName = event.source || sourceRecord?.name;
  const loc = [event.location, event.province].filter(Boolean);
  // Some official listings already include their province after the city.
  const location = loc.length === 2 && loc[0].split(/[,·]/).map((s) => s.trim()).includes(loc[1]) ? loc[0] : loc.join(", ");
  const statusText = ["direct", "portal"].includes(reg.kind) && validDay(event.deadline)
    ? txt("Enter by ", "截止 ", "Avant le ") + labels.range(event.deadline, event.deadline, today) : reg.text;
  const summary = `<span class="prep-summary-text">
      <span class="prep-date-line"><time datetime="${esc(event.start)}">${esc(labels.range(event.start, event.end, today))}</time>${meetBadges(event, txt)}</span>
      <strong class="prep-meet-name">${esc(event.name)}</strong>
      <span class="prep-location">${esc(location || txt("Venue to be confirmed", "地点待公布", "Lieu à confirmer"))}</span>
    </span><span class="prep-status ${reg.kind}">${esc(statusText)}</span><span class="prep-chevron">${svg("chevron")}</span>`;
  const url = esc(ui.route("prepare/" + event.id));
  if (event.archived && !standalone) return `<a class="prep-meet prep-past" href="${url}">${summary}</a>`;
  const heading = standalone ? "h2" : "h3";
  const checker = entryCheck(event.entry_rules, ui);
  const staleDay = event.notice_stale && checkedDay(event.notice_checked);
  const info = `<div class="prep-info">
      ${entryUrl || registerNote || !standalone ? `<div class="prep-section prep-entry">
        <${heading}>${txt("Registration", "报名", "Inscription")}</${heading}>
        ${registerNote ? `<p>${esc(registerNote)}</p>` : ""}
        ${entryUrl || !standalone ? `<div class="prep-links">${entryUrl ? href(entryUrl, entryLabel, "primary") : ""}${standalone ? "" : `<a class="under meet-page-link" href="${url}">${txt("Open meet page", "打开赛事主页", "Ouvrir la fiche de la compétition")} ${svg("arrow")}</a>`}</div>` : ""}
        ${entryUrl && method ? `<details class="compact-notes"><summary>${txt("Entry instructions", "报名须知", "Modalités d’inscription")}</summary><p>${esc(method)}</p></details>` : ""}
      </div>` : ""}
      ${facts.length ? `<div class="prep-section"><${heading}>${txt("Deadlines & fees", "截止时间与费用", "Dates limites et frais")}</${heading}>
        <dl class="prep-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></div>` : ""}
      ${eligibility || checker ? `<div class="prep-section"><${heading}>${txt("Eligibility", "参赛资格", "Admissibilité")}</${heading}>${eligibility ? `<p>${esc(eligibility)}</p>` : ""}${checker}</div>` : ""}
      ${sourceLinks || sourceName || checked || staleDay ? `<details class="prep-section compact-notes prep-sources">
        <summary>${txt("Official documents & sources", "官方规程与来源", "Documents et sources officiels")}${staleDay ? ` <span class="prep-checked">· ${txt("Update pending", "待更新", "Mise à jour en attente")}</span>` : ""}</summary>
        ${sourceLinks ? `<div class="prep-links">${sourceLinks}</div>` : ""}
        ${staleDay ? `<p class="prep-checked">${esc(txt("Announcement unavailable. Last checked ", "公告暂时无法更新，最近核查于 ", "Annonce indisponible. Dernière vérification le ") + labels.day(staleDay))}</p>` : ""}
        ${sourceName || checked ? `<p class="prep-checked">${esc([sourceName, checked && checkedLabel + labels.day(checked)].filter(Boolean).join(" · "))}</p>` : ""}
      </details>` : ""}
    </div>`;
  if (standalone) return info;
  return `<details class="prep-meet" data-prep-event="${esc(event.id)}"><summary>${summary}</summary>${info}</details>`;
}

export function renderMeetPage(event, sourceRecord, results, ui, today = localDay()) {
  const { esc, svg, txt, route } = ui;
  const date = dateLabels(txt("en-CA", "zh-CN", "fr-CA"));
  const location = [event.location, event.province].filter(Boolean).join(" · ");
  const heading = `<div class="event-heading">${meetBadges(event, txt)}<h1>${esc(event.name)}</h1>
    <p>${esc(date.range(event.start, event.end, today))}${location ? " · " + esc(location) : ""}</p></div>`;
  if (event.listing_removed) {
    const url = safeSource(event.source_url);
    return heading + `<p class="notice">${txt("This meet has left the organizer’s calendar. Check the official listing for any changes.", "这场比赛已从主办方赛历移除，请查看官方页面确认变动。", "Cette compétition a été retirée du calendrier de l’organisateur. Consultez la page officielle pour vérifier les changements.")}
      ${url ? `<a class="under" target="_blank" rel="noopener noreferrer" href="${esc(url)}">${txt("Official listing", "官方赛事页面", "Page officielle")} ${svg("external")}</a>` : ""}</p>`;
  }
  const info = eventCard(event, today, sourceRecord, ui, date, true);
  const ended = (event.end || event.start) < today;
  const notice = ended ? `<details class="panel meet-notice"><summary>${txt("Original meet information", "赛前公告与报名资料", "Annonce et inscription d’origine")}</summary>${info}</details>`
    : `<section class="panel meet-notice">${info}</section>`;
  if (event.start > today) return heading + notice;
  const cards = (results || []).map(result => {
    const races = result.races || [];
    const replays = races.filter(r => /^[\w-]{11}$/.test(r.clip?.youtube_id || ""));
    const racesLink = esc(route("event/" + result.id));
    const state = result.review ? txt("Result update under review", "成绩修订正在核对", "Mise à jour des résultats en cours de vérification") : !races.length ? txt("Individual results pending", "逐场成绩待收录", "Résultats individuels à venir") :
      result.coverage === "partial" ? txt("Partial results", "部分成绩", "Résultats partiels") : txt("Verified results", "已核实成绩", "Résultats vérifiés");
    const replayList = replays.map(r => {
      const parts = [r.distance && r.distance + " m", r.round, r.label, r.group].filter(Boolean);
      return `<a class="under" href="${esc(route("race/" + result.id + "/" + r.id, { from: route("prepare/" + event.id) }))}">${svg("play")} ${esc(parts.join(" · "))}</a>`;
    }).join("");
    return `<p>${esc(state)}${races.length ? " · " + races.length + txt(" races", " 场", " courses") : ""}</p><a class="secondary" data-linked-result="${esc(result.id)}" href="${racesLink}">${txt("View competition results", "查看赛事成绩", "Voir les résultats")} ${svg("arrow")}</a>
      ${replays.length ? `<details class="meet-replays"><summary>${txt("Race replays", "分场录像", "Rediffusions des courses")} (${replays.length})</summary><div>${replayList}</div></details>` : ""}`;
  }).join("");
  const state = results === null ? txt("The results archive is temporarily unavailable.", "成绩档案暂时无法读取。", "Les archives de résultats sont temporairement indisponibles.")
    : txt("Race results aren’t on this page yet.", "此页暂无这场比赛的逐场成绩。", "Les résultats des courses ne figurent pas encore sur cette page.");
  const recap = `<section class="panel meet-recap"><h2>${txt("Results & replays", "成绩与回放", "Résultats et rediffusions")}</h2>${cards || `<p>${state}</p>`}</section>`;
  return heading + recap + notice;
}

export function renderPrepare(feed, params, ui, today = localDay()) {
  const { txt, esc, route, select, svg } = ui;
  const events = [...(feed.events || []), ...(feed.past || []).map(e => ({ ...e, archived: true }))];
  const model = calendarModel(events, params, today);
  const date = dateLabels(txt("en-CA", "zh-CN", "fr-CA"));
  const path = (change) => esc(route("prepare", { ...params, page: "", ...change }));
  const resetDate = path({ day: "", month: "" });
  const provinces = [...new Set(events.map((e) => e.province).filter(Boolean))].sort();
  const heading = model.day ? date.day(model.day) : model.month ? date.month(model.month) : txt("Upcoming competitions", "近期比赛", "Compétitions à venir");
  const monthName = date.month(model.displayed);
  const dayCells = model.days.map(({ value, number, count }) => {
    const current = value === today ? ' aria-current="date"' : "";
    const className = "prep-day" + (count ? " race-day" : "") + (value === model.day ? " selected" : "");
    const label = date.day(value) + (count ? txt(`, ${count} competition${count > 1 ? "s" : ""}`, `，${count} 场比赛`, `, ${count} compétition${count > 1 ? "s" : ""}`) : "") +
      (value === model.day ? txt(", selected", "，已选择", ", jour sélectionné") : "");
    return count || value === model.day
      ? `<a class="${className}" aria-label="${esc(label)}"${current} href="${path({ day: value, month: model.displayed })}">${number}</a>`
      : `<span class="${className}"${current}>${number}</span>`;
  }).join("");
  const arrow = (value, label, previous) => `<a class="prep-calendar-arrow${previous ? " prev" : ""}" href="${path({ month: value, day: "" })}" aria-label="${esc(label)}">${svg("chevron")}</a>`;
  const snapshot = checkedDay(feed.checked);
  const sources = new Map((feed.sources || []).map((source) => [source.id, source]));
  const unavailable = [...sources.values()].filter((source) => ["stale", "unavailable"].includes(source.status));
  const checked = snapshot ? txt("Calendar checked ", "赛历核查于 ", "Calendrier vérifié le ") + date.day(snapshot) : "";
  return `<div class="prep-page">
  <div class="prep-heading"><h1>${txt("Race preparation", "赛前准备", "Préparation à la compétition")}</h1></div>
  <div class="prep-filters">
    ${select("province", txt("Province / territory", "省 / 地区", "Province ou territoire"), provinces, params.province, txt("All regions", "所有地区", "Toutes les régions"))}
    ${select("discipline", txt("Discipline", "道别", "Discipline"), ["ST", "LT"].map((v) => [v, txt(...trackText[v])]), params.discipline, txt("Both tracks", "全部道别", "Toutes les disciplines"))}
  </div>
  <div class="prep-layout">
    <section class="prep-calendar" aria-label="${txt("Competition calendar", "赛事日历", "Calendrier des compétitions")}">
      <div class="prep-month"><h2>${esc(monthName)}</h2><div>
        ${arrow(model.previous, txt("Previous month", "上个月", "Mois précédent"), true)}${arrow(model.next, txt("Next month", "下个月", "Mois suivant"), false)}</div></div>
      <div class="prep-week" aria-hidden="true">${date.weekdays.map((w) => `<span>${esc(w)}</span>`).join("")}</div>
      <div class="prep-days">${Array.from({length:model.offset}, () => '<span aria-hidden="true"></span>').join("")}${dayCells}</div>
      <div class="prep-cal-foot"><span class="prep-legend">${txt("Race day", "比赛日", "Jour de compétition")}</span>${model.day || model.month ? `<a href="${resetDate}">${txt("Back to upcoming", "返回近期比赛", "Retour aux prochaines compétitions")}</a>` : ""}</div>
    </section>
    <section class="prep-agenda" aria-labelledby="prep-agenda-title">
      <div class="prep-agenda-head"><h2 id="prep-agenda-title" tabindex="-1">${esc(heading)}</h2><span class="total">${model.total}</span></div>
      ${model.events.length ? `<div class="prep-meets">${model.events.map((event) => eventCard(event, today, sources.get(event.source_id), ui, date)).join("")}</div>`
        : `<div class="prep-empty"><h3>${txt("No competitions listed", "暂无收录的比赛", "Aucune compétition répertoriée")}</h3><p>${txt("Try another month or clear the filters.", "换个月份，或清除筛选条件。", "Essayez un autre mois ou effacez les filtres.")}</p><a class="under" href="${esc(route("prepare"))}">${txt("Show all upcoming competitions", "查看全部近期比赛", "Voir toutes les prochaines compétitions")} ${svg("arrow")}</a></div>`}
      ${model.pages > 1 ? `<div class="prep-pager" aria-label="${txt("Competition list pages", "赛事分页", "Pages des compétitions")}">
        ${model.page > 1 ? `<a href="${path({ page: model.page - 1 })}">${txt("Previous", "上一页", "Précédent")}</a>` : "<span></span>"}
        <span>${model.page} / ${model.pages}</span>
        ${model.page < model.pages ? `<a href="${path({page: model.page + 1})}">${txt("Next", "下一页", "Suivant")}</a>` : "<span></span>"}</div>` : ""}
    </section></div>
    ${checked || unavailable.length ? `<details class="compact-notes prep-calendar-sources"><summary>${unavailable.length ? txt("Calendar sources · update pending", "赛历来源 · 待更新", "Sources du calendrier · mise à jour en attente") : txt("Calendar sources", "赛历来源", "Sources du calendrier")}</summary>
      ${checked ? `<p>${esc(checked)}</p>` : ""}${unavailable.length ? `<p>${txt("Could not refresh ", "暂时无法更新 ", "Échec de la mise à jour : ")}${esc(unavailable.map(s => s.name).join(" · "))}</p>` : ""}
    </details>` : ""}</div>`;
}
