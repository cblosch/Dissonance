// Hosted transport: runs without a server, on the page's shared database.
//
// One browser runs the game engine (the same rules code the server uses):
//  - GM games: the GM's page. The full game (plot, secrets, unrevealed maps)
//    lives in the GM's private area, which nobody else can read, and the GM
//    publishes a filtered view per seat.
//  - GM-less games: whichever player's page holds a short lease. The game is
//    shared by the table, so it lives in shared documents; when that page
//    closes another player's page takes over.
// Players send actions through their own queue documents, which only they can
// write; the engine applies them and acknowledges.
//
// Database layout
//   data/users/<gm>/game-<code>[/maps|/handouts/<id>]   GM game (GM only)
//   open/<code>[/maps|/handouts/<id>]                   GM-less game (shared)
//   data/users/<uid>/mine                               games this person is in
//   data/users/<uid>/library                            their saved characters
//   lobby/<code>                                        code -> GM / type / name
//   lobby/<code>/req/<uid>                              "I want to join" pointer
//   <pub>  = pub/<gm>/t/<code>  or  open/<code>/t/main  seats + receipts
//   <pub>/seat/<n>, <pub>/view/map                      what each seat sees
//   open/<code>/t/lease                                 who runs a GM-less game
//   inbox/<uid>/q/<code>                                a player's pending actions
import { createGame as newGame, newCode, authFor, viewFor, applyAction, joinGame as engineJoin } from "./shared/game.js";
import { SYSTEM, context, userPrompt } from "./shared/aiprompts.js";

export const session = { code: null, key: null, token: null, role: null, uid: null, gm: null, gmless: false };
export const canPrint = false;

let db = null, user = null, uid = null;
const cap = (name) => (window.claude?.use ? window.claude.use(name) : Promise.resolve(null));

export async function init() {
  [db, user] = await Promise.all([cap("db"), cap("user")]);
  if (!db || !user) throw new Error("This page needs its shared storage, which isn't available in this view. Open it from its claude.ai link while signed in.");
  uid = await user.id();
  if (!uid) throw new Error("Sign in to claude.ai to play.");
  session.uid = uid;
  return true;
}

// ---------------- paths ----------------
const doc = (p) => db.doc(p);
const json = (x) => JSON.stringify(x);
function paths(code, { gmless, gm }) {
  return gmless
    ? { base: `open/${code}`, pub: `open/${code}/t/main`, lease: `open/${code}/t/lease` }
    : { base: `data/users/${gm}/game-${code}`, pub: `pub/${gm}/t/${code}` };
}

// One write at a time per document; skip writes that change nothing.
const lastWritten = new Map();
const chains = new Map();
function writeDoc(path, data, { force = false } = {}) {
  const body = json(data);
  if (!force && lastWritten.get(path) === body) return chains.get(path) || Promise.resolve();
  lastWritten.set(path, body);
  const next = (chains.get(path) || Promise.resolve()).then(() => doc(path).set(data)).catch((e) => { lastWritten.delete(path); report(e); });
  chains.set(path, next);
  return next;
}
function deleteDoc(path) {
  lastWritten.delete(path);
  const next = (chains.get(path) || Promise.resolve()).then(() => doc(path).delete()).catch(report);
  chains.set(path, next);
  return next;
}
let reportFn = (e) => console.warn(e);
function report(e) {
  const msg = e?.code === "quota_exceeded" ? "Storage is full: delete old maps or handouts." :
    e?.code === "invalid_argument" && /256/.test(e?.message || "") ? "That's too much data for one save (map fragments are the usual cause)." :
    e?.code === "invalid_argument" ? "That couldn't be saved. You may need edit access to this page: ask its owner to share it with you as an editor." :
    e?.code === "revoked" ? "Access to this page changed. Reload it." : (e?.message || String(e));
  reportFn(new Error(msg));
}
export function onError(fn) { reportFn = fn; }

