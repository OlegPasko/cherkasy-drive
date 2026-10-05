// OWNER: cherkasy. The old Cherkasy sugar refinery (Черкаський цукрово-рафінадний завод, 1854, closed 1998) at the end
// of вулиця Сінна above the Dnipro, on the hill edge where the old postcards show it (quest card `rafinad`). OSM has
// the surviving core as one 26-corner outline (way 399905038); it is split here into the blocks the 2019 photos of
// dzvin.media («Індустріальний туризм», a close-up of the main block and a then-and-now panorama) and the satellite
// roofs show. A rectangle frame along the outline's walls (u along the street front, v down the slope to the river):
//   - the west wing: four storeys of red-brown brick, segmental-arch windows of small panes, a low gabled sheet roof;
//   - the front range along the street: three storeys of the same;
//   - the main mill block in the middle: four tall storeys and an attic band of small lights, the walls of weathered
//     pale brick broken into bays by broad whitewashed piers, a muted salmon panel round each window with a brick
//     diamond under it, a roof monitor (the long glazed lantern) on the ridge;
//   - the narrow tower block in front of it toward the river, painted brick-red between white piers (the red bays of
//     the close-up), with lower brick annexes beside it;
//   - lower two- and three-storey halls stepping down the slope east of it, the gabled 1900–1901 hall at the far end
//     (pale gables);
//   - the round chimney, banded white and grey, in the yard.
// Abandoned: the glass is dark, many panes broken out; only a few windows of the halls still used as stores light up.
//   RAFINAD_SKIP: the OSM id replaced here (buildings.js skips its extrusion)
//   buildRafinad({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints, parts } | null
//     parts: [{ name, ring: [[x, z] x4], base, eave, top }] (tests)
// Walls are bay-atlas quads (bayatlas.js): two painted atlases (plain brick bays; the mill's pier bays, the red-painted
// variant in the lower half of the same canvas), plain brick under them, the roofs in corrugated sheet.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng, bboxOf, inPoly } from './geo.js';
import { ringFaces, box, quad, at, finish } from './slabkit.js';
import { frame, bayAtlas, band, blockBase, gable, flat, brickTex, sheetTex, brickRows } from './bayatlas.js';

const OSM_ID = 399905038;
export const RAFINAD_SKIP = new Set([OSM_ID]);

// the local frame: origin at the outline's north-west corner, u along its street wall (15.6 degrees off map +x)
const ORIGIN = [400.2, 4166.1], ANG = 15.6;
const CHIMNEY = [92, 102], CH_H = 46;                          // (u, v), height
const BRICK = { bay: 4.4, fh: 4.5, cols: 4, rows: 4 };        // atlas cells: one bay x one storey
const MILL = { bay: 5.6, fh: 5.6, cols: 4, rows: 10 };        // rows 0-4 pale brick and salmon panels (row 0 the attic band), 5-9 painted red
// the blocks: u0, u1, v0, v1, storeys, atlas, roof ('u' / 'v': gabled with the ridge along u / v, 'f' flat), rise
const PARTS = [
  ['west wing', 0, 22.7, 0, 55, 4, 'brick', 'v', 2.2],
  ['west wing south', 0, 25, 55, 89, 4, 'brick', 'v', 2.2],
  ['street range', 22.7, 76.7, 2.4, 21.4, 3, 'brick', 'u', 2.0],
  ['mill', 36.7, 69.2, 21.4, 134.2, 4, 'mill', 'v', 2.6],
  ['east hall', 69.2, 107, 21.4, 55.6, 3, 'brick', 'u', 2.4],
  ['east link', 76.7, 107, 15.8, 21.4, 2, 'brick', 'f', 0],
  ['1900 hall', 107, 152.5, 37.3, 55.6, 2, 'brick', 'u', 3.4],
  ['red tower', 69.2, 80.5, 55.6, 74, 4, 'red', 'f', 0],
  ['tower annex', 69.2, 88.8, 74, 87.4, 3, 'brick', 'f', 0],
  ['tower side', 80.5, 88.8, 55.6, 74, 2, 'brick', 'f', 0],
  ['river store south', 69.2, 74.2, 87.4, 125.6, 2, 'brick', 'f', 0],
];

