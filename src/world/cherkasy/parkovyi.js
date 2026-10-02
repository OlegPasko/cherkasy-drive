// OWNER: cherkasy. ЖК «Парковий квартал», вул. Івана Кожедуба, 59 (at Віталія Вергая): ten-storey sections in
// white silicate brick under render round one big yard, built as the lun.ua catalogue renders show them
// (lun.ua/new/cherkasy/parkovyi-kvartal). OSM maps seven of them: буд 1–5, the bent wing on Вергая and the straight
// one on Кожедуба (in service), and the NE and SE wings (planned; they stand in the renders, so they are built too).
// The facades are drawn section by section from the renders, in four programmes:
//   A – the bent wing's street fronts (the street-level renders): a grid of white piers and floor bands over dark
//       chocolate panels, recessed glazed loggia stacks, turquoise stripes in three-storey lengths, offset;
//   B – the other street fronts (the aerial render, the Кожедуба side): white-framed glazed bay loggias standing out
//       of the wall, chocolate and white piers with window stacks between, thin turquoise stripes;
//   C – the yard fronts: window stacks set in white, chocolate or alternating storey bands, framed windows, small
//       turquoise bars, a wide turquoise stripe over each stair core and its entrance;
//   E – the gable ends: blind, storey bands alternating white / chocolate either side of one turquoise stripe (the
//       bent wing's south end has windows, programme A's gable variant).
// A chocolate ground storey all round with windows, entrances under dark canopies, a white parapet, lift heads on
// the roof. The yard: a driveway round a park with a round plaza and playground, paths, lawn and a sports pitch,
// painted on one draped texture. Windows light up at night. No developer name or logo.
//   PARKOVYI_SKIP: the OSM ids replaced here (buildings.js skips them)
//   buildParkovyi({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Every outline edge is a facade in a face frame (slabkit.js), cut into zones by its programme. The wall paint is one
// quad per zone strip: the paint atlas holds one column per storey pattern (white, chocolate, alternating, turquoise
// runs), sampled at a constant u with v by height, so a storey pattern costs no extra geometry. A window or loggia
// stack is one recessed pane the whole stack high whose texture carries the nine storeys and their lit pattern.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng, bboxOf, inPoly } from './geo.js';
import { canvasTex, decal } from './sculpt.js';
import { ringFaces, face, at, quad, rect, box, solid, finish } from './slabkit.js';

// the houses: [OSM id, address-ish name, wing] – wing 'bent' (Вергая), 'nw' (Кожедуба), 'ne', 'se'
const HOUSES = [
  [1522301396, 'Кожедуба, 59 · буд. 1', 'bent'], [1522301395, 'Кожедуба, 59 · буд. 2', 'bent'],
  [984246825, 'Кожедуба, 59 · буд. 3', 'nw'], [1430817645, 'Кожедуба, 59 · буд. 4', 'nw'], [1560091949, 'Кожедуба, 59 · буд. 5', 'nw'],
  [1430817647, 'ЖК «Парковий квартал»', 'ne'], [1430817646, 'ЖК «Парковий квартал»', 'se'],
];
export const PARKOVYI_SKIP = new Set(HOUSES.map(([id]) => id));
// the yard (map metres): the open ground inside the ring of houses, and the frame of its painted floor
const YARD = [[-3424.5, -1119], [-3424.5, -1162.6], [-3414.6, -1173.9], [-3392.1, -1201], [-3385.9, -1209.6], [-3278, -1207.5], [-3278, -1119]];
const YX0 = -3452, YX1 = -3244, YZ0 = -1236, YZ1 = -1086, PPM = 8, APRON = 7; // floor texture 8 px per metre; paving round the houses

const GF = 3.3, FH = 2.9, NU = 9, PARA = 1.1;   // ground storey, typical storey, storeys over the ground one, parapet
const WHITE = '#f1f0ec', CHOC = '#45302c', CYAN = '#33cfcc', PLINTH = '#382723', FRAME = '#f6f6f3', DARK = '#262628';

