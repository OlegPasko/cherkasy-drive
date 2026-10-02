// OWNER: cherkasy. The railway cutting from the former Lunacharka district toward the dam (issue #30).
// OSM ways 155424121, 1185293818, 1267744218 and 160513339 all have cutting=yes. The 30 m DEM
// misses the narrow trench south of the Dakhnivska overpass. The route comes from map.rails; no parallel invented track.
// shapeRailCut(hf, map, geo) -> { carved, length, route } | null: lower the height lattice before shapeOverpass.
// buildRailCut({ ground }) -> { clear(x,z), update() } | null: grass on the excavated slopes, no trees on the bed.
// Rails, buildings, road surfaces and collision all use this same height field. No extra geometry or draw calls.
// Width/depth are conservative visual estimates, not surveyed levels. The north end rejoins the existing overpass
// profile before its road/rail shared cutting, leaving that module's bridge spans and road grades in charge.
import { along, crossing, cumulate, ease, resurface } from './bridgekit.js';
import { SURF } from './ground.js';

const ENDS = [[49.4497451, 32.0233752], [49.4534998, 32.0199931], [49.4579472, 32.019947],
  [49.4586, 32.0199474], [49.4694278, 32.0258506]];
const AXIS = [[49.4660577, 32.0223845], [49.4666672, 32.0216036]];
// Cover a cell diagonal plus the ballast shoulder: otherwise a slope corner bends the bilinear rail height
// away from the triangulated ground, and the ballast repeatedly disappears into grass along the trench.
const FLOOR = 26, SLOPE = 0.62;
let shaped = null;

export function shapeRailCut(hf, map, geo) {
  shaped = null;
  if (!hf?.data || !geo || !map.rails) return null;
  const ends = ENDS.map(([la, lo]) => geo.toXZ(la, lo)), route = [];
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 2;
  for (let k = 1; k < ends.length; k++) {
    const r = map.rails.find((r) => !r.sv && !r.br &&
      ((near(r.p.slice(0, 2), ends[k - 1]) && near(r.p.slice(-2), ends[k])) ||
       (near(r.p.slice(-2), ends[k - 1]) && near(r.p.slice(0, 2), ends[k]))));
    if (!r) return null; // a changed map must not cut an unrelated route
    const points = Array.from({ length: r.p.length / 2 }, (_, i) => r.p.slice(i * 2, i * 2 + 2));
    if (!near(points[0], ends[k - 1])) points.reverse();
    route.push(...points.slice(k > 1 ? 1 : 0));
  }
  const hit = crossing(route, ...AXIS.map(([la, lo]) => geo.toXZ(la, lo)));
  if (!hit) return null;
  // The railway drops into the trench over ~500 m, stays below the Sosnivka hilltops, then climbs gently to
  // the existing overpass approach. Its original rail profile starts at s=-298, y=31 with a 3% back extension.
  const end = hit.s - 340, start = hf.heightAt(...route[0]);
  const profile = [[0, start], [500, 25.4], [950, 24.7], [1250, 26.1], [end, 32.26]];
  const level = (s) => {
    let k = 1;
    while (k < profile.length - 1 && profile[k][0] < s) k++;
    const [a, ya] = profile[k - 1], [b, yb] = profile[k];
    return ya + (yb - ya) * ease(a, b, s);
  };
  const { meta: { x0, z0, cell, nx, nz }, grid } = hf.data;
  const cum = cumulate(route), reach = route.filter((_, i) => cum[i] < end + 80);
  const box = [Math.min(...reach.map(p => p[0])) - 55, Math.min(...reach.map(p => p[1])) - 55,
    Math.max(...reach.map(p => p[0])) + 55, Math.max(...reach.map(p => p[1])) + 55];
  const cut = new Map();
  for (let j = Math.max(0, Math.floor((box[1] - z0) / cell)); j <= Math.min(nz - 1, Math.ceil((box[3] - z0) / cell)); j++) {
    for (let i = Math.max(0, Math.floor((box[0] - x0) / cell)); i <= Math.min(nx - 1, Math.ceil((box[2] - x0) / cell)); i++) {
      const x = x0 + i * cell, z = z0 + j * cell, q = along(route, x, z);
      if (q.s <= 0 || q.s >= end || q.d > 55) continue;
      const k = j * nx + i, old = grid[k], y = level(q.s) + Math.max(0, q.d - FLOOR) * SLOPE;
      if (old - y <= 0.02) continue;
      cut.set(k, old - y); grid[k] = y;
    }
  }
  shaped = { cut, meta: { x0, z0, cell, nx }, route, end, box };
  return { carved: cut.size, length: end, route };
}

export function buildRailCut({ ground }) {
  if (!shaped) return null;
  const { route, end, cut, meta: { x0, z0, cell, nx }, box } = shaped;
  const depth = (x, z) => {
    const u = (x - x0) / cell, v = (z - z0) / cell, i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j;
    const d = (di, dj) => cut.get((j + dj) * nx + i + di) ?? 0;
    return (1 - b) * ((1 - a) * d(0, 0) + a * d(1, 0)) + b * ((1 - a) * d(0, 1) + a * d(1, 1));
  };
  const natural = new Set([SURF.YARD, SURF.FOREST, SURF.DIRT, SURF.SAND, SURF.FARM, SURF.SCRUB]);
  resurface(ground, box, (x, z, s) => natural.has(s) && depth(x, z) > 0.6 ? SURF.GRASS : null);
  return { clear(x, z) {
    if (x < box[0] || x > box[2] || z < box[1] || z > box[3]) return false;
    const q = along(route, x, z);
    return q.s > 0 && q.s < end && q.d < 14;
  }, update() {} };
}
