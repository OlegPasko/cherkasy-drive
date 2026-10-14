// OWNER: cherkasy. ЧДБК – Черкаський державний бізнес-коледж, вул. В'ячеслава Чорновола, 243 (issue #49: "коледж
// ЧДБК виглядить як будівля без загородження"). The campus (OSM 411920823, amenity=college) between Чорновола and
// Чиковані, as the college's own photos show it (csbc.edu.ua: the street front with the fence, the portico close up,
// the dormitory from Чорновола, the sports field) and the Esri aerial for the roofs and the field:
// - the main building (OSM 163205910 and its eight parts): корпус №1, the three-storey wing on Чиковані rebuilt in 2021
//   – bright red render, light-grey composite pilasters at the corners, white PVC windows, a low blue metal hipped roof –
//   with its portico: four square light-grey columns, a flat canopy over the doors, a polycarbonate barrel vault under a
//   white arch between two white towers, and the college's own sign over it («ЧЕРКАСЬКИЙ [тризуб] ДЕРЖАВНИЙ» over the
//   blue scroll «БІЗНЕС-КОЛЕДЖ»); the two-storey block behind it (blue roof), the four-storey корпус №2 (1985) joined to
//   it by a bridge over the yard drive on the first floor, the one-storey brick annex (blue roof) and the porches;
// - the five-storey dormitory (OSM 163205911) on Чорновола: red brick with grey sand-lime bands at sill and head
//   height, the porch – a blue metal roof on red brick piers over the blue door –, the grey panelled stack over it;
// - the grounds: the street fence on Чорновола and Чиковані (red brick piers with blue caps on a brick plinth, black
//   ornamental iron between), its gates (the main one in front of the portico, the yard drives), the inner fences,
//   plain bar fences on the back sides, the paved forecourt with the drive and its parking, black-and-white bollards
//   on the pavement, spruces by the portico, the football field (OSM's pitch) marked out with goals, the small pitch's goals,
//   the basketball court's hoops, pull-up and parallel bars.
// Guesses: корпус №2's brick (striped like the dorm, its era), the annex's brick, the backs of the blocks, the back
// fences, where the bars stand. The windows light up at night, so do the sign, the portico and the porch.
//   CHDBK_SKIP: the OSM ids replaced here (buildings.js skips their extrusion)
//   buildChdbk({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints, info } | null
//     info: { floor, eave (wing A), dorm: { floor, roof }, gates: [[x, z]] (open, map metres), bridge: { y0, y1 } } (tests)
// The site is axis-aligned in the map frame (x north-east, z south-east): Чиковані runs along x ≈ -3448, Чорновола along
// z ≈ 2420. Walls are laid per side in a face frame (slabkit.js): s along the side, y up, o outward.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { OVERHANG } from '../collision.js';
import { rng, inPoly } from './geo.js';
import { canvasTex, decal } from './sculpt.js';
import { brickTex, roofFace } from './civic.js';
import { face, ringFaces, at, quad, box, solid, finish, speckle, label } from './slabkit.js';

const MAIN_ID = 163205910, DORM_ID = 163205911;
export const CHDBK_SKIP = new Set([MAIN_ID, DORM_ID]);

const R = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
// the OSM parts (map metres): A the wing on Чиковані, B its portico, C the block behind, D the first-floor bridge,
// E корпус №2, F its east porch, G the annex, the dormitory and its porch bump
const A = [-3425.6, 2490.2, -3414.7, 2543.5], PORT = [-3430.5, 2494.4, -3425.6, 2505.2];
const C = [-3414.7, 2494.5, -3377.4, 2512.2], D = [-3385.9, 2512.2, -3381.6, 2523.5];
const E = [-3387.0, 2523.5, -3370.9, 2551.4], F = [-3371.0, 2540.6, -3369.0, 2547.0];
const G = [[-3414.8, 2532.2], [-3399.6, 2532.2], [-3399.6, 2551.7], [-3409.8, 2551.7], [-3409.7, 2539.2], [-3414.8, 2539.3]];
const DORM = [-3425.0, 2446.4, -3370.4, 2461.6], DPORCH = [-3406.0, 2444.2, -3391.9, 2446.4];
// the fences (OSM 1198632851 and its neighbours), simplified to their corners; gates where the drives come in
const STREET_W = [[-3439.7, 2434.2], [-3440.1, 2512.0], [-3440.3, 2554.6], [-3439.6, 2556.8], [-3439.8, 2593.2]];   // Чиковані
const STREET_N = [[-3407.0, 2434.0], [-3439.7, 2434.2]];                                                               // Чорновола, west of the dorm's forecourt
const STREET_NE = [[-3370.4, 2446.4], [-3354.7, 2446.6], [-3354.7, 2434.0], [-3285.3, 2434.2]];                        // the dorm's east corner on to Чорновола
const BACK = [[-3439.8, 2593.2], [-3285.8, 2592.9], [-3285.3, 2434.2]];                                                 // the back: south and east
const INNER = [[[-3424.8, 2461.6], [-3425.6, 2490.2]], [[-3424.8, 2543.5], [-3424.8, 2572.4]]];                        // the dorm to the wing, the wing south
const PLAIN = [[[-3342.0, 2472.6], [-3354.6, 2473.0], [-3354.7, 2446.6], [-3340.7, 2447.1]], [[-3354.6, 2473.0], [-3354.3, 2483.9], [-3353.2, 2483.9]],
  [[-3340.8, 2486.1], [-3285.4, 2486.3]]];
const GATES = [{ c: [-3440.0, 2471.2], w: 4.6 }, { c: [-3440.1, 2498.5], w: 4.6 }, { c: [-3439.6, 2559.0], w: 4.6 },
  { c: [-3425.2, 2470.8], w: 4.2 }, { c: [-3424.8, 2559.3], w: 4.2 }, { c: [-3381.3, 2593.0], w: 1.3 }];
// the sports grounds (OSM, the ground paints them): the football field 1016592834, the small pitch south of it
// 1199498656, the basketball court 1198632827; the pull-up bars between the court and the field
const PITCH = [-3334.6, 2513.6, -3291.4, 2568.4], MINI = [-3335.3, 2574.1, -3289.5, 2590.5], COURT = [-3362.0, 2524.4, -3345.3, 2556.9];
const BARS = [-3340.0, 2517.0];

const FH = 3.5, FHE = 3.3, FHD = 2.9;                                   // storeys: the main blocks, корпус №2, the dormitory
const RED = '#cf3a2e', PANEL = '#e6e8ea', BLUE = '#2f64c0', FASCIA = '#2f6fd0', PLINTH = '#8d8b88', GREY = '#c9c6bd';
const BRICKC = '#ffffff', ROOFDARK = '#57595c', STEEL = '#2d3033', IRON = '#a3a8ae';

