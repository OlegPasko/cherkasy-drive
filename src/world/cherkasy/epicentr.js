// OWNER: cherkasy. Гіпермаркет «Епіцентр К», проспект Перемоги, 29 (OSM way 117860219), rebuilt after the Wikimedia
// Commons photo (2010), the u-misti.cherkasy.ua photo and the satellite view. One big shed of about 96 x 200 m with a
// lower wing at its north-west end reaching out over the car park. The fronts over the car park (north-east, and the
// wing's south-east side) are clad in the chain's vertical navy / white sandwich-panel stripes over an orange-red band,
// with a long canopy on posts over the walk, glazed entrances and the stepped orange chevron over the main doors. On
// the roof stand the blue «ЕПІЦЕНТР» letters with the circle-and-triangle logo on a steel truss and the white
// «БУДІВЕЛЬНО-ГОСПОДАРСЬКИЙ ГІПЕРМАРКЕТ» board. The ends keep the stripes; the back (south-west) is plain grey panelling
// with loading docks under a blue canopy. The shop fronts and signs light up at night.
//   EPICENTR_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildEpicentr({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per ring edge with bldkit.js (the ring is axis-aligned in map metres: +x is the front, over the car
// park); the stripes are one tiling texture, so the whole shed stays a few thousand triangles.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { ringPts, rng, inPoly } from './geo.js';
import { edgeFaces, pt, fbox, panel, wall, gaps, win, row, decal, mats, finish } from './bldkit.js';

const OSM_ID = 117860219;
export const EPICENTR_SKIP = new Set([OSM_ID]);

const H = 13.0, BAND0 = 3.3, BAND1 = 4.7, CAN = 4.4, CD = 5.5; // shed height, orange band, canopy height and depth
const NAVY = '#1f3f8f', ORANGE = '#e0512a', GREY = '#c9ccce', POST = '#8d9396';
const STRIPE = 2.8; // metres per navy + white pair

// navy / white panel stripes: 1.6 m navy, 1.2 m white, faint panel joints every 1.2 m up
const stripeTex = () => canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = '#f3f4f2'; g.fillRect(0, 0, w, h);
  g.fillStyle = NAVY; g.fillRect(0, 0, Math.round(w * 1.6 / STRIPE), h);
  g.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = 0; x < w; x += w / 7) g.fillRect(x, 0, 1, h);
});
// sign atlas 2048 x 1024: row 0 the logo and «ЕПІЦЕНТР», row 1 the board, row 2 the chevron (left) and «ВХІД» (right)
const SIGN = { name: [0, 0, 1, 0.3], board: [0, 0.32, 1, 0.5], chev: [0, 0.52, 0.5, 1], vhid: [0.52, 0.62, 1, 0.8] };
const signTex = () => canvasTex(2048, 1024, (g) => {
  g.clearRect(0, 0, 2048, 1024);
  // logo: white disc, navy ring, a navy triangle pointing down with a short stem over it
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(150, 155, 140, 0, Math.PI * 2); g.fill();
  g.strokeStyle = NAVY; g.lineWidth = 22; g.beginPath(); g.arc(150, 155, 118, 0, Math.PI * 2); g.stroke();
  g.fillStyle = NAVY; g.beginPath(); g.moveTo(80, 120); g.lineTo(220, 120); g.lineTo(150, 235); g.closePath(); g.fill();
  g.fillRect(140, 60, 20, 70);
  g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
  g.font = 'bold 250px "Arial Narrow", Arial, Helvetica, sans-serif';
  g.strokeStyle = '#ffffff'; g.lineWidth = 16; g.strokeText('ЕПІЦЕНТР', 330, 262, 1690);
  g.fillStyle = NAVY; g.fillText('ЕПІЦЕНТР', 330, 262, 1690);
  // the board
  g.fillStyle = '#ffffff'; g.fillRect(0, 330, 2048, 180); g.fillStyle = NAVY; g.fillRect(0, 330, 2048, 10); g.fillRect(0, 500, 2048, 10);
  g.textAlign = 'center'; g.font = 'bold 120px "Arial Narrow", Arial, sans-serif';
  g.fillText('БУДІВЕЛЬНО-ГОСПОДАРСЬКИЙ ГІПЕРМАРКЕТ', 1024, 468, 1960);
  // the stepped chevron: orange steps round a navy one
  for (const [col, inset] of [[ORANGE, 0], [NAVY, 70]]) {
    g.fillStyle = col;
    for (let k = 0; k < 6; k++) { const y = 540 + inset + k * 75, half = 80 + k * 80 - inset; g.fillRect(512 - half, y, 2 * half, 1024 - y); }
  }
  g.fillStyle = '#ffffff'; g.fillRect(1064, 635, 984, 185); g.fillStyle = NAVY; g.font = 'bold 130px Arial, sans-serif';
  g.fillText('ВХІД', 1556, 780);
}, { repeat: false, aniso: 16 });

