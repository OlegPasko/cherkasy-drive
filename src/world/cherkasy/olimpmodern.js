// OWNER: cherkasy. ЖК «Олімп Модерн», вул. Квіткова, 10 (Південний, by the Sosnivka forest): the brick-and-render
// residential quarter on the OSM construction lot «ЖК "Олімп-Модерн"» (way 1355317025), built after the renders in the
// lun.ua new-builds catalogue (lun.ua/new/cherkasy/olimp-modern, the aerial one above all). Its first house, the
// nine-storey section along the street (OSM way 1526504590, «Квіткова 14» in OSM), is in; the rest stand as rendered.
// A closed quarter round a big yard: along Квіткова the front row – a low white pavilion with white fins at the
// north-west end, house 1, the white portal into the yard, and the long south-east wing (ten storeys at its ends, nine in
// the middle) – then a stepped wing back along the south-east side, an L at the far corner, a long back row toward the
// forest and a stepped wing up the north-west side, with a driveway between the back row and the far L.
// Facades as rendered, section by section: ivory render with a staggered pattern of mocha panels two or three storeys
// tall round the window columns, dark-framed windows with an air-conditioner basket beside each, glazed loggia stacks in
// white frames whose pilasters rise past the brown parapet (single and double ones), a parapet that steps up here and
// there, a ground storey faced in brown rubble stone: shopfronts under a white canopy along the street, windows and
// entrances with canopies on the other sides. The yard as rendered: lawn and paving draped over the ground, the square
// marble fountain basin inside the portal, a soft-surfaced playground, a sports court. No names, logos or shop signs anywhere.
//   OLIMPM_SKIP: the OSM ids replaced here (buildings.js skips them)
//   OLIMPM_SECTIONS: the plan, rectangles in the lot frame (u along the street from the north-west lot corner, v into the
//     lot), with storeys
//   olimpModernRings() -> [[[x, z], ...], ...]   the section outlines on the map (places.js keeps a flat copy; the test
//     compares them)
//   buildOlimpModern({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Every outline edge is a facade in a face frame (slabkit.js: s from the left end as seen from outside, y up, o out),
// minus what a neighbouring section covers. Its upper storeys follow a module string read off the renders: w a window
// column (w/6-8 with mocha panels over storeys 6–8, counted from the first floor over the ground storey), b a single
// loggia stack, B a double one, e a blank end strip; the free width spreads evenly between the modules. A window column
// is one recessed pane a whole stack high whose texture holds eight storeys with their own lit pattern.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { rng } from './geo.js';
import { canvasTex, decal } from './sculpt.js';
import { face, at, quad, rect, box, skin, solid, finish } from './slabkit.js';

export const OLIMPM_SKIP = new Set([1526504590]);
// the lot frame: origin the lot's north-west street corner (OSM way 1355317025), u along Квіткова to the south-east, v
// square to it into the lot (south-west)
const O = [-2467.3, -1571.8], U = [0.0529, 0.9986], V = [-0.9986, 0.0529];
const P = (u, v) => [O[0] + U[0] * u + V[0] * v, O[1] + U[1] * u + V[1] * v];
const LOC = (x, z) => { const dx = x - O[0], dz = z - O[1]; return [dx * U[0] + dz * U[1], dx * V[0] + dz * V[1]]; };

const FH = 3.2, PARA = 1.3, TEX_N = 8;
const IVORY = '#f3e2c4', MOCHA = '#cba57a', CROWN = '#9c7756', WHITE = '#f4f2ed', STONE = '#ffffff', ROOFC = '#9c9a95';
const REV = '#e3d8c3', FRAME = '#2f3032';

// The plan. f / k / l / r: the module strings of the faces at v0 (the street side), v1, u0 (north-west), u1 (south-east),
// each read left to right from outside. shop: the ground storey is commercial on those faces (under the white canopy).
export const OLIMPM_SECTIONS = [
  { id: 'A', u: [11, 23.3], v: [6.5, 20.1], nf: 5, white: true, shop: 'flr', name: 'павільйон' },
  { id: 'B', u: [23.3, 79.3], v: [6.5, 20.1], nf: 9, shop: 'f', name: 'будинок 1', // c87r: house 1 from the street
    f: 'e/4-5 w/6-8/1-3 b w w/6-8/1-2 w/4-5 B w/3-5 w B w/4-5 w/6-8/1-2 w b w/6-8/4-5 e',
    k: 'e w b w w/2-4 B w/5-7 w b w w/1-3 B w/6-8 e', r: 'e w w/5-7 e' },
  { id: 'D1', u: [92.6, 113], v: [6.5, 20.1], nf: 10, shop: 'f',
    f: 'w/3-5 w/6-9 B w/1-2 w/7-9/4-5 e', k: 'e w/2-4 B w w/6-8', l: 'e w w/2-4 e' },
  { id: 'D2', u: [113, 137], v: [6.5, 20.1], nf: 9, shop: 'f',
    f: 'w w/4-6 b w w/3-5 b w/5-7/1-2 w', k: 'w b w/4-6 w B w' },
  { id: 'D3', u: [137, 156.6], v: [6.5, 20.1], nf: 10, shop: 'fr',
    f: 'w/4-6/2-3 w/7-9 B w/7-9', r: 'e w/5-7 b w e' },
  { id: 'E1', u: [137, 156.6], v: [20.1, 44], nf: 10, l: 'w b w/3-5 w B w/6-8', r: 'w/7-9 w b w w/2-4 w', k: 'w' },
  { id: 'E2', u: [133, 151], v: [44, 68], nf: 10, f: 'w', l: 'w B w/4-6 w b w', r: 'w w/6-8 b w w/1-3', k: 'e w/5-7 b w e' },
  { id: 'F1', u: [133, 151], v: [76, 100], nf: 10, f: 'e w b w/2-4 e', l: 'w b w/5-7 w B', r: 'w/3-5 w b w w' },
  { id: 'F2', u: [100, 151], v: [100, 114], nf: 10, f: 'w b w/6-8 w B w w/2-4 b',
    k: 'e w b w/4-6 w B w w/7-9 w b w/1-3 w e', l: 'e w/4-6 w e', r: 'e w w/6-8 e' },
  { id: 'G', u: [1, 88], v: [86, 100], nf: 9, f: 'w b w/5-7 w B w w/2-4 b w/6-8 w B w/3-5 w b w/1-2 w B w',
    k: 'e w/3-5 b w w/6-8 B w w b w/2-4 w B w/5-7 w b w w/1-3 e', l: 'e w/6-8 w e', r: 'e w w/3-5 e' },
  { id: 'H1', u: [3, 17], v: [26, 62], nf: 10, f: 'e w b e', l: 'w w/6-8 b w w/2-4 B w', r: 'w b w/4-6 w B w w/1-3 b w' },
  { id: 'H2', u: [1, 15], v: [62, 86], nf: 10, l: 'w/3-5 b w w/7-9 B w', r: 'w B w/5-7 b w/2-4 w' },
];
const ARCH = { u: [79.3, 92.6], v: [6.5, 10.5] };   // the white portal into the yard, between house 1 and the long wing
const YARD = [75, 60];                               // the middle of the yard (u, v)

