// OWNER: cherkasy. ТРЦ «Любава» (LUBAVA), бульв. Шевченка, 208/1 (OSM way 159065169), rebuilt after the Wikimedia
// Commons photo of its opening, the lubava.ua and novobudovy.com photos and the satellite view. A four-storey mall in
// the reclad shell of a Soviet factory block. The boulevard front runs in three pieces: at the south-east end a
// patchwork of red, coral, pink and maroon composite panels with glass strips, its top corner glazed under the two
// rooftop sign boxes (the coloured-squares logo and the black «LUBAVA shopping center» box); in the middle a dark
// grey curtain wall carrying the big logo of coloured squares round the script «L», the white «LUBAVA» letters and
// the dark «ТОРГОВЕЛЬНИЙ ЦЕНТР» entrance canopy on raking struts; at the north-west end white, grey and dark bands
// with thin red lines, wrapping the corner. The ground floor is dark shop glazing. The tenants' brand signs are left
// out. The yard, car-park and back walls carry the same banded cladding with ribbon windows; a glazed atrium
// lantern and plant stand on the flat roof. Glazing, logo and letters light up at night.
//   LYUBAVA_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildLyubava({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per ring edge in an edge frame (shellkit.js). The boulevard front's upper floors are one painted
// panel atlas, mapped by map z so the pieces line up across the ring's small jogs.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex, decal } from './sculpt.js';
import { ringPts, rng, inPoly, centroid } from './geo.js';
import { ringFaces, at, plate, slab, skin, hole, block, base, fin, quad, gaps } from './shellkit.js';

const OSM_ID = 159065169;
export const LYUBAVA_SKIP = new Set([OSM_ID]);

const G0 = 5.2, TOP = 21.0, PARA = 0.6;          // ground floor (shopfronts), top of the cladding, parapet
const FZ0 = -221.7, FZ1 = -271.4;                // the boulevard front, south-east end to north-west end (map z)
const RED_TO = -243.0, GREY_TO = -256.0;         // where the red and the grey pieces end
const FRONT_X = -72;                             // faces looking +x east of this are the boulevard front
const BAY_Z = -249.0;                            // middle of the entrance bay, between the ring's steps
const UNIT = [8, 4.2];                           // banded cladding: metres per repeat
const DARKGL = '#2f383d', FRAME = '#2a2c2e';

