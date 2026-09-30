// People demo: a 1 km patch of central Cherkasy (Soborna square, bul. Shevchenka) with a demo-only draped ground and
// plain extruded buildings, populated by npc/people.js. Free-fly camera; buttons send a fast "car" box through the
// crowd (hitBox -> gibs), spawn a scripted actor that runs to a point, raise an alarm, and line up every clip.
//   window.__demo = { renderer, scene, camera, people, gibs, stats(), goto(x, y, z, tx, tz), sendCar(), runActor(), alarm(), showClips() }
// URL: ?cam=x,y,z,tx,tz  ?n=maxWalkers  ?nobirds
import * as THREE from 'three';
import { createPeople } from '../src/npc/people.js';
import { createGibs } from '../src/npc/gibs.js';
import { createPolyMask } from '../src/npc/people/mask.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const B = { x0: -500, x1: 500, z0: -350, z1: 650 };

const renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance', antialias: true });
Object.assign(renderer.shadowMap, { enabled: true, type: THREE.PCFShadowMap });
Object.assign(renderer, { toneMapping: THREE.ACESFilmicToneMapping }); renderer.info.autoReset = false;
const fit = () => { renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(innerWidth, innerHeight); };
fit(); document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9bfd3);
scene.fog = new THREE.Fog(0xa9bfd3, 250, 900);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.2, 5000);
const hemi = new THREE.HemisphereLight(0xcfe0f2, 0x5a5448, 1.1);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.8);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 800 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.3;
for (const o of [hemi, sun, sun.target]) scene.add(o);
addEventListener('resize', () => { fit(); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// ---- data
const asset = async (name, kind) => (await fetch(`/assets/cherkasy/${name}`))[kind]();
const [map, buildings, dem] = await Promise.all([asset('map.json', 'json'), asset('map_buildings.json', 'json'), asset('dem.bin', 'arrayBuffer')]);
const D = map.dem, H16 = new Int16Array(dem);
const heightAt = (x, z) => { // bilinear over the 8 m DEM grid (2 cm steps)
  const fx = Math.min(D.nx - 1.001, Math.max(0, (x - D.x0) / D.cell)), fz = Math.min(D.nz - 1.001, Math.max(0, (z - D.z0) / D.cell));
  const i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j, at = (ii, jj) => H16[jj * D.nx + ii] * D.scale;
  return (at(i, j) * (1 - a) + at(i + 1, j) * a) * (1 - b) + (at(i, j + 1) * (1 - a) + at(i + 1, j + 1) * a) * b;
};
// non-indexed pieces with the same attributes -> one geometry (all the extrusions of the patch)
const joinGeometries = (parts) => {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const buf = new Float32Array(parts.reduce((n, g) => n + g.attributes[name].array.length, 0));
    let o = 0; for (const g of parts) { buf.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(buf, 3));
  }
  return out;
};
const inB = (x, z, m = 0) => x > B.x0 - m && x < B.x1 + m && z > B.z0 - m && z < B.z1 + m;

// ---- ground: a draped grid with a painted canvas (asphalt, pavements, parks, zebra crossings)
{
  const S = 4096, W = B.x1 - B.x0, paint = new OffscreenCanvas(S, S);
  const g = paint.getContext('2d'), k = S / W;
  const px = (x) => (x - B.x0) * k, pz = (z) => (z - B.z0) * k;
  const fillRings = (polys, col) => {
    g.fillStyle = col; g.beginPath();
    for (const P of polys) for (const R of P) { if (R.length < 6) continue; g.moveTo(px(R[0]), pz(R[1])); for (let i = 2; i < R.length; i += 2) g.lineTo(px(R[i]), pz(R[i + 1])); g.closePath(); }
    g.fill('evenodd');
  };
  g.fillStyle = '#6f7a4c'; g.fillRect(0, 0, S, S);
  fillRings(map.cover.park || [], '#5f7a45'); fillRings(map.cover.grass || [], '#6b8a4c');
  fillRings(map.dirt || [], '#8a7a5e');
  fillRings(map.walks || [], '#a7a39a');
  fillRings(map.asphalt || [], '#4a4c50');
  g.strokeStyle = '#e8e6de'; g.lineWidth = 0.5 * k;
  for (const r of map.roads) { // zebra: stripes across each crossing line
    if (r.k !== 'x') continue;
    const P = r.p;
    for (let i = 0; i + 3 < P.length; i += 2) {
      const dx = P[i + 2] - P[i], dz = P[i + 3] - P[i + 1], L = Math.hypot(dx, dz); if (L < 0.5) continue;
      for (let s = 0.4; s < L; s += 1) { const x = P[i] + dx * s / L, z = P[i + 1] + dz * s / L; g.beginPath(); g.moveTo(px(x - dz / L * 1.6), pz(z + dx / L * 1.6)); g.lineTo(px(x + dz / L * 1.6), pz(z - dx / L * 1.6)); g.stroke(); }
    }
  }
  const tex = Object.assign(new THREE.CanvasTexture(paint), { colorSpace: THREE.SRGBColorSpace, anisotropy: 8 });
  const geo = new THREE.PlaneGeometry(W, B.z1 - B.z0, 250, 250).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const ox = (B.x0 + B.x1) / 2, oz = (B.z0 + B.z1) / 2, arr = pos.array;
  for (let v = 0; v < arr.length; v += 3) { arr[v] += ox; arr[v + 2] += oz; arr[v + 1] = heightAt(arr[v], arr[v + 2]); }
  geo.computeVertexNormals();
  scene.add(Object.assign(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.95, map: tex })), { receiveShadow: true, name: 'demo-ground' }));
}
// ---- buildings: plain extrusions
{
  const parts = [], cols = { apt: 0xd9d2c4, public: 0xcfc6b2, house: 0xc9b7a0, church: 0xeae4d6, indus: 0xa8a49c };
  for (const b of buildings) {
    const R = b.p; if (!R || R.length < 6 || !inB(R[0], R[1])) continue;
    const pts = []; let y0 = Infinity;
    for (let i = 0; i < R.length; i += 2) { pts.push(new THREE.Vector2(R[i], -R[i + 1])); y0 = Math.min(y0, heightAt(R[i], R[i + 1])); }
    const h = b.h || (b.lv || 2) * 3.1;
    const body = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { bevelEnabled: false, depth: h + 0.6 });
    body.rotateX(-Math.PI / 2); body.translate(0, y0 - 0.6, 0); body.deleteAttribute('uv');
    const tint = new THREE.Color(cols[b.k] ?? 0xbfb6a8).multiplyScalar(0.85 + ((b.id * 2654435761) >>> 0) % 100 / 400).toArray();
    body.setAttribute('color', new THREE.BufferAttribute(new Float32Array(body.attributes.position.count * 3).map((_, q) => tint[q % 3]), 3));
    parts.push(body);
  }
  scene.add(Object.assign(new THREE.Mesh(joinGeometries(parts), new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true })), { castShadow: true, receiveShadow: true, name: 'demo-buildings' }));
}

