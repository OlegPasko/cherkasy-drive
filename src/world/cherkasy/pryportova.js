// OWNER: cherkasy. The new residential block at вулиця Припортова, 22/1 (Митниця), under construction (due late 2026),
// built as the lun.ua catalogue (lun.ua/new/cherkasy/pryportova-st-22-1) and the developer's renders show it: one
// building of three seventeen-storey sections (OSM ways 874640721, 997356687, 997356688, ~23 x 27 m each) set corner to
// corner in a diagonal step from north-west to south-east, with the one-storey shop podium (OSM 1303296241) in the steps
// on the east. Every section is white render below and a dark band over the top seven storeys – chocolate brown on the
// yard sides (south, west), a warm taupe on the street sides (north, east) –, white parapets and full-height white fins;
// stacks of glazed loggias with wood-grain spandrel bands and rounded corners, stacks of round wood-clad balconies, a
// glass column at the junction of two sections where the entrance is, and on the north face a curved glass bay. The
// podium is dark glass under a graphite fascia. The yard on the south-west: paving over the lot, lawns, a playground with
// a wooden castle (onion domes, a bridge, two slides) ringed by thujas, benches and lamps. No names, no developer signs.
//   PRYPORTOVA_SKIP: the OSM ids replaced here (buildings.js skips them)
//   buildPryportova({ root, map, solids, zips, heightAt, facadeMat }) -> { update(dt), clear(x, z), footprints } | null
// The walls are facade-shader quads (world/facade.js: windows, rooms and lit windows at night come from the shader);
// fins, loggias, balconies, the podium fascia and the yard are merged meshes. The yard is laid in the complex's frame:
// e east and n north along the sections' walls, the origin at the middle section's south-west corner.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { FacadeBuilder, STYLE, LAYER } from '../facade.js';
import { ringPts, rng, inPoly } from './geo.js';
import { paveTex } from './civic.js';
import { canvasTex, decal } from './sculpt.js';
import { ringFaces, at, rect, box, solid } from './slabkit.js';

const TOWERS = [874640721, 997356687, 997356688], PODIUM = 1303296241;
export const PRYPORTOVA_SKIP = new Set([...TOWERS, PODIUM]);

const G = 3.3, FH = 3.0, NF = 17, PARA = 1.1, DK = 11;  // ground storey, storey, storeys, parapet, first dark storey (index)
const LD = 1.05, BD = 1.0, FIN = 0.32;                  // loggia reach, balcony reach, fin reach
// face layouts from the outside, left to right: [type, width (scaled to the face), windows | dark-from storey]
//   F white fin, W wall with n windows, B round wood balcony stack, L glazed loggia stack with wood bands,
//   R the same with a rounded glass bay (thin bands), C the glass column at the junction (entrance under it on the south)
const LAY = {
  S: [['F', 0.6], ['B', 2.6], ['W', 4.4, 2], ['L', 4.6], ['W', 2.2, 1], ['L', 3.6], ['F', 0.6], ['C', 3.8]],
  W: [['C', 3.2], ['W', 4.6, 2], ['B', 2.6], ['W', 4.4, 2, 10], ['L', 4.4], ['W', 4.4, 2, 10], ['B', 2.6], ['F', 0.6]],
  E: [['F', 0.6], ['L', 4.2], ['W', 5.2, 2, 10], ['W', 2.6, 1, 10], ['L', 4.6], ['L', 4.6], ['W', 2.6, 1], ['B', 2.6], ['F', 0.6]],
  N: [['F', 0.6], ['W', 2.4, 1], ['R', 4.0], ['F', 0.6], ['W', 4.6, 2], ['L', 4.4], ['W', 2.4, 1], ['F', 0.6]],
};
const NORTH = [0.759, -0.651], EAST = [0.651, 0.759];    // map directions of true north / east (frame rot 49.4°)
// tints of the facade's stucco layer: white render, the yard sides' chocolate, the street sides' taupe
const WHITE = [1.42, 1.41, 1.38], CHOC = [0.2, 0.14, 0.13], TAUPE = [0.8, 0.7, 0.69];
const GLASS = ['#3d4449', '#363d42', '#454c51', '#33393e'];
const WOOD = '#9a7461', DARKBAND = '#4a3a36', FASCIA = '#3a3b3e';
// the lot in (e, n): the paved yard south and west of the sections and the strip by the podium (lun.ua general plan)
const LOT = [[-25, -47], [48, -39], [48, 54], [3, 55], [-25, 33]];
const PAD = [-19, -3, -32, -15];                          // the playground, [e0, e1, n0, n1]
const LIFT = 0.26;                                        // the paving over the ground's own draped layers (~0.17 up)

