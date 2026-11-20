// Fence compiler: the raw OpenStreetMap barriers (tools/cherkasy/raw/poi.json: way["barrier"]) + the compiled map
// (public/assets/cherkasy/map.json, map_buildings.json) -> public/assets/cherkasy/map_fences.json, the fences, walls,
// hedges and gates the game draws (src/world/cherkasy/fences.js). Same frame as map.json. Map data (c) OpenStreetMap
// contributors, ODbL. Deterministic; about 10 s.
//
//   node tools/cherkasy/build_fences.mjs [rawDir]      rawDir: where poi.json lies (default tools/cherkasy/raw/)
//
// What it does
//   1. OSM fences / walls / hedges (not kerbs, retaining walls, guard rails; nothing under 0.7 m; no way a hand-built
//      site names by id): simplified, then typed from the tags (fence_type, material, wall, leisure, amenity, landuse)
//      or, untagged, from the buildings around: among houses a private lot's fence, among sheds and plants a concrete
//      slab wall, among flats and public buildings steel bars.
//   2. Street fronts: a stretch that runs along a street within 9 m of its kerb. One standing on the game's pavement
//      band is moved back to the band's edge (the game's streets are wider than a lane between two fences); every
//      other fence is cut where it enters a street's carriageway or pavement, crosses a driveway, a footway or a dirt
//      track, or runs through a building. A driveway through a front leaves an open gate. A front also stops where a
//      building stands within 1.5 m behind it: a house or a garage on the street line is the front itself. A tagged
//      height over 4 m is capped (8 m and more is taken for a typo).
//   3. Generated fronts: where a house (not a townhouse row) stands by a street and OSM has no fence along it, a
//      fence line on the pavement's edge across the house's lot, cut the same way (and by car parks and rails).
//   4. Lots: a private front is split into lots at the side fences that join it (else between the houses behind it);
//      each lot gets its own fence type, colour seed and height, and a gate with a wicket where there is room.
//
// Output: { attribution, frame, region, unit: 0.1, kinds: [names], stats, d: [flat integers] }
//   d holds the pieces one after another: kind, seed (0..255), height (dm), flags, n, x0, z0, then n - 1 (dx, dz)
//   pairs; coordinates in decimetres from the region's (x0, z0) corner. flags: 1 = a street front (posts are built in
//   3D), 2 = generated (not in OSM). A front runs so that the lot is on its left; 'gateopen' is the 2-point opening of
//   a driveway (posts and two open leaves), 'gate' / 'oldgate' a closed double gate, 'wicket' / 'oldwicket' a door.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { simplify, pointInRing, GridIndex, boundsOf } from './geom2d.mjs';
import { openLeaves } from '../../src/world/cherkasy/fencework.js';

export const KINDS = ['sheet', 'sheetbrick', 'plank', 'picket', 'slate', 'brick', 'euro', 'mesh', 'slab', 'bars', 'forged', 'hedge',
  'gate', 'wicket', 'oldgate', 'oldwicket', 'gateopen'];
const K = Object.fromEntries(KINDS.map((k, i) => [k, i]));

const here = (p) => new URL(p, import.meta.url);
const rawDir = process.argv[2] ? new URL(process.argv[2].replace(/\/?$/, '/'), `file://${process.cwd()}/`) : here('./raw/');
const map = JSON.parse(readFileSync(here('../../public/assets/cherkasy/map.json')));
const buildings = JSON.parse(readFileSync(here('../../public/assets/cherkasy/map_buildings.json')));
const poi = JSON.parse(readFileSync(new URL('poi.json', rawDir))).elements;
const t0 = Date.now();

const { frame: FRAME, region: REGION } = map;
const KY = 111320, KX = 111320 * Math.cos(FRAME.lat0 * Math.PI / 180);
const CR = Math.cos(FRAME.rot * Math.PI / 180), SR = Math.sin(FRAME.rot * Math.PI / 180);
const proj = (lat, lon) => { const e = (lon - FRAME.lon0) * KX, n = (lat - FRAME.lat0) * KY; return [e * CR + n * SR, e * SR - n * CR]; };
const inRegion = (x, z, m = 0) => x >= REGION.x0 - m && x <= REGION.x1 + m && z >= REGION.z0 - m && z <= REGION.z1 + m;
const pts = (F) => { const P = []; for (let i = 0; i + 1 < F.length; i += 2) P.push([F[i], F[i + 1]]); return P; };
const hash = (a, b = 0) => { let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x7f4a7c15, 0xc2b2ae35); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; };
const pick = (u, list) => { let x = u * list.reduce((s, q) => s + q[0], 0); for (const q of list) { x -= q[0]; if (x <= 0) return q[1]; } return list.at(-1)[1]; };
// closest point of segment a-b to p: [distance, t along (0..1), x, z]
function segNear(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  let t = L2 > 1e-12 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t, z = az + dz * t;
  return [Math.hypot(px - x, pz - z), t, x, z];
}
const lenOf = (P) => { let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return L; };

