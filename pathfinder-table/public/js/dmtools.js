import { h, clear, cap, signed, field, select, modal, toast, debounce } from "./ui.js";
import { load } from "./data.js";
import { act } from "./api.js";
import { creatureXP, budgetFor, threatFor, dcForLevel, DC_ADJUST, SIMPLE_DC, TREASURE_BY_LEVEL, RARITY_ADJUST, AON } from "./shared/rules.js";
import { statBlock } from "./reference.js";
import { creatureLoreHandout, itemHandout, editHandout } from "./handouts.js";
import { rollDice } from "./shared/dice.js";

const aon = (name) => h("a", { class: "aon", href: AON.search(name), target: "_blank", rel: "noopener" }, "AoN ↗");
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const partySize = (state) => Math.max(1, state.slots.filter((s) => s.type !== "open").length) || 4;

// ------------------------------------------------------------------
// Encounter builder
// ------------------------------------------------------------------
const THEME_TRAITS = {
  dungeon: ["undead", "construct", "humanoid", "beast", "aberration", "ooze"],
  cave: ["beast", "animal", "fungus", "ooze", "aberration", "humanoid", "dragon"],
  wilderness: ["animal", "beast", "plant", "fey", "humanoid"],
  town: ["humanoid", "human"],
  tavern: ["humanoid", "human"],
};

