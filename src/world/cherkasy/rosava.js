// OWNER: cherkasy. The former hotel «Росава», вул. Верхня Горова, 29 (OSM way 258815219; built 1990, the Cherkasy
// appeal court since 2013), and in front of it the Пам’ятник варенику as it stood in 2006–2013 (quest «Таємниці Черкас»,
// card `varenyk`). Built after the Commons photos (HotelRosavaCherkasy.JPG, about 2012; «Апеляційний суд Черкаської
// області.jpg», 2019; the uk.wikipedia photo of the monument) and the satellite view:
//   - the podium (the OSM part along the street): two storeys, the ground one glazed between grey granite piers, the
//     upper one a white band of windows between brick-red fins, a brick-red coping; the entrance in the middle of the
//     street front up a flight of steps under a flat canopy;
//   - the tower (the OSM part behind, levels 9): beige render, window stacks set in brick-red panels, loggia stacks,
//     the stepped (sawtooth) long sides of the slab with the balconies, and the tall stair block at its street end that
//     carries the city's emblem panel. The «РОСАВА» letters on the roof came down with the hotel, so there are none.
//   - the monument (Іван Фізер, ceramic, 2.5 m): Cossack Mamai sitting cross-legged on a low cream plinth with a pot of
//     varenyky in his right arm and his left thumb up, a bottle and a cup at his feet, and behind him the giant
//     varenyk as a crescent moon with a crimped edge and a relief of petrykivka leaves; in a bed with a granite kerb,
//     a few metres before the entrance. Removed on 16 Oct 2013; Oleg wanted it back in the game.
// Guesses: the storey split of the podium's north end, the window rhythm on the back and the sawtooth sides (no
// photos), the emblem's design (drawn as a generic gilded shield panel).
//   ROSAVA_SKIP: the OSM ids replaced here (buildings.js skips their extrusion)
//   ROSAVA_MONUMENT: [x, z] of the monument's plinth (places.js keeps a small ring round it)
//   buildRosava({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints, levels } | null
//     levels: { floor, podium, tower, stair, plinthTop } heights (tests)
// Walls are one quad per face and height band over painted atlases (u by bay, v by storey), lit windows from a second
// mask by nightK; the monument is one smooth ceramic skin (sculpt.js SG with bohdan.js sweeps).
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { SG, canvasTex } from './sculpt.js';
import { sweep, ell, put, mapper } from './bohdan.js';
import { rng, inPoly } from './geo.js';
import { ringFaces, at, quad, box, rect, solid, finish, speckle } from './slabkit.js';

const OSM_ID = 258815219;
export const ROSAVA_SKIP = new Set([OSM_ID]);
export const ROSAVA_MONUMENT = [424.3, 553.5];

const G1 = 4.2, G2 = 3.8, PAR = 0.6, FH = 3.0, NT = 7;   // podium storeys, parapet, tower storey, tower storeys over the podium
const BAY = 3.3, TB = 3.0, AC = 8;                       // podium bay, tower bay, tower atlas columns
const PODIUM_H = G1 + G2;                                // 8.0: the podium roof (the coping on top of it)
const RENDER = '#e2d6bf', BRICK = '#a45a3c';

