// 2D helpers for the OSM-driven Cherkasy modules (x / z metres). Rings are either flat [x0, z0, x1, z1, ...] (as in
// map.json) or point lists [[x, z], ...]; "positive" rings have area2 > 0 (the build_map outer-ring sense, whose edge
// normal (dz, -dx) points out of the solid), holes run the other way.
//
// Exports (names and meaning are the ones Oleg's Cherkasy modules call):
//   ringPts(flat) -> [[x, z], ...]
//   area2(P) -> twice the signed area;  areaOf(P) -> |area|;  centroid(P) -> [x, z] vertex mean;  bboxOf(P) -> {x0,z0,x1,z1}
//   inPoly(P, x, z) -> bool (even-odd)
//   hash01(n) -> [0, 1) stable integer hash;  rng(seed) -> () => [0, 1) seeded generator
//   triangulate(outer, holes = []) -> { pts: outer then hole points, tris: [[i, j, k], ...] } (any winding)
//   hull(P) -> convex hull, positive
//   convexParts(outer, holes = []) -> positive convex rings covering the polygon (for collision prisms)
//   obb(P) -> minimum-area rectangle { cx, cz, ux, uz (unit long axis), L, W (full long / short sizes), area } | null
//   BitRaster(x0, z0, x1, z1, cell): bitset over a rectangle; get(x, z) -> 1 / 0 (-1 outside), set(i, j),
//     tri(ax, az, bx, bz, cx, cz) marks the cells whose centre lies in the triangle
import * as THREE from 'three';
import { convexPieces, minRect } from '../buildings.js';

export function ringPts(F) {
  const out = new Array(F.length >> 1);
  for (let k = 0; k < out.length; k++) out[k] = [F[2 * k], F[2 * k + 1]];
  return out;
}

export function area2(P) {
  let s = 0, prev = P[P.length - 1];
  for (const cur of P) { s += prev[0] * cur[1] - cur[0] * prev[1]; prev = cur; }
  return s;
}
export const areaOf = (P) => Math.abs(area2(P)) * 0.5;

export function centroid(P) {
  let sx = 0, sz = 0;
  for (const p of P) { sx += p[0]; sz += p[1]; }
  return [sx / P.length, sz / P.length];
}

export function bboxOf(P) {
  const b = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  for (const p of P) {
    if (p[0] < b.x0) b.x0 = p[0];
    if (p[0] > b.x1) b.x1 = p[0];
    if (p[1] < b.z0) b.z0 = p[1];
    if (p[1] > b.z1) b.z1 = p[1];
  }
  return b;
}

// even-odd rule: count the edges a ray toward -x crosses
export function inPoly(P, x, z) {
  let odd = false, q = P[P.length - 1];
  for (const p of P) {
    if ((p[1] <= z) !== (q[1] <= z)) {
      const xc = q[0] + (p[0] - q[0]) * (z - q[1]) / (p[1] - q[1]);
      if (xc > x) odd = !odd;
    }
    q = p;
  }
  return odd;
}

// integer avalanche (xor-shift / multiply rounds) -> [0, 1)
export function hash01(n) {
  let h = Math.imul((n | 0) ^ 0x5bd1e995, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x165667b1);
  h ^= h >>> 13;
  h = Math.imul(h, 0x2545f491);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// small seeded generator: xorshift32 state, output scrambled by a multiply
export function rng(seed) {
  let s = (Math.imul(seed | 0, 0x9e3779b1) ^ 0x6c078965) >>> 0 || 0x1234567;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (Math.imul(s, 0x2c1b3c6d) >>> 0) / 4294967296;
  };
}

export function triangulate(outer, holes = []) {
  const toV = (R) => R.map((p) => new THREE.Vector2(p[0], p[1]));
  const pts = outer.concat(...holes);
  let faces = [];
  try { faces = THREE.ShapeUtils.triangulateShape(toV(outer), holes.map(toV)); } catch { faces = []; }
  return { pts, tris: faces };
}

