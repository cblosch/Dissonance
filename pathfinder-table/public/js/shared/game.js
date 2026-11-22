// Game state and rules for one table. Runs on the Node server, or in the GM's
// browser when the app is hosted without a server (see cloud.js).
import { rollDice, degreeOfSuccess, DEGREES } from "./dice.js";
import { visibleFrom } from "./vision.js";

export const MAX_PLAYERS = 6;
const bytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const id = () => Array.from(bytes(6), (b) => b.toString(16).padStart(2, "0")).join("");
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const secret = () => Array.from(bytes(24), (b) => B64[b & 63]).join("");
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 symbols, so b % 32 is unbiased
export const newCode = () => Array.from(bytes(6), (b) => CODE_CHARS[b % 32]).join("");

// opts.gmless: no game master. Every seated player shares the GM's table tools,
// the map reveals itself by line of sight, and enemies can act on their own.
export function createGame(code, name, opts = {}) {
  return {
    code, name: name || "New Campaign", createdAt: Date.now(), dmKey: secret(),
    gmless: !!opts.gmless, autoReveal: !!opts.gmless,
    plot: {
      title: "", synopsis: "", setting: "", partyLevel: 1, tone: "", hooks: "",
      acts: [], npcs: [], locations: [], factions: "", secrets: [], rewards: "",
    },
    notes: [],
    slots: Array.from({ length: MAX_PLAYERS }, (_, i) => ({ index: i, type: "open" })),
    characters: {},
    maps: [], activeMapId: null,
    handouts: [],
    log: [],
    initiative: { active: false, round: 1, turn: 0, entries: [] },
  };
}

// ---------- auth ----------
export function authFor(game, { key, token }) {
  if (key && key === game.dmKey) return { role: "dm" };
  if (token) {
    const slot = game.slots.find((s) => s.type === "player" && s.token === token);
    if (slot) return { role: "player", slot: slot.index };
  }
  return null;
}

// ---------- views ----------
function publicSlot(s) {
  const { token, ...rest } = s;
  return rest;
}

function fogView(map) {
  // Players see only revealed cells; unrevealed cells are sent as "?" so the
  // layout of unexplored rooms never reaches their browser.
  const cells = map.cells.split("").map((c, i) => (map.fog[i] === "1" ? c : "?")).join("");
  const tokens = map.tokens.filter((t) => !t.hidden && map.fog[t.y * map.w + t.x] === "1");
  return { id: map.id, name: map.name, w: map.w, h: map.h, cells, fog: map.fog, tokens, theme: map.theme, labels: (map.labels || []).filter((l) => l.public && map.fog[l.y * map.w + l.x] === "1") };
}

export function viewFor(game, auth) {
  if (auth.role === "dm") {
    const { dmKey, ...rest } = game;
    return { ...rest, slots: game.slots.map(publicSlot), me: { role: "dm" } };
  }
  const slot = auth.slot;
  const activeMap = game.maps.find((m) => m.id === game.activeMapId);
  const shared = !!game.gmless;
  return {
    code: game.code, name: game.name, gmless: shared,
    // Without a GM the whole table runs the story, so players get the plot (the UI hides spoilers).
    plot: shared ? game.plot : { title: game.plot.title, setting: game.plot.setting, partyLevel: game.plot.partyLevel },
    notes: shared ? game.notes : game.notes.filter((n) => n.public),
    maps: shared ? game.maps.map((m) => ({ id: m.id, name: m.name })) : undefined,
    activeMapId: shared ? game.activeMapId : undefined,
    slots: game.slots.map(publicSlot),
    characters: game.characters,
    map: activeMap ? fogView(activeMap) : null,
    handouts: game.handouts.filter((h) => h.to === "all" || (Array.isArray(h.to) && h.to.includes(slot))),
    log: game.log.filter((l) => !l.private || l.slot === slot).slice(-200),
    initiative: {
      ...game.initiative,
      entries: game.initiative.entries.filter((e) => !e.hidden).map((e) =>
        e.kind === "enemy" && !shared ? { ...e, hp: undefined, maxHp: undefined, ac: undefined, stat: undefined, hpState: hpState(e) } : { ...e, hpState: hpState(e) }),
    },
    me: { role: "player", slot, coGM: shared },
  };
}

