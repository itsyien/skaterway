import { displayName, matches, norm } from "./model.mjs";

function key(label) {
  const text = String(label ?? "").trim();
  return norm(/^(?:[a-z]\.\s*)+[a-z]?\.?$/i.test(text) ? text.replace(/[.\s]/g, "") : text);
}

function clubStem(name) {
  return name.replace(/\s+speed\s?skating\s+(club|association)$/i, "").trim();
}

export function organizationSearch(catalog = {}) {
  const names = new Map(), cities = new Map(), memberRegions = new Map();
  const byRegion = new Map((catalog.regions || []).map(region => [region.code, region]));
  const affiliates = new Map();
  function add(map, label, item) {
    const id = key(label);
    if (!id || !item) return;
    if (!map.has(id)) map.set(id, new Set());
    map.get(id).add(item);
  }
  for (const region of byRegion.values()) {
    for (const label of [region.name, region.place, region.code, ...(region.aliases || [])]) add(names, label, region);
  }
  for (const club of catalog.clubs || []) {
    for (const city of club.cities) add(cities, city, club);
  }
  for (const club of catalog.clubs || []) {
    // A city alone can represent multiple clubs, or a city team in the results.
    const stem = clubStem(club.name);
    const aliases = [club.name, ...(club.aliases || [])];
    if (!cities.has(key(stem))) aliases.push(stem);
    if (stem !== club.name) aliases.push(stem + (/association$/i.test(club.name) ? " SSA" : " SSC"));
    for (const label of aliases) add(names, label, club);
  }
  for (const [code, roster] of catalog.members || []) {
    for (const label of roster) add(memberRegions, label, byRegion.get(code));
  }
  function organization(label) {
    const options = names.get(key(label));
    if (!options?.size) return undefined;
    // Some provincial bodies also operate a club under their own name.
    return [...options].find(item => item.code) || (options.size === 1 ? [...options][0] : undefined);
  }
  function affiliations(label) {
    const id = key(label);
    if (!affiliates.has(id)) {
      const found = new Set(memberRegions.get(id));
      const org = organization(label);
      if (org) {
        found.add(org);
        if (byRegion.has(org.region)) found.add(byRegion.get(org.region));
      }
      const cityRegions = new Set([...(cities.get(id) || [])].map(c => c.region));
      if (cityRegions.size === 1) found.add(byRegion.get([...cityRegions][0]));
      affiliates.set(id, [...found].filter(Boolean));
    }
    return affiliates.get(id);
  }
  function compile(query) {
    const value = key(query);
    if (!value) return () => true;
    const org = organization(value), city = cities.has(value);
    return person => {
      const labels = [person.club, ...(person.clubs || [])].filter(Boolean);
      const related = labels.flatMap(affiliations);
      if (org) return related.includes(org);
      if (city) return labels.some(label => key(label) === value)
        || related.some(item => item.cities?.some(name => key(name) === value));
      const extra = related.map(item => [item.name, item.place, item.code, item.cities, item.aliases]);
      return matches(value, person.name, displayName(person.name), person.scope_meet, labels, extra);
    };
  }
  function area(query) {
    const id = key(query);
    const clubs = cities.get(id);
    if (!clubs) return undefined;
    const [first] = clubs;
    const provinces = [...new Set([...clubs].map(club => club.region))].sort();
    return { name: first.cities.find(city => key(city) === id), region: provinces.join(" / "), area: true };
  }
  return { organization, area, compile };
}
