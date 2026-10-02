// OWNER: cherkasy. ТЦ «Екватор», проспект Хіміків, 74 (OSM 147261886, tagged today as the Cherkasy Mall that was to
// replace it), rebuilt on a player's request (issue #25): the long low hall of the old Khimvolokno works that the
// Ekvator shopping centre (2007–2013) took over, with its big parking lot on vul. Leitenanta Mukana levelled flat and
// smooth for drifting. After the old photo of the front (restplace.com.ua): a 470 m box of light grey profiled sheet over
// a dark plinth with a blue-grey band at the eaves, big framed shop billboards along the front (plain art here, no
// brands), and in the middle the orange entrance block with its wide glazed portal, carrying «ЕКВАТОР торговельний
// центр» and the sun logo on a steel frame over the roof. Two smaller glazed doors under canopies, roller shutters on
// the back, flagpoles by the east doors, a flat roof with rooflight ridges and air handlers.
// The lot is one flat asphalt slab (its own mesh and a collision prism 0.22 m over the levelled terrain, so the
// carriageway kerbs of the OSM parking aisles under it are gone) with short ramps on the open edges, stalls painted on
// the eastern two thirds (the OSM aisles), an open apron to the west, a concrete strip along the front and light poles
// round the edges only.
//   EKVATOR_SKIP: the OSM id replaced here (buildings.js skips it)
//   LOT: { x0, x1, z0 } the lot's west, east and street-side edges (map metres; the hall's front closes it to the south)
//   levelEkvator(hf, map) -> level | null   levels the lot (to its own median) and the hall (to the lot's level)
//   buildEkvator({ root, map, solids, zips, heightAt, T }) -> { update(dt), clear(x, z), footprints, lot } | null
//     lot: { ring, y } the slab's outline and top height
// Walls are laid per ring edge in a face frame (slabkit.js): s along the edge, y up, o outward.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, hull, bboxOf, area2, inPoly } from './geo.js';
import { canvasTex, decal } from './sculpt.js';
import { face, ringFaces, at, quad, rect, box, skin, hole, label, finish } from './slabkit.js';

const OSM_ID = 147261886;
export const EKVATOR_SKIP = new Set([OSM_ID]);

const TOP = 10.5, EAVE = 1.4, PL = 0.6;         // parapet top over the floor, the eaves band, the plinth
const LIFT = 0.25, SLAB = 0.22, RAMP = 4;       // floor over the lot level, slab top over the terrain, ramp run
const ENT_X = -4243, ENT_W = 54, ENT_D = 3.5, ENT_H = 14.5; // the orange entrance block: centre x, width, reach, height
const WALL = '#c9cdd0', BAND = '#7a8794', PLINTH = '#5f6366', ORANGE = '#ec7a22', STEEL = '#8d949a';
// the lot: the hall's front chain closes it to the south; x0 is the hall's north-west corner
const LX0 = -4466.1, LX1 = -4012, LZ0 = 3447;
const STALLS = { x0: -4300, x1: -4020, z0: 3457, z1: 3541, cross: [3494, 3502], mod: 16, deep: 5, pitch: 2.6 };

const frontChain = (ring) => ring.filter((p) => p[1] < 3561 && p[0] > LX0 - 0.2); // the hall's north face, west -> east
export const LOT = { x0: LX0, x1: LX1, z0: LZ0 };
function lotRing(ring) {
  const ch = frontChain(ring).sort((a, b) => b[0] - a[0] || a[1] - b[1]); // east -> west along the face
  const out = [[LX0, LZ0], [LX1, LZ0], [LX1, ch[0][1]]];
  // the chain in ring order (the jogs keep their order): walk it from the east end to the west end
  const k0 = ring.findIndex((p) => p === ch[0]), n = ring.length, seq = [];
  for (let i = 0; i < n; i++) { const p = ring[(k0 - i + n) % n]; if (!ch.includes(p)) break; seq.push(p); }
  if (seq.length < 2) for (let i = 0; i < n; i++) { const p = ring[(k0 + i) % n]; if (!ch.includes(p)) break; seq.push(p); }
  return out.concat(seq.map((p) => [p[0], p[1]]));
}

