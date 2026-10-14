// Headless checks for the collegium «Берегиня» (school №23), вул. Хоменка 14/1 (src/world/cherkasy/school23.js):
// node tests/school23.test.mjs
// On the real map: the OSM outline is there, the site builds in budget with no NaN, the wings stand three storeys and
// the link one, the gym over the hall over the east link, the walls stop rays but the undercroft under the street front
// is open, the lot's fence is closed but for the drive and the footway gates, the trees keep off the forecourt and the
// stadium, and the place is on the maps.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildSchool23, SCHOOL23_SKIP } from '../src/world/cherkasy/school23.js';
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
for (const id of SCHOOL23_SKIP) ok(map.buildings.some((b) => b.id === id), `OSM ${id} is in map_buildings.json`);

const cw = createCollisionWorld({ terrain: (x, z) => H(x, z) });
const root = new THREE.Group();
const site = buildSchool23({ root, map, solids: cw, zips: { edge() {} }, heightAt: H });
ok(site && site.footprints?.length === 6, 'the site builds its six volumes');
let verts = 0, meshes = 0, nan = false;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; } });
ok(!nan, 'no NaN vertices');
ok(verts < 45000 && meshes <= 13, `budget: ${verts} verts in ${meshes} meshes`);
ok(root.children.some((g) => g.name === 'school23'), 'one named root group (proxies.js)');

// heights over the floor: three storeys of classrooms, the one-storey link, gym > hall > east link (two storeys)
const L = site.levels, top = (x, z) => cw.groundHeight(x, z, 60);
ok(L.top - L.floor > 10 && L.top - L.floor < 11.5, `the wings' parapet ${(L.top - L.floor).toFixed(1)} m over the floor`);
ok(Math.abs(top(-2230, 180) - L.top) < 0.3 && Math.abs(top(-2260, 150) - L.top) < 0.3, 'the street front and the west wing are three storeys');
ok(top(-2235, 137) - L.floor > 3.8 && top(-2235, 137) - L.floor < 5, 'the link is one storey');
ok(L.gym > L.hall && L.hall > L.east && L.east - L.floor > 6.5, 'the gym over the hall over the two-storey east link');
ok(Math.abs(top(-2195, 133) - L.gym) < 0.3, 'the gym block stands at the north-east corner');

// walls: rays from the street, the forecourt and the courtyard stop on them; the undercroft is open under the first floor
const ray = (x, y, z, dx, dz, max) => cw.raycast({ x, y, z }, { x: dx, y: 0, z: dz }, max);
ok(ray(-2225, L.floor + 1.2, 190, 0, -1, 6)?.kind === 'wall', 'the street front stops a ray');
ok(ray(-2238, L.floor + 1.2, 190, 0, -1, 6) == null, 'the undercroft is open');
ok(ray(-2238, L.floor + 4.5, 190, 0, -1, 6)?.kind === 'wall', 'the first floor spans the undercroft');
ok(ray(-2235, L.floor + 1.5, 120, 0, 1, 15)?.kind === 'wall', 'the link stops a ray from the forecourt');
ok(ray(-2235, L.floor + 5, 158, 0, 1, 20)?.kind === 'wall', 'the street front stops a ray from the courtyard');

// the fence: closed on the street and the far sides, open at the footway gate
const gy = (x, z) => H(x, z) + 0.8;
ok(ray(-2250, gy(-2250, 204), 204, 0, -1, 6)?.kind === 'fence', 'the street fence');
{ const h = ray(-2212.3, gy(-2212.3, 204), 204, 0, -1, 6); ok(h == null, 'the footway gate is open' + (h ? ` (hit ${h.kind} at ${h.distance.toFixed(2)})` : '')); }
ok(ray(-2286, gy(-2286, 100), 100, 1, 0, 12)?.kind === 'fence', 'the west fence');
ok(ray(-2230, gy(-2230, 8), 8, 0, 1, 18)?.kind === 'fence', 'the south fence');
ok(ray(-2170, gy(-2170, 100), 100, -1, 0, 12)?.kind === 'fence', 'the east fence');

// trees keep off the forecourt, the stadium and the building, not off the lawn east of the stadium
ok(site.clear(-2230, 120) && site.clear(-2230, 65) && site.clear(-2240, 182), 'no generated trees on the forecourt, the stadium or the building');
ok(!site.clear(-2190, 100), 'the lawn keeps its trees');
ok(site.spots.length >= 10, 'the hand-placed spruces, birches and courtyard trees');

const pl = PLACES.find((p) => p.id === 'school23');
ok(pl && pl.kind === 'improved' && pl.issue === 49 && pl.bld.every((id) => SCHOOL23_SKIP.has(id)), 'an improved place on the maps');

log(fails ? `school23: ${fails} FAILED` : `school23: all ok (${verts} vertices, ${meshes} meshes)`);
process.exit(fails ? 1 : 0);
