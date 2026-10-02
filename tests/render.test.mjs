// Headless checks for the render core (daylight maths, sky model, haze chunks, decal bias, shadow reach) and core/
// (events, input). Run: node tests/render.test.mjs
import * as THREE from 'three';
import {
  createDaylight, nightFactor, nightK, hourForElevation, sunAt, skyRadiance, airMass, enuToWorld, ATMO, PRESET_NAMES,
} from '../src/render/daylight.js';
import { Haze } from '../src/render/sky.js';
import { decalBias } from '../src/render/renderer.js';
import { createShadows } from '../src/render/shadows.js';
import { createEvents } from '../src/core/events.js';
import { createInput } from '../src/core/input.js';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('FAIL', msg); } }
const deg = (r) => r * 180 / Math.PI;

// ---------------------------------------------------------------- solar geometry
{
  const v = new THREE.Vector3();
  let best = -1, bestH = 0;
  for (let h = 10; h < 16; h += 0.01) { sunAt(172, h, v); if (v.y > best) { best = v.y; bestH = h; } }
  ok(Math.abs(deg(Math.asin(best)) - 64.0) < 0.6, `June solstice noon elevation ~64 deg (got ${deg(Math.asin(best)).toFixed(2)})`);
  ok(bestH > 12.5 && bestH < 13.2, `solar noon near 12:52 EEST (got ${bestH.toFixed(2)})`);
  sunAt(172, bestH, v);
  const south = enuToWorld(0, -1, 0);
  ok(new THREE.Vector3(v.x, 0, v.z).normalize().dot(south) > 0.99, 'noon sun is due south in the map frame');
  const rise = hourForElevation(172, 0, false), set = hourForElevation(172, 0, true);
  ok(rise > 4.3 && rise < 5.3, `sunrise ~4:50 (got ${rise.toFixed(2)})`);
  ok(set > 20.5 && set < 21.5, `sunset ~21:00 (got ${set.toFixed(2)})`);
  sunAt(172, 5.0, v);
  ok(enuToWorld(1, 0, 0).dot(new THREE.Vector3(v.x, 0, v.z).normalize()) > 0.3, 'morning sun is in the east');
}

// ---------------------------------------------------------------- daylight state + nightFactor
{
  const dl = createDaylight({ preset: 'day', dayOfYear: 180 });
  ok(nightFactor() === 0 && nightK.value === 0, 'day preset: nightFactor 0');
  let prev = null, maxStep = 0, min = 1, max = 0;
  for (let m = 0; m <= 24 * 60; m++) {
    dl.setTime(m / 60, 0);
    const n = nightFactor();
    min = Math.min(min, n); max = Math.max(max, n);
    if (prev !== null) maxStep = Math.max(maxStep, Math.abs(n - prev));
    prev = n;
  }
  ok(min >= 0 && max <= 1, 'nightFactor stays within 0..1');
  ok(max > 0.99 && min < 0.01, 'nightFactor reaches both ends over a day');
  ok(maxStep < 0.03, `nightFactor is smooth minute to minute (max step ${maxStep.toFixed(4)})`);

  // blend day -> night: continuous intensity, the sun/moon hand-over happens while the light is dark
  dl.setPreset('day', 0); dl.update(0);
  dl.setPreset('night', 3);
  let lastI = dl.state.lightIntensity, lastMoon = dl.state.lightIsMoon, jump = 0, handoverI = 0, lastN = nightFactor(), nJump = 0;
  for (let t = 0; t < 3.2; t += 1 / 60) {
    dl.update(1 / 60);
    const s = dl.state;
    jump = Math.max(jump, Math.abs(s.lightIntensity - lastI));
    nJump = Math.max(nJump, Math.abs(nightFactor() - lastN));
    if (s.lightIsMoon !== lastMoon) handoverI = Math.max(handoverI, lastI, s.lightIntensity);
    lastI = s.lightIntensity; lastMoon = s.lightIsMoon; lastN = nightFactor();
  }
  ok(!dl.state.blending && dl.state.preset === 'night', 'blend finishes on the night preset');
  ok(nightFactor() > 0.99, 'night preset: nightFactor ~1');
  ok(jump < 0.25, `light intensity has no pop during the blend (max step ${jump.toFixed(3)})`);
  ok(nJump < 0.05, `nightFactor has no pop during the blend (max step ${nJump.toFixed(3)})`);
  ok(handoverI < 0.01, `sun -> moon hand-over happens in the dark (${handoverI.toFixed(4)})`);
  ok(dl.state.exposure > 1.5, 'night raises exposure');
  { // the game's clock: a day per hour, the night skipped from dusk straight to dawn
    const d2 = createDaylight({ preset: 'sunset', dayOfYear: 180 });
    d2.setTimeScale(24); d2.setSkipNight({ dusk: -1, dawn: 1 });
    let skips = 0, minLamps = 1, darkest = 0; d2.onSkip = () => skips++;
    for (let t = 0; t < 600 && !skips; t += 0.1) { d2.update(0.1); darkest = Math.max(darkest, d2.state.night); }
    const dawn = hourForElevation(180, 1, false);
    ok(skips === 1 && Math.abs(d2.state.hours - dawn) < 0.02, `the night skip jumps from dusk to dawn (${d2.state.hours.toFixed(2)} h)`);
    ok(darkest < 0.7 && d2.state.lamps > 0.9, `no full night before the skip (night ${darkest.toFixed(2)}), the lights still on at dawn`);
    for (let t = 0; t < 600; t += 0.1) { d2.update(0.1); minLamps = Math.min(minLamps, d2.state.lamps); }
    ok(skips === 1 && minLamps < 0.02 && d2.state.sunDir.y > 0.3, 'after the skip the morning rises and the lights go off');
    d2.dispose(); dl.activate();
  }
  for (const p of PRESET_NAMES) { dl.setPreset(p, 0); ok(Number.isFinite(dl.state.hours) && dl.state.fogColor.r >= 0, `preset ${p} valid`); }
  dl.setPreset('overcast', 0);
  ok(dl.state.lightIntensity < 0.25 * ATMO.sunLux && dl.state.night < 0.3, 'overcast: weak sun, still daytime');
  dl.setTime(12, 0); dl.setTimeScale(3600); dl.update(0.25);
  ok(Math.abs(dl.state.hours - 12.25) < 1e-6, 'clock advances by timeScale');
  dl.dispose();
  ok(nightFactor() === 0, 'no active daylight -> 0');
}

