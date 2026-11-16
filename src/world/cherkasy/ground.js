// Ground of the OSM Cherkasy map: yards and far fields, lawns / parks / sand / forest floor / pitches (map.cover), paved
// sidewalks and squares (map.walks), asphalt carriageways one kerb below the paving with granite kerb faces along every
// carriageway edge, embankment walls where land meets open water, lane markings and zebra crossings. Every surface
// is draped on one terrain (the DEM box-filtered to 16 m cells, bilinear per cell) and drawn by one shader keyed by a
// per-vertex surface id, in world-space texture coordinates.
// Level of detail (the "units" section below): the city is 1 km units, each four 512 m tiles of full geometry and,
// beyond ground.setDetail's `far` distance, one far sheet (groundfar.js: a few thousand triangles and a map of surface
// ids instead of 20-170 thousand; the units on the fringe, draped in 64 m cells, keep their tiles). Kerb faces and
// road paint are 512 m chunks with their own draw distances (drawdist.js). Only what is drawn changes: heightAt,
// terrainHeight, onAsphalt and isWater read the height field and the rasters, never a mesh.
//
//   createHeightField(map, dem: Int16Array) -> hf { heightAt(x, z), hMax, cell, x0, z0, x1, z1, pad(P, margin = 30, level?), data }
//     (a site may overlay hf.heightAt and keep the lattice as hf.latticeAt: the ground meshes are built from that)
//   heightFieldFrom(hf.data) -> the same field over the same grid (workers)
//     pad(ring [[x,z]...], margin = 30, level?) levels the terrain under a hand-built site (call before buildGround) to
//       `level`, or by default to the median of the lattice nodes in and near the ring; returns the level
//   buildGround({ scene, T, map, hf, strip?, renderer?, far = false }) -> ground
//     scene: parent Object3D; T: kit/textures.js bundle; strip: { A:[x,z], B:[x,z], y0, y1 } the sandy low shore strip
//       (shore.js shoreStrip + STRIP) or null; renderer: for the decal bias of the markings; far: also build the far
//       sheets, here and now (tests; the game gets them from buildGroundAsync's fourth worker)
//     ground = { root, heightAt, terrainHeight(x, z) (what the rendered surface is: asphalt / land / river plane),
//       isWater(x, z), onAsphalt(x, z), shoreDist(x, z) (m to open water, 20 m grid), wetSegs [{ax,az,bx,bz,nx,nz}]
//       (embankment edges facing the water, n toward it), band { minY, maxY, slope }, stats,
//       update(dt, camera)   picks full tile or far sheet per unit and the chunks in reach, for that camera (it only
//         works after the camera moved ~10 m, a setDetail, or while units are still switching: two new sheets and
//         one unit back to full tiles a frame),
//       setDetail({ far, kerbs, paint, ...classes })   distances in m, a missing one = always drawn / never far,
//       drawDist   the drawdist.js registry: other modules add their own chunked detail to it (station_rails.js the
//         sleepers and rails, city.js the shore's wet bands and foam) and name its class in setDetail,
//       units: Map(key -> { i, j, x0, z0, near: [Mesh], tris, far, isFar }), farUnits(), attachFar(farData), lod(),
//       meshes() -> every ground mesh, drawn or not }
//     Every mesh is a direct child of ground.root: `ground <key>` (tiles), `kerbs <key>`, `ground bank` and the paint
//     chunks, all called `markings`; the far sheets hang under the child group `ground far`. A mesh a site adds to the
//     root in the ground material is cut by unit on the next update and follows its unit's tiles. From the first
//     update on, a mesh that is not drawn (a far unit's tiles, a chunk out of reach) is also out of root.children
//     (and back in when it is drawn; meshes() lists them all), so a site that edits the ground's meshes does it while
//     it builds, before the first frame.
//   createGroundMaterial(T, strip?, far?) -> MeshStandardMaterial;  GY (layer heights), SURF (surface ids)
//   buildGroundAsync({ ...buildGround args, mapUrl }) -> Promise<ground>: three module workers (parts 'land' / 'roads' /
//     'cover', each fetching map.json) build in parallel; falls back to buildGround on any worker failure. A fourth
//     worker (part 'far') then builds the far sheets and is not waited for: until it replies every unit is drawn in full
//   buildGroundData({ map, hf, parts }) -> the CPU-only part (tile geometries, markings [{ key, geo }], rasters, bank
//     segments, water distance) for the given parts; the worker entry point of this same file calls it
//   unitGrid(map, hf) -> { ox, oz, i0, i1, j0, j1, at(x, z) -> unit key | -1, fine(key) -> on the finely draped
//     ground? };  farLayers(map) -> the draped layers in paint order for groundfar.js
import * as THREE from 'three';
import { WATER_Y } from '../water.js';
import { patchMaterial } from '../materials.js';
import { decalBias } from '../../render/renderer.js';
import { mergeGeometries } from '../../kit/batch.js';
import { ringPts, triangulate, area2, bboxOf, BitRaster, packGeometry, unpackGeometry, inWorker } from './geo.js';
import { createDrawDistance } from '../drawdist.js';
import { FAR, farLattice, buildFarData, decodeIds } from './groundfar.js';

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
varying vec3 vGW;
float gRough;
// A far sheet (groundfar.js) takes its surface id per fragment from the unit's id map, so neighbouring fragments run
// different surface branches: their texture lookups get explicit gradients (implicit ones are undefined there). The
// full tiles keep the plain lookups: the id is constant over a triangle.
// Every far sheet draws with one material (no uniform upload between two sheets): the id maps are the layers of two
// array textures (1 m maps in gIds, 2 m ones in gIds2), and a sheet's vertices carry its unit's code in aSurf:
// (layer, + 512 for gIds2) * 4096 + i * 64 + j, with (i, j) the unit's place in the grid.
varying float vSurf;
#ifdef GROUND_FAR
uniform lowp sampler2DArray gIds, gIds2; uniform vec3 gFar; // the unit grid's corner (x, z) and 1 / the unit's size
vec2 gDx, gDy;
#define TX(t, uv, k) textureGrad(t, uv, gDx * (k), gDy * (k))
#define TXR(t, uv, k) textureGrad(t, uv, vec2(gDx.y, -gDx.x) * (k), vec2(gDy.y, -gDy.x) * (k))
#define GFW(p) (abs(gDx) + abs(gDy))
#else
#define TX(t, uv, k) texture(t, uv)
#define TXR(t, uv, k) texture(t, uv)
#define GFW(p) fwidth(p)
#endif
float gh(vec2 p) { return fract(sin(dot(p, vec2(41.37, 289.13))) * 24634.63); }
vec3 lin3(float r, float g, float b) { return pow(vec3(r, g, b), vec3(2.2)); }
vec3 sandTone(float a, float b) { return lin3(0.85, 0.79, 0.625) * (0.85 + 0.2 * a) * (0.92 + 0.16 * b); }
vec3 surfAsphalt(vec2 p, vec4 m, vec4 n, bool lot) {
  vec3 c = mix(TX(gAsphalt, p / 6.0, 1.0 / 6.0).rgb, TXR(gAsphalt, vec2(p.y, -p.x) / 7.3 + 0.37, 1.0 / 7.3).rgb, 0.35) * 0.95;
  c *= (0.8 + 0.4 * m.r) * (0.9 + 0.2 * n.g);
  gRough = 0.88; return lot ? c * 1.12 : c;
}
vec3 surfPavers(vec2 p, vec4 m, vec4 n) {
  // the centre has concrete pavers (grey with terracotta patches), the outskirts patched asphalt
  float centre = 1.0 - smoothstep(1100.0, 1700.0, length(p - vec2(-150.0, 700.0)));
  vec3 asph = TX(gAsphalt, p / 5.0, 0.2).rgb * 1.1 * (0.85 + 0.3 * m.r);
  vec2 q = p / vec2(0.2, 0.1); q.x += 0.5 * mod(floor(q.y), 2.0);
  vec2 f = fract(q);
  float joint = smoothstep(0.0, 0.08, f.x) * smoothstep(1.0, 0.92, f.x) * smoothstep(0.0, 0.14, f.y) * smoothstep(1.0, 0.86, f.y);
  vec3 red = lin3(0.60, 0.38, 0.33), grey = lin3(0.60, 0.59, 0.56);
  vec3 pav = mix(grey, red, step(0.62, gh(floor(p / 6.0)))) * (0.9 + 0.2 * gh(floor(q)));
  pav *= TX(gPaving, p / 4.0, 0.25).rgb * 1.5;
  vec2 fw = GFW(p); float far = clamp(max(fw.x, fw.y) * 10.0, 0.0, 1.0);
  pav *= mix(0.78 + 0.22 * joint, 0.9, far);
  pav = mix(pav, mix(grey, red, 0.35) * 0.9, far); // distant: the mean tone, no moire
  gRough = 0.82; return mix(asph, pav, centre) * (0.88 + 0.2 * n.r);
}
vec3 surfLawn(vec2 p, vec4 n, int s) {
  vec3 c = mix(TX(gGrass, p / 4.0, 0.25).rgb, TX(gGrass, p / 17.0 + 0.3, 1.0 / 17.0).rgb, 0.4);
  c *= (0.78 + 0.35 * n.r) * (0.85 + 0.25 * n.g) * vec3(0.9, 1.0, 0.82);
  c = mix(c, c * vec3(1.15, 1.05, 0.7), smoothstep(0.55, 0.8, n.g) * 0.6);
  if (s == 11) { vec2 cl = floor(p * 3.0); vec3 fl = mix(lin3(0.85, 0.2, 0.25), lin3(0.95, 0.8, 0.2), gh(cl + 7.0)); c = mix(c, fl, step(0.62, gh(cl)) * 0.8); }
  if (s == 16) c *= vec3(0.75, 0.82, 0.7);
  gRough = 0.95; return c;
}
vec3 surfYard(vec2 p, vec4 m, vec4 n, bool plots) {
  vec3 g = TX(gGrass, p / 5.0, 0.2).rgb * (0.72 + 0.3 * n.r) * vec3(0.85, 0.95, 0.78);
  g = mix(g, TX(gGrass, p / 23.0 + 0.5, 1.0 / 23.0).rgb * vec3(0.95, 0.9, 0.7) * 0.8, smoothstep(0.4, 0.7, n.g));
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
  vec2 p = vGW.xz;
#ifdef GROUND_FAR
  gDx = dFdx(p); gDy = dFdy(p);
  int code = int(vSurf + 0.5), layer = code >> 12;
  vec2 uv = clamp((p - gFar.xy) * gFar.z - vec2(float((code >> 6) & 63), float(code & 63)), 0.0, 1.0);
  float id = layer < 512 ? textureLod(gIds, vec3(uv, float(layer)), 0.0).r : textureLod(gIds2, vec3(uv, float(layer - 512)), 0.0).r;
  int s = int(id * 255.0 + 0.5) - 1; // the map holds id + 1
  if (s < 0) s = 3;
#else
  int s = int(vSurf + 0.5);
#endif
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
    if (k > 0.01) { gRough = 0.97; return mix(TX(gGrass, p / 5.0, 0.2).rgb * vec3(0.9, 0.95, 0.7) * (0.75 + 0.3 * n.r), sandTone(n.b, n.r), k); }
  }
  if (s == 3 || s == 14) return surfYard(p, m, n, s == 14);
  if (s == 4) { gRough = 0.98; return sandTone(n.b, n.r); }
  if (s == 5) { // pine forest floor: needles on pale sand
    vec3 c = mix(lin3(0.54, 0.42, 0.28), lin3(0.78, 0.72, 0.56), smoothstep(0.35, 0.75, n.b * 0.6 + n.r * 0.4));
    c = mix(c, TX(gGrass, p / 6.0, 1.0 / 6.0).rgb * 0.8, smoothstep(0.6, 0.85, n.g) * 0.6);
    gRough = 0.97; return c * (0.85 + 0.2 * n.r);
  }
  if (s == 6) { gRough = 0.9; return TX(gPaving, p / 8.0, 0.125).rgb * vec3(0.9, 0.9, 0.88) * (0.8 + 0.3 * n.r); }
