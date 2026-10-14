// OWNER: cherkasy. Черкаська загальноосвітня школа I–III ступенів №8, вул. Смілянська 88/2 (issue #47: "Зробіть щоб
// була школа номер 8"): the school on its lot between Оборонна and the Sosnivka industrial wall (OSM 583918763,
// amenity=school), the main H of OSM 158844435 and the one-storey block OSM 158844436 by the forecourt.
// References: the school's own site (school8ck.zzz.com.ua: the 2025–2026 director's report title photo of the forecourt,
// the old header's winter photo), the Esri aerial and the OSM outlines. What the photos show: orange face brick
// everywhere, white PVC windows; the long three-storey classroom block (south-east bar) under a low gable roof of dark
// sheet; its south-west end section a couple of metres taller with a flat parapet; on its north-west side at that
// end a stair tower rising over the roof with an open concrete canopy on posts; between the bars, facing the asphalt
// forecourt, the one-storey glazed entrance hall: dark red brick piers, two window bays over brick sills, glazed side
// lights and two white panel door bays with double doors, a blue plaque, a red profiled roof edge; a green bar fence.
// Guesses: the north-west bar (two storeys, the gym at its north-east end with a high window band), the courtyard
// (north-east) side of the hall, the end walls' openings, the one-storey block's use and windows, and the sports
// ground's layout (read off the aerial: a worn grass pitch at the south-west end, an asphalt court beside it, a sand pit
// with bars on the dirt patch to the north-west), none of them seen in a photo.
//   SCHOOL8_SKIP: the OSM ids replaced here (buildings.js skips their extrusion)
//   buildSchool8({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints, levels, spots } | null
//     spots: the firs and the chestnut from the photo (hand-placed trees)
//     levels: { main, hall, west, shop } floor heights of the volumes, top: the main block's eave (tests)
// Walls are brick skins cut round real openings (slabkit `hole`: reveals, frames, glass; lit glass in its own mesh);
// the forecourt, courts and pitch are decals draped on the ground; the fence is an alpha-tested bar infill.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { OVERHANG } from '../collision.js';
import { canvasTex, decal } from './sculpt.js';
import { rng, inPoly, ringPts } from './geo.js';
import { brickTex } from './civic.js';
import { along, barTex } from './bridgekit.js';
import { PARK_PINE, PARK_GREENS } from '../trees.js';
import { ringFaces, at, quad, box, rect, skin, hole, solid, finish, speckle, UP } from './slabkit.js';

export const SCHOOL8_SKIP = new Set([158844435, 158844436]);

// the volumes, as map rectangles (the OSM outlines are square to the map frame here)
const MAIN = { x0: -1825.65, x1: -1739.25, z0: 296.6, z1: 312.05 };   // three storeys, classrooms
const END_X = -1811.6;                                                // the taller south-west end section: MAIN.x0..END_X
const TOWER = { x0: -1817.6, x1: -1812.0, z0: 293.6, z1: 296.6 };    // the stair tower on the north-west side
const HALL = { x0: -1811.65, x1: -1796.9, z0: 270.3, z1: 296.6 };    // the glazed one-storey entrance hall between the bars
const WEST = { x0: -1844.3, x1: -1777.95, z0: 256.15, z1: 270.3 };   // two storeys, the gym at the north-east end
const GYM_X = -1800;                                                  // the gym: GYM_X..WEST.x1
const SHOP = { x0: -1897.0, x1: -1859.35, z0: 254.8, z1: 268.4 };    // one storey (workshops, a guess)
// OSM 583918763, the school lot
const LOT = [[-1716.1, 248.4], [-1723.7, 253.6], [-1727.8, 264.8], [-1727.1, 318.6], [-1834.8, 319.8], [-1990, 321.5], [-1990, 247.1]];
const GATE = [-1834.8, 319.8];                                        // where the drive (OSM 583918762) crosses the fence
const FORECOURT = [[-1898, 271.6], [-1811.7, 275.0], [-1811.7, 294.0], [-1898, 292.0]];
const PITCH = { x0: -1984, x1: -1944, z0: 276, z1: 300 };             // worn grass mini-football pitch
const COURT = { x0: -1936, x1: -1908, z0: 294, z1: 309 };             // asphalt basketball court
const SAND = { x0: -1948, x1: -1944, z0: 254, z1: 262 };              // the jump pit, run-up from the north-east
const RUNUP = { x0: -1944, x1: -1914, z0: 257.4, z1: 258.6 };

const FH = 3.4, FHW = 3.6, NF = 3, CORN = 0.55, END_UP = 2.8;           // storey heights, the main block's cornice, end section rise
const BRICK = '#ffffff', PLINTH = '#8d7466', PIER = '#9a4a3a', COPING = '#a7a39c', ROOF = '#5c6166', BAND = '#97412f';
const BRICK_UV = [2.0, 1.8];
const ring = (R) => [[R.x0, R.z0], [R.x1, R.z0], [R.x1, R.z1], [R.x0, R.z1]];
const side = (f) => (f.nx < -0.7 ? 'SW' : f.nx > 0.7 ? 'NE' : f.nz < -0.7 ? 'NW' : 'SE');
const sAt = (f, x, z) => (x - f.ax) * f.ux + (z - f.az) * f.uz;

const asphaltTex = (r) => canvasTex(256, 256, (g, w) => {
  g.fillStyle = '#5a5b5d'; g.fillRect(0, 0, w, w);
  for (let q = 0; q < 9000; q++) { const v = 60 + r() * 70 | 0; g.fillStyle = `rgba(${v},${v},${v + 2},0.5)`; g.fillRect(r() * w, r() * w, 1 + r() * 1.5, 1 + r() * 1.5); }
  for (let q = 0; q < 14; q++) { g.fillStyle = 'rgba(30,30,32,0.08)'; g.beginPath(); g.ellipse(r() * w, r() * w, 10 + r() * 30, 6 + r() * 16, r() * 3, 0, 7); g.fill(); }
});
// worn turf: green with bald sandy patches
const turfTex = (r) => canvasTex(256, 256, (g, w) => {
  g.fillStyle = '#76844a'; g.fillRect(0, 0, w, w);
  for (let q = 0; q < 40; q++) { g.fillStyle = 'rgba(176,158,112,0.22)'; g.beginPath(); g.ellipse(r() * w, r() * w, 8 + r() * 26, 6 + r() * 18, r() * 3, 0, 7); g.fill(); }
  for (let q = 0; q < 7000; q++) { g.fillStyle = r() < 0.5 ? 'rgba(30,50,15,0.22)' : 'rgba(190,200,120,0.16)'; g.fillRect(r() * w, r() * w, 1 + r() * 2, 1 + r() * 2); }
});