// ------------------------------------------------------------------------------------------------ roads
const MAIN = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'motorway', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
const WALKED = new Set(['residential', 'living_street', 'unclassified']); // build_map.mjs walkLines: these and MAIN get a pavement band
const roads = map.roads.map((r, id) => {
  const P = pts(r.p), L = lenOf(P), c = r.c ?? '';
  const walk = r.k === 'm' ? (MAIN.has(c) ? 4.5 : WALKED.has(c) ? 2.6 : 0) : 0;
  // a street: houses front on it. Service ways count when they are a lane (full width, long), not a driveway
  const street = !r.br && (r.k === 'm' || r.k === 'd') && (MAIN.has(c) || WALKED.has(c) || c === 'road' || (c === 'service' && r.w >= 4.4 && L >= 50));
  const drive = r.k === 'm' && !street; // driveways, parking aisles, alleys, short service stubs
  // corridor: what a fence keeps out of (carriageway + the pavement band, or a verge: 2 m by a street, 0.9 m in a lane)
  const cor = street ? r.w / 2 + (walk || (c === 'service' ? 0.9 : 2)) + 0.3 : r.k === 'm' ? r.w / 2 + 0.35 : r.k === 'd' ? r.w / 2 + 0.3 : r.w / 2 + 0.3;
  return { id, P, w: r.w, k: r.k, c, L, walk, street, drive, cor };
});
const segIdx = new GridIndex(64);
for (const r of roads) for (let i = 1; i < r.P.length; i++) {
  const a = r.P[i - 1], b = r.P[i];
  segIdx.insert(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), { r, i, a, b, L: Math.hypot(b[0] - a[0], b[1] - a[1]) });
}
// road segments around a box (one index query per fence segment, then plain loops over the few candidates)
function roadsAround(x0, z0, x1, z1, m) {
  const out = [], cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, r = Math.max(x1 - x0, z1 - z0) / 2 + m;
  segIdx.query(cx, cz, r, (s) => { if (s.L > 1e-6) out.push(s); });
  return out;
}
const railSegs = new GridIndex(64);
for (const r of map.rails ?? []) { const P = pts(r.p); for (let i = 1; i < P.length; i++) railSegs.insert(Math.min(P[i - 1][0], P[i][0]), Math.min(P[i - 1][1], P[i][1]), Math.max(P[i - 1][0], P[i][0]), Math.max(P[i - 1][1], P[i][1]), [P[i - 1], P[i]]); }
const parkIdx = new GridIndex(64);
for (const p of map.parking ?? []) { const P = pts(p.p), bb = boundsOf(P); parkIdx.insert(bb.x0, bb.z0, bb.x1, bb.z1, { P, bb }); }

// ------------------------------------------------------------------------------------------------ buildings
const bIdx = new GridIndex(48);
const blds = buildings.map((b) => { const P = pts(b.p), bb = boundsOf(P); return { id: b.id, k: b.k, row: !!(b.row || b.bt === 'terrace'), P, bb, cx: (bb.x0 + bb.x1) / 2, cz: (bb.z0 + bb.z1) / 2 }; });
for (const b of blds) bIdx.insert(b.bb.x0, b.bb.z0, b.bb.x1, b.bb.z1, b);
function bldsAround(x0, z0, x1, z1, m) {
  const out = [];
  bIdx.query((x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) / 2 + m, (b) => { if (b.bb.x1 >= x0 - m && b.bb.x0 <= x1 + m && b.bb.z1 >= z0 - m && b.bb.z0 <= z1 + m) out.push(b); });
  return out;
}
const ringDist = (P, x, z) => { let d = Infinity, q = P[P.length - 1]; for (const p of P) { const e = segNear(x, z, q[0], q[1], p[0], p[1])[0]; if (e < d) d = e; q = p; } return d; };

// ------------------------------------------------------------------------------------------------ OSM barriers
// ids a hand-built site names (it draws that fence itself)
const SITE_IDS = (() => {
  const dir = here('../../src/world/cherkasy/'), ids = new Set();
  for (const f of readdirSync(dir)) if (f.endsWith('.js')) for (const m of readFileSync(new URL(f, dir), 'utf8').matchAll(/\b\d{7,11}\b/g)) ids.add(+m[0]);
  return ids;
})();
const num = (v) => { const f = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(f) ? f : null; };
const stats = { osmWays: 0, osmKm: 0, siteWays: 0, low: 0, moved: 0, movedKm: 0, lots: 0, gates: 0, wickets: 0, openGates: 0, generatedKm: 0, dupes: 0, byKind: {} };

const ways = [];
for (const e of poi) {
  const t = e.tags; if (e.type !== 'way' || !t || !/^(fence|wall|hedge)$/.test(t.barrier ?? '') || !e.geometry || e.geometry.length < 2) continue;
  if (SITE_IDS.has(e.id)) { stats.siteWays++; continue; }
  let h = num(t.height);
  if (h != null && h > 4) h = h <= 8 ? 4 : null; // a 7 m wall is drawn 4 m tall; "50" is a typo, the type's own height serves
  if (h != null && h < 0.7) { stats.low++; continue; }
  let P = e.geometry.map((g) => proj(g.lat, g.lon));
  if (!P.some((p) => inRegion(p[0], p[1]))) continue;
  P = simplify(P, 0.25, false);
  if (lenOf(P) < 1.2) continue;
  ways.push({ id: e.id, t, P, h });
}
ways.sort((a, b) => a.id - b.id);
// every vertex of every way: where side fences join a front
const vIdx = new GridIndex(16);
for (const w of ways) for (const p of w.P) vIdx.insert(p[0], p[1], p[0], p[1], { w, p });

