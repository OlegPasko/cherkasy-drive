// OWNER: cherkasy (facade kit). Per-building street-level / facade dressing for the Cherkasy typology, called once per
// extruded building by buildings.js after its walls and roof are emitted.
//   dressBuilding({ t, S, Z, b, A, outer, holes, base, H, r, pitched })
//     t.fac: FacadeBuilder of the building's tile (facade shader), t.det: MB of the tile (detail material, DP parts)
//     S: Solids (collision), Z: ZipPoints, b: map building record, A: archetype (buildings.js), outer / holes: rings
//     [[x,z],...] (outer ccw in the map sense: outward normal of edge a->b is (dz, -dx) / L), base: wall bottom y,
//     H: wall top y, r(): seeded random, pitched: roof is pitched (no flat-roof clutter)
// What it adds (research cherkasy_arch.md 1.3-1.10): vertical balcony / loggia stripes on the long facades of Soviet
// blocks, enclosed per floor by residents in a chaotic PVC / aluminium / wood / open mix with coloured parapet sheets;
// wall AC units and satellite dishes; TV / cell antenna forests on flat roofs; concrete entrance canopies + doors on
// the courtyard side; shop porches ("ганок"), fascia panels and awnings on main-street ground floors; coloured steel
// doors on garage rows; yellow gas pipes on private houses. Everything is built in edge-local frames (edge direction u,
// outward normal n) since the OSM footprints come in any orientation.
// Budget (55k buildings): ~1.2 M vertices, ~40 k solids city-wide, so the loggia fronts are one vertex "ladder" per
// stripe: 2 vertices per level, parapet + glass quads share rows and the flat 'part' varying is taken from each
// triangle's provoking (last) vertex, so a row can carry the parapet colour for the quad above it while its part says
// GLASS for the glazing quad that starts there (GLASS ignores vertex colour). Small props get no collision.
// ?nokit skips the kit (A/B); the build prints one '[cherkasy] facadekit:' summary line (vertices / solids / ms).
import { DP } from '../materials.js';
import { area2, inPoly, bboxOf } from './geo.js';

const hexL = (h) => { const n = parseInt(h.slice(h[0] === '#' ? 1 : 0), 16); return [16, 8, 0].map((sh) => (((n >> sh) & 255) / 255) ** 2.2); }; // '#rrggbb' -> linear (gamma 2.2)
const pick = (r, list) => { let u = r() * list.reduce((s, x) => s + x[0], 0); for (const x of list) { u -= x[0]; if (u <= 0) return x[1]; } return list[list.length - 1][1]; };
const jit = (c, r, k = 0.08) => { const f = 1 - k + 2 * k * r(); return [c[0] * f, c[1] * f, c[2] * f]; };

// parapet sheet colours (white 40 %, brown 20 %, blue 15 %, green 10 %, original concrete 15 %)
const SHEET = [[40, hexL('#E6E4DC')], [20, hexL('#6A4A3A')], [15, hexL('#4A6C9A')], [10, hexL('#5C7A5A')], [15, hexL('#A9A69E')]];
const ALU = hexL('#B4B8BA'), WOODC = hexL('#8A6440'), BROWNS = hexL('#5E4332');
const RAIL = [[2, hexL('#9E9B93')], [1, hexL('#3E5A44')], [1, hexL('#4A3A30')], [1, hexL('#2E3134')]];
const FIN = hexL('#C9C6BE'), SLAB = hexL('#B3B0A8'), MUL = hexL('#ECEBE6');
const DOORS = [[3, hexL('#3F6147')], [2, hexL('#5B3A2E')], [2, hexL('#3F5F86')], [2, hexL('#7C7F80')], [1.5, hexL('#8A4A2A')], [0.6, hexL('#6B2A2E')], [0.5, hexL('#C9A13B')]];
const ENTRY = [[3, hexL('#4A3A30')], [2, hexL('#2E3134')], [1.5, hexL('#3E5A44')], [1, hexL('#6E3A2A')], [1, hexL('#8A8C8A')]];
const BRAND = ['#D62828', '#1D5FAF', '#2A9D3A', '#F2B705', '#E86A10', '#7A2E8C', '#0FA3B1', '#E0E0E0', '#1B1B1B', '#C2185B', '#00843D', '#FFCC00'].map(hexL);
const AWN = [[3, hexL('#8C1C22')], [2, hexL('#B3261E')], [1, hexL('#2F5E3A')], [1, hexL('#23466E')], [1, hexL('#C98A1B')]];
const GAS = hexL('#E3B928'), CONC = hexL('#A8A49A'), GRANITE = hexL('#8A7F78'), TILE = hexL('#B9ABA0'), AC = hexL('#D9D9D3'), ACG = hexL('#AEB1AE');
const DISH = [[3, hexL('#D8D8D2')], [1, hexL('#9FA3A6')], [0.4, hexL('#3A3C3E')]], MAST = hexL('#6E7275');

