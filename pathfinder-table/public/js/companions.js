import { load, coreData } from "./data.js";
import { ATTRS, SKILLS, computeCharacter, featSlotsFor, traditionFor, FULL_CASTERS, spellSlots, freeSkillCount, creatureXP } from "./shared/rules.js";
import { blankCharacter } from "./builder.js";

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

// Attribute priorities after the key attribute
const PRIORITY = {
  Alchemist: ["int", "con", "dex", "wis"], Barbarian: ["str", "con", "dex", "wis"], Bard: ["cha", "dex", "con", "wis"],
  Champion: ["str", "cha", "con", "wis"], Cleric: ["wis", "cha", "con", "dex"], Druid: ["wis", "con", "dex", "int"],
  Fighter: ["str", "con", "dex", "wis"], Investigator: ["int", "dex", "con", "wis"], Monk: ["dex", "str", "wis", "con"],
  Oracle: ["cha", "con", "dex", "wis"], Ranger: ["dex", "wis", "con", "str"], Rogue: ["dex", "cha", "con", "wis"],
  Sorcerer: ["cha", "con", "dex", "wis"], Swashbuckler: ["dex", "cha", "con", "wis"], Witch: ["int", "con", "dex", "wis"],
  Wizard: ["int", "con", "dex", "wis"],
};
const KIT = {
  Alchemist: { armor: "Leather Armor", weapons: ["Crossbow", "Dagger"] },
  Barbarian: { armor: "Hide Armor", weapons: ["Greataxe", "Javelin"] },
  Bard: { armor: "Studded Leather Armor", weapons: ["Rapier", "Shortbow"] },
  Champion: { armor: "Chain Mail", weapons: ["Longsword"], shield: "Steel Shield" },
  Cleric: { armor: "", weapons: ["Mace"] },
  Druid: { armor: "Leather Armor", weapons: ["Staff", "Sling"] },
  Fighter: { armor: "Chain Mail", weapons: ["Longsword", "Shortbow"], shield: "Steel Shield" },
  Investigator: { armor: "Studded Leather Armor", weapons: ["Rapier", "Hand Crossbow"] },
  Monk: { armor: "", weapons: [] },
  Oracle: { armor: "Leather Armor", weapons: ["Spear"] },
  Ranger: { armor: "Leather Armor", weapons: ["Longbow", "Shortsword"] },
  Rogue: { armor: "Leather Armor", weapons: ["Rapier", "Shortbow"] },
  Sorcerer: { armor: "", weapons: ["Staff", "Dagger"] },
  Swashbuckler: { armor: "Leather Armor", weapons: ["Rapier", "Dagger"] },
  Witch: { armor: "", weapons: ["Staff"] },
  Wizard: { armor: "", weapons: ["Staff", "Crossbow"] },
};
const SKILL_PREF = {
  Alchemist: ["medicine", "arcana", "nature", "thievery"], Barbarian: ["intimidation", "survival", "acrobatics", "nature"],
  Bard: ["performance", "diplomacy", "deception", "occultism", "society"], Champion: ["diplomacy", "medicine", "intimidation"],
  Cleric: ["medicine", "diplomacy", "society"], Druid: ["nature", "medicine", "survival"], Fighter: ["athletics", "intimidation", "acrobatics"],
  Investigator: ["arcana", "occultism", "diplomacy", "deception", "thievery", "stealth"], Monk: ["athletics", "acrobatics", "stealth", "medicine"],
  Oracle: ["religion", "occultism", "diplomacy"], Ranger: ["stealth", "athletics", "medicine", "crafting"],
  Rogue: ["acrobatics", "deception", "diplomacy", "athletics", "society", "intimidation", "thievery"],
  Sorcerer: ["arcana", "diplomacy", "intimidation"], Swashbuckler: ["athletics", "deception", "diplomacy", "intimidation"],
  Witch: ["occultism", "arcana", "medicine"], Wizard: ["occultism", "society", "crafting", "religion"],
};
const NAMES = {
  dwarf: ["Brunna", "Torgal", "Hilda", "Durrik", "Mabeth", "Kostan"], elf: ["Aelira", "Thessaly", "Ilvaran", "Syl", "Caelith", "Naerin"],
  gnome: ["Pipsqueak", "Fennelby", "Tibbit", "Quillon", "Zazzle"], goblin: ["Grizzik", "Nettle", "Pokey", "Rizzle", "Mogwit"],
  halfling: ["Rosie", "Merrick", "Pell", "Tansy", "Corwin"], human: ["Amara", "Bastien", "Isolde", "Rafael", "Tamsin", "Oskar"],
  leshy: ["Bramble", "Moss", "Thistle", "Sprig", "Fernwhisper"], orc: ["Ghorza", "Krag", "Shura", "Varn", "Ozha"],
  catfolk: ["Mewra", "Tallis", "Purrin", "Shasha"], hobgoblin: ["Kessa", "Drovic", "Ulvra", "Tarsk"], kholo: ["Yipesh", "Gnasha", "Krrel"],
  kobold: ["Snik", "Rekka", "Tiv", "Kazzi"], lizardfolk: ["Ssareth", "Kethiss", "Ozzu"], ratfolk: ["Nibs", "Quiver", "Saffi", "Twitch"],
  tengu: ["Kaw", "Rook", "Sorai", "Hakuren"], tripkee: ["Ploop", "Ribbit", "Wenna", "Bogwick"],
};

