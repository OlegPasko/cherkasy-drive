// Procedural city textures: every map is painted into typed arrays by small tileable noise / pattern painters (no
// image files, no DOM needed, so it also runs in node tests and workers). Albedo maps are sRGB, repeat-wrapped, mipmapped.
//
// Exports
//   createCityTextures({ size=256, anisotropy=8 }) -> T (sync, cached per size)
//   loadCityTextures(renderer?) -> Promise<T>  (same bundle; anisotropy from the renderer, yields once to repaint)
//   T = { asphalt, pavement, grass, plaster, brick, concrete, roof, glass, noise,   // THREE.DataTexture, RepeatWrapping
//         wallLayers,  // DataArrayTexture, one layer per WALL_LAYERS entry (facade + roof albedo, alpha = cavity/grime)
//         layerScale,  // Float32Array: metres covered by one texture tile, per layer
//         signs: null } // optional storefront sign atlas (16 rows), set by the caller (legacy signs.js) if wanted
//   WALL_LAYERS: names in layer order (the facade LAYER ids index this list)
//   texel painters for other modules: tileNoise(x, y, period, seed), fbm(x, y, period, oct, seed)
import * as THREE from 'three';

export const WALL_LAYERS = ['STUCCO', 'WHITE', 'BUFF', 'RED2', 'CONCRETE', 'METAL', 'GRANITE', 'TERRA', 'LIME', 'ROOF', 'ROOF_MEMBRANE', 'ROOF_GRAVEL'];
const SCALE = { STUCCO: 4, WHITE: 1.2, BUFF: 1.2, RED2: 1.2, CONCRETE: 3.2, METAL: 2, GRANITE: 2.4, TERRA: 2.4, LIME: 2.4, ROOF: 4, ROOF_MEMBRANE: 6, ROOF_GRAVEL: 3 };

// ---------------------------------------------------------------------------------------------- noise
// integer lattice hash -> [0, 1) (murmur-style finaliser over a mixed key)
function hash3(i, j, s) {
  let k = (i * 73856093) ^ (j * 19349663) ^ (s * 83492791);
  k = Math.imul(k ^ (k >>> 16), 0x7feb352d);
  k = Math.imul(k ^ (k >>> 15), 0x846ca68b);
  return ((k ^ (k >>> 16)) >>> 0) / 4294967296;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10); // quintic
// value noise on a lattice that wraps every `period` cells (x, y in cells)
export function tileNoise(x, y, period, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = fade(x - xi), fy = fade(y - yi);
  const w = (v) => ((v % period) + period) % period;
  const x0 = w(xi), x1 = w(xi + 1), y0 = w(yi), y1 = w(yi + 1);
  const a = hash3(x0, y0, seed), b = hash3(x1, y0, seed), c = hash3(x0, y1, seed), d = hash3(x1, y1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export function fbm(x, y, period, oct = 4, seed = 0) {
  let s = 0, amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) { s += tileNoise(x, y, period, seed + o * 31) * amp; tot += amp; x *= 2; y *= 2; period *= 2; amp *= 0.5; }
  return s / tot;
}

// ---------------------------------------------------------------------------------------------- painter
// paint(size, fn(u, v, px, py) -> [r, g, b, a?]) with u, v in [0, 1); returns Uint8 RGBA (sRGB values)
function paint(size, fn) {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = fn(x / size, y / size, x, y), k = (y * size + x) * 4;
    out[k] = clamp255(c[0]); out[k + 1] = clamp255(c[1]); out[k + 2] = clamp255(c[2]); out[k + 3] = clamp255(c[3] ?? 1);
  }
  return out;
}
const clamp255 = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255));
const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
const mul = (c, k) => c.map((v) => v * k);
const smooth = (lo, hi, x) => fade(Math.min(1, Math.max(0, (x - lo) / (hi - lo))));

// masonry: rows of units (cols per tile row, rows per tile), running bond; returns {joint 0..1, id}
function bond(u, v, cols, rows, jw) {
  const r = Math.floor(v * rows), off = (r % 2) * 0.5;
  const cu = u * cols + off, c = Math.floor(cu);
  const fu = cu - c, fv = v * rows - r;
  const dj = Math.min(fu, 1 - fu) / cols, dv = Math.min(fv, 1 - fv) / rows; // distance to the joint in tile units
  const joint = 1 - smooth(jw * 0.5, jw * 1.4, Math.min(dj, dv));
  return { joint, id: hash3(((c % cols) + cols) % cols, r, 7) };
}

