// Headless checks for the Palace of Culture «Дружба народів» and its fountain (src/world/cherkasy/druzhba.js,
// druzhbafountain.js): node tests/druzhba.test.mjs
//   the site builds with finite geometry in budget; the fountain sits on the OSM outline (way 402904429), the raised
//   shield pool inside the bowl; the square's paving leaves the bowl out and paves round it; the bowl wall stops a car
//   coming over the paving, a car in the water can hop out, the shield's wall holds; the generated trees keep off the
//   bowl and the apron; the update runs.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildDruzhba } from '../src/world/cherkasy/druzhba.js';
import { FOUNTAIN_RING } from '../src/world/cherkasy/druzhbafountain.js';
import { inPoly } from '../src/world/cherkasy/geo.js';

const ctx2d = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} })
  : k === 'measureText' ? () => ({ width: 100 }) : () => {}), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
map.buildings = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const hf = createHeightField(map, dem);
const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildDruzhba({ root, map, solids: cw, zips: { edge() {}, add() {} }, heightAt: hf.heightAt });
ok(!!site && !!site.fountain, 'the palace and the fountain build');
const F = site.fountain, L = F.levels;

// geometry: finite, in budget
const fg = root.getObjectByName('druzhba-fountain');
let verts = 0, nan = 0;
fg?.traverse((o) => { if (!o.isMesh) return; const a = o.geometry.attributes.position.array; verts += a.length / 3; for (const v of a) if (!Number.isFinite(v)) nan++; });
ok(fg && fg.children.length === 5, `the fountain draws in ${fg?.children.length} meshes`);
ok(nan === 0 && verts > 1500 && verts < 12000, `fountain: ${(verts / 1000).toFixed(1)}k finite vertices, ${F.stats.jets} jets`);
ok(F.stats.jets >= 40, 'rows of jets, the column and its crown');

// the OSM outline: map.json's simplified ring lies on the module's full one
const poi = map.pois.find((p) => p.id === 'w402904429');
ok(poi?.tags?.amenity === 'fountain', 'map.json has the fountain (OSM way 402904429)');
const segD = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t); };
let off = 0;
for (let i = 0; i < (poi?.p.length ?? 0); i += 2) off = Math.max(off, Math.min(...FOUNTAIN_RING.map((a, k) => segD([poi.p[i], poi.p[i + 1]], a, FOUNTAIN_RING[(k + 1) % FOUNTAIN_RING.length]))));
ok(poi && off < 0.3, `the bowl follows the OSM outline (${off.toFixed(2)} m at worst)`);
ok(F.tier.every(([x, z]) => inPoly(F.ring, x, z) && !F.tier.some(() => false)), 'the shield pool lies inside the bowl');
const ys = F.ring.map(([x, z]) => hf.heightAt(x, z));
ok(L.rim > Math.max(...ys) + 0.24 + 0.5 && L.tier > L.rim + 0.3 && L.water < L.rim && L.tierWater < L.tier, `levels: rim ${(L.rim - Math.max(...ys)).toFixed(2)} m over the highest ground, the shield ${(L.tier - L.rim).toFixed(2)} m over the rim (terrain span ${(Math.max(...ys) - Math.min(...ys)).toFixed(2)} m)`);

// the square's paving: none inside the bowl, some round its north
const sq = root.getObjectByName('druzhba-square');
const P = sq.geometry.attributes.position.array, I = sq.geometry.index.array;
let inside = 0, north = 0;
for (let t = 0; t < I.length; t += 3) {
  const cx = (P[I[t] * 3] + P[I[t + 1] * 3] + P[I[t + 2] * 3]) / 3, cz = (P[I[t] * 3 + 2] + P[I[t + 1] * 3 + 2] + P[I[t + 2] * 3 + 2]) / 3;
  if (inPoly(F.ring, cx, cz) && !F.ring.some(([x, z]) => Math.hypot(x - cx, z - cz) < 2.5)) inside++;
  if (cz < 1083 && cx > -20 && cx < 6) north++;
}
ok(inside === 0, `no paving inside the bowl (${inside} triangles)`);
ok(north > 20, `the paving reaches round the fountain's north (${north} triangles)`);

// collision: the wall stops a car over the paving, a car in the water hops out, the shield holds
const cen = [-6, 1096], gC = hf.heightAt(...cen);
const from = [-28, 1084], h = hf.heightAt(...from) + 0.5;
const hit = cw.raycast({ x: from[0], y: h, z: from[1] }, { x: cen[0] - from[0], y: 0, z: cen[1] - from[1] }, 40);
ok(hit && inPoly(F.apron, hit.point.x, hit.point.z) && !inPoly(F.ring.map(([x, z]) => [x + (cen[0] - x) * 0.04, z + (cen[1] - z) * 0.04]), hit.point.x, hit.point.z), 'a car rolling in from the square hits the bowl wall');
const [wx, wz] = [-14, 1094], gW = hf.heightAt(wx, wz);
const rimTop = cw.groundHeight(-19.1, 1092, L.rim + 1), floor = cw.groundHeight(wx, wz, L.water + 0.5);
ok(Math.abs(rimTop - L.rim) < 0.05 && L.rim - gW > 0.55, `the rim stands ${(L.rim - gW).toFixed(2)} m over the ground: too high to drive over (step 0.5)`);
ok(floor < L.water - 0.2 && L.rim - floor < 0.5, `the pool floor ${(L.water - floor).toFixed(2)} m under the water: a car in it can hop out (${(L.rim - floor).toFixed(2)} m)`);
const wallPt = F.tier.map(([x, z]) => { const dx = -4.9 - x, dz = 1092.8 - z, d = Math.hypot(dx, dz); return [x + dx / d * 0.15, z + dz / d * 0.15]; });
const onWall = wallPt.filter(([x, z]) => Math.abs(cw.groundHeight(x, z, L.tier + 1) - L.tier) < 0.02).length;
const cTop = cw.groundHeight(-4.9, 1092.8, L.tierWater + 0.5);
ok(onWall === wallPt.length && cTop < L.tierWater - 0.2 && cTop > L.water, `the shield's wall holds all round (${onWall}/${wallPt.length}), its floor under its water`);

// trees, update
ok(site.clear(-6, 1096) && site.clear(-20.5, 1090) && site.clear(0, 1080), 'generated trees keep off the bowl, the apron and the paving round it');
site.update(1 / 60); site.update(1 / 60);
ok(true, 'the update runs');

console.log = log;
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
