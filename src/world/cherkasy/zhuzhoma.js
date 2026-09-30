// OWNER: cherkasy. Вулиця Сержанта Жужоми (Mytnytsia, the new-build street between vul. Heroiv Dnipra and
// vul. Volodymyra Velykoho): its high-rises re-designed after the owner's drive-by photos instead of the generic
// facade kit – the red / orange / yellow "pixel" tower No 4, the graphite 17-storey No 1 still under construction
// (ЖК «Надія»: site fence + a slewing tower crane), the white blocks No 1 / 3 with blue loggia bands and blue roof
// caps, the pale No 7 wrapped in glazed loggias, the grey panel pair No 6 / 10, plus No 3/1, No 5, the retail No 1В
// and Heroiv Dnipra 89 (whose OSM outline only carries its podium parts, so the tower itself was missing).
// Street: twin-arm lamps on the south-west kerb, the W-beam guard rail with red chevrons on the Heroiv Dnipra bend,
// cars on the OSM parking spaces / surface car parks (the perpendicular rows seen in the photos).
//   ZHU_SKIP: OSM ids replaced here (buildings.js skips them)
//   buildZhuzhoma({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints, spots,
//     parked: [[x, z, ry], ...] parking spots for the traffic sim (sim.addParkingSpots) }
// Facades: one canvas per building covering its whole perimeter (u = metres along the ring, v = height), painted per
// edge (bays never straddle a corner) with an emissive twin (lit windows at night) and a roughness twin (glass).
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, area2, triangulate, convexParts, obb, rng, inPoly, centroid } from './geo.js';
import { SPACES, LOTS, SITE } from './zhuzhoma_data.js';
import { PARK_GREENS } from '../trees.js';

const STREET = /Сержанта Жужоми/;
// id, label, storeys (OSM, photos where they disagree), style
const SPEC = [
  [1303243021, 'Жужоми 4', 17, 'pixel'],
  [1303243022, 'Жужоми 1 (ЖК «Надія»)', 17, 'graphite'],
  [441112650, 'Жужоми 3/1', 17, 'sand'],
  [415610379, 'Жужоми 1', 10, 'blue'],
  [441112651, 'Жужоми 3', 10, 'blue'],
  [401545285, 'Жужоми 5', 10, 'teal'],
  [129423484, 'Жужоми 7', 12, 'glazed'], // OSM says 9; the photos show ~12 storeys over the car park
  [429217280, 'Жужоми 7 (прибудова)', 1, 'retail'],
  [118297733, 'Жужоми 6', 10, 'panel'],
  [999027435, 'Жужоми 10', 10, 'panel'],
  [1009083256, 'Героїв Дніпра 89', 14, 'bay'],
  [1303429978, 'Жужоми 1В', 2, 'retail'],
];
export const ZHU_SKIP = new Set(SPEC.map(s => s[0]));

const GF = 3.6, FH = 3.0, PAR = 1.1; // ground floor, typical storey, parapet
const STYLE = {
  // white wall, windows in white frames, colour blocks 2 bays x 2 storeys (burgundy / coral / orange / yellow)
  pixel: { wall: '#ecebe6', glass: '#34404b', frame: '#f6f6f3', bay: 2.9, win: [1.5, 1.6], plinth: '#55575a', top: '#7a2a44',
    blocks: [[6.5, null], [2.2, '#7a2a44'], [1.1, '#b8404f'], [1.6, '#dd7a43'], [1.3, '#e6bd46']] },
  // graphite curtain of big dark windows, thin white slab lines, a white band every 4th storey and at the crown
  graphite: { wall: '#45474b', glass: '#1c232a', frame: '#2c2d30', bay: 3.2, win: [2.5, 2.1], plinth: '#2e2f32', top: '#e8e7e2',
    slab: '#d9d8d2', band: 4 },
  sand: { wall: '#e3d8c6', glass: '#36404a', frame: '#f3f0ea', bay: 3.0, win: [1.6, 1.6], plinth: '#6b5d52', top: '#8a6a52',
    loggia: 4, sheet: '#8a6a52' },
  // white blocks with every 3rd bay a loggia stack: blue parapet sheets under white-framed glazing
  blue: { wall: '#e7e8e4', glass: '#3a4652', frame: '#fbfbf9', bay: 3.0, win: [1.5, 1.55], plinth: '#6d7072', top: '#3e6db2',
    loggia: 3, sheet: '#3e6db2', capRoof: '#3e6db2' },
  teal: { wall: '#e4e7e2', glass: '#3a4652', frame: '#fbfbf9', bay: 3.0, win: [1.5, 1.55], plinth: '#6d7072', top: '#4f978c',
    loggia: 3, sheet: '#4f978c', capRoof: '#4f978c' },
  // pale grey-blue, nearly every bay a glazed loggia (white PVC), pale blue pilasters
  glazed: { wall: '#c9d5dc', glass: '#3d4a55', frame: '#f7f8f7', bay: 3.0, win: [1.5, 1.55], plinth: '#707476', top: '#a9bcc8',
    loggia: 1.35, sheet: '#dfe4e4', pilaster: '#a9bcc8', roundGlass: true },
  // 1990s grey panel: panel joints, residents' mixed loggia enclosures
  panel: { wall: '#a9aaa5', glass: '#39424a', frame: '#e9e8e3', bay: 3.2, win: [1.45, 1.45], plinth: '#77786f', top: '#9a9b96',
    loggia: 2, sheet: 'mixed', joints: '#8e8f8a' },
  // warm white with rounded, fully glazed bays
  bay: { wall: '#e9e3d6', glass: '#3a4450', frame: '#fbfaf6', bay: 3.0, win: [1.55, 1.6], plinth: '#6e655c', top: '#b8a78e',
    loggia: 4, sheet: '#b8a78e', roundGlass: true },
  retail: { wall: '#8e9194', glass: '#2a3540', frame: '#2d2f31', bay: 3.0, win: [2.6, 3.0], plinth: '#3d3f41', top: '#34363a', shop: true },
};
const SHEETS = ['#e6e4dc', '#e6e4dc', '#6a4a3a', '#4a6c9a', '#5c7a5a', '#a9a69e', '#c9c3b5'];
const WARM = ['#ffd9a0', '#ffe6b8', '#ffc98a', '#fff1d6', '#d8e4ff'];