// ------------------------------------------------------------------------------------------------ textures
// the podium: PB bays x 8 m; ground storey glass between granite piers, the upper band of windows between brick
// fins; the mask lights the lobby glass and some of the upper windows (lit[i]: 1 ground, 2 upper)
const PB = 6;
function podiumTex(mask, lit) {
  const PX = 40, W = BAY * PX, H = PODIUM_H * PX; // 40 px a metre
  const r = rng(2006);
  return canvasTex(PB * W, H, (g) => {
    for (let i = 0; i < PB; i++) {
      const Y = (y) => H - y * PX, fill = (c, x0, y0, x1, y1) => { g.fillStyle = c; g.fillRect(i * W + x0 * PX, Y(y1), (x1 - x0) * PX, (y1 - y0) * PX); };
      if (mask) {
        fill('#000', 0, 0, BAY, 8);
        if (lit[i] & 1) fill('#fff', 0.5, 0.6, 2.8, 3.7);
        if (lit[i] & 2) fill('#fff', 0.63, 5.28, 2.67, 6.82);
        continue;
      }
      fill('#eeeae2', 0, 0, BAY, 8);
      // ground storey: granite pier at the bay's left edge, dark glass with mullions and a transom
      fill('#5d5d5c', 0, 0, 0.45, 4.2); for (let k = 0; k < 40; k++) { const x = r() * 0.45, y = r() * 4.2; fill('rgba(255,255,255,0.08)', x, y, x + 0.03, y + 0.03); }
      const gl = g.createLinearGradient(0, Y(3.8), 0, Y(0.5)); gl.addColorStop(0, '#6f7f8a'); gl.addColorStop(1, '#2f3a42');
      g.fillStyle = gl; g.fillRect(i * W + 0.5 * PX, Y(3.7), 2.3 * PX, 3.1 * PX);
      fill('#cfd2d0', 0.45, 0.45, BAY, 0.6); fill('#cfd2d0', 0.45, 3.7, BAY, 3.9);
      for (const x of [0.45, 1.6, 2.8]) fill('#b8bcbc', x, 0.6, x + 0.06, 3.7);
      fill('#b8bcbc', 0.5, 2.85, 2.8, 2.9);
      // the white band; a brick-red panel between the wide upper windows, a brick coping on top
      fill(BRICK, 0, 4.75, 0.45, 7.3); fill(BRICK, 2.85, 4.75, BAY, 7.3);
      for (let y = 4.8; y < 7.3; y += 0.25) { fill('rgba(240,225,210,0.35)', 0, y, 0.45, y + 0.02); fill('rgba(240,225,210,0.35)', 2.85, y, BAY, y + 0.02); }
      fill('#f4f3ee', 0.55, 5.2, 2.75, 6.9);
      const gu = g.createLinearGradient(0, Y(6.85), 0, Y(5.25)); gu.addColorStop(0, '#a8b8c2'); gu.addColorStop(1, '#4e5c66');
      g.fillStyle = gu; g.fillRect(i * W + 0.63 * PX, Y(6.82), 2.04 * PX, 1.54 * PX);
      fill('#f4f3ee', 1.62, 5.25, 1.68, 6.85); fill('#f4f3ee', 0.6, 6.35, 2.7, 6.4);
      fill('#b8b5ad', 0.5, 5.12, 2.8, 5.22);
      fill(BRICK, 0, 7.55, BAY, 8.0); fill('rgba(0,0,0,0.12)', 0, 7.5, BAY, 7.55);
    }
  }, { repeat: true });
}
// the tower: AC bays x NT storeys; each column is a window stack in a brick panel, a loggia stack or a plain stack
// with a small window; the mask lights some of the panes
function towerTex(mask, kinds, lit) {
  const CW = 96, CH = 96, PX = CW / TB;
  return canvasTex(AC * CW, NT * CH, (g) => {
    const fill = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    fill(mask ? '#000' : RENDER, 0, 0, AC * CW, NT * CH);
    const r = rng(1990);
    for (let i = 0; i < AC; i++) for (let j = 0; j < NT; j++) {
      const x = i * CW, y = j * CH, k = kinds[i], on = lit[i * NT + j];
      if (!mask) for (let q = 0; q < 60; q++) fill(r() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(90,70,50,0.07)', x + r() * CW, y + r() * CH, 2, 2);
      // window: [x0, y0, w, h] in metres from the cell's top-left
      const win = (x0, y0, w, h) => {
        if (mask) { if (on) fill('#fff', x + x0 * PX + 3, y + y0 * PX + 3, w * PX - 6, h * PX - 6); return; }
        fill('#f2f1ec', x + x0 * PX, y + y0 * PX, w * PX, h * PX);
        const gr = g.createLinearGradient(0, y + y0 * PX, 0, y + (y0 + h) * PX); gr.addColorStop(0, '#9eb0bc'); gr.addColorStop(1, '#45535d');
        g.fillStyle = gr; g.fillRect(x + x0 * PX + 3, y + y0 * PX + 3, w * PX - 6, h * PX - 6);
        fill('#f2f1ec', x + (x0 + w * 0.55) * PX, y + y0 * PX, 3, h * PX);
      };
      if (k === 0) { // a brick panel stack with the window in it
        if (!mask) { fill(BRICK, x + 0.55 * PX, y, 1.9 * PX, CH); for (let yy = 4; yy < CH; yy += 8) fill('rgba(235,215,195,0.28)', x + 0.55 * PX, y + yy, 1.9 * PX, 1); }
        win(0.75, 0.75, 1.5, 1.5);
      } else if (k === 1) { // a loggia: a dark recess over a light concrete balustrade
        if (!mask) { fill('#57514b', x + 0.2 * PX, y, 2.6 * PX, 1.95 * PX); fill('#cfc9bd', x + 0.2 * PX, y + 1.95 * PX, 2.6 * PX, 1.05 * PX); fill('#b9b2a5', x + 0.2 * PX, y + 1.95 * PX, 2.6 * PX, 3); }
        win(0.6, 0.35, 1.8, 1.55);
      } else win(0.95, 0.9, 1.1, 1.3); // the stair / corridor stack
    }
  }, { repeat: true });
}
// the emblem panel on the stair block: a gilded shield on a pale mosaic field (a stand-in, the real design unknown)
function emblemTex() {
  return canvasTex(256, 320, (g, w, h) => {
    const r = rng(29);
    g.fillStyle = '#cfc6b4'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 8) for (let j = 0; j < h; j += 8) { g.fillStyle = `rgba(${r() < 0.5 ? '255,250,240' : '120,110,95'},${0.1 + r() * 0.15})`; g.fillRect(i, j, 7, 7); }
    g.strokeStyle = '#7d6b4c'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#c9a24a'; g.beginPath(); g.moveTo(48, 50); g.lineTo(w - 48, 50); g.lineTo(w - 48, 190); g.quadraticCurveTo(w - 50, 260, w / 2, 285); g.quadraticCurveTo(50, 260, 48, 190); g.closePath(); g.fill();
    g.fillStyle = '#3f6aa6'; g.beginPath(); g.moveTo(64, 66); g.lineTo(w - 64, 66); g.lineTo(w - 64, 186); g.quadraticCurveTo(w - 66, 246, w / 2, 266); g.quadraticCurveTo(66, 246, 64, 186); g.closePath(); g.fill();
    // a stylised Cossack figure and the wavy river under it, in gold
    g.fillStyle = '#e2c26a';
    g.beginPath(); g.arc(w / 2, 104, 16, 0, Math.PI * 2); g.fill();
    g.fillRect(w / 2 - 14, 120, 28, 62); g.fillRect(w / 2 - 40, 128, 80, 10); g.fillRect(w / 2 - 14, 180, 10, 40); g.fillRect(w / 2 + 4, 180, 10, 40);
    g.strokeStyle = '#e2c26a'; g.lineWidth = 6;
    for (let k = 0; k < 2; k++) { g.beginPath(); for (let x = 74; x <= w - 74; x += 4) g.lineTo(x, 232 + k * 14 + 5 * Math.sin(x / 9)); g.stroke(); }
  }, { repeat: false });
}

