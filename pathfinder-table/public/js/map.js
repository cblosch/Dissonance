import { h, clear, toast, select } from "./ui.js";

// ---------------------------------------------------------------
// Terrain palette (one character per 5-foot square)
// ---------------------------------------------------------------
export const TERRAIN = {
  " ": { name: "Solid rock", color: "#17161a", block: true },
  "#": { name: "Wall", color: "#4a433b", block: true },
  ".": { name: "Stone floor", color: "#c9c0ad" },
  "c": { name: "Cave floor", color: "#9b907f" },
  "b": { name: "Wood floor", color: "#b48a5c" },
  ",": { name: "Grass", color: "#86a95f" },
  "s": { name: "Sand / dirt", color: "#d6c08b" },
  "=": { name: "Road", color: "#bfa275" },
  "+": { name: "Door", color: "#7a4a1f" },
  "S": { name: "Stairs", color: "#a89a78" },
  "^": { name: "Rubble (difficult)", color: "#8d8273" },
  "f": { name: "Undergrowth (difficult)", color: "#5c8443" },
  "w": { name: "Shallow water (difficult)", color: "#79a7cf" },
  "~": { name: "Deep water (swim)", color: "#2f6396", block: true },
  "T": { name: "Trees (cover)", color: "#2e5a32", block: true },
  "r": { name: "Boulder", color: "#6d6962", block: true },
  "p": { name: "Pillar", color: "#5d5750", block: true },
  "t": { name: "Table / furniture (cover)", color: "#6e4a2a" },
  "?": { name: "Unexplored", color: "#000", block: true },
};

export const MAP_TYPES = {
  dungeon: "Dungeon (rooms & corridors)",
  cave: "Cave / caverns",
  wilderness: "Wilderness / forest",
  town: "Town / village",
  tavern: "Tavern / building interior",
};

// ---------------------------------------------------------------
// Seeded RNG
// ---------------------------------------------------------------
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));

class Grid {
  constructor(w, hh, fill = " ") { this.w = w; this.h = hh; this.c = new Array(w * hh).fill(fill); }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.in(x, y) ? this.c[y * this.w + x] : " "; }
  set(x, y, v) { if (this.in(x, y)) this.c[y * this.w + x] = v; }
  rect(x, y, w, hh, v) { for (let j = y; j < y + hh; j++) for (let i = x; i < x + w; i++) this.set(i, j, v); }
  str() { return this.c.join(""); }
  wallUp(floorChars, wall = "#") {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y) !== " ") continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (floorChars.includes(this.get(x + dx, y + dy))) { this.set(x, y, wall); dy = 2; break; }
      }
    }
  }
}

