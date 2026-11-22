// Pathfinder 2e Remaster rules math. Tables are from Player Core / Player Core 2 /
// GM Core; class progressions were extracted from the class feature text in the
// ORC-licensed Foundry pf2e data and should be checked against Archives of Nethys.

export const ATTRS = ["str", "dex", "con", "int", "wis", "cha"];
export const ATTR_NAMES = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
export const RANKS = ["Untrained", "Trained", "Expert", "Master", "Legendary"];
export const RANK_SHORT = ["U", "T", "E", "M", "L"];

export const SKILLS = {
  acrobatics: "dex", arcana: "int", athletics: "str", crafting: "int", deception: "cha",
  diplomacy: "cha", intimidation: "cha", medicine: "wis", nature: "wis", occultism: "int",
  performance: "cha", religion: "wis", society: "int", stealth: "dex", survival: "wis", thievery: "dex",
};

export const AON = {
  search: (q) => `https://2e.aonprd.com/Search.aspx?q=${encodeURIComponent(q)}`,
  home: "https://2e.aonprd.com/",
};

// GM Core: DCs by level, difficulty adjustments, simple DCs
export const DC_BY_LEVEL = [14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 44, 46, 48, 50];
export const DC_ADJUST = { "Incredibly easy": -10, "Very easy": -5, Easy: -2, Normal: 0, Hard: 2, "Very hard": 5, "Incredibly hard": 10 };
export const SIMPLE_DC = { Untrained: 10, Trained: 15, Expert: 20, Master: 30, Legendary: 40 };
export const RARITY_ADJUST = { common: 0, uncommon: 2, rare: 5, unique: 10 };
export const dcForLevel = (lvl) => DC_BY_LEVEL[Math.max(0, Math.min(25, lvl))];

// GM Core: encounter XP budget (4 PCs) and per-extra-PC adjustment
export const ENCOUNTER_BUDGET = [
  { threat: "Trivial", xp: 40, adjust: 10 },
  { threat: "Low", xp: 60, adjust: 15 },
  { threat: "Moderate", xp: 80, adjust: 20 },
  { threat: "Severe", xp: 120, adjust: 30 },
  { threat: "Extreme", xp: 160, adjust: 40 },
];
const CREATURE_XP = { "-4": 10, "-3": 15, "-2": 20, "-1": 30, 0: 40, 1: 60, 2: 80, 3: 120, 4: 160 };
export function creatureXP(creatureLevel, partyLevel) {
  const d = creatureLevel - partyLevel;
  if (d < -4) return 0;
  if (d > 4) return 160 + (d - 4) * 40; // beyond the table: flag as extreme
  return CREATURE_XP[d];
}
export function budgetFor(partySize) {
  return ENCOUNTER_BUDGET.map((b) => ({ ...b, xp: b.xp + (partySize - 4) * b.adjust }));
}
export function threatFor(xp, partySize) {
  const b = budgetFor(partySize);
  let t = "Trivial";
  for (const row of b) if (xp >= row.xp) t = row.threat;
  if (xp > b[4].xp) t = "Beyond Extreme";
  return t;
}

// GM Core: party treasure by level (4 PCs), total gp value, and currency per extra PC
export const TREASURE_BY_LEVEL = {
  1: [175, 10], 2: [300, 18], 3: [500, 30], 4: [850, 50], 5: [1350, 80], 6: [2000, 125], 7: [2900, 180],
  8: [4000, 250], 9: [5700, 350], 10: [8000, 500], 11: [11500, 700], 12: [16500, 1000], 13: [25000, 1500],
  14: [36500, 2250], 15: [54500, 3250], 16: [82500, 5000], 17: [128000, 7500], 18: [208000, 12000],
  19: [355000, 20000], 20: [490000, 35000],
};

// ---------------- class proficiency progressions ----------------
// L1 values come from the class data; these are the increases by level.
// Stat keys: perception fortitude reflex will simple martial advanced unarmed
//            unarmored light medium heavy classDC spell
const W = ["simple", "martial", "unarmed"];
const SU = ["simple", "unarmed"];
const LMU = ["unarmored", "light", "medium"];
const LU = ["unarmored", "light"];
const ALLA = ["unarmored", "light", "medium", "heavy"];
const up = (stats, rank) => (Array.isArray(stats) ? stats : [stats]).map((s) => [s, rank]);
const caster = (extra) => merge({ 7: up("spell", 2), 15: up("spell", 3), 19: up("spell", 4) }, extra);
const merge = (...objs) => {
  const out = {};
  for (const o of objs) for (const [lvl, arr] of Object.entries(o)) out[lvl] = [...(out[lvl] || []), ...arr];
  return out;
};

