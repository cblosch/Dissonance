import { h, clear, cap, signed, field, select, modal, richText, toast, confirmDialog } from "./ui.js";
import { load, coreData } from "./data.js";
import {
  ATTRS, ATTR_NAMES, SKILLS, RANKS, AON, computeCharacter, validateCharacter, freeSkillCount,
  featSlotsFor, traditionFor, FULL_CASTERS, SPONTANEOUS, keyOptions, needsTraditionChoice, ESTIMATED_SLOTS, progressionFor,
} from "./shared/rules.js";
import { autoBuild } from "./companions.js";

const shortSource = (s) => String(s || "").replace(/^Pathfinder (Lost Omens )?/, "");

// "Boosts: Int or Wis, free · Trained: Religion, Scribing Lore · Feat: Student of the Canon"
export function bgSummary(b) {
  if (!b) return "";
  const boosts = b.boosts.map((o) => (o.length >= 6 ? "free" : o.map((x) => x.toUpperCase()).join(" or "))).join(", ");
  const trained = [...b.skills.map(cap), ...(b.lore || [])].join(", ");
  return `Boosts: ${boosts} · Trained: ${trained || "—"}${b.feat ? ` · Feat: ${b.feat}` : ""}`;
}

export function blankCharacter(level = 1) {
  return {
    name: "", level, ancestry: "", heritage: "", background: "", class: "", subclass: "", keyAttribute: "",
    deity: "", boosts: { alternateAncestry: false, ancestry: [], background: [], free: [] },
    skills: { trained: [], increases: {}, lore: [] }, feats: {}, choices: {},
    spells: { cantrips: [], known: {}, slotOverrides: {} },
    equipment: { armor: "", armorRunes: { potency: 0, resilient: 0 }, shield: "", weapons: [], items: [], gold: 15 },
    languages: [], notes: "", color: "#3b6ea5",
  };
}

const aonLink = (name) => h("a", { class: "aon", href: AON.search(name), target: "_blank", rel: "noopener", title: "Open on Archives of Nethys" }, "AoN ↗");

