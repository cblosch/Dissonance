// Game state and rules for one table. Runs on the Node server, or in the GM's
// browser when the app is hosted without a server (see cloud.js).
import { rollDice, degreeOfSuccess, DEGREES } from "./dice.js";

export const MAX_PLAYERS = 6;
const bytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const id = () => Array.from(bytes(6), (b) => b.toString(16).padStart(2, "0")).join("");
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const secret = () => Array.from(bytes(24), (b) => B64[b & 63]).join("");
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 symbols, so b % 32 is unbiased
export const newCode = () => Array.from(bytes(6), (b) => CODE_CHARS[b % 32]).join("");

export function createGame(code, name) {
  return {
    code, name: name || "New Campaign", createdAt: Date.now(), dmKey: secret(),
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
  return {
    code: game.code, name: game.name,
    plot: { title: game.plot.title, setting: game.plot.setting, partyLevel: game.plot.partyLevel },
    notes: game.notes.filter((n) => n.public),
    slots: game.slots.map(publicSlot),
    characters: game.characters,
    map: activeMap ? fogView(activeMap) : null,
    handouts: game.handouts.filter((h) => h.to === "all" || (Array.isArray(h.to) && h.to.includes(slot))),
    log: game.log.filter((l) => !l.private || l.slot === slot).slice(-200),
    initiative: {
      ...game.initiative,
      entries: game.initiative.entries.filter((e) => !e.hidden).map((e) =>
        e.kind === "enemy" ? { ...e, hp: undefined, maxHp: undefined, ac: undefined, hpState: hpState(e) } : e),
    },
    me: { role: "player", slot },
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
  const dmOnly = () => { if (!isDM) throw new Error("Only the GM can do that."); };

  switch (type) {
    // ----- chat & dice -----
    case "chat": {
      const text = str(p.text, 2000).trim();
      if (!text) return;
      const as = isDM && p.as ? str(p.as, 60) : who;
      pushLog(game, { type: "chat", who: as, text, private: false });
      return;
    }
    case "roll": {
      const as = isDM && p.as ? str(p.as, 60) : who;
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
      if (!isDM && c.slot !== auth.slot) throw new Error("That isn't your character.");
      c.live = { ...(c.live || {}), ...(p.live || {}) };
      return;
    }

    // ----- seats -----
    case "kick": {
      dmOnly();
      const slot = game.slots[+p.slot];
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
        if (!isDM) {
          if (t.slot !== auth.slot || m.id !== game.activeMapId) throw new Error("You can only move your own token.");
          const i = p.y * m.w + p.x;
          if (m.fog[i] !== "1" || "#~".includes(m.cells[i]) ) throw new Error("You can't move there.");
        }
        t.x = Math.max(0, Math.min(m.w - 1, p.x | 0));
        t.y = Math.max(0, Math.min(m.h - 1, p.y | 0));
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