// ------------------------------------------------------------------------------------------------ helpers
function hash(a, b = 0, c = 0) { // integer triple -> [0, 1)
  const k0 = (a * 374761393 + b * 668265263 + c * 2147483647) | 0, k1 = Math.imul(k0 ^ (k0 >>> 13), 1274126177);
  return ((k1 ^ (k1 >>> 16)) >>> 0) / 4294967296;
}
const pickW = (u, list) => { let s = u * list.reduce((a, x) => a + x[0], 0); for (const x of list) { s -= x[0]; if (s <= 0) return x[1]; } return list[list.length - 1][1]; };
const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
function tex(cv, srgb = true) {
  const t = Object.assign(new THREE.CanvasTexture(cv), { anisotropy: 8, wrapS: THREE.RepeatWrapping });
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const UV4 = [[0, 0], [1, 0], [1, 1], [0, 1]];
// quad V[0..3] facing n (winding picked from it), flat normal n
function quadN(D, V, n, UV = UV4) {
  const [p, q, r] = V, e = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], f = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
  const side = n[0] * (e[1] * f[2] - e[2] * f[1]) + n[1] * (e[2] * f[0] - e[0] * f[2]) + n[2] * (e[0] * f[1] - e[1] * f[0]);
  const [i0, i1, i2, i3] = V.map((v, k) => D.vert(v[0], v[1], v[2], n[0], n[1], n[2], UV[k][0], UV[k][1]));
  if (side < 0) D.quad(i0, i3, i2, i1); else D.quad(i0, i1, i2, i3);
}
// closed ring -> its edges { A, B, L, i } (outward normal of a positive ring: nrm(e))
const ringEdges = (P) => P.map((A, i) => { const B = P[i + 1 < P.length ? i + 1 : 0]; return { A, B, L: Math.hypot(B[0] - A[0], B[1] - A[1]), i }; });
const nrm = (e) => [(e.B[1] - e.A[1]) / e.L, 0, (e.A[0] - e.B[0]) / e.L];
// vertical wall quad over the edge A -> B from y0 to y1
const wallQuad = (D, A, B, y0, y1, n, UV) => quadN(D, [[A[0], y0, A[1]], [B[0], y0, B[1]], [B[0], y1, B[1]], [A[0], y1, A[1]]], n, UV);
// oriented box: centre, long axis (ux, uz), half sizes along u / across / height; returns its corner ring
function obox(D, cx, cz, ux, uz, hl, hw, y0, y1) {
  const at = (a, b) => [cx + ux * a - uz * b, cz + uz * a + ux * b];
  const C = [at(-hl, -hw), at(hl, -hw), at(hl, hw), at(-hl, hw)], sg = area2(C) > 0 ? 1 : -1;
  for (const e of ringEdges(C)) wallQuad(D, e.A, e.B, y0, y1, nrm(e).map((v) => v * sg));
  quadN(D, C.map((p) => [p[0], y1, p[1]]), [0, 1, 0]);
  return C;
}
function segDist(x, z, P) { // distance from (x, z) to the polyline P
  let best = Infinity;
  P.forEach((B, i) => {
    if (!i) return;
    const A = P[i - 1], ex = B[0] - A[0], ez = B[1] - A[1], L2 = ex * ex + ez * ez || 1;
    const t = Math.min(1, Math.max(0, ((x - A[0]) * ex + (z - A[1]) * ez) / L2));
    best = Math.min(best, Math.hypot(A[0] + ex * t - x, A[1] + ez * t - z));
  });
  return best;
}// flat roof over a positive ring at height y, facing up (earcut via three's ShapeUtils)
function flatRoof(D, P, y) {
  const { pts, tris } = triangulate(P), first = D.v;
  for (const p of pts) D.vert(p[0], y, p[1], 0, 1, 0);
  for (const [i, j, k] of tris) {
    const a = pts[i], b = pts[j], c = pts[k], ccw = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0;
    D.tri(first + i, first + (ccw ? j : k), first + (ccw ? k : j));
  }
}

