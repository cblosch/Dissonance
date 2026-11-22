import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeCharacter, validateCharacter, creatureXP, threatFor, dcForLevel, proficiencyTable, spellSlots, computeAttributes } from "../public/js/shared/rules.js";
import { degreeOfSuccess, rollDice } from "../public/js/shared/dice.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (n) => JSON.parse(fs.readFileSync(path.join(here, "..", "public", "data", n + ".json"), "utf8"));
const data = {
  ancestries: load("ancestries"), backgrounds: load("backgrounds"), classes: load("classes"),
  weapons: load("weapons"), armor: load("armor"), shields: load("shields"), versatileHeritages: load("versatile-heritages"),
};

function fighter(level = 1) {
  return {
    name: "Valeros", level, ancestry: "Human", heritage: "Versatile Human", background: "Guard", class: "Fighter", keyAttribute: "str",
    boosts: { ancestry: ["str", "con"], background: ["str", "con"], free: ["str", "dex", "con", "wis"] },
    skills: { trained: ["acrobatics", "athletics", "intimidation"], increases: {}, lore: [] }, feats: {}, choices: {},
    equipment: { armor: "Chain Mail", armorRunes: { potency: 0, resilient: 0 }, shield: "Steel Shield", weapons: [{ name: "Longsword", potency: 0, striking: 0 }], items: [] },
  };
}

test("level 1 human fighter has the expected core numbers", () => {
  const g = data.backgrounds.find((b) => b.name === "Guard");
  assert.ok(g, "Guard background exists");
  const c = computeCharacter(fighter(), data);
  // Str: background boost (str), ancestry free (str), class key (str), free (str) => +4
  assert.equal(c.mods.str, 4);
  assert.equal(c.mods.con, 3);
  assert.equal(c.mods.dex, 1);
  assert.equal(c.maxHp, 8 + 10 + 3); // human 8 + (fighter 10 + Con 3)
  assert.equal(c.ac, 10 + 1 + 4 + 3); // Dex 1 (cap 1) + chain mail 4 + trained 3
  assert.equal(c.shieldAC, c.ac + 2);
  const sword = c.strikes.find((s) => s.name.startsWith("Longsword"));
  assert.equal(sword.attack, 4 + 5); // expert (2*2+1) + Str 4
  assert.equal(sword.damage, "1d8+4");
  assert.equal(c.perception, 5 + c.mods.wis);
  assert.equal(c.saves.fortitude, 5 + 3);
});

test("fighter progression: Bravery at 3, Battlefield Surveyor at 7, weapon specialization at 7", () => {
  const k = data.classes.find((x) => x.name === "Fighter");
  assert.equal(proficiencyTable({ level: 1 }, k).will, 1);
  assert.equal(proficiencyTable({ level: 3 }, k).will, 2);
  assert.equal(proficiencyTable({ level: 7 }, k).perception, 3);
  const c7 = computeCharacter({ ...fighter(7), boosts: { ...fighter().boosts, l5: ["str", "dex", "con", "wis"] }, choices: { fighterGroup: "sword" } }, data);
  const sword = c7.strikes.find((s) => s.name.startsWith("Longsword"));
  // Str 4 -> level 5 boost is partial (+4 stays 4); master with sword group at 5 => 6+7=13; + Str 4 = 17
  assert.equal(c7.mods.str, 4);
  assert.equal(sword.attack, 13 + 4);
  // weapon specialization: master = +3 damage
  assert.equal(sword.damage, "1d8+7");
});

test("partial boosts: two boosts above +4 add +1", () => {
  const k = data.classes.find((x) => x.name === "Fighter");
  const a = data.ancestries.find((x) => x.name === "Human");
  const b = data.backgrounds.find((x) => x.name === "Guard");
  const ch = { ...fighter(10), boosts: { ...fighter().boosts, l5: ["str", "dex", "con", "wis"], l10: ["str", "dex", "con", "wis"] } };
  assert.equal(computeAttributes(ch, a, b, k).mods.str, 5);
});

test("wizard spell DC and slots", () => {
  const c = computeCharacter({
    name: "Ezren", level: 1, ancestry: "Elf", heritage: "Ancient Elf", background: "Scholar", class: "Wizard",
    boosts: { ancestry: [null, null, "wis"], background: ["int", "dex"], free: ["int", "dex", "con", "wis"] },
    skills: { trained: [], increases: {} }, feats: {}, equipment: { weapons: [] },
  }, data);
  assert.equal(c.mods.int, 4); // elf int, background int, class key int, free int
  assert.equal(c.spellDC, 10 + 3 + 4);
  assert.deepEqual(spellSlots("Wizard", 1), { 1: 2 });
  assert.deepEqual(spellSlots("Wizard", 3), { 1: 3, 2: 2 });
  assert.deepEqual(spellSlots("Sorcerer", 2), { 1: 4 });
});

test("validation flags missing choices", () => {
  const issues = validateCharacter({ level: 1, boosts: {}, skills: {}, feats: {} }, data);
  assert.ok(issues.some((i) => i.includes("name")));
  assert.ok(issues.some((i) => i.includes("ancestry")));
});

test("encounter math (GM Core)", () => {
  assert.equal(creatureXP(1, 1), 40);
  assert.equal(creatureXP(3, 1), 80);
  assert.equal(creatureXP(-3, 1), 10);
  assert.equal(threatFor(80, 4), "Moderate");
  assert.equal(threatFor(100, 5), "Moderate");
  assert.equal(threatFor(160, 4), "Extreme");
  assert.equal(dcForLevel(1), 15);
  assert.equal(dcForLevel(10), 27);
  assert.equal(dcForLevel(20), 40);
});

test("degrees of success with natural 20 / 1", () => {
  assert.equal(degreeOfSuccess(25, 15, 10), 3);
  assert.equal(degreeOfSuccess(15, 15, 10), 2);
  assert.equal(degreeOfSuccess(14, 15, 20), 2); // failure bumped to success
  assert.equal(degreeOfSuccess(16, 15, 1), 1); // success dropped to failure
  assert.equal(degreeOfSuccess(4, 15, 5), 0);
});

test("dice parser", () => {
  const r = rollDice("2d6+3", () => 0.999);
  assert.equal(r.total, 15);
  const k = rollDice("4d6kh3", () => 0);
  assert.equal(k.total, 3);
  assert.equal(rollDice("1d20-2", () => 0).total, -1);
  assert.equal(rollDice("hello"), null);
});
