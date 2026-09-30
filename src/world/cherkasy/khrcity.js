// OWNER: cherkasy. ТРЦ «Хрещатик-Сіті», вулиця Остафія Дашковича, 19 (OSM relation 6287196, tagged min_height 5, so
// the generic extrusion floated 5 m over the ground). Rebuilt after the novobudovy.com and cherkasu.com photos and the
// satellite view: a two-storey horseshoe of shops round an open paved courtyard that opens to the car park in the
// south-east. Cream render with white pilasters over a brown granite plinth, shop windows and upper window bands in
// bronze frames, a deep band of silver composite panels along the top. The main entrance is the corner front at
// Khreshchatyk / Dashkovycha: a silver barrel-vault hood on two round columns over a glazed lunette with the gold
// «Хрещатик сіті» lettering, and under it a passage on square pillars through the building into the courtyard. Four
// square towers with dark glass pyramid roofs stand at the corners of the street fronts; the two at the corner front
// have their arched door hoods and the red «Західний портал» / «Південний портал» names. Round the courtyard the ground
// floor is glazed shopfront under a first-floor gallery on columns (glass railing, two open stairs), with the three
// octagonal atrium pavilions (glass drums under glass pyramids, OSM 422818576, 256472701, 422818575) set into the
// wings; pavers with a ring pattern, round timber benches round lamp posts. Windows, lettering and pavilions light up
// at night.
//   KHRCITY_SKIP: the OSM ids replaced here (buildings.js skips them)
//   shapeKhrCity(hf, map) -> level | null   levels the lot and the courtyard (before the ground is built)
//   buildKhrCity({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per ring edge in an edge frame (s along the edge, y up, o outward). Each face keeps `cuts`: the
// stretches taken by the towers, the passage and the arch block (covers) and its openings; the render, plinth, band
// and parapet are laid round them.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex, decal } from './sculpt.js';
import { ringPts, rng, area2, hull, centroid, inPoly } from './geo.js';

const OSM_ID = 6287196, PAV_IDS = [422818576, 256472701, 422818575];
export const KHRCITY_SKIP = new Set([OSM_ID, ...PAV_IDS]);

// heights over the floor: gallery deck, band, parapet top, tower walls, tower pyramid, arch spring, pavilion eave / apex
const G1 = 4.6, BAND = 8.75, TOP = 10.0, TT = 13.4, PYR = 2.9, YS = 9.0, PAV_E = 4.75, PAV_TOP = 8.6;
const R_IN = 4.05, R_OUT = 4.35, HOOD = 1.2, DECK = 2.6;   // arch radii and hood overhang; gallery depth
// map points of the OSM ring: the corner front's ends, the leg ends that close the courtyard, the courtyard centre
const CH_A = [204.1, 231.7], CH_B = [221.7, 214.7], LEG_NE = [273.3, 288.2], LEG_SW = [207.8, 288.1], RING_C = [242.5, 263.8];
// towers [x0, z0, x1, z1], the face with the door and its red name (atlas cell)
const TOWERS = [
  { r: [197.2, 231.4, 204.6, 238.8], door: 'n', sign: 2 }, // south end of the corner front
  { r: [224.3, 207.9, 231.3, 214.9], door: 'w', sign: 1 }, // north end of it, on Dashkovycha
  { r: [261.3, 207.9, 268.3, 214.9], door: 'n' },
  { r: [197.2, 282.4, 204.2, 289.6], door: 'w' },
];
const CREAM = '#eadcc0', WHITE = '#f4f2ec', GRANITE = '#6a4b40', BRONZE = '#5d4631', SILVER = '#c4c8ca', STEEL = '#aeb3b5';
const SHOP = ['#4f5c5d', '#58625f', '#4a575b', '#5d6865'], UPPER = ['#665640', '#6e5d46', '#5c4e3d'];
const UP = [0, 1, 0], DN = [0, -1, 0];

