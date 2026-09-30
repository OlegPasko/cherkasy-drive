// World demo: the whole Cherkasy city (src/world/cherkasy/city.js) under the render core (sky, daylight, shadows,
// post) with a free-fly camera and no car. Loading progress goes to the overlay.
//   window.__demo = { ctx, world, fly, stats(), goto(x, y, z, tx, tz), probe(), bench(seconds, speed = 60 m/s) -> Promise<{ avgFps, p5Fps, worstMs }> (a 900 m circle over the centre) }
//   probe(): a car-sized box pushed forward from the camera in 0.25 m steps (collision.pushBox) + a ray along the view
// URL: the world's own params (?notraffic, ?nopeds, ?coll, ?cam=...) and ?spot=<index> for the start view
import * as THREE from 'three';
import { createCore } from '../src/main.js';
import { createFlyCamera } from '../src/core/flycam.js';
import { warmupShaders } from '../src/render/renderer.js';
import { buildCherkasy } from '../src/world/cherkasy/city.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const overlay = $('loading');
const say = (f, text) => { overlay.querySelector('.msg').textContent = text; overlay.querySelector('.bar i').style.width = `${Math.round(f * 100)}%`; };

const ctx = createCore({ container: $('app') });
const { scene, camera, input, renderer } = ctx;
const tLoad = performance.now();
const world = await buildCherkasy({ scene, renderer, onProgress: say });
ctx.groundAt = (x, z) => world.groundHeight(x, z);

const fly = createFlyCamera(camera, input, { speed: 40, groundAt: (x, z) => world.groundHeight(x, z, camera.position.y + 2) });
const SPOTS = [
  ['Над центром', [-600, 420, 900], [0, 250]],
  ['Соборна площа', [-120, 40, 160], [60, -40]],
  ['Вул. Сержанта Жужоми', [world.spawn.x, world.spawn.y + 1.7, world.spawn.z + 6], [831, 530]],
  ['Набережна', [700, 60, -600], [200, -300]],
  ['Пагорб Слави', [300, 120, 900], [600, 500]],
  ['Мікрорайони', [-2400, 350, 2600], [-1200, 1200]],
];
function goto(x, y, z, tx, tz) {
  const ty = world.groundHeight(tx, tz) + 10;
  fly.setPose(new THREE.Vector3(x, y, z), Math.atan2(-(tx - x), -(tz - z)), Math.atan2(ty - y, Math.hypot(tx - x, tz - z)));
  ctx.post.resetHistory();
}
const first = SPOTS[+(Q.get('spot') ?? 0)] ?? SPOTS[0];
goto(...first[1], ...first[2]);
for (const [name, p, t] of SPOTS) {
  const b = document.createElement('button'); b.textContent = name; b.onclick = () => goto(...p, ...t);
  $('panel').append(b);
}
const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; $('panel').append(b); return b; };
btn('Колізії', () => { world.geoDebug.enabled = !world.geoDebug.enabled; });
btn('Зонд у стіну', () => { lastProbe = probe(); });
btn('Ніч / день', () => ctx.daylight.setPreset(ctx.daylight.state.preset === 'night' ? 'day' : 'night', 2));

// collision probe: a 5.7 x 2 x 2 m box driven forward along the view (horizontal) until the static world pushes back
let lastProbe = null;
function probe() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const h = Math.hypot(dir.x, dir.z) || 1, fx = dir.x / h, fz = dir.z / h;
  const box = { x: camera.position.x, y: camera.position.y - 1, z: camera.position.z, yaw: Math.atan2(fx, fz), hl: 2.85, hw: 1, h: 2, step: 0.4 };
  const out = {};
  let res = { hit: false, travelled: 0 };
  for (let s = 0; s < 400; s += 0.25) {
    const wx = camera.position.x + fx * s, wz = camera.position.z + fz * s;
    box.x = wx; box.z = wz; box.y = camera.position.y - 1;
    const c = world.collision.pushBox(box, out);
    if (c && c.hit) { res = { hit: true, travelled: +s.toFixed(2), kind: world.collision.kindOf(c.id), id: c.id, pushedBack: +Math.hypot(box.x - wx, box.z - wz).toFixed(3), normal: [c.nx, c.nz].map((v) => +v.toFixed(2)) }; break; }
  }
  const ray = world.raycast(camera.position, dir, 2000);
  res.ray = ray ? { distance: +ray.distance.toFixed(2), kind: ray.kind, id: ray.id } : null;
  console.log('[world demo] probe', res);
  return res;
}
input.bind('collDebug', ['KeyK']); input.bind('probe', ['KeyP']);

