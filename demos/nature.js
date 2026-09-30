// Nature demo: the Cherkasy riverbank (embankment, parks, the reservoir) with world/trees.js + world/water.js on a
// demo-only terrain. Free-fly camera; a button tips a random tree over through the legacy treebreak contract (live
// item fields + pool.update(camPos, true) for the pools whose items are that kind's array).
//   window.__demo = { renderer, scene, camera, trees, water, bands, world, stats(), tipRandom(), setNight(v), goto(x, y, z, tx, tz) }
// URL: ?cam=x,y,z,tx,tz  ?night  ?norefl  ?norev (standard depth buffer)
import { ACESFilmicToneMapping, BackSide, Color, CylinderGeometry, DirectionalLight, DoubleSide, Euler, FogExp2, HemisphereLight, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PCFSoftShadowMap, PMREMGenerator, PerspectiveCamera, Quaternion, Scene, ShaderMaterial, SphereGeometry, Vector3, WebGLRenderer } from 'three';
import { buildTrees } from '../src/world/trees.js';
import { buildWater, buildWetBands, buildPonds, WATER_Y } from '../src/world/water.js';
import { loadRiverbank } from './nature.world.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const BOUNDS = { x0: -300, x1: 2400, z0: -1100, z1: 1900 };

const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance', reversedDepthBuffer: !Q.has('norev') });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap;
renderer.info.autoReset = false;
document.body.appendChild(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 30000);
const hemi = new HemisphereLight(0xbcd4f0, 0x4a4a3a, 0.9);
const sun = new DirectionalLight(0xfff0d8, 3.2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -180, right: 180, top: 180, bottom: -180, near: 1, far: 1200 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.4;
scene.add(hemi, sun, sun.target);
scene.fog = new FogExp2(0xb4c6d6, 0.00016);

// ---- sky dome (also what the water reflects) + a PMREM environment made from it
const skyU = { top: { value: new Color() }, hor: { value: new Color() }, sunDir: { value: new Vector3() }, sunCol: { value: new Color() } };
const skyMat = new ShaderMaterial({
  uniforms: skyU, side: BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p; }',
  fragmentShader: 'uniform vec3 top, hor, sunDir, sunCol; varying vec3 vD; void main() { float h = max(vD.y, 0.0); vec3 c = mix(hor, top, pow(h, 0.45)); c = mix(c, hor * 0.6, smoothstep(0.0, -0.2, vD.y)); c += sunCol * pow(max(dot(vD, sunDir), 0.0), 900.0) * 30.0 + sunCol * pow(max(dot(vD, sunDir), 0.0), 12.0) * 0.25; gl_FragColor = vec4(c, 1.0); }',
});
const sky = new Mesh(new SphereGeometry(20000, 32, 16), skyMat); sky.renderOrder = -1; sky.frustumCulled = false;
scene.add(sky);
const pmrem = new PMREMGenerator(renderer);
let envRT = null;
function setNight(night) {
  const S = night
    ? { top: [0.004, 0.006, 0.018], hor: [0.02, 0.022, 0.035], sun: [0.25, 0.3, 0.45], hemi: 0.08, sunI: 0.25, el: 0.5, az: 2.2 }
    : { top: [0.12, 0.25, 0.55], hor: [0.62, 0.7, 0.78], sun: [1, 0.92, 0.8], hemi: 0.9, sunI: 3.2, el: 0.62, az: 0.9 };
  skyU.top.value.setRGB(...S.top); skyU.hor.value.setRGB(...S.hor); skyU.sunCol.value.setRGB(...S.sun);
  skyU.sunDir.value.set(Math.cos(S.az) * Math.cos(S.el), Math.sin(S.el), Math.sin(S.az) * Math.cos(S.el));
  sun.color.setRGB(...S.sun); sun.intensity = S.sunI; hemi.intensity = S.hemi; scene.fog.color.copy(skyU.hor.value);
  for (const m of lampMats) m.color.setRGB(...(night ? [6, 4.2, 2.2] : [0.6, 0.55, 0.45]));
  const envScene = new Scene(); envScene.add(new Mesh(new SphereGeometry(10, 32, 16), skyMat));
  envRT?.dispose(); envRT = pmrem.fromScene(envScene, 0, 0.1, 100); scene.environment = envRT.texture;
  state.night = night; $('night').textContent = night ? 'День' : 'Ніч';
}
const state = { night: false, falling: [], stumps: 0 };
const lampMats = [];

