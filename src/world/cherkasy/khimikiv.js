// OWNER: cherkasy. Проспект Хіміків, 44 (Khimselyshche): the 5-storey brick "khrushchevka" rebuilt after Street View
// photos (GitHub issue #1: the generic extrusion looked like every neighbour). Cream ceramic tiles on the street end
// and both long sides, the south-west end left in bare red brick; windows set into real reveals, in white PVC or old
// brown timber; balcony stacks on the north-west side (enclosed or open, yellow / cream / striped sheet fronts, a tin
// canopy over the top one), entrance canopies with stair windows on the half-landings on the south-east yard side, a
// low porch roof on the street end, a grey plinth with basement vents, a thin parapet with a galvanised coping, wall AC
// units, lit windows at night.
//   KHIM_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildKhimikiv({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Layout is per facade in a face frame: s metres to the right as seen from outside, y up, o outward from the wall.
// The walls are strips between the openings with tiling tile / brick textures (uv in metres), so the windows keep
// real depth and the masonry stays crisp up close, at a few thousand vertices for the whole block.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, obb, rng, area2 } from './geo.js';

const OSM_ID = 108980190;
export const KHIM_SKIP = new Set([OSM_ID]);

const FH = 2.8, NF = 5, RAISE = 0.9, PARA = 0.5; // storey, storeys, ground floor above grade, parapet over the roof
const SILL = 0.85, WIN_H = 1.45, DEP = 0.16;      // window sill above the floor, window height, reveal depth
const TILE_M = 2, BRICK = [2.08, 1.95];           // metres per texture repeat (8 x 8 tiles; 8 bricks x 26 courses)
const UP = [0, 1, 0], DOWN = [0, -1, 0];
const neg = (v) => [-v[0], -v[1], -v[2]];
const PVC = '#ecebe6', WOOD = '#6b4a32', RAIL = '#55575a', GALV = '#c3c6c3', SLAB = '#a8a59d';
const GLASS = ['#4d565c', '#5a6266', '#646a6c', '#454c52', '#8f8a80', '#a29d92'];
const TINTS = ['#dcb64c', '#ddd2b8', '#e9e7df', '#cdbf9c', '#b9a47c'];

// ------------------------------------------------------------------------------------------------ textures
function canvasTex(w, h, paint) {
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  paint(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const rgb = (c, k) => `rgb(${c.map((v) => Math.min(255, Math.round(v * k))).join(',')})`;
// 0.25 m glazed tiles, each fired a shade apart, the grout greyed by dust
const tileTex = (r) => canvasTex(512, 512, (g, w) => {
  g.fillStyle = '#cdb99a'; g.fillRect(0, 0, w, w);
  const p = w / 8;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const k = 0.95 + r() * 0.07, c = r() < 0.07 ? [232, 208, 172] : [244, 226, 192];
    g.fillStyle = rgb(c, k); g.fillRect(i * p + 1.5, j * p + 1.5, p - 3, p - 3);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(i * p + 3, j * p + 3, p - 10, 5);
  }
});
// running bond in faded red brick: lime mortar, a few burnt and a few pale bricks, soot and salt speckle
const brickTex = (r) => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#b49c8a'; g.fillRect(0, 0, w, h);
  const bw = w / 8, bh = h / 26;
  for (let j = 0; j < 26; j++) for (let i = 0; i < 8; i++) {
    const u = r(), c = u < 0.12 ? [116, 64, 52] : u < 0.3 ? [172, 112, 90] : [150, 90, 72];
    g.fillStyle = rgb(c, 0.9 + r() * 0.18);
    const x = i * bw + (j & 1 ? bw / 2 : 0) + 1.5;
    for (const dx of [0, -w]) g.fillRect(x + dx, j * bh + 1.5, bw - 3, bh - 3); // the half brick wraps round the seam
  }
  for (let q = 0; q < 2500; q++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,240,225,0.10)' : 'rgba(40,20,10,0.12)';
    g.fillRect(r() * w, r() * h, 2 + r() * 4, 1 + r() * 2);
  }
});
// corrugated sheet for the balcony fronts (tinted per balcony through the vertex colour), 12.5 cm ribs
const sheetTex = () => canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 16) {
    g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(x + 10, 0, 4, h);
    g.fillStyle = 'rgba(120,110,100,0.08)'; g.fillRect(x, 0, 2, h);
  }
});

