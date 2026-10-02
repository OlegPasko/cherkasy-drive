// OWNER: cherkasy. ЖК Premier Bay, вулиця Героїв Дніпра / вулиця Козацька on Mytnytsia: a residential complex by the
// Dnipro that is still being built (sections 1–4 under way, 5–10 in the project), built here as the developer's
// renders show it (lun.ua/new/cherkasy/premier-bay, premier-bay.ck.ua). Four ten-storey bars (OSM 1526030153–156, one
// per group of sections) stand round a closed yard in a pinwheel, their corners left open with fences across. The
// short bars (to the river and to the street) are white render over a three-storey podium of red-brown clinker brick,
// a dark grey band at the fourth floor and one stack of recessed loggias splitting the front; the long wings are white
// over a dark ground storey with a loggia stack every ~20 m; both have dark panels beside the big windows. The accent
// sections are eleven-storey brick towers on a dark glazed ground floor, with stacks of cantilevered glass balconies.
// The lot rises ~5 m to the east, so the yard is a flat deck over the underground parking at the hilltop's level: the
// ground floors open onto it, the bars' plinths run down to the street, stone walls close its open corners. The yard:
// paved paths round four lawns, three orange playground pads with swings and slides, a round bench, a pergola, flower
// beds, young trees and thujas, benches and bollard lamps; entrances from the yard under dark canopies.
//   PREMIERBAY_SKIP: the OSM ids replaced here (buildings.js skips them)
//   buildPremierBay({ root, map, solids, zips, heightAt, facadeMat }) -> { update(dt), clear(x, z), footprints } | null
// The walls are facade-shader quads (world/facade.js: windows, rooms behind them and the lit windows at night come
// from the shader); loggias, balconies, canopies and the yard are merged meshes. Everything is laid in the complex's
// own frame: u along the long bars (toward the river, north-north-east), v across them; ORIGIN is the yard's middle.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { FacadeBuilder, STYLE, LAYER } from '../facade.js';
import { ringPts, rng } from './geo.js';
import { paveTex } from './civic.js';
import { face, ringFaces, at, rect, box, solid } from './slabkit.js';

const BARS = { east: 1526030153, north: 1526030154, west: 1526030155, south: 1526030156 };
export const PREMIERBAY_SKIP = new Set(Object.values(BARS));

const ORIGIN = [1270, 2045];                      // the yard's middle, map metres
const FH = 3.1, G = 3.9, PL = 0.6, PARA = 0.9;    // storey, ground floor top over the base, plinth, parapet
const LW = 3.8, LD = 1.4, BD = 1.6;               // loggia width and depth, balcony reach
// sections along each bar: [axis, from, to, type]; W white over a brick podium (10 storeys, the short bars), L white
// over a dark ground storey (10, the long wings), B brick tower (11)
const SECTIONS = {
  east: [['u', -60, -38, 'B'], ['u', -38, 28, 'L'], ['u', 28, 40, 'B'], ['u', 40, 60, 'L']],
  west: [['u', -60, -40, 'L'], ['u', -40, -28, 'B'], ['u', -28, 38, 'L'], ['u', 38, 60, 'B']],
  north: [['v', -40, 30, 'W']],
  south: [['v', -40, -12, 'B'], ['v', -12, 30, 'W']],
};
const NFL = { W: 10, L: 10, B: 11 };
// the yard's corners left open between the bars: fences across them, [u0, v0, u1, v1]
const DECK = [-56.2, 56.6, -54.2, 51.8];         // the yard deck, [u0, u1, v0, v1]
const FENCES = [[56.6, 21.8, 56.6, 45.6], [56.6, -54.2, 56.6, -31.7], [-55.4, -48.5, -55.4, -29.7], [-56.2, 23.8, -56.2, 51.8]];
const DARK = '#3a3d41', WOOD = '#a8774a', RAIL = '#2e3033';

