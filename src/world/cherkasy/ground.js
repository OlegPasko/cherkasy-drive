// Ground of the OSM Cherkasy map: yards and far fields, lawns / parks / sand / forest floor / pitches (map.cover), paved
// sidewalks and squares (map.walks), asphalt carriageways one kerb below the paving with granite kerb faces along every
// carriageway edge, embankment walls where land meets open water, lane markings and zebra crossings. Every surface
// is draped on one terrain (the DEM box-filtered to 16 m cells, bilinear per cell) and drawn by one shader keyed by a
// per-vertex surface id, in world-space texture coordinates; the meshes are cut into 1 km tiles (8 km over the far fields).
//
//   createHeightField(map, dem: Int16Array) -> hf { heightAt(x, z), hMax, cell, x0, z0, x1, z1, pad(P, margin = 30), data }
//   heightFieldFrom(hf.data) -> the same field over the same grid (workers)
//     pad(ring [[x,z]...]) levels the terrain under a hand-built site (call before buildGround); returns the level
//   buildGround({ scene, T, map, hf, strip?, renderer? }) -> ground
//     scene: parent Object3D; T: kit/textures.js bundle; strip: { A:[x,z], B:[x,z], y0, y1 } the sandy low shore strip
//       (shore.js shoreStrip + STRIP) or null; renderer: for the decal bias of the markings
//     ground = { root, heightAt, terrainHeight(x, z) (what the rendered surface is: asphalt / land / river plane),
//       isWater(x, z), onAsphalt(x, z), shoreDist(x, z) (m to open water, 20 m grid), wetSegs [{ax,az,bx,bz,nx,nz}]
//       (embankment edges facing the water, n toward it), band { minY, maxY, slope }, stats, update() }
//   createGroundMaterial(T, strip?) -> MeshStandardMaterial;  GY (layer heights), SURF (surface ids)
//   buildGroundAsync({ ...buildGround args, mapUrl }) -> Promise<ground>: three module workers (parts 'land' / 'roads' /
//     'cover', each fetching map.json) build in parallel; falls back to buildGround on any worker failure
//   buildGroundData({ map, hf, parts }) -> the CPU-only part (tile geometries, markings, rasters, bank segments, water
//     distance) for the given parts; the worker entry point of this same file calls it
import * as THREE from 'three';
import { WATER_Y } from '../water.js';
import { patchMaterial } from '../materials.js';
import { decalBias } from '../../render/renderer.js';
import { mergeGeometries } from '../../kit/batch.js';
import { ringPts, triangulate, area2, bboxOf, BitRaster, packGeometry, unpackGeometry, inWorker } from './geo.js';

// layer offsets above the terrain (m): 1.5 - 2.5 cm apart, the drape agrees to ~1 cm between layers
export const GY = { ROAD: 0, LAND: 0.15, COVER: 0.165, WALK: 0.19, WATER: WATER_Y };
export const SURF = { ASPHALT: 0, PAVERS: 1, GRASS: 2, YARD: 3, SAND: 4, FOREST: 5, CONCRETE: 6, CURB: 7, PITCH: 8, DIRT: 9, BANK: 10,
  FLOWERS: 11, TRACK: 12, FARM: 13, ALLOT: 14, PARKING: 15, SCRUB: 16, PLAY: 17, WET: 18 };
// cover kinds in draw order (later on top), with their surface
const COVER = [['farm', SURF.FARM], ['industrial', SURF.CONCRETE], ['allot', SURF.ALLOT], ['forest', SURF.FOREST], ['scrub', SURF.SCRUB],
  ['orchard', SURF.GRASS], ['grass', SURF.GRASS], ['park', SURF.GRASS], ['wet', SURF.WET], ['sand', SURF.SAND], ['dirt', SURF.DIRT],
  ['play', SURF.PLAY], ['pitch', SURF.PITCH], ['track', SURF.TRACK], ['flowers', SURF.FLOWERS], ['parking', SURF.PARKING]];

