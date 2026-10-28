import * as THREE from 'three';
import * as Audio from './audio.js';
import {
  STAFF, LEVELS, isLine, scaleOf, noteName, midiOf, freqOf, dissonantAccidentals,
} from './music.js';

// ---------- Constants ----------
const FLOOR_GAP = 4;
const ARENA = 26;           // half-width of each floor
const EYE = 1.5;            // camera height above the floor
const HEAD_Y = 1.3;         // note head height above the floor
const PLAYER_RADIUS = 0.6;
const WALK = 7;
const SPRINT = 11;
const FIRE_COOLDOWN = 0.2;
const SHOT_SPEED = 32;
const SHOT_LIFE = 1.4;
const ENEMY_HP = 3;
const CONTACT_DPS = 22;
const WRONG_NOTE_PENALTY = 12;
const PICKUP_RESPAWN = 9;
const SHIFT_TIME = 0.4;

const COLORS = {
  player: 0x5ff3ff,
  bad: 0xff3d6e,
  good: 0xffd36b,
  sharp: 0xffb347,
  flat: 0x7aa8ff,
  line: 0x66e0ff,
  space: 0x8a7dff,
};

const floorY = (i) => i * FLOOR_GAP;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const overlay = $('overlay');
const card = $('card');
const hud = $('hud');
const staffCtx = $('staff-map').getContext('2d');

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05040f);
scene.fog = new THREE.Fog(0x05040f, 18, 75);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);

scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x1a0f30, 0.9));
const playerLight = new THREE.PointLight(COLORS.player, 18, 14, 1.6);
scene.add(playerLight);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Helpers: text textures and note meshes ----------
function textTexture(text, { color = '#ffffff', font = 'bold 120px "DejaVu Sans", sans-serif', w = 256, h = 256 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 24;
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function textSprite(text, color, size = 1.4, wide = false) {
  const tex = textTexture(text, { color, w: wide ? 512 : 256, h: 256 });
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(size * (wide ? 2 : 1), size, 1);
  return s;
}

const headGeo = new THREE.SphereGeometry(0.45, 24, 16);
const stemGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.1, 8);
const auraGeo = new THREE.IcosahedronGeometry(0.85, 0);
const haloGeo = new THREE.TorusGeometry(0.75, 0.04, 8, 32);

function makeNoteMesh(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.2,
  });
  const head = new THREE.Mesh(headGeo, mat);
  head.scale.set(1.3, 0.95, 0.95);
  head.rotation.z = 0.4;
  group.add(head);
  const stem = new THREE.Mesh(stemGeo, mat);
  stem.position.set(0.52, 1.05, 0);
  group.add(stem);
  return { group, head, mat };
}

// ---------- Static world: the staff ----------
const floors = [];
(function buildStaff() {
  for (let i = 0; i < STAFF.length; i++) {
    const y = floorY(i);
    const line = isLine(i);
    const color = line ? COLORS.line : COLORS.space;

    const planeMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: line ? 0.05 : 0.025, side: THREE.DoubleSide, depthWrite: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = y;
    scene.add(plane);

    const grid = new THREE.GridHelper(ARENA * 2, line ? 13 : 13, color, color);
    grid.material.transparent = true;
    grid.material.opacity = line ? 0.3 : 0.1;
    grid.material.depthWrite = false;
    grid.position.y = y + 0.01;
    scene.add(grid);

    // Bright border so each line of the staff reads as a "line"
    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(ARENA * 2, 0.001, ARENA * 2)),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: line ? 0.9 : 0.35 }),
    );
    border.position.y = y;
    scene.add(border);

    floors.push({ planeMat, grid, border, line });
  }

  // Bar lines: tall glowing pillars marking the measure
  const barMat = new THREE.MeshBasicMaterial({ color: 0xcfd6ff, transparent: true, opacity: 0.55 });
  const height = floorY(STAFF.length - 1) + 8;
  for (const x of [-ARENA, ARENA]) {
    for (const z of [-ARENA, ARENA]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.4, height, 0.4), barMat);
      bar.position.set(x, height / 2 - 2, z);
      scene.add(bar);
    }
  }

  // Starfield
  const starGeo = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i < 1500; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(rand(120, 220));
    pts.push(v.x, v.y + 16, v.z);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xb8c4ff, size: 0.7, fog: false })));
})();

