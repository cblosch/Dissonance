// Web Audio synthesis: every sound in the game is generated, no samples.

let ctx = null;
let master = null;
let muted = false;
let drone = null;

const freqOfMidi = (m) => 440 * 2 ** ((m - 69) / 12);

export function init() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  master = ctx.createGain();
  master.gain.value = 0.6;
  master.connect(comp);
  comp.connect(ctx.destination);
}

export function toggleMute() {
  if (!ctx) return;
  muted = !muted;
  master.gain.setTargetAtTime(muted ? 0 : 0.6, ctx.currentTime, 0.05);
}

function env(gainNode, t, peak, attack, dur) {
  gainNode.gain.setValueAtTime(0.0001, t);
  gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone(freq, dur, { type = 'triangle', gain = 0.15, when = 0, glideTo = null, attack = 0.01 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur * 0.7);
  env(g, t, gain, attack, dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// ---------- Drone: the tonic and fifth, so wrong notes sound wrong ----------
export function setDrone(root, fifth) {
  if (!ctx) return;
  if (drone) {
    const old = drone;
    old.g.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    setTimeout(() => old.oscs.forEach((o) => o.stop()), 1500);
  }
  const g = ctx.createGain();
  g.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  const oscs = [root, root * 2, fifth].map((f, i) => {
    const o = ctx.createOscillator();
    o.type = i === 1 ? 'triangle' : 'sine';
    o.frequency.value = f;
    o.connect(lp);
    o.start();
    return o;
  });
  lp.connect(g);
  g.connect(master);
  g.gain.setTargetAtTime(0.05, ctx.currentTime, 0.8);
  drone = { g, oscs };
}

// ---------- Positional hum for each dissonant note ----------
export function createHum(freq) {
  if (!ctx) return null;
  const p = ctx.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = 2.5;
  p.rolloffFactor = 1.3;
  const g = ctx.createGain();
  g.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1100;
  // Two slightly detuned saws beat against each other for a sour wobble
  const o1 = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  o1.type = 'sawtooth';
  o2.type = 'sawtooth';
  o1.frequency.value = freq;
  o2.frequency.value = freq * 1.012;
  o1.connect(lp); o2.connect(lp);
  lp.connect(g); g.connect(p); p.connect(master);
  o1.start(); o2.start();
  return { o1, o2, g, p };
}

export function setHumFreq(h, freq) {
  if (!h) return;
  const t = ctx.currentTime;
  h.o1.frequency.setTargetAtTime(freq, t, 0.25);
  h.o2.frequency.setTargetAtTime(freq * 1.012, t, 0.25);
}

export function updateHum(h, pos, factor) {
  if (!h) return;
  const t = ctx.currentTime;
  if (h.p.positionX) {
    h.p.positionX.setValueAtTime(pos.x, t);
    h.p.positionY.setValueAtTime(pos.y, t);
    h.p.positionZ.setValueAtTime(pos.z, t);
  } else {
    h.p.setPosition(pos.x, pos.y, pos.z);
  }
  h.g.gain.setTargetAtTime(0.045 * factor, t, 0.15);
}

export function stopHum(h) {
  if (!h || !ctx) return;
  const t = ctx.currentTime;
  h.g.gain.setTargetAtTime(0, t, 0.05);
  h.o1.stop(t + 0.4);
  h.o2.stop(t + 0.4);
}

export function updateListener(camera) {
  if (!ctx) return;
  const L = ctx.listener;
  const p = camera.position;
  const f = camera.getWorldDirection(camera.userData.dir || (camera.userData.dir = camera.position.clone()));
  const t = ctx.currentTime;
  if (L.positionX) {
    L.positionX.setValueAtTime(p.x, t);
    L.positionY.setValueAtTime(p.y, t);
    L.positionZ.setValueAtTime(p.z, t);
    L.forwardX.setValueAtTime(f.x, t);
    L.forwardY.setValueAtTime(f.y, t);
    L.forwardZ.setValueAtTime(f.z, t);
    L.upX.setValueAtTime(0, t);
    L.upY.setValueAtTime(1, t);
    L.upZ.setValueAtTime(0, t);
  } else {
    L.setPosition(p.x, p.y, p.z);
    L.setOrientation(f.x, f.y, f.z, 0, 1, 0);
  }
}

// ---------- One-shot sounds ----------
export function pluck(freq, dur = 0.25, type = 'triangle') {
  tone(freq, dur, { type, gain: 0.18 });
  tone(freq * 2, dur * 0.6, { type: 'sine', gain: 0.05 });
}

export function glide(from, to, dur, gain = 0.12, type = 'sine') {
  tone(from, dur + 0.2, { type, gain, glideTo: to, attack: 0.03 });
}

export function buzz() {
  tone(92, 0.18, { type: 'square', gain: 0.07 });
  tone(97.5, 0.18, { type: 'square', gain: 0.07 });
}

export function wrongNote(a, b) {
  buzz();
  tone(a, 0.3, { type: 'sawtooth', gain: 0.06 });
  tone(b * 1.06, 0.3, { type: 'sawtooth', gain: 0.06 });
}

// The wrong note bends to its in-key neighbour, then sounds in harmony with you
export function resolveGlide(from, to, player) {
  tone(from, 0.7, { type: 'triangle', gain: 0.16, glideTo: to });
  tone(to, 0.9, { type: 'sine', gain: 0.12, when: 0.45 });
  tone(player, 0.9, { type: 'sine', gain: 0.08, when: 0.45 });
}

export function arpeggio(freq, dir) {
  const steps = dir > 0 ? [0, 4, 7, 12] : [12, 7, 4, 0];
  steps.forEach((s, i) => tone(freq * 2 ** (s / 12), 0.2, { type: 'triangle', gain: 0.1, when: i * 0.06 }));
}

export function cadence(tonicMidi) {
  // V then I, the most final-sounding move in tonal music
  const V = [tonicMidi - 5, tonicMidi - 1, tonicMidi + 2];
  const I = [tonicMidi - 12, tonicMidi, tonicMidi + 4, tonicMidi + 7];
  V.forEach((m) => tone(freqOfMidi(m), 0.6, { type: 'triangle', gain: 0.09 }));
  I.forEach((m) => tone(freqOfMidi(m), 1.6, { type: 'triangle', gain: 0.09, when: 0.55 }));
}

export function collapse() {
  [0, 1, 6, 11].forEach((s, i) => tone(110 * 2 ** (s / 12), 1.4, { type: 'sawtooth', gain: 0.06, glideTo: 60, when: i * 0.03 }));
}
