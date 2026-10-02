// OWNER: cherkasy. The new block at вулиця Нарбутівська, 10 (Соборний; one section, 39 flats, 4 storeys and a
// mansard, brick, due early 2027), built as rendered in the lun.ua new-builds catalogue (lun.ua/new/cherkasy/
// narbutivska-st-10: the renders and the site plan). OSM still has the old houses on the lot; they are replaced here.
// In plan (the site plan, registered on Нарбутівська and the Б. Хмельницького crossing) a 34 x 20 m block along the
// street, 13 m back from its axis, with a 6 m deep wing behind its south-east half. Four storeys as the renders show
// them (the catalogue's «4 + мансарда»: the attic is in the roof): three of red clinker brick, the fourth a mansard
// clad in dark standing-seam metal on the long faces. The roof: a flat strip behind the
// street front, then a steep gable roof over the rest, its ends brick gables framed by dark metal rakes, an oculus
// under the apex, four tall brick chimneys at the foot of the street slope. The facades, read from the renders section by section:
// the street front (south-east to north-west) has two window stacks by the entrance, a four-pane glazed bay, one stack,
// a seven-pane glazed bay; the glazed bays run from the ground (lit lobby, flats) to the eaves with white slab bands
// at every floor. Brick windows have dark spandrel panels under them, dark AC boxes stand between some stacks.
// A flat dark canopy on posts over the street entrance at the south-east corner, another over the garage door and
// the yard door on the wing. A black bar fence along the street (brick piers at the gate and the ends), a hedge behind it. Windows light
// up at night. No developer name or logo anywhere.
//   NARB10_SKIP: the OSM ids replaced here (the old houses on the lot)
//   NARB10_RING: the building's outline on the map, flat [x, z, …] (places.js keeps a copy, tests compare them)
//   buildNarbutivska10({ root, solids, zips?, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// The block stands square to the map axes (Нарбутівська runs along +z here): the street front looks +x. Walls are
// laid per face in a face frame (slabkit.js): s along the face, left to right for a viewer outside, y up, o outward.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { rng } from './geo.js';
import { canvasTex } from './sculpt.js';
import { face, at, quad, rect, box, skin, hole, solid, finish } from './slabkit.js';

export const NARB10_SKIP = new Set([559823074, 1195349010, 559823072, 1195349009, 1195349008]);

const XF = -921.6, XR = -941.6, XW = -947.8;      // the street front, the rear, the wing's rear
const ZN = 1395.2, ZS = 1429.1, ZWN = 1410.9;     // the north-west and south-east ends, the wing's north-west face
export const NARB10_RING = [XF, ZN, XF, ZS, XW, ZS, XW, ZWN, XR, ZWN, XR, ZN];
const FH = 3.1, NB = 3, NL = 4, EAVE = NL * FH;    // storey; brick storeys, all storeys (the 4th is the mansard); the eaves
const STRIP = 6, GV0 = 6, GV1 = 20;               // the flat strip behind the front; the gable's span (depth from the front)
const PITCH = Math.tan(40 * Math.PI / 180), RISE = (GV1 - GV0) / 2 * PITCH;
const FENCE_X = -917.3, FENCE_Z = [1386, 1432.8], GATE = [1423.4, 1425.6];
const DARK = '#4a4f55', SEAM = '#5e646b', WHITE = '#efefea', FRAME = '#3c4147';
const GLASS = ['#3a3f45', '#454b51', '#33383d', '#4f555b'];

