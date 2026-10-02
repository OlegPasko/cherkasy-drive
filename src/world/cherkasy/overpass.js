// OWNER: cherkasy. The Dakhnivska overpass (шляхопровід на Дахнівській, issues #21 and #22): east of the city, by the
// Sosnivka park, vul. Dakhnivska (Р-10, the end of bul. Shevchenka) crosses vul. Sumhaitska (Н-16, the road down to
// the dam) and the single-track line to the dam on a concrete beam bridge. OSM: the deck is way 72051305 (bridge=yes,
// bridge:structure=beam, layer 1) with the outline 927634209 and footway bridges on both sides; the railway 160513339
// is layer -1, cutting=yes; Sumhaitska has no bridge tag and runs under it. Next to it, ~24 m south-west, a steel
// pipeline bridge with a walkway (154579542 + 875432987) crosses the same cutting. The DEM (~30 m SRTM, 16 m lattice
// here) sees all of it as one flat hilltop, so before this module the two roads met at grade with a level crossing.
// Built after the players' photos and Google Street View (2019): the lower road and the track sit in a cutting with
// tall grassy slopes and pines on top, guard rails along the road; the overpass is a grey precast beam deck on rows
// of square columns under a cap beam, with blue steel railings and lamp posts; the pipe bridge is a light steel truss.
// TERRAIN
//   shapeOverpass(hf, map, geo) -> { carved, deck: [t0, t1], foot: [t0, t1] } | null   call before the ground and the
//     buildings are built. Lowers Sumhaitska and the track along their own grades (ROAD_PROF / RAIL_PROF: arc metres
//     from where the bridge crosses them -> level over the river plane), each with a flat floor wide enough that the
//     16 m height lattice keeps the carriageway and the bed level (CUT), walls at CUT.wall up to the terrain; inside the
//     road floor the road grade wins over the track's. Dakhnivska is raised a little on both approaches (RAISE). The
//     deck and the footbridge then span every lattice cell the carve touched: their ends (metres along their axes from
//     the south-east OSM end) are kept for the build in this module (SHAPED).
// SITE
//   buildOverpass({ root, solids, heightAt, geo, ground, detailMat }) -> { update(), clear(x, z), deckAt(x, z) } | null
//     The deck is a plane between the terrain heights at its ends: carriageway and raised walks in the ground material
//     (so it joins the road seamlessly), lane paint, fascia beams, girders, cap beams on columns, blue railings, lamps.
//     Collision: the deck and its walks as OVERHANG prisms (the car drives on them with a height hint and under them
//     without), parapets, cap beams and columns; the footbridge walk, rails, pipe and frames; guard rails along the
//     road in the cutting. Under the deck the ground strip OSM draws for Dakhnivska (asphalt, walks, kerbs) turns to
//     lawn and its lane paint is dropped; land / forest-floor triangles on the carved walls turn to lawn too.
//     deckAt(x, z) -> deck top y | null   for the lane network (npc/lanes.js opts.deckAt): bridge lanes ride the deck.
//     clear(x, z): no generated trees on or under the deck and the footbridge.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { DP } from '../materials.js';
import { OVERHANG } from '../collision.js';
import { canvasTex } from './sculpt.js';
import { SURF, GY } from './ground.js';

const AXIS = [[49.4660577, 32.0223845], [49.4666672, 32.0216036]]; // way 72051305: south-east end, north-west end
const FOOT = [[49.4659334, 32.0220832], [49.466459, 32.0214638]];  // way 875432987, the walk on the pipeline bridge
// vul. Sumhaitska centre line, south-west to north-east (ways 42929464 reversed + 42129731)
const ROAD = [[49.4605868, 32.0203729], [49.4616594, 32.0204322], [49.4626283, 32.0204604], [49.463309, 32.0205802], [49.4640506, 32.0207874],
  [49.4646377, 32.0209921], [49.465034, 32.0211579], [49.4654332, 32.0214089], [49.4655707, 32.0215202], [49.4661174, 32.0219967],
  [49.4664309, 32.0223436], [49.4666611, 32.0226107], [49.4671065, 32.0231061], [49.4675079, 32.0235771], [49.4678851, 32.0240369],
  [49.4684678, 32.0247784], [49.4693619, 32.0260019]];
// the line to the dam (way 160513339), south-west to north-east
const RAIL = [[49.4586, 32.0199474], [49.4599056, 32.0199481], [49.4610797, 32.0199807], [49.4623954, 32.0200047], [49.4626859, 32.0200205],
  [49.4629814, 32.0200575], [49.4634288, 32.0201442], [49.4638502, 32.0202666], [49.4642591, 32.0204176], [49.4649603, 32.0207688],
  [49.4654516, 32.021084], [49.465839, 32.0213758], [49.4665372, 32.0220144], [49.4669203, 32.0224532], [49.4672999, 32.0229216],
  [49.4679827, 32.0238656], [49.4687011, 32.0248437], [49.4694278, 32.0258506]];
// grades: [arc m from the crossing under the deck, level m]. The road leaves the loop ramp's junction (88 m back) at
// grade and falls ~4 % into the cutting, then ~1.3 % toward the dam; the track falls ~1.7 % through it. Beyond the
// ends the level keeps rising (back) / falling (ahead), so the natural ground takes over.
const ROAD_PROF = [[-88, 30.0], [0, 26.5], [171, 24.6], [281, 23.6]];
const RAIL_PROF = [[-298, 31.0], [0, 26.0], [294, 22.3]];
const CUT = { road: 19, rail: 14, wall: 0.62 };   // flat floor half widths (m) and the wall gradient (~1:1.6)
const RAISE = { se: 0.4, nw: 1.1 };                // Dakhnivska lifted at the south-east / north-west deck ends (m)
const ROAD_HW = 7.3, WALK = 4.5;                   // Sumhaitska: half carriageway (map.json w 14.6) and its walk band
const DK = { hw: 7, walk: 9.1, edge: 9.6, slab: 0.4, depth: 1.15, kerb: 0.18, par: 0.35, rail: 1.1, lift: 0.03 };
const FB = { hw: 0.8, rail: 1.1, pipe: 0.4, hump: 0.5 };
const C = { conc: '#a9a7a0', concDark: '#8f8d87', blue: '#3f74ae', steel: '#6c7176', grate: '#55595d', pipe: '#9aa1a3', galv: '#b9bdbf' };
const ease = (a, b, v) => (v <= a ? 0 : v >= b ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * (v - a) / (b - a)));
const fin = (h, d = 30) => (Number.isFinite(h) ? h : d);

