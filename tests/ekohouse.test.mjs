// Headless checks for КМ «Екохаус» (src/world/cherkasy/ekohouse.js): node tests/ekohouse.test.mjs
// On the real map with the lot levelled: the two OSM rows are there and match the module's first two rows, the town
// builds within budget with no NaN vertices, the rows stop a ray at their fronts and backs, the roofs stand two storeys
// up, the courts and the gates are open, the fence holds elsewhere, the parked cars stand on the lot off the buildings.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildEkohouse, levelEkohouse, EKOHOUSE_SKIP, EKO_ROWS, EKO_LOT, ekoRowRing } from '../src/world/cherkasy/ekohouse.js';
import { inPoly } from '../src/world/cherkasy/geo.js';
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
const lvl = levelEkohouse(hf);
ok(Number.isFinite(lvl), `the lot is levelled (${lvl?.toFixed(2)} m)`);
const spread = [[-1460, 4265], [-1400, 4265], [-1430, 4288], [-1390, 4245], [-1450, 4214], [-1450, 4190]].map(([x, z]) => hf.heightAt(x, z));
ok(Math.max(...spread) - Math.min(...spread) < 0.3, `the courts, gardens and the car park are level (${Math.min(...spread).toFixed(2)}..${Math.max(...spread).toFixed(2)})`);

// the OSM rows agree with the first two module rows
[...EKOHOUSE_SKIP].forEach((id, k) => {
  const b = map.buildings.find((q) => q.id === id);
  ok(!!b, `OSM row ${id} is in map_buildings.json`);
  if (!b) return;
  const xs = b.p.filter((_, i) => i % 2 === 0), zs = b.p.filter((_, i) => i % 2), R = ekoRowRing(EKO_ROWS[k]);
  const d = Math.max(Math.abs(Math.min(...xs) - Math.min(...R.map((p) => p[0]))), Math.abs(Math.max(...xs) - Math.max(...R.map((p) => p[0]))),
    Math.abs(Math.min(...zs) - Math.min(...R.map((p) => p[1]))), Math.abs(Math.max(...zs) - Math.max(...R.map((p) => p[1]))));
  ok(d < 0.3, `row ${k + 1} sits on its OSM outline (${d.toFixed(2)} m off)`);
});

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildEkohouse({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt });
ok(site && site.footprints.length === 4, `the town builds: 4 rows (${site?.footprints.length})`);
let verts = 0, gpuVerts = 0, meshes = 0, units;
root.traverse((o) => {
  if (!o.isMesh) return;
  meshes++; const n = o.geometry.attributes.position.count; verts += n; gpuVerts += n * (o.isInstancedMesh ? o.count : 1);
  ok(!o.geometry.attributes.position.array.some(Number.isNaN), `${o.name}: no NaN vertices`);
});
units = EKO_ROWS.reduce((n, q) => n + q.n, 0);
ok(units === 33, `33 townhouses (${units})`);
ok(verts < 32000 && meshes <= 12, `budget: ${verts} verts in ${meshes} draws (${gpuVerts} drawn)`);

const ray = (x, z, h, dx, dz, max = 30) => cw.raycast({ x, y: hf.heightAt(x, z) + h, z }, { x: dx, y: 0, z: dz }, max);
const near = (hit, d, msg) => ok(hit && Math.abs(hit.distance - d) < 0.6, `${msg} (${hit ? hit.distance.toFixed(1) + ' ' + hit.kind : 'no hit'}, expected ~${d})`);
near(ray(-1430, 4265, 1, 0, 1), 8.7, 'the first row stops a ray from the court at its front');
near(ray(-1430, 4265, 1, 0, -1), 7.9, 'the second row stops a ray from the court at its front');
near(ray(-1430, 4289, 1, 0, -1), 4.0, 'the first row stops a ray from its gardens');
near(ray(-1450, 4214, 1, 0, 1), 8.5, 'the north-west court is closed by row 3');
ok(!ray(-1460, 4265, 1, 1, 0, 50), 'the first court is open along its length');
ok(!ray(-1395, 4265.5, 1, 1, 0, 25), 'the gate on Сагайдачного is open');
ok(!ray(-1450, 4214, 1, -1, 0, 20), 'the gate on Турчина is open');
near(ray(-1395, 4250, 1, 1, 0), 14.6, 'the fence holds beside the gate');
const [bx, bz] = [-1430 + 0.0, 4279.5], roof = cw.groundHeight(bx, bz, 500) - hf.heightAt(bx, bz);
ok(roof > 6 && roof < 8, `the roofs stand ${roof.toFixed(1)} m over the ground`);

ok(site.parked.length >= 10, `${site.parked.length} parked cars`);
ok(site.parked.every(([x, z]) => inPoly(EKO_LOT, x, z)), 'the parked cars are on the lot');
ok(site.parked.every(([x, z]) => !site.footprints.some((f) => inPoly(f.poly, x, z))), 'no parked car inside a row');
ok(site.spots.every((s) => !site.footprints.some((f) => inPoly(f.poly, s.x, s.z))), 'no tree inside a row');
ok(site.clear(-1430, 4265) && !site.clear(-1500, 4265), 'generated trees keep off the lot only');

console.log = log;
if (fails) { console.log(`${fails} failure(s)`); process.exit(1); }
console.log('ekohouse: all ok');