export const olimpModernRings = () => OLIMPM_SECTIONS.map((s) => [[s.u[0], s.v[0]], [s.u[1], s.v[0]], [s.u[1], s.v[1]], [s.u[0], s.v[1]]].map(([u, v]) => P(u, v)));

// ------------------------------------------------------------------------------------------------ textures
const SH = 128;
// ivory render in large smooth panels with faint joints, 2.4 m square per repeat; the hue is the vertex colour
const renderTex = (r) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#fbfaf8'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(90,80,60,0.05)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  g.fillStyle = 'rgba(70,60,50,0.10)';
  for (const x of [0, w / 2]) g.fillRect(x, 0, 1, h);
  for (let y = 0; y < h; y += h / 3) g.fillRect(0, Math.round(y), w, 1);
});
// rubble stone facing: brown, grey and rust stones in dark joints, 2 m square per repeat
const stoneTex = (r) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#2c2621'; g.fillRect(0, 0, w, h);
  const C = [[110, 88, 70], [86, 72, 62], [128, 104, 80], [70, 62, 58], [140, 118, 92], [98, 78, 60]];
  for (let y = 0; y < h;) {
    const rh = 14 + r() * 18;
    for (let x = -r() * 20; x < w;) {
      const cw = 18 + r() * 30, c = C[(r() * C.length) | 0], k = 0.85 + r() * 0.3;
      g.fillStyle = `rgb(${c.map((v) => Math.min(255, Math.round(v * k))).join(',')})`;
      g.beginPath(); g.moveTo(x + 2 + r() * 3, y + 2); g.lineTo(x + cw - 2, y + 2 + r() * 3); g.lineTo(x + cw - 2 - r() * 3, y + rh - 2); g.lineTo(x + 2, y + rh - 2 - r() * 3); g.closePath(); g.fill();
      for (const xx of [x - w, x + w]) { g.beginPath(); g.moveTo(xx + 2, y + 2); g.lineTo(xx + cw - 2, y + 2); g.lineTo(xx + cw - 2, y + rh - 2); g.lineTo(xx + 2, y + rh - 2); g.closePath(); g.fill(); }
      x += cw;
    }
    y += rh;
  }
});
// window column, TEX_N storeys of FH (v 0 at the bottom storey's floor): white spandrel (tinted ivory / mocha by the
// vertex colour), a dark-framed window 0.85–2.65 m with a mullion and a transom; mask: the glass of the lit storeys
const winTex = (mask, r) => canvasTex(64, SH * TEX_N, (g, w, h) => {
  g.fillStyle = mask ? '#000' : '#fbfaf7'; g.fillRect(0, 0, w, h);
  for (let j = 0; j < TEX_N; j++) {
    const bot = h - j * SH, wb = Math.round(bot - SH * 0.85 / FH), wt = Math.round(bot - SH * 2.65 / FH), lit = r() < 0.3;
    if (mask) { if (lit) { g.fillStyle = '#fff'; g.fillRect(4, wt + 3, w - 8, wb - wt - 6); } continue; }
    const gl = g.createLinearGradient(0, wt, w * 0.3, wb);
    gl.addColorStop(0, '#8d9ba3'); gl.addColorStop(0.5, '#4f5c64'); gl.addColorStop(1, '#353f45');
    g.fillStyle = FRAME; g.fillRect(0, wt, w, wb - wt);
    g.fillStyle = gl; g.fillRect(4, wt + 4, w - 8, wb - wt - 8);
    g.fillStyle = FRAME; g.fillRect(w / 2 - 2, wt, 4, wb - wt); g.fillRect(0, wt + Math.round((wb - wt) * 0.24), w, 3);
    g.fillStyle = '#d9d4ca'; g.fillRect(0, wb, w, 3); // sill
  }
});
// loggia glazing: one 1 m pane per 64 px, TEX_N storeys: the white slab edge at the floor, graphite frame, a transom at
// rail height; mask: the glass of the lit storeys
const bayTex = (mask, r) => canvasTex(64, SH * TEX_N, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let j = 0; j < TEX_N; j++) {
    const bot = h - j * SH, top = bot - SH, slab = Math.round(SH * 0.32 / FH), lit = r() < 0.32;
    if (mask) { if (lit) { g.fillStyle = '#fff'; g.fillRect(3, top + 3, w - 6, SH - slab - 6); } continue; }
    const gl = g.createLinearGradient(0, top, 0, bot);
    gl.addColorStop(0, '#aab3b8'); gl.addColorStop(0.6, '#6a747a'); gl.addColorStop(1, '#4d565b');
    g.fillStyle = gl; g.fillRect(0, top, w, SH);
    g.fillStyle = FRAME; g.fillRect(0, top, 3, SH); g.fillRect(w - 3, top, 3, SH);
    g.fillRect(0, Math.round(bot - slab - SH * 1.0 / FH), w, 3); g.fillRect(0, top + 2, w, 3);
    g.fillStyle = '#f2f0ea'; g.fillRect(0, bot - slab, w, slab);           // the slab edge
  }
});
// a shopfront bay, one storey: glass over a dark frame, all of it lit after dark
const shopTex = (mask) => canvasTex(64, 128, (g, w, h) => {
  if (mask) { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(4, 4, w - 8, h - 10); return; }
  const gl = g.createLinearGradient(0, 0, 0, h);
  gl.addColorStop(0, '#a6b3ba'); gl.addColorStop(1, '#4d5960');
  g.fillStyle = gl; g.fillRect(0, 0, w, h);
  g.fillStyle = '#26272a'; g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h); g.fillRect(0, 0, w, 4); g.fillRect(0, h - 6, w, 6); g.fillRect(0, 30, w, 3);
});
// air-conditioner baskets beside the windows, one per storey (alpha-tested): a cream louvred box with the fan's ring
const acTex = () => canvasTex(64, SH * TEX_N, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  for (let j = 0; j < TEX_N; j++) {
    const bot = h - j * SH, y0 = Math.round(bot - SH * 1.75 / FH), y1 = Math.round(bot - SH * 1.05 / FH);
    g.fillStyle = '#e9e1d2'; g.fillRect(4, y0, w - 8, y1 - y0);
    g.fillStyle = 'rgba(80,70,60,0.55)';
    for (let y = y0 + 4; y < y1 - 2; y += 4) g.fillRect(6, y, w - 12, 1);
    g.strokeStyle = 'rgba(70,60,50,0.6)'; g.lineWidth = 2; g.beginPath(); g.arc(w / 2, (y0 + y1) / 2, (y1 - y0) * 0.32, 0, Math.PI * 2); g.stroke();
  }
}, { srgb: true });