// ---------------------------------------------------------------- sky radiance model
{
  const L = [0, 0, 0], sun = new THREE.Vector3(0.75, 0.66, 0).normalize();
  skyRadiance(new THREE.Vector3(0, 1, 0), sun, 34, airMass(sun.y), 0, 0, L);
  ok(L[2] > L[0] * 2, `clear zenith is blue (${L.map((x) => x.toFixed(3))})`);
  const dl = createDaylight({ preset: 'sunset' });
  const s = dl.state, toSun = new THREE.Vector3(s.sunDir.x, 0.02, s.sunDir.z).normalize();
  skyRadiance(toSun, s.sunDir, s.sunGain, s.sunMass, s.overcast, s.twilight, L);
  ok(L[0] > L[2], `sunset horizon toward the sun is warm (${L.map((x) => x.toFixed(3))})`);
  ok(s.lightColor.r >= s.lightColor.b, 'sunset light is warm');
  dl.dispose();
}

// ---------------------------------------------------------------- haze fog + chunks
{
  ok(THREE.ShaderChunk.fog_fragment.includes('hzTau') && THREE.ShaderChunk.fog_vertex.includes('vFogWorld'), 'haze chunks installed');
  const h = new Haze(0xffffff, 50, 0.0002);
  ok(h.isFog && h.start === 50 && h.density === 0.0002, 'Haze maps start/density onto near/far');
}

// ---------------------------------------------------------------- decal bias
{
  const rev = { state: { buffers: { depth: { getReversed: () => true } } } };
  const fwd = { state: { buffers: { depth: { getReversed: () => false } } } };
  const m = decalBias(new THREE.MeshBasicMaterial(), rev, 2);
  ok(m.polygonOffset && m.polygonOffsetUnits === 0 && m.polygonOffsetFactor === -2, 'reversed: slope-only polygon offset');
  const sh = { vertexShader: 'void main(){\n#include <project_vertex>\n}' };
  m.onBeforeCompile(sh);
  ok(sh.vertexShader.includes('DECAL_DEPTH_REL') && m.defines.DECAL_DEPTH_REL, 'reversed: vertex depth bias injected');
  const m2 = decalBias(new THREE.MeshBasicMaterial(), fwd, 1);
  ok(m2.polygonOffsetUnits === -4 && !m2.defines?.DECAL_DEPTH_REL, 'standard depth: classic polygon offset');
}