// ---------------------------------------------------------------
// Generators. Each returns {w,h,cells,rooms,labels,theme}
// ---------------------------------------------------------------
function genDungeon(r, w = 44, hh = 32, opts = {}) {
  const g = new Grid(w, hh);
  const rooms = [];
  const target = opts.rooms || ri(r, 7, 11);
  for (let tries = 0; tries < 400 && rooms.length < target; tries++) {
    const rw = ri(r, 4, 10), rh = ri(r, 3, 7);
    const x = ri(r, 1, w - rw - 2), y = ri(r, 1, hh - rh - 2);
    if (rooms.some((o) => x < o.x + o.w + 2 && x + rw + 2 > o.x && y < o.y + o.h + 2 && y + rh + 2 > o.y)) continue;
    rooms.push({ x, y, w: rw, h: rh, cx: x + (rw >> 1), cy: y + (rh >> 1) });
  }
  rooms.sort((a, b) => a.cx + a.cy * 0.5 - (b.cx + b.cy * 0.5));
  for (const rm of rooms) g.rect(rm.x, rm.y, rm.w, rm.h, ".");
  const isRoomEdge = (x, y) => rooms.some((rm) => (x === rm.x - 1 || x === rm.x + rm.w || y === rm.y - 1 || y === rm.y + rm.h) && x >= rm.x - 1 && x <= rm.x + rm.w && y >= rm.y - 1 && y <= rm.y + rm.h && !((x === rm.x - 1 || x === rm.x + rm.w) && (y === rm.y - 1 || y === rm.y + rm.h)));
  const inRoom = (x, y) => rooms.some((rm) => x >= rm.x && x < rm.x + rm.w && y >= rm.y && y < rm.y + rm.h);
  // Minimum spanning tree over room centers, plus a few loops
  const edges = [];
  const connected = [0];
  while (connected.length < rooms.length) {
    let best = null;
    for (const i of connected) for (let j = 0; j < rooms.length; j++) {
      if (connected.includes(j)) continue;
      const d = Math.abs(rooms[i].cx - rooms[j].cx) + Math.abs(rooms[i].cy - rooms[j].cy);
      if (!best || d < best.d) best = { i, j, d };
    }
    edges.push(best);
    connected.push(best.j);
  }
  for (let k = 0; k < Math.floor(rooms.length / 4); k++) {
    const i = ri(r, 0, rooms.length - 1), j = ri(r, 0, rooms.length - 1);
    if (i !== j) edges.push({ i, j });
  }
  const doors = new Set();
  const carve = (x, y) => {
    if (inRoom(x, y)) return;
    if (isRoomEdge(x, y)) doors.add(y * w + x);
    g.set(x, y, ".");
  };
  for (const e of edges) {
    const a = rooms[e.i], b = rooms[e.j];
    let x = a.cx, y = a.cy;
    const horizFirst = r() < 0.5;
    const stepX = () => { while (x !== b.cx) { x += Math.sign(b.cx - x); carve(x, y); } };
    const stepY = () => { while (y !== b.cy) { y += Math.sign(b.cy - y); carve(x, y); } };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
  }
  // Only keep doors that sit between a corridor and a room (not corridor running along a wall)
  for (const i of doors) {
    const x = i % w, y = Math.floor(i / w);
    const horiz = inRoom(x - 1, y) || inRoom(x + 1, y);
    const vert = inRoom(x, y - 1) || inRoom(x, y + 1);
    const lr = g.get(x - 1, y) === "." && g.get(x + 1, y) === "." && g.get(x, y - 1) !== "." && g.get(x, y + 1) !== ".";
    const ud = g.get(x, y - 1) === "." && g.get(x, y + 1) === "." && g.get(x - 1, y) !== "." && g.get(x + 1, y) !== ".";
    if ((horiz || vert) && (lr || ud) && r() < 0.8) g.set(x, y, "+");
  }
  g.wallUp([".", "+"]);
  // dressing
  const labels = [];
  rooms.forEach((rm, i) => {
    labels.push({ x: rm.x, y: rm.y, text: String(i + 1), public: false });
    const roll = r();
    if (rm.w >= 7 && rm.h >= 5 && roll < 0.3) {
      for (let x = rm.x + 1; x < rm.x + rm.w - 1; x += 3) { g.set(x, rm.y + 1, "p"); g.set(x, rm.y + rm.h - 2, "p"); }
    } else if (roll < 0.5) {
      for (let k = 0; k < ri(r, 2, 6); k++) g.set(ri(r, rm.x, rm.x + rm.w - 1), ri(r, rm.y, rm.y + rm.h - 1), "^");
    } else if (roll < 0.6 && rm.w > 4 && rm.h > 3) {
      g.rect(rm.cx - 1, rm.cy - 1, 2, 2, "w");
    } else if (roll < 0.7) {
      g.set(rm.cx, rm.cy, "t");
    }
  });
  if (rooms.length) { g.set(rooms[0].x, rooms[0].y + rooms[0].h - 1, "S"); const last = rooms.at(-1); g.set(last.x + last.w - 1, last.y, "S"); }
  return { w, h: hh, cells: g.str(), rooms: rooms.map((rm, i) => ({ ...rm, n: i + 1 })), labels, theme: "dungeon" };
}