// ------------------------------------------------------------------------------------------------ facade painter
// E: edges [{ L, s0, flag }], n storeys, ph plinth height (gBase -> g0); returns { map, emissive, rough, texH }
function paintFacade(st, E, per, n, ph, seed, gfH) {
  const H = ph + gfH + (n - 1) * FH + PAR;
  const ppm = Math.min(12, 4096 / per, 1024 / H);
  const W = Math.ceil(per * ppm), Hp = Math.ceil(H * ppm);
  const cA = canvas(W, Hp), cE = canvas(W, Hp), cR = canvas(W, Hp);
  const A = cA.getContext('2d'), M = cE.getContext('2d'), R = cR.getContext('2d');
  M.fillStyle = '#000'; M.fillRect(0, 0, W, Hp); R.fillStyle = '#e0e0e0'; R.fillRect(0, 0, W, Hp);
  const Y = (y) => Hp - y * ppm; // metres above gBase -> canvas row
  const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x * ppm, Y(y + h), w * ppm, h * ppm); };
  const fy = (f) => ph + (f === 0 ? 0 : gfH + (f - 1) * FH); // floor f bottom
  const glass = (x, y, w, h, lit, frame, mull = 0) => { // pane + frame + mullions; lit windows glow at night
    const g = A.createLinearGradient(0, Y(y + h), 0, Y(y)); g.addColorStop(0, shade(st.glass, 1.25)); g.addColorStop(1, shade(st.glass, 0.85));
    A.fillStyle = g; A.fillRect(x * ppm, Y(y + h), w * ppm, h * ppm);
    rect(R, x, y, w, h, '#202020');
    if (lit) rect(M, x + 0.05, y + 0.05, w - 0.1, h - 0.1, lit);
    const fw = Math.max(1, ppm * 0.07); A.strokeStyle = frame; A.lineWidth = fw;
    A.strokeRect(x * ppm + fw / 2, Y(y + h) + fw / 2, w * ppm - fw, h * ppm - fw);
    A.beginPath();
    const k = mull || Math.max(1, Math.round(w / 0.9));
    for (let i = 1; i < k; i++) { const xx = (x + w * i / k) * ppm; A.moveTo(xx, Y(y + h)); A.lineTo(xx, Y(y)); }
    if (h > 1.2) { const yy = Y(y + h * 0.72); A.moveTo(x * ppm, yy); A.lineTo((x + w) * ppm, yy); }
    A.stroke();
  };
  const litOf = (a, b, c, p = 0.3) => (hash(seed, a * 131 + b, c) < p ? WARM[Math.floor(hash(seed + 7, a, b * 17 + c) * WARM.length)] : null);
  // wall + plinth + parapet band
  A.fillStyle = st.wall; A.fillRect(0, 0, W, Hp);
  rect(A, 0, 0, per, ph + 0.35, st.plinth);
  rect(A, 0, H - PAR - 0.15, per, PAR + 0.15, st.top);
  E.forEach((e, ei) => {
    const x0 = e.s0, L = e.L;
    if (L < 2.4) { // short edge: rounded / chamfered corner – full-height glazing strip or plain wall
      if (st.roundGlass && L > 0.5) for (let f = 1; f < n; f++) { rect(A, x0, fy(f), L, 0.95, st.sheet); glass(x0, fy(f) + 0.95, L, FH - 1.05, litOf(ei, 0, f, 0.25), st.frame, 1); }
      return;
    }
    const nb = Math.max(1, Math.round(L / st.bay)), bw = L / nb;
    // vertical pilasters between loggia stacks
    if (st.pilaster) for (let j = 0; j <= nb; j += 2) rect(A, x0 + j * bw - 0.18, ph + gfH, 0.36, (n - 1) * FH, st.pilaster);
    for (let f = 0; f < n; f++) {
      const y = fy(f);
      if (f === 0) { // ground floor
        if (st.shop || e.flag === '2') {
          rect(A, x0, y + 3.0, L, gfH - 3.0 + 0.05, '#2f3134'); // fascia
          for (let j = 0; j < nb; j++) glass(x0 + j * bw + 0.15, y + 0.25, bw - 0.3, Math.min(2.7, gfH - 0.9), hash(seed, ei, j) < 0.75 ? '#fff0cf' : null, '#2b2c2e', 2);
        } else {
          for (let j = 0; j < nb; j++) {
            const door = e.door && j === Math.floor(nb / 2);
            if (door) { rect(A, x0 + j * bw + bw / 2 - 0.8, y, 1.6, 2.4, '#4a3a30'); rect(A, x0 + j * bw + bw / 2 - 0.65, y + 0.1, 1.3, 2.15, '#5e4a3c'); glass(x0 + j * bw + bw / 2 - 0.6, y + 1.2, 1.2, 0.9, litOf(ei, j, 0, 0.8), '#3a3a3a', 1); }
            else glass(x0 + j * bw + (bw - st.win[0]) / 2, y + 1.1, st.win[0], 1.3, litOf(ei, j, 0, 0.2), st.frame);
          }
        }
        continue;
      }
      if (st.slab) { rect(A, x0, y - 0.12, L, 0.24, st.slab); if (f % st.band === 1) rect(A, x0, y - 0.35, L, 0.6, st.top); }
      if (st.joints) { A.fillStyle = st.joints; A.fillRect(x0 * ppm, Y(y) - 1, L * ppm, 2); }
      for (let j = 0; j < nb; j++) {
        const bx = x0 + j * bw;
        if (st.joints) { A.fillStyle = st.joints; A.fillRect(bx * ppm - 1, Y(y + FH), 2, FH * ppm); }
        if (st.blocks) { // pixel tower: colour cells of 2 bays x 2 storeys, about half left white
          const bi = Math.floor(j / 2), bf = Math.floor((f - 1) / 2), u = hash(seed + ei, bi, bf);
          const c = pickW(u, st.blocks); if (c) rect(A, bx, y, bw, FH, c);
        }
        const isLog = st.loggia && (st.loggia < 2 ? hash(seed, ei, j) < 1 / st.loggia * 1.05 : (j % Math.round(st.loggia)) === Math.round(st.loggia) - 1 && nb > 1);
        if (isLog) { // loggia stack: parapet sheet + glazing, floor-to-ceiling
          const sh = st.sheet === 'mixed' ? SHEETS[Math.floor(hash(seed, ei * 97 + j, f) * SHEETS.length)] : st.sheet;
          const open = st.sheet === 'mixed' && hash(seed + 3, ei * 31 + j, f) < 0.2;
          rect(A, bx + 0.12, y + 0.05, bw - 0.24, 1.0, sh);
          if (open) { rect(A, bx + 0.2, y + 1.05, bw - 0.4, FH - 1.25, '#2d3238'); glass(bx + (bw - st.win[0]) / 2, y + 1.1, st.win[0] * 0.9, 1.5, litOf(ei, j, f), st.frame); }
          else glass(bx + 0.12, y + 1.05, bw - 0.24, FH - 1.2, litOf(ei, j, f), st.frame);
        } else {
          const ww = Math.min(st.win[0], bw - 0.4);
          glass(bx + (bw - ww) / 2, y + (st.win[1] > 1.9 ? 0.45 : 0.9), ww, st.win[1], litOf(ei, j, f), st.frame);
        }
      }
    }
  });
  return { map: tex(cA), emissive: tex(cE), rough: tex(cR, false), H };
}
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.min(255, Math.round(v * k))); return `rgb(${c[0]},${c[1]},${c[2]})`; }

