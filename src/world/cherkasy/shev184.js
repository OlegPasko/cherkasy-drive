// OWNER: cherkasy. The new block at бульвар Шевченка, 184–186 (developer «Надія», completion Q4 2026; lun.ua
// /new/cherkasy/shevchenka-blv-184-186), built as its renders show. Nine storeys (brick in a monolithic frame, 48 flats),
// 29 x 18.5 m on the boulevard's south-west side between the music school (182) and the yard houses; OSM still has the
// old one-storey houses on the lot, which are skipped. Not in OSM yet, so the outline is placed here from the
// catalogue's site plan: the front on the old frontage line, the corner tower at the north-west end.
// Section by section from the renders (s from the north corner along the boulevard, then the north-west side from
// the same corner):
//   the corner tower: a rounded glazed bay on the corner – a curtain wall over storeys 2–6, three bay windows between
//     white slab bands above, a mint crown over the roof – between timber-clad strips and mint pilasters on both sides,
//     a green LED line along each pilaster and the crown;
//   the boulevard front: grey render with one window a storey, a white pilaster, the white balcony bay (three glazed
//     groups a storey between white bands) under an arched pediment with a round oculus and the lift-room box behind,
//     a white pilaster, grey render with two windows, a white panelled strip with one window, a grey strip with a
//     two-pane bay window and a white end pilaster; timber spandrels under storeys 3 and 4 on the grey parts; a
//     two-storey drive-through to the yard at the south-east end in a light-grey portal;
//   the north-west side: grey with two windows, the white panelled middle with one window and the second pediment,
//     grey with two windows;
//   the ground storey: dark glass shopfronts and dark stone piers under a dark fascia with a timber strip and a green
//     LED edge, rounded round the corner.
// The yard and south-east sides are not rendered: white render with grey window bays, the stair entrances under glass
// canopies (a guess in the same language). No developer name or logo.
//   SHEV184_SKIP: the OSM ids of the old houses on the lot (buildings.js skips them)
//   shev184Local: { L, D, toMap(s, t), toLocal(x, z), outline() -> [[x, z]] } the site frame: s along the boulevard front
//     from the north corner, t from the front into the lot (map metres); places.js SHEV184_RING repeats the outline
//   buildShev184({ root, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints }
// Walls are laid per facade section in a face frame (slabkit.js): s along the section, y up, o outward.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { rng, inPoly } from './geo.js';
import { canvasTex } from './sculpt.js';
import { face, at, quad, rect, box, skin, finish, speckle } from './slabkit.js';

// the old houses on the lot: 184 on the frontage (two), the yard houses and the hut
export const SHEV184_SKIP = new Set([457737012, 457737013, 923091430, 923091431, 923091429]);

// the frame: the front runs along the boulevard (its south-west carriageway's heading), V points into the lot
const F0 = [-72.4, -592.0], L = 29.0, D = 18.5, R = 2.8;
const U = (() => { const d = [-63.8 - -62.7, -441.1 - -637.3], n = Math.hypot(...d); return [d[0] / n, d[1] / n]; })();
const V = [-U[1], U[0]];                                    // into the lot, away from the road (-x)
const toMap = (s, t) => [F0[0] + U[0] * s + V[0] * t, F0[1] + U[1] * s + V[1] * t];
const toLocal = (x, z) => { const dx = x - F0[0], dz = z - F0[1]; return [dx * U[0] + dz * U[1], dx * V[0] + dz * V[1]]; };
// the rounded corner: centre (R, R), from (0, R) to (R, 0)
const ARC = 6, arcPt = (i, r = R) => { const a = (i / ARC) * Math.PI / 2; return [R - r * Math.cos(a), R - r * Math.sin(a)]; };
const outlineLocal = () => [...Array.from({ length: ARC + 1 }, (_, i) => arcPt(i)), [L, 0], [L, D], [0, D]];
export const shev184Local = { L, D, toMap, toLocal, outline: () => outlineLocal().map(([s, t]) => toMap(s, t)) };