export const PROGRESSION = {
  Alchemist: { ws: 13, gws: null, inc: {
    7: [...up("will", 2), ...up(SU, 2)], 9: [...up("perception", 2), ...up("classDC", 2)], 11: up("fortitude", 3),
    13: up(LMU, 2), 15: [...up(SU, 3), ...up("reflex", 3)], 17: up("classDC", 3), 19: up(LMU, 3) } },
  Barbarian: { ws: 7, gws: 15, inc: {
    5: up(W, 2), 7: up("fortitude", 3), 9: up("reflex", 2), 11: up("classDC", 2),
    13: [...up("fortitude", 4), ...up(LMU, 2), ...up(W, 3)], 15: up("will", 3), 17: up("perception", 3),
    19: [...up("classDC", 3), ...up(LMU, 3)] } },
  Bard: { ws: 13, gws: null, inc: caster({
    3: up("reflex", 2), 9: [...up("will", 3), ...up("fortitude", 2)], 11: [...up("perception", 3), ...up(W, 2)],
    13: up(LU, 2), 17: up("will", 4) }) },
  Champion: { ws: 7, gws: 15, inc: {
    5: up(W, 2), 7: up(ALLA, 2), 9: [...up("classDC", 2), ...up("spell", 2), ...up("reflex", 2), ...up("fortitude", 3)],
    11: [...up("will", 3), ...up("perception", 2)], 13: [...up(ALLA, 3), ...up(W, 3)],
    17: [...up("classDC", 3), ...up("spell", 3), ...up(ALLA, 4)] } },
  Cleric: { ws: 13, gws: null, inc: { 5: up("perception", 2), 9: up("will", 3), 11: up("reflex", 2), 13: up("unarmored", 2) },
    doctrine: {
      "Cloistered Cleric": { 3: up("fortitude", 2), 7: up("spell", 2), 11: up(SU, 2), 15: up("spell", 3), 19: up("spell", 4) },
      Warpriest: { 1: [...up(["light", "medium"], 1), ...up("fortitude", 2)], 3: up("martial", 1), 7: up(W, 2),
        11: up("spell", 2), 13: up(["light", "medium"], 2), 15: up("fortitude", 3), 19: up("spell", 3) },
    } },
  Druid: { ws: 13, gws: null, inc: caster({
    3: [...up("perception", 2), ...up("fortitude", 2)], 5: up("reflex", 2), 11: [...up("will", 3), ...up(SU, 2)], 13: up(LMU, 2) }) },
  Fighter: { ws: 7, gws: 15, inc: {
    3: up("will", 2), 7: up("perception", 3), 9: up("fortitude", 3), 11: [...up("classDC", 2), ...up(ALLA, 2)],
    13: [...up(W, 3), ...up("advanced", 2)], 15: up("reflex", 3), 17: up(ALLA, 3),
    19: [...up(W, 4), ...up("advanced", 3), ...up("classDC", 3)] } },
  Investigator: { ws: 7, gws: 15, inc: {
    5: up(W, 2), 7: up("perception", 3), 9: [...up("fortitude", 2), ...up("classDC", 2)], 11: up("will", 3),
    13: [...up(W, 3), ...up(LU, 2), ...up("perception", 4)], 15: up("reflex", 3), 17: up("will", 4),
    19: [...up("classDC", 3), ...up(LU, 3)] } },
  Monk: { ws: 7, gws: 15, inc: {
    5: [...up(SU, 2), ...up("perception", 2)], 9: [...up("classDC", 2), ...up("spell", 2)],
    13: [...up("unarmored", 3), ...up(SU, 3)], 17: [...up("unarmored", 4), ...up("classDC", 3), ...up("spell", 3)] } },
  Oracle: { ws: 13, gws: null, inc: caster({
    7: up("will", 3), 9: up("fortitude", 2), 11: [...up(SU, 2), ...up("perception", 2)],
    13: [...up("reflex", 2), ...up(LU, 2)], 17: up("will", 4) }) },
  Ranger: { ws: 7, gws: 15, inc: {
    3: up("will", 2), 5: up(W, 2), 7: [...up("reflex", 3), ...up("perception", 3)], 9: [...up("classDC", 2), ...up("spell", 2)],
    11: [...up(LMU, 2), ...up("fortitude", 3)], 13: up(W, 3), 15: [...up("reflex", 4), ...up("perception", 4)],
    17: [...up("classDC", 3), ...up("spell", 3)], 19: up(LMU, 3) } },
  Rogue: { ws: 7, gws: 15, inc: {
    5: up(W, 2), 7: [...up("perception", 3), ...up("reflex", 3)], 9: up("fortitude", 2), 11: up("classDC", 2),
    13: [...up(LU, 2), ...up("reflex", 4), ...up("perception", 4), ...up(W, 3)], 17: up("will", 3),
    19: [...up(LU, 3), ...up("classDC", 3)] } },
  Sorcerer: { ws: 13, gws: null, inc: caster({
    5: up("fortitude", 2), 9: up("reflex", 2), 11: [...up("perception", 2), ...up(SU, 2)], 13: up("unarmored", 2), 17: up("will", 3) }) },
  Swashbuckler: { ws: 7, gws: 15, inc: {
    3: up("fortitude", 2), 5: up(W, 2), 7: up("reflex", 3), 9: up("classDC", 2), 11: up("perception", 3),
    13: [...up("reflex", 4), ...up(LU, 2), ...up(W, 3)], 17: up("will", 3), 19: [...up("classDC", 3), ...up(LU, 3)] } },
  Witch: { ws: 13, gws: null, inc: caster({
    5: up("fortitude", 2), 9: up("reflex", 2), 11: [...up(SU, 2), ...up("perception", 2)], 13: up("unarmored", 2), 17: up("will", 3) }) },
  Wizard: { ws: 13, gws: null, inc: caster({
    5: up("reflex", 2), 9: up("fortitude", 2), 11: [...up("perception", 2), ...up(SU, 2)], 13: up("unarmored", 2), 17: up("will", 3) }) },
};