// ------------------------------------------------------------------------------------------------ paint atlas
// one 32 px column per pattern; v = 0 at 4 m under the floor line, PAINT_H metres to the top
const PAT = { W: 0, B: 1, X: 2, Y: 3, C: 4, D: 5, Q: 6, R: 7 }, NPAT = 8, PAINT_H = 4 + GF + NU * FH + PARA + 0.6;
// the colour of pattern p on upper storey k (1..NU) at height t (0..1) within it
function paintOf(p, k, t) {
  switch (p) {
    case 'W': return WHITE;
    case 'B': return CHOC;
    case 'X': return k % 2 ? CHOC : WHITE;
    case 'Y': return k % 2 ? WHITE : CHOC;
    case 'C': return k % 4 === 0 ? CHOC : CYAN;               // three storeys on, one off
    case 'D': return k % 4 === 1 ? CHOC : CYAN;               // the same, a storey later
    case 'Q': return k % 3 === 2 && t > 0.15 && t < 0.75 ? CYAN : CHOC; // a short bar every third storey
    case 'R': return k % 3 === 1 && t > 0.15 && t < 0.75 ? CYAN : CHOC;
  }
  return WHITE;
}
const paintTex = () => canvasTex(32 * NPAT, 1024, (g, w, h) => {
  const py = (y) => h - (y / PAINT_H) * h;                     // canvas y of a height over the paint base
  for (const [p, c] of Object.entries(PAT)) {
    const x0 = c * 32;
    g.fillStyle = PLINTH; g.fillRect(x0, 0, 32, h);
    for (let k = 1; k <= NU; k++) for (let s = 0; s < 10; s++) {
      const y0 = 4 + GF + (k - 1) * FH + (s / 10) * FH;
      g.fillStyle = paintOf(p, k, (s + 0.5) / 10); g.fillRect(x0, py(y0 + FH / 10), 32, py(y0) - py(y0 + FH / 10) + 0.5);
    }
    g.fillStyle = WHITE; g.fillRect(x0, 0, 32, py(4 + GF + NU * FH));      // the parapet
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x0, py(4 + GF) - 2, 32, 4);  // the joint over the ground storey
  }
}, { repeat: false });