export function buildPremierBay({ root, map, solids: S, zips: Z, heightAt, facadeMat }) {
  const rings = Object.fromEntries(Object.entries(BARS).map(([k, id]) => [k, map.buildings.find((b) => b.id === id)]).filter(([, b]) => b).map(([k, b]) => [k, ringPts(b.p)]));
  if (!rings.east || !facadeMat) return null;
  const t0 = performance.now(), n0 = S.count, r = rng(1526030153 % 65521);
  // the frame from the east bar's yard-side edge
  const [a0, a1] = rings.east, L0 = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]), U = [(a1[0] - a0[0]) / L0, (a1[1] - a0[1]) / L0], V = [-U[1], U[0]];
  const uOf = (p) => (p[0] - ORIGIN[0]) * U[0] + (p[1] - ORIGIN[1]) * U[1], vOf = (p) => (p[0] - ORIGIN[0]) * V[0] + (p[1] - ORIGIN[1]) * V[1];
  const P = (u, v) => [ORIGIN[0] + U[0] * u + V[0] * v, ORIGIN[1] + U[1] * u + V[1] * v];
  const hs = Object.values(rings).flat().map((p) => heightAt(p[0], p[1])), gLo = Math.min(...hs), gHi = Math.max(...hs);
  // the yard is the deck over the underground parking, level with the hilltop the lot rises to (the ground falls ~5 m
  // to the west and to both ends); the bars' ground floors open onto it, their plinths run down to the street
  let hDeck = -Infinity;
  for (let u = DECK[0]; u <= DECK[1] + 0.01; u += (DECK[1] - DECK[0]) / 24) for (let v = DECK[2]; v <= DECK[3] + 0.01; v += (DECK[3] - DECK[2]) / 24) { const p = P(u, v); hDeck = Math.max(hDeck, heightAt(p[0], p[1])); }
  const base = hDeck + 0.2, Y = (h) => base + h, yLo = gLo - 1.5;
  const roofOf = (T) => Y(G + (NFL[T] - 1) * FH), topOf = (T) => roofOf(T) + PARA;

  const FB = new FacadeBuilder();
  const B = { det: new MB(), rail: new MB(), lit: new MB(), pave: new MB(), soft: new MB(), leaf: new MB() };
  const D = B.det;
  // facade parameters per zone; baseY / topY keep one storey grid over every quad of a section
  const prm = (T, extra) => ({ floorH: FH, bayW: T === 'B' ? 2.6 : 2.9, winW: T === 'B' ? 0.56 : 0.5, winH: T === 'B' ? 0.72 : 0.64, plinth: PL,
    base: LAYER.CONCRETE, seed: 23, resid: 1, depth: 0.2, lintel: 0, baseY: base, topY: topOf(T), ...extra });
  const BRICK = { layer: LAYER.RED2, tint: [0.74, 0.54, 0.45] }, TBRICK = { layer: LAYER.RED2, tint: [0.74, 0.5, 0.4] };
  const WHITE = { layer: LAYER.STUCCO, tint: [1.42, 1.41, 1.37] }, BAND = { layer: LAYER.CONCRETE, tint: [0.42, 0.43, 0.45] };
  const GLAZE = { layer: LAYER.METAL, tint: [0.36, 0.38, 0.41], winW: 0.8 };
  const yPod = Y(G + 2 * FH);                     // the podium's top: three storeys of brick
  const zones = (T) => (T === 'W' ? [[yLo, yPod, BRICK, -G], [yPod, yPod + FH, BAND, -G], [yPod + FH, topOf('W'), WHITE, -G]]
    : T === 'L' ? [[yLo, Y(G), BAND, -G], [Y(G), topOf('L'), WHITE, -G]]
    : [[yLo, Y(G), GLAZE, -G], [Y(G), topOf('B'), TBRICK, -G]]);
  // a wall rectangle from `o3` along `dir` for `len` m, facing `n`, cut into the section's material zones
  const zq = (o3, dir, len, n, y0, y1, T, style = STYLE.PUNCHED, extra = {}) => {
    for (const [za, zb, mat, gH] of zones(T)) {
      const ya = Math.max(y0, za), yb = Math.min(y1, zb);
      if (yb - ya > 0.01) FB.quad(o3, dir, len, ya, yb, n, prm(T, { ...mat, ...extra }), style, gH);
    }
  };
  const fq = (f, s0, s1, o, y0, y1, T, style, extra) => { const p = at(f, s0, 0, o); zq(p, f.U, s1 - s0, f.N, y0, y1, T, style, extra); };
  // the dark panel the renders show beside each window of the white storeys
  const panels = (f, s0, s1, k0) => {
    const p = prm('W'), bay = p.bayW, len = s1 - s0;
    if (len < bay * 0.62) return;
    const nb = Math.max(1, Math.round(len / bay)), bw = len / nb, hw = p.winW * bw / 2, sgn = Math.sign(f.ux * f.nz - f.uz * f.nx) || 1;
    const sill = (1 - p.winH) * 0.62 * FH, wh = p.winH * FH;
    D.setColor('#45484c');
    for (let i = 0; i < nb; i++) {
      const c = s0 + (i + 0.5) * bw, e0 = c + sgn * (hw + 0.04), e1 = c + sgn * (hw + 0.6);
      for (let k = k0; k < NFL.W; k++) { const y = Y(G - FH + k * FH + sill); rect(D, f, Math.min(e0, e1), Math.max(e0, e1), y, y + wh, 0.03); }
    }
  };

  // ---- sections: clip each bar to its sections' ranges, then lay the faces
  const clip = (R, ax, lo, hi) => {
    let out = R;
    for (const [s, c] of [[1, lo], [-1, hi]]) {
      const inp = out; out = [];
      inp.forEach((a, i) => {
        const b = inp[(i + 1) % inp.length], da = s * (ax(a) - c), db = s * (ax(b) - c);
        if (da >= 0) out.push(a);
        if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      });
    }
    return out.filter((p, i) => { const q = out[(i + 1) % out.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05; });
  };
  const secs = [];
  for (const [bar, list] of Object.entries(SECTIONS)) {
    const R = rings[bar]; if (!R) continue;
    for (const [axis, lo, hi, T] of list) {
      const ax = axis === 'u' ? uOf : vOf, poly = clip(R, ax, lo, hi);
      if (poly.length >= 3) secs.push({ bar, axis, ax, lo, hi, T, poly, lim: [Math.min(...R.map(ax)), Math.max(...R.map(ax))] });
    }
  }
  let nLog = 0, nBal = 0, nDoor = 0;
  const yardDir = (f) => { const m = at(f, f.L / 2, 0), dx = ORIGIN[0] - m[0], dz = ORIGIN[1] - m[2], d = Math.hypot(dx, dz) || 1; return (f.nx * dx + f.nz * dz) / d; };
  const canopies = [];
  for (const s of secs) {
    const { T, ax } = s, roof = roofOf(T), top = topOf(T);
    for (const f of ringFaces(s.poly)) {
      const pa = [f.ax, f.az], pb = at(f, f.L, 0), cut = [s.lo, s.hi].find((c) => c > s.lim[0] + 0.3 && c < s.lim[1] - 0.3 && Math.abs(ax(pa) - c) < 0.05 && Math.abs(ax([pb[0], pb[2]]) - c) < 0.05);
      if (cut !== undefined) {                    // a party wall: only where this section stands over its neighbour
        const nb = secs.find((q) => q !== s && q.bar === s.bar && (q.lo === cut || q.hi === cut));
        if (nb && topOf(nb.T) < top) fq(f, 0, f.L, 0, roofOf(nb.T), top, T, STYLE.BLANK);
        continue;
      }
      const yard = yardDir(f) > 0.7, end = Math.abs(f.ux * (s.axis === 'u' ? U[0] : V[0]) + f.uz * (s.axis === 'u' ? U[1] : V[1])) < 0.3;
      // recessed loggia stacks (white sections, every ~20 m; a brick tower's long faces get one in the middle)
      const logs = [];
      if (f.L >= 10 && !(T === 'B' && end)) {
        const nl = Math.max(1, Math.round(f.L / 20));
        // the short bars: one stack splitting the front ~11 bays to 4, as the renders show; the wings: every ~20 m
        const cs = T === 'B' ? [f.L / 2] : T === 'W' ? (f.L >= 30 ? [f.L * (yard ? 0.28 : 0.72)] : []) : Array.from({ length: nl }, (_, i) => f.L * (i + 0.5) / nl);
        for (const c of cs) logs.push([c - LW / 2, c + LW / 2]);
        if (T === 'W' && yard && cs.length) { const q = at(f, cs[0], 0); s.logV = vOf([q[0], q[2]]); } // the roof head stands over it
      }
      let s0 = 0;
      for (const [a, b] of [...logs, [f.L, f.L]]) {
        if (a - s0 > 0.05) { fq(f, s0, a, 0, yLo, top, T, f.L < 2 ? STYLE.BLANK : STYLE.PUNCHED); if (T !== 'B') panels(f, s0, a, T === 'W' ? 4 : 1); }
        if (b > a) {
          fq(f, a, b, 0, yLo, Y(G), T);                                     // the ground storey under the stack
          fq(f, a, b, 0, roof, top, T, STYLE.BLANK);                              // the parapet over it
          fq(f, a, b, -LD, Y(G), roof, T, STYLE.PUNCHED, { bayW: LW, winW: 0.78, winH: 0.84 }); // the back wall
          for (const [sx, sgn] of [[a, 1], [b, -1]]) zq(at(f, sx, 0, -LD), f.N, LD, [f.ux * sgn, 0, f.uz * sgn], Y(G), roof, T, STYLE.BLANK);
          for (let k = 1; k < NFL[T]; k++) {
            const y = Y(G + (k - 1) * FH);
            D.setColor(T === 'L' || (T === 'W' && y >= yPod + FH) ? '#d9d8d3' : '#8c5a46'); box(D, f, a, b, y - 0.2, y, -LD, 0, 'fu');
            B.rail.setColor('#c9dde2'); rect(B.rail, f, a + 0.05, b - 0.05, y, y + 1.05, -0.06);
            D.setColor(RAIL); box(D, f, a, b, y + 1.02, y + 1.08, -0.1, -0.04, 'ftu');
            nLog++;
          }
          D.setColor('#d9d8d3'); box(D, f, a, b, roof - 0.2, roof, -LD, 0, 'u');
          if (yard && T !== 'B') {                                                  // the entrance under the stack
            const m = (a + b) / 2;
            B.lit.setColor('#5b5650'); rect(B.lit, f, m - 1.1, m + 1.1, Y(0), Y(2.6), 0.04);
            D.setColor(WOOD); rect(D, f, m + 1.2, m + 2.3, Y(0), Y(3.1), 0.04);
            D.setColor('#2c2d2f'); box(D, f, m - 2.4, m + 2.4, Y(2.95), Y(3.3), 0, 1.8, 'ftlru');
            canopies.push([f, m]); nDoor++;
          }
        }
        s0 = b;
      }
      // stacks of cantilevered glass balconies on a brick tower's ends
      if (T === 'B' && end && f.L >= 6) {
        const cs = f.L >= 12 ? [f.L * 0.27, f.L * 0.73] : [f.L / 2];
        for (const c of cs) {
          const a = c - 1.7, b = c + 1.7;
          for (let k = 1; k < NFL.B; k++) {
            const y = Y(G + (k - 1) * FH);
            D.setColor(DARK); box(D, f, a, b, y - 0.22, y, 0, BD, 'ftlru');
            B.rail.setColor('#c4d8de'); box(B.rail, f, a + 0.04, b - 0.04, y, y + 1.1, 0, BD - 0.04, 'flr');
            nBal++;
          }
          solid(S, f, a, b, 0, BD, Y(G) - 0.3, roof + 1.1, 'wall');
        }
      }
      // the parapet's inner face, the coping and the roof edge
      zq(at(f, f.L, 0, -0.3), [-f.ux, 0, -f.uz], f.L, [-f.nx, 0, -f.nz], roof, top, T, STYLE.BLANK);
      D.setColor(T !== 'B' ? '#c9c8c3' : '#6e4c3e'); box(D, f, -0.02, f.L + 0.02, top, top + 0.06, -0.32, 0.04, 'ft');
      if (f.L > 3) { const p = at(f, 0, 0, -0.1), q = at(f, f.L, 0, -0.1); Z.edge(p[0], p[2], q[0], q[2], top, f.nx, f.nz); }
    }
    FB.fill(s.poly, [], roof + 0.02, { layer: LAYER.ROOF_MEMBRANE, tint: [0.55, 0.55, 0.56] });
    S.prism(s.poly.flat(), yLo, top, 0, 0, 'wall');
    // a lift and stair head on the roof, in the section's own material
    const cu = s.poly.reduce((q, p) => q + uOf(p), 0) / s.poly.length, cv = s.logV ?? s.poly.reduce((q, p) => q + vOf(p), 0) / s.poly.length;
    const hd = s.axis === 'u' ? [5.5, 3.2] : [3.2, 5.5], hh = s.bar === 'north' ? 3.4 : 2.6;
    const hp = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => P(cu + i * hd[0], cv + j * hd[1]));
    D.setColor(T === 'B' || s.bar === 'north' ? '#7a4a3a' : '#e6e5e0'); D.extrude(hp, [], roof, roof + hh, { top: true, sides: true });
    S.prism(hp.flat(), roof, roof + hh, 0, 0, 'equipment');
  }
  // the canopies' collision (the car passes under them)
  for (const [f, m] of canopies) solid(S, f, m - 2.4, m + 2.4, 0, 1.8, Y(2.95), Y(3.3), 'awning', 1);

  // ---- the yard: paving draped on the ground, four lawns, playgrounds, a round bench, a pergola, trees and lamps
  const onDeck = (u, v) => u >= DECK[0] - 0.01 && u <= DECK[1] + 0.01 && v >= DECK[2] - 0.01 && v <= DECK[3] + 0.01;
  const gy = (u, v) => { if (onDeck(u, v)) return base; const p = P(u, v); return heightAt(p[0], p[1]); };
  const drape = (M, u0, u1, v0, v1, lift, cell = 4, tint = null) => {
    const nu = Math.max(1, Math.ceil((u1 - u0) / cell)), nv = Math.max(1, Math.ceil((v1 - v0) / cell)), id = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = u0 + (u1 - u0) * i / nu, v = v0 + (v1 - v0) * j / nv, p = P(u, v);
      if (tint) M.setColor(tint());
      id.push(M.vert(p[0], gy(u, v) + lift, p[1], 0, 1, 0, p[0] / 4.8, p[1] / 4.8));
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = id[j * (nu + 1) + i], b = a + 1, c = a + nu + 2, d = a + nu + 1; M.quad(a, d, c, b); }
  };
  const disc = (M, u, v, rad, lift, col, seg = 16) => {
    M.setColor(col);
    const p0 = P(u, v), c = M.vert(p0[0], gy(u, v) + lift, p0[1], 0, 1, 0), ids = [];
    for (let i = 0; i <= seg; i++) { const t = i / seg * Math.PI * 2, p = P(u + Math.cos(t) * rad, v + Math.sin(t) * rad); ids.push(M.vert(p[0], gy(u + Math.cos(t) * rad, v + Math.sin(t) * rad) + lift, p[1], 0, 1, 0)); }
    for (let i = 0; i < seg; i++) M.tri(c, ids[i + 1], ids[i]);
  };
  const bx = (M, u, v, w, d, h0, h1, col, rot = 0) => {          // a box standing on the ground in the yard frame
    const cr = Math.cos(rot), sr = Math.sin(rot), y = gy(u, v);
    const pts = [[-w, -d], [w, -d], [w, d], [-w, d]].map(([a, b]) => P(u + a * cr - b * sr, v + a * sr + b * cr));
    M.setColor(col); M.extrude(pts, [], y + h0, y + h1, { top: true, sides: true });
  };
  B.pave.setColor('#d8d4cc');
  for (const [u0, u1, v0, v1] of [[-59.3, 59.4, -74, DECK[2]], [-59.3, 59.4, DECK[3], 71.3], [-59.3, DECK[0], DECK[2], DECK[3]], [DECK[1], 59.4, DECK[2], DECK[3]]]) drape(B.pave, u0, u1, v0, v1, 0.06);
  drape(B.pave, DECK[0], DECK[1], DECK[2], DECK[3], 0.02, 8);
  // the deck's open edges in the corner gaps: a dark stone wall down to the ground (the bars hide the rest)
  for (const u of [DECK[0], DECK[1]]) {
    const n = 26, sg = u > 0 ? 1 : -1, ids = [];
    D.setColor('#6f6b66');
    for (let i = 0; i <= n; i++) { const v = DECK[2] + (DECK[3] - DECK[2]) * i / n, p = P(u, v); ids.push([D.vert(p[0], base + 0.02, p[1], U[0] * sg, 0, U[1] * sg), D.vert(p[0], heightAt(p[0], p[1]) - 0.6, p[1], U[0] * sg, 0, U[1] * sg)]); }
    for (let i = 0; i < n; i++) { const [a, b] = ids[i], [c, d] = ids[i + 1]; if (sg > 0) D.quad(a, c, d, b); else D.quad(a, b, d, c); }
    D.setColor('#9a958d'); for (let i = 0; i < n; i++) { const v0 = DECK[2] + (DECK[3] - DECK[2]) * i / n, v1 = v0 + (DECK[3] - DECK[2]) / n; bx(D, u - sg * 0.15, (v0 + v1) / 2, 0.25, (v1 - v0) / 2, -0.02, 0.12, '#9a958d'); }
  }
  { const pts = [P(DECK[0], DECK[2]), P(DECK[1], DECK[2]), P(DECK[1], DECK[3]), P(DECK[0], DECK[3])]; S.prism(pts.flat(), yLo, base, 0, 0, 'wall'); }
  const lawn = () => { const k = 0.9 + r() * 0.2; return [0.1 * k, 0.21 * k, 0.05 * k]; };
  const LAWNS = [[-36, -2, -52, -2], [2, 37, -52, -2], [-36, -2, 2, 49.5], [2, 37, 2, 49.5], [41, 55, 24, 43], [41, 55, -52, -34], [-54, -40, -46, -32], [-54, -40, 26, 49.5]];
  for (const [u0, u1, v0, v1] of LAWNS) drape(B.soft, u0, u1, v0, v1, 0.1, 4, lawn);
  const PADS = [[-20, -27, 11], [-19, 26, 10], [21, -30, 8]];
  // paths across the lawns: to the pergola, to the far corners, to the playgrounds
  const path = (u0, v0, u1, v1, w = 2.2) => {
    const L = Math.hypot(u1 - u0, v1 - v0), du = (u1 - u0) / L * w / 2, dv = (v1 - v0) / L * w / 2;
    const [a, b, c, d] = [[u0 + dv, v0 - du], [u1 + dv, v1 - du], [u1 - dv, v1 + du], [u0 - dv, v0 + du]].map(([u, v]) => { const p = P(u, v); return B.pave.vert(p[0], base + 0.13, p[1], 0, 1, 0, p[0] / 4.8, p[1] / 4.8); });
    B.pave.quad(a, d, c, b);  // counter-clockwise in (u, v) is clockwise from above: U x V points down
  };
  path(-5, -5, -33, -49); path(5, 5, 33, 46); path(-3, 26, -11, 26, 2.6); path(3, -27, 11.5, -27, 2.6); path(-3, 40, -30, 47, 1.8); path(3, -40, 32, -48, 1.8);
  // flower beds (lavender and white) ringed with low shrubs
  const BEDS = [[-28, -14, 2.6], [-12, -40, 2.2], [14, -10, 2.4], [30, -40, 2.0], [-30, 12, 2.4], [-8, 44, 2.0], [12, 16, 2.2], [30, 32, 2.4]];
  for (const [u, v, rad] of BEDS) {
    disc(B.soft, u, v, rad, 0.16, r() < 0.6 ? [0.22, 0.13, 0.42] : [0.6, 0.6, 0.56], 12);
    for (let i = 0; i < 7; i++) { const t = i / 7 * Math.PI * 2 + r(), p = P(u + Math.cos(t) * (rad + 0.6), v + Math.sin(t) * (rad + 0.6)); B.leaf.setColor([0.14, 0.27 + r() * 0.08, 0.1]); B.leaf.ellipsoid([p[0], base + 0.45, p[1]], [0.7, 0.5, 0.7], 6, 4); }
  }
  for (const [u, v, rad] of PADS) disc(B.soft, u, v, rad, 0.14, [0.62, 0.2, 0.04], 20);
  disc(B.soft, 0, 0, 5, 0.13, [0.3, 0.29, 0.27], 20);           // the round plaza in the middle

  // playgrounds: a swing frame, a slide tower, a climbing frame on each pad
  for (const [u, v] of PADS) {
    for (const du of [-3.2, 3.2]) for (const dv of [-0.9, 0.9]) bx(D, u + du, v - 3 + dv * 0.6, 0.08, 0.08, 0, 2.6, WOOD);
    bx(D, u, v - 3, 3.4, 0.09, 2.5, 2.65, WOOD);
    bx(D, u - 1.5, v - 3, 0.5, 0.3, 0.45, 0.55, DARK); bx(D, u + 1.5, v - 3, 0.5, 0.3, 0.45, 0.55, DARK);
    bx(D, u + 3, v + 3, 1.1, 1.1, 0, 1.6, WOOD); bx(D, u + 3, v + 3, 1.2, 1.2, 2.6, 3.4, '#d9a441');
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bx(D, u + 3 + a, v + 3 + b, 0.07, 0.07, 1.6, 2.6, WOOD);
    { const y = gy(u, v); const p = (du, dv, h) => { const q = P(u + du, v + dv); return [q[0], y + h, q[1]]; };
      D.setColor('#c8ccd0'); D.face([p(4.1, 2.4, 1.6), p(4.1, 3.6, 1.6), p(8.5, 3.6, 0.3), p(8.5, 2.4, 0.3)]); }
    bx(D, u - 4, v + 3.5, 1.6, 0.9, 0, 1.4, '#e07b2c');
    S.prism([P(u - 3.4, v - 3.6), P(u + 3.4, v - 3.6), P(u + 3.4, v - 2.4), P(u - 3.4, v - 2.4)].flat(), gy(u, v), gy(u, v) + 2.7, 0, 0, 'wall');
    S.prism([P(u + 1.8, v + 1.8), P(u + 4.2, v + 1.8), P(u + 4.2, v + 4.2), P(u + 1.8, v + 4.2)].flat(), gy(u, v), gy(u, v) + 3.4, 0, 0, 'wall');
  }
  // the round bench with its planter and tree in the middle
  { const y = gy(0, 0), ring = (rad) => Array.from({ length: 20 }, (_, i) => { const t = i / 20 * Math.PI * 2; return P(Math.cos(t) * rad, Math.sin(t) * rad); });
    D.setColor('#c9c3b8'); D.extrude(ring(3.6), [ring(2.9)], y, y + 0.48, { top: true, sides: true });
    D.setColor(WOOD); D.extrude(ring(3.7), [ring(3.3)], y + 0.48, y + 0.53, { top: true, sides: false });
    B.soft.setColor([0.18, 0.3, 0.1]); B.soft.fill(ring(2.9), [], y + 0.42, true);
    S.prism(ring(3.6).flat(), y, y + 0.5, 0, 0, 'wall'); }
  // the pergola: four posts and a slatted roof
  { const [u, v] = [21, 24];
    for (const [a, b] of [[-2.5, -1.8], [2.5, -1.8], [2.5, 1.8], [-2.5, 1.8]]) bx(D, u + a, v + b, 0.1, 0.1, 0, 2.7, '#5a3f2a');
    for (let i = -6; i <= 6; i++) bx(D, u + i * 0.42, v, 0.07, 2.1, 2.7, 2.85, '#6b4a30');
    bx(D, u, v, 2.2, 0.35, 0, 0.45, '#d7d2c8'); }
  // trees: young deciduous ones on the lawns, thujas by the doors; benches and bollard lamps along the paths
  const tree = (u, v, sc = 1) => {
    const p = P(u, v), y = gy(u, v);
    D.setColor('#5b4636'); D.cyl(p[0], y, p[1], 0.11 * sc, 0.08 * sc, 2.6 * sc, 5, false);
    B.leaf.setColor([0.22 + r() * 0.12, 0.38 + r() * 0.1, 0.12]); B.leaf.ellipsoid([p[0], y + 3.6 * sc, p[1]], [1.7 * sc, 1.9 * sc, 1.7 * sc], 8, 6);
    S.cyl(p[0], p[1], y, y + 2.5, 0.2, 0.2, 'pole');
  };
  const thuja = (u, v) => { const p = P(u, v), y = gy(u, v); B.leaf.setColor([0.1, 0.24, 0.12]); B.leaf.cyl(p[0], y, p[1], 0.55, 0.05, 2.6, 7, true); };
  let nTree = 0;
  for (const [u0, u1, v0, v1] of LAWNS.slice(0, 4)) {
    for (let i = 0; i < 6; i++) {
      const u = u0 + 2 + r() * (u1 - u0 - 4), v = v0 + 2 + r() * (v1 - v0 - 4);
      if (PADS.some(([pu, pv, pr]) => Math.hypot(u - pu, v - pv) < pr + 2) || Math.hypot(u - 21, v - 24) < 5) continue;
      tree(u, v, 0.85 + r() * 0.35); nTree++;
    }
  }
  for (const [u0, u1, v0, v1] of LAWNS.slice(4)) { tree((u0 + u1) / 2, (v0 + v1) / 2, 1.1); nTree++; }
  tree(0, 0, 1.15); nTree++;   // the one in the round bench's planter
  for (const [f, m] of canopies) for (const d of [-3.4, 3.4]) { const p = at(f, m + d, 0, 1.2), u = uOf([p[0], p[2]]), v = vOf([p[0], p[2]]); thuja(u, v); }
  const bench = (u, v, rot) => { bx(D, u, v, 0.9, 0.25, 0.4, 0.48, WOOD, rot); bx(D, u - 0.8 * Math.cos(rot), v - 0.8 * Math.sin(rot), 0.06, 0.25, 0, 0.4, DARK, rot); bx(D, u + 0.8 * Math.cos(rot), v + 0.8 * Math.sin(rot), 0.06, 0.25, 0, 0.4, DARK, rot); };
  for (const v of [-40, -20, 15, 35]) { bench(-1.6, v, Math.PI / 2); bench(1.6, v, Math.PI / 2); }
  for (const u of [-25, 25]) { bench(u, -1.6, 0); bench(u, 1.6, 0); }
  const lamps = [];
  for (const v of [-50, -30, -10, 10, 30, 48]) lamps.push([-2.6, v], [2.6, v]);
  for (const u of [-34, -14, 14, 34]) lamps.push([u, -2.6], [u, 2.6]);
  for (const [u, v] of lamps) { bx(D, u, v, 0.08, 0.08, 0, 0.9, '#2a2b2d'); bx(B.lit, u, v, 0.09, 0.09, 0.75, 0.88, '#fff0d0'); }
  // fences across the open corners: posts every 1.5 m, two rails
  for (const [u0, v0, u1, v1] of FENCES) {
    const len = Math.hypot(u1 - u0, v1 - v0), n = Math.round(len / 1.5), rot = Math.atan2(v1 - v0, u1 - u0);
    for (let i = 0; i <= n; i++) { const t = i / n; bx(D, u0 + (u1 - u0) * t, v0 + (v1 - v0) * t, 0.04, 0.04, 0, 1.8, RAIL); }
    for (const h of [0.1, 1.7]) bx(D, (u0 + u1) / 2, (v0 + v1) / 2, len / 2, 0.03, h, h + 0.06, RAIL, rot);
    const yA = Math.min(gy(u0, v0), gy(u1, v1));
    S.prism([P(u0, v0 - 0.05), P(u1, v1 - 0.05), P(u1, v1 + 0.05), P(u0, v0 + 0.05)].flat(), yA - 0.5, yA + 1.8, 0, 0, 'wall');
  }

  // ---- meshes
  const group = Object.assign(new THREE.Group(), { name: 'premierbay' });
  root.add(group);
  const walls = FB.build();
  const pave = paveTex(r, [214, 210, 202], [176, 172, 166], { n: 12, mix: 0.25 });
  const M = {
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    rail: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: 0xffd9a8, emissiveIntensity: 0 }),
    pave: new THREE.MeshStandardMaterial({ map: pave, vertexColors: true, roughness: 0.95 }),
    soft: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
  };
  let verts = 0, meshes = 0;
  if (walls) { group.add(Object.assign(new THREE.Mesh(walls, facadeMat), { name: 'premierbay-walls', castShadow: true, receiveShadow: true })); verts += FB.v; meshes++; }
  for (const [k, Mb] of Object.entries(B)) {
    if (!Mb.v) continue;
    group.add(Object.assign(new THREE.Mesh(Mb.build(), M[k]), { name: `premierbay-${k}`, castShadow: ['det', 'leaf'].includes(k), receiveShadow: k !== 'rail' }));
    verts += Mb.v; meshes++;
  }
  console.log(`[cherkasy] Premier Bay: ${secs.length} sections, ${nLog} loggias, ${nBal} balconies, ${nDoor} entrances, ${nTree} trees, ground ${gLo.toFixed(1)}–${gHi.toFixed(1)} m, ${(verts / 1000).toFixed(1)}k verts, ${meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  const lim = [-59.5, 59.6, -74.2, 71.5];
  return {
    footprints: Object.values(rings).map((poly) => ({ poly, h: topOf('W') - gLo, kind: 'apt', name: 'ЖК Premier Bay' })),
    clear: (x, z) => { const u = uOf([x, z]), v = vOf([x, z]); return u > lim[0] && u < lim[1] && v > lim[2] && v < lim[3]; },
    update() { M.lit.emissiveIntensity = 1.3 * nightK.value; },
  };
}
