// OWNER: cherkasy. ЧДТУ – Cherkasy State Technological University, бульвар Шевченка, 460: the campus at the north-west
// end of the boulevard, rebuilt after the Wikimedia Commons / uk.wikipedia photos (2010–2017), the panorama on
// chdtu.edu.ua and satellite imagery (the OSM data tags the main building as 4 levels; it is a 9-storey tower).
//   Корпус №1 (OSM relation 13600115), the main building: two staggered white slabs of nine office storeys and a
//   technical top storey with slot windows, window pairs between slim vertical ribs, stair / lift headhouses and cell
//   masts on the roof, all over a maroon ground storey that runs out into a one-storey podium towards the boulevard.
//   The main entrance faces вулиця Кобзарська under the south slab: a porch with the ribbed white fascia and the gold
//   lettering «Черкаський державний технологічний університет», glazed doors and a broad flight of steps. Behind it a
//   two-storey block (pink ground floor, pale panelled upper floor with a window band) with the assembly-hall box on
//   its roof, a one-storey link round the small inner courtyard (the relation's hole) and a two-storey link north to
//   Корпус №2. On the plaza before the north end: the «Сходи знань» figure on its red stepped plinth; two flags by the
//   podium.
//   Корпус №2 (157529107): four storeys in beige ceramic tiles on a dark-red plinth, a comb of a long front wing to the
//   boulevard and two back wings; the glazed entrance with a flat canopy in the middle of the front. From its north
//   back wing a glazed first-floor gallery on columns crosses the path to Корпус №4 (13600116, four storeys, cream
//   tiles, a light well: the relation's hole). Корпус №3 (399161746): a terracotta block with a white egg-crate grid
//   over three storeys, blank end piers and a tall top band. The student canteen (157529125, OSM says 9 levels; it is
//   two) in the style of the two-storey block it adjoins.
// Lit windows at night follow nightK.
//   CHDTU_SKIP: the OSM ids replaced here (buildings.js skips them)
//   buildChdtu({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Every footprint here is axis-aligned in map x / z. Each building part is a ring extruded from its base to its roof;
// its walls are laid per ring edge in an edge frame (s along the edge, y up, o outward). Where a neighbouring part
// stands against an edge, that stretch of wall is cut out up to the lower of the two roofs ("covers"), so abutting
// parts share no hidden walls and windows never open into a neighbour.
import * as THREE from 'three';
import { MB, orient } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { ringPts, rng, inPoly } from './geo.js';

const ID = { main: 13600115, k2: 157529107, k3: 399161746, k4: 13600116, cafe: 157529125 };
export const CHDTU_SKIP = new Set(Object.values(ID));

const P1 = 4.8, FH = 3.3, NF = 9, TECH = 2.9; // tower: red ground storey, office storey, office storeys, top storey
const F2 = 3.6;                               // storey of the teaching blocks
const WHITE = '#efede7', MAROON = '#6b2727', PINK = '#d9a79d', PALE = '#cfd2d2', BEIGE = '#efdcbf', CREAM = '#e8dfcc';
const TERRA = '#a4523a', PLINTH = '#6a5f59', REDPL = '#6d2c26', ROOF = '#57534e', GALV = '#b9bcbb', FRAME = '#e9e8e3';
const GLASS = ['#56646f', '#62707a', '#4a5660', '#6d7880', '#7d858a'];
const UP = [0, 1, 0], DN = [0, -1, 0];

// hand split of the main building's relation into its masses (OSM coordinates, map metres)
const TOWER = [[-142.6, 3766.4], [-126.4, 3766.4], [-126.4, 3790], [-117.8, 3790], [-117.8, 3821.6], [-134, 3821.6], [-134, 3797.5], [-142.6, 3797.5]];
const PODIUM = [[-126.4, 3784.1], [-105.4, 3784.1], [-105.4, 3815.3], [-117.8, 3815.3], [-117.8, 3790], [-126.4, 3790]];
const WEST = [[-174.1, 3784.6], [-144.9, 3784.6], [-144.9, 3790.4], [-142.6, 3790.4], [-142.6, 3797.5], [-144.5, 3797.5], [-144.5, 3815.6], [-170.4, 3815.6], [-170.4, 3811.5], [-174.1, 3811.5]];
const HALL = [[-173, 3796], [-150.6, 3796], [-150.6, 3812], [-173, 3812]];
const SOUTH = [[-144.5, 3808.2], [-134, 3808.2], [-134, 3822], [-145.3, 3822], [-145.3, 3815.6], [-144.5, 3815.6]];
const NORTH = [[-150, 3758.4], [-146, 3758.4], [-146, 3766.4], [-142.6, 3766.4], [-142.6, 3773], [-150, 3773]];
const GALLERY = [-237, -204.2, 3681.4, 3684.7];   // x0, x1, z0, z1 of the glazed bridge Корпус №2 – Корпус №4
const PORCH = [-131.5, -121.5, 3821.6, 3824.8];   // the main entrance under the south slab
const STATUE = [-112.5, 3754];