// ------------------------------------------------------------------------------------------------ the monument
// Mamai and the crescent varenyk in figure units (metres): the plinth top at y 0, he faces +z, his left hand is +x.
function mamai() {
  let s = new SG(); const PI = Math.PI;
  const er = (y, rx, rz, dz = 0, n = 18) => Array.from({ length: n }, (_, k) => { const a = -k / n * PI * 2; return [Math.cos(a) * rx, y, dz + Math.sin(a) * rz]; });
  // the crossed legs in wide sharovary, the right one in front; the soft boots turned out
  ell(s, [0, 0.15, -0.03], [0.27, 0.16, 0.21], [0, 0, 0], 14, 8);
  for (const [sd, front] of [[-1, 0.04], [1, 0]]) {
    sweep(s, [[sd * 0.13, 0.16, -0.02], [sd * 0.3, 0.16, 0.06], [sd * 0.44, 0.14 + front, 0.14], [sd * 0.3, 0.11 + front, 0.28], [-sd * 0.02, 0.09 + front, 0.32 + front]],
      [0.18, 0.185, 0.155, 0.12, 0.085], 14, { wob: (u, i) => 1 + 0.07 * Math.sin(u * PI * 8 + i * 1.7) });
    ell(s, [-sd * 0.1, 0.07 + front, 0.35 + front], [0.09, 0.055, 0.065], [0, sd * 0.6, 0], 10, 6);
  }
  // the zhupan over the torso, the wrapped sash in three rolls, a broad chest and sloping shoulders
  s.loft([[0.18, 0.22, 0.18], [0.3, 0.215, 0.16], [0.46, 0.215, 0.155], [0.6, 0.24, 0.155], [0.72, 0.265, 0.15], [0.8, 0.255, 0.135], [0.85, 0.19, 0.11], [0.88, 0.08, 0.07]]
    .map(([y, rx, rz]) => er(y, rx, rz, -0.01, 22)), { cap0: true, cap1: true });
  for (const y of [0.31, 0.36, 0.41]) sweep(s, [...er(y, 0.228, 0.168, -0.01, 16), er(y, 0.228, 0.168, -0.01, 16)[0]], Array(17).fill(0.018), 6, { caps: false });
  // the open collar of the zhupan: two ridges down to the sash
  for (const sd of [-1, 1]) sweep(s, [[sd * 0.06, 0.84, 0.1], [sd * 0.1, 0.65, 0.14], [sd * 0.12, 0.45, 0.15]], [0.016, 0.016, 0.012], 6);
  // the head turned to his right, toward the pot: neck, a shaved skull, the nose, the long moustache curling down past
  // the chin, the oseledets on the crown
  sweep(s, [[0, 0.84, -0.005], [0, 0.95, 0.005]], [0.055, 0.05], 10);
  const hd = new SG();
  ell(hd, [0, 1.03, 0.015], [0.085, 0.11, 0.1], [0, 0, 0], 16, 12);
  ell(hd, [0, 1.02, 0.112], [0.017, 0.032, 0.024], [0.2, 0, 0], 8, 6);
  for (const sd of [-1, 1]) {
    ell(hd, [sd * 0.085, 1.03, 0.01], [0.014, 0.03, 0.02], [0, 0, 0], 6, 5);
    ell(hd, [sd * 0.033, 1.06, 0.098], [0.026, 0.01, 0.01], [0, 0, sd * 0.15], 6, 4); // the brows
    sweep(hd, [[sd * 0.006, 0.983, 0.112], [sd * 0.05, 0.972, 0.1], [sd * 0.08, 0.93, 0.085], [sd * 0.09, 0.86, 0.075], [sd * 0.085, 0.8, 0.07], [sd * 0.065, 0.78, 0.075]],
      [[0.013, 0.01], [0.018, 0.012], [0.016, 0.011], [0.012, 0.009], [0.008, 0.007], [0.004, 0.004]], 8);
  }
  sweep(hd, [[0, 1.125, 0.0], [0, 1.17, -0.005], [0.015, 1.2, -0.025], [0.035, 1.205, -0.05]], [0.022, 0.02, 0.014, 0.006], 8);
  put(s, hd, mapper(new THREE.Matrix4().makeTranslation(0, 0.9, 0).multiply(new THREE.Matrix4().makeRotationY(-0.45)).multiply(new THREE.Matrix4().makeTranslation(0, -0.9, 0))));
  // the tall pot of varenyky in the crook of his right arm, a flower relief on its shoulder, its mouth heaped with them
  const PX = -0.35, PY = 0.24, PZ = 0.16;
  s.lathe(PX, PZ, [[0.0, PY], [0.09, PY], [0.15, PY + 0.06], [0.195, PY + 0.18], [0.19, PY + 0.3], [0.15, PY + 0.4], [0.1, PY + 0.45], [0.118, PY + 0.47], [0.122, PY + 0.5], [0, PY + 0.5]], 20, { cap0: false });
  const band = er(PY + 0.37, 0.172, 0.172, PZ, 20).map(([x, y, z]) => [x + PX, y, z]);
  sweep(s, [...band, band[0]], Array(21).fill(0.012), 6, { caps: false });
  for (let k = 0; k < 8; k++) {
    const a = k / 7 * PI * 2, rr = k ? 0.075 : 0;
    ell(s, [PX + Math.cos(a) * rr, PY + 0.54 + (k ? 0 : 0.04), PZ + Math.sin(a) * rr], [0.065, 0.03, 0.038], [0.3 * Math.sin(a), a, 0.2], 10, 5);
  }
  // the right arm round the pot, the hand spread across its front; the left forearm raised, the thumb up
  sweep(s, [[-0.25, 0.78, -0.01], [-0.33, 0.6, 0.0], [-0.36, 0.45, 0.06], [-0.31, 0.4, 0.22], [-0.25, 0.44, 0.3]], [0.08, 0.075, 0.07, 0.06, 0.048], 12);
  ell(s, [-0.25, 0.47, 0.3], [0.05, 0.055, 0.03], [0, 0.6, 0], 10, 6);
  for (let k = 0; k < 4; k++) sweep(s, [0.5, 0.3, 0.1, -0.08].map((a) => [PX + Math.sin(a) * 0.205, PY + 0.2 + k * 0.035, PZ + Math.cos(a) * 0.205]), [0.016, 0.015, 0.014, 0.011], 6);
  sweep(s, [[0.25, 0.78, -0.01], [0.33, 0.62, -0.01], [0.37, 0.5, 0.03], [0.4, 0.62, 0.1], [0.41, 0.72, 0.12]], [0.08, 0.075, 0.07, 0.06, 0.055], 12);
  ell(s, [0.41, 0.765, 0.13], [0.055, 0.062, 0.055], [0, 0, 0], 10, 7);
  sweep(s, [[0.4, 0.8, 0.16], [0.405, 0.86, 0.165], [0.4, 0.9, 0.16]], [0.026, 0.024, 0.018], 8);
  // the bottle and the cup before his feet, on the plinth
  s.lathe(0.13, 0.43, [[0, 0], [0.065, 0], [0.072, 0.2], [0.03, 0.26], [0.024, 0.31], [0.03, 0.33], [0, 0.34]], 12);
  s.lathe(0.27, 0.46, [[0, 0], [0.04, 0], [0.052, 0.12], [0.046, 0.125], [0, 0.125]], 12);
  // the figure is drawn a size small: the photo has him a fifth bigger against the crescent and the plinth
  const fig = s;
  s = put(new SG(), fig, mapper(new THREE.Matrix4().makeScale(1.2, 1.2, 1.2)));
  // the varenyk: a crescent standing behind him in the plane z ~ -0.3, the narrower end on the plinth at his left hip,
  // rising round to a broad rounded lobe over his head; a crimped outer edge
  const C = [-0.02, 0.98], R = 0.82, N = 64, a0 = -72 * PI / 180, a1 = 136 * PI / 180, path = [], sec = [];
  const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = a0 + (a1 - a0) * t;
    path.push([C[0] + Math.cos(a) * R, C[1] + Math.sin(a) * R, -0.32]);
    let w = 0.12 + 0.2 * sm(t / 0.45);
    if (t > 0.8) w = 0.03 + (w - 0.03) * Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.2) ** 2));
    sec.push([w * 0.45 + 0.04, w]);
  }
  // the outer side is -bin for this path (see sweep's frames): crimp only that half, a lobe every six samples
  sweep(s, path, sec, 20, { wob: (u, i) => 1 + 0.12 * Math.max(0, -Math.sin(u * PI * 2)) ** 3 * (0.45 + 0.55 * Math.cos(i * PI / 3)) });
  // the petrykivka relief on the front of the broad upper part: a stem along the middle, leaves either side, berries
  for (let k = 0; k < 14; k++) {
    const t = 0.5 + k * 0.03, a = a0 + (a1 - a0) * t, side = k % 2 ? 1 : -1, rr = R + side * 0.1 * (k % 3 === 2 ? 0.5 : 1);
    const x = C[0] + Math.cos(a) * rr, y = C[1] + Math.sin(a) * rr, w = 0.12 + 0.2 * sm(t / 0.45);
    ell(s, [x, y, -0.32 + w * 0.45 + 0.03], k % 3 === 2 ? [0.025, 0.025, 0.02] : [0.07, 0.028, 0.022], [0, 0, a + side * 0.7], 8, 5);
  }
  const stem = []; for (let k = 0; k <= 8; k++) { const t = 0.5 + k * 0.05, a = a0 + (a1 - a0) * t; stem.push([C[0] + Math.cos(a) * R, C[1] + Math.sin(a) * R, -0.32 + (0.12 + 0.2 * sm(t / 0.45)) * 0.45 + 0.03]); }
  sweep(s, stem, Array(stem.length).fill(0.012), 6);
  return s;
}

