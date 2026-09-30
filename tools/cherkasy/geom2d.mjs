// 2D helpers for the map compiler (build_map.mjs). Points are [x, z] pairs; rings are open (no repeated last point).
// Vector: signedArea2(P) (twice the signed area, > 0 = ccw in x/z), ringArea, vertexMean, asCCW, asCW,
//   simplify(P, tol, closed) (Douglas-Peucker), boundsOf -> {x0,z0,x1,z1}, pointInRing (even-odd), distToSegment,
//   minAreaRect(P) -> {area,long,short}, edgesOf(P, closed) (generator of [a, b]), GridIndex (bbox bucket index).
// Raster (row-major Float32Array grids, nx columns x nz rows, edges clamped): gauss, erode / dilate (box min / max),
//   scanFill (even-odd rasterising of rings into a Uint8Array), pushPullFill (inpainting), chamfer (distance in cells).

export function signedArea2(P) {
  const last = P.length - 1;
  return P.reduce((acc, a, k) => { const b = P[k === last ? 0 : k + 1]; return acc + (a[0] * b[1] - a[1] * b[0]); }, 0);
}
export const ringArea = (P) => Math.abs(signedArea2(P)) * 0.5;
export function vertexMean(P) {
  const m = P.length;
  return [P.reduce((acc, p) => acc + p[0], 0) / m, P.reduce((acc, p) => acc + p[1], 0) / m];
}
export const asCCW = (P) => (signedArea2(P) < 0 ? [...P].reverse() : P);
export const asCW = (P) => (signedArea2(P) > 0 ? [...P].reverse() : P);

export function* edgesOf(P, closed) {
  const n = P.length;
  for (let k = closed ? 0 : 1; k < n; k++) yield closed ? [P[k], P[k + 1 < n ? k + 1 : 0]] : [P[k - 1], P[k]];
}

// Douglas-Peucker with an explicit index stack; a closed ring also loses a nearly straight vertex at index 0
export function simplify(P, tol, closed) {
  const n = P.length; if (n < 3) return P;
  const keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
  const stack = [0, n - 1];
  while (stack.length) {
    const hi = stack.pop(), lo = stack.pop();
    const ox = P[lo][0], oz = P[lo][1], ex = P[hi][0] - ox, ez = P[hi][1] - oz, len = Math.hypot(ex, ez);
    let far = tol, pick = -1;
    for (let k = lo + 1; k < hi; k++) {
      const rx = P[k][0] - ox, rz = P[k][1] - oz;
      const dev = len < 1e-9 ? Math.hypot(rx, rz) : Math.abs(rx * ez - rz * ex) / len;
      if (dev > far) { far = dev; pick = k; }
    }
    if (pick >= 0) { keep[pick] = 1; stack.push(lo, pick, pick, hi); }
  }
  const out = P.filter((_, k) => keep[k] === 1);
  if (!closed || out.length <= 3) return out;
  const prev = out[out.length - 1], cur = out[0], next = out[1];
  const sx = next[0] - prev[0], sz = next[1] - prev[1], span = Math.hypot(sx, sz);
  if (span > 1e-9 && Math.abs((cur[0] - prev[0]) * sz - (cur[1] - prev[1]) * sx) / span < tol) return out.slice(1);
  return out;
}

export function boundsOf(P) {
  const b = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  for (const p of P) {
    b.x0 = Math.min(b.x0, p[0]); b.x1 = Math.max(b.x1, p[0]);
    b.z0 = Math.min(b.z0, p[1]); b.z1 = Math.max(b.z1, p[1]);
  }
  return b;
}

export function pointInRing(P, x, z) {
  let flips = 0, b = P[P.length - 1];
  for (const a of P) {
    const straddles = a[1] > z ? b[1] <= z : b[1] > z; // edge a-b crosses the horizontal line through z
    if (straddles) {
      const xCross = a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]);
      if (x < xCross) flips++;
    }
    b = a;
  }
  return (flips & 1) === 1;
}