// ------------------------------------------------------------------------------------------------ material
const GROUND_GLSL = /* glsl */ `
uniform sampler2D gAsphalt, gNoise, gPaving, gGrass, gKerb;
uniform vec2 gStripA, gStripB; uniform vec3 gStrip; // x on, y / z: full sand below y, none above z
varying float vSurf; varying vec3 vGW;
float gRough;
float gh(vec2 p) { return fract(sin(dot(p, vec2(41.37, 289.13))) * 24634.63); }
vec3 lin3(float r, float g, float b) { return pow(vec3(r, g, b), vec3(2.2)); }
vec3 sandTone(float a, float b) { return lin3(0.85, 0.79, 0.625) * (0.85 + 0.2 * a) * (0.92 + 0.16 * b); }
vec3 surfAsphalt(vec2 p, vec4 m, vec4 n, bool lot) {
  vec3 c = mix(texture(gAsphalt, p / 6.0).rgb, texture(gAsphalt, vec2(p.y, -p.x) / 7.3 + 0.37).rgb, 0.35) * 0.95;
  c *= (0.8 + 0.4 * m.r) * (0.9 + 0.2 * n.g);
  gRough = 0.88; return lot ? c * 1.12 : c;
}
vec3 surfPavers(vec2 p, vec4 m, vec4 n) {
  // the centre has concrete pavers (grey with terracotta patches), the outskirts patched asphalt
  float centre = 1.0 - smoothstep(1100.0, 1700.0, length(p - vec2(-150.0, 700.0)));
  vec3 asph = texture(gAsphalt, p / 5.0).rgb * 1.1 * (0.85 + 0.3 * m.r);
  vec2 q = p / vec2(0.2, 0.1); q.x += 0.5 * mod(floor(q.y), 2.0);
  vec2 f = fract(q);
  float joint = smoothstep(0.0, 0.08, f.x) * smoothstep(1.0, 0.92, f.x) * smoothstep(0.0, 0.14, f.y) * smoothstep(1.0, 0.86, f.y);
  vec3 red = lin3(0.60, 0.38, 0.33), grey = lin3(0.60, 0.59, 0.56);
  vec3 pav = mix(grey, red, step(0.62, gh(floor(p / 6.0)))) * (0.9 + 0.2 * gh(floor(q)));
  pav *= texture(gPaving, p / 4.0).rgb * 1.5;
  vec2 fw = fwidth(p); float far = clamp(max(fw.x, fw.y) * 10.0, 0.0, 1.0);
  pav *= mix(0.78 + 0.22 * joint, 0.9, far);
  pav = mix(pav, mix(grey, red, 0.35) * 0.9, far); // distant: the mean tone, no moire
  gRough = 0.82; return mix(asph, pav, centre) * (0.88 + 0.2 * n.r);
}
vec3 surfLawn(vec2 p, vec4 n, int s) {
  vec3 c = mix(texture(gGrass, p / 4.0).rgb, texture(gGrass, p / 17.0 + 0.3).rgb, 0.4);
  c *= (0.78 + 0.35 * n.r) * (0.85 + 0.25 * n.g) * vec3(0.9, 1.0, 0.82);
  c = mix(c, c * vec3(1.15, 1.05, 0.7), smoothstep(0.55, 0.8, n.g) * 0.6);
  if (s == 11) { vec2 cl = floor(p * 3.0); vec3 fl = mix(lin3(0.85, 0.2, 0.25), lin3(0.95, 0.8, 0.2), gh(cl + 7.0)); c = mix(c, fl, step(0.62, gh(cl)) * 0.8); }
  if (s == 16) c *= vec3(0.75, 0.82, 0.7);
  gRough = 0.95; return c;
}
vec3 surfYard(vec2 p, vec4 m, vec4 n, bool plots) {
  vec3 g = texture(gGrass, p / 5.0).rgb * (0.72 + 0.3 * n.r) * vec3(0.85, 0.95, 0.78);
  g = mix(g, texture(gGrass, p / 23.0 + 0.5).rgb * vec3(0.95, 0.9, 0.7) * 0.8, smoothstep(0.4, 0.7, n.g));
  vec3 e = lin3(0.47, 0.42, 0.35) * (0.8 + 0.3 * n.b);
  vec3 c = mix(g, e, 0.8 * smoothstep(0.42, 0.72, n.r * 0.6 + n.b * 0.4 + (m.g - 0.5) * 0.5));
  if (plots) c = mix(c, e * 0.9, step(0.5, fract(p.x / 1.6)) * 0.5);
  gRough = 0.95; return c;
}
vec3 surfFields(vec2 p, vec4 n) {
  float r = gh(floor(p / 180.0 + vec2(n.g * 0.6, 0.0)));
  vec3 c = r < 0.33 ? lin3(0.42, 0.36, 0.27) : r < 0.66 ? lin3(0.66, 0.60, 0.40) : lin3(0.33, 0.42, 0.22);
  gRough = 0.97; return c * (0.85 + 0.25 * n.r);
}
vec3 groundColour() {
  int s = int(vSurf + 0.5);
  vec2 p = vGW.xz;
  vec4 n = vec4(texture(gNoise, p / 37.0).r, texture(gNoise, p / 211.0).g, texture(gNoise, p / 9.0).b, 0.0);
  vec4 m = texture(gNoise, p / 64.0 + 0.21);
  if (s == 0 || s == 15) return surfAsphalt(p, m, n, s == 15);
  if (s == 1) return surfPavers(p, m, n);
  if (s == 2 || s == 11 || s == 16) return surfLawn(p, n, s);
  // the floodplain strip under the escarpment: alluvial sand with tufts of grass
  if (gStrip.x > 0.5 && (s == 3 || s == 5)) {
    vec2 e = gStripB - gStripA; float t = dot(p - gStripA, e) / dot(e, e);
    float k = smoothstep(-0.08, -0.02, t) * (1.0 - smoothstep(1.0, 1.06, t)) * (1.0 - smoothstep(gStrip.y, gStrip.z, vGW.y));
    k *= smoothstep(0.3, 0.52, n.r * 0.55 + n.b * 0.3 + n.g * 0.15 + 0.1);
    if (k > 0.01) { gRough = 0.97; return mix(texture(gGrass, p / 5.0).rgb * vec3(0.9, 0.95, 0.7) * (0.75 + 0.3 * n.r), sandTone(n.b, n.r), k); }
  }
  if (s == 3 || s == 14) return surfYard(p, m, n, s == 14);
  if (s == 4) { gRough = 0.98; return sandTone(n.b, n.r); }
  if (s == 5) { // pine forest floor: needles on pale sand
    vec3 c = mix(lin3(0.54, 0.42, 0.28), lin3(0.78, 0.72, 0.56), smoothstep(0.35, 0.75, n.b * 0.6 + n.r * 0.4));
    c = mix(c, texture(gGrass, p / 6.0).rgb * 0.8, smoothstep(0.6, 0.85, n.g) * 0.6);
    gRough = 0.97; return c * (0.85 + 0.2 * n.r);
  }
  if (s == 6) { gRough = 0.9; return texture(gPaving, p / 8.0).rgb * vec3(0.9, 0.9, 0.88) * (0.8 + 0.3 * n.r); }
  if (s == 7) { gRough = 0.8; return texture(gKerb, vec2(p.x + p.y, vGW.y) * vec2(0.4, 2.0)).rgb * 0.95; }
  if (s == 8) { gRough = 0.9; return lin3(0.24, 0.47, 0.22) * (0.9 + 0.12 * step(0.5, fract(p.x / 5.0))); }
  if (s == 9) { gRough = 0.97; return lin3(0.50, 0.44, 0.35) * (0.8 + 0.3 * n.b) * (0.9 + 0.15 * n.r); }
  if (s == 10) { gRough = 0.85; return lin3(0.55, 0.54, 0.51) * (0.75 + 0.35 * n.b) * mix(0.55, 1.0, smoothstep(${(WATER_Y - 0.4).toFixed(2)}, ${(WATER_Y + 1.2).toFixed(2)}, vGW.y)); }
  if (s == 12) { gRough = 0.9; return lin3(0.62, 0.28, 0.22) * (0.9 + 0.1 * n.b); }
  if (s == 17) { gRough = 0.9; return mix(lin3(0.78, 0.7, 0.52), lin3(0.35, 0.45, 0.62), step(0.7, n.g)) * (0.9 + 0.15 * n.b); }
  if (s == 18) { gRough = 0.9; return texture(gGrass, p / 5.0).rgb * vec3(0.7, 0.8, 0.65) * (0.8 + 0.3 * n.r); }
  return surfFields(p, n);
}
`;

