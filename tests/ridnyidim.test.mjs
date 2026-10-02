// Headless checks for ЖК «Рідний Дім» (src/world/cherkasy/ridnyidim.js): node tests/ridnyidim.test.mjs
// On the real map: the five OSM houses are there, the site builds in budget with finite geometry, the roofs stand ten
// storeys up, a ray from the yard stops at a wall, the car does not get into a house, the trees keep off the lot only,
// and places.js marks it as an improved object over the same ids.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildRidnyiDim, RIDNYI_SKIP } from '../src/world/cherkasy/ridnyidim.js';
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
const ids = [...RIDNYI_SKIP], houses = ids.map((id) => map.buildings.find((b) => b.id === id));
ok(ids.length === 5 && houses.every(Boolean), 'the five OSM houses are in map_buildings.json');

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildRidnyiDim({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt });
ok(site && site.footprints?.length === 5, 'the site builds five houses');
let verts = 0, meshes = 0, nan = 0;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (!Number.isFinite(v)) nan++; } });
ok(nan === 0, "all vertices finite");
ok(verts > 10000 && verts < 60000 && meshes <= 6, `budget: ${(verts / 1000).toFixed(1)}k verts in ${meshes} meshes`);

for (const b of houses) {
  const ring = ringPts(b.p), c = ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0]);
  const g = hf.heightAt(...c), roof = cw.groundHeight(c[0], c[1] + 20, g + 60) - g;
  ok(roof > 29 && roof < 37, `${b.id}: the roof is ${roof.toFixed(1)} m up`);
}
// a ray across the A–B yard (west to east) at first-floor height stops at house B's west wall
const B = ringPts(houses[1].p), bx0 = Math.min(...B.map((p) => p[0])), zm = (Math.min(...B.map((p) => p[1])) + Math.max(...B.map((p) => p[1]))) / 2;
const g0 = hf.heightAt(bx0 - 6, zm);
const hit = cw.raycast({ x: bx0 - 6, y: g0 + 5, z: zm }, { x: 1, y: 0, z: 0 }, 20);
ok(hit && Math.abs(hit.point.x - bx0) < 0.8, `a ray from the yard stops at the wall (${hit?.point.x.toFixed(1)} vs ${bx0.toFixed(1)})`);
// the car driven at a gable end is pushed back
const ze = Math.max(...B.map((p) => p[1])), xm = (bx0 + Math.max(...B.map((p) => p[0]))) / 2;
const p = { x: xm, y: 0, z: ze + 8 };
let pushes = 0;
for (let i = 0; i < 50; i++) { p.z -= 0.4; p.y = hf.heightAt(p.x, p.z) + 0.2; if (cw.pushCylinder(p, 1.2, 1.6, 0.3)?.hit) pushes++; }
ok(pushes > 5 && !inPoly(B, p.x, p.z), `the car does not get into a house (${pushes} pushes)`);
ok(site.clear(xm, zm) && !site.clear(xm + 200, zm), 'trees keep off the lot only');

const place = PLACES.find((q) => q.id === 'ridnyidim');
ok(place && place.kind === 'improved' && !place.icon && !place.url && /Рідний Дім/.test(place.note), 'places.js: an improved object with the name in the note');
ok(place && place.bld.length === 5 && place.bld.every((id) => RIDNYI_SKIP.has(id)), 'places.js highlights the same five houses');

console.log = log;
console.log(fails ? `${fails} FAILED` : 'ridnyidim: all ok');
process.exit(fails ? 1 : 0);
