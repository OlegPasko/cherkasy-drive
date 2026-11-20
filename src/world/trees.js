// Trees: procedural low-poly species, instanced with distance LODs, per-tree tint / scale / pose, breakable items.
// Under them the shrub layer (nature/shrubs.js): bushes that are scenery only.
//
//   buildTrees({ scene, T?, spots, shrubs?, plus = true, parkPaths?, noPark?, maxScale = 1, shadows = true, heightAt?,
//                floorY? }) -> trees
//     floorY: the lowest height a tree shadow can fall on (default: 5 m under the lowest tree base)
//     plus: false -> the trees as they were before the greenery upgrade (the ?notreeplus A/B): the old geometry
//       (nature/treegeo_legacy.js), the old shader, no limewash, no shrubs
//     shrubs: { data: Float32Array of nature/shrubs.js records, kinds: [name of SHRUBS, ...] } | null; they can also
//       come later, trees.setShrubs(shrubs | null) (the city lays them out after the load)
//     spots: [{ x, z, y?, kind, sc | s, pal?, s3 | scale3?, ry?, rx?, rz?, hedge?, variant?, wash? }]
//       wash: a limewashed trunk foot (the shader paints it, to ~1.15 m)
//       kind: 'street' | 'park' | 'elm' | 'small' | 'conifer' | 'hedge' (anything else -> 'street')
//       sc: overall scale (sizes below are at 1), s3: [sx, sy, sz] shape scale; hedge: s3 is its [length, height, depth]
//       pal: array of palette entries, one is picked per tree; an entry is a pair of linear-RGB crown albedos [A, B]
//       variant: force a species shape (see RECIPES in nature/treegeo.js), else picked stably from kind / palette / hash
//     Look (plus): the shader gives every tree its own shape from one mesh per variant (a squash across a random
//     axis, a twist, a crown sweep, a height stretch, all weighted by aLeaf.z so the trunk foot stays on its
//     collider) and flecks leaves and bark from the local position. The shadow pass draws the same shapes
//     (depthMaterial), without the wind.
//     Only the given spots are rendered (parkPaths / noPark are accepted for the legacy call and ignored).
//   trees.street | park | elm | small | conifer | hedge : item arrays. Item fields (x, y, z, s, scale3, ry, rx, rz)
//     are live: assigning one marks the tree dirty and the next update / pool.update re-poses it at every LOD.
//     Pose = translate(x, y, z) * rotateY(ry) * rotateX(rx) * rotateZ(rz) * scale(s * scale3); rx > 0 tips the top
//     toward local +z, i.e. toward (sin ry, cos ry). Also: hedge (bool), kind, variant, broken (flag for blockers),
//     extra: { aTintA: [r,g,b], aTintB: [r,g,b], aBark: [id, r, g, b] (bark = BARK_REF * rgb) }.
//     Mutating scale3 in place is not seen: reassign it or call trees.touch(item).
//   trees.pools: [{ kind, items, update(camPos, force) }] one stable handle per kind; pool.items === trees[kind].
//   trees.update(dt, camPos?, camera?) per frame: wind time + LOD repacking only after the camera moved a few metres.
//     With the render camera given, trees that cannot reach the image are left out (see "view culling" below).
//   trees.addSolids(sink) -> n: one trunk cylinder per non-hedge tree, record { x, z, y0, y1, r, kind, item },
//     delivered as sink(rec) | sink.addCylinder(rec) | sink.cylinder(x, y0, z, r, h, 'tree').
//   trees.trunkOf(item) -> the same record; trees.blockers() -> records of unbroken trees (zip-point tree blockers);
//   trees.touch(item); trees.setWind(dirX, dirZ, strength); trees.stats(); trees.dispose(); trees.group; trees.palettes.
//     stats(): near / mid / far count the rows camera passes draw; casters = near + mid rows the shadow pass draws.
//   trees.setCulling(on = true): view culling on / off (A/B checks; on by default).
//   trees.setDetail({ nearOut?, midOut?, farOut?, shadow?, shrubNear?, shrubOut?, shrubShadow? }) the graphics
//     quality's LOD bands (metres, as LOD below; a missing key = the default) -> fades and the next repack follow at
//     once; trees.detail reads them. Draw only: items, trunks and collision never change.
//     shrubNear / shrubOut: [from, to] fade bands of the detailed bushes and of the whole layer; shrubShadow: the
//     near bushes cast shadows.
//   trees.setShrubs(shrubs | null, opts?): replace the shrub layer; stats().shrubs: its { items, near, far, drawCalls, ... }.
//   trees.shrubJob(shrubs | null, { drop?, fadeIn = 0 }?) -> generator: the same in small steps (run it to its end,
//     a few steps a frame). drop(x, z, width, taper): the layer's own late filter (nature/shrubs.js); fadeIn: seconds over
//     which the new layer's bushes dither in, each from its own moment (their shadows grow with them), driven by
//     trees.update's dt – 0: they are there at once. The old layer is replaced in the step the new one is ready.
//   trees.shrubSpots() -> Float32Array [x, z, width, taper, ...] | null, trees.shrubCheckAll(): the layer's spots() / checkAll()
// LODs: near detail < ~80 m, mid (simplified, same layout) to ~320 m, one shared far crown per round / cone shape to
// 1.5 km; dithered cross-fades between them. Near + mid trees within 160 m cast shadows. Repacking is CPU work only
// when the camera moved 5 m (near / mid) or 30 m (far), or a tree changed.
// One mid pool per variant holds casters and non-casters: rows are [casters in view | shadow-only | the rest in
// view], the camera pass draws them all, the shadow pass the first two groups.
// View culling: a pack leaves out the trees in a wedge behind the camera (conservative crown bounds, padded by the
// travel allowed before the next repack), and repacks as soon as the view's azimuth range (mirrored river camera
// included: its wider fov) leaves the kept range. Near / mid shadow casters stay in whenever their shadow, drawn out
// away from the light as far as their height (+ the drop to the lowest tree base) allows, can reach the kept range;
// such shadow-only instances sit at the end of a pool and are drawn by the shadow pass only (count per pass). The
// light direction is the active daylight's (render/daylight.js: this frame's, the SunLight is aimed only after the
// world update), else the scene's shadowed light. A culling-only repack keeps the LOD centre of the last move, so
// LOD and caster bands switch exactly as without culling; a pool that would overflow repacks without culling. The
// dithered fades depend on distance alone, so a re-included tree shows no fade.
// Exports: buildTrees, TREE_PALETTES, PARK_GREENS, PARK_PINE, PAL, BARK_REF, SHRUBS, hedgeSpots.
import { BufferGeometry, DynamicDrawUsage, Euler, Group, InstancedInterleavedBuffer, InstancedMesh, InterleavedBufferAttribute, Matrix4, MeshDepthMaterial, MeshStandardMaterial, Quaternion, RGBADepthPacking, Sphere, Vector3, Vector4 } from 'three';
import { buildTreeGeometries, buildShrubGeometries, RECIPES } from './nature/treegeo.js';
import { buildTreeGeometries as buildLegacyGeometries, RECIPES as LEGACY_RECIPES } from './nature/treegeo_legacy.js';
import { createShrubLayer, shrubRecords } from './nature/shrubs.js';
import { getDaylight } from '../render/daylight.js';

