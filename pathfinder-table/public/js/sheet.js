import { h, clear, cap, signed, modal, richText, toast, select } from "./ui.js";
import { load, coreData } from "./data.js";
import { ATTRS, ATTR_NAMES, SKILLS, RANKS, AON, computeCharacter } from "./shared/rules.js";
import { act } from "./api.js";
import { actionText } from "./builder.js";

const aon = (name) => h("a", { class: "aon", href: AON.search(name), target: "_blank", rel: "noopener" }, "AoN ↗");

// Roll helper: rolls on the server so everyone sees the same result
export async function roll(formula, label, opts = {}) {
  try {
    await act("roll", { formula, label, ...opts });
  } catch (e) { toast(e.message, "error"); }
}

// Render a character sheet. `editable` lets the viewer change live state (HP etc).
export function renderSheet(char, { editable = false, onEdit, rollAs, compact = false } = {}) {
  const data = coreData();
  const comp = computeCharacter(char, data);
  const live = char.live || {};
  const hp = live.hp ?? comp.maxHp;
  const as = rollAs ? { as: rollAs } : {};
  const r = (mod, label) => roll(`1d20${mod >= 0 ? "+" : ""}${mod}`, `${char.name}: ${label}`, as);
  const setLive = (patch) => act("updateCharacterState", { characterId: char.id, live: patch }).catch((e) => toast(e.message, "error"));
  const rollBtn = (label, mod) => h("button", { class: "rollable", title: `Roll ${label}`, onclick: () => r(mod, label) }, h("span", {}, label), h("strong", {}, signed(mod)));

  const root = h("div", { class: `sheet ${compact ? "compact" : ""}` });

  // header
  root.append(h("div", { class: "sheet-head" },
    h("div", { class: "token-dot", style: { background: char.color || "#3b6ea5" } }, (char.name || "?")[0]),
    h("div", {},
      h("h2", {}, char.name || "Unnamed"),
      h("p", { class: "muted" }, `Level ${char.level} ${char.heritage ? char.heritage + " " : ""}${char.ancestry} ${char.class}${char.subclass ? " (" + char.subclass + ")" : ""} · ${char.background}${char.deity ? " · " + char.deity : ""}`)),
    editable && onEdit ? h("button", { onclick: onEdit }, "Edit build") : null));

  // HP & defenses
  const hpInput = h("input", { type: "number", value: hp, style: { width: "4.5em" }, disabled: !editable ? "disabled" : null });
  const temp = live.tempHp || 0;
  const dmg = h("input", { type: "number", placeholder: "amt", style: { width: "4em" } });
  const conds = live.conditions || [];
  root.append(h("div", { class: "sheet-vitals" },
    h("div", { class: "vital hp" },
      h("span", { class: "lbl" }, "Hit Points"),
      h("div", { class: "row" }, hpInput, h("span", {}, ` / ${comp.maxHp}`), temp ? h("span", { class: "tag" }, `+${temp} temp`) : null),
      h("div", { class: "hpbar" }, h("div", { style: { width: `${Math.max(0, Math.min(100, (hp / comp.maxHp) * 100))}%` } })),
      editable ? h("div", { class: "row" }, dmg,
        h("button", { class: "small", onclick: () => {
          let n = +dmg.value || 0, t = temp;
          const absorbed = Math.min(t, n); t -= absorbed; n -= absorbed;
          setLive({ hp: Math.max(0, hp - n), tempHp: t });
        } }, "Damage"),
        h("button", { class: "small", onclick: () => setLive({ hp: Math.min(comp.maxHp, hp + (+dmg.value || 0)) }) }, "Heal"),
        h("button", { class: "small", onclick: () => setLive({ tempHp: +dmg.value || 0 }) }, "Temp")) : null),
    h("div", { class: "vital" }, h("span", { class: "lbl" }, "AC"), h("strong", { class: "big" }, comp.ac), comp.shieldAC ? h("small", {}, `${comp.shieldAC} with shield raised`) : null),
    h("div", { class: "vital" }, h("span", { class: "lbl" }, "Saves"),
      rollBtn("Fortitude", comp.saves.fortitude), rollBtn("Reflex", comp.saves.reflex), rollBtn("Will", comp.saves.will)),
    h("div", { class: "vital" }, h("span", { class: "lbl" }, "Perception"), rollBtn("Perception", comp.perception),
      h("small", {}, `${comp.speed} ft · ${cap((comp.vision || "normal").replace(/-/g, " "))}`),
      comp.classDC ? h("small", {}, `Class DC ${comp.classDC}`) : null,
      comp.spellDC ? h("small", {}, `Spell DC ${comp.spellDC} · attack ${signed(comp.spellAttack)}`) : null),
    h("div", { class: "vital" }, h("span", { class: "lbl" }, "Hero Points"),
      h("div", { class: "row" }, [0, 1, 2].map((i) => h("button", { class: `pip ${(live.heroPoints ?? 1) > i ? "on" : ""}`, disabled: !editable ? "disabled" : null, onclick: () => setLive({ heroPoints: (live.heroPoints ?? 1) > i ? i : i + 1 }) }, "★"))),
      h("span", { class: "lbl" }, "Dying / Wounded"),
      h("div", { class: "row" },
        select([0, 1, 2, 3, 4].map(String), live.dying || 0, (v) => setLive({ dying: +v }), { disabled: !editable ? "disabled" : null }),
        select([0, 1, 2, 3].map(String), live.wounded || 0, (v) => setLive({ wounded: +v }), { disabled: !editable ? "disabled" : null })))));
  hpInput.addEventListener("change", () => setLive({ hp: +hpInput.value }));

  // conditions
  const condRow = h("div", { class: "conditions row wrap" }, h("span", { class: "lbl" }, "Conditions:"),
    conds.length ? conds.map((cd, i) => h("span", { class: "chip on" }, h("button", { class: "link", onclick: () => showCondition(cd.name) }, `${cd.name}${cd.value ? " " + cd.value : ""}`),
      editable ? h("button", { class: "icon", onclick: () => setLive({ conditions: conds.filter((_, j) => j !== i) }) }, "✕") : null)) : h("span", { class: "muted" }, "none"),
    editable ? h("button", { class: "small", onclick: () => addCondition(conds, setLive) }, "+ condition") : null);
  root.append(condRow);

  const cols = h("div", { class: "sheet-cols" });
  // attributes + skills
  cols.append(h("section", {},
    h("h3", {}, "Attributes"),
    h("div", { class: "attr-grid" }, ATTRS.map((a) => h("div", { class: "attr", title: ATTR_NAMES[a] }, h("span", {}, a.toUpperCase()), h("strong", {}, signed(comp.mods[a]))))),
    h("h3", {}, "Skills"),
    h("div", { class: "skills" }, Object.keys(SKILLS).map((s) => h("button", { class: `rollable skill ${comp.skillRank[s] ? "" : "untrained"}`, onclick: () => r(comp.skills[s], cap(s)) },
      h("span", {}, cap(s), " ", h("small", { title: RANKS[comp.skillRank[s]] }, RANKS[comp.skillRank[s]][0])), h("strong", {}, signed(comp.skills[s])))),
      comp.lores.map((l) => h("button", { class: "rollable skill", onclick: () => r(l.mod, l.name) }, h("span", {}, l.name, " ", h("small", {}, "T")), h("strong", {}, signed(l.mod))))),
  ));

  // strikes, spells
  const mid = h("section", {}, h("h3", {}, "Strikes"));
  for (const s of comp.strikes) {
    mid.append(h("div", { class: "strike" },
      h("div", { class: "row between" }, h("strong", {}, s.name), h("small", { class: "muted" }, s.traits.join(", "))),
      h("div", { class: "row" },
        s.map.map((pen, i) => h("button", { class: "small rollable", onclick: () => r(s.attack + pen, `${s.name} Strike${i ? " (" + (i + 1) + (i === 1 ? "nd" : "rd") + " attack)" : ""}`) }, signed(s.attack + pen))),
        h("button", { class: "small", onclick: () => roll(s.damage, `${char.name}: ${s.name} damage (${s.damageType})`, as) }, `${s.damage} ${s.damageType}`),
        h("button", { class: "small", title: "Critical hit: double damage", onclick: () => roll(s.damage, `${char.name}: ${s.name} critical damage (${s.damageType})`, { ...as, multiply: 2 }) }, "crit ×2"))));
  }
  const known = char.spells || {};
  const spellNames = [...(known.cantrips || []), ...Object.values(known.known || {}).flat()];
  if (spellNames.length) {
    mid.append(h("h3", {}, `Spells ${comp.tradition ? "(" + comp.tradition + ")" : ""}`),
      h("p", { class: "muted" }, `Spell attack ${signed(comp.spellAttack)} · DC ${comp.spellDC}`),
      comp.spellAttack !== null ? h("button", { class: "small rollable", onclick: () => r(comp.spellAttack, "Spell attack") }, `Spell attack ${signed(comp.spellAttack)}`) : null);
    const used = live.slotsUsed || {};
    const spellRow = (rank, names) => h("div", { class: "spell-rank" },
      h("div", { class: "row between" }, h("strong", {}, rank === 0 ? "Cantrips" : `Rank ${rank}`),
        rank > 0 ? h("span", { class: "row" }, Array.from({ length: comp.slots[rank] || 0 }, (_, i) => h("button", { class: `pip ${i < (used[rank] || 0) ? "" : "on"}`, title: "Spell slot", disabled: !editable ? "disabled" : null, onclick: () => setLive({ slotsUsed: { ...used, [rank]: i < (used[rank] || 0) ? i : i + 1 } }) }, "●"))) : null),
      h("div", { class: "chips" }, names.map((n) => h("button", { class: "chip", onclick: () => showSpell(n) }, n))));
    mid.append(spellRow(0, known.cantrips || []));
    for (const [rank, names] of Object.entries(known.known || {})) if (names.length) mid.append(spellRow(+rank, names));
    if (editable && Object.keys(comp.slots).length) mid.append(h("button", { class: "small", onclick: () => setLive({ slotsUsed: {} }) }, "Rest: refresh slots"));
  }
  cols.append(mid);

  // feats, gear
  const right = h("section", {}, h("h3", {}, "Feats & features"));
  const bg = data.backgrounds.find((b) => b.name === char.background);
  const featList = [...(bg?.feat ? [["Background", bg.feat]] : []), ...Object.entries(char.feats || {}).sort((a, b) => +a[0].split("-")[1] - +b[0].split("-")[1]).map(([k, v]) => [cap(k.replace("-", " ")), v])];
  right.append(h("div", { class: "chips" }, featList.map(([k, v]) => h("button", { class: "chip", title: k, onclick: () => showFeat(v) }, v))));
  const klass = data.classes.find((x) => x.name === char.class);
  if (klass) right.append(h("details", {}, h("summary", {}, "Class features"), h("ul", { class: "plain" }, klass.features.filter((f) => f.level <= char.level).map((f) => h("li", {}, h("small", { class: "muted" }, f.level + " "), f.name, " ", aon(f.name))))));
  const e = char.equipment || {};
  right.append(h("h3", {}, "Equipment"),
    h("ul", { class: "plain" },
      e.armor ? h("li", {}, `${e.armor}${e.armorRunes?.potency ? ` +${e.armorRunes.potency}` : ""}${e.armorRunes?.resilient ? " resilient" : ""}`) : h("li", {}, "No armor"),
      e.shield ? h("li", {}, e.shield) : null,
      (e.items || []).map((it) => h("li", {}, `${it.qty > 1 ? it.qty + "× " : ""}${it.name}`)),
      h("li", {}, `${e.gold ?? 0} gp`)),
    h("p", { class: "muted" }, `Bulk limit ${comp.bulkLimit} (encumbered above ${comp.bulkLimit}). Languages: ${comp.languages.map(cap).join(", ")}`));
  if (char.notes) right.append(h("h3", {}, "Notes"), h("p", { class: "pre" }, char.notes));
  cols.append(right);
  root.append(cols);
  return root;
}

