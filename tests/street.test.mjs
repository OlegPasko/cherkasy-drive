// Headless checks for the street furniture (src/world/cherkasy/street.js + public/assets/cherkasy/map_street.json):
// the data is there and sane; the build is quick; every pole stands off the carriageways and the buildings and has a
// collider; a site's own ground drops the props in it when the camera comes near (collider, wires and all); the
// streaming keeps to its triangle budget, refreshes only on a cell change and follows the graphics level.
//   node tests/street.test.mjs
import { readFileSync, statSync } from 'node:fs';
import * as THREE from 'three';
import { buildStreet } from '../src/world/cherkasy/street.js';
import { footprintRaster } from '../src/world/cherkasy/greenery.js';
import { createCollisionWorld } from '../src/world/collision.js';
import { ringPts } from '../src/world/cherkasy/geo.js';

const root = new URL('../', import.meta.url);
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails++; };

const map = JSON.parse(readFileSync(new URL('public/assets/cherkasy/map.json', root)));
const buildings = JSON.parse(readFileSync(new URL('public/assets/cherkasy/map_buildings.json', root)));
const file = new URL('public/assets/cherkasy/map_street.json', root), data = JSON.parse(readFileSync(file));
const kb = statSync(file).size / 1024;
ok(kb < 400, `map_street.json is ${kb.toFixed(0)} KB`);
ok(data.lamps.length / 3 > 9000 && data.chains.length > 500 && data.trolley.length > 100, `data: ${data.lamps.length / 3} lamps, ${data.chains.length} pole chains, ${data.trolley.length} trolley wire runs`);
ok(data.benches.length / 3 > 1000 && data.shelters.length / 5 > 80 && data.cross.length / 3 > 500 && data.containers.length / 3 > 100, `data: ${data.benches.length / 3} benches, ${data.shelters.length / 5} shelters, ${data.cross.length / 3} crossing signs, ${data.containers.length / 3} container sites`);
ok(Object.values(data).every((v) => !Array.isArray(v) || v.flat().every(Number.isInteger)), 'every coordinate is an integer');

// the carriageways, in a grid: kerb(x, z) is the distance beyond the nearest kerb
const C = 40, grid = new Map(), key = (i, j) => i * 65536 + j;
const DRIVE = new Set(['primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link', 'tertiary_link', 'residential', 'unclassified', 'living_street', 'service', 'track']);
for (const r of map.roads) {
  if (!((r.k === 'm' || r.k === 'd') && DRIVE.has(r.c))) continue;
  for (let k = 0; k + 3 < r.p.length; k += 2) for (let i = Math.floor((Math.min(r.p[k], r.p[k + 2]) - 12) / C); i <= Math.floor((Math.max(r.p[k], r.p[k + 2]) + 12) / C); i++)
    for (let j = Math.floor((Math.min(r.p[k + 1], r.p[k + 3]) - 12) / C); j <= Math.floor((Math.max(r.p[k + 1], r.p[k + 3]) + 12) / C); j++) { const kk = key(i, j); (grid.get(kk) ?? grid.set(kk, []).get(kk)).push(r.p[k], r.p[k + 1], r.p[k + 2], r.p[k + 3], r.w / 2); }
}
const kerb = (x, z) => { // distance beyond the nearest kerb (negative: on a carriageway)
  let best = Infinity; const b = grid.get(key(Math.floor(x / C), Math.floor(z / C))) ?? [];
  for (let q = 0; q < b.length; q += 5) { const dx = b[q + 2] - b[q], dz = b[q + 3] - b[q + 1], l2 = dx * dx + dz * dz, t = l2 > 0 ? Math.max(0, Math.min(1, ((x - b[q]) * dx + (z - b[q + 1]) * dz) / l2)) : 0; best = Math.min(best, Math.hypot(b[q] + dx * t - x, b[q + 1] + dz * t - z) - b[q + 4]); }
  return best;
};