const GLASS = '#2a3134', FRAMEC = '#9a9a92';
// small-paned glazing with some panes gone (black) or boarded (brown)
function panes(g, x, y, w, h, r, nx, ny) {
  g.fillStyle = '#55504a'; g.fillRect(x, y, w, h);
  const pw = w / nx, ph = h / ny;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const q = r();
    g.fillStyle = q < 0.18 ? '#0b0c0d' : q < 0.22 ? '#5c4632' : q < 0.5 ? '#39444a' : GLASS;
    g.fillRect(x + i * pw + 1, y + j * ph + 1, pw - 2, ph - 2);
  }
  g.fillStyle = 'rgba(160,170,175,0.18)'; g.fillRect(x, y, w * 0.5, h * 0.3);
}
// a brick bay: the window with a segmental arch of headers, a string course at the floor
function brickCell(r) {
  return (g, x, y, w, h) => {
    const v = r();
    brickRows(g, x, y, w, h, v < 0.3 ? '#8a5e4e' : v < 0.6 ? '#94695a' : '#9c7262', r);
    if (r() < 0.25) { g.fillStyle = 'rgba(225,215,195,0.35)'; g.fillRect(x + r() * w * 0.5, y + r() * h * 0.5, w * 0.6, h * 0.4); }
    g.fillStyle = 'rgba(205,130,95,0.55)'; g.fillRect(x, y + h - 6, w, 5);                 // the course at the floor
    const ww = w * 0.43, wh = h * 0.58, wx = x + (w - ww) / 2, wy = y + h * 0.2;
    g.fillStyle = '#b06a4c'; g.beginPath(); g.ellipse(wx + ww / 2, wy + 2, ww / 2 + 5, 11, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#3a3a37'; g.beginPath(); g.ellipse(wx + ww / 2, wy + 2, ww / 2, 7, 0, Math.PI, 0); g.fill();
    panes(g, wx, wy, ww, wh, r, 3, 5);
    g.fillStyle = '#c9b8a2'; g.fillRect(wx - 3, wy + wh, ww + 6, 3);                       // sill
    return [[wx, wy - 4, ww, wh + 4]];
  };
}
// a mill bay: whitewashed pilasters at the edges, a cream panel with a brick diamond under a tall window; the lower
// half of the canvas (rows 5-9) has the same painted red
function millCell(r) {
  return (g, x, y, w, h, i, j) => {
    const red = j >= 5, attic = j % 5 === 0;
    // weathered pale brick, broad whitewashed piers; the red variant painted brick-red between white piers
    brickRows(g, x, y, w, h, red ? '#b0675a' : r() < 0.5 ? '#b89478' : '#c19f82', r);
    const pw = 16;
    g.fillStyle = red ? '#e4dfd6' : '#dcd6ca'; g.fillRect(x, y, pw, h); g.fillRect(x + w - pw, y, pw, h);
    if (attic) {
      // the attic band under the eaves: a pair of small square lights per bay over a plain frieze
      g.fillStyle = 'rgba(60,40,30,0.15)'; g.fillRect(x + pw, y + h * 0.75, w - 2 * pw, 3);
      const out = [];
      for (const cx of [0.36, 0.64]) {
        const ww = w * 0.16, wh = h * 0.3, wx = x + w * cx - ww / 2, wy = y + h * 0.3;
        g.fillStyle = '#3e3c38'; g.fillRect(wx - 2, wy - 2, ww + 4, wh + 4); panes(g, wx, wy, ww, wh, r, 2, 2); out.push([wx, wy, ww, wh]);
      }
      return out;
    }
    const ww = w * 0.38, wx = x + (w - ww) / 2, wy = y + h * 0.12, wh = h * 0.6, px = wx - 12, pwid = ww + 24;
    g.fillStyle = red ? '#bd7568' : r() < 0.5 ? '#c99a7e' : '#c4927a'; g.fillRect(px, y + h * 0.05, pwid, h * 0.9);   // the muted salmon panel
    // the diamond under the window
    const cx = x + w / 2, cy = y + h * 0.84, d = 8;
    g.fillStyle = red ? '#9c3a30' : '#a0664e'; g.beginPath(); g.moveTo(cx, cy - d); g.lineTo(cx + d, cy); g.lineTo(cx, cy + d); g.lineTo(cx - d, cy); g.closePath(); g.fill();
    g.fillStyle = red ? '#e4dfd6' : '#e2d6bd'; g.beginPath(); g.moveTo(cx, cy - d / 2); g.lineTo(cx + d / 2, cy); g.lineTo(cx, cy + d / 2); g.lineTo(cx - d / 2, cy); g.closePath(); g.fill();
    g.fillStyle = '#3e3c38'; g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
    panes(g, wx, wy, ww, wh, r, 3, 6);
    g.fillStyle = 'rgba(40,30,25,0.18)'; g.fillRect(x, y + h - 4, w, 4);                     // soot at the floor line
    return [[wx, wy, ww, wh]];
  };
}

export function buildRafinad({ root, map, solids: S, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const P = frame(ORIGIN, ANG), ring = ringPts(bld.p);
  const B = { brick: new MB(), mill: new MB(), plain: new MB(), det: new MB(), roof: new MB() };
  const A = { brick: { ...BRICK, base: 0 }, mill: { ...MILL, base: 0 }, red: { ...MILL, base: 0 } };
  const parts = [];

  for (const [name, u0, u1, v0, v1, n, kind, roof, rise] of PARTS) {
    const c4 = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];
    let gLo = Infinity;
    for (const [u, v] of [[u0, v0], [u1, v0], [u1, v1], [u0, v1], [(u0 + u1) / 2, v0], [(u0 + u1) / 2, v1], [u0, (v0 + v1) / 2], [u1, (v0 + v1) / 2]]) gLo = Math.min(gLo, heightAt(...P(u, v)));
    const at0 = kind === 'brick' ? A.brick : A.mill, fh = at0.fh;
    const base = gLo + 0.5, eave = base + n * fh;
    // the mill's n storeys read rows 4-n .. 4 of their half of the atlas, so the top one is always the attic band
    const Ak = { ...at0, base: kind === 'brick' ? base : blockBase(at0, kind === 'mill' ? 0 : 5, n, base) };
    const W = kind === 'brick' ? B.brick : B.mill;
    for (const f of ringFaces(c4)) {
      W.setColor('#ffffff'); band(W, f, Ak, base, eave);
      B.plain.setColor('#7d4636'); quad(B.plain, at(f, 0, gLo - 2.5), at(f, f.L, gLo - 2.5), at(f, f.L, base), at(f, 0, base), f.N, [[0, gLo - 2.5], [f.L, gLo - 2.5], [f.L, base], [0, base]]);
      // the cornice: a corbelled brick band; the mill also gets its whitewashed pilasters in relief
      B.plain.setColor(kind === 'brick' ? '#a3634a' : '#c9c0b0'); box(B.plain, f, -0.2, f.L + 0.2, eave - 0.55, eave, 0, 0.3, 'ftu', [1, 1]);
      if (kind !== 'brick') {
        const nb = Math.max(1, Math.round(f.L / MILL.bay)), bw = f.L / nb;
        B.det.setColor(kind === 'red' ? '#ebe6dd' : '#ddd6c8');
        for (let k = 0; k <= nb; k++) { const s = Math.min(f.L - 0.35, Math.max(0.35, k * bw)); box(B.det, f, s - 0.35, s + 0.35, base, eave - 0.55, 0, 0.14, 'flrt'); }
        B.det.setColor('#d6cfc1'); for (let k = 1; k < n; k++) box(B.det, f, 0, f.L, base + k * fh - 0.12, base + k * fh + 0.12, 0, 0.1, 'ftu');
      }
    }
    // roofs: corrugated sheet; gables in plain brick (the 1900 hall's pale), a parapet round the flat ones
    let top = eave;
    if (roof === 'f') {
      flat(B.roof.setColor('#6f7376'), c4, eave - 0.3);
      for (const f of ringFaces(c4)) { B.plain.setColor('#9a5a44'); box(B.plain, f, 0, f.L, eave - 0.3, eave + 0.5, -0.3, 0, 'ftb', [1, 1]); }
      top = eave + 0.5;
    } else {
      const g4 = roof === 'u' ? c4 : [c4[0], c4[3], c4[2], c4[1]];
      const col = kind === 'brick' ? (name === '1900 hall' ? '#7f8a90' : '#8b8f91') : '#7a8084';
      top = gable(B.roof, B.plain, g4, eave, rise, col, name === '1900 hall' ? '#d9d0bd' : '#9a5a44', 0.45);
      if (kind !== 'brick') {
        // the roof monitor along the ridge: a long box with a dark glazed band each side under a flat sheet lid
        const um = (u0 + u1) / 2, mw = 3.6, f = ringFaces([P(um - mw, v0 + 4), P(um + mw, v0 + 4), P(um + mw, v1 - 4), P(um - mw, v1 - 4)]);
        for (const q of f) {
          B.det.setColor('#8a5040'); box(B.det, q, 0, q.L, top - 1.2, top + 0.6, -0.1, 0, 'f');
          B.det.setColor('#2b3236'); box(B.det, q, 0, q.L, top + 0.6, top + 1.9, -0.1, 0, 'f');
        }
        flat(B.roof.setColor('#6a7074'), [P(um - mw - 0.4, v0 + 3.6), P(um + mw + 0.4, v0 + 3.6), P(um + mw + 0.4, v1 - 3.6), P(um - mw - 0.4, v1 - 3.6)], top + 2.1);
        top += 2.1;
      }
    }
    S.prism(c4.flat(), gLo - 1.5, roof === 'f' ? top : eave + (top - eave) * 0.5, 0, 0, 'wall');
    parts.push({ name, ring: c4, base, eave, top });
  }

  // ---- the chimney: a tapering round stack banded white / grey on a square brick base
  const [chx, chz] = P(...CHIMNEY), cg = heightAt(chx, chz) - 0.3, D = B.det;
  D.setColor('#8e4b38'); D.boxC(chx, cg + 2.5, chz, 4.6, 5, 4.6);
  const N = 12;
  for (let i = 0; i < N; i++) {
    const y0 = cg + 5 + ((CH_H - 5) * i) / N, y1 = cg + 5 + ((CH_H - 5) * (i + 1)) / N, ra = 2.0 - (0.75 * i) / N, rb = 2.0 - (0.75 * (i + 1)) / N;
    D.setColor(i % 2 ? '#c9c7c2' : '#e9e7e2'); D.cyl(chx, y0, chz, ra, rb, y1 - y0, 16, false);
  }
  D.setColor('#3a3633'); D.cyl(chx, cg + CH_H, chz, 1.35, 1.45, 0.6, 16, true);
  S.cyl(chx, chz, cg - 1, cg + CH_H, 2.3, 1.3, 'wall');

  const bt = brickTex(r), st = sheetTex();
  const AB = bayAtlas({ cols: 4, rows: 4, cw: 128, ch: 132, r, lit: 0.15, cell: brickCell(r) });
  const AM = bayAtlas({ cols: 4, rows: 10, cw: 128, ch: 134, r, lit: 0.0, cell: millCell(r) });
  const lit = (a) => ({ map: a.tex, emissiveMap: a.mask, emissive: 0xffcf8a, emissiveIntensity: 0, roughness: 0.9, vertexColors: true });
  const M = {
    brick: new THREE.MeshStandardMaterial(lit(AB)),
    mill: new THREE.MeshStandardMaterial(lit(AM)),
    plain: new THREE.MeshStandardMaterial({ map: bt, vertexColors: true, roughness: 0.92 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    roof: new THREE.MeshStandardMaterial({ map: st, vertexColors: true, roughness: 0.6, metalness: 0.35 }),
  };
  const out = finish(root, 'rafinad', B, M, { shade: ['brick', 'mill', 'plain', 'det', 'roof'] });
  console.log(`[cherkasy] Old sugar refinery: ${parts.length} blocks, ${(out.verts / 1000).toFixed(1)}k verts, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  const bb = bboxOf(ring);
  return {
    parts,
    footprints: [{ poly: ring, h: Math.max(...parts.map((p) => p.top - p.base)), kind: 'industrial', name: 'Колишній рафінадний завод' }],
    clear: (x, z) => (x > bb.x0 - 3 && x < bb.x1 + 3 && z > bb.z0 - 3 && z < bb.z1 + 3 && inPoly(ring, x, z)) || Math.hypot(x - chx, z - chz) < 5,
    update() { M.brick.emissiveIntensity = 1.4 * nightK.value; },
  };
}
