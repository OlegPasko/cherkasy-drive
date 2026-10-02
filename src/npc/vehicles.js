// Traffic vehicle models: the two project glb files (tools/blender/cars_small.py, cars_big.py), a procedural paint atlas,
// one shared part-aware material, instanced bodies with three LODs, and a procedural fallback fleet.
//   VTYPES: { [type]: { len, wid, h, big, file } } body dimensions in metres (model frame: origin at the floor centre,
//     +x forward, +y up, +z right)
//   PART: part ids carried by the glb (TEXCOORD_1.x): BASE, PAINT, METAL, GLASS, LAMP, RUBBER, PLASTIC, HEAD, TAIL, SCREEN, AD
//   loadTrafficVehicles({ base?, fallbackOnly? }) -> Promise<models> (cached; never rejects: missing files -> procedural)
//     models = { geos: { [type]: [lod0, lod1, lod2] }, material, atlas, fallback, types[], setNight(k 0..1),
//                makeMesh(type, colour, seed) -> { mesh (InstancedMesh, 1 instance, own geometry copy), g, dispose() } }
//   createFleet(scene, models, { shadows = true }) -> fleet
//     fleet.begin(); fleet.add(type, lod, matrixElements[16], paint[3] linear rgb, brake 0..1, seed); fleet.end()
//     fleet.stats() -> { drawn, byLod: [n0, n1, n2], meshes }; fleet.dispose()
//   paintOf(colour) -> [r, g, b] linear (accepts [r,g,b], THREE.Color, 0xrrggbb)
// Per-instance attributes: aPaint (vec3, applied to PAINT parts only), aMisc (x brake, y ad tile 0..7 from adTile(seed);
// tiles 5..7 also swap the box truck's red "your ad here" side for the Telegram-blue one).
//   AD_URBAN, URBAN_BLUE, adSeedFor(tile) -> a seed that shows exactly that tile, adTile(seed) -> 0..7 (8 = LIVERY_URBAN:
//   a box truck in the URBAN livery, makeUrbanLivery() -> CanvasTexture | null, read by the material as uUrban) The material
// reads per-vertex aPart and aAO (converted from TEXCOORD_1 / COLOR_0 at load).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const PART = { BASE: 0, PAINT: 1, METAL: 2, GLASS: 3, LAMP: 4, RUBBER: 5, PLASTIC: 6, HEAD: 7, TAIL: 8, SCREEN: 14, AD: 15 };

// measured from the glb bounds (width without mirrors)
export const VTYPES = {
  hatch: { len: 4.33, wid: 1.78, h: 1.48, file: 'cars' },
  sedan: { len: 4.74, wid: 1.8, h: 1.48, file: 'cars' },
  sedan2: { len: 4.15, wid: 1.68, h: 1.46, file: 'cars' },
  cross: { len: 4.48, wid: 1.8, h: 1.71, file: 'cars' },
  suv: { len: 3.76, wid: 1.74, h: 1.75, file: 'cars' },
  suv2: { len: 5.11, wid: 1.94, h: 1.97, file: 'cars' },
  pickup: { len: 5.53, wid: 1.92, h: 1.84, file: 'cars' },
  taxi: { len: 4.34, wid: 1.66, h: 1.58, file: 'cars' },
  taxi_hy: { len: 4.61, wid: 1.76, h: 1.69, file: 'cars' },
  taxi_gr: { len: 3.73, wid: 1.6, h: 1.56, file: 'cars' },
  taxi_mv: { len: 4.91, wid: 1.88, h: 1.92, file: 'cars' },
  van: { len: 6.15, wid: 2.1, h: 2.61, big: true, file: 'big' },
  truck: { len: 7.46, wid: 2.36, h: 3.5, big: true, file: 'big' },
  midi: { len: 7.77, wid: 2.46, h: 2.97, big: true, file: 'big' },
  bus: { len: 12.67, wid: 2.6, h: 3.11, big: true, file: 'big' },
  tour: { len: 11.25, wid: 2.6, h: 4.11, big: true, file: 'big' },
};

const toLin = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map(c => Math.pow(c / 255, 2.2));
export function paintOf(c) {
  if (Array.isArray(c)) return c;
  if (c?.isColor) return c.toArray();
  if (typeof c === 'number') return toLin(c);
  return [0.6, 0.6, 0.6];
}

