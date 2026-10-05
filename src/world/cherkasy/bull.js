// OWNER: cherkasy. Скульптура Бика by the Cherkasy meat plant, at the corner of vul. Smilianska and vul. Hryhoriia
// Skovorody in Pryvokzalnyi (OSM node 1676890281 «Скульптура Бика», historic=memorial; the quest «Таємниці Черкас»,
// card `bull`). Its core is said to be the real spine of a bull brought from Belgium to breed a new herd here.
// Built after the Wikimedia Commons / uk.wikipedia photos (panoramio 2008, «Сторож мясокомбината бык»; «БикЧеркаси»,
// 2009): a dark bronze bull, a little over life size, head lowered with the horns forward, the tail flung out in a curve,
// the near fore leg set forward; it stands on a rough concrete slab on a white-painted pedestal that widens upward
// (an inverted frustum, ~1.6 m) over a low white base; the 2008 photo shows it painted charcoal grey over the bronze.
// Behind it a stretch of pink plastered wall, then the plant's white ribbed concrete fence; red pipe railings round the
// lawn. The pose and the plinth follow the photos; the anatomy is a simplified build of ellipsoids and tubes.
// The plant's gate is not documented in any photo found: the gate here – white ribbed panels, two plastered piers, a
// steel bar gate and a small pink checkpoint (прохідна) with a lit window – is a guess at the usual Soviet plant entrance,
// set in the fence line behind the bull, facing vul. Skovorody (no road leads through it, so it stays shut).
//   BULL_SKIP: empty (no OSM building is replaced)
//   places.js BULL_RING: the base's outline on the maps (an `improved` object; tests/bull.test.mjs keeps it in step)
//   buildBull({ root, solids, heightAt, geo }) -> { update(), clear(x, z), spots, footprints, stats } | null
// World frame only (yaw 0): the bull faces +z (toward vul. Smilianska), the fence runs along z on its west (-x) side.
import * as THREE from 'three';
import { MB, M4, rotX } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { PARK_GREENS } from '../trees.js';
import { patina } from './bohdan.js';

export const BULL_SKIP = new Set();

const LL = [49.4207345, 32.0373102];     // the OSM node
const SHIFT = [-1.0, 0];                 // the pedestal sits 1 m off the node, clear of the vul. Skovorody pavement
const BASE = { hx: 1.25, hz: 2.2, h: 0.35 };              // the low white base
const PED = { bx: 0.68, bz: 1.12, tx: 0.82, tz: 1.32, h: 1.6 }; // the pedestal: bottom / top half sizes, height
const SLAB = { hx: 0.62, hz: 1.28, h: 0.14 };             // the rough slab under the hooves
const K = 1.25;                          // the bull's scale over the drawn units (about life size)
const FENCE_X = -2.9;                    // the fence line, metres west of the pedestal centre
const FENCE_Z = [-43, 4.2];              // its run along z (local), the south end turning west
const FENCE_W = [-14, FENCE_X];          // the short west wing along z = FENCE_Z[1]
const GATE_Z = [-24.5, -18.5];           // the gate opening in the fence line
const BOOTH = { x0: -9.2, x1: -3.7, z0: -18, z1: -13.5, h: 3.1 }; // the checkpoint, inside the fence

