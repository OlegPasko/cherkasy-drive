// OWNER: cherkasy. Будинок рад («Білий дім»), бульвар Шевченка, 185: the regional state administration and the regional
// council over Soborna square (OSM way 1476966, a closed block round a courtyard with the round session hall at the
// back). A standard Soviet-classicist design (M. Brovkin's competition project, adapted by V. Shtokmar), finished
// 1959–1962: 98 m front, 48 m sides, five storeys. Rebuilt after a 2020 Wikimedia Commons photo of the front and the
// written descriptions: a two-storey tier of cream stone rustication on a granite plinth, a belt, then 18 fluted
// engaged columns through storeys 3–5 with roundels under the 4th-floor windows, entablature, a deep cornice and an
// attic that steps up to the centre, where a stone cartouche with the trident sits under an octagonal finial with the
// flag. The end pavilions project and hold a two-column loggia with an arched top window. At the foot of the centre
// a dark granite portal with three arched doorways, a clock over the middle one, a landing with two stone balls and a
// broad flight of steps to the square; blue spruces on the lawns, three flagpoles (Ukraine, the EU, the oblast) and
// five-globe lamps. The courtyard is reached by two ground-floor passages through the back wing (OSM service roads).
// Lit windows, door lanterns, lamps and the clock at night; the flags wave, the clock shows the local time.
//   BILYIDIM_SKIP: the OSM id replaced here (buildings.js skips it)
//   shapeBilyiDim(hf, map) -> level | null   levels the lot and the forecourt (hf.pad, 20 m eased band); call before
//     the ground and the buildings are built (the DEM tilts ~3 m along the front, the real square is level)
//   buildBilyiDim({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), spots, footprints } | null
// The front looks to -x (the square), the long axis runs along z. Façades are laid out in a face frame per footprint
// edge: s to the right of a viewer outside, o outward, y up; all heights below are over the ground floor (yF).
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { PARK_PINE } from '../trees.js';
import { canvasTex, decal } from './sculpt.js';
import { ringPts, rng, area2, inPoly, bboxOf } from './geo.js';
import { clipRing } from './places.js';

const OSM_ID = 1476966;
export const BILYIDIM_SKIP = new Set([OSM_ID]);
const NAME = 'Будинок рад';

const PL = 0.9;                                   // ground floor over the square
const LOW = 8.0, BELT = 0.45, FU = 3.7;          // the rusticated tier (two storeys), belt, upper storey
const UP0 = LOW + BELT, CAP = UP0 + 3 * FU;      // column bases, capitals top
const ENT = CAP + 1.6, CORN = ENT + 0.9, ATT = CORN + 1.5; // entablature, cornice, attic top
const ROWS_LOW = [[0, 1.0, 2.5], [4.2, 0.85, 2.3]]; // [storey floor, sill, window height]
const ROWS_UP = [0, 1, 2].map((k) => [UP0 + k * FU, 0.9, 2.2]);
const WW = 1.6, REV = 0.28, BAY = 3.6;           // window width, reveal, bay on plain façades
const PASS_H = 4.4, PASS_W = 5.0;                // courtyard passages under the back wing
const CREAM = '#dcd0b6', CREAM2 = '#e6dcc6', STONE = '#d2c6ab', GRAN = '#5c605d', REVC = '#c8bca2';
const GLASS = ['#46545d', '#3d4a52', '#52616a', '#4a5961'];
const UP = [0, 1, 0], DOWN = [0, -1, 0];
const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------ terrain
export function shapeBilyiDim(hf, map) {
  const b = map.buildings.find((q) => q.id === OSM_ID);
  if (!b) return null;
  const bb = bboxOf(ringPts(b.p));
  // the lot plus the forecourt with the steps; the square beyond eases back to the DEM
  return hf.pad([[bb.x0 - 11, bb.z0 - 4], [bb.x1 + 3, bb.z0 - 4], [bb.x1 + 3, bb.z1 + 4], [bb.x0 - 11, bb.z1 + 4]], 20);
}