export function createGroundMaterial(T, strip = null) {
  const mat = new THREE.MeshStandardMaterial();
  mat.name = 'cherkasy-ground'; mat.roughness = 0.9; mat.metalness = 0;
  const U = {
    gAsphalt: { value: T.asphalt }, gNoise: { value: T.noise }, gPaving: { value: T.pavement }, gGrass: { value: T.grass },
    gKerb: { value: T.concrete ?? T.pavement },
    gStripA: { value: new THREE.Vector2(...(strip?.A ?? [0, 0])) }, gStripB: { value: new THREE.Vector2(...(strip?.B ?? [0, 0])) },
    gStrip: { value: new THREE.Vector3(strip ? 1 : 0, strip?.y0 ?? 4.5, strip?.y1 ?? 7) },
  };
  return patchMaterial(mat, 'cherkasy-ground-v2', (sh) => {
    for (const name in U) sh.uniforms[name] = U[name];
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSurf;\nvarying float vSurf;\nvarying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = aSurf;\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GROUND_GLSL)
      .replace('#include <map_fragment>', '#include <map_fragment>\n  gRough = 0.9;\n  diffuseColor.rgb *= groundColour();')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = gRough;');
  });
}

// ------------------------------------------------------------------------------------------------ height field
// The DEM (tools/cherkasy/build_map.mjs: 8 m cells, Int16 in `scale` steps, y relative to the river plane) is
// box-filtered onto a 16 m lattice (the source is ~30 m SRTM anyway). heightAt is bilinear inside a lattice cell and
// the ground meshes are clipped to exactly those cells, so every draped layer lies on the same surface.
export function createHeightField(map, dem) {
  const D = map.dem, step = 2, cell = D.cell * step;
  const nx = Math.floor((D.nx - 1) / step) + 1, nz = Math.floor((D.nz - 1) / step) + 1;
  // separable 1-2-1 tent: first along x into a (source rows x lattice columns) buffer, then along z; weights that
  // fall off the DEM edge are dropped and the rest renormalised
  const tent = (src, len, at, stride, base) => {
    let acc = 2 * src[base + at * stride], w = 2;
    if (at > 0) { acc += src[base + (at - 1) * stride]; w++; }
    if (at < len - 1) { acc += src[base + (at + 1) * stride]; w++; }
    return acc / w;
  };
  const rows = new Float32Array(D.nz * nx);
  for (let k = 0; k < rows.length; k++) { const sj = (k / nx) | 0; rows[k] = tent(dem, D.nx, (k % nx) * step, 1, sj * D.nx); }
  const g = new Float32Array(nx * nz);
  for (let k = 0; k < g.length; k++) g[k] = tent(rows, D.nz, ((k / nx) | 0) * step, nx, k % nx) * D.scale;
  return heightFieldFrom({ meta: { x0: D.x0, z0: D.z0, cell, nx, nz }, grid: g });
}
// the same field from its data ({ meta, grid }: hf.data, e.g. posted to a worker); grid is shared, not copied
export function heightFieldFrom({ meta, grid: g }) {
  const { x0, z0, cell, nx, nz } = meta, x1 = x0 + (nx - 1) * cell, z1 = z0 + (nz - 1) * cell;
  const edgeMin = GY.WATER + 2.2; // beyond the DEM the land never dips into the river
  const node = (i, j) => g[(j < 0 ? 0 : j >= nz ? nz - 1 : j) * nx + (i < 0 ? 0 : i >= nx ? nx - 1 : i)];
  function heightAt(x, z) {
    const u = (x - x0) / cell, v = (z - z0) / cell, i = Math.floor(u), j = Math.floor(v), s = u - i, t = v - j;
    const h00 = node(i, j), h10 = node(i + 1, j), h01 = node(i, j + 1), h11 = node(i + 1, j + 1);
    const h = (1 - t) * ((1 - s) * h00 + s * h10) + t * ((1 - s) * h01 + s * h11);
    return u < 0 || v < 0 || u > nx - 1 || v > nz - 1 ? Math.max(h, edgeMin) : h;
  }
  let hMax = -Infinity;
  for (const h of g) if (h > hMax) hMax = h;

  // level a site: lattice nodes inside the ring (and within 12 m of it) vote for the median level; the band out to
  // `margin` blends back to the natural terrain with a smoothstep
  function pad(P, margin = 30) {
    const bb = bboxOf(P);
    const inside = (x, z) => {
      let odd = false;
      for (let a = 0, b = P.length - 1; a < P.length; b = a++) {
        const pa = P[a], pb = P[b];
        if ((pa[1] > z) !== (pb[1] > z) && x < pa[0] + (pb[0] - pa[0]) * (z - pa[1]) / (pb[1] - pa[1])) odd = !odd;
      }
      return odd;
    };
    const edgeDist = (x, z) => {
      let best = Infinity;
      let q = P[P.length - 1];
      for (const p of P) {
        // closest point of segment q-p: project, clamp to the ends
        const dx = p[0] - q[0], dz = p[1] - q[1], rx = x - q[0], rz = z - q[1];
        const f = dx || dz ? (rx * dx + rz * dz) / (dx * dx + dz * dz) : 0, c = f < 0 ? 0 : f > 1 ? 1 : f;
        const d = Math.hypot(rx - dx * c, rz - dz * c);
        if (d < best) best = d;
        q = p;
      }
      return best;
    };
    const ring = [], votes = [];
    const ia = Math.max(0, Math.floor((bb.x0 - margin - x0) / cell)), ib = Math.min(nx - 1, Math.ceil((bb.x1 + margin - x0) / cell));
    const ja = Math.max(0, Math.floor((bb.z0 - margin - z0) / cell)), jb = Math.min(nz - 1, Math.ceil((bb.z1 + margin - z0) / cell));
    for (let j = ja; j <= jb; j++) {
      for (let i = ia; i <= ib; i++) {
        const x = x0 + i * cell, z = z0 + j * cell, d = inside(x, z) ? 0 : edgeDist(x, z);
        if (d >= margin) continue;
        ring.push(j * nx + i, d);
        if (d < 12) votes.push(g[j * nx + i]);
      }
    }
    if (!votes.length) return null;
    const level = Float64Array.from(votes).sort()[votes.length >> 1];
    const ease = (d) => { const f = (d - 6) / (margin - 6); if (f <= 0) return 0; if (f >= 1) return 1; return f * f * (3 - 2 * f); };
    for (let k = 0; k < ring.length; k += 2) g[ring[k]] = level + (g[ring[k]] - level) * ease(ring[k + 1]);
    return level;
  }
  return { heightAt, hMax, cell, x0, z0, x1, z1, pad, data: { meta, grid: g } };
}