function highlightFloor(idx) {
  floors.forEach((f, i) => {
    const on = i === idx;
    f.planeMat.opacity = on ? 0.12 : (f.line ? 0.05 : 0.025);
    f.grid.material.opacity = on ? 0.55 : (f.line ? 0.3 : 0.1);
  });
}

// ---------- First-person "hand": your own note ----------
const held = makeNoteMesh(COLORS.player);
held.group.scale.setScalar(0.14);
held.group.position.set(0.5, -0.42, -1.1);
held.group.visible = false;
held.group.rotation.y = -0.3;
camera.add(held.group);

// ---------- Game state ----------
const state = {
  mode: 'title',        // title | playing | paused | between | over
  levelIndex: 0,
  level: null,
  scale: null,
  floor: 4,
  harmony: 100,
  sharps: 0,
  flats: 0,
  yaw: 0,
  pitch: 0,
  fireTimer: 0,
  shift: null,          // { from, to, t }
  hurtTimer: 0,
  contactSoundTimer: 0,
  recoil: 0,
};

let levelGroup = new THREE.Group();
scene.add(levelGroup);
let enemies = [];
let pickups = [];
let obstacles = [];
let shots = [];
let particles = [];
let respawnQueue = [];

const keys = {};
let pointerLocked = false;
let lockFallback = false;
let dragging = false;

// ---------- Level construction ----------
function buildLevel(index) {
  scene.remove(levelGroup);
  for (const e of enemies) if (e.hum) Audio.stopHum(e.hum);
  levelGroup = new THREE.Group();
  scene.add(levelGroup);
  enemies = []; pickups = []; obstacles = []; shots = []; particles = []; respawnQueue = [];

  const level = LEVELS[index];
  state.level = level;
  state.scale = scaleOf(level);
  state.floor = level.startFloor;
  state.harmony = 100;
  state.sharps = 1;
  state.flats = 1;
  state.shift = null;
  state.yaw = 0;
  state.pitch = 0;

  camera.position.set(0, floorY(state.floor) + EYE, ARENA - 4);

  // Floor name signs on the walls of the measure
  for (let i = 0; i < STAFF.length; i++) {
    const name = noteName(STAFF[i].letter, state.scale.sig[STAFF[i].letter] || 0, STAFF[i].octave);
    const color = isLine(i) ? '#66e0ff' : '#a99dff';
    for (const [x, z] of [[0, -ARENA], [0, ARENA], [-ARENA, 0], [ARENA, 0]]) {
      const s = textSprite(name, color, 2.2, true);
      s.position.set(x, floorY(i) + 2.4, z);
      levelGroup.add(s);
    }
  }

  // Obstacles: big blocky rests scattered on each floor
  const obsMat = new THREE.MeshStandardMaterial({ color: 0x1b1840, emissive: 0x231d5c, emissiveIntensity: 0.6, roughness: 0.8 });
  for (let i = 0; i < STAFF.length; i++) {
    const count = randInt(3, 5);
    for (let k = 0; k < count; k++) {
      const w = rand(2, 4.5), d = rand(1.2, 3), h = rand(1.6, 3.2);
      const x = rand(-ARENA + 5, ARENA - 5), z = rand(-ARENA + 5, ARENA - 9);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), obsMat);
      mesh.position.set(x, floorY(i) + h / 2, z);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({ color: isLine(i) ? COLORS.line : COLORS.space, transparent: true, opacity: 0.6 }),
      );
      mesh.add(edges);
      levelGroup.add(mesh);
      obstacles.push({ floor: i, maxY: floorY(i) + h, minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    }
  }

  // Dissonant notes, spread across the staff
  const floorsAllowed = [];
  for (let i = level.minFloor; i <= level.maxFloor; i++) floorsAllowed.push(i);
  for (let k = 0; k < level.dissonant; k++) {
    const f = k === 0 ? level.startFloor : floorsAllowed[randInt(0, floorsAllowed.length - 1)];
    spawnNote(f, true);
  }
  for (let k = 0; k < level.consonant; k++) {
    spawnNote(floorsAllowed[randInt(0, floorsAllowed.length - 1)], false);
  }

  // Pickups: one of each near the start, the rest scattered
  spawnPickup('sharp', level.startFloor);
  spawnPickup('flat', level.startFloor);
  for (let k = 0; k < level.pickups; k++) spawnRandomPickup();

  highlightFloor(state.floor);
  Audio.setDrone(freqOf(state.scale.tonicMidi - 24), freqOf(state.scale.tonicMidi - 17));
  updateHud();
}

