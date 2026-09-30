// The player's flying car. createCar({ scene, world, camera, input }) -> player API
//   { update(dt), object, state, model, cam, position (body centre, ~0.95 m over the road), velocity, heading (camera
//     yaw), yaw, grounded, mode ('drive' | 'air'), flying, teleport(pos, yaw), reset(toSafe?), home() (back to the start),
//     setControlOverride(fn),
//     frozen, onEvents (set by missions: fn(events[]) with { type: 'crash' | 'land' | 'splat' | 'takeoff' | 'splash', severity, ram? }),
//     onSound (set by src/audio/game.js: the same events, first; the motor sound reads `state` itself),
//     hud (set by main: { setTelemetry(state, vF, camMode) } – the chase-view speed readout) }
//   world: groundHeight(x, z, yHint), raycast(o, d, max), collision (src/world/collision.js), carSpawn / spawn (+ yaw);
//     optional ram(q), collideDynamic(p, r, h), streetsAt(x, z), honk({ x, y, z, fx, fz }) (people ahead scatter; called
//     every 0.4 s while the horn is held) (see the legacy world contract in src/main.js)
//   input: src/core/input.js (poll() -> the latched frame). Night lights read nightK from src/render/daylight.js.
//
// Driving (arcade-sim): single-speed electric drive (flat torque, then constant power up to the ~209 km/h limiter), brakes / reverse, speed-sensitive steering with a lateral-grip cap (~1.2 g, a light slide when
// cranked past it at speed), handbrake drifts (rear grip drops, more yaw, the velocity lags the nose), terrain following on four wheel probes (pitch / roll from the road), kerbs up to
// ~0.4 m, drops and ramps turn into short flights. Over the river the car sinks at once below 100 km/h (a splash, then
// back on the last safe road spot); faster it skims the surface, losing speed, until it drops under that. Collides with the city solids (three circles along the car, swept
// in substeps) and with the traffic (world.collideDynamic).
// Flight kit (Shift): wings swing out of the sills and telescope, the turbines slide out of the haunches and rotate
// aft; once they lock, jet thrust pushes the car past the road top speed toward the jetpack's boost speed (85 m/s).
// The wings make lift ~ v^2: road grip fades as the car gets light, and at ~40 m/s it lifts off. In the air:
// Shift = jet, W = cruise thrust (jetpack cruise, 25 m/s), no thrust = glide (slow sink, speed bleeds slowly),
// arrow up / down = nose down / up (flight-sim pitch; Space / Ctrl / X too), A / D = bank-and-turn, S = airbrake. Climbing trades speed, diving gains it.
// A wall hit in flight stalls the wings: the car sheds its speed and drops level (no tumbling) until it lands; high up,
// W or Shift after ~1 s picks the flight back up.
// Touching down keeps the wings out while the car is fast; back at normal speed (without Shift) they fold away.
// Controls: W / S gas / brake-reverse, A / D steer, Space handbrake, Shift wings + jet, C camera (cockpit / chase),
// F horn (state.horn; the sound is src/audio/game.js), R reset (upright, back on the road), mouse look.
import * as THREE from 'three';
import { buildCarModel, DIM } from './model.js';
import { createCarCollider, pushOutCapsule } from './collide.js';
import { nightK } from '../../render/daylight.js';

const { clamp, lerp } = THREE.MathUtils;
// exponential approach of a toward b at rate r (frame-rate independent)
function damp(a, b, r, dt) { return b + (a - b) * Math.exp(-r * dt); }
// angle into (-pi, pi]
function angWrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
const G = 9.81, WATER_Y = -1.0;
const V_SKIM = 100 / 3.6; // over the river: slower than this the car sinks at once, faster it skims the surface
const P = {
  vRoad: 58,          // motor-only top speed (m/s, ~209 km/h, the Cyberbeast's limiter)
  aEngine: 10.5,      // launch acceleration (m/s^2): instant electric torque
  pw: 200,            // power / mass (W/kg ~ 630 kW / 3.1 t): a = min(aEngine, pw / v)
  aBrake: 15, aRev: 5, vRev: 9,
  cd: 0.0019, roll: 0.15, engBrake: 0.9,
  aJet: 15,           // jet thrust on the road (m/s^2); with cd: ~85 m/s top speed = the jetpack boost
  vLift: 40,          // wing lift = weight at this speed
  latMax: 11.5,       // lateral grip cap (m/s^2): a heavy, low-slung car corners flat, ~1.2 g
  air: { cruise: 25, boost: 85, accCruise: 0.9, accBoost: 0.55, glideDrag: 0.035, brake: 0.9, climb: 11, climbJet: 22, dive: 22, ceil: 900, turn: 1.15 },
};
const STALL_VN = 6; // m/s into a wall while flying: above it the wings stall and the car drops
const R_COL = 1.0, H_COL = 2.0, STEP = 0.5; // big tyres: kerbs and steps up to half a metre
const OFFS = [1.95, 0.65, -0.65, -1.95]; // 5.7 m long: four circles
const CAM_KEY = 'cd.carCam';
const TRAUMA = { crash: 1, land: 0.5, takeoff: 0.15 }; // camera shake per event (x severity)

