// Headless checks for school №8, вул. Смілянська 88/2 (src/world/cherkasy/school8.js): node tests/school8.test.mjs
// On the real map: both OSM outlines are there, the site builds in budget with no NaN, the main block stands three
// storeys with its end section taller, the hall one storey, the walls stop rays, the lot's fence is closed but for the
// gate at the drive, the trees keep off the forecourt and the pitch, and the place is on the maps.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildSchool8, SCHOOL8_SKIP } from '../src/world/cherkasy/school8.js';
import { PLACES } from '../src/world/cherkasy/places.js';
import * as THREE from 'three';

const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
map.buildings = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const H = createHeightField(map, dem).heightAt;
for (const id of SCHOOL8_SKIP) ok(map.buildings.some((b) => b.id === id), `OSM way ${id} is in map_buildings.json`);

const cw = createCollisionWorld({ terrain: (x, z) => H(x, z) });
const root = new THREE.Group();
const site = buildSchool8({ root, map, solids: cw, zips: { edge() {} }, heightAt: H });
ok(site && site.footprints?.length === 5, 'the site builds its five volumes');
let verts = 0, meshes = 0, nan = false;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; } });
ok(!nan, 'no NaN vertices');
ok(verts < 40000 && meshes <= 12, `budget: ${verts} verts in ${meshes} meshes`);
ok(root.children.some((g) => g.name === 'school8'), 'one named root group (proxies.js)');

// heights: three storeys of classrooms, the end section ~2 m over the eave, the hall one storey, the west bar two
const L = site.levels;
const top = (x, z) => cw.groundHeight(x, z, 60);
ok(L.top - L.main > 10 && L.top - L.main < 11.5, `main block eave ${(L.top - L.main).toFixed(1)} m over its floor`);
ok(top(-1770, 304) > L.top && top(-1770, 304) < L.top + 1.5, 'the long part has its low roof');
ok(top(-1820, 304) - L.top > 1.5, 'the end section stands taller');
ok(top(-1804, 283) - L.hall > 3.5 && top(-1804, 283) - L.hall < 5.2, 'the hall is one storey');
ok(top(-1820, 263) - L.west > 7.4 && top(-1820, 263) - L.west < 8.5, 'the west bar is two storeys');

// walls: rays from the forecourt and the courtyard stop on them
const ray = (x, y, z, dx, dz, max) => cw.raycast({ x, y, z }, { x: dx, y: 0, z: dz }, max);
ok(ray(-1830, L.hall + 1.5, 283, 1, 0, 30)?.kind === 'wall', 'the hall front stops a ray from the forecourt');
ok(ray(-1790, L.main + 4, 285, 0, 1, 20)?.kind === 'wall', 'the main block stops a ray from the courtyard');

// the fence: closed on the long sides, the gate at the drive open
const gy = (x, z) => H(x, z) + 0.8;
ok(ray(-1900, gy(-1900, 312), 312, 0, 1, 14)?.kind === 'fence', 'the south-east fence');
ok(ray(-1900, gy(-1900, 256), 256, 0, -1, 14)?.kind === 'fence', 'the north-west fence');
ok(ray(-1980, gy(-1980, 290), 290, -1, 0, 14)?.kind === 'fence', 'the south-west fence');
ok(ray(-1834.8, gy(-1834.8, 312), 312, 0, 1, 14) == null, 'the gate at the drive is open');

// trees keep off the forecourt, the pitch and the court, but not off the lawn by the gate
ok(site.clear(-1860, 282), 'no trees on the forecourt');
ok(site.clear(-1964, 288) && site.clear(-1922, 300), 'no trees on the pitch or the court');
ok(!site.clear(-1870, 310), 'the lawn keeps its trees');

const pl = PLACES.find((p) => p.id === 'school8');
ok(pl && pl.kind === 'improved' && pl.issue === 47 && pl.bld.every((id) => SCHOOL8_SKIP.has(id)), 'an improved place on the maps');

log(fails ? `school8: ${fails} FAILED` : `school8: all ok (${verts} vertices, ${meshes} meshes)`);
process.exit(fails ? 1 : 0);
