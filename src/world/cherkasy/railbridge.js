// OWNER: cherkasy. The raised railway east of the centre and its four road underpasses (issue #24): from the curve by
// vul. Smilianska the double-track line to the dam and the Dnipro bridge runs north-west on an embankment (OSM
// embankment=yes on every way between) and crosses vul. Smilianska, vul. Baidy Vyshnevetskoho, vul. Mykhaila
// Hrushevskoho and vul. Sumhaitska on short beam bridges (OSM bridge=yes, layer 1: ways 72051300 / 155426856 +
// 1174016219, 72051298 / 155424394, 72051303 / 155424236 + 1185709410, 72051301 / 155424123 + 1274246077 + 1185514333);
// the streets pass under (vul. Smilianska: maxheight 3.5). The DEM (~30 m SRTM) has no embankment, so before this module
// the tracks lay on the street at grade. Built after the Wikimedia Commons photo «Шляхопровід над вул. Смілянською»
// (2019): a grey concrete beam deck with a thin black railing on rows of paired round columns under cap beams set
// along the street, concrete-paved slopes under the deck ends, grassy embankment slopes beside the line.
//   railLevelFn(geo, heightAt) -> (x, z) -> rail bed level | null   the line's level (GRADE, along LINE) within reach of
//     its tracks, or null off the line; station_rails.js buildRails({ railLevel }) lays every track there at it
//   buildRailBridges({ root, map, solids, heightAt, geo, ground, detailMat }) -> { update(), clear(x, z), bridges } | null
//     The embankment: a mesh in the ground's own material (grass slopes, a gravel top), 1:SLOPE sides that stop at a
//     retaining wall where a street or a building is nearer than the slope's foot; collision as planar prisms (the top and
//     the slopes, gentle enough to drive up). At each street (BRIDGES) the embankment ends in concrete-paved slopes
//     parallel to the street, from the walk's outer edge up to the deck; the deck (beams, parapets, railing) spans
//     them on pier rows along the kerbs (OVERHANG collision: the car drives under it, or on it with a height hint).
//     bridges: [{ id, name, at: [x, z], span: [s0, s1], clear, deckAt(x, z) }] where the line crosses the street, the deck's
//       ends along LINE, its least clearance over the street and walks, its top
//     clear(x, z): no generated trees on the embankment.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { DP } from '../materials.js';
import { OVERHANG } from '../collision.js';
import { fin, along, frame, cumulate, pointAt, grade, sboxer, topMesh, groundMat } from './bridgekit.js';
import { SURF } from './ground.js';
import { inPoly } from './geo.js';

// the south-western track's centre line (OSM), from the curve south of vul. Smilianska to past vul. Sumhaitska
const LINE = [[49.4291435, 32.0536602], [49.4293969, 32.0537846], [49.4296782, 32.0539024], [49.4299184, 32.0539781], [49.4302356, 32.0540526],
  [49.4305713, 32.0540962], [49.4309163, 32.0540989], [49.4312606, 32.0540676], [49.431499, 32.0540211], [49.4320359, 32.0538555],
  [49.4323964, 32.0536832], [49.4326352, 32.0535439], [49.433044, 32.0532433], [49.4335618, 32.0527672], [49.4341135, 32.0520313],
  [49.436184, 32.0480924], [49.4364274, 32.0476438], [49.4393432, 32.0423386], [49.4396209, 32.0418244], [49.441104, 32.0391193],
  [49.4412459, 32.0388604], [49.4425345, 32.0365137], [49.4426516, 32.0363002], [49.4457339, 32.0306901], [49.4459483, 32.0302987],
  [49.4461086, 32.0300059], [49.4474148, 32.0276255], [49.447884, 32.0267703]];
// the bed level along LINE (arc m from its first point -> m): the ground at both ends (null), a gentle grade between
// that clears every street by ~4.4 m under the deck; the DEM along the line wanders 25–34 m, so the bank runs 0–9 m
const GRADE = [[150, null], [275, 32.8], [424, 35.3], [984, 35.3], [1532, 36.3], [2250, 36.2], [2646, 35.6], [2760, 34.6], [2960, null]];
// the streets under it: OSM name, arc along LINE where it crosses
const BRIDGES = [
  { id: 'smilianska', name: 'Смілянська вулиця', s: 424 },
  { id: 'vyshnevetskoho', name: 'вулиця Байди Вишневецького', s: 984 },
  { id: 'hrushevskoho', name: 'вулиця Михайла Грушевського', s: 1532 },
  { id: 'sumhaitska', name: 'Сумгаїтська вулиця', s: 2646 },
];
const STEP = 4;           // embankment sections along the line (m)
const TOP = 3.0;          // the top reaches this far past the outer tracks' centres (the bed toe is 2.55)
const SLOPE = 1.75;       // side slopes 1 : SLOPE (gentle enough for the car to climb: collision walkSlope 0.6)
const WALK = 4.5;         // the walks beside a street under a deck: the paved slopes start past them
const DK = { depth: 1.1, par: 0.55, rail: 1.25 };
const C = { conc: '#a3a19b', concDark: '#86847f', rail: '#26282b', wall: '#9a988f' };

