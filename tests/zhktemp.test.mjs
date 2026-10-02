// Headless checks for ЖК «Темп», вул. Юрія Іллєнка 4 (src/world/cherkasy/zhktemp.js): node tests/zhktemp.test.mjs
// On the real map: both OSM outlines are there, the site builds in budget, its walls stop rays from the street and the
// yard and the fence closes the lot but for the yard gate, the balconies stand proud up high, the roof stands nine storeys up with the stair head over it, the annex is
// one tall storey, and the lot keeps off its neighbours.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildZhkTemp, ZHKTEMP_SKIP } from '../src/world/cherkasy/zhktemp.js';
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
for (const id of ZHKTEMP_SKIP) ok(map.buildings.some((b) => b.id === id), `OSM way ${id} is in map_buildings.json`);

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildZhkTemp({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt });
ok(site && site.footprints?.length === 2, 'the site builds');
let verts = 0, meshes = 0, nan = false;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; } });
ok(!nan, 'no NaN vertices');
ok(verts < 9000 && meshes <= 5, `budget: ${verts} verts in ${meshes} meshes`);

const g = hf.heightAt(790, 3280);
const hf0 = cw.raycast({ x: 790, y: g + 1, z: 3292 }, { x: 0, y: 0, z: -1 }, 30);
ok(hf0 && hf0.point.z > 3282 && hf0.point.z < 3284, `the lot's fence stops a ray from the street (${hf0?.point.z.toFixed(1)})`);
const gate = cw.raycast({ x: 785.5, y: g + 1, z: 3232 }, { x: 0, y: 0, z: 1 }, 12);
ok(!gate, 'the yard gate is open');
const hs = cw.raycast({ x: 790, y: g + 1, z: 3280 }, { x: 0, y: 0, z: -1 }, 30);
ok(hs && hs.kind === 'wall' && hs.point.z > 3267.5 && hs.point.z < 3268.5, `a ray from the street stops at the ground floor (${hs?.point.z.toFixed(1)})`);
const hy = cw.raycast({ x: 782, y: g + 1, z: 3242 }, { x: 0, y: 0, z: 1 }, 30);
ok(hy && hy.point.z > 3247.3 && hy.point.z < 3248.4, `a ray from the yard stops at the ground floor (${hy?.point.z.toFixed(1)})`);
const hb = cw.raycast({ x: 790, y: g + 15, z: 3280 }, { x: 0, y: 0, z: -1 }, 30);
ok(hb && hb.point.z > 3268.25 && hb.point.z < 3269, `up high the street-side balconies stand proud (${hb?.point.z.toFixed(1)})`);
const roof = cw.groundHeight(780, 3260), floor = hf.heightAt(780, 3260);
ok(roof - floor > 27 && roof - floor < 30, `the roof is ${(roof - floor).toFixed(1)} m up`);
ok(Math.abs(site.top - roof) < 1.2, 'site.top is the roof deck');
const head = cw.groundHeight(782.5, 3250, roof + 10);
ok(head - roof > 2.5, `the stair head rises over the roof (${(head - roof).toFixed(1)} m)`);
const annex = cw.groundHeight(762, 3272, roof);
ok(annex - floor > 4.5 && annex - floor < 6.5, `the annex is one tall storey (${(annex - floor).toFixed(1)} m)`);
// the neighbours: the five-storey block to the east, the garages to the south-west
const inPoly = (p, x, z) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > z) !== (p[j + 1] > z) && x < (p[j] - p[i]) * (z - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) c = !c; return c; };
const lot = [[752, 3244], [801, 3244], [801, 3280], [752, 3280]];
for (const nid of [117808110, 1001040828, 1001040826]) {
  const nb = map.buildings.find((b) => b.id === nid);
  ok(!nb || !lot.some(([x, z]) => inPoly(nb.p, x, z)), `the lot keeps off building ${nid}`);
}

console.log = log;
if (fails) { console.log(`${fails} failure(s)`); process.exit(1); }
console.log('zhktemp: all ok');