export function encounterBuilder(state, { getActiveMap } = {}) {
  const enc = []; // {creature, count}
  let lvl = +state.plot.partyLevel || 1;
  let size = partySize(state);
  const q = h("input", { placeholder: "Search creatures or traits (e.g. undead, goblin)" });
  let minRel = -4, maxRel = 3;
  const results = h("div", { class: "ref-list short" });
  const encBox = h("div", { class: "encounter" });

  async function drawResults() {
    const all = await load("creatures");
    const term = q.value.toLowerCase().trim();
    clear(results);
    const shown = all.filter((c) => c.level >= lvl + minRel && c.level <= lvl + maxRel &&
      (!term || c.name.toLowerCase().includes(term) || c.traits.includes(term)));
    for (const c of shown.slice(0, 80)) {
      results.append(h("div", { class: "ref-item row between" },
        h("span", {}, h("button", { class: "link strong", onclick: () => modal(c.name, statBlock(c), { wide: true }) }, c.name), h("small", { class: "muted" }, ` lvl ${c.level} · ${creatureXP(c.level, lvl)} XP · ${c.traits.slice(0, 4).join(", ")}`)),
        h("button", { class: "small", onclick: () => { const e = enc.find((x) => x.creature.name === c.name); e ? e.count++ : enc.push({ creature: c, count: 1 }); drawEnc(); } }, "+ add")));
    }
    if (!shown.length) results.append(h("p", { class: "muted" }, "No creatures match."));
  }

  function drawEnc() {
    clear(encBox);
    const xp = enc.reduce((s, e) => s + creatureXP(e.creature.level, lvl) * e.count, 0);
    const budget = budgetFor(size);
    encBox.append(h("table", { class: "mini" }, h("tbody", {},
      enc.map((e, i) => h("tr", {},
        h("td", {}, h("input", { type: "number", min: 1, value: e.count, style: { width: "3.5em" }, onchange: (ev) => { e.count = Math.max(1, +ev.target.value); drawEnc(); } })),
        h("td", {}, h("button", { class: "link", onclick: () => modal(e.creature.name, statBlock(e.creature), { wide: true }) }, e.creature.name)),
        h("td", {}, `lvl ${e.creature.level}`), h("td", {}, `${creatureXP(e.creature.level, lvl) * e.count} XP`),
        h("td", {}, h("button", { class: "icon", onclick: () => { enc.splice(i, 1); drawEnc(); } }, "✕")))))),
      h("p", {}, h("strong", {}, `${xp} XP — ${threatFor(xp, size)}`), h("small", { class: "muted" }, ` (party of ${size} at level ${lvl}: ${budget.map((b) => `${b.threat} ${b.xp}`).join(", ")})`)),
      enc.length ? h("div", { class: "row wrap" },
        h("button", { class: "primary", onclick: () => toInitiative(false) }, "Add to initiative"),
        h("button", { onclick: () => toInitiative(true) }, "Add hidden"),
        getActiveMap ? h("button", { onclick: placeTokens }, "Place tokens on map") : null,
        h("button", { onclick: () => act("addNote", { text: `Encounter: ${enc.map((e) => `${e.count}× ${e.creature.name} (${e.creature.level})`).join(", ")} — ${xp} XP ${threatFor(xp, size)}` , tags: ["encounter"] }).then(() => toast("Saved to notes")) }, "Save to notes"),
        h("button", { onclick: () => { enc.length = 0; drawEnc(); } }, "Clear")) : h("p", { class: "muted" }, "Add creatures from the list, or let the tool suggest an encounter."));
  }

  async function toInitiative(hidden) {
    for (const e of enc) for (let i = 0; i < e.count; i++) {
      const r = rollDice(`1d20+${e.creature.perception || 0}`);
      await act("initiative", { op: "add", name: e.count > 1 ? `${e.creature.name} ${i + 1}` : e.creature.name, init: r.total, hp: e.creature.hp, ac: e.creature.ac, kind: "enemy", hidden, creature: e.creature.name });
    }
    toast("Added to initiative (rolled with Perception).");
  }

  async function placeTokens() {
    const m = getActiveMap();
    if (!m) return toast("Make a map active first.", "error");
    const open = [];
    for (let i = 0; i < m.cells.length; i++) if (".cb,s=w^f".includes(m.cells[i]) && !m.tokens.some((t) => t.y * m.w + t.x === i)) open.push(i);
    const anchor = pick(open);
    if (anchor === undefined) return;
    const ax = anchor % m.w, ay = Math.floor(anchor / m.w);
    const near = open.map((i) => ({ i, d: Math.hypot((i % m.w) - ax, Math.floor(i / m.w) - ay) })).sort((a, b) => a.d - b.d);
    let k = 0;
    const sizes = { tiny: 1, sm: 1, med: 1, lg: 2, huge: 3, grg: 4 };
    for (const e of enc) for (let i = 0; i < e.count; i++) {
      const spot = near[k++]; if (!spot) break;
      await act("token", { op: "add", x: spot.i % m.w, y: Math.floor(spot.i / m.w), label: e.creature.name.split(" ").map((w) => w[0]).join("").slice(0, 2) + (e.count > 1 ? i + 1 : ""), kind: "enemy", color: "#a8322b", hidden: true, size: sizes[e.creature.size] || 1 });
    }
    toast("Tokens placed (hidden). Reveal them from the map when the players see them.");
  }

  async function suggest(threat) {
    const all = await load("creatures");
    const loc = suggestTheme.value;
    const traits = THEME_TRAITS[loc] || [];
    const pool = all.filter((c) => c.rarity === "common" && c.level >= lvl - 3 && c.level <= lvl + 2 && (!traits.length || c.traits.some((t) => traits.includes(t))));
    const target = budgetFor(size).find((b) => b.threat === threat).xp;
    enc.length = 0;
    let xp = 0;
    // one "boss" near party level, then fill with lower-level creatures
    const boss = pick(pool.filter((c) => c.level >= lvl && c.level <= lvl + 2 && creatureXP(c.level, lvl) <= target));
    if (boss) { enc.push({ creature: boss, count: 1 }); xp += creatureXP(boss.level, lvl); }
    for (let guard = 0; guard < 20 && xp < target; guard++) {
      const room = target - xp;
      const fits = pool.filter((c) => creatureXP(c.level, lvl) <= room && creatureXP(c.level, lvl) > 0);
      if (!fits.length) break;
      const c = enc.length > 1 ? pick(enc).creature : pick(fits);
      const ok = creatureXP(c.level, lvl) <= room ? c : pick(fits);
      const e = enc.find((x) => x.creature.name === ok.name);
      e ? e.count++ : enc.push({ creature: ok, count: 1 });
      xp += creatureXP(ok.level, lvl);
    }
    drawEnc();
  }

  const suggestTheme = select([{ value: "", label: "Any creatures" }, ...Object.keys(THEME_TRAITS).map((k) => ({ value: k, label: `Fits a ${k}` }))], "", () => {});
  q.addEventListener("input", debounce(drawResults, 200));
  drawResults(); drawEnc();
  return h("div", { class: "enc-builder" },
    h("div", { class: "row wrap" },
      field("Party level", h("input", { type: "number", min: 1, max: 20, value: lvl, style: { width: "4em" }, onchange: (e) => { lvl = +e.target.value; drawResults(); drawEnc(); } })),
      field("Party size", h("input", { type: "number", min: 1, max: 8, value: size, style: { width: "4em" }, onchange: (e) => { size = +e.target.value; drawEnc(); } })),
      field("Creature levels", select([["-4..+3", -4, 3], ["-2..+2", -2, 2], ["-4..-1 (minions)", -4, -1], ["+0..+4 (bosses)", 0, 4]].map(([label]) => label), "-4..+3", (v) => { [minRel, maxRel] = { "-4..+3": [-4, 3], "-2..+2": [-2, 2], "-4..-1 (minions)": [-4, -1], "+0..+4 (bosses)": [0, 4] }[v]; drawResults(); })),
      field("Suggest", h("div", { class: "row" }, suggestTheme, ...["Low", "Moderate", "Severe"].map((t) => h("button", { class: "small", onclick: () => suggest(t) }, t))))),
    h("div", { class: "cols2" }, h("div", {}, q, results), h("div", {}, h("h4", {}, "This encounter"), encBox)));
}

