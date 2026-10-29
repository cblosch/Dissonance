import * as THREE from 'three';

// A character made only of flat stock photos. Every body part is a camera-facing
// card that swaps to the photo shot from the angle you're looking at it from,
// the way old sprite games faked 3D with eight-direction sprites.

// ---------- Skeleton sizes (meters) ----------

const THIGH = 0.46, SHIN = 0.46, FOOT = 0.06;
const TORSO = 0.6, HEAD = 0.3, UPPER = 0.3, FORE = 0.3;
const SHOULDER_X = 0.21, SHOULDER_Y = 0.55, HIP_X = 0.1;
const STAND = THIGH + SHIN + FOOT;

// ---------- Views ----------

// deg is where the camera sits relative to the way the part is facing:
// 0 = in front, 90 = on the character's left, 180 = behind.
const VIEWS = [
  { name: 'front', deg: 0 },
  { name: 'front-left', deg: 45 },
  { name: 'left', deg: 90 },
  { name: 'back-left', deg: 135 },
  { name: 'back', deg: 180 },
  { name: 'back-right', deg: -135 },
  { name: 'right', deg: -90 },
  { name: 'front-right', deg: -45 },
];
const MIRROR = {
  front: 'front', back: 'back', left: 'right', right: 'left',
  'front-left': 'front-right', 'front-right': 'front-left',
  'back-left': 'back-right', 'back-right': 'back-left',
};

// Each part type is a different guy. ext = how far the card reaches past each joint.
const TYPES = {
  head:     { label: 'Head',      w: 0.27, len: HEAD,  ext: [0.04, 0.03], guy: 'Smiling businessman headshot', id: 4810233 },
  torso:    { label: 'Torso',     w: 0.46, len: TORSO, ext: [0.08, 0.03], guy: 'Man in blue oxford shirt and tie', id: 2291847 },
  upperArm: { label: 'Upper arm', w: 0.14, len: UPPER, ext: [0.04, 0.03], guy: 'Guy in white polo, arm detail', id: 7730512 },
  forearm:  { label: 'Forearm',   w: 0.12, len: FORE,  ext: [0.02, 0.04], guy: 'Man checking his watch', id: 1189064 },
  thigh:    { label: 'Thigh',     w: 0.19, len: THIGH, ext: [0.06, 0.03], guy: 'Dad in khakis', id: 5502718 },
  shin:     { label: 'Shin',      w: 0.16, len: SHIN,  ext: [0.02, 0.08], guy: 'Man in chinos and loafers', id: 9046631 },
};
for (const t of Object.values(TYPES)) {
  t.total = t.len + t.ext[0] + t.ext[1];
  t.texH = 512;
  t.texW = Math.round(512 * t.w / t.total);
}

// ---------- Placeholder "stock photos" ----------

const SKIN = '#f0c6a6', SKIN_DARK = '#d9a587';

