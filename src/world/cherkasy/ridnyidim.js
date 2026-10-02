// OWNER: cherkasy. ЖК «Рідний Дім», вул. Надпільна, 222 (the five houses are Байди Вишневецького 101 and 103 in OSM):
// five ten-storey brick slabs of two sections each round a closed yard, built as the lun.ua catalogue renders show
// them (lun.ua/new/cherkasy/ridnyi-dim). Rendered walls in white, light grey, mid grey and graphite zones down each
// long front, two accent zones per section (orange on three houses, green and teal on the other two), window stacks
// with graphite spandrels, panoramic loggias framed by white slab bands and fins, a commercial ground storey on the
// west fronts (glazing between black and white piers), entrances with dark canopies on the east fronts, gable ends in
// white with segmented graphite stripes and shallow balconies, flat roofs with lift heads. In each yard two
// rubber-surfaced playgrounds with timber pergolas, a swing frame or a carousel, planters and benches, on a draped
// floor of paving and lawn that also aprons the house ends. Windows light up at night. No developer name or logo.
//   RIDNYI_SKIP: the OSM ids replaced here (buildings.js skips them)
//   buildRidnyiDim({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Every outline edge is a facade in a face frame (slabkit.js: s along the edge, y up, o outward); a long front is cut
// into colour zones, each its own sub-face. A window or loggia stack is one recessed pane the whole stack high: its
// texture holds the nine upper storeys with their own lit pattern, so a stack costs a handful of quads.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng, bboxOf } from './geo.js';
import { canvasTex, decal } from './sculpt.js';
import { face, ringFaces, at, quad, rect, box, skin, solid, finish, speckle } from './slabkit.js';

// the five houses, west to east and north to south, with their accent colour (a guess from the renders)
const HOUSES = [
  [1430800366, '#e2873a'], [1430800367, '#e2873a'], [1318431924, '#5fb547'], [973321830, '#e2873a'], [1430800368, '#2f9c86'],
];
export const RIDNYI_SKIP = new Set(HOUSES.map(([id]) => id));
const NAMES = { 1318431924: 'Байди Вишневецького, 103', 1430800368: 'Байди Вишневецького, 101' };

const GF = 3.3, FH = 3.0, NU = 9, PARA = 0.9;   // ground storey, typical storey, storeys over the ground one, parapet
const WHITE = '#ecebe7', LIGHT = '#d9d9d6', GREY = '#a3a6a9', GRAPH = '#4b4e53', BLACK = '#2a2b2e', FRAME = '#f3f3f0';
const ZC = { w: WHITE, l: LIGHT, g: GREY, d: GRAPH };
// one section's long front, left to right: [width, wall zone, content]. content: 'w' one window stack, 'ww' two,
// 'p' a panoramic loggia stack in a white frame; zone 'a' is in the house's accent colour
const SECTION = [[6.4, 'w', 'ww'], [3.2, 'a', 'w'], [4.6, 'd', 'p'], [5.6, 'g', 'ww'], [4.6, 'w', 'p'], [3.2, 'a', 'w'],
  [5.0, 'l', 'ww'], [4.6, 'd', 'p'], [3.0, 'w', 'w']];
const SEC_W = SECTION.reduce((s, z) => s + z[0], 0), DOOR = 3; // the zone with the section's entrance (east front)