// ------------------------------------------------------------------------------------------------ face frame
// face centred at c + n * dist, width w; r = the viewer's right when looking at it from outside
function faceAt(cx, cz, nx, nz, dist, w, skin) {
  const rx = nz, rz = -nx, mx = cx + nx * dist, mz = cz + nz * dist;
  return { nx, nz, rx, rz, w, skin, ox: mx - rx * w / 2, oz: mz - rz * w / 2, open: [], N: [nx, 0, nz], R: [rx, 0, rz] };
}
const at = (f, s, y, o = 0) => [f.ox + f.rx * s + f.nx * o, y, f.oz + f.rz * s + f.nz * o];

// quad a b c d facing n (the winding follows n), optional uv per corner
function quad(D, a, b, c, d, n, uv) {
  const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], g = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const side = n[0] * (e[1] * g[2] - e[2] * g[1]) + n[1] * (e[2] * g[0] - e[0] * g[2]) + n[2] * (e[0] * g[1] - e[1] * g[0]);
  const V = [a, b, c, d].map((p, k) => D.vert(p[0], p[1], p[2], n[0], n[1], n[2], uv ? uv[k][0] : 0, uv ? uv[k][1] : 0));
  if (side >= 0) D.quad(V[0], V[1], V[2], V[3]); else D.quad(V[0], V[3], V[2], V[1]);
}
// box in the face frame; m bits: 1 front (o1), 2 back (o0), 4 left (s0), 8 right (s1), 16 top, 32 bottom
function fbox(D, f, s0, s1, y0, y1, o0, o1, m = 63) {
  const P = (s, y, o) => at(f, s, y, o);
  if (m & 1) quad(D, P(s0, y0, o1), P(s1, y0, o1), P(s1, y1, o1), P(s0, y1, o1), f.N);
  if (m & 2) quad(D, P(s0, y0, o0), P(s1, y0, o0), P(s1, y1, o0), P(s0, y1, o0), neg(f.N));
  if (m & 4) quad(D, P(s0, y0, o0), P(s0, y0, o1), P(s0, y1, o1), P(s0, y1, o0), neg(f.R));
  if (m & 8) quad(D, P(s1, y0, o0), P(s1, y0, o1), P(s1, y1, o1), P(s1, y1, o0), f.R);
  if (m & 16) quad(D, P(s0, y1, o0), P(s1, y1, o0), P(s1, y1, o1), P(s0, y1, o1), UP);
  if (m & 32) quad(D, P(s0, y0, o0), P(s1, y0, o0), P(s1, y0, o1), P(s0, y0, o1), DOWN);
}
// collision prism over an s / o rectangle of the face
function fprism(S, f, s0, s1, o0, o1, y0, y1, kind, flags = 0) {
  const Q = [[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = at(f, s, 0, o); return [p[0], p[2]]; });
  if (area2(Q) < 0) Q.reverse();
  S.prism(Q.flat(), y0, y1, 0, 0, kind, flags);
}