// ------------------------------------------------------------------------------------------ ad tiles
// Eight ad tiles in the atlas (2 x 4). A seed in [0, 1) or any positive one picks among the seven unpaid ones; tile 1 is
// URBAN's, paid for a quarter of the city buses (traffic.js), so only adSeedFor(AD_URBAN), a negative seed, shows it.
export const AD_URBAN = 1, URBAN_BLUE = '#1b2496';
export const LIVERY_URBAN = 8; // not an atlas tile: a box truck in the URBAN livery (sides and back, makeUrbanLivery)
export const adSeedFor = (tile) => -1 - tile;
export function adTile(seed) {
  if (seed < 0) return -1 - seed;
  const t = Math.floor((((seed * 7.31) % 1) + 1) % 1 * 7);
  return t >= AD_URBAN ? t + 1 : t;
}

// a brand SVG (public/assets/brand) as one shared Image: the atlas tile and the livery read the same load
const brandImg = {};
const brandImage = (name) => brandImg[name] ??= new Promise((res) => {
  if (typeof Image === 'undefined') return res(null);
  const img = new Image();
  img.onload = () => res(img); img.onerror = () => { console.warn(`[vehicles] ${name}.svg did not load`); res(null); };
  img.src = `${import.meta.env?.BASE_URL ?? '/'}assets/brand/${name}.svg`;
});

