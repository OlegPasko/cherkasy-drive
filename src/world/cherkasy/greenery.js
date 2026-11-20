// Tree spots for the Cherkasy map (fed to src/world/trees.js buildTrees): the OSM-mapped trees, chestnut / linden rows
// along the streets with Lombardy poplars mixed in, pine stands in the forests (the Sosnovyi bir pine forest wraps the
// city on the north-west and north), park groves, sparse courtyards between the Soviet blocks (poplars, birches and
// broad crowns lifted high, so the blocks show under them; lawns stay mostly open) and fruit trees in the private
// sector. No street rows along BARE_ROADS or on farmland, no yard trees in the fields, no generated trees on small
// roundabout islands (roundaboutIslands, issue #36). Spots keep off carriageways,
// water, buildings (1 m raster, grown ~1.5 m) and junction mouths, sports pitches and running tracks, and keep a
// minimum spacing.
//
//   footprintRaster(footprints, region) -> BitRaster (1 m) of the building footprints (also people.js isBuilding)
//   BARE_ROADS: Set of OSM road names with no generated street rows
//   roundaboutIslands(map) -> [{ c: [x, z], r }]   the roundabouts' central islands (closed rings of road pieces)
//   treeSpots({ map, ground, footprints, occ?, y = 0.15, clear = [], extra = [], sparse = null, plus = true, doors = null }) -> spots
//     ground: { heightAt, onAsphalt, isWater, wetSegs? };  clear: [(x, z) -> bool] | (x, z) -> bool: no generated tree
//     there (hand-built sites);
//     doors: the entrances' index (doorways.js doorIndex) – no generated tree in a door's approach (stats.doors: how
//     many that took out); an OSM-mapped tree is a real one: it steps along the wall to the approach's side, at
//     most 3.5 m (stats.doorsMoved), and stays put where there is no room for that (stats.doorsOsm);
//     extra: hand-placed spots appended as given;  sparse(x, z) -> 0..1 thinning of generated trees (the sandy shore)
//     spot: { x, z, y, kind: 'street' | 'park' | 'elm' | 'small' | 'conifer', sc, pal, s3?, variant?, wash? }
//     plus (the greenery upgrade; off = the planting before it, tree for tree, for the ?notreeplus A/B): a street is
//     an alley of one species picked by its name (lindens, chestnuts - бульвар Шевченка's chestnut alley -, maples,
//     elms, or the old linden / chestnut mix) in two shapes, with a young tree here and there where an old one was
//     felled, and on some streets limewashed trunks (wash); Lombardy poplars are full-width columns; the pine woods
//     are Scots pines in two shapes with few spruces; weeping willows stand along the Dnipro shore and round the
//     ponds; fruit trees in the private yards are limewashed in places. Shrubs are shrubbery.js.
import { PARK_GREENS, PARK_PINE, PAL } from '../trees.js';
import { ringPts, triangulate, BitRaster, rng, bboxOf, inPoly } from './geo.js';
import { TREE_R } from './doorways.js';

// Country roads with no planted rows (issue #34): the road out of Lunacharka to Heronymivka runs between fields and
// the dachas with bare verges; the village's own trees start past the map's edge. Their OSM-mapped trees still grow.
export const BARE_ROADS = new Set(['вулиця Онопрієнка']);

