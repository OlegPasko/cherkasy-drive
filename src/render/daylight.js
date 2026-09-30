// Time of day for Cherkasy (49.44 N, 32.06 E): the one shared daylight state that sky, shadows, post and the world read.
//
//   createDaylight({ preset = 'day', dayOfYear = 180, timeScale = 0 }) -> daylight (also becomes the active one)
//     daylight.update(dt)                 advance the clock (game seconds = dt * timeScale) and any preset blend
//     daylight.setPreset(name, blendSec = 3)   'day' | 'morning' | 'sunrise' | 'sunset' | 'dusk' | 'night' | 'overcast'
//     daylight.setTime(hours, blendSec = 0), setOvercast(v, blendSec = 0), setTimeScale(s), setDayOfYear(d)
//     daylight.state  live object (mutated in place, never replaced):
//       hours, dayOfYear, timeScale, overcast, preset, blending,
//       sunDir / moonDir (world unit vectors toward the body), sunElev / moonElev (rad),
//       lightDir, lightColor (linear, unit max), lightIntensity, lightIsMoon   – the one shadow-casting light
//       sunGain, sunMass, sunRadiance [r,g,b] (ground-level sun for disk / clouds), twilight, fogColor, zenithColor, horizonColor (THREE.Color, linear),
//       night 0..1, starVis 0..1, exposure, envIntensity, starRot (Matrix3)
//   nightFactor() -> 0 (day) .. 1 (full night lighting). Reads the active daylight; smooth through dusk and dawn.
//   nightK        { value } getter object with the same number, for code written against a `.value` reader.
//   Atmosphere helpers shared with sky.js: ATMO, airMass(s), pathScale(up), sunTransmittance(mass, haze, out), skyRadiance(...).
// World frame (tools/cherkasy/build_map.mjs): map rotated 49.4 deg, +x north-east, +z south-east, y up.
import * as THREE from 'three';

export const SITE = { lat: 49.4445, lon: 32.06, mapRotDeg: 49.4 };
const RAD = Math.PI / 180;
const ROT_C = Math.cos(SITE.mapRotDeg * RAD), ROT_S = Math.sin(SITE.mapRotDeg * RAD);

// east / north / up -> world
export function enuToWorld(e, n, u, out = new THREE.Vector3()) {
  return out.set(e * ROT_C + n * ROT_S, u, e * ROT_S - n * ROT_C);
}

// cubic ease of x between two edges; `from` may be larger than `to` for a falling ramp
function ramp(x, from, to) {
  const u = THREE.MathUtils.clamp((x - from) / (to - from), 0, 1);
  return u * u * (3 - 2 * u);
}
const mix = THREE.MathUtils.lerp;
const RGB = [0, 1, 2];
const RING = Array.from({ length: 8 }, (_, k) => k * Math.PI / 4); // horizon sample azimuths
const wrap24 = (h) => ((h % 24) + 24) % 24;

// ---------------------------------------------------------------------------------------------- solar geometry
// Fourier-series approximations for the equation of time and declination (NOAA's general solar position notes).
export function solarTerms(dayOfYear, utcHours) {
  const g = (2 * Math.PI / 365) * (dayOfYear - 1 + (utcHours - 12) / 24);
  const eqMin = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  return { eqMin, decl };
}
export const utcOffset = (dayOfYear) => (dayOfYear >= 88 && dayOfYear < 300 ? 3 : 2); // EEST / EET, roughly

// body at declination `decl` and hour angle `ha` -> world direction toward it
export function skyToWorld(decl, ha, out = new THREE.Vector3()) {
  const lat = SITE.lat * RAD, cd = Math.cos(decl), sd = Math.sin(decl), cl = Math.cos(lat), sl = Math.sin(lat);
  const up = sl * sd + cl * cd * Math.cos(ha), east = -cd * Math.sin(ha), north = cl * sd - sl * cd * Math.cos(ha);
  return enuToWorld(east, north, up, out).normalize();
}

export function sunAt(dayOfYear, hours, out = new THREE.Vector3()) {
  const tz = utcOffset(dayOfYear), { eqMin, decl } = solarTerms(dayOfYear, hours - tz);
  const solarMin = hours * 60 + eqMin + 4 * SITE.lon - 60 * tz;
  const ha = (solarMin / 4 - 180) * RAD;
  skyToWorld(decl, ha, out);
  return { dir: out, decl, ha };
}

