// Street furniture compiler: the OpenStreetMap street nodes (tools/cherkasy/raw/street.json: street lamps, bus stops,
// crossings – `node tools/cherkasy/fetch_osm.mjs street`) and amenities (raw/poi.json: benches, bins, container sites,
// bus shelters) placed against the compiled map (public/assets/cherkasy/map.json roads, map_buildings.json) ->
// public/assets/cherkasy/map_street.json, which src/world/cherkasy/street.js draws. Map data (c) OpenStreetMap
// contributors, ODbL. Same frame as map.json; it reads the compiled map and never writes it.
//
// What it decides here, offline, so the game only filters and draws:
//   lamps    every OSM highway=street_lamp in the region gets a type from the way it stands by – MAIN (a primary /
//            secondary / tertiary road; MAIN2, the double arm, on бульвар Шевченка), STREET (a residential street among
//            blocks of flats), YARD (a service road), PARK (a footway or open ground) – and the direction its arm points
//            (to that way). A lamp that the map's road width puts on a carriageway is moved to the kerb; one inside a
//            building or on a bridge is dropped. On a trolleybus road (map `tw`) a MAIN lamp carries the span wire.
//            Where nobody mapped lamps (no lamp within 45 m of a main road, or of a way tagged lit=yes) one is added
//            every 36 m.
//   chains   the private sector: a lamp by a street among houses is a concrete utility pole with the lamp on a short
//            arm. Poles of one street (ways of one name joined end to end) are chained in order along it, the gaps
//            and the streets nobody mapped lamps on filled with plain poles every ~38 m, off every junction mouth,
//            driveway and building; the game hangs the wires between consecutive poles of a chain.
//   trolley  the contact wires: per trolleybus way a polyline for each direction's wire pair (lateral offset from the
//            centreline), cut at bridges.
//   benches, bins, containers (amenity=waste_disposal: the yard container sites; nodes within 8 m of one another are
//            one site), shelters (amenity=shelter + shelter_type=public_transport outlines as oriented rectangles, and
//            bus stops tagged shelter=yes that have none; the whole footprint stands off the carriageways), stops (a bus-stop sign per shelter or lone stop), cross (a pedestrian-crossing sign each side of a
//            marked crossing without signals).
//
// Output (integers, decimetres; yaw in 1/64 turns, local +x of a prop -> world (cos, -sin) as kit/mesh.js M4):
//   { v, attribution, counts,
//     lamps: [dx, dz, code, ...]            delta-coded in file order; code = type | yaw << 3 | span << 9 (span: the
//                                           trolleybus span wire's length from the pole, dm; 0 = none)
//     chains: [[x, z, c, dx, dz, c, ...]]   c = lamp | yaw << 1 (yaw: toward the street)
//     trolley: [[off, x, z, dx, dz, ...]]   off: lateral offset of the wire pair, dm
//     benches: [dx, dz, yaw | back << 6], bins: [dx, dz], containers: [dx, dz, yaw | n << 6],
//     shelters: [x, z, yaw, len, depth], stops: [dx, dz, yaw], cross: [dx, dz, yaw] }
// Run: node tools/cherkasy/build_street.mjs   (RAW=<dir> reads the raw extracts from another checkout). Deterministic.
import { readFileSync, writeFileSync } from 'node:fs';
import { pointInRing, minAreaRect } from './geom2d.mjs';