// ------------------------------------------------------------------
// NPC generator
// ------------------------------------------------------------------
const SYL = {
  human: [["Al", "Bran", "Cor", "Da", "El", "Fen", "Gar", "Hal", "Is", "Jor", "Ka", "Lis", "Mar", "Ned", "Os", "Per", "Ro", "Sel", "Tam", "Ul", "Ver", "Wil"], ["a", "en", "ric", "wyn", "ia", "o", "ard", "ette", "us", "ira", "an", "eth"]],
  dwarf: [["Bal", "Dur", "Grim", "Hel", "Kor", "Mor", "Thor", "Ulf", "Bru", "Dag"], ["in", "da", "rik", "grim", "hild", "na", "unn", "ak"]],
  elf: [["Ae", "Cael", "Ela", "Fae", "Il", "Lae", "Myr", "Syl", "Thal", "Va"], ["ndra", "rion", "wen", "thas", "lia", "riel", "nor", "sae"]],
  gnome: [["Bim", "Fizz", "Nib", "Pip", "Quil", "Tib", "Wiz", "Zan"], ["ble", "wick", "sy", "kin", "o", "ette", "pop"]],
  goblin: [["Grub", "Nik", "Poog", "Rik", "Skab", "Zig", "Mog"], ["gle", "zit", "nok", "wort", "a", "zz"]],
  halfling: [["Bel", "Cam", "Mer", "Pip", "Ros", "Tob", "Wil"], ["ladonna", "ry", "ie", "in", "o", "bert", "a"]],
  orc: [["Gro", "Kar", "Mog", "Sha", "Ur", "Vol", "Zug"], ["sh", "ka", "gar", "nak", "ra", "th"]],
};
const OCCUPATIONS = ["innkeeper", "blacksmith", "priest", "guard captain", "merchant", "farmer", "scholar", "smuggler", "herbalist", "noble", "sailor", "street urchin", "bard", "hunter", "miner", "tax collector", "fortune teller", "veteran soldier", "apothecary", "ferryman"];
const TRAITS = ["nervous and talks too fast", "warm but nosy", "gruff, softens when flattered", "suspicious of outsiders", "cheerfully dishonest", "deeply religious", "tired and overworked", "pompous", "secretly kind", "obsessed with a hobby", "superstitious", "ambitious and calculating", "grieving a recent loss", "bored and looking for excitement"];
const LOOKS = ["a scar across one cheek", "ink-stained fingers", "an expensive but threadbare coat", "a missing tooth they whistle through", "elaborate braided hair", "a nervous twitch", "a holy symbol worn on a cord", "mud-spattered boots", "a booming laugh", "spectacles pushed up on their forehead", "a pet rat on one shoulder", "smells of pipe smoke"];
const WANTS = ["money to pay off a debt", "news of a missing relative", "to be left alone", "revenge on a rival", "respect from the town council", "to leave town for good", "a rare ingredient", "protection", "to keep a secret buried", "an apprentice"];
const ATTITUDES = ["Hostile", "Unfriendly", "Indifferent", "Friendly", "Helpful"];

export function randomName(ancestry = "human") {
  const s = SYL[ancestry.toLowerCase()] || SYL.human;
  return pick(s[0]) + pick(s[1]) + (Math.random() < 0.4 ? " " + pick(SYL.human[0]) + pick(["wood", "ford", "hall", "smith", "brook", "stone", "well", "ward"]) : "");
}

