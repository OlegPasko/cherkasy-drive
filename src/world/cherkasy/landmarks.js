// OWNER: cherkasy (landmarks). Hand-modelled Cherkasy landmarks placed from their real coordinates.
//   LANDMARK_SKIP: Set of OSM building ids (way / relation ids as in map.json buildings[].id) whose generic extrusion
//     is replaced by a model here (buildings.js skips them)
//   buildLandmarks({ root, T, map, solids, zips, heightAt, facadeMat, detailMat, geo }) -> { update?(dt, camera), clear(x, z) }
//     clear: true where generated trees must not stand (the stadium bowl)
//   levelStadium(hf) flattens the terrain under the Cherkasy-Arena (before the ground and buildings are built)
//     root: THREE.Group to add meshes to; heightAt(x, z): ground y; geo.toXZ(lat, lon) -> [x, z]
// Models (research notes, section 2): St Michael's cathedral (9 gilded domes), the 196 m lattice TV tower, the 150 m
// Mytnytsia boiler chimney + every other OSM chimney / water tower, the Shukhov hyperboloid water tower, river-port
// portal cranes (quay found from the water polygon) and the Cherkasy-Arena stands +
// floodlights. Each model emits its exact collision (boxes, frustums, plane-topped prisms) and zip points; a failing
// model only logs (the rest of the city is unaffected).
// Pagorb Slavy has its own module (pagorb.js), the drama theatre too (drama.js).
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { FacadeBuilder, STYLE, LAYER } from '../facade.js';
import { DP } from '../materials.js';
import { OVERHANG } from '../collision.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, area2, centroid, inPoly, hash01, obb } from './geo.js';

// cathedral, TV tower, Mytnytsia chimney, stadium grandstands (2)
// + river station
export const LANDMARK_SKIP = new Set([242469769, 412764704, 879198835, 928316618, 928316619, 103630072]);

const PI = Math.PI;
const polyK = (n) => (1 + Math.cos(PI / n)) / 2; // n-gon collision radius factor (mean of in- and circumradius)
const C = { cream: 0xe6dcc4, creamD: 0xb9ae96, blue: 0x3d64a6, blueD: 0x2f4f86, granite: 0x7e6e6a, red: 0xb8322a, white: 0xe8e6e0,
  conc: 0x9ea0a0, steel: 0x5b6166, yellow: 0xd9a520, portal: 0x5a7288, grass: 0x56753a, seatB: 0x1f4f9e, seatR: 0xb02a30 };

// ------------------------------------------------------------------------------------------------ frames
// local frame: origin (ox, oy, oz), rotation ry about +y (local +x -> world (cos ry, -sin ry)); a = local x, b = local z
class Frame {
  constructor(ox, oy, oz, ry) { Object.assign(this, { ox, oy, oz, ry, c: Math.cos(ry), s: Math.sin(ry), M: M4(ox, oy, oz, ry) }); }
  static along(x, y, z, ux, uz) { return new Frame(x, y, z, Math.atan2(-uz, ux)); }
  w(a, b) { return [this.ox + a * this.c + b * this.s, this.oz - a * this.s + b * this.c]; }
  d(a, b) { return [a * this.c + b * this.s, -a * this.s + b * this.c]; }
  child(a, y, b, rot) { const [x, z] = this.w(a, b); return new Frame(x, this.oy + y, z, this.ry + rot); }
  // world ring of local points, turned to positive map area (collision prisms want it)
  ring(P) { const W = P.map((p) => this.w(p[0], p[1])); return area2(W) < 0 ? W.reverse() : W; }
  poly(S, P, y0, y1, kind = 'wall', flags = 0) { return S.prism(this.ring(P).flat(), y0 + this.oy, y1 + this.oy, 0, 0, kind, flags); }
  box(S, a0, b0, a1, b1, y0, y1, kind = 'wall', flags = 0) { return this.poly(S, [[a0, b0], [a1, b0], [a1, b1], [a0, b1]], y0, y1, kind, flags); }
  // convex prism under the plane through three local points [a, y, b]
  slope(S, P, y0, Q, kind = 'roof', flags = 0) {
    const pl = planeOf(...Q.map((q) => this.wp(q[0], q[1], q[2])));
    return pl ? S.prism(this.ring(P).flat(), y0 + this.oy, pl.a, pl.bx, pl.bz, kind, flags) : -1;
  }
  cyl(S, a, b, y0, y1, r0, r1, kind = 'equipment', flags = 0) { const p = this.w(a, b); return S.cyl(p[0], p[1], y0 + this.oy, y1 + this.oy, r0, r1, kind, flags); }
  edge(Z, a0, b0, a1, b1, y, na, nb, kind = 'roofEdge', step = 7) {
    const A = this.w(a0, b0), B = this.w(a1, b1), N = this.d(na, nb);
    Z.edge(A[0], A[1], B[0], B[1], y + this.oy, N[0], N[1], kind, step);
  }
  top(Z, a, y, b, kind = 'antenna') { const p = this.wp(a, y, b); Z.add(p[0], p[1], p[2], 0, 1, 0, kind); }
  wp(a, y, b) { const [x, z] = this.w(a, b); return [x, this.oy + y, z]; }
}
// the plane y = a + bx x + bz z through three points (null when they stand in a vertical plane)
function planeOf(p0, p1, p2) {
  const n = crs(sub(p1, p0), sub(p2, p0));
  if (Math.abs(n[1]) < 1e-9) return null;
  const bx = -n[0] / n[1], bz = -n[2] / n[1];
  return { a: p0[1] - bx * p0[0] - bz * p0[2], bx, bz };
}
// lowest ground under a set of world points (models stand on it; their plinths reach below)
const groundMin = (g, pts) => pts.reduce((m, [x, z]) => Math.min(m, g(x, z)), Infinity);