const RAWDIR = process.env.RAW ? process.env.RAW.replace(/\/?$/, '/') : new URL('./raw/', import.meta.url).pathname;
const RAW = (n) => JSON.parse(readFileSync(RAWDIR + n + '.json')).elements;
const ASSET = (n) => new URL(`../../public/assets/cherkasy/${n}`, import.meta.url);
const map = JSON.parse(readFileSync(ASSET('map.json'))), buildings = JSON.parse(readFileSync(ASSET('map_buildings.json')));
const FR = map.frame, R = map.region;
const KY = 111320, KX = 111320 * Math.cos(FR.lat0 * Math.PI / 180), CR = Math.cos(FR.rot * Math.PI / 180), SR = Math.sin(FR.rot * Math.PI / 180);
const proj = (lat, lon) => { const e = (lon - FR.lon0) * KX, n = (lat - FR.lat0) * KY; return [e * CR + n * SR, e * SR - n * CR]; };
const inRegion = (x, z, m = 0) => x >= R.x0 + m && x <= R.x1 - m && z >= R.z0 + m && z <= R.z1 - m;
const hash01 = (n) => { let h = (n | 0) * 2654435761 >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const TAU = Math.PI * 2;
// yaw of a prop whose local +x should point along (dx, dz): M4 maps local +x to (cos ry, -sin ry)
const yawOf = (dx, dz) => Math.atan2(-dz, dx);
const yaw64 = (a) => ((Math.round(a / TAU * 64) % 64) + 64) % 64;

// ------------------------------------------------------------------------------------------------ the map's ways
const DRIVE = new Set(['primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link', 'tertiary_link', 'trunk', 'trunk_link', 'motorway',
  'motorway_link', 'residential', 'unclassified', 'living_street', 'service', 'track', 'road', 'busway', 'raceway']);
const MAIN = new Set(['primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link', 'tertiary_link', 'trunk', 'trunk_link', 'motorway', 'motorway_link']);
const STREET = new Set(['residential', 'unclassified', 'living_street']);
const roads = map.roads.map((r, i) => ({ ...r, i, drive: (r.k === 'm' || r.k === 'd') && DRIVE.has(r.c), foot: r.k === 'p' || r.k === 'x' || (r.k === 'd' && !DRIVE.has(r.c)) }));
const C = 40, key = (i, j) => (i + 4096) * 8192 + (j + 4096);
const segGrid = new Map();
for (const r of roads) {
  const p = r.p;
  for (let k = 0; k + 3 < p.length; k += 2) {
    const i0 = Math.floor(Math.min(p[k], p[k + 2]) / C), i1 = Math.floor(Math.max(p[k], p[k + 2]) / C), j0 = Math.floor(Math.min(p[k + 1], p[k + 3]) / C), j1 = Math.floor(Math.max(p[k + 1], p[k + 3]) / C);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const kk = key(i, j); let b = segGrid.get(kk); if (!b) segGrid.set(kk, b = []); b.push(r.i, k); }
  }
}
// every segment of a way passing `filter` within `reach` of (x, z): cb(road, dist, px, pz, tx, tz)
function eachNear(x, z, reach, filter, cb) {
  const i0 = Math.floor((x - reach) / C), i1 = Math.floor((x + reach) / C), j0 = Math.floor((z - reach) / C), j1 = Math.floor((z + reach) / C);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const b = segGrid.get(key(i, j)); if (!b) continue;
    for (let q = 0; q < b.length; q += 2) {
      const r = roads[b[q]]; if (!filter(r)) continue;
      const k = b[q + 1], p = r.p, ax = p[k], az = p[k + 1], dx = p[k + 2] - ax, dz = p[k + 3] - az, l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0, px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
      if (d <= reach) { const l = Math.sqrt(l2) || 1; cb(r, d, px, pz, dx / l, dz / l); }
    }
  }
}
function nearest(x, z, reach, filter) {
  let best = null;
  eachNear(x, z, reach, filter, (r, d, px, pz, tx, tz) => { if (!best || d < best.d) best = { r, d, px, pz, tx, tz }; });
  return best;
}
const isDrive = (r) => r.drive, isFoot = (r) => r.foot;
// (x, z) moved off every carriageway: at least `m` beyond the kerb of each drivable way. null when it cannot be
function offRoads(x, z, m = 0.6) {
  for (let it = 0; it < 5; it++) {
    let worst = null;
    eachNear(x, z, 20, isDrive, (r, d, px, pz, tx, tz) => { const need = r.w / 2 + m - d; if (need > 0.02 && (!worst || need > worst.need)) worst = { need, d, px, pz, tx, tz }; });
    if (!worst) return [x, z];
    let nx = x - worst.px, nz = z - worst.pz; const l = Math.hypot(nx, nz);
    if (l < 0.05) { nx = -worst.tz; nz = worst.tx; } else { nx /= l; nz /= l; }
    x += nx * (worst.need + 0.1); z += nz * (worst.need + 0.1);
  }
  return null;
}
const clearOfRoads = (x, z, m = 0.6) => { let ok = true; eachNear(x, z, 20, isDrive, (r, d) => { if (d < r.w / 2 + m) ok = false; }); return ok; };