// ---------------------------------------------------------------------------------------------- build-wide state
// counters (reset when a new Solids instance shows up = a new city build) + a hash of the footprints seen so far so
// loggias / porches don't poke into an attached neighbour that was emitted earlier
let cur = null;
function begin(S) {
  if (cur && cur.S === S) return cur;
  cur = { S, grid: new Map(), n: 0, v: 0, s: 0, ms: 0, c: { bal: 0, loggia: 0, ac: 0, dish: 0, ant: 0, ent: 0, shop: 0, gar: 0, gas: 0, ins: 0 } };
  const C = cur;
  setTimeout(() => console.log(`[cherkasy] facadekit: ${C.n} buildings dressed, +${(C.v / 1e3).toFixed(0)}k verts, +${C.s} solids, ${C.ms.toFixed(0)} ms `
    + `(${C.c.bal} stripes / ${C.c.loggia} loggias, ${C.c.ac} AC, ${C.c.dish} dishes, ${C.c.ant} antennas, ${C.c.ent} entrances, ${C.c.shop} shop units, ${C.c.gar} garage doors, ${C.c.gas} gas pipes, ${C.c.ins} insulated flats)`), 0);
  return C;
}
const GC = 32;
function addFoot(C, P) { // register the footprint in every 32 m cell its bounds touch
  const e = { P, ...bboxOf(P) }, cell = (v) => Math.floor(v / GC);
  for (let i = cell(e.x0); i <= cell(e.x1); i++) for (let k = cell(e.z0); k <= cell(e.z1); k++) {
    const key = i * 65536 + k;
    if (!C.grid.has(key)) C.grid.set(key, []);
    C.grid.get(key).push(e);
  }
}
function blocked(C, x, z) {
  const l = C.grid.get(Math.floor(x / GC) * 65536 + Math.floor(z / GC)); if (!l) return false;
  for (const e of l) if (x > e.x0 && x < e.x1 && z > e.z0 && z < e.z1 && inPoly(e.P, x, z)) return true;
  return false;
}

