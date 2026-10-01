// OWNER: cherkasy. Пам'ятник Бояну on ploshcha 700-richchia Cherkas, the corner of bul. Shevchenka and vul. Sinna (OSM node
// 1676891191 "Бояну пам'ятник", the fountain way 401155133 in front of it; issue #8). Raised in 1986 for the city's 700th
// anniversary (sculptor A. Kushch, architect O. Stukalov). Built after the Wikimedia Commons photos: the 4.5 m bronze
// warrior-singer sits forward on a rough rock in chainmail, the right arm flung out sideways toward the spears, the
// gusli on his left knee under the left hand, a sword standing upright before the right knee, the bear skin of his cloak
// blown back behind him in one horizontal mass ending in the bear's head, a pointed helmet on the rock beside him; a
// plain light-grey granite block (~2.4 m) on a wider low plinth; three thin dark iron spears (10–12 m, Prince Volodymyr's
// sign) on the plinth at his right hand, one with a swallow-tailed pennant, one with a shield-shaped plate. The pedestal
// stands at the back of a granite-walled pool (the OSM fountain outline, its back edge carried behind the pedestal) with
// a stepped kerb round it and jets in front of the rock; light slabs pave the square round the pool. At dusk two ground
// projectors wash the bronze and the granite (bohdan.js floodlit()).
//   BOYAN_SKIP: empty (no OSM building is replaced)
//   levelBoyan(hf, map, geo) -> level   terrain hook (city.js): levels the square round the pool
//   buildBoyan({ root, map, geo, solids, heightAt }) -> { update(dt), clear(x, z) } | null
// The site frame: local +z = the way he faces (world -z, over the pool toward the boulevard), local +x = his left
// (world -x). The figure is drawn in units of a 1.8-unit man, seat on the rock at y 0, then scaled by FIG.
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { SG, decal } from './sculpt.js';
import { rng, ringPts, centroid, area2 } from './geo.js';
import { graniteTex, slabTex, floodlit, put, mapper, sweep, ell, patina } from './bohdan.js';

export const BOYAN_SKIP = new Set();

const PI = Math.PI;
const LL = [49.4200118, 32.1024328];   // the OSM node: the pedestal centre
const YAW = PI;                        // local +z -> world -z, local +x -> world -x
const FIG = 3.5;                       // figure units -> metres (seat to crown ~3.2 m, ~4.5 m with the rock)
const POOL_ID = 'w401155133', POOL_BACK = 4.6; // the pool's back edge, metres behind the pedestal centre
// fallback pool outline (map x, z) if the poi is missing: the OSM half-octagon
const POOL_FALLBACK = [-65.8, 4087.1, -76.5, 4087.1, -83.7, 4094.4, -83.7, 4101.7, -58.6, 4101.6, -58.6, 4094.3];
const PLINTH = [3.4, 1.9, 0.75], BLOCK = [1.65, 1.25, 1.65]; // half across, half deep, height above the water
const SPEARS = [[-2.75, 0.35, 12.2, 'pennant'], [-2.95, -0.35, 11.2, 'shield'], [-2.55, -0.9, 10.4, null]]; // local x, z, height, fitting

