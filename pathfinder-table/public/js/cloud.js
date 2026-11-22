// Hosted transport: runs without a server, on the page's shared database.
//
// The GM's browser is the game engine. It keeps the full game (plot, secrets,
// unrevealed maps) in the GM's private area, which nobody else can read, and
// publishes a filtered copy of each player's view, the same filtering the
// server does. Players send actions through their own queue documents, which
// only they can write; the GM's page applies them with the shared rules code.
//
// Database layout
//   data/users/<gm>/game-<code>                 full game (GM only)
//   data/users/<gm>/game-<code>/maps/<id>       maps (GM only)
//   data/users/<gm>/game-<code>/handouts/<id>   handouts (GM only)
//   data/users/<uid>/mine                       games this person is in
//   lobby/<code>                                code -> GM, campaign name
//   lobby/<code>/req/<uid>                      "I want to join" pointer
//   pub/<gm>/t/<code>                           seats and action receipts
//   pub/<gm>/t/<code>/seat/<n>                  what seat n sees
//   pub/<gm>/t/<code>/view/map                  revealed part of the map
//   inbox/<uid>/q/<code>                        a player's pending actions
import { createGame as newGame, newCode, authFor, viewFor, applyAction, joinGame as engineJoin } from "./shared/game.js";
import { SYSTEM, context, userPrompt } from "./shared/aiprompts.js";

export const session = { code: null, key: null, token: null, role: null, uid: null, gm: null };
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

// ---------------- small helpers ----------------
const doc = (p) => db.doc(p);
const gmMain = (gm, code) => `data/users/${gm}/game-${code}`;
const pubMain = (gm, code) => `pub/${gm}/t/${code}`;
const json = (x) => JSON.stringify(x);

// One write at a time per document; skip writes that change nothing.
const lastWritten = new Map();
const chains = new Map();
function writeDoc(path, data, { force = false } = {}) {
  const body = json(data);
  if (!force && lastWritten.get(path) === body) return chains.get(path) || Promise.resolve();
  lastWritten.set(path, body);
  const next = (chains.get(path) || Promise.resolve()).then(() => doc(path).set(data)).catch((e) => {
    lastWritten.delete(path);
    report(e);
  });
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
    e?.code === "revoked" ? "Access to this page changed. Reload it." : (e?.message || String(e));
  reportFn(new Error(msg));
}
export function onError(fn) { reportFn = fn; }

// ---------------- games this person is in ----------------
async function mineDoc() {
  const snap = await doc(`data/users/${uid}/mine`).get();
  return snap.exists ? snap.data() : { games: {} };
}
async function addMine(code, entry) {
  const m = await mineDoc();
  m.games = { ...(m.games || {}), [code]: { ...(m.games?.[code] || {}), ...entry, at: Date.now() } };
  await writeDoc(`data/users/${uid}/mine`, m, { force: true });
}
export async function myGames() {
  const m = await mineDoc();
  return Object.entries(m.games || {}).map(([code, g]) => ({ code, ...g })).sort((a, b) => (b.at || 0) - (a.at || 0));
}
export async function forget(code) {
  const m = await mineDoc();
  if (m.games?.[code]) { delete m.games[code]; await writeDoc(`data/users/${uid}/mine`, m, { force: true }); }
}

// ---------------- lobby ----------------
export async function config() {
  return { ai: !!(await cap("sample")) };
}

async function lookup(code) {
  const snap = await doc(`lobby/${code}`).get();
  if (!snap.exists) throw new Error("No game with that code. Check it with your GM.");
  return snap.data();
}

export async function gameInfo(code) {
  const lob = await lookup(code);
  const pub = await doc(pubMain(lob.gm, code)).get();
  const slots = pub.exists ? pub.data().slots : [];
  return { code, name: lob.name, gm: lob.gm, slots: slots.map((s) => ({ ...s, mine: s.uid === uid })) };
}