// ------------------------------------------------------------------------------------------------ helpers
const uvq = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
const pane = (D, f, s0, s1, y0, y1, o, uv) => quad(D, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), f.N, uv);
function reveals(D, f, s0, s1, y0, y1, d, col, bottom = true) {
  D.setColor(col);
  quad(D, at(f, s0, y0), at(f, s0, y0, -d), at(f, s0, y1, -d), at(f, s0, y1), f.U);
  quad(D, at(f, s1, y0), at(f, s1, y0, -d), at(f, s1, y1, -d), at(f, s1, y1), f.U.map((v) => -v));
  quad(D, at(f, s0, y1), at(f, s1, y1), at(f, s1, y1, -d), at(f, s0, y1, -d), [0, -1, 0]);
  if (bottom) quad(D, at(f, s0, y0), at(f, s1, y0), at(f, s1, y0, -d), at(f, s0, y0, -d), [0, 1, 0]);
}
// 'w/6-8/1-2' -> { t: 'w', panels: [[6, 8], [1, 2]] }
const parse = (str) => (str || '').split(/\s+/).filter(Boolean).map((tok) => {
  const [t, ...ps] = tok.split('/');
  return { t, panels: ps.map((p) => p.split('-').map(Number)) };
});
const WIDTH = { w: 2.5, b: 3.8, B: 7.2, e: 1.0 };

