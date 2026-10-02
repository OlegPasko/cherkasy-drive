// Headless checks for the new block at вул. Припортова, 22/1 (src/world/cherkasy/pryportova.js): node tests/pryportova.test.mjs
//   it builds within budget with finite geometry, seventeen storeys tall; the yard keeps clear of every other OSM
//   building and of the motor roads; places.js lists it as an improved object; the walls are solid, the roofs hold,
//   the yard is free to drive through and the trees keep off the lot only.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { inPoly, ringPts } from '../src/world/cherkasy/geo.js';

const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };
const { buildPryportova, PRYPORTOVA_SKIP } = await import('../src/world/cherkasy/pryportova.js');
const { PLACES } = await import('../src/world/cherkasy/places.js');

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
map.buildings = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const hf = createHeightField(map, dem);

const place = PLACES.find((q) => q.id === 'pryportova');
ok(place && place.kind === 'improved' && !place.icon && !place.url && place.bld.every((id) => PRYPORTOVA_SKIP.has(id)), 'places.js: an improved object over the replaced ids');

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) }), root = new THREE.Group(), edges = [];
const site = buildPryportova({ root, map, solids: cw, zips: { edge: (...a) => edges.push(a) }, heightAt: hf.heightAt, facadeMat: new THREE.MeshBasicMaterial() });
ok(!!site, 'site builds');
let verts = 0, meshes = 0, nan = 0;
root.traverse((o) => { if (o.isMesh) { meshes++; const a = o.geometry.attributes.position.array; verts += a.length / 3; for (const v of a) if (!Number.isFinite(v)) nan++; } });
ok(nan === 0, 'all vertices finite');
ok(verts > 10000 && verts < 45000 && meshes <= 8, `${(verts / 1000).toFixed(1)}k vertices in ${meshes} meshes`);
const towers = site.footprints.filter((f) => f.kind === 'apt');
ok(towers.length === 3 && towers.every((f) => f.h > 52 && f.h < 58), `three sections of 17 storeys (${towers.map((f) => f.h.toFixed(1)).join(', ')} m)`);
ok(edges.length >= 12, 'roof edges registered');

// the yard: no other OSM building in the lot, no motor road through it
const lotPts = [];
for (let x = 680; x <= 880; x += 2) for (let z = 2480; z <= 2700; z += 2) if (site.clear(x, z)) lotPts.push([x, z]);
const others = map.buildings.filter((b) => !PRYPORTOVA_SKIP.has(b.id)).filter((b) => { const R = ringPts(b.p); return lotPts.some(([x, z]) => inPoly(R, x, z)); });
ok(others.length === 0, `no other OSM building in the lot (${others.map((b) => b.id).join(', ') || 'none'})`);
const segD = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(ax + t * dx - px, az + t * dz - pz); };
let nearRoad = Infinity;
for (const r of map.roads) {
  if (r.k !== 'm' || r.c === 'service') continue;
  for (let i = 0; i + 3 < r.p.length; i += 2) for (const [x, z] of lotPts) nearRoad = Math.min(nearRoad, segD(x, z, r.p[i], r.p[i + 1], r.p[i + 2], r.p[i + 3]) - r.w / 2);
}
ok(nearRoad > 3, `no motor road in the lot (nearest kerb ${nearRoad.toFixed(1)} m)`);

// walls stop a body, the roofs hold, the yard is open
const R = ringPts(map.buildings.find((b) => b.id === 997356687).p), c = R.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]), gy = hf.heightAt(...c);
ok(cw.inside(c[0], gy + 5, c[1]) && cw.inside(c[0], gy + 40, c[1]), 'the middle section is solid');
const roofY = cw.groundHeight(c[0], c[1], gy + 80);
ok(roofY > gy + 50, `its roof holds (${(roofY - gy).toFixed(1)} m over the ground)`);
const yard = lotPts.find(([x, z]) => Math.hypot(x - 740, z - 2615) < 3);
ok(yard && !cw.inside(yard[0], hf.heightAt(...yard) + 1.2, yard[1]), 'the yard is free');
ok(site.clear(...c) && !site.clear(c[0] + 120, c[1]), 'trees keep off the lot only');
site.update(0.016);

console.log = log;
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
