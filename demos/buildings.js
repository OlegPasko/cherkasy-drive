// Buildings demo: every Cherkasy OSM building (src/world/buildings.js) on a coarse DEM terrain, facade + detail
// materials, tiles batched by kit/batch.js with distance shadow / detail LOD; free-fly camera, day / night toggle.
// window.__demo = { renderer, scene, camera, B, facB, detB, stats(), setNight(v), goto(x, y, z, tx, tz) }
// URL: ?group=2 merges 2x2 tiles per mesh, ?noshadow, ?cam=x,y,z,tx,tz
import * as THREE from 'three';
import { loadCityTextures } from '../src/kit/textures.js';
import { createFacadeMaterial } from '../src/world/facade.js';
import { buildBuildingsAsync, createDetailMaterial } from '../src/world/buildings.js';
import { setNightFactor, setSkyColors } from '../src/world/materials.js';
import { batchTiles } from '../src/kit/batch.js';
import { ukrainianSigns } from '../src/world/cherkasy/signs.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const statsEl = $('stats');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = !Q.has('noshadow');
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;
document.body.prepend(renderer.domElement);

const scene = Object.assign(new THREE.Scene(), { name: 'buildings-demo' });
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 9000);
const hemi = new THREE.HemisphereLight(0xbcd4f0, 0x5a5448, 1.1);
const sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -450, right: 450, top: 450, bottom: -450, near: 10, far: 2500 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(hemi, sun, sun.target);
scene.fog = new THREE.Fog(0xb8c8d8, 1500, 8500);

// ---------------------------------------------------------------------------------------------- day / night
const DAY = { sky: new THREE.Color(0x9fbfe0), fog: new THREE.Color(0xb8c8d8), hemi: 1.1, sun: 3.0, top: new THREE.Color(0.3, 0.5, 0.85), hor: new THREE.Color(0.75, 0.82, 0.9) };
const NIGHT = { sky: new THREE.Color(0x0b1020), fog: new THREE.Color(0x0e1422), hemi: 0.12, sun: 0.08, top: new THREE.Color(0.01, 0.015, 0.04), hor: new THREE.Color(0.05, 0.05, 0.08) };
let night = Q.has('night') ? 1 : 0, nightTarget = night;
function applyNight(k) {
  night = k;
  scene.background = DAY.sky.clone().lerp(NIGHT.sky, k);
  scene.fog.color.copy(DAY.fog).lerp(NIGHT.fog, k);
  hemi.intensity = THREE.MathUtils.lerp(DAY.hemi, NIGHT.hemi, k);
  sun.intensity = THREE.MathUtils.lerp(DAY.sun, NIGHT.sun, k);
  sun.color.setHex(k > 0.5 ? 0x9fb4ff : 0xfff1dc);
  setSkyColors(DAY.top.clone().lerp(NIGHT.top, k), DAY.hor.clone().lerp(NIGHT.hor, k));
  setNightFactor(k);
  $('night').textContent = nightTarget > 0.5 ? 'День' : 'Ніч';
}
applyNight(night);

// ---------------------------------------------------------------------------------------------- data
statsEl.textContent = 'завантаження карти…';
const [map, demBuf] = await Promise.all([
  fetch('/assets/cherkasy/map.json').then((r) => r.json()).then(async (m) => { if (m.buildingsFile) m.buildings = await fetch('/assets/cherkasy/' + m.buildingsFile).then((r) => r.json()); return m; }),
  fetch('/assets/cherkasy/dem.bin').then((r) => r.arrayBuffer()),
]);
const D = map.dem, H16 = new Int16Array(demBuf);
function heightAt(x, z) { // bilinear DEM sample
  const fx = Math.min(D.nx - 1.001, Math.max(0, (x - D.x0) / D.cell)), fz = Math.min(D.nz - 1.001, Math.max(0, (z - D.z0) / D.cell));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * D.nx + i;
  const a = H16[k], b = H16[k + 1], c = H16[k + D.nx], d = H16[k + D.nx + 1];
  return ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v) * D.scale;
}