// ------------------------------------------------------------------------------------------------ the singer
function boyan() {
  const s = new SG();
  // ---- the pelvis and the chainmail torso, leaning well forward over the knees
  ell(s, [0, 0.08, -0.01], [0.2, 0.12, 0.16], [0, 0, 0], 14, 8);
  const mail = (u, i) => 1 + 0.03 * Math.sin(u * PI * 18 + i * 1.7); // the mail's rings read as a fine ripple
  sweep(s, [[0, 0.04, -0.04], [0, 0.2, 0.04], [0, 0.37, 0.13], [0, 0.5, 0.22], [0, 0.58, 0.28]],
    [[0.2, 0.15], [0.19, 0.14], [0.2, 0.13], [0.21, 0.12], [0.12, 0.09]], 16, { wob: mail });
  // the mail skirt spread over the thighs, a belt
  sweep(s, [[0, 0.05, -0.02], [0, 0.1, -0.005]], [[0.22, 0.17], [0.215, 0.165]], 16);
  // ---- legs: the thighs forward and a little apart, the shins down to booted feet on the rock's front
  for (const [sd, kz, fy] of [[-1, 0.44, -0.37], [1, 0.4, -0.3]]) {
    const hip = [sd * 0.1, 0.07, 0.02], knee = [sd * 0.14, 0.11, kz], ankle = [sd * 0.15, fy + 0.05, kz + 0.07];
    sweep(s, [hip, [sd * 0.12, 0.09, kz * 0.55], knee], [0.085, 0.08, 0.065], 12);
    sweep(s, [knee, [sd * 0.145, (0.11 + fy) / 2, kz + 0.05], ankle], [0.065, 0.06, 0.055], 12);
    ell(s, [sd * 0.15, fy + 0.01, kz + 0.12], [0.05, 0.04, 0.11], [0, 0, 0], 10, 6);
  }
  // ---- the head: thrown up a touch, singing; a cropped skull, a long moustache
  sweep(s, [[0, 0.56, 0.27], [0, 0.645, 0.32]], [0.06, 0.055], 12);
  ell(s, [0, 0.725, 0.335], [0.078, 0.1, 0.092], [-0.15, 0, 0], 14, 10);
  ell(s, [0, 0.695, 0.41], [0.022, 0.035, 0.025], [0.3, 0, 0], 8, 6); // nose
  for (const sd of [-1, 1]) sweep(s, [[sd * 0.005, 0.68, 0.42], [sd * 0.04, 0.67, 0.405], [sd * 0.06, 0.64, 0.39]], [0.014, 0.012, 0.006], 8);
  ell(s, [0, 0.77, 0.32], [0.082, 0.06, 0.09], [-0.2, 0, 0], 12, 6); // the hair cap
  // ---- the right arm flung out sideways, open hand reaching for the spears
  sweep(s, [[-0.17, 0.5, 0.22], [-0.3, 0.53, 0.23], [-0.48, 0.54, 0.22], [-0.66, 0.53, 0.19], [-0.74, 0.52, 0.17]],
    [0.07, 0.062, 0.05, 0.04, 0.035], 12, { wob: mail });
  ell(s, [-0.79, 0.515, 0.165], [0.06, 0.022, 0.045], [0, 0, -0.15], 10, 6);
  sweep(s, [[-0.77, 0.52, 0.2], [-0.8, 0.525, 0.23]], [0.012, 0.009], 6); // thumb
  // ---- the left arm down to the gusli on the left knee
  sweep(s, [[0.17, 0.5, 0.22], [0.25, 0.39, 0.27], [0.24, 0.3, 0.33], [0.17, 0.25, 0.38]], [0.068, 0.058, 0.048, 0.04], 12, { wob: mail });
  ell(s, [0.13, 0.235, 0.39], [0.04, 0.025, 0.05], [0.3, 0.4, 0], 8, 6);
  // the gusli: a flat wing-shaped box tilted across the thigh, its strap in a loop beside it
  put(s, new SG().ellipsoid([0, 0, 0], [0.22, 0.03, 0.12], 16, 6), mapper(new THREE.Matrix4().compose(new THREE.Vector3(0.05, 0.2, 0.38), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0.45, -0.35)), new THREE.Vector3(1, 1, 1))));
  sweep(s, Array.from({ length: 9 }, (_, k) => { const a = k / 8 * PI * 1.6 + 0.6; return [-0.12 + 0.11 * Math.cos(a), 0.2 + 0.09 * Math.sin(a), 0.36 - 0.05 * Math.sin(a)]; }), Array(9).fill(0.009), 6);
  // ---- the sword, upright before the right knee: blade, cross guard, grip, pommel
  sweep(s, [[-0.21, -0.37, 0.56], [-0.21, 0.14, 0.53]], [[0.028, 0.008], [0.03, 0.008]], 6);
  sweep(s, [[-0.29, 0.14, 0.53], [-0.13, 0.14, 0.53]], [0.013, 0.013], 6);
  sweep(s, [[-0.21, 0.14, 0.53], [-0.21, 0.25, 0.525]], [0.016, 0.014], 6);
  ell(s, [-0.21, 0.27, 0.525], [0.024, 0.02, 0.024], [0, 0, 0], 8, 5);
  // ---- the bear skin: from his shoulders blown back and to his left in one heavy horizontal mass, a drape behind the
  // back to the rock, the bear's head with an open jaw at the end
  const fur = (u, i) => 1 + 0.07 * Math.sin(u * PI * 10 + i * 2.3) + 0.04 * Math.sin(u * PI * 22);
  sweep(s, [[-0.15, 0.56, 0.18], [0.07, 0.6, 0.08], [0.32, 0.62, -0.06], [0.56, 0.6, -0.2], [0.76, 0.55, -0.3], [0.86, 0.52, -0.35]],
    [[0.08, 0.07], [0.12, 0.15], [0.14, 0.2], [0.13, 0.19], [0.1, 0.13], [0.06, 0.07]], 14, { wob: fur });
  s.loft(Array.from({ length: 6 }, (_, j) => { const t = j / 5, y = 0.6 - 0.62 * t; return Array.from({ length: 9 }, (_, k) => { const u = k / 8; return [-0.2 + 0.5 * u + 0.15 * t, y, 0.08 - 0.3 * t - 0.06 * Math.sin(u * PI) - 0.02 * Math.sin(u * 13 + t * 5)]; }); }), { closed: false });
  ell(s, [0.9, 0.53, -0.37], [0.08, 0.075, 0.1], [0, -1.0, 0], 10, 7);                 // skull
  ell(s, [0.98, 0.55, -0.42], [0.05, 0.028, 0.08], [0.25, -1.0, 0], 8, 5);              // upper jaw
  ell(s, [0.97, 0.49, -0.41], [0.045, 0.022, 0.07], [-0.35, -1.0, 0], 8, 5);             // lower jaw, open
  for (const sd of [-1, 1]) ell(s, [0.88 + sd * 0.03, 0.61, -0.37 - sd * 0.035], [0.025, 0.035, 0.015], [0, -1.0, 0], 6, 4); // ears
  // ---- the pointed helmet on the rock at his left hip
  s.lathe(0.33, -0.1, [[0.075, -0.02], [0.08, 0.04], [0.068, 0.1], [0.04, 0.15], [0.012, 0.2], [0.004, 0.24]], 14, { cap1: true });
  return s;
}

