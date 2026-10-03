// OWNER: cherkasy. The railway cutting from the former Lunacharka district toward the dam (issues #30, #34).
// OSM ways 155424121, 1185293818, 1267744218 and 160513339 all have cutting=yes. The 30 m DEM
// misses the narrow trench south of the Dakhnivska overpass. The route comes from map.rails; no parallel invented track.
// Issue #34: Odeska and Sumhaitska run 15–35 m from the track at the top of the cutting. The terrain lattice has 16 m
// cells, so a trench carved into it always tilted those streets sideways (up to 50 % cross-fall). The lattice is now
// left alone: the trench is its own fine surface (a STEP m raster, MESH m cells), a height function T(x, z) that heightAt takes the minimum
// with, and the ground triangles it touches are re-tessellated onto it. Its walls stop short of the streets, the garage
// rows and the buildings beside the line (the depth is cut back where they leave too little room), so their ground
// keeps its original level.
// shapeRailCut(hf, map, geo) -> { carved, length, route } | null: before the ground is built (and before
//   shapeOverpass): makes T and patches hf.heightAt = min(lattice, T) inside the cutting's box (hf.latticeAt keeps
//   the lattice: buildGroundData builds from it, so the worker and the synchronous ground agree). carved: raster nodes
//   lowered. map.buildings (when present) bounds the walls too.
// buildRailCut({ ground }) -> { clear(x,z), update(), stats } | null: re-tessellates the ground tiles the trench touches
//   (grass on the excavated slopes), no trees on the bed or the walls. ground: null skips the mesh work (tests).
// Rails, people, the car and trees read the patched heightAt; the buildings and the street strips (workers, lattice)
// lie outside the trench by construction. Width/depth are visual estimates, not surveyed levels. The north end rejoins
// the existing overpass profile before its road/rail shared cutting, leaving that module's spans and grades in charge.
import * as THREE from 'three';
import { crossing, cumulate, ease, pointAt, along } from './bridgekit.js';
import { SURF } from './ground.js';

const ENDS = [[49.4497451, 32.0233752], [49.4534998, 32.0199931], [49.4579472, 32.019947],
  [49.4586, 32.0199474], [49.4694278, 32.0258506]];
const AXIS = [[49.4660577, 32.0223845], [49.4666672, 32.0216036]];
const FLOOR_W = 5.5;    // flat bed half-width: the 2.55 m ballast plus a MESH cell diagonal, so a wall vertex never tilts it
const KMIN = 0.62, KMAX = 3; // wall slope (rise / run): the gentle grass bank where there is room, a near-vertical
                        // retaining bank by the streets and garages
const REACH = 45;       // the farthest a wall may run from the track
const STEP = 2;         // the trench raster (m)
const MESH = 2;         // the re-tessellation grid where the trench is (m)
const COARSE = 8;       // the re-tessellation grid elsewhere in a re-laid ground triangle (a multiple of MESH)
const DS = 2.5;         // station spacing along the route (m)
const GRADE = 0.03;     // the steepest the bed may rise where the depth is cut back
const KEEP = { road: 2, service: 1.5, building: 1.5 }; // room left between a wall's top and a street edge / a house
let shaped = null;

// signed offset of (x, z) from polyline L (+ to the left of its direction) and the arc length there
function nearest(L, cum, x, z) {
  let best = Infinity, s = 0, o = 0;
  for (let k = 1; k < L.length; k++) {
    const [ax, az] = L[k - 1], ex = L[k][0] - ax, ez = L[k][1] - az, len = cum[k] - cum[k - 1] || 1;
    const f = Math.min(len, Math.max(0, ((x - ax) * ex + (z - az) * ez) / len));
    const px = x - ax - ex * f / len, pz = z - az - ez * f / len, d = Math.hypot(px, pz);
    if (d < best) { best = d; s = cum[k - 1] + f; o = (ex * pz - ez * px) >= 0 ? d : -d; }
  }
  return { s, o };
}