// free s-intervals of the band y0..y1 (the openings crossing it cut it)
function freeSpans(f, y0, y1) {
  const cuts = f.open.filter((q) => q.y0 < y1 - 1e-3 && q.y1 > y0 + 1e-3).map((q) => [q.s0, q.s1]).sort((a, b) => a[0] - b[0]);
  const out = [];
  let s = 0;
  for (const [a, b] of cuts) { if (a > s + 1e-3) out.push([s, a]); s = Math.max(s, b); }
  if (s < f.w - 1e-3) out.push([s, f.w]);
  return out;
}
// wall surface from y0 to y1 around the openings, split at every opening edge; uvM: metres per repeat (null: no uv)
function wallBand(D, f, y0, y1, uvM, color) {
  const ys = [...new Set([y0, y1, ...f.open.flatMap((q) => [q.y0, q.y1]).filter((y) => y > y0 && y < y1)])].sort((a, b) => a - b);
  D.setColor(color);
  for (let i = 0; i + 1 < ys.length; i++) {
    const ya = ys[i], yb = ys[i + 1];
    for (const [a, b] of freeSpans(f, ya, yb)) {
      const uv = uvM && [[a / uvM[0], ya / uvM[1]], [b / uvM[0], ya / uvM[1]], [b / uvM[0], yb / uvM[1]], [a / uvM[0], yb / uvM[1]]];
      quad(D, at(f, a, ya), at(f, b, ya), at(f, b, yb), at(f, a, yb), f.N, uv);
    }
  }
}

// ------------------------------------------------------------------------------------------------ openings
// q: { s0, s1, y0, y1, kind: 'win' | 'bdoor' (balcony door, solid lower panel) | 'door', frame, glass, lit, col }
function opening(B, f, q) {
  const D = B.det, { s0, s1, y0, y1 } = q, back = -DEP, fr = back + 0.05, t = 0.06;
  D.setColor(f.skin === 'brick' ? '#9a5e4a' : '#cdc2ac'); // reveals
  quad(D, at(f, s0, y0), at(f, s0, y0, back), at(f, s0, y1, back), at(f, s0, y1), f.R);
  quad(D, at(f, s1, y0), at(f, s1, y0, back), at(f, s1, y1, back), at(f, s1, y1), neg(f.R));
  quad(D, at(f, s0, y1), at(f, s1, y1), at(f, s1, y1, back), at(f, s0, y1, back), DOWN);
  quad(D, at(f, s0, y0), at(f, s1, y0), at(f, s1, y0, back), at(f, s0, y0, back), UP);
  if (q.kind === 'door') { // steel entrance door with a small wired-glass light
    D.setColor(q.col); fbox(D, f, s0, s1, y0, y1, back, back + 0.04, 1);
    D.setColor('#2c3136'); fbox(D, f, s0 + 0.35, s1 - 0.35, y1 - 0.75, y1 - 0.3, back, back + 0.045, 1);
    return;
  }
  D.setColor(q.frame);
  fbox(D, f, s0, s1, y1 - t, y1, back, fr, 1 | 32);
  fbox(D, f, s0, s1, y0, y0 + t, back, fr, 1 | 16);
  fbox(D, f, s0, s0 + t, y0 + t, y1 - t, back, fr, 1 | 8);
  fbox(D, f, s1 - t, s1, y0 + t, y1 - t, back, fr, 1 | 4);
  const w = s1 - s0, n = w > 1.6 ? 3 : w > 0.8 ? 2 : 1;
  for (let i = 1; i < n; i++) { const m = s0 + w * i / n; fbox(D, f, m - 0.035, m + 0.035, y0 + t, y1 - t, back, fr, 1 | 4 | 8); }
  let gy = y0 + t;
  if (q.kind === 'bdoor') { gy = y0 + 0.9; fbox(D, f, s0 + t, s1 - t, y0 + t, gy, back, back + 0.03, 1); fbox(D, f, s0 + t, s1 - t, gy - 0.03, gy + 0.03, back, fr, 1 | 16); }
  if (q.frame === WOOD && y1 - gy > 1.2) { const ym = gy + (y1 - gy) * 0.7; fbox(D, f, s0 + t, s1 - t, ym - 0.03, ym + 0.03, back, fr, 1 | 16 | 32); } // old timber: a top-hung vent light
  const G = q.lit ? B.lit : B.glass, gz = back + 0.015;
  G.setColor(q.glass);
  quad(G, at(f, s0 + t, gy, gz), at(f, s1 - t, gy, gz), at(f, s1 - t, y1 - t, gz), at(f, s0 + t, y1 - t, gz), f.N);
  if (q.kind === 'win') { D.setColor(GALV); fbox(D, f, s0 - 0.05, s1 + 0.05, y0 - 0.045, y0, -0.03, 0.07, 1 | 4 | 8 | 16); }
}