const GF = 4.8, FH = 3.0, NF = 8, PAR = 0.7, PH = GF + FH;   // shop storey, storey, storeys over it, parapet, passage
const PS0 = 22.5, PS1 = 28.4;                                // the drive-through, s range
const WHITE = '#eeece7', GREY = '#9c968f', MINT = '#b4d0c3', DARK = '#2e2e30', STONE = '#47433f', PORTAL = '#cfccc6';
const FRAME = '#262628', TINT = ['#6f7579', '#676d72', '#7a8084', '#62686c'];

// the sections per side: [from, to, kind, windows (section-local [s0, s1] pairs)]
const FRONT = [
  [R, 4.2, 'wood'], [4.2, 4.9, 'mint'], [4.9, 8.6, 'grey', [[1.15, 2.55]]], [8.6, 9.3, 'pil'], [9.3, 16.3, 'bay'],
  [16.3, 17.0, 'pil'], [17.0, 22.0, 'grey', [[0.3, 1.8], [3.3, 4.8]]], [22.0, 25.8, 'panel', [[1.15, 2.6]]],
  [25.8, 28.4, 'grey', [[0.1, 2.5]]], [28.4, L, 'end'],
];
const SIDE = [
  [R, 5.0, 'wood'], [5.0, 5.6, 'mint'], [5.6, 8.9, 'grey', [[0.25, 1.95], [2.2, 3.1]]], [8.9, 14.0, 'panel', [[1.85, 3.25]]],
  [14.0, 18.0, 'grey', [[0.15, 1.75], [2.0, 3.85]]], [18.0, D, 'end'],
];
const BACK = [
  [0, 0.6, 'end'], [0.6, 4.6, 'grey', [[0.4, 1.9], [2.3, 3.6]]], [4.6, 8.0, 'panel', [[1.0, 2.4]], 'door'],
  [8.0, 13.0, 'grey', [[0.5, 2.1], [3.0, 4.5]]], [13.0, 16.0, 'panel', [[0.8, 2.2]]],
  [16.0, PS0, 'grey', [[0.6, 2.2], [3.6, 5.6]]], [PS0, PS1, 'grey', [[0.7, 2.2], [3.7, 5.2]]], [PS1, L, 'end'],
];
const EAST = [[0, 0.6, 'end'], [0.6, D, 'panel', [[2.0, 3.2], [6.4, 7.6], [10.6, 11.8], [14.8, 16.0]]]];

// ------------------------------------------------------------------------------------------------ textures
// one window column a storey's glass high (v 0 at the sill): dark frame, a transom a little above the middle
const paneTex = (mask) => canvasTex(64, 128, (g, w, h) => {
  const gl = g.createLinearGradient(0, 0, w * 0.5, h);
  gl.addColorStop(0, mask ? '#fff' : '#dfe6ea'); gl.addColorStop(0.5, mask ? '#fff' : '#9aa7ae'); gl.addColorStop(1, mask ? '#fff' : '#5c6870');
  g.fillStyle = gl; g.fillRect(0, 0, w, h);
  g.fillStyle = mask ? '#000' : '#232325';
  g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h); g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
  g.fillRect(0, Math.round(h * 0.42), w, 4);
});
// vertical timber boards with grain, 2 m x 2 m per repeat
const woodTex = (r) => canvasTex(256, 256, (g, w, h) => {
  const n = 12, bw = w / n;
  for (let i = 0; i < n; i++) {
    const k = 0.82 + r() * 0.26;
    g.fillStyle = `rgb(${[255, 226, 196].map((c) => Math.min(255, Math.round(c * k))).join(',')})`; g.fillRect(i * bw, 0, bw, h);
    for (let j = 0; j < 7; j++) { g.fillStyle = `rgba(90,45,15,${0.05 + r() * 0.09})`; g.fillRect(i * bw + r() * bw, 0, 1 + r(), h); }
    g.fillStyle = 'rgba(40,20,5,0.35)'; g.fillRect((i + 1) * bw - 1, 0, 1, h);
  }
});

