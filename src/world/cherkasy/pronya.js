// OWNER: cherkasy. Проня Прокопівна і Голохвастов (2009, sculptor Олександр Гульбіс; fibreglass painted as bronze,
// set up by the Cherkasy entrepreneurs Nina and Volodymyr Kolisnyk), the heroes of the film comedy «За двома зайцями»,
// on вул. Небесної Сотні near Гоголя (quest «Таємниці Черкас», card `pronya`). After the uk.wikipedia photo («Фігури
// Проні Прокопівни та Голохвастова у Черкасах (1).jpg»): two life-size figures standing on the lawn between the
// carriageway and the pavement, turned to each other and half to the passers-by on the pavement, a low wrought fence
// along the kerb behind them. Pronya in a long full dress with a ruffled hem and a short cape collar, her hair up in a
// bun with ringlets at the temples, her right hand gathering the skirt; Holokhvastov in a top hat, a frock coat open
// over a waistcoat and a bow tie, his right hand on his hip, his left one holding a cane slanting down before him, his
// nose in the air. The paint reads as polished gold-bronze.
//   PRONYA_SKIP: empty (no OSM building is replaced)
//   PRONYA_SPOT: [x, z] between the two figures (places.js keeps a small ring round it)
//   buildPronya({ root, map, solids, heightAt }) -> { update(), clear(x, z), figures: [{ x, z, y, top }] } | null
// The figures are smooth skins (sculpt.js SG with bohdan.js sweeps) in one mesh, ~4k vertices; the fence one more.
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { SG } from './sculpt.js';
import { sweep, ell, put, mapper } from './bohdan.js';

export const PRONYA_SKIP = new Set();
export const PRONYA_SPOT = [-338.7, 760.6];
const PI = Math.PI;
const FIG = [{ who: 'pronya', at: [-339.45, 760.7], face: 0.95, k: 1.06 }, { who: 'holo', at: [-337.9, 760.45], face: -0.85, k: 1 }]; // yaw from +z (toward the pavement)
const FENCE = { x0: -347, x1: -330.5, z: 757.6, h: 0.62 };

// ellipse ring at height y: half sizes rx / rz, centre shifted by dz, wob(a) scales the radius
const er = (y, rx, rz, { dz = 0, n = 20, wob = null } = {}) => Array.from({ length: n }, (_, k) => {
  const a = -k / n * PI * 2, w = wob ? wob(a) : 1;
  return [Math.cos(a) * rx * w, y, dz + Math.sin(a) * rz * w];
});

