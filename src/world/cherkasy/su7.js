// OWNER: cherkasy. Літак Су-7БКЛ, the memorial to the pilots of the 8th Guards bomber aviation division who freed
// Cherkasy on 14 Dec 1943 (raised in 1980, rebuilt in 2020), at the main entrance of park 30-richchia Peremohy by the
// roundabout of prosp. Peremohy, vul. Smilianska and prosp. Khimikiv (OSM node 850045612 "Літак", inside the little
// diamond of paths; issue #17). Built after the Wikimedia Commons photos (2008-2020): a real Su-7 climbing at ~33 deg
// on a slanted steel pylon (~45 deg, a T cap under the belly) toward the paved square and the roundabout; the pylon
// grows out of the front end of a long white inverted wedge that lies on a red polished granite plinth (~2 m) over
// three grey steps. The front face carries the silver star of the Order of the Patriotic War and the black plaque
// "Подвигу 8-ї Черкаської гвардійської бомбардувальної дивізії…", with the 2020 letters "СЛАВА ГЕРОЯМ" above them.
// The 2020 paint: bare silver, the red stars gone; a blue-over-yellow band round the fuselage at the wing roots, blue
// and yellow stripes along the leading edges of the wings, tailplane and fin, a blue shock cone; four UB-16 rocket
// pods stay under the wings. At dusk ground projectors in front wash the plane and the granite (bohdan.js floodlit()).
//   SU7_SKIP: empty (no OSM building is replaced)
//   levelSu7(hf, map, geo) -> level   terrain hook (city.js): levels the paved square round the plinth
//   buildSu7({ root, map, geo, solids, heightAt }) -> { update(dt), clear(x, z), spots } | null
// The site frame: local +z (d) = the heading (the nose, toward the square and the roundabout, along the diamond's long
// axis), local +x (a) = the plane's left; the plinth centre at the OSM node. The plane is drawn in its own frame
// (X its left, Y up, Z forward, the belly under the wing roots at the origin) and pitched onto the pylon top.
import * as THREE from 'three';
import { MB, M4, rotX } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { PARK_PINE } from '../trees.js';
import { canvasTex, decal } from './sculpt.js';
import { graniteTex, slabTex, floodlit } from './bohdan.js';

export const SU7_SKIP = new Set();

const PI = Math.PI;
const LL = [49.4155013, 32.028787];   // the OSM node: the plinth centre
const HEAD = [0.72, 0.69];            // map heading of the nose: the diamond of paths round it (x, z)
const YAW = Math.atan2(HEAD[0], HEAD[1]);
const PL = [2.2, 4.6, 1.85];          // plinth half across, half long, height over the steps
const STEPS = 3, STEP_H = 0.15, STEP_W = 0.4;
const PYLON = { d: 2.0, up: 0.9, ang: PI / 4, len: 9.5 }; // base (along d, above the plinth), angle, length
const PITCH = 0.58;                   // the plane's climb, rad (~33 deg)
const PAVE = [-4.6, -7.2, 4.6, 10.5]; // the paved square in the site frame [a0, d0, a1, d1]
const CLEAR = [-7, -8, 7, 18];        // no generated trees under the plinth and the plane

const C = { silver: '#c3c7cb', blue: '#1d5fc6', yellow: '#ffd21a', dark: '#26292c', glass: '#34434e', steel: '#d6d9dc', red: [0.62, 0.27, 0.21], step: [0.6, 0.6, 0.58] };

