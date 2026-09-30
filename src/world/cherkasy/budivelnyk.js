// OWNER: cherkasy. Палац спорту «Будівельник», проспект Хіміків, 50/1 (OSM way 132429678, roof:shape round): the 1979
// sports palace rebuilt after the Wikimedia Commons photo (2010), the mixsport.pro and edusearch photos and the satellite
// view. A concrete shell vault of about 46 m span runs the building's 87 m length on low cream walls; each short end is a
// segmental arch outlined by the white edge of the shell and glazed from the plinth to the arch in white mullions. Along
// the front (the north-east end, over the car park) runs a cream one-storey plinth with the pale-yellow entrance box in
// the middle (the OSM bump), glass doors and the blue «ПАЛАЦ СПОРТУ» sign over them, a terrace with steps along the whole
// front. The long sides carry a high ribbon of windows. The glazed ends and the ribbon light up at night.
//   BUD_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildBudivelnyk({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// The OSM ring is axis-aligned in map metres: the vault axis runs along x (north-east), the span along z. Walls are
// laid per ring edge with bldkit.js; the vault and the gable glazing are built from the arch profile a(z).
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { ringPts, rng } from './geo.js';
import { edgeFaces, pt, quad, panel, fbox, wall, win, row, decal, mats, finish } from './bldkit.js';

const OSM_ID = 132429678;
export const BUD_SKIP = new Set([OSM_ID]);

const SPRING = 5.2, RISE = 10.2, OVER = 0.6;  // shell springing over the floor, rise at the crown, overhang past the ends
const CREAM = '#ece2c6', YELLOW = '#efe0a4', WHITE = '#f4f3ef', STONE = '#b9b4aa', ROOF = '#4f5357';

// the sign: blue «ПАЛАЦ» over a rounded blue plate with white «СПОРТУ», outlined in white as on the building
const signTex = () => canvasTex(1024, 512, (g) => {
  g.clearRect(0, 0, 1024, 512);
  g.lineJoin = 'round'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = 'italic bold 118px Arial, Helvetica, sans-serif';
  g.strokeStyle = '#ffffff'; g.lineWidth = 16; g.strokeText('ПАЛАЦ', 560, 150);
  g.fillStyle = '#1d5fb8'; g.fillText('ПАЛАЦ', 560, 150);
  g.beginPath(); g.moveTo(60, 190); g.lineTo(990, 170); g.quadraticCurveTo(1010, 330, 960, 470); g.lineTo(90, 480); g.quadraticCurveTo(20, 330, 60, 190); g.closePath();
  g.fillStyle = '#ffffff'; g.fill();
  g.save(); g.translate(512, 330); g.scale(0.965, 0.93); g.translate(-512, -330); g.fillStyle = '#1f6fd0'; g.fill(); g.restore();
  g.font = 'italic bold 230px Arial, Helvetica, sans-serif'; g.fillStyle = '#ffffff'; g.fillText('СПОРТУ', 520, 420, 860);
}, { repeat: false, aniso: 16 });
// long seams of the roof membrane, 1.5 m apart
const roofTex = () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, 0, 4, h);
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(4, 0, 2, h);
});