// Pronya: about 1.68 m to the top of the bun, facing +z, her left hand +x
function pronya() {
  const s = new SG();
  // the skirt: a wide bell with soft folds, a ruffle over the hem, the hem lifted a little at her right where she
  // gathers it
  const fold = (y) => (a) => 1 + 0.045 * Math.sin(a * 9 + y * 3) + 0.02 * Math.sin(a * 5 - y * 7);
  const SK = [[0.0, 0.37, 0.35], [0.12, 0.37, 0.35], [0.14, 0.39, 0.37], [0.24, 0.38, 0.36], [0.26, 0.35, 0.33], [0.4, 0.34, 0.31], [0.42, 0.355, 0.325], [0.5, 0.33, 0.3], [0.52, 0.31, 0.28], [0.68, 0.27, 0.24], [0.84, 0.21, 0.18], [0.96, 0.165, 0.14], [1.02, 0.145, 0.115]];
  s.loft(SK.map(([y, rx, rz]) => er(y, rx, rz, { n: 36, dz: 0.01, wob: fold(y) }).map(([x, yy, z]) => [x, yy + (x < -0.15 && yy < 0.2 ? 0.06 * (-x - 0.15) / 0.3 : 0), z])), { cap0: true });
  // the bodice, the bust, the waist sash with its bow at the back
  s.loft([[1.0, 0.15, 0.12], [1.1, 0.155, 0.115], [1.2, 0.18, 0.13], [1.28, 0.195, 0.135], [1.34, 0.19, 0.12], [1.39, 0.15, 0.1], [1.42, 0.07, 0.06]].map(([y, rx, rz]) => er(y, rx, rz, { n: 24 })), { cap1: true });
  for (const sd of [-1, 1]) ell(s, [sd * 0.065, 1.27, 0.085], [0.07, 0.065, 0.06], [0, 0, 0], 10, 7);
  sweep(s, [...er(1.02, 0.158, 0.125, { n: 16 }), er(1.02, 0.158, 0.125, { n: 16 })[0]], Array(17).fill(0.022), 6, { caps: false });
  ell(s, [0, 1.03, -0.14], [0.07, 0.04, 0.03], [0, 0, 0], 8, 5);
  // the cape collar over the shoulders, its edge wavy
  s.loft([er(1.43, 0.11, 0.09, { n: 28 }), er(1.36, 0.25, 0.17, { n: 28 }), er(1.24, 0.31, 0.21, { n: 28, wob: (a) => 1 + 0.04 * Math.sin(a * 10) }), er(1.22, 0.29, 0.19, { n: 28, wob: (a) => 1 + 0.04 * Math.sin(a * 10) })], { cap0: true, cap1: true });
  // the puffed sleeves and the arms: the right one down to gather the skirt, the left one behind her back
  for (const sd of [-1, 1]) ell(s, [sd * 0.24, 1.3, -0.01], [0.085, 0.11, 0.085], [0, 0, sd * 0.25], 12, 8);
  sweep(s, [[-0.27, 1.22, 0.0], [-0.3, 1.08, 0.02], [-0.3, 0.95, 0.06]], [0.05, 0.042, 0.035], 10);
  ell(s, [-0.3, 0.9, 0.07], [0.035, 0.06, 0.03], [0.2, 0, 0], 8, 6);
  sweep(s, [[0.27, 1.22, -0.03], [0.26, 1.08, -0.1], [0.12, 1.02, -0.17]], [0.05, 0.042, 0.035], 10);
  // the head turned a little toward him: neck, face, the hair drawn up into a bun, ringlets at the temples, earrings
  sweep(s, [[0, 1.41, 0.0], [0, 1.5, 0.01]], [0.045, 0.04], 10);
  const hd = new SG();
  ell(hd, [0, 1.565, 0.015], [0.072, 0.098, 0.088], [0, 0, 0], 14, 10);
  ell(hd, [0, 1.56, 0.1], [0.013, 0.025, 0.02], [0.2, 0, 0], 6, 5);
  ell(hd, [0, 1.6, -0.015], [0.095, 0.09, 0.095], [0, 0, 0], 14, 9);
  ell(hd, [0, 1.665, -0.03], [0.08, 0.06, 0.075], [0, 0, 0], 12, 8);
  for (const sd of [-1, 1]) ell(hd, [sd * 0.06, 1.64, -0.08], [0.05, 0.05, 0.04], [0, 0, 0], 10, 6); // the loops of the updo behind
  for (let k = 0; k < 5; k++) ell(hd, [0.05 * Math.cos(k * 1.3), 1.7 + 0.01 * k, -0.02 + 0.04 * Math.sin(k * 1.3)], [0.03, 0.025, 0.03], [0, 0, 0], 8, 5);
  for (const sd of [-1, 1]) {
    sweep(hd, [[sd * 0.075, 1.6, 0.02], [sd * 0.085, 1.55, 0.03], [sd * 0.08, 1.5, 0.035], [sd * 0.083, 1.46, 0.03]], [0.018, 0.02, 0.018, 0.012], 8, { wob: (u, i) => 1 + 0.2 * Math.sin(u * PI * 4 + i * 2) });
    ell(hd, [sd * 0.075, 1.52, 0.0], [0.01, 0.022, 0.01], [0, 0, 0], 6, 4);
  }
  put(s, hd, mapper(new THREE.Matrix4().makeTranslation(0, 1.42, 0).multiply(new THREE.Matrix4().makeRotationY(0.25)).multiply(new THREE.Matrix4().makeTranslation(0, -1.42, 0))));
  return s;
}

