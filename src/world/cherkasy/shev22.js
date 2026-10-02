// OWNER: cherkasy. The new eight-storey block at бульвар Шевченка, 22 / вул. Степана Бандери, 35 (Благовісний, on the
// corner by the Sosnovyi Bir end of the boulevard; 88 flats over a commercial ground floor, brick, due 2027), built as
// the developer's current renders show it (lun.ua/new/cherkasy/shevchenka-blv-22 and the developer's project page):
// OSM still has the old cottages of no. 22 on the lot. A 30 x 22 m slab along the boulevard, its short side on
// Бандери. Seven residential storeys in dark charcoal brick, broken by cream rendered pylons that stand proud and
// run up past the parapet, each framing a two-window stack of floor-to-ceiling glazing (graphite frames, a cream
// mullion and floor bands); narrow brick bays between them with a single window, thin cream floor bands and the
// air-conditioner boxes; on the street corner a brick tower ringed by thick cream bands at every floor. The ground
// floor is shops on both streets and round the corner onto the yard: dark brown marble piers and glazed fronts under
// a deep dark-brown fascia; the residents' door is on the yard side. Flat roof with a lift head. Paved forecourt
// with planters on the corner, a paved yard behind a bar fence. Windows and shops light up at night. No developer
// name, logo or shop signs.
//   SHEV22_SKIP: the OSM ids replaced here (the cottages on the lot; buildings.js skips them)
//   SHEV22_BOX: [x0, x1, z0, z1] the walls on the map (the boulevard runs along z past x1, Бандери along x past z0);
//     places.js SHEV22_RING keeps a copy as a ring (tests/shev22.test.mjs keeps the two in step)
//   buildShev22({ root, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints }
// Each wall is a slabkit face (s along the wall, y up, o outward) cut into a sequence of segments, each drawn by its
// type: 'T' the corner tower, 'P' a pylon, 'B' a narrow brick bay with one window, 'K' a wider back bay with two,
// 'b' a plain brick strip.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { rng } from './geo.js';
import { canvasTex, decal } from './sculpt.js';
import { face, at, quad, rect, box, skin, hole, solid, finish, speckle } from './slabkit.js';

export const SHEV22_SKIP = new Set([310081095, 916748050, 916748051, 390980014, 917054832]);
export const SHEV22_BOX = [-87, -65, -2476, -2446];
// the lot (OSM fences: the yard of no. 24 to the south-east, the four-storey Бандери 37 to the south-west)
const LOT = [-96.6, -63.2, -2477.9, -2443.2];

const GF = 3.9, FH = 3.0, NU = 7, PARA = 0.6, PYL = 1.6;  // ground storey, storey, upper storeys, parapet, pylons over the roof
const CREAM = '#ecd8b6', BAND = '#efdfc3', FASCIA = '#3b302a', FRAME = '#2a2725', PLINTH = '#3c3a39', AC = '#5b4537';
const J = 0.45, PO = 0.45;                                // pylon jamb width and reach

// the walls, each from its start corner; [type, width]. The boulevard and Бандери fronts start at the street corner.
const [X0, X1, Z0, Z1] = SHEV22_BOX;
const WALLS = [
  { a: [X1, Z0], b: [X1, Z1], n: [1, 0], street: true,                 // the boulevard front
    seq: [['T', 6], ['P', 6.6], ['B', 1.8], ['P', 6.6], ['B', 1.8], ['P', 6.6], ['b', 0.6]] },
  { a: [X1, Z0], b: [X0, Z0], n: [0, -1], street: true,                // Бандери
    seq: [['T', 5], ['b', 0.9], ['P', 6.6], ['B', 1.8], ['P', 6.6], ['b', 1.1]] },
  { a: [X0, Z0], b: [X0, Z1], n: [-1, 0], shops: 11, door: 18.3,      // the yard side: shops at the Бандери end, the residents' door
    seq: [['b', 1.0], ['P', 5.5], ['K', 4.2], ['P', 5.5], ['K', 4.2], ['P', 5.5], ['K', 4.1]] },
  { a: [X1, Z1], b: [X0, Z1], n: [0, 1],                               // toward no. 24
    seq: [['K', 4.4], ['P', 5.5], ['K', 4.2], ['P', 5.5], ['K', 2.4]] },
];

