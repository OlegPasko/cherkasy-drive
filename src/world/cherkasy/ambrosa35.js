// OWNER: cherkasy. The new block of «Надія» at вулиця Сергія Амброса, 35 (Припортовий, on the corner of Різдвяна; one
// section, 48 flats, brick under a rendered insulation coat, in service), built from the renders in the lun.ua catalogue
// (lun.ua/new/cherkasy/serhiia-ambrosa-st-35) and on the developer's page (nadiyabud.com, «вул. Сергія Амброса, 35»),
// on the OSM outline (way 1160384062, ~17 x 19 m). Nine storeys as the renders count them: a 3.3 m shop storey in
// dark teal render, the shop windows in near-black surrounds, eight floors of flats in white render. The facades, read from the renders face by
// face: on the street corner a full-height bowed glazed bay (three facets), its slab bands green over the top three
// floors and sand below, framed by two proud green pilasters with orange inner strips and topped by a green crown over a deep orange band. The
// Амброса front: a loggia stack at the north-west end, a white bay of two window stacks (green spandrels up top, a sand
// panel and a green «8» frame round the right stack), a wide loggia stack, a pier of one stack with green / sand
// spandrels. The Різдвяна front: a loggia stack, such a pier, a narrow loggia stack, a white end. The yard (north-east)
// front: a white bay of two stacks in orange-green-orange «8» frames by a green corner stripe, the stair core recessed
// in sand render with landing windows and the entrance under a canopy, a pier and a wide loggia stack. The north-west
// end is blank: white with green and sand stripes and a big orange triangle under the parapet. Loggias are glazed full
// height in white frames over orange slab bands. Every parapet: a green band under a projecting orange coping. A stair
// and lift house on the roof. Windows light up at night. No developer name or logo anywhere.
//   AMBROSA35_SKIP: the OSM ids replaced here
//   buildAmbrosa35({ root, solids, zips?, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Laid out in the lot frame: e from the Амброса front to the yard front (north-east), n from the blank north-west end to
// the Різдвяна front (south-east), the origin the OSM corner at Амброса / the north-west end. Walls per face (slabkit.js):
// s along the face, left to right for a viewer outside, y up, o outward.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { rng } from './geo.js';
import { face, at, quad, rect, box, skin, hole, finish, speckle } from './slabkit.js';

export const AMBROSA35_SKIP = new Set([1160384062]);

const O = [398.4, 2982.1], EU = [17.0 / 17.0106, 0.6 / 17.0106], NU = [-EU[1], EU[0]];
const W = 17.0, DP = 18.8;                          // the north-west end and the Амброса front, m
const L = (e, n) => [O[0] + EU[0] * e + NU[0] * n, O[1] + EU[1] * e + NU[1] * n];
const G = 3.3, FH = 3.0, NL = 8;                    // shop storey, floor, floors of flats
const BC = [3.0, 15.8], BR = 3.0;                   // the corner bay: the arc's centre (e, n) and radius
const ARC = [180, 150, 120, 90].map((a) => [BC[0] + BR * Math.cos(a * Math.PI / 180), BC[1] + BR * Math.sin(a * Math.PI / 180)]);
const REC = [9.2, 12.0, 1.6];                       // the stair recess on the yard front: n from, n to, depth
// the outline (e, n): the block, the stair recess notched into the yard front, the bay's arc on the street corner
const RING = [[0, 0], [W, 0], [W, REC[0]], [W - REC[2], REC[0]], [W - REC[2], REC[1]], [W, REC[1]], [W, DP], ...ARC.slice().reverse()];
export const AMBROSA35_RING = RING.flatMap(([e, n]) => L(e, n).map((v) => Math.round(v * 10) / 10));

const WHITE = '#f3f2ee', ORANGE = '#d4511d', GREEN = '#1f6a45', SAND = '#d4aa70', TEAL = '#17485b', DTEAL = '#0e2e3c';
const FRAME = '#f1f1ed', REV = '#e6e4de', DARK = '#33393d';
const GLASS = ['#4a5862', '#55636c', '#43515a', '#5d6a72'];