// ------------------------------------------------------------------------------------------------ stack textures
// window stacks: per surround pattern (W, B, X, Y, F = chocolate with a white frame round the window) an unlit and a
// lit column of 128 px (1.6 m), NU storeys of 192 px; glass 1.2 m wide from 0.85 to 2.35 m over the storey floor
const WP = ['W', 'B', 'X', 'Y', 'F'], WCOL = WP.length * 2, WSH = 192, WW = 1.6;
function winTex(mask, lit) {
  return canvasTex(128 * WCOL, WSH * NU, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const m = (v) => (v / WW) * 128, sy = (k, y) => h - ((k - 1) * FH + y) / FH * WSH;   // storey k, y metres up
    for (let c = 0; c < WCOL; c++) {
      const p = WP[c >> 1], on = c & 1, x0 = c * 128;
      for (let k = 1; k <= NU; k++) {
        const ya = sy(k, 2.35), yb = sy(k, 0.85), lt = on && lit[c][k];
        if (mask) { if (lt) { g.fillStyle = '#fff'; g.fillRect(x0 + m(0.24), ya, m(1.12), yb - ya); } continue; }
        g.fillStyle = paintOf(p === 'F' ? 'B' : p, k, 0.5); g.fillRect(x0, sy(k, FH), 128, sy(k, 0) - sy(k, FH) + 0.5);
        if (p === 'F') { g.fillStyle = FRAME; g.fillRect(x0 + m(0.04), sy(k, 2.62), m(1.52), sy(k, 0.6) - sy(k, 2.62)); }
        const gr = g.createLinearGradient(x0, ya, x0 + 60, yb);
        gr.addColorStop(0, '#b9c7cf'); gr.addColorStop(0.5, '#7f909a'); gr.addColorStop(1, '#55636c');
        g.fillStyle = gr; g.fillRect(x0 + m(0.2), ya, m(1.2), yb - ya);
        g.fillStyle = '#f4f4f1';                                // white PVC frame, a mullion and a transom
        g.fillRect(x0 + m(0.2), ya, m(1.2), 4); g.fillRect(x0 + m(0.2), yb - 5, m(1.2), 5);
        g.fillRect(x0 + m(0.2), ya, 4, yb - ya); g.fillRect(x0 + m(1.4) - 4, ya, 4, yb - ya); g.fillRect(x0 + m(0.8) - 2, ya, 4, yb - ya);
        g.fillStyle = '#d9d8d3'; g.fillRect(x0 + m(0.14), yb, m(1.32), 4);           // the sill
      }
    }
  }, { repeat: false, srgb: !mask });
}
// loggia glazing, tiling: 4 bays of 1.5 m by 3 storeys, a white slab band under and over the glass, white frames
const LW = 1.5, LCOLS = 4, LROWS = 3, LPX = 96, LPY = 186;
function logTex(mask, lit) {
  return canvasTex(LPX * LCOLS, LPY * LROWS, (g, w, h) => {
    g.fillStyle = mask ? '#000' : FRAME; g.fillRect(0, 0, w, h);
    const py = (j, y) => h - (j * FH + y) / FH * LPY;
    for (let i = 0; i < LCOLS; i++) for (let j = 0; j < LROWS; j++) {
      const x0 = i * LPX, ya = py(j, 2.6), yb = py(j, 0.32), yr = py(j, 1.0), lt = lit[i][j];
      if (mask) { if (lt) { g.fillStyle = '#fff'; g.fillRect(x0 + 4, ya, LPX - 8, yr - ya); } continue; }
      const gr = g.createLinearGradient(x0, ya, x0 + LPX, yb);
      gr.addColorStop(0, '#c3d0d6'); gr.addColorStop(1, '#6c7c86');
      g.fillStyle = gr; g.fillRect(x0 + 3, ya, LPX - 6, yb - ya);
      g.fillStyle = 'rgba(235,238,240,0.55)'; g.fillRect(x0 + 3, yr, LPX - 6, yb - yr);   // the frosted lower lights
      g.fillStyle = FRAME;
      g.fillRect(x0, ya, 4, yb - ya); g.fillRect(x0 + LPX - 4, ya, 4, yb - ya); g.fillRect(x0 + LPX / 2 - 2, ya, 4, yb - ya);
      g.fillRect(x0, yr - 2, LPX, 4);
      g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x0, yb, LPX, 3);
    }
  }, { srgb: !mask });
}
// the yard floor, painted from the site plan render: a driveway with parking bays round the park, a round plaza with
// the playground in the west half, a ring of paths, a smaller round plaza and a sports pitch in the east
function yardTex(rings) {
  return canvasTex((YX1 - YX0) * PPM, (YZ1 - YZ0) * PPM, (g) => {
    const P = (x, z) => [(x - YX0) * PPM, (z - YZ0) * PPM];
    const poly = (q) => { g.beginPath(); q.forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, ...P(...p))); g.closePath(); };
    g.clearRect(0, 0, (YX1 - YX0) * PPM, (YZ1 - YZ0) * PPM);                            // transparent: the ground shows
    g.lineJoin = 'round';                                                                // pavers along the houses, kerbed
    for (const [col, wd] of [['#9d988e', 9.4], ['#b8b3a8', 9]]) { g.strokeStyle = g.fillStyle = col; g.lineWidth = wd * PPM; for (const q of rings) { poly(q); g.stroke(); g.fill(); } }
    g.fillStyle = '#b8b3a8'; poly(YARD); g.fill();
    // the driveway: a loop 6 m wide, 7 m off the houses
    const DX0 = -3410, DX1 = -3292, DZ0 = -1196, DZ1 = -1131;
    g.fillStyle = '#56585b'; g.fillRect(...P(DX0, DZ0), (DX1 - DX0) * PPM, (DZ1 - DZ0) * PPM);
    // parking bays along its outer edges
    g.strokeStyle = '#e8e8e2'; g.lineWidth = 1.5;
    for (let x = DX0 + 14; x < DX1 - 8; x += 2.6) for (const z of [DZ0, DZ1 - 5]) { g.beginPath(); g.moveTo(...P(x, z)); g.lineTo(...P(x, z + 5)); g.stroke(); }
    // the park inside the loop
    const KX0 = DX0 + 6, KX1 = DX1 - 6, KZ0 = DZ0 + 6, KZ1 = DZ1 - 6;
    g.fillStyle = '#bdb7ab'; g.fillRect(...P(KX0 - 0.6, KZ0 - 0.6), (KX1 - KX0 + 1.2) * PPM, (KZ1 - KZ0 + 1.2) * PPM); // kerb
    g.fillStyle = '#5f7f3d'; g.fillRect(...P(KX0, KZ0), (KX1 - KX0) * PPM, (KZ1 - KZ0) * PPM);
    const cz = (KZ0 + KZ1) / 2, c1 = KX0 + 26, c2 = KX0 + 62;
    const path = (pts, wd) => { g.strokeStyle = '#c4beb2'; g.lineWidth = wd * PPM; g.lineCap = 'butt'; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, ...P(...p))); g.stroke(); };
    path([[KX0, cz], [KX1, cz]], 3); path([[c1, KZ0], [c1, KZ1]], 2.5); path([[c2, KZ0], [c2, KZ1]], 2.5);
    path([[KX0, KZ0], [c1, cz]], 2); path([[KX0, KZ1], [c1, cz]], 2); path([[c1, cz], [c2, KZ0]], 2); path([[c1, cz], [c2, KZ1]], 2);
    path([[c2, cz], [KX1 - 16, KZ0]], 2); path([[c2, cz], [KX1 - 16, KZ1]], 2);
    const ring = (x, z, r, wd, col) => { g.strokeStyle = col; g.lineWidth = wd * PPM; g.beginPath(); g.arc(...P(x, z), r * PPM, 0, Math.PI * 2); g.stroke(); };
    const disc = (x, z, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(...P(x, z), r * PPM, 0, Math.PI * 2); g.fill(); };
    ring(c1, cz, 19, 2.5, '#c4beb2'); disc(c1, cz, 10, '#c4beb2'); disc(c1, cz, 8.4, '#b0524a');   // the playground
    disc(c2, cz, 7, '#c4beb2'); disc(c2, cz, 3.5, '#5f7f3d'); ring(c2, cz, 3.5, 0.4, '#9a958c');
    // the sports pitch in the east end with its lines
    const SX0 = KX1 - 16, SX1 = KX1 - 2, SZ0 = cz - 9, SZ1 = cz + 9;
    g.fillStyle = '#c4beb2'; g.fillRect(...P(SX0 - 1, SZ0 - 1), (SX1 - SX0 + 2) * PPM, (SZ1 - SZ0 + 2) * PPM);
    g.fillStyle = '#3f8a57'; g.fillRect(...P(SX0, SZ0), (SX1 - SX0) * PPM, (SZ1 - SZ0) * PPM);
    g.strokeStyle = '#f2f2ee'; g.lineWidth = 2; g.strokeRect(...P(SX0 + 0.8, SZ0 + 0.8), (SX1 - SX0 - 1.6) * PPM, (SZ1 - SZ0 - 1.6) * PPM);
    g.beginPath(); g.moveTo(...P(SX0 + 0.8, cz)); g.lineTo(...P(SX1 - 0.8, cz)); g.stroke();
    // dappled lawn
    const r = rng(59);
    for (let i = 0; i < 2500; i++) { g.fillStyle = r() < 0.5 ? 'rgba(30,60,20,0.10)' : 'rgba(200,220,150,0.07)'; const [x, z] = P(KX0 + r() * (KX1 - KX0), KZ0 + r() * (KZ1 - KZ0)); g.fillRect(x, z, 2 + r() * 3, 2 + r() * 3); }
  }, { repeat: false });
}
export const PARK_YARD = { c1: [-3378, -1163.5], c2: [-3342, -1163.5], r: 8.4 }; // the playground disc (tests)

