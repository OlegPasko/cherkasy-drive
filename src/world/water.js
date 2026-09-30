// Water: the Dnipro / Kremenchuk reservoir surface, ponds, wet stains + lapping foam along the embankments.
//
//   WATER_Y: the shared surface datum (m). Ground water classification, waterfront props and car water contact use it.
//   buildWater({ scene, T?, renderer?, shore?, shoreDist?, skirtWater?, y = WATER_Y, reflect = true, reflectHz = 12,
//                reflectScale = 0.4, skirtRadius = 24000, skirtCenter = [0, 0] }) -> water
//     One camera-following disc at the datum under everything: land geometry sits above it, so the surface covers the
//     reservoir to the horizon with no seams. skirtWater(dx, dz) -> bool classifies directions beyond skirtRadius
//     (unit vector from skirtCenter): false -> a dull land-coloured band there, fogged into the horizon.
//     renderer enables a planar reflection (reduced resolution, reflectHz, oblique near plane, faded out when
//     shoreDist(camera) says the river is far away); without it the material falls back to the scene environment.
//     water.update(dt, camera?) every frame (camera may be missing); water.setReflection(on); water.reflectCull(obj) ->
//     unregister(): obj (drawn with frustumCulled = false, e.g. the player car) is left out of a capture whose view its
//     world bounds miss – no visible change, its draw calls saved; water.setSkyAdd(rgb):
//     extra sky radiance when the scene has no environment map; water.mesh; water.material; water.y; water.stats();
//     water.dispose(). `shore` is accepted for the legacy call (shore treatment comes from buildWetBands).
//   buildWetBands({ scene, T?, segs, y = WATER_Y, isWater?, foam = true }) -> { mesh, foam, update(dt), dispose() }
//     segs: [{ ax, az, bx, bz, nx, nz }] wall / pier / embankment edges, (nx, nz) the horizontal normal facing the
//     water. Builds one stain strip (ragged dark silt / algae band just proud of the wall) and one foam strip on the
//     water. Malformed or zero-length segments are skipped; if isWater(x, z) is given, a segment whose normal does not
//     point into water is skipped too. Empty input -> { mesh: null, foam: null } and nothing is added.
//   buildPonds({ scene, map, heightAt }) -> { mesh, update(dt), dispose() }: map.cover.pond polygons with the same
//     animated material (no planar reflection), at the lowest bank height + 5 cm.
// Overlays (stains, foam, ponds) are lifted geometrically (2 / 1.2 / 5 cm) and use only a slope polygon offset: a
// constant offset would push them the wrong way in the game's reversed float depth buffer.
//   waterNormalTexture(): the shared tileable ripple texture (rg: slopes, b: foam noise, a: low-frequency wind mask).
//   obliqueNear(projection, planeInCameraSpace: Vector4, reversedDepth): oblique near plane (exported for tests).
import { Box3, Color, Frustum, HalfFloatType, MathUtils, Matrix4, Mesh, MeshLambertMaterial, MeshStandardMaterial, PerspectiveCamera, Plane, Quaternion, ShapeUtils, Sphere, Vector2, Vector3, Vector4, WebGLRenderTarget } from 'three';
import { meshData, tileTexture, patchShader, rng32 } from './nature/util.js';

export const WATER_Y = -1.6;

// one clock for every water material; the first object whose update() runs drives it
const CLOCK = { uTime: { value: 0 }, owner: null };
const tick = (self, dt) => { CLOCK.owner ??= self; if (CLOCK.owner === self && Number.isFinite(dt)) CLOCK.uTime.value += dt; };

