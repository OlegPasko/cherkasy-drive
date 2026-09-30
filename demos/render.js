// Render demo: real Cherkasy terrain (dem.bin) + OSM building masses around Soborna square as plain prisms, the river,
// test boxes, glossy spheres, night lamps and coplanar decals, under the full sky / daylight / shadow / post stack.
// window.__demo = { ctx, stats() }.
import * as THREE from 'three';
import { createCore } from '../src/main.js';
import { createFlyCamera } from '../src/core/flycam.js';
import { decalBias, warmupShaders } from '../src/render/renderer.js';
import { nightFactor, PRESET_NAMES } from '../src/render/daylight.js';

const BUILD_RADIUS = 1300, TERRAIN_STEP = 3;
const $ = (id) => document.getElementById(id);

const ctx = createCore({ container: $('app'), quality: 'high' });
const { scene, camera, input, daylight, sky, shadows, post, renderer } = ctx;

// ------------------------------------------------------------------------------------------------ data
const [map, bRaw, demBuf] = await Promise.all([
  fetch('/assets/cherkasy/map.json').then((r) => r.json()),
  fetch('/assets/cherkasy/map_buildings.json').then((r) => r.json()),
  fetch('/assets/cherkasy/dem.bin').then((r) => r.arrayBuffer()),
]);
const D = map.dem, H = new Int16Array(demBuf);
function heightAt(x, z) {
  const fx = Math.min(D.nx - 1.001, Math.max(0, (x - D.x0) / D.cell)), fz = Math.min(D.nz - 1.001, Math.max(0, (z - D.z0) / D.cell));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * D.nx + i;
  const a = H[k], b = H[k + 1], c = H[k + D.nx], d = H[k + D.nx + 1];
  return ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v) * D.scale;
}
ctx.groundAt = heightAt;

// ------------------------------------------------------------------------------------------------ helpers
const std = (color, rough, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
function place(geo, mat, x, y, z, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive;
  scene.add(m);
  return m;
}
function geometryOf(attrs, index = null) { // attrs: { name: [array, itemSize] }
  const g = new THREE.BufferGeometry();
  for (const [name, [arr, n]] of Object.entries(attrs)) g.setAttribute(name, new THREE.BufferAttribute(arr instanceof Float32Array ? arr : new Float32Array(arr), n));
  if (index) g.setIndex(new THREE.BufferAttribute(index, 1));
  return g;
}

// ------------------------------------------------------------------------------------------------ terrain + river
{
  const cols = Math.floor((D.nx - 1) / TERRAIN_STEP) + 1, rows = Math.floor((D.nz - 1) / TERRAIN_STEP) + 1, span = TERRAIN_STEP * D.cell;
  const xyz = new Float32Array(cols * rows * 3), rgb = new Float32Array(cols * rows * 3);
  const tint = { grass: new THREE.Color(0x56663f), town: new THREE.Color(0x6b6a5e), shore: new THREE.Color(0x9b8a66) }, c = new THREE.Color();
  for (let v = 0; v < cols * rows; v++) {
    const ci = v % cols, ri = (v - ci) / cols, wx = D.x0 + ci * span, wz = D.z0 + ri * span;
    const wy = H[ri * TERRAIN_STEP * D.nx + ci * TERRAIN_STEP] * D.scale;
    xyz[v * 3] = wx; xyz[v * 3 + 1] = wy; xyz[v * 3 + 2] = wz;
    c.copy(tint.grass).lerp(tint.town, 0.8 * Math.max(0, 1 - Math.hypot(wx + 900, wz - 600) / 4500));
    if (wy < 0.2) c.lerp(tint.shore, 0.7);
    c.toArray(rgb, v * 3);
  }
  const tris = new Uint32Array((cols - 1) * (rows - 1) * 6);
  let t = 0;
  for (let q = 0; q < (cols - 1) * (rows - 1); q++) {
    const ci = q % (cols - 1), ri = (q - ci) / (cols - 1), v00 = ri * cols + ci, v10 = v00 + 1, v01 = v00 + cols;
    tris.set([v00, v01, v10, v10, v01, v01 + 1], t); t += 6;
  }
  const g = geometryOf({ position: [xyz, 3], color: [rgb, 3] }, tris);
  g.computeVertexNormals();
  place(g, std(0xffffff, 0.96, { vertexColors: true }), 0, 0, 0, false, true).name = 'terrain';
  place(new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2), std(0x1b3440, 0.1), 0, -1.6, 0, false, true).name = 'river';
}

