// Headless checks for ЖК «Комфорт Парк» (src/world/cherkasy/comfortpark.js): node tests/comfortpark.test.mjs
//   the OSM way is there and the site frame covers its outline; the lot is levelled; the site builds in budget with
//   finite geometry, a ground storey and four storeys high; the walls stop the car from the street and from the yard;
//   the roof and the podium terrace hold; places.js marks it as an improved object; no other OSM building sits inside it.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildComfortPark, levelComfortPark, comfortParkLocal, COMFORTPARK_SKIP } from '../src/world/cherkasy/comfortpark.js';
import { PLACES } from '../src/world/cherkasy/places.js';
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
const [id] = COMFORTPARK_SKIP, { L, D, toMap, toLocal } = comfortParkLocal;
const osm = map.buildings.find((b) => b.id === id);
ok(!!osm, `OSM way ${id} is in map_buildings.json`);
const loc = [];
for (let i = 0; i < (osm?.p.length ?? 0); i += 2) loc.push(toLocal(osm.p[i], osm.p[i + 1]));
ok(loc.length && loc.every(([s, t]) => s > -0.5 && s < L + 3 && t > -3 && t < D + 0.6), 'the frame covers the OSM outline');

const level = levelComfortPark(hf);
const hs = [[0, 0], [L, 0], [L, D], [0, D], [L / 2, -5]].map(([s, t]) => hf.heightAt(...toMap(s, t)));
ok(Math.max(...hs) - Math.min(...hs) < 0.2, `the lot is level (${hs.map((h) => h.toFixed(2)).join(' ')}, level ${level?.toFixed?.(2)})`);

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildComfortPark({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt });
ok(!!site && root.children.length === 1 && site.footprints.length === 1, 'site builds');
let verts = 0, meshes = 0, nan = 0;
root.traverse((o) => { if (o.isMesh) { meshes++; const a = o.geometry.attributes.position.array; verts += a.length / 3; for (const v of a) if (!Number.isFinite(v)) nan++; } });
ok(nan === 0, 'all vertices finite');
ok(verts > 4000 && verts < 30000 && meshes <= 6, `${(verts / 1000).toFixed(1)}k vertices in ${meshes} meshes`);
const fp = site.footprints[0];
ok(fp.h > 17 && fp.h < 21, `ground storey, four storeys and the parapet: ${fp.h.toFixed(1)} m`);

const g = hf.heightAt(...toMap(L / 2, D / 2));
const ray = (s, t0, t1, y) => {
  const [ox, oz] = toMap(s, t0), [tx, tz] = toMap(s, t1);
  const hit = cw.raycast({ x: ox, y: g + y, z: oz }, { x: tx - ox, y: 0, z: tz - oz }, 30);
  return hit && toLocal(hit.point.x, hit.point.z)[1];
};
const t1 = ray(L * 0.3, -15, -14, 6), t2 = ray(L * 0.3, D + 15, D + 14, 6), t3 = ray(L * 0.8, -15, -14, 2);
ok(t1 != null && Math.abs(t1) < 0.8, `a ray from the street stops at the front (t = ${t1?.toFixed(2)})`);
ok(t2 != null && Math.abs(t2 - D) < 0.8, `a ray from the yard stops at the back (t = ${t2?.toFixed(2)})`);
ok(t3 != null && Math.abs(t3 + 2.8) < 0.8, `the podium stops a car at its front (t = ${t3?.toFixed(2)})`);
const [ax, az] = toMap(L * 0.3, -12), [bx, bz] = toMap(L * 0.3, -11), p = { x: ax, y: 0, z: az };
let pushes = 0;
for (let i = 0; i < 60; i++) {
  p.x += (bx - ax) * 0.4; p.z += (bz - az) * 0.4; p.y = hf.heightAt(p.x, p.z) + 0.2;
  if (cw.pushCylinder(p, 1.2, 1.6, 0.3)?.hit) pushes++;
}
ok(pushes > 10 && !inPoly(fp.poly, p.x, p.z), `the car does not get into the building (${pushes} pushes)`);
const roofY = cw.groundHeight(...toMap(L * 0.15, D / 2), g + 40);
ok(roofY > g + 17 && roofY < g + 20, `the roof holds (${(roofY - g).toFixed(1)} m up)`);
const terr = cw.groundHeight(...toMap(L * 0.8, -1.4), g + 10);
ok(terr > g + 4 && terr < g + 5.2, `the podium terrace holds (${(terr - g).toFixed(1)} m up)`);

const place = PLACES.find((q) => q.id === 'comfortpark');
ok(place && place.kind === 'improved' && !place.icon && !place.url && place.bld?.includes(id) && /Комфорт Парк/.test(place.note), 'places.js: an improved object named in the note, no badge, no link');
const others = map.buildings.filter((b) => b.id !== id && (() => { for (let i = 0; i < b.p.length; i += 2) if (inPoly(fp.poly, b.p[i], b.p[i + 1])) return true; return false; })());
ok(others.length === 0, `no other OSM building inside (${others.map((b) => b.id).join(', ') || 'none'})`);
ok(site.clear(...toMap(L / 2, D / 2)) && site.clear(...toMap(L / 2, -6)) && !site.clear(...toMap(L / 2, -40)), 'trees keep off the lot only');

console.log = log;
console.log(fails ? `${fails} FAILED` : 'comfortpark: all ok');
process.exit(fails ? 1 : 0);