// ------------------------------------------------------------------------------------------------ the site
export function buildRosava({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((o) => o.id === OSM_ID);
  if (!b) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const pts = (flat) => { const out = []; for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]); return out; };
  // the podium is the OSM part with no levels, the tower the 9-level one; without parts, the whole ring is podium
  const parts = b.parts ?? [{ p: b.p }];
  const podP = pts((parts.find((q) => !q.lv) ?? parts[0]).p), towP = parts.find((q) => q.lv) ? pts(parts.find((q) => q.lv).p) : null;
  const B = { pod: new MB(), tow: new MB(), det: new MB(), roof: new MB(), glass: new MB(), cer: new MB(), emb: new MB() };
  const D = B.det;
  // the street front: the podium's longest face looking away from the tower (toward map -x)
  const PF = ringFaces(podP), front = [...PF].sort((p, q) => (q.L - p.L) + 30 * (p.nx - q.nx))[0];
  const door = front.L * 0.5, doorP = at(front, door, 0, 3);
  const yF = heightAt(doorP[0], doorP[2]) + 0.15;       // the ground floor, a step over the forecourt
  const gLo = Math.min(...[...podP, ...(towP ?? [])].map(([x, z]) => heightAt(x, z))) - 0.6;
  const yPod = yF + PODIUM_H, yTow = yF + PODIUM_H + NT * FH;

  // ---- the podium: one wall quad per face over the bay texture, a dark granite plinth below the floor on the slope
  const podWall = (f) => {
    const us = (s) => (s / BAY + (f.k % 3) * 2) / PB;
    B.pod.setColor('#ffffff');
    quad(B.pod, at(f, 0, yF), at(f, f.L, yF), at(f, f.L, yPod), at(f, 0, yPod), f.N, [[us(0), 0], [us(f.L), 0], [us(f.L), 1], [us(0), 1]]);
    D.setColor('#6a6866'); rect(D, f, 0, f.L, gLo, yF, 0, [2, 2]);
    D.setColor('#d8d3c8'); box(D, f, 0, f.L, yPod - PAR, yPod, -0.3, -0.01, 'b');
    D.setColor('#93503a'); box(D, f, -0.02, f.L + 0.02, yPod, yPod + 0.06, -0.32, 0.04, 'ft');
    solid(S, f, 0, f.L, -0.3, 0, yF, yPod);
    const a = at(f, 0, 0, -0.1), c = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], c[0], c[2], yPod, f.nx, f.nz);
  };
  PF.forEach(podWall);
  B.roof.setColor('#5f5d5a'); B.roof.fill(podP, [], yPod - PAR + 0.02, true);
  S.prism(podP.flat(), gLo, yPod - PAR, 0, 0, 'wall');
  // the entrance: steps the width of three bays down to the forecourt, the glazed doors
  {
    const f = front, s0 = door - 4.2, s1 = door + 4.2, gy = heightAt(doorP[0], doorP[2]);
    D.setColor('#9a9893');
    const n = Math.max(1, Math.round((yF - gy + 0.45) / 0.15));
    for (let j = 0; j < n; j++) box(D, f, s0 - 0.3 * j, s1 + 0.3 * j, gLo, yF - j * 0.15, 0, 1.8 + 0.35 * j, 'ftlr');
    solid(S, f, s0, s1, 0, 1.8, gLo, yF);
    B.glass.setColor('#2d363c'); rect(B.glass, f, door - 1.6, door + 1.6, yF, yF + 2.6, 0.03);
    D.setColor('#c8cccc'); for (const s of [door - 1.6, door - 0.03, door + 1.57]) box(D, f, s, s + 0.06, yF, yF + 2.65, 0, 0.06, 'flr');
    box(D, f, door - 1.6, door + 1.6, yF + 2.6, yF + 2.68, 0, 0.06, 'ftu');
  }

  // ---- the tower: the atlas from the podium roof up; below it the podium's bay (hidden where the podium stands
  // against it); the coping and the parapet's inside on top
  const footprints = [{ poly: podP, h: yPod - gLo, kind: 'public', name: 'вул. Верхня Горова, 29' }];
  let stairTop = null;
  const KINDS = [0, 0, 1, 0, 2, 0, 1, 0];
  if (towP) {
    const TF = ringFaces(towP);
    for (const f of TF) {
      const off = (f.k * 3) % AC, us = (s) => (s / TB + off) / AC, ub = (s) => s / BAY / PB;
      B.tow.setColor('#ffffff');
      quad(B.tow, at(f, 0, yPod), at(f, f.L, yPod), at(f, f.L, yTow), at(f, 0, yTow), f.N, [[us(0), 0], [us(f.L), 0], [us(f.L), 1], [us(0), 1]]);
      B.pod.setColor('#ffffff');
      quad(B.pod, at(f, 0, yF), at(f, f.L, yF), at(f, f.L, yPod), at(f, 0, yPod), f.N, [[ub(0), 0], [ub(f.L), 0], [ub(f.L), 1], [ub(0), 1]]);
      D.setColor('#6a6866'); rect(D, f, 0, f.L, gLo, yF, 0, [2, 2]);
      D.setColor('#cfc4ae'); box(D, f, 0, f.L, yTow - PAR, yTow, -0.3, -0.01, 'b');
      D.setColor('#93503a'); box(D, f, -0.03, f.L + 0.03, yTow, yTow + 0.08, -0.32, 0.05, 'ft');
      solid(S, f, 0, f.L, -0.3, 0, yF, yTow);
      const a = at(f, 0, 0, -0.1), c = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], c[0], c[2], yTow, f.nx, f.nz);
    }
    B.roof.setColor('#55524f'); B.roof.fill(towP, [], yTow - PAR + 0.02, true);
    S.prism(towP.flat(), gLo, yTow - PAR, 0, 0, 'wall');
    footprints.push({ poly: towP, h: yTow - gLo, kind: 'public', name: 'вул. Верхня Горова, 29' });
    // the stair block at the street end of the slab: the tower face that looks most like the street front (the nearest
    // one of those), 8 m deep, a storey and a half over the roof, with the emblem panel high on its street face
    const dist = (f) => (f.ax - front.ax) * front.nx + (f.az - front.az) * front.nz;
    const tF = TF.filter((f) => f.L > 6 && f.nx * front.nx + f.nz * front.nz > 0.9).sort((p, q) => dist(q) - dist(p))[0];
    if (tF) {
      const dep = Math.min(8, tF.L), yS = yTow + 4.2;
      const sbRing = [[0, 0], [tF.L, 0], [tF.L, -dep], [0, -dep]].map(([s, o]) => { const p = at(tF, s, 0, o); return [p[0], p[2]]; });
      D.setColor('#e6dcc6'); box(D, tF, 0, tF.L, yTow - PAR, yS, -dep, 0.03, 'fblr', [2.5, 2.5]);
      D.setColor('#93503a'); box(D, tF, -0.05, tF.L + 0.05, yS, yS + 0.1, -dep - 0.05, 0.08, 'fblrt');
      B.roof.setColor('#55524f'); B.roof.fill(sbRing, [], yS + 0.1, true);
      S.prism(sbRing.flat(), yTow - PAR, yS + 0.1, 0, 0, 'wall');
      const em = (tF.L - 5.2) / 2;
      B.emb.setColor('#ffffff');
      const flip = tF.ux * tF.nz - tF.uz * tF.nx < 0;
      quad(B.emb, at(tF, em, yS - 6.6, 0.07), at(tF, em + 5.2, yS - 6.6, 0.07), at(tF, em + 5.2, yS - 0.4, 0.07), at(tF, em, yS - 0.4, 0.07), tF.N,
        flip ? [[1, 0], [0, 0], [0, 1], [1, 1]] : [[0, 0], [1, 0], [1, 1], [0, 1]]);
      D.setColor('#8f8a80'); box(D, tF, em - 0.12, em + 5.32, yS - 6.72, yS - 0.28, 0, 0.06, 'ftlru');
      stairTop = yS + 0.1;
    }
  }

  // ---- the monument: a bed with a granite kerb a few metres off the front, to one side of the entrance; the cream
  // plinth, Mamai and the varenyk, facing the street
  const mp = at(front, door + 4.6, 0, 5.4), [mx, mz] = [mp[0], mp[2]], my = heightAt(mx, mz);
  const ry = Math.atan2(front.nx, front.nz);
  // mf: a frame on the monument, s across (his left = +s, the viewer's right), o toward the street
  const mf = { ax: mx, az: mz, ux: Math.cos(ry), uz: -Math.sin(ry), nx: front.nx, nz: front.nz, N: [front.nx, 0, front.nz], U: [Math.cos(ry), 0, -Math.sin(ry)], L: 0, cuts: [] };
  D.setColor('#aaa79f'); box(D, mf, -1.9, 1.9, my - 0.4, my + 0.32, -1.6, 1.6, 'fblrt');
  D.setColor('#4a3d30'); box(D, mf, -1.72, 1.72, my + 0.32, my + 0.38, -1.42, 1.42, 't');
  for (let k = 0; k < 9; k++) {
    const a = (k + r() * 0.5) / 9 * Math.PI * 2, rr = 1.2 + r() * 0.3, p = at(mf, Math.cos(a) * rr, 0, Math.sin(a) * rr * 0.8), sz = 0.22 + r() * 0.16;
    if (Math.sin(a) > 0.6 && Math.abs(Math.cos(a)) < 0.5) continue; // the front of the bed stays open
    D.setColor(['#3d5a2c', '#4a6a33', '#36502a', '#5a7a3a'][k % 4]).ellipsoid([p[0], my + 0.38 + sz * 0.6, p[2]], [sz * 1.2, sz, sz * 1.1], 7, 4);
  }
  const yP = my + 0.38 + 0.45;
  B.cer.setColor('#ece4cf'); box(B.cer, mf, -0.58, 0.58, my + 0.3, yP, -0.45, 0.58, 'fblrt');
  const ang = Math.atan2(mf.uz, mf.ux);
  S.obox(mx, mz, 1.9, 1.6, ang, my - 0.4, my + 0.38, 'ledge');
  S.obox(mx, mz, 0.62, 0.46, ang, my + 0.38, yP + 1.2, 'wall');
  S.obox(mx + mf.ux * 0.1 - mf.nx * 0.32, mz + mf.uz * 0.1 - mf.nz * 0.32, 0.8, 0.2, ang, yP, yP + 2.0, 'wall');
  const statue = mamai().build(M4(mx, yP, mz, ry));

  // ---- materials and meshes; the windows glow by nightK through each atlas's own mask
  const towLit = Array.from({ length: AC * NT }, () => r() < 0.3), podLit = Array.from({ length: PB }, () => (r() < 0.6 ? 1 : 0) | (r() < 0.35 ? 2 : 0));
  const M = {
    pod: new THREE.MeshStandardMaterial({ map: podiumTex(false), emissiveMap: podiumTex(true, podLit), emissive: 0xffd9a0, emissiveIntensity: 0, vertexColors: true, roughness: 0.8 }),
    tow: new THREE.MeshStandardMaterial({ map: towerTex(false, KINDS, towLit), emissiveMap: towerTex(true, KINDS, towLit), emissive: 0xffd9a0, emissiveIntensity: 0, vertexColors: true, roughness: 0.88 }),
    det: new THREE.MeshStandardMaterial({ map: speckle(r, '#f2f1ed'), vertexColors: true, roughness: 0.85 }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.3 }),
    cer: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
    emb: new THREE.MeshStandardMaterial({ map: emblemTex(), roughness: 0.6, metalness: 0.15 }),
  };
  const out = finish(root, 'rosava', B, M, { shade: ['pod', 'tow', 'det', 'cer'] });
  const stMesh = Object.assign(new THREE.Mesh(statue, new THREE.MeshStandardMaterial({ color: '#ece4cf', roughness: 0.55 })), { name: 'rosava-varenyk', castShadow: true, receiveShadow: true });
  out.group.add(stMesh); out.verts += statue.attributes.position.count; out.meshes++;
  console.log(`[cherkasy] Rosava (appeal court) + varenyk monument: ${(out.verts / 1000).toFixed(1)}k verts, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const rings = [podP, ...(towP ? [towP] : [])];
  const fx = (x, z) => [(x - doorP[0]) * front.ux + (z - doorP[2]) * front.uz, (x - doorP[0]) * front.nx + (z - doorP[2]) * front.nz];
  return {
    footprints,
    monument: [mx, mz],
    levels: { floor: yF, podium: yPod, tower: towP ? yTow : null, stair: stairTop, plinthTop: yP, ground: my },
    // trees keep off the building, the entrance and the monument's bed
    clear: (x, z) => rings.some((P) => inPoly(P, x, z)) || Math.hypot(x - mx, z - mz) < 3.5 || (([s, o]) => Math.abs(s) < 8 && o > -3 && o < 8)(fx(x, z)),
    update() { M.pod.emissiveIntensity = 0.4 * nightK.value; M.tow.emissiveIntensity = 0.6 * nightK.value; },
  };
}
