// Lazy raster of a polygon set (buildings, asphalt, water) for fast inside/outside point tests.
//   createPolyMask(polys, { tile = 64, res = 0.5, maxTiles = 600 }) -> { has(x, z) -> bool, tiles() -> n }
//     polys: [[ringFlat, holeFlat...]] or [{ p: ringFlat }] (map.json style flattened rings [x0,z0,x1,z1,...])
// The world is cut into square tiles; a tile is scan-converted (even-odd per polygon, OR between polygons) the first
// time a point inside it is asked for, and old tiles are dropped first-in first-out past maxTiles.
export function createPolyMask(polys, { tile = 64, res = 0.5, maxTiles = 600 } = {}) {
  const N = Math.round(tile / res);
  const rings = [], boxes = [];
  const bucket = new Map();
  const key = (i, j) => (i + 32768) * 65536 + (j + 32768);
  for (const P of polys || []) {
    const R = Array.isArray(P) ? (typeof P[0] === 'number' ? [P] : P) : P && P.p ? [P.p] : null;
    if (!R || !R[0] || R[0].length < 6) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < R[0].length; k += 2) { const x = R[0][k], z = R[0][k + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const id = rings.length; rings.push(R); boxes.push(x0, z0, x1, z1);
    for (let i = Math.floor(x0 / tile); i <= Math.floor(x1 / tile); i++) for (let j = Math.floor(z0 / tile); j <= Math.floor(z1 / tile); j++) {
      const k = key(i, j); let L = bucket.get(k); if (!L) bucket.set(k, L = []); L.push(id);
    }
  }
  const cache = new Map(), xs = [];
  let lastK = NaN, lastT = null;

  function build(i, j) {
    const T = new Uint8Array(N * N), L = bucket.get(key(i, j));
    if (!L) return T;
    const ox = i * tile, oz = j * tile;
    for (const id of L) {
      const R = rings[id];
      const r0 = Math.max(0, Math.floor((boxes[id * 4 + 1] - oz) / res)), r1 = Math.min(N - 1, Math.ceil((boxes[id * 4 + 3] - oz) / res));
      for (let r = r0; r <= r1; r++) {
        const z = oz + (r + 0.5) * res;
        xs.length = 0;
        for (const F of R) {
          const n = F.length;
          for (let a = 0, b = n - 2; a < n; b = a, a += 2) {
            const za = F[a + 1], zb = F[b + 1];
            if ((za > z) === (zb > z)) continue;
            xs.push(F[a] + (z - za) / (zb - za) * (F[b] - F[a]));
          }
        }
        if (xs.length < 2) continue;
        xs.sort((p, q) => p - q);
        const row = r * N;
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const c0 = Math.max(0, Math.ceil((xs[k] - ox) / res - 0.5)), c1 = Math.min(N - 1, Math.floor((xs[k + 1] - ox) / res - 0.5));
          for (let c = c0; c <= c1; c++) T[row + c] = 1;
        }
      }
    }
    return T;
  }

  return {
    has(x, z) {
      const i = Math.floor(x / tile), j = Math.floor(z / tile), k = key(i, j);
      let T = k === lastK ? lastT : cache.get(k);
      if (!T) {
        T = build(i, j); cache.set(k, T);
        if (cache.size > maxTiles) cache.delete(cache.keys().next().value);
      }
      lastK = k; lastT = T;
      const c = Math.min(N - 1, Math.floor((x - i * tile) / res)), r = Math.min(N - 1, Math.floor((z - j * tile) / res));
      return T[r * N + c] === 1;
    },
    tiles: () => cache.size,
  };
}
