// WebGLRenderer setup for the game: one canvas, linear HDR shading into the post chain, PCF sun shadows.
//
//   createRenderer({ canvas?, container?, reversedDepth = true, maxPixelRatio = 2 }) -> THREE.WebGLRenderer, with
//     renderer.userData.caps = { reversedDepth, hdrTarget ('half' | 'float' | null), maxTexture, maxAniso, parallelCompile }
//   isReversedDepth(renderer) -> bool
//   decalBias(material, renderer, level = 1)  pull a coplanar overlay (road marking, puddle, crack) toward the camera.
//   warmupShaders(renderer, scene, camera, timeoutMs = 6000) -> Promise<bool>   async program compile before frame one
//
// Reversed depth (EXT_clip_control + 32-bit float depth in the post chain) keeps a 10 km city free of far z-fighting.
// It breaks the usual decal recipe: three.js mirrors polygonOffsetFactor for a reversed buffer but passes
// polygonOffsetUnits through unchanged, so the customary negative units push a decal *behind* the surface, and with a
// float buffer a constant unit offset is meaningless anyway. decalBias() therefore keeps only the slope term and adds a
// small depth-relative bias in the vertex shader, which suits the float buffer's precision curve.
import * as THREE from 'three';

export function createRenderer({ canvas = null, container = null, reversedDepth = true, maxPixelRatio = 2 } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas || undefined,
    antialias: false,              // AA lives in the post chain
    alpha: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
    reversedDepthBuffer: !!reversedDepth,
    preserveDrawingBuffer: false,
  });
  // tone mapping happens once, at the end of post.js; the screen gets sRGB
  Object.assign(renderer, { toneMapping: THREE.NoToneMapping, outputColorSpace: THREE.SRGBColorSpace });
  // filtered PCF with a per-light soft radius (PCFSoft was folded into it); shadows.js decides when to redraw
  Object.assign(renderer.shadowMap, { type: THREE.PCFShadowMap, enabled: true, autoUpdate: false });
  renderer.info.autoReset = false;                 // the post chain renders several times per frame; reset per frame
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, maxPixelRatio));

  const ext = renderer.extensions;
  const caps = {
    reversedDepth: renderer.state.buffers.depth.getReversed(),
    hdrTarget: ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float') ? 'half' : null,
    maxTexture: renderer.capabilities.maxTextureSize,
    maxAniso: renderer.capabilities.getMaxAnisotropy(),
    parallelCompile: ext.has('KHR_parallel_shader_compile'),
  };
  renderer.userData = { caps };

  const el = renderer.domElement;
  el.style.display = 'block';
  el.style.touchAction = 'none';
  el.tabIndex = 0;
  if (container) container.appendChild(el);

  // a lost context should not leave a frozen black canvas without a word
  el.addEventListener('webglcontextlost', (e) => { e.preventDefault(); console.warn('[renderer] WebGL context lost'); });
  el.addEventListener('webglcontextrestored', () => console.warn('[renderer] WebGL context restored'));
  return renderer;
}

export const isReversedDepth = (renderer) => !!renderer?.state?.buffers?.depth?.getReversed?.();

// Coplanar overlay bias. level 1 suits paint on asphalt; raise it for layered decals (2 = on top of level 1).
export function decalBias(material, renderer, level = 1) {
  material.polygonOffset = true;
  if (!isReversedDepth(renderer)) {
    material.polygonOffsetFactor = -1 * level;
    material.polygonOffsetUnits = -4 * level;
    return material;
  }
  material.polygonOffsetFactor = -1 * level;  // three.js flips the sign for us: +slope toward the viewer
  material.polygonOffsetUnits = 0;            // would push the wrong way (not flipped) and is scale-free in float depth
  material.defines = { ...(material.defines || {}), DECAL_DEPTH_REL: (4e-5 * level).toExponential(3) };
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    prev?.call(material, shader, r);
    // clip z / w is ~near/distance in a reversed buffer; scaling it up moves the fragment slightly toward the eye
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n#ifdef USE_REVERSED_DEPTH_BUFFER\n\tgl_Position.z *= 1.0 + DECAL_DEPTH_REL;\n#endif');
  };
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|decal';
  material.needsUpdate = true;
  return material;
}

// Compile every program the scene needs without blocking the main thread (KHR_parallel_shader_compile when present).
// Resolves true when done, false on timeout or failure; the game starts either way.
export async function warmupShaders(renderer, scene, camera, timeoutMs = 6000) {
  const timer = new Promise((res) => setTimeout(() => res(false), timeoutMs));
  try {
    const job = renderer.compileAsync(scene, camera).then(() => true);
    return await Promise.race([job, timer]);
  } catch (err) {
    console.warn('[renderer] shader warm-up failed', err);
    return false;
  }
}