// ------------------------------------------------------------------------------------------------ mesh helpers
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
// convex planar polygon (3+ points) facing `want`; N: per-vertex normals (default: want)
function surf(D, V, want, N = null) {
  const ids = V.map((p, i) => { const n = N?.[i] ?? want; return D.vert(p[0], p[1], p[2], n[0], n[1], n[2]); });
  const rev = dot(crs(sub(V[1], V[0]), sub(V[2], V[0])), want) < 0;
  for (let i = 2; i < ids.length; i++) rev ? D.tri(ids[0], ids[i], ids[i - 1]) : D.tri(ids[0], ids[i - 1], ids[i]);
}
// polygon in the x/y plane at depth z, facing -z (the outward side in an edge frame); fan from its centroid
function fanXY(D, P, z) {
  const n = P.length, mid = P.reduce((m, p) => [m[0] + p[0] / n, m[1] + p[1] / n], [0, 0]);
  const c = D.vert(mid[0], mid[1], z, 0, 0, -1), ids = P.map((p) => D.vert(p[0], p[1], z, 0, 0, -1));
  const ccw = area2(P) > 0; // x/y read as the map's x/z
  ids.forEach((id, i) => { const nx = ids[(i + 1) % n]; if (ccw) D.tri(c, nx, id); else D.tri(c, id, nx); });
}
// round-headed opening of width w from y0 up to y1 centred on x: two foot corners, then the half circle
function archPts(x, y0, y1, w, n = 7) {
  const r = w / 2, yc = Math.max(y0 + 0.01, y1 - r), out = [[x - r, y0], [x + r, y0]];
  for (let k = 0; k <= n; k++) out.push([x + r * Math.cos(PI * k / n), yc + r * Math.sin(PI * k / n)]);
  return out;
}
// run fn(d, L) in the frame of the wall edge A -> B (local x along the edge, y up, outward = local -z for ccw rings)
function onEdge(D, A, B, fn) {
  const ex = B[0] - A[0], ez = B[1] - A[1], len = Math.hypot(ex, ez);
  if (len >= 1e-3) D.with(M4(A[0], 0, A[1], Math.atan2(-ez, ex)), (d) => fn(d, len));
}
// surface of revolution: profile [[r, y], ...] bottom -> top, sx / sz squash the section (statue)
function lathe(D, P, seg, cx = 0, cz = 0, sx = 1, sz = 1) {
  const last = P.length - 1;
  const grid = P.map(([r, y], i) => {
    const q0 = P[i > 0 ? i - 1 : 0], q1 = P[i < last ? i + 1 : last];
    const dr = q1[0] - q0[0], dy = q1[1] - q0[1], len = Math.hypot(dr, dy) || 1, nr = dy / len, ny = -dr / len, row = [];
    for (let k = 0; k <= seg; k++) {
      const t = 2 * PI * k / seg, cs = Math.cos(t), sn = Math.sin(t);
      row.push(D.vert(cx + r * sx * cs, y, cz + r * sz * sn, nr * cs / sx, ny, nr * sn / sz, k / seg, y));
    }
    return row;
  });
  for (let i = 1; i <= last; i++) { const lo = grid[i - 1], hi = grid[i]; for (let k = 0; k < seg; k++) D.quad(lo[k + 1], lo[k], hi[k], hi[k + 1]); }
}
function sphere(D, x, y, z, r, seg = 10) {
  const prof = [];
  for (let i = 0; i <= 6; i++) { const t = PI * (i / 6 - 0.5); prof.push([r * Math.cos(t), y + r * Math.sin(t)]); }
  lathe(D, prof, seg, x, z);
}
// dome profiles [[r, y], ...]: a Byzantine helmet and an onion
function helmetProf(R, y0, H, n = 12) {
  const out = [[0.94 * R, y0 - 0.35], [R, y0]];
  for (let i = 1; i <= n; i++) { const t = i / n, bulge = Math.max(0, Math.cos(PI * t / 2)) ** 0.78; out.push([R * bulge * (1 - 0.12 * t * t), y0 + H * t]); }
  return out;
}
function onionProf(R, y0, H, n = 12) {
  const out = [[0.7 * R, y0]];
  for (let i = 1; i <= n; i++) {
    const t = i / n, k = t < 0.35 ? 0.78 + 0.37 * Math.sin(PI / 2 * t / 0.35) : 1.15 * Math.cos(PI / 2 * (t - 0.35) / 0.65) ** 1.7;
    out.push([k * R, y0 + H * t]);
  }
  return out;
}
// box between two points with a w x h section (booms, braces)
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
function beam(D, a, b, w, h) {
  _X.fromArray(b).sub(_Y.fromArray(a));
  const L = _X.length(); if (L < 1e-4) return;
  _X.multiplyScalar(1 / L);
  _Z.crossVectors(UPV, _X); if (_Z.lengthSq() < 1e-6) _Z.set(0, 0, 1);
  _Y.crossVectors(_Z.normalize(), _X);
  const m = new THREE.Matrix4().makeBasis(_X, _Y, _Z).setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  D.with(m, (d) => d.boxC(0, 0, 0, L, h, w));
}
// orthodox cross (gold): shaft, two bars, slanted foot bar; bars run along local z
function cross(G, x, y0, z, h) {
  const t = Math.max(0.12, h * 0.035);
  G.box(x - t, y0, z - t, x + t, y0 + h, z + t);
  G.box(x - t * 0.8, y0 + h * 0.68 - t, z - h * 0.24, x + t * 0.8, y0 + h * 0.68 + t, z + h * 0.24);
  G.box(x - t * 0.8, y0 + h * 0.86 - t * 0.8, z - h * 0.12, x + t * 0.8, y0 + h * 0.86 + t * 0.8, z + h * 0.12);
  G.tube([x, y0 + h * 0.3, z - h * 0.16], [x, y0 + h * 0.42, z + h * 0.16], t * 0.8, 4, true);
  sphere(G, x, y0, z, t * 2.4, 8);
}
// n window centres on a wall of length L: `step` apart inside margins m, fewer when the room is short
function windowXs(L, w) {
  const m = w.m ?? 1.2, room = L - 2 * m;
  let n = room < w.w ? (L > w.w + 0.8 ? 1 : 0) : Math.floor(room / w.step) + 1;
  if (w.max) n = Math.min(n, w.max);
  const st = n > 1 ? Math.min(w.step, room / (n - 1)) : 0, xs = [];
  for (let k = 0; k < n; k++) { const x = L / 2 + (k - (n - 1) / 2) * st; if (!(w.gap && Math.abs(x - L / 2) < w.gap)) xs.push(x); }
  return xs;
}
// walls of a ccw ring (local a/b), with arched windows / plinth / cornice per edge
// o: {plinth: [y1, col], cornice: [h, depth, col], win: [{y0, y1, w, step, m}], only(i, L) -> bool}
function walls(D, P, y0, y1, col, o = {}) {
  P.forEach((A, i) => {
    if (o.only && !o.only(i)) return;
    onEdge(D, A, P[(i + 1) % P.length], (d, L) => {
      d.setPart(DP.CONC).setColor(col);
      fanXY(d, [[0, y0], [L, y0], [L, y1], [0, y1]], 0);
      if (o.plinth) d.setColor(o.plinth[1]).box(-0.02, y0, -0.28, L + 0.02, o.plinth[0], 0, 0b110111);
      if (o.cornice) { const [h, dp, cc] = o.cornice; d.setColor(cc ?? col).box(-dp, y1 - h, -dp, L + dp, y1, 0, 0b111111); }
      if (o.pil && L > 3) { // corner pilasters between plinth and cornice
        const lo = o.plinth ? o.plinth[0] : y0, hi = y1 - (o.cornice ? o.cornice[0] : 0);
        d.setColor(col); for (const x of [0.1, L - 1.0]) d.box(x, lo, -0.22, x + 0.9, hi, 0, 0b110111);
      }
      for (const w of o.win ?? []) {
        if (w.skip?.(i)) continue;
        for (const x of windowXs(L, w)) {
          d.setPart(DP.CONC).setColor(w.frame ?? C.creamD); fanXY(d, archPts(x, w.y0 - 0.22, w.y1 + 0.22, w.w + 0.44), -0.03);
          d.setPart(DP.GLASS).setColor(0x101418); fanXY(d, archPts(x, w.y0, w.y1, w.w), -0.07);
        }
      }
    });
  });
}
const ngon = (n, r, cx = 0, cz = 0, a0 = 0) => Array.from({ length: n }, (_, k) => { const t = a0 + 2 * PI * k / n; return [cx + r * Math.cos(t), cz + r * Math.sin(t)]; });