export const TRADITION = { Bard: "occult", Cleric: "divine", Druid: "primal", Oracle: "divine", Wizard: "arcane", Animist: "divine", Magus: "arcane", Necromancer: "occult", Psychic: "occult" };
export const SORCERER_TRADITION = {
  "Bloodline: Aberrant": "occult", "Bloodline: Angelic": "divine", "Bloodline: Demonic": "divine",
  "Bloodline: Diabolic": "divine", "Bloodline: Draconic": "arcane", "Bloodline: Elemental": "primal",
  "Bloodline: Fey": "primal", "Bloodline: Hag": "occult", "Bloodline: Imperial": "arcane", "Bloodline: Undead": "divine",
};
export const WITCH_TRADITION = {
  "Faith's Flamekeeper": "divine", "Silence in Snow": "primal", "Spinner of Threads": "occult",
  "Starless Shadow": "occult", "The Inscribed One": "arcane", "The Resentment": "occult", "Wilding Steward": "primal",
};
export const SPONTANEOUS = ["Bard", "Oracle", "Sorcerer", "Psychic", "Summoner"];
// Classes that pick spells by rank in the builder
export const FULL_CASTERS = ["Bard", "Cleric", "Druid", "Oracle", "Sorcerer", "Witch", "Wizard", "Animist", "Magus", "Necromancer", "Psychic", "Summoner"];
// Classes whose per-level slot tables aren't in the bundled data: the builder marks their counts as estimates
export const ESTIMATED_SLOTS = ["Animist", "Magus", "Necromancer", "Psychic", "Summoner"];
const SUBCLASS_TRADITION_CLASSES = ["Sorcerer", "Witch", "Summoner"];

// classData is optional; with it, a subclass's own tradition (from the data) is used,
// and subclasses whose tradition varies take the character's choice.
export function traditionFor(char, classData) {
  if (SUBCLASS_TRADITION_CLASSES.includes(char.class)) {
    const sub = classData?.subclasses?.find((x) => x.name === char.subclass);
    return sub?.tradition || (char.class === "Sorcerer" ? SORCERER_TRADITION : char.class === "Witch" ? WITCH_TRADITION : {})[char.subclass] || char.choices?.tradition || null;
  }
  return TRADITION[char.class] || null;
}
export function needsTraditionChoice(char, classData) {
  if (!SUBCLASS_TRADITION_CLASSES.includes(char.class) || !char.subclass) return false;
  const sub = classData?.subclasses?.find((x) => x.name === char.subclass);
  return !sub?.tradition && !(char.class === "Sorcerer" ? SORCERER_TRADITION : char.class === "Witch" ? WITCH_TRADITION : {})[char.subclass];
}

