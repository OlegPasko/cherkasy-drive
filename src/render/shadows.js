// Cascaded sun / moon shadows around the active camera, on three's SunLight (two cascades in one depth atlas,
// fitted to the view frustum, rotation-stable and texel-snapped, blended across the split).
//
//   createShadows({ scene, renderer, daylight, quality = 'high' }) -> shadows
//     shadows.update(dt, camera, groundY = 0)   aim + colour the light from daylight, pick the shadow reach from the
//                                               camera's height above ground, schedule the atlas redraw
//     shadows.light              the THREE SunLight (the only shadow-casting light; add no other shadowed sun light)
//     shadows.sunDirection       world unit vector toward the active light (sun by day, moon by night)
//     shadows.setQuality('low' | 'medium' | 'high'), shadows.setReachLimit(m), shadows.invalidate()
//     shadows.stats { reach, mapSize, redraws }, shadows.dispose()
//
// Reach (the far end of the second cascade) grows with altitude: ~250 m at street level keeps the first cascade a few
// centimetres per texel for the car; over the city it opens to 1-3 km for building masses. It moves in coarse steps
// with hysteresis, because every change of the split re-fits both cascades and would shimmer if it changed each frame.
// World systems decide who casts: small props and far instances should leave castShadow off.
import * as THREE from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { isReversedDepth } from './renderer.js';

const QUALITY = {
  low: { mapSize: 1024, maxReach: 900, radius: 1.2, every: 2 },
  medium: { mapSize: 2048, maxReach: 1700, radius: 1.8, every: 1 },
  high: { mapSize: 2048, maxReach: 2800, radius: 2.2, every: 1 },
};
const REACH_STEP = 1.3;

export function createShadows({ scene, renderer, daylight, quality = 'high' } = {}) {
  const S = daylight.state;
  const light = new SunLight(0xffffff, 1);
  light.name = 'sun';
  light.castShadow = true;
  light.shadow.camera.near = 1;
  scene.add(light);

  const reversed = isReversedDepth(renderer);
  let Q = QUALITY.high, reach = 0, reachLimit = Infinity, frame = 0, redraws = 0;

  function setQuality(q) {
    Q = QUALITY[q] || QUALITY.high;
    const sh = light.shadow;
    if (sh.mapSize.x !== Q.mapSize) {
      sh.mapSize.set(Q.mapSize, Q.mapSize);
      sh.map?.dispose(); sh.map = null;      // reallocated at the new size on the next shadow pass
    }
    sh.radius = Q.radius;
    reach = 0;                                // force a re-pick
    renderer.shadowMap.needsUpdate = true;
  }
  setQuality(quality);

  function pickReach(camera, groundY) {
    const alt = Math.max(0, camera.position.y - groundY);
    const want = Math.min(Q.maxReach, reachLimit, 240 + alt * 3.2);
    // quantise to REACH_STEP powers and only switch when clearly outside the current band
    const snapped = Math.pow(REACH_STEP, Math.round(Math.log(want) / Math.log(REACH_STEP)));
    if (!reach || want > reach * REACH_STEP * 1.05 || want < reach / (REACH_STEP * 1.05)) reach = Math.min(snapped, Q.maxReach);
    return reach;
  }

  function update(dt, camera, groundY = 0) {
    frame++;
    light.position.copy(S.lightDir);         // a SunLight shines from its position toward the origin
    light.color.copy(S.lightColor);
    light.intensity = S.lightIntensity;
    if (!camera) return;
    const r = pickReach(camera, groundY);
    const sh = light.shadow;
    if (sh.camera.far !== r) { sh.camera.far = r; sh.camera.updateProjectionMatrix(); }
    // texel footprint of the near cascade grows with reach: scale the offsets with it (acne vs peter-panning)
    sh.normalBias = 0.03 + r * 0.00011;
    sh.bias = (reversed ? 1 : -1) * 0.00015;
    // no redraw while the light is dark (sun/moon hand-over): the stale atlas is invisible then
    if (light.intensity > 1e-3 && frame % Q.every === 0) { renderer.shadowMap.needsUpdate = true; redraws++; }
  }

  return {
    light,
    get sunDirection() { return S.lightDir; },
    update,
    setQuality,
    setReachLimit(m) { reachLimit = m > 0 ? m : Infinity; reach = 0; },
    invalidate() { renderer.shadowMap.needsUpdate = true; },
    get stats() { return { reach, mapSize: Q.mapSize, redraws }; },
    dispose() { scene.remove(light); light.dispose(); },
  };
}
