// Street furniture of the generated city, from public/assets/cherkasy/map_street.json (tools/cherkasy/build_street.mjs:
// the OSM street lamps, bus stops, crossings, benches, bins and container sites placed against the map's roads):
//   - road lamps: the round grey concrete pole with a bent steel arm and a flat LED head (9 m on the main roads, a
//     double arm on бульвар Шевченка, 8 m on the residential streets among blocks of flats), a square concrete pole
//     with a short arm in the yards, a 3.8 m post with an opal ball along the footways;
//   - the private sector's concrete utility poles: a steel crossarm with four insulators, the wires hung between the
//     poles of a street, and the street's sodium lamp on a short arm where OSM has one;
//   - the trolleybus contact wires over the trolley roads, with a span wire from every lamp pole beside them;
//   - bus shelters (a steel frame, tinted back and side panels, a bench) with the blue stop sign, benches, bins, the
//     yards' fenced container sites, and a crossing sign each side of a marked crossing.
// Nothing here is a real light: a lamp is an emissive lens (the detail material's LIGHT part), a glow sprite whose
// pixel size and brightness shrink with distance, and a soft additive pool on the ground under it, all by nightFactor().
//
//   buildStreet({ scene, data, map, heightAt, ground?, solids?, occ?, clear? = [], decks? = [], spots? = [], detailMat }) -> street | null
//     data: the parsed map_street.json; heightAt(x, z) -> terrain y; ground { isWater(x, z) }; solids: the collision
//     world (poles become cylinders, a shelter's back wall and a container site boxes; nothing else collides);
//     occ: the building raster (greenery.js footprintRaster) – a prop inside a footprint is dropped; clear: the sites'
//     clear(x, z) areas and decks: their deckAt(x, z) – no generated prop there (a site has its own); spots: the tree
//     spots, a pole steps aside from a trunk.
//     The sites' areas are ~120 functions, 16 us a point for all of them, so they are not asked for 20 thousand props
//     at the load: a 48 m cell is checked when the camera first comes within CHECK_R (640 m) of it, and a prop a site
//     clears goes then, with its collider (collision.disable), its wires, its glow and its pool; so does a pole or a
//     lamp head that turns out to be inside a solid the raster does not know (a site's own walls). Nothing is drawn,
//     and no car park is laid out (carparks.js, 420 m), nearer than that.
//   street.update(dt, camera)   streams the cells round the camera (only when it enters another 48 m cell) and sets
//     the night uniforms; street.view(camera) is the same for the photo mode's free camera
//   street.setDetail({ near, far, wires, pools, glow })   distances in m (DETAIL.street in city.js): within `near` the
//     full models, all props, casting shadows; out to `far` plain stand-ins of the poles, shelters and container
//     sites, no shadow; the wires fade out toward `wires`, the ground pools toward `pools` (0 = none), the glow
//     sprites toward `glow`
//   street.checkAll()   checks every cell against the sites now (tests, exact counts)
//   street.stats() -> { props: { lamps, main, ..., poles, benches, ... } (placed, before the sites' say), solids,
//     dropped: { site, deck, solid, building, water, region }, checked (cells), ms (the build), checkMs (the sites' checks so
//     far), drawn: { near, far (triangles), wires (segments), pools (triangles), glow (points) }, cells, refreshes, detail }
//   street.props(kind?) -> [{ x, y, z, ry, kind, alive }]   (tests) kind: 'lamp' | 'pole' | 'bench' | 'bin' | 'stop' | 'cross' | 'container' | 'shelter'
//   street.root   the group (five meshes: near, far, wires, pools, glow), street.lampCount
// Draw cost: five draw calls (three by day), +2 for the near mesh in the shadow cascades. Everything is world-space
// geometry merged per 48 m cell on first use (a cell's arrays are cached) and copied into one buffer per mesh when the
// camera changes cell, so a frame costs nothing but a cell compare.
import * as THREE from 'three';
import { MeshBuilder } from '../../kit/mesh.js';
import { DP } from '../materials.js';
import { nightFactor } from '../../render/daylight.js';

const CELL = 48, TAU = Math.PI * 2, Y64 = TAU / 64;
const ckey = (i, j) => (i + 2048) * 4096 + (j + 2048);
const cellOf = (x, z) => ckey(Math.floor(x / CELL), Math.floor(z / CELL));
const WIRE_X = [-0.55, -0.2, 0.2, 0.55], WIRE_Y = 8.42; // where the four wires hang on a utility pole's crossarm (local x, y)
const TROLLEY_Y = 5.75; // the trolleybus contact wires over the road
const CHECK_R = 640; // a cell is checked against the sites' own ground when the camera first comes this near (m)

// ---------------------------------------------------------------------------------------------- templates
// a MeshBuilder's content as flat arrays: normals as bytes, colours as bytes (linear), the detail material's part ids
function take(b) {
  const n = b.v, src = b.buf.a, pos = new Float32Array(n * 3), nrm = new Int8Array(n * 3), col = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const o = i * 11, k = i * 3;
    pos[k] = src[o]; pos[k + 1] = src[o + 1]; pos[k + 2] = src[o + 2];
    nrm[k] = Math.round(src[o + 3] * 127); nrm[k + 1] = Math.round(src[o + 4] * 127); nrm[k + 2] = Math.round(src[o + 5] * 127);
    col[k] = Math.min(255, Math.round(src[o + 8] * 255)); col[k + 1] = Math.min(255, Math.round(src[o + 9] * 255)); col[k + 2] = Math.min(255, Math.round(src[o + 10] * 255));
  }
  return { n, pos, nrm, col, part: b.parts.a.slice(0, n), idx: Uint32Array.from(b.tris.view()) };
}
const C = { conc: 0xa9a69d, conc2: 0x9b988f, galv: 0xb4b8ba, head: 0x74787c, dark: 0x25292c, steel: 0x54585c, porcelain: 0xe6e2d6,
  blue: 0x1c4fa6, white: 0xf0f0ee, black: 0x101112, wood: [0x8a5a2b, 0x2f6b3a, 0x3c5f8a, 0x9c7a3c], bin: 0x2b5a39, sheet: 0x3c6a4b, pad: 0x8f8e89,
  cont: [0x2f7d46, 0x2f7d46, 0x2b5ea7, 0x2f7d46], lid: [0x25633a, 0x25633a, 0x234e8c, 0xd9b021], frame: 0x3a3d40, roof: 0xc4c8ca, band: 0x2b5ea7 };
const LENS = { led: [1, 0.93, 0.8], sodium: [1, 0.68, 0.34], warm: [1, 0.85, 0.62], opal: [1, 0.9, 0.72] };