export async function createGame(name) {
  let code;
  for (let i = 0; i < 6; i++) {
    code = newCode();
    if (!(await doc(`lobby/${code}`).get()).exists) break;
  }
  processed = {};
  const g = newGame(code, name);
  g.gm = uid;
  delete g.dmKey;
  await doc(gmMain(uid, code)).set(splitMain(g));
  await doc(`lobby/${code}`).set({ gm: uid, name: g.name });
  await addMine(code, { role: "gm", name: g.name, gm: uid });
  return { code };
}

export async function joinGame(code, name, slot, gameName) {
  const lob = await lookup(code);
  if (lob.gm === uid) throw new Error("You're the GM of this game. Open it from Your games.");
  await queuePush(code, { type: "join", payload: { name, slot } });
  await doc(`lobby/${code}/req/${uid}`).set({ at: Date.now() });
  await addMine(code, { role: "player", name: gameName || lob.name, gm: lob.gm });
  return { slot };
}

export async function enter(code, { role } = {}) {
  const games = await myGames();
  const g = games.find((x) => x.code === code);
  if (!g) return false;
  Object.assign(session, { code, role: g.role === "gm" ? "dm" : "player", gm: g.gm });
  return true;
}

// ---------------- player side ----------------
let queueSeq = 0;
let myQueue = null; // last known queue body
async function queuePush(code, action) {
  const path = `inbox/${uid}/q/${code}`;
  if (!myQueue) { const s = await doc(path).get(); myQueue = s.exists ? s.data() : { actions: [] }; }
  queueSeq = Math.max(queueSeq + 1, Date.now());
  myQueue = { actions: [...myQueue.actions.filter((a) => a.seq > (lastAck || 0)), { ...action, seq: queueSeq, at: Date.now() }] };
  await writeDoc(path, myQueue, { force: true });
  return queueSeq;
}
let lastAck = 0;

function connectPlayer(onState, onKicked) {
  const { code, gm } = session;
  let main = null, seat = null, map = null, mySlot = null, seatUnsub = null, wasSeated = false, ready = false;
  const emit = () => {
    if (!main || mySlot === null || !seat) return;
    onState({ ...seat, map: map || null, me: { role: "player", slot: mySlot } });
  };
  const unsubs = [];
  unsubs.push(doc(pubMain(gm, code)).onSnapshot((snap) => {
    if (!snap.exists) return;
    main = snap.data();
    const ack = main.acks?.[uid];
    if (ack && ack.seq > lastAck) {
      lastAck = ack.seq;
      if (ack.error && Date.now() - (ack.at || 0) < 60000) reportFn(new Error(ack.error));
      clearTimeout(pendingTimer);
      if (myQueue?.actions.some((a) => a.seq <= lastAck)) {
        myQueue = { actions: myQueue.actions.filter((a) => a.seq > lastAck) };
        writeDoc(`inbox/${uid}/q/${code}`, myQueue, { force: true });
      }
    }
    const slot = main.slots.find((s) => s.uid === uid);
    if (!slot) {
      if (wasSeated) { unsubs.forEach((u) => u()); seatUnsub && seatUnsub(); forget(code); onKicked && onKicked(); }
      else if (!ready) onWaiting && onWaiting();
      return;
    }
    wasSeated = true;
    if (slot.index !== mySlot) {
      mySlot = slot.index;
      seatUnsub && seatUnsub();
      seatUnsub = doc(`${pubMain(gm, code)}/seat/${mySlot}`).onSnapshot((s) => { if (s.exists) { seat = s.data(); ready = true; emit(); } }, report);
    }
    emit();
  }, report));
  unsubs.push(doc(`${pubMain(gm, code)}/view/map`).onSnapshot((s) => { map = s.exists ? s.data().map : null; emit(); }, report));
  return { close: () => { unsubs.forEach((u) => u()); seatUnsub && seatUnsub(); } };
}
let onWaiting = null;
export function onWaitingForGM(fn) { onWaiting = fn; }

let pendingTimer = null;
async function playerAct(type, payload) {
  await queuePush(session.code, { type, payload });
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => reportFn(new Error("The GM's game isn't open right now. Your action will go through when it is.")), 15000);
  return { ok: true, result: null };
}

// ---------------- GM side: the engine ----------------
let game = null;
let gmListener = null;
let processed = {};
const watched = new Map(); // uid -> unsubscribe