export function shapeRailCut(hf, map, geo) {
  if (hf?.latticeAt) { hf.heightAt = hf.latticeAt; delete hf.latticeAt; } // a re-run starts from the lattice
  shaped = null;
  if (!hf?.data || !geo || !map.rails) return null;
  const ends = ENDS.map(([la, lo]) => geo.toXZ(la, lo)), route = [];
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 2;
  for (let k = 1; k < ends.length; k++) {
    const r = map.rails.find((r) => !r.sv && !r.br &&
      ((near(r.p.slice(0, 2), ends[k - 1]) && near(r.p.slice(-2), ends[k])) ||
       (near(r.p.slice(-2), ends[k - 1]) && near(r.p.slice(0, 2), ends[k]))));
    if (!r) return null; // a changed map must not cut an unrelated route
    const points = Array.from({ length: r.p.length / 2 }, (_, i) => r.p.slice(i * 2, i * 2 + 2));
    if (!near(points[0], ends[k - 1])) points.reverse();
    route.push(...points.slice(k > 1 ? 1 : 0));
  }
  const hit = crossing(route, ...AXIS.map(([la, lo]) => geo.toXZ(la, lo)));
  if (!hit) return null;
  const L = hf.heightAt, cum = cumulate(route);
  // The railway drops into the trench over ~500 m, stays below the Sosnivka hilltops, then climbs gently to
  // the existing overpass approach. Its original rail profile starts at s=-298, y=31 with a 3% back extension.
  const end = hit.s - 340, start = L(...route[0]);
  const profile = [[0, start], [500, 25.4], [950, 24.7], [1250, 26.1], [end, 32.26]];
  const level = (s) => {
    let k = 1;
    while (k < profile.length - 1 && profile[k][0] < s) k++;
    const [a, ya] = profile[k - 1], [b, yb] = profile[k];
    return ya + (yb - ya) * ease(a, b, s);
  };
  const reach = route.filter((_, i) => cum[i] < end + 80);
  const box = [Math.min(...reach.map(p => p[0])) - REACH - 6, Math.min(...reach.map(p => p[1])) - REACH - 6,
    Math.max(...reach.map(p => p[0])) + REACH + 6, Math.max(...reach.map(p => p[1])) + REACH + 6];
  const inBox = (x, z) => x >= box[0] && x <= box[2] && z >= box[1] && z <= box[3];

  // room on each side of every station: the streets (not their bridges), the garage lanes and the buildings beside the
  // line each block the wall at their distance less KEEP. An obstacle on the bed itself (a bridge abutment's end) is
  // not one: nothing crosses the cutting at grade.
  const n = Math.floor(end / DS) + 1, room = [new Float32Array(n).fill(REACH), new Float32Array(n).fill(REACH)];
  const block = (x, z, r) => {
    if (!inBox(x, z)) return;
    const q = nearest(route, cum, x, z), d = Math.abs(q.o);
    if (d < FLOOR_W + 0.5 || d > REACH + r) return;
    const side = q.o > 0 ? 0 : 1, i0 = Math.max(0, Math.ceil((q.s - r) / DS)), i1 = Math.min(n - 1, Math.floor((q.s + r) / DS));
    for (let i = i0; i <= i1; i++) {
      const w = Math.sqrt(Math.max(0, r * r - (i * DS - q.s) ** 2));
      room[side][i] = Math.min(room[side][i], d - w);
    }
  };
  const dense = (pts, step, r) => {
    for (let k = 1; k < pts.length; k++) {
      const [ax, az] = pts[k - 1], [bx, bz] = pts[k], m = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
      for (let j = 0; j <= m; j++) block(ax + (bx - ax) * j / m, az + (bz - az) * j / m, r);
    }
  };
  const pairs = (p) => Array.from({ length: p.length / 2 }, (_, i) => [p[2 * i], p[2 * i + 1]]);
  for (const r of map.roads ?? []) if (r.k === 'm' && !r.br) dense(pairs(r.p), 2, r.w / 2 + (r.c === 'service' ? KEEP.service : KEEP.road));
  for (const b of map.buildings ?? []) {
    let hit = false;
    for (let i = 0; i < b.p.length && !hit; i += 2) hit = inBox(b.p[i], b.p[i + 1]);
    if (!hit) continue;
    const ring = pairs(b.p); ring.push(ring[0]);
    dense(ring, 1, KEEP.building);
  }

  // the bed: the designed profile, raised where the room on either side cannot hold a wall that deep, then limited
  // to GRADE so the track never steps; each side's wall slope reaches the natural ground at its room
  const F = new Float32Array(n), K = [new Float32Array(n), new Float32Array(n)], G = new Float32Array(n);
  const P = [];
  for (let i = 0; i < n; i++) {
    const p = pointAt(route, cum, i * DS); P.push(p);
    const run = Math.max(0, Math.min(room[0][i], room[1][i]) - FLOOR_W);
    G[i] = L(p[0], p[1]);
    F[i] = Math.max(level(i * DS), G[i] - KMAX * run);
  }
  for (let i = 1; i < n; i++) F[i] = Math.max(F[i], F[i - 1] - GRADE * DS);
  for (let i = n - 2; i >= 0; i--) F[i] = Math.max(F[i], F[i + 1] - GRADE * DS);
  for (let side = 0; side < 2; side++) {
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const [x, z, dx, dz] = P[i], sg = side ? -1 : 1, r = room[side][i], run = r - FLOOR_W;
      const top = L(x - dz * sg * r, z + dx * sg * r);
      raw[i] = run < 0.5 ? KMAX : Math.min(KMAX, Math.max(KMIN, (top - F[i] + 0.3) / run));
    }
    for (let i = 0; i < n; i++) { // the steepest within ±10 m: walls stay smooth along the line and clear of everything
      let k = 0;
      for (let j = Math.max(0, i - 4); j <= Math.min(n - 1, i + 4); j++) k = Math.max(k, raw[j]);
      K[side][i] = k;
    }
  }
  const trench = (x, z) => {
    const q = nearest(route, cum, x, z);
    if (q.s <= 0 || q.s >= end || Math.abs(q.o) > REACH + 4) return Infinity;
    const u = q.s / DS, i = Math.min(n - 2, Math.floor(u)), f = u - i, side = q.o > 0 ? 0 : 1;
    const bed = F[i] + (F[i + 1] - F[i]) * f, k = K[side][i] + (K[side][i + 1] - K[side][i]) * f;
    return bed + Math.max(0, Math.abs(q.o) - FLOOR_W) * k;
  };

  // T on a STEP raster over the box (Infinity: no trench); heightAt and the mesh both read its bilinear form
  const rx = Math.ceil((box[2] - box[0]) / STEP) + 1, rz = Math.ceil((box[3] - box[1]) / STEP) + 1;
  const T = new Float32Array(rx * rz).fill(Infinity);
  let carved = 0;
  for (let j = 0; j < rz; j++) for (let i = 0; i < rx; i++) {
    const x = box[0] + i * STEP, z = box[1] + j * STEP;
    if (along(reach, x, z).d > REACH + 6) continue;
    const t = trench(x, z);
    T[j * rx + i] = t;
    if (t < L(x, z) - 0.02) carved++;
  }
  const Tq = (x, z) => {
    const u = (x - box[0]) / STEP, v = (z - box[1]) / STEP, i = Math.floor(u), j = Math.floor(v);
    if (i < 0 || j < 0 || i >= rx - 1 || j >= rz - 1) return Infinity;
    const s = u - i, t = v - j, k = j * rx + i, a = T[k], b = T[k + 1], c = T[k + rx], d = T[k + rx + 1];
    if (a === Infinity || b === Infinity || c === Infinity || d === Infinity) return Infinity;
    return (1 - t) * ((1 - s) * a + s * b) + t * ((1 - s) * c + s * d);
  };
  hf.latticeAt = L; // the ground mesh is built from the lattice alone (also without workers), then re-laid here
  hf.heightAt = (x, z) => {
    const h = L(x, z);
    if (x < box[0] || x > box[2] || z < box[1] || z > box[3]) return h;
    const t = Tq(x, z);
    return t < h ? t : h;
  };
  shaped = { route, cum, end, box, L, Tq, T, rx, rz };
  return { carved, length: end, route };
}