// ------------------------------------------------------------------------------------------ procedural atlas
// Painted over the atlas regions the generators' UVs point at (2048 px layout, drawn at 1024 px): flat swatches, lamp
// housings, grilles, Ukrainian plates, the roof sign, route boards, bus ads, van / truck sides, interiors behind glass.
const SWATCH = [ // [cell centre x, y, colour]
  [904, 1744, '#f4f4f2'], [816, 1808, '#141517'], [848, 1808, '#2c2e31'], [880, 1808, '#c6c9cd'], [912, 1808, '#1e2833'],
  [944, 1808, '#1b1b1c'], [976, 1808, '#8f9397'], [1008, 1808, '#eceff2'], [784, 1808, '#141517'],
  [784, 1840, '#b3140f'], [816, 1840, '#e3891b'], [848, 1840, '#2352c2'], [880, 1840, '#c21a17'], [912, 1840, '#efb322'],
  [944, 1840, '#e9e5db'], [976, 1840, '#3b3d41'], [1008, 1840, '#232323'],
  [784, 1872, '#c9a142'], [816, 1872, '#5e6064'], [848, 1872, '#1c1c1c'], [880, 1872, '#3b3631'], [912, 1872, '#5e6064'],
];
export function makeVehicleAtlas() {
  if (typeof document === 'undefined') return null;
  const cv = Object.assign(document.createElement('canvas'), { width: 1024, height: 1024 });
  const g = cv.getContext('2d'); g.scale(0.5, 0.5);
  const tex = Object.assign(new THREE.CanvasTexture(cv), { colorSpace: THREE.SRGBColorSpace, flipY: false, anisotropy: 4 });
  const box = (x0, y0, x1, y1, paint) => { g.fillStyle = paint; g.fillRect(x0, y0, x1 - x0, y1 - y0); };
  const SANS = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  const text = (t, x, y, w, font, fill) => {
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    const k = Math.min(1, w / Math.max(1, g.measureText(t).width));
    g.save(); g.translate(x, y); g.scale(k, 1); g.fillStyle = fill; g.fillText(t, 0, 0); g.restore();
  };
  box(0, 0, 2048, 2048, '#7d7f82');
  // interiors seen through the glass: dark cabin, seat backs, a bright window band at the top
  const cabin = (x0, y0, x1, y1) => {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, '#5b6168'); gr.addColorStop(0.3, '#23272b'); gr.addColorStop(1, '#0e1012');
    box(x0, y0, x1, y1, gr);
    g.fillStyle = 'rgba(70,64,58,0.8)';
    for (let x = x0 + 30; x < x1 - 60; x += 150) { g.beginPath(); g.roundRect(x, y0 + (y1 - y0) * 0.45, 90, (y1 - y0) * 0.5, 18); g.fill(); }
  };
  cabin(0, 0, 1024, 346); cabin(0, 350, 1024, 692); cabin(1024, 684, 2048, 1022);
  // headlamp housing: chrome bezel, two lenses, LED strip
  box(6, 776, 250, 1016, '#bfc4c9');
  g.fillStyle = '#f6f8ff'; for (const cx of [86, 170]) { g.beginPath(); g.arc(cx, 874, 46, 0, 7); g.fill(); }
  box(16, 900, 246, 990, '#e9eefc'); box(26, 950, 236, 972, '#ffffff');
  // tail lamps: dark red housing, bright red blocks, amber indicator, white reversing lamp
  box(262, 772, 508, 1016, '#5a0b0b'); box(290, 790, 480, 880, '#e3231c'); box(266, 928, 506, 1006, '#c0191a');
  box(300, 890, 360, 920, '#f09a22'); box(410, 890, 470, 920, '#f1f1f1');
  // grilles: hex mesh and horizontal bars
  box(518, 776, 762, 1016, '#17181a'); g.strokeStyle = '#3d4044'; g.lineWidth = 3;
  for (let y = 790; y < 1010; y += 18) for (let x = 530 + ((y / 18) % 2) * 10; x < 752; x += 20) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); } g.closePath(); g.stroke(); }
  box(774, 776, 1018, 1016, '#1b1c1e'); for (let y = 792; y < 1004; y += 24) box(784, y, 1008, y + 9, '#7a7e84');
  box(516, 1154, 766, 1242, '#202124'); for (let y = 1160; y < 1238; y += 12) box(520, y, 762, y + 5, '#4a4d52'); // louvre / vent
  for (let i = 0; i < 16; i++) box(i * 32, 1152, i * 32 + 32, 1184, i % 2 ? '#111' : '#f2c200'); // checker band
  box(514, 1542, 638, 1592, '#f2a21c'); box(642, 1542, 766, 1592, '#b8161a');
  // Ukrainian plates (small-car and bus layouts)
  const plate = (x0, y0, w, h, fs) => {
    box(x0, y0, x0 + w, y0 + h, '#f4f4f0'); g.strokeStyle = '#111'; g.lineWidth = 5; g.strokeRect(x0 + 4, y0 + 4, w - 8, h - 8);
    const sw = h * 0.55; box(x0 + 7, y0 + 7, x0 + 7 + sw, y0 + h - 7, '#1f47b0');
    box(x0 + 7 + sw * 0.2, y0 + h * 0.18, x0 + 7 + sw * 0.8, y0 + h * 0.32, '#0057b7'); box(x0 + 7 + sw * 0.2, y0 + h * 0.32, x0 + 7 + sw * 0.8, y0 + h * 0.46, '#ffd700');
    text('UA', x0 + 7 + sw / 2, y0 + h * 0.72, sw * 0.9, `bold ${Math.round(h * 0.26)}px ${SANS}`, '#fff');
    text('СА 4821 АК', x0 + sw + (w - sw) / 2 + 4, y0 + h / 2 + 2, (w - sw) * 0.86, `bold ${fs}px ${SANS}`, '#111');
  };
  plate(0, 1296, 512, 104, 92); plate(0, 1024, 256, 124, 70);
  box(512, 1316, 1000, 1404, '#f2c200'); text('ТАКСІ', 756, 1362, 260, `bold 72px ${SANS}`, '#111');
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) for (const x0 of [520, 904]) box(x0 + i * 22, 1318 + j * 21, x0 + i * 22 + 21, 1338 + j * 21, '#111');
  box(0, 1214, 512, 1280, '#0b0b0b'); text('10   ЦЕНТР – ДАХНІВКА', 256, 1248, 480, `bold 42px ${SANS}`, '#ffb020');
  // Bogdan: chrome-lettered grille badge, and the cardboard route number the drivers prop behind the glass
  box(0, 1416, 256, 1480, '#16171a'); g.strokeStyle = '#aeb3b9'; g.lineWidth = 6; g.strokeRect(5, 1421, 246, 54);
  text('БОГДАН', 128, 1449, 220, `bold 44px ${SANS}`, '#dfe3e8');
  box(256, 1416, 512, 1576, '#f6f4ec'); g.strokeStyle = '#c4201c'; g.lineWidth = 10; g.strokeRect(263, 1423, 242, 146);
  text('10', 384, 1486, 200, `bold 112px ${SANS}`, '#141414'); text('ЦЕНТР – ДАХНІВКА', 384, 1550, 214, `bold 22px ${SANS}`, '#141414');
  box(512, 1236, 1024, 1312, '#f2f2ee'); text('ЧЕРКАСИЕЛЕКТРОТРАНС', 768, 1274, 470, `bold 44px ${SANS}`, '#1d4fa8');
  // the box-truck side that sells the ad slot (the shader swaps it in for 3 of 8 trucks): Telegram blue, the bot on a white strip
  box(1024, 1024, 2048, 1536, '#229ed9'); box(1024, 1024, 2048, 1040, '#1a7fb0'); box(1024, 1520, 2048, 1536, '#1a7fb0');
  text('ТУТ ВАША РЕКЛАМА', 1536, 1140, 940, `bold 136px ${SANS}`, '#ffffff');
  text('Замовляйте рекламу в бота', 1536, 1258, 900, `bold 72px ${SANS}`, '#eaf6fd');
  g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(1064, 1320, 944, 170, 36); g.fill();
  g.fillStyle = '#229ed9'; g.beginPath(); g.arc(1150, 1405, 60, 0, 7); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(1112, 1402); g.lineTo(1186, 1372); g.lineTo(1172, 1440); g.lineTo(1152, 1420); g.lineTo(1140, 1434); g.lineTo(1138, 1414); g.fill();
  text('tg: @driver_game_bot', 1600, 1408, 760, `bold 104px ${SANS}`, '#1a7fb0');
  // the other box-truck side (5 of 8 trucks) sells the slot too: red lettering on the white box, red rules top and bottom
  const gr = g.createLinearGradient(0, 1536, 0, 2048); gr.addColorStop(0, '#ecece6'); gr.addColorStop(1, '#deded6');
  box(1024, 1536, 2048, 2048, gr); box(1024, 1548, 2048, 1566, '#c4201c'); box(1024, 2018, 2048, 2036, '#c4201c');
  text('ТУТ ВАША РЕКЛАМА', 1536, 1660, 940, `bold 136px ${SANS}`, '#c4201c');
  text('Замовляйте рекламу в бота', 1536, 1778, 900, `bold 72px ${SANS}`, '#8f1612');
  g.strokeStyle = '#c4201c'; g.lineWidth = 10; g.beginPath(); g.roundRect(1069, 1845, 934, 160, 36); g.stroke();
  g.fillStyle = '#c4201c'; g.beginPath(); g.arc(1150, 1925, 58, 0, 7); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(1112, 1922); g.lineTo(1186, 1892); g.lineTo(1172, 1960); g.lineTo(1152, 1940); g.lineTo(1140, 1954); g.lineTo(1138, 1934); g.fill();
  text('tg: @driver_game_bot', 1600, 1928, 760, `bold 104px ${SANS}`, '#c4201c');
  const ADS = [['#b8281c', '#ffe08a', 'ПІЦА «ДНІПРО»', 'доставка за 30 хвилин'], 'urban',
    ['#6a1420', '#f3dca0', 'ДРАМТЕАТР', 'сезон відкрито'], ['#17488f', '#ffffff', 'ЕНЕРГОЗБУТ', 'заощаджуй світло'],
    null, ['#1f7a3e', '#ffffff', 'СОНЯЧНА ЕНЕРГІЯ', 'панелі для дому'],
    ['#1b2a5a', '#ffd24a', 'ЮРИДИЧНА ДОПОМОГА', '0 800 55 01 10'], ['#e36a12', '#1d1d1d', 'СПОРТМАРКЕТ', 'біжи містом']];
  ADS.forEach((ad, i) => {
    const x = 1024 + (i % 2) * 512, y = Math.floor(i / 2) * 170;
    if (ad === 'urban') { // the paid URBAN tile (AD_URBAN): their blue, the logo once its file loads, what and where
      box(x, y, x + 512, y + 170, URBAN_BLUE);
      text('ШАУРМА', x + 424, y + 52, 160, `bold 46px ${SANS}`, '#ffffff');
      text('Надпільна', x + 424, y + 100, 160, `30px ${SANS}`, '#dfe3ff'); text('252/1А', x + 424, y + 136, 160, `bold 34px ${SANS}`, '#ffffff');
      brandImage('urban').then((img) => { if (img) { g.drawImage(img, x + 14, y + 12, 146 / 256 * 543 * 0.94, 146 * 0.94); tex.needsUpdate = true; } });
      return;
    }
    if (!ad) { // the ad slot sells itself (1 in 7 vans, bus backs and roof signs): Telegram blue, the bot on a white strip
      box(x, y, x + 512, y + 170, '#229ed9'); box(x + 12, y + 120, x + 500, y + 162, '#ffffff');
      text('ТУТ ВАША РЕКЛАМА', x + 256, y + 50, 472, `bold 64px ${SANS}`, '#ffffff');
      text('Замовляйте рекламу в бота', x + 256, y + 98, 460, `bold 30px ${SANS}`, '#eaf6fd');
      text('tg: @driver_game_bot', x + 256, y + 142, 470, `bold 38px ${SANS}`, '#1a7fb0');
      return;
    }
    const [bg, fg, t1, t2] = ad;
    box(x, y, x + 512, y + 170, bg);
    text(t1, x + 256, y + 70, 470, `bold 66px ${SANS}`, fg); text(t2, x + 256, y + 132, 440, `36px ${SANS}`, fg);
  });
  for (const [x, y, c] of SWATCH) box(x - 16, y - 16, x + 16, y + 16, c);
  return tex;
}