const R = map.region, occ = footprintRaster(buildings.map((b) => ({ poly: ringPts(b.p) })), R);
const solids = createCollisionWorld({ terrain: () => 0 });
const scene = new THREE.Group(), detailMat = new THREE.MeshStandardMaterial();
// a stand-in site: its own ground is a 300 m square in the centre
const SITE = { x0: -200, x1: 100, z0: 400, z1: 700 }, inSite = (x, z) => x > SITE.x0 && x < SITE.x1 && z > SITE.z0 && z < SITE.z1;
let asked = 0;
// trunks: one on every 40th lamp's spot, so those poles have to step aside
const spots = [];
{ let px = 0, pz = 0; for (let i = 0; i < data.lamps.length; i += 3) { px += data.lamps[i]; pz += data.lamps[i + 1]; if ((i / 3) % 40 === 0) spots.push({ x: px / 10, z: pz / 10 }); } }
const t0 = performance.now();
const street = buildStreet({ scene, data, map, heightAt: () => 0, ground: { isWater: () => false, onAsphalt: (x, z) => kerb(x, z) < 0 }, solids, occ, spots, clear: [(x, z) => { asked++; return inSite(x, z); }], detailMat });
const tBuild = performance.now() - t0;
ok(!!street && tBuild < 250, `buildStreet: ${tBuild.toFixed(0)} ms`);
ok(asked === 0, 'the sites are not asked at the load');
const st = street.stats();
console.log('stats', JSON.stringify(st.props), 'solids', st.solids);
ok(scene.children.length === 1 && street.root.children.length === 5, 'one group, five meshes');
ok(st.solids === st.props.lamps + st.props.poles + st.props.shelters + st.props.containers && solids.count === st.solids, `colliders: ${st.solids} (poles, shelter walls, container sites)`);
ok(st.props.lamps > 9000 && st.props.poles > 3500 && st.props.main2 > 200, `placed: ${st.props.lamps} lamps (${st.props.main2} double), ${st.props.poles} utility poles`);

// every pole off the carriageways (0.3 m beyond the kerb at least) and off the buildings
const posts = [...street.props('lamp'), ...street.props('pole')];
let onRoad = 0, inBld = 0, outside = 0, worst = Infinity;
for (const p of posts) {
  const d = kerb(p.x, p.z); if (d < worst) worst = d;
  if (d < 0.3) onRoad++;
  if (occ.get(p.x, p.z) === 1) inBld++;
  if (p.x < R.x0 || p.x > R.x1 || p.z < R.z0 || p.z > R.z1) outside++;
}
ok(onRoad === 0, `${posts.length} poles, none on a carriageway (nearest to a kerb: ${worst.toFixed(2)} m beyond it)`);
ok(inBld === 0 && outside === 0, 'none in a building or outside the map');
{ // the poles whose spot a trunk took stand 1.3 or 2.6 m along the street, still on free ground (counted above)
  const g = new Map(), k = (x, z) => Math.floor(x / 4) * 65536 + Math.floor(z / 4);
  for (const p of posts) { const kk = k(p.x, p.z); (g.get(kk) ?? g.set(kk, []).get(kk)).push(p); }
  let still = 0;
  for (const t of spots) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const p of g.get(k(t.x + i * 4, t.z + j * 4)) ?? []) if (Math.hypot(p.x - t.x, p.z - t.z) < 0.8) still++;
  ok(still < spots.length * 0.1, `${spots.length} trunks on lamp spots: ${spots.length - still} poles stepped aside, ${still} had nowhere to go`);
}
{ // a shelter's whole footprint is off the carriageways, and no two container sites overlap
  let bad = 0;
  for (let i = 0; i < data.shelters.length; i += 5) {
    const [x, z, yaw, len, depth] = [data.shelters[i] / 10, data.shelters[i + 1] / 10, data.shelters[i + 2] * Math.PI / 32, data.shelters[i + 3] / 10, data.shelters[i + 4] / 10];
    for (const a of [-1, 0, 1]) for (const b of [-1, 1]) if (kerb(x + Math.cos(yaw) * a * len / 2 + Math.sin(yaw) * b * depth / 2, z - Math.sin(yaw) * a * len / 2 + Math.cos(yaw) * b * depth / 2) < 0.1) { bad++; a: break; }
  }
  ok(bad === 0, `${data.shelters.length / 5} shelters: every corner off the carriageways`);
  const cont = street.props('container'); let close = 0;
  for (let i = 0; i < cont.length; i++) for (let j = i + 1; j < cont.length; j++) if (Math.hypot(cont[i].x - cont[j].x, cont[i].z - cont[j].z) < 7) close++;
  ok(close === 0, `${cont.length} container sites, no two within 7 m`);
  let lone = 0; for (const c of data.chains) if (c.length === 3 && !(c[2] & 1)) lone++;
  ok(lone === 0, 'no lone utility pole without a lamp');
}
for (const kind of ['shelter', 'container', 'bench', 'bin', 'stop', 'cross']) {
  const L = street.props(kind), bad = L.filter((p) => kerb(p.x, p.z) < 0.2 || occ.get(p.x, p.z) === 1).length;
  ok(bad === 0, `${L.length} x ${kind}: off the carriageways and the buildings`);
}
// a pole stops a body
const hit = (p) => solids.pushCylinder({ x: p.x + 0.3, y: p.y + 1, z: p.z }, 0.5, 1.5, 0.3) != null;
ok(posts.filter((_, i) => i % 97 === 0).every(hit), 'poles collide');