function genCave(r, w = 46, hh = 34) {
  let cells = new Array(w * hh).fill(0).map((_, i) => {
    const x = i % w, y = Math.floor(i / w);
    return x === 0 || y === 0 || x === w - 1 || y === hh - 1 ? 1 : r() < 0.46 ? 1 : 0;
  });
  const at = (c, x, y) => (x < 0 || y < 0 || x >= w || y >= hh ? 1 : c[y * w + x]);
  for (let it = 0; it < 5; it++) {
    cells = cells.map((_, i) => {
      const x = i % w, y = Math.floor(i / w);
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += at(cells, x + dx, y + dy);
      return n >= 5 || (it < 3 && n <= 1) ? 1 : 0;
    });
  }
  // keep largest open region
  const region = new Array(w * hh).fill(-1);
  let best = -1, bestSize = 0, id = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] || region[i] >= 0) continue;
    const stack = [i]; region[i] = id; let size = 0;
    while (stack.length) {
      const k = stack.pop(); size++;
      const x = k % w, y = Math.floor(k / w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, nk = ny * w + nx;
        if (nx >= 0 && ny >= 0 && nx < w && ny < hh && !cells[nk] && region[nk] < 0) { region[nk] = id; stack.push(nk); }
      }
    }
    if (size > bestSize) { bestSize = size; best = id; }
    id++;
  }
  const g = new Grid(w, hh);
  for (let i = 0; i < cells.length; i++) if (!cells[i] && region[i] === best) g.c[i] = "c";
  // pools and rubble via noise blobs
  for (let k = 0; k < ri(r, 1, 3); k++) {
    const cx = ri(r, 4, w - 5), cy = ri(r, 4, hh - 5), rad = ri(r, 2, 4);
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (g.get(x, y) === "c" && d <= rad + r() - 0.5) g.set(x, y, d < rad - 1.2 ? "~" : "w");
    }
  }
  for (let k = 0; k < 30; k++) { const x = ri(r, 1, w - 2), y = ri(r, 1, hh - 2); if (g.get(x, y) === "c") g.set(x, y, r() < 0.5 ? "^" : "r"); }
  g.wallUp(["c", "^", "w", "~", "r"]);
  // chambers: label a few open spots
  const labels = [];
  const open = g.c.map((v, i) => (v === "c" ? i : -1)).filter((i) => i >= 0);
  for (let k = 0; k < 5 && open.length; k++) { const i = open[ri(r, 0, open.length - 1)]; labels.push({ x: i % w, y: Math.floor(i / w), text: String(k + 1), public: false }); }
  return { w, h: hh, cells: g.str(), rooms: [], labels, theme: "cave" };
}

function noise2(r, w, hh, scale) {
  // value noise with smooth interpolation
  const gw = Math.ceil(w / scale) + 2, gh = Math.ceil(hh / scale) + 2;
  const grid = Array.from({ length: gw * gh }, () => r());
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = x / scale, gy = y / scale, x0 = Math.floor(gx), y0 = Math.floor(gy);
    const tx = sm(gx - x0), ty = sm(gy - y0);
    const v = (i, j) => grid[(j % gh) * gw + (i % gw)];
    const a = v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx;
    const b = v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
}

