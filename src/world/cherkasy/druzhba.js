// OWNER: cherkasy. Палац культури «Дружба народів», бульвар Шевченка, 249 (OSM way 104299448, GitHub issue #2: the
// generic extrusion was a plain 4-storey box on a lawn). Rebuilt after the Wikimedia Commons photos of 2013 (after the
// 2012 reconstruction) and a satellite view: the 4-storey club wing wrapped in a brise-soleil (taupe full-height fins
// every 3 m, three white louvres per storey, ribbon windows behind), the concert-hall front on the square side – a
// curved white wall sweeping up to the south-east over a glazed foyer, cantilevered over a canopy with the palace name
// and framed by dark panelled cheeks –, the tall stage fly tower with one rounded corner, vertical grooves, the round
// leaf-wreath emblem facing the square and masts on the roof, two dark granite pylons (the wide one with glass doors
// over a flight of steps), a granite plinth, the one-storey annex at the north corner. Around it: the granite-paved
// square down to the boulevard, raised granite planters along the wing with blue spruces, thujas and a clipped hedge,
// white benches and park lamps. Lit windows, foyer, sign and lamps at night.
//   DRUZHBA_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildDruzhba({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), spots, footprints } | null
// The OSM footprint sits square to the map grid: the square side looks to -x, the long axis runs along z (north-west
// end at small z). Wing façades are laid out in a face frame per footprint edge (s to the viewer's right, o outward);
// the entrance block and the fly tower are placed in map x / z.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { PARK_PINE, hedgeSpots } from '../trees.js';
import { canvasTex, decal } from './sculpt.js';
import { ringPts, rng, area2, inPoly } from './geo.js';

const OSM_ID = 104299448;
export const DRUZHBA_SKIP = new Set([OSM_ID]);

const PLINTH = 0.9, FH = 3.3, NF = 4, PARA = 0.9;  // plinth over the square, storey, storeys, parapet
const SILL = 0.85, HEAD = 2.75, REV = 0.18;        // window band in a storey, reveal depth
const BAY = 3.0, FIN = 0.35, FIN_OUT = 0.95;       // brise-soleil rhythm, fin width, fin depth
const PODIUM = 0.75;                               // planters and the landing by the wide pylon
const PAVE_Y = 0.24;  // the square's paving over the terrain: clear of the OSM walks under it (ground.js GY.WALK 0.19)
const RENDER = '#e4dfd3', FINC = '#a0927c', SLAT = '#f1efe9', GRANITE = '#45484b', PANEL = '#5a5e62', TRAV = '#d6cbb5';
const GLASS = ['#3b4852', '#44525c', '#36424b', '#4d5a62', '#57636a'];
const UP = [0, 1, 0], DOWN = [0, -1, 0];
const neg = (v) => [-v[0], -v[1], -v[2]];
const TAU = Math.PI * 2;
const edgesOf = (pts) => pts.map((a, i) => [a, pts[(i + 1) % pts.length]]); // closed ring -> [a, b] pairs

// ------------------------------------------------------------------------------------------------ textures
const stuccoTex = (r) => canvasTex(256, 256, (g, w, h) => { // fine sprayed render, 4 m per repeat
  g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.045)' : 'rgba(255,255,255,0.05)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
});
const grooveTex = (r) => canvasTex(128, 256, (g, w, h) => { // the fly tower render: one vertical groove per repeat (2.2 m)
  g.fillStyle = '#f2f0eb'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1500; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  g.fillStyle = 'rgba(70,64,56,0.55)'; g.fillRect(0, 0, 3, h);
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(3, 0, 2, h);
});
// square paving, 8 m per repeat: 0.5 m granite setts in greys, a darker 4 m frame grid (the Commons photos)
const paveTex = (r) => canvasTex(512, 512, (g, w) => {
  const p = w / 16;
  g.fillStyle = '#6f6c68'; g.fillRect(0, 0, w, w);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
    const band = i % 8 === 0 || j % 8 === 0, v = band ? 122 + r() * 12 : 150 + r() * 20;
    g.fillStyle = `rgb(${v | 0},${(v * 0.97) | 0},${(v * 0.93) | 0})`; g.fillRect(i * p + 1, j * p + 1, p - 2, p - 2);
  }
});
// the round emblem: a wreath of leaves in blue, green, yellow, orange and red round an orange sun (after the photos)
const emblemTex = () => canvasTex(512, 512, (g, w) => {
  const c = w / 2;
  g.fillStyle = '#d9d6cf'; g.fillRect(0, 0, w, w);
  g.fillStyle = '#fbfaf6'; g.beginPath(); g.arc(c, c, c - 6, 0, TAU); g.fill();
  const hues = ['#2c4fa8', '#3f7fc4', '#2f9a4a', '#77b83a', '#f0c21e', '#f29a1f', '#e2582a', '#c93a2c', '#7a4fa6'];
  for (let k = 0; k < 44; k++) {
    const a = (k / 44) * TAU - Math.PI * 0.6, rr = c * (0.56 + 0.2 * ((k * 7) % 3) / 2);
    g.save(); g.translate(c + Math.cos(a) * rr, c + Math.sin(a) * rr); g.rotate(a + 0.9);
    g.fillStyle = hues[Math.floor(((k + 0.5) / 44) * hues.length)];
    g.beginPath(); g.ellipse(0, 0, c * 0.16, c * 0.055, 0, 0, TAU); g.fill(); g.restore();
  }
  g.fillStyle = '#ea5a2a'; g.beginPath(); g.arc(c, c * 1.02, c * 0.24, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,210,120,0.45)'; g.beginPath(); g.arc(c - c * 0.07, c * 0.95, c * 0.1, 0, TAU); g.fill();
}, { repeat: false });
const signTex = () => canvasTex(2048, 128, (g, w, h) => {
  g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2b2d30'; g.font = 'bold 86px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('ПАЛАЦ КУЛЬТУРИ «ДРУЖБА НАРОДІВ»', w / 2, h / 2 + 4, w - 60);
}, { repeat: false });

