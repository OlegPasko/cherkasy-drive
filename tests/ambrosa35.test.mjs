// Headless checks for the new block at Сергія Амброса, 35 (src/world/cherkasy/ambrosa35.js): node tests/ambrosa35.test.mjs
//   it builds within budget with finite geometry; the OSM block it replaces is its own (no other site skips it) and no
//   other OSM building reaches into the outline; places.js marks it improved; the walls stop the car, the roof holds
//   it, the stair recess stays open; the trees keep off the lot only.
import { readFileSync, readdirSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildAmbrosa35, AMBROSA35_RING, AMBROSA35_SKIP } from '../src/world/cherkasy/ambrosa35.js';
import { PLACES } from '../src/world/cherkasy/places.js';
import { inPoly } from '../src/world/cherkasy/geo.js';
import * as THREE from 'three';

const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
const blds = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const hf = createHeightField(map, dem);

const out = [];
for (let i = 0; i < AMBROSA35_RING.length; i += 2) out.push([AMBROSA35_RING[i], AMBROSA35_RING[i + 1]]);
const dir = new URL('../src/world/cherkasy/', import.meta.url);
const others = readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'ambrosa35.js' && f !== 'places.js').map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
ok([...AMBROSA35_SKIP].every((id) => !others.includes(String(id))), 'the replaced OSM id is in no other module');
ok([...AMBROSA35_SKIP].every((id) => blds.some((b) => b.id === id)), 'the replaced id exists in the map');
const touches = (b) => { const P = []; for (let i = 0; i < b.p.length; i += 2) P.push([b.p[i], b.p[i + 1]]); return P.some(([x, z]) => inPoly(out, x, z)) || out.some(([x, z]) => inPoly(P, x, z)); };
const hit = blds.filter((b) => !AMBROSA35_SKIP.has(b.id) && touches(b)).map((b) => b.id);
ok(hit.length === 0, `no other OSM building inside the outline (${hit.join(', ') || 'none'})`);
// the outline stays on the OSM block's lot (within a metre of its box)
const osm = blds.find((b) => b.id === 1160384062).p, xs = osm.filter((_, i) => !(i & 1)), zs = osm.filter((_, i) => i & 1);
ok(out.every(([x, z]) => x > Math.min(...xs) - 1 && x < Math.max(...xs) + 1 && z > Math.min(...zs) - 1 && z < Math.max(...zs) + 1), 'the outline sits on the OSM footprint');

const place = PLACES.find((q) => q.id === 'ambrosa35');
ok(place && place.kind === 'improved' && !place.icon && !place.url && /Сергія Амброса, 35/.test(place.note), 'places.js: an improved object, no badge, no link');

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildAmbrosa35({ root, solids: cw, zips: null, heightAt: hf.heightAt });
ok(!!site && root.children.length === 1, 'site builds');
let verts = 0, meshes = 0, nan = 0;
root.traverse((o) => { if (o.isMesh) { meshes++; const a = o.geometry.attributes.position.array; verts += a.length / 3; for (const v of a) if (!Number.isFinite(v)) nan++; } });
ok(nan === 0, 'all vertices finite');
ok(verts > 3000 && verts < 25000 && meshes <= 4, `${(verts / 1000).toFixed(1)}k vertices in ${meshes} meshes`);
ok(site.footprints.length === 1 && site.footprints[0].h > 28 && site.footprints[0].h < 34, `one footprint, ${site.footprints[0]?.h.toFixed(1)} m to the crown`);

// the lot frame (see the module): e along the north-west end, n along the Амброса front
const O = [398.4, 2982.1], EU = [17.0 / 17.0106, 0.6 / 17.0106], NU = [-EU[1], EU[0]];
const L = (e, n) => [O[0] + EU[0] * e + NU[0] * n, O[1] + EU[1] * e + NU[1] * n];
const [cx, cz] = L(8, 9), gy = hf.heightAt(cx, cz);
// the car driven at the blank north-west end is pushed back
let pushes = 0, n = -8;
for (let i = 0; i < 40; i++) {
  n += 0.4; const [x, z] = L(8, n), p = { x, y: hf.heightAt(x, z) + 0.2, z };
  if (cw.pushCylinder(p, 1.2, 1.6, 0.3)?.hit) { pushes++; const back = (p.x - O[0]) * NU[0] + (p.z - O[1]) * NU[1]; n = back; }
}
ok(pushes > 5 && n < -1.0, `the car does not get into the building (${pushes} pushes, n ${n.toFixed(1)})`);
const roof = cw.groundHeight(cx, cz, 80);
ok(roof > gy + 27 && roof < gy + 33, `the roof holds (${(roof - gy).toFixed(1)} m over the ground)`);
// a ray from Амброса meets the front; one into the stair recess at the door height reaches deeper than the yard front
ok(cw.raycast({ x: L(-15, 8)[0], y: gy + 8, z: L(-15, 8)[1] }, { x: EU[0], y: 0, z: EU[1] }, 30) != null, 'a ray from Амброса meets the front');
const [rx, rz] = L(25, 10.6), hr = cw.raycast({ x: rx, y: gy + 5, z: rz }, { x: -EU[0], y: 0, z: -EU[1] }, 30);
ok(hr && hr.distance > 8 + 1.2, `the stair recess is open (${hr?.distance.toFixed(1)} m to the core)`);
ok(site.clear(cx, cz) && site.clear(...L(-1, 19)) && !site.clear(...L(-6, 9)) && !site.clear(...L(8, 30)), 'trees keep off the lot only');

console.log = log;
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