// gift wrapping over the point set (footprints are small), positive result
export function hull(P) {
  const U = [];
  for (const p of P) if (!U.some((q) => q[0] === p[0] && q[1] === p[1])) U.push(p);
  if (U.length < 3) return U;
  let start = U[0];
  for (const p of U) if (p[0] < start[0] || (p[0] === start[0] && p[1] < start[1])) start = p;
  const H = [];
  let cur = start;
  for (let guard = 0; guard <= U.length; guard++) {
    H.push(cur);
    let nxt = U[0] === cur ? U[1] : U[0];
    for (const p of U) {
      if (p === cur) continue;
      const c = (nxt[0] - cur[0]) * (p[1] - cur[1]) - (nxt[1] - cur[1]) * (p[0] - cur[0]);
      const farther = Math.hypot(p[0] - cur[0], p[1] - cur[1]) > Math.hypot(nxt[0] - cur[0], nxt[1] - cur[1]);
      if (c < 0 || (c === 0 && farther)) nxt = p;
    }
    cur = nxt;
    if (cur === start) break;
  }
  return area2(H) < 0 ? H.reverse() : H;
}

export function convexParts(outer, holes = []) {
  return convexPieces(outer, holes).map((R) => (area2(R) < 0 ? R.slice().reverse() : R));
}

export function obb(P) {
  const r = minRect(P);
  return r ? { cx: r.cx, cz: r.cz, ux: r.ux, uz: r.uz, L: r.L, W: r.W, area: r.area } : null;
}

export class BitRaster {
  constructor(x0, z0, x1, z1, c) {
    this.x0 = x0; this.z0 = z0; this.c = c;
    this.nx = Math.ceil((x1 - x0) / c); this.nz = Math.ceil((z1 - z0) / c);
    this.bits = new Uint32Array(((this.nx * this.nz) >>> 5) + 1);
  }
  static from(o) { return Object.assign(Object.create(BitRaster.prototype), o); } // a plain copy (worker message) back
  get(x, z) {
    const i = Math.floor((x - this.x0) / this.c), j = Math.floor((z - this.z0) / this.c);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    const k = j * this.nx + i;
    return (this.bits[k >>> 5] >>> (k & 31)) & 1;
  }
  set(i, j) { const k = j * this.nx + i; this.bits[k >>> 5] |= 1 << (k & 31); }
  // scanline: per cell row, the triangle's x span at the row centre
  tri(ax, az, bx, bz, cx, cz) {
    const { c, x0, z0, nx, nz } = this;
    const j0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - z0) / c - 0.5)), j1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - z0) / c - 0.5));
    const E = [[ax, az, bx, bz], [bx, bz, cx, cz], [cx, cz, ax, az]];
    for (let j = j0; j <= j1; j++) {
      const z = z0 + (j + 0.5) * c;
      let lo = Infinity, hi = -Infinity;
      for (const [px, pz, qx, qz] of E) {
        if ((pz <= z) === (qz <= z)) continue;
        const x = px + (qx - px) * (z - pz) / (qz - pz);
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
      if (hi < lo) continue;
      const i0 = Math.max(0, Math.ceil((lo - x0) / c - 0.5)), i1 = Math.min(nx - 1, Math.floor((hi - x0) / c - 0.5));
      for (let i = i0; i <= i1; i++) this.set(i, j);
    }
  }
}

// ------------------------------------------------------------------------------------------------ worker transport
// BufferGeometry <-> plain object of typed arrays (postMessage with the returned transfer list, no copies)
export function packGeometry(g, transfer = []) {
  if (!g) return null;
  const attrs = [];
  for (const [name, a] of Object.entries(g.attributes)) { attrs.push({ name, array: a.array, size: a.itemSize, norm: a.normalized }); transfer.push(a.array.buffer); }
  const index = g.index ? g.index.array : null;
  if (index) transfer.push(index.buffer);
  return { attrs, index };
}
export function unpackGeometry(p) {
  if (!p) return null;
  const g = new THREE.BufferGeometry();
  for (const a of p.attrs) g.setAttribute(a.name, new THREE.BufferAttribute(a.array, a.size, a.norm));
  if (p.index) g.setIndex(new THREE.BufferAttribute(p.index, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
// true inside a dedicated worker (module workers included)
export const inWorker = () => typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope;