// ------------------------------------------------------------------------------------------------ buildings
const BC = 50, bGrid = new Map();
const B = buildings.map((b) => { const P = []; for (let i = 0; i < b.p.length; i += 2) P.push([b.p[i], b.p[i + 1]]); return { P, k: b.k, lv: b.lv || 0 }; });
B.forEach((b, bi) => {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of b.P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  b.cx = (x0 + x1) / 2; b.cz = (z0 + z1) / 2;
  for (let i = Math.floor((x0 - 1) / BC); i <= Math.floor((x1 + 1) / BC); i++) for (let j = Math.floor((z0 - 1) / BC); j <= Math.floor((z1 + 1) / BC); j++) { const kk = key(i, j); let g = bGrid.get(kk); if (!g) bGrid.set(kk, g = []); g.push(bi); }
});
function inBuilding(x, z, m = 0.5) {
  const g = bGrid.get(key(Math.floor(x / BC), Math.floor(z / BC))); if (!g) return false;
  for (const bi of g) {
    const P = B[bi].P;
    if (pointInRing(P, x, z)) return true;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
      if (Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z) < m) return true;
    }
  }
  return false;
}
// the private sector: houses around and no block of flats (by building centres within 45 m)
function privateAt(x, z) {
  let h = 0, big = 0;
  for (let i = Math.floor((x - 45) / BC); i <= Math.floor((x + 45) / BC); i++) for (let j = Math.floor((z - 45) / BC); j <= Math.floor((z + 45) / BC); j++) {
    const g = bGrid.get(key(i, j)); if (!g) continue;
    for (const bi of g) {
      const b = B[bi];
      if (Math.floor(b.cx / BC) !== i || Math.floor(b.cz / BC) !== j) continue; // counted in its centre's cell only
      if (Math.hypot(b.cx - x, b.cz - z) > 45) continue;
      if (b.k === 'house') h++; else if (b.k === 'apt' || ((b.k === 'public' || b.k === 'indus') && b.lv >= 3)) big++;
    }
  }
  return (h >= 2 && big === 0) || (h >= 5 && big <= 1);
}

// ------------------------------------------------------------------------------------------------ lamps
const street = RAW('street'), poi = RAW('poi');
const T = { MAIN: 0, MAIN2: 1, STREET: 2, YARD: 3, PARK: 4 };
const counts = { osmLamps: 0, lampsMoved: 0, lampsDropped: 0 };
const lamps = [], utilLamps = [];
{
  const seen = new Map(); // 3 m cells: two nodes on one pole are one lamp
  const raw = street.filter((e) => e.type === 'node' && e.tags?.highway === 'street_lamp').map((e) => [...proj(e.lat, e.lon), e.id]).filter(([x, z]) => inRegion(x, z, 4));
  raw.sort((a, b) => a[2] - b[2]);
  counts.osmLamps = raw.length;
  for (let [x, z, id] of raw) {
    const m = nearest(x, z, 30, isDrive), f = nearest(x, z, 10, isFoot);
    const edge = m ? m.d - m.r.w / 2 : Infinity;
    let type, way = null;
    if (m && edge < 9 && !(m.r.c === 'service' && f && f.d + 2 < m.d)) {
      way = m.r;
      type = MAIN.has(way.c) ? (way.n === 'бульвар Шевченка' ? T.MAIN2 : T.MAIN) : STREET.has(way.c) ? T.STREET : T.YARD;
    } else if (f && f.d < 8) type = T.PARK;
    else if (m && edge < 20) { type = T.YARD; way = m.r; } else type = T.PARK;
    if (way?.br) { counts.lampsDropped++; continue; }
    const moved = offRoads(x, z, type === T.PARK ? 0.4 : 0.6);
    if (!moved) { counts.lampsDropped++; continue; }
    if (moved[0] !== x || moved[1] !== z) counts.lampsMoved++;
    [x, z] = moved;
    if (type === T.PARK && f) { // off the footway it lights
      const g = nearest(x, z, 6, isFoot);
      if (g && g.d < g.r.w / 2 + 0.3) { let nx = x - g.px, nz = z - g.pz; const l = Math.hypot(nx, nz); if (l < 0.05) { nx = -g.tz; nz = g.tx; } else { nx /= l; nz /= l; } x = g.px + nx * (g.r.w / 2 + 0.45); z = g.pz + nz * (g.r.w / 2 + 0.45); if (!clearOfRoads(x, z, 0.4)) { counts.lampsDropped++; continue; } }
    }
    if (inBuilding(x, z)) { counts.lampsDropped++; continue; }
    const ck = key(Math.round(x / 3), Math.round(z / 3));
    if (seen.has(ck)) { counts.lampsDropped++; continue; }
    seen.set(ck, 1);
    // the arm points to the way's nearest point (a lamp moved off a carriageway still faces it)
    const to = way ? nearest(x, z, 40, (r) => r === way) : null;
    const yaw = to ? yawOf(to.px - x, to.pz - z) : hash01(id) * TAU;
    // on a trolleybus road the pole carries a span wire: out to the far wire pair (see `trolley` below), in dm
    let span = 0;
    if (to && way.tw && (type === T.MAIN || type === T.MAIN2)) {
      const right = (x - to.px) * -to.tz + (z - to.pz) * to.tx >= 0 ? 1 : -1;
      span = Math.min(255, Math.round(10 * (way.ow ? Math.abs(right * to.d - Math.min(1.8, way.w / 4)) : to.d + way.w / 4)));
    }
    const L = { x, z, yaw, type, way, id, span };
    if (way && type !== T.PARK && !MAIN.has(way.c) && privateAt(x, z)) utilLamps.push(L); else lamps.push(L);
  }
}

