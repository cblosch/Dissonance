// Music theory helpers: the staff, key signatures, and which notes belong.

const LETTER_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

// Treble clef positions from the bottom line (E4) to the top line (F5).
// Even indices are lines, odd indices are spaces.
export const STAFF = [
  { letter: 'E', octave: 4 },
  { letter: 'F', octave: 4 },
  { letter: 'G', octave: 4 },
  { letter: 'A', octave: 4 },
  { letter: 'B', octave: 4 },
  { letter: 'C', octave: 5 },
  { letter: 'D', octave: 5 },
  { letter: 'E', octave: 5 },
  { letter: 'F', octave: 5 },
];

export const isLine = (i) => i % 2 === 0;

export const LEVELS = [
  {
    key: 'C major', tonic: { letter: 'C', acc: 0 }, sig: {},
    dissonant: 6, consonant: 4, pickups: 4, speed: 2.2, hops: false,
    minFloor: 2, maxFloor: 6, startFloor: 4,
    intro: 'No sharps, no flats. Any note wearing an accidental is an intruder.',
  },
  {
    key: 'G major', tonic: { letter: 'G', acc: 0 }, sig: { F: 1 },
    dissonant: 7, consonant: 5, pickups: 5, speed: 2.6, hops: false,
    minFloor: 1, maxFloor: 7, startFloor: 4,
    intro: 'G major keeps F♯. Here a plain F♮ is the one out of place.',
  },
  {
    key: 'F major', tonic: { letter: 'F', acc: 0 }, sig: { B: -1 },
    dissonant: 8, consonant: 5, pickups: 6, speed: 2.9, hops: true,
    minFloor: 0, maxFloor: 8, startFloor: 4,
    intro: 'F major keeps B♭. Watch out: dissonant notes can now slide along the staff toward you.',
  },
  {
    key: 'D major', tonic: { letter: 'D', acc: 0 }, sig: { F: 1, C: 1 },
    dissonant: 10, consonant: 6, pickups: 7, speed: 3.2, hops: true,
    minFloor: 0, maxFloor: 8, startFloor: 4,
    intro: 'D major keeps F♯ and C♯. The whole staff is in play.',
  },
  {
    key: 'E♭ major', tonic: { letter: 'E', acc: -1 }, sig: { B: -1, E: -1, A: -1 },
    dissonant: 12, consonant: 6, pickups: 8, speed: 3.5, hops: true,
    minFloor: 0, maxFloor: 8, startFloor: 4,
    intro: 'E♭ major keeps B♭, E♭ and A♭. The final measure.',
  },
];

const pc = (letter, acc) => (((LETTER_SEMI[letter] + acc) % 12) + 12) % 12;

export function midiOf(letter, acc, octave) {
  return 12 * (octave + 1) + LETTER_SEMI[letter] + acc;
}

export const freqOf = (midi) => 440 * 2 ** ((midi - 69) / 12);

export function noteName(letter, acc, octave = null, showNatural = false) {
  const sym = acc === 1 ? '♯' : acc === -1 ? '♭' : showNatural ? '♮' : '';
  return `${letter}${sym}${octave ?? ''}`;
}

export function scaleOf(level) {
  const sig = level.sig;
  const pcs = new Set(LETTERS.map((l) => pc(l, sig[l] || 0)));
  const start = LETTERS.indexOf(level.tonic.letter);
  const names = [];
  for (let i = 0; i < 7; i++) {
    const l = LETTERS[(start + i) % 7];
    names.push(noteName(l, sig[l] || 0));
  }
  return { sig, pcs, names, tonicMidi: 60 + pc(level.tonic.letter, level.tonic.acc) };
}

// Accidentals that make this staff letter clash with the key. Awkward
// spellings like F♭ or B♯ are skipped so every enemy reads clearly.
const AWKWARD = new Set(['F-1', 'C-1', 'E1', 'B1']);
export function dissonantAccidentals(letter, scale) {
  const sigAcc = scale.sig[letter] || 0;
  const out = [];
  for (const acc of [-1, 0, 1]) {
    if (acc === sigAcc || AWKWARD.has(`${letter}${acc}`)) continue;
    if (!scale.pcs.has(pc(letter, acc))) out.push(acc);
  }
  return out.length ? out : [sigAcc === 1 ? 0 : sigAcc + 1];
}