// ------------------------------------------------------------------
// Builder: mount(container, character, {onSave, title})
// ------------------------------------------------------------------
export function mountBuilder(container, initial, { onSave, onCancel, title = "Character builder" } = {}) {
  const data = coreData();
  let c = structuredClone(initial || blankCharacter());
  // migrate older saves
  c.boosts ||= {}; c.skills ||= { trained: [], increases: {}, lore: [] }; c.feats ||= {}; c.choices ||= {};
  c.spells ||= { cantrips: [], known: {}, slotOverrides: {} }; c.equipment ||= blankCharacter().equipment;

  const root = h("div", { class: "builder" });
  const form = h("div", { class: "builder-form" });
  const side = h("aside", { class: "builder-summary" });
  root.append(h("div", { class: "builder-head" },
    h("h2", {}, title),
    h("div", { class: "row" },
      h("button", { onclick: () => randomize() }, "🎲 Random build"),
      onCancel ? h("button", { onclick: onCancel }, "Cancel") : null,
      h("button", { class: "primary", onclick: () => save() }, "Save character"))),
    h("div", { class: "builder-cols" }, form, side));
  container.append(root);

  const ancestry = () => data.ancestries.find((a) => a.name === c.ancestry);
  const background = () => data.backgrounds.find((b) => b.name === c.background);
  const klass = () => data.classes.find((x) => x.name === c.class);

  function set(path, value, rerender = true) {
    const keys = path.split(".");
    let o = c;
    for (const k of keys.slice(0, -1)) o = o[k] ||= {};
    o[keys.at(-1)] = value;
    rerender ? render() : summary();
  }

  async function randomize() {
    const lvl = c.level || 1;
    c = await autoBuild({ level: lvl, className: c.class || null, name: c.name || null });
    render();
    toast("Random build created. Adjust anything you like.");
  }

  async function save() {
    const issues = validateCharacter(c, data);
    if (issues.length && !(await confirmDialog(`This character still has ${issues.length} open choice${issues.length > 1 ? "s" : ""}:\n\n• ${issues.slice(0, 8).join("\n• ")}\n\nSave anyway? You can finish it later with Edit build.`, { ok: "Save anyway", cancel: "Keep editing" }))) return;
    onSave && onSave(structuredClone(c));
  }

  // ---------------- sections ----------------
  function basics() {
    const a = ancestry(), k = klass();
    const heritages = a ? [...a.heritages, ...data.versatileHeritages.map((v) => ({ ...v, versatile: true }))] : [];
    const sec = h("section", { class: "bsec" }, h("h3", {}, "1. Basics"));
    const name = h("input", { value: c.name, placeholder: "Character name", oninput: (e) => set("name", e.target.value, false) });
    sec.append(h("div", { class: "grid2" },
      field("Name", name),
      field("Level", select(Array.from({ length: 20 }, (_, i) => i + 1), c.level, (v) => set("level", +v))),
      field("Ancestry", select([{ value: "", label: "— choose —" }, ...data.ancestries.map((x) => ({ value: x.name, label: `${x.name}${x.source.includes("Player Core") ? "" : " · " + shortSource(x.source)}` }))], c.ancestry, (v) => { c.heritage = ""; c.boosts.ancestry = []; set("ancestry", v); })),
      field("Heritage", select([{ value: "", label: a ? "— choose —" : "pick an ancestry first" }, ...heritages.map((x) => ({ value: x.name, label: x.name + (x.versatile ? " (versatile)" : "") }))], c.heritage, (v) => set("heritage", v))),
      field("Background", h("button", { class: `picker-btn ${c.background ? "" : "empty"}`, onclick: () => pickBackground() },
        c.background ? h("span", {}, h("strong", {}, c.background), h("small", { class: "muted" }, bgSummary(background()))) : "Choose a background…")),
      field("Class", select([{ value: "", label: "— choose —" }, ...data.classes.map((x) => ({ value: x.name, label: `${x.name}${x.source.includes("Player Core") ? "" : " · " + shortSource(x.source)}` }))], c.class, (v) => { c.subclass = ""; c.keyAttribute = ""; c.feats = Object.fromEntries(Object.entries(c.feats).filter(([key]) => !key.startsWith("class"))); c.spells = { cantrips: [], known: {}, slotOverrides: {} }; set("class", v); })),
    ));
    if (k?.subclasses?.length) {
      sec.append(field(cap(k.subclassLabel), select([{ value: "", label: "— choose —" }, ...k.subclasses.map((s) => s.name)], c.subclass, (v) => set("subclass", v))));
    }
    if (k && keyOptions(k).length > 1) {
      sec.append(field("Key attribute", select([{ value: "", label: "— choose —" }, ...keyOptions(k).map((x) => ({ value: x, label: ATTR_NAMES[x] }))], c.keyAttribute, (v) => set("keyAttribute", v))));
    }
    if (k && needsTraditionChoice(c, k)) {
      sec.append(field("Spellcasting tradition", select([{ value: "", label: "— choose —" }, ...["arcane", "divine", "occult", "primal"].map((t) => ({ value: t, label: cap(t) }))], c.choices.tradition || "", (v) => set("choices.tradition", v)),
        `Your ${k.subclassLabel} lets you choose; check its text below.`));
    }
    if (c.class === "Cleric" || c.class === "Champion") {
      sec.append(deityPicker());
    }
    if (c.class === "Fighter") {
      const groups = [...new Set(data.weapons.map((w) => w.group).filter(Boolean))].sort();
      sec.append(field("Fighter Weapon Mastery group (level 5+)", select([{ value: "", label: "— choose —" }, ...groups.map((g) => ({ value: g, label: cap(g) }))], c.choices.fighterGroup, (v) => set("choices.fighterGroup", v))));
    }
    if (c.class === "Monk") {
      const saves = [{ value: "", label: "—" }, { value: "fortitude", label: "Fortitude" }, { value: "reflex", label: "Reflex" }, { value: "will", label: "Will" }];
      sec.append(h("div", { class: "grid3" },
        field("Path to Perfection (7)", select(saves, c.choices.path1, (v) => set("choices.path1", v))),
        field("Second Path (11)", select(saves, c.choices.path2, (v) => set("choices.path2", v))),
        field("Third Path (15)", select(saves, c.choices.path3, (v) => set("choices.path3", v)))));
    }
    // descriptions
    const info = h("div", { class: "info-cards" });
    if (a) info.append(infoCard(a.name, `${a.hp} HP · ${cap(a.size === "med" ? "medium" : a.size === "sm" ? "small" : a.size)} · ${a.speed} ft · ${cap(a.vision.replace(/-/g, " "))}`, a.desc));
    const her = heritages.find((x) => x.name === c.heritage);
    if (her) info.append(infoCard(her.name, "Heritage", her.desc));
    const bg = background();
    if (bg) info.append(infoCard(bg.name, `Trained: ${[...bg.skills.map(cap), ...bg.lore].join(", ")} · Feat: ${bg.feat || "—"}`, bg.desc));
    if (k) info.append(infoCard(k.name, `${k.hp} HP/level · Key: ${keyOptions(k).map((x) => ATTR_NAMES[x]).join(" or ")} · ${k.source.replace("Pathfinder ", "")}${progressionFor(k)?.extracted ? " · proficiency increases read from the class text; check your saves and weapons against AoN" : ""}`, k.desc));
    const sub = k?.subclasses?.find((s) => s.name === c.subclass);
    if (sub) info.append(infoCard(sub.name, cap(k.subclassLabel), sub.desc));
    sec.append(info);
    return sec;
  }

  function deityPicker() {
    const wrap = h("div", { class: "grid2" });
    load("deities").then((deities) => {
      const sel = select([{ value: "", label: "— choose deity —" }, ...deities.map((d) => ({ value: d.name, label: `${d.name} (${d.source})` }))], c.deity, (v) => {
        const d = deities.find((x) => x.name === v);
        c.deity = v;
        c.deitySkill = d?.skill?.[0] || "";
        render();
      });
      const d = deities.find((x) => x.name === c.deity);
      wrap.append(field("Deity", sel, d ? `Font: ${d.font.join("/")} · Skill: ${(d.skill || []).map(cap).join(", ")} · Favored weapon: ${(d.weapons || []).join(", ")} · Domains: ${(d.domains || []).join(", ")}` : "Your deity sets your divine skill and favored weapon."));
    });
    return wrap;
  }

  function infoCard(title, sub, desc) {
    const body = richText(desc);
    body.classList.add("collapsed");
    return h("div", { class: "info-card" },
      h("div", { class: "row between" }, h("strong", {}, title), aonLink(title)),
      h("small", { class: "muted" }, sub), body,
      h("button", { class: "link", onclick: (e) => { body.classList.toggle("collapsed"); e.target.textContent = body.classList.contains("collapsed") ? "more" : "less"; } }, "more"));
  }

  function pickBackground() {
    openPicker("Choose a background", data.backgrounds, {
      meta: (b) => `${bgSummary(b)} · ${shortSource(b.source)}`,
      search: (b) => `${bgSummary(b)} ${b.source}`,
      onPick: (b) => { c.boosts.background = []; set("background", b.name); },
    });
  }

  function boostPicker(label, opts, current, onPick, taken = []) {
    // opts: array of attribute keys allowed
    return h("div", { class: "boost-row" }, h("span", { class: "lbl" }, label),
      ...ATTRS.map((at) => {
        const allowed = opts.includes(at);
        const on = current === at;
        return h("button", { class: `chip ${on ? "on" : ""}`, disabled: !allowed || (taken.includes(at) && !on) ? "disabled" : null, onclick: () => onPick(on ? "" : at) }, at.toUpperCase());
      }));
  }

  function attributes() {
    const a = ancestry(), bg = background(), k = klass();
    const sec = h("section", { class: "bsec" }, h("h3", {}, "2. Attribute boosts"),
      h("p", { class: "hint" }, "Each set of boosts must go to different attributes. Boosting an attribute that is already +4 or higher gives a partial boost; two partial boosts add +1."));
    const b = c.boosts;
    if (a) {
      sec.append(h("label", { class: "check" }, h("input", { type: "checkbox", checked: b.alternateAncestry, onchange: (e) => { b.alternateAncestry = e.target.checked; b.ancestry = []; render(); } }), " Alternate ancestry boosts (two free boosts, no flaw)"));
      if (b.alternateAncestry) {
        for (let i = 0; i < 2; i++) sec.append(boostPicker(`${a.name} free boost`, ATTRS, b.ancestry[i], (v) => { b.ancestry[i] = v; render(); }, b.ancestry.filter((_, j) => j !== i)));
      } else {
        const fixed = a.boosts.map((o) => (o.length === 1 ? o[0] : null)).filter(Boolean);
        sec.append(h("p", {}, `${a.name}: +1 ${fixed.map((x) => x.toUpperCase()).join(", ") || "—"}`, a.flaws.some((f) => f.length === 1) ? `, flaw −1 ${a.flaws.filter((f) => f.length === 1).map((f) => f[0].toUpperCase()).join(", ")}` : ""));
        a.boosts.forEach((opts, i) => {
          if (opts.length > 1) {
            const others = a.boosts.map((o, j) => (j === i ? null : o.length === 1 ? o[0] : b.ancestry[j])).filter(Boolean);
            sec.append(boostPicker(`${a.name} free boost`, opts, b.ancestry[i], (v) => { b.ancestry[i] = v; render(); }, others));
          }
        });
      }
    }
    if (bg) {
      bg.boosts.forEach((opts, i) => {
        const others = bg.boosts.map((o, j) => (j === i ? null : o.length === 1 ? o[0] : b.background[j])).filter(Boolean);
        sec.append(boostPicker(`${bg.name} boost ${i + 1}${opts.length < 6 ? "" : " (free)"}`, opts, opts.length === 1 ? opts[0] : b.background[i], (v) => { b.background[i] = v; render(); }, others));
      });
    }
    if (k) sec.append(h("p", {}, `${k.name} key attribute: +1 ${(keyOptions(k).length === 1 ? keyOptions(k)[0] : c.keyAttribute || "?").toUpperCase()}`));
    const setPick = (key, label) => {
      b[key] ||= [];
      sec.append(h("div", { class: "boost-row" }, h("span", { class: "lbl" }, label),
        ...ATTRS.map((at) => {
          const on = b[key].includes(at);
          return h("button", { class: `chip ${on ? "on" : ""}`, disabled: !on && b[key].length >= 4 ? "disabled" : null,
            onclick: () => { b[key] = on ? b[key].filter((x) => x !== at) : [...b[key], at]; render(); } }, at.toUpperCase());
        })));
    };
    setPick("free", "Four free boosts");
    for (const lvl of [5, 10, 15, 20]) if (c.level >= lvl) setPick("l" + lvl, `Level ${lvl} boosts`);
    return sec;
  }

  function skills() {
    const k = klass(), bg = background();
    const sec = h("section", { class: "bsec" }, h("h3", {}, "3. Skills"));
    if (!k) return sec.append(h("p", { class: "hint" }, "Choose a class first.")), sec;
    const fixed = new Set([...(k.trainedSkills || []), ...(bg?.skills || []), ...(c.class === "Cleric" && c.deitySkill ? [c.deitySkill] : [])]);
    const want = freeSkillCount(c, data);
    c.skills.trained = c.skills.trained.filter((s) => !fixed.has(s));
    sec.append(h("p", {}, `Automatically trained: ${[...fixed].map(cap).join(", ") || "none"}${bg?.lore?.length ? ", " + bg.lore.join(", ") : ""}. Pick ${want} more (class ${k.additionalSkills} + Intelligence). Picked ${c.skills.trained.length}.`));
    sec.append(h("div", { class: "chips" }, Object.keys(SKILLS).map((s) => {
      const on = c.skills.trained.includes(s);
      return h("button", { class: `chip ${on || fixed.has(s) ? "on" : ""}`, disabled: fixed.has(s) || (!on && c.skills.trained.length >= want) ? "disabled" : null,
        onclick: () => { c.skills.trained = on ? c.skills.trained.filter((x) => x !== s) : [...c.skills.trained, s]; render(); } }, cap(s));
    })));
    const incLevels = k.skillIncreaseLevels.filter((l) => l <= c.level);
    if (incLevels.length) {
      sec.append(h("h4", {}, "Skill increases"), h("p", { class: "hint" }, "Expert from level 2, master from level 7, legendary from level 15. Each increase raises one skill by one rank."));
      const grid = h("div", { class: "grid3" });
      for (const lvl of incLevels) {
        grid.append(field(`Level ${lvl}`, select([{ value: "", label: "—" }, ...Object.keys(SKILLS).map((s) => ({ value: s, label: cap(s) }))], c.skills.increases[lvl], (v) => { c.skills.increases[lvl] = v; render(); })));
      }
      sec.append(grid);
    }
    if (c.heritage === "Skilled Human") {
      sec.append(field("Skilled Human skill (expert at 5th level)", select([{ value: "", label: "— choose —" }, ...Object.keys(SKILLS).map((s) => ({ value: s, label: cap(s) }))], c.skills.heritage || "", (v) => set("skills.heritage", v))));
    }
    const lore = h("input", { value: (c.skills.lore || []).join(", "), placeholder: "e.g. Tavern Lore", onchange: (e) => set("skills.lore", e.target.value.split(",").map((x) => x.trim()).filter(Boolean)) });
    sec.append(field("Extra Lore skills (comma separated, e.g. from feats)", lore));
    return sec;
  }

  function feats() {
    const k = klass();
    const sec = h("section", { class: "bsec" }, h("h3", {}, "4. Feats"));
    if (!k) return sec.append(h("p", { class: "hint" }, "Choose a class first.")), sec;
    const bg = background();
    if (bg?.feat) sec.append(h("p", {}, "From background: ", h("strong", {}, bg.feat), " ", aonLink(bg.feat)));
    const list = h("div", { class: "feat-slots" });
    for (const slot of featSlotsFor(c, k)) {
      const chosen = c.feats[slot.key];
      list.append(h("div", { class: "feat-slot" },
        h("span", { class: "lvl" }, slot.level), h("span", { class: "kind" }, cap(slot.label)),
        h("button", { class: chosen ? "" : "empty", onclick: () => pickFeat(slot) }, chosen || "Choose…"),
        chosen ? aonLink(chosen) : null,
        chosen ? h("button", { class: "icon", title: "Clear", onclick: () => { delete c.feats[slot.key]; render(); } }, "✕") : null));
    }
    sec.append(list);
    return sec;
  }

  async function pickFeat(slot) {
    const all = await load("feats");
    const a = ancestry();
    const her = c.heritage ? data.versatileHeritages.find((v) => v.name === c.heritage) : null;
    const ancTraits = [a?.trait || a?.name.toLowerCase(), her?.name.toLowerCase().replace(/ /g, "-")].filter(Boolean);
    const chosen = new Set(Object.values(c.feats));
    const eligible = all.filter((f) => {
      if (f.level > slot.level) return false;
      if (slot.kind === "ancestry") return f.category === "ancestry" && f.traits.some((t) => ancTraits.includes(t));
      if (slot.kind === "class") return f.category === "class" && f.traits.includes(c.class.toLowerCase());
      if (slot.kind === "skill") return f.category === "skill";
      if (slot.kind === "general") return f.category === "general" || f.category === "skill";
      return false;
    });
    const comp = computeCharacter(c, data);
    openPicker(`Choose a ${slot.label} feat (level ${slot.level} or lower)`, eligible, {
      meta: (f) => `Level ${f.level}${f.actions ? " · " + actionText(f.actions) : ""} · ${f.traits.join(", ")}`,
      warn: (f) => prereqWarning(f, comp, chosen),
      taken: (f) => chosen.has(f.name) && !f.desc.includes("multiple times"),
      onPick: (f) => { c.feats[slot.key] = f.name; render(); },
    });
  }

  function spells() {
    const k = klass();
    if (!k || !FULL_CASTERS.includes(k.name)) return null;
    const trad = traditionFor(c, klass());
    const comp = computeCharacter(c, data);
    const sec = h("section", { class: "bsec" }, h("h3", {}, `5. Spells (${cap(trad)})`),
      h("p", { class: "hint" }, SPONTANEOUS.includes(k.name)
        ? "Spontaneous caster: pick your repertoire. Default repertoire size equals your slots per rank."
        : "Prepared caster: pick what you prepare each day. You can change these between sessions."),
      ESTIMATED_SLOTS.includes(k.name)
        ? h("p", { class: "warn" }, `The ${k.name} slot table isn't in the bundled rules data, so these counts are an estimate (1st level is exact). Set them from the ${k.name} Spells per Day table on Archives of Nethys.`)
        : h("p", { class: "hint" }, "Slot counts are defaults for the class; adjust them if a feature changes them (check your class table on AoN)."));
    const row = (label, list, max, onAdd, onRemove, slotKey) => h("div", { class: "spell-rank" },
      h("div", { class: "row between" }, h("strong", {}, label),
        slotKey ? h("span", {}, "slots ", h("input", { type: "number", min: 0, max: 9, value: comp.slots[slotKey] ?? 0, style: { width: "3.5em" }, onchange: (e) => { c.spells.slotOverrides[slotKey] = +e.target.value; render(); } })) : h("span", {}, `${list.length}/${max}`)),
      h("div", { class: "chips" }, list.map((s) => h("span", { class: "chip on" }, s, " ", h("button", { class: "icon", onclick: () => onRemove(s) }, "✕"))),
        list.length < max ? h("button", { class: "chip add", onclick: onAdd }, "+ add") : null));
    sec.append(row("Cantrips", c.spells.cantrips, 5, () => pickSpell(0), (s) => { c.spells.cantrips = c.spells.cantrips.filter((x) => x !== s); render(); }));
    for (const [rank, n] of Object.entries(comp.slots)) {
      const known = c.spells.known[rank] || [];
      sec.append(row(`Rank ${rank}`, known, n, () => pickSpell(+rank), (s) => { c.spells.known[rank] = known.filter((x) => x !== s); render(); }, rank));
    }
    return sec;
  }

  async function pickSpell(rank) {
    const all = await load("spells");
    const trad = traditionFor(c, klass());
    const list = all.filter((s) => !s.focus && s.traditions.includes(trad) && (rank === 0 ? s.cantrip : !s.cantrip && s.rank <= rank));
    const have = new Set([...c.spells.cantrips, ...Object.values(c.spells.known).flat()]);
    openPicker(rank === 0 ? "Choose a cantrip" : `Choose a spell for rank ${rank}`, list, {
      meta: (s) => `${s.cantrip ? "Cantrip" : "Rank " + s.rank} · ${actionText(s.time)} · ${[s.range, s.area, s.target].filter(Boolean).join(" · ")}${s.save ? " · " + cap(s.save) : ""}`,
      taken: (s) => have.has(s.name) && rank === 0,
      onPick: (s) => {
        if (rank === 0) c.spells.cantrips.push(s.name);
        else (c.spells.known[rank] ||= []).push(s.name);
        render();
      },
    });
  }

  function equipment() {
    const comp = computeCharacter(c, data);
    const e = c.equipment;
    const sec = h("section", { class: "bsec" }, h("h3", {}, `${FULL_CASTERS.includes(c.class) ? 6 : 5}. Equipment`),
      h("p", { class: "hint" }, "A 1st-level character starts with 15 gp to spend (Player Core). Higher-level characters: see Character Wealth in Player Core / GM Core."));
    const profMark = (cat) => (comp.prof[cat] > 0 ? "" : " (untrained)");
    sec.append(h("div", { class: "grid3" },
      field("Armor", select([{ value: "", label: "None (unarmored)" }, ...data.armor.map((a) => ({ value: a.name, label: `${a.name} — ${cap(a.category)}, +${a.ac} AC, ${a.price} gp${profMark(a.category)}` }))], e.armor, (v) => set("equipment.armor", v))),
      field("Armor potency", select([0, 1, 2, 3].map((n) => ({ value: n, label: n ? `+${n}` : "none" })), e.armorRunes.potency, (v) => set("equipment.armorRunes.potency", +v))),
      field("Resilient", select([0, 1, 2, 3].map((n) => ({ value: n, label: ["none", "resilient", "greater", "major"][n] })), e.armorRunes.resilient, (v) => set("equipment.armorRunes.resilient", +v))),
      field("Shield", select([{ value: "", label: "None" }, ...data.shields.map((s) => ({ value: s.name, label: `${s.name} (+${s.ac} AC raised, Hardness ${s.hardness})` }))], e.shield, (v) => set("equipment.shield", v))),
      field("Gold (gp)", h("input", { type: "number", value: e.gold, onchange: (ev) => set("equipment.gold", +ev.target.value, false) }))));
    const wlist = h("div", { class: "weapons" });
    e.weapons.forEach((w, i) => {
      const wd = data.weapons.find((x) => x.name === w.name);
      wlist.append(h("div", { class: "weapon-row" },
        h("strong", {}, w.name), h("small", { class: "muted" }, wd ? `${cap(wd.category)}${profMark(wd.category)} · ${wd.damage} ${wd.damageType} · ${wd.traits.join(", ")}` : ""),
        select([0, 1, 2, 3].map((n) => ({ value: n, label: n ? `+${n}` : "no potency" })), w.potency || 0, (v) => { w.potency = +v; render(); }),
        select([0, 1, 2, 3].map((n) => ({ value: n, label: ["no striking", "striking", "greater striking", "major striking"][n] })), w.striking || 0, (v) => { w.striking = +v; render(); }),
        h("button", { class: "icon", onclick: () => { e.weapons.splice(i, 1); render(); } }, "✕")));
    });
    sec.append(h("h4", {}, "Weapons"), wlist,
      h("button", { onclick: () => openPicker("Add a weapon", data.weapons, {
        meta: (w) => `${cap(w.category)}${profMark(w.category)} · ${w.damage} ${w.damageType}${w.range ? " · range " + w.range + " ft" : ""} · ${w.price} gp · ${w.traits.join(", ")}`,
        onPick: (w) => { e.weapons.push({ name: w.name, potency: 0, striking: 0 }); render(); },
      }) }, "+ Add weapon"));
    const ilist = h("div", { class: "chips" }, (e.items || []).map((it, i) => h("span", { class: "chip on" }, `${it.qty > 1 ? it.qty + "× " : ""}${it.name}`, " ", h("button", { class: "icon", onclick: () => { e.items.splice(i, 1); render(); } }, "✕"))));
    sec.append(h("h4", {}, "Gear"), ilist,
      h("button", { onclick: async () => {
        const gear = await load("gear");
        openPicker("Add gear", gear.filter((g) => g.level <= c.level + 2), {
          meta: (g) => `Level ${g.level} · ${g.type} · ${g.price} gp · bulk ${g.bulk}`,
          onPick: (g) => { (e.items ||= []).push({ name: g.name, qty: 1 }); render(); },
        });
      } }, "+ Add gear"));
    return sec;
  }

  function extras() {
    const sec = h("section", { class: "bsec" }, h("h3", {}, "Details"));
    sec.append(h("div", { class: "grid2" },
      field("Extra languages (comma separated)", h("input", { value: (c.languages || []).join(", "), onchange: (e) => set("languages", e.target.value.split(",").map((x) => x.trim()).filter(Boolean), false) }),
        ancestry() ? `Choose from: ${ancestry().extraLanguages.join(", ")} (count = Intelligence modifier)` : ""),
      field("Token color", h("input", { type: "color", value: c.color || "#3b6ea5", onchange: (e) => set("color", e.target.value, false) }))));
    sec.append(field("Notes, backstory, appearance", h("textarea", { rows: 4, value: c.notes || "", oninput: (e) => set("notes", e.target.value, false) })));
    return sec;
  }

  function summary() {
    clear(side);
    const comp = computeCharacter(c, data);
    const issues = validateCharacter(c, data);
    // phone: compact bar that expands into the full summary
    side.append(h("button", { class: "sum-bar", onclick: () => side.classList.toggle("open") },
      h("strong", {}, c.name || "Unnamed"),
      h("span", {}, `HP ${comp.maxHp} · AC ${comp.ac}`),
      h("span", { class: issues.length ? "warn" : "ok" }, issues.length ? `${issues.length} to do` : "✓ ready"),
      h("span", { class: "chev" }, "▴")));
    side.append(
      h("h3", { class: "sum-title" }, c.name || "Unnamed"),
      h("p", { class: "muted" }, [c.ancestry, c.class, c.level && `level ${c.level}`].filter(Boolean).join(" · ")),
      h("div", { class: "attr-grid" }, ATTRS.map((a) => h("div", { class: "attr" }, h("span", {}, a.toUpperCase()), h("strong", {}, signed(comp.mods[a]))))),
      h("table", { class: "mini" }, h("tbody", {},
        h("tr", {}, h("td", {}, "HP"), h("td", {}, comp.maxHp)),
        h("tr", {}, h("td", {}, "AC"), h("td", {}, comp.ac, comp.shieldAC ? ` (${comp.shieldAC} shield raised)` : "")),
        h("tr", {}, h("td", {}, "Fort / Ref / Will"), h("td", {}, `${signed(comp.saves.fortitude)} / ${signed(comp.saves.reflex)} / ${signed(comp.saves.will)}`)),
        h("tr", {}, h("td", {}, "Perception"), h("td", {}, signed(comp.perception))),
        h("tr", {}, h("td", {}, "Speed"), h("td", {}, `${comp.speed} ft`)),
        comp.classDC ? h("tr", {}, h("td", {}, "Class DC"), h("td", {}, comp.classDC)) : null,
        comp.spellDC ? h("tr", {}, h("td", {}, "Spell attack / DC"), h("td", {}, `${signed(comp.spellAttack)} / ${comp.spellDC}`)) : null)),
      h("h4", {}, "Skills"),
      h("div", { class: "skill-list" }, Object.keys(SKILLS).map((s) => h("div", { class: comp.skillRank[s] ? "" : "muted" }, h("span", {}, `${cap(s)} `, h("small", {}, RANKS[comp.skillRank[s]][0])), h("span", {}, signed(comp.skills[s]))))),
      h("h4", {}, "Strikes"),
      h("div", {}, comp.strikes.map((s) => h("div", { class: "row between" }, h("span", {}, s.name), h("span", {}, `${signed(s.attack)} · ${s.damage} ${s.damageType[0].toUpperCase()}`)))),
      issues.length ? h("div", { class: "issues" }, h("h4", {}, `Still to do (${issues.length})`), h("ul", {}, issues.map((i) => h("li", {}, i)))) : h("p", { class: "ok" }, "✓ All choices made"),
    );
  }

  function render() {
    const y = form.scrollTop;
    clear(form);
    form.append(basics(), attributes(), skills(), feats());
    const sp = spells();
    if (sp) form.append(sp);
    form.append(equipment(), extras());
    form.scrollTop = y;
    summary();
  }
  render();
  return { get character() { return c; } };
}