// ---------------------------------------------------------------------------------------------------------- palettes
// linear-RGB crown albedos [darker/inner A, sunlit B]
export const PARK_GREENS = [
  [[0.034, 0.076, 0.014], [0.1, 0.19, 0.03]],
  [[0.028, 0.066, 0.018], [0.085, 0.165, 0.04]],
  [[0.045, 0.085, 0.012], [0.13, 0.21, 0.03]],
  [[0.03, 0.07, 0.02], [0.075, 0.15, 0.035]],
];
export const PARK_PINE = [
  [[0.018, 0.042, 0.022], [0.04, 0.085, 0.042]],
  [[0.02, 0.046, 0.02], [0.05, 0.09, 0.035]],
];
export const PAL = [ // accents: fresh yellow-green, deep green, warm olive (a restrained early-autumn note)
  [[0.06, 0.1, 0.015], [0.17, 0.25, 0.035]],
  [[0.022, 0.055, 0.012], [0.06, 0.13, 0.025]],
  [[0.07, 0.08, 0.015], [0.2, 0.19, 0.035]],
];
export const TREE_PALETTES = {
  broadleaf: PARK_GREENS, evergreen: PARK_PINE, accents: PAL,
  street: [PARK_GREENS[0], PARK_GREENS[2], PAL[0]],
  small: [[[0.05, 0.095, 0.016], [0.15, 0.24, 0.04]], [[0.04, 0.085, 0.02], [0.12, 0.2, 0.045]]],
  blueSpruce: [PARK_PINE[0].map(c => [c[0] * 0.8, c[1] * 0.95, c[2] * 1.25])],
  hedge: [[[0.022, 0.06, 0.014], [0.07, 0.14, 0.03]]],
};
export const BARK_REF = [0.12, 0.085, 0.06];
// Shrub kinds of the shrub layer: A leaf albedo, B the flecks (fresh tips, or flowers), taper 0 bush .. 1 cone.
export const SHRUBS = {
  bush:    { A: [0.032, 0.078, 0.016], B: [0.1, 0.19, 0.035], taper: 0 },      // privet, spirea out of bloom, jasmine
  lilac:   { A: [0.024, 0.06, 0.02], B: [0.065, 0.135, 0.04], taper: 0 },      // tall, dark, heart leaves
  olive:   { A: [0.045, 0.07, 0.022], B: [0.13, 0.16, 0.05], taper: 0 },       // dusty roadside scrub
  bloom:   { A: [0.03, 0.072, 0.018], B: [0.62, 0.6, 0.54], taper: 0 },        // white: hydrangea, spirea
  rose:    { A: [0.026, 0.062, 0.02], B: [0.5, 0.035, 0.06], taper: 0 },
  pink:    { A: [0.03, 0.07, 0.02], B: [0.6, 0.2, 0.34], taper: 0 },           // hibiscus, roses, spirea japonica
  yellow:  { A: [0.034, 0.075, 0.018], B: [0.65, 0.5, 0.06], taper: 0 },
  thuja:   { A: [0.02, 0.058, 0.022], B: [0.055, 0.12, 0.04], taper: 1 },
  juniper: { A: [0.022, 0.052, 0.036], B: [0.055, 0.105, 0.075], taper: 0.3 },
};

// split a hedge line into blocks of <= 3.5 m (hedge items are boxes; long ones would stretch the lumps)
export function hedgeSpots(ax, az, bx, bz, { y = 0, h = 1.2, w = 0.9, heightAt = null } = {}) {
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 3.5)), ry = Math.atan2(bz - az, bx - ax), out = [];
  for (let i = 0; i < n; ++i) { const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; out.push({ x, z, y: heightAt ? heightAt(x, z) + y : y, kind: 'hedge', sc: 1, ry: -ry, s3: [L / n + 0.15, h, w] }); }
  return out;
}

// ------------------------------------------------------------------------------------------------------ tunables
const LOD = {
  nearOut: [70, 85],      // near detail fades out (dithered) over this band, the mid LOD fades in over the same band
  midOut: [300, 340],     // mid -> far
  farOut: [1350, 1500],   // far trees fade away
  shadow: 160,            // mid trees nearer than this still cast shadows
  moveNear: 5, moveFar: 30, // camera travel that triggers a near/mid resp. far repack
  shrubNear: [26, 34],    // shrubs: the detailed bush fades to the plain one over this band; only the detailed cast
  shrubOut: [130, 160],   // shrubs fade away
  shrubShadow: true,
};
const DEG = Math.PI / 180;
const CULL = {
  keepMin: 95 * DEG,       // the kept half-angle never drops below this (the culled wedge stays convex)
  turnNear: 30 * DEG, turnFar: 45 * DEG, // turn allowed before a repack (far packs are the costly ones)
  fovPad: 4,               // deg added to the (reflection-widened) vertical fov
  sunTol: 1 * DEG,         // least slack on the light direction in the shadow test (grows while the light moves)
};
const CELL = 48;
const KINDS = ['street', 'park', 'elm', 'small', 'conifer', 'hedge'];
const DEFAULT_PAL = { street: TREE_PALETTES.street, park: PARK_GREENS, elm: PARK_GREENS, small: TREE_PALETTES.small, conifer: PARK_PINE, hedge: TREE_PALETTES.hedge };
const BASE_BUDGET = 40000;

const hash2 = (x, z, k) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };

function pickVariant(kind, sp, pal, h, RC) {
  if (sp.variant && RC[sp.variant]) return sp.variant;
  const s3 = sp.s3 ?? sp.scale3, e = pal[0], bg = (e[0][2] + e[1][2]) / Math.max(1e-4, e[0][1] + e[1][1]);
  switch (kind) {
    case 'hedge': return 'hedge';
    case 'park': return h < 0.45 ? 'maple' : h < 0.87 ? 'oak' : 'birch';
    case 'elm': return 'elm';
    case 'small': return (sp.sc ?? sp.s ?? 1) < 0.62 || h < 0.35 ? 'sapling' : 'fruit';
    case 'conifer':
      if (bg < 0.33) return 'poplar';                    // a conifer spot with a broadleaf palette: Lombardy poplar
      if (bg > 0.6 || (s3 && s3[0] < 0.6)) return 'spruce'; // blue spruce, thuja
      return h < 0.6 ? 'pine' : 'spruce';
    default: return h < 0.55 ? 'linden' : 'chestnut';
  }
}

// ---------------------------------------------------------------------------------------------------------- items
const LIVE = ['x', 'y', 'z', 's', 'scale3', 'ry', 'rx', 'rz'];
class TreeItem {}
for (const k of LIVE) Object.defineProperty(TreeItem.prototype, k, {
  enumerable: true,
  get() { return this['_' + k]; },
  set(v) { if (v !== this['_' + k]) { this['_' + k] = v; this._dirty?.add(this); } },
});