// ------------------------------------------------------------------------------------------------ small textures
function chevronTex() {
  const c = canvas(128, 160), g = c.getContext('2d');
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 128, 160); g.fillStyle = '#c8202a'; g.fillRect(8, 8, 112, 144);
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(84, 26); g.lineTo(104, 26); g.lineTo(60, 80); g.lineTo(104, 134); g.lineTo(84, 134); g.lineTo(40, 80); g.closePath(); g.fill();
  return tex(c);
}
function fenceTex() { // blue profiled steel sheet with the developer's banner stripe
  const c = canvas(256, 64), g = c.getContext('2d');
  g.fillStyle = '#2f5d8f'; g.fillRect(0, 0, 256, 64);
  for (let x = 0; x < 256; x += 8) { g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x, 0, 3, 64); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + 4, 0, 2, 64); }
  g.fillStyle = '#f3f3f0'; g.fillRect(0, 22, 256, 14); g.fillStyle = '#2f5d8f'; g.font = 'bold 12px Arial, sans-serif'; g.fillText('ЖК «НАДІЯ»   БУДІВНИЦТВО', 8, 33);
  return tex(c);
}

// ------------------------------------------------------------------------------------------------ build
export function buildZhuzhoma({ root, map, solids: S, zips: Z, heightAt }) {
  const t0 = performance.now();
  const group = Object.assign(new THREE.Group(), { name: 'zhuzhoma' });
  root.add(group);
  const byId = new Map(map.buildings.map(b => [b.id, b]));
  const glowMats = [], footprints = [];
  const plain = {}; const mb = (k) => (plain[k] ??= new MB());
  const M = {
    roof: new THREE.MeshStandardMaterial({ color: 0x5e6062, roughness: 0.95 }),
    inner: new THREE.MeshStandardMaterial({ color: 0x8d8e8b, roughness: 0.9 }),
    cope: new THREE.MeshStandardMaterial({ color: 0xb9bab6, roughness: 0.7, metalness: 0.2 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xa7a59e, roughness: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x6f7477, roughness: 0.5, metalness: 0.6 }),
    galv: new THREE.MeshStandardMaterial({ color: 0xb4b8ba, roughness: 0.35, metalness: 0.8 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2a2c2f, roughness: 0.6, metalness: 0.3 }),
    crane: new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.6, metalness: 0.3 }),
    ballast: new THREE.MeshStandardMaterial({ color: 0x8e8c86, roughness: 0.95 }),
    chev: new THREE.MeshStandardMaterial({ map: chevronTex(), roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0 }),
    fence: new THREE.MeshStandardMaterial({ map: fenceTex(), roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }),
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.95, 0.85) }),
    red: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.1, 0.05) }),
  };
  const capMats = new Map();
  const capMat = (c) => { if (!capMats.has(c)) capMats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide })); return capMats.get(c); };
  const caps = new Map(); const capMB = (c) => { if (!caps.has(c)) caps.set(c, new MB()); return caps.get(c); };
  let nV = 0, nB = 0;
  const addMesh = (D, mat, name, shadow = true) => {
    if (!D.v) return null;
    nV += D.v;
    return group.add(Object.assign(new THREE.Mesh(D.build(), mat), { name: 'zhu-' + name, castShadow: shadow, receiveShadow: true })).children.at(-1);
  };

  // ---- towers
  for (const [id, label, lv, sk] of SPEC) {
    const b = byId.get(id); if (!b) continue;
    let P = ringPts(b.p); if (P.length < 3) continue;
    let flags = [...(b.f ?? '')]; if (area2(P) < 0) { P = P.reverse(); flags = P.map((_, i) => b.f?.[(2 * P.length - 2 - i) % P.length] ?? '0'); }
    const st = STYLE[sk];
    const [cx, cz] = centroid(P);
    let gMin = heightAt(cx, cz), gSum = gMin; for (const [x, z] of P) { const h = heightAt(x, z); gSum += h; if (h < gMin) gMin = h; }
    const g0 = gSum / (P.length + 1) + 0.15, gBase = gMin - 0.3, ph = g0 - gBase;
    const gfH = st.shop ? (lv === 1 ? 4.4 : 4.0) : GF;
    const Hw = g0 + gfH + (lv - 1) * FH; // roof slab
    // edges; entrances on the longest yard-side edges (one door per ~22 m)
    const E = ringEdges(P);
    let per = 0;
    for (const e of E) { e.s0 = per; e.flag = flags[e.i] ?? '0'; per += e.L; }
    for (const e of E) if (e.flag === '0' && e.L > 9) e.door = true;
    const F = paintFacade(st, E, per, lv, ph, id % 100000, gfH);
    const mat = new THREE.MeshStandardMaterial({ map: F.map, emissiveMap: F.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughnessMap: F.rough, roughness: 1, metalness: 0.05, envMapIntensity: 1.2 });
    glowMats.push(mat);
    const W = new MB(), top = gBase + F.H;
    for (const e of E) {
      if (e.L < 1e-3) continue;
      const n = nrm(e), u0 = e.s0 / per, u1 = (e.s0 + e.L) / per;
      wallQuad(W, e.A, e.B, gBase, top, n, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
      // parapet inside face + coping
      const ni = [-n[0], 0, -n[2]], ix = -n[0] * 0.3, iz = -n[2] * 0.3;
      const Ai = [e.A[0] + ix, e.A[1] + iz], Bi = [e.B[0] + ix, e.B[1] + iz];
      wallQuad(mb('inner'), Ai, Bi, Hw, top, ni);
      quadN(mb('cope'), [e.A, e.B, Bi, Ai].map((p) => [p[0], top, p[1]]), [0, 1, 0]);
      if (e.L > 3 && lv > 1) Z.edge(e.A[0] - n[0] * 0.12, e.A[1] - n[2] * 0.12, e.B[0] - n[0] * 0.12, e.B[1] - n[2] * 0.12, top, n[0], n[2]);
      // entrance canopies (concrete slab on two posts) over the yard doors
      if (e.door && lv > 2) {
        const nb = Math.max(1, Math.round(e.L / st.bay)), bw = e.L / nb, a = (Math.floor(nb / 2) + 0.5) * bw, ux = (e.B[0] - e.A[0]) / e.L, uz = (e.B[1] - e.A[1]) / e.L;
        const px = e.A[0] + ux * a + n[0] * 0.9, pz = e.A[1] + uz * a + n[2] * 0.9;
        obox(mb('concrete'), px, pz, ux, uz, 1.3, 0.95, g0 + 2.55, g0 + 2.75);
        for (const s of [-1, 1]) mb('steel').cyl(px + ux * s * 1.1 + n[0] * 0.75, g0, pz + uz * s * 1.1 + n[2] * 0.75, 0.05, 0.05, 2.55, 6);
      }
    }
    addMesh(W, mat, label);
    flatRoof(mb('roof'), P, Hw);
    for (const C of convexParts(P)) S.prism(C.flat(), gBase, top, 0, 0, 'wall');
    footprints.push({ poly: P, h: top - g0, kind: 'apt', name: label });
    // roof: lift / stair rooms along the long axis (blue lean-to caps on the blue / teal blocks), AC + antennas
    if (lv >= 8) {
      const o = obb(P), k = Math.max(1, Math.round(o.L / 20)), r = rng(id % 9973);
      for (let i = 0; i < k; i++) {
        const a = (i + 0.5) / k - 0.5, x = o.cx + o.ux * a * o.L * 0.8, z = o.cz + o.uz * a * o.L * 0.8;
        if (!inPoly(P, x + o.ux * 3, z + o.uz * 3) || !inPoly(P, x - o.ux * 3, z - o.uz * 3)) continue;
        const h = 3.2, hw = Math.min(2.6, o.W * 0.2);
        obox(mb('concrete'), x, z, o.ux, o.uz, 3, hw, Hw, Hw + h);
        S.prism(obox(new MB(), x, z, o.ux, o.uz, 3, hw, Hw, Hw + h).flat(), Hw, Hw + h, 0, 0, 'equipment');
        if (st.capRoof) { // mono-pitch blue sheet roof, overhanging
          const D = capMB(st.capRoof), vx = -o.uz, vz = o.ux, y0 = Hw + h, y1 = Hw + h + 1.3;
          const Q = (a2, b2, y) => [x + o.ux * a2 + vx * b2, y, z + o.uz * a2 + vz * b2];
          quadN(D, [Q(-3.4, -hw - 0.4, y0), Q(3.4, -hw - 0.4, y0), Q(3.4, hw + 0.4, y1), Q(-3.4, hw + 0.4, y1)], [0, 1, 0]);
          quadN(D, [Q(-3.4, hw + 0.4, y0), Q(3.4, hw + 0.4, y0), Q(3.4, hw + 0.4, y1), Q(-3.4, hw + 0.4, y1)], [vx, 0, vz]);
          for (const s of [-1, 1]) { const p0 = Q(s * 3.4, -hw - 0.4, y0), p1 = Q(s * 3.4, hw + 0.4, y0), p2 = Q(s * 3.4, hw + 0.4, y1); const ids = [p0, p1, p2].map(p => D.vert(p[0], p[1], p[2], o.ux * s, 0, o.uz * s)); if (s > 0) D.tri(ids[0], ids[1], ids[2]); else D.tri(ids[0], ids[2], ids[1]); }
        }
        for (let q = 0; q < 3; q++) { const ax = x + o.ux * (r() - 0.5) * 5 + (-o.uz) * (hw + 1.2 + r() * 1.5), az = z + o.uz * (r() - 0.5) * 5 + o.ux * (hw + 1.2 + r() * 1.5); if (inPoly(P, ax, az)) mb('galv').box(ax - 0.45, Hw, az - 0.35, ax + 0.45, Hw + 0.7, az + 0.35); }
        const mx = x + o.ux * 1.5, mz = z + o.uz * 1.5; mb('steel').cyl(mx, Hw + h, mz, 0.04, 0.03, 4, 5);
      }
    }
    nB++;
    b._zhu = { P, g0, Hw, top };
  }
  // Heroiv Dnipra 89: its commercial podium parts
  const b89 = byId.get(1009083256);
  for (const pr of b89?.parts ?? []) {
    let Q = ringPts(pr.p); if (area2(Q) < 0) Q = Q.reverse();
    const g0 = b89._zhu?.g0 ?? heightAt(...centroid(Q)), y1 = g0 + 4.2;
    for (const e of ringEdges(Q)) if (e.L >= 1e-3) wallQuad(mb('dark'), e.A, e.B, g0 - 1.5, y1, nrm(e));
    flatRoof(mb('roof'), Q, y1);
    for (const C of convexParts(Q)) S.prism(C.flat(), g0 - 1.5, y1, 0, 0, 'wall');
  }

  // ---- street centreline (Heroiv Dnipra end first -> Volodymyra Velykoho)
  const ways = map.roads.filter(r => STREET.test(r.n || '')).map(r => ringPts(r.p));
  const line = chain(ways);
  const hwR = 4.2;
  const inBld = (x, z, pad = 0) => footprints.some(f => inPoly(f.poly, x, z)) || (pad && footprints.some(f => segDist(x, z, [...f.poly, f.poly[0]]) < pad));
  const clearPts = [];

  // twin-arm lamps on the south-west kerb (left when driving from Heroiv Dnipra), one arm over the road
  const lampHeads = new MB(); let nLamp = 0;
  walk(line, 34, 10, (x, z, tx, tz) => {
    const nx = tz, nz = -tx; // left of travel
    const px = x + nx * (hwR + 0.9), pz = z + nz * (hwR + 0.9); if (inBld(px, pz, 1)) return;
    const y = heightAt(px, pz), Hp = 9.5;
    mb('steel').cyl(px, y, pz, 0.14, 0.08, Hp, 8);
    mb('steel').cyl(px, y, pz, 0.24, 0.22, 0.6, 8);
    for (const s of [-1, 1]) { // arms curve up and out ~2.6 m, luminaire at the tip
      let ax = px, ay = y + Hp - 0.6, az = pz;
      for (let k = 1; k <= 5; k++) { const t = k / 5, bx = px - nx * s * 2.6 * t, bz = pz - nz * s * 2.6 * t, by = y + Hp - 0.6 + Math.sin(t * Math.PI * 0.8) * 1.0 - t * 0.2; mb('steel').tube([ax, ay, az], [bx, by, bz], 0.045, 5); ax = bx; ay = by; az = bz; }
      lampHeads.with(new THREE.Matrix4().makeRotationY(Math.atan2(nz * s, -nx * s)).setPosition(ax, ay - 0.08, az), d => { d.box(-0.35, -0.06, -0.14, 0.35, 0.06, 0.14); });
    }
    S.box(px - 0.15, y, pz - 0.15, px + 0.15, y + Hp, pz + 0.15, 'pole');
    clearPts.push([px, pz]); nLamp++;
  });
  const lampMesh = addMesh(lampHeads, M.lamp, 'lamps', false);

  // guard rail + chevrons on the outer (north-east) side of the Heroiv Dnipra bend, facing northbound traffic
  const her = map.roads.filter(r => /Героїв Дніпра/.test(r.n || '')).map(r => ringPts(r.p));
  const hStart = line[0];
  const hWay = her.find(P => Math.hypot(P[0][0] - hStart[0], P[0][1] - hStart[1]) < 3 || Math.hypot(P[P.length - 1][0] - hStart[0], P[P.length - 1][1] - hStart[1]) < 3);
  const bend = []; // from 35 m down Heroiv Dnipra, round the bend, 70 m up Zhuzhomy
  if (hWay) { const Q = Math.hypot(hWay[0][0] - hStart[0], hWay[0][1] - hStart[1]) < 3 ? hWay.slice().reverse() : hWay.slice(); bend.push(...cut(Q, 35, true)); }
  bend.push(...cut(line, 75, false));
  let nChev = 0;
  if (bend.length > 2) {
    const rail = new MB(), posts = mb('galv');
    const R = resample(bend, 2);
    const offs = R.map((p, i) => { const q = R[Math.min(R.length - 1, i + 1)], o = R[Math.max(0, i - 1)], tx = q[0] - o[0], tz = q[1] - o[1], L = Math.hypot(tx, tz) || 1; return [tx / L, tz / L]; });
    // outer side: away from the bend's centre (the side the heading turns away from)
    const [ax, az] = offs[0], [bx, bz] = offs[offs.length - 1], turn = ax * bz - az * bx, sgn = turn < 0 ? 1 : -1; // left turn (cross < 0) -> rail on the right
    const RP = R.map((p, i) => { const [tx, tz] = offs[i], nx = -tz * sgn, nz = tx * sgn; const x = p[0] + nx * (hwR + 0.9), z = p[1] + nz * (hwR + 0.9); return [x, z, heightAt(x, z), nx, nz, tx, tz]; });
    for (let i = 0; i < RP.length; i++) {
      const [x, z, y] = RP[i];
      posts.box(x - 0.06, y, z - 0.06, x + 0.06, y + 0.75, z + 0.06);
      if (i) { // two-sided rail band from the previous post, one collision box per span
        const [x0, z0, y0, nx, nz] = RP[i - 1], band = [[x0, y0 + 0.5, z0], [x, y + 0.5, z], [x, y + 0.8, z], [x0, y0 + 0.8, z0]];
        for (const sg of [-1, 1]) quadN(rail, band, [sg * nx, 0, sg * nz]);
        const lo = Math.min(y0, y);
        S.box(Math.min(x0, x) - 0.1, lo, Math.min(z0, z) - 0.1, Math.max(x0, x) + 0.1, Math.max(y0, y) + 0.8, Math.max(z0, z) + 0.1, 'pole');
      }
      clearPts.push([x, z]);
    }
    addMesh(rail, M.galv, 'guardrail');
    // chevrons every ~12 m round the bend: plate faces the driver coming up Heroiv Dnipra (travel = +tangent)
    const chev = new MB();
    for (let i = 3; i < RP.length - 12; i += 6) {
      const [x, z, y, nx, nz, tx, tz] = RP[i], px = x + nx * 0.5, pz = z + nz * 0.5;
      mb('steel').cyl(px, y, pz, 0.035, 0.035, 2.3, 6);
      const fn = [-tx, 0, -tz], hw = 0.4, rx = -tz * hw, rz = tx * hw; // viewer's right, half width
      const ox = px - tx * 0.05, oz = pz - tz * 0.05, plate = (sr, h) => [ox + sr * rx, y + h, oz + sr * rz];
      quadN(chev, [plate(-1, 1.3), plate(1, 1.3), plate(1, 2.3), plate(-1, 2.3)], fn);
      nChev++;
    }
    addMesh(chev, M.chev, 'chevrons', false);
  }

  // ---- parked cars: OSM parking spaces, then rows packed into the surface car parks
  const slots = [], r = rng(4242);
  for (const Q of SPACES) {
    const o = obb(Q); if (!o) continue;
    if (r() < 0.82) slots.push([o.cx, o.cz, Math.atan2(o.uz, o.ux) + (r() < 0.5 ? Math.PI : 0)]);
  }
  const taken = (x, z) => slots.some(s => Math.hypot(s[0] - x, s[1] - z) < 2.2);
  for (const lot of LOTS) {
    const Q = lot.p, o = obb(Q); if (!o || o.W < 2.2) continue;
    const vx = -o.uz, vz = o.ux, fill = lot.id === 1159884691 ? 0.78 : 0.7;
    const rows = o.W >= 10 ? [-(o.W / 2 - 2.5), o.W / 2 - 2.5] : o.W >= 4.6 ? [0] : null;
    if (rows) for (const b of rows) for (let a = -o.L / 2 + 1.4; a <= o.L / 2 - 1.2; a += 2.6) {
      const x = o.cx + o.ux * a + vx * b, z = o.cz + o.uz * a + vz * b; if (!inPoly(Q, x, z) || taken(x, z) || inBld(x, z, 1.5) || r() > fill) continue;
      slots.push([x, z, Math.atan2(vz, vx) + (b < 0 ? Math.PI : 0) + (r() - 0.5) * 0.08]);
    }
    else for (let a = -o.L / 2 + 3; a <= o.L / 2 - 2.5; a += 5.8) { // narrow strip: parallel parking
      const x = o.cx + o.ux * a, z = o.cz + o.uz * a; if (!inPoly(Q, x, z) || taken(x, z) || r() > 0.7) continue;
      slots.push([x, z, Math.atan2(o.uz, o.ux)]);
    }
  }
  // the kerbed bay in front of No 10 / 6 (grass islands in OSM, no parking tags): perpendicular on the south-west side
  walk(line, 2.6, 0, (x, z, tx, tz) => {
    const nx = tz, nz = -tx, px = x + nx * (hwR + 2.9), pz = z + nz * (hwR + 2.9);
    if (!(px > 845 && px < 875 && pz > 545 && pz < 590) || taken(px, pz) || inBld(px, pz, 2) || r() > 0.8) return;
    slots.push([px, pz, Math.atan2(nz, nx) + (r() < 0.5 ? Math.PI : 0)]);
  });
  // the traffic sim stands its own cars on these spots (city.js), so they get knocked about like the street traffic
  for (const s of slots) clearPts.push([s[0], s[1]]);
  const parked = slots.map(([x, z, ry]) => [x, z, -ry]); // slot yaw: forward (cos, sin); the sim's: (cos, -sin)

  // ---- construction site of ЖК «Надія»: steel sheet fence + a slewing tower crane beside the tower
  let crane = null;
  if (SITE) {
    const Q = SITE.p, F = new MB();
    for (const e of ringEdges(Q)) {
      if (e.L < 0.5) continue;
      const { A, B, L } = e, ya = heightAt(A[0], A[1]), yb = heightAt(B[0], B[1]), rep = L / 8;
      const along = (a) => [A[0] + (B[0] - A[0]) * (a / L), A[1] + (B[1] - A[1]) * (a / L)];
      quadN(F, [[A[0], ya - 0.2, A[1]], [B[0], yb - 0.2, B[1]], [B[0], yb + 2.2, B[1]], [A[0], ya + 2.2, A[1]]], nrm(e), [[0, 0], [rep, 0], [rep, 1], [0, 1]]);
      for (let a = 0; a < L; a += 3) { const [x, z] = along(a), g = heightAt(x, z); mb('steel').box(x - 0.05, g - 0.2, z - 0.05, x + 0.05, g + 2.3, z + 0.05); }
      const yLo = Math.min(ya, yb) - 0.2, yHi = Math.max(ya, yb) + 2.2;
      for (let a = 0; a < L; a += 4) {
        const [x0, z0] = along(a), [x1, z1] = along(Math.min(L, a + 4));
        S.box(Math.min(x0, x1) - 0.08, yLo, Math.min(z0, z1) - 0.08, Math.max(x0, x1) + 0.08, yHi, Math.max(z0, z1) + 0.08, 'pole');
      }
    }
    addMesh(F, M.fence, 'site-fence');
    const tw = byId.get(1303243022)?._zhu;
    if (tw) { // crane base: inside the site, off the tower, ~8 m from its wall, nearest the tower's centre
      const [tx, tz] = centroid(tw.P); let best = null;
      const bb = Q.reduce((a, [x, z]) => [Math.min(a[0], x), Math.min(a[1], z), Math.max(a[2], x), Math.max(a[3], z)], [1e9, 1e9, -1e9, -1e9]);
      for (let x = bb[0]; x < bb[2]; x += 2) for (let z = bb[1]; z < bb[3]; z += 2) {
        if (!inPoly(Q, x, z) || inPoly(tw.P, x, z)) continue; const d = segDist(x, z, [...tw.P, tw.P[0]]); if (d < 6 || d > 12) continue;
        const k = Math.hypot(x - tx, z - tz); if (!best || k < best[2]) best = [x, z, k];
      }
      if (best) crane = towerCrane(group, M, S, best[0], heightAt(best[0], best[1]), best[1], tw.top + 12 - heightAt(best[0], best[1]), Math.atan2(tz - best[1], tx - best[0]));
      if (best) clearPts.push([best[0], best[1]]);
    }
  }

  for (const [k, D] of Object.entries(plain)) addMesh(D, M[k], k, k !== 'cope');
  for (const [c, D] of caps) addMesh(D, capMat(c), 'cap');

  // clear(): keep generated trees off the lamps, rail, cars and crane
  const G = new Map(), gk = (x, z) => Math.floor(x / 4) * 100003 + Math.floor(z / 4);
  for (const [x, z] of clearPts) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) G.set(gk(x + i * 4, z + j * 4), 1);
  // young street trees (the photos: saplings on both kerbs, no mature canopy); generated trees stay off the street
  const spots = [];
  for (const side of [1, -1]) walk(line, 9, 4 + (side > 0 ? 0 : 4.5), (x, z, tx, tz) => {
    const px = x + tz * side * (hwR + 2.3), pz = z - tx * side * (hwR + 2.3);
    if (inBld(px, pz, 2) || clearPts.some(([qx, qz]) => Math.hypot(qx - px, qz - pz) < 3.5) || r() < 0.2) return;
    spots.push({ x: px, z: pz, y: heightAt(px, pz) + 0.15, kind: 'small', sc: 0.45 + r() * 0.2, pal: PARK_GREENS });
  });
  console.log(`[cherkasy] Zhuzhomy: ${nB} buildings, ${slots.length} parked cars, ${nLamp} lamps, ${nChev} chevrons, crane ${crane ? 'yes' : 'no'}, ${(nV / 1000).toFixed(0)}k verts in ${(performance.now() - t0).toFixed(0)} ms`);
  let t = 0;
  return {
    footprints,
    spots,
    parked,
    clear: (x, z) => G.has(gk(x, z)) || segDist(x, z, line) < hwR + 9,
    update(dt) {
      t += dt; const k = nightK.value;
      for (const m of glowMats) m.emissiveIntensity = 1.3 * k;
      M.lamp.color.setScalar(0.9 + 2.2 * k); if (lampMesh) lampMesh.visible = true;
      M.chev.emissiveIntensity = 0.25 * k;
      if (crane) crane.update(t, k);
    },
  };
}

