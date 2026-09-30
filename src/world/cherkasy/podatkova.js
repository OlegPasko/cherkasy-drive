// OWNER: cherkasy. The tax office (ГУ ДПС у Черкаській області), вулиця Хрещатик, 235 – OSM relation 2106384 (outer way
// 108382791, courtyard 157528372), rebuilt after the cherkasy.city and ratelist.top photos and the satellite view.
// A late-Soviet 59 x 59 m hollow square in white stone slabs, seven storeys: the two-storey-high undercroft on every
// side (the street front fully open on its piers, with the passage into the courtyard in the middle bay), a deep
// transfer band, four office storeys of deep-set brown-framed windows between fins, three windows to a bay between
// the big piers that run from the ground to the fluted attic, a heavy cornice. Blank corner pylons carry a carved
// lattice panel; the two on the street flare outwards off narrower feet. In the courtyard: plainer walls with
// windows on every storey and strips of circle ornament, the entrance block at the back with the chevron relief over
// a deep canopy on red granite piers. The lot stands on a paved podium with steps down to the street.
//   PODATKOVA_SKIP: the OSM id replaced here (buildings.js skips it)
//   shapePodatkova(hf, map) -> level | null   levels the lot, the courtyard and the street plaza (before the ground)
//   buildPodatkova({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// The block is square to the map axes (the street front looks south-west, -x). Faces come from blockkit.js: s along
// the edge, y up, o outward.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex, decal } from './sculpt.js';
import { ringPts, rng, bboxOf } from './geo.js';
import { edgeFace, at, quad, rect, fbox, wall, win, fsolid, finish, UP } from './blockkit.js';

const OSM_ID = 2106384;
export const PODATKOVA_SKIP = new Set([OSM_ID]);

// heights over the floor: undercroft, office storeys from BEAM, attic from ATT, cornice from TOP
const UND = 7.2, BEAM = 9.4, FH = 3.3, NF = 4, ATT = BEAM + NF * FH, TOP = ATT + 3.6, CORN = 0.7;
const EP = 6.2, FOOT = 2.5, NB = 5;                 // corner pylon width, how far a street pylon's foot is drawn in; bays
const REC_F = 5.0, REC = 2.4, PLAZA = 8, PASS = 7.4; // undercroft wall set back (street / other sides), plaza depth, passage
const STONE = '#ffffff', STONE_D = '#dcd9d1', GRANITE = '#3b3432', RED_GR = '#6e3a34', FRAME = '#4a3428', OAK = '#8a5a2e';
const GLASS = ['#5d6c78', '#6a7884', '#56636d', '#75828a'];