// ------------------------------------------------------------------------------------------------ face frame
// edge a -> b with outward normal n; s runs to the right of a viewer outside, o outward, y up
function frameOf(a, b, n) {
  const rx = n[1], rz = -n[0];
  let p = a, q = b;
  if ((q[0] - p[0]) * rx + (q[1] - p[1]) * rz < 0) [p, q] = [q, p];
  return { ox: p[0], oz: p[1], nx: n[0], nz: n[1], rx, rz, w: Math.hypot(q[0] - p[0], q[1] - p[1]), N: [n[0], 0, n[1]], R: [rx, 0, rz], gaps: [] };
}
const P = (f, s, y, o = 0) => [f.ox + f.rx * s + f.nx * o, y, f.oz + f.rz * s + f.nz * o];
const sOf = (f, x, z) => (x - f.ox) * f.rx + (z - f.oz) * f.rz;
const oOf = (f, x, z) => (x - f.ox) * f.nx + (z - f.oz) * f.nz;
const fquad = (D, f, s0, s1, y0, y1, o, n = f.N) => D.face([P(f, s0, y0, o), P(f, s1, y0, o), P(f, s1, y1, o), P(f, s0, y1, o)], n);
// box in the face frame; m bits: 1 front, 2 back, 4 left (s0), 8 right (s1), 16 top, 32 bottom
function fbox(D, f, s0, s1, y0, y1, o0, o1, m = 63) {
  if (m & 1) fquad(D, f, s0, s1, y0, y1, o1);
  if (m & 2) fquad(D, f, s0, s1, y0, y1, o0, neg(f.N));
  if (m & 4) D.face([P(f, s0, y0, o0), P(f, s0, y0, o1), P(f, s0, y1, o1), P(f, s0, y1, o0)], neg(f.R));
  if (m & 8) D.face([P(f, s1, y0, o0), P(f, s1, y0, o1), P(f, s1, y1, o1), P(f, s1, y1, o0)], f.R);
  if (m & 16) D.face([P(f, s0, y1, o0), P(f, s1, y1, o0), P(f, s1, y1, o1), P(f, s0, y1, o1)], UP);
  if (m & 32) D.face([P(f, s0, y0, o0), P(f, s1, y0, o0), P(f, s1, y0, o1), P(f, s0, y0, o1)], DOWN);
}
function fprism(S, f, s0, s1, o0, o1, y0, y1, kind = 'wall', flags = 0) {
  const Q = [[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = P(f, s, 0, o); return [p[0], p[2]]; });
  S.prism((area2(Q) < 0 ? Q.reverse() : Q).flat(), y0, y1, 0, 0, kind, flags);
}
// the uncovered parts of [a, b] once the spans are cut out
function freeOf(a, b, spans) {
  const out = [];
  let s = a;
  for (const [c, d] of spans.slice().sort((p, q) => p[0] - q[0])) { if (c > s + 1e-3) out.push([s, Math.min(c, b)]); s = Math.max(s, d); }
  if (s < b - 1e-3) out.push([s, b]);
  return out.filter(([c, d]) => d - c > 1e-3);
}
const hits = (f, a, b) => f.gaps.some(([c, d]) => a < d && b > c);
// collision prism over an [x, z] ring in either winding
const prismOf = (S, pts, y0, y1, kind = 'wall', flags = 0) => S.prism((area2(pts) < 0 ? pts.slice().reverse() : pts).flat(), y0, y1, 0, 0, kind, flags);