// ------------------------------------------------------------------------------------------------ loop
let fps = 60, statT = 0;
const frameTimes = [];
ctx.addSystem(fly.update, 'flycam');
ctx.addSystem((dt) => {
  if (input.pressed('collDebug')) world.geoDebug.enabled = !world.geoDebug.enabled;
  if (input.pressed('probe')) lastProbe = probe();
  world.update(dt, camera);
  if (dt > 0) { fps += (1 / dt - fps) * 0.05; frameTimes.push(dt); if (frameTimes.length > 600) frameTimes.shift(); }
  if ((statT -= dt) <= 0) { statT = 0.5; $('stats').textContent = statsText(); }
}, 'world');

function stats() {
  const s = world.stats(), r = renderer.info.render, p = camera.position;
  return { fps: Math.round(fps), calls: r.calls, tris: r.triangles, loadMs: s.loadMs, pageMs: Math.round(readyAt - tLoad), stages: s.stages, solids: s.solids,
    trees: s.trees.items, treeCalls: s.trees.drawCalls, cars: s.traffic?.cars ?? 0, drawnCars: s.traffic?.drawn ?? 0, people: s.people?.walkers ?? 0,
    peopleDrawn: s.people?.drawn ?? null, modules: s.modules.length, sites: s.sites, cam: [p.x, p.y, p.z].map(Math.round), probe: lastProbe };
}
function statsText() {
  const s = stats();
  return [`fps ${s.fps}   виклики ${s.calls}   трикутники ${(s.tris / 1e6).toFixed(2)} M`,
    `завантаження ${(s.loadMs / 1000).toFixed(1)} с (сторінка ${(s.pageMs / 1000).toFixed(1)} с)`,
    `колізії ${s.solids} тіл   дерев ${s.trees}`, `машин ${s.cars} (видно ${s.drawnCars})   людей ${s.people}`,
    `місць ${s.sites}, модулів ${s.modules}`, `камера ${s.cam.join(', ')}`,
    s.probe ? `зонд: ${s.probe.hit ? `стіна (${s.probe.kind}) за ${s.probe.travelled} м` : 'нічого'}` : ''].join('\n');
}
// fly a fixed loop over the centre for `sec` seconds and report frame rates
async function bench(sec = 12, speed = 60) {
  const t0 = performance.now(), path = (t) => { const a = t * speed / 900; return [-300 + Math.cos(a) * 900, 380, 500 + Math.sin(a) * 900]; };
  const dts = [];
  let last = performance.now();
  fly.enabled = false;
  await new Promise((res) => {
    const tick = () => {
      const now = performance.now(), t = (now - t0) / 1000;
      dts.push(now - last); last = now;
      const [x, y, z] = path(t);
      camera.position.set(x, y, z); camera.lookAt(-300, 60, 500);
      if (t < sec) requestAnimationFrame(tick); else res();
    };
    requestAnimationFrame(tick);
  });
  fly.enabled = true;
  dts.shift(); dts.sort((a, b) => a - b);
  const avg = dts.reduce((a, b) => a + b, 0) / dts.length;
  return { frames: dts.length, avgFps: +(1000 / avg).toFixed(1), p5Fps: +(1000 / dts[Math.floor(dts.length * 0.95)]).toFixed(1), worstMs: +dts[dts.length - 1].toFixed(1) };
}

say(0.98, 'Компілюємо шейдери…');
ctx.sky.update(0, camera);
await warmupShaders(renderer, scene, camera);
const readyAt = performance.now();
ctx.start();
overlay.classList.add('done');
setTimeout(() => overlay.remove(), 700);
window.__demo = { ctx, world, fly, stats, goto, probe, bench };
