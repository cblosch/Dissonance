import * as THREE from 'three';

// Each kind of note is an enemy type, and its length shapes how it behaves.
// `sub` is how many lunges it makes per beat of the soundtrack (0 = glides
// smoothly), `hit` is its hit radius, `contact` is damage per second on touch.
export const NOTE_TYPES = {
  whole: {
    name: 'Whole note', hp: 6, speed: 0.45, sub: 0, scale: 1.3, hit: 1.1, contact: 26, aura: 3,
    desc: 'Slow and tough. Takes six hits, and just standing near one hurts.',
  },
  half: {
    name: 'Half note', hp: 4, speed: 0.7, sub: 0, scale: 1.1, hit: 0.95, contact: 18, shoots: true,
    desc: 'Hangs back and fires sour rings at you every other bar.',
  },
  quarter: {
    name: 'Quarter note', hp: 3, speed: 1, sub: 1, scale: 1, hit: 0.9, contact: 22,
    desc: 'Steady. Lunges toward you on every beat.',
  },
  eighth: {
    name: 'Eighth note', hp: 2, speed: 1.3, sub: 2, scale: 0.9, hit: 0.85, contact: 18, zigzag: true,
    desc: 'Quick and twitchy. Zigzags in twice a beat.',
  },
  sixteenth: {
    name: 'Sixteenth note', hp: 1, speed: 1.6, sub: 4, scale: 0.75, hit: 0.8, contact: 14, pack: 2,
    desc: 'Tiny and fast, and they come in pairs. One hit each.',
  },
};

// ---------- Shared geometry ----------
// Heads face +z. The stem sits on the right edge of the head and starts at the
// head's centre so the two always overlap instead of meeting at a seam.
const STEM_X = 0.47;
const STEM_TOP = 2.3;

const filledHeadGeo = new THREE.SphereGeometry(0.45, 28, 18);
const hollowHeadGeo = new THREE.TorusGeometry(0.39, 0.12, 14, 40);
const wholeHeadGeo = new THREE.TorusGeometry(0.4, 0.19, 16, 44);
const stemGeo = new THREE.CylinderGeometry(0.055, 0.055, STEM_TOP, 10);
stemGeo.translate(0, STEM_TOP / 2, 0);

const flagGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.08, -0.3, 0.62, -0.42, 0.5, -1.05);
  s.bezierCurveTo(0.46, -0.7, 0.24, -0.55, 0, -0.42);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2, curveSegments: 16 });
  g.translate(0, 0, -0.035);
  return g;
})();

export function buildNote(type, color) {
  const group = new THREE.Group();   // positioned and turned in the world
  const body = new THREE.Group();    // scaled per type; jitter moves the whole body
  group.add(body);
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.2,
  });

  let head;
  if (type === 'whole') {
    head = new THREE.Mesh(wholeHeadGeo, mat);
    head.scale.set(1.4, 0.95, 1.5);
    head.rotation.z = -0.5;
  } else if (type === 'half') {
    head = new THREE.Mesh(hollowHeadGeo, mat);
    head.scale.set(1.3, 0.92, 1.6);
    head.rotation.z = 0.35;
  } else {
    head = new THREE.Mesh(filledHeadGeo, mat);
    head.scale.set(1.3, 0.9, 0.8);
    head.rotation.z = 0.35;
  }
  body.add(head);

  if (type !== 'whole') {
    const stem = new THREE.Mesh(stemGeo, mat);
    stem.position.set(STEM_X, 0, 0);
    body.add(stem);
  }

  const flags = type === 'eighth' ? 1 : type === 'sixteenth' ? 2 : 0;
  for (let i = 0; i < flags; i++) {
    const flag = new THREE.Mesh(flagGeo, mat);
    flag.position.set(STEM_X - 0.03, STEM_TOP - i * 0.42, 0);
    body.add(flag);
  }

  body.scale.setScalar(NOTE_TYPES[type].scale);
  // Where the floating name label should sit, in group space
  const labelPos = type === 'whole'
    ? new THREE.Vector3(0, 1.3 * NOTE_TYPES[type].scale, 0)
    : new THREE.Vector3(-0.55, 2.0 * NOTE_TYPES[type].scale, 0);
  return { group, body, head, mat, labelPos };
}