// Key attribute options (Psychic's data leaves it open: Intelligence or Charisma)
export const keyOptions = (classData) => (classData.keyAttribute.length ? classData.keyAttribute : ["int", "cha"]);

// Progression: verified tables above for Player Core classes, extracted from class text for the rest
export function progressionFor(classData) {
  return PROGRESSION[classData?.name] || (classData?.progression ? { ws: classData.progression.ws, gws: classData.progression.gws, inc: classData.progression.inc, extracted: true } : null);
}

// Default spell slots per day for full casters. Sorcerers get one more per rank.
// Shown as editable defaults in the builder.
export function spellSlots(className, level) {
  if (!FULL_CASTERS.includes(className)) return {};
  if (ESTIMATED_SLOTS.includes(className)) {
    // The text gives one 1st-rank slot at 1st level; later levels are an estimate to adjust from the class table.
    const out = {};
    for (let r = 1; r <= 9; r++) { const unlock = 2 * r - 1; if (level >= unlock) out[r] = level >= unlock + 1 ? 2 : 1; }
    if (["Magus", "Summoner"].includes(className)) { const ranks = Object.keys(out).map(Number); for (const r of ranks) if (r < Math.max(...ranks) - 1) delete out[r]; }
    return out;
  }
  const extra = className === "Sorcerer" ? 1 : 0;
  const slots = {};
  for (let r = 1; r <= 9; r++) {
    const unlock = 2 * r - 1;
    if (level >= unlock + 1) slots[r] = 3 + extra;
    else if (level >= unlock) slots[r] = 2 + extra;
  }
  if (level >= 19) slots[10] = 1;
  return slots;
}

export function proficiencyTable(char, classData) {
  const p = {
    perception: classData.perception,
    fortitude: classData.saves.fortitude, reflex: classData.saves.reflex, will: classData.saves.will,
    simple: classData.attacks.simple, martial: classData.attacks.martial,
    advanced: classData.attacks.advanced, unarmed: classData.attacks.unarmed,
    unarmored: classData.defenses.unarmored, light: classData.defenses.light,
    medium: classData.defenses.medium, heavy: classData.defenses.heavy,
    classDC: classData.classDC ? 1 : 0, spell: classData.spellcasting ? 1 : 0,
  };
  const prog = progressionFor(classData);
  if (!prog) return p;
  const apply = (table) => {
    for (const [lvl, arr] of Object.entries(table || {})) {
      if (char.level >= +lvl) for (const [stat, rank] of arr) p[stat] = Math.max(p[stat], rank);
    }
  };
  apply(prog.inc);
  if (prog.doctrine && prog.doctrine[char.subclass]) apply(prog.doctrine[char.subclass]);
  // Monk: Path to Perfection choices
  if (classData.name === "Monk") {
    const ch = char.choices || {};
    if (char.level >= 7 && ch.path1) p[ch.path1] = Math.max(p[ch.path1], 3);
    if (char.level >= 11 && ch.path2) p[ch.path2] = Math.max(p[ch.path2], 3);
    if (char.level >= 15 && ch.path3) p[ch.path3] = Math.max(p[ch.path3], 4);
  }
  return p;
}

// ---------------- attributes ----------------
// Each boost set gives +1 to distinct attributes; at +4 or higher a boost gives
// a "partial" boost, two of which make +1 (Player Core).
export function computeAttributes(char, ancestry, background, classData) {
  const val = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
  const partial = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
  const b = char.boosts || {};
  const boost = (a) => {
    if (!a || !(a in val)) return;
    if (val[a] >= 4) {
      partial[a] += 1;
      if (partial[a] >= 2) { val[a] += 1; partial[a] = 0; }
    } else val[a] += 1;
  };
  if (ancestry) {
    if (b.alternateAncestry) (b.ancestry || []).slice(0, 2).forEach(boost);
    else {
      ancestry.boosts.forEach((opts, i) => {
        if (!opts.length) return;
        const pick = opts.length === 1 ? opts[0] : (b.ancestry || [])[i];
        boost(pick);
      });
      ancestry.flaws.forEach((opts) => { if (opts.length === 1) val[opts[0]] -= 1; });
    }
  }
  if (background) background.boosts.forEach((opts, i) => boost(opts.length === 1 ? opts[0] : (b.background || [])[i]));
  if (classData) boost(keyOptions(classData).length === 1 ? keyOptions(classData)[0] : char.keyAttribute);
  (b.free || []).forEach(boost);
  for (const lvl of [5, 10, 15, 20]) if (char.level >= lvl) (b["l" + lvl] || []).forEach(boost);
  return { mods: val, partial };
}

