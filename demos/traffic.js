// Traffic demo: flat ground under the real Cherkasy motor roads, the lane network with signals, streaming traffic, and a
// heavy box "player" (WASD) that rams cars into tumbling, dented wrecks. window.__demo = { sim, net, models, player, stats() }.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildLaneNetwork } from '../src/npc/lanes.js';
import { loadTrafficVehicles } from '../src/npc/vehicles.js';
import { createTrafficSimulation, createSignalProps } from '../src/npc/traffic.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
const fit = () => { renderer.setPixelRatio(devicePixelRatio > 2 ? 2 : devicePixelRatio); renderer.setSize(window.innerWidth, window.innerHeight); };
fit();
Object.assign(renderer.shadowMap, { enabled: true, type: THREE.PCFSoftShadowMap });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const DAY = new THREE.Color(0xb9cbe0), NIGHT = new THREE.Color(0x0b1020);
scene.background = DAY.clone(); scene.fog = new THREE.Fog(DAY.clone(), 250, 900);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 3000);
const hemi = new THREE.HemisphereLight(0xdfe8f5, 0x4a4a40, 1.4);
const sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 });
scene.add(hemi); scene.add(sun); scene.add(sun.target);
window.addEventListener('resize', () => { fit(); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); });

const map = await (await fetch('../assets/cherkasy/map.json')).json();
document.getElementById('load').textContent = 'Будую смуги та завантажую машини…';

// ---- ground and road ribbons (context only; traffic follows the lane network, not these meshes)
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6f7a5e, roughness: 1 }));
ground.receiveShadow = true; scene.add(ground);
{
  const pos = [], col = [], c = new THREE.Color();
  const tint = { primary: 0x3d3f43, secondary: 0x45474b, tertiary: 0x4b4d51, residential: 0x55575b, service: 0x5d5f62 };
  for (const r of map.roads) {
    if (r.k !== 'm') continue;
    c.setHex(tint[r.c] ?? 0x505255);
    const P = r.p, hw = (r.w || 6) / 2;
    for (let i = 0; i + 3 < P.length; i += 2) {
      const sx = P[i], sz = P[i + 1], tx = P[i + 2], tz = P[i + 3], seg = Math.hypot(tx - sx, tz - sz);
      if (seg < 0.01) continue;
      const ux = (tx - sx) / seg, uz = (tz - sz) / seg; // along; the ribbon overlaps its neighbours by 0.5 m
      const corner = (x, z, a, b) => [x + ux * a - uz * b, z + uz * a + ux * b];
      const c0 = corner(sx, sz, -0.5, -hw), c1 = corner(sx, sz, -0.5, hw), c2 = corner(tx, tz, 0.5, hw), c3 = corner(tx, tz, 0.5, -hw);
      for (const v of [c0, c1, c2, c0, c2, c3]) { pos.push(v[0], 0.02, v[1]); col.push(c.r, c.g, c.b); }
    }
  }
  const ribbons = new THREE.BufferGeometry();
  ribbons.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  ribbons.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  ribbons.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const asphalt = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  const roads = new THREE.Mesh(ribbons, asphalt);
  roads.receiveShadow = true; scene.add(roads);
}

// ---- traffic
const net = buildLaneNetwork(map, () => 0);
const models = await loadTrafficVehicles();
const sim = createTrafficSimulation({ scene, net, models, density: 0.7 });
let clock = 0;
const lights = createSignalProps(scene, net.signals, (ax) => net.phase(clock, ax));
sim.setDebris(createDemoDebris(scene));
document.getElementById('load').remove();