// The URBAN box-truck livery in the café's own style (the window films on Nadpilna 252/1A): their blue, the logo, the
// slanted orange / pale-blue bands with «URBAN · WRAPS · BOWLS · DRINKS» running along them. Laid out on a 1024 frame –
// the box side (1024 x 512, both sides read it the way the red ad side is read) on top, the back doors (512 x 512)
// below – but drawn at half size (a 512 canvas, 1 MB on the GPU instead of 4: a truck side reads from a few metres off
// at that), with the logo added once the shared SVG has loaded.
export function makeUrbanLivery() {
  if (typeof document === 'undefined') return null;
  const cv = Object.assign(document.createElement('canvas'), { width: 512, height: 512 }), g = cv.getContext('2d');
  g.scale(0.5, 0.5);
  const tex = Object.assign(new THREE.CanvasTexture(cv), { colorSpace: THREE.SRGBColorSpace, flipY: false, anisotropy: 4 });
  const SANS = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  const bands = (x0, y0, w, h, y, k) => { // two slanted lettered bands across a panel, clipped to it
    g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
    for (const [dy, bg, fg] of [[0, '#ef6a2e', '#ffffff'], [k * 0.15, '#c9d4ff', URBAN_BLUE]]) {
      g.save(); g.translate(x0 + w / 2, y + dy); g.rotate(-0.06);
      g.fillStyle = bg; g.fillRect(-w, -k * 0.06, w * 2, k * 0.12);
      g.fillStyle = fg; g.font = `bold italic ${Math.round(k * 0.075)}px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('URBAN · WRAPS · BOWLS · DRINKS · URBAN · WRAPS · BOWLS · DRINKS · URBAN · WRAPS · BOWLS', 0, 2);
      g.restore();
    }
    g.restore();
  };
  const draw = (logo) => {
    g.fillStyle = URBAN_BLUE; g.fillRect(0, 0, 1024, 1024);
    // side: logo over the bands, what and where under them
    bands(0, 0, 1024, 512, 316, 512);
    if (logo) g.drawImage(logo, 512 - 235, 14, 470, 470 * 256 / 543);
    g.fillStyle = '#ffffff'; g.font = `bold 46px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('ШАУРМА · STREET FOOD · НАДПІЛЬНА, 252/1А', 512, 478);
    // back doors: logo, bands, the address
    bands(0, 512, 512, 512, 512 + 316, 512);
    if (logo) g.drawImage(logo, 256 - 190, 512 + 40, 380, 380 * 256 / 543);
    g.fillStyle = '#ffffff'; g.font = `bold 36px ${SANS}`;
    g.fillText('НАДПІЛЬНА, 252/1А', 256, 512 + 470);
    tex.needsUpdate = true;
  };
  draw(null);
  brandImage('urban').then((img) => { if (img) draw(img); });
  return tex;
}

// ------------------------------------------------------------------------------------------ material
export function createVehicleMaterial(atlas) {
  const mat = new THREE.MeshStandardMaterial({ map: atlas || null, color: atlas ? 0xffffff : 0xb8b8b8, roughness: 0.55, metalness: 0 });
  const night = { value: 0 }, livery = atlas ? makeUrbanLivery() : null;
  mat.userData.night = night;
  if (livery) mat.defines = { URBAN_LIVERY: '' };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = night;
    if (livery) sh.uniforms.uUrban = { value: livery };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aPart; attribute float aAO; attribute vec3 aPaint; attribute vec3 aMisc;
varying float vPart; varying float vAO; varying vec3 vPaint; varying vec3 vMisc; varying vec3 vUrb;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
vPart = aPart; vAO = aAO; vPaint = aPaint; vMisc = aMisc; vUrb = vec3(0.0);
#ifdef URBAN_LIVERY
// the URBAN truck (aMisc.y 8): its box sides (the ad-side atlas rect) and the back doors (the box's -x face, mapped
// from the model position: z -1.1..1.1, y 1.03..3.45) read the livery canvas instead
if (aMisc.y > 7.5 && aPart < 0.5) {
  if (uv.x >= 0.5 && uv.y >= 0.75) vUrb = vec3((uv.x - 0.5) * 2.0, (uv.y - 0.75) * 2.0, 1.0);
  else if (normal.x < -0.9 && position.y > 0.95) vUrb = vec3(clamp(position.z / 2.2 + 0.5, 0.0, 1.0) * 0.5, 0.5 + clamp((3.45 - position.y) / 2.42, 0.0, 1.0) * 0.5, 1.0);
}
#endif
#ifdef USE_MAP
if (abs(aPart - 15.0) < 0.5 && uv.x >= 0.5) vMapUv += vec2(mod(aMisc.y, 2.0) * 0.25, floor(aMisc.y / 2.0) * 0.083);
else if (aPart < 0.5 && uv.x >= 0.5 && uv.y >= 0.75 && aMisc.y > 4.5) vMapUv.y -= 0.25; // truck side: red -> blue ad slot
#endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNight; varying float vPart; varying float vAO; varying vec3 vPaint; varying vec3 vMisc; varying vec3 vUrb;
#ifdef URBAN_LIVERY
uniform sampler2D uUrban;
#endif`)
      .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef URBAN_LIVERY
if (vUrb.z > 0.5) diffuseColor.rgb = texture2D(uUrban, vUrb.xy).rgb;
#endif
int part = int(vPart + 0.5);
vec3 texel = diffuseColor.rgb;
if (part == 1) diffuseColor.rgb *= vPaint;
else if (part == 3) diffuseColor.rgb = texel * 0.22 + vec3(0.012, 0.016, 0.02);
diffuseColor.rgb *= vAO;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = part == 1 ? 0.3 : part == 2 ? 0.25 : part == 3 ? 0.06 : part == 5 ? 0.92 : part == 7 ? 0.12 : part == 15 ? 0.4 : 0.6;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = part == 2 ? 1.0 : part == 1 ? 0.15 : part == 3 ? 0.35 : 0.0;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (part == 7) totalEmissiveRadiance += texel * uNight * 2.6;
else if (part == 8) totalEmissiveRadiance += texel * vec3(1.0, 0.25, 0.2) * (uNight * 0.7 + vMisc.x * 2.2);
else if (part == 4) totalEmissiveRadiance += texel * uNight * 0.8;
else if (part == 14) totalEmissiveRadiance += texel * (0.6 + uNight * 0.8);
else if (part == 15 && uNight > 0.2) totalEmissiveRadiance += texel * 0.15 * uNight;`);
  };
  mat.customProgramCacheKey = () => 'vehicle-part-v2';
  return mat;
}

// ------------------------------------------------------------------------------------------ procedural fallback bodies
const SW_UV = { white: [904, 1744], black: [816, 1808], glass: [912, 1808], tire: [944, 1808], rim: [976, 1808], head: [1008, 1808], tail: [784, 1840], amber: [912, 1840], plastic: [816, 1872] };
function part(geo, pid, sw) {
  const n = geo.attributes.position.count, u = SW_UV[sw];
  const st = new Float32Array(n * 2);
  for (let k = 0; k < st.length; k += 2) { st[k] = u[0] / 2048; st[k + 1] = u[1] / 2048; }
  geo.setAttribute('uv', new THREE.BufferAttribute(st, 2));
  geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(pid), 1));
  geo.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(n).fill(pid === PART.RUBBER ? 0.6 : 1), 1));
  return geo;
}
const boxAt = (x0, x1, y0, y1, hw, pid, sw) => part(new THREE.BoxGeometry(x1 - x0, y1 - y0, hw * 2).translate((x0 + x1) / 2, (y0 + y1) / 2, 0), pid, sw);
export function fallbackGeometry(type, lod = 0) {
  const T = VTYPES[type] || VTYPES.sedan, L = T.len, W = T.wid, H = T.h, hw = W / 2;
  const big = !!T.big, wr = big ? 0.48 : 0.32, sill = wr * 0.9, belt = big ? H * 0.45 : sill + (H - sill) * 0.42;
  const parts = [boxAt(-L / 2, L / 2, sill, belt, hw, PART.PAINT, 'white')];
  if (big) {
    parts.push(boxAt(-L / 2 + 0.05, L / 2 - 0.05, belt, H - 0.25, hw - 0.03, PART.GLASS, 'glass'));
    parts.push(boxAt(-L / 2, L / 2, H - 0.25, H, hw, PART.PAINT, 'white'));
  } else {
    const c0 = -L * 0.32, c1 = L * (type === 'pickup' ? 0.02 : 0.2);
    parts.push(boxAt(c0, c1, belt, H - 0.06, hw * 0.9, PART.GLASS, 'glass'));
    parts.push(boxAt(c0 + 0.1, c1 - 0.15, H - 0.06, H, hw * 0.88, PART.PAINT, 'white'));
  }
  parts.push(boxAt(L / 2 - 0.04, L / 2 + 0.01, belt - 0.22, belt - 0.06, hw * 0.85, PART.HEAD, 'head'));
  parts.push(boxAt(-L / 2 - 0.01, -L / 2 + 0.04, belt - 0.22, belt - 0.06, hw * 0.85, PART.TAIL, 'tail'));
  parts.push(boxAt(-L / 2 + 0.02, L / 2 - 0.02, 0.12, sill + 0.02, hw * 0.92, PART.PLASTIC, 'black'));
  const axles = big ? [L / 2 - 1.6, -L / 2 + 2.2, ...(L > 10 ? [-L / 2 + 3.6] : [])] : [L / 2 - 0.85, -L / 2 + 0.85];
  const seg = lod === 0 ? 14 : lod === 1 ? 8 : 6;
  for (const x of axles) for (const s of [-1, 1]) {
    const cyl = new THREE.CylinderGeometry(wr, wr, 0.24, seg).rotateX(Math.PI / 2).translate(x, wr, s * (hw - 0.12));
    parts.push(part(cyl, PART.RUBBER, 'tire'));
  }
  const g = mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p));
  parts.forEach(p => p.dispose());
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------------------------------ loading
let cached = null;
export function loadTrafficVehicles(opts = {}) {
  if (cached && !opts.fresh) return cached;
  cached = (async () => {
    const atlas = makeVehicleAtlas();
    const material = createVehicleMaterial(atlas);
    const geos = {};
    let fallback = !!opts.fallbackOnly;
    if (!fallback) {
      const base = opts.base ?? (import.meta.env?.BASE_URL ?? '/') + 'assets/vehicles/';
      const loader = new GLTFLoader();
      for (const f of ['cars', 'big']) {
        try {
          const gl = await loader.loadAsync(`${base}vehicles_${f}.glb`);
          gl.scene.traverse((node) => {
            const o = node.isMesh ? node : null;
            if (!o) return;
            const m = /^(.*?)(?:_l([12]))?$/.exec(o.name), type = m[1], lod = m[2] ? +m[2] : 0;
            if (!VTYPES[type]) return;
            (geos[type] ??= [])[lod] = adoptGeometry(o.geometry);
          });
        } catch (e) { console.warn(`[traffic] vehicles_${f}.glb unavailable, procedural fallback`, e?.message || e); fallback = true; }
      }
    }
    for (const type of Object.keys(VTYPES)) { // fill missing types / LODs
      const G = geos[type] ??= [];
      for (let l = 0; l < 3; l++) if (!G[l]) G[l] = G[l - 1] || fallbackGeometry(type, l);
    }
    return makeModels(geos, material, atlas, fallback);
  })();
  return cached;
}

// build models without loading (headless tests, or a caller that already has geometries)
export function makeModels(geos, material = createVehicleMaterial(null), atlas = null, fallback = true) {
  if (!geos) { geos = {}; for (const type of Object.keys(VTYPES)) geos[type] = [0, 1, 2].map(l => fallbackGeometry(type, l)); }
  return {
    geos, material, atlas, fallback, types: Object.keys(geos),
    setNight(k) { material.userData.night.value = Math.max(0, Math.min(1, k)); },
    makeMesh(type, colour, seed = 0) {
      const src = (geos[type] || geos.sedan)[0], g = src.clone();
      addInstanceAttrs(g, 1);
      const mesh = new THREE.InstancedMesh(g, material, 1);
      mesh.setMatrixAt(0, new THREE.Matrix4());
      g.attributes.aPaint.array.set(paintOf(colour));
      g.attributes.aMisc.array[1] = adTile(seed);
      mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.name = `vehicle-${type}`;
      return { mesh, g, type, dispose() { mesh.parent?.remove(mesh); g.dispose(); mesh.dispose(); } };
    },
  };
}

// glb attributes -> aPart (TEXCOORD_1.x) and aAO (COLOR_0.r, stored linear as AO^2.2)
function adoptGeometry(g) {
  const n = g.attributes.position.count, pa = new Float32Array(n), ao = new Float32Array(n).fill(1);
  const uv1 = g.attributes.uv1, col = g.attributes.color;
  for (let v = 0; v < n; v++) {
    if (uv1) pa[v] = Math.round(uv1.getX(v));
    if (col) ao[v] = Math.max(0, col.getX(v)) ** (1 / 2.2);
  }
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(pa, 1));
  g.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
  g.deleteAttribute('uv1'); g.deleteAttribute('color');
  g.computeBoundingSphere();
  return g;
}

function addInstanceAttrs(g, cap) {
  const paint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(0.6), 3);
  const misc = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  paint.setUsage(THREE.DynamicDrawUsage); misc.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aPaint', paint); g.setAttribute('aMisc', misc);
}

// ------------------------------------------------------------------------------------------ instanced fleet
export function createFleet(scene, models, opts = {}) {
  const shadows = opts.shadows ?? true;
  const batches = new Map(); // `${type}:${lod}` -> batch
  const batch = (type, lod) => {
    const key = type + ':' + lod;
    let b = batches.get(key);
    if (!b) { b = { type, lod, cap: 0, n: 0, mesh: null, geo: null }; batches.set(key, b); grow(b, lod === 0 ? 16 : 64); }
    return b;
  };
  function grow(b, cap) {
    const src = models.geos[b.type][b.lod], g = new THREE.BufferGeometry();
    for (const k of Object.keys(src.attributes)) g.setAttribute(k, src.attributes[k]);
    g.setIndex(src.index); g.boundingSphere = src.boundingSphere;
    addInstanceAttrs(g, cap);
    const mesh = new THREE.InstancedMesh(g, models.material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.count = 0; mesh.name = `traffic-${b.type}-l${b.lod}`;
    mesh.castShadow = shadows && b.lod === 0; mesh.receiveShadow = b.lod < 2;
    if (b.mesh) { // keep what is already written this frame
      mesh.instanceMatrix.array.set(b.mesh.instanceMatrix.array.subarray(0, b.n * 16));
      g.attributes.aPaint.array.set(b.geo.attributes.aPaint.array.subarray(0, b.n * 3));
      g.attributes.aMisc.array.set(b.geo.attributes.aMisc.array.subarray(0, b.n * 3));
      scene.remove(b.mesh); b.mesh.dispose(); b.geo.deleteAttribute('aPaint'); b.geo.deleteAttribute('aMisc');
    }
    b.mesh = mesh; b.geo = g; b.cap = cap;
    scene.add(mesh);
  }
  const byLod = [0, 0, 0];
  return {
    begin() { for (const b of batches.values()) b.n = 0; byLod[0] = byLod[1] = byLod[2] = 0; },
    add(type, lod, m, paint, brake = 0, seed = 0) {
      if (!models.geos[type]) type = 'sedan';
      const b = batch(type, lod);
      if (b.n >= b.cap) grow(b, b.cap * 2);
      const i = b.n++;
      b.mesh.instanceMatrix.array.set(m, i * 16);
      const P = b.geo.attributes.aPaint.array, M = b.geo.attributes.aMisc.array;
      P[i * 3] = paint[0]; P[i * 3 + 1] = paint[1]; P[i * 3 + 2] = paint[2];
      M[i * 3] = brake; M[i * 3 + 1] = adTile(seed);
      byLod[lod]++;
    },
    end() {
      for (const b of batches.values()) {
        b.mesh.count = b.n; b.mesh.visible = b.n > 0;
        if (!b.n) continue;
        const dirty = (attr, width) => { attr.clearUpdateRanges(); attr.addUpdateRange(0, b.n * width); attr.needsUpdate = true; };
        dirty(b.mesh.instanceMatrix, 16); dirty(b.geo.attributes.aPaint, 3); dirty(b.geo.attributes.aMisc, 3);
      }
    },
    stats: () => ({ drawn: byLod[0] + byLod[1] + byLod[2], byLod: byLod.slice(), meshes: batches.size }),
    dispose() { for (const b of batches.values()) { scene.remove(b.mesh); b.mesh.dispose(); b.geo.deleteAttribute('aPaint'); b.geo.deleteAttribute('aMisc'); } batches.clear(); },
  };
}
