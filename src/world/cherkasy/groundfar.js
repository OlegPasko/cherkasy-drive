// The far version of the ground's 1 km units (ground.js draws it beyond the level's `far` distance instead of the
// unit's full tile): one draped sheet per unit whose surface comes from a 1 m map of surface ids, not from geometry.
// A full unit is 20-170 thousand triangles (every polygon of every layer cut along the 16 m terrain lattice); its
// sheet is a few hundred to a few thousand, drawn by the same shader, so from afar the two look the same.
//
//   farLattice(hf) -> Float32Array   the lattice the sheets stand on: hf's own, lowered in the cells where a site
//     overlays hf.heightAt (hf.latticeAt set, railcut.js; hf.overlays: [[x0, z0, x1, z1]] the boxes to look in), so a
//     sheet never covers what was dug below the lattice. Main thread, before the far worker starts.
//   buildFarData({ layers, hf: { meta, grid }, units: [[i, j, coarse?]] }) -> { units: [far], stats }   (worker; CPU only)
//     layers: [[polygons (flat multi-rings), surface id | (rings) -> id]] bottom first, a later one paints over
//     coarse: a 2 m id map (a light unit on the fringe: fields and a road)
//     far = { i, j, position, normal, index (the sheet), rv, rl, size (the id map, run-length: ids + 1, 0 = no land;
//       size texels a side: UNIT, UNIT / 2, or 1 when the whole unit is one surface), y0, y1, tris, steps, mixed }
//   decodeIds(rv, rl, size, out?) -> Uint8Array(size x size)   the id map of one unit, row by row from its (x0, z0)
//     corner (into `out` when given: ground.js decodes into one scratch buffer for the upload)
//
// Unit (i, j) is the square [x0 + i UNIT, x0 + (i + 1) UNIT] x [z0 + ...] of the height field's own frame, so its
// borders are lattice lines and every near piece lies in exactly one unit.
// The sheet: a quadtree over the unit's lattice cells (BLOCK = 8 cells, 128 m, at the top; 64 / 32 / 16 m below): a
//   square stays whole when its two triangles, split along the valley diagonal, stay within TOL of the lattice, and
//   only with a ring of plain land cells round it inside the unit, so the unit's border and the shore keep the
//   lattice's own heights. A whole square's corners go down by its largest overshoot (MARGIN more), and a lattice node
//   on a coarser square's edge goes down onto that edge (the larger squares first), so the sheet is never above the
//   terrain – whatever a site drapes a few centimetres over the ground stays visible on it – and has no steps. A
//   square with finer neighbours is a fan from the middle of its diagonal through their nodes: watertight without
//   skirts. Only the unit's border gets one (SKIRT m down, facing out), against the neighbour's full tiles.
// The shore: the shader does not discard, so a lattice cell that land covers only partly ("mixed") is not a sheet quad:
//   every layer's triangles are cut to it instead, the way the full tiles cut them (so there the sheet is the full
//   tiles' surface, without the layer offsets), coloured by the map, which is dilated a texel into the void. Open
//   water stays open, and the land's edge is the polygon's own.
import { ringPts, triangulate } from './geo.js';

export const FAR = { UNIT: 1024, BLOCK: 8, TOL: 0.5, SKIRT: 1.5, MARGIN: 0.03 };

