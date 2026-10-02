// OWNER: cherkasy. Supermarket «Делікат», бульвар Шевченка 399/2 (OSM way 399652294; a Novus until the early 2020s),
// rebuilt on a player's idea (issue #27). OSM infers 9 storeys for it; it is a one-storey big box some 7.5 m high
// set back from the boulevard behind its car park: walls of light grey vertical-rib profiled sheet over a dark plinth,
// a deep smooth taupe composite band round the top, a flat roof with a few air handlers. The shop front is the
// boulevard side: the north end of it steps out 1.8 m as the entrance block, glazed the whole width under a flat
// cantilever canopy, the «Делікат» lettering on a dark brown sign box on the band above it; a few lit shop windows
// run on along the rest of the front. The end toward its neighbour (the glass rotunda, glassrotunda.js) is plain
// rib behind a row of thujas; the back has the service doors and a loading-dock canopy.
// References: the OSM footprint and tags, the Esri satellite view (the flat roof, the car park in front), and the
// neighbour's published photos, which show this box's ribbed sheet and taupe band behind its thujas.
//   DELIKAT399_SKIP: the OSM id replaced here (buildings.js skips it); PEEK_SKIP: the neighbour the peek leaves out
//   buildDelikat399({ root, map, solids, zips, heightAt, ground }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per ring edge with bldkit.js; -x faces the boulevard, -z the rotunda, +z the lane to the north.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { ringPts, rng, area2 } from './geo.js';
import { edgeFaces, pt, panel, fbox, wall, win, facing, decal, mats, finish } from './bldkit.js';
import { signTex } from './delikat.js';

const OSM_ID = 399652294;
export const DELIKAT399_SKIP = new Set([OSM_ID]);
// the rotunda next door: OSM infers 9 storeys for it, so the phone peek (which drops every *_SKIP id) leaves it out
// rather than raise a white tower beside this model; the game builds it in its own module
export const PEEK_SKIP = new Set([418579439]);

const LIFT = 0.25, PL = 0.45, RIB1 = 4.6, TOP = 7.4, CAP = 0.12;   // floor over grade, plinth, rib top, band top, coping
const GL1 = 3.5, CAN0 = 3.75, CAN1 = 4.0, CAND = 2.4;              // entrance glazing top, canopy slab, its depth
const RIB = '#b7babb', TAUPE = '#94806a', PLINTH = '#3e3f41', GRAPH = '#2e3134', BROWN = '#4a2f26', CAPC = '#7f6e5c';

// profiled sheet: four ribs per metre, lit edge / shadow edge; the vertex colour gives the grey
const ribTex = () => canvasTex(128, 32, (g, w, h) => {
  g.fillStyle = '#dedede'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) {
    const x = i * w / 4 + 6;
    g.fillStyle = '#f7f7f7'; g.fillRect(x, 0, 5, h);
    g.fillStyle = '#ececec'; g.fillRect(x + 5, 0, 8, h);
    g.fillStyle = '#9d9d9d'; g.fillRect(x + 13, 0, 4, h);
  }
});
// smooth composite cassettes, 3 x 1.4 m, hairline joints
const bandTex = () => canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#f2f0ec'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#8e8a84'; g.fillRect(w / 2, 0, 3, h); g.fillRect(0, h / 2, w, 3);
});