// ================================================================================================ 1. St Michael's cathedral
// Neo-Byzantine cross-in-square (way 242469769, 74 m): cream walls with round-headed windows, a cross of blue barrel
// vaults ending in zakomara gables, a tall 16-sided central drum under a gilded helmet dome, 4 corner drums and 4 small
// onion domes over the arms (9 domes), all with orthodox crosses. Local frame: crossing centre, +a = east (nave axis).
function cathedral(L) {
  const { S, Z } = L, ux = 0.5772, uz = 0.8166;
  const cx = -921.8, cz = 683.6; // crossing of the OSM cross-shaped footprint (arms 18 m, core 43.5 x 30 m)
  const probe = new Frame(cx, 0, cz, Math.atan2(-uz, ux));
  const base = groundMin(L.g, [[-30, -22], [20, -22], [20, 22], [-30, 22], [0, 0]].map(([a, b]) => probe.w(a, b))) + 0.15;
  const F = new Frame(cx, base, cz, probe.ry);
  const D = new MB().setXf(F.M), G = new MB().setXf(F.M);
  const WT = 20.2, NT = 15.2; // wall tops: main body, narthex
  const FP = [[-9, -22], [9, -22], [9, -15], [20.5, -15], [20.5, 15], [9, 15], [9, 22], [-9, 22], [-9, 15], [-23, 15], [-23, 7.6], [-30.3, 7.6], [-30.3, -7.6], [-23, -7.6], [-23, -15], [-9, -15]];
  if (area2(FP) < 0) FP.reverse();
  const narthex = (i) => Math.min(FP[i][0], FP[(i + 1) % FP.length][0]) < -23.5;
  const winMain = [{ y0: 4.2, y1: 11.6, w: 1.8, step: 4.8 }, { y0: 13.4, y1: 18.3, w: 1.5, step: 4.8 }];
  walls(D, FP, -2, WT, C.cream, { only: (i) => !narthex(i), plinth: [1.2, C.granite], cornice: [0.8, 0.55, C.creamD], pil: true, win: winMain });
  const west = FP.findIndex((p, i) => p[0] < -30 && FP[(i + 1) % FP.length][0] < -30);
  walls(D, FP, -2, NT, C.cream, { only: (i) => narthex(i), plinth: [1.2, C.granite], cornice: [0.7, 0.5, C.creamD], pil: true,
    win: [{ y0: 4.2, y1: 11, w: 1.6, step: 4.2, skip: (i) => i === west }, { y0: 10.4, y1: 13.8, w: 1.2, step: 3, max: 3, skip: (i) => i !== west }] });
  walls(D, [[-23, 7.6], [-23, -7.6]], NT, WT, C.cream, { only: (i) => i === 0, cornice: [0.8, 0.55, C.creamD] }); // core wall above the narthex
  // west portal: projecting porch with an arched door and a blue cap
  if (west >= 0) onEdge(D, FP[west], FP[(west + 1) % FP.length], (d, Lw) => {
    const x0 = Lw / 2 - 3.2, x1 = Lw / 2 + 3.2;
    d.setPart(DP.CONC).setColor(C.cream).box(x0, -1, -2, x1, 9, 0);
    d.setColor(C.blue).box(x0 - 0.3, 9, -2.3, x1 + 0.3, 9.5, 0);
    d.setColor(C.creamD); fanXY(d, archPts(Lw / 2, 0.2, 6.6, 3.4), -2.03);
    d.setPart(DP.WOOD).setColor(0x4a3020); fanXY(d, archPts(Lw / 2, 0.2, 6.2, 2.8), -2.07);
    d.setPart(DP.GLASS).setColor(0x101418); fanXY(d, archPts(Lw / 2, 7.1, 8.5, 1.6), -2.05);
  });
  // flat roofs (hidden mostly by the vaults) + wall collision
  D.setPart(DP.CONC).setColor(C.blueD);
  for (const [a0, b0, a1, b1, y] of [[-23, -15, 20.5, 15, WT], [-9, 15, 9, 22, WT], [-9, -22, 9, -15, WT], [-30.3, -7.6, -23, 7.6, NT]]) {
    D.box(a0, y - 0.3, b0, a1, y + 0.02, b1, 0b000100); F.box(S, a0, b0, a1, b1, -1.5, y, 'wall');
  }
  // barrel vaults (10 facets, rendered = collision) ending in zakomara gables with triple windows
  const vault = (axis, s0, s1, r, y0, ends) => {
    const n = 10, ov = 0.4, P = (s, w, y) => axis === 'a' ? [s, y, w] : [w, y, s], AB = (s, w) => axis === 'a' ? [s, w] : [w, s];
    D.setPart(DP.PAINT).setColor(C.blue);
    for (let k = 0; k < n; k++) {
      const t0 = k / n * PI, t1 = (k + 1) / n * PI, w0 = r * Math.cos(t0), w1 = r * Math.cos(t1), h0 = y0 + r * Math.sin(t0), h1 = y0 + r * Math.sin(t1);
      const N0 = axis === 'a' ? [0, Math.sin(t0), Math.cos(t0)] : [Math.cos(t0), Math.sin(t0), 0], N1 = axis === 'a' ? [0, Math.sin(t1), Math.cos(t1)] : [Math.cos(t1), Math.sin(t1), 0];
      const tm = (t0 + t1) / 2, want = axis === 'a' ? [0, Math.sin(tm), Math.cos(tm)] : [Math.cos(tm), Math.sin(tm), 0];
      surf(D, [P(s0 - ov, w0, h0), P(s1 + ov, w0, h0), P(s1 + ov, w1, h1), P(s0 - ov, w1, h1)], want, [N0, N0, N1, N1]);
      F.slope(S, [AB(s0, w0), AB(s1, w0), AB(s1, w1), AB(s0, w1)], y0 - 0.3, [P(s0, w0, h0), P(s1, w0, h0), P(s1, w1, h1)], 'roof');
    }
    for (const e of ends) { // gable wall: edge along the end, outward along +-axis
      const s = e > 0 ? s1 : s0, A = e > 0 ? AB(s, -r) : AB(s, r), B = e > 0 ? AB(s, r) : AB(s, -r);
      const [A2, B2] = axis === 'a' ? [A, B] : [B, A]; // (b axis: +b outward runs from +r to -r)
      onEdge(D, A2, B2, (d, Lg) => {
        const arc = [[0, y0], [Lg, y0]]; for (let k = 0; k <= 16; k++) { const t = k / 16 * PI; arc.push([Lg / 2 + Lg / 2 * Math.cos(t), y0 + Lg / 2 * Math.sin(t)]); }
        d.setPart(DP.CONC).setColor(C.cream); fanXY(d, arc, 0);
        for (const [dx, w, top] of [[0, r * 0.2, 0.74], [-r * 0.42, r * 0.15, 0.5], [r * 0.42, r * 0.15, 0.5]]) {
          d.setColor(C.creamD); fanXY(d, archPts(Lg / 2 + dx, y0 + 1.0, y0 + r * top + 0.2, w + 0.4), -0.03);
          d.setPart(DP.GLASS).setColor(0x101418); fanXY(d, archPts(Lg / 2 + dx, y0 + 1.2, y0 + r * top, w), -0.07); d.setPart(DP.CONC);
        }
      });
    }
  };
  vault('a', -23, 20.5, 9, WT, [-1, 1]);
  vault('b', -22, 22, 9, WT, [-1, 1]);
  vault('a', -30.3, -23, 7.6, NT, [-1]);
  // drums + domes: [a, b, sides, r, y0, y1, window, dome kind, dome R, dome H, cross h]
  const drums = [[0, 0, 16, 7.2, WT, 46, [31, 40, 1.5], 'helmet', 7.7, 14, 7.6]];
  for (const [a, b] of [[14.8, 12], [14.8, -12], [-16, 12], [-16, -12]]) drums.push([a, b, 12, 3.1, WT, 32, [25, 30.2, 0.9], 'helmet', 3.4, 6, 4.5]);
  for (const [a, b] of [[0, 16], [0, -16], [15.5, 0], [-17.5, 0]]) drums.push([a, b, 8, 2.0, 26, 32, [28.4, 31, 0.7], 'onion', 2.2, 4.3, 3.5]);
  for (const [a, b, n, r, y0, y1, win, kind, R, H, ch] of drums) {
    const P = ngon(n, r, a, b, PI / n);
    walls(D, P, y0, y1, C.cream, { cornice: [0.6, 0.35, C.creamD], win: [{ y0: win[0], y1: win[1], w: win[2], step: 99, m: 0.2 }] });
    F.cyl(S, a, b, y0 - 0.5, y1, r * polyK(n), r * polyK(n), 'wall');
    G.setPart(DP.STEEL).setColor(0xffffff);
    const prof = kind === 'helmet' ? helmetProf(R, y1, H) : onionProf(R, y1, H);
    lathe(G, prof, n >= 16 ? 28 : 16, a, b);
    // dome collision: frustums through the profile samples
    const smp = [0, 3, 6, 9, prof.length - 1].map(i => prof[Math.min(i, prof.length - 1)]);
    for (let i = 0; i + 1 < smp.length; i++) if (smp[i + 1][1] > smp[i][1]) F.cyl(S, a, b, smp[i][1], smp[i + 1][1], Math.max(0.15, smp[i][0] * 0.97), Math.max(0.15, smp[i + 1][0] * 0.97), 'roof');
    let top = y1 + H;
    if (n >= 16) { // lantern: neck + small onion
      lathe(G, [[1.3, top - 0.6], [1.3, top + 2.2], [1.5, top + 2.4]], 16, a, b);
      lathe(G, onionProf(1.6, top + 2.4, 4), 16, a, b);
      F.cyl(S, a, b, top - 0.6, top + 2.4, 1.3, 1.3, 'roof'); F.cyl(S, a, b, top + 2.4, top + 6.4, 1.7, 0.3, 'roof');
      top += 6.4;
    }
    cross(G, a, top - 0.1, b, ch);
    F.top(Z, a, top, b, 'antenna');
  }
  // roof-edge zip points on the parapets (the validation drops the ones under the vaults / drums)
  for (let i = 0; i < FP.length; i++) {
    const [a0, b0] = FP[i], [a1, b1] = FP[(i + 1) % FP.length], Le = Math.hypot(a1 - a0, b1 - b0), na = (b1 - b0) / Le, nb = -(a1 - a0) / Le;
    F.edge(Z, a0, b0, a1, b1, narthex(i) ? NT : WT, na, nb);
  }
  L.out(D, L.detailMat, 'cathedral'); L.out(G, L.mats.gold, 'cathedral-gold');
}