// nearest point of a polyline: { d, s } distance and arc length from its first point
function along(L, x, z) {
  let best = { d: Infinity, s: 0 }, run = 0;
  for (let k = 1; k < L.length; k++) {
    const [ax, az] = L[k - 1], ex = L[k][0] - ax, ez = L[k][1] - az, len = Math.hypot(ex, ez);
    const f = len > 0 ? Math.min(len, Math.max(0, ((x - ax) * ex + (z - az) * ez) / len)) : 0;
    const d = Math.hypot(x - ax - ex * f / (len || 1), z - az - ez * f / (len || 1));
    if (d < best.d) best = { d, s: run + f };
    run += len;
  }
  return best;
}
// where segment p-q crosses polyline L: { s along L, f along p-q (0..1) } | null
function crossing(L, p, q) {
  let run = 0;
  for (let k = 1; k < L.length; k++) {
    const a = L[k - 1], b = L[k], ex = b[0] - a[0], ez = b[1] - a[1], fx = q[0] - p[0], fz = q[1] - p[1];
    const den = ex * fz - ez * fx, len = Math.hypot(ex, ez);
    if (Math.abs(den) > 1e-9) {
      const t = ((p[0] - a[0]) * fz - (p[1] - a[1]) * fx) / den, u = ((p[0] - a[0]) * ez - (p[1] - a[1]) * ex) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { s: run + t * len, f: u };
    }
    run += len;
  }
  return null;
}
// a straight frame from P to Q: t along it (m from P), o to its left-hand side (+n)
function frame(P, Q) {
  const L = Math.hypot(Q[0] - P[0], Q[1] - P[1]), ux = (Q[0] - P[0]) / L, uz = (Q[1] - P[1]) / L, nx = -uz, nz = ux;
  return { P, L, ux, uz, nx, nz, ang: Math.atan2(uz, ux),
    at: (t, o) => [P[0] + ux * t + nx * o, P[1] + uz * t + nz * o],
    to: (x, z) => [(x - P[0]) * ux + (z - P[1]) * uz, (x - P[0]) * nx + (z - P[1]) * nz] };
}
function siteOf(geo) {
  const xz = ([la, lo]) => geo.toXZ(la, lo);
  const D = frame(...AXIS.map(xz)), F = frame(...FOOT.map(xz)), road = ROAD.map(xz), rail = RAIL.map(xz);
  const q = (L, Fr) => crossing(L, Fr.P, Fr.at(Fr.L, 0));
  const dr = q(road, D), dl = q(rail, D), fr = q(road, F), fl = q(rail, F);
  if (!dr || !dl || !fr || !fl) return null;
  return { D, F, road, rail, sr: dr.s, sl: dl.s, tr: dr.f * D.L, tl: dl.f * D.L, fr: fr.f * F.L, fl: fl.f * F.L };
}
// level of a grade at arc r: interpolated, rising behind the first point and falling past the last
function grade(P, r) {
  if (r <= P[0][0]) return P[0][1] + 0.03 * (P[0][0] - r);
  const last = P[P.length - 1];
  if (r >= last[0]) return last[1] - 0.05 * (r - last[0]);
  let k = 1;
  while (P[k][0] < r) k++;
  const [a, ya] = P[k - 1], [b, yb] = P[k];
  return ya + (yb - ya) * (r - a) / (b - a);
}
// the carved surface of one corridor at (x, z) over the current height h (h itself where it does not reach)
function carve(c, x, z, h) {
  const { d, s } = along(c.L, x, z), r = s - c.s0, a = c.P[0][0], b = c.P[c.P.length - 1][0];
  const fade = ease(a - 70, a - 20, r) * (1 - ease(b + 30, b + 90, r));
  if (fade <= 0) return { y: h, d };
  const y = grade(c.P, r) + CUT.wall * Math.max(0, d - c.w);
  return { y: y < h ? h + (y - h) * fade : h, d };
}
// Dakhnivska lifted along the deck axis (extended), fading out sideways and along the approaches
function raiseAt(D, x, z) {
  const [t, o] = D.to(x, z), side = 1 - ease(22, 46, Math.abs(o));
  if (side <= 0) return 0;
  const r = t < 0 ? RAISE.se * (1 - ease(50, 130, -t)) : t > D.L ? RAISE.nw * (1 - ease(60, 190, t - D.L)) : RAISE.se + (RAISE.nw - RAISE.se) * t / D.L;
  return r * side;
}

// what the terrain hook leaves for the build: lattice nodes carved (index -> metres) and the spans' ends
let SHAPED = null;