function genWilderness(r, w = 44, hh = 32) {
  const g = new Grid(w, hh, ",");
  const n1 = noise2(r, w, hh, 7), n2 = noise2(r, w, hh, 3);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const v = n1(x, y) * 0.75 + n2(x, y) * 0.25;
    g.set(x, y, v > 0.66 ? "T" : v > 0.55 ? "f" : v < 0.18 ? "s" : ",");
  }
  // river
  if (r() < 0.75) {
    let x = ri(r, Math.floor(w * 0.2), Math.floor(w * 0.8));
    for (let y = 0; y < hh; y++) {
      x = Math.max(2, Math.min(w - 3, x + ri(r, -1, 1)));
      const width = ri(r, 1, 2);
      for (let dx = -width - 1; dx <= width + 1; dx++) g.set(x + dx, y, Math.abs(dx) <= width - 1 ? "~" : Math.abs(dx) <= width ? "w" : g.get(x + dx, y) === "T" ? "f" : g.get(x + dx, y));
    }
  }
  // road
  let y = ri(r, Math.floor(hh * 0.3), Math.floor(hh * 0.7));
  for (let x = 0; x < w; x++) {
    if (r() < 0.25) y = Math.max(2, Math.min(hh - 3, y + ri(r, -1, 1)));
    for (const dy of [0, 1]) {
      const cur = g.get(x, y + dy);
      g.set(x, y + dy, cur === "~" || cur === "w" ? "b" : "=");
    }
  }
  // clearing with rocks
  const cx = ri(r, 8, w - 9), cy = ri(r, 6, hh - 7);
  for (let j = -4; j <= 4; j++) for (let i = -5; i <= 5; i++) if (Math.hypot(i / 1.2, j) < 4 && "Tf".includes(g.get(cx + i, cy + j))) g.set(cx + i, cy + j, ",");
  for (let k = 0; k < 12; k++) { const x = ri(r, 0, w - 1), yy = ri(r, 0, hh - 1); if (g.get(x, yy) === ",") g.set(x, yy, "r"); }
  return { w, h: hh, cells: g.str(), rooms: [], labels: [{ x: cx, y: cy, text: "clearing", public: false }], theme: "wilderness" };
}

const SHOPS = ["Inn", "Smithy", "Temple", "General Store", "Guard Post", "Alchemist", "Stables", "Bakery", "Tailor", "Magistrate", "Warehouse", "Herbalist", "Tannery", "Shrine", "Bookshop", "Home"];
function genTown(r, w = 50, hh = 36) {
  const g = new Grid(w, hh, ",");
  const mainY = ri(r, 14, hh - 15), mainX = ri(r, 18, w - 19);
  g.rect(0, mainY, w, 2, "="); g.rect(mainX, 0, 2, hh, "=");
  const side = [ri(r, 4, mainY - 6), ri(r, mainY + 7, hh - 5)];
  for (const sy of side) g.rect(ri(r, 0, 6), sy, ri(r, 22, w), 1, "=");
  // plaza
  g.rect(mainX - 3, mainY - 3, 8, 8, ".");
  g.set(mainX, mainY, "p");
  const labels = [{ x: mainX - 2, y: mainY - 3, text: "Square", public: true }];
  const buildings = [];
  const shopNames = [...SHOPS].sort(() => r() - 0.5);
  for (let tries = 0; tries < 500 && buildings.length < 18; tries++) {
    const bw = ri(r, 5, 9), bh = ri(r, 4, 7);
    const x = ri(r, 1, w - bw - 1), y = ri(r, 1, hh - bh - 1);
    let ok = true;
    for (let j = y - 1; j <= y + bh && ok; j++) for (let i = x - 1; i <= x + bw && ok; i++) if (g.get(i, j) !== ",") ok = false;
    if (!ok) continue;
    // must be near a road
    let door = null;
    const cand = [];
    for (let i = x + 1; i < x + bw - 1; i++) { if (g.get(i, y - 2) === "=" || g.get(i, y - 1) === "=") cand.push([i, y]); if (g.get(i, y + bh + 1) === "=" || g.get(i, y + bh) === "=") cand.push([i, y + bh - 1]); }
    for (let j = y + 1; j < y + bh - 1; j++) { if (g.get(x - 2, j) === "=" || g.get(x - 1, j) === "=") cand.push([x, j]); if (g.get(x + bw + 1, j) === "=" || g.get(x + bw, j) === "=") cand.push([x + bw - 1, j]); }
    if (!cand.length) continue;
    door = cand[ri(r, 0, cand.length - 1)];
    g.rect(x, y, bw, bh, "#");
    g.rect(x + 1, y + 1, bw - 2, bh - 2, "b");
    g.set(door[0], door[1], "+");
    const name = shopNames[buildings.length % shopNames.length];
    buildings.push({ x, y, w: bw, h: bh, name });
    labels.push({ x: x + 1, y: y + 1, text: name, public: true });
  }
  for (let k = 0; k < 25; k++) { const x = ri(r, 0, w - 1), y = ri(r, 0, hh - 1); if (g.get(x, y) === ",") g.set(x, y, r() < 0.7 ? "T" : "f"); }
  return { w, h: hh, cells: g.str(), rooms: buildings.map((b, i) => ({ ...b, n: i + 1 })), labels, theme: "town" };
}

