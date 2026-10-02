// Headless checks for ТЦ «Екватор» and its drift lot, and Sport Life at Mytnytsia (issue #25): node tests/ekvator.test.mjs
// On the real map: the terrain hook levels the lot, the slab is flat to the centimetre, the street rises onto it with no
// step, nothing but the lot itself stands in its middle, and both buildings build within a modest budget.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { levelEkvator, buildEkvator, LOT } from '../src/world/cherkasy/ekvator.js';
import { buildSportLife } from '../src/world/cherkasy/sportlife.js';
import { inPoly } from '../src/world/cherkasy/geo.js';
import * as THREE from 'three';

const ctx2d = new Proxy({}, { get: () => () => ({ width: 10 }), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
map.buildings = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const hf = createHeightField(map, dem);

const spread = (pts) => { const h = pts.map(([x, z]) => hf.heightAt(x, z)); return Math.max(...h) - Math.min(...h); };
const grid = [];
for (let x = LOT.x0 + 4; x < LOT.x1 - 4; x += 9) for (let z = LOT.z0 + 3; z < 3545; z += 7) grid.push([x, z]);
const before = spread(grid);
const level = levelEkvator(hf, map);
ok(Number.isFinite(level), `terrain hook levels the lot (${level?.toFixed(2)} m, natural spread ${before.toFixed(1)} m)`);
ok(spread(grid) < 0.01, `levelled terrain under the lot is flat (spread ${spread(grid).toFixed(3)} m)`);

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) + (Math.abs(x + 4312) < 2.3 && z < LOT.z0 ? 0 : 0.15) });
const root = new THREE.Group(), zips = { edge() {}, add() {} };
const T = { asphalt: new THREE.DataTexture(new Uint8Array(4), 1, 1) };
const site = buildEkvator({ root, map, solids: cw, zips, heightAt: hf.heightAt, T });
ok(!!site && root.children.length === 1, 'Ekvator builds');
const yS = site.lot.y;
let worst = 0;
for (const [x, z] of grid) if (inPoly(site.lot.ring, x, z)) worst = Math.max(worst, Math.abs(cw.groundHeight(x, z, yS + 0.3) - yS));
ok(worst < 0.005, `the slab is flat (worst ${(worst * 100).toFixed(2)} cm off ${yS.toFixed(2)} m)`);

// in from the street along the middle service way: no step anywhere on the way up
let prev = cw.groundHeight(-4312, 3424), maxStep = 0;
for (let z = 3424; z <= 3470; z += 0.25) { const y = cw.groundHeight(-4312, z, prev + 0.3); maxStep = Math.max(maxStep, Math.abs(y - prev)); prev = y; }
ok(maxStep < 0.06 && Math.abs(prev - yS) < 0.005, `the street ramps onto the lot (largest step ${(maxStep * 100).toFixed(1)} cm per 25 cm)`);
// and over the open west and east edges
for (const [x0, x1, z] of [[LOT.x0 - 6, LOT.x0 + 4, 3500], [LOT.x1 + 6, LOT.x1 - 4, 3500]]) {
  let p = cw.groundHeight(x0, z), m = 0;
  for (let k = 0; k <= 40; k++) { const x = x0 + (x1 - x0) * k / 40, y = cw.groundHeight(x, z, p + 0.3); m = Math.max(m, Math.abs(y - p)); p = y; }
  ok(m < 0.1, `edge at x ${x0.toFixed(0)}: largest step ${(m * 100).toFixed(1)} cm`);
}

// the middle of the lot is clear: only the slab itself, no poles, nothing to hit while drifting
const kinds = new Set();
cw.query(LOT.x0 + 8, LOT.z0 + 8, LOT.x1 - 8, 3538, (id) => { kinds.add(cw.kindOf(id)); });
ok([...kinds].every((k) => k === 'lot'), `nothing stands in the lot's middle (${[...kinds].join(', ')})`);
const body = { x: -4380, z: 3500 };
ok(cw.ceilingAt(body.x, body.z, yS + 0.05) === Infinity, 'open sky over the apron');

let verts = 0, nan = 0;
root.traverse((o) => { if (o.isMesh) { verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (!Number.isFinite(v)) nan++; } });
ok(nan === 0, 'no NaN positions');
ok(verts < 60000, `Ekvator budget: ${(verts / 1000).toFixed(1)}k verts in ${root.children[0].children.length} meshes`);
ok(site.clear(-4300, 3500) && site.clear(-4240, 3620) && !site.clear(-4240, 3400), 'trees are kept off the lot and the hall, not the street');

// Sport Life
const root2 = new THREE.Group(), cw2 = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const sl = buildSportLife({ root: root2, map, solids: cw2, zips, heightAt: hf.heightAt });
ok(!!sl && root2.children.length === 1, 'Sport Life builds');
let v2 = 0;
root2.traverse((o) => { if (o.isMesh) { v2 += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (!Number.isFinite(v)) nan++; } });
ok(nan === 0 && v2 < 20000, `Sport Life budget: ${(v2 / 1000).toFixed(1)}k verts`);
ok(cw2.inside(1325, 4 + hf.heightAt(1325, 2725), 2725), 'its hall is solid');

log(fails ? `${fails} failed` : 'all ok');
process.exit(fails ? 1 : 0);
