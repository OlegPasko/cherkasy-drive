// OWNER: cherkasy. The new club house at вулиця Надпільна, 249 (Соснівський р-н; one block, finished 2025), built from
// the photos in the lun.ua new-builds catalogue (lun.ua/new/cherkasy/nadpilna-st-249: the construction monitoring) and
// the developer's gallery. Not in OSM yet: it stands on the fenced construction lot (OSM way 1201241898, 0.0986 ha, 45 x
// 21 m) that runs back from Надпільна along the lane on its north-west side. The site passport gives 422 m² built over
// and 14.2 m high; the photos show what was built (not the passport's render):
// - in plan three square sections stepped corner to corner away from the street (each one 2.5 m further into the
//   yard), joined by narrow stair cores that jut out a little on both long sides; the stepping shows on both long fronts, so
//   every view of the house is a run of offset boxes;
// - the sections in dark brown-charcoal brick with two wide four-pane windows per floor on every free face; the cores
//   in pale grey-pink brick with one stack of two-pane windows, on the lane, on the step faces and over the yard doors;
// - three brick storeys and a fourth clad in dark standing-seam metal, flush with the brick over a thin dark ledge, its
//   windows set deep in the metal; low hipped roofs on the sections, the cores rising a little higher with flat tops
//   and steel boiler flues (every flat has its own gas boiler);
// - dark-framed windows in a dark surround, a grey rendered plinth; the street section stands on columns over an
//   open car port (open to the street and the yard, the car can drive in); the yellow gas pipe along the yard fronts;
//   the yard doors under black steel canopies on posts; a black panel fence with a sliding gate runs from the first
//   core to the lot's edge and closes the yard behind it off the street. The sections follow the ground falling away from the street, so their floors step down too.
// No developer name or logo anywhere. Windows light up at night.
//   NADP249_SKIP: the OSM ids replaced here (none: the lot is empty in OSM)
//   NADP249_RING: the building's outline on the map, flat [x, z, …] (places.js keeps a copy, the test compares them)
//   buildNadpilna249({ root, solids, zips?, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// The block is laid square to the map axes: u = x - X0 runs from the street end back along the lane, v = z - Z0 from
// the lane into the yard. Walls are laid per face in a face frame (slabkit.js): s along the face, left to right for a
// viewer outside, y up, o outward.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { rng } from './geo.js';
import { canvasTex } from './sculpt.js';
import { face, at, quad, rect, box, skin, hole, solid, finish } from './slabkit.js';

export const NADP249_SKIP = new Set();

const X0 = -696.3, Z0 = -518.8;                    // the street section's lane-side street corner
const P = (u, v) => [X0 + u, Z0 + v];
// the volumes: three sections and the two stair cores between them (u0, u1, v0, v1 in the local frame)
const VOL = {
  A: { u: [0, 10.4], v: [0, 10.2], sec: true, plinth: 2.45 },  // over the car port
  J1: { u: [10.4, 14.4], v: [-0.6, 13.5], nb: ['A', 'B'] },
  B: { u: [14.4, 24.8], v: [2.5, 12.7], sec: true, plinth: 1.5 },
  J2: { u: [24.8, 28.8], v: [1.9, 16.0], nb: ['B', 'C'] },
  C: { u: [28.8, 39.2], v: [5.0, 15.2], sec: true, plinth: 1.5 },
};
const OUT = [[0, 0], [10.4, 0], [10.4, -0.6], [14.4, -0.6], [14.4, 2.5], [24.8, 2.5], [24.8, 1.9], [28.8, 1.9], [28.8, 5.0],
  [39.2, 5.0], [39.2, 15.2], [28.8, 15.2], [28.8, 16.0], [24.8, 16.0], [24.8, 12.7], [14.4, 12.7], [14.4, 13.5], [10.4, 13.5],
  [10.4, 10.2], [0, 10.2]];
