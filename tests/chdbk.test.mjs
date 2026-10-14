// Headless checks for ЧДБК, вул. В'ячеслава Чорновола 243 (src/world/cherkasy/chdbk.js): node tests/chdbk.test.mjs
// On the real map: both OSM outlines are there, the site builds in budget, the wing is three storeys and the dorm five,
// the walls stop rays, the street fence closes the grounds on Чиковані and Чорновола except at the open gates, the
// yard drive passes under the first-floor bridge, the portico's steps and canopy, and the field is kept clear of trees.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildChdbk, CHDBK_SKIP } from '../src/world/cherkasy/chdbk.js';
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
const hf = createHeightField(map, dem), H = hf.heightAt;
for (const id of CHDBK_SKIP) ok(map.buildings.some((b) => b.id === id), `OSM way ${id} is in map_buildings.json`);
const place = PLACES.find((p) => p.id === 'chdbk');
ok(place && place.kind === 'improved' && [...CHDBK_SKIP].every((id) => place.bld.includes(id)), 'places.js has the improved object with both outlines');

const cw = createCollisionWorld({ terrain: (x, z) => H(x, z) });
const root = new THREE.Group();
const site = buildChdbk({ root, map, solids: cw, zips: { edge() {} }, heightAt: H });
ok(site && site.footprints?.length === 5 && site.info, 'the site builds');
let verts = 0, meshes = 0, nan = false;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; } });
ok(!nan, 'no NaN vertices');
ok(verts < 40000 && meshes <= 15, `budget: ${verts} verts in ${meshes} meshes`);
const { info } = site;

// heights: the wing three storeys under its hipped roof, the dorm five
const gA = H(-3420, 2520), roofA = cw.groundHeight(-3420, 2520);
ok(roofA - gA > 10.5 && roofA - gA < 14, `wing A's top is ${(roofA - gA).toFixed(1)} m up`);
ok(info.eave - gA > 10 && info.eave - gA < 12.5, `wing A's eave is ${(info.eave - gA).toFixed(1)} m up (three storeys)`);
const gD = H(-3400, 2454), roofD = cw.groundHeight(-3400, 2454);
ok(roofD - gD > 14 && roofD - gD < 17, `the dorm's roof is ${(roofD - gD).toFixed(1)} m up (five storeys)`);
ok(Math.abs(info.dorm.roof - 0.6 - roofD) < 0.3, 'info.dorm.roof is the parapet over the deck');

// walls stop rays: the wing's back from the yard, the dorm's front from its forecourt
const y1 = (x, z) => H(x, z) + 1.5;
const rA = cw.raycast({ x: -3405, y: y1(-3405, 2525), z: 2525 }, { x: -1, y: 0, z: 0 }, 30);
ok(rA && Math.abs(rA.point.x + 3414.7) < 0.4, `a ray from the yard stops at the wing's back wall (${rA?.point.x.toFixed(1)})`);
const rD = cw.raycast({ x: -3380, y: y1(-3380, 2438), z: 2438 }, { x: 0, y: 0, z: 1 }, 20);
ok(rD && Math.abs(rD.point.z - 2446.4) < 0.4, `a ray from Чорновола stops at the dorm's front (${rD?.point.z.toFixed(1)})`);

// the street fence: a ray from Чиковані's pavement into the grounds hits it (its iron or a brick pier), except through the open gates
for (const z of [2455, 2485, 2530, 2580]) {
  const r = cw.raycast({ x: -3443, y: y1(-3443, z), z }, { x: 1, y: 0, z: 0 }, 8);
  ok(r && /fence|wall/.test(r.kind) && Math.abs(r.point.x + 3440) < 0.6, `the fence closes Чиковані at z ${z} (${r?.kind} at ${r?.point.x.toFixed(1)})`);
}
for (const z of [2471.2, 2498.5, 2559.0]) {
  const r = cw.raycast({ x: -3443, y: y1(-3443, z), z }, { x: 1, y: 0, z: 0 }, 6);
  ok(!r, `the gate at z ${z} is open (${r?.kind ?? 'clear'})`);
}
ok(info.gates.length >= 5, 'the gates are reported');
const rN = cw.raycast({ x: -3425, y: y1(-3425, 2430), z: 2430 }, { x: 0, y: 0, z: 1 }, 8);
ok(rN && /fence|wall/.test(rN.kind) && Math.abs(rN.point.z - 2434.1) < 0.6, `the fence closes Чорновола west of the dorm (${rN?.kind})`);
const rB = cw.raycast({ x: -3320, y: y1(-3320, 2597), z: 2597 }, { x: 0, y: 0, z: -1 }, 8);
ok(rB && rB.kind === 'fence', `a plain fence closes the back (${rB?.kind})`);

// the yard drive under the first-floor bridge between the blocks
const gU = H(-3383.7, 2518), sup = cw.groundHeight(-3383.7, 2518, gU + 1);
ok(Math.abs(sup - gU) < 0.05, `the drive under the bridge is the ground (${(sup - gU).toFixed(2)})`);
ok(cw.ceilingAt(-3383.7, 2518, gU + 0.5) - gU > 3.5, `the bridge clears the drive by ${(cw.ceilingAt(-3383.7, 2518, gU + 0.5) - gU).toFixed(1)} m`);
ok(cw.groundHeight(-3383.7, 2518, gU + 20) > gU + 6, 'the bridge itself is solid above');

// the portico: the platform at the floor, the steps half-way, the canopy an awning
const sP = cw.groundHeight(-3428, 2500, info.floor + 1);
ok(Math.abs(sP - info.floor) < 0.1, `the portico's platform is at the floor (${(sP - H(-3428, 2500)).toFixed(2)} m up)`);
const gS = H(-3431.2, 2500), sS = cw.groundHeight(-3431.2, 2500, info.floor + 1);
ok(sS > gS + 0.05 && sS < info.floor - 0.05, `the steps carry the car part-way up (${(sS - gS).toFixed(2)} m)`);
const can = cw.raycast({ x: -3429, y: info.floor + 6, z: 2497.5 }, { x: 0, y: -1, z: 0 }, 10);
ok(can && can.kind === 'awning', `the portico's canopy is an awning (${can?.kind})`);

// trees: none on the blocks, the forecourt or the field; the lawns keep theirs
ok(site.clear(-3420, 2520) && site.clear(-3436, 2500) && site.clear(-3314, 2540), 'no generated trees on the wing, the forecourt or the field');
ok(!site.clear(-3360, 2470) && !site.clear(-3300, 2460), 'the lawns keep their trees');

console.log = log;
if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log('all ok');
