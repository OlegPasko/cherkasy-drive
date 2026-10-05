// Headless checks for вул. Смілянська 117 / 119 (src/world/cherkasy/smil117.js): node tests/smil117.test.mjs
// On the real map: both OSM outlines are there, the site builds in budget, the blocks stand five storeys (not the nine
// the generic extrusion gave them), their walls stop rays from the street and the yard, the street-side balconies
// stand proud up high, the yard canopies let a car under, and the tree clearing keeps to the blocks.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildSmil117, SMIL117_SKIP } from '../src/world/cherkasy/smil117.js';
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
for (const id of SMIL117_SKIP) ok(map.buildings.some((b) => b.id === id), `OSM way ${id} is in map_buildings.json`);

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildSmil117({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt });
ok(site && site.footprints?.length === 2, 'the site builds both blocks');
let verts = 0, meshes = 0, nan = false;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; } });
ok(!nan, 'no NaN vertices');
ok(verts < 16000 && meshes <= 5, `budget: ${verts} verts in ${meshes} meshes`);

// the blocks' centres and their street (north-west, -z) / yard (+z) sides along a map-z ray through the middle
for (const [id, x] of [[105315513, -2696], [105315529, -2832]]) {
  const b = map.buildings.find((o) => o.id === id), zs = [];
  // the ring's z where the vertical line x crosses it
  for (let i = 0; i < b.p.length; i += 2) {
    const [x0, z0, x1, z1] = [b.p[i], b.p[i + 1], b.p[(i + 2) % b.p.length], b.p[(i + 3) % b.p.length]];
    if ((x0 - x) * (x1 - x) < 0) zs.push(z0 + (z1 - z0) * (x - x0) / (x1 - x0));
  }
  const [zN, zS] = zs.sort((p, q) => p - q), zc = (zN + zS) / 2, g = hf.heightAt(x, zc);
  const roof = cw.groundHeight(x, zc, g + 40);
  ok(roof - g > 14 && roof - g < 16, `${id}: the roof is ${(roof - g).toFixed(1)} m up (five storeys)`);
  ok(site.roofs[id].some((y) => Math.abs(y - roof) < 0.1), `${id}: the roof deck is one of the sections'`);
  // a ray from the street at ground-floor height, between the stacks, stops at the wall (or the shop porch)
  const hs = cw.raycast({ x, y: g + 1.5, z: zN - 12 }, { x: 0, y: 0, z: 1 }, 20);
  ok(hs && hs.point.z > zN - 2.2 && hs.point.z < zN + 0.3, `${id}: a ray from the street stops at the wall (${hs?.point.z.toFixed(1)} vs ${zN.toFixed(1)})`);
  const hy = cw.raycast({ x, y: g + 4, z: zS + 12 }, { x: 0, y: 0, z: -1 }, 20);
  ok(hy && hy.point.z < zS + 1.5 && hy.point.z > zS - 0.3, `${id}: a ray from the yard stops at the wall (${hy?.point.z.toFixed(1)} vs ${zS.toFixed(1)})`);
  ok(!site.clear(x, zN - 4) && site.clear(x, zc), `${id}: trees are cleared off the block only`);
}
// No.119 steps up its slope, No.117 stands nearly level
{
  const r9 = site.roofs[105315529], r7 = site.roofs[105315513];
  ok(Math.max(...r9) - Math.min(...r9) > 1.5, `No.119's sections step ${(Math.max(...r9) - Math.min(...r9)).toFixed(1)} m`);
  ok(r9.every((y, j) => !j || Math.abs(y - r9[j - 1]) < 1.2), 'each step is under 1.2 m');
  ok(Math.max(...r7) - Math.min(...r7) < 0.8, 'No.117 stands nearly level');
}
// up high somewhere along No.119's street side a balcony stands about a metre proud of the wall line below it
{
  let best = 0;
  for (let x = -2880; x < -2780; x += 0.4) {
    const g = hf.heightAt(x, 525), lo = cw.raycast({ x, y: g + 1.5, z: 500 }, { x: 0, y: 0, z: 1 }, 40), hi = cw.raycast({ x, y: g + 9, z: 500 }, { x: 0, y: 0, z: 1 }, 40);
    if (lo && hi) best = Math.max(best, lo.point.z - hi.point.z);
  }
  ok(best > 0.8 && best < 1.3, `the street-side balconies stand ${best.toFixed(2)} m proud`);
}

console.log = log;
if (fails) { console.log(`${fails} failure(s)`); process.exit(1); }
console.log('smil117: all ok');
