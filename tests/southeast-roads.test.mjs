// Issue #28: road centre lines alone do not make a drivable street. The compiled asphalt used to stop at z=4950,
// before Petra Doroshenka and its junction with Chyhyrynska. Check the actual ground polygons and playable boundary.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pointInRing, boundsOf } from '../tools/cherkasy/geom2d.mjs';

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
const pairs = (p) => Array.from({ length: p.length / 2 }, (_, i) => [p[i * 2], p[i * 2 + 1]]);
const asphalt = map.asphalt.map((rings) => {
  const p = rings.map(pairs); return { p, b: boundsOf(p[0]) };
});
const onAsphalt = (x, z) => asphalt.some(({ p, b }) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1
  && pointInRing(p[0], x, z) && !p.slice(1).some((hole) => pointInRing(hole, x, z)));
const R = map.region;
for (const name of ['вулиця Петра Дорошенка', 'Чигиринська вулиця']) {
  const roads = map.roads.filter((r) => r.n === name && r.k === 'm');
  assert(roads.length > 0, `${name}: compiled motor roads exist`);
  let samples = 0;
  for (const r of roads) {
    const p = pairs(r.p);
    for (let i = 1; i < p.length; i++) {
      const [ax, az] = p[i - 1], [bx, bz] = p[i], steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 25));
      for (let j = 0; j < steps; j++) {
        const t = (j + 0.5) / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        assert(onAsphalt(x, z), `${name}: missing asphalt at ${x.toFixed(1)}, ${z.toFixed(1)}`);
        samples++;
      }
    }
  }
  console.log(`ok ${name}: ${samples} surface samples`);
}
assert(R.z1 > 5700, 'the playable region includes the streets and their southern approaches');
assert(onAsphalt(-601.2, 5087.6), 'the Chyhyrynska / Petra Doroshenka junction has asphalt');
assert(map.buildingsFile, 'the enlarged region keeps the split building data');
const buildings = JSON.parse(readFileSync(new URL(`../public/assets/cherkasy/${map.buildingsFile}`, import.meta.url)));
assert(buildings.some((b) => b.p.some((n, i) => i % 2 && n > 5100 && n < 5600)), 'the added neighbourhood has buildings');
assert(map.dem.z1 >= R.z1 + 2000, 'the DEM extends beyond the new boundary');
const dem = readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url));
assert.equal(dem.byteLength, map.dem.nx * map.dem.nz * 2, 'DEM shape matches its metadata');
console.log('ok southeast roads, neighbourhood and DEM coverage');