// ------------------------------------------------------------------------------------------------ the build
export function buildShev184({ root, solids: S, zips: Z, heightAt }) {
  const t0 = performance.now(), r = rng(184186), n0 = S.count;
  const ringL = outlineLocal(), ring = ringL.map(([s, t]) => toMap(s, t));
  const hs = ring.map(([x, z]) => heightAt(x, z)), gLo = Math.min(...hs), gHi = Math.max(...hs);
  const yF = gHi + 0.15, Y = (h) => yF + h, gB = gLo - 0.6;
  const fy = (k) => Y(GF + (k - 1) * FH);                     // floor of upper storey k (1..NF)
  const ROOF = Y(GF + NF * FH), TOPW = ROOF + PAR, CROWN = ROOF + 1.5, CAP = CROWN + 0.5;
  const B = { wall: new MB(), wood: new MB(), det: new MB(), glass: new MB(), lit: new MB(), led: new MB() };
  const UVW = [2.5, 2.5], UVT = [2, 2];
  const tint = () => TINT[(r() * TINT.length) | 0];
  const P = (pts) => pts.map(([s, t]) => toMap(s, t));
  let nWin = 0;

  // a face over the local points a -> b (outward normal n in the local frame: [ds, dt])
  const lf = (a, b, n) => { const A = toMap(...a), Bp = toMap(...b); return face(A, Bp, U[0] * n[0] + V[0] * n[1], U[1] * n[0] + V[1] * n[1]); };
  const sideFace = (side, a, b) => side === 'F' ? lf([a, 0], [b, 0], [0, -1]) : side === 'N' ? lf([0, a], [0, b], [-1, 0])
    : side === 'B' ? lf([a, D], [b, D], [0, 1]) : lf([L, a], [L, b], [1, 0]);

  // an opening: reveals, a sill, glass in `cols` framed columns (`rows` storeys of the pane texture); lit ones glow
  function win(f, s0, s1, y0, y1, { cols = 2, rows = 1, rev = '#d8d6d0', dep = 0.2, lit = r() < 0.28, glass = null } = {}) {
    f.cuts.push({ s0, s1, y0, y1 });
    const T = B.det, d = dep;
    T.setColor(rev);
    quad(T, at(f, s0, y0), at(f, s0, y0, -d), at(f, s0, y1, -d), at(f, s0, y1), f.U);
    quad(T, at(f, s1, y0), at(f, s1, y0, -d), at(f, s1, y1, -d), at(f, s1, y1), f.U.map((v) => -v));
    quad(T, at(f, s0, y1), at(f, s1, y1), at(f, s1, y1, -d), at(f, s0, y1, -d), [0, -1, 0]);
    quad(T, at(f, s0, y0), at(f, s1, y0), at(f, s1, y0, -d), at(f, s0, y0, -d), [0, 1, 0]);
    const g = lit ? B.lit : B.glass, o = -d + 0.04;
    g.setColor(glass ?? tint());
    quad(g, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), f.N, [[0, 0], [cols, 0], [cols, rows], [0, rows]]);
    nWin++;
  }
  const flat = (f, s0, s1, y0, y1, col, o, D_ = B.wall, uv = UVW) => { D_.setColor(col); rect(D_, f, s0, s1, y0, y1, o, uv); };
  const shop = (f, s0, s1) => win(f, s0, s1, Y(0.05), Y(GF - 0.75), { cols: Math.max(2, Math.round((s1 - s0) / 1.1)), rev: STONE, dep: 0.25, lit: r() < 0.75, glass: '#58626b' });
  const door = (f, s0, s1) => win(f, s0, s1, Y(0), Y(2.6), { cols: 2, rev: '#1f1f21', dep: 0.35, lit: true, glass: '#4a535b' });
  const zip = (f, y) => { if (Z && f.L > 3) { const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], y, f.nx, f.nz); } };
  const spandrels = (f) => { for (const k of [2, 3]) { B.wood.setColor('#ffffff'); box(B.wood, f, 0, f.L, fy(k) - 0.25, fy(k) + 0.75, 0, 0.03, 'ftu', UVT); } };
  const parapet = (f, top = TOPW) => {
    B.wall.setColor(WHITE); rect(B.wall, f, 0, f.L, ROOF, top, -0.3, UVW, f.N.map((v) => -v));
    B.det.setColor('#8f8d89'); box(B.det, f, -0.02, f.L + 0.02, top, top + 0.07, -0.32, 0.05, 'ft');
  };

  // ---------------------------------------------------------------- facade sections
  function section(side, [a, b, kind, wins = [], extra], idx, all) {
    const f = sideFace(side, a, b), Lf = f.L, c = Lf / 2;
    const overPass = (side === 'F' || side === 'B') && b > PS0 + 1e-3 && a < PS1 - 1e-3;
    const k0 = overPass || side === 'E' ? 2 : 1;          // the first storey with windows
    const yUp = overPass ? Y(PH) : Y(GF);                   // where the upper wall starts
    const tower = (side === 'F' || side === 'N') && (kind === 'wood' || kind === 'mint');
    const top = tower ? CROWN : TOPW;
    const shopSide = side === 'F' || side === 'N';
    const last = idx === all.length - 1;

    // the ground storey (and the passage portal)
    if (overPass) {
      const p0 = Math.max(a, PS0) - a, p1 = Math.min(b, PS1) - a;
      f.cuts.push({ s0: p0, s1: p1, y0: gB, y1: Y(PH) });
      skin(B.wall, f, gB, Y(PH), PORTAL, UVW);
      f.cuts.length = 0;
    } else if (shopSide && kind !== 'end') {
      if (kind === 'grey' || kind === 'panel' || kind === 'bay') {
        if (kind === 'panel' && side === 'N') { shop(f, 0.3, c - 0.7); door(f, c - 0.55, c + 0.55); shop(f, c + 0.7, Lf - 0.3); }
        else if (kind === 'bay') { shop(f, 0.35, c - 0.75); door(f, c - 0.6, c + 0.6); shop(f, c + 0.75, Lf - 0.35); }
        else shop(f, 0.3, Lf - 0.3);
        skin(B.wall, f, gB, Y(GF), STONE, UVW);
        f.cuts.length = 0;
      } else if (kind === 'wood') { B.wood.setColor('#ffffff'); rect(B.wood, f, 0, Lf, gB, Y(GF), 0, UVT); }
      else skin(B.wall, f, gB, Y(GF), STONE, UVW);
    } else if (kind !== 'end') { // the yard and the south-east end: render, small windows, the stair doors
      if (side === 'B' && kind === 'panel' && extra === 'door') {
        door(f, c - 0.8, c + 0.8);
        win(f, c - 0.6, c + 0.6, Y(3.2), Y(4.3), { cols: 2 });           // the landing window
        B.det.setColor('#3a3b3d'); box(B.det, f, c - 1.5, c + 1.5, Y(2.95), Y(3.05), 0, 1.6, 'ftlru');
        B.glass.setColor('#9fb2bf'); box(B.glass, f, c - 1.45, c + 1.45, Y(3.05), Y(3.1), 0, 1.55, 't');
        solidL(f, c - 1.5, c + 1.5, 0, 1.6, Y(2.95), Y(3.1), 'awning', 1);
        B.det.setColor('#bdb9b0'); box(B.det, f, c - 1.3, c + 1.3, gB, Y(0), 0, 1.4, 'ftlr');
      } else if (side === 'B') for (const [w0, w1] of wins) win(f, w0, w1, Y(1.6), Y(GF - 0.9), { cols: 2 });
      skin(B.wall, f, gB, Y(GF), side === 'B' ? '#d9d6cf' : '#c9c5be', UVW);
      f.cuts.length = 0;
    }

    // the upper storeys
    if (kind === 'wood') {
      B.wood.setColor('#ffffff'); rect(B.wood, f, 0, Lf, Y(GF), top, 0, UVT);
    } else if (kind === 'mint') {
      B.wall.setColor(MINT); box(B.wall, f, 0, Lf, Y(GF), top, 0, 0.25, 'flr', UVW);
      // the green LED line on the pilaster's edge next to the timber strip
      B.led.setColor('#1d3d2b'); rect(B.led, f, 0, 0.07, Y(GF + 0.15), top, 0.27);
    } else if (kind === 'pil' || kind === 'end') {
      if (kind === 'end') { // the portal's column by the drive-through, a stone pier by the shops, render on the yard
        const portal = (side === 'F' || side === 'B') && a >= PS1 - 1e-3, yb = portal ? Y(PH + 0.5) : Y(GF);
        if (portal) { B.wall.setColor(PORTAL); box(B.wall, f, 0, Lf, gB, yb, 0, 0.3, 'flrt', UVW); }
        else if (shopSide) { B.det.setColor(STONE); box(B.det, f, 0, Lf, gB, yb, 0, 0.12, 'flr'); }
        else { B.wall.setColor('#d9d6cf'); rect(B.wall, f, 0, Lf, gB, yb, 0, UVW); }
        B.wall.setColor(WHITE); box(B.wall, f, 0, Lf, yb, TOPW + 0.15, 0, 0.12, 'flrt', UVW);
      } else { B.wall.setColor(WHITE); box(B.wall, f, 0, Lf, Y(GF), TOPW + 0.25, 0, 0.5, 'fblrt', UVW); }
    } else if (kind === 'bay') {
      // three glazed groups a storey between white bands that stand out from the wall
      const g = [[0.25, 1.95], [2.15, 4.85], [5.05, Lf - 0.25]];
      for (let k = 1; k <= NF; k++) for (const [w0, w1] of g) win(f, w0, w1, fy(k) + 0.75, fy(k) + 2.75, { cols: Math.round((w1 - w0) / 0.85), dep: 0.12 });
      skin(B.wall, f, Y(GF), TOPW, WHITE, UVW);
      B.wall.setColor(WHITE);
      for (let k = 1; k <= NF; k++) box(B.wall, f, 0, Lf, fy(k) - 0.25, fy(k) + 0.75, 0, 0.45, 'ftulr', UVW);
      box(B.wall, f, 0, Lf, ROOF - 0.25, TOPW + 0.1, 0, 0.45, 'ftulr', UVW);
      pediment(f, c, 0.45, TOPW + 0.1);
    } else { // grey or panel: windows a storey
      for (let k = k0; k <= NF; k++) for (const [w0, w1] of wins) win(f, w0, w1, fy(k) + 0.85, fy(k) + 2.55, { cols: Math.max(1, Math.round((w1 - w0) / 0.75)) });
      skin(B.wall, f, yUp, TOPW, kind === 'grey' ? GREY : WHITE, UVW);
      if (kind === 'grey') spandrels(f);
      else { // the panel joints: grooves at the slab lines and up the middle of the piers
        B.det.setColor('#c4c1ba');
        for (let k = k0; k <= NF; k++) box(B.det, f, 0, Lf, fy(k) - 0.02, fy(k) + 0.02, 0, 0.012, 'f');
        if (side === 'N') pediment(f, c, 0.02, TOPW);
      }
    }

    if (kind !== 'pil' && kind !== 'end' && !(kind === 'mint')) parapet(f, top);
    if (!tower && kind !== 'pil') zip(f, TOPW);
    f.cuts.length = 0;
    return f;
  }

  // a collision prism over an s / o rectangle of a face
  function solidL(f, s0, s1, o0, o1, y0, y1, kind = 'wall', flags = 0) {
    const Q = [[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = at(f, s, 0, o); return [p[0], p[2]]; });
    S.prism(Q.flat(), y0, y1, 0, 0, kind, flags);
  }

  // the arched pediment with its round oculus, standing on the parapet over the face's s = sc, front at o
  function pediment(f, sc, o, y0) {
    const Ro = 1.9, ri = 0.62, yc = y0 + 1.15, th = 0.35, n = 20;
    const outer = (a) => {               // the outline point in direction a from the oculus centre
      const dx = Math.cos(a), dy = Math.sin(a);
      if (dy >= 0) return [Ro * dx, Ro * dy];
      const tx = Math.abs(dx) > 1e-6 ? Ro / Math.abs(dx) : Infinity, ty = (yc - y0) / -dy, t = Math.min(tx, ty);
      return [dx * t, dy * t];
    };
    const T = B.wall; T.setColor(WHITE);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * 2 * Math.PI, a1 = ((i + 1) / n) * 2 * Math.PI;
      const o0 = outer(a0), o1 = outer(a1), i0 = [ri * Math.cos(a0), ri * Math.sin(a0)], i1 = [ri * Math.cos(a1), ri * Math.sin(a1)];
      for (const [oo, nn] of [[o, f.N], [o - th, f.N.map((v) => -v)]]) quad(T, at(f, sc + i0[0], yc + i0[1], oo), at(f, sc + o0[0], yc + o0[1], oo), at(f, sc + o1[0], yc + o1[1], oo), at(f, sc + i1[0], yc + i1[1], oo), nn);
      const m = (a0 + a1) / 2;            // the oculus' inner face, facing its centre
      quad(T, at(f, sc + i0[0], yc + i0[1], o), at(f, sc + i1[0], yc + i1[1], o), at(f, sc + i1[0], yc + i1[1], o - th), at(f, sc + i0[0], yc + i0[1], o - th),
        [-(f.U[0] * Math.cos(m)), -Math.sin(m), -(f.U[2] * Math.cos(m))]);
      if (o0[1] > 0 || o1[1] > 0) {       // the arch's top surface
        const nm = [f.U[0] * Math.cos(m), Math.sin(m), f.U[2] * Math.cos(m)];
        quad(T, at(f, sc + o0[0], yc + o0[1], o), at(f, sc + o1[0], yc + o1[1], o), at(f, sc + o1[0], yc + o1[1], o - th), at(f, sc + o0[0], yc + o0[1], o - th), nm);
      }
    }
    box(T, f, sc - Ro - 0.6, sc + Ro + 0.6, y0, y0 + 0.45, o - th, o, 'fbtlr', [2.5, 2.5]);   // the shoulders it stands on
  }

  for (const [side, list] of [['F', FRONT], ['N', SIDE], ['B', BACK], ['E', EAST]]) list.forEach((q, i, all) => section(side, q, i, all));

  // ---------------------------------------------------------------- the corner tower's rounded bay
  for (let i = 0; i < ARC; i++) {
    const p = arcPt(i), q = arcPt(i + 1), m = (i + 0.5) / ARC * Math.PI / 2;
    const f = lf(p, q, [-Math.cos(m), -Math.sin(m)]);
    shop(f, 0, f.L);
    win(f, 0, f.L, fy(1), fy(6) - 0.2, { cols: 1, rows: 10, dep: 0.08, lit: false, rev: FRAME });   // the curtain wall
    for (let k = 6; k <= NF; k++) win(f, 0, f.L, fy(k) + 0.75, fy(k + 1) - 0.4, { cols: 1, dep: 0.1, rev: FRAME });
    skin(B.wall, f, gB, Y(GF), STONE, UVW); skin(B.wall, f, Y(GF), CROWN, WHITE, UVW);
    parapet(f, CROWN);
    f.cuts.length = 0;
  }
  // the white slab bands round the bay (storeys 7–9 and the top) and the mint crown over the tower
  const arcRing = (o, from = 0, to = ARC) => Array.from({ length: to - from + 1 }, (_, j) => arcPt(from + j, R + o));
  const band = (o) => [...arcRing(o), ...arcRing(-0.05).reverse()];
  B.wall.setColor(WHITE);
  for (let k = 6; k <= NF; k++) B.wall.extrude(P(band(0.5)), [], fy(k) - 0.4, fy(k) + 0.75, { bottom: true });
  B.wall.extrude(P(band(0.5)), [], ROOF - 0.4, CROWN, { bottom: true });
  B.wall.setColor(MINT);
  const cap = (o) => [[4.9 + o, -o], ...arcRing(o).reverse(), [-o, 5.6 + o], [4.9 + o, 5.6 + o]];
  B.wall.extrude(P(cap(0.45)), [], CROWN, CAP, { bottom: true });
  B.wall.extrude(P(cap(0.2)), [], CAP, CAP + 0.35, { bottom: false });   // the stepped top
  B.wall.setColor(WHITE);                     // the crown's back walls over the roof
  rect(B.wall, lf([4.9, 0], [4.9, 5.6], [1, 0]), 0, 5.6, ROOF, CROWN, 0, UVW);
  rect(B.wall, lf([0, 5.6], [4.9, 5.6], [0, 1]), 0, 4.9, ROOF, CROWN, 0, UVW);
  // the LED line under the crown, along both timber strips and round the bay
  B.led.setColor('#1d3d2b');
  for (const [a, b, n] of [[[R, -0.03], [4.2, -0.03], [0, -1]], [[-0.03, R], [-0.03, 5.0], [-1, 0]]]) rect(B.led, lf(a, b, n), 0, Math.hypot(b[0] - a[0], b[1] - a[1]), CROWN - 0.08, CROWN - 0.02, 0);

  // ---------------------------------------------------------------- the shop fascia round the corner
  const fasc = (o) => [[PS0 - 0.3, -o], [R, -o], ...arcRing(o).reverse().slice(1, -1), [-o, R], [-o, D - 1.0]];
  const fOut = fasc(1.4), fIn = fasc(0).reverse();
  B.det.setColor(DARK); B.det.extrude(P([...fOut, ...fIn]), [], Y(GF - 0.75), Y(GF + 0.15), { bottom: true });
  B.det.setColor('#a8703f'); B.det.extrude(P([...fasc(1.3), ...fIn]), [], Y(GF - 0.9), Y(GF - 0.75), { bottom: true, top: false });
  B.led.setColor('#1d3d2b');
  for (let i = 0; i + 1 < fOut.length; i++) {
    const a = fOut[i], b = fOut[i + 1], dl = [b[0] - a[0], b[1] - a[1]], len = Math.hypot(...dl);
    let n = [dl[1] / len, -dl[0] / len];       // outward: away from the bay's centre (R, R)
    if (n[0] * ((a[0] + b[0]) / 2 - R) + n[1] * ((a[1] + b[1]) / 2 - R) < 0) n = n.map((v) => -v);
    rect(B.led, lf(a, b, n), 0, len, Y(GF - 0.75), Y(GF - 0.69), 0.02);
  }
  // the fascia holds a landing (an awning): along the boulevard, round the corner, along the side
  for (const f of [lf([R, 0], [PS0 - 0.3, 0], [0, -1]), lf([0, R], [0, D - 1.0], [-1, 0])]) solidL(f, 0, f.L, 0, 1.4, Y(GF - 0.9), Y(GF + 0.15), 'awning', 1);
  S.prism(P([[R, 0], ...arcRing(0).reverse().slice(1, -1), [0, R], ...arcRing(1.4)]).flat(), Y(GF - 0.9), Y(GF + 0.15), 0, 0, 'awning', 1);

  // ---------------------------------------------------------------- the drive-through
  const pw0 = lf([PS0, D], [PS0, 0], [1, 0]), pw1 = lf([PS1, 0], [PS1, D], [-1, 0]);
  for (const f of [pw0, pw1]) { B.wall.setColor('#8b8884'); rect(B.wall, f, 0, D, gB, Y(PH), 0, UVW); }
  B.det.setColor('#6d6b68'); B.det.fill(P([[PS0, 0], [PS1, 0], [PS1, D], [PS0, D]]), [], Y(PH), false);
  // lamps in the ceiling
  B.det.setColor('#f4f1e6');
  for (const t of [4, 9.25, 14.5]) B.det.fill(P([[24.9, t - 0.3], [26.0, t - 0.3], [26.0, t + 0.3], [24.9, t + 0.3]]), [], Y(PH) - 0.03, false);
  // the portal's beam on the front
  const fF = lf([0, 0], [L, 0], [0, -1]);
  B.wall.setColor(PORTAL); box(B.wall, fF, 22.0, L, Y(PH), Y(PH + 0.5), 0, 0.3, 'ftu', UVW);
  box(B.wall, fF, 22.0, 22.5, gB, Y(PH), 0, 0.3, 'flr', UVW);

  // ---------------------------------------------------------------- the roof: membrane, the lift room behind the pediment
  B.det.setColor('#6f7072'); B.det.fill(ring, [], ROOF + 0.02, true);
  const lift = [[9.0, 1.6], [17.4, 1.6], [17.4, 7.4], [9.0, 7.4]];
  B.wall.setColor('#a9a49e'); B.wall.extrude(P(lift), [], ROOF, ROOF + 2.5, { top: false });
  B.det.setColor('#56585b'); B.det.extrude(P([[8.7, 1.3], [17.7, 1.3], [17.7, 7.7], [8.7, 7.7]]), [], ROOF + 2.5, ROOF + 2.75, { bottom: true });
  S.prism(P(lift).flat(), ROOF, ROOF + 2.75, 0, 0, 'wall');

  // ---------------------------------------------------------------- collision
  const body = [...ringL.slice(0, ARC + 1), [PS0, 0], [PS0, D], [0, D]];
  S.prism(P(body).flat(), gB, TOPW, 0, 0, 'wall');
  S.prism(P([[PS1, 0], [L, 0], [L, D], [PS1, D]]).flat(), gB, TOPW, 0, 0, 'wall');
  S.prism(P([[PS0, 0], [PS1, 0], [PS1, D], [PS0, D]]).flat(), Y(PH), TOPW, 0, 0, 'wall');

  const pane = paneTex(false), mask = paneTex(true), warm = new THREE.Color('#ffd7a0');
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: speckle(r), vertexColors: true, roughness: 0.86 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTex(r), color: '#9a6844', vertexColors: true, roughness: 0.72 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 }),
    glass: new THREE.MeshStandardMaterial({ map: pane, vertexColors: true, roughness: 0.08, metalness: 0.5, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ map: pane, vertexColors: true, roughness: 0.12, metalness: 0.3, emissive: warm, emissiveMap: mask, emissiveIntensity: 0 }),
    led: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: new THREE.Color('#3dff86'), emissiveIntensity: 0 }),
  };
  const out = finish(root, 'shev184', B, M, { shade: ['wall', 'wood'] });
  console.log(`[cherkasy] Shevchenka 184–186: ${nWin} windows, floor ${yF.toFixed(1)} m, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  // generated trees keep off the building and the cleared lot behind it
  return {
    footprints: [{ poly: ring, h: CAP - gLo, kind: 'apt', name: 'Новобудова, бульвар Шевченка, 184–186' }],
    clear: (x, z) => { const [s, t] = toLocal(x, z); return (s > -2 && s < L + 8 && t > -1.5 && t < D + 10) || inPoly(ring, x, z); },
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.9 * k; M.led.emissiveIntensity = 3.2 * k; },
  };
}