export function buildPryportova({ root, map, solids: S, zips: Z, heightAt, facadeMat }) {
  const byId = (id) => map.buildings.find((b) => b.id === id);
  const rings = TOWERS.map((id) => byId(id)).filter(Boolean).map((b) => ringPts(b.p));
  if (rings.length !== 3 || !facadeMat) return null;
  const t0 = performance.now(), n0 = S.count, r = rng(997356687 % 65521);
  const podB = byId(PODIUM), pod = podB ? ringPts(podB.p) : null;

  // ---- the frame: the middle section's walls, east and north
  let ax = 0, az = 0;
  rings[1].forEach(([x, z], i) => { const [x2, z2] = rings[1][(i + 1) % rings[1].length], a = 4 * Math.atan2(z2 - z, x2 - x); ax += Math.cos(a); az += Math.sin(a); });
  const th = Math.atan2(az, ax) / 4;
  let E = [Math.cos(th), Math.sin(th)];
  for (let k = 0; k < 4 && E[0] * EAST[0] + E[1] * EAST[1] < 0.7; k++) E = [-E[1], E[0]];
  const N = [E[1], -E[0]].map((v) => v * Math.sign(E[1] * NORTH[0] - E[0] * NORTH[1]));
  const O = rings[1].reduce((b, p) => (p[0] * (E[0] + N[0]) + p[1] * (E[1] + N[1]) < b[0] * (E[0] + N[0]) + b[1] * (E[1] + N[1]) ? p : b));
  const P = (e, n) => [O[0] + E[0] * e + N[0] * n, O[1] + E[1] * e + N[1] * n];
  const eOf = (x, z) => (x - O[0]) * E[0] + (z - O[1]) * E[1], nOf = (x, z) => (x - O[0]) * N[0] + (z - O[1]) * N[1];
  const lot = LOT.map(([e, n]) => P(e, n));

  const FB = new FacadeBuilder();
  const B = { det: new MB(), wood: new MB(), glass: new MB(), lit: new MB(), pave: new MB(), soft: new MB(), leaf: new MB() };
  const D = B.det;
  B.wood.setColor(WOOD);
  let nLog = 0, nBal = 0, nWin = 0;
  const foot = [], gAll = [];

  // a smooth ribbon along an outline in a face's (s, o) plane: [s, o, ns, no] points (normal in the face frame), y0..y1;
  // u runs along the outline in metres, v up, so the wood grain and the glass frames tile continuously round the bends
  const ribbon = (M, f, pts, y0, y1) => {
    let u = 0;
    const ids = pts.map(([s, o, ns, no], i) => {
      if (i) u += Math.hypot(s - pts[i - 1][0], o - pts[i - 1][1]);
      const p = at(f, s, 0, o), nx = f.ux * ns + f.nx * no, nz = f.uz * ns + f.nz * no;
      return [M.vert(p[0], y0, p[2], nx, 0, nz, u, 0), M.vert(p[0], y1, p[2], nx, 0, nz, u, y1 - y0)];
    });
    const cw = f.ux * f.nz - f.uz * f.nx > 0; // s to the viewer's right: (s, y) counter-clockwise faces out; keep the quads facing out whichever way s runs
    for (let i = 1; i < ids.length; i++) { const [a, b] = ids[i - 1], [c, d] = ids[i]; cw ? M.quad(a, c, d, b) : M.quad(a, b, d, c); }
  };
  const cap = (M, f, pts, y, up) => { const ring = pts.map(([s, o]) => { const p = at(f, s, 0, o); return [p[0], p[2]]; }); M.fill(ring, [], y, up); };
  // the outline of a stack standing out of the wall from s0 to s1 by dep, its outer corners rounded by rad
  const outline = (s0, s1, dep, rad, inset = 0, seg = 3) => {
    const a = s0 + inset, b = s1 - inset, d = dep - inset, q = Math.min(rad, (b - a) / 2 - 0.01, d - 0.01), pts = [[a, 0, -1, 0]];
    for (let i = 0; i <= seg; i++) { const t = Math.PI - (i / seg) * Math.PI / 2; pts.push([a + q + Math.cos(t) * q, d - q + Math.sin(t) * q, Math.cos(t), Math.sin(t)]); }
    for (let i = 0; i <= seg; i++) { const t = Math.PI / 2 - (i / seg) * Math.PI / 2; pts.push([b - q + Math.cos(t) * q, d - q + Math.sin(t) * q, Math.cos(t), Math.sin(t)]); }
    pts.push([b, 0, 1, 0]);
    return pts;
  };

  // ---- the three sections
  TOWERS.forEach((id, ti) => {
    const ring = rings[ti], hs = ring.map((p) => heightAt(p[0], p[1])), gLo = Math.min(...hs), gHi = Math.max(...hs);
    gAll.push(...hs);
    const yF = gHi + 0.35, yLo = gLo - 0.8, fy = (k) => (k ? yF + G + (k - 1) * FH : yF), roof = fy(NF), top = roof + PARA;
    const prm = (tint, extra) => ({ floorH: FH, bayW: 2.6, winW: 0.5, winH: 0.52, layer: LAYER.STUCCO, tint, base: LAYER.CONCRETE, seed: 41 + ti * 17,
      resid: 1, depth: 0.18, lintel: 0, baseY: yF, topY: top, plinth: 0.45, ...extra });
    // a wall strip s0..s1 at reach o, white up to storey dk, dark (the side's colour) to the roof, white parapet
    const wall = (f, s0, s1, o, dark, dk, style, extra = {}, gH = -G) => {
      const p0 = at(f, s0, 0, o), len = s1 - s0, yd = fy(dk);
      for (const [ya, yb, tint] of [[yLo, yd, WHITE], [yd, roof, dark], [roof, top, WHITE]]) {
        if (yb - ya > 0.01) FB.quad(p0, f.U, len, ya, yb, f.N, prm(tint, extra), ya >= roof ? STYLE.BLANK : style, gH);
      }
    };
    for (const f of ringFaces(ring)) {
      const dn = f.nx * NORTH[0] + f.nz * NORTH[1], de = f.nx * EAST[0] + f.nz * EAST[1];
      const side = Math.abs(dn) > Math.abs(de) ? (dn > 0 ? 'N' : 'S') : (de > 0 ? 'E' : 'W');
      const dark = side === 'S' || side === 'W' ? CHOC : TAUPE, lay = LAY[side];
      const flip = f.ux * f.nz - f.uz * f.nx < 0, k0 = f.L / lay.reduce((s, q) => s + q[1], 0);
      let s = 0;
      const segs = (flip ? [...lay].reverse() : lay).map(([t, w, x, dk]) => { const g = { t, s0: s, s1: s + w * k0, x, dk: t === 'W' ? dk ?? DK : DK }; s = g.s1; return g; });
      for (const g of segs) {
        const { s0, s1 } = g, w = s1 - s0;
        if (g.t === 'F') {
          wall(f, s0, s1, 0, WHITE, NF, STYLE.BLANK);
          D.setColor('#f1f1ee'); box(D, f, s0 + 0.04, s1 - 0.04, yLo, top + 1.3, 0, FIN, 'flrt');
          continue;
        }
        if (g.t === 'W') { wall(f, s0, s1, 0, dark, g.dk, STYLE.PUNCHED, { bayW: w / g.x, winW: Math.min(0.62, 1.45 / (w / g.x)), winH: 0.52 }, -G); nWin += g.x * NF; continue; }
        if (g.t === 'C') {
          // the glass column: glazing floor to roof in dark frames over a white ground storey
          wall(f, s0, s1, 0, dark, NF, STYLE.PUNCHED, { bayW: w, winW: 0.5, winH: 0.5 });
          for (let k = 1; k < NF; k++) {
            const Gm = r() < 0.25 ? B.lit : B.glass, y = fy(k);
            Gm.setColor(Gm === B.lit ? '#7a7268' : GLASS[(r() * GLASS.length) | 0]);
            rect(Gm, f, s0 + 0.1, s1 - 0.1, y, k === NF - 1 ? roof : fy(k + 1), 0.04, [1, 1]);
            D.setColor(DARKBAND); box(D, f, s0, s1, y - 0.12, y + 0.12, 0, 0.1, 'ft');
          }
          D.setColor(DARKBAND); for (const e of [s0, s1 - 0.12]) box(D, f, e, e + 0.12, fy(1), roof, 0, 0.12, 'flr');
          if (side === 'S') {      // the section's entrance: a lit door, a canopy, a landing with steps
            const m = (s0 + s1) / 2;
            B.lit.setColor('#5e554b'); rect(B.lit, f, m - 1.0, m + 1.0, yF, yF + 2.5, 0.05);
            D.setColor(FASCIA); box(D, f, m - 1.9, m + 1.9, yF + 2.9, yF + 3.15, 0, 1.6, 'ftlru');
            D.setColor('#b9b5ad'); box(D, f, m - 1.9, m + 1.9, yLo, yF, 0, 1.9, 'ftlr');
            solid(S, f, m - 1.9, m + 1.9, 0, 1.6, yF + 2.9, yF + 3.15, 'awning', 1);
            solid(S, f, m - 1.9, m + 1.9, 0, 1.9, yLo, yF, 'step');
          }
          continue;
        }
        if (g.t === 'B') {
          // a stack of round balconies: wood-clad parapets on thin slabs, a door and a window behind each
          wall(f, s0, s1, 0, dark, DK, STYLE.PUNCHED, { bayW: w / 2, winW: 0.62, winH: 0.72 });
          const ol = outline(s0 + 0.25, s1 - 0.25, BD, BD * 0.95, 0, 4);
          for (let k = 1; k < NF; k++) {
            const y = fy(k);
            ribbon(B.wood, f, ol, y - 0.18, y + 0.95);
            cap(B.wood, f, ol, y - 0.18, false); D.setColor('#4a4643'); cap(D, f, ol, y + 0.95, true);
            nBal++;
          }
          solid(S, f, s0 + 0.25, s1 - 0.25, 0, BD, fy(1) - 0.2, fy(NF - 1) + 1.05);
          continue;
        }
        // L / R: a stack of glazed loggias standing out of the wall, the ground storey plain wall under it
        const thin = g.t === 'R', bh = thin ? 0.24 : 0.95, rad = thin ? LD * 0.95 : 0.55, dep = thin ? LD + 0.15 : LD;
        wall(f, s0, s1, 0, dark, DK, STYLE.PUNCHED, { bayW: w / 2, winW: 0.7, winH: 0.78 });
        const ol = outline(s0, s1, dep, rad), og = outline(s0, s1, dep, rad, 0.06);
        for (let k = 1; k < NF; k++) {
          const y = fy(k), yt = k === NF - 1 ? roof : fy(k + 1);
          if (thin) D.setColor(DARKBAND);
          ribbon(thin ? D : B.wood, f, ol, y - 0.05, y + bh);
          const Gm = r() < 0.3 ? B.lit : B.glass;
          Gm.setColor(Gm === B.lit ? '#7a7268' : GLASS[(r() * GLASS.length) | 0]); ribbon(Gm, f, og, y + bh, yt);
          if (k === 1) cap(thin ? D : B.wood, f, ol, y - 0.05, false);
          nLog++;
        }
        // the stack's head up to the parapet, white like the parapet
        D.setColor('#f1f1ee'); ribbon(D, f, ol, roof, top); cap(D, f, ol, top, true);
        solid(S, f, s0, s1, 0, dep, fy(1) - 0.05, top);
      }
      // the parapet's inner face and coping, the roof edge
      FB.quad(at(f, f.L, 0, -0.3), [-f.ux, 0, -f.uz], f.L, roof, top, [-f.nx, 0, -f.nz], prm(WHITE), STYLE.BLANK);
      D.setColor('#e4e3df'); box(D, f, -0.02, f.L + 0.02, top, top + 0.08, -0.32, 0.06, 'ft');
      const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], top, f.nx, f.nz);
    }
    FB.fill(ring, [], roof + 0.02, { layer: LAYER.ROOF_MEMBRANE, tint: [0.55, 0.55, 0.56] });
    S.prism(ring.flat(), yLo, roof + 0.02, 0, 0, 'wall');
    for (const f of ringFaces(ring)) solid(S, f, -0.02, f.L + 0.02, -0.32, 0.06, roof, top + 0.08);
    // the lift and stair head on the roof, a little off the middle toward the yard
    const cx = ring.reduce((q, p) => q + p[0], 0) / 4, cz = ring.reduce((q, p) => q + p[1], 0) / 4, ce = eOf(cx, cz) - 2, cn = nOf(cx, cz) - 2;
    const hd = [[-3, -2.4], [3, -2.4], [3, 2.4], [-3, 2.4]].map(([a, b]) => P(ce + a, cn + b));
    D.setColor('#e9e8e4'); D.extrude(hd, [], roof, roof + 3.3, { top: true });
    S.prism(hd.flat(), roof, roof + 3.3, 0, 0, 'equipment');
    foot.push({ poly: ring, h: top - gLo, kind: 'apt', name: 'Новобудова · вул. Припортова, 22/1' });
  });

  // ---- the podium: shop fronts of dark glass under a graphite fascia, a flat roof
  if (pod) {
    const hs = pod.map((p) => heightAt(p[0], p[1])), yP = Math.max(...hs) + 0.15, yPl = Math.min(...hs) - 0.6, yS = yP + 3.4, yT = yP + 4.2;
    for (const f of ringFaces(pod)) {
      if (f.L < 0.5) continue;
      FB.quad(at(f, 0, 0, 0), f.U, f.L, yPl, yS, f.N, { floorH: 3.4, bayW: 3.2, winW: 0.9, winH: 0.86, layer: LAYER.METAL, tint: [0.3, 0.3, 0.31], glass: 1,
        base: LAYER.CONCRETE, seed: 77, depth: 0.12, baseY: yP, topY: yS, plinth: 0.3 }, STYLE.CURTAIN, -3.4);
      D.setColor(FASCIA); box(D, f, -0.25, f.L + 0.25, yS, yT, 0, 0.25, 'ftu');
      FB.quad(at(f, f.L, 0, -0.2), [-f.ux, 0, -f.uz], f.L, yS, yT, [-f.nx, 0, -f.nz], { layer: LAYER.CONCRETE, tint: [0.5, 0.5, 0.5] }, STYLE.BLANK);
    }
    FB.fill(pod, [], yT - 0.5, { layer: LAYER.ROOF_GRAVEL, tint: [0.6, 0.6, 0.6] });
    S.prism(pod.flat(), yPl, yT - 0.5, 0, 0, 'wall');
    for (const f of ringFaces(pod)) solid(S, f, -0.25, f.L + 0.25, -0.2, 0.25, yT - 0.5, yT);
    foot.push({ poly: pod, h: yT - Math.min(...hs), kind: 'shop', name: 'Новобудова · вул. Припортова, 22/1' });
  }

  // ---- the yard: paving draped on the ground over the lot, lawns, the playground with its castle, thujas, lamps
  const gy = (e, n) => { const p = P(e, n); return heightAt(p[0], p[1]) + LIFT; };
  const towersIn = (e, n) => { const p = P(e, n); return rings.some((q) => inPoly(q, p[0], p[1])) || (pod && inPoly(pod, p[0], p[1])); };
  // clip a polygon in (e, n) to a square cell (Sutherland–Hodgman on the convex cell)
  const clipCell = (poly, e0, e1, n0, n1) => {
    let out = poly;
    for (const [ax, sg, c] of [[0, 1, e0], [0, -1, e1], [1, 1, n0], [1, -1, n1]]) {
      const inp = out; out = [];
      inp.forEach((a, i) => {
        const b = inp[(i + 1) % inp.length], da = sg * (a[ax] - c), db = sg * (b[ax] - c);
        if (da >= 0) out.push(a);
        if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      });
      if (!out.length) break;
    }
    return out;
  };
  // drape a polygon (e, n) on the ground in cells, lifted by `lift`; skips cells hidden under the buildings
  const drape = (M, poly, lift, cell = 6, col = null) => {
    const es = poly.map((p) => p[0]), ns = poly.map((p) => p[1]);
    for (let e0 = Math.min(...es); e0 < Math.max(...es); e0 += cell) for (let n0 = Math.min(...ns); n0 < Math.max(...ns); n0 += cell) {
      const c = clipCell(poly, e0, e0 + cell, n0, n0 + cell);
      if (c.length < 3) continue;
      if ([[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]].every(([i, j]) => towersIn(e0 + i * cell, n0 + j * cell))) continue;
      if (col) M.setColor(col());
      const first = M.v; M.fill(c.map(([e, n]) => P(e, n)), [], 0, true);
      for (let v = first; v < M.v; v++) { const o = v * 11, a = M.buf.a; a[o + 1] = heightAt(a[o], a[o + 2]) + lift; a[o + 6] = a[o] / 4.8; a[o + 7] = a[o + 2] / 4.8; }
    }
  };
  B.pave.setColor('#b4b9be'); drape(B.pave, LOT, LIFT, 4);
  // a granite kerb round the lot, the paving's raised edge
  D.setColor('#9d9a94');
  for (const f of ringFaces(lot)) {
    const n = Math.max(1, Math.ceil(f.L / 4)), ids = [];
    for (let i = 0; i <= n; i++) { const p = at(f, f.L * i / n, 0), h = heightAt(p[0], p[2]); ids.push([D.vert(p[0], h - 0.15, p[2], f.nx, 0, f.nz), D.vert(p[0], h + LIFT + 0.04, p[2], f.nx, 0, f.nz)]); }
    const cw = f.ux * f.nz - f.uz * f.nx > 0;
    for (let i = 1; i <= n; i++) { const [a, b] = ids[i - 1], [c, d] = ids[i]; cw ? D.quad(a, c, d, b) : D.quad(a, b, d, c); }
  }
  const lawnCol = () => { const k = 0.96 + r() * 0.08; return [0.11 * k, 0.22 * k, 0.05 * k]; };
  const LAWNS = [[[-23, -45], [-4, -43], [-4, -36], [-23, -36]], [[2, -42], [22, -40], [22, -33], [2, -33]], [[-23, -12], [-8, -12], [-8, 28], [-23, 28]], [[26, -38], [46, -36], [46, -30], [26, -30]]];
  for (const l of LAWNS) drape(B.soft, l, LIFT + 0.04, 4, lawnCol);
  drape(B.soft, [[PAD[0], PAD[2]], [PAD[1], PAD[2]], [PAD[1], PAD[3]], [PAD[0], PAD[3]]], LIFT + 0.05, 4, () => [0.36, 0.17, 0.12]);
  const bx = (M, e, n, hw, hd, h0, h1, col, y = gy(e, n)) => { const pts = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([a, b]) => P(e + a, n + b)); M.setColor(col); M.extrude(pts, [], y + h0, y + h1, { top: true }); };
  // the castle: three towers on posts with platforms, grey parapets and onion domes, a bridge between, two slides
  {
    const yC = Math.max(...[[PAD[0], PAD[2]], [PAD[1], PAD[2]], [PAD[0], PAD[3]], [PAD[1], PAD[3]]].map(([e, n]) => gy(e, n))) + 0.05;
    const T = [[-15.5, -26, 1.1], [-11, -22.5, 1.3], [-6.5, -26, 1.1]], POST = '#d7c3a0', GREY = '#9a9da1';
    for (const [e, n, h] of T) {
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bx(D, e + a * h, n + b * h, 0.09, 0.09, 0, 4.4, POST, yC);
      bx(D, e, n, h, h, 1.5, 1.62, POST, yC); bx(D, e, n, h, h, 1.62, 2.5, GREY, yC);
      bx(D, e, n, h + 0.1, h + 0.1, 4.4, 4.6, '#55585c', yC);
      const p = P(e, n), dome = [[0.01, 0], [0.55, 0.15], [0.8, 0.5], [0.7, 0.9], [0.35, 1.3], [0.04, 1.75]];
      D.setColor('#efece6'); D.lathe(dome.map(([q, y]) => [q * h, yC + 4.6 + y * h]), 8, p[0], p[1]);
      S.prism([P(e - h, n - h), P(e + h, n - h), P(e + h, n + h), P(e - h, n + h)].flat(), yC, yC + 4.6, 0, 0, 'wall');
    }
    bx(D, -13.25, -24.25, 1.4, 0.6, 1.5, 2.4, GREY, yC); bx(D, -8.75, -24.25, 1.4, 0.6, 1.5, 2.4, GREY, yC);
    D.setColor('#c9ccd0');
    for (const [e, n, de] of [[-15.5, -27.2, -1], [-6.5, -27.2, 1]]) {
      const q = (a, b, y) => { const p = P(a, b); return [p[0], yC + y, p[1]]; };
      D.face([q(e - 0.45, n, 1.5), q(e + 0.45, n, 1.5), q(e + 0.45 + de * 0.5, n - 3.8, 0.25), q(e - 0.45 + de * 0.5, n - 3.8, 0.25)]);
    }
  }
  const thuja = (e, n, h = 2.6) => { const p = P(e, n); B.leaf.setColor([0.09 + r() * 0.03, 0.23 + r() * 0.05, 0.11]); B.leaf.cyl(p[0], gy(e, n), p[1], 0.5, 0.04, h, 7, true); };
  for (let e = PAD[0] + 0.5; e <= PAD[1] - 0.5; e += 2.3) { thuja(e, PAD[2] - 1.2, 2.4 + r() * 0.6); thuja(e, PAD[3] + 1.2, 2.4 + r() * 0.6); }
  for (let n = PAD[2] + 1.6; n <= PAD[3] - 1.4; n += 2.6) thuja(PAD[1] + 1.2, n, 2.6);
  const tree = (e, n, sc = 1) => {
    const p = P(e, n), y = gy(e, n);
    D.setColor('#5b4636'); D.cyl(p[0], y, p[1], 0.1 * sc, 0.07 * sc, 2.4 * sc, 5, false);
    B.leaf.setColor([0.2 + r() * 0.1, 0.36 + r() * 0.1, 0.12]); B.leaf.ellipsoid([p[0], y + 3.3 * sc, p[1]], [1.5 * sc, 1.8 * sc, 1.5 * sc], 7, 5);
    S.cyl(p[0], p[1], y, y + 2.4, 0.2, 0.2, 'pole');
  };
  for (const [e, n] of [[-20, -40], [-9, -41], [6, -37], [17, -36], [31, -34], [42, -33], [-16, -4], [-16, 10], [-16, 22]]) tree(e, n, 0.9 + r() * 0.3);
  const bench = (e, n, alongE) => { const [hw, hd] = alongE ? [0.9, 0.25] : [0.25, 0.9]; bx(D, e, n, hw, hd, 0.4, 0.48, '#6b4a33'); bx(D, e, n, hw * 0.92, hd * 0.92, 0, 0.4, '#e2e2df'); };
  for (const [e, n, a] of [[-11, -12.5, true], [-6, -12.5, true], [0.5, -26, false], [0.5, -20, false], [-21, 0, false], [-21, 14, false]]) bench(e, n, a);
  const lamps = [[-21, -32], [-2, -33.5], [0.5, -14], [12, -30], [24, -28], [-21, -14], [-21, 6], [-21, 24], [36, -32]];
  for (const [e, n] of lamps) {
    const p = P(e, n), y = gy(e, n);
    D.setColor('#d9dadb'); D.cyl(p[0], y, p[1], 0.06, 0.05, 4.2, 5, false);
    bx(D, e + 0.2, n + 0.2, 0.32, 0.32, 4.05, 4.2, '#d9dadb');
    B.lit.setColor('#fff3da'); B.lit.fill([P(e - 0.08, n - 0.08), P(e + 0.48, n - 0.08), P(e + 0.48, n + 0.48), P(e - 0.08, n + 0.48)], [], y + 4.04, false);
    S.cyl(p[0], p[1], y, y + 4.2, 0.1, 0.1, 'pole');
  }

  // ---- meshes
  const group = Object.assign(new THREE.Group(), { name: 'pryportova' });
  root.add(group);
  const wood = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#c9a58c'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 1) { const k = 0.82 + 0.18 * Math.sin(y * 0.9 + Math.sin(y * 0.13) * 3) + (r() - 0.5) * 0.08; g.fillStyle = `rgba(${90 * k | 0},${55 * k | 0},${38 * k | 0},${0.35 + 0.25 * r()})`; g.fillRect(0, y, w, 1); }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(40,22,14,0.5)'; g.fillRect(0, (i / 6) * h, w, 2); } // the board joints
  });
  wood.repeat.set(1 / 3, 1 / 1.2);
  // glazing frames: a mullion every ~1.4 m, a transom at 2 m, dark frames
  const frames = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f2f31'; g.fillRect(0, 0, 5, h); g.fillRect(w / 2, 0, 3, h); g.fillRect(0, h * 0.32, w, 4);
  });
  frames.repeat.set(1 / 1.4, 1 / FH);
  const pave = paveTex(r, [212, 208, 200], [176, 172, 166], { n: 12, mix: 0.25 });
  const M = {
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    wood: new THREE.MeshStandardMaterial({ map: wood, vertexColors: true, roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ map: frames, vertexColors: true, roughness: 0.12, metalness: 0.4 }),
    lit: new THREE.MeshStandardMaterial({ map: frames, vertexColors: true, roughness: 0.3, emissive: 0xffd6a0, emissiveMap: frames, emissiveIntensity: 0 }),
    pave: decal(new THREE.MeshStandardMaterial({ map: pave, vertexColors: true, roughness: 0.95 }), 1),
    soft: decal(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 2),
    leaf: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
  };
  let verts = 0, meshes = 0;
  const walls = FB.build();
  if (walls) { group.add(Object.assign(new THREE.Mesh(walls, facadeMat), { name: 'pryportova-walls', castShadow: true, receiveShadow: true })); verts += FB.v; meshes++; }
  for (const [k, Mb] of Object.entries(B)) {
    if (!Mb.v) continue;
    group.add(Object.assign(new THREE.Mesh(Mb.build(), M[k]), { name: `pryportova-${k}`, castShadow: ['det', 'wood', 'leaf'].includes(k), receiveShadow: true }));
    verts += Mb.v; meshes++;
  }
  console.log(`[cherkasy] Pryportova 22/1: 3 sections, ${nLog} loggias, ${nBal} balconies, ~${nWin} windows, ground ${Math.min(...gAll).toFixed(1)}–${Math.max(...gAll).toFixed(1)} m, ${(verts / 1000).toFixed(1)}k verts, ${meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  const lim = LOT.reduce((b, [e, n]) => [Math.min(b[0], e), Math.max(b[1], e), Math.min(b[2], n), Math.max(b[3], n)], [Infinity, -Infinity, Infinity, -Infinity]);
  return {
    footprints: foot,
    clear: (x, z) => { const e = eOf(x, z), n = nOf(x, z); return e > lim[0] - 1 && e < lim[1] + 1 && n > lim[2] - 1 && n < lim[3] + 1 && (inPoly(lot, x, z) || towersIn(e, n)); },
    update() { M.lit.emissiveIntensity = 1.2 * nightK.value; },
  };
}
