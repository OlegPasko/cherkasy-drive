// OWNER: cherkasy. The church of St Andrew the First-Called (ПЦУ, built 2002–2005 to Metropolitan Sofroniy's design),
// вулиця Героїв Дніпра 48 by the Mytnytsia roundabout, with its churchyard, rebuilt after the cherkasy.city gallery
// photos (2021) and the OSM lot. A cross-in-plan church in salmon brick banded with cream courses: cream quoins, a
// cream cornice, a stone plinth and, on every face, a window in the shape of a flared cross. The west and east arms
// carry keel-arched gables under a silver keel vault running through the crossing; the north and south arms are lower,
// with plain gables. Over the crossing a blue skirt, a small octagonal drum and a gilded onion with its cross. The
// west porch in yellow brick has an arched door between two arched windows under a gilded keel canopy. At the south
// corner of the lot stands the gate belfry in orange brick: an arched passage, a storey with a red awning, the belfry
// with arched openings and a gilded onion. An orange-brick fence on a fieldstone plinth with cream stone pillars and a
// stepped top runs round the lot, with a brick arch gate on the west path (the OSM `roof`) and gaps where the paths
// cross it. Columnar thujas line the paths and a few blue spruces stand in the yard (tree spots).
//   ANDRIY_SKIP: the OSM ids replaced here (church, belfry, gate roof)
//   buildAndriy({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), spots, footprints } | null
// The church sits in its own frame: a along true east (the altar), b across; local (a, b) -> map (x, z) through W().
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { PARK_PINE } from '../trees.js';
import { canvasTex } from './sculpt.js';
import { FRAME_OF } from './frame.js';
import { ringPts, rng, inPoly, centroid } from './geo.js';
import { edgeFace, at, quad, rect, fbox, fsolid, finish } from './blockkit.js';

const CHURCH = 159326530, BELFRY = 971415032, GATE = 971415031;
export const ANDRIY_SKIP = new Set([CHURCH, BELFRY, GATE]);
// the churchyard (OSM landuse=religious, barrier=fence, way 401414172), map x / z
const LOT = [[705.5, 1716.5], [660.3, 1712.1], [655.4, 1711.6], [649.8, 1713.6], [644.7, 1759.2], [638.3, 1813], [638, 1815.2],
  [654.7, 1827.5], [659.1, 1830.6], [698.3, 1791.4], [705.1, 1785.5], [712.2, 1725.1]];
const CEN = [668.6, 1788.4]; // the crossing (the middle of the OSM cross, on the axis of the west path)
const HW = 4.5, ARM_EW = 11, ARM_NS = 10.5; // arm half-width, arm reach east-west and north-south
const EAVE = 9, KEEL = 15.5, RIDGE = 12.5; // above the floor: eaves, keel gable top, side gable ridge
const SALMON = '#e4a487', CREAM = '#efe0b8', YELLOW = '#e7c47c', ORANGE = '#d9652f', STONE = '#7d7166', SILVER = '#c9ccce';
const GOLD = '#ffffff', BLUE = '#2f62b0', RED = '#a8342a', WOOD = '#5a3a22';

// ------------------------------------------------------------------------------------------------ textures
const shade = (c, k) => `rgb(${c.map((v) => Math.min(255, Math.round(v * k))).join(',')})`;
// brick courses, 8 bricks x 24 courses over 2.0 x 1.8 m; band(j) -> base colour per course (the church's cream bands)
const brickTex = (r, band, mortar) => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = mortar; g.fillRect(0, 0, w, h);
  const bw = w / 8, bh = h / 24;
  for (let j = 0; j < 24; j++) for (let i = -1; i < 8; i++) {
    const u = r(), k = u < 0.08 ? 0.84 : u > 0.93 ? 1.1 : 0.94 + r() * 0.1;
    g.fillStyle = shade(band(j), k);
    g.fillRect(i * bw + (j & 1 ? bw / 2 : 0) + 1.5, j * bh + 1.5, bw - 3, bh - 3);
  }
  for (let q = 0; q < 1200; q++) { g.fillStyle = r() < 0.5 ? 'rgba(255,248,235,0.07)' : 'rgba(40,20,10,0.07)'; g.fillRect(r() * w, r() * h, 2 + r() * 3, 1 + r() * 2); }
});
// silver standing-seam sheet, a seam every 0.5 m
const seamTex = () => canvasTex(128, 64, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, 0, 3, h); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(x + 3, 0, 2, h); }
});
// split fieldstone for the fence plinth
const stoneTex = (r) => canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#3c3631'; g.fillRect(0, 0, w, h);
  for (let q = 0; q < 70; q++) {
    const x = r() * w, y = r() * h, rx = 10 + r() * 16, ry = 7 + r() * 9, k = 0.7 + r() * 0.5;
    g.fillStyle = shade([150, 138, 126], k); g.beginPath(); g.ellipse(x, y, rx, ry, r() * 3, 0, 7); g.fill();
    if (x < 30) { g.beginPath(); g.ellipse(x + w, y, rx, ry, 0, 0, 7); g.fill(); }
  }
});

