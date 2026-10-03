// Where pedestrians plausibly are: inside the playable map region, and there either within REACH of a building or
// on a park, pitch, playground or beach. map.json keeps whole roads and footways that only touch the region (some run
// 600 m out into the fields) and the region itself has allotments, meadows and farmland, so without this walkers
// spawned on and strolled along those ways far from anything.
//   createWalkArea({ region?, buildings, cover?, reach = 160 }) -> { has(x, z) -> bool, inRegion(x, z), nearBuilding(x, z), stats() }
//     region: { x0, x1, z0, z1 } (map.region; none = unbounded); buildings: [{ p: ringFlat }]; cover: map.cover
// A 32 m grid of building corners dilated by `reach` (a few hundred kB, built once); the green covers are tested
// lazily through polygon masks only where the grid says no. Used while the walking network is built, never per frame.
import { createPolyMask } from './mask.js';

const G = 32, GREEN = ['park', 'pitch', 'play', 'sand'];

export function createWalkArea({ region = null, buildings, cover = null, reach = 160 }) {
  const R = region || { x0: -1e9, x1: 1e9, z0: -1e9, z1: 1e9 };
  // grid over the buildings' extent (the region when there is one), padded by the reach
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const b of buildings) { const p = b.p || b; for (let i = 0; i < p.length; i += 2) { const x = p[i], z = p[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } }
  if (region) { x0 = Math.max(x0, R.x0); z0 = Math.max(z0, R.z0); x1 = Math.min(x1, R.x1); z1 = Math.min(z1, R.z1); }
  const ok = x1 > x0 && z1 > z0, s = Math.ceil(reach / G);
  const gx = ok ? Math.floor(x0 / G) - s : 0, gz = ok ? Math.floor(z0 / G) - s : 0;
  const nx = ok ? Math.floor(x1 / G) - gx + s + 1 : 0, nz = ok ? Math.floor(z1 / G) - gz + s + 1 : 0;
  const seed = new Uint8Array(nx * nz), near = new Uint8Array(nx * nz);
  for (const b of buildings) {
    const p = b.p || b;
    for (let i = 0; i < p.length; i += 2) { const a = Math.floor(p[i] / G) - gx, c = Math.floor(p[i + 1] / G) - gz; if (a >= 0 && a < nx && c >= 0 && c < nz) seed[a * nz + c] = 1; }
  }
  // dilate by a disc of `reach` (cell centres within reach + half a cell)
  const disc = [];
  for (let a = -s; a <= s; a++) for (let c = -s; c <= s; c++) if (Math.hypot(a, c) * G <= reach + G / 2) disc.push(a, c);
  for (let a = 0; a < nx; a++) for (let c = 0; c < nz; c++) {
    if (!seed[a * nz + c]) continue;
    for (let k = 0; k < disc.length; k += 2) { const u = a + disc[k], v = c + disc[k + 1]; if (u >= 0 && u < nx && v >= 0 && v < nz) near[u * nz + v] = 1; }
  }
  const greens = cover ? GREEN.filter((k) => cover[k]?.length).map((k) => createPolyMask(cover[k], { tile: 256, res: 2, maxTiles: 200 })) : [];
  const inRegion = (x, z) => x >= R.x0 && x <= R.x1 && z >= R.z0 && z <= R.z1;
  const nearBuilding = (x, z) => {
    if (!ok) return true; // no buildings at all (a test map): no limit but the region
    const a = Math.floor(x / G) - gx, c = Math.floor(z / G) - gz;
    return a >= 0 && a < nx && c >= 0 && c < nz && near[a * nz + c] === 1;
  };
  return {
    has: (x, z) => inRegion(x, z) && (nearBuilding(x, z) || greens.some((m) => m.has(x, z))),
    inRegion, nearBuilding,
    stats: () => ({ grid: [nx, nz], near: near.reduce((n, v) => n + v, 0) }),
  };
}