// the rough rock he sits on: lumpy rings from the pedestal top (y0, metres below the seat) to the seat, wider in front
function rockShape(r, depth) {
  const s = new SG(), rows = [[-depth, 1.6, 1.15, 0.5], [-depth + 0.3, 1.55, 1.1, 0.45], [-depth * 0.55, 1.3, 0.9, 0.2], [-0.35, 0.95, 0.72, 0.0], [-0.08, 0.75, 0.6, -0.05], [0, 0.42, 0.32, -0.05]];
  const bump = Array.from({ length: 14 }, () => 0.85 + r() * 0.3);
  s.loft(rows.map(([y, rx, rz, dz], j) => Array.from({ length: 14 }, (_, k) => {
    const a = -k / 14 * PI * 2, w = j && j < rows.length - 1 ? bump[(k + j * 3) % 14] : 1;
    return [Math.cos(a) * rx * w, y + (j && j < rows.length - 1 ? (r() - 0.5) * 0.12 : 0), dz + Math.sin(a) * rz * w];
  })), { cap0: true, cap1: true });
  return s;
}

// the pool outline (map x, z; counter-clockwise, no repeated points): the OSM fountain, its back edge moved behind the pedestal
function poolRing(map, geo) {
  const [, oz] = geo.toXZ(...LL), poi = map.pois?.find((p) => p.id === POOL_ID);
  const raw = ringPts(poi?.p ?? POOL_FALLBACK), zMax = Math.max(...raw.map((p) => p[1]));
  const P = [];
  for (const [x, z0] of raw) { const z = z0 > zMax - 0.5 ? oz + POOL_BACK : z0, q = P[P.length - 1]; if (!q || Math.hypot(q[0] - x, q[1] - z) > 0.2) P.push([x, z]); }
  if (P.length > 2 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 0.2) P.pop();
  return area2(P) < 0 ? P.reverse() : P;
}
// the levelled square: the pool's box grown by the kerb and a paved margin
function squareRing(map, geo) {
  const P = poolRing(map, geo), xs = P.map((p) => p[0]), zs = P.map((p) => p[1]);
  const x0 = Math.min(...xs) - 6, x1 = Math.max(...xs) + 5, z0 = Math.min(...zs) - 6, z1 = Math.max(...zs) + 2.5;
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}
// one level for the square: the median of the natural ground over it (what hf.pad levels it to)
function siteLevel(map, geo, heightAt) {
  const Q = squareRing(map, geo), h = [];
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
    const v = heightAt(Q[0][0] + (Q[1][0] - Q[0][0]) * i / 6, Q[0][1] + (Q[2][1] - Q[0][1]) * j / 6);
    if (Number.isFinite(v)) h.push(v);
  }
  h.sort((a, b) => a - b);
  return h.length ? h[h.length >> 1] : 10.5;
}
// terrain hook (city.js, before the ground builds): level the square so the pool's rim sits the same height all round
export function levelBoyan(hf, map, geo) { return hf.pad(squareRing(map, geo), 18); }