// ---------------------------------------------------------------- shadow reach
{
  const scene = new THREE.Scene(), dl = createDaylight({ preset: 'day' });
  const renderer = { shadowMap: { needsUpdate: false }, state: { buffers: { depth: { getReversed: () => true } } } };
  const sh = createShadows({ scene, renderer, daylight: dl, quality: 'high' });
  const cam = new THREE.PerspectiveCamera(60, 1.6, 0.3, 20000);
  cam.position.set(0, 3, 0); sh.update(1 / 60, cam, 0);
  const low = sh.stats.reach;
  ok(low > 150 && low < 400, `street-level reach ~250 m (got ${low.toFixed(0)})`);
  ok(renderer.shadowMap.needsUpdate === true, 'day: shadow redraw scheduled');
  let changes = 0, r = low;
  for (let i = 0; i < 200; i++) { cam.position.y = 3 + Math.sin(i) * 6; sh.update(1 / 60, cam, 0); if (sh.stats.reach !== r) { changes++; r = sh.stats.reach; } }
  ok(changes === 0, 'reach is stable under small altitude jitter');
  cam.position.y = 600; sh.update(1 / 60, cam, 0);
  ok(sh.stats.reach > 1500 && sh.stats.reach <= 2800, `aerial reach opens up (got ${sh.stats.reach.toFixed(0)})`);
  ok(sh.light.shadow.bias > 0, 'reversed depth: positive depth bias');
  ok(sh.light.position.distanceTo(dl.state.lightDir) < 1e-9, 'light aimed from daylight');
  sh.setQuality('low');
  ok(sh.light.shadow.mapSize.x === 1024, 'low quality: smaller atlas');
  dl.dispose();
}

// ---------------------------------------------------------------- events
{
  const ev = createEvents(), got = [];
  const off = ev.on('a', (p) => got.push(p));
  ev.once('a', (p) => got.push('once' + p));
  ev.on('a', () => { throw new Error('listener error (expected in test)'); });
  const origErr = console.error; let logged = 0; console.error = () => { logged++; };
  ev.emit('a', 1); ev.emit('a', 2);
  off(); ev.emit('a', 3);
  console.error = origErr;
  ok(logged === 3, `a throwing listener is logged, not fatal (${logged})`);
  ok(got.join(',') === '1,once1,2', `events order/once/off (${got.join(',')})`);
  ok(ev.count('a') === 1, 'one throwing listener left');
}

// ---------------------------------------------------------------- input
{
  const target = new EventTarget();
  const key = (type, code) => { const e = new Event(type); Object.defineProperties(e, { code: { value: code }, repeat: { value: false } }); target.dispatchEvent(e); };
  const inp = createInput({ target, element: null });
  key('keydown', 'KeyW'); key('keydown', 'KeyA');
  let I = inp.update(1 / 60);
  ok(inp.pressed('gas') && inp.held('gas') && I.throttle === 1 && I.move.y === 1 && I.move.x === -1, 'W/A -> throttle, move');
  I = inp.update(1 / 60);
  ok(!inp.pressed('gas') && inp.held('gas'), 'pressed lasts one frame');
  key('keydown', 'ArrowUp');
  I = inp.update(1 / 60);
  ok(I.pitch === 1 && I.throttle === 1 && I.move.y === 1, 'arrow up = nose down, not throttle');
  key('keydown', 'KeyC'); key('keyup', 'KeyC');
  I = inp.update(1 / 60);
  ok(I.cameraPressed && !inp.held('camera'), 'tap within one frame still counts as pressed');
  ok(inp.poll() === I, 'poll returns the latched frame');
  target.dispatchEvent(new Event('blur'));
  I = inp.update(1 / 60);
  ok(!inp.held('gas') && inp.released('gas') && I.throttle === 0 && I.pitch === 0, 'blur releases everything');
  inp.inject.mouse(10, -4);
  I = inp.update(1 / 60);
  ok(I.look.dx === 10 && I.look.dy === -4, 'mouse delta accumulates into look');
  I = inp.update(1 / 60);
  ok(I.look.dx === 0, 'look delta is per frame');
  inp.dispose();
}

console.log(`render tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