// ---- streaming
const cam = (x, z, y = 2) => ({ position: new THREE.Vector3(x, y, z) });
street.setDetail({ near: 120, far: 560, wires: 220, pools: 320, glow: 3500 });
const t1 = performance.now();
street.update(0, cam(160, 560)); // the centre, 60 m off the stand-in site
const tFirst = performance.now() - t1;
let s = street.stats();
ok(asked > 0 && s.checked > 300, `the first refresh asks the sites for ${s.checked} cells in ${tFirst.toFixed(0)} ms`);
ok(s.drawn.near > 500 && s.drawn.far > 5000 && s.drawn.near * 3 + s.drawn.far < 110000, `centre: ${s.drawn.near} near + ${s.drawn.far} far triangles, ${s.drawn.wires} wire pieces, ${s.drawn.pools} pool triangles`);
const before = s.refreshes;
street.update(1 / 60, cam(161, 561)); street.update(1 / 60, cam(162, 562));
ok(street.stats().refreshes === before, 'no refresh inside a cell');
const t2 = performance.now();
street.update(1 / 60, cam(160, 620));
const tMove = performance.now() - t2;
ok(street.stats().refreshes === before + 1 && tMove < 12, `a cell change refreshes once, ${tMove.toFixed(1)} ms`);
// the site's ground: its props are gone, colliders and all; those outside it stay
const here = (p) => Math.hypot(p.x - 160, p.z - 620) < 500;
const gone = street.props().filter((p) => here(p) && inSite(p.x, p.z)), kept = street.props().filter((p) => here(p) && !inSite(p.x, p.z));
ok(gone.length > 20 && gone.every((p) => !p.alive) && kept.every((p) => p.alive), `${gone.length} props on the site's ground dropped, ${kept.length} round it kept`);
ok(gone.filter((p) => p.kind === 'lamp').every((p) => !hit(p)), 'their colliders are off');
ok(street.stats().dropped.site === gone.length, `dropped.site = ${street.stats().dropped.site}`);
// a private street: utility poles and their wires
street.update(1 / 60, cam(-1308, 2117));
s = street.stats();
ok(s.drawn.wires > 300, `private sector: ${s.drawn.wires} wire pieces, ${s.drawn.near} near + ${s.drawn.far} far triangles`);
// the graphics level
street.setDetail({ near: 60, far: 240, wires: 100, pools: 0, glow: 1200 });
street.update(1 / 60, cam(-1308, 2117));
const low = street.stats();
ok(low.drawn.far < s.drawn.far * 0.5 && low.drawn.near < s.drawn.near && low.drawn.pools === 0 && low.drawn.wires < s.drawn.wires, `low level: ${low.drawn.near} near + ${low.drawn.far} far triangles, ${low.drawn.wires} wire pieces, no pools`);
// the worst cell of the whole city at 'high' stays inside the triangle budget (near counts three times: two shadow cascades)
street.setDetail({});
let worstTris = 0, at = null;
for (let x = R.x0 + 200; x < R.x1; x += 240) for (let z = R.z0 + 200; z < R.z1; z += 240) {
  street.update(0, cam(x, z));
  const d = street.stats().drawn, t = d.near * 3 + d.far + d.pools;
  if (t > worstTris) { worstTris = t; at = [x, z, d.near, d.far]; }
}
ok(worstTris < 150000, `worst spot ${at?.slice(0, 2)}: ${at?.[2]} near x 3 + ${at?.[3]} far + pools = ${worstTris} triangles a frame`);
street.checkAll();
ok(street.stats().checked >= street.stats().cells, 'checkAll covers every cell');

console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