export async function autoBuild({ level = 1, className = null, name = null } = {}) {
  const data = coreData();
  const feats = await load("feats");
  const spells = await load("spells");
  const c = blankCharacter(level);
  const k = className ? data.classes.find((x) => x.name === className) : pick(data.classes);
  c.class = k.name;
  const a = pick(data.ancestries);
  c.ancestry = a.name;
  c.heritage = pick(a.heritages)?.name || "";
  const bgs = data.backgrounds.filter((b) => b.rarity === "common");
  const bg = pick(bgs);
  c.background = bg.name;
  if (k.subclasses?.length) c.subclass = pick(k.subclasses).name;
  const prio = PRIORITY[k.name];
  const key = k.keyAttribute.length > 1 ? prio[0] : k.keyAttribute[0];
  c.keyAttribute = k.keyAttribute.length > 1 ? key : "";
  const order = [key, ...prio.filter((x) => x !== key), ...ATTRS.filter((x) => x !== key && !prio.includes(x))];
  // ancestry boosts
  const taken = [];
  c.boosts.ancestry = a.boosts.map((opts) => {
    if (opts.length === 1) { taken.push(opts[0]); return opts[0]; }
    const choice = order.find((x) => opts.includes(x) && !taken.includes(x));
    taken.push(choice);
    return choice;
  });
  const bgTaken = [];
  c.boosts.background = bg.boosts.map((opts) => {
    if (opts.length === 1) { bgTaken.push(opts[0]); return opts[0]; }
    const choice = order.find((x) => opts.includes(x) && !bgTaken.includes(x));
    bgTaken.push(choice);
    return choice;
  });
  c.boosts.free = order.slice(0, 4);
  for (const l of [5, 10, 15, 20]) if (level >= l) c.boosts["l" + l] = order.slice(0, 4);
  if (k.name === "Cleric" || k.name === "Champion") {
    const deities = await load("deities");
    const d = pick(deities.filter((x) => ["Pathfinder Player Core", "Player Core", "Lost Omens Divine Mysteries"].includes(x.source) || true));
    c.deity = d.name;
    c.deitySkill = d.skill?.[0] || "";
  }
  if (k.name === "Fighter") c.choices.fighterGroup = "sword";
  if (k.name === "Monk") Object.assign(c.choices, { path1: "fortitude", path2: "will", path3: "fortitude" });

  // skills
  const fixed = new Set([...k.trainedSkills, ...bg.skills, ...(c.deitySkill ? [c.deitySkill] : [])]);
  const want = freeSkillCount(c, data);
  const prefs = [...SKILL_PREF[k.name], ...shuffle(Object.keys(SKILLS))].filter((s, i, arr) => arr.indexOf(s) === i && !fixed.has(s));
  c.skills.trained = prefs.slice(0, want);
  const incSkills = [...fixed, ...c.skills.trained];
  k.skillIncreaseLevels.filter((l) => l <= level).forEach((l, i) => { c.skills.increases[l] = incSkills[i % Math.min(3, incSkills.length)]; });

  // feats: prefer ones without prerequisites
  const used = new Set();
  const ancTrait = a.name.toLowerCase();
  for (const slot of featSlotsFor(c, k)) {
    const pool = feats.filter((f) => f.level <= slot.level && f.rarity === "common" && !f.prereq.length && !used.has(f.name) && (
      slot.kind === "ancestry" ? f.category === "ancestry" && f.traits.includes(ancTrait)
      : slot.kind === "class" ? f.category === "class" && f.traits.includes(k.name.toLowerCase())
      : slot.kind === "skill" ? f.category === "skill"
      : f.category === "general" || f.category === "skill"));
    // lean toward higher-level options for the slot
    const best = pool.filter((f) => f.level >= slot.level - 2);
    const f = pick(best.length ? best : pool);
    if (f) { c.feats[slot.key] = f.name; used.add(f.name); }
  }
  if (k.name === "Fighter" || k.name === "Champion") {
    const tough = feats.find((f) => f.name === "Toughness");
    if (tough && c.feats["general-3"] && level >= 3) c.feats["general-3"] = "Toughness";
  }

  // spells
  if (FULL_CASTERS.includes(k.name)) {
    const trad = traditionFor(c);
    const list = spells.filter((s) => !s.focus && s.rarity === "common" && s.traditions.includes(trad));
    c.spells.cantrips = shuffle(list.filter((s) => s.cantrip)).slice(0, 5).map((s) => s.name);
    const prefer = ["Heal", "Force Barrage", "Fear", "Bless", "Soothe", "Command", "Breathe Fire", "Fireball", "Slow", "Haste", "Electric Arc"];
    for (const [rank, n] of Object.entries(spellSlots(k.name, level))) {
      const ofRank = list.filter((s) => !s.cantrip && s.rank === +rank);
      const pref = ofRank.filter((s) => prefer.includes(s.name));
      c.spells.known[rank] = [...pref, ...shuffle(ofRank.filter((s) => !prefer.includes(s.name)))].slice(0, n).map((s) => s.name);
    }
  }

  // equipment
  const kit = KIT[k.name];
  c.equipment.armor = kit.armor;
  c.equipment.shield = kit.shield || "";
  c.equipment.weapons = kit.weapons.filter((w) => data.weapons.some((x) => x.name === w)).map((w) => ({ name: w, potency: 0, striking: 0 }));
  // fundamental runes roughly on the GM Core wealth curve
  const pot = level >= 16 ? 3 : level >= 10 ? 2 : level >= 2 ? 1 : 0;
  const strk = level >= 19 ? 3 : level >= 12 ? 2 : level >= 4 ? 1 : 0;
  c.equipment.weapons.forEach((w, i) => { if (i === 0) { w.potency = pot; w.striking = strk; } });
  c.equipment.armorRunes = { potency: level >= 18 ? 3 : level >= 11 ? 2 : level >= 5 ? 1 : 0, resilient: level >= 20 ? 3 : level >= 14 ? 2 : level >= 8 ? 1 : 0 };
  c.equipment.items = [{ name: "Adventurer's Pack", qty: 1 }, { name: "Healing Potion (Minor)", qty: 2 }];
  c.equipment.gold = level === 1 ? 2 : level * 10;
  c.name = name || `${pick(NAMES[ancTrait] || NAMES.human)}`;
  c.color = pick(["#3b6ea5", "#4c8c4a", "#8a5a9e", "#b07a2a", "#2f8f8f", "#a33b2b"]);
  return c;
}