// ------------------------------------------------------------------------------------------------ ripple texture
let NORMALS = null;
export function waterNormalTexture(size = 256) {
  if (NORMALS) return NORMALS;
  // sums of periodic waves with integer wave numbers tile seamlessly; the ripple slopes are analytic derivatives
  const rnd = rng32(9173), TAU = Math.PI * 2;
  const ripples = Array.from({ length: 44 }, () => { const kk = 2 + Math.floor(rnd() * 22), dir = rnd() * TAU; return [Math.round(Math.cos(dir) * kk), Math.round(Math.sin(dir) * kk), rnd(), rnd() * TAU]; })
    .filter(([kx, kz]) => kx || kz).map(([kx, kz, amp, ph]) => [kx, kz, Math.pow(Math.hypot(kx, kz), -1.4) * (0.6 + amp * 0.8), ph]);
  const lowWaves = Array.from({ length: 8 }, () => [(1 + Math.floor(rnd() * 3)) * (rnd() < 0.5 ? -1 : 1), Math.floor(rnd() * 4) - 1, 0.5 + rnd(), rnd() * TAU]);
  const foamWaves = Array.from({ length: 14 }, () => [Math.floor(rnd() * 25) - 12, Math.floor(rnd() * 25) - 12, 0.5 + rnd(), rnd() * TAU]);
  const count = size * size, chan = [new Float32Array(count), new Float32Array(count), new Float32Array(count), new Float32Array(count)];
  const wave = (list, u, v) => list.reduce((acc, [kx, kz, amp, ph]) => acc + Math.sin(kx * u + kz * v + ph) * amp, 0);
  for (let idx = 0; idx < count; idx += 1) {
    const u = (idx % size) / size * TAU, v = Math.floor(idx / size) / size * TAU;
    let gx = 0, gz = 0;
    for (const [kx, kz, amp, ph] of ripples) { const c = Math.cos(kx * u + kz * v + ph) * amp; gx += c * kx; gz += c * kz; }
    chan[0][idx] = gx; chan[1][idx] = gz; chan[2][idx] = wave(foamWaves, u, v); chan[3][idx] = wave(lowWaves, u, v);
  }
  // slopes share one symmetric scale (keeps their ratio); foam and wind masks are stretched to 0..1
  const range = (arr) => arr.reduce(([lo, hi], x) => [Math.min(lo, x), Math.max(hi, x)], [Infinity, -Infinity]);
  const sMax = Math.max(...range(chan[0]).map(Math.abs), ...range(chan[1]).map(Math.abs));
  const maps = [[-sMax, sMax], [-sMax, sMax], range(chan[2]), range(chan[3])];
  const bytes = new Uint8Array(count * 4);
  chan.forEach((arr, c) => { const [lo, hi] = maps[c]; for (let idx = 0; idx < count; idx += 1) bytes[idx * 4 + c] = Math.round(255 * (arr[idx] - lo) / (hi - lo)); });
  NORMALS = tileTexture(bytes, size, size);
  NORMALS.anisotropy = 8;
  return NORMALS;
}

// ------------------------------------------------------------------------------------------------ material
const RIPPLE_GLSL = `
uniform sampler2D tRipple; uniform float uTime;
varying vec3 vWPos;
vec2 rip(vec2 p, float s, float ang, vec2 flow) { float c = cos(ang), d = sin(ang); vec2 q = mat2(c, -d, d, c) * p / s + flow * uTime; return texture2D(tRipple, q).rg * 2.0 - 1.0; }
// world-space slope field: micro ripples near the camera, mid chop, broad swell; a slow low-frequency mask makes calm
// patches and wind bands. Returns (slope.x, slope.z, wind 0..1, roughness).
vec4 waterField(vec2 p, float dist) {
  float w1 = texture2D(tRipple, p / 900.0 + vec2(0.0011, 0.0007) * uTime).a, w2 = texture2D(tRipple, p / 310.0 * mat2(0.8, -0.6, 0.6, 0.8) - vec2(0.002, 0.0013) * uTime).a;
  float wind = smoothstep(0.3, 0.72, w1 * 0.65 + w2 * 0.35);
  float fNear = 1.0 - smoothstep(40.0, 260.0, dist), fMid = 1.0 - smoothstep(250.0, 1400.0, dist);
  // layers at irrational scales / odd angles so their tiles never line up into a grid
  vec2 s = rip(p, 4.3, 0.41, vec2(0.021, 0.013)) * 0.28 * fNear * mix(0.35, 1.1, wind)
         + rip(p, 13.7, 1.13, vec2(-0.012, 0.009)) * 0.3 * fMid * mix(0.45, 1.0, wind)
         + rip(p, 41.0, 2.37, vec2(0.006, -0.004)) * 0.24 * mix(0.6, 1.0, wind)
         + rip(p, 173.0, 3.9, vec2(0.0012, 0.0009)) * 0.18;
  float rough = mix(0.035, 0.1, wind) + smoothstep(300.0, 5000.0, dist) * 0.1;
  return vec4(s * 0.4, wind, rough);
}`;

