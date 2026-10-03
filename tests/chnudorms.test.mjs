// Headless checks for the ЧНУ dormitories №3 and №4, вул. Хрещатик 62–64 (src/world/cherkasy/chnudorms.js):
// node tests/chnudorms.test.mjs
// On the real map: both OSM outlines are there, the site builds in budget, both blocks are five storeys, their walls stop
// rays from the yard, each entrance has its steps and canopy where the OSM paths meet the walls, the yard's drive,
// forecourts, walks and beds are where they belong, and the paving keeps off the neighbours and Хрещатик's carriageway.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildChnuDorms, CHNUDORMS_SKIP } from '../src/world/cherkasy/chnudorms.js';
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
for (const id of CHNUDORMS_SKIP) ok(map.buildings.some((b) => b.id === id), `OSM way ${id} is in map_buildings.json`);

const cw = createCollisionWorld({ terrain: (x, z) => H(x, z) });
const root = new THREE.Group();
const site = buildChnuDorms({ root, map, solids: cw, zips: { edge() {} }, heightAt: H });
ok(site && site.footprints?.length === 2 && site.dorms?.length === 2, 'the site builds both blocks');
let verts = 0, meshes = 0, nan = false;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; } });
ok(!nan, 'no NaN vertices');
ok(verts < 30000 && meshes <= 10, `budget: ${verts} verts in ${meshes} meshes`);

// five storeys: the roof deck 15–17 m over the yard
for (const d of site.dorms) {
  const [x, z] = [d.id === 104380675 ? 120 : 126, d.id === 104380675 ? -1612 : -1568];
  const roof = cw.groundHeight(x, z), g = H(x, z);
  ok(roof - g > 14.5 && roof - g < 17.5, `${d.id}: the roof is ${(roof - g).toFixed(1)} m up`);
  ok(Math.abs(d.roof - roof) < 0.5, `${d.id}: dorms[].roof is the deck`);
}
// the walls stop rays from the yard (away from the porches)
const g0 = H(100, -1590);
const r4 = cw.raycast({ x: 100, y: g0 + 1.5, z: -1590 }, { x: 0, y: 0, z: -1 }, 30);
ok(r4 && r4.point.z < -1604.6 && r4.point.z > -1605.4, `a ray from the yard stops at №4's wall (${r4?.point.z.toFixed(1)})`);
const r3 = cw.raycast({ x: 145, y: H(145, -1590) + 1.5, z: -1590 }, { x: 0, y: 0, z: 1 }, 30);
ok(r3 && r3.point.z > -1576 && r3.point.z < -1575.2, `a ray from the yard stops at №3's wall (${r3?.point.z.toFixed(1)})`);

// the entrances face each other across the yard, by the OSM drive (x ~121-124)
const [d4, d3] = [site.dorms.find((d) => d.id === 104380675), site.dorms.find((d) => d.id === 103587765)];
ok(Math.abs(d4.door[0] - 124) < 2 && Math.abs(d4.door[1] + 1605) < 0.5, `№4's door is on its yard wall at x ${d4.door[0].toFixed(1)}`);
ok(Math.abs(d3.door[0] - 122) < 2 && Math.abs(d3.door[1] + 1575.4) < 0.5, `№3's door is on its yard wall at x ${d3.door[0].toFixed(1)}`);
// the steps rise from the forecourt toward the door; the canopy is an awning the car drives under
const step4 = cw.groundHeight(d4.door[0] - 1, -1601.0, H(d4.door[0], -1601) + 3), g4 = H(d4.door[0] - 1, -1599);
ok(step4 - g4 > 0.25 && step4 - g4 < 1.1, `№4's steps rise ${(step4 - g4).toFixed(2)} m toward the door`);
ok(d4.floor - H(d4.door[0], -1599) > 0.6 && d4.floor - H(d4.door[0], -1599) < 1.2, `№4's floor is ${(d4.floor - H(d4.door[0], -1599)).toFixed(2)} m over the forecourt`);
ok(d3.floor - H(d3.door[0], -1581) > 0.25 && d3.floor - H(d3.door[0], -1581) < 0.9, `№3's floor is ${(d3.floor - H(d3.door[0], -1581)).toFixed(2)} m over its forecourt`);
// the flight and the ramp carry the car on sloped supports: half-way up, the support is about half-way up
const gS = H(d4.door[0], -1600.2), sS = cw.groundHeight(d4.door[0], -1601.0, d4.floor + 1);
ok(sS > gS + 0.15 && sS < d4.floor - 0.15, `№4's flight supports the car part-way up (${(sS - gS).toFixed(2)} m of ${(d4.floor - gS).toFixed(2)})`);
const xR = d4.door[0] + 7.7, gR = H(xR + 3.3, -1603.4), sR = cw.groundHeight(xR, -1603.4, d4.floor + 1);
ok(sR > gR + 0.2 && sR < d4.floor - 0.1, `№4's ramp supports the car part-way up (${(sR - gR).toFixed(2)} m)`);
const canopy =cw.raycast({ x: d3.door[0], y: d3.floor + 6, z: -1577 }, { x: 0, y: -1, z: 0 }, 10);
ok(canopy && canopy.kind === 'awning', `№3's canopy is an awning (${canopy?.kind})`);

