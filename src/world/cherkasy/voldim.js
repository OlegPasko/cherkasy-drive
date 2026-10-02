// OWNER: cherkasy. ЖК VOLDIM, вулиця Володимира Великого, 41/3 (Митниця; OSM way 1198239247), a sixteen-storey point
// tower by Добро-Буд, under construction (due late 2027), so it is built as the developer's renders show it (lun.ua,
// lun.ua/new/cherkasy/voldim): a 23 m square tower in mustard-yellow render, the top five storeys teal green, white
// strips with one window column between, orange pinstripes and an orange parapet cap on the coloured piers; a stack of
// dark-grey glazed loggias, floor-to-ceiling glass, stands proud on every face, two on the entrance face with a recess
// of open white balconies between them over the glazed entrance; a white ground storey on a grey plinth; a light-grey
// lift head on the roof. The tower stands on the OSM lot (the roof of the underground car park): a paved terrace with a
// low black picket fence, lawn beds with flowering shrubs, steps up through a gap in the fence before the entrance. No names, no
// developer branding. Windows light up at night.
//   VOLDIM_SKIP: the OSM ids replaced here (buildings.js skips them)
//   buildVoldim({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per face in a face frame (slabkit.js): s along the face, y up, o outward.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng, bboxOf, centroid } from './geo.js';
import { ringFaces, face, at, rect, box, skin, hole, solid, finish, speckle, UP } from './slabkit.js';

const LOT = 1198239247;
export const VOLDIM_SKIP = new Set([LOT]);

const GF = 3.3, FH = 3.0, NF = 16, GREEN_FROM = 11, PARA = 1.0;   // ground storey, upper storeys, storeys, first green storey (upper index), parapet
const HALF = 11.5, BAYD = 0.9, RD = 1.4;                          // tower half-width, loggia reach, balcony recess depth
const ENTRY = [-0.83, -0.56];                                      // the entrance faces the footpath west of the lot
const YEL = '#eab13c', GRN = '#3f7366', ORG = '#df861f', WHITE = '#efefeb', GROUND = '#e6e5e0', PLINTH = '#8c8e8a';
const BAY = '#4a5250', BAYF = '#25292a', PAVE = '#b7b4ab', LAWN = '#5d8a3e', FENCE = '#22262a';
const GLASS = ['#56636c', '#4b5760', '#5f6b72', '#46525a'], LGLASS = ['#7f8d95', '#8898a1', '#74838c', '#90a0a8'];
// face layouts from the outside, left to right: Y coloured pier, W white strip (window columns), L loggia stack, R recess
const LAY = { std: [['Y', 3.0, 1], ['W', 3.0, 1], ['L', 5.6], ['W', 3.0, 1], ['Y', 7.0, 2]],
  door: [['Y', 6.0, 2], ['L', 4.4], ['R', 4.4], ['L', 4.4], ['Y', 2.4, 1]] };