// ------------------------------------------------------------------------------------------------ the bull
// drawn in its own units: hooves at y 0, +z forward (the muzzle), +x its left; ~2.4 long, 1.45 to the withers
function bull(D) {
  const E = (c, r, rot = 0, seg = 12, rows = 8) => (rot ? D.with(new THREE.Matrix4().makeTranslation(...c).multiply(rotX(rot)), (q) => q.ellipsoid([0, 0, 0], r, seg, rows)) : D.ellipsoid(c, r, seg, rows));
  // the barrel, the heavy forequarters rising into one broad hump over the shoulders, the haunches
  E([0, 1.05, -0.15], [0.42, 0.43, 0.95], 0, 14, 9);
  E([0, 1.12, 0.38], [0.46, 0.5, 0.6], 0, 14, 9);
  E([0, 1.3, 0.3], [0.37, 0.32, 0.62], 0.12, 14, 8);                  // the hump, long and low into the back
  E([0, 1.08, -0.74], [0.42, 0.41, 0.42]);
  E([0, 0.84, 0.55], [0.22, 0.26, 0.32], 0, 10, 6);                   // the dewlap / brisket
  // the neck sweeping down to the lowered head (the charge), the muzzle, the ears and the forward horns
  E([0, 1.0, 0.98], [0.3, 0.35, 0.38], -0.6);
  E([0, 0.76, 1.3], [0.18, 0.25, 0.28], -0.95, 10, 7);
  E([0, 0.56, 1.45], [0.15, 0.13, 0.14], 0, 10, 6);
  for (const s of [1, -1]) {
    D.with(new THREE.Matrix4().makeTranslation(s * 0.21, 0.88, 1.2).multiply(new THREE.Matrix4().makeRotationZ(s * 0.5)), (q) => q.ellipsoid([0, 0, 0], [0.12, 0.035, 0.07], 8, 4));
    D.tube([s * 0.1, 0.92, 1.24], [s * 0.3, 0.96, 1.29], 0.055, 7, true);
    D.tube([s * 0.29, 0.96, 1.29], [s * 0.38, 1.0, 1.49], 0.045, 7, true);
    D.tube([s * 0.37, 1.0, 1.48], [s * 0.34, 1.05, 1.58], 0.028, 6, true);
  }
  // legs: the near fore leg set forward, the hind legs bent at the hock; hooves
  const leg = (pts, r0, r1) => { for (let k = 1; k < pts.length; k++) { const t = (k - 1) / (pts.length - 1); D.tube(pts[k - 1], pts[k], r0 + (r1 - r0) * t, 8, true); } D.ellipsoid(pts[0], [r0 * 1.1, r0 * 0.9, r0 * 1.1], 8, 5); };
  leg([[0.21, 1.0, 0.55], [0.23, 0.5, 0.74], [0.22, 0.04, 0.84]], 0.14, 0.06);
  leg([[-0.21, 1.0, 0.45], [-0.22, 0.52, 0.4], [-0.22, 0.04, 0.52]], 0.14, 0.06);
  for (const s of [1, -1]) leg([[s * 0.24, 1.05, -0.78], [s * 0.22, 0.62, -0.95], [s * 0.21, 0.4, -1.02], [s * 0.21, 0.04, -0.88]], 0.17, 0.06);
  for (const [x, z] of [[0.22, 0.86], [-0.22, 0.54], [0.21, -0.86], [-0.21, -0.86]]) D.cyl(x, 0, z, 0.085, 0.07, 0.07, 8);
  // the tail flung out and down in a curve
  const T = [[0, 1.42, -1.05], [0, 1.5, -1.25], [0.04, 1.36, -1.45], [0.08, 1.05, -1.55], [0.1, 0.78, -1.5]];
  for (let k = 1; k < T.length; k++) D.tube(T[k - 1], T[k], 0.05 - k * 0.006, 6, true);
  D.ellipsoid(T[T.length - 1], [0.07, 0.12, 0.07], 6, 4);
  return D;
}