// ---- textures
const T = { WIN3: 0, WIN2: 1, DOOR: 2, GLAZE: 3, BWIN: 4, BDOOR: 5 }, NT = 6, TW = 128;
function atlas(mask) {
  return canvasTex(NT * TW, TW, (g) => {
    const fill = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    // frame round glass with mullions at the fractions vx and a transom at ty
    const pane = (t, vx, ty, { fw = 7, frame = '#f2f2ef', glass = ['#a9bccb', '#405060'], blind = null, edge = '#7a7570' } = {}) => {
      const X = t * TW;
      if (mask) { fill('#000', X, 0, TW, TW); fill('#fff', X + fw, fw, TW - 2 * fw, TW - 2 * fw); return; }
      fill(edge, X, 0, TW, TW); fill(frame, X + 3, 3, TW - 6, TW - 6);
      const gr = g.createLinearGradient(0, 0, 0, TW); gr.addColorStop(0, glass[0]); gr.addColorStop(1, glass[1]);
      g.fillStyle = gr; g.fillRect(X + fw, fw, TW - 2 * fw, TW - 2 * fw);
      if (blind) { g.fillStyle = blind; for (let x = X + fw; x < X + TW - fw; x += 9) g.fillRect(x, fw, 6, (TW - 2 * fw) * 0.45); }
      g.fillStyle = frame;
      for (const v of vx) g.fillRect(X + v * TW - fw / 2, 0, fw, TW);
      if (ty) g.fillRect(X, ty * TW - fw / 2, TW, fw);
      fill('rgba(0,0,0,0.28)', X + 3, 3, TW - 6, 5);                   // the lintel's shadow
    };
    pane(T.WIN3, [0.5], 0.3);                                            // two broad sashes under a top light
    pane(T.WIN2, [0.5], 0.3, { glass: ['#9db0bf', '#3a4752'], blind: 'rgba(230,214,190,0.6)' });
    pane(T.DOOR, [0.25, 0.5, 0.75], 0.72, { fw: 6, frame: '#24509c', glass: ['#9fb6c8', '#2f3e4c'], edge: '#1d3f7c' });
    pane(T.GLAZE, [0.5], 0.5, { fw: 6, frame: '#24509c', glass: ['#b5c6d3', '#4b5d6c'], edge: '#1d3f7c' });
    pane(T.BWIN, [0.5], 0.3, { frame: '#2c5aa8', glass: ['#9db0bf', '#34414c'], edge: '#5a3a2e' });
    { const X = T.BDOOR * TW;                                            // the dorm's blue panelled door, a glazed top
      if (mask) { fill('#000', X, 0, TW, TW); fill('#fff', X + 22, 12, 36, 26); fill('#fff', X + 70, 12, 36, 26); }
      else {
        fill('#163c86', X, 0, TW, TW); fill('#2357b6', X + 6, 6, TW - 12, TW - 6); fill('#163c86', X + TW / 2 - 2, 0, 4, TW);
        for (const x0 of [22, 70]) { fill('#33475a', X + x0, 12, 36, 26); fill('#1d4796', X + x0, 50, 36, 66); }
      } }
  }, { repeat: false });
}
// the dorm / корпус №2 brick: red with grey sand-lime bands at sill and head height; one repeat = 2 m x one storey
// (36 courses; v 0 at the floor): grey courses 6-10 (under the sills) and 29-33 (over the heads)
const BAND = { sill: 10.5 / 36, head: 29 / 36 };
const stripeTex = (r) => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#b9afa2'; g.fillRect(0, 0, w, h);
  const ch = h / 36, bw = w / 8;
  for (let j = 0; j < 36; j++) {
    const course = 35 - j, grey = (course >= 6 && course < 10) || (course >= 29 && course < 33);  // canvas row j is course 35 - j
    for (let i = 0; i < 9; i++) {
      const k = 0.88 + r() * 0.2, x = i * bw - (j & 1 ? bw / 2 : 0);
      g.fillStyle = grey ? `rgb(${204 * k | 0},${200 * k | 0},${190 * k | 0})` : `rgb(${172 * k | 0},${82 * k | 0},${58 * k | 0})`;
      g.fillRect(x + 1.5, j * ch + 1.5, bw - 3, ch - 3);
    }
  }
});
// composite cassettes, 1.0 x 0.5 m with dark joints; one repeat = 2 x 2 m
const panelTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(70,74,80,0.55)';
  for (let k = 0; k <= 4; k++) g.fillRect(0, k * h / 4 - 1, w, 2);
  for (let k = 0; k <= 2; k++) g.fillRect(k * w / 2 - 1, 0, 2, h);
  g.fillStyle = 'rgba(0,0,0,0.04)'; g.fillRect(0, 0, w, h / 8);
});
// standing seam every 0.5 m along the slope; one repeat = 2.5 m
const seamTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  for (let k = 0; k < 5; k++) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(k * w / 5, 0, 3, h); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(k * w / 5 + 3, 0, 2, h); }
});
// the fence: v 0.5..1 one ornamental bay (spear-topped bars under a top rail that rises in an arch to mid-bay, a
// second rail along it, a mid rail, scrolls and a tall lily in the middle), v 0..0.5 plain bars
const fenceTex = () => canvasTex(512, 512, (g, w) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, w);
  g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  // ornamental (canvas rows 0..255; row 0 is the panel's top)
  const top = (x) => 64 - 50 * Math.sin(Math.PI * x / w);              // the arched top rail
  g.lineWidth = 7; g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, top(x)); g.stroke();
  g.lineWidth = 5; g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, top(x) + 26); g.stroke();
  g.fillRect(0, 238, w, 8); g.fillRect(0, 200, w, 5);
  for (let x = 6; x < w; x += 32) { const t = top(x + 2.5); g.fillRect(x, t - 4, 5, 246 - t); g.beginPath(); g.moveTo(x - 3, t - 2); g.lineTo(x + 2.5, t - 16); g.lineTo(x + 8, t - 2); g.fill(); }
  g.lineWidth = 5;
  const ring = (cx, cy, rr) => { g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.stroke(); };
  for (const sg of [-1, 1]) {
    const cx = w / 2 + sg * 110;
    ring(cx, 150, 34);
    // the lily's side petals curling out
    g.beginPath(); g.moveTo(w / 2, 196); g.quadraticCurveTo(w / 2 + sg * 60, 150, w / 2 + sg * 48, 92); g.stroke();
  }
  g.beginPath(); g.moveTo(w / 2, 40); g.quadraticCurveTo(w / 2 + 30, 110, w / 2, 196); g.quadraticCurveTo(w / 2 - 30, 110, w / 2, 40); g.stroke();
  // plain bars (rows 256..511)
  g.fillRect(0, 278, w, 6); g.fillRect(0, 488, w, 6);
  for (let x = 4; x < w; x += 24) g.fillRect(x, 262, 5, 250);
}, { srgb: false });
// the field's markings on its 43 x 55 m pitch (alpha: white = paint), 512 x 1024 over x / z
const linesTex = () => canvasTex(512, 1024, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const W = PITCH[2] - PITCH[0], L = PITCH[3] - PITCH[1], sx = w / W, sz = h / L, lw = 0.12 * sx;
  g.strokeStyle = '#d8d8d8'; g.lineWidth = Math.max(2, lw);
  const rect = (x0, z0, x1, z1) => g.strokeRect(x0 * sx, z0 * sz, (x1 - x0) * sx, (z1 - z0) * sz);
  rect(0.3, 0.3, W - 0.3, L - 0.3);
  g.beginPath(); g.moveTo(0, L / 2 * sz); g.lineTo(w, L / 2 * sz); g.stroke();
  g.beginPath(); g.ellipse(W / 2 * sx, L / 2 * sz, 5 * sx, 5 * sz, 0, 0, Math.PI * 2); g.stroke();
  for (const end of [0, 1]) {
    const z = (d) => (end ? L - 0.3 - d : 0.3 + d);
    const box = (hw, d) => { g.strokeRect((W / 2 - hw) * sx, Math.min(z(0), z(d)) * sz, 2 * hw * sx, d * sz); };
    box(10, 9); box(4.5, 3);
    g.beginPath(); g.ellipse(W / 2 * sx, z(7.5) * sz, 0.3 * sx, 0.3 * sz, 0, 0, 7); g.fillStyle = '#d8d8d8'; g.fill();
  }
}, { repeat: false, srgb: false });
const paverTex = (r) => canvasTex(512, 512, (g, w) => {
  g.fillStyle = '#6f6c68'; g.fillRect(0, 0, w, w);
  for (let j = 0; j < 16; j++) for (let i = -1; i < 8; i++) {
    const k = 0.88 + r() * 0.16, x = i * 64 + (j & 1) * 32, warm = r() < 0.2;
    g.fillStyle = warm ? `rgb(${176 * k | 0},${120 * k | 0},${104 * k | 0})` : `rgb(${168 * k | 0},${166 * k | 0},${160 * k | 0})`;
    g.fillRect(x + 2, j * 32 + 2, 60, 28);
  }
});
// the sign over the portico: «ЧЕРКАСЬКИЙ [тризуб] ДЕРЖАВНИЙ» in dark blue on white, «БІЗНЕС-КОЛЕДЖ» in white on a blue
// scroll with curled ends (the college's own sign, photographed 2025)
const signTex = () => canvasTex(1024, 256, (g, w, h) => {
  g.fillStyle = '#f4f5f6'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1d3f86'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'italic bold 50px "Arial Narrow", Arial, sans-serif';
  g.fillText('ЧЕРКАСЬКИЙ', w / 2 - 190, 66); g.fillText('ДЕРЖАВНИЙ', w / 2 + 190, 66);
  // the trident, in gold edged in blue
  g.save(); g.translate(w / 2, 58); g.fillStyle = '#e1b52c'; g.strokeStyle = '#1d3f86'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(-26, -40); g.lineTo(-18, 22); g.lineTo(-6, 34); g.lineTo(0, 46); g.lineTo(6, 34); g.lineTo(18, 22); g.lineTo(26, -40);
  g.lineTo(14, -6); g.lineTo(6, 14); g.lineTo(4, -48); g.lineTo(0, -54); g.lineTo(-4, -48); g.lineTo(-6, 14); g.lineTo(-14, -6); g.closePath(); g.fill(); g.stroke();
  g.restore();
  // the scroll
  g.fillStyle = '#1f4e9c';
  g.beginPath(); g.moveTo(120, 128); g.lineTo(w - 120, 128); g.quadraticCurveTo(w - 70, 175, w - 120, 236); g.lineTo(120, 236); g.quadraticCurveTo(70, 175, 120, 128); g.fill();
  g.fillStyle = '#163b78';
  for (const sg of [-1, 1]) { g.beginPath(); g.ellipse(w / 2 + sg * (w / 2 - 92), 214, 30, 20, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#ffffff'; g.font = 'bold 92px "Times New Roman", Georgia, serif';
  g.fillText('БІЗНЕС-КОЛЕДЖ', w / 2, 184);
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3; g.strokeRect(126, 136, w - 252, 92);
}, { repeat: false });

export function buildChdbk({ root, map, solids: S, zips: Z, heightAt }) {
  if (!map.buildings.some((b) => b.id === MAIN_ID)) return null;
  const t0 = performance.now(), r = rng(MAIN_ID % 65521), n0 = S.count;
  const B = { render: new MB(), sbrick: new MB(), brick: new MB(), panel: new MB(), det: new MB(), roof: new MB(), tile: new MB(), lit: new MB(),
    glow: new MB(), glass: new MB(), sign: new MB(), fence: new MB(), lines: new MB(), pave: new MB() };
  const Dt = B.det, xz = (p) => [p[0], p[2]];
  const u0 = (t) => (t * TW + 1) / (NT * TW), u1 = (t) => ((t + 1) * TW - 1) / (NT * TW);
  let nWin = 0, nLit = 0;
  const win = (f, t, s0, s1, y0, y1, p = 0.3, o = 0.04, sill = '#e9e9e6') => {
    const on = r() < p, M = on ? B.lit : B.tile; nWin++; nLit += on;
    M.setColor('#ffffff');
    quad(M, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), f.N, [[u0(t), 0], [u1(t), 0], [u1(t), 1], [u0(t), 1]]);
    if (sill) { Dt.setColor(sill); box(Dt, f, s0 - 0.06, s1 + 0.06, y0 - 0.06, y0, -0.02, 0.14, 'ftlr'); }
  };
  // a wall quad with uv: u = s / us, v from vf(y)
  const wallQ = (Mb, f, s0, s1, y0, y1, col, us, vf) => {
    Mb.setColor(col);
    quad(Mb, at(f, s0, y0), at(f, s1, y0), at(f, s1, y1), at(f, s0, y1), f.N, [[s0 / us, vf(y0)], [s1 / us, vf(y0)], [s1 / us, vf(y1)], [s0 / us, vf(y1)]]);
  };
  const rectFaces = ([x0, z0, x1, z1]) => ({
    xm: face([x0, z0], [x0, z1], -1, 0), xp: face([x1, z0], [x1, z1], 1, 0), zm: face([x0, z0], [x1, z0], 0, -1), zp: face([x0, z1], [x1, z1], 0, 1),
  });
  const bays = (L, pitch, m = 0) => { const n = Math.max(1, Math.round((L - 2 * m) / pitch)); return Array.from({ length: n }, (_, i) => m + (i + 0.5) * (L - 2 * m) / n); };

  // ---- levels: one floor for the main complex (its lot is flat to ~0.3 m), one for the dorm
  const corners = (q) => (q.length === 4 && typeof q[0] === 'number' ? R(...q) : q);
  const ground = (qs) => qs.flatMap((q) => corners(q).map(([x, z]) => heightAt(x, z)));
  const gm = ground([A, C, D, E, G, PORT]), yF = Math.max(...gm) + 0.45, gB = Math.min(...gm) - 0.5;
  const gd = ground([DORM, DPORCH]), yD = Math.max(...gd) + 0.4, gBd = Math.min(...gd) - 0.5;
  const eaveA = yF + 3 * FH + 0.5, eaveC = yF + 2 * FH + 0.5, topE = yF + 4 * FHE + 0.8, topG = yF + 4.1, topD = yF + 2 * FH + 0.3, topF = yF + 3.2;
  const roofD = yD + 5 * FHD + 0.6;
  // what hides a wall: the other blocks, by footprint and height span
  const blocks = [
    { id: 'A', poly: R(...A), y0: gB, y1: eaveA }, { id: 'C', poly: R(...C), y0: gB, y1: eaveC + 1.9 }, { id: 'D', poly: R(...D), y0: yF + FH - 0.2, y1: topD },
    { id: 'E', poly: R(...E), y0: gB, y1: topE }, { id: 'F', poly: R(...F), y0: gB, y1: topF }, { id: 'G', poly: G, y0: gB, y1: topG },
  ];
  const hidden = (self, f, s, y) => { const p = at(f, s, y, 0.6); return blocks.some((b) => b.id !== self && y > b.y0 && y < b.y1 && inPoly(b.poly, p[0], p[2])); };

  // ---- the blocks' walls, windows and plinths
  const vRender = (y) => y / 2.5, vBrick = (y) => y / 1.8;
  const vStripe = (y0, fh) => (y) => (y - y0) / fh;
  // kind: 'render' (red, pilasters), 'stripe' (корпус №2), 'brick' (the annex); win: per-face bay list or null
  const block = (id, faces, { kind, y0, y1, storeys, fh, tile, ww, sill = 0.9, wh, pitch = 3.6, skip = () => false, plinth = true, pilasters = kind === 'render' }) => {
    for (const f of faces) {
      if (plinth) { Dt.setColor(kind === 'render' ? PLINTH : '#7c4a3a'); box(Dt, f, -0.05, f.L + 0.05, gB, yF + 0.02, -0.1, 0.06, 'ft'); }
      if (kind === 'render') wallQ(B.render, f, 0, f.L, y0, y1, RED, 2.5, vRender);
      else if (kind === 'stripe') wallQ(B.sbrick, f, 0, f.L, y0, y1, BRICKC, 2.0, vStripe(y0, fh));
      else wallQ(B.brick, f, 0, f.L, y0, y1, BRICKC, 2.0, vBrick);
      // the corner pilasters of the rebuilt blocks: light-grey cassettes 1.2 m wide, wrapping each corner
      if (pilasters) {
        B.panel.setColor(PANEL);
        for (const [s0, s1, ends] of [[0, 1.2, 'ftl'], [f.L - 1.2, f.L, 'ftr']]) {
          const yc = (s0 + s1) / 2; if (hidden(id, f, yc, yF + 1)) continue;
          box(B.panel, f, s0 - 0.07, s1, yF - 0.05, y1 - 0.02, 0, 0.07, ends, [2, 2]);
        }
      }
      const margin = kind === 'render' ? 1.4 : 0.6, list = f.L < 4 ? [] : bays(f.L, pitch, margin);
      for (let k = 0; k < storeys; k++) for (const sc of list) {
        const ya = y0 + k * fh + sill, yb = ya + wh;
        if (hidden(id, f, sc, (ya + yb) / 2) || skip(f, k, sc)) continue;
        win(f, tile, sc - ww / 2, sc + ww / 2, ya, yb, k === 0 ? 0.3 : 0.38);
      }
    }
  };
  const fa = rectFaces(A), fc = rectFaces(C), fd = rectFaces(D), fe = rectFaces(E), ff = rectFaces(F), fdm = rectFaces(DORM);
  const PS0 = PORT[1] - A[1], PS1 = PORT[3] - A[1];                     // the portico along A's front (s), 4.2 .. 15.0
  // A: three storeys; its front's bays: one left of the portico, ten right of it; the portico does its own
  const frontBays = [2.7, ...Array.from({ length: 10 }, (_, i) => PS1 + 0.2 + (i + 0.5) * (fa.xm.L - 1.4 - PS1 - 0.2) / 10)];
  block('A', [fa.xm, fa.xp, fa.zm, fa.zp], { kind: 'render', y0: yF, y1: eaveA, storeys: 3, fh: FH, tile: T.WIN3, ww: 2.4, wh: 2.15, sill: 0.7,
    skip: (f, k, sc) => f === fa.xm || (f === fa.zp && k === 0 && Math.abs(sc - 8.55) < 1.6) });
  for (let k = 0; k < 3; k++) for (const sc of frontBays) win(fa.xm, T.WIN3, sc - 1.2, sc + 1.2, yF + k * FH + 0.7, yF + k * FH + 2.85, k ? 0.38 : 0.3);
  block('C', [fc.zm, fc.zp, fc.xp], { kind: 'render', y0: yF, y1: eaveC, storeys: 2, fh: FH, tile: T.WIN3, ww: 2.4, wh: 2.15, sill: 0.7 });
  block('D', [fd.xm, fd.xp], { kind: 'render', y0: yF + FH - 0.25, y1: topD, storeys: 1, fh: FH, tile: T.WIN3, ww: 1.6, wh: 1.5, pitch: 3.2, sill: 1.15, plinth: false, pilasters: false });
  block('E', [fe.xm, fe.xp, fe.zm, fe.zp], { kind: 'stripe', y0: yF, y1: topE, storeys: 4, fh: FHE, tile: T.WIN2, ww: 1.8, sill: BAND.sill * FHE, wh: (BAND.head - BAND.sill) * FHE });
  block('F', [ff.xp, ff.zm, ff.zp], { kind: 'brick', y0: yF, y1: topF, storeys: 0, fh: 3.2, tile: T.BWIN, ww: 1.6, wh: 1.6 });
  block('G', ringFaces(G), { kind: 'brick', y0: yF, y1: topG, storeys: 1, fh: 3.8, tile: T.BWIN, ww: 1.6, wh: 1.7, pitch: 3.2 });
  // D's underside (the yard drive passes under it) and its floor edge
  Dt.setColor('#bdb8b0'); Dt.box(D[0], yF + FH - 0.25, D[1], D[2], yF + FH, D[3], 1 | 2 | 8);
  // F: корпус №2's east porch, a glazed door under a flat canopy; A's side door at its south end
  win(ff.xp, T.DOOR, 2.0, 4.4, yF, yF + 2.6, 0.5, 0.04, null);
  Dt.setColor('#d9d9d6'); box(Dt, ff.xp, 0.6, ff.xp.L - 0.6, topF - 0.25, topF, -0.2, 1.2, 'ftlru');
  win(fa.zp, T.DOOR, 7.6, 9.5, yF, yF + 2.5, 0.5, 0.04, null);
  Dt.setColor(PANEL); box(Dt, fa.zp, 7.0, 10.1, yF + 2.75, yF + 2.95, 0, 1.4, 'ftlru');
  solid(S, fa.zp, 7.0, 10.1, 0, 1.4, yF + 2.75, yF + 2.95, 'awning', OVERHANG);

  // ---- roofs: A and C hipped in blue metal (C's ridge runs into A's wall), D flat, E flat behind a parapet, G low blue
  const hip = (x0, z0, x1, z1, y, rise, gableX0 = false) => {
    const alongX = x1 - x0 >= z1 - z0, h = (alongX ? z1 - z0 : x1 - x0) / 2, Y = y + rise;
    const r0 = alongX ? [gableX0 ? x0 : x0 + h, (z0 + z1) / 2] : [(x0 + x1) / 2, z0 + h], r1 = alongX ? [x1 - h, (z0 + z1) / 2] : [(x0 + x1) / 2, z1 - h];
    const P = [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], R0 = [r0[0], Y, r0[1]], R1 = [r1[0], Y, r1[1]];
    B.roof.setColor(BLUE);
    const fcs = alongX ? [[P[0], P[1], R1, R0], [P[2], P[3], R0, R1], [P[1], P[2], R1]] : [[P[1], P[2], R1, R0], [P[3], P[0], R0, R1], [P[0], P[1], R0], [P[2], P[3], R1]];
    if (alongX && !gableX0) fcs.push([P[3], P[0], R0]);
    for (const q of fcs) roofFace(B.roof, q);
  };
  const eaves = (faces, y, out, col = FASCIA) => { Dt.setColor(col); for (const f of faces) box(Dt, f, -out, f.L + out, y - 0.15, y, 0, out, 'fu'); };
  hip(A[0] - 0.35, A[1] - 0.35, A[2] + 0.35, A[3] + 0.35, eaveA, 2.1);
  eaves([fa.xm, fa.xp, fa.zm, fa.zp], eaveA, 0.35);
  // the safety rail along A's eaves: two thin rails on posts every ~2.5 m, just up the slope
  Dt.setColor('#c9ccd0');
  for (const f of [fa.xm, fa.xp, fa.zm, fa.zp]) {
    const y0 = eaveA + 0.06, P = (s, y) => at(f, s, y, 0.2), n = Math.ceil((f.L + 0.3) / 2.5);
    for (const h of [0.45, 0.85]) Dt.tube(P(-0.15, y0 + h), P(f.L + 0.15, y0 + h), 0.02, 4);
    for (let i = 0; i <= n; i++) { const s = -0.15 + i * (f.L + 0.3) / n; Dt.tube(P(s, y0), P(s, y0 + 0.88), 0.025, 4); }
  }
  hip(C[0], C[1] - 0.35, C[2] + 0.35, C[3] + 0.35, eaveC, 1.9, true);
  eaves([fc.zm, fc.zp, fc.xp], eaveC, 0.35);
  B.roof.setColor('#7a7c7f'); B.roof.fill(R(...D), [], topD, true);
  Dt.setColor('#d0cdc6'); for (const f of [fd.xm, fd.xp]) box(Dt, f, 0, f.L, topD - 0.3, topD + 0.05, -0.05, 0.12, 'ftu');
  B.roof.setColor(ROOFDARK); B.roof.fill(R(...E), [], topE - 0.5, true);
  Dt.setColor('#c4c0b8'); for (const f of [fe.xm, fe.xp, fe.zm, fe.zp]) { box(Dt, f, -0.12, f.L + 0.12, topE - 0.25, topE, -0.3, 0.12, 'ftu'); quad(Dt, at(f, 0, topE - 0.5, -0.3), at(f, f.L, topE - 0.5, -0.3), at(f, f.L, topE - 0.25, -0.3), at(f, 0, topE - 0.25, -0.3), f.N.map((v) => -v)); }
  { const hd = R(E[0] + 5, E[1] + 9, E[0] + 10, E[1] + 14); B.brick.setColor(BRICKC); B.brick.extrude(hd, [], topE - 0.5, topE + 2.2, { top: false }); B.roof.setColor(ROOFDARK); B.roof.fill(hd, [], topE + 2.2, true); S.prism(hd.flat(), topE - 0.5, topE + 2.2, 0, 0, 'wall'); }
  B.roof.setColor(BLUE); B.roof.fill(G, [], topG, true);
  eaves(ringFaces(G), topG, 0.3);
  B.roof.setColor(ROOFDARK); B.roof.fill(R(...F), [], topF, true);
  for (const f of [fa.xm, fa.xp, fa.zm, fa.zp]) { const a = at(f, 0, 0, 0.5), b = at(f, f.L, 0, 0.5); Z.edge(a[0], a[2], b[0], b[2], eaveA, f.nx, f.nz); }

  // ---- the portico on A's front (face xm: s = z - 2490.2, o out toward Чиковані)
  const fp = fa.xm, yS = yF + 7.2, yCr = yF + 8.5, yB = yF + 10.2, oF = PORT[2] - PORT[0];   // the arch's spring and crown, the sign beam's top; the depth (4.9)
  const PW = 0.9, piers = Array.from({ length: 4 }, (_, i) => PS0 + PW / 2 + i * (PS1 - PS0 - PW) / 3);   // four square piers in a row
  const sA0 = PS0 + PW, sA1 = PS1 - PW, archY = (s) => { const t = (s - (sA0 + sA1) / 2) / ((sA1 - sA0) / 2); return yS + (yCr - yS) * Math.sqrt(Math.max(0, 1 - t * t)); };
  const gP = Math.min(...[PS0, PS1].map((s) => heightAt(...xz(at(fp, s, 0, oF + 1.5))))) + 0.21;
  Dt.setColor('#a9a6a0'); box(Dt, fp, PS0, PS1, gP - 0.3, yF, 0, oF, 'ftlr');                 // the platform
  solid(S, fp, PS0, PS1, 0, oF, gP - 0.3, yF - 0.05);
  { // three steps down to the forecourt, on one sloped support
    const n = 3, rise = (yF - gP) / n, run = 0.4;
    Dt.setColor('#b3b0aa');
    for (let k = 1; k <= n; k++) box(Dt, fp, PS0 + 0.4, PS1 - 0.4, gP - 0.3, yF - k * rise, oF + (k - 1) * run, oF + k * run, 'ftlr');
    const k = (yF - gP) / (n * run), P = [[PS0 + 0.4, oF], [PS1 - 0.4, oF], [PS1 - 0.4, oF + n * run + 1], [PS0 + 0.4, oF + n * run + 1]].flatMap(([s, o]) => xz(at(fp, s, 0, o)));
    // the plane y = yF - k (o - oF), o measured along the outward normal (-x here)
    S.prism(P, gP - 0.4, yF + k * (oF + fp.ax * fp.nx + fp.az * fp.nz), -k * fp.nx, -k * fp.nz, 'steps');
  }
  // the piers: the inner two stop under the canopy (slim posts carry the arch over them), the outer two rise to the
  // arch's spring, where a horizontal wing slab steps out to each side; white blocks over the wings flank the arch
  piers.forEach((sc, i) => {
    const outer = i === 0 || i === 3, top = outer ? yS : yF + 3.6;
    B.panel.setColor(PANEL); box(B.panel, fp, sc - PW / 2, sc + PW / 2, yF, top, oF - PW, oF, 'fblr', [2, 2]);
    solid(S, fp, sc - PW / 2, sc + PW / 2, oF - PW, oF, yF - 0.3, top);
    if (!outer) { Dt.setColor('#d9dbdd'); box(Dt, fp, sc - 0.12, sc + 0.12, yF + 4.1, archY(sc), oF - PW / 2 - 0.12, oF - PW / 2 + 0.12, 'fblr'); }
  });
  B.panel.setColor(PANEL);
  for (const sg of [-1, 1]) {
    const [w0, w1] = sg < 0 ? [PS0 - 0.6, PS0 + PW + 0.5] : [PS1 - PW - 0.5, PS1 + 0.6], [h0, h1] = sg < 0 ? [PS0, PS0 + PW] : [PS1 - PW, PS1];
    box(B.panel, fp, w0, w1, yS, yS + 0.3, 0, oF + 0.3, 'ftlru', [2, 2]);
    box(B.panel, fp, h0, h1, yS + 0.3, yB, 0, oF, 'flrt', [2, 2]);
    solid(S, fp, w0, w1, 0, oF + 0.3, yS, yS + 0.3); solid(S, fp, h0, h1, 0, oF, yS + 0.3, yB);
  }
  box(B.panel, fp, PS0, PS1, yF + 3.6, yF + 4.1, 0, oF, 'ftlru', [2, 2]);            // the flat canopy over the doors
  solid(S, fp, PS0, PS1, 0, oF, yF + 3.6, yF + 4.1, 'awning', OVERHANG);
  { // the white arch at the front, the polycarbonate vault behind it on steel ribs
    const n = 12, ss = Array.from({ length: n + 1 }, (_, i) => sA0 + (sA1 - sA0) * i / n);
    B.panel.setColor(PANEL);
    for (let i = 0; i < n; i++) {
      const a = ss[i], b = ss[i + 1], ya = archY(a), yb = archY(b), P = (s, y, o) => at(fp, s, y, o);
      const uv = (y0a, y0b, y1a, y1b) => [[a / 2, y0a / 2], [b / 2, y0b / 2], [b / 2, y1b / 2], [a / 2, y1a / 2]];
      for (const o of [oF - 0.6, oF]) quad(B.panel, P(a, ya, o), P(b, yb, o), P(b, yCr + 0.25, o), P(a, yCr + 0.25, o), o === oF ? fp.N : fp.N.map((v) => -v), uv(ya, yb, yCr + 0.25, yCr + 0.25));
      quad(B.panel, P(a, ya, oF - 0.6), P(b, yb, oF - 0.6), P(b, yb, oF), P(a, ya, oF), [0, -1, 0], [[a / 2, 0], [b / 2, 0], [b / 2, 0.3], [a / 2, 0.3]]);
      B.glass.setColor('#cfe3ee');
      quad(B.glass, P(a, ya + 0.05, 0), P(b, yb + 0.05, 0), P(b, yb + 0.05, oF - 0.6), P(a, ya + 0.05, oF - 0.6), [0, 1, 0]);
    }
    Dt.setColor('#3a4a5c');
    for (const o of [0.6, 1.6, 2.6, 3.6]) for (let i = 0; i < n; i++) Dt.tube(at(fp, ss[i], archY(ss[i]), o), at(fp, ss[i + 1], archY(ss[i + 1]), o), 0.05, 4);
    // the sign beam between the white blocks, under a cornice slab that steps out past them
    B.panel.setColor(PANEL); box(B.panel, fp, PS0 + PW, PS1 - PW, yCr + 0.25, yB, oF - 0.9, oF, 'fu', [2, 2]);
    box(B.panel, fp, PS0 - 0.35, PS1 + 0.35, yB, yB + 0.3, 0, oF + 0.25, 'ftlru', [2, 2]);
    solid(S, fp, PS0, PS1, 0, oF, yCr + 0.25, yB + 0.3);
    B.sign.setColor('#ffffff'); label(B.sign, fp, PS0 + 0.35, PS1 - 0.35, yCr + 0.4, yB - 0.1, oF + 0.02, [0, 0, 1, 1]);
  }
  // the entrance: glazed doors between glazed side lights, the blue band over them; floor 2 and 3 windows behind the posts
  for (let i = 0; i < 4; i++) { const a = PS0 + 1.8 + i * (PS1 - PS0 - 3.6) / 4, b = a + (PS1 - PS0 - 3.6) / 4; win(fp, i === 1 || i === 2 ? T.DOOR : T.GLAZE, a + 0.05, b - 0.05, yF, yF + 3.0, 0.6, 0.04, null); }
  Dt.setColor('#1f4e9c'); box(Dt, fp, PS0 + 1.6, PS1 - 1.6, yF + 3.0, yF + 3.55, 0, 0.08, 'ftu');
  for (let k = 1; k < 3; k++) for (const sc of [PS0 + 2.6, PS1 - 2.6]) win(fp, T.WIN3, sc - 0.95, sc + 0.95, yF + k * FH + 0.8, yF + k * FH + 2.6, 0.4);
  for (const sc of [piers[1], piers[2]]) { B.glow.setColor('#fff3da'); const p = at(fp, sc, yF + 3.58, 2.4); B.glow.box(p[0] - 0.3, p[1] - 0.04, p[2] - 0.3, p[0] + 0.3, p[1], p[2] + 0.3, 8); }

  // ---- the dormitory: five storeys of banded brick, the porch on Чорновола, the grey stack over it
  const fdF = fdm.zm, sP0 = DPORCH[0] - DORM[0], sP1 = DPORCH[2] - DORM[0], sPc = (sP0 + sP1) / 2, ST0 = sPc - 2.3, ST1 = sPc + 2.3;
  const dSill = BAND.sill * FHD, dWh = (BAND.head - BAND.sill) * FHD;
  for (const f of [fdm.zm, fdm.zp, fdm.xm, fdm.xp]) {
    Dt.setColor('#7c4a3a'); box(Dt, f, -0.05, f.L + 0.05, gBd, yD + 0.02, -0.1, 0.06, 'ft');
    wallQ(B.sbrick, f, 0, f.L, yD, roofD, BRICKC, 2.0, vStripe(yD, FHD));
    const long = f.L > 30, list = long ? bays(f.L, 3.2) : [f.L / 2];
    for (let k = 0; k < 5; k++) for (const sc of list) {
      const ya = yD + k * FHD + dSill;
      if (f === fdF && sc > sP0 - 0.5 && sc < sP1 + 0.5 && (k === 0 || (sc > ST0 - 1 && sc < ST1 + 1))) continue;
      if (f === fdm.zp && k === 0 && Math.abs(sc - sPc) < 1.7) continue;
      win(f, T.WIN2, sc - (long ? 0.8 : 0.7), sc + (long ? 0.8 : 0.7), ya, ya + dWh, 0.5);
    }
    Dt.setColor(GREY); box(Dt, f, -0.1, f.L + 0.1, roofD - 0.35, roofD, -0.3, 0.1, 'ftu');
    quad(Dt, at(f, 0, roofD - 0.6, -0.3), at(f, f.L, roofD - 0.6, -0.3), at(f, f.L, roofD - 0.35, -0.3), at(f, 0, roofD - 0.35, -0.3), f.N.map((v) => -v));
    const a = at(f, 0, 0, 0), b = at(f, f.L, 0, 0); Z.edge(a[0], a[2], b[0], b[2], roofD, f.nx, f.nz);
  }
  B.roof.setColor(ROOFDARK); B.roof.fill(R(...DORM), [], roofD - 0.6, true);
  for (let i = 0; i < 5; i++) { const x = DORM[0] + 6 + i * 10.6, z = (DORM[1] + DORM[3]) / 2; Dt.setColor('#b5b0a6'); Dt.box(x - 0.5, roofD - 0.6, z - 0.5, x + 0.5, roofD + 0.6, z + 0.5, 63 - 8); }
  // the grey stack over the porch: cassettes from the first floor up, two windows a storey
  B.panel.setColor('#b7bcc2'); box(B.panel, fdF, ST0, ST1, yD + FHD - 0.1, roofD - 0.35, 0, 0.12, 'ftlr', [2, 2]);
  for (let k = 1; k < 5; k++) for (const sc of [sPc - 1.1, sPc + 1.1]) win(fdF, T.WIN2, sc - 0.8, sc + 0.8, yD + k * FHD + dSill, yD + k * FHD + dSill + dWh, 0.5, 0.16);
  { // the porch: a blue metal roof on five red brick piers, the door and three windows in the wall behind
    const dep = DORM[1] - DPORCH[1], yC = yD + 2.9, gq = Math.min(heightAt(DPORCH[0], DPORCH[1] - 1.5), heightAt(DPORCH[2], DPORCH[1] - 1.5)) + 0.21;
    Dt.setColor('#a9a6a0'); box(Dt, fdF, sP0, sP1, gq - 0.3, yD, 0, dep, 'ftlr'); solid(S, fdF, sP0, sP1, 0, dep, gq - 0.3, yD - 0.05);
    const nst = Math.max(1, Math.round((yD - gq) / 0.16)), run = 0.32;
    Dt.setColor('#b3b0aa'); for (let k = 1; k < nst; k++) box(Dt, fdF, sP0 + 2.4, sP1 - 2.4, gq - 0.3, yD - k * (yD - gq) / nst, dep + (k - 1) * run, dep + k * run, 'ftlr');
    if (nst > 1) { const k = (yD - gq) / ((nst - 1) * run), P = [[sP0 + 2.4, dep], [sP1 - 2.4, dep], [sP1 - 2.4, dep + nst * run + 1], [sP0 + 2.4, dep + nst * run + 1]].flatMap(([s, o]) => xz(at(fdF, s, 0, o)));
      S.prism(P, gq - 0.4, yD + k * (dep + fdF.ax * fdF.nx + fdF.az * fdF.nz), -k * fdF.nx, -k * fdF.nz, 'steps'); }
    B.brick.setColor(BRICKC);
    for (let i = 0; i <= 4; i++) { const sc = sP0 + 0.3 + i * (sP1 - sP0 - 0.6) / 4; box(B.brick, fdF, sc - 0.3, sc + 0.3, yD, yC, dep - 0.6, dep, 'fblr', [2, 1.8]); solid(S, fdF, sc - 0.3, sc + 0.3, dep - 0.6, dep, yD - 0.3, yC); }
    Dt.setColor('#d8d6d0'); box(Dt, fdF, sP0 - 0.3, sP1 + 0.3, yC, yC + 0.25, 0, dep + 0.35, 'ftlru');
    solid(S, fdF, sP0 - 0.3, sP1 + 0.3, 0, dep + 0.35, yC, yC + 0.25, 'awning', OVERHANG);
    // the hipped blue roof of the canopy, rising to the wall
    const P = (s, y, o) => at(fdF, s, y, o), yR = yC + 0.25, yT = yC + 1.0;
    B.roof.setColor('#2c5fb8');
    roofFace(B.roof, [P(sP0 - 0.3, yR, dep + 0.35), P(sP1 + 0.3, yR, dep + 0.35), P(sP1 - 0.6, yT, 0), P(sP0 + 0.6, yT, 0)]);
    roofFace(B.roof, [P(sP0 - 0.3, yR, dep + 0.35), P(sP0 + 0.6, yT, 0), P(sP0 - 0.3, yR, 0)]);
    roofFace(B.roof, [P(sP1 + 0.3, yR, dep + 0.35), P(sP1 + 0.3, yR, 0), P(sP1 - 0.6, yT, 0)]);
    win(fdF, T.BDOOR, sPc + 2.4, sPc + 4.0, yD, yD + 2.3, 0.4, 0.04, null);
    for (const sc of [sP0 + 1.6, sP0 + 4.2, sPc - 0.6]) win(fdF, T.WIN2, sc - 0.8, sc + 0.8, yD + dSill, yD + dSill + dWh, 0.5);
    B.glow.setColor('#fff2d6'); const lp = at(fdF, sPc, yC - 0.02, 1.2); B.glow.box(lp[0] - 0.25, lp[1] - 0.05, lp[2] - 0.25, lp[0] + 0.25, lp[1], lp[2] + 0.25, 8);
    // the yard door: a plain canopy
    win(fdm.zp, T.BDOOR, sPc - 0.9, sPc + 0.9, yD, yD + 2.3, 0.4, 0.04, null);
    Dt.setColor('#d8d6d0'); box(Dt, fdm.zp, sPc - 1.6, sPc + 1.6, yD + 2.5, yD + 2.7, 0, 1.4, 'ftlru');
    solid(S, fdm.zp, sPc - 1.6, sPc + 1.6, 0, 1.4, yD + 2.5, yD + 2.7, 'awning', OVERHANG);
  }

  // ---- collision for the blocks
  for (const [q, top] of [[A, eaveA + 0.9], [C, eaveC + 0.8], [E, topE], [F, topF]]) S.prism(R(...q).flat(), gB, top, 0, 0, 'wall');
  S.prism(R(...D).flat(), yF + FH - 0.25, topD, 0, 0, 'wall', OVERHANG);
  S.prism(G.flat(), gB, topG, 0, 0, 'wall');
  S.prism(R(...DORM).flat(), gBd, roofD - 0.6, 0, 0, 'wall');
  for (const f of [fdm.zm, fdm.zp, fdm.xm, fdm.xp]) solid(S, f, 0, f.L, -0.3, 0.1, roofD - 0.6, roofD);

  // ---- the forecourt: pavers from the fence to the portico, the drive and its parking (OSM 1198632831, 1200244833 / 4)
  const drape = (Mb, x0, z0, x1, z1, lift, rep) => {
    const ns = Math.max(1, Math.ceil((x1 - x0) / 2)), no = Math.max(1, Math.ceil((z1 - z0) / 2)), id = [];
    Mb.setColor('#ffffff');
    for (let j = 0; j <= no; j++) for (let i = 0; i <= ns; i++) {
      const x = x0 + (x1 - x0) * i / ns, z = z0 + (z1 - z0) * j / no;
      id.push(Mb.vert(x, heightAt(x, z) + lift, z, 0, 1, 0, rep ? x / rep : (x - x0) / (x1 - x0), rep ? z / rep : (z - z0) / (z1 - z0)));
    }
    for (let j = 0; j < no; j++) for (let i = 0; i < ns; i++) { const a = j * (ns + 1) + i; Mb.quad(a, a + ns + 1, a + ns + 2, a + 1); }
  };
  const FORE = [-3440.0, 2484.8, PORT[0], 2512.6];
  drape(B.pave, ...FORE, 0.21, 1.6);
  drape(B.pave, PORT[0], 2484.8, A[0], PORT[1], 0.21, 1.6); drape(B.pave, PORT[0], PORT[3], A[0], 2512.6, 0.21, 1.6);
  // parking bays painted on it (two lots of three)
  Dt.setColor('#f0eee6');
  for (const z0 of [2485.3, 2507.7]) for (let i = 0; i <= 3; i++) { const z = z0 + 0.05 + i * 1.45, x0 = -3440.0 + 0.3, x1 = -3434.8, g = heightAt((x0 + x1) / 2, z) + 0.225; Dt.box(x0, g, z - 0.05, x1, g + 0.01, z + 0.05, 4); }
  // the field's markings, draped
  drape(B.lines, ...PITCH, 0.2, 0);                                   // over the ground's cover layer (GY.COVER 0.165)

  // ---- fences: the street fence (brick piers, plinth, ornamental iron), the inner ones (iron on posts), plain bars at the back
  const gateAt = (f) => GATES.map(({ c, w }) => { const s = (c[0] - f.ax) * f.ux + (c[1] - f.az) * f.uz, o = (c[0] - f.ax) * f.nx + (c[1] - f.az) * f.nz; return Math.abs(o) < 0.8 && s > -w && s < f.L + w ? [s - w / 2, s + w / 2] : null; }).filter(Boolean);
  const panelQ = (f, s0, s1, ya, yb, yc, yd, vlo, vhi, u0f, u1f, col = IRON) => {
    B.fence.setColor(col);
    quad(B.fence, at(f, s0, ya, 0), at(f, s1, yb, 0), at(f, s1, yd, 0), at(f, s0, yc, 0), f.N, [[u0f, vlo], [u1f, vlo], [u1f, vhi], [u0f, vhi]]);
  };
  // the same plane seen from its back: s runs the other way, o flips (so a box's back gets its uv too)
  const flip = (f) => face([f.ax + f.ux * f.L, f.az + f.uz * f.L], [f.ax, f.az], -f.nx, -f.nz);
  const pier = (f, s, g, w = 0.52, h = 2.15) => {
    B.brick.setColor('#f0f0f0'); box(B.brick, f, s - w / 2, s + w / 2, g - 0.3, g + h, -w / 2, w / 2, 'flr', [2, 1.8]);
    box(B.brick, flip(f), f.L - s - w / 2, f.L - s + w / 2, g - 0.3, g + h, -w / 2, w / 2, 'f', [2, 1.8]);
    Dt.setColor(FASCIA); const c = at(f, s, g + h, 0), hw = w / 2 + 0.05;
    const P = [[c[0] - hw, c[1], c[2] - hw], [c[0] + hw, c[1], c[2] - hw], [c[0] + hw, c[1], c[2] + hw], [c[0] - hw, c[1], c[2] + hw]], top = [c[0], c[1] + 0.3, c[2]];
    for (let k = 0; k < 4; k++) roofFace(Dt, [P[k], P[(k + 1) % 4], top]);
    solid(S, f, s - w / 2, s + w / 2, -w / 2, w / 2, g - 0.3, g + h, 'wall');
  };
  let nPanels = 0;
  // kind: 'street' (piers + plinth), 'inner' (ornamental iron on posts), 'plain' (bars on posts)
  const fenceRun = (pts, kind) => {
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.2) continue;
      const f = face(a, b, (b[1] - a[1]) / L, -(b[0] - a[0]) / L), gaps = gateAt(f);
      const cuts = [0, f.L, ...gaps.flat().map((s) => Math.max(0, Math.min(f.L, s)))].sort((p, q) => p - q);
      for (let i = 1; i < cuts.length; i++) {
        const s0 = cuts[i - 1], s1 = cuts[i], mid = (s0 + s1) / 2;
        if (s1 - s0 < 0.1 || gaps.some(([g0, g1]) => mid > g0 && mid < g1)) continue;
        const pitch = kind === 'street' ? 3.0 : 2.5, n = Math.ceil((s1 - s0) / pitch);
        for (let j = 0; j < n; j++) {
          const sa = s0 + (s1 - s0) * j / n, sb = s0 + (s1 - s0) * (j + 1) / n, ga = heightAt(...xz(at(f, sa, 0, 0))) - 0.03, gb = heightAt(...xz(at(f, sb, 0, 0))) - 0.03;
          nPanels++;
          if (kind === 'street') {
            const gl = Math.min(ga, gb);
            B.brick.setColor('#f0f0f0'); box(B.brick, f, sa, sb, gl - 0.3, gl + 0.45, -0.19, 0.19, 'ft', [2, 1.8]);
            box(B.brick, flip(f), f.L - sb, f.L - sa, gl - 0.3, gl + 0.45, -0.19, 0.19, 'f', [2, 1.8]);
            Dt.setColor(FASCIA); box(Dt, f, sa, sb, gl + 0.45, gl + 0.5, -0.21, 0.21, 'fbt');
            panelQ(f, sa + 0.26, sb - 0.26, gl + 0.5, gl + 0.5, gl + 2.2, gl + 2.2, 0.5, 1, 0, 1);
            pier(f, sa, gl);
            if (j === n - 1) pier(f, sb, Math.min(gb, gl));
          } else {
            const top = kind === 'inner' ? 1.7 : 1.8, [vlo, vhi] = kind === 'inner' ? [0.5, 1] : [0, 0.5];
            panelQ(f, sa, sb, ga, gb, ga + top, gb + top, vlo, vhi, kind === 'inner' ? 0 : sa / 2.5, kind === 'inner' ? 1 : sb / 2.5, kind === 'inner' ? IRON : STEEL);
            Dt.setColor(kind === 'inner' ? IRON : STEEL); const p = at(f, sa, ga, 0); Dt.tube([p[0], ga - 0.1, p[2]], [p[0], ga + top + 0.08, p[2]], 0.045, 4);
            if (j === n - 1) { const q = at(f, sb, gb, 0); Dt.tube([q[0], gb - 0.1, q[2]], [q[0], gb + top + 0.08, q[2]], 0.045, 4); }
          }
        }
        // collision in chunks of up to ~10 m
        const nc = Math.ceil((s1 - s0) / 10);
        for (let j = 0; j < nc; j++) {
          const sa = s0 + (s1 - s0) * j / nc, sb = s0 + (s1 - s0) * (j + 1) / nc, g = Math.min(heightAt(...xz(at(f, sa, 0, 0))), heightAt(...xz(at(f, sb, 0, 0))));
          solid(S, f, sa, sb, -0.2, 0.2, g - 0.3, g + 2.0, 'fence');
        }
      }
    }
  };
  fenceRun(STREET_W, 'street'); fenceRun(STREET_N, 'street'); fenceRun(STREET_NE, 'street');
  for (const q of INNER) fenceRun(q, 'inner');
  fenceRun(BACK, 'plain'); for (const q of PLAIN) fenceRun(q, 'plain');
  // the gates: two ornamental leaves swung open into the grounds (a wicket on the back is a gap); brick gate piers on the street
  const gates = [];
  for (const { c, w } of GATES) {
    gates.push(c);
    if (w < 2) continue;                                                        // the back wicket is a gap
    const g = heightAt(...c) - 0.03, lw = w / 2 - 0.08, th = 1.2;               // leaves swung ~70 degrees into the grounds (+x)
    for (const sg of [-1, 1]) {
      const hx = c[0], hz = c[1] + sg * w / 2, ex = hx + Math.sin(th) * lw, ez = hz - sg * Math.cos(th) * lw;
      const lf = face([hx, hz], [ex, ez], (ez - hz) / lw, -(ex - hx) / lw);
      panelQ(lf, 0, lf.L, g + 0.1, g + 0.1, g + 1.95, g + 1.95, 0.5, 1, 0.2, 0.8);
      Dt.setColor(IRON); for (const s of [0, lf.L]) { const p = at(lf, s, 0, 0); Dt.tube([p[0], g + 0.05, p[2]], [p[0], g + 2.0, p[2]], 0.04, 4); }
      Dt.tube(at(lf, 0, g + 1.95, 0), at(lf, lf.L, g + 1.95, 0), 0.03, 4);
      solid(S, lf, 0, lf.L, -0.08, 0.08, g - 0.2, g + 2.0, 'fence');
    }
  }
  // black-and-white bollards along Чиковані's kerb by the main gate (photo)
  for (let z = 2478; z <= 2522; z += 2.4) {
    if (Math.abs(z - 2498.5) < 3.4 || Math.abs(z - 2471.2) < 3.4) continue;
    const x = -3444.0, g = heightAt(x, z) + 0.15;
    Dt.setColor('#1d1e20'); Dt.cyl(x, g, z, 0.07, 0.07, 0.9, 6, true);
    Dt.setColor('#f2f2f0'); Dt.cyl(x, g + 0.55, z, 0.075, 0.075, 0.18, 6, false);
    S.cyl(x, z, g - 0.2, g + 0.9, 0.08, 0.08, 'pole');
  }

  // ---- the field: goals at both ends, a pull-up bar; spruces by the portico
  const goal = (z, dir) => {
    const x = (PITCH[0] + PITCH[2]) / 2, g = heightAt(x, z) + 0.02, hw = 3.66, d = 1.6;
    Dt.setColor('#f4f4f2');
    for (const s of [-hw, hw]) { Dt.tube([x + s, g, z], [x + s, g + 2.44, z], 0.06, 6); Dt.tube([x + s, g + 2.44, z], [x + s, g, z + dir * d], 0.03, 4); S.cyl(x + s, z, g - 0.2, g + 2.44, 0.07, 0.07, 'pole'); }
    Dt.tube([x - hw, g + 2.44, z], [x + hw, g + 2.44, z], 0.06, 6);
    Dt.setColor('#9a9c9e'); Dt.tube([x - hw, g, z + dir * d], [x + hw, g, z + dir * d], 0.03, 4);
  };
  goal(PITCH[1] + 0.3, -1); goal(PITCH[3] - 0.3, 1);
  // the small pitch: two small goals at its ends (along x)
  for (const [x, dir] of [[MINI[0] + 0.5, -1], [MINI[2] - 0.5, 1]]) {
    const z = (MINI[1] + MINI[3]) / 2, g = heightAt(x, z) + 0.02;
    Dt.setColor('#f4f4f2');
    for (const s of [-1.5, 1.5]) { Dt.tube([x, g, z + s], [x, g + 2, z + s], 0.05, 6); Dt.tube([x, g + 2, z + s], [x + dir * 1.0, g, z + s], 0.03, 4); S.cyl(x, z + s, g - 0.2, g + 2, 0.06, 0.06, 'pole'); }
    Dt.tube([x, g + 2, z - 1.5], [x, g + 2, z + 1.5], 0.05, 6);
  }
  // the basketball court: a hoop at each end on a post with its board
  for (const [z, dir] of [[COURT[1] + 1.0, 1], [COURT[3] - 1.0, -1]]) {
    const x = (COURT[0] + COURT[2]) / 2, g = heightAt(x, z);
    Dt.setColor('#2f5f9e'); Dt.tube([x, g - 0.1, z], [x, g + 3.0, z], 0.07, 6); Dt.tube([x, g + 3.0, z], [x, g + 3.2, z + dir * 1.0], 0.06, 6);
    Dt.setColor('#f2f2ee'); Dt.box(x - 0.9, g + 2.85, z + dir * 1.0 - 0.03, x + 0.9, g + 3.9, z + dir * 1.0 + 0.03);
    Dt.setColor('#d9572b'); Dt.tube([x - 0.23, g + 3.05, z + dir * 1.3], [x + 0.23, g + 3.05, z + dir * 1.3], 0.02, 4); Dt.tube([x, g + 3.05, z + dir * 1.07], [x, g + 3.05, z + dir * 1.53], 0.02, 4);
    S.cyl(x, z, g - 0.2, g + 3.0, 0.09, 0.09, 'pole');
  }
  { const [x, z] = BARS, g = heightAt(x, z);
    Dt.setColor('#3d4a5a');
    for (const dz of [-1.2, 1.2]) { Dt.tube([x, g - 0.1, z + dz], [x, g + 2.6, z + dz], 0.05, 6); S.cyl(x, z + dz, g - 0.2, g + 2.6, 0.06, 0.06, 'pole'); }
    Dt.setColor('#b8bcc0'); Dt.tube([x, g + 2.5, z - 1.2], [x, g + 2.5, z + 1.2], 0.025, 5);
    Dt.setColor('#3d4a5a'); for (const dx of [-0.3, 0.3]) for (const dz of [2.6, 4.4]) Dt.tube([x + dx, g - 0.1, z + dz], [x + dx, g + 1.3, z + dz], 0.04, 5);
    Dt.setColor('#b8bcc0'); for (const dx of [-0.3, 0.3]) Dt.tube([x + dx, g + 1.3, z + 2.5], [x + dx, g + 1.3, z + 4.5], 0.025, 5);
  }
  const spruce = (x, z, h) => { const g = heightAt(x, z); Dt.setColor('#26402a'); Dt.cyl(x, g, z, h * 0.22, 0.05, h, 8, false); Dt.setColor('#30502f'); Dt.cyl(x, g + h * 0.3, z, h * 0.18, 0.08, h * 0.6, 8, false); S.cyl(x, z, g, g + 2, 0.25, 0.25, 'tree'); };
  spruce(-3436.6, 2478.0, 9); spruce(-3436.2, 2519.5, 8); spruce(-3435.8, 2532.0, 10); spruce(-3433.5, 2466.0, 7.5);
  // two yard lamps on the drive between the blocks
  for (const [x, z] of [[-3400, 2474], [-3369.5, 2505]]) {
    const g = heightAt(x, z);
    Dt.setColor('#5d6064'); Dt.cyl(x, g, z, 0.09, 0.06, 5.4, 6, false);
    Dt.setColor('#3d3f42'); Dt.box(x - 0.25, g + 5.35, z - 0.25, x + 0.25, g + 5.5, z + 0.25, 63 - 8);
    B.glow.setColor('#fff2d6'); B.glow.box(x - 0.2, g + 5.32, z - 0.2, x + 0.2, g + 5.35, z + 0.2, 8);
    S.cyl(x, z, g - 0.3, g + 5.4, 0.12, 0.12, 'pole');
  }

  // ---- materials and meshes
  const at4 = atlas(false), mask = atlas(true), sgn = signTex(), stripe = stripeTex(r);
  const M = {
    render: new THREE.MeshStandardMaterial({ map: speckle(r, '#f6f3ee'), vertexColors: true, roughness: 0.88 }),
    sbrick: new THREE.MeshStandardMaterial({ map: stripe, vertexColors: true, roughness: 0.9 }),
    brick: new THREE.MeshStandardMaterial({ map: brickTex(r, { base: [184, 86, 56], mortar: [196, 180, 162], spread: 0.18 }), vertexColors: true, roughness: 0.9 }),
    panel: new THREE.MeshStandardMaterial({ map: panelTex(), vertexColors: true, roughness: 0.45, metalness: 0.15 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    roof: new THREE.MeshStandardMaterial({ map: seamTex(), vertexColors: true, roughness: 0.5, metalness: 0.3 }),
    tile: new THREE.MeshStandardMaterial({ map: at4, vertexColors: true, roughness: 0.35, metalness: 0.1 }),
    lit: new THREE.MeshStandardMaterial({ map: at4, vertexColors: true, roughness: 0.35, metalness: 0.1, emissive: 0xffd49a, emissiveMap: mask, emissiveIntensity: 0 }),
    glow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0xfff0d0, emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
    sign: new THREE.MeshStandardMaterial({ map: sgn, vertexColors: true, roughness: 0.5, emissive: 0xffffff, emissiveMap: sgn, emissiveIntensity: 0 }),
    fence: new THREE.MeshStandardMaterial({ vertexColors: true, alphaMap: fenceTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 }),
    lines: decal(new THREE.MeshStandardMaterial({ color: 0xeeeeea, alphaMap: linesTex(), transparent: true, depthWrite: false, roughness: 0.9 }), 1),
    pave: decal(new THREE.MeshStandardMaterial({ map: paverTex(r), vertexColors: true, roughness: 0.85 }), 2),
  };
  M.det.side = THREE.DoubleSide;
  const out = finish(root, 'chdbk', B, M, { shade: ['render', 'sbrick', 'brick', 'panel', 'det', 'roof', 'tile', 'lit'] });
  console.log(`[cherkasy] ChDBK: ${nWin} windows (${nLit} lit), ${nPanels} fence bays, ${(out.verts / 1000).toFixed(1)}k verts, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const footprints = [
    ...[A, C, E].map((q, i) => ({ poly: R(...q), h: [eaveA + 2.1, eaveC + 1.9, topE][i] - gB, kind: 'public', name: 'ЧДБК' })),
    { poly: G.map((p) => [p[0], p[1]]), h: topG - gB, kind: 'public', name: 'ЧДБК' },
    { poly: R(...DORM), h: roofD - gBd, kind: 'apt', name: 'Гуртожиток ЧДБК' },
  ];
  // no generated trees on the blocks (+2 m), the forecourt, the field (+2 m) or the drive under the bridge
  const keep = [[A, 2], [C, 2], [E, 2], [D, 2], [F, 1.5], [DORM, 2], [DPORCH, 2.5], [PORT, 3], [[-3440.5, 2484.5, A[0], 2513], 0], [PITCH, 2], [MINI, 1.5], [COURT, 1.5], [[-3415, 2531.5, -3399, 2552.5], 1]];
  return {
    footprints,
    info: { floor: yF, eave: eaveA, dorm: { floor: yD, roof: roofD }, gates, bridge: { y0: yF + FH - 0.25, y1: topD } },
    clear: (x, z) => keep.some(([q, m]) => x > q[0] - m && x < q[2] + m && z > q[1] - m && z < q[3] + m),
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.5 * k; M.glow.emissiveIntensity = 1.6 * k; M.sign.emissiveIntensity = 0.35 * k; },
  };
}
