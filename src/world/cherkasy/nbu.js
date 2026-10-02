// OWNER: cherkasy. Національний банк України, the Cherkasy office: вулиця Остафія Дашковича, 21, on the corner with
// Khreshchatyk, diagonally across the crossing from Блакитний палац (OSM way 157594229, tagged 3 levels and extruded
// as a flat box). A modest rebuild after the uk.wikipedia photo (НБУ (Черкаси).JPG): four storeys, a grey-blue
// rusticated ground floor on a red granite plinth under pale yellow render; on the corner block toward Dashkovycha a
// giant order of four white Ionic columns on a ledge over the ground floor, carrying a pediment; the oak door under a
// small canopy in the middle. The wing along Dashkovycha has tall round-arched windows through the second and third
// floors in grey archivolts; brown window frames, grey cornices, dark grey hipped roofs. No lettering or emblem.
//   NBU_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildNbu({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls come from civic.js faces; the roofs are three hips over the map-axis parts of the L (the corner block's
// front end is the pediment's gable).
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng } from './geo.js';
import { wallFaces, at, quad, fbox, fsolid, rampSolid, wallAround, stoneTex, pack, plainOpening, facePoly, archPts, hipRoof, roofFace } from './civic.js';

const OSM_ID = 157594229;
export const NBU_SKIP = new Set([OSM_ID]);

const LIFT = 0.45, GF = 4.4, FL = 3.6, NF = 3;
const YELLOW = '#ead88f', BASE = '#737d84', GREY = '#7e8a92', WHITE = '#f1efe9', GRANITE = '#6c4840', ROOF = '#5a6166', FRAME = '#5a3a2a';
const GLASS = ['#4f5a61', '#5a656b', '#e2dccb', '#56626a'], WU = [3, 3];