// ---- the heavy player box
const DIM = { len: 5.2, wid: 2.1, h: 1.8 };
const body = new THREE.Mesh(new THREE.BoxGeometry(DIM.len, DIM.h, DIM.wid).translate(0, DIM.h / 2, 0), new THREE.MeshStandardMaterial({ color: 0x9aa3ab, metalness: 0.7, roughness: 0.35 }));
body.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, DIM.wid * 0.8).translate(DIM.len / 2, DIM.h * 0.6, 0), new THREE.MeshBasicMaterial({ color: 0xfff4c0 })));
body.castShadow = true; scene.add(body);
const player = { p: new THREE.Vector3(), v: new THREE.Vector3(), yaw: 0 };
function toRoad() {
  let L = net.links[0], best = Infinity;
  for (const k of net.links) { const d = k.cx * k.cx + k.cz * k.cz; if (k.main && k.len > 60 && d < best) { best = d; L = k; } }
  if (!L) return;
  player.p.set(L.ax + L.dx * 10, 0, L.az + L.dz * 10); player.v.set(0, 0, 0); player.yaw = Math.atan2(L.dz, L.dx);
}
toRoad();
const keys = new Set();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyC') { free = !free; orbit.enabled = free; if (free) orbit.target.copy(player.p); }
  if (e.code === 'KeyN') night = !night;
  if (e.code === 'KeyR') toRoad();
  if (e.key === '+' || e.key === '=') sim.setDensity(Math.min(3, sim.density + 0.1));
  if (e.key === '-') sim.setDensity(Math.max(0, sim.density - 0.1));
});
addEventListener('keyup', (e) => keys.delete(e.code));
let free = false, night = false, nightK = 0;
const orbit = new OrbitControls(camera, renderer.domElement); orbit.enabled = false;
camera.position.set(player.p.x - 20, 12, player.p.z); camera.lookAt(player.p);

const q = { x: 0, y: 0, z: 0, fx: 1, fz: 0, hl: DIM.len / 2 + 0.2, hw: DIM.wid / 2 + 0.05, h: DIM.h, v: player.v, mass: 12000 };
let lastHit = '';
function drive(dt) {
  const fx = Math.cos(player.yaw), fz = Math.sin(player.yaw), rx = -fz, rz = fx;
  let vf = player.v.x * fx + player.v.z * fz, vs = player.v.x * rx + player.v.z * rz;
  const thr = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), steer = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2 : 1;
  if (thr > 0) vf += (vf < 0 ? 18 : 9 * boost) * dt; else if (thr < 0) vf -= (vf > 0 ? 18 : 6) * dt; else vf -= Math.sign(vf) * Math.min(Math.abs(vf), 2 * dt);
  if (keys.has('Space')) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 25 * dt);
  vf = THREE.MathUtils.clamp(vf, -10, 24 * boost);
  vs -= vs * Math.min(1, 6 * dt);
  player.yaw += steer * dt * Math.min(1.8, Math.abs(vf) * 0.22) * Math.sign(vf || 1);
  const nfx = Math.cos(player.yaw), nfz = Math.sin(player.yaw);
  player.v.set(nfx * vf - nfz * vs, 0, nfz * vf + nfx * vs);
  player.p.addScaledVector(player.v, dt);
  // ram traffic (the fast path) then push out of whatever still overlaps (the slow path)
  Object.assign(q, { x: player.p.x, y: 0, z: player.p.z, fx: nfx, fz: nfz });
  const r = sim.ram(q);
  if (r.hits) { player.v.add(r.dv); player.p.add(r.push); lastHit = `удар: ${r.hits}, збито ${r.knocked}, сила ${r.severity.toFixed(2)}`; }
  for (const o of [-1.6, 0, 1.6]) {
    const c = sim.collideDynamic(new THREE.Vector3(player.p.x + nfx * o, 0, player.p.z + nfz * o), 1.05, 1.3);
    if (!c || c.grounded) continue;
    player.p.x += c.push.x; player.p.z += c.push.z;
    const vn = player.v.x * c.normal.x + player.v.z * c.normal.z;
    if (vn < 0) { player.v.x -= c.normal.x * vn; player.v.z -= c.normal.z * vn; }
  }
  sim.setPlayer(player.p, player.v, 0);
  body.position.copy(player.p); body.rotation.y = -player.yaw;
}

