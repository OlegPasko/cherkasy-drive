// OWNER: cherkasy. Пам'ятник Богдану Хмельницькому (V. Fuzhenko, architects T. Dovzhenko and V. Dmytrenko, unveiled
// 30 Oct 1995 for his 400th birthday): the square at the corner of bul. Shevchenka and vul. Bohdana Khmelnytskoho, at the
// south-east end of the Druzhba narodiv square (OSM node 1967388618, the juniper bed x -13..-1, z 1253..1290). Built after
// the Wikimedia Commons photos (2012-2024): a 5 m standing bronze hetman facing the boulevard (-x) – long zhupan with a
// sash, a fur-collared cloak falling to the plinth behind him, a fur kovpak with two plumes, the bulava held upright in
// his right hand before the chest, the left hand on the sabre hilt – on a stepped pyramid of rough-hewn granite courses
// (~4 m) over a spill of boulders, the inscription "Гетьман України / Зіновій Богдан Хмельницький / 1595–1657" on the
// smooth middle block; the low granite wall behind with the eight bronze battle plaques, creeping junipers in front,
// and the two bronze groups on granite blocks: artillery, drums, a keg and draped banners on the viewer's left (toward
// the palace), a Cossack chaika with a billowing sail and a cross on the mast over waves, with a bandura and oars, on
// the right. The light slab paving in front (Druzhba's own paving stops at z 1262), a sett apron along the bed, blue
// spruces and weeping birches behind, square lamps. At dusk ground projectors floodlight the bronze and the granite
// (a per-fragment wash toward the projector points, scaled by nightK). The hetman is one smooth skin of lofts and sweeps
// (with both groups ~8k verts of bronze) with the face modelled into the head surface; the bronze carries a vertex-colour patina (patina()).
//   BOHDAN_SKIP: empty (no OSM building is replaced)
//   buildBohdan({ root, map, solids, heightAt }) -> { update(dt), clear(x, z), spots } | null
// The site frame: a (across, +a = the viewer's right = world +z) and d (toward the boulevard = world -x) from ORIGIN.
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { PARK_PINE } from '../trees.js';
import { SG, canvasTex, decal } from './sculpt.js';
import { rng } from './geo.js';

export const BOHDAN_SKIP = new Set();

const PI = Math.PI;
const ORIGIN = [-7.2, 1267];       // pedestal centre, mid-bed (the OSM node is 0.7 m toward the boulevard)
const YAW = -PI / 2;               // local +z (d) -> world -x, local +x (a) -> world +z
const FIG = 2.7;                   // the figure is drawn 1.8 units to the crown (1.94 to the plumes) -> 4.9 m of bronze
// pedestal courses bottom -> top: [half across, half deep, height]; the third carries the inscription
const COURSES = [[3.7, 3.1, 0.5], [3.45, 2.85, 0.5], [3.25, 2.65, 0.72], [2.95, 2.4, 0.5], [2.6, 2.1, 0.5], [2.25, 1.8, 0.48], [1.9, 1.55, 0.45], [1.6, 1.3, 0.4]];
const GROUP_A = 12.5, GROUP_D = 0.5, BLOCK = [1.9, 1.3, 1.55]; // side groups: across offset, depth, granite block half sizes + height
const WALL_D = -4.6;               // the plaque wall behind the pedestal
const PAVE = [-37, 1262, -13.4, 1298], SETTS = [-13.4, 1250, -12.2, 1292]; // world rects [x0, z0, x1, z1]
const BED = [-13.2, 1250, -0.8, 1292];

// ------------------------------------------------------------------------------------------------ textures
const graniteTex = () => {
  const t = canvasTex(256, 256, (c, w, h) => {
    const r = rng(1595);
    c.fillStyle = '#b4b0a8'; c.fillRect(0, 0, w, h);
    for (let q = 0; q < 7000; q++) {
      const k = r();
      c.fillStyle = k < 0.45 ? `rgba(52,50,48,${0.25 + r() * 0.35})` : k < 0.8 ? `rgba(236,232,226,${0.25 + r() * 0.35})` : `rgba(150,140,130,${0.15 + r() * 0.2})`;
      c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    // tool marks of the rough dressing: faint diagonal streaks
    c.strokeStyle = 'rgba(80,78,74,0.12)'; c.lineWidth = 2;
    for (let q = 0; q < 24; q++) { const x = r() * w, y = r() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 30 + r() * 30, y + 8 + r() * 12); c.stroke(); }
  });
  t.repeat.set(1 / 1.2, 1 / 1.2);
  return t;
};
// 4 m of the square: light 0.5 m slabs with a darker band every 4 m both ways (the 2012 repaving)
const slabTex = () => canvasTex(512, 512, (c, w, h) => {
  const r = rng(1657), n = 8, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const band = i === 0 || j === 0, v = (band ? 168 : 196) + (r() - 0.5) * 12;
    c.fillStyle = `rgb(${v + 4 | 0},${v | 0},${v - 8 | 0})`; c.fillRect(i * s, j * s, s, s);
  }
  for (let q = 0; q < 6000; q++) { c.fillStyle = `rgba(${r() < 0.5 ? '60,58,54' : '250,248,240'},${0.08 + r() * 0.1})`; c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  c.fillStyle = 'rgba(90,86,80,0.35)';
  for (let i = 0; i <= n; i++) { c.fillRect(i * s - 1, 0, 2, h); c.fillRect(0, i * s - 1, w, 2); }
});
// 1 m of grey granite setts, 0.1 m, rows offset
const settTex = () => canvasTex(256, 256, (c, w, h) => {
  const r = rng(1648), n = 10, s = w / n;
  c.fillStyle = '#4f4d49'; c.fillRect(0, 0, w, h);
  for (let j = 0; j < n; j++) for (let i = -1; i < n; i++) {
    const v = 120 + (r() - 0.5) * 40, x = i * s + (j & 1) * s / 2;
    c.fillStyle = `rgb(${v | 0},${v - 2 | 0},${v - 6 | 0})`; c.fillRect(x + 2, j * s + 2, s - 4, s - 4);
  }
});
const inscriptionTex = () => canvasTex(1024, 224, (c, w, h) => {
  const r = rng(30);
  c.fillStyle = '#aaa69f'; c.fillRect(0, 0, w, h);
  for (let q = 0; q < 9000; q++) { c.fillStyle = r() < 0.5 ? 'rgba(60,58,56,0.28)' : 'rgba(245,242,236,0.3)'; c.fillRect(r() * w, r() * h, 1.5, 1.5); }
  c.fillStyle = '#1f1d1b'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = 'italic bold 54px "Palatino", "Georgia", serif'; c.fillText('Гетьман України', w / 2, 46);
  c.font = 'italic bold 62px "Palatino", "Georgia", serif'; c.fillText('Зіновій Богдан Хмельницький', w / 2, 116);
  c.font = 'italic bold 48px "Palatino", "Georgia", serif'; c.fillText('1595–1657', w / 2, 184);
}, { repeat: false });

