import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGame, newCode, authFor, viewFor, applyAction, joinGame } from "./server/game.js";
import { aiAvailable, runAI } from "./server/ai.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "public");
const SAVE_DIR = process.env.PF_TABLE_DATA || path.join(here, "data", "games");
const PORT = +process.env.PORT || 3000;
fs.mkdirSync(SAVE_DIR, { recursive: true });

// ---------- persistence ----------
const games = new Map();
for (const f of fs.readdirSync(SAVE_DIR)) {
  if (!f.endsWith(".json")) continue;
  try {
    const g = JSON.parse(fs.readFileSync(path.join(SAVE_DIR, f), "utf8"));
    games.set(g.code, g);
  } catch (e) {
    console.warn("Skipping unreadable save", f, e.message);
  }
}
const saveTimers = new Map();
function save(game) {
  clearTimeout(saveTimers.get(game.code));
  saveTimers.set(game.code, setTimeout(() => {
    const file = path.join(SAVE_DIR, game.code + ".json");
    fs.writeFile(file + ".tmp", JSON.stringify(game), (err) => {
      if (!err) fs.rename(file + ".tmp", file, () => {});
    });
  }, 400));
}

// ---------- live updates (Server-Sent Events) ----------
const listeners = new Map(); // code -> Set<{res, auth}>
function broadcast(game) {
  const set = listeners.get(game.code);
  if (!set) return;
  for (const l of set) {
    const a = authFor(game, l.creds);
    if (!a) { l.res.write(`event: kicked\ndata: {}\n\n`); continue; }
    l.res.write(`event: state\ndata: ${JSON.stringify(viewFor(game, a))}\n\n`);
  }
}
setInterval(() => {
  for (const set of listeners.values()) for (const l of set) l.res.write(": ping\n\n");
}, 25000);

// ---------- http helpers ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 2_000_000) { reject(new Error("Request too large")); req.destroy(); }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch { reject(new Error("Bad JSON")); }
    });
  });
}
function serveStatic(req, res, urlPath) {
  let p = decodeURIComponent(urlPath);
  if (p === "/" || !path.extname(p)) p = "/index.html";
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: "forbidden" });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: "not found" });
    const ext = path.extname(file);
    res.writeHead(200, {
      "content-type": MIME[ext] || "application/octet-stream",
      "cache-control": file.includes(`${path.sep}data${path.sep}`) ? "public, max-age=3600" : "no-cache",
    });
    fs.createReadStream(file).pipe(res);
  });
}

// ---------- routes ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  try {
    if (parts[0] !== "api") return serveStatic(req, res, url.pathname);

    if (req.method === "GET" && parts[1] === "config") return send(res, 200, { ai: await aiAvailable() });

    if (req.method === "POST" && parts[1] === "games" && parts.length === 2) {
      const body = await readBody(req);
      let code;
      do code = newCode(); while (games.has(code));
      const game = createGame(code, String(body.name || "").slice(0, 120), { gmless: !!body.gmless });
      games.set(code, game);
      save(game);
      return send(res, 200, { code, key: game.dmKey });
    }

    if (parts[1] === "games" && parts[2]) {
      const game = games.get(parts[2].toUpperCase());
      if (!game) return send(res, 404, { error: "No game with that code." });
      const sub = parts[3];

      if (req.method === "GET" && sub === "info") {
        return send(res, 200, { code: game.code, name: game.name, gmless: !!game.gmless, slots: game.slots.map((s) => ({ index: s.index, type: s.type, playerName: s.playerName, character: s.characterId ? game.characters[s.characterId]?.name : null })) });
      }
      if (req.method === "POST" && sub === "join") {
        const body = await readBody(req);
        const r = joinGame(game, body);
        save(game);
        broadcast(game);
        return send(res, 200, r);
      }

      const creds = { key: url.searchParams.get("key"), token: url.searchParams.get("token") };
      if (req.method === "POST") Object.assign(creds, (req.body = await readBody(req)).auth || {});
      const auth = authFor(game, creds);
      if (!auth) return send(res, 401, { error: "Your seat or GM link isn't valid for this game." });

      if (req.method === "GET" && sub === "state") return send(res, 200, viewFor(game, auth));
      if (req.method === "GET" && sub === "events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        res.write(`event: state\ndata: ${JSON.stringify(viewFor(game, auth))}\n\n`);
        if (!listeners.has(game.code)) listeners.set(game.code, new Set());
        const entry = { res, creds };
        listeners.get(game.code).add(entry);
        req.on("close", () => listeners.get(game.code)?.delete(entry));
        return;
      }
      if (req.method === "POST" && sub === "action") {
        const { type, payload } = req.body;
        const result = applyAction(game, auth, type, payload);
        save(game);
        broadcast(game);
        return send(res, 200, { ok: true, result: result ?? null });
      }
      if (req.method === "POST" && sub === "ai") {
        if (auth.role !== "dm" && !game.gmless) return send(res, 403, { error: "Only the GM can use the assistant." });
        const text = await runAI(game, req.body.task, req.body.prompt);
        return send(res, 200, { text });
      }
      if (req.method === "GET" && sub === "export") {
        if (auth.role !== "dm") return send(res, 403, { error: "GM only" });
        const { dmKey, ...rest } = game;
        res.writeHead(200, { "content-type": "application/json", "content-disposition": `attachment; filename="${game.code}.json"` });
        return res.end(JSON.stringify(rest, null, 2));
      }
    }
    send(res, 404, { error: "Unknown endpoint" });
  } catch (e) {
    send(res, 400, { error: e.message || String(e) });
  }
});

server.listen(PORT, () => {
  console.log(`Pathfinder Table running at http://localhost:${PORT}`);
  console.log(`Saves: ${SAVE_DIR}`);
});