// the gaps: a main road, or a way tagged lit=yes, with no mapped lamp within 45 m gets one every 36 m – on the right of
// a one-way carriageway, on alternate sides of a two-way road
{
  const G = 45, grid = new Map(), put = (x, z, own) => { const k = key(Math.floor(x / G), Math.floor(z / G)); let b = grid.get(k); if (!b) grid.set(k, b = []); b.push(x, z, own); };
  const lampNear = (x, z, d, own) => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const b = grid.get(key(Math.floor(x / G) + i, Math.floor(z / G) + j)); if (b) for (let q = 0; q < b.length; q += 3) if (b[q + 2] === own && Math.hypot(b[q] - x, b[q + 1] - z) < d) return true; }
    return false;
  };
  for (const L of [...lamps, ...utilLamps]) put(L.x, L.z, 0);
  const r1 = (v) => Math.round(v * 10) / 10, lit = new Set();
  for (const e of RAW('roads')) { // the raw ways tagged lit=yes, matched to the map's ways by their end points
    if (e.tags?.lit !== 'yes' || !e.geometry?.length) continue;
    const a = proj(e.geometry[0].lat, e.geometry[0].lon), b = proj(e.geometry.at(-1).lat, e.geometry.at(-1).lon);
    lit.add([r1(a[0]), r1(a[1]), r1(b[0]), r1(b[1])].join(','));
  }
  counts.lampsAdded = 0;
  for (const r of roads) {
    if (!r.drive || r.br) continue;
    const main = MAIN.has(r.c);
    if (!main && !(r.k === 'm' && lit.has([r.p[0], r.p[1], r.p.at(-2), r.p.at(-1)].join(',')))) continue;
    const type = main ? (r.n === 'бульвар Шевченка' ? T.MAIN2 : T.MAIN) : STREET.has(r.c) ? T.STREET : T.YARD;
    let run = 18, n = 0;
    for (let k = 0; k + 3 < r.p.length; k += 2) {
      const ax = r.p[k], az = r.p[k + 1], dx = r.p[k + 2] - ax, dz = r.p[k + 3] - az, len = Math.hypot(dx, dz); if (len < 0.01) continue;
      const tx = dx / len, tz = dz / len;
      for (; run < len; run += 36, n++) {
        const side = r.ow ? 1 : n % 2 ? -1 : 1;
        for (const sh of [0, 5, -5, 10, -10]) {
          const s = Math.max(0, Math.min(len, run + sh)), cx = ax + tx * s, cz = az + tz * s;
          const x = cx - tz * side * (r.w / 2 + 0.8), z = cz + tx * side * (r.w / 2 + 0.8);
          if (!inRegion(x, z, 4) || lampNear(cx, cz, 45, 0) || lampNear(x, z, 20, 1)) break;
          if (!clearOfRoads(x, z, 0.6) || inBuilding(x, z, 0.6)) continue;
          let span = 0;
          if (r.tw && main) span = Math.min(255, Math.round(10 * (r.ow ? Math.abs(side * (r.w / 2 + 0.8) - Math.min(1.8, r.w / 4)) : r.w / 2 + 0.8 + r.w / 4)));
          lamps.push({ x, z, yaw: yawOf(cx - x, cz - z), type, way: r, id: 0, span });
          put(x, z, 1); counts.lampsAdded++;
          break;
        }
      }
      run -= len;
    }
  }
}

