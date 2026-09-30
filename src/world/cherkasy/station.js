// OWNER: cherkasy. Залізничний вокзал «Черкаси», вул. Володимира Ложешнікова, 1 (OSM way 104134847; 1961–63, architect
// L. Chuprina, the first joint rail + bus terminal in the USSR; repaired 2012), its platforms and the railway through
// the city. Rebuilt after the Wikimedia Commons photos (2010, 2012, 2020: city side, platforms, the view from the
// footbridge) and OSM (platforms 185963592 / 186378228, footbridge 169356109 with stairs 103581121 / 169356108):
//   - the station: the long one-storey waiting hall with a full-height white-mullioned glass wall (28 bays, three rows
//     of panes) to the square, a dark red-brown eave slab over it, a cream fascia and red coping; blue «ВОКЗАЛ» letters
//     on the roof; the four-storey hotel tower with its thin red roof slab; the low wing north-east of it; the main
//     entrance at the south-west end – a recessed glazed portal with a round clock, steps and a small «Черкаси» plate;
//     two storeys of windows and doors to the platform; granite plinth, cream render;
//   - platform 1 along the building under the 150 m flat canopy on salmon-pink columns with the blue «ЧЕРКАСИ» letters
//     on its end, the island platform 2 with twin-globe lamps, pedestrian crossings over track 1, a black fence;
//   - the footbridge over the whole yard (deck ~8.4 m up on concrete piers, open grey railings, lamps, straight stairs
//     of 58 and 64 steps down to the square and to the south side);
//   - parked stock: a four-car electric train in the KVBZ white / violet / orange livery at platform 1, a rake of blue
//     UZ coaches with a yellow band at platform 2, the green ChME3 shunter and a few freight wagons in the yard;
//     colour-light signals at the platform ends, lattice floodlight masts;
//   - the square: the city bus / trolleybus stop with shelters, tall twin-arm street lamps, benches, a taxi sign;
//   - the railway network itself (every track of map.json `rails`, crossings, catenary) comes from station_rails.js.
// Lit at night: the hall glazing, tower windows, the letters, the clock, lamps.
//   STATION_SKIP: the OSM id replaced here (buildings.js skips it)
//   levelStation(hf) -> level | null   flattens the terrain under the station, platforms and the yard next to it
//   buildStation({ root, map, solids, zips, heightAt, ground, geo }) -> { update(dt), clear(x, z), footprints } | null
// Everything is modelled in the station frame: origin at the south-west front corner of the building, +x (s) along
// the front towards the north-east (the tracks run along it), +z (d) back from the square to the tracks, y up from
// the levelled ground. The whole site is square to the OSM tracks (track 1 lies at d = 34.45).
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { OVERHANG } from '../collision.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { rng, area2 } from './geo.js';
import { buildRails, along, nearestRail } from './station_rails.js';

const OSM_ID = 104134847;
export const STATION_SKIP = new Set([OSM_ID]);

// station frame
const O = [-2079.3, 777.4], ROT = 0.0824, CR = Math.cos(ROT), SR = Math.sin(ROT);
const W = (s, d) => [O[0] + s * CR + d * SR, O[1] - s * SR + d * CR];
const LOC = (x, z) => { const a = x - O[0], b = z - O[1]; return [a * CR - b * SR, a * SR + b * CR]; };
const T1 = 34.45, T2 = 41.4;             // track 1 and the track on the far side of the island platform
const PLAT = 0.7;                         // platform top over the ground (rail head at +0.53)
const HALL = 7.8, TOWER = 15.2, WING = 4.8;
const C = { cream: '#e9d3b4', creamD: '#d8bf9c', red: '#8a3326', redD: '#6e281e', granite: '#55575a', white: '#f1f0ec', frame: '#e8e8e6',
  roof: '#4f5052', pink: '#e2a68c', conc: '#b4b1aa', steel: '#c9cccd', dark: '#232426', lamp: '#fff3d8' };
const UP = [0, 1, 0];

// ------------------------------------------------------------------------------------------------ textures
const stucco = () => canvasTex(256, 256, (g, w, h) => {
  const r = rng(631);
  g.fillStyle = '#f5f3ef'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
});
// platform paving, 6 m per repeat: grey concrete pavers, a red-brown band every repeat and a diagonal red one (photos)
const paveTex = () => canvasTex(512, 512, (g, w) => {
  const r = rng(632), p = w / 30;
  g.fillStyle = '#6d6a66'; g.fillRect(0, 0, w, w);
  for (let i = 0; i < 30; i++) for (let j = 0; j < 30; j++) {
    const band = i === 0 || i === 1 || Math.abs(i - j) < 1, v = 140 + r() * 26;
    g.fillStyle = band ? `rgb(${(v * 0.85) | 0},${(v * 0.52) | 0},${(v * 0.42) | 0})` : `rgb(${v | 0},${(v * 0.98) | 0},${(v * 0.95) | 0})`;
    g.fillRect(i * p + 1, j * p + 1, p - 2, p - 2);
  }
});
// freestanding letters: coloured glyphs on transparent, mirrored for the back
const lettersTex = (text, color, mirror = false) => canvasTex(1024, 192, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  if (mirror) { g.translate(w, 0); g.scale(-1, 1); }
  g.fillStyle = color; g.font = 'bold 170px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 8, w - 16);
}, { repeat: false });
const plateTex = () => canvasTex(512, 96, (g, w, h) => {
  g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1b1c1e'; g.font = 'bold 64px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('ЧЕРКАСИ', w / 2, h / 2 + 3);
}, { repeat: false });
const clockTex = () => canvasTex(256, 256, (g, w) => {
  const c = w / 2;
  g.fillStyle = '#26282a'; g.fillRect(0, 0, w, w);
  g.fillStyle = '#fbfaf5'; g.beginPath(); g.arc(c, c, c - 10, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1c1d1f';
  for (let k = 0; k < 12; k++) { g.save(); g.translate(c, c); g.rotate(k * Math.PI / 6); g.fillRect(-4, -c + 18, 8, k % 3 ? 16 : 28); g.restore(); }
}, { repeat: false });
const taxiTex = () => canvasTex(256, 96, (g, w, h) => {
  g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#161616'; for (let i = 0; i < 8; i++) g.fillRect(i * 32 + (i % 2) * 0, 0, 16, 12);
  g.font = 'bold 56px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ТАКСІ', w / 2, h / 2 + 8);
}, { repeat: false });

// ------------------------------------------------------------------------------------------------ terrain
// the median level over the building, the platforms and ~120 m of yard either side, eased back over 30 m
export function levelStation(hf) {
  return hf.pad([W(-130, -32), W(205, -32), W(205, 58), W(-130, 58)], 30);
}

