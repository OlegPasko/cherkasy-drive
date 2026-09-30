// OWNER: cherkasy. Музей «Кобзаря» Т. Г. Шевченка – the Tsybulsky brothers' house, vul. Khreshchatyk 217 at the corner
// of Baidy Vyshnevetskoho (OSM way 157594205, heritage). Shevchenko stayed here on 18–22 July 1859; since 1989 the
// ground floor is the museum of one book, the "Kobzar". Rebuilt after the Wikimedia Commons photos (2007–2019): a
// 3-storey neoclassical merchant house of the 1890s in grey-painted brick over a granite-clad ground floor; the canted
// corner to the crossroads crowned by a fish-scale dome on a drum, balustrades with cartouche pedestals over the corner
// and end bays and a wrought lattice between them; lesenes with capitals split the fronts into bays of paired windows
// with plaster swags between the floors, a leaf frieze under a dentilled cornice; cantilevered balconies on consoles
// with dark railings; the bronze bas-relief of Shevchenko on the corner, the granite museum portal with its lettering
// and carved timber doors on Khreshchatyk, a Ukrainian flag, the bronze model of the house on a lectern in front, a
// curved smoked canopy over the basement stair on Baidy Vyshnevetskoho. Lit windows and the portal lamp at night.
//   KOBZAR_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildKobzar({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Every footprint edge becomes a face frame (s to the right seen from outside, y up, o outward); the two street fronts
// and the chamfer get the full order, the yard and the party walls stay plain. The ground floor sits level with the
// Khreshchatyk pavement; the street falls ~2.5 m towards the Dnipro along Baidy Vyshnevetskoho, where the granite plinth
// grows to take it up. Reliefs, lettering and railings are alpha-tested canvas textures on thin quads, so the detail
// costs a few quads each; walls use tiling brick / granite textures with uv in metres.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { ringPts, rng, area2, centroid } from './geo.js';

const OSM_ID = 157594205;
export const KOBZAR_SKIP = new Set([OSM_ID]);

// storey marks above the ground-floor level (m)
const G_TOP = 4.3, BAND = 0.28, F2 = G_TOP + BAND, F3 = 8.6, FRZ = 12.35, CORN = 13.45, ROOF = 13.85, BAL_H = 1.15;
const REV = 0.32;                                          // reveal depth of the old brick walls
const BRICK_M = [2.08, 1.95], GRAN_M = [1.8, 1.2];         // metres per texture repeat
const PAINT = '#ffffff', LESENE = '#f3f4f2', CORNICE = '#e9eaea', FRAME = '#5b3a27', RAILC = '#ffffff', GRANC = '#ffffff';
const GLASS = ['#3f4a52', '#4b555c', '#58615f', '#3a444c', '#6f7270'];

// ------------------------------------------------------------------------------------------------ textures
const TAU = Math.PI * 2;
// canvas path shorthands: an arc or an ellipse as a fresh path, stroked or filled by the caller
const arcP = (g, x, y, r, a0 = 0, a1 = TAU) => { g.beginPath(); g.arc(x, y, r, a0, a1); return g; };
const ovalP = (g, x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); return g; };
const shade = (c, k) => `rgb(${c.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))).join(',')})`;
// light grey paint over brick: courses still read through the paint
const brickTex = (r) => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#c6c9ca'; g.fillRect(0, 0, w, h);
  const bw = w / 8, bh = h / 26;
  for (let j = 0; j < 26; j++) for (let i = 0; i < 9; i++) {
    g.fillStyle = shade([226, 228, 229], 0.96 + r() * 0.06);
    const x0 = i * bw - (j % 2 ? bw / 2 : 0);
    g.fillRect(x0 + 1.5, j * bh + 1.5, bw - 3, bh - 3);
  }
  for (let q = 0; q < 1800; q++) { g.fillStyle = r() < 0.6 ? 'rgba(90,95,100,0.07)' : 'rgba(255,255,255,0.10)'; g.fillRect(r() * w, r() * h, 1 + r() * 5, 1 + r() * 2); }
});
// polished grey granite slabs, 0.9 x 0.6 m, speckled
const graniteTex = (r) => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#85827e'; g.fillRect(0, 0, w, h);
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    g.fillStyle = shade([176, 173, 168], 0.94 + r() * 0.1);
    g.fillRect(i * w / 2 + 2, j * h / 2 + 2, w / 2 - 4, h / 2 - 4);
  }
  for (let q = 0; q < 9000; q++) {
    const u = r();
    g.fillStyle = u < 0.45 ? 'rgba(40,38,36,0.35)' : u < 0.8 ? 'rgba(220,214,206,0.30)' : 'rgba(120,96,90,0.3)';
    g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5);
  }
});
// fish-scale slate for the dome: two scales per repeat, rows offset by half a scale
const scaleTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#2d3136'; g.fillRect(0, 0, w, h);
  for (let row = -1; row < 3; row++) for (let i = -1; i < 3; i++) {
    const cx = i * w / 2 + (row % 2 ? w / 4 : 0) + w / 4, cy = row * h / 2;
    const gr = g.createRadialGradient(cx, cy + h * 0.1, 2, cx, cy, w * 0.3);
    gr.addColorStop(0, '#7b8288'); gr.addColorStop(0.8, '#555c62'); gr.addColorStop(1, '#30353a');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, w / 4 - 1, 0, Math.PI); g.lineTo(cx - w / 4 + 1, cy - h / 2); g.lineTo(cx + w / 4 - 1, cy - h / 2); g.fill();
  }
});
// railings, 1 m per repeat: bars every 12.5 cm with a band of rings under the handrail (balconies)
const railTex = () => canvasTex(128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.fillStyle = g.strokeStyle = '#26292c'; g.lineWidth = 2.5;
  g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6); g.fillRect(0, 26, w, 3);
  for (let x = 0; x < w; x += 16) g.fillRect(x + 6, 0, 3.5, h);
  for (let x = 15.5; x < w + 8; x += 16) arcP(g, x, 16, 5).stroke();
}, { srgb: true });
// the roof lattice between the pedestals: crossed flats on two rails, a spike row on top
const latticeTex = () => canvasTex(128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.strokeStyle = g.fillStyle = '#23262a'; g.lineWidth = 4;
  g.fillRect(0, 18, w, 6); g.fillRect(0, h - 8, w, 8);
  for (let x = -w; x < 2 * w; x += 32) { g.beginPath(); g.moveTo(x, 24); g.lineTo(x + 100, h - 8); g.moveTo(x + 100, 24); g.lineTo(x, h - 8); g.stroke(); }
  for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x + 12, 18); g.lineTo(x + 16, 0); g.lineTo(x + 20, 18); g.fill(); }
});