// ---------------------------------------------------------------------------------------------- edge-local helpers
// frame of ring edge a->b: W(s, o, y) = a + u*s + n*o (s along the edge, o outward)
function edgeFrame(a, b, sg) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
  return { L, ux, uz, ax: a[0], az: a[1], nx: sg * uz, nz: -sg * ux };
}
// frames of all ring edges, tagged with their index and street flag (b.f character)
const ringFrames = (outer, sg, fl) => outer.map((a, i) => Object.assign(edgeFrame(a, outer[(i + 1) % outer.length], sg), { i, f: fl[i] ?? '0' }));
const W = (e, s, o, y) => [e.ax + e.ux * s + e.nx * o, y, e.az + e.uz * s + e.nz * o];
// quad with a flat normal; winding picked so the face points along N (detail material is front-side only)
function q4(D, a, b, c, d, nx, ny, nz, us = 1) {
  const [i, j, k, l] = [[a, 0, 0], [b, us, 0], [c, us, 1], [d, 0, 1]].map(([p, u, v]) => D.vert(p[0], p[1], p[2], nx, ny, nz, u, v));
  const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], f = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const facing = nx * (e[1] * f[2] - e[2] * f[1]) + ny * (e[2] * f[0] - e[0] * f[2]) + nz * (e[0] * f[1] - e[1] * f[0]);
  if (facing > 0) D.quad(i, j, k, l); else D.quad(i, l, k, j);
}
// edge-local box; faces bits: 1 front (o1), 2 back (o0), 4 s0 side, 8 s1 side, 16 top, 32 bottom
function ebox(D, e, s0, s1, o0, o1, y0, y1, faces) {
  const P = (s, o, y) => W(e, s, o, y);
  if (faces & 1) q4(D, P(s0, o1, y0), P(s1, o1, y0), P(s1, o1, y1), P(s0, o1, y1), e.nx, 0, e.nz, (s1 - s0) / 4.8);
  if (faces & 2) q4(D, P(s0, o0, y0), P(s1, o0, y0), P(s1, o0, y1), P(s0, o0, y1), -e.nx, 0, -e.nz);
  if (faces & 4) q4(D, P(s0, o0, y0), P(s0, o1, y0), P(s0, o1, y1), P(s0, o0, y1), -e.ux, 0, -e.uz);
  if (faces & 8) q4(D, P(s1, o0, y0), P(s1, o1, y0), P(s1, o1, y1), P(s1, o0, y1), e.ux, 0, e.uz);
  if (faces & 16) q4(D, P(s0, o0, y1), P(s1, o0, y1), P(s1, o1, y1), P(s0, o1, y1), 0, 1, 0);
  if (faces & 32) q4(D, P(s0, o0, y0), P(s1, o0, y0), P(s1, o1, y0), P(s0, o1, y0), 0, -1, 0);
}
// collision: edge-local rectangle prism
function eprism(S, e, s0, s1, o0, o1, y0, y1, kind, flags = 0) {
  const Q = [[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = W(e, s, o, 0); return [p[0], p[2]]; });
  if (area2(Q) < 0) Q.reverse();
  S.prism(Q.flat(), y0, y1, 0, 0, kind, flags);
}
// shader window grid of a wall quad (FacadeBuilder u runs from vertex b back to a, so bay i sits at s = L - u)
function bays(e, A) {
  const m = A.margin ?? 0.6, us = e.L - 2 * m, nb = Math.max(1, Math.floor(us / A.bayW + 0.5)), bw = us / nb;
  const c = []; for (let i = 0; i < nb; i++) c.push(e.L - m - (i + 0.5) * bw);
  return { c, bw };
}