function freeSpot(floor, avoidPlayer = true) {
  for (let tries = 0; tries < 60; tries++) {
    const x = rand(-ARENA + 2, ARENA - 2), z = rand(-ARENA + 2, ARENA - 2);
    if (obstacles.some((o) => o.floor === floor && x > o.minX - 1.2 && x < o.maxX + 1.2 && z > o.minZ - 1.2 && z < o.maxZ + 1.2)) continue;
    if (avoidPlayer && floor === state.floor && Math.hypot(x - camera.position.x, z - camera.position.z) < 12) continue;
    return new THREE.Vector3(x, 0, z);
  }
  return new THREE.Vector3(0, 0, 0);
}

function spawnNote(floor, dissonant) {
  const { letter, octave } = STAFF[floor];
  const sigAcc = state.scale.sig[letter] || 0;
  let acc = sigAcc;
  if (dissonant) {
    const options = dissonantAccidentals(letter, state.scale);
    acc = options[randInt(0, options.length - 1)];
  }
  const color = dissonant ? COLORS.bad : COLORS.good;
  const note = makeNoteMesh(color);
  const pos = freeSpot(floor);
  note.group.position.set(pos.x, floorY(floor) + HEAD_Y, pos.z);

  // Show naturals explicitly when they cancel the key signature
  const showNatural = dissonant && acc === 0 && sigAcc !== 0;
  const label = textSprite(noteName(letter, acc, null, showNatural), dissonant ? '#ff5c86' : '#ffd36b', 1.3);
  label.position.set(-0.4, 1.95, 0);
  note.group.add(label);

  let aura = null;
  if (dissonant) {
    aura = new THREE.Mesh(auraGeo, new THREE.MeshBasicMaterial({ color: COLORS.bad, wireframe: true, transparent: true, opacity: 0.55 }));
    note.group.add(aura);
  } else {
    aura = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: COLORS.good, transparent: true, opacity: 0.6 }));
    aura.rotation.x = Math.PI / 2;
    aura.position.y = 0.7;
    note.group.add(aura);
  }

  levelGroup.add(note.group);
  const midi = midiOf(letter, acc, octave);
  const enemy = {
    ...note, label, aura, floor, letter, octave, acc, dissonant, midi,
    hp: ENEMY_HP, alive: true, resolveT: 0, flash: 0,
    target: freeSpot(floor, false), wobble: Math.random() * 10,
    hopTimer: rand(6, 12), hop: null,
    hum: dissonant ? Audio.createHum(freqOf(midi)) : null,
  };
  enemies.push(enemy);
}

function spawnPickup(kind, floor) {
  const color = kind === 'sharp' ? '#ffb347' : '#7aa8ff';
  const tex = textTexture(kind === 'sharp' ? '♯' : '♭', { color, font: 'bold 200px "DejaVu Sans", sans-serif' });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.6),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.85, 32),
    new THREE.MeshBasicMaterial({ color: kind === 'sharp' ? COLORS.sharp : COLORS.flat, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  const group = new THREE.Group();
  group.add(mesh);
  ring.position.y = -1.0;
  group.add(ring);
  const pos = freeSpot(floor, false);
  if (floor === state.floor && Math.hypot(pos.x - camera.position.x, pos.z - camera.position.z) < 3) pos.x += 5;
  group.position.set(pos.x, floorY(floor) + 1.3, pos.z);
  levelGroup.add(group);
  pickups.push({ group, mesh, kind, floor, phase: Math.random() * 6 });
}

function spawnRandomPickup() {
  const level = state.level;
  const floor = randInt(level.minFloor, level.maxFloor);
  // Sharps are useless on the top floor, flats on the bottom one
  let kind = Math.random() < 0.5 ? 'sharp' : 'flat';
  if (floor === STAFF.length - 1) kind = 'flat';
  if (floor === 0) kind = 'sharp';
  spawnPickup(kind, floor);
}

// ---------- Input ----------
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (state.mode !== 'playing') return;
  if (e.code === 'KeyE') shiftFloor(1);
  if (e.code === 'KeyQ') shiftFloor(-1);
  if (e.code === 'KeyM') Audio.toggleMute();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

window.addEventListener('wheel', (e) => {
  if (state.mode !== 'playing') return;
  if (e.deltaY < 0) shiftFloor(1);
  else if (e.deltaY > 0) shiftFloor(-1);
}, { passive: true });

canvas.addEventListener('mousedown', (e) => {
  if (state.mode !== 'playing') return;
  if (!pointerLocked && !lockFallback) requestLock();
  dragging = true;
  if (e.button === 0) fire();
});
window.addEventListener('mouseup', () => { dragging = false; });

window.addEventListener('mousemove', (e) => {
  if (state.mode !== 'playing') return;
  if (!pointerLocked && !(lockFallback && dragging)) return;
  state.yaw -= e.movementX * 0.0022;
  state.pitch = clamp(state.pitch - e.movementY * 0.0022, -1.4, 1.4);
});

function requestLock() {
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => { lockFallback = true; });
  } catch {
    lockFallback = true;
  }
}

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (!pointerLocked && state.mode === 'playing' && !lockFallback) pause();
});
document.addEventListener('pointerlockerror', () => { lockFallback = true; });