// ornament atlas (1024 x 1024): plaster swag, leaf frieze, cartouche, the Shevchenko plaque, the museum lettering
const ATLAS = { swag: [0, 0, 512, 256], leaf: [0, 256, 512, 128], word: [0, 384, 512, 160], cart: [512, 0, 128, 256], plaque: [640, 0, 256, 384] };
function relief(g, draw, main = '#eeefec') { // raised plaster: a cast shadow, the body, a rim light
  g.save(); g.translate(3, 4); draw('rgba(40,45,50,0.45)'); g.restore();
  draw(main);
  g.save(); g.translate(-1.2, -1.2); g.globalAlpha = 0.5; draw('#ffffff'); g.restore();
}
const ornTex = () => canvasTex(1024, 1024, (g) => {
  g.clearRect(0, 0, 1024, 1024); g.lineCap = g.lineJoin = 'round';
  // swag: a ribbon ring at the top, two garland loops hanging from it, tassels at the ends
  relief(g, (c) => {
    g.strokeStyle = g.fillStyle = c; g.lineWidth = 16;
    arcP(g, 256, 70, 36).stroke();
    g.beginPath(); g.moveTo(40, 60); g.quadraticCurveTo(140, 230, 225, 95); g.moveTo(472, 60); g.quadraticCurveTo(372, 230, 287, 95); g.stroke();
    g.lineWidth = 10; g.beginPath(); g.moveTo(40, 60); g.quadraticCurveTo(140, 190, 225, 95); g.moveTo(472, 60); g.quadraticCurveTo(372, 190, 287, 95); g.stroke();
    for (const x of [40, 472]) { g.fillRect(x - 9, 50, 18, 150); g.beginPath(); g.moveTo(x - 16, 200); g.lineTo(x + 16, 200); g.lineTo(x, 245); g.fill(); }
    g.beginPath(); g.moveTo(230, 30); g.lineTo(256, 44); g.lineTo(282, 30); g.lineWidth = 12; g.stroke();
  });
  // leaf frieze: a rosette with acanthus sprays both ways
  relief(g, (c) => {
    Object.assign(g, { fillStyle: c, strokeStyle: c, lineWidth: 7 });
    g.fillRect(40, 317, 432, 6);
    for (let k = 0; k < 7; k++) for (const sd of [-1, 1]) {
      const x = 256 + sd * (60 + k * 30), a = sd * 0.7;
      for (const up of [-1, 1]) { g.setTransform(1, 0, 0, 1, x, 320); g.rotate(up * a); ovalP(g, sd * 12, up * 18, 7, 20).fill(); g.setTransform(1, 0, 0, 1, 0, 0); }
    }
    arcP(g, 256, 320, 30).fill();
  });
  relief(g, (c) => { g.fillStyle = c; for (let k = 0; k < 8; k++) arcP(g, 256 + 20 * Math.cos(k * TAU / 8), 320 + 20 * Math.sin(k * TAU / 8), 8).fill(); }, '#dfe1de');
  // cartouche: an oval ring pierced by an upright with scrolls, as on the pedestals
  relief(g, (c) => {
    g.strokeStyle = g.fillStyle = c; g.lineWidth = 12;
    ovalP(g, 576, 110, 38, 46).stroke();
    g.fillRect(569, 40, 14, 190);
    arcP(g, 548, 64, 16, Math.PI, Math.PI * 2.4).stroke(); arcP(g, 604, 64, 16, -Math.PI * 1.4, 0).stroke();
    g.beginPath(); g.moveTo(546, 230); g.lineTo(606, 230); g.lineWidth = 14; g.stroke();
  });
  // the bronze plaque: Shevchenko in his coat, the head resting on a hand, with the 1859 inscription
  const [px, py, pw, ph] = ATLAS.plaque;
  let gr = g.createLinearGradient(px, py, px + pw, py + ph); gr.addColorStop(0, '#6d5a44'); gr.addColorStop(1, '#3e3226');
  g.fillStyle = gr; g.fillRect(px, py, pw, ph);
  g.strokeStyle = '#8a7457'; g.lineWidth = 6; g.strokeRect(px + 6, py + 6, pw - 12, ph - 12);
  const bronze = (x, y, rx, ry, c0, c1) => { const q = g.createRadialGradient(x - rx * 0.35, y - ry * 0.4, 2, x, y, Math.max(rx, ry)); q.addColorStop(0, c0); q.addColorStop(1, c1); g.fillStyle = q; };
  bronze(px + 128, py + 250, 110, 80, '#8f7a5c', '#3a2f24'); g.beginPath(); g.ellipse(px + 128, py + 262, 102, 72, 0, Math.PI, 0); g.fill(); // shoulders, coat
  bronze(px + 125, py + 120, 50, 62, '#b39a74', '#4a3c2c'); ovalP(g, px + 125, py + 122, 46, 58).fill(); // head
  g.fillStyle = '#3b3025'; g.beginPath(); g.moveTo(px + 92, py + 150); g.quadraticCurveTo(px + 125, py + 138, px + 158, py + 150); g.quadraticCurveTo(px + 150, py + 178, px + 128, py + 160); g.quadraticCurveTo(px + 104, py + 178, px + 92, py + 150); g.fill(); // moustache
  g.fillRect(px + 104, py + 112, 14, 5); g.fillRect(px + 134, py + 112, 14, 5); // brows
  bronze(px + 190, py + 150, 24, 60, '#a88f6a', '#46392b'); ovalP(g, px + 186, py + 160, 20, 56, -0.25).fill(); // hand at the temple
  bronze(px + 110, py + 262, 60, 20, '#9e8664', '#4a3c2c'); g.fillRect(px + 60, py + 250, 120, 22); // the writing desk
  g.fillStyle = '#d9c7a4'; g.font = 'bold 15px Georgia, serif'; g.textAlign = 'center';
  ['У ЦЬОМУ БУДИНКУ', 'В 1859 РОЦІ ПЕРЕБУВАВ', 'ТАРАС ШЕВЧЕНКО'].forEach((t, i) => g.fillText(t, px + pw / 2, py + 312 + i * 20));
  // the portal lettering, dark bronze on the granite
  const [wx, wy, ww, wh] = ATLAS.word;
  g.fillStyle = '#1d1b19'; g.font = 'bold 58px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('МУЗЕЙ „КОБЗАРЯ”', wx + ww / 2, wy + wh * 0.3, ww - 20);
  g.fillText('Т. Г. ШЕВЧЕНКА', wx + ww / 2, wy + wh * 0.74, ww - 20);
}, { repeat: false });
const cellUV = (k) => { const [x, y, w, h] = ATLAS[k]; return [x / 1024, 1 - (y + h) / 1024, (x + w) / 1024, 1 - y / 1024]; };

