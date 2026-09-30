// Car demo: the flying car on the flat test world (src/game/testworld.js: roads, box town, launch ramp, kicker, wall,
// bollards, a ramp up onto a garage roof, rammable crates, the river), with the HUD and the missions (courier, tour).
// Buttons teleport to the test spots (Esc brings them back). window.__demo = { ctx, car, hud, missions, world, stats() }.
import * as THREE from 'three';
import { createCore } from '../src/main.js';
import { warmupShaders } from '../src/render/renderer.js';
import { createTestWorld } from '../src/game/testworld.js';
import { createCar } from '../src/game/car/car.js';
import { createHud } from '../src/ui/hud.js';
import { createMissions } from '../src/game/missions.js';

const ctx = createCore({ container: document.getElementById('app'), quality: 'medium' });
const { scene, camera, input } = ctx;
const world = createTestWorld({ scene });
ctx.groundAt = (x, z) => world.groundHeight(x, z);
const car = createCar({ scene, world, camera, input });
const hud = createHud({ player: car, world, camera });
car.hud = hud;
const missions = createMissions({ world, player: car, hud, scene, input });
ctx.addSystem((dt) => car.update(dt), 'car');
ctx.addSystem((dt) => world.update(dt, camera), 'world');
ctx.addSystem((dt) => missions.update(dt), 'missions');
ctx.addSystem((dt) => { if (input.pressed('help')) hud.toggleHelp(); hud.update(dt); }, 'hud');

const go = document.getElementById('go');
const C = world.course;
const spots = {
  spawn: () => car.teleport(world.carSpawn, 0),
  ramp: () => car.teleport(new THREE.Vector3(3, 0, 120), 0),
  kicker: () => car.teleport(new THREE.Vector3(C.kicker[0], 0, 2), 0),
  wall: () => car.teleport(new THREE.Vector3(C.wall[0], 0, 50), 0),
  roofRamp: () => car.teleport(new THREE.Vector3(C.roofRamp[0], 0, 30), 0),
  crates: () => car.teleport(new THREE.Vector3(C.crates[0], 0, 20), 0),
  water: () => car.teleport(new THREE.Vector3(3, 0, 1180), 0),
  air: () => { car.teleport(new THREE.Vector3(0, 0, -200), 0); const s = car.state; s.p.y = 80; s.grounded = false; s.wing = s.turb = 1; s.v.set(0, 0, 45); },
};
go.addEventListener('click', (e) => {
  const to = e.target.dataset?.to;
  if (to) spots[to]();
  if (to || e.target.id === 'close') { go.classList.add('off'); input.lock(); }
});
addEventListener('keydown', (e) => { if (e.code === 'Escape') go.classList.remove('off'); });

const statsEl = document.getElementById('stats');
let fpsN = 0, fpsT = 0, fps = 0, statT = 0;
function stats() {
  const s = car.state, v = car.velocity;
  return { fps, kmh: Math.round(Math.hypot(v.x, v.z) * 3.6), mode: car.mode, alt: +(s.alt || 0).toFixed(1), wing: +s.wing.toFixed(2),
    pos: [s.p.x, s.p.y, s.p.z].map((q) => +q.toFixed(1)), cam: car.cam.mode, money: missions.money, mission: missions.active?.type || null,
    cratesAwake: world.crates.filter((c) => !c.sleep).length, ...hud.stats() };
}
ctx.addSystem((dt) => {
  fpsN++; fpsT += dt; if (fpsT > 0.5) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
  if ((statT += dt) > 0.25) { statT = 0; const st = stats(); statsEl.textContent = `${st.fps} fps · ${st.kmh} км/год · ${st.mode} · вис ${st.alt} м · (${st.pos.join(', ')}) · камера ${st.cam} · місія ${st.mission || '—'}`; }
}, 'demoStats');

ctx.sky.update(0, camera);
await warmupShaders(ctx.renderer, scene, camera);
ctx.start();
window.__demo = { ctx, car, hud, missions, world, stats };