// ---------- Actions ----------
function shiftFloor(dir) {
  if (state.shift) return;
  const to = state.floor + dir;
  const name = dir > 0 ? 'sharp' : 'flat';
  const have = dir > 0 ? state.sharps : state.flats;
  if (to < 0 || to >= STAFF.length) { toast(dir > 0 ? 'Already at the top of the staff' : 'Already at the bottom of the staff'); return; }
  if (have <= 0) { toast(`No ${name}s! Find a ${dir > 0 ? '♯' : '♭'}`); Audio.buzz(); return; }
  if (dir > 0) state.sharps--; else state.flats--;
  const fromF = freqOf(playerMidi());
  state.shift = { from: state.floor, to, t: 0 };
  state.floor = to;
  Audio.glide(fromF, freqOf(playerMidi()), SHIFT_TIME);
  highlightFloor(to);
  updateHud();
}

function playerMidi() {
  const { letter, octave } = STAFF[state.floor];
  return midiOf(letter, state.scale.sig[letter] || 0, octave);
}

function fire() {
  if (state.fireTimer > 0 || state.shift) return;
  state.fireTimer = FIRE_COOLDOWN;
  state.recoil = 1;
  Audio.pluck(freqOf(playerMidi()));

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.position.clone().add(dir.clone().multiplyScalar(0.8));
  origin.y -= 0.2;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 8),
    new THREE.MeshBasicMaterial({ color: COLORS.player }),
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.035, 6, 20),
    new THREE.MeshBasicMaterial({ color: COLORS.player, transparent: true, opacity: 0.7 }),
  );
  mesh.add(ring);
  mesh.position.copy(origin);
  mesh.lookAt(origin.clone().add(dir));
  levelGroup.add(mesh);
  shots.push({ mesh, ring, vel: dir.multiplyScalar(SHOT_SPEED), life: SHOT_LIFE, floor: state.floor });
}

function burst(pos, color, count = 14, speed = 5) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), mat.clone());
    m.position.copy(pos);
    levelGroup.add(m);
    particles.push({ mesh: m, vel: new THREE.Vector3().randomDirection().multiplyScalar(rand(1, speed)), life: rand(0.5, 0.9), max: 0.9 });
  }
}

function hitEnemy(e, shotPos) {
  if (!e.dissonant) {
    // Shot a note that belongs in the key
    state.harmony -= WRONG_NOTE_PENALTY;
    e.flash = 0.3;
    Audio.wrongNote(freqOf(playerMidi()), freqOf(e.midi));
    toast(`${noteName(e.letter, e.acc)} belongs in ${state.level.key}! Leave gold notes alone.`);
    burst(shotPos, COLORS.good, 6, 3);
    return;
  }
  e.hp--;
  e.flash = 0.15;
  Audio.pluck(freqOf(e.midi), 0.12, 'sawtooth');
  burst(shotPos, COLORS.bad, 6, 3);
  if (e.hp <= 0) resolveEnemy(e);
}

