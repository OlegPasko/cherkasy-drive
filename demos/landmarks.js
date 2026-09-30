// Landmarks demo: every hand-made Cherkasy site (src/world/cherkasy/*) on the real ground (cherkasy/ground.js), next to the generic OSM
// buildings (with the facade kit) and the reservoir, under the full render core (createCore). The sites are called the
// way the city build calls them (legacy city.js contract). Free-fly camera, viewpoint list, day / night.
//   window.__demo = { ctx, sites, cw, zips, trees, stats(), view(name), look(x, y, z, tx, ty, tz), views, setNight(on), errors }
// URL: ?nobuildings  ?night  ?view=<name>  ?cam=x,y,z,tx,ty,tz
import * as THREE from 'three';
import { createCore } from '../src/main.js';
import { createFlyCamera } from '../src/core/flycam.js';
import { warmupShaders } from '../src/render/renderer.js';
import { loadCityTextures } from '../src/kit/textures.js';
import { batchTiles } from '../src/kit/batch.js';
import { createFacadeMaterial } from '../src/world/facade.js';
import { createDetailMaterial } from '../src/world/materials.js';
import { buildBuildingsAsync } from '../src/world/buildings.js';
import { buildTrees } from '../src/world/trees.js';
import { buildWater, buildWetBands } from '../src/world/water.js';
import { createCollisionWorld, createCollisionDebug } from '../src/world/collision.js';
import { ringPts } from '../src/world/cherkasy/geo.js';
import { createHeightField, buildGroundAsync } from '../src/world/cherkasy/ground.js';
import { shoreStrip, STRIP } from '../src/world/cherkasy/shore.js';
import { FRAME_OF } from '../src/world/cherkasy/frame.js';
import { ukrainianSigns } from '../src/world/cherkasy/signs.js';
import { dressBuilding } from '../src/world/cherkasy/facadekit.js';
import { buildLandmarks, LANDMARK_SKIP } from '../src/world/cherkasy/landmarks.js';
import { buildRestInn, HERO_SKIP } from '../src/world/cherkasy/restinn.js';
import { buildYalynka, TREE_SKIP } from '../src/world/cherkasy/yalynka.js';
import { buildPagorb } from '../src/world/cherkasy/pagorb.js';
import { prepareRoseValley, buildRoseValley } from '../src/world/cherkasy/rosevalley.js';
import { buildRestaurants, RESTAURANT_SKIP } from '../src/world/cherkasy/restaurants.js';
import { buildBeaches, BEACH_SKIP } from '../src/world/cherkasy/beaches.js';
import { buildYachtClub, YACHT_SKIP } from '../src/world/cherkasy/yachtclub.js';
import { buildEmbankment } from '../src/world/cherkasy/embankment.js';
import { buildPrystan } from '../src/world/cherkasy/prystan.js';
import { buildDam } from '../src/world/cherkasy/dam.js';
import { buildZhuzhoma, ZHU_SKIP } from '../src/world/cherkasy/zhuzhoma.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const say = (s) => { $('loading').textContent = s; };
const errors = [];

const ctx = createCore({ container: $('app'), quality: 'high', preset: Q.has('night') ? 'night' : 'day' });
const { scene, camera, input, daylight, renderer } = ctx;

