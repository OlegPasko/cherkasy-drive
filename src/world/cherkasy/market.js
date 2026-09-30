// OWNER: cherkasy. Критий ринок, the Central Market hall ("шайба"), vul. Smilianska 41/55 (the market reaches
// vul. Nebesnoi Sotni 30), OSM way 156943342. The round hall of 1966-71 (N. Chmutina, A. Anishchenko: the first round
// market in the USSR, 51 m across, walls of glazed precast frames, a cable-hung roof on a central support) rebuilt after
// the procherk.info 2020 photo report (façade, drone view, construction photos), the 1970-80s postcards and the Esri
// satellite view: a concrete plinth storey behind the stalls, a white lintel band, then seven rows of a deep concrete
// egg-crate (72 bays round, a doubled pier at every precast frame of four bays) with blue-green glazing, a white fascia
// ring; on top a shallow dish of triangular roof panels sagging to the central ring, the glazed lantern of the ring
// ("upper lighting") with a dark cap, ten roof hatches. Five entrance portals, three open (the south-east one under
// a blue "ЦЕНТРАЛЬНИЙ РИНОК" board), two shuttered. Around it: the asphalt market lot, a ring of kiosks and tent
// stalls hugging the hall, then long double rows of booths under white and tarp roofs (the rows the satellite shows
// south-east of the hall) with produce, clothes and household goods on the counters, roller shutters on the closed
// ones, lamp posts on the ring aisle, a few cars parked in the west lane. The hall glows at night.
//   MARKET_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildMarket({ root, map, solids, zips, heightAt, T }) -> { update(), clear(x, z), footprints, parked } | null
// Hall geometry is polar about the footprint centre (angle a: x = cos a, z = sin a); the stall rows run along map z,
// and stall-kit pieces are built in a local frame (x out of the counter, z along the row) placed with M4.
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex, decal } from './sculpt.js';
import { ringPts, rng, inPoly, bboxOf } from './geo.js';

const HALL_ID = 156943342;
export const MARKET_SKIP = new Set([HALL_ID]);

const NMOD = 72, NROW = 7, ROW = 1.15;                  // bays round the drum, egg-crate rows, row height
const STEP = 0.45, GF = 2.5, BAND = 0.6, FASCIA = 0.9;  // floor over grade, plinth storey, lintel band, top fascia
const FIN_D = 0.72, FIN_T = 0.2, SHELF_T = 0.13;        // egg-crate depth, pier and shelf thickness
const SAG = 1.9, RC = 7.4;                              // roof sag to the central ring, ring radius
const PORTALS = [[90, 1], [20, 1], [160, 1], [235, 0], [305, 0]]; // degrees (x = cos, z = sin), open?
const LOT = [[-440, 490], [-362, 490], [-330, 522], [-305, 548], [-305, 632], [-440, 636]];
const PARK = [-424.6, 532, 572];                        // x of the west lane's parking line, z range
const D = 2.4, AW = 0.9, WB = 2.5, PITCH = 8.4;         // booth depth, awning, booth width, row pitch
const CONC = '#d9d8d2', WHITE = '#efefea', GREY = '#a9aba7';
const ROOFS = [['#e6e7e3', 50], ['#cfd2d0', 25], ['#a3b9c6', 8], ['#2f63b0', 7], ['#a8452f', 5], ['#5f8c5a', 5]];
const BANDS = ['#2d5fa8', '#3d8a4a', '#b53a2c', '#e0b52c', '#2d5fa8'];
const PRODUCE = ['#c8321e', '#3f7a2a', '#9c7a4a', '#e8891c', '#b3261e', '#a8c07a', '#e8cf3a', '#c7a05a', '#6b2d5c', '#f0ead8'];
const CLOTHES = ['#2b3a67', '#7a2e3b', '#d9d4c7', '#3c3c3c', '#5f7f9a', '#c46a2f', '#8a8f5a', '#e3b7c0'];
const GOODS = ['#1f6fb5', '#e0e0dc', '#d9467c', '#f2c230', '#2f9a6a', '#8c5a3c', '#555a60'];
const GLASS = ['#6f98a4', '#7ea6b0', '#5c8794', '#86aab2', '#4f6f7a', '#9db8bd'];
const TAU = Math.PI * 2, UP = [0, 1, 0], DOWN = [0, -1, 0];
const pick = (r, list) => list[Math.floor(r() * list.length)];
const wpick = (r, list) => { let t = r() * list.reduce((s, q) => s + q[1], 0); for (const [c, w] of list) if ((t -= w) < 0) return c; return list[0][0]; };