// ------------------------------------------------------------------------------------------------ street helpers
function chain(ways) { // join way polylines end-to-end, start at the end nearest Heroiv Dnipra (the largest z)
  const W = ways.map(w => w.slice()); if (!W.length) return [];
  let L = W.shift();
  for (let guard = 0; W.length && guard < 20; guard++) {
    for (let i = 0; i < W.length; i++) {
      const w = W[i], a = L[0], b = L[L.length - 1], p = w[0], q = w[w.length - 1], near = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]) < 1;
      if (near(b, p)) L = L.concat(w.slice(1)); else if (near(b, q)) L = L.concat(w.slice().reverse().slice(1));
      else if (near(a, q)) L = w.concat(L.slice(1)); else if (near(a, p)) L = w.slice().reverse().concat(L.slice(1)); else continue;
      W.splice(i, 1); break;
    }
  }
  return L[0][1] > L[L.length - 1][1] ? L : L.reverse();
}
function walk(P, step, s0, fn) { // callback every `step` metres: (x, z, tangent x, tangent z, s)
  let done = 0, next = s0;
  P.forEach((B, i) => {
    const A = P[i - 1]; if (!A) return;
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]); if (len < 1e-6) return;
    const ux = (B[0] - A[0]) / len, uz = (B[1] - A[1]) / len;
    for (; next <= done + len; next += step) fn(A[0] + ux * (next - done), A[1] + uz * (next - done), ux, uz, next);
    done += len;
  });
}
function cut(P, len, fromEnd) { // first `len` metres of P (or the last, returned in P's direction)
  const Q = fromEnd ? P.slice().reverse() : P, out = [Q[0]]; let s = 0;
  for (let i = 1; i < Q.length && s < len; i++) { const L = Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1]); if (s + L > len) { const k = (len - s) / L; out.push([Q[i - 1][0] + (Q[i][0] - Q[i - 1][0]) * k, Q[i - 1][1] + (Q[i][1] - Q[i - 1][1]) * k]); s = len; } else { out.push(Q[i]); s += L; } }
  return fromEnd ? out.reverse().slice(0, -1) : out;
}
function resample(P, step) { const out = []; walk(P, step, 0, (x, z) => out.push([x, z])); return out; }

