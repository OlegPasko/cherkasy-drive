// OWNER: cherkasy. The glass rotunda bar-brewery next to the Делікат at бульвар Шевченка 399/2 (OSM way 418579439),
// rebuilt on a player's idea (issue #27). It is drawn without its name or any lettering: only the architecture.
// A two-storey cube clad in large light grey composite cassettes, with a drum pushed out of its boulevard face (the
// OSM ring's round end): on the ground floor a recessed curve of warm glazing behind four slate-blue round columns,
// over it a deep slate-blue canopy ring, then a curved band of storey-high glass leaning slightly out, a ring of
// slanted glass facets lit from inside at night, and a plain pale crown band standing above the cube's parapet.
// Before it a raised paved terrace with a horizontal-bar steel railing; in front of that a curved screen of five
// brushed-steel panels in dark frames, concrete planters with clipped box balls either side, and two square bollard
// lamps at the edge of the forecourt. Wall lamps on the cube's pylons either side of the drum.
// References: the venue's published photos (day and dusk, from the boulevard) and the OSM footprint; the Esri
// satellite view for the flat roofs and the terrace.
//   ROTUNDA_SKIP: the OSM id replaced here (buildings.js skips it); PEEK_SKIP: the neighbour the peek leaves out
//   buildGlassRotunda({ root, map, solids, zips, heightAt, ground }) -> { update(dt), clear(x, z), footprints } | null
// The map frame: -x faces the boulevard. The drum is the circle (CX, CZ, R) clipped by the cube's front plane XW.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { ringPts, rng, area2 } from './geo.js';
import { edgeFaces, pt, panel, fbox, wall, win, mats, finish, winTex, winEmTex } from './bldkit.js';

const OSM_ID = 418579439;
export const ROTUNDA_SKIP = new Set([OSM_ID]);
// the Делікат next door: OSM infers 9 storeys for it, so the phone peek (which drops every *_SKIP id) leaves it out
// rather than raise a white tower beside this model; the game builds it in its own module
export const PEEK_SKIP = new Set([399652294]);

// the cube (axis-aligned in the map frame, with the OSM ring's notch at the back) and the drum's circle
const CUBE = [[-38.8, 3673.2], [-10.8, 3673.2], [-10.8, 3682.6], [-13.6, 3682.6], [-13.6, 3691.4], [-38.8, 3691.4]];
const XW = -38.8, CX = -35.5, CZ = 3682.3, R = 7.5;
const LIFT = 0.6, H = 9.2, GF = 4.2, CAN1 = 5.0, UP1 = 8.5, FAC1 = 9.1, TOPR = 10.5; // floor over grade, cube top, drum levels
const R_IN = 6.4, R_COL = 7.1, R_CAN = 8.2, R_UP = 7.9, R_FAC = 8.3, R_TER = 10.0, R_SCR = 12.4;
const PANEL = '#dfe1e0', SLATE = '#4d5a6b', SLATE2 = '#5a6779', STEEL = '#c3c7c9', FRAME = '#26292d', CONC = '#a9a7a2', BOX = '#3b5a2e';
const SEG = 18;

// big composite cassettes, 1.5 x 1.25 m, thin grey joints (3 x 2.5 m per repeat)
const cassetteTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#9a9c9c';
  for (const x of [w / 4, 3 * w / 4]) g.fillRect(x, 0, 3, h);
  for (const y of [h / 4, 3 * h / 4]) g.fillRect(0, y, w, 3);
});
// concrete pavers, 0.4 x 0.2 m in a stretcher bond (3.2 m per repeat)
const paveTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#e4e1dc'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#9f9b95';
  const nx = 8, ny = 16, bw = w / nx, bh = h / ny;
  for (let j = 0; j < ny; j++) { g.fillRect(0, j * bh, w, 1.5); for (let i = -1; i < nx + 1; i++) g.fillRect(i * bw + (j % 2) * bw / 2, j * bh, 1.5, bh); }
});
// brushed steel: fine horizontal streaks
const brushTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#d6d8d9'; g.fillRect(0, 0, w, h);
  let s = 7;
  const rnd = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 260; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(60,60,60,0.05)'; g.fillRect(0, rnd() * h, w, 1); }
});

// the drum's arc at radius r: the half-angle round -x where the circle meets the front plane
const half = (r) => Math.acos(Math.min(1, (CX - XW) / r));
const at = (r, phi) => [CX + r * Math.cos(phi), CZ + r * Math.sin(phi)];
const arcPhi = (r, i, n = SEG) => Math.PI + half(r) * (2 * i / n - 1);
const segPoly = (r, n = SEG) => Array.from({ length: n + 1 }, (_, i) => at(r, arcPhi(r, i, n))); // closes on the chord