export const NADP249_RING = OUT.flatMap(([u, v]) => P(u, v).map((q) => Math.round(q * 10) / 10));
// the free faces: volume, end points, outward normal (local u / v = map x / z), layout: w2 two wide windows, s1 one
// stack of core windows, door: a core's yard door with windows over it, '' blank
const FACES = [
  ['A', [0, 0], [10.4, 0], [0, -1], 'w2'], ['J1', [10.4, 0], [10.4, -0.6], [-1, 0], ''],
  ['J1', [10.4, -0.6], [14.4, -0.6], [0, -1], 's1'], ['J1', [14.4, -0.6], [14.4, 2.5], [1, 0], 's1'],
  ['B', [14.4, 2.5], [24.8, 2.5], [0, -1], 'w2'], ['J2', [24.8, 2.5], [24.8, 1.9], [-1, 0], ''],
  ['J2', [24.8, 1.9], [28.8, 1.9], [0, -1], 's1'], ['J2', [28.8, 1.9], [28.8, 5.0], [1, 0], 's1'],
  ['C', [28.8, 5.0], [39.2, 5.0], [0, -1], 'w2'], ['C', [39.2, 5.0], [39.2, 15.2], [1, 0], 'w2'],
  ['C', [28.8, 15.2], [39.2, 15.2], [0, 1], 'w2', 'yard'], ['J2', [28.8, 15.2], [28.8, 16.0], [1, 0], ''],
  ['J2', [24.8, 16.0], [28.8, 16.0], [0, 1], 'door', 'yard'], ['J2', [24.8, 12.7], [24.8, 16.0], [-1, 0], 's1'],
  ['B', [14.4, 12.7], [24.8, 12.7], [0, 1], 'w2', 'yard'], ['J1', [14.4, 12.7], [14.4, 13.5], [1, 0], ''],
  ['J1', [10.4, 13.5], [14.4, 13.5], [0, 1], 'door', 'yard'], ['J1', [10.4, 10.2], [10.4, 13.5], [-1, 0], 's1'],
  ['A', [0, 10.2], [10.4, 10.2], [0, 1], 'w2', 'yard'], ['A', [0, 0], [0, 10.2], [-1, 0], 'w2'],
];
const FH = 2.85, TH = 3.25, NB = 3, NL = 4;        // brick storey, the taller metal storey; brick storeys; all storeys
const FENCE_U = 14.4, FENCE_V = [13.5, 21.0], GATE_V = [14.6, 19.4]; // the yard fence by the first core, its sliding gate
const DARKB = '#635c59', PALEB = '#bcb0aa', SEAM = '#4a4f52', RENDER = '#6c6f71', FRAME = '#33373a', EDGE = '#2e3134';
const GLASS = ['#3a4046', '#444b52', '#353a40', '#4d545b'];

// brick: a mix of tones round a mid grey (the vertex colour gives dark or pale); 2 x 2 m per repeat (uv in metres)
const brickTex = (r) => {
  const t = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#9a9692'; g.fillRect(0, 0, w, h);
    const bw = w / 8, bh = h / 26;
    for (let j = 0; j < 26; j++) for (let i = -1; i < 8; i++) {
      const k = 0.86 + r() * 0.18, tint = r() < 0.5 ? [250, 244, 240] : [238, 238, 242];
      g.fillStyle = `rgb(${tint.map((v) => Math.min(255, Math.round(v * k))).join(',')})`;
      g.fillRect(i * bw + (j & 1 ? bw / 2 : 0) + 1.5, j * bh + 1.5, bw - 3, bh - 3);
    }
  });
  t.repeat.set(0.5, 0.5);
  return t;
};
// standing seam: a seam every 0.5 m along u (uv in metres)
const seamTex = () => canvasTex(128, 64, (g, w, h) => {
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
  for (const x of [0, w / 2]) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, 0, 3, h); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x + 3, 0, 2, h); }
});
// the fence's black panels: a grid of raised squares, 1 m per repeat across, the full height up
const fenceTex = () => canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = '#1e2124'; g.fillRect(0, 0, w, h);
  for (let y = 6; y < h - 6; y += 20) for (let x = 4; x < w; x += 32) { g.fillStyle = '#2c3034'; g.fillRect(x, y, 24, 14); g.fillStyle = '#15171a'; g.fillRect(x, y + 13, 24, 2); }
});