function hpState(e) {
  if (!e.maxHp) return "";
  const r = e.hp / e.maxHp;
  if (e.hp <= 0) return "down";
  if (r < 0.25) return "near death";
  if (r < 0.5) return "bloodied";
  if (r < 1) return "wounded";
  return "unhurt";
}

// ---------- log ----------
function pushLog(game, entry) {
  game.log.push({ id: id(), ts: Date.now(), ...entry });
  if (game.log.length > 600) game.log.splice(0, game.log.length - 600);
}

function doRoll(game, who, p, auth) {
  const r = rollDice(p.formula);
  if (!r) throw new Error("Couldn't read that dice expression.");
  if (+p.multiply === 2) { r.total *= 2; r.detail = `(${r.detail}) ×2`; }
  let outcome = null;
  if (p.dc && Number.isFinite(+p.dc)) outcome = DEGREES[degreeOfSuccess(r.total, +p.dc, r.natural)];
  pushLog(game, {
    type: "roll", who, label: String(p.label || "").slice(0, 120), roll: r, dc: p.dc ? +p.dc : null, outcome,
    private: !!p.private, slot: auth.role === "player" ? auth.slot : null, dmOnly: auth.role === "dm" && !!p.private,
  });
  return r;
}

// ---------- actions ----------
const str = (v, n = 4000) => String(v ?? "").slice(0, n);