// ------------------------------------------------------------------------------------------------ building prisms
let buildingCount = 0;
{
  const palette = [0xd9cfbd, 0xcbbfa8, 0xe3ddd0, 0xb9a48c, 0xc8c9c4, 0xd6c3a1, 0xa9a39a, 0xe8e1c8].map((h) => new THREE.Color(h));
  const out = { position: [], normal: [], color: [] };
  const emit = (x, y, z, n, c) => { out.position.push(x, y, z); out.normal.push(...n); out.color.push(c.r, c.g, c.b); };
  for (const bld of bRaw) {
    const flat = bld.p;
    if (!flat || flat.length < 6 || Math.hypot(flat[0], flat[1]) > BUILD_RADIUS) continue;
    const ring = Array.from({ length: flat.length / 2 }, (_, k) => new THREE.Vector2(flat[2 * k], flat[2 * k + 1]));
    const twice = 2 * THREE.ShapeUtils.area(ring);
    if (Math.abs(twice) < 8) continue;
    const base = Math.min(...ring.map((p) => heightAt(p.x, p.y))) - 1;
    const top = base + 1 + (bld.h ?? (bld.lv ? bld.lv * 3.1 + 1.5 : 7));
    const wall = palette[Math.abs(bld.id ?? buildingCount) % palette.length], outward = Math.sign(twice);
    ring.forEach((p, k) => {
      const q = ring[(k + 1) % ring.length], len = p.distanceTo(q) || 1;
      const n = [outward * (q.y - p.y) / len, 0, -outward * (q.x - p.x) / len];
      const corners = outward > 0 ? [[p, base], [q, top], [q, base], [p, base], [p, top], [q, top]]
        : [[p, base], [q, base], [q, top], [p, base], [q, top], [p, top]];
      for (const [v, y] of corners) emit(v.x, y, v.y, n, wall);
    });
    const roof = wall.clone().multiplyScalar(0.7), up = [0, 1, 0];
    for (const tri of THREE.ShapeUtils.triangulateShape(ring, [])) {
      const [A, B, C] = tri.map((k) => ring[k]);
      const facesUp = (B.y - A.y) * (C.x - A.x) > (B.x - A.x) * (C.y - A.y);
      for (const v of facesUp ? [A, B, C] : [A, C, B]) emit(v.x, top, v.y, up, roof);
    }
    buildingCount++;
  }
  const g = geometryOf({ position: [out.position, 3], normal: [out.normal, 3], color: [out.color, 3] });
  place(g, std(0xffffff, 0.85, { vertexColors: true }), 0, 0, 0).name = 'buildings';
}