export function npcGenerator(state, { onAddToPlot, askAI }) {
  const out = h("div", { class: "npc-out" });
  let anc = "human";
  const gen = () => {
    const npc = {
      name: randomName(anc), ancestry: cap(anc), role: pick(OCCUPATIONS),
      description: `${((t) => t[0].toUpperCase() + t.slice(1))(pick(TRAITS))}; ${pick(LOOKS)}. Wants ${pick(WANTS)}.`,
      attitude: pick(ATTITUDES.slice(1, 4)), secret: "",
    };
    clear(out);
    out.append(h("div", { class: "card" },
      h("h3", {}, npc.name), h("p", { class: "muted" }, `${npc.ancestry} ${npc.role} · starting attitude ${npc.attitude}`),
      h("p", {}, npc.description),
      h("p", { class: "muted" }, `Making them Friendly: Make an Impression, Diplomacy vs Will DC ~${dcForLevel(+state.plot.partyLevel || 1)} (standard DC for party level).`),
      h("div", { class: "row" },
        h("button", { class: "primary", onclick: () => onAddToPlot(npc) }, "Add to plot NPCs"),
        askAI ? h("button", { onclick: async (e) => { e.target.disabled = true; try { const r = await askAI("npc", `${npc.name}, ${npc.ancestry} ${npc.role}. ${npc.description}`); out.append(h("div", { class: "ai-out" }, r.text)); } catch (err) { toast(err.message, "error"); } e.target.disabled = false; } }, "✨ Dialogue lines") : null,
        h("button", { onclick: gen }, "Another"))));
  };
  return h("div", {}, h("div", { class: "row" }, select(Object.keys(SYL).map((k) => ({ value: k, label: cap(k) })), anc, (v) => { anc = v; gen(); }), h("button", { onclick: gen }, "Generate NPC")), out);
}

// ------------------------------------------------------------------
// Loot generator (GM Core treasure by level)
// ------------------------------------------------------------------
export function lootGenerator(state, { onHandout }) {
  const out = h("div", {});
  let lvl = +state.plot.partyLevel || 1;
  const size = partySize(state);
  const gen = async (share) => {
    const gear = await load("gear");
    const [total, perExtra] = TREASURE_BY_LEVEL[Math.min(20, Math.max(1, lvl))];
    const budget = Math.round((total + perExtra * (size - 4)) * share);
    const perm = gear.filter((g) => g.rarity === "common" && g.type !== "consumable" && g.type !== "ammo" && g.price > 0 && (g.level === lvl || g.level === lvl + 1));
    const cons = gear.filter((g) => g.rarity === "common" && g.type === "consumable" && g.price > 0 && g.level <= lvl + 1 && g.level >= lvl - 2);
    const items = [];
    let spent = 0;
    for (let guard = 0; guard < 40 && spent < budget * 0.7; guard++) {
      const pool = items.filter((i) => i.type !== "consumable").length < 2 && Math.random() < 0.5 ? perm : cons;
      const it = pick(pool.filter((g) => g.price <= budget - spent));
      if (!it) break;
      items.push(it); spent += it.price;
    }
    const coins = Math.max(0, budget - spent);
    clear(out);
    out.append(h("p", {}, `Budget for this share: ${budget} gp (GM Core: ${total} gp per level for 4 PCs${size !== 4 ? `, ${perExtra > 0 ? "±" + perExtra : ""} per PC beyond 4` : ""}).`),
      h("ul", { class: "plain" }, items.map((it) => h("li", { class: "row between" }, h("span", {}, `${it.name} `, h("small", { class: "muted" }, `item ${it.level} · ${it.price} gp`)), h("span", { class: "row" }, aon(it.name), h("button", { class: "small", onclick: () => onHandout(itemHandout(it)) }, "Item card")))),
        h("li", {}, `${Math.floor(coins)} gp in coins, gems and trade goods`)),
      h("button", { onclick: () => act("addNote", { text: `Loot: ${items.map((i) => i.name).join(", ")}, ${Math.floor(coins)} gp`, tags: ["loot"] }).then(() => toast("Saved to notes")) }, "Save to notes"));
  };
  return h("div", {},
    h("div", { class: "row wrap" },
      field("Level", h("input", { type: "number", min: 1, max: 20, value: lvl, style: { width: "4em" }, onchange: (e) => (lvl = +e.target.value) })),
      h("button", { onclick: () => gen(0.1) }, "Small hoard (10% of level)"),
      h("button", { onclick: () => gen(0.25) }, "Big hoard (25%)"),
      h("button", { onclick: () => gen(1) }, "Whole level")),
    out);
}

