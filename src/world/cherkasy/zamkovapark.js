// OWNER: cherkasy. Парк під Замковою горою: a planned (not yet real) park on the vacant lot at the foot of Zamkova hora,
// between vul. Kniazia Olherda (the Rose Valley across it), Zamkovyi uzviz and uzviz Kniaziv Koriatovychiv, after the
// architectural visualisation Oleg shared (the OSM "dirt" lot, the construction site where a residential block was
// planned). Laid out from the render: a promenade inside a clipped hedge along Olherda, the round white fountain on its
// plaza to the east (a raised white drum with a broad coping, a white stone apron round it, a stepped inner tier, a ring
// of tall foaming jets, small arching jets off the rim, a bubbling centre: animated), the children's playground (soft
// rubber, sand, two towers with pyramid roofs, a slide, a bridge, swings, a climbing pyramid, spring riders), red rose
// beds in the lawns, wooden pavilions and pergolas to the east, four wooden kiosks round a little plaza with tables to
// the west, benches, park lamps, trees, the bus shelter on Olherda, and stairs zig-zagging up the slope with white
// parapets to the hilltop plateau of zamkova.js (its viewing platform, wall and promenade stay there).
// Two old houses on the lot are rebuilt as they were:
//   - «Будинок з грифонами», the merchant L. Kupershtein's house (1890s, Zamkovyi uzviz 1 at the corner of Olherda, OSM way
//     178369998; a listed monument since 2026), restored to its old look before the 2024 rebuild added a storey: two
//     plastered brick storeys on an L plan, 9 windows a floor on Olherda and 8 on Zamkovyi uzviz (Wikimedia Commons photos
//     2013-2022), segmental window heads, rusticated corners, a string course, panels under the upper windows, a dentil
//     frieze, a grey hipped metal roof with three chimneys, whitewashed (the render); the paired griffin reliefs the house
//     is named for (the photos do not show where) are set in the frieze panel over the middle of the Olherda front and
//     over the yard door;
//   - Zamkovyi uzviz 7 (OSM way 178369992, ruins today): the small old stone house with a tiled hip roof and the arched
//     gate in its lower annex, as the render shows it.
//   ZAMKPARK_SKIP: the two OSM ids rebuilt here (buildings.js skips them)
//   shapeZamkovaPark(hf, map, geo) -> { pads }   terrain hook (city.js, after shapeZamkova): levels the fountain plaza on
//     the gently sloping lot (hf.pad; the rest of the lot keeps its slope)
//   peekZamkovaPark(hf, map, geo)   the phone peek's hook: shapeZamkova + shapeZamkovaPark
//   buildZamkovaPark({ root, T?, map, solids, heightAt, geo }) -> { update(dt), clear(x, z), spots, footprints } | null
//     T: the city texture bundle (lawn texture on the park's ground; without it the plan colours only)
// Layout is in local east / north metres from O = (49.4493, 32.0650) (frame F below), converted with geo. The park's
// ground is one mesh draped on the terrain, coloured by a painted plan (alpha-tested to the lot's outline) with the city
// lawn texture on the lawns and a paver texture on the paving.
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { PARK_GREENS } from '../trees.js';
import { canvasTex, decal } from './sculpt.js';
import { rng, inPoly } from './geo.js';
import { wallFaces, wallAround, fillOpening, fbox, at, quad, stoneTex, UP } from './civic.js';
import { hipRoof } from './blockkit.js';
import { shapeZamkova, PLATEAU, VIEW, PLATEAU_Y } from './zamkova.js';

const PI = Math.PI;
const HOUSE_ID = 178369998, STONE_ID = 178369992;
export const ZAMKPARK_SKIP = new Set([HOUSE_ID, STONE_ID]);
const O = [49.4493, 32.0650];

// ------------------------------------------------------------------------------------------------ layout (east, north m)
// the lot: the OSM dirt area of the construction site
const PARK = [[-15, 43.1], [-10.1, 45.3], [78.5, 20], [82.4, 14.7], [83.6, 8.4], [83, -10.3], [65.3, -34.9], [63.3, -38.3], [46.7, -29.8],
  [33.9, -26], [28.8, -19.4], [23.4, -16], [18, -14.6], [9.5, -16.6], [5.7, -19.4], [0.7, -26.2], [-7.4, -28.4], [-12.7, -33.1], [-23.9, -38.7],
  [-36, -53.6], [-38.1, -57.7], [-39.6, -62.1], [-38.2, -66.5], [-40.5, -76.2], [-47.5, -75.3], [-61.5, -76.6], [-61.8, -36.6], [-42.7, 32.9],
  [-42.9, 33.7], [-37.2, 50.3]];
// the wooded slope between the lot and the hilltop rim (the forest floor there turns to lawn; the flanks keep their trees)
const SLOPE = [[46.7, -29.8], [33.9, -26], [28.8, -19.4], [23.4, -16], [18, -14.6], [9.5, -16.6], [5.7, -19.4], [0.7, -26.2], [-7.4, -28.4],
  [-12.7, -33.1], [-23.9, -38.7], [-36, -53.6], [-31, -64], [-18, -54.5], [-3.5, -46.5], [14, -45.5], [18, -48.8], [28, -58], [34, -70], [41, -62], [52, -42]];
// the verges between the lot and the sidewalks of Zamkovyi uzviz and Olherda: lawn too
const VERGES = [[[-42.9, 33.7], [-61.8, -36.6], [-62.1, -38.4], [-60.1, -25.9], [-55.8, -6.9], [-47.2, 22.6], [-44, 32]],
  [[-10.1, 45.3], [78.5, 20], [83.3, 22.1], [-16.8, 48.2], [-15, 43.1]]];
const GREEN = [PARK, SLOPE, ...VERGES];
const FOUNT = [44, 12], PLAZA_R = 12.5;                 // the fountain plaza
const PLAY = { c: [17, 7.5], a: 11, b: 6.5, rot: -0.12 };   // the playground: centre, half sizes, turn (rad, from east)
const KIOSK = { c: [-30, 14], a: 10, b: 7, rot: 0.1 };      // the kiosk plaza
const ALONG = Math.atan2(-25.3, 88.6);                   // the Olherda edge of the lot
// paths: [width, [e, n] ...]
const PATHS = [
  [3.4, [[-11.6, 41.5], [10, 35.3], [30, 29.6], [44, 25.4], [60, 20.8], [78.5, 15.6], [85, 13.8]]], // the promenade along the hedge
  [3.0, [[-9.2, 46], [-8.6, 36], [-6.8, 24], [-4.6, 12], [-3.2, 2], [-4.6, -10], [-8, -22]]],       // the bus stop to the stairs
  [2.6, [[-20, 13.6], [-12, 12.2], [-4.6, 11.4], [6.5, 9.5]]],                                       // kiosks -> playground
  [2.6, [[28.5, 8], [32.5, 9.5]]],                                                                    // playground -> fountain
  [2.4, [[44.8, 29.5], [44, 24.5]]],                                                                  // the sidewalk -> the fountain
  [2.6, [[53, 3], [58, -6], [62, -17], [62.5, -24]]],                                                 // the fountain -> the pergolas
  [2.4, [[78.5, 15.6], [75.5, 4], [70, -2], [62, -6]]],                                               // round the pavilions
  [2.4, [[56.5, 15.5], [66, 7.5], [70.5, 3]]],
  [2.6, [[-40, 26], [-41.8, 18], [-45, 6], [-49.5, -10], [-53, -24]]],                               // along Zamkovyi uzviz
  [2.2, [[-47.2, 13.4], [-40, 13.8]]],                                                                // the uzviz -> the kiosks
  [2.4, [[-3, 2], [8, -3], [24, -4], [30, 0]]],                                                      // the foot of the slope
];
// rose beds: centre, half axes, turn
const BEDS = [[[6, 23], 8, 3.6, ALONG], [[-15, 25.5], 3.2, 1.9, ALONG + 0.4], [[21, 22.5], 2.6, 2.0, ALONG], [[-21.5, 3.5], 2.8, 1.7, 0.2],
  [[31, 19.5], 2.2, 1.5, ALONG], [[70.5, 13.5], 2.4, 1.6, ALONG]];
// the hedge lines (gaps where the paths come in)
const HEDGES = [
  [[-6.9, 43.2], [42.3, 29.2]], [[47.2, 27.9], [76.2, 19.6]],
  [[-42.9, 28], [-46.2, 15.9]], [[-47.3, 11.6], [-57.7, -26]],
];
const KIOSKS = [[-37, 19.5, -1], [-23, 20.6, -1], [-36.5, 7.5, 1], [-23.5, 8.7, 1]]; // e, n, facing (+1 north, -1 south)
const PAVILIONS = [[67.5, 2.5, ALONG], [76, -7, ALONG - 0.5]];
const PERGOLAS = [[53.5, -10, 1.1], [57, -22, 0.9]];
const SHELTER = [-6.5, 48.1];
// the stairs up the slope to the plateau, west of zamkova.js's viewing deck: waypoints from the park up (landings)
export const STAIRS = [[-8, -22], [-20, -29], [-6, -34], [-20, -39], [-7, -44], [-19, -48.5], [-9, -53]];
const STAIR_W = 3.2;

// ------------------------------------------------------------------------------------------------ frame + 2D helpers
function frameOf(geo) {
  const o = geo.toXZ(O[0], O[1]), k = 111320, ke = k * Math.cos(O[0] * PI / 180);
  const e1 = geo.toXZ(O[0], O[1] + 1 / ke), n1 = geo.toXZ(O[0] + 1 / k, O[1]);
  const E = [e1[0] - o[0], e1[1] - o[1]], N = [n1[0] - o[0], n1[1] - o[1]];
  const le = Math.hypot(...E), ln = Math.hypot(...N); E[0] /= le; E[1] /= le; N[0] /= ln; N[1] /= ln;
  return {
    xz: (e, n) => [o[0] + E[0] * e + N[0] * n, o[1] + E[1] * e + N[1] * n],
    en: (x, z) => [(x - o[0]) * E[0] + (z - o[1]) * E[1], (x - o[0]) * N[0] + (z - o[1]) * N[1]],
    dir: (de, dn) => { const x = E[0] * de + N[0] * dn, z = E[1] * de + N[1] * dn, l = Math.hypot(x, z) || 1; return [x / l, z / l]; },
  };
}
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const lerp = (p, q, s) => [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s];
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const unit = (u) => { const l = Math.hypot(u[0], u[1]) || 1; return [u[0] / l, u[1] / l]; };
function segDist(p, a, b) {
  const e = sub(b, a), l2 = e[0] * e[0] + e[1] * e[1] || 1, s = Math.max(0, Math.min(1, ((p[0] - a[0]) * e[0] + (p[1] - a[1]) * e[1]) / l2));
  return dist(p, lerp(a, b, s));
}
const lineDist = (p, L) => { let d = Infinity; for (let k = 1; k < L.length; k++) d = Math.min(d, segDist(p, L[k - 1], L[k])); return d; };
// a point in a turned ellipse / rectangle (centre c, half axes a, b, turn rot from east)
const local = (p, c, rot) => { const d = sub(p, c), cs = Math.cos(rot), sn = Math.sin(rot); return [d[0] * cs + d[1] * sn, -d[0] * sn + d[1] * cs]; };
const inEll = (p, c, a, b, rot, m = 0) => { const [u, v] = local(p, c, rot); return (u / (a + m)) ** 2 + (v / (b + m)) ** 2 < 1; };
const inRect = (p, c, a, b, rot, m = 0) => { const [u, v] = local(p, c, rot); return Math.abs(u) < a + m && Math.abs(v) < b + m; };
const rectPts = ({ c, a, b, rot }, m = 0) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => {
  const u = i * (a + m), v = j * (b + m), cs = Math.cos(rot), sn = Math.sin(rot); return [c[0] + u * cs - v * sn, c[1] + u * sn + v * cs];
});
const circlePts = (c, r, n = 20) => Array.from({ length: n }, (_, k) => [c[0] + r * Math.cos(k / n * PI * 2), c[1] + r * Math.sin(k / n * PI * 2)]);

