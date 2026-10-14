// OWNER: cherkasy. Черкаський колегіум «Берегиня» (until 1994 середня школа №23, opened 1 September 1974), вул. Хоменка 14/1
// (issue #49, the player's follow-up: "якщо можна 23 школу також оформити Берегиня колегіум"). The 1974 typical school
// round its courtyard (OSM relation 1516158, building=school) on its fenced lot (OSM 203521511, amenity=school) between
// Лук'янова and the stadium.
// References: the Google Maps place photo of the street front (Nov 2020), the ISUO and collegium.ck.ua photos (the
// sign wall, the porch with the greeting banner, the one-storey glazed front by the forecourt), the Google and Esri
// aerials for the roofs, the relief displacement (heights) and the grounds. What they show: beige ceramic tile walls,
// white PVC ribbon windows in bays between dark brown tiled piers on the two upper floors, a light grey rendered ground
// floor with grilled windows, an open undercroft entrance under the street front, flat roofs with thin copings; the
// porch on pink square piers under a deep slab with the greeting banner over red doors; the white sand-lime brick sign
// wall with three blue plates (yellow letters) by the street; the street fence – whitewashed sand-lime brick plinth,
// blue steel frames with chain-link panels; birches along the street, spruces at the forecourt.
// Volumes (OSM gives one ring with the courtyard as its hole): the three-storey classroom wings (the street front and
// the west wing), the one-storey link with the canteen glazing to the forecourt (and the porch), the gym and the
// assembly hall block at the north-east corner, the two-storey east link. Heights read off the aerial's lean.
// Guesses: which block holds the gym and which the hall, the courtyard and end walls, the undercroft's depth and doors,
// the east link's windows, where on the forecourt the porch stands; the grounds – the 200 m cinder track round a grass
// infield with goals (OSM's pitch is the oval), the two jump pits, the trodden path, the bars – are read off the aerial.
//   SCHOOL23_SKIP: the OSM ids replaced here (buildings.js skips their extrusion)
//   buildSchool23({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints, levels, spots } | null
//     levels: { floor, top (the wings' parapet), link, gym, hall, east } absolute heights (tests)
//     spots: hand-placed trees (spruces at the forecourt, birches by the street, the courtyard's trees)
// Walls are tile skins cut round real openings (slabkit `hole`); where a volume abuts another the skin starts above the
// neighbour's roof (`cover`), so the joined ring reads as one building. Grounds are decals draped on the terrain.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { OVERHANG } from '../collision.js';
import { canvasTex, decal } from './sculpt.js';
import { rng, inPoly } from './geo.js';
import { brickTex } from './civic.js';
import { PARK_PINE, PARK_GREENS } from '../trees.js';
import { face, ringFaces, at, quad, box, rect, skin, hole, label, solid, finish, speckle, UP } from './slabkit.js';

export const SCHOOL23_SKIP = new Set([1516158]);

// the volumes as map rectangles (the OSM ring is square to the map frame within a few cm)
const WEST = { x0: -2266.0, x1: -2253.2, z0: 118.2, z1: 186.6, id: 'west' };    // three storeys of classrooms
const FRONT = { x0: -2253.2, x1: -2196.3, z0: 174.2, z1: 186.4, id: 'front' };  // three storeys, the street front
const LINK = { x0: -2253.2, x1: -2210.2, z0: 132.6, z1: 141.8, id: 'link' };    // one storey: canteen and lobby
const GYM = { x0: -2210.2, x1: -2185.6, z0: 125.4, z1: 141.8, id: 'gym' };      // the gym, one tall storey
const HALL = { x0: -2210.2, x1: -2185.6, z0: 141.8, z1: 156.1, id: 'hall' };    // the assembly hall
const EAST = { x0: -2215.6, x1: -2204.1, z0: 141.8, z1: 174.2, id: 'east' };    // two storeys, the east link
const VOLS = [WEST, FRONT, LINK, GYM, HALL, EAST];
const UNDER = { x0: -2251.0, x1: -2233.0, depth: 3.6 };                          // the open undercroft under the street front
const PORCH = { x: -2232.0, w: 8.4, depth: 3.4 };                                 // the porch on the link's forecourt side
// OSM 203521511, the school lot (its fence)
const LOT = [[-2278.4, 200.6], [-2278.2, 192.4], [-2279.2, 27.2], [-2247.8, 22.6], [-2224.3, 19.9], [-2183.6, 18.1], [-2178.0, 197.5], [-2212.4, 198.5]];
const STREET_EDGES = new Set([0, 6, 7]);                                           // the LOT edges along Лук'янова (and the jog at its west end)
const GATES = [[-2278.2, 192.4, 3.0], [-2212.3, 198.5, 1.1]];                     // the drive on the west, the footway from Лук'янова
const SIGN = { x: -2236.0, z: 196.6, len: 5.0 };                                  // the sign wall by the street
// the stadium: OSM's pitch is a 200 m oval round the axis E -> W
const OVAL = { E: [-2209.6, 53.3], W: [-2259.0, 83.0], R: 14.3, track: 3.8 };
const PATH = [[-2252.5, 100.0], [-2192.5, 60.0]];                                  // the trodden path past the track
const FORE = [[[-2253.2, 111.0], [-2210.4, 111.0], [-2210.4, 132.6], [-2253.2, 132.6]], [[-2210.4, 111.0], [-2196.0, 111.0], [-2196.0, 125.2], [-2210.4, 125.2]]];
const STRIP = [[-2266.0, 186.5], [-2196.3, 186.4], [-2196.3, 190.3], [-2266.0, 190.4]];   // paving along the street front

const FH = 3.3, PAR = 0.75;                                   // storey height, parapet over the top floor
const TILE = '#d2bea8', PIER = '#6b5044', RENDER = '#c9c6bf', PLINTH = '#6a5248', COPING = '#a9a8a4', ROOF = '#4d5054', PINK = '#d9a9a0';
const TILE_UV = [2.0, 2.0];
const ring = (R) => [[R.x0, R.z0], [R.x1, R.z0], [R.x1, R.z1], [R.x0, R.z1]];
const side = (f) => (f.nz > 0.7 ? 'pz' : f.nz < -0.7 ? 'nz' : f.nx > 0.7 ? 'px' : 'nx');
const sAt = (f, x, z) => (x - f.ax) * f.ux + (z - f.az) * f.uz;
const inR = (R, x, z, e = 0) => x > R.x0 - e && x < R.x1 + e && z > R.z0 - e && z < R.z1 + e;