// ---- people + debris
const aMask = createPolyMask(map.asphalt), wMask = createPolyMask(map.water || [], { tile: 128, res: 1 }), bMask = createPolyMask(buildings);
const ground = { heightAt, onAsphalt: aMask.has, isWater: wMask.has, isBuilding: bMask.has };
const standY = (x, z) => heightAt(x, z) + 0.02;
const gibs = createGibs(scene, (x, z) => standY(x, z), { blood: Q.has('blood') });
const car = { mesh: null, on: false, x: 0, z: 0, fx: 1, fz: 0, v: 24, left: 0, hits: 0 };
const people = createPeople({ scene, map, ground, buildings, gibs, opts: {
  maxWalkers: +(Q.get('n') || 1400), birds: !Q.has('nobirds'), standY,
  carNear: (x, z, r) => car.on && (car.x - x) ** 2 + (car.z - z) ** 2 < r * r,
} });
car.mesh = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.5, 4.6), new THREE.MeshStandardMaterial({ color: 0xc0282a, roughness: 0.35, metalness: 0.3 }));
car.mesh.castShadow = true; car.mesh.visible = false; scene.add(car.mesh);
const marker = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 12).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffc23a }));
marker.visible = false; scene.add(marker);

// ---- camera
const keys = new Set(); let yaw = 0, pitch = -0.2, speed = 25, drag = false;
const goto = (x, y, z, tx, tz) => { camera.position.set(x, y, z); const ty = heightAt(tx, tz); yaw = Math.atan2(-(tx - x), -(tz - z)); pitch = Math.atan2(ty - y, Math.hypot(tx - x, tz - z)); };
addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'KeyC') sendCar(); if (e.code === 'KeyR') runActor(); if (e.code === 'KeyX') alarm(); });
addEventListener('keyup', (e) => keys.delete(e.code));
renderer.domElement.addEventListener('mousedown', () => { drag = true; });
addEventListener('mouseup', () => { drag = false; });
addEventListener('mousemove', (e) => { if (!drag) return; yaw -= e.movementX * 0.003; pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.003)); });
addEventListener('wheel', (e) => { speed = Math.max(3, Math.min(400, speed * (e.deltaY > 0 ? 0.85 : 1.18))); });
const h0 = heightAt(0, 0);
const VIEWS = {
  'Соборна площа': [28, h0 + 7, 36, 0, 0],
  'бул. Шевченка': [-32, heightAt(-44, 300) + 2.2, 262, -44, 330],
  'Хрещатик': [175, heightAt(187, 380) + 4, 330, 187, 420],
  'Згори 250 м': [0, h0 + 250, 380, 0, 120],
};
for (const [name, v] of Object.entries(VIEWS)) { const b = document.createElement('button'); b.textContent = name; b.onclick = () => goto(...v); $('views').appendChild(b); }
goto(...(Q.get('cam') ? Q.get('cam').split(',').map(Number) : VIEWS['Соборна площа']));