// ------------------------------------------------------------------------------------------------ face frames
// wall from A (left, seen from outside) to B; n points out of the building
function frameOf(A, B, cx, cz) {
  let [ax, az] = A, [bx, bz] = B;
  const mx = (ax + bx) / 2 - cx, mz = (az + bz) / 2 - cz;
  let rx = bx - ax, rz = bz - az;
  if (-rz * mx + rx * mz < 0) { [ax, az, bx, bz] = [bx, bz, ax, az]; rx = -rx; rz = -rz; }
  const w = Math.hypot(rx, rz); rx /= w; rz /= w;
  return { ax, az, bx, bz, w, rx, rz, nx: -rz, nz: rx, R: [rx, 0, rz], N: [-rz, 0, rx], holes: [] };
}
const P = (f, s, y, o = 0) => [f.ax + f.rx * s + f.nx * o, y, f.az + f.rz * s + f.nz * o];
const inv = (v) => [-v[0], -v[1], -v[2]];
const UPV = [0, 1, 0], DNV = [0, -1, 0];

// one flat quad (corners counter-clockwise seen from the n side get fixed automatically), uv per corner optional
function quad4(M, a, b, c, d, n, uv) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  const flip = n[0] * (uy * vz - uz * vy) + n[1] * (uz * vx - ux * vz) + n[2] * (ux * vy - uy * vx) < 0;
  const id = [a, b, c, d].map((p, k) => M.vert(p[0], p[1], p[2], n[0], n[1], n[2], uv?.[k][0] ?? 0, uv?.[k][1] ?? 0));
  flip ? M.quad(id[0], id[3], id[2], id[1]) : M.quad(id[0], id[1], id[2], id[3]);
}
// block on the face: s0..s1 along, y0..y1 up, o0..o1 out; sides bitmask 1 front, 2 back, 4 left, 8 right, 16 top, 32 bottom
function blk(M, f, s0, s1, y0, y1, o0, o1, sides = 61) {
  const c = (s, y, o) => P(f, s, y, o);
  if (sides & 1) quad4(M, c(s0, y0, o1), c(s1, y0, o1), c(s1, y1, o1), c(s0, y1, o1), f.N);
  if (sides & 2) quad4(M, c(s0, y0, o0), c(s1, y0, o0), c(s1, y1, o0), c(s0, y1, o0), inv(f.N));
  if (sides & 4) quad4(M, c(s0, y0, o0), c(s0, y0, o1), c(s0, y1, o1), c(s0, y1, o0), inv(f.R));
  if (sides & 8) quad4(M, c(s1, y0, o0), c(s1, y0, o1), c(s1, y1, o1), c(s1, y1, o0), f.R);
  if (sides & 16) quad4(M, c(s0, y1, o0), c(s1, y1, o0), c(s1, y1, o1), c(s0, y1, o1), UPV);
  if (sides & 32) quad4(M, c(s0, y0, o0), c(s1, y0, o0), c(s1, y0, o1), c(s0, y0, o1), DNV);
}
// flat textured sheet parallel to the face at offset o (atlas cell or metre-tiled uv)
function sheet(M, f, s0, s1, y0, y1, o, uv) {
  quad4(M, P(f, s0, y0, o), P(f, s1, y0, o), P(f, s1, y1, o), P(f, s0, y1, o), f.N, [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]]);
}
// the wall plane between y0 and y1 minus the holes, cut into rectangles at every hole edge; uv in metres per repeat
function wallPlane(M, f, y0, y1, per) {
  const cuts = [y0, y1];
  for (const h of f.holes) for (const y of [h.y0, h.y1]) if (y > y0 && y < y1) cuts.push(y);
  const ys = [...new Set(cuts)].sort((p, q) => p - q);
  for (let i = 1; i < ys.length; i++) {
    const ya = ys[i - 1], yb = ys[i];
    const hit = f.holes.filter((h) => h.y0 < yb - 1e-4 && h.y1 > ya + 1e-4).sort((p, q) => p.s0 - q.s0);
    let s = 0;
    const span = (a, b) => { if (b - a > 1e-3) sheet(M, f, a, b, ya, yb, 0, [a / per[0], ya / per[1], b / per[0], yb / per[1]]); };
    for (const h of hit) { span(s, h.s0); s = Math.max(s, h.s1); }
    span(s, f.w);
  }
}