// ------------------------------------------------------------------------------------------------ textures
// cream facing tiles, 0.6 m, four by four per 2.4 m repeat
const tileTex = (r) => canvasTex(256, 256, (g, w) => {
  const p = w / 4;
  g.fillStyle = '#9d968a'; g.fillRect(0, 0, w, w);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const v = 236 + r() * 16;
    g.fillStyle = `rgb(${v | 0},${(v - 3) | 0},${(v - 9) | 0})`; g.fillRect(i * p + 2, j * p + 2, p - 3, p - 3);
  }
  for (let k = 0; k < 2500; k++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)'; g.fillRect(r() * w, r() * w, 1 + r() * 2, 1 + r() * 2); }
});
// rustication: 1.2 x 0.6 m blocks, deep horizontal joints, shallow vertical ones, staggered courses
const rustTex = (r) => canvasTex(256, 256, (g, w) => {
  g.fillStyle = '#f0ebe1'; g.fillRect(0, 0, w, w);
  const bh = w / 4, bl = w / 2;
  for (let j = 0; j < 4; j++) {
    for (let i = -1; i < 3; i++) {
      const x = i * bl + (j & 1 ? bl / 2 : 0), v = 228 + r() * 22;
      g.fillStyle = `rgb(${v | 0},${(v - 4) | 0},${(v - 11) | 0})`; g.fillRect(x + 2, j * bh + 5, bl - 3, bh - 9);
      g.fillStyle = 'rgba(90,80,65,0.5)'; g.fillRect(x, j * bh, 2, bh);
    }
    g.fillStyle = 'rgba(70,62,50,0.75)'; g.fillRect(0, j * bh, w, 4);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, j * bh + 4, w, 1);
  }
  for (let k = 0; k < 2500; k++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)'; g.fillRect(r() * w, r() * w, 1 + r() * 2, 1 + r() * 2); }
});
const graniteTex = (r) => canvasTex(128, 128, (g, w) => {
  g.fillStyle = '#9a9c98'; g.fillRect(0, 0, w, w);
  for (let k = 0; k < 2200; k++) { const v = 90 + r() * 120; g.fillStyle = `rgb(${v | 0},${v | 0},${(v * 0.97) | 0})`; g.fillRect(r() * w, r() * w, 1 + r() * 1.5, 1 + r() * 1.5); }
});
// the trident (the state arms), drawn in relief-grey lines; used on the cartouche and the finial
function tryzub(g, c, y0, s, col) {
  g.save(); g.translate(c, y0); g.scale(s, s);
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 9; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-58, -8); g.lineTo(-58, 118); g.moveTo(58, -8); g.lineTo(58, 118); // side prongs
  g.moveTo(0, -30); g.lineTo(0, 96);                                                             // middle prong
  g.moveTo(-58, 118); g.quadraticCurveTo(-58, 150, -20, 150); g.lineTo(20, 150); g.quadraticCurveTo(58, 150, 58, 118);
  g.moveTo(-58, -8); g.lineTo(-40, 18); g.moveTo(58, -8); g.lineTo(40, 18);                     // prong tips turned in
  g.moveTo(-20, 150); g.lineTo(-20, 176); g.moveTo(20, 150); g.lineTo(20, 176); g.moveTo(-26, 176); g.lineTo(26, 176);
  g.moveTo(-30, 96); g.quadraticCurveTo(0, 128, 30, 96); g.moveTo(-40, 40); g.quadraticCurveTo(-30, 96, 0, 96); g.moveTo(40, 40); g.quadraticCurveTo(30, 96, 0, 96);
  g.stroke();
  g.beginPath(); g.moveTo(0, -48); g.lineTo(9, -26); g.lineTo(-9, -26); g.closePath(); g.fill();
  g.restore();
}
// the attic cartouche: a stone plate with scrolled ends, a wreath ring and the trident in a shield
const armsTex = () => canvasTex(512, 512, (g, w) => {
  const c = w / 2;
  g.fillStyle = '#c3c2bc'; g.fillRect(0, 0, w, w);
  g.fillStyle = '#d4d3cd'; g.fillRect(40, 40, w - 80, w - 80);
  g.strokeStyle = '#8f8f8a'; g.lineWidth = 10; g.strokeRect(40, 40, w - 80, w - 80);
  g.beginPath(); g.arc(c, c, 190, 0, TAU); g.lineWidth = 22; g.strokeStyle = '#9d9d98'; g.stroke();
  g.lineWidth = 3; g.strokeStyle = '#e8e7e2'; g.beginPath(); g.arc(c - 3, c - 3, 178, 0, TAU); g.stroke();
  g.beginPath(); g.moveTo(c - 110, c - 130); g.lineTo(c + 110, c - 130); g.lineTo(c + 110, c + 40); g.quadraticCurveTo(c + 110, c + 140, c, c + 165);
  g.quadraticCurveTo(c - 110, c + 140, c - 110, c + 40); g.closePath(); g.lineWidth = 8; g.strokeStyle = '#8a8a85'; g.stroke();
  tryzub(g, c + 3, c - 88, 1.05, '#f0efe9'); tryzub(g, c, c - 91, 1.05, '#7b7c78');
}, { repeat: false });
const clockTex = () => canvasTex(256, 256, (g, w) => {
  const c = w / 2;
  g.fillStyle = '#6b4a2a'; g.fillRect(0, 0, w, w);
  g.fillStyle = '#b8892f'; g.beginPath(); g.arc(c, c, c - 2, 0, TAU); g.fill();
  g.fillStyle = '#f2ead3'; g.beginPath(); g.arc(c, c, c - 18, 0, TAU); g.fill();
  g.fillStyle = '#2a2622';
  for (let k = 0; k < 12; k++) { g.save(); g.translate(c, c); g.rotate(k * TAU / 12); g.fillRect(-3, -c + 24, 6, k % 3 ? 14 : 24); g.restore(); }
}, { repeat: false });
const flagTex = (kind) => canvasTex(128, 84, (g, w, h) => {
  if (kind === 'ua') { g.fillStyle = '#0057b7'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#ffd700'; g.fillRect(0, h / 2, w, h / 2); return; }
  g.fillStyle = kind === 'eu' ? '#003399' : '#1d4fa0'; g.fillRect(0, 0, w, h);
  if (kind === 'eu') {
    g.fillStyle = '#ffcc00';
    for (let k = 0; k < 12; k++) { const a = k * TAU / 12; g.beginPath(); g.arc(w / 2 + Math.cos(a) * 24, h / 2 + Math.sin(a) * 24, 3.4, 0, TAU); g.fill(); }
  } else { // the oblast flag (uncertain in the photo): a plain blue field with a gold disc
    g.fillStyle = '#e4b53a'; g.beginPath(); g.arc(w * 0.36, h / 2, 16, 0, TAU); g.fill();
  }
}, { repeat: false });

// ------------------------------------------------------------------------------------------------ face frame
function frameOf(a, b, n) {
  const rx = n[1], rz = -n[0];
  let p = a, q = b;
  if ((q[0] - p[0]) * rx + (q[1] - p[1]) * rz < 0) [p, q] = [q, p];
  return { ox: p[0], oz: p[1], nx: n[0], nz: n[1], rx, rz, w: Math.hypot(q[0] - p[0], q[1] - p[1]), N: [n[0], 0, n[1]], R: [rx, 0, rz], pass: [] };
}
const P = (f, s, y, o = 0) => [f.ox + f.rx * s + f.nx * o, y, f.oz + f.rz * s + f.nz * o];
const sOf = (f, x, z) => (x - f.ox) * f.rx + (z - f.oz) * f.rz;
const neg = (v) => [-v[0], -v[1], -v[2]];
// a wall quad with uv in metres along the façade (s, y): tiles line up across strips
function wq(M, f, s0, s1, y0, y1, o = 0, back = false) {
  const n = back ? neg(f.N) : f.N, V = (s, y) => { const p = P(f, s, y, o); return M.vert(p[0], p[1], p[2], n[0], n[1], n[2], s, y); };
  const a = V(s0, y0), b = V(s1, y0), c = V(s1, y1), d = V(s0, y1);
  if (back) M.quad(a, d, c, b); else M.quad(a, b, c, d);
}
// box in the face frame; m bits: 1 front, 2 back, 4 left (s0), 8 right (s1), 16 top, 32 bottom
function fbox(M, f, s0, s1, y0, y1, o0, o1, m = 63) {
  const F = (pts, n) => M.face(pts, n);
  if (m & 1) F([P(f, s0, y0, o1), P(f, s1, y0, o1), P(f, s1, y1, o1), P(f, s0, y1, o1)], f.N);
  if (m & 2) F([P(f, s0, y0, o0), P(f, s1, y0, o0), P(f, s1, y1, o0), P(f, s0, y1, o0)], neg(f.N));
  if (m & 4) F([P(f, s0, y0, o0), P(f, s0, y0, o1), P(f, s0, y1, o1), P(f, s0, y1, o0)], neg(f.R));
  if (m & 8) F([P(f, s1, y0, o0), P(f, s1, y0, o1), P(f, s1, y1, o1), P(f, s1, y1, o0)], f.R);
  if (m & 16) F([P(f, s0, y1, o0), P(f, s1, y1, o0), P(f, s1, y1, o1), P(f, s0, y1, o1)], UP);
  if (m & 32) F([P(f, s0, y0, o0), P(f, s1, y0, o0), P(f, s1, y0, o1), P(f, s0, y0, o1)], DOWN);
}
// the inner sides of an opening [a, c] x [ya, yb] cut from o0 to o1: cheeks facing into it, soffit, floor
function reveal(M, f, a, c, ya, yb, o0, o1, m = 15) {
  if (m & 1) M.face([P(f, a, ya, o0), P(f, a, ya, o1), P(f, a, yb, o1), P(f, a, yb, o0)], f.R);
  if (m & 2) M.face([P(f, c, ya, o0), P(f, c, ya, o1), P(f, c, yb, o1), P(f, c, yb, o0)], neg(f.R));
  if (m & 4) M.face([P(f, a, yb, o0), P(f, c, yb, o0), P(f, c, yb, o1), P(f, a, yb, o1)], DOWN);
  if (m & 8) M.face([P(f, a, ya, o0), P(f, c, ya, o0), P(f, c, ya, o1), P(f, a, ya, o1)], UP);
}
// the uncovered parts of [a, b] once the spans are cut out
function freeOf(a, b, spans) {
  const out = [];
  let s = a;
  for (const [c, d] of spans.slice().sort((p, q) => p[0] - q[0])) { if (c > s + 1e-3) out.push([s, Math.min(c, b)]); s = Math.max(s, d); }
  if (s < b - 1e-3) out.push([s, b]);
  return out.filter(([c, d]) => d - c > 1e-3);
}
// wall rectangle [s0, s1] x [y0, y1] minus rectangular holes [a, b, ya, yb], cut into horizontal bands
function wallHoles(M, f, s0, s1, y0, y1, holes, o = 0) {
  const hs = holes.filter((h) => h[2] < y1 && h[3] > y0);
  const ys = [...new Set([y0, y1, ...hs.flatMap((h) => [h[2], h[3]]).filter((y) => y > y0 && y < y1)])].sort((a, b) => a - b);
  for (let i = 0; i + 1 < ys.length; i++) {
    const ya = ys[i], yb = ys[i + 1], spans = hs.filter((h) => h[2] < yb - 1e-4 && h[3] > ya + 1e-4).map((h) => [h[0], h[1]]);
    for (const [a, b] of freeOf(s0, s1, spans)) wq(M, f, a, b, ya, yb, o);
  }
}
const prismOf = (S, pts, y0, y1, kind = 'wall', flags = 0) => S.prism((area2(pts) < 0 ? pts.slice().reverse() : pts).flat(), y0, y1, 0, 0, kind, flags);
function fprism(S, f, s0, s1, o0, o1, y0, y1, kind = 'wall') {
  prismOf(S, [[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = P(f, s, 0, o); return [p[0], p[2]]; }), y0, y1, kind);
}
// the two halves of a ring-with-hole cut by the line x = xc, each stitched into one simple polygon (a "C")
function halves(outer, hole, xc) {
  const out = [];
  for (const sg of [-1, 1]) {
    const cut = { p: [xc, 0], n: [sg, 0] }, flat = (R) => clipRing(R.flat(), cut), pairs = (F) => { const r = []; for (let i = 0; i < F.length; i += 2) r.push([F[i], F[i + 1]]); return r; };
    const O = pairs(flat(outer)), H = pairs(flat(hole));
    const onCut = (p) => Math.abs(p[0] - xc) < 1e-3;
    const open = (R) => { const i = R.findIndex((p, k) => onCut(p) && onCut(R[(k + 1) % R.length])); return i < 0 ? null : [...R.slice(i + 1), ...R.slice(0, i + 1)]; };
    const o = open(O), h = open(H);
    if (!o || !h) continue;
    const A = o[o.length - 1], d0 = Math.hypot(A[0] - h[0][0], A[1] - h[0][1]), d1 = Math.hypot(A[0] - h[h.length - 1][0], A[1] - h[h.length - 1][1]);
    out.push([...o, ...(d0 < d1 ? h : h.slice().reverse())]);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ build
export function buildBilyiDim({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((q) => q.id === OSM_ID);
  if (!b?.holes?.length) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 99991), s0 = S.count;
  const outer = ringPts(b.p), hole = ringPts(b.holes[0]);
  const g = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 0; };
  const bb = bboxOf(outer);
  const yG = g(bb.x0 + 1, (bb.z0 + bb.z1) / 2), yF = yG + PL;
  const gBase = Math.min(...outer.map(([x, z]) => g(x, z))) - 0.6;
  const Y = (h) => yF + h;
  const solid = (x, z) => inPoly(outer, x, z) && !inPoly(hole, x, z);

  const B = { wall: new MB(), rust: new MB(), det: new MB(), gran: new MB(), glass: new MB(), lit: new MB(), glow: new MB(), arms: new MB(), clock: new MB() };
  const W = B.wall, D = B.det, G = B.gran;
  const glassOf = () => GLASS[Math.floor(r() * GLASS.length)];

  // ---- faces: outer and courtyard edges, near-collinear runs merged
  const faces = [];
  for (const [ring, court] of [[outer, false], [hole, true]]) {
    const pts = [];
    for (let i = 0; i < ring.length; i++) { // drop vertices where the outline runs straight on
      const a = ring[(i + ring.length - 1) % ring.length], p = ring[i], c = ring[(i + 1) % ring.length];
      const u = [p[0] - a[0], p[1] - a[1]], v = [c[0] - p[0], c[1] - p[1]];
      if (Math.abs(u[0] * v[1] - u[1] * v[0]) / (Math.hypot(...u) * Math.hypot(...v) + 1e-9) > 0.02) pts.push(p);
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 0.4) continue;
      let n = [(c[1] - a[1]) / L, -(c[0] - a[0]) / L];
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      if (solid(mx + n[0] * 0.3, mz + n[1] * 0.3)) n = [-n[0], -n[1]];
      const f = frameOf(a, c, n);
      f.type = court ? 'court' : n[0] < -0.97 && L > 40 ? 'front' : n[0] < -0.97 && L > 10 && mx < bb.x0 + 4 ? 'pav'
        : mx > bb.x1 - 18 && L < 7 && mz > -24 && mz < 8 ? 'hall' : 'out';
      faces.push(f);
    }
  }
  const front = faces.find((f) => f.type === 'front');
  if (!front) return null;
  const bw = front.w / 19, mid = 9.5 * bw;             // 19 window bays, 18 columns; the middle bay holds the doors
  const cz = P(front, mid, 0)[2];                      // the axis of the building (z)

  // ---- courtyard passages: the OSM service roads that cross the back wing
  const passes = [];
  for (const rd of map.roads) {
    if (rd.c !== 'service') continue;
    for (let i = 0; i + 3 < rd.p.length; i += 2) {
      const [x0, z0, x1, z1] = rd.p.slice(i, i + 4);
      if (Math.abs(z1 - z0) > 1 || Math.abs(x1 - x0) < 4) continue; // runs along x
      // the road stops at the wall on either side: find the run of building it points into
      const zc = (z0 + z1) / 2, xa = Math.min(x0, x1), xb = Math.max(x0, x1), runs = [];
      let run = null;
      for (let x = xa - 12; x <= xb + 12; x += 0.25) {
        if (solid(x, zc)) { if (run) run[1] = x; else runs.push(run = [x, x]); } else run = null;
      }
      const w = runs.find(([a, c]) => c - a > 3 && c - a < 14 && (Math.abs(a - xb) < 1.5 || Math.abs(c - xa) < 1.5));
      if (w && !passes.some((p) => Math.abs(p.z - zc) < 3)) passes.push({ z: zc, x0: w[0] - 0.4, x1: w[1] + 0.4 });
    }
  }
  for (const f of faces) {
    if (Math.abs(f.nx) < 0.9) continue;
    const x = f.ox;
    for (const p of passes) if (x > p.x0 - 0.5 && x < p.x1 + 0.5) {
      const a = sOf(f, x, p.z - PASS_W / 2), c = sOf(f, x, p.z + PASS_W / 2), lo = Math.min(a, c), hi = Math.max(a, c);
      if (hi > 0 && lo < f.w) f.pass.push([Math.max(0, lo), Math.min(f.w, hi)]);
    }
  }

  // ---- windows: reveals, glass (some lit), white frames with a mullion and a transom on the street sides
  let nWin = 0;
  const win = (f, a, c, ya, yb, frames = true, arch = false) => {
    D.setColor(REVC);
    reveal(D, f, a, c, ya, yb, -REV, 0, arch ? 11 : 15);
    const lit = r() < 0.3, M = lit ? B.lit : B.glass;
    M.setColor(lit ? '#77705f' : glassOf());
    M.face([P(f, a, ya, -REV + 0.03), P(f, c, ya, -REV + 0.03), P(f, c, yb, -REV + 0.03), P(f, a, yb, -REV + 0.03)], f.N);
    if (arch) { // the round head over the loggia window: glass fan over the opening
      const R = (c - a) / 2, m = (a + c) / 2, seg = 10, ring = [];
      for (let k = 0; k <= seg; k++) { const t = Math.PI * k / seg; ring.push(P(f, m + R * Math.cos(t), yb + R * Math.sin(t), -REV + 0.03)); }
      M.face([P(f, m, yb, -REV + 0.03), ...ring], f.N);
    }
    if (frames) {
      D.setColor('#f1f0ec');
      const m = (a + c) / 2, yt = yb - 0.55;
      fbox(D, f, m - 0.04, m + 0.04, ya, yt, -REV + 0.03, -REV + 0.1, 1 | 4 | 8);
      fbox(D, f, a, c, yt - 0.04, yt + 0.04, -REV + 0.03, -REV + 0.1, 1 | 16 | 32);
      fbox(D, f, a - 0.05, c + 0.05, ya - 0.07, ya, -REV, 0.06, 1 | 16);              // sill
    }
    nWin++;
  };
  const rowsHoles = (f, cols, rows, skip = () => false) => {
    const h = [];
    for (const [yl, sill, hh] of rows) for (const s of cols) if (!skip(s, yl)) h.push([s - WW / 2, s + WW / 2, Y(yl + sill), Y(yl + sill + hh)]);
    return h;
  };
  const inPass = (f, s, pad = 0.4) => f.pass.some(([a, c]) => s + WW / 2 + pad > a && s - WW / 2 - pad < c);

  // ---- the crown every street face shares: belt, entablature, cornice, attic with coping; plinth
  const crown = (f, s0 = 0, s1 = f.w, attTop = ATT) => {
    D.setColor(STONE);
    fbox(D, f, s0 - 0.25, s1 + 0.25, Y(LOW), Y(UP0), -0.3, 0.25, 1 | 16 | 32 | 4 | 8);          // belt
    W.setColor(CREAM); wq(W, f, s0, s1, Y(CAP), Y(ENT), 0);                                           // frieze
    D.setColor(STONE); fbox(D, f, s0 - 0.12, s1 + 0.12, Y(CAP), Y(CAP + 0.55), -0.2, 0.14, 1 | 16 | 32 | 4 | 8); // architrave
    D.setColor('#cdc1a6'); fbox(D, f, s0 - 0.45, s1 + 0.45, Y(ENT), Y(ENT + 0.35), -0.3, 0.45, 1 | 32 | 4 | 8);
    D.setColor('#d6cbb1'); fbox(D, f, s0 - 1.0, s1 + 1.0, Y(ENT + 0.35), Y(CORN), -0.3, 1.0, 63);     // cornice
    W.setColor(CREAM2); wq(W, f, s0, s1, Y(CORN), Y(attTop), -0.15);                                  // attic
    W.setColor('#c9bea5'); wq(W, f, s0, s1, Y(CORN), Y(attTop), -0.55, true);
    D.setColor('#b9b2a2'); fbox(D, f, s0 - 0.05, s1 + 0.05, Y(attTop), Y(attTop + 0.12), -0.6, -0.05, 1 | 2 | 16);
  };
  const plinth = (f, s0 = 0, s1 = f.w) => {
    G.setColor(GRAN);
    wallHoles(G, f, s0, s1, gBase, yF, f.pass.map(([a, c]) => [a, c, gBase, yG + PASS_H]), 0.08);
    fbox(G, f, s0, s1, yF - 0.1, yF, 0, 0.12, 1 | 16);
  };

  // ---- plain façades (sides, back, the session hall) and the courtyard
  for (const f of faces) {
    if (f.type === 'front' || f.type === 'pav') continue;
    const nb = f.w >= 2.8 ? Math.max(1, Math.round(f.w / BAY)) : 0, bay = f.w / Math.max(1, nb);
    const cols = Array.from({ length: nb }, (_, i) => (i + 0.5) * bay);
    const passH = f.pass.map(([a, c]) => [a, c, gBase, yG + PASS_H]);
    if (f.type === 'court') {
      const holes = [...rowsHoles(f, cols, [...ROWS_LOW, ...ROWS_UP], (s, yl) => yl === 0 && inPass(f, s)), ...passH];
      W.setColor('#d8cfbb'); wallHoles(W, f, 0, f.w, gBase, Y(CORN), holes);
      W.setColor(CREAM2); wq(W, f, 0, f.w, Y(CORN), Y(ATT - 0.4), 0); W.setColor('#c9bea5'); wq(W, f, 0, f.w, Y(CORN), Y(ATT - 0.4), -0.4, true);
      D.setColor('#b9b2a2'); fbox(D, f, 0, f.w, Y(ATT - 0.4), Y(ATT - 0.3), -0.45, 0.05, 1 | 2 | 16);
      for (const h of holes) if (h[2] > gBase + 0.1) win(f, h[0], h[1], h[2], h[3], false);
    } else {
      const hall = f.type === 'hall';
      const low = rowsHoles(f, cols, ROWS_LOW, (s, yl) => yl === 0 && inPass(f, s));
      const up = hall && nb ? cols.flatMap((s) => [[s - 0.75, s + 0.75, Y(UP0 + 0.9), Y(UP0 + FU + 3.1)], [s - 0.75, s + 0.75, Y(UP0 + 2 * FU + 0.9), Y(UP0 + 2 * FU + 3.1)]])
        : rowsHoles(f, cols, ROWS_UP);
      plinth(f);
      B.rust.setColor(CREAM); wallHoles(B.rust, f, 0, f.w, yF, Y(LOW), [...low, ...passH]);
      W.setColor(CREAM); wallHoles(W, f, 0, f.w, Y(UP0), Y(CAP), up);
      crown(f);
      for (const h of [...low, ...up]) win(f, h[0], h[1], h[2], h[3], true);
    }
    const e0 = P(f, 0, 0, -0.3), e1 = P(f, f.w, 0, -0.3);
    Z.edge(e0[0], e0[2], e1[0], e1[2], Y(ATT), f.nx, f.nz);
  }

  // ---- the passages: side walls, a coffered soffit with a lamp, granite surrounds on both mouths
  for (const p of passes) {
    const za = p.z - PASS_W / 2, zb = p.z + PASS_W / 2, yT = yG + PASS_H;
    D.setColor('#cfc6b2');
    D.face([[p.x0, gBase, za], [p.x1, gBase, za], [p.x1, yT, za], [p.x0, yT, za]], [0, 0, 1]);
    D.face([[p.x0, gBase, zb], [p.x1, gBase, zb], [p.x1, yT, zb], [p.x0, yT, zb]], [0, 0, -1]);
    D.setColor('#bdb3a0'); D.face([[p.x0, yT, za], [p.x1, yT, za], [p.x1, yT, zb], [p.x0, yT, zb]], DOWN);
    B.glow.setColor('#fff0d0'); B.glow.box((p.x0 + p.x1) / 2 - 0.3, yT - 0.08, p.z - 0.3, (p.x0 + p.x1) / 2 + 0.3, yT, p.z + 0.3, 8);
    for (const x of [p.x0, p.x1]) {
      const sg = x === p.x0 ? -1 : 1;
      G.setColor('#77797a');
      G.box(x - 0.02, gBase, za - 0.45, x + sg * 0.15, yT + 0.45, za, 63);
      G.box(x - 0.02, gBase, zb, x + sg * 0.15, yT + 0.45, zb + 0.45, 63);
      G.box(x - 0.02, yT, za - 0.45, x + sg * 0.15, yT + 0.45, zb + 0.45, 63);
    }
  }

  // ---- the front: rusticated tier with the portal, colonnade over it
  {
    const f = front, cols = Array.from({ length: 19 }, (_, i) => (i + 0.5) * bw);
    const pA = 8 * bw - 0.45, pB = 11 * bw + 0.45;                   // the portal spans the three middle bays
    const low = rowsHoles(f, cols, ROWS_LOW, (s) => s > pA - 0.5 && s < pB + 0.5);
    const up = rowsHoles(f, cols, ROWS_UP);
    plinth(f);
    B.rust.setColor(CREAM); wallHoles(B.rust, f, 0, f.w, yF, Y(LOW), [...low, [pA, pB, yF, Y(LOW)]]);
    W.setColor(CREAM); wallHoles(W, f, 0, f.w, Y(UP0), Y(CAP), up);
    crown(f);
    for (const h of [...low, ...up]) win(f, h[0], h[1], h[2], h[3], true);
    // roundels in square panels under the 4th-floor windows
    for (const s of cols) {
      const y = Y(UP0 + FU + 0.9 - 0.75);
      D.setColor('#d3c7ac'); fbox(D, f, s - 0.55, s + 0.55, y - 0.55, y + 0.55, 0, 0.05, 1 | 4 | 8 | 16 | 32);
      D.setColor('#e3dac6');
      const [x, , z] = P(f, s, 0, 0.05);
      D.with(new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(new THREE.Matrix4().makeRotationY(Math.atan2(f.nz, -f.nx))).setPosition(x, y, z),
        (M) => M.lathe([[0.43, 0], [0.43, 0.04], [0.36, 0.08], [0.34, 0.11], [0, 0.12]].map(([a, h]) => [a, h]), 14));
    }
    // 18 fluted engaged columns
    for (let i = 1; i <= 18; i++) column(D, f, i * bw, Y(UP0), Y(CAP), 0.5, 0.2);
    fprism(S, f, 0.3, f.w - 0.3, -0.2, 0.75, Y(UP0), Y(CAP));
    // the portal: dark granite, three arched doorways, a clock over the middle one, lanterns and plaques on the piers
    const oP = 1.3, oR = 0.9, yS = Y(5.0), yA = Y(6.2), ds = [8.5, 9.5, 10.5].map((k) => k * bw);
    G.setColor(GRAN);
    wallHoles(G, f, pA, pB, gBase, Y(LOW), ds.map((s) => [s - 1.2, s + 1.2, yF, yA]), oP);
    fbox(G, f, pA, pB, gBase, Y(LOW), 0, oP, 4 | 8 | 16);
    G.setColor('#4e5250'); fbox(G, f, pA - 0.2, pB + 0.2, Y(LOW - 0.45), Y(LOW), 0, oP + 0.2, 63);
    for (const s of ds) {
      G.setColor('#565a58');
      reveal(G, f, s - 1.2, s + 1.2, yF, yS, oR, oP, 3);
      const arc = [];
      for (let k = 0; k <= 12; k++) { const t = Math.PI * k / 12; arc.push([s + 1.2 * Math.cos(t), yS + 1.2 * Math.sin(t)]); }
      G.setColor(GRAN); // spandrels over the round head, on the portal face
      G.face([P(f, s + 1.2, yA, oP), ...arc.slice(0, 7).map(([u, v]) => P(f, u, v, oP))], f.N);
      G.face([P(f, s - 1.2, yA, oP), ...arc.slice(6).reverse().map(([u, v]) => P(f, u, v, oP))], f.N);
      G.setColor('#4c504e');
      for (let k = 0; k < 12; k++) { // intrados
        const [u0, v0] = arc[k], [u1, v1] = arc[k + 1];
        G.face([P(f, u0, v0, oR), P(f, u1, v1, oR), P(f, u1, v1, oP), P(f, u0, v0, oP)]);
      }
      // inside the reveal: wooden doors, a relief panel, the dark lunette grille
      D.setColor('#5a3520'); fbox(D, f, s - 1.1, s + 1.1, yF, Y(3.3), oR - 0.1, oR, 1);
      D.setColor('#caa062'); for (const q of [s - 0.55, s + 0.55]) fbox(D, f, q - 0.33, q + 0.33, Y(0.5), Y(3.0), oR, oR + 0.02, 1);
      D.setColor('#6a4128'); for (const q of [s - 0.55, s + 0.55]) fbox(D, f, q - 0.27, q + 0.27, Y(0.6), Y(2.9), oR, oR + 0.03, 1);
      D.setColor('#9fa19c'); fbox(D, f, s - 1.2, s + 1.2, Y(3.3), yS - 0.15, oR - 0.1, oR, 1);
      D.setColor('#b7b8b2'); fbox(D, f, s - 0.9, s + 0.9, Y(3.5), yS - 0.35, oR, oR + 0.06, 1 | 4 | 8 | 16 | 32);
      B.lit.setColor('#2c3034'); wq(B.lit, f, s - 1.2, s + 1.2, yS - 0.15, yS, oR - 0.1);
      B.lit.face([P(f, s, yS, oR - 0.1), ...arc.map(([u, v]) => P(f, u, v, oR - 0.1))], f.N);
    }
    for (const s of [pA + 0.9, ds[0] + 1.85, ds[1] + 1.85, pB - 0.9]) { // lanterns, plaques
      D.setColor('#2a2b2c'); fbox(D, f, s - 0.18, s + 0.18, Y(3.55), Y(4.1), oP, oP + 0.28, 63);
      B.glow.setColor('#ffe7b8'); fbox(B.glow, f, s - 0.13, s + 0.13, Y(3.62), Y(4.0), oP + 0.28, oP + 0.29, 1);
      if (s > pA + 1 && s < pB - 1) { D.setColor('#8d8f8c'); fbox(D, f, s - 0.45, s + 0.45, Y(2.0), Y(2.7), oP, oP + 0.04, 1 | 4 | 8 | 16 | 32); }
    }
    { // the clock
      const [x, y, z] = P(f, ds[1], yS - 0.15, oP + 0.18), E = B.clock, R = 0.62, seg = 28;
      const midV = E.vert(x, y, z, f.nx, 0, f.nz, 0.5, 0.5), rim = [];
      for (let k = 0; k <= seg; k++) { const a = k / seg * TAU, q = P(f, ds[1] + R * Math.cos(a), yS - 0.15 + R * Math.sin(a), oP + 0.18); rim.push(E.vert(q[0], q[1], q[2], f.nx, 0, f.nz, 0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a))); }
      for (let k = 0; k < seg; k++) E.tri(midV, rim[k], rim[k + 1]);
      D.setColor('#6b4a2a'); D.with(new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(new THREE.Matrix4().makeRotationY(Math.atan2(f.nz, -f.nx))).setPosition(...P(f, ds[1], yS - 0.15, oP)),
        (M) => M.cyl(0, 0, 0, R + 0.06, R + 0.06, 0.17, 20, false));
    }
    fprism(S, f, pA, pB, 0, oP, gBase, Y(LOW));
    // the landing, two stone balls and the flight of six steps down to the forecourt
    const sa = 6.5 * bw, sb = 12.5 * bw, oL = oP + 2.8, NS = 6, T = 0.42, rise = PL / NS;
    G.setColor('#8c8e8a'); fbox(G, f, sa, sb, gBase, yF, 0, oL, 1 | 4 | 8 | 16);
    fprism(S, f, sa, sb, 0, oL, gBase, yF);
    for (let k = 1; k < NS; k++) {
      const y = yF - rise * k, o0 = oL + T * (k - 1), o1 = o0 + T;
      G.setColor(k & 1 ? '#858783' : '#90928e'); fbox(G, f, sa, sb, gBase, y, o0, o1, 1 | 4 | 8 | 16);
      fprism(S, f, sa, sb, o0, o1, gBase, y);
    }
    G.setColor('#9a8f86');
    for (const s of [pA - 0.8, pB + 0.8]) { const [x, , z] = P(f, s, 0, oP + 0.7); G.ellipsoid([x, yF + 0.45, z], [0.42, 0.42, 0.42], 14, 8); G.box(x - 0.35, yF, z - 0.35, x + 0.35, yF + 0.08, z + 0.35); S.cyl(x, z, yF, yF + 0.9, 0.42, 0.42, 'wall'); }
    // stepped attic over the middle: a long low step, then the tall block with the cartouche
    const aA = mid - 18.5, aB = mid + 18.5, cA = mid - 6.5, cB = mid + 6.5, yA1 = Y(ATT + 1.2), yA2 = Y(ATT + 4.2);
    W.setColor(CREAM2); fbox(W, f, aA, aB, Y(ATT), yA1, -5.5, -0.15, 1 | 2 | 4 | 8);
    D.setColor('#b9b2a2'); fbox(D, f, aA - 0.08, aB + 0.08, yA1, yA1 + 0.14, -5.6, -0.05, 63);
    W.setColor(CREAM2); fbox(W, f, cA, cB, yA1, yA2, -4.5, -0.15, 1 | 2 | 4 | 8);
    D.setColor('#d6cbb1'); fbox(D, f, cA - 0.35, cB + 0.35, yA2 - 0.5, yA2, -4.8, 0.2, 63);
    D.setColor('#b9b2a2'); D.fill([P(f, aA, 0, -5.5), P(f, aB, 0, -5.5), P(f, aB, 0, -0.15), P(f, aA, 0, -0.15)].map((p) => [p[0], p[2]]), [], yA1 + 0.14, true);
    fprism(S, f, aA, aB, -5.5, -0.15, Y(ATT), yA1 + 0.14); fprism(S, f, cA, cB, -4.8, 0.2, yA1, yA2);
    { // the cartouche: a stone plate with scrolled cheeks, the trident in a wreath
      const [x0, , z0] = P(f, mid - 2.4, 0, 0.12), [x1, , z1] = P(f, mid + 2.4, 0, 0.12), y0 = Y(CORN - 0.2), y1 = y0 + 4.2;
      const E = B.arms, n = f.N;
      const v = [E.vert(x0, y0, z0, ...n, 0, 0), E.vert(x1, y0, z1, ...n, 1, 0), E.vert(x1, y1, z1, ...n, 1, 1), E.vert(x0, y1, z0, ...n, 0, 1)];
      E.quad(v[0], v[1], v[2], v[3]);
      D.setColor('#b4b3ad'); fbox(D, f, mid - 2.6, mid + 2.6, y0 - 0.15, y1 + 0.15, -0.15, 0.1, 4 | 8 | 16 | 32 | 1);
      for (const sg of [-1, 1]) fbox(D, f, mid + sg * 2.6 - 0.35, mid + sg * 2.6 + 0.35, y0 + 0.4, y1 - 0.3, -0.1, 0.3, 63);
    }
    { // the finial: an octagonal plate with the trident on a pedestal, the flagpole through it
      const [x, , z] = P(f, mid, 0, -2.2), yb = yA2;
      D.setColor('#a9aaa5'); D.box(x - 0.8, yb, z - 0.8, x + 0.8, yb + 0.7, z + 0.8);
      D.setColor('#9d9e99'); D.box(x - 0.5, yb + 0.7, z - 0.5, x + 0.5, yb + 1.0, z + 0.5);
      const oct = Array.from({ length: 8 }, (_, k) => { const a = (k + 0.5) * TAU / 8; return [0.62 * Math.cos(a), 0.95 * Math.sin(a)]; });
      const yc = yb + 1.95, E = B.arms;
      for (const sg of [-1, 1]) { // both faces carry the trident (from the square and from the courtyard)
        const pts = oct.map(([u, v]) => P(f, mid + u * sg, yc + v, -2.2 + sg * 0.2));
        const ids = pts.map((p, k) => E.vert(p[0], p[1], p[2], f.nx * sg, 0, f.nz * sg, 0.5 + oct[k][0] / 1.3, 0.5 + oct[k][1] / 2.0));
        for (let k = 1; k + 1 < 8; k++) E.tri(ids[0], ids[k], ids[k + 1]);
      }
      D.setColor('#8e8f8a');
      for (let k = 0; k < 8; k++) { const [u0, v0] = oct[k], [u1, v1] = oct[(k + 1) % 8]; D.face([P(f, mid + u0, yc + v0, -2.4), P(f, mid + u1, yc + v1, -2.4), P(f, mid + u1, yc + v1, -2.0), P(f, mid + u0, yc + v0, -2.0)]); }
      D.setColor('#6e716f'); D.cyl(x, yc + 0.95, z, 0.09, 0.06, 6.5, 8); D.ellipsoid([x, yc + 7.5, z], [0.12, 0.12, 0.12], 8, 5);
      S.box(x - 0.8, yb, z - 0.8, x + 0.8, yc + 1.0, z + 0.8, 'equipment'); S.cyl(x, z, yc + 1.0, yc + 7.5, 0.1, 0.1, 'antenna');
      Z.add(x, yc + 7.6, z, 0, 1, 0, 'antenna');
      front.pole = [x, yc + 7.3, z];
    }
  }

  // ---- the end pavilions: rusticated tier with three windows, a loggia with two columns between blank piers
  for (const f of faces.filter((q) => q.type === 'pav')) {
    const c = f.w / 2, lA = c - 2.9, lB = c + 2.9, dep = 1.2;
    const cols = [c - 4.8, c, c + 4.8];
    const low = rowsHoles(f, cols, ROWS_LOW);
    plinth(f);
    B.rust.setColor(CREAM); wallHoles(B.rust, f, 0, f.w, yF, Y(LOW), low);
    W.setColor(CREAM); wq(W, f, 0, lA, Y(UP0), Y(CAP)); wq(W, f, lB, f.w, Y(UP0), Y(CAP));
    // the loggia: back wall with a window per storey (the top one round-headed), cheeks, a coffered soffit
    const back = { ...f, ox: f.ox - f.nx * dep, oz: f.oz - f.nz * dep };
    const hl = [[c - 0.8, c + 0.8, Y(UP0 + 0.9), Y(UP0 + 3.1)], [c - 0.8, c + 0.8, Y(UP0 + FU + 0.9), Y(UP0 + FU + 3.1)], [c - 0.8, c + 0.8, Y(UP0 + 2 * FU + 0.6), Y(UP0 + 2 * FU + 2.2)]];
    W.setColor('#d4c8ae'); wallHoles(W, back, lA, lB, Y(UP0), Y(CAP), [...hl.slice(0, 2), [c - 0.8, c + 0.8, hl[2][2], hl[2][3] + 0.8]]);
    { const R = 0.8, arc = []; for (let k = 0; k <= 10; k++) { const t = Math.PI * k / 10; arc.push([c + R * Math.cos(t), hl[2][3] + R * Math.sin(t)]); }
      W.face([P(back, c + 0.8, hl[2][3] + 0.8), ...arc.slice(0, 6).map(([u, v]) => P(back, u, v))], f.N);
      W.face([P(back, c - 0.8, hl[2][3] + 0.8), ...arc.slice(5).reverse().map(([u, v]) => P(back, u, v))], f.N); }
    for (const [a, b2, ya, yb] of hl) win(back, a, b2, ya, yb, true, yb === hl[2][3]);
    D.setColor('#cbbfa4'); reveal(D, f, lA, lB, Y(UP0), Y(CAP), -dep, 0);
    D.setColor('#d8ceb6'); for (let k = 1; k < 3; k++) fbox(D, f, lA, lB, Y(UP0 + k * FU) - 0.12, Y(UP0 + k * FU) + 0.12, -dep, -0.9, 1 | 16 | 32); // floor slabs with a balustrade line
    for (const s of [c - 1.75, c + 1.75]) column(D, f, s, Y(UP0), Y(CAP), 0.45, -0.45);
    for (const s of [lA - 1.4, lB + 1.4]) { // medallions with a star on the piers
      const y = Y(UP0 + FU * 1.6);
      D.setColor('#d3c7ac'); fbox(D, f, s - 0.6, s + 0.6, y - 0.6, y + 0.6, 0, 0.05, 1 | 4 | 8 | 16 | 32);
      D.setColor('#e6ddca');
      const star = Array.from({ length: 10 }, (_, k) => { const a = Math.PI / 2 + k * Math.PI / 5, rr = k & 1 ? 0.19 : 0.45; return P(f, s + rr * Math.cos(a), y + rr * Math.sin(a), 0.1); });
      D.face([P(f, s, y, 0.1), ...star, star[0]], f.N);
    }
    crown(f);
    for (const h of low) win(f, h[0], h[1], h[2], h[3], true);
    const e0 = P(f, 0, 0, -0.3), e1 = P(f, f.w, 0, -0.3);
    Z.edge(e0[0], e0[2], e1[0], e1[2], Y(ATT), f.nx, f.nz);
  }

  // ---- roof
  D.setColor('#6d6c69'); D.fill(outer, [hole], Y(CORN) + 0.05, true);
  D.setColor('#8b8a86');
  for (const [x, z] of [[bb.x0 + 9, bb.z0 + 7], [bb.x0 + 9, bb.z1 - 7], [bb.x1 - 24, cz], [bb.x0 + 8, cz + 22]]) {
    D.box(x - 1.3, Y(CORN), z - 1.3, x + 1.3, Y(CORN) + 2.3, z + 1.3); S.box(x - 1.3, Y(CORN), z - 1.3, x + 1.3, Y(CORN) + 2.3, z + 1.3, 'equipment');
  }

  // ---- collision: the block over the passages, and below them the two halves with the passages cut out
  S.prism(outer.flat(), yG + PASS_H, Y(ATT), 0, 0, 'wall', 0, [hole.flat()]);
  const xc = (Math.max(...hole.map((p) => p[0])) + Math.min(...hole.map((p) => p[0]))) / 2 - 7;
  const Cs = halves(outer, hole, xc);
  for (const C of Cs) {
    let pieces = [C.flat()];
    for (const p of passes) {
      const za = p.z - PASS_W / 2, zb = p.z + PASS_W / 2, next = [];
      for (const q of pieces) {
        const lo = clipRing(q, { p: [0, za], n: [0, -1] }), hi = clipRing(q, { p: [0, zb], n: [0, 1] });
        const band = clipRing(clipRing(q, { p: [0, za], n: [0, 1] }), { p: [0, zb], n: [0, -1] });
        const bl = band.length ? clipRing(band, { p: [p.x0, 0], n: [-1, 0] }) : [], br = band.length ? clipRing(band, { p: [p.x1, 0], n: [1, 0] }) : [];
        for (const k of [lo, hi, bl, br]) if (k.length >= 6) next.push(k);
      }
      pieces = next;
    }
    for (const q of pieces) S.prism(q, gBase, yG + PASS_H, 0, 0, 'wall');
  }

  // ---- forecourt: flagpoles, five-globe lamps, blue spruces on the lawns
  const lampSpots = [], flags = [];
  const fx = (s, o) => P(front, s, 0, o);
  for (const [k, s] of [['ua', 1.3], ['eu', 2.35], ['obl', 3.4]]) { // three poles by the north-west end, as in the photo
    const [x, , z] = fx(s, 1.4), y = g(x, z);
    D.setColor('#c4c6c6'); D.cyl(x, y, z, 0.07, 0.045, 11, 8); D.ellipsoid([x, y + 11.05, z], [0.08, 0.08, 0.08], 8, 4);
    D.setColor('#555'); D.cyl(x, y, z, 0.16, 0.16, 0.35, 8);
    S.cyl(x, z, y, y + 11, 0.08, 0.08, 'pole');
    flags.push({ kind: k, at: [x, y + 10.9, z], w: 1.5, h: 1.0 });
  }
  if (front.pole) flags.push({ kind: 'ua', at: front.pole, w: 2.4, h: 1.6 });
  for (const [s, o] of [[5.7 * bw, 5.2], [13.3 * bw, 5.2], [-6, 8.5], [front.w + 6, 8.5], [2.5 * bw, 8.5], [16.5 * bw, 8.5]]) {
    const [x, , z] = fx(s, o), y = g(x, z);
    D.setColor('#9ea3a6'); D.cyl(x, y, z, 0.2, 0.2, 0.9, 10); D.cyl(x, y + 0.9, z, 0.11, 0.07, 4.6, 8);
    D.tube([x, y + 5.0, z - 0.75], [x, y + 5.0, z + 0.75], 0.04, 5); D.tube([x - 0.75, y + 5.0, z], [x + 0.75, y + 5.0, z], 0.04, 5);
    for (const [u, v, h] of [[0.75, 0, 5.3], [-0.75, 0, 5.3], [0, 0.75, 5.3], [0, -0.75, 5.3], [0, 0, 5.75]]) lampSpots.push([x + u, y + h, z + v]);
    S.cyl(x, z, y, y + 5.5, 0.14, 0.14, 'pole');
  }
  for (const [x, y, z] of lampSpots) { B.glow.setColor('#fbf6ea'); B.glow.ellipsoid([x, y, z], [0.24, 0.24, 0.24], 10, 6); }
  const spots = [], blue = [PARK_PINE[0].map(([rr, gg, bb2]) => [0.8 * rr, 0.95 * gg, 1.3 * bb2])];
  for (const [a, c] of [[-13, 5.4 * bw - 1.4], [13.6 * bw + 1.4, front.w + 13]]) {
    for (let s = a; s < c; s += 4.4) { const [x, , z] = fx(s + (r() - 0.5) * 0.6, 4.6); spots.push({ x, z, y: g(x, z), kind: 'conifer', variant: 'spruce', sc: 1.0 + 0.3 * r(), pal: blue, s3: [0.8, 1.1, 0.8] }); }
  }

  // ---- granite paving on the forecourt: the strip along the square, the stair apron, the walk by the wall
  const pave = { pos: [], uv: [], idx: [] };
  const paveRect = (za, zb, oa, ob, cell = 2.5) => { // in the front frame: s along the façade, o out to the square
    const ns = Math.max(1, Math.ceil((zb - za) / cell)), no = Math.max(1, Math.ceil((ob - oa) / cell)), base = pave.pos.length / 3;
    for (let j = 0; j <= no; j++) for (let i = 0; i <= ns; i++) {
      const [x, , z] = P(front, za + (zb - za) * i / ns, 0, oa + (ob - oa) * j / no);
      pave.pos.push(x, g(x, z) + 0.06, z); pave.uv.push(x / 6, z / 6);
    }
    for (let j = 0; j < no; j++) for (let i = 0; i < ns; i++) { const a = base + j * (ns + 1) + i, c = a + ns + 1; pave.idx.push(a, c, a + 1, a + 1, c, c + 1); }
  };
  const fs0 = sOf(front, bb.x0, bb.z0) - 3, fs1 = sOf(front, bb.x0, bb.z1) + 3;
  paveRect(fs0, fs1, 8.2, 14.5); paveRect(5.4 * bw, 13.6 * bw, 0, 8.2); paveRect(fs0, 5.4 * bw, 0, 2.2); paveRect(13.6 * bw, fs1, 0, 2.2);

  // ---- meshes
  const group = Object.assign(new THREE.Group(), { name: 'bilyidim' });
  root.add(group);
  const tile = tileTex(r), rust = rustTex(r), gran = graniteTex(r);
  tile.repeat.set(1 / 2.4, 1 / 2.4); rust.repeat.set(1 / 2.4, 1 / 2.4); gran.repeat.set(1 / 1.5, 1 / 1.5);
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: tile, vertexColors: true, roughness: 0.82 }),
    rust: new THREE.MeshStandardMaterial({ map: rust, vertexColors: true, roughness: 0.85 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    gran: new THREE.MeshStandardMaterial({ map: gran, vertexColors: true, roughness: 0.45 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.4, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffd9a0, emissiveIntensity: 0 }),
    glow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: 0xfff1d8, emissiveIntensity: 0 }),
    arms: new THREE.MeshStandardMaterial({ map: armsTex(), roughness: 0.8 }),
    clock: new THREE.MeshStandardMaterial({ map: clockTex(), roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0 }),
  };
  M.clock.emissiveMap = M.clock.map;
  const slabs = canvasTex(256, 256, (c, w) => { // 1 m granite slabs in greys and pinks, 6 m repeat
    const q = w / 6;
    c.fillStyle = '#6d6a67'; c.fillRect(0, 0, w, w);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { const v = 140 + r() * 30, pk = (i + j) % 5 === 0 ? 18 : 0; c.fillStyle = `rgb(${(v + pk) | 0},${(v - 2) | 0},${(v - 4 - pk * 0.3) | 0})`; c.fillRect(i * q + 1, j * q + 1, q - 2, q - 2); }
  });
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pave.pos, 3));
  pg.setAttribute('uv', new THREE.Float32BufferAttribute(pave.uv, 2));
  pg.setIndex(pave.idx); pg.computeVertexNormals();
  group.add(Object.assign(new THREE.Mesh(pg, decal(new THREE.MeshStandardMaterial({ map: slabs, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }))), { name: 'bilyidim-pave', receiveShadow: true }));
  let nV = 0;
  for (const [k, Bk] of Object.entries(B)) {
    if (!Bk.v) continue;
    nV += Bk.v;
    const glassy = k === 'glass' || k === 'lit' || k === 'glow';
    group.add(Object.assign(new THREE.Mesh(Bk.build(), M[k]), { name: 'bilyidim-' + k, castShadow: !glassy, receiveShadow: true }));
  }

  // clock hands (turned about the face normal), the flags (a cloth grid rippled on the CPU, no allocations per frame)
  const hands = [];
  {
    const f = front, s = 9.5 * bw, [x, y, z] = P(f, s, Y(5.0) - 0.15, 1.3 + 0.2);
    const pivot = new THREE.Group(); pivot.position.set(x, y, z); pivot.rotation.y = Math.atan2(f.nx, f.nz); group.add(pivot);
    const hm = new THREE.MeshStandardMaterial({ color: 0x1d1a17, roughness: 0.5 });
    for (const [len, wd] of [[0.34, 0.05], [0.5, 0.035]]) {
      const geo = new THREE.BoxGeometry(wd, len, 0.02); geo.translate(0, len / 2 - 0.06, 0);
      const h = new THREE.Mesh(geo, hm); pivot.add(h); hands.push(h);
    }
  }
  const tzMs = new Date().getTimezoneOffset() * 60000;
  const cloth = [], wind = Math.atan2(0.35, 1); // flags stream towards the south-east
  for (const q of flags) {
    const geo = new THREE.PlaneGeometry(q.w, q.h, 10, 4); geo.translate(q.w / 2, -q.h / 2, 0);
    const mat = new THREE.MeshStandardMaterial({ map: flagTex(q.kind), roughness: 0.8, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat); m.position.set(...q.at); m.rotation.y = -Math.PI / 2 + wind; m.castShadow = true; group.add(m);
    cloth.push({ pos: geo.attributes.position, base: Float32Array.from(geo.attributes.position.array), w: q.w, ph: r() * 6 });
  }
  console.log(`[cherkasy] Bilyi dim: ${faces.length} façades, ${nWin} windows, ${passes.length} passages, ${(nV / 1000).toFixed(1)}k verts, ${S.count - s0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const fp = Cs.map((poly, i) => ({ poly, h: ATT + PL, kind: 'public', ...(i ? {} : { name: NAME }) }));
  const f0 = front.ox;
  let time = 0, acc = 0;
  return {
    footprints: fp.length ? fp : [{ poly: outer, h: ATT + PL, kind: 'public', name: NAME }],
    spots,
    // no generated trees on the forecourt strip in front of the façade (the spruces there are ours)
    clear: (x, z) => x > f0 - 12 && x < f0 + 1 && z > bb.z0 - 3 && z < bb.z1 + 3,
    update(dt) {
      time += dt; acc += dt;
      const k = nightK.value;
      const e = Math.min(1, 2.5 * k); M.lit.emissiveIntensity = 1.3 * e; M.glow.emissiveIntensity = 0.15 + 2.2 * e; M.clock.emissiveIntensity = 0.45 * e;
      if (acc < 1 / 30) return; acc = 0;
      const t = ((Date.now() - tzMs) / 1000) % 43200;
      hands[0].rotation.z = -t / 43200 * TAU; hands[1].rotation.z = -(t % 3600) / 3600 * TAU;
      for (const c of cloth) {
        const a = c.pos.array, B0 = c.base;
        for (let i = 0; i < a.length; i += 3) {
          const u = B0[i] / c.w;
          a[i + 2] = Math.sin(B0[i] * 2.4 - time * 5.5 + c.ph + B0[i + 1] * 0.6) * 0.16 * u;
          a[i + 1] = B0[i + 1] - 0.08 * u * u;
        }
        c.pos.needsUpdate = true;
      }
    },
  };
}

// a fluted engaged column in the face frame at s, standing proud by `o` (centre offset): square plinth, torus, a
// shaft of 20 flutes with a slight taper, echinus and abacus
function column(D, f, s, y0, y1, R, o) {
  const [x, , z] = P(f, s, 0, o), hB = 0.55, hC = 0.75, ya = y0 + hB, yb = y1 - hC, N = 40;
  D.setColor('#d9ceb6'); D.box(x - R * 1.25, y0, z - R * 1.25, x + R * 1.25, y0 + 0.28, z + R * 1.25);
  D.setColor('#e2d8c3'); D.lathe([[R * 1.12, y0 + 0.28], [R * 1.14, y0 + 0.4], [R * 1.02, y0 + 0.5], [R, ya]], 20, x, z);
  D.setColor('#e4dbc8');
  for (let k = 0; k < N; k++) { // a star profile, flat-shaded: the ridges and grooves read as flutes
    const a0 = k / N * TAU, a1 = (k + 1) / N * TAU, r0 = k & 1 ? 0.93 : 1, r1 = k & 1 ? 1 : 0.93;
    const p = (a, rin, y, t) => { const rr = R * rin * (1 - 0.1 * t); return [x + Math.cos(a) * rr, y, z + Math.sin(a) * rr]; };
    const q0 = p(a0, r0, ya, 0), q1 = p(a1, r1, ya, 0), am = (a0 + a1) / 2;
    let nx = q1[2] - q0[2], nz = q0[0] - q1[0];
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    if (nx * Math.cos(am) + nz * Math.sin(am) < 0) { nx = -nx; nz = -nz; }
    D.face([q0, p(a0, r0, yb, 1), p(a1, r1, yb, 1), q1], [nx, 0.05, nz]);
  }
  D.setColor('#ddd2bb'); D.lathe([[R * 0.9, yb], [R * 0.92, yb + 0.12], [R * 1.1, yb + 0.35], [R * 1.18, yb + 0.45]], 20, x, z);
  D.box(x - R * 1.3, yb + 0.45, z - R * 1.3, x + R * 1.3, y1, z + R * 1.3);
}