function genTavern(r, w = 32, hh = 24) {
  const g = new Grid(w, hh, ",");
  const bx = 2, by = 2, bw = w - 4, bh = hh - 4;
  g.rect(bx, by, bw, bh, "#");
  g.rect(bx + 1, by + 1, bw - 2, bh - 2, "b");
  // kitchen and back rooms along the top
  const split = by + ri(r, 6, 8);
  for (let x = bx; x < bx + bw; x++) g.set(x, split, "#");
  const kitchenW = ri(r, 7, 10);
  for (let y = by; y < split; y++) g.set(bx + kitchenW, y, "#");
  for (let y = by; y < split; y++) g.set(bx + kitchenW + 8, y, "#");
  g.set(bx + 3, split, "+"); g.set(bx + kitchenW + 4, split, "+"); g.set(bx + kitchenW + 11, split, "+");
  // bar counter
  const barY = split + 2;
  for (let x = bx + 2; x < bx + kitchenW + 2; x++) g.set(x, barY, "t");
  // tables in common room
  for (let k = 0; k < 9; k++) {
    const x = ri(r, bx + 3, bx + bw - 5), y = ri(r, barY + 2, by + bh - 4);
    if (g.get(x, y) === "b" && g.get(x + 1, y) === "b") { g.set(x, y, "t"); g.set(x + 1, y, "t"); }
  }
  g.set(bx + bw - 3, by + bh - 3, "S"); g.set(bx + bw - 2, by + 1, "S");
  // fireplace + front door
  g.set(bx, by + bh - 6, "p");
  g.set(bx + (bw >> 1), by + bh - 1, "+");
  g.set(bx + bw - 1, barY + 2, "+");
  // street outside
  g.rect(0, hh - 2, w, 2, "=");
  const labels = [
    { x: bx + 1, y: by + 1, text: "Kitchen", public: true },
    { x: bx + kitchenW + 1, y: by + 1, text: "Storeroom", public: false },
    { x: bx + kitchenW + 9, y: by + 1, text: "Private room", public: true },
    { x: bx + 2, y: barY + 1, text: "Bar", public: true },
    { x: bx + bw - 6, y: by + bh - 3, text: "Stairs up", public: true },
  ];
  return { w, h: hh, cells: g.str(), rooms: [], labels, theme: "tavern" };
}

export function generateMap(type, seed = Math.floor(Math.random() * 1e9), opts = {}) {
  const r = rng(seed);
  const gen = { dungeon: genDungeon, cave: genCave, wilderness: genWilderness, town: genTown, tavern: genTavern }[type] || genDungeon;
  const m = gen(r, opts.w, opts.h, opts);
  return { ...m, seed, fog: "0".repeat(m.w * m.h), tokens: [], name: opts.name || MAP_TYPES[type] || "Map" };
}

// ---------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------
export const pf2Distance = (dx, dy) => {
  const a = Math.abs(dx), b = Math.abs(dy);
  const d = Math.min(a, b), s = Math.max(a, b) - d;
  return 5 * (s + d + Math.floor(d / 2)); // every second diagonal costs 10 ft
};

const blocksSight = (ch) => ch === "#" || ch === " " || ch === "T" || ch === "p" || ch === "+" || ch === "r";