// ------------------------------------------------------------------------------------------------ openings
// h: { s0, s1, y0, y1, kind: 'win' | 'bal' (door + side light onto a balcony) | 'portal' | 'door', lit, glass, zone }
function hole(K, f, h) {
  const D = K.det, { s0, s1, y0, y1 } = h, back = -REV, t = 0.07, fz = back + 0.06;
  D.setColor(h.zone === 'g' ? '#8e8b86' : '#c9cbcb');
  quad4(D, P(f, s0, y0), P(f, s0, y0, back), P(f, s0, y1, back), P(f, s0, y1), f.R);
  quad4(D, P(f, s1, y0), P(f, s1, y0, back), P(f, s1, y1, back), P(f, s1, y1), inv(f.R));
  quad4(D, P(f, s0, y1), P(f, s1, y1), P(f, s1, y1, back), P(f, s0, y1, back), DNV);
  quad4(D, P(f, s0, y0), P(f, s1, y0), P(f, s1, y0, back), P(f, s0, y0, back), UPV);
  if (h.kind === 'door') { D.setColor('#3d2c20'); blk(D, f, s0, s1, y0, y1, back, back + 0.05, 1); return; }
  if (h.kind === 'portal') { // carved timber double door, glazed leaves, bronze reliefs on the fixed panel
    D.setColor('#a86f35'); blk(D, f, s0, s1, y0, y1, back, back + 0.05, 1);
    D.setColor('#6d4521');
    for (const m of [s0 + 0.45, (s0 + s1) / 2, s1 - 0.08]) blk(D, f, m - 0.04, m + 0.04, y0, y1, back + 0.05, back + 0.09, 1 | 4 | 8);
    D.setColor('#3b3530'); for (let k = 0; k < 4; k++) blk(D, f, s0 + 0.06, s0 + 0.4, y0 + 0.2 + k * 0.6, y0 + 0.7 + k * 0.6, back + 0.05, back + 0.08, 1);
    const G = h.lit ? K.lit : K.glass; G.setColor('#39424a');
    for (const [a, b] of [[s0 + 0.55, (s0 + s1) / 2 - 0.1], [(s0 + s1) / 2 + 0.1, s1 - 0.2]]) for (let k = 0; k < 4; k++) {
      const ya = y0 + 0.25 + k * 0.6; quad4(G, P(f, a, ya, back + 0.06), P(f, b, ya, back + 0.06), P(f, b, ya + 0.42, back + 0.06), P(f, a, ya + 0.42, back + 0.06), f.N);
    }
    return;
  }
  // timber casements in brown: outer frame, a centre mullion, a transom under the fanlight
  D.setColor(FRAME);
  blk(D, f, s0, s1, y1 - t, y1, back, fz, 1 | 32); blk(D, f, s0, s1, y0, y0 + t, back, fz, 1 | 16);
  blk(D, f, s0, s0 + t, y0, y1, back, fz, 1 | 8); blk(D, f, s1 - t, s1, y0, y1, back, fz, 1 | 4);
  const mid = (s0 + s1) / 2, ytr = y1 - Math.min(0.7, (y1 - y0) * 0.28);
  blk(D, f, mid - 0.035, mid + 0.035, y0, ytr, back, fz, 1 | 4 | 8);
  blk(D, f, s0, s1, ytr - 0.035, ytr + 0.035, back, fz, 1 | 16 | 32);
  let gy = y0 + t;
  if (h.kind === 'bal') { gy = y0 + 0.95; D.setColor('#6a4630'); blk(D, f, s0 + t, s1 - t, y0 + t, gy, back, back + 0.035, 1); }
  const G = h.lit ? K.lit : K.glass; G.setColor(h.glass);
  quad4(G, P(f, s0 + t, gy, back + 0.02), P(f, s1 - t, gy, back + 0.02), P(f, s1 - t, y1 - t, back + 0.02), P(f, s0 + t, y1 - t, back + 0.02), f.N);
  // sill: a stone ledge on the plaster floors, a granite one on the ground floor
  D.setColor(h.zone === 'g' ? '#827f7a' : CORNICE);
  if (h.kind === 'win') blk(D, f, s0 - 0.12, s1 + 0.12, y0 - 0.1, y0, -0.02, 0.1, 1 | 4 | 8 | 16 | 32);
}

// balcony: slab on two consoles, railing sheet on three sides, a handrail
function balcony(K, f, c, w, y, S) {
  const D = K.det, a = c - w / 2, b = c + w / 2, d = 0.95, rh = 1.0;
  D.setColor('#a9aba9'); blk(D, f, a, b, y - 0.16, y, 0, d, 1 | 4 | 8 | 16 | 32);
  D.setColor('#c4c6c5');
  for (const s of [a + 0.25, b - 0.45]) {
    blk(D, f, s, s + 0.2, y - 0.62, y - 0.16, 0, 0.35, 1 | 4 | 8 | 32);
    blk(D, f, s, s + 0.2, y - 0.4, y - 0.16, 0.35, 0.7, 1 | 4 | 8 | 32);
  }
  const R = K.rail; R.setColor(RAILC);
  sheet(R, f, a + 0.03, b - 0.03, y, y + rh, d - 0.04, [0, 0, w, 1]);
  for (const s of [a + 0.03, b - 0.03]) quad4(R, P(f, s, y), P(f, s, y, d - 0.04), P(f, s, y + rh, d - 0.04), P(f, s, y + rh), f.R, [[0, 0], [d, 0], [d, 1], [0, 1]]);
  D.setColor('#2a2d30'); blk(D, f, a, b, y + rh, y + rh + 0.05, d - 0.07, d, 1 | 16 | 32);
  for (const s of [a, b - 0.05]) blk(D, f, s, s + 0.05, y + rh, y + rh + 0.05, 0, d - 0.07, 4 | 8 | 16);
  const Q = [[a - 0.05, -0.1], [b + 0.05, -0.1], [b + 0.05, d + 0.05], [a - 0.05, d + 0.05]].map(([s, o]) => { const p = P(f, s, 0, o); return [p[0], p[2]]; });
  S.prism((area2(Q) < 0 ? Q.reverse() : Q).flat(), y - 0.62, y + rh + 0.05, 0, 0, 'awning', 1);
}

