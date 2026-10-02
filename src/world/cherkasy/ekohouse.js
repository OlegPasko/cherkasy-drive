// OWNER: cherkasy. КМ «Екохаус», вул. Гетьмана Сагайдачного at Симиренківська (Придніпровський): a gated town of
// two-storey townhouses on a ~0.7 ha lot, built (2026) after the lun.ua catalogue's photos and the developer's renders
// (lun.ua/new/cherkasy/ekohouse-cottages, dom.ria.com/uk/novostroyka-km-ekokhaus-10277). Every bay stands under its own
// steep gable, the gables facing the paved court in a sawtooth row. On the court side a deep white "house-shaped" frame
// (the party-wall fins and the roof's edge) holds a balcony on a white slab with a steel cable rail (geraniums on some);
// behind it the upper wall is white with a larch panel between two French windows and trapezoid gable glazing; below,
// the dark door, windows and larch on white render. The garden side is white with a larch band, two gable windows and
// full-width ground-floor glazing; timber screens and pergolas in the gardens. Dark-grey metal-tile roofs. Two types:
// the 70 m² bay (4.4 m) and the 90 m² one (5.9 m, the door in a larch panel between two windows). The lot follows the
// OSM fence (2025): the first two rows (OSM ways 1441670084 / 85: 12 narrow bays, 9 wide ones) face a 16.6 m court that
// opens on Сагайдачного through a gate by the car park; the north-west strip holds two rows of six round a second court
// with its own gate on вул. Ігоря Турчина (their foundations show on 2024 imagery; their bays are a guess). No names,
// no developer signage. Windows and wall lamps light up at night.
//   EKOHOUSE_SKIP: the OSM ids replaced here (buildings.js skips them)
//   EKO_LOT: the lot ring (the OSM fence, map x / z); EKO_ROWS: [{ x0, z, n, w, wide?, dir }] the rows (dir +1: the front
//     at z faces -z, north-west, and the row runs +z; dir -1 the other way round; w the bay); ekoRowRing(row) -> footprint
//   levelEkohouse(hf) -> level: the lot levelled (one floor for the whole town; the street sides blend back in 8 m)
//   buildEkohouse({ root, solids, zips, heightAt }) -> { update(dt), clear(x, z), spots, footprints, parked }
// A bay is modelled in a local frame (x across the bay 0..W, y up from the floor, z from the front 0 to the back D) and
// laid into shared builders under its row transform; the lot (paving, lawns, fences, garden screens, pergolas, car park)
// joins them in the map frame: ten merged meshes in all.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex, decal as decalMat } from './sculpt.js';
import { rng, inPoly } from './geo.js';
import { quad, renderTex } from './bldkit.js';

export const EKOHOUSE_SKIP = new Set([1441670084, 1441670085]);
const NAME = 'КМ «Екохаус»';
export const EKO_LOT = [[-1464.3, 4183.9], [-1465.5, 4291.8], [-1381, 4291.9], [-1380, 4240.5], [-1384.8, 4236.1], [-1397.5, 4235.8],
  [-1432, 4235.1], [-1432.4, 4218.3], [-1433.2, 4184.3]];
// the bays: the 70 m² type (12 to the 53 m OSM row, counted on its roofs) and the 90 m² type (9 to the row across the
// court: the 6 m pitch of its foundation pits on 2024 imagery, the wide bay of the frontal photo); the depth
const NARROW = 53.0 / 12, WIDE = 53.0 / 9, D = 11.3;
export const EKO_ROWS = [
  { x0: -1456.6, z: 4273.7, n: 12, w: NARROW, dir: 1 },        // the first row, its gardens toward Симиренківська
  { x0: -1456.0, z: 4257.1, n: 9, w: WIDE, wide: true, dir: -1 }, // across the court
  { x0: -1461.0, z: 4222.5, n: 6, w: NARROW, dir: 1 },         // the north-west court
  { x0: -1461.0, z: 4206.0, n: 6, w: NARROW, dir: -1 },
];
export const ekoRowRing = (q) => { const z1 = q.z + q.dir * D, x1 = q.x0 + q.n * q.w; return [[q.x0, q.z], [x1, q.z], [x1, z1], [q.x0, z1]]; };
const GATES = [{ x: -1380.5, z0: 4261, z1: 4270 }, { x: -1464.6, z0: 4209, z1: 4219 }]; // Сагайдачного (cars), Турчина

// the unit's section: floor 0, the balcony slab S0..S1, the eaves and the ridge of the outer roof line, the frame's depth
const FIN = 0.22, S0 = 2.75, S1 = 3.02, EAVE = 5.95, RISE = 1.65, RIDGE = EAVE + RISE, T = 0.32, BAL = 1.3, GREC = 0.35, BASE = -0.7, OVR = 0.35;
const WHITE = '#f1f0ec', SOFFIT = '#e4e3df', FRAME = '#2c3034', DOOR = '#30353a', STEEL = '#c3c8cc', SLAB = '#cfcdc8', PLINTH = '#76797b';

