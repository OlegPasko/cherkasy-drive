// Headless checks for the silk combine's front block and gate (src/world/cherkasy/silk.js): node tests/silk.test.mjs
// On the real map: the OSM block is there and replaced, the site builds in budget, the block stands three storeys (not
// a slab or a shed), its street wall stops a ray, the entrance canopy lets a car under, the gate stays open on the
// yard road, and the tree clearing keeps to the block and the gate.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildSilk, SILK_SKIP } from '../src/world/cherkasy/silk.js';
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
for (const id of SILK_SKIP) ok(map.buildings.some((b) => b.id === id), `OSM way ${id} is in map_buildings.json`);

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildSilk({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt });
ok(site && site.footprints?.length === 1, 'the site builds');
let verts = 0, meshes = 0, nan = false;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; } });
ok(!nan, 'no NaN vertices');
ok(verts < 20000 && meshes <= 7, `budget: ${verts} verts in ${meshes} meshes`);

// the block: three storeys, its street wall at z ~ 2393.5 on the west half (away from the entrance hall)
const x = -4545, g = hf.heightAt(x, 2387), roof = cw.groundHeight(x, 2387, g + 40);
ok(roof - g > 11 && roof - g < 13.5, `the roof is ${(roof - g).toFixed(1)} m up (three storeys)`);
const hs = cw.raycast({ x, y: g + 2, z: 2405 }, { x: 0, y: 0, z: -1 }, 20);
ok(hs && Math.abs(hs.point.z - 2393.4) < 0.5, `a ray from the street stops at the wall (${hs?.point.z.toFixed(2)})`);
// the entrance canopy is an awning over the steps a car can pass beneath, the hall stands proud of the wall
{
  const s = site.stats, f = s.front, mid = (s.hall[0] + s.hall[1]) / 2, px = f.ax + f.ux * mid + f.nx * 4, pz = f.az + f.uz * mid + f.nz * 4;
  const top = cw.topAt(px, pz, s.floor + 10);
  ok(top.id >= 0 && top.y > s.floor + 3 && top.y < s.floor + 4, `the canopy is ${(top.y - s.floor).toFixed(2)} m over the floor`);
  const hh = cw.raycast({ x: f.ax + f.ux * mid + f.nx * 12, y: s.floor + 6, z: f.az + f.uz * mid + f.nz * 12 }, { x: -f.nx, y: 0, z: -f.nz }, 20);
  ok(hh && hh.distance > 12 - 1.6 && hh.distance < 12 - 1.2, `the hall stands ${(12 - (hh?.distance ?? 0)).toFixed(2)} m proud of the front`);
}
// the gate on the yard road (OSM service way, x ~ -4407) stays open: nothing solid across the road at car height
let blocked = false;
for (let z = 2390; z < 2410; z += 0.5) if (cw.solidAt(-4407, hf.heightAt(-4407, z) + 1, z) >= 0) blocked = true;
ok(!blocked, 'the yard road through the gate is open');
const hb = cw.raycast({ x: -4417.4, y: hf.heightAt(-4417.4, 2410) + 1.5, z: 2410 }, { x: 0, y: 0, z: -1 }, 20);
ok(hb && hb.point.z > 2400 && hb.point.z < 2401, `the checkpoint's wall stops a ray (${hb?.point.z.toFixed(2)})`);
ok(site.clear(x, 2387) && site.clear(-4407, 2398) && !site.clear(x, 2440), 'trees are cleared off the block and the gate only');

console.log = log;
if (fails) { console.log(`${fails} failure(s)`); process.exit(1); }
console.log('silk: all ok');
