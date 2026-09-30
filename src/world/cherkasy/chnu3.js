// OWNER: cherkasy. Bohdan Khmelnytsky National University (ЧНУ), building No 3, бульвар Шевченка, 79 (OSM way
// 103576791), rebuilt after the university's news photo (cdu.edu.ua, 2020) and the satellite view. An E in plan: the
// four-storey spine along the boulevard and two wings running back to the north-east on narrow necks, all clad in
// small beige ceramic tiles with windows in pairs, white frames; on the boulevard side the single-storey glazed
// vestibule in brown frames under a long flat canopy with a deep brown fascia on square brown piers, a paved
// forecourt in large slabs. Flat roofs behind a thin parapet with a lift room.
//   CHNU3_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildChnu3({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// The footprint is square to the map axes (the boulevard front looks south-west, -x); the volumes are rectangles
// read off the OSM ring, each face laid in a blockkit.js frame where no other volume stands against it.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex, decal } from './sculpt.js';
import { ringPts, rng, bboxOf } from './geo.js';
import { edgeFace, at, quad, fbox, wall, win, fsolid, openSpans, finish, UP } from './blockkit.js';

const OSM_ID = 103576791;
export const CHNU3_SKIP = new Set([OSM_ID]);

const NF = 4, FH = 3.5, PL = 0.6, PARA = 0.8;           // storeys, storey height, plinth, parapet
const VOL = [                                            // [x0, z0, x1, z1] off the OSM ring
  [-6.1, -1581.7, 11.0, -1491.4],                         // spine on the boulevard
  [11.0, -1571.2, 16.4, -1560.8], [16.4, -1574.0, 58.2, -1557.9], // south neck and wing
  [10.8, -1512.2, 16.1, -1502.1], [16.1, -1515.0, 56.2, -1498.8], // north neck and wing
];
const VEST = [-10.7, -1545.6, -6.1, -1527.6];           // the glazed vestibule (the bump of the ring)
const CANOPY = [-1553, -1520];                           // z-extent of the canopy along the boulevard front
const BROWN = '#5a3a2a', PVC = '#f2f1ec', PLINTH = '#8b8781';
const GLASS = ['#6a7882', '#74828a', '#5f6d77', '#7d898f'], CURT = ['#d8d2c2', '#cdd3d4', '#e0d8c6'];

// ------------------------------------------------------------------------------------------------ textures
// 20 cm beige ceramic tiles, 12 x 12 per repeat (2.4 m), each fired a shade apart, pale grout
const tileTex = (r) => canvasTex(384, 384, (g, w) => {
  g.fillStyle = '#b9ae9c'; g.fillRect(0, 0, w, w);
  const p = w / 12;
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
    const k = 0.92 + r() * 0.11;
    g.fillStyle = `rgb(${[222, 208, 184].map((c) => Math.min(255, Math.round(c * k))).join(',')})`; g.fillRect(i * p + 1.5, j * p + 1.5, p - 3, p - 3);
  }
});
// forecourt slabs, 1.2 x 1.2 m with dark joints (4.8 m repeat)
const slabTex = (r) => canvasTex(256, 256, (g, w) => {
  g.fillStyle = '#8d8a84'; g.fillRect(0, 0, w, w);
  const p = w / 4;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = `rgb(${[172, 169, 163].map((c) => Math.round(c * (0.93 + r() * 0.1))).join(',')})`; g.fillRect(i * p + 2, j * p + 2, p - 4, p - 4); }
});