export function buildNbu({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((q) => q.id === OSM_ID);
  if (!b) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 99991), n0 = S.count ?? 0;
  const ring = ringPts(b.p), F = wallFaces(ring);
  const mid = (f) => at(f, f.w / 2, 0);
  const porticoF = F.filter((f) => f.nz < -0.9 && mid(f)[0] > 156).reduce((m, f) => (f.w > m.w ? f : m));
  const dashF = F.filter((f) => f.nz < -0.9 && f !== porticoF);
  const khrF = F.filter((f) => f.nx > 0.9);

  const gS = Math.max(...[...dashF, porticoF, ...khrF].map((f) => { const p = at(f, f.w / 2, 0, 2); return heightAt(p[0], p[2]); }));
  const gBase = Math.min(...ring.map(([x, z]) => heightAt(x, z))) - 0.6;
  const yF = gS + LIFT, y2 = yF + GF, yE = y2 + NF * FL, fl = (k) => y2 + (k - 1) * FL;

  const B = { wall: new MB(), base: new MB(), plinth: new MB(), det: new MB(), glass: new MB(), lit: new MB() };
  const D = B.det;
  let nWin = 0;
  const win = (f, s0, s1, y0, y1, extra = {}) => {
    const blind = r() < 0.35;
    f.open.push({ s0, s1, y0, y1, dep: 0.22, rev: '#d9d2bf', mull: FRAME, glass: blind ? GLASS[2] : GLASS[Math.floor(r() * 2)], lit: r() < 0.3, ...extra });
    nWin++;
  };
  const arched = []; // [f, s0, s1, ys, yA]
  // regular bays: a window per storey, the ground floor's in the grey base
  const bays = (f, step, margin = 0.8) => { const n = Math.max(1, Math.round((f.w - 2 * margin) / step)), st = (f.w - 2 * margin) / n; return Array.from({ length: n }, (_, i) => margin + (i + 0.5) * st); };
  const column = (f, c, hw, { arch = false, ground = true } = {}) => {
    if (ground) win(f, c - hw, c + hw, yF + 1.0, yF + 3.3, { rev: '#9aa3a9' });
    if (arch) { // through the second and third floors
      const ys = fl(2) + 2.5, yA = ys + hw;
      win(f, c - hw, c + hw, fl(1) + 0.8, yA, { mull: FRAME, lit: r() < 0.4 });
      arched.push([f, c - hw, c + hw, ys, yA]);
      win(f, c - hw, c + hw, fl(3) + 0.9, fl(3) + 2.7);
    } else for (let k = 1; k <= NF; k++) win(f, c - hw, c + hw, fl(k) + 0.9, fl(k) + 2.7);
  };
  for (const f of dashF) for (const c of bays(f, 3.9)) column(f, c, 0.85, { arch: f.w > 20 });
  for (const f of khrF) {
    // the bay nearest Dashkovycha gets a tall arched window, as on the corner in the photo
    const s0 = at(f, 0, 0)[2] < at(f, f.w, 0)[2] ? 0 : f.w;
    for (const c of bays(f, 3.2)) column(f, c, 0.75, { arch: f.w > 12 && Math.abs(c - s0) < 3.2 });
  }
  for (const f of F) {
    if (f === porticoF || dashF.includes(f) || khrF.includes(f) || f.w < 3) continue;
    for (const c of bays(f, 3.6)) column(f, c, 0.75, { ground: r() < 0.8 });
  }

  // ---- the portico: windows in pairs between the columns, the door in the middle, the ledge, columns, pediment
  const f = porticoF, w = f.w, m = w / 2, colS = [0, 1, 2, 3].map((i) => 0.75 + i * (w - 1.5) / 3);
  for (let i = 0; i < 3; i++) {
    const c = (colS[i] + colS[i + 1]) / 2;
    for (const d of [-0.95, 0.95]) {
      for (let k = 1; k <= NF; k++) win(f, c + d - 0.62, c + d + 0.62, fl(k) + 0.9, fl(k) + 2.7);
      if (i !== 1) win(f, c + d - 0.62, c + d + 0.62, yF + 1.0, yF + 3.3, { rev: '#9aa3a9' });
    }
  }
  f.open.push({ s0: m - 1.1, s1: m + 1.1, y0: yF, y1: yF + 3.2, dep: 0.35, rev: GRANITE, glass: '#6b4426', lit: false });
  D.setColor(GRANITE);
  fbox(D, f, m - 1.7, m - 1.1, yF, yF + 3.8, 0, 0.18, 1 | 4 | 8 | 16); fbox(D, f, m + 1.1, m + 1.7, yF, yF + 3.8, 0, 0.18, 1 | 4 | 8 | 16);
  fbox(D, f, m - 1.7, m + 1.7, yF + 3.2, yF + 3.8, 0, 0.18, 1 | 16 | 32);
  D.setColor('#8a6a4d'); fbox(D, f, m - 1.9, m + 1.9, yF + 3.85, yF + 4.0, 0, 1.3, 63); // the canopy
  fsolid(S, f, m - 1.9, m + 1.9, 0, 1.3, yF + 3.85, yF + 4.0, 'awning', 1);
  D.setColor('#b9b2a6'); // two steps up to the door
  fbox(D, f, m - 2.4, m + 2.4, gBase, yF - 0.22, 0, 1.8, 1 | 4 | 8 | 16); fbox(D, f, m - 2.0, m + 2.0, gBase, yF, 0, 1.0, 1 | 4 | 8 | 16);
  rampSolid(S, f, m - 2.4, m + 2.4, 0, 1.8, yF, yF - 0.45, gBase);
  D.setColor(GREY); fbox(D, f, -0.1, w + 0.1, y2 - 0.3, y2 + 0.15, 0, 1.25, 63); // the ledge the columns stand on
  for (const s of colS) {
    const p = at(f, s, 0, 0.72), yT = yE - 1.15;
    D.setColor(WHITE);
    D.cyl(p[0], y2 + 0.15, p[2], 0.62, 0.62, 0.3, 12, true);
    D.cyl(p[0], y2 + 0.45, p[2], 0.52, 0.45, yT - y2 - 0.45, 12, false);
    fbox(D, f, s - 0.68, s + 0.68, yT, yT + 0.32, 0.28, 1.16, 63); // the volutes, as a cushion
    D.setColor(GREY); fbox(D, f, s - 0.6, s + 0.6, yT + 0.32, yT + 0.42, 0.2, 1.24, 1 | 4 | 8 | 16);
    S.cyl(p[0], p[2], y2, yT, 0.55);
  }
  D.setColor(GREY);
  fbox(D, f, -0.1, w + 0.1, yE - 0.75, yE - 0.4, 0, 1.3, 1 | 4 | 8 | 32);            // architrave on the columns
  fbox(D, f, -0.3, w + 0.3, yE - 0.4, yE, 0, 1.55, 63);                                 // the horizontal cornice
  const yPk = yE + 3.6, Tri = [[-0.1, yE], [w + 0.1, yE], [m, yPk]];
  D.setColor(YELLOW); facePoly(D, f, Tri, 1.15);
  D.setColor(GREY);
  for (const [a, c] of [[[-0.35, yE], [m, yPk + 0.15]], [[m, yPk + 0.15], [w + 0.35, yE]]]) {
    const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, th = 0.42, nU = [-uy, ux];
    // the raking cornice: a slanted bar over the tympanum
    const P = (t, k, o) => at(f, a[0] + ux * t + nU[0] * k, a[1] + uy * t + nU[1] * k, o);
    quad(D, P(0, 0, 1.6), P(l, 0, 1.6), P(l, th, 1.6), P(0, th, 1.6), f.N);
    quad(D, P(0, th, 1.6), P(l, th, 1.6), P(l, th, 0), P(0, th, 0), [f.rx * nU[0], nU[1], f.rz * nU[0]]);
    quad(D, P(0, 0, 1.6), P(l, 0, 1.6), P(l, 0, 1.1), P(0, 0, 1.1), [-f.rx * nU[0], -nU[1], -f.rz * nU[0]]);
  }

  // ---- walls: plinth, the grey-blue base, yellow render; grey bands and cornice round the rest
  for (const g of F) {
    wallAround(B.plinth, g, gBase, yF + 0.35, [1.2, 0.8], GRANITE);
    wallAround(B.base, g, yF + 0.35, y2, [3, 1.1], BASE);
    wallAround(B.wall, g, y2, yE, WU, YELLOW);
    for (const q of g.open) plainOpening(B, g, q);
    if (g === porticoF) continue;
    D.setColor(GREY);
    fbox(D, g, -0.05, g.w + 0.05, y2 - 0.3, y2 + 0.1, 0, 0.16, 1 | 16 | 32);
    fbox(D, g, -0.1, g.w + 0.1, yE - 0.45, yE, 0, 0.55, 1 | 16 | 32);
    const a = at(g, 0, 0, -0.1), c = at(g, g.w, 0, -0.1);
    Z.edge(a[0], a[2], c[0], c[2], yE, g.nx, g.nz);
  }
  // window heads: wall spandrels over the arch, a grey archivolt round it; grey sills under the upper windows
  for (const [g, s0, s1, ys, yA] of arched) {
    const A = archPts(s0, s1, ys, 'round'), Ao = archPts(s0, s1, ys, 'round', 0.2), k = (A.length - 1) / 2;
    B.wall.setColor(YELLOW);
    facePoly(B.wall, g, [[s0, yA], ...A.slice(0, k + 1)], 0, WU);
    facePoly(B.wall, g, [[s1, yA], ...A.slice(k).reverse()], 0, WU);
    D.setColor(GREY);
    for (let i = 0; i < A.length - 1; i++) facePoly(D, g, [A[i], Ao[i], Ao[i + 1], A[i + 1]], 0.06);
  }
  D.setColor(GREY);
  for (const g of F) for (const q of g.open) if (q.y0 > y2) fbox(D, g, q.s0 - 0.08, q.s1 + 0.08, q.y0 - 0.1, q.y0, 0, 0.1, 1 | 4 | 8 | 16);

  // ---- roofs: hips over the wing's two parts; the corner block ridged toward the pediment, hipped at the back
  D.setColor(ROOF);
  D.fill(ring, [], yE - 0.02, true);
  hipRoof(D, 111.9, 212.8, 131.2, 228.1, yE, 3.4);
  hipRoof(D, 131.0, 211.8, 156.9, 224.3, yE, 2.9);
  {
    const fr = at(f, 0, 0, 1.55)[2], x0 = 156.8, x1 = 170.7, z1 = 242.1, xm = (x0 + x1) / 2, h = (x1 - x0) / 2, Y = yPk;
    roofFace(D, [[x0, yE, fr], [x0, yE, z1], [xm, Y, z1 - h], [xm, Y, fr]]);
    roofFace(D, [[x1, yE, fr], [xm, Y, fr], [xm, Y, z1 - h], [x1, yE, z1]]);
    roofFace(D, [[x0, yE, z1], [x1, yE, z1], [xm, Y, z1 - h]]);
  }
  S.prism(ring.flat(), gBase, yE + 1.2, 0, 0, 'wall');

  // ---- meshes
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: stoneTex(r, [244, 242, 236], { cols: 1, rows: 1, joint: 0, grain: 0.05 }), vertexColors: true, roughness: 0.9 }),
    base: new THREE.MeshStandardMaterial({ map: stoneTex(r, [240, 240, 240], { cols: 1, rows: 2, joint: 0.35, grain: 0.06 }), vertexColors: true, roughness: 0.85 }),
    plinth: new THREE.MeshStandardMaterial({ map: stoneTex(r, [236, 230, 226], { cols: 2, rows: 2, joint: 0.3, grain: 0.1 }), vertexColors: true, roughness: 0.5 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.3, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffe6bf, emissiveIntensity: 0 }),
  };
  const st = pack(root, 'nbu', B, M);
  console.log(`[cherkasy] NBU: ${nWin} windows, ${arched.length} arched, ${(st.verts / 1000).toFixed(1)}k verts, ${(st.tris / 1000).toFixed(1)}k tris, ${st.meshes} meshes, ${(S.count ?? 0) - n0} solids, floor ${yF.toFixed(1)} m, in ${(performance.now() - t0).toFixed(0)} ms`);

  const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
  const X0 = Math.min(...xs), X1 = Math.max(...xs), Z0 = Math.min(...zs), Z1 = Math.max(...zs);
  return {
    footprints: [{ poly: ring, h: yPk - gS, kind: b.k, name: 'Національний банк України' }],
    // no generated trees against the walls or on the steps (the yard behind keeps its own)
    clear: (x, z) => x > X0 - 2 && x < X1 + 2 && z > Z0 - 3 && z < Z0 + 18,
    update() { M.lit.emissiveIntensity = 1.1 * nightK.value; },
  };
}