// ------------------------------------------------------------------------------------------------ programmes
// a zone: [width m, wall pattern, content]; content 'w' window stack, 'f' framed window stack, 'L' recessed loggia
// stack, 'P' bay loggia standing out, 'e' an entrance in the ground storey, '' blank. Units repeat along a front,
// every other one mirrored, scaled to fit.
const PROG = {
  A: [[1.2, 'W', ''], [3.6, 'W', 'L'], [2.6, 'X', 'w'], [1.5, 'C', 'e'], [2.6, 'Y', 'w'], [6.2, 'W', 'L'], [2.6, 'B', 'w'], [0.8, 'Q', '']],
  A2: [[0.5, 'W', ''], [2.6, 'X', 'w'], [0.6, 'Q', ''], [2.6, 'Y', 'w'], [2.4, 'W', ''], [2.6, 'X', 'w'], [1.2, 'C', ''], [2.6, 'B', 'w'], [2.6, 'Y', 'w'], [0.5, 'W', '']],
  B: [[4.2, 'W', 'P'], [2.4, 'B', 'w'], [0.5, 'Q', ''], [2.4, 'Y', 'w'], [4.2, 'W', 'P'], [2.2, 'X', 'w'], [1.6, 'C', 'e'], [2.2, 'Y', 'w']],
  C: [[1.8, 'C', 'e'], [2.2, 'B', 'w'], [3.0, 'X', 'w'], [0.7, 'R', ''], [2.6, 'Y', 'w'], [3.0, 'B', 'f'], [0.7, 'Q', ''], [2.8, 'W', 'w'], [3.0, 'X', 'w']],
};
const unitW = (u) => u.reduce((s, z) => s + z[0], 0);
function zonesFor(prog, L) {
  if (prog === 'S') return [[(L - 1.6) / 2, 'W', ''], [1.6, 'X', 'w'], [(L - 1.6) / 2, 'W', '']];
  if (prog === 'E') { const a = (L - 2.3) * 0.32; return [[0.4, 'W', ''], [a, 'Y', ''], [1.5, 'C', ''], [L - 2.3 - a, 'X', ''], [0.4, 'W', '']]; }
  const u = PROG[prog], W = unitW(u), n = Math.max(1, Math.round(L / W)), k = L / (n * W), out = [];
  for (let i = 0; i < n; i++) for (const z of (i % 2 ? [...u].reverse() : u)) out.push([z[0] * k, z[1], z[2]]);
  return out;
}

