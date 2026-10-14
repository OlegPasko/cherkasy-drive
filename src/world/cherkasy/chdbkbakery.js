// OWNER: cherkasy. The bakery-café and the self-service car wash behind it, вул. В'ячеслава Чорновола, 164 / 164-б,
// across the street from ЧДБК (chdbk.js) at the Чиковані stop (issue #49). Both opened in 2023 on the old car park next
// to the banking institute; OSM has only the car park (994049869) and a car_wash node, so the outlines are our own
// (places.js CHDBK_BAKERY_RING / CHDBK_WASH_RING, placed from the map pins and the photos). No name of either business
// anywhere, on request: a blank fascia, a plain canopy.
// - the bakery (from the 2023 photos of its street front): one storey, a deep flat roof slab overhanging the front by
//   ~3 m – a thick greige large-panel fascia over a dark soffit with downlights, a thin dark cap –, the front glazed full
//   width and height in black frames (seven bays, a transom, the double door in the middle one), the glazing turning both
//   front corners; the terrace under the overhang with bistro tables and rattan chairs; in front a bed of ornamental
//   grasses and lavender on mulch with a gravel strip and concrete stepping slabs down to the pavement; a black lamp post;
// - the car wash (night photo of the bays, the photo's background and the maker's standard canopy): six bays in a row,
//   three each side of the cream technical container with its door and payment terminals; steel posts that bend out
//   under a polycarbonate barrel roof on steel ribs, tinted glass partitions and back wall, a control pedestal and a
//   boom with a hanging hose in each bay, green LED strips on the front posts at night, a light per bay, two vacuum
//   stands at the east end; the paved apron, a row of car parks (`parked`) by the bakery, the grey sheet fence on the west.
// Guesses: the bakery's sides and back (panels, a service door), its interior, the canopy's exact length and the side
// the bays open to (toward the drive from Чорновола), the fence. The lot is levelled by `levelChdbkBakery` (the DEM
// tilts it ~2 m west to east); the front stays on the old grade so Чорновола is not touched.
//   CHDBKBAKERY_SKIP: none (both are new)
//   levelChdbkBakery(hf) -> level | null   city.js calls it before the ground is built
//   buildChdbkBakery({ root, solids, heightAt }) -> { update(dt), clear(x, z), footprints, parked, info } | null
//     info: { floor (the bakery's floor), level (the lot), roof (the bakery's cap), eave (the wash canopy's eaves),
//       bays: [[x0, x1]], container: [x0, z0, x1, z1] } (tests)
// Axis-aligned in the map frame (x north-east along Чорновола, z south-east toward it); walls laid per side in a face
// frame (slabkit.js): s along the side, y up, o outward.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { OVERHANG } from '../collision.js';
import { rng } from './geo.js';
import { canvasTex, decal } from './sculpt.js';
import { face, at, quad, box, solid, finish, speckle } from './slabkit.js';
import { CHDBK_BAKERY_RING, CHDBK_WASH_RING } from './places.js';

export const CHDBKBAKERY_SKIP = new Set();

const bb = (ring) => [Math.min(ring[0], ring[2], ring[4], ring[6]), Math.min(ring[1], ring[3], ring[5], ring[7]), Math.max(ring[0], ring[2], ring[4], ring[6]), Math.max(ring[1], ring[3], ring[5], ring[7])];
const BK = bb(CHDBK_BAKERY_RING), CW = bb(CHDBK_WASH_RING);
const R = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
// the lot the hook levels: the wash, its apron and the bakery; its front stops 8 m short of the 16 m lattice row under
// Чорновола's pavement, so the street keeps its grade
const LOT = [-3308, 2362, -3270.5, 2399.5];
const OF = 3.0, OS = 0.7, OB = 0.4;                   // the bakery roof's overhang: front, sides, back
const GLZ = 3.9, FAS = 5.0, CAP = 5.1;                // over the floor: soffit / glazing head, fascia top, cap top
const EAVE = 4.0, RISE = 0.8;                         // the wash canopy: eaves over the lot, the barrel's rise
const CONT = [-3291.0, -3288.0];                      // the technical container between the bays (x)
const BAYS = [0, 1, 2].map((i) => [CW[0] + i * 4.5, CW[0] + (i + 1) * 4.5]).concat([0, 1, 2].map((i) => [CONT[1] + i * 4.5, CONT[1] + (i + 1) * 4.5]));
const GREIGE = '#cfc8bc', SOFFIT = '#5d5f62', CAPC = '#2c2e31', FRAME = '#1b1c1e', STEEL = '#b9bec4', CREAM = '#e3dccb';

export function levelChdbkBakery(hf) {
  let s = 0, n = 0;
  for (let x = LOT[0]; x <= LOT[2]; x += 2) for (let z = LOT[1]; z <= LOT[3]; z += 2) { s += hf.heightAt(x, z); n++; }
  return n ? hf.pad(R(...LOT), 8, s / n) : null;
}