// every edge (longer than 5 cm) of every ring of a list of flat multi-rings: fn(ax, az, bx, bz, length); returns the count
function eachEdge(polys, fn) {
  let n = 0;
  for (const rings of polys) for (const F of rings) {
    let px = F[F.length - 2], pz = F[F.length - 1];
    for (let k = 0; k < F.length; k += 2) {
      const qx = F[k], qz = F[k + 1], len = Math.hypot(qx - px, qz - pz);
      if (len >= 0.05) { fn(px, pz, qx, qz, len); n++; }
      px = qx; pz = qz;
    }
  }
  return n;
}

// ------------------------------------------------------------------------------------------------ mesh store
// one 512 m tile: flat vertex streams; draped vertices are shared per (layer, surface, 5 cm snapped position)
// plain arrays -> indexed geometry: streams is { name: [array, itemSize] }, the index type follows the vertex count
function toGeometry(streams, index, count) {
  if (!index.length) return null;
  const geo = new THREE.BufferGeometry();
  for (const [name, [arr, size]] of Object.entries(streams)) geo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(arr), size));
  geo.setIndex(new THREE.BufferAttribute(count > 65535 ? new Uint32Array(index) : new Uint16Array(index), 1));
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}
class Tile {
  constructor() { this.v = []; this.nv = []; this.sv = []; this.idx = []; this.n = 0; this.shared = new Map(); }
  add(x, y, z, nx, ny, nz, s) {
    const v = this.v, k = v.length;
    v[k] = x; v[k + 1] = y; v[k + 2] = z;
    this.nv.push(nx, ny, nz); this.sv.push(s);
    return this.n++;
  }
  geometry() {
    const geo = toGeometry({ position: [this.v, 3], normal: [this.nv, 3], aSurf: [this.sv, 1] }, this.idx, this.n);
    this.v = this.nv = this.sv = this.idx = this.shared = null;
    return geo;
  }
}

// Sutherland-Hodgman against one axis-aligned line: keep the side where sign * (p[axis] - v) >= 0
function clipHalf(P, axis, v, sign) {
  const out = [], side = (p) => sign * (p[axis] - v);
  let prev = P[P.length - 1], sp = side(prev);
  for (const cur of P) {
    const sc = side(cur);
    // an edge crossing the line contributes the crossing point, then the current vertex if it is kept
    if (sp < 0 !== sc < 0) { const f = sp / (sp - sc); out.push([prev[0] + f * (cur[0] - prev[0]), prev[1] + f * (cur[1] - prev[1])]); }
    if (sc >= 0) out.push(cur);
    prev = cur; sp = sc;
  }
  return out;
}