// the ground point in front of the camera
const target = () => {
  const d = new THREE.Vector3(); camera.getWorldDirection(d);
  const p = camera.position.clone();
  for (let t = 0; t < 400; t += 1) { p.addScaledVector(d, 1); if (p.y < heightAt(p.x, p.z)) return p; }
  return camera.position.clone().addScaledVector(d, 40);
};
const nearestSample = (x, z, rMax = 60) => {
  let best = null, bd = rMax * rMax;
  for (const P of people.lanes) for (let k = 0; k < P.n; k++) { const d = (P.x[k] - x) ** 2 + (P.z[k] - z) ** 2; if (d < bd && !P.road[k]) { bd = d; best = [P, k]; } }
  return best;
};

// ---- actions
function sendCar() { // along the pavement of the walker nearest to the view point, through the crowd
  const t = target();
  let w = null, bd = Infinity;
  for (const p of people.walkers) { if (!p.nav) continue; const d = (p.x - t.x) ** 2 + (p.z - t.z) ** 2; if (d < bd) { bd = d; w = p; } }
  let fx = -Math.sin(yaw), fz = -Math.cos(yaw), cx = t.x, cz = t.z;
  if (w && bd < 80 * 80) { fx = Math.sin(w.ry); fz = Math.cos(w.ry); cx = w.x; cz = w.z; }
  Object.assign(car, { on: true, x: cx - fx * 60, z: cz - fz * 60, fx, fz, left: 130 });
  car.mesh.visible = true;
}
let actor = null, actorT = 0;
function runActor() {
  const t = target(), s = nearestSample(t.x, t.z);
  if (!s) return;
  const [P, k] = s, k1 = k; let k2 = Math.min(P.n - 1, k + 14);
  if (k2 - k1 < 5) k2 = Math.max(0, k - 14);
  if (actor) people.removeActor(actor);
  actor = people.spawnActor({ x: P.x[k1], z: P.z[k1], ry: Math.atan2(P.x[k2] - P.x[k1], P.z[k2] - P.z[k1]), clip: 'wave' });
  actorT = 1.2; actor._to = [P.x[k2], P.z[k2]];
  marker.position.set(P.x[k2], standY(P.x[k2], P.z[k2]) + 2.6, P.z[k2]); marker.visible = true;
}
function alarm() { people.alarm(target(), 25); }
let clipRow = [];
function showClips() {
  for (const a of clipRow) people.removeActor(a);
  if (clipRow.length) { clipRow = []; return; }
  const t = target(), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const names = ['idle', 'walk', 'run', 'talk', 'talk2', 'phone', 'point', 'wave', 'cheer', 'cower', 'flee'];
  clipRow = names.map((c, i) => {
    const o = (i - (names.length - 1) / 2) * 1.3, x = t.x + rx * o, z = t.z + rz * o;
    const a = people.spawnActor({ x, z, ry: Math.atan2(camera.position.x - x, camera.position.z - z), clip: c, seed: 101 + i * 37 });
    if (c === 'walk' || c === 'run' || c === 'flee') a._loco = c;
    return a;
  });
}
$('car').onclick = sendCar; $('actor').onclick = runActor; $('alarm').onclick = alarm; $('clips').onclick = showClips;