// ------------------------------------------------------------------------------------------------ balconies
// one balcony at floor level y centred on s = c; st: { glazed, tint, frame, glass, lit }; top: the canopy goes on it
function balcony(B, f, c, w, y, st, top) {
  const D = B.det, d = 1.05, a = c - w / 2, b = c + w / 2, ph = 1.0, fo = d - 0.03, yc = y + FH - 0.14;
  D.setColor(SLAB); fbox(D, f, a, b, y - 0.14, y, 0, d, 1 | 4 | 8 | 16 | 32);
  B.sheet.setColor(st.tint); // parapet sheets, front and both ends (double-sided material)
  quad(B.sheet, at(f, a, y, fo), at(f, b, y, fo), at(f, b, y + ph, fo), at(f, a, y + ph, fo), f.N, [[a / 2, 0], [b / 2, 0], [b / 2, 1], [a / 2, 1]]);
  for (const s of [a + 0.02, b - 0.02]) quad(B.sheet, at(f, s, y), at(f, s, y, fo), at(f, s, y + ph, fo), at(f, s, y + ph), f.R, [[0, 0], [d / 2, 0], [d / 2, 1], [0, 1]]);
  D.setColor(RAIL);
  fbox(D, f, a, b, y + ph, y + ph + 0.05, fo - 0.03, fo + 0.03, 1 | 16 | 32);
  for (const s of [a, b - 0.05]) fbox(D, f, s, s + 0.05, y + ph, y + ph + 0.05, 0, fo, 4 | 8 | 16);
  if (st.glazed) { // residents' glazing: panes on all three sides, a mullion every ~0.65 m
    const G = st.lit ? B.lit : B.glass, g0 = y + ph + 0.05;
    G.setColor(st.glass);
    quad(G, at(f, a, g0, fo), at(f, b, g0, fo), at(f, b, yc, fo), at(f, a, yc, fo), f.N);
    quad(G, at(f, a + 0.02, g0), at(f, a + 0.02, g0, fo), at(f, a + 0.02, yc, fo), at(f, a + 0.02, yc), neg(f.R));
    quad(G, at(f, b - 0.02, g0), at(f, b - 0.02, g0, fo), at(f, b - 0.02, yc, fo), at(f, b - 0.02, yc), f.R);
    D.setColor(st.frame);
    const n = Math.max(2, Math.round(w / 0.65));
    for (let i = 0; i <= n; i++) { const m = a + 0.03 + (w - 0.06) * i / n; fbox(D, f, m - 0.03, m + 0.03, g0, yc, fo - 0.02, fo + 0.02, 1 | 4 | 8); }
    fbox(D, f, a, b, yc - 0.06, yc, fo - 0.02, fo + 0.02, 1 | 32);
    for (const s of [a, b - 0.05]) fbox(D, f, s, s + 0.05, g0, yc, d * 0.5 - 0.03, d * 0.5 + 0.03, 4 | 8);
  } else { // open: two corner posts of the steel frame carry the slab / canopy above
    for (const s of [a + 0.03, b - 0.03]) fbox(D, f, s - 0.025, s + 0.025, y + ph, yc, fo - 0.025, fo + 0.025, 1 | 4 | 8);
  }
  if (top) { // tin canopy on a steel frame, falling away from the wall
    const yw = yc + 0.4, yf = yc + 0.05, ce = d + 0.15, drop = yw - yf, L = Math.hypot(ce, drop);
    const up = [f.nx * drop / L, ce / L, f.nz * drop / L];
    const P = [at(f, a - 0.1, yw), at(f, b + 0.1, yw), at(f, b + 0.1, yf, ce), at(f, a - 0.1, yf, ce)];
    D.setColor('#85847e'); quad(D, ...P, up); quad(D, ...P, neg(up));
    D.setColor(RAIL); fbox(D, f, a - 0.1, b + 0.1, yf - 0.05, yf, ce - 0.05, ce, 1 | 32);
  }
}
const style = (r) => ({
  glazed: r() < 0.55, tint: TINTS[Math.floor(r() * TINTS.length)], lit: r() < 0.25,
  frame: r() < 0.5 ? PVC : r() < 0.6 ? WOOD : '#3b3a38', glass: GLASS[Math.floor(r() * GLASS.length)],
});