function hash(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(rx, 0.1), Math.max(ry, 0.1), 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function shade(ctx, W, H, s) {
  // Studio light from the camera's side, darker on the far edge.
  const g = ctx.createLinearGradient(0, 0, W, 0);
  const a = 0.18 + 0.12 * Math.abs(s);
  g.addColorStop(0, s > 0 ? `rgba(0,0,0,${a})` : 'rgba(0,0,0,0)');
  g.addColorStop(1, s > 0 ? 'rgba(0,0,0,0)' : `rgba(0,0,0,${a})`);
  return g;
}

const DRAW = {
  head(ctx, W, H, s, c) {
    const cx = W / 2, cy = H * 0.42, rx = W * 0.33, ry = H * 0.27;
    const face = -s; // image direction the face points
    // suit collar from a different shoot
    ctx.fillStyle = '#3b4552';
    ctx.fillRect(0, H * 0.84, W, H);
    ellipse(ctx, cx, H * 0.86, W * 0.18, H * 0.04, '#ffffff');
    ctx.fillStyle = SKIN_DARK;
    ctx.fillRect(cx - W * 0.15, cy + ry * 0.5, W * 0.3, H * 0.84 - cy - ry * 0.5);
    // hair shell, then face on top of it
    ellipse(ctx, cx - face * rx * 0.12, cy - ry * 0.08, rx * 1.04, ry * 1.02, '#6b4a2f');
    const show = THREE.MathUtils.smoothstep(c, -0.6, 0.2);
    if (show > 0) {
      ellipse(ctx, cx + face * rx * 0.2, cy + ry * 0.14, rx * (0.6 + 0.35 * show) * (0.7 + 0.3 * Math.abs(c)), ry * 0.86, SKIN);
    }
    if (Math.abs(c) > 0.55) {
      ellipse(ctx, cx - rx * 0.98, cy + ry * 0.1, rx * 0.12, ry * 0.18, SKIN_DARK);
      ellipse(ctx, cx + rx * 0.98, cy + ry * 0.1, rx * 0.12, ry * 0.18, SKIN_DARK);
    } else if (Math.abs(s) > 0.3) {
      ellipse(ctx, cx - face * rx * 0.2, cy + ry * 0.1, rx * 0.13, ry * 0.18, SKIN_DARK);
    }
    if (c > -0.25) {
      const fx = cx + face * rx * 0.5 * (1 - Math.max(c, 0) * 0.9);
      const spread = rx * 0.32 * Math.max(c, 0);
      const ey = cy + ry * 0.05;
      ctx.fillStyle = '#2b2b2b';
      ctx.strokeStyle = '#4a3320';
      ctx.lineWidth = 3;
      const eyes = c > 0.35 ? [fx - spread, fx + spread] : [fx + face * rx * 0.05];
      for (const ex of eyes) {
        ellipse(ctx, ex, ey, rx * 0.07, ry * 0.05, '#2b2b2b');
        ctx.beginPath();
        ctx.moveTo(ex - rx * 0.12, ey - ry * 0.13);
        ctx.lineTo(ex + rx * 0.12, ey - ry * 0.15);
        ctx.stroke();
      }
      // nose
      ctx.strokeStyle = SKIN_DARK;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(fx + face * rx * 0.05, ey + ry * 0.05);
      ctx.lineTo(fx + face * rx * (0.12 + 0.25 * (1 - Math.max(c, 0))), ey + ry * 0.28);
      ctx.lineTo(fx, ey + ry * 0.3);
      ctx.stroke();
      // the stock photo smile
      ctx.strokeStyle = '#9c4a3c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      const mw = rx * 0.32 * Math.max(c, 0.35);
      ctx.arc(fx + face * rx * 0.05, ey + ry * 0.38, mw, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
  },

  torso(ctx, W, H, s, c) {
    const cx = W / 2, face = -s;
    const bw = W * (0.66 + 0.3 * Math.abs(c));
    // pants under the shirt
    ctx.fillStyle = '#5b5f66';
    ctx.fillRect(cx - bw * 0.48, H * 0.78, bw * 0.96, H);
    ctx.fillStyle = '#4a2f1d';
    ctx.fillRect(cx - bw * 0.48, H * 0.76, bw * 0.96, H * 0.04);
    // shirt
    ctx.fillStyle = '#a9c6ea';
    ctx.beginPath();
    ctx.moveTo(cx - bw / 2, H * 0.2);
    ctx.quadraticCurveTo(cx - bw / 2, H * 0.08, cx - bw * 0.25, H * 0.07);
    ctx.lineTo(cx + bw * 0.25, H * 0.07);
    ctx.quadraticCurveTo(cx + bw / 2, H * 0.08, cx + bw / 2, H * 0.2);
    ctx.lineTo(cx + bw * 0.47, H * 0.77);
    ctx.lineTo(cx - bw * 0.47, H * 0.77);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(ctx, W, H, s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,70,110,0.35)';
    ctx.lineWidth = 2;
    if (c > -0.3) {
      const nx = cx + face * bw * 0.32 * (1 - Math.max(c, 0));
      ellipse(ctx, nx, H * 0.07, W * 0.09 * Math.max(c, 0.4), H * 0.04, SKIN_DARK);
      // collar points
      ctx.fillStyle = '#d6e6fa';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(nx + side * W * 0.1 * Math.max(c, 0.3), H * 0.06);
        ctx.lineTo(nx, H * 0.12);
        ctx.lineTo(nx + side * W * 0.13 * Math.max(c, 0.3), H * 0.15);
        ctx.closePath();
        ctx.fill();
      }
      if (c > 0) {
        // tie
        const tw = W * 0.05 * Math.max(c, 0.4);
        ctx.fillStyle = '#1f2f57';
        ctx.beginPath();
        ctx.moveTo(nx - tw * 0.7, H * 0.115);
        ctx.lineTo(nx + tw * 0.7, H * 0.115);
        ctx.lineTo(nx + tw, H * 0.6);
        ctx.lineTo(nx, H * 0.65);
        ctx.lineTo(nx - tw, H * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,170,90,0.6)';
        ctx.lineWidth = 3;
        for (let y = 0.2; y < 0.6; y += 0.07) {
          ctx.beginPath();
          ctx.moveTo(nx - tw, H * y);
          ctx.lineTo(nx + tw, H * (y + 0.03));
          ctx.stroke();
        }
        // pocket on his left, which is image-right from the front
        const px = nx + bw * 0.24 * c;
        ctx.strokeStyle = 'rgba(40,70,110,0.45)';
        ctx.strokeRect(px - W * 0.06 * c, H * 0.25, W * 0.12 * c, H * 0.1);
      }
    } else {
      // back yoke and pleat
      ctx.beginPath();
      ctx.moveTo(cx - bw * 0.48, H * 0.2);
      ctx.lineTo(cx + bw * 0.48, H * 0.2);
      ctx.moveTo(cx, H * 0.2);
      ctx.lineTo(cx, H * 0.75);
      ctx.stroke();
    }
  },

  upperArm(ctx, W, H, s) {
    const cx = W / 2;
    ctx.fillStyle = SKIN;
    ctx.fillRect(cx - W * 0.33, H * 0.55, W * 0.66, H);
    ctx.fillStyle = '#f7f7f4';
    ctx.beginPath();
    ctx.moveTo(cx - W * 0.46, H * 0.05);
    ctx.lineTo(cx + W * 0.46, H * 0.05);
    ctx.lineTo(cx + W * 0.44, H * 0.62);
    ctx.lineTo(cx - W * 0.44, H * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2d4f7a';
    ctx.fillRect(cx - W * 0.44, H * 0.56, W * 0.88, H * 0.025);
    ctx.fillStyle = shade(ctx, W, H, s);
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - W * 0.3 + i * W * 0.15, H * 0.12);
      ctx.lineTo(cx - W * 0.25 + i * W * 0.12, H * 0.5);
      ctx.stroke();
    }
  },

  forearm(ctx, W, H, s, c) {
    const cx = W / 2;
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.moveTo(cx - W * 0.4, H * 0.12);
    ctx.lineTo(cx + W * 0.4, H * 0.12);
    ctx.lineTo(cx + W * 0.26, H * 0.68);
    ctx.lineTo(cx - W * 0.26, H * 0.68);
    ctx.closePath();
    ctx.fill();
    // hand
    ellipse(ctx, cx, H * 0.79, W * 0.34, H * 0.11, SKIN);
    const thumb = s >= 0 ? 1 : -1;
    ellipse(ctx, cx + thumb * W * 0.3, H * 0.76, W * 0.1, H * 0.06, SKIN_DARK);
    ctx.strokeStyle = SKIN_DARK;
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * W * 0.12, H * 0.8);
      ctx.lineTo(cx + i * W * 0.12, H * 0.89);
      ctx.stroke();
    }
    // arm hair
    ctx.strokeStyle = 'rgba(110,80,50,0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 18; i++) {
      const x = cx + (((i * 37) % 13) / 13 - 0.5) * W * 0.5;
      const y = H * (0.2 + ((i * 53) % 17) / 17 * 0.4);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 4, y + 7);
      ctx.stroke();
    }
    // rolled sleeve
    ctx.fillStyle = '#c7ccd3';
    ctx.fillRect(0, 0, W, H * 0.15);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, H * 0.07, W, H * 0.015);
    // watch, face visible from his left or the front
    ctx.fillStyle = '#3a2a1f';
    ctx.fillRect(cx - W * 0.29, H * 0.62, W * 0.58, H * 0.045);
    if (s > -0.2 || c > 0.5) ellipse(ctx, cx, H * 0.643, W * 0.17, H * 0.032, '#d8dde3');
    ctx.fillStyle = shade(ctx, W, H, s);
    ctx.fillRect(0, 0, W, H);
  },

  thigh(ctx, W, H, s, c) {
    const cx = W / 2, face = -s;
    ctx.fillStyle = '#c9b48a';
    ctx.fillRect(cx - W * 0.45, 0, W * 0.9, H);
    ctx.fillStyle = shade(ctx, W, H, s);
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(90,70,40,0.4)';
    ctx.lineWidth = 2;
    if (c > 0.3) {
      ctx.beginPath();
      ctx.moveTo(cx + face * W * 0.1, H * 0.05);
      ctx.lineTo(cx + face * W * 0.1, H);
      ctx.stroke();
    } else if (c < -0.3) {
      ctx.strokeRect(cx - W * 0.25, H * 0.08, W * 0.5, H * 0.18);
    } else {
      // side seam and pocket
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, H);
      ctx.moveTo(cx + face * W * 0.3, H * 0.05);
      ctx.lineTo(cx, H * 0.25);
      ctx.stroke();
    }
  },

  shin(ctx, W, H, s, c) {
    const cx = W / 2, face = -s;
    ctx.fillStyle = '#b59f74';
    ctx.fillRect(cx - W * 0.42, 0, W * 0.84, H * 0.84);
    ctx.fillStyle = shade(ctx, W, H, s);
    ctx.fillRect(0, 0, W, H * 0.84);
    ctx.fillStyle = '#2a2d33';
    ctx.fillRect(cx - W * 0.3, H * 0.84, W * 0.6, H * 0.04);
    // loafer, pointing where he faces
    const toe = W * (0.32 + 0.4 * Math.abs(s));
    ellipse(ctx, cx + face * toe * 0.35, H * 0.92, toe * 0.75, H * 0.05, '#5a3018');
    ellipse(ctx, cx + face * toe * 0.35, H * 0.905, toe * 0.55, H * 0.02, c > 0 ? '#7a4526' : '#5a3018');
    ctx.fillStyle = '#2b1a0e';
    ctx.fillRect(cx + face * toe * 0.35 - toe * 0.75, H * 0.955, toe * 1.5, H * 0.012);
  },
};

