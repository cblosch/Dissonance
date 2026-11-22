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

export async function createGame(name) {
  const r = await api("/api/games", { method: "POST", body: { name } });
  remember(r.code, { key: r.key, name: name || "New Campaign", role: "gm" });
  return r;
}
export const gameInfo = (code) => api(`/api/games/${code}/info`);
export async function joinGame(code, name, slot, gameName) {
  const r = await api(`/api/games/${code}/join`, { method: "POST", body: { name, slot } });
  remember(code, { token: r.token, name: gameName, role: "player" });
  return r;
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
export async function forget(code) {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) || "{}");
    delete all[code];
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {}
}
