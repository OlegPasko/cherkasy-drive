// Tree spots for the Cherkasy map (fed to src/world/trees.js buildTrees): the OSM-mapped trees, chestnut / linden rows
// along the streets with Lombardy poplars mixed in, pine stands in the forests (the Sosnovyi bir pine forest wraps the
// city on the north-west and north), park groves, sparse courtyards between the Soviet blocks (poplars, birches and
// broad crowns lifted high, so the blocks show under them; lawns stay mostly open) and fruit trees in the private
// sector. No street rows along BARE_ROADS or on farmland, no yard trees in the fields. Spots keep off carriageways,
// water, buildings (1 m raster, grown ~1.5 m) and junction mouths, sports pitches and running tracks, and keep a
// minimum spacing.
//
//   footprintRaster(footprints, region) -> BitRaster (1 m) of the building footprints (also people.js isBuilding)
//   BARE_ROADS: Set of OSM road names with no generated street rows
//   treeSpots({ map, ground, footprints, occ?, y = 0.15, clear = [], extra = [], sparse = null }) -> spots
//     ground: { heightAt, onAsphalt, isWater };  clear: [(x, z) -> bool] no generated tree there (hand-built sites);
//     extra: hand-placed spots appended as given;  sparse(x, z) -> 0..1 thinning of generated trees (the sandy shore)
//     spot: { x, z, y, kind: 'street' | 'park' | 'elm' | 'small' | 'conifer', sc, pal, s3?, variant? }
import { PARK_GREENS, PARK_PINE, PAL } from '../trees.js';
import { ringPts, triangulate, BitRaster, rng, bboxOf, inPoly } from './geo.js';

// Country roads with no planted rows (issue #34): the road out of Lunacharka to Heronymivka runs between fields and
// the dachas with bare verges; the village's own trees start past the map's edge. Their OSM-mapped trees still grow.
export const BARE_ROADS = new Set(['вулиця Онопрієнка']);

export function footprintRaster(footprints, R) {
  const occ = new BitRaster(R.x0 - 50, R.z0 - 50, R.x1 + 50, R.z1 + 50, 1);
  for (const f of footprints) {
    const { pts, tris } = triangulate(f.poly, []);
    for (const [a, b, c] of tris) occ.tri(pts[a][0], pts[a][1], pts[b][0], pts[b][1], pts[c][0], pts[c][1]);
  }
  return occ;
}

export function treeSpots({ map, ground, footprints, occ = null, y = 0.15, clear = [], extra = [], sparse = null }) {
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
  const put = (x, z, kind, sc, pal, s3, variant) => {
    const k = bk(Math.floor(x / B), Math.floor(z / B));
    (buckets.get(k) ?? buckets.set(k, []).get(k)).push(x, z);
    spots.push({ x, z, y: ground.heightAt(x, z) + y, kind, sc, pal, s3, variant });
  };
  const skip = () => {};
  // urban trees are old and tall: crowns start well above a car roof, so the blocks stay visible under them
  const LIFT = [0.82, 1.3, 0.82];
  const poplarS3 = () => [0.4, 1.8 + r() * 0.5, 0.4];
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
    const pine = pineAt(x, z);
    put(x, z, pine && r() < 0.5 ? 'conifer' : 'street', 0.8 + r() * 0.5, pine ? PARK_PINE : green());
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
          if (poplar) plant(x, z, 'conifer', 1.1 + r() * 0.3, green(), poplarS3());
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
    if (pineAt(x, z) ? r() < 0.85 : r() < 0.25) put(x, z, 'conifer', 1.1 + r() * 0.6, PARK_PINE, [0.85, 1.35 + r() * 0.4, 0.85]);
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
      if (privateSector) { plant(x, z, 'small', 0.7 + r() * 0.5, green()); continue; }
      // between the blocks: pyramidal poplars and birches are slim, the broad crowns are lifted
      const q = r();
      if (q < 0.3) plant(x, z, 'conifer', 1.1 + r() * 0.35, green(), poplarS3());
      else if (q < 0.5) plant(x, z, 'park', 1.0 + r() * 0.3, green(), birchS3(), 'birch');
      else plant(x, z, r() < 0.5 ? 'street' : r() < 0.6 ? 'park' : 'elm', 1.0 + r() * 0.4, green(), LIFT);
    }
  }
  mark('yards', n0);

  const kept = clear.length ? spots.filter((s) => !clear.some((f) => f(s.x, s.z))) : spots;
  counts.cleared = spots.length - kept.length;
  counts.extra = extra.length;
  const out = kept.concat(extra);
  out.stats = { ...counts, total: out.length, ms: Math.round(performance.now() - t0) };
  return out;
}
