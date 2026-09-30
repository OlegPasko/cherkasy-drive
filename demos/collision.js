// Collision demo: the Cherkasy footprints (map_buildings.json) as prisms, OSM trees as trunks, the DEM as terrain.
// A body (upright capsule or the 5.7 m car box) flies with WASD and is pushed out of the city; a click casts a ray
// from the camera. Debug wireframes of nearby solids (V). window.__demo = { stats, cw, body, car }.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createCollisionWorld, createCollisionDebug } from '../src/world/collision.js';
import { createCarCollider, slideVelocity } from '../src/game/car/collide.js';

const hud = document.getElementById('hud');
const [map, B, dem] = await Promise.all([
  fetch('/assets/cherkasy/map.json').then(r => r.json()),
  fetch('/assets/cherkasy/map_buildings.json').then(r => r.json()),
  fetch('/assets/cherkasy/dem.bin').then(r => r.arrayBuffer()).then(b => new Int16Array(b)),
]);

// ---------------------------------------------------------------- terrain: bilinear DEM
const D = map.dem;
const demAt = (i, j) => dem[Math.min(D.nz - 1, Math.max(0, j)) * D.nx + Math.min(D.nx - 1, Math.max(0, i))] * D.scale;
function terrainY(x, z) {
  const fx = (x - D.x0) / D.cell, fz = (z - D.z0) / D.cell, i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j;
  return (demAt(i, j) * (1 - a) + demAt(i + 1, j) * a) * (1 - b) + (demAt(i, j + 1) * (1 - a) + demAt(i + 1, j + 1) * a) * b;
}

// ---------------------------------------------------------------- collision world
const t0 = performance.now();
const cw = createCollisionWorld({ cell: 24, terrain: { height: terrainY, minY: -15, maxY: 70 } });
let nb = 0;
for (const b of B) {
  let lo = Infinity; for (let i = 0; i < b.p.length; i += 2) lo = Math.min(lo, terrainY(b.p[i], b.p[i + 1]));
  const H = b.h ?? (b.lv ?? 2) * 3.2 + 1;
  if (cw.prism(b.p, lo - 1, lo + H, 0, 0, b.k || 'wall', 0, b.holes) >= 0) nb++;
}
for (const [x, z] of map.trees) { const y = terrainY(x, z); cw.cyl(x, z, y - 0.3, y + 5, 0.35, 0.3, 'trunk'); }
cw.finalize();
const buildMs = performance.now() - t0;
document.getElementById('load').remove();

// ---------------------------------------------------------------- scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0d1117); scene.fog = new THREE.Fog(0x0d1117, 150, 420);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.2, 3000);
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x302820, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(1, 2, 0.5); scene.add(sun);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxDistance = 250;

// terrain patch around the start, rebuilt when the body wanders far
const groundMat = new THREE.MeshLambertMaterial({ color: 0x27313b });
let groundMesh = null, gcx = Infinity, gcz = Infinity;
function terrainPatch(cx, cz) {
  const S = 800, N = 160, g = new THREE.PlaneGeometry(S, S, N, N); g.rotateX(-Math.PI / 2);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) { const x = P.getX(i) + cx, z = P.getZ(i) + cz; P.setXYZ(i, x, terrainY(x, z) - 0.05, z); }
  g.computeVertexNormals();
  if (groundMesh) { scene.remove(groundMesh); groundMesh.geometry.dispose(); }
  groundMesh = new THREE.Mesh(g, groundMat); scene.add(groundMesh); gcx = cx; gcz = cz;
}

const debug = createCollisionDebug(scene, cw, { radius: 160, moveStep: 30 });
debug.enabled = true;