// ------------------------------------------------------------------------------------------------ textures
const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${a})`;
// render speckle, 2.5 m per repeat
const renderTex = (r) => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#f1efea'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? rgba(255, 255, 255, 0.3) : rgba(90, 75, 60, 0.05); g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
});
// one silver composite cassette 1.5 x 1.25 m: dark open joints, a lit top edge, a faint vertical sheen
const panelTex = () => canvasTex(128, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, '#e6e9ea'); gr.addColorStop(0.5, '#f7f8f8'); gr.addColorStop(1, '#dfe2e3');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#6d7275'; g.fillRect(0, 0, 3, h); g.fillRect(0, h - 3, w, 3);
  g.fillStyle = rgba(255, 255, 255, 0.6); g.fillRect(3, 0, w - 3, 2);
});
// concrete pavers 0.3 x 0.3 m, 16 x 16 per 4.8 m repeat, beige-grey a shade apart
const paveTex = (r) => canvasTex(512, 512, (g, w) => {
  const p = w / 16;
  g.fillStyle = '#7d776d'; g.fillRect(0, 0, w, w);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
    const v = 176 + r() * 22, t = r() < 0.12 ? -18 : 0;
    g.fillStyle = `rgb(${(v + t) | 0},${(v - 5 + t) | 0},${(v - 14 + t) | 0})`; g.fillRect(i * p + 1.5, j * p + 1.5, p - 3, p - 3);
  }
});
// lettering atlas 2048 x 1152, transparent: row 0 (640 px) the mall's name on the arch glass in gold, row 1 (512 px)
// the red portal names; the quads keep each cell's aspect
const SIGN = { name: [0, 0, 1, 640 / 1152], 1: [0, 640 / 1152, 0.5, 1], 2: [0.5, 640 / 1152, 1, 1] };
const signTex = () => canvasTex(2048, 1152, (g) => {
  g.clearRect(0, 0, 2048, 1152);
  const gold = (t, x, y, font) => {
    g.font = font; g.lineJoin = 'round';
    g.strokeStyle = '#4a3512'; g.lineWidth = 10; g.strokeText(t, x, y);
    g.fillStyle = '#d9b24c'; g.fillText(t, x, y);
  };
  g.textBaseline = 'alphabetic';
  gold('Х', 40, 470, 'italic bold 470px Georgia, "Times New Roman", serif');
  gold('рещатик', 400, 470, 'italic bold 300px Georgia, "Times New Roman", serif');
  gold('СІТІ', 1560, 185, 'bold 150px Georgia, "Times New Roman", serif');
  g.textAlign = 'center'; gold('торгівельно-розважальний центр', 1200, 590, 'italic 76px Georgia, "Times New Roman", serif');
  for (const [k, t] of [[0, 'Західний'], [1, 'Південний']]) {
    const x = 512 + k * 1024;
    g.font = 'italic bold 180px Georgia, "Times New Roman", serif'; g.fillStyle = '#c0222c'; g.fillText(t, x, 850, 980);
    g.font = 'italic bold 140px Georgia, "Times New Roman", serif'; g.fillText('портал', x, 1050);
  }
}, { repeat: false, aniso: 16 });

// ------------------------------------------------------------------------------------------------ frames and faces
// face over a -> b with the outward normal (nx, nz)
const frame = (a, b, nx, nz) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1e-6;
  return { ax: a[0], az: a[1], ux: dx / L, uz: dz / L, nx, nz, L, cuts: [] };
};
const pt = (f, s, y, o = 0) => [f.ax + f.ux * s + f.nx * o, y, f.az + f.uz * s + f.nz * o];
const neg = (v) => v.map((q) => -q), dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
// normal of the corner a -> b, a -> d (unnormalised)
const turn = (a, b, d) => {
  const [px, py, pz] = b.map((q, k) => q - a[k]), [qx, qy, qz] = d.map((q, k) => q - a[k]);
  return [py * qz - pz * qy, pz * qx - px * qz, px * qy - py * qx];
};
// quad a b c d whose front looks along n (the winding follows n)
function q4(D, a, b, c, d, n, uv) {
  const side = dot(n, turn(a, b, d)), i = D.v;
  [a, b, c, d].forEach((p, k) => D.vert(p[0], p[1], p[2], n[0], n[1], n[2], uv ? uv[k][0] : 0, uv ? uv[k][1] : 0));
  if (side >= 0) D.quad(i, i + 1, i + 2, i + 3); else D.quad(i, i + 3, i + 2, i + 1);
}
// rectangle on the face plane at offset o; uvM = [metres along, metres up, y of v = 0]
const panel = (D, f, s0, s1, y0, y1, o = 0, n = [f.nx, 0, f.nz], uvM) => q4(D, pt(f, s0, y0, o), pt(f, s1, y0, o), pt(f, s1, y1, o), pt(f, s0, y1, o), n,
  uvM && [[s0 / uvM[0], (y0 - uvM[2]) / uvM[1]], [s1 / uvM[0], (y0 - uvM[2]) / uvM[1]], [s1 / uvM[0], (y1 - uvM[2]) / uvM[1]], [s0 / uvM[0], (y1 - uvM[2]) / uvM[1]]]);
// box in a face frame; faces 'f' out, 'b' back, 'l' s0 end, 'r' s1 end, 't' top, 'u' underside
function fbox(D, f, s0, s1, y0, y1, o0, o1, faces = 'fblrtu', uvM) {
  const N = [f.nx, 0, f.nz], U = [f.ux, 0, f.uz], p = (s, y, o) => pt(f, s, y, o);
  for (const c of faces) {
    if (c === 'f') panel(D, f, s0, s1, y0, y1, o1, N, uvM);
    else if (c === 'b') panel(D, f, s0, s1, y0, y1, o0, neg(N));
    else if (c === 'l') q4(D, p(s0, y0, o0), p(s0, y0, o1), p(s0, y1, o1), p(s0, y1, o0), neg(U));
    else if (c === 'r') q4(D, p(s1, y0, o0), p(s1, y0, o1), p(s1, y1, o1), p(s1, y1, o0), U);
    else if (c === 't') q4(D, p(s0, y1, o0), p(s1, y1, o0), p(s1, y1, o1), p(s0, y1, o1), UP);
    else if (c === 'u') q4(D, p(s0, y0, o0), p(s1, y0, o0), p(s1, y0, o1), p(s0, y0, o1), DN);
  }
}
// atlas rectangle [u0, v0, u1, v1] (canvas fractions, v down) on a face, read left to right from outside
function decalQ(D, f, s0, s1, y0, y1, o, [u0, v0, u1, v1]) {
  const flip = f.ux * f.nz - f.uz * f.nx < 0; // u runs to the viewer's left
  const [a, b] = flip ? [u1, u0] : [u0, u1];
  panel(D, f, s0, s1, y0, y1, o, [f.nx, 0, f.nz], null);
  const n = D.v, buf = D.buf.a; // patch the four uvs just written (corner order s0y0, s1y0, s1y1, s0y1)
  [[a, 1 - v1], [b, 1 - v1], [b, 1 - v0], [a, 1 - v0]].forEach(([u, v], k) => { const q = (n - 4 + k) * 11; buf[q + 6] = u; buf[q + 7] = v; });
}
// free s-intervals of a face between y0 and y1 (cuts removed)
function freeAt(f, y0, y1, only) {
  const out = []; let s = 0;
  for (const c of f.cuts) {
    if (only && !only(c)) continue;
    if (c.y0 < y1 - 1e-3 && c.y1 > y0 + 1e-3) { if (c.s0 > s + 1e-3) out.push([s, c.s0]); s = Math.max(s, c.s1); }
  }
  if (s < f.L - 1e-3) out.push([s, f.L]);
  return out;
}
const sortCuts = (f) => f.cuts.sort((p, q) => p.s0 - q.s0);
// wall surface y0..y1 round the cuts
function wall(D, f, y0, y1, col, uvM) {
  const ys = [y0, y1];
  for (const c of f.cuts) { if (c.y0 > y0 && c.y0 < y1) ys.push(c.y0); if (c.y1 > y0 && c.y1 < y1) ys.push(c.y1); }
  ys.sort((a, b) => a - b);
  D.setColor(col);
  for (let i = 0; i + 1 < ys.length; i++) {
    if (ys[i + 1] - ys[i] < 1e-3) continue;
    for (const [s0, s1] of freeAt(f, ys[i], ys[i + 1])) panel(D, f, s0, s1, ys[i], ys[i + 1], 0, undefined, uvM);
  }
}
// opening q: { s0, s1, y0, y1, glass, frame, pitch (mullions), tr (transom y, 0 = none), dep, sill }
function opening(B, f, q, rev = WHITE) {
  const D = B.det, { s0, s1, y0, y1 } = q, d = q.dep ?? 0.2, g = -d + 0.05;
  D.setColor(rev);
  q4(D, pt(f, s0, y0), pt(f, s0, y0, -d), pt(f, s0, y1, -d), pt(f, s0, y1), [f.ux, 0, f.uz]);
  q4(D, pt(f, s1, y0), pt(f, s1, y0, -d), pt(f, s1, y1, -d), pt(f, s1, y1), [-f.ux, 0, -f.uz]);
  q4(D, pt(f, s0, y1), pt(f, s1, y1), pt(f, s1, y1, -d), pt(f, s0, y1, -d), DN);
  q4(D, pt(f, s0, y0), pt(f, s1, y0), pt(f, s1, y0, -d), pt(f, s0, y0, -d), UP);
  const G = q.dark ? B.glass : B.lit;
  G.setColor(q.glass); panel(G, f, s0, s1, y0, y1, g);
  D.setColor(q.frame);
  const o = g + 0.03, bar = (a, b) => panel(D, f, a, b, y0, y1, o), rail = (y, t = 0.05) => panel(D, f, s0, s1, y - t, y + t, o);
  bar(s0, s0 + 0.08); bar(s1 - 0.08, s1); rail(y0 + 0.05); rail(y1 - 0.05);
  const n = Math.max(1, Math.round((s1 - s0) / (q.pitch ?? 1.5)));
  for (let i = 1; i < n; i++) { const m = s0 + (s1 - s0) * i / n; bar(m - 0.04, m + 0.04); }
  if (q.tr) rail(q.tr);
  if (q.sill) { D.setColor(WHITE); fbox(D, f, s0 - 0.05, s1 + 0.05, y0 - 0.07, y0, 0, 0.08, 'ftu'); }
}
// Liang–Barsky: the part [t0, t1] of segment a -> b inside the half-planes hx x + hz z <= hd
function clip(a, b, H) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dz = b[1] - a[1];
  for (const [hx, hz, hd] of H) {
    const pa = hx * a[0] + hz * a[1] - hd, dp = hx * dx + hz * dz;
    if (Math.abs(dp) < 1e-9) { if (pa > 0) return null; continue; }
    const t = -pa / dp;
    if (dp > 0) t1 = Math.min(t1, t); else t0 = Math.max(t0, t);
    if (t0 >= t1 - 1e-6) return null;
  }
  return [t0, t1];
}
const rectH = ([x0, z0, x1, z1], e = 0.04) => [[1, 0, x1 + e], [-1, 0, -(x0 - e)], [0, 1, z1 + e], [0, -1, -(z0 - e)]];
// half-planes of s in [s0, s1], o in [o0, o1] of a face frame
function frameH(f, s0, s1, o0, o1) {
  const ua = f.ux * f.ax + f.uz * f.az, na = f.nx * f.ax + f.nz * f.az;
  return [[f.ux, f.uz, ua + s1], [-f.ux, -f.uz, -(ua + s0)], [f.nx, f.nz, na + o1], [-f.nx, -f.nz, -(na + o0)]];
}
const frameQuad = (f, s0, s1, o0, o1) => [[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; });
// first crossing of the ray p + t d with the ring after t = 0.3: { t, k (edge index), p }
function rayHit(ring, p, d) {
  let best = null;
  ring.forEach((a, k) => {
    const b = ring[(k + 1) % ring.length], ex = b[0] - a[0], ez = b[1] - a[1], den = d[0] * ez - d[1] * ex;
    if (Math.abs(den) < 1e-9) return;
    const wx = a[0] - p[0], wz = a[1] - p[1], t = (wx * ez - wz * ex) / den, u = (wx * d[1] - wz * d[0]) / den;
    if (t > 0.3 && u >= 0 && u <= 1 && (!best || t < best.t)) best = { t, k, p: [p[0] + d[0] * t, p[1] + d[1] * t] };
  });
  return best;
}
// segmental arch band over s c +- hw from y0 (rise at the crown), `thick` deep in y, standing out `dep` from the wall
function arcBand(D, f, c, hw, y0, rise, thick, dep) {
  const R = (hw * hw + rise * rise) / (2 * rise), yc = y0 + rise - R, N = 10;
  const at = (i) => { const s = c - hw + (2 * hw * i) / N; return [s, yc + Math.sqrt(Math.max(0, R * R - (s - c) ** 2))]; };
  for (let i = 0; i < N; i++) {
    const [sa, ya] = at(i), [sb, yb] = at(i + 1);
    q4(D, pt(f, sa, ya, dep), pt(f, sb, yb, dep), pt(f, sb, yb + thick, dep), pt(f, sa, ya + thick, dep), [f.nx, 0, f.nz]);
    const nu = [(ya - yb) * f.ux, sb - sa, (ya - yb) * f.uz], l = Math.hypot(...nu);
    q4(D, pt(f, sa, ya + thick, 0), pt(f, sb, yb + thick, 0), pt(f, sb, yb + thick, dep), pt(f, sa, ya + thick, dep), nu.map((v) => v / l));
    q4(D, pt(f, sa, ya, 0), pt(f, sb, yb, 0), pt(f, sb, yb, dep), pt(f, sa, ya, dep), nu.map((v) => -v / l));
  }
  for (const [s, y, n] of [[c - hw, at(0)[1], [-f.ux, 0, -f.uz]], [c + hw, at(N)[1], [f.ux, 0, f.uz]]]) q4(D, pt(f, s, y, 0), pt(f, s, y, dep), pt(f, s, y + thick, dep), pt(f, s, y + thick, 0), n);
}
// face through three points with its normal pointing away from `away`
function tri(D, a, b, c, away) {
  const t = turn(a, b, c), len = Math.hypot(...t) || 1, mid = [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3 - away[k]);
  D.face([a, b, c], t.map((q) => (dot(t, mid) < 0 ? -q : q) / len));
}
// glass pyramid over the eave outline E (points at eave height) up to the apex: panes, hip ribs, a purlin, a finial
function pyramid(B, E, apex, below) {
  E.forEach((a, i) => tri(B.dome, a, E[(i + 1) % E.length], apex, below));
  B.det.setColor(SILVER);
  E.forEach((a, i) => {
    B.det.tube(a, apex, 0.06, 4);
    const b = E[(i + 1) % E.length], mix = (p, k) => p.map((v, j) => v + (apex[j] - v) * k);
    B.det.tube(a, b, 0.05, 4); B.det.tube(mix(a, 0.45), mix(b, 0.45), 0.04, 4);
  });
  B.det.cyl(apex[0], apex[1] - 0.05, apex[2], 0.16, 0.03, 0.45, 6);
}

// ------------------------------------------------------------------------------------------------ terrain hook
let LATTICE = null; // the height field's lattice, for the pavers (set by the terrain hook, which runs first)
export function shapeKhrCity(hf, map) {
  const b = map.buildings?.find((q) => q.id === OSM_ID);
  LATTICE = { cell: hf.cell, x0: hf.x0, z0: hf.z0 };
  return b ? hf.pad(hull(ringPts(b.p)), 10) : null; // the courtyard is level; the streets either side keep their grade
}
// the highest the ground's draped layers can lie at (x, z): they are flat pieces inside each lattice cell, so between
// the cell's two diagonal splits, not on the bilinear surface (a twisted cell at the edge of the level lot parts
// them by up to 0.3 m)
function groundTop(heightAt, x, z) {
  const h = heightAt(x, z);
  if (!LATTICE) return h + 0.15;
  const { cell: C, x0, z0 } = LATTICE, i = Math.floor((x - x0) / C), j = Math.floor((z - z0) / C), s = (x - x0) / C - i, t = (z - z0) / C - j;
  const X = x0 + i * C, Z0 = z0 + j * C, a = heightAt(X, Z0), b = heightAt(X + C, Z0), c = heightAt(X, Z0 + C), d = heightAt(X + C, Z0 + C);
  const p1 = s > t ? a + s * (b - a) + t * (d - b) : a + t * (c - a) + s * (d - c);
  const p2 = s + t < 1 ? a + s * (b - a) + t * (c - a) : d + (1 - s) * (c - d) + (1 - t) * (b - d);
  return Math.max(h, p1, p2);
}

// ------------------------------------------------------------------------------------------------ build
export function buildKhrCity({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const ring = ringPts(bld.p), n = ring.length, sg = area2(ring) > 0 ? 1 : -1;
  const near = (p) => ring.reduce((bi, q, i) => (Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(ring[bi][0] - p[0], ring[bi][1] - p[1]) ? i : bi), 0);
  const iA = near(CH_A), iB = near(CH_B), iNE = near(LEG_NE), iSW = near(LEG_SW);
  if ((iA + 1) % n !== iB) throw new Error('Khreshchatyk City: the corner front is not where it was');
  const edgeF = (k) => { const a = ring[k], b = ring[(k + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return frame(a, b, sg * (b[1] - a[1]) / L, -sg * (b[0] - a[0]) / L); };
  const inner = (k) => (k - iNE + n) % n < (iSW - iNE + n) % n; // the courtyard side, leg end to leg end

  // pavers just over the ground's top layer (the walks at +0.19), shop floors one step up; the lot's west corner stays
  // higher (the 16 m terrain lattice), so the floor meets the forecourt there
  const pave = (x, z) => groundTop(heightAt, x, z) + 0.23, yP = pave(RING_C[0], RING_C[1]), yF = yP + 0.3;
  let gLo = Infinity;
  for (const p of ring) gLo = Math.min(gLo, heightAt(p[0], p[1]));
  const gB = Math.min(gLo, yP) - 0.6, Y = (h) => yF + h;

  const B = { wall: new MB(), band: new MB(), det: new MB(), lit: new MB(), glass: new MB(), dome: new MB(), rail: new MB(), pave: new MB(), sign: new MB() };
  const D = B.det, RND = [2.5, 2.5, 0], BANDUV = [1.5, 1.25, Y(BAND)];
  let nOpen = 0;

  // ---- the corner front and its arch block: the passage runs the block's depth from the front to the courtyard
  const fc = edgeF(iA), c = fc.L / 2, back = [-fc.nx, -fc.nz];
  const hitAt = (s) => rayHit(ring, [pt(fc, s, 0)[0], pt(fc, s, 0)[2]], back);
  const hL = hitAt(c - R_IN), hR = hitAt(c + R_IN);
  const DC = Math.max(hL.t, hR.t, hitAt(c - R_OUT).t, hitAt(c + R_OUT).t) + 0.1;
  const passH = frameH(fc, c - R_IN, c + R_IN, -DC - 0.5, 0.6), blockH = frameH(fc, c - R_OUT, c + R_OUT, -DC - 0.02, 0.6);
  const pavs = PAV_IDS.map((id) => map.buildings.find((q) => q.id === id)).filter(Boolean).map((q) => {
    const P = ringPts(q.p), C = centroid(P);
    return { P, C, R: Math.max(...P.map((p) => Math.hypot(p[0] - C[0], p[1] - C[1]))), id: q.id };
  });
  const nearPav = (x, z, pad) => pavs.some((v) => Math.hypot(x - v.C[0], z - v.C[1]) < v.R + pad);

  // ---- ring walls: covers, openings, render, plinth, string course, band, parapet
  const faces = [];
  for (let k = 0; k < n; k++) {
    const f = edgeF(k);
    if (f.L < 0.05) continue;
    f.k = k; f.in = inner(k);
    const a = ring[k], b = ring[(k + 1) % n];
    const cover = (H, y0, y1) => { const t = clip(a, b, H); if (t) f.cuts.push({ s0: t[0] * f.L < 0.2 ? 0 : t[0] * f.L, s1: t[1] * f.L > f.L - 0.2 ? f.L : t[1] * f.L, y0, y1, cover: true }); };
    for (const T of TOWERS) cover(rectH(T.r), gB - 1, Y(TOP) + 1);
    cover(passH, gB - 1, Y(G1));
    cover(blockH, Y(G1), Y(TOP) + 1);
    sortCuts(f);
    faces.push(f);
  }
  const coversOnly = (c) => c.cover;
  const free = (f, y0, y1) => freeAt(f, y0, y1, coversOnly);
  for (const f of faces) {
    const add = (q) => { if (!f.cuts.some((c) => c.cover && q.s0 < c.s1 + 0.1 && q.s1 > c.s0 - 0.1 && q.y0 < c.y1 && q.y1 > c.y0)) { f.cuts.push(q); nOpen++; } };
    if (f.in) { // courtyard: shop units of glazing on both floors, a render pier between units every ~5 m
      const units = (y0, y1, tr) => { for (const [s0, s1] of free(f, y0 + 0.05, y1)) {
        if (s1 - s0 < 1.2) continue;
        const nu = Math.ceil((s1 - s0) / 5.6), w = (s1 - s0) / nu;
        for (let i = 0; i < nu; i++) add({ s0: s0 + i * w + 0.25, s1: s0 + (i + 1) * w - 0.25, y0, y1, glass: SHOP[(r() * 4) | 0], frame: STEEL, pitch: 1.6, tr, dep: 0.12, dark: y0 > Y(1) && r() < 0.3 });
      } };
      units(Y(0.05), Y(3.7), Y(2.8)); units(Y(G1 + 0.15), Y(G1 + 3.3), Y(G1 + 2.4));
    } else if (f.L > 3) { // street fronts: bays between pilasters, a shop window or a door below, a window band above
      for (const [s0, s1] of free(f, Y(0), Y(BAND))) {
        const L = s1 - s0;
        if (L < 3) continue;
        const nb = Math.max(1, Math.round(L / 6.2)), pitch = L / nb;
        f.pil = (f.pil || []).concat(Array.from({ length: nb + 1 }, (_, i) => s0 + i * pitch).filter((s) => s > 0.3 && s < f.L - 0.3));
        for (let i = 0; i < nb; i++) {
          const m = s0 + (i + 0.5) * pitch, w = Math.min(pitch - 1.3, 4.8) / 2;
          const dp = pt(f, m, 0, 1.2);
          if (r() < 0.22 && pave(dp[0], dp[2]) > yF - 0.12) add({ s0: m - Math.min(w, 1.6), s1: m + Math.min(w, 1.6), y0: Y(0.05), y1: Y(3.2), glass: SHOP[(r() * 4) | 0], frame: BRONZE, pitch: 1.1, tr: Y(2.5), door: true });
          else add({ s0: m - w, s1: m + w, y0: Y(0.6), y1: Y(3.6), glass: SHOP[(r() * 4) | 0], frame: BRONZE, pitch: 1.4, tr: Y(2.8), sill: true });
          add({ s0: m - w, s1: m + w, y0: Y(5.35), y1: Y(7.95), glass: UPPER[(r() * 3) | 0], frame: BRONZE, pitch: 1.2, tr: Y(6.65), sill: true, dark: r() < 0.4 });
        }
      }
    }
    sortCuts(f);
    wall(B.wall, f, gB, Y(BAND), CREAM, RND);
    for (const q of f.cuts) if (!q.cover) opening(B, f, q, f.in ? CREAM : WHITE);
    if (f.in) { D.setColor(GRANITE); for (const [s0, s1] of free(f, Y(-0.1), Y(0))) fbox(D, f, s0, s1, gB, yF, 0, 0.45, 'ft'); } // the step up from the pavers
    if (!f.in) {
      D.setColor(GRANITE); // plinth under the render, broken by the doors
      for (const [s0, s1] of freeAt(f, Y(0), Y(0.5))) fbox(D, f, s0, s1, gB, Y(0.5), -0.05, 0.06, 'ft');
      D.setColor(WHITE); // string course at the first floor
      for (const [s0, s1] of free(f, Y(G1 - 0.25), Y(G1))) fbox(D, f, s0, s1, Y(G1 - 0.25), Y(G1), 0, 0.1, 'ftu');
      for (const s of f.pil || []) if (free(f, Y(1), Y(2)).some(([a, b]) => s > a + 0.25 && s < b - 0.25)) fbox(D, f, s - 0.27, s + 0.27, Y(0.5), Y(BAND), 0, 0.14, 'flr');
    }
    B.band.setColor('#ffffff'); // silver band over the whole length, parapet and roof edge behind it
    for (const [s0, s1] of free(f, Y(BAND), Y(TOP))) {
      fbox(B.band, f, s0, s1, Y(BAND), Y(TOP), -0.3, 0.35, 'ftu', BANDUV);
      D.setColor('#cfccc4'); panel(D, f, s0, s1, Y(TOP - 0.35), Y(TOP), -0.3, [-f.nx, 0, -f.nz]);
      if (s1 - s0 > 3) { const p0 = pt(f, s0, 0, -0.12), p1 = pt(f, s1, 0, -0.12); Z.edge(p0[0], p0[2], p1[0], p1[2], Y(TOP), f.nx, f.nz); }
    }
  }
  // roof deck and a few air handlers and condensers on it
  D.setColor('#a3a6a6'); D.fill(ring, [], Y(TOP - 0.35), true);
  for (const [x, z, w, d, h] of [[284, 268, 3.2, 2.2, 1.8], [283, 232, 2.4, 1.6, 1.2], [252, 212.2, 2.4, 1.6, 1.2], [202.5, 262, 1.6, 2.4, 1.2], [202.5, 272, 1.4, 1.4, 1.0], [286, 285, 1.4, 1.4, 1.0], [214.5, 226.5, 1.3, 1.3, 1.0]]) {
    if (!inPoly(ring, x, z)) continue;
    D.setColor(h > 1.5 ? '#9ea2a3' : '#dcdbd6'); D.box(x - w / 2, Y(TOP - 0.35), z - d / 2, x + w / 2, Y(TOP - 0.35 + h), z + d / 2, 1 | 2 | 4 | 16 | 32);
    S.prism([x - w / 2, z - d / 2, x + w / 2, z - d / 2, x + w / 2, z + d / 2, x - w / 2, z + d / 2], Y(TOP - 0.35), Y(TOP - 0.35 + h), 0, 0, 'equipment');
  }

  // ---- towers: cream shafts, a white cornice, a dark glass pyramid; the door face with an arched hood and its name
  for (const T of TOWERS) {
    const [x0, z0, x1, z1] = T.r;
    const tf = { n: frame([x1, z0], [x0, z0], 0, -1), s: frame([x0, z1], [x1, z1], 0, 1), w: frame([x0, z0], [x0, z1], -1, 0), e: frame([x1, z1], [x1, z0], 1, 0) };
    for (const [key, f] of Object.entries(tf)) {
      const mid = pt(f, f.L / 2, 0, 0.6), exposed = !inPoly(ring, mid[0], mid[2]);
      if (key === T.door) {
        const dp = pt(f, f.L / 2, 0, 1.0);
        f.cuts.push({ s0: f.L / 2 - 1.3, s1: f.L / 2 + 1.3, y0: Math.max(Y(0.05), pave(dp[0], dp[2]) + 0.03), y1: Y(3.1), glass: SHOP[1], frame: BRONZE, pitch: 1.3, tr: Y(2.5) });
        f.cuts.push({ s0: f.L / 2 - 0.6, s1: f.L / 2 + 0.6, y0: Y(6.4), y1: Y(11.6), glass: UPPER[0], frame: BRONZE, pitch: 1.2, tr: Y(9), sill: true });
      } else if (exposed) f.cuts.push({ s0: f.L / 2 - 0.6, s1: f.L / 2 + 0.6, y0: Y(5.2), y1: Y(11.6), glass: UPPER[1], frame: BRONZE, pitch: 1.2, tr: Y(8.4), sill: true });
      sortCuts(f);
      wall(B.wall, f, gB, Y(TT - 0.4), CREAM, RND);
      for (const q of f.cuts) { opening(B, f, q); nOpen++; }
      D.setColor(GRANITE); for (const [s0, s1] of freeAt(f, Y(0), Y(0.5))) fbox(D, f, s0, s1, gB, Y(0.5), -0.05, 0.06, 'ft');
      D.setColor(WHITE); fbox(D, f, -0.28, f.L + 0.28, Y(TT - 0.4), Y(TT), 0, 0.28, 'ftu');
      if (key === T.door) {
        D.setColor(WHITE); arcBand(D, f, f.L / 2, 1.85, Y(3.3), 0.55, 0.24, 0.42);
        if (T.sign) decalQ(B.sign, f, f.L / 2 - 2.2, f.L / 2 + 2.2, Y(4.1), Y(6.3), 0.03, SIGN[T.sign]);
      }
      const p0 = pt(f, -0.28, 0, 0.1), p1 = pt(f, f.L + 0.28, 0, 0.1); Z.edge(p0[0], p0[2], p1[0], p1[2], Y(TT), f.nx, f.nz);
    }
    const E = [[x0 - 0.3, Y(TT), z0 - 0.3], [x1 + 0.3, Y(TT), z0 - 0.3], [x1 + 0.3, Y(TT), z1 + 0.3], [x0 - 0.3, Y(TT), z1 + 0.3]];
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    D.setColor('#8d9193'); D.fill([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], [], Y(TT), true);
    pyramid(B, E, [cx, Y(TT + PYR), cz], [cx, Y(TT - 1), cz]);
    S.prism([x0, z0, x1, z0, x1, z1, x0, z1], gB, Y(TT), 0, 0, 'wall');
    S.cyl(cx, cz, Y(TT), Y(TT + PYR), (x1 - x0) / 2 + 0.2, 0.2, 'roof');
  }

  // ---- the arch: silver barrel-vault hood over the glazed lunettes front and back, on round columns
  const cS = (y) => (y <= Y(YS) ? R_IN : Math.sqrt(Math.max(0, R_IN * R_IN - (y - Y(YS)) ** 2))); // half width of the glass at y
  for (const [o, sgn] of [[0.08, 1], [-DC - 0.08, -1]]) {
    const N = 18, lf = { ...fc, nx: fc.nx * sgn, nz: fc.nz * sgn }; // the back lunette looks into the courtyard
    B.lit.setColor('#707c7c');
    for (let i = 0; i < N; i++) {
      const a0 = Math.PI * (1 - i / N), a1 = Math.PI * (1 - (i + 1) / N);
      const sa = c + R_IN * Math.cos(a0), sb = c + R_IN * Math.cos(a1), ya = Y(YS) + R_IN * Math.sin(a0), yb = Y(YS) + R_IN * Math.sin(a1);
      q4(B.lit, pt(fc, sa, Y(G1), o), pt(fc, sb, Y(G1), o), pt(fc, sb, yb, o), pt(fc, sa, ya, o), [lf.nx, 0, lf.nz]);
    }
    D.setColor(SILVER);
    const oo = o + 0.06 * sgn;
    for (let k = -2; k <= 2; k++) { const s = c + k * 1.35, h = Y(YS) + Math.sqrt(R_IN * R_IN - (k * 1.35) ** 2); panel(D, fc, s - 0.05, s + 0.05, Y(G1), h, oo, [lf.nx, 0, lf.nz]); }
    for (let y = Y(G1 + 1.5); y < Y(YS + R_IN - 0.4); y += 1.5) { const w = cS(y); panel(D, fc, c - w, c + w, y - 0.05, y + 0.05, oo, [lf.nx, 0, lf.nz]); }
    for (let i = 0; i < N; i++) { // the glazing's curved head
      const a0 = Math.PI * (1 - i / N), a1 = Math.PI * (1 - (i + 1) / N);
      q4(D, pt(fc, c + (R_IN - 0.1) * Math.cos(a0), Y(YS) + (R_IN - 0.1) * Math.sin(a0), oo), pt(fc, c + (R_IN - 0.1) * Math.cos(a1), Y(YS) + (R_IN - 0.1) * Math.sin(a1), oo),
        pt(fc, c + R_IN * Math.cos(a1), Y(YS) + R_IN * Math.sin(a1), oo), pt(fc, c + R_IN * Math.cos(a0), Y(YS) + R_IN * Math.sin(a0), oo), [lf.nx, 0, lf.nz]);
    }
    D.setColor(SILVER); fbox(D, fc, c - R_OUT, c + R_OUT, Y(G1 - 0.4), Y(G1 + 0.1), sgn > 0 ? -0.1 : o - 0.3, sgn > 0 ? 0.35 : o + 0.1, sgn > 0 ? 'ftu' : 'btu');
    for (const s of [c - R_IN - 0.15, c + R_IN + 0.15]) { // round columns under the hood's ends
      const p = pt(fc, s, 0, sgn > 0 ? HOOD * 0.55 : -DC - HOOD * 0.55);
      const y0 = pave(p[0], p[2]) - 0.05;
      D.setColor(SILVER); D.cyl(p[0], y0, p[2], 0.42, 0.42, Y(YS) - y0, 16, false); D.setColor('#8e9294'); D.cyl(p[0], y0, p[2], 0.55, 0.55, 0.3, 16);
      S.cyl(p[0], p[2], y0, Y(YS), 0.42, 0.42, 'pole');
    }
  }
  { // the hood: a half-cylinder shell of silver cassettes from HOOD in front of the front to HOOD behind the back lunette
    const N = 18, oa = HOOD, ob = -DC - HOOD, len = oa - ob;
    const at = (a, R, o) => pt(fc, c + R * Math.cos(a), Y(YS) + R * Math.sin(a), o);
    for (let i = 0; i < N; i++) {
      const a0 = Math.PI * i / N, a1 = Math.PI * (i + 1) / N, am = (a0 + a1) / 2;
      const nr = [fc.ux * Math.cos(am), Math.sin(am), fc.uz * Math.cos(am)];
      const u0 = (R_OUT * a0) / 1.5, u1 = (R_OUT * a1) / 1.5;
      B.band.setColor(i & 1 ? '#f3f3f3' : '#ffffff');
      q4(B.band, at(a0, R_OUT, oa), at(a1, R_OUT, oa), at(a1, R_OUT, ob), at(a0, R_OUT, ob), nr, [[u0, 0], [u1, 0], [u1, len / 1.25], [u0, len / 1.25]]);
      B.band.setColor('#d8dadb');
      q4(B.band, at(a0, R_IN, oa), at(a1, R_IN, oa), at(a1, R_IN, ob), at(a0, R_IN, ob), neg(nr), [[u0, 0], [u1, 0], [u1, len / 1.25], [u0, len / 1.25]]);
      D.setColor(SILVER);
      for (const [o, s] of [[oa, 1], [ob, -1]]) q4(D, at(a0, R_IN, o), at(a1, R_IN, o), at(a1, R_OUT, o), at(a0, R_OUT, o), [fc.nx * s, 0, fc.nz * s]);
    }
    D.setColor(SILVER); // the shell's feet, and the posts between the glass and the hood
    for (const s of [c - R_OUT, c + R_IN]) fbox(D, fc, s, s + R_OUT - R_IN, Y(YS - 0.05), Y(YS), ob, oa, 'u');
    B.wall.setColor(CREAM);
    for (const [s0, s1, e] of [[c - R_OUT, c - R_IN, 'l'], [c + R_IN, c + R_OUT, 'r']]) fbox(B.wall, fc, s0, s1, Y(G1), Y(YS), -DC, 0, 'fb' + e);
    S.prism(frameQuad(fc, c - R_OUT, c + R_OUT, -DC, 0.3).flat(), Y(G1), Y(YS + R_OUT), 0, 0, 'wall');
    decalQ(B.sign, fc, c - 3.9, c + 3.9, Y(G1 + 0.15), Y(G1 + 0.15 + 7.8 * 640 / 2048), 0.3, SIGN.name);
  }
  // the passage: soffit with downlights, square pillars, shopfronts along its sides
  D.setColor('#e6e2da'); q4(D, pt(fc, c - R_IN, Y(G1), 0), pt(fc, c + R_IN, Y(G1), 0), pt(fc, c + R_IN, Y(G1), -DC), pt(fc, c - R_IN, Y(G1), -DC), DN);
  B.lit.setColor('#fff4e0');
  for (let o = -1.2; o > -DC + 0.5; o -= 2.4) for (const s of [c - 2.4, c, c + 2.4]) q4(B.lit, pt(fc, s - 0.2, Y(G1) - 0.02, o - 0.2), pt(fc, s + 0.2, Y(G1) - 0.02, o - 0.2), pt(fc, s + 0.2, Y(G1) - 0.02, o + 0.2), pt(fc, s - 0.2, Y(G1) - 0.02, o + 0.2), DN);
  for (const o of [-2.5, -5.0]) for (const s of [c - 2.0, c + 2.0]) {
    const q = pt(fc, s, 0, o), y0 = pave(q[0], q[2]) - 0.05;
    D.setColor(CREAM); fbox(D, fc, s - 0.3, s + 0.3, y0, Y(G1), o - 0.3, o + 0.3, 'fblr');
    D.setColor(GRANITE); fbox(D, fc, s - 0.33, s + 0.33, y0, y0 + 0.45, o - 0.33, o + 0.33, 'fblrt');
    S.prism(frameQuad(fc, s - 0.3, s + 0.3, o - 0.3, o + 0.3).flat(), y0 - 0.5, Y(G1), 0, 0, 'wall');
  }
  for (const [s, h, dir] of [[c - R_IN, hL, 1], [c + R_IN, hR, -1]]) { // passage sides, glazed, facing each other
    const a = pt(fc, s, 0), f = frame([a[0], a[2]], h.p, fc.ux * dir, fc.uz * dir);
    f.cuts.push({ s0: 0.4, s1: f.L - 0.4, y0: Y(0.05), y1: Y(3.7), glass: SHOP[2], frame: STEEL, pitch: 1.6, tr: Y(2.8), dep: 0.12 });
    wall(B.wall, f, gB, Y(G1), CREAM, RND);
    opening(B, f, f.cuts[0], CREAM); nOpen++;
    D.setColor(GRANITE); fbox(D, f, 0, f.L, gB, yF, 0, 0.45, 'ftlr');
  }
  // collision: the ring either side of the passage, from the ground to the parapet
  const cutPoly = (from, to, head, tail) => { const P = [head]; for (let k = from; k !== to; k = (k + 1) % n) P.push(ring[k]); P.push(ring[to], tail); return P; };
  const P1 = pt(fc, c - R_IN, 0), P2 = pt(fc, c + R_IN, 0);
  S.prism(cutPoly(iB, hR.k, [P2[0], P2[2]], hR.p).flat(), gB, Y(TOP), 0, 0, 'wall');
  S.prism(cutPoly((hL.k + 1) % n, iA, hL.p, [P1[0], P1[2]]).flat(), gB, Y(TOP), 0, 0, 'wall');

  // ---- courtyard gallery: a deck on columns along the inner fronts, glass railing, two stairs
  const chain = [];
  for (let k = iNE; k !== iSW; k = (k + 1) % n) chain.push(k);
  const seg = chain.map((k) => {
    const f = edgeF(k), a = ring[k], b = ring[(k + 1) % n];
    const m = [(a[0] + b[0]) / 2 + f.nx * DECK * 0.7, (a[1] + b[1]) / 2 + f.nz * DECK * 0.7];
    const q = (p) => [p[0] + f.nx * DECK, p[1] + f.nz * DECK];
    const on = f.L > 0.3 && !nearPav(m[0], m[1], 0.6) && !nearPav(...q(a), 0.4) && !nearPav(...q(b), 0.4);
    return { k, f, a, b, on };
  });
  const miter = (i, end) => { // offset of the vertex shared with the neighbour (mitred when both carry deck)
    const s = seg[i], o = seg[i + (end ? 1 : -1)], p = end ? s.b : s.a;
    let mx = s.f.nx, mz = s.f.nz;
    if (o?.on) { const ax = s.f.nx + o.f.nx, az = s.f.nz + o.f.nz, l = Math.hypot(ax, az) || 1, dd = Math.max(0.5, (ax * s.f.nx + az * s.f.nz) / l); mx = ax / l / dd; mz = az / l / dd; }
    return [p[0] + mx * DECK, p[1] + mz * DECK];
  };
  const STAIRS = [
    { k: near([207.9, 269.9]), from: 'end' },   // SW leg: climbs toward the pavilion
    { k: near(LEG_NE), from: 'start' },          // NE leg
  ];
  const SH = G1 + yF - yP, RUN = 0.29, NST = Math.ceil(SH / 0.18), RISE = SH / NST, SLEN = NST * RUN; // pavers to the deck
  let deckSegs = 0, colAcc = 3.2; // metres since the last column
  seg.forEach((sd, i) => {
    if (!sd.on) return;
    deckSegs++;
    const qa = miter(i, false), qb = miter(i, true), ya = Y(G1);
    const A = [sd.a[0], ya, sd.a[1]], Bp = [sd.b[0], ya, sd.b[1]], QA = [qa[0], ya, qa[1]], QB = [qb[0], ya, qb[1]];
    D.setColor('#cbc6bb'); q4(D, A, Bp, QB, QA, UP);
    D.setColor(WHITE); q4(D, [A[0], ya - 0.3, A[2]], [Bp[0], ya - 0.3, Bp[2]], [QB[0], ya - 0.3, QB[2]], [QA[0], ya - 0.3, QA[2]], DN);
    D.setColor(SILVER); q4(D, [QA[0], ya - 0.3, QA[2]], [QB[0], ya - 0.3, QB[2]], QB, QA, [sd.f.nx, 0, sd.f.nz]);
    if (!seg[i - 1]?.on) { D.setColor(SILVER); q4(D, [A[0], ya - 0.3, A[2]], [QA[0], ya - 0.3, QA[2]], QA, A, [-sd.f.ux, 0, -sd.f.uz]); }
    if (!seg[i + 1]?.on) { D.setColor(SILVER); q4(D, [Bp[0], ya - 0.3, Bp[2]], [QB[0], ya - 0.3, QB[2]], QB, Bp, [sd.f.ux, 0, sd.f.uz]); }
    S.prism([sd.a[0], sd.a[1], sd.b[0], sd.b[1], qb[0], qb[1], qa[0], qa[1]], ya - 0.3, ya, 0, 0, 'awning', 1);
    // railing along the edge, open where a stair lands
    const st = STAIRS.find((q) => q.k === sd.k), L = Math.hypot(qb[0] - qa[0], qb[1] - qa[1]);
    const gap = st ? (st.from === 'end' ? [sd.f.L - 0.8 - SLEN - 1.6, sd.f.L - 0.8 - SLEN] : [0.8 + SLEN, 0.8 + SLEN + 1.6]) : null;
    const lerp = (t) => [qa[0] + (qb[0] - qa[0]) * t, qa[1] + (qb[1] - qa[1]) * t];
    const runs = gap ? [[0, gap[0] / sd.f.L], [gap[1] / sd.f.L, 1]] : [[0, 1]];
    for (const [t0, t1] of runs) {
      if (t1 - t0 < 1e-3) continue;
      const p = lerp(t0), q = lerp(t1);
      B.rail.setColor('#ffffff'); q4(B.rail, [p[0], ya, p[1]], [q[0], ya, q[1]], [q[0], ya + 1.0, q[1]], [p[0], ya + 1.0, p[1]], [sd.f.nx, 0, sd.f.nz]);
      D.setColor(STEEL); D.tube([p[0], ya + 1.02, p[1]], [q[0], ya + 1.02, q[1]], 0.035, 5);
    }
    if (!seg[i - 1]?.on) { B.rail.setColor('#ffffff'); q4(B.rail, A, QA, [QA[0], ya + 1, QA[2]], [A[0], ya + 1, A[2]], [-sd.f.ux, 0, -sd.f.uz]); }
    if (!seg[i + 1]?.on) { B.rail.setColor('#ffffff'); q4(B.rail, Bp, QB, [QB[0], ya + 1, QB[2]], [Bp[0], ya + 1, Bp[2]], [sd.f.ux, 0, sd.f.uz]); }
    // columns under the deck edge every ~6.5 m (clear of the stair)
    let t = 0;
    while (colAcc + (L - t) >= 6.5) {
      t += 6.5 - colAcc; colAcc = 0;
      const sAt = (t / L) * sd.f.L;
      if (gap && sAt > gap[0] - SLEN - 1 && sAt < gap[1] + SLEN + 1) continue;
      const p = lerp(t / L), x = p[0] - sd.f.nx * 0.3, z = p[1] - sd.f.nz * 0.3;
      D.setColor(WHITE); D.cyl(x, yP - 0.05, z, 0.19, 0.19, ya - 0.3 - yP + 0.05, 10, false);
      S.cyl(x, z, yP, ya - 0.3, 0.19, 0.19, 'pole');
    }
    colAcc += L - t;
  });
  for (const st of STAIRS) { // open stairs outside the deck edge: white treads on stringers, a steel handrail
    const f = edgeF(st.k), dir = st.from === 'end' ? 1 : -1, sTop = st.from === 'end' ? f.L - 0.8 - SLEN : 0.8 + SLEN;
    const o0 = DECK, o1 = DECK + 2.1;
    for (let i = 0; i < NST; i++) {
      const sa = sTop + dir * i * RUN, sb = sa + dir * RUN, top = Y(G1) - RISE * i;
      D.setColor(i ? '#e9e6df' : '#d9d5cc');
      fbox(D, f, Math.min(sa, sb), Math.max(sa, sb), top - 0.06, top, o0, o1, 'ftu' + (dir > 0 ? 'l' : 'r'));
      S.prism(frameQuad(f, Math.min(sa, sb), Math.max(sa, sb), o0, o1).flat(), yP - 0.3, top, 0, 0, 'step');
    }
    D.setColor(WHITE); // landing into the deck, stringers, handrails
    fbox(D, f, Math.min(sTop, sTop - dir * 1.6), Math.max(sTop, sTop - dir * 1.6), Y(G1 - 0.3), Y(G1), o0, o1, 'ftu');
    S.prism(frameQuad(f, Math.min(sTop, sTop - dir * 1.6), Math.max(sTop, sTop - dir * 1.6), o0, o1).flat(), Y(G1 - 0.3), Y(G1), 0, 0, 'awning', 1);
    const bot = sTop + dir * SLEN;
    for (const o of [o0 + 0.05, o1 - 0.05]) {
      const a = pt(f, sTop, Y(G1), o), b = pt(f, bot, yP, o);
      D.setColor(WHITE); D.tube([a[0], a[1] - 0.2, a[2]], [b[0], b[1] + 0.05, b[2]], 0.09, 4);
      D.setColor(STEEL); D.tube([a[0], a[1] + 1.0, a[2]], [b[0], b[1] + 1.0, b[2]], 0.035, 5);
      for (let t = 0; t <= 1.001; t += 0.25) { const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; D.tube(p, [p[0], p[1] + 1.0, p[2]], 0.025, 4); }
    }
    const pb = pt(f, bot + dir * 0.1, 0, (o0 + o1) / 2); D.setColor(STEEL); D.cyl(pb[0], yP - 0.05, pb[2], 0.05, 0.05, Y(G1 - 0.3) - yP, 6, false); // a post under the landing end
  }

  // ---- atrium pavilions: glass drums under glass pyramids, set into the notches of the wings
  const pavFoot = [];
  for (const v of pavs) {
    const P = area2(v.P) > 0 ? v.P : v.P.slice().reverse();
    let door = 0, best = -Infinity;
    P.forEach((a, i) => {
      const b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L;
      const m = [(a[0] + b[0]) / 2 - RING_C[0], (a[1] + b[1]) / 2 - RING_C[1]], d = -(nx * m[0] + nz * m[1]) / Math.hypot(...m);
      if (d > best) { best = d; door = i; }
    });
    P.forEach((a, i) => {
      const b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      let f = frame(a, b, (b[1] - a[1]) / L, -(b[0] - a[0]) / L);
      const m = pt(f, f.L / 2, 0, 1); if (Math.hypot(m[0] - v.C[0], m[2] - v.C[1]) < Math.hypot(pt(f, f.L / 2, 0)[0] - v.C[0], pt(f, f.L / 2, 0)[2] - v.C[1])) f = frame(a, b, -f.nx, -f.nz);
      B.lit.setColor(SHOP[3]); panel(B.lit, f, 0, f.L, Y(0.05), Y(4.2), 0);
      D.setColor(SILVER);
      fbox(D, f, -0.08, 0.08, Y(0), Y(4.2), -0.05, 0.08, 'flr'); fbox(D, f, 0, f.L, Y(2.9), Y(3.0), 0, 0.06, 'ftu');
      if (i === door) { D.setColor('#6e7275'); fbox(D, f, f.L / 2 - 1.1, f.L / 2 + 1.1, Y(2.55), Y(2.7), 0, 0.1, 'ftu'); fbox(D, f, f.L / 2 - 0.04, f.L / 2 + 0.04, Y(0), Y(2.55), 0, 0.07, 'flr'); fbox(D, f, f.L / 2 - 1.1, f.L / 2 - 1.02, Y(0), Y(2.55), 0, 0.07, 'flr'); fbox(D, f, f.L / 2 + 1.02, f.L / 2 + 1.1, Y(0), Y(2.55), 0, 0.07, 'flr'); }
      D.setColor('#57595a'); fbox(D, f, 0, f.L, yP - 0.2, Y(0.05), 0, 0.05, 'ft');
      B.band.setColor('#ffffff'); fbox(B.band, f, -0.05, f.L + 0.05, Y(4.2), Y(PAV_E), -0.05, 0.14, 'ftu', [1.5, 1.25, Y(4.2)]);
    });
    const E = P.map((p) => { const dx = p[0] - v.C[0], dz = p[1] - v.C[1], l = Math.hypot(dx, dz) || 1; return [p[0] + dx / l * 0.35, Y(PAV_E), p[1] + dz / l * 0.35]; });
    pyramid(B, E, [v.C[0], Y(PAV_TOP), v.C[1]], [v.C[0], Y(PAV_E - 1), v.C[1]]);
    // the notch of the wing round it: a flat roof at the eave, so no gap shows between the drum and the wing
    const inR = (k) => Math.hypot(ring[k][0] - v.C[0], ring[k][1] - v.C[1]) < v.R + 3.2, notch = [];
    const k0 = ring.findIndex((_, k) => inR(k) && !inR((k + n - 1) % n));
    for (let k = k0; k0 >= 0 && inR(k) && notch.length < n; k = (k + 1) % n) notch.push(ring[k]);
    if (notch.length > 2) { D.setColor('#a3a6a6'); D.fill(notch, [], Y(PAV_E) - 0.02, true); }
    S.prism(P.flat(), gB, Y(PAV_E), 0, 0, 'wall');
    S.cyl(v.C[0], v.C[1], Y(PAV_E), Y(PAV_TOP), v.R + 0.3, 0.2, 'roof');
    pavFoot.push({ poly: P, h: Y(PAV_TOP) - gLo, kind: 'retail', name: 'Хрещатик-Сіті' });
  }

  // ---- pavers on a 1.5 m grid draped on the terrain (the lot is level, its edges are not): the courtyard out to the
  // car park, the passage, the corner forecourt and the strips along Khreshchatyk and Dashkovycha; cells wholly under
  // the building are left out
  const PV = B.pave, yPv = yP;
  const towerR = TOWERS.map((T) => [[T.r[0], T.r[1]], [T.r[2], T.r[1]], [T.r[2], T.r[3]], [T.r[0], T.r[3]]]), pass = frameQuad(fc, c - R_IN, c + R_IN, -DC - 0.5, 0.6);
  const underBld = (x, z) => (inPoly(ring, x, z) && !inPoly(pass, x, z)) || towerR.some((R) => inPoly(R, x, z)) || pavs.some((v) => inPoly(v.P, x, z));
  const CELL = 1.5, GX0 = 191, GZ0 = 201.5, nx = 71, nz = 67, vid = new Map();
  PV.setColor('#ffffff');
  const gv = (i, j) => {
    const key = j * 1000 + i;
    if (!vid.has(key)) { const x = GX0 + i * CELL, z = GZ0 + j * CELL; vid.set(key, PV.vert(x, pave(x, z), z, 0, 1, 0, x / 4.8, z / 4.8)); }
    return vid.get(key);
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x0 = GX0 + i * CELL, z0 = GZ0 + j * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
    if ([[x0, z0], [x1, z0], [x1, z1], [x0, z1]].every(([x, z]) => underBld(x, z))) continue;
    const a = gv(i, j), b = gv(i + 1, j), cc = gv(i + 1, j + 1), d = gv(i, j + 1);
    PV.tri(a, cc, b).tri(a, d, cc);
  }
  const annulus = (r0, r1, col, dy) => {
    PV.setColor(col); const N = 48, v0 = PV.v;
    for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a); for (const rr of [r0, r1]) { const x = RING_C[0] + cs * rr, z = RING_C[1] + sn * rr; PV.vert(x, yPv + dy, z, 0, 1, 0, x / 4.8, z / 4.8); } }
    for (let i = 0; i < N; i++) { const a = v0 + i * 2; PV.tri(a, a + 3, a + 1).tri(a, a + 2, a + 3); }
  };
  annulus(8.6, 9.8, '#b8aa98', 0.012); annulus(2.2, 2.9, '#b8aa98', 0.012); annulus(2.9, 8.6, '#f3efe8', 0.008);
  // round timber benches round lamp posts
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, x = RING_C[0] + Math.cos(a) * 14.5, z = RING_C[1] + Math.sin(a) * 14.5;
    if (nearPav(x, z, 2.5)) continue;
    D.setColor('#8a5a36'); D.lathe([[1.45, yP], [1.5, yP + 0.44], [1.0, yP + 0.44], [1.05, yP]], 20, x, z);
    D.setColor('#4c4f51'); D.cyl(x, yP, z, 0.95, 0.95, 0.3, 16, false);
    D.setColor(STEEL); D.cyl(x, yP, z, 0.08, 0.06, 4.4, 8, false); D.tube([x - 0.55, yP + 4.3, z], [x + 0.55, yP + 4.3, z], 0.04, 4);
    B.lit.setColor('#fff3da'); for (const dx of [-0.55, 0.55]) B.lit.ellipsoid([x + dx, yP + 4.55, z], [0.22, 0.22, 0.22], 10, 6);
    S.cyl(x, z, yP, yP + 0.45, 1.5, 1.5, 'bench'); S.cyl(x, z, yP, yP + 4.4, 0.08, 0.08, 'pole');
  }

  // ---- meshes
  const group = Object.assign(new THREE.Group(), { name: 'khrcity' });
  root.add(group);
  const sign = signTex();
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: renderTex(r), vertexColors: true, roughness: 0.9 }),
    band: new THREE.MeshStandardMaterial({ map: panelTex(), vertexColors: true, roughness: 0.32, metalness: 0.55 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.35, emissive: 0xffdcae, emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.35 }),
    dome: new THREE.MeshStandardMaterial({ color: 0x2f4a66, roughness: 0.08, metalness: 0.7, emissive: 0xbfd6ff, emissiveIntensity: 0 }),
    rail: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xcfe4e2, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false }),
    pave: decal(new THREE.MeshStandardMaterial({ map: paveTex(r), vertexColors: true, roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -3 })),
    sign: new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0, alphaTest: 0.35, roughness: 0.45, metalness: 0.3 }),
  };
  let nV = 0;
  for (const [k, Bk] of Object.entries(B)) {
    if (!Bk.v) continue;
    nV += Bk.v;
    const flat = k === 'lit' || k === 'glass' || k === 'sign' || k === 'rail' || k === 'pave';
    group.add(Object.assign(new THREE.Mesh(Bk.build(), M[k]), { name: 'khrcity-' + k, castShadow: !flat, receiveShadow: k !== 'rail' }));
  }
  console.log(`[cherkasy] Khreshchatyk City: ${nOpen} openings, ${deckSegs} gallery bays, ${pavs.length} pavilions, passage ${DC.toFixed(1)} m, floor ${yF.toFixed(1)} m, ${(nV / 1000).toFixed(1)}k verts, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const bb = ring.reduce((q, p) => [Math.min(q[0], p[0]), Math.min(q[1], p[1]), Math.max(q[2], p[0]), Math.max(q[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
  return {
    footprints: [{ poly: ring, h: Y(TOP) - gLo, kind: bld.k, name: 'Хрещатик-Сіті' },
      ...TOWERS.map((T) => ({ poly: [[T.r[0], T.r[1]], [T.r[2], T.r[1]], [T.r[2], T.r[3]], [T.r[0], T.r[3]]], h: Y(TT + PYR) - gLo, kind: bld.k, name: 'Хрещатик-Сіті' })), ...pavFoot],
    // no generated trees on the lot, in the courtyard or on the corner forecourt
    clear: (x, z) => x > bb[0] - 3 && x < bb[2] + 2 && z > bb[1] - 4 && z < 302.5,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.55 * k; M.sign.emissiveIntensity = 0.8 * k; M.dome.emissiveIntensity = 0.1 * k; },
  };
}