// ------------------------------------------------------------------
// DC helper
// ------------------------------------------------------------------
export function dcHelper(state) {
  let lvl = +state.plot.partyLevel || 1;
  let adj = "Normal";
  let rarity = "common";
  const out = h("div", { class: "big-dc" });
  const draw = () => { out.textContent = `DC ${dcForLevel(lvl) + DC_ADJUST[adj] + RARITY_ADJUST[rarity]}`; };
  draw();
  return h("div", {},
    h("div", { class: "row wrap" },
      field("Level of the task", h("input", { type: "number", min: 0, max: 25, value: lvl, style: { width: "4em" }, oninput: (e) => { lvl = +e.target.value; draw(); } })),
      field("Difficulty", select(Object.keys(DC_ADJUST), adj, (v) => { adj = v; draw(); })),
      field("Rarity (Recall Knowledge)", select(Object.keys(RARITY_ADJUST), rarity, (v) => { rarity = v; draw(); }))),
    out,
    h("p", { class: "muted" }, `Simple DCs: ${Object.entries(SIMPLE_DC).map(([k, v]) => `${k} ${v}`).join(" · ")}`),
    h("div", { class: "row" }, "Ask for a secret check: ",
      ...["Perception", "Stealth", "Recall Knowledge"].map((s) => h("button", { class: "small", onclick: () => act("chat", { text: `🎲 Everyone, roll ${s}! (DC ${dcForLevel(lvl) + DC_ADJUST[adj] + RARITY_ADJUST[rarity]} — the GM will tell you what happens)` }) }, s))));
}

// ------------------------------------------------------------------
// Scene brief: pulls everything relevant to one location together
// ------------------------------------------------------------------
export function sceneBrief(state, loc, { onMap, onHandout, askAI }) {
  const p = state.plot;
  const lvl = +p.partyLevel || 1;
  const text = `${loc.name} ${loc.description || ""}`.toLowerCase();
  const npcs = (p.npcs || []).filter((n) => text.includes(n.name.toLowerCase().split(" ")[0]) || (n.location || "") === loc.name || `${n.description}`.toLowerCase().includes(loc.name.toLowerCase()));
  const secrets = (p.secrets || []).filter((s) => s.location === loc.name || s.text.toLowerCase().includes(loc.name.toLowerCase()));
  const notes = state.notes.filter((n) => n.text.toLowerCase().includes(loc.name.toLowerCase()));
  const aiBox = h("div", {});
  return h("div", { class: "scene-brief" },
    h("p", { class: "muted" }, `${cap(loc.type || "location")} · party level ${lvl}`),
    loc.description ? h("p", {}, loc.description) : null,
    h("h4", {}, "Who's here"),
    npcs.length ? h("ul", {}, npcs.map((n) => h("li", {}, h("strong", {}, n.name), ` (${n.role || "?"}): ${n.description || ""}`, n.secret ? h("em", { class: "secret" }, ` Secret: ${n.secret}`) : null))) : h("p", { class: "muted" }, "No NPCs are tied to this location yet. Set an NPC's location in the plot editor."),
    h("h4", {}, "Clues & secrets"),
    secrets.length ? h("ul", {}, secrets.map((s) => h("li", {}, s.text, s.revealed ? h("span", { class: "tag" }, "revealed") : null))) : h("p", { class: "muted" }, "None linked."),
    notes.length ? [h("h4", {}, "Your notes"), h("ul", {}, notes.slice(-6).map((n) => h("li", {}, n.text)))] : null,
    h("h4", {}, "Checks at this level"),
    h("p", {}, `Easy DC ${dcForLevel(lvl) - 2} · Standard DC ${dcForLevel(lvl)} · Hard DC ${dcForLevel(lvl) + 2} · Very hard DC ${dcForLevel(lvl) + 5}`),
    h("div", { class: "row wrap" },
      h("button", { class: "primary", onclick: () => onMap(loc) }, "Generate map for this location"),
      h("button", { onclick: () => onHandout({ kind: "notice", title: loc.name, body: loc.description || "", meta: { heading: loc.name } }) }, "Handout about it"),
      askAI ? h("button", { onclick: async (e) => { e.target.disabled = true; try { const r = await askAI("readaloud", `Describe the party arriving at ${loc.name}: ${loc.description}`); clear(aiBox).append(h("div", { class: "ai-out" }, r.text)); } catch (err) { toast(err.message, "error"); } e.target.disabled = false; } }, "✨ Read-aloud text") : null,
      askAI ? h("button", { onclick: async (e) => { e.target.disabled = true; try { const r = await askAI("scene", `Location: ${loc.name}. ${loc.description}`); clear(aiBox).append(h("div", { class: "ai-out" }, r.text)); } catch (err) { toast(err.message, "error"); } e.target.disabled = false; } }, "✨ Scene plan") : null),
    aiBox);
}

export { editHandout, creatureLoreHandout };