function resolveEnemy(e) {
  e.alive = false;
  e.resolveT = 0;
  Audio.stopHum(e.hum);
  e.hum = null;
  // Resolve the wrong note to its in-key spelling: F♯ in C major glides down to F
  const sigAcc = state.scale.sig[e.letter] || 0;
  const target = midiOf(e.letter, sigAcc, e.octave);
  Audio.resolveGlide(freqOf(e.midi), freqOf(target), freqOf(playerMidi()));
  e.mat.transparent = true;
  e.mat.needsUpdate = true;
  e.mat.color.set(COLORS.good);
  e.mat.emissive.set(COLORS.good);
  e.aura.visible = false;
  e.label.material.map = textTexture(noteName(e.letter, sigAcc), { color: '#ffd36b' });
  burst(e.group.position, COLORS.good, 22, 7);
  toast(`Resolved ${noteName(e.letter, e.acc, null, e.acc === 0)} → ${noteName(e.letter, sigAcc)}`);
  updateHud();

  if (remainingDissonant() === 0) {
    const index = state.levelIndex;
    setTimeout(() => { if (state.levelIndex === index && remainingDissonant() === 0) levelComplete(); }, 1200);
  }
}

const remainingDissonant = () => enemies.filter((e) => e.dissonant && e.alive).length;

// ---------- Update ----------
const tmp = new THREE.Vector3();

function pushOut(pos, radius, floor) {
  for (const o of obstacles) {
    if (o.floor !== floor) continue;
    const cx = clamp(pos.x, o.minX, o.maxX);
    const cz = clamp(pos.z, o.minZ, o.maxZ);
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // Center is inside the box: push out along the shallowest axis
      const pen = [pos.x - o.minX, o.maxX - pos.x, pos.z - o.minZ, o.maxZ - pos.z];
      const m = pen.indexOf(Math.min(...pen));
      if (m === 0) pos.x = o.minX - radius;
      if (m === 1) pos.x = o.maxX + radius;
      if (m === 2) pos.z = o.minZ - radius;
      if (m === 3) pos.z = o.maxZ + radius;
    }
  }
  pos.x = clamp(pos.x, -ARENA + radius, ARENA - radius);
  pos.z = clamp(pos.z, -ARENA + radius, ARENA - radius);
}

function updatePlayer(dt) {
  camera.rotation.set(state.pitch, state.yaw, 0);

  const forward = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const move = new THREE.Vector3();
  if (keys.KeyW || keys.ArrowUp) move.add(forward);
  if (keys.KeyS || keys.ArrowDown) move.sub(forward);
  if (keys.KeyD || keys.ArrowRight) move.add(right);
  if (keys.KeyA || keys.ArrowLeft) move.sub(right);
  const moving = move.lengthSq() > 0;
  if (moving) move.normalize().multiplyScalar((keys.ShiftLeft || keys.ShiftRight ? SPRINT : WALK) * dt);
  camera.position.add(move);
  pushOut(camera.position, PLAYER_RADIUS, state.floor);

  // Vertical: either easing between floors or bobbing gently on one
  let y = floorY(state.floor) + EYE;
  if (state.shift) {
    state.shift.t += dt / SHIFT_TIME;
    const t = Math.min(state.shift.t, 1);
    const ease = t * t * (3 - 2 * t);
    y = floorY(state.shift.from) + EYE + (floorY(state.shift.to) - floorY(state.shift.from)) * ease;
    if (t >= 1) state.shift = null;
  } else if (moving) {
    y += Math.sin(performance.now() * 0.012) * 0.04;
  }
  camera.position.y = y;

  playerLight.position.copy(camera.position);
  state.fireTimer = Math.max(0, state.fireTimer - dt);
  state.recoil = Math.max(0, state.recoil - dt * 6);
  held.group.position.z = -1.1 + state.recoil * 0.12;
  held.group.rotation.x = state.recoil * 0.4;
}

