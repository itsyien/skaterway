const seconds = (clock) => {
  const [minutes, rest] = clock.split(":").map(Number);
  return minutes * 60 + rest;
};

export function entryFeedback(rules, values, txt) {
  const notes = [];
  const age = Number(values.age);
  const band = values.age !== "" && rules.bands.find(b => age >= b.min && age <= b.max);
  if (values.age !== "" && Number.isInteger(age) && age >= 0 && age <= 99) {
    if (band) notes.push(txt(`Age falls in the published ${band.min}–${band.max} group.`, `年龄属于公告中的 ${band.min}–${band.max} 岁组。`, `L’âge correspond à la catégorie des ${band.min} à ${band.max} ans.`));
    else if (rules.coach_exception && rules.bands.some(b => age > b.max)) {
      notes.push(txt("Older novice skaters can ask their coach about an exception.", "超龄初学者可向教练确认能否按新手资格参赛。", "Les débutants plus âgés peuvent demander à leur entraîneur si une dérogation est possible."));
    } else notes.push(txt("Age is outside the listed bands. Check other categories with your club.", "年龄不在列出的范围内，请向俱乐部确认其他可用组别。", "L’âge est hors des catégories indiquées. Vérifiez les autres possibilités avec votre club."));
  }
  if (values.club) notes.push(values.club === "other"
    ? txt("Club is outside the published list. Ask about guest or out-of-region entries.", "俱乐部未在公告名单中，请确认是否接受外区或受邀报名。", "Le club ne figure pas sur la liste. Vérifiez si les inscriptions hors région ou sur invitation sont possibles.")
    : txt("This club is on the organizer’s list.", "这个俱乐部在主办方公布的名单内。", "Ce club figure sur la liste de l’organisateur."));
  if (values.membership) notes.push(values.membership === "yes"
    ? txt("You indicated that the skater has the listed membership.", "你已确认孩子持有公告所列会员资格。", "Vous avez indiqué que l’athlète détient l’adhésion requise.")
    : txt("Ask your club to verify the listed membership before entering.", "报名前请让俱乐部核实公告所列的会员资格。", "Demandez à votre club de confirmer l’adhésion requise avant l’inscription."));
  const mark = Number(values.seed);
  if (band?.distance && Number.isFinite(mark) && mark > 0) {
    if (band.required) notes.push(mark <= seconds(band.required)
      ? txt(`Meets the stated ${band.distance} m minimum (${band.required}).`, `达到 ${band.distance} 米的强制标准（${band.required}）。`, `Le temps satisfait au minimum indiqué au ${band.distance} m (${band.required}).`)
      : txt(`Slower than the required ${band.distance} m time of ${band.required}.`, `尚未达到 ${band.distance} 米的强制标准 ${band.required}。`, `Le temps est plus lent que le minimum exigé au ${band.distance} m (${band.required}).`));
    if (band.recommended) notes.push(mark <= seconds(band.recommended)
      ? txt(`Meets the recommended time of ${band.recommended}.`, `达到建议成绩 ${band.recommended}。`, `Le temps recommandé de ${band.recommended} est atteint.`)
      : txt(`The recommended time is ${band.recommended}.`, `公告中的建议成绩是 ${band.recommended}。`, `Le temps recommandé est de ${band.recommended}.`));
  }
  return notes;
}

export function entryCheck(rules, { txt, esc }) {
  if (!rules?.bands?.length) return "";
  const cutoff = rules.bands[0].as_of;
  const ageLabel = cutoff && rules.bands.every(b => b.as_of === cutoff)
    ? txt(`Age on ${cutoff}`, `${cutoff} 时的年龄`, `Âge au ${cutoff}`) : txt("Competition age", "参赛年龄", "Âge de compétition");
  return `<details class="entry-check" data-entry-rules="${esc(JSON.stringify(rules))}">
    <summary>${txt("Check entry criteria", "核对参赛条件", "Vérifier les critères d’admissibilité")}</summary>
    <div class="entry-check-fields">
      <label>${esc(ageLabel)}<input type="number" min="0" max="99" step="1" inputmode="numeric" data-entry-age></label>
      ${rules.clubs?.length ? `<label>${txt("Home club", "所属俱乐部", "Club d’attache")}<select data-entry-club><option value="">${txt("Select club", "选择俱乐部", "Choisir un club")}</option>${rules.clubs.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}<option value="other">${txt("Other club", "其他俱乐部", "Autre club")}</option></select></label>` : ""}
      ${rules.membership ? `<label>${rules.membership === "Ontario competitive" ? txt("Ontario competitive membership", "安省竞赛会员", "Adhésion compétitive en Ontario") : txt("Ontario club membership", "安省俱乐部会员", "Adhésion à un club ontarien")}<select data-entry-membership><option value="">${txt("Select", "请选择", "Choisir")}</option><option value="yes">${txt("I have this membership", "已持有", "J’ai cette adhésion")}</option><option value="check">${txt("Need to confirm", "需要核实", "À confirmer")}</option></select></label>` : ""}
      ${rules.bands.some(b => b.distance) ? '<label hidden data-seed-field><span></span><input type="number" min="0.001" step="any" inputmode="decimal" data-entry-seed></label>' : ""}
    </div><output aria-live="polite"></output>
    <small>${txt("Check other requirements in the official announcement. The organizer confirms entry.", "其他条件请参照官方规程，参赛资格由主办方确认。", "Consultez le bulletin officiel pour les autres critères. L’organisateur confirme l’admissibilité.")}</small>
  </details>`;
}

export function updateEntryCheck(event, txt) {
  const box = event.target.closest(".entry-check");
  if (!box) return;
  const rules = JSON.parse(box.dataset.entryRules);
  const value = (field) => box.querySelector(`[data-entry-${field}]`)?.value || "";
  const values = { age: value("age"), club: value("club"), membership: value("membership"), seed: value("seed") };
  const age = Number(values.age), band = values.age && rules.bands.find(b => b.min <= age && age <= b.max);
  const seed = box.querySelector("[data-seed-field]");
  if (seed) {
    seed.hidden = !band?.distance;
    if (band?.distance) seed.querySelector("span").textContent = txt(`${band.distance} m seed time (seconds)`, `${band.distance} 米报名成绩（秒）`, `Temps de référence au ${band.distance} m (secondes)`);
    if (event.target.hasAttribute("data-entry-age")) {
      seed.querySelector("input").value = "";
      values.seed = "";
    }
  }
  box.querySelector("output").textContent = entryFeedback(rules, values, txt).join(" ");
}