// the faces: corners a -> b (s runs a -> b, left to right seen from outside), outward normal, the gable span in s
// (end faces), and the bays left to right: w window stack (door: a door in place of the ground window; g0: none on
// the ground floor), ac AC boxes only, g glazed bay [s0, s1, panes, from floor]
const FACES = [
  { id: 'street', a: [XF, ZS], b: [XF, ZN], n: [1, 0], bays: [
    { t: 'w', c: 1.7 }, { t: 'w', c: 4.6, door: true }, { t: 'g', s0: 6.4, s1: 13.6, panes: 4, k0: 0 },
    { t: 'ac', c: 14.5 }, { t: 'w', c: 16.6 }, { t: 'g', s0: 19.4, s1: 32.6, panes: 7, k0: 0 }] },
  { id: 'nw', a: [XF, ZN], b: [XR, ZN], n: [0, -1], gable: [GV0, GV1], bays: [
    { t: 'ac', c: 1.6 }, { t: 'w', c: 4.2 }, { t: 'w', c: 8.0 }, { t: 'w', c: 10.6 }, { t: 'ac', c: 13 }, { t: 'w', c: 15.4 }, { t: 'w', c: 18.0 }] },
  { id: 'rear', a: [XR, ZN], b: [XR, ZWN], n: [-1, 0], bays: [
    { t: 'w', c: 1.6 }, { t: 'g', s0: 3.4, s1: 9.8, panes: 4, k0: 1 }, { t: 'w', c: 11.9 }, { t: 'w', c: 14.1 }] },
  { id: 'wnw', a: [XR, ZWN], b: [XW, ZWN], n: [0, -1], bays: [{ t: 'w', c: 3.1 }] },
  { id: 'wrear', a: [XW, ZWN], b: [XW, ZS], n: [-1, 0], yard: true, bays: [
    { t: 'w', c: 1.6 }, { t: 'g', s0: 3.2, s1: 9.8, panes: 4, k0: 1 }, { t: 'w', c: 11.6 }, { t: 'g', s0: 13.0, s1: 17.2, panes: 3, k0: 1 }] },
  { id: 'se', a: [XW, ZS], b: [XF, ZS], n: [0, 1], gable: [XF - XW - GV1, XF - XW - GV0], bays: [
    { t: 'w', c: 3.1 }, { t: 'w', c: 8.2 }, { t: 'w', c: 10.8 }, { t: 'ac', c: 13.2 }, { t: 'w', c: 15.6 }, { t: 'w', c: 18.2 },
    { t: 'w', c: 22.0 }, { t: 'ac', c: 24.6 }] },
];

// red clinker, a mix of brick tones with the odd pale one; 2 x 2 m per repeat (uv in metres)
const brickTex = (r) => {
  const t = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#a69d94'; g.fillRect(0, 0, w, h);
    const tones = [[168, 104, 84], [156, 96, 80], [180, 120, 98], [146, 92, 78], [190, 140, 118], [136, 86, 74], [176, 128, 112]];
    const bw = w / 8, bh = h / 26;
    for (let j = 0; j < 26; j++) for (let i = -1; i < 8; i++) {
      const u = r(), c = u < 0.06 ? [200, 184, 168] : tones[(r() * tones.length) | 0], k = 0.94 + r() * 0.1;
      g.fillStyle = `rgb(${c.map((v) => Math.min(255, Math.round(v * k))).join(',')})`;
      g.fillRect(i * bw + (j & 1 ? bw / 2 : 0) + 1.5, j * bh + 1.5, bw - 3, bh - 3);
    }
  });
  t.repeat.set(0.5, 0.5);
  return t;
};
// dark standing seam: a seam every 0.5 m along u (uv in metres)
const seamTex = () => canvasTex(128, 64, (g, w, h) => {
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
  for (const x of [0, w / 2]) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, 0, 3, h); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 3, 0, 2, h); }
});
// black bar fence, 1 m per repeat across, the full height up: rails top and bottom, a bar every 12.5 cm
const fenceTex = () => canvasTex(128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.fillStyle = '#1d1f22';
  for (let x = 0; x < w; x += 16) g.fillRect(x + 6, 0, 4, h);
  g.fillRect(0, 4, w, 6); g.fillRect(0, h - 14, w, 6);
}, { srgb: true });

const xz = (p) => [p[0], p[2]];
// a copy of face f restricted to s in [a, b] (its cuts shifted along)
function sub(f, a, b) {
  const p = at(f, a, 0), q = at(f, b, 0), g = face([p[0], p[2]], [q[0], q[2]], f.nx, f.nz);
  g.cuts = f.cuts.filter((c) => c.s1 > a && c.s0 < b).map((c) => ({ ...c, s0: c.s0 - a, s1: c.s1 - a }));
  return g;
}