export function levelEkvator(hf, map) {
  const b = map.buildings?.find((q) => q.id === OSM_ID);
  if (!b) return null;
  const ring = ringPts(b.p), lot = lotRing(ring);
  const level = hf.pad(lot, 20);
  if (level == null) return null;
  hf.pad(hull(ring), 20, level); // the DEM carries the hall's roof: level it to the lot, not to its own median
  return level;
}

// light grey profiled sheet: a rib every 0.25 m (1 m per repeat), the vertex colour tints it
const sheetTex = () => canvasTex(128, 32, (g, w, h) => {
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) { const x = i * w / 4; g.fillStyle = '#cfcfcf'; g.fillRect(x + 2, 0, 6, h); g.fillStyle = '#ffffff'; g.fillRect(x + 8, 0, 3, h); }
});
// orange composite cassettes 1.5 x 1.0 m with dark joints
const cassetteTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#f6f6f6'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 3, h); g.fillRect(0, 0, w, 3);
});
// atlas 2048 x 1024: row 0 the name (left), the sun logo (right); row 1 four plain billboard arts
const NAME = [0, 0.04, 0.74, 0.5], SUN = [0.76, 0.02, 0.99, 0.48];
const ART = [[0, 0.5, 0.25, 1], [0.25, 0.5, 0.5, 1], [0.5, 0.5, 0.75, 1], [0.75, 0.5, 1, 1]];
const atlasTex = () => canvasTex(2048, 1024, (g) => {
  g.clearRect(0, 0, 2048, 1024);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
  g.font = 'bold 300px Arial, Helvetica, sans-serif';
  g.lineWidth = 22; g.strokeStyle = '#ffffff'; g.strokeText('ЕКВАТОР', 760, 330, 1440);
  g.fillStyle = '#e1251b'; g.fillText('ЕКВАТОР', 760, 330, 1440);
  g.font = 'bold 92px Arial, Helvetica, sans-serif';
  g.lineWidth = 12; g.strokeText('торговельний центр', 760, 470, 1300); g.fillStyle = '#333a40'; g.fillText('торговельний центр', 760, 470, 1300);
  // the logo: a red square with a yellow-orange sun spiralling in it
  const cx = 1786, cy = 256;
  g.fillStyle = '#d8281d'; g.beginPath(); g.roundRect(cx - 220, cy - 220, 440, 440, 40); g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 14; g.stroke();
  g.fillStyle = '#ffc21a'; g.beginPath(); g.arc(cx, cy, 120, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ff8a1a'; g.lineWidth = 22; g.lineCap = 'round';
  g.beginPath(); for (let t = 0; t < 14; t += 0.1) { const r = 12 + t * 7.5, a = t; g[t ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a)); } g.stroke();
  g.strokeStyle = '#ffc21a'; g.lineWidth = 18;
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.beginPath(); g.moveTo(cx + 140 * Math.cos(a), cy + 140 * Math.sin(a)); g.lineTo(cx + 196 * Math.cos(a), cy + 196 * Math.sin(a)); g.stroke(); }
  // billboards: bold colour fields with a few abstract shapes (no brands)
  const arts = [['#2a63b8', '#ffd23f'], ['#d93a5b', '#ffffff'], ['#1c9a6b', '#f4f1e6'], ['#f39a1e', '#2a2f6b']];
  arts.forEach(([a, b], i) => {
    const x = i * 512, y = 512;
    g.fillStyle = a; g.fillRect(x + 6, y + 6, 500, 500);
    g.fillStyle = b; g.globalAlpha = 0.9;
    g.beginPath(); g.arc(x + 130 + i * 40, y + 270, 100, 0, Math.PI * 2); g.fill();
    g.fillRect(x + 270, y + 150, 190, 34); g.fillRect(x + 270, y + 210, 140, 34); g.fillRect(x + 270, y + 330, 200, 70);
    g.globalAlpha = 1;
  });
}, { repeat: false, aniso: 16 });