// ------------------------------------------------------------------------------------------------ helpers
// a box on three axes (u, v, w unit vectors) round centre c with half sizes hu, hv, hw
function obox3(D, c, u, v, w, hu, hv, hw) {
  const P = (su, sv, sw) => [0, 1, 2].map((i) => c[i] + u[i] * hu * su + v[i] * hv * sv + w[i] * hw * sw);
  for (const [ax, s] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
    const n = [u, v, w][ax].map((q) => q * s), q = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    D.face(q.map(([p, r]) => { const k = [0, 0, 0]; k[ax] = s; k[(ax + 1) % 3] = p; k[(ax + 2) % 3] = r; return P(...k); }), n);
  }
}
// a thin tapered panel (wing, tailplane, fin) in bands of colour along its leading edge. root / tip: { a (span
// coordinate), c (leading edge, chord coordinate, + forward), len (chord), t (half thickness) }; bands [[d0, d1, colour]]
// in metres back from the leading edge; to3(a, c, h) -> [x, y, z], h across the panel; n: the panel's normal
function panel(D, root, tip, bands, to3, n) {
  const at = (e, d, h) => to3(e.a, e.c - Math.min(d, e.len), h * e.t * (1 - 0.6 * Math.min(d, e.len) / e.len));
  for (const [d0, d1, col] of bands) {
    if (d0 >= root.len && d0 >= tip.len) continue;
    D.setColor(col);
    for (const s of [1, -1]) D.face([at(root, d0, s), at(root, d1, s), at(tip, d1, s), at(tip, d0, s)], n.map((q) => q * s));
    D.face([at(tip, d0, 1), at(tip, d1, 1), at(tip, d1, -1), at(tip, d0, -1)]); // the tip edge
  }
  D.setColor(bands[0][2]).face([at(root, 0, 1), at(tip, 0, 1), at(tip, 0, -1), at(root, 0, -1)]); // leading edge
  D.setColor(bands[bands.length - 1][2]).face([at(root, 99, 1), at(tip, 99, 1), at(tip, 99, -1), at(root, 99, -1)]);
}