// ------------------------------------------------------------------------------------------------ textures
// charcoal facing brick in running bond, 1 m x 1 m per repeat (4 bricks across, 15 courses)
const brickTex = (r) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#6e6159'; g.fillRect(0, 0, w, h);
  const rows = 15, rh = h / rows, bw = w / 4;
  for (let i = 0; i < rows; i++) for (let k = -1; k < 5; k++) {
    const x = k * bw + (i % 2 ? bw / 2 : 0), c = 38 + r() * 26, wm = r() < 0.15 ? 10 : 0;
    g.fillStyle = `rgb(${c + 12 + wm},${c + 3},${c - 3})`; g.fillRect(x + 1.5, i * rh + 1.5, bw - 3, rh - 3);
  }
});
// dark brown marble with pale veins, 1.5 m x 3 m per repeat
const marbleTex = (r) => canvasTex(256, 512, (g, w, h) => {
  g.fillStyle = '#3b2a22'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '20,12,8' : '90,62,48'},0.18)`; g.fillRect(r() * w, r() * h, 6 + r() * 30, 4 + r() * 20); }
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(236,222,205,${0.25 + r() * 0.5})`; g.lineWidth = 0.6 + r() * 1.6;
    let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (r() - 0.35) * 50; y += (r() - 0.5) * 70; g.lineTo(x, y); }
    g.stroke();
  }
});
// concrete pavers, 0.5 m squares, 2 m per repeat
const paveTex = (r) => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.2)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  g.fillStyle = 'rgba(0,0,0,0.13)'; for (let k = 0; k < 4; k++) { g.fillRect(0, k * 32, w, 1); g.fillRect(k * 32 + (k % 2) * 0, 0, 1, h); }
});