// ------------------------------------------------------------------------------------------------ shapes
// keel arch: 1 at the middle, 0 at the springing, round shoulders and a slight point (u = |offset| / half-span)
const keel = (u) => 0.82 * Math.sqrt(Math.max(0, 1 - u * u)) + 0.18 * (1 - u);
// a flat polygon [[s, y], ...] on a face at offset o, fanned from its first point (convex or star-shaped from it)
function poly(D, f, P, o) {
  const ids = P.map(([s, y]) => { const p = at(f, s, y, o); return D.vert(p[0], p[1], p[2], f.nx, 0, f.nz, s, y); });
  const [a, b, c] = P, flip = ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 0;
  // counter-clockwise in (s, y) faces -U x Y; turn it to face along N
  const ccwN = f.ux * f.nz - f.uz * f.nx > 0;
  for (let i = 1; i + 1 < ids.length; i++) (flip !== ccwN) ? D.tri(ids[0], ids[i], ids[i + 1]) : D.tri(ids[0], ids[i + 1], ids[i]);
}
// a flared (pattée) cross centred at (s, y), arm reach R, the centre first so the fan stays inside
const patee = (s, y, R) => {
  const w0 = 0.17 * R, w1 = 0.36 * R, P = [[s, y]];
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    const px = -dy, py = dx; // across the arm
    P.push([s + dx * w0 - px * w0, y + dy * w0 - py * w0], [s + dx * R - px * w1, y + dy * R - py * w1], [s + dx * R + px * w1, y + dy * R + py * w1]);
  }
  P.push(P[1]);
  return P;
};
// round-headed opening outline (s centre, y0 bottom, y1 top of the arch, width w), centre-first for the fan
const arched = (s, y0, y1, w) => {
  const r = w / 2, ys = y1 - r, P = [[s, (y0 + ys) / 2], [s + r, y0], [s + r, ys]];
  for (let k = 1; k < 10; k++) { const t = k / 10 * Math.PI; P.push([s + r * Math.cos(t), ys + r * Math.sin(t)]); }
  P.push([s - r, ys], [s - r, y0], [s + r, y0]);
  return P;
};
// onion dome profile [[r, y], ...] bottom -> top
const onion = (R, y0, H, n = 14) => {
  const out = [[0.72 * R, y0]];
  for (let i = 1; i <= n; i++) {
    const t = i / n, k = t < 0.32 ? 0.8 + 0.3 * Math.sin(Math.PI / 2 * t / 0.32) : 1.1 * Math.cos(Math.PI / 2 * (t - 0.32) / 0.68) ** 1.6;
    out.push([Math.max(0.03, k * R), y0 + H * t]);
  }
  return out;
};
// three-bar orthodox cross on a ball, bars across the local axis (ux, uz)
function oCross(G, x, y0, z, h, ux, uz) {
  const t = Math.max(0.07, h * 0.035), arm = (yc, half, th) => G.tube([x - ux * half, yc, z - uz * half], [x + ux * half, yc, z + uz * half], th, 4, true);
  G.cyl(x, y0 - 0.1, z, t * 2.4, t * 2.4, 0.3, 8, true);
  G.tube([x, y0, z], [x, y0 + h, z], t, 4, true);
  arm(y0 + h * 0.68, h * 0.25, t * 0.9); arm(y0 + h * 0.86, h * 0.13, t * 0.8);
  G.tube([x - ux * h * 0.15, y0 + h * 0.28, z - uz * h * 0.15], [x + ux * h * 0.15, y0 + h * 0.4, z + uz * h * 0.15], t * 0.8, 4, true);
}