// ------------------------------------------------------------------------------------------------ tower crane
function towerCrane(group, M, S, x, y, z, H, face) {
  const mast = new MB(), a = 1.0; // 2 x 2 m lattice mast
  const C = [[-a, -a], [a, -a], [a, a], [-a, a]];
  for (const [cx, cz] of C) mast.tube([x + cx, y, z + cz], [x + cx, y + H, z + cz], 0.09, 5);
  for (let h = 0; h < H; h += 2.5) C.forEach(([ax, az], k) => { // one diagonal + one horizontal per face and 2.5 m panel
    const [bx, bz] = C[(k + 1) & 3], foot = [x + ax, y + h, z + az];
    mast.tube(foot, [x + bx, y + h + 2.5, z + bz], 0.04, 4).tube(foot, [x + bx, y + h, z + bz], 0.04, 4);
  });
  const mm = new THREE.Mesh(mast.build(), M.crane); mm.castShadow = true; mm.name = 'zhu-crane-mast'; group.add(mm);
  S.box(x - a, y, z - a, x + a, y + H, z + a, 'pole');
  // slewing part in a local frame: +x jib (50 m), -x counter-jib (14 m) with ballast, cab, tower head
  const top = new MB(), cab = new MB(), J = 50, CJ = 14;
  const tri = (x0, x1, w, h) => { // triangular lattice girder along x
    const P = [[0, -w], [0, w], [h, 0]].map(([yy, zz]) => [yy, zz]);
    for (const [yy, zz] of P) top.tube([x0, yy, zz], [x1, yy, zz], 0.07, 4);
    for (let s = x0; s < x1; s += 2) P.forEach((p, k) => { const q = P[k === 2 ? 0 : k + 1]; top.tube([s, p[0], p[1]], [s + 2, q[0], q[1]], 0.03, 3); });
  };
  tri(0, J, 0.7, 1.4);
  tri(-CJ, 0, 0.9, 0.2);
  top.box(-CJ, -0.1, -1.4, -CJ + 3.5, 2.4, 1.4); // ballast blocks
  for (const s of [-1, 1]) { top.tube([0, 0, s * 0.6], [0, 7, 0], 0.1, 5); top.tube([0, 7, 0], [J * 0.62, 1.4, 0], 0.03, 3); top.tube([0, 7, 0], [-CJ + 1, 0.2, s * 0.8], 0.03, 3); }
  top.box(-1.1, -2.4, -1.1, 1.1, 0, 1.1); // slewing ring / turntable
  cab.box(1.1, -2.2, 1.0, 3.1, 0.2, 2.6);
  const head = new THREE.Group(); head.position.set(x, y + H + 2.4, z); head.rotation.y = -face; head.name = 'zhu-crane-top';
  const tm = new THREE.Mesh(top.build(), M.crane); tm.castShadow = true; head.add(tm);
  const cb = new THREE.Mesh(cab.build(), M.dark); head.add(cb);
  // trolley + hook on a rope
  const trolley = new THREE.Group(); trolley.position.set(J * 0.55, 0, 0); head.add(trolley);
  const tb = new MB(); tb.box(-0.8, -0.4, -0.7, 0.8, 0, 0.7); tb.box(-0.02, -18, -0.02, 0.02, -0.4, 0.02); tb.box(-0.35, -19, -0.25, 0.35, -18, 0.25);
  trolley.add(new THREE.Mesh(tb.build(), M.dark));
  // aviation warning lights: jib tip + tower head
  const lb = new MB(); lb.box(J - 0.2, 1.4, -0.2, J + 0.2, 1.8, 0.2); lb.box(-0.2, 7, -0.2, 0.2, 7.4, 0.2); lb.box(-CJ - 0.2, 0.3, -0.2, -CJ + 0.2, 0.7, 0.2);
  const lights = new THREE.Mesh(lb.build(), M.red); head.add(lights);
  group.add(head);
  return {
    update(t, k) {
      head.rotation.y = -face + Math.sin(t * 0.035) * 0.9; // slow slewing back and forth
      trolley.position.x = J * (0.55 + 0.3 * Math.sin(t * 0.05 + 1));
      lights.visible = k > 0.15 ? (t % 1.6) < 0.8 : false;
    },
  };
}