// ================================================================================================ 3. TV tower
// 196 m square lattice (way 412764704): pyramid 0-155 m, prism to 180 m, mast to 196 m; ICAO red/white bands,
// platforms at 100 / 155 / 180 m with railings, panel antennas, red obstruction lights. Collision: a stepped solid
// column (climbable), platform slabs, mast; zips on the platform lips and the mast top.
function tvTower(L) {
  const { S, Z, g } = L;
  const b = L.map.buildings.find(q => q.id === 412764704);
  const P = b ? ringPts(b.p) : [[302.8, -2622], [314.3, -2618.4], [310.9, -2607.6], [299.4, -2611.2]];
  const [cx, cz] = centroid(P), ex = P[1][0] - P[0][0], ez = P[1][1] - P[0][1], side = Math.hypot(ex, ez);
  const F = Frame.along(cx, groundMin(g, P) + 0.15, cz, ex / side, ez / side);
  const D = new MB().setXf(F.M);
  const H1 = 155, H2 = 180, H3 = 196, w0 = Math.max(5, side / 2), w1 = 1.7;
  const wAt = (y) => y <= H1 ? w0 + (w1 - w0) * y / H1 : w1;
  const band = (y) => Math.floor((H3 - y) / (H3 / 7)) % 2 === 0 ? C.red : C.white;
  const lv = []; for (let i = 0; i <= 20; i++) lv.push(i / 20 * H1); for (let i = 1; i <= 4; i++) lv.push(H1 + i / 4 * (H2 - H1));
  const cor = (y) => { const w = wAt(y); return [[-w, -w], [w, -w], [w, w], [-w, w]]; };
  D.setPart(DP.PAINT);
  for (let i = 0; i + 1 < lv.length; i++) {
    const y0 = lv[i], y1 = lv[i + 1], A = cor(y0), B = cor(y1), rl = 0.45 - 0.25 * y0 / H3;
    D.setColor(band((y0 + y1) / 2));
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4;
      D.tube([A[k][0], y0, A[k][1]], [B[k][0], y1, B[k][1]], rl, 6);
      D.tube([B[k][0], y1, B[k][1]], [B[k1][0], y1, B[k1][1]], 0.16, 4);
      D.tube([A[k][0], y0, A[k][1]], [B[k1][0], y1, B[k1][1]], 0.12, 4);
      D.tube([A[k1][0], y0, A[k1][1]], [B[k][0], y1, B[k][1]], 0.12, 4);
    }
    const wm = wAt((y0 + y1) / 2) + 0.15;
    F.box(S, -wm, -wm, wm, wm, y0 - (i ? 0 : 1), y1, 'spire');
  }
  // platforms (grating slab + railing), panel antennas on the prism, mast
  for (const [y, h] of [[100, wAt(100) + 1.3], [H1, 3.5], [H2, 3.0]]) {
    D.setPart(DP.GALV).setColor(0x8a8e90).box(-h, y - 0.3, -h, h, y, h);
    D.setPart(DP.PAINT).setColor(C.white);
    const R = [[-h, -h], [h, -h], [h, h], [-h, h]];
    for (let k = 0; k < 4; k++) { const p = R[k], q = R[(k + 1) % 4]; D.tube([p[0], y + 1.1, p[1]], [q[0], y + 1.1, q[1]], 0.05, 4); D.tube([p[0], y, p[1]], [p[0], y + 1.1, p[1]], 0.05, 4); }
    F.box(S, -h, -h, h, h, y - 0.3, y, 'roof');
    F.edge(Z, -h, -h, h, -h, y, 0, -1, 'roofEdge', 2.5); F.edge(Z, h, -h, h, h, y, 1, 0, 'roofEdge', 2.5);
    F.edge(Z, h, h, -h, h, y, 0, 1, 'roofEdge', 2.5); F.edge(Z, -h, h, -h, -h, y, -1, 0, 'roofEdge', 2.5);
    for (const [a, c] of R) L.light(...F.wp(a * 0.97, y + 1.3, c * 0.97));
  }
  D.setPart(DP.PAINT).setColor(0xd6d8d8);
  for (const y of [159, 165, 171]) for (const [a, c, sa, sc] of [[w1 + 0.3, 0, 0.35, 1.3], [-w1 - 0.3, 0, 0.35, 1.3], [0, w1 + 0.3, 1.3, 0.35], [0, -w1 - 0.3, 1.3, 0.35]]) D.boxC(a, y + 1.6, c, sa, 3.2, sc);
  for (let y = H2; y < H3; y += 2) D.setColor(band(y + 1)).cyl(0, y, 0, 0.45 - 0.15 * (y - H2) / 16, 0.45 - 0.15 * (y + 2 - H2) / 16, 2, 8, false);
  D.setColor(C.red).cyl(0, H3, 0, 0.3, 0.3, 0.2, 8, true);
  F.cyl(S, 0, 0, H2, H3 + 0.2, 0.42, 0.3, 'antenna'); F.top(Z, 0, H3 + 0.2, 0, 'antenna');
  L.light(...F.wp(0, H3 + 0.5, 0), 0.9);
  for (const y of [50]) for (const [a, c] of cor(y)) L.light(...F.wp(a * 1.04, y, c * 1.04));
  L.out(D, L.detailMat, 'tv-tower');
}

// ================================================================================================ 4. chimneys + water towers
// tapered stack: concrete / brick shaft, red-white bands over the top part, balconies, soot cap, lights
function stack(L, D, x, z, H, r0, r1, o = {}) {
  const { S, Z, g } = L, y0 = g(x, z) - 1, F = new Frame(x, y0, z, 0), rAt = (y) => r0 + (r1 - r0) * y / H;
  const seg = r0 > 3 ? 28 : 16, bandFrom = o.bandFrom ?? H, nb = o.bands ?? 0, bh = nb ? (H - bandFrom) / nb : 1;
  const cuts = [0]; if (bandFrom < H) for (let k = 0; k <= nb; k++) cuts.push(bandFrom + k * bh); else cuts.push(H);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1]; if (b - a < 0.01) continue;
    const top = Math.round((H - (a + b) / 2) / bh - 0.5); // 0 = top band
    D.setPart(DP.CONC).setColor(a < bandFrom - 0.01 ? (o.col ?? C.conc) : top % 2 === 0 ? C.red : C.white).with(F.M, d => d.cyl(0, a, 0, rAt(a), rAt(b), b - a, seg, false));
  }
  D.setColor(0x2a2624).with(F.M, d => d.cyl(0, H - 0.2, 0, r1 * 0.85, r1 * 0.85, 0.25, seg, true));
  D.setColor(o.col ?? C.conc).with(F.M, d => lathe(d, [[r1, H], [r1 * 0.85, H + 0.02]], seg)); // rim
  F.cyl(S, 0, 0, 0, H, r0 * polyK(seg), r1 * polyK(seg), 'wall'); F.top(Z, 0, H, 0, 'antenna');
  for (const yb of o.balc ?? []) {
    const R = rAt(yb) + 1.4;
    D.setPart(DP.GALV).setColor(0x6c7072).with(F.M, d => d.cyl(0, yb - 0.3, 0, R, R, 0.3, seg, true));
    D.setPart(DP.PAINT).setColor(0x5a5e60).with(F.M, d => { const Q = ngon(seg, R - 0.05); for (let k = 0; k < seg; k++) { const p = Q[k], q = Q[(k + 1) % seg]; d.tube([p[0], yb + 1.1, p[1]], [q[0], yb + 1.1, q[1]], 0.04, 4); if (k % 2 === 0) d.tube([p[0], yb, p[1]], [p[0], yb + 1.1, p[1]], 0.035, 4); } });
    F.cyl(S, 0, 0, yb - 0.3, yb, R * polyK(seg), R * polyK(seg), 'ledge', OVERHANG);
    for (let k = 0; k < 8; k++) { const t = (k + 0.5) / 8 * PI * 2, c = Math.cos(t), s = Math.sin(t), [nx, nz] = F.d(c, s); Z.add(x + c * (R - 0.1), y0 + yb, z + s * (R - 0.1), nx, 0, nz, 'ledge'); }
    for (let k = 0; k < 4; k++) { const t = (k / 4 + 0.125) * PI * 2; L.light(x + Math.cos(t) * (rAt(yb) + 0.3), y0 + yb + 2.2, z + Math.sin(t) * (rAt(yb) + 0.3)); }
  }
  if (o.lights) for (let k = 0; k < 4; k++) { const t = (k / 4) * PI * 2; L.light(x + Math.cos(t) * (r1 + 0.2), y0 + H - 1, z + Math.sin(t) * (r1 + 0.2)); }
}
function chimneys(L) {
  const D = new MB(), R = L.map.region, inR = (x, z) => x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1;
  // Mytnytsia boiler-house chimney (way 879198835): OSM 165 m, press 120 m -> 150 m; banded above 45 m
  const b = L.map.buildings.find(q => q.id === 879198835);
  let mx = 951.2, mz = 2928.3, r0 = 5.4;
  if (b) { const P = ringPts(b.p); [mx, mz] = centroid(P); r0 = P.reduce((s, [x, z]) => s + Math.hypot(x - mx, z - mz), 0) / P.length; }
  stack(L, D, mx, mz, 150, r0, 3.0, { bandFrom: 45, bands: 7, balc: [52, 100, 144], lights: true });
  let n = 1;
  // other OSM chimneys (boiler houses, plants): 30-70 m, brick or concrete
  const done = [[mx, mz]];
  for (const p of L.map.pois) {
    if (p.tags?.man_made !== 'chimney' || p.id === 'w879198835') continue;
    const [x, z] = p.p ? centroid(ringPts(p.p)) : [p.x, p.z];
    if (!inR(x, z) || done.some(([a, c]) => Math.hypot(a - x, c - z) < 15)) continue;
    done.push([x, z]);
    const id = parseInt(p.id.slice(1), 10), h1 = hash01(id), h2 = hash01(id * 7 + 3), H = Math.round(30 + 40 * h1);
    const brick = h2 < 0.4, rb = Math.max(1.4, H * 0.042);
    stack(L, D, x, z, H, rb, rb * 0.58, { col: brick ? 0x8a4a38 : C.conc, bandFrom: !brick && H > 45 ? H * 0.62 : H, bands: 4, lights: H > 45, balc: H > 50 ? [H - 6] : [] });
    n++;
  }
  L.out(D, L.detailMat, 'chimneys');
  // Soviet water towers (Rozhnovsky: steel tank on a brick shaft) where OSM has a node / way but no building
  const W = new MB(); let nw = 0;
  for (const p of L.map.pois) {
    if (p.tags?.man_made !== 'water_tower' || p.id === 'w1022546445') continue;
    const P = p.p ? ringPts(p.p) : null, [x, z] = P ? centroid(P) : [p.x, p.z];
    if (!inR(x, z) || done.some(([a, c]) => Math.hypot(a - x, c - z) < 15)) continue;
    if (L.map.buildings.some(q => Math.abs(q.p[0] - x) < 80 && Math.abs(q.p[1] - z) < 80 && inPoly(ringPts(q.p), x, z))) continue; // modelled by the building
    done.push([x, z]);
    const rr = P ? Math.max(3, Math.min(7, P.reduce((s, [a, c]) => s + Math.hypot(a - x, c - z), 0) / P.length)) : 3.6;
    const hs = 18 + hash01(x * 13 + z) * 6, F = new Frame(x, L.g(x, z) - 0.5, z, 0), brick = p.tags.historic || hash01(z * 7 + x) < 0.6;
    W.setXf(F.M).setPart(brick ? DP.BRICK : DP.CONC).setColor(brick ? 0x9a5a44 : 0xd8d4ca).cyl(0, 0, 0, rr * 0.66, rr * 0.6, hs, 16, false);
    W.setPart(DP.PAINT).setColor(0x7d8a86).cyl(0, hs, 0, rr, rr, 5.5, 20, false).setColor(0x5f6a66).cyl(0, hs + 5.5, 0, rr + 0.2, 0.5, 1.8, 20, true);
    W.setPart(DP.GALV).setColor(0x6c7072).cyl(0, hs - 0.25, 0, rr + 0.9, rr + 0.9, 0.25, 20, true);
    F.cyl(L.S, 0, 0, 0, hs, rr * 0.66 * polyK(16), rr * 0.6 * polyK(16), 'wall'); F.cyl(L.S, 0, 0, hs - 0.25, hs + 5.5, rr + 0.9, rr + 0.9, 'watertower');
    F.cyl(L.S, 0, 0, hs + 5.5, hs + 7.3, (rr + 0.2) * polyK(20), 0.5, 'watertower'); F.top(L.Z, 0, hs + 7.3, 0, 'waterTower');
    nw++;
  }
  W.setXf(null); L.out(W, L.detailMat, 'water-towers');
  L.note(`${n} chimneys, ${nw} water towers`);
}