// ------------------------------------------------------------------------------------------------ data + terrain
say('завантаження карти…');
const [T, map, dem] = await Promise.all([
  loadCityTextures(renderer),
  fetch('/assets/cherkasy/map.json').then((r) => r.json()).then(async (m) => { m.buildings = await fetch('/assets/cherkasy/' + m.buildingsFile).then((r) => r.json()); return m; }),
  fetch('/assets/cherkasy/dem.bin').then((r) => r.arrayBuffer()).then((b) => new Int16Array(b)),
]);
const geo = FRAME_OF(map);
// the real ground (port of ground.js): the DEM field, hero sites levelled, Rose Valley beach sand in the cover first
try { prepareRoseValley(map, geo); } catch (e) { errors.push(['Rose Valley prep', e]); console.error(e); }
const hf = createHeightField(map, dem);
for (const b of map.buildings) if (HERO_SKIP.has(b.id)) hf.pad(ringPts(b.p), 30);
const st = shoreStrip(map), root = Object.assign(new THREE.Group(), { name: 'city' });
scene.add(root);
say('рельєф і вулиці…');
const ground = await buildGroundAsync({ scene: root, T, map, hf, strip: { A: st.A, B: st.B, y0: STRIP.y0, y1: STRIP.y1 }, renderer, mapUrl: '/assets/cherkasy/map.json' });
const heightAt = ground.heightAt;
ctx.groundAt = heightAt;
const water = buildWater({ scene: root, T, renderer, shoreDist: ground.shoreDist, skirtWater: (dx) => dx > 0.15 });
const wetBands = buildWetBands({ scene: root, T, segs: ground.wetSegs, isWater: ground.isWater });
ctx.addSystem((dt) => { water.update(dt, camera); wetBands.update?.(dt); ground.update?.(dt, camera); }, 'water');

// ------------------------------------------------------------------------------------------------ world sinks
const cw = createCollisionWorld({ terrain: { height: ground.terrainHeight, minY: ground.band.minY, maxY: ground.band.maxY } });
// zip-point recorder: counts anchors by kind (the game's store lives in city.js); edges are sampled every `step` m
const zips = { count: 0, kinds: {} };
zips.add = (...a) => { zips.count++; zips.kinds[a[6]] = (zips.kinds[a[6]] || 0) + 1; };
zips.edge = (ax, az, bx, bz, y, nx, nz, kind = 'roofEdge', step = 7) => {
  const steps = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step));
  for (let k = steps; k >= 0; k--) { const f = k / steps; zips.add(ax * (1 - f) + bx * f, y, az * (1 - f) + bz * f, nx, 0, nz, kind); }
};
T.signs = ukrainianSigns();
const facadeMat = createFacadeMaterial(T), detailMat = createDetailMaterial(T);

// ------------------------------------------------------------------------------------------------ the sites (legacy city.js order)
say('пам\'ятки…');
const sites = {};
const site = (name, fn, args) => {
  const g = new THREE.Group(); g.name = 'site-' + name; root.add(g);
  const t0 = performance.now(), s0 = cw.count;
  try { sites[name] = { group: g, api: fn({ ...args, root: g }) || {} }; } catch (e) { errors.push([name, e]); console.error(`[demo] ${name} failed`, e); sites[name] = { group: g, api: {} }; }
  Object.assign(sites[name], { ms: +(performance.now() - t0).toFixed(1), solids: cw.count - s0 });
};
const base = { map, solids: cw, zips, heightAt, ground, geo };
site('landmarks', buildLandmarks, { ...base, T, facadeMat, detailMat });
site('yalynka', buildYalynka, base);
site('restinn', buildRestInn, base);
for (const [name, fn] of [['pagorb', buildPagorb], ['rosevalley', buildRoseValley], ['restaurants', buildRestaurants], ['beaches', buildBeaches],
  ['yachtclub', buildYachtClub], ['embankment', buildEmbankment], ['prystan', buildPrystan], ['dam', buildDam], ['zhuzhoma', buildZhuzhoma]]) site(name, fn, base);
const spots = Object.values(sites).flatMap((s) => s.api.spots ?? []);
const trees = buildTrees({ scene: root, spots, heightAt, maxScale: 3 });
trees.addSolids?.((r) => cw.cyl(r.x, r.z, r.y0, r.y1, r.r, r.r, r.kind || "tree"));
ctx.addSystem((dt) => { trees.update(dt, camera.position); for (const s of Object.values(sites)) s.api.update?.(dt, camera); }, 'sites');