// the yard: drive and forecourts asphalt, walks paved, beds along the walls, the diagonal path
const C = { GROUND: 0, BED: 1, ASPH: 2, PAVE: 3, PATH: 4, HARD: 9 };
ok(site.surf(100, -1593.5) === C.ASPH, 'the drive is asphalt');
ok(site.surf(121, -1588) === C.ASPH, 'the drive turns north to №3');
ok(site.surf(130, -1582) === C.ASPH && site.surf(130, -1597.5) === C.ASPH, 'both forecourts are asphalt');
ok(site.surf(105, -1579.3) === C.PAVE && site.surf(150, -1598.1) === C.PAVE, 'the walks along both blocks are paved');
ok(site.surf(159.8, -1590) === C.PAVE && site.surf(165.5, -1590) === C.PAVE, 'both Хрещатик pavements are paved');
ok(site.surf(140, -1590) === C.PATH, 'the diagonal path crosses the yard');
ok(site.surf(105, -1576.5) === C.BED && site.surf(145, -1602) === C.BED, 'flower beds run along both yard walls');
ok(site.surf(124, -1603) === C.HARD && site.surf(122, -1577) === C.HARD, 'the porches stand by the doors');
ok(site.surf(140, -1586) === C.GROUND, 'the lawn in the yard is left to the ground');
// the paving keeps off the carriageway and the neighbours
const road = map.roads.find((q) => q.n === 'вулиця Хрещатик' && q.p.some((v, i) => i % 2 === 1 && v < -1600) && q.p.some((v, i) => i % 2 === 1 && v > -1500));
const cx = (z) => { const p = road.p; for (let i = 2; i < p.length; i += 2) if ((p[i - 1] - z) * (p[i + 1] - z) <= 0) return p[i - 2] + (p[i] - p[i - 2]) * (z - p[i - 1]) / (p[i + 1] - p[i - 1]); return NaN; };
for (const z of [-1625, -1590, -1555]) ok(site.surf(cx(z) - road.w / 2 + 0.2, z) === C.GROUND, `the pavement stops at the carriageway's edge (z ${z})`);
for (const nid of [917129524, 628843120, 917129528]) {
  const nb = map.buildings.find((b) => b.id === nid);
  if (!nb) continue;
  let hit = false;
  for (let i = 0; i < nb.p.length; i += 2) { const c = site.surf(nb.p[i] + Math.sign(126 - nb.p[i]) * 0.3, nb.p[i + 1] + Math.sign(-1590 - nb.p[i + 1]) * 0.3); if (c === C.ASPH || c === C.PAVE) hit = true; }
  ok(!hit, `the paving keeps off building ${nid}`);
}
// no generated trees on the paving, the trees on the lawn stay
ok(site.clear(100, -1593.5) && site.clear(124, -1603) && !site.clear(140, -1588), 'clear() keeps trees off the paving, not off the lawn');

console.log = log;
if (fails) { console.log(`${fails} failure(s)`); process.exit(1); }
console.log('chnudorms: all ok');