// the fence type of a way: [kind | 'private', height]
function typeOf(w) {
  const t = w.t, u = hash(w.id, 11);
  const ft = t.fence_type ?? '', mat = t.material ?? t.wall ?? '';
  if (t.barrier === 'hedge') return [K.hedge, w.h ?? 1.3];
  // context: the buildings within 35 m of the way's vertices
  let nh = 0, ni = 0, np = 0;
  const bb = boundsOf(w.P);
  for (const b of bldsAround(bb.x0, bb.z0, bb.x1, bb.z1, 35)) {
    if (!w.P.some((p) => Math.abs(p[0] - b.cx) < 35 + (b.bb.x1 - b.bb.x0) / 2 && Math.abs(p[1] - b.cz) < 35 + (b.bb.z1 - b.bb.z0) / 2)) continue;
    if (b.k === 'house' && !b.row) nh += 2; else if (b.k === 'shed') nh += 0.5; else if (b.k === 'indus' || b.k === 'garage') ni += b.k === 'indus' ? 3 : 0.5; else np += 2;
  }
  const priv = nh > 0 && nh >= ni && nh >= np && !t.amenity && !t.leisure && !/industrial|garages|railway|commercial|retail/.test(t.landuse ?? '');
  if (t.barrier === 'wall') {
    if (/brick/.test(mat)) return [K.brick, w.h ?? 2.2];
    if (priv && !/concrete|stone/.test(mat)) return ['private', w.h ?? 2];
    return [K.slab, w.h ?? 2.4];
  }
  if (t.leisure === 'pitch' || t.sport) return [K.mesh, Math.max(w.h ?? 3, 2.4)];
  if (/chain|wire|mesh/.test(ft)) return [K.mesh, w.h ?? (priv ? 1.5 : 2)];
  if (/wood/.test(ft + mat)) return [u < 0.6 ? K.plank : K.picket, w.h ?? (u < 0.6 ? 1.8 : 1.3)];
  if (/concrete|panel/.test(ft + mat)) return [priv ? K.euro : K.slab, w.h ?? (priv ? 1.9 : 2.4)];
  if (/brick|stone/.test(mat)) return [K.brick, w.h ?? 2];
  if (t.leisure === 'playground') return [K.bars, w.h ?? 1.1];
  if (/metal|bars|railing|pole|paling/.test(ft + mat) || t.amenity || t.leisure) return [K.bars, w.h ?? 1.6];
  if (/industrial|garages|railway|construction/.test(t.landuse ?? '')) return [K.slab, w.h ?? 2.4];
  if (priv) return ['private', w.h];
  if (ni > np) return [K.slab, w.h ?? 2.4];
  if (np > 0) return [K.bars, w.h ?? 1.6];
  return [K.mesh, w.h ?? 1.6]; // out in the open: allotments, fields
}

// ------------------------------------------------------------------------------------------------ blocking
// Why a fence cannot stand at (x, z): 0 free, 1 a street's corridor, 2 a driveway, 3 a footway / track crossing,
// 4 a building, 5 other. ux, uz: the fence's direction there. cand / bl: the road segments and buildings around.
// own: the road a generated front belongs to, with its offset (its own corridor ends 0.4 m short of the line)
// lot: a street front with its lot on the left – a building within 1.5 m behind the line blocks it too (a house or a
// garage on the street line is the front itself: the fence joins its corners instead of standing before its windows)
function blocked(x, z, ux, uz, cand, bl, { own = null, off = 0, gen = false, lot = false } = {}) {
  let code = 0;
  for (const s of cand) {
    const r = s.r, d = segNear(x, z, s.a[0], s.a[1], s.b[0], s.b[1])[0];
    if (r === own) { if (d < off - 0.4) return 1; continue; }
    if (r.street) { if (d < r.cor) return 1; continue; }
    if (d >= r.cor) continue;
    if (r.k === 'm') { code = Math.max(code, 2); continue; }
    // footways and tracks: only where the fence crosses one, not where it runs along it
    const cross = Math.abs(ux * (s.b[1] - s.a[1]) - uz * (s.b[0] - s.a[0])) / s.L;
    if (cross > 0.5) code = Math.max(code, 3);
  }
  if (code) return code;
  for (const b of bl) {
    if (x < b.bb.x0 - 0.4 || x > b.bb.x1 + 0.4 || z < b.bb.z0 - 0.4 || z > b.bb.z1 + 0.4) continue;
    if (pointInRing(b.P, x, z) || (gen && ringDist(b.P, x, z) < 0.3)) return 4;
  }
  if (lot) for (let t = 0.5; t <= 1.5; t += 0.5) {
    const px = x - uz * t, pz = z + ux * t;
    for (const b of bl) if (px > b.bb.x0 && px < b.bb.x1 && pz > b.bb.z0 && pz < b.bb.z1 && pointInRing(b.P, px, pz)) return 4;
  }
  if (!inRegion(x, z, -2)) return 5;
  if (gen) {
    let hit = false;
    parkIdx.query(x, z, 0, (p) => { if (!hit && x > p.bb.x0 && x < p.bb.x1 && z > p.bb.z0 && z < p.bb.z1 && pointInRing(p.P, x, z)) hit = true; });
    if (!hit) railSegs.query(x, z, 5, (s) => { if (!hit && segNear(x, z, s[0][0], s[0][1], s[1][0], s[1][1])[0] < 4) hit = true; });
    if (hit) return 5;
  }
  return 0;
}