// ---------------------------------------------------------------------------------------------- loggia stripe
// Vertex ladder in front (rows: parapet bottom / parapet top per floor + the glass top), fin walls on both sides, a
// cap on top and a soffit under the lowest balcony. Per floor: enclosed (PVC / aluminium / wood, parapet sheet colour)
// or open with a railing (no glass: the facade window shows through).
function loggiaStripe(D, e, sc, hw, dp, y0, fh, nf, r) {
  const ph = Math.min(1.05, fh * 0.37), sA = sc + hw, sB = sc - hw, ytop = y0 + nf * fh;
  const rows = [], open = [];
  for (let j = 0; j < nf; j++) {
    const fr = r();
    let part = DP.PAINT, col;
    if (fr < 0.6) col = pick(r, SHEET);                                                                   // white PVC
    else if (fr < 0.78) { if (r() < 0.5) { part = DP.GALV; col = ALU; } else col = pick(r, SHEET); }      // aluminium
    else if (fr < 0.88) { if (r() < 0.6) { part = DP.WOOD; col = WOODC; } else col = BROWNS; }           // brown / wood
    else { col = pick(r, RAIL); open[j] = true; }                                                         // open
    col = jit(col, r, 0.06);
    rows.push([y0 + j * fh, part, col], [y0 + j * fh + ph, DP.GLASS, col]);
  }
  rows.push([ytop, DP.GLASS, FIN]);
  // front ladder (normal n); uv.x in 4.8 m units so WOOD reads as ~10 cm vertical boards
  const id = rows.map(([y, part, col]) => {
    D.setPart(part).setColor(col);
    const a = W(e, sA, dp, y), b = W(e, sB, dp, y);
    return [D.vert(a[0], a[1], a[2], e.nx, 0, e.nz, hw / 2.4, y), D.vert(b[0], b[1], b[2], e.nx, 0, e.nz, -hw / 2.4, y)];
  });
  // outward-facing triangles (A_bot, B_bot, B_top) / (A_bot, B_top, A_top), rotated so the LAST vertex is on the
  // bottom row (the provoking vertex that carries the flat part)
  for (let k = 0; k + 1 < id.length; k++) {
    if (k & 1 && open[k >> 1]) continue; // open balcony: no glazing
    const [Ab, Bb] = id[k], [At, Bt] = id[k + 1];
    D.tri(Bt, Ab, Bb); D.tri(Bt, At, Ab);
  }
  // two full-height frame mullions split the glazing into 3 panes (per-floor frames would cost a row per floor)
  D.setPart(DP.PAINT).setColor(r() < 0.75 ? MUL : pick(r, [[1, ALU], [1, BROWNS]]));
  for (const m of [-hw / 3, hw / 3]) ebox(D, e, sc + m - 0.04, sc + m + 0.04, dp, dp + 0.015, y0, ytop, 1);
  // fins, cap, soffit
  D.setPart(DP.CONC).setColor(FIN);
  ebox(D, e, sB, sA, 0, dp, y0 - 0.12, ytop, 4 | 8);
  D.setColor(SLAB);
  ebox(D, e, sB - 0.03, sA + 0.03, 0, dp + 0.05, y0 - 0.12, ytop + 0.1, 16 | 32);
  return open;
}
// AC outdoor unit (front, top, both sides) hung at (s, o0) with bottom at y
function acUnit(D, e, s, o0, y, r) {
  D.setPart(DP.PAINT).setColor(jit(r() < 0.8 ? AC : ACG, r, 0.05));
  ebox(D, e, s - 0.4, s + 0.4, o0, o0 + 0.3, y, y + 0.55, 1 | 4 | 8 | 16);
}
// satellite dish: hexagonal fan facing outward, tilted up ~25 deg (single-sided: seen from the street)
function dish(D, e, s, o, y, r) {
  const R = 0.28 + r() * 0.14, tu = (r() - 0.5) * 0.7, t = 0.42;
  // dish axis: outward n rotated by tu around y, tilted up
  const ax = e.nx * Math.cos(tu) + e.ux * Math.sin(tu), az = e.nz * Math.cos(tu) + e.uz * Math.sin(tu);
  const nx = ax * Math.cos(t), ny = Math.sin(t), nz = az * Math.cos(t);
  const px = -az, pz = ax; // horizontal in-plane axis; second in-plane axis q = n x p
  const qx = ny * pz, qy = nz * px - nx * pz, qz = -ny * px;
  const c = W(e, s, o, y);
  D.setPart(DP.PAINT).setColor(pick(r, DISH));
  const ci = D.vert(c[0] - nx * 0.07, c[1] - ny * 0.07, c[2] - nz * 0.07, nx, ny, nz);
  const rim = [0, 1, 2, 3, 4, 5].map((k) => {
    const ca = R * Math.cos(k * Math.PI / 3), sa = R * Math.sin(k * Math.PI / 3);
    return D.vert(c[0] + ca * px + sa * qx, c[1] + sa * qy, c[2] + ca * pz + sa * qz, nx, ny, nz);
  });
  // winding: (p, q, n) is right-handed -> ccw seen from +n
  rim.forEach((v, k) => D.tri(ci, v, rim[k === 5 ? 0 : k + 1]));
}

