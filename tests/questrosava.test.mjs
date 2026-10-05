// Headless checks for four places of the quest «Таємниці Черкас»: node tests/questrosava.test.mjs
//   rosava.js – the former hotel «Росава» (the appeal court) with the varenyk monument in front of it;
//   pronya.js – Проня Прокопівна і Голохвастов on вул. Небесної Сотні;
//   maiboroda.js – Будинок Майбороди, бульвар Шевченка 287;
//   simonenko.js – бульвар Шевченка 345 with Василь Симоненко's memorial plaque.
// On the real map: the OSM outlines are there, each site builds in budget with no NaN, the heights are right (a nine
// storey tower over a two-storey podium, one tall storey over a plinth, five brick storeys), the walls stop rays from
// the street, the monuments stand on the ground with colliders, the plaque is on the wall by the quest card's point,
// and every place is in places.js as an improved object whose ring or footprint holds the model.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { FRAME_OF } from '../src/world/cherkasy/frame.js';
import { PLACES } from '../src/world/cherkasy/places.js';
import { inPoly } from '../src/world/cherkasy/geo.js';
import { buildRosava, ROSAVA_SKIP, ROSAVA_MONUMENT } from '../src/world/cherkasy/rosava.js';
import { buildPronya, PRONYA_SPOT } from '../src/world/cherkasy/pronya.js';
import { buildMaiboroda, MAIBORODA_SKIP } from '../src/world/cherkasy/maiboroda.js';
import { buildSimonenko, SIMONENKO_SKIP } from '../src/world/cherkasy/simonenko.js';
import * as THREE from 'three';

const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
map.buildings = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const hf = createHeightField(map, dem), geo = FRAME_OF(map);
for (const id of [...ROSAVA_SKIP, ...MAIBORODA_SKIP, ...SIMONENKO_SKIP]) ok(map.buildings.some((b) => b.id === id), `OSM way ${id} is in map_buildings.json`);

const build = (fn, name, maxVerts, maxMeshes) => {
  const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) }), root = new THREE.Group();
  const site = fn({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt });
  let verts = 0, meshes = 0, nan = false;
  root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; } });
  ok(!!site, `${name}: the site builds`);
  ok(!nan, `${name}: no NaN vertices`);
  ok(verts < maxVerts && meshes <= maxMeshes, `${name}: budget ${verts} verts in ${meshes} meshes`);
  return { site, cw };
};
const place = (id) => PLACES.find((p) => p.id === id);
const ringOf = (flat) => { const P = []; for (let i = 0; i < flat.length; i += 2) P.push([flat[i], flat[i + 1]]); return P; };
const card = (lat, lon) => geo.toXZ(lat, lon);

// ---- Rosava and the varenyk monument
{
  const { site, cw } = build(buildRosava, 'Rosava', 12000, 9), L = site.levels;
  ok(Math.abs(L.podium - L.floor - 8) < 0.1, `the podium is two storeys, ${(L.podium - L.floor).toFixed(1)} m`);
  ok(L.tower - L.floor > 27 && L.tower - L.floor < 31, `the tower stands ${(L.tower - L.floor).toFixed(1)} m (nine storeys)`);
  ok(L.stair > L.tower + 3, 'the stair block rises over the tower roof');
  const [mx, mz] = site.monument;
  ok(Math.hypot(mx - ROSAVA_MONUMENT[0], mz - ROSAVA_MONUMENT[1]) < 0.6, `ROSAVA_MONUMENT matches the built monument (${mx.toFixed(1)}, ${mz.toFixed(1)})`);
  const [vx, vz] = card(49.44406, 32.06944);
  ok(Math.hypot(mx - vx, mz - vz) < 25, `the monument is near the quest card's point (${Math.hypot(mx - vx, mz - vz).toFixed(1)} m)`);
  ok(Math.abs(L.ground - hf.heightAt(mx, mz)) < 0.05 && L.plinthTop - L.ground > 0.6 && L.plinthTop - L.ground < 1.2, 'the plinth stands on the ground, under a metre and a bit tall');
  // a ray along the front normal toward the monument's centre at the figure's height hits its collider
  const b = map.buildings.find((o) => o.id === [...ROSAVA_SKIP][0]);
  const n = [-0.865, -0.5], hit = cw.raycast({ x: mx + n[0] * 8, y: L.plinthTop + 0.7, z: mz + n[1] * 8 }, { x: -n[0], y: 0, z: -n[1] }, 20);
  ok(hit && Math.hypot(hit.point.x - mx, hit.point.z - mz) < 1.0, 'the monument has a collider');
  // behind the monument the podium's front wall stops a ray at the ground storey, and above the podium the tower does
  const wall = cw.raycast({ x: mx + n[0] * 8 + 0.0, y: L.floor + 6, z: mz + n[1] * 8 }, { x: -n[0], y: 0, z: -n[1] }, 40);
  ok(wall && wall.distance > 10 && wall.distance < 20, `the podium wall stops a ray from the forecourt (${wall?.distance.toFixed(1)} m)`);
  const top = cw.groundHeight(452, 575, L.tower + 20);
  ok(Math.abs(top - (L.tower - 0.6)) < 0.3 || top > L.tower, `the tower's roof deck is up there (${top.toFixed(1)})`);
  ok(site.clear(mx, mz) && !site.clear(mx - 30, mz - 30), 'trees keep off the monument only near it');
  const pr = place('rosava'), pv = place('varenyk');
  ok(pr?.kind === 'improved' && pr.bld?.includes(b.id) && /Росава/.test(pr.note) && /суд/.test(pr.note), 'places.js: Rosava is an improved object, its note names the hotel and the court');
  ok(pv?.kind === 'improved' && inPoly(ringOf(pv.ring), mx, mz), 'places.js: the varenyk ring holds the monument');
}