export function buildGlassRotunda({ root, map, solids: S, zips: Z, heightAt: hfAt, ground }) {
  // the ground as drawn (roads and lots shaped), so what stands on it meets it; the bare height field in the peek
  const heightAt = ground?.terrainHeight ?? hfAt;
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const ring = ringPts(bld.p);
  let gLo = Infinity, gHi = -Infinity;
  for (const [x, z] of ring) { const h = heightAt(x, z); gLo = Math.min(gLo, h); gHi = Math.max(gHi, h); }
  const yF = gHi + LIFT, gB = gLo - 0.6, Y = (h) => yF + h;
  const B = { wall: new MB(), pave: new MB(), det: new MB(), steel: new MB(), glass: new MB(), lit: new MB(), glow: new MB() };
  const D = B.det;
  const ccw = (P) => (area2(P) < 0 ? P.slice().reverse() : P);

  // a curved band from (rA, yA) to (rB, yB) along the drum, SEG facets; uv: one pane per facet across, `rows` up
  const band = (M, rA, yA, rB, yB, rows = 1, n = SEG) => {
    const dr = rB - rA, dy = yB - yA, l = Math.hypot(dr, dy) || 1, nr = dy / l, ny = -dr / l;
    for (let i = 0; i < n; i++) {
      const pa = arcPhi(rA, i, n), pb = arcPhi(rA, i + 1, n), qa = arcPhi(rB, i, n), qb = arcPhi(rB, i + 1, n), pm = (pa + pb) / 2;
      const N = [Math.cos(pm) * nr, ny, Math.sin(pm) * nr];
      const a = at(rA, pa), b = at(rA, pb), c = at(rB, qb), d = at(rB, qa);
      const id = [[a, yA, 0, 0], [b, yA, 1, 0], [c, yB, 1, rows], [d, yB, 0, rows]].map(([p, y, u, v]) => M.vert(p[0], y, p[1], ...N, u, v));
      M.quad(id[0], id[3], id[2], id[1]); // outward: a -> d -> c -> b runs counter-clockwise seen from outside
    }
  };
  // a flat annulus-segment cap at y between r0 (or the chord when r0 = 0) and r1, facing up or down
  const cap = (M, r0, r1, y, up) => {
    const P = r0 > 0 ? [...segPoly(r1), ...segPoly(r0).reverse()] : segPoly(r1);
    M.fill(P, [], y, up);
  };

  // ---- the cube
  const faces = edgeFaces(CUBE);
  for (const f of faces) {
    const holes = [], front = f.nx < -0.7;
    if (!front && f.L > 20) { // the long sides: a few tall upper windows and a door
      for (const m of [f.L * 0.3, f.L * 0.5, f.L * 0.7]) holes.push({ s0: m - 0.7, s1: m + 0.7, y0: Y(5.4), y1: Y(8.0), cols: 1, rows: 2, rev: '#9ea2a3', glass: '#c8ccce', lit: r() < 0.6, dep: 0.15 });
      holes.push({ s0: f.L * 0.85 - 0.55, s1: f.L * 0.85 + 0.55, y0: Y(0.02), y1: Y(2.3), cols: 1, rows: 2, rev: '#9ea2a3', glass: '#3c4046', dep: 0.1 });
    } else if (f.nx > 0.7 && f.L > 8) holes.push({ s0: f.L / 2 - 1.5, s1: f.L / 2 + 1.5, y0: Y(0.02), y1: Y(3.2), cols: 1, rows: 4, rev: '#9ea2a3', glass: '#6d7175', dep: 0.1 }); // the brewery's service gate
    B.wall.setColor(PANEL); wall(B.wall, f, Y(0.5), Y(H), holes.filter((q) => q.y1 > Y(0.5)), [3, 2.5]);
    for (const q of holes) win(B, f, q);
    D.setColor('#5d6063');
    let s = 0;
    for (const q of [...holes.filter((h) => h.y0 < Y(0.5)).sort((a, b) => a.s0 - b.s0), { s0: f.L, s1: f.L }]) {
      if (q.s0 > s + 1e-3) fbox(D, f, s, q.s0, gB, Y(0.5), 0, 0.03, 'ftlr');
      s = Math.max(s, q.s1);
    }
    for (const q of holes) if (q.y0 < Y(0.5)) fbox(D, f, q.s0, q.s1, gB, q.y0, 0, 0.01, 'f');
    D.setColor('#b9bcbc'); fbox(D, f, -0.05, f.L + 0.05, Y(H), Y(H + 0.1), -0.3, 0.05, 'ft'); // the coping
    const p0 = pt(f, 0, 0, 0.05), p1 = pt(f, f.L, 0, 0.05); Z.edge(p0[0], p0[2], p1[0], p1[2], Y(H + 0.1), f.nx, f.nz);
    if (front) { // wall lamps on the pylons either side of the drum
      for (const z of [CZ - (CZ - 3673.2) / 2 - 3.4, CZ + (3691.4 - CZ) / 2 + 3.4]) {
        D.setColor('#2b2e31'); D.box(XW - 0.25, Y(3.9), z - 0.12, XW, Y(4.3), z + 0.12);
        B.glow.setColor('#ffe2b0'); B.glow.box(XW - 0.24, Y(3.85), z - 0.1, XW - 0.01, Y(3.9), z + 0.1, 8);
      }
    }
  }
  D.setColor('#8d8f90'); D.fill(CUBE, [], Y(H - 0.2), true);
  // roof kit on the cube: the brewery's flue and two air handlers
  D.setColor('#c4c6c3'); for (const [x, z] of [[-20, 3677], [-24, 3687]]) D.box(x - 1.3, Y(H - 0.2), z - 0.8, x + 1.3, Y(H + 1.0), z + 0.8, 1 | 2 | 4 | 16 | 32);
  D.setColor('#a8abad'); D.cyl(-16, Y(H - 0.2), 3677.5, 0.28, 0.28, 3.4, 8, true);

  // ---- the drum
  // ground floor: the recessed glazing, the floor, the columns
  B.lit.setColor('#6a6c6e'); band(B.lit, R_IN, Y(0), R_IN, Y(GF), 2, 8);
  D.setColor('#8a8580'); cap(D, 0, R_TER, Y(0), true); // the terrace and the floor under the canopy, one slab
  D.setColor(SLATE);
  for (const da of [-0.95, -0.33, 0.33, 0.95]) { const [x, z] = at(R_COL, Math.PI + da); D.cyl(x, Y(0), z, 0.28, 0.28, GF, 10, false); S.cyl(x, z, gB, Y(GF), 0.3, 0.3, 'pole'); }
  // the canopy ring: fascia, soffit, top
  B.steel.setColor(SLATE); band(B.steel, R_CAN, Y(GF), R_CAN, Y(CAN1));
  D.setColor(SLATE2); cap(D, 0, R_CAN, Y(GF), false); cap(D, 0, R_CAN, Y(CAN1), true);
  for (const da of [-0.7, -0.35, 0, 0.35, 0.7]) { const [x, z] = at(7.4, Math.PI + da); B.glow.setColor('#ffe9c4'); B.glow.cyl(x, Y(GF) - 0.02, z, 0.12, 0.12, 0.02, 6, true); } // downlights
  // upper floor: the leaning glass, the lit facet ring, the crown band and its roof
  B.lit.setColor('#7c8790'); band(B.lit, R_UP - 0.4, Y(CAN1), R_UP, Y(UP1), 1);
  B.glow.setColor('#d9dcd9'); band(B.glow, R_UP, Y(UP1), R_FAC, Y(FAC1), 1);
  B.steel.setColor(FRAME); band(B.steel, R_UP - 0.42, Y(UP1) - 0.06, R_UP + 0.02, Y(UP1) + 0.04); // the transom under the facets
  B.wall.setColor(PANEL); band(B.wall, R_FAC, Y(FAC1), R_FAC, Y(TOPR));
  D.setColor('#9c9fa0'); cap(D, 0, R_FAC, Y(TOPR), true); cap(D, R_UP, R_FAC, Y(FAC1), false);
  D.setColor('#b9bcbc'); band(D, R_FAC, Y(TOPR), R_FAC + 0.05, Y(TOPR + 0.1)); cap(D, 0, R_FAC + 0.05, Y(TOPR + 0.1), true);
  // mullions on the upper glass, one per facet
  D.setColor(FRAME);
  for (let i = 0; i <= SEG; i++) {
    const [xa, za] = at(R_UP - 0.38, arcPhi(R_UP - 0.4, i)), [xb, zb] = at(R_UP + 0.02, arcPhi(R_UP, i));
    D.tube([xa, Y(CAN1), za], [xb, Y(UP1), zb], 0.04, 4);
  }

  // ---- the paved forecourt between the drum and the boulevard: a grid draped on the ground
  {
    const xa = XW - R_SCR - 6, za = 3673.2 - 3, nx = 8, nz = 8, dx = (XW - xa) / nx, dz = (3691.4 + 3 - za) / nz;
    const P = (i, j) => { const x = xa + i * dx, z = za + j * dz; return [x, heightAt(x, z) + 0.1, z]; };
    B.pave.setColor('#b3aea6');
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      const id = [a, b, c, d].map((p) => B.pave.vert(...p, 0, 1, 0, p[0] / 3.2, p[2] / 3.2));
      B.pave.quad(id[0], id[3], id[2], id[1]);
    }
  }

  // ---- the terrace: its edge, the railing with openings at both ends, two steps at the openings
  const gT = Math.min(...[0, -0.5, 0.5].map((d) => { const [x, z] = at(R_TER + 1, Math.PI + d); return heightAt(x, z); }));
  D.setColor('#9a958e'); band(D, R_TER, gB, R_TER, Y(0), 1, 12);
  S.prism(ccw(segPoly(R_TER, 12)).flat(), gB, Y(0), 0, 0, 'step');
  {
    const a0 = Math.PI - half(R_TER - 0.2) + 0.2, a1 = Math.PI + half(R_TER - 0.2) - 0.2, n = 14;
    D.setColor('#2a2d30');
    const P = (k, y) => { const [x, z] = at(R_TER - 0.2, a0 + (a1 - a0) * k / n); return [x, Y(y), z]; };
    for (const y of [0.25, 0.5, 0.75, 1.0]) for (let k = 0; k < n; k++) D.tube(P(k, y), P(k + 1, y), 0.02, 4);
    for (let k = 0; k <= n; k += 2) D.tube(P(k, 0), P(k, 1.02), 0.025, 4);
    for (let k = 0; k < n; k++) { const p = P(k, 0), q = P(k + 1, 0); const d = [q[0] - p[0], q[2] - p[2]], l = Math.hypot(...d); S.obox((p[0] + q[0]) / 2, (p[2] + q[2]) / 2, l / 2, 0.05, Math.atan2(d[1], d[0]), Y(0), Y(1.0), 'railing'); }
    // the steps up at both ends, against the cube front
    D.setColor('#a39d95');
    for (const side of [-1, 1]) {
      const z0 = CZ + side * Math.sqrt(R_TER * R_TER - (CX - XW) ** 2) - side * 0.3; // tucked under the terrace edge
      for (let k = 0; k < 2; k++) { // two treads down from the terrace, each 0.8 m deep
        const za = z0 + side * k * 0.8, zb = za + side * 0.8, y = gT + (yF - gT) * (2 - k) / 3;
        D.box(XW - 3.2, gB, Math.min(za, zb), XW - 0.1, y, Math.max(za, zb));
      }
      S.box(XW - 3.2, gB, Math.min(z0, z0 + side * 1.6), XW - 0.1, gT + (yF - gT) / 2, Math.max(z0, z0 + side * 1.6), 'step');
    }
  }

  // ---- the curved steel screen before the terrace, five panels on dark posts
  {
    const n = 5, ha = 0.48, hS = 2.5;
    for (let i = 0; i < n; i++) {
      const pa = Math.PI - ha + 2 * ha * i / n, pb = Math.PI - ha + 2 * ha * (i + 1) / n;
      const [xa, za] = at(R_SCR, pa), [xb, zb] = at(R_SCR, pb), ga = heightAt(xa, za), gb = heightAt(xb, zb), g = Math.min(ga, gb);
      const m = (pa + pb) / 2, N = [Math.cos(m), 0, Math.sin(m)], dx = xb - xa, dz = zb - za, l = Math.hypot(dx, dz);
      // the panel: a thin slab, brushed face out, darker face in
      const o = 0.07, ox = N[0] * o, oz = N[2] * o;
      const face = (M, sgn, col) => {
        M.setColor(col);
        const P = [[xa + sgn * ox, g + 0.15, za + sgn * oz], [xb + sgn * ox, g + 0.15, zb + sgn * oz], [xb + sgn * ox, g + hS, zb + sgn * oz], [xa + sgn * ox, g + hS, za + sgn * oz]];
        const id = P.map((p, j) => M.vert(...p, N[0] * sgn, 0, N[2] * sgn, [0, l / 1.5, l / 1.5, 0][j], [0, 0, hS / 1.5, hS / 1.5][j]));
        if (sgn > 0) M.quad(id[0], id[3], id[2], id[1]); else M.quad(id[0], id[1], id[2], id[3]);
      };
      face(B.steel, 1, STEEL); face(B.steel, -1, '#6f7477');
      D.setColor(FRAME); D.box(Math.min(xa, xb) - 0.02, g + hS, Math.min(za, zb) - 0.02, Math.max(xa, xb) + 0.02, g + hS + 0.06, Math.max(za, zb) + 0.02, 4);
      D.tube([xa, g, za], [xa, g + hS + 0.06, za], 0.07, 4, true);
      if (i === n - 1) D.tube([xb, g, zb], [xb, g + hS + 0.06, zb], 0.07, 4, true);
      S.obox((xa + xb) / 2, (za + zb) / 2, l / 2, 0.1, Math.atan2(dz, dx), g, g + hS, 'wall');
    }
    // planters with box balls either side of the screen, a smaller pot beside each pair
    for (const side of [-1, 1]) for (const [da, rr, k] of [[0.6, R_SCR - 0.3, 1], [0.72, R_SCR - 0.6, 1], [0.82, R_SCR - 1.4, 0.7]]) {
      const [x, z] = at(rr, Math.PI + side * da), g = heightAt(x, z), pr = 0.55 * k, ph = 1.0 * k;
      D.setColor(CONC); D.cyl(x, g, z, pr * 0.85, pr, ph, 12, true);
      D.setColor(r() < 0.5 ? BOX : '#41632f'); D.ellipsoid([x, g + ph + pr * 0.85, z], [pr * 1.05, pr * 0.95, pr * 1.05], 10, 6);
      S.cyl(x, z, g - 0.2, g + ph, pr, pr, 'pole');
    }
    // two square bollard lamps at the forecourt edge
    for (const side of [-1, 1]) {
      const [x, z] = at(R_SCR + 3.4, Math.PI + side * 0.62), g = heightAt(x, z);
      D.setColor('#8a6f52'); D.box(x - 0.18, g, z - 0.18, x + 0.18, g + 2.1, z + 0.18);
      D.setColor('#2b2e31'); D.box(x - 0.24, g + 2.1, z - 0.24, x + 0.24, g + 2.45, z + 0.24);
      B.glow.setColor('#ffe2b0'); B.glow.box(x - 0.19, g + 1.3, z - 0.19, x + 0.19, g + 2.08, z + 0.19, 1 | 2 | 16 | 32);
      S.cyl(x, z, g - 0.2, g + 2.45, 0.25, 0.25, 'pole');
    }
  }

  // ---- collision: the cube, the drum to its crown, the canopy ring as an awning
  S.prism(ccw(CUBE).flat(), gB, Y(H + 0.1), 0, 0, 'wall');
  S.prism(ccw(segPoly(R_FAC, 12)).flat(), Y(CAN1), Y(TOPR + 0.1), 0, 0, 'wall');
  S.prism(ccw(segPoly(R_IN, 12)).flat(), gB, Y(CAN1), 0, 0, 'wall');
  S.prism(ccw(segPoly(R_CAN, 12)).flat(), Y(GF), Y(CAN1), 0, 0, 'awning', 1);

  // ---- meshes
  const M = mats({
    wall: new THREE.MeshStandardMaterial({ map: cassetteTex(), vertexColors: true, roughness: 0.4, metalness: 0.2 }),
    steel: new THREE.MeshStandardMaterial({ map: brushTex(), vertexColors: true, roughness: 0.35, metalness: 0.45 }),
    lit: new THREE.MeshStandardMaterial({ map: winTex(), emissiveMap: winEmTex(), vertexColors: true, roughness: 0.12, metalness: 0.45, emissive: 0xffc98a, emissiveIntensity: 0 }),
    pave: new THREE.MeshStandardMaterial({ map: paveTex(), vertexColors: true, roughness: 0.95 }),
    glow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.2, emissive: 0xffe0b0, emissiveIntensity: 0 }),
  });
  const out = finish(root, 'glassrotunda', B, M, ['wall', 'det', 'steel']);
  console.log(`[cherkasy] Glass rotunda: floor ${yF.toFixed(1)} m, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return {
    footprints: [{ poly: ring, h: Y(TOPR) - gLo, kind: bld.k, name: 'Будівля зі скляною ротондою' }],
    clear: (x, z) => (x > x0 - 2 && x < x1 + 2 && z > z0 - 2 && z < z1 + 2) || Math.hypot(x - CX, z - CZ) < R_SCR + 4.5,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.7 * k; M.glow.emissiveIntensity = 0.05 + 1.6 * k; },
  };
}