// beige ceramic tiles, 0.25 m squares with grey joints; the vertex colour tints them (beige walls, brown piers)
const tileTex = (r) => canvasTex(256, 256, (g, w) => {
  g.fillStyle = '#c4beb4'; g.fillRect(0, 0, w, w);
  const n = 8, c = w / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = 0.94 + r() * 0.08, v = (232 * k) | 0;
    g.fillStyle = `rgb(${v},${(v * 0.985) | 0},${(v * 0.96) | 0})`; g.fillRect(i * c + 1, j * c + 1, c - 2, c - 2);
    if (r() < 0.2) { g.fillStyle = 'rgba(90,80,70,0.05)'; g.fillRect(i * c + 1, j * c + c * 0.6, c - 2, c * 0.4 - 1); }
  }
});
const asphaltTex = (r) => canvasTex(256, 256, (g, w) => {
  g.fillStyle = '#5c5d5f'; g.fillRect(0, 0, w, w);
  for (let q = 0; q < 9000; q++) { const v = 60 + r() * 70 | 0; g.fillStyle = `rgba(${v},${v},${v + 2},0.5)`; g.fillRect(r() * w, r() * w, 1 + r() * 1.5, 1 + r() * 1.5); }
  for (let q = 0; q < 14; q++) { g.fillStyle = 'rgba(30,30,32,0.08)'; g.beginPath(); g.ellipse(r() * w, r() * w, 10 + r() * 30, 6 + r() * 16, r() * 3, 0, 7); g.fill(); }
});
const turfTex = (r) => canvasTex(256, 256, (g, w) => {
  g.fillStyle = '#7a8a4c'; g.fillRect(0, 0, w, w);
  for (let q = 0; q < 40; q++) { g.fillStyle = 'rgba(176,158,112,0.2)'; g.beginPath(); g.ellipse(r() * w, r() * w, 8 + r() * 26, 6 + r() * 18, r() * 3, 0, 7); g.fill(); }
  for (let q = 0; q < 7000; q++) { g.fillStyle = r() < 0.5 ? 'rgba(30,50,15,0.22)' : 'rgba(190,200,120,0.16)'; g.fillRect(r() * w, r() * w, 1 + r() * 2, 1 + r() * 2); }
});
// chain-link: diamonds 0.1 m across (uv 1 per 0.1 m) (alpha: white = wire)
const meshTex = () => canvasTex(64, 64, (g, w) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, w);
  g.strokeStyle = '#fff'; g.lineWidth = 3;
  for (const [a, b, c, d] of [[0, 0, w, w], [w, 0, 0, w], [-w, 0, w, 2 * w], [2 * w, 0, 0, 2 * w]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
}, { srgb: false });
// the atlas of lettering: v 0.5..1 the greeting banner over the porch, v 0..0.5 the sign's three blue plates
const signTex = () => canvasTex(1024, 512, (g, w) => {
  // the banner: sky blue to the left, yellow field with sunflowers to the right, red letters
  const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#9fd2f0'); gr.addColorStop(0.55, '#d8eef8'); gr.addColorStop(1, '#f3d34a');
  g.fillStyle = gr; g.fillRect(0, 0, w, 256);
  g.fillStyle = '#f2c230'; g.beginPath(); g.ellipse(w * 0.62, 250, 420, 80, 0, Math.PI, 0); g.fill();
  for (const [x, y, s] of [[70, 40, 26], [930, 60, 30], [980, 190, 22], [40, 200, 20], [860, 210, 18]]) {
    g.fillStyle = '#f5b800'; for (let k = 0; k < 10; k++) { g.beginPath(); g.ellipse(x + Math.cos(k * 0.628) * s * 0.9, y + Math.sin(k * 0.628) * s * 0.9, s * 0.45, s * 0.2, k * 0.628, 0, 7); g.fill(); }
    g.fillStyle = '#5a3a14'; g.beginPath(); g.arc(x, y, s * 0.45, 0, 7); g.fill();
  }
  g.fillStyle = '#2a63b0'; g.fillRect(560, 22, 90, 112); g.fillStyle = '#f2d23a'; g.fillRect(588, 38, 34, 80);    // a coat of arms
  g.fillStyle = '#d6262a'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = 'italic bold 70px Georgia, "Times New Roman", serif';
  g.fillText('Колегіум', 110, 70); g.fillText('радо', 300, 140); g.fillText('вітає вас!', 330, 212);
  // the plates: dark blue, yellow serif letters
  g.fillStyle = '#e9e7e2'; g.fillRect(0, 256, w, 256);
  const rows = [['Черкаський колегіум “Берегиня”', 54], ['Черкаської міської ради', 46], ['Черкаської області', 46]];
  rows.forEach(([t, px], i) => {
    const y = 268 + i * 80; g.fillStyle = '#22378f'; g.fillRect(i ? 140 : 20, y, i ? w - 280 : w - 40, 66);
    g.fillStyle = '#f2c933'; g.textAlign = 'center'; g.font = `bold ${px}px Georgia, "Times New Roman", serif`; g.fillText(t, w / 2, y + 35);
  });
});