// ---------------------------------------------------------------------------------------------------------- shader
const U = { uTime: { value: 0 }, uWind: { value: new Vector3(0.8, 0.6, 1) }, uNight: { value: 0 } }; // uNight: how dark it is (daylight.js state.night)
// mode: 'N' near / mid tree, 'F' far tree, 'S' shrub. plus: the greenery upgrade's look (off: the picture before it).
//   Per tree, keyed by its phase and weighted by aLeaf.z (0 at the trunk foot): a squash across a random axis, a
//   twist, a sweep of the crown and a stretch, so a row of one species is not one stamp. In the fragment: leaf
//   speckle and bark flakes from the local position (they stick to the tree and fade with distance), and the
//   limewashed trunk foot of the instances whose bark slot carries +2. A hedge (bark slot < 0) keeps its box.
//   Shrubs: aTintB.w is the taper (0 bush .. 1 cone); round flecks of tint B, denser where aLeaf.y is high.
// The shape code is shared with the shadow pass (depthMaterial), so a shadow fits what casts it.
const WARP = `float wz = aLeaf.z * step(0.0, aTintB.w), pa = aTintA.w * 7.0;
vec2 ax = vec2(cos(pa), sin(pa));
transformed.xz += ax * (dot(transformed.xz, ax) * 0.26 * sin(aTintA.w * 13.0) * min(1.0, wz * 1.6));
float tw = 0.55 * sin(aTintA.w * 5.3) * wz, tc = cos(tw), ts = sin(tw);
transformed.xz = vec2(tc * transformed.x - ts * transformed.z, ts * transformed.x + tc * transformed.z);
transformed.xz += vec2(cos(aTintA.w * 3.1), sin(aTintA.w * 3.1)) * (wz * wz * 0.6);
transformed.y *= 1.0 + 0.1 * sin(aTintA.w * 9.7) * wz;`;
const TAPER = `transformed.xz *= mix(1.0, 1.42 * (1.0 - clamp(position.y, 0.0, 1.0)) + 0.06, aTintB.w);`;
// a shrub layer's arrival (uGrow 0 -> 1): each bush has its own moment, 0 before it and 1 once it is in
const GROW = 'clamp(uGrow * 1.6 - 0.6 * fract(aTintA.w * 0.618), 0.0, 1.0)';
function depthMaterial(shrub, uGrow = null) {
  const m = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    if (shrub) sh.uniforms.uGrow = uGrow ?? { value: 1 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aLeaf; attribute vec4 aTintA; attribute vec4 aTintB;${shrub ? ' uniform float uGrow;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
${shrub ? `${TAPER}
transformed *= ${GROW};` : WARP}`); // (the shadow grows from the bush's foot while the bush dithers in)
  };
  m.customProgramCacheKey = () => 'tree-depth' + (shrub ? 'S' : '');
  return m;
}
function treeMaterial(fade, mode, plus = true, uGrow = null) {
  const far = mode === 'F', shrub = mode === 'S';
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  const uFade = { value: new Vector4(...fade) };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uFade });
    if (shrub) sh.uniforms.uGrow = uGrow ?? { value: 1 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aLeaf; attribute vec4 aTintA; attribute vec4 aTintB;
uniform float uTime; uniform vec3 uWind; uniform vec4 uFade;${shrub ? ' uniform float uGrow;' : ''}
varying float vFadeIn; varying float vFadeOut;
${plus ? 'varying vec3 vLp; varying vec3 vLk;' : ''}${shrub ? ' varying vec4 vFl;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vec3 iOrg = vec3(instanceMatrix[3]);
${far ? `if (aLeaf.x > 0.5) transformed.y = aTintA.w + transformed.y * (1.0 - aTintA.w); else transformed.y *= aTintA.w;` : `
float ph = aTintA.w + dot(iOrg.xz, vec2(0.071, 0.053));
${shrub ? `${TAPER}
float wk = 0.25;` : plus ? `${WARP}
float wk = 1.0;` : 'float wk = 1.0;'}
float g = sin(uTime * 1.1 + ph) * 0.6 + sin(uTime * 2.3 + ph * 1.7) * 0.3;
transformed.xz += uWind.xy * (g * aLeaf.z * uWind.z * 0.1 * wk);
transformed += aLeaf.x * aLeaf.z * uWind.z * 0.03 * wk * vec3(sin(uTime * 4.3 + position.y * 2.1 + ph), sin(uTime * 3.7 + position.x * 1.9), cos(uTime * 4.1 + position.z * 1.7));`}
float dCam = distance(iOrg, cameraPosition);
vFadeIn = smoothstep(uFade.x, uFade.y, dCam); vFadeOut = 1.0 - smoothstep(uFade.z, uFade.w, dCam);${shrub ? `
vFadeOut *= ${GROW};` : ''}
${plus ? `vec3 iScl = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
vLp = position * iScl + aTintA.w * 3.0;
vLk = vec3(aLeaf.x, ${far || shrub ? '1e3' : 'aTintB.w > 1.9 ? position.y * iScl.y : 1e3'}, 1.0 - smoothstep(${shrub ? '25.0, 90.0' : '70.0, 240.0'}, dCam));` : ''}`)
      .replace('#include <color_vertex>', `#include <color_vertex>
${shrub ? `vColor.rgb = color.rgb * aTintA.rgb * (0.9 + 0.5 * aLeaf.y);
vFl = vec4(aTintB.rgb * (0.5 + 0.7 * color.r), smoothstep(0.2, 0.75, aLeaf.y));`
    : plus ? `float bw = aTintB.w, bm = abs(bw) - 2.0 * step(1.9, bw);
vColor.rgb = mix(color.rgb * bm, color.rgb * mix(aTintA.rgb, aTintB.rgb, aLeaf.y), aLeaf.x);`
      : `vColor.rgb = mix(color.rgb * aTintB.w, color.rgb * mix(aTintA.rgb, aTintB.rgb, aLeaf.y), aLeaf.x);`}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
if (vFadeIn <= 0.0 || vFadeOut <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);`);
    // dithered cross-fade: the in-band of one LOD uses the complement of the out-band of the other -> no holes
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vFadeIn; varying float vFadeOut;
${shrub ? 'varying vec4 vFl; uniform float uNight;' : ''}
${plus ? `varying vec3 vLp; varying vec3 vLk;
float thash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }` : ''}
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a) + 0.03125; }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (vFadeIn < 1.0 || vFadeOut < 1.0) { float th = bayer4(gl_FragCoord.xy); if (vFadeIn < 1.0 - th || vFadeOut <= th) discard; }`);
    if (plus) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
// (the detail fades with distance, vLk.z: beyond it no hash is worked out)
if (vLk.x > 0.5) { // leaves: two skewed cell lattices, small flecks over broad patches
  if (vLk.z > 0.0) {
    float n1 = thash(floor(vec3(dot(vLp, vec3(2.3, 1.0, 0.7)), dot(vLp, vec3(-0.8, 2.4, 0.9)), dot(vLp, vec3(-0.6, -1.0, 2.5)))));
    float n2 = thash(floor(vec3(dot(vLp, vec3(0.8, 0.3, -0.35)), dot(vLp, vec3(-0.2, 0.9, 0.3)), dot(vLp, vec3(0.4, -0.25, 0.85)))));
    diffuseColor.rgb *= 1.0 + ((n1 - 0.5) * 0.4 + (n2 - 0.5) * 0.26) * vLk.z;
  }${shrub ? `
  // flowers / fresh tips: round flecks of the second tint (a skewed lattice of balls cut by the surface), denser up
  // and out; far away they melt into an even mix of the same share
  float hit = 0.0;
  if (vLk.z > 0.0) {
    vec3 fq = vec3(dot(vLp, vec3(7.9, 2.6, 1.7)), dot(vLp, vec3(-2.2, 7.3, 2.9)), dot(vLp, vec3(-1.6, -3.1, 8.2)));
    float fh = thash(floor(fq));
    vec3 ff = fract(fq) - 0.5 - (fract(fh * vec3(17.0, 31.0, 57.0)) - 0.5) * 0.26;
    hit = step(dot(ff, ff), 0.04 + 0.09 * fract(fh * 91.0)) * step(1.0 - vFl.w * 0.95, fh);
  }
  // by day the tone mapping squeezes a white fleck against the leaves; in the dusk nothing does, and a flower 15
  // times brighter than its leaf reads as a lit dot: as it gets dark a fleck keeps its hue but comes down to at
  // most 2.5 times its leaf
  float lf = dot(vFl.rgb, vec3(0.3, 0.6, 0.1)), ll = dot(diffuseColor.rgb, vec3(0.3, 0.6, 0.1));
  vec3 fleck = vFl.rgb * mix(1.0, min(1.0, 2.5 * ll / max(lf, 1e-4)), uNight);
  diffuseColor.rgb = mix(diffuseColor.rgb, fleck, mix(vFl.w * 0.1, hit, vLk.z));` : ''}
} else if (vLk.z > 0.0 || vLk.y < 1.4) { // bark: long flakes; the limewashed foot
  float col = thash(floor(vec3(vLp.x * 12.0, 0.0, vLp.z * 12.0)));
  float n = thash(floor(vec3(vLp.x * 12.0, vLp.y * 1.6 + col * 5.0, vLp.z * 12.0)));
  diffuseColor.rgb *= 1.0 + (n - 0.5) * 0.5 * vLk.z;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.73, 0.68) * (0.86 + 0.28 * n), 1.0 - smoothstep(1.12, 1.2, vLk.y + (col - 0.5) * 0.16));
}`);
  };
  m.customProgramCacheKey = () => 'tree' + mode + (plus ? '+' : '');
  m.userData.uFade = uFade;
  return m;
}