// ---------------------------------------------------------------------------------------------- per-kind dressing
function dressApt(C, D, S, b, A, outer, sg, base, H, r, pitched, fl) {
  const E = ringFrames(outer, sg, fl), maxL = Math.max(0, ...E.map((e) => e.L));
  const fh = A.floorH;
  const gOf = (e) => (e.f === '2' ? Math.max(A.gH, 3.6) : A.plinth + fh);
  // ---- loggia stripes on the long facades
  if (b.k === 'apt' && b.lv >= 4 && !A.glass) {
    const longE = E.filter(e => e.L >= 13 && e.L >= 0.45 * maxL);
    const one = r() < (b.lv <= 5 ? 0.6 : 0.35); // many blocks have balconies on one side only
    const side = one ? longE.slice().sort((a, c) => (c.f > a.f) - (c.f < a.f) || c.L - a.L)[r() < 0.6 ? 0 : longE.length - 1] : null;
    const per = r() < 0.5 ? 2 : 3, dp = 1.0 + r() * 0.2;
    for (const e of longE) {
      if (side && e !== side) continue;
      const g = gOf(e), nf = Math.min(b.lv - 1, Math.floor((H - base - g - (pitched ? 0 : A.parapet)) / fh + 0.05));
      if (nf < 2) continue;
      const { c, bw } = bays(e, A), ph = Math.floor(r() * per), hw = Math.min(1.55, bw * 0.47);
      const y0 = base + g, used = new Set();
      for (let k = 1; k < c.length - 1; k++) {
        if ((k + ph) % per) continue;
        const sc = c[k];
        const a1 = W(e, sc - hw, dp + 0.1, 0), a2 = W(e, sc + hw, dp + 0.1, 0);
        if (inPoly(outer, a1[0], a1[2]) || inPoly(outer, a2[0], a2[2]) || blocked(C, a1[0], a1[2]) || blocked(C, a2[0], a2[2])) continue;
        const open = loggiaStripe(D, e, sc, hw, dp, y0, fh, nf, r);
        eprism(S, e, sc - hw - 0.03, sc + hw + 0.03, -0.1, dp + 0.05, y0 - 0.12, y0 + nf * fh + 0.1, 'wall');
        used.add(k); C.c.bal++; C.c.loggia += nf;
        // props on the balcony fronts: an AC unit or a dish on the parapet of some floors
        for (let j = 0; j < nf; j++) {
          const u = r();
          if (u < 0.04) { acUnit(D, e, sc + (r() < 0.5 ? -1 : 1) * (hw - 0.55), dp, y0 + j * fh + 0.12, r); C.c.ac++; }
          else if (u < 0.11 && !open[j]) { dish(D, e, sc + (r() - 0.5) * hw, dp + 0.25, y0 + j * fh + 0.55, r); C.c.dish++; }
        }
      }
      // wall-hung AC units / dishes next to the windows of the bays without loggias
      const wwH = bw * A.winW / 2;
      for (let k = 0; k < c.length; k++) {
        if (used.has(k) || used.has(k - 1) && hw > bw / 2 || used.has(k + 1) && hw > bw / 2) continue;
        for (let j = 0; j < nf; j++) {
          const u = r(), yb = y0 + j * fh;
          if (u < 0.032) { acUnit(D, e, c[k] + (r() < 0.5 ? -1 : 1) * Math.min(wwH + 0.5, bw / 2 - 0.42), 0, yb + fh * 0.2, r); C.c.ac++; }
          else if (u < 0.052) { dish(D, e, c[k] + (r() < 0.5 ? -1 : 1) * Math.min(wwH + 0.45, bw / 2 - 0.4), 0.35, yb + fh * 0.55, r); C.c.dish++; }
        }
      }
      // (car) insulation patches: single flats wrapped in painted foam by their owners (a 1-3 bay x 1 floor slab 10 cm
      // proud of the panels, window openings left free), the patchwork every Ukrainian panel block wears
      const nP = Math.round(c.length * nf * (0.022 + r() * 0.03) * INS_K);
      for (let q = 0; q < nP; q++) {
        const span = r() < 0.4 ? 1 : r() < 0.75 ? 2 : 3, k0 = Math.floor(r() * (c.length - span + 1)), j = Math.floor(r() * nf);
        let clash = false; for (let k = k0; k < k0 + span; k++) if (used.has(k)) clash = true;
        if (clash) continue;
        insulation(D, e, c, k0, span, bw, A, y0 + j * fh, fh, r); C.c.ins++;
      }
    }
  }
  // ---- entrance canopies + doors on the courtyard side (the long edge with the lowest street flag)
  if (b.k === 'apt' && b.lv >= 3) {
    const cand = E.filter(e => e.L >= 10 && e.L >= 0.6 * maxL);
    const lo = Math.min(...cand.map(e => +e.f));
    if (cand.length && lo < 2) { // all-shopfront blocks: entrances are in the storefront units
      const pool = cand.filter(e => +e.f === lo);
      const e = pool[Math.floor(r() * pool.length)];
      const nE = Math.max(1, Math.floor(e.L / (15 + r() * 3))), dcol = pick(r, ENTRY);
      for (let i = 0; i < nE; i++) {
        const s = (i + 0.5) / nE * e.L + (r() - 0.5) * 1.2, yc = base + 2.55;
        const p = W(e, s, 1.4, 0);
        if (s < 2 || s > e.L - 2 || inPoly(outer, p[0], p[2]) || blocked(C, p[0], p[2])) continue;
        D.setPart(DP.PAINT).setColor(jit(dcol, r));
        ebox(D, e, s - 0.6, s + 0.6, 0, 0.03, base, base + 2.1, 1);                 // door leaf
        D.setPart(DP.CONC).setColor(jit(CONC, r));
        ebox(D, e, s - 1.05, s + 1.05, 0, 1.25, yc, yc + 0.16, 1 | 4 | 8 | 16 | 32); // canopy slab
        eprism(S, e, s - 1.05, s + 1.05, -0.05, 1.25, yc, yc + 0.16, 'awning', 1);
        C.c.ent++;
      }
    }
  }
  // ---- main-street ground floors: porches, fascia panels, awnings (units match the shader's 6.5 m storefront bays)
  for (const e of E) {
    if (e.f !== '2' || e.L < 5 || b.k === 'indus') continue;
    const gH = base + Math.max(A.gH, 3.6), nb2 = Math.max(1, Math.floor(e.L / 6.5 + 0.5)), bw2 = e.L / nb2;
    const band = r() < 0.5; // one continuous cladding band along the facade vs per-unit panels
    let bcol = BRAND[Math.floor(r() * BRAND.length)];
    for (let i = 0; i < nb2; i++) {
      const sc = e.L - (i + 0.5) * bw2, s0 = sc - bw2 / 2 + (band ? 0 : 0.35), s1 = sc + bw2 / 2 - (band ? 0 : 0.35);
      const p = W(e, sc, 1.6, 0);
      if (blocked(C, p[0], p[2])) continue;
      if (!band || r() < 0.25) bcol = BRAND[Math.floor(r() * BRAND.length)];
      D.setPart(DP.PAINT).setColor(jit(bcol, r, 0.05));
      ebox(D, e, s0, s1, 0, 0.14, gH - 0.58, gH - 0.02, 1 | 16);        // composite fascia over the cornice band
      const u = r();
      if (u < 0.35 && bw2 > 3.2) { // porch: landing + step, granite / tile
        const hP = Math.min(1.0, Math.max(0.35, A.plinth)), w = 1.1, ps = sc + (r() - 0.5) * (bw2 - 2 * w - 0.8);
        D.setPart(DP.CONC).setColor(jit(r() < 0.5 ? GRANITE : TILE, r));
        ebox(D, e, ps - w, ps + w, 0, 1.3, base - 1.2, base + hP, 1 | 4 | 8 | 16); // (deep: terrain falls away from the footprint)
        ebox(D, e, ps - w, ps + w, 1.3, 1.65, base - 1.2, base + hP / 2, 1 | 4 | 8 | 16);
        D.setPart(DP.STEEL).setColor(hexL('#2E3134'));
        for (const sg2 of [-1, 1]) ebox(D, e, ps + sg2 * w - 0.03, ps + sg2 * w + 0.03, 0.05, 1.6, base + hP + 0.9, base + hP + 0.95, 1 | 16); // handrails
        eprism(S, e, ps - w, ps + w, -0.05, 1.3, base - 0.2, base + hP, 'ledge', 2);
      } else if (u < 0.6) { // awning over the glass: sloped canvas + valance, both sides visible
        const ya = gH - 1.6, dA = 1.0, s0a = s0 + 0.1, s1a = s1 - 0.1;
        D.setPart(DP.CANVAS).setColor(jit(pick(r, AWN), r, 0.05));
        const a = W(e, s0a, 0, ya + 0.45), bq = W(e, s1a, 0, ya + 0.45), cq = W(e, s1a, dA, ya), dq = W(e, s0a, dA, ya);
        const sl = 0.45 / Math.hypot(0.45, dA), cs = dA / Math.hypot(0.45, dA);
        q4(D, a, bq, cq, dq, e.nx * sl, cs, e.nz * sl); q4(D, a, bq, cq, dq, -e.nx * sl, -cs, -e.nz * sl);
        ebox(D, e, s0a, s1a, dA - 0.02, dA, ya - 0.25, ya, 1 | 2);
      }
      C.c.shop++;
    }
  }
  // ---- roof antenna forest on flat roofs of 5-16 storey blocks (thin masts + Yagi booms; WIRE fades out at range)
  if (!pitched && b.lv >= 5 && b.lv <= 17) {
    const bb = outer.reduce((m, [x, z]) => [Math.min(m[0], x), Math.min(m[1], z), Math.max(m[2], x), Math.max(m[3], z)], [Infinity, Infinity, -Infinity, -Infinity]);
    const nA = Math.min(14, Math.max(2, Math.round((b.area ?? 400) / 320 * (0.6 + r() * 0.6))));
    for (let i = 0, tries = 0; i < nA && tries < nA * 3; tries++) {
      const x = bb[0] + r() * (bb[2] - bb[0]), z = bb[1] + r() * (bb[3] - bb[1]);
      if (!inPoly(outer, x, z) || !inPoly(outer, x + 1, z + 1) || !inPoly(outer, x - 1, z - 1)) continue;
      i++; C.c.ant++;
      const h = 1.8 + r() * 3.2, a = r() * Math.PI * 2, y1 = H + h;
      D.setPart(DP.WIRE).setColor(jit(MAST, r));
      // open triangular tube (3 quads: visible from every side at 12 vertices)
      const T3 = [0, 2.094, 4.188].map((t) => [x + 0.035 * Math.cos(a + t), z + 0.035 * Math.sin(a + t)]);
      T3.forEach(([px, pz], k) => {
        const [qx, qz] = T3[k === 2 ? 0 : k + 1];
        q4(D, [px, H, pz], [qx, H, qz], [qx, y1, qz], [px, y1, pz], (px + qx) / 2 - x, 0, (pz + qz) / 2 - z);
      });
      const yb = y1 - 0.25 - r() * 0.5;
      if (r() < 0.8) { // Yagi boom: thin vertical strip, both faces
        const L2 = 0.8 + r() * 0.9, bx = Math.cos(a + 1.2) * L2 / 2, bz = Math.sin(a + 1.2) * L2 / 2;
        const P = [[x - bx, yb, z - bz], [x + bx, yb, z + bz], [x + bx, yb + 0.05, z + bz], [x - bx, yb + 0.05, z - bz]];
        q4(D, ...P, -bz, 0, bx); q4(D, ...P, bz, 0, -bx);
      } else { // cell panel antenna
        D.setPart(DP.PAINT).setColor(hexL('#D0D0CA'));
        const px = Math.cos(a) * 0.15, pz = Math.sin(a) * 0.15, ox = -pz * 0.5, oz = px * 0.5;
        const P = [[x + ox - px, yb - 1.3, z + oz - pz], [x + ox + px, yb - 1.3, z + oz + pz], [x + ox + px, yb, z + oz + pz], [x + ox - px, yb, z + oz - pz]];
        q4(D, ...P, ox, 0, oz); q4(D, ...P, -ox, 0, -oz);
      }
    }
  }
}

