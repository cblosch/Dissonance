// Talks to the server. `session` holds the game code plus either the GM key or a player token.
export const session = { code: null, key: null, token: null, role: null };

export async function api(path, { method = "GET", body } = {}) {
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

export function act(type, payload = {}) {
  return api(`/api/games/${session.code}/action`, { method: "POST", body: { auth: authBody(), type, payload } });
}

export function askAI(task, prompt) {
  return api(`/api/games/${session.code}/ai`, { method: "POST", body: { auth: authBody(), task, prompt } });
}

export function exportUrl() {
  return `/api/games/${session.code}/export?${authParams()}`;
}

// Live state stream. Reconnects automatically (EventSource does this itself).
export function connect(onState, onKicked) {
  const es = new EventSource(`/api/games/${session.code}/events?${authParams()}`);
  es.addEventListener("state", (e) => onState(JSON.parse(e.data)));
  es.addEventListener("kicked", () => { es.close(); onKicked && onKicked(); });
  es.onerror = () => {
    document.body.classList.add("offline");
    setTimeout(() => es.readyState === 1 && document.body.classList.remove("offline"), 3000);
  };
  es.onopen = () => document.body.classList.remove("offline");
  return es;
}

const STORE = "pftable.sessions";
export function rememberSession(code, creds) {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) || "{}");
    all[code] = { ...(all[code] || {}), ...creds, at: Date.now() };
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {}
}
export function recallSessions() {
  try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; }
}
export function forgetSession(code) {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) || "{}");
    delete all[code];
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {}
}
