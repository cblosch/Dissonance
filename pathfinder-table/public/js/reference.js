import { h, clear, cap, signed, richText, select, debounce } from "./ui.js";
import { load } from "./data.js";
import { AON, DC_BY_LEVEL, DC_ADJUST, SIMPLE_DC, ENCOUNTER_BUDGET } from "./shared/rules.js";
import { actionText } from "./builder.js";

const aon = (name) => h("a", { class: "aon", href: AON.search(name), target: "_blank", rel: "noopener" }, "AoN ↗");

const SETS = {
  rules: { label: "Quick rules" },
  conditions: { label: "Conditions", meta: () => "" },
  actions: { label: "Actions", meta: (a) => `${actionText(a.actions)} ${a.traits.join(", ")}` },
  feats: { label: "Feats", meta: (f) => `${cap(f.category)} ${f.level} · ${f.actions ? actionText(f.actions) + " · " : ""}${f.traits.join(", ")}` },
  spells: { label: "Spells", meta: (s) => `${s.cantrip ? "Cantrip" : s.focus ? "Focus " + s.rank : "Rank " + s.rank} · ${s.traditions.join(", ") || "focus"} · ${actionText(s.time)}` },
  gear: { label: "Items", meta: (g) => `Item ${g.level} · ${g.type} · ${g.price} gp` },
  weapons: { label: "Weapons", meta: (w) => `${cap(w.category)} · ${w.damage} ${w.damageType} · ${w.traits.join(", ")}${w.range ? " · " + w.range + " ft" : ""}` },
  armor: { label: "Armor", meta: (a) => `${cap(a.category)} · +${a.ac} AC · Dex cap ${a.dexCap} · Str ${a.strength} · check ${a.checkPenalty}` },
  ancestries: { label: "Ancestries", meta: (a) => `${a.hp} HP · ${a.speed} ft · ${a.source}` },
  classes: { label: "Classes", meta: (c) => `${c.hp} HP/level · ${c.source}` },
  backgrounds: { label: "Backgrounds", meta: (b) => `${b.skills.map(cap).join(", ")} · ${b.feat || ""}` },
  creatures: { label: "Creatures", meta: (c) => `Creature ${c.level} · ${c.traits.join(", ")}`, dmOnly: true },
};

export function referencePanel({ isDM = false, initial = "rules" } = {}) {
  let set = initial;
  const q = h("input", { placeholder: "Search…" });
  const list = h("div", { class: "ref-list" });
  const setSel = select(Object.entries(SETS).filter(([, v]) => isDM || !v.dmOnly).map(([value, v]) => ({ value, label: v.label })), set, (v) => { set = v; draw(); });
  const draw = async () => {
    clear(list);
    if (set === "rules") return list.append(quickRules());
    const items = await load(set);
    const term = q.value.toLowerCase().trim();
    const shown = items.filter((it) => !term || it.name.toLowerCase().includes(term) || (it.traits || []).includes(term) || (term.length > 3 && (it.desc || "").toLowerCase().includes(term)));
    for (const it of shown.slice(0, 120)) {
      const body = h("div", { class: "ref-body" });
      let open = false;
      list.append(h("div", { class: "ref-item" },
        h("div", { class: "row between" },
          h("button", { class: "link strong", onclick: () => {
            open = !open; clear(body);
            if (open) body.append(set === "creatures" ? statBlock(it) : richText(it.desc || it.blurb || ""), it.prereq?.length ? h("p", {}, h("strong", {}, "Prerequisites: "), it.prereq.join("; ")) : null);
          } }, it.name, it.rarity && it.rarity !== "common" ? h("span", { class: `rar ${it.rarity}` }, it.rarity) : null),
          aon(it.name)),
        h("small", { class: "muted" }, SETS[set].meta(it)), body));
    }
    if (!shown.length) list.append(h("p", { class: "muted" }, "No matches in the bundled Remaster data. Try ", h("a", { href: AON.search(q.value), target: "_blank" }, "searching Archives of Nethys"), "."));
    if (shown.length > 120) list.append(h("p", { class: "muted" }, `Showing 120 of ${shown.length}. Refine your search.`));
  };
  q.addEventListener("input", debounce(draw, 200));
  draw();
  return h("div", { class: "reference" }, h("div", { class: "row" }, setSel, q, h("a", { class: "aon", href: AON.home, target: "_blank", rel: "noopener" }, "Archives of Nethys ↗")), list);
}