// a tapered square post with flat faces, half sizes (a0, b0) at y0 -> (a1, b1) at y1
function post(b, a0, b0, a1, b1, y0, y1) {
  const lo = [[-a0, y0, -b0], [a0, y0, -b0], [a0, y0, b0], [-a0, y0, b0]], hi = [[-a1, y1, -b1], [a1, y1, -b1], [a1, y1, b1], [-a1, y1, b1]];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; b.face([lo[j], lo[i], hi[i], hi[j]]); }
  b.face([hi[0], hi[3], hi[2], hi[1]], [0, 1, 0]);
}
// the bent arm (a polyline of round bars in the local x / y plane) and the flat head at its end, lens down
function armHead(b, lod, pts, lens, side = 1) {
  b.setColor(C.galv).setPart(DP.GALV);
  for (let i = 1; i < pts.length; i++) b.tube([pts[i - 1][0] * side, pts[i - 1][1], 0], [pts[i][0] * side, pts[i][1], 0], lod ? 0.045 : 0.038, lod ? 3 : 5);
  const [x, y] = pts.at(-1), x0 = (x - 0.08) * side, x1 = (x + 0.62) * side;
  b.setColor(C.head).box(x0, y - 0.03, -0.15, x1, y + 0.09, 0.15, 63 & ~8);
  b.setColor(LENS[lens]).setPart(DP.LIGHT).face([[x0, y - 0.03, -0.15], [x1, y - 0.03, -0.15], [x1, y - 0.03, 0.15], [x0, y - 0.03, 0.15]], [0, -1, 0]);
}
// kinds of lamp: the pole, the arm's polyline, the lens, the pole's collision radius and height, the glow sprite's
// world size, the ground pool's half sizes (across, along the road) and where the head is (local x, y)
const LAMPS = {
  main: { h: 9, r0: 0.17, r1: 0.1, arm: [[0, 8.75], [0.28, 9.45], [1.1, 9.82], [2, 9.9]], lens: 'led', rad: 0.17, glow: 2.6, pool: [9, 15] },
  street: { h: 8, r0: 0.15, r1: 0.09, arm: [[0, 7.75], [0.25, 8.35], [0.9, 8.68], [1.5, 8.75]], lens: 'led', rad: 0.15, glow: 2.3, pool: [8, 13] },
  yard: { h: 7.2, sq: [0.1, 0.08, 0.075, 0.065], arm: [[0.07, 6.9], [0.42, 7.3], [0.9, 7.36]], lens: 'warm', rad: 0.12, glow: 2, pool: [6.5, 9] },
  util: { h: 8.6, sq: [0.11, 0.085, 0.085, 0.07], arm: [[0.08, 7.45], [0.45, 7.9], [1, 7.96]], lens: 'sodium', rad: 0.13, glow: 2, pool: [6.5, 10] },
  park: { h: 3.6, rad: 0.07, glow: 1.7, pool: [5, 5], lens: 'opal' },
};
for (const L of Object.values(LAMPS)) L.head = L.arm ? [L.arm.at(-1)[0] + 0.27, L.arm.at(-1)[1] - 0.16] : [0, 3.84];
function lampTpl(kind, lod, { double = false, lamp = true, cross = false } = {}) {
  const L = LAMPS[kind], b = new MeshBuilder();
  if (kind === 'park') {
    b.setColor(C.dark).setPart(DP.PAINT).cyl(0, -0.3, 0, 0.05, 0.04, L.h + 0.3, lod ? 4 : 6, false);
    if (!lod) b.cyl(0, -0.3, 0, 0.09, 0.07, 0.8, 6, false).cyl(0, 3.56, 0, 0.11, 0.11, 0.06, 8, true);
    b.setColor(LENS.opal).setPart(DP.LIGHT).ellipsoid([0, 3.84, 0], [0.21, 0.21, 0.21], lod ? 5 : 8, lod ? 3 : 5);
    return take(b);
  }
  b.setColor(L.sq ? C.conc2 : C.conc).setPart(DP.CONC);
  if (L.sq) post(b, L.sq[0], L.sq[1], L.sq[2], L.sq[3], -0.4, L.h);
  else { b.cyl(0, -0.4, 0, L.r0, L.r1, L.h + 0.4, lod ? 5 : 8, true); if (!lod) b.setColor(C.conc2).cyl(0, -0.4, 0, L.r0 + 0.05, L.r0 + 0.04, 0.85, 8, true); }
  if (cross) { // the crossarm across the street's line, four insulators (the wires hang at WIRE_X, WIRE_Y)
    b.setColor(C.steel).setPart(DP.STEEL).box(-0.64, WIRE_Y - 0.19, -0.035, 0.64, WIRE_Y - 0.12, 0.035);
    if (!lod) { b.setColor(C.porcelain).setPart(DP.PAINT); for (const x of WIRE_X) b.cyl(x, WIRE_Y - 0.12, 0, 0.04, 0.03, 0.13, 5, true); }
  }
  if (lamp) { armHead(b, lod, lod ? [L.arm[0], L.arm.at(-2), L.arm.at(-1)] : L.arm, L.lens, 1); if (double) armHead(b, lod, lod ? [L.arm[0], L.arm.at(-2), L.arm.at(-1)] : L.arm, L.lens, -1); }
  return take(b);
}