export function shapeOverpass(hf, map, geo) {
  const site = siteOf(geo);
  if (!site) return null;
  const { meta: { x0, z0, cell, nx, nz }, grid } = hf.data;
  const { D, F } = site;
  const C2 = [{ L: site.road, s0: site.sr, P: ROAD_PROF, w: CUT.road }, { L: site.rail, s0: site.sl, P: RAIL_PROF, w: CUT.rail }];
  // the box over both corridors' reach and the raised approaches
  const pts = [...site.road, ...site.rail, D.at(-150, 0), D.at(D.L + 210, 0)];
  const bx0 = Math.min(...pts.map((p) => p[0])) - 60, bx1 = Math.max(...pts.map((p) => p[0])) + 60;
  const bz0 = Math.min(...pts.map((p) => p[1])) - 60, bz1 = Math.max(...pts.map((p) => p[1])) + 60;
  const i0 = Math.max(0, Math.floor((bx0 - x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((bx1 - x0) / cell));
  const j0 = Math.max(0, Math.floor((bz0 - z0) / cell)), j1 = Math.min(nz - 1, Math.ceil((bz1 - z0) / cell));
  const cut = new Map();
  let raised = 0;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * nx + i, x = x0 + i * cell, z = z0 + j * cell;
    let h = grid[k];
    const up = raiseAt(D, x, z);
    if (up > 0.01) { h += up; raised++; }
    const R = carve(C2[0], x, z, h), T = carve(C2[1], x, z, h);
    const y = R.d <= CUT.road ? R.y : Math.min(R.y, T.y); // the road floor keeps the road's own grade
    if (h - y > 0.02) cut.set(k, h - y);
    grid[k] = y;
  }
  // a span reaches past every lattice cell (16 m) whose corners were carved, scanning out from where it crosses the cutting
  const carvedCell = (x, z) => {
    const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell);
    for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if ((cut.get((j + b) * nx + i + a) ?? 0) > 0.15) return true;
    return false;
  };
  const span = (Fr, tc, half) => {
    const busy = (t) => { for (let o = -half; o <= half + 1e-6; o += half / Math.ceil(half)) if (carvedCell(...Fr.at(t, o))) return true; return false; };
    let a = tc, b = tc;
    while (busy(a) && a > tc - 200) a -= 0.5;
    while (busy(b) && b < tc + 200) b += 0.5;
    return [a - 0.8, b + 0.8];
  };
  SHAPED = { cut, meta: { x0, z0, cell, nx }, deck: span(D, (site.tr + site.tl) / 2, DK.edge + 0.5), foot: span(F, (site.fr + site.fl) / 2, 2.2) };
  return { carved: cut.size, raised, deck: SHAPED.deck, foot: SHAPED.foot };
}

// metres carved at (x, z): the lattice cut, bilinear
function cutDepth(x, z) {
  if (!SHAPED) return 0;
  const { cut, meta: { x0, z0, cell, nx } } = SHAPED, u = (x - x0) / cell, v = (z - z0) / cell, i = Math.floor(u), j = Math.floor(v), s = u - i, t = v - j;
  const c = (a, b) => cut.get((j + b) * nx + i + a) ?? 0;
  return (1 - t) * ((1 - s) * c(0, 0) + s * c(1, 0)) + t * ((1 - s) * c(0, 1) + s * c(1, 1));
}

