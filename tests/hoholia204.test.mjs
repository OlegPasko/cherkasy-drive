// Headless checks for the new block at вул. Гоголя, 204 (src/world/cherkasy/hoholia204.js): node tests/hoholia204.test.mjs
// On the real map: the OSM outline is there, the site builds in budget, its walls stop rays from the drive and the
// yard, the loggias stand proud up high, the roof stands fourteen storeys up, the stair core rises over it, and the lot
// keeps off its neighbours.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildHoholia204, HOHOLIA204_SKIP } from '../src/world/cherkasy/hoholia204.js';
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
const [id] = HOHOLIA204_SKIP;
ok(map.buildings.some((b) => b.id === id), `OSM way ${id} is in map_buildings.json`);

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildHoholia204({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt });
ok(site && site.footprints?.length === 1, 'the site builds');
let verts = 0, meshes = 0, nan = false;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; } });
ok(!nan, 'no NaN vertices');
ok(verts < 30000 && meshes <= 5, `budget: ${verts} verts in ${meshes} meshes`);

const g = hf.heightAt(-354, -462);
const hd = cw.raycast({ x: -354, y: g + 1, z: -462 }, { x: 0, y: 0, z: -1 }, 20);
ok(hd && hd.kind === 'wall' && Math.abs(hd.point.z - -469.6) < 0.5, `a ray from the drive stops at the ground floor (${hd?.point.z.toFixed(1)})`);
const hy = cw.raycast({ x: -354, y: g + 1, z: -495 }, { x: 0, y: 0, z: 1 }, 20);
ok(hy && Math.abs(hy.point.z - -482.8) < 0.5, `a ray from the yard stops at the ground floor (${hy?.point.z.toFixed(1)})`);
const hh = cw.raycast({ x: -346.9, y: g + 20, z: -462 }, { x: 0, y: 0, z: -1 }, 20);
ok(hh && hh.point.z > -469.5 && hh.point.z < -468, `up high the loggias stand proud of the wall (${hh?.point.z.toFixed(1)})`);
const roof = cw.groundHeight(-362, -476), floor = hf.heightAt(-354, -462);
ok(roof - floor > 42 && roof - floor < 46, `the roof is ${(roof - floor).toFixed(1)} m up`);
ok(Math.abs(site.top - roof) < 1.2, 'site.top is the roof deck');
const core = cw.groundHeight(-341.6, -483.6, roof + 10);
ok(core - roof > 2.5, `the stair core rises over the roof (${(core - roof).toFixed(1)} m)`);
// the neighbours: the ten-storey block across the drive, the house by the car-park end, Любава far off
const inPoly = (p, x, z) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > z) !== (p[j + 1] > z) && x < (p[j] - p[i]) * (z - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) c = !c; return c; };
for (const nid of [154594260, 418157170, 159065169]) {
  const nb = map.buildings.find((b) => b.id === nid);
  ok(!nb || ![[-380.5, -481.5], [-380.5, -469.6], [-333.4, -468.6], [-373.8, -468.6]].some(([x, z]) => inPoly(nb.p, x, z)), `the lot keeps off building ${nid}`);
}

console.log = log;
if (fails) { console.log(`${fails} failure(s)`); process.exit(1); }
console.log('hoholia204: all ok');