// ---------------------------------------------------------------------------------------------- wall / roof layers
const LAYER_PAINT = {
  // lime plaster: soft blotches, fine grain, faint trowel waves
  STUCCO: (u, v) => { const n = fbm(u * 8, v * 8, 8, 5, 1), g = tileNoise(u * 128, v * 128, 128, 2); const k = 0.88 + (n - 0.5) * 0.1 + (g - 0.5) * 0.05; return [...mul([0.93, 0.92, 0.9], k), 0.7 + n * 0.3]; },
  // white silicate brick
  WHITE: (u, v) => brickPx(u, v, [0.9, 0.89, 0.85], [0.72, 0.71, 0.68], 0.05, 11),
  BUFF: (u, v) => brickPx(u, v, [0.86, 0.76, 0.56], [0.7, 0.66, 0.58], 0.09, 12),
  RED2: (u, v) => brickPx(u, v, [0.62, 0.34, 0.26], [0.66, 0.63, 0.58], 0.12, 13),
  // precast concrete panel: pores + stains (panel seams are drawn by the shader on the bay / floor grid)
  CONCRETE: (u, v) => { const n = fbm(u * 6, v * 6, 6, 5, 3), p = tileNoise(u * 180, v * 180, 180, 4); const k = 0.82 + (n - 0.5) * 0.09 - (p > 0.9 ? 0.08 : 0); return [...mul([0.8, 0.8, 0.78], k), 0.6 + n * 0.4]; },
  // corrugated profiled sheet (vertical ribs)
  METAL: (u, v) => { const r = 0.5 + 0.5 * Math.cos(u * Math.PI * 2 * 10), n = fbm(u * 4, v * 4, 4, 3, 5); const k = 0.7 + r * 0.22 + (n - 0.5) * 0.08; return [...mul([0.78, 0.8, 0.82], k), 0.8]; },
  GRANITE: (u, v) => { const b = bond(u, v, 3, 4, 0.006), s = hash3(Math.floor(u * 256), Math.floor(v * 256), 9), n = fbm(u * 10, v * 10, 10, 3, 6); const k = 0.5 + (s - 0.5) * 0.25 + (n - 0.5) * 0.15 + (b.id - 0.5) * 0.08; return [...mix(mul([0.62, 0.55, 0.52], k / 0.5), [0.3, 0.28, 0.27], b.joint * 0.7), 1 - b.joint * 0.6]; },
  TERRA: (u, v) => { const b = bond(u, v, 4, 8, 0.008), n = fbm(u * 8, v * 8, 8, 3, 7); const c = mul([0.78, 0.5, 0.36], 0.92 + (b.id - 0.5) * 0.18 + (n - 0.5) * 0.1); return [...mix(c, [0.55, 0.52, 0.48], b.joint), 1 - b.joint * 0.5]; },
  LIME: (u, v) => { const b = bond(u, v, 4, 8, 0.006), n = fbm(u * 6, v * 6, 6, 4, 8); const c = mul([0.88, 0.85, 0.77], 0.94 + (b.id - 0.5) * 0.08 + (n - 0.5) * 0.14); return [...mix(c, [0.7, 0.68, 0.62], b.joint * 0.8), 1 - b.joint * 0.4]; },
  // standing-seam / sheet roof
  ROOF: (u, v) => { const s = Math.abs(((u * 8) % 1) - 0.5), rib = 1 - smooth(0.0, 0.06, 0.5 - s), n = fbm(u * 5, v * 5, 5, 4, 9); return [...mul([0.62, 0.63, 0.63], 0.85 + (n - 0.5) * 0.25 + rib * 0.15), 0.8]; },
  // bitumen membrane with overlapping strips and patched areas
  ROOF_MEMBRANE: (u, v) => { const n = fbm(u * 6, v * 6, 6, 5, 10), strip = Math.abs(((v * 6) % 1) - 0.02) < 0.012 ? 0.85 : 1, patch = fbm(u * 3, v * 3, 3, 2, 11) > 0.62 ? 0.82 : 1; return [...mul([0.36, 0.36, 0.37], (0.85 + (n - 0.5) * 0.35) * strip * patch), 0.9]; },
  ROOF_GRAVEL: (u, v) => { const s = hash3(Math.floor(u * 256), Math.floor(v * 256), 12), n = fbm(u * 8, v * 8, 8, 3, 13); return [...mul([0.6, 0.58, 0.55], 0.7 + s * 0.35 + (n - 0.5) * 0.2), 0.9]; },
};
function brickPx(u, v, brick, mortar, vary, seed) {
  const b = bond(u, v, 4, 16, 0.012), n = fbm(u * 16, v * 16, 16, 2, seed), f = hash3(Math.floor(u * 256), Math.floor(v * 256), seed);
  const c = mul(brick, 1 + (b.id - 0.5) * vary * 2 + (n - 0.5) * 0.1 + (f - 0.5) * 0.05);
  return [...mix(c, mortar, b.joint), 1 - b.joint * 0.7];
}

