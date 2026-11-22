// Server transport: talks to server.js over HTTP + Server-Sent Events.
// cloud.js implements the same functions for the hosted (serverless) version.
export const session = { code: null, key: null, token: null, role: null };

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const authParams = () => (session.key ? `key=${encodeURIComponent(session.key)}` : `token=${encodeURIComponent(session.token)}`);
const authBody = () => (session.key ? { key: session.key } : { token: session.token });

export async function init() { return true; }

export async function createGame(name, { gmless = false } = {}) {
  const r = await api("/api/games", { method: "POST", body: { name, gmless } });
  // a GM-less game has no GM: its creator joins as a player like everyone else
  if (!gmless) remember(r.code, { key: r.key, name: name || "New Campaign", role: "gm" });
  return { ...r, gmless, key: gmless ? undefined : r.key };
}
export const gameInfo = (code) => api(`/api/games/${code}/info`);
export async function joinGame(code, name, slot, gameName, character) {
  const r = await api(`/api/games/${code}/join`, { method: "POST", body: { name, slot } });
  remember(code, { token: r.token, name: gameName, role: "player" });
  if (character) await api(`/api/games/${code}/action`, { method: "POST", body: { auth: { token: r.token }, type: "saveCharacter", payload: { character } } });
  return r;
}

// Put a saved character into a game this device has a seat in.
export async function assignCharacter(code, character) {
  const token = recall()[code]?.token;
  if (!token) throw new Error("You don't have a seat in that game on this device.");
  await api(`/api/games/${code}/action`, { method: "POST", body: { auth: { token }, type: "saveCharacter", payload: { character } } });
}

// ---- character library (kept in this browser) ----
const LIB = "pftable.library";
const readLib = () => { try { return JSON.parse(localStorage.getItem(LIB) || "{}"); } catch { return {}; } };
export async function listLibrary() {
  return Object.values(readLib()).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}
export async function saveToLibrary(char) {
  const lib = readLib();
  const id = char.libId || `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const { live, slot, id: _gameId, updatedAt, companion, ...build } = char;
  lib[id] = { ...build, libId: id, savedAt: Date.now() };
  try { localStorage.setItem(LIB, JSON.stringify(lib)); } catch { throw new Error("This browser won't let the page save data."); }
  return id;
}
export async function deleteFromLibrary(libId) {
  const lib = readLib();
  delete lib[libId];
  try { localStorage.setItem(LIB, JSON.stringify(lib)); } catch {}
}
export async function downloadFile(filename, data) {
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export async function config() {
  try { return await api("/api/config"); } catch { return { ai: false }; }
}

export function act(type, payload = {}) {
  return api(`/api/games/${session.code}/action`, { method: "POST", body: { auth: authBody(), type, payload } });
}
export function askAI(task, prompt) {
  return api(`/api/games/${session.code}/ai`, { method: "POST", body: { auth: authBody(), task, prompt } });
}

// Enter a game this device already has credentials for (or creds from a link)
export function enter(code, creds = {}) {
  const saved = recall()[code] || {};
  const key = creds.key || (creds.role !== "player" ? saved.key : null);
  const token = creds.token || saved.token;
  if (creds.role === "gm" || (key && creds.role !== "player")) {
    if (!key) return false;
    Object.assign(session, { code, key, token: null, role: "dm" });
  } else {
    if (!token) return false;
    Object.assign(session, { code, key: null, token, role: "player" });
  }
  remember(code, session.key ? { key: session.key } : { token: session.token });
  return true;
}

// Live state stream. EventSource reconnects by itself.
export function connect(onState, onKicked) {
  const es = new EventSource(`/api/games/${session.code}/events?${authParams()}`);
  es.addEventListener("state", (e) => onState(JSON.parse(e.data)));
  es.addEventListener("kicked", () => { es.close(); forget(session.code); onKicked && onKicked(); });
  es.onerror = () => {
    document.body.classList.add("offline");
    setTimeout(() => es.readyState === 1 && document.body.classList.remove("offline"), 3000);
  };
  es.onopen = () => document.body.classList.remove("offline");
  return es;
}

// Header menu entries for sharing
export function shareInfo(state) {
  if (session.role === "dm") {
    return {
      invite: `${location.origin}/#/join/${state.code}`,
      inviteLabel: "Copy invite link",
      private: `${location.origin}/#/gm/${state.code}?key=${session.key}`,
      privateLabel: "Copy my GM link (keep private)",
    };
  }
  return { private: `${location.origin}/#/play/${state.code}?token=${session.token}`, privateLabel: "Copy my personal link (open this seat on another device)" };
}

export async function exportGame(state) {
  const a = document.createElement("a");
  a.href = `/api/games/${session.code}/export?${authParams()}`;
  a.download = `${state.code}.json`;
  document.body.append(a); a.click(); a.remove();
}

export const canPrint = true;

// ---- games remembered on this device ----
const STORE = "pftable.sessions";
export function remember(code, creds) {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) || "{}");
    all[code] = { ...(all[code] || {}), ...creds, at: Date.now() };
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {}
}
export function recall() {
  try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; }
}
export async function myGames() {
  return Object.entries(recall()).map(([code, s]) => ({ code, name: s.name, role: s.key ? "gm" : "player", at: s.at || 0 })).sort((a, b) => b.at - a.at);
}
export async function deleteGame(code) {
  const key = recall()[code]?.key;
  if (!key) throw new Error("Only the GM can delete this game.");
  await api(`/api/games/${code}?key=${encodeURIComponent(key)}`, { method: "DELETE" });
  await forget(code);
}
export async function forget(code) {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) || "{}");
    delete all[code];
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {}
}