// ------------------------------------------------------------------------------------------------ test props
const lampMats = [];
{
  const ox = -40, oz = 40, deck = heightAt(ox, oz) + 1;
  place(new THREE.BoxGeometry(80, 1, 60), std(0x3a3b3d, 0.9), ox, deck - 0.5, oz, false, true);
  const stone = std(0xc9b89a, 0.7);
  [2, 4.5, 7, 9.5, 12].forEach((h, k) => place(new THREE.BoxGeometry(4, h, 4), stone, ox - 30 + k * 9, deck + h / 2, oz - 20));
  place(new THREE.SphereGeometry(2.2, 48, 24), std(0xffffff, 0.06, { metalness: 1 }), ox + 22, deck + 2.2, oz - 18);
  const lacquer = new THREE.MeshPhysicalMaterial({ color: 0x8a1c1c, metalness: 0.3, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 });
  place(new THREE.BoxGeometry(5.7, 1.6, 2.3), lacquer, ox + 10, deck + 0.8, oz - 5);

  // coplanar decals on the pad: left with decalBias(), right with the naive polygon offset (wrong under reversed depth)
  const stripe = new THREE.PlaneGeometry(1, 8).rotateX(-Math.PI / 2);
  const biased = decalBias(std(0xf4f1e6, 0.6), renderer, 1);
  const naive = std(0xf2c14e, 0.6, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  for (const k of [0, 1, 2, 3, 4, 5]) {
    place(stripe, biased, ox - 30 + k * 3, deck, oz + 15, false, true);
    place(stripe, naive, ox + 12 + k * 3, deck, oz + 15, false, true);
  }

  // street lamps whose bulbs follow nightFactor(), and a red sign that must stay red at night
  const pole = new THREE.CylinderGeometry(0.1, 0.14, 6, 8), bulb = new THREE.SphereGeometry(0.3, 12, 8);
  const steel = std(0x2b2f33, 0.5, { metalness: 0.6 });
  const glow = std(0x222222, 1, { emissive: 0xffc987, emissiveIntensity: 0 }), neon = std(0x300000, 1, { emissive: 0xff2a1a, emissiveIntensity: 0 });
  lampMats.push({ m: glow, day: 0.05, night: 14 }, { m: neon, day: 0.3, night: 1.2 });
  for (const k of [0, 1, 2, 3, 4, 5]) {
    const x = ox - 35 + k * 14;
    place(pole, steel, x, deck + 3, oz + 28, true, false);
    place(bulb, glow, x, deck + 6.1, oz + 28, false, false);
  }
  place(new THREE.BoxGeometry(8, 2, 0.3), neon, ox, deck + 9, oz - 28, true, false);
}
ctx.addSystem(() => { const k = nightFactor(); for (const l of lampMats) l.m.emissiveIntensity = THREE.MathUtils.lerp(l.day, l.night, k); }, 'lamps');

// ------------------------------------------------------------------------------------------------ camera + UI
const fly = createFlyCamera(camera, input, { speed: 30, groundAt: heightAt });
fly.setPose(new THREE.Vector3(-130, heightAt(-130, 90) + 45, 90), -Math.PI / 2 + 0.5, -0.22);
ctx.addSystem(fly.update, 'flycam');

const names = { day: 'День', sunrise: 'Схід', sunset: 'Захід', dusk: 'Сутінки', night: 'Ніч', overcast: 'Хмарно' };
for (const p of PRESET_NAMES) {
  const b = document.createElement('button'); b.textContent = names[p] || p; b.onclick = () => daylight.setPreset(p, 3);
  $('presets').appendChild(b);
}
const toggles = {
  AO: (on) => post.setEffect('ao', on), Bloom: (on) => post.setEffect('bloom', on), AA: (on) => post.setEffect('aa', on),
  'Тіні': (on) => { shadows.light.shadow.intensity = on ? 1 : 0; },
};
for (const [label, fn] of Object.entries(toggles)) {
  const b = document.createElement('button'); b.textContent = label; b.className = 'on';
  b.onclick = () => { const on = !b.classList.contains('on'); b.classList.toggle('on', on); fn(on); };
  $('toggles').appendChild(b);
}
const timeEl = $('time');
let dragging = false;
timeEl.addEventListener('pointerdown', () => { dragging = true; });
timeEl.addEventListener('pointerup', () => { dragging = false; });
timeEl.addEventListener('input', () => daylight.setTime(+timeEl.value, 0));
$('speed').onchange = (e) => daylight.setTimeScale(+e.target.value);
$('cloud').oninput = (e) => sky.setCloudCover(+e.target.value);
$('ev').oninput = (e) => post.setExposure(+e.target.value);
$('quality').value = ctx.quality;
$('quality').onchange = (e) => ctx.setQuality(e.target.value);
ctx.events.on('quality', (q) => { $('quality').value = q; });

const hhmm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
let fps = 60, ms = 16.7, lastStats = 0;
const S = daylight.state;
function stats() {
  const info = renderer.info.render;
  return {
    fps: +fps.toFixed(1), frameMs: +ms.toFixed(2), calls: info.calls, triangles: info.triangles,
    hours: +S.hours.toFixed(3), preset: S.preset, night: +S.night.toFixed(3), sunElevDeg: +(S.sunElev * 180 / Math.PI).toFixed(2),
    light: S.lightIsMoon ? 'moon' : 'sun', lightIntensity: +S.lightIntensity.toFixed(3), exposure: +post.exposure.toFixed(3),
    shadowReach: shadows.stats.reach, envRefreshes: sky.stats.envRefreshes, envMs: +sky.stats.envMs.toFixed(2),
    quality: ctx.quality, buildings: buildingCount, reversedDepth: renderer.userData.caps.reversedDepth, hdr: post.hdr,
    camera: camera.position.toArray().map((v) => +v.toFixed(1)),
  };
}
ctx.addSystem((dt) => {
  if (dt > 0) { fps += (1 / dt - fps) * 0.05; ms += (dt * 1000 - ms) * 0.05; }
  if (!dragging) timeEl.value = S.hours;
  $('timeOut').textContent = hhmm(S.hours);
  if (ctx.time - lastStats > 0.25) {
    lastStats = ctx.time;
    const s = stats();
    $('stats').textContent = `${s.fps} fps  ${s.frameMs} ms\ncalls ${s.calls}  tris ${(s.triangles / 1e6).toFixed(2)}M\n`
      + `sun ${s.sunElevDeg}°  night ${s.night}  ${s.light}\nexp ${s.exposure}  shadow ${s.shadowReach.toFixed(0)} m\n`
      + `env ×${s.envRefreshes} (${s.envMs} ms)  ${s.buildings} буд.`;
  }
}, 'demoUi');

window.__demo = { ctx, stats };
sky.update(0, camera);
await warmupShaders(renderer, scene, camera);
ctx.start();
$('loading').classList.add('done');