// ------------------------------------------------------------------
// Generic searchable picker modal
// ------------------------------------------------------------------
export function openPicker(title, items, { meta, warn, taken, onPick, search }) {
  const q = h("input", { placeholder: "Search name, trait or text…", autofocus: true });
  let rarity = "common";
  const list = h("div", { class: "picker-list" });
  const draw = () => {
    clear(list);
    const term = q.value.toLowerCase().trim();
    const shown = items.filter((it) =>
      (rarity === "all" || (it.rarity || "common") === "common") &&
      (!term || it.name.toLowerCase().includes(term) || (it.traits || []).some((t) => t.includes(term)) || (search && search(it).toLowerCase().includes(term)) || (term.length > 3 && (it.desc || "").toLowerCase().includes(term))));
    if (!shown.length) list.append(h("p", { class: "muted" }, "Nothing matches."));
    for (const it of shown.slice(0, 250)) {
      const w = warn ? warn(it) : null;
      const isTaken = taken ? taken(it) : false;
      const desc = richText(it.desc || "");
      desc.classList.add("collapsed");
      list.append(h("div", { class: `pick ${isTaken ? "taken" : ""}` },
        h("div", { class: "row between" },
          h("button", { class: "link strong", onclick: () => { desc.classList.toggle("collapsed"); } }, it.name, it.rarity && it.rarity !== "common" ? h("span", { class: `rar ${it.rarity}` }, it.rarity) : null),
          h("span", { class: "row" }, aonLink(it.name), h("button", { class: "primary small", disabled: isTaken ? "disabled" : null, onclick: () => { onPick(it); m.close(); } }, isTaken ? "Taken" : "Choose"))),
        h("small", { class: "muted" }, meta ? meta(it) : ""),
        it.prereq?.length ? h("small", { class: w ? "warn" : "muted" }, `Prerequisites: ${it.prereq.join("; ")}${w ? " — " + w : ""}`) : null,
        desc));
    }
    if (shown.length > 250) list.append(h("p", { class: "muted" }, `${shown.length - 250} more — refine your search.`));
  };
  q.addEventListener("input", draw);
  const rar = select([{ value: "common", label: "Common only" }, { value: "all", label: "Include uncommon/rare" }], rarity, (v) => { rarity = v; draw(); });
  const m = modal(title, h("div", {}, h("div", { class: "row" }, q, rar), list), { wide: true });
  draw();
  setTimeout(() => q.focus(), 30);
  return m;
}