// a face over the lot points (e0, n0) -> (e1, n1) with the outward normal (ne, nn) in the lot frame
const fc = (p, q, ne, nn) => face(L(...p), L(...q), ne * EU[0] + nn * NU[0], ne * EU[1] + nn * NU[1]);

// the faces, each with its sections left to right: col a window stack at s = c (sq: spandrel squares 'top' green over
// the top three floors, 'gb' green over sand below); log a glazed loggia stack [s0, s1]; pil a proud green pilaster;
// strip a flat colour strip over the flats; frame a colour frame round the windows over floors k0..k1; shop the
// ground-floor openings [s0, s1, door?]
const FACES = [
  { id: 'ambrosa', a: [0, 0], b: [0, BC[1]], n: [-1, 0], parts: [
    { t: 'log', s0: 0.35, s1: 2.75, panes: 2 },
    { t: 'col', c: 3.9, sq: 'top' }, { t: 'col', c: 6.4 },
    { t: 'frame', s0: 5.3, s1: 7.55, k0: 6, k1: 7, col: SAND }, { t: 'frame', s0: 5.5, s1: 7.3, k0: 2, k1: 3, col: GREEN },
    { t: 'log', s0: 7.6, s1: 13.3, panes: 5 },
    { t: 'col', c: 14.25, sq: 'gb' },
    { t: 'pil', s0: 15.1, s1: 15.8, inner: 1 }],
    shop: [[0.6, 2.4], [3.0, 4.8], [5.6, 7.2], [8.2, 10.6], [11.2, 12.9], [13.5, 14.8, true]] },
  { id: 'rizdviana', a: [BC[0], DP], b: [W, DP], n: [0, 1], parts: [
    { t: 'pil', s0: 0, s1: 0.7, inner: 0 },
    { t: 'log', s0: 0.75, s1: 6.5, panes: 5 },
    { t: 'col', c: 7.65, sq: 'gb' },
    { t: 'log', s0: 8.8, s1: 11.6, panes: 2 },
    { t: 'col', c: 12.8 }],
    shop: [[1.2, 3.4], [4.0, 5.6, true], [6.4, 8.8], [9.6, 11.2], [12.0, 13.4]] },
  { id: 'yard', a: [W, DP], b: [W, 0], n: [1, 0], parts: [
    { t: 'strip', s0: 0, s1: 0.8, col: GREEN },
    { t: 'col', c: 2.6 }, { t: 'col', c: 5.0 },
    { t: 'frame', s0: 1.5, s1: 6.8, k0: 7, k1: 7, col: ORANGE }, { t: 'frame', s0: 1.6, s1: 3.6, k0: 4, k1: 5, col: GREEN },
    { t: 'frame', s0: 1.5, s1: 6.8, k0: 2, k1: 2, col: ORANGE },
    { t: 'rec', s0: DP - REC[1], s1: DP - REC[0] },
    { t: 'col', c: 10.8, sq: 'gb' },
    { t: 'log', s0: 12.0, s1: 18.2, panes: 6 }],
    shop: [[1.2, 3.0], [4.0, 6.0], [10.1, 11.5], [12.6, 14.8], [15.4, 17.8]] },
  { id: 'end', a: [W, 0], b: [0, 0], n: [0, -1], parts: [
    { t: 'strip', s0: 0.3, s1: 0.9, col: GREEN }, { t: 'strip', s0: 13.5, s1: 15.6, col: SAND }, { t: 'strip', s0: 15.6, s1: 16.3, col: GREEN },
    { t: 'tri', s0: 0.9, s1: 13.5, drop: 9 }],
    shop: [] },
];

