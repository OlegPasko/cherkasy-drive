// OWNER: cherkasy. ЖК «Перлина Дніпра», вул. Героїв Дніпра, 77 (Mytnytsia): a 17-storey brick block of two sections
// on an L plan, under construction (completion 2028), built as its renders show (lun.ua/new/cherkasy/perlyna-dnipra).
// It stands on the empty lot west of Героїв Дніпра between the curved ten-storey block (OSM 118297731) and the long one
// south of it (129423485); OSM has no footprint yet, so the outline is placed here from the catalogue's site plan
// (zoom 17, matched to those two neighbours): one wing along the street (19 x 55 m), the other running west from its
// north end (20 x 64 m), the courtyard south-west of the corner.
// From the newer renders: a commercial ground storey in dark graphite with big shop windows (street side and the ends)
// and the lobbies with canopies on the courtyard; five more graphite storeys over it, then beige render between
// graphite piers up to the roof; pairs of thin red bands round the whole block at three heights; panoramic loggias
// (floor-to-ceiling glazing) alternating with narrow windows over AC baskets; the long faces step out every other four
// bays; graphite corner piers and parapet, two
// lift heads on the roof. A playground in the courtyard. No names or logos.
//   PERLYNA_SKIP: none (the building is new: buildings.js has nothing to skip)
//   PERLYNA_LOCAL: { O, A, B } the site frame: map point = O + a * A + b * B (A along the street, south-south-east;
//     B square to it, away from the street); PERLYNA_OUTLINE: the outline in (a, b); toMap(a, b) -> [x, z]
//   levelPerlyna(hf): levels the lot (the block and the playground; the DEM falls ~4 m from the west end to the street)
//     before the ground is built (city.js); returns the level
//   buildPerlyna({ root, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints }
//     places.js PERLYNA_RING repeats the outline for the maps (tests/perlyna.test.mjs keeps them in step).
// The upper storeys are flat walls carrying a tiling facade texture (4 bays x 6 storeys, with an emissive twin for the
// lit windows at night and a roughness twin for the glass); the ground storey has real openings (slabkit.js).
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { rng, area2 } from './geo.js';
import { canvasTex } from './sculpt.js';
import { ringFaces, at, quad, rect, box, skin, hole, solid, finish, speckle } from './slabkit.js';

export const PERLYNA_SKIP = new Set();

// the street's centreline (Героїв Дніпра) passes O heading A; the lot lies on the +B side
const O = [838, 950.8], A = [-0.5402, 0.8415], B = [-0.8415, -0.5402];
export const PERLYNA_LOCAL = { O, A, B };
export const toMap = (a, b) => [O[0] + a * A[0] + b * B[0], O[1] + a * A[1] + b * B[1]];
const toLocal = (x, z) => { const dx = x - O[0], dz = z - O[1]; return [dx * A[0] + dz * A[1], dx * B[0] + dz * B[1]]; };
// north face a = 3.5, street face b = 27, the west end b = 91, the courtyard faces a = 24 / b = 46, the south end a = 58 (the
// driveway to the next block runs past it at a = 65)
export const PERLYNA_OUTLINE = [[3.5, 27], [3.5, 91], [24, 91], [24, 46], [58, 46], [58, 27]];
const INNER = [24, 46]; // the concave corner
const SECTIONS = [{ a: 31.5, b: 36.5, w: 7.5, d: 5.5 }, { a: 13.5, b: 71, w: 7.5, d: 5.5 }]; // lift heads (centre, size)

// the block with the courtyard's playground, levelled; the 16 m blend stops short of the street's kerb (b = 4)
export const levelPerlyna = (hf) => hf.pad([[2, 25], [2, 93], [26, 93], [26, 76], [51, 76], [51, 48], [60, 48], [60, 25]].map(([a, b]) => toMap(a, b)), 16);

