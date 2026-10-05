// Headless checks for the quest street corners (src/world/cherkasy/queststreets.js): node tests/queststreets.test.mjs
// On the real map: every street card of «Таємниці Черкас» gets its corner, close to the card's light, off the
// carriageway and out of every building, facing the road; the stand stops a ray from the road; Гоголя's arrow points
// toward Chyhyryn; the Rozkopna houses replace their OSM outlines, stand one storey with a roof, and block a ray from
// the street; the site stays in budget.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { FRAME_OF } from '../src/world/cherkasy/frame.js';
import { curbSpot } from '../src/game/quests.js';
import { SECRETS } from '../src/game/quests/secrets.js';
import { buildQuestStreets, QUESTSTREETS_SKIP, ROZKOPNA_HOUSES } from '../src/world/cherkasy/queststreets.js';

const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {}, width: 100 }), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
map.buildings = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const hf = createHeightField(map, dem);
const geo = FRAME_OF(map);
for (const id of QUESTSTREETS_SKIP) ok(map.buildings.some((b) => b.id === id), `OSM way ${id} is in map_buildings.json`);

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildQuestStreets({ root, map, geo, solids: cw, heightAt: hf.heightAt });
ok(!!site, 'the site builds');

let verts = 0, meshes = 0, nan = false;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; } });
ok(!nan, 'no NaN vertices');
ok(verts < 20000 && meshes <= 16, `budget: ${verts} verts in ${meshes} meshes`);

const segD = (x, z, P) => { let b = 1e9; for (let i = 0; i + 3 < P.length; i += 2) { const ax = P[i], az = P[i + 1], dx = P[i + 2] - ax, dz = P[i + 3] - az, L = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)); b = Math.min(b, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return b; };
const inRing = (p, x, z) => { let s = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > z) !== (p[j + 1] > z) && x < p[i] + (z - p[i + 1]) * (p[j] - p[i]) / (p[j + 1] - p[i + 1])) s = !s; return s; };
const kept = map.buildings.filter((b) => !QUESTSTREETS_SKIP.has(b.id));

for (const id of ['kavkazka', 'gogol', 'gurzhiivska', 'rozkopna', 'cherkasy2']) {
  const c = SECRETS.cards.find((k) => k.id === id), k = site.corners[id];
  ok(!!k, `${id}: has a corner`);
  if (!k) continue;
  const [x, z] = geo.toXZ(...c.ll), s = curbSpot(map, x, z) || { x, z };
  const d = Math.hypot(k.x - s.x, k.z - s.z);
  ok(d < 30, `${id}: ${d.toFixed(1)} m from the quest light`);
  const road = Math.min(...map.roads.filter((r) => r.k === 'm').map((r) => segD(k.x, k.z, r.p) - (r.w || 7) / 2));
  ok(road > 0.8, `${id}: off the carriageway (${road.toFixed(1)} m from its edge)`);
  ok(!kept.some((b) => inRing(b.p, k.x, k.z)), `${id}: not inside a building`);
  // a ray from the road, at the board's height, toward the stand stops at it
  const g = hf.heightAt(k.x, k.z), o = { x: k.x + k.fx * 5, y: k.y + 1.5, z: k.z + k.fz * 5 };
  const bx = k.x + Math.cos(k.yaw) * (id === 'cherkasy2' ? 0.6 : 0.8), bz = k.z - Math.sin(k.yaw) * (id === 'cherkasy2' ? 0.6 : 0.8);
  const dir = new THREE.Vector3(bx - o.x, 0, bz - o.z).normalize();
  const hit = cw.raycast(o, dir, 8);
  ok(hit && hit.distance < 5.6, `${id}: a ray from the road stops at the stand (${hit?.distance.toFixed(2)})`);
  ok(Math.abs(k.y - g) < 1.2, `${id}: stands on the ground (${(k.y - g).toFixed(2)})`);
  ok(site.clear(k.x, k.z), `${id}: keeps generated trees off it`);
}
// Гоголя's arrow: Chyhyryn is south-east of the city, so the arrow points along the street that way
{
  const k = site.corners.gogol, [tx, tz] = geo.toXZ(49.0806, 32.6587);
  const right = [Math.cos(k.yaw), -Math.sin(k.yaw)];
  ok(((tx - k.x) * right[0] + (tz - k.z) * right[1] > 0) === k.arrowRight, 'gogol: the arrow points toward Chyhyryn');
}

// the Rozkopna houses
ok(site.footprints.length >= 7, `${site.footprints.length} of ${ROZKOPNA_HOUSES.length} Rozkopna houses rebuilt`);
for (const f of site.footprints) {
  const [cx, cz] = f.poly.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]), g = Math.max(...f.poly.map(([px, pz]) => hf.heightAt(px, pz)));
  const top = cw.groundHeight(cx, cz, g + 30);
  ok(top - g > 3 && top - g < 4.5, `${f.id}: one storey (the wall top ${(top - g).toFixed(1)} m over its highest corner)`);
  ok(f.h > 4 && f.h < 11, `${f.id}: with its roof ${f.h.toFixed(1)} m`);
  const road = Math.min(...map.roads.filter((r) => r.k === 'm').map((r) => Math.min(...f.poly.map(([px, pz]) => segD(px, pz, r.p) - (r.w || 7) / 2))));
  ok(road > 0.2, `${f.id}: clear of the carriageways (${road.toFixed(1)} m)`);
}
{ // a ray from Розкопна into the house beside the card stops at its wall
  const f = site.footprints.find((p) => p.id === 400651147);
  if (f) {
    const [cx, cz] = f.poly.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]), g = hf.heightAt(cx, cz);
    const o = { x: cx - 14, y: g + 1.8, z: cz }, hit = cw.raycast(o, { x: 1, y: 0, z: 0 }, 20);
    ok(hit && hit.point.x < cx - 3, `400651147: a ray from the street stops at the wall (${hit?.point.x.toFixed(1)} vs centre ${cx.toFixed(1)})`);
  }
}

console.log = log;
log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
