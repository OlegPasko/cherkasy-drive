// The game's sound: the car (electric motor, drift squeal, ducted fans, wind), the place (city / Sosnivka forest /
// altitude, day and night beds), one-shots for what happens in the world, and the dispatcher on the radio.
//
//   createGameAudio({ car, camera, world, daylight, silent? }) -> { update(dt), setPaused(bool), engine, radio }
//     silent: the ?nosound flag – the game runs without a sound (src/audio/engine.js)
//     the horn (car.state.horn, F) is a loop on the motor bus, so the city map silences it too
//     radio: src/audio/radio.js (off until turned on; the city map does not stop it)
//     car: src/game/car/car.js (reads `state` every frame; takes over car.onSound for its events)
//     world: the city (world.cherkasy.map.cover.forest drives the ambience; the test world has
//       neither and gets the plain city bed)
//     daylight: src/render/daylight.js (state.night 0..1 swaps the day beds for the night ones)
//     the light plane (world.cherkasy.sites, the one with `plane`, src/world/cherkasy/plane.js): its engine loop is heard
//       only right next to it – full within PLANE_NEAR, gone by PLANE_FAR (it flies ~150-190 m up, so never from the
//       ground), panned left / right
//   planeGain(d) -> 0..1   that distance curve (exported for the tests)
//   Sounds come from src/audio/cue.js too (wrecks, trees, people, birds, missions). The mix is kept low on purpose:
//   the car is electric, the city is a bed, the voice sits on top. setPaused (the city map is open) fades the world
//   out; the map's own paper swish and a running radio line stay audible.
import { createAudioEngine } from './engine.js';
import { setCueListener } from './cue.js';
import { createRadio } from './radio.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ramp = (v, a, b) => clamp01((v - a) / (b - a));
// the plane's engine by distance (m): full up close, a quadratic fade (roughly how loudness falls) to silence
export const PLANE_NEAR = 30, PLANE_FAR = 120;
export const planeGain = (d) => (1 - ramp(d, PLANE_NEAR, PLANE_FAR)) ** 2;
// equal-power crossfade weights for t in 0..1
const fadeOut = (t) => Math.cos(clamp01(t) * Math.PI / 2), fadeIn = (t) => Math.sin(clamp01(t) * Math.PI / 2);

// forest cover as a coarse grid (40 m): rasterised once from map.cover.forest, read per frame around the listener
function forestGrid(map) {
  const rings = map?.cover?.forest, R = map?.landExtent || map?.region;
  if (!rings?.length || !R) return null;
  const C = 40, nx = Math.ceil((R.x1 - R.x0) / C), nz = Math.ceil((R.z1 - R.z0) / C);
  const g = new Uint8Array(nx * nz);
  for (const poly of rings) {
    const outer = poly[0];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < outer.length; i += 2) { x0 = Math.min(x0, outer[i]); x1 = Math.max(x1, outer[i]); z0 = Math.min(z0, outer[i + 1]); z1 = Math.max(z1, outer[i + 1]); }
    const u0 = Math.max(0, Math.floor((x0 - R.x0) / C)), u1 = Math.min(nx - 1, Math.floor((x1 - R.x0) / C));
    const w0 = Math.max(0, Math.floor((z0 - R.z0) / C)), w1 = Math.min(nz - 1, Math.floor((z1 - R.z0) / C));
    for (let w = w0; w <= w1; w++) {
      const z = R.z0 + (w + 0.5) * C;
      for (let u = u0; u <= u1; u++) {
        const x = R.x0 + (u + 0.5) * C;
        let inside = false; // even-odd over the outer ring (clearings are small enough to ignore)
        for (let i = 0, j = outer.length - 2; i < outer.length; j = i, i += 2) {
          const zi = outer[i + 1], zj = outer[j + 1];
          if ((zi > z) !== (zj > z) && x < outer[i] + (outer[j] - outer[i]) * (z - zi) / (zj - zi)) inside = !inside;
        }
        if (inside) g[u + w * nx] = 1;
      }
    }
  }
  // share of forest cells in a 5x5 block (200 m) around a point
  return (x, z) => {
    const u = Math.floor((x - R.x0) / C), w = Math.floor((z - R.z0) / C);
    let n = 0;
    for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) {
      const uu = u + a, ww = w + b;
      if (uu >= 0 && ww >= 0 && uu < nx && ww < nz) n += g[uu + ww * nx];
    }
    return n / 25;
  };
}