// ---- Pronya and Holokhvastov
{
  const { site, cw } = build(buildPronya, 'Pronya', 9000, 3);
  ok(site.figures.length === 2, 'two figures');
  for (const f of site.figures) {
    ok(Math.abs(f.y - hf.heightAt(f.x, f.z)) < 0.05 && f.top - f.y > 1.6 && f.top - f.y < 2.2, `a figure stands on the ground, ${(f.top - f.y).toFixed(2)} m tall`);
    const h = cw.raycast({ x: f.x, y: f.y + 1.0, z: f.z + 6 }, { x: 0, y: 0, z: -1 }, 10);
    ok(h && Math.abs(h.point.z - f.z) < 0.6, 'a figure has a collider');
  }
  const [px, pz] = card(49.437742, 32.064939);
  ok(Math.hypot(PRONYA_SPOT[0] - px, PRONYA_SPOT[1] - pz) < 6, 'the figures stand by the quest card\'s point');
  const p = place('pronya');
  ok(p?.kind === 'improved' && site.figures.every((f) => inPoly(ringOf(p.ring), f.x, f.z)), 'places.js: the Pronya ring holds both figures');
}

// ---- Maiboroda house
{
  const { site, cw } = build(buildMaiboroda, 'Maiboroda', 15000, 7), L = site.levels;
  ok(L.floor - L.ground > 0.9 && L.floor - L.ground < 1.5, 'the floor sits on a high plinth');
  ok(L.cornice - L.floor > 5 && L.cornice - L.floor < 6, 'one tall storey to the cornice');
  const b = map.buildings.find((o) => o.id === [...MAIBORODA_SKIP][0]);
  const xs = b.p.filter((_, i) => i % 2 === 0), zs = b.p.filter((_, i) => i % 2 === 1);
  const x0 = Math.min(...xs), zc = (Math.min(...zs) + Math.max(...zs)) / 2;
  // from the boulevard (map -x), at window height between the windows, a ray stops at the front wall
  const h = cw.raycast({ x: x0 - 15, y: L.floor + 2, z: zc + 5.6 }, { x: 1, y: 0, z: 0 }, 30);
  ok(h && Math.abs(h.point.x - x0) < 0.6, `the front wall stops a ray from the boulevard (${h?.point.x.toFixed(1)} vs ${x0.toFixed(1)})`);
  const roof = cw.groundHeight((x0 + Math.max(...xs)) / 2, zc, L.top + 10);
  ok(roof > L.cornice && roof < L.top + 1, `the roof is over the cornice (${(roof - L.ground).toFixed(1)} m up)`);
  const [mx, mz] = card(49.434885, 32.076559);
  ok(site.clear(mx, mz) && !site.clear(mx + 40, mz), 'the clearing covers the house');
  ok(place('maiboroda')?.kind === 'improved' && place('maiboroda').bld.includes(b.id), 'places.js: the Maiboroda house is an improved object');
}

// ---- Shevchenka 345 and the plaque
{
  const { site, cw } = build(buildSimonenko, 'Simonenko', 15000, 6), L = site.levels;
  const b = map.buildings.find((o) => o.id === [...SIMONENKO_SKIP][0]), xs = b.p.filter((_, i) => i % 2 === 0);
  const g = Math.min(...b.p.filter((_, i) => i % 2 === 0).map((x, i) => hf.heightAt(x, b.p[2 * i + 1])));
  ok(L.eaves - L.floor > 14 && L.eaves - L.floor < 16, `five storeys to the eaves (${(L.eaves - L.floor).toFixed(1)} m)`);
  const [sx, sz] = card(49.427973, 32.089488), [px, py, pz] = site.plaque;
  ok(Math.hypot(px - sx, pz - sz) < 12, `the plaque is by the quest card's point (${Math.hypot(px - sx, pz - sz).toFixed(1)} m)`);
  ok(Math.abs(px - Math.min(...xs)) < 0.6 && py - hf.heightAt(px, pz) > 1.5 && py - hf.heightAt(px, pz) < 4, 'the plaque hangs on the west wall at eye height');
  const h = cw.raycast({ x: Math.min(...xs) - 10, y: g + 3, z: 2850 }, { x: 1, y: 0, z: 0 }, 20);
  ok(h && Math.abs(h.point.x - Math.min(...xs)) < 0.5, 'the west wall stops a ray');
  ok(place('simonenko')?.kind === 'improved' && place('simonenko').bld.includes(b.id) && /Симоненк/.test(place('simonenko').note), 'places.js: the house is an improved object naming the poet');
}

console.log = log;
if (fails) { console.log(`${fails} failure(s)`); process.exit(1); }
console.log('questrosava: all ok');