// ------------------------------------------------------------------------------------------------ textures
// travertine slabs 1.2 x 0.6 m in a running bond (4.8 m repeat), each a shade apart, faint joints and water stains
const stoneTex = (r) => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#b9b5ab'; g.fillRect(0, 0, w, h);
  const bw = w / 4, bh = h / 8;
  for (let j = 0; j < 8; j++) for (let i = 0; i < 5; i++) {
    const k = 0.94 + r() * 0.08, x = i * bw - (j & 1 ? bw / 2 : 0);
    g.fillStyle = `rgb(${[232, 229, 220].map((c) => Math.round(c * k)).join(',')})`; g.fillRect(x + 1, j * bh + 1, bw - 2, bh - 2);
  }
  for (let q = 0; q < 1800; q++) { g.fillStyle = r() < 0.5 ? 'rgba(120,112,98,0.10)' : 'rgba(255,255,255,0.10)'; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2); }
  for (let q = 0; q < 14; q++) { const x = r() * w, y = r() * h; g.fillStyle = 'rgba(110,104,92,0.07)'; g.fillRect(x, y, 3 + r() * 6, 30 + r() * 90); }
});
// the attic: vertical flutes every 0.6 m and a row of slit vents near the top (one repeat = the 3.6 m band)
const fluteTex = () => canvasTex(64, 256, (g, w, h) => {
  g.fillStyle = '#e4e1d8'; g.fillRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, 'rgba(90,86,78,0.30)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.12)'); gr.addColorStop(0.7, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(90,86,78,0.30)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2c2d2e'; g.fillRect(w * 0.3, h * 0.1, w * 0.4, h * 0.1);
});
// relief atlas: the carved lattice panel (left half), the chevron relief (top right), the circle strip (bottom right)
const ornTex = () => canvasTex(1024, 512, (g) => {
  g.clearRect(0, 0, 1024, 512);
  g.strokeStyle = 'rgba(150,146,136,1)'; g.lineWidth = 7;
  const R = 36;
  for (let j = 0; j < 8; j++) for (let i = 0; i < 7; i++) { // hexagons with a star in each
    const cx = 44 + i * R * 1.5 * 1.25, cy = 40 + j * R * 1.73 * 0.95 + (i & 1 ? R * 0.82 : 0);
    if (cx > 490 || cy > 490) continue;
    g.beginPath(); for (let k = 0; k <= 6; k++) { const a = k * Math.PI / 3; g.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); } g.stroke();
    g.beginPath(); for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; g.moveTo(cx - R * 0.6 * Math.cos(a), cy - R * 0.6 * Math.sin(a)); g.lineTo(cx + R * 0.6 * Math.cos(a), cy + R * 0.6 * Math.sin(a)); } g.stroke();
  }
  g.lineWidth = 5; g.strokeStyle = 'rgba(160,156,146,1)';
  for (let i = 0; i < 5; i++) { // nested pointed arches
    const x0 = 540 + i * 94; g.beginPath(); g.moveTo(x0, 250); g.lineTo(x0, 110); g.lineTo(x0 + 45, 50); g.lineTo(x0 + 90, 110); g.lineTo(x0 + 90, 250); g.stroke();
  }
  g.lineWidth = 6;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(560 + i * 80, 380, 32, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(560 + i * 80, 380, 12, 0, Math.PI * 2); g.stroke(); }
});
// podium and courtyard pavers: clay-red and grey setts in a basket pattern
const paveTex = (r) => canvasTex(256, 256, (g, w) => {
  g.fillStyle = '#6f6862'; g.fillRect(0, 0, w, w);
  const p = w / 8;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const k = 0.85 + r() * 0.25, red = (i + j) % 5 === 0;
    g.fillStyle = `rgb(${(red ? [150, 96, 82] : [150, 146, 140]).map((c) => Math.round(c * k)).join(',')})`;
    if ((i + j) & 1) { g.fillRect(i * p + 2, j * p + 2, p - 4, p / 2 - 3); g.fillRect(i * p + 2, j * p + p / 2 + 1, p - 4, p / 2 - 3); }
    else { g.fillRect(i * p + 2, j * p + 2, p / 2 - 3, p - 4); g.fillRect(i * p + p / 2 + 1, j * p + 2, p / 2 - 3, p - 4); }
  }
});
// ornament cells in the atlas (u0, v0, u1, v1 of the canvas, v down)
const CELL = { lattice: [0, 0, 0.49, 0.98], chevron: [0.52, 0.06, 0.98, 0.5], circles: [0.52, 0.66, 0.98, 0.84] };
function orn(D, f, s0, s1, y0, y1, cell, o = 0.02) {
  const [u0, v0, u1, v1] = CELL[cell];
  quad(D, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), f.N, [[u0, 1 - v1], [u1, 1 - v1], [u1, 1 - v0], [u0, 1 - v0]]);
}
// vertical circle strip: the cell is horizontal, so its u runs up the wall
function ornStrip(D, f, s0, s1, y0, y1, o = 0.02) {
  const [u0, v0, u1, v1] = CELL.circles, rep = Math.max(1, Math.round((y1 - y0) / (s1 - s0) / 6));
  quad(D, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), f.N, [[u0, 1 - v0], [u0, 1 - v1], [u0 + (u1 - u0) * rep, 1 - v1], [u0 + (u1 - u0) * rep, 1 - v0]]);
}

// ------------------------------------------------------------------------------------------------ terrain
// the lot falls 2.5 m to the north-west: the courtyard, the undercroft and the plaza are one paved level
export function shapePodatkova(hf, map) {
  const b = map.buildings?.find((q) => q.id === OSM_ID);
  if (!b) return null;
  const o = bboxOf(ringPts(b.p));
  return hf.pad([[o.x0 - PLAZA, o.z0], [o.x1, o.z0], [o.x1, o.z1], [o.x0 - PLAZA, o.z1]], 8);
}

