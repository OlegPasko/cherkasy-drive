// Headless checks for the bakery-café and the car wash at вул. Чорновола 164 (src/world/cherkasy/chdbkbakery.js):
// node tests/chdbkbakery.test.mjs
// On the real map: the lot hook levels the lot but leaves Чорновола's grade alone, the site builds in budget, the
// places carry no business name, the bakery's walls and roof slab, the canopy is an awning the car drives under, the
// bays are open to the front and closed by glass at the back and between them, the container is solid.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildChdbkBakery, levelChdbkBakery, CHDBKBAKERY_SKIP } from '../src/world/cherkasy/chdbkbakery.js';
import { PLACES, CHDBK_BAKERY_RING, CHDBK_WASH_RING } from '../src/world/cherkasy/places.js';
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
ok(CHDBKBAKERY_SKIP.size === 0, 'no OSM building is replaced');

// places: two improved objects on their own rings, no business name anywhere
for (const [id, ring] of [['chdbkbakery', CHDBK_BAKERY_RING], ['chdbkwash', CHDBK_WASH_RING]]) {
  const p = PLACES.find((q) => q.id === id);
  ok(p && p.kind === 'improved' && p.issue === 49 && p.ring === ring, `places.js has ${id} as an improved object on its ring`);
  ok(p && !/bakery|icw|бейкер/i.test(`${p.name} ${p.note}`), `${id}'s name and note carry no business name (${p?.note})`);
}
const src = readFileSync(new URL('../src/world/cherkasy/chdbkbakery.js', import.meta.url), 'utf8');
ok(!/bakery[^-_ a-z]|icw|бейкер|fillText/i.test(src.replace(/chdbkbakery|ChdbkBakery|CHDBKBAKERY|ChDBK bakery|the bakery|bakery-café|bakery's|The bakery/g, '')), 'the module writes no business name and draws no text');

// the terrain: the lot level, the street (Чорновола's carriageway) untouched
const street = [[-3300, 2420], [-3280, 2420], [-3290, 2414]].map(([x, z]) => hf.heightAt(x, z));
const level = levelChdbkBakery(hf);
ok(Number.isFinite(level), `the lot is levelled to ${level?.toFixed(2)}`);
const lot = [[-3300, 2372], [-3280, 2372], [-3278, 2392], [-3298, 2385]].map(([x, z]) => hf.heightAt(x, z));
ok(Math.max(...lot) - Math.min(...lot) < 0.3, `the lot is flat within ${(Math.max(...lot) - Math.min(...lot)).toFixed(2)} m`);
const after = [[-3300, 2420], [-3280, 2420], [-3290, 2414]].map(([x, z]) => hf.heightAt(x, z));
ok(after.every((h, i) => Math.abs(h - street[i]) < 0.01), 'Чорновола keeps its grade');

const H = hf.heightAt, cw = createCollisionWorld({ terrain: (x, z) => H(x, z) });
const root = new THREE.Group();
const site = buildChdbkBakery({ root, map, solids: cw, zips: { edge() {} }, heightAt: H });
ok(site && site.footprints?.length === 2 && site.info && site.parked?.length >= 4, 'the site builds, with car parks');
let verts = 0, meshes = 0, nan = false;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; } });
ok(!nan, 'no NaN vertices');
ok(verts < 30000 && meshes <= 15, `budget: ${verts} verts in ${meshes} meshes`);
const { info } = site;
const y1 = (x, z) => H(x, z) + 1.2;

// the bakery: one storey under its slab; the glass front stops a ray from the terrace, the side from the drive
const gB = H(-3278, 2393);
ok(info.roof - gB > 4.6 && info.roof - gB < 5.8, `the bakery's roof is ${(info.roof - gB).toFixed(1)} m up`);
const rF = cw.raycast({ x: -3276, y: y1(-3276, 2399.5), z: 2399.5 }, { x: 0, y: 0, z: -1 }, 6);
ok(rF && Math.abs(rF.point.z - 2397.0) < 0.4, `a ray from the terrace stops at the front (${rF?.point.z.toFixed(2)})`);
const rW = cw.raycast({ x: -3288, y: y1(-3288, 2393), z: 2393 }, { x: 1, y: 0, z: 0 }, 6);
ok(rW && Math.abs(rW.point.x + 3284.5) < 0.3, `a ray from the drive stops at the west wall (${rW?.point.x.toFixed(2)})`);
const ov = cw.raycast({ x: -3278, y: info.floor + 8, z: 2399 }, { x: 0, y: -1, z: 0 }, 10);
ok(ov && ov.kind === 'awning', `the slab over the terrace is an awning (${ov?.kind})`);

// the wash: the canopy an awning, open bays at the front, glass at the back and between the bays
const [b0, b1] = info.bays[1], xc = (b0 + b1) / 2, gW = H(xc, 2372);
const can = cw.raycast({ x: xc, y: info.eave + 3, z: 2372 }, { x: 0, y: -1, z: 0 }, 6);
ok(can && can.kind === 'awning', `the canopy is an awning (${can?.kind})`);
ok(info.eave - gW > 3.6 && info.eave - gW < 4.4, `the eaves are ${(info.eave - gW).toFixed(1)} m up`);
ok(cw.ceilingAt(xc, 2372, gW + 0.5) - gW > 3.3, 'a car fits under the canopy');
const rIn = cw.raycast({ x: xc + 0.6, y: y1(xc, 2380), z: 2380 }, { x: 0, y: 0, z: -1 }, 12);
ok(rIn && Math.abs(rIn.point.z - 2368.55) < 0.3, `a car drives into the bay up to the back glass (${rIn?.point.z.toFixed(2)})`);
const rP = cw.raycast({ x: xc, y: y1(xc, 2371), z: 2371 }, { x: 1, y: 0, z: 0 }, 6);
ok(rP && Math.abs(rP.point.x - (b1 - 0.05)) < 0.2, `the partition closes the bay's side (${rP?.point.x.toFixed(2)})`);
const [c0, cz0, c1] = info.container;
const rC = cw.raycast({ x: (c0 + c1) / 2, y: y1((c0 + c1) / 2, 2380), z: 2380 }, { x: 0, y: 0, z: -1 }, 10);
ok(rC && rC.point.z > cz0 && rC.point.z < 2375, `the container is solid (${rC?.point.z.toFixed(2)})`);

// trees stay off the lot and the bed
ok(site.clear(-3290, 2380) && site.clear(-3276, 2404) && !site.clear(-3260, 2380), 'the lot and the bed are kept clear of trees');

console.log = log;
log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