// the CPU part (no materials, no scene): tile geometries, markings, rasters, bank segments, water distance
export function buildGroundData({ map, hf, parts = ['land', 'roads', 'cover'] }) {
  const t0 = performance.now();
  const R = map.region, H = hf.heightAt, TILE = 1024;
  const tiles = new Map();
  // 1 km tiles over the city, 8 km ones over the far fields (few draw calls toward the horizon)
  const tileAt = (x, z) => {
    const city = x > R.x0 - 1000 && x < R.x1 + 1000 && z > R.z0 - 1000 && z < R.z1 + 1000, S = city ? TILE : TILE * 8;
    const key = (city ? 0 : 1e8) + Math.floor(x / S) * 4096 + Math.floor(z / S);
    let t = tiles.get(key);
    if (!t) tiles.set(key, t = new Tile());
    return t;
  };
  const normalAt = (x, z) => {
    const e = 3, gx = (H(x - e, z) - H(x + e, z)) / (2 * e), gz = (H(x, z - e) - H(x, z + e)) / (2 * e), l = Math.hypot(gx, 1, gz);
    return [gx / l, 1 / l, gz / l];
  };
  let nTri = 0;

  // convex piece on one layer -> triangle fan (upward winding); vertices shared inside the tile
  const fan = (P, off, surf) => {
    let mx = 0, mz = 0;
    for (const p of P) { mx += p[0]; mz += p[1]; }
    const t = tileAt(mx / P.length, mz / P.length);
    let layer = t.shared.get(off * 64 + surf);
    if (!layer) t.shared.set(off * 64 + surf, layer = new Map());
    const ids = [];
    for (const p of P) {
      const qx = Math.round(p[0] * 20), qz = Math.round(p[1] * 20), key = qx * 4194304 + qz;
      let id = layer.get(key);
      if (id === undefined) {
        const x = qx / 20, z = qz / 20, nn = normalAt(x, z);
        id = t.add(x, H(x, z) + off, z, nn[0], nn[1], nn[2], surf);
        layer.set(key, id);
      }
      if (id !== ids[ids.length - 1]) ids.push(id);
    }
    while (ids.length > 1 && ids[0] === ids[ids.length - 1]) ids.pop();
    if (ids.length < 3) return;
    // with y up, a positive (area2 > 0) ring fanned in order would face down: fan it in reverse
    const rev = area2(P) > 0, o = ids[0];
    for (let k = 2; k < ids.length; k++) t.idx.push(o, ids[rev ? k : k - 1], ids[rev ? k - 1 : k]);
    nTri += ids.length - 2;
  };
  // a triangle cut along the height lattice (coarser far from the city; untouched beyond the DEM)
  const drapeTri = (A, B, C, off, surf) => {
    const lo = [Math.min(A[0], B[0], C[0]), Math.min(A[1], B[1], C[1])], hi = [Math.max(A[0], B[0], C[0]), Math.max(A[1], B[1], C[1])];
    if (hi[0] < hf.x0 || lo[0] > hf.x1 || hi[1] < hf.z0 || lo[1] > hf.z1) return fan([A, B, C], off, surf);
    const nearCity = hi[0] > R.x0 - 900 && lo[0] < R.x1 + 900 && hi[1] > R.z0 - 900 && lo[1] < R.z1 + 900;
    const c = nearCity ? hf.cell : hf.cell * 4;
    const i0 = Math.floor((lo[0] - hf.x0) / c), i1 = Math.floor((hi[0] - hf.x0) / c);
    const j0 = Math.floor((lo[1] - hf.z0) / c), j1 = Math.floor((hi[1] - hf.z0) / c);
    if (i0 === i1 && j0 === j1) return fan([A, B, C], off, surf);
    // cut into slabs along one axis: the piece for cell k lies between lines k and k + 1 (open at the ends)
    const slabs = (P, axis, k0, k1, org, each) => {
      let rest = P;
      for (let k = k0; k <= k1 && rest.length >= 3; k++) {
        const cut = org + (k + 1) * c;
        each(k < k1 ? clipHalf(rest, axis, cut, -1) : rest);
        if (k < k1) rest = clipHalf(rest, axis, cut, 1);
      }
    };
    slabs([A, B, C], 1, j0, j1, hf.z0, (row) => {
      if (row.length >= 3) slabs(row, 0, i0, i1, hf.x0, (P) => { if (P.length >= 3) fan(P, off, surf); });
    });
  };
  const polyOf = (rings) => triangulate(ringPts(rings[0]), rings.slice(1).map(ringPts));
  const drapePoly = (rings, off, surf, raster = null) => {
    const { pts, tris } = polyOf(rings);
    for (const [a, b, c] of tris) {
      if (off !== null) drapeTri(pts[a], pts[b], pts[c], off, surf);
      if (raster) raster.tri(pts[a][0], pts[a][1], pts[b][0], pts[b][1], pts[c][0], pts[c][1]);
    }
  };
  // vertical band along a->b from yLo(x, z) to yHi(x, z), split every ~6 m to follow the terrain; faces (nx, nz)
  const band = (ax, az, bx, bz, yLo, yHi, nx, nz, surf) => {
    const ex = bx - ax, ez = bz - az, L = Math.hypot(ex, ez), n = Math.max(1, Math.ceil(L / 6));
    const flip = ex * nz - ez * nx <= 0;
    let t = null, lo = 0;
    const post = (x, z) => { const i = t.add(x, yLo(x, z), z, nx, 0, nz, surf); t.add(x, yHi(x, z), z, nx, 0, nz, surf); return i; };
    let px = ax, pz = az;
    for (let k = 1; k <= n; k++) {
      const qx = ax + ex * (k / n), qz = az + ez * (k / n), tt = tileAt((px + qx) * 0.5, (pz + qz) * 0.5);
      if (tt !== t) { t = tt; lo = post(px, pz); }
      const nlo = post(qx, qz); // posts are (bottom, top) pairs, so top = bottom + 1
      const quad = flip ? [lo, nlo + 1, nlo, lo, lo + 1, nlo + 1] : [lo, nlo, nlo + 1, lo, nlo + 1, lo + 1];
      for (const q of quad) t.idx.push(q);
      lo = nlo; px = qx; pz = qz;
    }
  };

  // ---- classification rasters: asphalt 0.5 m (city + 150 m), water 2 m (city + 2 km), land 32 m (whole map)
  const want = new Set(parts);
  const LE = map.landExtent;
  const asph = want.has('roads') ? new BitRaster(R.x0 - 150, R.z0 - 150, R.x1 + 150, R.z1 + 150, 0.5) : null;
  const wat = want.has('land') ? new BitRaster(R.x0 - 2000, R.z0 - 2000, R.x1 + 2000, R.z1 + 2000, 2) : null;
  const land = want.has('land') ? new BitRaster(LE.x0, LE.z0, LE.x1, LE.z1, 32) : null;
  const isWater = (x, z) => { const w = wat.get(x, z); return w >= 0 ? w === 1 : land.get(x, z) === 0; };
  let nKerb = 0, markings = null, dist = null;
  const wetSegs = [];

  if (want.has('land')) {
    for (const rings of map.land) {
      let inCity = false;
      const F = rings[0];
      for (let k = 0; k < F.length && !inCity; k += 2) inCity = F[k] > R.x0 - 300 && F[k] < R.x1 + 300 && F[k + 1] > R.z0 - 300 && F[k + 1] < R.z1 + 300;
      drapePoly(rings, GY.LAND, inCity ? SURF.YARD : SURF.FARM, land);
    }
    for (const rings of map.water) drapePoly(rings, null, 0, wat);
    // embankments: land edges with open water outside drop to below the river plane
    const yTop = (x, z) => H(x, z) + GY.LAND, yFoot = () => GY.WATER - 2.5;
    const nearCity = (x, z, m) => x > R.x0 - m && x < R.x1 + m && z > R.z0 - m && z < R.z1 + m;
    eachEdge(map.land, (ax, az, bx, bz, L) => {
      // outward normal of a positive ring edge; probe 1 m and 3 m out for open water
      const nx = (bz - az) / L, nz = (ax - bx) / L, cx = 0.5 * (ax + bx), cz = 0.5 * (az + bz);
      if (Math.max(Math.abs(cx), Math.abs(cz)) > 40000) return;
      if (!(isWater(cx + nx, cz + nz) || isWater(cx + 3 * nx, cz + 3 * nz))) return;
      band(ax, az, bx, bz, yFoot, yTop, nx, nz, SURF.BANK);
      if (nearCity(cx, cz, 2000)) wetSegs.push({ ax, az, bx, bz, nx, nz });
    });
    dist = waterDistance(wat);
  }
  if (want.has('roads')) {
    for (const rings of map.asphalt) drapePoly(rings, GY.ROAD, SURF.ASPHALT, asph);
    // kerb faces along every asphalt ring edge, facing the carriageway
    const yRoad = (x, z) => H(x, z) + GY.ROAD, yWalk = (x, z) => H(x, z) + GY.WALK;
    nKerb += eachEdge(map.asphalt, (ax, az, bx, bz, L) => band(ax, az, bx, bz, yRoad, yWalk, (az - bz) / L, (bx - ax) / L, SURF.CURB));
    markings = buildMarkings({ map, onAsphalt: (x, z) => asph.get(x, z) === 1, H });
  }
  if (want.has('cover')) {
    COVER.forEach(([key, surf], order) => { for (const rings of map.cover[key] ?? []) drapePoly(rings, GY.COVER + order * 0.0006, surf); });
    for (const rings of map.dirt ?? []) drapePoly(rings, GY.COVER + 0.011, SURF.DIRT);
    for (const rings of map.walks) drapePoly(rings, GY.WALK, SURF.PAVERS);
  }

  const tileGeos = [];
  for (const [key, t] of tiles) { const geo = t.geometry(); if (geo) tileGeos.push({ key, geo }); }
  return { tileGeos, markings, asph, wat, land, wetSegs, dist,
    stats: { ms: Math.round(performance.now() - t0), meshes: tileGeos.length, tris: nTri, kerbs: nKerb, bankSegs: wetSegs.length } };
}

