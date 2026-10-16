// The Roadster (the second player car): unlock and choice (game/garage.js), the swap keeping the car's state, the gas
// jump (a full charge clears ~48 m), the hover, the top speed (~1.5x the Cybertruck's limiter), the wedge ram that throws
// struck cars up, the rear wing (up while driving, folded when stopped or flying) and the model's budget. Run: node tests/roadster.test.mjs   (headless: canvas / storage stubs)
import * as THREE from 'three';

const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }) };
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { createTestWorld } = await import('../src/game/testworld.js');
const { createCar, CARS, jumpHeight } = await import('../src/game/car/car.js');
const { createGarage, isUnlocked, CAR_KEY } = await import('../src/game/garage.js');
const { createWrecks } = await import('../src/npc/wrecks.js');
const { buildRoadsterModel, WING_UP, WING_DOWN } = await import('../src/game/car/roadster.js');
const { buildCarModel } = await import('../src/game/car/model.js');

let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ` – ${info}` : ''}`); if (!ok) fails++; };

function fakeInput() {
  const f = { move: { x: 0, y: 0 }, look: { dx: 0, dy: 0 }, throttle: 0, pitch: 0, jump: false, drop: false, sprint: false, cameraPressed: false, resetPressed: false };
  return { f, poll: () => f, set(o) { Object.assign(f, o); f.move.y = f.throttle - f.pitch; } };
}
const scene = new THREE.Scene(), world = createTestWorld({ scene }), camera = new THREE.PerspectiveCamera(60, 1.6, 0.3, 5000);
const input = fakeInput();
const car = createCar({ scene, world, camera, input });
const S = car.state, V = (x, y, z) => new THREE.Vector3(x, y, z);
const run = (sec, fn) => { for (let t = 0; t < sec; t += 1 / 60) { fn?.(); car.update(1 / 60); world.update(1 / 60); } };
const hs = () => Math.hypot(S.v.x, S.v.z);

// ---------------------------------------------------------------- unlock and choice
check('isUnlocked follows the sights', !isUnlocked({ visited: 3, total: 4 }) && isUnlocked({ visited: 4, total: 4 }) && !isUnlocked({ visited: 0, total: 0 }));
const ex = { visited: 38, total: 40 }, banners = [], chips = [];
const hud = { mission: { banner: (t, sub) => banners.push(`${t} | ${sub}`) }, setGarage: (g) => chips.push(g) };
let gar = createGarage({ car, explore: ex, hud, storage: localStorage });
check('starts in the Cybertruck', car.kind === 'cybertruck' && gar.kind === 'cybertruck');
check('locked: V does not switch', gar.toggle() === false && car.kind === 'cybertruck');
check('locked: says to find every sight, with the count left', /усі пам’ятки/.test(banners.at(-1)) && /Залишилось 2 з 40/.test(banners.at(-1)), banners.at(-1));
check('the chip shows the lock', chips.at(-1)?.unlocked === false && chips.at(-1)?.left === 2);
ex.visited = 40; banners.length = 0;
for (let t = 0; t < 4; t += 0.1) gar.update(0.1);
check('the last sight announces the unlock at once (after the sights banner)', banners.some((b) => /Roadster відкрито/.test(b)), banners.join(' / '));
check('the chip pulses on unlock', chips.some((c) => c.unlocked && c.fresh));
car.teleport(V(3, 0, 12), 0);
input.set({ throttle: 1 }); run(2);
const p0 = S.p.clone(), v0 = S.v.clone(), yaw0 = S.yaw;
check('unlocked: V switches to the Roadster', gar.toggle() === true && car.kind === 'roadster' && car.model.object.name === 'PlayerRoadster');
check('the swap keeps position, velocity and heading', S.p.distanceTo(p0) < 1e-9 && S.v.distanceTo(v0) < 1e-9 && S.yaw === yaw0, `v ${v0.length().toFixed(1)}`);
check('the choice is stored', store.get(CAR_KEY) === 'roadster');
check('one car node in the scene, the gas puffs added', scene.children.filter((o) => o.name === 'PlayerCar').length === 1 && !!car.model.fx?.parent);
gar = createGarage({ car: createCar({ scene: new THREE.Scene(), world, camera, input }), explore: ex, storage: localStorage });
check('a new start restores the Roadster while it stays earned', gar.kind === 'roadster');
ex.visited = 39;
gar = createGarage({ car: createCar({ scene: new THREE.Scene(), world, camera, input }), explore: ex, storage: localStorage });
check('a new sight added later locks it again (back in the Cybertruck)', gar.kind === 'cybertruck' && !gar.unlocked);
ex.visited = 40;

// ---------------------------------------------------------------- the gas jump
input.set({ throttle: 0 });
car.teleport(V(3, 0, 12), 0);
input.set({ sprint: true }); run(10.3);
check('Shift charges in ~10 s on the ground', S.grounded && S.charge === 1 && S.jumpH >= 45, `charge ${S.charge.toFixed(2)} jump ${S.jumpH.toFixed(1)} m`);
const evs = []; car.onEvents = (e) => evs.push(...e);
input.set({ sprint: false });
let top = 0; run(6, () => { top = Math.max(top, S.p.y); });
check('a full charge leaps >= 45 m', top >= 45, `apex ${top.toFixed(1)} m`);
check('the jump reports a gas take-off', evs.some((e) => e.type === 'takeoff' && e.gas));
check('falls slowly on the jets (glide)', !S.grounded && S.v.y > -6 && S.v.y < -3, `vy ${S.v.y.toFixed(1)}`);
input.set({ sprint: true }); run(3);
check('Shift in the air hovers / climbs slowly', S.v.y > 2 && S.v.y < 5 && S.gasDown > 0.4, `vy ${S.v.y.toFixed(1)} gas ${S.gasDown.toFixed(2)}`);
input.set({ sprint: false, throttle: 1 }); run(4);
check('W pushes forward on the rear jets', hs() > 20 && S.gasRear > 0.8, `${(hs() * 3.6).toFixed(0)} km/h`);
input.set({ throttle: 0 }); let landed = false; run(40, () => { landed ||= S.grounded; });
check('lands softly', landed && evs.filter((e) => e.type === 'land').every((e) => e.severity < 0.3));
car.teleport(V(3, 0, 12), 0); top = 0;
input.set({ sprint: true }); run(0.1); input.set({ sprint: false }); run(2, () => { top = Math.max(top, S.p.y); });
check('a tap is a hop', top > 1 && top < 3, `${top.toFixed(2)} m`);
// a kerb or a bump mid-charge: the pressure holds, and a release while the wheels are off fires on touchdown
const bump = () => { S.p.y += 0.25; S.grounded = false; S.airT = 0; S.v.y = 1; };
car.teleport(V(3, 0, 12), 0);
input.set({ sprint: true }); run(6); const c6 = S.charge; bump(); run(0.2);
check('a bump while charging keeps the charge', S.charging && S.charge >= c6, `${c6.toFixed(2)} -> ${S.charge.toFixed(2)}`);
run(1);
check('…and it goes on after the wheels touch down', S.grounded && S.charge > c6 + 0.08, S.charge.toFixed(2));
const cB = S.charge; bump(); input.set({ sprint: false }); top = 0; run(3, () => { top = Math.max(top, S.p.y); });
check('a release mid-bump jumps on touchdown', top > jumpHeight(cB) * 0.85, `apex ${top.toFixed(1)} m for ${jumpHeight(cB).toFixed(1)} m`);
car.teleport(V(3, 0, 12), 0);
check('jumpHeight 0 / 1', Math.abs(jumpHeight(0) - 1.5) < 1e-9 && jumpHeight(1) >= 45);
car.onEvents = null;
const gasFx = car.model.gas; car.teleport(V(3, 0, 12), 0); input.set({ sprint: true }); run(1); input.set({ sprint: false });
const puffs = gasFx.live; car.swap('cybertruck'); car.swap('roadster');
check('a swap clears the gas puffs (none frozen in place on return)', puffs > 0 && gasFx.live === 0, `${puffs} -> ${gasFx.live}`);

// ---------------------------------------------------------------- top speed (a 2 km straight, wrapped)
function topSpeed(kind) {
  car.swap(kind); car.teleport(V(-1100, 0, -400), Math.PI / 2); input.set({ throttle: 1, sprint: false });
  run(45, () => { if (S.p.x > 1000) S.p.x -= 2000; });
  input.set({ throttle: 0 });
  return hs();
}
const vR = topSpeed('roadster'), vC = topSpeed('cybertruck');
check('Roadster top speed ~1.5x the Cybertruck limiter (58 m/s)', vR / CARS.cybertruck.P.vRoad > 1.4 && vR / CARS.cybertruck.P.vRoad < 1.6, `${(vR * 3.6).toFixed(0)} km/h vs CT ${(vC * 3.6).toFixed(0)} km/h (limiter ${(58 * 3.6).toFixed(0)})`);
check('the Cybertruck is unchanged', CARS.cybertruck.gas === false && car.kind === 'cybertruck' && Math.abs(vC - 46.6) < 1.5, `${vC.toFixed(1)} m/s`);
car.swap('roadster'); car.teleport(V(-1100, 0, -400), Math.PI / 2); input.set({ throttle: 1 });
let t100 = 0; for (let t = 0; t < 5 && hs() < 100 / 3.6; t += 1 / 60) { car.update(1 / 60); t100 = t; }
check('0–100 km/h in about 2 s', t100 > 1.6 && t100 < 2.8, `${t100.toFixed(2)} s`);
input.set({ throttle: 0 });

// ---------------------------------------------------------------- the wedge ram
function rammed(wedge, o = {}, speed = 20) {
  const c = { type: 'sedan', len: 4.5, wid: 1.8, h: 1.45, x: 3.3, y: 0, z: 0, ry: -Math.PI / 2, v: 0, color: 0, ...o };
  const W = createWrecks({ query: () => [c] });
  const v = V(speed, 0, 0); // 72 km/h along +x into it
  const r = W.ram({ x: 0, y: 0, z: 0, fx: 1, fz: 0, hl: 2.55, hw: 1.06, h: wedge ? 1.15 : 1.8, v, mass: 12000, wedge });
  const acc = { x: 0, z: 0, n: 0, top: -Infinity, vel: null };
  W.collide({ x: 1.8, y: 0, z: 0 }, 1.06, 1.15, acc); // the player's front circle still overlaps the struck car
  return { r, w: W.list[0], pushed: acc.n > 0 };
}
const flat = rammed(0), wedge = rammed(1);
check('a flat front knocks the car mostly ahead', flat.w && flat.w.v.y < 6, `vy ${flat.w?.v.y.toFixed(1)}`);
check('the wedge launches it up and over', wedge.w && wedge.w.v.y > 7 && wedge.w.v.y > 1.5 * flat.w.v.y, `vy ${wedge.w?.v.y.toFixed(1)}`);
check('…tumbling end over end', wedge.w && Math.abs(wedge.w.w.z) > 1.5, `wz ${wedge.w?.w.z.toFixed(2)}`);
check('…and it does not stop the Roadster like a wall (no push-out at once)', !wedge.pushed && flat.pushed);
const bus = rammed(1, { type: 'bus', len: 12.67, wid: 2.6, h: 3.11, x: 3.6 }); // broadside, like the sedan
const busFlat = rammed(0, { type: 'bus', len: 12.67, wid: 2.6, h: 3.11, x: 3.6 });
const extra = (a, b) => a.w.v.y - b.w.v.y; // what the wedge adds over a flat front
check('a bus barely rises over the wedge (the lift fades with mass)', bus.w && busFlat.w && extra(bus, busFlat) < 0.3 * extra(wedge, flat), `+${extra(bus, busFlat).toFixed(1)} m/s on the bus vs +${extra(wedge, flat).toFixed(1)} on a car`);
check('…stays solid and still costs speed', bus.pushed && Math.abs(bus.r.dv.x) > Math.abs(wedge.r.dv.x));
const nudge = rammed(1, {}, 2.5);
check('a slow nudge keeps the struck car solid', nudge.w && nudge.pushed, `knocked ${!!nudge.w}`);
check('…and the Roadster keeps more of its speed', Math.abs(wedge.r.dv.x) < Math.abs(flat.r.dv.x), `${wedge.r.dv.x.toFixed(2)} vs ${flat.r.dv.x.toFixed(2)}`);

// ---------------------------------------------------------------- the rear wing: up while driving, folded when stopped / flying
{
  const m = buildRoadsterModel(), feed = (speed, sec, air = false) => { for (let t = 0; t < sec; t += 1 / 60) m.set({ steer: 0, wheelAngle: 0, speed, air }, 1 / 60); return m.wing; };
  check('the wing starts folded', m.wing === 0 && !m.object.getObjectByName('RdWing')?.visible);
  const part = feed(WING_UP + 1, 0.35);
  check('…deploys smoothly above ~15 km/h on the ground', part > 0.2 && part < 0.8 && feed(WING_UP + 1, 1) > 0.99, `${part.toFixed(2)} after 0.35 s`);
  check('…stays up between the thresholds (no flicker)', feed((WING_UP + WING_DOWN) / 2, 2) > 0.99);
  check('…folds when slowing to a stop', feed(WING_DOWN - 0.5, 1.5) < 0.01 && feed(0, 0.5) === 0);
  check('…does not rise again between the thresholds', feed((WING_UP + WING_DOWN) / 2, 2) === 0);
  feed(30, 2); check('…folds in flight, even fast', feed(30, 1.5, true) < 0.01);
  input.set({ throttle: 0, sprint: false });
  car.swap('roadster'); car.teleport(V(-1100, 0, -400), Math.PI / 2); input.set({ throttle: 1 }); run(3);
  check('in the game: up while driving', S.grounded && hs() > WING_UP && car.model.wing > 0.99, `${(hs() * 3.6).toFixed(0)} km/h, wing ${car.model.wing.toFixed(2)}`);
  input.set({ throttle: 0 }); S.v.set(0, 0, 0); run(2);
  check('in the game: folded when parked', car.model.wing === 0);
  input.set({ sprint: true }); run(3); input.set({ sprint: false, throttle: 1 }); run(2.5);
  check('in the game: folded in flight', !S.grounded && hs() > WING_UP && car.model.wing < 0.01, `alt ${S.p.y.toFixed(0)} m, ${(hs() * 3.6).toFixed(0)} km/h, wing ${car.model.wing.toFixed(2)}`);
  input.set({ throttle: 0 }); run(40, () => {});
}

// ---------------------------------------------------------------- model budget (the Cybertruck's range)
const count = (m) => { let v = 0, d = 0; m.object.traverse((o) => { if (o.isMesh) { d++; v += o.geometry.attributes.position.count; } }); return { v, d }; };
const rb = count(buildRoadsterModel()), cb = count(buildCarModel());
check('Roadster model within the Cybertruck budget', rb.v <= cb.v * 1.1 && rb.d <= cb.d + 5, `${rb.v} verts / ${rb.d} meshes vs ${cb.v} / ${cb.d}`);

console.log(fails ? `\n${fails} check(s) failed` : '\nall roadster checks passed');
process.exit(fails ? 1 : 0);