// ------------------------------------------------------------------------------------------------ site
export function buildBull({ root, solids: S, heightAt, geo }) {
  if (!geo) return null;
  const t0 = performance.now();
  const [nx, nz] = geo.toXZ(...LL), ox = nx + SHIFT[0], oz = nz + SHIFT[1];
  const g = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 30; };
  const W = (a, d) => [ox + a, oz + d];
  const gl = (a, d) => g(ox + a, oz + d);
  const L = [[-BASE.hx, -BASE.hz], [BASE.hx, -BASE.hz], [BASE.hx, BASE.hz], [-BASE.hx, BASE.hz], [0, 0]].map(([a, d]) => gl(a, d)).sort((p, q) => p - q)[2];
  const B = { white: new MB(), bronze: new MB(), conc: new MB(), fence: new MB(), plaster: new MB(), steel: new MB(), red: new MB(), glow: new MB() };
  const box = (a0, y0, d0, a1, y1, d1, kind = 'wall') => S.box(ox + Math.min(a0, a1), y0, oz + Math.min(d0, d1), ox + Math.max(a0, a1), y1, oz + Math.max(d0, d1), kind);
  const P = M4(ox, 0, oz, 0);

  // ---------------------------------------------------------------- the base, the widening pedestal, the slab, the bull
  const yB = L + BASE.h, yP = yB + PED.h, yS = yP + SLAB.h;
  B.white.setColor('#e6e7e3').with(P, (q) => q.box(-BASE.hx, L - 0.3, -BASE.hz, BASE.hx, yB, BASE.hz, 1 | 2 | 4 | 16 | 32));
  box(-BASE.hx, L - 0.3, -BASE.hz, BASE.hx, yB, BASE.hz, 'ledge');
  B.white.setColor('#eef0ec').with(P, (q) => {
    const bot = [[-PED.bx, yB, -PED.bz], [PED.bx, yB, -PED.bz], [PED.bx, yB, PED.bz], [-PED.bx, yB, PED.bz]];
    const top = [[-PED.tx, yP, -PED.tz], [PED.tx, yP, -PED.tz], [PED.tx, yP, PED.tz], [-PED.tx, yP, PED.tz]];
    const out = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]]; // bottom edge k -> k + 1 faces these ways
    for (let k = 0; k < 4; k++) { const j = (k + 1) % 4; q.face([bot[k], bot[j], top[j], top[k]], out[k]); }
    q.face(top.slice().reverse(), [0, 1, 0]);
    q.setColor('#c9cbc6').box(-PED.tx - 0.02, yP - 0.06, -PED.tz - 0.02, PED.tx + 0.02, yP, PED.tz + 0.02, 1 | 2 | 4 | 16 | 32); // the painted lip
  });
  box(-PED.tx, yB, -PED.tz, PED.tx, yP, PED.tz);
  B.conc.setColor('#8f8b84').with(P, (q) => q.box(-SLAB.hx, yP, -SLAB.hz, SLAB.hx, yS, SLAB.hz));
  for (const s of [-1, 1]) B.steel.setColor('#3b3a38').with(P, (q) => q.tube([s * 0.35, yS, -0.95], [s * 0.35, yS + 0.12, -0.75], 0.02, 5).tube([s * 0.35, yS + 0.12, -0.75], [s * 0.35, yS, -0.55], 0.02, 5)); // the lifting loops
  const bm = new THREE.Matrix4().makeTranslation(ox, yS, oz).multiply(new THREE.Matrix4().makeScale(K, K, K));
  B.bronze.with(bm, (q) => bull(q));
  box(-0.45 * K, yS, -1.3 * K, 0.45 * K, yS + 1.6 * K, 1.5 * K, 'statue');

  // ---------------------------------------------------------------- the plant's fence: white ribbed concrete panels on posts
  const PANEL = 4, FH = 2.45;
  const panelRun = (a0, d0, a1, d1, skip = null, pink = null) => {
    const len = Math.hypot(a1 - a0, d1 - d0), ua = (a1 - a0) / len, ud = (d1 - d0) / len, n = Math.max(1, Math.round(len / PANEL)), step = len / n;
    const ang = Math.atan2(ud, ua); // obox: local +x along the run
    for (let k = 0; k < n; k++) {
      const s0 = k * step, s1 = s0 + step, m = (s0 + s1) / 2, ca = a0 + ua * m, cd = d0 + ud * m;
      if (skip && skip(ca, cd)) continue;
      const y0 = gl(ca, cd) - 0.25, yaw = -ang;
      if (pink && pink(ca, cd)) { // a stretch of the plant's pink plastered wall with a white coping (the photos: right behind the bull)
        B.plaster.setColor('#d9a49c').with(M4(ox + ca, y0, oz + cd, yaw + Math.PI / 2), (q) => q.box(-0.14, 0, -step / 2, 0.14, FH + 0.1, step / 2));
        B.white.setColor('#e6e7e3').with(M4(ox + ca, y0, oz + cd, yaw + Math.PI / 2), (q) => q.box(-0.2, FH + 0.1, -step / 2, 0.2, FH + 0.22, step / 2));
        const [x, z] = W(ca, cd);
        S.obox(x, z, step / 2, 0.2, ang, y0, y0 + FH + 0.22, 'wall');
        continue;
      }
      B.fence.setColor('#e9e9e4').with(M4(ox + ca, y0, oz + cd, yaw + Math.PI / 2), (q) => {
        q.box(-0.07, 0, -step / 2 + 0.08, 0.07, FH, step / 2 - 0.08);
        q.setColor('#d4d5cf');
        for (let r = 0; r < 5; r++) { const y = 0.45 + r * 0.42; for (const s of [1, -1]) q.box(s * 0.07, y, -step / 2 + 0.1, s * 0.1, y + 0.08, step / 2 - 0.1, s > 0 ? 1 | 4 | 8 | 16 | 32 : 2 | 4 | 8 | 16 | 32); }
        q.setColor('#dcddd7').box(-0.13, 0, step / 2 - 0.1, 0.13, FH + 0.12, step / 2 + 0.1); // the post
      });
      const [x, z] = W(ca, cd);
      S.obox(x, z, step / 2, 0.14, ang, y0, y0 + FH + 0.25, 'wall');
    }
  };
  const inGate = (a, d) => d > GATE_Z[0] - 1 && d < GATE_Z[1] + 1;
  panelRun(FENCE_X, FENCE_Z[0], FENCE_X, FENCE_Z[1], inGate, (a, d) => d > -9);
  panelRun(FENCE_W[0], FENCE_Z[1], FENCE_W[1], FENCE_Z[1]);

  // ---------------------------------------------------------------- the gate: plastered piers, a steel bar gate, the checkpoint
  {
    const [d0, d1] = GATE_Z;
    for (const [dA, dB] of [[d0 - 1.6, d0 - 0.9], [d1 + 0.9, d1 + 1.6]]) { // the end panels' short closers, then the piers
      const y0 = gl(FENCE_X, (dA + dB) / 2) - 0.25;
      B.fence.setColor('#e9e9e4').with(P, (q) => q.box(FENCE_X - 0.07, y0, dA, FENCE_X + 0.07, y0 + FH, dB));
      box(FENCE_X - 0.14, y0, dA, FENCE_X + 0.14, y0 + FH + 0.2);
    }
    for (const d of [d0 - 0.45, d1 + 0.45]) {
      const y0 = gl(FENCE_X, d) - 0.2;
      B.plaster.setColor('#d8a39b').with(P, (q) => q.box(FENCE_X - 0.45, y0, d - 0.45, FENCE_X + 0.45, y0 + 2.9, d + 0.45));
      B.white.setColor('#e6e7e3').with(P, (q) => q.box(FENCE_X - 0.52, y0 + 2.9, d - 0.52, FENCE_X + 0.52, y0 + 3.08, d + 0.52));
      box(FENCE_X - 0.45, y0, d - 0.45, FENCE_X + 0.45, y0 + 3.08, d + 0.45);
    }
    // two steel leaves of vertical bars in a frame, shut, painted green
    const yg = gl(FENCE_X, (d0 + d1) / 2) + 0.06, GH = 2.2;
    B.steel.setColor('#2f5a44').with(P, (q) => {
      for (const [e0, e1] of [[d0, (d0 + d1) / 2 - 0.02], [(d0 + d1) / 2 + 0.02, d1]]) {
        q.box(FENCE_X - 0.04, yg, e0, FENCE_X + 0.04, yg + 0.08, e1).box(FENCE_X - 0.04, yg + GH - 0.08, e0, FENCE_X + 0.04, yg + GH, e1).box(FENCE_X - 0.04, yg + 1.0, e0, FENCE_X + 0.04, yg + 1.06, e1);
        q.box(FENCE_X - 0.04, yg, e0, FENCE_X + 0.04, yg + GH, e0 + 0.08).box(FENCE_X - 0.04, yg, e1 - 0.08, FENCE_X + 0.04, yg + GH, e1);
        for (let d = e0 + 0.2; d < e1 - 0.1; d += 0.16) q.box(FENCE_X - 0.015, yg, d - 0.015, FENCE_X + 0.015, yg + GH + 0.12, d + 0.015, 1 | 2 | 4 | 16 | 32);
      }
    });
    box(FENCE_X - 0.08, yg - 0.1, d0, FENCE_X + 0.08, yg + GH, d1, 'fence');
    // the checkpoint: one storey, pink plaster, a white flat-roof slab, the door and a window to the street, a window to the gate
    const b = BOOTH, yb = Math.min(gl(b.x0, b.z0), gl(b.x1, b.z1), gl(b.x0, b.z1), gl(b.x1, b.z0)) - 0.2, top = yb + 0.3 + b.h;
    B.plaster.setColor('#d6a199').with(P, (q) => q.box(b.x0, yb, b.z0, b.x1, top, b.z1, 1 | 2 | 4 | 16 | 32));
    B.white.setColor('#e3e3dd').with(P, (q) => q.box(b.x0 - 0.35, top, b.z0 - 0.35, b.x1 + 0.35, top + 0.25, b.z1 + 0.35));
    B.white.setColor('#bdbab2').with(P, (q) => q.box(b.x0 - 0.05, yb, b.z0 - 0.05, b.x1 + 0.05, yb + 0.5, b.z1 + 0.05, 1 | 2 | 16 | 32)); // plinth
    B.steel.setColor('#5c3a26').with(P, (q) => q.box(b.x1, yb + 0.3, b.z0 + 0.7, b.x1 + 0.04, yb + 2.4, b.z0 + 1.6, 1)); // the door, to the street side
    B.glow.with(P, (q) => { q.box(b.x1, yb + 1.2, b.z0 + 2.2, b.x1 + 0.03, yb + 2.4, b.z1 - 0.5, 1); q.box(b.x0 + 1.2, yb + 1.2, b.z0 - 0.03, b.x1 - 1.2, yb + 2.4, b.z0, 32); });
    box(b.x0, yb, b.z0, b.x1, top + 0.25, b.z1);
  }

  // ---------------------------------------------------------------- red pipe railings round the lawn in front of the fence
  {
    const Y = (a, d) => gl(a, d);
    const rail = (a0, d0, a1, d1) => {
      const n = Math.max(1, Math.round(Math.hypot(a1 - a0, d1 - d0) / 2.2));
      for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n, d = d0 + (d1 - d0) * k / n, y = Y(a, d); B.red.with(P, (q) => q.cyl(a, y - 0.1, d, 0.03, 0.03, 0.75, 6)); }
      for (let k = 0; k < n; k++) {
        const a = a0 + (a1 - a0) * k / n, d = d0 + (d1 - d0) * k / n, b = a0 + (a1 - a0) * (k + 1) / n, e = d0 + (d1 - d0) * (k + 1) / n;
        for (const h of [0.35, 0.62]) B.red.with(P, (q) => q.tube([a, Y(a, d) + h, d], [b, Y(b, e) + h, e], 0.025, 5));
      }
    };
    B.red.setColor('#c0312b');
    rail(FENCE_X - 0.6, FENCE_Z[1] + 2.4, FENCE_W[0], FENCE_Z[1] + 2.4);
    rail(FENCE_X + 1.0, -6.5, FENCE_X + 1.0, -14);
  }

  // ---------------------------------------------------------------- meshes
  const group = Object.assign(new THREE.Group(), { name: 'bull' });
  root.add(group);
  const M = {
    white: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    bronze: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.65 }),
    conc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    fence: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    plaster: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 }),
    red: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x8fa0a8, roughness: 0.2, metalness: 0.3, emissive: 0xffd9a8, emissiveIntensity: 0 }),
  };
  // one material per look; the small ones fold into their neighbours
  B.white.merge(B.conc); B.conc = new MB(); B.fence.merge(B.plaster); B.plaster = new MB(); B.steel.merge(B.red); B.red = new MB();
  let nV = 0;
  for (const [k, D] of Object.entries(B)) {
    if (!D.v) continue;
    nV += D.v;
    const geom = D.build();
    if (k === 'bronze') { patina(geom); const c = geom.attributes.color.array; for (let i = 0; i < c.length; i++) c[i] = c[i] * 0.7 + 0.075; }
    group.add(Object.assign(new THREE.Mesh(geom, M[k]), { name: 'bull-' + k, castShadow: k !== 'glow', receiveShadow: true }));
  }
  const spots = [];
  for (const [a, d] of [[-7, 2], [-11, -4], [-6.5, -9], [-12, -28], [-7, -34], [-11.5, -40]]) { const [x, z] = W(a, d); spots.push({ x, z, kind: 'park', sc: 0.9, pal: PARK_GREENS }); }
  console.log(`[cherkasy] Bull sculpture: pedestal top ${(yP - L).toFixed(1)} m, ${(nV / 1000).toFixed(1)}k verts, ${group.children.length} meshes in ${(performance.now() - t0).toFixed(0)} ms`);
  const inR = (x, z, a0, a1, d0, d1) => { const a = x - ox, d = z - oz; return a > a0 && a < a1 && d > d0 && d < d1; };
  return {
    spots,
    stats: { verts: nV, meshes: group.children.length, pedestalTop: yP, origin: [ox, oz], gate: GATE_Z.map((d) => oz + d), fenceX: ox + FENCE_X },
    footprints: [],
    clear: (x, z) => inR(x, z, -3.5, 3.5, -4, 4) || inR(x, z, FENCE_X - 2.5, FENCE_X + 2, FENCE_Z[0] - 1, FENCE_Z[1] + 3.5) || inR(x, z, FENCE_W[0] - 1, FENCE_X, FENCE_Z[1] - 2, FENCE_Z[1] + 3.5) || inR(x, z, BOOTH.x0 - 2, BOOTH.x1 + 1, BOOTH.z0 - 2, BOOTH.z1 + 2),
    update() { M.glow.emissiveIntensity = 1.1 * nightK.value; },
  };
}