function updateEnemies(dt, time) {
  let touching = false;
  const px = camera.position.x, pz = camera.position.z;

  for (const e of enemies) {
    const g = e.group;
    if (!e.alive) {
      // Resolved notes float up and fade out
      e.resolveT += dt;
      g.position.y += dt * 1.6;
      g.rotation.y += dt * 2;
      const fade = 1 - e.resolveT / 1.6;
      e.mat.opacity = Math.max(0, fade);
      e.label.material.opacity = Math.max(0, fade);
      if (fade <= 0) { levelGroup.remove(g); e.removed = true; }
      continue;
    }

    const baseY = floorY(e.floor) + HEAD_Y;
    const sameFloor = e.floor === state.floor && !state.shift;
    const dist = Math.hypot(g.position.x - px, g.position.z - pz);

    // Movement target
    let speed = e.dissonant ? state.level.speed * 0.45 : 1.2;
    let tx = e.target.x, tz = e.target.z;
    if (e.dissonant && sameFloor && dist < 24) {
      tx = px; tz = pz; speed = state.level.speed;
    } else if (Math.hypot(g.position.x - tx, g.position.z - tz) < 1) {
      e.target = freeSpot(e.floor, false);
    }
    tmp.set(tx - g.position.x, 0, tz - g.position.z);
    const len = tmp.length();
    if (len > 0.9) {
      tmp.multiplyScalar(Math.min(speed * dt, len - 0.9) / len);
      g.position.add(tmp);
    }
    pushOut(g.position, 0.7, e.floor);

    // Chromatic hops: dissonant notes slide one step toward your floor
    if (e.dissonant && state.level.hops && !e.hop) {
      e.hopTimer -= dt;
      if (e.hopTimer <= 0) {
        e.hopTimer = rand(7, 13);
        if (e.floor !== state.floor && Math.random() < 0.6) {
          const to = e.floor + Math.sign(state.floor - e.floor);
          e.hop = { from: e.floor, t: 0 };
          retuneEnemy(e, to);
        }
      }
    }
    if (e.hop) {
      e.hop.t += dt / 0.8;
      const t = Math.min(e.hop.t, 1);
      g.position.y = floorY(e.hop.from) + HEAD_Y + (baseY - floorY(e.hop.from) - HEAD_Y) * t;
      if (t >= 1) e.hop = null;
    } else {
      g.position.y = baseY + Math.sin(time * 2 + e.wobble) * 0.12;
    }

    // Face the player
    g.rotation.y = Math.atan2(px - g.position.x, pz - g.position.z);

    // Dissonant notes jitter and their aura spins; consonant ones glow calmly
    if (e.dissonant) {
      e.head.position.set(rand(-0.05, 0.05), rand(-0.05, 0.05), 0);
      e.aura.rotation.x += dt * 1.7;
      e.aura.rotation.y += dt * 2.3;
      e.aura.scale.setScalar(1 + Math.sin(time * 9 + e.wobble) * 0.08);
    } else {
      e.aura.rotation.z += dt;
    }
    e.flash = Math.max(0, e.flash - dt);
    e.mat.emissiveIntensity = e.flash > 0 ? 2.5 : 0.55;

    if (e.dissonant && sameFloor && dist < 1.5) touching = true;

    if (e.hum) {
      Audio.updateHum(e.hum, g.position, sameFloor ? 1 : 0.18);
    }
  }
  enemies = enemies.filter((e) => !e.removed);

  if (touching && !state.shift) {
    state.harmony -= CONTACT_DPS * dt;
    state.hurtTimer = 0.25;
    state.contactSoundTimer -= dt;
    if (state.contactSoundTimer <= 0) {
      state.contactSoundTimer = 0.35;
      Audio.buzz();
    }
  }
}

function retuneEnemy(e, floor) {
  // The note's letter changes with its staff position; pick a new wrong accidental
  const { letter, octave } = STAFF[floor];
  const options = dissonantAccidentals(letter, state.scale);
  const sigAcc = state.scale.sig[letter] || 0;
  e.floor = floor;
  e.letter = letter;
  e.octave = octave;
  e.acc = options[randInt(0, options.length - 1)];
  const oldF = freqOf(e.midi);
  e.midi = midiOf(letter, e.acc, octave);
  e.label.material.map = textTexture(noteName(letter, e.acc, null, e.acc === 0 && sigAcc !== 0), { color: '#ff5c86' });
  e.target = freeSpot(floor, false);
  Audio.setHumFreq(e.hum, freqOf(e.midi));
  Audio.glide(oldF, freqOf(e.midi), 0.8, 0.05, 'sawtooth');
}