export function createCar({ scene, world, camera, input }) {
  const model = buildCarModel();
  const object = model.object; scene.add(object);
  const col = createCarCollider(world);
  const s = {
    p: new THREE.Vector3(), v: new THREE.Vector3(), yaw: 0, yawRate: 0, steer: 0, grounded: true,
    wing: 0, turb: 0, thrust: 0, jetK: 0, gear: 1, rpm: 900, wheelA: 0,
    pitch: 0, roll: 0, bank: 0, susP: 0, susR: 0, heave: 0, heaveV: 0, slip: 0, brake: false, hb: false,
    airT: 0, fpa: 0, stall: 0, airbrake: false, drift: 0, safe: new THREE.Vector3(), safeYaw: 0, safeT: 0, sinkT: 0, throttle: 0, lastA: 0, alt: 0, horn: false,
  };
  const pos = new THREE.Vector3(); // body centre (API position)
  const cam = createCarCamera(camera, world, model);
  const events = [];

  // ---------------------------------------------------------------- helpers
  // unit nose / right-hand directions on the ground plane (yaw 0 faces +z; +x is the car's left)
  function fwd(out) { const y = s.yaw; return out.set(Math.sin(y), 0, Math.cos(y)); }
  function right(out) { const y = s.yaw; return out.set(-Math.cos(y), 0, Math.sin(y)); }
  const floorAt = (x, z, y) => { const g = world.groundHeight(x, z, y); return Number.isFinite(g) ? g : -50; };
  const [_f, _r, _c, _push, _n] = Array.from({ length: 5 }, () => new THREE.Vector3());
  function probeGround() {
    // four wheel contact points: heights -> base height, pitch, roll
    fwd(_f); right(_r);
    const y = s.p.y + STEP + 0.2, hz = DIM.wb / 2, hx = DIM.track / 2;
    const h = (a, b) => floorAt(s.p.x + _f.x * a + _r.x * b, s.p.z + _f.z * a + _r.z * b, y);
    const fl = h(hz, -hx), fr = h(hz, hx), rl = h(-hz, -hx), rr = h(-hz, hx);
    const front = (fl + fr) / 2, rear = (rl + rr) / 2, left = (fl + rl) / 2, rgt = (fr + rr) / 2;
    return { y: Math.max((front + rear) / 2, floorAt(s.p.x, s.p.z, y) - 0.05), pitch: Math.atan2(front - rear, DIM.wb), roll: Math.atan2(left - rgt, DIM.track) };
  }
  // into the river: a splash, then the car goes down and comes back on the last safe road spot (update)
  function sink() { events.push({ type: 'splash' }); s.v.multiplyScalar(0.2); s.sinkT = 1.4; s.grounded = true; }
  let lastHit = 0;
  // traffic and people give way: the car rams them with a heavy "gameplay" mass (people barely register, small cars
  // cost a little speed, buses a lot but never all of it); the struck cars fly off as wrecks (world.ram)
  const RAM_MASS = 12000, ramQ = { x: 0, y: 0, z: 0, fx: 0, fz: 0, hl: DIM.len / 2 + 0.25, hw: DIM.wid / 2 + 0.06, /* a bit beyond the collision circles' reach (1.95 + R_COL): the ram sees a car / tree before the wall-like push-out */ h: 1.8, v: null, mass: RAM_MASS };
  let lastRam = 0;
  function ram() {
    if (!world.ram) return;
    fwd(_f);
    ramQ.x = s.p.x; ramQ.y = s.p.y; ramQ.z = s.p.z; ramQ.fx = _f.x; ramQ.fz = _f.z; ramQ.v = s.v;
    let r = null; try { r = world.ram(ramQ); } catch (e) { if (!ram.err) { ram.err = true; console.error('[car] ram', e); } }
    if (!r) return;
    if (r.hits || r.trees || r.push.lengthSq()) {
      s.v.x += r.dv.x; s.v.z += r.dv.z; s.p.x += r.push.x; s.p.z += r.push.z;
      if (r.severity > 0.04 && s.time - lastRam > 0.15) { lastRam = s.time; events.push({ type: 'crash', severity: r.severity, ram: true }); }
    }
    if (r.people) { s.v.multiplyScalar(Math.pow(0.99, r.people)); events.push({ type: 'splat', n: r.people }); }
  }
  function collide(h) {
    if (!col) return;
    ram();
    fwd(_f);
    _push.set(0, 0, 0); let n = 0, best = null, bestD = 0;
    for (const o of OFFS) {
      _c.set(s.p.x + _f.x * o, s.p.y, s.p.z + _f.z * o);
      const c = pushOutCapsule(col, _c, R_COL, H_COL, STEP);
      if (c) { _push.x += _c.x - (s.p.x + _f.x * o); _push.z += _c.z - (s.p.z + _f.z * o); n++; if (c.depth > bestD) { bestD = c.depth; best = c; } }
      if (world.collideDynamic) {
        let r = null; try { r = world.collideDynamic(_c.set(s.p.x + _f.x * o, s.p.y, s.p.z + _f.z * o), 1.0, 1.3); } catch (e) { r = null; }
        if (r?.push && !r.grounded) { _push.x += r.push.x; _push.z += r.push.z; n++; if (!best) { best = { normal: _n.set(r.push.x, 0, r.push.z).normalize(), dyn: true }; } }
      }
    }
    if (!n) return;
    s.p.x += _push.x; s.p.z += _push.z;
    const nl = Math.hypot(_push.x, _push.z); if (nl < 1e-5) return;
    _n.set(_push.x / nl, 0, _push.z / nl);
    const vn = s.v.x * _n.x + s.v.z * _n.z;
    if (vn < 0) {
      const sp = Math.hypot(s.v.x, s.v.z) || 1;
      s.v.x -= _n.x * vn * 1.15; s.v.z -= _n.z * vn * 1.15; // slide along + a little bounce
      const k = clamp(-vn / sp, 0, 1); s.v.x *= 1 - 0.35 * k; s.v.z *= 1 - 0.35 * k;
      // glancing blow turns the nose along the wall
      const along = Math.atan2(s.v.x, s.v.z);
      if (sp > 3 && s.grounded) s.yawRate += angWrap(along - s.yaw) * clamp(k * 2, 0, 1) * 3;
      // a solid hit in flight stalls the wings: the car loses its speed and drops, level, instead of sliding on
      if (!s.grounded && s.wing > 0.5 && !best.dyn && -vn > STALL_VN) { // wings out: a plain jump off a kerb only slides
        s.stall = Math.max(s.stall, 1.2); s.fpa = 0; s.yawRate = 0;
        s.v.x = _n.x * 2.5; s.v.z = _n.z * 2.5; s.v.y = Math.min(s.v.y, 0); // a small kick off the wall
      }
      if (-vn > 2.5 && s.time - lastHit > 0.25) { lastHit = s.time; events.push({ type: 'crash', severity: clamp(-vn / 25, 0.05, 1) }); }
    }
  }
  // single-speed electric drive: D / R, motor rpm (sound) and a power estimate (centre screen)
  function autoGear(vF, h) {
    s.gear = vF < -0.3 ? -1 : 1;
    s.rpm = damp(s.rpm, Math.abs(vF) * 290, 10, h);
  }

  // ---------------------------------------------------------------- road
  function stepDrive(h, I) {
    fwd(_f); right(_r);
    let vF = s.v.x * _f.x + s.v.z * _f.z, vR = s.v.x * _r.x + s.v.z * _r.z;
    const thr = Math.max(0, I.move.y), brk = Math.max(0, -I.move.y), hb = !!I.jump;
    const jetOn = !!I.sprint && s.turb > 0.85;
    s.throttle = thr; s.hb = hb;
    let a = 0; s.brake = false;
    if (thr > 0) {
      if (vF < -0.5) { a = P.aBrake * thr; s.brake = true; }
      else a = Math.min(P.aEngine, P.pw / Math.max(1, vF)) * thr * clamp((P.vRoad - vF) / 3, 0, 1); // electric: flat torque, then constant power up to the limiter
    }
    if (brk > 0) {
      if (vF > 0.8) { a -= P.aBrake * brk; s.brake = true; }
      else if (vF > -P.vRev) a -= P.aRev * brk;
    }
    if (jetOn) a += P.aJet * s.turb;
    if (hb) { a -= Math.sign(vF) * 3.5; s.brake = true; }
    const drag = P.cd * vF * Math.abs(vF) + Math.sign(vF) * (P.roll + (thr || jetOn ? 0 : P.engBrake * Math.min(1, Math.abs(vF) / 3)));
    const vF0 = vF;
    vF += (a - drag) * h;
    if ((s.brake || !thr) && !jetOn && Math.sign(vF) !== Math.sign(vF0) && vF0 !== 0 && !(brk > 0 && vF0 <= 0.8)) vF = 0;
    autoGear(vF, h);
    // lift: the wings unload the tyres (grip fades), full lift = take-off
    const lift = s.wing * clamp((Math.max(0, vF) / P.vLift) ** 2, 0, 1.4);
    const gripK = clamp(1 - 0.85 * Math.min(1, lift), 0.12, 1);
    // steering: lock falls with speed; the yaw rate is capped by the grip (a heavy, low car: ~1.2 g). Cranked past the
    // cap at speed the nose gets a little more than the tyres hold and the car slides a touch (a light power drift)
    const sp = Math.abs(vF);
    const maxSteer = 0.62 / (1 + sp / 14);
    s.steer = damp(s.steer, -I.move.x * maxSteer, sp > 20 ? 7 : 10, h);
    let yrT = vF * Math.tan(s.steer) / DIM.wb;
    const cap = P.latMax * gripK / Math.max(3, sp), over = sp > 14 && Math.abs(yrT) > cap * 1.3;
    if (hb) yrT *= 1.9; else yrT = clamp(yrT, -cap * (over ? 1.15 : 1), cap * (over ? 1.15 : 1));
    s.yawRate = damp(s.yawRate, yrT, hb ? 4 : 12 * gripK + 2, h);
    const dYaw = s.yawRate * h;
    s.yaw += dYaw;
    // the velocity follows the nose fully while the tyres hold; with the handbrake (or past the grip) it lags behind,
    // and the side speed that builds up is the drift angle, which the grip then pulls back in
    const follow = hb ? 0.35 : over ? 0.8 : 1, a1 = dYaw * follow;
    const wx = _f.x * vF + _r.x * vR, wz = _f.z * vF + _r.z * vR, ca = Math.cos(a1), sa = Math.sin(a1);
    const vx = wx * ca + wz * sa, vz = -wx * sa + wz * ca;
    fwd(_f); right(_r);
    vF = vx * _f.x + vz * _f.z; vR = vx * _r.x + vz * _r.z;
    s.drift = hb ? 1 : Math.max(0, s.drift - h * 2.5); // after Space the rear grips back over ~0.4 s, not at once
    const grip = lerp(over ? 6 : 11, 1.6, s.drift) * gripK;
    const vR1 = vR * Math.exp(-grip * h);
    s.slip = clamp(Math.abs(vR1) / 6, 0, 1) * (sp > 4 ? 1 : 0) + (s.brake && sp > 12 && brk > 0.9 ? 0.25 : 0);
    // drift energy: part of the lost side speed carries on along the new heading
    vF += Math.abs(vR - vR1) * 0.25 * Math.sign(vF || 1) * (hb ? 1 : 0.3);
    s.v.x = _f.x * vF + _r.x * vR1; s.v.z = _f.z * vF + _r.z * vR1;
    // move + terrain
    const y0 = s.p.y;
    s.p.x += s.v.x * h; s.p.z += s.v.z * h;
    collide(h);
    const g = probeGround();
    if (floorAt(s.p.x, s.p.z, s.p.y + 0.6) < WATER_Y) { // over open water: skim it fast, sink slow
      if (Math.hypot(s.v.x, s.v.z) < V_SKIM) { sink(); return; }
      g.y = WATER_Y; g.pitch = 0; g.roll = 0;
      if (!jetOn) { const k = Math.exp(-0.15 * h); s.v.x *= k; s.v.z *= k; } // the water drags until the car drops under V_SKIM
    }
    if (g.y < s.p.y - 0.35) { // road drops away: fly off (keep the slope's vertical speed)
      s.grounded = false; s.airT = 0; return;
    }
    if (g.y > s.p.y + STEP + 0.15) { /* a step too high: the collider holds us */ }
    else s.p.y = g.y;
    s.v.y = clamp((s.p.y - y0) / h, -30, 30);
    s.pitch = damp(s.pitch, g.pitch, 14, h); s.roll = damp(s.roll, g.roll, 14, h);
    // take-off: enough lift with the jet lit (or pulling up with Space at speed)
    if (lift >= 1 && jetOn && s.wing > 0.95) {
      s.grounded = false; s.airT = 0; s.v.y = Math.max(s.v.y, 3.5); s.fpa = 0.14; events.push({ type: 'takeoff' });
    }
    // longitudinal / lateral load for the body pose
    s.lastA = (vF - vF0) / h; s.latA = s.yawRate * vF;
    if (!hb && g.y > WATER_Y && sp < 30) { s.safeT += h; if (s.safeT > 0.5 && world.streetsAt?.(s.p.x, s.p.z)?.type === 'street') { s.safe.copy(s.p); s.safeYaw = s.yaw; s.safeT = 0; } }
  }

  // ---------------------------------------------------------------- air
  const _vh = new THREE.Vector3();
  function stepAir(h, I) {
    s.airT += h;
    { const f0 = floorAt(s.p.x, s.p.z, s.p.y + 0.6); s.alt = s.p.y - Math.max(f0, WATER_Y); }
    fwd(_f);
    const jetOn = !!I.sprint && s.turb > 0.85;
    const ws = I.throttle ?? I.move.y; // W / S only: the arrows pitch in the air
    const stalled = s.stall > 0;
    // the stall holds down to the ground, unless the pilot powers out of it with room to spare
    if (stalled && (s.stall -= h) <= 0 && !(s.alt > 20 && (ws > 0.1 || I.sprint))) s.stall = 0.01;
    const cruise = ws > 0.1 && s.turb > 0.85 && !stalled;
    s.throttle = 0; s.hb = false; s.brake = false; s.airbrake = ws < -0.1;
    _vh.set(s.v.x, 0, s.v.z);
    let hs = _vh.length();
    const A = P.air;
    // horizontal: thrust toward the target speed along the nose, otherwise a slow glide bleed
    if (stalled) hs *= Math.exp(-1.5 * h);
    else if (jetOn) hs += (A.boost - hs) * (1 - Math.exp(-A.accBoost * h));
    else if (cruise && hs < A.cruise) hs += (A.cruise - hs) * (1 - Math.exp(-A.accCruise * h));
    else if (!cruise) hs *= Math.exp(-A.glideDrag * h); // W above the cruise speed: holds it
    if (ws < -0.1) hs *= Math.exp(-A.brake * -ws * h);
    // turn: A / D yaw with a coordinated bank; the flight path follows the nose
    const turnT = stalled ? 0 : -I.move.x * A.turn / (1 + hs / 90) * (0.35 + 0.65 * s.wing);
    s.yawRate = damp(s.yawRate, turnT, 3, h);
    s.yaw += s.yawRate * h;
    fwd(_f);
    const cur = hs > 0.1 ? Math.atan2(s.v.x, s.v.z) : s.yaw;
    const along = cur + angWrap(s.yaw - cur) * (1 - Math.exp(-(s.wing > 0.5 ? 3 : 0.5) * h));
    // vertical: lift ~ v^2 on the wings; glide sink, Space climbs, Ctrl / X dives
    const lf = stalled ? 0 : s.wing * clamp((hs / P.vLift) ** 2, 0, 1.3);
    // pitch like a flight sim: arrow up / stick forward = nose down, arrow down / stick back = nose up (Space / Ctrl
    // / X too); the flight-path angle holds when released and eases back to level; climbs are capped by the wing lift
    const pIn = clamp((I.pitch || 0) + (I.drop ? 1 : 0) - (I.jump ? 1 : 0), -1, 1);
    if (pIn) s.fpa = clamp(s.fpa - pIn * 0.55 * h, -0.75, 0.55);
    else s.fpa -= Math.sign(s.fpa) * Math.min(Math.abs(s.fpa), 0.06 * h);
    const sink = -(1.8 + 12 * (1 - Math.min(1, lf))) + (jetOn ? 1.8 : 0);
    let vyT = sink + Math.max(hs, 12) * Math.sin(s.fpa);
    vyT = Math.min(vyT, (jetOn ? A.climbJet : A.climb) * clamp(lf, 0.15, 1.1));
    if (lf < 0.6 && s.fpa > 0) s.fpa -= 0.5 * h; // too slow to hold the nose up: it drops (stall)
    const flareH = 6 + Math.max(0, -s.v.y) * 0.9; // flare: round out over the ground (earlier the faster it sinks)
    if (s.alt < flareH && s.wing > 0.5 && s.v.y < 0) { vyT = Math.max(vyT, -2.5 - s.alt * 1.2); if (s.fpa < 0) s.fpa = Math.min(0, s.fpa + 1.2 * h); }
    if (s.wing < 0.3 || stalled) s.v.y = Math.max(s.v.y - G * h, -40); // no wings or stalled: ballistic
    else s.v.y += (vyT - s.v.y) * (1 - Math.exp(-(s.alt < flareH && s.v.y < vyT ? 4 : lf > 0.5 ? 1.8 : 1.1) * h));
    if (s.p.y > A.ceil) s.v.y = Math.min(s.v.y, (A.ceil - s.p.y) * 2);
    // energy: climbing costs speed, diving adds it
    if (hs > 1) hs = Math.max(0, hs - G * (s.v.y / Math.max(hs, 8)) * (s.v.y > 0 ? 0.45 : 0.35) * h);
    s.v.x = Math.sin(along) * hs; s.v.z = Math.cos(along) * hs;
    s.rpm = damp(s.rpm, 1100, 2, h); s.gear = 1;
    s.p.addScaledVector(s.v, h);
    collide(h);
    // touchdown (roofs and bridges count), water
    const f = floorAt(s.p.x, s.p.z, s.p.y + 0.6), wet = f < WATER_Y, fy = wet ? WATER_Y : f;
    s.alt = s.p.y - fy;
    if (s.p.y <= fy) {
      s.p.y = fy;
      if (wet && hs < V_SKIM) { sink(); return; } // a fast touchdown skims on (stepDrive keeps it on the surface)
      const sev = clamp(-s.v.y / 14, 0, 1);
      s.v.y = 0; s.grounded = true; s.airT = 0; s.fpa = 0; s.stall = 0;
      events.push({ type: 'land', severity: sev });
      const g = probeGround(); s.pitch = g.pitch; s.roll = g.roll;
    }
    // body pose in flight
    const pitchT = stalled ? -0.12 : clamp(Math.atan2(s.v.y, Math.max(8, hs)) * 0.9 + (I.jump ? 0.08 : 0), -0.6, 0.5);
    s.pitch = damp(s.pitch, pitchT, 3, h);
    s.bank = damp(s.bank, stalled ? 0 : clamp(s.yawRate * hs / G * 0.5, -0.6, 0.6), stalled ? 6 : 3, h);
    s.roll = -s.bank;
  }

  // ---------------------------------------------------------------- flight kit animation
  function stepKit(h, I) {
    const hs = Math.hypot(s.v.x, s.v.z);
    const want = !!I.sprint || (!s.grounded && (s.wing > 0.02 || s.airT > 0.8)) || (s.wing > 0.5 && hs > 30);
    if (want) { s.wing = Math.min(1, s.wing + h / 0.85); if (s.wing > 0.35) s.turb = Math.min(1, s.turb + h / 0.75); }
    else { s.turb = Math.max(0, s.turb - h / 0.6); if (s.turb < 0.45) s.wing = Math.max(0, s.wing - h / 0.8); }
    const jetOn = !!I.sprint && s.turb > 0.85;
    const tT = jetOn ? 1 : !s.grounded && (I.throttle ?? I.move.y) > 0.1 && s.turb > 0.85 ? 0.35 : !s.grounded ? 0.08 : 0;
    s.thrust = damp(s.thrust, tT, tT > s.thrust ? 6 : 3, h);
  }

  // ---------------------------------------------------------------- frame
  let override = null, frozen = false, camKey = false, resetKey = false, honkT = 0;
  s.time = 0;
  function update(dt) {
    if (frozen || !(dt > 1e-5)) return;
    s.time += dt;
    let I = input.poll(dt);
    if (override) { // missions / cut-scenes may rewrite the controls; a throwing override is ignored
      try { I = override(I, dt, api) || I; } catch { /* keep the raw input */ }
    }
    if (I.cameraPressed) cam.toggle();
    if (I.resetPressed) reset();
    s.horn = !!I.horn;
    if (!s.horn) honkT = 0;
    else if ((honkT -= dt) <= 0 && world.honk) { // re-sent while held: people who come into view ahead scatter too
      honkT = 0.4; fwd(_f);
      try { world.honk({ x: s.p.x, y: s.p.y, z: s.p.z, fx: _f.x, fz: _f.z }); } catch (e) { console.error('[car] honk', e); }
    }
    cam.applyLook(I);
    if (s.sinkT > 0) { // in the river: sink, then back to the last road spot
      s.sinkT -= dt; s.p.y -= dt * 0.8; s.v.multiplyScalar(Math.exp(-3 * dt));
      if (s.sinkT <= 0) reset(true);
    } else {
      stepKit(dt, I);
      // sub-steps of at most ~0.45 m of travel (1..10 per frame)
      const steps = Math.min(10, Math.max(1, Math.ceil(s.v.length() * dt / 0.45))), h = dt / steps;
      for (let k = 0; k < steps && !(s.sinkT > 0); k++) (s.grounded ? stepDrive : stepAir)(h, I);
    }
    // body pose: squat / dive on accel, lean on corners, heave spring on bumps / landings
    const fwdA = s.grounded ? clamp(s.lastA || 0, -16, 16) : 0, latA = s.grounded ? clamp(s.latA || 0, -14, 14) : 0;
    s.susP = damp(s.susP, fwdA * 0.004, 8, dt); s.susR = damp(s.susR, -latA * 0.006, 7, dt);
    for (const e of events) if (e.type === 'land') s.heaveV -= 1.2 * e.severity + 0.2;
    s.heaveV += (-s.heave * 180 - s.heaveV * 14) * dt; s.heave += s.heaveV * dt; s.heave = clamp(s.heave, -0.12, 0.08);
    const vF = s.v.x * Math.sin(s.yaw) + s.v.z * Math.cos(s.yaw);
    s.wheelA += (s.grounded ? vF : vF * Math.exp(-s.airT)) / DIM.wheelR * dt;
    object.position.copy(s.p);
    object.rotation.set(0, s.yaw, 0, 'YXZ');
    pos.set(s.p.x, s.p.y + 0.95, s.p.z);
    const night = nightK.value > 0.5;
    model.set({
      steer: s.steer, wheelAngle: s.wheelA, bodyPitch: s.pitch + s.susP, bodyRoll: s.roll + s.susR, heave: s.heave, air: !s.grounded,
      wing: s.wing, turb: s.turb, thrust: s.thrust, brake: s.brake, night, cockpit: cam.mode === 'cockpit',
      speed: vF, rpm: s.rpm, gear: s.gear === -1 ? 'R' : Math.abs(vF) < 0.3 && s.throttle < 0.05 ? 'P' : 'D', power: s.grounded ? clamp(s.throttle * Math.min(1, (Math.abs(vF) + 4) / 20), 0, 1) : 0, alt: s.alt, vy: s.v.y, jet: s.thrust, handbrake: s.hb,
    }, dt);
    cam.update(dt, s, events);
    api.hud?.setTelemetry?.(s, vF, cam.mode);
    if (events.length && api.onSound) { try { api.onSound(events); } catch (e) { console.error('[car] onSound', e); } }
    if (events.length && api.onEvents) { try { api.onEvents(events); } catch (e) { console.error('[car] onEvents', e); } } // (missions) crashes / landings / splats
    events.length = 0;
  }
  function reset(toSafe = false) {
    const p = toSafe && s.safe.lengthSq() > 0 ? s.safe : s.p;
    teleport(new THREE.Vector3(p.x, p.y, p.z), toSafe ? s.safeYaw : s.yaw);
  }
  function teleport(p, yaw = 0) {
    frozen = false;
    s.p.set(p.x, floorAt(p.x, p.z, p.y + 2), p.z);
    s.v.set(0, 0, 0); s.yaw = yaw; s.yawRate = 0; s.steer = 0; s.grounded = true; s.sinkT = 0; s.wing = 0; s.turb = 0; s.thrust = 0;
    s.pitch = s.roll = s.bank = s.fpa = s.stall = s.drift = 0; s.safe.copy(s.p); s.safeYaw = yaw;
    object.position.copy(s.p); pos.set(s.p.x, s.p.y + 0.95, s.p.z);
    cam.reset(s);
  }
  const spawn = world.carSpawn || world.spawn || new THREE.Vector3(), spawnYaw = world.carSpawnYaw ?? world.spawnYaw ?? 0;
  teleport(spawn.clone(), spawnYaw);

  const api = {
    object, cam, state: s, model,
    get position() { return pos; },
    get velocity() { return s.v; },
    get heading() { return cam.yaw; },
    onEvents: null, onSound: null, get yaw() { return s.yaw; }, get grounded() { return s.grounded; },
    get mode() { return s.grounded ? 'drive' : 'air'; }, get sub() { return ''; }, get flying() { return !s.grounded; },
    update, teleport, reset, hud: null,
    home: () => teleport(spawn.clone(), spawnYaw), // the world's start spot, whatever the saved position
    setControlOverride(fn) { override = fn instanceof Function ? fn : null; },
    get frozen() { return frozen; },
    set frozen(v) { frozen = Boolean(v); },
  };
  if (typeof window !== 'undefined') window.__car = api;
  return api;
}

