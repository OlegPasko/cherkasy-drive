// What the game runs on, for analytics and for the "no graphics acceleration" warning: the graphics card's name, whether
// the browser draws in software, the screen. No DOM writes, no three.js.
//
//   gpuName(raw) -> the card's short name from a WebGL renderer string, at most 100 characters (GA4's limit):
//     'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)' -> 'NVIDIA GeForce RTX 3060'
//   isSoftware(raw) -> true for a CPU rasteriser (SwiftShader, llvmpipe, Microsoft Basic Render Driver, ...): the
//     browser's graphics acceleration is off or the driver is blocked, and no graphics level will make the game smooth
//   deviceInfo(gl, win = globalThis) -> { gpu, software, screen: '2560x1440' (device pixels), view: '1280x720' (the
//     window, CSS pixels), dpr (devicePixelRatio), cores, mem (GB, Chrome only; 0 when unknown) }
// The name comes from WEBGL_debug_renderer_info where the browser still has it, else from gl.RENDERER (Firefox gives a
// rounded-off family name there).
const SOFT = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|mesa offscreen|warp/i;

export function gpuName(raw) {
  let s = String(raw || '').trim();
  const angle = /^ANGLE \((.*)\)$/.exec(s);
  if (angle) { // ANGLE (vendor, card + driver API, backend)
    const parts = angle[1].split(',').map((p) => p.trim());
    s = parts.length >= 2 ? parts[1] : parts[0];
  }
  s = s.replace(/^ANGLE Metal Renderer:\s*/i, '')                              // Chrome on a Mac
    .replace(/\s*\(0x[0-9a-f]+\)/gi, '')                                      // the PCI device id
    .replace(/\s+(Direct3D\d*|OpenGL(?: ES)? \d)[^)]*$/i, '')                  // the driver API and shader model
    .replace(/\(R\)|\(TM\)|\(C\)/gi, '').replace(/\s+/g, ' ').trim();
  return s.slice(0, 100) || 'unknown';
}

export const isSoftware = (raw) => SOFT.test(String(raw || ''));

export function deviceInfo(gl, win = globalThis) {
  let raw = '';
  try {
    const ext = gl?.getExtension?.('WEBGL_debug_renderer_info');
    raw = (ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl?.getParameter?.(gl.RENDERER) || '';
  } catch { /* a lost context: unknown */ }
  const dpr = win.devicePixelRatio || 1, sc = win.screen || {}, nav = win.navigator || {};
  const px = (v) => Math.round((v || 0) * dpr);
  return {
    gpu: gpuName(raw), software: isSoftware(raw),
    screen: `${px(sc.width)}x${px(sc.height)}`, view: `${win.innerWidth || 0}x${win.innerHeight || 0}`,
    dpr: Math.round(dpr * 100) / 100, cores: nav.hardwareConcurrency || 0, mem: nav.deviceMemory || 0,
  };
}
