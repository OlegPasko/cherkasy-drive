// Headless checks for the south quest places of «Таємниці Черкас» on the real map: node tests/questsouth.test.mjs
//   rafinad.js  – the old sugar refinery: builds in budget, the mill block stands four tall storeys under its attic, a ray from the street stops at the west wing
//   brewery.js  – the brewery's street front on Кобзарська: the office, the tower, the shut gate, the sculpture at the quest point
//   kobzarska.js – school №15 (three storeys round its yard, the mural block on columns) and the «вул. Монастирська» sign
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { FRAME_OF } from '../src/world/cherkasy/frame.js';
import { buildRafinad, RAFINAD_SKIP } from '../src/world/cherkasy/rafinad.js';
import { buildBrewery, BREWERY_SKIP } from '../src/world/cherkasy/brewery.js';
import { buildKobzarska, KOBZARSKA_SKIP } from '../src/world/cherkasy/kobzarska.js';
import { SECRETS } from '../src/game/quests/secrets.js';
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
const card = (id) => { const c = SECRETS.cards.find((q) => q.id === id); return geo.toXZ(c.ll[0], c.ll[1]); };
for (const id of [...RAFINAD_SKIP, ...BREWERY_SKIP, ...KOBZARSKA_SKIP]) ok(map.buildings.some((b) => b.id === id), `OSM way ${id} is in map_buildings.json`);

function build(fn, name, maxVerts, maxMeshes) {
  const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
  const root = new THREE.Group();
  const site = fn({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt });
  let verts = 0, meshes = 0, nan = false;
  root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; } });
  ok(site && site.footprints?.length, `${name}: builds`);
  ok(!nan, `${name}: no NaN vertices`);
  ok(verts < maxVerts && meshes <= maxMeshes, `${name}: budget ${verts} verts in ${meshes} meshes`);
  return { site, cw, root };
}

// ---- the refinery
{
  const { site, cw } = build(buildRafinad, 'refinery', 20000, 6);
  const mill = site.parts.find((p) => p.name === 'mill');
  const c = mill.ring.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]);
  const roof = cw.groundHeight(c[0], c[1], 200), g = hf.heightAt(c[0], c[1]);
  ok(mill.eave - mill.base > 21 && roof - g > 21, `the mill's eaves ${(mill.eave - mill.base).toFixed(1)} m over its floor, its roof ${(roof - g).toFixed(1)} m over the ground`);
  // a ray from the street (the outline's north-west wall) at head height stops at the west wing
  const w = site.parts[0].ring, mid = [(w[0][0] + w[1][0]) / 2, (w[0][1] + w[1][1]) / 2], dir = [w[3][0] - w[0][0], w[3][1] - w[0][1]], L = Math.hypot(...dir);
  const o = { x: mid[0] - (dir[0] / L) * 10, y: hf.heightAt(mid[0], mid[1]) + 1.5, z: mid[1] - (dir[1] / L) * 10 };
  const h = cw.raycast(o, { x: dir[0], y: 0, z: dir[1] }, 30);
  ok(h && h.distance > 9 && h.distance < 11, `a ray from the street stops at the west wing (${h?.distance.toFixed(1)} m)`);
  const [qx, qz] = card('rafinad');
  ok(site.parts.some((p) => Math.hypot(p.ring[0][0] - qx, p.ring[0][1] - qz) < 40), 'the quest point is by the plant');
}

// ---- the brewery
{
  const { site, cw } = build(buildBrewery, 'brewery', 12000, 6);
  const [qx, qz] = card('brewery'), [sx, sz] = site.spots.sculpture;
  ok(Math.hypot(qx - sx, qz - sz) < 3, `the sculpture stands at the quest point (${Math.hypot(qx - sx, qz - sz).toFixed(1)} m off)`);
  const g = hf.heightAt(sx, sz), top = cw.groundHeight(sx, sz, g + 10);
  ok(top - g > 3 && top - g < 5, `the sculpture is ${(top - g).toFixed(1)} m tall and solid`);
  // the gate is shut: a ray along the service road into the yard stops at it
  const [gx, gz] = site.spots.gate, gg = hf.heightAt(gx, gz);
  const h = cw.raycast({ x: gx, y: gg + 1, z: gz - 8 }, { x: 0, y: 0, z: 1 }, 20);
  ok(h && Math.abs(h.point.z - gz) < 0.5, `the gate is shut (a ray stops ${h ? (h.point.z - gz).toFixed(2) : '-'} m from it)`);
  // the office reads two storeys, the brewhouse tower five
  const ro = cw.groundHeight(-588, 3866, 100) - hf.heightAt(-588, 3866), rt = cw.groundHeight(-585.5, 3884, 100) - hf.heightAt(-585.5, 3884);
  ok(ro > 7 && ro < 9.5, `the office is ${ro.toFixed(1)} m tall`);
  ok(rt > 18 && rt < 21, `the brewhouse tower is ${rt.toFixed(1)} m tall`);
  ok(!site.clear(-650, 3846) && site.clear(-585.5, 3884), 'trees are cleared off the plant only');
}

// ---- school 15 on the convent's site and the street sign
{
  const { site, cw } = build(buildKobzarska, 'school 15', 12000, 8);
  const [mx, mz] = site.spots.mural, g = hf.heightAt(mx, mz - 2);
  ok(site.spots.eave - site.spots.base > 10.5, `the school stands three storeys (${(site.spots.eave - site.spots.base).toFixed(1)} m)`);
  // under the mural block a ray at head height passes the columns' line and stops at the vestibule 3 m back
  const h0 = cw.raycast({ x: mx + 0.6, y: g + 1.6, z: mz - 6 }, { x: 0, y: 0, z: 1 }, 20);
  ok(h0 && h0.point.z > mz + 2.5 && h0.point.z < mz + 3.3, `the vestibule is set back under the mural block (${h0 ? (h0.point.z - mz).toFixed(2) : '-'} m)`);
  const h1 = cw.raycast({ x: mx + 0.6, y: site.spots.base + 5.5, z: mz - 6 }, { x: 0, y: 0, z: 1 }, 20);
  ok(h1 && Math.abs(h1.point.z - mz) < 0.3, `the mural block's upper storeys stand forward (${h1 ? (h1.point.z - mz).toFixed(2) : '-'} m)`);
  // the side wing beside it is solid from the ground
  const h2 = cw.raycast({ x: 115, y: g + 1.6, z: 3870 }, { x: 0, y: 0, z: 1 }, 30);
  ok(h2 && Math.abs(h2.point.z - 3887.3) < 0.8, `the west wing's street wall is solid (${h2?.point.z.toFixed(1)})`);
  const [qx, qz] = card('kobzarska'), [kx, kz] = site.spots.sign;
  ok(Math.hypot(qx - kx, qz - kz) < 25, `the street sign is by the quest point (${Math.hypot(qx - kx, qz - kz).toFixed(1)} m)`);
  // the sign stands on the verge, clear of the road: Кобзарська's centreline is ~4.5 m south of it
  const road = map.roads.find((q) => q.n === 'Кобзарська вулиця' && q.p.some((v, i) => i % 2 === 0 && Math.abs(v - kx) < 60));
  ok(road, 'Кобзарська runs past the sign');
}

log(fails ?`${fails} failure(s)` : 'questsouth: all ok');
console.log = log;
if (fails) process.exit(1);
