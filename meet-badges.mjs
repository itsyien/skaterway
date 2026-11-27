import { norm } from "./model.mjs";

export function isNationalMeet(event) {
  if (event.competition_level) return norm(event.competition_level) === "national";
  const name = norm(event.name);
  if (/\b(?:provincial(?:es?)?|provinciaux|regional(?:es?)?|regionaux|trials?|selections?|qualifiers?|qualifications?)\b/.test(name)) return false;
  return /\b(?:canadian\b.*\b(?:championships?|champs|open)|national championships?|championnats? (?:canadiens?|nationaux)|canada cup|coupe (?:du )?canada|canada (?:winter )?games|jeux du canada)\b/.test(name);
}

export function meetBadges(event, txt) {
  const tracks = String(event.discipline || "").split("/");
  const labels = [];
  if (tracks.includes("ST")) labels.push(["short", txt("Short track", "短道", "Courte piste")]);
  if (tracks.includes("LT")) labels.push(["long", txt("Long track", "大道", "Longue piste")]);
  if (!labels.length) labels.push(["unspecified", txt("Track not specified", "道别待公布", "Discipline non indiquée")]);
  if (isNationalMeet(event)) labels.push(["national", txt("National", "全国赛", "National")]);
  return `<span class="meet-badges">${labels.map(([kind, label]) =>
    `<span class="badge ${kind}">${label}</span>`).join("")}</span>`;
}