// ---- textures
// the fascia's large-format panels: one repeat = 3 m x 1.3 m (one panel), joints round it, a faint grain
const fasciaTex = (r) => canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(120,110,95,${0.03 + r() * 0.05})`; g.fillRect(r() * w, r() * h, 2 + r() * 30, 1); }
  g.fillStyle = 'rgba(60,58,55,0.55)'; g.fillRect(0, 0, 2, h); g.fillRect(0, h - 2, w, 2);
});
// concrete pavers 0.2 x 0.1 m in a running bond; one repeat = 1.6 m; the vertex colour tints them
const paverTex = (r) => canvasTex(256, 256, (g, w) => {
  g.fillStyle = '#7c7a76'; g.fillRect(0, 0, w, w);
  for (let j = 0; j < 16; j++) for (let i = -1; i < 9; i++) {
    const k = 0.9 + r() * 0.14, x = i * 32 + (j & 1) * 16;
    g.fillStyle = `rgb(${200 * k | 0},${198 * k | 0},${193 * k | 0})`; g.fillRect(x + 1.5, j * 16 + 1.5, 29, 13);
  }
});
// mulch and gravel: speckle on white, tinted by the vertex colour; one repeat = 2 m
const grainTex = (r, n, a) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { const k = r(); g.fillStyle = k < 0.5 ? `rgba(0,0,0,${a * r()})` : `rgba(255,255,255,${a * r()})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
});
// a grass tuft's blades fanning up from the base (alpha; the vertex colour tints them), with a few seed heads
const tuftTex = (r) => canvasTex(128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.lineCap = 'round';
  for (let i = 0; i < 34; i++) {
    const a = (r() - 0.5) * 1.5, len = h * (0.55 + r() * 0.42), x1 = w / 2 + Math.sin(a) * len, y1 = h - Math.cos(a) * len;
    g.strokeStyle = `rgba(255,255,255,${0.85 + r() * 0.15})`; g.lineWidth = 1.5 + r() * 1.5;
    g.beginPath(); g.moveTo(w / 2 + (r() - 0.5) * 10, h); g.quadraticCurveTo(w / 2 + Math.sin(a) * len * 0.4, h - len * 0.6, x1, y1); g.stroke();
    if (r() < 0.5) { g.fillStyle = '#f4ead2'; g.beginPath(); g.ellipse(x1, y1 + 5, 2.5, 7, a, 0, 7); g.fill(); }
  }
}, { repeat: false });
// the bay floors: concrete with a drain grate in each bay's middle (u across one bay, v front to back)
const bayTex = () => canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,0.06)'; for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 2);
  g.fillStyle = '#3a3c3e'; g.fillRect(w / 2 - 22, h / 2 - 10, 44, 20);
  g.fillStyle = '#8b8e90'; for (let x = w / 2 - 20; x < w / 2 + 20; x += 5) g.fillRect(x, h / 2 - 8, 2, 16);
  g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h);
}, { repeat: false });