async function addCondition(conds, setLive) {
  const all = await load("conditions");
  const valued = ["Clumsy", "Doomed", "Drained", "Dying", "Enfeebled", "Frightened", "Sickened", "Slowed", "Stunned", "Stupefied", "Wounded", "Persistent Damage"];
  const sel = select(all.map((c) => c.name), all[0].name, () => {});
  const val = h("input", { type: "number", min: 1, value: 1, style: { width: "4em" } });
  const m = modal("Add condition", h("div", {}, h("div", { class: "row" }, sel, val,
    h("button", { class: "primary", onclick: () => {
      const name = sel.value;
      setLive({ conditions: [...conds.filter((c) => c.name !== name), { name, value: valued.includes(name) ? +val.value : null }] });
      m.close();
    } }, "Add")), h("p", { class: "hint" }, "Values matter for Frightened, Clumsy, Drained, Enfeebled, Sickened, Slowed, Stunned, Stupefied and Doomed.")));
}

export async function showCondition(name) {
  const all = await load("conditions");
  const c = all.find((x) => x.name === name);
  modal(name, h("div", {}, c ? richText(c.desc) : "Not found.", aon(name)));
}
export async function showSpell(name) {
  const all = await load("spells");
  const s = all.find((x) => x.name === name);
  if (!s) return modal(name, h("p", {}, "Not in the bundled data. ", aon(name)));
  modal(name, h("div", {},
    h("p", { class: "muted" }, `${s.cantrip ? "Cantrip" : s.focus ? "Focus " + s.rank : "Spell " + s.rank} · ${s.traits.join(", ")}`),
    h("p", {}, [s.time && `Cast ${actionText(s.time)}`, s.range && `Range ${s.range}`, s.area && `Area ${s.area}`, s.target && `Targets ${s.target}`, s.save && `Defense ${cap(s.save)}`, s.duration && `Duration ${s.duration}`].filter(Boolean).join(" · ")),
    richText(s.desc), h("p", { class: "muted" }, `Source: ${s.source} `, aon(name))));
}
export async function showFeat(name) {
  const all = await load("feats");
  const f = all.find((x) => x.name === name);
  if (!f) return modal(name, h("p", {}, "Not in the bundled data. ", aon(name)));
  modal(name, h("div", {},
    h("p", { class: "muted" }, `Feat ${f.level} ${f.actions ? "· " + actionText(f.actions) : ""} · ${f.traits.join(", ")}`),
    f.prereq.length ? h("p", {}, h("strong", {}, "Prerequisites "), f.prereq.join("; ")) : null,
    richText(f.desc), h("p", { class: "muted" }, `Source: ${f.source} `, aon(name))));
}
