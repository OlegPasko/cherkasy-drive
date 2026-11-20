// OWNER: cherkasy. Where the generated buildings' entrances are, for the layers that put things on the ground: a
// street prop, a generated tree or a shrub must not stand in front of a door. The building pass hands out the
// entrances its facade kit built (buildings.js B.doors, facadekit.js `doors`: x, z on the wall line, the outward
// normal, the door's half width, how far out its approach reaches); this is their index.
//
//   doorIndex(doors, { side = 0.5 } = {}) -> { n, side, at(x, z, r = 0) -> index of a door whose approach a disc of
//       radius r at (x, z) touches, else -1;  door(i) -> { x, z, nx, nz, hw, out } }
//     doors: Float32Array | number[] of DOOR_STRIDE records. An approach is the rectangle in front of the door: its
//     width plus `side` each way along the wall, from the wall line (0.3 m behind it, for a thing set against the
//     wall) out to the record's reach. 16 m cells; a door lies in every cell a disc of up to 3 m that touches its
//     approach can be centred in.
//   TREE_R: the radius a tree trunk is given in the test (greenery.js, the census in city.js)
// street.js steps a prop out of an approach or drops it, greenery.js treeSpots grows no generated tree there (an
// OSM-mapped one steps to the approach's side), the
// shrub layer (nature/shrubs.js `drop`, fed by city.js) no shrub. The hand-built sites' own plantings and props are
// theirs. ?nodoorclear in the game turns the three off (A/B; world.cherkasy.doorCensus() counts what stands there).
export const DOOR_STRIDE = 6, TREE_R = 0.5;
const CELL = 16, PAD = 3, BACK = 0.3;

export function doorIndex(doors, { side = 0.5 } = {}) {
  const D = doors ?? [], n = Math.floor(D.length / DOOR_STRIDE), cells = new Map(), key = (i, j) => (i + 4096) * 8192 + (j + 4096);
  for (let d = 0; d < n; d++) {
    const o = d * DOOR_STRIDE, x = D[o], z = D[o + 1], nx = D[o + 2], nz = D[o + 3], w = D[o + 4] + side, out = D[o + 5];
    // the approach's corners: along the wall (-nz, nx), out along the normal
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const a of [-w, w]) for (const q of [-BACK, out]) {
      const px = x - nz * a + nx * q, pz = z + nx * a + nz * q;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (pz < z0) z0 = pz; if (pz > z1) z1 = pz;
    }
    for (let i = Math.floor((x0 - PAD) / CELL), i1 = Math.floor((x1 + PAD) / CELL); i <= i1; i++)
      for (let j = Math.floor((z0 - PAD) / CELL), j1 = Math.floor((z1 + PAD) / CELL); j <= j1; j++) { const k = key(i, j), L = cells.get(k); if (L) L.push(d); else cells.set(k, [d]); }
  }
  const at = (x, z, r = 0) => {
    const L = cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!L) return -1;
    for (let q = 0; q < L.length; q++) {
      const o = L[q] * DOOR_STRIDE, dx = x - D[o], dz = z - D[o + 1], nx = D[o + 2], nz = D[o + 3];
      const out = dx * nx + dz * nz;
      if (out < -BACK - r || out > D[o + 5] + r) continue;
      if (Math.abs(dz * nx - dx * nz) < D[o + 4] + side + r) return L[q];
    }
    return -1;
  };
  const door = (i) => { const o = i * DOOR_STRIDE; return { x: D[o], z: D[o + 1], nx: D[o + 2], nz: D[o + 3], hw: D[o + 4], out: D[o + 5] }; };
  return { n, side, at, door };
}