// ---------------------------------------------------------------- the body
const car = createCarCollider(cw, { length: 5.7, width: 2.0, height: 2.0, step: 0.5 });
const CAP = { r: 1.0, h: 2.0, step: 0.4 };
const body = { mode: 'car', p: new THREE.Vector3(), v: new THREE.Vector3(), yaw: 0, gravity: false, contact: null, grounded: false };
const carMesh = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.0, 5.7), new THREE.MeshLambertMaterial({ color: 0xd0d6de, transparent: true, opacity: 0.8 }));
carMesh.geometry.translate(0, 1, 0);
const capMesh = new THREE.Mesh(new THREE.CapsuleGeometry(CAP.r, CAP.h - 2 * CAP.r + 0.001, 6, 16), new THREE.MeshLambertMaterial({ color: 0xffb347, transparent: true, opacity: 0.8 }));
capMesh.geometry.translate(0, CAP.h / 2, 0);
scene.add(carMesh, capMesh);
const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 4, 0xff4060); scene.add(arrow); arrow.visible = false;
const rayMark = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: 0x40ff90 })); scene.add(rayMark); rayMark.visible = false;
const rayArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 3, 0x40ff90); scene.add(rayArrow); rayArrow.visible = false;

// start: an open spot near Soborna square
{
  let best = [0, 0];
  outer: for (let r = 0; r < 300; r += 3) for (let k = 0; k < 16; k++) {
    const x = Math.cos(k / 16 * Math.PI * 2) * r, z = Math.sin(k / 16 * Math.PI * 2) * r;
    if (cw.topAt(x, z).id < 0 && cw.topAt(x + 4, z).id < 0 && cw.topAt(x - 4, z).id < 0 && cw.topAt(x, z + 4).id < 0 && cw.topAt(x, z - 4).id < 0) { best = [x, z]; break outer; }
  }
  body.p.set(best[0], cw.groundHeight(best[0], best[1]) + 0.01, best[1]);
  camera.position.set(body.p.x - 18, body.p.y + 12, body.p.z - 18); controls.target.copy(body.p);
}
terrainPatch(body.p.x, body.p.z);

// ---------------------------------------------------------------- input
const keys = new Set();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyB') body.mode = body.mode === 'car' ? 'capsule' : 'car';
  if (e.code === 'KeyG') { body.gravity = !body.gravity; body.v.y = 0; }
  if (e.code === 'KeyV') debug.enabled = !debug.enabled;
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
let lastRay = null, down = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
  const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1), camera);
  const t = performance.now(), h = cw.raycast(rc.ray.origin, rc.ray.direction, 2000), us = (performance.now() - t) * 1000;
  lastRay = h ? { ...h, us } : { miss: true, us };
  rayMark.visible = rayArrow.visible = !!h;
  if (h) { rayMark.position.set(h.point.x, h.point.y, h.point.z); rayArrow.position.copy(rayMark.position); rayArrow.setDirection(new THREE.Vector3(h.normal.x, h.normal.y, h.normal.z)); }
});