// --------------------------------------------------------------------
// Turn suggestions for AI companions (rules-based; the optional Claude
// assistant can also narrate them).
// --------------------------------------------------------------------
export function suggestTurn(char, state, data) {
  const comp = computeCharacter(char, data);
  const live = char.live || {};
  const hp = live.hp ?? comp.maxHp;
  const allies = state.slots.filter((s) => s.characterId && state.characters[s.characterId]).map((s) => {
    const ch = state.characters[s.characterId];
    const cc = computeCharacter(ch, data);
    return { name: ch.name, hp: ch.live?.hp ?? cc.maxHp, max: cc.maxHp };
  });
  const map = state.maps?.find((m) => m.id === state.activeMapId);
  const me = map?.tokens.find((t) => t.slot === char.slot);
  const enemies = (map?.tokens || []).filter((t) => t.kind === "enemy" && !t.hidden);
  let nearest = null;
  if (me && enemies.length) {
    nearest = enemies.map((e) => ({ e, d: Math.max(Math.abs(e.x - me.x), Math.abs(e.y - me.y)) })).sort((a, b) => a.d - b.d)[0];
  }
  const lines = [];
  const known = [...(char.spells?.cantrips || []), ...Object.values(char.spells?.known || {}).flat()];
  const hurtAlly = allies.filter((a) => a.hp / a.max < 0.5).sort((a, b) => a.hp / a.max - b.hp / b.max)[0];
  if (hurtAlly && known.includes("Heal")) {
    lines.push(`Cast Heal (2 actions) on ${hurtAlly.name} (${hurtAlly.hp}/${hurtAlly.max} HP).`);
  } else if (hp / comp.maxHp < 0.3) {
    lines.push(`At ${hp}/${comp.maxHp} HP: Step back out of reach, then drink a healing potion if one is left (Interact).`);
  }
  const melee = comp.strikes.find((s) => !s.ranged && s.name !== "Fist") || comp.strikes.find((s) => !s.ranged);
  const ranged = comp.strikes.find((s) => s.ranged);
  const attackCantrip = known.find((s) => ["Electric Arc", "Ignition", "Gouging Claw", "Frostbite", "Telekinetic Projectile", "Needle Darts", "Caustic Blast", "Divine Lance"].includes(s));
  if (lines.length < 1) {
    if (nearest) {
      const feet = nearest.d * 5;
      if (FULL_CASTERS.includes(char.class) && attackCantrip) {
        lines.push(`Cast ${attackCantrip} (2 actions) at ${nearest.e.label} (${feet} ft away; spell attack ${comp.spellAttack >= 0 ? "+" : ""}${comp.spellAttack}, DC ${comp.spellDC}).`);
        lines.push("Use the last action to Step away or Raise a Shield if holding one.");
      } else if (nearest.d <= 1 && melee) {
        lines.push(`Strike ${nearest.e.label} with ${melee.name} (${melee.attack >= 0 ? "+" : ""}${melee.attack}, ${melee.damage}), then Strike again at ${melee.map[1]}.`);
        lines.push(comp.shield ? "Raise a Shield with the third action." : `Third action: Strike at ${melee.map[2]} or Step to flank.`);
      } else if (ranged && nearest.d > 1) {
        lines.push(`Strike ${nearest.e.label} with ${ranged.name} (${ranged.attack >= 0 ? "+" : ""}${ranged.attack}) twice, then Take Cover or Step.`);
      } else if (melee) {
        const strides = Math.ceil(Math.max(0, feet - 5) / comp.speed);
        lines.push(`Stride${strides > 1 ? " twice" : ""} toward ${nearest.e.label} (${feet} ft), then Strike with ${melee.name} (${melee.attack >= 0 ? "+" : ""}${melee.attack}, ${melee.damage}).`);
      }
    } else {
      lines.push("No visible enemy tokens. Seek (Perception) or Aid an ally, or Stride to a better position.");
    }
  }
  return { lines, comp };
}

export { creatureXP };