export function buildEpicentr({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const ring = ringPts(bld.p);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, gLo = Infinity, gHi = -Infinity;
  for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const x = x0 + (x1 - x0) * i / 8, z = z0 + (z1 - z0) * j / 8;
    if (!inPoly(ring, x, z)) continue;
    const h = heightAt(x, z); gLo = Math.min(gLo, h); gHi = Math.max(gHi, h);
  }
  for (const [x, z] of ring) { const h = heightAt(x, z); gLo = Math.min(gLo, h); gHi = Math.max(gHi, h); }
  // the shop floor sits on the car park at the front; the plinth takes up the fall elsewhere
  const xFront = ring.filter(([x]) => x < x1 - 20).reduce((m, [x]) => Math.max(m, x), -Infinity); // the shed's front line
  const yF = Math.max(heightAt(xFront + 6, (z0 + z1) / 2), gLo) + 0.35, gB = gLo - 0.8, Y = (h) => yF + h;
  const wing = (x, z) => x > xFront + 1 && z < z0 + 30; // the lower wing out over the car park
  const zWing = ring.filter(([x]) => x > xFront + 1).reduce((m, [, z]) => Math.max(m, z), -Infinity);

  const B = { wall: new MB(), stripe: new MB(), det: new MB(), glass: new MB(), lit: new MB(), sign: new MB() };
  const D = B.det, SUV = [STRIPE, 13];
  let nWin = 0;
  const canopies = []; // [face, s0, s1]

  for (const f of edgeFaces(ring)) {
    const m = pt(f, f.L / 2, 0), inWing = wing(m[0] - f.nx, m[2] - f.nz) || (f.nx > 0.9 && m[0] > xFront + 20);
    const top = Y(H);
    const back = f.nx < -0.9, front = (f.nx > 0.9 && !inWing && f.L > 40) || (f.nz > 0.9 && inWing && f.L > 20);
    const holes = [];
    if (front) {
      // entrances: glazed door sets at the ends and the middle; dark shop glazing in between
      const ents = f.L > 100 ? [0.12, 0.5, 0.86] : [0.5];
      for (const t of ents) { const c = f.L * t, w = t === 0.5 ? 12 : 7; holes.push({ s0: c - w / 2, s1: c + w / 2, y0: Y(0.02), y1: Y(BAND0 - 0.1), cols: Math.round(w / 1.5), rows: 2, rev: GREY, lit: true, glass: '#cfd6d8', dep: 0.12, door: true, c }); }
      for (const q of row(f, 4, f.L - 4, 9, 5.5, Y(0.6), Y(BAND0 - 0.3), { cols: 4, rows: 2, rev: GREY, lit: r() < 0.7, glass: '#7d8a90', dep: 0.1 })) if (!holes.some((h) => q.s0 < h.s1 + 1 && q.s1 > h.s0 - 1)) holes.push(q);
      canopies.push([f, 1, f.L - 1]);
    } else if (back) { // loading docks
      for (const q of row(f, 10, f.L - 10, 14, 3.4, Y(-0.2) , Y(3.8), { cols: 1, rows: 1, rev: GREY, glass: '#4d5357', dep: 0.25 })) holes.push(q);
    }
    // the plinth and the orange band all round, the stripes over it; the back in grey panels under a navy top band
    D.setColor('#9a9d9e'); for (const [a, b] of gaps(f, holes, Y(0.1), Y(0.3))) fbox(D, f, a, b, gB, Y(0.3), 0, 0.05, 'ftlr');
    if (back) {
      B.wall.setColor(GREY); wall(B.wall, f, Y(0.3), top - 1.6, holes.map((h) => ({ ...h, y0: Math.max(h.y0, Y(0.3)) })), [3, 3]);
      B.stripe.setColor(NAVY); panel(B.stripe, f, 0, f.L, top - 1.6, top, 0);
    } else {
      B.wall.setColor(front ? '#9aa1a4' : GREY); wall(B.wall, f, Y(0.3), Y(BAND0), holes, [3, 3]);
      B.wall.setColor(ORANGE); panel(B.wall, f, 0, f.L, Y(BAND0), Y(BAND1), 0, [3, 3]);
      B.stripe.setColor('#ffffff'); panel(B.stripe, f, 0, f.L, Y(BAND1), top, 0, SUV);
    }
    for (const q of holes) { win(B, f, q); nWin++; }
    D.setColor('#dcdedd'); fbox(D, f, -0.1, f.L + 0.1, top, top + 0.25, -0.3, 0.08, 'ftu'); // coping
    const p0 = pt(f, 0, 0, -0.1), p1 = pt(f, f.L, 0, -0.1); Z.edge(p0[0], p0[2], p1[0], p1[2], top, f.nx, f.nz, 'roofEdge', 8);
    if (front) {
      const main = holes.find((h) => h.door && Math.abs(h.c - f.L / 2) < 1);
      if (main && f.L > 100) { // the chevron over the main doors, «ВХІД» on the canopy at each door
        B.sign.setColor('#ffffff'); decal(B.sign, f, main.c - 9, main.c + 9, Y(BAND1 - 0.2), Y(BAND1 - 0.2 + 9 * 0.94), 0.12, SIGN.chev);
      }
      for (const h of holes) if (h.door) decal(B.sign, f, h.c - 2.4, h.c + 2.4, Y(CAN + 0.15), Y(CAN + 0.15 + 0.9), CD + 0.03, SIGN.vhid);
    }
  }
  // roofs: the shed and the wing, skylight strips on the wing, air handlers on the shed
  D.setColor('#b9bcbd'); D.fill(ring, [], Y(H) - 0.3, true);
  for (let z = z0 + 6; z < zWing - 4; z += 6) { D.setColor('#9fb3bf'); D.box(xFront + 6, Y(H) - 0.3, z, x1 - 6, Y(H) + 0.4, z + 1.6, 1 | 2 | 4 | 16 | 32); }
  for (let k = 0; k < 14; k++) {
    const x = x0 + 8 + r() * (xFront - x0 - 16), z = zWing + 8 + r() * (z1 - zWing - 16);
    D.setColor('#d6d7d4'); D.box(x - 1.5, Y(H) - 0.3, z - 1, x + 1.5, Y(H) + 1.3, z + 1, 1 | 2 | 4 | 16 | 32);
  }
  // the canopy along the fronts: a light metal roof on posts, a navy fascia
  for (const [f, s0, s1] of canopies) {
    D.setColor('#e3e5e4'); fbox(D, f, s0, s1, Y(CAN), Y(CAN + 0.25), 0, CD, 'tu');
    D.setColor(NAVY); fbox(D, f, s0, s1, Y(CAN - 0.1), Y(CAN + 0.7), CD, CD + 0.1, 'ftulr');
    for (let s = s0 + 0.2; s <= s1; s += 8) {
      const [x, , z] = pt(f, s, 0, CD - 0.3);
      D.setColor(POST); D.cyl(x, heightAt(x, z) - 0.3, z, 0.15, 0.15, Y(CAN) - heightAt(x, z) + 0.3, 8, false);
      S.cyl(x, z, heightAt(x, z) - 0.5, Y(CAN), 0.15, 0.15, 'pole');
    }
    const Q = [[s0, 0], [s1, 0], [s1, CD + 0.1], [s0, CD + 0.1]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; });
    S.prism(Q.flat(), Y(CAN - 0.1), Y(CAN + 0.7), 0, 0, 'awning', 1);
    D.setColor('#a7a8a4'); fbox(D, f, s0, s1, gB, yF, 0, CD + 0.6, 'ftlr'); // the walk under it
    S.prism(Q.flat(), gB, yF, 0, 0, 'step');
  }
  // the blue canopy over the docks at the back
  { const f = edgeFaces(ring).find((q) => q.nx < -0.9 && q.L > 100);
    if (f) { D.setColor('#2b58b0'); fbox(D, f, 6, f.L - 6, Y(5.2), Y(5.5), 0, 6, 'ftu'); const Q = [[6, 0], [f.L - 6, 0], [f.L - 6, 6], [6, 6]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; }); S.prism(Q.flat(), Y(5.2), Y(5.5), 0, 0, 'awning', 1); } }

  // ---- the roof signs over the main front: truss, letters and logo, the board further south-east
  const ff = edgeFaces(ring).find((q) => q.nx > 0.9 && q.L > 100);
  if (ff) {
    const c = ff.L * 0.42, w = 34, yb = Y(H) + 0.6, hh = w * (0.3 * 1024) / 2048; // the name cell keeps its aspect (2048 x 307)
    D.setColor('#9a9fa3');
    for (let s = c - w / 2; s <= c + w / 2 + 0.01; s += w / 8) fbox(D, ff, s - 0.08, s + 0.08, Y(H) - 0.3, yb + hh, -1.6, -1.4, 'fblr');
    for (const y of [yb, yb + hh]) fbox(D, ff, c - w / 2, c + w / 2, y - 0.08, y + 0.08, -1.6, -1.4, 'fbtu');
    B.sign.setColor('#ffffff'); decal(B.sign, ff, c - w / 2, c + w / 2, yb, yb + hh, -1.35, SIGN.name);
    const cb = ff.L * 0.8, wb = 30, hb = wb * (0.18 * 1024) / 2048;
    D.setColor('#9a9fa3'); for (const s of [cb - wb / 2 + 1, cb, cb + wb / 2 - 1]) fbox(D, ff, s - 0.1, s + 0.1, Y(H) - 0.3, Y(H) + 1.2, -1.6, -1.4, 'fblr');
    D.setColor('#e9ebea'); fbox(D, ff, cb - wb / 2, cb + wb / 2, Y(H) + 1.2, Y(H) + 1.2 + hb, -1.7, -1.52, 'b');
    decal(B.sign, ff, cb - wb / 2, cb + wb / 2, Y(H) + 1.2, Y(H) + 1.2 + hb, -1.5, SIGN.board);
  }

  // ---- collision: the shed to its roof (the wing's lower roof is close enough for the car)
  S.prism(ring.flat(), gB, Y(H), 0, 0, 'wall');

  // ---- meshes
  const sign = signTex();
  const M = mats({
    stripe: new THREE.MeshStandardMaterial({ map: stripeTex(), vertexColors: true, roughness: 0.55, metalness: 0.15 }),
    sign: new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0, alphaTest: 0.4, roughness: 0.4, side: THREE.DoubleSide }),
  });
  const out = finish(root, 'epicentr', B, M, ['wall', 'stripe', 'det']);
  console.log(`[cherkasy] Epicentr: ${nWin} openings, floor ${yF.toFixed(1)} m (ground ${gLo.toFixed(1)}..${gHi.toFixed(1)}), ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    footprints: [{ poly: ring, h: Y(H) - gLo, kind: bld.k, name: 'Епіцентр К' }],
    clear: (x, z) => x > x0 - 8 && x < x1 + CD + 3 && z > z0 - 3 && z < z1 + 3,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.7 * k; M.sign.emissiveIntensity = 0.75 * k; },
  };
}