export function buildBudivelnyk({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const ring = ringPts(bld.p);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, gLo = Infinity, gHi = -Infinity;
  for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); const h = heightAt(x, z); gLo = Math.min(gLo, h); gHi = Math.max(gHi, h); }
  const xF = x1 - 1.8, xW = x0; // the gable walls: the front behind the entrance box, the back end
  const yF = gHi + 0.45, gB = gLo - 0.6, Y = (h) => yF + h, yS = Y(SPRING);
  const zc = (z0 + z1) / 2, hw = (z1 - z0) / 2, R = (hw * hw + RISE * RISE) / (2 * RISE), yC = yS + RISE - R;
  const arc = (z) => yC + Math.sqrt(Math.max(0, R * R - (z - zc) ** 2)); // the shell's top over z (on the span)

  const B = { wall: new MB(), det: new MB(), roof: new MB(), glass: new MB(), lit: new MB(), sign: new MB() };
  const D = B.det;
  let nWin = 0;

  // ---- the long sides up to the springing (the ends are built below, as gables)
  for (const f of edgeFaces(ring)) {
    const along = Math.abs(f.ux) > 0.7; // long sides run along x
    if (!along) continue;
    const holes = [];
    if (along && f.L > 20) { // long sides: a ribbon of hall windows under the eaves, a few doors
      for (const q of row(f, 3, f.L - 3, 3.0, 2.5, Y(2.9), Y(4.4), { cols: 2, rev: WHITE, lit: r() < 0.5 })) holes.push(q);
      holes.push({ s0: f.L * 0.3 - 0.9, s1: f.L * 0.3 + 0.9, y0: Y(0), y1: Y(2.3), cols: 2, rows: 2, rev: STONE, glass: '#b8c4c8', dep: 0.12 });
    }
    B.wall.setColor(CREAM);
    wall(B.wall, f, gB, yS, holes, [2.5, 2.5]);
    for (const q of holes) { win(B, f, q); nWin++; }
    D.setColor(STONE); fbox(D, f, 0, f.L, gB, yF - 0.05, 0, 0.08, 'ft'); // the grey plinth course
    D.setColor(WHITE); fbox(D, f, -0.3, f.L + 0.3, yS - 0.45, yS, 0, 0.35, 'ftu'); // the white eaves band the shell sits on
    const a = pt(f, 0, 0, 0.3), b = pt(f, f.L, 0, 0.3); Z.edge(a[0], a[2], b[0], b[2], yS, f.nx, f.nz);
  }

  // ---- the vault: a segmental shell from end to end, white edge bands round both arches
  const N = 24, xa = xW - OVER, xb = xF + OVER;
  const zs = Array.from({ length: N + 1 }, (_, i) => z0 + (z1 - z0) * i / N);
  let acc = 0;
  const us = zs.map((z, i) => (i ? (acc += Math.hypot(z - zs[i - 1], arc(z) - arc(zs[i - 1]))) : 0));
  B.roof.setColor(ROOF);
  for (let i = 0; i < N; i++) {
    const za = zs[i], zb = zs[i + 1], ya = arc(za), yb = arc(zb), zm = (za + zb) / 2;
    const nz = (zm - zc) / R, ny = Math.sqrt(Math.max(0, 1 - nz * nz));
    quad(B.roof, [xa, ya, za], [xb, ya, za], [xb, yb, zb], [xa, yb, zb], [0, ny, nz], [[us[i] / 1.5, xa / 12], [us[i] / 1.5, xb / 12], [us[i + 1] / 1.5, xb / 12], [us[i + 1] / 1.5, xa / 12]]);
    D.setColor('#9a9c9c'); // the shell's soffit under the overhangs
    for (const [p, q] of [[xa, xW], [xF, xb]]) quad(D, [p, ya - 0.35, za], [q, ya - 0.35, za], [q, yb - 0.35, zb], [p, yb - 0.35, zb], [0, -ny, -nz]);
    D.setColor(WHITE); // the edge band: face and underside at both ends
    for (const [x, sx] of [[xa, -1], [xb, 1]]) {
      quad(D, [x, ya - 0.9, za], [x, ya + 0.05, za], [x, yb + 0.05, zb], [x, yb - 0.9, zb], [sx, 0, 0]);
      quad(D, [x, ya - 0.9, za], [x - sx * 0.8, ya - 0.9, za], [x - sx * 0.8, yb - 0.9, zb], [x, yb - 0.9, zb], [0, -1, 0]);
    }
  }
  // the band runs on down past the springing to the plinth at the four corners, as in the photo
  D.setColor(WHITE);
  for (const [x, sx] of [[xa, 1], [xb, -1]]) for (const [z, sz] of [[z0, 1], [z1, -1]]) {
    const xi = x + sx * 0.8, zi = z + sz * 0.9;
    D.box(Math.min(x, xi), Y(3.6), Math.min(z, zi), Math.max(x, xi), yS + 0.05, Math.max(z, zi));
  }

  // ---- gable ends: the glazing from the plinth to the arch, white mullions every ~4 m and two transoms
  const gable = (x, sx) => {
    const n = [sx, 0, 0], bays = 11, zA = z0 + 0.6, zB = z1 - 0.6, yG0 = yS + 0.05;
    B.lit.setColor('#dfe6e8');
    for (let i = 0; i < bays; i++) {
      const za = zA + (zB - zA) * i / bays, zb = zA + (zB - zA) * (i + 1) / bays, ya = arc(za) - 0.9, yb = arc(zb) - 0.9;
      const u = (zb - za) / 1.3, hv = (ya - yG0) / 1.6, hw2 = (yb - yG0) / 1.6;
      quad(B.lit, [x, yG0, za], [x, yG0, zb], [x, yb, zb], [x, ya, za], n, sx > 0 ? [[0, 0], [u, 0], [u, hw2], [0, hv]] : [[u, 0], [0, 0], [0, hw2], [u, hv]]);
      D.setColor(WHITE); // the mullion at the bay's start (the last one closes the run)
      for (const zm of i === bays - 1 ? [za, zb] : [za]) D.box(x - 0.2, yG0, zm - 0.14, x + 0.2, arc(zm) - 0.85, zm + 0.14);
    }
    for (const t of [3.3, 6.9]) { // transoms where they fit under the arch
      const yt = yS + t, dz = Math.sqrt(Math.max(0, R * R - (yt + 0.9 - yC) ** 2));
      if (dz > 1) D.box(x - 0.18, yt - 0.1, Math.max(zA, zc - dz), x + 0.18, yt + 0.1, Math.min(zB, zc + dz));
    }
    D.setColor(CREAM); // the wall between the glazing and the plinth top, and the arch's feet
    quad(D, [x, yS - 0.6, z0], [x, yS - 0.6, z1], [x, yS + 0.05, z1], [x, yS + 0.05, z0], n);
    for (const [za, zb] of [[z0, zA], [zB, z1]]) quad(D, [x, yS, za], [x, yS, zb], [x, arc(zb) - 0.9, zb], [x, arc(za) - 0.9, za], n);
  };
  gable(xF, 1); gable(xW, -1);
  // the shell's inside seen through the glass: a dark soffit a little behind the glazing
  D.setColor('#3e4246');
  for (const [x, sx] of [[xF - 1.2, -1], [xW + 1.2, 1]]) for (let i = 0; i < N; i++) quad(D, [x, yS - 0.6, zs[i]], [x, yS - 0.6, zs[i + 1]], [x, arc(zs[i + 1]) - 1, zs[i + 1]], [x, arc(zs[i]) - 1, zs[i]], [sx, 0, 0]);

  // ---- the front: the plinth wall under the glazing, the entrance box, the sign, the terrace and steps
  const fF = { ax: xF, az: z1, ux: 0, uz: -1, nx: 1, nz: 0, L: z1 - z0 };
  const eb = ring.filter(([x]) => x > xF + 0.5).map(([, z]) => z), eS0 = z1 - Math.max(...eb), eS1 = z1 - Math.min(...eb); // the bump's s-range
  const fr = [{ s0: eS0, s1: eS1, y0: Y(0), y1: Y(4.2) }];
  for (const q of row(fF, 2, eS0 - 2, 5.2, 2.2, Y(1.2), Y(3.6), { cols: 2, rev: WHITE, lit: r() < 0.4 })) fr.push(q);
  for (const q of row(fF, eS1 + 2, fF.L - 2, 5.2, 2.2, Y(1.2), Y(3.6), { cols: 2, rev: WHITE, lit: r() < 0.4 })) fr.push(q);
  B.wall.setColor(CREAM); wall(B.wall, fF, gB, yS - 0.6, fr, [2.5, 2.5]);
  for (const q of fr.slice(1)) { win(B, fF, q); nWin++; }
  const eF = { ax: xF + 1.8, az: z1 - eS0, ux: 0, uz: -1, nx: 1, nz: 0, L: eS1 - eS0 }, eL = eF.L;
  B.wall.setColor(YELLOW);
  const door = [{ s0: eL / 2 - 2.6, s1: eL / 2 + 2.6, y0: Y(0.05), y1: Y(2.9), cols: 4, rows: 2, rev: '#8f8a7c', glass: '#cfd7da', dep: 0.1 }];
  wall(B.wall, eF, gB, Y(4.6), door, [2.5, 2.5]); win(B, eF, door[0]); nWin++;
  fbox(B.wall, eF, 0, eL, gB, Y(4.6), -1.8, 0, 'lr'); // the box's cheeks
  D.setColor(WHITE); fbox(D, eF, -0.15, eL + 0.15, Y(4.6), Y(4.85), -1.9, 0.15, 'ftlru');
  B.sign.setColor('#ffffff'); decal(B.sign, eF, eL / 2 - 5.2, eL / 2 + 5.2, Y(3.1), Y(8.3), 0.35, [0, 0, 1, 1]);
  // terrace in grey slabs the width of the front, three steps down to the car park
  const tz0 = z0 + 1.5, tz1 = z1 - 1.5, tx1 = xF + 1.8 + 3.2, gFront = Math.min(heightAt(tx1 + 3, zc), yF - 0.2);
  D.setColor('#a9a59c'); D.box(xF, gB, tz0, tx1, yF, tz1, 1 | 4 | 16 | 32);
  S.prism([xF, tz0, tx1, tz0, tx1, tz1, xF, tz1], gB, yF, 0, 0, 'step');
  const nSt = Math.ceil((yF - gFront) / 0.17);
  for (let i = 1; i < nSt; i++) {
    const top = yF - i * (yF - gFront) / nSt, xs = tx1 + (i - 1) * 0.32;
    D.setColor(i & 1 ? '#b3afa6' : '#a9a59c'); D.box(xs, gB, tz0 + 2, xs + 0.32, top, tz1 - 2, 1 | 4 | 16 | 32);
    S.prism([xs, tz0 + 2, xs + 0.32, tz0 + 2, xs + 0.32, tz1 - 2, xs, tz1 - 2], gB, top, 0, 0, 'step');
  }
  // benches along the terrace edge
  D.setColor('#8b6a4a');
  for (let z = tz0 + 3; z < tz1 - 3; z += 7) if (Math.abs(z - zc) > 7) { D.box(tx1 - 0.9, yF, z, tx1 - 0.4, yF + 0.45, z + 2.2); S.box(tx1 - 0.9, yF, z, tx1 - 0.4, yF + 0.45, z + 2.2, 'bench'); }
  // the back end: plinth wall under the glazing, a service door
  const fW = { ax: xW, az: z0, ux: 0, uz: 1, nx: -1, nz: 0, L: z1 - z0 };
  const bd = [{ s0: fW.L / 2 - 1.5, s1: fW.L / 2 + 1.5, y0: Y(0), y1: Y(2.6), cols: 2, rows: 2, rev: STONE, glass: '#a9b5ba', dep: 0.12 }];
  B.wall.setColor(CREAM); wall(B.wall, fW, gB, yS - 0.6, bd, [2.5, 2.5]); win(B, fW, bd[0]); nWin++;

  // ---- collision: the walls to the springing, the vault as stepped slices across the span
  S.prism(ring.flat(), gB, yS, 0, 0, 'wall');
  const NS = 8;
  for (let i = 0; i < NS; i++) {
    const za = z0 + (z1 - z0) * i / NS, zb = z0 + (z1 - z0) * (i + 1) / NS;
    S.prism([xW, za, xF, za, xF, zb, xW, zb], yS, Math.min(arc(za), arc(zb)) + 0.1, 0, 0, 'roof');
  }

  // ---- meshes
  const sign = signTex();
  const M = mats({
    roof: new THREE.MeshStandardMaterial({ map: roofTex(), vertexColors: true, roughness: 0.75, metalness: 0.1 }),
    sign: new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0, alphaTest: 0.4, roughness: 0.4 }),
  });
  M.lit.color.set(0xffffff);
  const out = finish(root, 'budivelnyk', B, M, ['wall', 'det', 'roof']);
  console.log(`[cherkasy] Budivelnyk: ${nWin} openings, span ${(2 * hw).toFixed(1)} m, crown ${(yS + RISE - yF).toFixed(1)} m, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    footprints: [{ poly: ring, h: yS + RISE - gLo, kind: bld.k, name: 'Палац спорту «Будівельник»' }],
    clear: (x, z) => x > x0 - 3 && x < tx1 + 3 && z > z0 - 3 && z < z1 + 3,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.55 * k; M.sign.emissiveIntensity = 0.6 * k; },
  };
}