function updateShots(dt) {
  for (const s of shots) {
    s.life -= dt;
    s.mesh.position.addScaledVector(s.vel, dt);
    s.ring.scale.setScalar(1 + (SHOT_LIFE - s.life) * 1.5);
    const p = s.mesh.position;
    const fy = floorY(s.floor);
    // Shots can't pass through the staff lines above or below you
    if (p.y < fy + 0.05 || p.y > fy + FLOOR_GAP - 0.05) { s.life = 0; burst(p, COLORS.player, 4, 2); }
    if (obstacles.some((o) => o.floor === s.floor && p.x > o.minX && p.x < o.maxX && p.z > o.minZ && p.z < o.maxZ && p.y < o.maxY)) {
      s.life = 0; burst(p, COLORS.player, 4, 2);
    }
    if (Math.abs(p.x) > ARENA || Math.abs(p.z) > ARENA) s.life = 0;
    if (s.life <= 0) continue;
    for (const e of enemies) {
      if (!e.alive || e.floor !== s.floor || e.hop) continue;
      // Hit test against the head and the stem
      const g = e.group.position;
      const dx = p.x - g.x, dz = p.z - g.z, dy = p.y - g.y;
      if (dx * dx + dz * dz < 0.8 && dy > -0.7 && dy < 2.2) {
        hitEnemy(e, p.clone());
        s.life = 0;
        break;
      }
    }
  }
  shots = shots.filter((s) => {
    if (s.life > 0) return true;
    levelGroup.remove(s.mesh);
    return false;
  });
}

function updatePickups(dt, time) {
  for (const p of pickups) {
    p.mesh.rotation.y += dt * 2;
    p.group.position.y = floorY(p.floor) + 1.3 + Math.sin(time * 2 + p.phase) * 0.15;
    if (p.floor !== state.floor || state.shift) continue;
    if (Math.hypot(p.group.position.x - camera.position.x, p.group.position.z - camera.position.z) < 1.4) {
      p.taken = true;
      levelGroup.remove(p.group);
      if (p.kind === 'sharp') state.sharps++; else state.flats++;
      Audio.arpeggio(freqOf(playerMidi()), p.kind === 'sharp' ? 1 : -1);
      toast(p.kind === 'sharp' ? '♯ Sharp collected: press E to rise a step' : '♭ Flat collected: press Q to drop a step');
      respawnQueue.push(PICKUP_RESPAWN);
      updateHud();
    }
  }
  pickups = pickups.filter((p) => !p.taken);
  respawnQueue = respawnQueue.map((t) => t - dt);
  while (respawnQueue.length && respawnQueue[0] <= 0) {
    respawnQueue.shift();
    spawnRandomPickup();
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    p.life -= dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.vel.multiplyScalar(0.94);
    p.mesh.material.opacity = Math.max(0, p.life / p.max);
  }
  particles = particles.filter((p) => {
    if (p.life > 0) return true;
    levelGroup.remove(p.mesh);
    return false;
  });
}

// ---------- HUD ----------
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function updateHud() {
  if (!state.level) return;
  $('key-name').textContent = state.level.key;
  $('scale-notes').textContent = state.scale.names.join('  ');
  $('remaining').textContent = remainingDissonant();
  $('sharps').textContent = state.sharps;
  $('flats').textContent = state.flats;
  const { letter, octave } = STAFF[state.floor];
  $('pitch').textContent = `${noteName(letter, state.scale.sig[letter] || 0, octave)} · ${isLine(state.floor) ? 'line' : 'space'}`;
}

function drawStaffMap() {
  const ctx = staffCtx;
  const W = 220, H = 150;
  ctx.clearRect(0, 0, W, H);
  const yOf = (i) => H - 18 - i * 14;

  ctx.strokeStyle = 'rgba(200, 210, 255, 0.55)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < STAFF.length; i += 2) {
    ctx.beginPath(); ctx.moveTo(8, yOf(i)); ctx.lineTo(W - 8, yOf(i)); ctx.stroke();
  }
  // Bar lines
  ctx.beginPath(); ctx.moveTo(8, yOf(0)); ctx.lineTo(8, yOf(8)); ctx.moveTo(W - 8, yOf(0)); ctx.lineTo(W - 8, yOf(8)); ctx.stroke();

  const noteAt = (x, i, color, r = 6) => {
    ctx.save();
    ctx.translate(x, yOf(i));
    ctx.rotate(-0.4);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.72, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  // You
  const py = state.shift
    ? state.shift.from + (state.shift.to - state.shift.from) * Math.min(state.shift.t, 1)
    : state.floor;
  ctx.save();
  ctx.shadowColor = '#5ff3ff'; ctx.shadowBlur = 10;
  noteAt(30, py, '#5ff3ff', 7);
  ctx.fillStyle = '#5ff3ff';
  ctx.fillRect(35, yOf(py) - 28, 2, 28);
  ctx.restore();

  // Dissonant notes per floor, and pickups as small glyphs
  const counts = new Array(STAFF.length).fill(0);
  for (const e of enemies) if (e.dissonant && e.alive) counts[e.floor]++;
  for (let i = 0; i < STAFF.length; i++) {
    for (let k = 0; k < Math.min(counts[i], 6); k++) noteAt(62 + k * 16, i, '#ff3d6e');
    if (counts[i] > 6) {
      ctx.fillStyle = '#ff3d6e'; ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`+${counts[i] - 6}`, 158, yOf(i) + 4);
    }
  }
  ctx.font = 'bold 12px "DejaVu Sans", sans-serif';
  for (const p of pickups) {
    ctx.fillStyle = p.kind === 'sharp' ? '#ffb347' : '#7aa8ff';
    const slot = pickups.filter((q) => q.floor === p.floor).indexOf(p);
    ctx.fillText(p.kind === 'sharp' ? '♯' : '♭', 178 + slot * 9, yOf(p.floor) + 4);
  }
}

