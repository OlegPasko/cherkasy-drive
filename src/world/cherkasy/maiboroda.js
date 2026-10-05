// OWNER: cherkasy. Будинок Майбороди, бульвар Шевченка, 287 (OSM way 118327865; heritage, architect Георгій
// Філоферро, late 19th c. – OSM dates it 1905; the city sanitary-epidemiological station today; quest «Таємниці Черкас»,
// card `maiboroda`). After the Commons photos («Санстанція.JPG», «Bulvar Shevchenka Cherkasy 287.jpg» and «…(02).jpg»)
// and the satellite view: one tall storey over a high plinth of grey rusticated stone, whitewashed, the boulevard front
// symmetrical – a corner risalit at each end with a round-arched window between two half-columns under a triangular
// pediment, three tall windows each side between pilasters with a baluster panel under each sill, and the central
// portal: a projecting bay with the panelled brown door up a flight of steps, an arched fanlight over it between two
// half-columns, crowned by an attic; a heavy cornice all round, a balustrade along the roof edge between the risalits
// and the portal, and a low hipped roof of grey sheet metal behind. Brown timber window frames. The sides and the back
// carry plain tall windows between pilaster strips (a guess: only the north-east corner shows in the photos).
//   MAIBORODA_SKIP: the OSM ids replaced here (buildings.js skips their extrusion)
//   buildMaiboroda({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints, levels } | null
//     levels: { ground, floor, cornice, attic } (tests)
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { rng, inPoly } from './geo.js';
import { ringFaces, at, quad, box, rect, solid, finish, hole, skin, speckle, UP } from './slabkit.js';
import { hipRoof } from './civic.js';

const OSM_ID = 118327865;
export const MAIBORODA_SKIP = new Set([OSM_ID]);

const PL = 1.15, WALL = 5.4, CORN = 0.42;     // plinth over the ground, the storey to the cornice, the cornice
const WHITE = '#ecebe6', TRIM = '#f6f5f1', STONE = '#8f8b85', FRAME = '#7a4a28';

// rusticated plinth: 0.5 m courses of rough grey blocks
const rustTex = (r) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#6b6863'; g.fillRect(0, 0, w, h);
  for (let j = 0; j < 4; j++) for (let i = -1; i < 3; i++) {
    const x = i * 128 + (j & 1) * 64, v = 128 + (r() - 0.5) * 40;
    g.fillStyle = `rgb(${v | 0},${v - 3 | 0},${v - 8 | 0})`; g.fillRect(x + 3, j * 64 + 3, 122, 58);
    for (let q = 0; q < 160; q++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,38,36' : '230,228,222'},0.18)`; g.fillRect(x + 3 + r() * 120, j * 64 + 3 + r() * 56, 2, 2); }
  }
});

// the render scored into courses: a shallow groove every 0.42 m (6 a repeat of 2.5 m)
const bandTex = (r) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#f3f2ee'; g.fillRect(0, 0, w, h);
  for (let q = 0; q < 1400; q++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.3)' : 'rgba(80,70,60,0.06)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  for (let j = 0; j < 6; j++) { g.fillStyle = 'rgba(90,86,78,0.32)'; g.fillRect(0, j * h / 6, w, 3); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(0, j * h / 6 + 3, w, 1); }
});