// ------------------------------------------------------------------------------------------------ utility pole chains
// streets: the residential ways of one name joined end to end; every other way on its own
const chains = [];
{
  const cand = roads.filter((r) => r.drive && !MAIN.has(r.c) && !r.br);
  const ek = (x, z) => Math.round(x * 10) + ',' + Math.round(z * 10);
  const ends = new Map();
  for (const r of cand) {
    if (!r.n || !STREET.has(r.c)) continue;
    const p = r.p;
    for (const [x, z, e] of [[p[0], p[1], 0], [p.at(-2), p.at(-1), 1]]) { const k2 = r.n + '|' + ek(x, z); let a = ends.get(k2); if (!a) ends.set(k2, a = []); a.push([r, e]); }
  }
  const used = new Set(), streets = [];
  const pts = (r, rev) => { const P = []; for (let i = 0; i < r.p.length; i += 2) P.push([r.p[i], r.p[i + 1]]); return rev ? P.reverse() : P; };
  const grow = (S, atEnd) => { // extend the street past its last (or before its first) point while exactly one more way joins there
    for (;;) {
      const tip = atEnd ? S.P.at(-1) : S.P[0], a = (ends.get(S.name + '|' + ek(tip[0], tip[1])) ?? []).filter(([r]) => !used.has(r));
      if (a.length !== 1) return;
      const [r, e] = a[0]; used.add(r); S.ways.add(r);
      const P = pts(r, atEnd ? e === 1 : e === 0);
      if (atEnd) S.P.push(...P.slice(1)); else S.P.unshift(...P.slice(0, -1));
    }
  };
  for (const r of cand) {
    if (used.has(r)) continue;
    used.add(r);
    const S = { name: r.n ?? '', P: pts(r, false), ways: new Set([r]), w: r.w, main: STREET.has(r.c), seed: r.i };
    if (r.n && STREET.has(r.c)) { grow(S, true); grow(S, false); }
    streets.push(S);
  }
  const wayStreet = new Map();
  for (const S of streets) for (const r of S.ways) wayStreet.set(r, S);
  for (const S of streets) {
    S.cum = [0];
    for (let i = 1; i < S.P.length; i++) S.cum.push(S.cum[i - 1] + Math.hypot(S.P[i][0] - S.P[i - 1][0], S.P[i][1] - S.P[i - 1][1]));
    S.len = S.cum.at(-1); S.poles = [];
  }
  const at = (S, s) => { // point and tangent at arc length s
    let i = 1; while (i < S.P.length - 1 && S.cum[i] < s) i++;
    const a = S.P[i - 1], b = S.P[i], l = S.cum[i] - S.cum[i - 1] || 1, t = Math.max(0, Math.min(1, (s - S.cum[i - 1]) / l));
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / l, tz: (b[1] - a[1]) / l };
  };
  const project = (S, x, z) => { // arc length of the nearest point, and the side (+1: right of the direction of S)
    let bd = Infinity, bs = 0, side = 1;
    for (let i = 1; i < S.P.length; i++) {
      const a = S.P[i - 1], b = S.P[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
      const d = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
      if (d < bd) { bd = d; bs = S.cum[i - 1] + Math.sqrt(l2) * t; side = (x - a[0]) * -dz + (z - a[1]) * dx >= 0 ? 1 : -1; }
    }
    return { s: bs, side, d: bd };
  };
  for (const L of utilLamps) {
    const S = wayStreet.get(L.way);
    if (!S) { lamps.push(L); continue; }
    const q = project(S, L.x, L.z);
    S.poles.push({ x: L.x, z: L.z, yaw: L.yaw, lamp: 1, s: q.s, side: q.side });
  }
  // plain poles in the gaps of a street among houses (the named and unnamed streets, not the service ways)
  const SPAN = 38;
  counts.polesAdded = 0;
  for (const S of streets) {
    if (!S.main || S.len < 30) continue;
    S.poles.sort((a, b) => a.s - b.s);
    const side0 = S.poles.length ? null : hash01(S.seed * 7 + 3) < 0.5 ? 1 : -1;
    const anchors = [{ s: 0, edge: 1, side: S.poles[0]?.side ?? side0 }, ...S.poles, { s: S.len, edge: 1, side: S.poles.at(-1)?.side ?? side0 }];
    const add = [];
    for (let i = 1; i < anchors.length; i++) {
      const a = anchors[i - 1], b = anchors[i], s0 = a.edge ? 8 : a.s, s1 = b.edge ? S.len - 8 : b.s, gap = s1 - s0;
      if (gap < (a.edge || b.edge ? 30 : 52)) continue;
      // poles at the open ends themselves, then evenly between
      const first = a.edge ? 0 : 1, n = Math.max(1, Math.round(gap / SPAN)), last = b.edge ? n : n - 1;
      for (let k = first; k <= last; k++) {
        const s = s0 + gap * k / n, side = (a.edge ? b.side : a.side) ?? side0;
        for (const sh of [0, 4, -4, 8, -8]) {
          const q = at(S, Math.max(4, Math.min(S.len - 4, s + sh)));
          const x = q.x + -q.tz * side * (S.w / 2 + 1.1), z = q.z + q.tx * side * (S.w / 2 + 1.1);
          if (!inRegion(x, z, 4) || !privateAt(x, z)) break; // not among houses here: no pole, the chain parts
          if (!clearOfRoads(x, z, 0.9) || inBuilding(x, z, 0.6)) continue;
          add.push({ x, z, yaw: yawOf(q.x - x, q.z - z), lamp: 0, s: s + sh, side });
          break;
        }
      }
    }
    counts.polesAdded += add.length;
    S.poles.push(...add);
  }
  for (const S of streets) {
    if (!S.poles.length) continue;
    S.poles.sort((a, b) => a.s - b.s);
    let run = [];
    const flush = () => { if (run.length > 1 || run[0]?.lamp) chains.push(run); run = []; }; // a lone pole with no lamp and no wires is nothing
    for (const p of S.poles) {
      const q = run.at(-1);
      if (q && Math.hypot(p.x - q.x, p.z - q.z) < 6) continue; // a synthesised pole next to a mapped one
      if (q && Math.hypot(p.x - q.x, p.z - q.z) > 72) flush();
      run.push(p);
    }
    flush();
  }
  counts.chains = chains.length;
  counts.chainPoles = chains.reduce((n, c) => n + c.length, 0);
  counts.chainLamps = chains.reduce((n, c) => n + c.filter((p) => p.lamp).length, 0);
}