export function distToSegment(px, pz, ax, az, bx, bz) {
  const ux = bx - ax, uz = bz - az, qq = ux * ux + uz * uz, wx = px - ax, wz = pz - az;
  let t = 0;
  if (qq > 0) { const raw = (wx * ux + wz * uz) / qq; t = raw < 0 ? 0 : raw > 1 ? 1 : raw; }
  return Math.hypot(wx - ux * t, wz - uz * t);
}

// minimum-area rectangle over the edge directions (edges shorter than 0.5 m ignored)
export function minAreaRect(P) {
  let bestA = Infinity, sa = 0, sb = 0;
  for (const [a, b] of edgesOf(P, true)) {
    const ex = b[0] - a[0], ez = b[1] - a[1], len = Math.hypot(ex, ez);
    if (!(len >= 0.5)) continue;
    const cx = ex / len, cz = ez / len;
    let lo = Infinity, hi = -Infinity, lo2 = Infinity, hi2 = -Infinity;
    for (const p of P) {
      const along = p[0] * cx + p[1] * cz, across = p[1] * cx - p[0] * cz;
      lo = Math.min(lo, along); hi = Math.max(hi, along); lo2 = Math.min(lo2, across); hi2 = Math.max(hi2, across);
    }
    const area = (hi - lo) * (hi2 - lo2);
    if (area < bestA) { bestA = area; sa = hi - lo; sb = hi2 - lo2; }
  }
  return bestA === Infinity ? { area: 0, long: 0, short: 0 } : { area: bestA, long: Math.max(sa, sb), short: Math.min(sa, sb) };
}

// uniform bucket grid; query() visits every item whose inserted box touches the query square once, in cell-major order
export class GridIndex {
  constructor(size) { this.size = size; this.cells = new Map(); }
  static key(i, j) { return (i + 32768) * 65536 + (j + 32768); }
  insert(x0, z0, x1, z1, item) {
    const s = this.size, ia = Math.floor(x0 / s), ib = Math.floor(x1 / s), ja = Math.floor(z0 / s), jb = Math.floor(z1 / s);
    for (let i = ia; i <= ib; i++) for (let j = ja; j <= jb; j++) {
      const key = GridIndex.key(i, j), list = this.cells.get(key);
      if (list) list.push(item); else this.cells.set(key, [item]);
    }
  }
  query(x, z, r, visit) {
    const s = this.size, ia = Math.floor((x - r) / s), ib = Math.floor((x + r) / s), ja = Math.floor((z - r) / s), jb = Math.floor((z + r) / s);
    const done = new Set();
    for (let i = ia; i <= ib; i++) for (let j = ja; j <= jb; j++) {
      const list = this.cells.get(GridIndex.key(i, j)); if (!list) continue;
      for (const item of list) { if (done.has(item)) continue; done.add(item); visit(item); }
    }
  }
}

// ------------------------------------------------------------------------------------------------ raster grids
// one clamped 1D pass along rows (axis 0) or columns (axis 1): acc = seed(centre); acc = fold(acc, sample, tap)
function linePass(src, nx, nz, axis, rad, seed, fold) {
  const out = new Float32Array(src.length);
  const len = axis ? nz : nx, step = axis ? nx : 1, lines = axis ? nx : nz, lineStep = axis ? 1 : nx;
  for (let l = 0; l < lines; l++) {
    const base = l * lineStep;
    for (let p = 0; p < len; p++) {
      let acc = seed(src[base + p * step]);
      for (let t = 0; t <= 2 * rad; t++) {
        let q = p + t - rad; if (q < 0) q = 0; else if (q > len - 1) q = len - 1;
        acc = fold(acc, src[base + q * step], t);
      }
      out[base + p * step] = acc;
    }
  }
  return out;
}
const separable = (src, nx, nz, rad, seed, fold) => linePass(linePass(src, nx, nz, 0, rad, seed, fold), nx, nz, 1, rad, seed, fold);