export function buildMaiboroda({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((o) => o.id === OSM_ID);
  if (!b) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const ring = []; for (let i = 0; i < b.p.length; i += 2) ring.push([b.p[i], b.p[i + 1]]);
  const F = ringFaces(ring);
  const front = [...F].sort((p, q) => p.nx - q.nx)[0];          // the boulevard side looks to map -x
  const gs = ring.map(([x, z]) => heightAt(x, z)), gLo = Math.min(...gs) - 0.4, gHi = Math.max(...gs);
  const yF = gHi + PL, yC = yF + WALL, yT = yC + CORN;
  const B = { wall: new MB(), det: new MB(), stone: new MB(), roof: new MB(), glass: new MB(), lit: new MB() }, D = B.det;
  const lit = () => r() < 0.4;

  // an arched head over the window s0..s1 whose springing line is ys: the wall's spandrels round it, the fanlight glass
  // in the recess, the moulded archivolt
  const arch = (f, s0, s1, ys, dep = 0.22) => {
    const c = (s0 + s1) / 2, R = (s1 - s0) / 2, n = 10, P = (k, rr, o) => at(f, c - Math.cos(k / n * Math.PI) * rr, ys + Math.sin(k / n * Math.PI) * rr, o);
    B.wall.setColor(WHITE);
    for (const [k0, k1, corner] of [[0, n / 2, at(f, s0, ys + R, 0)], [n / 2, n, at(f, s1, ys + R, 0)]]) {
      for (let k = k0; k < k1; k++) B.wall.face([corner, P(k, R, 0), P(k + 1, R, 0)], f.N);
    }
    const G = lit() ? B.lit : B.glass; G.setColor('#5d6d78');
    for (let k = 0; k < n; k++) G.face([P(k, R, -dep + 0.04), P(k + 1, R, -dep + 0.04), at(f, c, ys, -dep + 0.04)], f.N);
    D.setColor(TRIM);
    for (let k = 0; k < n; k++) {
      // the reveal round the arch and the archivolt proud of the wall
      quad(D, P(k, R, 0), P(k + 1, R, 0), P(k + 1, R, -dep), P(k, R, -dep), [0, -1, 0]);
      quad(D, P(k, R + 0.16, 0.06), P(k + 1, R + 0.16, 0.06), P(k + 1, R, 0.06), P(k, R, 0.06), f.N);
      quad(D, P(k, R + 0.16, 0), P(k + 1, R + 0.16, 0), P(k + 1, R + 0.16, 0.06), P(k, R + 0.16, 0.06), UP);
    }
    D.setColor(FRAME); for (const k of [3, 5, 7]) quad(D, P(k, R, -dep + 0.06), P(k, R, -dep + 0.05), at(f, c, ys, -dep + 0.05), at(f, c, ys, -dep + 0.06), f.N);
    box(D, f, s0, s1, ys - 0.04, ys + 0.04, -dep + 0.02, -dep + 0.07, 'ft');
    // the keystone
    D.setColor(TRIM); box(D, f, c - 0.13, c + 0.13, ys + R - 0.05, ys + R + 0.3, 0, 0.1, 'ftlr');
  };
  // a tall window with its baluster panel under the sill and a small cornice over it
  const window = (f, s, w = 1.35, h = 2.8, archTop = false) => {
    const y0 = yF + 1.0, y1 = archTop ? yF + 3.3 : y0 + h;
    f.cuts.push({ s0: s - w / 2, s1: s + w / 2, y0, y1: archTop ? y1 + w / 2 : y1 });
    hole(B, f, { s0: s - w / 2, s1: s + w / 2, y0, y1, dep: 0.25, rev: TRIM, frame: FRAME, glass: '#5d6d78', lit: lit(), pitch: w / 2, tr: archTop ? null : y1 - 0.55, sill: TRIM });
    if (archTop) arch(f, s - w / 2, s + w / 2, y1);
    else {
      D.setColor(TRIM); box(D, f, s - w / 2 - 0.16, s + w / 2 + 0.16, y1 + 0.12, y1 + 0.28, 0, 0.14, 'ftlru');
      box(D, f, s - w / 2 - 0.1, s + w / 2 + 0.1, y1, y1 + 0.12, 0, 0.06, 'ftlr');
      box(D, f, s - w / 2 - 0.12, s - w / 2, y0, y1, 0, 0.05, 'flr'); box(D, f, s + w / 2, s + w / 2 + 0.12, y0, y1, 0, 0.05, 'flr');
    }
    // the baluster panel: a recessed frame with five squat balusters
    D.setColor(TRIM); box(D, f, s - w / 2, s + w / 2, yF + 0.2, yF + 0.3, 0, 0.08, 'ftu');
    for (let k = 0; k < 5; k++) {
      const q = at(f, s - w / 2 + (k + 0.5) * w / 5, 0, 0.05);
      D.lathe([[0.04, 0], [0.065, 0.12], [0.04, 0.3], [0.06, 0.55], [0.04, 0.62]].map(([rr, y]) => [rr, yF + 0.3 + y * 0.95]), 6, q[0], q[2]);
    }
  };
  // a pilaster strip or a half-column on the wall at s
  const pilaster = (f, s, y0, y1, w = 0.45) => { D.setColor(TRIM); box(D, f, s - w / 2, s + w / 2, y0, y1, 0, 0.08, 'flr'); box(D, f, s - w / 2 - 0.05, s + w / 2 + 0.05, y1 - 0.25, y1, 0, 0.13, 'ftlru'); };
  const column = (f, s, y0, y1, rr = 0.2, o = 0.02) => {
    const q = at(f, s, 0, o); D.setColor(TRIM);
    D.cyl(q[0], y0, q[2], rr + 0.04, rr + 0.04, 0.3, 10, true);
    D.cyl(q[0], y0 + 0.3, q[2], rr, rr * 0.9, y1 - y0 - 0.6, 10, false);
    D.cyl(q[0], y1 - 0.3, q[2], rr * 0.95, rr + 0.08, 0.3, 10, true);
  };

  // ---- the boulevard front: risalits, windows, the portal
  const L = front.L, c = L / 2, RW = 3.3, PW = 3.9;
  const risal = [[0, RW], [L - RW, L]];
  for (const [s0, s1] of risal) {
    const m = (s0 + s1) / 2;
    window(front, m, 1.45, 0, true);
    column(front, s0 + 0.38, yF, yC, 0.19, 0.38); column(front, s1 - 0.38, yF, yC, 0.19, 0.38);
  }
  for (const side of [-1, 1]) for (const k of [0, 1, 2]) {
    const span0 = RW, span1 = c - PW / 2, s = side < 0 ? span0 + (span1 - span0) * (2 * k + 1) / 6 : L - (span0 + (span1 - span0) * (2 * k + 1) / 6);
    window(front, s);
    if (k < 2) pilaster(front, side < 0 ? span0 + (span1 - span0) * (k + 1) / 3 : L - (span0 + (span1 - span0) * (k + 1) / 3), yF, yC);
  }
  // the portal bay: 0.5 proud, the door up the steps, the fanlight, columns, the attic over the cornice
  {
    const f = front, s0 = c - PW / 2, s1 = c + PW / 2, dw = 1.7, gp = at(f, c, 0, 2), gy = heightAt(gp[0], gp[2]);
    const yD = gy + 0.32, yDT = yF + 2.9;
    f.cuts.push({ s0: c - dw / 2, s1: c + dw / 2, y0: yD, y1: yDT });
    hole(B, f, { s0: c - dw / 2, s1: c + dw / 2, y0: yD, y1: yDT, dep: 0.35, rev: TRIM, frame: FRAME, glass: '#6a4426', door: true, pitch: dw / 2 });
    D.setColor('#9a6a3a'); rect(D, f, c - dw / 2 + 0.06, c + dw / 2 - 0.06, yD, yDT - 0.06, -0.3); // the leaves' panels
    D.setColor('#b07c46'); for (const [a, bb] of [[0.12, 0.7], [0.92, 1.5]]) for (const [y0, y1] of [[0.3, 0.42], [0.5, 0.62]]) rect(D, f, c - dw / 2 + a, c - dw / 2 + bb, yD + (yDT - yD) * y0, yD + (yDT - yD) * (y1 + (y0 > 0.4 ? 0.3 : 0)), -0.28);
    // the door's small pediment and the arched fanlight over it
    D.setColor(TRIM); box(D, f, c - dw / 2 - 0.25, c + dw / 2 + 0.25, yF + 2.95, yF + 3.15, 0.5, 0.75, 'ftlru');
    D.face([at(f, c - dw / 2 - 0.25, yF + 3.15, 0.74), at(f, c + dw / 2 + 0.25, yF + 3.15, 0.74), at(f, c, yF + 3.42, 0.74)], f.N);
    column(f, s0 + 0.35, yF, yC, 0.2, 0.62); column(f, s1 - 0.35, yF, yC, 0.2, 0.62);
    // the attic: a raised block over the portal with a panel and a small cornice
    D.setColor(WHITE); box(D, f, s0 - 0.1, s1 + 0.1, yT, yT + 1.6, -0.6, 0.55, 'ftlr');
    D.setColor(TRIM); box(D, f, s0 - 0.25, s1 + 0.25, yT + 1.6, yT + 1.85, -0.75, 0.7, 'ftlru');
    box(D, f, s0 + 0.5, s1 - 0.5, yT + 0.35, yT + 1.25, 0.55, 0.62, 'ftlr');
    // the steps down to the pavement
    D.setColor('#9b978f'); box(D, f, c - 1.5, c + 1.5, gLo, gy + 0.32, 0, 0.75, 'ftlr'); box(D, f, c - 1.7, c + 1.7, gLo, gy + 0.16, 0, 1.05, 'ftlr');
    solid(S, f, c - 1.5, c + 1.5, 0, 0.75, gLo, gy + 0.32);
  }
  // the portal's arched fanlight window, set high between the door pediment and the cornice
  {
    const f = front, w = 1.5, y0 = yF + 3.35, ys = yF + 3.8;
    f.cuts.push({ s0: c - w / 2, s1: c + w / 2, y0, y1: ys + w / 2 });
    hole(B, f, { s0: c - w / 2, s1: c + w / 2, y0, y1: ys, dep: 0.45, rev: TRIM, frame: FRAME, glass: '#3e4a52', lit: lit(), pitch: w / 3 });
    arch(f, c - w / 2, c + w / 2, ys, 0.45);
  }

  // ---- the sides and the back: plain tall windows between pilaster strips
  for (const f of F) {
    if (f === front) continue;
    const n = Math.max(2, Math.round(f.L / 4.2)), m = f.L / n;
    for (let i = 0; i < n; i++) { window(f, (i + 0.5) * m, 1.25, 2.6); if (i) pilaster(f, i * m, yF, yC, 0.4); }
    pilaster(f, 0.25, yF, yC, 0.5); pilaster(f, f.L - 0.25, yF, yC, 0.5);
  }

  // ---- walls, plinth, cornice, balustrade, roof; colliders
  for (const f of F) {
    skin(B.wall, f, yF, yC, WHITE, [2.5, 2.5]);
    B.stone.setColor('#ffffff');
    for (const [a, b2] of f === front ? [[-0.1, c - 0.85], [c + 0.85, f.L + 0.1]] : [[-0.1, f.L + 0.1]]) box(B.stone, f, a, b2, gLo, yF, 0, 0.1, 'ftlr', [2, 2]);
    D.setColor(TRIM); for (const [a, b2] of f === front ? [[-0.1, c - 0.85], [c + 0.85, f.L + 0.1]] : [[-0.1, f.L + 0.1]]) box(D, f, a, b2, yF - 0.08, yF + 0.04, 0, 0.16, 'ftlr');
    // the cornice: an architrave band, a frieze, the projecting crown with a soffit
    box(D, f, -0.05, f.L + 0.05, yC - 0.35, yC - 0.2, 0, 0.06, 'ftlr');
    box(D, f, -0.2, f.L + 0.2, yC, yC + 0.16, 0, 0.22, 'ftlru');
    box(D, f, -0.42, f.L + 0.42, yC + 0.16, yT, 0, 0.42, 'ftlru');
    solid(S, f, 0, f.L, -0.4, 0.05, gLo, yT);
    const a = at(f, 0, 0, -0.1), q = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], q[0], q[2], yT, f.nx, f.nz);
  }
  for (const [s0, s1] of risal) {
    // the risalit's cornice break and its pediment
    const f = front, ya = yT, yb = yT + 1.25, m = (s0 + s1) / 2;
    D.setColor(TRIM); box(D, f, s0 - 0.1, s1 + 0.1, yC - 0.05, yT, 0.35, 0.8, 'ftlru');
    D.setColor(WHITE);
    D.face([at(f, s0, ya, 0.55), at(f, s1, ya, 0.55), at(f, m, yb, 0.55)], f.N);
    D.face([at(f, s0, ya, -1.4), at(f, m, yb, -1.4), at(f, s1, ya, -1.4)], f.N.map((v) => -v));
    D.setColor(TRIM);
    for (const [p0, p1] of [[s0 - 0.15, m], [s1 + 0.15, m]]) {
      const pa = at(f, p0, ya - 0.02, 0.75), pb = at(f, p1, yb + 0.12, 0.75), pc = at(f, p1, yb + 0.12, -1.5), pd = at(f, p0, ya - 0.02, -1.5);
      quad(D, pa, pb, pc, pd, [0, 1, 0]);
      quad(D, pa, pb, at(f, p1, yb - 0.04, 0.75), at(f, p0, ya - 0.18, 0.75), f.N);
    }
    // a round cartouche in the tympanum
    const q = at(f, m, ya + 0.48, 0.58); D.ellipsoid([q[0], q[1], q[2]], [0.28, 0.24, 0.06], 10, 5);
  }
  // the balustrade along the roof edge between the risalits and the portal: posts at the ends, balusters, a rail
  for (const [s0, s1] of [[RW, c - PW / 2], [c + PW / 2, L - RW]]) {
    const f = front, ya = yT, yb = yT + 0.85;
    D.setColor(TRIM); box(D, f, s0, s1, yb - 0.12, yb, 0.0, 0.32, 'ftlru'); box(D, f, s0, s1, ya, ya + 0.1, 0.02, 0.3, 'ft');
    const n = Math.round((s1 - s0) / 0.3);
    for (let k = 0; k < n; k++) {
      const q = at(f, s0 + (k + 0.5) * (s1 - s0) / n, 0, 0.16);
      D.lathe([[0.05, 0], [0.075, 0.12], [0.045, 0.3], [0.07, 0.5], [0.045, 0.63]].map(([rr, y]) => [rr, ya + 0.1 + y]), 6, q[0], q[2]);
    }
    for (const s of [s0 + 0.2, s1 - 0.2]) box(D, f, s - 0.2, s + 0.2, ya, yb + 0.05, -0.02, 0.36, 'ftlr');
  }
  // the roof: a low hip over the whole block from just behind the cornice
  const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
  B.roof.setColor('#a3a8aa');
  hipRoof(B.roof, Math.min(...xs) + 0.1, Math.min(...zs) + 0.1, Math.max(...xs) - 0.1, Math.max(...zs) - 0.1, yT - 0.02, 2.6);
  S.prism(ring.flat(), yT - 0.05, yT + 0.6, 0, 0, 'wall');

  const M = {
    wall: new THREE.MeshStandardMaterial({ map: bandTex(r), vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
    det: new THREE.MeshStandardMaterial({ map: speckle(r, '#f6f6f2'), vertexColors: true, roughness: 0.8 }),
    stone: new THREE.MeshStandardMaterial({ map: rustTex(r), vertexColors: true, roughness: 0.95 }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3, emissive: 0xffd49a, emissiveIntensity: 0 }),
  };
  const out = finish(root, 'maiboroda', B, M, { shade: ['wall', 'det', 'stone', 'roof'] });
  console.log(`[cherkasy] Maiboroda house: ${(out.verts / 1000).toFixed(1)}k verts, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    footprints: [{ poly: ring, h: yT + 1.5 - gLo, kind: 'public', name: 'бульвар Шевченка, 287' }],
    levels: { ground: gHi, floor: yF, cornice: yC, top: yT },
    clear: (x, z) => inPoly(ring, x, z) || F.some((f) => { const s = (x - f.ax) * f.ux + (z - f.az) * f.uz, o = (x - f.ax) * f.nx + (z - f.az) * f.nz; return f === front && s > -1 && s < f.L + 1 && o > 0 && o < 4; }),
    update() { M.lit.emissiveIntensity = 0.6 * nightK.value; },
  };
}
