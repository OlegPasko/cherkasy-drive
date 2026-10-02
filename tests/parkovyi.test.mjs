// Headless checks for ЖК «Парковий квартал» (src/world/cherkasy/parkovyi.js): node tests/parkovyi.test.mjs
// On the real map: the seven OSM houses are there, the site builds in budget with finite geometry, the roofs stand ten
// storeys up, a ray across the yard stops at a wall, the car does not get into a house, trees keep off the houses and
// the playground but not off the street, and places.js marks it as an improved object over the same ids.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildParkovyi, PARKOVYI_SKIP, PARK_YARD } from '../src/world/cherkasy/parkovyi.js';
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
const ids = [...PARKOVYI_SKIP], houses = ids.map((id) => map.buildings.find((b) => b.id === id));
ok(ids.length === 7 && houses.every(Boolean), 'the seven OSM houses are in map_buildings.json');

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildParkovyi({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt });
ok(site && site.footprints?.length === 7, 'the site builds seven houses');
let verts = 0, meshes = 0, nan = 0;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (!Number.isFinite(v)) nan++; } });
ok(nan === 0, "all vertices finite");
ok(verts > 10000 && verts < 50000 && meshes <= 6, `budget: ${(verts / 1000).toFixed(1)}k verts in ${meshes} meshes`);

for (const b of houses) {
  const ring = ringPts(b.p), c = ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0]);
  const g = hf.heightAt(...c), roof = cw.groundHeight(c[0], c[1], g + 60) - g;
  ok(roof > 30 && roof < 37, `${b.id}: the roof is ${roof.toFixed(1)} m up`);
}
// a ray across the yard (south-west to north-east along z = -1160) at first-floor height stops at the NE wing
const NE = ringPts(houses[5].p), g0 = hf.heightAt(-3330, -1160);
const hit = cw.raycast({ x: -3330, y: g0 + 6, z: -1160 }, { x: 1, y: 0, z: 0 }, 80);
const wx = -3280.2 + (-3276.6 + 3280.2) * (-1160 + 1097.9) / (-1222.6 + 1097.9);
ok(hit && Math.abs(hit.point.x - wx) < 0.8, `a ray across the yard stops at the NE wing (${hit?.point.x.toFixed(1)} vs ${wx.toFixed(1)})`);
// the car driven at the SE wing's west gable is pushed back
const SE = ringPts(houses[6].p), p = { x: -3432, y: 0, z: -1111 };
let pushes = 0;
for (let i = 0; i < 50; i++) { p.x += 0.4; p.y = hf.heightAt(p.x, p.z) + 0.2; if (cw.pushCylinder(p, 1.2, 1.6, 0.3)?.hit) pushes++; }
ok(pushes > 5 && !inPoly(SE, p.x, p.z), `the car does not get into a house (${pushes} pushes)`);
ok(site.clear(-3350, -1215) && site.clear(...PARK_YARD.c1) && !site.clear(-3350, -1330), 'trees keep off the houses and the playground only');
ok(!site.clear(-3330, -1170), 'the lawn may keep its trees');

const place = PLACES.find((q) => q.id === 'parkovyi');
ok(place && place.kind === 'improved' && !place.icon && !place.url && /Парковий квартал/.test(place.note), 'places.js: an improved object with the name in the note');
ok(place && place.bld.length === 7 && place.bld.every((id) => PARKOVYI_SKIP.has(id)), 'places.js highlights the same seven houses');

console.log = log;
console.log(fails ? `${fails} FAILED` : 'parkovyi: all ok');
process.exit(fails ? 1 : 0);
