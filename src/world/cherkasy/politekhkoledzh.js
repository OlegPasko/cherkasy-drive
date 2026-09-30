// OWNER: cherkasy. Вулиця Надпільна, 226 (OSM 155200995): the Cherkasy polytechnic college in the former «Казенний
// винний склад» (the state wine warehouse, 1905; local heritage), after the newscherkasy.com and novadoba.com.ua photos
// of the street front and the satellite view. Three tall storeys of ochre-yellow brick over a low plinth with white-framed
// basement lights; red brick string courses at the floors, red lesenes between the bays, a red corbelled cornice under a
// low parapet and a hipped grey metal roof. The windows go in pairs: under white hoods on the ground floor, under red
// segmental arches above. Near the south-west end of the street front a shallow risalit rises over the cornice: triple
// windows, an arcade of five small arched lights in its attic and a round-topped gable with an oculus. Windows light up
// at night.
//   POLITEKH_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildPolitekh({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per ring edge in a face frame (slabkit.js): s along the edge, y up, o outward; brick uv in metres.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng, obb, bboxOf } from './geo.js';
import { canvasTex } from './sculpt.js';
import { ringFaces, face, at, rect, box, skin, hole, solid, finish, quad, UP } from './slabkit.js';

const OSM_ID = 155200995;
export const POLITEKH_SKIP = new Set([OSM_ID]);

const PL = 1.2, FH = 4.2, NF = 3, PARA = 0.7, PITCH = 3.2;   // plinth, storey, storeys, parapet, roof rise
const YEL = '#d9ad6b', RED = '#a24c36', WHITE = '#efece4', FRAME = '#f2f1ec';
const GLASS = ['#4a555c', '#56605f', '#3f4a52', '#606a6c'];
const RIS = [15.5, 4.5];                                     // the risalit: metres from the SW end of the front (outer, inner)

// running bond, 1 m per repeat (4 bricks x 13 courses): pale bricks the vertex colour tints yellow or red
const brickTex = (r) => {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b9b2a6'; g.fillRect(0, 0, w, h);
    const bw = w / 4, bh = h / 13;
    for (let j = 0; j < 13; j++) for (let i = 0; i < 5; i++) {
      const v = 228 + r() * 27, x = i * bw - (j & 1 ? bw / 2 : 0);
      g.fillStyle = `rgb(${v | 0},${(v - 4) | 0},${(v - 10) | 0})`; g.fillRect(x + 1.5, j * bh + 1.5, bw - 3, bh - 3);
    }
  });
  return t;
};