// local clock hour at which the sun crosses `elevDeg` (morning or evening), by bisection
export function hourForElevation(dayOfYear, elevDeg, evening) {
  const target = Math.sin(elevDeg * RAD), v = new THREE.Vector3();
  const s = (h) => sunAt(dayOfYear, h, v).dir.y - target;
  let noon = 12, best = -2;
  for (let h = 9; h <= 16; h += 0.05) { const y = s(h); if (y > best) { best = y; noon = h; } }
  let a = evening ? noon : noon - 12, b = evening ? noon + 12 : noon;
  if (s(a) * s(b) > 0) return noon + (evening ? 8 : -8); // never crosses (not at this latitude, but stay total)
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (Math.sign(s(m)) === Math.sign(s(a))) a = m; else b = m; }
  return wrap24((a + b) / 2);
}

// ---------------------------------------------------------------------------------------------- atmosphere model
// Single-scatter sky with air-mass optics: Rayleigh + Mie + ozone optical depths at the zenith and the Kasten-Young
// relative air mass. Light scattered toward a high view direction happens high up, where the sun's own path is
// shorter: the sun's air mass is scaled by pathScale(view), which keeps a sunrise zenith blue while the horizon
// burns orange. sky.js mirrors skyRadiance() in GLSL; keep the two in step.
export const ATMO = {
  tauR: [0.0464, 0.108, 0.265],  // Rayleigh zenith optical depth (sea-level coefficients x 8 km scale height)
  tauO: [0.012, 0.034, 0.0016],  // ozone absorption (Chappuis band): blue twilight, magenta dusk
  tauM: 0.03,                    // Mie zenith optical depth: a light river-valley haze
  mieG: 0.72,
  skyGain: 34,                   // sky radiance scale against the sun light below
  sunLux: 5.0,                   // direct sun light intensity at zenith (three.js units)
  moonLux: 0.16,
  nightSky: [0.0016, 0.0026, 0.0058],
  blueHour: [0.012, 0.02, 0.05],
  groundAlbedo: [0.1, 0.11, 0.09],
};

export function airMass(s) {
  const c = Math.min(1, Math.max(0, s));
  const hDeg = Math.asin(c) / RAD;
  return 1 / (c + 0.50572 * Math.pow(hDeg + 6.07995, -1.6364));
}
export const pathScale = (up) => 0.3 + 0.7 * Math.pow(1 - Math.min(1, Math.max(0, up)), 3);
const mieDepth = (haze) => ATMO.tauM * (1 + 2 * haze);

// sun colour after `mass` air masses (1 = zenith path from the ground)
export function sunTransmittance(mass, haze = 0, out = [0, 0, 0]) {
  const tm = mieDepth(haze);
  for (const c of RGB) out[c] = Math.exp(-mass * (tm + ATMO.tauR[c] + ATMO.tauO[c]));
  return out;
}

const phaseR = (mu) => 0.0596831 * (1 + mu * mu);
const phaseM = (mu, g) => { const k = 1 + g * g - 2 * g * mu; return 0.0795775 * (1 - g * g) / (k * Math.sqrt(k)); };