function quickRules() {
  return h("div", { class: "quick-rules" },
    h("section", {}, h("h4", {}, "Checks & degrees of success"),
      h("p", {}, "d20 + modifier vs DC. Beat the DC by 10+ = critical success; fall short by 10+ = critical failure. A natural 20 improves the result one step, a natural 1 worsens it one step."),
      h("p", {}, "Proficiency bonus: untrained +0; trained/expert/master/legendary = 2/4/6/8 + your level."), aon("Degree of Success")),
    h("section", {}, h("h4", {}, "Three actions"),
      h("p", {}, "Each turn you get 3 actions and 1 reaction. Multiple attack penalty: −5 / −10 (agile: −4 / −8) for the 2nd and 3rd attack in a turn."), aon("Multiple Attack Penalty")),
    h("section", {}, h("h4", {}, "Simple DCs"), h("table", { class: "mini" }, h("tbody", {}, Object.entries(SIMPLE_DC).map(([k, v]) => h("tr", {}, h("td", {}, k), h("td", {}, v)))))),
    h("section", {}, h("h4", {}, "DCs by level"), h("table", { class: "mini dc" }, h("tbody", {},
      Array.from({ length: 7 }, (_, row) => h("tr", {}, Array.from({ length: 4 }, (_, col) => {
        const lvl = col * 7 + row;
        return lvl <= 25 ? [h("th", {}, lvl), h("td", {}, DC_BY_LEVEL[lvl])] : [h("th"), h("td")];
      }))))),
      h("p", { class: "muted" }, Object.entries(DC_ADJUST).filter(([, v]) => v).map(([k, v]) => `${k} ${signed(v)}`).join(" · ")), aon("Level-Based DCs")),
    h("section", {}, h("h4", {}, "Encounter budget (4 PCs)"),
      h("table", { class: "mini" }, h("tbody", {}, ENCOUNTER_BUDGET.map((b) => h("tr", {}, h("td", {}, b.threat), h("td", {}, `${b.xp} XP`), h("td", {}, `±${b.adjust} per PC`))))), aon("Building Encounters")),
    h("section", {}, h("h4", {}, "Dying"),
      h("p", {}, "At 0 HP you're knocked out with dying 1 (dying 2 from a critical hit), plus your wounded value. Recovery check: flat DC 10 + dying value. Dying 4 = dead. When you recover, gain wounded 1 (or +1)."), aon("Dying")),
    h("section", {}, h("h4", {}, "Cover & flanking"),
      h("p", {}, "Lesser cover +1 AC, standard cover +2 AC/Reflex/Stealth, greater cover +4. Flanked creatures are off-guard (−2 AC)."), aon("Cover")),
    h("section", {}, h("h4", {}, "Movement"),
      h("p", {}, "Squares are 5 feet. Every second diagonal costs 10 feet. Difficult terrain costs 5 extra feet per square; greater difficult terrain 10."), aon("Movement")),
  );
}

export function statBlock(c) {
  const line = (label, val) => (val ? h("p", {}, h("strong", {}, label + " "), val) : null);
  return h("div", { class: "statblock" },
    h("div", { class: "row between" }, h("h3", {}, c.name), h("span", {}, `Creature ${c.level}`)),
    h("div", { class: "traits" }, [c.rarity !== "common" ? c.rarity : null, c.size, ...c.traits].filter(Boolean).map((t) => h("span", {}, t))),
    line("Perception", signed(c.perception)),
    line("Skills", Object.entries(c.skills || {}).map(([k, v]) => `${cap(k)} ${signed(v)}`).join(", ")),
    line("Attributes", Object.entries(c.attrs || {}).map(([k, v]) => `${cap(k)} ${signed(v)}`).join(", ")),
    h("hr"),
    line("AC", `${c.ac}; Fort ${signed(c.fort)}, Ref ${signed(c.ref)}, Will ${signed(c.will)}`),
    line("HP", c.hp),
    line("Immunities", c.immunities?.join(", ")), line("Weaknesses", c.weaknesses?.join(", ")), line("Resistances", c.resistances?.join(", ")),
    h("hr"),
    line("Speed", `${c.speed} feet${c.otherSpeeds?.length ? ", " + c.otherSpeeds.join(", ") : ""}`),
    ...(c.strikes || []).map((s) => line(cap(s.type), `${s.name} ${signed(s.bonus)} (${s.traits.join(", ")}), Damage ${s.damage}`)),
    c.spells?.length ? line("Spells", c.spells.join(", ")) : null,
    ...(c.abilities || []).map((a) => h("div", { class: "ability" }, h("strong", {}, a.name, a.actions ? " " + actionText(a.actions) : ""), richText(a.desc))),
    h("p", { class: "muted" }, `Source: ${c.source} `, aon(c.name)));
}