// ------------------------------------------------------------------------------------------------ site
export function buildBoyan({ root, map, geo, solids: S, heightAt }) {
  if (!geo) return null;
  const t0 = performance.now(), r = rng(1986);
  const [ox, oz] = geo.toXZ(...LL);
  const fx = Math.sin(YAW), fz = Math.cos(YAW), sx = fz, sz = -fx;  // forward (local +z) and local +x in the world
  const W = (a, d) => [ox + sx * a + fx * d, oz + sz * a + fz * d];
  const g = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 10.5; };
  const ang = Math.atan2(sz, sx);
  const box = (a, d, ha, hd, y0, y1, kind = 'wall') => { const [x, z] = W(a, d); return S.obox(x, z, ha, hd, ang, y0, y1, kind); };
  const frame = (a, y, d, k = 1) => { const [x, z] = W(a, d); return M4(x, y, z, YAW, k); };

  // ---------------------------------------------------------------- the pool: the OSM outline, its back carried behind the pedestal
  const pool = poolRing(map, geo), L = siteLevel(map, geo, heightAt);
  const [pcx, pcz] = centroid(pool);
  const yRim = L + 0.75, yW = yRim - 0.16, yStep = L + 0.32, gLow = L;
  // a convex outline grown by d: every edge moved out along its normal, the corners where the moved edges meet
  const offsetRing = (P, d) => {
    const L = P.map(([x, z], i) => {
      const [x2, z2] = P[(i + 1) % P.length], ex = x2 - x, ez = z2 - z, el = Math.hypot(ex, ez);
      let nx = ez / el, nz = -ex / el;
      if (nx * ((x + x2) / 2 - pcx) + nz * ((z + z2) / 2 - pcz) < 0) { nx = -nx; nz = -nz; }
      return { x: x + nx * d, z: z + nz * d, ex: ex / el, ez: ez / el };
    });
    return L.map((l, i) => {
      const p = L[(i + L.length - 1) % L.length], den = p.ex * l.ez - p.ez * l.ex;
      if (Math.abs(den) < 1e-6) return [l.x, l.z];
      const t = ((l.x - p.x) * l.ez - (l.z - p.z) * l.ex) / den;
      return [p.x + p.ex * t, p.z + p.ez * t];
    });
  };
  const Oin = pool, Wall = offsetRing(pool, 0.45), Step = offsetRing(pool, 1.2);

  const B = { gran: new MB(), iron: new MB(), glow: new MB(), water: new MB(), jet: new MB() };
  // the rim band and the stepped kerb as quads between two rings; sides drop below the lowest ground
  const band = (D, A, C, yTop, yBot) => {
    for (let i = 0; i < A.length; i++) {
      const a = A[i], b = A[(i + 1) % A.length], c = C[(i + 1) % A.length], d = C[i];
      D.face([[a[0], yTop, a[1]], [b[0], yTop, b[1]], [c[0], yTop, c[1]], [d[0], yTop, d[1]]], [0, 1, 0]);
      const ex = c[0] - b[0], ez = c[1] - b[1], el = Math.hypot(ex, ez) || 1;
      D.face([[d[0], yBot, d[1]], [c[0], yBot, c[1]], [c[0], yTop, c[1]], [d[0], yTop, d[1]]], [ex / el, 0, ez / el]);
      D.face([[a[0], yBot, a[1]], [b[0], yBot, b[1]], [b[0], yTop, b[1]], [a[0], yTop, a[1]]], [-ex / el, 0, -ez / el]);
      const q = [a, b, c, d]; S.prism((area2(q) < 0 ? q.slice().reverse() : q).flat(), yBot - 0.2, yTop, 0, 0, 'ledge');
    }
  };
  B.gran.setColor([0.66, 0.65, 0.63]); band(B.gran, Oin, Wall, yRim, yW - 0.6);
  B.gran.setColor([0.58, 0.57, 0.55]); band(B.gran, Wall, Step, yStep, gLow - 0.35);
  B.water.setColor(0xffffff).fill(Oin, [], yW, true);

  // ---------------------------------------------------------------- the pedestal: a wide low plinth, the plain block
  const P = frame(0, 0, 0);
  const [pa, pd, ph] = PLINTH, [ba, bd, bh] = BLOCK, yP = yW + ph, yB = yP + bh;
  B.gran.setColor([0.7, 0.69, 0.67]).with(P, (q) => q.box(-pa, yW - 0.8, -pd, pa, yP, pd, 1 | 2 | 4 | 16 | 32));
  B.gran.setColor([0.78, 0.77, 0.75]).with(P, (q) => q.box(-ba, yP, -bd, ba, yB, bd, 1 | 2 | 4 | 16 | 32));
  B.gran.setColor([0.72, 0.71, 0.69]).with(P, (q) => q.box(-ba - 0.06, yB - 0.16, -bd - 0.06, ba + 0.06, yB, bd + 0.06, 1 | 2 | 8 | 16 | 32)); // the top slab's lip
  box(0, 0, pa, pd, gLow - 0.5, yP, 'ledge');
  box(0, 0, ba, bd, yP, yB, 'wall');

  // ---------------------------------------------------------------- the rock and the bronze
  const bronze = new SG(), rock = new SG();
  const depth = 0.42 * FIG, ySeat = yB + depth;
  put(rock, rockShape(r, depth), mapper(frame(0, ySeat, -0.25)));
  put(bronze, boyan(), mapper(frame(0, ySeat, -0.25, FIG)));
  box(0, -0.2, 1.4, 1.1, yB, ySeat + 0.3);
  box(0, 0.3, 0.9, 0.9, ySeat + 0.3, ySeat + 2.9);
  box(-1.6, 0.3, 1.2, 0.3, ySeat + 1.6, ySeat + 2.3);  // the outstretched arm
  box(1.6, -1.1, 1.3, 0.6, ySeat + 1.5, ySeat + 2.6);  // the bear-skin mass

  // ---------------------------------------------------------------- the spears with the pennant and the shield plate
  const tri2 = (D, A, Bp, C, n) => { // a two-sided triangle (pennant / shield)
    for (const sd of [1, -1]) {
      const o = n.map((v) => v * 0.015 * sd), p = [A, Bp, C].map((q) => D.vert(q[0] + o[0], q[1] + o[1], q[2] + o[2], n[0] * sd, n[1] * sd, n[2] * sd));
      sd > 0 ? D.tri(p[0], p[1], p[2]) : D.tri(p[0], p[2], p[1]);
    }
  };
  for (const [a, d, h, fit] of SPEARS) {
    const [x, z] = W(a, d), y0 = yW - 0.3, yT = yW + h;
    B.iron.setColor(0x26282a).cyl(x, y0, z, 0.065, 0.05, yT - y0, 8, false);
    B.iron.cyl(x, yT - 0.15, z, 0.07, 0.07, 0.2, 8, true); // the socket
    put(bronze, new SG().ellipsoid([0, 0, 0], [0.11, 0.55, 0.03], 10, 8), mapper(new THREE.Matrix4().compose(new THREE.Vector3(x, yT + 0.6, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), YAW + 0.3), new THREE.Vector3(1, 1, 1))));
    S.cyl(x, z, y0, yT + 1.1, 0.08, 0.06, 'pole');
    if (fit === 'pennant') { // swallow-tailed, flying toward the figure (local +x), with a little wave
      const top = yT - 0.6, dir = [sx, 0, sz], nrm = [-fx, 0, -fz];
      const Q = (u, v) => { const w = 0.12 * Math.sin(u * 2.4); return [x + dir[0] * u + nrm[0] * w, top + v, z + dir[2] * u + nrm[2] * w]; };
      const c = Q(0, -0.55), pts = [Q(0, 0), Q(0.6, 0.02), Q(1.2, 0.08), Q(1.9, 0.18), Q(1.3, -0.5), Q(1.9, -1.15), Q(1.2, -1.0), Q(0.6, -1.05), Q(0, -1.1)];
      B.iron.setColor(0x232527);
      for (let k = 0; k < pts.length - 1; k++) tri2(B.iron, c, pts[k], pts[k + 1], [fx, 0, fz]);
    } else if (fit === 'shield') { // a shield-shaped plate hung square on the shaft, a raised rim
      const top = yT - 0.9, fwd = [fx, 0, fz], acr = [sx, 0, sz];
      const Q = (u, v) => [x + acr[0] * u + fwd[0] * 0.08, top + v, z + acr[2] * u + fwd[2] * 0.08];
      const pts = [Q(-0.45, 0), Q(0.45, 0), Q(0.46, -0.45), Q(0.3, -0.9), Q(0, -1.25), Q(-0.3, -0.9), Q(-0.46, -0.45)], c = Q(0, -0.5);
      B.iron.setColor(0x2b2d2f);
      for (let k = 0; k < pts.length; k++) tri2(B.iron, c, pts[k], pts[(k + 1) % pts.length], fwd);
      B.iron.setColor(0x34363a);
      for (let k = 0; k < pts.length; k++) B.iron.tube(pts[k].map((v, i) => v + fwd[i] * 0.03), pts[(k + 1) % pts.length].map((v, i) => v + fwd[i] * 0.03), 0.025, 4);
    }
  }

  // ---------------------------------------------------------------- jets: a row of low arcs before the rock, a fan from its foot
  for (let k = -3; k <= 3; k++) {
    const [x, z] = W(k * 0.75, pd + 0.6 + 0.15 * Math.abs(k));
    B.jet.cyl(x, yW, z, 0.07, 0.025, 1.2 - 0.12 * Math.abs(k), 6, false);
  }
  { const [x, z] = W(0, pd + 2.6); B.jet.cyl(x, yW, z, 0.12, 0.04, 1.9, 8, false); }

  // ---------------------------------------------------------------- projectors for the evening wash
  const flood = [];
  for (const sd of [-1, 1]) {
    const [x, z] = W(sd * (pa - 0.45), pd - 0.35), yy = yP, m = M4(x, yy, z, Math.atan2(ox - x, oz - z));
    B.iron.setColor('#1d1f21').with(m, (q) => q.box(-0.22, 0, -0.18, 0.22, 0.3, 0.18));
    B.glow.with(m, (q) => q.box(-0.17, 0.06, 0.18, 0.17, 0.26, 0.2, 16));
    flood.push([x, yy + 0.3, z]);
  }

  // ---------------------------------------------------------------- the square's paving round the pool
  const SQ = squareRing(map, geo), PAVE = [SQ[0][0], SQ[0][1], SQ[2][0], SQ[2][1]];
  const paveMesh = ([x0, z0, x1, z1], cell, scale, lift) => {
    const plane = new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.ceil((x1 - x0) / cell), Math.ceil((z1 - z0) / cell));
    plane.rotateX(-PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const Pp = plane.attributes.position, T = plane.attributes.uv;
    for (let i = 0; i < Pp.count; i++) { const x = Pp.getX(i), z = Pp.getZ(i); Pp.setY(i, g(x, z) + lift); T.setXY(i, x / scale, z / scale); }
    plane.computeVertexNormals();
    return plane;
  };

  // ---------------------------------------------------------------- meshes
  const group = Object.assign(new THREE.Group(), { name: 'boyan' });
  root.add(group);
  const gTex = graniteTex();
  const M = {
    gran: floodlit(new THREE.MeshStandardMaterial({ map: gTex, emissiveMap: gTex, vertexColors: true, roughness: 0.8, emissive: 0xffe2c0, emissiveIntensity: 0 }), flood, 14, 'boyan'),
    iron: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.5, side: THREE.DoubleSide }),
    glow: new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.3, emissive: 0xffe0b0, emissiveIntensity: 0.05 }),
    water: new THREE.MeshStandardMaterial({ color: 0x1d4050, roughness: 0.05, metalness: 0.3, envMapIntensity: 1.4 }),
    jet: new THREE.MeshBasicMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.5, depthWrite: false }),
  };
  const bronzeMat = floodlit(new THREE.MeshStandardMaterial({ color: 0x6e6e6e, vertexColors: true, metalness: 0.5, roughness: 0.62, side: THREE.DoubleSide, emissive: 0xc99a62, emissiveIntensity: 0 }), flood, 16, 'boyan');
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6e6e6e, vertexColors: true, metalness: 0.45, roughness: 0.72 }); // dark statuary bronze (the photos), the rock a shade rougher
  let nV = 0;
  for (const [k, D] of Object.entries(B)) {
    if (!D.v) continue;
    nV += D.v;
    const shadow = k === 'gran' || k === 'iron';
    group.add(Object.assign(new THREE.Mesh(D.build(), M[k]), { name: 'boyan-' + k, castShadow: shadow, receiveShadow: k !== 'jet' }));
  }
  for (const [name, s, mat] of [['bronze', bronze, bronzeMat], ['rock', rock, rockMat]]) {
    nV += s.v;
    group.add(Object.assign(new THREE.Mesh(patina(s.build()), mat), { name: 'boyan-' + name, castShadow: true, receiveShadow: true }));
  }
  group.add(Object.assign(new THREE.Mesh(paveMesh(PAVE, 2, 4, 0.24), decal(new THREE.MeshStandardMaterial({ map: slabTex(), color: 0xb0aca4, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4 }))), { name: 'boyan-square', receiveShadow: true }));
  const jetMesh = group.getObjectByName('boyan-jet');

  console.log(`[cherkasy] Boyan monument: square at ${L.toFixed(1)} m, pedestal top ${(yB - yW).toFixed(1)} m, ${(nV / 1000).toFixed(1)}k verts in ${(performance.now() - t0).toFixed(0)} ms`);
  const inRect = (x, z, [x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1;
  let t = 0;
  return {
    clear: (x, z) => inRect(x, z, PAVE),
    update(dt) {
      const k = Math.min(1, 3 * nightK.value);
      bronzeMat.emissiveIntensity = 0.08 * k; M.gran.emissiveIntensity = 0.035 * k;
      M.glow.emissiveIntensity = 0.05 + 2.6 * k;
      t += dt || 0;
      if (jetMesh) M.jet.opacity = 0.42 + 0.1 * Math.sin(t * 7);
    },
  };
}