// Roundabout islands (issue #36: the ring at Lunacharka by the АТБ is a lawn): map.json keeps no junction tag, so a
// roundabout is found as a closed chain of short motor-road pieces (arcs bending one way, or short links between
// entries) whose points all lie at nearly one radius from their centre. -> [{ c: [x, z], r }] r: the island's radius
// (to 2 m inside the ring's centre line).
export function roundaboutIslands(map) {
  const key = (x, z) => `${Math.round(x * 2)},${Math.round(z * 2)}`, edges = [], at = new Map(), loops = [];
  for (const rd of map.roads ?? []) {
    if (rd.k !== 'm' || rd.br) continue;
    const p = rd.p, n = p.length / 2;
    let len = 0, turn = 0, pos = 0, neg = 0;
    for (let i = 1; i < n; i++) len += Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]);
    if (len > 400) continue;
    const closed = n > 3 && Math.hypot(p[0] - p[2 * n - 2], p[1] - p[2 * n - 1]) < 0.5;
    if (len > 140 && !closed) continue;
    for (let i = 2; i < n; i++) {
      const ax = p[2 * i - 2] - p[2 * i - 4], az = p[2 * i - 1] - p[2 * i - 3], bx = p[2 * i] - p[2 * i - 2], bz = p[2 * i + 1] - p[2 * i - 1];
      const a = Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
      turn += a; if (a > 0.01) pos++; else if (a < -0.01) neg++;
    }
    if (!(len < 20 || (Math.abs(turn) > 0.25 && (pos === 0 || neg === 0)))) continue;
    const e = { a: key(p[0], p[1]), b: key(p[2 * n - 2], p[2 * n - 1]), len, rd };
    if (closed) { loops.push([e]); continue; } // a ring drawn as one way
    edges.push(e);
    for (const k of [e.a, e.b]) (at.get(k) ?? at.set(k, []).get(k)).push(e);
  }
  const found = [], island = (path) => {
    const pts = path.flatMap((e) => Array.from({ length: e.rd.p.length / 2 }, (_, i) => [e.rd.p[2 * i], e.rd.p[2 * i + 1]]));
    const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length, cz = pts.reduce((s, q) => s + q[1], 0) / pts.length;
    const rs = pts.map(([x, z]) => Math.hypot(x - cx, z - cz)), r0 = Math.min(...rs), r1 = Math.max(...rs);
    if (r1 > 60 || r0 < 6 || r1 / r0 > 1.45) return;
    if (found.some((q) => Math.hypot(q.c[0] - cx, q.c[1] - cz) < 8)) return;
    // the drawn carriageway is often narrower than map.json's width: the island reaches to 2 m short of the ring's
    // centre line (no tree stands on the asphalt anyway)
    found.push({ c: [cx, cz], r: Math.max(r0 - Math.max(...path.map((e) => e.rd.w)) / 2, r0 - 2) });
  };
  for (const l of loops) island(l);
  for (const e0 of edges) {
    // depth-first round from e0's end back to its start over the other pieces (at most 10, 400 m)
    const path = [e0], used = new Set([e0]);
    const walk = (node, len) => {
      if (node === e0.a && path.length >= 3) return true;
      if (path.length >= 10) return false;
      for (const e of at.get(node) ?? []) {
        if (used.has(e) || len + e.len > 400) continue;
        used.add(e); path.push(e);
        if (walk(e.a === node ? e.b : e.a, len + e.len)) return true;
        used.delete(e); path.pop();
      }
      return false;
    };
    if (walk(e0.b, e0.len)) island(path);
  }
  return found.filter((q) => q.r > 2);
}

export function footprintRaster(footprints, R) {
  const occ = new BitRaster(R.x0 - 50, R.z0 - 50, R.x1 + 50, R.z1 + 50, 1);
  for (const f of footprints) {
    const { pts, tris } = triangulate(f.poly, []);
    for (const [a, b, c] of tris) occ.tri(pts[a][0], pts[a][1], pts[b][0], pts[b][1], pts[c][0], pts[c][1]);
  }
  return occ;
}

// weeping willows: lighter, yellower than the park greens
const WILLOW = [[[0.05, 0.092, 0.02], [0.16, 0.235, 0.05]], [[0.044, 0.085, 0.022], [0.14, 0.215, 0.055]]];
const hashS = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
const hash3 = (x, z, k) => { const q = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return q - Math.floor(q); };
// the species of a street's rows, by its name (an alley is planted as one): [species, limewashed trunks, only (no
// stretch of poplars takes its place)]
function alleyOf(rd) {
  const name = rd.n ?? '', h = name ? hashS(name) : 1, wash = name ? hashS(name + '#') < 0.42 : false;
  if (/бульвар.*Шевченка/.test(name)) return ['chestnut', true, true];
  return [h < 0.36 ? 'linden' : h < 0.58 ? 'chestnut' : h < 0.72 ? 'maple' : h < 0.8 ? 'elm' : 'mix', wash, false];
}