// ---- free-fly camera
const keys = new Set(); let yaw = 0, pitch = -0.2, speed = 30, drag = false;
addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'KeyN') setNight(!state.night); if (e.code === 'KeyT') tipRandom(); });
addEventListener('keyup', (e) => keys.delete(e.code));
renderer.domElement.addEventListener('pointerdown', () => { drag = true; });
addEventListener('pointerup', () => { drag = false; });
addEventListener('pointermove', (e) => { if (!drag) return; yaw -= e.movementX * 0.0025; pitch = Math.max(-1.55, Math.min(1.55, pitch - e.movementY * 0.0025)); });
addEventListener('wheel', (e) => { speed = Math.max(3, Math.min(600, speed * (e.deltaY > 0 ? 0.85 : 1.18))); });
const eul = new Euler(0, 0, 0, 'YXZ'), mv = new Vector3();
function fly(dt) {
  mv.set((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), (keys.has('KeyE') || keys.has('Space') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0), (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0));
  eul.set(pitch, yaw, 0); camera.quaternion.setFromEuler(eul);
  if (mv.lengthSq()) { const up = mv.y; mv.y = 0; mv.applyQuaternion(camera.quaternion); mv.y += up; camera.position.addScaledVector(mv.normalize(), speed * (keys.has('ShiftLeft') ? 5 : 1) * dt); }
  if (world) camera.position.y = Math.max(camera.position.y, world.heightAt(camera.position.x, camera.position.z) + 1.2, WATER_Y + 0.4);
}
function goto(x, y, z, tx, tz, ty = null) { camera.position.set(x, y, z); yaw = Math.atan2(-(tx - x), -(tz - z)); pitch = Math.atan2((ty ?? y * 0.6) - y, Math.hypot(tx - x, tz - z)); }
const VIEWS = [
  ['Набережна', [1195, 7, 690, 1110, 500, 2]],
  ['Алея', [1060, 3.5, 560, 1120, 420, 3]],
  ['Над водою', [1500, 90, 300, 700, 500]],
  ['Парк', [780, 30, 150, 600, 380]],
  ['Згори', [900, 700, 300, 1000, 280]],
];

let world = null, trees = null, water = null, bands = null, ponds = null, stumps = null;
async function init() {
  $('stats').textContent = 'завантаження мапи…';
  const t0 = performance.now();
  world = await loadRiverbank(BOUNDS);
  const tLoad = performance.now() - t0;
  scene.add(world.terrain, world.roads, world.buildings, world.walls);
  world.buildings.material.side = DoubleSide; world.walls.material.side = DoubleSide;
  // street lamps along the embankment (emissive only; they show up in the water at night)
  const lampM = new MeshBasicMaterial({ color: 0xffffff }); lampMats.push(lampM);
  const pole = new InstancedMesh(new CylinderGeometry(0.06, 0.09, 4.2, 5).translate(0, 2.1, 0), new MeshStandardMaterial({ color: 0x202224 }), world.lampPts.length || 1);
  const bulb = new InstancedMesh(new SphereGeometry(0.22, 8, 6).translate(0, 4.3, 0), lampM, world.lampPts.length || 1);
  const m4 = new Matrix4();
  world.lampPts.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); pole.setMatrixAt(i, m4); bulb.setMatrixAt(i, m4); });
  pole.count = bulb.count = world.lampPts.length; scene.add(pole, bulb);

  const t1 = performance.now();
  trees = buildTrees({ scene, T: {}, spots: world.spots, parkPaths: [], noPark: true, maxScale: 3 });
  const tTrees = performance.now() - t1;
  water = buildWater({ scene, T: {}, renderer: Q.has('norefl') ? null : renderer, shore: false, shoreDist: (x, z) => distToWater(x, z), skirtWater: (dx) => dx > 0.15 });
  bands = buildWetBands({ scene, T: {}, segs: world.wetSegs });
  ponds = buildPonds({ scene, map: world.map, heightAt: world.landY });
  const cyl = []; trees.addSolids((c) => cyl.push(c));
  stumps = new InstancedMesh(new CylinderGeometry(1, 1.15, 1, 8).translate(0, 0.5, 0), new MeshStandardMaterial({ color: new Color(0.1, 0.07, 0.05), roughness: 0.95 }), 64);
  stumps.count = 0; stumps.castShadow = true; scene.add(stumps);
  state.info = { tLoad, tTrees, spots: world.spots.length, trunks: cyl.length, wetSegs: world.wetSegs.length };
  const c = Q.get('cam')?.split(',').map(Number);
  if (c?.length >= 5) goto(...c); else goto(...VIEWS[0][1]);
  setNight(Q.has('night'));
  console.log('[nature demo]', state.info, trees.stats());
}
// coarse shore distance for the reflection fade (the game passes ground.shoreDist)
function distToWater(x, z) { for (let r = 0; r <= 800; r += 40) for (let k = 0; k < 8; ++k) if (world.isWater(x + Math.cos(k * 0.785) * r, z + Math.sin(k * 0.785) * r)) return r; return 900; }