export function actionText(a) {
  if (!a) return "";
  if (a === "reaction") return "⟲ reaction";
  if (a === "free") return "◇ free";
  if (/^\d$/.test(a)) return "◆".repeat(+a);
  if (/^1 to 3$/.test(a)) return "◆ to ◆◆◆";
  if (/^1 to 2$/.test(a)) return "◆ to ◆◆";
  if (/^2 to 3$/.test(a)) return "◆◆ to ◆◆◆";
  return a;
}

// Light prerequisite check: skill ranks, feats and attribute minimums.
function prereqWarning(f, comp, chosenFeats) {
  const problems = [];
  for (const p of f.prereq || []) {
    const t = (p || "").toLowerCase();
    const m = t.match(/^(trained|expert|master|legendary) in (\w+)/);
    if (m && m[2] in comp.skillRank) {
      const need = RANKS.map((r) => r.toLowerCase()).indexOf(m[1]);
      if (comp.skillRank[m[2]] < need) problems.push(`needs ${m[1]} ${m[2]}`);
      continue;
    }
    const am = t.match(/^(strength|dexterity|constitution|intelligence|wisdom|charisma) \+(\d)/);
    if (am) {
      const key = am[1].slice(0, 3);
      if ((comp.mods[key === "con" ? "con" : key] ?? 0) < +am[2]) problems.push(`needs ${am[1]} +${am[2]}`);
      continue;
    }
    if (!m && !am && /^[A-Z]/.test(p) && !/ /.test(p.trim().split(" ")[0] || "")) {
      // prerequisite that names a feat
      if (p.split(/,| or /).every((x) => !chosenFeats.has(x.trim()))) problems.push(`check: ${p}`);
    }
  }
  return problems.join("; ");
}
