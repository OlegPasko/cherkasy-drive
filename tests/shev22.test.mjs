// Headless checks for the new block at бульвар Шевченка, 22 (src/world/cherkasy/shev22.js): node tests/shev22.test.mjs
//   it builds within budget with finite geometry; no OSM building it keeps stands inside its walls, and the cottages it
//   replaces are in no other site's skip set; the ring in places.js matches the module; the walls stop the car from
//   both streets and the roof holds it; the lot keeps the generated trees off.
import { readFileSync, readdirSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildShev22, SHEV22_BOX, SHEV22_SKIP } from '../src/world/cherkasy/shev22.js';
import { PLACES } from '../src/world/cherkasy/places.js';
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
const [X0, X1, Z0, Z1] = SHEV22_BOX, cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;

// the OSM buildings left standing keep out of the walls (with a metre for the pylons and the fascia)
const inBox = (x, z, m = 0) => x > X0 - m && x < X1 + m && z > Z0 - m && z < Z1 + m;
const hit = blds.filter((b) => !SHEV22_SKIP.has(b.id)).filter((b) => { for (let i = 0; i < b.p.length; i += 2) if (inBox(b.p[i], b.p[i + 1], 1)) return true; return false; }).map((b) => b.id);
ok(hit.length === 0, `no kept OSM building on the walls (${hit.join(', ') || 'none'})`);
ok([...SHEV22_SKIP].every((id) => blds.some((b) => b.id === id)), 'every skipped id is an OSM building');
// no other site module claims these ids
const dir = new URL('../src/world/cherkasy/', import.meta.url);
const others = readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'shev22.js').filter((f) => { const s = readFileSync(new URL(f, dir), 'utf8'); return [...SHEV22_SKIP].some((id) => s.includes(String(id))); });
ok(others.length === 0, `the replaced ids belong to no other site (${others.join(', ') || 'none'})`);

const place = PLACES.find((q) => q.id === 'shev22');
ok(place && place.kind === 'improved' && !place.icon && !place.url, 'places.js: an improved object, no badge, no link');
const ring = place?.ring || [], xs = ring.filter((_, i) => i % 2 === 0), zs = ring.filter((_, i) => i % 2 === 1);
ok(ring.length === 8 && Math.min(...xs) === X0 && Math.max(...xs) === X1 && Math.min(...zs) === Z0 && Math.max(...zs) === Z1, 'places.js ring matches the module');

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildShev22({ root, map, solids: cw, zips: null, heightAt: hf.heightAt });
ok(!!site && root.children.length === 1, 'site builds');
let verts = 0, meshes = 0, nan = 0;
root.traverse((o) => { if (o.isMesh) { meshes++; const a = o.geometry.attributes.position.array; verts += a.length / 3; for (const v of a) if (!Number.isFinite(v)) nan++; } });
ok(nan === 0, 'all vertices finite');
ok(verts > 4000 && verts < 25000 && meshes <= 7, `${(verts / 1000).toFixed(1)}k vertices in ${meshes} meshes`);
const gy = hf.heightAt(cx, cz);
ok(site.footprints.length === 1 && site.footprints[0].h > 26 && site.footprints[0].h < 30, `one footprint, ${site.footprints[0]?.h.toFixed(1)} m tall`);

// the car: driven at the boulevard front and at the Бандери front it is pushed back off the wall; dropped on the roof it stands
for (const [name, p0, d] of [['boulevard', [X1 + 8, cz], [-1, 0]], ['Бандери', [cx, Z0 - 8], [0, 1]]]) {
  const p = { x: p0[0], y: 0, z: p0[1] };
  let hits = 0;
  for (let i = 0; i < 60; i++) {
    p.x += d[0] * 0.4; p.z += d[1] * 0.4; p.y = hf.heightAt(p.x, p.z) + 0.2;
    if (cw.pushCylinder(p, 1.2, 1.6, 0.3)?.hit) hits++;
  }
  ok(hits > 10 && !inBox(p.x, p.z), `the car does not get in from ${name} (${hits} pushes)`);
}
const roofY = cw.groundHeight(cx, cz, 80);
ok(roofY > gy + 24, `the roof holds (${roofY.toFixed(1)} m vs ground ${gy.toFixed(1)})`);
ok(cw.raycast({ x: X1 + 40, y: gy + 12, z: cz }, { x: -1, y: 0, z: 0 }, 60) != null, 'a ray from the boulevard meets the front');
ok(site.clear(cx, cz) && site.clear(X0 - 6, cz) && !site.clear(cx - 60, cz), 'trees keep off the lot only');

console.log = log;
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
