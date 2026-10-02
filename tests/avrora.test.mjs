// Headless checks for the «Аврора» multimarket (src/world/cherkasy/avrora.js, issue #26): node tests/avrora.test.mjs
// On the real map: the OSM hall is inside the map region, the site builds, its walls stop a ray from the car park and
// from the docks side, the roof and the canopy are where they should be, and the parked cars stand on the lot, off
// Smilianska and the access road.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { FRAME_OF } from '../src/world/cherkasy/frame.js';
import { buildAvrora, AVRORA_SKIP } from '../src/world/cherkasy/avrora.js';
import * as THREE from 'three';

const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
map.buildings = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const geo = FRAME_OF(map), hf = createHeightField(map, dem);
const [sx, sz] = geo.toXZ(49.411022, 32.023628); // avrora.ua's pin for 144/2

const [id] = AVRORA_SKIP, bld = map.buildings.find((b) => b.id === id);
ok(bld, `OSM hall ${id} is in map_buildings.json (the region reaches it)`);
const R = map.region;
ok(sx > R.x0 && sz > R.z0 && sz < R.z1, 'the store is inside the map region');

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const zips = { edge() {} };
const site = buildAvrora({ root, map, solids: cw, zips, heightAt: hf.heightAt });
ok(site && site.footprints?.length === 2, 'the site builds with its two wings');
let verts = 0, meshes = 0;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; let nan = false; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; ok(!nan, `${o.name}: no NaN vertices`); } });
ok(verts < 15000 && meshes <= 10, `budget: ${verts} verts in ${meshes} meshes`);

// rays toward the hall at bumper height from the car park (+z side) and from the west hardstanding
const ring = []; for (let i = 0; i < bld.p.length; i += 2) ring.push([bld.p[i], bld.p[i + 1]]);
const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
const zMax = Math.max(...ring.map((p) => p[1])), xMin = Math.min(...ring.map((p) => p[0]));
const g = hf.heightAt(cx - 10, zMax + 12);
const hit = cw.raycast({ x: cx - 10, y: g + 1, z: zMax + 12 }, { x: 0, y: 0, z: -1 }, 40);
ok(hit && hit.kind === 'wall' && Math.abs(hit.point.z - zMax) < 1.5, `the car park ray stops at the front (${hit?.point.z.toFixed(1)} vs ${zMax.toFixed(1)})`);
const gw = hf.heightAt(xMin - 8, cz - 15);
const hw = cw.raycast({ x: xMin - 8, y: gw + 1, z: cz - 15 }, { x: 1, y: 0, z: 0 }, 30);
ok(hw && hw.distance < 9, `the west side stops a ray at the docks (${hw?.distance.toFixed(1)} m)`);
const top = cw.groundHeight(cx - 10, zMax - 6), floor = hf.heightAt(cx - 10, zMax + 2);
ok(top - floor > 7 && top - floor < 10, `the store wing's roof stands ${(top - floor).toFixed(1)} m over the car park`);

// parked cars: on the lot in front, none on a carriageway
const past = (x, z) => { let d = Infinity; for (const r of map.roads) for (let i = 0; i + 3 < r.p.length; i += 2) { const ax = r.p[i], az = r.p[i + 1], ex = r.p[i + 2] - ax, ez = r.p[i + 3] - az, l2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)); d = Math.min(d, Math.hypot(ax + ex * t - x, az + ez * t - z) - r.w / 2); } return d; };
ok(site.parked.length >= 8, `${site.parked.length} parked cars`);
ok(site.parked.every(([x, z]) => past(x, z) > 1), 'no parked car on a road');
ok(site.parked.every(([x, z]) => z > zMax && site.clear(x, z)), 'the parked cars stand in front, on the cleared lot');

console.log = log;
if (fails) { console.log(`${fails} failure(s)`); process.exit(1); }
console.log('avrora: all ok');
