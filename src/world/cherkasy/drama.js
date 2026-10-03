// OWNER: cherkasy. Черкаський академічний обласний український музично-драматичний театр ім. Т. Г. Шевченка, бульвар
// Шевченка, 234 (OSM way 154341828; architect B. Kucher, opened 1 Sep 1965, rebuilt after the 2015 fire and reopened
// 9 Mar 2021), the Shevchenko monument on the square in front (OSM node 1668556520; M. Vronskyi, O. Oliinyk, architect
// V. Hnezdylov, 1964) and the square between them and the boulevard. Built after the 2020–2021 photos of the finished
// rebuild (provce.ck.ua, ukrinform, 18000.com.ua), the 2025 Wikimedia Commons photos of the monument and the Google /
// Esri ortho photos.
// The theatre: a cream-rendered foyer and auditorium block (31 x 36 m, 13.3 m to the parapet) whose front to the square
// is seven tall glazed bays recessed 1.2 m between six square pilasters and two broad blind end piers, under an attic
// band with the theatre's full name in gold letters and a thin cornice with a steel railing; each bay has a lower and
// an upper glazing split by a brown spandrel band and capped by a brown soffit; the three middle bays are the entrance
// under a cantilevered red-brown granite canopy, their pilasters clad in the same granite below it. A red granite
// terrace 1.2 m up runs across the front with a wide flight of steps and two railed side blocks, and a red granite apron
// in front of it. The side walls carry two rows of windows with brown panels over them and wall lamps; a low hipped
// metal roof hides behind the parapet. Behind, a wider three-storey service block (dressing rooms, workshops) wraps the
// stage, whose plain fly tower rises to 22 m, and a two-storey annex with three short wings and the
// stage door closes the back. At night the foyer glows through the glazing, the side windows light up, lamps on the
// pilasters wash the facade, the letters glow and the canopy's downlights come on.
// The monument faces the boulevard: a 3 m bronze Shevchenko in a long open coat, the left hand at the lapel, the right
// arm down, on a 4 m grey granite shaft (a tapered lower part, three courses, the "Т.Г.ШЕВЧЕНКО / 1814–1861" inscription
// on the top one, a cap) over two granite steps, flanked in front by the hewn granite groups of the blind kobzar
// (seated with his bandura, the viewer's right) and Kateryna (a standing figure out of a tall rock, the viewer's left),
// on a red granite platform with a planted bed behind it and on its left; two ground projectors light it at night.
// The square: light slabs in a 5.2 m grid of darker bands, the red apron, the monument's platform and beds, a lawn
// square with a round flower bed further south, lamps along the edges, benches, a linden and a blue spruce.
//   DRAMA_SKIP: the OSM id replaced here (buildings.js skips its extrusion)
//   dramaLocal: { W, toMap(s, t), toLocal(x, z), MONUMENT: [s, t] } the site frame: s along the front from its north
//     corner (map metres, ~ +z), t from the front into the building (~ -x); the square lies at t < 0
//   levelDrama(hf) levels the building, the terrace and the apron to the square's height at the steps (before the
//     ground is built; city.js); returns the level
//   buildDrama({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), spots, footprints } | null
// No overlapping coplanar surfaces anywhere (the old box model in landmarks.js capped its stage house with a slab whose
// top lay in the plane of the house's own roof, which flickered black and white from the air): every cladding stands
// a few cm proud, every roof sits in its own plane; tests/drama.test.mjs checks the whole site for coplanar overlaps.
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { OVERHANG } from '../collision.js';
import { SG, canvasTex, decal } from './sculpt.js';
import { rng } from './geo.js';
import { PARK_PINE } from '../trees.js';
import { face, at, quad, box, skin, finish, speckle, UP, DN } from './slabkit.js';
import { graniteTex, floodlit, put, mapper, sweep, ell, patina } from './bohdan.js';

const OSM_ID = 154341828;
export const DRAMA_SKIP = new Set([OSM_ID]);

const PI = Math.PI;
// the front edge of the OSM outline, north corner F0 to south corner F1
const F0 = [-117, 236.6], F1 = [-116.6, 267.5];
const W = Math.hypot(F1[0] - F0[0], F1[1] - F0[1]);
const U = [(F1[0] - F0[0]) / W, (F1[1] - F0[1]) / W], V = [-U[1], U[0]];
const toMap = (s, t) => [F0[0] + U[0] * s + V[0] * t, F0[1] + U[1] * s + V[1] * t];
const toLocal = (x, z) => { const dx = x - F0[0], dz = z - F0[1]; return [dx * U[0] + dz * U[1], dx * V[0] + dz * V[1]]; };
const MONUMENT = [-16.2, -21.4];                       // the shaft's centre (the OSM node, 0.1 m toward the front)
export const dramaLocal = { W, toMap, toLocal, MONUMENT };

// heights over the floor (the terrace / foyer level)
const TERR = 1.2;                                      // the terrace over the square at the foot of the steps
const ATT0 = 11.2, ATT1 = 12.6, PAR = 13.3, RAIL = 14.2;  // attic band, parapet top, railing top
const EAVE = 12.9, RIDGE = 16.5;                       // the hipped roof behind the parapet
const WING = 11.0, WPAR = 11.6;                        // the service block's roof and parapet
const TOWER = [3.5, 27.5, 38.5, 63.5], TW0 = 10.6, TW1 = 21.8, TWP = 22.3; // fly tower s0, s1, t0, t1; walls, parapet
const DEP = 35.7, REAR = [-3.57, 34.0, 35.66, 67.9];   // front block depth; the service block s0, s1, t0, t1
const ANNEX = [3.55, 27.05, 67.9, 70.8, 7.6], WINGS = [[3.55, 8.67], [11.87, 19.28], [22.37, 27.05]], ANNEX_T = 72.35;
const END = 2.9, PIL = 0.95, REC = 1.2;                // front: end pier, pilaster width, bay recess
const BAY = (W - 2 * END - 6 * PIL) / 7;
// the square: [s0, s1, t0, t1] in the site frame
const TER = [-4.6, 35.4, -4.5, 0], STEPS = [2.6, 28.3, -8.1, -4.5], APRON = [-4.6, 35.4, -13.5, -8.1];
const SQUARE = [-31.2, 59.2, -46.2, -8.1];
const PLATFORM = [-23.5, -10.5, -28.5, -18.2], BED_W = [-23.5, -10.5, -18.2, -14.6], BED_N = [-23.3, -20.2, -25.2, -18.1];
const LAWN = [43.7, 54.2, -27.4, -13.4], ROUND = [49.0, -20.4, 3.2];

const COL = { wall: '#ece5d3', brown: '#6a4636', red: '#a0645a', redD: '#6e4038', tower: '#dcd8ce', steel: '#9ea3a6', dark: '#2a2c2e' };

// the lot levelled to the square's height at the foot of the steps (the DEM gives the 72 m lot a 2 m slope)
export function levelDrama(hf) {
  const lvl = hf.heightAt(...toMap(15.5, -9));
  return hf.pad([[-6, -10], [37, -10], [37, 74], [-6, 74]].map(([s, t]) => toMap(s, t)), 14, lvl);
}