export function buildAmbrosa35({ root, solids: S, zips: Z, heightAt }) {
  const t0 = performance.now(), r = rng(3535), n0 = S.count;
  const ring = RING.map(([e, n]) => L(e, n));
  const hs = ring.map(([x, z]) => heightAt(x, z));
  if (hs.some((h) => !Number.isFinite(h))) return null;
  const gLo = Math.min(...hs), gHi = Math.max(...hs), yF = gHi + 0.15, gB = gLo - 0.5;
  const fy = (k) => (k === 0 ? yF : yF + G + (k - 1) * FH), eave = fy(NL + 1), cope = eave + 1.1, crown = eave + 3.0;
  const B = { wall: new MB(), det: new MB(), glass: new MB(), lit: new MB() };
  const Wl = B.wall, D = B.det, UV = [2.5, 2.5];
  const glass = () => GLASS[(r() * GLASS.length) | 0];
  let nWin = 0, nPane = 0;

  // a copy of face f over s in [a, b], o outward, its cuts shifted along
  const off = (f, a, b, o) => {
    const p = at(f, a, 0, o), q = at(f, b, 0, o), g = face([p[0], p[2]], [q[0], q[2]], f.nx, f.nz);
    g.cuts = f.cuts.filter((c) => c.s1 > a && c.s0 < b).map((c) => ({ ...c, s0: c.s0 - a, s1: c.s1 - a }));
    return g;
  };

  for (const spec of FACES) {
    const f = fc(spec.a, spec.b, ...spec.n);
    f.cuts = [];
    for (const p of spec.parts) {
      if (p.t === 'col') for (let k = 1; k <= NL; k++) {
        f.cuts.push({ s0: p.c - 0.58, s1: p.c + 0.58, y0: fy(k) + 0.8, y1: fy(k) + 2.55, glass: glass(), lit: r() < 0.3, frame: FRAME, rev: REV, dep: 0.2, pitch: 0.58, sill: '#d6d6d2', win: true });
        nWin++;
      }
      if (p.t === 'log') f.cuts.push({ s0: p.s0, s1: p.s1, y0: fy(1), y1: eave, log: p });
      if (p.t === 'rec') f.cuts.push({ s0: p.s0, s1: p.s1, y0: gB, y1: eave, rec: true });
    }
    for (const [s0, s1, door] of spec.shop) f.cuts.push(door
      ? { s0, s1, y0: yF, y1: fy(1) - 0.45, door: true, glass: '#5b5248', lit: true, frame: FRAME, rev: DTEAL, dep: 0.25, pitch: 0.65, tr: fy(1) - 1.05 }
      : { s0, s1, y0: yF + 0.35, y1: fy(1) - 0.45, glass: '#3e4a52', lit: r() < 0.6, frame: FRAME, rev: DTEAL, dep: 0.25, pitch: 1.2 });

    // the walls: teal shop storey, white flats; the parapet: a green band under the orange coping
    skin(Wl, f, gB, fy(1), TEAL, UV);
    skin(Wl, f, fy(1), eave, WHITE, UV);
    // plinth and parapet run along the face, broken by the stair recess
    const rec = f.cuts.find((q) => q.rec), runs = rec ? [[0, rec.s0], [rec.s1, f.L]] : [[0, f.L]];
    for (const [a, b] of runs) {
      const e0 = a === 0 ? -0.12 : a, e1 = b === f.L ? b + 0.12 : b;
      D.setColor(DTEAL); box(D, f, a, b, gB, yF, 0, 0.04, 'ft');
      Wl.setColor(GREEN); box(Wl, f, a, b, eave, eave + 0.55, -0.25, 0.02, 'fb', UV);
      D.setColor(ORANGE); box(D, f, e0, e1, eave + 0.55, cope, -0.3, 0.16, 'ftbulr');
      if (Z && b - a > 3) { const p = at(f, a, 0, -0.1), q = at(f, b, 0, -0.1); Z.edge(p[0], p[2], q[0], q[2], cope, f.nx, f.nz); }
    }

    for (const q of f.cuts) {
      if (q.y1 < fy(1) && !q.rec) { D.setColor(DTEAL); for (const [a, b] of [[q.s0 - 0.35, q.s0], [q.s1, q.s1 + 0.35]]) box(D, f, a, b, yF, fy(1) - 0.1, 0, 0.03, 'flr'); box(D, f, q.s0, q.s1, q.y1, fy(1) - 0.1, 0, 0.03, 'fu'); }
      if (q.log) loggia(f, q);
      else if (q.rec) recess(f, q);
      else hole(B, f, q);
    }
    for (const p of spec.parts) {
      if (p.t === 'col' && p.sq) for (let k = 1; k <= NL; k++) {
        if (k < 6 && p.sq === 'top') continue;
        Wl.setColor(k >= 6 ? GREEN : SAND); box(Wl, f, p.c - 0.62, p.c + 0.62, fy(k) - 0.05, fy(k) + 0.72, 0, 0.04, 'ftlru', UV);
      }
      if (p.t === 'frame') panel(f, p.s0, p.s1, fy(p.k0) + 0.3, fy(p.k1) + 2.95, p.col);
      if (p.t === 'strip') { Wl.setColor(p.col); rect(Wl, f, p.s0, p.s1, fy(1), eave, 0.02, UV); }
      if (p.t === 'pil') { // green, its bay side an orange strip from the flats up to the crown band
        const [g0, g1, o0, o1] = p.inner ? [p.s0, p.s1 - 0.3, p.s1 - 0.3, p.s1] : [p.s0 + 0.3, p.s1, p.s0, p.s0 + 0.3];
        Wl.setColor(GREEN); box(Wl, f, g0, g1, gB, crown, 0, 0.3, 'flr', UV); box(Wl, f, o0, o1, gB, fy(1), 0, 0.3, 'flr', UV);
        Wl.setColor(ORANGE); box(Wl, f, o0, o1, fy(1), eave, 0, 0.3, 'flr', UV);
      }
      if (p.t === 'tri') {
        const y1 = eave, y0 = eave - p.drop, k = p.drop / (p.s1 - p.s0), s2 = p.s1 + 0.6 / k;
        Wl.setColor(GREEN); Wl.face([at(f, p.s0, y0 - 0.6, 0.025), at(f, s2, y1, 0.025), at(f, p.s0, y1, 0.025)], f.N);
        Wl.setColor(ORANGE); Wl.face([at(f, p.s0, y0, 0.035), at(f, p.s1, y1, 0.035), at(f, p.s0, y1, 0.035)], f.N);
      }
    }
  }

  // a colour panel 4 cm proud over [s0, s1] x [y0, y1], cut round the windows in it
  function panel(f, s0, s1, y0, y1, col) {
    const g = off(f, s0, s1, 0.04);
    skin(Wl, g, y0, y1, col, UV);
    Wl.setColor(col); box(Wl, f, s0, s1, y0, y1, 0, 0.04, 'lrtu');
  }

  // a loggia stack: white reveals, full-height glazing per floor in white frames, an orange slab band at every floor
  function loggia(f, q) {
    const { s0, s1, log: p } = q, o = -0.15, w = (s1 - s0) / p.panes;
    D.setColor(REV);
    quad(D, at(f, s0, q.y0), at(f, s0, q.y0, o), at(f, s0, q.y1, o), at(f, s0, q.y1), f.U);
    quad(D, at(f, s1, q.y0), at(f, s1, q.y0, o), at(f, s1, q.y1, o), at(f, s1, q.y1), [-f.ux, 0, -f.uz]);
    for (let k = 1; k <= NL; k++) {
      const y0 = fy(k) + 0.35, y1 = fy(k + 1) - 0.05;
      for (let i = 0; i < p.panes; i++) {
        const Gm = r() < 0.3 ? B.lit : B.glass;
        Gm.setColor(glass()); rect(Gm, f, s0 + i * w, s0 + (i + 1) * w, y0, y1, o); nPane++;
      }
      D.setColor(FRAME);
      for (const y of [y0 + 0.9, y1 - 0.04]) rect(D, f, s0, s1, y - 0.035, y + 0.035, o + 0.03);
      for (let i = 0; i <= p.panes; i++) { const s = s0 + i * w; rect(D, f, Math.max(s0, s - 0.04), Math.min(s1, s + 0.04), y0, y1, o + 0.03); }
      D.setColor(ORANGE); box(D, f, s0 - 0.04, s1 + 0.04, fy(k) - 0.05, fy(k) + 0.35, o, 0.3, 'ftulr');
    }
  }

  // the stair core: set back REC[2], sand render over the flats, landing windows half a floor up, the entrance door
  // under a canopy at the foot
  function recess(f, q) {
    const d = REC[2], g = off(f, q.s0, q.s1, -d), m = (q.s1 - q.s0) / 2;
    g.cuts = [{ s0: m - 0.85, s1: m + 0.85, y0: yF, y1: fy(1) - 0.5, door: true, glass: '#5b5248', lit: true, frame: FRAME, rev: DTEAL, dep: 0.2, pitch: 0.85, tr: fy(1) - 1.1 }];
    for (let k = 1; k < NL; k++) g.cuts.push({ s0: m - 0.6, s1: m + 0.6, y0: fy(k) + 1.9, y1: fy(k) + 3.3, glass: glass(), lit: r() < 0.5, frame: FRAME, rev: REV, dep: 0.15, pitch: 0.6 });
    skin(Wl, g, gB, fy(1), TEAL, UV);
    skin(Wl, g, fy(1), eave, SAND, UV);
    for (const c of g.cuts) hole(B, g, c);
    D.setColor(DTEAL); box(D, g, 0, g.L, gB, yF, 0, 0.04, 'ft');
    Wl.setColor(GREEN); box(Wl, g, 0, g.L, eave, eave + 0.55, -0.25, 0.02, 'fb', UV);
    D.setColor(ORANGE); box(D, g, -0.12, g.L + 0.12, eave + 0.55, cope, -0.3, 0.16, 'ftbu');
    // the side walls of the recess
    for (const [s, n] of [[q.s0, f.U], [q.s1, [-f.ux, 0, -f.uz]]]) {
      Wl.setColor(TEAL); quad(Wl, at(f, s, gB), at(f, s, gB, -d), at(f, s, fy(1), -d), at(f, s, fy(1)), n, [[0, gB / 2.5], [d / 2.5, gB / 2.5], [d / 2.5, fy(1) / 2.5], [0, fy(1) / 2.5]]);
      Wl.setColor(WHITE); quad(Wl, at(f, s, fy(1)), at(f, s, fy(1), -d), at(f, s, cope, -d), at(f, s, cope), n, [[0, fy(1) / 2.5], [d / 2.5, fy(1) / 2.5], [d / 2.5, cope / 2.5], [0, cope / 2.5]]);
    }
    // the canopy: a flat dark slab from the door out past the face line
    const y1 = fy(1) - 0.2, y0 = y1 - 0.2;
    D.setColor(DARK); box(D, f, q.s0 + 0.1, q.s1 - 0.1, y0, y1, -d, 0.9, 'ftlr');
    D.setColor('#c9c6be'); box(D, f, q.s0 + 0.1, q.s1 - 0.1, y0, y1, -d, 0.9, 'u');
    const P = [[q.s0 + 0.1, -d], [q.s1 - 0.1, -d], [q.s1 - 0.1, 0.9], [q.s0 + 0.1, 0.9]].map(([s, o]) => { const v = at(f, s, 0, o); return [v[0], v[2]]; });
    S.prism(P.flat(), y0, y1, 0, 0, 'awning', 1);
  }

  // the corner bay: three glazed facets, slab bands sand / green, the shop storey glazed to the ground
  const facets = ARC.slice(0, 3).map((p, i) => {
    const q = ARC[i + 1], a = (165 - 30 * i) * Math.PI / 180;
    return fc(p, q, Math.cos(a), Math.sin(a));
  });
  for (const f of facets) {
    const o = -0.1;
    for (let k = 0; k <= NL; k++) {
      const y0 = k ? fy(k) + 0.4 : yF + 0.25, y1 = k ? fy(k + 1) - 0.05 : fy(1) - 0.35;
      for (const [a, b] of [[0, f.L / 2], [f.L / 2, f.L]]) {
        const Gm = r() < (k ? 0.3 : 0.6) ? B.lit : B.glass;
        Gm.setColor(k ? glass() : '#3e4a52'); rect(Gm, f, a, b, y0, y1, o); nPane++;
      }
      D.setColor(FRAME);
      for (const s of [0.04, f.L / 2, f.L - 0.04]) rect(D, f, Math.max(0, s - 0.04), Math.min(f.L, s + 0.04), y0, y1, o + 0.03);
      for (const y of [y0 + 0.04, y0 + 0.9, y1 - 0.04]) rect(D, f, 0, f.L, y - 0.035, y + 0.035, o + 0.03);
      if (k >= 1) { D.setColor(k >= 6 ? GREEN : SAND); box(D, f, -0.08, f.L + 0.08, fy(k) - 0.05, fy(k) + 0.4, o, 0.32, 'ftu'); }
      else { D.setColor(DTEAL); box(D, f, -0.04, f.L + 0.04, fy(1) - 0.35, fy(1) - 0.05, o, 0.04, 'ftu'); rect(D, f, 0, f.L, gB, yF + 0.25, 0.02); }
    }
  }
  // the crown over the bay: an orange band, then green to well over the parapet
  {
    const R2 = BR + 0.32, out = [[-0.32, BC[1] - 0.7], ...[180, 150, 120, 90].map((a) => [BC[0] + R2 * Math.cos(a * Math.PI / 180), BC[1] + R2 * Math.sin(a * Math.PI / 180)]), [BC[0] + 0.7, DP + 0.32], [BC[0] + 0.7, BC[1] - 0.7]];
    const P = out.map(([e, n]) => L(e, n)), P2 = out.map(([e, n]) => L(e + (e < BC[0] ? -0.04 : 0), n + (n > BC[1] ? 0.04 : 0)));
    D.setColor(ORANGE); D.extrude(P2, [], eave - 0.05, eave + 1.0, { top: false, bottom: true });
    Wl.setColor(GREEN); Wl.extrude(P, [], eave + 1.0, crown, { top: false });
    D.setColor(GREEN); D.extrude(P2, [], crown, crown + 0.25, { bottom: true });
    S.prism(P.flat(), gB, crown + 0.25, 0, 0, 'wall');
  }

  // the roof, the stair and lift house over the core
  D.setColor('#5d6064'); D.fill(ring, [], eave + 0.02, true);
  {
    const hseP = [[W - 4.6, REC[0] - 0.6], [W - REC[2] - 0.2, REC[0] - 0.6], [W - REC[2] - 0.2, REC[1] + 0.6], [W - 4.6, REC[1] + 0.6]].map(([e, n]) => L(e, n));
    Wl.setColor(WHITE); Wl.extrude(hseP, [], eave, eave + 2.8, { top: false });
    D.setColor(ORANGE); D.extrude(hseP, [], eave + 2.8, eave + 3.1);
    S.prism(hseP.flat(), eave, eave + 3.1, 0, 0, 'equipment');
  }
  // collision: the block to the coping
  S.prism(ring.flat(), gB, cope, 0, 0, 'wall');

  const M = {
    wall: new THREE.MeshStandardMaterial({ map: speckle(r), vertexColors: true, roughness: 0.86 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.45 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3, emissive: 0xffd6a0, emissiveIntensity: 0 }),
  };
  const out = finish(root, 'ambrosa35', B, M, { shade: ['wall', 'det'] });
  console.log(`[cherkasy] Ambrosa 35: ${nWin} windows, ${nPane} panes, floor ${yF.toFixed(1)} m (ground ${gLo.toFixed(1)}–${gHi.toFixed(1)}), ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  const ex = (x, z) => { const dx = x - O[0], dz = z - O[1]; return [dx * EU[0] + dz * EU[1], dx * NU[0] + dz * NU[1]]; };
  return {
    footprints: [{ poly: ring, h: crown + 0.25 - gLo, kind: 'apt', name: 'Новобудова · вул. Сергія Амброса, 35' }],
    clear: (x, z) => { const [e, n] = ex(x, z); return e > -2 && e < W + 2 && n > -2 && n < DP + 2; },
    update() { M.lit.emissiveIntensity = 1.1 * nightK.value; },
  };
}