// ------------------------------------------------------------------------------------------------ trolleybus wires
// one polyline per way and direction: the pair hangs over the middle of that direction's half of the carriageway
const trolley = [];
for (const r of roads) {
  if (!r.tw || !r.drive || r.br) continue;
  const P = []; for (let i = 0; i < r.p.length; i += 2) if (inRegion(r.p[i], r.p[i + 1], -60)) P.push(r.p[i], r.p[i + 1]);
  if (P.length < 4) continue;
  for (const off of r.ow ? [Math.min(1.8, r.w / 4)] : [r.w / 4, -r.w / 4]) trolley.push({ off, P });
}
counts.trolleyKm = +(trolley.reduce((n, t) => { let l = 0; for (let i = 2; i < t.P.length; i += 2) l += Math.hypot(t.P[i] - t.P[i - 2], t.P[i + 1] - t.P[i - 1]); return n + l; }, 0) / 1000).toFixed(1);

// ------------------------------------------------------------------------------------------------ amenities
const centre = (e) => { if (e.type === 'node') return proj(e.lat, e.lon); const g = e.geometry; if (!g?.length) return null; let x = 0, z = 0; for (const q of g) { const p = proj(q.lat, q.lon); x += p[0]; z += p[1]; } return [x / g.length, z / g.length]; };
const bearing = (deg) => { const a = deg * Math.PI / 180, e = Math.sin(a), n = Math.cos(a); return [e * CR + n * SR, e * SR - n * CR]; };
const CARD = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
const byId = (a, b) => a.id - b.id;
const benches = [], bins = [], containers = [], shelters = [], stops = [], cross = [];
for (const e of poi.filter((e) => e.tags?.amenity === 'bench').sort(byId)) {
  const c = centre(e); if (!c || !inRegion(c[0], c[1], 4)) continue;
  const [x, z] = c;
  if (!clearOfRoads(x, z, 0.3) || inBuilding(x, z, 0.3)) continue;
  // a bench looks where its `direction` says, else along a way of its own, else at the nearest path or road
  let fx = 0, fz = 0;
  const dir = e.tags.direction, deg = dir != null ? (CARD[dir] ?? parseFloat(dir)) : NaN;
  if (Number.isFinite(deg)) [fx, fz] = bearing(deg);
  else if (e.type === 'way' && e.geometry.length >= 2) { const a = proj(e.geometry[0].lat, e.geometry[0].lon), b = proj(e.geometry.at(-1).lat, e.geometry.at(-1).lon); fx = -(b[1] - a[1]); fz = b[0] - a[0]; }
  else { const p = nearest(x, z, 15, (r) => r.foot || r.drive); if (p && p.d > 0.2) { fx = p.px - x; fz = p.pz - z; } else { const a = hash01(e.id) * TAU; fx = Math.cos(a); fz = Math.sin(a); } }
  // local +z is the way the sitter looks: +z -> (sin ry, cos ry)
  benches.push({ x, z, c: yaw64(Math.atan2(fx, fz)) | (e.tags.backrest === 'no' ? 0 : 64) });
}
for (const e of poi.filter((e) => e.tags?.amenity === 'waste_basket' && e.type === 'node').sort(byId)) {
  const [x, z] = proj(e.lat, e.lon);
  if (inRegion(x, z, 4) && clearOfRoads(x, z, 0.3) && !inBuilding(x, z, 0.3)) bins.push({ x, z });
}
{
  // OSM often maps every dumpster of a row as its own node: the nodes within 8 m of one another are one site, with
  // as many containers as nodes (2-4); a lone node gets 2-4 by its id
  const groups = [];
  for (const e of poi.filter((e) => e.tags?.amenity === 'waste_disposal').sort(byId)) {
    const c = centre(e); if (!c || !inRegion(c[0], c[1], 6)) continue;
    const near = groups.filter((g) => g.pts.some((q) => Math.hypot(q[0] - c[0], q[1] - c[1]) < 8));
    const g = near[0] ?? (groups.push({ id: e.id, pts: [] }), groups.at(-1));
    g.pts.push(c);
    for (const o of near.slice(1)) { g.pts.push(...o.pts); groups.splice(groups.indexOf(o), 1); } // the node joined two groups
  }
  counts.containerNodes = groups.reduce((n, g) => n + g.pts.length, 0);
  for (const g of groups) {
    const cx = g.pts.reduce((s, q) => s + q[0], 0) / g.pts.length, cz = g.pts.reduce((s, q) => s + q[1], 0) / g.pts.length;
    const moved = offRoads(cx, cz, 1.7); if (!moved) continue;
    const [x, z] = moved;
    if (inBuilding(x, z, 1.2) || containers.some((q) => Math.hypot(q.x - x, q.z - z) < 8)) continue;
    // the open side looks at the way the bin lorry comes by
    const p = nearest(x, z, 30, isDrive), a = p ? Math.atan2(p.px - x, p.pz - z) : hash01(g.id) * TAU;
    const n = g.pts.length > 1 ? Math.min(4, g.pts.length) : 2 + Math.floor(hash01(g.id * 3 + 1) * 3);
    containers.push({ x, z, c: yaw64(a) | n << 6 });
  }
}
{
  const rects = [];
  for (const e of poi.filter((e) => e.tags?.amenity === 'shelter' && e.tags.shelter_type === 'public_transport' && e.type === 'way' && e.geometry?.length >= 4).sort(byId)) {
    const P = e.geometry.slice(0, -1).map((g) => proj(g.lat, g.lon)), [cx, cz] = [P.reduce((s, p) => s + p[0], 0) / P.length, P.reduce((s, p) => s + p[1], 0) / P.length];
    if (!inRegion(cx, cz, 6)) continue;
    const mr = minAreaRect(P);
    rects.push({ id: e.id, x: cx, z: cz, len: Math.max(3, Math.min(9, mr.long)), depth: Math.max(1.4, Math.min(2.2, mr.short)), P });
  }
  const stopNodes = street.filter((e) => e.type === 'node' && e.tags?.highway === 'bus_stop').sort(byId).map((e) => ({ id: e.id, t: e.tags, p: proj(e.lat, e.lon) })).filter((s) => inRegion(s.p[0], s.p[1], 6));
  for (const s of stopNodes) if (s.t.shelter === 'yes' && !rects.some((q) => Math.hypot(q.x - s.p[0], q.z - s.p[1]) < 25)) rects.push({ id: s.id, x: s.p[0], z: s.p[1], len: 4.4, depth: 1.6, P: null });
  for (const q of rects) {
    const m = nearest(q.x, q.z, 30, (r) => r.drive && r.c !== 'service') ?? nearest(q.x, q.z, 30, isDrive);
    if (!m || m.r.br) continue;
    // long axis: the outline's own, else along the road; the open front looks at the road
    let ux = m.tx, uz = m.tz;
    if (q.P) { let best = 0; for (let i = 0; i < q.P.length; i++) { const a = q.P[i], b = q.P[(i + 1) % q.P.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > best) { best = l; ux = (b[0] - a[0]) / l; uz = (b[1] - a[1]) / l; } } }
    let fx = -uz, fz = ux; if (fx * (m.px - q.x) + fz * (m.pz - q.z) < 0) { fx = -fx; fz = -fz; }
    const moved = offRoads(q.x, q.z, q.depth / 2 + 0.5); if (!moved) continue;
    let [x, z] = moved;
    // the whole footprint as it will stand (the yaw in 1/64 turns), not only its middle: an angled or long shelter is
    // stepped back from the road until its corners are off every carriageway
    const yaw = yaw64(Math.atan2(fx, fz)), ry = yaw * TAU / 64, qfx = Math.sin(ry), qfz = Math.cos(ry), qux = Math.cos(ry), quz = -Math.sin(ry);
    const fits = (x, z) => { for (const a of [-1, -0.5, 0, 0.5, 1]) for (const b of [-1, 1]) if (!clearOfRoads(x + qux * a * q.len / 2 + qfx * b * q.depth / 2, z + quz * a * q.len / 2 + qfz * b * q.depth / 2, 0.25)) return false; return true; };
    let back = 0; while (back < 3 && !fits(x - qfx * back, z - qfz * back)) back += 0.5;
    if (back >= 3) { counts.sheltersDropped = (counts.sheltersDropped ?? 0) + 1; continue; }
    x -= qfx * back; z -= qfz * back;
    if (inBuilding(x, z, 0.8)) continue;
    shelters.push({ x, z, yaw, len: q.len, depth: q.depth });
    // its sign: at the kerb by the end the bus leaves from
    const fwd = m.r.ow || (m.tx * fz - m.tz * fx) < 0 ? 1 : -1; // the direction of travel on the shelter's side (it drives on the right)
    const sx = x + ux * Math.sign(ux * m.tx * fwd + uz * m.tz * fwd || 1) * (q.len / 2 + 0.9) + fx * (q.depth / 2 + 0.1), sz = z + uz * Math.sign(ux * m.tx * fwd + uz * m.tz * fwd || 1) * (q.len / 2 + 0.9) + fz * (q.depth / 2 + 0.1);
    if (clearOfRoads(sx, sz, 0.35) && !inBuilding(sx, sz, 0.3)) stops.push({ x: sx, z: sz, c: yaw64(Math.atan2(-m.tx * fwd, -m.tz * fwd)) });
  }
  for (const s of stopNodes) { // a stop with no shelter: the sign alone
    if (shelters.some((q) => Math.hypot(q.x - s.p[0], q.z - s.p[1]) < 28)) continue;
    const m = nearest(s.p[0], s.p[1], 20, (r) => r.drive && r.c !== 'service'); if (!m || m.r.br) continue;
    const moved = offRoads(s.p[0], s.p[1], 0.5); if (!moved || inBuilding(moved[0], moved[1], 0.3)) continue;
    const right = (moved[0] - m.px) * -m.tz + (moved[1] - m.pz) * m.tx >= 0 ? 1 : -1, fwd = m.r.ow ? 1 : right;
    stops.push({ x: moved[0], z: moved[1], c: yaw64(Math.atan2(-m.tx * fwd, -m.tz * fwd)) });
  }
}
for (const e of street.filter((e) => e.type === 'node' && e.tags?.highway === 'crossing').sort(byId)) {
  const t = e.tags, kind = t.crossing ?? '', mark = t['crossing:markings'] ?? '';
  if (kind === 'traffic_signals' || t['crossing:signals'] === 'yes' || kind === 'unmarked' || mark === 'no') continue;
  if (!(kind === 'marked' || kind === 'zebra' || kind === 'uncontrolled' || mark === 'yes' || mark === 'zebra')) continue;
  const [x, z] = proj(e.lat, e.lon); if (!inRegion(x, z, 8)) continue;
  const m = nearest(x, z, 3, (r) => r.drive && r.c !== 'service' && r.c !== 'track'); if (!m || m.r.br) continue;
  for (const side of [1, -1]) { // the sign on the right of each direction, a step before the zebra, facing the traffic
    const fwd = m.r.ow ? 1 : side;
    const sx = x + -m.tz * side * (m.r.w / 2 + 0.7) - m.tx * fwd * 1.6, sz = z + m.tx * side * (m.r.w / 2 + 0.7) - m.tz * fwd * 1.6;
    if (clearOfRoads(sx, sz, 0.45) && !inBuilding(sx, sz, 0.3)) cross.push({ x: sx, z: sz, c: yaw64(Math.atan2(-m.tx * fwd, -m.tz * fwd)) });
  }
}