// a bench: the sitter looks along local +z, 1.8 m long
function benchTpl(back, wood) {
  const b = new MeshBuilder();
  b.setColor(C.dark).setPart(DP.PAINT);
  for (const x of [-0.7, 0.7]) { b.box(x - 0.03, 0, -0.18, x + 0.03, 0.42, 0.2); if (back) b.box(x - 0.025, 0.42, -0.25, x + 0.025, 0.9, -0.2); }
  b.setColor(wood).setPart(DP.WOOD).box(-0.9, 0.42, -0.2, 0.9, 0.47, 0.22);
  if (back) b.box(-0.9, 0.6, -0.27, 0.9, 0.9, -0.235);
  return take(b);
}
function binTpl() {
  const b = new MeshBuilder();
  b.setColor(C.dark).setPart(DP.PAINT).box(-0.26, 0, -0.03, -0.22, 0.75, 0.03).box(0.22, 0, -0.03, 0.26, 0.75, 0.03);
  b.setColor(C.bin).cyl(0, 0.16, 0, 0.17, 0.21, 0.56, 8, false);
  b.setColor(C.black)._cap(0, 0.68, 0, 0.2, 8, true); b._cap(0, 0.16, 0, 0.17, 8, false);
  return take(b);
}
// a road sign on a post, its face toward local +z: 'cross' (the blue square with the white triangle and a walker) or
// 'stop' (the blue plate with a bus on a white field)
function signTpl(kind) {
  const b = new MeshBuilder(), w = kind === 'cross' ? 0.35 : 0.3, y0 = kind === 'cross' ? 2.2 : 2.05, y1 = kind === 'cross' ? 2.9 : 2.9;
  b.setColor(C.galv).setPart(DP.GALV).cyl(0, -0.3, 0, 0.03, 0.03, y1 + 0.3, 5, false);
  b.setColor(C.galv).box(-w, y0, 0.03, w, y1, 0.045, 63 & ~16);
  const f = (pts, z, c) => b.setColor(c).setPart(DP.PAINT).face(pts.map(([x, y]) => [x, y, z]), [0, 0, 1]);
  f([[-w, y0], [w, y0], [w, y1], [-w, y1]], 0.045, C.blue);
  if (kind === 'cross') {
    f([[-0.28, 2.27], [0.28, 2.27], [0, 2.83]], 0.049, C.white);
    f([[-0.03, 2.5], [0.05, 2.5], [0.03, 2.66], [-0.05, 2.66]], 0.053, C.black); // the walker: body, head, legs, the zebra under him
    f([[-0.035, 2.675], [0.03, 2.675], [0.03, 2.735], [-0.035, 2.735]], 0.053, C.black);
    f([[-0.03, 2.5], [0.0, 2.5], [-0.09, 2.36], [-0.12, 2.36]], 0.053, C.black);
    f([[0.02, 2.5], [0.05, 2.5], [0.12, 2.36], [0.09, 2.36]], 0.053, C.black);
    f([[-0.18, 2.31], [0.18, 2.31], [0.18, 2.335], [-0.18, 2.335]], 0.053, C.black);
  } else {
    f([[-0.23, 2.36], [0.23, 2.36], [0.23, 2.82], [-0.23, 2.82]], 0.049, C.white);
    f([[-0.18, 2.5], [0.18, 2.5], [0.18, 2.72], [-0.18, 2.72]], 0.053, C.black); // the bus: body, windows, wheels
    f([[-0.15, 2.61], [0.15, 2.61], [0.15, 2.69], [-0.15, 2.69]], 0.057, C.white);
    f([[-0.14, 2.455], [-0.07, 2.455], [-0.07, 2.5], [-0.14, 2.5]], 0.053, C.black);
    f([[0.07, 2.455], [0.14, 2.455], [0.14, 2.5], [0.07, 2.5]], 0.053, C.black);
  }
  return take(b);
}
// a yard container site: a concrete pad, a sheet fence on three sides (open to local +z), n wheeled containers
const contWidth = (n) => n * 1.5 + 0.4;
function containerTpl(n, lod) {
  const b = new MeshBuilder(), W = contWidth(n) / 2;
  if (!lod) b.setColor(C.pad).setPart(DP.CONC).box(-W, -0.3, -0.95, W, 0.06, 0.95);
  b.setColor(C.sheet).setPart(DP.PAINT).box(-W, 0, -0.95, W, 1.9, -0.9).box(-W, 0, -0.9, -W + 0.05, 1.9, 0.45).box(W - 0.05, 0, -0.9, W, 1.9, 0.45);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 1.5;
    b.setColor(C.cont[i % 4]).box(x - 0.62, 0.12, -0.72, x + 0.62, 1.08, 0.3, lod ? 63 & ~8 : 63);
    if (!lod) b.setColor(C.lid[i % 4]).box(x - 0.66, 1.08, -0.76, x + 0.66, 1.2, 0.34);
  }
  return take(b);
}
// a bus shelter L long and D deep, open to local +z: four posts, a flat roof with a blue fascia, tinted back and side
// panels, a bench along the back
function shelterTpl(L, D, lod) {
  const b = new MeshBuilder(), hx = L / 2, hz = D / 2;
  if (!lod) {
    b.setColor(C.frame).setPart(DP.STEEL);
    for (const x of [-hx + 0.04, hx - 0.04]) for (const z of [-hz + 0.04, hz - 0.04]) b.box(x - 0.035, -0.3, z - 0.035, x + 0.035, 2.34, z + 0.035);
    b.box(-hx, 2.2, -hz, hx, 2.26, -hz + 0.05).box(-hx, 0.3, -hz, hx, 0.36, -hz + 0.05);
    b.setColor(C.wood[0]).setPart(DP.WOOD).box(-hx + 0.6, 0.42, -hz + 0.14, hx - 0.6, 0.47, -hz + 0.5);
    b.setColor(C.dark).setPart(DP.PAINT).box(-hx + 0.8, 0, -hz + 0.2, -hx + 0.86, 0.42, -hz + 0.46).box(hx - 0.86, 0, -hz + 0.2, hx - 0.8, 0.42, -hz + 0.46);
  }
  b.setColor(C.roof).setPart(DP.GALV).box(-hx - 0.2, 2.34, -hz - 0.15, hx + 0.2, 2.42, hz + 0.35);
  b.setColor(C.band).setPart(DP.PAINT).box(-hx - 0.2, 2.2, hz + 0.33, hx + 0.2, 2.34, hz + 0.35);
  b.setColor(C.dark).setPart(DP.GLASS).box(-hx + 0.05, 0.36, -hz + 0.01, hx - 0.05, 2.2, -hz + 0.035);
  for (const x of [-hx + 0.03, hx - 0.03]) b.box(x - 0.012, 0.36, -hz + 0.05, x + 0.012, 2.2, 0.1);
  return take(b);
}

// ---------------------------------------------------------------------------------------------- materials
const POOL_VERT = /* glsl */`
attribute vec3 tint;
uniform float uReach;
varying vec2 vUv; varying vec3 vTint; varying float vFade;
#include <fog_pars_vertex>
void main() {
  vUv = uv; vTint = tint;
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  vFade = 1.0 - smoothstep( uReach * 0.7, uReach, length( mvPosition.xyz ) );
  #include <fog_vertex>
}`;
const POOL_FRAG = /* glsl */`
uniform float uNight;
varying vec2 vUv; varying vec3 vTint; varying float vFade;
#include <fog_pars_fragment>
void main() {
  float a = 1.0 - smoothstep( 0.0, 1.0, length( vUv ) );
  vec3 c = vTint * ( a * a * uNight * vFade );
  gl_FragColor = vec4( c, 1.0 );
  #include <fog_fragment>
  #ifdef USE_FOG
    gl_FragColor.rgb = c * ( 1.0 - fogFactor ); // additive: the haze dims the light, it adds no veil of its own
  #endif
}`;
// the glow sprites: a lamp's world size in pixels, never under uMin px (then dimmed by how much it was enlarged, so a
// far lamp is a faint dot, not an HDR blob for the bloom) nor over uMax; `size` 0 = a lamp a site cleared
const GLOW_VERT = /* glsl */`
attribute vec3 tint; attribute float size;
uniform float uPx, uReach, uNight, uMin, uMax;
varying vec3 vTint;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  float d = length( mvPosition.xyz ), px = size * uPx * projectionMatrix[ 1 ][ 1 ] / max( - mvPosition.z, 0.5 );
  float k = clamp( px / uMin, 0.0, 1.0 );
  vTint = tint * ( uNight * mix( 0.22, 1.0, k * k ) * ( 1.0 - smoothstep( uReach * 0.75, uReach, d ) ) );
  gl_PointSize = clamp( px, uMin, uMax );
  if ( d > uReach || size <= 0.0 ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); // out of reach, or gone: off the screen
  #include <fog_vertex>
}`;
const GLOW_FRAG = /* glsl */`
varying vec3 vTint;
#include <fog_pars_fragment>
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = dot( q, q );
  if ( r > 1.0 ) discard;
  float a = ( 0.26 * exp( - 5.0 * r ) + 2.2 * exp( - 42.0 * r ) ) * ( 1.0 - r ); // a hot core in a soft halo
  vec3 c = vTint * a;
  gl_FragColor = vec4( c, 1.0 );
  #include <fog_fragment>
  #ifdef USE_FOG
    gl_FragColor.rgb = c * ( 1.0 - fogFactor );
  #endif
}`;