export function buildPolitekh({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const ring = ringPts(bld.p), faces = ringFaces(ring);
  const hs = ring.map((p) => heightAt(p[0], p[1])), gLo = Math.min(...hs) - 0.4;
  const yF = Math.max(...hs) + PL, Y = (h) => yF + h, TOPC = Y(NF * FH + 0.4), TOP = TOPC + PARA;
  const B = { brick: new MB(), det: new MB(), lit: new MB(), glass: new MB(), roof: new MB() };
  const D = B.det, BUV = [1, 1];
  let nWin = 0;
  const win = (f, s0, s1, y0, y1, extra) => { f.cuts.push({ s0, s1, y0, y1, glass: GLASS[(r() * 4) | 0], lit: r() < 0.35, frame: FRAME, rev: '#d8c7a8', dep: 0.3, pitch: 1.2, ...extra }); nWin++; };
  // segmental arch band over s = c +- hw from y0: `rise` at the crown, `th` deep in y, standing `dep` proud
  function arch(f, c, hw, y0, rise, th, dep, col) {
    const R = (hw * hw + rise * rise) / (2 * rise), yc = y0 + rise - R, N = 6;
    const pt = (i) => { const s = c - hw + (2 * hw * i) / N; return [s, yc + Math.sqrt(Math.max(0, R * R - (s - c) ** 2))]; };
    D.setColor(col);
    for (let i = 0; i < N; i++) {
      const [sa, ya] = pt(i), [sb, yb] = pt(i + 1);
      quad(D, at(f, sa, ya, dep), at(f, sb, yb, dep), at(f, sb, yb + th, dep), at(f, sa, ya + th, dep), f.N);
      quad(D, at(f, sa, ya + th, 0), at(f, sb, yb + th, 0), at(f, sb, yb + th, dep), at(f, sa, ya + th, dep), UP);
    }
  }
  const front = faces.reduce((b, f) => (f.nz > 0.9 && f.L > (b?.L ?? 0) ? f : b), null);

  for (const f of faces) {
    if (f.L < 0.5) continue;
    const main = f.L >= 8, isFront = f === front;
    const ris = isFront ? [f.L - RIS[0], f.L - RIS[1]] : null;
    f.bays = [];
    if (main) {
      // bays of paired windows between lesenes; the risalit's stretch of the front is laid on its own plane
      const runs = ris ? [[0, ris[0]], [ris[1], f.L]] : [[0, f.L]];
      for (const [a, b] of runs) {
        const n = Math.max(1, Math.round((b - a) / 5.6)), p = (b - a) / n;
        for (let i = 0; i < n; i++) f.bays.push([a + i * p, a + (i + 1) * p]);
      }
      for (const [a, b] of f.bays) {
        const c = (a + b) / 2, pair = [[c - 1.55, c - 0.35], [c + 0.35, c + 1.55]];
        for (const [s0, s1] of pair) {
          win(f, s0, s1, Y(1.0), Y(3.3), { tr: Y(2.6) });
          win(f, s0, s1, Y(FH + 0.9), Y(FH + 3.2), { tr: Y(FH + 2.5) });
          win(f, s0, s1, Y(2 * FH + 0.9), Y(2 * FH + 3.1), { tr: Y(2 * FH + 2.4) });
          const gd = heightAt(...(([x, , z]) => [x, z])(at(f, (s0 + s1) / 2, 0, 1)));
          if (gd < Y(-0.8)) f.cuts.push({ s0: s0 + 0.1, s1: s1 - 0.1, y0: Y(-0.85), y1: Y(-0.3), glass: '#2c3134', frame: '#2c3134', rev: WHITE, dep: 0.15, pitch: 2 });
        }
      }
    }
    if (ris) f.cuts.push({ s0: ris[0], s1: ris[1], y0: gLo - 1, y1: TOP + 1, cover: true });
    const walls = f.cuts.filter((q) => !q.cover);
    skin(B.brick, f, gLo, Y(-0.05), '#b98f5a', BUV);
    skin(B.brick, f, Y(-0.05), TOP, YEL, BUV);
    for (const q of walls) hole(B, f, q);
    // the red dressing: plinth course, string courses, lesenes, cornice with corbels, the arches and hoods
    for (const [a, b] of ris ? [[0, ris[0]], [ris[1], f.L]] : [[0, f.L]]) {
      B.brick.setColor(RED);
      box(B.brick, f, a, b, Y(-0.15), Y(0.1), 0, 0.08, 'ft', BUV);
      for (let k = 1; k < NF; k++) box(B.brick, f, a, b, Y(k * FH - 0.2), Y(k * FH + 0.15), 0, 0.07, 'ftu', BUV);
      box(B.brick, f, a, b, TOPC - 0.55, TOPC, 0, 0.16, 'ftu', BUV);
      D.setColor(RED); for (let s = a + 0.3; s < b - 0.2; s += 0.55) box(D, f, s - 0.1, s + 0.1, TOPC - 0.85, TOPC - 0.55, 0, 0.13, 'flru');
      D.setColor('#c7c2b8'); box(D, f, a - 0.05, b + 0.05, TOP, TOP + 0.06, -0.3, 0.06, 'ft');
    }
    for (const [a] of f.bays) { B.brick.setColor(RED); box(B.brick, f, a - 0.3, a + 0.3, Y(0.1), TOPC - 0.55, 0, 0.06, 'flr', BUV); }
    if (f.bays.length) { const e = f.bays[f.bays.length - 1][1]; B.brick.setColor(RED); box(B.brick, f, e - 0.3, e + 0.3, Y(0.1), TOPC - 0.55, 0, 0.06, 'flr', BUV); }
    for (const q of walls) {
      if (q.y0 < Y(0)) continue;
      const c = (q.s0 + q.s1) / 2, hw = (q.s1 - q.s0) / 2 + 0.15;
      if (q.y0 < Y(FH)) { D.setColor(WHITE); box(D, f, q.s0 - 0.25, q.s1 + 0.25, q.y1 + 0.1, q.y1 + 0.35, 0, 0.18, 'ftu'); arch(f, c, hw, q.y1 + 0.35, 0.25, 0.08, 0.12, WHITE); }
      else arch(f, c, hw, q.y1 + 0.02, 0.35, 0.3, 0.06, RED);
      D.setColor(WHITE); box(D, f, q.s0 - 0.08, q.s1 + 0.08, q.y0 - 0.08, q.y0, 0, 0.1, 'ftu');
    }
    D.setColor('#cfc8ba'); rect(D, f, 0, f.L, TOPC, TOP, -0.35, null, [-f.nx, 0, -f.nz]);
    if (f.L > 3) { const p0 = at(f, 0, 0, -0.12), p1 = at(f, f.L, 0, -0.12); Z.edge(p0[0], p0[2], p1[0], p1[2], TOP, f.nx, f.nz); }
  }

  // ---- the risalit: 0.5 m proud, triple windows, the attic arcade, the round-topped gable with the oculus
  if (front) {
    const [sa, sb] = [front.L - RIS[0], front.L - RIS[1]], O = 0.5;
    const pa = at(front, sa, 0, O), pb = at(front, sb, 0, O), rf = face([pa[0], pa[2]], [pb[0], pb[2]], front.nx, front.nz), W = rf.L, c = W / 2;
    const GT = TOPC + 2.6, RISE = 2.4;                         // the attic top, the gable's rise over it
    for (let k = 0; k < NF; k++) for (const d of [-1.6, 0, 1.6]) {
      const y0 = Y(k * FH + (k ? 0.9 : 1.0)), y1 = y0 + (k === NF - 1 ? 2.2 : 2.3);
      win(rf, c + d - 0.55, c + d + 0.55, y0, y1, { tr: y1 - 0.7 });
    }
    for (let i = -2; i <= 2; i++) win(rf, c + i * 1.25 - 0.35, c + i * 1.25 + 0.35, TOPC + 0.5, TOPC + 1.9, { pitch: 2, dep: 0.25 });
    skin(B.brick, rf, gLo, Y(-0.05), '#b98f5a', BUV);
    skin(B.brick, rf, Y(-0.05), GT, YEL, BUV);
    for (const q of rf.cuts) hole(B, rf, q);
    B.brick.setColor(YEL);
    box(B.brick, rf, 0, W, gLo, GT, -O, 0, 'lr', BUV);
    for (const q of rf.cuts) arch(rf, (q.s0 + q.s1) / 2, (q.s1 - q.s0) / 2 + 0.12, q.y1 + 0.02, q.y0 > TOPC ? 0.35 : 0.3, 0.25, 0.06, RED);
    B.brick.setColor(RED);
    box(B.brick, rf, -0.1, W + 0.1, Y(-0.15), Y(0.1), -O, 0.1, 'ftlr', BUV);
    for (let k = 1; k < NF; k++) box(B.brick, rf, -0.1, W + 0.1, Y(k * FH - 0.2), Y(k * FH + 0.15), -O, 0.09, 'ftulr', BUV);
    box(B.brick, rf, -0.15, W + 0.15, TOPC - 0.55, TOPC, -O, 0.18, 'ftulr', BUV);
    for (const s of [0, W - 0.7]) box(B.brick, rf, s, s + 0.7, Y(0.1), GT, 0, 0.12, 'flrt', BUV);  // corner piers
    box(B.brick, rf, -0.1, W + 0.1, GT - 0.35, GT, -O, 0.14, 'ftulr', BUV);
    // the gable: a segment of a circle over the attic, faced front and back, capped with a red roll
    const R = (c * c + RISE * RISE) / (2 * RISE), yc = GT + RISE - R, N = 12, arc = [];
    for (let i = 0; i <= N; i++) { const s = (W * i) / N; arc.push([s, yc + Math.sqrt(Math.max(0, R * R - (s - c) ** 2))]); }
    for (const [o, n] of [[0, rf.N], [-O, [-rf.nx, 0, -rf.nz]]]) {
      B.brick.setColor(YEL);
      const P = [at(rf, 0, GT, o), ...arc.map(([s, y]) => at(rf, s, y, o)), at(rf, W, GT, o)];
      B.brick.face(P, n);
    }
    D.setColor(RED);
    for (let i = 0; i < N; i++) {
      const [s0, y0] = arc[i], [s1, y1] = arc[i + 1];
      quad(D, at(rf, s0, y0 + 0.3, 0.12), at(rf, s1, y1 + 0.3, 0.12), at(rf, s1, y1 + 0.3, -O - 0.1), at(rf, s0, y0 + 0.3, -O - 0.1), UP);
      quad(D, at(rf, s0, y0, 0.12), at(rf, s1, y1, 0.12), at(rf, s1, y1 + 0.3, 0.12), at(rf, s0, y0 + 0.3, 0.12), rf.N);
    }
    // the oculus: a white stone ring round dark glass, its axis along the face normal
    const oc = at(rf, c, GT + RISE * 0.45, 0.04), U3 = new THREE.Vector3(rf.ux, 0, rf.uz), N3 = new THREE.Vector3(rf.nx, 0, rf.nz);
    const xf = new THREE.Matrix4().makeBasis(U3, N3, U3.clone().cross(N3)).setPosition(oc[0], oc[1], oc[2]);
    D.setColor(WHITE); D.with(xf, (m) => m.cyl(0, 0, 0, 0.75, 0.75, 0.08, 20));
    B.glass.setColor('#39434a'); B.glass.with(xf, (m) => m.cyl(0, 0.08, 0, 0.55, 0.55, 0.02, 20, false));
    B.brick.setColor(YEL); rect(B.brick, rf, 0, W, TOPC, GT, -O, BUV, [-rf.nx, 0, -rf.nz]);   // the attic's back, over the roof
    solid(S, front, sa, sb, 0, O + 0.2, gLo, GT);
  }

  // ---- hipped roof over the minimum rectangle, a hair inside the parapet
  const o = obb(ring), lx = o.L / 2 - 0.2, wz = o.W / 2 - 0.2, vx = -o.uz, vz = o.ux;
  const P = (a, b, y) => [o.cx + o.ux * a + vx * b, y, o.cz + o.uz * a + vz * b];
  const e = [P(-lx, -wz, TOPC), P(lx, -wz, TOPC), P(lx, wz, TOPC), P(-lx, wz, TOPC)], rh = Math.min(wz, lx), top = TOPC + PITCH;
  const ridge = [P(-lx + rh, 0, top), P(lx - rh, 0, top)];
  B.roof.setColor('#ffffff');
  const cen = [o.cx, TOPC - 3, o.cz];
  const tri = (a, b, c) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const m = [a[0] - cen[0], a[1] - cen[1], a[2] - cen[2]]; if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) n = n.map((q) => -q); const l = Math.hypot(...n); B.roof.face([a, b, c], n.map((q) => q / l)); };
  tri(e[0], e[1], ridge[1]); tri(e[0], ridge[1], ridge[0]);
  tri(e[2], e[3], ridge[0]); tri(e[2], ridge[0], ridge[1]);
  tri(e[1], e[2], ridge[1]); tri(e[3], e[0], ridge[0]);
  S.prism(ring.flat(), gLo - 1, TOPC + PITCH * 0.5, 0, 0, 'wall');   // a landing car sits half-way up the hips

  const bt = brickTex(r);
  const M = {
    brick: new THREE.MeshStandardMaterial({ map: bt, vertexColors: true, roughness: 0.92 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3, emissive: 0xffdcaa, emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.35 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x8e969b, roughness: 0.45, metalness: 0.5, vertexColors: true }),
  };
  const out = finish(root, 'politekh', B, M, { shade: ['brick', 'det', 'roof'] });
  console.log(`[cherkasy] Politekh college: ${nWin} windows, floor ${yF.toFixed(1)} m, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  const bb = bboxOf(ring);
  return {
    footprints: [{ poly: ring, h: top - gLo, kind: 'college', name: 'Політехнічний коледж' }],
    clear: (x, z) => x > bb.x0 - 3 && x < bb.x1 + 3 && z > bb.z0 - 3 && z < bb.z1 + 3,
    update() { M.lit.emissiveIntensity = 1.1 * nightK.value; },
  };
}
