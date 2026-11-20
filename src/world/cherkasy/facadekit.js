// OWNER: cherkasy (facade kit). Per-building street-level / facade dressing for the Cherkasy typology, called once per
// extruded building by buildings.js after its walls and roof are emitted.
//   dressBuilding({ t, S, Z, b, A, outer, holes, base, H, r, pitched, heightAt?, roadAt? })
//     t.fac: FacadeBuilder of the building's tile (facade shader), t.det: MB of the tile (detail material, DP parts),
//     t.near: MB for what only reads up close (drawn within ~220 m, cherkasy/buildings.js)
//     S: Solids (collision), Z: ZipPoints, b: map building record, A: archetype (buildings.js), outer / holes: rings
//     [[x,z],...] (outer ccw in the map sense: outward normal of edge a->b is (dz, -dx) / L), base: wall bottom y,
//     H: wall top y, r(): seeded random, pitched: roof is pitched (no flat-roof clutter)
// What it adds (research cherkasy_arch.md 1.3-1.10): vertical balcony / loggia stripes on the long facades of Soviet
// blocks, enclosed per floor by residents in a chaotic PVC / aluminium / wood / open mix with coloured parapet sheets;
// wall AC units and satellite dishes; TV / cell antenna forests on flat roofs; concrete entrance canopies + doors on
// the courtyard side; shop porches ("ганок"), fascia panels and awnings on main-street ground floors; coloured steel
// doors on garage rows; yellow gas pipes on private houses;
// front doors, canopies and party-wall ribs on townhouse rows (A.row). Everything is built in edge-local frames (edge direction u,
// outward normal n) since the OSM footprints come in any orientation.
// Budget (55k buildings): ~1.2 M vertices, ~40 k solids city-wide, so the loggia fronts are one vertex "ladder" per
// stripe: 2 vertices per level, parapet + glass quads share rows and the flat 'part' varying is taken from each
// triangle's provoking (last) vertex, so a row can carry the parapet colour for the quad above it while its part says
// GLASS for the glazing quad that starts there (GLASS ignores vertex colour). Small props get no collision.
// Entrances (docs/cherkasy-facades.md; only when the generator ran its `plus` pass, which plans them as A.entr and
// puts a stair column in the wall over each): 'K' a khrushchevka's door in a proud portal on a low landing, under a
// concrete slab (bare, on pipe posts or between cheek walls) or a sheet visor; 'S' a pre-war house's panelled door in a
// plaster architrave under a small gable or a hood; 'N' a nine-storey block's porch (cheek walls, a deep slab, steps,
// sometimes closed into a vestibule); 'M' a new block's glazed lobby under a steel canopy; 'P' / 'p' a public
// building's glazed doors up a wide stair under a slab on piers, toward the street; industrial sheds get steel gates
// with a wicket and a staff door. A lamp over most doors (DP.LIGHT), an address plate, a bench by some. All of it, and
// the AC units and dishes, goes to t.near; only the canopies, porches and public stairs collide. An entrance is built
// only where its whole footprint is free (`fits`: no other building, no carriageway by roadAt(x, z), ground its steps
// can meet); a porch or a public stair that does not fit falls back to a plain door, else the wall stays blank.
// ?nokit skips the kit (A/B); the build prints one '[cherkasy] facadekit:' summary line (vertices / solids / ms).
// The private sector (dressHouse, dressShed): a house gets a front door on a step or a porch (a frame and a pent canopy
// on some) in a pier between two windows, a brick chimney through a pitched roof, on some a gas pipe; a shed gets a
// door. All of it is drawn as far as the roofs are (no LOD inside a tile) and again in the river mirror, so a house is
// held to about 9 triangles (+ ~0.2 M triangles for the 23k houses and 17k sheds) and nothing there has a solid: the
// fences (fences.js) keep the car out of the yards.
import { DP } from '../materials.js';
import { LAYER } from '../facade.js';
import { area2, inPoly, bboxOf, obb } from './geo.js';

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
  cur = { S, grid: new Map(), n: 0, v: 0, vn: 0, s: 0, ms: 0, c: { bal: 0, loggia: 0, ac: 0, dish: 0, ant: 0, ent: 0, shop: 0, gar: 0, gas: 0, ins: 0, pub: 0, gate: 0, bench: 0, lamp: 0 } };
  const C = cur;
  setTimeout(() => console.log(`[cherkasy] facadekit: ${C.n} buildings dressed, +${(C.v / 1e3).toFixed(0)}k verts, +${C.s} solids, ${C.ms.toFixed(0)} ms `
    + `(${C.c.bal} stripes / ${C.c.loggia} loggias, ${C.c.ac} AC, ${C.c.dish} dishes, ${C.c.ant} antennas, ${C.c.ent} entrances, ${C.c.shop} shop units, ${C.c.gar} garage doors, ${C.c.gas} gas pipes, ${C.c.ins} insulated flats`
    + (C.vn ? `; near: ${(C.vn / 1e3).toFixed(0)}k of the verts, ${C.c.pub} public doors, ${C.c.gate} gates, ${C.c.bench} benches, ${C.c.lamp} door lamps)` : ')')), 0);
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
// the same with the generator's `plus` pass: the bays as the shader really lays them (FacadeBuilder.quad), wall segment
// by wall segment between the stair columns of A.entr, so balconies sit on their windows and none crosses a stair
function segBays(e, A) {
  const cuts = A.entr.filter((q) => q.i === e.i && q.split).sort((a, b) => a.s - b.s), c = [], bw = [];
  let s0 = 0;
  const seg = (s1) => {
    const len = s1 - s0, nb = len >= A.bayW * 0.62 ? Math.max(1, Math.round(len / A.bayW)) : 0;
    for (let j = 0; j < nb; j++) { c.push(s0 + (j + 0.5) * len / nb); bw.push(len / nb); }
  };
  for (const q of cuts) { seg(q.s - q.w / 2); s0 = q.s + q.w / 2; }
  seg(e.L);
  return { c: c.reverse(), bw: bw.reverse() };
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
function dressApt(C, D, Dn, S, b, A, outer, sg, base, H, r, pitched, fl, gAt) {
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
      const B0 = A.entr ? null : bays(e, A), { c, bw } = B0 ? { c: B0.c, bw: B0.c.map(() => B0.bw) } : segBays(e, A), ph = Math.floor(r() * per);
      const y0 = base + g, used = new Set();
      for (let k = 1; k < c.length - 1; k++) {
        if ((k + ph) % per) continue;
        const sc = c[k], hw = Math.min(1.55, bw[k] * 0.47);
        const a1 = W(e, sc - hw, dp + 0.1, 0), a2 = W(e, sc + hw, dp + 0.1, 0);
        if (inPoly(outer, a1[0], a1[2]) || inPoly(outer, a2[0], a2[2]) || blocked(C, a1[0], a1[2]) || blocked(C, a2[0], a2[2])) continue;
        const open = loggiaStripe(D, e, sc, hw, dp, y0, fh, nf, r);
        eprism(S, e, sc - hw - 0.03, sc + hw + 0.03, -0.1, dp + 0.05, y0 - 0.12, y0 + nf * fh + 0.1, 'wall');
        used.add(k); C.c.bal++; C.c.loggia += nf;
        // props on the balcony fronts: an AC unit or a dish on the parapet of some floors
        for (let j = 0; j < nf; j++) {
          const u = r();
          if (u < 0.04) { acUnit(Dn, e, sc + (r() < 0.5 ? -1 : 1) * (hw - 0.55), dp, y0 + j * fh + 0.12, r); C.c.ac++; }
          else if (u < 0.11 && !open[j]) { dish(Dn, e, sc + (r() - 0.5) * hw, dp + 0.25, y0 + j * fh + 0.55, r); C.c.dish++; }
        }
      }
      // wall-hung AC units / dishes next to the windows of the bays without loggias
      for (let k = 0; k < c.length; k++) {
        if (used.has(k)) continue;
        const wwH = bw[k] * A.winW / 2;
        for (let j = 0; j < nf; j++) {
          const u = r(), yb = y0 + j * fh;
          if (u < 0.032) { acUnit(Dn, e, c[k] + (r() < 0.5 ? -1 : 1) * Math.min(wwH + 0.5, bw[k] / 2 - 0.42), 0, yb + fh * 0.2, r); C.c.ac++; }
          else if (u < 0.052) { dish(Dn, e, c[k] + (r() < 0.5 ? -1 : 1) * Math.min(wwH + 0.45, bw[k] / 2 - 0.4), 0.35, yb + fh * 0.55, r); C.c.dish++; }
        }
      }
      // (car) insulation patches: single flats wrapped in painted foam by their owners (a 1-3 bay x 1 floor slab 10 cm
      // proud of the panels, window openings left free), the patchwork every Ukrainian panel block wears
      const nP = Math.round(c.length * nf * (0.022 + r() * 0.03) * INS_K);
      for (let q = 0; q < nP; q++) {
        const span = r() < 0.4 ? 1 : r() < 0.75 ? 2 : 3, k0 = Math.floor(r() * (c.length - span + 1)), j = Math.floor(r() * nf);
        let clash = c[k0] - c[k0 + span - 1] > (span - 1) * bw[k0] + 0.1; // a stair column in between
        for (let k = k0; k < k0 + span; k++) if (used.has(k)) clash = true;
        if (clash) continue;
        insulation(D, e, c, k0, span, bw[k0], A, y0 + j * fh, fh, r); C.c.ins++;
      }
    }
  }
  // ---- entrances: as the generator planned them (A.entr, under their stair columns), else the old canopies + doors on
  // the courtyard side (the long edge with the lowest street flag)
  if (b.k === 'apt' && A.entr) {
    const dcol = pick(r, A.entr[0]?.kind === 'S' ? WOODDOOR : ENTRY);
    for (const q0 of A.entr) {
      const e = E[q0.i], q = e && fitted(C, e, outer, q0, base, gAt);
      if (!q) continue;
      const cw = entrance(C, Dn, S, e, q, A, base, gAt, r, dcol);
      C.c.ent++;
      const sd = r() < 0.5 ? -1 : 1, sb = q.s + sd * (cw + 1.3);
      if (q.kind !== 'M' && r() < 0.4 && sb > 1.5 && sb < e.L - 1.5 && !A.entr.some((o) => o !== q0 && o.i === q.i && Math.abs(o.s - sb) < 4)) {
        if (fits(C, e, outer, sb, 0.85, 0.7, base, gAt)) { bench(Dn, e, sb, 0.22, groundAt(gAt, e, sb, base), r); C.c.bench++; }
      }
    }
  } else if (b.k === 'apt' && b.lv >= 3) {
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

// ---------------------------------------------------------------------------------------------- entrances (plus)
const TRIM = hexL('#DAD6CB'), LAMP = [1.0, 0.8, 0.5], PLATE = hexL('#2B4F9E'), PLAQUE = hexL('#5E1F28'), ANTH = hexL('#2B2E31'), POST = hexL('#3A3D40');
const FRAMEC = [[3, hexL('#C9C6BE')], [2, hexL('#8A8C8A')], [1.5, hexL('#4A3A30')], [1, hexL('#3E5A44')], [1, hexL('#E6E4DC')]];
const WOODDOOR = [[3, hexL('#5B3A2E')], [2, hexL('#6E3A2A')], [1.5, hexL('#3E5A44')], [1, hexL('#7A5536')], [1, hexL('#8A8C8A')]];
const PUBFRAME = [[3, hexL('#8A8C8A')], [2, hexL('#5B3A2E')], [2, hexL('#E6E4DC')], [1, hexL('#2E3134')]];
const GATE = [[3, hexL('#7C7F80')], [2, hexL('#3F6147')], [2, hexL('#3F5F86')], [2, hexL('#6B3A2A')], [1, hexL('#8A4A2A')], [1, hexL('#4A4D50')]];
const VISOR = [[2, hexL('#8e9296')], [1, hexL('#6b2f2a')], [1, hexL('#3f6147')], [1, hexL('#5a3b2d')]];
const BENCH = [[2, WOODC], [1, hexL('#3F6147')], [1, hexL('#4A6C9A')], [1, BROWNS]];
// the ground in front of a door (the building's floor line follows its mean ground: on a slope a door stands lower)
// an entrance's footprint (s +- hw along the wall, out to dep) must stand on open ground: clear of this building's other
// wings and of its neighbours, off the carriageways (C.roadAt), and on ground its steps can meet - not most of a storey
// under the floor line, not buried in a slope
function fits(C, e, outer, s, hw, dep, base, gAt) {
  for (const o of [dep * 0.5, dep]) for (const ds of [-hw, 0, hw]) {
    const p = W(e, s + ds, o, 0);
    if (inPoly(outer, p[0], p[2]) || blocked(C, p[0], p[2]) || C.roadAt?.(p[0], p[2])) return false;
  }
  const p = W(e, s, 0.9, 0), y = gAt ? gAt(p[0], p[2]) : NaN;
  return !Number.isFinite(y) || (y > base - 2.2 && y < base + 1.5);
}
// [half width, depth] an entrance kind takes up in front of the wall, with its steps
const REACH = { K: () => [1.3, 1.3], S: () => [1.3, 1.3], N: () => [2.0, 2.6], M: (q) => [Math.min(1.7, q.w / 2) + 0.5, 1.9], P: (q) => [q.w / 2 + 1.1, 3.5], p: () => [1.4, 1.2] };
// the planned entrance if it fits, else a shallower one in its place: a porch or a public stair by a driveway becomes a
// plain door, and a door with a driveway right along the wall keeps only a doorstep under an overhead canopy (`flat`:
// nothing on the ground past 0.55 m, no cheek walls or posts); else none
function fitted(C, e, outer, q, base, gAt) {
  const k = q.kind, tries = k === 'N' ? ['N', 'K', 'K_'] : k === 'P' ? ['P', 'p', 'p_'] : k === 'M' ? ['M'] : [k, k + '_'];
  for (const t of tries) {
    const kind = t[0], flat = t.length > 1, [hw, dep] = flat ? [1.3, 0.55] : REACH[kind](q);
    if (q.s - hw > 0.2 && q.s + hw < e.L - 0.2 && fits(C, e, outer, q.s, hw, dep, base, gAt)) return kind === k && !flat ? q : { ...q, kind, flat };
  }
  return null;
}
// the ground a door stands on: the terrain 0.9 m out of the wall, kept within reach of the floor line (base): a door
// follows a slope down to 1.6 m under it and up to `hi` over it (the blank foot of the stair column has that much room)
function groundAt(gAt, e, s, base, hi = 0.9) {
  const p = W(e, s, 0.9, 0), y = gAt ? gAt(p[0], p[2]) : NaN;
  return Number.isFinite(y) ? Math.max(base - 1.6, Math.min(base + hi, y)) : base - 0.15;
}
// bench along the wall: a plank seat and back on two concrete legs
function bench(D, e, s, o, y, r) {
  D.setPart(DP.WOOD).setColor(jit(pick(r, BENCH), r));
  ebox(D, e, s - 0.85, s + 0.85, o, o + 0.38, y + 0.4, y + 0.46, 1 | 16);
  ebox(D, e, s - 0.85, s + 0.85, o - 0.05, o, y + 0.62, y + 0.86, 1);
  D.setPart(DP.CONC).setColor(CONC);
  for (const k of [-0.65, 0.65]) ebox(D, e, s + k - 0.06, s + k + 0.06, o + 0.02, o + 0.36, y - 0.4, y + 0.4, 1 | (k < 0 ? 4 : 8));
}
// one entrance q of A.entr on edge frame e; returns its half width. dcol: the building's door colour
function entrance(C, D, S, e, q, A, base, gAt, r, dcol) {
  const s = q.s, k = q.kind, yg = groundAt(gAt, e, s, base);
  const B = (s0, s1, o0, o1, y0, y1, f) => ebox(D, e, s0, s1, o0, o1, y0, y1, f);
  const part = (pt, c, j = 0.05) => D.setPart(pt).setColor(j ? jit(c, r, j) : c);
  const G = (o, s0, s1, y0, y1) => B(Math.min(s0, s1), Math.max(s0, s1), o, o + 0.02, y0, y1, 1); // a pane (the part is set by the caller)
  const lamp = (hw, o0, o1, y0, y1, f = 1 | 32, p = 0.75) => { if (r() < p) { part(DP.LIGHT, LAMP, 0); B(s - hw, s + hw, o0, o1, y0, y1, f); C.c.lamp++; } };
  const plate = (s0, o, y, w = 0.5, h = 0.22, c = PLATE) => { if (r() < 0.7) { part(DP.PAINT, c, 0.03); B(s0, s0 + w, o, o + 0.025, y, y + h, 1); } };
  const solid = (hw, o1, y0, y1, kind, fl) => eprism(S, e, s - hw, s + hw, -0.05, o1, y0, y1, kind, fl);
  if (k === 'K' || k === 'S') {
    const old = k === 'S', dw = old ? 0.62 : 0.66, hD = old ? 2.3 : 2.06, st = 0.13 + r() * 0.15, cw = 1.15 + r() * 0.15, yT = yg + st;
    part(DP.CONC, CONC); B(s - cw, s + cw, 0, q.flat ? 0.55 : 1.2, yg - 1.0, yT, 1 | 4 | 8 | 16);          // landing
    // portal: jambs and a lintel proud of the wall, so the leaves sit in a reveal
    const fw = old ? 0.2 : 0.11, fd = old ? 0.16 : 0.12, yL = yT + hD + 0.3;
    part(DP.PAINT, old ? TRIM : pick(r, FRAMEC));
    B(s - dw - fw, s - dw, 0, fd, yT, yL + fw, 1 | 8); B(s + dw, s + dw + fw, 0, fd, yT, yL + fw, 1 | 4);
    B(s - dw, s + dw, 0, fd, yL, yL + fw, 1 | 32);
    // a wooden pair of leaves, or a new steel door with a fixed side panel; a transom light over them (often boarded up)
    const sp = old ? 0 : (r() < 0.5 ? 0.24 : -0.24);
    part(DP.PAINT, dcol); B(s - dw, s + sp, 0, 0.03, yT, yT + hD, 1);
    part(DP.PAINT, dcol.map((v) => v * 0.8), 0.03); B(s + sp, s + dw, 0, 0.03, yT, yT + hD, 1);
    if (old || r() < 0.5) D.setPart(DP.GLASS);
    B(s - dw, s + dw, 0, 0.03, yT + hD, yL, 1);
    const yc = yL + fw + 0.07, ct = old ? (r() < 0.55 ? 'gable' : 'hood') : pick(r, q.flat ? [[4, 'slab'], [2, 'sheet']] : [[4, 'slab'], [3, 'posts'], [2.5, 'cheeks'], [2, 'sheet']]);
    if (ct === 'gable') { // a sheet-metal gable on two cleats
      const hg = dw + 0.5, dG = 0.95, rise = 0.42, nl = Math.hypot(rise, hg);
      part(r() < 0.5 ? DP.GALV : DP.PAINT, pick(r, VISOR));
      for (const sd of [-1, 1]) {
        const P = [W(e, s + sd * hg, 0, yc), W(e, s + sd * hg, dG, yc), W(e, s, dG, yc + rise), W(e, s, 0, yc + rise)], ns = sd * rise / nl, ny = hg / nl;
        q4(D, ...P, e.ux * ns, ny, e.uz * ns); q4(D, ...P, -e.ux * ns, -ny, -e.uz * ns);
      }
      part(DP.WOOD, WOODC);
      for (const sd of [-1, 1]) B(s + sd * (hg - 0.12) - 0.035, s + sd * (hg - 0.12) + 0.035, 0, 0.07, yc - 0.55, yc + 0.05, 1 | (sd < 0 ? 4 : 8));
    } else if (ct === 'hood') { // a plaster hood on two brackets
      part(DP.PAINT, TRIM); B(s - dw - 0.42, s + dw + 0.42, 0, 0.5, yc, yc + 0.1, 1 | 4 | 8 | 16 | 32);
      for (const sd of [-1, 1]) B(s + sd * (dw + 0.26) - 0.06, s + sd * (dw + 0.26) + 0.06, 0, 0.3, yc - 0.3, yc, 1 | (sd < 0 ? 4 : 8));
    } else if (ct === 'sheet') { // a new profiled-sheet visor: a sloped sheet with a lip, seen from both sides
      const P = [W(e, s - cw, 0, yc + 0.34), W(e, s + cw, 0, yc + 0.34), W(e, s + cw, 1.05, yc), W(e, s - cw, 1.05, yc)], sl = 0.31, cs = 0.95;
      part(r() < 0.5 ? DP.GALV : DP.PAINT, pick(r, VISOR));
      q4(D, ...P, e.nx * sl, cs, e.nz * sl); q4(D, ...P, -e.nx * sl, -cs, -e.nz * sl);
      B(s - cw, s + cw, 1.03, 1.05, yc - 0.08, yc, 1 | 2);
      solid(cw, 1.05, yc, yc + 0.34, 'awning', 1);
    } else { // the concrete slab: bare, on two pipe posts, or between cheek walls
      part(DP.CONC, CONC); B(s - cw, s + cw, 0, 1.25, yc, yc + 0.14, 1 | 4 | 8 | 16 | 32);
      if (ct === 'posts') { part(DP.STEEL, POST, 0); for (const sd of [-1, 1]) B(s + sd * (cw - 0.1) - 0.03, s + sd * (cw - 0.1) + 0.03, 1.1, 1.16, yg - 0.5, yc, 1 | 4 | 8); }
      if (ct === 'cheeks') {
        if (A.layer === LAYER.CONCRETE || A.layer === LAYER.STUCCO) part(DP.CONC, FIN); else part(DP.BRICK, A.layer === LAYER.RED2 ? hexL('#8E4A3A') : A.layer === LAYER.BUFF ? hexL('#C9A86A') : hexL('#CFCCC3'));
        B(s - cw, s - cw + 0.2, 0, 1.1, yg - 1.0, yc, 1 | 4 | 8); B(s + cw - 0.2, s + cw, 0, 1.1, yg - 1.0, yc, 1 | 4 | 8);
        solid(cw, 1.25, yg - 0.5, yc + 0.14, 'wall', 0);
      } else solid(cw, 1.25, yc, yc + 0.14, 'awning', 1);
    }
    lamp(0.13, fd, fd + 0.09, yL + 0.015, yL + fw - 0.015);
    plate(s + dw + fw + 0.18, 0, yT + 1.75);
    return cw;
  }
  if (k === 'N') { // a porch: landing and steps, cheek walls, a deep slab; every third closed into a vestibule
    const st = 0.38 + r() * 0.25, hw = 1.55 + r() * 0.2, dep = 1.9, yT = yg + st, yc = yT + 2.55, od = r() < 0.35 ? dep - 0.12 : 0;
    part(DP.CONC, CONC); B(s - hw, s + hw, 0, dep, yg - 1.0, yT, 1 | 4 | 8 | 16);
    for (const j of [1, 2]) B(s - hw, s + hw, dep + (j - 1) * 0.3, dep + j * 0.3, yg - 1.0, yT - j * st / 3, 1 | 16);
    if (A.layer === LAYER.CONCRETE || A.layer === LAYER.STUCCO) part(DP.CONC, FIN); else part(DP.BRICK, A.layer === LAYER.RED2 ? hexL('#8E4A3A') : A.layer === LAYER.BUFF ? hexL('#C9A86A') : hexL('#CFCCC3'));
    B(s - hw, s - hw + 0.22, 0, dep - 0.1, yT, yc, 1 | 4 | 8); B(s + hw - 0.22, s + hw, 0, dep - 0.1, yT, yc, 1 | 4 | 8);
    if (od) B(s - hw + 0.22, s + hw - 0.22, 0, od, yT, yc, 1);
    part(DP.CONC, SLAB); B(s - hw - 0.25, s + hw + 0.25, 0, dep + 0.35, yc, yc + 0.18, 1 | 4 | 8 | 16 | 32);
    part(DP.PAINT, pick(r, FRAMEC)); B(s - 1.0, s + 1.0, od, od + 0.05, yT, yT + 2.38, 1);
    part(DP.PAINT, dcol); B(s - 0.93, s - 0.015, od + 0.05, od + 0.07, yT + 0.02, yT + 2.04, 1);
    part(DP.PAINT, dcol, 0.03); B(s + 0.015, s + 0.93, od + 0.05, od + 0.07, yT + 0.02, yT + 2.04, 1);
    D.setPart(DP.GLASS); G(od + 0.05, s - 0.93, s + 0.93, yT + 2.09, yT + 2.33);
    lamp(0.14, od + 0.05, od + 0.16, yT + 2.4, yT + 2.5);
    plate(s + 1.05, od, yT + 1.7, Math.min(0.5, hw - 1.3));
    if (od) solid(hw, dep, yg - 0.5, yc + 0.18, 'wall', 0); // a closed vestibule is one block
    else { // an open porch: the landing, the two cheeks and the slab overhead, so the way to the door stays free
      solid(hw, dep, yg - 0.5, yT, 'ledge', 0);
      for (const sd of [-1, 1]) eprism(S, e, s + sd * (hw - 0.11) - 0.11, s + sd * (hw - 0.11) + 0.11, -0.05, dep - 0.1, yT, yc, 'wall', 0);
      solid(hw + 0.25, dep + 0.35, yc, yc + 0.18, 'awning', 1);
    }
    return hw + 0.25;
  }
  if (k === 'M') { // a new block's lobby: a dark frame of glass, a thin steel canopy
    const st = 0.18 + r() * 0.15, hw = Math.min(1.7, q.w / 2 - 0.05), yT = yg + st, yc = yT + 2.85;
    part(DP.CONC, GRANITE); B(s - hw - 0.5, s + hw + 0.5, 0, 1.9, yg - 1.0, yT, 1 | 4 | 8 | 16);
    part(DP.PAINT, ANTH, 0.03); B(s - hw, s + hw, 0, 0.06, yT, yT + 2.7, 1);
    D.setPart(DP.GLASS);
    for (const sd of [-1, 1]) { G(0.06, s + sd * 0.56, s + sd * (hw - 0.07), yT + 0.07, yT + 2.63); G(0.06, s + sd * 0.02, s + sd * 0.5, yT + 0.07, yT + 2.12); }
    G(0.06, s - 0.5, s + 0.5, yT + 2.2, yT + 2.63);
    part(DP.STEEL, ANTH, 0.03); B(s - hw - 0.4, s + hw + 0.4, 0, 1.7, yc, yc + 0.1, 1 | 4 | 8 | 16 | 32);
    lamp(0.8, 0.5, 0.62, yc - 0.03, yc - 0.004, 1 | 32, 0.9);
    solid(hw + 0.4, 1.7, yc, yc + 0.1, 'awning', 1);
    return hw + 0.5;
  }
  if (k === 'P') { // a public building's main entrance: a wide stair, glazed doors, a slab on square piers
    const hw = q.w / 2 - 0.15, st = 0.42 + r() * 0.3, cw = hw + 1.25, dep = 2.5, ns = st > 0.55 ? 3 : 2, yT = yg + st, yc = yT + 2.78;
    part(DP.CONC, r() < 0.5 ? GRANITE : CONC);
    B(s - cw, s + cw, 0, dep, yg - 1.0, yT, 1 | 4 | 8 | 16);
    for (let j = 1; j <= ns; j++) B(s - cw, s + cw, dep + (j - 1) * 0.32, dep + j * 0.32, yg - 1.0, yT - j * st / (ns + 1), 1 | 16);
    part(DP.PAINT, pick(r, PUBFRAME)); B(s - hw, s + hw, 0, 0.05, yT, yT + 2.62, 1);
    D.setPart(DP.GLASS);
    for (const sd of [-1, 1]) { G(0.05, s + sd * 0.03, s + sd * 0.9, yT + 0.3, yT + 2.06); if (hw > 1.3) G(0.05, s + sd * 1.0, s + sd * (hw - 0.07), yT + 0.55, yT + 2.06); }
    G(0.05, s - hw + 0.07, s + hw - 0.07, yT + 2.14, yT + 2.55);
    part(DP.CONC, TRIM); B(s - cw, s + cw, 0, dep + 0.25, yc, yc + 0.28, 1 | 4 | 8 | 16 | 32);
    part(DP.CONC, FIN); // two square piers clear of the doors
    for (const sd of [-1, 1]) B(s + sd * (hw + 0.7) - 0.17, s + sd * (hw + 0.7) + 0.17, dep - 0.44, dep - 0.1, yT, yc, 1 | 2 | 4 | 8);
    lamp(0.7, 0.9, 1.05, yc - 0.04, yc - 0.004, 32, 0.9);
    plate(s + hw + 0.3, 0, yT + 1.45, 0.45, 0.6, PLAQUE);
    solid(cw, dep + 0.25, yc, yc + 0.28, 'awning', 1);
    solid(cw, dep, yg - 0.5, yT, 'ledge', 0);
    return cw;
  }
  // 'p': a small public building's glazed door on a step, under a slab
  const dw = Math.max(0.5, Math.min(0.85, q.w / 2 - 0.35)), st = 0.12 + r() * 0.2, cw = dw + 0.55, yT = yg + st, yc = yT + 2.45;
  part(DP.CONC, CONC); B(s - cw, s + cw, 0, q.flat ? 0.55 : 1.1, yg - 1.0, yT, 1 | 4 | 8 | 16);
  part(DP.PAINT, pick(r, PUBFRAME)); B(s - dw - 0.08, s + dw + 0.08, 0, 0.06, yT, yT + 2.3, 1);
  D.setPart(DP.GLASS); G(0.06, s - dw, s - 0.03, yT + 0.3, yT + 2.02); G(0.06, s + 0.03, s + dw, yT + 0.3, yT + 2.02); G(0.06, s - dw, s + dw, yT + 2.08, yT + 2.24);
  part(DP.CONC, SLAB); B(s - cw, s + cw, 0, 1.2, yc, yc + 0.12, 1 | 4 | 8 | 16 | 32);
  lamp(0.13, 0.06, 0.15, yT + 2.32, yT + 2.41);
  plate(s + dw + 0.25, 0, yT + 1.5, 0.4, 0.5, PLAQUE);
  solid(cw, 1.2, yc, yc + 0.12, 'awning', 1);
  return cw;
}
function dressPublic(C, D, S, A, outer, sg, base, r, fl, gAt) {
  const E = ringFrames(outer, sg, fl);
  for (const q0 of A.entr) {
    const e = E[q0.i], q = e && fitted(C, e, outer, q0, base, gAt);
    if (!q) continue;
    entrance(C, D, S, e, q, A, base, gAt, r, null);
    C.c.pub++;
  }
}
// industrial: steel gates (two leaves in a channel frame, a brace, a wicket) on the street-most long wall, with a
// concrete apron, and a staff door beside them
function dressIndus(C, D, A, outer, sg, base, H, r, fl, gAt) {
  const E = ringFrames(outer, sg, fl), maxL = Math.max(0, ...E.map((e) => e.L));
  const cand = E.filter((e) => e.L >= 7 && e.L >= 0.5 * maxL);
  if (!cand.length) return;
  const e = cand.reduce((m, q) => (q.f > m.f || (q.f === m.f && q.L > m.L) ? q : m));
  const hG = Math.min(4.2, H - base - 0.8), gcol = pick(r, GATE), hw = hG > 3.5 ? 1.9 : 1.45;
  const n = hG >= 2.6 ? Math.max(1, Math.min(3, Math.round(e.L / 30))) : 0;
  // (a gate may open straight onto a driveway, so no road test here)
  const clear = (s, hs) => {
    const p = W(e, s, 1.5, 0), g = W(e, s, 0.9, 0), y = gAt ? gAt(g[0], g[2]) : NaN;
    return s - hs > 0.8 && s + hs < e.L - 0.8 && !inPoly(outer, p[0], p[2]) && !blocked(C, p[0], p[2]) && (!Number.isFinite(y) || (y > base - 2.2 && y < base + 0.9));
  };
  let sDoor = e.L / 2;
  for (let j = 0; j < n; j++) {
    const s = (j + 0.5) / n * e.L + (r() - 0.5) * Math.max(0, Math.min(4, e.L / n - 2 * hw - 3));
    if (!clear(s, hw + 0.2)) continue;
    const yg = groundAt(gAt, e, s, base, 0.25), yt = yg + hG;
    D.setPart(DP.CONC).setColor(jit(CONC, r)); ebox(D, e, s - hw - 0.4, s + hw + 0.4, 0, 1.8, yg - 1.0, yg + 0.05, 1 | 16);
    D.setPart(DP.STEEL).setColor(POST);
    ebox(D, e, s - hw - 0.14, s - hw, 0, 0.1, yg, yt + 0.14, 1 | 8); ebox(D, e, s + hw, s + hw + 0.14, 0, 0.1, yg, yt + 0.14, 1 | 4);
    ebox(D, e, s - hw, s + hw, 0, 0.1, yt, yt + 0.14, 1 | 32);
    D.setPart(DP.PAINT).setColor(jit(gcol, r, 0.06)); ebox(D, e, s - hw, s, 0, 0.05, yg + 0.05, yt, 1);
    D.setColor(jit(gcol, r, 0.06)); ebox(D, e, s, s + hw, 0, 0.05, yg + 0.05, yt, 1);
    D.setColor(gcol.map((v) => v * 0.6)); ebox(D, e, s - hw, s + hw, 0.05, 0.09, yg + hG * 0.55 - 0.05, yg + hG * 0.55 + 0.05, 1 | 16);
    if (r() < 0.6) ebox(D, e, s + 0.3, s + 1.15, 0.05, 0.065, yg + 0.15, yg + Math.min(2.05, hG * 0.55 - 0.1), 1);
    C.c.gate++; sDoor = s + (r() < 0.5 ? -1 : 1) * (hw + 1.7);
  }
  if (!clear(sDoor, 0.8) || H - base < 2.6) return;
  const s = sDoor, yg = groundAt(gAt, e, s, base, 0.25), yT = yg + 0.12;
  D.setPart(DP.CONC).setColor(jit(CONC, r)); ebox(D, e, s - 0.7, s + 0.7, 0, 0.8, yg - 1.0, yT, 1 | 16);
  D.setPart(DP.PAINT).setColor(POST); ebox(D, e, s - 0.53, s + 0.53, 0, 0.06, yT, yT + 2.14, 1);
  D.setColor(jit(gcol, r, 0.06)); ebox(D, e, s - 0.45, s + 0.45, 0.06, 0.08, yT, yT + 2.06, 1);
  D.setPart(DP.GALV).setColor(hexL('#8e9296')); ebox(D, e, s - 0.75, s + 0.75, 0, 0.7, yT + 2.3, yT + 2.36, 1 | 16 | 32);
  if (r() < 0.7) { D.setPart(DP.LIGHT).setColor(LAMP); ebox(D, e, s - 0.12, s + 0.12, 0.06, 0.15, yT + 2.17, yT + 2.26, 1 | 32); C.c.lamp++; }
  C.c.ent++;
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

// townhouse row (A.row: OSM terrace or an untagged row in a cottage quarter, issue #45): per unit of two bays, mirrored in
// pairs, a front door with a sidelight on a step under a small canopy (it covers that bay's ground-floor window), and
// a party-wall rib up to the eaves between units, on both long sides; doors on the street-most long side
const ROWDOOR = [[3, hexL('#2E3134')], [2, hexL('#5B3A2E')], [1.5, hexL('#7A5536')], [1, hexL('#3F5F86')], [1, hexL('#3F6147')]];
function dressRow(C, D, S, A, outer, sg, base, H, r, fl) {
  const E = ringFrames(outer, sg, fl), maxL = Math.max(0, ...E.map((e) => e.L));
  const longE = E.filter((e) => e.L >= 9 && e.L >= 0.6 * maxL);
  if (!longE.length || H - base < 4) return;
  const front = longE.reduce((m, e) => (!m || e.f > m.f || (e.f === m.f && e.L > m.L) ? e : m), null);
  const dcol = pick(r, ROWDOOR), rib = jit(hexL('#D9D6CE'), r, 0.05), yf = base + A.plinth;
  for (const e of longE) {
    const { c, bw } = bays(e, A);
    if (c.length < 2) continue;
    for (let k = 0; k + 1 < c.length; k += 2) { // c runs from s = L downwards: bays k, k+1 are one unit
      if (k + 2 < c.length) { // party wall between this unit and the next
        const s = c[k + 1] - bw / 2;
        D.setPart(DP.PAINT).setColor(rib);
        ebox(D, e, s - 0.14, s + 0.14, 0, 0.14, base - 0.3, H, 1 | 4 | 8);
      }
      if (e !== front) continue;
      const s = c[(k >> 1) % 2 ? k + 1 : k], hw = Math.min(0.85, bw * 0.3); // mirrored pairs: doors meet at the party wall
      const p = W(e, s, 1.3, 0);
      if (inPoly(outer, p[0], p[2]) || blocked(C, p[0], p[2])) continue;
      D.setPart(DP.CONC).setColor(jit(CONC, r));
      ebox(D, e, s - hw - 0.25, s + hw + 0.25, 0, 0.9, base - 0.3, yf, 1 | 4 | 8 | 16);       // step
      D.setPart(DP.PAINT).setColor(jit(dcol, r, 0.05));
      ebox(D, e, s - hw, s + hw, 0, 0.05, yf, yf + 2.3, 1 | 4 | 8);                             // door + sidelight frame
      D.setPart(DP.GLASS);
      ebox(D, e, s + hw * 0.3, s + hw - 0.08, 0, 0.06, yf + 0.1, yf + 2.2, 1);                  // sidelight
      D.setPart(DP.PAINT).setColor(jit(dcol, r, 0.05));
      ebox(D, e, s - hw - 0.3, s + hw + 0.3, 0, 1.0, yf + 2.45, yf + 2.57, 1 | 4 | 8 | 16 | 32); // canopy
      eprism(S, e, s - hw - 0.3, s + hw + 0.3, -0.05, 1.0, yf + 2.45, yf + 2.57, 'awning', 1);
      C.c.ent++;
    }
  }
}

// private house (not a townhouse row): a front door with its frame on a step or a porch, in a pier between two windows
// of the street wall or a side wall, a canopy over some; a brick chimney through a pitched roof; on some a yellow gas
// pipe along the street wall. No collision: the steps are a kerb's height and the fences (fences.js) keep the car out.
const HDOOR = [[3, hexL('#5B3A2E')], [2.5, hexL('#3A2A22')], [2, hexL('#E4E2DA')], [1.5, hexL('#7A5536')], [1, hexL('#3F6147')], [1, hexL('#3F5F86')], [1, hexL('#2E3134')], [0.6, hexL('#6B2A2E')]];
const HFRAME = [[3, hexL('#ECEBE6')], [1.5, hexL('#4A3A30')], [1, hexL('#2E3134')]];
const CHIM = [[4, hexL('#8A4A38')], [2, hexL('#A8553E')], [1.5, hexL('#D9D5CB')], [1, hexL('#7C7A76')]];
const CANOPY = [[3, hexL('#5E4332')], [2, hexL('#3C3E42')], [2, hexL('#6D2C2A')], [1, hexL('#3E5E46')], [1.5, hexL('#B4B8BA')]];
// the piers of a windowed wall (between two bays, and at its two ends) wide enough for a door: [s of the pier's middle]
function piers(e, A, need) {
  const { c, bw } = bays(e, A), m = A.margin ?? 0.6, out = [];
  if (bw * (1 - A.winW) >= need) for (let k = 0; k + 1 < c.length; k++) out.push(c[k] - bw / 2);
  const end = m + bw * (1 - A.winW) / 2;
  if (end >= need + 0.25) out.push(end / 2 + 0.12, e.L - end / 2 - 0.12);
  return out;
}
function dressHouse(C, D, b, A, outer, sg, base, H, r, fl, pitched) {
  if (H - base < 2.6) return;
  const E = ringFrames(outer, sg, fl).filter((e) => e.L > 3);
  // the street-most edge longer than 3 m (ties: the longer one)
  const front = E.reduce((m, e) => (!m || e.f > m.f || (e.f === m.f && e.L > m.L) ? e : m), null);
  if (!front) return;
  // ---- the door: a side wall on most houses (the yard side of the gate), else the street wall
  const sides = E.filter((e) => e !== front && Math.abs(e.ux * front.ux + e.uz * front.uz) < 0.5);
  const order = r() < 0.55 && sides.length ? [sides[Math.floor(r() * sides.length)], front, ...sides] : [front, ...sides];
  // a third of the doors open at ground level (old houses: the door sits lower than the windows), the rest at the floor
  // line the windows count from, over a stoop or, on a few, a porch slab. Every triangle here is drawn out to 2.6 km
  // with the roofs and once more in the river mirror, hence the low shares
  const dw = 0.92 + (r() < 0.3 ? 0.1 : 0), canopy = r() < 0.25, u = r(), porch = u < 0.12, low = u > 0.65, framed = r() < 0.25;
  const yf = low ? base - 0.1 : base - 0.15 + A.plinth, hD = Math.min(2.08, H - yf - 0.3);
  let doorAt = null;
  for (const e of order) {
    if (hD < 1.85) break;
    const P = piers(e, A, dw + 0.36);
    for (let n = P.length, k = Math.floor(r() * n), t = 0; t < n && !doorAt; t++, k = (k + 1) % n) {
      const s = P[k], p = W(e, s, 1.1, 0);
      if (!inPoly(outer, p[0], p[2]) && !blocked(C, p[0], p[2])) doorAt = [e, s];
    }
    if (doorAt) break;
  }
  if (doorAt) {
    const [e, s] = doorAt, hw = dw / 2, dep = porch ? 0.95 : 0.5, sw = hw + (porch ? 0.45 : 0.22);
    D.setPart(DP.CONC).setColor(jit(CONC, r));
    if (porch) ebox(D, e, s - sw, s + sw, 0, dep, base - 0.7, yf, 1 | 4 | 8 | 16);           // porch slab (deep: the ground may fall)
    else if (!low) { // a stoop: one sloped face from the threshold to the ground
      const sl = 0.45 / Math.hypot(0.45, dep), cs = dep / Math.hypot(0.45, dep);
      q4(D, W(e, s - sw, 0, yf), W(e, s + sw, 0, yf), W(e, s + sw, dep, base - 0.25), W(e, s - sw, dep, base - 0.25), e.nx * sl, cs, e.nz * sl);
    }
    if (framed) {
      D.setPart(DP.PAINT).setColor(jit(pick(r, HFRAME), r, 0.04));
      ebox(D, e, s - hw - 0.08, s + hw + 0.08, 0, 0.03, yf, yf + hD + 0.08, 1);              // frame
    }
    D.setPart(r() < 0.35 ? DP.WOOD : DP.PAINT).setColor(jit(pick(r, HDOOR), r, 0.07));
    ebox(D, e, s - hw, s + hw, 0, 0.06, yf + 0.02, yf + hD, 1);                              // leaf
    if (canopy) {
      const yc = yf + hD + 0.2, cw = sw + 0.12, cd = dep + 0.15, col = jit(pick(r, CANOPY), r, 0.05);
      D.setPart(col[2] > col[0] * 1.02 && col[0] > 0.4 ? DP.GALV : DP.PAINT).setColor(col);
      // a pent canopy: 0.22 m of fall away from the wall, top and underside (the detail material is one-sided)
      const a = W(e, s - cw, 0, yc + 0.22), bq = W(e, s + cw, 0, yc + 0.22), cq = W(e, s + cw, cd, yc), dq = W(e, s - cw, cd, yc);
      const sl = 0.22 / Math.hypot(0.22, cd), cs = cd / Math.hypot(0.22, cd);
      q4(D, a, bq, cq, dq, e.nx * sl, cs, e.nz * sl); q4(D, a, bq, cq, dq, -e.nx * sl, -cs, -e.nz * sl);
    }
    C.c.hdoor = (C.c.hdoor ?? 0) + 1;
  }
  // ---- the chimney: a brick stack through the roof slope near the ridge (the roof of buildings.js pitchedRoof)
  if (pitched && r() < 0.27) {
    const o = obb(outer);
    if (o && o.W > 3) {
      const rise = Math.min(6, (o.W / 2) * (A.pitch ?? 0.5)), rl = A.roof === 'hip' ? Math.max(0, (o.L - o.W) / 2) : o.L / 2 - 0.8;
      const cs = (r() - 0.5) * 1.4 * Math.max(0, rl - 0.4), cq = (r() < 0.5 ? -1 : 1) * (0.12 + 0.22 * r()) * o.W / 2;
      const yRoof = H + rise * (1 - Math.abs(cq) / (o.W / 2)), y0 = yRoof - 0.45, y1 = Math.min(yRoof + 1.5, Math.max(yRoof + 0.65, H + rise + 0.2));
      const hs = 0.26 + r() * 0.08, hq = 0.2, vx = -o.uz, vz = o.ux, col = jit(pick(r, CHIM), r, 0.06);
      const at = (a, c) => [o.cx + o.ux * (cs + a * hs) + vx * (cq + c * hq), o.cz + o.uz * (cs + a * hs) + vz * (cq + c * hq)];
      const K = [[-1, -1], [1, -1], [1, 1], [-1, 1]], ring = (y, ny) => K.map(([a, c]) => {
        const [x, z] = at(a, c), dx = o.ux * a + vx * c, dz = o.uz * a + vz * c; // corner normals: four sides share eight vertices
        return D.vert(x, y, z, ny ? 0 : dx * 0.7071, ny, ny ? 0 : dz * 0.7071, (a + c) * 0.2, y);
      });
      D.setPart(DP.BRICK).setColor(col);
      const lo = ring(y0, 0), hi = ring(y1, 0);
      // a side's outward normal is (dz, -dx) of its edge when the ring has positive area; flip otherwise
      const pos = area2(K.map(([a, c]) => at(a, c))) > 0;
      for (let k = 0; k < 4; k++) { const n = (k + 1) % 4; if (pos) D.quad(lo[k], hi[k], hi[n], lo[n]); else D.quad(lo[k], lo[n], hi[n], hi[k]); }
      D.setPart(DP.PAINT).setColor([col[0] * 0.35, col[1] * 0.35, col[2] * 0.35]);
      const top = ring(y1, 1);
      if (pos) D.quad(top[0], top[3], top[2], top[1]); else D.quad(top[0], top[1], top[2], top[3]); // up
      C.c.chim = (C.c.chim ?? 0) + 1;
    }
  }
  // ---- the gas pipe along the street wall, over the windows and the door
  if (r() < 0.22) {
    const e = front, y = Math.min(base + 2.62, H - 0.2), s0 = 0.25, s1 = e.L - 0.25, o0 = 0.1, o1 = 0.17, rs = r() < 0.5 ? s0 : s1 - 0.07;
    D.setPart(DP.PAINT).setColor(jit(GAS, r, 0.06));
    ebox(D, e, s0, s1, o0, o1, y, y + 0.07, 1);                // run along the wall
    ebox(D, e, rs, rs + 0.07, o0, o1, base - 0.8, y, 1);      // riser from the ground
    C.c.gas++;
  }
}
// shed, summer kitchen, outhouse: a plank or steel door on its street-most (else longest) wall
const SDOOR = [[3, hexL('#6E5238')], [2, hexL('#4A3A30')], [2, hexL('#3F6147')], [1.5, hexL('#7C7F80')], [1, hexL('#3F5F86')], [1, hexL('#8A4A2A')]];
function dressShed(C, D, outer, sg, base, H, r, fl) {
  if (r() > 0.7) return;
  const hD = Math.min(1.95, H - base - 0.25);
  if (hD < 1.5) return;
  const E = ringFrames(outer, sg, fl).filter((e) => e.L > 1.5).sort((a, c) => c.f - a.f || c.L - a.L);
  for (const e of E.slice(0, 3)) {
    const wide = e.L > 4.2 && r() < 0.3, hw = wide ? 1.05 : Math.min(0.42, e.L / 2 - 0.25), s = wide ? e.L / 2 : hw + 0.25 + r() * (e.L - 2 * hw - 0.5);
    const p = W(e, s, 0.9, 0);
    if (inPoly(outer, p[0], p[2]) || blocked(C, p[0], p[2])) continue;
    D.setPart(r() < 0.55 ? DP.WOOD : DP.PAINT).setColor(jit(pick(r, SDOOR), r, 0.1));
    ebox(D, e, s - hw, s + hw, 0, 0.04, base - 0.1, base - 0.1 + hD, 1);
    C.c.sdoor = (C.c.sdoor ?? 0) + 1;
    return;
  }
}

// ---------------------------------------------------------------------------------------------- entry
const INS_K = typeof location !== 'undefined' && /[?&]insdbg\b/.test(location.search) ? 8 : 1; // debug: ?insdbg = 8x the insulated flats
const OFF = typeof location !== 'undefined' && /[?&]nokit\b/.test(location.search); // A/B: ?nokit skips the kit
export function dressBuilding({ t, S, Z, b, A, outer, holes, base, H, r, pitched, heightAt = null, roadAt = null }) {
  void Z; void holes;
  if (OFF) return;
  const C = begin(S), t0 = performance.now(), D = t.det, v0 = D.v, n0 = S.count ?? 0;
  C.roadAt = roadAt;
  const sg = area2(outer) >= 0 ? 1 : -1, fl = b.f ?? '';
  // the generator's `plus` pass ran on this building (A.entr): small things go to the near builder
  const Dn = A.entr && t.near ? t.near : D, vn0 = Dn.v;
  try {
    if (b.k === 'apt' || (b.k === 'public' && b.lv >= 2)) dressApt(C, D, Dn, S, b, A, outer, sg, base, H, r, pitched, fl, heightAt);
    else if (b.k === 'garage') dressGarage(C, D, b, A, outer, sg, base, H, r, fl);
    else if (b.k === 'house' && A.row) dressRow(C, D, S, A, outer, sg, base, H, r, fl);
    else if (b.k === 'house') dressHouse(C, D, b, A, outer, sg, base, H, r, fl, pitched);
    else if (b.k === 'shed') dressShed(C, D, outer, sg, base, H, r, fl);
    if (A.entr && b.k === 'public') dressPublic(C, Dn, S, A, outer, sg, base, r, fl, heightAt);
    else if (A.entr && b.k === 'indus') dressIndus(C, Dn, A, outer, sg, base, H, r, fl, heightAt);
  } finally {
    addFoot(C, outer);
    const vn = Dn === D ? 0 : Dn.v - vn0;
    C.n++; C.v += D.v - v0 + vn; C.vn += vn; C.s += (S.count ?? 0) - n0; C.ms += performance.now() - t0;
  }
}