export function buildNarbutivska10({ root, solids: S, zips: Z, heightAt }) {
  const t0 = performance.now(), r = rng(1003), n0 = S.count;
  const ring = [];
  for (let i = 0; i < NARB10_RING.length; i += 2) ring.push([NARB10_RING[i], NARB10_RING[i + 1]]);
  const hs = [...ring, [FENCE_X, FENCE_Z[0]], [FENCE_X, FENCE_Z[1]]].map(([x, z]) => heightAt(x, z));
  if (hs.some((h) => !Number.isFinite(h))) return null;
  const gLo = Math.min(...hs), gHi = Math.max(...hs), yF = gHi + 0.45, Y = (h) => yF + h, gB = gLo - 0.6;
  const fy = (k) => Y(k * FH), eave = Y(EAVE), ridge = eave + RISE;
  const B = { brick: new MB(), seam: new MB(), det: new MB(), glass: new MB(), lit: new MB(), fence: new MB() };
  const K = B.brick, M_ = B.seam, D = B.det, U1 = [1, 1];
  const glass = () => GLASS[(r() * GLASS.length) | 0];
  let nWin = 0, nPane = 0;

  for (const spec of FACES) {
    const f = face(spec.a, spec.b, ...spec.n), gab = spec.gable;
    f.cuts = [];
    for (const b of spec.bays) {
      if (b.t === 'w') for (let k = 0; k < NL; k++) {
        const y = fy(k);
        if (k === 0 && b.door) { f.cuts.push({ s0: b.c - 0.8, s1: b.c + 0.8, y0: Y(0), y1: Y(2.6), door: true, glass: '#3a3632', lit: true, frame: FRAME, rev: '#6b4436', dep: 0.3, pitch: 0.8, tr: Y(2.15) }); continue; }
        f.cuts.push({ s0: b.c - 0.62, s1: b.c + 0.62, y0: y + (k ? 0.55 : 0.45), y1: y + 2.8, glass: glass(), lit: r() < 0.3, frame: FRAME, rev: '#7a4a3a', dep: 0.22, pitch: 0.72, win: true, k });
        nWin++;
      }
      if (b.t === 'g') f.cuts.push({ s0: b.s0, s1: b.s1, y0: b.k0 ? fy(b.k0) - 0.12 : Y(0), y1: eave, bay: b });
    }
    // the yard face of the wing: the garage door and the yard door under a canopy
    if (spec.yard) {
      f.cuts.push({ s0: 3.6, s1: 7.4, y0: gB + 0.35, y1: Y(2.4), door: true, glass: '#6a6d70', frame: '#55585c', rev: DARK, dep: 0.25, pitch: 4 });
      f.cuts.push({ s0: 8.3, s1: 9.6, y0: Y(0), y1: Y(2.5), door: true, glass: '#3a3632', lit: true, frame: FRAME, rev: DARK, dep: 0.25, pitch: 2, tr: Y(2.1) });
    }
    // walls: brick for four storeys; the fifth is brick in a gable, dark standing seam elsewhere
    skin(K, f, gB, fy(NB), '#ffffff', U1);
    if (gab) {
      const [g0, g1] = [gab[0] + 0.6, gab[1] - 0.6];
      skin(K, sub(f, g0, g1), fy(NB), eave, '#ffffff', U1);
      for (const [a, b2] of [[0, g0], [g1, f.L]]) if (b2 - a > 0.05) skin(M_, sub(f, a, b2), fy(NB), eave, SEAM, U1);
      gable(f, gab[0], gab[1]);
    } else skin(M_, f, fy(NB), eave, SEAM, U1);
    for (const q of f.cuts) {
      if (q.bay) { bay(f, q); continue; }
      hole(B, f, q);
      // a dark spandrel panel under each upper window
      if (q.win && q.k > 0) { D.setColor(DARK); for (const [a, b2] of [[q.s0 - 0.22, (q.s0 + q.s1) / 2 - 0.02], [(q.s0 + q.s1) / 2 + 0.02, q.s1 + 0.22]]) box(D, f, a, b2, q.y0 - 0.78, q.y0 - 0.04, 0, 0.12, 'ftlru'); }
      else if (q.win) { D.setColor('#5b5e62'); box(D, f, q.s0 - 0.05, q.s1 + 0.05, q.y0 - 0.06, q.y0, -0.02, 0.07, 'ftlr'); }
    }
    for (const b of spec.bays) if (b.t === 'ac') for (let k = 1; k < NL; k++) { D.setColor(DARK); box(D, f, b.c - 0.45, b.c + 0.45, fy(k) + 1.0, fy(k) + 1.6, 0, 0.35, 'ftlru'); }
    // the plinth line and the dark eaves fascia (the gable spans carry their rakes instead)
    D.setColor('#5b4a44'); box(D, f, 0, f.L, gB, Y(0) - 0.05, 0, 0.05, 'ft');
    const fas = (a, b2) => { D.setColor(DARK); box(D, f, a, b2, eave - 0.2, eave + 0.18, 0, 0.12, 'ftu'); };
    if (gab) { if (gab[0] > 0.1) fas(0, gab[0]); if (gab[1] < f.L - 0.1) fas(gab[1], f.L); } else fas(0, f.L);
    if (Z && f.L > 3 && !gab) { const a = at(f, 0, 0, -0.1), b2 = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b2[0], b2[2], eave + 0.18, f.nx, f.nz); }
    if (spec.id === 'street') { vestibule(f, 3.2, 6.2, 2.6); canopy(f, -1.2, 12.8, 3.4); }
    if (spec.yard) canopy(f, 3.0, 10.2, 4.0);
  }

  // a glazed bay: panes per floor a little behind the wall line, dark mullions, white slab bands proud of the wall
  function bay(f, q) {
    const { s0, s1, bay: b } = q, o = -0.12, n = b.panes, w = (s1 - s0) / n;
    D.setColor(DARK);
    quad(D, at(f, s0, q.y0), at(f, s0, q.y0, o), at(f, s0, q.y1, o), at(f, s0, q.y1), f.U);
    quad(D, at(f, s1, q.y0), at(f, s1, q.y0, o), at(f, s1, q.y1, o), at(f, s1, q.y1), [-f.ux, 0, -f.uz]);
    for (let k = b.k0; k < NL; k++) {
      const y0 = k ? fy(k) + 0.12 : Y(0), y1 = k < NL - 1 ? fy(k + 1) - 0.12 : eave - 0.2;
      for (let i = 0; i < n; i++) {
        const G = r() < (k ? 0.3 : 0.75) ? B.lit : B.glass;
        G.setColor(k ? glass() : '#5a5048'); rect(G, f, s0 + i * w, s0 + (i + 1) * w, y0, y1, o); nPane++;
      }
      D.setColor(FRAME); rect(D, f, s0, s1, y0 + 0.95, y0 + 1.02, o + 0.03); // the rail
    }
    D.setColor(FRAME);
    for (let i = 0; i <= n; i++) { const s = s0 + i * w; rect(D, f, Math.max(s0, s - 0.04), Math.min(s1, s + 0.04), q.y0, q.y1, o + 0.03); }
    D.setColor(WHITE);
    for (let k = Math.max(1, b.k0); k < NL; k++) box(D, f, s0 - 0.05, s1 + 0.05, fy(k) - 0.12, fy(k) + 0.12, o, 0.28, 'ftlru');
    if (b.k0) box(D, f, s0 - 0.05, s1 + 0.05, q.y0 - 0.1, q.y0 + 0.12, o, 0.28, 'ftlru');
    D.setColor(DARK); box(D, f, s0, s1, eave - 0.2, eave + 0.18, o, 0.28, 'ftu');
  }

  // a brick gable over [g0, g1] of an end face: the brick triangle, dark metal rakes, an oculus under the apex
  function gable(f, g0, g1) {
    const gm = (g0 + g1) / 2, i0 = g0 + 0.6, i1 = g1 - 0.6, top = eave + (gm - i0) * PITCH; // the band's inner line
    K.setColor('#ffffff');
    const tri = [at(f, i0, eave), at(f, i1, eave), at(f, gm, top)];
    K.face(tri, f.N);
    // the rakes: a dark band 0.6 m wide inside the roof line, standing 0.1 proud, and the roof's end above it
    D.setColor(SEAM);
    for (const [a, b2] of [[g0, gm], [g1, gm]]) {
      const ia = a === g0 ? i0 : i1;
      quad(D, at(f, a, eave, 0.1), at(f, gm, ridge, 0.1), at(f, gm, top, 0.1), at(f, ia, eave, 0.1), f.N);
      quad(D, at(f, a, fy(NB), 0.1), at(f, ia, fy(NB), 0.1), at(f, ia, eave, 0.1), at(f, a, eave, 0.1), f.N);
      quad(D, at(f, a, fy(NB), 0), at(f, a, fy(NB), 0.1), at(f, a, eave, 0.1), at(f, a, eave, 0), a === g0 ? [-f.ux, 0, -f.uz] : f.U);
    }
    // the oculus: a dark round window in a pale ring
    const cy = top - 1.5, ring = (rad, o) => Array.from({ length: 14 }, (_, k) => at(f, gm + rad * Math.cos(k / 14 * 2 * Math.PI), cy + rad * Math.sin(k / 14 * 2 * Math.PI), o));
    D.setColor('#d8d4cc'); D.face(ring(0.62, 0.03), f.N);
    B.glass.setColor('#3a4048'); B.glass.face(ring(0.46, 0.05), f.N);
  }

  // the brick entrance porch under the street canopy: a lit glass door in front, a window on its far side
  function vestibule(f, s0, s1, d) {
    const y1 = fy(1) - 0.5, m = (s0 + s1) / 2, g = face(xz(at(f, s0, 0, d)), xz(at(f, s1, 0, d)), f.nx, f.nz);
    box(K, f, s0, s1, gB, y1, 0, d, 'lrt', U1);
    g.cuts = [{ s0: m - 0.75, s1: m + 0.75, y0: Y(0), y1: Y(2.4), door: true, glass: '#5a5048', lit: true, frame: FRAME, rev: DARK, dep: 0.2, pitch: 0.75 }];
    skin(K, g, gB, y1, '#ffffff', U1); hole(B, g, g.cuts[0]);
    D.setColor(DARK); box(D, f, s0 - 0.05, s1 + 0.05, y1, y1 + 0.15, 0, d + 0.05, 'ftlr');
    solid(S, f, s0, s1, 0, d, gB, y1 + 0.15);
  }
  // a flat dark canopy on slim posts, its underside pale
  function canopy(f, s0, s1, d) {
    const y1 = fy(1) - 0.25, y0 = y1 - 0.22;
    D.setColor(DARK); box(D, f, s0, s1, y0, y1, 0, d, 'ftlr');
    D.setColor('#cfcac2'); box(D, f, s0, s1, y0, y1, 0, d, 'u');
    for (const s of [s0 + 0.25, (s0 + s1) / 2, s1 - 0.25]) {
      D.setColor(DARK); box(D, f, s - 0.06, s + 0.06, gB, y0, d - 0.35, d - 0.23, 'flrb');
      const p = at(f, s, 0, d - 0.29); S.cyl(p[0], p[2], gB, y0, 0.08, 0.08, 'pole');
    }
    solid(S, f, s0, s1, 0, d, y0, y1, 'awning', 1);
  }

  // the roof: the flat strip behind the front and over the wing, the gable roof (slabs 0.2 thick, 0.3 over the ends)
  D.setColor('#55585b');
  D.fill([[XF, ZN], [XF, ZS], [XF - STRIP, ZS], [XF - STRIP, ZN]], [], eave + 0.02, true);
  D.fill([[XR, ZWN], [XR, ZS], [XW, ZS], [XW, ZWN]], [], eave + 0.02, true);
  {
    const xa = XF - GV0, xm = XF - (GV0 + GV1) / 2, xb = XF - GV1, z0 = ZN - 0.3, z1 = ZS + 0.3, t = 0.2;
    M_.setColor('#5a5e63');
    for (const [xe, nx] of [[xa, 1], [xb, -1]]) {
      const len = Math.hypot(xm - xe, RISE), ny = Math.abs(xm - xe) / len, nh = RISE / len;
      const N = [nx * nh, ny, 0];
      // top: seams run down the slope (u along z)
      quad(M_, [xe, eave + t, z0], [xm, ridge + t, z0], [xm, ridge + t, z1], [xe, eave + t, z1], N, [[z0, 0], [z0, len], [z1, len], [z1, 0]]);
      D.setColor('#3f4246');
      quad(D, [xe, eave, z0], [xm, ridge, z0], [xm, ridge, z1], [xe, eave, z1], [-N[0], -N[1], 0]);
      for (const [z, nz] of [[z0, -1], [z1, 1]]) quad(D, [xe, eave, z], [xm, ridge, z], [xm, ridge + t, z], [xe, eave + t, z], [0, 0, nz]);
      quad(D, [xe, eave, z0], [xe, eave, z1], [xe, eave + t, z1], [xe, eave + t, z0], [nx, 0, 0]);
    }
    D.setColor(DARK); box(D, face([xm, z0], [xm, z1], 1, 0), 0, z1 - z0, ridge + t - 0.02, ridge + t + 0.12, -0.12, 0.12, 'ftblr');
    // collision: the two slopes as sloped prisms over the eaves
    S.prism([xa, ZN, xa, ZS, xm, ZS, xm, ZN], eave, eave + PITCH * xa, -PITCH, 0, 'roof');
    S.prism([xm, ZN, xm, ZS, xb, ZS, xb, ZN], eave, eave - PITCH * xb, PITCH, 0, 'roof');
    // four tall brick chimneys rising from the foot of the street slope, well over the eaves as rendered
    for (const zc of [ZN + 4.2, ZN + 12.6, ZN + 21.0, ZN + 29.4]) {
      const x0 = xa + 0.3, x1 = x0 - 1.2, yb = eave - 0.1, yt = eave + 4.6;
      K.setColor('#ffffff');
      const fc = face([x0, zc + 0.75], [x0, zc - 0.75], 1, 0);
      box(K, fc, 0, 1.5, yb, yt, -1.2, 0, 'fblr', U1);
      D.setColor(DARK); box(D, fc, -0.08, 1.58, yt, yt + 0.14, -1.28, 0.08, 'ftblru');
      S.box(x1, yb, zc - 0.75, x0, yt + 0.14, zc + 0.75, 'equipment');
    }
  }
  // collision: the block and the wing up to the eaves
  S.prism([XF, ZN, XF, ZS, XR, ZS, XR, ZN], gB, eave + 0.2, 0, 0, 'wall');
  S.prism([XR, ZWN, XR, ZS, XW, ZS, XW, ZWN], gB, eave + 0.2, 0, 0, 'wall');

  // the street fence: black bars between brick piers, a gate gap at the entrance path, a hedge behind it
  {
    const fz = face([FENCE_X, FENCE_Z[1]], [FENCE_X, FENCE_Z[0]], 1, 0), L = fz.L, gs = [FENCE_Z[1] - GATE[1], FENCE_Z[1] - GATE[0]];
    const runs = [[0, gs[0]], [gs[1], L]];
    for (const [a, b2] of runs) {
      const n = Math.max(1, Math.round((b2 - a) / 3.2)), w = (b2 - a) / n;
      for (let i = 0; i <= n; i++) {
        const s = a + i * w;
        if (i === 0 || i === n) { // brick piers with pale caps at the gate and the lot's ends, slim posts between
          K.setColor('#ffffff'); box(K, fz, s - 0.22, s + 0.22, gB, gHi + 1.9, -0.22, 0.22, 'fblr', U1);
          D.setColor('#cfcac2'); box(D, fz, s - 0.26, s + 0.26, gHi + 1.9, gHi + 2.0, -0.26, 0.26, 'ftblr');
        } else { D.setColor('#2a2c2f'); box(D, fz, s - 0.05, s + 0.05, gB, gHi + 1.7, -0.05, 0.05, 'fblrt'); }
        if (i < n) {
          const m = at(fz, s + w / 2, 0), y0 = heightAt(m[0], m[2]) + 0.08;
          B.fence.setColor('#ffffff');
          const P = (ss, y) => at(fz, ss, y), u0 = s + (i === 0 ? 0.22 : 0.05), u1 = s + w - (i === n - 1 ? 0.22 : 0.05);
          quad(B.fence, P(u0, y0), P(u1, y0), P(u1, gHi + 1.6), P(u0, gHi + 1.6), fz.N, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
          D.setColor('#2f3a28'); box(D, fz, u0, u1, y0 - 0.3, y0 + 0.75, -1.0, -0.4, 'ftblr');
        }
      }
      solid(S, fz, a - 0.22, b2 + 0.22, -0.22, 0.22, gB, gHi + 1.9);
    }
  }

  const M = {
    brick: new THREE.MeshStandardMaterial({ map: brickTex(r), vertexColors: true, roughness: 0.9 }),
    seam: new THREE.MeshStandardMaterial({ map: seamTex(), vertexColors: true, roughness: 0.45, metalness: 0.4 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.4 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3, emissive: 0xffd6a0, emissiveIntensity: 0 }),
    fence: new THREE.MeshStandardMaterial({ map: fenceTex(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }),
  };
  const out = finish(root, 'narbutivska10', B, M, { shade: ['brick', 'seam', 'det'] });
  console.log(`[cherkasy] Narbutivska 10: ${nWin} windows, ${nPane} bay panes, floor ${yF.toFixed(1)} m (ground ${gLo.toFixed(1)}–${gHi.toFixed(1)}), ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    footprints: [{ poly: ring, h: ridge - gLo, kind: 'apt', name: 'Новобудова · вул. Нарбутівська, 10' }],
    clear: (x, z) => x > XW - 3 && x < FENCE_X + 0.5 && z > FENCE_Z[0] - 1 && z < FENCE_Z[1] + 1,
    update() { M.lit.emissiveIntensity = 1.1 * nightK.value; },
  };
}
