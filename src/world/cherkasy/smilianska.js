// OWNER: cherkasy. The two seventeen-storey towers of «Надія» behind вул. Смілянська, between Гоголя and Благовісна,
// built as the lun.ua catalogue (lun.ua/new/cherkasy/smilianska-st-48-50-54, .../smilianska-st-52) and the developer's
// renders show them: one design, mirrored, with the yard and its playground between. The south-east tower (Смілянська
// 48, 50, 54, OSM way 546773841) stands finished; the north-west one (Смілянська, 52, due late 2026, its frame topped
// out) is built as rendered over the misplaced OSM marker 1124412970. A tower is a ~28 m square with a big 45° chamfer
// at the drive corner and a small one opposite, drawn section by section from the renders: on the big chamfer two
// canted loggia bays round a stack of white balconies between white fins; on the small one a single wide loggia bay
// between white recessed strips; on the long sides dark-brown bands by the corners, cream walls with a column of
// windows a floor, loggia bays at the far corners. Every wall is zoned the same way: dark brown on the ground floor and
// the top two storeys, ochre on storeys 2–3 and 13–15, cream between; the bays are dark brown with three ochre storeys
// at mid-height, wood-framed glass; white parapets follow the outline over a dark roof with two white lift rooms. The
// yard: lawn, a playground on red rubber with a wooden play tower and a slide, swings, benches and thujas. No names,
// no developer marks.
//   SMILIANSKA_SKIP: the OSM ids replaced here (the two towers' ways and the small houses on the yard)
//   buildSmilianska({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints, towers } | null
//     towers: [{ ring, top }] per tower, south-east (48–54) first: the outline in map metres and the roof deck height (tests)
//   SMIL52_RING (flat ring): the north-west tower's outline for places.js (OSM has no footprint of it)
// The facades are one painted atlas of tiles (bay storey with a brown or an ochre spandrel, single window, shopfront,
// door, balcony door), one quad per module per storey over walls laid in vertex colours; the lit tiles go to a second
// mesh whose emissive mask is the glass.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex, decal } from './sculpt.js';
import { rng } from './geo.js';
import { face, at, quad, box, rect, solid, finish } from './slabkit.js';

export const SMILIANSKA_SKIP = new Set([546773841, 1124412970, 962938304, 546773839, 596150137]);

// the tower in its own frame: u along map +x (north-east), v along map +z (south-east); the ring is convex
const LOC = [[0, 0], [14, 0], [28.3, 14.1], [28.3, 28.1], [10, 28.1], [0, 18.1]];
// faces in ring order: 0 the yard side, 1 the big chamfer (the drive corner), 2 the drive side, 3 the back, 4 the small
// chamfer, 5 the lane side. Sections run along the face: bay (canted loggia stack), balc (white balcony stack), wall
// (zoned, n window columns), band (dark brown), strip (white recess), blank (zoned, no windows)
const LAY = [
  [{ k: 'blank', w: 3.0 }, { k: 'wall', w: 8.5, n: 0, door: true }, { k: 'band', w: 2.5 }],
  [{ k: 'band', w: 0.9 }, { k: 'bay', w: 6.6 }, { k: 'balc', w: 5.4 }, { k: 'bay', w: 6.6 }, { k: 'band', w: 0.94 }],
  [{ k: 'band', w: 2.5 }, { k: 'blank', w: 11.5 }],
  [{ k: 'wall', w: 3.6, n: 1 }, { k: 'bay', w: 6.4 }, { k: 'wall', w: 5.6, n: 1 }, { k: 'band', w: 2.7 }],
  [{ k: 'strip', w: 1.1 }, { k: 'bay', w: 11.94, ochre: [6, 7, 8], step: true }, { k: 'strip', w: 1.1 }],
  [{ k: 'band', w: 2.7 }, { k: 'wall', w: 5.4, n: 1 }, { k: 'bay', w: 6.4 }, { k: 'wall', w: 3.6, n: 1 }],
];
// the two towers: origin of the local frame in map metres, mirrored (v flipped) for the north-west one
const TOWERS = [
  { name: 'вул. Смілянська, 48, 50, 54', x0: -386.7, z0: 329.5, mirror: false },
  { name: 'вул. Смілянська, 52', x0: -386.7, z0: 266.0 + 28.1, mirror: true },
];
const toMap = (T, [u, v]) => [T.x0 + u, T.mirror ? T.z0 - v : T.z0 + v];
export const SMIL52_RING = LOC.flatMap((p) => toMap(TOWERS[1], p)).map((v) => Math.round(v * 10) / 10);

