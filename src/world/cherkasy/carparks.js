// Parked cars on the city's ordinary car parks: the open-air lots of map.json `parking` (OSM amenity=parking, built by
// tools/cherkasy/build_map.mjs; underground / multi-storey / roof / garage rows / on-carriageway lanes are left out
// there) that no hand-built site fills with its own `parked` spots. Each lot gets rows of stalls laid out procedurally
// and a seeded share of them taken; the traffic sim streams the cars in and out by distance (npc/traffic.js
// addParkingLots), so only the lots near the camera hold live cars.
//
//   buildCarParks({ map, occ?, heightAt?, solids?, sites? = [], scene?, renderer? }) -> api
//     scene: where the faint stall lines go (one mesh for every lot, appended to as lots are laid out; none without)
//     occ: building raster (greenery.js footprintRaster; 1 = a building) or null; heightAt(x, z) -> terrain y;
//     solids: the collision world (topAt / groundHeight: trees, posts, site props, raised slabs) or null;
//     sites: the built sites: their `parked` spots take the lots they lie in, and a site's own `lot: { ring }` (Ekvator's
//     drift lot) keeps every lot whose centre lies in it empty; their clear(x, z) areas, where trees may not grow, are
//     no bar (a mall's own car park lies in them)
//   api.lots: [{ id, x, z, r, P ([[x, z]...]), side (street_side bays), spots() -> [[x, z, ry, y], ...] }]
//     spots() lays the lot out on its first call (lazy: the sim asks when the lot first comes in reach) and caches it
//   api.layout(lot) -> { bays: [{ x, z, ux, uz, w, d }], spots }  the stalls (taken or not) and the taken spots
//   api.stats() -> { lots, laidOut, bays, spots, lines, ms }
//   layoutBays(P, test, hint?) -> [{ x, z, ux, uz, w, d, aisle }]   (exported for tests) the best packing of stalls in a
//     polygon: rows of 2.5 x 5 m stalls in back-to-back pairs with a 6 m aisle between pairs, or 6 x 2.5 m parallel
//     bays along a strip, tried along the lot's main edge directions (and its OSM parking aisles); test(x, z) -> bool
//     says a point may carry a car. ux / uz: the row direction; a car stands along (-uz, ux) * (aisle side)
// Stalls stay 0.3 m inside the lot's edge, off every road carriageway and footway, buildings, trees and solids.
// Seeded by the OSM id, so a lot looks the same on every load.
import * as THREE from 'three';
import { ringPts, bboxOf, inPoly, hash01 } from './geo.js';
import { decalBias } from '../../render/renderer.js';

const PERP = { w: 2.5, d: 5, aisle: 6 }, PARA = { w: 6, d: 2.5, aisle: 3.5 };
const EDGE = 0.3;     // stalls keep this far inside the lot's outline
const STEP = 0.5;     // the row scan step along u when a stall does not fit

// the stall rectangle's test points, centre first (most misses fail there), then a lattice no coarser than 1.7 m over
// the rectangle grown by EDGE, so a footway cannot slip between them
const LAT = new Map();
function lattice(w, d) {
  const k = w + 'x' + d;
  if (!LAT.has(k)) {
    const nu = Math.ceil((w + 2 * EDGE) / 1.7), nv = Math.ceil((d + 2 * EDGE) / 1.7), pts = [w / 2, d / 2];
    for (let a = 0; a <= nu; a++) for (let b = 0; b <= nv; b++) pts.push(-EDGE + (w + 2 * EDGE) * a / nu, -EDGE + (d + 2 * EDGE) * b / nv);
    LAT.set(k, pts);
  }
  return LAT.get(k);
}
function stallFits(test, ux, uz, u0, v0, w, d) {
  const vx = -uz, vz = ux, L = lattice(w, d);
  for (let i = 0; i < L.length; i += 2) {
    const u = u0 + L[i], v = v0 + L[i + 1];
    if (!test(ux * u + vx * v, uz * u + vz * v)) return false;
  }
  return true;
}

