// Headless checks for the new block at вул. Тараскова, 5 (src/world/cherkasy/taraskova5.js): node tests/taraskova5.test.mjs
// On the real map: the two OSM houses are there and no other site module claims them, the site builds in budget with
// finite geometry, the roofs stand ten storeys up, a ray across the yard stops at a wall, the car does not get into a
// house, trees keep off the houses and the shop terrace but not off the yard, and places.js marks it as improved.
import { readFileSync, readdirSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildTaraskova5, TARASKOVA5_SKIP, T5_YARD } from '../src/world/cherkasy/taraskova5.js';
import { PLACES } from '../src/world/cherkasy/places.js';
import { inPoly, ringPts } from '../src/world/cherkasy/geo.js';
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
const ids = [...TARASKOVA5_SKIP], houses = ids.map((id) => map.buildings.find((b) => b.id === id));
ok(ids.length === 2 && houses.every(Boolean), 'the two OSM houses are in map_buildings.json');
const dir = new URL('../src/world/cherkasy/', import.meta.url);
const others = readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'taraskova5.js' && f !== 'places.js')
  .filter((f) => { const s = readFileSync(new URL(f, dir), 'utf8'); return ids.some((id) => s.includes(String(id))); });
ok(others.length === 0, `no other site module claims the ids (${others.join(', ')})`);

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildTaraskova5({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt });
ok(site && site.footprints?.length === 2, 'the site builds both houses');
let verts = 0, meshes = 0, nan = 0;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (!Number.isFinite(v)) nan++; } });
ok(nan === 0, 'all vertices finite');
ok(verts > 5000 && verts < 40000 && meshes <= 6, `budget: ${(verts / 1000).toFixed(1)}k verts in ${meshes} meshes`);

for (const b of houses) {
  const ring = ringPts(b.p), c = ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0]);
  const p = inPoly(ring, ...c) ? c : ring[0].map((v, i) => v + (ring[2][i] - v) * 0.5);
  const g = hf.heightAt(...p), roof = cw.groundHeight(p[0], p[1], g + 60) - g;
  ok(roof > 29 && roof < 38, `${b.id}: the roof is ${roof.toFixed(1)} m up`);
}
// a ray across the yard (along +x at z = -2355, first-floor height) stops at 11-А's yard wall
const [YX0, YX1] = T5_YARD, g0 = hf.heightAt(-3245, -2355);
const hit = cw.raycast({ x: -3245, y: g0 + 6, z: -2355 }, { x: 1, y: 0, z: 0 }, 40);
ok(hit && hit.point.x > YX1 - 1.5 && hit.point.x < YX1 + 3.5, `a ray across the yard stops at 11-А (${hit?.point.x.toFixed(1)})`);
const hitW = cw.raycast({ x: -3245, y: g0 + 6, z: -2355 }, { x: -1, y: 0, z: 0 }, 40);
ok(hitW && hitW.point.x < YX0 + 1.5 && hitW.point.x > YX0 - 3.5, `and the other way at the street wing (${hitW?.point.x.toFixed(1)})`);
// the car driven at the long wing from the yard is pushed back
const A = ringPts(houses[0].p), p = { x: -3240, y: 0, z: -2360 };
let pushes = 0;
for (let i = 0; i < 60; i++) { p.z -= 0.4; p.y = hf.heightAt(p.x, p.z) + 0.2; if (cw.pushCylinder(p, 1.2, 1.6, 0.3)?.hit) pushes++; }
ok(pushes > 5 && !inPoly(A, p.x, p.z), `the car does not get into a house (${pushes} pushes)`);
ok(site.clear(-3270, -2360) && site.clear(-3285, -2360) && !site.clear(-3245, -2355) && !site.clear(-3300, -2420), 'trees keep off the houses and the shop terrace only');

const place = PLACES.find((q) => q.id === 'taraskova5');
ok(place && place.kind === 'improved' && !place.icon && !place.url && /Тараскова, 5/.test(place.note), 'places.js: an improved object with the address in the note');
ok(place && place.bld.length === 2 && place.bld.every((id) => TARASKOVA5_SKIP.has(id)), 'places.js highlights the same two houses');

console.log = log;
console.log(fails ? `${fails} FAILED` : 'taraskova5: all ok');
process.exit(fails ? 1 : 0);