// ------------------------------------------------------------------------------------------------ the build
export function buildParkovyi({ root, map, solids: S, zips: Z, heightAt }) {
  const houses = HOUSES.map(([id, name, wing]) => ({ b: map.buildings?.find((q) => q.id === id), name, wing })).filter((h) => h.b);
  if (!houses.length) return null;
  const t0 = performance.now(), r = rng(59), n0 = S.count;
  const B = { wall: new MB(), det: new MB(), win: new MB(), log: new MB(), glass: new MB(), yard: new MB() };
  const wlit = Array.from({ length: WCOL }, () => Array.from({ length: NU + 1 }, () => r() < 0.55));
  const llit = Array.from({ length: LCOLS }, () => Array.from({ length: LROWS }, () => r() < 0.35));
  const UVW = [2.5, 2.5], xz = (p) => [p[0], p[2]];
  let nStack = 0;
  const footprints = [], rings = [];
  // floor levels: each house on the highest ground under it (sections step with the slope, as built)
  for (const h of houses) {
    h.ring = ringPts(h.b.p); rings.push(h.ring);
    const bb = bboxOf(h.ring), hs = [];
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      const x = bb.x0 + (bb.x1 - bb.x0) * i / 4, z = bb.z0 + (bb.z1 - bb.z0) * j / 4;
      if (inPoly(h.ring, x, z) || i % 4 === 0 || j % 4 === 0) hs.push(heightAt(x, z));
    }
    h.gLo = Math.min(...hs); h.yF = Math.max(...hs) + 0.15; h.top = h.yF + GF + NU * FH + PARA;
  }
  // an edge another house shares (both ends on that house's outline) is a party wall
  const dist = (ring, x, z) => Math.min(...ring.map((a, i) => { const b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z); }));
  const near = (ring, p) => dist(ring, p[0], p[1]) < 0.6;
  const yc = YARD.reduce((s, p) => [s[0] + p[0] / YARD.length, s[1] + p[1] / YARD.length], [0, 0]);

  for (const h of houses) {
    const { ring, yF, gLo } = h, faces = ringFaces(ring), Y = (v) => yF + v, gB = gLo - 0.6;
    const fy = (k) => Y(GF + (k - 1) * FH), ROOF = Y(GF + NU * FH), TOP = ROOF + PARA, base = yF - 4;
    const gAt = (f, s, o) => { const p = at(f, s, 0, o); return heightAt(p[0], p[2]); };
    // wall paint: one quad per free strip of the zone, u at the pattern's column, v by height
    const paint = (f, y0, y1, p) => {
      const u = (PAT[p] + 0.5) / NPAT, ys = [...new Set([y0, y1, ...f.cuts.flatMap((q) => [q.y0, q.y1]).filter((y) => y > y0 && y < y1)])].sort((a, b) => a - b);
      B.wall.setColor('#ffffff');
      for (let i = 1; i < ys.length; i++) {
        const a = ys[i - 1], b = ys[i], cross = f.cuts.filter((q) => q.y0 < b - 1e-3 && q.y1 > a + 1e-3).sort((p, q) => p.s0 - q.s0);
        let s = 0; const free = [];
        for (const q of cross) { if (q.s0 > s + 1e-3) free.push([s, q.s0]); s = Math.max(s, q.s1); }
        if (s < f.L - 1e-3) free.push([s, f.L]);
        const va = (a - base) / PAINT_H, vb = (b - base) / PAINT_H;
        for (const [s0, s1] of free) quad(B.wall, at(f, s0, a), at(f, s1, a), at(f, s1, b), at(f, s0, b), f.N, [[u, va], [u, va], [u, vb], [u, vb]]);
      }
    };
    const reveal = (f, s0, s1, y0, y1, dep, col) => {
      B.det.setColor(col);
      quad(B.det, at(f, s0, y0), at(f, s0, y0, -dep), at(f, s0, y1, -dep), at(f, s0, y1), f.U);
      quad(B.det, at(f, s1, y0), at(f, s1, y0, -dep), at(f, s1, y1, -dep), at(f, s1, y1), f.U.map((v) => -v));
      quad(B.det, at(f, s0, y1), at(f, s1, y1), at(f, s1, y1, -dep), at(f, s0, y1, -dep), [0, -1, 0]);
      quad(B.det, at(f, s0, y0), at(f, s1, y0), at(f, s1, y0, -dep), at(f, s0, y0, -dep), [0, 1, 0]);
    };
    // a window stack (1.6 m) the nine upper storeys high, its surround in pattern p
    const winStack = (f, m, p) => {
      const s0 = m - WW / 2, s1 = m + WW / 2, y0 = fy(1), y1 = ROOF, dep = 0.16, c = WP.indexOf(p) * 2 + (r() < 0.5 ? 1 : 0);
      f.cuts.push({ s0, s1, y0, y1 });
      reveal(f, s0, s1, y0, y1, dep, '#d8d6d0');
      const u0 = c / WCOL + 0.001, u1 = (c + 1) / WCOL - 0.001;
      B.win.setColor('#ffffff');
      quad(B.win, at(f, s0, y0, -dep), at(f, s1, y0, -dep), at(f, s1, y1, -dep), at(f, s0, y1, -dep), f.N, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
      nStack++;
    };
    // loggia glazing on a plane (tiling texture, s / y in metres from the stack's corner)
    const logPane = (f, s0, s1, y0, y1, o, n = f.N) => {
      const ua = (s0 + r() * 6) / (LW * LCOLS), ub = ua + (s1 - s0) / (LW * LCOLS), va = 0, vb = (y1 - y0) / (FH * LROWS);
      B.log.setColor('#ffffff');
      quad(B.log, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), n, [[ua, va], [ub, va], [ub, vb], [ua, vb]]);
    };
    const logStack = (f, s0, s1) => {
      const y0 = fy(1), y1 = ROOF, dep = 0.35;
      f.cuts.push({ s0, s1, y0, y1 });
      reveal(f, s0, s1, y0, y1, dep, FRAME);
      logPane(f, s0, s1, y0, y1, -dep);
      B.det.setColor(FRAME); for (let k = 2; k <= NU; k++) box(B.det, f, s0, s1, fy(k) - 0.12, fy(k) + 0.08, -dep, 0.06, 'ftu'); // slab edges
      nStack++;
    };
    const bay = (f, s0, s1) => {
      const y0 = fy(1) - 0.1, y1 = ROOF, o = 1.1;
      logPane(f, s0, s1, y0, y1, o);
      const L = face(xz(at(f, s0, 0)), xz(at(f, s0, 0, o)), -f.ux, -f.uz), R = face(xz(at(f, s1, 0, o)), xz(at(f, s1, 0)), f.ux, f.uz);
      logPane(L, 0, o, y0, y1, 0); logPane(R, 0, o, y0, y1, 0);
      B.det.setColor(FRAME);
      for (const [a, b] of [[s0 - 0.12, s0], [s1, s1 + 0.12]]) box(B.det, f, a, b, y0, y1 + 0.2, 0, o + 0.12, 'flrt');
      for (let k = 1; k <= NU; k++) box(B.det, f, s0, s1, fy(k) - 0.1, fy(k) + 0.12, o, o + 0.12, 'ftu');
      box(B.det, f, s0 - 0.12, s1 + 0.12, y1 - 0.05, y1 + 0.2, 0, o + 0.12, 'ftu');
      box(B.det, f, s0, s1, y0 - 0.15, y0, 0, o, 'u');
      solid(S, f, s0 - 0.12, s1 + 0.12, 0, o + 0.12, y0 - 0.15, y1 + 0.2, 'wall');
      nStack++;
    };
    // ground storey: a window, or an entrance under a dark canopy
    const gwin = (f, s0, s1) => {
      const y0 = Math.max(Y(0.9), gAt(f, (s0 + s1) / 2, 1) + 0.4), y1 = Y(2.55);
      if (y1 - y0 < 0.7 || s0 < 0.2 || s1 > f.L - 0.2) return;
      f.cuts.push({ s0, s1, y0, y1 });
      reveal(f, s0, s1, y0, y1, 0.2, '#cfcdc7');
      B.glass.setColor('#6e7d86'); rect(B.glass, f, s0, s1, y0, y1, -0.16);
      B.det.setColor('#f4f4f1'); for (const m of [s0, (s0 + s1) / 2, s1]) box(B.det, f, m - 0.04, m + 0.04, y0, y1, -0.16, -0.12, 'f');
    };
    const entry = (f, m) => {
      const hw = Math.min(0.85, m - 0.12), s0 = m - hw, s1 = m + hw, y0 = Y(0), y1 = Y(2.4);
      f.cuts.push({ s0, s1, y0, y1 });
      reveal(f, s0, s1, y0, y1, 0.3, '#cfcdc7');
      B.glass.setColor('#7e8a90'); rect(B.glass, f, s0, s1, y0, y1, -0.26);
      B.det.setColor('#5a4038'); box(B.det, f, m - 0.04, m + 0.04, y0, y1, -0.26, -0.2, 'f');
      // the canopy: a dark shell on two brackets, gently curved (three facets)
      const cy = Y(2.75), w0 = m - 1.6, w1 = m + 1.6;
      B.det.setColor(DARK);
      box(B.det, f, w0, w1, cy, cy + 0.12, 0, 0.5, 'ftlru'); box(B.det, f, w0, w1, cy - 0.08, cy + 0.06, 0.5, 1.0, 'ftlru'); box(B.det, f, w0, w1, cy - 0.28, cy - 0.06, 1.0, 1.4, 'ftlru');
      solid(S, f, w0, w1, 0, 1.4, cy - 0.28, cy + 0.12, 'awning', 1);
      const g = Math.min(gAt(f, m, 2), yF - 0.05), n = Math.max(1, Math.round((yF - g) / 0.16));
      for (let i = 0; i < n; i++) { B.det.setColor(i % 2 ? '#a9a59d' : '#b4b0a8'); box(B.det, f, m - 1.4, m + 1.4, gB, yF - (yF - g) * i / n, 0, 1.4 + 0.3 * i, 'ftlr'); }
      solid(S, f, m - 1.4, m + 1.4, 0, 1.4 + 0.3 * n, gB, yF, 'step');
    };

    for (const f of faces) {
      const mid = xz(at(f, f.L / 2, 0)), other = houses.find((o) => o !== h && near(o.ring, xz(at(f, 0, 0))) && near(o.ring, xz(at(f, f.L, 0))) && near(o.ring, mid));
      if (other) { // party wall: only what stands over the neighbour's parapet shows
        if (TOP > other.top + 0.05) paint({ ...f, cuts: [] }, other.top - 0.05, TOP, 'W');
        B.det.setColor(WHITE); box(B.det, f, 0, f.L, ROOF, TOP + 0.1, -0.25, 0.25, 'fbt'); // the parapet between the section roofs
        continue;
      }
      const yard = (yc[0] - mid[0]) * f.nx + (yc[1] - mid[1]) * f.nz > 0;
      const prog = yard ? (f.L < 12 ? 'S' : 'C') : f.L < 12 ? 'S' : h.wing === 'bent' ? (f.L < 26 ? 'A2' : 'A') : f.L < 26 ? (h.wing === 'nw' ? 'A2' : 'E') : 'B';
      f.prog = prog;
      let s = 0;
      for (const [w, p, what] of zonesFor(prog, f.L)) {
        const zf = face(xz(at(f, s, 0)), xz(at(f, s + w, 0)), f.nx, f.nz), m = w / 2;
        s += w;
        if (what === 'w' || what === 'f') { winStack(zf, m, what === 'f' ? 'F' : p === 'C' || p === 'D' ? 'B' : p); gwin(zf, m - 0.8, m + 0.8); }
        else if (what === 'L') { logStack(zf, 0.3, w - 0.3); gwin(zf, 0.6, w - 0.6); }
        else if (what === 'P') { bay(zf, 0.2, w - 0.2); gwin(zf, 0.8, w - 0.8); }
        else if (what === 'e') entry(zf, m);
        paint(zf, gB, TOP, p);
      }
      // the parapet's inside and cap, the plinth
      B.det.setColor(WHITE); rect(B.det, f, 0, f.L, ROOF, TOP, -0.3, null, f.N.map((v) => -v));
      B.det.setColor('#dcdad4'); box(B.det, f, -0.02, f.L + 0.02, TOP, TOP + 0.08, -0.32, 0.05, 'ftlr');
      B.det.setColor('#2e211e'); box(B.det, f, 0, f.L, gB, Y(0.15), 0, 0.05, 'ft');
      if (Z && f.L > 3) { const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], TOP, f.nx, f.nz); }
    }

    // the roof, a lift head over each stair core on the yard front
    B.det.setColor('#7a6660'); B.det.fill(ring, [], ROOF + 0.02, true);
    for (const f of faces.filter((q) => q.prog === 'C')) {
      // parapets across the roof between the sections (half-way between the stair cores)
      const dep = Math.max(...ring.map((p) => -((p[0] - f.ax) * f.nx + (p[1] - f.az) * f.nz))), nU = zonesFor('C', f.L).length / PROG.C.length;
      for (let j = 2; j < nU; j += 2) { const m = f.L * j / nU; B.det.setColor(WHITE); box(B.det, f, m - 0.25, m + 0.25, ROOF, TOP + 0.1, -dep + 0.3, -0.3, 'fblrt'); }
      let s = 0;
      for (const [w, , what] of zonesFor('C', f.L)) {
        if (what === 'e') {
          const c = at(f, s + w / 2, 0), cx = c[0] - f.nx * 4.8, cz = c[2] - f.nz * 4.8, a = 3.0, d = 2.8, H = 3.4;
          const hr = [[-a, -d], [a, -d], [a, d], [-a, d]].map(([p, q]) => [cx + f.ux * p + f.nx * q, cz + f.uz * p + f.nz * q]);
          if (hr.every(([x, z]) => inPoly(ring, x, z))) {
            for (const g of ringFaces(hr)) { B.det.setColor(WHITE); rect(B.det, g, 0, g.L, ROOF, ROOF + H); B.det.setColor('#cfcdc7'); box(B.det, g, -0.05, g.L + 0.05, ROOF + H, ROOF + H + 0.15, -0.1, 0.06, 'ft'); }
            B.det.setColor('#8a7670'); B.det.fill(hr, [], ROOF + H + 0.12, true);
            S.prism(hr.flat(), ROOF, ROOF + H + 0.15, 0, 0, 'equipment');
          }
        }
        s += w;
      }
    }
    S.prism(ring.flat(), gB, TOP, 0, 0, 'wall');
    footprints.push({ poly: ring, h: TOP - gLo, kind: 'apt', name: h.name });
  }

  // ---- the yard floor: one draped grid (4 m cells sharing their corners), painted by yardTex
  {
    const D = B.yard, C = 4, NX = Math.ceil((YX1 - YX0) / C), NZ = Math.ceil((YZ1 - YZ0) / C), idx = [];
    const inside = (x, z) => inPoly(YARD, x, z) || rings.some((q) => inPoly(q, x, z) || dist(q, x, z) < APRON);
    D.setColor('#ffffff');
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const x = Math.min(YX1, YX0 + i * C), z = Math.min(YZ1, YZ0 + j * C);
      idx.push(D.vert(x, heightAt(x, z) + 0.26, z, 0, 1, 0, (x - YX0) / (YX1 - YX0), 1 - (z - YZ0) / (YZ1 - YZ0)));
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const x = YX0 + (i + 0.5) * C, z = YZ0 + (j + 0.5) * C;
      if (!inside(Math.min(x, YX1 - 0.5), Math.min(z, YZ1 - 0.5))) continue;
      const a = idx[j * (NX + 1) + i], b = a + 1, c = a + NX + 2, d = a + NX + 1;
      D.quad(a, d, c, b);
    }
  }
  // the playground in the round plaza: a climbing frame with a slide, a swing frame, a spring rider; benches round it
  const P = B.det, [px, pz] = PARK_YARD.c1;
  {
    const y0 = heightAt(px, pz);
    P.setColor('#e0b33c'); for (const [ox, oz] of [[-1.5, -1.2], [1.5, -1.2], [-1.5, 1.2], [1.5, 1.2]]) P.box(px + ox - 0.07, y0, pz + oz - 0.07, px + ox + 0.07, y0 + 2.6, pz + oz + 0.07);
    P.setColor('#c9483c'); P.box(px - 1.6, y0 + 1.3, pz - 1.3, px + 1.6, y0 + 1.42, pz + 1.3);
    P.setColor('#2f7fc0'); P.cyl(px, y0 + 2.6, pz, 1.9, 0.1, 1.0, 4);
    P.setColor('#e0b33c'); P.face([[px + 1.6, y0 + 1.42, pz - 0.4], [px + 4.2, y0 + 0.25, pz - 0.4], [px + 4.2, y0 + 0.25, pz + 0.4], [px + 1.6, y0 + 1.42, pz + 0.4]]);
    S.prism([px - 1.6, pz - 1.3, px + 1.6, pz - 1.3, px + 1.6, pz + 1.3, px - 1.6, pz + 1.3], y0, y0 + 3.6, 0, 0, 'wall');
    const sx = px - 1, sz = pz + 5;
    P.setColor('#3a3c40'); for (const s of [-1.8, 1.8]) for (const d of [-0.8, 0.8]) P.tube([sx + s, y0 - 0.1, sz + d], [sx + s, y0 + 2.3, sz], 0.05, 5);
    P.tube([sx - 1.9, y0 + 2.3, sz], [sx + 1.9, y0 + 2.3, sz], 0.06, 5);
    for (const s of [-0.8, 0.8]) { P.setColor('#1f1f20'); P.box(sx + s - 0.28, y0 + 0.45, sz - 0.2, sx + s + 0.28, y0 + 0.52, sz + 0.2); }
    for (const s of [-1.8, 1.8]) S.prism([sx + s - 0.1, sz - 0.9, sx + s + 0.1, sz - 0.9, sx + s + 0.1, sz + 0.9, sx + s - 0.1, sz + 0.9], y0 - 0.1, y0 + 2.3, 0, 0, 'pole');
    P.setColor('#47a54d'); P.box(px + 2.5, y0 + 0.4, pz - 4.4, px + 3.2, y0 + 0.8, pz - 4.0);
    P.setColor('#3a3c40'); P.cyl(px + 2.85, y0, pz - 4.2, 0.05, 0.05, 0.45, 5);
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) / 8 * Math.PI * 2, bx = px + Math.cos(a) * 9.4, bz = pz + Math.sin(a) * 9.4, by = heightAt(bx, bz), ux = -Math.sin(a), uz = Math.cos(a);
      P.setColor('#8a5a36');
      P.face([[bx - ux * 0.9, by + 0.45, bz - uz * 0.9], [bx + ux * 0.9, by + 0.45, bz + uz * 0.9], [bx + ux * 0.9 + Math.cos(a) * 0.45, by + 0.45, bz + uz * 0.9 + Math.sin(a) * 0.45], [bx - ux * 0.9 + Math.cos(a) * 0.45, by + 0.45, bz - uz * 0.9 + Math.sin(a) * 0.45]], [0, 1, 0]);
      P.setColor('#3a3c40'); P.tube([bx, by, bz], [bx, by + 0.45, bz], 0.06, 4);
    }
  }

  const paintT = paintTex(), wtex = winTex(false, wlit), wmask = winTex(true, wlit), ltex = logTex(false, llit), lmask = logTex(true, llit), ytex = yardTex(rings);
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: paintT, vertexColors: true, roughness: 0.9 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    win: new THREE.MeshStandardMaterial({ map: wtex, vertexColors: true, roughness: 0.35, metalness: 0.1, emissive: new THREE.Color('#ffd5a0'), emissiveMap: wmask, emissiveIntensity: 0 }),
    log: new THREE.MeshStandardMaterial({ map: ltex, vertexColors: true, roughness: 0.3, metalness: 0.1, emissive: new THREE.Color('#ffd5a0'), emissiveMap: lmask, emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.3, emissive: new THREE.Color('#ffe2b8'), emissiveIntensity: 0 }),
    yard: decal(new THREE.MeshStandardMaterial({ map: ytex, vertexColors: true, roughness: 0.92, alphaTest: 0.5 }), 3),
  };
  const out = finish(root, 'parkovyi', B, M, { shade: ['wall', 'det', 'log'] });
  console.log(`[cherkasy] ЖК Парковий квартал: ${houses.length} houses, ${nStack} stacks, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const boxes = rings.map(bboxOf);
  return {
    footprints,
    // generated trees keep 3 m off the houses and off the yard's driveway, plazas and pitch (the lawn may keep them)
    clear: (x, z) => rings.some((q, i) => x > boxes[i].x0 - 3 && x < boxes[i].x1 + 3 && z > boxes[i].z0 - 3 && z < boxes[i].z1 + 3 && (inPoly(q, x, z) || dist(q, x, z) < 3))
      || (inPoly(YARD, x, z) && !(x > -3398 && x < -3298 && z > -1184 && z < -1143 && Math.hypot(x - px, z - pz) > 22)),
    update() { const k = nightK.value; M.win.emissiveIntensity = 1.0 * k; M.log.emissiveIntensity = 0.9 * k; M.glass.emissiveIntensity = 0.3 * k; },
  };
}
