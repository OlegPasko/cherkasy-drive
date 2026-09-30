// ?at= spawns (src/game/placeat.js) on the real map: the address street beats a nearer side street, the car sits in
// the right-hand lane with the point ahead on the passenger side. Run: node tests/placeat.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { roadSpotNear } from '../src/game/placeat.js';
import { worldXZ, latLon } from '../src/ui/botlink.js';

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
const t = worldXZ(map.frame, 49.4068444, 32.045664); // prosp. Khimikiv 44 (issue #1)
const back = latLon(map.frame, t.x, t.z);
assert.ok(Math.abs(back.lat - 49.4068444) < 1e-7 && Math.abs(back.lon - 32.045664) < 1e-7, 'projection round trip');

const side = roadSpotNear(map, t.x, t.z), named = roadSpotNear(map, t.x, t.z, { road: 'проспект Хіміків' });
assert.ok(side && named);
assert.ok(side.dist < named.dist, 'without a hint the nearest road wins');
assert.ok(Math.abs(named.x - -3806) < 30, `the prospekt runs at x ≈ -3806 here, got ${named.x.toFixed(0)}`);
for (const s of [side, named]) {
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), dx = t.x - s.x, dz = t.z - s.z;
  assert.ok(dx * -fz + dz * fx > 0, 'the point is on the right');
  assert.ok(dx * fx + dz * fz > 0, 'and ahead');
}
assert.equal(roadSpotNear(map, 1e6, 1e6), null, 'nothing within reach');
console.log('placeat: ok');