export function treeSpots({ map, ground, footprints, occ = null, y = 0.15, clear = [], extra = [], sparse = null, plus = true, doors = null }) {
  const t0 = performance.now();
  const R = map.region, r = rng(7);
  occ ??= footprintRaster(footprints, R);
  const cover = (keys, c) => { // a raster of some cover kinds
    const q = new BitRaster(R.x0, R.z0, R.x1, R.z1, c);
    for (const key of keys) for (const rings of map.cover[key] ?? []) {
      const { pts, tris } = triangulate(ringPts(rings[0]), rings.slice(1).map(ringPts));
      for (const [a, b, c] of tris) q.tri(pts[a][0], pts[a][1], pts[b][0], pts[b][1], pts[c][0], pts[c][1]);
    }
    return q;
  };
  // sports grounds (pitches, running tracks) are open turf: no tree on them, whatever lawn or park lies around
  const sport = cover(['pitch', 'track'], 2);
  const taken = (x, z) => occ.get(x, z) === 1 || sport.get(x, z) === 1 || ground.onAsphalt(x, z) || ground.isWater(x, z);
  const blocked = (x, z, m = 2) => taken(x, z) || taken(x + m, z) || taken(x - m, z) || taken(x, z + m) || taken(x, z - m);
  const inRegion = (x, z) => x >= R.x0 && x <= R.x1 && z >= R.z0 && z <= R.z1;

  // spacing: 4 m buckets of placed trees
  const B = 4, buckets = new Map(), bk = (i, j) => i * 131072 + j;
  const crowded = (x, z, d) => {
    const ci = Math.floor(x / B), cj = Math.floor(z / B), k = Math.ceil(d / B);
    for (let i = ci - k; i <= ci + k; i++) for (let j = cj - k; j <= cj + k; j++) {
      const a = buckets.get(bk(i, j));
      if (a) for (let q = 0; q < a.length; q += 2) if ((a[q] - x) ** 2 + (a[q + 1] - z) ** 2 < d * d) return true;
    }
    return false;
  };
  const spots = [];
  const put = (x, z, kind, sc, pal, s3, variant, wash) => {
    const k = bk(Math.floor(x / B), Math.floor(z / B));
    (buckets.get(k) ?? buckets.set(k, []).get(k)).push(x, z);
    spots.push({ x, z, y: ground.heightAt(x, z) + y, kind, sc, pal, s3, variant, wash });
  };
  const skip = () => {};
  // urban trees are old and tall: crowns start well above a car roof, so the blocks stay visible under them
  const LIFT = [0.82, 1.3, 0.82];
  // Lombardy poplars: 18-28 m columns, 3-4 m wide (before the upgrade: pencils)
  const poplarS3 = () => (plus ? [0.8, 1.7 + r() * 0.5, 0.8] : [0.4, 1.8 + r() * 0.5, 0.4]);
  // the upgrade's own picks never touch the planting's random stream: they hash the place
  const pineOf = (x, z) => { if (!plus) return undefined; const h = hash3(x, z, 11); return h < 0.47 ? 'pine' : h < 0.9 ? 'pine2' : 'spruce'; };
  const rowTree = (plant, x, z, sc, pal, alley, wash) => {
    const h = hash3(x, z, 12), g = hash3(x, z, 13);
    if (g < 0.07) return plant(x, z, 'small', 0.85 + 0.5 * h, pal, null, 'sapling', wash); // a young tree in an old row
    const sp = alley === 'mix' || g > 0.93 ? (hash3(x, z, 14) < 0.55 ? 'linden' : 'chestnut') : alley;
    plant(x, z, 'street', sc, pal, LIFT, sp === 'linden' || sp === 'chestnut' ? sp + (h < 0.5 ? '' : '2') : sp, wash);
  };
  const birchS3 = () => [0.8, 1.2 + r() * 0.15, 0.8];
  const thinned = (x, z) => !!sparse && r() < 0.88 * sparse(x, z); // generated trees only; OSM trees always stay
  const green = () => (r() < 0.12 ? [PAL[Math.floor(r() * 3)]] : PARK_GREENS);
  const pineAt = (x, z) => z < -1800 || (x < -2600 && z < 600);
  const counts = {};
  const mark = (name, n0) => { counts[name] = spots.length - n0; };

  // 1) mapped trees
  let n0 = spots.length;
  for (const [x, z] of map.trees) {
    if (blocked(x, z, 0.8) || crowded(x, z, 3)) continue;
    const pine = pineAt(x, z), kind = pine && r() < 0.5 ? 'conifer' : 'street';
    put(x, z, kind, 0.8 + r() * 0.5, pine ? PARK_PINE : green(), undefined, kind === 'conifer' ? pineOf(x, z) : undefined);
  }
  mark('osm', n0);

  // 2) street rows, both sides of the main streets and some sides of the residential ones; none along the country
  // roads in BARE_ROADS or on farmland (fields have no planted rows; OSM-mapped rows stay, step 1)
  n0 = spots.length;
  const MAIN = /^(trunk|primary|secondary|tertiary)$/;
  const farm = cover(['farm'], 4);
  for (const rd of map.roads) {
    const main = MAIN.test(rd.c);
    if (rd.k !== 'm' || !(main || rd.c === 'residential' || rd.c === 'unclassified')) continue;
    const bareRoad = BARE_ROADS.has(rd.n);
    const off = rd.w / 2 + (main ? 2.0 : 1.4), step = main ? 12 : 15, poplar = r() < (main ? 0.3 : 0.15);
    const [alley, wash, only] = plus ? alleyOf(rd) : ['mix', false, false];
    for (const side of [-1, 1]) {
      if (!main && r() < 0.5) continue;
      let s = r() * step;
      for (let i = 2; i + 1 < rd.p.length; i += 2) {
        const ax = rd.p[i - 2], az = rd.p[i - 1], ex = rd.p[i] - ax, ez = rd.p[i + 1] - az, L = Math.hypot(ex, ez);
        if (L < 1) continue;
        const ux = ex / L, uz = ez / L;
        for (; s < L; s += step * (0.85 + r() * 0.3)) {
          const x = ax + ux * s - uz * side * off, z = az + uz * s + ux * side * off;
          if (!inRegion(x, z) || blocked(x, z, 1.6) || crowded(x, z, 6) || thinned(x, z)) continue;
          // a bare spot still draws its random numbers: the trees elsewhere keep their places
          const plant = bareRoad || farm.get(x, z) === 1 ? skip : put;
          if (poplar) {
            const sc = 1.1 + r() * 0.3, pal = green(), s3 = poplarS3(); // drawn whatever is planted: the stream stays
            if (only) rowTree(plant, x, z, sc, pal, alley, wash); // the boulevard's chestnut alley has no poplar stretch
            else plant(x, z, 'conifer', sc, pal, s3, undefined, wash);
          } else if (plus) rowTree(plant, x, z, 1.0 + r() * 0.4, green(), alley, wash);
          else plant(x, z, 'street', 1.0 + r() * 0.4, green(), LIFT);
        }
        s -= L;
      }
    }
  }
  mark('street', n0);

  // 3) forests and parks: jittered grids over the polygons (inside the playable region)
  n0 = spots.length;
  const scatter = (rings, spacing, place) => {
    const outer = ringPts(rings[0]), holes = rings.slice(1).map(ringPts), bb = bboxOf(outer);
    if (bb.x1 < R.x0 || bb.x0 > R.x1 || bb.z1 < R.z0 || bb.z0 > R.z1) return;
    for (let gx = Math.max(bb.x0, R.x0); gx < Math.min(bb.x1, R.x1); gx += spacing) {
      for (let gz = Math.max(bb.z0, R.z0); gz < Math.min(bb.z1, R.z1); gz += spacing) {
        const x = gx + (r() - 0.5) * spacing * 0.9, z = gz + (r() - 0.5) * spacing * 0.9;
        if (inPoly(outer, x, z) && !holes.some((h) => inPoly(h, x, z))) place(x, z);
      }
    }
  };
  for (const rings of map.cover.forest ?? []) scatter(rings, 6.5, (x, z) => {
    if (blocked(x, z, 1.2) || crowded(x, z, 4.2) || thinned(x, z)) return;
    if (pineAt(x, z) ? r() < 0.85 : r() < 0.25) put(x, z, 'conifer', 1.1 + r() * 0.6, PARK_PINE, [0.85, 1.35 + r() * 0.4, 0.85], pineOf(x, z));
    else put(x, z, r() < 0.7 ? 'park' : 'elm', 0.8 + r() * 0.5, green());
  });
  for (const key of ['park', 'grass', 'orchard', 'scrub']) {
    const park = key === 'park';
    for (const rings of map.cover[key] ?? []) scatter(rings, park ? 9 : 13, (x, z) => {
      // lawns (grass, scrub) keep only scattered trees: in the real courtyards they are open ground
      if (r() < (park ? 0.5 : key === 'orchard' ? 0.72 : 0.88) || blocked(x, z, 1.5) || crowded(x, z, park ? 6.5 : 9) || thinned(x, z)) return;
      if (key === 'orchard') return put(x, z, 'small', 0.7 + r() * 0.6, green());
      const q = r();
      if (q < 0.12) put(x, z, 'conifer', 1.0 + r() * 0.3, green(), poplarS3());
      else if (q < 0.3) put(x, z, 'park', 0.9 + r() * 0.3, green(), birchS3(), 'birch');
      else put(x, z, r() < 0.55 ? 'park' : r() < 0.6 ? 'street' : 'elm', 0.8 + r() * 0.5, green(), LIFT);
    });
  }
  mark('park', n0);

  // 4) yards: sparse trees on the open land between the buildings; where small houses cluster (private sector,
  // 4+ houses per 60 m cell) fruit trees instead of big lindens / poplars; industrial zones mostly bare
  n0 = spots.length;
  const houses = new Map(), hk = (x, z) => Math.floor(x / 60) * 65536 + Math.floor(z / 60);
  for (const f of footprints) if (f.kind === 'house') { const k = hk(f.poly[0][0], f.poly[0][1]); houses.set(k, (houses.get(k) || 0) + 1); }
  const indus = cover(['industrial'], 4);
  for (let gx = R.x0; gx < R.x1; gx += 12) {
    for (let gz = R.z0; gz < R.z1; gz += 12) {
      const x = gx + r() * 12, z = gz + r() * 12, privateSector = (houses.get(hk(x, z)) || 0) >= 4;
      if (r() > (privateSector ? 0.22 : 0.2) || blocked(x, z, 2.5) || crowded(x, z, privateSector ? 7 : 11) || thinned(x, z)) continue;
      if (r() < 0.6 && indus.get(x, z) === 1) continue;
      const plant = farm.get(x, z) === 1 ? skip : put; // ploughed fields stay open
      if (privateSector) { plant(x, z, 'small', 0.7 + r() * 0.5, green(), undefined, undefined, plus && hash3(Math.floor(x / 60), Math.floor(z / 60), 15) < 0.5); continue; }
      // between the blocks: pyramidal poplars and birches are slim, the broad crowns are lifted
      const q = r();
      if (q < 0.3) plant(x, z, 'conifer', 1.1 + r() * 0.35, green(), poplarS3());
      else if (q < 0.5) plant(x, z, 'park', 1.0 + r() * 0.3, green(), birchS3(), 'birch');
      else plant(x, z, r() < 0.5 ? 'street' : r() < 0.6 ? 'park' : 'elm', 1.0 + r() * 0.4, green(), LIFT);
    }
  }
  mark('yards', n0);

  // 5) weeping willows by the water (the upgrade): along the Dnipro shore every 30-60 m, a few metres inland, and
  // round the ponds. Their own random stream; the sandy beaches stay thin (sparse)
  n0 = spots.length;
  if (plus) {
    const w = rng(91);
    const willow = (x, z) => {
      if (!inRegion(x, z) || ground.isWater(x, z) || blocked(x, z, 2) || crowded(x, z, 10) || (sparse && w() < 0.88 * sparse(x, z))) return;
      put(x, z, 'park', 0.85 + w() * 0.45, WILLOW, undefined, 'willow');
    };
    let left = 12;
    for (const q of ground.wetSegs ?? []) {
      left -= Math.hypot(q.bx - q.ax, q.bz - q.az);
      if (left > 0) continue;
      left = 30 + w() * 30;
      const t = w(), mx = q.ax + (q.bx - q.ax) * t, mz = q.az + (q.bz - q.az) * t, sgn = ground.isWater(mx + q.nx * 4, mz + q.nz * 4) ? -1 : 1, d = 4 + w() * 6;
      willow(mx + sgn * q.nx * d, mz + sgn * q.nz * d);
    }
    for (const rings of map.cover.pond ?? []) {
      const P = ringPts(rings[0]), cx = P.reduce((a, q) => a + q[0], 0) / P.length, cz = P.reduce((a, q) => a + q[1], 0) / P.length;
      let run = w() * 14, n = 0;
      for (let i = 0; i < P.length && n < 6; i++) {
        const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (; run < L && n < 6; run += 16 + w() * 14) {
          const x = a[0] + (b[0] - a[0]) * run / L, z = a[1] + (b[1] - a[1]) * run / L, dl = Math.hypot(x - cx, z - cz) || 1, d = 3 + w() * 4;
          const before = spots.length; willow(x + (x - cx) / dl * d, z + (z - cz) / dl * d); n += spots.length - before;
        }
        run -= L;
      }
    }
  }
  mark('willows', n0);

  // small roundabout islands are mown lawns: no generated tree in them (the OSM-mapped ones, first in spots, stay)
  const islands = roundaboutIslands(map).filter((q) => q.r <= 22), nOsm = counts.osm;
  const lawn = (s, i) => i >= nOsm && islands.some((q) => Math.hypot(s.x - q.c[0], s.z - q.c[1]) < q.r + 0.5);
  const grown = spots.filter((s, i) => !lawn(s, i));
  counts.islands = spots.length - grown.length;
  const cleared = typeof clear === 'function' ? clear : clear.length ? (x, z) => clear.some((f) => f(x, z)) : null;
  let kept = cleared ? grown.filter((s) => !cleared(s.x, s.z)) : grown;
  counts.cleared = grown.length - kept.length;
  // nothing planted in front of a door (the last filter, like the two above: the other trees keep their places).
  // A mapped tree is a real one, the door is ours: it steps along the wall to the nearer side of the approach, else
  // to the other, if the spot is free; else it stays
  if (doors?.n) {
    const mapped = new Set(spots.slice(0, nOsm)), n = kept.length;
    counts.doorsOsm = counts.doorsMoved = 0;
    const aside = (s, d) => {
      const q = doors.door(d), tx = -q.nz, tz = q.nx, a = (s.x - q.x) * tx + (s.z - q.z) * tz, half = q.hw + doors.side + TREE_R + 0.05;
      for (const sg of a >= 0 ? [1, -1] : [-1, 1]) {
        const step = sg * half - a, x = s.x + tx * step, z = s.z + tz * step;
        if (Math.abs(step) > 3.5 || blocked(x, z, 0.8) || doors.at(x, z, TREE_R) >= 0 || (cleared && cleared(x, z))) continue; // not onto a site's ground either
        s.x = x; s.z = z; s.y = ground.heightAt(x, z) + y;
        return true;
      }
      return false;
    };
    kept = kept.filter((s) => {
      const d = doors.at(s.x, s.z, TREE_R);
      if (d < 0) return true;
      if (!mapped.has(s)) return false;
      if (aside(s, d)) counts.doorsMoved++; else counts.doorsOsm++;
      return true;
    });
    counts.doors = n - kept.length;
  }
  counts.extra = extra.length;
  const out = kept.concat(extra);
  out.stats = { ...counts, total: out.length, ms: Math.round(performance.now() - t0) };
  return out;
}