// ------------------------------------------------------------------------------------------------ build
export function buildAndriy({ root, map, solids: S, zips: Z, heightAt }) {
  const church = map.buildings.find((q) => q.id === CHURCH);
  if (!church) return null;
  const t0 = performance.now(), r = rng(CHURCH % 99991), n0 = S.count ?? 0;
  const B = { wall: new MB(), brick: new MB(), det: new MB(), roof: new MB(), gold: new MB(), glass: new MB(), lit: new MB(), stone: new MB() };
  const D = B.det, BM = [2.0, 1.8];
  const nth = FRAME_OF(map).north, E = [-nth[1], nth[0]], N = [-E[1], E[0]]; // true east, and the b axis
  const W = (a, b) => [CEN[0] + a * E[0] + b * N[0], CEN[1] + a * E[1] + b * N[1]];
  const gAt = (P) => P.map(([x, z]) => heightAt(x, z));

  // ---- the church: the cross in plan, walls, quoins, cornice, plinth, a cross window on every face
  const XL = [[-ARM_EW, -HW], [-HW, -HW], [-HW, -ARM_NS], [HW, -ARM_NS], [HW, -HW], [ARM_EW, -HW], [ARM_EW, HW], [HW, HW], [HW, ARM_NS], [-HW, ARM_NS], [-HW, HW], [-ARM_EW, HW]];
  const ring = XL.map(([a, b]) => W(a, b)), inChurch = (x, z) => inPoly(ring, x, z);
  const gs = gAt([...ring, W(-14.5, 0), W(0, 0)]), g0 = Math.min(...gs), yF = Math.max(...gs) + 0.45;
  const yE = yF + EAVE, yK = yF + KEEL, yR = yF + RIDGE;
  let nWin = 0;
  XL.forEach((p, i) => {
    const q = XL[(i + 1) % XL.length], f = edgeFace(W(...p), W(...q), inChurch), L = f.L;
    const end = L > 8; // an arm end (9 m) or an arm side (6.5 / 6 m)
    const west = end && p[0] === -ARM_EW && q[0] === -ARM_EW, eastEnd = end && p[0] === ARM_EW && q[0] === ARM_EW;
    B.wall.setColor('#ffffff'); rect(B.wall, f, 0, L, yF, yE, 0, BM, yF);
    D.setColor(STONE); fbox(D, f, -0.12, L + 0.12, g0 - 0.6, yF, 0, 0.14, 1 | 4 | 8 | 16);
    D.setColor(CREAM);
    fbox(D, f, 0, 0.5, yF, yE - 0.4, 0, 0.07, 1 | 8); fbox(D, f, L - 0.5, L, yF, yE - 0.4, 0, 0.07, 1 | 4);
    fbox(D, f, -0.25, L + 0.25, yE - 0.45, yE, 0, 0.28, 1 | 4 | 8 | 32);
    // gables: keel over the west / east ends, a plain triangle over the north / south ends
    if (end) {
      const keelEnd = west || eastEnd, top = keelEnd ? yK : yR, n = 16, P = [];
      for (let k = 0; k <= n; k++) { const s = L * k / n, u = Math.abs(2 * k / n - 1); P.push([s, yE + (top - yE) * (keelEnd ? keel(u) : 1 - u)]); }
      B.wall.setColor('#ffffff');
      for (let k = 0; k < n; k++) quad(B.wall, at(f, P[k][0], yE), at(f, P[k + 1][0], yE), at(f, P[k + 1][0], P[k + 1][1]), at(f, P[k][0], P[k][1]), f.N,
        [[P[k][0] / BM[0], (yE - yF) / BM[1]], [P[k + 1][0] / BM[0], (yE - yF) / BM[1]], [P[k + 1][0] / BM[0], (P[k + 1][1] - yF) / BM[1]], [P[k][0] / BM[0], (P[k][1] - yF) / BM[1]]]);
      D.setColor(CREAM); // the trim under the roof edge, following the gable
      for (let k = 0; k < n; k++) quad(D, at(f, P[k][0], P[k][1] - 0.4, 0.08), at(f, P[k + 1][0], P[k + 1][1] - 0.4, 0.08), at(f, P[k + 1][0], P[k + 1][1], 0.08), at(f, P[k][0], P[k][1], 0.08), f.N);
      if (keelEnd) { // a small arched window high in the keel
        D.setColor(CREAM); poly(D, f, arched(L / 2, yE + 1.6, yE + 4.0, 1.25), 0.05);
        B.lit.setColor('#3a4a5e'); poly(B.lit, f, arched(L / 2, yE + 1.8, yE + 3.8, 0.85), 0.08);
      }
    }
    // the flared-cross window: big on the arm ends (over the porch on the west), smaller on the sides
    const R = west ? 1.3 : end ? 1.65 : 1.25, yc = west ? yF + 7.3 : end ? yF + 5.2 : yF + 4.6;
    D.setColor(CREAM); poly(D, f, patee(L / 2, yc, R + 0.28), 0.04);
    B.lit.setColor('#46607e'); poly(B.lit, f, patee(L / 2, yc, R), 0.07);
    D.setColor('#d8c79c'); fbox(D, f, L / 2 - 0.05, L / 2 + 0.05, yc - R * 0.95, yc + R * 0.95, 0.07, 0.1, 1); fbox(D, f, L / 2 - R * 0.95, L / 2 + R * 0.95, yc - 0.05, yc + 0.05, 0.07, 0.1, 1);
    nWin++;
  });
  // roofs: the keel vault east-west through the crossing, the gabled north and south arms; collision in steps
  {
    const n = 16, ov = 0.45, prof = [];
    for (let k = 0; k <= n; k++) { const v = -1 + 2 * k / n; prof.push([v * (HW + ov), yE - 0.25 + (yK + 0.25 - yE) * keel(Math.abs(v))]); }
    B.roof.setColor(SILVER);
    let c = 0;
    for (let k = 0; k < n; k++) {
      const [b0, y0] = prof[k], [b1, y1] = prof[k + 1], db = b1 - b0, dy = y1 - y0, l = Math.hypot(db, dy), nb = -dy / l, ny = db / l;
      const NN = [N[0] * nb, ny, N[1] * nb], A = -ARM_EW - ov, Bq = ARM_EW + ov;
      const pt = (a, b, y) => { const [x, z] = W(a, b); return [x, y, z]; };
      quad(B.roof, pt(A, b0, y0), pt(Bq, b0, y0), pt(Bq, b1, y1), pt(A, b1, y1), NN, [[A / 2, c / 2], [Bq / 2, c / 2], [Bq / 2, (c + l) / 2], [A / 2, (c + l) / 2]]);
      c += l;
    }
    for (const sgn of [-1, 1]) { // north / south: two slopes from the ridge at a = 0, b from 0 to the gable
      const b0 = 0, b1 = sgn * (ARM_NS + ov);
      for (const side of [-1, 1]) {
        const ae = side * (HW + ov), run = HW + ov, rise = yR + 0.25 - (yE - 0.25), l = Math.hypot(run, rise);
        const NN = [E[0] * side * rise / l, run / l, E[1] * side * rise / l];
        const pt = (a, b, y) => { const [x, z] = W(a, b); return [x, y, z]; };
        quad(B.roof, pt(0, b0, yR + 0.25), pt(0, b1, yR + 0.25), pt(ae, b1, yE - 0.25), pt(ae, b0, yE - 0.25), NN, [[0, 0], [(ARM_NS + ov) / 2, 0], [(ARM_NS + ov) / 2, l / 2], [0, l / 2]]);
      }
    }
    B.roof.setColor('#9aa0a4'); // ridge caps
    B.roof.tube([...((p) => [p[0], yR + 0.3, p[1]])(W(0, -ARM_NS - ov))], [...((p) => [p[0], yR + 0.3, p[1]])(W(0, ARM_NS + ov))], 0.12, 5, true);
    const box = (a0, b0, a1, b1, y0, y1, kind = 'wall') => S.prism([W(a0, b0), W(a1, b0), W(a1, b1), W(a0, b1)].flat(), y0, y1, 0, 0, kind);
    box(-ARM_EW, -HW, ARM_EW, HW, g0 - 0.5, yE); box(-HW, -ARM_NS, HW, ARM_NS, g0 - 0.5, yE);
    for (const [h, t] of [[0.95, 0.35], [0.75, 0.62], [0.5, 0.85]]) box(-ARM_EW, -HW * h, ARM_EW, HW * h, yE, yE + (yK - yE) * t, 'roof');
    for (const [h, t] of [[0.75, 0.25], [0.4, 0.62]]) box(-HW * h, -ARM_NS, HW * h, ARM_NS, yE, yE + (yR - yE) * t + 0.3, 'roof');
    for (const sgn of [-1, 1]) { const [x0, z0] = W(-HW, sgn * ARM_NS), [x1, z1] = W(HW, sgn * ARM_NS); Z.edge(x0, z0, x1, z1, yE, N[0] * sgn, N[1] * sgn); }
  }
  // the drum over the crossing: blue skirt, octagonal drum with arched windows, cornice, gilded onion, cross
  {
    const [x, z] = W(0, 0), y0 = yK - 2.4, yD = yK + 0.4, yT = yD + 3.6, R = 2.0;
    B.roof.setColor(BLUE); B.roof.cyl(x, y0, z, 3.1, 2.15, yD - y0, 8, false);
    for (let k = 0; k < 8; k++) {
      const t0 = (k + 0.5) / 8 * 2 * Math.PI, t1 = (k + 1.5) / 8 * 2 * Math.PI;
      const f = edgeFace([x + R * Math.cos(t0), z + R * Math.sin(t0)], [x + R * Math.cos(t1), z + R * Math.sin(t1)], (px, pz) => Math.hypot(px - x, pz - z) < R * 0.8);
      B.wall.setColor('#ffffff'); rect(B.wall, f, 0, f.L, yD, yT, 0, BM, yF);
      if (k % 2 === 0) { D.setColor(CREAM); poly(D, f, arched(f.L / 2, yD + 0.7, yT - 0.6, 0.85), 0.03); B.lit.setColor('#3a4a5e'); poly(B.lit, f, arched(f.L / 2, yD + 0.85, yT - 0.75, 0.55), 0.06); }
      D.setColor(CREAM); fbox(D, f, -0.1, f.L + 0.1, yT - 0.35, yT, 0, 0.22, 1 | 16 | 32);
    }
    B.gold.setColor(GOLD); B.gold.cyl(x, yT, z, 2.15, 1.75, 0.35, 16, false);
    const prof = onion(2.35, yT + 0.3, 4.4);
    B.gold.lathe(prof, 24, x, z);
    const top = yT + 0.3 + 4.4;
    oCross(B.gold, x, top, z, 2.6, N[0], N[1]);
    S.cyl(x, z, yE, yT, 2.3, 2.0, 'roof'); S.cyl(x, z, yT, top, 2.5, 0.3, 'roof');
    Z.add(x, top + 2.6, z, 0, 1, 0, 'antenna');
    // small crosses on the other three gable tops
    for (const [a, b, h] of [[ARM_EW + 0.3, 0, yK + 0.2], [0, ARM_NS + 0.3, yR + 0.25], [0, -ARM_NS - 0.3, yR + 0.25]]) { const [cx, cz] = W(a, b); oCross(B.gold, cx, h, cz, 1.3, N[0], N[1]); }
  }
  // the west porch: yellow brick, arched door between arched windows, gilded keel canopy, steps
  {
    const a0 = -ARM_EW - 2.7, a1 = -ARM_EW, hb = 2.7, yP = yF + 3.9, yC = yF + 5.8;
    const PR = [[a0, -hb], [a1, -hb], [a1, hb], [a0, hb]].map(([a, b]) => W(a, b)), inP = (x, z) => inPoly(PR, x, z);
    for (const [i, j] of [[3, 0], [0, 1], [2, 3]]) { // the front (a0) and the two sides
      const f = edgeFace(PR[i], PR[j], inP), L = f.L, front = i === 3;
      B.brick.setColor(YELLOW); rect(B.brick, f, 0, L, yF, yP, 0, BM, yF);
      D.setColor(STONE); fbox(D, f, -0.1, L + 0.1, g0 - 0.6, yF, 0, 0.12, 1 | 4 | 8 | 16);
      D.setColor('#f3e6c4'); fbox(D, f, -0.15, L + 0.15, yP - 0.3, yP, 0, 0.2, 1 | 4 | 8 | 32);
      if (front) {
        D.setColor('#f3e6c4'); poly(D, f, arched(L / 2, yF, yF + 3.3, 2.1), 0.03);
        D.setColor(WOOD); poly(D, f, arched(L / 2, yF, yF + 3.05, 1.6), 0.06);
        B.lit.setColor('#c9a45e'); poly(B.lit, f, arched(L / 2, yF + 2.3, yF + 3.0, 1.2), 0.08);
        for (const s of [0.75, L - 0.75]) { B.glass.setColor('#26313c'); poly(B.glass, f, arched(s, yF + 1.0, yF + 3.0, 0.55), 0.05); }
        // the keel gable over the door in yellow brick with a gilded edge
        const n = 12, P = [];
        for (let k = 0; k <= n; k++) { const s = L * k / n; P.push([s, yP + (yC - yP) * keel(Math.abs(2 * k / n - 1))]); }
        B.brick.setColor(YELLOW); for (let k = 0; k < n; k++) quad(B.brick, at(f, P[k][0], yP), at(f, P[k + 1][0], yP), at(f, P[k + 1][0], P[k + 1][1]), at(f, P[k][0], P[k][1]), f.N);
        const icon = arched(L / 2, yP + 0.25, yP + 1.6, 0.8); D.setColor('#3d5a8a'); poly(D, f, icon, 0.05);
      } else { B.glass.setColor('#26313c'); poly(B.glass, f, arched(L / 2, yF + 1.0, yF + 3.0, 0.6), 0.05); }
    }
    // gilded keel canopy over the porch, a little proud of the walls
    const n = 12, ov = 0.35, prof = [];
    for (let k = 0; k <= n; k++) { const v = -1 + 2 * k / n; prof.push([v * (hb + ov), yP - 0.1 + (yC + 0.25 - yP) * keel(Math.abs(v))]); }
    B.gold.setColor('#f2d27a');
    for (let k = 0; k < n; k++) {
      const [b0, y0] = prof[k], [b1, y1] = prof[k + 1], l = Math.hypot(b1 - b0, y1 - y0), nb = -(y1 - y0) / l, ny = (b1 - b0) / l;
      const pt = (a, b, y) => { const [x, z] = W(a, b); return [x, y, z]; };
      quad(B.gold, pt(a0 - ov, b0, y0), pt(a1, b0, y0), pt(a1, b1, y1), pt(a0 - ov, b1, y1), [N[0] * nb, ny, N[1] * nb]);
    }
    { const [x, z] = W(a0 - 0.1, 0); oCross(B.gold, x, yC + 0.2, z, 1.1, N[0], N[1]); }
    S.prism(PR.flat(), g0 - 0.5, yC, 0, 0, 'wall');
    // the landing and three steps down to the path
    const st = edgeFace(PR[3], PR[0], inP), nSt = Math.max(1, Math.round((yF - heightAt(...W(a0 - 2, 0))) / 0.16));
    D.setColor('#b9aca0');
    for (let k = 0; k <= nSt; k++) fbox(D, st, -0.6 - k * 0.15, st.L + 0.6 + k * 0.15, g0 - 0.5, yF - k * (yF - g0) / (nSt + 1), 0, 1.4 + 0.35 * k, 1 | 4 | 8 | 16);
    fsolid(S, st, -0.6, st.L + 0.6, 0, 1.4 + 0.35 * nSt, g0 - 0.5, yF - (yF - g0) / (nSt + 1), 'steps');
    B.lit.setColor('#fff0cc'); { const [x, z] = W(a0 - 0.15, 0); B.lit.cyl(x, yP - 0.6, z, 0.18, 0.18, 0.3, 8, true); } // the lamp over the door
  }

  // ---- the gate belfry at the south corner: passage, gallery storey, belfry, gilded onion
  const bel = map.buildings.find((q) => q.id === BELFRY), belP = bel ? ringPts(bel.p) : [[657.5, 1824.5], [661.3, 1827.7], [659.1, 1830.3], [655.3, 1827.1]];
  {
    const inB = (x, z) => inPoly(belP, x, z), fs = belP.map((p, i) => edgeFace(p, belP[(i + 1) % 4], inB));
    const long = fs[0].L >= fs[1].L ? [0, 2] : [1, 3], dep = fs[long[0] === 0 ? 1 : 0].L;
    const gb = Math.min(...gAt(belP)) - 0.4, yB = Math.max(...gAt(belP)), y1 = yB + 5.6, y2 = yB + 9.0, y3 = yB + 12.6;
    const pw = 1.3, ps = yB + 2.6; // passage half-width, arch springing
    fs.forEach((f, i) => {
      const L = f.L, lng = long.includes(i);
      B.brick.setColor(ORANGE);
      if (lng) { // the wall round the arched passage: piers, spandrels above the arch
        const sc = L / 2;
        rect(B.brick, f, 0, sc - pw, gb, y1, 0, BM, yB); rect(B.brick, f, sc + pw, L, gb, y1, 0, BM, yB); rect(B.brick, f, sc - pw, sc + pw, ps + pw + 0.5, y1, 0, BM, yB);
        for (let k = 0; k < 10; k++) {
          const t0 = Math.PI * k / 10, t1 = Math.PI * (k + 1) / 10, s0 = sc + pw * Math.cos(t0), s1 = sc + pw * Math.cos(t1);
          quad(B.brick, at(f, s0, ps + pw * Math.sin(t0)), at(f, s1, ps + pw * Math.sin(t1)), at(f, s1, ps + pw + 0.5), at(f, s0, ps + pw + 0.5), f.N);
        }
        D.setColor(CREAM); for (let k = 0; k < 10; k++) { // the arch ring
          const t0 = Math.PI * k / 10, t1 = Math.PI * (k + 1) / 10, c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
          quad(D, at(f, sc + pw * c0, ps + pw * s0, 0.05), at(f, sc + pw * c1, ps + pw * s1, 0.05), at(f, sc + (pw + 0.3) * c1, ps + (pw + 0.3) * s1, 0.05), at(f, sc + (pw + 0.3) * c0, ps + (pw + 0.3) * s0, 0.05), f.N);
        }
      } else rect(B.brick, f, 0, L, gb, y1, 0, BM, yB);
      // gallery storey: windows, and the red awning on the long faces
      B.brick.setColor(ORANGE); rect(B.brick, f, 0, L, y1, y3, 0, BM, yB);
      D.setColor(CREAM); fbox(D, f, -0.15, L + 0.15, y1 - 0.25, y1 + 0.1, 0, 0.2, 1 | 4 | 8 | 16 | 32); fbox(D, f, -0.25, L + 0.25, y3 - 0.1, y3 + 0.35, 0, 0.32, 1 | 4 | 8 | 16 | 32);
      fbox(D, f, -0.05, 0.4, gb, y3, 0, 0.06, 1 | 8); fbox(D, f, L - 0.4, L + 0.05, gb, y3, 0, 0.06, 1 | 4);
      const nw = lng ? 2 : 1;
      for (let k = 0; k < nw; k++) {
        const s = L * (k + 0.5) / nw;
        B.glass.setColor('#24303a'); poly(B.glass, f, arched(s, y1 + 0.8, y1 + 2.9, 0.8), 0.04);
        D.setColor('#16110e'); poly(D, f, arched(s, y2 + 0.5, y3 - 0.5, lng ? 0.95 : 1.1), 0.04); // belfry openings
        D.setColor(CREAM); fbox(D, f, s - 0.6, s + 0.6, y2 + 0.35, y2 + 0.5, 0, 0.12, 1 | 16);
      }
      if (lng) { D.setColor(RED); fbox(D, f, -0.2, L + 0.2, y1 + 3.05, y1 + 3.2, 0, 1.1, 1 | 4 | 8 | 16 | 32); }
    });
    const [cx, cz] = centroid(belP);
    D.setColor('#5d3a2a'); D.cyl(cx, y3 + 0.35, cz, 2.1, 1.15, 0.9, 8, false);
    B.brick.setColor(ORANGE); B.brick.cyl(cx, y3 + 1.0, cz, 1.15, 1.15, 1.5, 8, false);
    D.setColor(CREAM); D.cyl(cx, y3 + 2.5, cz, 1.3, 1.3, 0.2, 8, true);
    B.gold.setColor(GOLD); B.gold.lathe(onion(1.5, y3 + 2.65, 2.9), 18, cx, cz);
    const ft = fs[long[0]];
    oCross(B.gold, cx, y3 + 5.5, cz, 1.6, ft.ux, ft.uz);
    Z.add(cx, y3 + 7.1, cz, 0, 1, 0, 'antenna');
    // collision: the two piers, the mass above the passage, the dome
    const f0 = fs[long[0]], sc = f0.L / 2;
    fsolid(S, f0, 0, sc - pw, -dep, 0, gb, y3 + 0.35, 'wall'); fsolid(S, f0, sc + pw, f0.L, -dep, 0, gb, y3 + 0.35, 'wall');
    fsolid(S, f0, sc - pw, sc + pw, -dep, 0, ps + pw * 0.7, y3 + 0.35, 'wall');
    S.cyl(cx, cz, y3 + 0.35, y3 + 2.6, 1.6, 1.15, 'roof'); S.cyl(cx, cz, y3 + 2.6, y3 + 5.5, 1.5, 0.2, 'roof');
    // the soffit and the jambs of the passage
    D.setColor('#c4552a');
    for (const s of [sc - pw, sc + pw]) quad(D, at(f0, s, gb), at(f0, s, gb, -dep), at(f0, s, ps, -dep), at(f0, s, ps), s < sc ? f0.U : [-f0.U[0], 0, -f0.U[2]]);
    for (let k = 0; k < 10; k++) {
      const t0 = Math.PI * k / 10, t1 = Math.PI * (k + 1) / 10, p0 = [sc + pw * Math.cos(t0), ps + pw * Math.sin(t0)], p1 = [sc + pw * Math.cos(t1), ps + pw * Math.sin(t1)];
      const tm = (t0 + t1) / 2, nn = [-Math.cos(tm) * f0.ux, -Math.sin(tm), -Math.cos(tm) * f0.uz];
      quad(D, at(f0, p0[0], p0[1]), at(f0, p1[0], p1[1]), at(f0, p1[0], p1[1], -dep), at(f0, p0[0], p0[1], -dep), nn);
    }
    B.lit.setColor('#fff0cc'); { const p = at(f0, sc, ps + pw - 0.15, -dep / 2); B.lit.cyl(p[0], p[1] - 0.2, p[2], 0.16, 0.16, 0.25, 8, true); }
  }

  // ---- the west gate on the path from the cycleway: brick piers, an arch, a small silver gable roof
  const gate = map.buildings.find((q) => q.id === GATE), gC = gate ? centroid(ringPts(gate.p)) : [645.3, 1759.6];
  const lotEdges = LOT.map((p, i) => [p, LOT[(i + 1) % LOT.length]]);
  const segDist = (px, pz, [ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
  let gateAt;
  {
    const [p, q] = lotEdges.reduce((m, e) => (segDist(gC[0], gC[1], ...e) < segDist(gC[0], gC[1], ...m) ? e : m));
    const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
    const t = (gC[0] - p[0]) * ux + (gC[1] - p[1]) * uz, cx = p[0] + ux * t, cz = p[1] + uz * t, HL = 2.6, th = 0.45;
    const f = edgeFace([cx - ux * HL, cz - uz * HL], [cx + ux * HL, cz + uz * HL], (x, z) => inPoly(LOT, x, z));
    const gH = (s) => { const [x, , z] = at(f, s, 0); return heightAt(x, z); }, gb = Math.min(gH(0), gH(f.L / 2), gH(f.L)) - 0.3;
    const yG = heightAt(cx, cz), ys = yG + 2.5, pw = 1.4, sc = f.L / 2, yT = yG + 4.3;
    for (const oo of [th, -th]) {
      const NF = oo > 0 ? f.N : [-f.nx, 0, -f.nz];
      B.brick.setColor(ORANGE);
      const R = (s0, s1, y0, y1) => quad(B.brick, at(f, s0, y0, oo), at(f, s1, y0, oo), at(f, s1, y1, oo), at(f, s0, y1, oo), NF, [[s0 / 2, (y0 - yG) / 1.8], [s1 / 2, (y0 - yG) / 1.8], [s1 / 2, (y1 - yG) / 1.8], [s0 / 2, (y1 - yG) / 1.8]]);
      R(0, sc - pw, gb, yT); R(sc + pw, f.L, gb, yT); R(sc - pw, sc + pw, ys + pw, yT);
      for (let k = 0; k < 10; k++) {
        const t0 = Math.PI * k / 10, t1 = Math.PI * (k + 1) / 10;
        quad(B.brick, at(f, sc + pw * Math.cos(t0), ys + pw * Math.sin(t0), oo), at(f, sc + pw * Math.cos(t1), ys + pw * Math.sin(t1), oo), at(f, sc + pw * Math.cos(t1), ys + pw, oo), at(f, sc + pw * Math.cos(t0), ys + pw, oo), NF);
      }
    }
    D.setColor(STONE); fbox(D, f, -0.06, sc - pw, gb, yG + 0.5, -th - 0.06, th + 0.06, 1 | 2 | 4 | 8 | 16); fbox(D, f, sc + pw, f.L + 0.06, gb, yG + 0.5, -th - 0.06, th + 0.06, 1 | 2 | 4 | 8 | 16);
    B.brick.setColor(ORANGE);
    for (const [s0, s1] of [[0, 0], [f.L, f.L]]) quad(B.brick, at(f, s0, gb, -th), at(f, s1, gb, th), at(f, s1, yT, th), at(f, s0, yT, -th), s0 ? f.U : [-f.U[0], 0, -f.U[2]]);
    D.setColor('#c4552a');
    for (const s of [sc - pw, sc + pw]) quad(D, at(f, s, gb, th), at(f, s, gb, -th), at(f, s, ys, -th), at(f, s, ys, th), s < sc ? f.U : [-f.U[0], 0, -f.U[2]]);
    for (let k = 0; k < 10; k++) {
      const t0 = Math.PI * k / 10, t1 = Math.PI * (k + 1) / 10, tm = (t0 + t1) / 2;
      quad(D, at(f, sc + pw * Math.cos(t0), ys + pw * Math.sin(t0), th), at(f, sc + pw * Math.cos(t1), ys + pw * Math.sin(t1), th), at(f, sc + pw * Math.cos(t1), ys + pw * Math.sin(t1), -th), at(f, sc + pw * Math.cos(t0), ys + pw * Math.sin(t0), -th), [-Math.cos(tm) * f.ux, -Math.sin(tm), -Math.cos(tm) * f.uz]);
    }
    // the gable roof along the gate, the ridge across the fence line
    const ro = th + 0.55, rh = 1.1;
    B.roof.setColor('#a33c2e');
    for (const sgn of [-1, 1]) {
      const l2 = Math.hypot(ro, rh), NN = [f.nx * sgn * rh / l2, ro / l2, f.nz * sgn * rh / l2];
      quad(B.roof, at(f, -0.35, yT + rh, 0), at(f, f.L + 0.35, yT + rh, 0), at(f, f.L + 0.35, yT - 0.05, sgn * ro), at(f, -0.35, yT - 0.05, sgn * ro), NN, [[0, 0], [f.L / 2, 0], [f.L / 2, l2 / 2], [0, l2 / 2]]);
    }
    B.brick.setColor(ORANGE); // the gable ends under the roof
    for (const s of [0, f.L]) B.brick.face([at(f, s, yT, -th), at(f, s, yT, th), at(f, s, yT + rh * (1 - th / ro) + 0.1, 0)], s ? f.U : [-f.ux, 0, -f.uz]);
    oCross(B.gold, cx, yT + rh, cz, 0.9, f.nx, f.nz);
    fsolid(S, f, 0, sc - pw, -th, th, gb, yT + rh, 'wall'); fsolid(S, f, sc + pw, f.L, -th, th, gb, yT + rh, 'wall');
    fsolid(S, f, sc - pw, sc + pw, -th, th, ys + pw * 0.7, yT + rh, 'wall');
    gateAt = [cx, cz];
  }

  // ---- the fence: panels along the lot edges, cream pillars, stepped top; gaps for roads, paths, the belfry and the gate
  const roads = map.roads.filter((rd) => { for (let i = 0; i < rd.p.length; i += 2) if (Math.abs(rd.p[i] - 675) < 140 && Math.abs(rd.p[i + 1] - 1770) < 140) return true; return false; });
  const near = (x, z, pred) => roads.some((rd) => {
    if (!pred(rd)) return false;
    for (let i = 0; i + 3 < rd.p.length; i += 2) if (segDist(x, z, [rd.p[i], rd.p[i + 1]], [rd.p[i + 2], rd.p[i + 3]]) < (rd.c === 'footway' || rd.c === 'path' || rd.c === 'cycleway' ? 1.4 : rd.w / 2 + 0.6)) return true;
    return false;
  });
  const isWalk = (rd) => rd.c === 'footway' || rd.c === 'path', isRoad = (rd) => !isWalk(rd) && rd.c !== 'cycleway';
  const belC = centroid(belP), inBel = (x, z, m) => inPoly(belP, x, z) || Math.hypot(x - belC[0], z - belC[1]) < m;
  let nPanels = 0;
  const pillar = (f, s, gp) => {
    B.brick.setColor(CREAM); fbox(B.brick, f, s - 0.28, s + 0.28, gp - 0.4, gp + 2.25, -0.28, 0.28, 1 | 2 | 4 | 8, [2.0, 1.8]);
    D.setColor('#ddd0ae'); fbox(D, f, s - 0.36, s + 0.36, gp + 2.25, gp + 2.4, -0.36, 0.36, 63);
  };
  for (const [p, q] of lotEdges) {
    const f = edgeFace(p, q, (x, z) => inPoly(LOT, x, z)), n = Math.max(1, Math.round(f.L / 3.6)), w = f.L / n;
    let prevBuilt = false;
    for (let k = 0; k < n; k++) {
      const s0 = k * w, s1 = s0 + w, mids = [0.15, 0.5, 0.85].map((t) => at(f, s0 + w * t, 0));
      const skip = mids.some(([x, , z]) => near(x, z, isRoad) || near(x, z, isWalk) || inBel(x, z, 3.2) || Math.hypot(x - gateAt[0], z - gateAt[1]) < 3.2);
      if (skip) { prevBuilt = false; continue; }
      const [ga, gb2] = [s0, s1].map((s) => { const [x, , z] = at(f, s, 0); return heightAt(x, z); });
      const gp = Math.max(ga, gb2), gl = Math.min(ga, gb2) - 0.4;
      B.stone.setColor('#ffffff'); fbox(B.stone, f, s0, s1, gl, gp + 0.55, -0.2, 0.2, 1 | 2 | 16, [2.6, 1.3]);
      B.brick.setColor(ORANGE);
      const q1 = s0 + w * 0.26, q2 = s1 - w * 0.26;
      fbox(B.brick, f, s0, q1, gp + 0.55, gp + 1.95, -0.14, 0.14, 1 | 2 | 16, BM); fbox(B.brick, f, q2, s1, gp + 0.55, gp + 1.95, -0.14, 0.14, 1 | 2 | 16, BM);
      fbox(B.brick, f, q1, q2, gp + 0.55, gp + 1.6, -0.14, 0.14, 1 | 2 | 16, BM);
      fbox(B.brick, f, q1, q1 + 0.001, gp + 1.6, gp + 1.95, -0.14, 0.14, 8, BM); fbox(B.brick, f, q2 - 0.001, q2, gp + 1.6, gp + 1.95, -0.14, 0.14, 4, BM);
      if (!prevBuilt) pillar(f, s0, gp);
      pillar(f, s1, gp);
      fsolid(S, f, s0, s1, -0.25, 0.25, gl, gp + 1.95, 'wall');
      prevBuilt = true; nPanels++;
    }
  }

  // ---- plantings: thujas both sides of the paths in the yard, a few blue spruces, two flower urns at the porch
  const spots = [], yard = (x, z) => inPoly(LOT, x, z) && Math.hypot(x - CEN[0], z - CEN[1]) < 40;
  const edgeD = (x, z) => Math.min(...lotEdges.map((e) => segDist(x, z, ...e)));
  const ok = (x, z, gap) => yard(x, z) && edgeD(x, z) > 1.1 && Math.hypot(x - CEN[0], z - CEN[1]) > 15.2 && !near(x, z, isWalk) && !inBel(x, z, 4.2)
    && Math.hypot(x - gateAt[0], z - gateAt[1]) > 3.5 && spots.every((t) => Math.hypot(t.x - x, t.z - z) > gap);
  for (const rd of roads.filter(isWalk)) for (let i = 0; i + 3 < rd.p.length; i += 2) {
    const ax = rd.p[i], az = rd.p[i + 1], bx = rd.p[i + 2], bz = rd.p[i + 3], l = Math.hypot(bx - ax, bz - az);
    if (l < 1) continue;
    const ux = (bx - ax) / l, uz = (bz - az) / l;
    for (let s = 1.4; s < l - 0.6; s += 2.9) for (const sd of [-1, 1]) {
      const x = ax + ux * s - uz * sd * 1.75, z = az + uz * s + ux * sd * 1.75;
      if (ok(x, z, 2.3)) spots.push({ x, z, kind: 'conifer', variant: 'spruce', sc: 0.48 + 0.08 * r(), pal: PARK_PINE, s3: [0.36, 1.4, 0.36] });
    }
  }
  const blue = [PARK_PINE[0].map((c) => c.map((v, i) => v * [0.8, 0.95, 1.28][i]))];
  for (const [a, b] of [[-17, 17], [17, -17], [20, 14], [-4, -24], [10, 24]]) { const [x, z] = W(a, b); if (ok(x, z, 3)) spots.push({ x, z, kind: 'conifer', variant: 'spruce', sc: 1.05 + 0.25 * r(), pal: blue }); }
  for (const sb of [-1.9, 1.9]) {
    const [x, z] = W(-ARM_EW - 5.3, sb), y = heightAt(x, z);
    D.setColor('#c9b48c'); D.cyl(x, y, z, 0.18, 0.18, 0.35, 10, true); D.cyl(x, y + 0.35, z, 0.16, 0.36, 0.45, 10, true);
    D.setColor('#c4222f'); D.ellipsoid([x, y + 0.85, z], [0.36, 0.22, 0.36], 8, 5);
  }

  // ---- meshes
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: brickTex(r, (j) => (j % 6 < 2 ? [238, 216, 168] : [226, 152, 120]), '#d9c5b0'), vertexColors: true, roughness: 0.9 }),
    brick: new THREE.MeshStandardMaterial({ map: brickTex(r, () => [236, 236, 236], '#cfc9c0'), vertexColors: true, roughness: 0.88 }),
    stone: new THREE.MeshStandardMaterial({ map: stoneTex(r), vertexColors: true, roughness: 0.95 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    roof: new THREE.MeshStandardMaterial({ map: seamTex(), vertexColors: true, roughness: 0.4, metalness: 0.55, side: THREE.DoubleSide }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd9a93a, vertexColors: true, roughness: 0.22, metalness: 1, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.4 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.2, emissive: 0xffd9a0, emissiveIntensity: 0 }),
  };
  const stt = finish(root, 'andriy', B, M, ['wall', 'brick', 'roof', 'gold', 'stone']);
  console.log(`[cherkasy] St Andrew's church (Heroiv Dnipra 48): floor ${yF.toFixed(1)} m, ${nWin} cross windows, ${nPanels} fence panels, ${spots.length} trees, ${(stt.tris / 1000).toFixed(1)}k tris, ${stt.meshes} meshes, ${(S.count ?? 0) - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    spots,
    footprints: [{ poly: ring, h: KEEL + 9, kind: 'church', name: church.name }, { poly: belP, h: 18, kind: 'church' }],
    // keep the generic trees off the church, the porch path, the belfry, the gate and the fence line
    clear: (x, z) => (inPoly(LOT, x, z) && Math.hypot(x - CEN[0], z - CEN[1]) < 40) || edgeD(x, z) < 1.6,
    update() { M.lit.emissiveIntensity = 1.1 * nightK.value; },
  };
}