function makePlaceholder(typeKey, view) {
  const t = TYPES[typeKey];
  const W = t.texW, H = t.texH;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const rad = THREE.MathUtils.degToRad(view.deg);
  const s = Math.sin(rad), c = Math.cos(rad);

  const bg = ctx.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H * 0.4, H * 0.7);
  bg.addColorStop(0, '#f6f8fa');
  bg.addColorStop(1, '#c4ccd6');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  DRAW[typeKey](ctx, W, H, s, c);

  // watermark
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.5);
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  for (let y = -H; y < H; y += 70) {
    for (let x = -W * 1.5; x < W * 1.5; x += 150) {
      const ox = x + ((y / 70) % 2) * 75;
      ctx.fillText('stock', ox, y);
      ctx.strokeText('stock', ox, y);
    }
  }
  ctx.restore();

  // caption strip
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(0, H - 40, W, 40);
  ctx.fillStyle = '#333';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(t.guy, 6, H - 24, W - 12);
  ctx.fillStyle = '#777';
  ctx.font = '11px sans-serif';
  ctx.fillText(`#${t.id + (hash(view.name) % 900)} · ${view.name}`, 6, H - 8, W - 12);

  // print border
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, W, H);
  return cv;
}

function canvasTexture(cv) {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Crop a photo to the part's card shape ("cover" fit).
function photoToCanvas(typeKey, img) {
  const t = TYPES[typeKey];
  const cv = document.createElement('canvas');
  cv.width = t.texW;
  cv.height = t.texH;
  const ctx = cv.getContext('2d');
  const scale = Math.max(cv.width / img.width, cv.height / img.height);
  const w = img.width * scale, h = img.height * scale;
  ctx.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
  return cv;
}

// ---------- Slots ----------

// slots[type][view] = { placeholder: {canvas, tex, url}, user: {canvas, tex, url} | null }
const slots = {};
for (const typeKey of Object.keys(TYPES)) {
  slots[typeKey] = {};
  for (const view of VIEWS) {
    const canvas = makePlaceholder(typeKey, view);
    slots[typeKey][view.name] = { placeholder: { canvas, tex: canvasTexture(canvas), url: null }, user: null };
  }
}

function resolve(typeKey, viewName) {
  const slot = slots[typeKey][viewName];
  if (slot.user) return { tex: slot.user.tex, flip: false, source: 'photo' };
  const mirror = slots[typeKey][MIRROR[viewName]];
  if (mirror.user) return { tex: mirror.user.tex, flip: true, source: 'mirrored photo' };
  return { tex: slot.placeholder.tex, flip: false, source: 'placeholder' };
}

function setUserImage(typeKey, viewName, img) {
  const slot = slots[typeKey][viewName];
  if (slot.user) slot.user.tex.dispose();
  const canvas = photoToCanvas(typeKey, img);
  slot.user = { canvas, tex: canvasTexture(canvas), url: null };
  refreshSlotTable();
}

function loadImage(src) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = src;
  });
}

