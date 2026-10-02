// OWNER: cherkasy. The ten-storey block at вулиця Остафія Дашковича, 4 (OSM way 258795947, with its one-storey shop
// wing, way 927234847), a few steps south of the CatCafe block; the player who asked for it (issue #20) calls it the
// «будинок-праска»: seen from Байди Вишневецького it turns a narrow rounded nose to the street, its wings fanning out
// behind like an iron. Built after Street View (2015): sand-coloured render over a tan ground storey with arched shop
// windows under a red-brown cornice; stacks of balconies with red-brown fronts and white-framed glazing alternate with
// plain bays of windows; red-brown pilasters edge the projections; pointed «Gothic» gables with lancet windows rise
// over the projections of the long front and the west end, and the east end of the long wing carries a round bay, red
// banded at every floor, under a red cone. Windows light up at night.
//   PRASKA_SKIP: the OSM ids replaced here (buildings.js skips them)
//   buildPraska({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per ring edge in a face frame (slabkit.js): s along the edge, y up, o outward.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng, bboxOf } from './geo.js';
import { ringFaces, face, at, rect, box, skin, hole, solid, finish, speckle } from './slabkit.js';

const BLOCK = 258795947, WING = 927234847;
export const PRASKA_SKIP = new Set([BLOCK, WING]);

const GF = 4.0, FH = 2.9, NF = 10, PARA = 0.9;        // ground storey, upper storeys, storeys, parapet
const BAY = 3.3, BAL = 1.2, WH = 4.4;                 // bay, balcony reach, shop wing height
const NOSE = [317, 83.4], NOSE_R = 3.7;               // the round bay on the east end of the long wing
const SAND = '#e4d0a8', TAN = '#cdb38a', RED = '#94392b', DRED = '#7c2f24', WHITE = '#f2efe6', ROOF_RED = '#7a2e22';
const GLASS = ['#56636c', '#4b5760', '#5f6b72', '#46525a'];