// ------------------------------------------------------------------------------------------------ build
export function buildKobzar({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((q) => q.id === OSM_ID);
  if (!b) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521);
  const ring = ringPts(b.p), [cx, cz] = centroid(ring);
  const edges = ring.map((p, i) => frameOf(p, ring[(i + 1) % ring.length], cx, cz));
  // which edge is which: the Khreshchatyk front faces -x, Baidy Vyshnevetskoho -z, the chamfer both; the rest back
  // onto the yard or the neighbours
  const pick = (fx, fz, minW) => edges.filter((e) => e.w >= minW).sort((p, q) => (q.nx * fx + q.nz * fz) - (p.nx * fx + p.nz * fz))[0];
  const fW = pick(-1, 0, 8), fS = pick(0, -1, 8), fC = pick(-0.7, -0.7, 1);
  if (!fW || !fS || !fC || new Set([fW, fS, fC]).size < 3) return null;
  for (const e of edges) e.role = e === fW || e === fS || e === fC ? 'street' : (e.nx > 0.7 && e.w > 8) || (e.nz > 0.7 && e.ax < cx - 2) ? 'party' : 'yard';
  // the chamfer is where fW and fS meet: s = 0 on fW, s = w on fS
  const hAt = (p) => heightAt(p[0], p[2]);
  const yF = hAt(P(fW, fW.w - 3.1, 0, 1.2)) + 0.15;
  const gMin = Math.min(...ring.map(([x, z]) => heightAt(x, z)), hAt(P(fS, 0, 0, 1))) - 0.4;
  const Y = (h) => yF + h, yRoof = Y(ROOF), yTop = Y(ROOF + BAL_H);

  const K = { paint: new MB(), gran: new MB(), det: new MB(), orn: new MB(), rail: new MB(), latt: new MB(), dome: new MB(), glass: new MB(), lit: new MB() };
  const glass = () => GLASS[Math.floor(r() * GLASS.length)];
  const cols = [];  // window columns { f, s, w, bal: [floor2, floor3] }
  const lesenes = []; // [face, s] bay edges
  const swags = [], leaves = [], balus = []; // [face, s0, s1]
  const gwin = (f, s, w = 1.3) => f.holes.push({ s0: s - w / 2, s1: s + w / 2, y0: Y(1.05), y1: Y(3.45), kind: 'win', zone: 'g', glass: glass(), lit: r() < 0.45 });

  // Khreshchatyk front, s from the corner: corner-bay column, a bay of paired windows, the museum bay with its portal
  const wW = fW.w;
  cols.push({ f: fW, s: 2.0, w: 1.5, bal: [true, true] }, { f: fW, s: 5.6, w: 1.25 }, { f: fW, s: 7.6, w: 1.25 }, { f: fW, s: wW - 3.1, w: 1.5, bal: [true, true] });
  lesenes.push([fW, 0.35], [fW, 3.8], [fW, 9.4], [fW, wW - 0.35]);
  swags.push([fW, 4.8, 8.4]); leaves.push([fW, 4.5, 8.7]); balus.push([fW, 0, 3.8], [fW, 9.4, wW]);
  gwin(fW, 2.0); gwin(fW, 6.6, 1.6);
  const pS0 = wW - 4.5, pS1 = wW - 1.7, yd = yF;
  fW.holes.push({ s0: pS0 + 0.35, s1: pS1 - 0.35, y0: yd, y1: yd + 2.75, kind: 'portal', zone: 'g', lit: true });
  // the chamfer: a window on each floor, a balcony on the top one, the bronze plaque on the ground floor
  cols.push({ f: fC, s: fC.w / 2, w: 1.2, bal: [false, true], bw: Math.min(2.6, fC.w - 0.3) });
  balus.push([fC, 0, fC.w]);
  // Baidy Vyshnevetskoho front, s from the far (east) end: end bay with balconies, three bays of paired windows, the
  // corner-bay column; a side door at the east end and the basement stair canopy
  const wS = fS.w;
  cols.push({ f: fS, s: 2.3, w: 1.5, bal: [true, true] }, { f: fS, s: wS - 2.0, w: 1.5, bal: [true, true] });
  const bays = [[4.6, 10.0], [10.0, 15.6], [15.6, wS - 3.8]];
  for (const [a, c] of bays) {
    const m = (a + c) / 2;
    cols.push({ f: fS, s: m - 1.05, w: 1.25 }, { f: fS, s: m + 1.05, w: 1.25 });
    swags.push([fS, m - 1.9, m + 1.9]); leaves.push([fS, m - 2.1, m + 2.1]);
    if (m < 12 || m > 14) gwin(fS, m, 1.5);
  }
  lesenes.push([fS, 0.35], [fS, 4.6], [fS, 10.0], [fS, 15.6], [fS, wS - 3.8], [fS, wS - 0.35]);
  balus.push([fS, 0, 4.6], [fS, wS - 3.8, wS]);
  gwin(fS, wS - 2.0); gwin(fS, 3.3, 1.0);
  const yDoor = hAt(P(fS, 1.4, 0, 1)) + 0.15;
  fS.holes.push({ s0: 0.8, s1: 2.0, y0: yDoor, y1: yDoor + 2.4, kind: 'door', zone: 'g' });
  // upper floors
  for (const c of cols) for (const [k, y0, y1] of [[0, Y(F2 + 0.75), Y(F2 + 3.3)], [1, Y(F3 + 0.7), Y(F3 + 3.0)]]) {
    const bal = c.bal?.[k];
    c.f.holes.push({ s0: c.s - c.w / 2, s1: c.s + c.w / 2, y0: bal ? Y(k ? F3 : F2) + 0.02 : y0, y1, kind: bal ? 'bal' : 'win', zone: 'u', glass: glass(), lit: r() < 0.35 });
  }
  // yard walls: a plain window per floor every ~3 m
  for (const f of edges) if (f.role === 'yard' && f.w > 2.5) for (let s = 1.6; s < f.w - 1; s += 3.2) for (const y of [2.6, F2 + 1.1, F3 + 1.0])
    f.holes.push({ s0: s - 0.6, s1: s + 0.6, y0: Y(y - 1.5), y1: Y(y + 0.7), kind: 'win', zone: 'u', glass: glass(), lit: r() < 0.3 });

  // ---- walls: granite ground floor, painted brick above; the band between them; party walls stay blank
  for (const f of edges) {
    const street = f.role === 'street';
    if (street) {
      wallPlane(K.gran, f, gMin, Y(G_TOP), GRAN_M);
      wallPlane(K.paint, f, Y(G_TOP), yRoof, BRICK_M);
    } else wallPlane(K.paint, f, gMin, yRoof + (f.role === 'party' ? 0.4 : 0.6), BRICK_M);
    for (const h of f.holes) hole(K, f, h);
    if (!street) { K.det.setColor('#8d9091'); blk(K.det, f, -0.02, f.w + 0.02, yRoof + 0.5, yRoof + 0.62, -0.35, 0.04, 1 | 16); continue; }
    // the ground floor's granite cornice, the belt course between the floors, the frieze and the dentilled cornice
    K.gran.setColor('#e2e0dc'); blk(K.gran, f, -0.01, f.w + 0.01, Y(G_TOP), Y(G_TOP + BAND), 0, 0.14, 1 | 16 | 32);
    K.det.setColor(CORNICE);
    blk(K.det, f, 0, f.w, Y(F3) - 0.12, Y(F3) + 0.05, 0, 0.12, 1 | 16 | 32);
    blk(K.det, f, 0, f.w, Y(FRZ) - 0.1, Y(FRZ) + 0.06, 0, 0.14, 1 | 16 | 32);
    blk(K.det, f, -0.1, f.w + 0.1, Y(CORN), Y(CORN) + 0.14, 0, 0.26, 1 | 16 | 32);
    blk(K.det, f, -0.2, f.w + 0.2, Y(CORN) + 0.14, Y(ROOF), 0, 0.5, 1 | 16 | 32);
    K.det.setColor('#dcdedd');
    for (let s = 0.12; s < f.w - 0.1; s += 0.3) blk(K.det, f, s, s + 0.14, Y(CORN) - 0.16, Y(CORN), 0, 0.18, 1 | 4 | 8 | 32);
    // spandrel panels under the top-floor windows and a sill string under the second-floor ones
    K.det.setColor(LESENE);
    for (const c of cols) if (c.f === f) {
      blk(K.det, f, c.s - c.w / 2 - 0.2, c.s + c.w / 2 + 0.2, Y(F2 + 3.3), Y(F2 + 3.48), 0, 0.1, 1 | 4 | 8 | 16 | 32); // hood over the 2nd floor
      blk(K.det, f, c.s - c.w / 2 - 0.25, c.s + c.w / 2 + 0.25, Y(F3 + 3.0), Y(F3 + 3.2), 0, 0.12, 1 | 4 | 8 | 16 | 32); // hood over the 3rd floor
    }
  }
  // lesenes with stepped capitals and zigzag dentils
  for (const [f, s] of lesenes) {
    K.paint.setColor(LESENE);
    const a = Math.max(0, s - 0.32), c = Math.min(f.w, s + 0.32);
    const uv = [a / BRICK_M[0], Y(G_TOP + BAND) / BRICK_M[1], c / BRICK_M[0], Y(FRZ) / BRICK_M[1]];
    sheet(K.paint, f, a, c, Y(G_TOP + BAND), Y(FRZ) - 0.3, 0.12, uv);
    blk(K.paint, f, a, c, Y(G_TOP + BAND), Y(FRZ) - 0.3, 0, 0.12, (a > 0 ? 4 : 0) | (c < f.w ? 8 : 0));
    K.det.setColor(CORNICE);
    blk(K.det, f, a - 0.06, c + 0.06, Y(FRZ) - 0.3, Y(FRZ) - 0.1, 0, 0.2, 1 | 4 | 8 | 16 | 32);
    blk(K.det, f, a - 0.1, c + 0.1, Y(FRZ) - 0.1, Y(FRZ) + 0.06, 0, 0.22, 1 | 4 | 8 | 32);
    K.det.setColor('#d5d7d6');
    for (let k = 0; k < 3; k++) blk(K.det, f, a + 0.04 + k * 0.2, a + 0.16 + k * 0.2, Y(FRZ) - 0.45, Y(FRZ) - 0.3, 0.12, 0.17, 1 | 4 | 8 | 32);
  }
  // plaster reliefs: swags between the floors, leaf sprays in the frieze
  K.orn.setColor('#ffffff');
  const US = cellUV('swag'), UL = cellUV('leaf');
  for (const [f, a, c] of swags) sheet(K.orn, f, a, c, Y(F2 + 3.5), Y(F3 + 0.55), 0.03, US);
  for (const [f, a, c] of leaves) sheet(K.orn, f, a, c, Y(FRZ + 0.2), Y(CORN - 0.25), 0.03, UL);

  // ---- balconies
  for (const c of cols) (c.bal ?? []).forEach((on, k) => on && balcony(K, c.f, c.s, c.bw ?? c.w + 0.9, Y(k ? F3 : F2), S));

  // ---- parapet: balustrades on the corner and end bays, lattice between, cartouche pedestals at the breaks
  const UC = cellUV('cart'), yP = yRoof;
  const pedestal = (f, s) => {
    K.det.setColor(CORNICE); blk(K.det, f, s - 0.3, s + 0.3, yP, yTop + 0.2, -0.3, 0.3, 1 | 4 | 8 | 16);
    blk(K.det, f, s - 0.36, s + 0.36, yTop + 0.2, yTop + 0.3, -0.36, 0.36, 1 | 4 | 8 | 16 | 32);
    sheet(K.orn, f, s - 0.24, s + 0.24, yP + 0.15, yTop + 0.1, 0.31, UC);
  };
  for (const f of [fW, fC, fS]) {
    const spans = balus.filter((q) => q[0] === f).map((q) => [q[1], q[2]]).sort((p, q) => p[0] - q[0]);
    const posts = new Set([0, f.w]);
    for (const [a, c] of spans) {
      posts.add(a); posts.add(c);
      K.det.setColor(CORNICE);
      blk(K.det, f, a, c, yP, yP + 0.18, -0.25, 0.22, 1 | 2 | 16);
      blk(K.det, f, a, c, yTop - 0.16, yTop, -0.28, 0.25, 1 | 2 | 16 | 32);
      K.det.setColor('#eeefed');
      for (let s = a + 0.4; s < c - 0.25; s += 0.34) { const p = P(f, s, 0, 0); K.det.cyl(p[0], yP + 0.18, p[2], 0.09, 0.07, yTop - 0.16 - yP - 0.18, 6, false); }
    }
    // lattice on a low base wherever no balustrade runs
    let s = 0;
    const gaps = [];
    for (const [a, c] of spans) { if (a > s + 0.5) gaps.push([s, a]); s = Math.max(s, c); }
    if (f.w > s + 0.5) gaps.push([s, f.w]);
    for (const [a, c] of gaps) {
      K.det.setColor(CORNICE); blk(K.det, f, a, c, yP, yP + 0.35, -0.25, 0.22, 1 | 2 | 16);
      K.latt.setColor(RAILC); sheet(K.latt, f, a, c, yP + 0.35, yTop + 0.05, 0, [a, 0, c, 1]);
      for (let q = a + 4.5; q < c - 2; q += 4.5) posts.add(q);
    }
    if (f === fC) pedestal(f, f.w / 2); else for (const q of posts) pedestal(f, q);
    const e0 = P(f, 0, 0, -0.1), e1 = P(f, f.w, 0, -0.1);
    Z.edge(e0[0], e0[2], e1[0], e1[2], yTop, f.nx, f.nz);
    const Q = [[0, -0.4], [f.w, -0.4], [f.w, 0.5], [0, 0.5]].map(([s2, o]) => { const p = P(f, s2, 0, o); return [p[0], p[2]]; });
    S.prism((area2(Q) < 0 ? Q.reverse() : Q).flat(), yRoof, yTop + 0.3, 0, 0, 'wall');
  }
  // the roof itself: a shallow tin deck behind the parapets
  K.det.setColor('#4d5357'); K.det.fill(ring, [], yRoof - 0.02, true);

  // ---- the dome over the corner: a drum with pilasters, fish-scale cupola, a lantern ring and a pointed cap
  const mC = P(fC, fC.w / 2, 0, 0), dx = mC[0] - fC.nx * 4.3, dz = mC[2] - fC.nz * 4.3, RD = 3.2, yd0 = yRoof, yd1 = yRoof + 1.4;
  K.paint.setColor(PAINT); K.paint.cyl(dx, yd0, dz, RD, RD, yd1 - yd0, 20, false);
  K.det.setColor(CORNICE); K.det.cyl(dx, yd1 - 0.02, dz, RD + 0.22, RD + 0.22, 0.2, 20, false);
  for (let a = 0; a < TAU - 1e-6; a += TAU / 16) { K.det.boxC(dx + Math.cos(a) * RD, (yd0 + yd1) / 2, dz + Math.sin(a) * RD, 0.22, yd1 - yd0, 0.22); }
  const segs = 32, rows = 10, DH = 3.3, grid = [];
  for (let i = 0; i <= rows; i++) {
    const ph = (i / rows) * Math.PI / 2 * 0.86, rr = (RD + 0.15) * Math.cos(ph), yy = yd1 + 0.18 + DH * Math.sin(ph) / Math.sin(Math.PI / 2 * 0.86);
    const line = [];
    for (let k = 0; k <= segs; k++) {
      const a = (k / segs) * Math.PI * 2, nx = Math.cos(a) * Math.cos(ph), ny = Math.sin(ph) * 1.2, nz = Math.sin(a) * Math.cos(ph), L = Math.hypot(nx, ny, nz);
      line.push(K.dome.vert(dx + Math.cos(a) * rr, yy, dz + Math.sin(a) * rr, nx / L, ny / L, nz / L, (k / segs) * 26, i * 0.55 * 2));
    }
    grid.push(line);
  }
  for (let i = 1; i <= rows; i++) for (let k = 0; k < segs; k++) K.dome.quad(grid[i - 1][k], grid[i - 1][k + 1], grid[i][k + 1], grid[i][k]);
  const yT = yd1 + 0.18 + DH, rT = (RD + 0.15) * Math.cos(Math.PI / 2 * 0.86);
  K.det.setColor(CORNICE); K.det.cyl(dx, yT - 0.05, dz, rT + 0.1, rT + 0.1, 0.35, 16);
  K.det.setColor('#4a5055'); K.det.cyl(dx, yT + 0.3, dz, rT + 0.18, 0.05, 0.6, 16, false); K.det.cyl(dx, yT + 0.9, dz, 0.035, 0.02, 1.0, 5);
  S.cyl(dx, dz, yRoof, yT + 0.5, RD + 0.2, 0.8, 'wall');

  // ---- the corner plaque, the portal, the flag, the lectern with the bronze model, the basement canopy
  const UP_ = cellUV('plaque'), UW = cellUV('word');
  K.orn.setColor('#ffffff'); sheet(K.orn, fC, fC.w / 2 - 0.62, fC.w / 2 + 0.62, Y(1.0), Y(2.85), 0.07, UP_);
  K.gran.setColor('#8a8680'); blk(K.gran, fC, fC.w / 2 - 0.72, fC.w / 2 + 0.72, Y(0.92), Y(2.95), 0, 0.06, 1 | 4 | 8 | 16 | 32);
  blk(K.gran, fC, fC.w / 2 - 0.25, fC.w / 2 + 0.25, Y(0.68), Y(0.8), 0, 0.22, 1 | 4 | 8 | 16 | 32); // flower shelf
  // portal: a proud dark granite frame with the lettering panel over the doors
  K.gran.setColor('#b4b1ab');
  const pT = yd + 3.9;
  blk(K.gran, fW, pS0, pS0 + 0.35, yd, pT, 0, 0.25, 1 | 4 | 8 | 16); blk(K.gran, fW, pS1 - 0.35, pS1, yd, pT, 0, 0.25, 1 | 4 | 8 | 16);
  blk(K.gran, fW, pS0, pS1, yd + 2.75, pT, 0, 0.25, 1 | 4 | 8 | 16 | 32);
  blk(K.gran, fW, pS0 - 0.1, pS1 + 0.1, pT, pT + 0.12, 0, 0.32, 1 | 4 | 8 | 16 | 32);
  K.orn.setColor('#ffffff'); sheet(K.orn, fW, pS0 + 0.3, pS1 - 0.3, yd + 2.85, yd + 3.75, 0.26, UW);
  const pStep = hAt(P(fW, (pS0 + pS1) / 2, 0, 1.2));
  K.gran.setColor('#7b7874'); blk(K.gran, fW, pS0 - 0.2, pS1 + 0.2, Math.min(pStep, yd) - 0.4, yd, 0, 0.9, 1 | 4 | 8 | 16);
  K.det.setColor('#fff3c8'); blk(K.det, fW, (pS0 + pS1) / 2 - 0.12, (pS0 + pS1) / 2 + 0.12, yd + 2.55, yd + 2.7, -REV, 0.0, 32);
  const lampP = P(fW, (pS0 + pS1) / 2, yd + 2.6, -0.1);
  // flag on a bracket left of the portal, slanting out over the pavement
  const fb = P(fW, pS0 - 0.35, yd + 3.3, 0.05), ft = P(fW, pS0 - 0.35, yd + 4.3, 1.3);
  K.det.setColor('#2c2c2c'); K.det.tube(fb, ft, 0.025, 5);
  const fl = (y0, y1, col) => { K.det.setColor(col); const q = (t, dy) => [fb[0] + (ft[0] - fb[0]) * t + fW.rx * 0.02, fb[1] + (ft[1] - fb[1]) * t - dy, fb[2] + (ft[2] - fb[2]) * t + fW.rz * 0.02];
    const A = q(0.35, y0), B = q(1, y0), C = q(1, y1), D = q(0.35, y1); quad4(K.det, A, B, C, D, fW.R); quad4(K.det, A, B, C, D, inv(fW.R)); };
  fl(0, 0.45, '#1f5fb8'); fl(0.45, 0.9, '#f2c230');
  // lectern (a fluted post and a sloping plate) carrying the bronze model of the house, 2.8 m out from the portal
  const lp = P(fW, (pS0 + pS1) / 2 + 0.2, 0, 2.8), gL = hAt(lp);
  K.det.setColor('#5d6064'); K.det.boxC(lp[0], gL + 0.45, lp[2], 0.45, 0.9, 0.45);
  K.det.setColor('#8a8d90'); blk(K.det, fW, (pS0 + pS1) / 2 - 0.55, (pS0 + pS1) / 2 + 0.95, gL + 0.9, gL + 0.96, 2.35, 3.25, 1 | 2 | 4 | 8 | 16 | 32);
  S.box(lp[0] - 0.3, gL, lp[2] - 0.3, lp[0] + 0.3, gL + 1.0, lp[2] + 0.3, 'pole');
  // the curved smoked canopy over the basement stair on Baidy Vyshnevetskoho
  const cA = 12.0, cB = 15.6, gc = hAt(P(fS, (cA + cB) / 2, 0, 1)), cD = 2.1, cH = 1.25;
  K.gran.setColor('#8f8b86'); blk(K.gran, fS, cA - 0.1, cB + 0.1, gc - 0.3, gc + 0.35, 0, cD, 1 | 4 | 8 | 16);
  K.det.setColor('#2e3438');
  const arc = Array.from({ length: 9 }, (_, k) => [cD * Math.cos(k * TAU / 32), gc + 0.35 + cH * Math.sin(k * TAU / 32)]); // quarter ellipse, wall to kerb
  for (let k = 1; k < arc.length; k++) {
    const [o0, y0] = arc[k - 1], [o1, y1] = arc[k], nx = (y1 - y0), no = -(o1 - o0), L = Math.hypot(nx, no);
    const n = [fS.nx * nx / L, no / L, fS.nz * nx / L];
    quad4(K.det, P(fS, cA, y0, o0), P(fS, cB, y0, o0), P(fS, cB, y1, o1), P(fS, cA, y1, o1), n);
  }
  for (const s of [cA, cB]) { K.det.setColor('#23282b'); for (let k = 1; k < arc.length; k++) quad4(K.det, P(fS, s, arc[0][1], 0), P(fS, s, arc[k - 1][1], arc[k - 1][0]), P(fS, s, arc[k][1], arc[k][0]), P(fS, s, arc[k][1], arc[k][0]), s === cA ? inv(fS.R) : fS.R); }
  const Qc = [[cA - 0.1, 0], [cB + 0.1, 0], [cB + 0.1, cD], [cA - 0.1, cD]].map(([s, o]) => { const p = P(fS, s, 0, o); return [p[0], p[2]]; });
  S.prism((area2(Qc) < 0 ? Qc.reverse() : Qc).flat(), gc - 0.3, gc + 0.35 + cH, 0, 0, 'wall');

  // ---- the house itself
  S.prism((area2(ring) < 0 ? ring.slice().reverse() : ring).flat(), gMin, yRoof + 0.5, 0, 0, 'wall');

  // ---- meshes
  const T = { brick: brickTex(r), gran: graniteTex(r), orn: ornTex(), rail: railTex(), latt: latticeTex(), dome: scaleTex() };
  const M = {
    paint: new THREE.MeshStandardMaterial({ map: T.brick, vertexColors: true, roughness: 0.9 }),
    gran: new THREE.MeshStandardMaterial({ map: T.gran, vertexColors: true, roughness: 0.45 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    orn: new THREE.MeshStandardMaterial({ map: T.orn, vertexColors: true, roughness: 0.8, alphaTest: 0.45 }),
    rail: new THREE.MeshStandardMaterial({ map: T.rail, vertexColors: true, roughness: 0.5, metalness: 0.5, alphaTest: 0.4, side: THREE.DoubleSide }),
    latt: new THREE.MeshStandardMaterial({ map: T.latt, vertexColors: true, roughness: 0.5, metalness: 0.5, alphaTest: 0.4, side: THREE.DoubleSide }),
    dome: new THREE.MeshStandardMaterial({ map: T.dome, roughness: 0.55, metalness: 0.35 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.35, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffd8a0, emissiveIntensity: 0 }),
  };
  M.orn.map.wrapS = M.orn.map.wrapT = THREE.ClampToEdgeWrapping;
  const group = Object.assign(new THREE.Group(), { name: 'kobzar' });
  root.add(group);
  const bronze = new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.45, metalness: 0.75 });
  const model = Object.assign(new THREE.Group(), { name: 'kobzar-model' });
  let nV = 0;
  for (const [k, D] of Object.entries(K)) {
    if (!D.v) continue;
    nV += D.v;
    const geo = D.build(), glassy = k === 'glass' || k === 'lit';
    group.add(Object.assign(new THREE.Mesh(geo, M[k]), { name: 'kobzar-' + k, castShadow: !glassy, receiveShadow: true }));
    if (k !== 'rail' && k !== 'latt' && k !== 'orn') model.add(new THREE.Mesh(geo, bronze)); // the same geometry, cast in bronze
  }
  // the model stands on the lectern plate at 1:60, turned like the house
  const k60 = 1 / 60, mTop = P(fW, (pS0 + pS1) / 2 + 0.2, gL + 0.96, 2.8);
  model.scale.setScalar(k60);
  model.position.set(mTop[0] - cx * k60, mTop[1] - gMin * k60, mTop[2] - cz * k60);
  model.traverse((m) => { m.castShadow = true; });
  group.add(model);
  // a warm lamp over the portal
  const lamp = new THREE.PointLight(0xffd29a, 0, 9, 1.6);
  lamp.position.set(lampP[0] + fW.nx * 0.6, lampP[1] - 0.2, lampP[2] + fW.nz * 0.6);
  group.add(lamp);
  console.log(`[cherkasy] Kobzar museum: ${edges.reduce((n, f) => n + f.holes.length, 0)} openings, ${(nV / 1000).toFixed(1)}k verts in ${(performance.now() - t0).toFixed(0)} ms`);

  const bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const [x, z] of ring) { bb.x0 = Math.min(bb.x0, x); bb.x1 = Math.max(bb.x1, x); bb.z0 = Math.min(bb.z0, z); bb.z1 = Math.max(bb.z1, z); }
  return {
    footprints: [{ poly: ring, h: yTop - gMin, kind: 'public', name: 'Музей «Кобзаря»' }],
    // trees keep off the house and the pavement strip with the lectern and the canopy
    clear: (x, z) => x > bb.x0 - 4 && x < bb.x1 + 1 && z > bb.z0 - 4 && z < bb.z1 + 1,
    update() { const n = nightK.value; M.lit.emissiveIntensity = 1.3 * n; lamp.intensity = 6 * n; },
  };
}