export function buildNadpilna249({ root, solids: S, zips: Z, heightAt }) {
  const t0 = performance.now(), r = rng(249), n0 = S.count;
  const ring = OUT.map(([u, v]) => P(u, v));
  const gAt = (u, v) => { const [x, z] = P(u, v); return heightAt(x, z); };
  const hs = ring.map(([x, z]) => heightAt(x, z));
  if (hs.some((h) => !Number.isFinite(h))) return null;
  const gLo = Math.min(...hs);
  // floor levels: each section over the highest ground under it, the cores half way between their neighbours
  for (const V of Object.values(VOL)) {
    const g = [V.u[0], V.u[1]].flatMap((u) => [V.v[0], V.v[1]].map((v) => gAt(u, v)));
    V.gHi = Math.max(...g); V.gLo = Math.min(...g);
    if (V.sec) { V.yF = V.gHi + V.plinth; V.eave = V.yF + NB * FH + TH; }
  }
  for (const V of Object.values(VOL)) if (!V.sec) {
    const [a, b] = V.nb.map((k) => VOL[k]);
    V.yF = (a.yF + b.yF) / 2; V.eave = Math.max(a.eave, b.eave) + 0.6;
  }
  const B = { brick: new MB(), seam: new MB(), det: new MB(), glass: new MB(), lit: new MB(), fence: new MB() };
  const K = B.brick, M_ = B.seam, D = B.det, U1 = [1, 1];
  const glass = () => GLASS[(r() * GLASS.length) | 0];
  let nWin = 0;

  for (const [vk, p, q, n, lay, yard] of FACES) {
    const V = VOL[vk], u = [n[1], -n[0]];
    // order the ends so s runs left to right for a viewer outside
    const [a, b] = (q[0] - p[0]) * u[0] + (q[1] - p[1]) * u[1] > 0 ? [p, q] : [q, p];
    const f = face(P(...a), P(...b), n[0], n[1]);
    const g0 = Math.min(gAt(...a), gAt(...b)), gB = g0 - 0.5, fy = (k) => V.yF + k * FH, L = f.L;
    const under = vk === 'A' && (n[0] < 0 || n[1] > 0); // the car port's open faces (street and yard)
    f.cuts = [];
    if (lay === 'w2' || lay === 's1' || lay === 'door') {
      const cs = lay === 'w2' ? [L * 0.27, L * 0.73] : [L / 2], wide = lay === 'w2';
      for (const c of cs) for (let k = 0; k < NL; k++) {
        if (lay === 'door' && k === 0) continue;
        const top = k === NL - 1, y = fy(k) + (top ? 0.3 : 0), hw = wide ? 1.3 : 0.7, y0 = y + (wide ? 0.55 : 0.7), y1 = y + (wide ? 2.55 : 2.45);
        f.cuts.push({ s0: c - hw, s1: c + hw, y0, y1, glass: glass(), lit: r() < 0.3, frame: FRAME, rev: top ? SEAM : '#4a4542',
          dep: top ? 0.34 : 0.2, pitch: wide ? 0.58 : 0.65, tr: y0 + (y1 - y0) * 0.3, win: !top });
        nWin++;
      }
      if (lay === 'door') {
        const m = at(f, L / 2, 0), gd = heightAt(m[0], m[2]) + 0.15;
        f.cuts.push({ s0: L / 2 - 0.7, s1: L / 2 + 0.7, y0: gd, y1: gd + 2.35, door: true, glass: '#3b3936', lit: true, frame: FRAME, rev: '#3a3d40', dep: 0.3, pitch: 1.4, tr: gd + 2.0 });
        canopy(f, L / 2 - 1.5, L / 2 + 1.5, 1.7, gd + 2.75, gB);
      }
    }
    const col = V.sec ? DARKB : PALEB, yB = V.yF - 0.6;
    // grey render plinth, brick for three storeys, the metal storey; the car port has the floor slab's edge instead
    if (under) {
      D.setColor(EDGE); box(D, f, -0.05, L + 0.05, V.yF - 0.4, V.yF, -0.05, 0.05, 'ftulr');
      skin(K, f, V.yF, fy(NB), col, U1);
    } else {
      skin(D, f, gB, yB, RENDER);
      skin(K, f, yB, fy(NB), col, U1);
    }
    skin(M_, f, fy(NB), V.eave, SEAM, U1);
    for (const c of f.cuts) {
      hole(B, f, c);
      // the dark surround of the brick windows, a hair proud of the wall
      if (c.win) { D.setColor(FRAME); const w = 0.09, o = 0.015;
        rect(D, f, c.s0 - w, c.s1 + w, c.y1, c.y1 + w, o); rect(D, f, c.s0 - w, c.s1 + w, c.y0 - w, c.y0, o);
        rect(D, f, c.s0 - w, c.s0, c.y0, c.y1, o); rect(D, f, c.s1, c.s1 + w, c.y0, c.y1, o); }
    }
    // the ledge under the metal storey and the eaves fascia
    D.setColor(EDGE); box(D, f, -0.04, L + 0.04, fy(NB) - 0.08, fy(NB) + 0.06, 0, 0.1, 'ftulr');
    box(D, f, -0.12, L + 0.12, V.eave - 0.16, V.eave + 0.1, 0, 0.14, 'ftulr');
    if (Z && L > 3) { const e0 = at(f, 0, 0, -0.1), e1 = at(f, L, 0, -0.1); Z.edge(e0[0], e0[2], e1[0], e1[2], V.eave + 0.1, f.nx, f.nz); }
    // the yellow gas pipe along the yard fronts past the street section, between the ground and the first floor windows, with a riser at the door
    if (yard && vk !== 'A') {
      const yp = V.yF + FH - 0.2;
      D.setColor('#e3b81c'); box(D, f, 0, L, yp - 0.045, yp + 0.045, 0.1, 0.19, 'ftulr');
      if (lay === 'door') box(D, f, 0.25, 0.34, gB + 0.5, yp, 0.1, 0.19, 'flr');
    }
  }

  // the core walls above the lower roofs of the sections beside them (metal, blank)
  for (const [jk, sk] of [['J1', 'A'], ['J1', 'B'], ['J2', 'B'], ['J2', 'C']]) {
    const J = VOL[jk], Sv = VOL[sk], left = Sv.u[1] <= J.u[0], uu = left ? J.u[0] : J.u[1], nx = left ? -1 : 1;
    const [a, b] = left ? [[uu, Sv.v[0]], [uu, Sv.v[1]]] : [[uu, Sv.v[1]], [uu, Sv.v[0]]];
    const f = face(P(...a), P(...b), nx, 0);
    skin(M_, f, Sv.eave - 0.3, J.eave, SEAM, U1);
    D.setColor(EDGE); box(D, f, -0.12, f.L + 0.12, J.eave - 0.16, J.eave + 0.1, 0, 0.14, 'ftulr');
  }

  // roofs: low hips on the sections, flat tops with boiler flues on the cores; collision for every volume
  for (const [k, V] of Object.entries(VOL)) {
    const [u0, u1] = V.u, [v0, v1] = V.v, e = 0.14, y = V.eave + 0.1;
    if (V.sec) {
      const rise = 0.9, um = (u0 + u1) / 2, vm = (v0 + v1) / 2, h = Math.min(u1 - u0, v1 - v0) / 2;
      const c = [[u0 - e, v0 - e], [u1 + e, v0 - e], [u1 + e, v1 + e], [u0 - e, v1 + e]].map(([u, v]) => { const q = P(u, v); return [q[0], y, q[1]]; });
      const ra = P(um - (u1 - u0) / 2 + h, vm), rb = P(um + (u1 - u0) / 2 - h, vm);
      const RA = [ra[0], y + rise, ra[1]], RB = [rb[0], y + rise, rb[1]];
      M_.setColor('#3e4246');
      M_.face([c[0], c[1], RB, RA], [0, 0.98, -0.2]); M_.face([c[2], c[3], RA, RB], [0, 0.98, 0.2]);
      M_.face([c[1], c[2], RB], [0.2, 0.98, 0]); M_.face([c[3], c[0], RA], [-0.2, 0.98, 0]);
    } else {
      D.setColor('#4b4f53'); D.fill([[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => P(u, v)), [], y - 0.02, true);
      // two steel flues, a cap on each
      for (const [fu, fv] of [[u0 + 1.0, v0 + 2.2], [u1 - 1.0, v1 - 2.6]]) {
        const [x, z] = P(fu, fv);
        D.setColor('#a3a7aa'); D.cyl(x, y, z, 0.13, 0.13, 1.5, 8, false);
        D.setColor('#7e8285'); D.cyl(x, y + 1.5, z, 0.22, 0.05, 0.25, 8, true);
      }
    }
    const pr = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].flatMap(([u, v]) => P(u, v));
    // the street section stands on the car port's columns: its solid starts at the slab's underside
    S.prism(pr, k === 'A' ? V.yF - 0.4 : V.gLo - 0.6, V.eave + 0.3, 0, 0, 'wall');
  }

  // the car port under the street section: the slab's underside, the closed sides in grey render, the columns
  {
    const A = VOL.A, yc = A.yF - 0.4, gb = A.gLo - 0.5;
    D.setColor('#45484b');
    const c = [[0, 0.3], [10.4, 0.3], [10.4, 10.2], [0, 10.2]].map(([u, v]) => { const q = P(u, v); return [q[0], yc, q[1]]; });
    D.face(c, [0, -1, 0]);
    D.setColor('#5a5d60');
    const back = face(P(0, 0.3), P(10.4, 0.3), 0, 1); rect(D, back, 0, back.L, gb, yc);
    const side = face(P(10.4, 0.3), P(10.4, 10.2), -1, 0); rect(D, side, 0, side.L, gb, yc);
    solid(S, face(P(0, 0), P(10.4, 0), 0, -1), 0, 10.4, -0.3, 0, gb, yc);
    D.setColor('#4a4d50');
    for (const [cu, cv] of [[0.35, 5.0], [0.35, 9.85], [5.2, 9.85]]) {
      const [x, z] = P(cu, cv);
      D.box(x - 0.15, gb, z - 0.15, x + 0.15, yc, z + 0.15, 51);
      S.box(x - 0.15, gb, z - 0.15, x + 0.15, yc, z + 0.15, 'pole');
    }
  }

  // a black steel canopy on two posts over a yard door
  function canopy(f, s0, s1, d, y0, gB) {
    const y1 = y0 + 0.16;
    D.setColor('#1f2124'); box(D, f, s0, s1, y0, y1, 0, d, 'ftlru');
    for (const s of [s0 + 0.12, s1 - 0.12]) {
      box(D, f, s - 0.04, s + 0.04, gB, y0, d - 0.16, d - 0.08, 'flrb');
      const p = at(f, s, 0, d - 0.12); S.cyl(p[0], p[2], gB, y0, 0.06, 0.06, 'pole');
    }
    solid(S, f, s0, s1, 0, d, y0, y1, 'awning', 1);
  }

  // the yard fence from the first core to the lot's edge, facing the street: black grid panels between square posts,
  // the sliding gate in the run (the car port and the forecourt in front of it stay open to the street)
  {
    const fz = face(P(FENCE_U, FENCE_V[1]), P(FENCE_U, FENCE_V[0]), -1, 0), L = fz.L, gs = [FENCE_V[1] - GATE_V[1], FENCE_V[1] - GATE_V[0]];
    const posts = [0, gs[0], gs[1], L - 0.3, ...Array.from({ length: Math.floor(gs[0] / 2.4) }, (_, i) => (i + 1) * gs[0] / (Math.floor(gs[0] / 2.4) + 1))];
    let gF = Infinity;
    for (const s of [0, L / 2, L]) { const m = at(fz, s, 0); gF = Math.min(gF, heightAt(m[0], m[2])); }
    const top = gF + 1.95;
    for (const s of posts) { D.setColor('#1a1c1f'); box(D, fz, s - 0.06, s + 0.06, gF - 0.3, top + 0.05, -0.06, 0.06, 'fblrt'); }
    B.fence.setColor('#ffffff');
    rect(B.fence, fz, 0.06, L - 0.36, gF + 0.06, top, 0, [1, top - gF]);
    solid(S, fz, 0, L - 0.3, -0.08, 0.08, gF - 0.3, top);
  }

  const M = {
    brick: new THREE.MeshStandardMaterial({ map: brickTex(r), vertexColors: true, roughness: 0.92 }),
    seam: new THREE.MeshStandardMaterial({ map: seamTex(), vertexColors: true, roughness: 0.45, metalness: 0.45 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.4 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3, emissive: 0xffd6a0, emissiveIntensity: 0 }),
    fence: new THREE.MeshStandardMaterial({ map: fenceTex(), vertexColors: true, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 }),
  };
  const out = finish(root, 'nadpilna249', B, M, { shade: ['brick', 'seam', 'det'] });
  const top = Math.max(...Object.values(VOL).map((V) => V.eave));
  console.log(`[cherkasy] Nadpilna 249: ${nWin} windows, floors ${['A', 'B', 'C'].map((k) => VOL[k].yF.toFixed(1)).join(' / ')} m, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  const [cx0, cz0] = P(-1, -1.5), [cx1, cz1] = P(40.5, 21.3);
  return {
    footprints: [{ poly: ring, h: top - gLo, kind: 'apt', name: 'Новобудова · вул. Надпільна, 249' }],
    clear: (x, z) => x > cx0 && x < cx1 && z > cz0 && z < cz1,
    update() { M.lit.emissiveIntensity = 1.1 * nightK.value; },
  };
}