// one growing world-space buffer drawn as a single mesh; fill(parts) copies the cells' cached arrays in
function ringBuffer(make, attrs) {
  let cap = 0, icap = 0, geo = null;
  const obj = make();
  const alloc = (nv, ni) => {
    geo?.dispose();
    geo = new THREE.BufferGeometry(); cap = Math.max(1024, Math.ceil(nv * 1.4)); icap = Math.max(1024, Math.ceil(ni * 1.4));
    for (const [name, Type, size, norm] of attrs) { const a = new THREE.BufferAttribute(new Type(cap * size), size, !!norm); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); }
    if (ni >= 0) { const ix = new THREE.BufferAttribute(new Uint32Array(icap), 1); ix.setUsage(THREE.DynamicDrawUsage); geo.setIndex(ix); }
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity); // drawn round the camera: never culled
    obj.geometry = geo;
  };
  alloc(0, attrs.indexed ? 0 : -1);
  return {
    obj, verts: 0, count: 0,
    // parts: [{ n, idx?: Uint32Array, <attr name>: typed array }], indices relative to the part
    fill(parts) {
      let nv = 0, ni = 0;
      for (const p of parts) { nv += p.n; ni += p.idx ? p.idx.length : 0; }
      if (nv > cap || ni > icap) alloc(nv, attrs.indexed ? ni : -1);
      let v = 0, k = 0;
      const ix = geo.index?.array;
      for (const p of parts) {
        for (const [name, , size] of attrs) geo.attributes[name].array.set(p[name], v * size);
        if (ix) { const src = p.idx; for (let i = 0; i < src.length; i++) ix[k + i] = src[i] + v; k += src.length; }
        v += p.n;
      }
      for (const [name, , size] of attrs) { const a = geo.attributes[name]; a.clearUpdateRanges(); a.addUpdateRange(0, v * size); a.needsUpdate = true; }
      if (geo.index) { geo.index.clearUpdateRanges(); geo.index.addUpdateRange(0, k); geo.index.needsUpdate = true; }
      geo.setDrawRange(0, ix ? k : v);
      this.verts = v; this.count = ix ? k / 3 : v;
      obj.visible = v > 0;
    },
    dispose() { geo?.dispose(); },
  };
}