// ---------------------------------------------------------------- camera: chase (default) / cockpit
function createCarCamera(camera, world, model) {
  const c = { mode: 'chase', yaw: 0, lookYaw: 0, lookPitch: 0, idle: 9, pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 68, trauma: 0, t: 0, chaseYaw: 0, chasePitch: 0.12, dist: 6.4, blend: 1 };
  let saved = null;
  try { saved = localStorage.getItem(CAM_KEY); } catch { /* storage off */ }
  if (saved === 'chase' || saved === 'cockpit') c.mode = saved;
  const _m = new THREE.Matrix4(), _e = new THREE.Euler();
  const [_q, _q2] = [new THREE.Quaternion(), new THREE.Quaternion()];
  const [_v, _v2, _d] = Array.from({ length: 3 }, () => new THREE.Vector3());
  const eyeObj = model.body;
  c.toggle = () => { c.mode = c.mode === 'cockpit' ? 'chase' : 'cockpit'; c.blend = 0; try { localStorage.setItem(CAM_KEY, c.mode); } catch (e) { /* storage off */ } };
  c.applyLook = (I) => {
    const dx = I.look.dx, dy = I.look.dy;
    if (Math.abs(dx) + Math.abs(dy) > 0.5) c.idle = 0;
    c.lookYaw = clamp(c.lookYaw - dx * 0.0025, -2.4, 2.4);
    c.lookPitch = clamp(c.lookPitch - dy * 0.0022, -0.9, 0.7);
  };
  c.reset = (s) => { c.chaseYaw = s.yaw; c.lookYaw = 0; c.lookPitch = 0; c.pos.set(s.p.x - Math.sin(s.yaw) * 6, s.p.y + 2.2, s.p.z - Math.cos(s.yaw) * 6); };
  c.update = (dt, s, events) => {
    c.t += dt; c.idle += dt;
    for (const e of events) {
      const k = TRAUMA[e.type];
      if (k) c.trauma = Math.min(1, c.trauma + k * (e.type === 'takeoff' ? 1 : e.severity || 0));
    }
    c.trauma = Math.max(0, c.trauma - dt * 1.6);
    if (c.idle > 1.4) { c.lookYaw = damp(c.lookYaw, 0, 2.5, dt); c.lookPitch = damp(c.lookPitch, 0, 2.5, dt); }
    const sp = s.v.length();
    const shake = c.trauma * c.trauma, n = (a) => Math.sin(c.t * 37 + a) * 0.6 + Math.sin(c.t * 61 + a * 2) * 0.4;
    // road rumble in the cockpit
    const rumble = s.grounded ? Math.min(1, sp / 50) * 0.0025 : 0;
    const yawNow = s.yaw;
    if (c.mode === 'cockpit') {
      model.object.updateMatrixWorld(true);
      c.pos.copy(model.eye).applyMatrix4(eyeObj.matrixWorld);
      c.pos.y += n(1) * rumble + n(3) * shake * 0.04;
      _q.setFromRotationMatrix(_m.extractRotation(eyeObj.matrixWorld));
      _e.set(c.lookPitch + n(5) * shake * 0.02, Math.PI + c.lookYaw, n(7) * shake * 0.02, 'YXZ'); // camera looks down -z: turn it to the car's +z
      camera.quaternion.copy(_q).multiply(_q2.setFromEuler(_e));
      camera.position.copy(c.pos);
      c.fov = damp(c.fov, 66 + 12 * clamp(sp / 85, 0, 1), 3, dt);
      c.chaseYaw = yawNow;
    } else {
      // chase: behind the direction of travel (the nose when slow / reversing), orbit with the mouse
      const hs = Math.hypot(s.v.x, s.v.z), velYaw = Math.atan2(s.v.x, s.v.z);
      const fwdDot = Math.cos(velYaw - yawNow);
      const baseYaw = hs > 4 && fwdDot > 0 ? velYaw : yawNow;
      c.chaseYaw += angWrap(baseYaw - c.chaseYaw) * (1 - Math.exp(-(s.grounded ? 4 : 2.2) * dt));
      const yaw = c.chaseYaw + c.lookYaw;
      const air = !s.grounded;
      const D = lerp(7, 11.5, clamp(sp / 85, 0, 1)) + (air ? 2 : 0) + 3 * s.wing * 0.5;
      c.dist = damp(c.dist, D, 2.5, dt);
      const pitch = 0.16 + (air ? clamp(-s.v.y / 60, -0.25, 0.3) : 0) - c.lookPitch;
      const tgt = _v.set(s.p.x, s.p.y + 1.5, s.p.z);
      _d.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      // collision: pull in in front of walls
      let dist = c.dist;
      const hit = world.raycast?.(tgt, _d, dist + 0.3);
      if (hit && hit.distance < dist + 0.3) dist = Math.max(1.5, hit.distance - 0.35);
      const want = _v2.copy(tgt).addScaledVector(_d, dist);
      const gy = world.groundHeight(want.x, want.z, want.y + 1) + 0.4; if (want.y < gy) want.y = gy;
      c.pos.copy(want);
      c.pos.x += n(1) * shake * 0.25; c.pos.y += n(2) * shake * 0.25;
      camera.position.copy(c.pos);
      camera.up.set(0, 1, 0);
      c.look.set(s.p.x + s.v.x * 0.05, s.p.y + 1.6 + (air ? s.v.y * 0.03 : 0), s.p.z + s.v.z * 0.05);
      camera.lookAt(c.look);
      if (air) camera.rotateZ(-s.bank * 0.25);
      c.fov = damp(c.fov, 58 + 16 * clamp(sp / 85, 0, 1), 3, dt);
    }
    c.yaw = c.mode === 'cockpit' ? yawNow + c.lookYaw : c.chaseYaw + c.lookYaw;
    if (Math.abs(camera.fov - c.fov) > 0.05) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
    model.interior.visible = c.mode === 'cockpit' || c.pos.distanceTo(s.p) < 45; // the driver shows through the glass
  };
  return c;
}