const GF = 4.5, FH = 3.3, NF = 17, PARA = 1.3, LOW = 5;  // ground storey, storey, storeys, parapet, graphite storeys over the ground one
const BAY = 3.6, TB = 4, TF = 6, PJ = 0.7;               // bay; the texture tile: bays x storeys; projection depth
const GRAPH = '#505157', DGRAPH = '#3a3b40', BEIGE = '#d4c0ad', RED = '#c8281f', ROOFC = '#6e6c68';
const RED_AT = [LOW, LOW + 1, 10, 11, 14, 15];           // red bands at the floor lines over storey k (1 = the first upper storey)

// the facade tile: 4 bays x 6 storeys; canvas v runs up (flipY), bay 128 px, storey 128 px
function tiles(r) {
  const W = 128 * TB, H = 128 * TF, px = (m) => (m / BAY) * 128, py = (m) => (m / FH) * 128;
  const lit = [];
  for (let f = 0; f < TF; f++) for (let c = 0; c < TB; c++) lit.push(r() < 0.3 ? 0.45 + r() * 0.4 : 0);
  // glass rectangles of one storey: [x0, x1, y0, y1] in metres within the bay / storey
  const glassOf = (c) => (c % 2 ? [[1.0, 2.6, 0.9, 2.75]] : [[0.35, 3.25, 0.15, 2.85]]);
  const each = (fn) => { for (let f = 0; f < TF; f++) for (let c = 0; c < TB; c++) fn(f, c, c * 128, H - (f + 1) * 128); };
  const paint = (wall, piers) => canvasTex(W, H, (g) => {
    g.fillStyle = wall; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2500; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; g.fillRect(r() * W, r() * H, 2, 2); }
    if (piers) { g.fillStyle = GRAPH; for (let c = 0; c < TB; c += 2) { g.fillRect(c * 128, 0, px(0.2), H); g.fillRect(c * 128 + 256 - px(0.2), 0, px(0.2), H); } }
    each((f, c, x, y) => {
      g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x, y + 128 - py(0.22), 128, py(0.22)); // the slab line
      for (const [x0, x1, y0, y1] of glassOf(c)) {
        const X = x + px(x0), Y = y + 128 - py(y1), w = px(x1 - x0), h = py(y1 - y0);
        g.fillStyle = piers ? '#e8e5df' : '#9a9a9e'; g.fillRect(X - 2, Y - 2, w + 4, h + 4);              // the frame
        const gr = g.createLinearGradient(0, Y, 0, Y + h); gr.addColorStop(0, '#a3b1bb'); gr.addColorStop(1, '#5a6873');
        g.fillStyle = gr; g.fillRect(X, Y, w, h);
        g.fillStyle = piers ? '#e8e5df' : '#9a9a9e';
        const n = c % 2 ? 1 : 3;
        for (let i = 1; i <= n; i++) g.fillRect(X + (w * i) / (n + 1) - 1.5, Y, 3, h);  // mullions
        if (!(c % 2)) g.fillRect(X, Y + h - py(1.0), w, 3);                              // the loggia rail
      }
      if (c % 2) { // the AC basket under the narrow window
        g.fillStyle = '#4a4b50'; g.fillRect(x + px(1.25), y + 128 - py(0.75), px(1.1), py(0.5));
        g.fillStyle = '#5f6066'; for (let i = 0; i < 6; i++) g.fillRect(x + px(1.25) + 4 + i * 7, y + 128 - py(0.73), 2, py(0.45));
      }
    });
  });
  const upper = paint(BEIGE, true), lower = paint(GRAPH, false);
  const glow = canvasTex(W, H, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    each((f, c, x, y) => {
      const k = lit[f * TB + c]; if (!k) return;
      for (const [x0, x1, y0, y1] of glassOf(c)) {
        const X = x + px(x0), Y = y + 128 - py(y1), w = px(x1 - x0), h = py(y1 - y0);
        const warm = r() < 0.88 ? [255, 210, 150] : [220, 228, 240];
        g.fillStyle = `rgb(${warm.map((v) => Math.round(v * k)).join(',')})`; g.fillRect(X, Y, w, h);
        if (!(c % 2) && r() < 0.6) { g.fillStyle = '#000'; g.fillRect(X + w * (0.5 + r() * 0.3), Y, w * 0.25, h); } // a drawn curtain
      }
    });
  });
  const rough = canvasTex(W, H, (g) => {
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, W, H);
    each((f, c, x, y) => { for (const [x0, x1, y0, y1] of glassOf(c)) { g.fillStyle = '#262626'; g.fillRect(x + px(x0), y + 128 - py(y1), px(x1 - x0), py(y1 - y0)); } });
  }, { srgb: false });
  return { upper, lower, glow, rough };
}

