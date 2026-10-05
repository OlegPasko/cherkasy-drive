// Headless checks for the game layer: the test world, the car's physics against it, and the mission flow with fines.
// Run: node tests/game.test.mjs   (no browser; a tiny canvas / storage stub stands in for the DOM)
import * as THREE from 'three';

// ---------------------------------------------------------------- DOM stubs (the car model paints canvas textures)
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }) };
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { createTestWorld } = await import('../src/game/testworld.js');
const { createCar } = await import('../src/game/car/car.js');
const { createMissions } = await import('../src/game/missions.js');

let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ` – ${info}` : ''}`); if (!ok) fails++; };

// scripted input with the core/input.js frame shape
function fakeInput() {
  const f = { move: { x: 0, y: 0 }, look: { dx: 0, dy: 0 }, throttle: 0, pitch: 0, jump: false, drop: false, sprint: false, cameraPressed: false, resetPressed: false };
  return { f, poll: () => f, set(o) { Object.assign(f, o); f.move.y = f.throttle - f.pitch; } };
}

const scene = new THREE.Scene();
const world = createTestWorld({ scene });
const camera = new THREE.PerspectiveCamera(60, 1.6, 0.3, 5000);
const input = fakeInput();
const car = createCar({ scene, world, camera, input });
const run = (sec, fn) => { for (let t = 0; t < sec; t += 1 / 60) { fn?.(); car.update(1 / 60); world.update(1 / 60); } };
const kmh = () => Math.hypot(car.velocity.x, car.velocity.z) * 3.6;
const S = car.state, V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- world
check('flat ground at the spawn', Math.abs(world.groundHeight(3, 12)) < 1e-6);
check('garage roof supports at 9 m', Math.abs(world.groundHeight(150, 150, 20) - 9) < 1e-6);
check('river bed below the water line', world.groundHeight(0, 1300) < -1);
const hit = world.raycast(V(90, 1, 60), V(0, 0, 1), 100);
check('ray hits the course wall', !!hit && Math.abs(hit.distance - 40) < 0.1, hit ? hit.distance.toFixed(2) : 'miss');

// ---------------------------------------------------------------- car
car.teleport(V(3, 0, 12), 0);
input.set({ throttle: 1 });
run(4);
check('accelerates on the road', kmh() > 100 && S.grounded, `${kmh().toFixed(0)} km/h`);
input.set({ throttle: 0 });
car.teleport(V(3, 0, 12), 0); input.set({ throttle: 1, sprint: true });
let air = false; run(6, () => { air ||= !S.grounded; });
check('Shift deploys the wings and takes off', air && S.wing > 0.95, `wing ${S.wing.toFixed(2)} alt ${S.alt.toFixed(1)}`);
input.set({ throttle: 1, sprint: false, pitch: -1 });
const y0 = S.p.y; run(2);
check('arrow down climbs in the air', S.p.y > y0 + 5, `${y0.toFixed(1)} -> ${S.p.y.toFixed(1)}`);
input.set({ throttle: 0, pitch: 0 });
car.teleport(V(150, 0, 150), 0); S.p.y = 20; S.grounded = false; S.wing = S.turb = 0; S.v.set(0, 0, 2);
run(2);
check('lands on the garage roof', S.grounded && Math.abs(S.p.y - 9) < 0.05, `y ${S.p.y.toFixed(2)}`);
car.teleport(V(90, 0, 40), 0); input.set({ throttle: 1 });
const evs = []; let hitZ = null;
car.onEvents = (e) => { evs.push(...e); if (hitZ === null && e.some((q) => q.type === 'crash')) hitZ = S.p.z; };
run(5);
// head-on it stops with the nose (centre + 2.95 m) at the wall face z = 100, then the push-off turns it to scrape along
check('the wall stops the car', hitZ !== null && hitZ < 97.2 && S.p.z < 99, `hit at z ${hitZ?.toFixed(2)}`);
check('hitting the wall reports a crash', evs.some((e) => e.type === 'crash' && e.severity > 0.5));
car.teleport(V(72, 0, 20), 0); run(4);
check('rammed crates fly', world.crates.some((c) => !c.sleep || c.p.y > 1.5 || Math.hypot(c.p.x - 72, c.p.z - 72) > 6));
car.teleport(V(3, 0, 180), 0); run(10);
check('launch ramp: airborne and back down', S.p.z > 380 && S.grounded, `z ${S.p.z.toFixed(0)}`);
input.set({ throttle: 0 }); car.onEvents = null;
car.cam.update(1 / 60, S, [{ type: 'splat', n: 2 }, { type: 'takeoff' }, { type: 'crash', severity: 0.4 }]);
check('camera stays finite through events without a severity', [camera.position.x, camera.position.y, camera.quaternion.w].every(Number.isFinite));

// ---------------------------------------------------------------- missions (no HUD, no traffic / people)
store.set('cherkasy.money', '100');
const ms = createMissions({ world, player: car, scene });
car.teleport(V(3, 0, 12), 0);
check('available types without traffic / people', ms.available().join() === 'courier,tour', ms.available().join());
check('money restored from storage', ms.money === 100);
const tickM = (sec) => { for (let t = 0; t < sec; t += 1 / 60) { car.update(1 / 60); ms.update(1 / 60); } };
tickM(3);
check('the dispatcher offers a call', ms.offers.length === 1, ms.offers[0]?.type);
check('courier starts', ms.start('courier') && ms.active?.type === 'courier');
car.onEvents([{ type: 'crash', severity: 1 }]); tickM(0.1);
car.onEvents([{ type: 'crash', severity: 1 }]); tickM(0.1);
car.onEvents([{ type: 'crash', severity: 1 }]); tickM(0.1);
check('a broken parcel fails the courier with a fine', !ms.active && ms.money === 100 - 250, `money ${ms.money}`);
check('fine persisted', store.get('cherkasy.money') === '-150');
tickM(6);
let started = false;
for (let k = 0; k < 8 && !started; k++) started = ms.start('tour');
check('tour starts (monument POIs)', started && ms.active?.type === 'tour');
const m = ms.active;
const rings = scene.children.filter((o) => o.geometry?.type === 'TorusGeometry'); // in route order
for (let g = 0; g < 8 && ms.active === m; g++) { // fly through each ring by teleporting into it
  const r = rings[m.i];
  car.teleport(V(r.position.x, 0, r.position.z), 0); S.p.y = r.position.y - 0.95; S.grounded = false; S.wing = S.turb = 1; S.v.set(0, 0, 0);
  car.update(1 / 60); ms.update(1 / 60);
}
check('tour completes and pays', !ms.active && ms.money > -150, `money ${ms.money}`);

// the missions switch (J / the HUD chip): off drops the running mission and the call quietly, no new call comes, it is kept
ms.start('courier');
const before = ms.money;
check('switching missions off', ms.setEnabled(false) === false && !ms.active && !ms.offers.length && ms.money === before);
check('the choice is stored', store.get('cherkasy.missions') === 'off');
tickM(12);
check('no calls while off', !ms.offers.length && !ms.start('courier'));
check('a new dispatcher reads it back', createMissions({ world, player: car, scene }).enabled === false);
ms.toggle(); tickM(5);
check('back on: a call comes in again', ms.enabled && ms.offers.length === 1 && store.get('cherkasy.missions') === 'on');

// the light plane's engine: heard only right next to it, never from the ground under its ~150-190 m loop
{
  const { planeGain, PLANE_NEAR, PLANE_FAR } = await import('../src/audio/game.js');
  const g = [0, 30, 50, 75, 100, 119, 120, 150, 190].map(planeGain);
  check('plane engine: full up close, silent by 120 m', g[0] === 1 && g[1] === 1 && g[6] === 0 && g[7] === 0 && g[8] === 0 && g.every((v, i) => !i || v <= g[i - 1]),
    `near ${PLANE_NEAR} m, far ${PLANE_FAR} m: ${g.map((v) => v.toFixed(2)).join(' ')}`);
}

console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
process.exit(fails ? 1 : 0);