// ------------------------------------------------------------------------------------------------ helpers
// an axis-aligned facade in the station frame: 'z' faces lie in a z = c plane, 'x' faces in x = c; sg: outward sign.
// Openings [a0, a1, y0, y1] are cut out of the wall rectangle (kept with reveals and glass behind).
function face(ax, c, sg) {
  const P = ax === 'z' ? (a, y, o = 0) => [a, y, c + sg * o] : (a, y, o = 0) => [c + sg * o, y, a];
  const N = ax === 'z' ? [0, 0, sg] : [sg, 0, 0];
  return { P, N, R: ax === 'z' ? [1, 0, 0] : [0, 0, 1] };
}
const quad = (M, F, a0, a1, y0, y1, o = 0, n = F.N) => M.face([F.P(a0, y0, o), F.P(a1, y0, o), F.P(a1, y1, o), F.P(a0, y1, o)], n);
function punched(M, F, a0, a1, y0, y1, holes) {
  const ys = [...new Set([y0, y1, ...holes.flatMap(([, , b0, b1]) => [b0, b1])])].filter((y) => y >= y0 && y <= y1).sort((p, q) => p - q);
  for (let i = 0; i + 1 < ys.length; i++) {
    const ya = ys[i], yb = ys[i + 1], cut = holes.filter(([, , b0, b1]) => b0 <= ya && b1 >= yb).sort((p, q) => p[0] - q[0]);
    let a = a0;
    for (const [h0, h1] of cut) { if (h0 > a) quad(M, F, a, h0, ya, yb); a = Math.max(a, h1); }
    if (a < a1) quad(M, F, a, a1, ya, yb);
  }
}
// a window in a punched face: reveals, glass (lit or not), a white frame with a centre mullion, a sill
function windowIn(B, F, a0, a1, y0, y1, lit, rev = 0.16) {
  const R = F.R, L = R.map((v) => -v);
  B.wall.setColor(C.creamD);
  B.wall.face([F.P(a0, y0, 0), F.P(a0, y1, 0), F.P(a0, y1, -rev), F.P(a0, y0, -rev)], R);
  B.wall.face([F.P(a1, y0, 0), F.P(a1, y0, -rev), F.P(a1, y1, -rev), F.P(a1, y1, 0)], L);
  B.wall.face([F.P(a0, y1, 0), F.P(a1, y1, 0), F.P(a1, y1, -rev), F.P(a0, y1, -rev)], [0, -1, 0]);
  B.wall.setColor(C.cream);
  const G = lit ? B.lit : B.glass;
  G.setColor(lit ? '#8a7f68' : '#3a4650'); quad(G, F, a0, a1, y0, y1, -rev);
  B.det.setColor(C.frame);
  const fr = 0.06, o1 = -rev + 0.05, m = (a0 + a1) / 2;
  for (const [p, q, r0, r1] of [[a0, a0 + fr, y0, y1], [a1 - fr, a1, y0, y1], [a0, a1, y1 - fr, y1], [a0, a1, y0, y0 + fr], [m - fr / 2, m + fr / 2, y0, y1]]) {
    quad(B.det, F, p, q, r0, r1, o1);
  }
  B.det.setColor(C.white); quad(B.det, F, a0 - 0.05, a1 + 0.05, y0 - 0.02, y0, 0.06, UP);
  quad(B.det, F, a0 - 0.05, a1 + 0.05, y0 - 0.06, y0 - 0.02, 0.06);
}
// a closed polygon's vertical walls (local [x, z] ring), outward faces only
function walls(M, ring, y0, y1) {
  const a2 = area2(ring);
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length], l = Math.hypot(bx - ax, bz - az);
    if (l < 1e-3) continue;
    const s = a2 > 0 ? 1 : -1, n = [s * (bz - az) / l, 0, -s * (bx - ax) / l];
    M.face([[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], n);
  }
}