function parseSlotName(filename) {
  const base = filename.replace(/\.[^.]+$/, '').toLowerCase();
  const i = base.indexOf('_');
  if (i < 0) return null;
  const typeKey = Object.keys(TYPES).find((k) => k.toLowerCase() === base.slice(0, i));
  const view = VIEWS.find((v) => v.name === base.slice(i + 1));
  return typeKey && view ? { typeKey, viewName: view.name } : null;
}

async function loadManifest() {
  try {
    const res = await fetch('images/manifest.json');
    if (!res.ok) return;
    const manifest = await res.json();
    await Promise.all(Object.entries(manifest).map(async ([key, file]) => {
      const slot = parseSlotName(key);
      if (!slot) return console.warn(`manifest: unknown slot "${key}"`);
      try {
        setUserImage(slot.typeKey, slot.viewName, await loadImage(`images/${file}`));
      } catch {
        console.warn(`manifest: couldn't load images/${file}`);
      }
    }));
  } catch {
    // No manifest is fine, placeholders stay.
  }
}

// ---------- Scene ----------

const canvasEl = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#dfe4ea');
scene.fog = new THREE.Fog('#dfe4ea', 14, 30);
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshBasicMaterial({ color: '#eef1f4' }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const grid = new THREE.GridHelper(80, 80, '#b8c1cc', '#cfd6de');
grid.position.y = 0.001;
scene.add(grid);

const shadowCanvas = document.createElement('canvas');
shadowCanvas.width = shadowCanvas.height = 64;
{
  const g = shadowCanvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
}
const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }),
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.002;
scene.add(shadow);

// ---------- Rig ----------

function joint(parent, x, y, z = 0) {
  const j = new THREE.Object3D();
  j.position.set(x, y, z);
  parent.add(j);
  return j;
}

