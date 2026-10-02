// Headless checks for Клубний комплекс Harmony, house 1 (src/world/cherkasy/harmony.js): node tests/harmony.test.mjs
//   the OSM way is there and its outline is the one the module is laid out on; the lot is levelled; the site builds in
//   budget with finite geometry, four storeys high; the walls stop the car from the avenue and from the yard; the roof
//   holds; places.js marks it as an improved object; no other OSM building sits inside it; trees keep off the lot only.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildHarmony, levelHarmony, harmonyLocal, HARMONY_SKIP } from '../src/world/cherkasy/harmony.js';
import { PLACES } from '../src/world/cherkasy/places.js';
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
const [id] = HARMONY_SKIP, { L, D, toMap, toLocal } = harmonyLocal;
const osm = map.buildings.find((b) => b.id === id);
ok(!!osm, `OSM way ${id} is in map_buildings.json`);
const corners = [];
for (let i = 0; i < (osm?.p.length ?? 0); i += 2) corners.push(toLocal(osm.p[i], osm.p[i + 1]));
ok(corners.length === 4 && corners.every(([s, t]) => (Math.abs(s) < 0.3 || Math.abs(s - L) < 0.3) && (Math.abs(t) < 0.3 || Math.abs(t - D) < 0.3)), 'the frame sits on the OSM outline');

const level = levelHarmony(hf);
const hs = [[0, 0], [L, 0], [L, D], [0, D], [L / 2, -10]].map(([s, t]) => hf.heightAt(...toMap(s, t)));
ok(Math.max(...hs) - Math.min(...hs) < 0.2, `the lot is level (${hs.map((h) => h.toFixed(2)).join(' ')}, level ${level?.toFixed?.(2)})`);

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildHarmony({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt });
ok(!!site && root.children.length === 1 && site.footprints.length === 1, 'site builds');
let verts = 0, meshes = 0, nan = 0;
root.traverse((o) => { if (o.isMesh) { meshes++; const a = o.geometry.attributes.position.array; verts += a.length / 3; for (const v of a) if (!Number.isFinite(v)) nan++; } });
ok(nan === 0, 'all vertices finite');
ok(verts > 4000 && verts < 30000 && meshes <= 7, `${(verts / 1000).toFixed(1)}k vertices in ${meshes} meshes`);
const fp = site.footprints[0];
ok(fp.h > 14 && fp.h < 17.5, `four storeys and the attic: ${fp.h.toFixed(1)} m`);

// rays from the avenue and from the yard stop at the walls, near the outline
const g = hf.heightAt(...toMap(L / 2, 0));
const [ox, oz] = toMap(L * 0.37, -12), [tx, tz] = toMap(L * 0.37, -11);
const hit = cw.raycast({ x: ox, y: g + 6, z: oz }, { x: tx - ox, y: 0, z: tz - oz }, 30);
ok(hit && Math.abs(toLocal(hit.point.x, hit.point.z)[1]) < 1.2, `a ray from the avenue stops at the front (t = ${hit && toLocal(hit.point.x, hit.point.z)[1].toFixed(2)})`);
const [yx, yz] = toMap(L * 0.37, D + 12), [ux, uz] = toMap(L * 0.37, D + 11);
const hy = cw.raycast({ x: yx, y: g + 6, z: yz }, { x: ux - yx, y: 0, z: uz - yz }, 30);
ok(hy && Math.abs(toLocal(hy.point.x, hy.point.z)[1] - D) < 1.5, `a ray from the yard stops at the back (t = ${hy && toLocal(hy.point.x, hy.point.z)[1].toFixed(2)})`);
// the car pushed at the front from the avenue never gets in
const p = { x: ox, y: 0, z: oz }, dir = [(tx - ox), (tz - oz)];
let pushes = 0;
for (let i = 0; i < 60; i++) {
  p.x += dir[0] * 0.4; p.z += dir[1] * 0.4; p.y = hf.heightAt(p.x, p.z) + 0.2;
  if (cw.pushCylinder(p, 1.2, 1.6, 0.3)?.hit) pushes++;
}
ok(pushes > 10 && !inPoly(fp.poly, p.x, p.z), `the car does not get into the building (${pushes} pushes)`);
const roofY = cw.groundHeight(...toMap(L / 2, D / 2), g + 40);
ok(roofY > g + 12.5 && roofY < g + 15, `the roof holds (${(roofY - g).toFixed(1)} m up)`);

const place = PLACES.find((q) => q.id === 'harmony');
ok(place && place.kind === 'improved' && !place.icon && !place.url && place.bld?.includes(id) && /Harmony/.test(place.note), 'places.js: an improved object named in the note, no badge, no link');
const others = map.buildings.filter((b) => b.id !== id && (() => { for (let i = 0; i < b.p.length; i += 2) if (inPoly(fp.poly, b.p[i], b.p[i + 1])) return true; return false; })());
ok(others.length === 0, `no other OSM building inside (${others.map((b) => b.id).join(', ') || 'none'})`);
ok(site.clear(...toMap(L / 2, D / 2)) && site.clear(...toMap(L / 2, -10)) && !site.clear(...toMap(L / 2, -40)), 'trees keep off the lot only');

console.log = log;
console.log(fails ? `${fails} FAILED` : 'harmony: all ok');
process.exit(fails ? 1 : 0);