export function buildSchool8({ root, map, solids: S, zips: Z, heightAt }) {
  const osm = [...SCHOOL8_SKIP].map((id) => map.buildings?.find((b) => b.id === id));
  if (!osm[0]) return null;
  const t0 = performance.now(), r = rng(8088), n0 = S.count;
  const B = { brick: new MB(), det: new MB(), glass: new MB(), lit: new MB(), roof: new MB(), glow: new MB(), rail: new MB(), asph: new MB(), turf: new MB(), paint: new MB() };
  const D = B.det;
  let nWin = 0, nLit = 0;
  const gMin = (R, pad = 0) => { let lo = Infinity, hi = -Infinity; for (let x = R.x0 - pad; x <= R.x1 + pad + 0.01; x += 3) for (let z = R.z0 - pad; z <= R.z1 + pad + 0.01; z += 3) { const h = heightAt(Math.min(x, R.x1 + pad), Math.min(z, R.z1 + pad)); lo = Math.min(lo, h); hi = Math.max(hi, h); } return [lo, hi]; };

  // ---- levels: each volume on its own floor over the slope (the ground falls ~2.5 m to Оборонна)
  const [mLo, mHi] = gMin(MAIN), [hLo, hHi] = gMin(HALL, 2), [wLo, wHi] = gMin(WEST), [sLo, sHi] = gMin(SHOP);
  const yM = mHi + 0.45, yH = hHi + 0.12, yW = wHi + 0.4, yS = sHi + 0.3;
  const EAVE = yM + NF * FH + CORN, ENDTOP = EAVE + END_UP, RIDGE = EAVE + 1.4;
  const levels = { main: yM, hall: yH, west: yW, shop: yS, top: EAVE };

  // a window: a cut in the face with reveals, white frames, glass (lit at random)
  const win = (f, s0, s1, y0, y1, o = {}) => {
    if (s1 - s0 < 0.3) return;
    const lit = o.lit ?? (r() < 0.22); nWin++; nLit += lit;
    f.cuts.push({ s0, s1, y0, y1, dep: 0.24, pitch: 1.0, tr: y1 - 0.62, sill: o.door ? null : '#d9d6cf', lit, glass: r() < 0.3 ? '#93a5ae' : '#5f7684', frame: '#f2f2ee', ...o });
  };
  // the brick skin round the cuts, the plinth below the floor, the openings
  const walls = (f, gB, yF, yTop, plinthC = PLINTH) => {
    D.setColor(plinthC); box(D, f, -0.04, f.L + 0.04, gB, yF, -0.1, 0.05, 'ft', [2.5, 2.5]);
    skin(B.brick, f, yF, yTop, BRICK, BRICK_UV);
    for (const q of f.cuts) hole(B, f, q);
  };
  const flat = (R, y, col = ROOF) => { B.roof.setColor(col); B.roof.fill(ring(R), [], y, true); };
  const coping = (f, y, o0 = -0.32) => { D.setColor(COPING); box(D, f, -0.05, f.L + 0.05, y, y + 0.1, o0, 0.06, 'ftlr'); };
  const footprints = [], clearPolys = [];
  const prism = (R, y0, y1, kind = 'wall') => S.prism(ring(R).flat(), y0, y1, 0, 0, kind);

  // ================= the main block: three storeys of classrooms, the taller end section, the stair tower =================
  {
    const gB = mLo - 0.6, fy = (k) => yM + k * FH, wx = (f, s) => at(f, s, 0)[0];
    for (const f of ringFaces(ring(MAIN))) {
      const sd = side(f);
      if (sd === 'SE' || sd === 'NW') {
        // the end section's stretch of this face: s0..s1 where x < END_X
        const sE = sAt(f, END_X, f.az), endAt0 = wx(f, 0) < END_X, end = endAt0 ? [0, sE] : [sE, f.L], long = endAt0 ? [sE, f.L] : [0, sE];
        const pitch = 3.3, n = Math.round(f.L / pitch), m = f.L / n;
        for (let i = 0; i < n; i++) {
          const s = (i + 0.5) * m, x = wx(f, s);
          if (sd === 'NW' && x > TOWER.x0 - 0.4 && x < TOWER.x1 + 0.4) continue;              // the stair tower stands there
          for (let k = 0; k < NF; k++) {
            if (sd === 'NW' && k === 0 && x > HALL.x0 - 1 && x < HALL.x1 + 1) continue;       // behind the hall
            const w = sd === 'SE' ? 1.25 : x < END_X ? 0.75 : 0.9;                             // classroom triples / corridor pairs
            win(f, s - w, s + w, fy(k) + 0.95, fy(k) + 2.95, { pitch: sd === 'SE' ? 0.85 : 0.76 });
          }
        }
        D.setColor(PLINTH); box(D, f, -0.04, f.L + 0.04, gB, yM, -0.1, 0.05, 'ft', [2.5, 2.5]);
        // the brick skin in two stretches: the end section up to ENDTOP, the rest up to the eave
        for (const [[s0, s1], top] of [[end, ENDTOP], [long, EAVE]]) {
          const sub = { ...f, ax: f.ax + f.ux * s0, az: f.az + f.uz * s0, L: s1 - s0, cuts: f.cuts.filter((q) => q.s0 >= s0 - 0.01 && q.s1 <= s1 + 0.01).map((q) => ({ ...q, s0: q.s0 - s0, s1: q.s1 - s0 })) };
          skin(B.brick, sub, yM, top, BRICK, BRICK_UV);
        }
        for (const q of f.cuts) hole(B, f, q);
        D.setColor('#c9b8a6'); box(D, f, long[0], long[1], EAVE - CORN, EAVE - CORN + 0.12, 0, 0.06, 'ftu');
        D.setColor(COPING); box(D, f, end[0] - 0.05, end[1] + 0.05, ENDTOP, ENDTOP + 0.1, -0.32, 0.06, 'ftlr');
        // basement windows where the plinth stands high over the ground (the north-east half)
        for (let i = 0; i < Math.floor(f.L / 6.6); i++) {
          const s = (i + 0.5) * 6.6, x = wx(f, s), p = at(f, s, 0, 0.5), g = heightAt(p[0], p[2]);
          if (yM - g < 1.3 || (sd === 'NW' && x > TOWER.x0 - 1 && x < HALL.x1 + 1)) continue;
          D.setColor('#3b3e42'); rect(D, f, s - 0.6, s + 0.6, g + 0.3, Math.min(g + 1.0, yM - 0.2), 0.055);
          D.setColor('#e9e8e3'); box(D, f, s - 0.66, s + 0.66, g + 0.24, g + 0.3, 0.05, 0.1, 'ft');
        }
      } else if (sd === 'SW') {
        // the end wall to the forecourt: a column of windows by the north-west corner, the rest blank brick
        const s = sAt(f, MAIN.x0, MAIN.z0 + 2.2);
        for (let k = 0; k < NF; k++) win(f, s - 0.65, s + 0.65, fy(k) + 0.95, fy(k) + 2.95);
        walls(f, gB, yM, ENDTOP); coping(f, ENDTOP);
      } else {
        // the end to Оборонна: the stair's windows at the half landings over a back door at the ground
        const s = f.L / 2, p = at(f, s, 0, 1), g = heightAt(p[0], p[2]);
        for (let k = 0; k < NF; k++) win(f, s - 0.8, s + 0.8, fy(k) + FH / 2 + 0.7, fy(k) + FH / 2 + 2.2, { lit: r() < 0.5 });
        walls(f, gB, yM, EAVE);
        const yd = Math.min(g + 0.15, yM - 2.4);
        D.setColor('#5a4636'); rect(D, f, s - 0.8, s + 0.8, yd, yd + 2.2, 0.06);
        D.setColor('#d9d6ce'); box(D, f, s - 0.88, s + 0.88, yd + 2.2, yd + 2.28, 0.05, 0.1, 'ftu');
        D.setColor(COPING); box(D, f, s - 1.4, s + 1.4, yd + 2.45, yd + 2.65, 0, 1.3, 'ftlru');
        solid(S, f, s - 1.4, s + 1.4, 0, 1.3, yd + 2.45, yd + 2.65, 'awning', OVERHANG);
      }
    }
    // the end section: a flat roof inside its parapet, and its north-east wall showing over the long roof
    const ER = { x0: MAIN.x0, x1: END_X, z0: MAIN.z0, z1: MAIN.z1 }, zm = (MAIN.z0 + MAIN.z1) / 2, hw = (MAIN.z1 - MAIN.z0) / 2;
    const roofY = (z) => EAVE + (RIDGE - EAVE) * (1 - Math.abs(z - zm) / hw);
    flat(ER, ENDTOP - 0.25, '#55595e');
    {
      const f = ringFaces(ring(ER)).find((q) => side(q) === 'NE'), zz = (s) => f.az + f.uz * s;
      B.brick.setColor(BRICK);
      for (const [a, b] of [[0, f.L / 2], [f.L / 2, f.L]]) quad(B.brick, at(f, a, roofY(zz(a)) - 0.05), at(f, b, roofY(zz(b)) - 0.05), at(f, b, ENDTOP), at(f, a, ENDTOP), f.N, [[a / 2, roofY(zz(a)) / 1.8], [b / 2, roofY(zz(b)) / 1.8], [b / 2, ENDTOP / 1.8], [a / 2, ENDTOP / 1.8]]);
      coping(f, ENDTOP);
    }
    // the long part's low gable roof of dark sheet, overhanging the eaves; the gable to Оборонна in brick
    {
      const x0 = END_X, x1 = MAIN.x1 + 0.35, oh = 0.45, rise = RIDGE - EAVE;
      for (const [zEdge, dir] of [[MAIN.z0 - oh, -1], [MAIN.z1 + oh, 1]]) {
        const ya = EAVE - rise * oh / hw, run = Math.abs(zm - zEdge), ln = Math.hypot(run, RIDGE - ya), nrm = [0, run / ln, dir * (RIDGE - ya) / ln];
        B.roof.setColor(ROOF); quad(B.roof, [x0, ya, zEdge], [x1, ya, zEdge], [x1, RIDGE, zm], [x0, RIDGE, zm], nrm);
        D.setColor('#3d4044'); quad(D, [x0, ya - 0.2, zEdge], [x1, ya - 0.2, zEdge], [x1, ya, zEdge], [x0, ya, zEdge], [0, 0, dir]);
        quad(D, [x0, ya - 0.2, zEdge], [x1, ya - 0.2, zEdge], [x1, ya - 0.2, zEdge - dir * oh], [x0, ya - 0.2, zEdge - dir * oh], [0, -1, 0]);
      }
      B.brick.setColor(BRICK);
      const id = [[MAIN.x1, EAVE, MAIN.z0], [MAIN.x1, RIDGE, zm], [MAIN.x1, EAVE, MAIN.z1]].map(([x, y, z]) => B.brick.vert(x, y, z, 1, 0, 0, z / 2, y / 1.8));
      B.brick.tri(id[0], id[2], id[1]); B.brick.tri(id[0], id[1], id[2]);
      S.prism(ring({ x0, x1: MAIN.x1, z0: MAIN.z0, z1: MAIN.z1 }).flat(), EAVE, RIDGE - 0.5, 0, 0, 'roof');
    }
    prism({ ...MAIN, x0: END_X }, gB, EAVE); prism(ER, gB, ENDTOP + 0.1);
    // the stair tower: a brick shaft a storey over the long roof, windows at the half landings, the open canopy on posts
    {
      const T = TOWER, TT = EAVE + 1.5, tgB = Math.min(heightAt(T.x0, T.z0), heightAt(T.x1, T.z0)) - 0.5;
      for (const f of ringFaces(ring(T))) {
        const sd = side(f); if (sd === 'SE') continue;
        if (sd === 'NW') for (let k = 0; k < NF; k++) win(f, f.L / 2 - 0.75, f.L / 2 + 0.75, yM + k * FH + FH / 2 + 0.6, yM + k * FH + FH / 2 + 2.1, { lit: r() < 0.5 });
        if (sd === 'SW') win(f, f.L / 2 - 0.5, f.L / 2 + 0.5, yM + 2 * FH + 1.0, yM + 2 * FH + 2.6);
        walls(f, tgB, yM, TT); coping(f, TT);
      }
      flat(T, TT - 0.2, '#55595e');
      prism(T, tgB, TT + 0.1);
      // the canopy: a dark slab on four posts over the tower's top, under the end section's higher wall
      const C = { x0: T.x0 - 1.3, x1: T.x1 + 1.3, z0: T.z0 - 1.4, z1: T.z1 - 0.05 }, yc = TT + 2.3;
      D.setColor('#bdb8b0');
      for (const [x, z] of [[T.x0 + 0.2, T.z0 + 0.2], [T.x1 - 0.2, T.z0 + 0.2], [T.x0 + 0.2, T.z1 - 0.25], [T.x1 - 0.2, T.z1 - 0.25]]) D.box(x - 0.15, TT, z - 0.15, x + 0.15, yc, z + 0.15);
      D.setColor('#4a4d51'); D.box(C.x0, yc, C.z0, C.x1, yc + 0.22, C.z1);
      D.setColor('#d9d4cb'); D.box(C.x0 - 0.05, yc + 0.22, C.z0 - 0.05, C.x1 + 0.05, yc + 0.32, C.z1 + 0.05, 63 - 8);
      S.prism(ring(C).flat(), yc, yc + 0.32, 0, 0, 'awning', OVERHANG);
    }
    for (const f of ringFaces(ring(ER))) { const a = at(f, 0, 0, -0.1), c = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], c[0], c[2], ENDTOP + 0.1, f.nx, f.nz); }
    footprints.push({ poly: ring(MAIN), h: ENDTOP - mLo, kind: 'public', name: 'Школа №8' });
    footprints.push({ poly: ring(TOWER), h: ENDTOP - mLo, kind: 'public', name: 'Школа №8' });
  }

  // ================= the entrance hall: one storey of glass between brick piers, white door bays, red roof edge =================
  {
    const R = HALL, top = yH + 3.4, band = top + 0.6, gB = hLo - 0.5;
    for (const f of ringFaces(ring(R))) {
      const sd = side(f); if (sd === 'NW' || sd === 'SE') continue;   // the bars' walls close its sides
      const sz = (z) => sAt(f, sd === 'SW' ? R.x0 : R.x1, z), seg = (a, b) => [sz(R.z0 + a), sz(R.z0 + b)].sort((p, q) => p - q);
      const L = R.z1 - R.z0, k = L / 26.3, piers = [];
      if (sd === 'SW') {
        // read off the photo, left (north-west) to right: pier, window bay, pier, side light, doors, pier (plaque),
        // doors, side light, pier, window bay, end pier
        const bays = [['p', 0, 0.86], ['w', 0.86, 6.86], ['p', 6.86, 7.52], ['g', 7.52, 9.44], ['d', 9.44, 13.3], ['p', 13.3, 14.0], ['d', 14.0, 17.65], ['g', 17.65, 19.53], ['p', 19.53, 20.3], ['w', 20.3, 25.7], ['p', 25.7, 26.3]];
        for (const [t, a, b] of bays) {
          const [s0, s1] = seg(a * k, b * k);
          if (t === 'p') piers.push([s0, s1]);
          else if (t === 'w') win(f, s0, s1, yH + 1.0, yH + 3.2, { pitch: 1.2, tr: yH + 2.5, lit: r() < 0.6 });
          else if (t === 'g') win(f, s0, s1, yH + 0.45, yH + 3.2, { pitch: 0.95, tr: yH + 2.5, door: true, lit: r() < 0.6 });
          else {
            // a white panel bay: double doors in the middle under a white transom panel
            f.cuts.push({ s0, s1, y0: yH, y1: yH + 3.2, panel: true });
          }
        }
      } else {
        // the courtyard side (a guess): three window bays between piers
        for (const [a, b] of [[1.2, 8.0], [9.6, 16.6], [18.2, 25.1]]) { const [s0, s1] = seg(a * k, b * k); win(f, s0, s1, yH + 1.0, yH + 3.2, { pitch: 1.2, tr: yH + 2.5 }); }
      }
      D.setColor(PLINTH); box(D, f, -0.04, f.L + 0.04, gB, yH, -0.1, 0.05, 'ft', [2.5, 2.5]);
      skin(B.brick, f, yH, top, BRICK, BRICK_UV);
      for (const q of f.cuts) {
        if (!q.panel) { hole(B, f, q); continue; }
        const { s0, s1 } = q, mid = (s0 + s1) / 2;
        D.setColor('#ecebe7'); rect(D, f, s0, s1, yH + 0.3, yH + 3.2, -0.12);
        D.setColor('#5d4a3e'); rect(D, f, s0, s1, yH, yH + 0.3, -0.1);
        for (const s of [s0, s1]) { D.setColor('#d9d6ce'); quad(D, at(f, s, yH), at(f, s, yH, -0.12), at(f, s, yH + 3.2, -0.12), at(f, s, yH + 3.2), [f.ux * (s === s0 ? 1 : -1), 0, f.uz * (s === s0 ? 1 : -1)]); }
        D.setColor('#d9d6ce'); box(D, f, s0, s1, yH + 3.15, yH + 3.2, -0.12, 0, 'u');
        // the leaves: a frame line round the pair, the meeting stile and the handles
        D.setColor('#c4c2bc');
        for (const [a, b, y0, y1] of [[mid - 1.0, mid - 0.97, yH + 0.05, yH + 2.35], [mid + 0.97, mid + 1.0, yH + 0.05, yH + 2.35], [mid - 0.015, mid + 0.015, yH + 0.05, yH + 2.35], [mid - 1.0, mid + 1.0, yH + 2.33, yH + 2.36]]) rect(D, f, a, b, y0, y1, -0.11);
        D.setColor('#9a9894'); for (const s of [mid - 0.12, mid + 0.12]) box(D, f, s - 0.02, s + 0.02, yH + 0.9, yH + 1.2, -0.11, -0.05, 'ftlr');
        // a small step in front
        D.setColor('#9c9890'); box(D, f, s0 + 0.2, s1 - 0.2, gB, yH, 0, 0.9, 'ftlr');
      }
      // the dark red brick piers stand proud of the bays
      for (const [s0, s1] of piers) { B.brick.setColor(PIER); box(B.brick, f, s0, s1, yH, top, 0, 0.07, 'flr', BRICK_UV); }
      if (sd === 'SW') {
        // the blue school plaque on the middle pier, a lamp on the right one
        const [p0, p1] = piers[2], pm = (p0 + p1) / 2;
        D.setColor('#2457a3'); box(D, f, pm - 0.28, pm + 0.28, yH + 2.4, yH + 3.0, 0.12, 0.15, 'ftlr');
        D.setColor('#f1d24a'); box(D, f, pm - 0.24, pm + 0.24, yH + 2.75, yH + 2.79, 0.15, 0.155, 'f');
        const [q0, q1] = piers[3], qm = (q0 + q1) / 2, lp = at(f, qm, yH + 2.6, 0.25);
        B.glow.setColor('#fff2d2'); B.glow.box(lp[0] - 0.1, lp[1] - 0.25, lp[2] - 0.1, lp[0] + 0.1, lp[1] + 0.1, lp[2] + 0.1);
      }
      // the red profiled roof edge, sloping back to the flat roof
      B.roof.setColor(BAND);
      const n = [f.nx * 0.8, 0.6, f.nz * 0.8];
      quad(B.roof, at(f, -0.25, top, 0.3), at(f, f.L + 0.25, top, 0.3), at(f, f.L + 0.25, band, -0.35), at(f, -0.25, band, -0.35), n);
      D.setColor('#7d2f22'); quad(D, at(f, -0.25, top - 0.06, 0.3), at(f, f.L + 0.25, top - 0.06, 0.3), at(f, f.L + 0.25, top, 0.3), at(f, -0.25, top, 0.3), f.N);
      D.setColor('#d9d6ce'); quad(D, at(f, -0.25, top - 0.06, 0.3), at(f, f.L + 0.25, top - 0.06, 0.3), at(f, f.L + 0.25, top - 0.06, 0), at(f, -0.25, top - 0.06, 0), [0, -1, 0]);
    }
    flat(R, band - 0.02, '#4f5357');
    prism(R, gB, band);
    footprints.push({ poly: ring(R), h: band - hLo, kind: 'public', name: 'Школа №8' });
  }

  // ================= the north-west bar: two storeys, the gym with a high window band at the north-east end =================
  {
    const R = WEST, gB = wLo - 0.6, top = yW + 2 * FHW + 0.7, fy = (k) => yW + k * FHW;
    for (const f of ringFaces(ring(R))) {
      const sd = side(f), sx = (x) => sAt(f, x, sd === 'NW' ? R.z0 : R.z1);
      if (sd === 'SE' || sd === 'NW') {
        const gym = [sx(GYM_X), sx(R.x1)].sort((a, b) => a - b), hall = [sx(HALL.x0) - 1.0, sx(HALL.x1) + 1.0].sort((a, b) => a - b);
        const n = Math.round(f.L / 3.6), m = f.L / n;
        for (let i = 0; i < n; i++) {
          const s = (i + 0.5) * m, inGym = s > gym[0] + 0.5 && s < gym[1] - 0.5;
          if (inGym) { win(f, s - 1.2, s + 1.2, yW + 3.6, yW + 6.6, { pitch: 0.8, tr: yW + 4.6, lit: r() < 0.3 }); continue; }
          for (let k = 0; k < 2; k++) {
            if (sd === 'SE' && k === 0 && s > hall[0] && s < hall[1]) continue;
            win(f, s - 1.05, s + 1.05, fy(k) + 1.0, fy(k) + 3.0, { pitch: 0.7 });
          }
        }
      } else if (sd === 'SW') {
        // to the forecourt: a door in the middle, windows either side on both floors
        const s = f.L / 2;
        win(f, s - 0.9, s + 0.9, yW, yW + 2.4, { door: true, glass: '#566470', tr: yW + 2.0, lit: r() < 0.5 });
        D.setColor(COPING); box(D, f, s - 1.6, s + 1.6, yW + 2.6, yW + 2.8, 0, 1.4, 'ftlru'); solid(S, f, s - 1.6, s + 1.6, 0, 1.4, yW + 2.6, yW + 2.8, 'awning', OVERHANG);
        for (const ds of [-4.4, 4.4]) for (let k = 0; k < 2; k++) win(f, s + ds - 1.05, s + ds + 1.05, fy(k) + 1.0, fy(k) + 3.0, { pitch: 0.7 });
        win(f, s - 0.8, s + 0.8, fy(1) + 1.0, fy(1) + 3.0);
      } else {
        for (const s of [f.L * 0.3, f.L * 0.7]) win(f, s - 0.6, s + 0.6, yW + 4.4, yW + 5.8, { tr: 0 });
      }
      walls(f, gB, yW, top);
      coping(f, top);
      const a = at(f, 0, 0, -0.1), c = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], c[0], c[2], top, f.nx, f.nz);
    }
    flat(R, top - 0.25, '#4e5256');
    prism(R, gB, top);
    footprints.push({ poly: ring(R), h: top - wLo, kind: 'public', name: 'Школа №8' });
  }

  // ================= the one-storey block by the forecourt (OSM 158844436): brick, low gable roof =================
  if (osm[1]) {
    const R = SHOP, gB = sLo - 0.5, eave = yS + 4.0, ridge = eave + 1.1, zm = (R.z0 + R.z1) / 2;
    for (const f of ringFaces(ring(R))) {
      const sd = side(f);
      if (sd === 'SE' || sd === 'NW') {
        const n = Math.round(f.L / 4.2), m = f.L / n;
        for (let i = 0; i < n; i++) {
          const s = (i + 0.5) * m;
          if (sd === 'SE' && i === Math.floor(n / 2)) { win(f, s - 0.8, s + 0.8, yS, yS + 2.3, { door: true, glass: '#5a4636', lit: false, tr: 0 }); continue; }
          win(f, s - 1.1, s + 1.1, yS + 1.1, yS + 3.1, { pitch: 0.75 });
        }
      } else win(f, f.L / 2 - 0.7, f.L / 2 + 0.7, yS + 1.1, yS + 3.1);
      walls(f, gB, yS, eave);
      if (sd === 'NE' || sd === 'SW') {
        const id = [at(f, 0, eave), at(f, f.L / 2, ridge), at(f, f.L, eave)].map(([x, y, z]) => B.brick.vert(x, y, z, f.nx, 0, f.nz, (x + z) / 2, y / 1.8));
        B.brick.tri(id[0], id[1], id[2]); B.brick.tri(id[0], id[2], id[1]);
      }
    }
    B.roof.setColor('#6a6e72');
    for (const [za, zb] of [[R.z0 - 0.4, zm], [R.z1 + 0.4, zm]]) {
      const y = eave - 0.4 * 1.1 / (zm - R.z0);
      quad(B.roof, [R.x0 - 0.3, y, za], [R.x1 + 0.3, y, za], [R.x1 + 0.3, ridge, zb], [R.x0 - 0.3, ridge, zb], [0, 0.97, za < zb ? -0.24 : 0.24]);
      quad(B.roof, [R.x0 - 0.3, y - 0.05, za], [R.x1 + 0.3, y - 0.05, za], [R.x1 + 0.3, ridge - 0.05, zb], [R.x0 - 0.3, ridge - 0.05, zb], [0, -0.97, za < zb ? 0.24 : -0.24]);
    }
    prism(R, gB, eave);
    footprints.push({ poly: ring(R), h: ridge - sLo, kind: 'public', name: 'Школа №8' });
  }

  // ================= the grounds: forecourt, pitch, court, jump pit and bars =================
  // a polygon (convex quad p0..p3) draped on the ground in cells of <= 2 m, `lift` over heightAt, uv in metres / rep
  const drape = (M, P, lift, rep) => {
    const [a, b, c, d] = P, nu = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2)), nv = Math.max(1, Math.ceil(Math.hypot(d[0] - a[0], d[1] - a[1]) / 2));
    const pt = (u, v) => { const x = (1 - v) * (a[0] + (b[0] - a[0]) * u) + v * (d[0] + (c[0] - d[0]) * u), z = (1 - v) * (a[1] + (b[1] - a[1]) * u) + v * (d[1] + (c[1] - d[1]) * u); return [x, heightAt(x, z) + lift, z]; };
    const id = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const p = pt(i / nu, j / nv); id.push(M.vert(p[0], p[1], p[2], 0, 1, 0, p[0] / rep, p[2] / rep)); }
    // face up whichever way the corners run: (b - a) x (d - a) has y = du_z dv_x - du_x dv_z
    const up = (b[1] - a[1]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[1] - a[1]) > 0;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const k = j * (nu + 1) + i, q = [id[k], id[k + 1], id[k + nu + 2], id[k + nu + 1]];
      if (up) M.quad(...q); else M.quad(q[0], q[3], q[2], q[1]);
    }
  };
  B.asph.setColor('#ffffff'); drape(B.asph, FORECOURT, 0.22, 6); clearPolys.push(FORECOURT);
  // a painted line strip from A to C, w wide, in short pieces so it follows the ground
  const stripe = (A, C, w = 0.1, lift = 0.25) => {
    const L = Math.hypot(C[0] - A[0], C[1] - A[1]), ux = (C[0] - A[0]) / L, uz = (C[1] - A[1]) / L, n = Math.max(1, Math.ceil(L / 2));
    B.paint.setColor('#eeeee6');
    for (let i = 0; i < n; i++) {
      const p = (t, o) => { const x = A[0] + ux * t - uz * o, z = A[1] + uz * t + ux * o; return [x, heightAt(x, z) + lift, z]; };
      const t0 = L * i / n, t1 = L * (i + 1) / n;
      quad(B.paint, p(t0, -w / 2), p(t1, -w / 2), p(t1, w / 2), p(t0, w / 2), UP);
    }
  };
  const circle = (cx, cz, rad, a0 = 0, a1 = Math.PI * 2, n = 24) => { for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n, b = a0 + (a1 - a0) * (i + 1) / n; stripe([cx + rad * Math.cos(a), cz + rad * Math.sin(a)], [cx + rad * Math.cos(b), cz + rad * Math.sin(b)]); } };
  const outline = (R) => { const P = ring(R); for (let i = 0; i < 4; i++) stripe(P[i], P[(i + 1) % 4]); };
  // the pitch: worn turf, lines, two small goals
  {
    const R = PITCH, xm = (R.x0 + R.x1) / 2, zm = (R.z0 + R.z1) / 2;
    B.turf.setColor('#b4bc9c'); drape(B.turf, ring(R), 0.2, 8); clearPolys.push(ring(R));
    outline(R); stripe([xm, R.z0], [xm, R.z1]); circle(xm, zm, 3);
    for (const [x, dir] of [[R.x0, 1], [R.x1, -1]]) {
      stripe([x, zm - 5], [x + 5 * dir, zm - 5]); stripe([x + 5 * dir, zm - 5], [x + 5 * dir, zm + 5]); stripe([x + 5 * dir, zm + 5], [x, zm + 5]);
      const g = heightAt(x, zm), xb = x - 1.0 * dir;
      D.setColor('#f1f1ec');
      for (const z of [zm - 1.5, zm + 1.5]) { D.tube([x, g, z], [x, g + 2.0, z], 0.05, 6); D.tube([x, g + 2.0, z], [xb, g + 1.2, z], 0.03, 4); D.tube([xb, g + 1.2, z], [xb, g, z], 0.03, 4); S.cyl(x, z, g, g + 2.0, 0.06, 0.06, 'pole'); }
      D.tube([x, g + 2.0, zm - 1.5], [x, g + 2.0, zm + 1.5], 0.05, 6);
      D.tube([xb, g, zm - 1.5], [xb, g, zm + 1.5], 0.03, 4);
      B.rail.setColor('#dcdcd6');   // the net, a coarse bar infill
      quad(B.rail, [xb, g, zm - 1.5], [xb, g, zm + 1.5], [xb, g + 1.2, zm + 1.5], [xb, g + 1.2, zm - 1.5], [-dir, 0, 0], [[0, 0], [3 / 0.12, 0], [3 / 0.12, 1], [0, 1]]);
    }
  }
  // the court: asphalt, lines, a hoop at each end
  {
    const R = COURT, xm = (R.x0 + R.x1) / 2, zm = (R.z0 + R.z1) / 2;
    B.asph.setColor('#e8e8e8'); drape(B.asph, ring(R), 0.23, 6); clearPolys.push(ring(R));
    outline(R); stripe([xm, R.z0], [xm, R.z1]); circle(xm, zm, 1.8);
    for (const [x, dir] of [[R.x0, 1], [R.x1, -1]]) {
      circle(x, zm, 6.75, -Math.PI / 2 * dir + (dir < 0 ? Math.PI : 0), Math.PI / 2 * dir + (dir < 0 ? Math.PI : 0), 16);
      const xp = x - 0.6 * dir, g = heightAt(xp, zm);
      D.setColor('#4d6f8c'); D.cyl(xp, g, zm, 0.08, 0.08, 3.9, 6); S.cyl(xp, zm, g, g + 3.9, 0.09, 0.09, 'pole');
      D.tube([xp, g + 3.6, zm], [xp + 1.0 * dir, g + 3.4, zm], 0.05, 5);
      D.setColor('#f2f2ee'); D.box(xp + 1.0 * dir - 0.03, g + 2.9, zm - 0.9, xp + 1.0 * dir + 0.03, g + 3.95, zm + 0.9);
      D.setColor('#d4502e'); const cx = xp + 1.35 * dir;
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, b = (i + 1) * Math.PI / 6; D.tube([cx + 0.23 * Math.cos(a), g + 3.05, zm + 0.23 * Math.sin(a)], [cx + 0.23 * Math.cos(b), g + 3.05, zm + 0.23 * Math.sin(b)], 0.02, 4); }
    }
  }
  // the jump pit and its run-up, the pull-up bars beside it
  {
    B.turf.setColor('#d8c79a'); drape(B.turf, ring(SAND), 0.23, 3);
    B.asph.setColor('#c0634a'); drape(B.asph, ring(RUNUP), 0.23, 3);
    clearPolys.push(ring(SAND), ring(RUNUP));
    D.setColor('#7d7a74'); for (const f of ringFaces(ring(SAND))) { const g = heightAt(...[at(f, f.L / 2, 0)].map((p) => [p[0], p[2]])[0]); box(D, f, 0, f.L, g + 0.05, g + 0.32, 0, 0.12, 'ft'); }
    const bx = -1932, bz = 264;
    D.setColor('#355e8c');
    for (const [dx, h] of [[0, 1.9], [1.6, 2.2], [3.2, 2.5]]) for (const dz of [-0.6, 0.6]) {
      const g = heightAt(bx + dx, bz + dz); D.cyl(bx + dx, g, bz + dz, 0.05, 0.05, h + 0.05, 6); S.cyl(bx + dx, bz + dz, g, g + h, 0.06, 0.06, 'pole');
    }
    D.setColor('#e3b52a'); for (const [dx, h] of [[0, 1.9], [1.6, 2.2], [3.2, 2.5]]) { const g = heightAt(bx + dx, bz); D.tube([bx + dx, g + h, bz - 0.6], [bx + dx, g + h, bz + 0.6], 0.025, 5); }
  }

  // ================= planting from the photo: firs on the lawn strip by the north-west bar, a chestnut by the end wall,
  // the low green fence round the bed in front of the main block's end =================
  const spots = [];
  for (const [x, z, sc] of [[-1816.5, 272.8, 0.6], [-1823, 272.6, 0.7], [-1830, 272.6, 0.62], [-1837.5, 272.4, 0.68]]) spots.push({ x, z, y: heightAt(x, z) + 0.15, kind: 'conifer', variant: 'spruce', sc, pal: PARK_PINE, s3: [0.6, 1.1, 0.6] });
  for (const [x, z] of [[-1829.6, 306.5]]) spots.push({ x, z, y: heightAt(x, z) + 0.15, kind: 'park', sc: 1.0, pal: PARK_GREENS });
  {
    const P = [[-1825.7, 298.4], [-1828.8, 298.4], [-1828.8, 311.6], [-1825.7, 311.6]], h = 1.15;
    for (let k = 1; k < P.length; k++) {
      const [A, C] = [P[k - 1], P[k]], ya = heightAt(...A) - 0.05, yc = heightAt(...C) - 0.05, L = Math.hypot(C[0] - A[0], C[1] - A[1]), nx = (C[1] - A[1]) / L, nz = -(C[0] - A[0]) / L;
      B.rail.setColor('#3f7a50'); quad(B.rail, [A[0], ya, A[1]], [C[0], yc, C[1]], [C[0], yc + h, C[1]], [A[0], ya + h, A[1]], [nx, 0, nz], [[0, 0], [L / 0.14, 0], [L / 0.14, 1], [0, 1]]);
      D.setColor('#2f5a3c'); D.tube([A[0], ya + h, A[1]], [C[0], yc + h, C[1]], 0.025, 4); D.tube([C[0], yc, C[1]], [C[0], yc + h + 0.05, C[1]], 0.035, 4);
      S.obox((A[0] + C[0]) / 2, (A[1] + C[1]) / 2, L / 2, 0.05, Math.atan2(C[1] - A[1], C[0] - A[0]), Math.min(ya, yc) - 0.3, Math.max(ya, yc) + h, 'fence');
    }
    // the hedge of round bushes behind it
    D.setColor('#3f6a35');
    for (let z = 299.5; z < 311; z += 1.6) { const x = -1827.2, g = heightAt(x, z); D.ellipsoid([x, g + 0.55, z], [0.75, 0.6, 0.8], 7, 5); }
  }

  // ================= the lot's green bar fence (OSM 583918763), the gate where the drive comes in =================
  {
    const roads = (map.roads ?? []).filter((q) => q.k === 'm' && q.p.some((v, i) => i % 2 === 0 && v < -1690 && v > -2020 && q.p[i + 1] > 220 && q.p[i + 1] < 350)).map((q) => ({ p: ringPts(q.p), w: q.w / 2 + 1.0 }));
    const H = 1.6, GW = 3.3, near = (x, z) => roads.some((q) => along(q.p, x, z).d < q.w);
    const seq = [...LOT, LOT[0]];
    for (let k = 1; k < seq.length; k++) {
      const A = seq[k - 1], C = seq[k], L = Math.hypot(C[0] - A[0], C[1] - A[1]), ux = (C[0] - A[0]) / L, uz = (C[1] - A[1]) / L;
      // the gate opening: GW either side of GATE along the fence line
      const sg = (GATE[0] - A[0]) * ux + (GATE[1] - A[1]) * uz, og = Math.abs((GATE[0] - A[0]) * -uz + (GATE[1] - A[1]) * ux);
      const cuts = [0, L], gap = og < 0.6 ? [sg - GW, sg + GW] : null;
      if (gap) cuts.push(...gap.map((s) => Math.max(0, Math.min(L, s))));
      cuts.sort((a, b) => a - b);
      let chunk = null;
      const flush = () => { if (!chunk) return; const [s0, s1, lo, hi] = chunk, m = (s0 + s1) / 2; S.obox(A[0] + ux * m, A[1] + uz * m, (s1 - s0) / 2, 0.06, Math.atan2(uz, ux), lo, hi, 'fence'); chunk = null; };
      for (let c = 1; c < cuts.length; c++) {
        const a0 = cuts[c - 1], a1 = cuts[c];
        if (a1 - a0 < 0.05 || (gap && (a0 + a1) / 2 > gap[0] && (a0 + a1) / 2 < gap[1])) { flush(); continue; }
        const n = Math.ceil((a1 - a0) / 2.5);
        for (let i = 0; i < n; i++) {
          const s0 = a0 + (a1 - a0) * i / n, s1 = a0 + (a1 - a0) * (i + 1) / n, P0 = [A[0] + ux * s0, A[1] + uz * s0], P1 = [A[0] + ux * s1, A[1] + uz * s1];
          if (near((P0[0] + P1[0]) / 2, (P0[1] + P1[1]) / 2)) { flush(); continue; }
          const y0 = heightAt(...P0) - 0.05, y1 = heightAt(...P1) - 0.05;
          B.rail.setColor('#3f6e4c');
          quad(B.rail, [P0[0], y0, P0[1]], [P1[0], y1, P1[1]], [P1[0], y1 + H, P1[1]], [P0[0], y0 + H, P0[1]], [uz, 0, -ux], [[s0 / 0.14, 0], [s1 / 0.14, 0], [s1 / 0.14, 1], [s0 / 0.14, 1]]);
          D.setColor('#2f5a3c');
          D.tube([P0[0], y0, P0[1]], [P0[0], y0 + H + 0.05, P0[1]], 0.04, 4); D.tube([P1[0], y1, P1[1]], [P1[0], y1 + H + 0.05, P1[1]], 0.04, 4);
          D.tube([P0[0], y0 + H, P0[1]], [P1[0], y1 + H, P1[1]], 0.025, 4); D.tube([P0[0], y0 + 0.1, P0[1]], [P1[0], y1 + 0.1, P1[1]], 0.025, 4);
          const lo = Math.min(y0, y1) - 0.3, hi = Math.max(y0, y1) + H;
          if (chunk && s1 - chunk[0] < 10.5) { chunk[1] = s1; chunk[2] = Math.min(chunk[2], lo); chunk[3] = Math.max(chunk[3], hi); } else { flush(); chunk = [s0, s1, lo, hi]; }
        }
        flush();
      }
    }
    // the two gate leaves, swung open into the lot from posts at the opening's ends
    const [lcx, lcz] = LOT.reduce(([a, b], [x, z]) => [a + x / LOT.length, b + z / LOT.length], [0, 0]);
    const ux = LOT[5][0] - LOT[3][0], uz = LOT[5][1] - LOT[3][1], L = Math.hypot(ux, uz), u = [ux / L, uz / L];
    const sgn = -u[1] * (lcx - GATE[0]) + u[0] * (lcz - GATE[1]) > 0 ? 1 : -1, n = [-u[1] * sgn, u[0] * sgn];
    for (const d of [-1, 1]) {
      const hx = GATE[0] + u[0] * d * GW, hz = GATE[1] + u[1] * d * GW, ex = hx + n[0] * 3.0, ez = hz + n[1] * 3.0, g = heightAt(hx, hz) - 0.05;
      B.rail.setColor('#3f6e4c'); quad(B.rail, [hx, g + 0.05, hz], [ex, g + 0.05, ez], [ex, g + H, ez], [hx, g + H, hz], [u[0], 0, u[1]], [[0, 0], [3.0 / 0.14, 0], [3.0 / 0.14, 1], [0, 1]]);
      D.setColor('#2f5a3c'); D.box(hx - 0.08, g, hz - 0.08, hx + 0.08, g + H + 0.2, hz + 0.08);
      D.tube([ex, g + 0.05, ez], [ex, g + H, ez], 0.035, 4); D.tube([hx, g + H, hz], [ex, g + H, ez], 0.03, 4); D.tube([hx, g + 0.12, hz], [ex, g + 0.12, ez], 0.03, 4);
      S.obox((hx + ex) / 2, (hz + ez) / 2, 1.5, 0.06, Math.atan2(n[1], n[0]), g - 0.3, g + H, 'fence');
    }
  }

  // ================= materials and meshes =================
  const M = {
    brick: new THREE.MeshStandardMaterial({ map: brickTex(r, { base: [168, 118, 92], mortar: [186, 176, 162], spread: 0.16 }), vertexColors: true, roughness: 0.9 }),
    det: new THREE.MeshStandardMaterial({ map: speckle(r, '#f2f1ed'), vertexColors: true, roughness: 0.85 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.35 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.35, emissive: 0xffd9a8, emissiveIntensity: 0 }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.15, side: THREE.DoubleSide }),
    glow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0xfff0d0, emissiveIntensity: 0 }),
    rail: new THREE.MeshStandardMaterial({ vertexColors: true, alphaMap: barTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }),
    asph: decal(new THREE.MeshStandardMaterial({ map: asphaltTex(r), vertexColors: true, roughness: 0.92 }), 2),
    turf: decal(new THREE.MeshStandardMaterial({ map: turfTex(r), vertexColors: true, roughness: 0.95 }), 1),
    paint: decal(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8 }), 3),
  };
  const out = finish(root, 'school8', B, M, { shade: ['brick', 'det', 'roof'] });
  console.log(`[cherkasy] School 8: ${nWin} windows (${nLit} lit), ${(out.verts / 1000).toFixed(1)}k verts, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const vols = [MAIN, TOWER, HALL, WEST, SHOP].map((R) => ({ x0: R.x0 - 2.5, x1: R.x1 + 2.5, z0: R.z0 - 2.5, z1: R.z1 + 2.5 }));
  return {
    footprints, levels, spots,
    // no generated trees on the buildings (and 2.5 m round them), the forecourt, the courts or the pitch
    clear: (x, z) => vols.some((R) => x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1) || clearPolys.some((P) => inPoly(P, x, z)),
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.5 * k; M.glow.emissiveIntensity = 1.6 * k; },
  };
}