export function buildVoldim({ root, map, solids: S, zips: Z, heightAt }) {
  const lot = map.buildings.find((q) => q.id === LOT);
  if (!lot) return null;
  const t0 = performance.now(), r = rng(LOT % 65521), n0 = S.count;
  const ring = ringPts(lot.p), [cx, cz] = centroid(ring);
  // the tower's axes: the mean direction of the lot's edges folded into one quadrant
  let ax = 0, az = 0;
  ring.forEach(([x, z], i) => { const [x2, z2] = ring[(i + 1) % ring.length], a = 4 * Math.atan2(z2 - z, x2 - x); ax += Math.cos(a); az += Math.sin(a); });
  const th = Math.atan2(az, ax) / 4, U = [Math.cos(th), Math.sin(th)], V = [-U[1], U[0]];
  const P = (u, v) => [cx + U[0] * u + V[0] * v, cz + U[1] * u + V[1] * v];
  const sq = [P(-HALF, -HALF), P(HALF, -HALF), P(HALF, HALF), P(-HALF, HALF)];
  const hs = sq.map((p) => heightAt(p[0], p[1])), ls = ring.map((p) => heightAt(p[0], p[1]));
  const gLo = Math.min(...hs, ...ls), gHi = Math.max(...hs);
  const yF = gHi + 0.3, Y = (h) => yF + h, ROOF = Y(GF + (NF - 1) * FH), TOP = ROOF + PARA, gB = gLo - 0.6, yP = yF - 0.15;
  const fy = (k) => (k ? Y(GF + (k - 1) * FH) : Y(0));
  const B = { wall: new MB(), det: new MB(), lit: new MB(), glass: new MB() };
  const D = B.det, W = B.wall, UVW = [2.5, 2.5];
  const faces = ringFaces(sq), entry = faces.reduce((b, f) => (f.nx * ENTRY[0] + f.nz * ENTRY[1] > b.nx * ENTRY[0] + b.nz * ENTRY[1] ? f : b));
  const sub = (f, s0, s1, o = 0) => { const a = at(f, s0, 0, o), b = at(f, s1, 0, o); return face([a[0], a[2]], [b[0], b[2]], f.nx, f.nz); };
  const glass = () => GLASS[(r() * GLASS.length) | 0];
  const win = (f, s0, s1, y0, y1, extra) => f.cuts.push({ s0, s1, y0, y1, glass: glass(), lit: r() < 0.35, frame: '#f4f4f1', rev: '#dcdcd6', dep: 0.2, pitch: 0.8, ...extra });
  let nWin = 0, nLog = 0, nBal = 0, doorAt = null;

  for (const f of faces) {
    // the right-hand end of the face (seen from outside) is s = 0 when the face runs to the viewer's left
    const lay = LAY[f === entry ? 'door' : 'std'], tot = lay.reduce((s, q) => s + q[1], 0), k0 = f.L / tot;
    const flip = f.ux * f.nz - f.uz * f.nx < 0;
    let s = 0;
    const segs = (flip ? [...lay].reverse() : lay).map(([t, w, cols]) => { const q = { t, s0: s, s1: s + w * k0, cols }; s = q.s1; return q; });
    segs.forEach((g, i) => {
      const w = g.s1 - g.s0, nb = [segs[i - 1]?.t, segs[i + 1]?.t];
      if (g.t === 'Y' || g.t === 'W') {
        const sf = sub(f, g.s0, g.s1);
        for (let c = 0; c < g.cols; c++) {
          const m = w * (c + 0.5) / g.cols, ww = Math.min(1.45, w / g.cols - 0.7);
          win(sf, m - ww / 2, m + ww / 2, Y(0.9), Y(2.55), { lit: r() < 0.5 });
          for (let k = 1; k < NF; k++) win(sf, m - ww / 2, m + ww / 2, fy(k) + 0.9, fy(k) + 2.4);
        }
        skin(W, sf, gB, Y(GF), GROUND, UVW);
        if (g.t === 'Y') { skin(W, sf, Y(GF), fy(GREEN_FROM), YEL, UVW); skin(W, sf, fy(GREEN_FROM), ROOF, GRN, UVW); }
        else skin(W, sf, Y(GF), ROOF, WHITE, UVW);
        W.setColor(g.t === 'Y' ? ORG : WHITE); rect(W, sf, 0, w, ROOF, TOP, 0, UVW);
        for (const q of sf.cuts) hole(B, sf, q);
        nWin += sf.cuts.length;
        // orange pinstripes where a coloured pier meets a white strip or a loggia stack (not round the corners)
        if (g.t === 'Y') {
          D.setColor(ORG);
          if (nb[0]) box(D, sf, 0, 0.22, Y(GF), TOP, 0, 0.05, 'flr');
          if (nb[1]) box(D, sf, w - 0.22, w, Y(GF), TOP, 0, 0.05, 'flr');
        }
        return;
      }
      if (g.t === 'L') { // a loggia stack: dark slabs, glass floor to ceiling, dark mullions; the ground storey is wall
        const sf = sub(f, g.s0, g.s1);
        win(sf, w / 2 - 0.75, w / 2 + 0.75, Y(0.9), Y(2.55), { lit: r() < 0.5 });
        skin(W, sf, gB, Y(GF), GROUND, UVW);
        for (const q of sf.cuts) hole(B, sf, q);
        const n = Math.max(2, Math.round(w / 1.5));
        for (let k = 1; k < NF; k++) {
          const y = fy(k);
          D.setColor(BAY); box(D, sf, 0, w, y - 0.05, y + 0.3, 0, BAYD, k === 1 ? 'ftlru' : 'ftlr');
          const G = r() < 0.2 ? B.lit : B.glass;
          G.setColor(LGLASS[(r() * LGLASS.length) | 0]); box(G, sf, 0.04, w - 0.04, y + 0.3, y + FH - 0.05, 0, BAYD - 0.06, 'flr');
          D.setColor(BAYF);
          for (let i = 0; i <= n; i++) { const m = 0.06 + (w - 0.12) * i / n; box(D, sf, m - 0.04, m + 0.04, y + 0.3, y + FH - 0.05, BAYD - 0.08, BAYD - 0.03, 'f'); }
          box(D, sf, 0.02, w - 0.02, y + 1.15, y + 1.22, BAYD - 0.08, BAYD - 0.03, 'f');
          for (const e of [0.06, w - 0.06]) box(D, sf, e - 0.06, e + 0.06, y + 0.3, y + FH - 0.05, 0, BAYD, 'lr');
          nLog++;
        }
        D.setColor(BAY); box(D, sf, -0.02, w + 0.02, ROOF - 0.05, TOP, 0, BAYD + 0.02, 'ftlr');
        solid(S, sf, 0, w, 0, BAYD, fy(1) - 0.05, TOP + 0.1);
        return;
      }
      // R: the recess of open balconies over the entrance
      const bf = sub(f, g.s0, g.s1, -RD), sf = sub(f, g.s0, g.s1);
      bf.cuts.push({ s0: 0.5, s1: w - 0.5, y0: Y(0), y1: Y(2.6), glass: '#3a4248', lit: true, frame: '#5f6664', rev: GROUND, dep: 0.15, pitch: 0.9, door: true, tr: Y(2.15) });
      for (let k = 1; k < NF; k++) {
        win(bf, 0.35, 1.25, fy(k), fy(k) + 2.3, { door: true, pitch: 0.9 });
        win(bf, 1.6, w - 0.35, fy(k) + 0.9, fy(k) + 2.4);
      }
      skin(W, bf, gB, ROOF, WHITE, UVW);
      for (const q of bf.cuts) hole(B, bf, q);
      nWin += bf.cuts.length;
      W.setColor(WHITE);
      rect(W, sf, 0, w, ROOF, TOP, 0, UVW);
      for (const [e, n] of [[0, f.U], [w, [-f.U[0], 0, -f.U[2]]]]) { const a = at(sf, e, 0, -RD), b = at(sf, e, 0, 0); W.face([[a[0], gB, a[2]], [b[0], gB, b[2]], [b[0], ROOF, b[2]], [a[0], ROOF, a[2]]], n); }
      W.setColor(GROUND); box(W, sf, 0, w, ROOF - 0.05, ROOF, -RD, 0, 'u');
      for (let k = 1; k < NF; k++) {
        const y = fy(k);
        D.setColor('#d6d6d1'); box(D, sf, 0, w, y - 0.22, y, -RD, 0.25, k === 1 ? 'ftu' : 'ft');
        W.setColor(WHITE); box(W, sf, 0, w, y, y + 1.2, 0.1, 0.25, 'fbtlr', UVW);
        nBal++;
      }
      solid(S, sf, 0, w, -RD, 0.25, fy(1) - 0.22, ROOF);
      const d = at(sf, w / 2, 0, 0); doorAt = [d[0], d[2]];
    });
    // grey plinth, coping, the parapet's inner face, the roof edge for the zips
    D.setColor(PLINTH); box(D, f, -0.06, f.L + 0.06, gB, Y(0.35), 0, 0.06, 'ftlr');
    D.setColor('#cfcfca'); box(D, f, -0.06, f.L + 0.06, TOP, TOP + 0.1, -0.3, 0.06, 'ftlr');
    D.setColor('#bdbdb8'); rect(D, f, 0, f.L, ROOF, TOP, -0.3, null, [-f.nx, 0, -f.nz]);
    const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], TOP, f.nx, f.nz);
  }

  // ---- roof deck and the lift head (set back toward the entrance side)
  D.setColor('#6d6c68'); D.fill(sq, [], ROOF + 0.02, true);
  {
    const off = HALF - 2.6, c = [cx + entry.nx * off, cz + entry.nz * off];
    const lh = [[-3.2, -2.6], [3.2, -2.6], [3.2, 2.6], [-3.2, 2.6]].map(([u, v]) => [c[0] + entry.nz * u + entry.nx * v, c[1] - entry.nx * u + entry.nz * v]);
    W.setColor('#d3d4d1'); W.extrude(lh, [], ROOF, ROOF + 3.2, { top: true });
    const cap = lh.map(([x, z]) => [x + (x - c[0]) * 0.08, z + (z - c[1]) * 0.08]);
    D.setColor('#e4e5e2'); D.extrude(cap, [], ROOF + 3.2, ROOF + 3.45, { top: true, bottom: true });
    S.prism(lh.flat(), ROOF, ROOF + 3.2, 0, 0, 'equipment');
  }
  S.prism(sq.flat(), gB, ROOF + 0.02, 0, 0, 'wall'); // the roof deck inside the parapets is walkable
  for (const f of faces) solid(S, f, -0.06, f.L + 0.06, -0.3, 0.06, ROOF, TOP + 0.1);

  // ---- the lot: a paved terrace with a stone kerb, lawn beds with shrubs, a black picket fence open before the door
  const lotF = ringFaces(ring);
  D.setColor(PAVE); D.fill(ring, [sq], yP, true);
  const fence = { posts: 0 };
  for (const f of lotF) {
    const mid = at(f, f.L / 2, 0), gapC = doorAt && Math.hypot(mid[0] - doorAt[0], mid[2] - doorAt[1]) < 12 ? (doorAt[0] - f.ax) * f.ux + (doorAt[1] - f.az) * f.uz : null;
    D.setColor('#a3a199'); box(D, f, -0.25, f.L + 0.25, gB, yP + 0.05, -0.25, 0, 'ft');
    const runs = gapC == null ? [[0.3, f.L - 0.3]] : [[0.3, gapC - 2.6], [gapC + 2.6, f.L - 0.3]];
    for (const [s0, s1] of runs) {
      if (s1 - s0 < 0.5) continue;
      // lawn bed along the inside of the fence, shrubs in it
      D.setColor(LAWN); box(D, f, s0, s1, yP, yP + 0.14, -2.2, -0.35, 'ftlr');
      for (let s = s0 + 1.2; s < s1 - 0.8; s += 2.2 + r() * 1.6) {
        const p = at(f, s, 0, -1.2 - r() * 0.5), cols = ['#4f7a35', '#6b8f3c', '#b0507d', '#8d4f9e', '#d47aa5', '#557a2e'];
        D.setColor(cols[(r() * cols.length) | 0]); D.ellipsoid([p[0], yP + 0.35, p[2]], [0.5 + r() * 0.3, 0.38 + r() * 0.2, 0.5 + r() * 0.3], 7, 4);
      }
      // the fence: two rails, square posts every 2.4 m, pickets every 0.3 m (front and back faces only)
      D.setColor(FENCE);
      for (const y of [yP + 0.12, yP + 1.0]) box(D, f, s0, s1, y, y + 0.05, -0.2, -0.16, 'fbt');
      for (let s = s0; s <= s1 + 1e-3; s += Math.max(0.5, (s1 - s0) / Math.ceil((s1 - s0) / 2.4))) { box(D, f, s - 0.04, s + 0.04, yP, yP + 1.1, -0.22, -0.14, 'fblrt'); fence.posts++; }
      for (let s = s0 + 0.15; s < s1 - 0.1; s += 0.3) box(D, f, s - 0.012, s + 0.012, yP + 0.12, yP + 1.05, -0.19, -0.17, 'fb');
      solid(S, f, s0, s1, -0.24, -0.12, yP, yP + 1.1, 'fence');
    }
    if (gapC != null) { // steps down from the terrace in the fence gap
      const q = at(f, gapC, 0, 1.5), drop = yP - heightAt(q[0], q[2]), n = Math.min(8, Math.ceil(drop / 0.17));
      D.setColor('#c4c1b8');
      for (let i = 0; i < n; i++) {
        const y1 = yP - drop * (i + 1) / (n + 1), o0 = i * 0.32, o1 = o0 + 0.32;
        box(D, f, gapC - 2.4, gapC + 2.4, gB, y1, o0, o1, 'ftlr');
        solid(S, f, gapC - 2.4, gapC + 2.4, o0, o1, gB, y1, 'step');
      }
    }
  }
  // the terrace itself: walkable, its top the paving
  S.prism(ring.flat(), gB, yP, 0, 0, 'ground');

  const M = {
    wall: new THREE.MeshStandardMaterial({ map: speckle(r), vertexColors: true, roughness: 0.85 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3, emissive: 0xffd9a8, emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.35 }),
  };
  const out = finish(root, 'voldim', B, M, { shade: ['wall', 'det'] });
  console.log(`[cherkasy] VOLDIM: ${nWin} openings, ${nLog} loggias, ${nBal} balconies, ${fence.posts} fence posts, floor ${yF.toFixed(1)} m (ground ${gLo.toFixed(1)}..${gHi.toFixed(1)}), ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  const bb = bboxOf(ring);
  return {
    footprints: [{ poly: sq, h: TOP - gLo, kind: 'apt', name: 'ЖК VOLDIM' }],
    clear: (x, z) => x > bb.x0 - 1 && x < bb.x1 + 1 && z > bb.z0 - 1 && z < bb.z1 + 1,
    update() { M.lit.emissiveIntensity = 1.1 * nightK.value; },
  };
}
