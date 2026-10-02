// OWNER: cherkasy. The new nine-storey block at вулиця Героїв Дніпра, 34 (Mytnytsia, between the St Andrew church lot
// and the «Чайка» garages; four sections, 128 flats, a commercial ground floor, due 2028), built as rendered in the
// lun.ua new-builds catalogue (renders and the site plan): OSM has nothing on the lot yet. In plan it is a shallow
// bird: a two-section middle along the street with a corner tower at each end, its front stepped and the towers'
// fronts slanted back, and a wing fanning out from each tower toward the Dnipro, joined to it by a full-height
// curtain-glass stair link that bulges out on the outer side. Monolithic frame faced in white render, graphite
// panels on the middle, horizontal timber cladding: window stacks with timber or graphite spandrels, rounded
// panoramic bays in graphite (at the outer corners, on the middle's front, three on each wing's outer side), a
// timber-faced projection on each wing's courtyard side, commercial glazing under a deep timber fascia along the
// street, entrances with dark canopies in the yard, a white stair-and-lift tower over the middle. Windows light up at
// night. No developer name or logo anywhere.
//   HD34_SKIP: the OSM ids replaced here (none: the building is not in OSM yet)
//   HD34_LL: [lat, lon] of the lun.ua pin; the plan below is laid out from it
//   hd34Outline(geo) -> [[x, z], ...]   the whole outline on the map (places.js keeps a copy, tests compare them)
//   buildHd34({ root, map, solids, zips, heightAt, geo? }) -> { update(dt), clear(x, z), footprints } | null
// Laid out in a local plan frame: u east, v north (metres), origin on the symmetry axis at the middle's street face.
// Walls are laid per outline edge in a face frame (slabkit.js): s along the edge, y up, o outward.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { FRAME_OF } from './frame.js';
import { rng, inPoly, convexParts } from './geo.js';
import { canvasTex } from './sculpt.js';
import { ringFaces, face, at, quad, rect, box, skin, solid, finish, speckle } from './slabkit.js';

export const HD34_SKIP = new Set();
export const HD34_LL = [49.437921, 32.085383];
const OFF = [37, 15.2];                         // the plan origin from the pin, metres east / north (site plan overlay)

const GF = 4.2, FH = 3.0, NF = 8, PARA = 1.0;    // commercial ground storey, typical storey, storeys above it, parapet
const WHITE = '#f2f1ec', GRAPH = '#4a4b4f', WOOD = '#a8714a', DARK = '#2a2b2d', COPING = '#d9d8d2';
const TINT = ['#c7d0d4', '#bcc6cb', '#d0d6d8', '#b5c0c6'];

// ---- the plan (local u, v). The middle with its corner towers is one ring; each wing and its glass link hang off a
// tower's back edge, the link axis square to that edge.
const CENTER = [[-15.2, 0], [15.2, 0], [16.8, -3.8], [26.2, 1.0], [26.0, 16.3], [13.1, 24.0], [10.5, 19.7],
  [-10.5, 19.7], [-13.1, 24.0], [-26.0, 16.3], [-26.2, 1.0], [-16.8, -3.8]];
const ROLE = ['front', 'step', 'cfront', 'cside', 'cback', 'notch', 'back', 'notch', 'cback', 'cside', 'cfront', 'step'];
const WA = 31 * Math.PI / 180, LINK = 5, WLEN = 32, LHW = 5, WHW = 6.25;   // wing axis off north, link / wing reach, half-widths
function wingFrame(sg) { // sg = +1 east wing, -1 west wing (mirrored)
  const M = [sg * 19.55, 20.15], a = [sg * Math.sin(WA), Math.cos(WA)], p = [sg * Math.cos(WA), -Math.sin(WA)];
  return (t, q) => [M[0] + a[0] * t + p[0] * q, M[1] + a[1] * t + p[1] * q]; // q > 0: the outer side
}
// the whole outline, local: front, east tower, east link and wing, back, west wing and link, west tower
function localOutline() {
  const E = wingFrame(1), W = wingFrame(-1);
  const east = [[15.2, 0], [16.8, -3.8], [26.2, 1.0], [26.0, 16.3], E(0, LHW), E(LINK, LHW), E(LINK, WHW), E(WLEN, WHW), E(WLEN, -WHW),
    E(LINK, -WHW), E(LINK, -LHW), E(0, -LHW), [13.1, 24.0], [10.5, 19.7]];
  const west = east.slice().reverse().map(([u, v]) => [-u, v]);
  return [...east, ...west];
}