function waterMaterial({ planar, skirt }) {
  const m = new MeshStandardMaterial({ color: new Color(0.016, 0.03, 0.028), roughness: 0.06, metalness: 0, envMapIntensity: 1 });
  const u = {
    tRipple: { value: waterNormalTexture() }, uTime: CLOCK.uTime,
    tRefl: { value: null }, uReflMat: { value: new Matrix4() }, uReflW: { value: 0 },
    uSkyAdd: { value: new Color(0, 0, 0) },
    uSkirt: { value: new Vector4(0, 0, 1e9, 0) }, tSkirt: { value: null }, uLand: { value: new Color(0.035, 0.045, 0.03) },
  };
  m.userData.u = u;
  m.defines = { ...(planar ? { WATER_PLANAR: '' } : {}), ...(skirt ? { WATER_SKIRT: '' } : {}) };
  m.onBeforeCompile = (shader) => patchShader(shader, u, [
    ['common', '#include <common>\nvarying vec3 vWPos;'],
    ['worldpos_vertex', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'],
  ], [
    ['common', `#include <common>
${RIPPLE_GLSL}
uniform sampler2D tRefl; uniform mat4 uReflMat; uniform float uReflW; uniform vec3 uSkyAdd;
uniform vec4 uSkirt; uniform sampler2D tSkirt; uniform vec3 uLand;`],
    ['roughnessmap_fragment', `
float wDist = length(vWPos - cameraPosition);
vec4 wF = waterField(vWPos.xz, wDist);
float wLand = 0.0;
#ifdef WATER_SKIRT
{ vec2 dv = vWPos.xz - uSkirt.xy; float dl = length(dv);
  if (dl > uSkirt.z) wLand = (1.0 - texture2D(tSkirt, vec2(atan(dv.y, dv.x) / 6.2831853 + 0.5, 0.5)).r) * smoothstep(uSkirt.z, uSkirt.z + 600.0, dl); }
#endif
vec3 wN = normalize(vec3(-wF.x, 1.0, -wF.y) * vec3(1.0 - wLand, 1.0, 1.0 - wLand));
diffuseColor.rgb = mix(diffuseColor.rgb * mix(0.85, 1.12, wF.z), uLand, wLand);
float roughnessFactor = mix(wF.w, 0.95, wLand);`],
    ['normal_fragment_maps', 'normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);'],
    // the planar mirror replaces part of the environment radiance, so the standard BRDF still applies fresnel
    ['lights_fragment_end', `
#if defined( RE_IndirectSpecular )
#ifdef WATER_PLANAR
if (uReflW > 0.0) {
  vec4 rp = uReflMat * vec4(vWPos, 1.0);
  vec2 ruv = rp.xy / rp.w + wN.xz * 0.03 * (1.0 - smoothstep(200.0, 2000.0, wDist));
  float edge = smoothstep(0.0, 0.07, ruv.x) * smoothstep(1.0, 0.93, ruv.x) * smoothstep(0.0, 0.07, ruv.y) * smoothstep(1.0, 0.93, ruv.y);
  radiance = mix(radiance, texture2D(tRefl, ruv).rgb, uReflW * edge * (1.0 - wLand));
}
#endif
radiance += uSkyAdd * (1.0 - wLand);
#endif
#include <lights_fragment_end>`],
  ]);
  m.customProgramCacheKey = () => 'water' + (planar ? 'P' : '') + (skirt ? 'S' : '');
  return m;
}

// camera-centred disc, unit radius, rings spaced geometrically (flat: the density only keeps triangles well shaped)
function discGeometry(rings = 28, segs = 64) {
  const pos = [0, 0, 0], tris = [];
  const vid = (ring, seg) => (ring ? 1 + (ring - 1) * segs + (seg % segs) : 0);
  for (let ring = 1; ring <= rings; ring += 1) {
    const rad = (ring / rings) ** 3;
    for (let seg = 0; seg < segs; seg += 1) { const ang = seg / segs * Math.PI * 2; pos.push(Math.cos(ang) * rad, 0, Math.sin(ang) * rad); }
    for (let seg = 0; seg < segs; seg += 1) {
      if (ring === 1) { tris.push(0, vid(1, seg + 1), vid(1, seg)); continue; }
      const a0 = vid(ring - 1, seg), a1 = vid(ring - 1, seg + 1), b0 = vid(ring, seg), b1 = vid(ring, seg + 1);
      tris.push(a0, a1, b1, a0, b1, b0);
    }
  }
  const up = pos.map((_, i) => +(i % 3 === 1));
  return meshData({ position: [pos, 3], normal: [up, 3] }, tris);
}

// replace the near-plane row of a projection so it clips along plane C (camera space); works for the standard and
// the reversed [1..0] depth range (Lengyel's oblique frustum, solved numerically through the far corner)
const _inv = new Matrix4(), _q = new Vector4();
export function obliqueNear(P, C, reversed) {
  _inv.copy(P).invert();
  _q.set(Math.sign(C.x), Math.sign(C.y), reversed ? 0 : 1, 1).applyMatrix4(_inv);
  if (Math.abs(_q.w) < 1e-9) return;
  _q.multiplyScalar(1 / _q.w);
  const cq = C.dot(_q); if (Math.abs(cq) < 1e-9) return;
  const e = P.elements;
  if (reversed) { const a = -_q.z / cq; e[2] = -a * C.x; e[6] = -a * C.y; e[10] = -1 - a * C.z; e[14] = -a * C.w; }
  else { const a = -2 * _q.z / cq; e[2] = a * C.x; e[6] = a * C.y; e[10] = a * C.z + 1; e[14] = a * C.w; }
}

export function buildWater({ scene, renderer = null, shoreDist = null, skirtWater = null, y = WATER_Y, reflect = true, reflectHz = 12, reflectScale = 0.4, skirtRadius = 24000, skirtCenter = [0, 0] } = {}) {
  const planar = !!(renderer && reflect);
  const skirt = typeof skirtWater === 'function';
  const material = waterMaterial({ planar, skirt }), u = material.userData.u;
  const mesh = new Mesh(discGeometry(), material);
  mesh.name = 'water'; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.renderOrder = 2; // after the ground: early-z
  mesh.position.y = y; mesh.scale.setScalar(40000);
  scene?.add?.(mesh);

  if (skirt) { // direction -> water (255) / land (0) lookup, 256 compass steps
    const steps = 256, bytes = new Uint8Array(steps * 4);
    for (let st = 0; st < steps; st += 1) {
      const ang = ((st + 0.5) / steps - 0.5) * Math.PI * 2;
      let wet = true; try { wet = !!skirtWater(Math.cos(ang), Math.sin(ang)); } catch { wet = true; }
      bytes.fill(wet ? 255 : 0, st * 4, st * 4 + 4);
    }
    u.tSkirt.value = tileTexture(bytes, steps, 1, { wrapY: false, mips: false });
    u.uSkirt.value.set(skirtCenter[0], skirtCenter[1], skirtRadius, 1);
  }

  // ---- planar reflection, rendered from inside the main render (onBeforeRender) at reduced size and rate
  const R = { on: planar, rt: null, cam: new PerspectiveCamera(), weight: 0, busy: false, failed: false, ms: 0, renders: 0, culled: 0 };
  const last = { t: -1e9, pos: new Vector3(1e9, 0, 0), dir: new Vector3() };
  const eye = new Vector3(), look = new Vector3(), bufSize = new Vector2(), qTmp = new Quaternion();
  const mirrorPlane = new Plane(), clipC = new Vector4(), UP = new Vector3(0, 1, 0);
  const toUV = new Matrix4().makeScale(0.5, 0.5, 0.5).setPosition(0.5, 0.5, 0.5); // clip -> [0, 1]
  // objects drawn with frustumCulled = false (the player car: ~200 draws) are hidden from a capture that cannot see
  // them; only the four side planes are tested, the ones the oblique near plane leaves untouched
  const cullSet = new Set(), hidden = [], fr = new Frustum(), pv = new Matrix4(), box = new Box3(), sph = new Sphere();
  const inMirror = (o) => {
    if (box.setFromObject(o).isEmpty()) return true;
    box.getBoundingSphere(sph);
    for (let i = 0; i < 4; i += 1) if (fr.planes[i].distanceToPoint(sph.center) < -sph.radius) return false;
    return true;
  };
  if (planar) {
    mesh.onBeforeRender = (rend, scn, camera) => {
      if (!R.on || R.failed || R.busy || R.weight <= 0.001 || !camera?.isPerspectiveCamera || camera === R.cam || scn.overrideMaterial) return;
      camera.getWorldPosition(eye); camera.getWorldDirection(look);
      if (eye.y < y + 0.05) return; // under water
      const now = (globalThis.performance ?? Date).now();
      const due = now - last.t > 1000 / reflectHz || eye.distanceTo(last.pos) > 12 || look.dot(last.dir) < 0.99;
      if (!due) return;
      R.busy = true;
      const t0 = now, prevRT = rend.getRenderTarget(), prevXR = rend.xr.enabled, prevSh = rend.shadowMap.autoUpdate;
      try {
        rend.getDrawingBufferSize(bufSize);
        const rw = Math.max(64, Math.min(1024, Math.round(bufSize.x * reflectScale))), rh = Math.max(32, Math.round(rw * bufSize.y / Math.max(1, bufSize.x)));
        R.rt ??= new WebGLRenderTarget(rw, rh, { depthBuffer: true, type: HalfFloatType });
        if (R.rt.width !== rw || R.rt.height !== rh) R.rt.setSize(rw, rh);
        // mirror the camera about the datum plane
        const rc = R.cam;
        rc.fov = Math.min(120, camera.fov * 1.15); rc.aspect = camera.aspect; rc.near = camera.near; rc.far = camera.far;
        rc._reversedDepth = camera.reversedDepth; rc.updateProjectionMatrix();
        rc.position.set(eye.x, 2 * y - eye.y, eye.z);
        rc.up.copy(UP).applyQuaternion(camera.getWorldQuaternion(qTmp)); rc.up.y *= -1;
        rc.lookAt(rc.position.x + look.x, rc.position.y - look.y, rc.position.z + look.z);
        rc.updateMatrixWorld(); rc.matrixWorldInverse.copy(rc.matrixWorld).invert();
        rc.layers.mask = camera.layers.mask;
        u.uReflMat.value.multiplyMatrices(toUV, rc.projectionMatrix).multiply(rc.matrixWorldInverse);
        mirrorPlane.set(UP, 0.05 - y).applyMatrix4(rc.matrixWorldInverse); // keep what is above the water (+5 cm)
        clipC.set(mirrorPlane.normal.x, mirrorPlane.normal.y, mirrorPlane.normal.z, mirrorPlane.constant);
        obliqueNear(rc.projectionMatrix, clipC, !!camera.reversedDepth);
        rc.projectionMatrixInverse.copy(rc.projectionMatrix).invert();
        if (cullSet.size) {
          fr.setFromProjectionMatrix(pv.multiplyMatrices(rc.projectionMatrix, rc.matrixWorldInverse));
          for (const o of cullSet) if (o.visible && !inMirror(o)) { o.visible = false; hidden.push(o); }
        }
        mesh.visible = false; rend.xr.enabled = false; rend.shadowMap.autoUpdate = false;
        rend.setRenderTarget(R.rt); rend.state.buffers.depth.setMask(true);
        if (rend.autoClear === false) rend.clear();
        rend.render(scn, rc);
        u.tRefl.value = R.rt.texture;
        last.t = now; last.pos.copy(eye); last.dir.copy(look); R.renders += 1; R.culled = hidden.length;
      } catch (e) {
        R.failed = true; u.uReflW.value = 0; console.warn('[water] planar reflection disabled', e);
      } finally {
        for (const o of hidden) o.visible = true;
        hidden.length = 0;
        mesh.visible = true; rend.xr.enabled = prevXR; rend.shadowMap.autoUpdate = prevSh;
        rend.setRenderTarget(prevRT);
        if (camera.viewport !== undefined) rend.state.viewport(camera.viewport);
      }
      R.ms = (globalThis.performance ?? Date).now() - t0;
      R.busy = false;
    };
  }

  return {
    mesh, material, y,
    update(dt, camera) {
      tick(this, dt);
      if (!camera?.position) return;
      mesh.position.set(camera.position.x, y, camera.position.z);
      mesh.scale.setScalar(Math.max(4000, Math.min(60000, (camera.far || 40000) * 0.98)));
      if (!planar) return;
      // the mirror only matters with the river in view: fade it out deep inland at street level
      let target = R.on ? 1 : 0;
      if (target && typeof shoreDist === 'function') {
        let d = 0; try { d = shoreDist(camera.position.x, camera.position.z); } catch { d = 0; }
        if (Number.isFinite(d)) target = 1 - MathUtils.smoothstep(d - Math.max(0, camera.position.y - y) * 2.5, 300, 700);
      }
      R.weight += (target - R.weight) * Math.min(1, (dt || 0) * 3);
      u.uReflW.value = u.tRefl.value && !R.failed ? R.weight * 0.9 : 0;
    },
    setReflection(on) { R.on = !!on && planar; if (!R.on) u.uReflW.value = 0; },
    reflectCull(obj) { if (obj) cullSet.add(obj); return () => cullSet.delete(obj); },
    setSkyAdd(c) { if (c) u.uSkyAdd.value.set(c[0] ?? c.r, c[1] ?? c.g, c[2] ?? c.b); },
    stats: () => ({ planar: planar && R.on && !R.failed, reflWeight: +R.weight.toFixed(2), reflRenders: R.renders, reflMs: +R.ms.toFixed(2), reflCulled: R.culled, rt: R.rt ? [R.rt.width, R.rt.height] : null }),
    dispose() { mesh.removeFromParent(); mesh.geometry.dispose(); material.dispose(); R.rt?.dispose(); u.tSkirt.value?.dispose(); if (CLOCK.owner === this) CLOCK.owner = null; },
  };
}

// ------------------------------------------------------------------------------------------------ wet bands + foam
// 1-D value noise from an integer hash (smoothstep blend between lattice values)
const lattice = (i) => { let h = Math.imul(i ^ 0x5f356495, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; };
const noise1 = (x) => { const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return lattice(i) * (1 - s) + lattice(i + 1) * s; };
// ragged top edge as a function of world position (joined segments see the same height at a shared end point)
const stainTop = (x, z) => 0.45 + 0.55 * noise1(x * 0.31 + z * 0.17) + 0.35 * noise1(x * 1.3 - z * 1.1 + 40);
// stain rows bottom -> top: [height rule, rgba]; the third row sits 75 % of the way up to the ragged top
const STAIN_ROWS = [['under', [0.022, 0.03, 0.016, 0.92]], ['line', [0.024, 0.032, 0.017, 0.9]], ['mid', [0.045, 0.043, 0.034, 0.78]], ['top', [0.06, 0.056, 0.047, 0]]];

export function buildWetBands({ scene, segs, y = WATER_Y, isWater = null, foam = true } = {}) {
  const stain = { position: [], normal: [], color: [] }, lap = { position: [], normal: [], uv: [] };
  const rowY = (rule, top) => (rule === 'under' ? y - 0.5 : rule === 'line' ? y + 0.12 : rule === 'mid' ? y + 0.12 + (top - y - 0.12) * 0.75 : top);
  let used = 0;
  for (const sg of Array.isArray(segs) ? segs : []) {
    const vals = sg ? [sg.ax, sg.az, sg.bx, sg.bz, sg.nx, sg.nz] : [];
    if (vals.length < 6 || !vals.every(Number.isFinite)) continue;
    const [ax, az, bx, bz] = vals, dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), nLen = Math.hypot(vals[4], vals[5]);
    if (len < 0.05 || nLen < 0.1) continue;
    const nx = vals[4] / nLen, nz = vals[5] / nLen;
    if (isWater) { let wet = true; try { wet = isWater((ax + bx) / 2 + nx * 3, (az + bz) / 2 + nz * 3); } catch { wet = true; } if (!wet) continue; }
    used += 1;
    const facing = dx * nz - dz * nx > 0, ccwUp = dz * nx - dx * nz > 0; // stain quads face the water, foam faces up
    const pieces = Math.max(1, Math.ceil(len / 1.5)), off = 0.02, reach = 3.5;
    const at = (f) => ({ x: ax + dx * f, z: az + dz * f, top: y + stainTop(ax + dx * f, az + dz * f) });
    for (let pc = 0; pc < pieces; pc += 1) {
      const e0 = at(pc / pieces), e1 = at((pc + 1) / pieces);
      const x0 = e0.x + nx * off, z0 = e0.z + nz * off, x1 = e1.x + nx * off, z1 = e1.z + nz * off;
      for (let row = 1; row < STAIN_ROWS.length; row += 1) {
        const [lo, cLo] = STAIN_ROWS[row - 1], [hi, cHi] = STAIN_ROWS[row];
        const q = [[x0, rowY(lo, e0.top), z0, cLo], [x1, rowY(lo, e1.top), z1, cLo], [x1, rowY(hi, e1.top), z1, cHi], [x0, rowY(hi, e0.top), z0, cHi]];
        for (const k of facing ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) { stain.position.push(q[k][0], q[k][1], q[k][2]); stain.color.push(...q[k][3]); stain.normal.push(nx, 0, nz); }
      }
      if (!foam) continue;
      const fy = y + 0.012, q = [[x0, z0, 0], [x1, z1, 0], [x1 + nx * reach, z1 + nz * reach, 1], [x0 + nx * reach, z0 + nz * reach, 1]];
      for (const k of ccwUp ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) { lap.position.push(q[k][0], fy, q[k][1]); lap.uv.push(0, q[k][2]); lap.normal.push(0, 1, 0); }
    }
  }
  const out = { mesh: null, foam: null, segments: used, update() {}, dispose() {} };
  if (!used) return out;
  const stainMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  out.mesh = new Mesh(meshData({ position: [stain.position, 3], normal: [stain.normal, 3], color: [stain.color, 4] }), stainMat);
  out.mesh.name = 'wet bands'; out.mesh.receiveShadow = true; out.mesh.renderOrder = 3;
  scene?.add?.(out.mesh);
  if (lap.position.length) {
    const foamMat = new MeshLambertMaterial({ color: new Color(0.62, 0.66, 0.62), depthWrite: false, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
    foamMat.onBeforeCompile = (shader) => patchShader(shader, { tRipple: { value: waterNormalTexture() }, uTime: CLOCK.uTime }, [
      ['common', '#include <common>\nvarying vec3 vWPos; varying float vOut;'],
      ['worldpos_vertex', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vOut = uv.y;'],
    ], [
      ['common', '#include <common>\nuniform sampler2D tRipple; uniform float uTime; varying vec3 vWPos; varying float vOut;'],
      // a slow wash in and out along the wall, broken up by the foam noise channel
      ['alphamap_fragment', `#include <alphamap_fragment>
{ float wash = mix(0.25, 0.75, 0.5 + 0.5 * sin(uTime * 0.9 + dot(vWPos.xz, vec2(0.05, 0.037))));
  float fn = texture2D(tRipple, vWPos.xz / 7.0 + vec2(0.01, 0.006) * uTime).b * 0.6 + texture2D(tRipple, vWPos.xz / 2.3 - vec2(0.013, 0.004) * uTime).b * 0.4;
  diffuseColor.a *= (1.0 - smoothstep(wash * 0.6, wash, vOut)) * smoothstep(0.45, 0.75, fn + (1.0 - vOut) * 0.3) * 0.5; }`],
    ]);
    foamMat.customProgramCacheKey = () => 'shorefoam';
    out.foam = new Mesh(meshData({ position: [lap.position, 3], normal: [lap.normal, 3], uv: [lap.uv, 2] }), foamMat);
    out.foam.name = 'shore foam'; out.foam.renderOrder = 3;
    scene?.add?.(out.foam);
  }
  out.dispose = () => { for (const m of [out.mesh, out.foam]) if (m) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); } };
  return out;
}

// ------------------------------------------------------------------------------------------------ ponds
export function buildPonds({ scene, map, heightAt = null } = {}) {
  const pos = [], tris = [];
  for (const rings of map?.cover?.pond ?? []) {
    if (!Array.isArray(rings) || !rings.length) continue;
    const loops = rings.map(F => Array.from({ length: Math.floor((F?.length ?? 0) / 2) }, (_, k) => new Vector2(F[k * 2], F[k * 2 + 1])));
    const [outer, ...holes] = loops;
    if (outer.length < 3) continue;
    const bank = heightAt ? Math.min(...outer.map(v => heightAt(v.x, v.y)).filter(Number.isFinite)) : Infinity;
    const level = (Number.isFinite(bank) ? bank : WATER_Y) + 0.05, base = pos.length / 3, pts = outer.concat(...holes);
    for (const v of pts) pos.push(v.x, level, v.y);
    for (const [i0, i1, i2] of ShapeUtils.triangulateShape(outer, holes)) {
      const A = pts[i0], B = pts[i1], Cc = pts[i2], cw = (B.y - A.y) * (Cc.x - A.x) - (B.x - A.x) * (Cc.y - A.y) > 0;
      tris.push(base + i0, base + (cw ? i1 : i2), base + (cw ? i2 : i1));
    }
  }
  const out = { mesh: null, update: (dt) => tick(out, dt), dispose() {} };
  if (!pos.length) return out;
  const mat = waterMaterial({ planar: false, skirt: false });
  Object.assign(mat, { polygonOffset: true, polygonOffsetFactor: -2 });
  out.mesh = new Mesh(meshData({ position: [pos, 3], normal: [pos.map((_, i) => +(i % 3 === 1)), 3] }, tris), mat);
  out.mesh.name = 'ponds'; out.mesh.receiveShadow = true;
  scene?.add?.(out.mesh);
  out.dispose = () => { out.mesh.removeFromParent(); out.mesh.geometry.dispose(); mat.dispose(); };
  return out;
}