export function buildPerlyna({ root, solids: S, zips: Z, heightAt }) {
  const t0 = performance.now(), r = rng(7707), n0 = S.count;
  const ring = PERLYNA_OUTLINE.map(([a, b]) => toMap(a, b));
  const faces = ringFaces(ring);
  const samp = [];
  for (const [a, b] of [[3.5, 27], [3.5, 59], [3.5, 91], [24, 91], [24, 46], [58, 46], [58, 27], [32, 27], [14, 40], [14, 70], [42, 36]]) samp.push(heightAt(...toMap(a, b)));
  const gLo = Math.min(...samp), gHi = Math.max(...samp);
  const yF = gHi + 0.3, Y = (h) => yF + h, gB = gLo - 0.6;
  const yU = Y(GF), ROOF = Y(GF + (NF - 1) * FH), TOP = ROOF + PARA, fl = (k) => yU + (k - 1) * FH; // floor line under upper storey k
  const yLow = fl(LOW + 1);
  const Bd = { wall: new MB(), det: new MB(), lit: new MB(), glass: new MB(), up: new MB(), low: new MB() };
  const D = Bd.det, W = Bd.wall, UVW = [2.5, 2.5];
  const isInner = (p) => Math.hypot(p[0] - toMap(...INNER)[0], p[2] - toMap(...INNER)[1]) < 0.2;
  let nOpen = 0;

  for (const f of faces) {
    const nb = Math.max(1, Math.round(f.L / BAY)), bay = f.L / nb;
    const [la, lb] = toLocal(...[0, 2].map((i) => at(f, f.L / 2, 0)[i]));
    const court = Math.abs(la - INNER[0]) < 0.5 || Math.abs(lb - INNER[1]) < 0.5; // the two courtyard faces
    const inner0 = isInner(at(f, 0, 0)), inner1 = isInner(at(f, f.L, 0));
    // ---- the textured upper storeys: graphite tile up to yLow, beige over it, the tile offset per face
    const u0 = (r() < 0.5 ? 0 : 0.5), v0 = ((r() * TF) | 0) / TF;
    const U = (s) => u0 + s / (TB * bay), V = (y) => v0 + (y - yU) / (TF * FH);
    const tq = (Dm, y0, y1, s0 = 0, s1 = f.L, o = 0) => quad(Dm, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), f.N,
      [[U(s0), V(y0)], [U(s1), V(y0)], [U(s1), V(y1)], [U(s0), V(y1)]]);
    tq(Bd.low, yU, yLow); tq(Bd.up, yLow, ROOF);
    // the long faces step: every other group of four bays stands PJ proud, full height, with graphite returns
    const proj = [];
    if (nb >= 10) for (let g = 1; (g + 1) * 4 <= nb - 1; g += 2) proj.push([g * 4 * bay, (g + 1) * 4 * bay]);
    for (const [s0, s1] of proj) {
      tq(Bd.low, yU, yLow, s0, s1, PJ); tq(Bd.up, yLow, ROOF, s0, s1, PJ);
      D.setColor(GRAPH); box(D, f, s0 - 0.12, s1 + 0.12, yU - 0.45, TOP, 0, PJ, 'lr'); box(D, f, s0 - 0.12, s1 + 0.12, yU - 0.45, yU, 0, PJ, 'fu'); box(D, f, s0 - 0.12, s1 + 0.12, ROOF, TOP, 0, PJ + 0.01, 'ft');
      box(D, f, s0 - 0.12, s0 + 0.18, yU, ROOF, 0, PJ + 0.08, 'flr'); box(D, f, s1 - 0.18, s1 + 0.12, yU, ROOF, 0, PJ + 0.08, 'flr');
      D.setColor(RED); for (const k of RED_AT) box(D, f, s0 - 0.12, s1 + 0.12, fl(k) - 0.3, fl(k) + 0.02, PJ, PJ + 0.12, 'ftulr');
      solid(S, f, s0 - 0.12, s1 + 0.12, 0, PJ + 0.08, yU - 0.45, TOP);
    }
    // ---- the ground storey: shop windows outside, the lobbies and a few windows on the courtyard
    for (let i = 0; i < nb; i++) {
      const m = (i + 0.5) * bay;
      if ((inner0 && m < 2) || (inner1 && m > f.L - 2)) continue;
      if (court) {
        const door = i % 4 === 1;
        f.cuts.push(door
          ? { s0: m - 1.0, s1: m + 1.0, y0: Y(0), y1: Y(2.7), glass: '#3a4148', lit: true, frame: '#202124', rev: GRAPH, dep: 0.3, pitch: 1.0, tr: Y(2.2), door: true, lobby: true }
          : { s0: m - 0.8, s1: m + 0.8, y0: Y(1.0), y1: Y(3.0), glass: '#46525c', lit: r() < 0.4, frame: '#202124', rev: GRAPH, dep: 0.25, pitch: 0.8 });
      } else {
        f.cuts.push({ s0: m - bay / 2 + 0.35, s1: m + bay / 2 - 0.35, y0: Y(0.25), y1: Y(GF - 0.75), glass: '#3d4850', lit: true, frame: '#1e1f22', rev: GRAPH, dep: 0.3, pitch: 1.2, tr: Y(GF - 1.6) });
      }
    }
    f.cuts = f.cuts.filter((q) => q.s0 > 0.95 && q.s1 < f.L - 0.95);
    nOpen += f.cuts.length;
    skin(W, f, gB, yU, GRAPH, UVW);
    for (const q of f.cuts) {
      hole(Bd, f, q);
      if (q.lobby) { // a canopy over the lobby door
        D.setColor(DGRAPH); box(D, f, q.s0 - 0.8, q.s1 + 0.8, Y(3.0), Y(3.25), 0, 1.6, 'ftlru');
        const p = at(f, (q.s0 + q.s1) / 2, Y(3.0), 1.2); Bd.lit.setColor('#fff3dc'); Bd.lit.box(p[0] - 0.25, p[1] - 0.04, p[2] - 0.25, p[0] + 0.25, p[1], p[2] + 0.25, 8);
      }
    }
    // the stone plinth, the slab over the shops, the corner piers, the red bands, the parapet
    D.setColor('#55565a'); box(D, f, -0.02, f.L + 0.02, gB, Y(0.25), 0, 0.08, 'ft');
    if (!court) { D.setColor(DGRAPH); box(D, f, inner0 ? 0 : -0.9, f.L + (inner1 ? 0 : 0.9), yU - 0.45, yU, 0, 0.9, 'ftu'); }
    D.setColor(GRAPH);
    if (!inner0) box(D, f, 0, 0.9, yU, TOP, 0, 0.14, 'ftl');
    if (!inner1) box(D, f, f.L - 0.9, f.L, yU, TOP, 0, 0.14, 'ftr');
    D.setColor(RED);
    for (const k of RED_AT) box(D, f, inner0 ? -0.12 : -0.14, f.L + (inner1 ? 0.12 : 0.14), fl(k) - 0.3, fl(k) + 0.02, 0, 0.12, 'ftu');
    W.setColor(GRAPH); rect(W, f, 0, f.L, ROOF, TOP, 0, UVW);
    W.setColor('#4a4b50'); rect(W, f, 0, f.L, ROOF, TOP, -0.3, null, [-f.nx, 0, -f.nz]);
    D.setColor('#5a5b60'); box(D, f, inner0 ? 0.3 : -0.16, f.L + (inner1 ? -0.3 : 0.16), TOP, TOP + 0.1, -0.32, 0.16, 'ft');
    if (f.L > 3) { const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], TOP, f.nx, f.nz); }
  }

  // ---- the roof deck and the two lift heads
  D.setColor(ROOFC); D.fill(ring, [], ROOF + 0.02, true);
  const yaw = Math.atan2(-A[1], A[0]); // local +x -> A
  for (const s of SECTIONS) {
    const [x, z] = toMap(s.a, s.b);
    W.setColor(GRAPH); W.with(M4(x, ROOF, z, yaw), (m) => m.box(-s.w / 2, 0, -s.d / 2, s.w / 2, 3.4, s.d / 2, 1 | 2 | 4 | 16 | 32));
    D.setColor('#5a5b60'); D.with(M4(x, ROOF, z, yaw), (m) => m.box(-s.w / 2 - 0.1, 3.4, -s.d / 2 - 0.1, s.w / 2 + 0.1, 3.55, s.d / 2 + 0.1, 63));
    const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => toMap(s.a + i * s.w / 2, s.b + j * s.d / 2));
    S.prism(P.flat(), ROOF, ROOF + 3.55, 0, 0, 'equipment');
  }
  S.prism((area2(ring) < 0 ? [...ring].reverse() : ring).flat(), gB, TOP, 0, 0, 'wall');

  // ---- the courtyard playground: red rubber, a play tower with a slide, swings, benches
  {
    const [pa, pb, pw, pd] = [40, 64, 16, 18];  // centre and size in (a, b)
    const c = toMap(pa, pb), gy = heightAt(...c) + 0.12, Ly = (a, b, y = 0) => { const [x, z] = toMap(a, b); return [x, gy + y, z]; };
    const pad = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => toMap(pa + i * pw / 2, pb + j * pd / 2));
    // the rendered ground sits ~0.15 m over the height field
    D.setColor('#a8402f'); D.fill(pad, [], gy + 0.08, true); D.setColor('#8c8a86'); D.extrude(pad, [], gy - 0.3, gy + 0.11, { top: false, sides: true });
    D.setColor('#6d6e70');
    for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = Ly(pa + i * (pw / 2 + 0.1), pb + j * (pd / 2 + 0.1)); D.cyl(p[0], gy, p[2], 0.04, 0.04, 0.6, 5); }
    // the tower: four posts, a deck, a pitched roof, a slide
    const T = [pa - 3, pb - 3];
    D.with(M4(...Ly(...T), yaw), (m) => {
      m.setColor('#e7b43b'); for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) m.box(x - 0.08, 0, z - 0.08, x + 0.08, 3.0, z + 0.08);
      m.setColor('#8a5a34'); m.box(-1.1, 1.3, -1.1, 1.1, 1.42, 1.1);
      m.setColor('#2f7fc1'); m.face([[-1.25, 3.0, -1.25], [1.25, 3.0, -1.25], [0, 3.9, -1.25]]); m.face([[1.25, 3.0, 1.25], [-1.25, 3.0, 1.25], [0, 3.9, 1.25]]);
      m.face([[-1.25, 3.0, -1.25], [0, 3.9, -1.25], [0, 3.9, 1.25], [-1.25, 3.0, 1.25]]); m.face([[1.25, 3.0, 1.25], [0, 3.9, 1.25], [0, 3.9, -1.25], [1.25, 3.0, -1.25]]);
      m.setColor('#e04a3a'); m.face([[1.1, 1.42, -0.45], [3.9, 0.3, -0.45], [3.9, 0.3, 0.45], [1.1, 1.42, 0.45]], [0.37, 0.93, 0]);
      m.box(1.1, 0.8, -0.5, 3.9, 0.95, -0.45); m.box(1.1, 0.8, 0.45, 3.9, 0.95, 0.5);
    });
    S.prism([[-1.2, -1.2], [1.2, -1.2], [1.2, 1.2], [-1.2, 1.2]].map(([i, j]) => toMap(T[0] + i, T[1] + j)).flat(), gy, gy + 3.9, 0, 0, 'equipment');
    // swings: an A-frame bar with two seats
    D.with(M4(...Ly(pa + 3.5, pb + 2), yaw), (m) => {
      m.setColor('#3a8f5a');
      for (const x of [-1.8, 1.8]) { m.tube([x, 0, -0.9], [x, 2.4, 0], 0.05, 5); m.tube([x, 0, 0.9], [x, 2.4, 0], 0.05, 5); }
      m.tube([-1.8, 2.4, 0], [1.8, 2.4, 0], 0.05, 5);
      m.setColor('#2b2b2b'); for (const x of [-0.8, 0.8]) { m.tube([x - 0.2, 2.4, 0], [x - 0.2, 0.5, 0], 0.012, 3); m.tube([x + 0.2, 2.4, 0], [x + 0.2, 0.5, 0], 0.012, 3); m.box(x - 0.25, 0.45, -0.12, x + 0.25, 0.5, 0.12); }
    });
    // benches along the long sides
    for (const [a, b] of [[pa - 5, pb + pd / 2 + 1.2], [pa + 5, pb + pd / 2 + 1.2], [pa - 5, pb - pd / 2 - 1.2], [pa + 5, pb - pd / 2 - 1.2]]) {
      const g = heightAt(...toMap(a, b));
      D.with(M4(...toMap(a, b).flatMap((v, i) => (i ? [g, v] : [v])), yaw), (m) => { m.setColor('#7a5235'); m.box(-0.9, 0.42, -0.22, 0.9, 0.48, 0.22); m.box(-0.9, 0.5, 0.18, 0.9, 0.9, 0.24); m.setColor('#333'); m.box(-0.8, 0, -0.2, -0.7, 0.42, 0.2); m.box(0.7, 0, -0.2, 0.8, 0.42, 0.2); });
    }
  }

  const T = tiles(r);
  const facade = (map) => new THREE.MeshStandardMaterial({ map, emissiveMap: T.glow, emissive: 0xffffff, emissiveIntensity: 0, roughnessMap: T.rough, roughness: 1, metalness: 0.05 });
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: speckle(r), vertexColors: true, roughness: 0.85 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3, emissive: 0xffd9a8, emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.35 }),
    up: facade(T.upper), low: facade(T.lower),
  };
  const out = finish(root, 'perlyna', Bd, M, { shade: ['wall', 'det', 'up', 'low'] });
  console.log(`[cherkasy] Perlyna Dnipra: ${nOpen} ground-floor openings, floor ${yF.toFixed(1)} m (ground ${gLo.toFixed(1)}–${gHi.toFixed(1)}), ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    footprints: [{ poly: ring, h: TOP - gLo, kind: 'apt', name: 'ЖК «Перлина Дніпра»' }],
    // trees keep off the building, the strip to the street and the playground
    clear: (x, z) => { const [a, b] = toLocal(x, z); return a > 0 && a < 63 && b > 22 && b < 94 && (a < 27 || b < 49 || (a < 52 && b < 76)); },
    update() { const k = nightK.value; M.lit.emissiveIntensity = 1.1 * k; M.up.emissiveIntensity = M.low.emissiveIntensity = 0.9 * k; },
  };
}