// a polyline with arclength: at(s) -> [x, z, ux, uz]; slice(s0, s1) -> polyline
function runOf(P) {
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = cum.at(-1);
  const seg = (s) => { let i = 1; while (i < P.length - 1 && cum[i] < s) i++; return i; };
  const at = (s) => {
    const i = seg(s), l = cum[i] - cum[i - 1] || 1, f = Math.min(1, Math.max(0, (s - cum[i - 1]) / l));
    const a = P[i - 1], b = P[i];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, (b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  const slice = (s0, s1) => {
    const out = [at(s0).slice(0, 2)];
    for (let i = 1; i < P.length - 1; i++) if (cum[i] > s0 + 0.05 && cum[i] < s1 - 0.05) out.push(P[i]);
    out.push(at(s1).slice(0, 2));
    return out;
  };
  // s of the point of the run closest to (x, z), with the distance and the side (> 0: left of the run)
  const project = (x, z) => {
    let best = [Infinity, 0, 0];
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], [d, t] = segNear(x, z, a[0], a[1], b[0], b[1]);
      if (d < best[0]) best = [d, cum[i - 1] + t * (cum[i] - cum[i - 1]), -(b[1] - a[1]) * (x - a[0]) + (b[0] - a[0]) * (z - a[1])];
    }
    return { d: best[0], s: best[1], left: best[2] > 0 };
  };
  return { P, L, cum, at, slice, project };
}
const STEP = 0.25;
// block codes along a run, one per STEP
function codesOf(run, opts) {
  const bb = boundsOf(run.P), cand = roadsAround(bb.x0, bb.z0, bb.x1, bb.z1, 24), bl = bldsAround(bb.x0, bb.z0, bb.x1, bb.z1, opts?.lot ? 3 : 1);
  const n = Math.max(1, Math.round(run.L / STEP)), codes = new Uint8Array(n + 1);
  const pts = new Float64Array(2 * n + 2);
  for (let i = 0; i <= n; i++) { const [x, z, ux, uz] = run.at(run.L * i / n); pts[2 * i] = x; pts[2 * i + 1] = z; codes[i] = blocked(x, z, ux, uz, cand, bl, opts); }
  // a footway or a track the run really crosses, however shallow the angle (blocked() takes a shallow one for running
  // alongside): open for as long as the run lies on it
  const paths = cand.filter((q) => !q.r.street && q.r.k !== 'm');
  for (let i = 1; i <= n && paths.length; i++) {
    const ax = pts[2 * i - 2], az = pts[2 * i - 1], bx = pts[2 * i], bz = pts[2 * i + 1];
    for (const q of paths) {
      const dx = q.b[0] - q.a[0], dz = q.b[1] - q.a[1], ex = bx - ax, ez = bz - az;
      if ((dx * (az - q.a[1]) - dz * (ax - q.a[0])) * (dx * (bz - q.a[1]) - dz * (bx - q.a[0])) > 0) continue; // both on one side of the path
      if ((ex * (q.a[1] - az) - ez * (q.a[0] - ax)) * (ex * (q.b[1] - az) - ez * (q.b[0] - ax)) > 0) continue; // the path's ends on one side of the step
      const on = (j) => segNear(pts[2 * j], pts[2 * j + 1], q.a[0], q.a[1], q.b[0], q.b[1])[0] < q.r.cor;
      for (let j = i; j <= n && on(j); j++) if (!codes[j]) codes[j] = 3;
      for (let j = i - 1; j >= 0 && on(j); j--) if (!codes[j]) codes[j] = 3;
    }
  }
  return { codes, n, ds: run.L / n };
}
// free spans [s0, s1] of a run between its blocked samples, each with the block codes at its two ends (0 = the run's end)
function spansOf(run, C, from = 0, to = run.L) {
  const out = [], i0 = Math.ceil(from / C.ds - 1e-6), i1 = Math.floor(to / C.ds + 1e-6);
  let start = -1;
  for (let i = i0; i <= i1 + 1; i++) {
    const free = i <= i1 && !C.codes[i];
    if (free && start < 0) start = i;
    if (!free && start >= 0) {
      const s0 = start === i0 ? from : start * C.ds, s1 = i - 1 === i1 ? to : (i - 1) * C.ds;
      if (s1 - s0 >= 0.8) out.push({ s0, s1, c0: start > i0 ? C.codes[start - 1] : 0, c1: i <= i1 ? C.codes[i] : 0 });
      start = -1;
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ output
const pieces = [];
const seen = new Map(); // 0.5 m cells a fence already runs through, by direction (dedupe of doubled OSM lines)
const cellKey = (x, z) => Math.round(x * 2) * 100003 + Math.round(z * 2);
function emit(kind, seed, h, flags, P) {
  if (P.length < 2 || lenOf(P) < (kind >= K.gate ? 0.5 : 0.6)) return false;
  // a piece that runs where another already does (the same border mapped twice) is dropped
  if (kind < K.gate) {
    const run = runOf(P), n = Math.max(2, Math.round(run.L * 2)), keys = [];
    let dup = 0;
    for (let i = 0; i <= n; i++) { const [x, z, ux, uz] = run.at(run.L * i / n), k = cellKey(x, z), q = seen.get(k); keys.push([k, ux, uz]); if (q && Math.abs(q[0] * ux + q[1] * uz) > 0.9) dup++; }
    if (dup >= 0.8 * (n + 1)) { stats.dupes++; return false; }
    for (const [k, ux, uz] of keys) seen.set(k, [ux, uz]);
  }
  pieces.push({ kind, seed: Math.floor(seed * 256) & 255, h, flags, P });
  const name = KINDS[kind]; stats.byKind[name] = Math.round(((stats.byKind[name] ?? 0) + lenOf(P)) * 10) / 10;
  return true;
}

// ------------------------------------------------------------------------------------------------ lots
const FRONT = [[30, 'sheet'], [20, 'sheetbrick'], [9, 'plank'], [6, 'picket'], [7, 'slate'], [8, 'brick'], [10, 'euro'], [4, 'forged'], [4, 'mesh'], [2, 'bars']];
const INNER = [[45, 'mesh'], [15, 'slate'], [15, 'plank'], [20, 'sheet'], [5, 'euro']];
const HEIGHT = { sheet: [1.85, 2.1], sheetbrick: [1.9, 2.1], plank: [1.6, 1.9], picket: [1.15, 1.4], slate: [1.55, 1.75], brick: [1.8, 2.2], euro: [1.8, 2], forged: [1.7, 1.9], mesh: [1.4, 1.6], bars: [1.4, 1.6] };
const OLD = new Set(['plank', 'picket', 'slate', 'mesh']); // lots that keep an old welded gate
// A private street front (the lot on its left): lots, each with its own fence, a gate and a wicket where there is room.
//   run: the front; C: its block codes; cuts: s of the side fences that join it; houses: [{ s0, s1 }] behind it
function lotFront(run, C, cuts, houses, flags, hTag = null) {
  houses.sort((a, b) => a.s0 - b.s0);
  const marks = [0, ...cuts.filter((s) => s > 2 && s < run.L - 2).sort((a, b) => a - b), run.L];
  // no side fence between two houses: the lots meet half way between them
  for (let i = 1; i < houses.length; i++) {
    const a = houses[i - 1].s1, b = houses[i].s0, m = (a + b) / 2;
    if (b - a < 0.5 || marks.some((s) => s > Math.min(a, m) - 1 && s < Math.max(b, m) + 1 && s > 0 && s < run.L)) continue;
    marks.push(m);
  }
  marks.sort((a, b) => a - b);
  const lots = [];
  for (let i = 1; i < marks.length; i++) { if (lots.length && marks[i] - marks[i - 1] < 3.5) lots.at(-1)[1] = marks[i]; else lots.push([marks[i - 1], marks[i]]); }
  if (lots.length > 1 && lots[0][1] - lots[0][0] < 3.5) { lots[1][0] = lots[0][0]; lots.shift(); }
  for (const [a, b] of lots) {
    const [mx, mz] = run.at((a + b) / 2), id = Math.round(mx * 2) * 7919 + Math.round(mz * 2);
    const name = pick(hash(id, 1), FRONT), seed = hash(id, 2), hr = HEIGHT[name];
    const h = Math.min(2.4, Math.max(1.1, hTag ?? hr[0] + (hr[1] - hr[0]) * hash(id, 3)));
    const home = houses.some((q) => q.s1 > a - 1 && q.s0 < b + 1);
    const spans = spansOf(run, C, a, b);
    stats.lots++;
    // the gate and the wicket: in the longest free span, toward one of its ends; not in a lot a driveway already opens
    const drive = spans.some((q) => q.c0 === 2 || q.c1 === 2);
    let gate = null;
    const big = spans.reduce((m, q) => (!m || q.s1 - q.s0 > m.s1 - m.s0 ? q : m), null);
    if (big && home && !drive && name !== 'bars') {
      const room = big.s1 - big.s0, gw = 3 + 0.5 * hash(id, 4), ww = 1;
      const full = room >= gw + ww + 2.2, only = !full && room >= ww + 1.6;
      if (full || only) {
        // at least 0.7 m of fence stays on each side (a shorter remainder would not be emitted: a hole by the gate)
        const used = full ? gw + 0.3 + ww : ww, slack = room - used - 1.4, m = 0.7 + slack * 0.25 * hash(id, 5);
        const s = hash(id, 6) < 0.5 ? big.s0 + m : big.s1 - m - used;
        // straight under the gate: no vertex of the run inside it
        if (!run.cum.some((c) => c > s + 0.05 && c < s + used - 0.05)) {
          const flip = hash(id, 7) < 0.5; // which of the two comes first
          // the two meet in the middle of the post between them (their frames are the post): no gap in the closed run
          gate = { s0: s, s1: s + used, parts: full ? (flip ? [[s, s + ww + 0.15, 1], [s + ww + 0.15, s + used, 0]] : [[s, s + gw + 0.15, 0], [s + gw + 0.15, s + used, 1]]) : [[s, s + ww, 1]] };
        }
      }
    }
    // in the order they stand along the front (the game merges neighbours into one collision run)
    const old = OLD.has(name), parts = [];
    for (const q of spans) {
      const cut = gate && gate.s0 >= q.s0 - 1e-6 && gate.s1 <= q.s1 + 1e-6 ? [[q.s0, gate.s0], [gate.s1, q.s1]] : [[q.s0, q.s1]];
      for (const [s0, s1] of cut) if (s1 - s0 > 0.3) parts.push([s0, s1, K[name], h]);
    }
    if (gate) for (const [s0, s1, door] of gate.parts) {
      parts.push([s0, s1, door ? (old ? K.oldwicket : K.wicket) : (old ? K.oldgate : K.gate), Math.max(h, door ? 1.8 : 1.7)]);
      if (door) stats.wickets++; else stats.gates++;
    }
    parts.sort((p, q) => p[0] - q[0]);
    for (const [s0, s1, kind, hh] of parts) emit(kind, seed, hh, flags, run.slice(s0, s1));
  }
  openGates(run, C, flags);
}
// a driveway through a front: the two posts and the open leaves of its gate
function openGates(run, C, flags) {
  let i = 0;
  while (i <= C.n) {
    if (!C.codes[i]) { i++; continue; }
    let j = i, drive = true;
    while (j <= C.n && C.codes[j]) { if (C.codes[j] !== 2) drive = false; j++; }
    const s0 = (i - 1) * C.ds, s1 = j * C.ds;
    if (drive && i > 0 && j <= C.n && s1 - s0 > 2.5 && s1 - s0 < 8) { emit(K.gateopen, hash(Math.round(run.at(s0)[0] * 3), Math.round(run.at(s0)[1] * 3)), 1.9, flags, [run.at(s0).slice(0, 2), run.at(s1).slice(0, 2)]); stats.openGates++; }
    i = j;
  }
}

// ------------------------------------------------------------------------------------------------ 1-2. OSM ways
// the street a fence segment fronts: the nearest street within 9 m of its kerb that it runs along
function frontOf(a, b, cand) {
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
  let best = null;
  for (const s of cand) {
    if (!s.r.street) continue;
    const [d, , px, pz] = segNear(mx, mz, s.a[0], s.a[1], s.b[0], s.b[1]);
    if (d > s.r.w / 2 + 9 || Math.abs(ux * (s.b[0] - s.a[0]) + uz * (s.b[1] - s.a[1])) / s.L < 0.75) continue;
    // the lot is on the far side from the street; side: which side of the street (+1 = left of its direction)
    if (!best || d < best.d) best = { d, r: s.r, left: -uz * (mx - px) + ux * (mz - pz) > 0, side: -(s.b[1] - s.a[1]) * (mx - px) + (s.b[0] - s.a[0]) * (mz - pz) > 0 ? 1 : -1 };
  }
  return best;
}
const frontCells = new Map(); // 4 m cells with an OSM street front -> the street sides it fronts: no generated front there
const fKey = (x, z) => Math.floor(x / 4) * 100003 + Math.floor(z / 4);
const osmFronts = [];
for (const w of ways) {
  stats.osmWays++; stats.osmKm += lenOf(w.P) / 1000;
  const [kind, h] = typeOf(w), bb = boundsOf(w.P), cand = roadsAround(bb.x0, bb.z0, bb.x1, bb.z1, 30);
  // split into stretches of segments with the same front (street + side) or none
  const fr = [];
  for (let i = 1; i < w.P.length; i++) fr.push(frontOf(w.P[i - 1], w.P[i], cand));
  let i = 0;
  while (i < fr.length) {
    let j = i + 1;
    while (j < fr.length && (fr[j]?.r ?? null) === (fr[i]?.r ?? null) && (fr[j]?.left ?? null) === (fr[i]?.left ?? null)) j++;
    let P = w.P.slice(i, j + 1);
    const f = fr[i];
    i = j;
    if (!f) { // an inner fence: cut where it is not allowed, drawn as it is
      const run = runOf(P), C = codesOf(run), u = hash(w.id, 21);
      const name = kind === 'private' ? pick(u, INNER) : null, k = name ? K[name] : kind;
      const hh = h ?? (name ? HEIGHT[name][0] + (HEIGHT[name][1] - HEIGHT[name][0]) * hash(w.id, 22) : 1.8);
      for (const q of spansOf(run, C)) emit(k, hash(w.id, 23), hh, 0, run.slice(q.s0, q.s1));
      if (k === K.bars || k === K.slab || k === K.brick) openGates(run, C, 0);
      continue;
    }
    if (!f.left) P = P.slice().reverse(); // the lot on the left
    osmFronts.push({ w, kind, h, P, r: f.r, tag: f.r.id * 2 + (f.side > 0 ? 1 : 0) });
  }
}
for (const F of osmFronts) {
  const { w, kind, h, r } = F;
  // side fences that join the front, measured before it moves
  const run0 = runOf(F.P), cuts = [];
  const bb = boundsOf(F.P);
  vIdx.query((bb.x0 + bb.x1) / 2, (bb.z0 + bb.z1) / 2, Math.max(bb.x1 - bb.x0, bb.z1 - bb.z0) / 2 + 2, (v) => {
    if (v.w === w) return;
    const q = run0.project(v.p[0], v.p[1]);
    if (q.d < 0.7) cuts.push(q.s / run0.L);
  });
  // on the pavement band: back to its edge (at most 3.5 m; deeper in, the cut below takes it)
  let moved = false;
  const P = F.P.map((p) => {
    let d = Infinity, hit = null;
    for (let i = 1; i < r.P.length; i++) { const q = segNear(p[0], p[1], r.P[i - 1][0], r.P[i - 1][1], r.P[i][0], r.P[i][1]); if (q[0] < d) { d = q[0]; hit = q; } }
    const need = r.cor + 0.1 - d;
    if (need <= 0 || need > 3.5 || d < 0.05) return p;
    moved = true;
    return [p[0] + (p[0] - hit[2]) / d * need, p[1] + (p[1] - hit[3]) / d * need];
  });
  if (moved) { stats.moved++; stats.movedKm += run0.L / 1000; }
  const run = runOf(P), C = codesOf(run, { lot: true });
  for (let i = 0; i <= C.n; i++) if (!C.codes[i] || C.codes[i] === 4) { const [x, z] = run.at(i * C.ds), k = fKey(x, z); (frontCells.get(k) ?? frontCells.set(k, new Set()).get(k)).add(F.tag); }
  if (kind !== 'private') {
    for (const q of spansOf(run, C)) emit(kind, hash(w.id, 23), h ?? 1.8, 1, run.slice(q.s0, q.s1));
    if (kind === K.bars || kind === K.slab || kind === K.brick) openGates(run, C, 1);
    continue;
  }
  // the houses behind it (on the left, within 22 m)
  const houses = [];
  for (const b of bldsAround(bb.x0, bb.z0, bb.x1, bb.z1, 24)) {
    if (b.k !== 'house') continue;
    const c = run.project(b.cx, b.cz);
    if (!c.left || c.d > 22 + Math.max(b.bb.x1 - b.bb.x0, b.bb.z1 - b.bb.z0) / 2) continue;
    let s0 = Infinity, s1 = -Infinity;
    for (const p of b.P) { const q = run.project(p[0], p[1]); s0 = Math.min(s0, q.s); s1 = Math.max(s1, q.s); }
    houses.push({ s0, s1 });
  }
  lotFront(run, C, cuts.map((f) => f * run.L), houses, 1, h);
}
const nearFront = (x, z, tag) => { for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (frontCells.get(fKey(x + i * 4, z + j * 4))?.has(tag)) return true; return false; };

// ------------------------------------------------------------------------------------------------ 3. generated fronts
for (const r of roads) {
  if (!r.street || r.P.length < 2) continue;
  const off = r.cor + 0.1, P = r.P, n = P.length - 1;
  for (const side of [1, -1]) {
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1) continue;
      const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = -uz * side, nz = ux * side;
      // the offset line meets its neighbours' at the bends (mitre): longer on the outside, shorter inside
      const mitre = (p, q, w) => { // bend at q between p->q and q->w
        const l0 = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, l1 = Math.hypot(w[0] - q[0], w[1] - q[1]) || 1;
        const ax = (q[0] - p[0]) / l0, az = (q[1] - p[1]) / l0, bx = (w[0] - q[0]) / l1, bz = (w[1] - q[1]) / l1;
        const cr = ax * bz - az * bx, dt = ax * bx + az * bz;
        return Math.max(-6, Math.min(6, -side * cr / Math.max(0.2, 1 + dt) * off));
      };
      const e0 = i > 0 ? mitre(P[i - 1], a, b) : 0, e1 = i < n - 1 ? mitre(a, b, P[i + 2]) : 0;
      // houses behind the line on this side
      const iv = [];
      for (const h of bldsAround(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), off + 20)) {
        if (h.k !== 'house' || h.row) continue;
        let s0 = Infinity, s1 = -Infinity, d0 = Infinity, d1 = -Infinity;
        for (const p of h.P) { const s = (p[0] - a[0]) * ux + (p[1] - a[1]) * uz, d = (p[0] - a[0]) * nx + (p[1] - a[1]) * nz; s0 = Math.min(s0, s); s1 = Math.max(s1, s); d0 = Math.min(d0, d); d1 = Math.max(d1, d); }
        if (d1 < off + 0.5 || d0 > off + 16 || s1 < -e0 || s0 > L + e1) continue;
        iv.push({ s0, s1 });
      }
      if (!iv.length) continue;
      // footways that run along this side just behind the line (an OSM pavement): the fence stands behind them
      const walks = roadsAround(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), off + 8)
        .filter((s) => s.r.k === 'p' && Math.abs(ux * (s.b[0] - s.a[0]) + uz * (s.b[1] - s.a[1])) / s.L > 0.9)
        .map((s) => ({ s0: (s.a[0] - a[0]) * ux + (s.a[1] - a[1]) * uz, s1: (s.b[0] - a[0]) * ux + (s.b[1] - a[1]) * uz, d: ((s.a[0] + s.b[0]) / 2 - a[0]) * nx + ((s.a[1] + s.b[1]) / 2 - a[1]) * nz, w: s.r.w }))
        .filter((q) => q.d > off - 2.5 && q.d < off + 5);
      iv.sort((p, q) => p.s0 - q.s0);
      const groups = [];
      for (const h of iv) {
        const g = groups.at(-1);
        if (g && h.s0 - 5 <= g.s1 + 5 + 8) { g.s1 = Math.max(g.s1, h.s1); g.h.push(h); } else groups.push({ s0: h.s0, s1: h.s1, h: [h] });
      }
      for (const g of groups) {
        const s0 = Math.max(-e0, g.s0 - 5), s1 = Math.min(L + e1, g.s1 + 5);
        if (s1 - s0 < 3) continue;
        let offG = off; // this stretch's own offset: behind a mapped pavement
        for (const q of walks) if (Math.max(q.s0, q.s1) > s0 && Math.min(q.s0, q.s1) < s1) offG = Math.max(offG, q.d + q.w / 2 + 0.4);
        // the lot on the left of the run: on the street's right side the run goes b -> a
        let A = [a[0] + ux * s0 + nx * offG, a[1] + uz * s0 + nz * offG], B = [a[0] + ux * s1 + nx * offG, a[1] + uz * s1 + nz * offG];
        const fwd = side > 0;
        if (!fwd) [A, B] = [B, A];
        const run = runOf([A, B]), C = codesOf(run, { own: r, off: offG, gen: true, lot: true });
        for (let k = 0; k <= C.n; k++) if (!C.codes[k]) { const [x, z] = run.at(k * C.ds); if (nearFront(x, z, r.id * 2 + (side > 0 ? 1 : 0))) C.codes[k] = 5; }
        if (!C.codes.some((c) => !c)) continue;
        const houses = g.h.map((h) => (fwd ? { s0: h.s0 - s0, s1: h.s1 - s0 } : { s0: s1 - h.s1, s1: s1 - h.s0 }));
        const before = pieces.length;
        lotFront(run, C, [], houses, 3);
        for (let k = before; k < pieces.length; k++) if (pieces[k].kind < K.gate) stats.generatedKm += lenOf(pieces[k].P) / 1000;
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------ 5. open gates
// An open gate's leaves swing into the lot (the left of its piece) and stand clear of every road, pavement band,
// footway and building. A street front never swings to the street; an inner gate (a plant's, a school's) may turn to
// its other side, the one farther from the street first. With no clear side the gate keeps its posts only (flag 4).
{
  const clearAt = (x, z) => {
    for (const s of roadsAround(x, z, x, z, 14)) {
      const d = segNear(x, z, s.a[0], s.a[1], s.b[0], s.b[1])[0];
      if (d < (s.r.street ? s.r.cor - 0.05 : s.r.k === 'm' ? s.r.w / 2 + 0.1 : s.r.w / 2)) return false;
    }
    for (const b of bldsAround(x, z, x, z, 1)) if (pointInRing(b.P, x, z) || ringDist(b.P, x, z) < 0.15) return false;
    return true;
  };
  const clear = (a, b) => openLeaves(a[0], a[1], b[0], b[1]).every(([x0, z0, x1, z1]) => [0.3, 0.65, 1].every((t) => clearAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)));
  const streetDist = (x, z) => { let d = 60; for (const s of roadsAround(x, z, x, z, 60)) if (s.r.street) d = Math.min(d, segNear(x, z, s.a[0], s.a[1], s.b[0], s.b[1])[0]); return d; };
  stats.leavesTurned = 0; stats.leavesOff = 0;
  for (const p of pieces) {
    if (p.kind !== K.gateopen) continue;
    const [a, b] = p.P, L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    let turn = !(p.flags & 1) && streetDist(mx - nx * 4, mz - nz * 4) > streetDist(mx + nx * 4, mz + nz * 4) + 0.5; // inner: away from the street
    if (!(turn ? clear(b, a) : clear(a, b))) {
      if (!(p.flags & 1) && (turn ? clear(a, b) : clear(b, a))) turn = !turn;
      else { p.flags |= 4; stats.leavesOff++; continue; }
    }
    if (turn) { p.P = [b, a]; stats.leavesTurned++; }
  }
}

// ------------------------------------------------------------------------------------------------ 6. orphans
// After the cuts (carriageways, driveways, footways, buildings) a run can leave a stub that joins nothing: a metre of
// fence by a house wall, a gate with no fence beside it. Pieces are joined into groups (an end within 0.8 m of another
// piece); a group stays if it holds 4 m of fence, or closes a gap between two buildings, or runs 2.5 m from one.
{
  const idx = new GridIndex(16), parent = pieces.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  pieces.forEach((p, k) => { for (let i = 1; i < p.P.length; i++) { const a = p.P[i - 1], b = p.P[i]; idx.insert(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), { k, a, b }); } });
  const ends = new Uint8Array(pieces.length); // ends that meet a building (within 1.8 m: a front stops 1.5 m short of one)
  pieces.forEach((p, k) => {
    for (const [x, z] of [p.P[0], p.P.at(-1)]) {
      idx.query(x, z, 0.8, (s) => { if (s.k !== k && segNear(x, z, s.a[0], s.a[1], s.b[0], s.b[1])[0] < 0.8) parent[find(k)] = find(s.k); });
      if (bldsAround(x, z, x, z, 2).some((b) => pointInRing(b.P, x, z) || ringDist(b.P, x, z) < 1.8)) ends[k]++;
    }
  });
  const G = new Map();
  pieces.forEach((p, k) => {
    const g = G.get(find(k)) ?? G.set(find(k), { fence: 0, total: 0, ends: 0 }).get(find(k)), L = lenOf(p.P);
    if (p.kind < K.gate) g.fence += L;
    if (p.kind !== K.gateopen) g.total += L;
    g.ends += ends[k];
  });
  stats.orphans = 0; stats.orphanKm = 0;
  const keep = pieces.filter((p, k) => {
    const g = G.get(find(k));
    if (g.fence >= 4 || g.ends >= 2 || (g.ends >= 1 && g.total >= 2.5)) return true;
    stats.orphans++; stats.orphanKm += lenOf(p.P) / 1000;
    const name = KINDS[p.kind]; stats.byKind[name] = Math.round((stats.byKind[name] - lenOf(p.P)) * 10) / 10;
    return false;
  });
  pieces.length = 0; pieces.push(...keep);
  stats.orphanKm = Math.round(stats.orphanKm * 100) / 100;
}

// ------------------------------------------------------------------------------------------------ write
const d = [], q10 = (v) => Math.round(v * 10);
let total = 0, points = 0;
for (const p of pieces) {
  const X = p.P.map((v) => [q10(v[0] - REGION.x0), q10(v[1] - REGION.z0)]).filter((v, i, A) => i === 0 || v[0] !== A[i - 1][0] || v[1] !== A[i - 1][1]);
  if (X.length < 2) continue;
  d.push(p.kind, p.seed, q10(p.h), p.flags, X.length, X[0][0], X[0][1]);
  for (let i = 1; i < X.length; i++) d.push(X[i][0] - X[i - 1][0], X[i][1] - X[i - 1][1]);
  total++; points += X.length;
}
for (const k of ['osmKm', 'movedKm', 'generatedKm']) stats[k] = Math.round(stats[k] * 10) / 10;
stats.pieces = total; stats.points = points;
stats.km = Math.round(Object.values(stats.byKind).reduce((s, v) => s + v, 0) / 100) / 10;
const out = { attribution: map.attribution, frame: FRAME, region: REGION, unit: 0.1, kinds: KINDS, stats, d };
const file = here('../../public/assets/cherkasy/map_fences.json');
writeFileSync(file, JSON.stringify(out));
console.log(`fences: ${total} pieces, ${points} points, ${stats.km} km in ${Date.now() - t0} ms -> ${(JSON.stringify(out).length / 1e6).toFixed(2)} MB`);
console.log(stats);
