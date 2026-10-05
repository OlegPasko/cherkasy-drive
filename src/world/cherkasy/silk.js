// OWNER: cherkasy. Черкаський шовковий комбінат, вул. В'ячеслава Чорновола 170 in Khimselyshche (the quest «Таємниці
// Черкас», card `silk`): begun in January 1965, the first cloth on 8 December 1967; over three thousand looms and five
// thousand people, 38 % of Ukraine's silk fabric in the 1990s (uk.wikipedia). Built here: the three-storey
// administrative and amenity block that fronts the plant along the street (OSM way 132429626, «Черкаський Шовковий
// Комбінат», 153 m by 13 m, building:levels 3) and the plant's vehicle gate on the yard road at its east end.
// References: OSM; Esri World Imagery (the long flat-roofed block across the street end of the weaving halls, a strip of
// lawn and trees before it, the yard road past its east end); chmr.gov.ua's 2022 visit photos (the halls inside only).
// No street photo of the block was found, so the facade is a guess at the plant's 1960s modernism: ribbon windows on
// all three floors between light tiled spandrels, a pier every 6 m, a full-height glazed entrance hall in the middle
// with a canopy on two columns and granite steps, punched windows on the yard side, blank ends with a stair window.
// No lettering (no photo of it). The gate is a guess too: plastered piers, a sliding steel gate run back along the
// fence (open, the yard road stays drivable), a small checkpoint beside it and a steel bar fence along the street.
//   SILK_SKIP – the replaced OSM block
//   buildSilk({ root, map, solids, zips, heightAt }) -> { footprints, clear(x, z), update(), stats } | null
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, area2, inPoly, hash01 } from './geo.js';
import { edgeFaces, pt, fbox, wall, win, mats, finish } from './bldkit.js';
import { OVERHANG } from '../collision.js';

export const SILK_SKIP = new Set([132429626]);
const FL = 3.6, PLINTH = 0.6, N = 3;          // storey height, the plinth over the ground, storeys
const BAY = 6, HALL = 18, PROJ = 1.4;          // the facade bay, the entrance hall's width and projection
// the gate on the yard road (OSM service way along x ~ -4407) and the fence along the street, map metres
const GATE = { x0: -4412.6, x1: -4401.4, z: 2398 };
const BOOTH = { x0: -4420.6, x1: -4414.2, z0: 2394.6, z1: 2400.6, h: 3.0 };
const FENCE = [[-4401.4, -4372]];