function splitMain(g) {
  const { maps, handouts, ...rest } = g;
  return { ...rest, log: rest.log.slice(-400), mapIds: maps.map((m) => m.id), handoutIds: handouts.map((x) => x.id), processed };
}

async function loadGame(code) {
  const snap = await doc(gmMain(uid, code)).get();
  if (!snap.exists) throw new Error("This game belongs to a different account, or it was deleted.");
  const m = snap.data();
  const maps = (await Promise.all((m.mapIds || []).map((id) => doc(`${gmMain(uid, code)}/maps/${id}`).get()))).filter((s) => s.exists).map((s) => s.data());
  const handouts = (await Promise.all((m.handoutIds || []).map((id) => doc(`${gmMain(uid, code)}/handouts/${id}`).get()))).filter((s) => s.exists).map((s) => s.data());
  processed = m.processed || {};
  const { mapIds, handoutIds, processed: _p, ...rest } = m;
  game = { ...rest, maps, handouts };
  for (const x of [[gmMain(uid, code), splitMain(game)], ...maps.map((mm) => [`${gmMain(uid, code)}/maps/${mm.id}`, mm]), ...handouts.map((hh) => [`${gmMain(uid, code)}/handouts/${hh.id}`, hh])]) lastWritten.set(x[0], json(x[1]));
}

let saveTimer = null;
let prevMapIds = new Set(), prevHandoutIds = new Set();
function changed() {
  gmListener && gmListener(viewFor(game, { role: "dm" }));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 350);
}
const acks = {};
function persist() {
  const code = game.code;
  const base = gmMain(uid, code);
  writeDoc(base, splitMain(game));
  for (const m of game.maps) writeDoc(`${base}/maps/${m.id}`, m);
  for (const x of game.handouts) writeDoc(`${base}/handouts/${x.id}`, x);
  for (const id of prevMapIds) if (!game.maps.some((m) => m.id === id)) deleteDoc(`${base}/maps/${id}`);
  for (const id of prevHandoutIds) if (!game.handouts.some((x) => x.id === id)) deleteDoc(`${base}/handouts/${id}`);
  prevMapIds = new Set(game.maps.map((m) => m.id));
  prevHandoutIds = new Set(game.handouts.map((x) => x.id));
  // public copies
  const pub = pubMain(uid, code);
  writeDoc(pub, {
    code, name: game.name, gm: uid,
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
  writeDoc(`lobby/${code}`, { gm: uid, name: game.name });
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
let joinRequests = new Set();

function processQueue(u, body) {
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

function connectGM(onState) {
  gmListener = onState;
  onState(viewFor(game, { role: "dm" }));
  prevMapIds = new Set(game.maps.map((m) => m.id));
  prevHandoutIds = new Set(game.handouts.map((x) => x.id));
  const unsub = db.collection(`lobby/${game.code}/req`).onSnapshot((snap) => {
    joinRequests = new Set(snap.docs.map((d) => d.id));
    watchQueues();
  }, report);
  persist();
  return { close: () => { unsub(); watched.forEach((u) => u()); watched.clear(); } };
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
    let handle = null;
    loadGame(session.code).then(() => { handle = connectGM(onState); }).catch((e) => reportFn(e));
    return { close: () => handle && handle.close() };
  }
  return connectPlayer(onState, onKicked);
}

export async function askAI(task, prompt) {
  const sample = await cap("sample");
  if (!sample) throw new Error("The assistant isn't available in this view.");
  const r = await sample([{ role: "user", content: `${SYSTEM}\n\nCampaign context:\n${context(game)}\n\n${userPrompt(game, task, prompt)}` }], { modelTier: "default" });
  return { text: r.text };
}

export function shareInfo(state) {
  return {
    invite: `Join my Pathfinder game "${state.name}": open the Pathfinder Table link I shared with you on claude.ai and enter code ${state.code}.`,
    inviteLabel: "Copy invite message",
  };
}

export async function exportGame() {
  const dl = await cap("downloads");
  if (!dl) throw new Error("Downloads aren't available in this view.");
  await dl.save({ filename: `${game.code}.json`, data: JSON.stringify(game, null, 2) });
}