// generic OSM buildings around them, dressed by the facade kit (skipping the ones the sites replace)
let bStats = null;
const bRoot = new THREE.Group(); bRoot.name = 'buildings'; root.add(bRoot);
if (!Q.has('nobuildings')) {
  say('будинки…');
  const skip = new Set([...LANDMARK_SKIP, ...HERO_SKIP, ...TREE_SKIP, ...RESTAURANT_SKIP, ...BEACH_SKIP, ...YACHT_SKIP, ...ZHU_SKIP]);
  const B = await buildBuildingsAsync({ map, solids: cw, zips, heightAt, skip, dress: dressBuilding, onProgress: (f) => say(`будинки… ${(f * 100) | 0}%`) });
  const fac = [], det = [], ctr = [];
  B.tiles.forEach(({ fac: f, det: d, cx, cz }) => { fac.push(f.build()); det.push(d.v > 0 ? d.build({ part: true }) : null); ctr.push([cx, cz]); });
  for (const b of [batchTiles(fac, facadeMat, 'facade', {}, ctr), batchTiles(det, detailMat, 'roofs', {}, ctr)]) for (const m of b.meshes) bRoot.add(m);
  bStats = B.stats;
}

// ------------------------------------------------------------------------------------------------ viewpoints
// subject: a site group or the landmark meshes named 'landmark-<prefix>'; the camera frames its bounds from `dir`
// (azimuth in degrees, 0 = +x) at `k` times the subject size, unless a pose [x, y, z, tx, ty, tz] (or a function) is given
const VIEWS = [
  ['Соборна площа, ялинка', 'yalynka', { dir: 200, k: 1.6, up: 0.35 }],
  ['Пагорб Слави', 'pagorb', { pose: () => { const [px, pz] = sites.pagorb.api.plaza, [mx, mz] = sites.pagorb.api.center, d = Math.hypot(px - mx, pz - mz);
    return [px + (px - mx) / d * 25, heightAt(px, pz) + 12, pz + (pz - mz) / d * 25, mx, heightAt(mx, mz) + 9, mz]; } }],
  ['Долина троянд', 'rosevalley', { pose: [740, 25, -60, 740, 3, -180] }],
  ['Rest Inn', 'restinn', { pose: [-760, 38, 1290, -778, 34, 1340] }],
  ['Набережна', 'embankment', { pose: [1540, 5, 2330, 1600, 2, 2400] }],
  ['Дамба і міст', 'dam', { pose: [1300, 30, -3500, 1700, 10, -3640] }],
  ['Яхт-клуб', 'yachtclub', { pose: [840, 12, -1560, 880, 0, -1640] }],
  ['Пляжі', 'beaches', { pose: [975, 15, 750, 1005, 1, 780] }],
  ['Вул. Жужоми', 'zhuzhoma', { pose: [800, 40, 440, 850, 20, 470] }],
  ['Стара пристань', 'prystan', { dir: 230, k: 1.5 }],
  ['Ресторани (Чайка, Fabrica)', 'restaurants', { dir: 220, k: 0.6 }],
  ['Собор', 'landmark-cathedral', { dir: 200, k: 1.3 }],
  ['Телевежа', 'landmark-tv-tower', { dir: 200, k: 0.7, up: 0.35 }],
  ['Димар Митниці', 'landmark-chimneys', { pose: [1080, 60, 2800, 951, 70, 2928] }],
  ['Шуховська вежа', 'landmark-shukhov', { dir: 200, k: 2 }],
  ['Портові крани', 'landmark-port-cranes', { dir: 230, k: 0.8 }],
  ['Драмтеатр', 'landmark-drama-theatre', { dir: 30, k: 1.3 }],
  ['Стадіон', 'landmark-stadium', { dir: 220, k: 0.9 }],
  ['Річковий вокзал', 'landmark-river-station', { dir: 230, k: 1.6 }],
];
const box = new THREE.Box3(), tmp = new THREE.Box3();
function subjectBox(key) {
  box.makeEmpty();
  if (key.startsWith('landmark-')) sites.landmarks?.group.traverse((o) => { if (o.isMesh && o.name.startsWith(key)) box.union(tmp.setFromObject(o)); });
  else if (sites[key]) box.setFromObject(sites[key].group);
  return box;
}
const fly = createFlyCamera(camera, input, { speed: 40, groundAt: heightAt });
ctx.addSystem(fly.update, 'flycam');
function poseLookAt(eye, at) { // fly camera: yaw 0 looks along -z, pitch up positive
  const dx = at.x - eye.x, dy = at.y - eye.y, dz = at.z - eye.z;
  fly.setPose(eye, Math.atan2(-dx, -dz), Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)));
}
const look = (...q) => poseLookAt(new THREE.Vector3().fromArray(q), new THREE.Vector3().fromArray(q, 3));
function view(name) {
  const v = VIEWS.find((q) => q[0] === name || q[1] === name); if (!v) return false;
  const [, key, o] = v;
  if (o.pose) { look(...(o.pose.call ? o.pose() : o.pose)); return true; }
  const b = subjectBox(key); if (b.isEmpty()) return false;
  const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
  const size = Math.max(s.x, s.z, s.y * 0.8), dist = Math.max(35, size * o.k), a = o.dir * Math.PI / 180;
  const p = new THREE.Vector3(c.x + Math.cos(a) * dist, 0, c.z + Math.sin(a) * dist);
  p.y = Math.max(heightAt(p.x, p.z) + 3, c.y + dist * (o.up ?? 0.3));
  poseLookAt(p, c);
  return true;
}
for (const [i, [name]] of VIEWS.entries()) {
  const b = document.createElement('button'); b.textContent = (i < 10 ? `${(i + 1) % 10} · ` : '') + name; b.onclick = () => view(name);
  $('views').appendChild(b);
}
addEventListener('keydown', (e) => {
  if (e.code.startsWith('Digit')) { const i = (+e.code.slice(5) + 9) % 10; if (VIEWS[i]) view(VIEWS[i][0]); }
  if (e.code === 'KeyN') setNight(daylight.state.preset !== 'night');
});