// ------------------------------------------------------------------------------------------------ build
export function buildPodatkova({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((q) => q.id === OSM_ID);
  if (!b || !b.holes?.length) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 99991), n0 = S.count ?? 0;
  const ob = bboxOf(ringPts(b.p)), hb = bboxOf(ringPts(b.holes[0]));
  const X0 = ob.x0, X1 = ob.x1, Z0 = ob.z0, Z1 = ob.z1, HX0 = hb.x0, HX1 = hb.x1, HZ0 = hb.z0, HZ1 = hb.z1;
  const ZM = (Z0 + Z1) / 2;                                         // the passage / entrance axis: the middle bay
  // the floor: a little over the ground at the street front's middle; the podium takes up the rest of the slope
  const hs = [];
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) hs.push(heightAt(X0 - PLAZA + (X1 - X0 + PLAZA) * i / 4, Z0 + (Z1 - Z0) * j / 4));
  const yF = Math.max(...hs.filter((_, i) => i >= 5)) + 0.3, gBase = Math.min(...hs) - 0.6;
  const Y = (h) => yF + h;
  const inOuter = (x, z) => x > X0 && x < X1 && z > Z0 && z < Z1;
  const inCourt = (x, z) => x > HX0 && x < HX1 && z > HZ0 && z < HZ1;

  const B = { stone: new MB(), flute: new MB(), det: new MB(), glass: new MB(), lit: new MB(), orn: new MB(), pave: new MB() };
  const SM = [4.8, 4.8], D = B.det;
  B.stone.setColor(STONE);
  const glass = () => GLASS[Math.floor(r() * GLASS.length)];
  const winQ = (s0, s1, y0, y1, extra) => ({ s0, s1, y0, y1, dep: 0.34, frame: FRAME, rev: STONE_D, glass: glass(), lit: r() < 0.4, cols: 2, rows: 2, rowAt: [0.72], ...extra });
  let nWin = 0;

  // ---- outer faces: street (-x), back (+x), the north-west (-z) and south-east (+z) sides
  const corners = [[X0, Z1], [X0, Z0], [X1, Z0], [X1, Z1]];
  const faces = corners.map((a, i) => edgeFace(a, corners[(i + 1) % 4], inOuter));
  const isFront = (f) => f.nx < -0.9;
  for (const f of faces) {
    const L = f.L, front = isFront(f), rec = front ? REC_F : REC;
    // which ends touch the street front: their pylons stand on drawn-in feet
    const flare = [0, L].map((s) => !front && Math.abs(at(f, s, 0)[0] - X0) < 0.5 || front);
    const m0 = EP, m1 = L - EP, bw = (m1 - m0) / NB;
    // corner pylons: blank stone to the cornice; the street ones slope out from their feet up to the beam
    for (const [k, [p0, p1]] of [[0, [0, EP]], [1, [L - EP, L]]]) {
      const outer = k === 0 ? p0 : p1, inner = k === 0 ? p1 : p0, dir = k === 0 ? 1 : -1;
      if (flare[k]) {
        const foot = outer + dir * FOOT, nrm = [f.nx * BEAM, -FOOT, f.nz * BEAM], nl = Math.hypot(...nrm);
        const n = nrm.map((v) => v / nl);
        quad(B.stone, at(f, foot, Y(0), -FOOT), at(f, inner, Y(0), -FOOT), at(f, inner, Y(BEAM), 0), at(f, outer, Y(BEAM), 0), n,
          [[foot / 4.8, Y(0) / 4.8], [inner / 4.8, Y(0) / 4.8], [inner / 4.8, Y(BEAM) / 4.8], [outer / 4.8, Y(BEAM) / 4.8]]);
        rect(B.stone, f, Math.min(outer, inner), Math.max(outer, inner), Y(BEAM), Y(TOP), 0, SM);
        D.setColor(GRANITE); fbox(D, f, Math.min(foot, inner), Math.max(foot, inner), gBase, Y(0.3), -FOOT - 0.3, -FOOT + 0.05, 1);
      } else {
        rect(B.stone, f, Math.min(outer, inner), Math.max(outer, inner), gBase, Y(TOP), 0, SM);
        D.setColor(GRANITE); fbox(D, f, Math.min(outer, inner), Math.max(outer, inner), gBase, Y(0.3), -0.1, 0.04, 1);
      }
      // the pylon's end in the undercroft (it stands proud of the set-back wall)
      const oFoot = flare[k] ? -FOOT * (1 - UND / BEAM) : 0, oBot = flare[k] ? -FOOT : 0;
      B.stone.setColor(STONE_D);
      quad(B.stone, at(f, inner, Y(0), -rec), at(f, inner, Y(0), oBot), at(f, inner, Y(UND), oFoot), at(f, inner, Y(UND), -rec), [f.ux * dir, 0, f.uz * dir]);
      B.stone.setColor(STONE);
      B.orn.setColor('#ffffff'); orn(B.orn, f, Math.min(outer, inner) + 1.4, Math.max(outer, inner) - 1.4, Y(ATT - 3.6), Y(ATT + 0.4), 'lattice');
    }
    // middle: beam band and its soffit, office storeys round the windows, fluted attic, cornice
    rect(B.stone, f, m0, m1, Y(UND), Y(BEAM), 0, SM);
    B.stone.setColor(STONE_D); fbox(B.stone, f, m0, m1, Y(UND), Y(UND) + 0.01, -rec, 0, 32); B.stone.setColor(STONE);
    for (let i = 0; i < NB; i++) for (let j = 0; j < 3; j++) {
      const c = m0 + bw * i + bw * (j + 0.5) / 3;
      for (let k = 0; k < NF; k++) { f.holes.push(winQ(c - 0.85, c + 0.85, Y(BEAM + k * FH + 0.8), Y(BEAM + k * FH + 2.7))); nWin++; }
    }
    wall(B.stone, f, Y(BEAM), Y(ATT), SM);
    for (const q of f.holes) win(B, f, q);
    rect(B.flute, f, m0, m1, Y(ATT), Y(TOP), 0, [0.6, TOP - ATT], Y(ATT));
    D.setColor(STONE_D); fbox(D, f, -CORN, L + CORN, Y(TOP), Y(TOP + 0.75), 0, CORN, 1 | 4 | 8 | 16 | 32);
    // fins between the windows, big piers between the bays (down to the ground as free columns)
    B.stone.setColor(STONE_D);
    for (let i = 0; i < NB; i++) for (const j of [1, 2]) { const c = m0 + bw * i + bw * j / 3; fbox(B.stone, f, c - 0.17, c + 0.17, Y(BEAM), Y(ATT), 0, 0.3, 1 | 4 | 8 | 16 | 32, SM); }
    B.stone.setColor(STONE);
    for (let i = 0; i <= NB; i++) {
      const c = m0 + bw * i, w = i === 0 || i === NB ? 0.5 : 0.65;
      fbox(B.stone, f, c - w, c + w, Y(UND), Y(TOP), 0, 0.6, 1 | 4 | 8 | 32, SM);
      fbox(B.stone, f, c - w, c + w, Y(0), Y(UND), -0.7, 0.6, 1 | 2 | 4 | 8, SM);
      D.setColor(GRANITE); fbox(D, f, c - w - 0.05, c + w + 0.05, gBase, Y(0.45), -0.75, 0.65, 1 | 2 | 4 | 8 | 16);
      fsolid(S, f, c - w, c + w, -0.7, 0.6, gBase, Y(UND), 'wall');
    }
    // the set-back ground wall: the street side a stone lobby with tall glazing round the passage, the others two
    // rows of windows (the undercroft's two storeys)
    const [gx, , gz] = at(f, 0, 0, -rec), behind = (x, z) => (x - gx) * f.nx + (z - gz) * f.nz < 0;
    const g = edgeFace([gx, gz], at(f, L, 0, -rec).filter((_, q) => q !== 1), behind);
    const sA = m0, sB = m1, sc = (sA + sB) / 2, zc = at(g, sc, 0)[2];
    if (front) {
      g.holes.push({ s0: sc - PASS / 2, s1: sc + PASS / 2, y0: Y(-0.5), y1: Y(UND), pass: true });
      for (const d of [-1, 1]) {
        const c = sc + d * (PASS / 2 + 4.2);
        g.holes.push({ ...winQ(c - 2.4, c + 2.4, Y(0.05), Y(4.4)), cols: 4, rows: 2, rowAt: [0.6], lit: true, glass: '#5b5a50' });
        const e = sc + d * (PASS / 2 + 12.5);
        g.holes.push({ s0: e - 1.1, s1: e + 1.1, y0: Y(0.05), y1: Y(2.6), door: OAK, dep: 0.25, rev: GRANITE });
      }
    } else {
      for (let c = sA + 1.8; c < sB - 1.2; c += 3.1) for (const y of [0.95, 4.55]) g.holes.push(winQ(c - 0.7, c + 0.7, Y(y), Y(y + 1.6)));
    }
    wall(B.stone, g, Y(0), Y(UND), SM);
    D.setColor(GRANITE); for (const [a, c] of [[sA, sB]]) fbox(D, g, a, c, Y(-0.3), Y(0.35), 0, 0.05, 1 | 16);
    for (const q of g.holes) if (!q.pass) win(B, g, q); else {
      // the passage through the street wing into the courtyard: stone sides, a soffit with round lamps
      const d0 = -(HX0 - X0 - rec), away = (x, z) => Math.abs(z - zc) > PASS / 2;
      const pa = edgeFace(at(g, q.s0, 0).filter((_, k) => k !== 1), at(g, q.s0, 0, d0).filter((_, k) => k !== 1), away);
      const pb = edgeFace(at(g, q.s1, 0).filter((_, k) => k !== 1), at(g, q.s1, 0, d0).filter((_, k) => k !== 1), away);
      for (const p of [pa, pb]) { rect(B.stone, p, 0, p.L, Y(0), Y(UND), 0, SM); D.setColor(GRANITE); fbox(D, p, 0, p.L, Y(-0.3), Y(0.35), 0, 0.05, 1 | 16); }
      B.stone.setColor(STONE_D); quad(B.stone, at(g, q.s0, Y(UND)), at(g, q.s1, Y(UND)), at(g, q.s1, Y(UND), d0), at(g, q.s0, Y(UND), d0), [0, -1, 0]); B.stone.setColor(STONE);
      B.lit.setColor('#fff1d6');
      for (let o = -1.5; o > d0 + 1; o -= 3) for (const s of [q.s0 + 2, sc, q.s1 - 2]) { const p = at(g, s, Y(UND) - 0.03, o); B.lit.cyl(p[0], p[1] - 0.05, p[2], 0.28, 0.28, 0.05, 10); }
    }
    // collision of the set-back wall (the passage left open)
    const segs = front ? [[0, sc - PASS / 2], [sc + PASS / 2, L]] : [[0, L]];
    for (const [a, c] of segs) fsolid(S, f, a, c, -rec - 3, -rec, gBase, Y(UND), 'wall');
    // pylon feet / pylons and the upper block
    for (const [a, c] of [[0, EP], [L - EP, L]]) fsolid(S, f, a, c, -EP, 0, gBase, Y(UND), 'wall');
    const wing = f.nx < -0.9 ? HX0 - X0 : f.nx > 0.9 ? X1 - HX1 : f.nz < -0.9 ? HZ0 - Z0 : Z1 - HZ1;
    fsolid(S, f, 0, L, -wing, 0, Y(UND), Y(TOP + 0.75), 'wall', 1);
    const a0 = at(f, 0, 0, 0.3), a1 = at(f, L, 0, 0.3);
    Z.edge(a0[0], a0[2], a1[0], a1[2], Y(TOP + 0.75), f.nx, f.nz);
  }

  // ---- courtyard faces (the OSM courtyard's small bumps at the passage and the entrance are left out: the passage
  // keeps to the middle bay of the street front, the entrance block stands proud of the back wall)
  const cc = [[HX0, HZ0], [HX0, HZ1], [HX1, HZ1], [HX1, HZ0]];
  const cf = cc.map((a, i) => edgeFace(a, cc[(i + 1) % 4], (x, z) => !inCourt(x, z)));
  for (const f of cf) {
    const L = f.L;
    if (f.nx > 0.9) { const sp = (ZM - f.az) / f.uz; f.holes.push({ s0: sp - PASS / 2, s1: sp + PASS / 2, y0: Y(-1), y1: Y(UND) }); }
    if (f.nx < -0.9) { const se = (ZM - f.az) / f.uz; f.holes.push({ s0: se - 7.8, s1: se + 7.8, y0: Y(-1), y1: Y(11) }); }
    const n = Math.floor((L - 2.4) / 3.1), sp = (L - 2.4) / Math.max(1, n), big = f.holes.slice();
    const add = (q) => { if (!big.some((h) => q.s0 < h.s1 + 0.5 && q.s1 > h.s0 - 0.5 && q.y0 < h.y1 + 0.3)) { f.holes.push(q); nWin++; } };
    for (let i = 0; i < n; i++) {
      const c = 1.2 + sp * (i + 0.5);
      for (const y of [0.95, 4.55]) add(winQ(c - 0.75, c + 0.75, Y(y), Y(y + 1.8)));
      for (let k = 0; k < NF; k++) add(winQ(c - 0.75, c + 0.75, Y(BEAM + k * FH + 0.8), Y(BEAM + k * FH + 2.6)));
    }
    wall(B.stone, f, Y(0), Y(ATT), SM);
    for (const q of f.holes) if (q.frame) win(B, f, q);
    let sPrev = 0; // the ground storeys' collision, the passage mouth left open
    for (const h of [...big, { s0: L, s1: L }]) { if (h.s0 > sPrev) fsolid(S, f, sPrev, h.s0, -3, 0, gBase, Y(UND)); sPrev = h.s1; }
    rect(B.flute, f, 0, L, Y(ATT), Y(TOP), 0, [0.6, TOP - ATT], Y(ATT));
    D.setColor(STONE_D); fbox(D, f, 0, L, Y(TOP), Y(TOP + 0.5), 0, 0.35, 1 | 16 | 32);
    D.setColor(GRANITE); fbox(D, f, 0, L, Y(-0.3), Y(0.35), 0, 0.05, 1 | 16);
    if (L > 20) for (const s of [2.2, L - 2.2]) ornStrip(B.orn, f, s - 0.45, s + 0.45, Y(BEAM), Y(ATT - 0.4));
  }

  // ---- the entrance block at the back of the courtyard: chevron relief over a deep canopy on red granite piers
  {
    const EX = HX1, E0 = ZM - 7.7, E1 = ZM + 7.7, ED = 4.6, EH = 11;
    const ef = edgeFace([EX - ED, E1], [EX - ED, E0], (x) => x > EX - ED);
    rect(B.stone, ef, 0, ef.L, Y(4.6), Y(EH), 0, SM);
    B.orn.setColor('#ffffff'); orn(B.orn, ef, 0.6, ef.L - 0.6, Y(5.2), Y(EH - 0.6), 'chevron');
    for (const [s0, s1] of [[0, 0.01], [ef.L - 0.01, ef.L]]) fbox(B.stone, ef, s0, s1, Y(0), Y(EH), -ED, 0, 4 | 8, SM);
    D.setColor(STONE_D); fbox(D, ef, -0.2, ef.L + 0.2, Y(EH), Y(EH + 0.4), -ED, 0.3, 1 | 4 | 8 | 16 | 32);
    fbox(D, ef, -0.3, ef.L + 0.3, Y(3.9), Y(4.6), 0, 3.4, 1 | 4 | 8 | 16 | 32);                 // canopy slab
    fsolid(S, ef, -0.3, ef.L + 0.3, -0.1, 3.4, Y(3.9), Y(4.6), 'awning', 1);
    B.lit.setColor('#fff1d6'); for (let s = 1.5; s < ef.L; s += 3) { const p = at(ef, s, Y(3.88), 1.7); B.lit.cyl(p[0], p[1] - 0.04, p[2], 0.25, 0.25, 0.04, 10); }
    // the recessed lobby wall: red granite, oak doors in the middle, windows either side
    const lf = edgeFace(at(ef, 0, 0, -1.6).filter((_, k) => k !== 1), at(ef, ef.L, 0, -1.6).filter((_, k) => k !== 1), (x) => x > EX - ED + 1.6);
    const lc = lf.L / 2;
    lf.holes.push({ s0: lc - 2.8, s1: lc + 2.8, y0: Y(0.05), y1: Y(3.1), door: OAK, leaf: 2.4, frame: OAK, cols: 4, glass: '#6b5a44', lit: true, dep: 0.15, rev: RED_GR });
    for (const d of [-1, 1]) lf.holes.push(winQ(lc + d * 5.3 - 1.2, lc + d * 5.3 + 1.2, Y(0.9), Y(3.0), { rev: RED_GR }));
    D.setColor(RED_GR); wall(D, lf, Y(0), Y(3.9));
    for (const q of lf.holes) win(B, lf, q);
    D.setColor(RED_GR); for (const s of [0.4, lc - 3.5, lc + 3.5, lf.L - 0.4]) fbox(D, ef, s - 0.4, s + 0.4, Y(0), Y(3.9), -1.6, 0, 1 | 4 | 8);
    D.setColor(GRANITE); fbox(D, ef, 1, ef.L - 1, Y(-0.3), Y(0.15), 0, 3.0, 1 | 4 | 8 | 16);               // landing
    // planters either side of the steps
    for (const d of [-1, 1]) { const s = lc + d * 5.8; D.setColor('#8c7f76'); fbox(D, ef, s - 2.2, s + 2.2, Y(0), Y(0.9), 4.2, 5.6, 1 | 2 | 4 | 8 | 16); D.setColor('#6f8f4a'); fbox(D, ef, s - 2.1, s + 2.1, Y(0.9), Y(1.15), 4.3, 5.5, 16 | 1 | 2 | 4 | 8); }
    fsolid(S, ef, 0, ef.L, -1.6, 0, gBase, Y(EH), 'wall');
    fsolid(S, ef, 0, ef.L, 0, 0.01, Y(4.6), Y(EH), 'wall');
  }

  // ---- podium: the lot, the plaza on the street side and the courtyard, all at the floor; steps down to the street
  const PX0 = X0 - PLAZA;
  B.pave.setColor('#ffffff');
  quad(B.pave, [PX0, yF - 0.02, Z0 - 1], [X1 + 1, yF - 0.02, Z0 - 1], [X1 + 1, yF - 0.02, Z1 + 1], [PX0, yF - 0.02, Z1 + 1], UP,
    [[PX0 / 4, Z0 / 4], [X1 / 4, Z0 / 4], [X1 / 4, Z1 / 4], [PX0 / 4, Z1 / 4]].map(([u, v]) => [u - 50, v - 90]));
  const pf = [[[PX0, Z1 + 1], [PX0, Z0 - 1]], [[PX0, Z0 - 1], [X1 + 1, Z0 - 1]], [[X1 + 1, Z0 - 1], [X1 + 1, Z1 + 1]], [[X1 + 1, Z1 + 1], [PX0, Z1 + 1]]]
    .map(([a, c]) => edgeFace(a, c, (x, z) => x > PX0 && x < X1 + 1 && z > Z0 - 1 && z < Z1 + 1));
  D.setColor('#8f8b84'); for (const f of pf) rect(D, f, 0, f.L, gBase, yF - 0.02, 0);
  const sf = pf[0], stepsW = 26, s0 = sf.L / 2 - stepsW / 2;
  const gStreet = heightAt(PX0 - 1, ZM), nSt = Math.max(0, Math.round((yF - gStreet) / 0.16));
  D.setColor('#a19c94');
  for (let i = 0; i < nSt; i++) fbox(D, sf, s0, s0 + stepsW, gBase, yF - 0.02 - (i + 1) * (yF - gStreet) / (nSt + 1), 0, 0.38 * (i + 1), 1 | 4 | 8 | 16);
  D.setColor('#8a8d8e'); for (const s of [s0 - 0.3, s0 + stepsW + 0.3]) { const p = at(sf, s, yF, 0.4); D.cyl(p[0], yF, p[2], 0.04, 0.04, 1.0, 6); }
  S.prism([PX0, Z0 - 1, X1 + 1, Z0 - 1, X1 + 1, Z1 + 1, PX0, Z1 + 1], gBase, yF - 0.02, 0, 0, 'ground');

  // ---- meshes
  const M = {
    stone: new THREE.MeshStandardMaterial({ map: stoneTex(r), vertexColors: true, roughness: 0.85 }),
    flute: new THREE.MeshStandardMaterial({ map: fluteTex(), vertexColors: true, roughness: 0.85 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.35, envMapIntensity: 1.2 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffdcaa, emissiveIntensity: 0 }),
    orn: new THREE.MeshStandardMaterial({ map: ornTex(), vertexColors: true, alphaTest: 0.4, roughness: 0.9 }),
    pave: decal(new THREE.MeshStandardMaterial({ map: paveTex(r), vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 })),
  };
  const st = finish(root, 'podatkova', B, M, ['stone', 'det']);
  console.log(`[cherkasy] Podatkova (Khreshchatyk 235): ${nWin} windows, floor ${yF.toFixed(1)} m, ${(st.tris / 1000).toFixed(1)}k tris, ${st.meshes} meshes, ${(st.verts / 1000).toFixed(1)}k verts, ${(S.count ?? 0) - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    footprints: [{ poly: ringPts(b.p), h: Y(TOP + 0.75) - gBase, kind: b.k, name: b.name }],
    clear: (x, z) => x > PX0 - 3 && x < X1 + 3 && z > Z0 - 3 && z < Z1 + 3,
    update() { M.lit.emissiveIntensity = 1.2 * nightK.value; },
  };
}
