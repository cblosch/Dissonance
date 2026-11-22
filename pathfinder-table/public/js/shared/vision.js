// Distance and line of sight on the square grid (shared by the map view and the game engine).
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