export function buildDelikat399({ root, map, solids: S, zips: Z, heightAt: hfAt, ground }) {
  // the ground as drawn (roads and lots shaped), so what stands on it meets it; the bare height field in the peek
  const heightAt = ground?.terrainHeight ?? hfAt;
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const ring = ringPts(bld.p);
  let gLo = Infinity, gHi = -Infinity;
  for (const [x, z] of ring) { const h = heightAt(x, z); gLo = Math.min(gLo, h); gHi = Math.max(gHi, h); }
  const yF = gHi + LIFT, gB = gLo - 0.6, Y = (h) => yF + h;
  const B = { wall: new MB(), band: new MB(), det: new MB(), glass: new MB(), lit: new MB(), sign: new MB() };
  const D = B.det;
  let nWin = 0;
  const prismOf = (f, s0, s1, o0, o1) => { const Q = [[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; }); return (area2(Q) < 0 ? Q.reverse() : Q).flat(); };

  const faces = edgeFaces(ring);
  const fronts = faces.filter((f) => f.nx < -0.7 && f.L > 3);
  const midZ = (f) => pt(f, f.L / 2, 0)[2];
  const entry = fronts.filter((f) => f.L > 15).reduce((a, f) => (!a || midZ(f) > midZ(a) ? f : a), null); // the north (entrance) block
  const shop = fronts.filter((f) => f !== entry).reduce((a, f) => (f.L > (a?.L ?? 0) ? f : a), null);
  const back = faces.find((f) => f.nx > 0.7 && f.L > 20);
  const south = faces.find((f) => f.nz < -0.7 && f.L > 10);

  for (const f of faces) {
    const holes = [];
    if (f === entry) { // the entrance block: glazed edge to edge bar the corners, the doors in the middle bays
      const n = Math.max(2, Math.round((f.L - 2) / 4.5)), p = (f.L - 2) / n;
      for (let i = 0; i < n; i++) {
        const a = 1 + i * p + 0.12, b = 1 + (i + 1) * p - 0.12, door = Math.abs(i - (n - 1) / 2) < 1;
        holes.push({ s0: a, s1: b, y0: Y(door ? 0.02 : PL), y1: Y(GL1), cols: Math.round((b - a) / 1.5), rows: door ? 2 : 1, rev: GRAPH, glass: '#7a8085', lit: true, dep: 0.2 });
      }
    } else if (f === shop) { // shop windows by the entrance end, the rest blind rib
      const near = pt(f, f.L, 0)[2] > f.az ? f.L : 0, dir = near ? -1 : 1; // the north end, by the entrance
      for (let i = 0; i < 4; i++) {
        const m = near + dir * (3.5 + i * 4.5);
        holes.push({ s0: m - 1.5, s1: m + 1.5, y0: Y(0.9), y1: Y(3.2), cols: 2, rows: 1, rev: GRAPH, glass: '#6e7377', lit: true, dep: 0.15 });
      }
    } else if (f === back) { // service doors, a high strip of windows over the stock room
      for (const s of [f.L * 0.18, f.L * 0.72]) holes.push({ s0: s - 1.6, s1: s + 1.6, y0: Y(0.02), y1: Y(3.4), cols: 1, rows: 3, rev: GRAPH, glass: '#6c7072', dep: 0.1 });
      for (const s of [f.L * 0.42, f.L * 0.5, f.L * 0.58]) holes.push({ s0: s - 0.9, s1: s + 0.9, y0: Y(2.6), y1: Y(3.6), cols: 2, rev: GRAPH, glass: '#cfd3d4', lit: r() < 0.5 });
      { const s = f.L * 0.88; holes.push({ s0: s - 0.5, s1: s + 0.5, y0: Y(0.02), y1: Y(2.2), cols: 1, rows: 2, rev: GRAPH, glass: '#3a3d40', dep: 0.08 }); }
    }
    B.wall.setColor(RIB); wall(B.wall, f, Y(PL), Y(RIB1), holes.filter((q) => q.y1 > Y(PL)), [1, 4]);
    for (const q of holes) { win(B, f, q); nWin++; }
    // the plinth, broken by the openings that reach the floor
    D.setColor(PLINTH);
    let s = 0;
    for (const q of [...holes.filter((h) => h.y0 < Y(PL)).sort((a, b) => a.s0 - b.s0), { s0: f.L, s1: f.L }]) {
      if (q.s0 > s + 1e-3) fbox(D, f, s, q.s0, gB, Y(PL), 0, 0.04, 'ftlr');
      s = Math.max(s, q.s1);
    }
    for (const q of holes) if (q.y0 < Y(PL)) fbox(D, f, q.s0, q.s1, gB, q.y0, 0, 0.02, 'f');
    // the band: proud of the rib, a drip under it, the coping on top
    B.band.setColor(TAUPE); panel(B.band, f, -0.1, f.L + 0.1, Y(RIB1), Y(TOP), 0.1, [3, 1.4]);
    D.setColor('#6d5f50'); fbox(D, f, -0.1, f.L + 0.1, Y(RIB1) - 0.04, Y(RIB1), 0, 0.12, 'ftu');
    D.setColor(CAPC); fbox(D, f, -0.12, f.L + 0.12, Y(TOP), Y(TOP + CAP), -0.25, 0.14, 'ft');
    const p0 = pt(f, 0, 0, 0.14), p1 = pt(f, f.L, 0, 0.14); Z.edge(p0[0], p0[2], p1[0], p1[2], Y(TOP + CAP), f.nx, f.nz);
    // a smooth pilaster at the corners of the long sides
    if (f.L > 15) for (const s0 of [0, f.L - 1.2]) { B.band.setColor('#a39886'); fbox(B.band, f, s0, s0 + 1.2, Y(PL), Y(RIB1), 0, 0.08, 'flr'); }
  }
  D.setColor('#8f9294'); D.fill(ring, [], Y(TOP - 0.2), true);
  // roof kit: air handlers in a row, a vent hood over the bakery
  {
    const f = back;
    for (const [ds, dd, w] of [[0.25, 6, 2.8], [0.4, 6, 2.8], [0.55, 6, 2.8], [0.75, 12, 1.6]]) {
      const [x, , z] = pt(f, f.L * ds, 0, -dd);
      D.setColor('#c7c9c6'); D.box(x - w / 2, Y(TOP - 0.2), z - 1, x + w / 2, Y(TOP + 1.2), z + 1, 1 | 2 | 4 | 16 | 32);
    }
    const [x, , z] = pt(f, f.L * 0.85, 0, -15);
    D.setColor('#9a9c9c'); D.cyl(x, Y(TOP - 0.2), z, 0.35, 0.35, 2.2, 8, true);
  }

  // ---- the entrance: canopy slab over the glazing, the sign box on the band, two parcel lockers, bike hoops
  if (entry) {
    const f = entry;
    B.band.setColor(GRAPH); fbox(B.band, f, 0, f.L, Y(CAN0), Y(CAN1), 0, CAND, 'flrtu');
    D.setColor('#f0eee8'); fbox(D, f, 0.1, f.L - 0.1, Y(CAN0) - 0.01, Y(CAN0), 0, CAND - 0.1, 'u');
    S.prism(prismOf(f, 0, f.L, 0, CAND), Y(CAN0), Y(CAN1), 0, 0, 'awning', 1);
    // the paved step along the front, a ramp at the south end
    const pg = pt(f, f.L / 2, 0, CAND + 1), g = Math.min(heightAt(pg[0], pg[2]), Y(-0.05));
    D.setColor('#8f8a84'); fbox(D, f, 0, f.L, gB, yF, 0, CAND, 'ftlr');
    D.setColor('#a39d95'); fbox(D, f, 0, f.L, gB, (yF + g) / 2, CAND, CAND + 0.35, 'ftlr');
    S.prism(prismOf(f, 0, f.L, 0, CAND), gB, yF, 0, 0, 'step');
    // the sign: a dark brown box on the band, the lettering on it
    const m = f.L / 2, w = Math.min(14, f.L - 3), h = 2.0, y0 = Y((RIB1 + TOP) / 2 - h / 2);
    D.setColor(BROWN); fbox(D, f, m - w / 2, m + w / 2, y0, y0 + h, 0.1, 0.32, 'flrtu');
    decal(B.sign, f, m - w / 2 + 0.6, m + w / 2 - 0.6, y0 + 0.1, y0 + h - 0.1, 0.34, [0, 0, 1, 1]);
    // parcel lockers by the north end of the glazing, bike hoops by the south
    const lk = facing(f) > 0 ? f.L - 1.6 : 1.6;
    D.setColor('#d22a2a'); fbox(D, f, lk - 0.9, lk + 0.9, yF, Y(2.0), 0.1, 0.7, 'flrt');
    D.setColor('#e9e9e9'); fbox(D, f, lk - 0.8, lk + 0.8, Y(0.3), Y(1.9), 0.7, 0.72, 'f');
    S.prism(prismOf(f, lk - 0.9, lk + 0.9, 0.1, 0.7), yF, Y(2.0), 0, 0, 'wall');
    D.setColor('#55595c');
    for (let i = 0; i < 4; i++) {
      const s = (facing(f) > 0 ? 1.5 : f.L - 1.5) + (facing(f) > 0 ? 1 : -1) * i * 0.8, a = pt(f, s - 0.25, g, CAND + 1.2), b = pt(f, s + 0.25, g, CAND + 1.2);
      D.tube(a, [a[0], g + 0.8, a[2]], 0.025, 4); D.tube([a[0], g + 0.8, a[2]], [b[0], g + 0.8, b[2]], 0.025, 4); D.tube([b[0], g + 0.8, b[2]], b, 0.025, 4);
    }
  }
  // ---- the back: a loading-dock canopy over the north service door
  if (back) {
    const f = back, s = f.L * 0.72;
    D.setColor(GRAPH); fbox(D, f, s - 3, s + 3, Y(3.7), Y(3.9), 0, 3, 'ftlru');
    S.prism(prismOf(f, s - 3, s + 3, 0, 3), Y(3.7), Y(3.9), 0, 0, 'awning', 1);
    D.setColor('#4c4f52'); fbox(D, f, s - 2.5, s + 2.5, gB, Y(0.02), 0, 2.5, 'ftlr');
    S.prism(prismOf(f, s - 2.5, s + 2.5, 0, 2.5), gB, Y(0.02), 0, 0, 'step');
  }
  // ---- the row of thujas along the south end, toward the rotunda
  if (south) {
    const f = south;
    for (let s = 1.2; s < f.L - 1; s += 1.3) {
      const [x, , z] = pt(f, s, 0, 1.4), g = heightAt(x, z), h = 2.6 + r() * 0.8;
      D.setColor(r() < 0.5 ? '#2f4a2a' : '#365430'); D.cyl(x, g, z, 0.42, 0.02, h, 7, false);
    }
    const a = pt(f, 0.5, 0, 2.3), b = pt(f, f.L - 0.5, 0, 2.3); // the low black fence before them
    D.setColor('#1f2224');
    for (const y of [0.15, 1.1]) { const ga = heightAt(a[0], a[2]), gb = heightAt(b[0], b[2]); D.tube([a[0], ga + y, a[2]], [b[0], gb + y, b[2]], 0.02, 4); }
    for (let s = 0.5; s <= f.L - 0.5; s += 0.6) { const p = pt(f, s, 0, 2.3), gp = heightAt(p[0], p[2]); D.box(p[0] - 0.01, gp + 0.1, p[2] - 0.01, p[0] + 0.01, gp + 1.15, p[2] + 0.01, 1 | 2 | 4 | 8 | 16 | 32); }
  }

  // ---- collision: the box to the coping
  S.prism((area2(ring) < 0 ? ring.slice().reverse() : ring).flat(), gB, Y(TOP + CAP), 0, 0, 'wall');

  // ---- meshes
  const sign = signTex();
  const M = mats({
    wall: new THREE.MeshStandardMaterial({ map: ribTex(), vertexColors: true, roughness: 0.5, metalness: 0.35 }),
    band: new THREE.MeshStandardMaterial({ map: bandTex(), vertexColors: true, roughness: 0.45, metalness: 0.2 }),
    sign: new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0, alphaTest: 0.4, roughness: 0.35, metalness: 0.3 }),
  });
  const out = finish(root, 'delikat399', B, M, ['wall', 'band', 'det']);
  console.log(`[cherkasy] Delikat 399/2: ${nWin} openings, floor ${yF.toFixed(1)} m, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return {
    footprints: [{ poly: ring, h: Y(TOP) - gLo, kind: bld.k, name: 'Делікат' }],
    clear: (x, z) => x > x0 - CAND - 2 && x < x1 + 4 && z > z0 - 3 && z < z1 + 2,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.8 * k; M.sign.emissiveIntensity = 0.06 + 0.9 * k; },
  };
}