// ------------------------------------------------------------------------------------------------ build
export function buildDruzhba({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((q) => q.id === OSM_ID);
  const main = b?.parts?.find((q) => q.lv >= 3), annex = b?.parts?.find((q) => q.lv < 3);
  if (!main) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 99991), s0 = S.count;
  const ring = ringPts(main.p);
  const g = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 0; };
  const hs = ring.map(([x, z]) => g(x, z));
  const yG = hs.reduce((s, h) => s + h, 0) / hs.length, gBase = Math.min(...hs) - 0.5;
  const yP = yG + PLINTH, yRoof = yP + NF * FH, yTop = yRoof + PARA;

  // the concert-hall front: the footprint's bulge on the square side (x < 0); the core ring closes it with a straight edge
  const isBulge = (p) => p[0] < 0;
  const core = ring.filter((p) => !isBulge(p));
  const front = ring.filter(isBulge).sort((p, q) => p[1] - q[1]);  // north-west -> south-east
  const zA = front[0][1], zB = front[front.length - 1][1], xBack = 30;
  const xf = (z) => { // the front curve, linear between the OSM nodes
    for (let i = 0; i + 1 < front.length; i++) {
      const [x0, z0] = front[i], [x1, z1] = front[i + 1];
      if (z <= z1 || i + 2 === front.length) return x0 + (x1 - x0) * Math.min(1, Math.max(0, (z - z0) / (z1 - z0)));
    }
    return front[0][0];
  };
  const topAt = (z) => { const t = (z - zA) / (zB - zA); return yG + 19 + 4.5 * t * t; }; // the white wall sweeps up to the south-east

  const B = { wall: new MB(), tower: new MB(), det: new MB(), glass: new MB(), lit: new MB(), grass: new MB(), emblem: new MB(), sign: new MB() };
  const W = B.wall, D = B.det;
  const glassOf = () => GLASS[Math.floor(r() * GLASS.length)];

  // ---- wing façades: one face per core edge (the closing edge behind the bulge is inside)
  const faces = [];
  const inCore = (x, z) => inPoly(core, x, z);
  for (const [a, c] of edgesOf(core)) {
    if (a[0] < 7 && c[0] < 7 && Math.min(a[1], c[1]) <= zA + 0.5 && Math.max(a[1], c[1]) >= zB - 0.5) continue; // behind the bulge
    const dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 0.5) continue;
    let n = [dz / L, -dx / L];
    const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
    if (inCore(mx + n[0] * 0.3, mz + n[1] * 0.3)) n = [-n[0], -n[1]];
    const f = frameOf(a, c, n);
    f.type = L < 6 ? 'plain' : n[0] > 0.7 ? 'ribbon' : 'fins'; // the parking side (+x) has plain ribbons
    faces.push(f);
  }
  // cut-outs: the two dark granite pylons on the square side and the annex against the north-west end
  const cuts = [[3.5, 1199.5, 7.2, 1208.5], [3.5, 1222.8, 7.2, 1228], [46.8, 1128.8, 53.4, 1131.5]];
  for (const f of faces) for (const [x0, z0, x1, z1] of cuts) {
    const C = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], os = C.map(([x, z]) => oOf(f, x, z)), ss = C.map(([x, z]) => sOf(f, x, z));
    if (Math.min(...os) < 0.4 && Math.max(...os) > -0.4) f.gaps.push([Math.max(0, Math.min(...ss)), Math.min(f.w, Math.max(...ss))]);
  }
  const sw = faces.reduce((m, f) => (f.nx < -0.7 && (!m || f.w > m.w) ? f : m), null); // the long square-side face

  let nWin = 0;
  for (const f of faces) {
    W.setColor(RENDER);
    D.setColor(GRANITE); fquad(D, f, 0, f.w, gBase, yP, 0);             // plinth
    D.setColor('#6a6d70'); fbox(D, f, 0, f.w, yP - 0.08, yP, 0, 0.06, 1 | 16);
    fquad(W, f, 0, f.w, yRoof, yTop, 0);                                 // parapet band
    if (f.type === 'plain') { fquad(W, f, 0, f.w, yP, yRoof, 0); }
    else {
      const nb = Math.max(1, Math.round(f.w / BAY)), bay = f.w / nb, wins = [];
      for (let i = 0; i < nb; i++) { const a = i * bay + 0.45, c = (i + 1) * bay - 0.45; if (!hits(f, a - 0.3, c + 0.3)) wins.push([a, c]); }
      for (let k = 0; k < NF; k++) {
        const yf = yP + k * FH, ys = yf + SILL, yh = yf + HEAD;
        fquad(W, f, 0, f.w, yf, ys, 0); fquad(W, f, 0, f.w, yh, yf + FH, 0);
        for (const [a, c] of freeOf(0, f.w, wins)) fquad(W, f, a, c, ys, yh, 0);
        for (const [a, c] of wins) { // reveals, glass, a centre mullion and a white sill
          W.setColor('#cfc9bb');
          fbox(W, f, a, c, ys, yh, -REV, 0, 4 | 8); W.face([P(f, a, yh, 0), P(f, c, yh, 0), P(f, c, yh, -REV), P(f, a, yh, -REV)], DOWN);
          W.face([P(f, a, ys, 0), P(f, c, ys, 0), P(f, c, ys, -REV), P(f, a, ys, -REV)], UP);
          W.setColor(RENDER);
          const lit = r() < 0.28, G = lit ? B.lit : B.glass;
          G.setColor(lit ? '#6a655a' : glassOf()); fquad(G, f, a, c, ys, yh, -REV + 0.02);
          D.setColor('#eeede8'); const m = (a + c) / 2; fbox(D, f, m - 0.04, m + 0.04, ys, yh, -REV, -REV + 0.07, 1 | 4 | 8);
          fbox(D, f, a - 0.04, c + 0.04, ys - 0.05, ys, -REV, 0.05, 1 | 16);
          nWin++;
        }
      }
      if (f.type === 'fins') { // full-height taupe fins at every bay line, three white louvres per storey between them
        for (let i = 0; i <= nb; i++) {
          const s = Math.min(f.w - FIN / 2, Math.max(FIN / 2, i * bay));
          if (hits(f, s - FIN, s + FIN)) continue;
          W.setColor(FINC); fbox(W, f, s - FIN / 2, s + FIN / 2, yP, yTop, 0, FIN_OUT, 1 | 4 | 8 | 16);
        }
        W.setColor(SLAT);
        for (let i = 0; i < nb; i++) {
          const a = i * bay + FIN / 2, c = (i + 1) * bay - FIN / 2;
          if (hits(f, a, c)) continue;
          for (let k = 0; k < NF; k++) for (const dy of [0.8, 1.9, 3.0]) { const y = yP + k * FH + dy; fbox(W, f, a, c, y, y + 0.1, 0.3, 0.78, 1 | 16 | 32); }
        }
      }
    }
    // parapet inner face and a galvanised coping; roof-edge grab points
    W.setColor('#cbc6ba'); fquad(W, f, 0.3, f.w - 0.3, yRoof, yTop, -0.3, neg(f.N));
    D.setColor('#9a9d9c'); fbox(D, f, -0.03, f.w + 0.03, yTop, yTop + 0.06, -0.3, 0.05, 1 | 16);
    const e0 = P(f, 0, 0, -0.1), e1 = P(f, f.w, 0, -0.1);
    Z.edge(e0[0], e0[2], e1[0], e1[2], yTop, f.nx, f.nz);
  }
  D.setColor('#55575a'); D.fill(core, [], yRoof, true);                 // bitumen roof
  prismOf(S, core, gBase, yTop);

  // ---- dark granite pylons on the square side (the wide one with glass doors), steps and planters in front
  const pyl = sw ? sw.gaps.filter(([a, c]) => c - a > 2).sort((p, q) => p[0] - q[0]) : [];
  if (sw && pyl.length === 2) {
    const [[wa, wb], [na]] = pyl, yPy = yG + 15.8;
    for (const [a, c] of pyl) {
      D.setColor('#3a3d41'); fbox(D, sw, a, c, gBase, yPy, -0.1, 1.6, 1 | 4 | 8 | 16);
      D.setColor('#2f3236'); fbox(D, sw, a - 0.05, c + 0.05, yPy, yPy + 0.12, -0.1, 1.65, 1 | 4 | 8 | 16);
      fprism(S, sw, a, c, -0.1, 1.6, gBase, yPy);
    }
    const md = (wa + wb) / 2;
    B.lit.setColor('#6f685a'); fquad(B.lit, sw, md - 2.2, md + 2.2, yG + PODIUM, yG + PODIUM + 2.7, 1.62);
    D.setColor('#bfc3c4'); for (const s of [md - 2.2, md - 1.1, md, md + 1.1, md + 2.2]) fbox(D, sw, s - 0.04, s + 0.04, yG + PODIUM, yG + PODIUM + 2.7, 1.6, 1.66, 1 | 4 | 8);
    fbox(D, sw, md - 2.25, md + 2.25, yG + PODIUM + 2.7, yG + PODIUM + 2.78, 1.6, 1.66, 1 | 16 | 32);
    // landing and five granite steps down to the square
    const sa = wa - 2, sb = wb + 2, oL = 5.4;
    D.setColor('#8d8e8c'); fbox(D, sw, sa, sb, gBase, yG + PODIUM, 0, oL, 1 | 4 | 8 | 16);
    fprism(S, sw, sa, sb, 0, oL, gBase, yG + PODIUM);
    for (let k = 0; k < 4; k++) {
      const y = yG + PODIUM - 0.15 * (k + 1), o0 = oL + 0.4 * k, o1 = o0 + 0.4;
      D.setColor(k & 1 ? '#8a8b89' : '#939492'); fbox(D, sw, sa, sb, gBase, y, o0, o1, 1 | 4 | 8 | 16);
      fprism(S, sw, sa, sb, o0, o1, gBase, y);
    }
    // raised planters: granite walls with a coping, lawn on top
    const beds = [[2.5, sa], [sb, na - 0.4]].filter(([a, c]) => c - a > 3), oP = 7.0, yB = yG + PODIUM;
    for (const [a, c] of beds) {
      D.setColor('#6c6e70'); fbox(D, sw, a, c, gBase, yB - 0.08, 0, oP, 1 | 4 | 8);
      D.setColor('#8f908e');
      fbox(D, sw, a, c, yB - 0.08, yB, oP - 0.35, oP + 0.03, 1 | 16 | 4 | 8);
      fbox(D, sw, a, a + 0.35, yB - 0.08, yB, 0, oP - 0.35, 16 | 8); fbox(D, sw, c - 0.35, c, yB - 0.08, yB, 0, oP - 0.35, 16 | 4);
      B.grass.setColor('#4d7431');
      B.grass.face([P(sw, a + 0.35, yB - 0.05, 0), P(sw, c - 0.35, yB - 0.05, 0), P(sw, c - 0.35, yB - 0.05, oP - 0.35), P(sw, a + 0.35, yB - 0.05, oP - 0.35)], UP);
      fprism(S, sw, a, c, 0, oP + 0.03, gBase, yB);
    }
    // benches in front of the first bed (white slats on cast legs), park lamps along the square
    const [ba, bb] = beds[0] ?? [0, 0];
    for (let s = ba + 1.5; s + 1.8 < bb; s += 3.6) {
      const o = oP + 0.9;
      D.setColor('#f2f1ec'); fbox(D, sw, s, s + 1.8, yG + 0.42, yG + 0.47, o, o + 0.45, 1 | 4 | 8 | 16 | 32);
      fbox(D, sw, s, s + 1.8, yG + 0.55, yG + 0.9, o - 0.06, o, 1 | 2 | 16);
      D.setColor('#2c2d2f'); for (const q of [s + 0.15, s + 1.6]) fbox(D, sw, q, q + 0.06, yG, yG + 0.9, o - 0.06, o + 0.45, 1 | 2 | 4 | 8);
    }
    for (let s = 3; s < sw.w; s += 12) {
      const [x, , z] = P(sw, s, 0, 9.4), y = g(x, z);
      D.setColor('#26282a'); D.cyl(x, y, z, 0.11, 0.06, 3.9, 8); D.cyl(x, y, z, 0.2, 0.2, 0.5, 8);
      B.lit.setColor('#fff1d6'); B.lit.cyl(x, y + 3.9, z, 0.16, 0.26, 0.55, 8);
      D.setColor('#26282a'); D.cyl(x, y + 4.45, z, 0.3, 0.05, 0.25, 8);
      S.cyl(x, z, y, y + 4, 0.14, 0.14, 'pole');
    }
  }

  // ---- concert-hall front: curved white wall over the glazed foyer, canopy with the name, dark cheeks
  const NZ = 12, zs = Array.from({ length: NZ + 1 }, (_, i) => zA + (zB - zA) * i / NZ), REC = 2.5, yS = yG + 9.5;
  const yC0 = yG + 4.6, yC1 = yG + 5.1, yFa = yG + 6.4, CAN = 2.0;
  for (let i = 0; i < NZ; i++) {
    const za = zs[i], zb = zs[i + 1], xa = xf(za), xb = xf(zb), ta = topAt(za), tb = topAt(zb), zm = (za + zb) / 2;
    const dn = [-(zb - za), 0, xb - xa], dl = Math.hypot(dn[0], dn[2]), N = [dn[0] / dl, 0, dn[2] / dl]; // faces -x
    W.setColor('#f3f2ee');
    W.face([[xa, yS, za], [xb, yS, zb], [xb, tb, zb], [xa, ta, za]], N);                         // white wall
    W.face([[xa, yS, za], [xb, yS, zb], [xb + REC, yS, zb], [xa + REC, yS, za]], DOWN);          // soffit
    W.setColor('#d7d5cf'); W.face([[xa, ta, za], [xb, tb, zb], [xBack, tb, zb], [xBack, ta, za]], UP); // roof, falling with the wall
    W.setColor(PANEL); W.face([[xBack, yRoof, za], [xBack, yRoof, zb], [xBack, tb, zb], [xBack, ta, za]], [1, 0, 0]);
    // the foyer wall, recessed: travertine with glass doors in the middle, a glazed band over the canopy
    const ra = xa + REC, rb = xb + REC, doors = zm > zA + 7 && zm < zB - 7;
    if (doors) {
      B.lit.setColor('#7a7262'); B.lit.face([[ra, yG + 0.15, za], [rb, yG + 0.15, zb], [rb, yG + 3.4, zb], [ra, yG + 3.4, za]], N);
      D.setColor(TRAV); D.face([[ra, yG + 3.4, za], [rb, yG + 3.4, zb], [rb, yC0, zb], [ra, yC0, za]], N);
      D.setColor('#aeb1b1'); D.box(ra - 0.08, yG + 0.15, za - 0.05, ra + 0.02, yG + 3.4, za + 0.05, 2 | 16 | 32);
    } else { D.setColor(TRAV); D.face([[ra, gBase, za], [rb, gBase, zb], [rb, yC0, zb], [ra, yC0, za]], N); }
    D.setColor(TRAV); D.face([[ra, yC0, za], [rb, yC0, zb], [rb, yC1, zb], [ra, yC1, za]], N);
    const G = r() < 0.6 ? B.lit : B.glass;
    G.setColor(G === B.lit ? '#77705f' : glassOf()); G.face([[ra, yC1, za], [rb, yC1, zb], [rb, yS, zb], [ra, yS, za]], N);
    D.setColor('#c9cccc'); D.box(ra - 0.1, yC1, za - 0.05, ra, yS, za + 0.05, 2 | 16 | 32); D.box(Math.min(ra, rb) - 0.1, yG + 7.3, za, Math.max(ra, rb), yG + 7.38, zb, 2 | 4 | 8);
    // canopy slab and its upstand fascia
    const ca = xa - CAN, cb = xb - CAN;
    D.setColor('#e9e7e1');
    D.face([[ca, yC0, za], [cb, yC0, zb], [rb, yC0, zb], [ra, yC0, za]], DOWN);
    D.face([[ca, yFa, za], [cb, yFa, zb], [cb + 0.25, yFa, zb], [ca + 0.25, yFa, za]], UP);
    D.face([[ca, yC0, za], [cb, yC0, zb], [cb, yFa, zb], [ca, yFa, za]], N);
    D.setColor('#bdbab2'); D.face([[ca + 0.25, yC1, za], [cb + 0.25, yC1, zb], [rb, yC1, zb], [ra, yC1, za]], UP);
    D.setColor('#e9e7e1'); D.face([[ca + 0.25, yC1, za], [cb + 0.25, yC1, zb], [cb + 0.25, yFa, zb], [ca + 0.25, yFa, za]], neg(N));
  }
  for (const [z, s] of [[zA, -1], [zB, 1]]) { // canopy ends
    const x = xf(z);
    D.setColor('#e9e7e1'); D.face([[x - CAN, yC0, z], [x + REC, yC0, z], [x + REC, yC1, z], [x - CAN + 0.25, yC1, z], [x - CAN + 0.25, yFa, z], [x - CAN, yFa, z]], [0, 0, s]);
  }
  { // the name on the fascia, bent along it
    const sa = zA + 7, sb = zB - 7, cuts2 = [sa, ...zs.filter((z) => z > sa && z < sb), sb], E = B.sign.setColor('#ffffff');
    for (let i = 0; i + 1 < cuts2.length; i++) {
      const za = cuts2[i], zb = cuts2[i + 1], xa = xf(za) - CAN - 0.03, xb = xf(zb) - CAN - 0.03, ua = (za - sa) / (sb - sa), ub = (zb - sa) / (sb - sa);
      const v = E.vert(xa, yC1 + 0.1, za, -1, 0, 0, ua, 0);
      E.vert(xb, yC1 + 0.1, zb, -1, 0, 0, ub, 0); E.vert(xb, yFa - 0.15, zb, -1, 0, 0, ub, 1); E.vert(xa, yFa - 0.15, za, -1, 0, 0, ua, 1);
      E.quad(v, v + 1, v + 2, v + 3);
    }
  }
  prismOf(S, [[xf(zA) - CAN, zA], [xf(zB) - CAN, zB], [xf(zB) + REC, zB], [xf(zA) + REC, zA]], yC0, yFa, 'awning', 1);
  // cheeks: dark panelled walls framing the front from the square up to the top, and carrying on back over the roof
  for (const [z, dz] of [[zA, 1], [zB, -1]]) {
    const x0 = xf(z) - 0.3, t = topAt(z) + 0.3, zi = z + dz * 0.6, n = [0, 0, -dz];
    D.setColor(PANEL);
    D.box(x0, gBase, Math.min(z, zi), 6.6, t, Math.max(z, zi), 2 | 4 | 16 | 32);
    D.setColor('#4d5155'); for (let x = x0 + 1.5; x < 6.5; x += 1.5) D.box(x - 0.03, gBase, z - dz * 0.03, x + 0.03, t, z, dz > 0 ? 32 : 16);
    D.setColor(PANEL); D.face([[6.6, yRoof, z], [xBack, yRoof, z], [xBack, t, z], [6.6, t, z]], n);
    D.face([[x0, t, z], [xBack, t, z], [xBack, t, zi], [x0, t, zi]], UP);
    prismOf(S, [[x0, Math.min(z, zi)], [6.6, Math.min(z, zi)], [6.6, Math.max(z, zi)], [x0, Math.max(z, zi)]], gBase, t);
  }
  { // collision: foyer below the white wall, the hall block above it
    const low = zs.map((z) => [xf(z) + REC, z]);
    prismOf(S, [...low, [6.6, zB], [6.6, zA]], gBase, yS);
    for (let i = 0; i < NZ; i += 4) {
      const za = zs[i], zb = zs[Math.min(NZ, i + 4)];
      prismOf(S, [[xf(za), za], [xf(zb), zb], [xBack, zb], [xBack, za]], yS, topAt(zb));
    }
  }

  // ---- stage fly tower: grooved render, the corner to the square rounded, the emblem facing the square, masts
  const T = B.tower, fx0 = 12, fx1 = 40, fz0 = 1182, fz1 = 1210, yF = yG + 28, RC = 3.2;
  const outline = [];
  for (let k = 0; k <= 6; k++) { const a = Math.PI + (Math.PI / 2) * k / 6; outline.push([fx0 + RC + RC * Math.cos(a), fz0 + RC + RC * Math.sin(a)]); }
  outline.push([fx1, fz0], [fx1, fz1], [fx0, fz1]);
  const tw = (pts, y0, y1, M = T) => {
    for (const [a, c] of edgesOf(pts)) {
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 1e-3) continue;
      let n = [(c[1] - a[1]) / L, -(c[0] - a[0]) / L];
      if (inPoly(pts, (a[0] + c[0]) / 2 + n[0] * 0.2, (a[1] + c[1]) / 2 + n[1] * 0.2)) n = [-n[0], -n[1]];
      M.face([[a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], y1, c[1]], [a[0], y1, a[1]]], [n[0], 0, n[1]]);
    }
  };
  T.setColor('#ffffff'); tw(outline, yRoof, yF);
  const back = [[fx0, fz1], [fx1, fz1], [fx1, fz1 + 6], [fx0, fz1 + 6]];                  // the lower stage-house bay
  T.setColor('#ecebe6'); tw(back, yRoof, yG + 24);
  D.setColor('#9fa19f'); D.fill(outline, [], yF, true); D.fill(back, [], yG + 24, true);
  D.setColor('#b9bab6');
  for (const [pts, y] of [[outline, yF], [back, yG + 24]]) for (const [a, c] of edgesOf(pts)) {
    D.face([[a[0], y, a[1]], [c[0], y, c[1]], [c[0], y + 0.08, c[1]], [a[0], y + 0.08, a[1]]]);
  }
  prismOf(S, outline, yRoof, yF); prismOf(S, back, yRoof, yG + 24);
  Z.edge(fx0, fz0 + RC, fx0, fz1, yF, -1, 0);
  for (const [x, z, h] of [[33, 1190, 7], [36, 1203, 5]]) { // masts with panel antennas and a stair hut
    D.setColor('#7d8083'); D.cyl(x, yF, z, 0.12, 0.08, h, 6);
    for (let k = 0; k < 3; k++) { const a = k * 2.1; D.boxC(x + Math.cos(a) * 0.35, yF + h - 1.2, z + Math.sin(a) * 0.35, 0.18, 1.3, 0.18); }
    D.boxC(x, yF + h * 0.55, z, 0.9, 0.05, 0.9);
    S.cyl(x, z, yF, yF + h, 0.15, 0.15, 'antenna'); Z.add(x, yF + h, z, 0, 1, 0, 'antenna');
  }
  D.setColor('#c7c5bf'); D.box(22, yF, 1200, 25, yF + 2.4, 1204); S.box(22, yF, 1200, 25, yF + 2.4, 1204, 'equipment');
  { // the emblem: a disc on the square face of the tower, a thin rim round it
    const ec = 1196, ey = yG + 20.6, er = 3.3, x = fx0 - 0.14, E = B.emblem, seg = 40;
    const mid = E.vert(x, ey, ec, -1, 0, 0, 0.5, 0.5);
    const rim = [];
    for (let k = 0; k <= seg; k++) { const a = (k / seg) * TAU, c = Math.cos(a), s = Math.sin(a); rim.push(E.vert(x, ey + er * s, ec - er * c, -1, 0, 0, 0.5 - 0.5 * c, 0.5 + 0.5 * s)); }
    for (let k = 0; k < seg; k++) E.tri(mid, rim[k + 1], rim[k]);
    D.setColor('#d8d5ce');
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * TAU, a1 = ((k + 1) / seg) * TAU;
      const p = (a, xx) => [xx, ey + er * Math.sin(a), ec - er * Math.cos(a)];
      D.face([p(a0, fx0), p(a1, fx0), p(a1, x), p(a0, x)], [0, Math.sin((a0 + a1) / 2), -Math.cos((a0 + a1) / 2)]);
    }
  }

  // ---- the one-storey annex at the north corner
  let annexRing = null;
  if (annex) {
    annexRing = ringPts(annex.p);
    const yA = yG + 4.3;
    W.setColor(RENDER); W.extrude(annexRing, [], gBase, yA, { top: false });
    D.setColor('#5f6163'); D.fill(annexRing, [], yA, true);
    D.setColor('#9a9d9c'); for (const [a, c] of edgesOf(annexRing)) {
      D.face([[a[0], yA, a[1]], [c[0], yA, c[1]], [c[0], yA + 0.12, c[1]], [a[0], yA + 0.12, a[1]]]);
    }
    const xs = annexRing.map((p) => p[0]), zz = annexRing.map((p) => p[1]), zn = Math.min(...zz) - 0.03, xm = (Math.min(...xs) + Math.max(...xs)) / 2;
    D.setColor('#5c4a3c'); D.face([[xm - 0.8, yG + 0.1, zn], [xm + 0.8, yG + 0.1, zn], [xm + 0.8, yG + 2.3, zn], [xm - 0.8, yG + 2.3, zn]], [0, 0, -1]);
    B.glass.setColor(glassOf()); for (const d of [-2.2, 2.2]) B.glass.face([[xm + d - 0.7, yG + 1.1, zn], [xm + d + 0.7, yG + 1.1, zn], [xm + d + 0.7, yG + 2.6, zn], [xm + d - 0.7, yG + 2.6, zn]], [0, 0, -1]);
    prismOf(S, annexRing, gBase, yA);
  }

  // ---- the square: granite paving from the boulevard to the palace and round its south-east end
  const pave = { pos: [], uv: [], idx: [] };
  const paveRect = (x0, z0, x1, z1, cell = 2.5) => {
    const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell), base = pave.pos.length / 3;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz;
      pave.pos.push(x, g(x, z) + PAVE_Y, z); pave.uv.push(x / 8, z / 8);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = base + j * (nx + 1) + i, c = a + nx + 1;
      pave.idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  };
  const SQ = [-37, 1096, 6, 1262], SE = [6, 1227, 50, 1246];
  paveRect(...SQ); paveRect(...SE);

  // ---- plantings: blue spruces and thujas on the beds, a clipped hedge along their front
  const spots = [], blue = [PARK_PINE[0].map(([rr, gg, bb]) => [0.8 * rr, 0.95 * gg, 1.25 * bb])];
  if (sw && pyl.length === 2) {
    const yB = yG + PODIUM, sa = pyl[0][0] - 2, sb = pyl[0][1] + 2, na = pyl[1][0] - 0.4;
    for (let s = 4; s < sa - 1.5; s += 3.1) { const [x, , z] = P(sw, s, 0, 4.3 + r() * 0.8); spots.push({ x, z, y: yB, kind: 'conifer', variant: 'spruce', sc: 1.45 + 0.4 * r(), pal: blue, s3: [0.85, 1.15, 0.85] }); }
    for (const [a, c] of [[2.5, sa], [sb, na]]) {
      for (let s = a + 1.5; s < c - 1; s += BAY) { const [x, , z] = P(sw, s, 0, 1.7); spots.push({ x, z, y: yB, kind: 'conifer', variant: 'spruce', sc: 0.6 + 0.1 * r(), s3: [0.42, 1, 0.42] }); }
      const [x0, , z0] = P(sw, a + 0.6, 0, 6.3), [x1, , z1] = P(sw, c - 0.6, 0, 6.3);
      spots.push(...hedgeSpots(x0, z0, x1, z1, { y: yB, h: 0.6, w: 0.6 }));
    }
  }

  // ---- meshes
  const group = Object.assign(new THREE.Group(), { name: 'druzhba' });
  root.add(group);
  const stucco = stuccoTex(r), groove = grooveTex(r);
  stucco.repeat.set(0.25, 0.25); groove.repeat.set(1 / 2.2, 0.25);
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: stucco, vertexColors: true, roughness: 0.85 }),
    tower: new THREE.MeshStandardMaterial({ map: groove, vertexColors: true, roughness: 0.85 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.35, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffd9a0, emissiveIntensity: 0 }),
    grass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    emblem: new THREE.MeshStandardMaterial({ map: emblemTex(), roughness: 0.35, emissive: 0xffffff, emissiveIntensity: 0 }),
    sign: new THREE.MeshStandardMaterial({ map: signTex(), roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0 }),
    pave: decal(new THREE.MeshStandardMaterial({ map: paveTex(r), roughness: 0.82, polygonOffset: true, polygonOffsetFactor: -2 })),
  };
  M.emblem.emissiveMap = M.emblem.map; M.sign.emissiveMap = M.sign.map;
  let nV = 0;
  for (const [k, Bk] of Object.entries(B)) {
    if (!Bk.v) continue;
    nV += Bk.v;
    const glassy = k === 'glass' || k === 'lit';
    group.add(Object.assign(new THREE.Mesh(Bk.build(), M[k]), { name: 'druzhba-' + k, castShadow: !glassy, receiveShadow: true }));
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pave.pos, 3));
  pg.setAttribute('uv', new THREE.Float32BufferAttribute(pave.uv, 2));
  pg.setIndex(pave.idx); pg.computeVertexNormals();
  group.add(Object.assign(new THREE.Mesh(pg, M.pave), { name: 'druzhba-square', receiveShadow: true }));
  nV += pave.pos.length / 3;
  console.log(`[cherkasy] Druzhba: ${faces.length} façades, ${nWin} windows, ${spots.length} plantings, ${(nV / 1000).toFixed(1)}k verts, ${S.count - s0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const inRect = (x, z, [x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1;
  const fp = [{ poly: ring, h: yF - yG, kind: 'public', name: 'Палац культури «Дружба народів»' }];
  if (annexRing) fp.push({ poly: annexRing, h: 4.3, kind: 'public' });
  return {
    footprints: fp,
    spots,
    // generated trees keep off the paved square, the building and its beds
    clear: (x, z) => inRect(x, z, SQ) || inRect(x, z, SE) || inRect(x, z, [-6, 1115, 60, 1230]),
    update() { const k = nightK.value; M.lit.emissiveIntensity = 1.3 * k; M.emblem.emissiveIntensity = 0.35 * k; M.sign.emissiveIntensity = 0.5 * k; },
  };
}