export function buildPraska({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === BLOCK), wng = map.buildings.find((q) => q.id === WING);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(BLOCK % 65521), n0 = S.count;
  const ring = ringPts(bld.p), faces = ringFaces(ring), wring = wng ? ringPts(wng.p) : null;
  const hs = ring.map((p) => heightAt(p[0], p[1])), gLo = Math.min(...hs), gHi = Math.max(...hs);
  const yF = gHi + 0.4, Y = (h) => yF + h, ROOF = Y(GF + (NF - 1) * FH), TOP = ROOF + PARA, gB = gLo - 0.5;
  const fy = (k) => (k ? Y(GF + (k - 1) * FH) : Y(0));
  const B = { wall: new MB(), det: new MB(), lit: new MB(), glass: new MB() };
  const D = B.det, W = B.wall, UVW = [2.5, 2.5];
  const win = (f, s0, s1, y0, y1, extra) => f.cuts.push({ s0, s1, y0, y1, glass: GLASS[(r() * GLASS.length) | 0], lit: r() < 0.35, frame: WHITE, rev: '#ded2b8', dep: 0.22, pitch: 1.0, ...extra });
  let nWin = 0, nBal = 0, nGable = 0;
  const inWing = (f) => wring && wring.some(([x, z], i) => { const [x2, z2] = wring[(i + 1) % wring.length], m = [(x + x2) / 2, (z + z2) / 2], c = at(f, f.L / 2, 0); return Math.hypot(m[0] - c[0], m[2] - c[2]) < 2 && Math.hypot(x2 - x, z2 - z) > 3; });
  const nearNose = (f) => Math.hypot(f.ax + f.ux * f.L / 2 - NOSE[0], f.az + f.uz * f.L / 2 - NOSE[1]) < 1.5;
  // the projections of the long front (12 m faces standing 1.2 m proud) and the west end carry the gables
  const gabled = (f) => f.L > 11 && f.L < 13 && f.nz < -0.9 || (f.nx < -0.9 && f.L > 11 && f.L < 13);

  for (const f of faces) {
    if (f.L < 0.3) continue;
    const covered = inWing(f), nb = Math.max(1, Math.round(f.L / BAY)), p = f.L / nb;
    // the ground falls ~4 m from the long wing to the south ends: downhill a lower storey of shops opens under the arches
    const gl = Math.min(...[0.1, 0.5, 0.9].map((t) => { const q = at(f, f.L * t, 0, 1); return heightAt(q[0], q[2]); })), drop = Y(0) - gl;
    f.gl = gl;
    f.bal = [];
    if (f.L >= 9 && !gabled(f) && !nearNose(f)) for (let i = 1; i < nb; i += 2) f.bal.push([i * p + 0.2, (i + 1) * p - 0.2]);
    for (let i = 0; i < nb && f.L >= 1.8 && !nearNose(f); i++) {
      const m = (i + 0.5) * p, w = Math.min(1.5, p - 0.8);
      // a balcony bay: its glazing hides the wall behind, so no openings there
      if (!f.bal.some(([a, b]) => m > a && m < b)) for (let k = 1; k < NF; k++) win(f, m - w / 2, m + w / 2, fy(k) + 0.85, fy(k) + 2.35);
      if (!covered && f.L > 5) { // arched shop windows in the ground storey (the arch is filled in below)
        const aw = Math.min(1.9, p - 0.9);
        f.cuts.push({ s0: m - aw / 2, s1: m + aw / 2, y0: Y(0.45), y1: Y(3.3), glass: '#3d484f', lit: true, frame: '#e9e2d0', rev: TAN, dep: 0.28, pitch: 1.0, arch: true });
        if (drop > 2.2) f.cuts.push({ s0: m - p / 2 + 0.35, s1: m + p / 2 - 0.35, y0: gl + 0.35, y1: Y(0) - 0.35, glass: '#3a454c', lit: true, frame: '#5c3f2c', rev: TAN, dep: 0.25, pitch: 1.2 });
        else if (drop > 0.9) win(f, m - 0.6, m + 0.6, gl + 0.3, Math.min(gl + 0.9, Y(0) - 0.15), { frame: '#cfc6b0', pitch: 1.2, lit: false });
      }
    }
    if (f.nz < -0.9 && f.L > 15 && !covered) f.cuts.push({ s0: f.L / 2 - 0.9, s1: f.L / 2 + 0.9, y0: Y(0), y1: Y(2.5), glass: '#3a3f44', frame: '#6c4a32', rev: TAN, dep: 0.3, door: true, pitch: 0.9 });
    f.cuts = f.cuts.filter((q) => q.s0 > 0.15 && q.s1 < f.L - 0.15);
    nWin += f.cuts.length;
    if (nearNose(f)) { skin(W, f, gB, TOP, SAND, UVW); continue; } // the round bay stands in front of it
    skin(W, f, gB, Y(GF), TAN, UVW);
    skin(W, f, Y(GF), TOP, SAND, UVW);
    for (const q of f.cuts) {
      if (!q.arch) { hole(B, f, q); continue; }
      const rr = (q.s1 - q.s0) / 2, ya = q.y1 - rr, c = (q.s0 + q.s1) / 2, N = 8;
      hole(B, f, q);
      for (const side of [-1, 1]) { // the spandrels: wall between the rectangle's top corners and the arch
        const pts = [at(f, c + side * rr, ya, 0.001)];
        for (let i = 0; i <= N; i++) { const a = (side > 0 ? 0 : Math.PI) + side * (Math.PI / 2) * i / N; pts.push(at(f, c + rr * Math.cos(a), ya + rr * Math.sin(a), 0.001)); }
        pts.push(at(f, c + side * rr, q.y1, 0.001));
        W.setColor(TAN); W.face(pts, f.N);
      }
      D.setColor(DRED); // a keystone
      box(D, f, c - 0.18, c + 0.18, q.y1 - 0.05, q.y1 + 0.3, 0, 0.08, 'ftlr');
    }
    // cornice over the ground storey, floor bands, the red band under the parapet, coping
    D.setColor(DRED); box(D, f, -0.05, f.L + 0.05, Y(GF) - 0.35, Y(GF), 0, 0.3, 'ftlru');
    D.setColor(RED); box(D, f, 0, f.L, ROOF - 0.6, ROOF, 0, 0.08, 'ft');
    D.setColor('#d8c8a6'); rect(D, f, 0, f.L, ROOF, TOP, -0.3, null, [-f.nx, 0, -f.nz]);
    D.setColor(WHITE); box(D, f, -0.08, f.L + 0.08, TOP, TOP + 0.12, -0.3, 0.12, 'ftlr');
    D.setColor('#bfa982'); box(D, f, -0.02, f.L + 0.02, gB, Math.min(Y(0.45), gl + 0.3), 0, 0.08, 'ft'); // plinth
    if (drop > 2.2) { D.setColor(DRED); box(D, f, -0.04, f.L + 0.04, Y(0) - 0.2, Y(0.1), 0, 0.22, 'ftu'); } // over the lower shops
    if (f.L > 3) { const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], TOP, f.nx, f.nz); }
    // the projections: red-brown pilasters up both edges
    if (gabled(f)) { W.setColor(RED); for (const s of [0, f.L - 0.55]) box(W, f, s, s + 0.55, Y(GF), ROOF, 0, 0.1, 'flr', UVW); }
    // balcony stacks: red-brown solid fronts, white-framed glazing over them
    for (const [a, b] of f.bal) {
      for (let k = 1; k < NF; k++) {
        const y = fy(k);
        D.setColor('#cfc2a6'); box(D, f, a, b, y - 0.2, y, 0, BAL, 'tulr');
        W.setColor(RED); box(W, f, a, b, y, y + 1.05, BAL - 0.1, BAL, 'fblr', UVW);
        const G = r() < 0.3 ? B.lit : B.glass;
        G.setColor(GLASS[(r() * GLASS.length) | 0]); box(G, f, a + 0.04, b - 0.04, y + 1.05, y + FH - 0.25, 0, BAL - 0.05, 'flr');
        D.setColor(WHITE);
        const n = Math.max(2, Math.round((b - a) / 1.3));
        for (let i = 0; i <= n; i++) { const s = a + 0.05 + (b - a - 0.1) * i / n; box(D, f, s - 0.03, s + 0.03, y + 1.05, y + FH - 0.25, BAL - 0.06, BAL - 0.02, 'f'); }
        box(D, f, a + 0.04, b - 0.04, y + FH - 0.3, y + FH - 0.2, 0, BAL - 0.02, 'fu');
        nBal++;
      }
      D.setColor(RED); box(D, f, a, b, ROOF - 0.2, ROOF + 0.3, 0, BAL, 'ftlr');
      solid(S, f, a, b, 0, BAL, fy(1) - 0.2, ROOF + 0.3, 'wall');
    }
    if (gabled(f)) gable(f, 0.25, f.L - 0.25);
  }

  // a pointed gable over s0..s1 of the face: sand wall, red coping on both slopes, a lancet window in a red surround
  function gable(f, s0, s1) {
    const w = s1 - s0, h = w * 0.75, m = (s0 + s1) / 2, y0 = TOP, P = (s, y, o) => at(f, s, y, o);
    W.setColor(SAND); W.face([P(s0, y0, 0), P(s1, y0, 0), P(m, y0 + h, 0)], f.N);
    W.face([P(s0, y0, -0.45), P(s1, y0, -0.45), P(m, y0 + h, -0.45)], [-f.nx, 0, -f.nz]);
    for (const sd of [-1, 1]) {
      const se = sd < 0 ? s0 : s1, ln = Math.hypot(h, w / 2), N = [f.ux * (sd * h / ln), (w / 2) / ln, f.uz * (sd * h / ln)];
      D.setColor(ROOF_RED);
      D.face([P(se + sd * 0.2, y0 - 0.15, 0.15), P(m, y0 + h + 0.2, 0.15), P(m, y0 + h + 0.2, -0.6), P(se + sd * 0.2, y0 - 0.15, -0.6)], N);
      D.face([P(se + sd * 0.2, y0 - 0.15, 0.15), P(m, y0 + h + 0.2, 0.15), P(m, y0 + h - 0.05, 0.15), P(se + sd * 0.2, y0 - 0.4, 0.15)], f.N);
    }
    const lw = Math.min(0.75, w * 0.09), lancet = (dw, o, col, G) => { G.setColor(col); G.face([P(m - lw - dw, y0 + 0.5 - dw, o), P(m + lw + dw, y0 + 0.5 - dw, o), P(m + lw + dw, y0 + h * 0.42, o), P(m, y0 + h * 0.62 + dw, o), P(m - lw - dw, y0 + h * 0.42, o)], f.N); };
    lancet(0.18, 0.02, RED, D); lancet(0, 0.04, '#46525a', r() < 0.5 ? B.lit : B.glass);
    D.setColor(WHITE); box(D, f, m - 0.03, m + 0.03, y0 + 0.5, y0 + h * 0.6, 0.04, 0.07, 'f');
    solid(S, f, s0, s1, -0.45, 0, y0, y0 + h * 0.55);
    nGable++;
  }

  // ---- the round bay on the east end: facets of a half-cylinder, a window and a red band per storey, a red cone
  {
    const n = 7, segs = [];
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + Math.PI * i / n, a1 = -Math.PI / 2 + Math.PI * (i + 1) / n, am = (a0 + a1) / 2;
      const p = (a) => [NOSE[0] + NOSE_R * Math.cos(a), NOSE[1] + NOSE_R * Math.sin(a)];
      // the ring runs clockwise here seen from above (+x out, angle toward +z), so the face runs a1 -> a0
      segs.push(face(p(a1), p(a0), Math.cos(am), Math.sin(am)));
    }
    for (const f of segs) {
      for (let k = 1; k < NF; k++) win(f, 0.25, f.L - 0.25, fy(k) + 1.0, fy(k) + 2.5, { pitch: 2, dep: 0.15 });
      win(f, 0.25, f.L - 0.25, Y(0.45), Y(3.3), { lit: true, glass: '#3d484f', frame: '#e9e2d0', rev: TAN, pitch: 2 });
      const q = at(f, f.L / 2, 0, 1), gl = heightAt(q[0], q[2]);
      if (Y(0) - gl > 2.2) win(f, 0.25, f.L - 0.25, gl + 0.35, Y(0) - 0.35, { lit: true, glass: '#3a454c', frame: '#5c3f2c', rev: TAN, pitch: 2 });
      skin(W, f, gB, Y(GF), TAN, UVW);
      skin(W, f, Y(GF), ROOF, SAND, UVW);
      for (const q of f.cuts) hole(B, f, q);
      for (let k = 1; k < NF; k++) { W.setColor(RED); box(W, f, -0.02, f.L + 0.02, fy(k) - 0.05, fy(k) + 1.0, 0, 0.12, 'ft', UVW); }
      D.setColor(DRED); box(D, f, -0.05, f.L + 0.05, Y(GF) - 0.35, Y(GF), 0, 0.3, 'ftu');
      D.setColor(WHITE); box(D, f, -0.05, f.L + 0.05, ROOF, ROOF + 0.15, -0.2, 0.2, 'ftu');
      nWin += f.cuts.length;
    }
    D.setColor(ROOF_RED); D.cyl(NOSE[0], ROOF + 0.15, NOSE[1], NOSE_R + 0.35, 0, 4.2, 14, true);
    D.setColor('#5c5a56'); D.tube([NOSE[0], ROOF + 4.3, NOSE[1]], [NOSE[0], ROOF + 5.6, NOSE[1]], 0.05, 4);
    const P = []; for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + Math.PI * i / 12; P.push(NOSE[0] + NOSE_R * Math.cos(a), NOSE[1] + NOSE_R * Math.sin(a)); }
    S.prism(P, gB, ROOF + 1.5, 0, 0, 'wall');
  }

  // ---- roof deck, lift heads
  D.setColor('#6c6a65'); D.fill(ring, [], ROOF + 0.02, true);
  for (const [x, z, w, d, h] of [[284, 79, 3.4, 3.4, 2.8], [298, 98, 3.0, 3.0, 2.6], [318, 130, 3.0, 3.0, 2.6]]) {
    W.setColor(SAND); W.box(x - w / 2, ROOF, z - d / 2, x + w / 2, ROOF + h, z + d / 2, 1 | 2 | 4 | 16 | 32);
    S.prism([x - w / 2, z - d / 2, x + w / 2, z - d / 2, x + w / 2, z + d / 2, x - w / 2, z + d / 2], ROOF, ROOF + h, 0, 0, 'equipment');
  }
  S.prism(ring.flat(), gB, TOP, 0, 0, 'wall');

  // ---- the shop wing: one tall storey of glazing in tan render under the red-brown cornice
  if (wring) {
    const wf = ringFaces(wring), WT = Y(WH), cut = (f) => faces.some((g) => Math.abs(g.nx * f.nx + g.nz * f.nz + 1) < 0.05 && Math.abs((f.ax - g.ax) * g.nx + (f.az - g.az) * g.nz) < 0.5);
    for (const f of wf) {
      if (cut(f)) continue;
      if (f.L > 3) for (const q of [[0.5, f.L - 0.5]]) win(f, q[0], q[1], Y(0.4), Y(3.4), { lit: true, glass: '#3d484f', frame: '#6c4a32', rev: TAN, pitch: 1.4, tr: Y(2.6) });
      skin(W, f, gB, WT + 0.5, TAN, UVW);
      for (const q of f.cuts) hole(B, f, q);
      D.setColor(DRED); box(D, f, -0.05, f.L + 0.05, WT, WT + 0.5, 0, 0.25, 'ftlru');
      if (f.L > 3) { const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], WT + 0.5, f.nx, f.nz); }
      nWin += f.cuts.length;
    }
    D.setColor('#76726c'); D.fill(wring, [], WT + 0.4, true);
    S.prism(wring.flat(), gB, WT + 0.5, 0, 0, 'wall');
  }

  const M = {
    wall: new THREE.MeshStandardMaterial({ map: speckle(r), vertexColors: true, roughness: 0.85 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3, emissive: 0xffd9a8, emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.35 }),
  };
  const out = finish(root, 'praska', B, M, { shade: ['wall', 'det'] });
  console.log(`[cherkasy] Dashkovycha 4: ${nWin} openings, ${nBal} balconies, ${nGable} gables, floor ${yF.toFixed(1)} m, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  const bb = bboxOf(wring ? [...ring, ...wring] : ring);
  return {
    footprints: [{ poly: ring, h: TOP - gLo, kind: 'apt', name: 'Остафія Дашковича, 4' }, ...(wring ? [{ poly: wring, h: WH + 0.5, kind: 'retail' }] : [])],
    clear: (x, z) => x > bb.x0 - 3 && x < bb.x1 + 5 && z > bb.z0 - 3 && z < bb.z1 + 3,
    update() { M.lit.emissiveIntensity = 1.1 * nightK.value; },
  };
}