// candidate row directions: the polygon's edge directions weighted by length (mod 90 degrees), then the hints
function directions(P, hint = []) {
  const bins = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 3) continue;
    let t = Math.atan2(b[1] - a[1], b[0] - a[0]);
    t = ((t % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
    const bin = bins.find((q) => Math.min(Math.abs(q.t - t), Math.PI / 2 - Math.abs(q.t - t)) < 0.05);
    if (bin) bin.L += L; else bins.push({ t, L });
  }
  bins.sort((p, q) => q.L - p.L);
  const out = hint.map((t) => ((t % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2));
  for (const b of bins) if (out.length < 3 && !out.some((t) => Math.min(Math.abs(t - b.t), Math.PI / 2 - Math.abs(t - b.t)) < 0.05)) out.push(b.t);
  return out;
}

// the u extent of the polygon (as [u, v] points) inside the band va <= v <= vb: its edges clipped to the band
function bandU(Q, va, vb) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < Q.length; i++) {
    const [ua, a] = Q[i], [ub, b] = Q[(i + 1) % Q.length];
    if (Math.max(a, b) < va || Math.min(a, b) > vb) continue;
    for (const v of [Math.max(va, Math.min(a, b)), Math.min(vb, Math.max(a, b))]) {
      const u = b === a ? (v === a ? Math.min(ua, ub) : ua) : ua + (ub - ua) * (v - a) / (b - a);
      const u2 = b === a ? Math.max(ua, ub) : u;
      if (u < lo) lo = u; if (u2 > hi) hi = u2;
    }
  }
  return [lo, hi];
}