export function buildEkvator({ root, map, solids: S, zips: Z, heightAt, T }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), n0 = S.count;
  const ring = ringPts(bld.p), faces = ringFaces(ring), lot = lotRing(ring);
  const yL = heightAt(-4240, 3500), yS = yL + SLAB, yF = yL + LIFT, Y = (h) => yF + h;
  const gLo = Math.min(...ring.map((p) => heightAt(p[0], p[1]))) - 0.6;
  const B = { wall: new MB(), cas: new MB(), det: new MB(), lit: new MB(), glass: new MB(), sign: new MB(), lot: new MB(), paint: new MB(), lamp: new MB() };
  const D = B.det;
  let nOpen = 0;

  // ---- the hall: plinth, profiled sheet, the eaves band; the front's doors and billboards, shutters on the back
  const isFront = (f) => f.nz < -0.9 && f.az < 3561 && f.L > 3;
  const ent = faces.find((f) => isFront(f) && f.ax < ENT_X && f.ax + f.ux * f.L > ENT_X);
  const sE = ent ? ENT_X - ent.ax : 0;
  const doors = [[-4400, 8], [-4090, 8]]; // the two side entrances: x and width
  for (const f of faces) {
    if (f.L < 0.3) continue;
    const x0 = Math.min(f.ax, f.ax + f.ux * f.L), x1 = Math.max(f.ax, f.ax + f.ux * f.L);
    if (isFront(f)) {
      for (const [x, w] of doors) if (x - w / 2 > x0 + 1 && x + w / 2 < x1 - 1) {
        const s = Math.abs(x - f.ax);
        const q = { s0: s - w / 2, s1: s + w / 2, y0: Y(0.02), y1: Y(4.2), glass: '#3e4c55', lit: true, frame: '#c9ced2', rev: '#9aa1a6', dep: 0.25, pitch: 2, tr: Y(3.0), door: true };
        f.cuts.push(q); hole(B, f, q); nOpen++;
        D.setColor('#d6d9db'); box(D, f, q.s0 - 1.5, q.s1 + 1.5, Y(4.5), Y(4.85), 0, 3, 'ftlru'); // the canopy
        B.lit.setColor('#fff4dc'); for (let k = q.s0; k <= q.s1; k += 2.5) rect(B.lit, f, k - 0.2, k + 0.2, Y(4.49), Y(4.49), 1.5, null, [0, -1, 0]);
        S.prism(canopyPts(f, q.s0 - 1.5, q.s1 + 1.5, 0, 3), Y(4.5), Y(4.85), 0, 0, 'awning', 1);
      }
      if (f === ent) f.cuts.push({ s0: sE - ENT_W / 2, s1: sE + ENT_W / 2, y0: gLo, y1: Y(ENT_H) }); // under the block
    } else if (f.nz > 0.9 && f.L > 60) {
      for (let s = 25; s < f.L - 10; s += 55) { // roller shutters at the loading bays
        const q = { s0: s - 2, s1: s + 2, y0: Math.max(gLo + 0.1, Y(-0.1)), y1: Y(4.4), glass: '#8c9296', frame: '#7c8286', rev: '#7c8286', dep: 0.12, pitch: 4 };
        f.cuts.push(q); hole(B, f, q); nOpen++;
      }
    }
    skin(B.wall, f, gLo, Y(PL), PLINTH);
    skin(B.wall, f, Y(PL), Y(TOP - EAVE), WALL, [1, 1]);
    skin(B.wall, f, Y(TOP - EAVE), Y(TOP), BAND, [1, 1]);
    // parapet: inner face and coping
    D.setColor('#9ea4a8'); rect(D, f, 0, f.L, Y(TOP - 0.9), Y(TOP), -0.3, null, [-f.nx, 0, -f.nz]);
    D.setColor('#8a9196'); box(D, f, -0.03, f.L + 0.03, Y(TOP), Y(TOP + 0.08), -0.3, 0.06, 'ft');
    if (f.L > 3) { const p0 = at(f, 0, 0, -0.12), p1 = at(f, f.L, 0, -0.12); Z.edge(p0[0], p0[2], p1[0], p1[2], Y(TOP), f.nx, f.nz); }
  }
  function canopyPts(f, s0, s1, o0, o1) {
    const P = [[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = at(f, s, 0, o); return [p[0], p[2]]; });
    return (area2(P) < 0 ? P.reverse() : P).flat();
  }

  // billboards: framed boxes on the front, clear of the doors and the entrance block
  let art = 0;
  for (const f of faces) {
    if (!isFront(f) || f.L < 30) continue;
    for (let s = 14; s < f.L - 10; s += 34) {
      const x = f.ax + f.ux * s;
      if (Math.abs(x - ENT_X) < ENT_W / 2 + 8 || doors.some(([dx, w]) => Math.abs(x - dx) < w / 2 + 9)) continue;
      const w = 11, y0 = Y(3.2), y1 = Y(8.4);
      D.setColor('#4d5459'); box(D, f, s - w / 2 - 0.25, s + w / 2 + 0.25, y0 - 0.25, y1 + 0.25, 0, 0.3, 'ftlru');
      label(B.sign, f, s - w / 2, s + w / 2, y0, y1, 0.31, ART[art++ % 4]);
      B.lamp.setColor('#fff7e0');
      for (let k = s - w / 2 + 1.2; k < s + w / 2; k += 2.8) { const p = at(f, k, y1 + 0.5, 0.9); B.lamp.box(p[0] - 0.15, p[1] - 0.06, p[2] - 0.15, p[0] + 0.15, p[1] + 0.06, p[2] + 0.15); }
    }
  }

  // ---- the orange entrance block: cassettes round a wide glazed portal, the sign on a steel frame over it
  if (ent) {
    const f = ent, a = sE - ENT_W / 2, b = sE + ENT_W / 2, g0 = sE - 17, g1 = sE + 17, gTop = Y(8.6);
    const pa = at(f, a, 0, ENT_D), pb = at(f, b, 0, ENT_D), fr = face([pa[0], pa[2]], [pb[0], pb[2]], f.nx, f.nz); // its front plane
    const q = { s0: g0 - a, s1: g1 - a, y0: Y(0.02), y1: gTop, glass: '#33434f', lit: true, frame: '#b9c0c6', rev: '#d4d8db', dep: 0.6, pitch: 2.4, tr: Y(4.0), door: true };
    fr.cuts.push(q); hole(B, fr, q); nOpen++;
    skin(B.cas, fr, gLo, Y(ENT_H), ORANGE, [1.5, 1.0]);
    for (const [s, o] of [[a, 1], [b, -1]]) { // its two ends, back to the hall
      B.cas.setColor(ORANGE);
      const p = (oo, y) => at(f, s, y, oo), n = [f.ux * -o, 0, f.uz * -o];
      quad(B.cas, p(0, gLo), p(ENT_D, gLo), p(ENT_D, Y(ENT_H)), p(0, Y(ENT_H)), n, [[0, gLo], [ENT_D / 1.5, gLo], [ENT_D / 1.5, Y(ENT_H)], [0, Y(ENT_H)]]);
    }
    D.setColor('#cf6a1d'); box(D, f, a - 0.05, b + 0.05, Y(ENT_H), Y(ENT_H + 0.12), 0, ENT_D + 0.05, 'ftlr');
    D.setColor('#9c9d9a'); box(D, f, a, b, Y(ENT_H - 0.02), Y(ENT_H), 0, ENT_D, 't'); // the block's roof
    D.setColor('#c7cdd2'); box(D, f, g0 - 2, g1 + 2, Y(4.3), Y(4.65), ENT_D, ENT_D + 2.8, 'ftlru'); // the canopy over the doors
    B.lit.setColor('#fff4dc'); for (let k = g0; k <= g1; k += 3) rect(B.lit, f, k - 0.25, k + 0.25, Y(4.29), Y(4.29), ENT_D + 1.4, null, [0, -1, 0]);
    S.prism(canopyPts(f, a, b, 0, ENT_D), gLo, Y(ENT_H), 0, 0, 'wall');
    S.prism(canopyPts(f, g0 - 2, g1 + 2, ENT_D, ENT_D + 2.8), Y(4.3), Y(4.65), 0, 0, 'awning', 1);
    // the frame: two posts, top and bottom chords, diagonals; the letters and the logo on it
    // t runs left to right as seen from the lot: the logo on the left, the name to its right
    const rt = f.ux * f.nz - f.uz * f.nx >= 0, St = (t) => (rt ? sE + t : sE - t), span = (t0, t1) => [Math.min(St(t0), St(t1)), Math.max(St(t0), St(t1))];
    const fy0 = Y(ENT_H + 0.1), fy1 = Y(ENT_H + 7.3), fs0 = sE - 16, fs1 = sE + 16, fo = ENT_D - 1.2;
    D.setColor(STEEL);
    const T3 = (s, y) => at(f, s, y, fo);
    for (const s of [fs0, sE - 5.5, sE + 5.5, fs1]) D.tube(T3(s, fy0), T3(s, fy1), 0.12, 6);
    for (const y of [fy0 + 0.3, fy1]) D.tube(T3(fs0, y), T3(fs1, y), 0.1, 6);
    for (let s = fs0; s < fs1 - 0.1; s += 4) D.tube(T3(s, fy0 + 0.3), T3(s + 4, fy1), 0.05, 4);
    for (const s of [fs0, fs1]) D.tube(T3(s, fy0 + 0.2), at(f, s, fy0 + 0.2, -2), 0.08, 4); // stays back to the roof
    const [n0, n1] = span(-8.6, 13.4), [l0, l1] = span(-15.4, -9.2);
    label(B.sign, f, n0, n1, fy0 + 0.5, fy0 + 0.5 + 22 * (0.46 * 1024) / (0.74 * 2048), fo + 0.25, NAME);
    label(B.sign, f, l0, l1, fy0 + 0.6, fy0 + 6.8, fo + 0.25, SUN);
    S.prism(canopyPts(f, fs0, fs1, fo - 0.3, fo + 0.4), fy0, fy1, 0, 0, 'sign');
  }

  // ---- roof: membrane, rooflight ridges along the hall, air handlers
  const bb = bboxOf(ring);
  D.setColor('#a9aaa6'); D.fill(ring, [], Y(TOP - 0.9), true);
  for (let z = bb.z0 + 22; z < bb.z1 - 15; z += 26) {
    for (let x = bb.x0 + 30; x < bb.x1 - 40; x += 70) {
      if (!inPoly(ring, x, z) || !inPoly(ring, x + 50, z)) continue;
      D.setColor('#8f969b'); D.box(x, Y(TOP - 0.9), z - 1.6, x + 50, Y(TOP - 0.3), z + 1.6, 1 | 2 | 16 | 32);
      B.glass.setColor('#8fa6b4'); B.glass.face([[x, Y(TOP - 0.3), z - 1.6], [x + 50, Y(TOP - 0.3), z - 1.6], [x + 50, Y(TOP + 0.6), z], [x, Y(TOP + 0.6), z]], [0, 0.87, -0.49]);
      B.glass.face([[x, Y(TOP - 0.3), z + 1.6], [x, Y(TOP + 0.6), z], [x + 50, Y(TOP + 0.6), z], [x + 50, Y(TOP - 0.3), z + 1.6]], [0, 0.87, 0.49]);
    }
  }
  for (const [x, z, w, d, h] of [[-4380, 3600, 5, 3, 2.2], [-4300, 3640, 4, 4, 1.8], [-4150, 3610, 6, 3, 2.4], [-4080, 3650, 4, 3, 1.6], [-4440, 3650, 3, 3, 1.8]]) {
    if (!inPoly(ring, x, z)) continue;
    D.setColor('#d2d4d4'); D.box(x - w / 2, Y(TOP - 0.9), z - d / 2, x + w / 2, Y(TOP - 0.9 + h), z + d / 2, 1 | 2 | 4 | 16 | 32);
    S.prism([x - w / 2, z - d / 2, x + w / 2, z - d / 2, x + w / 2, z + d / 2, x - w / 2, z + d / 2], Y(TOP - 0.9), Y(TOP - 0.9 + h), 0, 0, 'equipment');
  }
  S.prism((area2(ring) < 0 ? ring.slice().reverse() : ring).flat(), gLo - 1, Y(TOP), 0, 0, 'wall');

  // ---- flagpoles by the east doors
  {
    const f = faces.find((q) => isFront(q) && q.ax < -4090 && q.ax + q.ux * q.L > -4090);
    if (f) for (let i = 0; i < 3; i++) {
      const p = at(f, Math.abs(-4090 - f.ax) + 9 + i * 3, 0, 6);
      D.setColor('#dfe2e4'); D.cyl(p[0], yS, p[2], 0.09, 0.06, 11, 8);
      S.cyl(p[0], p[2], yS - 0.3, yS + 11, 0.12, 0.12, 'pole');
      D.setColor(['#2559b5', '#e1251b', '#ffffff'][i]);
      D.face([[p[0], yS + 10.8, p[2]], [p[0], yS + 8.4, p[2]], [p[0] + f.ux * 2.4, yS + 8.6, p[2] + f.uz * 2.4], [p[0] + f.ux * 2.4, yS + 10.6, p[2] + f.uz * 2.4]], [f.nx, 0, f.nz]);
      D.face([[p[0], yS + 10.8, p[2]], [p[0] + f.ux * 2.4, yS + 10.6, p[2] + f.uz * 2.4], [p[0] + f.ux * 2.4, yS + 8.6, p[2] + f.uz * 2.4], [p[0], yS + 8.4, p[2]]], [-f.nx, 0, -f.nz]);
    }
  }

  // ---- the lot: one flat slab, ramps on the open edges, paint, the front strip, light poles round the edges
  const L = B.lot, P = B.paint;
  L.setColor('#ffffff'); L.fill(lot, [], yS, true);
  const ramp = (x0, z0, x1, z1, dir) => { // dir: the side the ramp falls toward ('n' -z, 'w' -x, 'e' +x)
    // the outer edge starts a little under the lowest terrain along it (the levelled lattice eases back to the natural
    // ground over one 16 m cell), so the plane meets the street and the yard without a lip
    const c = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], [ea, eb] = dir === 'n' ? [c[0], c[1]] : dir === 'w' ? [c[0], c[3]] : [c[1], c[2]];
    let lo = Infinity;
    for (let k = 0; k <= 64; k++) lo = Math.min(lo, heightAt(ea[0] + (eb[0] - ea[0]) * k / 64, ea[1] + (eb[1] - ea[1]) * k / 64));
    lo = Math.min(lo, yL) - 0.03;
    const yOf = (x, z) => (dir === 'n' ? lo + (yS - lo) * (z - z0) / (z1 - z0) : dir === 'w' ? lo + (yS - lo) * (x - x0) / (x1 - x0) : lo + (yS - lo) * (x1 - x) / (x1 - x0));
    const i = L.v;
    for (const [x, z] of c) L.vert(x, yOf(x, z), z, 0, 1, 0, x, z);
    L.tri(i, i + 2, i + 1); L.tri(i, i + 3, i + 2);
    // the collision top is the same plane, y = a + bx x + bz z
    const bx = dir === 'n' ? 0 : dir === 'w' ? (yS - lo) / (x1 - x0) : -(yS - lo) / (x1 - x0), bz = dir === 'n' ? (yS - lo) / (z1 - z0) : 0;
    S.prism([x0, z0, x1, z0, x1, z1, x0, z1], yL - 1, dir === 'n' ? lo - bz * z0 : dir === 'w' ? lo - bx * x0 : lo - bx * x1, bx, bz, 'lot');
  };
  const chain = lot.slice(3), zW = chain[chain.length - 1][1], zE = lot[2][1];
  ramp(LX0, LZ0 - RAMP, LX1, LZ0, 'n');
  ramp(LX0 - RAMP, LZ0, LX0, zW, 'w');
  ramp(LX1, LZ0, LX1 + RAMP, zE, 'e');
  S.prism((area2(lot) < 0 ? lot.slice().reverse() : lot).flat(), yL - 1, yS, 0, 0, 'lot');

  const yP = yS + 0.004, line = (x0, z0, x1, z1, w = 0.12) => { // a painted strip from (x0, z0) to (x1, z1)
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2, i = P.v;
    P.vert(x0 + nx, yP, z0 + nz, 0, 1, 0); P.vert(x1 + nx, yP, z1 + nz, 0, 1, 0); P.vert(x1 - nx, yP, z1 - nz, 0, 1, 0); P.vert(x0 - nx, yP, z0 - nz, 0, 1, 0);
    P.tri(i, i + 2, i + 1); P.tri(i, i + 3, i + 2);
  };
  // the front strip: light concrete from the hall's face 4.5 m out, then a kerb line
  P.setColor('#a7a49d');
  for (let k = 0; k + 1 < chain.length; k++) {
    const [p, q] = [chain[k], chain[k + 1]];
    if (Math.abs(p[1] - q[1]) > 1) continue; // the jogs
    const z = Math.min(p[1], q[1]); line(p[0], z - 2.25, q[0], z - 2.25, 4.5);
  }
  // stalls: double rows back to back (5 m deep, 2.6 m wide), 6 m aisles between, a cross aisle in the middle
  P.setColor('#e9e7df');
  let nStall = 0;
  for (let x = STALLS.x0; x + STALLS.mod <= STALLS.x1 + 0.1; x += STALLS.mod) {
    for (const [r0, r1] of [[STALLS.z0, STALLS.cross[0]], [STALLS.cross[1], STALLS.z1]]) {
      for (const [xa, xb] of [[x, x + STALLS.deep], [x + STALLS.mod - STALLS.deep, x + STALLS.mod]]) {
        for (let z = r0; z <= r1 + 0.01; z += STALLS.pitch) { line(xa, z, xb, z); nStall++; }
      }
      line(x, r0, x, r1, 0.12); line(x + STALLS.mod, r0, x + STALLS.mod, r1, 0.12);
    }
  }
  // the edges of the driving lanes and arrows on the apron and the front lane
  P.setColor('#f2d64b');
  line(LX0 + 3, LZ0 + 6, LX1 - 3, LZ0 + 6, 0.15);
  P.setColor('#e9e7df');
  const arrow = (x, z, dx) => { line(x - dx * 3, z, x + dx * 1.2, z, 0.35); line(x + dx * 2.6, z, x + dx * 0.9, z - 0.9, 0.3); line(x + dx * 2.6, z, x + dx * 0.9, z + 0.9, 0.3); };
  for (let x = -4440; x < -4320; x += 30) { arrow(x, LZ0 + 3, 1); arrow(x + 15, 3530, -1); }

  // light poles: 10 m, two heads, along the edges only (none in the middle, none in the entrances)
  const roads = [-4453, -4312, -4165]; // where the OSM service ways come in from the street
  const poles = [];
  for (let x = LX0 + 6; x < LX1 - 4; x += 32) if (!roads.some((r) => Math.abs(x - r) < 6)) poles.push([x, LZ0 + 0.9, 0, 1]);
  for (let z = LZ0 + 24; z < zW - 14; z += 32) { poles.push([LX0 + 0.9, z, 1, 0]); poles.push([LX1 - 0.9, z, -1, 0]); }
  for (let x = LX0 + 20; x < LX1 - 20; x += 36) {
    if (Math.abs(x - ENT_X) < ENT_W / 2 + 4 || doors.some(([dx, w]) => Math.abs(x - dx) < w / 2 + 3)) continue;
    const f = faces.find((q) => isFront(q) && Math.min(q.ax, q.ax + q.ux * q.L) <= x && Math.max(q.ax, q.ax + q.ux * q.L) >= x && Math.abs(q.uz) < 0.1);
    if (f) poles.push([x, f.az - 5.2, 0, -1]);
  }
  for (const [x, z, ax, az] of poles) {
    D.setColor('#9aa0a5'); D.cyl(x, yS, z, 0.16, 0.09, 10, 8, false);
    D.setColor('#7b8186'); D.cyl(x, yS, z, 0.24, 0.24, 0.5, 8);
    for (const s of [1, -1]) {
      const hx = x + ax * 1.4 * s, hz = z + az * 1.4 * s;
      D.setColor('#9aa0a5'); D.tube([x, yS + 9.8, z], [hx, yS + 10.1, hz], 0.05, 4);
      D.setColor('#5c6166'); D.box(hx - 0.35, yS + 9.95, hz - 0.2, hx + 0.35, yS + 10.2, hz + 0.2, 1 | 2 | 4 | 16 | 32);
      B.lamp.setColor('#fff4d6'); B.lamp.box(hx - 0.3, yS + 9.92, hz - 0.16, hx + 0.3, yS + 9.95, hz + 0.16, 8);
    }
    S.cyl(x, z, yS - 0.3, yS + 10, 0.16, 0.16, 'pole');
  }

  // ---- meshes
  const atlas = atlasTex(), asph = T?.asphalt ? T.asphalt.clone() : null;
  if (asph) { asph.wrapS = asph.wrapT = THREE.RepeatWrapping; asph.repeat.set(1 / 7, 1 / 7); asph.needsUpdate = true; }
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: sheetTex(), vertexColors: true, roughness: 0.6, metalness: 0.12 }),
    cas: new THREE.MeshStandardMaterial({ map: cassetteTex(), vertexColors: true, roughness: 0.45, metalness: 0.2 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3, emissive: 0xffe2b8, emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.5 }),
    sign: new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: 0xffffff, emissiveIntensity: 0, alphaTest: 0.35, roughness: 0.5, side: THREE.DoubleSide }),
    lot: new THREE.MeshStandardMaterial({ map: asph, color: 0xd4d4d6, roughness: 0.9 }),
    paint: decal(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }), 2),
    lamp: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: 0xfff0d0, emissiveIntensity: 0 }),
  };
  const out = finish(root, 'ekvator', B, M, { shade: ['wall', 'cas', 'det'] });
  console.log(`[cherkasy] Ekvator: ${nOpen} openings, lot ${yS.toFixed(2)} m with ${nStall} stall lines and ${poles.length} light poles, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  const lb = bboxOf(lot);
  return {
    footprints: [{ poly: ring, h: Y(TOP) - gLo, kind: 'retail', name: 'Екватор' }],
    lot: { ring: lot, y: yS },
    clear: (x, z) => (x > bb.x0 - 3 && x < bb.x1 + 3 && z > bb.z0 - 3 && z < bb.z1 + 3) || (x > lb.x0 - RAMP - 2 && x < lb.x1 + RAMP + 2 && z > lb.z0 - RAMP - 2 && z < lb.z1),
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.45 * k; M.sign.emissiveIntensity = 0.06 + 0.8 * k; M.lamp.emissiveIntensity = 2.0 * k; },
  };
}