export function applyAction(game, auth, type, p = {}) {
  const isDM = auth.role === "dm";
  const mySlot = auth.role === "player" ? game.slots[auth.slot] : null;
  const who = isDM ? "GM" : (game.characters[mySlot.characterId]?.name || mySlot.playerName);
  // In a GM-less game every seated player can use the GM's table tools.
  const gm = isDM || (!!game.gmless && auth.role === "player");
  const dmOnly = () => { if (!gm) throw new Error("Only the GM can do that."); };

  switch (type) {
    // ----- chat & dice -----
    case "chat": {
      const text = str(p.text, 2000).trim();
      if (!text) return;
      const as = gm && p.as ? str(p.as, 60) : who;
      pushLog(game, { type: "chat", who: as, text, private: false });
      return;
    }
    case "roll": {
      const as = gm && p.as ? str(p.as, 60) : who;
      return doRoll(game, as, p, auth);
    }

    // ----- characters -----
    case "saveCharacter": {
      const slotIdx = isDM ? +p.slot : auth.slot;
      const slot = game.slots[slotIdx];
      if (!slot || slot.type === "open") throw new Error("That seat is empty.");
      const c = p.character || {};
      const cid = slot.characterId || id();
      game.characters[cid] = { ...c, id: cid, slot: slotIdx, updatedAt: Date.now() };
      slot.characterId = cid;
      pushLog(game, { type: "system", text: `${c.name || "A character"} (${c.ancestry || "?"} ${c.class || "?"} ${c.level || 1}) is ready at seat ${slotIdx + 1}.` });
      return;
    }
    case "updateCharacterState": {
      // live state: hp, temp hp, conditions, hero points, focus points, slots used, notes
      const cid = p.characterId;
      const c = game.characters[cid];
      if (!c) throw new Error("No such character.");
      if (!gm && c.slot !== auth.slot) throw new Error("That isn't your character.");
      c.live = { ...(c.live || {}), ...(p.live || {}) };
      return;
    }

    // ----- seats -----
    case "leave": {
      // a player gives up their own seat
      if (auth.role !== "player") return;
      const slot = game.slots[auth.slot];
      pushLog(game, { type: "system", text: `${who} left the table.` });
      if (slot.characterId) delete game.characters[slot.characterId];
      game.slots[auth.slot] = { index: auth.slot, type: "open" };
      return;
    }
    case "kick": {
      dmOnly();
      const slot = game.slots[+p.slot];
      if (!isDM && slot.type === "player" && slot.index !== auth.slot) throw new Error("Without a GM, players can only remove AI companions.");
      if (slot.characterId) delete game.characters[slot.characterId];
      game.slots[+p.slot] = { index: +p.slot, type: "open" };
      return;
    }
    case "fillCompanion": {
      dmOnly();
      const slot = game.slots[+p.slot];
      if (!slot || slot.type !== "open") throw new Error("That seat isn't open.");
      const cid = id();
      game.characters[cid] = { ...p.character, id: cid, slot: slot.index, companion: true };
      game.slots[slot.index] = { index: slot.index, type: "companion", playerName: "AI companion", characterId: cid, personality: str(p.personality, 300) };
      pushLog(game, { type: "system", text: `${p.character?.name || "A companion"} joins the party as an AI companion.` });
      return;
    }

    // ----- plot & notes -----
    case "setPlot": dmOnly(); game.plot = { ...game.plot, ...p.plot }; if (p.name) game.name = str(p.name, 120); return;
    case "addNote": {
      dmOnly();
      if (game.gmless) p.public = true;
      game.notes.push({ id: id(), ts: Date.now(), text: str(p.text), tags: (p.tags || []).slice(0, 8).map((t) => str(t, 30)), public: !!p.public });
      if (p.public) pushLog(game, { type: "system", text: `GM: ${str(p.text, 500)}` });
      return;
    }
    case "updateNote": {
      dmOnly();
      const n = game.notes.find((x) => x.id === p.id);
      if (!n) return;
      if (p.text !== undefined) n.text = str(p.text);
      if (p.public !== undefined) {
        if (p.public && !n.public) pushLog(game, { type: "system", text: `GM shares: ${n.text.slice(0, 500)}` });
        n.public = !!p.public;
      }
      return;
    }
    case "deleteNote": dmOnly(); game.notes = game.notes.filter((n) => n.id !== p.id); return;

    // ----- maps -----
    case "saveMap": {
      dmOnly();
      const m = p.map;
      if (!m || !m.w || !m.h || m.cells.length !== m.w * m.h) throw new Error("Map data is malformed.");
      if (m.w * m.h > 120 * 120) throw new Error("Map is too large.");
      const existing = game.maps.find((x) => x.id === m.id);
      const clean = { id: m.id || id(), name: str(m.name, 80), w: m.w, h: m.h, cells: m.cells, fog: m.fog || "0".repeat(m.w * m.h),
        tokens: m.tokens || [], theme: m.theme || "dungeon", labels: m.labels || [], rooms: m.rooms || [], seed: m.seed, notes: str(m.notes) };
      if (existing) Object.assign(existing, clean);
      else game.maps.push(clean);
      if (!game.activeMapId || p.activate) game.activeMapId = clean.id;
      return clean.id;
    }
    case "setActiveMap": dmOnly(); game.activeMapId = p.id; return;
    case "deleteMap": dmOnly(); game.maps = game.maps.filter((m) => m.id !== p.id); if (game.activeMapId === p.id) game.activeMapId = game.maps[0]?.id || null; return;
    case "fog": {
      dmOnly();
      const m = game.maps.find((x) => x.id === p.mapId);
      if (!m) return;
      const f = m.fog.split("");
      for (const i of p.cells || []) if (i >= 0 && i < f.length) f[i] = p.reveal ? "1" : "0";
      if (p.all !== undefined) f.fill(p.all ? "1" : "0");
      m.fog = f.join("");
      return;
    }
    case "token": {
      const m = game.maps.find((x) => x.id === (p.mapId || game.activeMapId));
      if (!m) throw new Error("No active map.");
      if (p.op === "move") {
        const t = m.tokens.find((x) => x.id === p.id);
        if (!t) return;
        if (!gm) {
          if (t.slot !== auth.slot || m.id !== game.activeMapId) throw new Error("You can only move your own token.");
          const i = p.y * m.w + p.x;
          if (m.fog[i] !== "1" || "#~".includes(m.cells[i]) ) throw new Error("You can't move there.");
        }
        if (!isDM && gm && t.kind !== "pc" && m.fog[(p.y | 0) * m.w + (p.x | 0)] !== "1") throw new Error("You can't see that square.");
        t.x = Math.max(0, Math.min(m.w - 1, p.x | 0));
        t.y = Math.max(0, Math.min(m.h - 1, p.y | 0));
        if (game.autoReveal && (t.kind === "pc" || t.kind === "ally")) revealAround(m);
        return;
      }
      dmOnly();
      if (p.op === "add") m.tokens.push({ id: id(), x: p.x | 0, y: p.y | 0, label: str(p.label, 40), color: str(p.color, 20) || "#c33", kind: p.kind || "enemy", slot: p.slot ?? null, hidden: !!p.hidden, size: p.size || 1 });
      if (p.op === "remove") m.tokens = m.tokens.filter((t) => t.id !== p.id);
      if (p.op === "toggleHidden") { const t = m.tokens.find((x) => x.id === p.id); if (t) t.hidden = !t.hidden; }
      return;
    }

    // ----- handouts -----
    case "handout": {
      dmOnly();
      if (p.op === "delete") { game.handouts = game.handouts.filter((h) => h.id !== p.id); return; }
      const h = { id: p.id || id(), ts: Date.now(), title: str(p.title, 120), kind: str(p.kind, 30), body: str(p.body, 20000), meta: p.meta || {}, to: p.to === "all" ? "all" : (p.to || []).map(Number) };
      const ex = game.handouts.findIndex((x) => x.id === h.id);
      if (ex >= 0) game.handouts[ex] = h; else game.handouts.push(h);
      if (h.to === "all" || h.to.length) pushLog(game, { type: "system", text: `New handout: “${h.title}”` });
      return;
    }

    // ----- initiative -----
    case "initiative": {
      const ini = game.initiative;
      if (p.op === "rollMe") {
        // a player rolls their own initiative using Perception (or a chosen skill)
        const c = game.characters[mySlot?.characterId];
        if (!c) throw new Error("Build a character first.");
        const r = doRoll(game, who, { formula: `1d20+${+p.mod || 0}`, label: `Initiative (${str(p.skill || "Perception", 30)})` }, auth);
        const existing = ini.entries.find((e) => e.charId === c.id);
        if (existing) existing.init = r.total;
        else ini.entries.push({ id: id(), name: c.name, init: r.total, kind: "pc", charId: c.id, slot: auth.slot });
        ini.entries.sort((a, b) => b.init - a.init);
        return;
      }
      dmOnly();
      if (p.op === "add") {
        ini.entries.push({ id: id(), name: str(p.name, 60), init: +p.init || 0, hp: p.hp ?? null, maxHp: p.hp ?? null, ac: p.ac ?? null, kind: p.kind || "enemy", hidden: !!p.hidden, charId: p.charId || null, creature: p.creature || null, conditions: [] });
        ini.entries.sort((a, b) => b.init - a.init);
      } else if (p.op === "update") {
        const e = ini.entries.find((x) => x.id === p.id);
        if (e) Object.assign(e, p.patch || {});
        ini.entries.sort((a, b) => b.init - a.init);
      } else if (p.op === "remove") ini.entries = ini.entries.filter((e) => e.id !== p.id);
      else if (p.op === "start") { ini.active = true; ini.round = 1; ini.turn = 0; pushLog(game, { type: "system", text: "Encounter begins! Roll initiative." }); }
      else if (p.op === "next") {
        if (!ini.entries.length) return;
        ini.turn += 1;
        if (ini.turn >= ini.entries.length) { ini.turn = 0; ini.round += 1; }
        const cur = ini.entries[ini.turn];
        if (cur && !cur.hidden) pushLog(game, { type: "system", text: `Round ${ini.round}: ${cur.name}'s turn.` });
      } else if (p.op === "prev") { ini.turn = Math.max(0, ini.turn - 1); }
      else if (p.op === "end") { game.initiative = { active: false, round: 1, turn: 0, entries: [] }; pushLog(game, { type: "system", text: "The encounter ends." }); }
      return;
    }

    case "oracle": {
      // Yes/no oracle for tables without a GM (solo-RPG style), rolled on d100.
      const odds = { "Almost certain": 90, Likely: 70, "50/50": 50, Unlikely: 30, "Very unlikely": 10 }[p.likelihood] ?? 50;
      const r = rollDice("1d100");
      const yes = r.total <= odds;
      const extreme = r.total <= Math.ceil(odds / 5) ? " and…" : r.total > 100 - Math.ceil((100 - odds) / 5) ? " and…" : "";
      const twist = !extreme && Math.abs(r.total - odds) <= 5 ? ", but…" : "";
      pushLog(game, { type: "roll", who, label: `Oracle (${p.likelihood || "50/50"}): ${str(p.question, 200) || "?"}`, roll: r, outcome: null, answer: `${yes ? "Yes" : "No"}${extreme || twist}` });
      game.log.at(-1).label += ` → ${yes ? "YES" : "NO"}${extreme || twist}`;
      return;
    }
    case "complication": {
      const list = ["An enemy reinforcement arrives", "Something breaks or gives way", "A light source goes out", "An NPC changes sides or makes a demand", "The environment turns hostile (fire, flood, collapse)", "A clue turns out to be misleading", "Someone is separated from the group", "A rival group arrives", "Time runs short: a deadline moves closer", "An unexpected ally appears", "A trap is triggered", "The noise draws attention"];
      const r = rollDice(`1d${list.length}`);
      pushLog(game, { type: "roll", who, label: `Complication: ${list[r.total - 1]}`, roll: r });
      return;
    }

    // ----- table automation (used by GM-less games, available to GMs too) -----
    case "placeParty": {
      dmOnly();
      const m = game.maps.find((x) => x.id === game.activeMapId);
      if (!m) throw new Error("Make a map active first.");
      const open = openCells(m);
      const stairs = m.cells.indexOf("S");
      const anchor = stairs >= 0 ? stairs : open[0];
      const ax = anchor % m.w, ay = Math.floor(anchor / m.w);
      open.sort((a, b) => Math.hypot((a % m.w) - ax, Math.floor(a / m.w) - ay) - Math.hypot((b % m.w) - ax, Math.floor(b / m.w) - ay));
      let k = 0;
      for (const s of game.slots) {
        const c = s.characterId && game.characters[s.characterId];
        if (!c || m.tokens.some((t) => t.slot === s.index)) continue;
        const i = open[k++];
        if (i === undefined) break;
        m.tokens.push({ id: id(), x: i % m.w, y: Math.floor(i / m.w), label: str(c.name, 2), color: c.color || "#3b6ea5", kind: s.type === "companion" ? "ally" : "pc", slot: s.index, hidden: false, size: 1 });
      }
      revealAround(m);
      return;
    }
    case "spawnEncounter": {
      // creatures: [{ name, level, hp, ac, perception, size, strikes:[{name, bonus, damage, traits}] , count }]
      dmOnly();
      const m = game.maps.find((x) => x.id === game.activeMapId);
      const list = (p.creatures || []).slice(0, 12);
      const party = m ? m.tokens.filter((t) => t.kind === "pc" || t.kind === "ally") : [];
      let spots = [];
      if (m) {
        const cx = party.length ? party.reduce((a, t) => a + t.x, 0) / party.length : m.w / 2;
        const cy = party.length ? party.reduce((a, t) => a + t.y, 0) / party.length : m.h / 2;
        const seen = new Set();
        for (const t of party) for (const i of visibleFrom(m, t.x, t.y, 12)) seen.add(i);
        spots = openCells(m).filter((i) => { const d = Math.hypot((i % m.w) - cx, Math.floor(i / m.w) - cy); return d >= 3 && d <= 9 && (!party.length || seen.has(i)); });
        for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
      }
      const names = [];
      for (const cr of list) {
        const n = Math.max(1, Math.min(8, cr.count | 0 || 1));
        for (let k = 0; k < n; k++) {
          const label = (n > 1 ? `${str(cr.name, 40)} ${k + 1}` : str(cr.name, 40));
          const init = rollDice(`1d20+${cr.perception | 0}`).total;
          game.initiative.entries.push({ id: id(), name: label, init, hp: cr.hp | 0, maxHp: cr.hp | 0, ac: cr.ac | 0, kind: "enemy", hidden: false, creature: str(cr.name, 60), conditions: [],
            stat: { level: cr.level | 0, strikes: (cr.strikes || []).slice(0, 4).map((x) => ({ name: str(x.name, 40), bonus: x.bonus | 0, damage: str(x.damage, 40), traits: (x.traits || []).slice(0, 8).map((t) => str(t, 20)) })) } });
          const spot = spots.shift();
          if (m && spot !== undefined) m.tokens.push({ id: id(), x: spot % m.w, y: Math.floor(spot / m.w), label: label.split(" ").map((w) => w[0]).join("").slice(0, 2) + (n > 1 ? k + 1 : ""), color: "#a8322b", kind: "enemy", hidden: false, size: { lg: 2, huge: 3, grg: 4 }[cr.size] || 1 });
          names.push(label);
        }
      }
      game.initiative.entries.sort((a, b) => b.init - a.init);
      if (!game.initiative.active) { game.initiative.active = true; game.initiative.round = 1; game.initiative.turn = 0; }
      pushLog(game, { type: "system", text: `Enemies appear: ${names.join(", ")}! Roll initiative.` });
      return;
    }
    case "enemyTurn": {
      // The engine plays an enemy's turn: up to two Strikes at one target.
      // targets: [{ charId, name, ac, maxHp }] sent by the caller, who can compute PC stats.
      dmOnly();
      const e = game.initiative.entries.find((x) => x.id === p.entryId);
      if (!e || e.kind !== "enemy") throw new Error("Pick an enemy in the initiative order.");
      if (e.maxHp && e.hp <= 0) { pushLog(game, { type: "system", text: `${e.name} is down and does nothing.` }); return; }
      const strike = (e.stat?.strikes || []).find((x) => !(x.traits || []).some((t) => t.startsWith("range"))) || e.stat?.strikes?.[0];
      if (!strike) throw new Error(`${e.name} has no attacks listed. Play its turn by hand.`);
      const targets = (p.targets || []).filter((t) => game.characters[t.charId] && (game.characters[t.charId].live?.hp ?? t.maxHp) > 0);
      if (!targets.length) { pushLog(game, { type: "system", text: `${e.name} has no one left to attack.` }); return; }
      const target = targets[Math.floor(Math.random() * targets.length)];
      const ch = game.characters[target.charId];
      const agile = (strike.traits || []).includes("agile");
      const lines = [];
      for (let n = 0; n < 2; n++) {
        const mod = strike.bonus + (n ? (agile ? -4 : -5) : 0);
        const r = rollDice(`1d20${mod >= 0 ? "+" : ""}${mod}`);
        const deg = degreeOfSuccess(r.total, target.ac | 0, r.natural);
        pushLog(game, { type: "roll", who: e.name, label: `${strike.name} Strike at ${target.name}${n ? " (2nd attack)" : ""}`, roll: r, dc: target.ac | 0, outcome: DEGREES[deg] });
        if (deg >= 2) {
          const expr = strike.damage.split(/\s+plus\s+/i).map((x) => x.replace(/[a-z ,]+$/i, "").trim()).filter(Boolean).join("+");
          const d = rollDice(expr) || { total: 1, detail: "" };
          const dmg = Math.max(1, d.total) * (deg === 3 ? 2 : 1);
          const hp = ch.live?.hp ?? target.maxHp;
          ch.live = { ...(ch.live || {}), hp: Math.max(0, hp - dmg) };
          pushLog(game, { type: "roll", who: e.name, label: `${strike.name} damage to ${target.name}${deg === 3 ? " (critical ×2)" : ""}`, roll: { ...d, total: dmg, detail: deg === 3 ? `(${d.detail}) ×2` : d.detail } });
          lines.push(`${target.name} takes ${dmg}`);
          if (ch.live.hp === 0) { pushLog(game, { type: "system", text: `${target.name} drops to 0 HP and is dying!` }); break; }
        }
      }
      if (!lines.length) pushLog(game, { type: "system", text: `${e.name} misses ${target.name}.` });
      return;
    }

    default:
      throw new Error(`Unknown action: ${type}`);
  }
}

export function joinGame(game, { name, slot, token: given }) {
  let s = Number.isInteger(slot) ? game.slots[slot] : game.slots.find((x) => x.type === "open");
  if (!s || s.type !== "open") s = game.slots.find((x) => x.type === "open");
  if (!s) throw new Error("All six seats are taken. Ask the GM to free one.");
  const token = given || secret();
  game.slots[s.index] = { index: s.index, type: "player", playerName: str(name, 40) || `Player ${s.index + 1}`, token, joinedAt: Date.now() };
  pushLog(game, { type: "system", text: `${game.slots[s.index].playerName} took seat ${s.index + 1}.` });
  return { token, slot: s.index };
}

function openCells(m) {
  const out = [];
  for (let i = 0; i < m.cells.length; i++) if (".cb,s=wf^+S".includes(m.cells[i]) && !m.tokens.some((t) => t.y * m.w + t.x === i)) out.push(i);
  return out;
}

function revealAround(m) {
  const f = m.fog.split("");
  for (const t of m.tokens) {
    if (t.kind !== "pc" && t.kind !== "ally") continue;
    for (const i of visibleFrom(m, t.x, t.y, 10)) f[i] = "1";
  }
  m.fog = f.join("");
}