export function farLattice(hf) {
  const { meta, grid } = hf.data;
  if (!hf.latticeAt) return grid;
  const { x0, z0, cell, nx, nz } = meta, out = Float32Array.from(grid), L = hf.latticeAt, H = hf.heightAt, K = 5;
  const boxes = hf.overlays ?? [[x0, z0, x0 + (nx - 1) * cell, z0 + (nz - 1) * cell]];
  for (const [bx0, bz0, bx1, bz1] of boxes) {
    const i0 = Math.max(0, Math.floor((bx0 - x0) / cell)), i1 = Math.min(nx - 2, Math.floor((bx1 - x0) / cell));
    const j0 = Math.max(0, Math.floor((bz0 - z0) / cell)), j1 = Math.min(nz - 2, Math.floor((bz1 - z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      let dig = 0; // the deepest the overlay goes under the lattice in this cell
      for (let b = 0; b < K; b++) for (let a = 0; a < K; a++) {
        const x = x0 + (i + (a + 0.5) / K) * cell, z = z0 + (j + (b + 0.5) / K) * cell, d = L(x, z) - H(x, z);
        if (d > dig) dig = d;
      }
      if (dig < 0.05) continue;
      for (const k of [j * nx + i, j * nx + i + 1, (j + 1) * nx + i, (j + 1) * nx + i + 1]) out[k] = Math.min(out[k], grid[k] - dig);
    }
  }
  return out;
}

export function decodeIds(rv, rl, size = FAR.UNIT, out = new Uint8Array(size * size)) {
  for (let k = 0, o = 0; k < rv.length; k++) { const n = rl[k]; out.fill(rv[k], o, o + n); o += n; }
  return out;
}
function encodeIds(ids) {
  let runs = 0;
  for (let k = 0, n = 0, cur = -1; k < ids.length; k++) { if (ids[k] !== cur || n === 65535) { runs++; cur = ids[k]; n = 0; } n++; }
  const rv = new Uint8Array(runs), rl = new Uint16Array(runs);
  for (let k = 0, r = -1, n = 0, cur = -1; k < ids.length; k++) {
    if (ids[k] !== cur || n === 65535) { r++; cur = ids[k]; rv[r] = cur; n = 0; }
    rl[r] = ++n;
  }
  return { rv, rl };
}

// Sutherland-Hodgman of a flat polygon [x, z, ...] against one axis-aligned line: keeps sign * (p[axis] - v) >= 0
function clip(P, axis, v, sign) {
  const out = [], n = P.length;
  let px = P[n - 2], pz = P[n - 1], sp = sign * ((axis ? pz : px) - v);
  for (let k = 0; k < n; k += 2) {
    const qx = P[k], qz = P[k + 1], sq = sign * ((axis ? qz : qx) - v);
    if (sp < 0 !== sq < 0) { const f = sp / (sp - sq); out.push(px + f * (qx - px), pz + f * (qz - pz)); }
    if (sq >= 0) out.push(qx, qz);
    px = qx; pz = qz; sp = sq;
  }
  return out;
}

export function buildFarData({ layers, hf, units }) {
  const t0 = performance.now();
  const { meta, grid } = hf, { x0: ox, z0: oz, cell, nx, nz } = meta;
  const U = FAR.UNIT, NC = U / cell, BL = FAR.BLOCK, NB = NC / BL;
  const want = new Map();
  let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
  for (const [i, j, half] of units) {
    want.set(i * 4096 + j, { i, j, half: !!half, ids: new Uint8Array(U * U), state: new Uint8Array(NC * NC), P: [], N: [], I: [], mixed: 0 });
    if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
  }
  const stats = { ms: 0, units: want.size, tris: 0, verts: 0, mapBytes: 0, texels: 0, steps: [0, 0, 0, 0], mixed: 0, pieces: 0 };
  if (!want.size) return { units: [], stats };
  // texel columns / rows of the wanted range, in the height field's frame (1 m texels, sampled at their centres)
  const C0 = i0 * U, C1 = (i1 + 1) * U - 1, R0 = j0 * U, R1 = (j1 + 1) * U - 1;
  const X0 = ox + C0, X1 = ox + C1 + 1, Z0 = oz + R0, Z1 = oz + R1 + 1;

  // ---- 1. the id maps: every layer's triangles painted in draw order (scanline, texel centres)
  const T = []; // the triangles that reach the wanted range, kept for the shore cells
  const paint = (ax, az, bx, bz, cx, cz, v) => {
    const r0 = Math.max(R0, Math.ceil(Math.min(az, bz, cz) - oz - 0.5)), r1 = Math.min(R1, Math.floor(Math.max(az, bz, cz) - oz - 0.5));
    for (let r = r0; r <= r1; r++) {
      const z = oz + r + 0.5;
      let lo = Infinity, hi = -Infinity, x;
      if ((az <= z) !== (bz <= z)) { x = ax + (bx - ax) * (z - az) / (bz - az); if (x < lo) lo = x; if (x > hi) hi = x; }
      if ((bz <= z) !== (cz <= z)) { x = bx + (cx - bx) * (z - bz) / (cz - bz); if (x < lo) lo = x; if (x > hi) hi = x; }
      if ((cz <= z) !== (az <= z)) { x = cx + (ax - cx) * (z - cz) / (az - cz); if (x < lo) lo = x; if (x > hi) hi = x; }
      const c0 = Math.max(C0, Math.ceil(lo - ox - 0.5)), c1 = Math.min(C1, Math.floor(hi - ox - 0.5));
      if (c1 < c0) continue;
      const uj = Math.floor(r / U), row = (r - uj * U) * U;
      for (let ui = Math.floor(c0 / U), ue = Math.floor(c1 / U); ui <= ue; ui++) {
        const m = want.get(ui * 4096 + uj);
        if (m) m.ids.fill(v, row + Math.max(c0, ui * U) - ui * U, row + Math.min(c1, ui * U + U - 1) - ui * U + 1);
      }
    }
  };
  for (const [polys, surf] of layers) {
    for (const rings of polys ?? []) {
      const { pts, tris } = triangulate(ringPts(rings[0]), rings.slice(1).map(ringPts));
      const v = (typeof surf === 'function' ? surf(rings) : surf) + 1;
      for (const [a, b, c] of tris) {
        const A = pts[a], B = pts[b], C = pts[c];
        if (Math.max(A[0], B[0], C[0]) < X0 || Math.min(A[0], B[0], C[0]) > X1 || Math.max(A[1], B[1], C[1]) < Z0 || Math.min(A[1], B[1], C[1]) > Z1) continue;
        paint(A[0], A[1], B[0], B[1], C[0], C[1], v);
        T.push(A[0], A[1], B[0], B[1], C[0], C[1]);
      }
    }
  }

  // ---- 2. lattice cells: 0 no land, 1 all land, 2 mixed (the shore; also any hole the polygons leave)
  const GW = (i1 - i0 + 1) * NC, mixedAt = new Uint8Array(GW * (j1 - j0 + 1) * NC); // the mixed cells of the whole range
  for (const m of want.values()) {
    const { ids, state } = m;
    for (let cb = 0; cb < NC; cb++) for (let ca = 0; ca < NC; ca++) {
      let n = 0;
      for (let v = cb * cell, ve = v + cell; v < ve; v++) for (let o = v * U + ca * cell, oe = o + cell; o < oe; o++) if (ids[o]) n++;
      const s = n === 0 ? 0 : n === cell * cell ? 1 : 2;
      state[cb * NC + ca] = s;
      if (s === 2) { m.mixed++; mixedAt[((m.j - j0) * NC + cb) * GW + (m.i - i0) * NC + ca] = 1; }
    }
    // a texel of land colour into the void beside it: a clipped piece's fragment at the polygon's very edge reads it
    if (m.mixed) for (let cb = 0; cb < NC; cb++) for (let ca = 0; ca < NC; ca++) {
      if (state[cb * NC + ca] !== 2) continue;
      for (let v = cb * cell, ve = v + cell; v < ve; v++) for (let u = ca * cell, ue = u + cell; u < ue; u++) {
        const o = v * U + u;
        if (ids[o]) continue;
        ids[o] = (u > 0 && ids[o - 1]) || (v > 0 && ids[o - U]) || (u < U - 1 && ids[o + 1]) || (v < U - 1 && ids[o + U]) || 0;
      }
    }
    stats.mixed += m.mixed;
  }

  // ---- 3. the terrain under a point: the lattice, bilinear (what heightAt is)
  const node = (a, b) => grid[(b < 0 ? 0 : b >= nz ? nz - 1 : b) * nx + (a < 0 ? 0 : a >= nx ? nx - 1 : a)];
  const bil = (x, z) => {
    const u = (x - ox) / cell, v = (z - oz) / cell, a = Math.floor(u), b = Math.floor(v), s = u - a, t = v - b;
    return (1 - t) * ((1 - s) * node(a, b) + s * node(a + 1, b)) + t * ((1 - s) * node(a, b + 1) + s * node(a + 1, b + 1));
  };
  const normal = (N, x, z) => {
    const e = 3, gx = (bil(x - e, z) - bil(x + e, z)) / (2 * e), gz = (bil(x, z - e) - bil(x, z + e)) / (2 * e), l = Math.hypot(gx, 1, gz);
    N.push(gx / l, 1 / l, gz / l);
  };

  // ---- 4. the shore cells: every kept triangle that reaches a mixed cell is cut along the lattice the way the full
  // tiles cut it (ground.js drapeTri: rows first, then columns, each piece fanned from its first vertex). A piece is
  // not flat (its corners stand on a bilinear patch), so fanned another way it would rise above the full tile on a
  // steep bank; cut the same way the sheet is the full tiles' own surface there, a layer offset lower.
  const mixedIn = (a, b) => mixedAt[(b - j0 * NC) * GW + a - i0 * NC];
  for (let k = 0; k < T.length; k += 6) {
    const tri = [T[k], T[k + 1], T[k + 2], T[k + 3], T[k + 4], T[k + 5]];
    const ta0 = Math.floor((Math.min(tri[0], tri[2], tri[4]) - ox) / cell), ta1 = Math.floor((Math.max(tri[0], tri[2], tri[4]) - ox) / cell);
    const tb0 = Math.floor((Math.min(tri[1], tri[3], tri[5]) - oz) / cell), tb1 = Math.floor((Math.max(tri[1], tri[3], tri[5]) - oz) / cell);
    const a0 = Math.max(i0 * NC, ta0), a1 = Math.min((i1 + 1) * NC - 1, ta1), b0 = Math.max(j0 * NC, tb0), b1 = Math.min((j1 + 1) * NC - 1, tb1);
    let any = false;
    for (let b = b0; b <= b1 && !any; b++) for (let a = a0; a <= a1; a++) if (mixedIn(a, b)) { any = true; break; }
    if (!any) continue;
    let rest = tri;
    for (let b = tb0; b <= tb1 && rest.length >= 6; b++) {
      const row = b < tb1 ? clip(rest, 1, oz + (b + 1) * cell, -1) : rest;
      if (b < tb1) rest = clip(rest, 1, oz + (b + 1) * cell, 1);
      if (b < b0 || b > b1 || row.length < 6) continue;
      let last = -1; // the row's last mixed cell: the columns are cut up to it
      for (let a = a1; a >= a0; a--) if (mixedIn(a, b)) { last = a; break; }
      let cols = row;
      for (let a = ta0; a <= last && cols.length >= 6; a++) {
        const P = a < ta1 ? clip(cols, 0, ox + (a + 1) * cell, -1) : cols;
        if (a < ta1) cols = clip(cols, 0, ox + (a + 1) * cell, 1);
        if (a < a0 || P.length < 6 || !mixedIn(a, b)) continue;
        const m = want.get(Math.floor(a / NC) * 4096 + Math.floor(b / NC));
        if (!m) continue;
        let area = 0;
        for (let q = 0, n = P.length; q < n; q += 2) area += P[q] * P[(q + 3) % n] - P[(q + 2) % n] * P[q + 1];
        if (Math.abs(area) < 1e-3) continue;
        const base = m.P.length / 3, cnt = P.length / 2;
        for (let q = 0; q < P.length; q += 2) {
          const x = Math.round(P[q] * 20) / 20, z = Math.round(P[q + 1] * 20) / 20; // the full tiles' 5 cm vertex grid
          m.P.push(x, bil(x, z), z); normal(m.N, x, z);
        }
        // with y up a positive ring fanned in order faces down: fan it in reverse
        for (let q = 2; q < cnt; q++) m.I.push(base, base + (area > 0 ? q : q - 1), base + (area > 0 ? q - 1 : q));
        stats.pieces += cnt - 2;
      }
    }
  }

  // ---- 5. the sheets
  const out = [], NN = NC + 1;
  for (const m of want.values()) {
    const { state, P, N, I } = m, ga = m.i * NC, gb = m.j * NC, ux = ox + m.i * U, uz = oz + m.j * U;
    const h = (a, b) => node(ga + a, gb + b);
    const Y = new Float32Array(NN * NN), size = new Uint8Array(NC * NC), coarse = [], steps = [0, 0, 0, 0];
    for (let b = 0; b < NN; b++) for (let a = 0; a < NN; a++) Y[b * NN + a] = h(a, b);
    // how far the two triangles of the cell (a, b, s) leave the lattice: [most above, most below]
    const fit = (a0, b0, s) => {
      const A = h(a0, b0), B = h(a0 + s, b0), C = h(a0, b0 + s), D = h(a0 + s, b0 + s), w = A - B - C + D;
      let up = 0, dn = 0;
      for (let fb = 0; fb <= s; fb++) for (let fa = 0; fa <= s; fa++) {
        const u = fa / s, v = fb / s;
        const y = w > 0 ? (u + v <= 1 ? A + (B - A) * u + (C - A) * v : D + (C - D) * (1 - u) + (B - D) * (1 - v))
          : (u >= v ? A + (B - A) * u + (D - B) * v : A + (C - A) * v + (D - C) * u);
        const d = y - h(a0 + fa, b0 + fb);
        if (d > up) up = d; else if (-d > dn) dn = -d;
      }
      return [up, dn];
    };
    // a coarse cell keeps a ring of plain land cells round it inside the unit: the unit's border and the shore keep
    // the lattice's own heights, so the sheet meets its neighbours (full tiles, other sheets, shore pieces) exactly
    const roomy = (a0, b0, s) => {
      if (a0 < 1 || b0 < 1 || a0 + s > NC - 1 || b0 + s > NC - 1) return false;
      for (let b = b0 - 1; b <= b0 + s; b++) for (let a = a0 - 1; a <= a0 + s; a++) if (state[b * NC + a] !== 1) return false;
      return true;
    };
    const cut = (a, b, s) => { // quadtree: the largest cells that fit the terrain within TOL
      if (a >= NC || b >= NC || s === 1) return;
      if (roomy(a, b, s)) {
        const [up, dn] = fit(a, b, s);
        if (up + dn <= FAR.TOL) {
          coarse.push({ a, b, s, up });
          for (let q = b; q < b + s; q++) size.fill(s, q * NC + a, q * NC + a + s);
          return;
        }
      }
      const c = s / 2;
      cut(a, b, c); cut(a + c, b, c); cut(a, b + c, c); cut(a + c, b + c, c);
    };
    for (let b = 1; b < NC; b += FAR.BLOCK) for (let a = 1; a < NC; a += FAR.BLOCK) cut(a, b, FAR.BLOCK);
    // node heights: a coarse cell's corners go down by its overshoot, so its triangles are on or under the lattice
    // (a corner takes the largest of the cells round it); then, large cells first, the nodes along a coarse cell's
    // edge go down onto that edge, so the finer cells beside it meet it without a step. Heights only ever go down.
    for (const c of coarse) for (const k of [c.b * NN + c.a, c.b * NN + c.a + c.s, (c.b + c.s) * NN + c.a, (c.b + c.s) * NN + c.a + c.s]) {
      const y = h(k % NN, Math.floor(k / NN)) - c.up - FAR.MARGIN;
      if (y < Y[k]) Y[k] = y;
    }
    coarse.sort((p, q) => q.s - p.s);
    for (const { a, b, s } of coarse) {
      for (const [k0, dk] of [[b * NN + a, 1], [(b + s) * NN + a, 1], [b * NN + a, NN], [b * NN + a + s, NN]]) {
        const y0 = Y[k0], y1 = Y[k0 + dk * s];
        for (let q = 1; q < s; q++) { const y = y0 + (y1 - y0) * q / s; if (y < Y[k0 + dk * q]) Y[k0 + dk * q] = y; }
      }
    }
    // vertices: one per lattice node in use
    const vid = new Int32Array(NN * NN).fill(-1);
    const vert = (a, b) => {
      const k = b * NN + a;
      if (vid[k] < 0) { vid[k] = P.length / 3; P.push(ux + a * cell, Y[k], uz + b * cell); normal(N, ux + a * cell, uz + b * cell); }
      return vid[k];
    };
    // the size of the cell across an edge at fine cell (a, b): 1 for a plain cell
    const sizeAt = (a, b) => size[b * NC + a] || 1;
    for (const { a, b, s } of coarse) {
      steps[s === 8 ? 0 : s === 4 ? 1 : 2]++;
      // the ring round the cell in the up-facing order (00 -> 01 -> 11 -> 10), with every node a finer neighbour uses
      const ring = [];
      for (let q = 0; q < s; q++) if (q === 0 || (b + q - 1) % sizeAt(a - 1, b + q) === 0) ring.push(vert(a, b + q));         // x = a, +z
      for (let q = 0; q < s; q++) if (q === 0 || (a + q - 1) % sizeAt(a + q, b + s) === 0) ring.push(vert(a + q, b + s));     // z = b + s, +x
      for (let q = s; q > 0; q--) if (q === s || (b + q - 1) % sizeAt(a + s, b + q) === 0) ring.push(vert(a + s, b + q));     // x = a + s, -z
      for (let q = s; q > 0; q--) if (q === s || (a + q - 1) % sizeAt(a + q, b - 1) === 0) ring.push(vert(a + q, b));         // z = b, -x
      const y00 = Y[b * NN + a], y10 = Y[b * NN + a + s], y01 = Y[(b + s) * NN + a], y11 = Y[(b + s) * NN + a + s], valley = y00 - y10 - y01 + y11 > 0;
      if (ring.length === 4) { // two triangles along the valley diagonal: on or under the bilinear patch
        const [v00, v01, v11, v10] = ring;
        if (valley) I.push(v00, v01, v10, v10, v01, v11); else I.push(v00, v11, v10, v00, v01, v11);
        continue;
      }
      // a fan from the middle of the valley diagonal: the same two planes, through the neighbours' nodes
      const c = P.length / 3, cx = ux + (a + s / 2) * cell, cz = uz + (b + s / 2) * cell;
      P.push(cx, valley ? (y10 + y01) / 2 : (y00 + y11) / 2, cz); normal(N, cx, cz);
      for (let q = 0; q < ring.length; q++) I.push(c, ring[q], ring[(q + 1) % ring.length]);
    }
    for (let b = 0; b < NC; b++) for (let a = 0; a < NC; a++) {
      if (size[b * NC + a] || state[b * NC + a] !== 1) continue;
      steps[3]++;
      const v00 = vert(a, b), v10 = vert(a + 1, b), v01 = vert(a, b + 1), v11 = vert(a + 1, b + 1);
      if (Y[b * NN + a] - Y[b * NN + a + 1] - Y[(b + 1) * NN + a] + Y[(b + 1) * NN + a + 1] > 0) I.push(v00, v01, v10, v10, v01, v11); else I.push(v00, v11, v10, v00, v01, v11);
    }
    // a skirt along the unit's border (SKIRT m down, facing out): the neighbour's edge lies on the same line, but its
    // vertices are elsewhere along it, and without the skirt single pixels of sky would show through the seam
    const skirt = (a0, b0, a1, b1, outX, outZ) => {
      const v0 = vert(a0, b0), v1 = vert(a1, b1), base = P.length / 3;
      for (const v of [v0, v1]) { P.push(P[3 * v], P[3 * v + 1] - FAR.SKIRT, P[3 * v + 2]); N.push(N[3 * v], N[3 * v + 1], N[3 * v + 2]); }
      // the wall (v0, v1, v1', v0') has the normal (ez, -ex)
      if ((b1 - b0) * outX - (a1 - a0) * outZ > 0) I.push(v0, v1, base + 1, v0, base + 1, base); else I.push(v0, base + 1, v1, v0, base, base + 1);
    };
    for (let q = 0; q < NC; q++) {
      if (state[q] === 1) skirt(q, 0, q + 1, 0, 0, -1);
      if (state[(NC - 1) * NC + q] === 1) skirt(q, NC, q + 1, NC, 0, 1);
      if (state[q * NC] === 1) skirt(0, q, 0, q + 1, -1, 0);
      if (state[q * NC + NC - 1] === 1) skirt(NC, q, NC, q + 1, 1, 0);
    }
    if (!I.length) continue;
    let y0 = Infinity, y1 = -Infinity;
    for (let k = 1; k < P.length; k += 3) { if (P[k] < y0) y0 = P[k]; if (P[k] > y1) y1 = P[k]; }
    // the map as it is stored: one texel when the unit is a single surface, every other texel for a coarse unit
    let ids = m.ids, side = U;
    if (ids.every((v) => v === ids[0])) { ids = ids.subarray(0, 1); side = 1; }
    else if (m.half) {
      side = U / 2; ids = new Uint8Array(side * side);
      for (let v = 0; v < side; v++) for (let u = 0; u < side; u++) ids[v * side + u] = m.ids[2 * v * U + 2 * u];
    }
    const { rv, rl } = encodeIds(ids), nv = P.length / 3;
    out.push({ i: m.i, j: m.j, position: new Float32Array(P), normal: new Float32Array(N), index: nv > 65535 ? new Uint32Array(I) : new Uint16Array(I),
      rv, rl, size: side, y0, y1, tris: I.length / 3, steps, mixed: m.mixed });
    stats.texels += side * side;
    stats.tris += I.length / 3; stats.verts += nv; stats.mapBytes += rv.byteLength + rl.byteLength;
    for (let k = 0; k < 4; k++) stats.steps[k] += steps[k];
  }
  stats.ms = Math.round(performance.now() - t0);
  return { units: out, stats };
}