export function buildChdbkBakery({ root, solids: S, heightAt }) {
  if (!heightAt || !Number.isFinite(heightAt(BK[0], BK[1]))) return null;
  const t0 = performance.now(), r = rng(16449), n0 = S.count;
  const B = { panel: new MB(), det: new MB(), soffit: new MB(), glass: new MB(), inside: new MB(), glow: new MB(), led: new MB(), poly: new MB(),
    tint: new MB(), pave: new MB(), bay: new MB(), mulch: new MB(), gravel: new MB(), plant: new MB(), grass: new MB() };
  const D = B.det;
  const rectFaces = ([x0, z0, x1, z1]) => ({
    xm: face([x0, z1], [x0, z0], -1, 0), xp: face([x1, z0], [x1, z1], 1, 0), zm: face([x1, z0], [x0, z0], 0, -1), zp: face([x0, z1], [x1, z1], 0, 1),
  });
  const drape = (Mb, x0, z0, x1, z1, lift, col, rep, uvf = null, step = 2) => {
    const ns = Math.max(1, Math.ceil((x1 - x0) / step)), no = Math.max(1, Math.ceil((z1 - z0) / step)), base = Mb.v;
    Mb.setColor(col);
    for (let j = 0; j <= no; j++) for (let i = 0; i <= ns; i++) {
      const x = x0 + (x1 - x0) * i / ns, z = z0 + (z1 - z0) * j / no, [u, v] = uvf ? uvf(x, z) : [x / rep, z / rep];
      Mb.vert(x, heightAt(x, z) + lift, z, 0, 1, 0, u, v);
    }
    for (let j = 0; j < no; j++) for (let i = 0; i < ns; i++) { const a = base + j * (ns + 1) + i; Mb.quad(a, a + ns + 1, a + ns + 2, a + 1); }
  };
  const L = heightAt((LOT[0] + LOT[2]) / 2, (LOT[1] + LOT[3]) / 2);

  // ================================================================ the bakery
  const gk = R(...BK).map(([x, z]) => heightAt(x, z)), yF = Math.max(...gk) + 0.12, gB = Math.min(...gk) - 0.5;
  const fb = rectFaces(BK), FR = fb.zp;                                  // the front looks +z, toward Чорновола
  const yS = yF + GLZ, yT = yF + FAS, yC = yF + CAP;
  const RX0 = BK[0] - OS, RX1 = BK[2] + OS, RZ0 = BK[1] - OB, RZ1 = BK[3] + OF;
  // the roof slab: the fascia round it, the soffit under it, the dark cap on top
  const fr = rectFaces([RX0, RZ0, RX1, RZ1]);
  for (const f of [fr.xm, fr.xp, fr.zm, fr.zp]) {
    B.panel.setColor(GREIGE);
    quad(B.panel, at(f, 0, yS), at(f, f.L, yS), at(f, f.L, yT), at(f, 0, yT), f.N, [[0, 0], [f.L / 3, 0], [f.L / 3, 1], [0, 1]]);
    D.setColor(CAPC); box(D, f, -0.04, f.L + 0.04, yT, yC, -0.15, 0.04, 'ft');
  }
  B.soffit.setColor(SOFFIT); B.soffit.fill(R(RX0, RZ0, RX1, RZ1), [], yS, false);
  D.setColor('#3a3c40'); D.fill(R(RX0, RZ0, RX1, RZ1), [], yC, true);
  // downlights in the soffit: two rows over the terrace, one over the sides
  const lights = [];
  for (let i = 0; i < 7; i++) { const x = RX0 + 1.0 + i * (RX1 - RX0 - 2) / 6; lights.push([x, BK[3] + 0.8], [x, BK[3] + 2.3]); }
  for (const [x, z] of lights) { B.glow.setColor('#fff4e0'); B.glow.cyl(x, yS - 0.02, z, 0.09, 0.09, 0.02, 8, true); }

  // the walls: glazed front (seven bays, the double door in the middle one), glazing round the front corners, panels elsewhere
  const pane = (f, s0, s1, door = false) => {
    B.glass.setColor('#2b3640'); quad(B.glass, at(f, s0, yF), at(f, s1, yF), at(f, s1, yS), at(f, s0, yS), f.N);
    D.setColor(FRAME);
    box(D, f, s0, s0 + 0.045, yF, yS, -0.06, 0.04, 'fblr'); box(D, f, s1 - 0.045, s1, yF, yS, -0.06, 0.04, 'fblr');
    box(D, f, s0, s1, yS - 0.12, yS, -0.06, 0.04, 'fbu');
    if (!door) { box(D, f, s0, s1, yF, yF + 0.08, -0.06, 0.04, 'fbt'); box(D, f, s0, s1, yF + 2.5, yF + 2.56, -0.06, 0.04, 'fbtu'); }
    else { const m = (s0 + s1) / 2; box(D, f, s0, s1, yF + 2.3, yF + 2.4, -0.06, 0.04, 'fbtu'); box(D, f, m - 0.04, m + 0.04, yF, yF + 2.3, -0.06, 0.04, 'fblr'); for (const s of [m - 0.25, m + 0.25]) box(D, f, s - 0.02, s + 0.02, yF + 0.9, yF + 1.6, 0.04, 0.1, 'flrt'); }
  };
  const nb = 7, bw = FR.L / nb;
  for (let i = 0; i < nb; i++) pane(FR, i * bw, (i + 1) * bw, i === 3);
  // the sides: the front 3 m glazed (the corner turns in glass), the rest greige panels; the back panelled, a service door
  const wallPanel = (f, s0, s1) => { B.panel.setColor('#d8d2c7'); quad(B.panel, at(f, s0, gB), at(f, s1, gB), at(f, s1, yS), at(f, s0, yS), f.N, [[s0 / 3, 0], [s1 / 3, 0], [s1 / 3, (yS - gB) / 1.3], [s0 / 3, (yS - gB) / 1.3]]); };
  for (const f of [fb.xm, fb.xp]) {
    const front = f === fb.xm ? [0, 3] : [f.L - 3, f.L];               // xm runs back -> front reversed: s 0 is the front corner
    pane(f, front[0], front[1]);
    wallPanel(f, f === fb.xm ? 3 : 0, f === fb.xm ? f.L : f.L - 3);
  }
  wallPanel(fb.zm, 0, fb.zm.L);
  D.setColor('#4a4d52'); box(D, fb.zm, 2.0, 3.0, yF, yF + 2.2, 0, 0.05, 'flrt');            // the service door
  D.setColor('#8d9095'); box(D, fb.zm, 6.0, 7.2, yF + 2.6, yF + 3.2, 0, 0.6, 'fblrtu');    // an AC unit over the back
  // the plinth under the glass: a dark step band (the floor stands ~0.3 m over the terrace)
  D.setColor('#45474a'); box(D, FR, -0.02, FR.L + 0.02, gB, yF, 0, 0.35, 'ftlr');
  for (const f of [fb.xm, fb.xp, fb.zm]) box(D, f, 0, f.L, gB, yF, 0, 0.02, 'ft');
  // inside: the floor, the ceiling, the warm back wall and the counter, pendant lights (seen through the glass)
  const I = B.inside;
  I.setColor('#b9ab98'); I.fill(R(...BK), [], yF + 0.01, true);
  I.setColor('#e9e2d6'); I.fill(R(...BK), [], yS - 0.13, false);
  I.setColor('#b98b5e'); quad(I, [BK[0] + 0.1, yF, BK[1] + 0.12], [BK[2] - 0.1, yF, BK[1] + 0.12], [BK[2] - 0.1, yS - 0.13, BK[1] + 0.12], [BK[0] + 0.1, yS - 0.13, BK[1] + 0.12], [0, 0, 1]);
  for (const f of [fb.xm, fb.xp]) { I.setColor('#ddd5c8'); const a = at(f, 0, yF, -0.12), b = at(f, f.L, yF, -0.12); quad(I, a, b, [b[0], yS - 0.13, b[2]], [a[0], yS - 0.13, a[2]], f.N.map((v) => -v)); }
  I.setColor('#3b3532'); I.box(BK[0] + 2.0, yF, BK[1] + 2.0, BK[2] - 3.5, yF + 1.1, BK[1] + 2.8);   // the counter
  I.setColor('#e8d9b8'); I.box(BK[0] + 2.0, yF + 1.1, BK[1] + 2.0, BK[2] - 3.5, yF + 1.45, BK[1] + 2.8, 63 - 8); // the display case
  I.setColor('#5c4a3a'); for (const x of [BK[0] + 1.5, BK[0] + 3.5, BK[2] - 2.0]) I.box(x - 0.4, yF, BK[3] - 2.2, x + 0.4, yF + 0.75, BK[3] - 1.4);   // tables inside
  for (let i = 0; i < 6; i++) { const x = BK[0] + 2.4 + i * (BK[2] - BK[0] - 5.9) / 5; B.glow.setColor('#ffe2b0'); B.glow.cyl(x, yS - 1.1, BK[1] + 2.4, 0.18, 0.05, 0.25, 8, true); D.setColor('#1d1d1f'); D.tube([x, yS - 0.85, BK[1] + 2.4], [x, yS - 0.13, BK[1] + 2.4], 0.008, 3); }

  // the terrace under the overhang, the bed in front with its gravel strip and stepping slabs
  const TZ1 = RZ1 + 0.4;
  // the front keeps the old grade's bend, where the ground's cover triangles ride up to ~0.32 m over the height field:
  // the terrace and the bed sit over that (the bed as a low raised planter in a kerb)
  drape(B.pave, RX0, BK[3], RX1, TZ1, 0.3, '#c8c6c1', 1.6, null, 1);
  const PX0 = -3276.2, PX1 = -3273.2;                                  // the path's strip, from the terrace to the pavement
  drape(B.mulch, RX0, TZ1, RX1, 2407.5, 0.36, '#5a4636', 2, null, 1);
  D.setColor('#9a9893');
  for (const [xa, za, xb, zb] of [[RX0, TZ1, RX0, 2407.5], [RX1, TZ1, RX1, 2407.5], [RX0, 2407.5, RX1, 2407.5]]) {
    const n = Math.ceil(Math.hypot(xb - xa, zb - za));
    for (let i = 0; i < n; i++) {
      const x0 = xa + (xb - xa) * i / n, z0 = za + (zb - za) * i / n, x1 = xa + (xb - xa) * (i + 1) / n, z1 = za + (zb - za) * (i + 1) / n, g = Math.min(heightAt(x0, z0), heightAt(x1, z1));
      if (za === zb && (x0 + x1) / 2 > PX0 && (x0 + x1) / 2 < PX1) continue;                       // the path's way in
      D.box(Math.min(x0, x1) - 0.07, g + 0.05, Math.min(z0, z1) - 0.07, Math.max(x0, x1) + 0.07, Math.max(heightAt(x0, z0), heightAt(x1, z1)) + 0.4, Math.max(z0, z1) + 0.07, 63 - 8);
    }
  }
  drape(B.gravel, PX0, TZ1, PX1, 2407.5, 0.37, '#d9d5cc', 2, null, 1);
  for (let z = TZ1 + 0.35; z < 2407.2; z += 0.8) {
    const g = Math.max(heightAt(PX0, z), heightAt(PX1, z), heightAt(PX0, z + 0.45), heightAt(PX1, z + 0.45));
    D.setColor('#b3b1ac'); D.box(PX0 + 0.15, g + 0.3, z, PX1 - 0.15, g + 0.45, z + 0.45, 63 - 8);
  }
  // ornamental grasses (tan and green) and lavender on the mulch
  for (let i = 0; i < 170; i++) {
    const x = RX0 + 0.3 + r() * (RX1 - RX0 - 0.6), z = TZ1 + 0.3 + r() * (2407.2 - TZ1 - 0.6);
    if (x > PX0 - 0.25 && x < PX1 + 0.25) continue;
    const g = heightAt(x, z) + 0.36, k = r();
    if (k < 0.7) {                                                    // two crossed quads of blades
      B.grass.setColor(k < 0.55 ? '#d2b984' : '#a3a564'); const h = 0.4 + r() * 0.45, w = 0.35 + r() * 0.15, a0 = r() * Math.PI;
      for (const a of [a0, a0 + Math.PI / 2]) { const c = Math.cos(a) * w, s = Math.sin(a) * w; quad(B.grass, [x - c, g - 0.05, z - s], [x + c, g - 0.05, z + s], [x + c, g + h, z + s], [x - c, g + h, z - s], [-s, 0, c], [[0, 0], [1, 0], [1, 1], [0, 1]]); }
    }
    else if (k < 0.8) { B.plant.setColor('#8a83a6'); B.plant.ellipsoid([x, g + 0.1, z], [0.16, 0.13, 0.16], 6, 3); }
    else { B.plant.setColor('#5f7a44'); B.plant.ellipsoid([x, g + 0.1, z], [0.28, 0.14, 0.28], 6, 3); }
  }
  // bistro tables and rattan chairs on the terrace (two rows, the door's way kept clear)
  const doorX = BK[0] + 3.5 * bw, chair = (x, z, ry) => {
    const g = heightAt(x, z) + 0.3, c = Math.cos(ry), s = Math.sin(ry);
    D.setColor('#d6c49c'); D.box(x - 0.22, g + 0.44, z - 0.22, x + 0.22, g + 0.49, z + 0.22);
    const bx = x - s * 0.22, bz = z - c * 0.22;
    D.box(bx - 0.22 * Math.abs(c) - 0.02, g + 0.49, bz - 0.22 * Math.abs(s) - 0.02, bx + 0.22 * Math.abs(c) + 0.02, g + 0.9, bz + 0.22 * Math.abs(s) + 0.02);
    D.setColor('#2b2b2b'); for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) D.tube([x + dx, g, z + dz], [x + dx, g + 0.44, z + dz], 0.012, 3);
  };
  for (const zt of [BK[3] + 1.0, BK[3] + 2.5]) for (let i = 0; i < 6; i++) {
    const x = RX0 + 1.2 + i * (RX1 - RX0 - 2.4) / 5;
    if (Math.abs(x - doorX) < 1.2) continue;
    const g = heightAt(x, zt) + 0.3;
    D.setColor('#1f1f1f'); D.cyl(x, g, zt, 0.22, 0.22, 0.03, 10, true); D.tube([x, g, zt], [x, g + 0.72, zt], 0.025, 4);
    D.setColor('#c8a87a'); D.cyl(x, g + 0.72, zt, 0.32, 0.32, 0.03, 12, true);
    chair(x - 0.55, zt, Math.PI / 2); chair(x + 0.55, zt, -Math.PI / 2); chair(x, zt + 0.55, Math.PI);
  }
  // the black lamp post at the bed's west corner
  { const x = RX0 - 0.6, z = 2406.6, g = heightAt(x, z);
    D.setColor('#1c1d1f'); D.cyl(x, g, z, 0.1, 0.07, 6.5, 8, false); D.tube([x, g + 6.4, z], [x + 1.4, g + 6.5, z], 0.05, 5); D.box(x + 1.2, g + 6.3, z - 0.15, x + 1.8, g + 6.45, z + 0.15);
    B.glow.setColor('#fff2d6'); B.glow.box(x + 1.25, g + 6.28, z - 0.12, x + 1.75, g + 6.3, z + 0.12, 8);
    S.cyl(x, z, g - 0.3, g + 6.5, 0.12, 0.12, 'pole'); }

  // bakery collision: the body (walls and glass), the roof slab over the terrace as an awning
  S.prism(R(...BK).flat(), gB, yC, 0, 0, 'wall');
  for (const q of [[RX0, BK[3], RX1, RZ1], [RX0, RZ0, BK[0], BK[3]], [BK[2], RZ0, RX1, BK[3]], [BK[0], RZ0, BK[2], BK[1]]]) S.prism(R(...q).flat(), yS, yC, 0, 0, 'awning', OVERHANG);
  solid(S, FR, 0, FR.L, 0, 0.35, gB, yF);

  // ================================================================ the car wash
  const [WX0, WZ0, WX1, WZ1] = CW, yE = L + EAVE;
  // the bay floors (one drape per bay, the grate in its middle) and the paved apron in front, the car parks by the bakery
  for (const [a, b] of BAYS) drape(B.bay, a, WZ0, b, WZ1, 0.215, '#8f918f', 0, (x, z) => [(x - a) / (b - a), (z - WZ0) / (WZ1 - WZ0)]);
  drape(B.pave, WX0 - 1.5, WZ0 - 1.5, CONT[0], WZ0, 0.21, '#a7a6a2', 1.6); drape(B.pave, CONT[1], WZ0 - 1.5, WX1 + 3.5, WZ0, 0.21, '#a7a6a2', 1.6);
  drape(B.pave, CONT[0], WZ0 - 1.5, CONT[1], WZ1, 0.21, '#a7a6a2', 1.6);
  drape(B.pave, WX1, WZ0, WX1 + 3.5, WZ1, 0.21, '#a7a6a2', 1.6);
  drape(B.pave, WX0 - 1.5, WZ1, WX1 + 3.5, BK[1] - 0.6, 0.21, '#a7a6a2', 1.6);
  drape(B.pave, WX0 - 1.5, BK[1] - 0.6, RX0 - 0.2, 2399.5, 0.21, '#a7a6a2', 1.6);
  const parked = [];
  { const zc = 2392.5;
    D.setColor('#f1efe8');
    for (let i = 0; i <= 4; i++) { const x = -3304.0 + i * 2.7, g = heightAt(x, zc) + 0.225; D.box(x - 0.05, g, zc - 2.5, x + 0.05, g + 0.01, zc + 2.5, 4); }
    for (let i = 0; i < 4; i++) parked.push([-3304.0 + (i + 0.5) * 2.7, zc, Math.PI / 2]); }
  parked.push([(BAYS[1][0] + BAYS[1][1]) / 2, WZ0 + 3.0, Math.PI / 2], [(BAYS[4][0] + BAYS[4][1]) / 2, WZ0 + 3.2, Math.PI / 2]);

  // posts at every bay line, front and back: square steel up to the knee, then bent out to the eaves
  const lines = [...new Set([...BAYS.flat(), ...CONT])].sort((p, q) => p - q);
  const knee = yE - 0.7, lean = 0.6;
  for (const x of lines) for (const [z, dir] of [[WZ1, 1], [WZ0, -1]]) {
    const g = heightAt(x, z);
    D.setColor(STEEL); D.box(x - 0.06, g, z - 0.06, x + 0.06, knee, z + 0.06, 63 - 8);
    D.tube([x, knee - 0.05, z], [x, yE, z + dir * lean], 0.06, 6);
    S.prism(R(x - 0.08, z - 0.08, x + 0.08, z + 0.08).flat(), g - 0.3, knee, 0, 0, 'pole');
    if (dir > 0) { B.led.setColor('#ffffff'); B.led.box(x - 0.03, g + 0.3, z + 0.06, x + 0.03, knee - 0.1, z + 0.075, 16); }
  }
  // the roof: two eave beams, a rib over every bay line, the polycarbonate barrel between them
  const zA = WZ0 - lean, zB = WZ1 + lean, zc = (zA + zB) / 2, hw = (zB - zA) / 2;
  const arcY = (z) => yE + RISE * Math.sqrt(Math.max(0, 1 - ((z - zc) / hw) ** 2));
  D.setColor(STEEL);
  for (const z of [zA, zB]) D.box(WX0 - 0.4, yE - 0.18, z - 0.08, WX1 + 0.4, yE + 0.04, z + 0.08);
  const NS = 10, zs = Array.from({ length: NS + 1 }, (_, i) => zA + (zB - zA) * i / NS);
  for (const x of [WX0 - 0.4, ...lines, WX1 + 0.4]) for (let i = 0; i < NS; i++) D.tube([x, arcY(zs[i]), zs[i]], [x, arcY(zs[i + 1]), zs[i + 1]], 0.035, 4);
  for (const z of [zc - hw * 0.5, zc, zc + hw * 0.5]) D.tube([WX0 - 0.4, arcY(z) + 0.02, z], [WX1 + 0.4, arcY(z) + 0.02, z], 0.025, 4);
  B.poly.setColor('#e8eef2');
  for (let i = 0; i < NS; i++) {
    const a = zs[i], b = zs[i + 1], ya = arcY(a) + 0.05, yb = arcY(b) + 0.05, ny = 1, nz = (a + b) / 2 > zc ? 0.6 : -0.6;
    quad(B.poly, [WX0 - 0.4, ya, a], [WX1 + 0.4, ya, a], [WX1 + 0.4, yb, b], [WX0 - 0.4, yb, b], [0, ny, nz]);
  }
  // the barrel's end caps: the arch outline as a steel band (open under it, as the canopy is)
  for (const x of [WX0 - 0.4, WX1 + 0.4]) { D.setColor(STEEL); for (let i = 0; i < NS; i++) D.tube([x, arcY(zs[i]) + 0.05, zs[i]], [x, arcY(zs[i + 1]) + 0.05, zs[i + 1]], 0.06, 4); }
  S.prism(R(WX0 - 0.4, zA, WX1 + 0.4, zB).flat(), yE - 0.18, yE + RISE + 0.1, 0, 0, 'awning', OVERHANG);
  // tinted glass: the back wall and the partitions between bays (5 m deep), steel top rails
  const glassWall = (x0, z0, x1, z1) => {
    const g = Math.min(heightAt(x0, z0), heightAt(x1, z1)), yb = g + 0.3, yt = g + 2.4;
    B.tint.setColor('#18222a'); quad(B.tint, [x0, yb, z0], [x1, yb, z1], [x1, yt, z1], [x0, yt, z0], x0 === x1 ? [1, 0, 0] : [0, 0, 1]);
    D.setColor(STEEL); D.tube([x0, yt, z0], [x1, yt, z1], 0.03, 4); D.tube([x0, yb, z0], [x1, yb, z1], 0.03, 4);
    const p = x0 === x1 ? R(x0 - 0.05, z0, x0 + 0.05, z1) : R(x0, z0 - 0.05, x1, z0 + 0.05);
    S.prism(p.flat(), g - 0.3, yt, 0, 0, 'wall');
  };
  for (const [a, b] of BAYS) glassWall(a, WZ0, b, WZ0);
  for (const x of lines) if (x !== CONT[0] && x !== CONT[1]) glassWall(x, WZ0, x, WZ0 + 5.0);
  // each bay: the control pedestal by the back wall, the boom on the back beam with its hose down to the lance holder
  for (const [a, b] of BAYS) {
    const xc = (a + b) / 2, px = a + 0.55, pz = WZ0 + 0.35, g = heightAt(px, pz);
    D.setColor('#9ea4aa'); D.box(px - 0.3, g, pz - 0.2, px + 0.3, g + 1.75, pz + 0.2);
    D.setColor('#20262c'); D.box(px - 0.2, g + 1.2, pz + 0.2, px + 0.2, g + 1.55, pz + 0.21, 16);
    B.glow.setColor('#8fc4ff'); B.glow.box(px - 0.16, g + 1.24, pz + 0.21, px + 0.16, g + 1.5, pz + 0.215, 16);
    S.prism(R(px - 0.3, pz - 0.2, px + 0.3, pz + 0.2).flat(), g - 0.3, g + 1.75, 0, 0, 'wall');
    const yb = yE - 0.35, bz0 = WZ0 - 0.2, bz1 = WZ0 + 2.0;
    D.setColor(STEEL); D.tube([xc, yE - 0.1, bz0], [xc, yb, bz0], 0.05, 6); D.tube([xc, yb, bz0], [xc, yb, bz1], 0.045, 6);
    // the hose: a sagging curve from the boom's end to the holder on the pedestal
    D.setColor('#1a1b1d');
    const P0 = [xc, yb, bz1], P1 = [px + 0.2, g + 1.0, pz + 0.25], N = 8;
    for (let i = 0; i < N; i++) {
      const p = (t) => [P0[0] + (P1[0] - P0[0]) * t, P0[1] + (P1[1] - P0[1]) * t - 1.1 * Math.sin(Math.PI * t), P0[2] + (P1[2] - P0[2]) * t];
      D.tube(p(i / N), p((i + 1) / N), 0.018, 4);
    }
    D.setColor('#d64e1f'); D.box(px + 0.12, g + 0.8, pz + 0.2, px + 0.28, g + 1.05, pz + 0.32);                 // the lance in its holder
    B.glow.setColor('#f4f8ff'); B.glow.box(xc - 0.5, yE - 0.22, zc - 0.12, xc + 0.5, yE - 0.18, zc + 0.12, 8);   // the bay's LED panel
  }
  // the technical container: cream panels, the door and the two payment terminals on its front, a vent on top
  { const [x0, x1] = [CONT[0] + 0.1, CONT[1] - 0.1], z0 = WZ0 + 0.4, z1 = WZ1 - 0.6, g = Math.max(...[[x0, z0], [x1, z1], [x0, z1], [x1, z0]].map(([x, z]) => heightAt(x, z))) + 0.05, top = g + 2.7;
    D.setColor('#7a7c7e'); D.box(x0 - 0.05, g - 0.4, z0 - 0.05, x1 + 0.05, g, z1 + 0.05, 63 - 8);
    B.panel.setColor(CREAM); B.panel.extrude(R(x0, z0, x1, z1), [], g, top, { top: true });
    const cf = face([x0, z1], [x1, z1], 0, 1);
    D.setColor('#9a9790'); box(D, cf, 0.3, 1.2, g, g + 2.1, 0, 0.03, 'flrt');
    D.setColor('#2b2f33'); box(D, cf, 1.5, 2.6, g + 0.9, g + 1.9, 0, 0.18, 'flrtu');
    B.glow.setColor('#bfe0ff'); box(B.glow, cf, 1.65, 2.45, g + 1.35, g + 1.8, 0.18, 0.185, 'f');
    D.setColor('#cfd3d6'); D.box(x0 + 0.3, top, z0 + 1.0, x1 - 0.3, top + 0.35, z0 + 2.2);
    S.prism(R(x0, z0, x1, z1).flat(), g - 0.4, top + 0.35, 0, 0, 'wall'); }
  // two vacuum stands east of the canopy, each with its hose looped over a bracket
  for (const z of [WZ0 + 1.2, WZ1 - 1.2]) {
    const x = WX1 + 1.6, g = heightAt(x, z);
    D.setColor('#55697a'); D.cyl(x, g, z, 0.32, 0.3, 1.2, 10, true);
    D.setColor(STEEL); D.cyl(x, g + 1.2, z, 0.34, 0.2, 0.15, 10, true); D.tube([x, g + 1.2, z], [x, g + 2.2, z], 0.04, 5); D.tube([x, g + 2.2, z], [x - 0.6, g + 2.2, z], 0.035, 5);
    D.setColor('#1a1b1d'); for (let i = 0; i < 6; i++) { const p = (t) => [x - 0.6 * t, g + 2.15 - 1.2 * Math.sin(Math.PI * t) * 0.8, z + 0.25 * Math.sin(Math.PI * t)]; D.tube(p(i / 6), p((i + 1) / 6), 0.025, 4); }
    S.cyl(x, z, g - 0.3, g + 1.35, 0.34, 0.34, 'pole');
  }
  // the grey sheet fence along the lot's west side
  { const x = WX0 - 1.8, z0 = WZ0 - 1.5, z1 = 2390.5, f = face([x, z0], [x, z1], -1, 0), n = Math.ceil((z1 - z0) / 2.5);
    for (let i = 0; i < n; i++) {
      const sa = i * f.L / n, sb = (i + 1) * f.L / n, g = Math.min(heightAt(x, z0 + sa), heightAt(x, z0 + sb)) - 0.05;
      D.setColor('#8e9396'); box(D, f, sa, sb, g - 0.2, g + 2.0, -0.02, 0.02, 'fb');
      D.setColor('#5b5f62'); D.box(x - 0.05, g - 0.2, z0 + sa - 0.05, x + 0.05, g + 2.1, z0 + sa + 0.05, 63 - 8);
      solid(S, f, sa, sb, -0.08, 0.08, g - 0.3, g + 2.0, 'fence');
    } }

  // ---- materials and meshes
  const M = {
    panel: new THREE.MeshStandardMaterial({ map: fasciaTex(r), vertexColors: true, roughness: 0.7, metalness: 0.05 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15, side: THREE.DoubleSide }),
    soffit: new THREE.MeshStandardMaterial({ map: speckle(r, '#ffffff', 600), vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
    inside: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, emissive: 0xffd9a8, emissiveIntensity: 0, side: THREE.DoubleSide }),
    glow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0xfff2dc, emissiveIntensity: 0 }),
    led: new THREE.MeshStandardMaterial({ color: 0x2a6b3c, roughness: 0.5, emissive: 0x39ff7a, emissiveIntensity: 0 }),
    poly: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide, emissive: 0xdfe8f0, emissiveIntensity: 0 }),
    tint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.2, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide }),
    pave: decal(new THREE.MeshStandardMaterial({ map: paverTex(r), vertexColors: true, roughness: 0.9 }), 2),
    bay: decal(new THREE.MeshStandardMaterial({ map: bayTex(), vertexColors: true, roughness: 0.8, emissive: 0xc8d4dc, emissiveIntensity: 0 }), 3),   // lit by the bay lights at night
    mulch: decal(new THREE.MeshStandardMaterial({ map: grainTex(r, 2600, 0.5), vertexColors: true, roughness: 1 }), 2),
    gravel: decal(new THREE.MeshStandardMaterial({ map: grainTex(r, 2600, 0.35), vertexColors: true, roughness: 0.95 }), 3),
    plant: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    grass: new THREE.MeshStandardMaterial({ map: tuftTex(r), vertexColors: true, roughness: 0.95, alphaTest: 0.5, side: THREE.DoubleSide }),
  };
  const out = finish(root, 'chdbkbakery', B, M, { shade: ['panel', 'det', 'plant'] });
  console.log(`[cherkasy] ChDBK bakery and car wash: ${(out.verts / 1000).toFixed(1)}k verts, ${out.meshes} meshes, ${S.count - n0} solids, ${parked.length} parked in ${(performance.now() - t0).toFixed(0)} ms`);

  const footprints = [
    { poly: R(...BK), h: yC - gB, kind: 'retail', name: 'Пекарня' },
    { poly: R(WX0, WZ0, WX1, WZ1), h: yE + RISE - L, kind: 'roof', name: 'Автомийка' },
  ];
  // no generated trees on the lot, the terrace or the bed, nor on the pavement in front of the bakery (open in the photos)
  const keep = [[LOT[0] - 1.5, LOT[1] - 1.5, LOT[2] + 4.5, 2408], [RX0 - 3, 2399, RX1 + 4.5, 2411]];
  return {
    footprints, parked,
    info: { floor: yF, level: L, roof: yC, eave: yE, bays: BAYS, container: [CONT[0], WZ0, CONT[1], WZ1] },
    clear: (x, z) => keep.some((q) => x > q[0] && x < q[2] && z > q[1] && z < q[3]),
    update() { const k = nightK.value; M.glow.emissiveIntensity = 1.6 * k; M.led.emissiveIntensity = 1.4 * k; M.inside.emissiveIntensity = 0.14 * k; M.poly.emissiveIntensity = 0.3 * k; M.bay.emissiveIntensity = 0.22 * k; },
  };
}