// ------------------------------------------------------------------------------------------------ textures
// the stack texture: 8 columns of 64 px (4 window variants, then 4 loggia variants), NU storeys of 96 px (v = 0 at the
// first upper storey's floor). A window storey: graphite spandrel to 0.85 m, glass to 2.7 m; a loggia: glass from the
// floor to 2.75 m with a balustrade bar at 1 m. mask: the glass of the lit storeys only.
const COLS = 8, SH = 96;
const WIN = [0.85, 2.7], PANO = [0.06, 2.75];
function stackTex(mask, lit) {
  return canvasTex(64 * COLS, SH * NU, (g, w, h) => {
    g.fillStyle = mask ? '#000' : '#3b3e43'; g.fillRect(0, 0, w, h);
    for (let c = 0; c < COLS; c++) {
      const pano = c >= 4, [a, b] = pano ? PANO : WIN, x0 = c * 64;
      for (let k = 0; k < NU; k++) {
        const yb = h - (k + b / FH) * SH, ya = h - (k + a / FH) * SH; // canvas y of the glass top / bottom
        if (mask) { if (lit[c][k]) { g.fillStyle = '#fff'; g.fillRect(x0 + 3, yb, 58, ya - yb); } continue; }
        const gr = g.createLinearGradient(x0, yb, x0 + 40, ya);
        gr.addColorStop(0, '#c9d3d8'); gr.addColorStop(0.5, '#8e9ca4'); gr.addColorStop(1, '#5d6a72');
        g.fillStyle = gr; g.fillRect(x0 + 3, yb, 58, ya - yb);
        g.fillStyle = '#26272a';
        g.fillRect(x0, yb, 3, ya - yb); g.fillRect(x0 + 61, yb, 3, ya - yb); g.fillRect(x0, yb - 2, 64, 3); g.fillRect(x0, ya - 1, 64, 3);
        if (pano) {
          for (const m of [21, 42]) g.fillRect(x0 + m, yb, 2, ya - yb);
          const yr = h - (k + 1.0 / FH) * SH; g.fillRect(x0, yr - 2, 64, 3);
          g.fillStyle = 'rgba(40,44,50,0.35)'; g.fillRect(x0 + 3, yr, 58, ya - yr); // the balustrade glass
        } else { g.fillRect(x0 + 31, yb, 2, ya - yb); g.fillRect(x0, yb + (ya - yb) * 0.28, 64, 2); }
      }
    }
  }, { repeat: false, srgb: !mask });
}
// the yard floor's grain (rubber, paving, lawn by the vertex colour): fine speckle and 1 m joints, 2 m per repeat
const rubberTex = (r) => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h); // the 1 m tiles' joints
  g.fillRect(0, h / 2, w, 1); g.fillRect(w / 2, 0, 1, h);
});