export function buildSchool23({ root, map, solids: S, zips: Z, heightAt }) {
  const osm = map.buildings?.find((b) => b.id === 1516158);
  if (!osm) return null;
  const t0 = performance.now(), r = rng(2374), n0 = S.count;
  const B = { tile: new MB(), det: new MB(), glass: new MB(), lit: new MB(), roof: new MB(), glow: new MB(), mesh: new MB(), brick: new MB(), asph: new MB(), turf: new MB(), sand: new MB(), sign: new MB() };
  const D = B.det;
  let nWin = 0, nLit = 0;

  // ---- levels: one floor for the whole ring (the ground falls < 0.5 m across it)
  let gLo = Infinity, gHi = -Infinity;
  for (const R of VOLS) for (let x = R.x0; x <= R.x1 + 0.01; x += 3) for (let z = R.z0; z <= R.z1 + 0.01; z += 3) { const h = heightAt(Math.min(x, R.x1), Math.min(z, R.z1)); gLo = Math.min(gLo, h); gHi = Math.max(gHi, h); }
  const yF = gHi + 0.45, gB = gLo - 0.6, fy = (k) => yF + k * FH;
  const TOP = { west: fy(3) + PAR, front: fy(3) + PAR, link: yF + 4.5, gym: yF + 8.6, hall: yF + 7.8, east: fy(2) + PAR };
  const levels = { floor: yF, top: TOP.front, link: TOP.link, gym: TOP.gym, hall: TOP.hall, east: TOP.east };

  // a window: a cut with reveals, white frames, glass (lit at random)
  const win = (f, s0, s1, y0, y1, o = {}) => {
    if (s1 - s0 < 0.3) return;
    const lit = o.lit ?? (r() < 0.22); nWin++; nLit += lit;
    f.cuts.push({ s0, s1, y0, y1, dep: 0.22, pitch: 1.25, tr: y1 - 0.55, sill: o.door ? null : '#e2dfd8', lit, glass: r() < 0.3 ? '#93a5ae' : '#5c7280', frame: '#f3f3ef', ...o });
  };
  // how high a face is hidden by the volume it abuts: spans [s0, s1, coverY] (coverY = -Infinity where it is open)
  const cover = (f, R) => {
    const out = [], step = 0.25, n = Math.max(1, Math.round(f.L / step));
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) * f.L / n, p = at(f, s, 0, 0.3);
      let c = -Infinity;
      for (const Q of VOLS) if (Q !== R && inR(Q, p[0], p[2], 0.02)) c = Math.max(c, TOP[Q.id]);
      const a = i * f.L / n, b = (i + 1) * f.L / n, last = out[out.length - 1];
      if (last && last[2] === c) last[1] = b; else out.push([a, b, c]);
    }
    return out;
  };
  const sub = (f, s0, s1) => ({ ...f, ax: f.ax + f.ux * s0, az: f.az + f.uz * s0, L: s1 - s0, cuts: f.cuts.filter((q) => q.s0 < s1 && q.s1 > s0).map((q) => ({ ...q, s0: q.s0 - s0, s1: q.s1 - s0 })) });
  // bays of windows along the open stretches: each bay a brown pier (if any) then the window; rows: [[y0, y1, opts]]
  const bays = (f, cv, { bay = 6.6, pier = 0.85, rows, pierY = null, win: ww = null }) => {
    for (const [a, b, c] of cv) {
      const L = b - a; if (L < bay * 0.7) continue;
      const n = Math.max(1, Math.round(L / bay)), m = L / n;
      for (let i = 0; i < n; i++) {
        const s0 = a + i * m, s1 = s0 + m;
        const [w0, w1] = ww ? [(s0 + s1) / 2 - ww / 2, (s0 + s1) / 2 + ww / 2] : [s0 + pier / 2 + 0.05, s1 - pier / 2 - 0.05];
        for (const [y0, y1, o] of rows) if (y0 > c + 0.15) win(f, w0, w1, y0, y1, o);
        if (pier && pierY) for (const s of i ? [s0] : []) f.piers.push([s - pier / 2, s + pier / 2, Math.max(pierY[0], c + 0.05), pierY[1]]);
      }
    }
  };
  const footprints = [];

  // ================= the building, volume by volume =================
  for (const R of VOLS) {
    const top = TOP[R.id];
    for (const f of ringFaces(ring(R))) {
      f.piers = [];
      const sd = side(f), cv = cover(f, R), open = cv.filter(([, , c]) => c < top - 0.3);
      if (!open.length) continue;
      const classes = (R === FRONT && sd === 'pz') || (R === WEST && (sd === 'nx' || sd === 'pz'));
      let renderTop = null;                                              // the rendered ground storey under the tiles
      if (classes) {
        // classroom bays: two upper floors of ribbon windows between brown piers, the grey ground floor's grilled windows
        renderTop = fy(1) - 0.1;
        bays(f, cv, { rows: [[fy(1) + 0.85, fy(1) + 2.95, { pitch: 1.05 }], [fy(2) + 0.85, fy(2) + 2.95, { pitch: 1.05 }]], pierY: [fy(1) + 0.7, fy(2) + 3.1] });
        bays(f, cv, { rows: [[fy(0) + 0.95, fy(0) + 2.7, { pitch: 0.32, tr: 0, frame: '#ecebe6' }]], win: 2.8, pier: 0 });
      } else if ((R === FRONT && sd === 'nz') || (R === WEST && sd === 'px')) {
        // the courtyard side: corridor windows in pairs, all three floors
        for (let k = 0; k < 3; k++) bays(f, cv, { bay: 6.0, pier: 0, win: 3.8, rows: [[fy(k) + 1.0, fy(k) + 2.8, { pitch: 0.95 }]] });
      } else if (R === WEST || R === FRONT) {
        // the ends: blank tile, the stair's windows at the half landings, a back door
        const s = f.L / 2;
        for (let k = 0; k < 3; k++) win(f, s - 0.8, s + 0.8, fy(k) + FH / 2 + 0.6, fy(k) + FH / 2 + 2.0, { lit: r() < 0.5 });
        win(f, s - 0.8, s + 0.8, yF, yF + 2.3, { door: true, glass: '#6b3a2c', lit: false, tr: 0, pitch: 0.8 });
        D.setColor(COPING); box(D, f, s - 1.3, s + 1.3, yF + 2.5, yF + 2.65, 0, 1.2, 'ftlru'); solid(S, f, s - 1.3, s + 1.3, 0, 1.2, yF + 2.5, yF + 2.65, 'awning', OVERHANG);
      } else if (R === LINK) {
        // the canteen and lobby: one tall storey of glazing between brown piers (the forecourt side has the porch)
        const pc = sAt(f, PORCH.x, f.az), pw = PORCH.w / 2 + 0.4;
        for (const [a, b, c] of cv) {
          if (c >= yF) continue;
          const n = Math.max(1, Math.round((b - a) / 4.8)), m = (b - a) / n, inPorch = (s0, s1) => sd === 'nz' && s1 > pc - pw && s0 < pc + pw;
          for (let i = 0; i < n; i++) {
            const s0 = a + i * m, s1 = s0 + m;
            if (i && !inPorch(s0 - 0.45, s0 + 0.45)) f.piers.push([s0 - 0.45, s0 + 0.45, yF + 0.5, yF + 3.6]);
            if (!inPorch(s0, s1)) win(f, s0 + 0.6, s1 - 0.6, yF + 0.75, yF + 3.45, { pitch: 1.15, tr: yF + 2.7, frame: '#4b3a30', lit: r() < 0.4 });
          }
        }
      } else if (R === GYM || R === HALL) {
        // the gym: a high window band; the hall: tall windows
        const rows = R === GYM ? [[yF + 3.4, yF + 7.4, { pitch: 1.0, tr: yF + 5.4, lit: r() < 0.3 }]] : [[yF + 1.6, yF + 6.6, { pitch: 1.0, tr: yF + 5.4, lit: r() < 0.3 }]];
        bays(f, cv, { bay: 4.4, pier: 0.8, rows, pierY: [rows[0][0] - 0.15, rows[0][1] + 0.15] });
      } else if (R === EAST) {
        bays(f, cv, { bay: 5.4, pier: 0.8, rows: [[fy(0) + 0.9, fy(0) + 2.9], [fy(1) + 0.9, fy(1) + 2.9]], pierY: [fy(0) + 0.75, fy(1) + 3.05] });
      }

      // the undercroft: a hole through the street front's ground storey
      let under = null;
      if (R === FRONT && sd === 'pz') {
        const [a, b] = [sAt(f, UNDER.x0, f.az), sAt(f, UNDER.x1, f.az)].sort((p, q) => p - q);
        f.cuts = f.cuts.filter((q) => q.y0 >= renderTop || q.s1 < a - 0.2 || q.s0 > b + 0.2);
        under = [a, b]; f.cuts.push({ s0: a, s1: b, y0: gB - 1, y1: renderTop, open: true });
      }
      // the skin of each open stretch from its cover up; tile over the rendered ground storey; plinth, coping, piers
      for (const [a, b, c] of open) {
        const g = sub(f, a, b), y0 = Math.max(yF, c);
        if (renderTop && y0 < renderTop) { skin(B.det, g, y0, renderTop, RENDER, [2.5, 2.5]); skin(B.tile, g, renderTop, top, TILE, TILE_UV); } else skin(B.tile, g, y0, top, TILE, TILE_UV);
        if (c < yF) {
          D.setColor(PLINTH);
          for (const [p0, p1] of under && under[0] < b && under[1] > a ? [[a, Math.max(a, under[0])], [Math.min(b, under[1]), b]] : [[a, b]]) if (p1 - p0 > 0.05) box(D, f, p0 - 0.03, p1 + 0.03, gB, yF, -0.1, 0.05, 'ft', [2.5, 2.5]);
        }
        D.setColor(COPING); box(D, f, a - 0.05, b + 0.05, top, top + 0.1, -0.35, 0.06, 'ftlr');
        const pa = at(f, a, 0, -0.1), pb = at(f, b, 0, -0.1); Z.edge(pa[0], pa[2], pb[0], pb[2], top + 0.1, f.nx, f.nz);
      }
      for (const q of f.cuts) if (!q.open) hole(B, f, q);
      B.tile.setColor(PIER);
      for (const [s0, s1, y0, y1] of f.piers) if (y1 > y0) box(B.tile, f, s0, s1, y0, y1, 0, 0.015, 'flrtu', TILE_UV);
      // a few bare patches where tiles fell off (the street front, as in the photo)
      if (classes && R === FRONT) for (const [s, y, w, h] of [[f.L * 0.3, fy(2) - 0.4, 1.1, 0.9], [f.L * 0.55, fy(3) - 0.2, 0.8, 0.6], [f.L * 0.72, fy(1) + 0.1, 1.3, 0.7]]) { D.setColor('#8f8b84'); rect(D, f, s, s + w, y, y + h, 0.008); }
      if (under) buildUnder(f, under);
    }
    // the flat roof
    B.roof.setColor(ROOF); B.roof.fill(ring(R), [], top - 0.2, true);
    footprints.push({ poly: ring(R), h: top - gLo, kind: 'public', name: 'Колегіум «Берегиня»' });
  }

  // ---- collision: one prism per volume, the street front's undercroft left open under its first floor
  {
    const prism = (R, y0, y1) => S.prism(ring(R).flat(), y0, y1, 0, 0, 'wall');
    for (const R of VOLS) if (R !== FRONT) prism(R, gB, TOP[R.id]);
    const F = FRONT, U = { x0: UNDER.x0, x1: UNDER.x1, z0: F.z1 - UNDER.depth, z1: F.z1 };
    prism({ ...F, x1: U.x0 }, gB, TOP.front); prism({ ...F, x0: U.x1 }, gB, TOP.front); prism({ ...F, x0: U.x0, x1: U.x1, z1: U.z0 }, gB, TOP.front);
    prism(U, fy(1) - 0.1, TOP.front);
  }

  // the undercroft: ceiling, side walls, the back wall with two pairs of doors and windows, square columns, a lamp
  function buildUnder(f, [a, b]) {
    const d = UNDER.depth, yc = fy(1) - 0.1, pg = at(f, (a + b) / 2, 0, 0.5), g0 = heightAt(pg[0], pg[2]);
    D.setColor('#dcdad4'); quad(D, at(f, a, yc), at(f, b, yc), at(f, b, yc, -d), at(f, a, yc, -d), [0, -1, 0]);
    D.setColor(RENDER);
    quad(D, at(f, a, gB), at(f, a, gB, -d), at(f, a, yc, -d), at(f, a, yc), f.U);
    quad(D, at(f, b, gB), at(f, b, gB, -d), at(f, b, yc, -d), at(f, b, yc), f.U.map((v) => -v));
    const bk = { ...f, ax: f.ax - f.nx * d, az: f.az - f.nz * d, cuts: [] }, m = (a + b) / 2;
    for (const s of [m - 3.2, m + 3.2]) win(bk, s - 1.2, s + 1.2, yF, yF + 2.5, { door: true, glass: '#3a3230', frame: '#4a3a32', pitch: 1.2, tr: 0, lit: false });
    for (const s of [a + 0.9, m, b - 0.9]) win(bk, s - 0.6, s + 0.6, yF + 0.9, yF + 2.6, { pitch: 0.3, lit: r() < 0.4 });
    const g = sub(bk, a, b); skin(B.det, g, gB, yc, RENDER, [2.5, 2.5]);
    for (const q of bk.cuts) hole(B, bk, q);
    D.setColor('#a8a49c'); box(D, f, a, b, g0 - 0.2, yF - 0.02, -d, 0, 't');
    D.setColor('#9c978e'); box(D, f, a, b, g0 - 0.2, Math.max(g0 + 0.15, yF - 0.3), 0, 0.5, 'ft');
    const nc = Math.max(1, Math.round((b - a) / 4.5) - 1);
    for (const s of Array.from({ length: nc }, (_, i) => a + (b - a) * (i + 1) / (nc + 1))) {
      D.setColor('#e4e2dc'); box(D, f, s - 0.25, s + 0.25, gB, yc, -0.75, -0.25, 'fblr');
      solid(S, f, s - 0.25, s + 0.25, -0.75, -0.25, gB, yc, 'pole');
    }
    const lp = at(f, m, yc - 0.12, -d / 2); B.glow.setColor('#fff3d8'); B.glow.box(lp[0] - 0.3, lp[1] - 0.05, lp[2] - 0.3, lp[0] + 0.3, lp[1] + 0.05, lp[2] + 0.3);
  }

  // ================= the porch on the forecourt: a slab on pink piers, the greeting banner, red doors =================
  {
    const f = ringFaces(ring(LINK)).find((q) => side(q) === 'nz'), c = sAt(f, PORCH.x, f.az), hw = PORCH.w / 2, d = PORCH.depth;
    const ys = yF + 3.3, yt = ys + 0.35, yb = yt + 1.25, pg = at(f, c, 0, d / 2), g = heightAt(pg[0], pg[2]);
    // the door bay: pink cheeks, the red double doors with glazed side lights
    D.setColor(PINK);
    for (const s of [c - 1.9, c + 1.9]) box(D, f, s - 0.3, s + 0.3, yF, ys, 0, 0.3, 'flr', [2.5, 2.5]);
    D.setColor('#8a2a24'); rect(D, f, c - 1.6, c + 1.6, yF, yF + 2.7, 0.02);
    D.setColor('#5e1c18'); rect(D, f, c - 0.02, c + 0.02, yF, yF + 2.7, 0.03); for (const s of [c - 0.8, c + 0.8]) rect(D, f, s - 0.6, s + 0.6, yF + 1.2, yF + 2.4, 0.03);
    D.setColor('#d4d1ca'); rect(D, f, c - 1.6, c + 1.6, yF + 2.7, ys, 0.02);
    // the slab, its fascia with the banner, the piers
    D.setColor('#dcd8d0'); box(D, f, c - hw, c + hw, ys, yt, 0, d, 'ftlru');
    D.setColor('#cfcac2'); box(D, f, c - hw, c + hw, yt, yb, d - 0.25, d, 'ftlr');
    B.sign.setColor('#ffffff'); label(B.sign, f, c - hw + 0.15, c + hw - 0.15, yt + 0.05, yb - 0.05, d + 0.01, [0, 0, 1, 0.5]);
    solid(S, f, c - hw, c + hw, 0, d, ys, yb, 'awning', OVERHANG);
    D.setColor(PINK);
    for (const s of [c - hw + 0.35, c + hw - 0.35]) { box(D, f, s - 0.28, s + 0.28, g - 0.1, ys, d - 0.6, d - 0.04, 'fblr', [2.5, 2.5]); solid(S, f, s - 0.28, s + 0.28, d - 0.6, d - 0.04, g - 0.1, ys, 'pole'); }
    D.setColor('#a29d94'); box(D, f, c - hw, c + hw, g - 0.2, Math.max(g + 0.12, yF - 0.02), 0, d, 'ftlr');
    const lp = at(f, c, ys - 0.06, d / 2); B.glow.setColor('#fff3d8'); B.glow.box(lp[0] - 0.3, lp[1] - 0.04, lp[2] - 0.3, lp[0] + 0.3, lp[1] + 0.04, lp[2] + 0.3);
  }

  // ================= the grounds =================
  const clearPolys = [];
  // a convex quad draped on the ground in cells of <= 2 m, `lift` over heightAt, uv in metres / rep
  const drape = (M, P, lift, rep) => {
    const [a, b, c, d] = P, nu = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2)), nv = Math.max(1, Math.ceil(Math.hypot(d[0] - a[0], d[1] - a[1]) / 2));
    const pt = (u, v) => { const x = (1 - v) * (a[0] + (b[0] - a[0]) * u) + v * (d[0] + (c[0] - d[0]) * u), z = (1 - v) * (a[1] + (b[1] - a[1]) * u) + v * (d[1] + (c[1] - d[1]) * u); return [x, heightAt(x, z) + lift, z]; };
    const id = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const p = pt(i / nu, j / nv); id.push(M.vert(p[0], p[1], p[2], 0, 1, 0, p[0] / rep, p[2] / rep)); }
    const up = (b[1] - a[1]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[1] - a[1]) > 0;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const k = j * (nu + 1) + i, q = [id[k], id[k + 1], id[k + nu + 2], id[k + nu + 1]];
      if (up) M.quad(...q); else M.quad(q[0], q[3], q[2], q[1]);
    }
  };
  // the forecourt and the paving along the street front
  B.asph.setColor('#ffffff'); for (const P of FORE) { drape(B.asph, P, 0.2, 6); clearPolys.push(P); }
  B.asph.setColor('#f0eeea'); drape(B.asph, STRIP, 0.2, 6); clearPolys.push(STRIP);

  // the stadium: offset curves round the axis E -> W; a band between offsets d0 and d1, in pieces that follow the ground
  const ov = (() => {
    const { E, W } = OVAL, L = Math.hypot(W[0] - E[0], W[1] - E[1]), u = [(W[0] - E[0]) / L, (W[1] - E[1]) / L], n = [-u[1], u[0]];
    const ns = Math.ceil(L / 2.5), nc = 16, smp = [];
    for (let i = 0; i <= ns; i++) smp.push([E[0] + u[0] * L * i / ns, E[1] + u[1] * L * i / ns, n[0], n[1]]);
    for (let i = 1; i < nc; i++) { const a = Math.PI * i / nc; smp.push([W[0], W[1], n[0] * Math.cos(a) + u[0] * Math.sin(a), n[1] * Math.cos(a) + u[1] * Math.sin(a)]); }
    for (let i = 0; i <= ns; i++) smp.push([W[0] - u[0] * L * i / ns, W[1] - u[1] * L * i / ns, -n[0], -n[1]]);
    for (let i = 1; i <= nc; i++) { const a = Math.PI * i / nc; smp.push([E[0], E[1], -n[0] * Math.cos(a) - u[0] * Math.sin(a), -n[1] * Math.cos(a) - u[1] * Math.sin(a)]); }
    return { L, u, n, smp };
  })();
  // the winding, once: (A, C, C+1, A+1) faces up when (C - A) x (C+1 - C) points up (as in drape)
  const s0 = ov.smp[0], s1 = ov.smp[1], ovUp = s0[3] * (s1[0] - s0[0]) - s0[2] * (s1[1] - s0[1]) > 0;
  const band = (M, d0, d1, lift, rep) => {
    const id = (d) => ov.smp.map(([bx, bz, dx, dz]) => { const x = bx + dx * d, z = bz + dz * d; return M.vert(x, heightAt(x, z) + lift, z, 0, 1, 0, x / rep, z / rep); });
    const A = id(d0), C = id(d1);
    for (let i = 0; i + 1 < A.length; i++) if (ovUp) M.quad(A[i], C[i], C[i + 1], A[i + 1]); else M.quad(A[i], A[i + 1], C[i + 1], C[i]);
  };
  const ovPoly = ov.smp.map(([bx, bz, dx, dz]) => [bx + dx * OVAL.R, bz + dz * OVAL.R]);
  clearPolys.push(ovPoly);
  B.asph.setColor('#b98f7c'); band(B.asph, OVAL.R - OVAL.track, OVAL.R, 0.22, 5);                // the cinder track
  B.turf.setColor('#c2c8a6'); for (const [d0, d1] of [[0, 3.4], [3.4, 6.8], [6.8, OVAL.R - OVAL.track + 0.05]]) band(B.turf, d0, d1, 0.2, 8);
  // the goals at the infield's ends, facing in along the axis
  {
    const { u, n } = ov, R0 = OVAL.R - OVAL.track - 1.2;
    for (const [C, dir] of [[OVAL.E, -1], [OVAL.W, 1]]) {
      const gx = C[0] + u[0] * dir * R0, gz = C[1] + u[1] * dir * R0, bx = gx + u[0] * dir * 1.0, bz = gz + u[1] * dir * 1.0, g = heightAt(gx, gz);
      const P = (k, x, z) => [x + n[0] * k, 0, z + n[1] * k];
      D.setColor('#f1f1ec');
      for (const k of [-1.5, 1.5]) {
        const [x, , z] = P(k, gx, gz), [xb, , zb] = P(k, bx, bz);
        D.tube([x, g, z], [x, g + 2.0, z], 0.05, 6); D.tube([x, g + 2.0, z], [xb, g + 1.2, zb], 0.03, 4); D.tube([xb, g + 1.2, zb], [xb, g, zb], 0.03, 4);
        S.cyl(x, z, g, g + 2.0, 0.06, 0.06, 'pole');
      }
      const a = P(-1.5, gx, gz), b = P(1.5, gx, gz), ab = P(-1.5, bx, bz), bb = P(1.5, bx, bz);
      D.tube([a[0], g + 2.0, a[2]], [b[0], g + 2.0, b[2]], 0.05, 6); D.tube([ab[0], g, ab[2]], [bb[0], g, bb[2]], 0.03, 4);
      B.mesh.setColor('#e6e6e0'); quad(B.mesh, [ab[0], g, ab[2]], [bb[0], g, bb[2]], [bb[0], g + 1.2, bb[2]], [ab[0], g + 1.2, ab[2]], [u[0] * dir, 0, u[1] * dir], [[0, 0], [3 / 0.2, 0], [3 / 0.2, 1.2 / 0.2], [0, 1.2 / 0.2]]);
    }
  }
  // two jump pits on the infield's curved ends (the aerial's sand patches), the trodden path past the track
  {
    const { u, n } = ov;
    for (const C of [[-2214.0, 46.0], [-2257.5, 74.0]]) {
      const P = [[-1.4, -2.6], [1.4, -2.6], [1.4, 2.6], [-1.4, 2.6]].map(([a, b]) => [C[0] + n[0] * a + u[0] * b, C[1] + n[1] * a + u[1] * b]);
      B.sand.setColor('#ffffff'); drape(B.sand, P, 0.24, 3);
      D.setColor('#8a877f');
      for (let k = 0; k < 4; k++) { const A = P[k], Q = P[(k + 1) % 4], g = heightAt(...A); D.tube([A[0], g + 0.18, A[1]], [Q[0], heightAt(...Q) + 0.18, Q[1]], 0.07, 4); }
    }
    const [A, C] = PATH, L = Math.hypot(C[0] - A[0], C[1] - A[1]), px = -(C[1] - A[1]) / L, pz = (C[0] - A[0]) / L;
    B.sand.setColor('#9a8a70'); drape(B.sand, [[A[0] - px, A[1] - pz], [C[0] - px, C[1] - pz], [C[0] + px, C[1] + pz], [A[0] + px, A[1] + pz]], 0.21, 3);
  }
  // pull-up bars by the forecourt
  {
    const bx = -2262.0, bz = 106.0;
    D.setColor('#3f6aa0');
    for (const [dx, h] of [[0, 1.9], [1.6, 2.2], [3.2, 2.5]]) for (const dz of [-0.6, 0.6]) { const g = heightAt(bx + dx, bz + dz); D.cyl(bx + dx, g, bz + dz, 0.05, 0.05, h + 0.05, 6); S.cyl(bx + dx, bz + dz, g, g + h, 0.06, 0.06, 'pole'); }
    D.setColor('#e3b52a'); for (const [dx, h] of [[0, 1.9], [1.6, 2.2], [3.2, 2.5]]) { const g = heightAt(bx + dx, bz); D.tube([bx + dx, g + h, bz - 0.6], [bx + dx, g + h, bz + 0.6], 0.025, 5); }
  }

  // ================= the sign wall: white sand-lime brick, three blue plates each side =================
  {
    const { x, z, len } = SIGN, g = heightAt(x, z), h = 1.9, t = 0.25;
    const fw = face([x - len / 2, z + t], [x + len / 2, z + t], 0, 1);
    B.brick.setColor('#f1efe9'); box(B.brick, fw, 0, len, g - 0.3, g + h, -2 * t, 0, 'fblr', [2, 2]);
    D.setColor('#d8d6d0'); D.box(x - len / 2 - 0.05, g + h, z - t - 0.05, x + len / 2 + 0.05, g + h + 0.08, z + t + 0.05);
    S.prism([x - len / 2, z - t, x + len / 2, z - t, x + len / 2, z + t, x - len / 2, z + t], g - 0.3, g + h, 0, 0, 'wall');
    B.sign.setColor('#ffffff');
    const y0 = g + 0.55, y1 = g + 1.75;
    // facing the street (+z), read left to right from outside: x grows to the right; facing the lot, x grows to the left
    quad(B.sign, [x - len / 2 + 0.2, y0, z + t + 0.01], [x + len / 2 - 0.2, y0, z + t + 0.01], [x + len / 2 - 0.2, y1, z + t + 0.01], [x - len / 2 + 0.2, y1, z + t + 0.01], [0, 0, 1], [[0, 0], [1, 0], [1, 0.5], [0, 0.5]]);
    quad(B.sign, [x + len / 2 - 0.2, y0, z - t - 0.01], [x - len / 2 + 0.2, y0, z - t - 0.01], [x - len / 2 + 0.2, y1, z - t - 0.01], [x + len / 2 - 0.2, y1, z - t - 0.01], [0, 0, -1], [[0, 0], [1, 0], [1, 0.5], [0, 0.5]]);
    // the kerbed bed round its foot
    D.setColor('#e6e4de'); D.box(x - len / 2 - 0.6, g - 0.1, z - t - 0.9, x + len / 2 + 0.6, g + 0.15, z - t - 0.75); D.box(x - len / 2 - 0.6, g - 0.1, z + t + 0.75, x + len / 2 + 0.6, g + 0.15, z + t + 0.9);
  }

  // ================= the lot's fence: brick plinth and blue chain-link panels on the street, plain panels elsewhere =================
  const gates = [];
  {
    const seq = [...LOT, LOT[0]], P = 2.6;
    for (let k = 1; k < seq.length; k++) {
      const A = seq[k - 1], C = seq[k], L = Math.hypot(C[0] - A[0], C[1] - A[1]), ux = (C[0] - A[0]) / L, uz = (C[1] - A[1]) / L;
      const street = STREET_EDGES.has(k - 1);
      const gaps = GATES.map(([gx, gz, w]) => { const s = (gx - A[0]) * ux + (gz - A[1]) * uz, o = Math.abs((gx - A[0]) * -uz + (gz - A[1]) * ux); return o < 0.8 && s > -w && s < L + w ? [s - w, s + w] : null; }).filter(Boolean);
      // panels of ~P m between the edge's ends and the gate openings' edges
      const cuts = [...new Set([0, L, ...gaps.flat().map((v) => Math.max(0, Math.min(L, v)))])].sort((p, q) => p - q), pan = [];
      for (let c = 1; c < cuts.length; c++) { const a0 = cuts[c - 1], a1 = cuts[c], m = Math.max(1, Math.round((a1 - a0) / P)); if (a1 - a0 > 0.05) for (let i = 0; i < m; i++) pan.push([a0 + (a1 - a0) * i / m, a0 + (a1 - a0) * (i + 1) / m]); }
      let chunk = null;
      const flush = () => { if (!chunk) return; const [s0, s1, lo, hi] = chunk, m = (s0 + s1) / 2; S.obox(A[0] + ux * m, A[1] + uz * m, (s1 - s0) / 2, street ? 0.2 : 0.06, Math.atan2(uz, ux), lo, hi, 'fence'); chunk = null; };
      for (const [s0, s1] of pan) {
        const mid = (s0 + s1) / 2;
        if (gaps.some(([a, b]) => mid > a && mid < b)) { flush(); continue; }
        const P0 = [A[0] + ux * s0, A[1] + uz * s0], P1 = [A[0] + ux * s1, A[1] + uz * s1], y0 = heightAt(...P0) - 0.05, y1 = heightAt(...P1) - 0.05;
        const pl = street ? 0.9 : 0, H = street ? 2.0 : 1.8, nrm = [uz, 0, -ux];
        if (street) {
          // the whitewashed brick plinth, 0.36 m thick
          const o = (p, d) => [p[0] + uz * d, p[1] - ux * d];
          const a0 = o(P0, 0.18), a1 = o(P1, 0.18), b0 = o(P0, -0.18), b1 = o(P1, -0.18);
          B.brick.setColor('#ecebe6');
          quad(B.brick, [a0[0], y0 - 0.2, a0[1]], [a1[0], y1 - 0.2, a1[1]], [a1[0], y1 + pl, a1[1]], [a0[0], y0 + pl, a0[1]], nrm, [[s0 / 3.2, (y0 - 0.2) / 3.2], [s1 / 3.2, (y1 - 0.2) / 3.2], [s1 / 3.2, (y1 + pl) / 3.2], [s0 / 3.2, (y0 + pl) / 3.2]]);
          quad(B.brick, [b0[0], y0 - 0.2, b0[1]], [b1[0], y1 - 0.2, b1[1]], [b1[0], y1 + pl, b1[1]], [b0[0], y0 + pl, b0[1]], nrm.map((v) => -v), [[s0 / 3.2, (y0 - 0.2) / 3.2], [s1 / 3.2, (y1 - 0.2) / 3.2], [s1 / 3.2, (y1 + pl) / 3.2], [s0 / 3.2, (y0 + pl) / 3.2]]);
          D.setColor('#dddbd4'); quad(D, [a0[0], y0 + pl, a0[1]], [a1[0], y1 + pl, a1[1]], [b1[0], y1 + pl, b1[1]], [b0[0], y0 + pl, b0[1]], UP);
        }
        // the panel: chain-link in a blue frame, a blue post at each end
        B.mesh.setColor('#3f5f8a');
        quad(B.mesh, [P0[0], y0 + pl + 0.05, P0[1]], [P1[0], y1 + pl + 0.05, P1[1]], [P1[0], y1 + H, P1[1]], [P0[0], y0 + H, P0[1]], nrm, [[s0 / 0.1, 0], [s1 / 0.1, 0], [s1 / 0.1, (H - pl) / 0.1], [s0 / 0.1, (H - pl) / 0.1]]);
        D.setColor('#2c5a96');
        for (const [Q, yq] of cuts.includes(s1) ? [[P0, y0], [P1, y1]] : [[P0, y0]]) D.box(Q[0] - 0.05, yq + pl - 0.02, Q[1] - 0.05, Q[0] + 0.05, yq + H + 0.06, Q[1] + 0.05);
        D.tube([P0[0], y0 + H, P0[1]], [P1[0], y1 + H, P1[1]], 0.03, 4); D.tube([P0[0], y0 + pl + 0.06, P0[1]], [P1[0], y1 + pl + 0.06, P1[1]], 0.025, 4);
        const lo = Math.min(y0, y1) - 0.3, hi = Math.max(y0, y1) + H;
        if (chunk && s1 - chunk[0] < 10.5) { chunk[1] = s1; chunk[2] = Math.min(chunk[2], lo); chunk[3] = Math.max(chunk[3], hi); } else { flush(); chunk = [s0, s1, lo, hi]; }
      }
      flush();
    }
    // the gates stand open: a leaf swung in beside each opening
    for (const [gx, gz] of GATES) gates.push([gx, gz]);
  }

  // ================= planting: spruces at the forecourt, the courtyard's trees, birches by the street =================
  const spots = [];
  for (const [x, z, sc] of [[-2248.0, 108.5, 0.9], [-2232.5, 107.5, 1.0], [-2218.0, 108.0, 0.85], [-2203.0, 108.5, 0.95]]) spots.push({ x, z, y: heightAt(x, z) + 0.1, kind: 'conifer', variant: 'spruce', sc, pal: PARK_PINE, s3: [0.9, 1.25, 0.9] });
  for (const [x, z] of [[-2242.0, 147.0], [-2224.0, 152.0], [-2228.0, 166.0]]) spots.push({ x, z, y: heightAt(x, z) + 0.1, kind: 'park', sc: 1.05, pal: PARK_GREENS });
  for (const x of [-2270.0, -2258.0, -2247.0, -2224.0, -2204.0, -2190.0]) { const z = 197.0 + (x + 2212) * -0.03; spots.push({ x, z, y: heightAt(x, z) + 0.1, kind: 'park', variant: 'birch', sc: 0.95, pal: PARK_GREENS }); }

  // ================= materials and meshes =================
  const M = {
    tile: new THREE.MeshStandardMaterial({ map: tileTex(r), vertexColors: true, roughness: 0.6 }),
    det: new THREE.MeshStandardMaterial({ map: speckle(r, '#f2f1ed'), vertexColors: true, roughness: 0.85 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.35 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.35, emissive: 0xffd9a8, emissiveIntensity: 0 }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide }),
    glow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0xfff0d0, emissiveIntensity: 0 }),
    mesh: new THREE.MeshStandardMaterial({ vertexColors: true, alphaMap: meshTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 }),
    brick: new THREE.MeshStandardMaterial({ map: brickTex(r, { base: [236, 233, 224], mortar: [204, 200, 192], spread: 0.08 }), vertexColors: true, roughness: 0.9 }),
    asph: decal(new THREE.MeshStandardMaterial({ map: asphaltTex(r), vertexColors: true, roughness: 0.92 }), 2),
    turf: decal(new THREE.MeshStandardMaterial({ map: turfTex(r), vertexColors: true, roughness: 0.95 }), 1),
    sand: decal(new THREE.MeshStandardMaterial({ map: speckle(r, '#d9c79c', 2400), vertexColors: true, roughness: 0.95 }), 3),
    sign: new THREE.MeshStandardMaterial({ map: signTex(), vertexColors: true, roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0 }),
  };
  M.sign.emissiveMap = M.sign.map;
  const out = finish(root, 'school23', B, M, { shade: ['tile', 'det', 'roof', 'brick'] });
  console.log(`[cherkasy] Collegium Berehynia (school 23): ${nWin} windows (${nLit} lit), ${(out.verts / 1000).toFixed(1)}k verts, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const vols = VOLS.map((R) => ({ x0: R.x0 - 2.5, x1: R.x1 + 2.5, z0: R.z0 - 2.5, z1: R.z1 + 2.5 }));
  return {
    footprints, levels, spots, gates,
    // no generated trees on the building (and 2.5 m round it), the paving, the stadium
    clear: (x, z) => vols.some((R) => x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1) || clearPolys.some((P) => inPoly(P, x, z)),
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.5 * k; M.glow.emissiveIntensity = 1.6 * k; M.sign.emissiveIntensity = 0.12 * k; },
  };
}