// ---------------------------------------------------------------------------------------------- ground / misc maps
const MAPS = {
  asphalt: (u, v, s) => { const n = fbm(u * 8, v * 8, 8, 5, 20), g = hash3(Math.floor(u * s), Math.floor(v * s), 21), crack = Math.abs(fbm(u * 5, v * 5, 5, 3, 22) - 0.5) < 0.006 ? 0.75 : 1; return mul([0.3, 0.3, 0.31], (0.82 + (n - 0.5) * 0.3 + (g - 0.5) * 0.22) * crack); },
  pavement: (u, v) => { const b = bond(u, v, 5, 10, 0.01), n = fbm(u * 6, v * 6, 6, 4, 23); return mix(mul([0.66, 0.64, 0.6], 0.9 + (b.id - 0.5) * 0.14 + (n - 0.5) * 0.2), [0.38, 0.37, 0.35], b.joint); },
  grass: (u, v, s) => { const n = fbm(u * 6, v * 6, 6, 5, 24), b = hash3(Math.floor(u * s), Math.floor(v * s), 25), dry = smooth(0.55, 0.75, fbm(u * 3, v * 3, 3, 3, 26)); return mul(mix([0.26, 0.38, 0.14], [0.45, 0.43, 0.22], dry), 0.75 + (n - 0.5) * 0.4 + (b - 0.5) * 0.3); },
  glass: (u, v) => { const n = fbm(u * 3, v * 3, 3, 3, 27); return mul([0.2, 0.25, 0.28], 0.85 + n * 0.3); },
};

// ---------------------------------------------------------------------------------------------- textures
// repeat-wrapped, trilinear-mipmapped sampling for every generated map
function tiled(tex, srgb) {
  return Object.assign(tex, {
    wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, magFilter: THREE.LinearFilter, minFilter: THREE.LinearMipmapLinearFilter,
    generateMipmaps: true, colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace, needsUpdate: true,
  });
}
const dataTex = (data, size, srgb) => tiled(new THREE.DataTexture(data, size, size, THREE.RGBAFormat), srgb);

const cache = new Map();
export function createCityTextures({ size = 256, anisotropy = 8 } = {}) {
  if (cache.has(size)) return cache.get(size);
  const T = { signs: null };
  for (const [name, fn] of Object.entries(MAPS)) {
    const s = name === 'asphalt' ? size * 2 : size;
    T[name] = dataTex(paint(s, (u, v) => fn(u, v, s)), s, true);
    T[name].anisotropy = anisotropy;
  }
  const L = WALL_LAYERS.map((n) => paint(size, LAYER_PAINT[n]));
  const all = new Uint8Array(size * size * 4 * L.length);
  L.forEach((d, i) => all.set(d, i * d.length));
  T.wallLayers = tiled(new THREE.DataArrayTexture(all, size, size, L.length), true);
  T.wallLayers.anisotropy = anisotropy;
  T.layerScale = new Float32Array(WALL_LAYERS.map((n) => SCALE[n]));
  // single-layer aliases for plain materials
  T.plaster = dataTex(L[0], size, true); T.brick = dataTex(L[3], size, true);
  T.concrete = dataTex(L[4], size, true); T.roof = dataTex(L[9], size, true);
  // linear RGBA noise (four independent tileable channels) for shaders
  T.noise = dataTex(paint(size, (u, v) => [fbm(u * 4, v * 4, 4, 4, 40), fbm(u * 8, v * 8, 8, 3, 41), tileNoise(u * 32, v * 32, 32, 42), hash3(Math.floor(u * size), Math.floor(v * size), 43)]), size, false);
  for (const t of [T.plaster, T.brick, T.concrete, T.roof, T.noise]) t.anisotropy = anisotropy;
  cache.set(size, T);
  return T;
}

export async function loadCityTextures(renderer, opts = {}) {
  await new Promise((r) => setTimeout(r, 0));
  const aniso = renderer?.capabilities?.getMaxAnisotropy?.() ?? 8;
  return createCityTextures({ anisotropy: Math.min(8, aniso), ...opts });
}
