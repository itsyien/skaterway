const labels = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function compactDistance(meters) {
  return meters >= 1000 ? `${meters / 1000}k` : String(meters);
}

export function longRaceTitle(race) {
  const label = race.label || "";
  const prefix = label.match(/^(\d+)\s*m\b\s*(.*)$/i);
  return prefix && Number(prefix[1]) === Number(race.distance) ? prefix[2] : label;
}

function editionOf(race, discipline) {
  return race.program || (discipline === "LT" && Number(race.label?.match(/#(\d+)\s*$/)?.[1])) || null;
}

export function programGroups(races, discipline) {
  const editions = new Map();
  for (const race of races) {
    if (!editions.has(race.distance)) editions.set(race.distance, new Set());
    editions.get(race.distance).add(editionOf(race, discipline));
  }
  const groups = new Map();
  for (const race of races) {
    const edition = editionOf(race, discipline);
    const key =
      edition && editions.get(race.distance).size > 1
        ? `${race.distance}-${edition}`
        : String(race.distance);
    if (!groups.has(key))
      groups.set(key, { key, distance: race.distance, edition, races: [] });
    groups.get(key).races.push(race);
  }
  const sorted = [...groups.values()];
  for (const group of sorted) {
    group.races.sort(
      (a, b) =>
        String(a.date || "").localeCompare(String(b.date || "")) ||
        labels.compare(a.label, b.label) ||
        labels.compare(a.group || "", b.group || ""),
    );
  }
  return sorted.sort(
    (a, b) => a.distance - b.distance || a.edition - b.edition,
  );
}