// ------------------------------------------------------------------------------------------------ textures
const PXM = 2048 / (FZ0 - FZ1), PYM = 1024 / (TOP - G0); // atlas pixels per metre
const zPx = (z) => (FZ0 - z) * PXM;
function paintFront(g, r, glow) {
  const W = 2048, H = 1024, xr = zPx(RED_TO), xg = zPx(GREY_TO), rowH = 1.25 * PYM;
  const pick = (list) => { let u = r() * list.reduce((s, q) => s + q[0], 0); for (const q of list) { u -= q[0]; if (u <= 0) return q[1]; } return list[0][1]; };
  if (!glow) {
    // red piece: rows of panels of random length
    for (let y = 0; y < H; y += rowH) {
      const glassRow = y < 2 * rowH ? 0.55 : y > H - 3 * rowH ? 0.05 : 0.12;
      for (let x = 0; x < xr;) {
        const w = (1.5 + r() * 4.5) * PXM;
        g.fillStyle = r() < glassRow ? '#454b50' : pick([[40, '#d8352d'], [20, '#e9594b'], [14, '#f1a2a8'], [9, '#6c3431'], [6, '#c32a26']]);
        g.fillRect(x, y, Math.min(w, xr - x), rowH);
        g.fillStyle = 'rgba(40,20,20,0.5)'; g.fillRect(x, y, 2, rowH);
        x += w;
      }
      g.fillStyle = 'rgba(40,20,20,0.45)'; g.fillRect(0, y, xr, 2);
    }
    g.fillStyle = '#f4f4f2'; // the louvre stripes
    for (const [x, y] of [[0.35, 0.45], [0.62, 0.72], [0.2, 0.2]]) for (let k = 0; k < 4; k++) g.fillRect(x * xr, y * H + k * 12, 3.2 * PXM, 5);
    // grey piece: curtain wall grid
    g.fillStyle = '#4f5457'; g.fillRect(xr, 0, xg - xr, H);
    for (let x = xr; x < xg; x += 1.5 * PXM) { g.fillStyle = '#8b9194'; g.fillRect(x, 0, 3, H); }
    for (let y = 0; y < H; y += rowH) { g.fillStyle = '#8b9194'; g.fillRect(xr, y, xg - xr, 3); g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(xr, y + 3, xg - xr, rowH * 0.4); }
    // white piece: bands of white, light and mid grey, red hairlines, a few dark glass strips
    for (let y = 0; y < H;) {
      const h = (0.5 + r() * 1.1) * PYM, c = pick([[40, '#eeeeec'], [25, '#c9cbcc'], [16, '#8e9295'], [9, '#3c4246']]);
      g.fillStyle = c; g.fillRect(xg, y, W - xg, h);
      if (r() < 0.25) { g.fillStyle = '#d23a33'; g.fillRect(xg + r() * (W - xg) * 0.5, y + h * 0.4, (2 + r() * 6) * PXM, 6); }
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(xg, y, W - xg, 2);
      for (let x = xg; x < W; x += (1.2 + r() * 2.4) * PXM) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, y, 2, h); }
      y += h;
    }
  } else { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }
  // logo on the grey piece: coloured squares scattered round a ring, the script loop over them
  // centred on the entrance bay (the ring's 1.4 m step at z -253.2 would hide anything past it)
  const cx = zPx(BAY_Z), cy = 0.33 * H, R = 3.4 * PXM, sq = 1.05 * PXM;
  for (let i = 0; i < 34; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * (PXM / PYM) * 1.05;
    g.save(); g.translate(x, y); g.rotate((r() - 0.5) * 0.25);
    g.fillStyle = glow ? pick([[1, '#ffd24a'], [1, '#62c270'], [1, '#6fa6ff'], [1, '#ff9a3a'], [1, '#ff5a50'], [1, '#ffffff']])
      : pick([[3, '#f1c02e'], [3, '#2f9a4a'], [3, '#5b8fd1'], [3, '#ee8a2c'], [2, '#d8342c'], [2, '#e6e6e4'], [2, '#9fa2a3'], [1, '#6c5140']]);
    g.fillRect(-sq / 2, -sq / 2 * PYM / PXM * 1.0, sq, sq * PYM / PXM);
    g.restore();
  }
  g.strokeStyle = glow ? '#dddddd' : '#b9bdbf'; g.lineWidth = 0.35 * PXM; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx - 1.6 * PXM, cy + 3.1 * PYM); g.bezierCurveTo(cx + 3.4 * PXM, cy + 1.0 * PYM, cx + 1.8 * PXM, cy - 3.6 * PYM, cx + 0.2 * PXM, cy - 2.8 * PYM);
  g.bezierCurveTo(cx - 1.4 * PXM, cy - 2.0 * PYM, cx - 0.4 * PXM, cy + 2.4 * PYM, cx + 1.9 * PXM, cy + 3.0 * PYM); g.stroke();
  // «LUBAVA» under it
  g.font = `bold ${(1.9 * PYM) | 0}px "Arial Black", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffffff'; g.fillText('LUBAVA', cx, 0.8 * H, 8.0 * PXM);
}
const frontTex = (seed, glow) => canvasTex(2048, 1024, (g) => paintFront(g, rng(seed), glow), { repeat: false, aniso: 16 });
// banded cladding for the other walls, repeating: 8 m x 4.2 m with a ribbon window row
const bandTex = (r) => canvasTex(512, 256, (g, w, h) => {
  const rows = [[0, 0.18, '#e9e9e6'], [0.18, 0.3, '#c6c8c9'], [0.3, 0.55, '#eeeeec'], [0.55, 0.62, '#8e9295'], [0.62, 1, '#e3e3e0']];
  for (const [a, b, c] of rows) { g.fillStyle = c; g.fillRect(0, (1 - b) * h, w, (b - a) * h); }
  for (let x = 0; x < w; x += w / 5.33) { g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(x, 0, 2, h); }
  g.fillStyle = '#d23a33'; g.fillRect(w * 0.1, (1 - 0.315) * h, w * 0.3, 3);
  for (let i = 0; i < 300; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)'; g.fillRect(r() * w, r() * h, 2, 2); }
});
// sign atlas 1024 x 682: the top 512 px the two box faces (logo left, black name box right), the bottom 170 px the
// canopy name strip; SV gives the v ranges the quads use
const SV = { box: [170 / 682, 1], canopy: [0, 170 / 682] };
const signTex = (r) => canvasTex(1024, 682, (g) => {
  g.fillStyle = '#26282a'; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 190;
    g.fillStyle = ['#f1c02e', '#2f9a4a', '#5b8fd1', '#ee8a2c', '#d8342c', '#e6e6e4'][(r() * 6) | 0];
    g.fillRect(256 + Math.cos(a) * d - 22, 256 + Math.sin(a) * d - 22, 44, 44);
  }
  g.lineCap = 'round';
  g.strokeStyle = '#d7dadb'; g.lineWidth = 16; g.beginPath(); g.moveTo(200, 420); g.bezierCurveTo(420, 300, 330, 80, 260, 110); g.bezierCurveTo(180, 150, 230, 380, 360, 410); g.stroke();
  g.strokeStyle = '#ffffff'; g.lineWidth = 14; g.beginPath(); g.moveTo(700, 250); g.bezierCurveTo(840, 170, 790, 40, 750, 60); g.bezierCurveTo(700, 90, 720, 240, 820, 250); g.stroke();
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 92px "Arial Black", Arial, sans-serif'; g.fillText('LUBAVA', 768, 340, 460);
  g.font = '40px Arial, sans-serif'; g.fillText('SHOPPING CENTER', 768, 420, 440);
  g.fillStyle = '#3a3d40'; g.fillRect(0, 512, 1024, 170);
  g.font = 'bold 84px Arial, sans-serif'; g.fillStyle = '#f2f2f2'; g.fillText('ТОРГОВЕЛЬНИЙ  ЦЕНТР', 512, 600, 980);
}, { repeat: false, aniso: 16 });

// ------------------------------------------------------------------------------------------------ build
export function buildLyubava({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const ring = ringPts(bld.p), g = base(ring, heightAt), yF = g.hi + 0.1, gB = g.lo - 0.6, Y = (h) => yF + h;
  const B = { front: new MB(), band: new MB(), det: new MB(), glass: new MB(), lit: new MB(), sign: new MB(), roof: new MB() };
  const D = B.det, UV = [UNIT[0], UNIT[1], Y(0)];
  let nOpen = 0;
  const faces = ringFaces(ring);
  const isFront = (f) => f.nx > 0.9 && f.ax > FRONT_X - 4;
  if (!faces.some(isFront)) throw new Error('Lyubava: the boulevard front is not where it was');

  for (const f of faces) {
    if (f.L < 0.3) continue;
    const front = isFront(f);
    // ground floor: shop glazing on the front and round the corners, service doors and high ribbons elsewhere
    const L = f.L;
    if (front || (f.L > 8 && r() < 0.5)) {
      const nb = Math.max(1, Math.round((L - 0.6) / 4.2)), p = (L - 0.6) / nb;
      for (let i = 0; i < nb; i++) { const a = 0.3 + i * p; f.cuts.push({ s0: a + 0.15, s1: a + p - 0.15, y0: Y(0.08), y1: Y(G0 - 0.7), glass: front ? '#3c464b' : '#46525a', frame: FRAME, pitch: 1.4, tr: Y(3.1), door: front && i % 3 === 1, dark: false, dep: 0.15 }); nOpen++; }
    } else if (f.L > 6) { const pd = at(f, L / 2, 0, 1), yd = Math.max(yF, heightAt(pd[0], pd[2]) + 0.1); f.cuts.push({ s0: L / 2 - 0.9, s1: L / 2 + 0.9, y0: yd, y1: yd + 2.4, glass: '#3c464b', frame: '#6c7072', pitch: 0.9, door: true, dark: true, dep: 0.12 }); nOpen++; }
    if (!front && f.L > 10) for (const y of [8.2, 12.4, 16.6]) { f.cuts.push({ s0: 1.5, s1: L - 1.5, y0: Y(y), y1: Y(y + 1.3), glass: DARKGL, frame: '#8e9295', pitch: 1.6, dark: r() < 0.6, dep: 0.1 }); nOpen++; }
    // walls: the painted front over the shopfronts, banded cladding elsewhere; a dark fascia over the shops
    if (front) {
      skin(B.band, f, gB, Y(G0), '#5a5e61', UV);
      B.front.setColor('#ffffff');
      const u = (s) => zPx(at(f, s, 0)[2]) / 2048, v = (y) => (y - Y(G0)) / (TOP - G0);
      quad(B.front, at(f, 0, Y(G0)), at(f, L, Y(G0)), at(f, L, Y(TOP)), at(f, 0, Y(TOP)), [f.nx, 0, f.nz], [[u(0), v(Y(G0))], [u(L), v(Y(G0))], [u(L), v(Y(TOP))], [u(0), v(Y(TOP))]]);
    } else skin(B.band, f, gB, Y(TOP), '#ffffff', UV);
    for (const q of f.cuts) hole(B, f, q);
    D.setColor('#2b2d2f'); slab(D, f, -0.02, L + 0.02, Y(G0 - 0.7), Y(G0), 0, front ? 0.45 : 0.08, front ? 'ftu' : 'f');
    D.setColor('#5c5e5f'); for (const [a, b] of gaps(f, gB, yF, (c) => c.door)) slab(D, f, a, b, gB, yF, -0.02, 0.05, 'ft');
    // parapet coping
    D.setColor('#b9bcbd'); slab(D, f, -0.05, L + 0.05, Y(TOP), Y(TOP + PARA), -0.3, 0.05, 'ftu');
    const p0 = at(f, 0, 0, -0.1), p1 = at(f, L, 0, -0.1); Z.edge(p0[0], p0[2], p1[0], p1[2], Y(TOP + PARA), f.nx, f.nz);
  }
  // ---- the entrance canopy in the grey piece, on two raking struts, with the name on its front
  const over = (f) => { const z0 = f.az, z1 = at(f, f.L, 0)[2]; return Math.min(RED_TO, Math.max(z0, z1)) - Math.max(GREY_TO, Math.min(z0, z1)); };
  const fe = faces.filter(isFront).sort((a, b) => over(b) - over(a))[0]; // the front face that carries most of the grey piece
  const sAt = (z) => (z - fe.az) / fe.uz; // this front face runs along z
  const cs0 = Math.max(0.2, Math.min(sAt(RED_TO + 0.5), sAt(GREY_TO - 0.5))), cs1 = Math.min(fe.L - 0.2, Math.max(sAt(RED_TO + 0.5), sAt(GREY_TO - 0.5)));
  const hasCanopy = cs1 - cs0 > 4;
  if (hasCanopy) {
    D.setColor('#3a3d40'); slab(D, fe, cs0, cs1, Y(G0 - 1.0), Y(G0 + 0.5), 0, 2.4, 'ftulr');
    const flip = fe.ux * fe.nz - fe.uz * fe.nx < 0, [ua, ub] = flip ? [1, 0] : [0, 1];
    quad(B.sign, at(fe, cs0 + 0.3, Y(G0 - 0.85), 2.42), at(fe, cs1 - 0.3, Y(G0 - 0.85), 2.42), at(fe, cs1 - 0.3, Y(G0 + 0.35), 2.42), at(fe, cs0 + 0.3, Y(G0 + 0.35), 2.42), [fe.nx, 0, fe.nz], [[ua, SV.canopy[0]], [ub, SV.canopy[0]], [ub, SV.canopy[1]], [ua, SV.canopy[1]]]);
    D.setColor('#9ea3a5');
    for (const s of [cs0 + 1.6, cs1 - 1.6]) { const pb = at(fe, s, 0, 0.4), pt = at(fe, s + (s < (cs0 + cs1) / 2 ? -1.2 : 1.2), Y(G0 - 1.0), 2.1); D.tube([pb[0], heightAt(pb[0], pb[2]), pb[2]], pt, 0.12, 6); }
    block(S, fe, cs0, cs1, -0.05, 2.4, Y(G0 - 1.0), Y(G0 + 0.5), 'awning', 1);
    B.lit.setColor('#fff0d0'); for (let s = cs0 + 1; s < cs1 - 0.5; s += 2) plate(B.lit, fe, s - 0.25, s + 0.25, Y(G0 - 1.0) - 0.01, Y(G0 - 1.0) - 0.01, 1.2, [0, -1, 0]);
  }
  // ---- the glazed top corner at the south-east end and the two sign boxes over it
  const corner = [-74.0, FZ0], fc = faces.find((f) => isFront(f) && Math.hypot(at(f, f.L, 0)[0] - corner[0], at(f, f.L, 0)[2] - corner[1]) < 1.5);
  const fs = faces.find((f) => f.nz > 0.9 && Math.hypot(f.ax - corner[0], f.az - corner[1]) < 1.5);
  const glassCorner = (f, s0, s1) => {
    B.lit.setColor('#5f6f78'); plate(B.lit, f, s0, s1, Y(TOP - 6.2), Y(TOP - 0.3), 0.06);
    D.setColor('#aeb3b5');
    for (let s = s0; s <= s1 + 1e-3; s += (s1 - s0) / 4) slab(D, f, s - 0.05, s + 0.05, Y(TOP - 6.2), Y(TOP - 0.3), 0.06, 0.14, 'flr');
    for (const y of [TOP - 6.2, TOP - 3.2, TOP - 0.3]) slab(D, f, s0, s1, Y(y) - 0.05, Y(y) + 0.05, 0.06, 0.14, 'ftu');
  };
  if (fc) glassCorner(fc, fc.L - 6.5, fc.L);
  if (fs) glassCorner(fs, 0, Math.min(6.5, fs.L));
  const boxAt = (f, s0, s1, uv) => { // a sign box standing on the roof edge, 1 m deep, on a steel frame
    if (!f) return;
    const y0 = Y(TOP + PARA + 1.2), y1 = y0 + (s1 - s0) * 0.9;
    D.setColor('#2c2e30'); slab(D, f, s0, s1, y0, y1, -1.1, -0.1, 'bltru');
    const flip = f.ux * f.nz - f.uz * f.nx < 0, [ua, ub] = flip ? [uv[1], uv[0]] : [uv[0], uv[1]];
    quad(B.sign, at(f, s0, y0, -0.09), at(f, s1, y0, -0.09), at(f, s1, y1, -0.09), at(f, s0, y1, -0.09), [f.nx, 0, f.nz], [[ua, SV.box[0]], [ub, SV.box[0]], [ub, SV.box[1]], [ua, SV.box[1]]]);
    D.setColor('#6a6e70');
    for (const s of [s0 + 0.4, s1 - 0.4]) { const p = at(f, s, 0, -0.6); D.box(p[0] - 0.1, Y(TOP), p[2] - 0.1, p[0] + 0.1, y0, p[2] + 0.1, 1 | 2 | 4 | 8); }
    block(S, f, s0, s1, -1.1, -0.1, Y(TOP), y1, 'wall');
  };
  if (fc) boxAt(fc, fc.L - 6.6, fc.L - 0.4, [0, 0.5]);
  if (fs) boxAt(fs, 0.4, 7.0, [0.5, 1]);

  // ---- roof: membrane, the atrium lantern, plant
  B.roof.setColor('#8d8f8f'); B.roof.fill(ring, [], Y(TOP), true);
  const C = centroid(ring), lx = [C[0] - 9, C[0] + 9], lz = [C[1] - 5, C[1] + 5], yl = Y(TOP);
  if (inPoly(ring, lx[0], lz[0]) && inPoly(ring, lx[1], lz[1])) {
    const ridge = yl + 2.6, E = [[lx[0], yl + 0.8, lz[0]], [lx[1], yl + 0.8, lz[0]], [lx[1], yl + 0.8, lz[1]], [lx[0], yl + 0.8, lz[1]]];
    D.setColor('#c7cacb'); D.box(lx[0], yl, lz[0], lx[1], yl + 0.8, lz[1], 1 | 2 | 4 | 8);
    B.lit.setColor('#6d8591');
    B.lit.face([E[0], E[1], [lx[1] - 5, ridge, C[1]], [lx[0] + 5, ridge, C[1]]]); B.lit.face([E[2], E[3], [lx[0] + 5, ridge, C[1]], [lx[1] - 5, ridge, C[1]]]);
    B.lit.face([E[1], E[2], [lx[1] - 5, ridge, C[1]]]); B.lit.face([E[3], E[0], [lx[0] + 5, ridge, C[1]]]);
    D.setColor('#aeb3b5'); D.tube([lx[0] + 5, ridge, C[1]], [lx[1] - 5, ridge, C[1]], 0.08, 4);
    for (let x = lx[0] + 2; x < lx[1] - 1; x += 2) { D.tube([x, yl + 0.8, lz[0]], [Math.min(Math.max(x, lx[0] + 5), lx[1] - 5), ridge, C[1]], 0.04, 4); D.tube([x, yl + 0.8, lz[1]], [Math.min(Math.max(x, lx[0] + 5), lx[1] - 5), ridge, C[1]], 0.04, 4); }
    S.prism([lx[0], lz[0], lx[1], lz[0], lx[1], lz[1], lx[0], lz[1]], yl, ridge, 0, 0, 'roof');
  }
  for (const [x, z, w, d, h] of [[-150, -240, 6, 3, 2.2], [-140, -262, 3, 3, 1.6], [-165, -225, 4, 2.5, 1.8], [-95, -275, 2.5, 2.5, 1.4], [-120, -232, 3, 2, 1.5]]) {
    if (!inPoly(ring, x, z)) continue;
    D.setColor(h > 2 ? '#a9adae' : '#d9d9d5'); D.box(x - w / 2, yl, z - d / 2, x + w / 2, yl + h, z + d / 2, 1 | 2 | 4 | 16 | 32);
    S.prism([x - w / 2, z - d / 2, x + w / 2, z - d / 2, x + w / 2, z + d / 2, x - w / 2, z + d / 2], yl, yl + h, 0, 0, 'equipment');
  }
  S.prism(ring.flat(), gB, Y(TOP + PARA), 0, 0, 'wall');

  // ---- meshes
  const fr = frontTex(OSM_ID % 977, false), gl = frontTex(OSM_ID % 977, true), sign = signTex(rng(7));
  const M = {
    front: new THREE.MeshStandardMaterial({ map: fr, emissiveMap: gl, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 0.45, metalness: 0.25 }),
    band: new THREE.MeshStandardMaterial({ map: bandTex(r), vertexColors: true, roughness: 0.5, metalness: 0.2 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.45 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.35, emissive: 0xffe2b8, emissiveIntensity: 0 }),
    sign: decal(new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 })),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
  };
  const st = fin(root, 'lyubava', B, M, ['glass', 'lit', 'sign', 'roof', 'front']);
  console.log(`[cherkasy] Lyubava: ${nOpen} openings, canopy ${hasCanopy}, ${(st.tris / 1000).toFixed(1)}k tris, ${st.meshes} meshes, ${(st.verts / 1000).toFixed(1)}k verts, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const bx = ring.reduce((q, p) => [Math.min(q[0], p[0]), Math.min(q[1], p[1]), Math.max(q[2], p[0]), Math.max(q[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
  return {
    footprints: [{ poly: ring, h: Y(TOP + PARA) - g.lo, kind: bld.k, name: 'Любава' }],
    clear: (x, z) => x > bx[0] - 2 && x < bx[2] + 4 && z > bx[1] - 2 && z < bx[3] + 2,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.8 * k; M.sign.emissiveIntensity = 0.9 * k; M.front.emissiveIntensity = 0.9 * k; },
  };
}