export const profBonus = (rank, level) => (rank > 0 ? rank * 2 + level : 0);

// ---------------- full character computation ----------------
export function computeCharacter(char, data) {
  const ancestry = data.ancestries.find((a) => a.name === char.ancestry);
  const background = data.backgrounds.find((b) => b.name === char.background);
  const classData = data.classes.find((c) => c.name === char.class);
  const level = char.level || 1;
  const { mods } = computeAttributes(char, ancestry, background, classData);
  const prof = classData ? proficiencyTable(char, classData) : {};
  const keyAttr = classData ? (keyOptions(classData).length === 1 ? keyOptions(classData)[0] : char.keyAttribute || keyOptions(classData)[0]) : "str";

  // skills
  const skillRank = {};
  for (const s of Object.keys(SKILLS)) skillRank[s] = 0;
  const trainedSources = [];
  if (classData) trainedSources.push(...classData.trainedSkills);
  if (background) trainedSources.push(...background.skills);
  trainedSources.push(...(char.skills?.trained || []));
  if (char.class === "Cleric" && char.deitySkill) trainedSources.push(char.deitySkill);
  for (const s of trainedSources) if (s in skillRank) skillRank[s] = Math.max(skillRank[s], 1);
  // Skilled Human: trained in one chosen skill, expert in it at 5th level
  if (char.heritage === "Skilled Human" && char.skills?.heritage in skillRank) skillRank[char.skills.heritage] = Math.max(skillRank[char.skills.heritage], level >= 5 ? 2 : 1);
  const increases = char.skills?.increases || {};
  for (const lvl of Object.keys(increases).map(Number).sort((a, b) => a - b)) {
    if (lvl > level) continue;
    const s = increases[lvl];
    if (!(s in skillRank)) continue;
    const max = lvl >= 15 ? 4 : lvl >= 7 ? 3 : 2;
    if (skillRank[s] < max) skillRank[s] += 1;
  }
  const lores = [...(background?.lore || []), ...(char.skills?.lore || [])];

  // equipment
  const armor = data.armor.find((a) => a.name === char.equipment?.armor);
  const armorRunes = char.equipment?.armorRunes || { potency: 0, resilient: 0 };
  const armorCat = armor ? armor.category : "unarmored";
  const armorProf = prof[armorCat] || 0;
  const dexCap = armor ? armor.dexCap : 99;
  const ac = 10 + Math.min(mods.dex, dexCap) + (armor ? armor.ac : 0) + profBonus(armorProf, level) + (armorRunes.potency || 0);
  const strMet = armor ? mods.str >= (armor.strength || 0) : true;
  const checkPenalty = armor && !strMet ? armor.checkPenalty : 0;
  const speedPenalty = armor ? Math.min(0, armor.speedPenalty + (strMet ? 5 : 0)) : 0;
  const shield = data.shields.find((s) => s.name === char.equipment?.shield);

  const saves = {};
  for (const [k, a] of [["fortitude", "con"], ["reflex", "dex"], ["will", "wis"]]) {
    saves[k] = profBonus(prof[k], level) + mods[a] + (armorRunes.resilient || 0);
  }
  const skills = {};
  for (const [s, a] of Object.entries(SKILLS)) {
    let v = profBonus(skillRank[s], level) + mods[a];
    // armor check penalty applies to Str- and Dex-based skills when the Strength requirement isn't met
    if (a === "str" || a === "dex") v += checkPenalty;
    skills[s] = v;
  }
  const loreMods = lores.map((l) => ({ name: l, mod: profBonus(1, level) + mods.int }));

  // strikes
  const spec = progressionFor(classData) || {};
  const specBonus = (rank) => {
    if (!spec.ws || level < spec.ws || rank < 2) return 0;
    const base = [0, 0, 2, 3, 4][rank];
    return spec.gws && level >= spec.gws ? base * 2 : base;
  };
  const weaponRank = (w) => {
    let r = prof[w.category] ?? 0;
    if (char.class === "Fighter" && char.choices?.fighterGroup && w.group === char.choices.fighterGroup) {
      if (w.category === "advanced") r = Math.max(r, level >= 13 ? 3 : level >= 5 ? 2 : r);
      else r = Math.max(r, level >= 13 ? 4 : level >= 5 ? 3 : r);
    }
    return r;
  };
  const strikes = [];
  const weaponList = [...(char.equipment?.weapons || [])];
  for (const entry of weaponList) {
    const w = data.weapons.find((x) => x.name === entry.name);
    if (!w) continue;
    const ranged = !!w.range; // bows, slings, javelins, darts
    const finesse = w.traits.includes("finesse");
    const rank = weaponRank(w);
    const potency = entry.potency || 0;
    const striking = entry.striking || 0;
    const attackMod = ranged ? mods.dex : finesse ? Math.max(mods.str, mods.dex) : mods.str;
    const attack = profBonus(rank, level) + attackMod + potency;
    let dmgMod = 0;
    if (!ranged || w.traits.includes("thrown")) dmgMod = mods.str;
    else if (w.traits.includes("propulsive")) dmgMod = mods.str > 0 ? Math.floor(mods.str / 2) : mods.str;
    dmgMod += specBonus(rank);
    const dice = `${striking + 1}${w.damage.replace(/^\d+/, "")}`;
    const agile = w.traits.includes("agile");
    strikes.push({
      name: entry.name + (potency ? ` +${potency}` : "") + (striking ? [" striking", " greater striking", " major striking"][striking - 1] : ""),
      attack, map: agile ? [0, -4, -8] : [0, -5, -10], damage: `${dice}${dmgMod ? (dmgMod > 0 ? "+" : "") + dmgMod : ""}`,
      damageType: w.damageType, traits: w.traits, rank, ranged, range: w.range,
    });
  }
  // unarmed fist
  {
    const rank = prof.unarmed;
    const attack = profBonus(rank, level) + Math.max(mods.str, mods.dex);
    const dmgMod = mods.str + specBonus(rank);
    strikes.push({ name: "Fist", attack, map: [0, -4, -8], damage: `1d4${dmgMod ? (dmgMod > 0 ? "+" : "") + dmgMod : ""}`,
      damageType: "bludgeoning", traits: ["agile", "finesse", "nonlethal", "unarmed"], rank });
  }

  const conMod = mods.con;
  const maxHp = (ancestry?.hp || 0) + ((classData?.hp || 0) + conMod) * level + (char.feats && Object.values(char.feats).flat().includes("Toughness") ? level : 0);
  const spellAttr = char.class === "Champion" ? "cha" : char.class === "Ranger" ? "wis" : char.class === "Monk" ? (char.choices?.qiAttr || "wis") : keyAttr;
  const spellAttack = prof.spell ? profBonus(prof.spell, level) + mods[spellAttr] : null;
  const bulkLimit = 5 + mods.str;

  return {
    level, mods, prof, keyAttr, maxHp, ac, shield,
    shieldAC: shield ? ac + shield.ac : null,
    perception: profBonus(prof.perception, level) + mods.wis,
    saves, skills, skillRank, lores: loreMods, strikes,
    classDC: prof.classDC ? 10 + profBonus(prof.classDC, level) + mods[keyAttr] : null,
    spellAttack, spellDC: spellAttack !== null ? 10 + spellAttack : null, spellAttr,
    tradition: traditionFor(char, classData),
    speed: (ancestry?.speed || 25) + speedPenalty,
    size: ancestry?.size, vision: ancestry?.vision,
    armor, armorCat, checkPenalty, bulkLimit,
    languages: [...(ancestry?.languages || []), ...(char.languages || [])],
    slots: { ...spellSlots(char.class, level), ...(char.spells?.slotOverrides || {}) },
  };
}