// ------------------------------------------------------------------------------------------------ build
export function buildChnu3({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((q) => q.id === OSM_ID);
  if (!b) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 99991), n0 = S.count ?? 0;
  const B = { tile: new MB(), det: new MB(), glass: new MB(), lit: new MB(), pave: new MB() };
  const D = B.det, TM = [2.4, 2.4];
  B.tile.setColor('#ffffff');
  const inR = ([x0, z0, x1, z1]) => (x, z) => x > x0 && x < x1 && z > z0 && z < z1;
  const bb = bboxOf(ringPts(b.p)), hs = [];
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) hs.push(heightAt(bb.x0 + (bb.x1 - bb.x0) * i / 4, bb.z0 + (bb.z1 - bb.z0) * j / 4));
  const gLo = Math.min(...hs) - 0.5, yF = Math.max(...hs) + PL, yTop = yF + NF * FH + PARA;
  let nWin = 0;

  for (const V of VOL) {
    const [x0, z0, x1, z1] = V, others = [...VOL.filter((q) => q !== V), VEST].map(inR);
    const cs = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    for (let i = 0; i < 4; i++) {
      const f = edgeFace(cs[i], cs[(i + 1) % 4], inR(V));
      const front = f.nx < -0.9 && V === VOL[0];
      for (const [a, c] of openSpans(f, others.filter((_, k) => k < VOL.length - 1 || !front))) {
        const span = { ...f, holes: [{ s0: -1, s1: a, y0: -1e3, y1: 1e3 }] }, w = c - a;
        // windows in pairs (two 1.3 m lights either side of a narrow pier), a pair every ~4.2 m
        const n = Math.floor((w - 0.8) / 4.2), sp = w / Math.max(1, n);
        for (let k = 0; k < NF; k++) for (let j = 0; j < n; j++) {
          const pc = a + sp * (j + 0.5), y0 = yF + k * FH + 0.9;
          if (front && k === 0) { const z = at(f, pc, 0)[2]; if (z > VEST[1] - 1 && z < VEST[3] + 1) continue; }
          for (const d of [-0.88, 0.88]) {
            const lit = r() < 0.3;
            span.holes.push({ s0: pc + d - 0.65, s1: pc + d + 0.65, y0, y1: y0 + 1.75, dep: 0.2, frame: PVC, rev: '#cfc6b6', sill: '#b8b5ae',
              glass: lit ? CURT[Math.floor(r() * CURT.length)] : GLASS[Math.floor(r() * GLASS.length)], lit, cols: 2, rows: 2, rowAt: [0.7] });
            nWin++;
          }
        }
        wall(B.tile, span, yF, yTop, TM);
        for (const q of span.holes) if (q.frame) win(B, span, q);
        D.setColor(PLINTH); fbox(D, f, a, c, gLo, yF, 0, 0.05, 1 | 16);
        D.setColor('#a9a39a'); fbox(D, f, a - 0.05, c + 0.05, yTop, yTop + 0.08, -0.3, 0.06, 1 | 4 | 8 | 16);
        const e0 = at(f, a, 0), e1 = at(f, c, 0);
        Z.edge(e0[0], e0[2], e1[0], e1[2], yTop + 0.08, f.nx, f.nz);
      }
    }
    D.setColor('#555659'); quad(D, [x0, yTop - PARA, z0], [x1, yTop - PARA, z0], [x1, yTop - PARA, z1], [x0, yTop - PARA, z1], UP);
    S.prism([x0, z0, x1, z0, x1, z1, x0, z1], gLo, yTop, 0, 0, 'wall');
  }
  // the lift room on the spine
  D.setColor('#cfc5b3'); D.box(1, yTop - PARA, -1540, 6, yTop + 2.6, -1534);
  S.box(1, yTop - PARA, -1540, 6, yTop + 2.6, -1534, 'equipment');

  // ---- the vestibule: brown-framed glazing and doors on three sides, under the canopy
  {
    const [x0, z0, x1, z1] = VEST, yV = yF + 4.0, cs = [[x0, z0], [x0, z1], [x1, z1], [x1, z0]];
    for (const i of [0, 1, 3]) { // the back one stands against the spine
      const f = edgeFace(cs[i], cs[(i + 1) % 4], inR(VEST)), mid = f.L / 2;
      const q = [];
      if (i === 0) {
        for (let s = 0.3; s < f.L - 0.3; s += 3.4) q.push({ s0: s, s1: Math.min(f.L - 0.3, s + 3.1), y0: yF + 0.05, y1: yV - 0.3, cols: 2, rows: 2, rowAt: [0.8] });
        const door = q.find((h) => h.s0 <= mid && h.s1 >= mid) ?? q[0];
        Object.assign(door, { door: BROWN, leaf: 2.3, glass: '#3e3a33' });
      } else q.push({ s0: 0.3, s1: f.L - 0.3, y0: yF + 0.05, y1: yV - 0.3, cols: 2, rows: 2, rowAt: [0.8] });
      f.holes.push(...q.map((h) => ({ dep: 0.12, frame: BROWN, rev: BROWN, glass: '#4a4f50', lit: true, ...h })));
      D.setColor('#d8cdb9'); wall(D, f, yF, yV, null);
      for (const h of f.holes) win(B, f, h);
      D.setColor(PLINTH); fbox(D, f, 0, f.L, gLo, yF, 0, 0.05, 1 | 16);
    }
    S.prism([x0, z0, x1, z0, x1, z1, x0, z1], gLo, yV, 0, 0, 'wall');
    // the canopy: flat slab with a deep brown fascia on square brown piers, running along the front
    const cf = edgeFace([-6.1, CANOPY[1]], [-6.1, CANOPY[0]], (x) => x > -6.1), cx = 6.2;
    D.setColor('#c9c3b8'); fbox(D, cf, 0, cf.L, yV, yV + 0.3, 0, cx, 32);
    D.setColor(BROWN); fbox(D, cf, -0.1, cf.L + 0.1, yV, yV + 0.9, cx - 0.15, cx, 1 | 4 | 8 | 16 | 32);
    fbox(D, cf, -0.1, cf.L + 0.1, yV + 0.3, yV + 0.9, 0, cx, 16);
    for (let s = 0.4; s <= cf.L - 0.3; s += (cf.L - 0.8) / 10) {
      fbox(D, cf, s - 0.25, s + 0.25, yF - 0.1, yV, cx - 0.9, cx - 0.4, 1 | 2 | 4 | 8);
      fsolid(S, cf, s - 0.25, s + 0.25, cx - 0.9, cx - 0.4, gLo, yV, 'pillar');
    }
    fsolid(S, cf, -0.1, cf.L + 0.1, 0, cx, yV, yV + 0.9, 'awning', 1);
    B.lit.setColor('#fff1d6'); for (let s = 2; s < cf.L; s += 4) { const p = at(cf, s, yV - 0.02, cx / 2); B.lit.cyl(p[0], p[1] - 0.04, p[2], 0.22, 0.22, 0.04, 10); }
    // forecourt slabs from the canopy to the boulevard pavement, a step up to the floor
    const fx0 = -6.1 - cx - 12, fz0 = CANOPY[0] - 4, fz1 = CANOPY[1] + 4;
    const yP = Math.max(...[[fx0, fz0], [fx0, fz1], [-8, fz0], [-8, fz1], [-12, (fz0 + fz1) / 2]].map(([x, z]) => heightAt(x, z))) + 0.1;
    B.pave.setColor('#ffffff');
    quad(B.pave, [fx0, yP, fz0], [-6.1, yP, fz0], [-6.1, yP, fz1], [fx0, yP, fz1], UP, [[fx0 / 4.8, fz0 / 4.8], [-6.1 / 4.8, fz0 / 4.8], [-6.1 / 4.8, fz1 / 4.8], [fx0 / 4.8, fz1 / 4.8]]);
    D.setColor('#9e9a93');
    for (const [a, c] of [[[fx0, fz0], [fx0, fz1]], [[fx0, fz1], [-6.1, fz1]], [[-6.1, fz0], [fx0, fz0]]]) {
      const f = edgeFace(a, c, (x, z) => x > fx0 && x < -6.1 && z > fz0 && z < fz1); fbox(D, f, 0, f.L, gLo, yP, 0, 0.02, 1);
    }
  }

  // ---- meshes
  const M = {
    tile: new THREE.MeshStandardMaterial({ map: tileTex(r), vertexColors: true, roughness: 0.6 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.35, envMapIntensity: 1.2 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffdcaa, emissiveIntensity: 0 }),
    pave: decal(new THREE.MeshStandardMaterial({ map: slabTex(r), vertexColors: true, roughness: 0.97, envMapIntensity: 0.3, polygonOffset: true, polygonOffsetFactor: -2 })),
  };
  const st = finish(root, 'chnu3', B, M, ['tile', 'det']);
  console.log(`[cherkasy] ChNU building 3 (Shevchenka 79): ${nWin} windows, floor ${yF.toFixed(1)} m, ${(st.tris / 1000).toFixed(1)}k tris, ${st.meshes} meshes, ${(st.verts / 1000).toFixed(1)}k verts, ${(S.count ?? 0) - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    footprints: [{ poly: ringPts(b.p), h: yTop - gLo, kind: b.k, name: b.name }],
    clear: (x, z) => VOL.some(([x0, z0, x1, z1]) => x > x0 - 3 && x < x1 + 3 && z > z0 - 3 && z < z1 + 3) || (x > -25 && x < -6 && z > CANOPY[0] - 4 && z < CANOPY[1] + 4),
    update() { M.lit.emissiveIntensity = 1.2 * nightK.value; },
  };
}