// ---------------------------------------------------------------- loop
const stats = { solids: cw.count, buildings: nb, trees: map.trees.length, buildMs: Math.round(buildMs), stepUs: 0, contacts: 0, fps: 0 };
const out = {}, capOut = {}, prev = new THREE.Vector3(), fwd = new THREE.Vector3();
let last = performance.now(), fpsN = 0, fpsT = 0, hudT = 0;
function step(dt) {
  const fast = keys.has('ShiftLeft') || keys.has('ShiftRight'), sp = fast ? 40 : 10;
  if (keys.has('KeyQ')) body.yaw += 1.8 * dt;
  if (keys.has('KeyE')) body.yaw -= 1.8 * dt;
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const rx = -fwd.z, rz = fwd.x;
  const ix = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), iz = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  body.v.x = (fwd.x * ix + rx * iz) * sp; body.v.z = (fwd.z * ix + rz * iz) * sp;
  if (body.gravity) body.v.y -= 9.81 * dt; else body.v.y = ((keys.has('Space') ? 1 : 0) - (keys.has('KeyC') ? 1 : 0)) * sp;
  prev.copy(body.p);
  const t = performance.now();
  if (body.mode === 'car') {
    const r = car.move(body.p, body.yaw, body.v.x * dt, body.v.y * dt, body.v.z * dt, out);
    if (r.hit) slideVelocity(body.v, { x: r.nx, y: r.ny, z: r.nz });
    if (r.grounded && body.v.y < 0) body.v.y = 0;
    body.contact = r.hit ? { n: [r.nx, r.ny, r.nz], depth: r.depth, id: r.id, kind: cw.kindOf(r.id) } : null;
    body.grounded = r.grounded; body.groundY = r.groundY;
  } else { // capsule: sub-stepped horizontal push-out + support
    const n = Math.max(1, Math.ceil(body.v.length() * dt / 0.3)); body.contact = null;
    for (let i = 0; i < n; i++) {
      const y0 = body.p.y;
      body.p.addScaledVector(body.v, dt / n);
      const c = cw.pushCylinder(body.p, CAP.r, CAP.h, CAP.step, capOut);
      if (c) { body.contact = { n: [c.nx, 0, c.nz], depth: c.depth, id: c.id, kind: cw.kindOf(c.id) }; slideVelocity(body.v, { x: c.nx, y: 0, z: c.nz }); }
      const g = cw.groundHeight(body.p.x, body.p.z, Math.max(y0, body.p.y) + CAP.step);
      const ceil = cw.ceilingAt(body.p.x, body.p.z, y0 + CAP.h - 1e-6);
      if (body.p.y + CAP.h > ceil) { body.p.y = ceil - CAP.h; if (body.v.y > 0) body.v.y = 0; }
      if (body.p.y < g) { body.p.y = g; if (body.v.y < 0) body.v.y = 0; }
      body.groundY = g;
    }
    body.grounded = body.p.y <= body.groundY + 0.05;
  }
  stats.stepUs = Math.round((performance.now() - t) * 1000);
  if (body.contact) stats.contacts++;
  // camera follows
  camera.position.add(prev.subVectors(body.p, prev)); controls.target.copy(body.p);
  if (Math.hypot(body.p.x - gcx, body.p.z - gcz) > 250) terrainPatch(body.p.x, body.p.z);
}
function frame() {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  step(dt);
  carMesh.visible = body.mode === 'car'; capMesh.visible = !carMesh.visible;
  const m = carMesh.visible ? carMesh : capMesh; m.position.copy(body.p); m.rotation.y = body.yaw;
  arrow.visible = !!body.contact;
  if (body.contact) { arrow.position.set(body.p.x, body.p.y + 1, body.p.z); arrow.setDirection(new THREE.Vector3(...body.contact.n)); }
  controls.update();
  debug.update(camera);
  renderer.render(scene, camera);
  fpsN++; fpsT += dt; if (fpsT > 0.5) { stats.fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
  if ((hudT += dt) > 0.1) { hudT = 0; drawHud(); }
  requestAnimationFrame(frame);
}
function drawHud() {
  const c = body.contact, f = (v) => v.toFixed(2), r = lastRay;
  hud.textContent = [
    `тіл колізії: ${stats.solids}  (будівель ${stats.buildings}, дерев ${stats.trees})`,
    `побудова: ${stats.buildMs} мс   кадр: ${stats.fps} fps`,
    `тіло: ${body.mode === 'car' ? 'авто 5.7×2×2 м' : 'капсула r=1 h=2'}   гравітація: ${body.gravity ? 'так' : 'ні'}`,
    `позиція: ${f(body.p.x)}, ${f(body.p.y)}, ${f(body.p.z)}`,
    `опора: ${f(body.groundY ?? 0)}   на опорі: ${body.grounded ? 'так' : 'ні'}`,
    `контакт: ${c ? `${c.kind} #${c.id}  n=(${c.n.map(f).join(', ')})  глибина ${f(c.depth)}` : '—'}`,
    `крок колізії: ${stats.stepUs} мкс   каркасів: ${debug.lineCount}`,
    `промінь: ${!r ? '—' : r.miss ? `промах (${r.us.toFixed(0)} мкс)` : `${r.kind} ${f(r.distance)} м, n=(${f(r.normal.x)}, ${f(r.normal.y)}, ${f(r.normal.z)}) (${r.us.toFixed(0)} мкс)`}`,
  ].join('\n');
}
window.__demo = { stats, cw, body, car, debug };
requestAnimationFrame(frame);
