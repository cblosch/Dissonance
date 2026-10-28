// Web Audio synthesis: every sound in the game, including the music, is generated. No samples.

let ctx = null;
let master = null;
let humBus = null;
let muted = false;

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
  humBus = ctx.createGain();
  humBus.connect(master);
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

// ---------- Soundtrack ----------
// A generated groove that stays strictly inside the level's key, so the
// off-key notes clash against it. Chords, bass, an arpeggio, a loose melody
// and light drums are all scheduled ahead of time on a 16th-note grid.

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PROGRESSIONS = [
  [0, 5, 3, 4], // I  vi IV V
  [0, 3, 4, 3], // I  IV V  IV
  [5, 3, 0, 4], // vi IV I  V
  [0, 4, 5, 3], // I  V  vi IV
  [3, 4, 2, 5], // IV V  iii vi
];
const MUSIC_VOLUME = 0.65;
const ARP = [0, 2, 4, 7, 4, 2, 4, 2];

let music = null;
let noiseBuffer = null;

const degMidi = (base, deg) => base + MAJOR[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);

function noise() {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  return src;
}

function voice(freq, t, dur, { type = 'triangle', gain = 0.05, attack = 0.01, echo = false, cutoff = 0 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  env(g, t, gain, attack, dur);
  let out = o;
  if (cutoff) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    o.connect(lp);
    out = lp;
  }
  out.connect(g);
  g.connect(music.bus);
  if (echo) g.connect(music.echo);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function drum(kind, t) {
  const g = ctx.createGain();
  g.connect(music.bus);
  if (kind === 'kick') {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    env(g, t, 0.22, 0.005, 0.3);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.35);
    return;
  }
  const src = noise();
  const f = ctx.createBiquadFilter();
  if (kind === 'hat') {
    f.type = 'highpass';
    f.frequency.value = 7000;
    env(g, t, 0.025, 0.002, 0.05);
  } else {
    f.type = 'bandpass';
    f.frequency.value = 1800;
    env(g, t, 0.06, 0.003, 0.16);
  }
  src.connect(f);
  f.connect(g);
  src.start(t);
  src.stop(t + 0.2);
}

function playStep(step, t, s16) {
  const { tonic, prog } = music;
  const pos = step % 16;
  const chord = prog[Math.floor(step / 16) % prog.length];

  // Pad: the full chord, held for the bar
  if (pos === 0) {
    for (const k of [0, 2, 4]) {
      voice(freqOfMidi(degMidi(tonic - 12, chord + k)), t, s16 * 16, { type: 'sawtooth', gain: 0.022, attack: 0.5, cutoff: 900 });
    }
  }

  // Bass: root on 1 and 3, fifth as a pickup
  const bassBase = tonic - 24;
  if (pos === 0 || pos === 8) voice(freqOfMidi(degMidi(bassBase, chord)), t, s16 * 5, { type: 'triangle', gain: 0.16 });
  if (pos === 14) voice(freqOfMidi(degMidi(bassBase, chord + 4)), t, s16 * 2, { type: 'triangle', gain: 0.1 });

  // Arpeggio on 8th notes, echoed
  if (pos % 2 === 0) {
    voice(freqOfMidi(degMidi(tonic, chord + ARP[pos / 2])), t, s16 * 1.6, { type: 'triangle', gain: 0.028, echo: true });
  }

  // Melody: a slow random walk that lands on chord tones at the start of a bar
  if (pos % 4 === 0 && Math.random() < (pos === 0 ? 0.8 : 0.35)) {
    let deg = music.melody + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)];
    if (pos === 0) {
      const tones = [chord, chord + 2, chord + 4, chord + 7, chord + 9];
      deg = tones.reduce((a, b) => (Math.abs(b - deg) < Math.abs(a - deg) ? b : a));
    }
    music.melody = Math.max(4, Math.min(12, deg));
    const f = freqOfMidi(degMidi(tonic, music.melody));
    voice(f, t, s16 * 3.5, { type: 'sine', gain: 0.06, attack: 0.02, echo: true });
    voice(f * 2, t, s16 * 1.5, { type: 'sine', gain: 0.012, echo: true });
  }

  // Drums
  if (pos === 0 || pos === 8 || (pos === 10 && Math.random() < 0.3)) drum('kick', t);
  if (pos === 4 || pos === 12) drum('snare', t);
  if (pos % 2 === 0) drum('hat', t + (pos % 4 === 2 ? s16 * 0.08 : 0));
}

function schedule() {
  if (!music || music.paused) return;
  const s16 = 60 / music.bpm / 4;
  while (music.next < ctx.currentTime + 0.15) {
    playStep(music.step, music.next, s16);
    music.step++;
    music.next += s16;
  }
}

export function startMusic(tonicMidi, bpm, variation = 0) {
  if (!ctx) return;
  stopMusic();
  humBus.gain.setTargetAtTime(1, ctx.currentTime, 0.1);
  const bus = ctx.createGain();
  bus.gain.value = 0;
  bus.gain.setTargetAtTime(MUSIC_VOLUME, ctx.currentTime, 0.4);
  bus.connect(master);
  // Dotted-eighth echo gives the arpeggio and melody some space
  const echo = ctx.createDelay(1);
  echo.delayTime.value = (60 / bpm) * 0.75;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  echo.connect(feedback);
  feedback.connect(echo);
  echo.connect(wet);
  wet.connect(bus);
  music = {
    bus, echo, bpm, tonic: tonicMidi,
    prog: PROGRESSIONS[variation % PROGRESSIONS.length],
    step: 0, next: ctx.currentTime + 0.1, melody: 7, paused: false,
    timer: setInterval(schedule, 25),
  };
}

// Pausing also silences the off-key notes' hums
export function setMusicPaused(paused) {
  if (!ctx) return;
  humBus.gain.setTargetAtTime(paused ? 0 : 1, ctx.currentTime, 0.1);
  if (!music) return;
  music.paused = paused;
  music.bus.gain.setTargetAtTime(paused ? 0 : MUSIC_VOLUME, ctx.currentTime, 0.1);
  if (!paused) music.next = Math.max(music.next, ctx.currentTime + 0.05);
}

export const isMusicPlaying = () => !!music;

export function stopMusic() {
  if (!music) return;
  clearInterval(music.timer);
  const { bus } = music;
  bus.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
  setTimeout(() => bus.disconnect(), 1500);
  music = null;
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
  lp.connect(g); g.connect(p); p.connect(humBus);
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
  h.g.gain.setTargetAtTime(0.04 * factor, t, 0.15);
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

// A low thud that drops in pitch, for the flat's shockwave
export function shockwave(freq) {
  tone(freq / 2, 0.6, { type: 'sine', gain: 0.3, glideTo: freq / 4 });
  tone(freq, 0.4, { type: 'triangle', gain: 0.08, glideTo: freq / 2 });
}

// A bright rising chirp for the sharp's power-up
export function sharpen(freq) {
  tone(freq, 0.35, { type: 'square', gain: 0.05, glideTo: freq * 2 ** (1 / 12) * 2 });
  tone(freq * 2, 0.5, { type: 'triangle', gain: 0.07, when: 0.1 });
}

export function enemyShot(freq) {
  tone(freq, 0.35, { type: 'sawtooth', gain: 0.05, glideTo: freq * 0.94 });
}

export function heal(freq) {
  [0, 4, 7, 12, 16].forEach((s, i) => tone(freq * 2 ** (s / 12), 0.35, { type: 'sine', gain: 0.08, when: i * 0.05 }));
}