// ------------------------------------------------------------------------------------------------ the build
export function buildShev22({ root, solids: S, zips: Z, heightAt }) {
  const t0 = performance.now(), r = rng(22035), n0 = S.count;
  const B = { wall: new MB(), brick: new MB(), det: new MB(), glass: new MB(), lit: new MB(), marble: new MB(), mat: new MB() };
  const D = B.det, UV = [2.5, 2.5], UB = [1, 1], UM = [1.5, 3];
  const ring = [[X1, Z0], [X1, Z1], [X0, Z1], [X0, Z0]];
  const hs = []; for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) hs.push(heightAt(X0 + (X1 - X0) * i / 4, Z0 + (Z1 - Z0) * j / 4));
  // the floor sits at the street corner's pavement: the boulevard falls away from it a little, Бандери climbs ~0.7 m
  // to the west, where the shop fronts start at the pavement (their glass is cut to it)
  const gLo = Math.min(...hs), yF = heightAt(X1 + 1.5, Z0 - 1.5) + 0.15, Y = (h) => yF + h, gB = gLo - 0.6;
  const fy = (k) => Y(GF + (k - 1) * FH);                 // floor of upper storey k (1..NU)
  const ROOF = Y(GF + NU * FH), TOP = ROOF + PARA, TOPP = ROOF + PYL;
  let nWin = 0, nLit = 0;
  const win = (f, s0, s1, y0, y1, extra = {}) => {
    const lit = r() < 0.3; nWin++; if (lit) nLit++;
    f.cuts.push({ s0, s1, y0, y1 });
    hole(B, f, { s0, s1, y0, y1, dep: 0.24, rev: '#4a4542', frame: FRAME, glass: ['#727775', '#686d6c', '#7d807b'][(r() * 3) | 0], lit, pitch: 1.3, ...extra });
  };
  const ac = (f, s, k) => { D.setColor(AC); box(D, f, s - 0.35, s + 0.35, fy(k) + 0.25, fy(k) + 0.85, 0, 0.32, 'fltr'); };

  // ---- upper storeys, segment by segment
  const segBody = (f, s0, w, type, faceIdx) => {
    const zf = face([at(f, s0, 0)[0], at(f, s0, 0)[2]], [at(f, s0 + w, 0)[0], at(f, s0 + w, 0)[2]], f.nx, f.nz), m = w / 2;
    const top = TOP;
    if (type === 'P') {
      const mm = 0.12;
      for (let k = 1; k <= NU; k++) for (const [a, b] of [[J, m - mm], [m + mm, w - J]]) win(zf, a, b, fy(k) + 0.3, fy(k) + FH - 0.05, { tr: fy(k) + FH - 0.65 });
      skin(B.wall, zf, Y(GF), ROOF, CREAM, UV);
      B.wall.setColor(CREAM);
      for (const [a, b] of [[0, J], [w - J, w]]) box(B.wall, zf, a, b, Y(GF), ROOF, 0, PO, 'flr', UV);
      for (let k = 1; k <= NU; k++) box(B.wall, zf, J, w - J, fy(k), fy(k) + 0.3, 0, PO - 0.12, 'ftu', UV);
      box(B.wall, zf, m - mm, m + mm, fy(1) + 0.3, ROOF, 0, PO - 0.12, 'flr', UV);
      box(B.wall, zf, 0, w, ROOF, TOPP, -0.5, PO, 'fbtlr', UV);                  // the cap over the roof line
      D.setColor('#d9c7a8'); box(D, zf, 0, w, TOPP, TOPP + 0.04, -0.5, PO, 't');
      solid(S, zf, 0, w, 0, PO, Y(GF), TOPP, 'wall');
    } else {
      if (type === 'T') {                                      // two windows a storey between thick cream bands
        const ws = w > 5.5 ? [[0.55, 2.75], [3.25, 5.45]] : [[0.5, 2.3], [2.8, 4.6]];
        for (let k = 1; k <= NU; k++) for (const [a, b] of ws) win(zf, a, b, fy(k) + 0.35, fy(k) + FH - 0.3, { tr: fy(k) + FH - 0.85 });
      } else if (type === 'B') for (let k = 1; k <= NU; k++) win(zf, m - 0.45, m + 0.45, fy(k) + 0.55, fy(k) + FH - 0.3, { pitch: 2, sill: BAND });
      else if (type === 'K') for (let k = 1; k <= NU; k++) for (const c of [w * 0.28, w * 0.72]) win(zf, c - 0.5, c + 0.5, fy(k) + 0.55, fy(k) + FH - 0.3, { pitch: 2, sill: BAND });
      skin(B.brick, zf, Y(GF), top, '#ffffff', UB);
      if (type === 'T') {
        B.wall.setColor(BAND);
        const l0 = faceIdx === 0 ? -0.35 : 0;                 // the boulevard side's bands wrap the corner
        for (let k = 1; k <= NU; k++) box(B.wall, zf, l0, w, fy(k) - 0.25, fy(k) + 0.25, 0, 0.35, l0 ? 'ftulr' : 'fturl', UV);
        box(B.wall, zf, l0, w, ROOF - 0.25, TOP + 0.1, -0.3, 0.35, 'ftulr', UV);   // a cream crown over the parapet
        solid(S, zf, l0, w, 0, 0.35, fy(1) - 0.25, TOP + 0.1, 'wall');
      } else {
        B.wall.setColor(BAND);                                  // thin cream floor bands
        if (w > 0.9) for (let k = 1; k <= NU; k++) box(B.wall, zf, 0, w, fy(k) - 0.1, fy(k) + 0.12, 0, 0.12, 'ftu', UV);
        if (type === 'b' && w >= 0.6) for (let k = 1; k <= NU; k++) if ((k + (s0 | 0)) % 3) ac(zf, m, k);
        if (type === 'K') for (let k = 2; k <= NU; k += 2) ac(zf, w / 2, k);
        D.setColor('#5a5450'); box(D, zf, -0.02, w + 0.02, TOP, TOP + 0.06, -0.32, 0.03, 'ftlr');   // coping
      }
    }
    return zf;
  };

  // ---- the ground storey: shop fronts between marble piers on the streets (and the yard side's Бандери end), brick
  // with windows and the residents' door elsewhere
  const gAt = (f, s, o) => { const p = at(f, s, 0, o); return heightAt(p[0], p[2]); };
  const ground = (f, wd) => {
    const L = f.L, gf = face([f.ax, f.az], [f.ax + f.ux * L, f.az + f.uz * L], f.nx, f.nz), yT = Y(GF - 0.75);
    const shopsTo = wd.street ? L : (wd.shops ?? 0);
    // the marble / glass rhythm: piers 1.6 m, fronts ~3.4 m
    if (shopsTo > 0) {
      let s = 0;
      const n = Math.max(1, Math.round((shopsTo - 1.6) / 5)), pw = 1.6, gw = (shopsTo - pw * (n + 1)) / n;
      for (let i = 0; i <= n; i++) {
        const y0 = Math.min(yF, gAt(gf, s + pw / 2, 0.5));
        B.marble.setColor('#ffffff'); rect(B.marble, gf, s, s + pw, y0 - 0.3, yT, 0.02, UM);
        gf.cuts.push({ s0: s, s1: s + pw, y0: gB, y1: yT });
        s += pw;
        if (i === n) break;
        const g0 = Math.max(yF, gAt(gf, s + gw / 2, 1) + 0.05);
        if (yT - g0 > 1.4) {
          gf.cuts.push({ s0: s, s1: s + gw, y0: g0, y1: yT });   // the shop glass glows at night
          hole(B, gf, { s0: s, s1: s + gw, y0: g0, y1: yT, dep: 0.3, rev: '#2b2725', frame: '#1f1d1c', glass: '#7a7468', lit: true, pitch: 1.8, door: i % 2 === 0 });
        }
        s += gw;
      }
    }
    // the rest: brick, ground-floor windows, the residents' door with its canopy
    if (shopsTo < L) {
      if (wd.door) {
        const m = wd.door, y1 = Y(2.7);
        gf.cuts.push({ s0: m - 1.1, s1: m + 1.1, y0: yF, y1 });
        hole(B, gf, { s0: m - 1.1, s1: m + 1.1, y0: yF, y1, dep: 0.3, rev: '#2b2725', frame: '#1f1d1c', glass: '#8f8574', lit: true, pitch: 1.1, door: true });
        D.setColor(FASCIA); box(D, gf, m - 2.2, m + 2.2, Y(2.95), Y(3.2), 0, 1.6, 'ftlru');
        solid(S, gf, m - 2.2, m + 2.2, 0, 1.6, Y(2.95), Y(3.2), 'awning', 1);
      }
      for (let s = shopsTo + 1.2; s + 1.6 < L - 0.6; s += 3.2) {
        if (wd.door && Math.abs(s + 0.8 - wd.door) < 2.6) continue;
        const y0 = Math.max(Y(0.9), gAt(gf, s + 0.8, 1) + 0.4);
        if (Y(GF - 0.6) - y0 > 0.8) win(gf, s, s + 1.6, y0, Y(GF - 0.6), { pitch: 2 });
      }
    }
    skin(B.brick, { ...gf, cuts: gf.cuts }, gB, Y(GF), '#ffffff', UB);
    D.setColor(PLINTH); box(D, gf, 0, L, gB, yF + 0.02, 0, 0.06, 'ft');
    if (wd.street || shopsTo > 0) {                            // the fascia
      // the boulevard's fascia wraps the street corner, Бандери's runs on round the yard corner to meet the yard side's
      const sEnd = wd.street ? L + (wd.n[1] === -1 ? 0.6 : 0) : shopsTo, l0 = wd.n[0] === 1 ? -0.6 : 0;
      D.setColor(FASCIA); box(D, gf, l0, sEnd, yT, Y(GF) + 0.05, 0, 0.6, 'ftulr');
      solid(S, gf, l0, sEnd, 0, 0.6, yT, Y(GF) + 0.05, 'awning', 1);
    }
  };

  WALLS.forEach((wd, i) => {
    const f = face(wd.a, wd.b, wd.n[0], wd.n[1]);
    let s = 0;
    for (const [type, w] of wd.seq) { segBody(f, s, w, type, i); s += w; }
    ground(f, wd);
    if (Z && f.L > 3) { const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], TOP, f.nx, f.nz); }
    // the parapet's inner face
    D.setColor('#6a6461'); rect(D, f, 0, f.L, ROOF, TOP, -0.3, null, f.N.map((v) => -v));
  });

  // ---- the roof: membrane, a lift head over the middle
  D.setColor('#5e5c5a'); D.fill(ring.map(([x, z]) => [x, z]), [], ROOF + 0.02, true);
  const lh = [[-78.5, -2464.5], [-73.5, -2464.5], [-73.5, -2459.5], [-78.5, -2459.5]];
  B.brick.setColor('#ffffff');
  for (const [k, a] of lh.entries()) {
    const b = lh[(k + 1) % 4], n = [Math.sign(b[1] - a[1]) || 0, -Math.sign(b[0] - a[0]) || 0];
    const lf = face(a, b, n[0], n[1]);
    rect(B.brick, lf, 0, lf.L, ROOF, ROOF + 3.2, 0, UB);
    D.setColor('#5a5450'); box(D, lf, -0.05, lf.L + 0.05, ROOF + 3.2, ROOF + 3.3, -0.1, 0.06, 'ft');
  }
  D.setColor('#4c4a48'); D.fill(lh, [], ROOF + 3.3, true);
  S.prism(lh.flat(), ROOF, ROOF + 3.3, 0, 0, 'equipment');
  S.prism(ring.flat(), gB, TOP, 0, 0, 'wall');

  // ---- the lot: pavers draped over the ground round the block (decal-biased); planters and benches on the corner
  // forecourt; a bar fence along the two neighbours, the yard open to Бандери
  const pg = (x, z) => heightAt(x, z) + 0.12, [lx0, lx1, lz0, lz1] = LOT;
  const NX = Math.round((lx1 - lx0) / 2.4), NZ = Math.round((lz1 - lz0) / 2.4);
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const x0 = lx0 + (lx1 - lx0) * i / NX, x1 = lx0 + (lx1 - lx0) * (i + 1) / NX, z0 = lz0 + (lz1 - lz0) * j / NZ, z1 = lz0 + (lz1 - lz0) * (j + 1) / NZ;
    if (x0 >= X0 - 0.01 && x1 <= X1 + 0.01 && z0 >= Z0 - 0.01 && z1 <= Z1 + 0.01) continue;   // under the block
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    B.mat.setColor(mx < X0 || mz > Z1 ? '#a39d93' : '#96948f');   // the yard a shade lighter than the forecourt
    const v = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => B.mat.vert(x, pg(x, z), z, 0, 1, 0, x / 2, z / 2));
    B.mat.quad(v[0], v[3], v[2], v[1]);
  }
  const planter = (x, z, w, d) => {
    const y0 = heightAt(x, z);
    D.setColor('#9c9a95'); D.box(x - w, y0 - 0.2, z - d, x + w, y0 + 0.75, z + d, 1 | 2 | 16 | 32 | 4);
    D.setColor('#4d6e33'); D.box(x - w + 0.08, y0 + 0.75, z - d + 0.08, x + w - 0.08, y0 + 1.15, z + d - 0.08, 1 | 2 | 4 | 16 | 32);
    S.prism([x - w, z - d, x + w, z - d, x + w, z + d, x - w, z + d], y0 - 0.2, y0 + 0.75, 0, 0, 'wall');
  };
  for (const z of [Z0 + 9.5, Z0 + 18, Z0 + 26.5]) planter(X1 + 1.3, z, 0.4, 1.1);
  for (const x of [X1 - 9, X1 - 18.5]) planter(x, Z0 - 1.3, 1.1, 0.4);
  const bench = (x, z, alongZ) => {
    const y0 = heightAt(x, z), [hx, hz] = alongZ ? [0.25, 0.9] : [0.9, 0.25];
    D.setColor('#2c2a29'); D.box(x - hx, y0 - 0.1, z - hz, x + hx, y0 + 0.4, z + hz, 63 & ~8);
    D.setColor('#9a6a44'); D.box(x - hx - 0.03, y0 + 0.4, z - hz - 0.03, x + hx + 0.03, y0 + 0.47, z + hz + 0.03, 63 & ~8);
  };
  bench(X1 + 1.3, Z0 + 13.7, true); bench(X1 + 1.3, Z0 + 22.2, true);
  // the fence: posts every 2.5 m, top and bottom rails, bars every 0.5 m as crossed quads
  const fence = (a, b) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, H = 1.8;
    D.setColor('#232323');
    for (let s = 0; s <= L + 1e-6; s += L / Math.max(1, Math.round(L / 2.5))) {
      const x = a[0] + ux * s, z = a[1] + uz * s, y = heightAt(x, z);
      D.box(x - 0.05, y - 0.2, z - 0.05, x + 0.05, y + H, z + 0.05, 63 & ~8);
    }
    const n = Math.round(L / 2.5);
    for (let i = 0; i < n; i++) {
      const s0 = L * i / n, s1 = L * (i + 1) / n, p0 = [a[0] + ux * s0, a[1] + uz * s0], p1 = [a[0] + ux * s1, a[1] + uz * s1];
      const y0 = heightAt(...p0), y1 = heightAt(...p1);
      for (const [h0, h1] of [[0.12, 0.17], [H - 0.12, H - 0.07]]) {
        const v = [[p0, y0 + h0], [p1, y1 + h0], [p1, y1 + h1], [p0, y0 + h1]].map(([p, y]) => D.vert(p[0], y, p[1], -uz, 0, ux));
        D.quad(v[0], v[1], v[2], v[3]); D.quad(v[0], v[3], v[2], v[1]);
      }
      for (let k = 1; k < 5; k++) {
        const t = k / 5, x = p0[0] + (p1[0] - p0[0]) * t, z = p0[1] + (p1[1] - p0[1]) * t, y = y0 + (y1 - y0) * t;
        const v = [[-1, 0.15], [1, 0.15], [1, H - 0.1], [-1, H - 0.1]].map(([e, h]) => D.vert(x + ux * e * 0.02, y + h, z + uz * e * 0.02, -uz, 0, ux));
        D.quad(v[0], v[1], v[2], v[3]); D.quad(v[0], v[3], v[2], v[1]);
      }
    }
    const P = [[a[0] - uz * 0.06, a[1] + ux * 0.06], [b[0] - uz * 0.06, b[1] + ux * 0.06], [b[0] + uz * 0.06, b[1] - ux * 0.06], [a[0] + uz * 0.06, a[1] - ux * 0.06]];
    S.prism(P.flat(), Math.min(heightAt(...a), heightAt(...b)) - 0.2, Math.max(heightAt(...a), heightAt(...b)) + H, 0, 0, 'wall');
  };
  fence([lx0, lz0 + 1.5], [lx0, lz1]);       // along Бандери 37 (the yard opens onto Бандери)
  fence([lx0, lz1], [lx1 - 0.8, lz1]);       // along no. 24

  const brick = brickTex(r), marble = marbleTex(r), pave = paveTex(r);
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: speckle(r), vertexColors: true, roughness: 0.85 }),
    brick: new THREE.MeshStandardMaterial({ map: brick, vertexColors: true, roughness: 0.9 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.4 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.2, emissive: new THREE.Color('#ffd49a'), emissiveIntensity: 0 }),
    marble: new THREE.MeshStandardMaterial({ map: marble, vertexColors: true, roughness: 0.25, metalness: 0.05, emissive: new THREE.Color('#ffcf9a'), emissiveMap: marble, emissiveIntensity: 0 }),
    mat: decal(new THREE.MeshStandardMaterial({ map: pave, vertexColors: true, roughness: 0.95 }), 3),
  };
  const out = finish(root, 'shev22', B, M, { shade: ['wall', 'brick', 'det'] });
  console.log(`[cherkasy] бульвар Шевченка 22: ${nWin} windows (${nLit} lit), ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    footprints: [{ poly: ring, h: TOPP - gLo, kind: 'apt', name: 'бульвар Шевченка, 22' }],
    clear: (x, z) => x > lx0 - 0.5 && x < lx1 + 0.5 && z > lz0 - 0.5 && z < lz1 + 0.5,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 1.1 * k; M.marble.emissiveIntensity = 0.12 * k; },
  };
}