// clear-sky radiance (no disks, clouds or stars) toward world direction `d`.
// sunGain = skyGain x twilight fade, sunMass = airMass(sun elevation)
export function skyRadiance(d, sunDir, sunGain, sunMass, haze, twilight, out = [0, 0, 0]) {
  const up = Math.max(d.y, 0), m = airMass(up), mu = d.x * sunDir.x + d.y * sunDir.y + d.z * sunDir.z;
  const tm = mieDepth(haze), pr = phaseR(mu), pm = phaseM(mu, ATMO.mieG), ms = sunMass * pathScale(up);
  for (const c of RGB) {
    const rayleigh = ATMO.tauR[c], ext = rayleigh + ATMO.tauO[c] + tm;
    const scatter = (rayleigh * pr + tm * pm) / ext * (1 - Math.exp(-ext * m));
    const floor = ATMO.nightSky[c] * (0.6 + 0.4 * up) + ATMO.blueHour[c] * twilight * (0.5 + 0.5 * up);
    out[c] = sunGain * Math.exp(-ext * ms) * scatter + floor;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- presets
// Sun-relative presets so they stay right for any day of the year.
const PRESETS = {
  day: (doy) => ({ hours: 13.5, overcast: 0 }),
  morning: (doy) => ({ hours: hourForElevation(doy, 14, false), overcast: 0 }), // clear, the sun well up in the east
  sunrise: (doy) => ({ hours: hourForElevation(doy, 3, false), overcast: 0.05 }),
  sunset: (doy) => ({ hours: hourForElevation(doy, 3, true), overcast: 0.05 }),
  dusk: (doy) => ({ hours: hourForElevation(doy, -4, true), overcast: 0.05 }),
  night: (doy) => ({ hours: wrap24(hourForElevation(doy, -4, true) + 3), overcast: 0.05 }),
  overcast: (doy) => ({ hours: 13, overcast: 0.9 }),
};
export const PRESET_NAMES = Object.keys(PRESETS);

// ---------------------------------------------------------------------------------------------- shared factor
let active = null;
export const nightFactor = () => (active ? active.state.night : 0);
export const nightK = { get value() { return nightFactor(); } };
export const getDaylight = () => active;

export function createDaylight({ preset = 'day', dayOfYear = 180, timeScale = 0 } = {}) {
  const S = {
    hours: 12, dayOfYear, timeScale, overcast: 0, preset, blending: false,
    sunDir: new THREE.Vector3(0, 1, 0), moonDir: new THREE.Vector3(0, -1, 0), sunElev: 0, moonElev: 0,
    lightDir: new THREE.Vector3(0, 1, 0), lightColor: new THREE.Color(1, 1, 1), lightIntensity: 1, lightIsMoon: false,
    sunRadiance: [0, 0, 0], sunGain: 0, sunMass: 1, twilight: 0,
    fogColor: new THREE.Color(), zenithColor: new THREE.Color(), horizonColor: new THREE.Color(), overcastColor: new THREE.Color(),
    night: 0, starVis: 0, exposure: 1, envIntensity: 1, starRot: new THREE.Matrix3(),
    version: 0, // bumps whenever something visible changed (sky / env refresh hint)
  };
  let tween = null;
  const T = [0, 0, 0], L = [0, 0, 0], tmpV = new THREE.Vector3(), rotM = new THREE.Matrix4();
  const pole = enuToWorld(0, Math.cos(SITE.lat * RAD), Math.sin(SITE.lat * RAD)).normalize();

  function derive() {
    const doy = S.dayOfYear, oc = S.overcast;
    const { ha, decl } = sunAt(doy, S.hours, S.sunDir);
    // moon: a near-full moon roughly opposite the sun, lagging an hour; good enough for lighting and a disk
    skyToWorld(-decl * 0.9, ha + Math.PI + 0.26, S.moonDir);
    const ss = S.sunDir.y, sm = S.moonDir.y;
    S.sunElev = Math.asin(ss); S.moonElev = Math.asin(sm);

    S.sunMass = airMass(ss);
    sunTransmittance(S.sunMass, oc, T);
    S.sunGain = ATMO.skyGain * ramp(ss, -0.2, 0.03) * (1 - 0.55 * oc);
    for (const c of RGB) S.sunRadiance[c] = T[c] * S.sunGain;
    S.twilight = ramp(ss, -0.2, -0.05) * (1 - ramp(ss, -0.02, 0.12));

    // one shadow light: the sun above -2 deg, the moon below; both are dark at the hand-over, so nothing pops
    const sunVis = ramp(ss, -0.02, 0.05) * (1 - 0.85 * oc);
    const moonVis = ramp(sm, -0.02, 0.12) * ramp(ss, -0.035, -0.1) * (1 - 0.8 * oc);
    if (ss > -0.035) {
      const mx = Math.max(T[0], T[1], T[2], 1e-6);
      S.lightDir.copy(S.sunDir); // colour softened (^0.7): the pure transmittance reads too red for a low sun
      S.lightColor.setRGB((T[0] / mx) ** 0.7, (T[1] / mx) ** 0.7, (T[2] / mx) ** 0.7);
      S.lightIntensity = ATMO.sunLux * mx * sunVis; S.lightIsMoon = false;
    } else {
      S.lightDir.copy(S.moonDir); S.lightColor.setRGB(0.55, 0.66, 1.0);
      S.lightIntensity = ATMO.moonLux * moonVis; S.lightIsMoon = true;
    }

    // horizon ring average -> fog colour (the sun-side glow is added per pixel in the fog shader)
    S.horizonColor.setRGB(0, 0, 0);
    for (const az of RING) {
      skyRadiance(tmpV.set(Math.cos(az), 0.02, Math.sin(az)).normalize(), S.sunDir, S.sunGain, S.sunMass, oc, S.twilight, L);
      S.horizonColor.r += L[0] / RING.length; S.horizonColor.g += L[1] / RING.length; S.horizonColor.b += L[2] / RING.length;
    }
    skyRadiance(tmpV.set(0, 1, 0), S.sunDir, S.sunGain, S.sunMass, oc, S.twilight, L); S.zenithColor.setRGB(L[0], L[1], L[2]);
    const grey = (0.3 * S.horizonColor.r + 0.55 * S.horizonColor.g + 0.15 * S.horizonColor.b) * 0.85;
    S.overcastColor.setRGB(grey * 0.97, grey, grey * 1.04);
    S.fogColor.copy(S.horizonColor).lerp(S.overcastColor, oc * 0.85);

    const n = 1 - ramp(ss, -0.1, 0.07);
    S.night = Math.min(1, Math.max(0, n + 0.2 * oc * (1 - n)));
    S.starVis = ramp(ss, -0.08, -0.2) * (1 - oc);
    S.exposure = Math.exp(mix(0, Math.log(2.6), n)) * (1 + 0.25 * oc);
    S.envIntensity = mix(0.35, 2.2, n); // day ambient low against the sun: readable shadows
    rotM.makeRotationAxis(pole, -(ha + 2 * Math.PI * doy / 365));
    S.starRot.setFromMatrix4(rotM);
    S.version++;
  }

  // A blend walks the clock, but at an even pace of *visible* change: the path is sampled once and re-parameterised
  // by a cost (night factor, light strength, sun angle, plus a little plain time), so a day -> night blend spends its
  // seconds on the dusk instead of flashing through it in a few frames.
  function startTween(to, sec) {
    if (!(sec > 0)) { Object.assign(S, to); tween = null; S.blending = false; derive(); return; }
    let dh = wrap24(to.hours - S.hours); if (dh > 12) dh -= 24; // shortest way round the clock
    const h0 = S.hours, o0 = S.overcast, o1 = to.overcast ?? S.overcast, N = 96, arc = new Float32Array(N + 1);
    let prevN = S.night, prevI = S.lightIntensity, prevDir = S.sunDir.clone();
    for (let step = 1; step <= N; step++) {
      const f = step / N;
      S.hours = wrap24(h0 + dh * f); S.overcast = mix(o0, o1, f); derive();
      arc[step] = arc[step - 1] + 3 * Math.abs(S.night - prevN) + 2 * Math.abs(S.lightIntensity - prevI) / ATMO.sunLux
        + prevDir.angleTo(S.sunDir) + 0.3 / N + Math.abs(o1 - o0) / N;
      prevN = S.night; prevI = S.lightIntensity; prevDir.copy(S.sunDir);
    }
    S.hours = h0; S.overcast = o0; derive();
    tween = { h0, dh, o0, o1, arc, t: 0, sec };
    S.blending = true;
  }
  function tweenAt(k) { // eased progress 0..1 -> path fraction 0..1 through the cost table
    const a = tween.arc, N = a.length - 1, want = k * a[N];
    let i = 1; while (i < N && a[i] < want) i++;
    const seg = a[i] - a[i - 1];
    return (i - 1 + (seg > 0 ? (want - a[i - 1]) / seg : 1)) / N;
  }

  const api = {
    state: S,
    update(dt) {
      dt = Math.min(Math.max(dt || 0, 0), 0.25);
      if (tween) {
        tween.t = Math.min(1, tween.t + dt / tween.sec);
        const f = tweenAt(ramp(tween.t, 0, 1));
        S.hours = wrap24(tween.h0 + tween.dh * f); S.overcast = mix(tween.o0, tween.o1, f);
        if (tween.t >= 1) { tween = null; S.blending = false; }
      } else if (S.timeScale) S.hours = wrap24(S.hours + dt * S.timeScale / 3600);
      derive();
    },
    setPreset(name, blendSec = 3) {
      const p = PRESETS[name]; if (!p) throw new Error(`daylight: unknown preset "${name}"`);
      S.preset = name; startTween(p(S.dayOfYear), blendSec);
    },
    setTime(hours, blendSec = 0) { S.preset = 'custom'; startTween({ hours: wrap24(hours), overcast: S.overcast }, blendSec); },
    setOvercast(v, blendSec = 0) { startTween({ hours: S.hours, overcast: Math.min(1, Math.max(0, v)) }, blendSec); },
    setTimeScale(s) { S.timeScale = Math.max(0, +s || 0); },
    setDayOfYear(d) { S.dayOfYear = Math.min(365, Math.max(1, Math.round(d))); derive(); },
    activate() { active = api; },
    dispose() { if (active === api) active = null; },
  };
  const p0 = PRESETS[preset] ? preset : 'day';
  S.preset = p0; Object.assign(S, PRESETS[p0](dayOfYear)); derive();
  active = api;
  return api;
}