export function hd34Outline(geo) {
  const T = toMap(geo);
  return localOutline().map(([u, v]) => T(u, v));
}
function toMap(geo) {
  const [cx, cz] = geo.toXZ(HD34_LL[0], HD34_LL[1]), [nx, nz] = geo.north, ex = -nz, ez = nx;
  const ox = cx + ex * OFF[0] + nx * OFF[1], oz = cz + ez * OFF[0] + nz * OFF[1];
  const T = (u, v) => [ox + ex * u + nx * v, oz + ez * u + nz * v];
  T.local = (x, z) => { const dx = x - ox, dz = z - oz; return [dx * ex + dz * ez, dx * nx + dz * nz]; };
  return T;
}

// ------------------------------------------------------------------------------------------------ textures
// one window pane, a storey's glass high (v 0 at the sill): graphite frame, a mullion, a transom; mask: glass only
const paneTex = (mask) => canvasTex(128, 256, (g, w, h) => {
  const gl = g.createLinearGradient(0, 0, w * 0.4, h);
  gl.addColorStop(0, mask ? '#fff' : '#e3eaee'); gl.addColorStop(0.45, mask ? '#fff' : '#a9b6bd'); gl.addColorStop(1, mask ? '#fff' : '#6d7a82');
  g.fillStyle = gl; g.fillRect(0, 0, w, h);
  g.fillStyle = mask ? '#000' : '#2e2f31';
  g.fillRect(0, 0, 7, h); g.fillRect(w - 7, 0, 7, h); g.fillRect(0, 0, w, 7); g.fillRect(0, h - 7, w, 7);
  g.fillRect(w / 2 - 3, 0, 6, h); g.fillRect(0, Math.round(h * 0.22), w, 5);
});
// horizontal timber boards, 2 m x 2 m per repeat; the hue comes from the vertex colour
const woodTex = (r) => canvasTex(256, 256, (g, w, h) => {
  const n = 14, bh = h / n;
  for (let i = 0; i < n; i++) {
    const k = 0.86 + r() * 0.22;
    g.fillStyle = `rgb(${[255, 236, 214].map((c) => Math.min(255, Math.round(c * k))).join(',')})`; g.fillRect(0, i * bh, w, bh);
    for (let j = 0; j < 7; j++) { g.fillStyle = `rgba(90,50,20,${0.05 + r() * 0.08})`; g.fillRect(0, i * bh + r() * bh, w, 1 + r()); }
    g.fillStyle = 'rgba(40,20,5,0.45)'; g.fillRect(0, (i + 1) * bh - 2, w, 2);
  }
});
// graphite composite panels: 1.2 m x 1.5 m with thin dark joints (2.4 x 3 m per repeat)
const panelTex = (r) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.05})`; g.fillRect(i * w / 2, j * h / 2, w / 2, h / 2); }
  g.fillStyle = 'rgba(0,0,0,0.5)';
  for (const x of [0, w / 2]) g.fillRect(x, 0, 2, h);
  for (const y of [0, h / 2]) g.fillRect(0, y, w, 2);
});

// ------------------------------------------------------------------------------------------------ the build
export function buildHd34({ root, map, solids: S, zips: Z, heightAt, geo }) {
  geo = geo || (map?.frame ? FRAME_OF(map) : null);
  if (!geo) return null;
  const t0 = performance.now(), r = rng(3434), n0 = S.count, T = toMap(geo);
  const P = (q) => T(q[0], q[1]);
  const outline = localOutline(), mapOutline = outline.map(P);
  const hs = mapOutline.map(([x, z]) => heightAt(x, z)), gLo = Math.min(...hs), gHi = Math.max(...hs);
  const yF = gHi + 0.3, Y = (h) => yF + h, gB = gLo - 0.6;
  const fy = (k) => Y(GF + (k - 1) * FH);                    // floor level of storey k (1..NF)
  const ROOF = Y(GF + NF * FH), TOP = ROOF + PARA;
  const B = { wall: new MB(), dark: new MB(), wood: new MB(), det: new MB(), glass: new MB(), lit: new MB() };
  const UVW = [2.5, 2.5], UVD = [2.4, 3.0], UVT = [2.0, 2.0];
  const skinOf = { white: ['wall', WHITE, UVW], graph: ['dark', GRAPH, UVD], wood: ['wood', WOOD, UVT] };
  let nWin = 0, nBay = 0;
  const G = () => (r() < 0.33 ? B.lit : B.glass), tint = () => TINT[(r() * TINT.length) | 0];

  // a stack of windows over its spandrels, cut through the wall for all NF storeys. kind: 'white' (punched windows),
  // 'wood' / 'dark' (inset spandrel panels), 'pano' (floor-to-ceiling glazing over a timber balustrade band)
  function stack(f, s0, s1, kind, wallCol) {
    const pano = kind === 'pano', wb = pano ? 1.0 : 0.85, wt = pano ? 2.8 : 2.6, dep = 0.22;
    const y0 = fy(1) + wb, y1 = fy(NF) + wt;
    f.cuts.push({ s0, s1, y0, y1 });
    B.det.setColor(wallCol === GRAPH ? '#4a4b4e' : '#e6e4dd');
    quad(B.det, at(f, s0, y0), at(f, s0, y0, -dep), at(f, s0, y1, -dep), at(f, s0, y1), f.U);
    quad(B.det, at(f, s1, y0), at(f, s1, y0, -dep), at(f, s1, y1, -dep), at(f, s1, y1), f.U.map((v) => -v));
    const panes = Math.max(1, Math.round((s1 - s0) / 1.3));
    for (let k = 1; k <= NF; k++) {
      const a = fy(k) + wb, b = fy(k) + wt, g = G();
      g.setColor(tint());
      quad(g, at(f, s0, a, -dep + 0.04), at(f, s1, a, -dep + 0.04), at(f, s1, b, -dep + 0.04), at(f, s0, b, -dep + 0.04), f.N, [[0, 0], [panes, 0], [panes, 1], [0, 1]]);
      B.det.setColor(wallCol === GRAPH ? '#4a4b4e' : '#e6e4dd');
      quad(B.det, at(f, s0, b), at(f, s1, b), at(f, s1, b, -dep), at(f, s0, b, -dep), [0, -1, 0]);
      quad(B.det, at(f, s0, a), at(f, s1, a), at(f, s1, a, -dep), at(f, s0, a, -dep), [0, 1, 0]);
      if (k < NF) { // the spandrel up to the next window
        const c = fy(k + 1) + wb;
        if (kind === 'white') { B.wall.setColor(WHITE); rect(B.wall, f, s0, s1, b, c, 0, UVW); }
        else if (kind === 'dark') { B.dark.setColor(GRAPH); rect(B.dark, f, s0, s1, b, c, -0.06, UVD); }
        else { B.wood.setColor(WOOD); rect(B.wood, f, s0, s1, b, c, -0.06, UVT); }
      }
      if (pano) { B.det.setColor('#2e2f31'); box(B.det, f, s0, s1, a + 0.95, a + 1.0, -dep + 0.05, -dep + 0.12, 'ft'); } // the rail
      nWin++;
    }
  }

  // a rounded panoramic bay: a cubic from A to C (map points) bulging out, storeys NF high from the first floor up,
  // a graphite slab band per storey under the glazing, a curved parapet over the roof
  function bay(A, P1, P2, C, { y0 = fy(1), top = TOP + 0.3, band = 0.6, glassFrom = 1 } = {}) {
    const N = 8, pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3;
      pts.push([a * A[0] + b * P1[0] + c * P2[0] + d * C[0], a * A[1] + b * P1[1] + c * P2[1] + d * C[1]]);
    }
    const len = [0]; for (let i = 1; i <= N; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    // outward normal of each segment: away from the chord's far side
    const mx = (A[0] + C[0]) / 2, mz = (A[1] + C[1]) / 2;
    const seg = (i, ya, yb, D, col, uv) => {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0) || 1;
      let nx = (z1 - z0) / L, nz = -(x1 - x0) / L;
      if (nx * ((x0 + x1) / 2 - mx) + nz * ((z0 + z1) / 2 - mz) < 0) { nx = -nx; nz = -nz; }
      D.setColor(col);
      quad(D, [x0, ya, z0], [x1, ya, z1], [x1, yb, z1], [x0, yb, z0], [nx, 0, nz], uv && uv(i));
    };
    const panes = (i) => [[len[i] / 1.8, 0], [len[i + 1] / 1.8, 0], [len[i + 1] / 1.8, 1], [len[i] / 1.8, 1]];
    for (let k = glassFrom; k <= NF; k++) {
      const base = k ? fy(k) : Y(0), yb = k === glassFrom ? y0 : base, next = k < NF ? fy(k + 1) : ROOF, g = G(), c = tint();
      for (let i = 0; i < N; i++) {
        seg(i, yb, base + band, B.dark, GRAPH, (j) => [[len[j] / 2.4, yb / 3], [len[j + 1] / 2.4, yb / 3], [len[j + 1] / 2.4, (base + band) / 3], [len[j] / 2.4, (base + band) / 3]]);
        seg(i, base + band, next, g, c, panes);
      }
    }
    for (let i = 0; i < N; i++) seg(i, ROOF, top, B.dark, GRAPH, null);
    const poly = pts.map(([x, z]) => [x, z]);
    B.dark.setColor(GRAPH); B.dark.fill(poly, [], top, true); B.dark.fill(poly, [], y0, false);
    S.prism(poly.flat(), y0, top, 0, 0, 'wall');
    nBay++;
    return poly;
  }
  const bayOn = (f, s0, s1, d) => bay([...xz(at(f, s0, 0))], [...xz(at(f, s0 + 0.15, 0, d * 1.33))], [...xz(at(f, s1 - 0.15, 0, d * 1.33))], [...xz(at(f, s1, 0))]);
  const xz = (p) => [p[0], p[2]];

  // ground storey: commercial glazing between slim piers, or windows under the stacks, or a door under a canopy
  function shopfront(f, s0, s1) {
    const n = Math.max(1, Math.round((s1 - s0) / 3.2)), w = (s1 - s0) / n;
    for (let i = 0; i < n; i++) {
      const a = s0 + i * w + 0.2, b = s0 + (i + 1) * w - 0.2, y0 = Y(0.15), y1 = Y(GF - 0.55);
      f.cuts.push({ s0: a, s1: b, y0, y1 });
      B.det.setColor('#2e2f31'); box(B.det, f, a, b, y0, y1, -0.3, 0, 'lrtu');
      B.lit.setColor('#9aa4a8');
      quad(B.lit, at(f, a, y0, -0.2), at(f, b, y0, -0.2), at(f, b, y1, -0.2), at(f, a, y1, -0.2), f.N, [[0, 0], [Math.max(1, Math.round((b - a) / 1.5)), 0], [Math.max(1, Math.round((b - a) / 1.5)), 1], [0, 1]]);
    }
  }
  function groundWin(f, s0, s1) {
    const y0 = Y(0.9), y1 = Y(GF - 0.8);
    f.cuts.push({ s0, s1, y0, y1 });
    B.det.setColor('#e6e4dd'); box(B.det, f, s0, s1, y0, y1, -0.22, 0, 'lrtu');
    const g = G(); g.setColor(tint());
    quad(g, at(f, s0, y0, -0.18), at(f, s1, y0, -0.18), at(f, s1, y1, -0.18), at(f, s0, y1, -0.18), f.N, [[0, 0], [Math.max(1, Math.round((s1 - s0) / 1.3)), 0], [Math.max(1, Math.round((s1 - s0) / 1.3)), 1], [0, 1]]);
  }
  function entry(f, s0, s1) {
    const y0 = Y(0), y1 = Y(2.7), m = (s0 + s1) / 2;
    f.cuts.push({ s0, s1, y0, y1 });
    B.det.setColor('#2e2f31'); box(B.det, f, s0, s1, y0, y1, -0.3, 0, 'lrt');
    B.lit.setColor('#8d979b'); quad(B.lit, at(f, s0, y0, -0.25), at(f, s1, y0, -0.25), at(f, s1, y1, -0.25), at(f, s0, y1, -0.25), f.N, [[0, 0], [2, 0], [2, 1], [0, 1]]);
    B.dark.setColor(DARK); box(B.dark, f, m - 2.2, m + 2.2, Y(3.0), Y(3.35), 0, 1.8, 'ftlru', UVD); // the canopy
    solid(S, f, m - 2.2, m + 2.2, 0, 1.8, Y(3.0), Y(3.35), 'awning', 1);
    B.det.setColor('#b9b6ae'); box(B.det, f, m - 2.2, m + 2.2, gB, Y(0), 0, 2.0, 'ftlr'); // the step
  }

  // the wall of a face: skin round the cuts, a plinth, the parapet with its coping, the roof edge for the zip lines
  function finishFace(f, mat, { from = gB, to = TOP, parapet = true } = {}) {
    const [k, col, uv] = skinOf[mat];
    skin(B[k], f, from, to, col, uv);
    if (parapet) {
      B[k].setColor(col); rect(B[k], f, 0, f.L, ROOF, to, -0.3, uv, f.N.map((v) => -v));
      B.det.setColor(COPING); box(B.det, f, -0.02, f.L + 0.02, to, to + 0.08, -0.32, 0.04, 'ftlr');
    }
    B.det.setColor('#8c8a85'); box(B.det, f, 0, f.L, gB, Y(0.15), 0, 0.05, 'ft'); // plinth
    if (f.L > 3 && Z) { const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], to, f.nx, f.nz); }
  }

  // ---- the middle and its corner towers
  const cRing = CENTER.map(P), cFaces = ringFaces(cRing);
  cFaces.forEach((f, i) => {
    const role = ROLE[i], L = f.L, la = T.local(f.ax, f.az), lb = T.local(f.ax + f.ux * L, f.az + f.uz * L);
    const flip = (yes) => (a, b) => (yes ? [L - b, L - a] : [a, b]);
    const S0 = flip(Math.abs(la[0]) > Math.abs(lb[0])), SF = flip(la[1] > lb[1]); // spans from the axis end / the front end
    if (role === 'front') {
      for (const [a, b] of [[0.4, 4.4], [10.6, 14.6], [15.8, 19.8], [26.0, 30.0]]) bayOn(f, a, b, 1.1);
      for (const [a, b] of [[6.3, 7.9], [22.5, 24.1]]) stack(f, a, b, 'wood', GRAPH);
      B.wood.setColor(WOOD); box(B.wood, f, 15.0, 15.4, Y(GF), TOP + 0.4, 0, 0.6, 'flrt', UVT); // the timber fin
      shopfront(f, 0.2, L - 0.2);
      B.wood.setColor(WOOD); box(B.wood, f, -1.0, L + 1.0, Y(GF - 0.8), Y(GF + 1.0), 0, 2.2, 'ftlru', UVT); // the fascia
      solid(S, f, -1.0, L + 1.0, 0, 2.2, Y(GF - 0.8), Y(GF + 1.0), 'awning', 1);
      for (let k = 0; k < 3; k++) { // the broad entrance steps in the middle
        B.det.setColor('#c9c6be'); box(B.det, f, L / 2 - 5 - k * 0.4, L / 2 + 5 + k * 0.4, gB, Y(-k * 0.15), 0, 1.2 + k * 0.45, 'ftlr');
      }
      solid(S, f, L / 2 - 5.8, L / 2 + 5.8, 0, 2.1, gB, Y(-0.3), 'wall');
      finishFace(f, 'graph');
    } else if (role === 'step') {
      stack(f, ...S0(1.2, 2.9), 'white', WHITE);
      shopfront(f, 0.3, L - 0.3);
      B.wood.setColor(WOOD); box(B.wood, f, -0.6, L + 0.6, Y(GF - 0.8), Y(GF + 1.0), 0, 2.2, 'ftlru', UVT);
      finishFace(f, 'white');
    } else if (role === 'cfront') {
      stack(f, ...S0(1.4, 3.0), 'wood', WHITE); stack(f, ...S0(4.6, 5.9), 'wood', WHITE);
      shopfront(f, ...S0(0.4, 7.2));
      finishFace(f, 'white');
    } else if (role === 'cside') {
      [[4.5, 6.0], [7.5, 9.0], [10.5, 12.0]].forEach(([a, b], j) => { stack(f, ...SF(a, b), j === 1 ? 'wood' : 'white', WHITE); groundWin(f, ...SF(a, b)); });
      finishFace(f, 'white');
    } else if (role === 'cback') {
      for (const [a, b] of [[0.5, 1.7], [L - 1.7, L - 0.5]]) stack(f, a, b, 'white', WHITE);
      finishFace(f, 'white');
    } else if (role === 'notch') {
      stack(f, 1.7, 3.2, 'white', WHITE); entry(f, 1.4, 3.4);
      finishFace(f, 'white');
    } else if (role === 'back') {
      B.wood.setColor(WOOD); box(B.wood, f, 8.4, 12.6, Y(GF), ROOF + 3.8, 0, 0.35, 'flrt', UVT); // the timber strip up the tower
      for (const [a, b, k] of [[1.0, 4.0, 'pano'], [5.0, 7.4, 'dark'], [13.6, 16.0, 'dark'], [17.0, 20.0, 'pano']]) stack(f, a, b, k, GRAPH);
      const strip = face(xz(at(f, 8.4, 0, 0.35)), xz(at(f, 12.6, 0, 0.35)), f.nx, f.nz);
      for (const [a, b] of [[0.5, 1.9], [2.3, 3.7]]) stack(strip, a, b, 'dark', WOOD);
      for (const [a, b] of [[1.5, 3.5], [16.5, 19.5]]) groundWin(f, a, b);
      entry(f, 9.4, 11.6);
      finishFace(f, 'graph');
    }
  });
  // the outer corners: a rounded bay wraps each tower's front-to-side corner
  for (const [i, j] of [[2, 3], [10, 9]]) {
    const fa = cFaces[i], fb = cFaces[j], V = i === 2 ? P(CENTER[3]) : P(CENTER[10]);
    const A = i === 2 ? xz(at(fa, fa.L - 3.0, 0)) : xz(at(fa, 3.0, 0)), C = i === 2 ? xz(at(fb, 3.0, 0)) : xz(at(fb, fb.L - 3.0, 0));
    const nb = [fa.nx + fb.nx, fa.nz + fb.nz], nl = Math.hypot(...nb), k = 1.0;
    const P1 = [A[0] + (V[0] - A[0]) * 0.6 + nb[0] / nl * k, A[1] + (V[1] - A[1]) * 0.6 + nb[1] / nl * k];
    const P2 = [C[0] + (V[0] - C[0]) * 0.6 + nb[0] / nl * k, C[1] + (V[1] - C[1]) * 0.6 + nb[1] / nl * k];
    bay(A, P1, P2, C);
  }
  B.dark.setColor('#5e5f61'); B.dark.fill(cRing, [], ROOF + 0.02, true);
  for (const R of convexParts(cRing)) S.prism(R.flat(), gB, TOP, 0, 0, 'wall');

  // the stair-and-lift tower over the middle: white, a dark window band, a dark cap
  {
    const tw = [[-6, 3], [6, 3], [6, 19.7], [-6, 19.7]].map(P), tf = ringFaces(tw), y1 = ROOF + 3.6;
    for (const f of tf) {
      B.wall.setColor(WHITE); rect(B.wall, f, 0, f.L, ROOF, y1, 0, UVW);
      B.dark.setColor(DARK); box(B.dark, f, -0.05, f.L + 0.05, y1 - 0.7, y1, 0, 0.12, 'ftlr', UVD);
      if (f.L > 10) { const g = B.glass; g.setColor(tint()); quad(g, at(f, 1.5, ROOF + 1.2, 0.02), at(f, f.L - 1.5, ROOF + 1.2, 0.02), at(f, f.L - 1.5, ROOF + 2.5, 0.02), at(f, 1.5, ROOF + 2.5, 0.02), f.N, [[0, 0], [Math.round((f.L - 3) / 1.3), 0], [Math.round((f.L - 3) / 1.3), 1], [0, 1]]); }
    }
    B.dark.setColor(DARK); B.dark.fill(tw, [], y1, true);
    S.prism(tw.flat(), ROOF, y1, 0, 0, 'equipment');
  }

  // ---- the wings and their glass links
  const wingRings = [];
  for (const sg of [1, -1]) {
    const Wf = wingFrame(sg), R = (pts) => pts.map(([t, q]) => P(Wf(t, q)));
    // the wing: its ring runs base (t = LINK) -> outer side -> far end -> inner side
    const wr = R([[LINK, -WHW], [LINK, WHW], [WLEN, WHW], [WLEN, -WHW]]), wf = ringFaces(wr);
    wingRings.push(wr);
    const byOut = (f) => { const c = T.local(f.ax + f.ux * f.L / 2, f.az + f.uz * f.L / 2), m = Wf((LINK + WLEN) / 2, 0); return [c[0] - m[0], c[1] - m[1]]; };
    const ax = [sg * Math.sin(WA), Math.cos(WA)], px = [sg * Math.cos(WA), -Math.sin(WA)];
    for (const f of wf) {
      const d = byOut(f), along = d[0] * ax[0] + d[1] * ax[1], across = d[0] * px[0] + d[1] * px[1];
      const a0 = T.local(f.ax, f.az), o0 = Wf(0, 0), fromBase = (a0[0] - o0[0]) * ax[0] + (a0[1] - o0[1]) * ax[1] < (LINK + WLEN) / 2;
      const SP = (a, b) => (fromBase ? [a, b] : [f.L - b, f.L - a]); // spans from the link end
      if (across > 3) { // the outer side: three rounded bays with white stacks between
        for (const [a, b] of [[2.0, 6.4], [11.3, 15.7], [20.6, 25.0]]) bayOn(f, ...SP(a, b), 1.2);
        for (const [a, b] of [[8.1, 9.6], [17.4, 18.9]]) { stack(f, ...SP(a, b), 'white', WHITE); groundWin(f, ...SP(a, b)); }
        for (const [a, b] of [[2.6, 5.8], [11.9, 15.1], [21.2, 24.4]]) groundWin(f, ...SP(a, b));
        finishFace(f, 'white');
      } else if (across < -3) { // the courtyard side: a timber projection with two dark stacks, loggias, an entrance
        const [pa, pb] = SP(9.5, 15.5), pr = face(xz(at(f, pa, 0, 0.6)), xz(at(f, pb, 0, 0.6)), f.nx, f.nz);
        B.wood.setColor(WOOD); box(B.wood, f, pa, pb, Y(GF), TOP + 0.2, 0, 0.6, 'lrtu', UVT);
        for (const [a, b] of [[0.5, 2.3], [3.7, 5.5]]) stack(pr, a, b, 'dark', WOOD);
        skin(B.wood, pr, Y(GF), TOP + 0.2, WOOD, UVT);
        solid(S, f, pa, pb, 0, 0.6, Y(GF), TOP, 'wall');
        for (const [a, b, k] of [[2.0, 3.4, 'white'], [5.5, 7.5, 'pano'], [17.5, 19.5, 'pano'], [22.0, 23.4, 'white']]) stack(f, ...SP(a, b), k, WHITE);
        for (const [a, b] of [[2.0, 3.4], [5.5, 7.5], [17.5, 19.5], [22.0, 23.4]]) groundWin(f, ...SP(a, b));
        entry(f, ...SP(11.4, 13.6));
        finishFace(f, 'white');
      } else if (along > 3) { // the far end
        for (const [a, b] of [[1.6, 3.1], [5.5, 7.0], [9.4, 10.9]]) { stack(f, a, b, 'white', WHITE); groundWin(f, a, b); }
        finishFace(f, 'white');
        // stepped terraces at its foot, as rendered
        for (let k = 0; k < 3; k++) { B.wall.setColor('#e9e8e3'); box(B.wall, f, 0.8 + k * 0.6, f.L - 0.8 - k * 0.6, gB, Y(0.35 + k * 0.35) - 0.35 * 0, 0, 3.0 - k * 0.9, 'ftlr', UVW); }
        solid(S, f, 0.8, f.L - 0.8, 0, 3.0, gB, Y(0.35), 'wall');
      } else finishFace(f, 'white'); // the base, behind the link
    }
    B.dark.setColor('#5e5f61'); B.dark.fill(wr, [], ROOF + 0.02, true);
    S.prism(wr.flat(), gB, TOP, 0, 0, 'wall');
    // lift head on the wing roof
    { const lr = R([[WLEN - 9, -1.8], [WLEN - 9, 1.8], [WLEN - 5, 1.8], [WLEN - 5, -1.8]]), lf = ringFaces(lr);
      for (const f of lf) { B.wall.setColor(WHITE); rect(B.wall, f, 0, f.L, ROOF, ROOF + 2.6, 0, UVW); B.det.setColor(COPING); box(B.det, f, 0, f.L, ROOF + 2.6, ROOF + 2.7, -0.1, 0.05, 'ft'); }
      B.wall.setColor('#cfcfcb'); B.wall.fill(lr, [], ROOF + 2.7, true);
      S.prism(lr.flat(), ROOF, ROOF + 2.7, 0, 0, 'equipment'); }

    // the link: curtain glass full height on both sides, rising over the roof; the outer side bulges out round
    const lr = R([[0, -LHW], [0, LHW], [LINK, LHW], [LINK, -LHW]]), lTop = TOP + 2.0;
    wingRings.push(lr);
    const lf = ringFaces(lr);
    for (const f of lf) {
      const d = byOut(f), across = d[0] * px[0] + d[1] * px[1];
      if (Math.abs(across) < 3) continue; // the faces against the tower and the wing
      if (across > 0) { // a round glass drum on the outer face
        const A = xz(at(f, 0.2, 0)), C = xz(at(f, f.L - 0.2, 0));
        bay(A, xz(at(f, 0.2, 0, 3.2)), xz(at(f, f.L - 0.2, 0, 3.2)), C, { y0: Y(0), top: lTop, band: 0.25, glassFrom: 0 });
      }
      B.dark.setColor(GRAPH); rect(B.dark, f, 0, f.L, gB, Y(0), 0, UVD);
      const g = B.glass; g.setColor('#a9b8c0');
      for (let k = 0; k <= NF; k++) {
        const a = k ? fy(k) : Y(0), b = k < NF ? (k ? fy(k + 1) : fy(1)) : TOP, gg = r() < 0.5 ? B.lit : g;
        gg.setColor('#a9b8c0'); quad(gg, at(f, 0, a), at(f, f.L, a), at(f, f.L, b), at(f, 0, b), f.N, [[0, 0], [Math.round(f.L / 1.25), 0], [Math.round(f.L / 1.25), 1], [0, 1]]);
        B.dark.setColor(DARK); box(B.dark, f, 0, f.L, a - 0.12, a + 0.12, 0, 0.06, 'ft', UVD);
      }
      B.dark.setColor(DARK); rect(B.dark, f, 0, f.L, TOP, lTop, 0, UVD);
      if (Z) { const a = at(f, 0, 0), b = at(f, f.L, 0); Z.edge(a[0], a[2], b[0], b[2], lTop, f.nx, f.nz); }
    }
    for (const f of lf) { B.dark.setColor(DARK); box(B.dark, f, 0, f.L, lTop, lTop + 0.1, -0.1, 0.05, 'ft', UVD); }
    B.dark.setColor('#4d4e50'); B.dark.fill(lr, [], lTop, true);
    S.prism(lr.flat(), gB, lTop, 0, 0, 'wall');
  }

  const pane = paneTex(false), mask = paneTex(true), warm = new THREE.Color('#ffd7a0');
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: speckle(r), vertexColors: true, roughness: 0.88 }),
    dark: new THREE.MeshStandardMaterial({ map: panelTex(r), vertexColors: true, roughness: 0.55, metalness: 0.15 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTex(r), vertexColors: true, roughness: 0.75 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ map: pane, vertexColors: true, roughness: 0.1, metalness: 0.4, envMapIntensity: 1.2 }),
    lit: new THREE.MeshStandardMaterial({ map: pane, vertexColors: true, roughness: 0.12, metalness: 0.3, emissive: warm, emissiveMap: mask, emissiveIntensity: 0 }),
  };
  const out = finish(root, 'hd34', B, M, { shade: ['wall', 'dark', 'wood'] });
  console.log(`[cherkasy] Heroiv Dnipra 34: ${nWin} windows, ${nBay} bays, floor ${yF.toFixed(1)} m, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  // generated trees keep off the building, its bays, the canopies and the terraces (4 m round the outline) and off the
  // forecourt to the street (paved and parked in the renders)
  const near = (u, v, R, m) => inPoly(R, u, v) || R.some((p, i) => { const q = R[(i + 1) % R.length], ex = q[0] - p[0], ez = q[1] - p[1], L2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((u - p[0]) * ex + (v - p[1]) * ez) / L2)); return Math.hypot(p[0] + ex * t - u, p[1] + ez * t - v) < m; });
  return {
    footprints: [{ poly: cRing, h: TOP - gLo, kind: 'apt', name: 'Героїв Дніпра, 34' }, ...wingRings.map((poly) => ({ poly, h: TOP - gLo, kind: 'apt', name: 'Героїв Дніпра, 34' }))],
    clear: (x, z) => { const [u, v] = T.local(x, z); return near(u, v, outline, 4) || (Math.abs(u) < 30 && v > -13 && v < 2); },
    update() { M.lit.emissiveIntensity = 0.9 * nightK.value; },
  };
}