export function layoutBays(P, test, hint = []) {
  let best = [];
  const area = Math.abs(P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  // a big lot gets a coarser search (it is laid out while the game runs): ~30 ms would show as a hitch
  const step = area > 6000 ? 1 : STEP, phases = area > 15000 ? 1 : area > 6000 ? 2 : 3;
  for (const t of directions(P, hint).slice(0, area > 15000 ? 2 : 3)) {
    for (const rot of [0, Math.PI / 2]) { // rows along the edge direction or across it
      const ux = Math.cos(t + rot), uz = Math.sin(t + rot), vx = -uz, vz = ux;
      let v0 = Infinity, v1 = -Infinity;
      const Q = P.map(([x, z]) => { const v = x * vx + z * vz; if (v < v0) v0 = v; if (v > v1) v1 = v; return [x * ux + z * uz, v]; });
      for (const S of [PERP, PARA]) {
        if (S === PARA && best.length > 12 && best[0].w === PERP.w) continue; // room for perpendicular rows: no parallel
        const period = 2 * S.d + S.aisle;
        for (let ph = 0; ph < phases; ph++) {
          const bays = [];
          // a pair: row A [s, s + d] with its aisle above, row B [s + d + aisle, s + 2d + aisle] with the aisle below;
          // the next pair's row A lies back to back against row B
          for (let s = v0 + EDGE - period + ph * period / phases; s < v1; s += period) {
            for (const [rv, side] of [[s, 1], [s + S.d + S.aisle, -1]]) {
              if (rv + S.d < v0 || rv > v1) continue;
              const [u0, u1] = bandU(Q, rv, rv + S.d);
              for (let u = u0 + EDGE; u + S.w <= u1;) {
                if (stallFits(test, ux, uz, u, rv, S.w, S.d)) {
                  const cu = u + S.w / 2, cv = rv + S.d / 2;
                  bays.push({ x: ux * cu + vx * cv, z: uz * cu + vz * cv, ux, uz, w: S.w, d: S.d, aisle: side });
                  u += S.w;
                } else u += step;
              }
            }
          }
          // perpendicular stalls hold more cars per metre; a parallel layout wins only by a clear margin
          const score = (b) => b.length * (b[0]?.w === PARA.w ? 1 : 1.15);
          if (score(bays) > score(best)) best = bays;
        }
      }
    }
  }
  return best;
}

// a road-segment grid over the lots: the distance test keeps stalls off carriageways and footways
function roadIndex(map, lots, cell = 32) {
  const want = new Set(), key = (i, j) => i * 65536 + j;
  for (const L of lots) {
    const b = L.bb;
    for (let i = Math.floor((b.x0 - 12) / cell); i <= Math.floor((b.x1 + 12) / cell); i++)
      for (let j = Math.floor((b.z0 - 12) / cell); j <= Math.floor((b.z1 + 12) / cell); j++) want.add(key(i, j));
  }
  const grid = new Map();
  for (const r of map.roads) {
    const p = r.p, hw = r.w / 2 + (r.k === 'p' ? 0.2 : 0.4);
    for (let k = 0; k + 3 < p.length; k += 2) {
      const ax = p[k], az = p[k + 1], bx = p[k + 2], bz = p[k + 3];
      const i0 = Math.floor((Math.min(ax, bx) - hw) / cell), i1 = Math.floor((Math.max(ax, bx) + hw) / cell);
      const j0 = Math.floor((Math.min(az, bz) - hw) / cell), j1 = Math.floor((Math.max(az, bz) + hw) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const kk = key(i, j);
        if (!want.has(kk)) continue;
        let b = grid.get(kk); if (!b) grid.set(kk, b = []);
        b.push(ax, az, bx, bz, hw, r.c === 'service' && r.w <= 5.5 ? 1 : 0);
      }
    }
  }
  return {
    // true when (x, z) is clear of every road's half width
    clear(x, z) {
      const b = grid.get(key(Math.floor(x / cell), Math.floor(z / cell)));
      if (!b) return true;
      for (let k = 0; k < b.length; k += 6) {
        const ax = b[k], az = b[k + 1], dx = b[k + 2] - ax, dz = b[k + 3] - az, hw = b[k + 4];
        const l2 = dx * dx + dz * dz, t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
        const ex = ax + dx * t - x, ez = az + dz * t - z;
        if (ex * ex + ez * ez < hw * hw) return false;
      }
      return true;
    },
    // directions of the narrow service ways (OSM parking aisles) inside a lot: the rows run along them
    aisles(P, bb) {
      const out = [];
      for (let i = Math.floor(bb.x0 / cell); i <= Math.floor(bb.x1 / cell); i++) for (let j = Math.floor(bb.z0 / cell); j <= Math.floor(bb.z1 / cell); j++) {
        const b = grid.get(key(i, j)); if (!b) continue;
        for (let k = 0; k < b.length; k += 6) {
          if (!b[k + 5]) continue;
          const mx = (b[k] + b[k + 2]) / 2, mz = (b[k + 1] + b[k + 3]) / 2;
          if (Math.hypot(b[k + 2] - b[k], b[k + 3] - b[k + 1]) > 8 && inPoly(P, mx, mz)) out.push(Math.atan2(b[k + 3] - b[k + 1], b[k + 2] - b[k]));
        }
      }
      return out.slice(0, 2);
    },
  };
}

// the stall lines: worn white 10 cm strokes along each stall's sides, draped on the ground in <= 2.5 m pieces like the
// road markings; one growing buffer, one draw call, written only when a lot is laid out
function createStallPaint(scene, renderer, surf) {
  let cap = 0, n = 0, pos = null, mesh = null;
  const geo = new THREE.BufferGeometry();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, name: 'stall-lines', transparent: true, opacity: 0.55, depthWrite: false });
  mat.color.setRGB(0.74, 0.74, 0.7);
  if (renderer) decalBias(mat, renderer, 1);
  function grow(need) {
    const c = Math.max(need, cap * 2, 16384), p = new Float32Array(c * 12), nrm = new Float32Array(c * 12), idx = new Uint32Array(c * 6);
    if (pos) p.set(pos.subarray(0, n * 12));
    for (let q = 0; q < c; q++) {
      for (let k = 0; k < 4; k++) nrm[q * 12 + k * 3 + 1] = 1;
      idx.set([q * 4, q * 4 + 2, q * 4 + 1, q * 4 + 1, q * 4 + 2, q * 4 + 3], q * 6);
    }
    pos = p; cap = c;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  const Y = 0.008;
  function add(ax, az, bx, bz, ex, ez) { // one quad: the stroke a -> b, half width (ex, ez)
    const at = (o, x, z) => { pos[o] = x; pos[o + 1] = surf(x, z) + Y; pos[o + 2] = z; };
    const o = n * 12;
    at(o, ax - ex, az - ez); at(o + 3, ax + ex, az + ez); at(o + 6, bx - ex, bz - ez); at(o + 9, bx + ex, bz + ez);
    n++;
  }
  return {
    get count() { return n; },
    paint(bays) {
      if (!bays.length) return;
      const seen = new Set(), segs = [];
      for (const b of bays) {
        const vx = -b.uz, vz = b.ux;
        for (const sgn of [-1, 1]) { // both long sides, each shared one only once
          const cx = b.x + b.ux * sgn * b.w / 2, cz = b.z + b.uz * sgn * b.w / 2, key = Math.round(cx * 4) + ',' + Math.round(cz * 4);
          if (seen.has(key)) continue;
          seen.add(key);
          segs.push([cx - vx * b.d / 2, cz - vz * b.d / 2, cx + vx * b.d / 2, cz + vz * b.d / 2, b.ux * 0.05, b.uz * 0.05]);
        }
      }
      let pieces = 0; for (const [ax, az, bx, bz] of segs) pieces += Math.ceil(Math.hypot(bx - ax, bz - az) / 2.5);
      if (n + pieces > cap) grow(n + pieces);
      const n0 = n;
      for (const [ax, az, bx, bz, ex, ez] of segs) {
        const k = Math.ceil(Math.hypot(bx - ax, bz - az) / 2.5);
        for (let i = 0; i < k; i++) add(ax + (bx - ax) * i / k, az + (bz - az) * i / k, ax + (bx - ax) * (i + 1) / k, az + (bz - az) * (i + 1) / k, ex, ez);
      }
      const P = geo.attributes.position; // ranges add up until the renderer uploads (and clears) them
      P.addUpdateRange?.(n0 * 12, (n - n0) * 12); P.needsUpdate = true;
      geo.setDrawRange(0, n * 6);
      if (!mesh) {
        mesh = new THREE.Mesh(geo, mat);
        Object.assign(mesh, { name: 'car park stall lines', frustumCulled: false, receiveShadow: true, matrixAutoUpdate: false, renderOrder: 1 });
        scene.add(mesh);
      }
    },
  };
}