// Floodlight wash: emissive scaled per fragment by how squarely it faces the projector points (and how near they are),
// so the lit side of the bronze glows and the back stays dark; the emissive intensity itself follows nightK.
function floodlit(mat, lamps, reach) {
  const n = lamps.length, U = { uFlood: { value: lamps.map((p) => new THREE.Vector3(...p)) }, uReach: { value: reach } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vFlP;\nvarying vec3 vFlN;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n  vFlP = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vFlN = mat3(modelMatrix) * objectNormal;');
    sh.fragmentShader = `uniform vec3 uFlood[${n}];\nuniform float uReach;\nvarying vec3 vFlP;\nvarying vec3 vFlN;\n` + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
  {
    vec3 fN = normalize(vFlN) * (gl_FrontFacing ? 1.0 : -1.0);
    float wash = 0.0;
    for (int i = 0; i < ${n}; i++) { vec3 L = uFlood[i] - vFlP; float r = length(L); wash += max(dot(fN, L / r), 0.0) * clamp(1.35 - r / uReach, 0.0, 1.0); }
    totalEmissiveRadiance *= wash;
  }`);
  };
  mat.customProgramCacheKey = () => `bohdan-flood-${n}`;
  return mat;
}

// append src's surface to dst with every point mapped by T([x, y, z]) -> [x, y, z]
function put(dst, src, T) {
  const base = dst.v;
  for (let i = 0; i < src.xyz.length; i += 3) dst.xyz.push(...T([src.xyz[i], src.xyz[i + 1], src.xyz[i + 2]]));
  for (const t of src.tri) dst.tri.push(t + base);
  return dst;
}
const mapper = (m) => { const v = new THREE.Vector3(); return (p) => v.set(p[0], p[1], p[2]).applyMatrix4(m).toArray(); };
// horizontal ring of an ellipse (rx across, rz deep) at height y, centre shifted by dx / dz; wob(angle) scales the radius
const ring = (y, rx, rz, { dx = 0, dz = 0, n = 16, wob = null } = {}) => Array.from({ length: n }, (_, k) => {
  const a = -k / n * PI * 2, s = wob ? wob(a) : 1;
  return [dx + Math.cos(a) * rx * s, y, dz + Math.sin(a) * rz * s];
});
// rounded rectangle ring (half sizes hx / hz, corner radius rr)
const rrect = (y, hx, hz, rr, per = 3) => {
  const out = [];
  for (const [cx, cz, a0] of [[hx - rr, hz - rr, 0], [-(hx - rr), hz - rr, PI / 2], [-(hx - rr), -(hz - rr), PI], [hx - rr, -(hz - rr), PI * 1.5]]) {
    for (let k = 0; k <= per; k++) { const a = a0 + k / per * PI / 2; out.push([cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr]); }
  }
  return out.reverse(); // the same turning sense as SG's rings
};
const sgBox = (s, x, z, y0, y1, hx, hz, rr = 0.03) => s.loft([rrect(y0, hx, hz, rr, 1).map(([a, y, b]) => [a + x, y, b + z]), rrect(y1, hx, hz, rr, 1).map(([a, y, b]) => [a + x, y, b + z])], { cap0: true, cap1: true });

// ------------------------------------------------------------------------------------------------ the hetman
// Drawn in figure units: a 1.8-unit man (about 7.8 heads, the head 0.23 from chin to crown), soles at y 0, +z forward,
// +x his left; the kovpak and its plumes reach 1.95. Built from the Commons photos: a heavy, broad-shouldered figure in
// an ankle-length zhupan with a wide wrapped sash, a fur-collared cloak over both shoulders that falls wide to the
// plinth on his right and hangs behind the left arm, the right fist before the chest round an upright bulava, the left
// hand down on the hilt of the sabre, a stern face with a hooked nose, a heavy brow and a long drooping moustache.

// sweep a section along a polyline (parallel-transport frames, as SG.tube): sec[i] = r or [across, thick];
// wob(u, i) scales the section's radius at u = 0..1 round it (folds, fur, knuckles)
function sweep(s, path, sec, seg = 10, { caps = true, wob = null } = {}) {
  const P = path.map((p) => new THREE.Vector3(...p)), last = P.length - 1;
  const tan = new THREE.Vector3(), bin = new THREE.Vector3(), q = new THREE.Vector3();
  let nrm = null;
  const rings = P.map((p, i) => {
    tan.subVectors(P[Math.min(last, i + 1)], P[Math.max(0, i - 1)]).normalize();
    if (nrm) nrm.addScaledVector(tan, -nrm.dot(tan)).normalize();
    else { nrm = new THREE.Vector3(tan.z, 0, -tan.x); if (nrm.lengthSq() < 1e-6) nrm.set(1, 0, 0); nrm.normalize(); }
    bin.crossVectors(tan, nrm).normalize();
    const [ra, rb] = Array.isArray(sec[i]) ? sec[i] : [sec[i], sec[i]];
    return Array.from({ length: seg }, (_, k) => {
      const u = k / seg, w = wob ? wob(u, i) : 1;
      q.copy(p).addScaledVector(nrm, Math.cos(u * PI * 2) * ra * w).addScaledVector(bin, Math.sin(u * PI * 2) * rb * w);
      return [q.x, q.y, q.z];
    });
  });
  return s.loft(rings, { cap0: caps, cap1: caps });
}
// an ellipsoid turned by (rx, ry, rz) radians about its own centre
const ell = (s, c, r, rot = [0, 0, 0], seg = 12, rows = 8) =>
  put(s, new SG().ellipsoid([0, 0, 0], r, seg, rows), mapper(new THREE.Matrix4().compose(new THREE.Vector3(...c), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1))));
// a lumpy ring: centre (dx, dz), half sizes rx / rz, per-angle height offset dy(a) and radius factor w(a)
const hring = (y, rx, rz, { dx = 0, dz = 0, n = 20, dy = null, w = null, e = 1 } = {}) => Array.from({ length: n }, (_, k) => {
  const a = -k / n * PI * 2, c = Math.cos(a), sn = Math.sin(a), f = w ? w(a) : 1;
  return [dx + Math.sign(c) * Math.abs(c) ** e * rx * f, y + (dy ? dy(a) : 0), dz + Math.sign(sn) * Math.abs(sn) ** e * rz * f];
});
// the zhupan's section table: y, half width, front, back, centre shift forward, vertical fold depth, squareness
const TORSO = [[0.16, 0.39, 0.31, 0.33, 0.02, 0.07, 1], [0.32, 0.36, 0.285, 0.3, 0.02, 0.062, 1], [0.52, 0.33, 0.255, 0.27, 0.02, 0.048, 1],
  [0.74, 0.302, 0.23, 0.235, 0.025, 0.03, 1], [0.9, 0.287, 0.226, 0.215, 0.03, 0.012, 0.95], [1.0, 0.277, 0.235, 0.198, 0.035, 0.006, 0.9],
  [1.1, 0.282, 0.225, 0.188, 0.03, 0.004, 0.88], [1.22, 0.297, 0.206, 0.178, 0.02, 0.004, 0.86], [1.33, 0.302, 0.184, 0.17, 0.008, 0.003, 0.84],
  [1.4, 0.296, 0.164, 0.16, 0, 0, 0.84], [1.445, 0.255, 0.14, 0.14, 0, 0, 0.9], [1.48, 0.19, 0.115, 0.118, 0, 0, 0.95], [1.505, 0.12, 0.09, 0.09, 0, 0, 1],
  [1.52, 0.075, 0.07, 0.072, 0, 0, 1]];
const torsoAt = (y) => {
  const k = Math.max(0, TORSO.findIndex((r) => r[0] > y) - 1), a = TORSO[k], b = TORSO[Math.min(TORSO.length - 1, k + 1)], t = b === a ? 0 : Math.min(1, Math.max(0, (y - a[0]) / (b[0] - a[0])));
  return a.map((v, i) => v + (b[i] - v) * t);
};
const torsoRing = (row, n, extra = 0) => {
  const [y, W, F, Bk, dz, fold, e] = row;
  return hring(y, W + extra, 1, {
    n, dz, e, dy: y < 0.2 ? (a) => 0.022 * Math.sin(a * 5 + 1) + 0.012 * Math.sin(a * 3) + 0.035 * Math.max(0, Math.sin(a)) ** 2 * Math.max(0, -Math.cos(a) + 0.3) : null,
    // front / back depths differ; the skirt folds deepen toward the sides and the back, where the cloth hangs free
    w: (a) => 1 + fold * (Math.sin(a * 11 + y * 4) + 0.45 * Math.sin(a * 5 - y * 3)) * (0.35 + 0.65 * Math.abs(Math.cos(a)) + 0.4 * Math.max(0, -Math.sin(a))),
  }).map(([x, yy, z]) => [x, yy, dz + (z - dz) * ((z - dz) > 0 ? F : Bk) + (extra && (z - dz) ? Math.sign(z - dz) * extra : 0)]);
};

function hetman() {
  const s = new SG();
  // ---- boots under the hem: the right foot a little forward, both toes turned out, pointed and slightly upturned
  for (const [x, fz, turn] of [[-0.12, 0.1, -0.22], [0.12, -0.01, 0.3]]) {
    sweep(s, [[x, 0.03, fz - 0.02], [x, 0.14, fz - 0.03], [x * 0.96, 0.3, fz - 0.04]], [0.066, 0.07, 0.078], 12);
    const m = mapper(M4(x, 0, fz, turn));
    put(s, new SG().loft([[0, -0.07, 0.048, 0.06], [0, -0.02, 0.062, 0.085], [0, 0.06, 0.056, 0.06], [0.008, 0.13, 0.04, 0.04], [0.03, 0.19, 0.01, 0.012]].map(([dy, z, hw, h]) =>
      Array.from({ length: 10 }, (_, k) => { const a = -k / 10 * PI * 2; return [Math.cos(a) * hw, 0.004 + dy + h * (0.5 + 0.5 * Math.sin(a)), z]; })), { cap0: true, cap1: true }), m);
  }
  // ---- the zhupan: flared skirt with hanging folds, a stout belly, a deep chest, square shoulders
  s.loft(TORSO.map((r) => torsoRing(r, 44)), { cap0: true, cap1: true });
  // the front edge (the right flap over the left) with a row of cast buttons down the chest
  const front = (y, x = 0.02) => { const [, , F, , dz] = torsoAt(y); return dz + F * (1 - (x / 0.26) ** 2) ** 0.5; };
  sweep(s, [1.47, 1.35, 1.2, 1.05, 0.85, 0.6, 0.35, 0.14].map((y) => [0.03 + (1.47 - y) * 0.02, y, front(y, 0.03) + 0.004]), Array(8).fill([0.014, 0.008]), 6);
  for (let y = 1.16; y < 1.42; y += 0.065) { const x = 0.025 + (1.47 - y) * 0.02; ell(s, [x, y, front(y, x) + 0.004], [0.008, 0.008, 0.005], [0, 0, 0], 8, 6); }
  // ---- the sash: several wraps, a knot at his left front with two fringed ends falling to the knee
  // (dipping a little at the front under the belly, loosely folded)
  const sash = [0.965, 0.99, 1.018, 1.045, 1.07].map((y, j) => torsoRing([...torsoAt(y).slice(0, 5), 0.014, 0.9], 28, j % 2 ? 0.017 : 0.01)
    .map(([x, yy, z]) => [x, yy - 0.022 * Math.max(0, z / 0.25), z]));
  s.loft(sash, { cap0: true, cap1: true });
  const kz = front(1.0, 0.13) + 0.018;
  ell(s, [0.13, 1.0, kz - 0.008], [0.045, 0.034, 0.018], [0, 0.3, 0.2], 10, 7);
  for (const [dx, len] of [[-0.02, 0.24], [0.03, 0.3]]) {
    const p = [0, 0.33, 0.66, 1].map((t) => { const y = 0.98 - len * t; return [0.13 + dx + 0.02 * t, y, front(y, 0.13 + dx) + 0.018 - 0.01 * t]; });
    sweep(s, p, [[0.024, 0.007], [0.027, 0.006], [0.03, 0.006], [0.033, 0.005]], 8);
  }

  // ---- arms. Right: the upper arm down under the cloak, the forearm up and across to a fist before the chest
  const sleeve = (u, i, n) => 1 + 0.05 * Math.sin(u * PI * 6 + i) * (i > 0 && i < n - 1 ? 1 : 0.3);
  const rA = [[-0.245, 1.41, -0.01], [-0.29, 1.29, -0.02], [-0.3, 1.15, 0.0], [-0.25, 1.165, 0.1], [-0.18, 1.21, 0.17], [-0.135, 1.235, 0.2]];
  sweep(s, rA, [0.098, 0.09, 0.085, 0.078, 0.07, 0.064], 14, { wob: (u, i) => sleeve(u, i, rA.length) });
  sweep(s, [[-0.16, 1.222, 0.185], [-0.13, 1.24, 0.208]], [0.07, 0.075], 14); // the turned-back cuff
  // the fist round the bulava: the palm on his side of the shaft, four curled fingers across the front, the thumb over them
  const C = [-0.085, 0, 0.25];
  ell(s, [C[0] - 0.035, 1.27, C[2] - 0.02], [0.03, 0.05, 0.042], [0, -0.5, 0], 10, 8);
  for (let j = 0; j < 4; j++) {
    const y = 1.235 + j * 0.018, r = 0.027;
    sweep(s, [-95, -45, 0, 45, 90].map((d) => [C[0] + Math.sin(d * PI / 180) * r, y, C[2] + Math.cos(d * PI / 180) * r]), [0.012, 0.0135, 0.013, 0.012, 0.01], 8);
  }
  sweep(s, [[C[0] - 0.04, 1.3, C[2] - 0.005], [C[0] - 0.012, 1.316, C[2] + 0.02], [C[0] + 0.018, 1.31, C[2] + 0.03]], [0.013, 0.012, 0.009], 7);
  // the bulava: an upright shaft, a flanged pear head at his shoulder, a small finial; a knob at the butt
  sweep(s, [[C[0], 1.15, C[2]], [C[0], 1.43, C[2]]], [0.013, 0.012], 8);
  s.loft([[1.425, 0.01], [1.437, 0.03], [1.455, 0.041], [1.475, 0.043], [1.495, 0.035], [1.508, 0.015]].map(([y, r]) => hring(y, r, r, { dx: C[0], dz: C[2], n: 32, w: (a) => 1 + 0.28 * Math.max(0, Math.cos(a * 8)) ** 4 })), { cap0: true, cap1: true });
  ell(s, [C[0], 1.52, C[2]], [0.011, 0.016, 0.011], [0, 0, 0], 8, 5);
  ell(s, [C[0], 1.145, C[2]], [0.018, 0.018, 0.018], [0, 0, 0], 8, 5);
  // Left: hanging, the hand forward on the sabre hilt at the hip
  const lA = [[0.245, 1.41, -0.01], [0.3, 1.27, -0.03], [0.322, 1.12, -0.035], [0.328, 1.0, -0.005], [0.328, 0.9, 0.04], [0.33, 0.878, 0.075]];
  sweep(s, lA, [0.098, 0.09, 0.085, 0.075, 0.066, 0.06], 14, { wob: (u, i) => sleeve(u, i, lA.length) });
  sweep(s, [[0.328, 0.91, 0.03], [0.329, 0.886, 0.06]], [0.071, 0.075], 14);
  // the sabre: guard at the hip, the grip rising forward, a hooked karabela pommel, a knuckle-bow; the scabbard
  // curving down and back along the skirt
  const G0 = [0.345, 0.79, 0.1], G1 = [0.35, 0.86, 0.18];
  sweep(s, [G0, G1], [0.017, 0.016], 8);
  sweep(s, [G1, [0.35, 0.885, 0.2], [0.353, 0.88, 0.228]], [0.019, 0.018, 0.012], 8);
  sweep(s, [[0.345, 0.8, 0.06], [0.345, 0.78, 0.12], [0.35, 0.81, 0.16]], [0.01, 0.011, 0.009], 6); // quillons
  sweep(s, [[0.35, 0.8, 0.16], [0.37, 0.84, 0.215], [0.36, 0.88, 0.235]], [0.007, 0.007, 0.006], 6); // knuckle-bow
  sweep(s, [[0.345, 0.785, 0.085], [0.375, 0.6, 0.0], [0.4, 0.42, -0.08], [0.412, 0.28, -0.15], [0.405, 0.19, -0.19]], [[0.032, 0.014], [0.03, 0.013], [0.028, 0.012], [0.024, 0.011], [0.01, 0.008]], 8);
  // the hand: a broad palm over the pommel, fingers falling round the grip, the thumb along its top
  ell(s, [0.352, 0.866, 0.112], [0.046, 0.062, 0.036], [0.5, 0, 0], 10, 8);
  for (let j = 0; j < 4; j++) {
    const x = 0.322 + j * 0.02;
    sweep(s, [[x, 0.84, 0.13], [x + 0.002, 0.805, 0.16], [x + 0.004, 0.795, 0.19], [x + 0.004, 0.812, 0.207]], [0.0145, 0.014, 0.013, 0.011], 7);
  }
  sweep(s, [[0.318, 0.872, 0.13], [0.33, 0.883, 0.17], [0.345, 0.888, 0.198]], [0.015, 0.014, 0.011], 7);

  // ---- the head: a bull neck, a broad skull, flat cheeks, a heavy jaw; features laid on as soft forms
  sweep(s, [[0, 1.47, -0.01], [0, 1.56, 0.0], [0, 1.63, 0.005]], [0.066, 0.06, 0.056], 14);
  const hd = new SG(); // head and kovpak, drawn life-size, then set on the neck a size smaller (heroic proportion)
  const HEAD = [[1.548, 0.024, 0.05, 0.024], [1.56, 0.048, 0.078, 0.05], [1.58, 0.066, 0.09, 0.07], [1.605, 0.071, 0.096, 0.086], [1.635, 0.075, 0.099, 0.097],
    [1.665, 0.078, 0.097, 0.103], [1.695, 0.079, 0.094, 0.106], [1.725, 0.077, 0.088, 0.105], [1.755, 0.07, 0.076, 0.097], [1.78, 0.052, 0.054, 0.074], [1.795, 0.022, 0.024, 0.032]];
  const lerpRow = (T, y) => { const k = Math.max(0, T.findIndex((r) => r[0] > y) - 1), a = T[k], b = T[k + 1] ?? a, t = b === a ? 0 : Math.min(1, Math.max(0, (y - a[0]) / (b[0] - a[0]))); return a.map((v, i) => v + (b[i] - v) * t); };
  // The face is modelled into the head surface itself (one smooth skin, no stuck-on blobs): a relief pushed forward
  // over the front half. The nose profile: y, height over the face, half width - a bump on the bridge, a heavy tip.
  const NOSE = [[1.611, 0, 0.013], [1.62, 0.016, 0.018], [1.631, 0.038, 0.019], [1.644, 0.03, 0.015], [1.661, 0.025, 0.012], [1.68, 0.015, 0.011], [1.697, 0.006, 0.013], [1.706, 0, 0.013]];
  const g2 = (v, w) => Math.exp(-((v / w) ** 2));
  const relief = (x, y) => {
    const ax = Math.abs(x), [, nh, nw] = lerpRow(NOSE, y);
    return nh * g2(x, nw) + 0.008 * g2(ax - 0.017, 0.008) * g2(y - 1.627, 0.007)                   // nose and its wings
      + 0.016 * g2(ax - 0.03, 0.028) * g2(y - (1.689 + 0.007 * Math.min(1, ax / 0.05)), 0.009)      // the brow, drawn down inside
      + 0.004 * g2(x, 0.012) * g2(y - 1.69, 0.01)                                                   // the knot of the frown
      - 0.022 * g2(ax - 0.032, 0.017) * g2(y - 1.671, 0.011) + 0.006 * g2(ax - 0.032, 0.011) * g2(y - 1.669, 0.006) // sockets, lids
      + 0.013 * g2(ax - 0.05, 0.018) * g2(y - 1.647, 0.012) - 0.007 * g2(ax - 0.055, 0.018) * g2(y - 1.608, 0.015) // cheekbones, hollows
      + 0.004 * g2(x, 0.02) * g2(y - 1.59, 0.005) - 0.004 * g2(x, 0.025) * g2(y - 1.598, 0.004)    // lower lip, mouth line
      + 0.013 * g2(x, 0.02) * g2(y - 1.566, 0.01) + 0.006 * g2(ax - 0.045, 0.012) * g2(y - 1.574, 0.012); // square chin, jaw corners
  };
  const hy = [1.548, 1.553];
  for (let y = 1.558; y < 1.722; y += 0.006) hy.push(y);
  hy.push(1.735, 1.75, 1.765, 1.78, 1.79, 1.797);
  hd.loft(hy.map((y) => { const [, W, F, B] = lerpRow(HEAD, y); return hring(y, W, 1, { n: 44, e: 0.92 }).map(([x, yy, z]) => [x, yy, z > 0 ? z * F + relief(x, y) * Math.sqrt(z) + 0.012 : z * B + 0.012]); }), { cap0: true, cap1: true });
  for (const sd of [-1, 1]) ell(hd, [sd * 0.078, 1.662, 0.005], [0.012, 0.03, 0.02], [0, 0, 0], 8, 6); // ears, mostly under the fur band
  // the long moustache: from under the nose, out over the mouth corners and down past the chin
  for (const sd of [-1, 1]) {
    const m = [[0.004, 1.613, 0.116], [0.026, 1.604, 0.109], [0.045, 1.59, 0.092], [0.056, 1.568, 0.075], [0.06, 1.54, 0.066], [0.058, 1.515, 0.062], [0.052, 1.5, 0.06]];
    sweep(hd, m.map(([x, y, z]) => [sd * x, y, z]), [[0.015, 0.009], [0.018, 0.01], [0.015, 0.009], [0.012, 0.008], [0.009, 0.007], [0.006, 0.005], [0.002, 0.002]], 10);
  }
  // ---- the kovpak: a turned-up fur band, lower at the back, a tall crown leaning back a touch
  const fur = (a, k) => 1 + 0.035 * Math.sin(a * 13 + k) * Math.sin(a * 5 - k);
  hd.loft([[1.7, 0.084, 0.11, 0], [1.708, 0.093, 0.118, 1], [1.728, 0.097, 0.122, 2], [1.75, 0.095, 0.12, 3], [1.764, 0.088, 0.112, 4]].map(([y, rx, rz, k]) =>
    hring(y, rx, rz, { dz: 0.008, n: 28, w: (a) => fur(a, k), dy: (a) => 0.018 * Math.min(0, Math.sin(a)) })), { cap0: true, cap1: true });
  hd.loft([[1.758, 0.083, 0.104, 0], [1.79, 0.086, 0.103, -0.004], [1.815, 0.081, 0.095, -0.008], [1.833, 0.07, 0.082, -0.012], [1.843, 0.047, 0.054, -0.014], [1.847, 0.018, 0.02, -0.014]].map(([y, rx, rz, dz]) =>
    hring(y, rx, rz, { dz: 0.008 + dz, n: 24, w: (a) => 1 + 0.02 * Math.sin(a * 6) })), { cap0: true, cap1: true });
  // the jewelled clasp and the two plumes curling out like horns
  ell(hd, [0, 1.742, 0.133], [0.022, 0.026, 0.012], [0, 0, 0], 10, 7);
  for (const [sd, k] of [[1, 1], [-1, 0.86]]) {
    const p = [[0.006, 1.76, 0.128], [0.028, 1.815, 0.12], [0.065, 1.858, 0.1], [0.105, 1.87, 0.075], [0.135, 1.852, 0.052], [0.14, 1.826, 0.04], [0.128, 1.812, 0.035]]
      .map(([x, y, z]) => [sd * x * k, 1.76 + (y - 1.76) * k, z]);
    sweep(hd, p, [[0.008, 0.014], [0.012, 0.03], [0.013, 0.042], [0.013, 0.046], [0.011, 0.036], [0.008, 0.022], [0.004, 0.005]], 10, // broad face forward
      { wob: (u) => 1 + 0.1 * Math.sin(u * PI * 12) }); // the barbs
  }

  put(s, hd, mapper(new THREE.Matrix4().makeTranslation(0, 1.585, 0.005).scale(new THREE.Vector3(0.9, 0.9, 0.9)).multiply(new THREE.Matrix4().makeTranslation(0, -1.555, 0))));

  // ---- the cloak: a fur collar on the shoulders; the cloth falls wide to the plinth on his right, behind the left arm
  const collar = [[-0.1, 1.3, 0.175], [-0.15, 1.4, 0.15], [-0.2, 1.47, 0.07], [-0.2, 1.51, -0.05], [-0.12, 1.535, -0.13], [0, 1.545, -0.155], [0.12, 1.535, -0.13], [0.2, 1.51, -0.05],
    [0.205, 1.47, 0.065], [0.16, 1.4, 0.14], [0.12, 1.31, 0.165]];
  sweep(s, collar, [[0.012, 0.022], [0.018, 0.03], [0.026, 0.036], [0.034, 0.04], [0.04, 0.043], [0.042, 0.045], [0.04, 0.043], [0.034, 0.04], [0.026, 0.036], [0.018, 0.03], [0.012, 0.022]], 12, { wob: (u, i) => 1 + 0.09 * Math.sin(u * PI * 14 + i * 2.1) });
  const ROWS = [[1.5, 0.3, 0.17, -114, 104, 0], [1.4, 0.345, 0.2, -116, 100, 0.012], [1.22, 0.375, 0.245, -117, 88, 0.03],
    [0.95, 0.4, 0.29, -115, 78, 0.045], [0.62, 0.44, 0.335, -113, 70, 0.06], [0.3, 0.49, 0.38, -111, 66, 0.07], [0.1, 0.53, 0.42, -110, 64, 0.075], [0.015, 0.56, 0.45, -110, 64, 0.075]];
  const NC = 44;
  const cloak = ROWS.map(([y, rx, rz, a0, a1, amp]) => Array.from({ length: NC }, (_, k) => {
    const a = (a0 + (a1 - a0) * k / (NC - 1)) * PI / 180, f = (1 + amp * Math.sin(a * 9 + y * 2.2) + amp * 0.5 * Math.sin(a * 17 - y * 5)) * (a < 0 ? 1 + 0.22 * Math.max(0, 1.2 - y) * -Math.sin(a) : 1);
    const sh = y > 1.3 ? (y - 1.3) / 0.18 : 0; // over the shoulders the cloth follows their slope down from the neck
    return [Math.sin(a) * rx * f, y - sh * 0.1 * Math.sin(a) ** 2 + (y < 0.05 ? 0.012 * Math.sin(a * 7) : 0), -Math.cos(a) * rz * f - 0.015];
  }));
  s.loft(cloak, { closed: false });
  // fur trim down both front edges (it also gives the cloth its thickness where the eye catches the edge)
  for (const k of [0, NC - 1]) sweep(s, cloak.map((r) => r[k]), cloak.map((_, j) => (j ? 0.022 : 0.035)), 8, { wob: (u, i) => 1 + 0.12 * Math.sin(u * PI * 8 + i) });
  return s;
}

// Bronze patina as vertex colour: dark statuary bronze, a grey-green bloom on what faces the sky and the rain runs
// over, a warmer, rubbed brown on the forward-standing forms; a slow noise keeps it from looking painted.
function patina(geo) {
  const P = geo.attributes.position, N = geo.attributes.normal, col = new Float32Array(P.count * 3);
  const base = [0.105, 0.082, 0.056], green = [0.13, 0.155, 0.11], warm = [0.2, 0.14, 0.075];
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), ny = N.getY(i);
    const n = 0.5 + 0.25 * Math.sin(x * 3.1 + y * 1.7) * Math.sin(z * 2.9 - y * 2.3) + 0.25 * Math.sin(x * 11 + z * 13 + y * 7);
    const g = Math.min(0.85, Math.max(0, ny * 0.9 - 0.15 + (n - 0.5) * 0.7)), wm = Math.max(0, Math.abs(N.getX(i)) * 0.2 + (n - 0.6)) * (1 - g);
    for (let c = 0; c < 3; c++) col[3 * i + c] = base[c] + (green[c] - base[c]) * g + (warm[c] - base[c]) * wm;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// ------------------------------------------------------------------------------------------------ side groups
// the ornamented bronze cushion both groups stand on (local metres, top at y 0.36)
function cushion(s, lumpy) {
  const r = rng(lumpy ? 7 : 3), W = (y, hx, hz) => rrect(y, hx, hz, 0.25, 3).map(([x, yy, z]) => [x, yy + (lumpy && yy > 0.3 ? (r() - 0.5) * 0.08 : 0), z]);
  s.loft([W(0, 1.7, 1.0), W(0.12, 1.76, 1.06), W(0.26, 1.74, 1.04), W(0.36, 1.62, 0.93)], { cap0: true, cap1: true });
  if (lumpy) for (let k = 0; k < 9; k++) s.ellipsoid([-1.4 + k * 0.35 + (r() - 0.5) * 0.1, 0.38, (r() - 0.5) * 1.3], [0.28, 0.1 + r() * 0.08, 0.22], 8, 4); // wave crests
}
// artillery, drums, a keg and draped banners (the viewer's left)
function arms() {
  const s = new SG(), r = rng(1649);
  cushion(s, false);
  // the cannon on a low carriage, its muzzle to the viewer's right
  sgBox(s, -0.45, 0.5, 0.36, 0.56, 0.6, 0.2);
  for (const [x, z] of [[-0.85, 0.27], [-0.85, 0.74]]) s.tube([[x, 0.56, z - 0.035], [x, 0.56, z + 0.035]], [0.22, 0.22], 12, { caps: true });
  s.tube([[-1.3, 0.66, 0.48], [-0.5, 0.68, 0.51], [0.3, 0.7, 0.55]], [0.17, 0.14, 0.11], 12, { caps: true });
  s.tube([[0.26, 0.7, 0.55], [0.34, 0.7, 0.55]], [0.13, 0.13], 12, { caps: true });
  s.ellipsoid([-1.36, 0.66, 0.48], [0.07, 0.07, 0.07], 8, 5);
  for (const [x, y, z] of [[0.45, 0.51, 0.72], [0.76, 0.51, 0.66], [0.6, 0.76, 0.7], [1.0, 0.51, 0.35]]) s.ellipsoid([x, y, z], [0.15, 0.15, 0.15], 10, 7);
  // a kettledrum turned toward the viewer, a second one upright, a keg on its side, a basket
  const drum = (m) => { const d = new SG().lathe(0, 0, [[0.02, -0.02], [0.2, 0.04], [0.31, 0.2], [0.34, 0.32], [0.33, 0.36]], 16, { cap1: true }); return put(s, d, mapper(m)); };
  drum(new THREE.Matrix4().makeTranslation(-1.25, 0.72, 0.15).multiply(new THREE.Matrix4().makeRotationX(1.2)));
  drum(new THREE.Matrix4().makeTranslation(-1.05, 0.36, -0.55));
  const keg = new SG().lathe(0, 0, [[0.2, -0.28], [0.25, -0.12], [0.26, 0], [0.25, 0.12], [0.2, 0.28]], 14, { cap0: true, cap1: true });
  put(s, keg, mapper(new THREE.Matrix4().makeTranslation(1.05, 0.6, -0.3).multiply(new THREE.Matrix4().makeRotationX(PI / 2)).multiply(new THREE.Matrix4().makeRotationZ(0.3))));
  s.lathe(1.25, 0.45, [[0.08, 0.36], [0.22, 0.4], [0.3, 0.5], [0.32, 0.56]], 14, { cap0: true });
  // the banner poles with their knobs; the big standard's cloth draped down over the heap
  const pole = [-0.35, -0.25];
  s.tube([[pole[0], 0.36, pole[1]], [pole[0] - 0.03, 2.95, pole[1] - 0.02]], [0.032, 0.028], 6);
  s.ellipsoid([pole[0] - 0.03, 3.0, pole[1] - 0.02], [0.075, 0.075, 0.075], 8, 6);
  s.tube([[pole[0] - 0.03, 3.07, pole[1] - 0.02], [pole[0] - 0.03, 3.3, pole[1] - 0.02]], [0.04, 0.004], 6, { caps: true });
  // the standard's heavy cloth: gathered at the pole head, falling in deep folds and spreading over the heap in front,
  // most of the group's mass as in the photos
  s.loft(Array.from({ length: 12 }, (_, j) => {
    const t = j / 11, y = 2.82 - 2.3 * t, x0 = pole[0] - 0.2 - 0.95 * t ** 1.2, x1 = pole[0] + 0.85 + 0.55 * t;
    return Array.from({ length: 17 }, (_, k) => {
      const u = k / 16, fold = 0.15 * (0.2 + t) * Math.sin(u * PI * 5 + t * 1.5) + 0.05 * Math.sin(u * PI * 11 - t * 3) * t;
      return [x0 + (x1 - x0) * u, y - 0.45 * u * (1 - t) - 0.18 * t * Math.sin(u * PI) + (j === 11 ? (r() - 0.5) * 0.08 : 0), pole[1] + 0.05 + 0.8 * t * t * (0.55 + 0.45 * Math.sin(u * PI)) + fold];
    });
  }), { closed: false });
  // the slanted second standard with a swallow-tailed pennant flying to the right
  const a0 = [0.15, 0.4, -0.35], a1 = [0.95, 2.35, -0.55];
  s.tube([a0, a1], [0.028, 0.024], 6, { caps: true });
  s.ellipsoid([a1[0] + 0.02, a1[1] + 0.05, a1[2]], [0.05, 0.06, 0.05], 8, 5);
  const at = (f) => a0.map((v, i) => v + (a1[i] - v) * f);
  s.loft([0.62, 0.7, 0.78, 0.86, 0.93].map((f, j) => { const p = at(f), L = 0.95 - j * 0.06; return [p, [p[0] + L * 0.55, p[1] + 0.05 - j * 0.02, p[2] + 0.12], [p[0] + L, p[1] - 0.05 + (j === 2 ? 0.12 : 0), p[2] + 0.05]]; }), { closed: false });
  return s;
}
// the Cossack chaika with its sail and a cross on the mast, over the waves (the viewer's right)
function chaika() {
  const s = new SG(), b = new SG();
  cushion(s, true);
  // hull along +x (bow), open U sections, the bow rising
  const stations = 14, rings = [];
  for (let i = 0; i <= stations; i++) {
    const u = i / stations, x = -1.25 + 2.6 * u, w = 0.46 * Math.pow(Math.sin(PI * Math.min(0.985, Math.max(0.015, u))), 0.65) + 0.01;
    const yg = 0.62 + 0.42 * u ** 3 + 0.12 * (1 - u) ** 3, dep = 0.4 * Math.pow(Math.sin(PI * Math.min(0.99, Math.max(0.01, u))), 0.55) + 0.03;
    rings.push(Array.from({ length: 9 }, (_, k) => { const a = PI * k / 8; return [x, yg - dep * Math.sin(a), w * Math.cos(a)]; }));
  }
  b.loft(rings, { closed: false });
  for (const sd of [-1, 1]) b.tube(rings.map((q) => q[sd < 0 ? 8 : 0]).map(([x, y, z]) => [x, y + 0.01, z]), rings.map(() => 0.025), 5); // gunwales
  // mast, yard, the cross on the masthead
  const foot = [-0.15, 0.3, 0], head = [-0.3, 2.95, -0.04];
  b.tube([foot, head], [0.04, 0.026], 6);
  b.tube([[head[0], head[1], head[2]], [head[0] - 0.01, 3.42, head[2]]], [0.026, 0.022], 6, { caps: true });
  b.tube([[head[0] - 0.005, 3.26, head[2] - 0.16], [head[0] - 0.005, 3.26, head[2] + 0.16]], [0.022, 0.022], 6, { caps: true });
  b.tube([[head[0] - 0.01, 3.08, head[2] - 0.1], [head[0], 3.12, head[2] + 0.1]], [0.018, 0.018], 6, { caps: true });
  for (const p of [[head[0] - 0.01, 3.45, head[2]], [head[0] - 0.005, 3.26, head[2] - 0.18], [head[0] - 0.005, 3.26, head[2] + 0.18]]) b.ellipsoid(p, [0.03, 0.03, 0.03], 6, 4);
  b.tube([[-1.05, 2.7, -0.06], [0.45, 2.72, -0.03]], [0.025, 0.025], 6, { caps: true });
  // the sail, bellied and blown down over the stern
  b.loft(Array.from({ length: 11 }, (_, j) => {
    const t = j / 10, y = 2.68 - 1.95 * t, x0 = -1.05 - 0.55 * t * t, x1 = 0.45 - 0.2 * t;
    return Array.from({ length: 13 }, (_, k) => {
      const u = k / 12, belly = 0.5 * Math.sin(PI * u) * Math.sin(PI * Math.min(1, t * 1.15 + 0.05));
      return [x0 + (x1 - x0) * u, y - 0.25 * t * (1 - u), -0.05 + belly + 0.05 * Math.sin(u * 9 + t * 4)];
    });
  }), { closed: false });
  put(s, b, mapper(new THREE.Matrix4().makeTranslation(0.2, 0.05, 0.05).multiply(new THREE.Matrix4().makeRotationY(-0.28)).multiply(new THREE.Matrix4().makeRotationZ(0.1))));
  // a bandura leaning on the hull, crossed oars
  const band = new SG().ellipsoid([0, 0, 0], [0.24, 0.3, 0.07], 12, 8);
  band.tube([[0, 0.25, 0], [0, 0.72, -0.02]], [0.035, 0.03], 6, { caps: true });
  put(s, band, mapper(new THREE.Matrix4().makeTranslation(-0.75, 0.72, 0.62).multiply(new THREE.Matrix4().makeRotationX(-0.35)).multiply(new THREE.Matrix4().makeRotationZ(0.25))));
  for (const [p, q] of [[[-1.45, 0.42, 0.15], [0.25, 1.55, -0.45]], [[-1.3, 1.3, -0.4], [0.35, 0.45, 0.55]]]) {
    s.tube([p, q], [0.028, 0.028], 6, { caps: true });
    s.ellipsoid(q, [0.22, 0.03, 0.09], 8, 4); // the blade
  }
  return s;
}

// creeping juniper: a flat, lumpy mound
function mound(s, x, y, z, rx, ry, rz, r) {
  s.loft([0, 0.35, 0.7, 0.92].map((t, j) => ring(y + ry * t, (rx) * (j === 3 ? 0.45 : 1 - t * t * 0.55), rz * (j === 3 ? 0.45 : 1 - t * t * 0.55),
    { dx: x, dz: z, n: 10, wob: (a) => 1 + (r() - 0.5) * 0.22 })), { cap1: true });
}

// ------------------------------------------------------------------------------------------------ site
export function buildBohdan({ root, solids: S, heightAt }) {
  const t0 = performance.now();
  const [ox, oz] = ORIGIN, fx = Math.sin(YAW), fz = Math.cos(YAW), sx = fz, sz = -fx;
  const W = (a, d) => [ox + sx * a + fx * d, oz + sz * a + fz * d];
  const g = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 24; };
  const gl = (a, d) => g(...W(a, d));
  const ang = Math.atan2(-fx, fz);
  const box = (a, d, ha, hd, y0, y1, kind = 'wall') => { const [x, z] = W(a, d); return S.obox(x, z, ha, hd, ang, y0, y1, kind); };
  const frame = (a, y, d, s = 1) => { const [x, z] = W(a, d); return M4(x, y, z, YAW, s); };
  const r = rng(1995);
  const B = { gran: new MB(), det: new MB(), glow: new MB() };
  const bronze = new SG(), rock = new SG(), juniper = new SG();

  // ---------------------------------------------------------------- the pedestal
  const [H0a, H0d] = COURSES[0];
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => gl(u * (H0a + 1), v * (H0d + 1)));
  const yLow = Math.min(...corners), yB = Math.max(...corners);
  let y = yB, inscr = null;
  const P = frame(0, 0, 0);
  COURSES.forEach(([ha, hd, h], ci) => {
    const y0 = ci ? y : yLow - 0.25, y1 = y + h;
    B.gran.setColor([0.74, 0.72, 0.69]).with(P, (q) => q.box(-ha + 0.06, y0, -hd + 0.06, ha - 0.06, y1 - 0.02, hd - 0.06, 4 | 1 | 2 | 16 | 32));
    // the facing blocks: each side cut into rough-hewn stones of random length, proud of the core by a few cm
    const stone = (side, s0, s1, o, t) => B.gran.setColor([0.8, 0.78, 0.75].map((v) => v * (0.84 + r() * 0.22))).with(P, (q) => {
      if (side === 0) q.box(s0, y0, hd - 0.2, s1, t, hd + o, 16 | 4 | 1 | 2);
      else if (side === 2) q.box(-s1, y0, -hd - o, -s0, t, -hd + 0.2, 32 | 4 | 1 | 2);
      else if (side === 1) q.box(ha - 0.2, y0, -s1, ha + o, t, -s0, 1 | 4 | 16 | 32);
      else q.box(-ha - o, y0, s0, -ha + 0.2, t, s1, 2 | 4 | 16 | 32);
    });
    const run = (side, a, b) => { for (let s0 = a; s0 < b - 0.05;) { const s1 = Math.min(b, s0 + 0.7 + r() * 1.3); stone(side, s0, s1, 0.02 + r() * 0.18, y1 - 0.02 - r() * 0.12); s0 = s1; } };
    for (const [side, L] of [[0, ha], [1, hd], [2, ha], [3, hd]]) {
      if (ci !== 2 || side !== 0) { run(side, -L, L); continue; }
      // the inscription stone goes in whole, dressed smooth and a little proud of its neighbours
      run(side, -L, -1.75); stone(side, -1.75, 1.75, 0.12, y1); run(side, 1.75, L);
      inscr = { y0, y1, d: hd + 0.12 };
    }
    box(0, 0, ha, hd, yLow - 0.25, y1, 'ledge');
    y = y1;
  });
  const yTop = y;
  // the boulder spill round the foot, heaviest in front
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * PI * 2 + (r() - 0.5) * 0.25, ex = H0a + 0.35 + r() * 0.3, ez = H0d + 0.35 + r() * 0.3 + (Math.sin(a) > 0 ? 0.35 : 0);
    const la = Math.cos(a) * ex, ld = Math.sin(a) * ez, [x, z] = W(la, ld), gy = g(x, z) - 0.15;
    const rx = 0.55 + r() * 0.5, rz = 0.45 + r() * 0.35, hy = 0.35 + r() * 0.3, turn = a + (r() - 0.5) * 0.6;
    const blob = new SG().loft([0, 0.5, 0.85, 1].map((t, j) => ring(t * hy, rx * (1 - 0.35 * t * t), rz * (1 - 0.35 * t * t), { n: 9, wob: () => 1 + (r() - 0.5) * 0.18 }).map(([u, v, w]) => [u, v + (j === 3 ? (r() - 0.5) * 0.05 : 0), w])), { cap0: true, cap1: true });
    put(rock, blob, mapper(M4(x, gy, z, YAW + turn)));
  }
  box(0, 0.3, H0a + 0.9, H0d + 1.0, yLow - 0.3, yB + 0.3, 'ledge');
  // the inscription face
  let inscrMesh = null;
  if (inscr) {
    const [x, z] = W(0, inscr.d + 0.004), ym = (inscr.y0 + inscr.y1) / 2;
    const ph = Math.min(0.66, inscr.y1 - Math.max(inscr.y0, yB) - 0.04);
    inscrMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.3, ph), null);
    inscrMesh.position.set(x, Math.max(ym, yB + ph / 2 + 0.02), z);
    inscrMesh.rotation.y = YAW;
  }

  // ---------------------------------------------------------------- the hetman on top
  put(bronze, hetman(), mapper(frame(0, yTop, 0.1, FIG)));
  box(0, 0.05, 0.95, 0.85, yTop, yTop + 4.2);
  box(0, 0.35, 0.45, 0.4, yTop + 4.2, yTop + 5.1);

  // ---------------------------------------------------------------- the plaque wall behind, the side groups, junipers
  const gW = Math.min(gl(-11, WALL_D), gl(11, WALL_D), gl(0, WALL_D));
  for (const sd of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const a0 = sd * (3.2 + k * 1.3), a1 = a0 + sd * 1.22, am = (a0 + a1) / 2, yb = gl(am, WALL_D) - 0.3, yt = gl(am, WALL_D) + 0.78;
      B.gran.setColor([0.66, 0.64, 0.62].map((v) => v * (0.9 + r() * 0.15))).with(P, (q) => q.box(Math.min(a0, a1), yb, WALL_D - 0.25, Math.max(a0, a1), yt, WALL_D + 0.25));
      if (k >= 1 && k <= 4) { // the battle plaques: bronze cartouches with a raised rim
        B.det.setColor('#2e2a24').with(P, (q) => q.box(am - 0.42, yt - 0.66, WALL_D + 0.25, am + 0.42, yt - 0.14, WALL_D + 0.29));
        B.det.setColor('#4a4335').with(P, (q) => q.box(am - 0.34, yt - 0.58, WALL_D + 0.29, am + 0.34, yt - 0.22, WALL_D + 0.3));
      }
    }
    box(sd * (3.2 + 3.9), WALL_D, 3.9, 0.26, gW - 0.3, gW + 0.85);
  }
  const groupTop = [];
  for (const sd of [-1, 1]) {
    const a = sd * GROUP_A, d = GROUP_D, [ha, hd, bh] = BLOCK;
    const gy = Math.max(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => gl(a + u * ha, d + v * hd)));
    const y0 = Math.min(...[[-1, -1], [1, 1], [1, -1], [-1, 1]].map(([u, v]) => gl(a + u * ha, d + v * hd))) - 0.25, y1 = gy + 0.8, y2 = gy + bh;
    B.gran.with(frame(a, 0, d), (q) => {
      for (const [ya, yb, e] of [[y0, y1, 0.05], [y1, y2, 0]]) {
        let s0 = -ha - e;
        while (s0 < ha + e - 0.05) { const s1 = Math.min(ha + e, s0 + 0.9 + r() * 0.8), tn = 0.86 + r() * 0.2; q.setColor([0.76 * tn, 0.74 * tn, 0.71 * tn]).box(s0, ya, -hd - e, s1, yb - 0.01, hd + e); s0 = s1; }
      }
    });
    box(a, d, ha + 0.05, hd + 0.05, y0, y2, 'ledge');
    box(a, d, 1.6, 0.9, y2, y2 + 2.6);
    put(bronze, sd < 0 ? arms() : chaika(), mapper(frame(a, y2, d)));
    groupTop.push([a, d, y2]);
  }
  // junipers in the bed before the wall, round the pedestal and in front of the blocks
  let mounds = 0;
  for (let a = -11.2; a <= 11.2; a += 1.25) for (let d = -3.8; d <= 5.2; d += 1.45) {
    const ja = a + (r() - 0.5) * 0.6, jd = d + (r() - 0.5) * 0.5;
    if (Math.abs(ja) < H0a + 1.1 && jd < H0d + 1.3) continue;
    if (Math.abs(Math.abs(ja) - GROUP_A) < BLOCK[0] + 0.5 && Math.abs(jd - GROUP_D) < BLOCK[1] + 0.4) continue;
    const [x, z] = W(ja, jd);
    mound(juniper, x, g(x, z) - 0.05, z, 0.8 + r() * 0.4, 0.38 + r() * 0.2, 0.75 + r() * 0.35, r); mounds++;
  }
  // a juniper hedge in front of each side block
  for (const sd of [-1, 1]) for (let k = -1; k <= 1; k++) { const [x, z] = W(sd * GROUP_A + k * 1.3, GROUP_D + BLOCK[1] + 0.9); mound(juniper, x, g(x, z) - 0.05, z, 0.85, 0.45, 0.6, r); mounds++; }

  // ---------------------------------------------------------------- projectors and lamps
  const flood = [];
  const projector = (a, d, aimA, aimD) => {
    const [x, z] = W(a, d), yy = g(x, z), m = M4(x, yy, z, Math.atan2(...W(aimA, aimD).map((v, i) => v - [x, z][i])));
    B.det.setColor('#1d1f21').with(m, (q) => q.box(-0.22, 0, -0.18, 0.22, 0.32, 0.18));
    B.glow.with(m, (q) => q.box(-0.17, 0.06, 0.18, 0.17, 0.28, 0.2, 16));
    flood.push([x, yy + 0.3, z]);
  };
  projector(-2.6, H0d + 1.7, 0, 0); projector(2.6, H0d + 1.7, 0, 0);
  for (const [a, d] of groupTop) projector(a + Math.sign(a) * -0.2, d + BLOCK[1] + 2.2, a, d);
  let lamps = 0;
  const lamp = (x, z) => {
    const yy = g(x, z);
    B.det.setColor('#232527').cyl(x, yy, z, 0.14, 0.11, 0.5, 8).cyl(x, yy + 0.5, z, 0.07, 0.055, 4.3, 8).cyl(x, yy + 4.8, z, 0.3, 0.28, 0.14, 12);
    B.glow.cyl(x, yy + 4.74, z, 0.26, 0.26, 0.06, 12);
    S.cyl(x, z, yy, yy + 4.9, 0.13, 0.1, 'pole'); lamps++;
  };
  for (const [x, z] of [[-33.5, 1264], [-33.5, 1296.5], [-18, 1296.5]]) lamp(x, z);

  // ---------------------------------------------------------------- paving: the slabs in front and the sett apron by the bed
  // (0.24 / 0.26 over the terrain: clear of the OSM walks at 0.19 and level with Druzhba's paving they meet at z 1262)
  // a flat plane draped on the terrain: three's own grid laid down, each vertex lifted onto the ground, uv in `scale` metres
  const paveMesh = (x0, z0, x1, z1, cell, scale, lift) => {
    const plane = new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.ceil((x1 - x0) / cell), Math.ceil((z1 - z0) / cell));
    plane.rotateX(-PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const P = plane.attributes.position, T = plane.attributes.uv;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i); P.setY(i, g(x, z) + lift); T.setXY(i, x / scale, z / scale); }
    plane.computeVertexNormals();
    return plane;
  };

  // ---------------------------------------------------------------- meshes
  const group = Object.assign(new THREE.Group(), { name: 'bohdan' });
  root.add(group);
  const gTex = graniteTex();
  const M = {
    gran: floodlit(new THREE.MeshStandardMaterial({ map: gTex, emissiveMap: gTex, vertexColors: true, roughness: 0.88, emissive: 0xffe2c0, emissiveIntensity: 0 }), flood, 11),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.3 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.3, emissive: 0xffe0b0, emissiveIntensity: 0.05 }),
  };
  const bronzeMat = floodlit(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.6, side: THREE.DoubleSide, emissive: 0xc99a62, emissiveIntensity: 0 }), flood, 13);
  const rockMat = floodlit(new THREE.MeshStandardMaterial({ color: 0x9c9890, roughness: 0.92, emissive: 0xffe2c0, emissiveIntensity: 0 }), flood, 9);
  const juniperMat = new THREE.MeshStandardMaterial({ color: 0x2f4a33, roughness: 1 });
  const inscrMat = floodlit(new THREE.MeshStandardMaterial({ map: inscriptionTex(), roughness: 0.6, emissive: 0xffe2c0, emissiveIntensity: 0 }), flood, 11);
  inscrMat.emissiveMap = inscrMat.map;
  let nV = 0;
  for (const [k, D] of Object.entries(B)) {
    if (!D.v) continue;
    nV += D.v;
    group.add(Object.assign(new THREE.Mesh(D.build(), M[k]), { name: 'bohdan-' + k, castShadow: k !== 'glow', receiveShadow: true }));
  }
  for (const [name, s, mat, shadow] of [['bronze', bronze, bronzeMat, true], ['rock', rock, rockMat, true], ['juniper', juniper, juniperMat, false]]) {
    if (!s.v) continue;
    nV += s.v;
    const geo = s.build();
    group.add(Object.assign(new THREE.Mesh(s === bronze ? patina(geo) : geo, mat), { name: 'bohdan-' + name, castShadow: shadow, receiveShadow: true }));
  }
  if (inscrMesh) { inscrMesh.material = inscrMat; inscrMesh.name = 'bohdan-inscription'; group.add(inscrMesh); }
  const slab = slabTex(), sett = settTex();
  group.add(Object.assign(new THREE.Mesh(paveMesh(...PAVE, 2, 4, 0.24), decal(new THREE.MeshStandardMaterial({ map: slab, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4 }))), { name: 'bohdan-square', receiveShadow: true }));
  group.add(Object.assign(new THREE.Mesh(paveMesh(...SETTS, 1.2, 1, 0.26), decal(new THREE.MeshStandardMaterial({ map: sett, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -5 }))), { name: 'bohdan-setts', receiveShadow: true }));

  // trees behind: blue spruces at the wall ends, weeping birches over the back of the bed
  const spots = [], blue = [PARK_PINE[0].map(([rr, gg, bb]) => [0.8 * rr, 0.95 * gg, 1.25 * bb])];
  for (const [a, d, sc] of [[-9.5, -6.2, 1.25], [7.5, -6.4, 1.05], [16.5, -1.5, 1.15]]) { const [x, z] = W(a, d); spots.push({ x, z, kind: 'conifer', variant: 'spruce', sc, pal: blue }); }
  for (const [a, d] of [[-6, -7], [5.5, -7.2], [12.5, -5.2], [-14.5, -4.5], [19.5, 2.5]]) { const [x, z] = W(a, d); spots.push({ x, z, kind: 'park', variant: 'birch', sc: 0.9 + r() * 0.2 }); }

  console.log(`[cherkasy] Bohdan Khmelnytsky: pedestal ${(yTop - yB).toFixed(1)} m, ${mounds} junipers, ${lamps} lamps, ${flood.length} projectors, ${(nV / 1000).toFixed(1)}k verts in ${(performance.now() - t0).toFixed(0)} ms`);
  const inRect = (x, z, [x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1;
  return {
    spots,
    clear: (x, z) => inRect(x, z, PAVE) || inRect(x, z, SETTS) || inRect(x, z, BED),
    update() {
      const k = Math.min(1, 3 * nightK.value); // the projectors come on early in the evening
      bronzeMat.emissiveIntensity = 0.07 * k; M.gran.emissiveIntensity = 0.03 * k; rockMat.emissiveIntensity = 0.03 * k; inscrMat.emissiveIntensity = 0.03 * k;
      M.glow.emissiveIntensity = 0.05 + 2.6 * k;
    },
  };
}