export function levelEkohouse(hf) { return hf.pad(EKO_LOT, 8); }

// ------------------------------------------------------------------------------------------------ textures
// larch boards 0.125 m, warm orange with grain and dark joints (1 m per repeat)
const larchTex = () => canvasTex(256, 256, (g, w, h) => {
  const r = rng(41), n = 8, bh = h / n;
  for (let i = 0; i < n; i++) {
    const k = 0.88 + r() * 0.2;
    g.fillStyle = `rgb(${[226, 134, 48].map((c) => Math.min(255, Math.round(c * k))).join(',')})`; g.fillRect(0, i * bh, w, bh);
    for (let j = 0; j < 9; j++) { g.fillStyle = `rgba(110,55,15,${0.06 + r() * 0.1})`; g.fillRect(0, i * bh + r() * bh, w, 1 + r() * 1.5); }
    g.fillStyle = 'rgba(60,28,6,0.55)'; g.fillRect(0, (i + 1) * bh - 3, w, 3);
  }
});
// dark-grey metal tile: steps every 0.35 m down the slope, a wave every 0.18 m across (1 m per repeat)
const roofTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#4a4e53'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += w / 5.5) { const gr = g.createLinearGradient(x, 0, x + w / 5.5, 0); gr.addColorStop(0, 'rgba(255,255,255,0.08)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.18)'); g.fillStyle = gr; g.fillRect(x, 0, w / 5.5, h); }
  for (let y = 0; y < h; y += h / 2.86) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, y, w, 3); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, y + 3, w, 2); }
});
// a glass pane per uv unit: a thin dark mullion round glass that holds the sky at the top and pale curtains below;
// the glow mask lights the glass only
const paneTex = (glow) => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = glow ? '#000' : '#2c3034'; g.fillRect(0, 0, w, h);
  if (glow) { g.fillStyle = '#fff'; g.fillRect(3, 3, w - 6, h - 6); return; }
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#a9b1b5'); gr.addColorStop(0.45, '#788287'); gr.addColorStop(1, '#575e62');
  g.fillStyle = gr; g.fillRect(3, 3, w - 6, h - 6);
  for (let x = 6; x < w - 6; x += 7) { g.fillStyle = 'rgba(235,232,225,0.22)'; g.fillRect(x, 8, 3, h - 12); }
});
// grey concrete pavers in three tones with a few white ones, 10 x 20 a repeat (laid at 2.6 m: 0.26 x 0.13 m blocks)
const paverTex = () => canvasTex(256, 256, (g, w, h) => {
  const r = rng(9), cw = w / 10, ch = h / 20;
  g.fillStyle = '#7c7c7a'; g.fillRect(0, 0, w, h);
  for (let j = 0; j < 20; j++) for (let i = -1; i < 10; i++) {
    const t = r(), k = t < 0.08 ? 226 : t < 0.25 ? 172 : 196 + Math.round(r() * 14);
    g.fillStyle = `rgb(${k},${k},${k - 3})`; g.fillRect(i * cw + (j % 2) * cw / 2 + 1, j * ch + 1, cw - 2, ch - 2);
  }
});
const grassTex = () => canvasTex(128, 128, (g, w, h) => {
  const r = rng(3);
  g.fillStyle = '#6f9a48'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) { const k = r(); g.fillStyle = k < 0.5 ? 'rgba(40,80,20,0.25)' : 'rgba(170,200,110,0.22)'; g.fillRect(r() * w, r() * h, 1, 2 + r() * 2); }
});