// ------------------------------------------------------------------------------------------------------ pools
// one InstancedMesh per (variant, LOD) or far shape; per-instance: instanceMatrix + interleaved [tintA.rgb, phase|cb,
// tintB.rgb, bark]
function makePool(baseGeo, mat, cap, name, shadow) {
  const g = new BufferGeometry();
  for (const k of Object.keys(baseGeo.attributes)) g.setAttribute(k, baseGeo.attributes[k]);
  g.boundingSphere = new Sphere(new Vector3(), 1e7);
  const mesh = new InstancedMesh(g, mat, cap);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  const misc = new Float32Array(cap * 8), ib = new InstancedInterleavedBuffer(misc, 8).setUsage(DynamicDrawUsage);
  g.setAttribute('aTintA', new InterleavedBufferAttribute(ib, 4, 0));
  g.setAttribute('aTintB', new InterleavedBufferAttribute(ib, 4, 4));
  mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false; mesh.name = name;
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  // camera passes draw rows [0, nc), the shadow pass rows [0, ns); so of them only cast a shadow into the view.
  //   near pool: [in view | shadow only]                              nc = in view, ns = n
  //   mid pool:  [casters in view | shadow only | the rest in view]   nc = n, ns = the first two groups
  // (the mid pool's shadow-only rows reach the camera passes too: they lie outside the view, the GPU clips them)
  const P = { mesh, mat: mesh.instanceMatrix.array, misc, ib, cap, n: 0, nc: 0, ns: 0, so: 0 };
  mesh.onBeforeRender = () => { mesh.count = P.nc; };
  mesh.onBeforeShadow = () => { mesh.count = P.ns; };
  return P;
}
function flush(P) {
  const m = P.mesh; m.count = P.n; m.visible = P.n > 0;
  if (!P.n) return;
  m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, P.n * 16); m.instanceMatrix.needsUpdate = true;
  P.ib.clearUpdateRanges(); P.ib.addUpdateRange(0, P.n * 8); P.ib.needsUpdate = true;
}