// coarse terrain for context (16 m grid over the playable region)
{
  const R = map.region, st = 16, x0 = R.x0 - 600, z0 = R.z0 - 600, nx = Math.ceil((R.x1 - R.x0 + 1200) / st) + 1, nz = Math.ceil((R.z1 - R.z0 + 1200) / st) + 1;
  const g = new THREE.PlaneGeometry(1, 1, nx - 1, nz - 1), P = g.attributes.position;
  for (let k = 0; k < nx * nz; k++) { const x = x0 + (k % nx) * st, z = z0 + Math.floor(k / nx) * st; P.setXYZ(k, x, heightAt(x, z) - 0.05, z); }
  g.computeVertexNormals(); // rows run +z, so the plane's +z-facing winding now faces up
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x6f7a5a, roughness: 1 }));
  ground.receiveShadow = true; ground.name = 'terrain';
  scene.add(ground);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2c4a5c, roughness: 0.15 }));
  water.position.y = -1.6; scene.add(water);
}

// ---------------------------------------------------------------------------------------------- buildings
const T = await loadCityTextures(renderer);
try { T.signs = ukrainianSigns(); } catch (e) { console.warn('signs atlas unavailable', e); }
const facadeMat = createFacadeMaterial(T), detailMat = createDetailMaterial(T);
const tb = performance.now();
const B = await buildBuildingsAsync({ map, heightAt, solids: () => {}, onProgress: (f) => { statsEl.textContent = `будівлі… ${(f * 100).toFixed(0)}%`; } });
const buildMs = performance.now() - tb;
// tile builders -> geometries (the builders are dropped right away so their CPU arrays can be collected)
const tileList = [...B.tiles.values()];
const facG = tileList.map((t) => t.fac.build()), detG = tileList.map((t) => (t.det.v ? t.det.build({ part: true }) : null));
const ctr = tileList.map((t) => [t.cx, t.cz]), info = tileList.map((t, i) => ({ i, cx: t.cx, cz: t.cz, fac: !!facG[i], det: !!detG[i] }));
for (const t of tileList) t.fac = t.det = null;
const batchOpts = { group: +(Q.get('group') ?? 1) };
const facB = batchTiles(facG, facadeMat, 'facade', batchOpts, ctr), detB = batchTiles(detG, detailMat, 'roofs', batchOpts, ctr);
const city = new THREE.Group(); city.name = 'city';
for (const b of [facB, detB]) for (const m of b.meshes) city.add(m);
scene.add(city);
const totalMs = performance.now() - tb;

// ---------------------------------------------------------------------------------------------- camera
const SPOTS = [
  [886, 60, 506, 831, 530], // Zhuzhomy street
  [-150, 90, 150, 60, -40], // Soborna square
  [600, 250, -900, 0, 0], // over the river bank
  [-1800, 400, 2400, -800, 800], // high over the micro-districts
  [260, 14, -260, 300, -300], // street level
];
let spot = 0;
const look = { yaw: 0, pitch: -0.25 };
function goto(x, y, z, tx, tz) {
  camera.position.set(x, y, z);
  look.yaw = Math.atan2(-(tx - x), -(tz - z)); look.pitch = Math.atan2(heightAt(tx, tz) + 20 - y, Math.hypot(tx - x, tz - z));
}
const cq = Q.get('cam')?.split(',').map(Number);
if (cq?.length === 5) goto(...cq); else goto(...SPOTS[0]);