// Number of trained skills a character gets to pick at 1st level
export function freeSkillCount(char, data) {
  const classData = data.classes.find((c) => c.name === char.class);
  const ancestry = data.ancestries.find((a) => a.name === char.ancestry);
  const background = data.backgrounds.find((b) => b.name === char.background);
  const { mods } = computeAttributes({ ...char, level: 1 }, ancestry, background, classData);
  const natural = Object.values(char.feats || {}).includes("Natural Skill") ? 2 : 0;
  return (classData?.additionalSkills || 0) + Math.max(0, mods.int) + natural;
}

// Validation: returns a list of human-readable problems
export function validateCharacter(char, data) {
  const issues = [];
  const classData = data.classes.find((c) => c.name === char.class);
  const ancestry = data.ancestries.find((a) => a.name === char.ancestry);
  const background = data.backgrounds.find((b) => b.name === char.background);
  if (!char.name) issues.push("Give your character a name.");
  if (!ancestry) issues.push("Choose an ancestry.");
  if (!char.heritage) issues.push("Choose a heritage.");
  if (!background) issues.push("Choose a background.");
  if (!classData) issues.push("Choose a class.");
  if (classData?.subclasses?.length && !char.subclass) issues.push(`Choose a ${classData.subclassLabel}.`);
  if (classData && keyOptions(classData).length > 1 && !char.keyAttribute) issues.push("Choose a key attribute.");
  if (classData && needsTraditionChoice(char, classData) && !char.choices?.tradition) issues.push("Choose your spellcasting tradition.");
  if (char.heritage === "Skilled Human" && !char.skills?.heritage) issues.push("Choose your Skilled Human skill.");
  const b = char.boosts || {};
  const dupe = (arr) => arr && new Set(arr.filter(Boolean)).size !== arr.filter(Boolean).length;
  if ((b.free || []).filter(Boolean).length < 4) issues.push("Pick all four free attribute boosts.");
  if (dupe(b.free)) issues.push("Free boosts must go to four different attributes.");
  for (const lvl of [5, 10, 15, 20]) {
    if (char.level >= lvl) {
      if ((b["l" + lvl] || []).filter(Boolean).length < 4) issues.push(`Pick four attribute boosts for level ${lvl}.`);
      if (dupe(b["l" + lvl])) issues.push(`Level ${lvl} boosts must go to different attributes.`);
    }
  }
  if (ancestry) {
    const needed = b.alternateAncestry ? 2 : ancestry.boosts.filter((o) => o.length > 1).length;
    const picked = b.alternateAncestry ? (b.ancestry || []).slice(0, 2) : ancestry.boosts.map((o, i) => (o.length > 1 ? (b.ancestry || [])[i] : null)).filter((x) => x !== null);
    if (picked.filter(Boolean).length < needed) issues.push("Pick your ancestry's free boosts.");
    const all = b.alternateAncestry ? picked : ancestry.boosts.map((o, i) => (o.length === 1 ? o[0] : (b.ancestry || [])[i]));
    if (dupe(all)) issues.push("Ancestry boosts must go to different attributes.");
  }
  if (background) {
    const all = background.boosts.map((o, i) => (o.length === 1 ? o[0] : (b.background || [])[i]));
    if (all.filter(Boolean).length < background.boosts.length) issues.push("Pick your background's boosts.");
    if (dupe(all)) issues.push("Background boosts must go to different attributes.");
  }
  if (classData) {
    const want = freeSkillCount(char, data);
    const have = (char.skills?.trained || []).length;
    if (have < want) issues.push(`Pick ${want - have} more trained skill${want - have > 1 ? "s" : ""}.`);
    if (have > want) issues.push(`You picked ${have - want} too many trained skills.`);
    const featSlots = featSlotsFor(char, classData);
    for (const slot of featSlots) {
      if (!char.feats?.[slot.key]) issues.push(`Pick a ${slot.label} feat (level ${slot.level}).`);
    }
  }
  return issues;
}

export function featSlotsFor(char, classData) {
  const slots = [];
  const lvl = char.level || 1;
  const add = (levels, kind, label) => levels.filter((l) => l <= lvl).forEach((l) => slots.push({ key: `${kind}-${l}`, kind, level: l, label }));
  add(classData.ancestryFeatLevels, "ancestry", "ancestry");
  add(classData.classFeatLevels, "class", "class");
  add(classData.skillFeatLevels, "skill", "skill");
  add(classData.generalFeatLevels, "general", "general");
  // feats granted by a heritage or by other feats
  const chosen = Object.values(char.feats || {});
  if (char.heritage === "Versatile Human") slots.push({ key: "heritage-1", kind: "general", level: 1, label: "general (Versatile Human)" });
  if (chosen.includes("Natural Ambition")) slots.push({ key: "bonusclass-1", kind: "class", level: 1, label: "class (Natural Ambition)" });
  if (chosen.includes("General Training")) slots.push({ key: "bonusgeneral-1", kind: "general", level: 1, label: "general (General Training)" });
  return slots.sort((a, b) => a.level - b.level);
}