// ------------------------------------------------------------------------------------------------ build
export function buildKhimikiv({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((q) => q.id === OSM_ID);
  if (!b) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 99991);
  const o = obb(ringPts(b.p));
  // long axis (ux, uz) with half length hl; across (vx, vz) with half width hw
  let ux = o.ux, uz = o.uz, hl = o.L / 2, hw = o.W / 2;
  if (hl < hw) { [ux, uz] = [-uz, ux]; [hl, hw] = [hw, hl]; }
  const vx = -uz, vz = ux, cx = o.cx, cz = o.cz;
  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([i, j]) => [cx + ux * hl * i + vx * hw * j, cz + uz * hl * i + vz * hw * j]);
  const hs = [...corners, [cx, cz]].map(([x, z]) => heightAt(x, z));
  const yG = hs.reduce((s, h) => s + h, 0) / hs.length, gBase = Math.min(...hs) - 0.4;
  const yF = yG + RAISE, yP = yF - 0.05, yRoof = yF + NF * FH, yTop = yRoof + PARA;
  const floorY = (k) => yF + k * FH;

  // faces: the ends along +-u, the long sides along +-v; the street end looks east at the prospekt (+x), the
  // balconies are on the north-west side (-z), the entrances on the south-east yard side
  const sg = (x) => (x >= 0 ? 1 : -1);
  const eu = sg(ux), ev = sg(-vz);
  const fNE = faceAt(cx, cz, ux * eu, uz * eu, hl, 2 * hw, 'tile');
  const fSW = faceAt(cx, cz, -ux * eu, -uz * eu, hl, 2 * hw, 'brick');
  const fNW = faceAt(cx, cz, vx * ev, vz * ev, hw, 2 * hl, 'tile');
  const fSE = faceAt(cx, cz, -vx * ev, -vz * ev, hw, 2 * hl, 'tile');
  const faces = [fNE, fNW, fSW, fSE];

  const B = { tile: new MB(), brick: new MB(), det: new MB(), sheet: new MB(), glass: new MB(), lit: new MB() };
  const winOf = (f, c, w, k, extra) => {
    const wood = r() < 0.25;
    f.open.push({ s0: c - w / 2, s1: c + w / 2, y0: floorY(k) + SILL, y1: floorY(k) + SILL + WIN_H, kind: 'win',
      frame: wood ? WOOD : PVC, glass: GLASS[Math.floor(r() * GLASS.length)], lit: r() < 0.3, ...extra });
  };
  const balconyWall = (f, c, k) => { // balcony door + window behind a balcony
    f.open.push({ s0: c - 1.2, s1: c - 0.45, y0: floorY(k) + 0.02, y1: floorY(k) + SILL + WIN_H, kind: 'bdoor', frame: PVC, glass: GLASS[Math.floor(r() * 4)], lit: r() < 0.3 });
    winOf(f, c + 0.35, 1.3, k);
  };
  const stacks = []; // [face, centre, width, styles per floor 1..4]
  const acs = [];    // [face, s, y]

  // street end (13 m): three window columns – narrow, single, triple – the corner by the balconies left blank; a porch
  // roof over the shop door on the left of the ground floor
  const W1 = fNE.w;
  for (let k = 0; k < NF; k++) {
    winOf(fNE, 1.3, 0.9, k);
    if (k) winOf(fNE, 4.3, 1.35, k);
    winOf(fNE, W1 * 0.63, k ? 1.9 : 2.1, k);
  }
  const pp = at(fNE, 2, 0, 1), gP = heightAt(pp[0], pp[2]);
  fNE.open.push({ s0: 1.4, s1: 2.6, y0: gP + 0.15, y1: gP + 2.35, kind: 'door', col: '#6b6f72' });
  fNE.open.push({ s0: 3.4, s1: 5.3, y0: floorY(0) + 0.4, y1: floorY(0) + SILL + WIN_H, kind: 'win', frame: PVC, glass: '#3b4650', lit: true });
  acs.push([fNE, W1 * 0.63 + 1.45, floorY(3) + 1.15], [fNE, 4.3 - 1.2, floorY(2) + 1.3]);

  // south-west end, bare brick: one window column and a balcony stack
  const W2 = fSW.w;
  for (let k = 0; k < NF; k++) winOf(fSW, W2 * 0.35, k === NF - 1 ? 2.0 : 1.5, k);
  winOf(fSW, W2 * 0.64, 1.5, 0);
  for (let k = 1; k < NF; k++) balconyWall(fSW, W2 * 0.64, k);
  const striped = (glazed = false) => ({ glazed, tint: '#dcd3bd', frame: WOOD, glass: '#8e8a80', lit: false });
  stacks.push([fSW, W2 * 0.64, 2.8, [striped(), striped(), striped(true), striped()]]);

  // long sides: four sections (entrances) of ~17 m
  const L = fNW.w, sec = L / 4;
  for (let i = 0; i < 4; i++) {
    const sc = sec * (i + 0.5);
    // north-west: balconies at +-6.3 m from the section centre, a triple kitchen window between them
    for (const bc of [sc - 6.3, sc + 6.3]) {
      winOf(fNW, bc, 1.5, 0);
      for (let k = 1; k < NF; k++) balconyWall(fNW, bc, k);
      stacks.push([fNW, bc, 2.6, [1, 2, 3, 4].map(() => style(r))]);
    }
    for (let k = 0; k < NF; k++) { winOf(fNW, sc, 1.8, k); winOf(fNW, sc - 3.4, 1.4, k); winOf(fNW, sc + 3.4, 1.4, k); }
    // south-east: the entrance, stair windows on the half-landings above it, flats either side
    const pd = at(fSE, sc, 0, 1), yd = heightAt(pd[0], pd[2]) + 0.15;
    fSE.open.push({ s0: sc - 0.65, s1: sc + 0.65, y0: yd, y1: yd + 2.15, kind: 'door', col: ['#5b3a2e', '#3f5f86', '#4a4d50', '#3f6147'][i] });
    for (let k = 0; k < NF - 1; k++) {
      const y0 = floorY(k) + FH / 2 + 0.9;
      fSE.open.push({ s0: sc - 0.6, s1: sc + 0.6, y0, y1: y0 + 1.1, kind: 'win', frame: r() < 0.6 ? WOOD : PVC, glass: '#39434c', lit: r() < 0.5 });
    }
    for (let k = 0; k < NF; k++) for (const [d, w] of [[2.4, 1.3], [4.9, 1.8], [7.3, 1.3]]) { winOf(fSE, sc - d, w, k); winOf(fSE, sc + d, w, k); }
    const D = B.det;
    D.setColor('#9d9a92'); fbox(D, fSE, sc - 1.25, sc + 1.25, yd + 2.5, yd + 2.66, 0, 1.3, 1 | 4 | 8 | 16 | 32); // canopy slab
    fprism(S, fSE, sc - 1.25, sc + 1.25, -0.05, 1.3, yd + 2.5, yd + 2.66, 'awning', 1);
    D.setColor('#8f8c85'); fbox(D, fSE, sc - 1.0, sc + 1.0, yd - 0.8, yd, 0, 1.2, 1 | 4 | 8 | 16);            // step
  }
  // the first north-west stack, next to the street corner, as in the photo: dark, timber and white glazing, open top
  const ne = stacks.find((s) => s[0] === fNW);
  if (ne) ne[3] = [{ glazed: true, tint: '#dcb64c', frame: '#3b3a38', glass: '#2d3944' }, { glazed: true, tint: '#ddd2b8', frame: WOOD, glass: '#7f7b72' },
    { glazed: true, tint: '#ddd2b8', frame: PVC, glass: '#34414b' }, { glazed: false, tint: '#dcb64c' }];
  // a few wall AC units next to the long-side windows
  for (const f of [fNW, fSE]) for (const q of f.open) if (q.kind === 'win' && q.s1 - q.s0 > 1.2 && r() < 0.05) acs.push([f, q.s1 + 0.55, q.y0 + 0.4]);

  // ---- walls, plinth, openings
  const DIRTY = '#d9d3c8', PINK = '#e3b3a4';
  for (const f of faces) {
    wallBand(B.det, f, gBase, yP, null, '#8e8d88');
    if (f.skin === 'brick') wallBand(B.brick, f, yP, yTop, BRICK, '#ffffff');
    else { // cream tiles; one row of pink tiles under the parapet, the top run greyed by the roof's rain
      wallBand(B.tile, f, yP, yTop - 0.95, [TILE_M, TILE_M], '#ffffff');
      wallBand(B.tile, f, yTop - 0.95, yTop - 0.8, [TILE_M, TILE_M], PINK);
      wallBand(B.tile, f, yTop - 0.8, yTop, [TILE_M, TILE_M], DIRTY);
    }
    for (const q of f.open) opening(B, f, q);
    // plinth drip ledge and basement vents, skipping the doors
    B.det.setColor('#9a9994');
    for (const [a, c] of freeSpans(f, yP - 0.06, yP)) fbox(B.det, f, a, c, yP - 0.06, yP, 0, 0.05, 1 | 16 | 32);
    B.det.setColor('#2a2c2e');
    for (let s = 3; s < f.w - 2; s += 6.5) {
      if (freeSpans(f, gBase, yP).some(([a, c]) => a < s - 0.5 && c > s + 0.5)) fbox(B.det, f, s - 0.3, s + 0.3, yP - 0.55, yP - 0.3, 0, 0.02, 1);
    }
    // parapet: inner face, galvanised coping with a lip
    B.det.setColor('#b9b3a6'); quad(B.det, at(f, 0.3, yRoof, -0.3), at(f, f.w - 0.3, yRoof, -0.3), at(f, f.w - 0.3, yTop, -0.3), at(f, 0.3, yTop, -0.3), neg(f.N));
    B.det.setColor('#8f9291'); fbox(B.det, f, -0.04, f.w + 0.04, yTop, yTop + 0.03, -0.3, 0.04, 1 | 16);
    const a0 = at(f, 0, 0, -0.12), a1 = at(f, f.w, 0, -0.12);
    Z.edge(a0[0], a0[2], a1[0], a1[2], yTop, f.nx, f.nz);
  }
  // ---- balcony stacks (floors 1..4, the canopy over the top one)
  for (const [f, c, w, sts] of stacks) {
    sts.forEach((st, j) => balcony(B, f, c, w, floorY(j + 1), st, j === sts.length - 1));
    fprism(S, f, c - w / 2 - 0.1, c + w / 2 + 0.1, -0.1, 1.2, floorY(1) - 0.14, floorY(NF) + 0.3, 'wall');
  }
  // ---- AC units
  B.det.setColor('#dcdcd6');
  for (const [f, s, y] of acs) { fbox(B.det, f, s - 0.4, s + 0.4, y, y + 0.55, 0, 0.3, 1 | 4 | 8 | 16 | 32); }
  B.det.setColor('#8a8d8c');
  for (const [f, s, y] of acs) fbox(B.det, f, s - 0.02, s + 0.32, y + 0.1, y + 0.45, 0.3, 0.31, 1); // fan grille
  // ---- street-end porch: flat roof on two posts over the shop door, wrapping the south-east corner
  B.det.setColor('#cbc3b3'); fbox(B.det, fNE, -1.4, 5.8, gP + 2.7, gP + 3.0, 0, 1.9, 1 | 4 | 8 | 16 | 32);
  B.det.setColor('#7b7d7e'); for (const s of [-1.2, 5.6]) fbox(B.det, fNE, s - 0.06, s + 0.06, gP - 0.3, gP + 2.7, 1.72, 1.84, 1 | 4 | 8);
  B.det.setColor('#8f8c85'); fbox(B.det, fNE, -1.4, 5.8, gP - 0.5, gP + 0.12, 0, 1.9, 1 | 4 | 8 | 16);
  fprism(S, fNE, -1.4, 5.8, -0.05, 1.9, gP + 2.7, gP + 3.0, 'awning', 1);
  // ---- roof: bitumen, a stair hatch per section, a few TV masts
  B.det.setColor('#4c4b48');
  quad(B.det, at(fSE, 0.3, yRoof, -0.3), at(fSE, L - 0.3, yRoof, -0.3), at(fSE, L - 0.3, yRoof, -2 * hw + 0.3), at(fSE, 0.3, yRoof, -2 * hw + 0.3), UP);
  for (let i = 0; i < 4; i++) {
    const sc = sec * (i + 0.5);
    B.det.setColor('#9b9890'); fbox(B.det, fSE, sc - 0.7, sc + 0.7, yRoof, yRoof + 1.1, -3.6, -2.2, 1 | 2 | 4 | 8 | 16);
    fprism(S, fSE, sc - 0.7, sc + 0.7, -3.6, -2.2, yRoof, yRoof + 1.1, 'equipment');
    const [mx, , mz] = at(fSE, sc + 2.5 + r() * 3, 0, -hw - 1 + r() * 3), h = 2.5 + r() * 2;
    B.det.setColor('#6e7275'); B.det.cyl(mx, yRoof, mz, 0.035, 0.03, h, 5);
    B.det.box(mx - 0.5, yRoof + h - 0.3, mz - 0.02, mx + 0.5, yRoof + h - 0.26, mz + 0.02);
  }
  S.prism((area2(corners) < 0 ? corners.slice().reverse() : corners).flat(), gBase, yTop, 0, 0, 'wall');

  // ---- meshes
  const group = Object.assign(new THREE.Group(), { name: 'khimikiv44' });
  root.add(group);
  const M = {
    tile: new THREE.MeshStandardMaterial({ map: tileTex(r), vertexColors: true, roughness: 0.55 }),
    brick: new THREE.MeshStandardMaterial({ map: brickTex(r), vertexColors: true, roughness: 0.92 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    sheet: new THREE.MeshStandardMaterial({ map: sheetTex(), vertexColors: true, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.3, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffd9a0, emissiveIntensity: 0 }),
  };
  let nV = 0;
  for (const [k, D] of Object.entries(B)) {
    if (!D.v) continue;
    nV += D.v;
    const glassy = k === 'glass' || k === 'lit';
    group.add(Object.assign(new THREE.Mesh(D.build(), M[k]), { name: 'khim-' + k, castShadow: !glassy, receiveShadow: true }));
  }
  console.log(`[cherkasy] Khimikiv 44: ${faces.reduce((n, f) => n + f.open.length, 0)} openings, ${stacks.length} balcony stacks, ${(nV / 1000).toFixed(1)}k verts in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    footprints: [{ poly: ringPts(b.p), h: yTop - yG, kind: 'apt', name: 'Хіміків 44' }],
    // generated trees keep clear of the walls, balconies and porch
    clear: (x, z) => { const dx = x - cx, dz = z - cz; return Math.abs(dx * ux + dz * uz) < hl + 3 && Math.abs(dx * vx + dz * vz) < hw + 3; },
    update() { M.lit.emissiveIntensity = 1.3 * nightK.value; },
  };
}