const FOAM = [[3, hexL('#E8D9BC')], [2, hexL('#EFE6D0')], [1.5, hexL('#D8B6A4')], [1, hexL('#C6D5BE')], [1, hexL('#E6CD86')], [1, hexL('#B9C9D8')], [1.5, hexL('#F1EFEA')], [0.6, hexL('#C98F6E')]];
function insulation(D, e, c, k0, span, bw, A, yb, fh, r) {
  const ww = bw * A.winW, wh = fh * A.winH, wy = (fh - wh) * 0.42, m = 0.07, t = 0.1;
  const s0 = c[k0 + span - 1] - bw / 2, s1 = c[k0] + bw / 2; // bay centres run backwards along the edge (bays())
  const oy0 = yb + wy - m, oy1 = yb + wy + wh + m;
  D.setPart(DP.PAINT).setColor(jit(pick(r, FOAM), r, 0.04));
  ebox(D, e, s0, s1, 0, t, yb + 0.02, oy0, 1 | 4 | 8 | 16 | 32);   // under the windows
  ebox(D, e, s0, s1, 0, t, oy1, yb + fh - 0.02, 1 | 4 | 8 | 16 | 32); // over them
  let prev = s0;
  for (let k = k0 + span - 1; k >= k0; k--) { // piers between the openings
    const a0 = c[k] - ww / 2 - m, a1 = c[k] + ww / 2 + m;
    if (a0 - prev > 0.05) ebox(D, e, prev, a0, 0, t, oy0, oy1, 1 | 4 | 8);
    prev = a1;
  }
  if (s1 - prev > 0.05) ebox(D, e, prev, s1, 0, t, oy0, oy1, 1 | 4 | 8);
}