// ------------------------------------------------------------------------------------------------ textures
// red granite (1.5 m a repeat), its tone from the vertex colour
const redTex = (r) => canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = '#d8b2a8'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const k = r();
    c.fillStyle = k < 0.35 ? `rgba(40,20,18,${0.3 + r() * 0.4})` : k < 0.7 ? `rgba(255,220,210,${0.2 + r() * 0.3})` : `rgba(150,70,60,${0.2 + r() * 0.3})`;
    c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
});
// one glazing column a storey high: frame, a transom
const paneTex = (mask) => canvasTex(64, 128, (g, w, h) => {
  const gl = g.createLinearGradient(0, 0, w * 0.5, h);
  gl.addColorStop(0, mask ? '#fff' : '#dfe6ea'); gl.addColorStop(0.5, mask ? '#fff' : '#a3b0b8'); gl.addColorStop(1, mask ? '#fff' : '#66737c');
  g.fillStyle = gl; g.fillRect(0, 0, w, h);
  g.fillStyle = mask ? '#000' : '#2a2b2e';
  g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h); g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
  g.fillRect(0, Math.round(h * 0.4), w, 3);
});
// standing-seam roof, 2 m a repeat
const seamTex = () => canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = '#e6e6e4'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) { const x = i * 64; g.fillStyle = '#9c9c9a'; g.fillRect(x, 0, 3, h); g.fillStyle = '#fff'; g.fillRect(x + 3, 0, 2, h); }
});
// the square, one 5.2 m cell: a 4 m field of light 0.5 m slabs inside a 1.2 m band of greyer-pink pavers
const paveTex = (r) => canvasTex(512, 512, (c, w, h) => {
  const k = w / 5.2, band = 1.2 * k;
  c.fillStyle = '#9f9893'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) for (let j = 0; j < 26; j++) { // the band's 0.2 m pavers
    const v = 150 + (r() - 0.5) * 22; c.fillStyle = `rgb(${v + 8 | 0},${v | 0},${v - 2 | 0})`; c.fillRect(i * k * 0.2 + 1, j * k * 0.2 + 1, k * 0.2 - 2, k * 0.2 - 2);
  }
  const n = 8, s = (w - band) / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = 192 + (r() - 0.5) * 14; c.fillStyle = `rgb(${v + 2 | 0},${v | 0},${v - 8 | 0})`; c.fillRect(band + i * s + 1.5, band + j * s + 1.5, s - 3, s - 3);
  }
  for (let q = 0; q < 7000; q++) { c.fillStyle = `rgba(${r() < 0.5 ? '70,64,58' : '255,252,244'},${0.06 + r() * 0.08})`; c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
});
// the apron and the platform: 1 m red granite slabs with light joints
const slabRedTex = (r) => canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = '#c9b2a8'; c.fillRect(0, 0, w, h);
  const n = 2, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = 0.9 + r() * 0.15; c.fillStyle = `rgb(${138 * v | 0},${72 * v | 0},${62 * v | 0})`; c.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
  }
  for (let q = 0; q < 5000; q++) { c.fillStyle = r() < 0.5 ? 'rgba(30,15,12,0.35)' : 'rgba(255,215,200,0.25)'; c.fillRect(r() * w, r() * h, 1.5, 1.5); }
});
// leaves for the hedges and the beds (1.5 m a repeat); flowers tint it by vertex colour
const leafTex = (r) => canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = '#5d6e4c'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    const v = r(); c.fillStyle = v < 0.4 ? 'rgba(25,40,20,0.55)' : v < 0.8 ? 'rgba(150,175,120,0.5)' : 'rgba(240,240,220,0.35)';
    c.beginPath(); c.ellipse(r() * w, r() * h, 2 + r() * 4, 1.5 + r() * 2.5, r() * PI, 0, PI * 2); c.fill();
  }
});
// the theatre's name on the attic (top half) and the monument's inscription (bottom half), gold / dark on clear
const signTex = () => canvasTex(2048, 512, (c, w, h) => {
  c.clearRect(0, 0, w, h);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const name = 'Черкаський академічний обласний український музично-драматичний театр ім. Т.Г. Шевченка';
  c.font = '600 92px "Georgia", "Times New Roman", serif';
  const sc = Math.min(1, (w - 40) / (c.measureText(name).width || w));
  c.save(); c.translate(w / 2, h * 0.25); c.scale(sc, 1);
  c.fillStyle = '#5b4210'; c.fillText(name, 2, 3); c.fillStyle = '#d9b25a'; c.fillText(name, 0, 0);
  c.restore();
  c.fillStyle = '#1b1a18';
  c.font = 'bold 120px "Georgia", "Times New Roman", serif'; c.fillText('Т.Г.ШЕВЧЕНКО', w / 2, h * 0.64);
  c.font = 'bold 70px "Georgia", "Times New Roman", serif'; c.fillText('· 1814–1861 ·', w / 2, h * 0.87);
}, { repeat: false });

// ------------------------------------------------------------------------------------------------ the poet
// Figure units: a 1.8-unit man, soles at y 0, +z forward, +x his left. A long frock coat open over a waistcoat, worn to
// the knee and falling straight behind; the left hand at the lapel, the right arm down along the coat with the hand a
// little forward; the bald dome, the heavy brow and the long drooping moustache of the late portraits.
const COAT = [[0.5, 0.33, 0.25, 0.27, 0.03], [0.62, 0.3, 0.22, 0.25, 0.025], [0.8, 0.255, 0.18, 0.21, 0.02], [0.95, 0.225, 0.155, 0.18, 0.02],
  [1.05, 0.215, 0.15, 0.165, 0.02], [1.18, 0.235, 0.16, 0.15, 0.015], [1.3, 0.255, 0.15, 0.14, 0.01], [1.38, 0.262, 0.135, 0.13, 0],
  [1.43, 0.24, 0.12, 0.115, 0], [1.47, 0.17, 0.1, 0.1, 0], [1.5, 0.09, 0.075, 0.075, 0]];
function poet() {
  const s = new SG();
  // shoes and trouser legs (the right foot a little forward, the toes out)
  for (const [x, z, turn] of [[-0.1, 0.05, -0.18], [0.11, -0.02, 0.22]]) {
    put(s, new SG().ellipsoid([0, 0.045, 0.06], [0.05, 0.045, 0.125], 10, 6), mapper(M4(x, 0, z, turn)));
    sweep(s, [[x, 0.05, z - 0.01], [x * 1.02, 0.3, z - 0.02], [x * 1.05, 0.62, z - 0.02]], [0.062, 0.07, 0.085], 10);
  }
  // the coat: a loft of soft ellipses, the folds of the skirt deepening toward the hem
  s.loft(COAT.map(([y, rx, f, b, dz]) => Array.from({ length: 32 }, (_, k) => {
    const a = -k / 32 * PI * 2, c = Math.cos(a), sn = Math.sin(a), fold = y < 0.9 ? 1 + 0.06 * (0.9 - y) / 0.4 * Math.sin(a * 9 + y * 3) : 1;
    return [c * rx * fold, y + (y < 0.55 ? 0.015 * Math.sin(a * 5) : 0), dz + sn * (sn > 0 ? f : b) * fold];
  })), { cap0: true, cap1: true });
  // the open front: lapels from the collar down to the last button, the waistcoat between them
  for (const sd of [-1, 1]) sweep(s, [[sd * 0.06, 1.46, 0.105], [sd * 0.1, 1.36, 0.155], [sd * 0.085, 1.2, 0.17], [sd * 0.05, 1.02, 0.16], [sd * 0.07, 0.8, 0.185], [sd * 0.1, 0.55, 0.25]],
    [[0.045, 0.012], [0.05, 0.012], [0.035, 0.01], [0.02, 0.01], [0.02, 0.01], [0.02, 0.01]], 6);
  for (let y = 1.04; y < 1.3; y += 0.06) ell(s, [0, y, 0.155 + (1.3 - y) * 0.04], [0.008, 0.008, 0.005], [0, 0, 0], 6, 4);
  // the collar round the neck
  sweep(s, [[-0.1, 1.46, 0.05], [-0.09, 1.5, -0.04], [0, 1.515, -0.08], [0.09, 1.5, -0.04], [0.1, 1.46, 0.05]], [0.02, 0.028, 0.03, 0.028, 0.02], 8);
  // right arm hanging, the hand a little forward
  const sleeve = (u, i) => 1 + 0.05 * Math.sin(u * PI * 6 + i * 1.7);
  sweep(s, [[-0.25, 1.4, -0.01], [-0.29, 1.25, -0.02], [-0.305, 1.08, 0.0], [-0.3, 0.9, 0.04], [-0.29, 0.82, 0.06]], [0.08, 0.075, 0.07, 0.064, 0.058], 12, { wob: sleeve });
  ell(s, [-0.285, 0.75, 0.07], [0.035, 0.07, 0.045], [0.15, 0, 0.05], 10, 7);
  // left arm bent, the hand on the lapel before the chest
  sweep(s, [[0.25, 1.4, -0.01], [0.29, 1.26, -0.01], [0.3, 1.13, 0.04], [0.22, 1.17, 0.13], [0.13, 1.23, 0.17]], [0.08, 0.075, 0.07, 0.064, 0.058], 12, { wob: sleeve });
  ell(s, [0.09, 1.26, 0.18], [0.045, 0.06, 0.03], [0.2, 0.4, 0.3], 10, 7);
  for (let j = 0; j < 4; j++) sweep(s, [[0.11 - j * 0.017, 1.235, 0.19], [0.1 - j * 0.017, 1.29, 0.16]], [0.011, 0.01], 6);
  // neck and head: the skull a little large, the dome bald, the brow heavy, the long moustache down past the chin
  sweep(s, [[0, 1.48, 0], [0, 1.55, 0.01], [0, 1.6, 0.015]], [0.06, 0.057, 0.055], 12);
  ell(s, [0, 1.665, 0.005], [0.083, 0.105, 0.098], [-0.1, 0, 0], 16, 10);
  ell(s, [0, 1.62, 0.04], [0.07, 0.055, 0.07], [0, 0, 0], 12, 7);                       // jaw and cheeks
  ell(s, [0, 1.7, 0.072], [0.07, 0.022, 0.03], [0, 0, 0], 10, 5);                       // the brow
  ell(s, [0, 1.655, 0.1], [0.016, 0.03, 0.02], [0.3, 0, 0], 8, 5);                      // the nose
  for (const sd of [-1, 1]) {
    ell(s, [sd * 0.083, 1.66, 0.0], [0.012, 0.028, 0.018], [0, 0, 0], 6, 4);            // ears
    ell(s, [sd * 0.065, 1.665, -0.03], [0.03, 0.045, 0.05], [0, 0, 0], 8, 5);           // the hair over the ears
    sweep(s, [[sd * 0.004, 1.625, 0.112], [sd * 0.03, 1.615, 0.106], [sd * 0.05, 1.595, 0.09], [sd * 0.058, 1.565, 0.078], [sd * 0.056, 1.535, 0.07]],
      [[0.016, 0.01], [0.019, 0.011], [0.016, 0.01], [0.011, 0.008], [0.004, 0.004]], 8);
  }
  return s;
}
// a hewn granite group: a rough block narrowing upward with a figure growing out of it (the kobzar seated with his
// bandura, or Kateryna standing out of a tall rock); local metres, +z forward, standing on y 0
function group(kind, r) {
  const s = new SG(), tall = kind === 'kateryna';
  const H = tall ? 2.7 : 1.9, hx = tall ? 0.55 : 0.85, hz = tall ? 0.55 : 0.6;
  const rows = [0, 0.25, 0.5, 0.75, 0.92, 1].map((f) => Array.from({ length: 12 }, (_, k) => {
    const a = -k / 12 * PI * 2, w = (1 - 0.35 * f * f) * (1 + (r() - 0.5) * 0.16);
    return [Math.cos(a) * hx * w, f * H + (f === 1 ? (r() - 0.5) * 0.15 : 0), Math.sin(a) * hz * w];
  }));
  s.loft(rows, { cap0: true, cap1: true });
  if (tall) { // a woman's head and shoulders turned to the viewer near the top, her arm across, the drape down
    ell(s, [0.02, H - 0.42, hz * 0.75], [0.14, 0.17, 0.13], [0, 0, 0], 10, 7);
    ell(s, [0.02, H - 0.72, hz * 0.7], [0.32, 0.22, 0.18], [0, 0, 0], 10, 6);
    sweep(s, [[-0.25, H - 0.75, hz * 0.8], [0, H - 1.0, hz * 0.95], [0.22, H - 0.95, hz * 0.85]], [0.07, 0.075, 0.065], 8);
    sweep(s, [[0.05, H - 1.0, hz * 0.85], [0.1, H - 1.7, hz * 0.95], [0.15, 0.25, hz * 0.95]], [[0.25, 0.08], [0.28, 0.08], [0.3, 0.08]], 8);
  } else { // the old man seated: head bowed, the bandura on his knees, the cloak over the shoulders
    ell(s, [-0.15, H + 0.02, 0.12], [0.13, 0.16, 0.13], [0.3, 0, 0], 10, 7);
    ell(s, [-0.15, H - 0.32, 0.12], [0.36, 0.3, 0.26], [0, 0, 0], 10, 6);
    ell(s, [0.2, H - 0.62, hz * 0.95], [0.28, 0.36, 0.08], [0.35, 0, -0.5], 12, 7);   // the bandura's body
    sweep(s, [[0.32, H - 0.4, hz * 0.95], [0.5, H - 0.05, hz * 0.7]], [0.04, 0.035], 6);
    sweep(s, [[-0.4, H - 0.95, hz * 0.95], [-0.1, H - 1.15, hz * 1.1], [0.25, H - 1.2, hz * 1.05]], [[0.14, 0.08], [0.16, 0.08], [0.12, 0.07]], 8); // knees
  }
  return s;
}