// ------------------------------------------------------------------------------------------------ output
const dm = (v) => Math.round(v * 10);
// delta-coded [dx, dz, ...extra] in an order that keeps neighbours together (64 m cells, then x)
function pack(list, extra) {
  const cell = (p) => Math.floor(p.z / 64) * 4096 + Math.floor(p.x / 64);
  const L = [...list].sort((a, b) => cell(a) - cell(b) || a.x - b.x || a.z - b.z), out = [];
  let px = 0, pz = 0;
  for (const p of L) { const x = dm(p.x), z = dm(p.z); out.push(x - px, z - pz, ...extra(p)); px = x; pz = z; }
  return out;
}
const out = {
  v: 1,
  attribution: 'Map data (c) OpenStreetMap contributors, ODbL',
  counts: null,
  lamps: pack(lamps, (p) => [p.type | yaw64(p.yaw) << 3 | p.span << 9]),
  chains: chains.map((c) => { const o = []; let px = 0, pz = 0; for (const p of c) { const x = dm(p.x), z = dm(p.z); o.push(x - px, z - pz, p.lamp | yaw64(p.yaw) << 1); px = x; pz = z; } return o; }),
  trolley: trolley.map((t) => { const o = [dm(t.off)]; let px = 0, pz = 0; for (let i = 0; i < t.P.length; i += 2) { const x = dm(t.P[i]), z = dm(t.P[i + 1]); o.push(x - px, z - pz); px = x; pz = z; } return o; }),
  benches: pack(benches, (p) => [p.c]), bins: pack(bins, () => []), containers: pack(containers, (p) => [p.c]),
  shelters: shelters.flatMap((s) => [dm(s.x), dm(s.z), s.yaw, dm(s.len), dm(s.depth)]),
  stops: pack(stops, (p) => [p.c]), cross: pack(cross, (p) => [p.c]),
};
const byType = [0, 0, 0, 0, 0]; for (const l of lamps) byType[l.type]++;
out.counts = { ...counts, lamps: lamps.length, main: byType[0], main2: byType[1], street: byType[2], yard: byType[3], park: byType[4], onTrolley: lamps.filter((l) => l.span).length,
  benches: benches.length, bins: bins.length, containers: containers.length, shelters: shelters.length, stops: stops.length, cross: cross.length };
const json = JSON.stringify(out);
writeFileSync(ASSET('map_street.json'), json);
console.log(out.counts);
console.log('map_street.json', (json.length / 1024).toFixed(0), 'KB');
