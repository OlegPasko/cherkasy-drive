// Is a lat / lon inside the playable map, and which road is nearest? node tools/cherkasy/inregion.mjs lat lon [lat lon ...]
// Prints the map x / z, whether it is inside map.region, and the nearest named road with its distance.
import fs from 'fs';
import { FRAME_OF } from '../../src/world/cherkasy/frame.js';
const map = JSON.parse(fs.readFileSync(new URL('../../public/assets/cherkasy/map.json', import.meta.url)));
const f = FRAME_OF(map), R = map.region, a = process.argv.slice(2).map(Number);
const segD = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
for (let i = 0; i + 1 < a.length; i += 2) {
  const [x, z] = f.toXZ(a[i], a[i + 1]), inside = x > R.x0 + 50 && x < R.x1 - 50 && z > R.z0 + 50 && z < R.z1 - 50;
  let best = { d: Infinity, n: '' };
  for (const r of map.roads) { const p = r.p || r.pts; if (!r.n || !p) continue;
    for (let k = 0; k + 3 < p.length; k += 2) { const d = segD(x, z, p[k], p[k + 1], p[k + 2], p[k + 3]); if (d < best.d) best = { d, n: r.n }; } }
  console.log(`${a[i]},${a[i + 1]} -> x ${x.toFixed(0)} z ${z.toFixed(0)} ${inside ? 'INSIDE' : 'OUTSIDE'} · nearest road ${best.n} ${best.d.toFixed(0)} m`);
}
