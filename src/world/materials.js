// Shared city material plumbing + the detail material (vertex colour + per-vertex part id) used by pitched roofs,
// domes, facade-kit dressing and Oleg's hand-built Cherkasy sites.
//
// Exports
//   DP = { PAINT, WOOD, STEEL, GLASS, CONC, GALV, CANVAS, BRICK, GRATE, WIRE, LIGHT }  part ids (MeshBuilder.setPart)
//   cityUniforms   { nightFactor, skyTop, skyHorizon, reflect, glow }: one set of uniforms shared by the facade and
//                  detail materials, so a single write per frame drives every city material
//   setNightFactor(v)  v in [0, 1] (render/daylight.js nightFactor()); setSkyColors(top, horizon) linear THREE.Color
//   createDetailMaterial(T?) -> MeshStandardMaterial; geometry needs position, normal, color and 'part'
//                  (MeshBuilder.build({part: true})). GLASS ignores the vertex colour; LIGHT glows at night.
//   patchMaterial(mat, key, fn(shader)) – onBeforeCompile that survives later assignments (CSM.setupMaterial sets
//                  its own onBeforeCompile: both run) and gets its own program cache key
import * as THREE from 'three';

// order is the stored Uint8 id: append new parts at the end
export const DP = Object.freeze(Object.fromEntries('PAINT WOOD STEEL GLASS CONC GALV CANVAS BRICK GRATE WIRE LIGHT'.split(' ').map((k, i) => [k, i])));

export const cityUniforms = {
  nightFactor: { value: 0 },
  skyTop: { value: new THREE.Color(0.32, 0.5, 0.82) },
  skyHorizon: { value: new THREE.Color(0.75, 0.82, 0.9) },
  reflect: { value: 0.35 }, // fake sky reflection on glass; lower it when a real env map / SSR is present
  glow: { value: 1.1 }, // lit-window emission scale (linear HDR)
};
export const setNightFactor = (v) => { cityUniforms.nightFactor.value = Math.min(1, Math.max(0, v)); };
export const setSkyColors = (top, horizon) => { cityUniforms.skyTop.value.copy(top); cityUniforms.skyHorizon.value.copy(horizon); };

export function patchMaterial(mat, key, fn) {
  let extra = null;
  Object.defineProperty(mat, 'onBeforeCompile', {
    configurable: true,
    get: () => (shader, renderer) => { fn(shader, renderer); if (extra) extra(shader, renderer); },
    set: (f) => { extra = f; },
  });
  mat.customProgramCacheKey = () => key;
  return mat;
}

// GLSL shared by the city materials: hashes and the cheap sky reflection
export const GLSL_COMMON = /* glsl */ `
uniform float nightFactor;
uniform vec3 skyTop;
uniform vec3 skyHorizon;
uniform float reflectK;
uniform float glowK;
float cHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float cHash3(vec3 p) { return cHash(p.xy + p.z * 17.13); }
vec3 skyReflect(vec3 N, vec3 V, float f0) {
  vec3 R = reflect(-V, N);
  float up = clamp(R.y * 1.6, -1.0, 1.0);
  vec3 sky = up > 0.0 ? mix(skyHorizon, skyTop, up) : mix(skyHorizon * 0.5, vec3(0.05, 0.05, 0.055), -up);
  float fr = f0 + (1.0 - f0) * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  return sky * fr * reflectK * (1.0 - 0.85 * nightFactor);
}
`;
export function bindCityUniforms(shader) {
  shader.uniforms.nightFactor = cityUniforms.nightFactor;
  shader.uniforms.skyTop = cityUniforms.skyTop;
  shader.uniforms.skyHorizon = cityUniforms.skyHorizon;
  shader.uniforms.reflectK = cityUniforms.reflect;
  shader.uniforms.glowK = cityUniforms.glow;
}

export function createDetailMaterial(T = null) {
  const mat = Object.assign(new THREE.MeshStandardMaterial(), { name: 'city-detail', vertexColors: true, roughness: 0.8, metalness: 0 });
  const noise = T?.noise ?? null;
  patchMaterial(mat, 'city-detail-v1', (s) => {
    bindCityUniforms(s);
    s.uniforms.tNoise = { value: noise };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float part;\nflat varying float vPart;\nvarying vec3 vDWPos;\nvarying vec3 vDWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = part;\nvDWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvDWN = normalize(mat3(modelMatrix) * objectNormal);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON}\nuniform sampler2D tNoise;\nflat varying float vPart;\nvarying vec3 vDWPos;\nvarying vec3 vDWN;\n` + (noise ? '#define HAS_NOISE\n' : ''))
      .replace('#include <color_fragment>', `#include <color_fragment>
  int dp = int(vPart + 0.5);
  vec3 dN = normalize(vDWN);
  vec3 dV = normalize(cameraPosition - vDWPos);
  float dRough = 0.8, dMetal = 0.0;
  vec3 dEmit = vec3(0.0);
  // world-aligned coordinates on the dominant plane for procedural grain
  vec2 dUv = abs(dN.y) > 0.7 ? vDWPos.xz : (abs(dN.x) > abs(dN.z) ? vDWPos.zy : vDWPos.xy);
  float dn = 0.5;
#ifdef HAS_NOISE
  dn = texture2D(tNoise, dUv * 0.37).r;
#endif
  if (dp == ${DP.WOOD}) { float g = sin((dUv.x + dn * 0.6) * 38.0) * 0.5 + 0.5; diffuseColor.rgb *= 0.85 + 0.15 * g; dRough = 0.75; }
  else if (dp == ${DP.STEEL}) { dRough = 0.38; dMetal = 0.75; }
  else if (dp == ${DP.GLASS}) { diffuseColor.rgb = vec3(0.025, 0.03, 0.035); dRough = 0.06; dEmit += skyReflect(dN, dV, 0.06); }
  else if (dp == ${DP.CONC}) { diffuseColor.rgb *= 0.86 + 0.28 * dn; dRough = 0.93; }
  else if (dp == ${DP.GALV}) { diffuseColor.rgb *= 0.9 + 0.2 * dn; dRough = 0.45; dMetal = 0.65; }
  else if (dp == ${DP.CANVAS}) { dRough = 0.96; }
  else if (dp == ${DP.BRICK}) {
    vec2 b = dUv * vec2(1.0 / 0.26, 1.0 / 0.077); b.x += step(1.0, mod(b.y, 2.0)) * 0.5;
    vec2 f = fract(b); float j = step(0.94, f.x) + step(0.87, f.y);
    diffuseColor.rgb *= mix(0.9 + 0.2 * cHash(floor(b)), 1.25, clamp(j, 0.0, 1.0)); dRough = 0.9;
  }
  else if (dp == ${DP.GRATE}) { vec2 f = fract(dUv * 8.0); diffuseColor.rgb *= 0.6 + 0.4 * step(0.3, min(f.x, f.y)); dRough = 0.6; dMetal = 0.5; }
  else if (dp == ${DP.WIRE}) { diffuseColor.rgb *= 0.5; dRough = 0.5; dMetal = 0.6; }
  else if (dp == ${DP.LIGHT}) { dEmit += diffuseColor.rgb * (0.15 + 3.0 * nightFactor); }
  else { diffuseColor.rgb *= 0.95 + 0.1 * dn; dRough = 0.7; }
`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = dRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = dMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += dEmit;');
  });
  return mat;
}
