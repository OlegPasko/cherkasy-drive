// Headless checks for the new block at бульвар Шевченка, 184–186 (src/world/cherkasy/shev184.js): node tests/shev184.test.mjs
//   the skipped OSM houses are the ones on the lot and no other site skips them; the site builds in budget with finite
//   geometry, nine storeys high; the walls stop the car from the boulevard and the yard; the drive-through lets it in
//   and its ceiling holds; the roof holds; places.js marks it as an improved object with the module's outline; no kept
//   OSM building or road sits inside it.
import { readFileSync, readdirSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildShev184, shev184Local, SHEV184_SKIP } from '../src/world/cherkasy/shev184.js';
import { PLACES, SHEV184_RING } from '../src/world/cherkasy/places.js';
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
const { L, D, toMap, toLocal, outline } = shev184Local;
const ring = outline();

// the skipped houses stand on the lot, and no other module claims them
const lot = (x, z) => { const [s, t] = toLocal(x, z); return s > -3 && s < L + 6 && t > -1 && t < D + 12; };
for (const id of SHEV184_SKIP) {
  const b = map.buildings.find((q) => q.id === id);
  ok(b && lot(b.p[0], b.p[1]), `OSM ${id} is on the lot`);
}
const dir = new URL('../src/world/cherkasy/', import.meta.url);
const claimed = readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'shev184.js')
  .filter((f) => [...SHEV184_SKIP].some((id) => readFileSync(new URL(f, dir), 'utf8').includes(String(id))));
ok(claimed.length === 0, `no other module skips these houses (${claimed.join(', ') || 'none'})`);

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildShev184({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt });
ok(!!site && root.children.length === 1 && site.footprints.length === 1, 'site builds');
let verts = 0, meshes = 0, nan = 0;
root.traverse((o) => { if (o.isMesh) { meshes++; const a = o.geometry.attributes.position.array; verts += a.length / 3; for (const v of a) if (!Number.isFinite(v)) nan++; } });
ok(nan === 0, 'all vertices finite');
ok(verts > 4000 && verts < 30000 && meshes <= 6, `${(verts / 1000).toFixed(1)}k vertices in ${meshes} meshes`);
const fp = site.footprints[0];
ok(fp.h > 29 && fp.h < 33, `nine storeys and the crown: ${fp.h.toFixed(1)} m`);

const g = hf.heightAt(...toMap(L / 2, 0));
const ray = (s, t0, t1, y) => {
  const [ox, oz] = toMap(s, t0), [tx, tz] = toMap(s, t1);
  return cw.raycast({ x: ox, y, z: oz }, { x: tx - ox, y: 0, z: tz - oz }, 40);
};
const hf_ = ray(L * 0.35, -12, -11, g + 8), hb = ray(L * 0.35, D + 12, D + 11, g + 8);
ok(hf_ && Math.abs(toLocal(hf_.point.x, hf_.point.z)[1]) < 0.8, `a ray from the boulevard stops at the front (t = ${hf_ && toLocal(hf_.point.x, hf_.point.z)[1].toFixed(2)})`);
ok(hb && Math.abs(toLocal(hb.point.x, hb.point.z)[1] - D) < 0.8, `a ray from the yard stops at the back (t = ${hb && toLocal(hb.point.x, hb.point.z)[1].toFixed(2)})`);
const hn = (() => { const [ox, oz] = toMap(-12, D / 2), [tx, tz] = toMap(-11, D / 2); return cw.raycast({ x: ox, y: g + 8, z: oz }, { x: tx - ox, y: 0, z: tz - oz }, 40); })();
ok(hn && Math.abs(toLocal(hn.point.x, hn.point.z)[0]) < 0.8, `a ray from the north-west stops at the side (s = ${hn && toLocal(hn.point.x, hn.point.z)[0].toFixed(2)})`);
// the drive-through: a car-height ray goes from the boulevard into the yard, a higher one hits the storeys over it
const hp = ray(25.4, -6, -5, g + 1.2);
ok(!hp || toLocal(hp.point.x, hp.point.z)[1] > D + 1, 'the drive-through is open at car height');
const hpu = ray(25.4, -6, -5, g + 10);
ok(hpu && Math.abs(toLocal(hpu.point.x, hpu.point.z)[1]) < 0.8, 'the storeys over the drive-through are solid');
const ceil = cw.ceilingAt(...toMap(25.4, D / 2), g + 1);
ok(ceil > g + 7 && ceil < g + 8.5, `the drive-through is two storeys high (${(ceil - g).toFixed(1)} m)`);
// the car pushed at the front from the boulevard never gets in
const [ox, oz] = toMap(L * 0.35, -6), [tx, tz] = toMap(L * 0.35, -5), p = { x: ox, y: 0, z: oz };
let pushes = 0;
for (let i = 0; i < 40; i++) {
  p.x += (tx - ox) * 0.4; p.z += (tz - oz) * 0.4; p.y = hf.heightAt(p.x, p.z) + 0.2;
  if (cw.pushCylinder(p, 1.2, 1.6, 0.3)?.hit) pushes++;
}
ok(pushes > 5 && !inPoly(fp.poly, p.x, p.z), `the car does not get into the building (${pushes} pushes)`);
const roofY = cw.groundHeight(...toMap(L * 0.75, D / 2), g + 60);
ok(roofY > g + 28 && roofY < g + 31, `the roof holds (${(roofY - g).toFixed(1)} m up)`);

const place = PLACES.find((q) => q.id === 'shev184');
ok(place && place.kind === 'improved' && !place.icon && !place.url && /Шевченка, 184–186/.test(place.note), 'places.js: an improved object named in the note, no badge, no link');
ok(SHEV184_RING.length === ring.length * 2 && ring.every(([x, z], i) => Math.abs(x - SHEV184_RING[2 * i]) < 0.1 && Math.abs(z - SHEV184_RING[2 * i + 1]) < 0.1), 'places.js SHEV184_RING matches the outline');
const others = map.buildings.filter((b) => !SHEV184_SKIP.has(b.id) && (() => { for (let i = 0; i < b.p.length; i += 2) if (inPoly(ring, b.p[i], b.p[i + 1])) return true; return false; })());
ok(others.length === 0, `no kept OSM building inside (${others.map((b) => b.id).join(', ') || 'none'})`);
const roads = map.roads.filter((rd) => { for (let i = 0; i < rd.p.length; i += 2) if (inPoly(ring, rd.p[i], rd.p[i + 1])) return true; return false; });
ok(roads.length === 0, 'no road runs through it');
ok(site.clear(...toMap(L / 2, D / 2)) && site.clear(...toMap(L / 2, D + 5)) && !site.clear(...toMap(L / 2, -20)), 'trees keep off the lot only');

console.log = log;
console.log(fails ? `${fails} FAILED` : 'shev184: all ok');
process.exit(fails ? 1 : 0);