export function buildSilk({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings?.find((q) => q.id === 132429626);
  if (!b) return null;
  const t0 = performance.now();
  const ring = ringPts(b.p), faces = edgeFaces(ring);
  const front = faces.filter((f) => f.nz > 0.5).reduce((a, f) => (f.L > a.L ? f : a));
  const back = faces.filter((f) => f.nz < -0.5).reduce((a, f) => (f.L > a.L ? f : a));
  if (front.L < 120) return null;
  const g = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 30; };
  let floor = -Infinity, base = Infinity;
  for (let s = 0; s <= front.L; s += 6) { const [x, , z] = pt(front, s, 0, 2); floor = Math.max(floor, g(x, z)); }
  for (const [x, z] of ring) base = Math.min(base, g(x, z));
  floor += PLINTH; base -= 0.4;
  const Y = (h) => floor + h, top = Y(N * FL), par = top + 0.9;
  const B = { wall: new MB(), tile: new MB(), det: new MB(), glass: new MB(), lit: new MB(), glow: new MB() };
  const sm = front.L / 2, hs0 = sm - HALL / 2, hs1 = sm + HALL / 2; // the hall's span along the front
  const litK = (k) => hash01(k * 7919 + 13) < 0.45;
  let nWin = 0;

  // ---------------------------------------------------------------- the walls
  for (const f of faces) {
    const holes = [];
    if (f === front) {
      // ribbon windows: one pier every bay, sill 0.9, head 2.9; none behind the hall
      const nb = Math.floor(front.L / BAY), m0 = (front.L - nb * BAY) / 2;
      for (let i = 0; i < nb; i++) {
        const s0 = m0 + i * BAY + 0.18, s1 = m0 + (i + 1) * BAY - 0.18;
        if (s1 > hs0 - 0.4 && s0 < hs1 + 0.4) continue;
        for (let k = 0; k < N; k++) holes.push({ s0, s1, y0: Y(k * FL + 0.9), y1: Y(k * FL + 2.9), cols: 4, dep: 0.16, rev: '#7a8086', glass: '#c9d6de', lit: litK(i * 5 + k), sill: '#9a9a94' });
      }
    } else if (f === back) {
      for (let s = 2.5; s < f.L - 2; s += 3) for (let k = 0; k < N; k++) holes.push({ s0: s - 0.9, s1: s + 0.9, y0: Y(k * FL + 0.9), y1: Y(k * FL + 2.7), cols: 2, dep: 0.18, rev: '#8b8c88', glass: '#b8c3c8', lit: litK(Math.round(s) * 3 + k + 101) });
      holes.push({ s0: f.L * 0.3 - 1.2, s1: f.L * 0.3 + 1.2, y0: Y(0), y1: Y(2.6), cols: 2, rev: '#6a6a66', glass: '#7e8a90' }); // the yard doors
      holes.push({ s0: f.L * 0.7 - 1.2, s1: f.L * 0.7 + 1.2, y0: Y(0), y1: Y(2.6), cols: 2, rev: '#6a6a66', glass: '#7e8a90' });
    } else if (f.L > 8) {
      // the ends: a tall stair window in the middle
      holes.push({ s0: f.L / 2 - 0.8, s1: f.L / 2 + 0.8, y0: Y(1.6), y1: Y(N * FL - 0.6), cols: 2, rows: N * 2, dep: 0.2, rev: '#7a8086', glass: '#c9d6de', lit: true });
    }
    nWin += holes.length;
    // spandrels and piers in light glazed tile on the street, white render elsewhere
    const D = f === front ? B.tile : B.wall;
    D.setColor(f === front ? '#e2e4e0' : '#e9e6dd');
    wall(D, f, Y(0), top, holes, f === front ? [1.2, 0.6] : [2.5, 2.5]);
    B.det.setColor('#8a877f'); wall(B.det, f, base, Y(0), []);                 // the plinth
    for (const q of holes) win(B, f, q);
    B.det.setColor('#cfcdc5'); fbox(B.det, f, -0.1, f.L + 0.1, top, par, -0.3, 0.06, 'fbt'); // the parapet
    if (f === front) {                                                         // a slim band at each floor line
      B.det.setColor('#b9bbb7');
      for (let k = 1; k < N; k++) fbox(B.det, f, 0, f.L, Y(k * FL + 0.42), Y(k * FL + 0.58), 0, 0.08, 'ftu');
    }
    const a = pt(f, 0, 0), e = pt(f, f.L, 0); Z?.edge?.(a[0], a[2], e[0], e[2], par, f.nx, f.nz);
  }
  B.det.setColor('#77797c'); B.det.fill(ring, [], top - 0.05, true);
  for (let s = 10; s < front.L - 8; s += 24) { const [x, , z] = pt(front, s, 0, -6.5); B.det.setColor('#a6a9ab').box(x - 1, top, z - 0.8, x + 1, top + 1.2, z + 0.8); } // vents

  // ---------------------------------------------------------------- the entrance hall: a glazed box proud of the front
  {
    const f = front, h = { ...f, ax: f.ax + f.ux * hs0 + f.nx * PROJ, az: f.az + f.uz * hs0 + f.nz * PROJ, L: HALL };
    const holes = [];
    for (let k = 0; k < N; k++) holes.push({ s0: 0.5, s1: HALL - 0.5, y0: Y(k * FL + (k ? 0.5 : 2.9)), y1: Y(k * FL + FL - 0.4), cols: 12, rows: 1, dep: 0.1, rev: '#59616a', glass: '#c3d4dd', lit: true });
    holes.push({ s0: HALL / 2 - 3, s1: HALL / 2 + 3, y0: Y(0), y1: Y(2.6), cols: 4, dep: 0.25, rev: '#3f454b', glass: '#9fb1bb', lit: true }); // the doors
    B.wall.setColor('#ecebe5'); wall(B.wall, h, Y(0), top + 0.6, holes);
    for (const q of holes) win(B, h, q);
    B.wall.setColor('#ecebe5'); fbox(B.wall, f, hs0, hs1, Y(0), top + 0.6, 0, PROJ, 'lrt');
    B.det.setColor('#cfcdc5'); fbox(B.det, f, hs0 - 0.1, hs1 + 0.1, top + 0.6, top + 1.1, -0.1, PROJ + 0.1, 'fblrt');
    B.det.setColor('#8a877f'); fbox(B.det, f, hs0, hs1, base, Y(0), 0, PROJ, 'flr');
    // the canopy on two round columns, and the granite steps under it
    const c0 = sm - 5, c1 = sm + 5, o1 = PROJ + 5;
    B.det.setColor('#d9d8d2'); fbox(B.det, f, c0, c1, Y(3.15), Y(3.5), PROJ, o1, 'fblrtu');
    const cp = [[c0, PROJ], [c1, PROJ], [c1, o1], [c0, o1]].map(([s, o]) => { const q = pt(f, s, 0, o); return [q[0], q[2]]; });
    S.prism((area2(cp) < 0 ? cp.reverse() : cp).flat(), Y(3.15), Y(3.5), 0, 0, 'awning', OVERHANG);
    B.det.setColor('#c8c6c0');
    for (const s of [c0 + 0.6, c1 - 0.6]) { const [x, , z] = pt(f, s, 0, o1 - 0.6); B.det.cyl(x, base, z, 0.22, 0.22, Y(3.15) - base, 12); S.cyl(x, z, base, Y(3.15), 0.22, 0.22, 'pole'); }
    B.det.setColor('#8d8478');
    for (let k = 0; k < 3; k++) {
      const o = PROJ + 0.5 + k * 0.45;
      fbox(B.det, f, sm - 4 - k * 0.45, sm + 4 + k * 0.45, Math.min(base, Y(-0.2 - k * 0.2)) - 0.3, Y(-0.02 - k * 0.2), PROJ, o, 'flrt');
    }
    const hp = [[hs0, 0], [hs1, 0], [hs1, PROJ], [hs0, PROJ]].map(([s, o]) => { const q = pt(f, s, 0, o); return [q[0], q[2]]; });
    S.prism((area2(hp) < 0 ? hp.reverse() : hp).flat(), base, top + 1.1, 0, 0, 'wall');
  }
  const solid = area2(ring) < 0 ? ring.slice().reverse() : ring;
  S.prism(solid.flat(), base, par, 0, 0, 'wall');

  // ---------------------------------------------------------------- the gate, the checkpoint, the street fence
  {
    const D = B.det, gz = GATE.z;
    const piers = [GATE.x0 - 0.4, GATE.x1 + 0.4];
    for (const x of piers) {
      const y0 = g(x, gz) - 0.2;
      B.wall.setColor('#e6ddd0').box(x - 0.4, y0, gz - 0.4, x + 0.4, y0 + 2.8, gz + 0.4);
      D.setColor('#9c9890').box(x - 0.46, y0 + 2.8, gz - 0.46, x + 0.46, y0 + 2.95, gz + 0.46);
      S.box(x - 0.4, y0, gz - 0.4, x + 0.4, y0 + 2.95, gz + 0.4, 'wall');
    }
    // the sliding leaf, run back east behind the fence, on its rail
    const lx0 = GATE.x1 + 0.9, lx1 = lx0 + (GATE.x1 - GATE.x0), lz = gz - 0.35, yl = g((lx0 + lx1) / 2, lz) + 0.08;
    D.setColor('#56605a');
    D.box(lx0, yl, lz - 0.04, lx1, yl + 0.1, lz + 0.04).box(lx0, yl + 2.0, lz - 0.04, lx1, yl + 2.1, lz + 0.04);
    for (let x = lx0 + 0.05; x < lx1; x += 0.18) D.box(x - 0.02, yl, lz - 0.02, x + 0.02, yl + 2.1, lz + 0.02, 1 | 2 | 4 | 16 | 32);
    S.box(lx0, yl - 0.1, lz - 0.06, lx1, yl + 2.1, lz + 0.06, 'fence');
    // the street fence: concrete posts, steel bar panels on a low plinth
    for (const [x0, x1] of FENCE) {
      for (let x = x0; x < x1 - 0.1; x += 3) {
        const xe = Math.min(x1, x + 3), y = g((x + xe) / 2, gz);
        D.setColor('#bdbab2').box(x, y - 0.2, gz - 0.12, xe, y + 0.35, gz + 0.12);
        D.setColor('#cfcdc5').box(x - 0.14, y - 0.2, gz - 0.14, x + 0.14, y + 2.0, gz + 0.14);
        D.setColor('#56605a').box(x + 0.14, y + 1.85, gz - 0.025, xe - 0.14, y + 1.92, gz + 0.025).box(x + 0.14, y + 0.5, gz - 0.025, xe - 0.14, y + 0.57, gz + 0.025);
        for (let q = x + 0.3; q < xe - 0.15; q += 0.15) D.box(q - 0.012, y + 0.35, gz - 0.012, q + 0.012, y + 1.95, gz + 0.012, 1 | 2 | 4 | 16 | 32);
        S.box(x, y - 0.2, gz - 0.14, xe, y + 2.0, gz + 0.14, 'fence');
      }
    }
    // the checkpoint: one storey, render, a flat roof slab, windows on the street and the gate
    const k = BOOTH, yb = Math.min(g(k.x0, k.z0), g(k.x1, k.z1), g(k.x0, k.z1), g(k.x1, k.z0)) - 0.2, tb = yb + 0.3 + k.h;
    B.wall.setColor('#e6ddd0').box(k.x0, yb, k.z0, k.x1, tb, k.z1, 1 | 2 | 4 | 16 | 32);
    D.setColor('#8a877f').box(k.x0 - 0.04, yb, k.z0 - 0.04, k.x1 + 0.04, yb + 0.6, k.z1 + 0.04, 1 | 2 | 16 | 32);
    D.setColor('#cfcdc5').box(k.x0 - 0.4, tb, k.z0 - 0.4, k.x1 + 0.4, tb + 0.28, k.z1 + 0.4);
    B.glow.box(k.x0 + 0.8, yb + 1.3, k.z1, k.x1 - 0.8, yb + 2.5, k.z1 + 0.03, 16).box(k.x1, yb + 1.3, k.z0 + 0.8, k.x1 + 0.03, yb + 2.5, k.z1 - 1.8, 1);
    D.setColor('#4f4a44').box(k.x1, yb + 0.3, k.z1 - 1.5, k.x1 + 0.04, yb + 2.4, k.z1 - 0.6, 1); // the door to the gate
    S.box(k.x0, yb, k.z0, k.x1, tb + 0.28, k.z1, 'wall');
  }

  const M = mats({
    tile: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x8fa0a8, roughness: 0.2, metalness: 0.3, emissive: 0xffd9a8, emissiveIntensity: 0 }),
  });
  const st = finish(root, 'silk', B, M, ['wall', 'tile', 'det']);
  console.log(`[cherkasy] Silk combine (Chornovola 170): ${st.verts} verts, ${st.meshes} meshes, ${nWin} windows`);
  const near = (x, z) => x > GATE.x0 - 2 && x < FENCE[0][1] + 1 && z > GATE.z - 3 && z < GATE.z + 3;
  return {
    footprints: [{ poly: ring, h: par - base, kind: 'industrial', name: b.name }],
    clear: (x, z) => inPoly(ring, x, z) || near(x, z) || (x > BOOTH.x0 - 2 && x < BOOTH.x1 + 2 && z > BOOTH.z0 - 2 && z < BOOTH.z1 + 2),
    stats: { verts: st.verts, meshes: st.meshes, floor, top: par, front, hall: [hs0, hs1] },
    update() { M.lit.emissiveIntensity = 0.7 * nightK.value; M.glow.emissiveIntensity = 1.1 * nightK.value; },
  };
}
