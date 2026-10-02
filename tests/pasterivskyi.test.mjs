// Headless checks for ЖК «Пастерівський» (src/world/cherkasy/pasterivskyi.js): node tests/pasterivskyi.test.mjs
// On the real map: the four OSM bars are there, the site builds within its budget with no NaN vertices, the bars stop a
// ray at their walls from the yard and the street, the roofs stand ten storeys up, the walks between them are open, and
// the parked cars stand on the lot, off every road and outside the buildings.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildPasterivskyi, PASTER_SKIP } from '../src/world/cherkasy/pasterivskyi.js';
import { inPoly } from '../src/world/cherkasy/geo.js';
import * as THREE from 'three';

const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
map.buildings = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const hf = createHeightField(map, dem);

for (const id of PASTER_SKIP) ok(map.buildings.some((b) => b.id === id), `OSM bar ${id} is in map_buildings.json`);
const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildPasterivskyi({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt });
ok(site && site.footprints.length === 6, `the site builds: 4 bars, the garage block and the pavilion (${site?.footprints.length})`);
let verts = 0, meshes = 0;
root.traverse((o) => {
  if (!o.isMesh) return;
  meshes++; verts += o.geometry.attributes.position.count;
  ok(!o.geometry.attributes.position.array.some(Number.isNaN), `${o.name}: no NaN vertices`);
});
ok(verts < 110000 && meshes <= 12, `budget: ${verts} verts in ${meshes} meshes`);

// the lot frame (as in the module): u along the bars, v toward Пастерівська
const a = -2.55 * Math.PI / 180, U = [Math.cos(a), Math.sin(a)], V = [-Math.sin(a), Math.cos(a)], O = [-2203.4, 1482.6];
const L = (u, v) => [O[0] + U[0] * u + V[0] * v, O[1] + U[1] * u + V[1] * v];
const cast = (u, v, h, du, dv, max = 40) => {
  const [x, z] = L(u, v), d = [U[0] * du + V[0] * dv, U[1] * du + V[1] * dv];
  return cw.raycast({ x, y: hf.heightAt(x, z) + h, z }, { x: d[0], y: 0, z: d[1] }, max);
};
const near = (hit, d, msg) => ok(hit && Math.abs(hit.distance - d) < 1.2, `${msg} (${hit ? hit.distance.toFixed(1) + ' ' + hit.kind : 'no hit'}, expected ~${d})`);
near(cast(30, 45, 1, 0, 1), 7, 'the middle bar stops a ray from the yard at its north wall');
near(cast(30, 78, 20, 0, -1), 7, '... and at its south wall, 20 m up');
near(cast(10, 140, 1, 0, -1), 15.6, 'the south bar stops a ray from Пастерівська at its shopfronts');
near(cast(55, 140, 1, 0, -1), 7.7, 'the garage block stands in front of its east part');
near(cast(85, 40, 1, 1, 0), 10.4, 'the east bar stops a ray from the yard');
ok(!cast(-8, 33, 1, 1, 0, 30), 'the car park aisle between the bars is open');
ok(!cast(2, 47.5, 1, 1, 0, 76), 'the cross walk north of the middle bar is open');
const [bx, bz] = L(30, 61), roof = cw.groundHeight(bx, bz, 500) - hf.heightAt(bx, bz);
ok(roof > 30 && roof < 36, `the middle bar's roof stands ${roof.toFixed(1)} m over the ground`);

// parked cars: on the lot, off the roads, outside every footprint
const past = (x, z) => { let d = Infinity; for (const r of map.roads) for (let i = 0; i + 3 < r.p.length; i += 2) { const ax = r.p[i], az = r.p[i + 1], ex = r.p[i + 2] - ax, ez = r.p[i + 3] - az, l2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)); d = Math.min(d, Math.hypot(ax + ex * t - x, az + ez * t - z) - r.w / 2); } return d; };
ok(site.parked.length >= 20, `${site.parked.length} parked cars`);
ok(site.parked.every(([x, z]) => past(x, z) > 1), 'no parked car on a road');
ok(site.parked.every(([x, z]) => !site.footprints.some((f) => inPoly(f.poly, x, z))), 'no parked car inside a building');
ok(site.parked.every(([x, z]) => site.clear(x, z)), 'the car parks are kept clear of generated trees');

console.log = log;
if (fails) { console.log(`${fails} failure(s)`); process.exit(1); }
console.log('pasterivskyi: all ok');