export function createGameAudio({ car, camera, world, daylight, silent = false }) {
  const E = createAudioEngine({ silent });
  let forestAt = null, forestTried = false;
  let L = null; // loops, made once the context exists
  let paused = false;

  E.onReady(() => {
    const m = (id) => E.loop(id, { bus: 'motor' }), a = (id) => E.loop(id, { bus: 'amb' });
    L = {
      inv_low: m('inv_low'), inv_mid: m('inv_mid'), inv_high: m('inv_high'), squeal: m('squeal'),
      fan_idle: m('fan_idle'), fan_thrust: m('fan_thrust'), wind: m('wind'), horn: m('horn'),
      city_day: a('city_day'), city_night: a('city_night'),
      forest_day: a('forest_day'), forest_night: a('forest_night'), altitude: a('altitude'),
      plane: E.loop('plane_engine', { bus: 'sfx', pan: true }), // a world object: the map pause mutes it with the sfx
    };
  });

  // ---------------------------------------------------------------- one-shots
  const lastAt = new Map();
  const ready = (key, gap) => { // a per-sound cooldown in seconds of audio time
    const t = E.ac?.currentTime ?? 0;
    if (t - (lastAt.get(key) ?? -1e9) < gap) return false;
    lastAt.set(key, t); return true;
  };
  const sayOnce = (vo, gap, opts) => { if (vo && E.has(vo) && ready('vo:' + vo, gap)) E.say(vo, opts); };

  function onCar(events) {
    for (const e of events) {
      if (e.type === 'crash' && !e.ram && ready('wall', 0.25)) { // rams (cars, trees, people) sound where they happen
        E.play(e.severity > 0.35 ? 'hit_wall_heavy' : 'hit_wall', { vol: 0.5 + 0.5 * e.severity });
      } else if (e.type === 'land' && e.severity > 0.08 && ready('land', 0.4)) E.play('land', { vol: 0.35 + 0.65 * e.severity });
      else if (e.type === 'takeoff') E.play('takeoff');
    }
  }

  const MISSION_SFX = { call: 'call', start: 'start', ring: 'ring', tick: 'tick' };
  function onMission(d) {
    if (d.kind === 'end') {
      if (d.vo === 'mission_abandoned') { E.say(d.vo, { force: true }); return; }
      E.play(d.ok ? 'success' : d.fine ? 'fine' : 'fail');
      if (d.ok && d.reward > 0) setTimeout(() => E.play('coins'), 800);
      E.say(d.vo, { force: true, delay: 0.5 });
      return;
    }
    if (d.kind === 'ram') {
      if (ready('ram', 0.18)) E.play('hit_car_heavy', { pos: d, vol: Math.min(1, 0.5 + d.k * 0.04), ref: 10 });
      if (Math.random() < 0.35) sayOnce(d.vo, 12);
      return;
    }
    if (d.kind === 'low') { sayOnce(d.vo, 20); return; }
    if (MISSION_SFX[d.kind]) E.play(MISSION_SFX[d.kind]);
    // calls change often (skipped, lapsed, replaced): a new one only rings; the dispatcher speaks once a mission is taken
    if (d.kind === 'call' || d.kind === 'skip' || d.kind === 'lapse') return;
    const delay = d.kind === 'start' ? 0.25 : d.delay || 0; // after the start chime
    if (d.kind === 'say') sayOnce(d.vo, d.vo === 'courier_parcel_damaged' || d.vo === 'pax_shocked_crash' ? 10 : 2, { force: d.force, delay });
    else if (d.vo && E.has(d.vo)) E.say(d.vo, { force: d.kind !== 'ring', delay });
  }

  setCueListener((name, d) => {
    if (paused || !E.ac) return;
    switch (name) {
      case 'splat': if (ready('splat', 0.08)) E.play('chpok', { pos: d, ref: 10, jitter: 0.03 }); break;
      case 'carhit': {
        if (!ready('carhit', 0.15)) break;
        const heavy = d.k > 6;
        E.play(heavy ? 'hit_car_heavy' : 'hit_car', { pos: d, ref: 12, vol: Math.min(1, 0.45 + d.k * 0.05) });
        if (d.k > 3 && ready('glass', 0.3)) E.play('glass', { pos: d, ref: 10, vol: 0.7 });
        break;
      }
      case 'tree': if (ready('tree', 0.3)) E.play('tree', { pos: d, ref: 12 }); break;
      case 'birds': if (ready('birds', 2)) E.play('pigeons', { pos: d, ref: 10 }); break;
      case 'mission': onMission(d); break;
      case 'partner': E.play('partner', { bus: 'ui' }); break;
    }
  });
  car.onSound = (ev) => { if (!paused && E.ac) onCar(ev); };

  // ---------------------------------------------------------------- per frame
  let wing0 = 0, turb0 = 0, envT = 0, hornT = 0, hornOn = false, plane, planeG = 0;
  const env = { forest: 0 };
  const right = { x: 1, z: 0 };
  function update(dt) {
    const s = car.state;
    const cp = camera.position;
    const e = camera.matrixWorld.elements; right.x = e[0]; right.z = e[2]; // the camera's local +x
    E.setListener(cp, right);
    if (!L || paused) return;

    // flight kit mechanics: the wings' servo when they start moving, the fans' spin-up
    if (s.wing > 0.02 && wing0 <= 0.02) E.play('wings_out');
    if (s.wing < 0.98 && wing0 >= 0.98) E.play('wings_in');
    if (s.turb > 0.1 && turb0 <= 0.1) E.play('turbine_up');
    wing0 = s.wing; turb0 = s.turb;

    // motor: three fixed inverter recordings crossfaded by road speed, each pitched a little around its anchor
    const kmh = Math.hypot(s.v.x, s.v.z) * 3.6, onRoad = s.grounded && s.sinkT <= 0;
    const drive = onRoad ? ramp(kmh, 2, 8) * (0.75 + 0.25 * clamp01(s.throttle)) : 0;
    const lm = ramp(kmh, 20, 40), mh = ramp(kmh, 55, 80);
    L.inv_low.set(drive * fadeOut(lm), 0.12); L.inv_low.rate.value = Math.min(1.15, Math.max(0.85, kmh / 15));
    L.inv_mid.set(drive * fadeIn(lm) * fadeOut(mh), 0.12); L.inv_mid.rate.value = Math.min(1.15, Math.max(0.85, kmh / 45));
    L.inv_high.set(drive * fadeIn(mh), 0.12); L.inv_high.rate.value = Math.min(1.45, Math.max(0.85, kmh / 90));
    L.squeal.set(onRoad ? clamp01(s.slip) * ramp(kmh, 8, 30) * 0.8 : 0, 0.05);
    // ducted fans: by thrust, not airspeed, so a hover still hums
    const fan = clamp01(s.turb), thr = ramp(s.thrust, 0.25, 0.75);
    L.fan_idle.set(fan * fadeOut(thr), 0.25); L.fan_thrust.set(fan * fadeIn(thr), 0.25);
    L.fan_idle.rate.value = 0.9 + 0.2 * fan; L.fan_thrust.rate.value = 0.95 + 0.2 * s.thrust;
    // the horn: a steady loop gated by F, near-instant on, a short release; held at least ~0.15 s so a tap still toots
    const held = s.horn && !car.frozen;
    if (held && !hornOn) hornT = 0.15;
    hornOn = held; hornT -= dt;
    const horn = held || hornT > 0;
    L.horn.set(horn ? 1 : 0, horn ? 0.006 : 0.03);
    const air = Math.hypot(s.v.x, s.v.y, s.v.z) * 3.6;
    L.wind.set(ramp(air, 25, 120) * (s.grounded ? 0.65 : 1), 0.2);

    // place: sampled a few times a second (the queries are cheap but the answer changes slowly)
    if ((envT -= dt) <= 0) {
      envT = 0.25;
      if (!forestTried) { forestTried = true; try { forestAt = forestGrid(world?.cherkasy?.map); } catch (err) { console.warn('[audio] forest grid', err); } }
      const p = s.p;
      env.forest = forestAt ? ramp(forestAt(p.x, p.z), 0.2, 0.7) : 0;
    }
    const alt = s.grounded ? 0 : Math.max(0, s.alt);
    const high = ramp(alt, 25, 100), low = 1 - 0.75 * high;
    const night = clamp01(daylight?.state?.night ?? 0), day = 1 - night;
    const forest = env.forest * low;
    const city = Math.max(0, 1 - forest * 0.85) * low;
    const tc = 1.2; // region changes glide over a couple of seconds
    L.city_day.set(city * day, tc); L.city_night.set(city * night, tc);
    L.forest_day.set(forest * day, tc); L.forest_night.set(forest * night, tc);
    L.altitude.set(high, tc);

    // the plane: found once the city is up; the distance is the listener's (the camera), like the positional one-shots
    if (plane === undefined && world?.cherkasy) plane = world.cherkasy.sites?.find((x) => x.plane)?.plane ?? null;
    if (plane) {
      const dx = plane.x - cp.x, dy = plane.y - cp.y, dz = plane.z - cp.z, d = Math.hypot(dx, dy, dz), g = planeGain(d);
      if (g > 0 || planeG > 0) { // silent nearly always (it flies 150+ m up): no automation event per frame then
        L.plane.set(g, 0.1);
        const rl = Math.hypot(right.x, right.z) || 1;
        if (g > 0 && L.plane.pan) L.plane.pan.value = d > 0.5 ? Math.max(-0.85, Math.min(0.85, (dx * right.x + dz * right.z) / (rl * d))) : 0;
      }
      planeG = g;
    }
  }

  return {
    engine: E, update, radio: createRadio({ engine: E }),
    setPaused(v) {
      v = !!v;
      if (v === paused) return;
      paused = v;
      E.mute(['motor', 'amb', 'sfx'], v);
      E.play(v ? 'map_open' : 'map_close', { bus: 'ui' });
    },
  };
}