// ================================================================================================ 5. Shukhov tower
// hyperboloid of straight tubes (2 x 32, twisted 64 deg) with 8 rings, gallery + tank + conical roof (34 m)
function shukhov(L) {
  const p = L.map.pois.find(q => q.id === 'w1022546445'); if (!p) return;
  const P = ringPts(p.p), [cx, cz] = centroid(P), Rb = P.reduce((s, [x, z]) => s + Math.hypot(x - cx, z - cz), 0) / P.length;
  const F = new Frame(cx, groundMin(L.g, P) + 0.1, cz, 0), D = new MB().setXf(F.M);
  const H = 26, Rt = Rb * 0.62, phi = 1.12, n = 32;
  const rAt = (t) => Math.sqrt((1 - t) ** 2 * Rb * Rb + t * t * Rt * Rt + 2 * t * (1 - t) * Rb * Rt * Math.cos(phi));
  D.setPart(DP.PAINT).setColor(0x55605c);
  for (const sg of [1, -1]) for (let k = 0; k < n; k++) { const a = k / n * PI * 2, b = a + sg * phi; D.tube([Rb * Math.cos(a), 0, Rb * Math.sin(a)], [Rt * Math.cos(b), H, Rt * Math.sin(b)], 0.1, 4); }
  for (let i = 0; i <= 7; i++) { const t = i / 7, r = rAt(t) + 0.05, Q = ngon(32, r); for (let k = 0; k < 32; k++) { const u = Q[k], v = Q[(k + 1) % 32]; D.tube([u[0], t * H, u[1]], [v[0], t * H, v[1]], 0.13, 4); } }
  D.setPart(DP.CONC).setColor(C.conc).cyl(0, -0.5, 0, Rb + 0.6, Rb + 0.6, 1.0, 24, true);
  D.setPart(DP.PAINT).setColor(0x6c7672).cyl(0, 0, 0, 0.8, 0.8, H, 8, false);
  const Rk = Rt + 0.5, Rg = Rk + 1.0;
  D.setPart(DP.GALV).setColor(0x6c7072).cyl(0, H, 0, Rg, Rg, 0.35, 24, true);
  D.setPart(DP.PAINT).setColor(0x5a5e60); { const Q = ngon(24, Rg - 0.05); for (let k = 0; k < 24; k++) { const u = Q[k], v = Q[(k + 1) % 24]; D.tube([u[0], H + 1.45, u[1]], [v[0], H + 1.45, v[1]], 0.04, 4); D.tube([u[0], H + 0.35, u[1]], [u[0], H + 1.45, u[1]], 0.035, 4); } }
  D.setColor(0xc9c6bc).cyl(0, H + 0.35, 0, Rk, Rk, 5.2, 24, false);
  D.setColor(0x4f5a58).cyl(0, H + 5.55, 0, Rk + 0.3, 0.7, 1.9, 24, true).cyl(0, H + 7.45, 0, 0.7, 0.5, 0.6, 8, true);
  for (let i = 0; i < 3; i++) { const t0 = i / 3, t1 = (i + 1) / 3; F.cyl(L.S, 0, 0, t0 * H, t1 * H, rAt(t0), rAt(t1), 'watertower'); }
  F.cyl(L.S, 0, 0, H, H + 0.35, Rg * polyK(24), Rg * polyK(24), 'watertower', OVERHANG);
  F.cyl(L.S, 0, 0, H + 0.35, H + 5.55, Rk * polyK(24), Rk * polyK(24), 'watertower');
  F.cyl(L.S, 0, 0, H + 5.55, H + 7.45, (Rk + 0.3) * polyK(24), 0.7, 'watertower'); F.top(L.Z, 0, H + 7.45, 0, 'waterTower');
  for (let k = 0; k < 8; k++) { const t = (k + 0.5) / 8 * PI * 2; L.Z.add(cx + Math.cos(t) * (Rg - 0.1), F.oy + H + 0.35, cz + Math.sin(t) * (Rg - 0.1), Math.cos(t), 0, Math.sin(t), 'ledge'); }
  L.out(D, L.detailMat, 'shukhov-tower');
}