export function visibleFrom(map, ox, oy, radius) {
  const out = new Set();
  for (let y = oy - radius; y <= oy + radius; y++) for (let x = ox - radius; x <= ox + radius; x++) {
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
    if (Math.hypot(x - ox, y - oy) > radius + 0.5) continue;
    // Bresenham line, stop at the first blocker (the blocker itself is visible)
    let x0 = ox, y0 = oy, ok = true;
    const dx = Math.abs(x - x0), dy = -Math.abs(y - y0), sx = x0 < x ? 1 : -1, sy = y0 < y ? 1 : -1;
    let err = dx + dy;
    while (!(x0 === x && y0 === y)) {
      if (!(x0 === ox && y0 === oy) && blocksSight(map.cells[y0 * map.w + x0])) { ok = false; break; }
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    if (ok) out.add(y * map.w + x);
  }
  return out;
}

export function roomCells(map, x, y) {
  // flood fill across non-blocking cells, not passing through doors, then include bordering walls
  const start = y * map.w + x;
  const passable = (i) => !blocksSight(map.cells[i]);
  const out = new Set();
  if (!passable(start)) return out;
  const stack = [start];
  out.add(start);
  while (stack.length && out.size < 2500) {
    const k = stack.pop();
    const kx = k % map.w, ky = Math.floor(k / map.w);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = kx + dx, ny = ky + dy;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const nk = ny * map.w + nx;
      if (out.has(nk)) continue;
      out.add(nk);
      if (passable(nk)) stack.push(nk);
    }
  }
  return out;
}

