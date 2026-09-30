// OWNER: cherkasy. Палац одружень (the civil-registry wedding palace), вул. Небесної Сотні, 3 – the mansion of the
// hrabar (earthworks contractor) Shcherbyna, c. 1892, neo-Renaissance with eclectic trim; the wedding palace since 1970,
// the rear semicircular hall and the wide steps from 1983, the sand-yellow and white livery and the floodlights from
// 2010–11 (OSM way 207051954). Rebuilt after the Wikimedia Commons photos (2011–2022, day and night): a symmetric front
// closing the vista down Khreshchatyk – two one-storey pavilions, each with a big round-arched window between pairs of
// white Corinthian columns on panelled pedestals, a bracketed frieze with dentils, segmental pediments over the column
// pairs and an oculus in the parapet; the recessed centre with the wrought-iron double gate under the
// "ПАЛАЦ ОДРУЖЕННЯ" band, arched windows either side, granite steps with white urns; the second storey over it with
// four columns, twin arched windows, the triple window on a balcony with an iron railing (the national banner hung on
// it) and the big semicircular attic gable with an arched window, dentilled archivolts, pinnacles and ring
// balustrades; the canted east corner with crest gables; plainer side and rear façades with pedimented windows, the
// rear apse, hipped grey roofs; a dark red granite plinth all round. Around it: the gate pylons and iron gate on the
// west side, globe lamps on the forecourt and the bronze tactile miniature of the palace (2017) by the east corner.
// At night the windows glow, the façade and the columns are floodlit and the lamps light up.
//   WEDDING_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildWedding({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// The site is square to the map grid, the front looks north-west (-z) at vul. Nebesnoi Sotni. Every wall is laid out
// in a face frame (s to the right of a viewer outside, y up, o outward) and built as one polygon with its openings as
// holes, so every window and door has a real reveal; the white trim is relief extruded from 2D outlines.
import * as THREE from 'three';
import { MB, M4, triangulateRings } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex, decal } from './sculpt.js';
import { ringPts, rng, area2, inPoly } from './geo.js';

const OSM_ID = 207051954;
export const WEDDING_SKIP = new Set([OSM_ID]);

// heights over the forecourt paving: plinth, entrance floor, cornice top of the one-storey body, balcony / upper
// floor, the upper cornice, the apse top; the entablature under a cornice is ENT (lower) / ENT2 (upper) deep
const PL = 1.3, FL = 1.5, YE = 8.6, YB = 7.3, YC = 12.8, YA = 6.4, ENT = 1.7, ENT2 = 1.45, PAR = 0.7;
const WALLC = '#edd197', WHITE = '#f4f0e6', GRAN = '#5b2d29', ROOFC = '#8a9195', IRON = '#39434c', LITC = '#ffe1a8';
const GLASS = ['#46525b', '#3d4851', '#56626a', '#4b5359'];
const TAU = Math.PI * 2, PI = Math.PI, UP = [0, 1, 0], DN = [0, -1, 0];

// the plan (map x / z): the one-storey body with the two front pavilions, the recessed centre and the canted east
// corner (after the OSM ring, the pavilions evened to 6.2 m as in the photos); the rear apse; the upper block
const RING = [[168.0, 774.5], [171.0, 774.5], [171.0, 767.4], [177.2, 767.4], [177.2, 770.0], [187.0, 770.0], [187.0, 767.4],
  [193.2, 767.4], [193.2, 770.5], [197.4, 770.5], [200.2, 773.3], [200.2, 777.7], [201.3, 777.7], [201.3, 792.1], [168.0, 792.1]];
const APSE_C = [181.3, 794.0], APSE_R = 5.3;
const UPPER = [176.4, 770.0, 187.8, 781.0];

// ------------------------------------------------------------------------------------------------ textures
// sand render with horizontal rustication joints every 0.4 m (2 m per repeat)
const rustTex = (r) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#f7f3ea'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(90,70,30,0.05)' : 'rgba(255,255,255,0.06)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  for (let k = 0; k < 5; k++) {
    const y = (k * h) / 5;
    g.fillStyle = 'rgba(110,80,35,0.2)'; g.fillRect(0, y, w, 2);
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, y + 2, w, 2);
  }
});
// the wrought-iron double gate: blue-grey scrollwork on the dark vestibule, a round medallion high in each leaf
const gateTex = () => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#1b2026'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#7b8c9b'; g.lineCap = 'round';
  g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
  g.lineWidth = 6;
  for (const cx of [w * 0.25, w * 0.75]) {
    g.beginPath(); g.arc(cx, h * 0.3, w * 0.16, 0, TAU); g.stroke();
    g.beginPath(); g.arc(cx, h * 0.3, w * 0.07, 0, TAU); g.stroke();
    for (let k = 0; k < 6; k++) { // spirals round the medallion and down the leaf
      const y = h * (0.55 + 0.07 * k), s = k & 1 ? 1 : -1;
      g.beginPath(); g.arc(cx + s * w * 0.08, y, w * 0.06, 0, PI * 1.6); g.stroke();
      g.beginPath(); g.arc(cx - s * w * 0.08, y + h * 0.03, w * 0.045, PI, TAU * 0.95); g.stroke();
    }
    g.beginPath(); g.moveTo(cx - w * 0.2, h * 0.1); g.bezierCurveTo(cx - w * 0.05, h * 0.02, cx + w * 0.05, h * 0.02, cx + w * 0.2, h * 0.1); g.stroke();
  }
}, { repeat: false });
// balcony railing and the iron gate: bars, rails and S-scrolls on a transparent ground (alpha-tested)
const railTex = () => canvasTex(512, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = '#2e363e'; g.lineWidth = 7;
  for (const y of [5, h - 5, h * 0.18]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.lineWidth = 5;
  for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let x = 32; x < w; x += 64) {
    g.beginPath(); g.arc(x - 9, h * 0.45, 14, -PI / 2, PI * 0.9); g.stroke();
    g.beginPath(); g.arc(x + 9, h * 0.72, 14, PI / 2, PI * 1.9); g.stroke();
  }
}, { repeat: true });
const signTex = () => canvasTex(1024, 128, (g, w, h) => {
  g.fillStyle = '#efe9dc'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2f353c'; g.font = 'bold 84px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('ПАЛАЦ ОДРУЖЕННЯ', w / 2, h / 2 + 4, w - 40);
}, { repeat: false });
// forecourt: 0.5 m grey concrete pavers in a running bond, a band of red granite slabs every 4 m (4 m per repeat)
const paveTex = (r) => canvasTex(256, 256, (g, w) => {
  const p = w / 8;
  g.fillStyle = '#77726d'; g.fillRect(0, 0, w, w);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const k = 0.92 + r() * 0.14, v = (j === 0 ? [138, 92, 84] : [166, 162, 156]).map((q) => q * k), x = i * p + (j & 1 ? p / 2 : 0);
    g.fillStyle = `rgb(${v.map((q) => q | 0).join(',')})`;
    for (const dx of [0, -w]) g.fillRect(x + dx + 1, j * p + 1, p - 2, p - 2);
  }
});
const flagTex = () => canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#1f5fbf'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f6cf1c'; g.fillRect(0, h / 2, w, h / 2); }, { repeat: false });