#ifndef GROUND_FAR
  if (s == 7) { gRough = 0.8; return texture(gKerb, vec2(p.x + p.y, vGW.y) * vec2(0.4, 2.0)).rgb * 0.95; }
#endif
  if (s == 8) { gRough = 0.9; return lin3(0.24, 0.47, 0.22) * (0.9 + 0.12 * step(0.5, fract(p.x / 5.0))); }
  if (s == 9) { gRough = 0.97; return lin3(0.50, 0.44, 0.35) * (0.8 + 0.3 * n.b) * (0.9 + 0.15 * n.r); }
  if (s == 10) { gRough = 0.85; return lin3(0.55, 0.54, 0.51) * (0.75 + 0.35 * n.b) * mix(0.55, 1.0, smoothstep(${(WATER_Y - 0.4).toFixed(2)}, ${(WATER_Y + 1.2).toFixed(2)}, vGW.y)); }
  if (s == 12) { gRough = 0.9; return lin3(0.62, 0.28, 0.22) * (0.9 + 0.1 * n.b); }
  if (s == 17) { gRough = 0.9; return mix(lin3(0.78, 0.7, 0.52), lin3(0.35, 0.45, 0.62), step(0.7, n.g)) * (0.9 + 0.15 * n.b); }
  if (s == 18) { gRough = 0.9; return TX(gGrass, p / 5.0, 0.2).rgb * vec3(0.7, 0.8, 0.65) * (0.8 + 0.3 * n.r); }
  return surfFields(p, n);
}
`;

// far: null for the full tiles; for the far sheets { ids, ids2: { value: DataArrayTexture } (the uniforms themselves:
// assemble swaps the textures in when the far data arrives), x, z (the unit grid's corner), size (a unit's) }
export function createGroundMaterial(T, strip = null, far = null) {
  const mat = new THREE.MeshStandardMaterial();
  mat.name = far ? 'cherkasy-ground-far' : 'cherkasy-ground'; mat.roughness = 0.9; mat.metalness = 0;
  const U = {
    gAsphalt: { value: T.asphalt }, gNoise: { value: T.noise }, gPaving: { value: T.pavement }, gGrass: { value: T.grass },
    gKerb: { value: T.concrete ?? T.pavement },
    gStripA: { value: new THREE.Vector2(...(strip?.A ?? [0, 0])) }, gStripB: { value: new THREE.Vector2(...(strip?.B ?? [0, 0])) },
    gStrip: { value: new THREE.Vector3(strip ? 1 : 0, strip?.y0 ?? 4.5, strip?.y1 ?? 7) },
  };
  if (far) {
    mat.defines = { ...mat.defines, GROUND_FAR: '' };
    U.gIds = far.ids; U.gIds2 = far.ids2; U.gFar = { value: new THREE.Vector3(far.x, far.z, 1 / far.size) };
  }
  return patchMaterial(mat, far ? 'cherkasy-ground-far-v2' : 'cherkasy-ground-v2', (sh) => {
    for (const name in U) sh.uniforms[name] = U[name];
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;\nattribute float aSurf;\nvarying float vSurf;')
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
  // `margin` blends back to the natural terrain with a smoothstep; a given `fixed` level skips the vote (a site whose
  // DEM is skewed by its own roof levels to its forecourt's height)
  function pad(P, margin = 30, fixed = null) {
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
    const level = fixed ?? Float64Array.from(votes).sort()[votes.length >> 1];
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

// ------------------------------------------------------------------------------------------------ units
// The city is cut into UNIT squares in the height field's own frame (their borders are lattice lines, so a draped piece
// lies in exactly one): the units whose square touches the region + 1 km and lies inside the DEM. A unit is drawn in
// full as four SUB tiles (the frustum culls the ones behind the camera), and beyond the `far` distance as one far
// sheet (groundfar.js). Kerb faces and road paint are their own meshes per SUB square, with their own draw distances
// (finer chunks cull better but every mesh is a draw call and a node the renderer walks: at 256 m the frame's CPU
// cost grew more than the saved triangles were worth); the units' bank walls are one mesh, always drawn. Land outside
// the units goes into 8 km field tiles.
const UNIT = FAR.UNIT, SUB = UNIT / 2, FIELD = UNIT * 8;
// a unit under FAR_MIN triangles stays as it is (its sheet would not be cheaper); under FAR_FINE its id map is 2 m
const FAR_MIN = 3000, FAR_FINE = 12000;
// Within FINE m of the region a triangle is draped on the 16 m lattice, farther out on every fourth line of it. A far
// sheet stands on the 16 m lattice, so only a unit wholly inside that margin gets one: on the fringe a sheet would
// lie metres off the coarsely draped tiles it replaces (those units are light anyway: 5-25 thousand triangles).
const FINE = 900;
const KEY = { FIELD: 1e8, KERB: 2e8, BANK: 3e8 }; // tile keys: SUB tiles below FIELD, then one range per kind
export function unitGrid(map, hf) {
  const R = map.region, ox = hf.x0, oz = hf.z0;
  const i0 = Math.max(0, Math.floor((R.x0 - 1000 - ox) / UNIT)), i1 = Math.min(Math.floor((hf.x1 - ox) / UNIT) - 1, Math.floor((R.x1 + 1000 - ox) / UNIT));
  const j0 = Math.max(0, Math.floor((R.z0 - 1000 - oz) / UNIT)), j1 = Math.min(Math.floor((hf.z1 - oz) / UNIT) - 1, Math.floor((R.z1 + 1000 - oz) / UNIT));
  // the unit's key at a point, -1 outside the units
  const at = (x, z) => { const i = Math.floor((x - ox) / UNIT), j = Math.floor((z - oz) / UNIT); return i >= i0 && i <= i1 && j >= j0 && j <= j1 ? i * 4096 + j : -1; };
  // is unit `key` wholly on the finely draped ground (FINE below)? Only such a unit gets a far sheet
  const fine = (key) => {
    const x0 = ox + Math.floor(key / 4096) * UNIT, z0 = oz + (key % 4096) * UNIT;
    return x0 >= R.x0 - FINE && x0 + UNIT <= R.x1 + FINE && z0 >= R.z0 - FINE && z0 + UNIT <= R.z1 + FINE;
  };
  return { ox, oz, i0, i1, j0, j1, at, fine };
}
// land inside the city is yard, outside it farmland
const cityLand = (map) => {
  const R = map.region;
  return (rings) => {
    const F = rings[0];
    for (let k = 0; k < F.length; k += 2) if (F[k] > R.x0 - 300 && F[k] < R.x1 + 300 && F[k + 1] > R.z0 - 300 && F[k + 1] < R.z1 + 300) return SURF.YARD;
    return SURF.FARM;
  };
};
// every draped layer bottom to top with its surface, as the far id maps paint them (the higher layer wins, as it does
// in the full tiles, where it lies above)
export function farLayers(map) {
  return [[map.asphalt, SURF.ASPHALT], [map.land, cityLand(map)], ...COVER.map(([key, surf]) => [map.cover[key], surf]),
    [map.dirt, SURF.DIRT], [map.walks, SURF.PAVERS]];
}

// ------------------------------------------------------------------------------------------------ mesh store
// one tile: flat vertex streams; draped vertices are shared per (layer, surface, 5 cm snapped position)
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
  // the lattice alone (hf.latticeAt when a site overlays heightAt, railcut.js): the same field the workers build from
  const R = map.region, H = hf.latticeAt ?? hf.heightAt, G = unitGrid(map, hf);
  const tiles = new Map();
  // the tile of a point: its SUB tile (kind 0; a unit on the fringe, which never turns far, is one tile under its
  // first SUB key: light, and one draw call instead of four), the units' bank walls (KEY.BANK) or its kerb chunk
  // (KEY.KERB); outside the units an 8 km field tile holds everything (few draw calls toward the horizon)
  const tileAt = (x, z, kind = 0) => {
    const u = G.at(x, z), S = kind === 0 && u >= 0 && !G.fine(u) ? UNIT : SUB, f = S / SUB;
    const key = u < 0 ? KEY.FIELD + Math.floor((x - G.ox) / FIELD) * 4096 + Math.floor((z - G.oz) / FIELD)
      : kind === KEY.BANK ? kind : kind + Math.floor((x - G.ox) / S) * f * 4096 + Math.floor((z - G.oz) / S) * f;
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
    const nearCity = hi[0] > R.x0 - FINE && lo[0] < R.x1 + FINE && hi[1] > R.z0 - FINE && lo[1] < R.z1 + FINE;
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
  // vertical band along a->b from yLo(x, z) to yHi(x, z), split every ~6 m to follow the terrain (every 24 m outside
  // the units, where the land is draped in 64 m cells); faces (nx, nz); kind: the tile it goes to (tileAt)
  const band = (ax, az, bx, bz, yLo, yHi, nx, nz, surf, kind) => {
    const ex = bx - ax, ez = bz - az, L = Math.hypot(ex, ez), n = Math.max(1, Math.ceil(L / (G.at((ax + bx) / 2, (az + bz) / 2) < 0 ? 24 : 6)));
    const flip = ex * nz - ez * nx <= 0;
    let t = null, lo = 0;
    const post = (x, z) => { const i = t.add(x, yLo(x, z), z, nx, 0, nz, surf); t.add(x, yHi(x, z), z, nx, 0, nz, surf); return i; };
    let px = ax, pz = az;
    for (let k = 1; k <= n; k++) {
      const qx = ax + ex * (k / n), qz = az + ez * (k / n), tt = tileAt((px + qx) * 0.5, (pz + qz) * 0.5, kind);
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
  let nKerb = 0, markings = [], dist = null;
  const wetSegs = [];

  if (want.has('land')) {
    const landSurf = cityLand(map);
    for (const rings of map.land) drapePoly(rings, GY.LAND, landSurf(rings), land);
    for (const rings of map.water) drapePoly(rings, null, 0, wat);
    // embankments: land edges with open water outside drop to below the river plane
    const yTop = (x, z) => H(x, z) + GY.LAND, yFoot = () => GY.WATER - 2.5;
    const nearCity = (x, z, m) => x > R.x0 - m && x < R.x1 + m && z > R.z0 - m && z < R.z1 + m;
    eachEdge(map.land, (ax, az, bx, bz, L) => {
      // outward normal of a positive ring edge; probe 1 m and 3 m out for open water
      const nx = (bz - az) / L, nz = (ax - bx) / L, cx = 0.5 * (ax + bx), cz = 0.5 * (az + bz);
      if (Math.max(Math.abs(cx), Math.abs(cz)) > 40000) return;
      if (!(isWater(cx + nx, cz + nz) || isWater(cx + 3 * nx, cz + 3 * nz))) return;
      band(ax, az, bx, bz, yFoot, yTop, nx, nz, SURF.BANK, KEY.BANK);
      if (nearCity(cx, cz, 2000)) wetSegs.push({ ax, az, bx, bz, nx, nz });
    });
    dist = waterDistance(wat);
  }
  if (want.has('roads')) {
    for (const rings of map.asphalt) drapePoly(rings, GY.ROAD, SURF.ASPHALT, asph);
    // kerb faces along every asphalt ring edge, facing the carriageway
    const yRoad = (x, z) => H(x, z) + GY.ROAD, yWalk = (x, z) => H(x, z) + GY.WALK;
    nKerb += eachEdge(map.asphalt, (ax, az, bx, bz, L) => band(ax, az, bx, bz, yRoad, yWalk, (az - bz) / L, (bx - ax) / L, SURF.CURB, KEY.KERB));
    markings = buildMarkings({ map, onAsphalt: (x, z) => asph.get(x, z) === 1, H, chunkAt: (x, z) => Math.floor((x - G.ox) / SUB) * 4096 + Math.floor((z - G.oz) / SUB) });
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
  const byKey = new Map(), out = { tileGeos: [], markings: [], asph: null, wat: null, land: null, wetSegs: [], dist: null, stats: { tris: 0, kerbs: 0, bankSegs: 0, meshes: 0, ms: 0 } };
  for (const d of list) {
    for (const { key, geo } of d.tileGeos) (byKey.get(key) ?? byKey.set(key, []).get(key)).push(geo);
    for (const k of ['asph', 'wat', 'land', 'dist']) out[k] ??= d[k];
    if (d.markings?.length) out.markings = d.markings;
    out.wetSegs.push(...d.wetSegs);
    for (const k of ['tris', 'kerbs', 'bankSegs']) out.stats[k] += d.stats[k];
    out.stats.ms = Math.max(out.stats.ms, d.stats.ms);
  }
  for (const [key, geos] of byKey) out.tileGeos.push({ key, geo: mergeGeometries(geos) });
  out.stats.meshes = out.tileGeos.length;
  return out;
}

// the triangles of an indexed geometry by the unit of their centroid: Map(unit key | -1 -> geometry)
function splitByUnit(geo, unitAt) {
  const P = geo.attributes.position.array, I = geo.index.array, by = new Map();
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k], b = I[k + 1], c = I[k + 2];
    if (a === b || b === c || a === c) continue;
    const key = unitAt((P[3 * a] + P[3 * b] + P[3 * c]) / 3, (P[3 * a + 2] + P[3 * b + 2] + P[3 * c + 2]) / 3);
    (by.get(key) ?? by.set(key, []).get(key)).push(a, b, c);
  }
  const out = new Map();
  for (const [key, idx] of by) {
    const remap = new Map(), order = [];
    const index = idx.map((v) => { let r = remap.get(v); if (r === undefined) { remap.set(v, r = order.length); order.push(v); } return r; });
    const g = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(geo.attributes)) {
      const n = attr.itemSize, src = attr.array, dst = new src.constructor(order.length * n);
      for (let q = 0; q < order.length; q++) for (let c = 0; c < n; c++) dst[q * n + c] = src[order[q] * n + c];
      g.setAttribute(name, new THREE.BufferAttribute(dst, n, attr.normalized));
    }
    g.setIndex(new THREE.BufferAttribute(order.length > 65535 ? new Uint32Array(index) : new Uint16Array(index), 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    out.set(key, g);
  }
  return out;
}

// data (buildGroundData, or its unpacked worker copy) -> the ground object with meshes, queries and the level of detail
function assemble(data, { scene, T, map, hf, strip, renderer }) {
  const H = hf.heightAt, { asph, wat, land, dist: D } = data;
  const onAsphalt = (x, z) => asph.get(x, z) === 1;
  const isWater = (x, z) => { const w = wat.get(x, z); return w >= 0 ? w === 1 : land.get(x, z) === 0; };
  const mat = createGroundMaterial(T, strip);
  const root = Object.assign(new THREE.Group(), { name: 'ground' });
  const dd = createDrawDistance(), G = unitGrid(map, hf), units = new Map();
  // static and at the origin: no matrix work in the scene's per-frame update
  const still = { receiveShadow: true, matrixAutoUpdate: false, matrixWorldAutoUpdate: false };
  const put = (geo, m, name) => {
    const mesh = Object.assign(new THREE.Mesh(geo, m), still, { name });
    root.add(mesh);
    return mesh;
  };
  // every mesh is a direct child of the root in the ground material: the sites that re-lay or resurface the ground
  // (railcut.js, bridgekit.js resurface) find them there, kerbs and banks included
  for (const { key, geo } of data.tileGeos) {
    if (key >= KEY.BANK) put(geo, mat, 'ground bank');
    else if (key >= KEY.KERB) dd.add(put(geo, mat, `kerbs ${key - KEY.KERB}`), 'kerbs');
    else {
      const mesh = put(geo, mat, `ground ${key}`);
      if (key >= KEY.FIELD / 2) continue;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const i = Math.floor(key / 4096) >> 1, j = (key % 4096) >> 1, uk = i * 4096 + j, bb = geo.boundingBox;
      const u = units.get(uk) ?? units.set(uk, { key: uk, i, j, x0: G.ox + i * UNIT, z0: G.oz + j * UNIT, y0: Infinity, y1: -Infinity, near: [], tris: 0, far: null, isFar: false }).get(uk);
      u.near.push(mesh); u.tris += geo.index.count / 3; u.y0 = Math.min(u.y0, bb.min.y); u.y1 = Math.max(u.y1, bb.max.y);
    }
  }
  if (data.markings.length) {
    const paint = new THREE.MeshStandardMaterial({ roughness: 0.7, name: 'road-markings' });
    paint.color.setRGB(0.78, 0.78, 0.74);
    decalBias(paint, renderer, 1);
    // every chunk is called 'markings': bridgekit.js dropPaint and the bridges' own paint find them by that name
    for (const { geo } of data.markings) dd.add(put(geo, paint, 'markings'), 'paint');
  }

  // ---- level of detail: a unit farther than detail.far is drawn as its far sheet (groundfar.js), once that is in
  const farGroup = Object.assign(new THREE.Group(), still, { name: 'ground far' });
  const detail = { far: Infinity }, last = new THREE.Vector3(Infinity, 0, 0), lod = { ready: false, far: 0, made: 0, build: null, maps: null };
  const known = new Set(), all = [], farAll = [];
  let dirty = true, pending = false, kids = -1;
  // the id maps: one layer per far unit in two array textures (1 m and 2 m maps), allocated when the far data arrives
  // and filled a layer at a time as units first turn far. No CPU copy stays: a layer is decoded from its run-length
  // form into a scratch buffer for the upload.
  const idArray = (side, depth) => {
    const t = new THREE.DataArrayTexture(null, side, side, depth);
    t.format = THREE.RedFormat; t.type = THREE.UnsignedByteType;
    t.source.dataReady = false; // storage only: three allocates it, the layers come through copyTextureToTexture
    t.needsUpdate = true;
    return t;
  };
  const ids = { value: idArray(1, 1) }, ids2 = { value: idArray(1, 1) }, scratch = {}, at = new THREE.Vector3();
  const farMat = createGroundMaterial(T, strip, { ids, ids2, x: G.ox, z: G.oz, size: UNIT });
  // the far program compiles with the first frame (a zero-area triangle draws it), not when the first unit turns far
  // in the middle of a drive
  const warmGeo = new THREE.BufferGeometry();
  warmGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  warmGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  warmGeo.setAttribute('aSurf', new THREE.BufferAttribute(new Float32Array(3), 1));
  const warm = Object.assign(new THREE.Mesh(warmGeo, farMat), still, { name: 'ground far warm-up', frustumCulled: false });
  farGroup.add(warm); farAll.push(warm);
  root.add(farGroup);
  for (const m of root.children) { known.add(m); all.push(m); }
  scene.add(root);

  // Only what is drawn hangs in the scene graph: three, the shadow passes and the post chain each walk the whole graph
  // every frame, hidden objects included, and a thousand hidden tiles and chunks cost the frame more CPU time than
  // their triangles cost the GPU. `all` / `farAll` keep every mesh; the children arrays are rebuilt when the pick changes.
  const sync = () => {
    const c = root.children, fc = farGroup.children;
    c.length = 0; fc.length = 0;
    for (const m of all) if (m.visible) c.push(m);
    for (const m of farAll) if (m.visible) fc.push(m);
    kids = c.length;
  };
  // a mesh a site added to the root in the ground material (railcut.js re-lays triangles into one) is cut by unit, so
  // each part goes with its unit's full tile when that turns far
  const adopt = () => {
    for (const m of [...root.children]) {
      if (known.has(m)) continue;
      known.add(m);
      if (!m.isMesh || m.material !== mat || !m.geometry?.index) { all.push(m); continue; }
      const parts = splitByUnit(m.geometry, G.at);
      if (parts.size === 1 && parts.has(-1)) { all.push(m); continue; }
      for (const [key, geo] of parts) {
        const part = put(geo, mat, m.name), u = units.get(key);
        part.castShadow = m.castShadow;
        known.add(part); all.push(part);
        if (u) { u.near.push(part); part.visible = !u.isFar; }
      }
      root.remove(m); m.geometry.dispose();
    }
  };
  const makeFar = (u) => {
    const f = u.far.data, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(f.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(f.normal, 3));
    geo.setAttribute('aSurf', new THREE.BufferAttribute(new Float32Array(f.position.length / 3).fill(u.far.code), 1));
    geo.setIndex(new THREE.BufferAttribute(f.index, 1));
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    u.far.mesh = Object.assign(new THREE.Mesh(geo, farMat), still, { name: `ground far ${u.key}`, visible: false });
    farGroup.add(u.far.mesh); farAll.push(u.far.mesh); // (sync() takes it out of the children again while it is hidden)
    lod.made++;
  };
  // the unit's id map into its layer (decoded for the upload only: the run-length copy is what stays)
  const upload = (u) => {
    u.far.up = true;
    if (!renderer?.copyTextureToTexture) return; // headless
    const f = u.far.data, small = f.size < UNIT, side = small ? UNIT / 2 : UNIT;
    const src = scratch[side] ??= new THREE.DataTexture(new Uint8Array(side * side), side, side, THREE.RedFormat, THREE.UnsignedByteType);
    if (f.size === side) decodeIds(f.rv, f.rl, side, src.image.data); else src.image.data.fill(f.rv[0]); // one surface all over
    renderer.copyTextureToTexture(src, (small ? ids2 : ids).value, null, at.set(0, 0, u.far.layer));
  };
  // the far data of buildFarData (the worker's reply): from now on update() switches the units
  function attachFar(fd) {
    let n1 = 0, n2 = 0;
    for (const f of fd.units) {
      const u = units.get(f.i * 4096 + f.j);
      if (!u) continue;
      const small = f.size < UNIT, layer = small ? n2++ : n1++;
      u.far = { data: f, mesh: null, up: false, layer, code: ((small ? 512 : 0) + layer) * 4096 + f.i * 64 + f.j };
    }
    for (const [U, side, n] of [[ids, UNIT, n1], [ids2, UNIT / 2, n2]]) if (n) { U.value.dispose(); U.value = idArray(side, n); }
    warm.visible = false; // the program is compiled by now
    lod.ready = true; lod.build = fd.stats; lod.maps = { m1: n1, m2: n2, MB: +((n1 * UNIT * UNIT + n2 * UNIT * UNIT / 4) / 1e6).toFixed(1) }; dirty = true;
  }
  // a restored GL context comes back with empty id maps: every far unit fills its layer again
  renderer?.domElement?.addEventListener?.('webglcontextrestored', () => { for (const u of units.values()) if (u.far) u.far.up = false; dirty = true; });
  function update(dt, camera) {
    const p = camera?.position;
    if (!p) return;
    let changed = false;
    if (root.children.length !== kids) { adopt(); changed = true; }
    if (dd.update(p)) changed = true;
    if (lod.ready && (dirty || pending || p.distanceToSquared(last) >= 144)) {
      dirty = pending = false; last.copy(p);
      let budget = 2; // id maps a frame: each is decoded and uploaded (up to 1 MB)
      // full units back a frame: three uploads a returning unit's buffers (2-8 MB) on its first draw, and two heavy
      // units in one frame showed as a ~10 ms spike. With the LOD switched off they all come back at once.
      let back = detail.far < Infinity ? 1 : Infinity;
      for (const u of units.values()) {
        if (!u.far) continue;
        const dx = Math.max(u.x0 - p.x, 0, p.x - u.x0 - UNIT), dy = Math.max(u.y0 - p.y, 0, p.y - u.y1), dz = Math.max(u.z0 - p.z, 0, p.z - u.z0 - UNIT);
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const far = detail.far < Infinity && (u.isFar ? d > detail.far : d > detail.far * 1.06 + 16);
        if (far && !u.far.up) {
          if (budget-- <= 0) { pending = true; continue; }
          if (!u.far.mesh) makeFar(u);
          upload(u);
        }
        if (far === u.isFar) continue;
        if (!far && back-- <= 0) { pending = true; continue; }
        u.isFar = far; u.far.mesh.visible = far; changed = true;
        // a unit that turned far gives its full tile's GPU buffers back (three uploads them again when it returns)
        for (const m of u.near) { m.visible = !far; if (far) m.geometry.dispose(); }
        lod.far += far ? 1 : -1;
      }
    }
    if (changed) sync();
  }

  // cells outside the distance grid count as shore (0)
  const shoreDist = (x, z) => {
    const u = Math.floor((x - D.x0) / D.DC), w = Math.floor((z - D.z0) / D.DC);
    return u >= 0 && w >= 0 && u < D.dnx && w < D.dnz ? D.d[u + w * D.dnx] : 0;
  };
  const terrainHeight = (x, z) => (onAsphalt(x, z) ? H(x, z) + GY.ROAD : isWater(x, z) ? GY.WATER : H(x, z) + GY.LAND);
  return { root, material: mat, terrainHeight, heightAt: H, isWater, onAsphalt, shoreDist, wetSegs: data.wetSegs, stats: data.stats,
    band: { minY: GY.WATER - 3, maxY: hf.hMax + 1, slope: 1.2 }, update, attachFar, drawDist: dd, units,
    meshes: () => [...all.filter((m) => m !== farGroup), ...farAll.filter((m) => m !== warm)],
    // the units that get a far version: [[i, j, coarse map?]] (heavy enough, and wholly on the finely draped ground)
    farUnits: () => [...units.values()].filter((u) => u.tris >= FAR_MIN && G.fine(u.key)).map((u) => [u.i, u.j, u.tris < FAR_FINE]),
    setDetail({ far = Infinity, ...dist } = {}) { detail.far = far ?? Infinity; dd.set({ kerbs: Infinity, paint: Infinity, ...dist }); dirty = true; },
    lod: () => ({ units: units.size, capable: [...units.values()].filter((u) => u.far).length, far: lod.far, made: lod.made, build: lod.build, maps: lod.maps, detail: { ...detail }, chunks: dd.stats(),
      drawn: root.children.length - 1 + farGroup.children.length - (farGroup.children.includes(warm) ? 1 : 0), meshes: all.length - 1 + farAll.length - 1 }) };
}

const farInput = (hf) => ({ meta: hf.data.meta, grid: farLattice(hf) });
export function buildGround({ scene, T, map, hf, strip = null, renderer = null, far = false }) {
  const ground = assemble(combine([buildGroundData({ map, hf })]), { scene, T, map, hf, strip, renderer });
  if (far) ground.attachFar(buildFarData({ layers: farLayers(map), hf: farInput(hf), units: ground.farUnits() }));
  return ground;
}

// The same in module workers (each fetches map.json itself) while the main thread builds other things; falls back to
// the synchronous build when workers are unavailable or fail. The far versions are not waited for: once the three
// parts are in, a fourth worker paints them while the rest of the city builds, and the units stay full until it replies
// (without workers there is no far version: the ground draws as it always did).
export async function buildGroundAsync({ scene, T, map, hf, strip = null, renderer = null, mapUrl }) {
  let data = null;
  const run = (msg) => new Promise((res, rej) => {
    const w = new Worker(new URL('./ground.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { w.terminate(); if (e.data.error) rej(new Error(e.data.error)); else res(e.data); };
    w.onerror = (e) => { w.terminate(); rej(e.error || new Error(e.message || 'ground worker error')); };
    w.postMessage(msg);
  });
  if (typeof Worker !== 'undefined' && mapUrl) {
    try {
      const parts = await Promise.all([['land'], ['roads'], ['cover']].map((part) => run({ mapUrl, hf: hf.data, parts: part })));
      for (const d of parts) {
        for (const t of d.tileGeos) t.geo = unpackGeometry(t.geo);
        for (const t of d.markings) t.geo = unpackGeometry(t.geo);
        for (const k of ['asph', 'wat', 'land']) if (d[k]) d[k] = BitRaster.from(d[k]);
      }
      data = combine(parts);
      data.stats.workers = parts.map((d) => d.stats);
    } catch (e) { console.warn('[ground] workers failed, building on the main thread', e); data = null; }
  }
  const ground = assemble(data ?? combine([buildGroundData({ map, hf })]), { scene, T, map, hf, strip, renderer });
  if (data) {
    const t0 = performance.now();
    run({ mapUrl, hf: farInput(hf), parts: ['far'], units: ground.farUnits() })
      .then((fd) => { fd.stats.wallMs = Math.round(performance.now() - t0); ground.attachFar(fd); })
      .catch((e) => console.warn('[ground] no far versions: the far worker failed', e));
  }
  return ground;
}
if (inWorker()) {
  self.onmessage = async (e) => {
    try {
      const tf = performance.now(), map = await fetch(e.data.mapUrl).then((r) => r.json());
      const tb = performance.now();
      if (e.data.parts[0] === 'far') {
        const fd = buildFarData({ layers: farLayers(map), hf: e.data.hf, units: e.data.units });
        fd.stats.fetchMs = Math.round(tb - tf);
        self.postMessage(fd, fd.units.flatMap((u) => [u.position.buffer, u.normal.buffer, u.index.buffer, u.rv.buffer, u.rl.buffer]));
        return;
      }
      const d = buildGroundData({ map, hf: heightFieldFrom(e.data.hf), parts: e.data.parts });
      const transfer = [];
      const pack = (list) => list.map(({ key, geo }) => ({ key, geo: packGeometry(geo, transfer) }));
      const out = { ...d, tileGeos: pack(d.tileGeos), markings: pack(d.markings) };
      for (const k of ['asph', 'wat', 'land']) if (d[k]) { out[k] = { ...d[k] }; transfer.push(d[k].bits.buffer); }
      if (d.dist) transfer.push(d.dist.d.buffer);
      d.stats.fetchMs = Math.round(tb - tf); d.stats.startMs = Math.round(tf);
      self.postMessage(out, [...new Set(transfer)]);
    } catch (err) { self.postMessage({ error: String(err?.stack || err) }); }
  };
}

// ------------------------------------------------------------------------------------------------ markings
// Ukrainian road paint: a white centre line (solid on multi-lane main roads, dashed elsewhere), dashed lane lines,
// zebra crossings where OSM maps a crossing footway; lines stop short of the junctions. Returns [{ key, geo }], one
// geometry per chunk (chunkAt(x, z) -> key): the paint has its own draw distance.
function buildMarkings({ map, onAsphalt, H, chunkAt = () => 0 }) {
  const chunks = new Map();
  const Y = 0.006;
  // quad from its four corners (any order around), wound to face up
  const quad = (...cs) => {
    const key = chunkAt(cs[0][0], cs[0][2]), ch = chunks.get(key) ?? chunks.set(key, { P: [], I: [] }).get(key);
    const { P, I } = ch, base = P.length / 3;
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
  return [...chunks].map(([key, { P, I }]) => {
    const up = new Array(P.length);
    for (let k = 0; k < up.length; k++) up[k] = k % 3 === 1 ? 1 : 0;
    return { key, geo: toGeometry({ position: [P, 3], normal: [up, 3] }, I, P.length / 3) };
  });
}

// consecutive legs of a flat polyline longer than minLen: fn(ax, az, unit dx, unit dz, length)
function eachLeg(p, minLen, fn) {
  for (let k = 3; k < p.length; k += 2) {
    const dx = p[k - 1] - p[k - 3], dz = p[k] - p[k - 2], len = Math.hypot(dx, dz);
    if (len >= minLen) fn(p[k - 3], p[k - 2], dx / len, dz / len, len);
  }
}
