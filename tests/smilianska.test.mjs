// Headless checks for the two «Надія» towers on вул. Смілянська (src/world/cherkasy/smilianska.js): node tests/smilianska.test.mjs
// On the real map: the OSM ways are there, the site builds in budget, both towers stand seventeen storeys up, their walls
// and bays stop rays, the lift rooms rise over the roofs, the lot keeps off the neighbours and the service lane, and the
// 52 tower's outline in places.js matches the module.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildSmilianska, SMILIANSKA_SKIP, SMIL52_RING } from '../src/world/cherkasy/smilianska.js';
import { SMIL52_RING as PLACE_RING } from '../src/world/cherkasy/places.js';
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
for (const id of [546773841, 1124412970]) ok(SMILIANSKA_SKIP.has(id) && map.buildings.some((b) => b.id === id), `OSM way ${id} is in map_buildings.json and skipped`);
ok(JSON.stringify(SMIL52_RING) === JSON.stringify(PLACE_RING), 'places.js has the 52 tower outline');

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildSmilianska({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt });
ok(site && site.footprints?.length === 2 && site.towers.length === 2, 'the site builds two towers');
let verts = 0, meshes = 0, nan = false;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; } });
ok(!nan, 'no NaN vertices');
ok(verts < 24000 && meshes <= 7, `budget: ${verts} verts in ${meshes} meshes`);

for (const [i, t] of site.towers.entries()) {
  const cx = t.ring.reduce((s, p) => s + p[0], 0) / 6, cz = t.ring.reduce((s, p) => s + p[1], 0) / 6, g = hf.heightAt(cx, cz);
  const roof = cw.groundHeight(cx - 6, cz + (i ? -6 : 6), g + 80);
  ok(roof - g > 50 && roof - g < 54.5, `tower ${i}: the roof is ${(roof - g).toFixed(1)} m up`);
  ok(Math.abs(t.top - roof) < 0.5, `tower ${i}: top is the roof deck`);
  // a ray from the lane side (south-west, -x) stops at the wall x = -386.7 or its bay
  const h = cw.raycast({ x: -395, y: g + 1.5, z: cz }, { x: 1, y: 0, z: 0 }, 20);
  ok(h && h.point.x > -388.2 && h.point.x < -386.5, `tower ${i}: a ray from the lane stops at the wall (${h?.point.x.toFixed(1)})`);
  // the big chamfer's bays stand proud of it, high up
  const zc = cz + (i ? 14 : -14), xc = -372.7 + (i ? 294.1 - zc : zc - 329.5); // the chamfer's wall line there
  const d = cw.raycast({ x: -350, y: g + 30, z: zc }, { x: -1, y: 0, z: 0 }, 30);
  ok(d && d.point.x > xc + 0.5 && d.point.x < xc + 1.8, `tower ${i}: up high the chamfer's bay stands proud (${d?.point.x.toFixed(1)} vs wall ${xc.toFixed(1)})`);
}
// the lift rooms rise over the roof
{ const t = site.towers[0], [x, z] = [-386.7 + 15, 329.5 + 9]; const y = cw.groundHeight(x, z, t.top + 10); ok(y - t.top > 2.5, `the lift room stands ${(y - t.top).toFixed(1)} m over the roof`); }

// the neighbours stay clear: the houses round the lot and the two-storey block by the yard
const inPoly = (p, x, z) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > z) !== (p[j + 1] > z) && x < (p[j] - p[i]) * (z - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) c = !c; return c; };
for (const nid of [596150136, 962938287, 596150133, 596150134]) {
  const nb = map.buildings.find((b) => b.id === nid);
  ok(nb && !site.towers.some((t) => t.ring.some(([x, z]) => inPoly(nb.p, x, z))) && !site.towers.some((t) => { let c = 0; for (let i = 0; i < nb.p.length; i += 2) c += inPoly(t.ring.flat(), nb.p[i], nb.p[i + 1]); return c; }),
    `the towers keep off building ${nid}`);
}
// the service lane along x -390 and z 300 is clear of the towers
for (const [x, z] of [[-390, 340], [-390, 310], [-370, 300], [-380, 300.5]]) ok(!site.towers.some((t) => inPoly(t.ring.flat(), x, z)) && cw.groundHeight(x, z, hf.heightAt(x, z) + 1) - hf.heightAt(x, z) < 0.5, `the lane at ${x}, ${z} is free`);

console.log = log;
if (fails) { console.log(`${fails} failure(s)`); process.exit(1); }
console.log('smilianska: all ok');