// ------------------------------------------------------------------------------------------------ build
export function buildStation({ root, map, solids: S, zips: Z, heightAt, ground, geo }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), s0 = S.count, r = rng(OSM_ID % 99991);
  const g = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 0; };
  const [cx, cz] = W(36, 12), Y = g(cx, cz) + 0.12; // the levelled ground (+ a hair over the draped land)
  const group = Object.assign(new THREE.Group(), { name: 'station' });
  root.add(group);
  const xf = M4(O[0], Y, O[1], ROT);
  const B = { wall: new MB(), det: new MB(), glass: new MB(), lit: new MB(), pave: new MB(), glow: new MB() };
  for (const k of Object.keys(B)) B[k].setXf(xf);
  const { wall: Wl, det: D } = B;
  // collision helpers in the station frame
  const ring = (pts) => { const q = pts.map(([s, d]) => W(s, d)); return area2(q) < 0 ? q.reverse() : q; };
  const prism = (pts, y0, y1, kind = 'wall', flags = 0) => S.prism(ring(pts).flat(), Y + y0, Y + y1, 0, 0, kind, flags);
  const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const cyl = (s, d, y0, y1, rr, kind = 'pole') => { const [x, z] = W(s, d); S.cyl(x, z, Y + y0, Y + y1, rr, rr, kind); };

  const yardC = W(40, 45);
  const rails = buildRails({ root: group, map, heightAt, ground, solids: S, geo }, {
    yard: [yardC[0], yardC[1], 520],
    skipMast: (x, z) => { const [s, d] = LOC(x, z); return s > -90 && s < 165 && d > 20 && d < T1 - 1.3; }, // platform 1, canopy, building
  });

  // ================================================================================== the station building
  // ---- the waiting hall's glass wall to the square (x 8.5..52.2): 28 bays, transoms at 3.7 / 5.2 m
  const FZ = face('z', 0, -1), G0 = 8.5, G1 = 52.2, NB = 28, bw = (G1 - G0) / NB;
  D.setColor(C.granite); D.box(G0, -0.8, -0.12, G1, 0.45, 0.2, 2 | 4 | 32);
  Wl.setColor(C.cream); Wl.box(G0, 0.45, -0.06, G1, 1.0, 0.2, 4 | 32);
  B.lit.setColor('#7d7564'); quad(B.lit, FZ, G0, G1, 1.0, 6.3, -0.14);
  D.setColor(C.frame);
  for (let i = 0; i <= NB; i++) { const x = G0 + i * bw; D.box(x - 0.05, 1.0, -0.06, x + 0.05, 6.3, 0.14, 1 | 2 | 32); }
  for (const y of [1.0, 3.7, 5.2, 6.24]) D.box(G0, y - 0.04, -0.06, G1, y + 0.04, 0.14, 4 | 8 | 32);
  // ---- the south-west entrance: a recessed glazed portal (4 x 3 panes, two door pairs, the round clock)
  const E0 = 1.3, E1 = 7.2, ED = 1.2;
  Wl.setColor(C.cream);
  Wl.box(0, 0.45, -0.02, E0, 6.3, 0.3, 32 | 2); Wl.box(E1, 0.45, -0.02, G0, 6.3, 0.3, 32 | 1);
  Wl.face([[E0, 0.45, 0], [E0, 6.3, 0], [E0, 6.3, ED], [E0, 0.45, ED]], [1, 0, 0]);
  Wl.face([[E1, 0.45, 0], [E1, 0.45, ED], [E1, 6.3, ED], [E1, 6.3, 0]], [-1, 0, 0]);
  Wl.face([[E0, 6.3, 0], [E1, 6.3, 0], [E1, 6.3, ED], [E0, 6.3, ED]], [0, -1, 0]);
  D.setColor(C.granite); D.box(0, -0.8, -0.12, E0, 0.45, 0.2, 2 | 4 | 32); D.box(E1, -0.8, -0.12, G0, 0.45, 0.2, 1 | 4 | 32);
  B.lit.setColor('#86806f'); B.lit.face([[E0, 0.45, ED], [E1, 0.45, ED], [E1, 6.3, ED], [E0, 6.3, ED]], [0, 0, -1]);
  D.setColor('#d9dadb');
  for (let i = 0; i <= 4; i++) { const x = E0 + (E1 - E0) * i / 4; D.box(x - 0.06, 0.45, ED - 0.1, x + 0.06, 6.3, ED, 32 | 1 | 2); }
  for (const y of [0.5, 2.9, 4.4, 6.25]) D.box(E0, y - 0.05, ED - 0.1, E1, y + 0.05, ED, 32 | 4 | 8);
  D.setColor('#6c7074'); for (const x of [E0 + 0.35, E0 + (E1 - E0) / 2 + 0.35]) D.box(x, 0.5, ED - 0.14, x + 2.2, 2.85, ED - 0.1, 32); // door leaves
  // steps up to the portal (floor +0.45), with handrails
  D.setColor('#9d9b97');
  for (let k = 0; k < 3; k++) D.box(E0 - 0.6, -0.3, -1.6 + k * 0.45, E1 + 0.6, 0.15 * (k + 1), ED, 4 | 8 | 32 | 1 | 2);
  D.setColor('#2c2d2f'); for (const x of [E0 - 0.3, E1 + 0.3]) { D.tube([x, 0.95, -1.6], [x, 1.35, 0], 0.03, 5); D.box(x - 0.02, 0.1, -1.62, x + 0.02, 0.95, -1.58); }
  prism(rect(E0 - 0.6, -1.6, E1 + 0.6, ED), -0.5, 0.45, 'steps');
  // the clock: a round face in the portal glazing (hands turn with the local time), and the plate beside it
  const CK = [(E0 + E1) / 2, 4.95, ED - 0.2], CKR = 0.62;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.44), new THREE.MeshStandardMaterial({ map: plateTex(), roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0 }));
  // ---- the rest of the building's walls, cream render over a granite plinth
  // hall + south-west block (x 0..52.2), the rear block (x 52.2..73.3, z 14..24.7) and the low wing (z 0.4..14)
  const hallRing = [[0, 0], [52.2, 0], [52.2, 24.7], [4.4, 24.7], [4.4, 12.1], [0, 12.1]];
  const FB = face('z', 24.7, 1); // the platform side: two storeys, doors to the platform, over the full length
  {
    const holes = [], wins = [];
    for (let x = 6.2; x + 1.6 < 72.5; x += 3.3) {
      const door = [4, 7, 10].includes(Math.round((x - 6.2) / 3.3)) || Math.round((x - 6.2) / 3.3) === 15;
      holes.push([x, x + 1.7, door ? 0.45 : 1.1, door ? 3.0 : 2.9]); wins.push([x, x + 1.7, door ? 0.45 : 1.1, door ? 3.0 : 2.9, door]);
      holes.push([x, x + 1.7, 5.0, 6.7]); wins.push([x, x + 1.7, 5.0, 6.7, false]);
    }
    Wl.setColor(C.cream); punched(Wl, FB, 4.4, 73.3, 0.45, HALL, holes);
    for (const [a0, a1, y0, y1, door] of wins) {
      if (door) { B.det.setColor('#5d6166'); quad(B.det, FB, a0, a1, y0, y1, -0.12); B.lit.setColor('#80786a'); quad(B.lit, FB, a0 + 0.12, a1 - 0.12, 1.2, y1 - 0.15, -0.1); }
      else windowIn(B, FB, a0, a1, y0, y1, r() < 0.35);
    }
    D.setColor(C.granite); quad(D, FB, 4.4, 73.3, -0.8, 0.45, 0.05);
  }
  // south-west end (x = 0, z 0..12.1), the notch (z = 12.1, x 0..4.4) and x = 4.4 (z 12.1..24.7): a few windows
  for (const [F, a0, a1, ws] of [[face('x', 0, -1), 0, 12.1, [[3.2, 5.0], [8.0, 9.8]]], [face('z', 12.1, 1), 0, 4.4, []], [face('x', 4.4, -1), 12.1, 24.7, [[15, 16.8], [19.5, 21.3]]]]) {
    const holes = ws.flatMap(([a, b]) => [[a, b, 1.2, 2.9], [a, b, 5.0, 6.6]]);
    Wl.setColor(C.cream); punched(Wl, F, a0, a1, 0.45, HALL, holes);
    for (const [a, b, y0, y1] of holes) windowIn(B, F, a, b, y0, y1, r() < 0.3);
    D.setColor(C.granite); quad(D, F, a0, a1, -0.8, 0.45, 0.05);
  }
  // eave slab over the glass and the entrance, cream fascia, red coping round the whole hall roof
  D.setColor(C.red); D.box(-0.2, 6.3, -1.15, G1, 6.55, 0.2);
  Wl.setColor(C.cream); Wl.box(0, 6.55, -0.08, G1, HALL, 0.2, 2 | 32);
  D.setColor(C.roof); D.fill(hallRing, [], HALL, true); D.fill(rect(52.2, 14, 73.3, 24.7), [], HALL, true);
  D.setColor(C.red);
  for (const [a, b] of [[[0, 0], [52.2, 0]], [[0, 0], [0, 12.1]], [[0, 12.1], [4.4, 12.1]], [[4.4, 12.1], [4.4, 24.7]], [[4.4, 24.7], [73.3, 24.7]], [[73.3, 14], [73.3, 24.7]], [[60.6, 14], [73.3, 14]]]) {
    const x0 = Math.min(a[0], b[0]) - 0.25, x1 = Math.max(a[0], b[0]) + 0.25, z0 = Math.min(a[1], b[1]) - 0.25, z1 = Math.max(a[1], b[1]) + 0.25;
    D.box(x0, HALL, z0, x1, HALL + 0.18, z1);
  }
  // rooftop: vent stacks and a brown chimney pot (the photos), the «ВОКЗАЛ» letters on a steel frame
  D.setColor('#7c5a45'); D.box(40.5, HALL, 9, 41.6, HALL + 1.0, 10.1); D.box(22, HALL, 16, 23.2, HALL + 0.8, 17.2);
  D.setColor('#9fa2a3'); D.box(30, HALL, 18, 32.5, HALL + 1.2, 20); D.box(12, HALL, 20, 13.2, HALL + 0.7, 21.2);
  const VX0 = 17.5, VX1 = 31, VY0 = HALL + 0.45, VY1 = HALL + 2.35, VZ = 1.4;
  D.setColor('#3a3c3f');
  for (const x of [VX0 + 1, (VX0 + VX1) / 2, VX1 - 1]) { D.box(x - 0.05, HALL, VZ + 0.05, x + 0.05, VY1 - 0.2, VZ + 0.15); D.tube([x, HALL, VZ + 1.4], [x, VY1 - 0.4, VZ + 0.12], 0.04, 4); }
  D.box(VX0, VY0 - 0.08, VZ + 0.05, VX1, VY0, VZ + 0.18);
  // ---- the hotel tower (x 52.2..60.6, z -1.9..14): four storeys, one window per floor to the square
  {
    const FL = [0, 4.6, 8.0, 11.4], wy = (k) => [FL[k] + 0.95, FL[k] + 2.55];
    const TF = face('z', -1.9, -1), TNE = face('x', 60.6, 1), TSW = face('x', 52.2, -1), TR = face('z', 14, 1);
    const specs = [
      [TF, 52.2, 60.6, [55.3, 57.5], [1, 2, 3], 0],
      [TNE, -1.9, 14, [[1.2, 2.9], [5.3, 7.0], [9.4, 11.1]], [1, 2, 3], WING],
      [TSW, -1.9, 14, [[1.2, 2.9], [5.3, 7.0], [9.4, 11.1]], [2, 3], HALL],
      [TR, 52.2, 60.6, [[53.6, 55.3], [57.5, 59.2]], [2, 3], HALL],
    ];
    for (const [F, a0, a1, cols, floors, yLow] of specs) {
      const cs = Array.isArray(cols[0]) ? cols : [cols], holes = [];
      for (const k of floors) for (const [a, b] of cs) holes.push([a, b, ...wy(k)]);
      Wl.setColor(C.cream); punched(Wl, F, a0, a1, F === TF ? 3.4 : yLow, TOWER, holes);
      for (const [a, b, y0, y1] of holes) windowIn(B, F, a, b, y0, y1, r() < 0.45);
      if (F === TNE) { Wl.setColor(C.cream); quad(Wl, F, -1.9, 0.4, 0.45, WING); }
      if (F === TSW) { Wl.setColor(C.cream); quad(Wl, F, -1.9, 0, 0.45, HALL); }
    }
    // the ground floor to the square: a glazed door with a transom, a window, a small red canopy
    const GF = [[52.2, 54.8, 0.45, 3.4], [54.8, 57.4, 0.45, 3.4], [57.4, 60.6, 0.45, 3.4]];
    Wl.setColor(C.cream); quad(Wl, TF, GF[0][0], GF[0][1], 0.45, 3.4); quad(Wl, TF, GF[2][0], GF[2][1], 0.45, 3.4);
    quad(Wl, TF, 54.8, 55.1, 0.45, 3.4); quad(Wl, TF, 57.1, 57.4, 0.45, 3.4);
    windowIn(B, TF, 58.2, 59.9, 1.2, 2.8, r() < 0.4); // (drawn over the plain wall: the reveal frame still reads)
    B.det.setColor('#9fa4a8'); quad(B.det, TF, 55.1, 57.1, 0.45, 3.2, -0.1);
    B.lit.setColor('#8a816c'); quad(B.lit, TF, 55.25, 56.05, 0.6, 2.4, -0.08); quad(B.lit, TF, 56.15, 56.95, 0.6, 2.4, -0.08); quad(B.lit, TF, 55.25, 56.95, 2.55, 3.1, -0.08);
    D.setColor(C.red); D.box(54.3, 3.4, -3.0, 57.9, 3.55, -1.9);
    D.setColor(C.granite); quad(D, TF, 52.2, 60.6, -0.8, 0.45, 0.05);
    D.setColor(C.red); D.box(51.6, TOWER, -2.5, 61.2, TOWER + 0.25, 14.6);
    D.setColor(C.roof); D.box(52.3, TOWER + 0.25, -1.8, 60.5, TOWER + 0.3, 13.9, 4);
    D.setColor('#3a3c3f'); // roof railing and the service ladder on the north-east face
    for (const [a, b] of [[[52.4, -1.7], [60.4, -1.7]], [[60.4, -1.7], [60.4, 13.8]], [[60.4, 13.8], [52.4, 13.8]], [[52.4, 13.8], [52.4, -1.7]]]) {
      D.tube([a[0], TOWER + 1.3, a[1]], [b[0], TOWER + 1.3, b[1]], 0.03, 4);
      const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
      for (let i = 0; i <= n; i++) { const t = i / n; D.box(a[0] + (b[0] - a[0]) * t - 0.02, TOWER + 0.25, a[1] + (b[1] - a[1]) * t - 0.02, a[0] + (b[0] - a[0]) * t + 0.02, TOWER + 1.3, a[1] + (b[1] - a[1]) * t + 0.02); }
    }
    for (const z of [12.2, 12.8]) D.box(60.62, WING, z - 0.02, 60.68, TOWER + 1.2, z + 0.02);
    for (let y = WING + 0.3; y < TOWER + 1; y += 0.35) D.box(60.62, y, 12.2, 60.68, y + 0.03, 12.8);
    prism(rect(52.2, -1.9, 60.6, 14), -0.5, TOWER + 0.25);
    Z.edge(...W(52.2, -1.9), ...W(60.6, -1.9), Y + TOWER + 0.25, ...[-SR, -CR]);
  }
  // ---- the low north-east wing (x 60.6..73.3, z 0.4..14) and the upper storey of the rear block above it
  {
    const FW = face('z', 0.4, -1), FE = face('x', 73.3, 1), FU = face('z', 14, -1);
    const w1 = [[62.2, 64.0], [65.9, 67.7], [69.6, 71.4]].map(([a, b]) => [a, b, 1.2, 3.1]);
    Wl.setColor(C.cream); punched(Wl, FW, 60.6, 73.3, 0.45, WING, w1);
    for (const [a, b, y0, y1] of w1) {
      windowIn(B, FW, a, b, y0, y1, r() < 0.4);
      D.setColor('#2c2d2f'); for (let x = a + 0.2; x < b; x += 0.25) quad(D, FW, x - 0.015, x + 0.015, y0, y1, 0.04); // bars
    }
    const e1 = [[3, 4.8, 1.2, 3.1], [8, 9.8, 1.2, 3.1], [17, 18.8, 1.2, 2.9], [21, 22.8, 1.2, 2.9], [17, 18.8, 5.0, 6.6], [21, 22.8, 5.0, 6.6]];
    punched(Wl, FE, 0.4, 14, 0.45, WING, e1.filter(([a]) => a < 14)); punched(Wl, FE, 14, 24.7, 0.45, HALL, e1.filter(([a]) => a > 14));
    for (const [a, b, y0, y1] of e1) windowIn(B, FE, a, b, y0, y1, r() < 0.3);
    const u1 = [[62, 63.7, 5.0, 6.6], [66, 67.7, 5.0, 6.6], [70, 71.7, 5.0, 6.6]];
    Wl.setColor(C.cream); punched(Wl, FU, 60.6, 73.3, WING, HALL, u1);
    for (const [a, b, y0, y1] of u1) windowIn(B, FU, a, b, y0, y1, r() < 0.3);
    D.setColor(C.granite); quad(D, FW, 60.6, 73.3, -0.8, 0.45, 0.05); quad(D, FE, 0.4, 24.7, -0.8, 0.45, 0.05);
    D.setColor(C.red); D.box(60.6, WING - 0.25, -0.6, 74.2, WING, 14); D.box(73.3, WING - 0.25, 0.4, 74.2, WING, 14);
    D.setColor(C.roof); D.box(60.6, WING, 0.4, 73.3, WING + 0.02, 14, 4);
    D.setColor('#3a3c3f'); D.tube([61, WING + 1.1, 0.2], [73.1, WING + 1.1, 0.2], 0.03, 4);
    for (let x = 61; x <= 73.1; x += 1.5) D.box(x - 0.02, WING, 0.18, x + 0.02, WING + 1.1, 0.22);
    prism(rect(60.6, 0.4, 73.3, 14), -0.5, WING);
    prism(rect(52.2, 14, 73.3, 24.7), -0.5, HALL + 0.18);
  }
  prism(hallRing, -0.5, HALL + 0.18);
  for (const [a, b, n] of [[[0, 0], [52.2, 0], [-SR, -CR]], [[4.4, 24.7], [73.3, 24.7], [SR, CR]]]) Z.edge(...W(...a), ...W(...b), Y + HALL + 0.18, ...n);

  // ================================================================================== platforms, canopy, crossings
  const PV = B.pave;
  const platform = (x0, x1, z0, z1, edges) => {
    // top in pavers (uv in metres, 6 m texture), concrete sides, white edge band + yellow line on the track sides
    PV.face([[x0, PLAT, z0], [x1, PLAT, z0], [x1, PLAT, z1], [x0, PLAT, z1]].map(([x, y, z]) => [x, y, z]), UP);
    D.setColor('#a7a49d'); D.box(x0, -0.4, z0, x1, PLAT, z1, 1 | 2 | 16 | 32);
    for (const [ze, sg] of edges) {
      D.setColor('#eeeeea'); D.box(x0, PLAT, Math.min(ze, ze - sg * 0.45), x1, PLAT + 0.012, Math.max(ze, ze - sg * 0.45), 4);
      D.setColor('#e3b829'); D.box(x0, PLAT, Math.min(ze - sg * 0.75, ze - sg * 0.9), x1, PLAT + 0.012, Math.max(ze - sg * 0.75, ze - sg * 0.9), 4);
    }
    // ramps down at both ends
    for (const [xa, xb] of [[x0, x0 - 4], [x1, x1 + 4]]) {
      D.setColor('#9e9b94');
      D.face([[xa, PLAT, z0], [xa, PLAT, z1], [xb, 0.02, z1], [xb, 0.02, z0]], xb < xa ? [-0.17, 0.98, 0] : [0.17, 0.98, 0]);
      D.face([[xa, 0, z0], [xa, PLAT, z0], [xb, 0.02, z0]], [0, 0, -1]); D.face([[xa, 0, z1], [xb, 0.02, z1], [xa, PLAT, z1]], [0, 0, 1]);
      // y = Y + kk (s - xb), s = (x - Ox) CR - (z - Oz) SR
      const kk = PLAT / (xa - xb);
      S.prism(ring(rect(Math.min(xa, xb), z0, Math.max(xa, xb), z1)).flat(), Y - 0.4, Y - kk * (O[0] * CR - O[1] * SR + xb), kk * CR, -kk * SR, 'ramp');
    }
    prism(rect(x0, z0, x1, z1), -0.4, PLAT, 'platform');
  };
  const P1 = [-85, 160, 24.7, T1 - 1.75], P2 = [-387, 160, T1 + 1.75, T2 - 1.75];
  platform(P1[0], P1[1], P1[2], P1[3], [[P1[3], 1]]);
  platform(P2[0], P2[1], P2[2], P2[3], [[P2[2], -1], [P2[3], 1]]);
  // pedestrian crossings over track 1 (OSM railway=crossing nodes at s 8.3 / 32.2 / 80.4): rubber decks at rail level
  for (const s of [8.3, 32.2, 80.4]) {
    D.setColor('#343536'); D.box(s - 1.5, 0.5, P1[3], s + 1.5, 0.56, P2[2], 4 | 1 | 2);
    D.setColor('#e3b829'); D.box(s - 1.5, 0.56, P1[3] + 0.1, s - 1.35, 0.565, P2[2] - 0.1, 4); D.box(s + 1.35, 0.56, P1[3] + 0.1, s + 1.5, 0.565, P2[2] - 0.1, 4);
  }
  // the canopy over platform 1: a flat slab falling to the track, one row of salmon-pink columns (two where the
  // building does not carry it), a white fascia; lights under it
  const CA0 = -30, CA1 = 78, CZ0 = 24.7, CZ1 = 32.2, CY = 4.1;
  {
    const top = (z) => CY + 0.3 - 0.25 * (z - CZ0) / (CZ1 - CZ0);
    D.setColor('#5c5e60'); D.face([[CA0, top(CZ0), CZ0], [CA1, top(CZ0), CZ0], [CA1, top(CZ1), CZ1], [CA0, top(CZ1), CZ1]]);
    D.setColor('#e9e8e3'); D.face([[CA0, CY - 0.1, CZ0], [CA0, CY - 0.1, CZ1], [CA1, CY - 0.1, CZ1], [CA1, CY - 0.1, CZ0]], [0, -1, 0]);
    D.box(CA0, CY - 0.45, CZ1 - 0.3, CA1, CY + 0.12, CZ1, 1 | 2 | 16 | 32 | 8);
    for (const x of [CA0, CA1]) D.face(x === CA0 ? [[x, CY - 0.1, CZ0], [x, top(CZ0), CZ0], [x, top(CZ1), CZ1], [x, CY - 0.1, CZ1]] : [[x, CY - 0.1, CZ0], [x, CY - 0.1, CZ1], [x, top(CZ1), CZ1], [x, top(CZ0), CZ0]], [x === CA0 ? -1 : 1, 0, 0]);
    D.setColor('#dcdad4'); D.box(CA0, CY - 0.5, 30.35, CA1, CY - 0.1, 30.85, 1 | 2 | 8 | 16 | 32);
    for (let x = CA0 + 2; x <= CA1 - 1; x += 6.5) {
      D.setColor(C.pink); D.cyl(x, PLAT, 30.6, 0.2, 0.2, CY - 0.5 - PLAT, 12, false);
      cyl(x, 30.6, 0, CY, 0.2, 'column');
      if (x < 4.4 || x > 73.3) { D.cyl(x, PLAT, 25.6, 0.2, 0.2, CY - PLAT - 0.1, 12, false); cyl(x, 25.6, 0, CY, 0.2, 'column'); }
      B.glow.setColor('#fff4dc'); B.glow.box(x + 3, CY - 0.13, 27.4, x + 3.8, CY - 0.1, 27.6, 8);
    }
    prism(rect(CA0, CZ0, CA1, CZ1), CY - 0.45, CY + 0.3, 'awning', OVERHANG);
  }
  // black steel fence along the back of platform 1 past the building
  D.setColor('#1f2022');
  for (const [a, b] of [[P1[0] + 1, -1], [74, P1[1] - 1]]) {
    for (const y of [PLAT + 0.15, PLAT + 1.55]) D.box(a, y, 24.85, b, y + 0.05, 24.9);
    for (let x = a; x <= b; x += 0.15) D.box(x - 0.012, PLAT, 24.86, x + 0.012, PLAT + 1.6 + 0.08 * Math.cos((x - a) / 2.4 * Math.PI * 2), 24.89);
    for (let x = a; x <= b; x += 2.4) D.box(x - 0.04, PLAT, 24.84, x + 0.04, PLAT + 1.75, 24.91);
    prism(rect(a, 24.8, b, 24.95), PLAT, PLAT + 1.6, 'fence');
  }
  // benches on the platforms, twin-globe lamps on the island and beyond the canopy
  const lampsAt = [];
  for (let x = P2[0] + 8; x < P2[1] - 4; x += 24) lampsAt.push([x, (P2[2] + P2[3]) / 2]);
  for (const x of [-80, -58, -40, 90, 112, 134, 155]) lampsAt.push([x, 31.2]);
  for (const [x, z] of lampsAt) {
    D.setColor('#26282a'); D.cyl(x, PLAT, z, 0.09, 0.06, 3.9, 8); D.box(x - 0.55, PLAT + 3.85, z - 0.03, x + 0.55, PLAT + 3.9, z + 0.03);
    B.glow.setColor(C.lamp); for (const dx of [-0.5, 0.5]) B.glow.ellipsoid([x + dx, PLAT + 4.15, z], [0.2, 0.2, 0.2], 10, 6);
    cyl(x, z, PLAT, PLAT + 4, 0.1);
  }
  for (const [x, z] of [[14, 27.5], [26, 27.5], [44, 27.5], [-60, 37.9], [-12, 37.9], [60, 37.9], [118, 37.9]]) {
    D.setColor('#2b4a6f'); D.box(x - 0.9, PLAT + 0.42, z - 0.22, x + 0.9, PLAT + 0.47, z + 0.22); D.box(x - 0.9, PLAT + 0.55, z + 0.18, x + 0.9, PLAT + 0.9, z + 0.23);
    D.setColor('#2c2d2f'); for (const dx of [-0.75, 0.75]) D.box(x + dx - 0.03, PLAT, z - 0.2, x + dx + 0.03, PLAT + 0.9, z + 0.23);
  }

  // ================================================================================== the footbridge
  {
    const FX = -34, HW = 1.4, DY = 8.4, Z0 = -5, ZA = 17, ZB = 143, Z1 = 169;
    const stairs = (za, zb, n) => { // a straight flight from the ground at za to the deck at zb
      const run = (zb - za) / n, rise = DY / n;
      D.setColor('#8f8c86');
      for (let k = 0; k < n; k++) {
        const z0 = za + k * run, z1 = z0 + run * 1.02;
        D.box(FX - HW + 0.15, rise * k - 0.1, Math.min(z0, z1), FX + HW - 0.15, rise * (k + 1), Math.max(z0, z1), 1 | 2 | 4 | 16 | 32);
      }
      D.setColor('#9aa3a8');
      for (const sg of [-1, 1]) { // stringers and the handrail
        const x = FX + sg * (HW - 0.1);
        D.face([[x, -0.3, za], [x, DY - 0.5, zb], [x, DY + 0.1, zb], [x, 0.3, za]], [sg, 0, 0]);
        D.tube([x, 1.0, za], [x, DY + 1.0, zb], 0.035, 5);
        for (let t = 0; t <= 1.001; t += 1 / 8) D.box(x - 0.02, DY * t, za + (zb - za) * t - 0.02, x + 0.02, DY * t + 1.0, za + (zb - za) * t + 0.02);
      }
      // collision: a plane-topped ramp (the car may climb it: 21° is under walkSlope)
      // y = Y + k (d - za), d = (x - Ox) SR + (z - Oz) CR
      const k = DY / (zb - za);
      const a0 = Y - k * (O[0] * SR + O[1] * CR + za), z0 = Math.min(za, zb), z1 = Math.max(za, zb);
      S.prism(ring(rect(FX - HW, z0, FX + HW, z1)).flat(), Y - 1, a0, k * SR, k * CR, 'stairs');
      for (const sg of [-1, 1]) S.prism(ring(rect(FX + sg * HW - 0.12, z0, FX + sg * HW + 0.12, z1)).flat(), Y - 1, a0 + 3, k * SR, k * CR, 'railing'); // taller than the rail: the car must not hop it
      // piers under the upper half
      const zm = za + (zb - za) * 0.6;
      D.setColor(C.conc); for (const sg of [-1, 1]) D.box(FX + sg * 1.0 - 0.2, -0.3, zm - 0.2, FX + sg * 1.0 + 0.2, DY * 0.6 - 0.2, zm + 0.2);
    };
    stairs(Z0, ZA, 56); stairs(Z1, ZB, 60);
    // deck: slab, edge girders, open railing with bars, lamps on the railing
    D.setColor('#c8cbcb'); D.box(FX - HW, DY - 0.3, ZA, FX + HW, DY, ZB, 4 | 8 | 1 | 2);
    D.setColor('#b9bdbf'); for (const sg of [-1, 1]) D.box(FX + sg * HW - 0.12, DY - 1.0, ZA, FX + sg * HW + 0.12, DY + 0.15, ZB, 1 | 2 | 4 | 8);
    D.setColor('#d9dcdc');
    for (const sg of [-1, 1]) {
      const x = FX + sg * (HW - 0.05);
      for (const y of [DY + 0.5, DY + 1.15]) D.box(x - 0.03, y, ZA, x + 0.03, y + 0.05, ZB);
      for (let z = ZA; z <= ZB; z += 0.6) D.box(x - 0.015, DY + 0.15, z - 0.015, x + 0.015, DY + 1.15, z + 0.015);
      prism(rect(x - 0.08, ZA, x + 0.08, ZB), DY, DY + 1.2, 'railing');
    }
    for (let z = ZA + 8; z < ZB; z += 24) {
      const x = FX + HW - 0.05; D.setColor('#2a2c2e'); D.cyl(x, DY, z, 0.05, 0.04, 3.3, 6); D.box(x - 0.9, DY + 3.25, z - 0.04, x, DY + 3.3, z + 0.04);
      B.glow.setColor(C.lamp); B.glow.box(x - 0.95, DY + 3.12, z - 0.12, x - 0.55, DY + 3.25, z + 0.12);
    }
    prism(rect(FX - HW, ZA, FX + HW, ZB), DY - 0.3, DY, 'bridge', OVERHANG);
    // piers: pairs of concrete columns with a cap beam, set where the tracks leave room (~every 20 m)
    const piers = [];
    for (let z = ZA + 6; z < ZB - 4; z += 1) {
      const [x, zz] = W(FX, z), room = nearestRail(rails.lines, x, zz);
      if (room < 2.7) continue;
      if (piers.length && z - piers[piers.length - 1].z < 16) { if (room > piers[piers.length - 1].room + 0.5 && z - piers[piers.length - 1].z < 4) piers[piers.length - 1] = { z, room }; continue; }
      piers.push({ z, room });
    }
    for (const { z } of piers) {
      D.setColor(C.conc);
      for (const sg of [-1, 1]) { D.box(FX + sg * 1.0 - 0.25, -0.3, z - 0.25, FX + sg * 1.0 + 0.25, DY - 1.0, z + 0.25); cyl(FX + sg * 1.0, z, -0.3, DY - 1.0, 0.3, 'pier'); }
      D.box(FX - HW - 0.2, DY - 1.5, z - 0.4, FX + HW + 0.2, DY - 1.0, z + 0.4);
    }
  }

  // ================================================================================== the square
  {
    // the stop "Залізничний вокзал" (OSM platform 185963230 at d -11.2): two glass shelters, benches, a bin
    for (const x0 of [22, 38]) {
      D.setColor('#5f676d'); for (const [x, z] of [[x0, -10.4], [x0 + 5, -10.4], [x0, -9.0], [x0 + 5, -9.0]]) D.box(x - 0.05, 0, z - 0.05, x + 0.05, 2.6, z + 0.05);
      D.box(x0 - 0.3, 2.6, -11.3, x0 + 5.3, 2.72, -8.8);
      B.glass.setColor('#7f98a3'); B.glass.box(x0, 0.2, -9.02, x0 + 5, 2.5, -8.98, 32 | 16);
      D.setColor('#6c4a2e'); D.box(x0 + 0.5, 0.45, -9.5, x0 + 4.5, 0.5, -9.1);
      cyl(x0, -10.4, 0, 2.7, 0.08); cyl(x0 + 5, -10.4, 0, 2.7, 0.08);
      prism(rect(x0, -9.05, x0 + 5, -8.95), 0, 2.6, 'shelter');
    }
    // tall twin-arm street lamps along the square (the photos) and the taxi sign by the entrance
    for (const x of [-4, 21, 46, 71]) {
      const z = -14;
      D.setColor('#8d9296'); D.cyl(x, -0.2, z, 0.16, 0.09, 10.2, 8);
      for (const sg of [-1, 1]) { D.tube([x, 9.6, z], [x + sg * 1.6, 10.3, z], 0.05, 5); B.glow.setColor(C.lamp); B.glow.box(x + sg * 1.6 - 0.35, 10.15, z - 0.15, x + sg * 1.6 + 0.35, 10.25, z + 0.15); D.setColor('#8d9296'); }
      cyl(x, z, 0, 10, 0.16);
    }
    D.setColor('#3a3c3f'); D.cyl(-3, 0, -4, 0.05, 0.05, 2.6, 6); cyl(-3, -4, 0, 2.6, 0.06);
  }
  const taxi = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), new THREE.MeshStandardMaterial({ map: taxiTex(), roughness: 0.5, side: THREE.DoubleSide }));

  // ================================================================================== meshes
  const mats = {
    wall: new THREE.MeshStandardMaterial({ map: stucco(), vertexColors: true, roughness: 0.88 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.4, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.2, emissive: 0xffd9a0, emissiveIntensity: 0 }),
    pave: new THREE.MeshStandardMaterial({ map: paveTex(), roughness: 0.85 }),
    glow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: 0xfff0d0, emissiveIntensity: 0, map: null }),
    clock: new THREE.MeshStandardMaterial({ map: clockTex(), roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0, side: THREE.DoubleSide }),
    train: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 }),
  };
  mats.wall.map.repeat.set(0.25, 0.25);
  mats.pave.map.repeat.set(1 / 6, 1 / 6);
  mats.clock.emissiveMap = mats.clock.map;
  // pavers: world-metre uv from the local x / z (the builder's face uv is planar already, in metres)
  let nV = 0;
  const add = (Bk, mat, name, shadow = true) => {
    if (!Bk.v) return null;
    nV += Bk.v;
    const m = new THREE.Mesh(Bk.build(), mat);
    m.name = 'station-' + name; m.castShadow = shadow; m.receiveShadow = true;
    group.add(m);
    return m;
  };
  // the clock face lives in B.glow's first vertices: give it its own material by splitting it off
  const clockB = new MB(); clockB.setXf(xf);
  {
    const seg = 32, mid = clockB.vert(CK[0], CK[1], CK[2], 0, 0, -1, 0.5, 0.5), rim = [];
    for (let k = 0; k <= seg; k++) { const a = (k / seg) * Math.PI * 2; rim.push(clockB.vert(CK[0] - CKR * Math.cos(a), CK[1] + CKR * Math.sin(a), CK[2], 0, 0, -1, 0.5 - 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a))); }
    for (let k = 0; k < seg; k++) clockB.tri(mid, rim[k + 1], rim[k]);
  }
  add(B.wall, mats.wall, 'walls'); add(B.det, mats.det, 'details'); add(B.glass, mats.glass, 'glass', false); add(B.lit, mats.lit, 'lit', false);
  add(B.pave, mats.pave, 'platforms', false); add(clockB, mats.clock, 'clock', false);
  add(B.glow, mats.glow, 'lamps', false);
  // clock hands: two thin bars pivoting at the centre
  const hands = [0.42, 0.56].map((len, i) => {
    const h = new THREE.Mesh(new THREE.BoxGeometry(i ? 0.03 : 0.05, len, 0.02).translate(0, len / 2 - 0.06, 0), new THREE.MeshStandardMaterial({ color: 0x151617, roughness: 0.5 }));
    const [x, z] = W(CK[0], CK[2] - 0.04);
    h.position.set(x, Y + CK[1], z); h.rotation.order = 'YXZ'; h.rotation.y = ROT + Math.PI;
    group.add(h); return h;
  });
  // freestanding letters: «ВОКЗАЛ» on the roof to the square, «ЧЕРКАСИ» on the canopy end (both ways)
  const letterMats = [];
  const letters = (text, w, h, s, y, d, yaw, color, back = null) => { // back: the letters' reverse (mirrored) colour; none = readable both ways
    for (const [c, mirror, flip] of [[color, false, 0], [back ?? color, !!back, Math.PI]]) {
      const m = new THREE.MeshStandardMaterial({ map: lettersTex(text, c, mirror), transparent: true, alphaTest: 0.4, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0, side: THREE.FrontSide });
      m.emissiveMap = m.map; if (!mirror) letterMats.push(m);
      const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m), [x, z] = W(s, d);
      q.position.set(x, Y + y, z); q.rotation.y = ROT + yaw + flip; q.name = 'station-letters';
      group.add(q);
    }
  };
  letters('ВОКЗАЛ', VX1 - VX0, (VY1 - VY0) * 1.25, (VX0 + VX1) / 2, (VY0 + VY1) / 2, VZ, Math.PI, '#1d4fc0', '#dfe2e4');
  letters('ЧЕРКАСИ', 7.2, 1.35, CA1 - 0.4, CY + 1.05, (CZ0 + CZ1) / 2, Math.PI / 2, '#1d4fc0');
  letters('ЧЕРКАСИ', 7.2, 1.35, CA0 + 0.4, CY + 1.05, (CZ0 + CZ1) / 2, -Math.PI / 2, '#1d4fc0');
  {
    const F = new MB(); F.setXf(xf); F.setColor('#3a3c3f');
    for (const x of [CA1 - 0.4, CA0 + 0.4]) for (const z of [25.6, 31.2]) F.box(x - 0.04, CY + 0.25, z - 0.04, x + 0.04, CY + 1.7, z + 0.04);
    add(F, mats.det, 'letter-frames');
  }
  { const [x, z] = W(E1 + 1.9, -0.04); plate.position.set(x, Y + 5.35, z); plate.rotation.y = ROT + Math.PI; group.add(plate); }
  { const [x, z] = W(-3, -4); taxi.position.set(x, Y + 2.55, z); taxi.rotation.y = ROT + Math.PI; group.add(taxi); }

  // ================================================================================== railway, rolling stock, signals
  const lineAt = (s, d) => { // the track whose centre line passes nearest to the station-frame point
    const [x, z] = W(s, d);
    let best = null, bd = 2.5;
    for (const L of rails.lines) for (let i = 1; i < L.pts.length; i++) {
      const [ax, az] = L.pts[i - 1], [bx, bz] = L.pts[i], ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)), dd = Math.hypot(x - ax - ex * t, z - az - ez * t);
      if (dd < bd) { bd = dd; best = { L, s: L.cum[i - 1] + t * Math.sqrt(l2) }; }
    }
    return best;
  };
  const T = B.train = new MB();
  const cars = []; // [line, s centre, length, kind, flip]
  const consist = (s, d, list) => { // list of [len, kind] from the station-frame point along +s, 1 m gaps
    const at = lineAt(s, d);
    if (!at) return;
    const dir = along(at.L, at.s + 1).x - along(at.L, at.s).x; // does line distance run with +s? (the frame's +s is mostly +x)
    let c = at.s;
    const sg = dir < 0 ? -1 : 1;
    for (const [len, kind, flip = false] of list) { cars.push([at.L, c + sg * len / 2, len, kind, flip !== (sg < 0)]); c += sg * (len + 1.2); }
  };
  consist(-24, T1, [[26, 'emuHead', true], [25, 'emuMid'], [25, 'emuPanto'], [26, 'emuHead']]);
  consist(-330, T2, [[24.5, 'coach'], [24.5, 'coach'], [24.5, 'coach'], [24.5, 'coach'], [24.5, 'coach'], [24.5, 'coach']]);
  consist(78, 52.9, [[17.2, 'chme3']]);
  consist(-230, 47.8, [[12, 'tank'], [12, 'tank'], [12, 'tank'], [14.7, 'box'], [14.7, 'box'], [12, 'tank']]);
  for (const [L, s, len, kind, flip] of cars) {
    const a = along(L, s - len / 2 + 3.2), b = along(L, s + len / 2 - 3.2);
    const px = (a.x + b.x) / 2, pz = (a.z + b.z) / 2, hx = b.x - a.x, hz = b.z - a.z, yaw = Math.atan2(-hz, hx) + (flip ? Math.PI : 0);
    const yr = g(px, pz) + 0.53;
    T.with(M4(px, yr, pz, yaw), (M) => rollingStock(M, kind, len));
    // one oriented box per car: the car can bump into parked trains
    S.obox(px, pz, len / 2, 1.6, Math.atan2(hz, hx), yr, yr + (kind === 'tank' ? 3.9 : 4.2), 'train');
  }
  add(T, mats.train, 'trains');

  // colour-light signals at the platform ends (red aspect lit) and lattice floodlight masts over the yard
  const SG = new MB(), SL = new MB(), FL = new MB();
  const signal = (s, d, face) => {
    const [x, z] = W(s, d), y = g(x, z), yaw = ROT + face;
    SG.with(M4(x, y, z, yaw), (M) => {
      M.setColor('#2a2b2d'); M.cyl(0, 0, 0, 0.1, 0.08, 5.2, 8); M.box(-0.22, 4.1, -0.18, 0.22, 5.3, 0.12);
      M.setColor('#1b1c1e'); for (const yy of [4.35, 4.7, 5.05]) M.box(-0.2, yy - 0.12, -0.3, 0.2, yy + 0.12, -0.18);
    });
    SL.with(M4(x, y, z, yaw), (M) => { M.setColor('#ff2a1a'); M.cyl(0, 5.0, -0.2, 0.09, 0.09, 0.02, 10); M.box(-0.09, 4.96, -0.33, 0.09, 5.14, -0.31); });
    S.cyl(x, z, y, y + 5.2, 0.12, 0.12, 'pole');
  };
  signal(168, T1 + 3.0, -Math.PI / 2); signal(168, T2 - 3.0, -Math.PI / 2); signal(-395, T1 + 3.0, Math.PI / 2); signal(-395, T2 - 3.0, Math.PI / 2);
  const tower = (s, d) => {
    let best = null;
    for (let ds = -6; ds <= 6; ds++) for (let dd = -4; dd <= 4; dd += 0.5) {
      const [x, z] = W(s + ds, d + dd), room = nearestRail(rails.lines, x, z);
      if (room > 3 && (!best || room > best.room)) best = { x, z, room };
    }
    if (!best) return;
    const { x, z } = best, y = g(x, z), H = 28;
    SG.setColor('#8a8f93');
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) SG.tube([x + a * 1.1, y, z + b * 1.1], [x + a * 0.45, y + H, z + b * 0.45], 0.06, 4);
    for (let k = 0; k < 9; k++) {
      const t0 = k / 9, t1 = (k + 1) / 9, w0 = 1.1 - 0.65 * t0, w1 = 1.1 - 0.65 * t1;
      for (const [a, b, c2, d2] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) SG.tube([x + a * w0, y + H * t0, z + b * w0], [x + c2 * w1, y + H * t1, z + d2 * w1], 0.03, 3);
    }
    SG.box(x - 1.3, y + H, z - 1.3, x + 1.3, y + H + 0.15, z + 1.3);
    FL.setColor(C.lamp); for (const [a, b] of [[-0.8, -1.25], [0, -1.25], [0.8, -1.25], [-0.8, 1.25], [0.8, 1.25]]) FL.box(x + a - 0.28, y + H + 0.3, z + b - 0.08, x + a + 0.28, y + H + 0.85, z + b + 0.08);
    S.cyl(x, z, y, y + H, 1.2, 0.5, 'mast');
  };
  tower(118, 45); tower(-150, 45);
  const sigMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: 0xff2a14, emissiveIntensity: 0 });
  add(SG, mats.det, 'masts'); add(SL, sigMat, 'signal-lamps', false); add(FL, mats.glow, 'floodlights', false);

  // ================================================================================== trees, footprints, report
  const inBox = (x, z, x0, z0, x1, z1) => { const [s, d] = LOC(x, z); return s > x0 && s < x1 && d > z0 && d < z1; };
  console.log(`[cherkasy] station: ${cars.length} rail vehicles, ${(nV / 1000).toFixed(1)}k verts, ${S.count - s0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  const clockTick = { t: -1 };
  return {
    footprints: [
      { poly: ring(hallRing), h: HALL, kind: 'public', name: 'Залізничний вокзал «Черкаси»' },
      { poly: ring(rect(52.2, -1.9, 60.6, 14)), h: TOWER, kind: 'public' },
      { poly: ring(rect(52.2, 0.4, 73.3, 24.7)), h: HALL, kind: 'public' },
    ],
    clear: (x, z) => inBox(x, z, -95, -18, 175, 44) || inBox(x, z, -20, -34, 80, -18) || inBox(x, z, -40, -8, -28, 172) || rails.clear(x, z),
    update() {
      const k = nightK.value;
      mats.lit.emissiveIntensity = 1.1 * k; mats.glow.emissiveIntensity = 2.2 * k; mats.clock.emissiveIntensity = 0.45 * k;
      for (const m of letterMats) m.emissiveIntensity = 0.9 * k;
      sigMat.emissiveIntensity = 1.2 + 1.5 * k;
      const now = new Date(), t = now.getHours() * 60 + now.getMinutes();
      if (t !== clockTick.t) { // hands: z-rotation in the clock plane (the plane faces the square)
        clockTick.t = t;
        hands[0].rotation.z = -((t % 720) / 720) * Math.PI * 2;
        hands[1].rotation.z = -((t % 60) / 60) * Math.PI * 2;
      }
    },
  };
}

// ------------------------------------------------------------------------------------------------ rolling stock
// car-local frame: x along the car (centre at 0), y up from the rail head, z across. A body is a lofted cross-section:
// the right half from the skirt up to the roof ridge, mirrored, each band in its livery colour.
const LIVERY = {
  emu: { skirt: '#3b3d42', low: '#f4f4f2', stripe: '#ef6b1c', win: '#1b1f2a', up: '#3d3b9c', roof: '#b9bcc0', nose: '#ef6b1c' },
  coach: { skirt: '#2d2f33', low: '#1f4c93', stripe: '#f0c73a', win: '#1f4c93', up: '#1f4c93', roof: '#8d9094', nose: '#1f4c93' },
};
const PROF = [[1.5, 1.05], [1.62, 1.3], [1.62, 1.95], [1.62, 2.05], [1.62, 3.0], [1.58, 3.35], [1.45, 3.75], [1.05, 4.1], [0.45, 4.25], [0, 4.28]];
const BAND = ['skirt', 'low', 'stripe', 'win', 'up', 'up', 'roof', 'roof', 'roof'];
function body(M, x0, x1, lv, sections = null) {
  // sections: [[x, sy, sz]] for a shaped nose (scales about the skirt line); default a straight prism
  const S = sections ?? [[x0, 1, 1], [x1, 1, 1]];
  const pt = ([z, y], [, sy, sz], side) => [side * z * sz, 1.05 + (y - 1.05) * sy];
  for (let i = 0; i + 1 < S.length; i++) {
    const a = S[i], b = S[i + 1];
    for (let k = 0; k + 1 < PROF.length; k++) {
      M.setColor(lv[BAND[k]]);
      for (const side of [1, -1]) {
        const [za0, ya0] = pt(PROF[k], a, side), [za1, ya1] = pt(PROF[k + 1], a, side), [zb0, yb0] = pt(PROF[k], b, side), [zb1, yb1] = pt(PROF[k + 1], b, side);
        const q = [[a[0], ya0, za0], [b[0], yb0, zb0], [b[0], yb1, zb1], [a[0], ya1, za1]];
        const nz = side * (PROF[k + 1][1] - PROF[k][1]), ny = -(PROF[k + 1][0] - PROF[k][0]), l = Math.hypot(nz, ny) || 1;
        M.face(side > 0 ? q : q.slice().reverse(), [0, ny / l, nz / l]);
      }
    }
  }
  for (const [s, sg] of [[S[0], -1], [S[S.length - 1], 1]]) { // end caps
    const ring_ = [...PROF.map((p) => pt(p, s, 1)), ...PROF.slice().reverse().map((p) => pt(p, s, -1))].map(([z, y]) => [s[0], y, z]);
    M.setColor(lv.nose); M.face(ring_, [sg, 0, 0]);
  }
}
function bogie(M, x) {
  M.setColor('#2b2c2e'); M.box(x - 1.5, 0.35, -1.25, x + 1.5, 0.95, 1.25);
  M.setColor('#3a3b3d');
  for (const dx of [-1.2, 1.2]) for (const sg of [-1, 1]) M.tube([x + dx, 0.45, sg * 0.72], [x + dx, 0.45, sg * 0.84], 0.46, 12, true);
}
function rollingStock(M, kind, len) {
  const h = len / 2;
  if (kind.startsWith('emu')) {
    const lv = LIVERY.emu;
    if (kind === 'emuHead') { // the cab end at +x: the nose tapers down to a raked windscreen
      body(M, -h, h - 3, lv);
      body(M, 0, 0, { ...lv, low: lv.nose, stripe: lv.nose, up: lv.win, win: lv.win, roof: lv.nose }, [[h - 3, 1, 1], [h - 1.8, 0.97, 0.99], [h - 0.8, 0.8, 0.93], [h - 0.15, 0.52, 0.8]]);
      M.setColor('#fff8e0'); for (const sg of [-1, 1]) M.box(h - 0.3, 1.55, sg * 0.95 - 0.18, h - 0.1, 1.72, sg * 0.95 + 0.18); // headlights
    } else body(M, -h, h, lv);
    M.setColor('#6d6fa8'); for (const dx of [-h + 4, h - 4]) for (const sg of [-1, 1]) M.box(dx - 0.65, 1.3, sg * 1.62 - 0.01, dx + 0.65, 3.2, sg * 1.635); // doors
    if (kind === 'emuPanto') { // roof equipment and the pantograph up at the wire (~6 m over the rail head)
      M.setColor('#7b7f84'); M.box(-4, 4.25, -0.6, 4, 4.55, 0.6);
      M.setColor('#3a3c3f'); M.box(-0.9, 4.55, -0.7, 0.9, 4.65, 0.7);
      M.tube([-0.6, 4.65, 0], [0.4, 5.3, 0], 0.04, 4); M.tube([0.4, 5.3, 0], [-0.1, 5.92, 0], 0.035, 4);
      M.setColor('#1f2022'); M.box(-0.12, 5.9, -0.9, 0.12, 5.97, 0.9);
    }
    bogie(M, -h + 3.2); bogie(M, h - 3.2);
    M.setColor('#232426'); M.box(-h - 0.6, 1.2, -1.1, -h, 3.6, 1.1);
  } else if (kind === 'coach') {
    const lv = LIVERY.coach;
    body(M, -h, h, lv);
    M.setColor('#1a1c22'); for (let x = -h + 3.6; x < h - 3.4; x += 1.95) for (const sg of [-1, 1]) M.box(x - 0.55, 2.15, sg * 1.62 - 0.01, x + 0.55, 3.0, sg * 1.635);
    M.setColor('#2a3d66'); for (const dx of [-h + 1.1, h - 1.1]) for (const sg of [-1, 1]) M.box(dx - 0.45, 1.3, sg * 1.62 - 0.01, dx + 0.45, 3.2, sg * 1.635);
    bogie(M, -h + 3.2); bogie(M, h - 3.2);
    M.setColor('#232426'); M.box(-h - 0.6, 1.2, -1.1, -h, 3.6, 1.1);
  } else if (kind === 'chme3') { // the Czech-built shunter in the green UZ livery with yellow bands, cab off-centre
    M.setColor('#b3382c'); M.box(-h, 1.05, -1.55, h, 1.45, 1.55);
    M.setColor('#2f6d3c'); M.box(-h + 0.6, 1.45, -1.2, 2.6, 3.7, 1.2); M.box(2.6, 1.45, -1.55, 5.6, 4.55, 1.55); M.box(5.6, 1.45, -1.2, h - 0.5, 3.4, 1.2);
    M.setColor('#e8c53a'); M.box(-h + 0.58, 2.2, -1.22, 2.6, 2.4, 1.22); M.box(2.58, 2.2, -1.57, 5.62, 2.4, 1.57); M.box(5.6, 2.2, -1.22, h - 0.48, 2.4, 1.22);
    M.setColor('#1b1f2a'); for (const sg of [-1, 1]) M.box(3.0, 3.1, sg * 1.56 - 0.01, 5.2, 4.1, sg * 1.57); M.box(2.58, 3.1, -1.1, 2.6, 4.1, 1.1); M.box(5.6, 3.1, -1.1, 5.62, 4.1, 1.1);
    M.setColor('#c9ccce'); M.box(2.5, 4.55, -1.6, 5.7, 4.65, 1.6);
    for (const x of [-h + 3.2, h - 3.2]) { M.setColor('#2b2c2e'); M.box(x - 2.1, 0.35, -1.25, x + 2.1, 1.0, 1.25); M.setColor('#3a3b3d'); for (const dx of [-1.6, 0, 1.6]) for (const sg of [-1, 1]) M.tube([x + dx, 0.5, sg * 0.72], [x + dx, 0.5, sg * 0.84], 0.52, 12, true); }
  } else if (kind === 'tank') {
    M.setColor('#2a2b2d'); M.box(-h, 1.0, -1.3, h, 1.3, 1.3);
    M.setColor('#1d1e20'); M.tube([-h + 0.4, 2.65, 0], [h - 0.4, 2.65, 0], 1.4, 16, true);
    M.box(-0.5, 4.0, -0.5, 0.5, 4.3, 0.5);
    bogie(M, -h + 2.2); bogie(M, h - 2.2);
  } else if (kind === 'box') {
    M.setColor('#7a3f2b'); M.box(-h, 1.0, -1.55, h, 4.3, 1.55);
    M.setColor('#6a3524'); for (let x = -h + 0.8; x < h; x += 1.2) for (const sg of [-1, 1]) M.box(x - 0.05, 1.05, sg * 1.55 - 0.01, x + 0.05, 4.25, sg * 1.57);
    M.setColor('#8a8d90'); M.box(-h, 4.3, -1.45, h, 4.45, 1.45);
    bogie(M, -h + 2.2); bogie(M, h - 2.2);
  }
}