// ------------------------------------------------------------------------------------------------ textures
const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${a})`;
// 3 x 3.3 m facade panel: faint mottling, a thin joint along the top and the left edge (tinted per use)
const panelTex = (r) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#faf9f6'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) { g.fillStyle = r() < 0.5 ? rgba(255, 255, 255, 0.2) : rgba(90, 85, 80, 0.05); g.fillRect(r() * w, r() * h, 2 + r() * 7, 1 + r() * 4); }
  g.fillStyle = rgba(70, 70, 70, 0.2); g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
});
// 15 cm glazed ceramic tiles, 16 x 16 per repeat, each a shade apart, grey grout
const tileTex = (r) => canvasTex(256, 256, (g, w) => {
  g.fillStyle = '#d3cbbf'; g.fillRect(0, 0, w, w);
  const p = w / 16;
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
    const k = 0.93 + r() * 0.1, c = [248, 240, 228].map((v) => Math.min(255, Math.round(v * k)));
    g.fillStyle = `rgb(${c})`; g.fillRect(i * p + 1, j * p + 1, p - 2, p - 2);
  }
});
// rough render / terrazzo speckle
const roughTex = (r) => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#ecebe8'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) { g.fillStyle = r() < 0.5 ? rgba(255, 255, 255, 0.25) : rgba(70, 60, 55, 0.12); g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
});
// the entrance fascia: ribbed white-silver sheet with the university's name in gold capitals, two lines
const signTex = () => canvasTex(1024, 196, (g, w, h) => {
  g.fillStyle = '#dcdedd'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 10) { g.fillStyle = rgba(0, 0, 0, 0.09); g.fillRect(x, 0, 3, h); g.fillStyle = rgba(255, 255, 255, 0.35); g.fillRect(x + 4, 0, 2, h); }
  g.font = 'bold 58px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const [t, y] of [['ЧЕРКАСЬКИЙ ДЕРЖАВНИЙ', h * 0.3], ['ТЕХНОЛОГІЧНИЙ УНІВЕРСИТЕТ', h * 0.72]]) {
    g.fillStyle = 'rgba(40,30,10,0.55)'; g.fillText(t, w / 2 + 2, y + 3, w * 0.8);
    g.fillStyle = '#c9a142'; g.fillText(t, w / 2, y, w * 0.8);
  }
}, { repeat: false });

// ------------------------------------------------------------------------------------------------ edge frames
// face over ring edge a -> b of a positive (outer) or negative (hole) ring: (uz, -ux) points out of the solid
function edgeFace(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
  return { ax: a[0], az: a[1], ux, uz, nx: uz, nz: -ux, L, N: [uz, 0, -ux], U: [ux, 0, uz], Ui: [-ux, 0, -uz], open: [], cuts: [], cover: [] };
}
const pt = (f, s, y, o = 0) => [f.ax + f.ux * s + f.nx * o, y, f.az + f.uz * s + f.nz * o];
// quad a b c d whose front looks along n (winding picked from the corner order)
function q4(D, a, b, c, d, n, uv) {
  const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2], e2x = d[0] - a[0], e2y = d[1] - a[1], e2z = d[2] - a[2];
  const side = n[0] * (e1y * e2z - e1z * e2y) + n[1] * (e1z * e2x - e1x * e2z) + n[2] * (e1x * e2y - e1y * e2x);
  const i = D.v;
  for (const [k, p] of [a, b, c, d].entries()) D.vert(p[0], p[1], p[2], n[0], n[1], n[2], uv?.[k][0] ?? 0, uv?.[k][1] ?? 0);
  if (side >= 0) D.quad(i, i + 1, i + 2, i + 3); else D.quad(i, i + 3, i + 2, i + 1);
}
// flat rectangle on the face plane (offset o), s0..s1 x y0..y1
const panel = (D, f, s0, s1, y0, y1, o = 0, n = f.N, uv) => q4(D, pt(f, s0, y0, o), pt(f, s1, y0, o), pt(f, s1, y1, o), pt(f, s0, y1, o), n, uv);
// axis-aligned box spanned in the face frame (every face here is axis-aligned in the map)
function fbox(D, f, s0, s1, y0, y1, o0, o1, mask = 63) {
  const a = pt(f, s0, y0, o0), b = pt(f, s1, y1, o1);
  D.box(Math.min(a[0], b[0]), y0, Math.min(a[2], b[2]), Math.max(a[0], b[0]), y1, Math.max(a[2], b[2]), mask);
}
// free s-intervals of the face at height y (covers and cut openings removed)
function freeAt(f, y0, y1) {
  const out = []; let s = 0;
  for (const c of f.cuts) if (c.y0 < y1 - 1e-3 && c.y1 > y0 + 1e-3) { if (c.s0 > s + 1e-3) out.push([s, c.s0]); s = Math.max(s, c.s1); }
  if (s < f.L - 1e-3) out.push([s, f.L]);
  return out;
}
// wall surface y0..y1 around the cuts; uv [metres per repeat along, up, y of the texture origin]
function wallBand(D, f, y0, y1, col, uv) {
  const ys = [y0, y1];
  for (const c of f.cuts) { if (c.y0 > y0 && c.y0 < y1) ys.push(c.y0); if (c.y1 > y0 && c.y1 < y1) ys.push(c.y1); }
  ys.sort((a, b) => a - b);
  D.setColor(col);
  for (let i = 0; i + 1 < ys.length; i++) {
    const a = ys[i], b = ys[i + 1];
    if (b - a < 1e-3) continue;
    for (const [s0, s1] of freeAt(f, a, b)) {
      const t = uv && [[s0 / uv[0], (a - uv[2]) / uv[1]], [s1 / uv[0], (a - uv[2]) / uv[1]], [s1 / uv[0], (b - uv[2]) / uv[1]], [s0 / uv[0], (b - uv[2]) / uv[1]]];
      panel(D, f, s0, s1, a, b, 0, f.N, t);
    }
  }
}

// ------------------------------------------------------------------------------------------------ openings
// q: { s0, s1, y0, y1, t: 'win' | 'pair' | 'door' | 'flat', dep, rev, glass, lit, bars }
function opening(B, f, q) {
  const D = B.det, { s0, s1, y0, y1 } = q, G = q.lit ? B.lit : B.glass;
  if (q.t === 'flat') { // no reveal: glazing laid on the wall, a mullion, the sill's lip
    G.setColor(q.glass); panel(G, f, s0, s1, y0, y1, 0.02);
    D.setColor(FRAME); if (s1 - s0 > 1.3) panel(D, f, (s0 + s1) / 2 - 0.04, (s0 + s1) / 2 + 0.04, y0, y1, 0.03);
    D.setColor(GALV); panel(D, f, s0 - 0.04, s1 + 0.04, y0 - 0.06, y0, 0.06);
    return;
  }
  const d = q.dep ?? 0.22, g = -d + 0.06;
  D.setColor(q.rev);
  q4(D, pt(f, s0, y0), pt(f, s0, y0, -d), pt(f, s0, y1, -d), pt(f, s0, y1), f.U);
  q4(D, pt(f, s1, y0), pt(f, s1, y0, -d), pt(f, s1, y1, -d), pt(f, s1, y1), f.Ui);
  q4(D, pt(f, s0, y1), pt(f, s1, y1), pt(f, s1, y1, -d), pt(f, s0, y1, -d), DN);
  q4(D, pt(f, s0, y0), pt(f, s1, y0), pt(f, s1, y0, -d), pt(f, s0, y0, -d), UP);
  G.setColor(q.glass); panel(G, f, s0, s1, y0, y1, g);
  const bar = (a, b) => panel(D, f, a, b, y0, y1, g + 0.02), rail = (y) => panel(D, f, s0, s1, y - 0.035, y + 0.035, g + 0.02);
  if (q.t === 'pair') { // two windows either side of a narrow pier, each with a top light
    const m = (s0 + s1) / 2, a = m - 0.11, b = m + 0.11;
    panel(D, f, a, b, y0, y1, 0);
    q4(D, pt(f, a, y0), pt(f, a, y0, -d), pt(f, a, y1, -d), pt(f, a, y1), f.Ui);
    q4(D, pt(f, b, y0), pt(f, b, y0, -d), pt(f, b, y1, -d), pt(f, b, y1), f.U);
    D.setColor(FRAME); rail(y0 + (y1 - y0) * 0.72);
  } else if (q.t === 'door') {
    D.setColor(FRAME); rail(y0 + 2.3);
    for (let s = s0 + 1.2; s < s1 - 0.4; s += 1.2) bar(s - 0.04, s + 0.04);
    return;
  } else {
    D.setColor(FRAME);
    if (s1 - s0 > 1.2) bar((s0 + s1) / 2 - 0.035, (s0 + s1) / 2 + 0.035);
    if (y1 - y0 > 1.6) rail(y0 + (y1 - y0) * 0.7);
  }
  if (q.sill === false) return;
  D.setColor(GALV); // sill: top and front of a thin galvanised strip
  q4(D, pt(f, s0 - 0.04, y0), pt(f, s1 + 0.04, y0), pt(f, s1 + 0.04, y0, 0.07), pt(f, s0 - 0.04, y0, 0.07), UP);
  panel(D, f, s0 - 0.04, s1 + 0.04, y0 - 0.05, y0, 0.07);
}

// ------------------------------------------------------------------------------------------------ parts
// part: { ring, holes, y0, top (roof), par, skin: [[yTo, key, colour, uv]], lay(f, part, face index), roofCol }
function inPart(P, x, z) { return inPoly(P.ring, x, z) && !P.holes.some((h) => inPoly(h, x, z)); }

// stretches of face f where another part stands right outside it: cut the wall up to the lower roof
function coverFace(f, P, parts) {
  const ss = [];
  for (let s = 0.2; s < f.L - 0.2; s += 0.5) ss.push(s);
  ss.push(f.L - 0.2);
  const x0 = Math.min(f.ax, f.ax + f.ux * f.L) - 0.5, x1 = Math.max(f.ax, f.ax + f.ux * f.L) + 0.5;
  const z0 = Math.min(f.az, f.az + f.uz * f.L) - 0.5, z1 = Math.max(f.az, f.az + f.uz * f.L) + 0.5;
  for (const Q of parts) {
    if (Q === P || Q.bb[0] > x1 || Q.bb[1] < x0 || Q.bb[2] > z1 || Q.bb[3] < z0) continue;
    const yc = Math.min(Q.top, P.top + P.par);
    if (yc <= P.y0 + 0.05) continue;
    const probe = (s) => inPart(Q, f.ax + f.ux * s + f.nx * 0.3, f.az + f.uz * s + f.nz * 0.3);
    const cross = (a, b) => { const pa = probe(a); for (let i = 0; i < 7; i++) { const m = (a + b) / 2; if (probe(m) === pa) a = m; else b = m; } return (a + b) / 2; };
    const inside = ss.map(probe);
    for (let i = 0; i < ss.length; i++) {
      if (!inside[i] || (i && inside[i - 1])) continue;
      let j = i;
      while (j + 1 < ss.length && inside[j + 1]) j++;
      const s0 = i ? cross(ss[i - 1], ss[i]) : 0, s1 = j + 1 < ss.length ? cross(ss[j], ss[j + 1]) : f.L;
      f.cover.push({ s0: s0 < 0.25 ? 0 : s0, s1: s1 > f.L - 0.25 ? f.L : s1, y0: P.y0 - 1, y1: yc });
    }
  }
}
const hits = (q, c) => q.s0 < c.s1 && q.s1 > c.s0 && q.y0 < c.y1 && q.y1 > c.y0;

function buildPart(B, P, parts, S, Z, r, stats) {
  const rings = [orient(P.ring, true), ...P.holes.map((h) => orient(h, false))];
  const yTop = P.top + P.par;
  for (const R of rings) R.forEach((a, i) => {
    const f = edgeFace(a, R[(i + 1) % R.length]);
    if (f.L < 0.2) return;
    coverFace(f, P, parts);
    P.lay?.(f, P, r);
    f.open = f.open.filter((q) => q.s0 > 0.15 && q.s1 < f.L - 0.15 && !f.cover.some((c) => hits(q, c)));
    f.cuts = [...f.cover, ...f.open.filter((q) => q.t !== 'flat')].sort((p, q) => p.s0 - q.s0);
    let ya = P.y0;
    for (const [yb, key, col, uv] of P.skin) {
      const y1 = Math.min(yb, yTop);
      if (y1 > ya + 1e-3) wallBand(B[key], f, ya, y1, col, uv);
      ya = Math.max(ya, y1);
    }
    for (const q of f.open) opening(B, f, q);
    stats.open += f.open.length;
    for (const x of f.extra ?? []) x(f);
    // parapet: inner face and coping over the free stretches; roof edges for the grab mechanics
    if (P.par > 0.05) for (const [s0, s1] of freeAt(f, yTop - 0.02, yTop)) {
      B.det.setColor('#b8b5ae'); panel(B.det, f, s0, s1, P.top, yTop, -0.25, [-f.nx, 0, -f.nz]);
      B.det.setColor('#8e908f'); fbox(B.det, f, s0 - 0.02, s1 + 0.02, yTop, yTop + 0.05, -0.27, 0.04, 1 | 2 | 4 | 16 | 32);
      const p0 = pt(f, s0, 0, -0.1), p1 = pt(f, s1, 0, -0.1);
      Z.edge(p0[0], p0[2], p1[0], p1[2], yTop, f.nx, f.nz);
    }
  });
  B.det.setColor(P.roofCol ?? ROOF); B.det.fill(P.ring, P.holes, P.top, true);
  S.prism(P.ring.flat(), P.y0, yTop, 0, 0, 'wall', 0, P.holes.length ? P.holes : null);
}

// ------------------------------------------------------------------------------------------------ layouts
// window centres at `pitch` along a face of length L, the run centred, at least `edge` clear of each end
function bays(L, pitch, edge = 0.5) {
  const out = [], n = Math.max(0, Math.floor((L - 2 * edge) / pitch));
  for (let i = 0, s = (L - n * pitch + pitch) / 2; i < n; i++, s += pitch) out.push(s);
  return out;
}
const glassOf = (r) => GLASS[Math.floor(r() * GLASS.length)];

// the tower: window pairs between ribs on the long sides, one pair column near the boulevard corner on the ends
function layTower(f, P, r) {
  const yb = P.yF + P1, L = f.L, long = L > 20, end = !long && L > 12;
  const pitch = 3.0, n = Math.floor((L - 1.0) / pitch), m0 = (L - n * pitch) / 2;
  const cols = long ? bays(L, pitch, m0) : end ? [2.0, 4.6].map((d) => (f.ux > 0 ? L - d : d)) : [L / 2];
  const lit = (p) => r() < p;
  for (const c of cols) {
    for (let k = 0; k < NF; k++) {
      const y = yb + k * FH;
      f.open.push({ s0: c - 1.15, s1: c + 1.15, y0: y + 0.85, y1: y + 2.55, t: 'pair', rev: WHITE, glass: glassOf(r), lit: lit(0.3), sill: false });
    }
    const yt = yb + NF * FH;
    f.open.push({ s0: c - 0.9, s1: c + 0.9, y0: yt + 1.05, y1: yt + 1.6, t: 'win', dep: 0.15, rev: WHITE, glass: '#3e474e', lit: false, sill: false });
    // ground storey: tall glazing wherever the podium / porch leave the wall free
    const under = f.nz > 0.9 && c > 0 && f.az > 3815 && Math.abs(f.ax + f.ux * c - (PORCH[0] + PORCH[1]) / 2) < 6.5;
    if (!under && (long || end)) f.open.push({ s0: c - 1.2, s1: c + 1.2, y0: P.yF + 0.9, y1: P.yF + 3.7, t: 'win', rev: '#4c1f1f', glass: glassOf(r), lit: lit(0.35) });
  }
  if (long) f.extra = [(g) => { // slim ribs between the bays, from the red base to the roof
    B_.det.setColor('#e6e4de');
    for (let i = 0; i <= n; i++) { const s = m0 + i * pitch; if (s > 0.2 && s < L - 0.2) fbox(B_.det, g, s - 0.13, s + 0.13, yb, P.top, 0, 0.16, 1 | 2 | 4 | 16 | 32); }
  }];
}
// podium and links in the maroon cladding: a band of large windows
function layRed(f, P, r) {
  if (f.L < 4) return;
  for (const c of bays(f.L, 3.6, 0.6)) f.open.push({ s0: c - 1.3, s1: c + 1.3, y0: P.yF + 1.0, y1: P.yF + 3.5, t: 'win', rev: '#4c1f1f', glass: glassOf(r), lit: r() < 0.35 });
}
// two-storey blocks (west block, canteen): windows on the pink ground floor, a window band upstairs over a sill ledge
function layTwo(f, P, r) {
  if (f.L < 3) return;
  for (const c of bays(f.L, 3.2, 0.8)) f.open.push({ s0: c - 0.75, s1: c + 0.75, y0: P.yF + 0.9, y1: P.yF + 2.5, t: 'win', dep: 0.16, rev: '#c7988f', glass: glassOf(r), lit: r() < 0.25 });
  for (const c of bays(f.L, 2.05, 0.6)) f.open.push({ s0: c - 0.85, s1: c + 0.85, y0: P.yF + 4.7, y1: P.yF + 6.5, t: 'win', dep: 0.16, rev: '#dfe1e0', glass: glassOf(r), lit: r() < 0.25 });
  f.extra = [(g) => { B_.det.setColor('#bfc2c1'); for (const [a, b] of freeAt(g, P.yF + 3.85, P.yF + 4.1)) fbox(B_.det, g, a, b, P.yF + 3.85, P.yF + 4.1, 0, 0.22, 1 | 2 | 4 | 8 | 16 | 32); }];
}
// four-storey teaching blocks: evenly spaced three-light windows; `detail` sides get real reveals
function layTeach(detail, pitch, w) {
  return (f, P, r) => {
    if (f.L < 3) return;
    for (let k = 0; k < P.floors; k++) for (const c of bays(f.L, pitch, 0.7)) {
      const y = P.yF + k * F2;
      f.open.push({ s0: c - w / 2, s1: c + w / 2, y0: y + 0.9, y1: y + 2.75, t: detail(f) ? 'win' : 'flat', dep: 0.2, rev: '#d8ccb8', glass: glassOf(r), lit: r() < 0.22 });
    }
  };
}

// Корпус №3: blank terracotta end piers, three storeys of windows behind a white egg-crate grid, a tall top band
function layK3(f, P, r) {
  const L = f.L, pier = L > 30 ? 5.5 : 4.2, y2 = P.yF + F2 + 1.0, y3 = y2 + 3 * 3.2;
  const pitch = 2.4, cols = bays(L - 2 * pier, pitch, 0).map((c) => c + pier);
  for (const c of cols) f.open.push({ s0: c - 0.8, s1: c + 0.8, y0: P.yF + 0.8, y1: P.yF + 2.9, t: 'win', dep: 0.25, rev: '#8e4533', glass: glassOf(r), lit: r() < 0.2 });
  f.extra = [(g) => {
    if (!cols.length) return;
    const a = cols[0] - pitch / 2, b = cols[cols.length - 1] + pitch / 2, D = B_.det;
    D.setColor('#f0efea'); panel(D, g, a, b, P.yF + F2, y3, 0.01);                       // the white field behind the grid
    fbox(D, g, a, b, P.yF + F2 - 0.1, y2, 0, 0.55, 1 | 2 | 8 | 16 | 32);                     // the white apron under it
    for (let k = 0; k < 3; k++) {
      const y = y2 + k * 3.2;
      for (const c of cols) { const G = r() < 0.2 ? B_.lit : B_.glass; G.setColor(glassOf(r)); panel(G, g, c - 0.65, c + 0.65, y + 0.75, y + 2.75, 0.03); }
      D.setColor('#f4f3ee'); fbox(D, g, a, b, y + 0.6, y + 0.75, 0, 0.55, 1 | 2 | 4 | 8 | 16 | 32); // shelf / sill
    }
    D.setColor('#f7f6f1');
    for (let i = 0; i <= cols.length; i++) { const s = a + i * pitch; fbox(D, g, s - 0.09, s + 0.09, y2, y3, 0, 0.6, 1 | 2 | 16 | 32); }
    D.setColor('#3b2a24'); for (const s of [pier - 0.9, L - pier + 0.3]) panel(D, g, s, s + 0.6, P.yF + 0.4, P.top - 0.8, 0.012); // dark slots
  }];
}
// Корпус №2: the front to the boulevard gets real reveals and the glazed entrance in its middle
const k2Front = (f) => f.nx > 0.9 && f.L > 60, k2Teach = layTeach(k2Front, 3.3, 2.1);
function layK2(f, P, r) {
  k2Teach(f, P, r);
  if (!k2Front(f)) return;
  const sc = (3712.6 - f.az) / f.uz;
  f.open = f.open.filter((q) => q.y0 > P.yF + 3 || Math.abs((q.s0 + q.s1) / 2 - sc) > 4.6);
  f.open.push({ s0: sc - 3.6, s1: sc + 3.6, y0: P.yF, y1: P.yF + 3.0, t: 'door', rev: '#d8ccb8', glass: '#3b454c', lit: r() < 0.5 });
}
let B_ = null; // the builders of the running build (the layout closures draw their extras into them)

// ------------------------------------------------------------------------------------------------ build
export function buildChdtu({ root, map, solids: S, zips: Z, heightAt }) {
  const byId = new Map(map.buildings.filter((b) => CHDTU_SKIP.has(b.id)).map((b) => [b.id, b]));
  if (!byId.has(ID.main)) return null;
  const t0 = performance.now(), r = rng(ID.main % 99991);
  const B = B_ = { pan: new MB(), tile: new MB(), rough: new MB(), det: new MB(), glass: new MB(), lit: new MB(), sign: new MB() };
  const ground = (R) => { const h = R.map(([x, z]) => heightAt(x, z)); return { lo: Math.min(...h), hi: Math.max(...h) }; };

  // ---- Корпус №1: tower, podium, west block with the hall, links
  const g1 = ground([...TOWER, ...PODIUM, ...WEST, ...NORTH]);
  const yF = g1.hi + 0.9, y0 = g1.lo - 0.6, yRoofT = yF + P1 + NF * FH + TECH;
  const panUV = [3, FH, yF + P1];
  const redSkin = (top) => [[yF, 'det', PLINTH], [top + 2, 'pan', MAROON, [3, 3.3, yF]]];
  const parts = [
    { name: 'tower', ring: TOWER, holes: [], y0, yF, top: yRoofT, par: 0.7, lay: layTower, roofCol: '#5b5752',
      skin: [[yF, 'det', PLINTH], [yF + P1, 'pan', MAROON, [3, 3.3, yF]], [yRoofT + 1, 'pan', WHITE, panUV]] },
    { name: 'podium', ring: PODIUM, holes: [], y0, yF, top: yF + P1, par: 0.5, lay: layRed, skin: redSkin(yF + P1) },
    { name: 'south', ring: SOUTH, holes: [], y0, yF, top: yF + P1, par: 0.5, lay: layRed, skin: redSkin(yF + P1) },
    { name: 'west', ring: WEST, holes: [], y0, yF, top: yF + 8.2, par: 0.6, lay: layTwo,
      skin: [[yF, 'det', PLINTH], [yF + 3.9, 'rough', PINK, [2, 2, 0]], [yF + 9, 'pan', PALE, [3, 2.2, yF + 3.9]]] },
    { name: 'hall', ring: HALL, holes: [], y0: yF + 8.2, yF, top: yF + 11.6, par: 0.4, skin: [[yF + 12, 'pan', '#e3e4e2', [3, 3.4, yF + 8.2]]] },
    { name: 'north', ring: NORTH, holes: [], y0, yF, top: yF + 2 * F2, par: 0.6, floors: 2, lay: layTeach(() => false, 3.3, 1.9),
      skin: [[yF + 0.4, 'det', REDPL], [yF + 8, 'tile', BEIGE, [2.4, 2.4, 0]]] },
  ];
  const k1Parts = parts.length;

  // ---- the other blocks from the map rings (the gallery stub cut off Корпус №2 and Корпус №4)
  const fromMap = (id, keep, P) => {
    const b = byId.get(id);
    if (!b) return;
    const ring = ringPts(b.p).filter(keep), holes = (b.holes ?? []).map(ringPts), g = ground(ring);
    const yf = g.hi + 0.45;
    parts.push({ ring, holes, y0: g.lo - 0.6, yF: yf, ...P(yf) });
  };
  const teachSkin = (yf, col, top) => [[yf + 0.55, 'det', REDPL], [top + 2, 'tile', col, [2.4, 2.4, 0]]];
  fromMap(ID.k2, ([x]) => x !== -231, (yf) => ({ name: 'k2', top: yf + 4 * F2, par: 0.8, floors: 4, roofCol: '#655a52',
    lay: layK2, skin: teachSkin(yf, BEIGE, yf + 4 * F2) }));
  fromMap(ID.k4, ([x]) => x !== -231, (yf) => ({ name: 'k4', top: yf + 4 * F2, par: 0.8, floors: 4,
    lay: layTeach(() => false, 3.3, 2.3), skin: teachSkin(yf, CREAM, yf + 4 * F2) }));
  fromMap(ID.k3, () => true, (yf) => ({ name: 'k3', top: yf + F2 + 1.0 + 3 * 3.2 + 2.6, par: 0.3, lay: layK3,
    skin: [[yf, 'det', PLINTH], [yf + 30, 'rough', TERRA, [2, 2, 0]]] }));
  fromMap(ID.cafe, () => true, (yf) => ({ name: 'cafe', top: yf + 8.0, par: 0.5, lay: layTwo,
    skin: [[yf, 'det', PLINTH], [yf + 3.9, 'rough', PINK, [2, 2, 0]], [yf + 9, 'pan', PALE, [3, 2.2, yf + 3.9]]] }));

  const stats = { open: 0 };
  for (const P of parts) P.bb = P.ring.reduce((o, [x, z]) => [Math.min(o[0], x), Math.max(o[1], x), Math.min(o[2], z), Math.max(o[3], z)], [1e9, -1e9, 1e9, -1e9]);
  for (const P of parts) buildPart(B, P, parts, S, Z, r, stats);
  const k2 = parts.find((p) => p.name === 'k2'), D = B.det;

  // ---- tower roof: stair / lift headhouses, cell masts
  D.setColor('#e9e7e1');
  for (const [x0, z0, x1, z1] of [[-142, 3767, -134.6, 3773.4], [-126.2, 3790.4, -118.4, 3796.2]]) {
    D.box(x0, yRoofT, z0, x1, yRoofT + 3.6, z1, 1 | 2 | 4 | 16 | 32);
    S.box(x0, yRoofT, z0, x1, yRoofT + 3.6, z1, 'wall');
  }
  D.setColor('#7b7f82');
  for (const [x, z, h] of [[-138, 3770, 7.5], [-122, 3793, 6.5]]) {
    const yb = yRoofT + 3.6;
    D.cyl(x, yb, z, 0.09, 0.07, h, 6);
    for (let k = 0; k < 3; k++) { const a = k * 2.094, cx = x + Math.cos(a) * 0.35, cz = z + Math.sin(a) * 0.35; D.box(cx - 0.12, yb + h - 1.9, cz - 0.12, cx + 0.12, yb + h - 0.4, cz + 0.12); }
  }
  // ---- main entrance porch (Kobzarska side): red cheeks, recessed glazed doors, the lettered fascia, steps
  const [px0, px1, pz0, pz1] = PORCH, gP = heightAt((px0 + px1) / 2, pz1 + 2);
  D.setColor(MAROON);
  for (const x of [px0, px1 - 0.6]) { D.box(x, yF, pz0, x + 0.6, yF + 3.4, pz1); S.box(x, yF, pz0, x + 0.6, yF + 3.4, pz1, 'wall'); }
  D.setColor('#4c1f1f'); D.box(px0 + 0.6, yF + 2.9, pz0, px1 - 0.6, yF + 3.4, pz0 + 1.0, 8 | 16);
  B.glass.setColor('#3a444b'); B.glass.box(px0 + 2.6, yF, pz0 + 0.9, px1 - 2.6, yF + 2.9, pz0 + 1.0, 16);
  D.setColor('#5b2020'); D.box(px0 + 0.6, yF, pz0 + 0.95, px0 + 2.6, yF + 2.9, pz0 + 1.0, 16); D.box(px1 - 2.6, yF, pz0 + 0.95, px1 - 0.6, yF + 2.9, pz0 + 1.0, 16);
  D.setColor('#9ea3a6'); for (let x = px0 + 2.6; x <= px1 - 2.5; x += 1.2) D.box(x - 0.04, yF, pz0 + 1.0, x + 0.04, yF + 2.9, pz0 + 1.03, 16);
  D.setColor('#d7d9d8'); D.box(px0 - 0.1, yF + 3.4, pz0, px1 + 0.1, yF + 5.3, pz1 + 0.1, 1 | 2 | 4 | 8);
  B.sign.setColor('#ffffff');
  q4(B.sign, [px0 - 0.1, yF + 3.4, pz1 + 0.11], [px1 + 0.1, yF + 3.4, pz1 + 0.11], [px1 + 0.1, yF + 5.3, pz1 + 0.11], [px0 - 0.1, yF + 5.3, pz1 + 0.11], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  S.box(px0 - 0.1, yF + 3.4, pz0, px1 + 0.1, yF + 5.3, pz1 + 0.1, 'awning', 1);
  D.setColor('#8d8984'); D.box(px0, g1.lo - 0.3, pz0, px1, yF, pz1, 1 | 2 | 4 | 16);
  S.box(px0, g1.lo - 0.3, pz0, px1, yF, pz1, 'wall');
  const nSt = Math.max(1, Math.round((yF - gP) / 0.16)), stD = 0.34;
  D.setColor('#9a958e');
  for (let i = 0; i < nSt; i++) D.box(px0 - 0.4, gP - 0.3, pz1, px1 + 0.4, yF - (i + 1) * (yF - gP) / (nSt + 0.5) + 0.02, pz1 + (i + 1) * stD, 1 | 2 | 4 | 16);
  const zs = pz1 + nSt * stD;
  S.prism([px0 - 0.4, pz1, px1 + 0.4, pz1, px1 + 0.4, zs, px0 - 0.4, zs], gP - 0.3, yF + (yF - gP) * pz1 / (zs - pz1), 0, -(yF - gP) / (zs - pz1), 'ramp');
  D.setColor('#6f7274'); for (const x of [px0 + 0.2, px1 - 0.2]) B.det.tube([x, yF + 0.9, pz1], [x, gP + 0.9, zs], 0.03, 5);

  // ---- flags by the podium's boulevard corner
  for (const [z, top, bot] of [[3806.5, '#1f5fb8', '#ffd21f'], [3810, '#1d4b9a', '#1d4b9a']]) {
    const x = -102.6, gy = heightAt(x, z);
    D.setColor('#c9ccce'); D.cyl(x, gy, z, 0.06, 0.04, 9.5, 6);
    for (const [c, a, b] of [[top, 0.55, 1.1], [bot, 0, 0.55]]) {
      D.setColor(c);
      const y0f = gy + 8.2 + a, y1f = gy + 8.2 + b;
      for (const n of [1, -1]) q4(D, [x, y0f, z], [x, y0f, z + 1.65], [x, y1f, z + 1.65], [x, y1f, z], [n, 0, 0]);
    }
    S.cyl(x, z, gy, gy + 9.5, 0.08, 0.08, 'pole');
  }
  // ---- «Сходи знань»: a bronze figure stepping up a red granite stair, on a round granite base
  {
    const [sx, sz] = STATUE, gy = heightAt(sx, sz);
    D.setColor('#6d6862'); D.cyl(sx, gy - 0.3, sz, 3.4, 3.4, 0.62, 28);
    D.setColor('#7a2b25');
    for (let i = 0; i < 5; i++) D.box(sx - 1.3 + i * 0.35, gy + 0.3, sz - 0.9, sx + 1.3, gy + 0.3 + (i + 1) * 0.42, sz + 0.9);
    S.box(sx - 1.3, gy, sz - 0.9, sx + 1.3, gy + 2.4, sz + 0.9, 'statue');
    const top = gy + 2.4, fx = sx + 0.6, k = 1.4; // the figure, ~4 m, arms raised
    D.setColor('#3b3029');
    D.cyl(fx, top, sz, 0.34 * k, 0.2 * k, 1.7 * k, 10);                   // gown
    D.ellipsoid([fx, top + 2.02 * k, sz], [0.16 * k, 0.2 * k, 0.16 * k], 8, 6);
    D.tube([fx, top + 1.65 * k, sz + 0.15 * k], [fx - 0.25 * k, top + 2.75 * k, sz + 0.45 * k], 0.07 * k, 5);
    D.tube([fx, top + 1.65 * k, sz - 0.15 * k], [fx + 0.2 * k, top + 2.8 * k, sz - 0.4 * k], 0.07 * k, 5);
    D.tube([fx, top + 1.2 * k, sz], [fx, top + 1.8 * k, sz], 0.13 * k, 6);  // shoulders and neck
    D.cyl(fx - 0.3, top - 0.42, sz + 0.2, 0.1, 0.1, 0.9, 6);               // the leg on the step below
  }
  // ---- the glazed gallery from Корпус №2 to Корпус №4 over the path, on two pairs of columns
  if (k2) {
    const [x0, x1, z0, z1] = GALLERY, yb = k2.yF + F2 - 0.45, yt = k2.yF + 2 * F2 - 0.2, gy = heightAt((x0 + x1) / 2, (z0 + z1) / 2);
    D.setColor(BEIGE); D.box(x0, yb, z0, x1, yb + 1.3, z1, 4 | 8 | 16 | 32); D.box(x0, yt - 0.5, z0, x1, yt, z1, 16 | 32);
    D.setColor(ROOF); D.box(x0, yt, z0, x1, yt + 0.02, z1, 4);
    B.glass.setColor('#566570'); B.glass.box(x0, yb + 1.3, z0 + 0.05, x1, yt - 0.5, z1 - 0.05, 16 | 32);
    D.setColor(FRAME); for (let x = x0 + 1.5; x < x1; x += 1.5) D.box(x - 0.04, yb + 1.3, z0, x + 0.04, yt - 0.5, z1, 16 | 32);
    S.box(x0, yb, z0, x1, yt, z1, 'wall', 1);
    D.setColor('#cfc6b6');
    for (const x of [-226, -208.5]) for (const z of [z0 + 0.25, z1 - 0.25]) { D.box(x - 0.2, gy - 0.3, z - 0.2, x + 0.2, yb, z + 0.2, 1 | 2 | 16 | 32); S.box(x - 0.2, gy - 0.3, z - 0.2, x + 0.2, yb, z + 0.2, 'pole'); }
    // Корпус №2 front entrance: a flat canopy on two posts and a few steps before the glazed doors
    const zc = 3712.6, xe = -142.8, gE = heightAt(xe + 2, zc);
    D.setColor('#e8e6df'); D.box(xe, k2.yF + 3.25, zc - 4.8, xe + 2.8, k2.yF + 3.5, zc + 4.8);
    S.box(xe, k2.yF + 3.25, zc - 4.8, xe + 2.8, k2.yF + 3.5, zc + 4.8, 'awning', 1);
    D.setColor('#9ea3a6'); for (const z of [zc - 4.4, zc + 4.4]) D.box(xe + 2.4, gE, z - 0.08, xe + 2.56, k2.yF + 3.25, z + 0.08, 1 | 2 | 16 | 32);
    D.setColor('#9a958e'); D.box(xe, gE - 0.3, zc - 4, xe + 1.4, k2.yF, zc + 4, 1 | 4 | 16 | 32); D.box(xe + 1.4, gE - 0.3, zc - 4, xe + 1.8, (gE + k2.yF) / 2, zc + 4, 1 | 4 | 16 | 32);
  }

  // ---- meshes
  const group = Object.assign(new THREE.Group(), { name: 'chdtu' });
  root.add(group);
  const signMap = signTex();
  const M = {
    pan: new THREE.MeshStandardMaterial({ map: panelTex(r), vertexColors: true, roughness: 0.75 }),
    tile: new THREE.MeshStandardMaterial({ map: tileTex(r), vertexColors: true, roughness: 0.5 }),
    rough: new THREE.MeshStandardMaterial({ map: roughTex(r), vertexColors: true, roughness: 0.95 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.35, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffdcaa, emissiveIntensity: 0 }),
    sign: new THREE.MeshStandardMaterial({ map: signMap, emissiveMap: signMap, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.45, metalness: 0.3 }),
  };
  let nV = 0;
  for (const [k, Dm] of Object.entries(B)) {
    if (!Dm.v) continue;
    nV += Dm.v;
    const glassy = k === 'glass' || k === 'lit';
    group.add(Object.assign(new THREE.Mesh(Dm.build(), M[k]), { name: 'chdtu-' + k, castShadow: !glassy, receiveShadow: true }));
  }
  B_ = null;
  console.log(`[cherkasy] ChDTU: ${parts.length} masses (${k1Parts} of the main building), ${stats.open} openings, ${(nV / 1000).toFixed(1)}k verts, ${S.count ?? '?'} solids total, in ${(performance.now() - t0).toFixed(0)} ms`);

  // footprints: one per replaced OSM building; clearing: the parts plus a 2.5 m margin, the porch steps and the statue
  const H = { [ID.main]: yRoofT + 4 - yF, [ID.k2]: 4 * F2 + 1, [ID.k3]: 17, [ID.k4]: 4 * F2 + 1, [ID.cafe]: 8.5 };
  const footprints = [...byId.values()].map((b) => ({ poly: ringPts(b.p), h: H[b.id], kind: 'public', name: b.name }));
  const boxes = parts.map((P) => [P.bb[0] - 2.5, P.bb[1] + 2.5, P.bb[2] - 2.5, P.bb[3] + 2.5, P]);
  const near = (P, x, z) => inPoly(P.ring, x, z) || [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]].some(([dx, dz]) => inPoly(P.ring, x + dx, z + dz));
  return {
    footprints,
    clear: (x, z) => {
      if (x < -290 || x > -95 || z < 3575 || z > 3835) return false;
      if (x > PORCH[0] - 1.5 && x < PORCH[1] + 1.5 && z > PORCH[2] && z < PORCH[3] + 6) return true;
      if (Math.hypot(x - STATUE[0], z - STATUE[1]) < 4.5) return true;
      if (x > GALLERY[0] && x < GALLERY[1] && z > GALLERY[2] - 2 && z < GALLERY[3] + 2) return true;
      for (const [a, b, c, d, P] of boxes) if (x > a && x < b && z > c && z < d && near(P, x, z)) return true;
      return false;
    },
    update() { M.lit.emissiveIntensity = 1.3 * nightK.value; M.sign.emissiveIntensity = 0.35 * nightK.value; },
  };
}