function dressGarage(C, D, b, A, outer, sg, base, H, r, fl) {
  const E = ringFrames(outer, sg, fl);
  const L1 = Math.max(...E.map(e => e.L)), depth = (b.area ?? L1 * 6) / L1;
  let doorE;
  if (L1 < 8 && depth < 4.8) { // single cell: door on a short end
    const sh = E.filter(e => e.L > 2.2 && e.L < L1 * 0.8);
    if (!sh.length) return;
    doorE = [sh.slice().sort((a, c) => c.f - a.f || c.L - a.L)[0]];
  } else { // row: doors along the long side facing the street / the open side
    const lg = E.filter(e => e.L >= L1 * 0.7);
    const best = lg.slice().sort((a, c) => c.f - a.f)[0];
    doorE = best.f > '0' ? [best] : [lg[Math.floor(r() * lg.length)]];
    if (depth > 10 && lg.length > 1) doorE = lg.slice(0, 2); // back-to-back double row
  }
  const hD = Math.min(2.2, H - base - 0.35);
  if (hD < 1.6) return;
  for (const e of doorE) {
    const nC = Math.max(1, Math.round(e.L / 3.2)), cw = e.L / nC;
    if (cw < 2.2) continue;
    for (let i = 0; i < nC; i++) {
      if (r() < 0.04) continue; // bricked-up / missing
      const sc = (i + 0.5) * cw, w = Math.min(1.25, cw / 2 - 0.25);
      D.setPart(DP.PAINT).setColor(jit(pick(r, DOORS), r, 0.12));
      ebox(D, e, sc - w, sc + w, 0, 0.04, base + 0.05, base + 0.05 + hD, 1);
      C.c.gar++;
    }
  }
}