const root = new THREE.Object3D();
scene.add(root);
const hips = joint(root, 0, STAND);
const spine = joint(hips, 0, 0);
const neck = joint(spine, 0, TORSO);
const headTop = joint(neck, 0, HEAD);
const rig = { root, hips, spine, neck };
for (const [side, sx] of [['L', 1], ['R', -1]]) {
  const shoulder = joint(spine, sx * SHOULDER_X, SHOULDER_Y);
  const elbow = joint(shoulder, 0, -UPPER);
  const hand = joint(elbow, 0, -FORE);
  const hip = joint(hips, sx * HIP_X, 0);
  const knee = joint(hip, 0, -THIGH);
  const ankle = joint(knee, 0, -SHIN);
  Object.assign(rig, { ['shoulder' + side]: shoulder, ['elbow' + side]: elbow, ['hand' + side]: hand, ['hip' + side]: hip, ['knee' + side]: knee, ['ankle' + side]: ankle });
}

const planeGeo = new THREE.PlaneGeometry(1, 1);
const flippedGeo = planeGeo.clone();
{
  const uv = flippedGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
}

// facing: which joint's forward direction decides the view for this part
const PARTS = [
  { type: 'head', from: neck, to: headTop, facing: neck },
  { type: 'torso', from: spine, to: neck, facing: spine },
  { type: 'upperArm', from: rig.shoulderL, to: rig.elbowL, facing: spine },
  { type: 'upperArm', from: rig.shoulderR, to: rig.elbowR, facing: spine },
  { type: 'forearm', from: rig.elbowL, to: rig.handL, facing: spine },
  { type: 'forearm', from: rig.elbowR, to: rig.handR, facing: spine },
  { type: 'thigh', from: rig.hipL, to: rig.kneeL, facing: hips },
  { type: 'thigh', from: rig.hipR, to: rig.kneeR, facing: hips },
  { type: 'shin', from: rig.kneeL, to: rig.ankleL, facing: hips },
  { type: 'shin', from: rig.kneeR, to: rig.ankleR, facing: hips },
];
for (const part of PARTS) {
  part.mesh = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  part.mesh.matrixAutoUpdate = false;
  part.view = null;
  part.source = null;
  scene.add(part.mesh);
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3();
const _toCam = new THREE.Vector3(), _right = new THREE.Vector3(), _normal = new THREE.Vector3();
const _mid = new THREE.Vector3(), _fwd = new THREE.Vector3(), _q = new THREE.Quaternion();

function viewFor(part) {
  part.facing.getWorldQuaternion(_q);
  _fwd.set(0, 0, 1).applyQuaternion(_q);
  const facingYaw = Math.atan2(_fwd.x, _fwd.z);
  const camYaw = Math.atan2(camera.position.x - _mid.x, camera.position.z - _mid.z);
  const deg = THREE.MathUtils.radToDeg(THREE.MathUtils.euclideanModulo(camYaw - facingYaw + Math.PI, Math.PI * 2) - Math.PI);
  const idx = ((Math.round(deg / 45) % 8) + 8) % 8;
  return VIEWS[idx];
}

function updateCards() {
  root.updateMatrixWorld(true);
  for (const part of PARTS) {
    const t = TYPES[part.type];
    part.from.getWorldPosition(_a);
    part.to.getWorldPosition(_b);
    _up.subVectors(_b, _a).normalize();
    _a.addScaledVector(_up, -t.ext[0]);
    _b.addScaledVector(_up, t.ext[1]);
    _mid.addVectors(_a, _b).multiplyScalar(0.5);
    const len = _a.distanceTo(_b);

    // Spin the card around its bone so it faces the camera as much as it can.
    _toCam.subVectors(camera.position, _mid);
    _right.crossVectors(_up, _toCam);
    if (_right.lengthSq() < 1e-6) _right.setFromMatrixColumn(camera.matrixWorld, 0);
    _right.normalize();
    _normal.crossVectors(_right, _up);
    part.mesh.matrix.makeBasis(
      _right.clone().multiplyScalar(t.w),
      _up.clone().multiplyScalar(len),
      _normal,
    ).setPosition(_mid);
    part.dist = _toCam.length();

    const view = viewFor(part);
    const { tex, flip, source } = resolve(part.type, view.name);
    part.view = view;
    part.source = source;
    if (part.mesh.material.map !== tex) {
      part.mesh.material.map = tex;
      part.mesh.material.needsUpdate = true;
    }
    part.mesh.geometry = flip ? flippedGeo : planeGeo;
  }
  // Cards don't write depth, so paint far to near.
  [...PARTS].sort((p, q) => q.dist - p.dist).forEach((p, i) => { p.mesh.renderOrder = 10 + i; });
}

// ---------- Poses ----------

// s = swing forward, a = raise out to the side, e = elbow bend, z = forearm sideways,
// k = knee bend. Everything in radians.
const REST = {
  lift: 0, lean: 0, twist: 0, roll: 0, hp: 0, hy: 0,
  aLs: 0, aLa: 0.08, aLe: 0.15, aLz: 0, aRs: 0, aRa: 0.08, aRe: 0.15, aRz: 0,
  lLs: 0, lLk: 0, lRs: 0, lRk: 0,
};
const pose = (over) => ({ ...REST, ...over });
const TAU = Math.PI * 2;

const ANIMS = {
  idle(t) {
    const b = Math.sin(t * 1.6);
    return pose({
      lean: 0.02 + 0.01 * b, roll: 0.015 * Math.sin(t * 0.8),
      hy: 0.18 * Math.sin(t * 0.45), hp: 0.03 * Math.sin(t * 0.7),
      aLa: 0.1 + 0.015 * b, aRa: 0.1 + 0.015 * b, lLs: 0.03, lRs: -0.03,
    });
  },
  walk(t) {
    const p = t * TAU * 0.95, sp = Math.sin(p), cp = Math.cos(p);
    return pose({
      lean: 0.05, twist: 0.1 * sp, hp: -0.03,
      lLs: 0.42 * sp, lRs: -0.42 * sp,
      lLk: 0.08 + 0.65 * Math.max(0, cp), lRk: 0.08 + 0.65 * Math.max(0, -cp),
      aLs: -0.38 * sp, aRs: 0.38 * sp, aLe: 0.3 + 0.15 * Math.max(0, -sp), aRe: 0.3 + 0.15 * Math.max(0, sp),
    });
  },
  run(t) {
    const p = t * TAU * 1.45, sp = Math.sin(p), cp = Math.cos(p);
    return pose({
      lift: 0.05 * Math.abs(sp), lean: 0.22, twist: 0.16 * sp, hp: -0.15,
      lLs: 0.1 + 0.72 * sp, lRs: 0.1 - 0.72 * sp,
      lLk: 0.25 + 1.35 * Math.max(0, cp), lRk: 0.25 + 1.35 * Math.max(0, -cp),
      aLs: -0.75 * sp, aRs: 0.75 * sp, aLe: 1.45, aRe: 1.45, aLa: 0.15, aRa: 0.15,
    });
  },
  wave(t) {
    return pose({
      ...ANIMS.idle(t), roll: -0.04, hy: -0.15, hp: -0.06,
      aRa: 2.5, aRs: 0.25, aRe: 0.35, aRz: 0.55 * Math.sin(t * 9),
    });
  },
  dance(t) {
    const q = t * TAU, sq = Math.sin(q);
    const bounce = 1 - Math.abs(Math.sin(q * 2));
    return pose({
      roll: 0.12 * sq, twist: 0.3 * Math.sin(q * 0.5), hy: 0.35 * sq, hp: -0.1 * bounce,
      lLs: 0.2 + 0.15 * bounce, lRs: 0.2 + 0.15 * bounce,
      lLk: 0.3 + 0.4 * bounce, lRk: 0.3 + 0.4 * bounce,
      aLs: 0.4, aRs: 0.4, aLe: 0.6, aRe: 0.6,
      aLa: 1.1 + 1.3 * Math.max(0, sq), aRa: 1.1 + 1.3 * Math.max(0, -sq),
    });
  },
  crouch() {
    return pose({ lean: 0.4, hp: -0.2, lLs: 0.6, lRs: 0.6, lLk: 1.2, lRk: 1.2, aLs: -0.7, aRs: -0.7, aLe: 0.2, aRe: 0.2 });
  },
  air(rise) {
    // rise: 1 leaving the ground, 0 at the top, -1 coming down
    const tuck = 1 - Math.abs(rise);
    return pose({
      lean: 0.1 - 0.1 * rise, hp: -0.1,
      lLs: 0.15 + 0.6 * tuck, lRs: 0.1 + 0.55 * tuck,
      lLk: 0.2 + 1.2 * tuck, lRk: 0.25 + 1.2 * tuck,
      aLs: 0.5, aRs: 0.5, aLa: 1.8 + 0.6 * tuck, aRa: 1.8 + 0.6 * tuck, aLe: 0.3, aRe: 0.3,
    });
  },
};

const current = { ...REST };
function blendToward(target, rate, dt) {
  const k = 1 - Math.exp(-rate * dt);
  for (const key in current) current[key] += (target[key] - current[key]) * k;
}

function legHeight(swing, knee) {
  return THIGH * Math.cos(swing) + SHIN * Math.cos(swing - knee);
}

function applyPose(p, groundY, airW) {
  const grounded = Math.max(legHeight(p.lLs, p.lLk), legHeight(p.lRs, p.lRk)) + FOOT;
  hips.position.y = groundY + THREE.MathUtils.lerp(grounded, STAND, airW) + p.lift;
  hips.rotation.set(0, 0, p.roll);
  spine.rotation.set(p.lean, p.twist, -p.roll * 0.6);
  neck.rotation.set(p.hp, p.hy, 0);
  rig.shoulderL.rotation.set(-p.aLs, 0, p.aLa);
  rig.elbowL.rotation.set(-p.aLe, 0, p.aLz);
  rig.shoulderR.rotation.set(-p.aRs, 0, -p.aRa);
  rig.elbowR.rotation.set(-p.aRe, 0, -p.aRz);
  rig.hipL.rotation.set(-p.lLs, 0, 0);
  rig.kneeL.rotation.set(p.lLk, 0, 0);
  rig.hipR.rotation.set(-p.lRs, 0, 0);
  rig.kneeR.rotation.set(p.lRk, 0, 0);
}

// ---------- Character state ----------

const SPEED = { walk: 1.4, run: 3.8 };
const CIRCLE = 3;
const state = {
  anim: 'idle',          // button choice
  yaw: 0,
  circleAngle: 0,
  y: 0, vy: 0,
  jump: null,            // { phase: 'crouch' | 'air' | 'land', t }
  airW: 0,
};
const keys = new Set();

function startJump() {
  if (!state.jump) state.jump = { phase: 'crouch', t: 0 };
}

function stepCharacter(dt, t) {
  // Movement: keys move relative to the camera, walk/run buttons circle the studio.
  const ix = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const iz = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  let gait = state.anim;
  let move = null;
  if (ix || iz) {
    gait = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 'run' : 'walk';
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const dir = new THREE.Vector3(fx * iz - fz * ix, 0, fz * iz + fx * ix).normalize();
    move = dir.multiplyScalar(SPEED[gait] * dt);
  } else if (gait === 'walk' || gait === 'run') {
    state.circleAngle += (SPEED[gait] / CIRCLE) * dt;
    const a = state.circleAngle;
    const target = new THREE.Vector3(Math.sin(a) * CIRCLE, 0, Math.cos(a) * CIRCLE);
    move = target.sub(root.position).setY(0);
    if (move.length() > SPEED[gait] * dt * 1.5) move.setLength(SPEED[gait] * dt);
  }
  if (move && move.lengthSq() > 1e-8) {
    root.position.add(move);
    const want = Math.atan2(move.x, move.z);
    const diff = THREE.MathUtils.euclideanModulo(want - state.yaw + Math.PI, TAU) - Math.PI;
    state.yaw += diff * (1 - Math.exp(-10 * dt));
  }
  root.rotation.y = state.yaw;
  if (!(gait in ANIMS)) gait = 'idle';

  // Jump overrides the pose.
  let target = ANIMS[gait](t);
  let rate = 10;
  const j = state.jump;
  if (j) {
    j.t += dt;
    if (j.phase === 'crouch') {
      target = ANIMS.crouch();
      rate = 22;
      if (j.t > 0.2) { j.phase = 'air'; j.t = 0; state.vy = 4.4; }
    } else if (j.phase === 'air') {
      state.vy -= 12 * dt;
      state.y += state.vy * dt;
      target = ANIMS.air(THREE.MathUtils.clamp(state.vy / 4.4, -1, 1));
      rate = 14;
      if (state.y <= 0) { state.y = 0; state.vy = 0; j.phase = 'land'; j.t = 0; }
    } else {
      target = ANIMS.crouch();
      rate = 25;
      if (j.t > 0.18) state.jump = null;
    }
  }
  const inAir = j && j.phase === 'air';
  state.airW += ((inAir ? 1 : 0) - state.airW) * (1 - Math.exp(-(inAir ? 6 : 30) * dt));
  blendToward(target, rate, dt);
  applyPose(current, state.y, state.airW);

  shadow.position.x = root.position.x;
  shadow.position.z = root.position.z;
  const sh = 0.9 / (1 + state.y * 0.8);
  shadow.scale.set(sh, sh, 1);
}

// ---------- Camera ----------

const cam = { yaw: 0.6, pitch: 0.18, dist: 4.2, auto: true, target: new THREE.Vector3(0, 1, 0) };

function updateCamera(dt) {
  if (cam.auto) cam.yaw += dt * 0.4;
  const want = new THREE.Vector3(root.position.x, 0.95 + state.y * 0.5, root.position.z);
  cam.target.lerp(want, 1 - Math.exp(-6 * dt));
  const cp = Math.cos(cam.pitch);
  camera.position.set(
    cam.target.x + Math.sin(cam.yaw) * cp * cam.dist,
    cam.target.y + Math.sin(cam.pitch) * cam.dist,
    cam.target.z + Math.cos(cam.yaw) * cp * cam.dist,
  );
  camera.lookAt(cam.target);
  camera.updateMatrixWorld();
}

let drag = null;
canvasEl.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY };
  canvasEl.setPointerCapture(e.pointerId);
  setAutoOrbit(false);
});
canvasEl.addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.yaw -= (e.clientX - drag.x) * 0.008;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + (e.clientY - drag.y) * 0.006, -0.2, 1.35);
  drag = { x: e.clientX, y: e.clientY };
});
canvasEl.addEventListener('pointerup', () => { drag = null; });
canvasEl.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.dist = THREE.MathUtils.clamp(cam.dist * Math.exp(e.deltaY * 0.001), 1.5, 14);
}, { passive: false });

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  keys.add(e.code);
  if (e.code === 'Space') { e.preventDefault(); startJump(); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// ---------- UI ----------

const animButtons = document.querySelectorAll('#anims button');
for (const btn of animButtons) {
  btn.addEventListener('click', () => {
    const anim = btn.dataset.anim;
    if (anim === 'jump') return startJump();
    state.anim = anim;
    for (const b of animButtons) b.classList.toggle('on', b === btn);
  });
}

const orbitBtn = document.getElementById('orbit');
function setAutoOrbit(on) {
  cam.auto = on;
  orbitBtn.classList.toggle('on', on);
}
orbitBtn.addEventListener('click', () => setAutoOrbit(!cam.auto));

const slotsPanel = document.getElementById('slots');
document.getElementById('slots-toggle').addEventListener('click', () => slotsPanel.classList.toggle('open'));
document.getElementById('slots-close').addEventListener('click', () => slotsPanel.classList.remove('open'));

const filePicker = document.createElement('input');
filePicker.type = 'file';
filePicker.accept = 'image/*';
let pickTarget = null;
filePicker.addEventListener('change', async () => {
  const file = filePicker.files[0];
  if (file && pickTarget) await assignFile(pickTarget.typeKey, pickTarget.viewName, file);
  filePicker.value = '';
});

async function assignFile(typeKey, viewName, file) {
  const url = URL.createObjectURL(file);
  try {
    setUserImage(typeKey, viewName, await loadImage(url));
  } finally {
    URL.revokeObjectURL(url);
  }
}

document.getElementById('folder').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  let used = 0;
  for (const file of files) {
    const slot = parseSlotName(file.name);
    if (!slot) continue;
    await assignFile(slot.typeKey, slot.viewName, file);
    used++;
  }
  alert(`Loaded ${used} of ${files.length} files into slots.`);
  e.target.value = '';
});