// ------------------------------------------------------------------------------------------------ the build
export function buildDrama({ root, map, solids: S, zips: Z, heightAt }) {
  if (map?.buildings && !map.buildings.some((b) => b.id === OSM_ID)) return null;
  const t0 = performance.now(), r = rng(1965), n0 = S.count;
  const g = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 30; };
  const gl = (s, t) => g(...toMap(s, t));
  const ANG = Math.atan2(U[1], U[0]);

  // the floor: the terrace 1.2 m over the square at the foot of the steps, and clear of the ground everywhere under it
  const lot = [[0, 0], [W, 0], [W, DEP], [REAR[1], DEP], [REAR[1], REAR[3]], [ANNEX[1], REAR[3]], [ANNEX[1], ANNEX_T], [ANNEX[0], ANNEX_T],
    [ANNEX[0], REAR[3]], [REAR[0], REAR[3]], [REAR[0], DEP], [0, DEP]];
  const hs = lot.map(([s, t]) => gl(s, t)), gLo = Math.min(...hs, gl(TER[0], STEPS[2]), gl(TER[1], STEPS[2]));
  const yF = Math.max(gl(15.5, STEPS[2]) + TERR, Math.max(...hs) + 0.3), Y = (h) => yF + h, gB = gLo - 0.6;

  const B = { wall: new MB(), stone: new MB(), det: new MB(), roof: new MB(), glass: new MB(), lit: new MB(), glow: new MB(), sign: new MB() };
  const Q = { pave: new MB(), apron: new MB(), grey: new MB(), plant: new MB(), det: new MB(), glow: new MB(), sign: new MB() };
  const bronze = new SG(), rock = new SG();
  const UVW = [2.5, 2.5], UVR = [1.5, 1.5], UVS = [2, 2];

  // the site face: s along the front, o = -t (outward toward the square)
  const fS = face(toMap(0, 0), toMap(W, 0), -V[0], -V[1]);
  // a box in the site frame; f faces the square (-t), b the back (+t), l / r the -s / +s ends
  const blk = (D, s0, s1, t0_, t1, y0, y1, sides, uvM = null) => box(D, fS, s0, s1, y0, y1, -t1, -t0_, sides, uvM);
  const ob = (s0, s1, t0_, t1, y0, y1, kind = 'wall', flags = 0) => {
    const [cx, cz] = toMap((s0 + s1) / 2, (t0_ + t1) / 2);
    return S.obox(cx, cz, (s1 - s0) / 2, (t1 - t0_) / 2, ANG, y0, y1, kind, flags);
  };
  const prismL = (P, y0, y1, kind = 'wall', flags = 0) => S.prism(P.map(([s, t]) => toMap(s, t)).flat(), y0, y1, 0, 0, kind, flags);
  // a prism under the plane through three local points [s, y, t]
  const slopeL = (P, y0, Q3, kind = 'roof') => {
    const p = Q3.map(([s, y, t]) => { const [x, z] = toMap(s, t); return [x, y, z]; });
    const e1 = p[1].map((v, i) => v - p[0][i]), e2 = p[2].map((v, i) => v - p[0][i]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (Math.abs(n[1]) < 1e-9) return -1;
    const bx = -n[0] / n[1], bz = -n[2] / n[1];
    return S.prism(P.map(([s, t]) => toMap(s, t)).flat(), y0, p[0][1] - bx * p[0][0] - bz * p[0][2], bx, bz, kind);
  };
  const tint = () => ['#9fb0bd', '#a7b6c2', '#93a6b4'][(r() * 3) | 0];
  let nWin = 0;
  const wash = []; // the facade lamps: wall-wash points for the night

  // an opening in a wall face: reveals, a sill, glass in `cols` framed columns (lit ones go to their own mesh)
  function win(f, s0, s1, y0, y1, { cols = 1, dep = 0.25, lit = r() < 0.4, rows = 1 } = {}) {
    f.cuts.push({ s0, s1, y0, y1 });
    const D = B.det;
    D.setColor('#d9d3c4');
    quad(D, at(f, s0, y0), at(f, s0, y0, -dep), at(f, s0, y1, -dep), at(f, s0, y1), f.U);
    quad(D, at(f, s1, y0), at(f, s1, y0, -dep), at(f, s1, y1, -dep), at(f, s1, y1), f.U.map((v) => -v));
    quad(D, at(f, s0, y1), at(f, s1, y1), at(f, s1, y1, -dep), at(f, s0, y1, -dep), DN);
    quad(D, at(f, s0, y0), at(f, s1, y0), at(f, s1, y0, -dep), at(f, s0, y0, -dep), UP);
    const G = lit ? B.lit : B.glass, o = -dep + 0.05;
    G.setColor(tint());
    quad(G, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), f.N, [[0, 0], [cols, 0], [cols, rows], [0, rows]]);
    D.setColor('#cfc9ba'); box(D, f, s0 - 0.05, s1 + 0.05, y0 - 0.07, y0, 0, 0.06, 'ftlr'); // outside the reveal: no shared plane
    nWin++;
  }
  // a wall lamp: a small box with a glowing face, and its wash point
  // a glazing panel on a face: `cols` x `rows` frame cells of the pane texture
  const glaze = (G, f, s0, s1, y0, y1, o, cols, rows = 1) => quad(G, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), f.N,
    [[0, 0], [cols, 0], [cols, rows], [0, rows]]);
  const sconce = (f, s, y) => {
    B.det.setColor(COL.dark); box(B.det, f, s - 0.09, s + 0.09, y - 0.18, y + 0.18, 0, 0.14, 'ftulr');
    B.glow.setColor('#fff4dc'); box(B.glow, f, s - 0.06, s + 0.06, y + 0.18, y + 0.22, 0.02, 0.12, 'tflr'); box(B.glow, f, s - 0.06, s + 0.06, y - 0.22, y - 0.18, 0.02, 0.12, 'uflr');
    wash.push(at(f, s, y, 0.45));
  };

  // ---------------------------------------------------------------- the front: end piers, pilasters, recessed bays
  const bays = [], pils = [];
  for (let k = 0; k < 7; k++) {
    const b0 = END + k * (BAY + PIL);
    bays.push([b0, b0 + BAY]);
    if (k < 6) pils.push([b0 + BAY, b0 + BAY + PIL]);
  }
  B.wall.setColor(COL.wall);
  blk(B.wall, 0, END, 0, REC, Y(0), Y(ATT0), 'fr', UVW);
  blk(B.wall, W - END, W, 0, REC, Y(0), Y(ATT0), 'fl', UVW);
  const entrance = [2, 3, 4];                           // the three middle bays: doors under the canopy
  const cs0 = pils[1][0] - 0.25, cs1 = pils[4][1] + 0.25;
  pils.forEach(([a, b], k) => {
    const clad = k >= 1 && k <= 4;
    B.wall.setColor(COL.wall); blk(B.wall, a, b, 0, REC, Y(clad ? 3.7 : 0), Y(ATT0), 'flr', UVW);
    if (clad) { B.stone.setColor(COL.red); blk(B.stone, a - 0.04, b + 0.04, -0.04, REC, Y(0), Y(3.7), 'flr', UVR); }
  });
  // the attic band (the name on it), its brown soffit over the recesses, the cornice and parapet round the block
  B.wall.setColor(COL.wall); blk(B.wall, 0, W, 0, REC, Y(ATT0), Y(ATT1), 'f', UVW);
  B.det.setColor(COL.brown); blk(B.det, 0, W, 0, REC, Y(ATT0), Y(ATT0), 'u');
  B.wall.setColor('#f1ebdb');
  blk(B.wall, -0.3, W + 0.3, -0.3, 0.35, Y(ATT1), Y(PAR), 'fblrtu', UVW);
  blk(B.wall, -0.3, 0.35, 0.35, DEP + 0.3, Y(ATT1), Y(PAR), 'lrtub', UVW);
  blk(B.wall, W - 0.35, W + 0.3, 0.35, DEP + 0.3, Y(ATT1), Y(PAR), 'lrtub', UVW);
  blk(B.wall, 0.35, W - 0.35, DEP - 0.35, DEP + 0.3, Y(ATT1), Y(PAR), 'fbtu', UVW);
  B.sign.setColor('#ffffff');
  quad(B.sign, ...[[1.6, ATT0 + 0.22], [W - 1.6, ATT0 + 0.22], [W - 1.6, ATT1 - 0.18], [1.6, ATT1 - 0.18]].map(([s, h]) => at(fS, s, Y(h), 0.025)), fS.N,
    [[1, 0.5], [0, 0.5], [0, 1], [1, 1]]); // s runs to the viewer's left here: u runs the other way
  // the bays: lower glazing (doors in the middle three), a brown spandrel, the tall upper glazing, a brown fascia
  bays.forEach(([a, b], k) => {
    const door = entrance.includes(k), G = B.lit, gt = REC + 0.05;
    G.setColor(door ? '#8d9aa3' : tint());
    glaze(G, fS, a, b, Y(0.02), Y(3.6), -gt, 2);
    for (let row = 0; row < 3; row++) { G.setColor(tint()); glaze(G, fS, a, b, Y(4.3 + row * 2.1), Y(4.3 + (row + 1) * 2.1), -gt, 2); }
    B.det.setColor(COL.brown);
    blk(B.det, a, b, REC - 0.12, gt, Y(3.6), Y(4.3), 'ftu');
    blk(B.det, a, b, REC - 0.02, gt, Y(10.6), Y(ATT0), 'f');
    // mullions and the door frames
    B.det.setColor(COL.dark);
    for (const m of [a + 0.04, (a + b) / 2, b - 0.04]) blk(B.det, m - 0.04, m + 0.04, REC - 0.03, gt, Y(0.02), Y(3.6), 'f');
    for (const m of [a + 0.04, (a + b) / 2, b - 0.04]) blk(B.det, m - 0.035, m + 0.035, REC - 0.03, gt, Y(4.3), Y(10.6), 'f');
    for (const h of [6.4, 8.5]) blk(B.det, a, b, REC - 0.07, gt, Y(h - 0.035), Y(h + 0.035), 'f');
    if (door) blk(B.det, a, b, REC - 0.07, gt, Y(2.45), Y(2.52), 'f');
  });
  // a lamp on every pilaster and end pier, washing it at night
  for (const [a, b] of [[0, END], ...pils, [W - END, W]]) sconce(fS, (a + b) / 2, Y(7.6));
  // the canopy: red-brown granite, cantilevered over the entrance, downlights in its soffit
  B.stone.setColor(COL.redD); blk(B.stone, cs0, cs1, -2.4, REC - 0.05, Y(3.7), Y(4.4), 'fblrtu', UVR);
  ob(cs0, cs1, -2.4, 0, Y(3.7), Y(4.4), 'awning', OVERHANG);
  for (let s = cs0 + 1.2; s < cs1 - 0.8; s += 2.2) { B.glow.setColor('#fff2d6'); blk(B.glow, s - 0.15, s + 0.15, -1.3, -1.0, Y(3.67), Y(3.7), "ufblr"); }

  // ---------------------------------------------------------------- the terrace, the steps, the side blocks, railings
  B.stone.setColor(COL.red);
  blk(B.stone, TER[0], TER[1], TER[2], REC + 0.1, gB, Y(0), 't', UVR);
  blk(B.stone, TER[0], STEPS[0], STEPS[2], TER[2], gB, Y(0), 'tflr', UVR);
  blk(B.stone, STEPS[1], TER[1], STEPS[2], TER[2], gB, Y(0), 'tflr', UVR);
  blk(B.stone, TER[0], TER[0], TER[2], REC + 0.1, gB, Y(0), 'l', UVR);
  blk(B.stone, TER[1], TER[1], TER[2], REC + 0.1, gB, Y(0), 'r', UVR);
  blk(B.stone, TER[0], 0, REC + 0.1, REC + 0.1, gB, Y(0), 'b', UVR);
  blk(B.stone, W, TER[1], REC + 0.1, REC + 0.1, gB, Y(0), 'b', UVR);
  // steps: seven risers down to the apron
  const nStep = 7, run = (TER[2] - STEPS[2]) / nStep, rise = TERR / (nStep + 1);
  for (let i = 0; i < nStep; i++) {
    const tA = STEPS[2] + i * run, yT = Y(0) - (nStep - i) * rise;
    B.stone.setColor(i % 2 ? COL.red : '#94524a');
    blk(B.stone, STEPS[0], STEPS[1], tA, i < nStep - 1 ? tA + run + 0.02 : TER[2], gB, yT, 'ft', UVR);
  }
  ob(TER[0], TER[1], TER[2], REC, gB, Y(0), 'ledge');
  ob(TER[0], STEPS[0], STEPS[2], TER[2], gB, Y(0), 'ledge');
  ob(STEPS[1], TER[1], STEPS[2], TER[2], gB, Y(0), 'ledge');
  slopeL([[STEPS[0], STEPS[2]], [STEPS[1], STEPS[2]], [STEPS[1], TER[2]], [STEPS[0], TER[2]]], gB,
    [[STEPS[0], Y(0) - TERR, STEPS[2]], [STEPS[1], Y(0) - TERR, STEPS[2]], [STEPS[0], Y(0), TER[2]]], 'steps');
  // stainless railings: round the side blocks and the terrace ends, two handrails down the flight
  const rail = (pts, y0, h = 1.0) => {
    B.det.setColor(COL.steel);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [s0, t0_] = pts[i], [s1, t1] = pts[i + 1], L = Math.hypot(s1 - s0, t1 - t0_), n = Math.max(1, Math.round(L / 1.6));
      const a = toMap(s0, t0_), b = toMap(s1, t1);
      B.det.tube([a[0], y0 + h, a[1]], [b[0], y0 + h, b[1]], 0.03, 6);
      B.det.tube([a[0], y0 + h * 0.45, a[1]], [b[0], y0 + h * 0.45, b[1]], 0.015, 4);
      for (let k = i ? 1 : 0; k <= n; k++) { const f = k / n, [x, z] = toMap(s0 + (s1 - s0) * f, t0_ + (t1 - t0_) * f); B.det.tube([x, y0, z], [x, y0 + h, z], 0.025, 4); }
    }
  };
  rail([[STEPS[0] - 0.15, TER[2] + 0.2], [STEPS[0] - 0.15, STEPS[2] + 0.15], [TER[0] + 0.15, STEPS[2] + 0.15], [TER[0] + 0.15, -0.2]], Y(0));
  rail([[STEPS[1] + 0.15, TER[2] + 0.2], [STEPS[1] + 0.15, STEPS[2] + 0.15], [TER[1] - 0.15, STEPS[2] + 0.15], [TER[1] - 0.15, -0.2]], Y(0));
  for (const s of [STEPS[0] + 7.5, STEPS[1] - 7.5]) {
    const a = toMap(s, STEPS[2] + 0.1), b = toMap(s, TER[2] - 0.05);
    B.det.setColor(COL.steel);
    B.det.tube([a[0], Y(0) - TERR + 0.9, a[1]], [b[0], Y(0) + 0.9, b[1]], 0.03, 6);
    for (const [p, y] of [[a, Y(0) - TERR], [b, Y(0) - 0.05]]) B.det.tube([p[0], y, p[1]], [p[0], y + 0.9, p[1]], 0.025, 4);
  }
  for (const [s0, s1] of [[TER[0], STEPS[0]], [STEPS[1], TER[1]]]) {
    ob(s0, s0 + 0.2, STEPS[2], TER[2], Y(0), Y(1.0), 'rail'); ob(s1 - 0.2, s1, STEPS[2], TER[2], Y(0), Y(1.0), 'rail');
    ob(s0, s1, STEPS[2], STEPS[2] + 0.2, Y(0), Y(1.0), 'rail');
  }

  // ---------------------------------------------------------------- the front block's side walls
  const sideFaces = [face(toMap(0, DEP), toMap(0, 0), -U[0], -U[1]), face(toMap(W, 0), toMap(W, DEP), U[0], U[1])];
  sideFaces.forEach((f, side) => {
    for (let k = 0; k < 7; k++) {
      const t = 5.0 + k * 4.3, sf = side ? t : DEP - t;
      win(f, sf - 0.75, sf + 0.75, Y(0.9), Y(3.4), { cols: 2, lit: k < 2 || r() < 0.5 });
      win(f, sf - 0.75, sf + 0.75, Y(5.0), Y(9.6), { cols: 2, rows: 2, lit: k < 2 || r() < 0.5 });
      B.det.setColor(COL.brown);
      box(B.det, f, sf - 0.75, sf + 0.75, Y(3.4), Y(4.0), 0, 0.04, 'ftu');
      box(B.det, f, sf - 0.75, sf + 0.75, Y(9.6), Y(10.2), 0, 0.04, 'ftu');
      if (k < 6) sconce(f, sf + (side ? 2.15 : -2.15), Y(4.6));
    }
    skin(B.wall, f, Y(0.3), Y(ATT1), COL.wall, UVW);
    B.stone.setColor(COL.red); box(B.stone, f, 0, f.L, gB, Y(0.3), 0, 0.05, 'ft', UVR);
  });
  // the back wall of the front block where it stands over the service block's roof
  B.wall.setColor(COL.wall); blk(B.wall, 0, W, DEP, DEP, Y(WING - 0.4), Y(ATT1), 'b', UVW);
  prismL([[0, 0], [W, 0], [W, DEP], [0, DEP]], gB, Y(PAR));
  // the railing on the parapet (front and both sides)
  const pr = (a, b, first = true) => { // first: the run's own corner post (the next run shares it)
    const [s0, t0_] = a, [s1, t1] = b, L = Math.hypot(s1 - s0, t1 - t0_), n = Math.round(L / 2.4), p0 = toMap(s0, t0_), p1 = toMap(s1, t1);
    B.det.setColor(COL.steel); B.det.tube([p0[0], Y(RAIL), p0[1]], [p1[0], Y(RAIL), p1[1]], 0.03, 5);
    for (let k = first ? 0 : 1; k <= n; k++) { const f = k / n, [x, z] = toMap(s0 + (s1 - s0) * f, t0_ + (t1 - t0_) * f); B.det.tube([x, Y(PAR), z], [x, Y(RAIL), z], 0.022, 4); }
  };
  pr([-0.1, DEP], [-0.1, -0.1]); pr([-0.1, -0.1], [W + 0.1, -0.1], false); pr([W + 0.1, -0.1], [W + 0.1, DEP], false);

  // ---------------------------------------------------------------- the hipped roof over the foyer and the hall
  {
    const e = 0.35, s0 = e, s1 = W - e, t0_ = e, t1 = DEP - e, run_ = (s1 - s0) / 2, sm = (s0 + s1) / 2;
    const r0 = t0_ + run_, r1 = t1 - run_, yE = Y(EAVE), yR = Y(RIDGE);
    const p = (s, y, t) => { const [x, z] = toMap(s, t); return [x, y, z]; };
    const A = p(s0, yE, t0_), Bq = p(s1, yE, t0_), C = p(s1, yE, t1), Dq = p(s0, yE, t1), R0 = p(sm, yR, r0), R1 = p(sm, yR, r1);
    const nrm = (a, b, c) => { const u = b.map((v, i) => v - a[i]), w = c.map((v, i) => v - a[i]); const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const l = Math.hypot(...n); return n.map((v) => (n[1] < 0 ? -v : v) / l); };
    const uvP = (q, ax) => q.map((pt) => [(pt[0] * ax[0] + pt[2] * ax[1]) / 2, (pt[1] - yE) / 0.5]);
    B.roof.setColor('#c2c6c8');
    const tri = (a, b, c, ax) => { const n = nrm(a, b, c), uv = uvP([a, b, c], ax); const i = B.roof.v; [a, b, c].forEach((q, k) => B.roof.vert(...q, ...n, ...uv[k])); B.roof.tri(i, i + 1, i + 2); };
    const quadR = (a, b, c, d, ax) => { const n = nrm(a, b, c), uv = uvP([a, b, c, d], ax); const i = B.roof.v; [a, b, c, d].forEach((q, k) => B.roof.vert(...q, ...n, ...uv[k])); B.roof.quad(i, i + 1, i + 2, i + 3); };
    // winding: counter-clockwise seen from above
    const ccw = (pts) => { const a = pts[0], b = pts[1], c = pts[2]; return (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]) < 0; };
    const emitQ = (q, ax) => (ccw(q) ? quadR(...q, ax) : quadR(...[...q].reverse(), ax));
    const emitT = (q, ax) => (ccw(q) ? tri(...q, ax) : tri(...[...q].reverse(), ax));
    emitT([A, Bq, R0], [U[0], U[1]]); emitT([C, Dq, R1], [U[0], U[1]]);
    emitQ([Bq, C, R1, R0], [V[0], V[1]]); emitQ([Dq, A, R0, R1], [V[0], V[1]]);
    // collision: four planes over their footprints
    const L2 = (s, t) => [s, t];
    slopeL([L2(s0, t0_), L2(s1, t0_), L2(sm, r0)], Y(EAVE - 0.4), [[s0, yE, t0_], [s1, yE, t0_], [sm, yR, r0]]);
    slopeL([L2(s1, t1), L2(s0, t1), L2(sm, r1)], Y(EAVE - 0.4), [[s1, yE, t1], [s0, yE, t1], [sm, yR, r1]]);
    slopeL([L2(s1, t0_), L2(s1, t1), L2(sm, r1), L2(sm, r0)], Y(EAVE - 0.4), [[s1, yE, t0_], [s1, yE, t1], [sm, yR, r0]]);
    slopeL([L2(s0, t1), L2(s0, t0_), L2(sm, r0), L2(sm, r1)], Y(EAVE - 0.4), [[s0, yE, t1], [s0, yE, t0_], [sm, yR, r1]]);
    // roof vents and a mast on the ridge
    B.det.setColor('#b8bcbe');
    for (const [s, t] of [[8, 8], [23, 8], [8, 27], [23, 27], [12, 18], [19, 18]]) { const h = Y(EAVE) + (RIDGE - EAVE) * (1 - Math.abs(s - sm) / run_) + 0.05; const [x, z] = toMap(s, t); B.det.boxC(x, h + 0.35, z, 0.7, 0.8, 0.7); }
  }

  // ---------------------------------------------------------------- the service block round the stage
  const [rs0, rs1, rt0, rt1] = REAR;
  const rearFaces = [
    face(toMap(rs0, rt1), toMap(rs0, rt0), -U[0], -U[1]),          // north side
    face(toMap(rs1, rt0), toMap(rs1, rt1), U[0], U[1]),            // south side
    face(toMap(ANNEX[0], rt1), toMap(rs0, rt1), V[0], V[1]),       // back, north of the annex
    face(toMap(rs1, rt1), toMap(ANNEX[1], rt1), V[0], V[1]),       // back, south of the annex
    face(toMap(rs0, rt0), toMap(0, rt0), -V[0], -V[1]),            // front stubs beside the foyer block
    face(toMap(W, rt0), toMap(rs1, rt0), -V[0], -V[1]),
  ];
  rearFaces.forEach((f, i) => {
    if (i < 4) {
      const n = Math.max(1, Math.floor((f.L - 1.2) / 3.2)), pad = (f.L - n * 3.2) / 2;
      for (let k = 0; k < n; k++) {
        const c = pad + 1.6 + k * 3.2;
        for (const y of [0.8, 4.4, 8.0]) win(f, c - 0.7, c + 0.7, Y(y), Y(y + 1.8), { cols: 2, lit: r() < 0.35 });
      }
    }
    skin(B.wall, f, Y(0.3), Y(WPAR), COL.wall, UVW);
    B.wall.setColor(COL.wall); box(B.wall, f, 0, f.L, Y(WING), Y(WPAR), -0.35, 0, 'b');
    B.stone.setColor(COL.red); box(B.stone, f, 0, f.L, gB, Y(0.3), 0, 0.05, 'ft', UVR);
    B.wall.setColor('#f1ebdb'); box(B.wall, f, -0.02, f.L + 0.02, Y(WPAR), Y(WPAR + 0.08), -0.35, 0.06, 'ftb');
  });
  // its roof, round the fly tower, and the parapet's inner face
  const [ts0, ts1, tt0, tt1] = TOWER;
  {
    const ring = [[rs0, rt0], [rs1, rt0], [rs1, rt1], [rs0, rt1]].map(([s, t]) => toMap(s, t));
    const hole = [[ts0, tt0], [ts1, tt0], [ts1, tt1], [ts0, tt1]].map(([s, t]) => toMap(s, t));
    B.det.setColor('#6f7273'); B.det.fill(ring, [hole], Y(WING), true);
  }
  prismL([[rs0, rt0], [rs1, rt0], [rs1, rt1], [rs0, rt1]], gB, Y(WPAR));
  // the annex at the back: two storeys, three short wings, the stage door under a canopy
  {
    const [a0, a1, b0, b1, h] = ANNEX;
    const parts = [[a0, a1, b0, b1], ...WINGS.map(([p, q]) => [p, q, b1, ANNEX_T])];
    parts.forEach(([p, q, u, v], i) => {
      const e0 = i ? 0.06 : 0; // only the wings' ends and backs carry the cap's overhang (the body's back is under them in part)
      B.wall.setColor(COL.wall); blk(B.wall, p, q, u, v, Y(0.3), Y(h), 'blr', UVW);
      B.stone.setColor(COL.red); blk(B.stone, p - 0.03, q + 0.03, u, v + 0.03, gB, Y(0.3), 'blr', UVR);
      B.wall.setColor('#f1ebdb'); blk(B.wall, p - 0.04, q + 0.04, u, v + e0, Y(h), Y(h + 0.35), 'blr', UVW);
      B.det.setColor('#6f7273'); blk(B.det, p - 0.04, q + 0.04, u, v + e0, Y(h + 0.35), Y(h + 0.35), 't');
      prismL([[p, u], [q, u], [q, v], [p, v]], gB, Y(h + 0.35));
    });
    // flat windows on the back of the wings and the recesses; the stage door: a tall roller door and a person door
    const fb = face(toMap(a1, ANNEX_T), toMap(a0, ANNEX_T), V[0], V[1]);
    const flat = (s0, s1, y0, y1, lit) => { const G = lit ? B.lit : B.glass; G.setColor(tint()); box(G, fb, s0, s1, y0, y1, 0, 0.03, 'f'); B.det.setColor('#d9d3c4'); box(B.det, fb, s0 - 0.08, s1 + 0.08, y0 - 0.08, y0, 0, 0.08, 'ft'); };
    const sOf = (s) => a1 - s; // site s -> this face's s
    for (const [p, q] of WINGS) {
      const c = sOf((p + q) / 2);
      flat(c - 0.7, c + 0.7, Y(4.2), Y(6.2), r() < 0.4);
      if (p === WINGS[1][0]) { // the middle wing: the stage door
        B.det.setColor('#5b5f63'); box(B.det, fb, c - 1.9, c + 1.9, Y(0), Y(4.0), 0, 0.04, 'f');
        B.det.setColor(COL.redD); box(B.det, fb, c - 2.4, c + 2.4, Y(4.0), Y(4.25), 0, 1.4, 'ftu');
        ob(p, q, ANNEX_T, ANNEX_T + 1.4, Y(4.0), Y(4.25), 'awning', OVERHANG);
      } else flat(c - 0.7, c + 0.7, Y(0.9), Y(2.9), r() < 0.4);
    }
  }

  // ---------------------------------------------------------------- the fly tower
  const tFaces = [face(toMap(ts0, tt0), toMap(ts1, tt0), -V[0], -V[1]), face(toMap(ts1, tt0), toMap(ts1, tt1), U[0], U[1]),
    face(toMap(ts1, tt1), toMap(ts0, tt1), V[0], V[1]), face(toMap(ts0, tt1), toMap(ts0, tt0), -U[0], -U[1])];
  tFaces.forEach((f) => {
    B.wall.setColor(COL.tower); box(B.wall, f, 0, f.L, Y(TW0), Y(TW1), -0.3, 0, 'f', UVW);
    B.wall.setColor('#e6e2d8'); box(B.wall, f, -0.05, f.L + 0.05, Y(TW1), Y(TWP), -0.35, 0.05, 'ftb', UVW);
  });
  B.det.setColor('#727576'); B.det.fill([[ts0, tt0], [ts1, tt0], [ts1, tt1], [ts0, tt1]].map(([s, t]) => toMap(s, t)), [], Y(TW1 + 0.1), true);
  prismL([[ts0, tt0], [ts1, tt0], [ts1, tt1], [ts0, tt1]], Y(WING - 0.5), Y(TWP));
  if (Z?.edge) for (const [a, b, y] of [[[0, -0.2], [W, -0.2], Y(PAR)], [[ts0, tt0 + 0.1], [ts1, tt0 + 0.1], Y(TWP)]]) { // the parapet tops facing the square
    const p = toMap(...a), q = toMap(...b); Z.edge(p[0], p[1], q[0], q[1], y, -V[0], -V[1]);
  }

  // ================================================================ the square
  // a grid draped on the terrain, `lift` over it; uv from the site frame in `per` metres
  const drape = (D, [s0, s1, t0_, t1], lift, per, cell = 2) => {
    const ns = Math.max(1, Math.ceil((s1 - s0) / cell)), nt = Math.max(1, Math.ceil((t1 - t0_) / cell)), base = D.v;
    for (let j = 0; j <= nt; j++) for (let i = 0; i <= ns; i++) {
      const s = s0 + (s1 - s0) * i / ns, t = t0_ + (t1 - t0_) * j / nt, [x, z] = toMap(s, t);
      D.vert(x, g(x, z) + lift, z, 0, 1, 0, s / per, -t / per);
    }
    for (let j = 0; j < nt; j++) for (let i = 0; i < ns; i++) {
      const a = base + j * (ns + 1) + i, b = a + 1, c = a + ns + 2, d = a + ns + 1;
      D.tri(a, c, b); D.tri(a, d, c);
    }
  };
  // a raised draped slab: its top `lift` over the ground, kerb faces down to `foot`
  const slab = (top, kerb, R, lift, foot, per, kerbCol = '#a9a49c') => {
    drape(top, R, lift, per, 1.5);
    const [s0, s1, t0_, t1] = R;
    kerb.setColor(kerbCol);
    const edge = (a, b, nrm) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 1.5));
      for (let k = 0; k < n; k++) {
        const p = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], q = [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n];
        const P = toMap(...p), Qm = toMap(...q), gp = g(...P), gq = g(...Qm), N = [U[0] * nrm[0] + V[0] * nrm[1], 0, U[1] * nrm[0] + V[1] * nrm[1]];
        quad(kerb, [P[0], gp + foot, P[1]], [Qm[0], gq + foot, Qm[1]], [Qm[0], gq + lift, Qm[1]], [P[0], gp + lift, P[1]], N, [[k * L / n, 0], [(k + 1) * L / n, 0], [(k + 1) * L / n, 0.3], [k * L / n, 0.3]]);
      }
    };
    edge([s0, t0_], [s1, t0_], [0, -1]); edge([s1, t1], [s0, t1], [0, 1]); edge([s0, t1], [s0, t0_], [-1, 0]); edge([s1, t0_], [s1, t1], [1, 0]);
  };
  const LP = 0.24; // the paving's lift (the OSM walks draw at 0.19)
  Q.pave.setColor('#ffffff');
  drape(Q.pave, [SQUARE[0], APRON[0], SQUARE[2], SQUARE[3]], LP, 5.2);
  drape(Q.pave, [APRON[1], SQUARE[1], SQUARE[2], SQUARE[3]], LP, 5.2);
  drape(Q.pave, [APRON[0], APRON[1], SQUARE[2], APRON[2]], LP, 5.2);
  Q.apron.setColor('#ffffff');
  drape(Q.apron, APRON, LP, 2);
  // the monument's platform (red granite), the beds behind it, the lawn square and its round bed
  slab(Q.apron, Q.grey, PLATFORM, LP + 0.15, LP - 0.05, 2, '#8c4e43');
  Q.plant.setColor('#7c8d5c'); slab(Q.plant, Q.grey, BED_W, LP + 0.45, LP + 0.1, 1.5);
  Q.plant.setColor('#6f8752'); slab(Q.plant, Q.grey, BED_N, LP + 0.6, LP + 0.1, 1.5);
  Q.plant.setColor('#86a35c'); slab(Q.plant, Q.grey, LAWN, LP + 0.17, LP - 0.05, 1.5, '#b2ada4');
  {
    const [cs, ct, R] = ROUND, [cx, cz] = toMap(cs, ct), gy = g(cx, cz) + LP + 0.17;
    // a granite kerb ring (outer face, lip, inner face) round the soil
    Q.grey.setColor('#b9b4aa').lathe([[R + 0.3, gy - 0.1], [R + 0.3, gy + 0.35], [R, gy + 0.35], [R, gy + 0.2]], 28, cx, cz);
    Q.plant.setColor('#5a4a3a').cyl(cx, gy + 0.2, cz, R, R, 0.05, 28, true);
    // roses in rings: red outside, white, pink in the middle round a little spruce
    for (const [rr, col] of [[R - 0.25, '#b0303a'], [R - 1.0, '#e8e2dc'], [R - 1.8, '#d7709a']]) {
      for (let k = 0, n = Math.round(rr * 5); k < n; k++) {
        const a = k / n * PI * 2, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        Q.plant.setColor(col).ellipsoid([x, gy + 0.42, z], [0.32, 0.22, 0.32], 6, 4);
      }
    }
  }
  // flowers and clipped shrubs on the beds by the monument
  for (let s = BED_W[0] + 0.6; s < BED_W[1] - 0.4; s += 0.9) {
    const [x, z] = toMap(s, (BED_W[2] + BED_W[3]) / 2 + (r() - 0.5) * 0.6);
    Q.plant.setColor(r() < 0.5 ? '#b23a3c' : r() < 0.5 ? '#e0b53a' : '#7a9a4a').ellipsoid([x, g(x, z) + LP + 0.55, z], [0.4, 0.22, 0.4], 6, 4);
  }
  for (let t = BED_N[2] + 0.6; t < BED_N[3] - 0.3; t += 1.1) {
    const [x, z] = toMap((BED_N[0] + BED_N[1]) / 2, t);
    Q.plant.setColor('#3f5a35').ellipsoid([x, g(x, z) + LP + 0.95, z], [0.75, 0.5, 0.75], 7, 5);
  }

  // ---------------------------------------------------------------- the monument
  const [ms, mt] = MONUMENT;
  const YAW = Math.atan2(-V[0], -V[1]);                 // local +z (forward) -> -V (the boulevard)
  const mFrame = (a, y, d, k = 1) => { const [x, z] = toMap(ms - a, mt - d); return M4(x, y, z, YAW, k); };
  const corners = [[-3, -2.4], [3, -2.4], [3, 2.4], [-3, 2.4]].map(([a, d]) => g(...toMap(ms - a, mt - d)));
  const yb = Math.max(...corners) + LP + 0.15, ybLow = Math.min(...corners);
  const STEP = [[2.95, 2.35, 0.18], [2.55, 1.95, 0.18]]; // half across, half deep, height
  let y = yb;
  STEP.forEach(([ha, hd, h], i) => {
    Q.grey.setColor(i ? '#d2cec6' : '#c4c0b8').with(mFrame(0, 0, 0.35), (q) => q.box(-ha, i ? y : ybLow - 0.2, -hd, ha, y + h, hd, 4 | 1 | 2 | 16 | 32));
    y += h;
  });
  const yS = y;
  S.obox(...toMap(ms, mt - 0.35), STEP[0][0], STEP[0][1], ANG, ybLow - 0.2, yS, 'ledge');
  // the shaft: a base block, the tapered part, three courses, the cap
  const sh = 0.85;
  Q.grey.setColor('#d6d2ca').with(mFrame(0, 0, 0), (q) => {
    q.box(-sh - 0.1, yS, -sh - 0.1, sh + 0.1, yS + 0.4, sh + 0.1, 4 | 1 | 2 | 16 | 32);
    q.with(new THREE.Matrix4().makeRotationY(PI / 4), (qq) => qq.cyl(0, yS + 0.4, 0, 0.62 * Math.SQRT2, sh * Math.SQRT2, 1.3, 4, false));
    q.setColor('#8f8b84').box(-sh + 0.03, yS + 1.7, -sh + 0.03, sh - 0.03, yS + 3.95, sh - 0.03, 1 | 2 | 16 | 32); // the core behind the joints
    for (let c = 0; c < 3; c++) { const y0 = yS + 1.7 + c * 0.75; q.setColor(c === 2 ? '#dcd8d0' : '#d4d0c8').box(-sh, y0 + 0.012, -sh, sh, y0 + 0.75, sh, c === 2 ? 1 | 2 | 16 | 32 : 4 | 1 | 2 | 16 | 32); }
    q.setColor('#dedad2').box(-sh - 0.07, yS + 3.95, -sh - 0.07, sh + 0.07, yS + 4.15, sh + 0.07, 63);
  });
  // the inscription on the top course, facing the boulevard
  {
    const yI = yS + 1.7 + 1.5, m = mFrame(0, 0, 0), P = [[-0.75, yI + 0.08], [0.75, yI + 0.08], [0.75, yI + 0.68], [-0.75, yI + 0.68]].map(([a, h]) => new THREE.Vector3(a, h, sh + 0.025).applyMatrix4(m).toArray());
    const i = Q.sign.v, n = [-V[0], 0, -V[1]];
    Q.sign.setColor('#ffffff');
    // the canvas reads left to right as seen from the front: his right (local -x) on the viewer's left
    [[0, 0], [1, 0], [1, 0.47], [0, 0.47]].forEach((uv, k) => Q.sign.vert(...P[k], ...n, ...uv));
    Q.sign.quad(i, i + 1, i + 2, i + 3);
  }
  const yTop = yS + 4.15;
  S.obox(...toMap(ms, mt), sh + 0.1, sh + 0.1, ANG, yS, yTop, 'monument');
  // the bronze poet on a thin plate, and the granite groups at the shaft's front corners
  Q.det.setColor('#2c2620').with(mFrame(0, 0, 0), (q) => q.box(-0.6, yTop, -0.5, 0.6, yTop + 0.08, 0.55, 63));
  put(bronze, poet(), mapper(mFrame(0, yTop + 0.08, 0.05, 3 / 1.8)));
  S.obox(...toMap(ms, mt), 0.5, 0.45, ANG, yTop, yTop + 3.1, 'monument');
  put(rock, group('kobzar', r), mapper(mFrame(1.55, yS, 0.55)));
  put(rock, group('kateryna', r), mapper(mFrame(-1.45, yS, 0.45)));
  S.obox(...toMap(ms - 1.55, mt - 0.55), 0.9, 0.65, ANG, yS, yS + 2.0, 'monument');
  S.obox(...toMap(ms + 1.45, mt - 0.45), 0.6, 0.6, ANG, yS, yS + 2.7, 'monument');
  // two ground projectors in front of the steps
  const flood = [];
  for (const a of [-2.2, 2.2]) {
    const [x, z] = toMap(ms - a, mt - 3.6), yy = g(x, z) + LP + 0.15;
    Q.det.setColor(COL.dark).with(M4(x, yy, z, YAW + (a < 0 ? 0.35 : -0.35)), (q) => q.box(-0.2, 0, -0.16, 0.2, 0.3, 0.16, 63));
    Q.glow.with(M4(x, yy, z, YAW + (a < 0 ? 0.35 : -0.35)), (q) => q.box(-0.15, 0.06, 0.16, 0.15, 0.26, 0.19, 16 | 1 | 2 | 4 | 8));
    flood.push([x, yy + 0.3, z]);
  }

  // ---------------------------------------------------------------- lamps, benches, tree pits
  let lamps = 0;
  const lamp = (s, t) => {
    const [x, z] = toMap(s, t), yy = g(x, z) + LP;
    Q.det.setColor('#2b2d2f').cyl(x, yy, z, 0.15, 0.12, 0.45, 8).cyl(x, yy + 0.45, z, 0.075, 0.06, 4.3, 8);
    Q.det.cyl(x, yy + 4.75, z, 0.08, 0.2, 0.25, 10).cyl(x, yy + 5.55, z, 0.24, 0.05, 0.22, 10);
    Q.glow.ellipsoid([x, yy + 5.25, z], [0.23, 0.32, 0.23], 10, 6);
    S.cyl(x, z, yy - 0.3, yy + 5.6, 0.14, 0.1, 'pole'); lamps++;
  };
  for (const s of [-27, -9, 9, 27, 45]) lamp(s, -44.6);
  for (const t of [-18, -34]) { lamp(-29.6, t); lamp(57.6, t); }
  lamp(TER[0] - 1.2, APRON[2] + 0.8); lamp(TER[1] + 1.2, APRON[2] + 0.8);
  let benches = 0;
  const bench = (s, t, face_) => { // face_: the way the sitter looks, in the site frame [ds, dt]
    const [x, z] = toMap(s, t), yy = g(x, z) + LP, yaw = Math.atan2(U[0] * face_[0] + V[0] * face_[1], U[1] * face_[0] + V[1] * face_[1]);
    Q.det.with(M4(x, yy, z, yaw), (q) => {
      q.setColor('#8a5a34');
      for (let k = 0; k < 3; k++) q.box(-0.9, 0.43, -0.22 + k * 0.15, 0.9, 0.47, -0.1 + k * 0.15, 63);
      for (let k = 0; k < 2; k++) q.box(-0.9, 0.58 + k * 0.16, -0.31, 0.9, 0.7 + k * 0.16, -0.26, 63);
      q.setColor('#2e3032');
      for (const a of [-0.75, 0.75]) { q.box(a - 0.04, 0, -0.25, a + 0.04, 0.45, 0.25, 63); q.box(a - 0.04, 0.45, -0.36, a + 0.04, 0.92, -0.31, 63); }
    });
    S.obox(x, z, 0.95, 0.35, -yaw, yy, yy + 0.5, 'bench'); benches++;
  };
  for (const s of [45.6, 49, 52.4]) bench(s, LAWN[2] - 0.8, [0, -1]);
  for (const s of [45.6, 49, 52.4]) bench(s, LAWN[3] + 0.8, [0, 1]);
  for (const t of [-20.5, -24.5]) bench(PLATFORM[1] + 1.2, t, [1, 0]);
  for (const s of [-5, 35.8]) bench(s, -10.8, [0, -1]);
  // the linden's pit: a dark grille round it
  {
    const [x, z] = toMap(-6.6, -21.1), yy = g(x, z) + LP;
    Q.det.setColor('#2a2a28').cyl(x, yy, z, 1.2, 1.2, 0.03, 16, true);
  }

  // ---------------------------------------------------------------- meshes
  const gTex = graniteTex(), rTex = redTex(r), sTex = signTex(), pane = paneTex(false), mask = paneTex(true);
  const warm = new THREE.Color('#ffd9a8');
  const wallMat = floodlit(new THREE.MeshStandardMaterial({ map: speckle(r, '#f3f0ea'), vertexColors: true, roughness: 0.86, emissive: 0xffe2b8, emissiveIntensity: 0 }), wash, 4.2, 'drama-wall');
  wallMat.emissiveMap = wallMat.map;
  const signMat = new THREE.MeshStandardMaterial({ map: sTex, transparent: false, alphaTest: 0.45, roughness: 0.4, metalness: 0.5, emissive: 0xffc870, emissiveMap: sTex, emissiveIntensity: 0, side: THREE.DoubleSide });
  const M = {
    wall: wallMat,
    stone: new THREE.MeshStandardMaterial({ map: rTex, vertexColors: true, roughness: 0.55, metalness: 0.05 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 }),
    roof: new THREE.MeshStandardMaterial({ map: seamTex(), vertexColors: true, roughness: 0.45, metalness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({ map: pane, vertexColors: true, roughness: 0.1, metalness: 0.45, envMapIntensity: 1.2 }),
    lit: new THREE.MeshStandardMaterial({ map: pane, vertexColors: true, roughness: 0.12, metalness: 0.35, emissive: warm, emissiveMap: mask, emissiveIntensity: 0 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xf6f0e2, roughness: 0.3, emissive: 0xffe2b0, emissiveIntensity: 0.05 }),
    sign: signMat,
  };
  const bld = finish(root, 'drama', B, M, { shade: ['wall', 'stone', 'roof'] });
  const qTex = graniteTex();
  const MQ = {
    pave: decal(new THREE.MeshStandardMaterial({ map: paveTex(r), vertexColors: true, roughness: 0.82, polygonOffset: true, polygonOffsetFactor: -4 })),
    apron: decal(new THREE.MeshStandardMaterial({ map: slabRedTex(r), vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4 })),
    grey: floodlit(new THREE.MeshStandardMaterial({ map: qTex, emissiveMap: qTex, vertexColors: true, roughness: 0.85, emissive: 0xffe6c8, emissiveIntensity: 0 }), flood, 9, 'drama-granite'),
    plant: new THREE.MeshStandardMaterial({ map: leafTex(r), vertexColors: true, roughness: 0.95 }),
    det: M.det, glow: M.glow, sign: signMat,
  };
  const sq = finish(root, 'drama-square', Q, MQ, { shade: ['grey', 'det'] });
  const bronzeMat = floodlit(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.55, emissive: 0xc99a62, emissiveIntensity: 0 }), flood, 12, 'drama-bronze');
  const rockMat = floodlit(new THREE.MeshStandardMaterial({ map: gTex, color: 0xe0dcd4, roughness: 0.92, emissive: 0xffe6c8, emissiveIntensity: 0 }), flood, 8, 'drama-rock');
  let mV = 0;
  for (const [name, s, mat] of [['bronze', bronze, bronzeMat], ['rock', rock, rockMat]]) {
    const geo = s.build();
    if (s === rock) { // uv for the granite: planar from the world position
      const P = geo.attributes.position, uv = new Float32Array(P.count * 2);
      for (let i = 0; i < P.count; i++) { uv[2 * i] = (P.getX(i) + P.getZ(i)) / 1.2; uv[2 * i + 1] = P.getY(i) / 1.2; }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    mV += s.v;
    sq.group.add(Object.assign(new THREE.Mesh(s === bronze ? patina(geo) : geo, mat), { name: 'drama-square-' + name, castShadow: true, receiveShadow: true }));
  }

  // trees: the linden on the square, a blue spruce in the bed behind the monument
  const spots = [];
  { const [x, z] = toMap(-6.6, -21.1); spots.push({ x, z, kind: 'park', variant: 'linden', sc: 1.1 }); }
  { const [x, z] = toMap(-21.6, -16.4); spots.push({ x, z, kind: 'conifer', variant: 'spruce', sc: 1.05, pal: [PARK_PINE[0].map(([rr, gg, bb]) => [0.8 * rr, 0.95 * gg, 1.25 * bb])] }); }

  const verts = bld.verts + sq.verts + mV;
  console.log(`[cherkasy] drama theatre: floor ${yF.toFixed(1)} m, ${nWin} windows, ${lamps} lamps, ${benches} benches, ${(verts / 1000).toFixed(1)}k verts (monument ${(mV / 1000).toFixed(1)}k), ${bld.meshes + sq.meshes + 2} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  const inR = (s, t, [s0, s1, t0_, t1]) => s > s0 && s < s1 && t > t0_ && t < t1;
  const ring = [];
  const b = map?.buildings?.find((q) => q.id === OSM_ID);
  if (b) for (let i = 0; i < b.p.length; i += 2) ring.push([b.p[i], b.p[i + 1]]);
  return {
    spots,
    footprints: ring.length ? [{ poly: ring, h: Y(TWP) - gLo, kind: 'public', name: 'Черкаський музично-драматичний театр ім. Т. Г. Шевченка' }] : [],
    // generated trees keep off the building, its terrace and apron, and the paved square
    clear: (x, z) => { const [s, t] = toLocal(x, z); return inR(s, t, [-6, 37, -14, 74]) || inR(s, t, [SQUARE[0] - 0.5, SQUARE[1] + 0.5, SQUARE[2] - 0.5, SQUARE[3] + 0.5]); },
    update() {
      const k = nightK.value, e = Math.min(1, 3 * k);
      M.lit.emissiveIntensity = 0.95 * k;
      wallMat.emissiveIntensity = 0.32 * e;
      signMat.emissiveIntensity = 0.9 * e;
      M.glow.emissiveIntensity = 0.05 + 2.4 * e;
      bronzeMat.emissiveIntensity = 0.08 * e; MQ.grey.emissiveIntensity = 0.04 * e; rockMat.emissiveIntensity = 0.05 * e;
    },
  };
}
