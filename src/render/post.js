// The post chain that owns the final image (pmndrs postprocessing + n8ao):
//   scene (linear HDR, half-float) -> N8AO contact AO -> bloom + tone mapping + exposure -> SMAA / FXAA -> sRGB screen
//
//   createPostProcessing({ renderer, scene, camera, quality = 'high', daylight? }) -> post
//     post.render(dt)            draw one frame (resets renderer.info first, so stats cover the whole frame)
//     post.setSize(w, h)         CSS pixels; zero or hidden sizes are ignored until a real size arrives
//     post.setQuality('low' | 'medium' | 'high')   AO on / resolution / glass-aware, AA kind, render scale; resets adaptive
//     post.setAdaptive(f)        render at baseDpr * f (0.25..1, floored at 1 device px per CSS px unless the quality's
//                                own base is lower); CSS size unchanged; post.adaptive, post.baseDpr (min(devicePixelRatio,
//                                maxDpr) * scale), post.pixelRatio (effective). Driven by render/adaptive.js
//     post.setEffect('ao' | 'bloom' | 'aa', on), post.effects -> { ao, bloom, aa }
//     post.setExposure(ev), post.exposure; post.setBloom({ intensity, threshold }); post.setAO({ radius, intensity })
//     post.resetHistory()        after a camera cut / teleport / resize (the chain keeps no long history; AO
//                                accumulation is off, so this is a cheap hook for future temporal passes)
//     post.composer, post.renderScale, post.hdr, post.dispose()
// Exposure: follows daylight.state.exposure with a ~0.8 s time constant (no pumping), times the user EV offset.
// Bloom: thresholded at ~2 / exposure in linear HDR (above the brightest sky and clouds), so only lamps, lit windows,
// signs, glints and the sun glow; its strength rises a little at night via nightFactor. Tone mapping (PBR Neutral) and the sRGB
// encode happen exactly once.
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode,
  SMAAEffect, SMAAPreset, EdgeDetectionMode, FXAAEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { nightFactor } from './daylight.js';
import { isReversedDepth } from './renderer.js';