export function buildStreet({ scene, data, map, heightAt, ground = null, solids = null, occ = null, clear = [], decks = [], spots = [], detailMat }) {
  if (!data?.lamps || !scene || !detailMat) return null;
  const t0 = performance.now(), R = map.region;
  // ---- templates: [full model, far stand-in | null]
  const TPL = [], tpl = (l0, l1 = null) => TPL.push([l0, l1]) - 1;
  const T_MAIN = tpl(lampTpl('main', 0), lampTpl('main', 1)), T_MAIN2 = tpl(lampTpl('main', 0, { double: true }), lampTpl('main', 1, { double: true }));
  const T_STREET = tpl(lampTpl('street', 0), lampTpl('street', 1)), T_YARD = tpl(lampTpl('yard', 0), lampTpl('yard', 1)), T_PARK = tpl(lampTpl('park', 0), lampTpl('park', 1));
  const T_UTIL = tpl(lampTpl('util', 0, { lamp: false, cross: true }), lampTpl('util', 1, { lamp: false, cross: true }));
  const T_UTIL_LAMP = tpl(lampTpl('util', 0, { cross: true }), lampTpl('util', 1, { cross: true })), T_UTIL_SOLO = tpl(lampTpl('util', 0), lampTpl('util', 1));
  const T_BENCH = C.wood.map((w) => tpl(benchTpl(false, w))), T_BENCH_BACK = C.wood.map((w) => tpl(benchTpl(true, w)));
  const T_BIN = tpl(binTpl()), T_STOP = tpl(signTpl('stop')), T_CROSS = tpl(signTpl('cross'));
  const T_CONT = [2, 3, 4].map((n) => tpl(containerTpl(n, 0), containerTpl(n, 1)));
  const shelterOf = new Map();
  const T_SHELTER = (L, D) => { const k = L + '|' + D; if (!shelterOf.has(k)) shelterOf.set(k, tpl(shelterTpl(L, D, 0), shelterTpl(L, D, 1))); return shelterOf.get(k); };
  const LAMP_OF = [['main', T_MAIN], ['main', T_MAIN2], ['street', T_STREET], ['yard', T_YARD], ['park', T_PARK]];

  // ---- where a prop may not stand: the cheap tests now, the sites' own ground when its cell is first needed (check)
  const inside = (x, z, m = 2) => x > R.x0 + m && x < R.x1 - m && z > R.z0 + m && z < R.z1 - m;
  const dropped = { site: 0, deck: 0, solid: 0, building: 0, water: 0, region: 0 };
  const ok = (x, z) => {
    if (!inside(x, z)) { dropped.region++; return false; }
    if (occ && occ.get(x, z) === 1) { dropped.building++; return false; }
    if (ground?.isWater(x, z)) { dropped.water++; return false; }
    return true;
  };
  // trunks in 4 m buckets: a pole that would stand in one steps 1.3 m along its street
  const trunks = new Map(), tk = (x, z) => ckey(Math.floor(x / 4), Math.floor(z / 4));
  for (const s of spots) { const k = tk(s.x, s.z); let b = trunks.get(k); if (!b) trunks.set(k, b = []); b.push(s.x, s.z); }
  const atTrunk = (x, z) => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const b = trunks.get(tk(x + i * 4, z + j * 4)); if (b) for (let q = 0; q < b.length; q += 2) if ((b[q] - x) ** 2 + (b[q + 1] - z) ** 2 < 0.64) return true; }
    return false;
  };
  const free = (x, z) => inside(x, z) && !(occ && occ.get(x, z) === 1) && !ground?.isWater(x, z) && !ground?.onAsphalt?.(x, z);
  const stepAside = (x, z, ry) => {
    if (!atTrunk(x, z)) return [x, z];
    const sx = Math.sin(ry), sz = Math.cos(ry); // local +z: along the street
    for (const d of [1.3, -1.3, 2.6, -2.6]) { const qx = x + sx * d, qz = z + sz * d; if (!atTrunk(qx, qz) && free(qx, qz)) return [qx, qz]; } // not onto a side street, into a wall or the river
    return [x, z];
  };

  // a lamp arm that would reach into a building (a pole tight against a wall, its street on the far side of the house)
  // turns about, or to a side: no head, lens or glow sprite ends up inside a footprint
  const aim = (x, z, ry, reach, turns, both = false) => {
    if (!occ) return ry;
    const blocked = (a) => { for (const s of both ? [1, -1] : [1]) for (const t of [0.5, 1, 1.25]) if (occ.get(x + Math.cos(a) * reach * t * s, z - Math.sin(a) * reach * t * s) === 1) return true; return false; };
    for (const d of turns) if (!blocked(ry + d)) return ry + d;
    return ry;
  };
  const TURNS = [0, Math.PI, Math.PI / 2, -Math.PI / 2], ABOUT = [0, Math.PI]; // a utility pole only turns about: its crossarm stays across the wires

  // ---- the props. Per prop: place, template, its collider and the wire records that hang on it (w0 / w1: first
  // record of the span behind and ahead, -1 none; a utility pole's span is four records, a trolley span one)
  const P = { x: [], y: [], z: [], ry: [], t: [], kind: [], solid: [], w0: [], w1: [] };
  const counts = { lamps: 0, main: 0, main2: 0, street: 0, yard: 0, park: 0, poles: 0, poleLamps: 0, benches: 0, bins: 0, containers: 0, shelters: 0, stops: 0, cross: 0 };
  const KIND = ['lamp', 'pole', 'bench', 'bin', 'stop', 'cross', 'container', 'shelter'];
  let nSolids = 0;
  const groundY = (x, z) => heightAt(x, z) + 0.17;
  const add = (x, y, z, ry, t, kind, solid = -1) => { P.x.push(x); P.y.push(y); P.z.push(z); P.ry.push(ry); P.t.push(t); P.kind.push(kind); P.solid.push(solid); P.w0.push(-1); P.w1.push(-1); if (solid >= 0) nSolids++; return P.x.length - 1; };
  const heads = []; // x, y, z, ry, prop of every lamp head (the glow sprites and the ground pools), its kind in headKind
  const headKind = [];
  const wires = []; // ax, ay, az, bx, by, bz, sag (< 0: gone)
  const pole = (x, y, z, L) => (solids ? solids.cyl(x, z, y - 0.4, y + L.h, L.rad, L.rad, 'pole') : -1);
  const headAt = (id, kind, side = 1) => { const L = LAMPS[kind], ry = P.ry[id]; heads.push(P.x[id] + L.head[0] * side * Math.cos(ry), P.y[id] + L.head[1], P.z[id] - L.head[0] * side * Math.sin(ry), ry, id); headKind.push(kind); };
  {
    const D = data.lamps; let px = 0, pz = 0;
    for (let i = 0; i < D.length; i += 3) {
      px += D[i]; pz += D[i + 1];
      const code = D[i + 2], type = code & 7, ry0 = ((code >> 3) & 63) * Y64;
      let x = px / 10, z = pz / 10;
      if (!ok(x, z)) continue;
      [x, z] = stepAside(x, z, ry0);
      const [kind, t] = LAMP_OF[type] ?? LAMP_OF[2], y = groundY(x, z);
      const ry = aim(x, z, ry0, LAMPS[kind].head[0], TURNS, type === 1), span = ry === ry0 ? (code >> 9) / 10 : 0; // a turned arm holds no span wire
      const id = add(x, y, z, ry, t, 0, pole(x, y, z, LAMPS[kind]));
      headAt(id, kind); if (type === 1) headAt(id, kind, -1);
      counts.lamps++; counts[['main', 'main2', 'street', 'yard', 'park'][type] ?? 'street']++;
      if (span > 0) { // the trolleybus span wire: from the pole out over the road to the far wire pair
        const ex = x + Math.cos(ry) * span, ez = z - Math.sin(ry) * span;
        P.w0[id] = wires.length / 7;
        wires.push(x, y + 7.3, z, ex, heightAt(ex, ez) + TROLLEY_Y + 0.12, ez, 0.25);
      }
    }
  }
  for (const ch of data.chains ?? []) { // utility poles, four wires from each to the next of its chain
    let px = 0, pz = 0, prev = -1;
    const solo = ch.length === 3;
    for (let i = 0; i < ch.length; i += 3) {
      px += ch[i]; pz += ch[i + 1];
      const lamp = ch[i + 2] & 1, ry0 = (ch[i + 2] >> 1) * Y64;
      let x = px / 10, z = pz / 10;
      if (!ok(x, z)) continue;
      [x, z] = stepAside(x, z, ry0);
      const ry = lamp ? aim(x, z, ry0, LAMPS.util.head[0], ABOUT) : ry0;
      const y = groundY(x, z), id = add(x, y, z, ry, lamp ? (solo ? T_UTIL_SOLO : T_UTIL_LAMP) : T_UTIL, 1, pole(x, y, z, LAMPS.util));
      if (lamp) { headAt(id, 'util'); counts.poleLamps++; }
      counts.poles++;
      if (prev >= 0 && Math.hypot(x - P.x[prev], z - P.z[prev]) < 75) {
        const c = Math.cos(ry), s = Math.sin(ry), pc = Math.cos(P.ry[prev]), ps = Math.sin(P.ry[prev]), len = Math.hypot(x - P.x[prev], z - P.z[prev]);
        const flip = c * pc + s * ps < 0; // poles facing each other across the street: the wires do not cross over
        P.w1[prev] = P.w0[id] = wires.length / 7;
        for (let w = 0; w < 4; w++) {
          const a = WIRE_X[w], b = WIRE_X[flip ? 3 - w : w];
          wires.push(P.x[prev] + a * pc, P.y[prev] + WIRE_Y, P.z[prev] - a * ps, x + b * c, y + WIRE_Y, z - b * s, 0.15 + 0.014 * len);
        }
      }
      prev = id;
    }
  }
  // where the pairs end: centreline node -> [{ e (0 start | 1 end), x, z (the pair's middle), rec: [left wire, right wire] }]
  const trolleyEnds = new Map(), nodeKey = (q) => Math.round(q[0] * 2) + ',' + Math.round(q[1] * 2);
  for (const tr of data.trolley ?? []) { // the contact wire pair of one direction, in pieces of <= 20 m that follow the road
    const off = tr[0] / 10; let px = 0, pz = 0; const Q = [];
    for (let i = 1; i < tr.length; i += 2) { px += tr[i]; pz += tr[i + 1]; Q.push([px / 10, pz / 10]); }
    const E = [{ e: 0, x: 0, z: 0, rec: [-1, -1] }, { e: 1, x: 0, z: 0, rec: [-1, -1] }];
    for (const side of [-0.3, 0.3]) {
      let last = null;
      for (let i = 0; i < Q.length; i++) {
        // the lateral direction at a vertex: across the mean of the two segments' directions (right of the way's direction)
        const a = Q[Math.max(0, i - 1)], b = Q[Math.min(Q.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
        const pt = [Q[i][0] + nx * (off + side), Q[i][1] + nz * (off + side)];
        if (last) {
          const n = Math.max(1, Math.ceil(Math.hypot(pt[0] - last[0], pt[1] - last[1]) / 20));
          for (let k = 0; k < n; k++) {
            const ax = last[0] + (pt[0] - last[0]) * k / n, az = last[1] + (pt[1] - last[1]) * k / n, bx = last[0] + (pt[0] - last[0]) * (k + 1) / n, bz = last[1] + (pt[1] - last[1]) * (k + 1) / n;
            if (!inside((ax + bx) / 2, (az + bz) / 2, -40)) continue;
            if (i === 1 && k === 0) E[0].rec[side < 0 ? 0 : 1] = wires.length / 7;
            if (i === Q.length - 1 && k === n - 1) E[1].rec[side < 0 ? 0 : 1] = wires.length / 7;
            wires.push(ax, heightAt(ax, az) + TROLLEY_Y, az, bx, heightAt(bx, bz) + TROLLEY_Y, bz, 0);
          }
        }
        if (i === 0) { E[0].x += pt[0] / 2; E[0].z += pt[1] / 2; } else if (i === Q.length - 1) { E[1].x += pt[0] / 2; E[1].z += pt[1] / 2; }
        last = pt;
      }
    }
    for (const en of E) { const k = nodeKey(en.e ? Q.at(-1) : Q[0]); (trolleyEnds.get(k) ?? trolleyEnds.set(k, []).get(k)).push(en); }
  }
  // two ways of a trolley road meet at a node, each with its own width and end direction, so their pairs end up to a
  // couple of metres apart: the nearest two pairs there are joined, wire to wire, at the midpoint
  for (const L of trolleyEnds.values()) {
    if (L.length < 2) continue;
    const cand = [];
    for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) { const d = Math.hypot(L[a].x - L[b].x, L[a].z - L[b].z); if (d < 3.5) cand.push([d, a, b]); }
    cand.sort((p, q) => p[0] - q[0]);
    const used = new Set();
    for (const [, a, b] of cand) {
      if (used.has(a) || used.has(b)) continue;
      used.add(a); used.add(b);
      for (let sd = 0; sd < 2; sd++) {
        // one runs into the node and the other out of it: left meets left; both in, or both out: left meets right
        const ra = L[a].rec[sd], rb = L[b].rec[L[a].e !== L[b].e ? sd : 1 - sd]; if (ra < 0 || rb < 0) continue;
        const ia = ra * 7 + L[a].e * 3, ib = rb * 7 + L[b].e * 3, mx = (wires[ia] + wires[ib]) / 2, mz = (wires[ia + 2] + wires[ib + 2]) / 2, my = heightAt(mx, mz) + TROLLEY_Y;
        wires[ia] = wires[ib] = mx; wires[ia + 1] = wires[ib + 1] = my; wires[ia + 2] = wires[ib + 2] = mz;
      }
    }
  }
  const each = (list, n, f) => { let px = 0, pz = 0; for (let i = 0; i < (list?.length ?? 0); i += n) { px += list[i]; pz += list[i + 1]; f(px / 10, pz / 10, list[i + 2]); } };
  each(data.benches, 3, (x, z, c) => { if (!ok(x, z)) return; add(x, groundY(x, z), z, (c & 63) * Y64, (c & 64 ? T_BENCH_BACK : T_BENCH)[Math.floor(x * 7 + z * 13) & 3], 2); counts.benches++; });
  each(data.bins, 2, (x, z) => { if (!ok(x, z)) return; add(x, groundY(x, z), z, 0, T_BIN, 3); counts.bins++; });
  each(data.stops, 3, (x, z, c) => { if (!ok(x, z)) return; add(x, groundY(x, z), z, c * Y64, T_STOP, 4); counts.stops++; });
  each(data.cross, 3, (x, z, c) => { if (!ok(x, z)) return; add(x, groundY(x, z), z, c * Y64, T_CROSS, 5); counts.cross++; });
  each(data.containers, 3, (x, z, c) => {
    if (!ok(x, z)) return;
    const ry = (c & 63) * Y64, n = Math.max(2, Math.min(4, c >> 6)), y = groundY(x, z), s = Math.sin(ry), co = Math.cos(ry);
    add(x, y, z, ry, T_CONT[n - 2], 6, solids ? solids.obox(x - s * 0.22, z - co * 0.22, contWidth(n) / 2, 0.73, -ry, y - 0.3, y + 1.3, 'wall') : -1);
    counts.containers++;
  });
  for (let i = 0; i + 4 < (data.shelters?.length ?? 0); i += 5) {
    const x = data.shelters[i] / 10, z = data.shelters[i + 1] / 10, ry = data.shelters[i + 2] * Y64, L = Math.round(data.shelters[i + 3] / 5) / 2, D = Math.round(data.shelters[i + 4] / 2) / 5;
    if (!ok(x, z)) continue;
    const y = groundY(x, z), s = Math.sin(ry), co = Math.cos(ry);
    // the back wall collides; the open front stays walkable
    add(x, y, z, ry, T_SHELTER(L, D), 7, solids ? solids.obox(x - s * (D / 2 - 0.03), z - co * (D / 2 - 0.03), L / 2, 0.06, -ry, y - 0.3, y + 2.4, 'wall') : -1);
    counts.shelters++;
  }

  // ---- cells: prop ids, lamp heads and wire records per 48 m cell
  const N = P.x.length, PX = Float32Array.from(P.x), PY = Float32Array.from(P.y), PZ = Float32Array.from(P.z), PR = Float32Array.from(P.ry), PT = Uint16Array.from(P.t);
  const alive = new Uint8Array(N).fill(1);
  const group = (n, keyAt) => { const m = new Map(); for (let i = 0; i < n; i++) { const k = keyAt(i); let a = m.get(k); if (!a) m.set(k, a = []); a.push(i); } return m; };
  const cellProps = group(N, (i) => cellOf(PX[i], PZ[i]));
  const H = Float32Array.from(heads), nHeads = headKind.length; // 5 per head
  const cellHeads = group(nHeads, (i) => cellOf(H[i * 5], H[i * 5 + 2]));
  const headsOf = new Map(); // prop -> its heads (the glow sprites to put out if a site clears it)
  for (let h = 0; h < nHeads; h++) { const id = H[h * 5 + 4]; let a = headsOf.get(id); if (!a) headsOf.set(id, a = []); a.push(h); }
  const WR = Float32Array.from(wires), nWires = WR.length / 7;
  const cellWires = group(nWires, (i) => cellOf((WR[i * 7] + WR[i * 7 + 3]) / 2, (WR[i * 7 + 2] + WR[i * 7 + 5]) / 2));

  // ---- the meshes
  const root = new THREE.Group(); root.name = 'street furniture';
  const GEO = [['position', Float32Array, 3], ['normal', Int8Array, 3, true], ['color', Uint8Array, 3, true], ['part', Uint8Array, 1]];
  GEO.indexed = true;
  const mesh = (name, cast) => () => Object.assign(new THREE.Mesh(undefined, detailMat), { name, castShadow: cast, receiveShadow: true, frustumCulled: false, matrixAutoUpdate: false });
  const near = ringBuffer(mesh('street near', true), GEO), far = ringBuffer(mesh('street far', false), GEO);
  const wireMat = new THREE.LineBasicMaterial({ color: 0x0b0c0d, transparent: true, depthWrite: false, name: 'street-wires' });
  const wireU = { uReach: { value: 220 } };
  wireMat.onBeforeCompile = (s) => { // thin lines fade out with distance instead of turning into a grey film
    s.uniforms.uReach = wireU.uReach;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uReach;\nvarying float vWire;').replace('#include <fog_vertex>', '#include <fog_vertex>\n  vWire = 1.0 - smoothstep( uReach * 0.45, uReach, length( mvPosition.xyz ) );');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWire;').replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.a *= vWire * 0.85;');
  };
  wireMat.customProgramCacheKey = () => 'street-wires';
  const wireBuf = ringBuffer(() => Object.assign(new THREE.LineSegments(undefined, wireMat), { name: 'street wires', frustumCulled: false, matrixAutoUpdate: false }), [['position', Float32Array, 3]]);
  const fogU = () => THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  const poolU = { ...fogU(), uNight: { value: 0 }, uReach: { value: 320 } };
  const poolMat = new THREE.ShaderMaterial({ name: 'street-pools', uniforms: poolU, vertexShader: POOL_VERT, fragmentShader: POOL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, toneMapped: false });
  const PGEO = [['position', Float32Array, 3], ['uv', Int8Array, 2], ['tint', Uint8Array, 3, true]];
  PGEO.indexed = true;
  const poolBuf = ringBuffer(() => Object.assign(new THREE.Mesh(undefined, poolMat), { name: 'street light pools', frustumCulled: false, matrixAutoUpdate: false, renderOrder: 2 }), PGEO);
  // the glow sprites: every lamp of the city in one static buffer
  const glowU = { ...fogU(), uNight: { value: 0 }, uReach: { value: 3500 }, uPx: { value: 400 }, uMin: { value: 3.5 }, uMax: { value: 90 } };
  const glowMat = new THREE.ShaderMaterial({ name: 'street-glow', uniforms: glowU, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, toneMapped: false });
  const glowGeo = new THREE.BufferGeometry();
  {
    const p = new Float32Array(nHeads * 3), tint = new Uint8Array(nHeads * 3), size = new Float32Array(nHeads);
    for (let i = 0; i < nHeads; i++) {
      const L = LAMPS[headKind[i]], c = LENS[L.lens];
      p[i * 3] = H[i * 5]; p[i * 3 + 1] = H[i * 5 + 1] - (headKind[i] === 'park' ? 0 : 0.06); p[i * 3 + 2] = H[i * 5 + 2];
      tint[i * 3] = c[0] * 255; tint[i * 3 + 1] = c[1] * 255; tint[i * 3 + 2] = c[2] * 255; size[i] = L.glow;
    }
    glowGeo.setAttribute('position', new THREE.BufferAttribute(p, 3)); glowGeo.setAttribute('tint', new THREE.BufferAttribute(tint, 3, true)); glowGeo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    glowGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
  }
  const glow = Object.assign(new THREE.Points(glowGeo, glowMat), { name: 'street lamp glow', frustumCulled: false, matrixAutoUpdate: false, renderOrder: 3, visible: false });
  const size2 = new THREE.Vector2();
  glow.onBeforeRender = (renderer) => { // the target being drawn (the screen, the river mirror) sets the pixel scale
    const h = renderer.getRenderTarget()?.height ?? renderer.getDrawingBufferSize(size2).y;
    glowU.uPx.value = h / 2; glowU.uMin.value = 3.5 * h / 900; glowU.uMax.value = 90 * h / 900;
  };
  // the AO pass draws transparent objects a second time to keep its shading off them: not worth a draw call each here
  for (const o of [wireBuf.obj, poolBuf.obj, glow]) o.userData.treatAsOpaque = true;
  root.add(near.obj, far.obj, wireBuf.obj, poolBuf.obj, glow);
  scene.add(root);

  // ---- the sites' say, a cell at a time
  const checked = new Set();
  let checkMs = 0, gridFresh = false;
  function drop(i, why) {
    alive[i] = 0; dropped[why]++;
    if (P.solid[i] >= 0) solids.disable(P.solid[i]);
    for (const w of [P.w0[i], P.w1[i]]) if (w >= 0) for (let k = 0; k < (P.kind[i] === 1 ? 4 : 1); k++) WR[(w + k) * 7 + 6] = -1;
    const hs = headsOf.get(i);
    if (hs) { const a = glowGeo.attributes.size; for (const h of hs) a.array[h] = 0; a.needsUpdate = true; }
  }
  // inside a static solid that is not a pole of ours or a tree trunk (the collision world is complete by the first check)
  const inSolid = solids?.solidAt ? (x, y, z) => { const id = solids.solidAt(x, y, z); if (id < 0) return false; const k = solids.kindOf(id); return k !== 'pole' && k !== 'tree'; } : null;
  function check(key) {
    checked.add(key);
    const ids = cellProps.get(key); if (!ids) return;
    if (inSolid && !gridFresh) { solids.topAt(0, 0); gridFresh = true; } // a query that rebuilds the grid if solids were added since
    const t = performance.now();
    for (const i of ids) {
      const x = PX[i], z = PZ[i];
      let why = null;
      for (const f of clear) if (f(x, z)) { why = 'site'; break; }
      if (!why) for (const f of decks) if (f(x, z) != null) { why = 'deck'; break; }
      // a pole or a lamp head inside a solid the building raster does not know (a hand-built site's walls): gone too
      if (!why && P.kind[i] < 2 && inSolid) {
        const c = Math.cos(PR[i]), sn = Math.sin(PR[i]);
        if (inSolid(x + c * 0.5, PY[i] + 1.5, z - sn * 0.5)) why = 'solid';
        else for (const h of headsOf.get(i) ?? []) if (inSolid(H[h * 5], H[h * 5 + 1], H[h * 5 + 2])) { why = 'solid'; break; }
      }
      if (why) drop(i, why);
    }
    checkMs += performance.now() - t;
  }

  // ---- a cell's arrays, made on first use
  const cache = [new Map(), new Map()], poolCache = new Map(), wireCache = new Map();
  function cellGeo(key, lod) {
    let g = cache[lod].get(key);
    if (g !== undefined) return g;
    const ids = (cellProps.get(key) ?? []).filter((i) => alive[i] && TPL[PT[i]][lod]);
    let nv = 0, ni = 0;
    for (const i of ids) { const T = TPL[PT[i]][lod]; nv += T.n; ni += T.idx.length; }
    if (!nv) { cache[lod].set(key, null); return null; }
    g = { n: nv, position: new Float32Array(nv * 3), normal: new Int8Array(nv * 3), color: new Uint8Array(nv * 3), part: new Uint8Array(nv), idx: new Uint32Array(ni) };
    let v = 0, k = 0;
    for (const i of ids) {
      const T = TPL[PT[i]][lod], x = PX[i], y = PY[i], z = PZ[i], c = Math.cos(PR[i]), s = Math.sin(PR[i]), Tp = T.pos, Tn = T.nrm, gp = g.position, gn = g.normal;
      for (let a = 0, o = v * 3; a < T.n * 3; a += 3, o += 3) { // local +x -> (cos, -sin), +z -> (sin, cos)
        const lx = Tp[a], lz = Tp[a + 2], nx = Tn[a], nz = Tn[a + 2];
        gp[o] = x + lx * c + lz * s; gp[o + 1] = y + Tp[a + 1]; gp[o + 2] = z - lx * s + lz * c;
        gn[o] = nx * c + nz * s; gn[o + 1] = Tn[a + 1]; gn[o + 2] = -nx * s + nz * c;
      }
      g.color.set(T.col, v * 3); g.part.set(T.part, v);
      for (let a = 0; a < T.idx.length; a++) g.idx[k + a] = T.idx[a] + v;
      v += T.n; k += T.idx.length;
    }
    cache[lod].set(key, g);
    return g;
  }
  const QUAD = [-1, -1, 1, -1, 1, 1, -1, 1];
  function cellPools(key) { // a soft patch of light under every head: a rectangle longer along the road, laid on the slope
    let g = poolCache.get(key);
    if (g !== undefined) return g;
    const ids = (cellHeads.get(key) ?? []).filter((h) => alive[H[h * 5 + 4]]), n = ids.length;
    if (!n) { poolCache.set(key, null); return null; }
    g = { n: n * 4, position: new Float32Array(n * 12), uv: new Int8Array(n * 8), tint: new Uint8Array(n * 12), idx: new Uint32Array(n * 6) };
    ids.forEach((h, q) => {
      const L = LAMPS[headKind[h]], x = H[h * 5], z = H[h * 5 + 2], ry = H[h * 5 + 3], c = Math.cos(ry), s = Math.sin(ry), [ra, rb] = L.pool, col = LENS[L.lens];
      // the ground's slope from four samples; the patch floats over the highest of them, clear of kerbs and lawns
      const e = 0.6, hc = heightAt(x, z), hx1 = heightAt(x + c * ra * e, z - s * ra * e), hx0 = heightAt(x - c * ra * e, z + s * ra * e), hz1 = heightAt(x + s * rb * e, z + c * rb * e), hz0 = heightAt(x - s * rb * e, z - c * rb * e);
      const gx = Math.max(-0.3, Math.min(0.3, (hx1 - hx0) / (2 * ra * e))), gz = Math.max(-0.3, Math.min(0.3, (hz1 - hz0) / (2 * rb * e)));
      const y0 = Math.max(hc, hx1 - gx * ra * e, hx0 + gx * ra * e, hz1 - gz * rb * e, hz0 + gz * rb * e) + 0.45;
      for (let k = 0; k < 4; k++) {
        const u = QUAD[k * 2], w = QUAD[k * 2 + 1], o = (q * 4 + k) * 3;
        g.position[o] = x + c * ra * u + s * rb * w; g.position[o + 1] = y0 + gx * ra * u + gz * rb * w; g.position[o + 2] = z - s * ra * u + c * rb * w;
        g.uv[(q * 4 + k) * 2] = u; g.uv[(q * 4 + k) * 2 + 1] = w;
        g.tint[o] = col[0] * 255; g.tint[o + 1] = col[1] * 255; g.tint[o + 2] = col[2] * 255;
      }
      g.idx.set([q * 4, q * 4 + 2, q * 4 + 1, q * 4, q * 4 + 3, q * 4 + 2], q * 6);
    });
    poolCache.set(key, g);
    return g;
  }
  function cellWire(key) { // a hanging wire is four straight pieces on a parabola, a taut one a single piece
    let g = wireCache.get(key);
    if (g !== undefined) return g;
    const ids = (cellWires.get(key) ?? []).filter((i) => WR[i * 7 + 6] >= 0);
    if (!ids.length) { wireCache.set(key, null); return null; }
    let n = 0; for (const i of ids) n += WR[i * 7 + 6] > 0 ? 8 : 2;
    const p = new Float32Array(n * 3); let o = 0;
    for (const i of ids) {
      const a = i * 7, sag = WR[a + 6], parts = sag > 0 ? 4 : 1;
      for (let k = 0; k < parts; k++) for (const t of [k / parts, (k + 1) / parts]) {
        p[o++] = WR[a] + (WR[a + 3] - WR[a]) * t; p[o++] = WR[a + 1] + (WR[a + 4] - WR[a + 1]) * t - 4 * sag * t * (1 - t); p[o++] = WR[a + 2] + (WR[a + 5] - WR[a + 2]) * t;
      }
    }
    g = { n, position: p };
    wireCache.set(key, g);
    return g;
  }

  // ---- streaming
  const DEF = { near: 120, far: 560, wires: 220, pools: 320, glow: 3500 }, detail = { ...DEF };
  let ci = NaN, cj = NaN, dirty = true, refreshes = 0;
  function refresh() {
    // the sites first: every cell that may be drawn, hold a wire's far pole or be parked on gets their say
    const rk = Math.ceil(Math.max(CHECK_R, detail.far + 100) / CELL);
    for (let j = -rk; j <= rk; j++) for (let i = -rk; i <= rk; i++) { const key = ckey(ci + i, cj + j); if (!checked.has(key) && Math.hypot(i, j) <= rk) check(key); }
    const lists = [[], [], [], []], rc = Math.ceil(Math.max(detail.far, detail.wires, detail.pools) / CELL) + 1;
    for (let j = -rc; j <= rc; j++) for (let i = -rc; i <= rc; i++) {
      const d = Math.hypot(i, j) * CELL, key = ckey(ci + i, cj + j);
      // the wires and the pools fade by their real distance (the shaders), so a cell joins when any of it can be in reach
      const dn = Math.hypot(Math.max(0, Math.abs(i) - 1), Math.max(0, Math.abs(j) - 1)) * CELL;
      if (d <= detail.near) { const g = cellGeo(key, 0); if (g) lists[0].push(g); }
      else if (d <= detail.far) { const g = cellGeo(key, 1); if (g) lists[1].push(g); }
      if (dn <= detail.wires) { const g = cellWire(key); if (g) lists[2].push(g); }
      if (detail.pools > 0 && dn <= detail.pools) { const g = cellPools(key); if (g) lists[3].push(g); }
    }
    near.fill(lists[0]); far.fill(lists[1]); wireBuf.fill(lists[2]); poolBuf.fill(lists[3]);
    refreshes++;
    // the caches hold what the camera has passed; past a couple of thousand cells they start over
    for (const m of [cache[0], cache[1], poolCache, wireCache]) if (m.size > 2500) m.clear();
  }
  function update(dt, camera) {
    const p = camera?.position; if (!p) return;
    const i = Math.floor(p.x / CELL), j = Math.floor(p.z / CELL);
    if (dirty || i !== ci || j !== cj) { ci = i; cj = j; dirty = false; refresh(); }
    const n = nightFactor(), on = n > 0.004;
    poolU.uNight.value = 0.19 * n; glowU.uNight.value = 1.5 * n;
    glow.visible = on && detail.glow > 0; poolBuf.obj.visible = on && detail.pools > 0 && poolBuf.verts > 0;
  }
  const ms = Math.round(performance.now() - t0);
  console.log(`[cherkasy] street furniture: ${counts.lamps} lamps, ${counts.poles} utility poles (${counts.poleLamps} with a lamp), ${nWires} wires, ${counts.shelters} shelters, ${counts.stops} stop signs, ${counts.cross} crossing signs, ${counts.benches} benches, ${counts.bins} bins, ${counts.containers} container sites; ${nSolids} solids in ${ms} ms`);
  return {
    root, lampCount: nHeads, update, view: (camera) => update(0, camera),
    setDetail(d = {}) {
      Object.assign(detail, DEF, d);
      wireU.uReach.value = Math.max(1, detail.wires); poolU.uReach.value = Math.max(1, detail.pools); glowU.uReach.value = Math.max(1, detail.glow);
      dirty = true;
    },
    checkAll() { for (const key of cellProps.keys()) if (!checked.has(key)) check(key); for (const m of [cache[0], cache[1], poolCache, wireCache]) m.clear(); dirty = true; },
    props: (kind = null) => { const out = []; for (let i = 0; i < N; i++) if (!kind || KIND[P.kind[i]] === kind) out.push({ x: PX[i], y: PY[i], z: PZ[i], ry: PR[i], kind: KIND[P.kind[i]], alive: !!alive[i] }); return out; },
    stats: () => ({ props: { ...counts, heads: nHeads, wires: nWires }, solids: nSolids, dropped: { ...dropped }, checked: checked.size, ms, checkMs: +checkMs.toFixed(1), cells: cellProps.size, refreshes,
      drawn: { near: near.count, far: far.count, wires: wireBuf.verts / 2, pools: poolBuf.count, glow: glow.visible ? nHeads : 0 }, detail: { ...detail } }),
  };
}