const GF = 3.3, FH = 3.0, NF = 16, PAR = 1.1;           // ground floor, storey, flats storeys over it, parapet
const BROWN = '#4a3029', CREAM = '#efe0b4', OCHRE = '#c79a4a', WHITE = '#f0efe9', BEIGE = '#e3d7bd', PLINTH = '#3a2520';
// the wall zoning by storey (0 = ground floor): brown, ochre 2–3, cream, ochre 13–15, brown 16–17
const ZONES = [[0, 1, BROWN], [1, 3, OCHRE], [3, 12, CREAM], [12, 15, OCHRE], [15, 17, BROWN]];

const T = { BAYB: 0, BAYO: 1, WIN: 2, SHOP: 3, DOOR: 4, BDOOR: 5 }, NT = 6, TW = 128, TH = 256;
function atlas(mask) {
  return canvasTex(NT * TW, TH, (g) => {
    const fill = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const WOOD = '#9a5a26';
    // a pane: tile fractions, x across, y up from the bottom; bars at the given fractions
    const pane = (t, x0, x1, y0, y1, vx = [], hy = [], fw = 5, gt = '#8f9a9e', gb = '#3a4044') => {
      const X = t * TW, a = X + x0 * TW, b = X + x1 * TW, top = TH * (1 - y1), bot = TH * (1 - y0);
      if (mask) { fill('#fff', a, top, b - a, bot - top); return; }
      fill(WOOD, a - fw, top - fw, b - a + 2 * fw, bot - top + 2 * fw);
      const gr = g.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, gt); gr.addColorStop(1, gb); g.fillStyle = gr; g.fillRect(a, top, b - a, bot - top);
      g.fillStyle = WOOD;
      for (const v of vx) g.fillRect(X + v * TW - fw / 2, top, fw, bot - top);
      for (const h of hy) g.fillRect(a, TH * (1 - h) - fw / 2, b - a, fw);
    };
    const wall = (t, c) => fill(mask ? '#000' : c, t * TW, 0, TW, TH);
    // a bay storey: the spandrel band at the slab, then the loggia glazing to the next slab
    for (const [t, c] of [[T.BAYB, BROWN], [T.BAYO, OCHRE]]) {
      wall(t, c); if (!mask) fill('rgba(0,0,0,0.18)', t * TW, TH * 0.66, TW, 4); // the slab's shadow line
      pane(t, 0.04, 0.96, 0.34, 0.95, [0.5], [0.55], 7);
    }
    // a single window: wood frame, a mullion and a transom (the wall shows round it in the vertex colour: white here)
    wall(T.WIN, '#ffffff'); pane(T.WIN, 0.08, 0.92, 0.04, 0.96, [0.5], [0.75], 7);
    wall(T.SHOP, BROWN); pane(T.SHOP, 0.04, 0.96, 0.05, 0.94, [0.5], [0.76], 6, '#a9b8c2', '#3d4850');
    wall(T.DOOR, BROWN); pane(T.DOOR, 0.14, 0.86, 0.0, 0.9, [0.6], [0.72], 7, '#8c9aa4', '#2f383f');
    // the balcony stack's back wall: a door and a window in light render
    wall(T.BDOOR, BEIGE); pane(T.BDOOR, 0.08, 0.42, 0.02, 0.82, [], [0.66], 5); pane(T.BDOOR, 0.55, 0.92, 0.32, 0.82, [0.73], [], 5);
  }, { repeat: false });
}