// ---------- Screens ----------
function showCard(html, buttonText, onClick) {
  card.innerHTML = `${html}<button id="card-btn">${buttonText}</button>`;
  overlay.classList.remove('hidden');
  $('card-btn').addEventListener('click', onClick);
}

function startLevel(index) {
  state.levelIndex = index;
  buildLevel(index);
  const level = LEVELS[index];
  showCard(
    `<h2>Measure ${index + 1}: ${level.key}</h2>
     <p class="tag">${state.scale.names.join('  ')}</p>
     <p>${level.intro}</p>
     <p>Clear <b class="bad">${level.dissonant} dissonant notes</b>. You start on <b>${STAFF[level.startFloor].letter}${STAFF[level.startFloor].octave}</b>, the middle line.</p>`,
    'Begin',
    play,
  );
  state.mode = 'between';
}

function play() {
  Audio.init();
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');
  state.mode = 'playing';
  held.group.visible = true;
  if (!lockFallback) requestLock();
  clock.getDelta();
}

function pause() {
  state.mode = 'paused';
  showCard('<h2>Paused</h2><p>The measure holds its breath.</p>', 'Resume', play);
}

function levelComplete() {
  if (state.mode !== 'playing') return;
  state.mode = 'between';
  if (document.pointerLockElement) document.exitPointerLock();
  Audio.cadence(state.scale.tonicMidi);
  const next = state.levelIndex + 1;
  if (next >= LEVELS.length) {
    showCard(
      `<h1>IN TUNE</h1>
       <p class="tag">Every measure resolved.</p>
       <p>The staff rings clean from bottom line to top. You were the right note all along.</p>`,
      'Play again',
      () => startLevel(0),
    );
    return;
  }
  showCard(
    `<h2>Measure resolved</h2>
     <p>${state.level.key} is back in tune.</p>
     <p>Next: <b>${LEVELS[next].key}</b></p>`,
    'Continue',
    () => startLevel(next),
  );
}

function gameOver() {
  state.mode = 'between';
  if (document.pointerLockElement) document.exitPointerLock();
  Audio.collapse();
  showCard(
    `<h2 class="bad">Out of tune</h2>
     <p>The dissonance swallowed your harmony.</p>`,
    'Retry measure',
    () => startLevel(state.levelIndex),
  );
}

$('start-btn').addEventListener('click', () => {
  Audio.init();
  startLevel(0);
});

// ---------- Main loop ----------
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (state.mode === 'playing') {
    updatePlayer(dt);
    updateEnemies(dt, time);
    updateShots(dt);
    updatePickups(dt, time);
    updateParticles(dt);

    state.hurtTimer = Math.max(0, state.hurtTimer - dt);
    $('hurt').style.opacity = state.hurtTimer > 0 ? 1 : 0;
    $('harmony-fill').style.width = `${Math.max(0, state.harmony)}%`;
    $('remaining').textContent = remainingDissonant();
    drawStaffMap();
    Audio.updateListener(camera);

    if (state.harmony <= 0) gameOver();
  } else if (state.mode === 'title') {
    // Slow orbit of the staff behind the title screen
    camera.position.set(Math.sin(time * 0.1) * 40, 22, Math.cos(time * 0.1) * 40);
    camera.lookAt(0, 14, 0);
  }

  renderer.render(scene, camera);
}
frame();

// Exposed for automated smoke tests
window.__game = { state, get enemies() { return enemies; }, get pickups() { return pickups; }, shiftFloor, fire, resolveEnemy };