// ------------------------------------------------------------------------------------------------ the unit
// one bay of width W into the builders U (under their current transform): the narrow type has a window, larch strips
// and the door off-centre below; the wide one the door in a larch panel between two windows. r: the site's random
function emitUnit(U, W, wide, r) {
  const { wall: Wl, wood: Wd, roof: Rf, det: Dt } = U;
  const yo = (x) => EAVE + RISE * (1 - Math.abs(x - W / 2) / (W / 2)); // the roof's top line across the bay
  const yi = (x) => yo(x) - T;                                           // its underside (the frame's inner edge)
  const G = (p) => (r() < p ? U.lit : U.glass);                          // a window's glass, lit at night or not
  const f = (B, col, pts, n) => { B.setColor(col); B.face(pts, n); };
  const box = (B, col, x0, y0, z0, x1, y1, z1, m = 63) => { B.setColor(col); B.box(x0, y0, z0, x1, y1, z1, m); };
  // a glass pane (uv: cols x rows panes) on a z plane facing nz
  const pane = (G, pts, nz, cols, rows) => { G.setColor('#ffffff'); quad(G, ...pts, [0, 0, nz], [[0, 0], [cols, 0], [cols, rows], [0, rows]]); };
  const xi0 = FIN, xi1 = W - FIN, mid = W / 2;

  // party walls (seen only at the row ends) and the fins' fronts; the roof's front edge band and its underside
  f(Wl, WHITE, [[0, BASE, D], [0, BASE, 0], [0, EAVE, 0], [0, EAVE, D]], [-1, 0, 0]);
  f(Wl, WHITE, [[W, BASE, 0], [W, BASE, D], [W, EAVE, D], [W, EAVE, 0]], [1, 0, 0]);
  f(Wl, WHITE, [[0, BASE, 0], [xi0, BASE, 0], [xi0, yi(xi0), 0], [0, yi(0), 0]], [0, 0, -1]);
  f(Wl, WHITE, [[xi1, BASE, 0], [W, BASE, 0], [W, yi(W), 0], [xi1, yi(xi1), 0]], [0, 0, -1]);
  for (const [a, b] of [[0, mid], [mid, W]]) {
    f(Wl, WHITE, [[a, yi(a), 0], [b, yi(b), 0], [b, yo(b), 0], [a, yo(a), 0]], [0, 0, -1]);
    f(Wl, WHITE, [[a, yi(a), D + OVR], [b, yi(b), D + OVR], [b, yo(b), D + OVR], [a, yo(a), D + OVR]], [0, 0, 1]);
  }
  const sl = Math.hypot(mid, RISE), dn = [[RISE / sl, -mid / sl], [-RISE / sl, -mid / sl]]; // the soffits' downward normals
  [[xi0, mid], [mid, xi1]].forEach(([a, b], k) => f(Wl, SOFFIT, [[a, yi(a), 0], [b, yi(b), 0], [b, yi(b), BAL], [a, yi(a), BAL]], [dn[k][0], dn[k][1], 0]));
  [[0, mid], [mid, W]].forEach(([a, b], k) => f(Wl, SOFFIT, [[a, yi(a), D], [b, yi(b), D], [b, yi(b), D + OVR], [a, yi(a), D + OVR]], [dn[k][0], dn[k][1], 0]));
  // the fins' inner faces round the porch (ground) and the balcony (upper)
  for (const [x, nx] of [[xi0, 1], [xi1, -1]]) {
    f(Wl, WHITE, [[x, 0, 0], [x, 0, GREC], [x, S0, GREC], [x, S0, 0]], [nx, 0, 0]);
    f(Wl, WHITE, [[x, S1, 0], [x, S1, BAL], [x, yi(x), BAL], [x, yi(x), 0]], [nx, 0, 0]);
  }
  // the balcony slab: white edge and underside, a grey deck; the porch floor and its step
  f(Wl, WHITE, [[xi0, S0, 0], [xi1, S0, 0], [xi1, S1, 0], [xi0, S1, 0]], [0, 0, -1]);
  f(Wl, WHITE, [[xi0, S0, 0], [xi1, S0, 0], [xi1, S0, GREC], [xi0, S0, GREC]], [0, -1, 0]);
  f(Dt, SLAB, [[xi0, S1, 0], [xi1, S1, 0], [xi1, S1, BAL], [xi0, S1, BAL]], [0, 1, 0]);
  f(Dt, SLAB, [[xi0, 0, 0], [xi1, 0, 0], [xi1, 0, GREC], [xi0, 0, GREC]], [0, 1, 0]);
  f(Dt, SLAB, [[xi0, -0.2, 0], [xi1, -0.2, 0], [xi1, 0, 0], [xi0, 0, 0]], [0, 0, -1]);
  f(Dt, PLINTH, [[0, BASE, -0.01], [W, BASE, -0.01], [W, -0.2, -0.01], [0, -0.2, -0.01]], [0, 0, -1]);

  // ground floor front (z = GREC): white render, larch, the windows, the door with its steel pull (in inner metres)
  const zg = GREC, wi = xi1 - xi0;
  const L = wide ? { larch: [[1.62, 3.83]], wins: [[0.3, 1.45], [wi - 1.45, wi - 0.3]], door: [2.25, 3.2], lamp: 1.9 }
    : { larch: [[0, 0.42], [1.5, 1.98], [3.42, wi]], wins: [[0.5, 1.42]], door: [2.18, 3.15], lamp: 1.75 };
  f(Wl, WHITE, [[xi0, 0, zg], [xi1, 0, zg], [xi1, S0, zg], [xi0, S0, zg]], [0, 0, -1]);
  for (const [a, b] of L.larch) f(Wd, '#ffffff', [[xi0 + a, 0, zg - 0.02], [xi0 + b, 0, zg - 0.02], [xi0 + b, S0, zg - 0.02], [xi0 + a, S0, zg - 0.02]], [0, 0, -1]);
  for (const [a0, b0] of L.wins) {
    const a = xi0 + a0, b = xi0 + b0;
    f(Dt, FRAME, [[a, 0.06, zg - 0.03], [b, 0.06, zg - 0.03], [b, 2.5, zg - 0.03], [a, 2.5, zg - 0.03]], [0, 0, -1]);
    pane(G(0.45), [[a + 0.06, 0.12, zg - 0.05], [b - 0.06, 0.12, zg - 0.05], [b - 0.06, 2.44, zg - 0.05], [a + 0.06, 2.44, zg - 0.05]], -1, 2, 2);
  }
  { const a = xi0 + L.door[0], b = xi0 + L.door[1];
    f(Dt, DOOR, [[a, 0, zg - 0.03], [b, 0, zg - 0.03], [b, 2.3, zg - 0.03], [a, 2.3, zg - 0.03]], [0, 0, -1]);
    box(Dt, STEEL, a + 0.12, 0.6, zg - 0.1, a + 0.16, 1.7, zg - 0.04, 1 | 2 | 32); }

  // upper floor (z = BAL): the larch gable wall, two French windows with trapezoid gable glazing over a transom
  const zu = BAL;
  f(Wl, WHITE, [[xi0, S1, zu], [xi1, S1, zu], [xi1, yi(xi1), zu], [mid, yi(mid), zu], [xi0, yi(xi0), zu]], [0, 0, -1]);
  const uw = wide ? [0.55, 1.75] : [0.3, 1.25]; // the French windows' span in from each fin
  { const a = xi0 + uw[1], b = xi1 - uw[1]; f(Wd, '#ffffff', [[a, S1, zu - 0.02], [b, S1, zu - 0.02], [b, yi(b), zu - 0.02], [mid, yi(mid), zu - 0.02], [a, yi(a), zu - 0.02]], [0, 0, -1]); }
  const yt = (x) => yi(x) - 0.14;
  for (const [a, b] of [[xi0 + uw[0], xi0 + uw[1]], [xi1 - uw[1], xi1 - uw[0]]]) {
    const Gw = G(0.3);
    f(Dt, FRAME, [[a, S1, zu - 0.03], [b, S1, zu - 0.03], [b, yt(b), zu - 0.03], [a, yt(a), zu - 0.03]], [0, 0, -1]);
    const a2 = a + 0.06, b2 = b - 0.06, tr = S1 + 2.3;
    pane(Gw, [[a2, S1 + 0.04, zu - 0.05], [b2, S1 + 0.04, zu - 0.05], [b2, tr, zu - 0.05], [a2, tr, zu - 0.05]], -1, 1, 2);
    pane(Gw, [[a2, tr + 0.09, zu - 0.05], [b2, tr + 0.09, zu - 0.05], [b2, yt(b2) - 0.06, zu - 0.05], [a2, yt(a2) - 0.06, zu - 0.05]], -1, 1, 1);
  }
  box(U.lamp, '#ffffff', mid - 0.05, S1 + 1.95, zu - 0.1, mid + 0.05, S1 + 2.25, zu - 0.01, 1 | 2 | 4 | 32); // the wall lamp
  box(U.lamp, '#ffffff', xi0 + L.lamp - 0.05, 1.95, zg - 0.1, xi0 + L.lamp + 0.05, 2.25, zg - 0.03, 1 | 2 | 4 | 32);
  // the balcony rail: posts, four steel cables, a handrail
  const ry = S1, rz0 = 0.05, rz1 = 0.1;
  const np = Math.max(2, Math.round((xi1 - xi0) / 0.95));
  for (let i = 0; i <= np; i++) { const x = xi0 + 0.08 + (xi1 - xi0 - 0.16) * i / np; box(Dt, STEEL, x - 0.02, ry, rz0, x + 0.02, ry + 1.0, rz1, 1 | 2 | 32); }
  for (const h of [0.17, 0.33, 0.49, 0.65, 0.81]) box(Dt, STEEL, xi0, ry + h, rz0 + 0.015, xi1, ry + h + 0.014, rz1 - 0.015, 4 | 32);
  box(Dt, STEEL, xi0, ry + 0.985, rz0, xi1, ry + 1.02, rz1, 4 | 8 | 32); // the steel handrail (the renders had timber)
  if (r() < 0.22) { // red geraniums in boxes on the rail, ivy trailing from some (the summer photos)
    const nb = Math.round(wi / 1.05);
    for (let i = 0; i < nb; i++) {
      const x = xi0 + 0.15 + (wi - 0.3) * (i + 0.5) / nb;
      box(Dt, '#5b5d5f', x - 0.3, ry + 1.03, rz0 - 0.08, x + 0.3, ry + 1.18, rz1 + 0.08, 1 | 2 | 4 | 32);
      box(Dt, i % 2 ? '#c4232b' : '#d83a3a', x - 0.28, ry + 1.18, rz0 - 0.06, x + 0.28, ry + 1.32, rz1 + 0.06, 1 | 2 | 4 | 32);
      if (i % 2 === 0 && r() < 0.7) box(Dt, '#4f7d33', x - 0.09, ry + 0.1 + r() * 0.3, rz0 - 0.1, x + 0.09, ry + 1.05, rz0 - 0.06, 1 | 2 | 32);
    }
  }
  // the downpipe on the fin between this bay and the last
  box(Dt, '#e2e3e3', 0.02, BASE + 0.4, -0.13, 0.11, EAVE - 0.1, -0.04, 1 | 2 | 32);

  // the roof: two slopes from the front frame to the back overhang, a ridge cap
  const rn = Math.hypot(RISE, mid);
  f(Rf, '#ffffff', [[0, EAVE, 0], [mid, RIDGE, 0], [mid, RIDGE, D + OVR], [0, EAVE, D + OVR]], [-RISE / rn, mid / rn, 0]);
  f(Rf, '#ffffff', [[mid, RIDGE, 0], [W, EAVE, 0], [W, EAVE, D + OVR], [mid, RIDGE, D + OVR]], [RISE / rn, mid / rn, 0]);
  box(Dt, '#3b3f44', mid - 0.09, RIDGE - 0.06, 0.06, mid + 0.09, RIDGE + 0.03, D + OVR - 0.04, 1 | 2 | 4);

  // the garden side (z = D): white render up to the roof, a larch band and two gable windows, full glazing below
  f(Wl, WHITE, [[0, BASE, D], [W, BASE, D], [W, yi(W), D], [mid, yi(mid), D], [0, yi(0), D]], [0, 0, 1]);
  f(Dt, PLINTH, [[0, BASE, D + 0.01], [W, BASE, D + 0.01], [W, -0.15, D + 0.01], [0, -0.15, D + 0.01]], [0, 0, 1]);
  const yb = (x) => yi(x) - 0.32, zb = D + 0.02;
  f(Wd, '#ffffff', [[0.45, S1 - 0.05, zb], [W - 0.45, S1 - 0.05, zb], [W - 0.45, yb(W - 0.45), zb], [mid, yb(mid), zb], [0.45, yb(0.45), zb]], [0, 0, 1]);
  for (const [a, b] of [[0.62, 1.6], [W - 1.6, W - 0.62]]) {
    f(Dt, FRAME, [[a, S1 + 0.55, zb + 0.01], [b, S1 + 0.55, zb + 0.01], [b, yb(b) - 0.12, zb + 0.01], [a, yb(a) - 0.12, zb + 0.01]], [0, 0, 1]);
    pane(G(0.3), [[b - 0.06, S1 + 0.61, zb + 0.03], [a + 0.06, S1 + 0.61, zb + 0.03], [a + 0.06, yb(a + 0.06) - 0.18, zb + 0.03], [b - 0.06, yb(b - 0.06) - 0.18, zb + 0.03]], 1, 1, 1);
  }
  f(Dt, FRAME, [[0.4, 0.05, D + 0.01], [W - 0.4, 0.05, D + 0.01], [W - 0.4, 2.55, D + 0.01], [0.4, 2.55, D + 0.01]], [0, 0, 1]);
  pane(G(0.45), [[W - 0.46, 0.11, D + 0.03], [0.46, 0.11, D + 0.03], [0.46, 2.49, D + 0.03], [W - 0.46, 2.49, D + 0.03]], 1, 4, 1);
  box(U.lamp, '#ffffff', 0.15, 2.7, D + 0.01, 0.25, 2.95, D + 0.09, 1 | 2 | 4 | 16);
}