// Holokhvastov: about 1.8 m, 2.02 m to the top of the hat, facing +z, his left hand +x
function holo() {
  const s = new SG();
  // the shoes, the trousers (the left leg a step forward), the frock coat open over a waistcoat
  for (const [sd, f] of [[-1, -0.03], [1, 0.06]]) {
    ell(s, [sd * 0.1, 0.04, 0.05 + f], [0.052, 0.045, 0.13], [0, sd * 0.2, 0], 10, 6);
    sweep(s, [[sd * 0.115, 0.07, f], [sd * 0.12, 0.45, f * 0.6], [sd * 0.11, 0.9, 0]], [0.065, 0.075, 0.09], 12);
  }
  s.loft([[0.86, 0.21, 0.14], [0.98, 0.195, 0.13], [1.1, 0.205, 0.13], [1.25, 0.24, 0.135], [1.38, 0.265, 0.13], [1.44, 0.2, 0.105], [1.47, 0.07, 0.055]].map(([y, rx, rz]) => er(y, rx, rz, { n: 24 })), { cap0: true, cap1: true });
  // the coat's skirts round the back and the sides (open in front), down to mid-thigh
  const sk = (y, rx, rz) => Array.from({ length: 15 }, (_, k) => { const a = (0.35 + k / 14 * 1.3) * PI; return [Math.sin(a) * rx * -1, y, Math.cos(a) * rz]; });
  s.loft([sk(1.0, 0.2, 0.14), sk(0.85, 0.22, 0.16), sk(0.65, 0.24, 0.18)], { closed: false });
  // the lapels, the bow tie, the watch chain's glint and the breast-pocket kerchief
  for (const sd of [-1, 1]) {
    s.loft([[[sd * 0.04, 1.44, 0.11], [sd * 0.13, 1.4, 0.1]], [[sd * 0.06, 1.25, 0.125], [sd * 0.15, 1.3, 0.11]], [[sd * 0.1, 1.08, 0.12], [sd * 0.12, 1.1, 0.12]]].map((r) => r), { closed: false });
    ell(s, [sd * 0.035, 1.44, 0.11], [0.035, 0.022, 0.015], [0, 0, sd * 0.2], 8, 5);
  }
  ell(s, [0.12, 1.33, 0.12], [0.03, 0.025, 0.015], [0, 0, 0], 6, 4);
  // the arms: the right fist on the hip, the left hand forward low on the cane
  sweep(s, [[-0.22, 1.38, 0.0], [-0.33, 1.17, -0.06], [-0.24, 1.0, 0.03]], [0.062, 0.055, 0.045], 10);
  ell(s, [-0.21, 0.99, 0.05], [0.04, 0.05, 0.04], [0, 0, 0], 8, 6);
  sweep(s, [[0.22, 1.38, 0.0], [0.27, 1.14, 0.06], [0.24, 1.0, 0.22]], [0.062, 0.055, 0.045], 10);
  ell(s, [0.24, 0.98, 0.25], [0.04, 0.045, 0.05], [0, 0, 0], 8, 6);
  sweep(s, [[0.22, 1.01, 0.28], [0.25, 1.04, 0.3], [0.28, 1.02, 0.31], [0.24, 0.97, 0.27], [-0.22, 0.66, 0.48]], [0.014, 0.014, 0.014, 0.013, 0.011], 6);
  // the head tipped back: neck, face, side curls, the thin moustache, the top hat
  sweep(s, [[0, 1.45, 0.0], [0, 1.53, 0.0]], [0.05, 0.045], 10);
  const hd = new SG();
  ell(hd, [0, 1.6, 0.015], [0.075, 0.1, 0.09], [0, 0, 0], 14, 10);
  ell(hd, [0, 1.595, 0.105], [0.014, 0.028, 0.022], [0.2, 0, 0], 6, 5);
  for (const sd of [-1, 1]) {
    ell(hd, [sd * 0.07, 1.6, -0.02], [0.03, 0.05, 0.05], [0, 0, 0], 8, 6);
    sweep(hd, [[sd * 0.005, 1.565, 0.1], [sd * 0.035, 1.565, 0.093], [sd * 0.05, 1.575, 0.08]], [0.008, 0.007, 0.003], 6);
  }
  hd.lathe(0, 0.0, [[0, 1.665], [0.15, 1.665], [0.155, 1.678], [0.12, 1.682], [0.088, 1.69], [0.094, 1.86], [0.096, 1.88], [0, 1.88]], 18, { cap0: true });
  put(s, hd, mapper(new THREE.Matrix4().makeTranslation(0, 1.5, 0).multiply(new THREE.Matrix4().makeRotationX(-0.22)).multiply(new THREE.Matrix4().makeRotationY(-0.2)).multiply(new THREE.Matrix4().makeTranslation(0, -1.5, 0))));
  return s;
}

