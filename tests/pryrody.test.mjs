// Headless checks for Будинок природи, вул. Верхня Горова 1 (src/world/cherkasy/pryrody.js): node tests/pryrody.test.mjs
// On the real map: the OSM outline is there, the site builds in budget, its walls stop rays from the square and the
// slope, a car drives in under the front columns up to the glazing, the courtyard is open to the sky with its floor at
// the ground floor, the roof stands two storeys up and the hall rises over it, and it is a sight on the maps.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildPryrody, PRYRODY_SKIP } from '../src/world/cherkasy/pryrody.js';
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
const hf = createHeightField(map, dem);
for (const id of PRYRODY_SKIP) ok(map.buildings.some((b) => b.id === id), `OSM building ${id} is in map_buildings.json`);

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildPryrody({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt });
ok(site && site.footprints?.length === 1, 'the site builds');
let verts = 0, meshes = 0, nan = false;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; } });
ok(!nan, 'no NaN vertices');
ok(verts < 16000 && meshes <= 6, `budget: ${verts} verts in ${meshes} meshes`);

const yF = site.yard;
// from the square (south-west, -x) at chest height: the front glazing stands REC behind the face, the columns in front
// (20 m out from the middle of the front, along its normal)
const front = cw.raycast({ x: 577.75, y: yF + 1.2, z: 259.45 }, { x: 0.92, y: 0, z: 0.39 }, 60);
ok(front && front.distance > 21.8 && front.distance < 22.8, `a car drives in under the columns to the glazing (${front?.distance.toFixed(1)} m)`);
const upper = cw.raycast({ x: 577.75, y: yF + 6, z: 259.45 }, { x: 0.92, y: 0, z: 0.39 }, 60);
ok(upper && upper.distance > 19.5 && upper.distance < 20.5, `the upper storey stands on the face line (${upper?.distance.toFixed(1)} m)`);
// from the slope over the Dnipro (east)
const east = cw.raycast({ x: 670, y: yF + 2, z: 285 }, { x: -1, y: 0, z: 0 }, 60);
ok(east && east.point.x > 642 && east.point.x < 651, `a ray from the slope stops at the east wing (${east?.point.x.toFixed(1)})`);
// the courtyard: open to the sky, its floor at the ground floor
const yc = [611.5, 272.5], yard = cw.groundHeight(yc[0] + 3, yc[1], yF + 30);
ok(Math.abs(yard - yF) < 0.2, `the courtyard floor is the ground floor (${(yard - yF).toFixed(2)})`);
ok(!cw.raycast({ x: yc[0] + 3, y: yF + 30, z: yc[1] }, { x: 0, y: -1, z: 0 }, 29), 'the courtyard is open to the sky');
// the roof deck and the hall
const roof = cw.groundHeight(600, 281, yF + 20) - yF, hall = cw.groundHeight(628, 277, yF + 30) - yF;
ok(roof > 7.5 && roof < 9, `the roof is ${roof.toFixed(1)} m over the ground floor`);
ok(Math.abs(site.top - yF - roof) < 0.2, 'site.top is the roof deck');
ok(hall - roof > 2.5 && hall - roof < 4.5, `the hall rises ${(hall - roof).toFixed(1)} m over the roof`);
// the maps: a sight on the OSM outline
const pl = PLACES.find((p) => p.id === 'pryrody');
ok(pl && pl.kind === 'sight' && pl.icon && pl.bld?.includes(12524139), 'a sight in places.js on its OSM outline');

console.log = log;
if (fails) { console.log(`${fails} failure(s)`); process.exit(1); }
console.log('pryrody: all ok');