// ------------------------------------------------------------------------------------------------ build
export function buildEkohouse({ root, solids: S, zips: Z, heightAt }) {
  const t0 = performance.now(), n0 = S.count ?? 0, r = rng(1441670084 % 65521);
  const group = new THREE.Group(); group.name = 'ekohouse'; root.add(group);
  const footprints = [], spots = [], parked = [], lampHeads = [];

  // ---- the rows: one floor per row (its highest ground + a step), each bay laid into the shared builders
  const B = { wall: new MB(), wood: new MB(), roof: new MB(), det: new MB(), glass: new MB(), lit: new MB(), lamp: new MB(),
    gnd: new MB(), lawn: new MB(), paint: new MB() };
  const m4 = new THREE.Matrix4();
  let nUnits = 0;
  for (const q of EKO_ROWS) {
    const ring = ekoRowRing(q);
    let g = -Infinity;
    for (const [x, z] of [...ring, [(ring[0][0] + ring[2][0]) / 2, (ring[0][1] + ring[2][1]) / 2]]) g = Math.max(g, heightAt(x, z));
    const FY = g + 0.32;
    q.FY = FY;
    for (let i = 0; i < q.n; i++) {
      m4.makeRotationY(q.dir > 0 ? 0 : Math.PI).setPosition(q.dir > 0 ? q.x0 + i * q.w : q.x0 + (i + 1) * q.w, FY, q.z);
      for (const D_ of Object.values(B)) D_.setXf(m4);
      emitUnit(B, q.w, !!q.wide, r);
      nUnits++;
    }
    S.prism(ring.flat(), FY + BASE, FY + EAVE + 0.7, 0, 0, 'wall');
    // the eaves for the zip-points, front and back
    const zf = q.z, zb = q.z + q.dir * (D + OVR), x1 = q.x0 + q.n * q.w;
    Z.edge(q.x0, zf, x1, zf, FY + EAVE, 0, -q.dir); Z.edge(q.x0, zb, x1, zb, FY + EAVE, 0, q.dir);
    footprints.push({ poly: ring, h: RIDGE + 0.3, kind: 'house', name: NAME });
  }
  for (const D_ of Object.values(B)) D_.setXf(null);
  const unitVerts = B.wall.v + B.wood.v + B.roof.v + B.det.v + B.glass.v + B.lit.v + B.lamp.v;

  // ---- the lot, in the map frame: draped surfaces, fences, garden screens, pergolas, the car park
  const L = B;
  const H = (x, z) => heightAt(x, z) + 0.17;
  const up = [0, 1, 0];
  const surf = (D_, x0, x1, z0, z1, col, lift = 0, rep = 2.6) => { // a rectangle draped over the ground in cells of <= 3 m
    D_.setColor(col);
    const nx = Math.max(1, Math.ceil((x1 - x0) / 3)), nz = Math.max(1, Math.ceil((z1 - z0) / 3));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const a = x0 + (x1 - x0) * i / nx, b = x0 + (x1 - x0) * (i + 1) / nx, c = z0 + (z1 - z0) * j / nz, d = z0 + (z1 - z0) * (j + 1) / nz;
      quad(D_, [a, H(a, c) + lift, c], [b, H(b, c) + lift, c], [b, H(b, d) + lift, d], [a, H(a, d) + lift, d], up, [[a / rep, c / rep], [b / rep, c / rep], [b / rep, d / rep], [a / rep, d / rep]]);
    }
  };
  const PAVE = '#c9c7c3';
  surf(L.gnd, -1465.0, -1403.6, 4257.1, 4273.7, PAVE);           // the first court
  surf(L.gnd, -1403.6, -1381.0, 4236.4, 4291.6, PAVE);           // the yard and the car park by the gate
  surf(L.gnd, -1381.0, -1368.5, 4260.5, 4270.5, PAVE);           // the apron out to Сагайдачного
  surf(L.gnd, -1464.6, -1461.2, 4222.5, 4257.1, PAVE);           // the walk between the courts along the south-west fence
  surf(L.gnd, -1464.3, -1433.0, 4206.0, 4222.5, PAVE);           // the north-west court
  surf(L.gnd, -1471.0, -1464.3, 4209.0, 4219.0, PAVE);           // its apron out to Турчина
  const LAWN = '#ffffff';
  surf(L.lawn, -1456.6, -1403.6, 4285.0, 4291.6, LAWN, 0, 3);    // the gardens: row 1, row 2 (two parts), row 3, row 4
  surf(L.lawn, -1434.5, -1403.6, 4235.6, 4245.8, LAWN, 0, 3);
  surf(L.lawn, -1456.0, -1434.5, 4240.0, 4245.8, LAWN, 0, 3);
  surf(L.lawn, -1461.0, -1434.5, 4233.8, 4240.0, LAWN, 0, 3);
  surf(L.lawn, -1461.0, -1433.2, 4184.4, 4194.7, LAWN, 0, 3);
  surf(L.lawn, -1465.0, -1456.6, 4273.7, 4291.6, LAWN, 0, 3);    // the corners at the rows' south-west ends
  surf(L.lawn, -1461.0, -1456.0, 4240.0, 4257.1, LAWN, 0, 3);
  // the beds of mulch along every front (the thujas stand in them) and the timber decks behind
  for (const q of EKO_ROWS) for (let i = 0; i < q.n; i++) {
    const xa = q.x0 + i * q.w, zf = q.z, zo = zf - q.dir * 0.9;
    surf(L.gnd, xa + 0.05, xa + 1.6, Math.min(zf, zo), Math.max(zf, zo), '#4a3a2c', 0.012, 2);
    spots.push({ x: xa + 0.45, z: zf - q.dir * 0.45, kind: 'conifer', variant: 'spruce', sc: 0.24 + r() * 0.05, s3: [0.42, 1, 0.42] });
    spots.push({ x: xa + 1.15, z: zf - q.dir * 0.45, kind: 'conifer', variant: 'spruce', sc: 0.2 + r() * 0.05, s3: [0.42, 1, 0.42] });
  }

  // garden screens between the bays (larch, 1.7 m) over the whole garden; pergolas on every other terrace
  const gardenEnd = [4291.4, 4240.0, 4240.0, 4184.6];
  const wbox = (B, col, x0, y0, z0, x1, y1, z1) => { B.setColor(col); B.box(x0, y0, z0, x1, y1, z1); };
  EKO_ROWS.forEach((q, k) => {
    const zb = q.z + q.dir * D, ze = gardenEnd[k], za = Math.min(zb, ze), zc = Math.max(zb, ze);
    for (let i = 0; i <= q.n; i++) {
      const x = q.x0 + i * q.w, g = Math.min(H(x, za), H(x, zc)) - 0.1;
      if (i > 0 && i < q.n) {
        wbox(L.wood, '#ffffff', x - 0.03, g, za, x + 0.03, q.FY + 1.75, zc);
        S.prism([x - 0.05, za, x + 0.05, za, x + 0.05, zc, x - 0.05, zc], g - 0.2, q.FY + 1.75, 0, 0, 'fence');
      }
      if (i < q.n && i % 2 === 0) { // a pergola: two posts, two beams, slats, over a deck
        const xa = x + 0.35, xb = x + q.w - 0.35, z1 = zb + q.dir * 3.0, zl = Math.min(zb, z1), zh = Math.max(zb, z1), yt = q.FY + 2.65;
        surf(L.wood, xa, xb, zl, zh, '#c58d55', 0.06, 1);
        for (const px of [xa, xb]) wbox(L.wood, '#e8b27a', px - 0.07, g, z1 - 0.07, px + 0.07, yt, z1 + 0.07);
        for (const px of [xa, xb]) wbox(L.wood, '#e8b27a', px - 0.05, yt, zl, px + 0.05, yt + 0.18, zh);
        for (let s = 0; s <= 6; s++) { const z = zl + 0.15 + (zh - zl - 0.3) * s / 6; wbox(L.wood, '#e8b27a', xa - 0.15, yt + 0.18, z - 0.03, xb + 0.15, yt + 0.26, z + 0.03); }
        S.cyl(xa, z1, g, yt, 0.09, 0.09, 'pole'); S.cyl(xb, z1, g, yt, 0.09, 0.09, 'pole');
      }
      if (i < q.n && r() < 0.5) spots.push({ x: x + q.w / 2 + (r() - 0.5) * 1.5, z: (zb + ze) / 2 + q.dir * (r() - 0.5), kind: 'small', sc: 0.45 + r() * 0.15 });
    }
  });
  { // the screen between the gardens of rows 2 and 3
    const g = H(-1448, 4240) - 0.1, top = EKO_ROWS[2].FY + 1.75;
    wbox(L.wood, '#ffffff', -1461.0, g, 4239.97, -1432.4, top, 4240.03);
    S.prism([-1461, 4239.9, -1432.4, 4239.9, -1432.4, 4240.1, -1461, 4240.1], g - 0.2, top, 0, 0, 'fence');
  }

  // the fence round the lot: dark-grey profiled sheet on posts, 2 m, open at the two gates; in pieces of <= 3 m
  let nFence = 0;
  EKO_LOT.forEach((a, k) => {
    const b = EKO_LOT[(k + 1) % EKO_LOT.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const n = Math.max(1, Math.ceil(len / 3));
    for (let i = 0; i < n; i++) {
      const p = [a[0] + ux * len * i / n, a[1] + uz * len * i / n], q = [a[0] + ux * len * (i + 1) / n, a[1] + uz * len * (i + 1) / n];
      const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      if (GATES.some((gt) => Math.abs(m[0] - gt.x) < 2 && m[1] > gt.z0 && m[1] < gt.z1)) continue;
      const g0 = H(p[0], p[1]) - 0.25, g1 = H(q[0], q[1]) - 0.25, nx = -uz * 0.04, nz = ux * 0.04;
      L.det.setColor('#686d72');
      for (const s of [1, -1]) quad(L.det, [p[0] + nx * s, g0, p[1] + nz * s], [q[0] + nx * s, g1, q[1] + nz * s], [q[0] + nx * s, g1 + 2.25, q[1] + nz * s], [p[0] + nx * s, g0 + 2.25, p[1] + nz * s], [-uz * s, 0, ux * s]);
      L.det.setColor('#3e4247'); L.det.box(p[0] - 0.05, g0 - 0.1, p[1] - 0.05, p[0] + 0.05, g0 + 2.3, p[1] + 0.05, 1 | 2 | 4 | 16 | 32);
      S.prism([p[0] + nx * 2, p[1] + nz * 2, q[0] + nx * 2, q[1] + nz * 2, q[0] - nx * 2, q[1] - nz * 2, p[0] - nx * 2, p[1] - nz * 2], Math.min(g0, g1) - 0.3, Math.max(g0, g1) + 2.25, 0, 0, 'fence');
      nFence++;
    }
  });
  // the gate posts and the sliding gate drawn back along the fence by the car park
  for (const gt of GATES) for (const z of [gt.z0, gt.z1]) { const g = H(gt.x, z) - 0.25; L.det.setColor('#2f3236'); L.det.box(gt.x - 0.12, g, z - 0.12, gt.x + 0.12, g + 2.4, z + 0.12); S.cyl(gt.x, z, g, g + 2.4, 0.15, 0.15, 'pole'); }

  // the car park: two rows of bays off an aisle in the yard by the gate, the court's mouth left open
  const strip = (x0, z0, x1, z1) => { const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz), nx = -dz / l * 0.06, nz = dx / l * 0.06; L.paint.setColor('#f2f1ec'); quad(L.paint, [x0 - nx, H(x0, z0) + 0.025, z0 - nz], [x1 - nx, H(x1, z1) + 0.025, z1 - nz], [x1 + nx, H(x1, z1) + 0.025, z1 + nz], [x0 + nx, H(x0, z0) + 0.025, z0 + nz], up); };
  const bays = (xa, xb, z0, z1, nose) => {
    const n = Math.floor((z1 - z0) / 2.5);
    for (let i = 0; i <= n; i++) strip(xa, z0 + i * 2.5, xb, z0 + i * 2.5);
    for (let i = 0; i < n; i++) if (r() < 0.55) parked.push([(xa + xb) / 2, z0 + (i + 0.5) * 2.5, nose > 0 ? 0 : Math.PI]);
  };
  bays(-1400.4, -1395.6, 4237.0, 4256.5, -1); bays(-1400.4, -1395.6, 4274.3, 4291.3, -1);
  bays(-1386.0, -1381.4, 4241.0, 4258.5, 1); bays(-1386.0, -1381.4, 4272.5, 4291.3, 1);
  // lamp posts along the car park's walk
  for (const z of [4245, 4282]) { const x = -1402.2, g = H(x, z) - 0.2; L.det.setColor('#2f3236'); L.det.cyl(x, g, z, 0.06, 0.05, 3.6, 6, true); S.cyl(x, z, g, g + 3.6, 0.1, 0.1, 'pole'); lampHeads.push([x, g + 3.6, z]); }

  for (const [x, y, z] of lampHeads) { B.lamp.setColor('#ffffff'); B.lamp.box(x - 0.18, y, z - 0.18, x + 0.18, y + 0.22, z + 0.18); }
  const larch = larchTex(), pane = paneTex(false), mask = paneTex(true);
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: renderTex(), vertexColors: true, roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ map: larch, vertexColors: true, roughness: 0.75 }),
    roof: new THREE.MeshStandardMaterial({ map: roofTex(), vertexColors: true, roughness: 0.55, metalness: 0.3 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 }),
    glass: new THREE.MeshStandardMaterial({ map: pane, vertexColors: true, roughness: 0.1, metalness: 0.35 }),
    lit: new THREE.MeshStandardMaterial({ map: pane, vertexColors: true, roughness: 0.15, metalness: 0.2, emissive: 0xffd6a0, emissiveMap: mask, emissiveIntensity: 0 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0x2a2d30, emissive: 0xffe2b0, emissiveIntensity: 0 }),
    gnd: decalMat(new THREE.MeshStandardMaterial({ map: paverTex(), vertexColors: true, roughness: 0.92 }), 1),
    lawn: decalMat(new THREE.MeshStandardMaterial({ map: grassTex(), vertexColors: true, roughness: 0.95 }), 1),
    paint: decalMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), 2),
  };
  let verts = 0, draws = 0;
  for (const [k, D_] of Object.entries(B)) {
    if (!D_.v) continue;
    const mesh = new THREE.Mesh(D_.build(), M[k]);
    mesh.name = `ekohouse-${k}`; mesh.castShadow = ['wall', 'wood', 'roof', 'det'].includes(k); mesh.receiveShadow = true;
    group.add(mesh); verts += D_.v; draws++;
  }

  console.log(`[cherkasy] ${NAME}: ${nUnits} townhouses in ${EKO_ROWS.length} rows, ${nFence} fence panels, ${parked.length} parked, ${(verts / 1000).toFixed(1)}k verts (${(unitVerts / 1000).toFixed(1)}k in the houses), ${draws} draws, ${(S.count ?? 0) - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    footprints, spots, parked,
    // generated trees keep off the whole lot and the aprons by its gates
    clear: (x, z) => inPoly(EKO_LOT, x, z) || (x > -1381 && x < -1366 && z > 4258 && z < 4273) || (x > -1472 && x < -1464 && z > 4207 && z < 4221),
    update() { const k = nightK.value; M.lit.emissiveIntensity = 1.3 * k; M.lamp.emissiveIntensity = 2.2 * k; },
  };
}
