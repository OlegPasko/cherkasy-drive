// Headless checks for the bull sculpture by the meat plant (src/world/cherkasy/bull.js): node tests/bull.test.mjs
// On the real map: the site builds in budget beside its OSM node, the bull stands on its pedestal (a ray from the
// street hits the pedestal and, higher, the bull), the plant's fence and gate stop a car behind it, vul. Skovorody
// stays clear of it, and places.js's outline matches the built base.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { FRAME_OF } from '../src/world/cherkasy/frame.js';
import { buildBull } from '../src/world/cherkasy/bull.js';
import { BULL_RING } from '../src/world/cherkasy/places.js';
import * as THREE from 'three';

const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const hf = createHeightField(map, dem), geo = FRAME_OF(map);
const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildBull({ root, map, solids: cw, heightAt: hf.heightAt, geo });
ok(!!site, 'the site builds');
let verts = 0, meshes = 0, nan = false;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; } });
ok(!nan, 'no NaN vertices');
ok(verts < 12000 && meshes <= 6, `budget: ${verts} verts in ${meshes} meshes`);

const [ox, oz] = site.stats.origin, [nx, nz] = geo.toXZ(49.4207345, 32.0373102);
ok(Math.hypot(ox - nx, oz - nz) < 1.5, 'the pedestal stands at the OSM node');
const xs = [], zs = []; for (let i = 0; i < BULL_RING.length; i += 2) { xs.push(BULL_RING[i]); zs.push(BULL_RING[i + 1]); }
ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - ox) < 0.1 && Math.abs((Math.min(...zs) + Math.max(...zs)) / 2 - oz) < 0.1, 'places.js outline (BULL_RING) is centred on the built base');

const g = hf.heightAt(ox, oz);
// from vul. Skovorody (east, +x): low the ray hits the white pedestal, at the bull's height the bull
const lo = cw.raycast({ x: ox + 6, y: g + 1.2, z: oz }, { x: -1, y: 0, z: 0 }, 10);
ok(lo && lo.point.x > ox + 0.5 && lo.point.x < ox + 1.4, `a low ray from the street stops at the pedestal (${lo?.point.x.toFixed(2)})`);
const hi = cw.raycast({ x: ox + 6, y: site.stats.pedestalTop + 0.9, z: oz }, { x: -1, y: 0, z: 0 }, 10);
ok(hi && hi.kind === 'statue', `a ray at the bull's height hits the statue (${hi?.kind})`);
ok(site.stats.pedestalTop - g > 1.7 && site.stats.pedestalTop - g < 2.3, `the pedestal top is ${(site.stats.pedestalTop - g).toFixed(2)} m up`);
// the plant fence and the shut gate behind the bull
for (const z of [oz - 8, (site.stats.gate[0] + site.stats.gate[1]) / 2]) {
  const h = cw.raycast({ x: site.stats.fenceX + 5, y: hf.heightAt(site.stats.fenceX, z) + 1.0, z }, { x: -1, y: 0, z: 0 }, 10);
  ok(h && Math.abs(h.point.x - site.stats.fenceX) < 0.4, `the fence / gate stops a ray at z ${z.toFixed(0)} (${h?.kind})`);
}
// vul. Skovorody (OSM: x ~ -3070.6 here, 6.5 m wide) stays clear: no solid on its carriageway
let hit = false;
for (let z = oz - 45; z < oz + 8; z += 1) if (cw.solidAt(-3070.6 - 3.25 + 0.3, hf.heightAt(-3073.6, z) + 0.8, z) >= 0) hit = true;
ok(!hit, 'nothing stands on vul. Skovorody');
ok(site.clear(ox, oz) && !site.clear(ox + 30, oz - 30), 'trees are cleared round the pedestal only');

console.log = log;
if (fails) { console.log(`${fails} failure(s)`); process.exit(1); }
console.log('bull: all ok');