export function buildCarParks({ map, occ = null, heightAt = null, solids = null, sites = [], scene = null, renderer = null }) {
  const t0 = performance.now();
  // the ground a car or a line stands on: the terrain, or a paved slab up to 0.6 m over it
  const surf = (x, z) => {
    const y = heightAt ? heightAt(x, z) : 0;
    if (!solids) return y;
    const gy = solids.groundHeight(x, z, y + 0.6);
    return Number.isFinite(gy) && gy > y && gy < y + 0.6 ? gy : y;
  };
  const paint = scene ? createStallPaint(scene, renderer, surf) : null;
  const taken = sites.flatMap((s) => s.parked ?? []); // the hand-built sites' own car parks
  const own = sites.map((s) => s.lot?.ring).filter((r) => r?.length > 2); // and the lots they keep empty
  const lots = [];
  for (const L of map.parking ?? []) {
    const P = ringPts(L.p), bb = bboxOf(P);
    if (taken.some(([x, z]) => x > bb.x0 && x < bb.x1 && z > bb.z0 && z < bb.z1 && inPoly(P, x, z))) continue;
    const x = (bb.x0 + bb.x1) / 2, z = (bb.z0 + bb.z1) / 2;
    if (own.some((R) => inPoly(R, x, z) || inPoly(R, P[0][0], P[0][1]))) continue;
    const lot = { id: L.id, x, z, r: Math.hypot(bb.x1 - bb.x0, bb.z1 - bb.z0) / 2, P, bb, side: !!L.s, cap: L.cap ?? 0, _lay: null };
    lot.spots = () => layout(lot).spots;
    lots.push(lot);
  }
  let roads = null, ms = 0;
  const _top = { id: -1, y: -Infinity };

  function layout(lot) {
    if (lot._lay) return lot._lay;
    const t = performance.now();
    roads ??= roadIndex(map, lots);
    const { P } = lot;
    // the exact test memoised on a 0.4 m lattice over the lot (its centres are within 0.28 m of any point, inside the
    // 0.3 m edge margin): the candidate layouts probe the same ground many times over
    const { x0, z0 } = lot.bb, C = 0.4, nx = Math.ceil((lot.bb.x1 - x0) / C) + 2, nz = Math.ceil((lot.bb.z1 - z0) / C) + 2;
    const memo = new Uint8Array(nx * nz);
    const ok = (x, z) => {
      const i = Math.floor((x - x0) / C), j = Math.floor((z - z0) / C);
      if (i < 0 || j < 0 || i >= nx || j >= nz) return false;
      const k = j * nx + i;
      if (!memo[k]) {
        const cx = x0 + (i + 0.5) * C, cz = z0 + (j + 0.5) * C;
        memo[k] = inPoly(P, cx, cz) && (!occ || occ.get(cx, cz) !== 1) && roads.clear(cx, cz) ? 1 : 2;
      }
      return memo[k] === 1;
    };
    const all = layoutBays(P, ok, roads.aisles(P, lot.bb));
    // trees, lamp posts, a site's props: anything standing in the stall (checked on the chosen layout only)
    const free = (b) => {
      if (!solids) return true;
      const vx = -b.uz, vz = b.ux, g = heightAt ? heightAt(b.x, b.z) : 0;
      for (const a of [-0.5, 0, 0.5]) for (const c of [-0.5, 0, 0.5]) {
        const x = b.x + b.ux * (a * (b.w + 0.4)) + vx * (c * (b.d + 0.4)), z = b.z + b.uz * (a * (b.w + 0.4)) + vz * (c * (b.d + 0.4));
        const top = solids.topAt(x, z, Infinity, _top);
        if (top.id >= 0 && top.y > (heightAt ? heightAt(x, z) : g) + 0.6) return false;
      }
      return true;
    };
    const bays = all.filter(free);
    // a seeded share of them taken (50–85 %), no more than the OSM capacity
    const fill = 0.5 + 0.35 * hash01(lot.id % 2147483647);
    let room = lot.cap > 0 ? lot.cap : Infinity;
    const spots = [];
    bays.forEach((b, i) => {
      if (room <= 0 || hash01((lot.id * 31 + i * 7919) | 0) >= fill) return;
      room--;
      const h = hash01((lot.id * 131 + i * 104729 + 17) | 0), j = hash01((lot.id * 977 + i * 31337 + 3) | 0) - 0.5;
      let fx, fz;
      if (b.w > b.d) { fx = b.ux; fz = b.uz; if (h < 0.5) { fx = -fx; fz = -fz; } } // parallel bay: either way along the kerb
      else { fx = b.uz * b.aisle; fz = -b.ux * b.aisle; if (h < 0.25) { fx = -fx; fz = -fz; } } // mostly nose in, away from the aisle
      const x = b.x + b.ux * j * 0.3, z = b.z + b.uz * j * 0.3;
      spots.push([x, z, Math.atan2(-fz, fx) + j * 0.06, surf(x, z)]);
    });
    lot._lay = { bays, spots };
    paint?.paint(bays);
    ms += performance.now() - t;
    return lot._lay;
  }

  ms += performance.now() - t0;
  return {
    lots, layout,
    stats() {
      let laid = 0, bays = 0, spots = 0;
      for (const l of lots) if (l._lay) { laid++; bays += l._lay.bays.length; spots += l._lay.spots.length; }
      return { lots: lots.length, laidOut: laid, bays, spots, lines: paint?.count ?? 0, ms: +ms.toFixed(1) };
    },
  };
}