// ------------------------------------------------------------------------------------------------ textures
const noiseTex = (r, base) => canvasTex(256, 256, (g, w, h) => { // weathered concrete, 4 m per repeat
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6000; i++) { g.fillStyle = r() < 0.55 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(60,55,50,0.05)'; g.fillRect(r() * w, r() * h, 2 + r() * 5, 20 + r() * 60); } // rain streaks
});
// one glazed bay: aluminium frame, a mullion and a transom low down, a pale sky reflection high up (uv 0..1 per pane)
const paneTex = () => canvasTex(128, 64, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#d8dde0'); gr.addColorStop(1, '#b9c0c4');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#3c4246'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3); g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h);
  g.fillRect(w / 2 - 1.5, 0, 3, h); g.fillRect(0, h * 0.68, w, 2.5);
}, { repeat: false });
// the dish: one precast triangular panel pair per tile, seams, rust and damp stains
const panelTex = (r) => canvasTex(128, 128, (g, w) => {
  g.fillStyle = '#e4e5e2'; g.fillRect(0, 0, w, w);
  for (let i = 0; i < 1800; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'; g.fillRect(r() * w, r() * w, 1 + r() * 3, 1 + r() * 3); }
  for (let i = 0; i < 3; i++) { g.fillStyle = r() < 0.5 ? 'rgba(110,90,70,0.08)' : 'rgba(40,40,40,0.07)'; g.beginPath(); g.arc(r() * w, r() * w, 6 + r() * 18, 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(70,72,72,0.75)'; g.lineWidth = 2.5;
  g.strokeRect(1, 1, w - 2, w - 2); g.beginPath(); g.moveTo(0, w); g.lineTo(w, 0); g.stroke();
});
const shutterTex = () => canvasTex(64, 64, (g, w, h) => { // roller shutter slats, 0.5 m per repeat
  g.fillStyle = '#e2e4e4'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) { g.fillStyle = '#b7bbbd'; g.fillRect(0, y, w, 2); g.fillStyle = '#f3f4f4'; g.fillRect(0, y + 2, w, 1); }
});
const signTex = () => canvasTex(1024, 128, (g, w, h) => {
  g.fillStyle = '#1d4f9e'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#f7f7f2'; g.fillRect(0, 6, w, 4); g.fillRect(0, h - 10, w, 4);
  g.fillStyle = '#ffd43b'; g.font = 'bold 76px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('ЦЕНТРАЛЬНИЙ РИНОК', w / 2, h / 2 + 3, w - 40);
}, { repeat: false });

// a quad with its own uv, wound to face along n
function quadUV(M, P, n, uv) {
  const ids = P.map((p, i) => M.vert(p[0], p[1], p[2], n[0], n[1], n[2], uv[i][0], uv[i][1]));
  const ax = P[1][0] - P[0][0], ay = P[1][1] - P[0][1], az = P[1][2] - P[0][2], bx = P[2][0] - P[0][0], by = P[2][1] - P[0][1], bz = P[2][2] - P[0][2];
  const d = (ay * bz - az * by) * n[0] + (az * bx - ax * bz) * n[1] + (ax * by - ay * bx) * n[2];
  if (d >= 0) M.quad(ids[0], ids[1], ids[2], ids[3]); else M.quad(ids[0], ids[3], ids[2], ids[1]);
}
const UV1 = [[0, 0], [1, 0], [1, 1], [0, 1]];

// ------------------------------------------------------------------------------------------------ build
export function buildMarket({ root, map, solids: S, zips: Z, heightAt, T }) {
  const hall = map.buildings.find((q) => q.id === HALL_ID);
  if (!hall) return null;
  const t0 = performance.now(), r = rng(HALL_ID % 99991), s0 = S.count;
  const ring = ringPts(hall.p);
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const R = ring.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cz), 0) / ring.length;
  const g = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 0; };
  const hs = ring.map(([x, z]) => g(x, z));
  const yG = Math.max(...hs), gBase = Math.min(...hs) - 0.6;
  const y0 = yG + STEP, yB0 = y0 + GF, yB1 = yB0 + BAND, yGT = yB1 + NROW * ROW, yTop = yGT + FASCIA;
  const Rf = R - 0.05, Rg = Rf - FIN_D, Rr = Rf - 0.25, yRim = yTop - 0.25, yLow = yRim - SAG;
  const pol = (a, rr, y) => [cx + rr * Math.cos(a), y, cz + rr * Math.sin(a)];
  const nrm = (a) => [Math.cos(a), 0, Math.sin(a)];
  const dA = TAU / NMOD;
  const deg = (d) => (d * Math.PI) / 180;
  const portals = PORTALS.map(([d, open], i) => ({ a: deg(d), open: !!open, main: i === 0 }));
  const angDist = (a, b) => Math.abs(((a - b + 3 * Math.PI) % TAU) - Math.PI);
  const portalAt = (a) => portals.find((p) => angDist(a, p.a) < 1.55 * dA);

  const B = { conc: new MB(), glass: new MB(), lit: new MB(), roof: new MB(), det: new MB(), shut: new MB(), tarp: new MB(), glow: new MB(), sign: new MB() };
  const C = B.conc, Dt = B.det;
  const obox = (x, z, hx, hz, ang, ya, yb, kind = 'wall', flags = 0) => S.obox(x, z, hx, hz, ang, ya, yb, kind, flags);

  // ---- the drum: plinth storey, lintel band, egg-crate with glazing, fascia (per bay, polar)
  let nLit = 0;
  for (let i = 0; i < NMOD; i++) {
    const a0 = i * dA, a1 = a0 + dA, am = a0 + dA / 2, n = nrm(am), P = portalAt(am);
    // plinth storey: recessed concrete wall with a strip of high windows, left out where a portal stands
    const Rw = Rg + 0.12;
    if (!P) {
      C.setColor('#c9c8c1');
      C.face([pol(a0, Rw, gBase), pol(a1, Rw, gBase), pol(a1, Rw, y0 + 1.1), pol(a0, Rw, y0 + 1.1)], n);
      C.face([pol(a0, Rw, y0 + 2.2), pol(a1, Rw, y0 + 2.2), pol(a1, Rw, yB0), pol(a0, Rw, yB0)], n);
      const ga = a0 + 0.08 * dA, gb = a1 - 0.08 * dA, lit = r() < 0.5, G = lit ? B.lit : B.glass;
      C.face([pol(a0, Rw, y0 + 1.1), pol(ga, Rw, y0 + 1.1), pol(ga, Rw, y0 + 2.2), pol(a0, Rw, y0 + 2.2)], n);
      C.face([pol(gb, Rw, y0 + 1.1), pol(a1, Rw, y0 + 1.1), pol(a1, Rw, y0 + 2.2), pol(gb, Rw, y0 + 2.2)], n);
      G.setColor(pick(r, GLASS)); quadUV(G, [pol(ga, Rw - 0.08, y0 + 1.1), pol(gb, Rw - 0.08, y0 + 1.1), pol(gb, Rw - 0.08, y0 + 2.2), pol(ga, Rw - 0.08, y0 + 2.2)], n, UV1);
    }
    // lintel band flush with the pier fronts, its soffit back to the plinth wall
    C.setColor(WHITE);
    C.face([pol(a0, Rf + 0.04, yB0), pol(a1, Rf + 0.04, yB0), pol(a1, Rf + 0.04, yB1), pol(a0, Rf + 0.04, yB1)], n);
    C.face([pol(a0, Rw, yB0), pol(a1, Rw, yB0), pol(a1, Rf + 0.04, yB0), pol(a0, Rf + 0.04, yB0)], DOWN);
    // glazing, one pane per cell between shelf and shelf
    for (let k = 0; k < NROW; k++) {
      const ya = yB1 + k * ROW + SHELF_T / 2, yb = yB1 + (k + 1) * ROW - SHELF_T / 2, lit = r() < 0.62, G = lit ? B.lit : B.glass;
      G.setColor(!lit && r() < 0.08 ? '#c8cccb' : pick(r, GLASS));
      quadUV(G, [pol(a0, Rg, ya), pol(a1, Rg, ya), pol(a1, Rg, yb), pol(a0, Rg, yb)], n, UV1);
      if (lit) nLit++;
    }
    // shelves: every row line, as deep as the piers, their faces between the piers
    const fa = a0 + (FIN_T / 2) / Rf, fb = a1 - (FIN_T / 2) / Rf;
    C.setColor(CONC);
    for (let k = 0; k <= NROW; k++) {
      const y = yB1 + k * ROW, ya = y - SHELF_T / 2, yb = y + SHELF_T / 2;
      if (k < NROW) C.face([pol(fa, Rg, yb), pol(fb, Rg, yb), pol(fb, Rf, yb), pol(fa, Rf, yb)], UP);
      if (k > 0) C.face([pol(fa, Rg, ya), pol(fb, Rg, ya), pol(fb, Rf, ya), pol(fa, Rf, ya)], DOWN);
      C.face([pol(fa, Rf, ya), pol(fb, Rf, ya), pol(fb, Rf, yb), pol(fa, Rf, yb)], n);
    }
    // pier on the a0 line: single, or doubled where two precast frames of four bays meet
    const piers = i % 4 === 0 ? [-0.11, 0.11] : [0];
    for (const off of piers) {
      const t = i % 4 === 0 ? 0.14 : FIN_T, pa = a0 + (off - t / 2) / Rf, pb = a0 + (off + t / 2) / Rf;
      const pn = nrm(a0), ta = [-Math.sin(a0), 0, Math.cos(a0)];
      C.setColor(CONC);
      C.face([pol(pa, Rf, yB1), pol(pb, Rf, yB1), pol(pb, Rf, yGT), pol(pa, Rf, yGT)], pn);
      C.face([pol(pa, Rg, yB1), pol(pa, Rf, yB1), pol(pa, Rf, yGT), pol(pa, Rg, yGT)], [-ta[0], 0, -ta[2]]);
      C.face([pol(pb, Rg, yB1), pol(pb, Rf, yB1), pol(pb, Rf, yGT), pol(pb, Rg, yGT)], ta);
    }
    // fascia ring: a white band standing a little proud, its soffit and a coping, the parapet's inner face
    C.setColor(WHITE);
    C.face([pol(a0, Rf + 0.22, yGT), pol(a1, Rf + 0.22, yGT), pol(a1, Rf + 0.22, yTop), pol(a0, Rf + 0.22, yTop)], n);
    C.face([pol(a0, Rg, yGT), pol(a1, Rg, yGT), pol(a1, Rf + 0.22, yGT), pol(a0, Rf + 0.22, yGT)], DOWN);
    C.setColor('#b9bab5');
    C.face([pol(a0, Rr, yTop + 0.06), pol(a1, Rr, yTop + 0.06), pol(a1, Rf + 0.26, yTop + 0.06), pol(a0, Rf + 0.26, yTop + 0.06)], UP);
    C.face([pol(a0, Rf + 0.26, yTop - 0.02), pol(a1, Rf + 0.26, yTop - 0.02), pol(a1, Rf + 0.26, yTop + 0.06), pol(a0, Rf + 0.26, yTop + 0.06)], n);
    C.face([pol(a0, Rr, yRim), pol(a1, Rr, yRim), pol(a1, Rr, yTop + 0.06), pol(a0, Rr, yTop + 0.06)], [-n[0], 0, -n[2]]);
  }

  // ---- the dish: triangular panels sagging from the rim to the central ring (radial cables), polar uv
  const NR = 6, prof = (t) => yLow + SAG * (0.35 * t + 0.65 * t * t); // steeper at the rim, flat toward the ring
  const rOf = (j) => RC + 0.6 + (Rr - RC - 0.6) * (j / NR);
  const slope = (t) => SAG * (0.35 + 1.3 * t) / (Rr - RC - 0.6);
  const Rf2 = B.roof, grid = [];
  Rf2.setColor('#ffffff');
  for (let j = 0; j <= NR; j++) {
    const t = j / NR, rr = rOf(j), y = prof(t), s = slope(t), l = Math.hypot(s, 1), row = [];
    for (let i = 0; i <= NMOD; i++) { const a = i * dA; row.push(Rf2.vert(cx + rr * Math.cos(a), y, cz + rr * Math.sin(a), -s * Math.cos(a) / l, 1 / l, -s * Math.sin(a) / l, i, j * 1.4)); }
    grid.push(row);
  }
  for (let j = 0; j < NR; j++) for (let i = 0; i < NMOD; i++) Rf2.quad(grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]);
  // the central ring beam, the glazed lantern on it and its dark cap
  const yL1 = yLow + 1.05, NL = 36;
  C.setColor('#9d9e99');
  for (let i = 0; i < NL; i++) {
    const a0 = (i / NL) * TAU, a1 = ((i + 1) / NL) * TAU, am = (a0 + a1) / 2, n = nrm(am);
    C.face([pol(a0, RC - 0.2, yLow + 0.18), pol(a1, RC - 0.2, yLow + 0.18), pol(a1, RC + 0.6, yLow + 0.18), pol(a0, RC + 0.6, yLow + 0.18)], UP);
    C.face([pol(a0, RC + 0.6, yLow - 0.1), pol(a1, RC + 0.6, yLow - 0.1), pol(a1, RC + 0.6, yLow + 0.18), pol(a0, RC + 0.6, yLow + 0.18)], n);
    B.lit.setColor('#8c8a80');
    quadUV(B.lit, [pol(a0, RC - 0.3, yLow + 0.18), pol(a1, RC - 0.3, yLow + 0.18), pol(a1, RC - 0.3, yL1 - 0.12), pol(a0, RC - 0.3, yL1 - 0.12)], n, UV1);
    C.face([pol(a0, RC - 0.12, yL1 - 0.12), pol(a1, RC - 0.12, yL1 - 0.12), pol(a1, RC - 0.12, yL1), pol(a0, RC - 0.12, yL1)], n);
  }
  Dt.setColor('#5e5a54'); Dt.cyl(cx, yL1, cz, RC - 0.12, RC - 0.9, 0.35, NL);
  Dt.setColor('#77736b'); Dt.cyl(cx, yL1 + 0.35, cz, 1.6, 1.2, 0.5, 12);
  // roof hatches (sloped lids) and vent stacks
  const hatches = [];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU + 0.21, rr = 15.8 + (k % 2) * 0.9, [x, , z] = pol(a, rr, 0), t = (rr - RC - 0.6) / (Rr - RC - 0.6), y = prof(t);
    Dt.setXf(M4(x, y - 0.1, z, -a));
    Dt.setColor('#c9cbc8'); Dt.box(-0.8, 0, -0.75, 0.8, 0.75, 0.75, 1 | 2 | 16 | 32);
    Dt.setColor('#5d6266'); Dt.face([[-0.85, 0.95, -0.8], [0.85, 0.6, -0.8], [0.85, 0.6, 0.8], [-0.85, 0.95, 0.8]], [0.2, 1, 0]);
    Dt.setColor('#c9cbc8'); for (const zz of [-0.75, 0.75]) Dt.face([[-0.8, 0.75, zz], [0.8, 0.75, zz], [0.8, 0.6, zz], [-0.8, 0.95, zz]], [0, 0, Math.sign(zz)]);
    Dt.face([[-0.8, 0.75, -0.75], [-0.8, 0.95, -0.75], [-0.8, 0.95, 0.75], [-0.8, 0.75, 0.75]], [-1, 0, 0]);
    Dt.setXf(null);
    hatches.push([x, z, a, y]);
    S.obox(x, z, 0.85, 0.8, a, y - 0.2, y + 0.9, 'equipment');
  }
  Dt.setColor('#8e9194');
  for (const [a, rr] of [[1.1, 21], [2.9, 20.5], [4.4, 21.5], [5.6, 12]]) { const [x, , z] = pol(a, rr, 0), y = prof((rr - RC - 0.6) / (Rr - RC - 0.6)); Dt.cyl(x, y, z, 0.22, 0.22, 1.3, 8); Dt.cyl(x, y + 1.3, z, 0.34, 0.3, 0.12, 8); }

  // ---- entrance portals: a white frame standing out of the drum, glass doors (or shutters), steps, a canopy
  for (const P of portals) {
    const a = P.a, [px, , pz] = pol(a, Rg, 0), W2 = 3.3, out = FIN_D + 1.3, yH = yB1 + 0.25;
    C.setXf(M4(px, 0, pz, -a)); Dt.setXf(M4(px, 0, pz, -a)); B.lit.setXf(M4(px, 0, pz, -a)); B.shut.setXf(M4(px, 0, pz, -a)); B.sign.setXf(M4(px, 0, pz, -a));
    C.setColor(WHITE);
    C.box(-0.3, gBase, -W2, out, yH, -W2 + 0.45, 1 | 4 | 16 | 32); C.box(-0.3, gBase, W2 - 0.45, out, yH, W2, 1 | 4 | 16 | 32); // cheeks
    C.box(0, y0 + 2.75, -W2 + 0.45, out, yH, W2 - 0.45, 1 | 4 | 8);                                             // head
    C.setColor('#cfcfc8'); C.box(0.05, y0 - 0.02, -W2 + 0.45, 0.25, y0 + 2.75, W2 - 0.45, 1);                  // recess back
    Dt.setColor('#b7b8b3'); Dt.box(0, gBase, -W2 + 0.45, out, y0, W2 - 0.45, 1 | 4);                            // landing
    for (let s = 0; s < 3; s++) { const y = y0 - 0.15 * (s + 1); Dt.setColor(s & 1 ? '#a9aaa5' : '#b3b4af'); Dt.box(out + s * 0.32, gBase, -W2 + 0.2, out + (s + 1) * 0.32, y, W2 - 0.2, 1 | 4 | 16 | 32); }
    if (P.open) {
      B.lit.setColor('#7b776c'); B.lit.face([[0.3, y0, -2.5], [0.3, y0, 2.5], [0.3, y0 + 2.7, 2.5], [0.3, y0 + 2.7, -2.5]], [1, 0, 0]);
      Dt.setColor('#8f9396'); for (const zz of [-2.5, -1.25, 0, 1.25, 2.5]) Dt.box(0.3, y0, zz - 0.04, 0.38, y0 + 2.7, zz + 0.04, 1 | 16 | 32);
      Dt.box(0.3, y0 + 2.1, -2.5, 0.38, y0 + 2.18, 2.5, 1 | 4 | 8);
    } else {
      B.shut.setColor('#ffffff'); B.shut.face([[0.3, y0, -2.85], [0.3, y0, 2.85], [0.3, y0 + 2.75, 2.85], [0.3, y0 + 2.75, -2.85]], [1, 0, 0]);
    }
    if (P.main) { // the blue board on the portal head
      const E = B.sign.setColor('#ffffff'), xo = out + 0.03, ya = y0 + 2.78, yb = yH - 0.06;
      quadUV(E, [[xo, ya, W2 - 0.2], [xo, ya, -W2 + 0.2], [xo, yb, -W2 + 0.2], [xo, yb, W2 - 0.2]], [1, 0, 0], UV1);
      B.lit.setColor('#fff4dc'); B.lit.box(out, y0 + 2.62, -1.6, out + 0.12, y0 + 2.7, 1.6, 1 | 8);
    }
    C.setXf(null); Dt.setXf(null); B.lit.setXf(null); B.shut.setXf(null); B.sign.setXf(null);
    obox(...pol(a, Rg + out / 2, 0).filter((_, k) => k !== 1), out / 2, W2, a, gBase, yH);
    obox(...pol(a, Rg + out + 0.48, 0).filter((_, k) => k !== 1), 0.48, W2 - 0.2, a, gBase, y0 - 0.15, 'step');
  }

  // ---- collision: the drum up to the dish's low point, stepped rings over it, the lantern, the parapet
  const circ = (rr, seg = NMOD) => { const out = []; for (let i = 0; i < seg; i++) { const a = (i / seg) * TAU; out.push(cx + rr * Math.cos(a), cz + rr * Math.sin(a)); } return out; };
  S.prism(circ(Rf), gBase, yLow + 0.18);
  for (let j = 0; j < 4; j++) {
    const ra = RC + 0.6 + (Rr - RC - 0.6) * (j / 4), rb = RC + 0.6 + (Rr - RC - 0.6) * ((j + 1) / 4);
    S.prism(circ(rb, 48), yLow, prof((j + 0.5) / 4), 0, 0, 'roof', 0, [circ(ra, 48)]);
  }
  S.prism(circ(Rf + 0.26), yLow, yTop + 0.06, 0, 0, 'wall', 0, [circ(Rr, 48)]);
  S.cyl(cx, cz, yLow, yL1 + 0.35, RC - 0.1, RC - 0.9, 'roof');
  for (let k = 0; k < 24; k++) { // roof-edge grab points round the rim
    const a0 = (k / 24) * TAU, a1 = ((k + 1) / 24) * TAU, [x0, , z0] = pol(a0, Rf + 0.1, 0), [x1, , z1] = pol(a1, Rf + 0.1, 0), am = (a0 + a1) / 2;
    Z.edge(x0, z0, x1, z1, yTop + 0.06, Math.cos(am), Math.sin(am));
  }

  // ---- the lot: an occupancy raster (0.5 m) of the other buildings, the hall zone and the parking lane
  const bb = bboxOf(LOT), CELL = 0.5, gx = Math.ceil((bb.x1 - bb.x0) / CELL), gz = Math.ceil((bb.z1 - bb.z0) / CELL);
  const occ = new Uint8Array(gx * gz), inLot = (x, z) => inPoly(LOT, x, z);
  for (const b of map.buildings) {
    if (b.id === HALL_ID) continue;
    const P = ringPts(b.p), q = bboxOf(P);
    if (q.x1 < bb.x0 - 2 || q.x0 > bb.x1 + 2 || q.z1 < bb.z0 - 2 || q.z0 > bb.z1 + 2) continue;
    const i0 = Math.max(0, Math.floor((q.x0 - 1.2 - bb.x0) / CELL)), i1 = Math.min(gx - 1, Math.ceil((q.x1 + 1.2 - bb.x0) / CELL));
    const j0 = Math.max(0, Math.floor((q.z0 - 1.2 - bb.z0) / CELL)), j1 = Math.min(gz - 1, Math.ceil((q.z1 + 1.2 - bb.z0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = bb.x0 + (i + 0.5) * CELL, z = bb.z0 + (j + 0.5) * CELL; // inside, or within 1.2 m of the outline
      if (inPoly(P, x, z) || [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2], [0.85, 0.85], [-0.85, 0.85], [0.85, -0.85], [-0.85, -0.85]].some(([dx, dz]) => inPoly(P, x + dx, z + dz))) occ[j * gx + i] = 1;
    }
  }
  const free = (x, z) => {
    if (!inLot(x, z)) return false;
    const i = Math.floor((x - bb.x0) / CELL), j = Math.floor((z - bb.z0) / CELL);
    if (i < 0 || j < 0 || i >= gx || j >= gz || occ[j * gx + i]) return false;
    return !(Math.abs(x - PARK[0]) < 2.2 && z > PARK[1] - 3 && z < PARK[2] + 3);
  };
  const rectFree = (x0, z0, x1, z1) => {
    for (let x = x0; x <= x1 + 1e-6; x += Math.max(0.5, (x1 - x0) / Math.ceil((x1 - x0) / 1))) {
      for (let z = z0; z <= z1 + 1e-6; z += Math.max(0.5, (z1 - z0) / Math.ceil((z1 - z0) / 1))) if (!free(x, z)) return false;
    }
    return true;
  };

  // ---- the stall kit, in a local frame: x from the back wall (0) out to the counter (D), z along the row, y up
  const goodsOn = (M, kind, w) => { // crates and heaps on the counter, shelves behind, hanging clothes
    if (kind === 'clothes') {
      for (let z = -w / 2 + 0.3; z < w / 2 - 0.2; z += 0.34) { M.setColor(pick(r, CLOTHES)); M.box(D + 0.1, 1.05 + r() * 0.2, z - 0.14, D + 0.16, 2.2, z + 0.14, 1 | 2 | 16 | 32); }
      M.setColor('#44474a'); M.box(D + 0.08, 2.22, -w / 2 + 0.2, D + 0.14, 2.28, w / 2 - 0.2, 1 | 4);
      for (let k = 0; k < 3; k++) { M.setColor(pick(r, CLOTHES)); M.box(0.05, 0.4 + k * 0.55, -w / 2 + 0.15, 0.45, 0.8 + k * 0.55, w / 2 - 0.15, 1 | 4); }
      return;
    }
    const pal = kind === 'produce' ? PRODUCE : GOODS;
    for (let z = -w / 2 + 0.15; z < w / 2 - 0.35; z += 0.52) { // a crate (wooden or plastic) heaped with one thing
      M.setColor(kind === 'produce' ? '#b08a57' : '#d9d9d4'); M.box(D - 0.55, 0.9, z, D - 0.05, 1.02, z + 0.45, 1 | 16 | 32);
      M.setColor(pick(r, pal)); M.box(D - 0.5, 1.02, z + 0.04, D - 0.1, 1.12 + r() * 0.12, z + 0.41, 1 | 4);
    }
    for (let k = 0; k < 3; k++) for (const [za, zb] of [[-w / 2 + 0.15, -0.05], [0.05, w / 2 - 0.15]]) { M.setColor(pick(r, pal)); M.box(0.05, 1.0 + k * 0.45, za, 0.35, 1.28 + k * 0.45, zb, 1 | 4); }
    if (kind === 'produce' && r() < 0.35) for (let z = -w / 2 + 0.3; z < w / 2 - 0.3; z += 0.7) { M.setColor(pick(r, PRODUCE)); M.box(D + 0.1, 0, z, D + 0.55, 0.3, z + 0.45, 1 | 4 | 16 | 32); } // crates on the ground
  };
  const booth = (w, kind, open) => { // walls, counter, goods or a shutter; the roof is the run's
    Dt.setColor('#dcdcd6'); Dt.box(0, 0, -w / 2, 0.08, 2.55, w / 2, 1); Dt.box(0, 0, -w / 2, D, 2.55, -w / 2 + 0.05, 16 | 32);
    if (!open) { B.shut.setColor(r() < 0.3 ? '#cfd8e0' : '#ffffff'); B.shut.face([[D, 0, -w / 2], [D, 0, w / 2], [D, 2.45, w / 2], [D, 2.45, -w / 2]], [1, 0, 0]); return; }
    Dt.setColor(pick(r, ['#f2f2ee', '#e6e2d6', '#9fb3c2'])); Dt.box(D - 0.6, 0, -w / 2 + 0.05, D, 0.9, w / 2, 1 | 4);
    Dt.setColor('#c3c6c6'); Dt.box(D - 0.25, 2.25, -w / 2 + 0.05, D, 2.45, w / 2, 1 | 8);                      // rolled shutter
    B.glow.setColor('#ffffff'); B.glow.box(D - 0.9, 2.33, -0.5, D - 0.8, 2.37, 0.5, 8);                         // tube light
    goodsOn(Dt, kind, w);
  };
  const kinds = ['produce', 'produce', 'produce', 'clothes', 'goods'];

  // ---- a ring of kiosks and tent stalls hugging the hall, gaps at the portals
  let nRing = 0;
  const r0 = Rf + 0.35, rm = r0 + D / 2, dRing = 2.5 / (rm + 0.5);
  for (let a = 0; a < TAU - dRing; a += dRing) {
    const am = a + dRing / 2;
    if (portals.some((p) => angDist(am, p.a) < (3.3 + 2.2) / rm)) continue;
    const cs = Math.cos(am), sn = Math.sin(am), ts = [-sn, cs];
    const corners = [[r0 - 0.1, -1.2], [r0 + D + 0.9, -1.2], [r0 - 0.1, 1.2], [r0 + D + 0.9, 1.2], [r0 + D / 2, 0]];
    if (!corners.every(([rr, t]) => free(cx + cs * rr + ts[0] * t, cz + sn * rr + ts[1] * t))) continue;
    const [bx, , bz] = pol(am, r0, 0), y = g(bx + cs * D / 2, bz + sn * D / 2), open = r() < 0.72, M = M4(bx, y, bz, -am);
    for (const b of [Dt, B.shut, B.glow, B.tarp]) b.setXf(M);
    if (r() < 0.55) { // a metal kiosk: flat roof with a coloured band
      booth(2.35, pick(r, kinds), open);
      Dt.setColor('#dcdcd6'); Dt.box(0, 0, 1.17, D, 2.55, 1.22, 16);
      Dt.setColor(pick(r, BANDS)); Dt.box(-0.05, 2.45, -1.28, D + 0.55, 2.8, 1.28, 1 | 16 | 32 | 8);
      Dt.setColor('#b8bbbb'); Dt.box(-0.05, 2.8, -1.28, D + 0.55, 2.84, 1.28, 4);
    } else { // a tent stall: legs, a table, a sloped tarp both faces
      const col = wpick(r, ROOFS);
      Dt.setColor('#6d7174'); for (const [x, z] of [[0.1, -1.1], [0.1, 1.1], [D + 0.7, -1.1], [D + 0.7, 1.1]]) Dt.box(x - 0.03, 0, z - 0.03, x + 0.03, x > 1 ? 2.3 : 2.75, z + 0.03, 1 | 2 | 16 | 32);
      Dt.setColor('#e9e7e0'); Dt.box(D - 0.9, 0.78, -1.1, D + 0.1, 0.84, 1.1, 1 | 2 | 4 | 16 | 32);
      for (const [c, nn] of [[col, [0.25, 1, 0]], [col, [-0.25, -1, 0]]]) { B.tarp.setColor(c); B.tarp.face([[0, 2.8, -1.25], [D + 0.9, 2.3, -1.25], [D + 0.9, 2.3, 1.25], [0, 2.8, 1.25]], nn); }
      B.tarp.setColor(col); B.tarp.face([[D + 0.9, 2.3, -1.25], [D + 0.9, 2.3, 1.25], [D + 0.9, 2.05, 1.25], [D + 0.9, 2.05, -1.25]], [1, 0, 0]);
      const kind = pick(r, kinds);
      if (kind !== 'clothes') for (let z = -0.95; z < 0.9; z += 0.5) { Dt.setColor(pick(r, kind === 'produce' ? PRODUCE : GOODS)); Dt.box(D - 0.8, 0.84, z, D - 0.1, 0.98 + r() * 0.1, z + 0.4, 1 | 4 | 16 | 32); }
      else for (let z = -0.9; z < 0.9; z += 0.3) { Dt.setColor(pick(r, CLOTHES)); Dt.box(0.3, 0.9, z, 0.36, 2.1, z + 0.24, 1 | 2 | 16 | 32); }
    }
    for (const b of [Dt, B.shut, B.glow, B.tarp]) b.setXf(null);
    obox(...pol(am, r0 + D / 2, 0).filter((_, k) => k !== 1), D / 2, 1.2, am, y - 0.3, y + 2.55);
    obox(...pol(am, r0 + D + 0.45, 0).filter((_, k) => k !== 1), 0.45, 1.25, am, y + 2.2, y + 2.85, 'awning', 1);
    nRing++;
  }

  // ---- long double rows of booths along map z, back to back under one ridged roof, aisles between them
  let nBooth = 0, nRun = 0;
  const runs = [];
  for (let xr = bb.x0 + 4.2; xr < bb.x1 - 3; xr += PITCH) {
    let cur = null;
    const flush = () => { if (cur && cur.n >= 2) runs.push(cur); cur = null; };
    for (let z = bb.z0; z + WB <= bb.z1; z += WB) {
      const ok = rectFree(xr - D - AW, z, xr + D + AW, z + WB) && [[xr - D - AW, z], [xr + D + AW, z], [xr - D - AW, z + WB], [xr + D + AW, z + WB]].every(([x, zz]) => Math.hypot(x - cx, zz - cz) > Rf + 8.5);
      if (!ok || (cur && cur.n >= 9)) { flush(); if (ok) z += 0.5; continue; } // a cross aisle every 9 booths
      if (!cur) cur = { x: xr, z0: z, n: 0 };
      cur.n++;
    }
    flush();
  }
  for (const run of runs) {
    const { x: xr, z0, n } = run, z1 = z0 + n * WB, y = Math.min(g(xr, z0), g(xr, z1), g(xr, (z0 + z1) / 2)), col = wpick(r, ROOFS);
    const yR = y + 3.05, yE = y + 2.42, xe = D + AW;
    for (let k = 0; k < n; k++) for (const side of [1, -1]) {
      const zc = z0 + (k + 0.5) * WB, M = M4(xr, y, zc, side > 0 ? 0 : Math.PI);
      for (const b of [Dt, B.shut, B.glow]) b.setXf(M);
      booth(WB, pick(r, kinds), r() < 0.78);
      nBooth++;
    }
    for (const b of [Dt, B.shut, B.glow]) b.setXf(null);
    Dt.setColor('#dcdcd6'); Dt.box(xr - D, y, z1 - 0.05, xr + D, y + 2.55, z1, 16); // closing end walls
    Dt.box(xr - D, y, z0, xr + D, y + 2.55, z0 + 0.05, 32);
    // the roof: two slopes and their undersides, gable ends, a fascia strip on the eaves, a ridge cap
    for (const s of [1, -1]) {
      const n1 = [s * (yR - yE) / xe, 1, 0], n2 = [-n1[0], -1, 0];
      B.tarp.setColor(col);
      B.tarp.face([[xr, yR, z0 - 0.3], [xr + s * xe, yE, z0 - 0.3], [xr + s * xe, yE, z1 + 0.3], [xr, yR, z1 + 0.3]], n1);
      B.tarp.setColor(col === '#e6e7e3' ? '#c4c6c2' : col); B.tarp.face([[xr, yR - 0.05, z0 - 0.3], [xr + s * xe, yE - 0.05, z0 - 0.3], [xr + s * xe, yE - 0.05, z1 + 0.3], [xr, yR - 0.05, z1 + 0.3]], n2);
      Dt.setColor('#b3b6b6'); Dt.box(Math.min(xr + s * xe, xr + s * (xe + 0.04)), yE - 0.22, z0 - 0.3, Math.max(xr + s * xe, xr + s * (xe + 0.04)), yE, z1 + 0.3, s > 0 ? 1 : 2);
      for (const [zz, nz] of [[z0 - 0.3, -1], [z1 + 0.3, 1]]) { B.tarp.setColor(col); B.tarp.face([[xr, yR, zz], [xr + s * xe, yE, zz], [xr + s * xe, yE - 0.05, zz], [xr, yR - 0.05, zz]], [0, 0, nz]); }
      for (let zz = z0 + 0.1; zz < z1; zz += WB * 3) { Dt.setColor('#7d8184'); Dt.box(xr + s * (xe - 0.1) - 0.04, y, zz - 0.04, xr + s * (xe - 0.1) + 0.04, yE, zz + 0.04, 1 | 2 | 16 | 32); } // awning posts
    }
    Dt.setColor('#9ea2a3'); Dt.box(xr - 0.15, yR - 0.02, z0 - 0.3, xr + 0.15, yR + 0.06, z1 + 0.3, 1 | 2 | 4 | 16 | 32);
    S.box(xr - D, y - 0.3, z0, xr + D, yR, z1, 'wall');
    for (const s of [1, -1]) S.box(Math.min(xr + s * D, xr + s * xe), yE - 0.25, z0 - 0.3, Math.max(xr + s * D, xr + s * xe), yE + 0.3, z1 + 0.3, 'awning', 1);
    nRun++;
  }

  // ---- lamp posts round the ring aisle, parked cars in the west lane
  let nLamp = 0;
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU + 0.33, [x, , z] = pol(a, Rf + 6.2, 0);
    if (!free(x, z)) continue;
    const y = g(x, z);
    Dt.setColor('#4b4f53'); Dt.cyl(x, y, z, 0.12, 0.07, 7.5, 8); Dt.cyl(x, y, z, 0.2, 0.2, 0.6, 8);
    Dt.tube([x, y + 7.3, z], [x - Math.cos(a) * 1.3, y + 7.6, z - Math.sin(a) * 1.3], 0.05, 5);
    const lx = x - Math.cos(a) * 1.3, lz = z - Math.sin(a) * 1.3;
    Dt.setColor('#3f4246'); Dt.boxC(lx, y + 7.62, lz, 0.6, 0.12, 0.3);
    B.glow.setColor('#fff1d0'); B.glow.boxC(lx, y + 7.54, lz, 0.5, 0.04, 0.24);
    S.cyl(x, z, y, y + 7.5, 0.13, 0.13, 'pole');
    nLamp++;
  }
  const parked = [];
  for (let z = PARK[1]; z <= PARK[2]; z += 5.6) if (inLot(PARK[0], z)) parked.push([PARK[0], z, -Math.PI / 2]);

  // ---- asphalt over the whole lot (a decal on a 3 m lattice, over the land and walk layers of ground.js)
  const pave = { pos: [], uv: [], idx: [] }, CE = 3, nx = Math.ceil((bb.x1 - bb.x0) / CE), nz = Math.ceil((bb.z1 - bb.z0) / CE);
  const vid = new Int32Array((nx + 1) * (nz + 1)).fill(-1);
  const vAt = (i, j) => {
    const k = j * (nx + 1) + i;
    if (vid[k] < 0) { const x = bb.x0 + i * CE, z = bb.z0 + j * CE; vid[k] = pave.pos.length / 3; pave.pos.push(x, g(x, z) + 0.21, z); pave.uv.push(x / 7, z / 7); }
    return vid[k];
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = bb.x0 + (i + 0.5) * CE, z = bb.z0 + (j + 0.5) * CE;
    if (!inLot(x, z)) continue;
    const a = vAt(i, j), b = vAt(i + 1, j), c = vAt(i, j + 1), d = vAt(i + 1, j + 1);
    pave.idx.push(a, c, b, b, c, d);
  }

  // ---- meshes
  const group = Object.assign(new THREE.Group(), { name: 'market' });
  root.add(group);
  const conc = noiseTex(r, '#f2f1ec'), pane = paneTex(), panels = panelTex(r), shut = shutterTex(), sign = signTex();
  conc.repeat.set(0.25, 0.25); shut.repeat.set(1, 2);
  const M = {
    conc: new THREE.MeshStandardMaterial({ map: conc, vertexColors: true, roughness: 0.88 }),
    glass: new THREE.MeshStandardMaterial({ map: pane, vertexColors: true, roughness: 0.12, metalness: 0.45, envMapIntensity: 1.2 }),
    lit: new THREE.MeshStandardMaterial({ map: pane, emissiveMap: pane, vertexColors: true, roughness: 0.18, metalness: 0.2, emissive: 0xffe2b0, emissiveIntensity: 0 }),
    roof: new THREE.MeshStandardMaterial({ map: panels, color: '#c4c6c4', roughness: 0.9 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    shut: new THREE.MeshStandardMaterial({ map: shut, vertexColors: true, roughness: 0.55, metalness: 0.3 }),
    tarp: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    glow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: 0xfff4dc, emissiveIntensity: 0 }),
    sign: new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, roughness: 0.45, emissive: 0xffffff, emissiveIntensity: 0 }),
    pave: decal(new THREE.MeshStandardMaterial({ map: T?.asphalt ?? null, color: '#d2d0ca', roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 })),
  };
  let nV = 0;
  for (const [k, Bk] of Object.entries(B)) {
    if (!Bk.v) continue;
    nV += Bk.v;
    const flat = k === 'glass' || k === 'lit' || k === 'glow' || k === 'sign';
    group.add(Object.assign(new THREE.Mesh(Bk.build(), M[k]), { name: 'market-' + k, castShadow: !flat, receiveShadow: true }));
  }
  if (pave.idx.length) {
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pave.pos, 3));
    pg.setAttribute('uv', new THREE.Float32BufferAttribute(pave.uv, 2));
    pg.setIndex(pave.idx); pg.computeVertexNormals();
    group.add(Object.assign(new THREE.Mesh(pg, M.pave), { name: 'market-lot', receiveShadow: true }));
    nV += pave.pos.length / 3;
  }
  console.log(`[cherkasy] market: hall r ${R.toFixed(1)} m, top ${(yTop - yG).toFixed(1)} m, ${nLit} lit panes, ${nRing} ring stalls, ${nRun} rows / ${nBooth} booths, ${nLamp} lamps, ${parked.length} parked, ${(nV / 1000).toFixed(1)}k verts, ${S.count - s0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    footprints: [{ poly: ring, h: yTop - yG, kind: 'public', name: 'Критий ринок' }],
    parked,
    clear: (x, z) => inLot(x, z) || Math.hypot(x - cx, z - cz) < R + 4, // no generated trees on the market
    update() { const k = nightK.value; M.lit.emissiveIntensity = 1.5 * k; M.glow.emissiveIntensity = 2.4 * k; M.sign.emissiveIntensity = 0.55 * k; },
  };
}