// ------------------------------------------------------------------------------------------------ the line
let LEVEL = null; // { P, cum, len, s0, s1, G, H } once railLevelFn ran
function lineOf(geo, heightAt) {
  if (LEVEL?.geo === geo) return LEVEL;
  const P = LINE.map(([la, lo]) => geo.toXZ(la, lo)), cum = cumulate(P), len = cum[cum.length - 1];
  const H = (s) => fin(heightAt(...pointAt(P, cum, s).slice(0, 2)));
  const G = GRADE.map(([s, y]) => [Math.min(s, len - 1), y ?? H(Math.min(s, len - 1))]);
  return (LEVEL = { geo, P, cum, len, G, s0: G[0][0], s1: G[G.length - 1][0], H });
}
// bed level at arc s: the grade, never under the ground
const levelAt = (L, s) => Math.max(grade(L.G, s), L.H(s));
export function railLevelFn(geo, heightAt) {
  if (!geo) return null;
  const L = lineOf(geo, heightAt);
  return (x, z) => {
    const { d, s } = along(L.P, x, z);
    return d < 9 && s > L.s0 && s < L.s1 ? levelAt(L, s) : null;
  };
}

// ------------------------------------------------------------------------------------------------ site
export function buildRailBridges({ root, map, solids: S, heightAt, geo, ground, detailMat }) {
  if (!geo || !map?.rails) return null;
  const t0 = performance.now();
  const L = lineOf(geo, heightAt), { P, cum } = L;
  const g = (x, z) => fin(heightAt(x, z));
  const lv = (s) => levelAt(L, s);

  // ---- what is near the line: the other tracks (their offsets), the streets under the decks, streets and buildings
  // beside it (the slopes stop short of them)
  const lb = [Math.min(...P.map((p) => p[0])) - 60, Math.min(...P.map((p) => p[1])) - 60, Math.max(...P.map((p) => p[0])) + 60, Math.max(...P.map((p) => p[1])) + 60];
  const near = (pts, r) => pts.some(([x, z]) => {
    if (x < lb[0] || x > lb[2] || z < lb[1] || z > lb[3]) return false;
    const q = along(P, x, z); return q.d < r && q.s > L.s0 - 20 && q.s < L.s1 + 20;
  });
  const inBox = (p) => { for (let i = 0; i < p.length; i += 2) if (p[i] > lb[0] && p[i] < lb[2] && p[i + 1] > lb[1] && p[i + 1] < lb[3]) return true; return false; };
  const ring = (p) => { const out = []; for (let i = 0; i < p.length; i += 2) out.push([p[i], p[i + 1]]); return out; };
  const tracks = map.rails.filter((r) => inBox(r.p)).map((r) => ring(r.p)).filter((R) => near(R, 10)).map((R) => ({ R, cum: cumulate(R) }));
  const bridges = BRIDGES.map((b) => {
    const [cx, cz] = pointAt(P, cum, b.s);
    const ways = (map.roads ?? []).filter((r) => r.n === b.name && r.k === 'm' && inBox(r.p)).map((r) => ({ L: ring(r.p), w: r.w ?? 8 })).filter((r) => r.L.some(([x, z]) => Math.hypot(x - cx, z - cz) < 160));
    if (!ways.length) return null;
    const w = Math.max(...ways.map((r) => r.w));
    return { ...b, ways, w, reach: w / 2 + WALK, dRoad: (x, z) => Math.min(...ways.map((r) => along(r.L, x, z).d)) };
  }).filter(Boolean);
  const under = new Set(bridges.flatMap((b) => b.ways.map((r) => r.L)));
  // obstacles by 16 m cell: street segments (with their half widths) and building rings
  const CELL = 16, cells = new Map(), key = (i, j) => i * 65536 + j;
  const put = (x0, z0, x1, z1, o) => {
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
      const k = key(i, j); let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(o);
    }
  };
  for (const r of map.roads ?? []) {
    if (r.k !== 'm' || r.br || bridges.some((b) => b.name === r.n) || !inBox(r.p)) continue;
    const R = ring(r.p), hw = (r.w ?? 6) / 2 + 0.6;
    if (!near(R, 45)) continue;
    for (let k = 1; k < R.length; k++) { const [ax, az] = R[k - 1], [bx, bz] = R[k]; put(Math.min(ax, bx) - hw, Math.min(az, bz) - hw, Math.max(ax, bx) + hw, Math.max(az, bz) + hw, { seg: [R[k - 1], R[k]], hw }); }
  }
  for (const b of map.buildings ?? []) {
    if (!b.p || !inBox(b.p)) continue;
    const R = ring(b.p);
    if (R.length < 3 || !near(R, 45)) continue;
    put(Math.min(...R.map((p) => p[0])), Math.min(...R.map((p) => p[1])), Math.max(...R.map((p) => p[0])), Math.max(...R.map((p) => p[1])), { poly: R });
  }
  const blocked = (x, z) => (cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []).some((o) => (o.seg ? along(o.seg, x, z).d < o.hw : inPoly(o.poly, x, z)));

  // ---- sections: the line's point and heading, the top's edges, the bank height at the top edges, the wall lines
  const N = Math.ceil((L.s1 - L.s0) / STEP), secs = [];
  for (let k = 0; k <= N; k++) {
    const s = L.s0 + (L.s1 - L.s0) * k / N;
    const [x, z] = pointAt(P, cum, s), a = pointAt(P, cum, Math.max(0, s - 2)), b = pointAt(P, cum, Math.min(L.len, s + 2));
    let dx = b[0] - a[0], dz = b[1] - a[1]; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const nx = -dz, nz = dx;
    const offs = [0];
    for (const { R, cum: rc } of tracks) { const q = along(R, x, z); if (q.d < 9) { const [px, pz] = pointAt(R, rc, q.s); offs.push((px - x) * nx + (pz - z) * nz); } }
    const oL = Math.min(...offs) - TOP, oR = Math.max(...offs) + TOP, y = lv(s);
    const at = (o) => [x + nx * o, z + nz * o];
    // the top under a deck: the paved slope rising from the walk's edge (a plane parallel to the street)
    const br = bridges.find((q) => Math.abs(s - q.s) < 80);
    const memo = new Map();
    const topY = (o) => {
      if (!br) return y;
      let v = memo.get(o);
      if (v === undefined) { const [px, pz] = at(o); v = Math.min(y, g(px, pz) + Math.max(0, br.dRoad(px, pz) - br.reach) / SLOPE); memo.set(o, v); }
      return v;
    };
    const side = (sg) => { // the slope from the top edge out: its foot, or a wall line short of an obstacle
      const o0 = sg < 0 ? oL : oR, yt = topY(o0), [ex, ez] = at(o0), h = yt - g(ex, ez);
      if (h <= 0.02) return { o0, yt, oF: o0, wall: false };
      const run = h * SLOPE;
      for (let r = 0.5; r <= run; r += 0.75) { if (blocked(...at(o0 + sg * r))) return { o0, yt, oF: o0 + sg * Math.max(0.3, r - 0.6), wall: true }; }
      return { o0, yt, oF: o0 + sg * run, wall: false };
    };
    secs.push({ s, x, z, nx, nz, oL, oR, y, at, topY, br, L: side(-1), R: side(1) });
  }

  // ---- the decks: where the top sinks under the bed level, plus a bearing either side
  for (const b of bridges) {
    const inS = secs.filter((q) => q.br === b && (q.topY(q.oL) < q.y - 0.05 || q.topY(q.oR) < q.y - 0.05 || q.topY((q.oL + q.oR) / 2) < q.y - 0.05));
    b.span = inS.length ? [inS[0].s - STEP - 0.8, inS[inS.length - 1].s + STEP + 0.8] : null;
  }
  const deckOf = (s) => bridges.find((b) => b.span && s >= b.span[0] && s <= b.span[1]);

  // ---------------------------------------------------------------- the embankment mesh and its collision
  const top = topMesh(), det = new MB(), bars = new MB();
  const nrm = (a, b, c) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1; return n[1] < 0 ? n.map((q) => -q / l) : n.map((q) => q / l); };
  const quad = (p, surf, n = nrm(p[0], p[1], p[2])) => top.quad(p, n, surf);
  const V = (q, o, y) => { const [x, z] = q.at(o); return [x, y, z]; };
  const footY = (q, o) => g(...q.at(o)) - 0.4;
  let prisms = 0, walls = 0;
  for (let k = 0; k < N; k++) {
    const a = secs[k], b = secs[k + 1];
    const paved = !!(a.br || b.br) && (deckOf(a.s) || deckOf(b.s));
    // the top: across in four strips (so the paved slopes under a deck tilt with the street), gravel or paving
    const O = (q, f) => q.oL + (q.oR - q.oL) * f;
    for (let i = 0; i < 4; i++) {
      const f0 = i / 4, f1 = (i + 1) / 4;
      const p = [V(a, O(a, f0), a.topY(O(a, f0))), V(b, O(b, f0), b.topY(O(b, f0))), V(b, O(b, f1), b.topY(O(b, f1))), V(a, O(a, f1), a.topY(O(a, f1)))];
      if (Math.max(...p.map((v) => v[1] - g(v[0], v[2]))) < 0.03) continue;
      quad(p, paved ? SURF.CONCRETE : SURF.DIRT);
    }
    // the sides: slope to the foot, or slope + retaining wall
    for (const [sa, sb] of [[a.L, b.L], [a.R, b.R]]) {
      const pa = V(a, sa.o0, sa.yt), pb = V(b, sb.o0, sb.yt);
      const ya = (q, sd) => sd.wall ? sd.yt - Math.abs(sd.oF - sd.o0) / SLOPE : footY(q, sd.oF);
      const fa = V(a, sa.oF, ya(a, sa)), fb = V(b, sb.oF, ya(b, sb));
      if (Math.max(pa[1] - g(pa[0], pa[2]), pb[1] - g(pb[0], pb[2])) < 0.03) continue;
      quad([pa, pb, fb, fa], paved ? SURF.CONCRETE : SURF.GRASS);
      if (sa.wall || sb.wall) { // the wall face down to the ground
        walls++;
        det.setColor(C.wall).setPart(DP.CONC);
        const wa = V(a, sa.oF, footY(a, sa)), wb = V(b, sb.oF, footY(b, sb));
        det.face([fa, fb, wb, wa]);
      }
    }
    // collision: the top as one planar piece (in strips under a deck, where the paved slopes tilt), each slope as one
    // (gentle: driven up)
    if (paved) {
      for (let i = 0; i < 4; i++) {
        const f0 = i / 4, f1 = (i + 1) / 4, pts = [V(a, O(a, f0), a.topY(O(a, f0))), V(b, O(b, f0), b.topY(O(b, f0))), V(b, O(b, f1), b.topY(O(b, f1))), V(a, O(a, f1), a.topY(O(a, f1)))];
        if (Math.max(...pts.map((v) => v[1] - g(v[0], v[2]))) > 0.2) prisms += planar(S, pts, g);
      }
    } else prisms += planar(S, [V(a, a.oL, a.topY(a.oL)), V(b, b.oL, b.topY(b.oL)), V(b, b.oR, b.topY(b.oR)), V(a, a.oR, a.topY(a.oR))], g);
    for (const [sa, sb] of [[a.L, b.L], [a.R, b.R]]) {
      if (Math.abs(sa.oF - sa.o0) < 0.3 && Math.abs(sb.oF - sb.o0) < 0.3) continue;
      const ya = (sd) => sd.yt - Math.abs(sd.oF - sd.o0) / SLOPE;
      prisms += planar(S, [V(a, sa.o0, sa.yt), V(b, sb.o0, sb.yt), V(b, sb.oF, ya(sb)), V(a, sa.oF, ya(sa))], g);
    }
  }

  // ---------------------------------------------------------------- the decks, piers and railings
  const col = (c, part = DP.CONC) => det.setColor(c).setPart(part);
  for (const b of bridges) {
    if (!b.span) continue;
    const [sa, sb] = b.span, A0 = pointAt(P, cum, sa), A1 = pointAt(P, cum, sb);
    const F = frame([A0[0], A0[1]], [A1[0], A1[1]]), sbx = sboxer(F), Lb = F.L;
    // the deck is straight between its ends; its width from the sections inside
    const inside = secs.filter((q) => q.s >= sa && q.s <= sb);
    const oL = Math.min(...inside.map((q) => q.oL)) + 0.2, oR = Math.max(...inside.map((q) => q.oR)) - 0.2;
    const y0 = lv(sa), y1 = lv(sb), Y = (t) => y0 + (y1 - y0) * t / Lb;
    const at = (dy) => (t) => Y(t) + dy;
    b.deck = { F, oL, oR, Y };
    col(C.conc);
    sbx(det, 0, Lb, oL, oR, at(-DK.depth), at(-0.02), 4 | 8 | 16 | 32);
    for (const [p, q] of [[oL - 0.35, oL], [oR, oR + 0.35]]) sbx(det, 0, Lb, p, q, at(-DK.depth - 0.1), at(DK.par));
    col(C.concDark);
    for (let o = oL + 0.9; o < oR - 0.5; o += 1.6) sbx(det, 0.3, Lb - 0.3, o - 0.3, o + 0.3, at(-DK.depth - 0.15), at(-DK.depth + 0.01), 1 | 2 | 8);
    // the thin black railing: posts every 2 m, a top rail and a mid rail
    det.setColor(C.rail).setPart(DP.PAINT);
    for (const o of [oL - 0.17, oR + 0.17]) {
      for (let t = 0.1; t <= Lb; t += 2) sbx(det, t - 0.03, t + 0.03, o - 0.03, o + 0.03, at(DK.par), at(DK.rail), 1 | 2 | 16 | 32);
      sbx(det, 0, Lb, o - 0.03, o + 0.03, at(DK.rail - 0.05), at(DK.rail), 1 | 2 | 4 | 8);
      sbx(det, 0, Lb, o - 0.02, o + 0.02, at(DK.par + 0.35), at(DK.par + 0.39), 1 | 2 | 4 | 8);
    }
    // collision: the deck as an overhang (bottom at the lower end), the parapets
    const k = (y1 - y0) / Lb, bx = k * F.ux, bz = k * F.uz, pa = y0 - bx * F.P[0] - bz * F.P[1];
    S.prism([F.at(0, oL - 0.35), F.at(Lb, oL - 0.35), F.at(Lb, oR + 0.35), F.at(0, oR + 0.35)], Math.min(y0, y1) - DK.depth - 0.15, pa, bx, bz, 'bridge', OVERHANG);
    for (const o of [oL - 0.17, oR + 0.17]) { const [cx, cz] = F.at(Lb / 2, o); S.obox(cx, cz, Lb / 2, 0.18, F.ang, Math.min(y0, y1) - DK.depth, Math.max(y0, y1) + DK.rail, 'rail'); }
    // pier rows along the street just outside the walks' outer edges (none in the carriageway: the traffic does not
    // steer round them), each a pair of round columns under a cap beam running with the street
    const rowsAt = [-b.reach - 0.8, b.reach + 0.8];
    const cols = [oL + 1.4, oR - 1.4];
    const Cp = pointAt(P, cum, b.s);
    let best = null; // the street's heading at the crossing
    for (const r of b.ways) for (let i = 1; i < r.L.length; i++) {
      const [ax, az] = r.L[i - 1], [cx2, cz2] = r.L[i], d = along([r.L[i - 1], r.L[i]], Cp[0], Cp[1]).d;
      if (!best || d < best.d) { const l = Math.hypot(cx2 - ax, cz2 - az); best = { d, nx: -(cz2 - az) / l, nz: (cx2 - ax) / l }; }
    }
    b.rows = 0;
    const capLo = -DK.depth - 0.85, un = F.ux * best.nx + F.uz * best.nz;
    for (const q of Math.abs(un) > 0.2 ? rowsAt : []) {
      // where the deck's line o = c meets the row line (street offset q, the street taken straight through the crossing)
      const pts = cols.map((c) => { const [x, z] = F.at(0, c), t = (q - ((x - Cp[0]) * best.nx + (z - Cp[1]) * best.nz)) / un; return [t, ...F.at(t, c)]; }).filter(([t]) => t > 0.5 && t < Lb - 0.5);
      if (pts.length < 2) continue;
      const topY = Math.min(...pts.map(([t]) => Y(t))) + capLo;
      if (pts.some(([, x, z]) => topY - g(x, z) < 1.2)) continue; // on the paved slope already: the slope carries the deck there
      b.rows++;
      // the cap beam, from column to column and a little past
      const [[, ax, az], [, cx2, cz2]] = pts, cl = Math.hypot(cx2 - ax, cz2 - az), ux = (cx2 - ax) / cl, uz = (cz2 - az) / cl;
      const CF = frame([ax - ux * 0.9, az - uz * 0.9], [cx2 + ux * 0.9, cz2 + uz * 0.9]), csb = sboxer(CF);
      col(C.conc);
      csb(det, 0, CF.L, -0.6, 0.6, () => topY, () => topY + 0.85);
      S.obox((ax + cx2) / 2, (az + cz2) / 2, CF.L / 2, 0.6, CF.ang, topY, topY + 0.85, 'pier');
      for (const [, x, z] of pts) {
        const foot = g(x, z) - 0.3;
        det.setColor(C.conc).setPart(DP.CONC).cyl(x, foot, z, 0.45, 0.45, topY - foot + 0.02, 12, false);
        S.cyl(x, z, foot, topY, 0.45, 0.45, 'pier');
      }
    }
    // the least clearance over the street (and its walks) under the deck
    let clr = Infinity;
    for (let t = 0; t <= Lb; t += 0.5) for (let o = oL; o <= oR; o += 1) { const [x, z] = F.at(t, o); if (b.dRoad(x, z) < b.reach) clr = Math.min(clr, Y(t) - DK.depth - 0.15 - g(x, z)); }
    b.clear = clr;
  }

  // ---------------------------------------------------------------- meshes
  const group = Object.assign(new THREE.Group(), { name: 'railbridges' });
  root.add(group);
  const topM = top.mesh(groundMat(ground) ?? new THREE.MeshStandardMaterial({ color: 0x7d8a5a, roughness: 0.95 }), 'railbank');
  if (topM) { topM.castShadow = false; group.add(topM); }
  const mat = detailMat ?? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  if (det.v) group.add(Object.assign(new THREE.Mesh(det.build({ part: true }), mat), { name: 'railbridges-structure', castShadow: true, receiveShadow: true }));
  console.log(`[cherkasy] railway embankment: ${(L.s1 - L.s0).toFixed(0)} m (${N} sections, ${walls} wall pieces, ${prisms} prisms); bridges ${bridges.map((b) => `${b.id} ${b.span ? (b.span[1] - b.span[0]).toFixed(0) + ' m, ' + b.rows + ' pier rows, clearance ' + b.clear.toFixed(1) + ' m' : 'none'}`).join('; ')}; ${((det.v + top.v) / 1000).toFixed(1)}k verts in ${(performance.now() - t0).toFixed(0)} ms`);

  // trees: off the bank (its top and slopes)
  const xs = secs.flatMap((q) => [q.at(q.L.oF), q.at(q.R.oF)]);
  const bb = [Math.min(...xs.map((p) => p[0])) - 3, Math.min(...xs.map((p) => p[1])) - 3, Math.max(...xs.map((p) => p[0])) + 3, Math.max(...xs.map((p) => p[1])) + 3];
  return {
    bridges: bridges.map((b) => ({ id: b.id, name: b.name, at: pointAt(P, cum, b.s).slice(0, 2), span: b.span, clear: b.clear, deckAt: b.deck ? (x, z) => { const [t, o] = b.deck.F.to(x, z); return t >= 0 && t <= b.deck.F.L && o >= b.deck.oL && o <= b.deck.oR ? b.deck.Y(t) : null; } : null })),
    clear: (x, z) => {
      if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) return false;
      const { d, s } = along(P, x, z);
      if (s <= L.s0 || s >= L.s1) return false;
      const q = secs[Math.min(N, Math.max(0, Math.round((s - L.s0) / (L.s1 - L.s0) * N)))];
      const o = (x - q.x) * q.nx + (z - q.z) * q.nz;
      return o > q.L.oF - 1.5 && o < q.R.oF + 1.5 && d < 40;
    },
    update() {},
  };
}

// a planar collision prism through a quad's corners [[x, y, z] x 4]: footprint the quad, top the plane through three
// of them (least squares would be finer; the quads here are near planar), solid down to under the ground
function planar(S, p, g) {
  const [a, b, c] = [p[0], p[1], p[2]];
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (Math.abs(ny) < 1e-6) return 0;
  const bx = -nx / ny, bz = -nz / ny, a0 = a[1] - bx * a[0] - bz * a[2];
  const lo = Math.min(...p.map((q) => Math.min(q[1], g(q[0], q[2])))) - 1;
  return S.prism(p.map((q) => [q[0], q[2]]), lo, a0, bx, bz, 'bank') >= 0 ? 1 : 0;
}