const held = new Set();
addEventListener('keydown', (e) => { held.add(e.code); if (e.code === 'KeyN') toggleNight(); });
addEventListener('keyup', (e) => held.delete(e.code));
const pointer = { down: false };
const cv = renderer.domElement;
cv.addEventListener('pointerdown', (e) => { pointer.down = true; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointerup', () => { pointer.down = false; });
cv.addEventListener('pointermove', (e) => {
  if (!pointer.down) return;
  look.yaw -= e.movementX * 0.003;
  look.pitch = THREE.MathUtils.clamp(look.pitch - e.movementY * 0.003, -1.5, 1.5);
});
function onResize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', onResize);
function toggleNight() { nightTarget = nightTarget > 0.5 ? 0 : 1; $('night').textContent = nightTarget > 0.5 ? 'День' : 'Ніч'; }
$('night').onclick = toggleNight;
$('shadows').onclick = () => { sun.castShadow = !sun.castShadow; $('shadows').textContent = 'Тіні: ' + (sun.castShadow ? 'так' : 'ні'); };
$('spots').onclick = () => { spot = (spot + 1) % SPOTS.length; goto(...SPOTS[spot]); };

// ---------------------------------------------------------------------------------------------- loop
const clock = new THREE.Clock();
const fwd = new THREE.Vector3(), right = new THREE.Vector3();
let fps = 60, lastLod = new THREE.Vector3(Infinity, 0, 0), frame = 0;
function stats() {
  const f = facB.stats(), d = detB.stats();
  return {
    fps: Math.round(fps), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    buildings: B.stats.buildings, tiles: B.tiles.size, facadeMeshes: f.meshes, facadeVisible: f.visible, detailMeshes: d.meshes, detailVisible: d.visible,
    facadeTris: f.triangles, detailTris: d.triangles, buildMs: Math.round(buildMs), totalMs: Math.round(totalMs), solids: B.stats.solids,
    night, cam: camera.position.toArray().map(Math.round),
  };
}
function updateLod() { // detail tiles drawn up to 2.6 km, detail shadows < 350 m, facade shadows < 900 m
  const cx = camera.position.x, cz = camera.position.z, half = 128;
  for (const t of info) {
    const gap = Math.hypot(Math.max(0, Math.abs(cx - t.cx) - half), Math.max(0, Math.abs(cz - t.cz) - half));
    if (t.det) { detB.setVisible(t.i, gap < 2600); detB.setShadow(t.i, gap < 350); }
    if (t.fac) facB.setShadow(t.i, gap < 900);
  }
}
// key -> [move axis, sign]: f forward, r right, u up
const MOVES = { KeyW: ['f', 1], ArrowUp: ['f', 1], KeyS: ['f', -1], ArrowDown: ['f', -1], KeyD: ['r', 1], ArrowRight: ['r', 1],
  KeyA: ['r', -1], ArrowLeft: ['r', -1], KeyE: ['u', 1], Space: ['u', 1], KeyQ: ['u', -1], KeyC: ['u', -1] };
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.1, clock.getDelta());
  fps = THREE.MathUtils.lerp(fps, 1 / Math.max(dt, 1e-3), 0.05);
  const step = (held.has('ShiftLeft') || held.has('ShiftRight') ? 220 : 45) * dt;
  camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
  camera.getWorldDirection(fwd); right.crossVectors(fwd, camera.up).normalize();
  for (const code of held) {
    const mv = MOVES[code]; if (!mv) continue;
    if (mv[0] === 'u') camera.position.y += mv[1] * step;
    else camera.position.addScaledVector(mv[0] === 'f' ? fwd : right, mv[1] * step);
  }
  camera.position.y = Math.max(camera.position.y, heightAt(camera.position.x, camera.position.z) + 1.5);
  if (Math.abs(night - nightTarget) > 1e-3) applyNight(night + Math.sign(nightTarget - night) * Math.min(Math.abs(nightTarget - night), dt * 0.8));
  if (camera.position.distanceToSquared(lastLod) > 400) { lastLod.copy(camera.position); updateLod(); }
  // sun follows the camera so the 900 m shadow box stays around the view
  const c = camera.position;
  sun.position.set(c.x - 500, c.y + 900, c.z + 300); sun.target.position.set(c.x, c.y - 50, c.z);
  renderer.info.reset();
  renderer.render(scene, camera);
  if (frame++ % 15 === 0) {
    const s = stats();
    statsEl.textContent = `fps          ${s.fps}\ndraw calls   ${s.calls}\ntriangles    ${(s.triangles / 1e6).toFixed(2)} M\nбудівель     ${s.buildings}\nтайли        ${s.facadeVisible}/${s.facadeMeshes} фасад, ${s.detailVisible}/${s.detailMeshes} дахи\nтрикутники   ${((s.facadeTris + s.detailTris) / 1e6).toFixed(2)} M усього\nколізії      ${s.solids}\nпобудова     ${s.buildMs} мс (+ меші ${s.totalMs - s.buildMs} мс)\nкамера       ${s.cam.join(', ')}`;
  }
});

window.__demo = { renderer, scene, camera, B, facB, detB, stats, setNight: (v) => { nightTarget = v; applyNight(v); }, goto };