// ================================================================================================ 6. river-port cranes
// four level-luffing portal cranes on the cargo quay (Mytnytsia, ~z 3200-3450): the quay line is found by marching
// from land to the reservoir polygon; blue-grey portal straddling the rails, yellow slewing house + jib
function cranes(L) {
  const Wr = (L.map.water ?? []).map(r => r.map(ringPts));
  const isW = (x, z) => Wr.some(rs => inPoly(rs[0], x, z) && !rs.slice(1).some(h => inPoly(h, x, z)));
  const shore = (x, z, nx, nz) => { for (let d = 0; d < 90; d += 0.5) if (isW(x + nx * d, z + nz * d)) return [x + nx * d, z + nz * d]; return null; };
  const t0 = [-0.385, 0.923], n0 = [0.923, 0.385], D = new MB();
  let n = 0;
  for (const [zq, psi] of [[3215, 0.35], [3290, -0.2], [3365, 0.55], [3440, 0.05]]) {
    const xq = 1090 - 0.4167 * (zq - 3300) - 45;
    const A = shore(xq + t0[0] * -6, zq + t0[1] * -6, ...n0), B = shore(xq + t0[0] * 6, zq + t0[1] * 6, ...n0), M0 = shore(xq, zq, ...n0);
    if (!A || !B || !M0) continue;
    let tx = B[0] - A[0], tz = B[1] - A[1]; const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
    let nx = tz, nz = -tx; if (nx * n0[0] + nz * n0[1] < 0) { nx = -nx; nz = -nz; }
    const cx = M0[0] - nx * 8.5, cz = M0[1] - nz * 8.5;
    const F = Frame.along(cx, L.g(cx, cz) + 0.15, cz, -nz, nx); // local +b = seaward
    const [bx, bz] = F.d(0, 1); const Fr = (bx * nx + bz * nz) < 0 ? Frame.along(cx, F.oy, cz, nz, -nx) : F;
    crane(L, D, Fr, psi);
    n++;
  }
  L.out(D, L.detailMat, 'port-cranes');
  L.note(`${n} cranes`);
}
function crane(L, D, F, psi) {
  const { S, Z } = L;
  D.setXf(F.M).setPart(DP.PAINT).setColor(C.portal);
  for (const a of [-5, 5]) for (const b of [-5.25, 5.25]) {
    D.box(a - 0.45, 0.9, b - 0.45, a + 0.45, 9.6, b + 0.45); F.box(S, a - 0.45, b - 0.45, a + 0.45, b + 0.45, 0, 9.6, 'pole');
    D.setPart(DP.STEEL).setColor(0x2c2e30).box(a - 1.4, 0, b - 0.5, a + 1.4, 0.9, b + 0.5).setPart(DP.PAINT).setColor(C.portal);
  }
  for (const b of [-5.25, 5.25]) { D.tube([-5, 1.2, b], [5, 8.8, b], 0.15, 4); D.tube([5, 1.2, b], [-5, 8.8, b], 0.15, 4); }
  D.box(-6, 9.6, -5.9, 6, 10.8, 5.9); F.box(S, -6, -5.9, 6, 5.9, 9.6, 10.8, 'roof');
  D.setPart(DP.STEEL).setColor(0x3a3c3e).cyl(0, 10.8, 0, 3.2, 3.2, 0.8, 16, true); F.cyl(S, 0, 0, 10.8, 11.6, 3.1, 3.1, 'equipment');
  // slewing part: +a' = jib direction (seaward +b rotated by psi)
  const G = F.child(0, 11.6, 0, -PI / 2 + psi);
  D.setXf(G.M).setPart(DP.PAINT).setColor(C.yellow);
  D.box(-5.5, 0, -2.3, 2.2, 4.8, 2.3); G.box(S, -5.5, -2.3, 2.2, 2.3, 0, 4.8, 'roof');
  D.setPart(DP.CONC).setColor(0x6e6e6a).box(-7.2, 0.4, -2.1, -5.5, 3.6, 2.1); G.box(S, -7.2, -2.1, -5.5, 2.1, 0.4, 3.6, 'equipment');
  D.setPart(DP.PAINT).setColor(0xe8e4d8).box(2.2, 1.2, 0.5, 4.3, 4.0, 2.6); G.box(S, 2.2, 0.5, 4.3, 2.6, 1.2, 4.0, 'equipment');
  D.setPart(DP.GLASS).box(4.3, 2.2, 0.7, 4.36, 3.8, 2.4);
  D.setPart(DP.PAINT).setColor(C.yellow);
  const apex = [-0.8, 15.5, 0];
  for (const s of [-1.9, 1.9]) { beam(D, [-4.2, 4.8, s], apex, 0.5, 0.5); beam(D, [1.2, 4.8, s], apex, 0.45, 0.45); }
  const piv = [2.4, 4.0, 0], el = 0.62, Lb = 30, tip = [piv[0] + Math.cos(el) * Lb, piv[1] + Math.sin(el) * Lb, 0];
  beam(D, piv, tip, 1.3, 1.1);
  D.setPart(DP.STEEL).setColor(0x2c2e30).tube(apex, [piv[0] + Math.cos(el) * Lb * 0.72, piv[1] + Math.sin(el) * Lb * 0.72, 0], 0.09, 4);
  D.tube(tip, [tip[0], 2.0 - 11.6 + 16, 0], 0.05, 4).boxC(tip[0], 1.6 - 11.6 + 16, 0, 0.6, 1.0, 0.5);
  D.setPart(DP.PAINT).setColor(C.yellow).boxC(tip[0] + 0.3, tip[1], 0, 1.4, 1.2, 1.5);
  // jib collision: 6 sloped slabs along the boom
  for (let i = 0; i < 6; i++) {
    const u0 = i / 6 * Lb, u1 = (i + 1) / 6 * Lb, a0 = piv[0] + Math.cos(el) * u0, a1 = piv[0] + Math.cos(el) * u1, y0 = piv[1] + Math.sin(el) * u0, y1 = piv[1] + Math.sin(el) * u1;
    G.slope(S, [[a0, -0.65], [a1, -0.65], [a1, 0.65], [a0, 0.65]], y0 - 0.9, [[a0, y0 + 0.55, -0.65], [a1, y1 + 0.55, -0.65], [a1, y1 + 0.55, 0.65]], 'equipment');
  }
  G.edge(Z, -5.5, -2.3, 2.2, -2.3, 4.8, 0, -1, 'roofEdge', 3); G.edge(Z, 2.2, 2.3, -5.5, 2.3, 4.8, 0, 1, 'roofEdge', 3);
  G.top(Z, apex[0], apex[1] + 0.25, 0, 'signalMast'); G.cyl(S, apex[0], 0, apex[1] - 0.8, apex[1] + 0.25, 0.4, 0.4, 'pole');
  L.light(...G.wp(tip[0] + 0.3, tip[1] + 0.8, 0), 0.5);
  D.setXf(null);
}

// ================================================================================================ 8. Cherkasy-Arena
// raked stands (0.8 m rows, 0.4 m risers) swept along the running track wherever OSM has a grandstand (ways
// 928316618 / 928316619), blue seats with red sectors, concrete back walls; 4 floodlight masts at the corners
// the bowl: the inner stand edge is the loop at Rin around the segment C2 -> C1 (the track's straights)
const ARENA = (() => {
  const C1 = [-938.4, 296.2], C2 = [-1004.5, 355.4], hl = Math.hypot(C1[0] - C2[0], C1[1] - C2[1]);
  return { C1, C2, hl, u: [(C1[0] - C2[0]) / hl, (C1[1] - C2[1]) / hl], Rin: 52.2 };
})();
// the loop at radius r as a ring (n points per end)
const arenaRing = (r, n = 16) => {
  const { C1, C2, u } = ARENA, a0 = Math.atan2(u[1], u[0]), out = [];
  for (const [c, a] of [[C1, a0 - PI / 2], [C2, a0 + PI / 2]]) for (let k = 0; k <= n; k++) out.push([c[0] + r * Math.cos(a + PI * k / n), c[1] + r * Math.sin(a + PI * k / n)]);
  return out;
};
// the real arena is dug in level: flatten the terrain under the pitch and stands (call before the ground is built),
// else the lawn, pitch and track layers, cut differently over the ~7 m of relief, poke through each other
export function levelStadium(hf) { return hf.pad(arenaRing(ARENA.Rin + 24), 30); }