function dressHouse(C, D, outer, sg, base, H, r, fl) {
  if (r() > 0.22 || H - base < 2.6) return;
  // the street-most edge longer than 3 m (ties: the longer one)
  const best = ringFrames(outer, sg, fl).filter((e) => e.L > 3).reduce((m, e) => (!m || e.f > m.f || (e.f === m.f && e.L > m.L) ? e : m), null);
  if (!best) return;
  const e = best, y = Math.min(base + 2.2, H - 0.25), s0 = 0.25, s1 = e.L - 0.25, o0 = 0.1, o1 = 0.17, rs = r() < 0.5 ? s0 : s1 - 0.07;
  D.setPart(DP.PAINT).setColor(jit(GAS, r, 0.06));
  ebox(D, e, s0, s1, o0, o1, y, y + 0.07, 1 | 32);           // run along the wall at ~2.2 m
  ebox(D, e, rs, rs + 0.07, o0, o1, base - 0.8, y, 1);      // riser from the ground
  C.c.gas++;
}

// ---------------------------------------------------------------------------------------------- entry
const INS_K = typeof location !== 'undefined' && /[?&]insdbg\b/.test(location.search) ? 8 : 1; // debug: ?insdbg = 8x the insulated flats
const OFF = typeof location !== 'undefined' && /[?&]nokit\b/.test(location.search); // A/B: ?nokit skips the kit
export function dressBuilding({ t, S, Z, b, A, outer, holes, base, H, r, pitched }) {
  void Z; void holes;
  if (OFF) return;
  const C = begin(S), t0 = performance.now(), D = t.det, v0 = D.v, n0 = S.count ?? 0;
  const sg = area2(outer) >= 0 ? 1 : -1, fl = b.f ?? '';
  try {
    if (b.k === 'apt' || (b.k === 'public' && b.lv >= 2)) dressApt(C, D, S, b, A, outer, sg, base, H, r, pitched, fl);
    else if (b.k === 'garage') dressGarage(C, D, b, A, outer, sg, base, H, r, fl);
    else if (b.k === 'house') dressHouse(C, D, outer, sg, base, H, r, fl);
  } finally {
    addFoot(C, outer);
    C.n++; C.v += D.v - v0; C.s += (S.count ?? 0) - n0; C.ms += performance.now() - t0;
  }
}