// ---- tip a tree over, the way legacy treebreak.js drives the renderer
const KINDS = ['street', 'park', 'elm', 'small', 'conifer'];
function tipRandom() {
  if (!trees) return null;
  const f = new Vector3(); camera.getWorldDirection(f);
  const cands = [];
  for (const k of KINDS) for (const it of trees[k]) {
    if (it.hedge || it.broken) continue;
    const dx = it.x - camera.position.x, dz = it.z - camera.position.z, d = Math.hypot(dx, dz);
    if (d > 12 && d < 140 && (dx * f.x + dz * f.z) / d > 0.75) cands.push([it, k]);
  }
  if (!cands.length) return null;
  const [it, kind] = cands[Math.floor(Math.random() * cands.length)];
  it.broken = true;
  const dx = it.x - camera.position.x, dz = it.z - camera.position.z, r = trees.trunkOf(it).r;
  if (stumps.count < 64) { m4b.compose(new Vector3(it.x, it.y - 0.05, it.z), new Quaternion(), new Vector3(r, 0.6, r)); stumps.setMatrixAt(stumps.count++, m4b); stumps.instanceMatrix.needsUpdate = true; }
  it.ry = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.4; it.rz = (Math.random() - 0.5) * 0.1; it.rx = 0.02; it.y = it.y + 0.6;
  state.falling.push({ it, kind, ang: 0.02, w: 0.4, max: 1.45 + Math.random() * 0.06, bounced: false });
  return { x: it.x, z: it.z, kind, variant: it.variant };
}
const m4b = new Matrix4();
function updateFalling(dt) {
  if (!state.falling.length) return;
  const kinds = new Set();
  state.falling = state.falling.filter((f) => {
    f.w += (2.6 * Math.sin(f.ang) + 0.3) * dt; f.ang += f.w * dt;
    let done = false;
    if (f.ang >= f.max) { f.ang = f.max; if (!f.bounced && f.w > 0.9) { f.bounced = true; f.w = -f.w * 0.22; } else done = true; }
    f.it.rx = f.ang; kinds.add(f.kind);
    return !done;
  });
  for (const k of kinds) for (const p of trees.pools) if (p.items === trees[k]) p.update(camera.position, true);
}

// ---- UI
$('tip').onclick = () => tipRandom();
$('night').onclick = () => setNight(!state.night);
$('refl').onclick = () => { state.noRefl = !state.noRefl; water?.setReflection(!state.noRefl); $('refl').textContent = 'Відбиття: ' + (state.noRefl ? 'ні' : 'так'); };
VIEWS.forEach(([name, v], i) => { const b = document.createElement('button'); b.textContent = name; b.onclick = () => goto(...v); $('views').appendChild(b); if (i === 0) b.title = 'стартова точка'; });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

let fps = 60, frameMs = 0, last = performance.now(), statT = 0;
function stats() {
  const i = renderer.info.render;
  return { fps: Math.round(fps), frameMs: +frameMs.toFixed(2), calls: i.calls, tris: i.triangles, cam: camera.position.toArray().map(v => Math.round(v)), trees: trees?.stats(), water: water?.stats(), falling: state.falling.length, stumps: stumps?.count ?? 0, ...state.info };
}
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  const c0 = performance.now();
  fly(dt);
  camera.updateMatrixWorld();
  sky.position.copy(camera.position);
  sun.position.copy(camera.position).addScaledVector(skyU.sunDir.value, 500); sun.target.position.copy(camera.position); sun.target.updateMatrixWorld();
  water?.update(dt, camera);
  if (trees) { trees.update(dt, camera.position); updateFalling(dt); }
  renderer.info.reset();
  renderer.render(scene, camera);
  frameMs += (performance.now() - c0 - frameMs) * 0.1;
  if ((statT += dt) > 0.25 && trees) {
    statT = 0; const s = stats(), t = s.trees, w = s.water;
    $('stats').textContent = `fps ${s.fps}  cpu ${s.frameMs} ms\nвиклики ${s.calls}  трикутники ${(s.tris / 1e6).toFixed(2)} млн\nдерева ${t.items}: близько ${t.near}, середньо ${t.mid}, далеко ${t.far}\nперепаковок ${t.repacks} (${t.lastRepackMs} ms), дерев. викликів ${t.drawCalls}\nвода: відбиття ${w.planar ? 'так' : 'ні'} ${w.rt ? w.rt.join('×') : ''} вага ${w.reflWeight} (${w.reflMs} ms)\nмокрі смуги ${state.info.wetSegs} сегм., стовбурів ${state.info.trunks}\nпадають ${s.falling}, пнів ${s.stumps}\nкамера ${s.cam.join(', ')}`;
  }
}
window.__demo = { renderer, scene, camera, get trees() { return trees; }, get water() { return water; }, get bands() { return bands; }, get ponds() { return ponds; }, get world() { return world; }, stats, tipRandom, setNight, goto };
init().then(() => frame()).catch((e) => { $('stats').textContent = 'помилка: ' + e.message; console.error(e); });