// ------------------------------------------------------------------------------------------------ build
export function buildOlimpModern({ root, map, solids: S, zips: Z, heightAt }) {
  if (!map?.frame || !heightAt) return null;
  const t0 = performance.now(), n0 = S.count ?? 0, r = rng(4710);
  const B = { wall: new MB(), stone: new MB(), det: new MB(), win: new MB(), bay: new MB(), shop: new MB(), ac: new MB(), yard: new MB() };
  const UVW = [2.4, 2.4], UVS = [2.0, 2.0];
  let nCol = 0, nBay = 0, nShop = 0, nDoor = 0;

  // ---- storey levels per section: the floor over its highest corner, the plinth down to its lowest
  const secs = OLIMPM_SECTIONS.map((s) => {
    const R = [[s.u[0], s.v[0]], [s.u[1], s.v[0]], [s.u[1], s.v[1]], [s.u[0], s.v[1]]].map(([u, v]) => P(u, v));
    const hs = R.map(([x, z]) => heightAt(x, z)), front = s.v[0] < 10;
    const gf = front ? 4.2 : 3.3, yF = Math.max(...hs) + 0.15, lo = Math.min(...hs), y1 = yF + gf;
    const yR = y1 + (s.nf - 1) * (s.white ? 3.4 : FH);
    return { ...s, R, yF, lo, gB: lo - 0.6, y1, yR, yTop: yR + (s.white ? 1.0 : PARA) };
  });

  // ---- faces: each rectangle edge; s runs from the left end as seen from outside. side: f (v0), k (v1), l (u0), r (u1)
  function faceOf(sec, side) {
    const [u0, u1] = sec.u, [v0, v1] = sec.v;
    const ends = { f: [[u1, v0], [u0, v0], [-V[0], -V[1]]], k: [[u0, v1], [u1, v1], V], l: [[u0, v0], [u0, v1], [-U[0], -U[1]]], r: [[u1, v1], [u1, v0], U] }[side];
    const f = face(P(...ends[0]), P(...ends[1]), ends[2][0], ends[2][1]);
    f.side = side; f.uv0 = ends[0]; f.uv1 = ends[1];
    return f;
  }
  // stretches of the face another section stands against: [s0, s1, that section's top]
  function covered(sec, f) {
    const out = [], horiz = f.side === 'f' || f.side === 'k', line = { f: sec.v[0], k: sec.v[1], l: sec.u[0], r: sec.u[1] }[f.side];
    const out0 = { f: -1, k: 1, l: -1, r: 1 }[f.side];
    for (const o of secs) {
      if (o === sec) continue;
      const oLine = horiz ? (out0 < 0 ? o.v[1] : o.v[0]) : (out0 < 0 ? o.u[1] : o.u[0]);
      if (Math.abs(oLine - line) > 0.05) continue;
      const [a, b] = horiz ? o.u : o.v, [p, q] = horiz ? sec.u : sec.v, lo = Math.max(a, p), hi = Math.min(b, q);
      if (hi - lo < 0.1) continue;
      // s of a coordinate along the edge: from uv0
      const c0 = horiz ? f.uv0[0] : f.uv0[1], dir = Math.sign((horiz ? f.uv1[0] : f.uv1[1]) - c0);
      const s0 = (lo - c0) * dir, s1 = (hi - c0) * dir;
      out.push([Math.min(s0, s1), Math.max(s0, s1), o.yTop]);
    }
    return out.sort((x, y) => x[0] - y[0]);
  }
  const freeSpans = (f, cov) => {
    const out = [];
    let s = 0;
    for (const [a, b] of cov) { if (a - s > 0.2) out.push([s, a]); s = Math.max(s, b); }
    if (f.L - s > 0.2) out.push([s, f.L]);
    return out;
  };

  // ---- one loggia stack: glazing recessed between white pilasters that rise past the parapet, a white head over it
  function bayStack(f, sec, s0, s1, top) {
    const yA = sec.y1, yB = sec.yR, w = s1 - s0, k0 = (r() * TEX_N) | 0, n = (yB - yA) / FH;
    f.cuts.push({ s0, s1, y0: yA, y1: yB });
    reveals(B.det, f, s0, s1, yA, yB, 0.35, WHITE, false);
    pane(B.bay, f, s0, s1, yA, yB, -0.33, uvq(0, Math.max(2, Math.round(w / 0.75)), k0 / TEX_N, (k0 + n) / TEX_N));
    B.det.setColor(WHITE);
    for (const s of [s0, s1]) box(B.det, f, s - 0.2, s + 0.2, yA - 0.35, top, 0, 0.3, 'flrt');
    box(B.det, f, s0 + 0.2, s1 - 0.2, yB, sec.yTop, 0, 0.3, 'ftu');           // the head over the stack
    box(B.det, f, s0 + 0.2, s1 - 0.2, yA - 0.35, yA, 0, 0.3, 'fu');           // the sill band at its foot
    nBay++;
  }
  // ---- one window column with its AC baskets and mocha panels round it
  function winCol(f, sec, cx, panels, acSide) {
    const ww = 1.45, s0 = cx - ww / 2, s1 = cx + ww / 2, yA = sec.y1, yB = sec.yR, k0 = (r() * TEX_N) | 0;
    f.cuts.push({ s0, s1, y0: yA, y1: yB });
    reveals(B.det, f, s0, s1, yA, yB, 0.08, REV);
    // the pane: split where the panels start and end, so the spandrels take the panel's colour
    const fl = (k) => yA + (k - 1) * FH;               // floor of residential storey k (1 = first over the ground storey)
    const cuts = new Set([yA, yB]);
    for (const [a, b] of panels) { cuts.add(Math.max(yA, fl(a))); cuts.add(Math.min(yB, fl(b + 1))); }
    const ys = [...cuts].filter((y) => y >= yA && y <= yB).sort((p, q) => p - q);
    for (let i = 1; i < ys.length; i++) {
      const ya = ys[i - 1], yb = ys[i], mid = (ya + yb) / 2;
      const brown = panels.some(([a, b]) => mid > fl(a) && mid < fl(b + 1));
      B.win.setColor(brown ? MOCHA : IVORY);
      pane(B.win, f, s0, s1, ya, yb, -0.075, uvq(0, 1, k0 / TEX_N + (ya - yA) / FH / TEX_N, k0 / TEX_N + (yb - yA) / FH / TEX_N));
    }
    // the panels: proud of the render either side of the column, the AC side wider
    const pl = acSide < 0 ? 1.05 : 0.45, pr = acSide > 0 ? 1.05 : 0.45;
    B.wall.setColor(MOCHA);
    for (const [a, b] of panels) {
      const ya = Math.max(yA, fl(a)), yb = Math.min(yB, fl(b + 1));
      rect(B.wall, f, s0 - pl, s0, ya, yb, 0.03, UVW); rect(B.wall, f, s1, s1 + pr, ya, yb, 0.03, UVW);
    }
    // AC baskets: one overlay a stack high
    const as = acSide < 0 ? s0 - 0.85 : s1 + 0.15;
    pane(B.ac, f, as, as + 0.7, yA, yB, 0.06, uvq(0, 1, 0, (yB - yA) / FH / TEX_N));
    nCol++;
  }

  // ---- the ground storey: shopfronts under the canopy, or windows and an entrance
  function shopfront(f, sec, s0, s1) {
    const n = Math.max(1, Math.round((s1 - s0) / 3.4)), w = (s1 - s0) / n;
    for (let i = 0; i < n; i++) {
      const a = s0 + i * w + 0.35, b = s0 + (i + 1) * w - 0.35, y0 = sec.yF + 0.1, y1 = sec.y1 - 0.75;
      f.cuts.push({ s0: a, s1: b, y0, y1 });
      reveals(B.det, f, a, b, y0, y1, 0.22, '#3a3533');
      pane(B.shop, f, a, b, y0, y1, -0.2, uvq(0, Math.max(1, Math.round((b - a) / 1.6)), 0, 1));
      nShop++;
    }
  }
  function groundWin(f, sec, s0, s1) {
    const y0 = sec.yF + 0.9, y1 = sec.y1 - 0.5;
    if (y1 - y0 < 0.8) return;
    f.cuts.push({ s0, s1, y0, y1 });
    reveals(B.det, f, s0, s1, y0, y1, 0.16, '#5a524b');
    const k0 = (r() * TEX_N) | 0;
    B.win.setColor(IVORY); pane(B.win, f, s0, s1, y0, y1, -0.14, uvq(0, 1, (k0 + 0.85 / FH) / TEX_N, (k0 + 2.65 / FH) / TEX_N));
  }
  function door(f, sec, cx) {
    const s0 = cx - 1.0, s1 = cx + 1.0, y0 = sec.yF, y1 = sec.yF + 2.5;
    f.cuts.push({ s0, s1, y0, y1 });
    reveals(B.det, f, s0, s1, y0, y1, 0.3, '#5a524b', false);
    pane(B.shop, f, s0, s1, y0, y1, -0.28, uvq(0, 2, 0, 1));
    B.det.setColor('#3a3b3e'); box(B.det, f, s0 - 0.9, s1 + 0.9, y1 + 0.35, y1 + 0.55, 0, 1.6, 'fltru'); // canopy
    solid(S, f, s0 - 0.9, s1 + 0.9, 0, 1.6, y1 + 0.35, y1 + 0.55, 'awning', 1);
    const p = at(f, cx, 0, 1.4), gd = heightAt(p[0], p[2]);
    B.det.setColor('#aaa49a'); box(B.det, f, s0 - 0.6, s1 + 0.6, Math.min(gd, sec.yF) - 0.4, sec.yF, 0, 1.6, 'fltr');
    if (sec.yF - gd > 0.5) solid(S, f, s0 - 0.6, s1 + 0.6, 0, 1.6, gd - 0.4, sec.yF, 'wall');
    nDoor++;
  }

  // ---- the sections
  const footprints = [];
  for (const sec of secs) {
    const faces = [];
    for (const side of ['f', 'k', 'l', 'r']) {
      const F = faceOf(sec, side), cov = covered(sec, F);
      for (const [a, b, top] of cov) if (top < sec.yTop - 0.05) faces.push({ F, a, b, over: top });
      const spans = freeSpans(F, cov), main = spans.slice().sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
      for (const sp of spans) faces.push({ F, a: sp[0], b: sp[1], main: sp === main });
    }
    for (const fc of faces) {
      const F = fc.F, pa = at(F, fc.a, 0), pb = at(F, fc.b, 0), f = face([pa[0], pa[2]], [pb[0], pb[2]], F.nx, F.nz), W = f.L;
      f.side = F.side;
      if (fc.over != null) { // the wall over a lower neighbour: render and the parapet
        skin(B.wall, f, fc.over, sec.yR, IVORY, UVW);
        B.wall.setColor(sec.white ? WHITE : CROWN); rect(B.wall, f, 0, W, sec.yR, sec.yTop, 0, UVW);
        B.det.setColor('#d8d4cb'); box(B.det, f, -0.02, W + 0.02, sec.yTop, sec.yTop + 0.08, -0.3, 0.05, 'ftlr');
        continue;
      }
      const shop = (sec.shop || '').includes(F.side), yard = (() => { const c = LOC(...at(f, W / 2, 0, 0).filter((_, i) => i !== 1)), n = LOC(...at(f, W / 2, 0, 3).filter((_, i) => i !== 1)); return Math.hypot(n[0] - YARD[0], n[1] - YARD[1]) < Math.hypot(c[0] - YARD[0], c[1] - YARD[1]); })();
      if (sec.white) { whiteFace(f, sec, shop); continue; }
      // the upper storeys: the module string on the main span, a column on a spare span wide enough
      const mods = parse(fc.main ? sec[F.side] : W > 3.4 ? 'w' : '');
      const need = mods.reduce((s, m) => s + WIDTH[m.t], 0), fit = Math.min(1, (W - 0.6) / (need || 1)), gap = mods.length ? Math.max(0, W - 0.6 - need) / mods.length : 0;
      let s = 0.3, nw = 0;
      const slots = [];
      for (const m of mods) {
        const a = s + gap / 2, b = a + WIDTH[m.t] * fit;
        s = b + gap / 2;
        if (m.t === 'w') { winCol(f, sec, (a + b) / 2, m.panels, nw++ % 2 ? 1 : -1); slots.push([a + 0.3, b - 0.3, 'w']); }
        else if (m.t === 'b' || m.t === 'B') {
          const top = sec.yTop + 0.55;
          if (m.t === 'b') { bayStack(f, sec, a + 0.2, b - 0.2, top); slots.push([a + 0.4, b - 0.4, 'b']); }
          else { const mid = (a + b) / 2; bayStack(f, sec, a + 0.2, mid, top); bayStack(f, sec, mid, b - 0.2, top); slots.push([a + 0.4, b - 0.4, 'b']); }
        } else if (m.t === 'e' && m.panels.length) {
          B.wall.setColor(MOCHA);
          for (const [p, q] of m.panels) rect(B.wall, f, a - gap / 2 + 0.1, b + gap / 2 - 0.1, sec.y1 + (p - 1) * FH, sec.y1 + q * FH, 0.03, UVW);
        }
      }
      // the ground storey
      if (shop) shopfront(f, sec, 0.2, W - 0.2);
      else {
        const dc = yard && fc.main && W > 8 ? W / 2 : null;
        if (dc != null) door(f, sec, dc);
        for (const [a, b] of slots) if (dc == null || b < dc - 1.6 || a > dc + 1.6) groundWin(f, sec, a, b);
      }
      // the skins: stone ground storey, ivory render above, the mocha parapet stepping up over some spans
      skin(B.stone, f, sec.gB, sec.y1, STONE, UVS);
      skin(B.wall, f, sec.y1, sec.yR, IVORY, UVW);
      B.wall.setColor(CROWN); rect(B.wall, f, 0, W, sec.yR, sec.yTop, 0, UVW);
      B.wall.setColor(IVORY); box(B.wall, f, 0, W, sec.y1 - 0.12, sec.y1 + 0.05, 0, 0.12, 'ftu', UVW); // the cornice over the stone
      if (W > 9) { // raised parapet blocks, as rendered over the window groups
        const nb = Math.floor(W / 14);
        for (let i = 0; i < nb; i++) {
          const c = W * (i + 0.5) / nb + (r() - 0.5) * 2, hw = 2.2 + r() * 2.0;
          if (slots.some(([a, b, t]) => t === 'b' && c + hw > a - 0.5 && c - hw < b + 0.5)) continue;
          B.wall.setColor(CROWN); box(B.wall, f, Math.max(0.2, c - hw), Math.min(W - 0.2, c + hw), sec.yTop, sec.yTop + 0.7, -0.3, 0.02, 'flrt', UVW);
        }
      }
      if (shop) { // the white canopy over the shops
        B.det.setColor(WHITE); box(B.det, f, -0.2, W + 0.2, sec.y1 - 0.75, sec.y1 - 0.15, 0, 1.4, 'flrtu');
        solid(S, f, -0.2, W + 0.2, 0, 1.4, sec.y1 - 0.75, sec.y1 - 0.15, 'awning', 1);
      }
      B.det.setColor('#cfc6b6'); rect(B.det, f, 0, W, sec.yR, sec.yTop, -0.3, null, f.N.map((v) => -v)); // parapet inside
      B.det.setColor('#d8d4cb'); box(B.det, f, -0.02, W + 0.02, sec.yTop, sec.yTop + 0.08, -0.32, 0.05, 'ftlr');
      if (W >= 3 && Z) { const a0 = at(f, 0, 0, -0.12), a1 = at(f, W, 0, -0.12); Z.edge?.(a0[0], a0[2], a1[0], a1[2], sec.yTop, f.nx, f.nz); }
    }
    // roof, a lift room, collision, footprint
    B.det.setColor(ROOFC); B.det.fill(sec.R, [], sec.yR, true);
    if (!sec.white) {
      const cu = (sec.u[0] + sec.u[1]) / 2, cv = (sec.v[0] + sec.v[1]) / 2, along = sec.u[1] - sec.u[0] > sec.v[1] - sec.v[0];
      const lr = (along ? [[-1.8, -1.5], [1.8, -1.5], [1.8, 1.5], [-1.8, 1.5]] : [[-1.5, -1.8], [1.5, -1.8], [1.5, 1.8], [-1.5, 1.8]]).map(([du, dv]) => P(cu + du, cv + dv));
      B.wall.setColor(IVORY); B.wall.extrude(lr, [], sec.yR, sec.yR + 1.6, { top: false });
      B.det.setColor('#d8d4cb'); B.det.fill(lr, [], sec.yR + 1.6, true);
      S.prism(lr.flat(), sec.yR, sec.yR + 1.6, 0, 0, 'bulkhead');
    }
    S.prism(sec.R.flat(), sec.gB, sec.yTop, 0, 0, 'wall');
    footprints.push({ poly: sec.R.map((p) => [p[0], p[1]]), h: sec.yTop - sec.lo, kind: sec.white ? 'shop' : 'apt', name: 'ЖК «Олімп Модерн», ' + (sec.name || 'секція ' + sec.id) });
  }

  // the low white pavilion at the north-west end: a grid of white fins and slab bands over dark glazing, rising into a
  // pergola over the roof; shopfronts in the ground storey
  function whiteFace(f, sec, shop) {
    const W = f.L, n = Math.max(1, Math.round(W / 2.6)), w = W / n, fs = 3.4;
    if (shop) shopfront(f, sec, 0.3, W - 0.3);
    else { B.stone.setColor(STONE); rect(B.stone, f, 0, W, sec.gB, sec.y1, 0, UVS); }
    B.stone.setColor(STONE); rect(B.stone, f, 0, W, sec.gB, sec.yF + 0.1, 0.01, UVS);
    if (shop) skin(B.det.setColor('#2e2c2b'), f, sec.yF, sec.y1, '#2e2c2b');
    const k0 = (r() * TEX_N) | 0, nst = (sec.yR - sec.y1) / fs;
    pane(B.bay, f, 0, W, sec.y1, sec.yR, -0.25, uvq(0, Math.round(W / 1.25), k0 / TEX_N, (k0 + nst) / TEX_N));
    B.det.setColor(WHITE);
    for (let i = 0; i <= n; i++) { const s = Math.min(W - 0.22, Math.max(0.22, i * w)); box(B.det, f, s - 0.22, s + 0.22, sec.y1 - 0.4, sec.yTop + 1.2, -0.25, 0.45, 'flrt'); }
    for (let k = 0; k <= nst; k++) { const y = sec.y1 + k * fs; box(B.det, f, 0, W, y - 0.4, y, -0.25, 0.25, 'ftu'); }
    box(B.det, f, 0, W, sec.yTop - 0.15, sec.yTop + 0.15, -0.25, 0.3, 'ftu');
    B.det.setColor('#cfccc4'); rect(B.det, f, 0, W, sec.yR, sec.yTop, -0.25, null, f.N.map((v) => -v));
    if (shop) { B.det.setColor('#2e2c2b'); box(B.det, f, -0.2, W + 0.2, sec.y1 - 0.6, sec.y1 - 0.3, 0, 1.2, 'flrtu'); }
    if (Z) { const a0 = at(f, 0, 0, -0.12), a1 = at(f, W, 0, -0.12); Z.edge?.(a0[0], a0[2], a1[0], a1[2], sec.yTop, f.nx, f.nz); }
  }

  // ---- the white portal into the yard: a deep beam over the passage on the street line (where the renders carry the
  // complex's name: left blank) and a tall white frame on the yard line, each on piers against the neighbours' walls
  {
    const b = secs.find((s) => s.id === 'B'), yG = Math.max(heightAt(...P(86, 8)), heightAt(...P(86, 14))), y0 = yG + 5.6, y1 = yG + 8.4;
    const f = face(P(ARCH.u[1], ARCH.v[0]), P(ARCH.u[0], ARCH.v[0]), -V[0], -V[1]), W = f.L, D = ARCH.v[1] - ARCH.v[0];
    B.det.setColor(WHITE);
    box(B.det, f, 0, W, y0, y1, -D, 0, 'fbtu');
    for (const [a, c] of [[0, 0.9], [W - 0.9, W]]) { box(B.det, f, a, c, Math.min(b.gB, yG - 0.5), y0, -D, 0, 'fblr'); solid(S, f, a, c, -D, 0, yG - 1, y0, 'wall'); }
    B.det.setColor('#3d3a37'); rect(B.det, f, 0.9, W - 0.9, y0 + 0.01, y0 + 0.02, -0.01); // soffit shadow line
    solid(S, f, 0, W, -D, 0, y0, y1, 'awning', 1);
    // the tall white frame behind it, on the yard line of the two wings, about four storeys high
    const t0 = yG + 13.2, t1 = yG + 14.8, o0 = -(20.1 - ARCH.v[0]), o1 = o0 + 1.6;
    B.det.setColor(WHITE);
    box(B.det, f, 0, W, t0, t1, o0, o1, 'fbtu');
    for (const [a, c] of [[0, 0.8], [W - 0.8, W]]) { box(B.det, f, a, c, yG - 0.5, t0, o0, o1, 'fblr'); solid(S, f, a, c, o0, o1, yG - 1, t0, 'wall'); }
    solid(S, f, 0, W, o0, o1, t0, t1, 'awning', 1);
    B.stone.setColor('#bdb6aa'); B.stone.fill([P(ARCH.u[0], ARCH.v[0]), P(ARCH.u[1], ARCH.v[0]), P(ARCH.u[1], 24), P(ARCH.u[0], 24)], [], yG + 0.04, true);
  }


  // ---- the yard, as rendered: lawn draped over the ground with paving paths (a ring, the walk in from the portal, a
  // cross walk), a sports court, a soft-surfaced playground with climbing frames, and the square marble fountain basin
  // just inside the portal
  {
    const Y0 = 20.6, Y1 = 99.4, X0 = 17.4, X1 = 132.6, cs = 2.0, nu = Math.round((X1 - X0) / cs), nv = Math.round((Y1 - Y0) / cs);
    const LAWN = '#5d8a3c', PAVE = '#aaa69d', COURT = '#3f7f5a', COURT2 = '#3a5d93', SOFT = '#c9673f';
    const colAt = (u, v) => {
      if (u > 99 && u < 121 && v > 26 && v < 46) return u > 102 && u < 118 && v > 29 && v < 43 ? COURT2 : COURT;  // the court
      if (Math.hypot(u - 70, v - 50) < 10) return SOFT;                                                       // playground
      const ring = Math.abs(Math.max(Math.abs(u - 75) / 52, Math.abs(v - 53) / 27) - 1) < 0.07;              // ring walk
      if (ring || (u > 88 && u < 100 && v > 84) || (Math.abs(u - 86) < 2.2) || (Math.abs(v - 66) < 1.8) || (u > 76 && u < 96 && v < 44)) return PAVE;
      return LAWN;
    };
    const D = B.yard, idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = X0 + i * cs, v = Y0 + j * cs, [x, z] = P(u, v);
      D.setColor(colAt(u, v)); idx.push(D.vert(x, heightAt(x, z) + 0.1, z, 0, 1, 0, u / 2, v / 2));
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const cu = X0 + (i + 0.5) * cs, cv = Y0 + (j + 0.5) * cs;
      if (secs.some((q) => cu > q.u[0] && cu < q.u[1] && cv > q.v[0] && cv < q.v[1])) continue;
      const a = idx[j * (nu + 1) + i], b = idx[j * (nu + 1) + i + 1], c = idx[(j + 1) * (nu + 1) + i + 1], d = idx[(j + 1) * (nu + 1) + i];
      D.quad(a, d, c, b);
    }
    // the fountain: a 9 m marble basin, water in it
    const fc = [86, 34], fy = Math.max(...[[-4.5, -4.5], [4.5, -4.5], [4.5, 4.5], [-4.5, 4.5]].map(([du, dv]) => heightAt(...P(fc[0] + du, fc[1] + dv)))) + 0.1;
    const ff = face(P(fc[0] + 4.5, fc[1] - 4.5), P(fc[0] - 4.5, fc[1] - 4.5), -V[0], -V[1]);
    B.det.setColor('#e7e5e0');
    for (const [s0, s1, o0, o1] of [[0, 9, -0.4, 0], [0, 9, -9, -8.6], [0, 0.4, -8.6, -0.4], [8.6, 9, -8.6, -0.4]]) {
      box(B.det, ff, s0, s1, fy - 0.8, fy + 0.8, o0, o1, 'fblrt');
      solid(S, ff, s0, s1, o0, o1, fy - 1, fy + 0.8, 'wall');
    }
    B.det.setColor('#6f9fb4'); quad(B.det, at(ff, 0.4, fy + 0.5, -0.4), at(ff, 8.6, fy + 0.5, -0.4), at(ff, 8.6, fy + 0.5, -8.6), at(ff, 0.4, fy + 0.5, -8.6), [0, 1, 0]);
    for (let k = 0; k < 9; k++) { // the jets, as thin white posts
      const s = 1.6 + (k % 3) * 2.9, o = -1.6 - Math.floor(k / 3) * 2.9, p = at(ff, s, 0, o);
      B.det.setColor('#eef4f7'); B.det.cyl(p[0], fy + 0.5, p[2], 0.09, 0.03, 1.6 + (k % 2) * 1.0, 5, false);
    }
    // the playground frames: a tower with a slide, arches and a climbing net in bright colours
    const pc = P(70, 50), pg = heightAt(...pc);
    const kit = [[-4, -3, 2.4, '#3d74c4'], [4, 2, 2.0, '#f2c230'], [-1, 5, 1.6, '#e2563c'], [3, -5, 2.2, '#4aa35a']];
    for (const [du, dv, h, col] of kit) {
      const [x, z] = P(70 + du, 50 + dv);
      B.det.setColor(col); B.det.box(x - 1.2, pg, z - 1.2, x + 1.2, pg + h, z + 1.2, 63 - 8);
      B.det.setColor('#ffffff'); B.det.box(x - 1.4, pg + h, z - 1.4, x + 1.4, pg + h + 0.6, z + 1.4, 63 - 8);
      S.box(x - 1.2, pg - 0.5, z - 1.2, x + 1.2, pg + h + 0.6, z + 1.2, 'wall');
    }
  }

  const glass = (mapT, em, extra = {}) => new THREE.MeshStandardMaterial({ map: mapT, emissiveMap: em, emissive: 0xffd49a, emissiveIntensity: 0, roughness: 0.2, metalness: 0.25, envMapIntensity: 1.2, ...extra });
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: renderTex(rng(11)), vertexColors: true, roughness: 0.85 }),
    stone: new THREE.MeshStandardMaterial({ map: stoneTex(rng(12)), vertexColors: true, roughness: 0.95 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    win: glass(winTex(false, rng(71)), winTex(true, rng(71)), { vertexColors: true, roughness: 0.55, metalness: 0, envMapIntensity: 0.8 }),
    bay: glass(bayTex(false, rng(29)), bayTex(true, rng(29)), { roughness: 0.2, metalness: 0.15, envMapIntensity: 0.8 }),
    shop: glass(shopTex(false), shopTex(true), { roughness: 0.12, metalness: 0.3 }),
    ac: new THREE.MeshStandardMaterial({ map: acTex(), alphaTest: 0.5, roughness: 0.8 }),
    yard: decal(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), 2),
  };
  const st = finish(root, 'olimpmodern', B, M, { shade: ['wall', 'stone', 'det'] });
  console.log(`[cherkasy] ZhK Olimp Modern: ${secs.length} sections, ${nCol} window columns, ${nBay} loggia stacks, ${nShop} shopfronts, ${nDoor} entrances, ${(st.verts / 1000).toFixed(1)}k verts in ${st.meshes} meshes, ${(S.count ?? 0) - n0} solids, ${(performance.now() - t0).toFixed(0)} ms`);

  // generated trees keep 3 m off the sections, off the forecourt to the street and off the yard's paving, court and playground
  const near = (u, v) => secs.some((s) => u > s.u[0] - 3 && u < s.u[1] + 3 && v > s.v[0] - 3 && v < s.v[1] + 3) || (u > 8 && u < 160 && v > -6 && v < 7)
    || (u > 97 && u < 123 && v > 24 && v < 48) || Math.hypot(u - 70, v - 50) < 11 || (u > 76 && u < 96 && v < 44) || Math.abs(v - 66) < 2.5 || Math.abs(u - 86) < 3
    || (u > 87 && u < 101 && v > 84 && v < 118);
  return {
    footprints,
    clear: (x, z) => { const [u, v] = LOC(x, z); return near(u, v); },
    update() { const k = nightK.value; M.win.emissiveIntensity = 1.3 * k; M.bay.emissiveIntensity = 1.1 * k; M.shop.emissiveIntensity = 1.6 * k; },
  };
}