export function buildSmilianska({ root, map, solids: S, zips: Z, heightAt }) {
  if (!map.buildings.some((b) => SMILIANSKA_SKIP.has(b.id))) return null;
  const t0 = performance.now(), r = rng(546773841 % 65521), n0 = S.count;
  const B = { tile: new MB(), lit: new MB(), det: new MB(), roof: new MB(), pave: new MB(), soft: new MB(), leaf: new MB() };
  const D = B.det, R = B.roof;
  const u0 = (t) => (t * TW + 1.5) / (NT * TW), u1 = (t) => ((t + 1) * TW - 1.5) / (NT * TW);
  let nTiles = 0, nLit = 0;
  const towers = [], footprints = [];

  // one atlas tile on face f over s0..s1, y0..y1, o off the wall; lit at random by the share p
  const tile = (f, t, s0, s1, y0, y1, p = 0, o = 0.02) => {
    const on = r() < p, M = on ? B.lit : B.tile; nTiles++; nLit += on;
    M.setColor('#ffffff');
    quad(M, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), f.N, [[u0(t), 0], [u1(t), 0], [u1(t), 1], [u0(t), 1]]);
  };
  // the face over map points a -> b, outward away from the centre c
  const faceOut = (a, b, c) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    let nx = dz / l, nz = -dx / l;
    const mx = (a[0] + b[0]) / 2 - c[0], mz = (a[1] + b[1]) / 2 - c[1];
    if (mx * nx + mz * nz < 0) { nx = -nx; nz = -nz; }
    return face(a, b, nx, nz);
  };

  for (const TW_ of TOWERS) {
    const ring = LOC.map((p) => toMap(TW_, p));
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const hs = ring.map(([x, z]) => heightAt(x, z)), gLo = Math.min(...hs), gHi = Math.max(...hs);
    const yF = gHi + 0.15, gB = gLo - 0.6, y1 = yF + GF, ROOF = y1 + NF * FH, TOP = ROOF + PAR;
    const yS = (k) => (k === 0 ? yF : y1 + (k - 1) * FH);   // the floor of storey k (0 = ground floor)
    const polys = [];                                         // bay outlines, for the roof's parapet and the footprint

    LOC.forEach((_, fi) => {
      // a mirrored tower walks each face the other way round, so its sections are laid from the far end
      const a = ring[fi], b = ring[(fi + 1) % ring.length];
      const f = TW_.mirror ? faceOut(b, a, [cx, cz]) : faceOut(a, b, [cx, cz]);
      const list = TW_.mirror ? [...LAY[fi]].reverse() : LAY[fi];
      const k0 = list.reduce((s, q) => s + q.w, 0), sc = f.L / k0; // stretch the widths onto the real edge
      let s = 0;
      for (const q of list) {
        const s0 = s, s1 = s + q.w * sc; s = s1;
        if (q.k === 'bay') {
          const c = 1.0, pr = 1.0, P = (ss, o) => { const p = at(f, ss, 0, o); return [p[0], p[2]]; };
          // the wide bay of the small chamfer steps out twice: recessed shoulders, then the front on short returns
          const pts = q.step ? [P(s0, 0), P(s0 + 0.3, 0.5), P(s0 + 2.2, 0.5), P(s0 + 3.0, 1.3), P(s1 - 3.0, 1.3), P(s1 - 2.2, 0.5), P(s1 - 0.3, 0.5), P(s1, 0)]
            : [P(s0, 0), P(s0 + c, pr), P(s1 - c, pr), P(s1, 0)];
          const och = q.ochre ?? [5, 6, 7];
          for (let i = 1; i < pts.length; i++) {
            const pa = pts[i - 1], pb = pts[i], dx = pb[0] - pa[0], dz = pb[1] - pa[1], l = Math.hypot(dx, dz);
            let nx = dz / l, nz = -dx / l; if (nx * f.nx + nz * f.nz < 0) { nx = -nx; nz = -nz; }
            const g = face(pa, pb, nx, nz), n = Math.max(1, Math.round(l / 3.0)), w = l / n;
            for (let k = 0; k <= NF; k++) for (let j = 0; j < n; j++) {
              if (k === 0) tile(g, T.SHOP, j * w, (j + 1) * w, yF + 0.35, y1 - 0.25, 0.35, 0);
              else tile(g, och.includes(k) ? T.BAYO : T.BAYB, j * w, (j + 1) * w, yS(k), yS(k) + FH, 0.22, 0);
            }
            D.setColor(BROWN); rect(D, g, 0, l, yF, yF + 0.35); rect(D, g, 0, l, y1 - 0.25, y1);
          }
          polys.push(pts);
          S.prism(pts.flat(), gB, ROOF, 0, 0, 'wall');
        } else if (q.k === 'balc') {
          // white fins proud of a light recess, white balcony fronts at every storey (two ochre ones)
          const fw = 0.35, a2 = s0 + fw, b2 = s1 - fw, dp = 1.4;
          D.setColor('#bdae92'); rect(D, f, a2, b2, y1, ROOF);
          for (let k = 1; k <= NF; k++) tile(f, T.BDOOR, a2 + 0.6, b2 - 0.6, yS(k), yS(k) + FH, 0.25);
          D.setColor(WHITE); box(D, f, s0, a2, yF, TOP, 0, dp, 'flrt'); box(D, f, b2, s1, yF, TOP, 0, dp, 'flrt');
          for (let k = 1; k <= NF; k++) {
            D.setColor([7, 8].includes(k) ? OCHRE : WHITE);
            box(D, f, a2, b2, yS(k) - 0.2, yS(k) + 1.1, 0, dp, 'ftu');
          }
          // the residents' entrance under it, with a dark canopy
          D.setColor(BROWN); rect(D, f, a2, b2, yF, y1);
          tile(f, T.DOOR, a2 + 0.8, b2 - 0.8, yF, yF + 2.6, 0.9);
          solid(S, f, s0, s1, 0, dp, gB, TOP);
        } else if (q.k === 'strip') {
          D.setColor(WHITE); rect(D, f, s0, s1, yF, TOP);
        } else if (q.k === 'band') {
          D.setColor(BROWN); rect(D, f, s0, s1, yF, ROOF);
        } else { // wall / blank: the zones, then a column of windows a floor
          for (const [ka, kb, col] of ZONES) { D.setColor(col); rect(D, f, s0, s1, yS(ka), kb > NF ? ROOF : yS(kb)); }
          const n = q.k === 'wall' ? q.n : 0, w = (s1 - s0) / Math.max(1, n);
          for (let j = 0; j < n; j++) {
            const m = s0 + (j + 0.5) * w;
            for (let k = 1; k <= NF; k++) tile(f, T.WIN, m - 0.75, m + 0.75, yS(k) + 0.85, yS(k) + 2.6, 0.25);
            if (fi === 3) tile(f, T.SHOP, m - 1.4, m + 1.4, yF + 0.4, y1 - 0.3, 0.3);
          }
          if (q.door) { // the yard door with a glass canopy, a shop window either side
            const m = (s0 + s1) / 2;
            tile(f, T.DOOR, m - 0.9, m + 0.9, yF, yF + 2.5, 0.9);
            D.setColor('#2c2a28'); box(D, f, m - 1.8, m + 1.8, yF + 2.8, yF + 2.95, 0, 1.6, 'ftlru');
            solid(S, f, m - 1.8, m + 1.8, 0, 1.6, yF + 2.8, yF + 2.95, 'awning', 1);
            tile(f, T.SHOP, s0 + 0.4, m - 1.4, yF + 0.4, y1 - 0.3, 0.3); tile(f, T.SHOP, m + 1.4, s1 - 0.4, yF + 0.4, y1 - 0.3, 0.3);
          }
        }
      }
      D.setColor(PLINTH); box(D, f, -0.05, f.L + 0.05, gB, yF, 0, 0.12, 'ft');
      D.setColor(WHITE); box(D, f, 0, f.L, ROOF, TOP, -0.3, 0.05, 'fbt');
      solid(S, f, 0, f.L, -0.3, 0.05, ROOF, TOP);
      { const p = at(f, 0, 0, -0.1), q = at(f, f.L, 0, -0.1); Z.edge(p[0], p[2], q[0], q[2], TOP, f.nx, f.nz); }
    });

    // the bays' tops: the dark roof over them, the white parapet round their fronts
    for (const pts of polys) {
      R.setColor('#45403c'); R.fill(pts, [], ROOF + 0.02, true);
      for (let i = 1; i < pts.length; i++) {
        const pa = pts[i - 1], pb = pts[i], dx = pb[0] - pa[0], dz = pb[1] - pa[1], l = Math.hypot(dx, dz);
        const g = face(pa, pb, dz / l, -dx / l); // either side: the box has both faces
        D.setColor(WHITE); box(D, g, 0, l, ROOF, TOP, -0.15, 0.15, 'fbt');
      }
    }
    // roof: the deck, two white lift rooms by the big chamfer, a few vents
    R.setColor('#45403c'); R.fill(ring, [], ROOF + 0.02, true);
    const room = (u0_, v0, u1_, v1, h) => {
      const [xa, za] = toMap(TW_, [u0_, v0]), [xb, zb] = toMap(TW_, [u1_, v1]);
      const X0 = Math.min(xa, xb), X1 = Math.max(xa, xb), Z0 = Math.min(za, zb), Z1 = Math.max(za, zb);
      R.setColor(WHITE); R.box(X0, ROOF, Z0, X1, ROOF + h, Z1, 63 - 8);
      S.box(X0, ROOF, Z0, X1, ROOF + h, Z1, 'equipment');
    };
    room(12.5, 6.5, 17.5, 11.5, 3.2); room(16.5, 9.5, 20.5, 14.5, 2.6);
    for (const [u, v] of [[6, 5], [8, 12], [6, 20], [20, 22], [24, 18]]) { const [x, z] = toMap(TW_, [u, v]); R.setColor('#d9d8d2'); R.box(x - 0.3, ROOF, z - 0.3, x + 0.3, ROOF + 1.2, z + 0.3, 63 - 8); }
    S.prism(ring.flat(), gB, ROOF, 0, 0, 'wall');
    towers.push({ ring, top: ROOF });
    footprints.push({ poly: ring.map((p) => [p[0], p[1]]), h: TOP - gLo, kind: 'apt', name: TW_.name });
  }

  // ---- the yard between the towers: a lawn, the playground on red rubber, a play tower, swings, benches, thujas
  const LIFT = 0.26, gy = (x, z) => heightAt(x, z) + LIFT;
  const drape = (M, x0, x1, z0, z1, lift, col, cell = 3) => {
    M.setColor(col);
    for (let x = x0; x < x1 - 1e-3; x += cell) for (let z = z0; z < z1 - 1e-3; z += cell) {
      const xa = x, xb = Math.min(x1, x + cell), za = z, zb = Math.min(z1, z + cell);
      const v = [[xa, za], [xb, za], [xb, zb], [xa, zb]].map(([px, pz]) => M.vert(px, heightAt(px, pz) + lift, pz, 0, 1, 0, px / 4, pz / 4));
      M.quad(v[0], v[3], v[2], v[1]);
    }
  };
  const YARD = [-385.5, -360.5, 302.5, 325.5], PAD = [-381, -367, 309, 321];
  drape(B.soft, YARD[0], YARD[1], YARD[2], YARD[3], LIFT, [0.12, 0.23, 0.06]);
  drape(B.pave, PAD[0] - 1.2, PAD[1] + 1.2, PAD[2] - 1.2, PAD[3] + 1.2, LIFT + 0.03, '#b8b4ac');
  drape(B.soft, PAD[0], PAD[1], PAD[2], PAD[3], LIFT + 0.06, [0.30, 0.10, 0.07]);
  const yP = Math.max(...[[PAD[0], PAD[2]], [PAD[1], PAD[2]], [PAD[0], PAD[3]], [PAD[1], PAD[3]]].map(([x, z]) => gy(x, z))) + 0.06;
  const bx = (x, z, hx, hz, y0, y1_, col) => { D.setColor(col); D.box(x - hx, y0, z - hz, x + hx, y1_, z + hz, 63); };
  { // the play tower: two decks on posts under red pyramid roofs, a bridge between, a steel slide
    const WOODC = '#b07a45', RED = '#9c2b22';
    for (const [x, z] of [[-376.5, 313.5], [-371.5, 313.5]]) {
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bx(x + a * 0.9, z + b * 0.9, 0.07, 0.07, yP, yP + 3.2, WOODC);
      bx(x, z, 1.0, 1.0, yP + 1.3, yP + 1.42, WOODC); bx(x, z, 1.0, 1.0, yP + 1.42, yP + 2.1, '#c9955c');
      D.setColor(RED); D.cyl(x, yP + 3.2, z, 1.45, 0.02, 1.2, 4, true);
      S.box(x - 1, yP, z - 1, x + 1, yP + 3.2, z + 1, 'wall');
    }
    bx(-374, 313.5, 1.5, 0.5, yP + 1.3, yP + 1.4, WOODC);
    D.setColor('#cfd2d6');
    D.face([[-371.9, yP + 1.4, 314.5], [-371.1, yP + 1.4, 314.5], [-371.1, yP + 0.2, 318.4], [-371.9, yP + 0.2, 318.4]]);
    // swings: an A-frame bar with two seats
    for (const x of [-379.6, -376.4]) { D.setColor('#8a3a2a'); D.tube([x, yP, 317.2], [x, yP + 2.4, 318.2], 0.05); D.tube([x, yP, 319.2], [x, yP + 2.4, 318.2], 0.05); }
    D.tube([-379.6, yP + 2.4, 318.2], [-376.4, yP + 2.4, 318.2], 0.05);
    for (const x of [-378.6, -377.4]) bx(x, 318.2, 0.25, 0.12, yP + 0.45, yP + 0.5, '#333');
    bx(-368.8, 319, 1.1, 1.1, yP - 0.05, yP + 0.25, '#d9c79a'); // the sandbox
  }
  const thuja = (x, z, h) => { B.leaf.setColor([0.09 + r() * 0.03, 0.23 + r() * 0.05, 0.11]); B.leaf.cyl(x, gy(x, z), z, 0.45, 0.04, h, 7, true); };
  for (let x = PAD[0] + 0.8; x <= PAD[1] - 0.6; x += 2.2) { thuja(x, PAD[2] - 2.0, 2.2 + r() * 0.5); thuja(x, PAD[3] + 2.0, 2.2 + r() * 0.5); }
  const bench = (x, z, alongX) => { const [hx, hz] = alongX ? [0.9, 0.25] : [0.25, 0.9], y = gy(x, z); bx(x, z, hx, hz, y + 0.4, y + 0.48, '#6b4a33'); bx(x, z, hx * 0.9, hz * 0.9, y, y + 0.4, '#3a3a3a'); };
  for (const [x, z, a] of [[-383.2, 312, false], [-383.2, 318, false], [-364.8, 312, false], [-364.8, 318, false]]) bench(x, z, a);
  for (const [x, z] of [[-384, 305], [-362, 305], [-384, 324], [-362, 324]]) {
    const y = gy(x, z); D.setColor('#5b4636'); D.cyl(x, y, z, 0.12, 0.08, 2.4, 5, false);
    B.leaf.setColor([0.2 + r() * 0.08, 0.36 + r() * 0.08, 0.12]); B.leaf.ellipsoid([x, y + 3.4, z], [1.7, 1.9, 1.7], 7, 5);
    S.cyl(x, z, y, y + 2.4, 0.2, 0.2, 'pole');
  }

  const tex = atlas(false), mask = atlas(true);
  const M = {
    tile: new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.55, metalness: 0.1 }),
    lit: new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.5, metalness: 0.1, emissive: 0xffc890, emissiveMap: mask, emissiveIntensity: 0 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02 }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    pave: decal(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), 1),
    soft: decal(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 2),
    leaf: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
  };
  const out = finish(root, 'smilianska', B, M, { shade: ['tile', 'lit', 'det', 'roof', 'leaf'] });
  console.log(`[cherkasy] Smilianska 48–54 / 52: 2 towers, ${nTiles} tiles (${nLit} lit), roofs ${towers.map((t) => t.top.toFixed(1)).join(' / ')}, ${(out.verts / 1000).toFixed(1)}k verts, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    towers,
    footprints,
    clear: (x, z) => x > -390 && x < -358 && z > 262 && z < 362,
    update() { M.lit.emissiveIntensity = 0.45 * nightK.value; },
  };
}