export function buildPronya({ root, solids: S, heightAt }) {
  const t0 = performance.now();
  const all = new SG(), figures = [];
  for (const F of FIG) {
    const [x, z] = F.at, y = heightAt(x, z);
    const m = F.who === 'pronya' ? pronya() : holo();
    put(all, m, mapper(M4(x, y - 0.02, z, F.face, F.k)));
    figures.push({ x, z, y, top: y + (F.who === 'pronya' ? 1.73 * F.k : 2.0) });
    S.cyl(x, z, y, y + 1.75, F.who === 'pronya' ? 0.42 : 0.3, F.who === 'pronya' ? 0.2 : 0.3, 'pole');
  }
  const geo = all.build();
  const group = Object.assign(new THREE.Group(), { name: 'pronya' });
  const paint = new THREE.MeshStandardMaterial({ color: '#8e5a2f', metalness: 0.55, roughness: 0.34 });
  group.add(Object.assign(new THREE.Mesh(geo, paint), { name: 'pronya-figures', castShadow: true, receiveShadow: true }));
  // the low wrought fence along the kerb behind them: posts, two rails, bars with a curl on top
  const D = new MB().setColor('#4a3a2c'), { x0, x1, z, h } = FENCE;
  for (let i = 0, x = x0; x <= x1 + 1e-6; x = x0 + ++i * 0.25) {
    const g = heightAt(x, z), post = i % 8 === 0;
    D.box(x - (post ? 0.025 : 0.008), g, z - (post ? 0.025 : 0.008), x + (post ? 0.025 : 0.008), g + h + (post ? 0.06 : 0), z + (post ? 0.025 : 0.008));
  }
  for (let x = x0; x < x1 - 1e-6; x += 2) {
    const xb = Math.min(x1, x + 2), ga = heightAt(x, z), gb = heightAt(xb, z);
    for (const yy of [0.12, h - 0.06]) D.face([[x, ga + yy, z + 0.012], [xb, gb + yy, z + 0.012], [xb, gb + yy + 0.035, z + 0.012], [x, ga + yy + 0.035, z + 0.012]], [0, 0, 1]).face([[x, ga + yy, z - 0.012], [xb, gb + yy, z - 0.012], [xb, gb + yy + 0.035, z - 0.012], [x, ga + yy + 0.035, z - 0.012]], [0, 0, -1]);
    S.box(x, Math.min(ga, gb), z - 0.03, xb, Math.max(ga, gb) + h, z + 0.03, 'wall');
  }
  group.add(Object.assign(new THREE.Mesh(D.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide })), { name: 'pronya-fence', castShadow: true }));
  root.add(group);
  console.log(`[cherkasy] Pronya & Holokhvastov: ${((geo.attributes.position.count + D.v) / 1000).toFixed(1)}k verts in ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    figures,
    clear: (x, z) => Math.abs(x - PRONYA_SPOT[0]) < 4 && Math.abs(z - PRONYA_SPOT[1]) < 3.5,
    update() {},
  };
}
