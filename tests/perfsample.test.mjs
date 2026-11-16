// node tests/perfsample.test.mjs – the device info for analytics (render/gpuinfo.js) and the frame-rate reports
// (render/perfsample.js).
import assert from 'node:assert/strict';
import { gpuName, isSoftware, deviceInfo, suggestQuality } from '../src/render/gpuinfo.js';
import { createPerfSample } from '../src/render/perfsample.js';

// --- the card's name out of what browsers report
const NAMES = [
  ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'NVIDIA GeForce RTX 3060', false],
  ['ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00003EA0) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Intel UHD Graphics 620', false],
  ['ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'AMD Radeon Graphics', false],
  ['ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version)', 'Apple M5 Pro', false],
  ['ANGLE (Intel, Mesa Intel(R) Xe Graphics (TGL GT2), OpenGL 4.6)', 'Mesa Intel Xe Graphics (TGL GT2)', false],
  ['Apple GPU', 'Apple GPU', false],
  ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'Vulkan 1.3.0 (SwiftShader Device (Subzero))', true],
  ['ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Microsoft Basic Render Driver', true],
  ['llvmpipe (LLVM 15.0.7, 256 bits)', 'llvmpipe (LLVM 15.0.7, 256 bits)', true],
  ['', 'unknown', false],
];
for (const [raw, name, soft] of NAMES) {
  assert.equal(gpuName(raw), name, raw);
  assert.equal(isSoftware(raw), soft, raw);
}
assert.ok(gpuName('x'.repeat(300)).length <= 100, 'GA4 cuts a value at 100 characters');

// --- the first start's graphics level from the card's name
for (const [g, q] of [['Intel UHD Graphics 620', 'medium'], ['Intel HD Graphics 4000', 'medium'], ['Intel Iris Xe Graphics', 'medium'],
  ['Mesa Intel Xe Graphics (TGL GT2)', 'medium'], ['Intel Arc A750 Graphics', 'high'], ['AMD Radeon Graphics', 'medium'],
  ['AMD Radeon Vega 8 Graphics', 'medium'], ['AMD Radeon RX 6600 XT', 'high'], ['AMD Radeon Pro 5500M', 'high'],
  ['NVIDIA GeForce RTX 3060', 'high'], ['NVIDIA GeForce GTX 1050 Ti', 'high'], ['NVIDIA GeForce MX150', 'medium'],
  ['NVIDIA GeForce GT 730', 'medium'], ['NVIDIA GeForce 940MX', 'medium'], ['Apple M5 Pro', 'high'], ['Apple GPU', 'high'],
  ['Mali-G78', 'medium'], ['unknown', 'high'], ['Microsoft Basic Render Driver', 'low'], ['Vulkan 1.3.0 (SwiftShader Device (Subzero))', 'low']]) {
  assert.equal(suggestQuality({ gpu: g }), q, g);
}
assert.equal(suggestQuality({ gpu: 'NVIDIA GeForce RTX 3060', software: true }), 'low');
assert.equal(suggestQuality(), 'high');

// --- deviceInfo: the unmasked name where there is one, the screen in device pixels
const gl = {
  RENDERER: 1,
  getExtension: (n) => (n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 2 } : null),
  getParameter: (k) => (k === 2 ? 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x000046A6) Direct3D11 vs_5_0 ps_5_0, D3D11)' : 'WebKit WebGL'),
};
const win = { devicePixelRatio: 1.5, screen: { width: 1707, height: 960 }, innerWidth: 1600, innerHeight: 800, navigator: { hardwareConcurrency: 8, deviceMemory: 8 } };
assert.deepEqual(deviceInfo(gl, win), { gpu: 'Intel Iris Xe Graphics', software: false, screen: '2561x1440', view: '1600x800', dpr: 1.5, cores: 8, mem: 8 });
const masked = deviceInfo({ RENDERER: 1, getExtension: () => null, getParameter: () => 'Mozilla' }, {});
assert.equal(masked.gpu, 'Mozilla'); assert.equal(masked.screen, '0x0'); assert.equal(masked.cores, 0);
assert.equal(deviceInfo(null, {}).gpu, 'unknown');
assert.equal(deviceInfo({ getExtension() { throw new Error('lost'); } }, {}).gpu, 'unknown');

// --- the frame-rate reports: one per mark, over running frames only
{
  const out = [];
  const s = createPerfSample({ marks: [60, 300], onSample: (r) => out.push(r) });
  const run = (sec, dt, work = 0.004) => { for (let t = 0; t < sec; t += dt) s.update(dt, true, work); };
  run(9, 1 / 60); assert.equal(out.length, 0);
  run(1.1, 1 / 60);                       // the grace is over
  run(30, 1 / 30);
  s.update(5, true);                      // a stall: not a frame
  for (let i = 0; i < 600; i++) s.update(1 / 60, false); // the map is open: nothing counts
  assert.equal(out.length, 0);
  run(30.2, 1 / 30);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { at: 60, fps: 30, low: 30, js_ms: 4 });
  // a 60 fps stretch with a slow fifth: the average sits between, `low` shows the slow frames
  for (let i = 0; out.length < 2 && i < 1e5; i++) s.update(i % 5 ? 1 / 60 : 1 / 20, true, 0.01);
  assert.equal(out.length, 2);
  assert.equal(out[1].at, 300); assert.equal(out[1].low, 20); assert.ok(out[1].fps > 35 && out[1].fps < 50, `fps ${out[1].fps}`);
  assert.equal(out[1].js_ms, 10);
  assert.ok(s.done);
  run(600, 1 / 60); assert.equal(out.length, 2, 'nothing after the last mark');
}
console.log('perfsample ok');