export function gauss(src, nx, nz, rad) {
  const sigma2 = 2 * (rad / 2) ** 2, w = [];
  let sum = 0;
  for (let t = -rad; t <= rad; t++) { const g = Math.exp(-(t * t) / sigma2); w.push(g); sum += g; }
  const K = w.map(g => g / sum);
  return separable(src, nx, nz, rad, () => 0, (acc, v, t) => acc + K[t] * v);
}
export const erode = (src, nx, nz, rad) => separable(src, nx, nz, rad, v => v, (a, v) => (v < a ? v : a));
export const dilate = (src, nx, nz, rad) => separable(src, nx, nz, rad, v => v, (a, v) => (v > a ? v : a));

// even-odd scanline fill of rings (grid node (i, j) sits at (gx0 + i * cell, gz0 + j * cell)), limited to the rings' box
export function scanFill(mask, g, rings) {
  const { nx, nz, x0: gx0, z0: gz0, cell } = g, bb = boundsOf(rings[0]);
  const iLo = Math.max(0, Math.floor((bb.x0 - gx0) / cell)), iHi = Math.min(nx - 1, Math.ceil((bb.x1 - gx0) / cell));
  const jLo = Math.max(0, Math.floor((bb.z0 - gz0) / cell)), jHi = Math.min(nz - 1, Math.ceil((bb.z1 - gz0) / cell));
  for (let j = jLo; j <= jHi; j++) {
    const z = gz0 + j * cell, cross = [];
    for (const R of rings) for (const [a, b] of edgesOf(R, true)) {
      if ((a[1] > z) === (b[1] > z)) continue;
      cross.push(a[0] + (z - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    cross.sort((p, q) => p - q);
    for (let c = 1; c < cross.length; c += 2) {
      const from = Math.max(iLo, Math.ceil((cross[c - 1] - gx0) / cell)), to = Math.min(iHi, Math.floor((cross[c] - gx0) / cell));
      mask.fill(1, j * nx + from, Math.max(j * nx + from, j * nx + to + 1));
    }
  }
}

// Jacobi-style inpainting: each round, every unknown cell (not frozen) with known 4-neighbours takes their mean
export function pushPullFill(E, known, frozen, nx, nz, rounds) {
  for (let it = 0; it < rounds; it++) {
    const nextE = E.slice(), nextK = known.slice();
    let grew = 0;
    for (let k = 0; k < E.length; k++) {
      if (known[k] || frozen[k]) continue;
      const i = k % nx, j = (k - i) / nx;
      let sum = 0, cnt = 0;
      // neighbour order (+x, -x, +z, -z) fixes the float summation order
      if (i + 1 < nx && known[k + 1]) { sum += E[k + 1]; cnt++; }
      if (i > 0 && known[k - 1]) { sum += E[k - 1]; cnt++; }
      if (j + 1 < nz && known[k + nx]) { sum += E[k + nx]; cnt++; }
      if (j > 0 && known[k - nx]) { sum += E[k - nx]; cnt++; }
      if (cnt) { nextE[k] = sum / cnt; nextK[k] = 1; grew++; }
    }
    E = nextE; known = nextK;
    if (!grew) break;
  }
  return E;
}

// two-pass 8-neighbour chamfer distance (1 / 1.414 cells) from the set cells of mask
export function chamfer(mask, nx, nz) {
  const D = Float32Array.from(mask, (m) => (m ? 0 : 1e9));
  // sw = +-1: relax cell k from its already visited row / column / diagonal neighbours on the side the sweep came from
  const relax = (k, sw) => {
    const i = k % nx, hasX = sw < 0 ? i > 0 : i < nx - 1, hasZ = sw < 0 ? k >= nx : k < D.length - nx;
    let d = D[k];
    if (hasX) d = Math.min(d, D[k + sw] + 1);
    if (hasZ) d = Math.min(d, D[k + sw * nx] + 1);
    if (hasX && hasZ) d = Math.min(d, D[k + sw * nx + sw] + 1.414);
    D[k] = d;
  };
  for (let k = 0; k < D.length; k++) relax(k, -1);
  for (let k = D.length - 1; k >= 0; k--) relax(k, 1);
  return D;
}