// ------------------------------------------------------------------------------------------------ ground fix-ups
// Ground tile triangles re-pointed at copies of their vertices with another surface (copies: the tiles share vertices
// per layer, and a triangle half in and half out would blend the surface ids), or dropped (pick returns -1).
// pick(cx, cz, surf, P, a, b, c) -> new surface | -1 | null (keep); only triangles inside box [x0, z0, x1, z1] are asked.
function resurface(ground, box, pick) {
  const tiles = (ground?.root?.children ?? []).filter((m) => m.material?.name === 'cherkasy-ground' && m.geometry?.index);
  let n = 0;
  for (const m of tiles) {
    const geo = m.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (bb.max.x < box[0] || bb.min.x > box[2] || bb.max.z < box[1] || bb.min.z > box[3]) continue;
    const P = geo.attributes.position.array, Nn = geo.attributes.normal.array, Sf = geo.attributes.aSurf.array, I = geo.index.array;
    const add = { p: [], n: [], s: [] }, copy = new Map(), idx = Array.from(I);
    let base = P.length / 3, hit = 0;
    const dup = (v, s) => {
      const key = v * 32 + s;
      let c = copy.get(key);
      if (c === undefined) { copy.set(key, c = base++); add.p.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]); add.n.push(Nn[3 * v], Nn[3 * v + 1], Nn[3 * v + 2]); add.s.push(s); }
      return c;
    };
    for (let k = 0; k < I.length; k += 3) {
      const a = I[k], b = I[k + 1], c = I[k + 2];
      const x = (P[3 * a] + P[3 * b] + P[3 * c]) / 3, z = (P[3 * a + 2] + P[3 * b + 2] + P[3 * c + 2]) / 3;
      if (x < box[0] || x > box[2] || z < box[1] || z > box[3]) continue;
      const s = pick(x, z, Sf[a], P, a, b, c);
      if (s === null || s === undefined) continue;
      if (s < 0) { idx[k + 1] = idx[k + 2] = a; hit++; continue; }
      idx[k] = dup(a, s); idx[k + 1] = dup(b, s); idx[k + 2] = dup(c, s); hit++;
    }
    if (!hit) continue;
    const grow = (arr, extra) => { const out = new Float32Array(arr.length + extra.length); out.set(arr); out.set(extra, arr.length); return out; };
    geo.dispose(); // drop the GPU buffers; three uploads the new ones on the next draw
    geo.setAttribute('position', new THREE.BufferAttribute(grow(P, add.p), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(grow(Nn, add.n), 3));
    geo.setAttribute('aSurf', new THREE.BufferAttribute(grow(Sf, add.s), 1));
    geo.setIndex(new THREE.BufferAttribute(base > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
    n += hit;
  }
  return n;
}

// the railing infill: 0.14 m of it per texture repeat, one flat bar, white = solid
const barTex = () => canvasTex(16, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#fff'; c.fillRect(w / 2 - 2, 0, 4, h); }, { srgb: false });

// ------------------------------------------------------------------------------------------------ site
export function buildOverpass({ root, solids: S, heightAt, geo, ground, detailMat }) {
  if (!geo || !SHAPED) return null;
  const site = siteOf(geo);
  if (!site) return null;
  const t0 = performance.now();
  const g = (x, z) => fin(heightAt(x, z));
  const { D, F } = site, [tS, tN] = SHAPED.deck, [fS, fN] = SHAPED.foot;

  // ---- the deck plane: the terrain at both ends (centre) and its mean cross fall there
  const gD = (t, o) => g(...D.at(t, o));
  const yS = gD(tS, 0), yN = gD(tN, 0), kT = (yN - yS) / (tN - tS);
  const kO = ((gD(tS, 8) - gD(tS, -8)) + (gD(tN, 8) - gD(tN, -8))) / 32;
  const Y = (t, o) => yS + kT * (t - tS) + kO * o + DK.lift;
  // the same plane as y = a + bx x + bz z (collision prisms)
  const bx = kT * D.ux + kO * D.nx, bz = kT * D.uz + kO * D.nz;
  const pa = Y(0, 0) - bx * D.P[0] - bz * D.P[1];
  const B = { det: new MB(), top: null, bars: new MB(), paint: new MB() };
  const det = B.det;
  const col = (c, part = DP.CONC) => det.setColor(c).setPart(part);

  // a box in a frame between t0..t1 and o0..o1, bottom / top given as y(t, o) (so it follows a sloped deck)
  const sbox = (M, Fr, ta, tb, oa, ob, lo, hi, mask = 63) => {
    if (ta > tb) [ta, tb] = [tb, ta];
    if (oa > ob) [oa, ob] = [ob, oa];
    const c =(t, o, f) => { const [x, z] = Fr.at(t, o); return [x, f(t, o), z]; };
    const u = [Fr.ux, 0, Fr.uz], n = [Fr.nx, 0, Fr.nz], neg = (v) => v.map((q) => -q);
    if (mask & 4) M.face([c(ta, oa, hi), c(tb, oa, hi), c(tb, ob, hi), c(ta, ob, hi)], [0, 1, 0]);
    if (mask & 8) M.face([c(ta, oa, lo), c(ta, ob, lo), c(tb, ob, lo), c(tb, oa, lo)], [0, -1, 0]);
    if (mask & 1) M.face([c(ta, ob, lo), c(tb, ob, lo), c(tb, ob, hi), c(ta, ob, hi)], n);
    if (mask & 2) M.face([c(ta, oa, lo), c(ta, oa, hi), c(tb, oa, hi), c(tb, oa, lo)], neg(n));
    if (mask & 16) M.face([c(tb, oa, lo), c(tb, oa, hi), c(tb, ob, hi), c(tb, ob, lo)], u);
    if (mask & 32) M.face([c(ta, oa, lo), c(ta, ob, lo), c(ta, ob, hi), c(ta, oa, hi)], neg(u));
  };
  const at = (dy) => (t, o) => Y(t, o) + dy, flat = (y) => () => y;
  const minY = Math.min(Y(tS, -DK.edge), Y(tS, DK.edge), Y(tN, -DK.edge), Y(tN, DK.edge)), maxY = Math.max(Y(tS, -DK.edge), Y(tS, DK.edge), Y(tN, -DK.edge), Y(tN, DK.edge));
  const len = tN - tS, tm = (tS + tN) / 2;

  // ---------------------------------------------------------------- deck structure (concrete)
  col(C.conc);
  sbox(det, D, tS, tN, -DK.walk, DK.walk, at(-DK.slab), at(0), 8 | 16 | 32); // slab: its top is the road surface mesh
  for (const sg of [-1, 1]) { // fascia beams, rising into the parapet kerb the railing stands on
    const [oa, ob] = sg > 0 ? [DK.walk, DK.edge] : [-DK.edge, -DK.walk];
    sbox(det, D, tS, tN, oa, ob, at(-DK.depth), at(DK.par));
  }
  col(C.concDark);
  for (const o of [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5]) sbox(det, D, tS + 0.3, tN - 0.3, o - 0.4, o + 0.4, at(-DK.depth + 0.05), at(-DK.slab), 1 | 2 | 8 | 16 | 32);
  for (const [ta, tb] of [[tS, tS + 0.6], [tN - 0.6, tN]]) sbox(det, D, ta, tb, -DK.walk, DK.walk, at(-DK.depth), at(-DK.slab), 1 | 2 | 8 | 16 | 32); // end diaphragms
  S.prism([D.at(tS, -DK.edge), D.at(tN, -DK.edge), D.at(tN, DK.edge), D.at(tS, DK.edge)], minY - DK.depth, pa, bx, bz, 'bridge', OVERHANG);
  for (const sg of [-1, 1]) {
    const [oa, ob] = sg > 0 ? [DK.hw, DK.walk] : [-DK.walk, -DK.hw];
    S.prism([D.at(tS, oa), D.at(tN, oa), D.at(tN, ob), D.at(tS, ob)], minY - 0.5, pa + DK.kerb, bx, bz, 'walk', OVERHANG);
    const [cx, cz] = D.at(tm, sg * (DK.edge - 0.25));
    S.obox(cx, cz, len / 2, 0.25, D.ang, minY - DK.depth, maxY + DK.rail, 'rail');
  }

  // ---------------------------------------------------------------- piers: square columns under a cap beam
  // rows just off the road's walk band on its south-east side, in the strip between road and track, past the track;
  // longer spans get an extra row
  const rows = [site.tr - (ROAD_HW + WALK + 1.5), (site.tr + ROAD_HW + WALK + 0.5 + site.tl - 3) / 2, site.tl + 5].filter((t) => t > tS + 6 && t < tN - 6);
  const stops = [tS, ...rows, tN];
  for (let k = 1; k < stops.length; k++) {
    const gap = stops[k] - stops[k - 1], extra = Math.floor(gap / 30);
    for (let q = 1; q <= extra; q++) rows.push(stops[k - 1] + gap * q / (extra + 1));
  }
  const capLo = -DK.depth - 0.9;
  for (const tp of rows) {
    col(C.conc);
    sbox(det, D, tp - 0.6, tp + 0.6, -DK.walk + 0.3, DK.walk - 0.3, at(capLo), at(-DK.depth));
    const [cx, cz] = D.at(tp, 0);
    S.obox(cx, cz, 0.6, DK.walk - 0.3, D.ang, Y(tp, 0) + capLo - 0.4, Y(tp, 0) - DK.depth, 'pier');
    for (const o of [-6.2, 0, 6.2]) {
      const foot = Math.min(...[[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]].map(([a, b]) => gD(tp + a, o + b))) - 0.4;
      const top = Y(tp, o) + capLo;
      if (top - foot < 0.5) continue;
      sbox(det, D, tp - 0.45, tp + 0.45, o - 0.45, o + 0.45, flat(foot), flat(top), 1 | 2 | 16 | 32);
      const [px, pz] = D.at(tp, o);
      S.obox(px, pz, 0.45, 0.45, D.ang, foot, top, 'pier');
    }
  }

  // ---------------------------------------------------------------- railings, lamps (painted steel)
  const bars = B.bars;
  for (const sg of [-1, 1]) {
    const o = sg * (DK.edge - 0.22);
    det.setColor(C.blue).setPart(DP.PAINT);
    for (let t = tS + 0.2; t <= tN; t += 2.4) sbox(det, D, t - 0.04, t + 0.04, o - 0.04, o + 0.04, at(DK.par), at(DK.rail), 1 | 2 | 16 | 32);
    sbox(det, D, tS, tN, o - 0.05, o + 0.05, at(DK.rail - 0.06), at(DK.rail));
    sbox(det, D, tS, tN, o - 0.03, o + 0.03, at(DK.par + 0.04), at(DK.par + 0.1), 1 | 2 | 4 | 8);
    // the infill: one vertical quad strip, bars from its alpha texture (u in 0.14 m steps)
    const q = (t, y) => { const [x, z] = D.at(t, o); return [x, Y(t, o) + y, z]; };
    const n = [D.nx * sg, 0, D.nz * sg], ids = [];
    for (const [t, y, v] of [[tS, DK.par + 0.1, 0], [tN, DK.par + 0.1, 0], [tN, DK.rail - 0.06, 1], [tS, DK.rail - 0.06, 1]]) {
      const p = q(t, y);
      ids.push(bars.vert(p[0], p[1], p[2], ...n, (t - tS) / 0.14, v));
    }
    bars.quad(ids[0], ids[1], ids[2], ids[3]);
    // lamp posts on the parapet, the arm over the carriageway, the lantern lit at night
    for (let t = tS + 14 + (sg > 0 ? 0 : 16); t < tN - 6; t += 32) {
      const [x, z] = D.at(t, sg * (DK.edge - 0.2)), y0 = Y(t, sg * DK.edge) + DK.par;
      det.setColor(C.galv).setPart(DP.GALV).cyl(x, y0, z, 0.11, 0.07, 8.6, 8);
      sbox(det, D, t - 0.05, t + 0.05, sg * (DK.edge - 2.2), sg * (DK.edge - 0.2), flat(y0 + 8.45), flat(y0 + 8.55));
      det.setColor('#2b2d30').setPart(DP.PAINT);
      sbox(det, D, t - 0.22, t + 0.22, sg * (DK.edge - 2.6), sg * (DK.edge - 1.8), flat(y0 + 8.3), flat(y0 + 8.48));
      det.setColor('#fff2d8').setPart(DP.LIGHT);
      sbox(det, D, t - 0.17, t + 0.17, sg * (DK.edge - 2.55), sg * (DK.edge - 1.85), flat(y0 + 8.26), flat(y0 + 8.3), 8);
      S.cyl(x, z, y0, y0 + 8.6, 0.12, 0.08, 'pole');
    }
  }

  // ---------------------------------------------------------------- carriageway, walks and kerbs in the ground material
  const top = { p: [], n: [], s: [], i: [] };
  const nUp = (() => { const l = Math.hypot(bx, 1, bz); return [-bx / l, 1 / l, -bz / l]; })();
  const tq = (pts, nrm, surf) => { // quad, wound to face along nrm
    const b = top.p.length / 3;
    for (const [x, y, z] of pts) { top.p.push(x, y, z); top.n.push(...nrm); top.s.push(surf); }
    const [p0, p1, p2] = pts, e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const f = nrm[0] * (e1[1] * e2[2] - e1[2] * e2[1]) + nrm[1] * (e1[2] * e2[0] - e1[0] * e2[2]) + nrm[2] * (e1[0] * e2[1] - e1[1] * e2[0]);
    top.i.push(...(f > 0 ? [b, b + 1, b + 2, b, b + 2, b + 3] : [b, b + 2, b + 1, b, b + 3, b + 2]));
  };
  const P3 = (t, o, dy = 0) => { const [x, z] = D.at(t, o); return [x, Y(t, o) + dy, z]; };
  const NT = Math.max(1, Math.ceil(len / 4));
  for (let k = 0; k < NT; k++) {
    const ta = tS + len * k / NT, tb = tS + len * (k + 1) / NT;
    tq([P3(ta, -DK.hw), P3(tb, -DK.hw), P3(tb, DK.hw), P3(ta, DK.hw)], nUp, SURF.ASPHALT);
    for (const sg of [-1, 1]) {
      const [oa, ob] = sg > 0 ? [DK.hw, DK.walk] : [-DK.walk, -DK.hw];
      tq([P3(ta, oa, DK.kerb), P3(tb, oa, DK.kerb), P3(tb, ob, DK.kerb), P3(ta, ob, DK.kerb)], nUp, SURF.PAVERS);
      const ok = sg * DK.hw;
      tq([P3(ta, ok), P3(tb, ok), P3(tb, ok, DK.kerb), P3(ta, ok, DK.kerb)], [-D.nx * sg, 0, -D.nz * sg], SURF.CURB);
    }
  }
  for (const [t, sg] of [[tS, -1], [tN, 1]]) for (const s2 of [-1, 1]) { // the walks' end faces
    const [oa, ob] = s2 > 0 ? [DK.hw, DK.walk] : [-DK.walk, -DK.hw];
    tq([P3(t, oa), P3(t, ob), P3(t, ob, DK.kerb), P3(t, oa, DK.kerb)], [D.ux * sg, 0, D.uz * sg], SURF.CURB);
  }
  // lane paint as on the city's primaries: a solid centre line, dashed lane lines 3.5 m out
  const paint = B.paint;
  const strip = (ta, tb, o, hw) => paint.face([P3(ta, o - hw, 0.012), P3(tb, o - hw, 0.012), P3(tb, o + hw, 0.012), P3(ta, o + hw, 0.012)], nUp);
  strip(tS + 0.5, tN - 0.5, 0, 0.075);
  for (const o of [-3.5, 3.5]) for (let t = tS + 1; t + 3 < tN; t += 9) strip(t, t + 3, o, 0.06);

  // ---------------------------------------------------------------- the pipeline footbridge
  const gF = (t, o) => g(...F.at(t, o)), fL = fN - fS;
  const y0F = gF(fS, 0) + 0.05, y1F = gF(fN, 0) + 0.05;
  const YF = (t) => y0F + (y1F - y0F) * (t - fS) / fL + 4 * FB.hump * ((t - fS) / fL) * (1 - (t - fS) / fL);
  const atF = (dy) => (t) => YF(t) + dy;
  const NF = Math.max(2, Math.ceil(fL / 6));
  for (let k = 0; k < NF; k++) {
    const ta = fS + fL * k / NF, tb = fS + fL * (k + 1) / NF;
    det.setColor(C.grate).setPart(DP.GRATE);
    sbox(det, F, ta, tb, -FB.hw, FB.hw, atF(-0.12), atF(0), 4 | 8);
    det.setColor(C.steel).setPart(DP.STEEL);
    for (const sg of [-1, 1]) {
      sbox(det, F, ta, tb, sg * FB.hw - 0.06, sg * FB.hw + 0.06, atF(-0.45), atF(-0.05)); // side girders
      sbox(det, F, ta, tb, sg * FB.hw - 0.03, sg * FB.hw + 0.03, atF(FB.rail - 0.05), atF(FB.rail)); // handrails
      sbox(det, F, ta, tb, sg * FB.hw - 0.02, sg * FB.hw + 0.02, atF(0.5), atF(0.54), 1 | 2 | 4 | 8);
    }
    // collision: one planar piece per section, the walk as an overhang
    const ya = YF(ta), yb = YF(tb), kk = (yb - ya) / (tb - ta), fbx = kk * F.ux, fbz = kk * F.uz, [ax, az] = F.at(ta, 0);
    S.prism([F.at(ta, -FB.hw), F.at(tb, -FB.hw), F.at(tb, FB.hw), F.at(ta, FB.hw)], Math.min(ya, yb) - 0.45, ya - fbx * ax - fbz * az, fbx, fbz, 'bridge', OVERHANG);
  }
  for (let t = fS + 0.1; t <= fN; t += 1.8) for (const sg of [-1, 1]) sbox(det, F, t - 0.025, t + 0.025, sg * FB.hw - 0.025, sg * FB.hw + 0.025, atF(0), atF(FB.rail), 1 | 2 | 16 | 32);
  // the pipe beside the walk, on brackets, running on into the ground at both ends
  det.setColor(C.pipe).setPart(DP.GALV);
  const po = FB.hw + 0.55, pipeAt = (t) => { const [x, z] = F.at(t, po); const tc = Math.min(fN, Math.max(fS, t)); return [x, YF(tc) + 0.15 - (t < fS ? fS - t : t > fN ? t - fN : 0) * 0.5, z]; };
  for (let k = 0; k < NF + 2; k++) {
    const ta = k === 0 ? fS - 3 : fS + fL * (k - 1) / NF, tb = k === NF + 1 ? fN + 3 : fS + fL * k / NF;
    det.tube(pipeAt(ta), pipeAt(tb), FB.pipe, 10);
  }
  det.setColor(C.steel).setPart(DP.STEEL);
  for (let t = fS + 2; t < fN; t += 4) sbox(det, F, t - 0.05, t + 0.05, FB.hw, po + 0.1, atF(-0.35), atF(-0.2));
  for (const sg of [-1, 1]) {
    const [cx, cz] = F.at((fS + fN) / 2, sg * FB.hw);
    S.obox(cx, cz, fL / 2, 0.06, F.ang, Math.min(y0F, y1F) - 0.5, Math.max(y0F, y1F) + FB.hump + FB.rail, 'rail');
  }
  { const [cx, cz] = F.at((fS + fN) / 2, po); S.obox(cx, cz, fL / 2 + 3, FB.pipe, F.ang, Math.min(y0F, y1F) - 0.6, Math.max(y0F, y1F) + FB.hump + 0.6, 'pipe'); }
  // steel frames: off the road's walk band, between road and track, past the track
  const fRows = [site.fr - (ROAD_HW + WALK + 1), (site.fr + ROAD_HW + WALK + site.fl - 3) / 2, site.fl + 4].filter((t) => t > fS + 4 && t < fN - 4);
  for (const tp of fRows) {
    const yTop = YF(tp) - 0.45;
    for (const sg of [-1, 1]) {
      const o = sg * (FB.hw + 0.1), foot = gF(tp, o) - 0.3;
      sbox(det, F, tp - 0.12, tp + 0.12, o - 0.12, o + 0.12, flat(foot), flat(yTop), 1 | 2 | 16 | 32);
      const [x, z] = F.at(tp, o);
      S.obox(x, z, 0.12, 0.12, F.ang, foot, yTop, 'pier');
    }
    sbox(det, F, tp - 0.1, tp + 0.1, -FB.hw - 0.2, po + 0.2, flat(yTop - 0.25), flat(yTop));
    for (const h of [0.35, 0.65]) sbox(det, F, tp - 0.05, tp + 0.05, -FB.hw, FB.hw, flat(gF(tp, 0) + (yTop - gF(tp, 0)) * h - 0.06), flat(gF(tp, 0) + (yTop - gF(tp, 0)) * h));
  }

  // ---------------------------------------------------------------- guard rails along the road in the cutting
  let rails = 0;
  {
    const R = site.road, cum = [0];
    for (let k = 1; k < R.length; k++) cum.push(cum[k - 1] + Math.hypot(R[k][0] - R[k - 1][0], R[k][1] - R[k - 1][1]));
    const pointAt = (s) => { let k = 1; while (k < R.length - 1 && cum[k] < s) k++; const f = (s - cum[k - 1]) / (cum[k] - cum[k - 1]), dx = (R[k][0] - R[k - 1][0]) / (cum[k] - cum[k - 1]), dz = (R[k][1] - R[k - 1][1]) / (cum[k] - cum[k - 1]); return [R[k - 1][0] + (R[k][0] - R[k - 1][0]) * f, R[k - 1][1] + (R[k][1] - R[k - 1][1]) * f, dx, dz]; };
    const off = ROAD_HW + 0.9;
    for (const sg of [-1, 1]) {
      let run = [];
      const flush = () => {
        if (run.length >= 3) {
          rails++;
          for (let k = 1; k < run.length; k++) {
            const [ax, ay, az, anx, anz] = run[k - 1], [cx, cy, cz] = run[k];
            det.setColor(C.galv).setPart(DP.GALV);
            det.face([[ax, ay + 0.42, az], [cx, cy + 0.42, cz], [cx, cy + 0.74, cz], [ax, ay + 0.74, az]], [-anx, 0, -anz]);
            det.face([[ax + anx * 0.08, ay + 0.74, az + anz * 0.08], [cx + anx * 0.08, cy + 0.74, cz + anz * 0.08], [cx, cy + 0.74, cz], [ax, ay + 0.74, az]], [0, 1, 0]);
            det.face([[ax + anx * 0.08, ay + 0.42, az + anz * 0.08], [ax + anx * 0.08, ay + 0.74, az + anz * 0.08], [cx + anx * 0.08, cy + 0.74, cz + anz * 0.08], [cx + anx * 0.08, cy + 0.42, cz + anz * 0.08]], [anx, 0, anz]);
            det.setColor('#4a4d50').setPart(DP.STEEL).box(ax + anx * 0.12 - 0.06, ay - 0.2, az + anz * 0.12 - 0.06, ax + anx * 0.12 + 0.06, ay + 0.7, az + anz * 0.12 + 0.06, 1 | 2 | 4 | 16 | 32);
          }
          for (let k = 0; k + 1 < run.length; k += 4) { // collision in ~8 m pieces
            const [qx, qy, qz] = run[k], [cx, cy, cz] = run[Math.min(run.length - 1, k + 4)];
            S.obox((qx + cx) / 2, (qz + cz) / 2, Math.hypot(cx - qx, cz - qz) / 2 + 0.1, 0.1, Math.atan2(cz - qz, cx - qx), Math.min(qy, cy) - 0.2, Math.max(qy, cy) + 0.75, 'rail');
          }
        }
        run = [];
      };
      for (let s = site.sr - 84; s < site.sr + 230; s += 2) {
        const [x, z, dx, dz] = pointAt(s), nx = -dz * sg, nz = dx * sg, px = x + nx * off, pz = z + nz * off;
        // only in the cutting, not across a joining road, and not where a pier or the footbridge frame stands
        const open = cutDepth(px, pz) > 1.2 && !ground?.onAsphalt?.(px, pz) && !ground?.onAsphalt?.(x + nx * (ROAD_HW + 0.4), z + nz * (ROAD_HW + 0.4));
        if (open) run.push([px, g(px, pz) + GY.WALK, pz, nx, nz]); else flush();
      }
      flush();
    }
  }

  // ---------------------------------------------------------------- the ground under it: lawn instead of road and walks
  const dRoad = (x, z) => along(site.road, x, z).d;
  const under = (x, z) => {
    const [t, o] = D.to(x, z);
    if (t >= tS - 0.5 && t <= tN + 0.5 && Math.abs(o) < 12.5 && g(x, z) < Y(t, o) - 0.4) return true;
    const [u, w] = F.to(x, z);
    return u >= fS && u <= fN && Math.abs(w) < 1.8 && g(x, z) < YF(u) - 0.4;
  };
  const SWAP = new Set([SURF.YARD, SURF.FOREST, SURF.DIRT, SURF.SAND, SURF.FARM, SURF.SCRUB]);
  const ROADS = new Set([SURF.ASPHALT, SURF.PAVERS, SURF.CURB]);
  const reach = [...site.road, ...site.rail].filter(([x, z]) => cutDepth(x, z) > 0 || Math.hypot(x - D.P[0], z - D.P[1]) < 400);
  const box = [Math.min(...reach.map((p) => p[0])) - 60, Math.min(...reach.map((p) => p[1])) - 60, Math.max(...reach.map((p) => p[0])) + 60, Math.max(...reach.map((p) => p[1])) + 60];
  const lawned = resurface(ground, box, (x, z, s, P, a, b, c) => {
    if (SWAP.has(s)) return cutDepth(x, z) > 0.6 ? SURF.GRASS : null;
    if (!ROADS.has(s) || !under(x, z)) return null;
    // Sumhaitska's own carriageway, kerbs and walk band stay; a triangle with any corner on them is theirs
    const lim = s === SURF.PAVERS ? ROAD_HW + WALK : ROAD_HW;
    if (dRoad(x, z) < lim + 0.2) return null;
    for (const v of [a, b, c]) if (dRoad(P[3 * v], P[3 * v + 2]) < lim - 0.25) return null;
    return SURF.GRASS;
  });
  // lane paint of Dakhnivska on the ground under the deck (strips running along the deck axis)
  let unpainted = 0;
  const mk = ground?.root?.children?.find((m) => m.name === 'markings');
  if (mk?.geometry?.index) {
    const P = mk.geometry.attributes.position.array, I = mk.geometry.index.array;
    for (let k = 0; k < I.length; k += 3) {
      const a = I[k], b = I[k + 1], c = I[k + 2];
      if (b === a && c === a) continue;
      const x = (P[3 * a] + P[3 * b] + P[3 * c]) / 3, z = (P[3 * a + 2] + P[3 * b + 2] + P[3 * c + 2]) / 3, [t, o] = D.to(x, z);
      if (t < tS - 0.5 || t > tN + 0.5 || Math.abs(o) > 8) continue;
      let lx = 0, lz = 0; // the longest edge: a strip's direction
      for (const [p, q] of [[a, b], [b, c], [c, a]]) { const ex = P[3 * q] - P[3 * p], ez = P[3 * q + 2] - P[3 * p + 2]; if (ex * ex + ez * ez > lx * lx + lz * lz) { lx = ex; lz = ez; } }
      if (Math.abs(lx * D.ux + lz * D.uz) < 0.85 * Math.hypot(lx, lz)) continue;
      I[k + 1] = I[k + 2] = a; unpainted++;
    }
    mk.geometry.index.needsUpdate = true;
  }

  // ---------------------------------------------------------------- meshes
  const group = Object.assign(new THREE.Group(), { name: 'overpass' });
  root.add(group);
  const gmat = (ground?.root?.children ?? []).find((m) => m.material?.name === 'cherkasy-ground')?.material;
  if (gmat && top.i.length) {
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(top.p, 3));
    tg.setAttribute('normal', new THREE.Float32BufferAttribute(top.n, 3));
    tg.setAttribute('aSurf', new THREE.Float32BufferAttribute(top.s, 1));
    tg.setIndex(top.i);
    group.add(Object.assign(new THREE.Mesh(tg, gmat), { name: 'overpass-road', receiveShadow: true }));
  }
  const mat = detailMat ?? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  group.add(Object.assign(new THREE.Mesh(det.build({ part: true }), mat), { name: 'overpass-structure', castShadow: true, receiveShadow: true }));
  const barMat = new THREE.MeshStandardMaterial({ color: C.blue, alphaMap: barTex(), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.3, roughness: 0.55 });
  barMat.alphaMap.wrapT = THREE.ClampToEdgeWrapping;
  group.add(Object.assign(new THREE.Mesh(bars.build(), barMat), { name: 'overpass-railing', castShadow: true }));
  const mkMat = mk?.material ?? new THREE.MeshStandardMaterial({ color: 0xc7c7bd, roughness: 0.7 });
  group.add(Object.assign(new THREE.Mesh(paint.build({ uv: false }), mkMat), { name: 'overpass-paint', receiveShadow: true }));
  const clearRoad = Y(site.tr, 0) - DK.depth - gD(site.tr, 0);
  const clearRail = Y(site.tl, 0) - DK.depth - gD(site.tl, 0);
  console.log(`[cherkasy] Dakhnivska overpass: deck ${len.toFixed(0)} m (${yS.toFixed(1)}-${yN.toFixed(1)} m), ${rows.length} pier rows, clearance ${clearRoad.toFixed(1)} m road / ${clearRail.toFixed(1)} m track, footbridge ${fL.toFixed(0)} m, ${rails} guard rails, ${SHAPED.cut.size} lattice nodes carved, ${lawned} ground triangles lawned, ${unpainted} paint strips dropped, ${((det.v + bars.v + paint.v + top.p.length / 3) / 1000).toFixed(1)}k verts in ${(performance.now() - t0).toFixed(0)} ms`);

  // trees: off the deck and the footbridge and the strip under them
  const bb = (() => { const c = [D.at(tS - 3, -14), D.at(tS - 3, 14), D.at(tN + 3, -14), D.at(tN + 3, 14), F.at(fS - 2, -4), F.at(fN + 2, 4)]; return [Math.min(...c.map((p) => p[0])), Math.min(...c.map((p) => p[1])), Math.max(...c.map((p) => p[0])), Math.max(...c.map((p) => p[1]))]; })();
  return {
    deckAt: (x, z) => { const [t, o] = D.to(x, z); return t >= tS && t <= tN && Math.abs(o) <= DK.edge ? Y(t, o) : null; },
    clear: (x, z) => {
      if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) return false;
      const [t, o] = D.to(x, z);
      if (t > tS - 3 && t < tN + 3 && Math.abs(o) < 14) return true;
      const [u, w] = F.to(x, z);
      return u > fS - 2 && u < fN + 2 && Math.abs(w) < 4;
    },
    update() {},
  };
}