// ---------------------------------------------------------------------------------------------------------- build
export function buildTrees({ scene, spots = [], shrubs = null, plus = true, maxScale = 1, shadows = true, heightAt = null, floorY = Infinity } = {}) {
  const t0 = (globalThis.performance ?? Date).now();
  const G = plus ? buildTreeGeometries() : buildLegacyGeometries(), RC = plus ? RECIPES : LEGACY_RECIPES;
  const VN = Object.keys(G.variants), vIndex = Object.fromEntries(VN.map((v, i) => [v, i]));
  const FAR = ['round', 'cone'];
  // conservative extents at scale 1 over every LOD of a variant: horizontal radius, 3D radius, top; leaf sway weight
  const span = (g, sxz = 1, sy = 1, fy = 0) => {
    const p = g.attributes.position.array, L = g.attributes.aLeaf?.array, e = { rh: 0, r3: 0, top: 0, lz: 0 };
    for (let o = 0; o < p.length; o += 3) {
      const h = Math.hypot(p[o], p[o + 2]) * sxz, y = Math.max(Math.abs(p[o + 1]), fy) * sy; // far crowns: y' <= max(|y|, 1)
      e.rh = Math.max(e.rh, h); e.r3 = Math.max(e.r3, Math.hypot(h, y)); e.top = Math.max(e.top, y); if (L) e.lz = Math.max(e.lz, Math.abs(L[o + 2]));
    }
    return e;
  };
  const VB = VN.map((v) => {
    const V = G.variants[v], S = [span(V.near), span(V.mid)];
    if (V.far) S.push(span(G.far[V.far], Math.max(V.fit.hx, V.fit.hz), V.fit.top, 1));
    const e = S.reduce((a, b) => ({ rh: Math.max(a.rh, b.rh), r3: Math.max(a.r3, b.r3), top: Math.max(a.top, b.top), lz: Math.max(a.lz, b.lz) }));
    // the per-tree warp of the shader (treeMaterial): squash 1.26 (the twist keeps the radius) + sweep 0.6, stretch 1.1
    return plus && V.far ? { rh: e.rh * 1.26 + 0.6, r3: e.r3 * 1.26 + 0.6, top: e.top * 1.1, lz: e.lz } : e;
  });
  const leafSway = Math.max(...VB.map((b) => b.lz));
  const dirty = new Set();
  const out = { group: new Group(), palettes: TREE_PALETTES, pools: [], items: [] };
  out.group.name = 'trees';
  for (const k of KINDS) out[k] = [];

  // ---- spots -> items
  const budget = Math.floor(BASE_BUDGET * Math.max(0.1, maxScale));
  let skipped = 0, over = 0;
  const m4 = new Matrix4();
  for (const sp of Array.isArray(spots) ? spots : []) {
    if (!sp || !Number.isFinite(sp.x) || !Number.isFinite(sp.z)) { skipped++; continue; }
    if (out.items.length >= budget) { over++; continue; }
    let kind = sp.hedge ? 'hedge' : KINDS.includes(sp.kind) ? sp.kind : 'street';
    let y = Number.isFinite(sp.y) ? sp.y : heightAt ? heightAt(sp.x, sp.z) : 0;
    if (!Number.isFinite(y)) y = 0;
    const h = hash2(sp.x, sp.z, 1);
    const pal = Array.isArray(sp.pal) && sp.pal.length && Array.isArray(sp.pal[0]?.[0]) ? sp.pal : DEFAULT_PAL[kind];
    const variant = pickVariant(kind, sp, pal, h, RC);
    if (variant === 'hedge') kind = 'hedge';
    const e = pal[Math.floor(hash2(sp.x, sp.z, 2) * pal.length) % pal.length];
    // mild per-tree variation around the supplied colours (brightness + a slight warm/cool shift)
    const br = 0.92 + hash2(sp.x, sp.z, 3) * 0.16, wc = (hash2(sp.x, sp.z, 4) - 0.5) * 0.1;
    const tint = (c) => [c[0] * br * (1 + wc), c[1] * br, c[2] * br * (1 - wc)];
    const bark = RC[variant].bark, bm = 0.85 + hash2(sp.x, sp.z, 5) * 0.3;
    const s = Math.min(6, Math.max(0.05, Number.isFinite(sp.s) ? sp.s : Number.isFinite(sp.sc) ? sp.sc : 1));
    const s3 = sp.s3 ?? sp.scale3;
    const it = new TreeItem();
    Object.assign(it, {
      _x: sp.x, _y: y, _z: sp.z, _s: s, _scale3: Array.isArray(s3) && s3.length === 3 && s3.every(Number.isFinite) ? s3.slice() : null,
      _ry: Number.isFinite(sp.ry) ? sp.ry : hash2(sp.x, sp.z, 6) * Math.PI * 2, _rx: Number.isFinite(sp.rx) ? sp.rx : 0, _rz: Number.isFinite(sp.rz) ? sp.rz : 0,
      kind, variant, hedge: kind === 'hedge', broken: false, wash: !!sp.wash && plus,
      extra: { aTintA: tint(e[0]), aTintB: tint(e[1]), aBark: [vIndex[variant], bark[0] * bm / BARK_REF[0], bark[1] * bm / BARK_REF[1], bark[2] * bm / BARK_REF[2]] },
      _v: vIndex[variant], _far: G.variants[variant].far ? FAR.indexOf(G.variants[variant].far) : -1, _phase: h * 6.283, _bm: bm,
    });
    out[kind].push(it); out.items.push(it);
  }
  const N = out.items.length;

  // ---- spatial cells (CSR, items sorted by cell) and per-item records
  let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
  for (const it of out.items) { bx0 = Math.min(bx0, it._x); bx1 = Math.max(bx1, it._x); bz0 = Math.min(bz0, it._z); bz1 = Math.max(bz1, it._z); }
  if (!N) { bx0 = bz0 = 0; bx1 = bz1 = 1; }
  const gx0 = Math.floor(bx0 / CELL) * CELL, gz0 = Math.floor(bz0 / CELL) * CELL;
  const gnx = Math.floor((bx1 - gx0) / CELL) + 1, gnz = Math.floor((bz1 - gz0) / CELL) + 1;
  const cellOf = (x, z) => Math.min(gnz - 1, Math.max(0, Math.floor((z - gz0) / CELL))) * gnx + Math.min(gnx - 1, Math.max(0, Math.floor((x - gx0) / CELL)));
  const cellStart = new Int32Array(gnx * gnz + 1);
  for (const it of out.items) { it._cell = cellOf(it._x, it._z); cellStart[it._cell + 1]++; }
  for (let c = 0; c < gnx * gnz; ++c) cellStart[c + 1] += cellStart[c];
  const order = new Array(N), fill = cellStart.slice(0, -1), cellY = new Float32Array(gnx * gnz);
  for (const it of out.items) { order[fill[it._cell]++] = it; cellY[it._cell] += it._y; }
  for (let c = 0; c < gnx * gnz; ++c) { const n = cellStart[c + 1] - cellStart[c]; if (n) cellY[c] /= n; }
  // records: rec[i*24] = pose matrix, [16..23] = misc; far records in cell order per far shape for bulk copies
  const rec = new Float32Array(N * 24);
  const farCount = [0, 0], farRange = FAR.map(() => new Int32Array(gnx * gnz * 2));
  for (let i = 0; i < N; ++i) { const it = order[i]; it._i = i; if (it._far >= 0) { const f = it._far, c = it._cell; if (farRange[f][c * 2 + 1] === 0) farRange[f][c * 2] = farCount[f]; it._fi = farCount[f]++; farRange[f][c * 2 + 1] = farCount[f]; } }
  const farRec = FAR.map((_, f) => new Float32Array(farCount[f] * 24));
  // culling extents per record: [horizontal reach from the base, height above the base, largest scale (wind pad)];
  // per cell the largest reach / scale (grow-only), and the lowest base any shadow can fall to
  const ext = new Float32Array(N * 3), cellRh = new Float32Array(gnx * gnz), cellSm = new Float32Array(gnx * gnz);
  let yLow = Number.isFinite(floorY) ? floorY : Infinity;
  const e3 = new Euler(0, 0, 0, 'YXZ'), q = new Quaternion(), vp = new Vector3(), vs = new Vector3(), mf = new Matrix4();
  const write = (it) => {
    const s3 = it._scale3 ?? [1, 1, 1], V = G.variants[it.variant];
    e3.set(it._rx, it._ry, it._rz); q.setFromEuler(e3); vp.set(it._x, it._y, it._z); vs.set(it._s * s3[0], it._s * s3[1], it._s * s3[2]);
    m4.compose(vp, q, vs);
    const o = it._i * 24, A = it.extra.aTintA, B = it.extra.aTintB;
    { // a tipped tree may reach out as far as its full 3D extent
      const b = VB[it._v], ax = Math.abs(vs.x), ay = Math.abs(vs.y), az = Math.abs(vs.z), sm = Math.max(ax, ay, az), x3 = it._i * 3;
      const tip = it._rx !== 0 || it._rz !== 0;
      ext[x3] = tip ? b.r3 * sm : b.rh * Math.max(ax, az); ext[x3 + 1] = tip ? b.r3 * sm : b.top * ay; ext[x3 + 2] = sm;
      // a tree moved off its cell (live x / z) widens the cell's reach by the distance it left the cell
      const c = it._cell, off = Math.max(0, Math.hypot(it._x - gx0 - (c % gnx + 0.5) * CELL, it._z - gz0 - ((c / gnx | 0) + 0.5) * CELL) - CELL * Math.SQRT1_2);
      cellRh[c] = Math.max(cellRh[c], ext[x3] + off); cellSm[c] = Math.max(cellSm[c], sm);
      yLow = Math.min(yLow, it._y - 5);
    }
    m4.toArray(rec, o);
    rec[o + 16] = A[0]; rec[o + 17] = A[1]; rec[o + 18] = A[2]; rec[o + 19] = it._phase;
    rec[o + 20] = B[0]; rec[o + 21] = B[1]; rec[o + 22] = B[2]; rec[o + 23] = it.hedge ? -1 : it._bm + (it.wash ? 2 : 0);
    if (it._far >= 0) {
      mf.makeScale(V.fit.hx, V.fit.top, V.fit.hz).premultiply(m4);
      const F = farRec[it._far], p = it._fi * 24;
      mf.toArray(F, p);
      for (let k = 16; k < 24; ++k) F[p + k] = rec[o + k];
      F[p + 19] = V.fit.cb;
    }
  };
  for (const it of out.items) { write(it); it._dirty = dirty; }

  // ---- pools
  const vCount = new Int32Array(VN.length); for (const it of out.items) vCount[it._v]++;
  const cap = (n, lim) => Math.max(1, Math.min(n, Math.floor(lim * Math.max(1, maxScale))));
  const lod = { ...LOD }; // the live distances (setDetail)
  const matNear = treeMaterial([-2, -1, lod.nearOut[0], lod.nearOut[1]], 'N', plus);
  const matMid = treeMaterial([lod.nearOut[0], lod.nearOut[1], lod.midOut[0], lod.midOut[1]], 'N', plus);
  const matFar = treeMaterial([lod.midOut[0], lod.midOut[1], lod.farOut[0], lod.farOut[1]], 'F', plus);
  const near = [], mid = [], far = [];
  VN.forEach((v, i) => {
    if (!vCount[i]) { near.push(null); mid.push(null); return; }
    near.push(makePool(G.variants[v].near, matNear, cap(vCount[i], 3000), `trees ${v} near`, shadows));
    mid.push(makePool(G.variants[v].mid, matMid, cap(vCount[i], 28000), `trees ${v} mid`, shadows));
  });
  FAR.forEach((f, i) => far.push(farCount[i] ? makePool(G.far[f], matFar, farCount[i], `trees far ${f}`, false) : null));
  const NP = near.filter(Boolean), MP = mid.filter(Boolean), NM = [...NP, ...MP], FP = far.filter(Boolean);
  for (const P of [...NM, ...FP]) out.group.add(P.mesh);
  const matDepth = plus && shadows ? depthMaterial(false) : null; // the warped shapes cast their own shadows
  if (matDepth) for (const P of NM) P.mesh.customDepthMaterial = matDepth;
  // the shrub layer: its own records, cells and two pools (nature/shrubs.js); shrubJob builds it in small steps
  let shrubLayer = null, gone = false, growRate = 0;
  const uGrow = { value: 1 }; // the layer's arrival, 0 -> 1 (GROW)
  const shrubJob = function* (sh, { drop = null, fadeIn = 0 } = {}) {
    if (!sh?.data?.length) { shrubLayer?.dispose(); shrubLayer = null; return; }
    const records = yield* shrubRecords(sh.data, (sh.kinds ?? []).map((k) => SHRUBS[k] ?? SHRUBS.bush));
    yield;
    if (gone) return; // the trees were disposed while the job ran
    const layer = createShrubLayer({
      group: out.group, records, geos: buildShrubGeometries(), shadows, depth: shadows ? depthMaterial(true, uGrow) : null, drop,
      near: LOD.shrubNear, out: LOD.shrubOut, material: (fade) => treeMaterial(fade, 'S', true, uGrow),
    });
    shrubLayer?.dispose(); // the old layer goes in the step the new one is in: no frame without shrubs
    shrubLayer = layer;
    shrubLayer.setDetail({ near: lod.shrubNear, out: lod.shrubOut, shadow: lod.shrubShadow });
    uGrow.value = fadeIn > 0 ? 0 : 1; growRate = fadeIn > 0 ? 1 / fadeIn : 0;
  };
  const setShrubs = (sh, opts) => { for (const job = shrubJob(sh, opts); !job.next().done;); };
  scene?.add?.(out.group);

  // ---- view culling state: the current view's azimuth range and the wedge each pack left out
  const view = { full: true, fc: 0, h: Math.PI };
  const wedge = () => ({ on: false, f: 0, H: Math.PI, n1x: 0, n1z: 0, n2x: 0, n2z: 0, s1: 0, s2: 0 });
  const WN = wedge(), WF = wedge();
  const sun = { light: null, seek: 0, known: false, long: false, tol: 0, need: 0, dir: new Vector3(), last: new Vector3(), now: new Vector3() };
  const qc = new Quaternion(), qi = new Quaternion(), dv = new Vector3();
  let cullOn = true, viewCam = null, cullDirty = true, culledView = 0, shadowOnly = 0;
  const wrapA = (a) => a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
  // azimuth range of the camera frustum, widened to the river reflection's fov (a mirror about a level plane keeps
  // azimuths); a frustum around the vertical sees every azimuth
  function measureView(camera) {
    view.full = true;
    if (!cullOn || !camera?.isPerspectiveCamera) return;
    camera.getWorldQuaternion(qc); qi.copy(qc).invert();
    const fov = Math.min(170, Math.max(camera.fov, Math.min(120, camera.fov * 1.15)) + CULL.fovPad);
    const ty = Math.tan(fov * DEG / 2) / Math.min(1, camera.zoom || 1), tx = ty * Math.max(1e-3, camera.aspect) * 1.02;
    dv.set(0, 1, 0).applyQuaternion(qi);
    if (Math.abs(dv.x) <= tx * Math.abs(dv.z) && Math.abs(dv.y) <= ty * Math.abs(dv.z)) return;
    dv.set(0, 0, -1).applyQuaternion(qc);
    const a0 = Math.atan2(dv.z, dv.x);
    let lo = 0, hi = 0;
    for (let c = 0; c < 4; ++c) {
      dv.set(c & 1 ? tx : -tx, c & 2 ? ty : -ty, -1).applyQuaternion(qc);
      if (Math.hypot(dv.x, dv.z) < 1e-6) return;
      const d = wrapA(Math.atan2(dv.z, dv.x) - a0); lo = Math.min(lo, d); hi = Math.max(hi, d);
    }
    if (hi - lo > Math.PI - 0.02) return;
    view.full = false; view.fc = a0 + (lo + hi) / 2; view.h = (hi - lo) / 2;
  }
  const covers = (W) => !W.on || (!view.full && Math.abs(wrapA(view.fc - W.f)) + view.h <= W.H);
  // the culled region is where both n1.p >= r and n2.p >= r (p relative to the pack position): a wedge behind the
  // kept half-angle H >= 90 deg, so it is convex and a disc / shadow segment is inside it iff its ends are
  function aim(W, turn) {
    W.on = cullOn && !view.full && !!viewCam;
    W.H = W.on ? Math.max(CULL.keepMin, view.h + turn) : Math.PI;
    if (W.H >= Math.PI - 1e-3) { W.on = false; W.H = Math.PI; return; }
    W.f = view.fc;
    const a1 = W.f + W.H + Math.PI / 2, a2 = W.f - W.H - Math.PI / 2;
    W.n1x = Math.cos(a1); W.n1z = Math.sin(a1); W.n2x = Math.cos(a2); W.n2z = Math.sin(a2);
  }
  // the shadow-casting light (the scene's SunLight or shadowed directional light), looked up lazily
  function findLight() {
    if (sun.light?.parent) return sun.light;
    sun.light = null;
    if (frame < sun.seek) return null;
    sun.seek = frame + 120;
    let root = out.group; while (root.parent) root = root.parent;
    root.traverse((o) => { if (!sun.light && o.castShadow && (o.isSunLight || o.isDirectionalLight)) sun.light = o; });
    return sun.light;
  }
  // this frame's direction toward the light -> sun.now; returns how far the light object itself still points off it
  const clamp1 = (v) => Math.max(-1, Math.min(1, v));
  function readLight(L) {
    dv.copy(L.position); if (L.target && !L.isSunLight) dv.sub(L.target.position); dv.normalize();
    const D = getDaylight()?.state?.lightDir;
    if (!D || !(D.lengthSq() > 0)) { sun.now.copy(dv); return 0; }
    sun.now.copy(D).normalize();
    return Math.acos(clamp1(dv.dot(sun.now)));
  }
  // Shadow of a point dropping h metres: offset h * o, o = -dir.xz / dir.y. Any light within sun.tol of the pack's
  // gives an offset within rho * h of it, so all shadow points lie in the hull of the crown disc and a disc of
  // r + h * rho at the tip: culled iff both are in the culled wedge -> n.p + h * (n.o - rho) >= r for both normals.
  function aimSun(W) {
    sun.known = !!sun.light;
    if (!sun.known) return;
    sun.dir.copy(sun.now);
    sun.tol = Math.max(CULL.sunTol, 4 * sun.need);
    const z = Math.acos(clamp1(sun.dir.y)), zt = z + sun.tol;
    sun.long = zt >= 89.5 * DEG; // grazing (or set) light: shadows of any length, keep every caster
    if (sun.long) return;
    const R = Math.tan(z), Rt = Math.tan(zt), hl = Math.hypot(sun.dir.x, sun.dir.z);
    const ox = hl > 1e-9 ? -sun.dir.x / hl * R : 0, oz = hl > 1e-9 ? -sun.dir.z / hl * R : 0;
    const daz = Math.sin(z) > Math.sin(sun.tol) ? Math.asin(Math.sin(sun.tol) / Math.sin(z)) : Math.PI;
    const rho = Rt - R + Rt * daz;
    W.s1 = W.n1x * ox + W.n1z * oz - rho; W.s2 = W.n2x * ox + W.n2z * oz - rho;
  }
  // per frame: track the light; slack for its next step (and for a light object that lags the daylight)
  const sunMoved = () => {
    const L = shadows ? findLight() : null;
    if (!L) return sun.known && WN.on; // the light went
    const gap = readLight(L), step = sun.last.lengthSq() ? Math.acos(clamp1(sun.now.dot(sun.last))) : 0;
    sun.last.copy(sun.now);
    sun.need = 2.5 * step + gap + 0.2 * DEG;
    if (!WN.on) return false;
    if (!sun.known) return true; // the light came
    const tight = Math.max(CULL.sunTol, 4 * sun.need);
    return Math.acos(clamp1(sun.now.dot(sun.dir))) + sun.need > sun.tol || sun.tol > 2 * tight;
  };
  // leaf sway (shader: xz += wind.xy * 0.09 * z * strength, flutter 0.03 * sqrt 3) in object units
  const swayPad = () => { const w = U.uWind.value; return (Math.hypot(w.x, w.y) * 0.09 + 0.052) * Math.abs(w.z) * leafSway + 0.05; };

  // ---- repacking
  let spill = false;
  const copy = (P, src, o) => { if (P.n >= P.cap) { spill = true; return; } const d = P.n * 16, e = P.n * 8; for (let k = 0; k < 16; ++k) P.mat[d + k] = src[o + k]; for (let k = 0; k < 8; ++k) P.misc[e + k] = src[o + 16 + k]; P.n++; };
  const lastN = new Vector3(1e9, 0, 0), lastF = new Vector3(1e9, 0, 0);
  let repacks = 0, lastMs = 0, frame = 0, packedFrame = -1;
  const CR = new Int32Array(4), HD = new Float64Array(2), later = new Int32Array(Math.max(1, N));
  const cellRange = (cx, cz, R) => { CR[0] = Math.max(0, Math.floor((cx - R - gx0) / CELL)); CR[1] = Math.min(gnx - 1, Math.floor((cx + R - gx0) / CELL)); CR[2] = Math.max(0, Math.floor((cz - R - gz0) / CELL)); CR[3] = Math.min(gnz - 1, Math.floor((cz + R - gz0) / CELL)); };
  const hDist = (i, j, x, z) => { const ax = gx0 + i * CELL, az = gz0 + j * CELL; const dx = Math.max(ax - x, 0, x - ax - CELL), dz = Math.max(az - z, 0, z - az - CELL); const fx = Math.max(Math.abs(x - ax), Math.abs(x - ax - CELL)), fz = Math.max(Math.abs(z - az), Math.abs(z - az - CELL)); HD[0] = Math.sqrt(dx * dx + dz * dz); HD[1] = Math.sqrt(fx * fx + fz * fz); };
  const lateM = new Int32Array(Math.max(1, N));
  function packNear(c) {
    for (const P of NM) P.n = P.so = 0;
    spill = false;
    const M = lod.moveNear + 3, R = lod.midOut[1] + M, pad = swayPad(), nIn = lod.nearOut[1] + M, mIn = lod.nearOut[0] - M, sh = shadows ? lod.shadow : -1;
    let nl = 0, nm = 0; culledView = 0;
    cellRange(c.x, c.z, R);
    for (let j = CR[2]; j <= CR[3]; ++j) for (let i = CR[0]; i <= CR[1]; ++i) {
      hDist(i, j, c.x, c.z); if (HD[0] > R) continue;
      const cell = j * gnx + i;
      for (let k = cellStart[cell]; k < cellStart[cell + 1]; ++k) {
        const it = order[k]; if (it.hidden) continue;
        const px = it._x - c.x, py = it._y - c.y, pz = it._z - c.z, d = Math.sqrt(px * px + py * py + pz * pz), o = k * 24;
        const inNear = d < nIn, inMid = d > mIn && d < R;
        if (!inNear && !inMid) continue;
        if (WN.on) {
          const x3 = k * 3, r = ext[x3] + pad * ext[x3 + 2] + M;
          const a = WN.n1x * px + WN.n1z * pz, b = WN.n2x * px + WN.n2z * pz;
          if (a >= r && b >= r) { // out of view; a caster stays while its shadow can reach the view
            culledView++;
            if (!(inNear || d < lod.shadow) || sh < 0) continue;
            if (sun.known && !sun.long) {
              const h = ext[x3 + 1] + Math.max(0, it._y - yLow);
              if (a + h * WN.s1 >= r && b + h * WN.s2 >= r) continue;
            }
            later[nl++] = k; continue;
          }
        }
        if (inNear) copy(near[it._v], rec, o);
        if (inMid) { if (d < sh) copy(mid[it._v], rec, o); else lateM[nm++] = k; }
      }
    }
    for (const P of NP) P.nc = P.n;
    // shadow-only rows go after the visible ones (near) / the visible casters (mid); the other mid rows last
    for (let q2 = 0; q2 < nl; ++q2) {
      const k = later[q2], it = order[k], px = it._x - c.x, py = it._y - c.y, pz = it._z - c.z, d = Math.sqrt(px * px + py * py + pz * pz);
      if (d < nIn) copy(near[it._v], rec, k * 24);
      if (d > mIn && d < sh) { const P = mid[it._v]; if (P.n < P.cap) P.so++; copy(P, rec, k * 24); }
    }
    for (const P of NM) P.ns = P.n;
    for (let q2 = 0; q2 < nm; ++q2) copy(mid[order[lateM[q2]]._v], rec, lateM[q2] * 24);
    for (const P of MP) P.nc = P.n;
    shadowOnly = nl;
    if (spill && WN.on) { WN.on = false; WN.H = Math.PI; packNear(c); return; } // full pool: keep the unculled pick
    for (const P of NM) flush(P);
    lastN.copy(c);
  }
  function packFar(c) {
    for (const P of FP) P.n = 0;
    const M = lod.moveFar + 10, R = lod.farOut[1] + M, pad = swayPad(), half = CELL * 0.5;
    cellRange(c.x, c.z, R);
    for (let j = CR[2]; j <= CR[3]; ++j) for (let i = CR[0]; i <= CR[1]; ++i) {
      hDist(i, j, c.x, c.z); const cell = j * gnx + i;
      if (HD[0] > R || Math.sqrt(HD[1] * HD[1] + (Math.abs(c.y - cellY[cell]) + 30) ** 2) < lod.midOut[0] - M) continue;
      if (WF.on) { // the whole cell (its centre +- half a diagonal, the widest crown in it) behind the camera
        const px = gx0 + i * CELL + half - c.x, pz = gz0 + j * CELL + half - c.z, r = half * Math.SQRT2 + cellRh[cell] + pad * cellSm[cell] + M;
        if (WF.n1x * px + WF.n1z * pz >= r && WF.n2x * px + WF.n2z * pz >= r) continue;
      }
      for (let f = 0; f < FAR.length; ++f) {
        const P = far[f]; if (!P) continue;
        const a = farRange[f][cell * 2], b = farRange[f][cell * 2 + 1]; if (b <= a) continue;
        const n = Math.min(b - a, P.cap - P.n);
        // bulk copy: records are 24 floats, pools want 16 + 8
        for (let k = 0; k < n; ++k) { const o = (a + k) * 24, d = (P.n + k) * 16, e = (P.n + k) * 8; for (let q2 = 0; q2 < 16; ++q2) P.mat[d + q2] = farRec[f][o + q2]; for (let q2 = 0; q2 < 8; ++q2) P.misc[e + q2] = farRec[f][o + 16 + q2]; }
        P.n += n;
      }
    }
    for (const P of FP) { P.nc = P.n; flush(P); }
    lastF.copy(c);
  }
  const cam = new Vector3();
  function refresh(camPos, force) {
    if (!camPos || !Number.isFinite(camPos.x)) return;
    cam.set(camPos.x, camPos.y, camPos.z);
    const t = (globalThis.performance ?? Date).now();
    let moveN = force && packedFrame !== frame, moveF = false;
    if (dirty.size) {
      for (const it of dirty) { write(it); if (Math.hypot(it._x - cam.x, it._z - cam.z) > lod.midOut[0] - 80) moveF = true; }
      dirty.clear(); moveN = true;
    }
    if (cam.distanceTo(lastN) > lod.moveNear) moveN = true;
    if (cam.distanceTo(lastF) > lod.moveFar) moveF = true;
    // a turn (or a snap) that brings the left-out wedge into view repacks before this frame renders
    measureView(viewCam);
    shrubLayer?.update(cam, view);
    const lit = sunMoved(), cullN = cullDirty || lit || !covers(WN), cullF = cullDirty || !covers(WF);
    cullDirty = false;
    if (!moveN && !moveF && !cullN && !cullF) return;
    if (moveN || cullN) { aim(WN, CULL.turnNear); if (WN.on) aimSun(WN); packNear(moveN || lastN.x > 1e8 ? cam : lastN); }
    if (moveF || cullF) { aim(WF, CULL.turnFar); packFar(moveF || lastF.x > 1e8 ? cam : lastF); }
    packedFrame = frame; repacks++; lastMs = (globalThis.performance ?? Date).now() - t;
  }

  for (const k of KINDS) out.pools.push({ kind: k, items: out[k], update: (camPos, force) => refresh(camPos, force) });
  const trunkOf = (it) => {
    const V = G.variants[it.variant], s3 = it._scale3 ?? [1, 1, 1];
    const r = Math.min(0.6, Math.max(0.08, V.trunk.r * it._s * (s3[0] + s3[2]) / 2 * 1.05));
    return { x: it._x, z: it._z, y0: it._y - 0.3, y1: it._y + V.trunk.h * it._s * s3[1], r, kind: it.kind, item: it };
  };
  Object.assign(out, {
    update(dt, camPos, camera) { frame++; U.uTime.value += Number.isFinite(dt) ? dt : 0; if (uGrow.value < 1) uGrow.value = Math.min(1, uGrow.value + (Number.isFinite(dt) ? dt : 0) * growRate); U.uNight.value = Math.min(1, (getDaylight()?.state?.night ?? 0) * 1.6); if (camera) viewCam = camera; refresh(camPos, false); },
    setCulling(on = true) { if (cullOn !== !!on) { cullOn = !!on; cullDirty = true; } },
    // the graphics quality's draw distances: nothing given = the defaults (LOD); repacks on the next update
    setDetail({ nearOut = LOD.nearOut, midOut = LOD.midOut, farOut = LOD.farOut, shadow = LOD.shadow, shrubNear = LOD.shrubNear, shrubOut = LOD.shrubOut, shrubShadow = LOD.shrubShadow } = {}) {
      Object.assign(lod, { nearOut, midOut, farOut, shadow, shrubNear, shrubOut, shrubShadow });
      shrubLayer?.setDetail({ near: shrubNear, out: shrubOut, shadow: shrubShadow });
      matNear.userData.uFade.value.set(-2, -1, nearOut[0], nearOut[1]);
      matMid.userData.uFade.value.set(nearOut[0], nearOut[1], midOut[0], midOut[1]);
      matFar.userData.uFade.value.set(midOut[0], midOut[1], farOut[0], farOut[1]);
      lastN.set(1e9, 0, 0); lastF.set(1e9, 0, 0); cullDirty = true;
    },
    touch(it) { if (it) dirty.add(it); },
    trunkOf,
    addSolids(sink) {
      if (!sink) return 0;
      let n = 0;
      for (const it of out.items) {
        if (it.hedge) continue;
        const c = trunkOf(it); n++;
        if (typeof sink === 'function') sink(c);
        else if (sink.addCylinder) sink.addCylinder(c);
        else if (sink.cylinder) sink.cylinder(c.x, c.y0, c.z, c.r, c.y1 - c.y0, 'tree');
      }
      return n;
    },
    blockers: () => out.items.filter(it => !it.hedge && !it.broken).map(trunkOf),
    stats() {
      const sum = (A, k = 'nc') => A.reduce((s, P) => s + (P ? P[k] : 0), 0), calls = [...NM, ...FP].filter(P => P.nc).length;
      const cull = { on: cullOn, keepNear: WN.on ? Math.round(WN.H / DEG) : 180, keepFar: WF.on ? Math.round(WF.H / DEG) : 180, culled: culledView, shadowOnly, light: sun.known, lightSlackDeg: +(sun.tol / DEG).toFixed(2) };
      return { items: N, skipped, overBudget: over, near: sum(near), mid: sum(mid) - sum(mid, 'so'), far: sum(far), drawCalls: calls, casters: sum(near, 'ns') + sum(mid, 'ns'), cull, repacks, lastRepackMs: +lastMs.toFixed(2), buildMs: +buildMs.toFixed(1), plus, shrubs: shrubLayer?.stats() ?? null };
    },
    dispose() {
      out.group.removeFromParent();
      for (const P of [...near, ...mid, ...far]) if (P) { P.mesh.geometry.dispose(); P.mesh.dispose?.(); }
      shrubLayer?.dispose(); shrubLayer = null; gone = true; matDepth?.dispose();
      for (const V of Object.values(G.variants)) { V.near.dispose(); V.mid.dispose(); }
      G.far.round.dispose(); G.far.cone.dispose(); matNear.dispose(); matMid.dispose(); matFar.dispose();
    },
    setWind(dirX, dirZ, strength = 1) { U.uWind.value.set(dirX, dirZ, strength); cullDirty = true; }, // sway pads the bounds
  });
  Object.defineProperty(out, 'detail', { get: () => ({ nearOut: lod.nearOut, midOut: lod.midOut, farOut: lod.farOut, shadow: lod.shadow, shrubNear: lod.shrubNear, shrubOut: lod.shrubOut, shrubShadow: lod.shrubShadow }) });
  out.setShrubs = setShrubs; out.shrubJob = shrubJob;
  out.shrubSpots = () => shrubLayer?.spots() ?? null; out.shrubCheckAll = () => shrubLayer?.checkAll();
  setShrubs(shrubs);
  const buildMs = (globalThis.performance ?? Date).now() - t0;
  if (skipped || over) console.warn(`[trees] skipped ${skipped} invalid spots, ${over} over the ${budget} budget`);
  return out;
}