// ------------------------------------------------------------------------------------------------ terrain
export function shapeZamkovaPark(hf, map, geo) {
  if (!geo) return null;
  const F = frameOf(geo), W = (P) => P.map(([e, n]) => F.xz(e, n));
  const pads = [hf.pad(W(circlePts(FOUNT, PLAZA_R + 1, 16)), 16)];
  return { pads };
}
export function peekZamkovaPark(hf, map, geo) { shapeZamkova(hf, map, geo); return shapeZamkovaPark(hf, map, geo); }

// ------------------------------------------------------------------------------------------------ textures
const hex = (c, k = 1) => { const n = parseInt(c.slice(1), 16); return `rgb(${[n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.min(255, Math.round(v * k))).join(',')})`; };
// light concrete / stone slabs, 1.2 m a repeat (multiplied over the plan colour, mean ~0.8)
const paverTex = () => canvasTex(256, 256, (c, w, h) => {
  const r = rng(31);
  c.fillStyle = '#9a968e'; c.fillRect(0, 0, w, h);
  const n = 4, p = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n * 2; j++) {
    const v = 205 + r() * 30 | 0, x = i * p + (j & 1 ? p / 2 : 0);
    c.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
    for (const ox of [0, -w]) c.fillRect(x + ox + 1.5, j * p / 2 + 1.5, p - 3, p / 2 - 3);
  }
  for (let q = 0; q < 2500; q++) { c.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '60,55,50'},0.12)`; c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
});
// clipped hedge: dense small leaves, 1.5 m a repeat
const hedgeTex = () => canvasTex(256, 256, (c, w, h) => {
  const r = rng(5);
  c.fillStyle = '#28461b'; c.fillRect(0, 0, w, h);
  for (let q = 0; q < 2600; q++) {
    const g = 60 + r() * 70 | 0, x = r() * w, y = r() * h, s = 2 + r() * 4;
    c.fillStyle = `rgb(${g * 0.55 | 0},${g},${g * 0.35 | 0})`;
    for (const [ox, oy] of [[0, 0], [-w, 0], [0, -h], [-w, -h]]) { c.beginPath(); c.ellipse(x + ox, y + oy, s, s * 0.6, r() * PI, 0, PI * 2); c.fill(); }
  }
});
// a rose bed's canopy: leaves with red blooms (the render's beds are deep red)
const roseTex = () => canvasTex(256, 256, (c, w, h) => {
  const r = rng(9);
  c.fillStyle = '#23401a'; c.fillRect(0, 0, w, h);
  for (let q = 0; q < 1500; q++) { const g = 50 + r() * 60 | 0; c.fillStyle = `rgb(${g * 0.5 | 0},${g},${g * 0.3 | 0})`; c.fillRect(r() * w, r() * h, 3 + r() * 4, 2 + r() * 3); }
  for (let q = 0; q < 1100; q++) { // dense enough that the bed reads red from across the park (the mips average it)
    const x = r() * w, y = r() * h, s = 3 + r() * 4, k = r();
    c.fillStyle = k < 0.75 ? `rgb(${170 + r() * 60 | 0},${10 + r() * 25 | 0},${20 + r() * 25 | 0})` : `rgb(${200 + r() * 40 | 0},${60 + r() * 40 | 0},${80 + r() * 40 | 0})`;
    for (const [ox, oy] of [[0, 0], [-w, 0], [0, -h], [-w, -h]]) { c.beginPath(); c.arc(x + ox, y + oy, s, 0, PI * 2); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.arc(x - s * 0.3, y - s * 0.3, s * 0.35, 0, PI * 2); c.fill();
  }
});
// planks, 1 m a repeat, near white so the vertex colour tints them
const woodTex = () => canvasTex(256, 256, (c, w, h) => {
  const r = rng(17);
  for (let j = 0; j < 8; j++) { const v = 215 + r() * 35 | 0; c.fillStyle = `rgb(${v},${v - 6},${v - 14})`; c.fillRect(0, j * h / 8, w, h / 8); c.fillStyle = 'rgba(60,40,20,0.35)'; c.fillRect(0, j * h / 8, w, 1.5); }
  for (let q = 0; q < 900; q++) { c.fillStyle = `rgba(90,60,30,${0.05 + r() * 0.1})`; c.fillRect(r() * w, r() * h, 6 + r() * 30, 1); }
});
// standing-seam metal roof: seams every 0.5 m (the texture is 1 m)
const seamTex = () => canvasTex(128, 128, (c, w, h) => {
  c.fillStyle = '#d8dadb'; c.fillRect(0, 0, w, h);
  for (const x of [0, w / 2]) { c.fillStyle = '#f2f3f3'; c.fillRect(x, 0, 3, h); c.fillStyle = '#9a9d9f'; c.fillRect(x + 3, 0, 2, h); }
});
// clay pantiles, 1 m a repeat
const pantileTex = () => canvasTex(256, 256, (c, w, h) => {
  const r = rng(23);
  for (let j = 0; j < 6; j++) for (let i = 0; i < 5; i++) {
    const v = r(), x = i * w / 5 + (j & 1 ? w / 10 : 0), y = j * h / 6;
    c.fillStyle = `rgb(${190 + v * 40 | 0},${100 + v * 30 | 0},${70 + v * 20 | 0})`;
    for (const ox of [0, -w]) { c.fillRect(x + ox, y, w / 5, h / 6); c.fillStyle = 'rgba(80,30,20,0.35)'; c.fillRect(x + ox, y + h / 6 - 4, w / 5, 4); c.fillRect(x + ox, y, 2, h / 6); c.fillStyle = `rgb(${190 + v * 40 | 0},${100 + v * 30 | 0},${70 + v * 20 | 0})`; }
  }
});
// the house's frieze: a brick dentil course over a band of small sunk squares, 0.5 m a repeat
const friezeTex = () => canvasTex(128, 64, (c, w, h) => {
  c.fillStyle = '#ecebe5'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) { const x = i * w / 4; c.fillStyle = 'rgba(70,60,50,0.45)'; c.fillRect(x + 4, 4, w / 8, h * 0.32); c.fillStyle = '#f6f5f0'; c.fillRect(x + 3, 3, w / 8 - 2, h * 0.3 - 2); }
  c.fillStyle = 'rgba(70,60,50,0.25)'; c.fillRect(0, h * 0.45, w, 2);
  for (let i = 0; i < 2; i++) { const x = i * w / 2 + w / 8; c.fillStyle = 'rgba(70,60,50,0.4)'; c.fillRect(x, h * 0.58, w / 4, h * 0.3); c.fillStyle = '#e4e2da'; c.fillRect(x + 2, h * 0.6, w / 4 - 4, h * 0.26); }
});
// paired griffins in low relief, facing each other over a vase, in a moulded frame (the house's name)
const griffinTex = () => canvasTex(512, 160, (c, w, h) => {
  c.fillStyle = '#e6e3da'; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(80,70,60,0.5)'; c.lineWidth = 5; c.strokeRect(6, 6, w - 12, h - 12);
  c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 3; c.strokeRect(10, 10, w - 20, h - 20);
  const griffin = (flip, dx, dy, fill) => {
    c.save(); c.translate(w / 2 + dx, dy); c.scale(flip, 1); c.fillStyle = fill;
    c.beginPath(); c.ellipse(-120, 100, 62, 24, -0.08, 0, PI * 2); c.fill();                                // lion body
    for (const [x, y] of [[-165, 112], [-150, 116], [-88, 112], [-74, 114]]) c.fillRect(x, y, 10, 34);       // legs
    c.beginPath(); c.moveTo(-178, 96); c.quadraticCurveTo(-225, 70, -205, 40); c.quadraticCurveTo(-200, 62, -180, 86); c.fill(); // tail
    c.beginPath(); c.moveTo(-140, 84); c.quadraticCurveTo(-170, 20, -120, 18); c.quadraticCurveTo(-95, 40, -100, 84); c.fill(); // raised wing
    c.beginPath(); c.ellipse(-62, 70, 20, 30, 0.35, 0, PI * 2); c.fill();                                   // chest + neck
    c.beginPath(); c.ellipse(-48, 44, 17, 14, 0, 0, PI * 2); c.fill();                                       // eagle head
    c.beginPath(); c.moveTo(-34, 38); c.lineTo(-16, 50); c.lineTo(-34, 52); c.fill();                        // beak
    c.beginPath(); c.moveTo(-58, 32); c.lineTo(-64, 18); c.lineTo(-50, 30); c.fill();                        // ear tuft
    c.fillRect(-46, 76, 26, 9);                                                                              // the raised paw
    c.restore();
  };
  for (const s of [-1, 1]) { griffin(s, 3, 3, 'rgba(70,60,50,0.55)'); griffin(s, -2, -2, '#fbfaf6'); griffin(s, 0, 0, '#ece9e1'); }
  c.fillStyle = 'rgba(70,60,50,0.5)'; c.beginPath(); c.ellipse(w / 2 + 2, 104, 15, 22, 0, 0, PI * 2); c.fill(); c.fillRect(w / 2 - 9, 122, 22, 26);
  c.fillStyle = '#f4f2ec'; c.beginPath(); c.ellipse(w / 2, 102, 14, 21, 0, 0, PI * 2); c.fill(); c.fillRect(w / 2 - 10, 120, 20, 25);
});
// jets: streaks of water, scrolled upward in update()
const jetTex = () => canvasTex(64, 128, (c, w, h) => {
  const r = rng(3);
  c.clearRect(0, 0, w, h);
  for (let q = 0; q < 70; q++) { const x = r() * w, a = 0.25 + r() * 0.55; c.fillStyle = `rgba(255,255,255,${a})`; c.fillRect(x, r() * h, 1 + r() * 3, 10 + r() * 50); }
  c.fillStyle = 'rgba(235,245,255,0.35)'; c.fillRect(0, 0, w, h);
});
// foam where the jets fall: a soft white ring of bubbles
const foamTex = () => canvasTex(128, 128, (c, w, h) => {
  const r = rng(4);
  c.clearRect(0, 0, w, h);
  for (let q = 0; q < 500; q++) {
    const a = r() * PI * 2, d = Math.sqrt(r()) * w * 0.48;
    c.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.5 * (1 - d / (w * 0.5))})`;
    c.beginPath(); c.arc(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 1.5 + r() * 4, 0, PI * 2); c.fill();
  }
}, { repeat: false });