// distance to open water on a 20 m grid (two-pass chamfer): the river mirror is skipped deep inland
function waterDistance(wat) {
  const DC = 20, dnx = Math.ceil(wat.nx * wat.c / DC), dnz = Math.ceil(wat.nz * wat.c / DC);
  const N = dnx * dnz, d = new Float32Array(N), DIAG = DC * Math.SQRT2;
  for (let k = 0; k < N; k++) d[k] = wat.get(wat.x0 + (k % dnx + 0.5) * DC, wat.z0 + (((k / dnx) | 0) + 0.5) * DC) === 1 ? 0 : 1e9;
  // one chamfer sweep; dir = +1 walks forward and looks at the already swept neighbours behind, -1 the reverse
  const sweep = (dir) => {
    for (let n = 0; n < N; n++) {
      const k = dir > 0 ? n : N - 1 - n, i = k % dnx;
      const back = dir > 0 ? i > 0 : i < dnx - 1, fwd = dir > 0 ? i < dnx - 1 : i > 0, row = k - dir * dnx;
      let v = d[k];
      if (back && d[k - dir] + DC < v) v = d[k - dir] + DC;
      if (row >= 0 && row < N) {
        if (d[row] + DC < v) v = d[row] + DC;
        if (back && d[row - dir] + DIAG < v) v = d[row - dir] + DIAG;
        if (fwd && d[row + dir] + DIAG < v) v = d[row + dir] + DIAG;
      }
      d[k] = v;
    }
  };
  sweep(1); sweep(-1);
  return { DC, dnx, dnz, x0: wat.x0, z0: wat.z0, d };
}