// ---------------------------------------------------------------
// Canvas view with tools
// ---------------------------------------------------------------
export function createMapView({ isDM, mySlot = null, onTokenMove, onFog, onPaint, onTokenAdd, onTokenClick, onLabelAdd }) {
  let map = null;
  let cs = 26;
  let tool = "move";
  let brush = ".";
  let drag = null;
  let painting = false;
  let paintBuffer = new Set();
  let hover = null;
  let suppressFog = false;
  const canvas = h("canvas", { class: "map-canvas" });
  const ctx = canvas.getContext("2d");
  const wrap = h("div", { class: "map-wrap" }, canvas);
  const status = h("span", { class: "map-status muted" });

  const toolDefs = isDM
    ? [["move", "✋ Move"], ["reveal", "☀ Reveal"], ["hide", "☾ Hide"], ["room", "▣ Reveal room"], ["paint", "✎ Paint"], ["token", "● Add token"], ["label", "🏷 Label"], ["measure", "📏 Measure"]]
    : [["move", "✋ Move my token"], ["measure", "📏 Measure"]];
  const toolbar = h("div", { class: "map-toolbar" });
  const brushSel = select(Object.entries(TERRAIN).filter(([k]) => k !== "?").map(([k, v]) => ({ value: k, label: `${k === " " ? "␣" : k}  ${v.name}` })), brush, (v) => { brush = v; });
  const drawToolbar = () => {
    clear(toolbar);
    for (const [id, label] of toolDefs) toolbar.append(h("button", { class: tool === id ? "active small" : "small", onclick: () => { tool = id; drawToolbar(); } }, label));
    if (tool === "paint") toolbar.append(brushSel);
    toolbar.append(h("span", { class: "spacer" }),
      h("button", { class: "small", onclick: () => { cs = Math.max(10, cs - 4); draw(); } }, "−"),
      h("button", { class: "small", onclick: () => { cs = Math.min(60, cs + 4); draw(); } }, "+"), status);
  };
  drawToolbar();

  function cellAt(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((ev.clientX - rect.left) / cs), y = Math.floor((ev.clientY - rect.top) / cs);
    if (!map || x < 0 || y < 0 || x >= map.w || y >= map.h) return null;
    return { x, y, i: y * map.w + x };
  }
  const tokenAt = (x, y) => map.tokens.slice().reverse().find((t) => x >= t.x && x < t.x + (t.size || 1) && y >= t.y && y < t.y + (t.size || 1));

  canvas.addEventListener("pointerdown", (ev) => {
    const c = cellAt(ev);
    if (!c) return;
    canvas.setPointerCapture(ev.pointerId);
    if (tool === "move") {
      const t = tokenAt(c.x, c.y);
      if (t && (isDM || t.slot === mySlot)) drag = { t, from: { x: t.x, y: t.y }, to: c };
      else if (t && onTokenClick) onTokenClick(t);
    } else if (tool === "measure") {
      drag = { measure: true, from: c, to: c };
    } else if (tool === "reveal" || tool === "hide" || tool === "paint") {
      painting = true; paintBuffer = new Set(); applyBrush(c);
    } else if (tool === "room") {
      const cells = roomCells(map, c.x, c.y);
      if (cells.size) onFog && onFog([...cells], true);
    } else if (tool === "token") {
      onTokenAdd && onTokenAdd(c.x, c.y);
    } else if (tool === "label") {
      onLabelAdd && onLabelAdd(c.x, c.y);
    }
  });
  canvas.addEventListener("pointermove", (ev) => {
    const c = cellAt(ev);
    hover = c;
    if (c && map) {
      const ch = map.cells[c.i];
      status.textContent = `${c.x},${c.y} · ${TERRAIN[ch]?.name || ""}`;
    }
    if (drag && c) { drag.to = c; draw(); }
    else if (painting && c) applyBrush(c);
  });
  canvas.addEventListener("pointerup", () => {
    if (drag && drag.t && (drag.to.x !== drag.from.x || drag.to.y !== drag.from.y)) {
      const t = drag.t;
      t.x = drag.to.x; t.y = drag.to.y;
      onTokenMove && onTokenMove(t, drag.to.x, drag.to.y);
    }
    if (painting) {
      painting = false;
      if (tool === "paint") onPaint && onPaint(map);
      else onFog && onFog([...paintBuffer], tool === "reveal");
    }
    drag = null;
    draw();
  });

  function applyBrush(c) {
    const rad = tool === "paint" ? 0 : 1;
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const x = c.x + dx, y = c.y + dy;
      if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
      const i = y * map.w + x;
      paintBuffer.add(i);
      if (tool === "paint") map.cells = map.cells.slice(0, i) + brush + map.cells.slice(i + 1);
      else map.fog = map.fog.slice(0, i) + (tool === "reveal" ? "1" : "0") + map.fog.slice(i + 1);
    }
    draw();
  }

  function draw() {
    if (!map) { canvas.width = 10; canvas.height = 10; return; }
    canvas.width = map.w * cs; canvas.height = map.h * cs;
    ctx.font = `${Math.max(9, cs * 0.42)}px system-ui, sans-serif`;
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const ch = map.cells[y * map.w + x];
      const t = TERRAIN[ch] || TERRAIN["."];
      const px = x * cs, py = y * cs;
      ctx.fillStyle = t.color;
      ctx.fillRect(px, py, cs, cs);
      if (ch === "T") { ctx.fillStyle = "#1f4223"; ctx.beginPath(); ctx.arc(px + cs / 2, py + cs / 2, cs * 0.42, 0, 7); ctx.fill(); ctx.fillStyle = "#3f7a3c"; ctx.beginPath(); ctx.arc(px + cs * 0.45, py + cs * 0.42, cs * 0.22, 0, 7); ctx.fill(); }
      else if (ch === "+") { ctx.fillStyle = "#c9c0ad"; ctx.fillRect(px, py, cs, cs); ctx.fillStyle = "#7a4a1f"; ctx.fillRect(px + cs * 0.15, py + cs * 0.15, cs * 0.7, cs * 0.7); ctx.fillStyle = "#d9a34a"; ctx.fillRect(px + cs * 0.6, py + cs * 0.45, cs * 0.1, cs * 0.1); }
      else if (ch === "S") { ctx.strokeStyle = "#5e5440"; for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(px, py + (k * cs) / 4); ctx.lineTo(px + cs, py + (k * cs) / 4); ctx.stroke(); } }
      else if (ch === "^") { ctx.fillStyle = "#6a6052"; for (let k = 0; k < 3; k++) ctx.fillRect(px + ((x * 7 + k * 11) % (cs - 6)), py + ((y * 5 + k * 13) % (cs - 6)), 5, 4); }
      else if (ch === "p" || ch === "r") { ctx.fillStyle = "#c9c0ad"; if (ch === "r") ctx.fillStyle = TERRAIN[map.theme === "cave" ? "c" : ","].color; ctx.fillRect(px, py, cs, cs); ctx.fillStyle = ch === "p" ? "#5d5750" : "#6d6962"; ctx.beginPath(); ctx.arc(px + cs / 2, py + cs / 2, cs * 0.38, 0, 7); ctx.fill(); }
      else if (ch === "t") { ctx.fillStyle = "#b48a5c"; ctx.fillRect(px, py, cs, cs); ctx.fillStyle = "#6e4a2a"; ctx.fillRect(px + 2, py + 2, cs - 4, cs - 4); }
      else if (ch === "f") { ctx.fillStyle = "#47703a"; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(px + cs * (0.25 + k * 0.25), py + cs * (0.3 + (k % 2) * 0.35), cs * 0.12, 0, 7); ctx.fill(); } }
      else if (ch === "~" || ch === "w") { ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.beginPath(); ctx.moveTo(px + 3, py + cs / 2); ctx.quadraticCurveTo(px + cs / 2, py + cs / 3, px + cs - 3, py + cs / 2); ctx.stroke(); }
      if (ch !== "?" && ch !== " ") { ctx.strokeStyle = "rgba(0,0,0,.12)"; ctx.strokeRect(px + 0.5, py + 0.5, cs, cs); }
      if (isDM && !suppressFog && map.fog[y * map.w + x] !== "1") { ctx.fillStyle = "rgba(10,10,30,.45)"; ctx.fillRect(px, py, cs, cs); }
    }
    // labels
    for (const l of map.labels || []) {
      ctx.fillStyle = l.public ? "rgba(255,255,240,.85)" : "rgba(255,220,120,.9)";
      const tw = ctx.measureText(l.text).width + 6;
      ctx.fillRect(l.x * cs, l.y * cs, tw, cs * 0.6);
      ctx.fillStyle = "#222";
      ctx.fillText(l.text, l.x * cs + 3, l.y * cs + cs * 0.45);
    }
    // tokens
    for (const t of map.tokens) {
      const size = t.size || 1;
      const tx = (drag?.t === t ? drag.to.x : t.x) * cs, ty = (drag?.t === t ? drag.to.y : t.y) * cs;
      ctx.globalAlpha = t.hidden ? 0.45 : 1;
      ctx.fillStyle = t.color || "#c33";
      ctx.beginPath(); ctx.arc(tx + (cs * size) / 2, ty + (cs * size) / 2, cs * size * 0.42, 0, 7); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = t.kind === "pc" ? "#fff" : t.kind === "ally" ? "#9f9" : "#300";
      if (t.hidden) ctx.setLineDash([3, 3]);
      ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText((t.label || "?").slice(0, size > 1 ? 6 : 2), tx + (cs * size) / 2, ty + (cs * size) / 2 + cs * 0.15);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }
    // drag / measure overlay
    if (drag) {
      const a = drag.t ? drag.from : drag.from, b = drag.to;
      ctx.strokeStyle = "#ff0"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(a.x * cs + cs / 2, a.y * cs + cs / 2); ctx.lineTo(b.x * cs + cs / 2, b.y * cs + cs / 2); ctx.stroke();
      ctx.lineWidth = 1;
      const ft = pf2Distance(b.x - a.x, b.y - a.y);
      ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.fillRect(b.x * cs + cs, b.y * cs - 4, 56, 20);
      ctx.fillStyle = "#ff0"; ctx.fillText(`${ft} ft`, b.x * cs + cs + 4, b.y * cs + 11);
    }
  }

  return {
    el: h("div", { class: "map-view" }, toolbar, wrap),
    setMap(m) { map = m ? { ...m, tokens: m.tokens.map((t) => ({ ...t })) } : null; if (!drag && !painting) draw(); },
    get map() { return map; },
    setSlot(v) { mySlot = v; },
    redraw: draw,
    snapshot(x0, y0, w, hh, scale = 20) {
      // render part of the current map to a data URL (for map-fragment handouts)
      const old = cs; cs = scale; suppressFog = true; draw();
      const c2 = document.createElement("canvas"); c2.width = w * cs; c2.height = hh * cs;
      c2.getContext("2d").drawImage(canvas, x0 * cs, y0 * cs, w * cs, hh * cs, 0, 0, w * cs, hh * cs);
      cs = old; suppressFog = false; draw();
      return c2.toDataURL("image/png");
    },
  };
}