// ---------------- games this person is in ----------------
async function readDoc(path, fallback) {
  const snap = await doc(path).get();
  return snap.exists ? snap.data() : fallback;
}
async function addMine(code, entry) {
  const m = await readDoc(`data/users/${uid}/mine`, { games: {} });
  m.games = { ...(m.games || {}), [code]: { ...(m.games?.[code] || {}), ...entry, at: Date.now() } };
  await writeDoc(`data/users/${uid}/mine`, m, { force: true });
}
export async function myGames() {
  const m = await readDoc(`data/users/${uid}/mine`, { games: {} });
  return Object.entries(m.games || {}).map(([code, g]) => ({ code, ...g })).sort((a, b) => (b.at || 0) - (a.at || 0));
}
export async function forget(code) {
  const m = await readDoc(`data/users/${uid}/mine`, { games: {} });
  if (m.games?.[code]) { delete m.games[code]; await writeDoc(`data/users/${uid}/mine`, m, { force: true }); }
}

// ---------------- character library (private to each person) ----------------
const LIB = () => `data/users/${uid}/library`;
export async function listLibrary() {
  const l = await readDoc(LIB(), { chars: {} });
  return Object.values(l.chars || {}).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}
export async function saveToLibrary(char) {
  const l = await readDoc(LIB(), { chars: {} });
  const id = char.libId || `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const { live, slot, id: _gameId, updatedAt, companion, ...build } = char;
  l.chars = { ...(l.chars || {}), [id]: { ...build, libId: id, savedAt: Date.now() } };
  await writeDoc(LIB(), l, { force: true });
  return id;
}
export async function deleteFromLibrary(libId) {
  const l = await readDoc(LIB(), { chars: {} });
  delete l.chars?.[libId];
  await writeDoc(LIB(), l, { force: true });
}

// ---------------- lobby ----------------
export async function config() {
  return { ai: !!(await cap("sample")) };
}
async function lookup(code) {
  const snap = await doc(`lobby/${code}`).get();
  if (!snap.exists) throw new Error("No game with that code. Check it with whoever started the game.");
  return snap.data();
}
export async function gameInfo(code) {
  const lob = await lookup(code);
  const pub = await readDoc(paths(code, lob).pub, { slots: [] });
  return { code, name: lob.name, gm: lob.gm, gmless: !!lob.gmless, slots: (pub.slots || []).map((s) => ({ ...s, mine: s.uid === uid })) };
}

export async function createGame(name, { gmless = false } = {}) {
  let code;
  for (let i = 0; i < 6; i++) { code = newCode(); if (!(await doc(`lobby/${code}`).get()).exists) break; }
  const g = newGame(code, name, { gmless });
  delete g.dmKey;
  if (gmless) {
    await doc(`open/${code}`).set(splitMain(g, {}));
    await doc(`lobby/${code}`).set({ gmless: true, name: g.name });
  } else {
    g.gm = uid;
    await doc(`data/users/${uid}/game-${code}`).set(splitMain(g, {}));
    await doc(`lobby/${code}`).set({ gm: uid, name: g.name });
    await addMine(code, { role: "gm", name: g.name, gm: uid });
  }
  return { code, gmless };
}

export async function joinGame(code, name, slot, gameName, character) {
  const lob = await lookup(code);
  if (lob.gm === uid) throw new Error("You're the GM of this game. Open it from Your games.");
  await queuePush(code, { type: "join", payload: { name, slot } });
  if (character) await queuePush(code, { type: "saveCharacter", payload: { character } });
  await doc(`lobby/${code}/req/${uid}`).set({ at: Date.now() });
  await addMine(code, { role: "player", name: gameName || lob.name, gm: lob.gm || null, gmless: !!lob.gmless });
  return { slot };
}

// Put a saved character into a game you have a seat in (it replaces your current one there).
export async function assignCharacter(code, character) {
  const g = (await myGames()).find((x) => x.code === code);
  if (!g || g.role !== "player") throw new Error("You don't have a seat in that game.");
  await queuePush(code, { type: "saveCharacter", payload: { character } });
}

export async function enter(code) {
  const g = (await myGames()).find((x) => x.code === code);
  if (!g) return false;
  const lob = await lookup(code).catch(() => ({}));
  Object.assign(session, { code, role: g.role === "gm" ? "dm" : "player", gm: g.gm || lob.gm || null, gmless: !!(g.gmless || lob.gmless) });
  return true;
}

// ---------------- player side ----------------
const queues = {}; // code -> { body, seq, ack, chain }
// Appends are serialized per game, so two quick taps can't overwrite each other.
function queuePush(code, action) {
  const path = `inbox/${uid}/q/${code}`;
  const q = (queues[code] ||= { body: null, seq: 0, ack: 0, chain: Promise.resolve() });
  const run = async () => {
    if (!q.body) q.body = await readDoc(path, { actions: [] });
    q.seq = Math.max(q.seq + 1, Date.now());
    q.body = { actions: [...q.body.actions.filter((a) => a.seq > q.ack), { ...action, seq: q.seq, at: Date.now() }] };
    await writeDoc(path, q.body, { force: true });
    return q.seq;
  };
  const next = q.chain.then(run, run);
  q.chain = next.catch(() => {});
  return next;
}

let lastPlayerState = null;
function connectPlayer(onState, onKicked) {
  const { code } = session;
  const p = paths(code, session);
  let main = null, seat = null, map = null, mySlot = null, seatUnsub = null, wasSeated = false, ready = false;
  const q = (queues[code] ||= { body: null, seq: 0, ack: 0, chain: Promise.resolve() });
  const emit = () => {
    if (!main || mySlot === null || !seat) return;
    lastPlayerState = { ...seat, map: map || null, me: { ...(seat.me || {}), role: "player", slot: mySlot } };
    onState(lastPlayerState);
  };
  const unsubs = [];
  unsubs.push(doc(p.pub).onSnapshot((snap) => {
    if (!snap.exists) { if (!ready) onWaiting && onWaiting(); return; }
    main = snap.data();
    const ack = main.acks?.[uid];
    if (ack && ack.seq > q.ack) {
      q.ack = ack.seq;
      if (ack.error && Date.now() - (ack.at || 0) < 60000) reportFn(new Error(ack.error));
      clearTimeout(pendingTimer);
      if (q.body?.actions.some((a) => a.seq <= q.ack)) {
        q.body = { actions: q.body.actions.filter((a) => a.seq > q.ack) };
        writeDoc(`inbox/${uid}/q/${code}`, q.body, { force: true });
      }
    }
    const slot = main.slots.find((s) => s.uid === uid);
    if (!slot) {
      if (wasSeated) { close(); forget(code); onKicked && onKicked(); }
      else if (!ready) onWaiting && onWaiting();
      return;
    }
    wasSeated = true;
    if (slot.index !== mySlot) {
      mySlot = slot.index;
      seatUnsub && seatUnsub();
      seatUnsub = doc(`${p.pub}/seat/${mySlot}`).onSnapshot((s) => { if (s.exists) { seat = s.data(); ready = true; emit(); } }, report);
    }
    emit();
  }, report));
  unsubs.push(doc(`${p.pub}/view/map`).onSnapshot((s) => { map = s.exists ? s.data().map : null; emit(); }, report));
  if (session.gmless) startHosting(code);
  const close = () => { unsubs.forEach((u) => u()); seatUnsub && seatUnsub(); stopHosting(); };
  return { close };
}
let onWaiting = null;
export function onWaitingForGM(fn) { onWaiting = fn; }

let pendingTimer = null;
async function playerAct(type, payload) {
  await queuePush(session.code, { type, payload });
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => reportFn(new Error(session.gmless
    ? "Nobody's game is running the table right now. Your move goes through as soon as someone opens it."
    : "The GM's game isn't open right now. Your action will go through when it is.")), 15000);
  return { ok: true, result: null };
}

// ---------------- the engine (GM page, or the hosting player's page) ----------------
let game = null;
let store = null;        // paths for the running game
let gmListener = null;   // the GM's screen, when the engine runs on it
let processed = {};
const watched = new Map(); // uid -> unsubscribe
let joinRequests = new Set();
let reqUnsub = null;
const acks = {};

function splitMain(g, proc = processed) {
  const { maps, handouts, ...rest } = g;
  return { ...rest, log: rest.log.slice(-400), mapIds: maps.map((m) => m.id), handoutIds: handouts.map((x) => x.id), processed: proc };
}

async function loadGame(code, opts) {
  store = paths(code, opts);
  const m = await readDoc(store.base, null);
  if (!m) throw new Error(opts.gmless ? "This game no longer exists." : "This game belongs to a different account, or it was deleted.");
  const maps = (await Promise.all((m.mapIds || []).map((id) => doc(`${store.base}/maps/${id}`).get()))).filter((s) => s.exists).map((s) => s.data());
  const handouts = (await Promise.all((m.handoutIds || []).map((id) => doc(`${store.base}/handouts/${id}`).get()))).filter((s) => s.exists).map((s) => s.data());
  processed = m.processed || {};
  const { mapIds, handoutIds, processed: _p, ...rest } = m;
  game = { ...rest, maps, handouts };
  for (const k of Object.keys(acks)) delete acks[k];
  Object.assign(acks, (await readDoc(store.pub, {})).acks || {});
  lastWritten.set(store.base, json(splitMain(game)));
  maps.forEach((mm) => lastWritten.set(`${store.base}/maps/${mm.id}`, json(mm)));
  handouts.forEach((hh) => lastWritten.set(`${store.base}/handouts/${hh.id}`, json(hh)));
  prevMapIds = new Set(maps.map((x) => x.id));
  prevHandoutIds = new Set(handouts.map((x) => x.id));
}

let saveTimer = null;
let prevMapIds = new Set(), prevHandoutIds = new Set();
function changed() {
  gmListener && gmListener(viewFor(game, { role: "dm" }));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 350);
}

function persist() {
  if (!game) return;
  const code = game.code, base = store.base, pub = store.pub;
  writeDoc(base, splitMain(game));
  for (const m of game.maps) writeDoc(`${base}/maps/${m.id}`, m);
  for (const x of game.handouts) writeDoc(`${base}/handouts/${x.id}`, x);
  for (const id of prevMapIds) if (!game.maps.some((m) => m.id === id)) deleteDoc(`${base}/maps/${id}`);
  for (const id of prevHandoutIds) if (!game.handouts.some((x) => x.id === id)) deleteDoc(`${base}/handouts/${id}`);
  prevMapIds = new Set(game.maps.map((m) => m.id));
  prevHandoutIds = new Set(game.handouts.map((x) => x.id));
  writeDoc(pub, {
    code, name: game.name, gm: game.gm || null, gmless: !!game.gmless,
    slots: game.slots.map((s) => ({ index: s.index, type: s.type, playerName: s.playerName || null, uid: s.type === "player" ? s.token : null, character: s.characterId ? game.characters[s.characterId]?.name || null : null })),
    acks,
  });
  let mapView = null;
  for (const s of game.slots) {
    if (s.type !== "player") continue;
    const { map, ...view } = viewFor(game, { role: "player", slot: s.index });
    mapView = map;
    writeDoc(`${pub}/seat/${s.index}`, view);
  }
  if (!mapView) mapView = viewFor(game, { role: "player", slot: 0 }).map;
  writeDoc(`${pub}/view/map`, { map: mapView || null });
  writeDoc(`lobby/${code}`, game.gmless ? { gmless: true, name: game.name } : { gm: game.gm, name: game.name });
  watchQueues();
}

function watchQueues() {
  const uids = new Set(game.slots.filter((s) => s.type === "player").map((s) => s.token));
  for (const r of joinRequests) uids.add(r);
  for (const u of uids) {
    if (watched.has(u)) continue;
    watched.set(u, doc(`inbox/${u}/q/${game.code}`).onSnapshot((snap) => { if (snap.exists) processQueue(u, snap.data()); }, report));
  }
}

function processQueue(u, body) {
  if (!game) return;
  const done = processed[u] || 0;
  const todo = (body.actions || []).filter((a) => a.seq > done).sort((a, b) => a.seq - b.seq);
  if (!todo.length) return;
  let error = null;
  for (const a of todo) {
    try {
      if (a.type === "join") {
        if (!game.slots.some((s) => s.token === u)) engineJoin(game, { name: a.payload?.name, slot: a.payload?.slot, token: u });
      } else {
        const auth = authFor(game, { token: u });
        if (!auth) throw new Error("You don't have a seat in this game.");
        applyAction(game, auth, a.type, a.payload);
      }
      error = null;
    } catch (e) { error = e.message || String(e); }
    processed[u] = a.seq;
  }
  acks[u] = { seq: processed[u], error, at: Date.now() };
  changed();
}

function runEngine(onState) {
  gmListener = onState || null;
  if (onState) onState(viewFor(game, { role: "dm" }));
  reqUnsub = db.collection(`lobby/${game.code}/req`).onSnapshot((snap) => {
    joinRequests = new Set(snap.docs.map((d) => d.id));
    if (game) watchQueues();
  }, report);
  persist();
}
function stopEngine() {
  if (!game) return;
  clearTimeout(saveTimer);
  persist();
  reqUnsub && reqUnsub(); reqUnsub = null;
  watched.forEach((u) => u()); watched.clear();
  game = null; gmListener = null;
}

// GM-less hosting: hold a short lease; whoever holds it runs the engine.
let hostTimer = null, hosting = false, hostingCode = null;
function startHosting(code) {
  hostingCode = code;
  const tick = async () => {
    try {
      const r = await doc(paths(code, { gmless: true }).lease).acquire({ holder: uid, ttlMs: 30000 });
      if (r.acquired && !hosting) {
        hosting = true;
        await loadGame(code, { gmless: true });
        runEngine(null);
      } else if (!r.acquired && hosting) {
        hosting = false;
        stopEngine();
      }
    } catch (e) { report(e); }
    hostTimer = setTimeout(tick, hosting ? 10000 : 15000);
  };
  tick();
}
function stopHosting() {
  clearTimeout(hostTimer);
  if (hosting) { hosting = false; stopEngine(); }
  hostingCode = null;
}

// ---------------- shared interface ----------------
export function act(type, payload = {}) {
  if (session.role !== "dm") return playerAct(type, payload);
  const result = applyAction(game, { role: "dm" }, type, payload);
  changed();
  return Promise.resolve({ ok: true, result: result ?? null });
}

export function connect(onState, onKicked) {
  if (session.role === "dm") {
    loadGame(session.code, { gm: uid }).then(() => runEngine(onState)).catch((e) => reportFn(e));
    return { close: () => stopEngine() };
  }
  return connectPlayer(onState, onKicked);
}

export async function askAI(task, prompt) {
  const sample = await cap("sample");
  if (!sample) throw new Error("The AI isn't available in this view.");
  const g = game && session.role === "dm" ? game : lastPlayerState;
  if (!g) throw new Error("The game hasn't loaded yet.");
  const r = await sample([{ role: "user", content: `${SYSTEM}\n\nCampaign context:\n${context(g)}\n\n${userPrompt(g, task, prompt)}` }], { modelTier: "default", cache: false });
  return { text: r.text };
}

export function shareInfo(state) {
  return {
    invite: `Join my Pathfinder game "${state.name}": open the Pathfinder Table link I shared with you on claude.ai and enter code ${state.code}.`,
    inviteLabel: "Copy invite message",
  };
}

export async function exportGame(state) {
  const dl = await cap("downloads");
  if (!dl) throw new Error("Downloads aren't available in this view.");
  await dl.save({ filename: `${state.code}.json`, data: JSON.stringify(game && session.role === "dm" ? game : state, null, 2) });
}
export async function downloadFile(filename, data) {
  const dl = await cap("downloads");
  if (!dl) throw new Error("Downloads aren't available in this view.");
  await dl.save({ filename, data });
}