// several partial results (one per worker) -> one: tiles with the same key merged, rasters / segments from their owner
function combine(list) {
  const byKey = new Map(), out = { tileGeos: [], markings: null, asph: null, wat: null, land: null, wetSegs: [], dist: null, stats: { tris: 0, kerbs: 0, bankSegs: 0, meshes: 0, ms: 0 } };
  for (const d of list) {
    for (const { key, geo } of d.tileGeos) (byKey.get(key) ?? byKey.set(key, []).get(key)).push(geo);
    for (const k of ['markings', 'asph', 'wat', 'land', 'dist']) out[k] ??= d[k];
    out.wetSegs.push(...d.wetSegs);
    for (const k of ['tris', 'kerbs', 'bankSegs']) out.stats[k] += d.stats[k];
    out.stats.ms = Math.max(out.stats.ms, d.stats.ms);
  }
  for (const [key, geos] of byKey) out.tileGeos.push({ key, geo: mergeGeometries(geos) });
  out.stats.meshes = out.tileGeos.length;
  return out;
}

// data (buildGroundData, or its unpacked worker copy) -> the ground object with meshes and queries
function assemble(data, { scene, T, hf, strip, renderer }) {
  const H = hf.heightAt, { asph, wat, land, dist: D } = data;
  const onAsphalt = (x, z) => asph.get(x, z) === 1;
  const isWater = (x, z) => { const w = wat.get(x, z); return w >= 0 ? w === 1 : land.get(x, z) === 0; };
  const mat = createGroundMaterial(T, strip);
  const root = Object.assign(new THREE.Group(), { name: 'ground' });
  const put = (geo, m, name) => {
    const mesh = new THREE.Mesh(geo, m);
    Object.assign(mesh, { name, receiveShadow: true, matrixAutoUpdate: false });
    root.add(mesh);
  };
  for (const tg of data.tileGeos) put(tg.geo, mat, `ground ${tg.key}`);
  if (data.markings) {
    const paint = new THREE.MeshStandardMaterial({ roughness: 0.7, name: 'road-markings' });
    paint.color.setRGB(0.78, 0.78, 0.74);
    put(data.markings, decalBias(paint, renderer, 1), 'markings');
  }
  scene.add(root);
  // cells outside the distance grid count as shore (0)
  const shoreDist = (x, z) => {
    const u = Math.floor((x - D.x0) / D.DC), w = Math.floor((z - D.z0) / D.DC);
    return u >= 0 && w >= 0 && u < D.dnx && w < D.dnz ? D.d[u + w * D.dnx] : 0;
  };
  const terrainHeight = (x, z) => (onAsphalt(x, z) ? H(x, z) + GY.ROAD : isWater(x, z) ? GY.WATER : H(x, z) + GY.LAND);
  return { root, material: mat, terrainHeight, heightAt: H, isWater, onAsphalt, shoreDist, wetSegs: data.wetSegs, stats: data.stats,
    band: { minY: GY.WATER - 3, maxY: hf.hMax + 1, slope: 1.2 }, update() {} };
}

export function buildGround({ scene, T, map, hf, strip = null, renderer = null }) {
  return assemble(combine([buildGroundData({ map, hf })]), { scene, T, hf, strip, renderer });
}

// The same in a module worker (it fetches map.json itself) while the main thread builds other things; falls back to
// the synchronous build when workers are unavailable or fail.
export async function buildGroundAsync({ scene, T, map, hf, strip = null, renderer = null, mapUrl }) {
  let data = null;
  if (typeof Worker !== 'undefined' && mapUrl) {
    try {
      const run = (parts) => new Promise((res, rej) => {
        const w = new Worker(new URL('./ground.js', import.meta.url), { type: 'module' });
        w.onmessage = (e) => { w.terminate(); if (e.data.error) rej(new Error(e.data.error)); else res(e.data); };
        w.onerror = (e) => { w.terminate(); rej(e.error || new Error(e.message || 'ground worker error')); };
        w.postMessage({ mapUrl, hf: hf.data, parts });
      });
      const parts = await Promise.all([['land'], ['roads'], ['cover']].map(run));
      for (const d of parts) {
        for (const t of d.tileGeos) t.geo = unpackGeometry(t.geo);
        d.markings = unpackGeometry(d.markings);
        for (const k of ['asph', 'wat', 'land']) if (d[k]) d[k] = BitRaster.from(d[k]);
      }
      data = combine(parts);
      data.stats.workers = parts.map((d) => d.stats);
    } catch (e) { console.warn('[ground] workers failed, building on the main thread', e); data = null; }
  }
  return assemble(data ?? combine([buildGroundData({ map, hf })]), { scene, T, hf, strip, renderer });
}
if (inWorker()) {
  self.onmessage = async (e) => {
    try {
      const tf = performance.now(), map = await fetch(e.data.mapUrl).then((r) => r.json());
      const tb = performance.now();
      const d = buildGroundData({ map, hf: heightFieldFrom(e.data.hf), parts: e.data.parts });
      const transfer = [];
      const out = { ...d, tileGeos: d.tileGeos.map(({ key, geo }) => ({ key, geo: packGeometry(geo, transfer) })), markings: packGeometry(d.markings, transfer) };
      for (const k of ['asph', 'wat', 'land']) if (d[k]) { out[k] = { ...d[k] }; transfer.push(d[k].bits.buffer); }
      if (d.dist) transfer.push(d.dist.d.buffer);
      d.stats.fetchMs = Math.round(tb - tf); d.stats.startMs = Math.round(tf);
      self.postMessage(out, [...new Set(transfer)]);
    } catch (err) { self.postMessage({ error: String(err?.stack || err) }); }
  };
}