// aoGlass: n8ao's transparency mode (AO stays off glass and other see-through surfaces). It costs two extra renders of the
// whole scene and four scene walks a frame, so only 'high' keeps it; below that AO may show through the car glass.
const QUALITY = {
  low: { ao: false, aoHalf: true, aoGlass: false, aa: 'fxaa', scale: 0.75, maxDpr: 1 },
  medium: { ao: true, aoHalf: true, aoGlass: false, aa: 'smaa', smaa: SMAAPreset.MEDIUM, scale: 1, maxDpr: 1.25 },
  high: { ao: true, aoHalf: false, aoGlass: true, aa: 'smaa', smaa: SMAAPreset.HIGH, scale: 1, maxDpr: 1.6 },
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createPostProcessing({ renderer, scene, camera, quality = 'high', daylight = null } = {}) {
  const hdr = renderer.userData?.caps?.hdrTarget !== null;
  const composer = new EffectComposer(renderer, { frameBufferType: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType });
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const w0 = Math.max(1, size.x), h0 = Math.max(1, size.y);

  const renderPass = new RenderPass(scene, camera);
  const ao = new N8AOPostPass(scene, camera, w0, h0);
  Object.assign(ao.configuration, {
    aoRadius: 1.8,            // metres: contact shading only
    distanceFalloff: 0.7,
    intensity: 2.2,
    aoSamples: 12,
    denoiseSamples: 6,
    denoiseRadius: 10,
    gammaCorrection: false,   // later passes encode
    screenSpaceRadius: false,
    color: new THREE.Color(0, 0, 0),
  });
  // n8ao copies its result into the composer buffer with a depth-tested quad; under a reversed depth buffer the stale
  // depth in that buffer rejects it and the frame goes black (until a frame without AO happens to clear it)
  Object.assign(ao.copyQuad.material, { depthTest: false, depthWrite: false });
  // n8ao fades AO with scene.fog read as linear fog; the Haze stores other units in near/far, so give it an equivalent
  // linear ramp for the duration of its pass (AO gone where the haze is ~90% opaque, and on the sky)
  const aoRender = ao.render.bind(ao), aoFog = new THREE.Fog(0xffffff, 0, 1);
  ao.render = (...args) => {
    // n8ao's post pass builds its half-res depth downsampler without the reversed-depth define its other shaders get,
    // so half-res AO rebuilt its normals from the wrong depth range; patch the material whenever n8ao (re)creates it
    const dq = ao.depthDownsampleQuad?.material;
    if (dq && !('REVERSEDEPTH' in dq.defines) && isReversedDepth(renderer)) { dq.defines.REVERSEDEPTH = ''; dq.needsUpdate = true; }
    const haze = scene.fog;
    if (haze?.isHaze) {
      aoFog.near = haze.start; aoFog.far = haze.start + 2.3 / Math.max(haze.density, 1e-6);
      scene.fog = aoFog;
    }
    try { aoRender(...args); } finally { scene.fog = haze; }
  };
  const bloom = new BloomEffect({ luminanceThreshold: 2.2, luminanceSmoothing: 0.4, intensity: 0.35, mipmapBlur: true, radius: 0.62, levels: 7 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }); // Khronos PBR Neutral: keeps contrast and hue (AgX read flat)
  const gradePass = new EffectPass(camera, bloom, tone);
  const smaa = new SMAAEffect({ preset: SMAAPreset.HIGH, edgeDetectionMode: EdgeDetectionMode.COLOR });
  const smaaPass = new EffectPass(camera, smaa);
  const fxaaPass = new EffectPass(camera, new FXAAEffect());
  const chain = [renderPass, ao, gradePass, smaaPass, fxaaPass];
  for (const p of chain) composer.addPass(p);

  const fx = { ao: true, bloom: true, aa: true };
  let Q = QUALITY.high, qName = 'high', ev = 0, exposure = daylight?.state.exposure ?? 1, bloomBase = 0.35, bloomThreshold = 2.2;
  let cssW = w0, cssH = h0;

  // exactly one pass writes to the screen: the last enabled one
  function relink() {
    ao.enabled = fx.ao && Q.ao;
    bloom.blendMode.opacity.value = fx.bloom ? 1 : 0;
    smaaPass.enabled = fx.aa && Q.aa === 'smaa';
    fxaaPass.enabled = fx.aa && Q.aa === 'fxaa';
    let last = null;
    for (const p of chain) { if (p.enabled) last = p; }
    for (const p of chain) p.renderToScreen = p === last;
  }

  // adapt: the adaptive-resolution factor (render/adaptive.js); never below 1 device pixel per CSS pixel unless the
  // quality itself asks for less, back to 1 on every quality change, never saved
  let adapt = 1;
  const baseDpr = () => Math.min(globalThis.devicePixelRatio || 1, Q.maxDpr) * Q.scale;
  function applySize() {
    const base = baseDpr(), dpr = Math.max(base * adapt, Math.min(base, 1));
    renderer.setPixelRatio(dpr);
    composer.setSize(cssW, cssH, true); // also sets the canvas CSS size
  }

  function setQuality(q) {
    Q = QUALITY[q] || QUALITY.high; qName = QUALITY[q] ? q : 'high';
    if (ao.configuration.halfRes !== Q.aoHalf) ao.configuration.halfRes = Q.aoHalf;
    // setting it by hand also stops n8ao's per-frame auto-detection, which would turn it back on (the scene has glass)
    if (ao.configuration.transparencyAware !== Q.aoGlass) ao.configuration.transparencyAware = Q.aoGlass;
    if (Q.smaa !== undefined) smaa.applyPreset(Q.smaa);
    relink();
    adapt = 1;
    applySize();
  }

  function setSize(w, h) {
    w = Math.floor(w); h = Math.floor(h);
    if (!(w > 0 && h > 0)) return false;    // hidden / collapsed canvas: keep the last good size
    cssW = w; cssH = h;
    if (camera.isPerspectiveCamera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
    applySize();
    return true;
  }

  function render(dt = 1 / 60) {
    if (!(cssW > 0 && cssH > 0)) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.25) / 0.8);
    exposure += ((daylight?.state.exposure ?? 1) * Math.pow(2, ev) - exposure) * k;
    renderer.toneMappingExposure = exposure;   // read by the tone mapping shader
    bloom.intensity = bloomBase * (1 + 0.8 * nightFactor());
    bloom.luminanceMaterial.threshold = bloomThreshold / exposure; // same on-screen brightness triggers bloom day or night
    renderer.info.reset();
    composer.render(Math.min(dt, 0.1));
  }

  setQuality(quality);

  return {
    composer, render, setSize, setQuality,
    get quality() { return qName; },
    get renderScale() { return Q.scale; },
    get baseDpr() { return baseDpr(); },
    get pixelRatio() { return renderer.getPixelRatio(); },
    get adaptive() { return adapt; },
    setAdaptive(f) { f = clamp(+f || 1, 0.25, 1); if (f !== adapt) { adapt = f; applySize(); } },
    hdr,
    get effects() { return { ...fx }; },
    setEffect(name, on) { if (name in fx) { fx[name] = !!on; relink(); } },
    get exposure() { return exposure; },
    setExposure(v) { ev = clamp(+v || 0, -3, 3); },
    setBloom({ intensity, threshold } = {}) {
      if (intensity !== undefined) bloomBase = clamp(intensity, 0, 2);
      if (threshold !== undefined) bloomThreshold = clamp(threshold, 0.2, 8);
    },
    setAO({ radius, intensity } = {}) {
      if (radius !== undefined) ao.configuration.aoRadius = clamp(radius, 0.3, 4);
      if (intensity !== undefined) ao.configuration.intensity = clamp(intensity, 0, 6);
    },
    resetHistory() { if (ao.configuration.accumulate) ao.configuration.accumulate = false; },
    passes: { renderPass, ao, gradePass, smaaPass, fxaaPass, bloom, tone, smaa },
    dispose() { composer.dispose(); },
  };
}