// ------------------------------------------------------------------------------------------------ the Su-7BKL
// in the plane frame: X its left, Y up, Z forward; the belly under the wing roots at the origin, the axis at Y 0.8
function su7(D) {
  const Y0 = 0.8, lathe = (prof, col, seg = 18) => D.setColor(col).with(rotX(PI / 2), (q) => q.lathe(prof, seg, 0, -Y0));
  // ---- the fuselage: the round nose intake, the long tube, the nozzle; painted in bands along Z
  const R = [[0.5, -7.6], [0.58, -7.2], [0.66, -6.3], [0.75, -4.6], [0.8, -2.5], [0.8, 1.4], [0.8, 2.0], [0.8, 2.6], [0.79, 3.6], [0.74, 5.2], [0.64, 6.7], [0.54, 7.8], [0.47, 8.3]];
  const part = (z0, z1) => R.filter(([, z]) => z >= z0 && z <= z1);
  lathe(part(-7.6, 1.4), C.silver); lathe(part(1.4, 2.0), C.yellow); lathe(part(2.0, 2.6), C.blue); lathe(part(2.6, 8.3), C.silver);
  lathe([[0.47, 8.3], [0.41, 8.28], [0.39, 7.6]], C.dark);           // the intake lip and duct
  D.setColor(C.dark).with(rotX(PI / 2), (q) => q.cyl(0, 7.55, -Y0, 0.39, 0.39, 0.02, 14, true));
  lathe([[0.31, 7.7], [0.26, 8.25], [0.13, 8.62], [0.0, 8.78]], C.blue, 12); // the shock cone
  lathe([[0.44, -7.75], [0.5, -7.6]], C.dark, 14);                   // the nozzle rim
  D.setColor(C.dark).with(rotX(PI / 2), (q) => q.cyl(0, -7.62, -Y0, 0.45, 0.45, 0.02, 14, true));
  // ---- the bubble canopy, the dorsal spine back to the fin, the pitot boom on the nose's upper right
  D.setColor(C.glass).ellipsoid([0, Y0 + 0.62, 5.0], [0.36, 0.38, 0.95], 12, 8);
  D.setColor(C.silver).tube([0, Y0 + 0.66, 4.1], [0, Y0 + 0.74, -4.6], 0.2, 6, true);
  D.tube([-0.3, Y0 + 0.4, 6.9], [-0.3, Y0 + 0.42, 7.9], 0.07, 6, true).tube([-0.3, Y0 + 0.42, 7.9], [-0.3, Y0 + 0.42, 10.5], 0.03, 5, true);
  // ---- 60-degree mid wings with two fences each, the low swept all-moving tailplane, the tall swept fin
  const tan60 = Math.tan(PI / 3), tan55 = Math.tan(55 * PI / 180);
  const wingB = [[0, 0.3, C.blue], [0.3, 0.6, C.yellow], [0.6, 99, C.silver]], tailB = [[0, 0.2, C.blue], [0.2, 0.4, C.yellow], [0.4, 99, C.silver]];
  for (const sd of [1, -1]) {
    const root = { a: 0.7, c: 1.9, len: 5.5, t: 0.1 }, tip = { a: 4.65, c: 1.9 - 3.95 * tan60, len: 1.5, t: 0.05 };
    panel(D, root, tip, wingB, (a, c, h) => [sd * a, Y0 + h, c], [0, 1, 0]);
    for (const fa of [2.0, 3.25]) { // the fences: LE round to near the trailing edge
      const k = (fa - 0.7) / 3.95, cl = 1.9 - (fa - 0.7) * tan60, len = 5.5 + (1.5 - 5.5) * k;
      D.setColor(C.silver).face([[sd * fa, Y0 + 0.04, cl + 0.05], [sd * fa, Y0 + 0.04, cl - len * 0.85], [sd * fa, Y0 + 0.12, cl - len * 0.8], [sd * fa, Y0 + 0.18, cl - 0.3]]);
    }
    const tr = { a: 0.55, c: -4.7, len: 2.3, t: 0.06 }, tt = { a: 2.45, c: -4.7 - 1.9 * tan55, len: 0.8, t: 0.03 };
    panel(D, tr, tt, tailB, (a, c, h) => [sd * a, Y0 - 0.35 + h, c], [0, 1, 0]);
    // two UB-16 rocket pods under each wing on short pylons
    for (const pa of [1.5, 2.35]) {
      const zc = 1.9 - (pa - 0.7) * tan60 - 1.05, yc = Y0 - 0.48;
      D.setColor(C.silver).with(rotX(PI / 2), (q) => q.lathe([[0.15, zc - 0.95], [0.17, zc - 0.7], [0.17, zc + 0.55], [0.12, zc + 0.85], [0.06, zc + 0.98]], 10, sd * pa, -yc));
      D.setColor(C.dark).with(rotX(PI / 2), (q) => q.cyl(sd * pa, zc + 0.97, -yc, 0.06, 0.06, 0.02, 8, true));
      obox3(D.setColor(C.silver), [sd * pa, Y0 - 0.22, zc + 0.1], [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.03, 0.16, 0.7);
    }
  }
  panel(D, { a: 0.6, c: -3.6, len: 3.4, t: 0.07 }, { a: 2.9, c: -3.6 - 2.3 * tan55, len: 1.1, t: 0.035 }, tailB, (a, c, h) => [h, Y0 + a, c], [1, 0, 0]);
  obox3(D.setColor(C.silver), [0, Y0 - 0.75, -5.6], [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.04, 0.22, 0.9); // the ventral strake
  return D;
}

// ------------------------------------------------------------------------------------------------ the front face
const faceTex = () => canvasTex(1024, 512, (c, w, h) => {
  c.clearRect(0, 0, w, h);
  // the 2020 letters, brushed metal
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 92px "Helvetica Neue", Arial, sans-serif';
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillText('СЛАВА ГЕРОЯМ', w / 2 + 3, 86 + 3);
  c.fillStyle = '#e4e2dc'; c.fillText('СЛАВА ГЕРОЯМ', w / 2, 86);
  // the Order of the Patriotic War: an eight-ray silver star with a red-free medallion
  const sx = 230, sy = 330, star = (R, r, n, rot) => { c.beginPath(); for (let k = 0; k < n * 2; k++) { const a = rot + k * PI / n, q = k & 1 ? r : R; c.lineTo(sx + q * Math.cos(a), sy + q * Math.sin(a)); } c.closePath(); };
  c.fillStyle = '#9aa0a6'; star(150, 62, 8, -PI / 2); c.fill();
  c.fillStyle = '#e8ebee'; star(118, 50, 8, -PI / 2 + PI / 8); c.fill();
  c.fillStyle = '#b8bec4'; c.beginPath(); c.arc(sx, sy, 46, 0, 2 * PI); c.fill();
  c.strokeStyle = '#7d848a'; c.lineWidth = 6; c.stroke();
  // the black plaque
  c.fillStyle = '#141414'; c.fillRect(470, 220, 470, 230);
  c.strokeStyle = '#6a6a6a'; c.lineWidth = 4; c.strokeRect(476, 226, 458, 218);
  c.fillStyle = '#e9e6dc'; c.font = 'bold 30px Georgia, serif';
  ['Подвигу', '8-ї Черкаської гвардійської', 'бомбардувальної дивізії,', 'що звільняла м. Черкаси,', 'присвячується'].forEach((s, i) => c.fillText(s, 705, 254 + i * 34));
  c.font = 'italic 22px Georgia, serif'; c.fillText('14 грудня 1943', 705, 430);
}, { repeat: false });

// ------------------------------------------------------------------------------------------------ site
const frameOf = (geo) => {
  const [ox, oz] = geo.toXZ(...LL), fx = Math.sin(YAW), fz = Math.cos(YAW), sx = fz, sz = -fx;
  return { ox, oz, W: (a, d) => [ox + sx * a + fx * d, oz + sz * a + fz * d], ang: Math.atan2(sz, sx) };
};
const paveRing = (geo) => { const { W } = frameOf(geo), [a0, d0, a1, d1] = PAVE; return [W(a0, d0), W(a1, d0), W(a1, d1), W(a0, d1)]; };
// terrain hook (city.js, before the ground builds): one level for the square, so the steps sit true all round
export function levelSu7(hf, map, geo) { return hf.pad(paveRing(geo), 14); }

export function buildSu7({ root, geo, solids: S, heightAt }) {
  if (!geo) return null;
  const t0 = performance.now();
  const { ox, oz, W, ang } = frameOf(geo);
  const g = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 30; };
  const hs = paveRing(geo).map(([x, z]) => g(x, z)).concat([g(ox, oz)]).sort((a, b) => a - b);
  const L = hs[hs.length >> 1];
  const P = M4(ox, 0, oz, YAW);
  const box = (a, d, ha, hd, y0, y1, kind = 'wall') => { const [x, z] = W(a, d); return S.obox(x, z, ha, hd, ang, y0, y1, kind); };
  const B = { gran: new MB(), step: new MB(), steel: new MB(), plane: new MB(), glow: new MB() };

  // ---------------------------------------------------------------- steps, the red plinth
  const [pa, pd, ph] = PL, yS = L + STEPS * STEP_H, yP = yS + ph;
  for (let k = 0; k < STEPS; k++) {
    const m = (STEPS - k) * STEP_W, y1 = L + (k + 1) * STEP_H;
    B.step.setColor(C.step).with(P, (q) => q.box(-pa - m, L - 0.4, -pd - m, pa + m, y1, pd + m, 1 | 2 | 4 | 16 | 32));
    box(0, 0, pa + m, pd + m, L - 0.4, y1, 'ledge');
  }
  B.gran.setColor(C.red).with(P, (q) => q.box(-pa, yS - 0.05, -pd, pa, yP, pd, 1 | 2 | 4 | 16 | 32));
  B.gran.setColor([0.55, 0.24, 0.19]).with(P, (q) => q.box(-pa - 0.05, yP - 0.12, -pd - 0.05, pa + 0.05, yP, pd + 0.05, 1 | 2 | 4 | 16 | 32)); // the cap course
  box(0, 0, pa, pd, yS - 0.05, yP);

  // ---------------------------------------------------------------- the white wedge and the slanted pylon
  const yWt = yP + 1.2, dW0 = -pd + 0.4, dW1 = PYLON.d + 0.5;
  B.steel.setColor(C.steel).with(P, (q) => {
    const sec = (d) => [[-1.4, yWt, d], [1.4, yWt, d], [0.45, yP, d], [-0.45, yP, d]];
    const A = sec(dW0), Z = sec(dW1);
    q.face([A[0], A[1], Z[1], Z[0]], [0, 1, 0]);
    q.face([A[1], A[2], Z[2], Z[1]]); q.face([A[3], A[0], Z[0], Z[3]]);
    q.face(A, [0, 0, -1]); q.face(Z, [0, 0, 1]);
    q.setColor('#b9bcbf');
    for (let k = 1; k < 4; k++) { const d = dW0 + (dW1 - dW0) * k / 4; q.face([[-1.4, yWt + 0.01, d - 0.03], [1.4, yWt + 0.01, d - 0.03], [1.4, yWt + 0.01, d + 0.03], [-1.4, yWt + 0.01, d + 0.03]], [0, 1, 0]); } // the panel joints
  });
  box(0, (dW0 + dW1) / 2, 1.2, (dW1 - dW0) / 2, yP, yWt);
  const e = [0, Math.sin(PYLON.ang), Math.cos(PYLON.ang)], nrm = [0, -e[2], e[1]], X = [1, 0, 0];
  const base = [0, yP + PYLON.up, PYLON.d], top = base.map((v, i) => v + e[i] * PYLON.len);
  const along = (t) => base.map((v, i) => v + e[i] * t);
  B.steel.setColor(C.steel).with(P, (q) => {
    const c = along(PYLON.len / 2 - 0.5);
    obox3(q, c, X, nrm, e, 0.42, 0.3, PYLON.len / 2 + 0.5);                                         // the main blade
    obox3(q, c.map((v, i) => v + nrm[i] * 0.42), X, nrm, e, 0.16, 0.14, PYLON.len / 2 + 0.3);     // the rib underneath
    q.setColor('#c9ccd0');
    obox3(q, top.map((v, i) => v + e[i] * -0.1), X, [0, 1, 0], [0, 0, 1], 0.55, 0.12, 0.65);      // the T cap under the belly
  });
  for (let k = 0; k < 4; k++) { // collision: the blade in four steps up its slope
    const t = PYLON.len * (k + 0.5) / 4, c = along(t), dy = PYLON.len / 8 * e[1];
    box(0, c[2], 0.45, PYLON.len / 8 * e[2] + 0.35, c[1] - dy - 0.3, c[1] + dy + 0.3, 'pole');
  }

  // ---------------------------------------------------------------- the plane on the pylon top
  const planeM = P.clone().multiply(new THREE.Matrix4().makeTranslation(top[0], top[1] + 0.02, top[2])).multiply(rotX(-PITCH));
  B.plane.with(planeM, (q) => su7(q));
  const pp = (Z, Y = 0.8, Xp = 0) => { const v = new THREE.Vector3(Xp, Y, Z).applyMatrix4(rotX(-PITCH)); return [v.x, v.y + top[1], v.z + top[2]]; }; // plane -> site (a, y, d)
  for (const z of [-6, -3, 0, 3, 6]) { const [, y, d] = pp(z); box(0, d, 0.8, 1.35, y - 1.6, y + 1.6); } // the fuselage
  for (const sd of [1, -1]) { const [, y, d] = pp(-1.6, 0.8, 0); box(sd * 2.7, d - 0.6, 2.0, 2.3, y - 1.5, y + 1.1); } // the wings, coarse
  { const [, y, d] = pp(-6.2, 2.3); box(0, d, 0.12, 1.3, y - 1.4, y + 1.4); } // the fin

  // ---------------------------------------------------------------- projectors in the square for the evening wash
  const flood = [];
  for (const [a, d] of [[-3.0, pd + 4.5], [3.0, pd + 4.5], [0, pd + 8.5], [0, -pd - 1.6]]) {
    const [x, z] = W(a, d), y = g(x, z) + 0.2, m = M4(x, y, z, YAW);
    B.step.setColor([0.03, 0.03, 0.035]).with(m, (q) => q.box(-0.2, -0.2, -0.16, 0.2, 0.12, 0.16));
    B.glow.setColor('#fff4dc').with(m, (q) => q.box(-0.16, 0.12, -0.12, 0.16, 0.14, 0.12, 4));
    flood.push([x, y + 0.5, z]);
  }

  // ---------------------------------------------------------------- the paved square, draped on the levelled ground
  const [a0, d0, a1, d1] = PAVE;
  const plane = new THREE.PlaneGeometry(a1 - a0, d1 - d0, Math.ceil((a1 - a0) / 2), Math.ceil((d1 - d0) / 2));
  { const Pp = plane.attributes.position, T = plane.attributes.uv;
    for (let i = 0; i < Pp.count; i++) {
      const a = (a0 + a1) / 2 + Pp.getX(i), d = (d0 + d1) / 2 - Pp.getY(i), [x, z] = W(a, d);
      Pp.setXYZ(i, x, g(x, z) + 0.22, z); T.setXY(i, a / 4, d / 4);
    }
    plane.computeVertexNormals(); if (plane.attributes.normal.getY(0) < 0) plane.index.array.reverse(); plane.computeVertexNormals(); }

  // ---------------------------------------------------------------- meshes
  const group = Object.assign(new THREE.Group(), { name: 'su7' });
  root.add(group);
  const gTex = graniteTex();
  const M = {
    gran: floodlit(new THREE.MeshStandardMaterial({ map: gTex, emissiveMap: gTex, vertexColors: true, roughness: 0.45, metalness: 0.05, emissive: 0xc8705c, emissiveIntensity: 0 }), flood, 16, 'su7'),
    step: new THREE.MeshStandardMaterial({ map: gTex, vertexColors: true, roughness: 0.8 }),
    steel: floodlit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.35, side: THREE.DoubleSide, emissive: 0xe6ecff, emissiveIntensity: 0 }), flood, 22, 'su7'),
    plane: floodlit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.55, side: THREE.DoubleSide, emissive: 0xe6ecff, emissiveIntensity: 0 }), flood, 26, 'su7'),
    glow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: 0xffe0b0, emissiveIntensity: 0 }),
  };
  let nV = 0;
  for (const [k, D] of Object.entries(B)) {
    if (!D.v) continue;
    nV += D.v;
    group.add(Object.assign(new THREE.Mesh(D.build(), M[k]), { name: 'su7-' + k, castShadow: k !== 'glow', receiveShadow: true }));
  }
  group.add(Object.assign(new THREE.Mesh(plane, decal(new THREE.MeshStandardMaterial({ map: slabTex(), color: 0xb4b0a8, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -4 }))), { name: 'su7-square', receiveShadow: true }));
  const fTex = faceTex(), faceMat = new THREE.MeshStandardMaterial({ map: fTex, transparent: true, alphaTest: 0.3, roughness: 0.35, metalness: 0.3, emissive: 0xffe8c8, emissiveMap: fTex, emissiveIntensity: 0 });
  { const [x, z] = W(0, pd + 0.012), m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), faceMat);
    m.position.set(x, yS + ph / 2, z); m.rotation.y = YAW; m.name = 'su7-face'; group.add(m); }

  // the thujas and junipers round the plinth (the photos: dark cones by the corners, low junipers along the sides)
  const spots = [];
  for (const [a, d, sc] of [[-6.4, -3.5, 0.75], [6.4, -3.2, 0.8], [-6.8, 2.5, 0.65], [6.6, 3, 0.7], [-2.5, -9.5, 0.9], [2.8, -9.8, 0.85]]) {
    const [x, z] = W(a, d); spots.push({ x, z, kind: 'conifer', variant: 'spruce', sc, pal: PARK_PINE, s3: [0.55, 1.15, 0.55] });
  }

  console.log(`[cherkasy] Su-7BKL memorial: plinth top ${(yP - L).toFixed(1)} m, plane at ${(top[1] - L).toFixed(1)} m, ${(nV / 1000).toFixed(1)}k verts in ${(performance.now() - t0).toFixed(0)} ms`);
  const [c0, e0, c1, e1] = CLEAR, fx = Math.sin(YAW), fz = Math.cos(YAW);
  return {
    spots,
    clear: (x, z) => { const dx = x - ox, dz = z - oz, a = dx * fz - dz * fx, d = dx * fx + dz * fz; return a > c0 && a < c1 && d > e0 && d < e1; },
    update() {
      const k = Math.min(1, 3 * nightK.value);
      M.plane.emissiveIntensity = 0.16 * k; M.steel.emissiveIntensity = 0.14 * k; M.gran.emissiveIntensity = 0.05 * k;
      faceMat.emissiveIntensity = 0.25 * k; M.glow.emissiveIntensity = 2.5 * k;
    },
  };
}