// ---- loop
let lastT = performance.now(), fps = 60, statT = 0, last = {};
function frame() {
  const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  const f = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)), r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const sp = speed * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 5 : 1) * dt;
  if (keys.has('KeyW')) camera.position.addScaledVector(f, sp); if (keys.has('KeyS')) camera.position.addScaledVector(f, -sp);
  if (keys.has('KeyD')) camera.position.addScaledVector(r, sp); if (keys.has('KeyA')) camera.position.addScaledVector(r, -sp);
  if (keys.has('KeyE')) camera.position.y += sp; if (keys.has('KeyQ')) camera.position.y -= sp;
  camera.position.y = Math.max(camera.position.y, heightAt(camera.position.x, camera.position.z) + 0.6);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  // the car: straight run, hitBox every frame (the game calls it for the player's box and for flying wrecks)
  if (car.on) {
    const s = car.v * dt; car.x += car.fx * s; car.z += car.fz * s; car.left -= s;
    const gy = heightAt(car.x, car.z);
    car.mesh.position.set(car.x, gy + 0.85, car.z); car.mesh.rotation.y = Math.atan2(car.fx, car.fz);
    car.hits += people.hitBox({ x: car.x, z: car.z, fx: car.fx, fz: car.fz, hl: 2.3, hw: 1.0, y0: gy + 0.1, y1: gy + 1.6, vx: car.fx * car.v, vy: 0, vz: car.fz * car.v });
    if (car.left <= 0) { car.on = false; car.mesh.visible = false; }
  }
  if (actor && !actor.dead) { // a short wave, then run to the marker, then cheer
    if (actorT > 0 && (actorT -= dt) <= 0) { actor.hx = actor._to[0]; actor.hz = actor._to[1]; actor.goSpeed = 4.8; actor.idleClip = 'cheer'; }
    if (actor.hx !== undefined && Math.hypot(actor.hx - actor.x, actor.hz - actor.z) < 0.5) marker.visible = false;
  }
  for (const a of clipRow) if (a._loco) a.phase = (a.phase + dt * (a._loco === 'walk' ? 0.85 : 1.6)) % 1; // in-place cycles
  const t = target();
  sun.position.set(t.x + 120, t.y + 220, t.z + 80); sun.target.position.copy(t);
  renderer.info.reset();
  people.update(dt, camera);
  gibs.update(dt);
  renderer.render(scene, camera);
  if ((statT -= dt) <= 0) {
    statT = 0.5; last = people.stats();
    const n = last.net, b = last.birds;
    $('stats').textContent = [
      `fps ${fps.toFixed(0)}   draw calls ${renderer.info.render.calls}   tris ${(renderer.info.render.triangles / 1000).toFixed(0)}k`,
      `люди: ${last.walkers} йдуть, ${last.statics} стоять, ${last.actors} актори, ${last.onRoad} на переходах`,
      `LOD далеко/середньо/близько: ${last.drawn.join(' / ')}   трикутників людей ${(last.tris / 1000).toFixed(0)}k`,
      `клітинки ${last.cells}   квота ${last.quota}   мережа ${n.paths} шляхів, ${n.links} зв'язків, черга ${n.queued}`,
      `голуби: ${b ? `${b.birds} у ${b.flocks} зграях, у повітрі ${b.flying}` : 'вимкнено'}`,
      `збито: ${last.hits}   уламки ${gibs.stats().chunks}`,
      `CPU людей ${last.ms} мс (макс ${last.maxMs}), стрімінг ${last.streamMs} мс`,
    ].join('\n');
  }
  schedule();
}
// a hidden tab gets no animation frames; keep the simulation (and the stats) ticking so automated checks see progress.
// One pending tick at a time: a timer while hidden, an animation frame while visible.
let tick = 0;
function schedule() {
  const id = ++tick, run = () => { if (id === tick) frame(); };
  if (!document.hidden) return requestAnimationFrame(run);
  for (let k = 0; k < 20; k++) people.update(0, camera); // throttled timers: stream harder per tick (dt 0 = no sim time)
  setTimeout(run, 50);
}
document.addEventListener('visibilitychange', () => { lastT = performance.now(); schedule(); });
frame();

window.__demo = { renderer, scene, camera, people, gibs, stats: () => ({ ...people.stats(), fps: +fps.toFixed(1), calls: renderer.info.render.calls, gibs: gibs.stats() }), goto, sendCar, runActor, alarm, showClips };