// ------------------------------------------------------------------------------------------------ UI
function setNight(on) { daylight.setPreset(on ? 'night' : 'day', 2); $('night').textContent = on ? 'День' : 'Ніч'; }
$('night').onclick = () => setNight(daylight.state.preset !== 'night');
if (Q.has('night')) $('night').textContent = 'День';
const dbg = createCollisionDebug(scene, cw, { radius: 180 });
ctx.addSystem(() => dbg.update(camera), 'collisionDebug');
$('coll').onclick = () => { dbg.enabled = !dbg.enabled; $('coll').classList.toggle('on', dbg.enabled); };
$('bld').onclick = () => { bRoot.visible = !bRoot.visible; $('bld').classList.toggle('on', bRoot.visible); };

let fps = 60, lastStats = 0;
function stats() {
  const info = renderer.info.render;
  return {
    fps: +fps.toFixed(1), calls: info.calls, triangles: info.triangles, solids: cw.count, zipPoints: zips.count, trees: spots.length,
    night: +daylight.state.night.toFixed(2), buildings: bStats?.buildings ?? 0, errors: errors.map(([n, e]) => `${n}: ${e.message}`),
    sites: Object.fromEntries(Object.entries(sites).map(([k, s]) => [k, { ms: s.ms, solids: s.solids, meshes: s.group.children.length }])),
    camera: camera.position.toArray().map((v) => +v.toFixed(1)),
  };
}
ctx.addSystem((dt) => {
  if (dt > 0) fps += (1 / dt - fps) * 0.05;
  if (ctx.time - lastStats < 0.3) return;
  lastStats = ctx.time;
  const s = stats();
  $('stats').textContent = `${s.fps} fps · ${s.calls} calls · ${(s.triangles / 1e6).toFixed(2)}M tris\n${s.solids} solids · ${s.zipPoints} zips · ${s.trees} trees\n`
    + `cam ${s.camera.join(', ')}` + (s.errors.length ? `\nERR ${s.errors.join('\n')}` : '');
}, 'demoUi');

window.__demo = { ctx, sites, cw, zips, stats, view, look, views: VIEWS.map((v) => v[0]), setNight, errors, trees };
const cam = Q.get('cam')?.split(',').map(Number);
if (cam?.length === 6) look(...cam);
else if (!view(Q.get('view') || VIEWS[0][0])) fly.setPose(new THREE.Vector3(0, heightAt(0, 0) + 60, 150), 0, -0.3);
say('шейдери…');
ctx.sky.update(0, camera);
await warmupShaders(renderer, scene, camera);
ctx.start();
$('loading').classList.add('done');