// ------------------------------------------------------------------------------------------------ markings
// Ukrainian road paint: a white centre line (solid on multi-lane main roads, dashed elsewhere), dashed lane lines,
// zebra crossings where OSM maps a crossing footway; lines stop short of the junctions.
function buildMarkings({ map, onAsphalt, H }) {
  const P = [], I = [];
  const Y = 0.006;
  // quad from its four corners (any order around), wound to face up
  const quad = (...cs) => {
    const base = P.length / 3;
    cs.forEach((c) => P.push(...c));
    // the x/z turn at corner 1 picks the index order that keeps the face pointing up
    const turn = (cs[1][0] - cs[0][0]) * (cs[2][2] - cs[0][2]) - (cs[1][2] - cs[0][2]) * (cs[2][0] - cs[0][0]);
    for (const k of turn < 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) I.push(base + k);
  };
  const strip = (ax, az, bx, bz, hw) => {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    if (len < 0.05) return;
    const ox = -dz * hw / len, oz = dx * hw / len;
    const at = (x, z) => [x, H(x, z) + Y, z];
    quad(at(ax + ox, az + oz), at(bx + ox, bz + oz), at(bx - ox, bz - oz), at(ax - ox, az - oz));
  };
  // junction buckets (32 m)
  const JB = new Map(), jk = (i, j) => i * 65536 + j;
  for (const J of map.junctions ?? []) {
    const k = jk(Math.floor(J[0] / 32), Math.floor(J[1] / 32));
    if (JB.has(k)) JB.get(k).push(J); else JB.set(k, [J]);
  }
  const atJunction = (x, z, pad) => {
    const ci = Math.floor(x / 32), cj = Math.floor(z / 32);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      for (const [jx, jz, hw] of JB.get(jk(ci + a, cj + b)) ?? []) if ((jx - x) ** 2 + (jz - z) ** 2 < (hw + pad) ** 2) return true;
    }
    return false;
  };
  const MAIN = /^(trunk|primary|secondary|tertiary|motorway)$/;
  for (const r of map.roads) {
    if (r.k !== 'm' || r.w < 5.9 || /service|living_street|_link/.test(r.c)) continue;
    const lanes = r.ln || (r.w >= 12 ? 4 : 2), lw = r.w / lanes, wide = MAIN.test(r.c) && lanes >= 4;
    const lines = []; // [lateral offset, dash length (0 = solid), gap]
    if (r.ow) for (let k = 1; k < lanes; k++) lines.push([k * lw - r.w / 2, 3, 6]);
    else {
      lines.push([0, wide ? 0 : 3, wide ? 0 : 3]);
      for (let k = 1; k < lanes / 2; k++) lines.push([k * lw, 3, 6], [-k * lw, 3, 6]);
    }
    let run = 0;
    eachLeg(r.p, 0.1, (ax, az, ux, uz, L) => {
      // 1 m samples; consecutive painted samples of a line merge into one quad of up to 8 m (it still drapes)
      const open = lines.map(() => -1);
      const flush = (k, s0, s1) => {
        const off = lines[k][0], hw = off === 0 && !lines[k][1] ? 0.075 : 0.06;
        strip(ax + ux * s0 - uz * off, az + uz * s0 + ux * off, ax + ux * s1 - uz * off, az + uz * s1 + ux * off, hw);
      };
      for (let s = 0; s < L; s += 1) {
        const e = Math.min(L, s + 1), mid = (s + e) / 2, blocked = atJunction(ax + ux * mid, az + uz * mid, 2.5);
        lines.forEach(([off, dash, gap], k) => {
          let paint = !blocked && !(dash && (run + s) % (dash + gap) > dash);
          if (paint) paint = onAsphalt(ax + ux * s - uz * off, az + uz * s + ux * off) && onAsphalt(ax + ux * e - uz * off, az + uz * e + ux * off);
          if (open[k] >= 0 && (!paint || s - open[k] >= 8)) { flush(k, open[k], s); open[k] = -1; }
          if (paint && open[k] < 0) open[k] = s;
        });
      }
      open.forEach((s0, k) => { if (s0 >= 0) flush(k, s0, L); });
      run += L;
    });
  }
  // zebra bars: 0.5 m along the footway, 3 m across it, one per metre
  for (const r of map.roads) {
    if (r.k !== 'x') continue;
    eachLeg(r.p, 0.5, (ax, az, ux, uz, L) => {
      const sx = -uz, sz = ux;
      for (let s = 0.3; s < L; s += 1) {
        const x = ax + ux * s, z = az + uz * s;
        if (!onAsphalt(x, z) || !onAsphalt(x + sx * 1.4, z + sz * 1.4) || !onAsphalt(x - sx * 1.4, z - sz * 1.4)) continue;
        const y = H(x, z) + Y, hx = ux * 0.25, hz = uz * 0.25;
        quad([x - hx + sx * 1.5, y, z - hz + sz * 1.5], [x + hx + sx * 1.5, y, z + hz + sz * 1.5], [x + hx - sx * 1.5, y, z + hz - sz * 1.5], [x - hx - sx * 1.5, y, z - hz - sz * 1.5]);
      }
    });
  }
  const nv = P.length / 3, up = new Array(P.length);
  for (let k = 0; k < up.length; k++) up[k] = k % 3 === 1 ? 1 : 0;
  return toGeometry({ position: [P, 3], normal: [up, 3] }, I, nv);
}

// consecutive legs of a flat polyline longer than minLen: fn(ax, az, unit dx, unit dz, length)
function eachLeg(p, minLen, fn) {
  for (let k = 3; k < p.length; k += 2) {
    const dx = p[k - 1] - p[k - 3], dz = p[k] - p[k - 2], len = Math.hypot(dx, dz);
    if (len >= minLen) fn(p[k - 3], p[k - 2], dx / len, dz / len, len);
  }
}