// ------------------------------------------------------------------------------------------------ the build
export function buildRidnyiDim({ root, map, solids: S, zips: Z, heightAt }) {
  const houses = HOUSES.map(([id, acc]) => [map.buildings?.find((q) => q.id === id), acc]).filter(([b]) => b);
  if (!houses.length) return null;
  const t0 = performance.now(), r = rng(222), n0 = S.count;
  const B = { wall: new MB(), det: new MB(), stack: new MB(), shop: new MB(), yard: new MB(), mat: new MB() };
  const UVW = [2.5, 2.5], xz = (p) => [p[0], p[2]];
  const lit = Array.from({ length: COLS }, () => Array.from({ length: NU }, () => r() < 0.32));
  let nStack = 0;
  const footprints = [], rings = [];

  for (const [hi, [bld, ACC]] of houses.entries()) {
    const ring = ringPts(bld.p), faces = ringFaces(ring);
    rings.push(ring);
    const bb = bboxOf(ring), hs = [];
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) hs.push(heightAt(bb.x0 + (bb.x1 - bb.x0) * i / 4, bb.z0 + (bb.z1 - bb.z0) * j / 4));
    const gLo = Math.min(...hs), gHi = Math.max(...hs), yF = gHi + 0.15, Y = (h) => yF + h, gB = gLo - 0.6;
    const fy = (k) => Y(GF + (k - 1) * FH);                // floor of upper storey k (1..NU)
    const ROOF = Y(GF + NU * FH), TOP = ROOF + PARA;
    const gAt = (f, s, o) => { const p = at(f, s, 0, o); return heightAt(p[0], p[2]); };

    // a stack of NU storeys: a cut through the zone's wall, its reveals, one textured pane
    const stack = (f, s0, s1, pano) => {
      const [a, b] = pano ? PANO : WIN, y0 = fy(1) + a, y1 = fy(NU) + b, dep = 0.22, c = (pano ? 4 : 0) + ((r() * 4) | 0);
      f.cuts.push({ s0, s1, y0, y1 });
      B.det.setColor(pano ? '#d6d6d3' : '#3f4247');
      quad(B.det, at(f, s0, y0), at(f, s0, y0, -dep), at(f, s0, y1, -dep), at(f, s0, y1), f.U);
      quad(B.det, at(f, s1, y0), at(f, s1, y0, -dep), at(f, s1, y1, -dep), at(f, s1, y1), f.U.map((v) => -v));
      quad(B.det, at(f, s0, y1), at(f, s1, y1), at(f, s1, y1, -dep), at(f, s0, y1, -dep), [0, -1, 0]);
      quad(B.det, at(f, s0, y0), at(f, s1, y0), at(f, s1, y0, -dep), at(f, s0, y0, -dep), [0, 1, 0]);
      const v0 = (y0 - fy(1)) / (NU * FH), v1 = (y1 - fy(1)) / (NU * FH), u0 = c / COLS + 0.002, u1 = (c + 1) / COLS - 0.002;
      B.stack.setColor('#ffffff');
      quad(B.stack, at(f, s0, y0, -dep + 0.03), at(f, s1, y0, -dep + 0.03), at(f, s1, y1, -dep + 0.03), at(f, s0, y1, -dep + 0.03), f.N, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
      nStack++;
    };
    // the white frame of a loggia stack: fins up the sides, a slab band at every floor and a cap over the roof line
    const frame = (f, s0, s1) => {
      const o = 0.32, a = s0 - 0.16, b = s1 + 0.16;
      B.wall.setColor(FRAME);
      for (const [p, q] of [[a, s0], [s1, b]]) box(B.wall, f, p, q, fy(1) - 0.15, ROOF + 0.25, 0, o, 'flrt', UVW);
      for (let k = 1; k <= NU; k++) box(B.wall, f, s0, s1, fy(k) - 0.15, fy(k) + 0.1, 0, o, 'ftu', UVW);
      box(B.wall, f, s0, s1, ROOF - 0.2, ROOF + 0.25, 0, o, 'ftu', UVW);
      solid(S, f, a, b, 0, o, fy(1) - 0.15, ROOF + 0.25, 'wall');
    };
    // ground storey: shop glazing (lit at night), a window, or an entrance under a canopy
    const shop = (f, s0, s1) => {
      const y0 = Math.max(Y(0.15), gAt(f, (s0 + s1) / 2, 1) + 0.1), y1 = Y(GF - 0.45);
      if (y1 - y0 < 1.5 || s1 - s0 < 1) return;
      f.cuts.push({ s0, s1, y0, y1 });
      B.det.setColor(BLACK); box(B.det, f, s0, s1, y0, y1, -0.28, 0, 'lrtu');
      B.shop.setColor('#66747c');
      quad(B.shop, at(f, s0, y0, -0.24), at(f, s1, y0, -0.24), at(f, s1, y1, -0.24), at(f, s0, y1, -0.24), f.N);
      B.det.setColor(BLACK); for (let m = s0 + 1.4; m < s1 - 0.6; m += 1.4) box(B.det, f, m - 0.03, m + 0.03, y0, y1, -0.24, -0.19, 'f');
    };
    const gwin = (f, s0, s1) => {
      const y0 = Math.max(Y(0.6), gAt(f, (s0 + s1) / 2, 1) + 0.4), y1 = Y(GF - 0.35);
      if (y1 - y0 < 0.8) return;
      f.cuts.push({ s0, s1, y0, y1 });
      B.det.setColor('#3f4247'); box(B.det, f, s0, s1, y0, y1, -0.22, 0, 'lrtu');
      B.det.setColor('#56636b'); rect(B.det, f, s0, s1, y0, y1, -0.19);
    };
    const entry = (f, m) => {
      const s0 = m - 1.0, s1 = m + 1.0, y0 = Y(0), y1 = Y(2.6);
      f.cuts.push({ s0, s1, y0, y1 });
      B.det.setColor(BLACK); box(B.det, f, s0, s1, y0, y1, -0.3, 0, 'lrt');
      B.shop.setColor('#7e898e'); quad(B.shop, at(f, s0, y0, -0.25), at(f, s1, y0, -0.25), at(f, s1, y1, -0.25), at(f, s0, y1, -0.25), f.N);
      B.det.setColor(BLACK); box(B.det, f, m - 2.0, m + 2.0, Y(2.85), Y(3.1), 0, 1.6, 'ftlru'); // canopy
      solid(S, f, m - 2.0, m + 2.0, 0, 1.6, Y(2.85), Y(3.1), 'awning', 1);
      const g = Math.min(gAt(f, m, 2.5), yF - 0.05), n = Math.max(1, Math.round((yF - g) / 0.16));
      for (let i = 0; i < n; i++) { B.det.setColor(i % 2 ? '#b9b8b3' : '#aeada8'); box(B.det, f, m - 1.8 + 0.2 * i, m + 1.8 - 0.2 * i, gB, yF - (yF - g) * i / n, 0, 1.6 + 0.3 * i, 'ftlr'); }
      solid(S, f, m - 1.8, m + 1.8, 0, 1.6 + 0.3 * n, gB, yF, 'step');
    };
    const parapet = (f, col) => {
      B.wall.setColor(col); rect(B.wall, f, 0, f.L, ROOF, TOP, -0.3, UVW, f.N.map((v) => -v));
      B.det.setColor('#c9c9c5'); box(B.det, f, -0.02, f.L + 0.02, TOP, TOP + 0.07, -0.32, 0.04, 'ftlr');
      B.det.setColor('#9c9d9e'); box(B.det, f, 0, f.L, gB, Y(0.12), 0, 0.05, 'ft');               // plinth
      if (Z && f.L > 3) { const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], TOP, f.nx, f.nz); }
    };

    for (const f of faces) {
      if (f.L > 30) {
        // a long front: two sections of colour zones; the west front has the shops, the east one the entrances
        const shops = f.nx < 0, k = f.L / 2 / SEC_W, back = f.nx > 0;
        const zones = [];
        for (const sec of [0, 1]) {
          let s = sec * f.L / 2;
          const seq = SECTION.map((z, i) => [...z, i]), rot = (hi * 2 + sec * 4) % seq.length;
          seq.push(...seq.splice(0, rot));                // each house and section starts the sequence elsewhere
          for (const [w, zc, what, i] of (back ? seq.reverse() : seq)) { zones.push([s, s + w * k, zc, what, i === DOOR]); s += w * k; }
        }
        for (const [s0, s1, zc, what, door] of zones) {
          const zf = face(xz(at(f, s0, 0)), xz(at(f, s1, 0)), f.nx, f.nz), w = zf.L, m = w / 2;
          if (what === 'ww') { stack(zf, w * 0.27 - 0.75, w * 0.27 + 0.75, false); stack(zf, w * 0.73 - 0.75, w * 0.73 + 0.75, false); }
          else if (what === 'w') stack(zf, m - 0.75, m + 0.75, false);
          else if (what === 'p') { stack(zf, m - 1.5, m + 1.5, true); frame(zf, m - 1.5, m + 1.5); }
          const upper = zf.cuts.slice();
          // the ground storey: shop glazing on the west front; windows under the stacks on the east one, or the
          // section's entrance in its middle zone
          {
            if (shops) shop(zf, 0.55, w - 0.55);
            else if (door) entry(zf, m);
            else for (const q of upper) gwin(zf, Math.max(0.5, q.s0 - (q.s1 - q.s0 > 2 ? 0 : 0.3)), Math.min(w - 0.5, q.s1 + (q.s1 - q.s0 > 2 ? 0 : 0.3)));
          }
          // the walls: the ground band in white, then the zone's colour
          const gCuts = zf.cuts.filter((q) => !upper.includes(q)), uCuts = upper;
          skin(B.wall, { ...zf, cuts: gCuts }, gB, Y(GF), WHITE, UVW);
          skin(B.wall, { ...zf, cuts: uCuts }, Y(GF), TOP, zc === 'a' ? ACC : ZC[zc], UVW);
          B.det.setColor(BLACK); box(B.det, zf, -0.45, 0.45, gB, Y(GF), 0, 0.06, 'flr');                 // the black pier
          B.det.setColor('#3f4247'); box(B.det, zf, 0, w, Y(GF) - 0.05, Y(GF) + 0.12, 0, 0.12, 'ftu');  // first-floor band
        }
        parapet(f, WHITE);
      } else {
        // a gable end: white, graphite stripes standing proud in three-storey lengths, a stack of shallow balconies
        // each side
        const L = f.L, st = [[L * 0.4 - 0.5, L * 0.4 + 0.5], [L * 0.6 - 0.5, L * 0.6 + 0.5]];
        const bal = [[2.0, 4.4], [L - 4.4, L - 2.0]];
        for (const [a, b] of bal) stack(f, a, b, true);
        for (const [a, b] of bal) gwin(f, a + 0.3, b - 0.3);
        skin(B.wall, f, gB, TOP, WHITE, UVW);
        B.wall.setColor(GRAPH);
        for (const [a, b] of st) for (let k = 1; k <= NU; k += 3) box(B.wall, f, a, b, fy(k) + 0.35, Math.min(fy(k + 3) - 0.35, TOP + 0.3), 0, 0.15, 'flrtu', UVW);
        for (const [a, b] of bal) {
          for (let k = 1; k <= NU; k++) {
            const y = fy(k);
            B.det.setColor('#cfcfcb'); box(B.det, f, a - 0.2, b + 0.2, y - 0.12, y, 0, 0.5, 'ftlru');
            B.det.setColor('#2c2e31'); box(B.det, f, a - 0.2, b + 0.2, y, y + 1.05, 0.46, 0.5, 'ftlr');   // the railing
          }
          solid(S, f, a - 0.2, b + 0.2, 0, 0.5, fy(1) - 0.2, fy(NU) + 1.05, 'wall');
        }
        B.det.setColor(BLACK); box(B.det, f, 0, L, Y(GF) - 0.05, Y(GF) + 0.12, 0, 0.12, 'ftu');
        parapet(f, WHITE);
      }
    }

    // the roof, a lift head over each section
    B.det.setColor('#5d5e60'); B.det.fill(ring, [], ROOF + 0.02, true);
    const lf = faces.filter((f) => f.L > 30)[0];
    if (lf) for (const sec of [0.25, 0.75]) {
      const c = at(lf, lf.L * sec, 0), w = 5.0, d = 4.2;
      const cx = c[0] - lf.nx * 7.6, cz = c[2] - lf.nz * 7.6;
      const hr = [[cx - lf.ux * w / 2 - lf.nx * d / 2, cz - lf.uz * w / 2 - lf.nz * d / 2], [cx + lf.ux * w / 2 - lf.nx * d / 2, cz + lf.uz * w / 2 - lf.nz * d / 2],
        [cx + lf.ux * w / 2 + lf.nx * d / 2, cz + lf.uz * w / 2 + lf.nz * d / 2], [cx - lf.ux * w / 2 + lf.nx * d / 2, cz - lf.uz * w / 2 + lf.nz * d / 2]];
      for (const f of ringFaces(hr)) { B.wall.setColor(LIGHT); rect(B.wall, f, 0, f.L, ROOF, ROOF + 3.0, 0, UVW); B.det.setColor('#8b8c8e'); box(B.det, f, -0.05, f.L + 0.05, ROOF + 3.0, ROOF + 3.12, -0.1, 0.06, 'ft'); }
      B.det.setColor('#6a6b6d'); B.det.fill(hr, [], ROOF + 3.1, true);
      S.prism(hr.flat(), ROOF, ROOF + 3.1, 0, 0, 'equipment');
    }
    S.prism(ring.flat(), gB, TOP, 0, 0, 'wall');
    footprints.push({ poly: ring, h: TOP - gLo, kind: 'apt', name: NAMES[bld.id] ?? 'ЖК «Рідний Дім»' });
  }

  // ---- the yards: in the gap between each pair of neighbouring houses, two rubber-surfaced playgrounds, each with a
  // pair of timber pergolas and a swing frame or a carousel, paved walks along the houses and round the playgrounds,
  // lawn between, raised planters with benches down both sides
  const yards = [], pads = [];
  for (let i = 0; i < rings.length; i++) for (let j = 0; j < rings.length; j++) {
    const a = bboxOf(rings[i]), b = bboxOf(rings[j]);
    const gap = b.x0 - a.x1, z0 = Math.max(a.z0, b.z0), z1 = Math.min(a.z1, b.z1);
    if (gap > 20 && gap < 45 && z1 - z0 > 50) yards.push([a.x1, b.x0, z0, z1]);
  }
  const D = B.yard, PH = 7.5, EXT = 5.5;          // EXT: paving past the house ends (the rows stand 13 m apart)
  const g = (x, z) => heightAt(x, z) + 0.15;
  const cell = (x0, x1, z0, z1, col) => {
    B.mat.setColor(col);
    const v = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => B.mat.vert(x, g(x, z), z, 0, 1, 0, x / 2, z / 2));
    B.mat.quad(v[0], v[3], v[2], v[1]);
  };
  // the aprons at the house ends
  for (const ring of rings) {
    const b = bboxOf(ring), n = Math.round((b.x1 - b.x0) / 2.6);
    for (let i = 0; i < n; i++) for (const [z0, z1] of [[b.z0 - EXT, b.z0], [b.z1, b.z1 + EXT]]) for (let j = 0; j < 2; j++) {
      cell(b.x0 + (b.x1 - b.x0) * i / n, b.x0 + (b.x1 - b.x0) * (i + 1) / n, z0 + (z1 - z0) * j / 2, z0 + (z1 - z0) * (j + 1) / 2, '#bdb7ab');
    }
  }
  for (const [yx0, yx1, yz0, yz1] of yards) {
    const cx = (yx0 + yx1) / 2, hw = Math.min(8, (yx1 - yx0) / 2 - 6), mine = [0.3, 0.72].map((t) => [cx, yz0 + (yz1 - yz0) * t, hw]);
    pads.push(...mine);
    // the floor, draped over the ground in cells (decal-biased)
    const Z0 = yz0 - EXT, Z1 = yz1 + EXT, NX = Math.round((yx1 - yx0) / 2.6), NZ = Math.round((Z1 - Z0) / 3.0);
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      const x0 = yx0 + (yx1 - yx0) * i / NX, x1 = yx0 + (yx1 - yx0) * (i + 1) / NX, z0 = Z0 + (Z1 - Z0) * j / NZ, z1 = Z0 + (Z1 - Z0) * (j + 1) / NZ;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const pad = mine.some(([px, pz]) => Math.abs(mx - px) < hw && Math.abs(mz - pz) < PH);
      const walk = i === 0 || i === NX - 1 || mz < yz0 + 1.5 || mz > yz1 - 1.5 || mine.some(([px, pz]) => Math.abs(mx - px) < hw + 2.6 && Math.abs(mz - pz) < PH + 2.5);
      cell(x0, x1, z0, z1, pad ? '#b2514a' : walk ? '#bdb7ab' : '#62803f');
    }
    for (const [k, [px0, pz0]] of mine.entries()) {
      // pergolas at two corners: four posts, a slatted back and roof, a bench inside
      for (const [px, pz, sg] of [[px0 - hw + 2.0, pz0 - PH + 2.0, 1], [px0 + hw - 2.0, pz0 + PH - 2.0, -1]]) {
        const y0 = heightAt(px, pz), H = 2.7, W = 1.6, Dp = 1.5, bx = px - sg * W;
        D.setColor('#8a5a36');
        for (const [ox, oz] of [[-W, -Dp], [W, -Dp], [-W, Dp], [W, Dp]]) D.box(px + ox - 0.07, y0 - 0.3, pz + oz - 0.07, px + ox + 0.07, y0 + H, pz + oz + 0.07);
        for (let s = -W; s <= W + 1e-6; s += 0.32) D.box(px + s - 0.04, y0 + H - 0.12, pz - Dp - 0.1, px + s + 0.04, y0 + H, pz + Dp + 0.1);
        for (let s = -Dp; s <= Dp + 1e-6; s += 0.25) D.box(bx - 0.05, y0 + 0.2, pz + s - 0.04, bx + 0.05, y0 + H - 0.12, pz + s + 0.04, 1 | 2 | 16 | 32);
        D.setColor('#a8774c'); D.box(Math.min(bx, bx + sg * 0.5), y0 + 0.42, pz - Dp + 0.2, Math.max(bx, bx + sg * 0.5), y0 + 0.5, pz + Dp - 0.2);
        S.prism([px - W - 0.1, pz - Dp - 0.1, px + W + 0.1, pz - Dp - 0.1, px + W + 0.1, pz + Dp + 0.1, px - W - 0.1, pz + Dp + 0.1], y0 + H - 0.15, y0 + H, 0, 0, 'awning', 1);
        S.prism([bx - 0.1, pz - Dp - 0.1, bx + 0.1, pz - Dp - 0.1, bx + 0.1, pz + Dp + 0.1, bx - 0.1, pz + Dp + 0.1], y0 - 0.3, y0 + H, 0, 0, 'wall');
      }
      const y0 = heightAt(px0, pz0);
      if (k === 0) { // the swing frame: two A-legs and a beam, two seats
        const H = 2.5;
        D.setColor('#2f3134');
        for (const s of [-1.8, 1.8]) for (const d of [-0.9, 0.9]) D.tube([px0 + d, y0 - 0.2, pz0 + s], [px0, y0 + H, pz0 + s], 0.05, 5);
        D.tube([px0, y0 + H, pz0 - 1.9], [px0, y0 + H, pz0 + 1.9], 0.06, 5);
        for (const s of [-0.8, 0.8]) {
          D.setColor('#6b6d70'); for (const e of [-0.25, 0.25]) D.tube([px0, y0 + H, pz0 + s + e], [px0, y0 + 0.5, pz0 + s + e], 0.012, 3);
          D.setColor('#1f1f20'); D.box(px0 - 0.2, y0 + 0.45, pz0 + s - 0.28, px0 + 0.2, y0 + 0.52, pz0 + s + 0.28);
        }
        for (const s of [-1.8, 1.8]) S.prism([px0 - 1, pz0 + s - 0.1, px0 + 1, pz0 + s - 0.1, px0 + 1, pz0 + s + 0.1, px0 - 1, pz0 + s + 0.1], y0 - 0.2, y0 + H, 0, 0, 'pole');
      } else { // a carousel disc with its rail and a spring rider
        D.setColor('#d8d4c8'); D.cyl(px0, y0 + 0.1, pz0, 1.2, 1.2, 0.12, 14);
        D.setColor('#2f3134'); D.cyl(px0, y0 + 0.22, pz0, 0.06, 0.06, 0.9, 6); D.tube([px0 - 0.9, y0 + 0.9, pz0], [px0 + 0.9, y0 + 0.9, pz0], 0.03, 4); D.tube([px0, y0 + 0.9, pz0 - 0.9], [px0, y0 + 0.9, pz0 + 0.9], 0.03, 4);
        D.setColor('#e0b33c'); D.box(px0 + 3.0, y0 + 0.4, pz0 - 0.2, px0 + 3.7, y0 + 0.8, pz0 + 0.2); D.setColor('#2f3134'); D.cyl(px0 + 3.35, y0, pz0, 0.05, 0.05, 0.45, 5);
      }
    }
    // raised planters with grass along both sides of the lawn, a bench on each
    for (const sg of [-1, 1]) for (const t of [0.12, 0.51, 0.9]) {
      const px = cx + sg * (hw + 4.2), pz = yz0 + (yz1 - yz0) * t, y0 = heightAt(px, pz), L = 4.5;
      D.setColor('#9fa09c'); D.box(px - 0.6, y0 - 0.3, pz - L, px + 0.6, y0 + 0.5, pz + L, 1 | 2 | 16 | 32);
      D.setColor('#4f7a37'); D.box(px - 0.55, y0 + 0.3, pz - L + 0.05, px + 0.55, y0 + 0.62, pz + L - 0.05, 4);
      const bx = px - sg * 0.6;
      D.setColor('#a8774c'); D.box(Math.min(bx, bx - sg * 0.45), y0 + 0.5, pz - L + 1, Math.max(bx, bx - sg * 0.45), y0 + 0.56, pz + L - 1);
      S.prism([px - 0.6, pz - L, px + 0.6, pz - L, px + 0.6, pz + L, px - 0.6, pz + L], y0 - 0.3, y0 + 0.55, 0, 0, 'wall');
    }
  }

  const tex = stackTex(false, lit), mask = stackTex(true, lit), rub = rubberTex(r);
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: speckle(r), vertexColors: true, roughness: 0.88 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    stack: new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.2, metalness: 0.25, emissive: new THREE.Color('#ffd5a0'), emissiveMap: mask, emissiveIntensity: 0 }),
    shop: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.3, emissive: new THREE.Color('#ffe2b8'), emissiveIntensity: 0 }),
    yard: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    mat: decal(new THREE.MeshStandardMaterial({ map: rub, vertexColors: true, roughness: 0.95 }), 3),
  };
  const out = finish(root, 'ridnyidim', B, M, { shade: ['wall', 'det', 'yard'] });
  console.log(`[cherkasy] ЖК Рідний Дім: ${houses.length} houses, ${nStack} stacks, ${pads.length} playgrounds, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const boxes = rings.map(bboxOf);
  return {
    footprints,
    // generated trees keep 3 m off the houses (their balconies and canopies) and off the playgrounds
    clear: (x, z) => boxes.some((b) => x > b.x0 - 3 && x < b.x1 + 3 && z > b.z0 - EXT && z < b.z1 + EXT)
      || pads.some(([cx, cz, hw]) => Math.abs(x - cx) < hw + 2.6 && Math.abs(z - cz) < PH + 2.5),
    update() { const k = nightK.value; M.stack.emissiveIntensity = 1.0 * k; M.shop.emissiveIntensity = 0.9 * k; },
  };
}