// ------------------------------------------------------------------------------------------------ 2D outlines (s, y)
const arc = (c, yc, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, k) => { const a = a0 + ((a1 - a0) * k) / n; return [c + r * Math.cos(a), yc + r * Math.sin(a)]; });
const rectO = (s0, s1, y0, y1) => [[s0, y0], [s1, y0], [s1, y1], [s0, y1]];
const archO = (c, hw, y0, ys, n = 12) => [[c - hw, y0], [c + hw, y0], ...arc(c, ys, hw, 0, PI, n)];
const discO = (c, yc, r, n = 16) => arc(c, yc, r, 0, TAU, n).slice(0, n);
const bandO = (c, yc, r0, r1, a0, a1, n = 12) => [...arc(c, yc, r1, a0, a1, n), ...arc(c, yc, r0, a1, a0, n)];
// circle through the ends of a width-2hw span and a crown `rise` above it: { R, yc (below the crown line), a (half angle) }
const segOf = (hw, rise) => { const R = (hw * hw + rise * rise) / (2 * rise); return { R, a: Math.asin(hw / R) }; };
// rectangle y0..y1 capped by a segmental arc rising `rise` over y1
// a frame round three sides of an opening s0..s1 x y0..y1, t wide (open at the bottom)
const uFrame = (s0, s1, y0, y1, t, tt = t) => [[s0 - t, y0], [s0, y0], [s0, y1], [s1, y1], [s1, y0], [s1 + t, y0], [s1 + t, y1 + tt], [s0 - t, y1 + tt]];
const segO = (c, hw, y0, y1, rise, n = 10) => { const { R, a } = segOf(hw, rise); return [[c - hw, y0], [c + hw, y0], ...arc(c, y1 + rise - R, R, PI / 2 - a, PI / 2 + a, n)]; };

// ------------------------------------------------------------------------------------------------ face frame
function frame(a, b) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), rx = (b[0] - a[0]) / L, rz = (b[1] - a[1]) / L;
  return { ax: a[0], az: a[1], rx, rz, nx: -rz, nz: rx, w: L, N: [-rz, 0, rx], B: [rz, 0, -rx], R: [rx, 0, rz], L: [-rx, 0, -rz] };
}
// the face of edge a-b of ring, turned so that o points out of it
function faceOn(ring, a, b) {
  const f = frame(a, b), m = wp(f, f.w / 2, 0, 0.3);
  return inPoly(ring, m[0], m[2]) ? frame(b, a) : f;
}
const wp = (f, s, y, o = 0) => [f.ax + f.rx * s + f.nx * o, y, f.az + f.rz * s + f.nz * o];
const sAt = (f, x, z) => (x - f.ax) * f.rx + (z - f.az) * f.rz;

// flat polygon (with holes) in the face plane at depth o, uv in metres (s, y); back: facing into the building
function sheet(D, f, outer, holes = [], o = 0, back = false) {
  const T = triangulateRings(outer, holes);
  if (!T) return;
  const n = back ? f.B : f.N, P = T.pts, I = T.idx;
  const ids = P.map(([s, y]) => { const p = wp(f, s, y, o); return D.vert(p[0], p[1], p[2], n[0], n[1], n[2], s, y); });
  for (let t = 0; t < I.length; t += 3) {
    const a = P[I[t]], b = P[I[t + 1]], c = P[I[t + 2]];
    const ccw = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0; // counter-clockwise in (s, y) faces out
    if (ccw !== back) D.tri(ids[I[t]], ids[I[t + 1]], ids[I[t + 2]]); else D.tri(ids[I[t]], ids[I[t + 2]], ids[I[t + 1]]);
  }
}
// the side walls of an outline between depths o0 and o1; inward: normals into the outline (an opening's reveal)
function sides(D, f, P, o0, o1, inward) {
  const k = (area2(P) > 0) === inward ? 1 : -1; // left of a counter-clockwise edge is inside
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], ds = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(ds, dy);
    if (L < 1e-4) continue;
    const ns = (-dy / L) * k, ny = (ds / L) * k;
    D.face([wp(f, a[0], a[1], o0), wp(f, b[0], b[1], o0), wp(f, b[0], b[1], o1), wp(f, a[0], a[1], o1)], [f.rx * ns, ny, f.rz * ns]);
  }
}
// an outline standing proud of the wall from o0 to o1 (front and edges; back too when it is free-standing)
function relief(D, f, P, o0, o1, holes = [], back = false) {
  sheet(D, f, P, holes, o1);
  sides(D, f, P, o0, o1, false);
  for (const h of holes) sides(D, f, h, o0, o1, true);
  if (back) sheet(D, f, P, holes, o0, true);
}
// box in the face frame; m bits: 1 front, 2 back, 4 left (s0), 8 right (s1), 16 top, 32 bottom
function fb(D, f, s0, s1, y0, y1, o0, o1, m = 63) {
  const c = (s, y, o) => wp(f, s, y, o);
  if (m & 1) D.face([c(s0, y0, o1), c(s1, y0, o1), c(s1, y1, o1), c(s0, y1, o1)], f.N);
  if (m & 2) D.face([c(s0, y0, o0), c(s1, y0, o0), c(s1, y1, o0), c(s0, y1, o0)], f.B);
  if (m & 4) D.face([c(s0, y0, o0), c(s0, y0, o1), c(s0, y1, o1), c(s0, y1, o0)], f.L);
  if (m & 8) D.face([c(s1, y0, o0), c(s1, y0, o1), c(s1, y1, o1), c(s1, y1, o0)], f.R);
  if (m & 16) D.face([c(s0, y1, o0), c(s1, y1, o0), c(s1, y1, o1), c(s0, y1, o1)], UP);
  if (m & 32) D.face([c(s0, y0, o0), c(s1, y0, o0), c(s1, y0, o1), c(s0, y0, o1)], DN);
}
// polygon facing up (the winding follows its computed normal)
function upFace(D, pts) {
  const [a, b, c] = pts, u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n) || 1;
  n = n.map((q) => (q / l) * (n[1] < 0 ? -1 : 1));
  D.face(pts, n);
}
// hipped roof over an x / z rectangle, the ridge along the longer side
function hipRoof(D, x0, z0, x1, z1, ye, rise) {
  const alongX = x1 - x0 >= z1 - z0, h = Math.min(x1 - x0, z1 - z0) / 2, yr = ye + rise;
  if (alongX) {
    const zm = (z0 + z1) / 2, a = [x0 + h, yr, zm], b = [x1 - h, yr, zm];
    upFace(D, [[x0, ye, z0], [x1, ye, z0], b, a]); upFace(D, [[x1, ye, z1], [x0, ye, z1], a, b]);
    upFace(D, [[x0, ye, z1], [x0, ye, z0], a]); upFace(D, [[x1, ye, z0], [x1, ye, z1], b]);
  } else {
    const xm = (x0 + x1) / 2, a = [xm, yr, z0 + h], b = [xm, yr, z1 - h];
    upFace(D, [[x0, ye, z0], [x0, ye, z1], b, a]); upFace(D, [[x1, ye, z1], [x1, ye, z0], a, b]);
    upFace(D, [[x1, ye, z0], [x0, ye, z0], a]); upFace(D, [[x0, ye, z1], [x1, ye, z1], b]);
  }
}
// white Corinthian column standing on y0, the abacus top at y1: moulded base, a ring band low on the shaft, entasis,
// a flared two-row capital
function column(D, x, z, y0, y1, r) {
  const yc = y1 - 0.62;
  D.lathe([[r * 1.3, y0], [r * 1.3, y0 + 0.07], [r * 1.12, y0 + 0.1], [r * 1.18, y0 + 0.15], [r * 1.02, y0 + 0.2], [r, y0 + 0.3],
    [r, y0 + 1.0], [r * 1.14, y0 + 1.06], [r * 1.14, y0 + 1.22], [r, y0 + 1.28], [r * 0.88, yc - 0.06], [r * 0.99, yc - 0.03], [r * 0.9, yc],
    [r * 1.08, yc + 0.18], [r * 1.0, yc + 0.24], [r * 1.28, yc + 0.42], [r * 1.2, yc + 0.46], [r * 1.48, y1 - 0.1]], 10, x, z);
  D.box(x - r * 1.55, y1 - 0.12, z - r * 1.55, x + r * 1.55, y1, z + r * 1.55);
}