export function buildRailCut({ ground }) {
  if (!shaped) return null;
  const { route, end, box, L, Tq, T, rx, rz } = shaped;
  const depth = (x, z) => { const t = Tq(x, z); return t === Infinity ? 0 : Math.max(0, L(x, z) - t); };
  const clear = (x, z) => {
    if (x < box[0] || x > box[2] || z < box[1] || z > box[3]) return false;
    if (depth(x, z) > 0.05) return true;
    const q = along(route, x, z);
    return q.s > 0 && q.s < end && q.d < FLOOR_W + 4;
  };
  const stats = { dropped: 0, verts: 0 };
  const site = { clear, update() {}, stats };
  const tiles = (ground?.root?.children ?? []).filter((m) => m.material?.name === 'cherkasy-ground' && m.geometry?.index);
  if (!tiles.length) return site;

  // nodes where the trench is below the lattice: a ground triangle near one is re-tessellated (a generous test, an
  // extra triangle is rebuilt as it was), so every triangle kept has the trench clear of all its edges: no cracks
  const active = new Uint8Array(rx * rz);
  for (let j = 0; j < rz; j++) for (let i = 0; i < rx; i++) {
    const k = j * rx + i;
    if (T[k] !== Infinity && T[k] < L(box[0] + i * STEP, box[1] + j * STEP) - 0.005) active[k] = 1;
  }
  const near = (x0, z0, x1, z1, m = 3) => {
    const i0 = Math.max(0, Math.floor((x0 - m - box[0]) / STEP)), i1 = Math.min(rx - 1, Math.ceil((x1 + m - box[0]) / STEP));
    const j0 = Math.max(0, Math.floor((z0 - m - box[1]) / STEP)), j1 = Math.min(rz - 1, Math.ceil((z1 + m - box[1]) / STEP));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (active[j * rx + i]) return true;
    return false;
  };
  const natural = new Set([SURF.YARD, SURF.FOREST, SURF.DIRT, SURF.SAND, SURF.FARM, SURF.SCRUB, SURF.GRASS]);
  const out = { p: [], n: [], s: [], i: [] }, keys = new Map();
  const clip = (poly, ax, az, bx, bz, sgn) => { // keep the part of a convex polygon left of a->b (sgn: winding)
    const res = [], side = ([x, z]) => sgn * ((bx - ax) * (z - az) - (bz - az) * (x - ax));
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k], q = poly[(k + 1) % poly.length], sp = side(p), sq = side(q);
      if (sp >= 0) res.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const f = sp / (sp - sq); res.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]); }
    }
    return res;
  };
  for (const m of tiles) {
    const geo = m.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (bb.max.x < box[0] || bb.min.x > box[2] || bb.max.z < box[1] || bb.min.z > box[3]) continue;
    const Pp = geo.attributes.position.array, Nn = geo.attributes.normal.array, Sf = geo.attributes.aSurf.array, I = geo.index.array;
    let hit = 0;
    for (let k = 0; k < I.length; k += 3) {
      const a = I[k], b = I[k + 1], c = I[k + 2];
      if (a === b && b === c) continue;
      const A = [Pp[3 * a], Pp[3 * a + 2]], B = [Pp[3 * b], Pp[3 * b + 2]], C = [Pp[3 * c], Pp[3 * c + 2]];
      const x0 = Math.min(A[0], B[0], C[0]), x1 = Math.max(A[0], B[0], C[0]), z0 = Math.min(A[1], B[1], C[1]), z1 = Math.max(A[1], B[1], C[1]);
      if (x1 < box[0] || x0 > box[2] || z1 < box[1] || z0 > box[3] || !near(x0, z0, x1, z1)) continue;
      const det = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
      if (Math.abs(det) < 1e-9) continue;
      const bary = (x, z) => { const u = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (z - C[1])) / det, v = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (z - C[1])) / det; return [u, v, 1 - u - v]; };
      const sgn = det > 0 ? 1 : -1, s0 = Sf[a];
      const vert = (x, z, surf) => {
        const [u, v, w] = bary(x, z), plane = u * Pp[3 * a + 1] + v * Pp[3 * b + 1] + w * Pp[3 * c + 1];
        const t = Tq(x, z), off = t === Infinity ? 0 : Math.min(0, t - L(x, z));
        // shared across the re-laid triangles: an edge point of two neighbours of one layer has one height
        const key = `${Math.round(x * 1000)},${Math.round(z * 1000)},${Math.round((plane + off) * 1000)},${surf}`;
        let id = keys.get(key);
        if (id !== undefined) return id;
        let nx, ny, nz;
        if (off < -0.01) { nx = Tq(x - 0.5, z) - Tq(x + 0.5, z); ny = 1; nz = Tq(x, z - 0.5) - Tq(x, z + 0.5); }
        else { nx = u * Nn[3 * a] + v * Nn[3 * b] + w * Nn[3 * c]; ny = u * Nn[3 * a + 1] + v * Nn[3 * b + 1] + w * Nn[3 * c + 1]; nz = u * Nn[3 * a + 2] + v * Nn[3 * b + 2] + w * Nn[3 * c + 2]; }
        if (!Number.isFinite(nx) || !Number.isFinite(nz)) { nx = 0; ny = 1; nz = 0; }
        const l = Math.hypot(nx, ny, nz) || 1;
        id = out.p.length / 3;
        out.p.push(x, plane + off, z); out.n.push(nx / l, ny / l, nz / l); out.s.push(surf);
        keys.set(key, id);
        return id;
      };
      // COARSE cells the trench does not reach are laid whole (their surface is the old plane, so the finer
      // neighbours' extra edge points lie on it: no cracks); the others in MESH cells
      const cell = (qx, qz, size) => {
        let poly = [[qx, qz], [qx + size, qz], [qx + size, qz + size], [qx, qz + size]];
        poly = clip(poly, ...A, ...B, sgn); if (poly.length < 3) return;
        poly = clip(poly, ...B, ...C, sgn); if (poly.length < 3) return;
        poly = clip(poly, ...C, ...A, sgn); if (poly.length < 3) return;
        let deep = 0;
        for (const [x, z] of poly) deep = Math.max(deep, depth(x, z));
        const surf = deep > 0.6 && natural.has(s0) ? SURF.GRASS : s0;
        const ids = poly.map(([x, z]) => vert(x, z, surf));
        for (let q = 1; q + 1 < ids.length; q++) out.i.push(...(sgn > 0 ? [ids[0], ids[q], ids[q + 1]] : [ids[0], ids[q + 1], ids[q]]));
      };
      const i0 = Math.floor((x0 - box[0]) / COARSE), i1 = Math.ceil((x1 - box[0]) / COARSE), j0 = Math.floor((z0 - box[1]) / COARSE), j1 = Math.ceil((z1 - box[1]) / COARSE);
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
        const qx = box[0] + i * COARSE, qz = box[1] + j * COARSE;
        if (!near(qx, qz, qx + COARSE, qz + COARSE, MESH)) { cell(qx, qz, COARSE); continue; }
        for (let b = 0; b < COARSE; b += MESH) for (let a = 0; a < COARSE; a += MESH) cell(qx + a, qz + b, MESH);
      }
      I[k + 1] = I[k + 2] = a; hit++; // the original triangle collapses: the fine copy replaces it
    }
    if (hit) { geo.index.needsUpdate = true; stats.dropped += hit; }
  }
  if (!out.i.length) return site;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.n, 3));
  g.setAttribute('aSurf', new THREE.Float32BufferAttribute(out.s, 1));
  g.setIndex(out.i);
  g.computeBoundingSphere();
  const mesh = Object.assign(new THREE.Mesh(g, tiles[0].material), { name: 'ground railcut', receiveShadow: true, castShadow: tiles[0].castShadow });
  ground.root.add(mesh);
  stats.verts = out.p.length / 3;
  console.log(`[cherkasy] railway cutting: ${stats.dropped} ground triangles re-laid, ${stats.verts} verts`);
  return site;
}