// ------------------------------------------------------------------------------------------------ site
export function buildZamkovaPark({ root, T = null, map, solids: S, heightAt, geo }) {
  if (!geo) return null;
  const t0 = performance.now(), r = rng(1890);
  const F = frameOf(geo);
  // the park's surface: the plan draped 0.2 m over the terrain, and higher where the city ground under it (fanned flat
  // across each 16 m height cell) can stand over the bilinear heightAt: by up to a quarter of the cell's twist. All the
  // furniture stands on this surface.
  const D = map.dem, LC = (D?.cell ?? 8) * 2;
  const g0 = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 12; };
  const cellTwist = (i, j) => { const x0 = D.x0 + i * LC, z0 = D.z0 + j * LC; return Math.abs(g0(x0, z0) + g0(x0 + LC, z0 + LC) - g0(x0 + LC, z0) - g0(x0, z0 + LC)); };
  const twist = (x, z) => {
    if (!D) return 0;
    const i = Math.floor((x - D.x0) / LC), j = Math.floor((z - D.z0) / LC);
    let t = 0; for (const [a, b] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) t = Math.max(t, cellTwist(i + a, j + b)); // the vertex may sit on a cell edge
    return Math.min(0.6, 0.3 * t);
  };
  const g = (x, z) => g0(x, z) + 0.2 + twist(x, z);
  const gEN = (e, n) => g(...F.xz(e, n));
  const PW = PARK.map(([e, n]) => F.xz(e, n));
  const B = {
    wall: new MB(), roof: new MB(), tile: new MB(), stone: new MB(), det: new MB(), wood: new MB(), glass: new MB(), lit: new MB(),
    frieze: new MB(), grif: new MB(), hedge: new MB(), rose: new MB(), pave: new MB(), glow: new MB(), water: new MB(),
  };
  const solidsBefore = S.count ?? 0;
  const keep = [];       // [e, n, r]: structures (no trees)
  const footprints = [];
  // frame for a thing at (e, n) facing the local direction (de, dn): local +z forward, +x to its right
  const frameEN = (e, n, y, de, dn, s = 1) => { const [x, z] = F.xz(e, n), [fx, fz] = F.dir(de, dn); return M4(x, y, z, Math.atan2(fx, fz), s); };
  const oboxEN = (e, n, de, dn, hx, hz, y0, y1, kind = 'wall') => { const [x, z] = F.xz(e, n), [fx, fz] = F.dir(de, dn); return S.obox(x, z, hx, hz, Math.atan2(-fx, fz), y0, y1, kind); };
  const turnDir = (a) => [Math.cos(a), Math.sin(a)];

  // ---------------------------------------------------------------- small furniture
  let nLamps = 0, nBenches = 0;
  const lamp = (e, n, y = gEN(e, n)) => {
    const [x, z] = F.xz(e, n);
    B.det.setColor('#1e2022');
    B.det.cyl(x, y, z, 0.16, 0.12, 0.5, 8).cyl(x, y + 0.5, z, 0.06, 0.05, 3.1, 6).cyl(x, y + 3.6, z, 0.16, 0.06, 0.1, 8);
    B.det.cyl(x, y + 4.12, z, 0.07, 0.2, 0.14, 8, true).cyl(x, y + 4.26, z, 0.2, 0.02, 0.16, 8, true);
    B.glow.cyl(x, y + 3.7, z, 0.12, 0.17, 0.42, 8, false);
    S.cyl(x, z, y, y + 4.3, 0.12, 0.08, 'pole');
    keep.push([e, n, 1]); nLamps++;
  };
  const bench = (e, n, de, dn, y = gEN(e, n), L = 1.9) => {
    const m = frameEN(e, n, y, de, dn);
    B.det.setColor('#2a2c2e').with(m, (q) => { for (const s of [-L / 2 + 0.2, L / 2 - 0.2]) q.box(s - 0.04, 0, -0.27, s + 0.04, 0.43, 0.23).box(s - 0.04, 0.43, -0.31, s + 0.04, 0.88, -0.23); });
    B.wood.setColor('#a8774a').with(m, (q) => {
      [-0.25, -0.13, -0.01, 0.11].forEach((d) => q.box(-L / 2, 0.43, d, L / 2, 0.47, d + 0.1));
      [0.55, 0.67, 0.79].forEach((yy) => q.box(-L / 2, yy, -0.31, L / 2, yy + 0.09, -0.27));
    });
    oboxEN(e, n, de, dn, L / 2, 0.3, y, y + 0.5, 'bench');
    keep.push([e, n, 1.4]); nBenches++;
  };
  const bin = (e, n, y = gEN(e, n)) => { const [x, z] = F.xz(e, n); B.det.setColor('#33363a').cyl(x, y, z, 0.24, 0.26, 0.85, 10).setColor('#24272a').cyl(x, y + 0.85, z, 0.27, 0.27, 0.06, 10); S.cyl(x, z, y, y + 0.9, 0.27, 0.27, 'pole'); };

  // ---------------------------------------------------------------- the ground: painted plan, draped
  const E0 = -64, E1 = 87, N0 = -80, N1 = 49, PX = 12;
  const planTex = canvasTex(Math.round((E1 - E0) * PX), Math.round((N1 - N0) * PX), (c) => {
    const P = (e, n) => [(e - E0) * PX, (N1 - n) * PX];
    const poly = (L) => { c.beginPath(); L.forEach(([e, n], k) => (k ? c.lineTo : c.moveTo).call(c, ...P(e, n))); c.closePath(); };
    const line = (L) => { c.beginPath(); L.forEach(([e, n], k) => (k ? c.lineTo : c.moveTo).call(c, ...P(e, n))); };
    const ell = (ctr, a, b, rot) => { c.beginPath(); c.ellipse(...P(...ctr), a * PX, b * PX, -rot, 0, PI * 2); };
    c.clearRect(0, 0, 1e5, 1e5);
    c.save(); c.beginPath(); for (const R of GREEN) { R.forEach(([e, n], k) => (k ? c.lineTo : c.moveTo).call(c, ...P(e, n))); c.closePath(); } c.clip();
    c.fillStyle = '#4c7a2c'; c.fillRect(0, 0, 1e5, 1e5);                              // lawn (the shader lays grass on green)
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [w, L] of PATHS) { c.strokeStyle = '#a9a294'; c.lineWidth = (w + 0.36) * PX; line(L); c.stroke(); }
    for (const [w, L] of PATHS) { c.strokeStyle = '#dcd6ca'; c.lineWidth = w * PX; line(L); c.stroke(); }
    // the fountain plaza: a kerbed disc, rings of darker slabs
    c.fillStyle = '#a9a294'; c.beginPath(); c.arc(...P(...FOUNT), (PLAZA_R + 0.2) * PX, 0, PI * 2); c.fill();
    c.fillStyle = '#ddd7cb'; c.beginPath(); c.arc(...P(...FOUNT), PLAZA_R * PX, 0, PI * 2); c.fill();
    c.strokeStyle = '#c4bdaf'; c.lineWidth = 0.5 * PX;
    for (const rr of [8.4, 10.6]) { c.beginPath(); c.arc(...P(...FOUNT), rr * PX, 0, PI * 2); c.stroke(); }
    c.lineWidth = 0.12 * PX;
    for (let k = 0; k < 32; k++) { const a = k / 32 * PI * 2; c.beginPath(); c.moveTo(...P(FOUNT[0] + Math.cos(a) * 7.4, FOUNT[1] + Math.sin(a) * 7.4)); c.lineTo(...P(FOUNT[0] + Math.cos(a) * PLAZA_R, FOUNT[1] + Math.sin(a) * PLAZA_R)); c.stroke(); }
    // the kiosk plaza and the stairs' foot
    c.fillStyle = '#a9a294'; poly(rectPts(KIOSK, 0.2)); c.fill(); c.fillStyle = '#d6d0c3'; poly(rectPts(KIOSK)); c.fill();
    c.fillStyle = '#dcd6ca'; c.beginPath(); c.arc(...P(...STAIRS[0]), 2.6 * PX, 0, PI * 2); c.fill();
    // the playground: teal-green rubber, an orange rubber strip under the swings, a sand pit
    c.fillStyle = '#a9a294'; poly(rectPts(PLAY, 0.25)); c.fill();
    c.fillStyle = '#3d7d72'; poly(rectPts(PLAY)); c.fill();
    c.fillStyle = '#c56d3d'; poly(rectPts({ c: [PLAY.c[0] + 6.5, PLAY.c[1] - 2.5], a: 4, b: 3.2, rot: PLAY.rot })); c.fill();
    c.fillStyle = '#d8c08c'; poly(rectPts({ c: [PLAY.c[0] - 6.5, PLAY.c[1] - 2.8], a: 3, b: 2.6, rot: PLAY.rot })); c.fill();
    // pavilions and pergolas stand on paving
    for (const [e, n, a] of PAVILIONS) { c.fillStyle = '#d4cdbf'; poly(rectPts({ c: [e, n], a: 3.2, b: 2.7, rot: a })); c.fill(); }
    for (const [e, n, a] of PERGOLAS) { c.fillStyle = '#d4cdbf'; poly(rectPts({ c: [e, n], a: 2.4, b: 5.2, rot: a })); c.fill(); }
    // rose beds: dark mulch with a light stone kerb
    for (const [ctr, a, b, rot] of BEDS) { c.fillStyle = '#cfc8bb'; ell(ctr, a + 0.35, b + 0.35, rot); c.fill(); c.fillStyle = '#3d2c20'; ell(ctr, a, b, rot); c.fill(); }
    // under the hedges
    c.strokeStyle = '#33281d'; c.lineWidth = 1.2 * PX;
    for (const L of HEDGES) { line(L); c.stroke(); }
    // no lawn under the stairs: the flights stand on the ground themselves
    c.globalCompositeOperation = 'destination-out'; c.strokeStyle = '#000'; c.lineWidth = (STAIR_W + 0.4) * PX;
    line(STAIRS); c.stroke();
    c.globalCompositeOperation = 'source-over';
    c.restore();
  }, { repeat: false });
  planTex.anisotropy = 8;
  let groundGeo;
  {
    const cell = 2, ne = Math.ceil((E1 - E0) / cell), nn = Math.ceil((N1 - N0) / cell);
    const near = (e, n) => GREEN.some((R) => inPoly(R, e, n) || lineDist([e, n], [...R, R[0]]) < 2.9);
    const idx = new Map(), pos = [], uv = [], wpos = [], tris = [];
    const vid = (i, j) => {
      const key = j * (ne + 1) + i;
      if (!idx.has(key)) {
        const e = E0 + i * cell, n = N0 + j * cell, [x, z] = F.xz(e, n);
        idx.set(key, pos.length / 3); pos.push(x, g(x, z), z); uv.push((e - E0) / (E1 - E0), (n - N0) / (N1 - N0)); wpos.push(e, n);
      }
      return idx.get(key);
    };
    for (let j = 0; j < nn; j++) for (let i = 0; i < ne; i++) {
      if (!near(E0 + (i + 0.5) * cell, N0 + (j + 0.5) * cell)) continue;
      const a = vid(i, j), b = vid(i + 1, j), c = vid(i + 1, j + 1), d = vid(i, j + 1);
      tris.push(a, b, c, a, c, d);
    }
    const geo3 = new THREE.BufferGeometry();
    geo3.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo3.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo3.setAttribute('aW', new THREE.Float32BufferAttribute(wpos, 2));
    geo3.setIndex(tris);
    // make the faces look up whichever way the frame turns
    const p = geo3.attributes.position.array, I = geo3.index.array;
    if (I.length) {
      const [a, b, c] = [I[0], I[1], I[2]], ux = p[b * 3] - p[a * 3], uz = p[b * 3 + 2] - p[a * 3 + 2], vx = p[c * 3] - p[a * 3], vz = p[c * 3 + 2] - p[a * 3 + 2];
      if (uz * vx - ux * vz < 0) for (let k = 0; k < I.length; k += 3) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t; }
    }
    geo3.computeVertexNormals();
    groundGeo = geo3;
  }
  const paver = paverTex(); paver.repeat.set(1, 1);
  const groundMat = decal(new THREE.MeshStandardMaterial({ map: planTex, alphaTest: 0.5, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4 }));
  groundMat.onBeforeCompile = (sh) => {
    sh.uniforms.gGrass = { value: T?.grass ?? null }; sh.uniforms.gPave = { value: paver };
    sh.uniforms.gHas = { value: T?.grass ? 1 : 0 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aW;\nvarying vec2 vW;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvW = aW;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D gGrass, gPave; uniform float gHas; varying vec2 vW;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec3 pl = diffuseColor.rgb;
        float gw = clamp((pl.g - max(pl.r, pl.b)) * 9.0, 0.0, 1.0);
        vec3 pav = pl * texture(gPave, vW / 1.2).rgb * 1.32;
        vec3 grass = pl;
        if (gHas > 0.5) grass = mix(texture(gGrass, vW / 4.0).rgb, texture(gGrass, vW / 17.0 + 0.3).rgb, 0.4); // the city's lawn (ground.js)
        diffuseColor.rgb = mix(pav, grass, gw);
      }`);
  };
  groundMat.customProgramCacheKey = () => 'zamkpark-ground';

  // ---------------------------------------------------------------- hedges, rose beds
  for (const L of HEDGES) for (let k = 1; k < L.length; k++) {
    const a = L[k - 1], b = L[k], len = dist(a, b), d = unit(sub(b, a));
    const n = Math.max(1, Math.ceil(len / 6));
    for (let i = 0; i < n; i++) { // short runs, each on its own ground
      const p = lerp(a, b, (i + 0.5) / n), y = Math.min(gEN(...lerp(a, b, i / n)), gEN(...lerp(a, b, (i + 1) / n))) - 0.1, hl = len / n / 2;
      B.hedge.with(frameEN(p[0], p[1], y, d[0], d[1]), (q) => q.box(-0.48, 0, -hl, 0.48, 0.92, hl, 1 | 2 | 16 | 32).box(-0.4, 0.92, -hl, 0.4, 1.08, hl, 1 | 2 | 4 | 16 | 32));
      oboxEN(p[0], p[1], d[0], d[1], 0.5, hl, y, y + 1.05, 'hedge');
    }
  }
  let nBeds = 0;
  for (const [ctr, a, b, rot] of BEDS) {
    // a low mound of roses: rings of an ellipse rising to 0.55 m, uv in metres across the bed
    const rings = 5, seg = 28, ids = [];
    for (let j = 0; j <= rings; j++) {
      const t = j / rings, hgt = 0.1 + 0.48 * Math.sin(t * PI / 2) ** 0.6, row = [];
      for (let s = 0; s < seg; s++) {
        const ang = s / seg * PI * 2, u = Math.cos(ang) * a * (1 - t * 0.85), v = Math.sin(ang) * b * (1 - t * 0.85);
        const e = ctr[0] + u * Math.cos(rot) - v * Math.sin(rot), n = ctr[1] + u * Math.sin(rot) + v * Math.cos(rot), [x, z] = F.xz(e, n);
        row.push(B.rose.vert(x, g(x, z) + (j ? hgt + 0.12 : 0.24), z, 0, 1, 0, e / 1.3, n / 1.3));
      }
      ids.push(row);
    }
    for (let j = 1; j <= rings; j++) for (let s = 0; s < seg; s++) { const s1 = (s + 1) % seg; B.rose.quad(ids[j - 1][s], ids[j - 1][s1], ids[j][s1], ids[j][s]); }
    const [ce, cn] = ctr, [x, z] = F.xz(ce, cn), top = B.rose.vert(x, g(x, z) + 0.58, z, 0, 1, 0, ce / 1.3, cn / 1.3);
    for (let s = 0; s < seg; s++) B.rose.tri(ids[rings][s], ids[rings][(s + 1) % seg], top);
    keep.push([ce, cn, Math.max(a, b) + 1]); nBeds++;
  }

  // ---------------------------------------------------------------- the fountain
  const [fcx, fcz] = F.xz(...FOUNT);
  const yP = g(fcx, fcz);                          // the levelled plaza
  const R0 = 6.2, yB = yP + 0.12, yTop = yB + 1.05, yWl = yTop - 0.2;
  const jets = { pos: [], uv: [], jet: [], idx: [] };
  {
    const seg = 64, ring = (D, prof, col) => { D.setColor(col); for (let k = 1; k < prof.length; k++) D.lathe([prof[k - 1], prof[k]], seg, fcx, fcz); };
    const lowest = Math.min(...circlePts(FOUNT, 7.6, 16).map(([e, n]) => gEN(e, n)));
    // the white stone apron round the drum, then the drum: base band, shaft, the broad coping, the inner face
    ring(B.wall, [[7.5, lowest - 0.25], [7.5, yB], [6.45, yB]], '#e8e6e0');
    ring(B.wall, [[6.45, yB], [6.45, yB + 0.2], [6.3, yB + 0.22], [6.3, yTop - 0.17]], '#dcd9d2');
    ring(B.wall, [[6.3, yTop - 0.17], [6.48, yTop - 0.13], [6.48, yTop], [5.78, yTop], [5.78, yWl - 0.6]], '#f3f2ee');
    // the inner tier: a raised white ring in the water and the round centre stone
    ring(B.wall, [[3.0, yWl - 0.5], [3.0, yWl + 0.14], [2.45, yWl + 0.14], [2.45, yWl - 0.5]], '#efede7');
    ring(B.wall, [[1.0, yWl - 0.5], [1.0, yWl + 0.3], [0.75, yWl + 0.34], [0, yWl + 0.34]], '#e9e7e1');
    // the water: the basin between the drum and the tier, and inside the tier
    B.water.setColor('#ffffff');
    const disc = (r0, r1, y) => { const n = 48, a0 = [], a1 = []; for (let k = 0; k < n; k++) { const t = k / n * PI * 2, cs = Math.cos(t), sn = Math.sin(t); a0.push(B.water.vert(fcx + cs * r0, y, fcz + sn * r0, 0, 1, 0, cs * r0 / 3, sn * r0 / 3)); a1.push(B.water.vert(fcx + cs * r1, y, fcz + sn * r1, 0, 1, 0, cs * r1 / 3, sn * r1 / 3)); } for (let k = 0; k < n; k++) { const k1 = (k + 1) % n; B.water.quad(a0[k], a0[k1], a1[k1], a1[k]); } };
    disc(3.0, 5.79, yWl); disc(1.0, 2.45, yWl + 0.06);
    S.cyl(fcx, fcz, lowest - 0.25, yTop, 6.45, 6.45, 'wall');
    keep.push([...FOUNT, 8]);
    // jets: tubes with a base point (for the pulsing in the shader) and uv metres along their length
    const tube = (pts, rad, phase, seg2 = 8) => {
      const base = pts[0], first = jets.pos.length / 3, lens = [0];
      for (let k = 1; k < pts.length; k++) lens.push(lens[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1], pts[k][2] - pts[k - 1][2]));
      pts.forEach((p, k) => {
        const q = pts[Math.min(pts.length - 1, k + 1)], o = pts[Math.max(0, k - 1)], t = new THREE.Vector3(q[0] - o[0], q[1] - o[1], q[2] - o[2]).normalize();
        const s = Math.abs(t.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0).cross(t).normalize(), b = new THREE.Vector3().crossVectors(t, s);
        for (let i = 0; i <= seg2; i++) {
          const a = i / seg2 * PI * 2, rr = rad[k];
          jets.pos.push(p[0] + (s.x * Math.cos(a) + b.x * Math.sin(a)) * rr, p[1] + (s.y * Math.cos(a) + b.y * Math.sin(a)) * rr, p[2] + (s.z * Math.cos(a) + b.z * Math.sin(a)) * rr);
          jets.uv.push(i / seg2, -lens[k] / 1.6); jets.jet.push(base[0], base[1], base[2], phase);
        }
      });
      for (let k = 1; k < pts.length; k++) for (let i = 0; i < seg2; i++) {
        const a = first + (k - 1) * (seg2 + 1) + i, b = a + seg2 + 1;
        jets.idx.push(a, b, b + 1, a, b + 1, a + 1);
      }
    };
    const P3 = (rr, a, y) => [fcx + Math.cos(a) * rr, y, fcz + Math.sin(a) * rr];
    // the ring of tall foaming jets inside the drum
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * PI * 2, h = 2.5 + 0.35 * Math.sin(k * 2.1);
      const pts = [0, 0.25, 0.55, 0.8, 0.95, 1].map((t) => P3(3.75 - 0.25 * t * t, a, yWl + h * t));
      tube(pts, [0.07, 0.09, 0.13, 0.2, 0.26, 0.12], k * 0.9);
      tube([0, 0.35, 0.7, 0.9].map((t) => P3(3.75 - 0.2 * t, a, yWl + h * t)), [0.62, 0.45, 0.3, 0.16], k * 0.9, 10); // the falling bell round it
    }
    // small arching jets off the inner edge of the coping, falling toward the tall ring
    for (let k = 0; k < 28; k++) {
      const a = (k + 0.5) / 28 * PI * 2, pts = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(P3(5.7 - 1.25 * t, a, yWl + 0.12 + 0.75 * 4 * t * (1 - t) - 0.12 * t)); }
      tube(pts, pts.map((_, i) => 0.035 + 0.025 * (i / 8)), k * 0.37, 5);
    }
    // the bubbling centre: one taller jet and a crown of six
    tube([0, 0.5, 0.85, 1].map((t) => P3(0, 0, yWl + 0.34 + 1.5 * t)), [0.08, 0.12, 0.2, 0.08], 0.5);
    for (let k = 0; k < 6; k++) { const a = k / 6 * PI * 2; tube([0, 0.6, 1].map((t) => P3(0.55 + 0.25 * t, a, yWl + 0.34 + 0.7 * t)), [0.05, 0.1, 0.06], k * 1.3, 6); }
    // plaza lamps and benches round the drum, clear of the paths
    const entries = PATHS.flatMap(([, L]) => L.filter((p) => Math.abs(dist(p, FOUNT) - PLAZA_R) < 4)).map((p) => Math.atan2(p[1] - FOUNT[1], p[0] - FOUNT[0]));
    const free = (a, w) => entries.every((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) > w);
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * PI * 2; if (free(a, 0.3)) lamp(FOUNT[0] + Math.cos(a) * 11.6, FOUNT[1] + Math.sin(a) * 11.6); }
    for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2; if (free(a, 0.35)) bench(FOUNT[0] + Math.cos(a) * 9.6, FOUNT[1] + Math.sin(a) * 9.6, -Math.cos(a), -Math.sin(a)); }
  }

  // ---------------------------------------------------------------- the House with Griffins (Kupershtein's house)
  let houseInfo = '';
  const bld = (id) => map.buildings?.find((b) => b.id === id);
  const houseB = bld(HOUSE_ID);
  if (houseB) {
    const R = []; for (let k = 0; k < houseB.p.length; k += 2) R.push([houseB.p[k], houseB.p[k + 1]]);
    // the footprint's corners: H (north-west), A (north-east, along Olherda), G (south-west, along the uzviz)
    const byEN = R.map((p) => [p, F.en(...p)]);
    const H = byEN.reduce((m, q) => (q[1][1] - q[1][0] * 0.3 > m[1][1] - m[1][0] * 0.3 ? q : m))[0];
    const far = (dirE, dirN) => byEN.reduce((m, q) => ((q[1][0] - m[1][0]) * dirE + (q[1][1] - m[1][1]) * dirN > 0 ? q : m))[0];
    const A = far(0.96, -0.27), G = far(-0.27, -0.96);
    const U = unit(sub(A, H)), LA = dist(A, H);
    // local frame: +x along the Olherda front (U), +z into the lot; the L: the street wing and the uzviz wing
    const ry = Math.atan2(-U[1], U[0]), Zw = [Math.sin(ry), Math.cos(ry)];
    const toL = (p) => [(p[0] - H[0]) * U[0] + (p[1] - H[1]) * U[1], (p[0] - H[0]) * Zw[0] + (p[1] - H[1]) * Zw[1]];
    const sz = Math.sign(toL(G)[1]) || 1, LG = Math.abs(toL(G)[1]);
    // the wings' depths from the outline: the street wing's back wall (points out east of the uzviz wing), then the
    // uzviz wing's back wall (points south of the street wing); the small stair jog in the yard corner is dropped
    const Lp = R.map((p) => { const q = toL(p); return [q[0], Math.abs(q[1])]; });
    const depthN = Math.max(...Lp.filter((p) => p[0] > LA * 0.75).map((p) => p[1]));
    const depthW = Math.max(...Lp.filter((p) => p[1] > depthN + 1).map((p) => p[0]));
    const L2W = (u, v) => [H[0] + U[0] * u + Zw[0] * v * sz, H[1] + U[1] * u + Zw[1] * v * sz];
    const ring = [[0, 0], [LA, 0], [LA, depthN], [depthW, depthN], [depthW, LG], [0, LG]].map(([u, v]) => L2W(u, v));
    const gs = []; for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) { const p = L2W(LA * i / 6, LG * j / 6); if (inPoly(ring, ...p)) gs.push(g(...p)); }
    const gLo = Math.min(...gs), gHi = Math.max(...gs);
    // the floor a little over the middle of the slope: a low plinth on the street side, the yard side banked up to it
    const yF = Math.max(gLo + 0.5, (gLo + gHi) / 2 + 0.3), yBase = gLo - 0.5, Y = (h) => yF + h;
    const yPl = Y(0.3), yStr0 = Y(3.75), yStr1 = Y(4.0), yFr0 = Y(7.05), yEave = Y(7.85);
    const faces = wallFaces(ring);
    const WHITE = '#efede7', RUST = '#e2dfd7', HOOD = '#f7f6f2', FRAME = '#6e5a46', PLINTH = '#8d8a84';
    const center = L2W(LA / 2, depthN / 2);
    // which face is which: the Olherda front faces away from the lot, along -z*sz
    const frontN = [-Zw[0] * sz, -Zw[1] * sz], westN = [-U[0], -U[1]];
    let nWin = 0;
    for (const f of faces) {
      const isFront = f.nx * frontN[0] + f.nz * frontN[1] > 0.9 && f.w > 15, isWest = f.nx * westN[0] + f.nz * westN[1] > 0.9 && f.w > 12;
      const isYard = !isFront && !isWest && f.nx * frontN[0] + f.nz * frontN[1] < -0.9 && f.w > 8 && f.w < 13;
      const n = isFront ? 9 : isWest ? 8 : Math.max(1, Math.round((f.w - 1.2) / 2.5));
      const bay = (f.w - 1.2) / n, sAt = (i) => 0.6 + (i + 0.5) * bay;
      const door = isYard ? Math.floor(n / 2) : -1;
      for (let i = 0; i < n; i++) {
        const s = sAt(i);
        if (i === door) f.open.push({ s0: s - 0.75, s1: s + 0.75, y0: yPl, y1: Y(2.95), door: true });
        else f.open.push({ s0: s - 0.56, s1: s + 0.56, y0: Y(1.05), y1: Y(2.85) });
        f.open.push({ s0: s - 0.58, s1: s + 0.58, y0: Y(4.85), y1: Y(6.75), up: true });
      }
      // the walls round the openings: the plinth band, the stucco up to the frieze, the frieze band over it
      B.wall.setColor(PLINTH); fbox(B.wall, f, 0, f.w, yBase, yPl, 0, 0.06, 1 | 16);
      wallAround(B.wall, f, yPl, yFr0, [3, 3], WHITE);
      quad(B.frieze, at(f, 0, yFr0, 0.02), at(f, f.w, yFr0, 0.02), at(f, f.w, yEave - 0.25, 0.02), at(f, 0, yEave - 0.25, 0.02), f.N, [[0, 0], [f.w / 0.5, 0], [f.w / 0.5, 1], [0, 1]]);
      // rusticated corners, the string course, the cornice
      B.wall.setColor(RUST);
      for (const [a, b] of [[0, 0.62], [f.w - 0.62, f.w]]) for (let y = yPl; y < yFr0 - 0.05; y += 0.42) fbox(B.wall, f, a, b, y, Math.min(yFr0, y + 0.36), 0, 0.07, 1 | 4 | 8 | 16 | 32);
      B.wall.setColor(HOOD); fbox(B.wall, f, -0.05, f.w + 0.05, yStr0, yStr1, 0, 0.12, 1 | 16 | 32);
      fbox(B.wall, f, -0.12, f.w + 0.12, yEave - 0.25, yEave, 0, 0.3, 1 | 4 | 8 | 16 | 32);
      // the windows: dark timber frames, segmental heads, sills, panels under the upper windows
      for (const q of f.open) {
        const lit = r() < 0.3;
        fillOpening(B, f, { ...q, dep: 0.24, frame: FRAME, rev: '#e6e3dc', glass: '#3f4a52', pane: 0.56, lit, sill: '#d9d6ce', ...(q.door ? { glass: '#5b4636', pane: 0.75 } : {}) });
        B.wall.setColor(HOOD);
        fbox(B.wall, f, q.s0 - 0.14, q.s1 + 0.14, q.y1 + 0.02, q.y1 + 0.2, 0, 0.07, 1 | 4 | 8 | 16 | 32);
        fbox(B.wall, f, (q.s0 + q.s1) / 2 - 0.14, (q.s0 + q.s1) / 2 + 0.14, q.y1 + 0.18, q.y1 + 0.34, 0, 0.09, 1 | 4 | 8 | 16); // keystone
        fbox(B.wall, f, q.s0 - 0.1, q.s0, q.y0, q.y1, 0, 0.05, 1 | 4); fbox(B.wall, f, q.s1, q.s1 + 0.1, q.y0, q.y1, 0, 0.05, 1 | 8);
        if (q.up) { B.wall.setColor(RUST); fbox(B.wall, f, q.s0 + 0.04, q.s1 - 0.04, Y(4.15), Y(4.7), 0, 0.05, 1 | 4 | 8 | 16 | 32); }
        if (q.door) { B.det.setColor('#55585b'); fbox(B.det, f, q.s0 - 0.45, q.s1 + 0.45, q.y1 + 0.5, q.y1 + 0.58, 0, 1.1, 63); }
        nWin += q.door ? 0 : 1;
      }
      // the griffins: a long panel over the middle of the street front, a short one over the yard door
      if (isFront) { const s = f.w / 2; quad(B.grif, at(f, s - 1.9, yStr1 + 0.06, 0.06), at(f, s + 1.9, yStr1 + 0.06, 0.06), at(f, s + 1.9, yStr1 + 0.75, 0.06), at(f, s - 1.9, yStr1 + 0.75, 0.06), f.N, [[0, 0], [1, 0], [1, 1], [0, 1]]); }
      if (isYard) { const s = sAt(door); quad(B.grif, at(f, s - 1.2, Y(3.05), 0.04), at(f, s + 1.2, Y(3.05), 0.04), at(f, s + 1.2, Y(3.68), 0.04), at(f, s - 1.2, Y(3.68), 0.04), f.N, [[0, 0], [1, 0], [1, 1], [0, 1]]); }
    }
    // the roof: two hipped wings at one pitch (their union makes the valley), grey seamed metal; three chimneys
    const m = M4(H[0], 0, H[1], ry), PITCH = 0.42, vz = (v) => v * sz;
    const wings = [[-0.35, vz(-0.35), LA + 0.35, vz(depthN + 0.35)], [-0.35, vz(-0.35), depthW + 0.35, vz(LG + 0.35)]].map(([x0, z0, x1, z1]) => [x0, Math.min(z0, z1), x1, Math.max(z0, z1)]);
    let yRidge = 0;
    B.roof.setColor('#7b8084').with(m, (q) => { for (const w of wings) yRidge = Math.max(yRidge, hipRoof(q, w, yEave, PITCH, [1, 1])); });
    B.roof.setColor('#8a8f92').with(m, (q) => { for (const w of wings) q.box(w[0], yEave - 0.12, w[1], w[2], yEave, w[3], 1 | 2 | 8 | 16 | 32); });
    for (const [u, v] of [[4.2, depthN * 0.5 + 0.6], [LA - 4.5, depthN * 0.5 + 0.6], [depthW * 0.5 + 0.6, LG - 4]]) {
      const [x, z] = L2W(u, v), top = yRidge + 0.9;
      B.wall.setColor('#f1efe9').with(M4(x, 0, z, ry), (q) => q.box(-0.36, yEave - 1, -0.5, 0.36, top, 0.5, 1 | 2 | 16 | 32 | 4));
      B.det.setColor('#4c4f52').with(M4(x, 0, z, ry), (q) => q.box(-0.44, top, -0.58, 0.44, top + 0.1, 0.58));
    }
    S.prism(ring.flat(), yBase, yEave, 0, 0, 'wall');
    footprints.push({ poly: ring, h: yRidge - gLo, kind: 'house', name: 'Будинок з грифонами' });
    const [ce, cn] = F.en(...center); keep.push([ce, cn, 16]);
    houseInfo = `house ${LA.toFixed(1)} x ${LG.toFixed(1)} m, ${nWin} windows`;
  }

  // ---------------------------------------------------------------- Zamkovyi uzviz 7: the old stone house with the arched gate
  const stoneB = bld(STONE_ID);
  if (stoneB) {
    const R = []; for (let k = 0; k < stoneB.p.length; k += 2) R.push([stoneB.p[k], stoneB.p[k + 1]]);
    // the frame from the longest edge (P0 -> P1) and the one after the last (P5 -> P0)
    const P0 = R[0], U = unit(sub(R[1], P0)), ry = Math.atan2(-U[1], U[0]), Zw = [Math.sin(ry), Math.cos(ry)];
    const toL = (p) => [(p[0] - P0[0]) * U[0] + (p[1] - P0[1]) * U[1], (p[0] - P0[0]) * Zw[0] + (p[1] - P0[1]) * Zw[1]];
    const Lp = R.map(toL), us = Lp.map((p) => p[0]), vs = Lp.map((p) => p[1]);
    const u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
    // the notch corner: the point with u strictly inside and v strictly inside splits main block and annex
    const notch = Lp.find((p) => p[0] > 1 && p[0] < u1 - 1 && p[1] > v0 + 1 && p[1] < v1 - 1) ?? [u1 * 0.75, (v0 + v1) / 2];
    const annexV = Lp.filter((p) => p[0] > notch[0] + 0.5).map((p) => p[1]);
    const aLo = Math.min(...annexV), aHi = Math.max(...annexV);
    const main = [0, v0, notch[0], v1], annex = [notch[0], aLo, u1, aHi];
    const L2W = (u, v) => [P0[0] + U[0] * u + Zw[0] * v, P0[1] + U[1] * u + Zw[1] * v];
    const gs = R.map((p) => g(...p)), gLo = Math.min(...gs), gHi = Math.max(...gs), yF = gHi + 0.15, yB0 = gLo - 0.4;
    const STONE = '#e9dfcc', m = M4(P0[0], 0, P0[1], ry);
    for (const [[x0, z0, x1, z1], hW, arch] of [[main, 3.9, false], [annex, 3.2, true]]) {
      const ringW = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([u, v]) => L2W(u, v));
      for (const f of wallFaces(ringW)) {
        const nOp = Math.max(0, Math.floor((f.w - 1.5) / 2.6));
        if (arch && f.w > 2.6 && -(f.nx * Zw[0] + f.nz * Zw[1]) > 0.9) { const hw = Math.min(1.1, f.w / 2 - 0.35); f.open.push({ s0: f.w / 2 - hw, s1: f.w / 2 + hw, y0: yF, y1: yF + 1.9 + hw, ys: yF + 1.9, gate: true }); }
        else for (let i = 0; i < nOp; i++) { const s = (i + 0.5) * f.w / nOp; f.open.push({ s0: s - 0.45, s1: s + 0.45, y0: yF + 0.9, y1: yF + 2.2 }); }
        B.stone.setColor(STONE); fbox(B.stone, f, 0, f.w, yB0, yF, 0, 0.08, 1 | 16);
        wallAround(B.stone, f, yF, yF + hW, [2.4, 2.4], STONE);
        for (const q of f.open) {
          if (q.gate) {
            // the round arch over the gate: the wall closes in over a half circle, a dressed stone surround, a dark passage
            const c = (q.s0 + q.s1) / 2, rad = (q.s1 - q.s0) / 2, ys = q.ys, top = q.y1, n = 10;
            const pts = Array.from({ length: n + 1 }, (_, k) => [c - Math.cos(k / n * PI) * rad, ys + Math.sin(k / n * PI) * rad]);
            B.stone.setColor(STONE);
            for (let k = 0; k < n; k++) {
              const [s0, y0] = pts[k], [s1, y1] = pts[k + 1];
              quad(B.stone, at(f, s0, y0), at(f, s1, y1), at(f, s1, top), at(f, s0, top), f.N, [[s0 / 2.4, y0 / 2.4], [s1 / 2.4, y1 / 2.4], [s1 / 2.4, top / 2.4], [s0 / 2.4, top / 2.4]]);
              B.det.setColor('#2a2622'); quad(B.det, at(f, s0, y0, -1.2), at(f, s1, y1, -1.2), at(f, s1, y1, 0), at(f, s0, y0, 0), [0, -1, 0]);
              // the dressed voussoirs: a light band round the arc, standing a little proud of the wall
              const out = (k2) => { const a = k2 / n * PI; return [c - Math.cos(a) * (rad + 0.24), ys + Math.sin(a) * (rad + 0.24)]; }, [o0s, o0y] = out(k), [o1s, o1y] = out(k + 1);
              B.det.setColor(k % 2 ? '#d6cab0' : '#c9bb9c'); quad(B.det, at(f, s0, y0, 0.05), at(f, s1, y1, 0.05), at(f, o1s, o1y, 0.05), at(f, o0s, o0y, 0.05), f.N);
            }
            B.det.setColor('#2a2622');
            fbox(B.det, f, q.s0, q.s0 + 0.02, q.y0, ys, -1.2, 0, 8); fbox(B.det, f, q.s1 - 0.02, q.s1, q.y0, ys, -1.2, 0, 4);
            fbox(B.det, f, q.s0, q.s1, q.y0, ys + rad, -1.25, -1.2, 1); // the passage's far end in shadow
            B.wood.setColor('#5a3b24'); fbox(B.wood, f, q.s0 + 0.1, q.s1 - 0.1, q.y0, q.y0 + 1.9, -0.6, -0.52, 63); // the gate leaves, open in the dark
            for (const s of [q.s0, q.s1]) { B.det.setColor('#cbbd9f'); fbox(B.det, f, s - 0.2, s + 0.2, q.y0, ys, 0, 0.08, 1 | 4 | 8 | 16); }
          } else fillOpening(B, f, { ...q, dep: 0.3, frame: '#5a4532', rev: '#d8cdb6', glass: '#3a4248', pane: 0.45, sill: '#cbbd9f' });
        }
        B.det.setColor('#cbbd9f'); fbox(B.det, f, -0.08, f.w + 0.08, yF + hW - 0.18, yF + hW, 0, 0.16, 1 | 16 | 32);
      }
      B.tile.setColor('#ffffff').with(m, (q) => hipRoof(q, [x0 - 0.45, z0 - 0.45, x1 + 0.45, z1 + 0.45], yF + hW, 0.6, [1, 1]));
      S.prism(ringW.flat(), yB0, yF + hW, 0, 0, 'wall');
    }
    footprints.push({ poly: R, h: 6, kind: 'house', name: 'Замковий узвіз, 7' });
    const [ce, cn] = F.en(...L2W(u1 / 2, (v0 + v1) / 2)); keep.push([ce, cn, 9]);
  }

  // ---------------------------------------------------------------- the playground
  {
    const { c, rot } = PLAY, P = (u, v) => [c[0] + u * Math.cos(rot) - v * Math.sin(rot), c[1] + u * Math.sin(rot) + v * Math.cos(rot)];
    const dU = [Math.cos(rot), Math.sin(rot)], dV = [-Math.sin(rot), Math.cos(rot)];
    const yG = (u, v) => gEN(...P(u, v));
    // a tower: four posts, a deck at 1.3 m, coloured side panels, a pyramid roof
    const tower = (u, v, roofCol, panel) => {
      const [e, n] = P(u, v), y = yG(u, v), m = frameEN(e, n, y, ...dV);
      B.wood.setColor('#b98a5a').with(m, (q) => {
        for (const [a, b] of [[-0.85, -0.85], [0.85, -0.85], [0.85, 0.85], [-0.85, 0.85]]) q.box(a - 0.07, 0, b - 0.07, a + 0.07, 3.0, b + 0.07);
        q.box(-0.95, 1.25, -0.95, 0.95, 1.35, 0.95);
      });
      B.det.setColor(panel).with(m, (q) => { q.box(-0.8, 1.4, 0.82, 0.8, 2.15, 0.88); q.box(-0.88, 1.4, -0.8, -0.82, 2.15, 0.8); });
      B.det.setColor(roofCol).with(m, (q) => {
        const yr = 3.0, ya = 4.0, s = 1.1, A = [0, ya, 0];
        for (const [p0, p1] of [[[-s, yr, -s], [s, yr, -s]], [[s, yr, -s], [s, yr, s]], [[s, yr, s], [-s, yr, s]], [[-s, yr, s], [-s, yr, -s]]]) q.face([p0, p1, A]);
        q.face([[-s, yr, -s], [-s, yr, s], [s, yr, s], [s, yr, -s]]);
      });
      oboxEN(e, n, ...dV, 1, 1, y, y + 4, 'wall');
      return { e, n, y };
    };
    const t1 = tower(-4, 1.5, '#3f8a3a', '#e3b62a'), t2 = tower(1.5, 2.2, '#e7c43a', '#3a7fc0');
    // the bridge between them: planks and rope rails
    {
      const a = F.xz(t1.e, t1.n), b = F.xz(t2.e, t2.n), y = t1.y + 1.3, d = unit(sub(b, a)), len = dist(a, b) - 2, s = [-d[1], d[0]];
      for (let k = 0; k <= 12; k++) { const p = lerp(a, b, (1 + k * len / 12) / (len + 2)); B.wood.setColor('#a77b4f').tube([p[0] - s[0] * 0.5, y - 0.04 * Math.sin(k / 12 * PI), p[1] - s[1] * 0.5], [p[0] + s[0] * 0.5, y - 0.04 * Math.sin(k / 12 * PI), p[1] + s[1] * 0.5], 0.06, 4, true); }
      B.det.setColor('#c9b48a');
      for (const o of [-0.5, 0.5]) B.det.tube([a[0] + d[0] + s[0] * o, y + 0.8, a[1] + d[1] + s[1] * o], [b[0] - d[0] + s[0] * o, y + 0.8, b[1] - d[1] + s[1] * o], 0.025, 5);
    }
    // the slide off the first tower
    {
      const [e0, n0] = P(-4, 0.6), [e1, n1] = P(-4, -3.2), y0 = t1.y + 1.3, y1 = yG(-4, -3.2) + 0.25;
      const a = F.xz(e0, n0), b = F.xz(e1, n1), d = unit(sub(b, a)), s = [-d[1], d[0]];
      B.det.setColor('#2f9a4a');
      const Q = (p, y, o, h = 0) => [p[0] + s[0] * o, y + h, p[1] + s[1] * o];
      B.det.face([Q(a, y0, -0.32), Q(b, y1, -0.32), Q(b, y1, 0.32), Q(a, y0, 0.32)]);
      B.det.face([Q(a, y0, 0.32), Q(b, y1, 0.32), Q(b, y1, -0.32), Q(a, y0, -0.32)]);
      for (const o of [-0.34, 0.34]) { B.det.face([Q(a, y0, o), Q(b, y1, o), Q(b, y1, o, 0.25), Q(a, y0, o, 0.25)]); B.det.face([Q(a, y0, o, 0.25), Q(b, y1, o, 0.25), Q(b, y1, o), Q(a, y0, o)]); }
    }
    // swings over the orange rubber
    {
      const [e, n] = P(6.5, -2.5), y = yG(6.5, -2.5), m = frameEN(e, n, y, ...dU);
      B.det.setColor('#2f6fae').with(m, (q) => {
        for (const sx of [-1.7, 1.7]) { q.tube([sx, 0, -1.1], [sx, 2.5, 0], 0.06, 6); q.tube([sx, 0, 1.1], [sx, 2.5, 0], 0.06, 6); }
        q.tube([-1.8, 2.5, 0], [1.8, 2.5, 0], 0.07, 8);
      });
      B.det.setColor('#6c6f72').with(m, (q) => { for (const sx of [-0.8, 0.8]) for (const dz of [-0.2, 0.2]) q.tube([sx + dz, 2.45, 0], [sx + dz, 0.5, 0], 0.012, 4); });
      B.det.setColor('#d8432f').with(m, (q) => { for (const sx of [-0.8, 0.8]) q.box(sx - 0.25, 0.45, -0.12, sx + 0.25, 0.5, 0.12); });
      oboxEN(e, n, ...dU, 1.85, 1.1, y, y + 2.6, 'pole');
    }
    // a rope climbing pyramid
    {
      const [e, n] = P(7.5, 3.5), y = yG(7.5, 3.5), [x, z] = F.xz(e, n);
      B.det.setColor('#c9372c').tube([x, y, z], [x, y + 3.2, z], 0.07, 8, true);
      B.det.setColor('#d8c49a');
      const base = Array.from({ length: 8 }, (_, k) => [x + Math.cos(k / 8 * PI * 2) * 2.2, y + 0.05, z + Math.sin(k / 8 * PI * 2) * 2.2]);
      for (const b of base) B.det.tube(b, [x, y + 3.1, z], 0.025, 4);
      for (const t of [0.33, 0.66]) for (let k = 0; k < 8; k++) {
        const p = base[k], q = base[(k + 1) % 8], P1 = [p[0] + (x - p[0]) * t, p[1] + (y + 3.1 - p[1]) * t, p[2] + (z - p[2]) * t], P2 = [q[0] + (x - q[0]) * t, q[1] + (y + 3.1 - q[1]) * t, q[2] + (z - q[2]) * t];
        B.det.tube(P1, P2, 0.022, 4);
      }
      S.cyl(x, z, y, y + 3.2, 1.6, 0.2, 'pole');
    }
    // the sand pit's timber frame and two spring riders
    {
      const [e, n] = P(-6.5, -2.8), y = yG(-6.5, -2.8);
      B.wood.setColor('#b98a5a').with(frameEN(e, n, y - 0.1, ...dV), (q) => { q.box(-3.1, 0, -2.7, 3.1, 0.38, -2.5); q.box(-3.1, 0, 2.5, 3.1, 0.38, 2.7); q.box(-3.1, 0, -2.5, -2.9, 0.38, 2.5); q.box(2.9, 0, -2.5, 3.1, 0.38, 2.5); });
      for (const [u, v, col] of [[-0.5, -3.6, '#e2492f'], [1.8, -3.9, '#f0b52b']]) {
        const [e2, n2] = P(u, v), y2 = yG(u, v), [x, z] = F.xz(e2, n2);
        B.det.setColor('#555a5e').cyl(x, y2, z, 0.12, 0.12, 0.45, 6);
        B.det.setColor(col).ellipsoid([x, y2 + 0.7, z], [0.22, 0.25, 0.45], 10, 6);
      }
    }
    for (const u of [-8, -2, 4]) { const [e, n] = P(u, PLAY.b + 0.9); bench(e, n, -dV[0], -dV[1]); }
    keep.push([...c, 13]);
  }

  // ---------------------------------------------------------------- the kiosk plaza
  {
    for (const [e, n, face] of KIOSKS) {
      const de = Math.cos(KIOSK.rot + PI / 2) * face, dn = Math.sin(KIOSK.rot + PI / 2) * face;
      const y = gEN(e, n), m = frameEN(e, n, y, de, dn);
      B.wood.setColor('#d2ae7c').with(m, (q) => {
        q.box(-2.1, 0, -1.25, 2.1, 2.6, 1.25, 2 | 1 | 32);      // body: sides and back
        q.box(-2.1, 0, 1.05, 2.1, 0.95, 1.25, 16);             // under the counter
        q.box(-2.1, 2.05, 1.05, 2.1, 2.6, 1.25, 16 | 8);       // over the hatch
        q.box(-2.1, 0.95, 1.05, -1.6, 2.05, 1.25, 16); q.box(1.6, 0.95, 1.05, 2.1, 2.05, 1.25, 16);
      });
      B.wood.setColor('#e3c592').with(m, (q) => q.box(-2.35, 2.6, -1.5, 2.35, 2.82, 1.55));                // the roof slab
      B.det.setColor('#4a3a2c').with(m, (q) => q.box(-1.6, 0.95, 0.6, 1.6, 2.05, 0.62, 16));              // the dark inside
      B.wood.setColor('#b88f5c').with(m, (q) => q.box(-1.7, 0.95, 1.05, 1.7, 1.02, 1.55));                 // the counter
      B.det.setColor('#e8e2d4').with(m, (q) => q.box(-1.5, 1.4, 0.64, 1.5, 1.9, 0.7, 16));                 // the menu board
      B.lit.setColor('#fff2d8').with(m, (q) => q.box(-1.55, 2.0, 0.7, 1.55, 2.04, 1.0, 8));                // the hatch light
      B.det.setColor('#6b4e33').with(m, (q) => { const a0 = [0, 2.05, 1.25], a1 = [0, 2.4, 1.95]; q.face([[-2, a0[1], a0[2]], [2, a0[1], a0[2]], [2, a1[1], a1[2]], [-2, a1[1], a1[2]]]); q.face([[2, a0[1], a0[2]], [-2, a0[1], a0[2]], [-2, a1[1], a1[2]], [2, a1[1], a1[2]]]); }); // the awning flap
      oboxEN(e, n, de, dn, 2.1, 1.25, y, y + 2.82, 'wall');
      keep.push([e, n, 3]);
    }
    // bistro tables with chairs between the kiosks, bins at the corners
    const { c, rot } = KIOSK;
    for (const [u, v] of [[-5, -0.5], [-1.5, 1.5], [2, -0.8], [5.2, 1.2], [-3.2, -3], [3.6, -3.2]]) {
      const e = c[0] + u * Math.cos(rot) - v * Math.sin(rot), n = c[1] + u * Math.sin(rot) + v * Math.cos(rot), y = gEN(e, n), [x, z] = F.xz(e, n);
      B.det.setColor('#2e3134').cyl(x, y, z, 0.25, 0.05, 0.08, 8).cyl(x, y + 0.08, z, 0.04, 0.04, 0.66, 6).cyl(x, y + 0.74, z, 0.36, 0.36, 0.04, 14);
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * PI * 2 + u, px = x + Math.cos(a) * 0.7, pz = z + Math.sin(a) * 0.7, m = M4(px, y, pz, Math.atan2(x - px, z - pz));
        B.det.setColor('#3a3d41').with(m, (q) => { q.box(-0.2, 0.43, -0.2, 0.2, 0.47, 0.2); for (const [a2, b2] of [[-0.17, -0.17], [0.17, -0.17], [0.17, 0.17], [-0.17, 0.17]]) q.box(a2 - 0.02, 0, b2 - 0.02, a2 + 0.02, 0.43, b2 + 0.02); q.box(-0.2, 0.47, -0.22, 0.2, 0.85, -0.18); });
      }
      S.cyl(x, z, y, y + 0.78, 0.4, 0.4, 'pole');
    }
    for (const [e, n] of rectPts(KIOSK, -0.6)) bin(e, n);
    for (const i of [-1, 1]) lamp(c[0] + i * (KIOSK.a + 0.6) * Math.cos(rot), c[1] + i * (KIOSK.a + 0.6) * Math.sin(rot));
  }

  // ---------------------------------------------------------------- pavilions and pergolas
  for (const [e, n, a] of PAVILIONS) {
    const [de, dn] = turnDir(a), y = gEN(e, n), m = frameEN(e, n, y, -dn, de);
    B.wood.setColor('#6b4a30').with(m, (q) => {
      for (const [u, v] of [[-2.1, -1.6], [2.1, -1.6], [2.1, 1.6], [-2.1, 1.6]]) q.box(u - 0.1, 0, v - 0.1, u + 0.1, 2.7, v + 0.1);
      q.box(-2.5, 2.7, -2.0, 2.5, 3.0, 2.0);                                   // the flat roof
      for (const v of [-1.6, 1.6]) q.box(-2.1, 0.45, v - 0.04, 2.1, 0.95, v + 0.04);   // low rails on the long sides
    });
    B.wood.setColor('#8a6440').with(m, (q) => { q.box(-1.2, 0.72, -0.45, 1.2, 0.78, 0.45); q.box(-0.06, 0, -0.06, 0.06, 0.72, 0.06); for (const v of [-0.85, 0.85]) q.box(-1.2, 0.42, v - 0.15, 1.2, 0.46, v + 0.15); });
    oboxEN(e, n, -dn, de, 2.2, 1.7, y, y + 0.95, 'bench');
    keep.push([e, n, 4]);
  }
  for (const [e, n, a] of PERGOLAS) {
    const [de, dn] = turnDir(a), y = gEN(e, n), m = frameEN(e, n, y, de, dn);
    B.wood.setColor('#5c4330').with(m, (q) => {
      for (const v of [-4.6, -1.55, 1.55, 4.6]) for (const u of [-1.7, 1.7]) q.box(u - 0.09, 0, v - 0.09, u + 0.09, 2.6, v + 0.09);
      for (const u of [-1.7, 1.7]) q.box(u - 0.08, 2.6, -5.1, u + 0.08, 2.85, 5.1);
    });
    B.det.setColor('#4a4c4e').with(m, (q) => { for (let v = -5; v <= 5.01; v += 0.42) q.box(-2.2, 2.85, v - 0.06, 2.2, 2.97, v + 0.06); });
    for (const v of [-3, 0, 3]) { const p = [e + de * v, n + dn * v]; bench(p[0] + dn * 0.9, p[1] - de * 0.9, -dn, de, undefined, 1.7); }
    keep.push([e, n, 6]);
  }

  // ---------------------------------------------------------------- the bus shelter on Olherda
  {
    const [e, n] = SHELTER, [de, dn] = turnDir(ALONG), y = gEN(e, n) + 0.05, m = frameEN(e, n, y, -dn, de); // facing the road (north)
    B.det.setColor('#3b3f43').with(m, (q) => {
      for (const u of [-1.7, 1.7]) for (const v of [-0.7, 0.7]) q.box(u - 0.05, 0, v - 0.05, u + 0.05, 2.5, v + 0.05);
      q.box(-1.95, 2.5, -0.95, 1.95, 2.62, 0.95);
      q.box(-1.3, 0.45, -0.62, 1.3, 0.5, -0.25);
    });
    B.glass.setColor('#8fa3ad').with(m, (q) => { q.box(-1.7, 0.15, -0.72, 1.7, 2.3, -0.68); q.box(-1.72, 0.15, -0.7, -1.68, 2.3, 0.5); q.box(1.68, 0.15, -0.7, 1.72, 2.3, 0.5); });
    B.lit.setColor('#f5f2e8').with(m, (q) => q.box(1.1, 0.4, -0.66, 1.66, 2.2, -0.62, 16));  // the timetable / map case
    oboxEN(e, n, -dn, de, 1.8, 0.75, y, y + 2.62, 'wall');
    keep.push([e, n, 3]);
  }

  // ---------------------------------------------------------------- the stairs up to the plateau
  let nRisers = 0, stairY = [];
  {
    const top = STAIRS.length - 1, way = STAIRS.map(([e, n], k) => ({ e, n, y: k === top ? Math.max(gEN(e, n), PLATEAU_Y) : gEN(e, n) }));
    // the flights run straight between the landings; where the ground bulges over that line, both ends rise (a few
    // passes settle it), and the way never steps down going up
    for (let pass = 0; pass < 4; pass++) {
      for (let k = 1; k <= top; k++) {
        const a = way[k - 1], b = way[k];
        let bulge = -Infinity;
        for (let t = 0; t <= 1; t += 0.1) for (const o of [-STAIR_W / 2, 0, STAIR_W / 2]) {
          const de = b.e - a.e, dn = b.n - a.n, l = Math.hypot(de, dn) || 1, e = a.e + de * t - dn / l * o, n = a.n + dn * t + de / l * o;
          bulge = Math.max(bulge, gEN(e, n) + 0.12 - (a.y + (b.y - a.y) * t));
        }
        if (bulge > 0) { if (k > 1) a.y += bulge; b.y += bulge; }
      }
      for (let k = 1; k <= top; k++) way[k].y = Math.max(way[k].y, way[k - 1].y);
    }
    const W2 = STAIR_W / 2;
    const landing = (w) => {
      const [x, z] = F.xz(w.e, w.n), m = M4(x, 0, z, 0), lo = Math.min(...circlePts([w.e, w.n], 2.2, 8).map(([e, n]) => gEN(e, n))) - 0.4;
      B.pave.setColor('#d9d4c8').with(m, (q) => q.cyl(0, lo, 0, 2.15, 2.15, w.y - lo, 16, true));
      S.cyl(x, z, lo, w.y, 2.15, 2.15, 'ledge');
    };
    way.forEach(landing);
    stairY = way.map((w) => +w.y.toFixed(2));
    for (let k = 1; k <= top; k++) {
      const a = way[k - 1], b = way[k], A = F.xz(a.e, a.n), Bp = F.xz(b.e, b.n), len = dist(A, Bp), d = unit(sub(Bp, A)), s = [d[1], -d[0]];
      const run0 = 1.8, run1 = len - 1.8, rise = b.y - a.y, run = run1 - run0;
      const P = (o, t) => [A[0] + d[0] * t + s[0] * o, A[1] + d[1] * t + s[1] * o];
      const lo = Math.min(...[0, 0.25, 0.5, 0.75, 1].flatMap((t) => [-W2 - 0.3, W2 + 0.3].map((o) => g(...P(o, run0 + run * t))))) - 0.4;
      const yAt = (t) => a.y + rise * Math.max(0, Math.min(1, (t - run0) / run));
      const m = M4(A[0], 0, A[1], Math.atan2(d[0], d[1])); // local +z along the flight, +x to the right (s)
      if (rise / run < 0.07) {
        // a ramp: one sloped slab
        B.pave.setColor('#d9d4c8').with(m, (q) => {
          q.face([[-W2, a.y, run0], [W2, a.y, run0], [W2, b.y, run1], [-W2, b.y, run1]], [0, 1, 0]);
          for (const x of [-W2, W2]) q.face([[x, lo, run0], [x, lo, run1], [x, b.y, run1], [x, a.y, run0]], [Math.sign(x), 0, 0]);
        });
      } else {
        const n = Math.max(2, Math.round(rise / 0.155)), tr = run / n, h = rise / n;
        nRisers += n;
        B.pave.setColor('#dcd7cc').with(m, (q) => { for (let i = 0; i < n; i++) q.box(-W2, lo, run0 + i * tr, W2, a.y + (i + 1) * h, run0 + (i + 1) * tr + 0.01, 1 | 2 | 4 | 32); });
      }
      // collision: one sloped prism over the flight
      const sl = rise / run, o = A[0] * d[0] + A[1] * d[1];
      const q4 = [[-W2, run0], [W2, run0], [W2, run1], [-W2, run1]].map(([oo, t]) => P(oo, t));
      S.prism(q4.flat(), lo, a.y - sl * (o + run0), sl * d[0], sl * d[1], rise / run < 0.07 ? 'ledge' : 'stairs');
      // white parapets along both sides, their tops following the flight
      for (const side of [-1, 1]) {
        const o0 = side * (W2 + 0.02), o1 = side * (W2 + 0.3), ts = [run0 - 0.6, run0, run1, run1 + 0.6];
        B.wall.setColor('#f1efea');
        for (let i = 1; i < ts.length; i++) {
          const t0 = ts[i - 1], t1 = ts[i], y0 = yAt(t0) + 0.95, y1 = yAt(t1) + 0.95;
          const p = (oo, t, y) => { const [x, z] = P(oo, t); return [x, y, z]; };
          B.wall.face([p(o1, t0, lo), p(o1, t1, lo), p(o1, t1, y1), p(o1, t0, y0)], [s[0] * side, 0, s[1] * side]);
          B.wall.face([p(o0, t1, lo), p(o0, t0, lo), p(o0, t0, y0), p(o0, t1, y1)], [-s[0] * side, 0, -s[1] * side]);
          B.wall.face([p(o0, t0, y0), p(o1, t0, y0), p(o1, t1, y1), p(o0, t1, y1)]);
        }
        const [cx, cz] = P((o0 + o1) / 2, (run0 + run1) / 2);
        S.obox(cx, cz, 0.16, (run1 - run0) / 2 + 0.6, Math.atan2(-d[0], d[1]), lo, Math.max(a.y, b.y) + 0.95, 'wall');
      }
    }
    for (const k of [0, 2, 4]) { const w = way[k], q = STAIRS[k + 1] ?? STAIRS[k], d = unit(sub(q, [w.e, w.n])); lamp(w.e - d[1] * 2.6 - d[0] * 0.5, w.n + d[0] * 2.6 - d[1] * 0.5, w.y); }
  }

  // ---------------------------------------------------------------- lamps and benches along the paths
  {
    const p0 = PATHS[0];
    const placed = [];
    // every `every` metres along the polyline L, `off` to its left (fn gets the point and the direction)
    const along = (L, every, off, fn, start = 4) => {
      let next = start, walked = 0;
      for (let k = 1; k < L.length; k++) {
        const a = L[k - 1], b = L[k], len = dist(a, b), d = unit(sub(b, a));
        for (; next < walked + len; next += every) { const p = lerp(a, b, (next - walked) / len); fn([p[0] - d[1] * off, p[1] + d[0] * off], d); }
        walked += len;
      }
    };
    const clear = (p, r2) => !keep.some(([e, n, kr]) => dist(p, [e, n]) < kr + r2) && !placed.some((q) => dist(p, q) < 6) && inPoly(PARK, ...p);
    along(p0[1], 17, 2.05, (p) => { if (clear(p, 0.5)) { lamp(...p); placed.push(p); } });          // on the hedge side
    along(p0[1], 21, -2.5, (p, d) => { if (clear(p, 0.8)) bench(p[0], p[1], -d[1], d[0]); }, 12);  // facing the promenade
    for (const [w, L] of PATHS.slice(1)) {
      if (L.length < 3) continue;
      along(L, 15, w / 2 + 0.9, (p) => { if (clear(p, 0.5)) { lamp(...p); placed.push(p); } }, 5);
    }
  }

  // ---------------------------------------------------------------- trees (the city's tree system): the lawns and the slope
  const spots = [];
  {
    const [vx, vz] = F.en(...geo.toXZ(...VIEW)), Pc = PLATEAU.map(([la, lo]) => F.en(...geo.toXZ(la, lo)));
    const cen = [Pc.reduce((s, p) => s + p[0], 0) / Pc.length, Pc.reduce((s, p) => s + p[1], 0) / Pc.length], f = unit(sub([vx, vz], cen));
    const inView = (p) => { const d = (p[0] - vx) * f[0] + (p[1] - vz) * f[1], l = Math.abs(-(p[0] - vx) * f[1] + (p[1] - vz) * f[0]); return d > 0 && d < 45 && l < 9 + d * 0.8; };
    const onPath = (p, m) => PATHS.some(([w, L]) => lineDist(p, L) < w / 2 + m) || lineDist(p, STAIRS) < STAIR_W / 2 + m + 0.5;
    const taken = (p) => keep.some(([e, n, kr]) => dist(p, [e, n]) < kr + 1.5) || inRect(p, PLAY.c, PLAY.a, PLAY.b, PLAY.rot, 2) || inRect(p, KIOSK.c, KIOSK.a, KIOSK.b, KIOSK.rot, 2)
      || dist(p, FOUNT) < PLAZA_R + 5 || BEDS.some(([c, a, b, rot]) => inEll(p, c, a, b, rot, 1.5)) || HEDGES.some((L) => lineDist(p, L) < 2.2);
    const pick = (p, sc) => { const [x, z] = F.xz(...p); spots.push({ x, z, y: g(x, z) + 0.17, kind: r() < 0.25 ? 'elm' : 'park', sc, pal: PARK_GREENS }); };
    for (let n = -76; n < 46; n += 7) for (let e = -62; e < 86; e += 7) {
      const p = [e + (r() - 0.5) * 5, n + (r() - 0.5) * 5];
      const onSlope = inPoly(SLOPE, ...p);
      if (!(inPoly(PARK, ...p) || onSlope) || onPath(p, 2.2) || taken(p)) continue;
      const slope = p[1] < -18 || onSlope, k = onSlope ? 0.3 : slope ? 0.6 : 0.38;
      if (r() > k || (slope && inView(p))) continue;
      pick(p, slope ? 0.85 + r() * 0.45 : 0.7 + r() * 0.35);
    }
  }

  // ---------------------------------------------------------------- meshes
  const group = Object.assign(new THREE.Group(), { name: 'zamkovapark' });
  root.add(group);
  const tex = (t, s) => { t.repeat.set(1 / s, 1 / s); return t; };
  const jetMap = jetTex(), foam = foamTex();
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: tex(stoneTex(r, [246, 245, 241], { cols: 1, rows: 1, joint: 0, grain: 0.05 }), 3), vertexColors: true, roughness: 0.85 }),
    roof: new THREE.MeshStandardMaterial({ map: seamTex(), vertexColors: true, roughness: 0.45, metalness: 0.45 }),
    tile: new THREE.MeshStandardMaterial({ map: pantileTex(), vertexColors: true, roughness: 0.8 }),
    stone: new THREE.MeshStandardMaterial({ map: stoneTex(r, [236, 226, 206], { cols: 3, rows: 6, joint: 0.14, grain: 0.13 }), vertexColors: true, roughness: 0.92 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ map: woodTex(), vertexColors: true, roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.55 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3, emissive: 0xffd9a8, emissiveIntensity: 0 }),
    frieze: new THREE.MeshStandardMaterial({ map: friezeTex(), roughness: 0.85 }),
    grif: new THREE.MeshStandardMaterial({ map: griffinTex(), roughness: 0.85 }),
    hedge: new THREE.MeshStandardMaterial({ map: tex(hedgeTex(), 1.5), vertexColors: false, roughness: 0.95 }),
    rose: new THREE.MeshStandardMaterial({ map: roseTex(), roughness: 0.9, side: THREE.DoubleSide }),
    pave: new THREE.MeshStandardMaterial({ map: tex(paverTex(), 1.2), vertexColors: true, roughness: 0.85 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xf5f0e2, roughness: 0.3, emissive: 0xffd9a0, emissiveIntensity: 0.05 }),
    water: new THREE.MeshStandardMaterial({ color: 0x2f6f86, roughness: 0.04, metalness: 0.25, envMapIntensity: 1.5 }),
  };
  let nV = 0;
  for (const [k, D] of Object.entries(B)) {
    if (!D.v) continue;
    nV += D.v;
    group.add(Object.assign(new THREE.Mesh(D.build(), M[k]), { name: 'zamkovapark-' + k, castShadow: !['glow', 'water', 'glass', 'lit', 'grif', 'frieze', 'rose'].includes(k), receiveShadow: true }));
  }
  const ground = Object.assign(new THREE.Mesh(groundGeo, groundMat), { name: 'zamkovapark-ground', receiveShadow: true });
  group.add(ground); nV += groundGeo.attributes.position.count;
  // the jets: one mesh, pulsing in the vertex shader, streaks scrolling up
  const jg = new THREE.BufferGeometry();
  jg.setAttribute('position', new THREE.Float32BufferAttribute(jets.pos, 3));
  jg.setAttribute('uv', new THREE.Float32BufferAttribute(jets.uv, 2));
  jg.setAttribute('aJet', new THREE.Float32BufferAttribute(jets.jet, 4));
  jg.setIndex(jets.idx);
  const jetMat = new THREE.MeshBasicMaterial({ map: jetMap, color: 0xeef6fb, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  const uTime = { value: 0 };
  jetMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aJet;\nuniform float uTime;')
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
      float jk = 0.88 + 0.09 * sin(uTime * 2.1 + aJet.w) + 0.04 * sin(uTime * 6.3 + aJet.w * 2.7);
      transformed = aJet.xyz + (transformed - aJet.xyz) * vec3(1.0, jk, 1.0);`);
  };
  jetMat.customProgramCacheKey = () => 'zamkpark-jets';
  group.add(Object.assign(new THREE.Mesh(jg, jetMat), { name: 'zamkovapark-jets', renderOrder: 2 }));
  nV += jets.pos.length / 3;
  // foam rings where the tall jets fall and round the centre
  const fb = new MB();
  for (const [rr, cnt, sz] of [[3.6, 12, 0.9], [0, 1, 1.4]]) for (let k = 0; k < cnt; k++) {
    const a = k / cnt * PI * 2, x = fcx + Math.cos(a) * rr, z = fcz + Math.sin(a) * rr, y = yWl + 0.02;
    const i0 = fb.vert(x - sz, y, z - sz, 0, 1, 0, 0, 0), i1 = fb.vert(x + sz, y, z - sz, 0, 1, 0, 1, 0), i2 = fb.vert(x + sz, y, z + sz, 0, 1, 0, 1, 1), i3 = fb.vert(x - sz, y, z + sz, 0, 1, 0, 0, 1);
    fb.quad(i0, i3, i2, i1);
  }
  const foamMat = new THREE.MeshBasicMaterial({ map: foam, transparent: true, depthWrite: false, opacity: 0.8 });
  group.add(Object.assign(new THREE.Mesh(fb.build(), foamMat), { name: 'zamkovapark-foam', renderOrder: 1 }));

  const nSolids = (S.count ?? 0) - solidsBefore;
  console.log(`[cherkasy] Zamkova park: ${houseInfo}, ${nBeds} rose beds, ${nLamps} lamps, ${nBenches} benches, ${nRisers} stair risers, ${spots.length} trees, ${(nV / 1000).toFixed(1)}k verts, ${group.children.length} meshes, ${nSolids} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const inPark = (x, z) => inPoly(PW, x, z);
  // generated trees: none in the park, none on the open middle of the slope, none on the verges of Olherda and the uzviz
  // along the park (the render shows hedges, lamps and open lawns there)
  // and the hilltop round the viewing deck stays an open lawn as the render has it
  const PARK_RING = [...PARK, PARK[0]], VIEW_EN = F.en(...geo.toXZ(...VIEW));
  const keepOff = (x, z) => {
    const p = F.en(x, z);
    if (dist(p, VIEW_EN) < 24) return true;
    if (inPoly(SLOPE, ...p) && p[0] > -22 && p[0] < 30) return true;
    return p[1] > -30 && lineDist(p, PARK_RING) < (p[0] < -35 ? 14 : 9);
  };
  const nearStairs = (x, z) => lineDist(F.en(x, z), STAIRS) < STAIR_W / 2 + 3.5;
  let t = 0;
  return {
    spots, footprints,
    stats: { verts: nV, meshes: group.children.length, solids: nSolids, trees: spots.length, lamps: nLamps, benches: nBenches, risers: nRisers, stairs: stairY },
    clear: (x, z) => inPark(x, z) || nearStairs(x, z) || keepOff(x, z),
    update(dt) {
      t += dt || 0;
      uTime.value = t;
      jetMap.offset.y = (jetMap.offset.y - (dt || 0) * 1.6) % 1;
      foamMat.opacity = 0.7 + 0.15 * Math.sin(t * 5.3);
      const k = nightK.value;
      M.glow.emissiveIntensity = 0.05 + 2.4 * k;
      M.lit.emissiveIntensity = 1.1 * k;
    },
  };
}