// ------------------------------------------------------------------------------------------------ build
export function buildWedding({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((q) => q.id === OSM_ID);
  if (!b) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 99991), n0 = S.count;
  const hAt = (x, z) => { const v = heightAt(x, z); return Number.isFinite(v) ? v : 0; };
  const y0 = hAt(182, 765) + 0.19;                                        // the forecourt pavers
  const gB = Math.min(hAt(168, 792), hAt(201, 792), hAt(181, 799)) - 0.3; // plinth foot, below the lowest ground
  const Y = (v) => y0 + v;
  const B = { wall: new MB(), deco: new MB(), col: new MB(), det: new MB(), roof: new MB(), glass: new MB(), lit: new MB(),
    gate: new MB(), rail: new MB(), sign: new MB(), flag: new MB(), bronze: new MB() };
  const W = B.wall, D = B.deco, K = B.det;
  W.setColor(WALLC); D.setColor(WHITE); B.col.setColor(WHITE);
  const prismOf = (P, ya, yb, kind = 'wall', flags = 0) => S.prism((area2(P) < 0 ? P.slice().reverse() : P).flat(), ya, yb, 0, 0, kind, flags);
  const fprism = (f, s0, s1, o0, o1, ya, yb, kind = 'wall', flags = 0) => prismOf([[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = wp(f, s, 0, o); return [p[0], p[2]]; }), ya, yb, kind, flags);
  let nWin = 0;

  // ---- windows
  const pane = (f, P, o) => { const lit = r() < 0.6, G = lit ? B.lit : B.glass; G.setColor(lit ? LITC : GLASS[Math.floor(r() * GLASS.length)]); sheet(G, f, P, [], o); nWin++; };
  // arched sash: white frame, transom at the springing, mullion, fanlight spokes
  const sashArch = (f, c, hw, ya, ys, o) => {
    pane(f, archO(c, hw, ya, ys), o - 0.02);
    const t = Math.min(0.08, hw * 0.12), d = o + 0.05;
    relief(D, f, bandO(c, ys, hw - t, hw, 0, PI, 10), o, d);
    fb(D, f, c - hw, c - hw + t, ya, ys, o, d, 1 | 8); fb(D, f, c + hw - t, c + hw, ya, ys, o, d, 1 | 4);
    fb(D, f, c - hw, c + hw, ya, ya + t, o, d, 1 | 16);
    fb(D, f, c - hw, c + hw, ys - 0.035, ys + 0.035, o, d, 1 | 16 | 32);
    fb(D, f, c - 0.03, c + 0.03, ya, ys + hw - t, o, d, 1 | 4 | 8);
    if (ys - ya > 1.5) fb(D, f, c - hw, c + hw, ya + (ys - ya) * 0.45, ya + (ys - ya) * 0.45 + 0.05, o, d, 1 | 16 | 32);
    for (const a of [PI / 4, (3 * PI) / 4]) D.tube(wp(f, c, ys, o + 0.025), wp(f, c + (hw - t) * Math.cos(a), ys + (hw - t) * Math.sin(a), o + 0.025), 0.022, 4);
  };
  const sashRect = (f, s0, s1, ya, yb, o) => {
    pane(f, rectO(s0, s1, ya, yb), o - 0.02);
    const t = 0.07, d = o + 0.05;
    relief(D, f, rectO(s0, s1, ya, yb), o, d, [rectO(s0 + t, s1 - t, ya + t, yb - t)]);
    const c = (s0 + s1) / 2, ym = ya + (yb - ya) * 0.7;
    fb(D, f, c - 0.03, c + 0.03, ya + t, ym, o, d, 1 | 4 | 8);
    fb(D, f, s0 + t, s1 - t, ym, ym + 0.06, o, d, 1 | 16 | 32);
  };
  // the white trim of an arched window: archivolt with a keystone, piers down to a sill, an apron under it
  const archTrim = (f, c, hw, ya, ys, { t = 0.2, apron = true } = {}) => {
    relief(D, f, bandO(c, ys, hw, hw + t, 0, PI, 12), 0, 0.08);
    fb(D, f, c - hw - t, c - hw, ya, ys, 0, 0.08, 1 | 4 | 8); fb(D, f, c + hw, c + hw + t, ya, ys, 0, 0.08, 1 | 4 | 8);
    relief(D, f, [[c - 0.13, ys + hw - 0.05], [c + 0.13, ys + hw - 0.05], [c + 0.18, ys + hw + t + 0.12], [c - 0.18, ys + hw + t + 0.12]], 0, 0.14);
    fb(D, f, c - hw - t - 0.08, c + hw + t + 0.08, ya - 0.1, ya, 0, 0.16, 1 | 4 | 8 | 16 | 32);
    if (apron) { fb(D, f, c - hw, c + hw, ya - 0.7, ya - 0.1, 0, 0.05, 1 | 4 | 8 | 32); fb(D, f, c - hw + 0.12, c + hw - 0.12, ya - 0.58, ya - 0.22, 0.05, 0.08, 1 | 4 | 8 | 16 | 32); }
  };
  // a pedimented rectangular window of the side façades: architrave, frieze, a triangular or segmental hood, sill
  const rectTrim = (f, s0, s1, ya, yb, tri) => {
    relief(D, f, uFrame(s0, s1, ya, yb, 0.16), 0, 0.07);
    fb(D, f, s0 - 0.28, s1 + 0.28, yb + 0.42, yb + 0.54, 0, 0.22, 1 | 4 | 8 | 16 | 32);
    const c = (s0 + s1) / 2, hw = (s1 - s0) / 2 + 0.28;
    if (tri) relief(D, f, [[c - hw, yb + 0.54], [c + hw, yb + 0.54], [c, yb + 1.05]], 0, 0.14);
    else relief(D, f, segO(c, hw, yb + 0.54, yb + 0.6, 0.3), 0, 0.14);
    fb(D, f, s0 - 0.22, s1 + 0.22, ya - 0.1, ya, 0, 0.14, 1 | 4 | 8 | 16 | 32);
  };

  // ---- the parts every façade shares
  const faces = [];
  // the wall with its openings; holes: [{ P, dep }]
  const wall = (f, top, holes, from = PL) => {
    sheet(W, f, rectO(0, f.w, Y(from), top), holes.map((h) => h.P));
    for (const h of holes) sides(D, f, h.P, 0, -h.dep, true);
    if (from <= PL) { K.setColor(GRAN); fb(K, f, -0.07, f.w + 0.07, gB, Y(PL), 0, 0.07, 1 | 4 | 8 | 16); }
    faces.push(f);
  };
  // architrave, bracketed frieze (dentils and medallions when rich), cornice slab; yT the cornice top
  const cornice = (f, s0, s1, yT, depth, rich) => {
    const yA = yT - depth, step = rich ? 0.62 : 0.95, n = Math.max(1, Math.round((s1 - s0) / step)), st = (s1 - s0) / n;
    fb(D, f, s0, s1, yA, yA + 0.22, 0, 0.07, 1 | 16 | 32);
    fb(D, f, s0, s1, yT - 0.44, yT - 0.34, 0, 0.14, 1 | 32);
    for (let i = 0; i < n; i++) {
      const s = s0 + st * (i + 0.5);
      fb(D, f, s - 0.07, s + 0.07, yA + 0.42, yT - 0.44, 0, 0.1, 1 | 4 | 8 | 32);
      fb(D, f, s - 0.1, s + 0.1, yT - 0.66, yT - 0.34, 0.1, 0.3, 1 | 4 | 8 | 32);
      if (rich && i < n - 1) relief(D, f, discO(s + st / 2, yA + 0.72, 0.13, 8), 0, 0.05);
    }
    if (rich) for (let s = s0 + 0.1; s < s1 - 0.05; s += 0.2) fb(D, f, s - 0.05, s + 0.05, yT - 0.46, yT - 0.34, 0.14, 0.24, 1 | 4 | 8 | 32);
    fb(D, f, s0 - 0.3, s1 + 0.3, yT - 0.34, yT - 0.08, 0, 0.45, 1 | 4 | 8 | 16 | 32);
    fb(D, f, s0 - 0.33, s1 + 0.33, yT - 0.08, yT, 0, 0.52, 1 | 4 | 8 | 16 | 32);
  };
  const parapet = (f, s0, s1, yT) => {
    fb(W, f, s0, s1, yT, yT + PAR, -0.3, 0, 1 | 2 | 4 | 8);
    fb(D, f, s0 - 0.04, s1 + 0.04, yT + PAR, yT + PAR + 0.1, -0.34, 0.06, 1 | 2 | 4 | 8 | 16);
    const a = wp(f, s0, 0, -0.15), c = wp(f, s1, 0, -0.15);
    Z.edge(a[0], a[2], c[0], c[2], yT + PAR + 0.1, f.nx, f.nz);
  };
  // pedestal + column pair (or one) at s = pc; the entablature breaks forward over it, a segmental pediment on top
  const colGroup = (f, pc, { pair = true, ya = PL, yp = 3.0, yT = YE, depth = ENT, ped = true } = {}) => {
    const sp = pair ? 0.36 : 0, hw = sp + 0.34, o = 0.42, yA = Y(yT - depth);
    fb(D, f, pc - hw, pc + hw, Y(ya), Y(yp), 0, 0.76, 1 | 4 | 8 | 16);
    fb(D, f, pc - hw - 0.05, pc + hw + 0.05, Y(yp - 0.14), Y(yp), 0, 0.82, 1 | 4 | 8 | 16 | 32);
    for (const s of pair ? [pc - sp, pc + sp] : [pc]) {
      if (yp - ya > 1) fb(D, f, s - 0.24, s + 0.24, Y(ya + 0.3), Y(yp - 0.35), 0.76, 0.79, 1 | 4 | 8 | 16 | 32); // the panel on the pedestal
      const p = wp(f, s, 0, o);
      column(B.col, p[0], p[2], Y(yp), yA, 0.21);
    }
    fb(D, f, pc - hw, pc + hw, yA, Y(yT) - 0.34, 0, 0.74, 1 | 4 | 8 | 32);
    for (const s of pair ? [pc - sp, pc + sp] : [pc]) fb(D, f, s - 0.1, s + 0.1, Y(yT) - 0.66, Y(yT) - 0.34, 0.74, 0.92, 1 | 4 | 8 | 32);
    fb(D, f, pc - hw - 0.2, pc + hw + 0.2, Y(yT) - 0.34, Y(yT), 0, 1.0, 1 | 4 | 8 | 16 | 32);
    fprism(f, pc - hw, pc + hw, 0, 0.95, ya <= PL ? gB : Y(ya), Y(yT));
    if (!ped) return;
    const yP = Y(yT), rise = 0.42, { R, a } = segOf(hw + 0.1, rise);
    relief(W, f, segO(pc, hw + 0.1, yP, yP + 0.2, rise), 0.3, 0.8);
    relief(D, f, bandO(pc, yP + 0.2 + rise - R, R, R + 0.13, PI / 2 - a, PI / 2 + a, 10), 0.3, 0.9);
    fb(D, f, pc - hw - 0.14, pc + hw + 0.14, yP, yP + 0.2, 0.3, 0.9, 1 | 4 | 8 | 16);
    relief(D, f, discO(pc, yP + 0.42, 0.12, 8), 0.8, 0.86);
  };
  // the raised parapet panel with an oculus (pavilions) or a crest gable (the canted corner)
  const oculusPanel = (f, c, yT, crest) => {
    const P = crest
      ? [[c - 1.3, yT], [c + 1.3, yT], [c + 1.3, yT + 0.85], [c + 0.85, yT + 0.95], [c + 0.55, yT + 1.5], [c, yT + 1.7], [c - 0.55, yT + 1.5], [c - 0.85, yT + 0.95], [c - 1.3, yT + 0.85]]
      : segO(c, 1.05, yT, yT + 0.95, 0.35);
    const yo = yT + (crest ? 1.0 : 0.78), hole = discO(c, yo, 0.24, 14);
    relief(W, f, P, -0.3, 0.09, [hole], true);
    relief(D, f, discO(c, yo, 0.36, 14), 0.09, 0.16, [discO(c, yo, 0.25, 14)]);
    K.setColor('#2b3035'); sheet(K, f, hole, [], -0.1);
    K.setColor(WHITE);
    const top = P.slice(2);
    for (let i = 0; i + 1 < top.length; i++) { // white coping along the crest
      const [s0, ya] = top[i], [s1, yb] = top[i + 1];
      D.face([wp(f, s0, ya + 0.08, -0.34), wp(f, s1, yb + 0.08, -0.34), wp(f, s1, yb + 0.08, 0.1), wp(f, s0, ya + 0.08, 0.1)], UP);
      D.face([wp(f, s0, ya, 0.1), wp(f, s1, yb, 0.1), wp(f, s1, yb + 0.08, 0.1), wp(f, s0, ya + 0.08, 0.1)], f.N);
    }
  };
  const quoins = (f, s0, s1, ya, yb) => { for (let y = ya; y + 0.3 < yb; y += 0.6) fb(D, f, s0, s1, y, y + 0.46, 0, 0.05, 1 | 4 | 8 | 16 | 32); };

  // ---- the front pavilions: two column pairs, the big arched window, bracketed frieze, pediments and an oculus
  const pavilion = (f) => {
    const c = f.w / 2, hw = 0.9, ya = Y(2.3), ys = Y(4.3), P = archO(c, hw, ya, ys);
    wall(f, Y(YE), [{ P, dep: 0.4 }]);
    sashArch(f, c, hw, ya, ys, -0.36);
    archTrim(f, c, hw, ya, ys, { t: 0.26 });
    cornice(f, 0, f.w, Y(YE), ENT, true);
    for (const pc of [0.8, f.w - 0.8]) colGroup(f, pc);
    parapet(f, 0, f.w, Y(YE));
    oculusPanel(f, c, Y(YE), false);
  };
  // a plain stretch of the front: rustication, frieze, parapet
  const plainFront = (f, window) => {
    const holes = [];
    if (window) holes.push({ P: archO(f.w / 2, 0.7, Y(2.4), Y(4.2)), dep: 0.4 });
    wall(f, Y(YE), holes);
    if (window) { sashArch(f, f.w / 2, 0.7, Y(2.4), Y(4.2), -0.36); archTrim(f, f.w / 2, 0.7, Y(2.4), Y(4.2)); }
    quoins(f, 0, 0.35, Y(PL), Y(YE - ENT)); quoins(f, f.w - 0.35, f.w, Y(PL), Y(YE - ENT));
    cornice(f, 0, f.w, Y(YE), ENT, true);
    parapet(f, 0, f.w, Y(YE));
  };
  // the canted east corner: an arched window, corner columns, crest gable
  const canted = (f, colsAt) => {
    const c = f.w / 2 + (colsAt.length === 1 ? 0.3 : 0), hw = 0.7, ya = Y(2.4), ys = Y(4.3);
    wall(f, Y(YE), [{ P: archO(c, hw, ya, ys), dep: 0.4 }]);
    sashArch(f, c, hw, ya, ys, -0.36);
    archTrim(f, c, hw, ya, ys);
    cornice(f, 0, f.w, Y(YE), ENT, true);
    for (const pc of colsAt) colGroup(f, pc, { pair: false, ped: false });
    parapet(f, 0, f.w, Y(YE));
    oculusPanel(f, c, Y(YE), true);
  };
  // side and rear façades: pedimented windows every ~3.3 m, quoins, frieze, the hipped roof above
  const side = (f, { top = YE, door = -1, from = PL, rich = false } = {}) => {
    const n = Math.max(door >= 0 ? 1 : 0, Math.floor((f.w - 0.8) / 3.3)), st = f.w / Math.max(1, n), holes = [], wins = [];
    for (let i = 0; i < n; i++) {
      const c = st * (i + 0.5);
      if (i === door) { holes.push({ P: rectO(c - 0.8, c + 0.8, Y(PL + 0.12), Y(PL + 2.6)), dep: 0.3, door: c }); continue; }
      const ya = Y(2.4), yb = Y(Math.min(5.1, top - ENT - 0.9));
      holes.push({ P: rectO(c - 0.65, c + 0.65, ya, yb), dep: 0.35 }); wins.push([c, ya, yb, i & 1]);
    }
    wall(f, Y(top), holes, from);
    for (const [c, ya, yb, tri] of wins) { sashRect(f, c - 0.65, c + 0.65, ya, yb, -0.3); rectTrim(f, c - 0.65, c + 0.65, ya, yb, tri); }
    for (const h of holes) if (h.door !== undefined) { // service door: panelled leaves, a hood, two steps
      const c = h.door;
      K.setColor('#5a3b2a'); fb(K, f, c - 0.8, c + 0.8, Y(PL + 0.12), Y(PL + 2.6), -0.3, -0.26, 1);
      K.setColor('#44301f'); fb(K, f, c - 0.02, c + 0.02, Y(PL + 0.12), Y(PL + 2.6), -0.26, -0.24, 1);
      relief(D, f, uFrame(c - 0.8, c + 0.8, Y(PL + 0.12), Y(PL + 2.6), 0.18), 0, 0.07);
      fb(D, f, c - 1.1, c + 1.1, Y(PL + 2.9), Y(PL + 3.02), 0, 0.3, 1 | 4 | 8 | 16 | 32);
      K.setColor('#6d6a66'); fb(K, f, c - 1.1, c + 1.1, gB, Y(PL - 0.02), 0, 1.0, 1 | 4 | 8 | 16);
      fprism(f, c - 1.1, c + 1.1, 0, 1.0, gB, Y(PL - 0.02), 'step');
    }
    if (from <= PL) { quoins(f, 0, 0.4, Y(PL), Y(top - ENT)); quoins(f, f.w - 0.4, f.w, Y(PL), Y(top - ENT)); }
    cornice(f, 0, f.w, Y(top), top === YA ? 0.9 : ENT, rich);
  };

  // ---- the one-storey body, face by face round the ring
  const edge = (i) => faceOn(RING, RING[i], RING[(i + 1) % RING.length]);
  side(edge(0), { door: 0 });                                                  // the set-back west bay, a service door
  plainFront(edge(1), true);                                                   // west pavilion's side, one arched window
  pavilion(edge(2));                                                           // west pavilion
  plainFront(edge(3), false);                                                  // recess cheeks
  const fC = edge(4);                                                          // the recessed centre
  plainFront(edge(5), false);
  pavilion(edge(6));                                                           // east pavilion
  plainFront(edge(7), false);                                                  // its side, in the corner of the canted block
  canted(edge(8), [0.35]);                                                     // canted block front
  canted(edge(9), [0.35, edge(9).w - 0.35]);                                   // the chamfer
  canted(edge(10), []);                                                        // its east side
  plainFront(edge(11), false);                                                 // the notch
  side(edge(12));                                                              // east side
  const rear = edge(13);                                                       // rear, both sides of the apse
  side(edge(14), { door: 2 });                                                 // west side
  { // the rear wall: two windows either side of the apse, the wall behind the apse left blank
    const f = rear, sa = sAt(f, APSE_C[0] - APSE_R, 792.1), sb = sAt(f, APSE_C[0] + APSE_R, 792.1), s0 = Math.min(sa, sb), s1 = Math.max(sa, sb);
    const wins = [s0 / 3, (2 * s0) / 3, s1 + (f.w - s1) / 4, s1 + (f.w - s1) / 2, s1 + (3 * (f.w - s1)) / 4].map((c) => [c, Y(2.4), Y(5.1)]);
    wall(f, Y(YE), wins.map(([c, ya, yb]) => ({ P: rectO(c - 0.6, c + 0.6, ya, yb), dep: 0.35 })));
    wins.forEach(([c, ya, yb], i) => { sashRect(f, c - 0.6, c + 0.6, ya, yb, -0.3); rectTrim(f, c - 0.6, c + 0.6, ya, yb, i & 1); });
    quoins(f, 0, 0.4, Y(PL), Y(YE - ENT)); quoins(f, f.w - 0.4, f.w, Y(PL), Y(YE - ENT));
    cornice(f, 0, f.w, Y(YE), ENT, false);
  }

  // ---- the recessed centre: gate under the name band, two arched windows, pilasters, the belt, the balcony
  {
    const f = fC, w = f.w, c = w / 2, dA = 3.1, dB = w - 3.1, yD = Y(FL + 3.4);
    const wins = [1.35, w - 1.35], ya = Y(2.3), ys = Y(4.1), hw = 0.62;
    wall(f, Y(YB), [{ P: rectO(dA, dB, Y(FL), yD), dep: 0.45 }, ...wins.map((s) => ({ P: archO(s, hw, ya, ys), dep: 0.4 }))], FL);
    for (const s of wins) { sashArch(f, s, hw, ya, ys, -0.36); archTrim(f, s, hw, ya, ys, { t: 0.17 }); }
    B.gate.setColor('#ffffff');
    const g = [wp(f, dA, Y(FL), -0.42), wp(f, dB, Y(FL), -0.42), wp(f, dB, yD, -0.42), wp(f, dA, yD, -0.42)];
    const gv = g.map((p, k) => B.gate.vert(p[0], p[1], p[2], f.nx, 0, f.nz, k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0));
    B.gate.quad(gv[0], gv[1], gv[2], gv[3]);
    // the white door frame with the name band over the gate
    relief(D, f, uFrame(dA, dB, Y(FL), yD, 0.28, 0.78), 0, 0.1);
    const sg = [wp(f, dA + 0.05, yD + 0.12, 0.11), wp(f, dB - 0.05, yD + 0.12, 0.11), wp(f, dB - 0.05, yD + 0.62, 0.11), wp(f, dA + 0.05, yD + 0.62, 0.11)];
    const sv = sg.map((p, k) => B.sign.vert(p[0], p[1], p[2], f.nx, 0, f.nz, k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0));
    B.sign.quad(sv[0], sv[1], sv[2], sv[3]);
    fb(D, f, dA - 0.4, dB + 0.4, yD + 0.78, yD + 0.9, 0, 0.2, 1 | 4 | 8 | 16 | 32);
    for (const s of [0.18, 2.55, w - 2.55, w - 0.18]) { // rusticated pilasters
      fb(D, f, s - 0.18, s + 0.18, Y(FL), Y(YB - 0.4), 0, 0.08, 1 | 4 | 8);
      for (let y = Y(FL + 0.3); y < Y(YB - 0.6); y += 0.55) fb(D, f, s - 0.22, s + 0.22, y, y + 0.1, 0, 0.11, 1 | 4 | 8 | 16 | 32);
    }
    fb(D, f, -0.1, w + 0.1, Y(YB - 0.4), Y(YB), 0, 0.12, 1 | 4 | 8 | 16 | 32);                // the belt
    for (let s = 0.2; s < w; s += 0.3) fb(D, f, s - 0.06, s + 0.06, Y(YB - 0.52), Y(YB - 0.4), 0, 0.09, 1 | 4 | 8 | 32);
    // the balcony: slab on consoles, iron railing, the blue-yellow banner
    const bA = c - 2.45, bB = c + 2.45, yS = Y(YB), dp = 1.05;
    fb(D, f, bA, bB, yS - 0.2, yS, 0, dp, 1 | 4 | 8 | 16 | 32);
    for (const s of [bA + 0.25, c - 0.8, c + 0.8, bB - 0.25]) relief(D, f, [[s - 0.09, yS - 0.2], [s + 0.09, yS - 0.2], [s + 0.05, yS - 0.75], [s - 0.05, yS - 0.75]], 0, 0.3);
    B.rail.setColor('#ffffff');
    const railQ = (s0, o0, s1, o1) => {
      const L = Math.hypot(s1 - s0, o1 - o0), P = [wp(f, s0, yS, o0), wp(f, s1, yS, o1), wp(f, s1, yS + 1.0, o1), wp(f, s0, yS + 1.0, o0)];
      const v = P.map((p, k) => B.rail.vert(p[0], p[1], p[2], f.nx, 0, f.nz, (k === 1 || k === 2 ? L : 0) / 1.25, k >= 2 ? 1 : 0));
      B.rail.quad(v[0], v[1], v[2], v[3]);
    };
    railQ(bA + 0.05, dp - 0.06, bB - 0.05, dp - 0.06); railQ(bA + 0.05, 0, bA + 0.05, dp - 0.06); railQ(bB - 0.05, dp - 0.06, bB - 0.05, 0);
    K.setColor(IRON); fb(K, f, bA, bB, yS + 1.0, yS + 1.05, dp - 0.1, dp - 0.02, 1 | 16 | 32);
    B.flag.setColor('#ffffff');
    const fl = [wp(f, c - 1.1, yS + 0.18, dp - 0.02), wp(f, c + 1.1, yS + 0.18, dp - 0.02), wp(f, c + 1.1, yS + 0.95, dp - 0.02), wp(f, c - 1.1, yS + 0.95, dp - 0.02)];
    const fv = fl.map((p, k) => B.flag.vert(p[0], p[1], p[2], f.nx, 0, f.nz, k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0));
    B.flag.quad(fv[0], fv[1], fv[2], fv[3]);
    fprism(f, bA, bB, 0, dp, yS - 0.2, yS, 'awning', 1);
  }

  // ---- the upper storey over the centre: four columns, twin arched windows, the triple window, the attic gable
  const [ux0, uz0, ux1, uz1] = UPPER, uRing = [[ux0, uz0], [ux1, uz0], [ux1, uz1], [ux0, uz1]];
  {
    const f = faceOn(uRing, [ux1, uz0], [ux0, uz0]), w = f.w, c = w / 2, yT = Y(YC), yU = yT - ENT2;
    const gR = 2.75, gC = yT, bay0 = c - 1.8, bay1 = c + 1.8;
    const outline = [[0, Y(YB)], [w, Y(YB)], [w, yT], ...arc(c, gC, gR, 0, PI, 16), [0, yT]];
    const twins = [2.35, w - 2.35], tya = Y(8.3), tys = Y(9.9);
    const holes = [{ P: rectO(c - 0.55, c + 0.55, Y(YB) + 0.02, Y(10.3)), dep: 0.35 }, { P: rectO(c - 1.45, c - 0.75, Y(8.2), Y(10.3)), dep: 0.35 },
      { P: rectO(c + 0.75, c + 1.45, Y(8.2), Y(10.3)), dep: 0.35 }, { P: archO(c, 0.95, Y(11.8), Y(13.6)), dep: 0.4 }];
    for (const s of twins) for (const d of [-0.38, 0.38]) holes.push({ P: archO(s + d, 0.28, tya, tys, 8), dep: 0.35 });
    sheet(W, f, outline, holes.map((h) => h.P));
    for (const h of holes) sides(D, f, h.P, 0, -h.dep, true);
    // gable back and its curved top
    sheet(W, f, [[c - gR, yT], [c + gR, yT], ...arc(c, gC, gR, 0, PI, 16).slice(1, -1)], [], -0.5, true);
    const top = arc(c, gC, gR, 0, PI, 16);
    for (let i = 0; i < 16; i++) { const [s0, ya] = top[i], [s1, yb] = top[i + 1], a = (PI * (i + 0.5)) / 16;
      W.face([wp(f, s0, ya, -0.5), wp(f, s1, yb, -0.5), wp(f, s1, yb, 0), wp(f, s0, ya, 0)], [f.rx * Math.cos(a), Math.sin(a), f.rz * Math.cos(a)]); }
    // the triple window (French door onto the balcony), its frame, the pediment with a mascaron
    sashRect(f, c - 0.55, c + 0.55, Y(YB) + 0.02, Y(10.3), -0.3);
    for (const [a1, b1] of [[c - 1.45, c - 0.75], [c + 0.75, c + 1.45]]) sashRect(f, a1, b1, Y(8.2), Y(10.3), -0.3);
    for (const s of [c - 1.6, c - 0.65, c + 0.65, c + 1.6]) fb(D, f, s - 0.1, s + 0.1, Y(YB), Y(10.3), 0, 0.1, 1 | 4 | 8);
    fb(D, f, c - 1.75, c + 1.75, Y(10.3), Y(10.55), 0, 0.16, 1 | 4 | 8 | 16 | 32);
    const pd = segOf(1.5, 0.35);
    relief(D, f, bandO(c, Y(10.55) + 0.35 - pd.R, pd.R, pd.R + 0.14, PI / 2 - pd.a, PI / 2 + pd.a, 10), 0, 0.18);
    { const p = wp(f, c, Y(10.95), 0.1); D.ellipsoid(p, [0.22, 0.27, 0.22], 8, 6); }
    // twin arched windows under a shared archivolt, with a colonette between the lights
    for (const s of twins) {
      for (const d of [-0.38, 0.38]) sashArch(f, s + d, 0.28, tya, tys, -0.3);
      relief(D, f, bandO(s, tys, 0.68, 0.85, 0, PI, 12), 0, 0.08);
      fb(D, f, s - 0.85, s - 0.66, tya, tys, 0, 0.08, 1 | 4 | 8); fb(D, f, s + 0.66, s + 0.85, tya, tys, 0, 0.08, 1 | 4 | 8);
      fb(D, f, s - 0.1, s + 0.1, tya, tys, 0, 0.1, 1 | 4 | 8);
      fb(D, f, s - 0.92, s + 0.92, tya - 0.12, tya, 0, 0.16, 1 | 4 | 8 | 16 | 32);
      fb(D, f, s - 0.85, s + 0.85, tya - 0.6, tya - 0.12, 0, 0.05, 1 | 4 | 8 | 32);
    }
    // columns on the balcony level, the entablature and cornice either side of the gable bay
    for (const pc of [1.0, 3.6, w - 3.6, w - 1.0]) colGroup(f, pc, { pair: false, ya: YB, yp: YB + 0.6, yT: YC, depth: ENT2, ped: false });
    cornice(f, 0, bay0, yT, ENT2, true); cornice(f, bay1, w, yT, ENT2, true);
    // the gable: the arched attic window, two dentilled archivolts, the crown moulding
    sashArch(f, c, 0.95, Y(11.8), Y(13.6), -0.36);
    relief(D, f, bandO(c, Y(13.6), 0.95, 1.2, 0, PI, 14), 0, 0.1);
    fb(D, f, c - 1.3, c + 1.3, Y(11.68), Y(11.8), 0, 0.16, 1 | 4 | 8 | 16 | 32);
    relief(D, f, bandO(c, gC, 2.25, 2.4, 0, PI, 18), 0, 0.1);
    relief(D, f, bandO(c, gC, gR - 0.02, gR + 0.14, 0, PI, 18), -0.5, 0.2);
    for (let k = 1; k < 24; k++) { const a = (PI * k) / 24, ca = Math.cos(a), sa = Math.sin(a), q = (rr, t) => [c + rr * ca - t * sa, gC + rr * sa + t * ca];
      relief(D, f, [q(2.45, -0.07), q(2.45, 0.07), q(2.68, 0.07), q(2.68, -0.07)], 0, 0.14); }
    for (let k = 0; k < 9; k++) { const a = (PI * (k + 0.5)) / 9; relief(D, f, discO(c + 1.8 * Math.cos(a), gC + 1.8 * Math.sin(a), 0.1, 6), 0, 0.06); }
    // pinnacles on the corners, ring balustrades between them and the gable
    for (const s of [0.55, w - 0.55]) {
      fb(D, f, s - 0.4, s + 0.4, yT, yT + 1.1, -0.4, 0.4, 1 | 2 | 4 | 8);
      fb(D, f, s - 0.48, s + 0.48, yT + 1.1, yT + 1.22, -0.48, 0.48, 1 | 2 | 4 | 8 | 16 | 32);
      const p = wp(f, s, 0, 0);
      D.with(M4(p[0], yT + 1.22, p[2], Math.atan2(f.rx, f.rz) + PI / 4), (q) => q.cyl(0, 0, 0, 0.5, 0.02, 1.9, 4, false));
      D.ellipsoid([p[0], yT + 3.15, p[2]], [0.09, 0.12, 0.09], 6, 4);
      S.box(p[0] - 0.45, yT, p[2] - 0.45, p[0] + 0.45, yT + 2.5, p[2] + 0.45, 'wall');
    }
    for (const [a1, b1] of [[1.0, c - gR - 0.05], [c + gR + 0.05, w - 1.0]]) {
      fb(D, f, a1, b1, yT, yT + 0.12, -0.12, 0.12, 1 | 2 | 16);
      fb(D, f, a1, b1, yT + 0.62, yT + 0.72, -0.14, 0.14, 1 | 2 | 16 | 32);
      const n = Math.max(1, Math.round((b1 - a1) / 0.5));
      for (let i = 0; i < n; i++) { const s = a1 + ((b1 - a1) * (i + 0.5)) / n; relief(D, f, discO(s, yT + 0.37, 0.24, 12), -0.06, 0.06, [discO(s, yT + 0.37, 0.16, 12)], true); }
    }
    fprism(f, c - gR, c + gR, -0.5, 0.2, yT, yT + gR);
    Z.edge(...[wp(f, 0, 0, -0.2), wp(f, w, 0, -0.2)].flatMap((p) => [p[0], p[2]]), yT, f.nx, f.nz);
    // sides and back of the upper block: twin windows toward the front, frieze, cornice
    for (const [a, c2] of [[[ux0, uz0], [ux0, uz1]], [[ux1, uz1], [ux1, uz0]], [[ux0, uz1], [ux1, uz1]]]) {
      const g = faceOn(uRing, a, c2), sc = Math.abs(g.nz) > 0.5 ? g.w / 2 : sAt(g, a[0], uz0 + 2.4);
      const ho = [-0.38, 0.38].map((d) => ({ P: archO(sc + d, 0.28, tya, tys, 8), dep: 0.35 }));
      sheet(W, g, rectO(0, g.w, Y(YE - 0.2), yT), ho.map((h) => h.P));
      for (const h of ho) sides(D, g, h.P, 0, -h.dep, true);
      for (const d of [-0.38, 0.38]) sashArch(g, sc + d, 0.28, tya, tys, -0.3);
      relief(D, g, bandO(sc, tys, 0.72, 0.9, 0, PI, 12), 0, 0.08);
      fb(D, g, sc - 1.0, sc + 1.0, tya - 0.12, tya, 0, 0.16, 1 | 4 | 8 | 16 | 32);
      quoins(g, 0, 0.4, Y(YE), yU); quoins(g, g.w - 0.4, g.w, Y(YE), yU);
      cornice(g, 0, g.w, yT, ENT2, false);
    }
    B.roof.setColor(ROOFC); hipRoof(B.roof, ux0 + 0.3, uz0 + 0.3, ux1 - 0.3, uz1 - 0.3, yT - 0.05, 1.7);
    S.box(ux0, Y(YE), uz0, ux1, yT, uz1, 'wall');
  }

  // ---- the rear apse (1983): a curved one-storey hall with tall windows
  {
    const [cx, cz] = APSE_C, N = 10, pts = [[cx + APSE_R, 792.1]];
    for (let k = 0; k <= N; k++) { const a = (PI * k) / N; pts.push([cx + APSE_R * Math.cos(a), cz + APSE_R * Math.sin(a)]); }
    pts.push([cx - APSE_R, 792.1]);
    for (let i = 0; i + 1 < pts.length; i++) {
      const f = faceOn(pts, pts[i], pts[i + 1]), win = i % 2 === 1 && f.w > 1.2;
      const P = win ? rectO(f.w / 2 - 0.45, f.w / 2 + 0.45, Y(2.1), Y(4.8)) : null;
      wall(f, Y(YA), P ? [{ P, dep: 0.3 }] : []);
      if (P) { sashRect(f, f.w / 2 - 0.45, f.w / 2 + 0.45, Y(2.1), Y(4.8), -0.26); fb(D, f, f.w / 2 - 0.6, f.w / 2 + 0.6, Y(2.0), Y(2.1), 0, 0.14, 1 | 4 | 8 | 16 | 32); }
      fb(D, f, -0.05, f.w + 0.05, Y(YA) - 0.5, Y(YA) - 0.38, 0, 0.08, 1 | 16 | 32);
      fb(D, f, -0.08, f.w + 0.08, Y(YA) - 0.22, Y(YA), 0, 0.3, 1 | 16 | 32);
    }
    B.roof.setColor(ROOFC); B.roof.fill(pts, [], Y(YA) - 0.05, true);
    prismOf(pts, gB, Y(YA));
  }

  // ---- roofs of the body: flat behind the front parapets, hipped over the hall behind
  B.roof.setColor('#6f7477'); B.roof.fill(RING, [], Y(YE) - 0.04, true);
  B.roof.setColor(ROOFC);
  const hx0 = 168.3, hz0 = 777.9, hx1 = 201.0, hz1 = 791.8, hr = 3.0;
  hipRoof(B.roof, hx0, hz0, hx1, hz1, Y(YE), hr);
  prismOf(RING, gB, Y(YE));
  { const k = hr / ((hz1 - hz0) / 2), zm = (hz0 + hz1) / 2;
    S.prism([hx0, hz0, hx1, hz0, hx1, zm, hx0, zm], Y(YE), Y(YE) - k * hz0, 0, k, 'roof');
    S.prism([hx0, zm, hx1, zm, hx1, hz1, hx0, hz1], Y(YE), Y(YE) + k * hz1, 0, -k, 'roof'); }

  // ---- granite steps up to the gate, pedestals with white urns
  {
    const x0 = 177.2, x1 = 187.0, zTop = 769.0, zDoor = 770.0, n = 8, run = 0.35, rise = FL / n;
    K.setColor('#8b8580'); K.box(x0, gB, zTop, x1, Y(FL), zDoor, 1 | 2 | 4 | 32);
    for (let k = 0; k < n; k++) {
      const za = zTop - run * (k + 1), yt = Y(FL - rise * k);
      K.setColor(k & 1 ? '#86807b' : '#928c86'); K.box(x0, gB, za, x1, yt, za + run, 1 | 2 | 4 | 32);
    }
    const zB0 = zTop - run * n, sl = -FL / (zTop - zB0);
    S.prism([x0, zB0, x1, zB0, x1, zTop, x0, zTop], gB, Y(FL) - sl * zTop, 0, sl, 'stairs');
    S.box(x0, gB, zTop, x1, Y(FL), zDoor, 'stairs');
    for (const xc of [176.7, 187.5]) {
      K.setColor(GRAN); K.box(xc - 0.42, gB, 765.4, xc + 0.42, Y(0.95), 766.3, 1 | 2 | 4 | 16 | 32);
      D.lathe([[0.12, Y(0.95)], [0.16, Y(1.0)], [0.08, Y(1.1)], [0.1, Y(1.25)], [0.3, Y(1.5)], [0.34, Y(1.72)], [0.3, Y(1.78)], [0.33, Y(1.84)]], 12, xc, 765.85);
      K.setColor('#b33a4e'); K.ellipsoid([xc, Y(1.86), 765.85], [0.3, 0.16, 0.3], 8, 4);
      S.box(xc - 0.42, gB, 765.4, xc + 0.42, Y(1.8), 766.3, 'pedestal');
    }
  }

  // ---- the west gate: two pylons with white caps and a wrought-iron gate between them
  {
    const zg = 767.9, pyl = [169.6, 165.6];
    for (const x of pyl) {
      W.box(x - 0.4, gB, zg - 0.4, x + 0.4, Y(2.9), zg + 0.4, 1 | 2 | 16 | 32);
      D.box(x - 0.48, Y(2.9), zg - 0.48, x + 0.48, Y(3.1), zg + 0.48);
      D.with(M4(x, Y(3.1), zg, PI / 4), (q) => q.cyl(0, 0, 0, 0.5, 0.04, 0.55, 4, false));
      K.setColor(GRAN); K.box(x - 0.44, gB, zg - 0.44, x + 0.44, Y(0.5), zg + 0.44, 1 | 2 | 4 | 16 | 32);
      S.box(x - 0.45, gB, zg - 0.45, x + 0.45, Y(3.4), zg + 0.45, 'wall');
    }
    B.rail.setColor('#ffffff');
    for (const [xa, xb, hgt] of [[pyl[0] - 0.4, pyl[1] + 0.4, 2.3], [171.0, pyl[0] + 0.4, 1.6]]) {
      const P = [[xa, Y(0.05), zg], [xb, Y(0.05), zg], [xb, Y(hgt), zg], [xa, Y(hgt), zg]], L = Math.abs(xa - xb);
      const v = P.map((p, k) => B.rail.vert(p[0], p[1], p[2], 0, 0, -1, (k === 1 || k === 2 ? L : 0) / 1.25, k >= 2 ? 2 : 0));
      B.rail.quad(v[0], v[1], v[2], v[3]);
      S.box(Math.min(xa, xb), gB, zg - 0.05, Math.max(xa, xb), Y(hgt), zg + 0.05, 'fence');
    }
  }

  // ---- globe lamps on the forecourt (five white globes on a cast post)
  for (const [x, z] of [[163.8, 761.2], [200.6, 761.6], [172.5, 763.6], [191.7, 763.6]]) {
    const yb = hAt(x, z) + 0.19;
    K.setColor('#2a2f33'); K.cyl(x, yb, z, 0.2, 0.16, 0.45, 8); K.cyl(x, yb + 0.45, z, 0.08, 0.055, 3.3, 8);
    for (let k = 0; k < 4; k++) { const a = (k * PI) / 2 + PI / 4, ex = x + Math.cos(a) * 0.48, ez = z + Math.sin(a) * 0.48;
      K.tube([x, yb + 3.35, z], [ex, yb + 3.6, ez], 0.03, 4); B.lit.setColor('#fff6e6'); B.lit.ellipsoid([ex, yb + 3.78, ez], [0.2, 0.2, 0.2], 8, 5); }
    B.lit.setColor('#fff6e6'); B.lit.ellipsoid([x, yb + 4.02, z], [0.22, 0.22, 0.22], 8, 5);
    S.cyl(x, z, yb, yb + 4, 0.12, 0.12, 'pole');
  }

  // ---- the bronze tactile miniature of the palace (2017) on a granite block by the east corner
  {
    const mx = 204.3, mz = 768.9, yb = hAt(mx, mz) + 0.19, top = yb + 0.85, k = 1 / 32, cx = 184.6, cz = 780;
    K.setColor(GRAN); K.box(mx - 0.75, yb - 0.3, mz - 0.55, mx + 0.75, top, mz + 0.55);
    S.box(mx - 0.75, yb - 0.3, mz - 0.55, mx + 0.75, top + 0.5, mz + 0.55, 'pedestal');
    const Q = B.bronze.setColor('#8f6d3e'), bx = (x0, z0, x1, z1, h0, h1) => Q.box(mx + (x0 - cx) * k, top + h0 * k, mz + (z0 - cz) * k, mx + (x1 - cx) * k, top + h1 * k, mz + (z1 - cz) * k);
    Q.box(mx - 0.62, top, mz - 0.44, mx + 0.62, top + 0.03, mz + 0.44);
    bx(168, 770.5, 201.3, 792.1, 1, YE); bx(171, 767.4, 177.2, 771, 1, YE + PAR); bx(187, 767.4, 193.2, 771, 1, YE + PAR);
    bx(193.2, 770.5, 200.2, 777, 1, YE + PAR); bx(176.4, 770, 187.8, 781, 1, YC); bx(179.4, 769.9, 184.8, 770.4, YC, YC + 2.2);
    bx(180.3, 769.9, 183.9, 770.4, YC + 2.2, YC + 2.7); bx(176.6, 770, 177.4, 770.8, YC, YC + 3); bx(186.8, 770, 187.6, 770.8, YC, YC + 3);
    Q.cyl(mx + (APSE_C[0] - cx) * k, top + k, mz + (APSE_C[1] - cz) * k, APSE_R * k, APSE_R * k, YA * k, 10);
    for (let i = 0; i < 6; i++) bx(177.2, 766.2 + i * 0.47, 187, 766.7 + i * 0.47, 0, 1 + i * 0.25);
  }

  // ---- the forecourt: pavers from the street pavement up to the plinth, round the gate and the miniature
  const pave = { pos: [], uv: [], idx: [] }, PAVE = [160.5, 757.2, 206.5, 767.45];
  {
    const [x0, z0, x1, z1] = PAVE, nx = Math.ceil((x1 - x0) / 2), nz = Math.ceil((z1 - z0) / 2);
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx, z = z0 + ((z1 - z0) * j) / nz;
      pave.pos.push(x, hAt(x, z) + 0.2, z); pave.uv.push(x / 4, z / 4);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, c = a + nx + 1; pave.idx.push(a, c, a + 1, a + 1, c, c + 1); }
  }

  // ---- meshes
  const group = Object.assign(new THREE.Group(), { name: 'wedding' });
  root.add(group);
  const rust = rustTex(r); rust.repeat.set(0.5, 0.5);
  const rail = railTex();
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: rust, vertexColors: true, roughness: 0.85, emissive: 0xe0a458, emissiveMap: rust, emissiveIntensity: 0 }),
    deco: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, emissive: 0xfff0d8, emissiveIntensity: 0 }),
    col: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, emissive: 0xfff6ea, emissiveIntensity: 0 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.05 }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.45, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.3, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffd9a0, emissiveIntensity: 0 }),
    gate: new THREE.MeshStandardMaterial({ map: gateTex(), roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }),
    rail: new THREE.MeshStandardMaterial({ map: rail, alphaTest: 0.5, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }),
    sign: new THREE.MeshStandardMaterial({ map: signTex(), roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0 }),
    flag: new THREE.MeshStandardMaterial({ map: flagTex(), roughness: 0.8, side: THREE.DoubleSide }),
    bronze: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.75 }),
  };
  M.sign.emissiveMap = M.sign.map;
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pave.pos, 3));
  pg.setAttribute('uv', new THREE.Float32BufferAttribute(pave.uv, 2));
  pg.setIndex(pave.idx); pg.computeVertexNormals();
  group.add(Object.assign(new THREE.Mesh(pg, decal(new THREE.MeshStandardMaterial({ map: paveTex(r), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }))), { name: 'wedding-forecourt', receiveShadow: true }));
  let nV = 0;
  for (const [key, Bk] of Object.entries(B)) {
    if (!Bk.v) continue;
    nV += Bk.v;
    const glassy = key === 'glass' || key === 'lit' || key === 'sign' || key === 'flag';
    group.add(Object.assign(new THREE.Mesh(Bk.build(), M[key]), { name: 'wedding-' + key, castShadow: !glassy, receiveShadow: true }));
  }
  console.log(`[cherkasy] Wedding palace: ${faces.length} walls, ${nWin} windows, ${(nV / 1000).toFixed(1)}k verts, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    footprints: [{ poly: ringPts(b.p), h: YC + 2.6, kind: 'public', name: 'Палац одружень' }],
    // generated trees keep off the building, the forecourt and the gate
    clear: (x, z) => x > 162 && x < 206 && z > 757 && z < 801,
    update() {
      const k = nightK.value;
      M.lit.emissiveIntensity = 1.3 * k; M.wall.emissiveIntensity = 0.3 * k; M.deco.emissiveIntensity = 0.28 * k;
      M.col.emissiveIntensity = 0.75 * k; M.sign.emissiveIntensity = 0.45 * k;
    },
  };
}