function stadium(L) {
  const { S, Z, g } = L;
  const stands = [928316618, 928316619].map(id => L.map.buildings.find(q => q.id === id)).filter(Boolean).map(q => ringPts(q.p));
  const inSt = (x, z) => stands.some(P => inPoly(P, x, z));
  const { C1, C2, hl, u, Rin } = ARENA, v = [-u[1], u[0]];
  const base = g((C1[0] + C2[0]) / 2, (C1[1] + C2[1]) / 2) + 0.15;
  L.clears.push((x, z) => { // the bowl inside the stands is open ground: no generated trees
    const t = Math.max(0, Math.min(hl, (x - C2[0]) * u[0] + (z - C2[1]) * u[1]));
    return Math.hypot(x - C2[0] - u[0] * t, z - C2[1] - u[1] * t) < Rin + 3;
  });
  const per = 2 * hl + 2 * PI * Rin, N = Math.round(per / 2.4);
  const at = (s) => { // inner stand edge point + outward normal along the stadium loop
    s = ((s % per) + per) % per;
    if (s < hl) return [[C2[0] + u[0] * s + v[0] * Rin, C2[1] + u[1] * s + v[1] * Rin], v];
    s -= hl; if (s < PI * Rin) { const f = s / Rin, n = [v[0] * Math.cos(f) + u[0] * Math.sin(f), v[1] * Math.cos(f) + u[1] * Math.sin(f)]; return [[C1[0] + n[0] * Rin, C1[1] + n[1] * Rin], n]; }
    s -= PI * Rin; if (s < hl) return [[C1[0] - u[0] * s - v[0] * Rin, C1[1] - u[1] * s - v[1] * Rin], [-v[0], -v[1]]];
    s -= hl; const f = s / Rin, n = [-v[0] * Math.cos(f) - u[0] * Math.sin(f), -v[1] * Math.cos(f) - u[1] * Math.sin(f)]; return [[C2[0] + n[0] * Rin, C2[1] + n[1] * Rin], n];
  };
  const sl = [];
  for (let i = 0; i <= N; i++) {
    const [p, n] = at(i / N * per);
    let d = 0; if (inSt(p[0] + n[0] * 1.0, p[1] + n[1] * 1.0)) { d = 1.0; while (d < 26 && inSt(p[0] + n[0] * (d + 0.5), p[1] + n[1] * (d + 0.5))) d += 0.5; }
    sl.push({ p, n, T: Math.floor(d / 0.8) });
  }
  for (let i = 1; i + 1 < sl.length; i++) if (sl[i].T === 0 && sl[i - 1].T && sl[i + 1].T) sl[i].T = Math.min(sl[i - 1].T, sl[i + 1].T); // fill 1-slice gaps
  const D = new MB(), Y0 = base + 1.0;
  const P = (q, d, y) => [q.p[0] + q.n[0] * d, y, q.p[1] + q.n[1] * d];
  for (let i = 0; i + 1 < sl.length; i++) {
    const A = sl[i], B = sl[i + 1], T = Math.min(A.T, B.T); if (T < 3) continue;
    const nm = [(A.n[0] + B.n[0]) / 2, 0, (A.n[1] + B.n[1]) / 2], sector = Math.floor(i / 9) % 5 === 2;
    for (let k = 0; k < T; k++) {
      const d0 = k * 0.8, d1 = d0 + 0.8, y = Y0 + (k + 1) * 0.4;
      D.setPart(DP.CONC).setColor(0x8f9090); surf(D, [P(A, d0, y - 0.4), P(B, d0, y - 0.4), P(B, d0, y), P(A, d0, y)], [-nm[0], 0, -nm[2]]);
      D.setPart(DP.PAINT).setColor(k % 7 === 6 ? 0xe8e8e8 : sector ? C.seatR : C.seatB); surf(D, [P(A, d0, y), P(B, d0, y), P(B, d1, y), P(A, d1, y)], [0, 1, 0]);
    }
    const dT = T * 0.8, yT = Y0 + T * 0.4;
    D.setPart(DP.CONC).setColor(0xb4b2ac);
    surf(D, [P(A, dT, base - 1), P(B, dT, base - 1), P(B, dT, yT + 1.2), P(A, dT, yT + 1.2)], nm); // back wall (outside)
    surf(D, [P(A, dT - 0.3, yT), P(B, dT - 0.3, yT), P(B, dT - 0.3, yT + 1.2), P(A, dT - 0.3, yT + 1.2)], [-nm[0], 0, -nm[2]]);
    surf(D, [P(A, dT - 0.3, yT + 1.2), P(B, dT - 0.3, yT + 1.2), P(B, dT, yT + 1.2), P(A, dT, yT + 1.2)], [0, 1, 0]);
    surf(D, [P(A, 0, base - 0.5), P(B, 0, base - 0.5), P(B, 0, Y0), P(A, 0, Y0)], [-nm[0], 0, -nm[2]]); // front wall
    // collision: raked prism y = 1.2 + 0.5 d, parapet
    const W = [[A.p[0], A.p[1]], [B.p[0], B.p[1]], [B.p[0] + B.n[0] * dT, B.p[1] + B.n[1] * dT], [A.p[0] + A.n[0] * dT, A.p[1] + A.n[1] * dT]];
    const q0 = [A.p[0], Y0 + 0.2, A.p[1]], q1 = [B.p[0], Y0 + 0.2, B.p[1]], q2 = [A.p[0] + A.n[0] * dT, Y0 + 0.2 + dT * 0.5, A.p[1] + A.n[1] * dT];
    const pl = planeOf(q0, q1, q2), Wc = area2(W) < 0 ? W.reverse() : W;
    if (pl) S.prism(Wc.flat(), base - 0.5, pl.a, pl.bx, pl.bz, 'roof');
    const Wp = [[A.p[0] + A.n[0] * (dT - 0.3), A.p[1] + A.n[1] * (dT - 0.3)], [B.p[0] + B.n[0] * (dT - 0.3), B.p[1] + B.n[1] * (dT - 0.3)], [B.p[0] + B.n[0] * dT, B.p[1] + B.n[1] * dT], [A.p[0] + A.n[0] * dT, A.p[1] + A.n[1] * dT]];
    S.prism((area2(Wp) < 0 ? Wp.reverse() : Wp).flat(), base - 0.5, yT + 1.2, 0, 0, 'parapet');
    if (i % 3 === 0) Z.add((Wp[0][0] + Wp[1][0] + Wp[2][0] + Wp[3][0]) / 4, yT + 1.2, (Wp[0][1] + Wp[1][1] + Wp[2][1] + Wp[3][1]) / 4, nm[0], 0, nm[2], 'roofEdge');
  }
  // floodlight masts on the diagonals, pushed out of the stands
  const M = [(C1[0] + C2[0]) / 2, (C1[1] + C2[1]) / 2], Lm = new MB();
  for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const c = su > 0 ? C1 : C2, dx = u[0] * su * 0.6 + v[0] * sv * 0.8, dz = u[1] * su * 0.6 + v[1] * sv * 0.8;
    let r = Rin + 12; while (r < Rin + 40 && inSt(c[0] + dx * r, c[1] + dz * r)) r += 1;
    const x = c[0] + dx * (r + 3), z = c[1] + dz * (r + 3), y0 = g(x, z), H = 44;
    const F = Frame.along(x, y0, z, M[0] - x, M[1] - z); // +a toward the pitch
    D.setXf(F.M).setPart(DP.GALV).setColor(0x9a9c9e).cyl(0, -0.5, 0, 0.75, 0.38, H + 0.5, 10, false);
    D.box(-0.3, H - 0.2, -3.6, 0.5, H + 3.6, 3.6).box(-1.2, H - 0.25, -3.8, 0.5, H - 0.05, 3.8);
    Lm.setXf(F.M); for (let r2 = 0; r2 < 4; r2++) for (let c2 = 0; c2 < 7; c2++) Lm.boxC(0.52, H + 0.35 + r2 * 0.85, -3.0 + c2, 0.06, 0.6, 0.75);
    F.cyl(S, 0, 0, 0, H, 0.72, 0.4, 'pole'); F.box(S, -1.2, -3.8, 0.5, 3.8, H - 0.25, H + 3.6, 'equipment');
    F.top(Z, -0.2, H + 3.6, 0, 'signalMast');
    L.light(...F.wp(-0.2, H + 3.8, 0), 0.45);
  }
  D.setXf(null); L.out(D, L.detailMat, 'stadium');
  Lm.setXf(null); L.out(Lm, L.mats.lamp, 'stadium-floodlights', false);
}


// ================================================================================================ 9. river station + flags
// Richkovyi vokzal (way 103630072): white neoclassical block with a two-tier colonnade / loggia toward the water and a
// low green-grey hipped roof (facade shader walls, columns + roof in the detail builder)
function riverStation(L) {
  const { S, Z } = L, b = L.map.buildings.find(q => q.id === 103630072); if (!b) return;
  const P = ringPts(b.p), o = obb(P); if (!o) return;
  const Wr = (L.map.water ?? []).map(r => r.map(ringPts)), isW = (x, z) => Wr.some(rs => inPoly(rs[0], x, z));
  let F = Frame.along(o.cx, groundMin(L.g, P) + 0.15, o.cz, o.ux, o.uz);
  const wet = (sg) => { let n = 0; for (let d = 20; d <= 120; d += 10) if (isW(...F.w(0, sg * d))) n++; return n; };
  if (wet(-1) > wet(1)) F = Frame.along(o.cx, F.oy, o.cz, -o.ux, -o.uz); // water on local +b
  const hl = o.L / 2, hw = o.W / 2, dep = 3.6, H1 = 5.6, H2 = 11.4, D = new MB().setXf(F.M), FB = new FacadeBuilder();
  // body walls (facade shader, punched windows) over the ring [a0..a1] x [-hw..hw-dep]
  const R = [[-hl + 0.4, -hw], [hl - 0.4, -hw], [hl - 0.4, hw - dep], [-hl + 0.4, hw - dep]].map(([a, c]) => F.w(a, c));
  if (area2(R) < 0) R.reverse();
  const pw = { floorH: H1, bayW: 3.3, winW: 0.5, winH: 0.62, layer: LAYER.STUCCO, base: LAYER.GRANITE, seed: 21, lintel: 1, depth: 0.25, tint: [1.1, 1.09, 1.05], baseY: F.oy - 1, topY: F.oy + H2 };
  for (let i = 0; i < 4; i++) { const [ax, az] = R[i], [bx, bz] = R[(i + 1) % 4], Le = Math.hypot(bx - ax, bz - az); FB.quad([bx, 0, bz], [(ax - bx) / Le, 0, (az - bz) / Le], Le, F.oy - 1, F.oy + H2, [(bz - az) / Le, 0, -(bx - ax) / Le], pw, STYLE.PUNCHED, -(0.6 + H1)); }
  F.box(S, -hl + 0.4, -hw, hl - 0.4, hw - dep, -1, H2, 'wall');
  L.out(FB, L.facadeMat, 'river-station-walls');
  // two-tier colonnade: round columns, gallery slab with a balustrade, entablature ring
  D.setPart(DP.CONC).setColor(0xeeebe4);
  const n = Math.max(4, Math.round((o.L - 3) / 3.4));
  for (let i = 0; i <= n; i++) {
    const a = -hl + 1.2 + i / n * (o.L - 2.4), c = hw - 0.7;
    D.cyl(a, -0.5, c, 0.46, 0.4, H1 + 0.5, 12, false).cyl(a, H1 + 0.55, c, 0.38, 0.33, H2 - H1 - 0.55, 12, false);
    D.boxC(a, 0.1, c, 1.1, 0.4, 1.1).boxC(a, H1 - 0.1, c, 1.0, 0.3, 1.0);
    F.cyl(S, a, c, -0.5, H2, 0.45, 0.36, 'wall');
  }
  D.box(-hl, H1, hw - dep, hl, H1 + 0.55, hw); F.box(S, -hl, hw - dep, hl, hw, H1, H1 + 0.55, 'ledge', OVERHANG);
  D.box(-hl + 0.6, H1 + 0.55, hw - 0.35, hl - 0.6, H1 + 1.6, hw - 0.1); // balustrade
  D.box(-hl - 0.3, H2, -hw - 0.3, hl + 0.3, H2 + 0.8, hw + 0.3); F.box(S, -hl - 0.3, -hw - 0.3, hl + 0.3, hw + 0.3, H2, H2 + 0.8, 'cornice');
  D.box(-hl, -0.6, -hw, hl, 0.25, hw); // stylobate
  // low hipped roof (4 planes, collision = the same planes)
  const ey = H2 + 0.8, rise = 3.2, ov = 0.5, A = hl + ov, B = hw + ov, rl = Math.max(0.5, A - B);
  D.setPart(DP.PAINT).setColor(0x6d7d74);
  const faces = [
    [[-A, ey, -B], [A, ey, -B], [rl, ey + rise, 0], [-rl, ey + rise, 0]], [[A, ey, B], [-A, ey, B], [-rl, ey + rise, 0], [rl, ey + rise, 0]],
    [[A, ey, -B], [A, ey, B], [rl, ey + rise, 0]], [[-A, ey, B], [-A, ey, -B], [-rl, ey + rise, 0]]];
  for (const f of faces) {
    let nrm = crs(sub(f[1], f[0]), sub(f[2], f[0])); if (nrm[1] < 0) nrm = nrm.map(v => -v); const nl = Math.hypot(...nrm);
    surf(D, f, nrm.map(v => v / nl));
    F.slope(S, f.map(p => [p[0], p[2]]), ey - 0.5, f, 'roof', OVERHANG);
  }
  F.edge(Z, -A, -B, A, -B, ey, 0, -1); F.edge(Z, A, B, -A, B, ey, 0, 1);
  L.out(D, L.detailMat, 'river-station');
}
// two 30 m flagpoles with Ukrainian flags on Soborna square, in front of the regional administration (ODA)
function flags(L) {
  const { S, Z, g } = L, D = new MB(), out = [];
  for (const [x, z] of [[18, -21], [18, 6]]) {
    const y0 = g(x, z), H = 30, F = new Frame(x, y0, z, 0);
    D.setXf(F.M).setPart(DP.GALV).setColor(0xc8cacc).cyl(0, -0.3, 0, 0.2, 0.09, H + 0.3, 10, false).cyl(0, 0, 0, 0.5, 0.45, 0.6, 10, true);
    D.setPart(DP.STEEL).setColor(0xd8b04a); sphere(D, 0, H + 0.2, 0, 0.25, 8);
    F.cyl(S, 0, 0, 0, H, 0.2, 0.1, 'pole'); F.top(Z, 0, H + 0.45, 0, 'pole'); F.cyl(S, 0, 0, H, H + 0.45, 0.25, 0.25, 'pole');
    out.push([x, y0 + H - 0.3, z]);
  }
  D.setXf(null); L.out(D, L.detailMat, 'flagpoles');
  return out;
}