const hud = document.getElementById('hud'), clockT = new THREE.Clock();
const camGoal = new THREE.Vector3(), look = new THREE.Vector3();
let fps = 60, hudT = 0;
function frame() {
  const dt = Math.min(clockT.getDelta(), 0.1);
  clock += dt;
  drive(dt);
  if (free) orbit.update();
  else {
    const fx = Math.cos(player.yaw), fz = Math.sin(player.yaw);
    camGoal.set(player.p.x - fx * 13, 5.5, player.p.z - fz * 13);
    const follow = 1 - Math.exp(-4 * dt);
    camera.position.lerp(camGoal, follow);
    camera.lookAt(look.set(player.p.x + fx * 6, 1.2, player.p.z + fz * 6));
  }
  nightK += ((night ? 1 : 0) - nightK) * Math.min(1, dt * 2);
  models.setNight(nightK);
  scene.background.copy(DAY).lerp(NIGHT, nightK); scene.fog.color.copy(scene.background);
  hemi.intensity = 1.4 - 1.25 * nightK; sun.intensity = 2.4 * (1 - nightK);
  sun.position.set(player.p.x + 60, 120, player.p.z + 40); sun.target.position.copy(player.p);
  sim.update(dt, camera, clock);
  lights.update();
  renderer.render(scene, camera);
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  if ((hudT -= dt) <= 0) {
    hudT = 0.25;
    const s = sim.stats();
    hud.textContent = `fps ${fps.toFixed(0)}   швидкість ${(player.v.length() * 3.6).toFixed(0)} км/год
машин ${s.cars} (стоять ${s.stopped}), припарковано ${s.parked}, щільність ${s.density.toFixed(1)}
намальовано ${s.drawn}  LOD ${s.lod0}/${s.lod1}/${s.lod2}  мешів ${s.meshes}
уламки ${s.wrecks} (рухаються ${s.awake}, з вм'ятинами ${s.dented})
збито ${s.knocked}, вм'ятин ${s.dents}, пропусків пішоходам ${s.pedYields}
смуг ${net.stats.links}, перехресть ${net.stats.junctions}, світлофорів ${net.stats.signals}
сим ${s.simMs.toFixed(2)} мс, уламки ${s.wreckMs.toFixed(2)} мс, малювання ${s.drawMs.toFixed(2)} мс
${lastHit}`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__demo = { sim, net, models, player, stats: () => ({ ...sim.stats(), fps, net: net.stats }) };

// a small stand-in for the city's debris service: flat shards that fly, bounce once or twice and fade
function createDemoDebris(scene) {
  const MAX = 600, mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.2 }), MAX);
  mesh.setColorAt(0, new THREE.Color());
  Object.assign(mesh, { count: 0, frustumCulled: false, castShadow: true });
  scene.add(mesh);
  const P = [], m = new THREE.Matrix4(), qq = new THREE.Quaternion(), e = new THREE.Euler();
  const s = new THREE.Vector3(), p = new THREE.Vector3();
  let last = performance.now();
  const tick = () => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    let n = 0;
    for (let i = P.length; i-- > 0;) {
      const d = P[i]; d.t += dt;
      if (d.t > d.life) { P.splice(i, 1); continue; }
      if (d.y > d.sy / 2 || d.vy > 0) { d.vy -= 15 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.r += d.w * dt; }
      if (d.y < d.sy / 2) { d.y = d.sy / 2; d.vy = Math.abs(d.vy) > 2 ? -d.vy * 0.3 : 0; d.vx *= 0.6; d.vz *= 0.6; d.w *= 0.5; }
      if (n >= MAX) continue;
      const k = Math.min(1, (d.life - d.t) / 2);
      m.compose(p.set(d.x, d.y, d.z), qq.setFromEuler(e.set(d.r, d.r * 0.7, 0)), s.set(d.sx * k, d.sy, d.sz * k));
      mesh.setMatrixAt(n, m); mesh.instanceColor.setXYZ(n, ...d.c); n++;
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return {
    shards(x, y, z, vx, vy, vz, n, cols, smin = 0.08, smax = 0.4, spread = 5, flat = 0.15, life = 60) {
      for (let i = 0; i < n && P.length < MAX; i++) {
        const a = smin + Math.random() * (smax - smin);
        P.push({ x, y, z, vx: vx + (Math.random() - 0.5) * spread, vy: vy + Math.random() * spread * 0.6, vz: vz + (Math.random() - 0.5) * spread,
          sx: a, sy: Math.max(0.01, a * flat), sz: a * (0.4 + Math.random() * 0.8), r: Math.random() * 6, w: (Math.random() - 0.5) * 20,
          c: cols[Math.floor(Math.random() * cols.length)], t: 0, life: Math.min(20, life * 0.3) });
      }
    },
  };
}