const table = document.getElementById('slot-table');
function thumb(entry) {
  if (!entry.url) entry.url = entry.canvas.toDataURL('image/jpeg', 0.7);
  return entry.url;
}

function refreshSlotTable() {
  table.innerHTML = '';
  const head = table.insertRow();
  head.appendChild(document.createElement('th'));
  for (const view of VIEWS) {
    const th = document.createElement('th');
    th.textContent = view.name;
    head.appendChild(th);
  }
  for (const typeKey of Object.keys(TYPES)) {
    const row = table.insertRow();
    const th = document.createElement('th');
    th.className = 'part';
    th.textContent = TYPES[typeKey].label;
    row.appendChild(th);
    for (const view of VIEWS) {
      const slot = slots[typeKey][view.name];
      const mirror = slots[typeKey][MIRROR[view.name]];
      const cell = document.createElement('div');
      cell.className = 'cell';
      let entry = slot.placeholder;
      if (slot.user) {
        entry = slot.user;
        cell.classList.add('user');
      } else if (mirror.user) {
        entry = mirror.user;
        cell.classList.add('mirror');
      }
      const img = document.createElement('div');
      img.style.cssText = `position:absolute;inset:0;background:url(${thumb(entry)}) center/cover;border-radius:3px;`;
      if (cell.classList.contains('mirror')) img.style.transform = 'scaleX(-1)';
      cell.appendChild(img);
      cell.title = `${TYPES[typeKey].label}, ${view.name}`;
      cell.addEventListener('click', () => {
        pickTarget = { typeKey, viewName: view.name };
        filePicker.click();
      });
      cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('drag'); });
      cell.addEventListener('dragleave', () => cell.classList.remove('drag'));
      cell.addEventListener('drop', async (e) => {
        e.preventDefault();
        cell.classList.remove('drag');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) await assignFile(typeKey, view.name, file);
      });
      row.insertCell().appendChild(cell);
    }
  }
}

const readout = document.getElementById('readout');
function updateReadout() {
  const lines = [];
  const seen = new Set();
  for (const part of PARTS) {
    if (seen.has(part.type)) continue;
    seen.add(part.type);
    lines.push(`${TYPES[part.type].label.padEnd(10)} ${part.view.name.padEnd(12)} ${part.source}`);
  }
  readout.textContent = '';
  const pre = document.createElement('pre');
  pre.style.margin = '0';
  pre.textContent = 'part       camera sees  using\n' + lines.join('\n');
  readout.appendChild(pre);
}

// ---------- Loop ----------

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

refreshSlotTable();
loadManifest();

const clock = new THREE.Clock();
let readoutTimer = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  stepCharacter(dt, t);
  updateCamera(dt);
  updateCards();
  renderer.render(scene, camera);
  readoutTimer -= dt;
  if (readoutTimer <= 0) { updateReadout(); readoutTimer = 0.15; }
  requestAnimationFrame(frame);
}
frame();

// Handy for poking at it from the console.
window.stockRig = { state, cam, slots, setUserImage, ANIMS, startJump };