// ================================================================================================ main
export function buildLandmarks({ root, T, map, solids, zips, heightAt, facadeMat, detailMat, geo }) {
  void T;
  const t0 = performance.now(), zipCount = () => (zips.raw ? zips.raw.length / 7 : 0), s0 = solids.count, z0 = zipCount();
  const g = typeof heightAt !== 'function' ? () => 0 : (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 0; };
  const glow = (r, gg, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, gg, b) }); // HDR colours: bloom picks them up
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const mats = {
    gold: std({ color: 0xd8a743, roughness: 0.26, metalness: 1 }),
    bronze: std({ color: 0x5e4a34, roughness: 0.42, metalness: 0.85 }),
    red: glow(2.2, 0.1, 0.06), lamp: glow(1.6, 1.55, 1.4), flame: glow(3.0, 1.1, 0.18), flameCore: glow(3.2, 2.6, 1.0),
    cloth: std({ side: THREE.DoubleSide, roughness: 0.8, vertexColors: true }),
  };
  const lights = [], flames = [], notes = [];
  let flagSpots = [], nV = 0, nM = 0;
  const place = (m, name, cast) => { Object.assign(m, { name: 'landmark-' + name, castShadow: cast }); root.add(m); return m; };
  const L = {
    map, S: solids, Z: zips, g, geo, detailMat, facadeMat, mats,
    out(mb, mat, name, shadow = true) {
      const count = mb.v ?? mb.n;
      if (!count) return null;
      const geom = mb instanceof MB ? mb.build({ part: mat === detailMat }) : mb.build();
      const m = place(new THREE.Mesh(geom, mat), name, shadow);
      m.receiveShadow = true; nV += count; nM++;
      return m;
    },
    light(x, y, z, s = 0.6) { lights.push([x, y, z, s]); },
    flame(x, y, z, s) { flames.push([x, y, z, s]); },
    note(s) { notes.push(s); },
    clears: [],
  };
  const MODELS = { cathedral, 'tv tower': tvTower, chimneys, shukhov, cranes, stadium, 'river station': riverStation, flags: (l) => { flagSpots = flags(l); } };
  for (const name in MODELS) {
    try { MODELS[name](L); } catch (e) { console.warn(`[cherkasy] landmark ${name} failed`, e); }
  }
  // obstruction lights (one mesh, blinking) + eternal flame
  let red = null;
  if (lights.length) {
    const D = new MB();
    lights.forEach(([x, y, z, s]) => D.boxC(x, y, z, s, s, s));
    red = L.out(D, mats.red, 'obstruction-lights', false);
  }
  const flameMeshes = flames.map(([x, y, z, s]) => {
    const outer = new MB(), core = new MB();
    lathe(outer, [[0.9, 0], [0.8, 0.7], [0.45, 1.6], [0, 2.5]].map(([r, h]) => [r * s, h * s]), 9);
    lathe(core, [[0.55, 0], [0.5, 0.5], [0.2, 1.3], [0, 1.7]].map(([r, h]) => [r * s, h * s]), 7);
    const m = place(new THREE.Mesh(outer.build(), mats.flame), 'eternal-flame', false);
    m.position.set(x, y, z);
    const inner = new THREE.Mesh(core.build(), mats.flameCore); inner.position.x = 0.12 * s; m.add(inner);
    nV += outer.v + core.v;
    return m;
  });
  // flags: a 6 x 4 m cloth, 14 x 6 cells, hoisted at its left edge; blue over yellow
  const FW = 6, FH = 4, FX = 14, FY = 6;
  const cloth = flagSpots.map(([x, y, z]) => {
    const g2 = new THREE.PlaneGeometry(FW, FH, FX, FY).translate(FW / 2, -FH / 2, 0), pos = g2.attributes.position.array;
    const col = new Float32Array(pos.length);
    for (let v = 0; v < pos.length / 3; v++) col.set(Math.floor(v / (FX + 1)) < FY / 2 ? [0, 0.12, 0.45] : [1, 0.72, 0], v * 3);
    g2.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = place(new THREE.Mesh(g2, mats.cloth), 'flag', true);
    m.position.set(x + 0.15, y, z); m.rotation.y = -0.6;
    nV += pos.length / 3;
    return { m, pos };
  });
  console.log(`[cherkasy] landmarks: ${nM} meshes, ${nV} vertices, ${solids.count - s0} solids, ${zipCount() - z0} zip points, ${lights.length} lights; ${notes.join(', ')} in ${(performance.now() - t0).toFixed(0)} ms`);
  let time = 0;
  return {
    clear: (x, z) => L.clears.some((f) => f(x, z)),
    update(dt) {
      time += dt;
      const nk = nightK.value;
      if (red) { const k = (time % 1.6 < 0.9 ? 1 : 0.25) * (1 + 0.6 * nk); mats.red.color.setRGB(2.2 * k, 0.1 * k, 0.06 * k); }
      mats.lamp.color.setScalar(1.2 + 0.8 * nk);
      for (const { m, pos } of cloth) { // the flags ripple in the wind: travelling waves growing toward the free edge
        for (let v = 0, n = pos.length / 3; v < n; v++) {
          const u = (v % (FX + 1)) / FX, row = Math.floor(v / (FX + 1)), ph = time * 3.1 - u * 5 + row * 0.15;
          pos[v * 3 + 2] = u * (0.2 * Math.sin(time * 5.3 - u * 9) + 0.5 * Math.sin(ph));
        }
        m.geometry.attributes.position.needsUpdate = true; m.geometry.computeVertexNormals();
      }
      flameMeshes.forEach((m, i) => {
        const f = i * 3 + time * 11;
        m.scale.set(1 + 0.08 * Math.sin(1.3 * f), 0.85 + 0.18 * Math.sin(f) * Math.sin(0.37 * f + 1), 1 + 0.08 * Math.cos(1.1 * f));
        m.rotation.y = 0.7 * time;
      });
    },
  };
}
