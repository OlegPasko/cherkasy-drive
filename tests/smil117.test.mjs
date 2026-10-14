// Headless checks for вул. Смілянська 117 / 119 (src/world/cherkasy/smil117.js): node tests/smil117.test.mjs
// On the real map: both OSM outlines are there, the site builds in budget, the blocks stand five storeys (not the nine
// the generic extrusion gave them), their walls stop rays from the street and the yard, the street-side balconies
// stand proud up high, the yard canopies let a car under, and the tree clearing keeps to the blocks. The yard behind
// them (issue #44): the FBS fence, the pull-ins with parked cars, its own plants and the open lawn.
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
ok(site && site.footprints?.filter((f) => f.kind === 'apt').length === 2, 'the site builds both blocks');
{
  // the sheds' walls stand a storey over the ground at their middle (the colliders' top)
  const sh = site.footprints.filter((f) => f.kind === 'shed');
  const hs = sh.map((f) => { const c = f.poly.reduce((a, p) => [a[0] + p[0] / f.poly.length, a[1] + p[1] / f.poly.length], [0, 0]); return cw.groundHeight(c[0], c[1], 500) - hf.heightAt(c[0], c[1]); });
  ok(sh.length === 6 && hs.every((h) => h > 2.5 && h < 5), `the six sheds beyond the fence stand one storey (${hs.map((h) => h.toFixed(1)).join(', ')} m)`);
}
let verts = 0, meshes = 0, nan = false;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; } });
ok(!nan, 'no NaN vertices');
ok(verts < 27000 && meshes <= 10, `budget: ${verts} verts in ${meshes} meshes (blocks, yard and sheds)`);

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

// the yard behind No.119 (issue #44): the FBS fence closes it, the pull-ins hold parked cars nose out, its own plants
// replace the generated trees, the lawn stays open between the shrub belt and the fence
{
  const Y = site.yard;
  ok(Y && Y.nBlocks > 150, `the fence is laid (${Y?.nBlocks} blocks)`);
  ok(site.parked.length >= 6 && site.parked.every(([x, z]) => { const [s, o] = Y.SO(x, z); return o > Y.driveO(s) + 3 && o < Y.driveO(s) + 7; }), `${site.parked.length} cars stand in the pull-ins off the drive`);
  ok(site.spots.length > 150 && site.spots.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z)), `${site.spots.length} plants`);
  ok(site.spots.every((p) => { const [s, o] = Y.SO(p.x, p.z); return o > 1.5 || s < 0 || s > 125; }), 'no plant stands against No.119');
  // a ray across the lawn toward the fence stops at it, knee high; one over it does not
  for (const s of [40, 90, 180]) {
    const [x0, z0] = Y.W(s, Y.fenceO(s) - 8), [x1, z1] = Y.W(s, Y.fenceO(s) + 8), L = Math.hypot(x1 - x0, z1 - z0), d = { x: (x1 - x0) / L, y: 0, z: (z1 - z0) / L };
    const g = hf.heightAt(...Y.W(s, Y.fenceO(s)));
    const lo = cw.raycast({ x: x0, y: g + 0.45, z: z0 }, d, 16), hi = cw.raycast({ x: x0, y: g + 3.2, z: z0 }, d, 16);
    const at = lo && Y.SO(lo.point.x, lo.point.z)[1] - Y.fenceO(s);
    ok(lo && Math.abs(at) < 0.7, `s ${s}: a ray across the lawn stops ${at?.toFixed(2)} m off the fence line`);
    ok(!hi || hi.object === 'tree', `s ${s}: a ray at 3 m clears the fence`);
  }
  // along the whole run a car stops at the fence (its 0.5 m kerb step does not climb a lone block), but for a few gaps
  {
    let n = 0, held = 0;
    for (let s = 26; s < 258; s += 1.2) {
      const [x0, z0] = Y.W(s, Y.fenceO(s) - 4), [x1, z1] = Y.W(s, Y.fenceO(s) + 4), L = Math.hypot(x1 - x0, z1 - z0);
      const g = Math.max(hf.heightAt(x0, z0), hf.heightAt(...Y.W(s, Y.fenceO(s))));
      n++; if (cw.raycast({ x: x0, y: g + 0.7, z: z0 }, { x: (x1 - x0) / L, y: 0, z: (z1 - z0) / L }, 8)) held++;
    }
    ok(held / n > 0.9, `the fence holds a car along ${(100 * held / n).toFixed(0)}% of its run`);
  }
  ok(site.clear(...Y.W(60, 24)) && !site.clear(...Y.W(60, Y.fenceO(60) + 20)), 'the generated trees clear the yard only');
  // the lawn between the shrub belt and the path stays open
  const lawn = site.spots.filter((p) => { const [s, o] = Y.SO(p.x, p.z); return s > 10 && s < 115 && o > Y.driveO(s) + 10 && o < Y.fenceO(s) - 5; });
  ok(lawn.length <= 6, `the lawn is open (${lawn.length} plants on it)`);
}

console.log = log;
if (fails) { console.log(`${fails} failure(s)`); process.exit(1); }
console.log('smil117: all ok');
