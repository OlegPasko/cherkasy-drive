// Cherkasy map compiler: raw OpenStreetMap extracts (tools/cherkasy/raw/*.json, fetch_osm.mjs) -> the game's compact map
// (public/assets/cherkasy/map.json). Map data (c) OpenStreetMap contributors, ODbL.
//
// Frame: metres, y up. The map is rotated so the city's street grid is axis-aligned: +x points north-east (toward the
// Dnipro), +z points south-east (down bul. Shevchenka), origin at Soborna square. Most central buildings and streets
// then run along the axes (cheap exact box collision, axis-aligned walls like the Manhattan build).
//
// Output (all coordinates rounded to 0.1 m, rings flattened [x0,z0,x1,z1,...], outer rings counter-clockwise in x/z):
//   frame, region, buildings[{id,p,holes?,k,lv,h,mh,rs,rc,bc,f,name,parts?}], roads[{p,w,k,n,br,ow}], asphalt[rings],
//   walks[rings], paving[rings], land[rings], cover[{k,rings}], rails[{p}], trees[[x,z]], pois[...]
// Run: node tools/cherkasy/build_map.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import ClipperLib from 'clipper-lib';
import { PNG } from 'pngjs';
import { existsSync } from 'node:fs';
import { signedArea2, ringArea, vertexMean, asCCW, asCW, simplify, boundsOf, pointInRing, distToSegment, minAreaRect, edgesOf, GridIndex,
  gauss, erode, dilate, scanFill, pushPullFill, chamfer } from './geom2d.mjs';

const RAW = (n) => JSON.parse(readFileSync(new URL(`./raw/${n}.json`, import.meta.url))).elements;
export const FRAME = { lat0: 49.4445, lon0: 32.0600, rot: 49.4 };
// playable region (the main city: river bank .. pr. Khimikiv, Sosnivka .. the port / Sady) and the land/water extent
export const REGION = { x0: -4300, x1: 1900, z0: -3500, z1: 4800 };
const LAND = { x0: REGION.x0 - 25000, x1: REGION.x1 + 25000, z0: REGION.z0 - 25000, z1: REGION.z1 + 25000 };

const KY = 111320, KX = 111320 * Math.cos(FRAME.lat0 * Math.PI / 180);
const CR = Math.cos(FRAME.rot * Math.PI / 180), SR = Math.sin(FRAME.rot * Math.PI / 180);
const proj = (lat, lon) => { const e = (lon - FRAME.lon0) * KX, n = (lat - FRAME.lat0) * KY; return [e * CR + n * SR, e * SR - n * CR]; };
const r1 = (v) => Math.round(v * 10) / 10;
const flat = (P) => P.flatMap(([x, z]) => [r1(x), r1(z)]);
const ringPts2 = (F) => { const P = []; for (let i = 0; i < F.length; i += 2) P.push([F[i], F[i + 1]]); return P; };
const inRect = (R, x, z, m = 0) => x >= R.x0 - m && x <= R.x1 + m && z >= R.z0 - m && z <= R.z1 + m;

// ------------------------------------------------------------------------------------------------ geometry helpers
const area2 = signedArea2, areaOf = ringArea, centroid = vertexMean, ccw = asCCW, cw = asCW, dp = simplify;
function ringOf(geom) { // OSM closed way geometry -> projected ring without the repeated last point
  const P = geom.map(g => proj(g.lat, g.lon));
  if (P.length > 1 && Math.hypot(P[0][0] - P.at(-1)[0], P[0][1] - P.at(-1)[1]) < 1e-6) P.pop();
  return P;
}
// assemble multipolygon members (ways, possibly split) into closed rings
function assemble(members) {
  const segs = members.filter(m => m.geometry && m.geometry.length > 1).map(m => ({ role: m.role || 'outer', P: m.geometry.map(g => proj(g.lat, g.lon)) }));
  const out = { outer: [], inner: [] };
  const key = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  for (const role of ['outer', 'inner']) {
    const S = segs.filter(s => (role === 'inner') === (s.role === 'inner')).map(s => s.P);
    const used = new Uint8Array(S.length);
    for (let i = 0; i < S.length; i++) {
      if (used[i]) continue; used[i] = 1;
      let R = S[i].slice();
      for (let guard = 0; guard < 5000 && key(R[0]) !== key(R.at(-1)); guard++) {
        const e = key(R.at(-1)); let found = false;
        for (let j = 0; j < S.length; j++) {
          if (used[j]) continue;
          if (key(S[j][0]) === e) { R = R.concat(S[j].slice(1)); used[j] = 1; found = true; break; }
          if (key(S[j].at(-1)) === e) { R = R.concat(S[j].slice(0, -1).reverse()); used[j] = 1; found = true; break; }
        }
        if (!found) break;
      }
      if (key(R[0]) === key(R.at(-1))) { R.pop(); if (R.length >= 3) out[role].push(R); }
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ clipper wrappers
const SC = 100; // clipper works in integer centimetres
const toC = (P) => P.map(([x, z]) => ({ X: Math.round(x * SC), Y: Math.round(z * SC) }));
const fromC = (P) => P.map(p => [p.X / SC, p.Y / SC]);
function clip(subj, clipP, op, fill = ClipperLib.PolyFillType.pftNonZero) {
  const c = new ClipperLib.Clipper();
  c.AddPaths(subj.map(toC), ClipperLib.PolyType.ptSubject, true);
  if (clipP.length) c.AddPaths(clipP.map(toC), ClipperLib.PolyType.ptClip, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(op, tree, fill, fill);
  return polysFromTree(tree);
}
function polysFromTree(tree) { // -> [{outer, holes}] (outer ccw, holes cw in x/z)
  const out = [];
  const walk = (node) => {
    for (const ch of node.Childs()) {
      if (!ch.IsHole()) {
        const outer = ccw(fromC(ch.Contour()));
        const holes = ch.Childs().map(h => cw(fromC(h.Contour())));
        if (outer.length >= 3) out.push({ outer, holes });
        for (const h of ch.Childs()) walk(h);
      }
    }
  };
  walk(tree);
  return out;
}
const union = (P) => clip(P, [], ClipperLib.ClipType.ctUnion);
const rectRing = (R) => [[R.x0, R.z0], [R.x1, R.z0], [R.x1, R.z1], [R.x0, R.z1]];
function buffer(lines, halfW) { // open polylines -> union of buffered polygons; lines: [{P, hw}] (hw overrides)
  const co = new ClipperLib.ClipperOffset(2, 25);
  const groups = new Map();
  for (const l of lines) { const w = Math.round((l.hw ?? halfW) * 4) / 4; if (!groups.has(w)) groups.set(w, []); groups.get(w).push(l.P); }
  let all = [];
  for (const [w, Ls] of groups) {
    co.Clear();
    co.AddPaths(Ls.map(toC), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound);
    const sol = new ClipperLib.Paths(); co.Execute(sol, w * SC);
    all = all.concat(sol.map(fromC));
  }
  return union(all);
}
const polysToRings = (polys) => polys.map(p => [flat(p.outer), ...p.holes.map(flat)]);
// cut polygons into square tiles (T m inside the height grid, 4 km out in the far fields): the runtime triangulates each
// piece, and earcut's hole bridges then stay tile-sized (a continent-sized land polygon with thousands of road holes
// otherwise yields km-long sliver triangles that the terrain draping has to cut into thousands of cells)
function tileSplit(polys, T, inner) {
  const out = [];
  for (const p of polys) {
    const bb = bboxOf(p.outer);
    const S = (x0, z0, x1, z1) => {
      const inIn = x1 > inner.x0 && x0 < inner.x1 && z1 > inner.z0 && z0 < inner.z1, t = inIn ? T : 4000;
      if (x1 - x0 <= t && z1 - z0 <= t) {
        const r = clip([p.outer, ...p.holes], [rectRing({ x0, z0, x1, z1 })], ClipperLib.ClipType.ctIntersection, ClipperLib.PolyFillType.pftEvenOdd);
        out.push(...r); return;
      }
      // quadtree descent until the tile size of the area is reached (skips empty space cheaply)
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      for (const [a, b, c, d] of [[x0, z0, mx, mz], [mx, z0, x1, mz], [x0, mz, mx, z1], [mx, mz, x1, z1]]) if (c > bb.x0 && a < bb.x1 && d > bb.z0 && b < bb.z1) S(a, b, c, d);
    };
    // snap the root square to the tile lattice so pieces of different layers share tile borders
    const G0 = 4096 * 32, rx0 = -G0 / 2, rz0 = -G0 / 2;
    S(rx0, rz0, rx0 + G0, rz0 + G0);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ spatial index
class Hash extends GridIndex { add(x0, z0, x1, z1, v) { this.insert(x0, z0, x1, z1, v); } near(x, z, r, fn) { this.query(x, z, r, fn); } }
const bboxOf = boundsOf, inPoly = pointInRing, segDist = distToSegment, obb = minAreaRect;
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

// ------------------------------------------------------------------------------------------------ land cover
const landEls = RAW('land'), waterEls = RAW('water'), poiEls = RAW('poi'), roadEls = RAW('roads'), bldEls = RAW('buildings');
const COVER = { // OSM tag -> cover kind
  'landuse=grass': 'grass', 'leisure=garden': 'grass', 'leisure=park': 'park', 'landuse=recreation_ground': 'grass', 'natural=grassland': 'grass',
  'landuse=meadow': 'grass', 'landuse=village_green': 'grass', 'landuse=flowerbed': 'flowers', 'leisure=playground': 'play', 'landuse=cemetery': 'grass',
  'natural=wood': 'forest', 'landuse=forest': 'forest', 'natural=scrub': 'scrub', 'natural=heath': 'scrub', 'landuse=orchard': 'orchard',
  'natural=sand': 'sand', 'natural=beach': 'sand', 'natural=shingle': 'sand', 'leisure=pitch': 'pitch', 'leisure=track': 'track', 'leisure=stadium': 'grass',
  'landuse=industrial': 'industrial', 'landuse=garages': 'industrial', 'landuse=railway': 'industrial', 'landuse=construction': 'dirt',
  'landuse=allotments': 'allot', 'landuse=farmland': 'farm', 'natural=wetland': 'wet', 'landuse=brownfield': 'dirt', 'landuse=greenfield': 'grass',
  'amenity=parking': 'parking', 'landuse=residential': 'resid', 'landuse=commercial': 'comm', 'landuse=retail': 'comm', 'landuse=education': 'edu',
};
const coverKey = (t) => ['landuse', 'leisure', 'natural', 'amenity'].map(k => t[k] ? `${k}=${t[k]}` : null).find(k => k && COVER[k]);
const coverPolys = []; // {k, outer, holes, tags}
const waterRings = [];
for (const e of [...landEls, ...waterEls, ...poiEls]) {
  const t = e.tags || {};
  const isWater = t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin';
  const ck = isWater ? 'water' : COVER[coverKey(t)];
  if (!ck) continue;
  let polys = [];
  if (e.type === 'way' && e.geometry && e.geometry.length > 3) {
    const g = e.geometry; if (g[0].lat !== g.at(-1).lat || g[0].lon !== g.at(-1).lon) continue;
    polys.push({ outer: ringOf(g), holes: [] });
  } else if (e.type === 'relation') {
    const A = assemble(e.members || []);
    for (const o of A.outer) polys.push({ outer: o, holes: A.inner.filter(h => inPoly(o, ...h[0])) });
  }
  for (const p of polys) {
    if (isWater) { waterRings.push(p); continue; }
    const bb = bboxOf(p.outer); if (bb.x1 < REGION.x0 - 300 || bb.x0 > REGION.x1 + 300 || bb.z1 < REGION.z0 - 300 || bb.z0 > REGION.z1 + 300) continue;
    coverPolys.push({ k: ck, ...p, tags: t, id: e.id });
  }
}
console.log('cover', coverPolys.length, 'water polys', waterRings.length);
const coverIdx = new Hash(100);
for (let i = 0; i < coverPolys.length; i++) { const { x0, z0, x1, z1 } = bboxOf(coverPolys[i].outer); coverIdx.add(x0, z0, x1, z1, i); }
const coverAt = (x, z) => { let best = null, ba = Infinity; coverIdx.near(x, z, 0, (i) => { const c = coverPolys[i]; if (!inPoly(c.outer, x, z)) return; const a = areaOf(c.outer); if (a < ba) { ba = a; best = c; } }); return best; };

// water: every water polygon clipped to the land extent; land = extent - water
const Lr = rectRing(LAND);
const waterSubj = []; for (const w of waterRings) { waterSubj.push(ccw(w.outer)); for (const h of w.holes) waterSubj.push(cw(h)); }
const waterAll = clip(waterSubj, [Lr], ClipperLib.ClipType.ctIntersection, ClipperLib.PolyFillType.pftNonZero);
// the Dnipro (reservoir, harbour, river arms): big water bodies at the river level; small ponds / pools on the plateau
// become cover patches at their local terrain height (not holes down to the river)
const water = waterAll.filter(w => areaOf(w.outer) > 250000);
const ponds = waterAll.filter(w => areaOf(w.outer) <= 250000);
console.log('water bodies', water.length, 'ponds', ponds.length);
// simplify the huge reservoir shoreline a little (0.8 m) outside the playable region
const land = clip([Lr], water.flatMap(p => [p.outer, ...p.holes.map(h => h.slice().reverse())]), ClipperLib.ClipType.ctDifference)
  .map(p => ({ outer: dp(p.outer, 0.6, true), holes: p.holes.map(h => dp(h, 0.6, true)).filter(h => h.length >= 3) }));
console.log('land polys', land.length, 'pts', land.reduce((n, p) => n + p.outer.length + p.holes.reduce((m, h) => m + h.length, 0), 0));

// ------------------------------------------------------------------------------------------------ roads
const ROAD = { // class -> [carriageway width m, kind] kind: m = motor (asphalt), p = paved foot, d = dirt
  motorway: [16, 'm'], trunk: [15, 'm'], primary: [14, 'm'], secondary: [12, 'm'], tertiary: [9.5, 'm'], unclassified: [6.5, 'm'], residential: [6.5, 'm'],
  motorway_link: [7, 'm'], trunk_link: [7, 'm'], primary_link: [7, 'm'], secondary_link: [6.5, 'm'], tertiary_link: [6, 'm'],
  living_street: [5.5, 'm'], service: [4.5, 'm'], track: [3.2, 'd'], pedestrian: [6, 'p'], footway: [2.2, 'p'], path: [1.8, 'p'], cycleway: [2, 'p'],
  steps: [2.2, 'p'], bridleway: [2, 'd'], busway: [7, 'm'], road: [6, 'm'], raceway: [8, 'm'],
};
const UNPAVED = /^(unpaved|dirt|ground|earth|grass|gravel|fine_gravel|sand|mud|compacted|pebblestone|woodchips)$/;
const roads = [];
for (const e of roadEls) {
  const t = e.tags || {}; if (!t.highway || !e.geometry || t.area === 'yes') continue;
  const def = ROAD[t.highway]; if (!def) continue;
  if (t.tunnel && t.tunnel !== 'no') continue;
  if (t.access === 'private' && t.highway === 'service') continue;
  let P = e.geometry.map(g => proj(g.lat, g.lon));
  if (!P.some(([x, z]) => inRect(REGION, x, z, 400))) continue;
  const P0 = P; P = dp(P, 0.3, false);
  let w = def[0];
  const lanes = parseFloat(t.lanes);
  if (def[1] === 'm' && lanes > 0) w = Math.max(w * 0.7, Math.min(w * 1.6, lanes * 3.4 + 1));
  if (t.width && parseFloat(t.width) > 1) w = Math.min(30, parseFloat(t.width));
  if (t.service === 'driveway' || t.service === 'parking_aisle' || t.service === 'alley') w = Math.min(w, t.service === 'parking_aisle' ? 5.5 : 3.6);
  let kind = def[1];
  if (kind === 'm' && t.surface && UNPAVED.test(t.surface)) kind = 'd';
  if (kind === 'p' && t.surface && UNPAVED.test(t.surface)) kind = 'd';
  if (t.highway === 'footway' && t.footway === 'crossing') kind = 'x'; // zebra crossing: drawn by the markings, not as paving
  roads.push({ id: e.id, P, w, cls: t.highway, kind, name: t.name ?? t['name:uk'] ?? '', br: t.bridge && t.bridge !== 'no' ? 1 : 0, ow: t.oneway === 'yes' ? 1 : 0, lanes: lanes || 0, sw: t.sidewalk ?? '',
    tw: t.trolley_wire === 'yes' ? 1 : 0, nodes: e.nodes, raw: e.geometry.map(g => proj(g.lat, g.lon)) });
}
const motor = roads.filter(r => r.kind === 'm');
const MAIN = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'motorway', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
console.log('roads', roads.length, 'motor', motor.length);
// junctions: nodes shared by two or more motor roads (lane markings stop short of them)
const junctions = [];
{
  const J = new Map();
  for (const r of motor) r.nodes.forEach((id, i) => { let j = J.get(id); if (!j) J.set(id, j = { n: 0, hw: 0, x: r.raw[i][0], z: r.raw[i][1], ends: 0 }); j.n++; j.hw = Math.max(j.hw, r.w / 2); if (i === 0 || i === r.nodes.length - 1) j.ends++; });
  for (const j of J.values()) if (j.n >= 2 && inRect(REGION, j.x, j.z, 100)) junctions.push([r1(j.x), r1(j.z), r1(j.hw)]);
}
console.log('junctions', junctions.length);
const clipRegion = (polys, m = 150) => clip(polys.flatMap(p => [p.outer, ...p.holes]), [rectRing({ x0: REGION.x0 - m, x1: REGION.x1 + m, z0: REGION.z0 - m, z1: REGION.z1 + m })], ClipperLib.ClipType.ctIntersection, ClipperLib.PolyFillType.pftEvenOdd);
// area:highway / pedestrian squares / parking lots
const pavedAreas = [], parkingAreas = [];
for (const e of [...roadEls, ...poiEls]) {
  const t = e.tags || {}; if (e.type !== 'way' || !e.geometry || e.geometry.length < 4) continue;
  const g = e.geometry; if (g[0].lat !== g.at(-1).lat || g[0].lon !== g.at(-1).lon) continue;
  if ((t.highway === 'pedestrian' && t.area === 'yes') || (t['area:highway'] && /pedestrian|footway/.test(t['area:highway'])) || t.place === 'square') pavedAreas.push(ringOf(g));
  if (t.amenity === 'parking' && t.parking !== 'underground' && t.parking !== 'multi-storey') parkingAreas.push(ringOf(g));
}
const asphaltBase = buffer(motor.map(r => ({ P: r.P, hw: r.w / 2 })), 0);
const asphalt = clipRegion(union([...asphaltBase.flatMap(p => [p.outer, ...p.holes]), ...parkingAreas.map(ccw)]));
// sidewalks: a paved band along every main / residential street (Cherkasy: curb, 3-4.5 m of paving), minus the asphalt
const walkLines = motor.filter(r => MAIN.has(r.cls) || r.cls === 'residential' || r.cls === 'living_street' || r.cls === 'unclassified')
  .map(r => ({ P: r.P, hw: r.w / 2 + (MAIN.has(r.cls) ? 4.5 : 2.6) }));
const footLines = roads.filter(r => r.kind === 'p').map(r => ({ P: r.P, hw: r.w / 2 }));
const walkAll = union([...buffer(walkLines, 0), ...buffer(footLines, 0)].flatMap(p => [p.outer, ...p.holes]).concat(pavedAreas.map(ccw)));
const walks = clipRegion(clip(walkAll.flatMap(p => [p.outer, ...p.holes]), asphalt.flatMap(p => [p.outer, ...p.holes]), ClipperLib.ClipType.ctDifference));
const dirt = clipRegion(clip(buffer(roads.filter(r => r.kind === 'd').map(r => ({ P: r.P, hw: r.w / 2 })), 0).flatMap(p => [p.outer, ...p.holes]),
  [...asphalt, ...walks].flatMap(p => [p.outer, ...p.holes]), ClipperLib.ClipType.ctDifference));
const simp = (polys, tol) => polys.map(p => ({ outer: dp(p.outer, tol, true), holes: p.holes.map(h => dp(h, tol, true)).filter(h => h.length >= 3) })).filter(p => p.outer.length >= 3);
console.log('asphalt polys', asphalt.length, 'walk polys', walks.length, 'dirt', dirt.length);

// ------------------------------------------------------------------------------------------------ railways
const rails = [];
for (const e of roadEls) {
  const t = e.tags || {}; if (!t.railway || !e.geometry) continue;
  if (!/^(rail|light_rail|narrow_gauge)$/.test(t.railway) || (t.tunnel && t.tunnel !== 'no')) continue;
  const P = dp(e.geometry.map(g => proj(g.lat, g.lon)), 0.2, false);
  if (!P.some(([x, z]) => inRect(REGION, x, z, 600))) continue;
  rails.push({ p: flat(P), sv: t.service ? 1 : 0, br: t.bridge && t.bridge !== 'no' ? 1 : 0 });
}

// ------------------------------------------------------------------------------------------------ buildings
const roadIdx = new Hash(64);
motor.forEach((r, i) => { for (let k = 1; k < r.P.length; k++) { const [ax, az] = r.P[k - 1], [bx, bz] = r.P[k]; roadIdx.add(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), i * 4096 + k); } });
function nearestRoad(x, z, R) { // -> {d (to the carriageway edge), r}
  let best = null;
  roadIdx.near(x, z, R, (v) => {
    const r = motor[Math.floor(v / 4096)], k = v % 4096, [ax, az] = r.P[k - 1], [bx, bz] = r.P[k];
    const d = segDist(x, z, ax, az, bx, bz) - r.w / 2;
    if (!best || d < best.d) best = { d, r };
  });
  return best;
}
const SHED = new Set(['garage', 'garages', 'shed', 'carport', 'hut', 'cabin', 'greenhouse', 'barn', 'farm_auxiliary', 'kiosk', 'toilets', 'container', 'stable', 'sty', 'allotment_house', 'service', 'transformer_tower']);
const HOUSE = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'farm', 'villa']);
const APT = new Set(['apartments', 'residential', 'dormitory', 'hotel']);
const PUBLIC = new Set(['school', 'kindergarten', 'hospital', 'university', 'college', 'public', 'civic', 'government', 'train_station', 'transportation', 'office', 'commercial', 'retail', 'supermarket', 'hotel', 'sports_hall', 'theatre', 'museum', 'stadium', 'clinic', 'fire_station', 'police', 'bank', 'mall']);
const RELIG = new Set(['church', 'cathedral', 'chapel', 'mosque', 'synagogue', 'temple', 'religious', 'monastery']);
const INDUS = new Set(['industrial', 'warehouse', 'factory', 'manufacture', 'hangar', 'storage_tank', 'silo', 'boathouse']);
const num = (v) => { const f = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(f) ? f : null; };
const colour = (v) => {
  if (!v) return null; v = String(v).trim().toLowerCase();
  const N = { white: '#eeeae2', light_gray: '#c8c6c0', lightgray: '#c8c6c0', lightgrey: '#c8c6c0', gray: '#9a9a96', grey: '#9a9a96', yellow: '#e2cf85', beige: '#dccfb0', brown: '#8a5a40', red: '#a8453a', green: '#7fa06a', blue: '#8fa5c0', pink: '#dcaaa8', orange: '#d98c4f', maroon: '#6e2e2a', cream: '#efe4c4', black: '#303030', silver: '#bfc1c2', tan: '#c8ad86' };
  if (N[v]) v = N[v];
  const m = /^#?([0-9a-f]{6})$/.exec(v); return m ? '#' + m[1] : null;
};

const blds = [];
const partsRaw = [];
for (const e of bldEls) {
  const t = e.tags || {};
  let polys = [];
  if (e.type === 'way' && e.geometry && e.geometry.length >= 4) polys = [{ outer: ringOf(e.geometry), holes: [] }];
  else if (e.type === 'relation') { const A = assemble(e.members || []); polys = A.outer.map(o => ({ outer: o, holes: A.inner.filter(h => inPoly(o, ...h[0])) })); }
  for (const p of polys) {
    const outer = ccw(dp(p.outer, 0.2, true)); if (outer.length < 3) continue;
    const [cx, cz] = centroid(outer); if (!inRect(REGION, cx, cz)) continue;
    const A = areaOf(outer) - p.holes.reduce((s, h) => s + areaOf(h), 0);
    const rec = { id: e.id, outer, holes: p.holes.map(h => cw(dp(h, 0.2, true))).filter(h => h.length >= 3), t, A, cx, cz };
    if (t['building:part'] && !t.building) { partsRaw.push(rec); continue; }
    if (A < 9) continue;
    blds.push(rec);
  }
}
console.log('buildings in region', blds.length, 'parts', partsRaw.length);

// context: count of small buildings around (private-sector detector) + levels of tagged neighbours
const bIdx = new Hash(60);
blds.forEach((b, i) => bIdx.add(b.cx, b.cz, b.cx, b.cz, i));
for (const b of blds) {
  b.o = obb(b.outer);
  const lv = num(b.t['building:levels']), h = num(b.t.height);
  b.tagLv = lv != null && lv > 0 ? lv : (h ? Math.max(1, Math.round(h / 3)) : null);
}
function classify(b) {
  const t = b.t, bt = t.building, A = b.A, o = b.o;
  let small = 0, n = 0; bIdx.near(b.cx, b.cz, 55, (j) => { const q = blds[j]; if (Math.hypot(q.cx - b.cx, q.cz - b.cz) > 55) return; n++; if (q.A < 220) small++; });
  const cov = coverAt(b.cx, b.cz); const ck = cov?.k;
  const privateSector = small >= 7 && small / Math.max(1, n) > 0.75;
  if (RELIG.has(bt) || t.amenity === 'place_of_worship') return 'church';
  const named = !!(t.amenity || t.office || t.shop || t.government || t.tourism || (t.name && A > 150));
  if (bt === 'roof') return 'roof';
  if (bt === 'ruins' || t.ruins === 'yes') return 'ruin';
  if (bt === 'construction') return 'cons';
  if (bt === 'garage' || bt === 'garages') return 'garage';
  if (SHED.has(bt)) return A > 120 ? 'indus' : 'shed';
  if (HOUSE.has(bt)) return 'house';
  if (APT.has(bt)) return 'apt';
  if (INDUS.has(bt)) return 'indus';
  if (PUBLIC.has(bt)) return 'public';
  if (named && A > 60) return 'public';
  // building=yes (and the rest): guess from size + context
  if (A < 30) return 'shed';
  if (ck === 'industrial' || ck === 'farm') return A < 60 ? 'shed' : 'indus';
  if (ck === 'allot') return A < 90 ? 'shed' : 'house';
  if (privateSector && A < 320) return 'house';
  if (A < 140 && o.long < 20) return small >= 4 ? 'house' : 'shed';
  if (ck === 'comm') return 'public';
  if (A > 450 && o.long / Math.max(1, o.short) > 2.6 && o.short < 17) return 'apt';
  if (A > 3000 && ck !== 'resid' && ck !== 'comm' && ck !== 'edu') return 'indus';
  return b.tagLv && b.tagLv >= 4 ? 'apt' : (ck === 'resid' ? 'apt' : 'public');
}
for (const b of blds) b.k = classify(b);
// untagged apartment / public blocks: borrow the levels of similar tagged neighbours (Soviet micro-districts repeat the
// same series: 5-storey khrushchevkas, 9-storey panels, 12-16 storey towers)
const tagged = blds.filter(b => b.tagLv && b.tagLv <= 30 && !b.t?.man_made && (b.k === 'apt' || b.k === 'public')); // towers / chimneys would hand their height to nearby blocks
const tIdx = new Hash(150); tagged.forEach((b, i) => tIdx.add(b.cx, b.cz, b.cx, b.cz, i));
function inferLevels(b) {
  const r = hashStr('lv' + b.id);
  if (b.tagLv) return Math.min(40, Math.round(b.tagLv));
  switch (b.k) {
    case 'shed': return 1;
    case 'garage': return 1;
    case 'roof': return 1;
    case 'ruin': return 1;
    case 'house': return b.A > 150 && r < 0.45 ? 2 : 1;
    case 'indus': return b.A > 1500 && r < 0.3 ? 2 : 1;
    case 'church': return 2;
    case 'cons': return 1;
  }
  const W = [];
  tIdx.near(b.cx, b.cz, 320, (i) => {
    const q = tagged[i]; const d = Math.hypot(q.cx - b.cx, q.cz - b.cz); if (d > 320) return;
    const ra = b.A / q.A; if (ra < 0.45 || ra > 2.2) return;
    const asp = (x) => x.o.long / Math.max(1, x.o.short); const rs = asp(b) / asp(q); if (rs < 0.5 || rs > 2) return;
    W.push([q.tagLv, 1 / (30 + d) * (1 / (0.2 + Math.abs(Math.log(ra))))]);
  });
  if (W.length) { // weighted median
    W.sort((a, c) => a[0] - c[0]); const tot = W.reduce((s, w) => s + w[1], 0); let acc = 0;
    for (const [lv, w] of W) { acc += w; if (acc >= tot / 2) return Math.round(lv); }
  }
  if (b.k === 'apt') { // research: 5-storey ~70 x 13 m, 9/10-storey ~67 x 15-17 m, 14-16 point towers ~33 x 24 m
    const W = b.o.short, L = b.o.long;
    if (L < 35 && W <= 14.5) return r < 0.5 ? 2 : 3;
    if (L <= 38 && W >= 19 && b.A > 450) return r < 0.6 ? 14 : (r < 0.85 ? 16 : 12); // point towers
    if (W <= 14 && L >= 40) return 5;
    if (W > 14 && W <= 21 && L >= 40) return r < 0.7 ? 9 : 10;
    return b.A < 700 ? 5 : 9;
  }
  return b.A < 300 ? 2 : b.A < 1200 ? (r < 0.5 ? 2 : 3) : (r < 0.6 ? 3 : 4);
}
for (const b of blds) b.lv = inferLevels(b);

// street-facing edges: ground-floor storefronts on main streets, plain doors / blank toward yards
for (const b of blds) {
  const codes = [];
  for (const [a, c] of edgesOf(b.outer, true)) {
    const ex = c[0] - a[0], ez = c[1] - a[1], len = Math.hypot(ex, ez);
    if (len < 1e-6) { codes.push('0'); continue; }
    // probe 3 m out along the outward normal (ccw ring in x/z)
    const q = nearestRoad((a[0] + c[0]) / 2 + ez / len * 3, (a[1] + c[1]) / 2 + -ex / len * 3, 30);
    codes.push(q && q.d <= 22 ? (MAIN.has(q.r.cls) ? '2' : '1') : '0');
  }
  b.f = codes.join('');
}

// building parts (cathedral domes, towers): the parent outline is replaced by its parts
const pIdx = new Hash(60);
blds.forEach((b, i) => { const bb = bboxOf(b.outer); pIdx.add(bb.x0, bb.z0, bb.x1, bb.z1, i); });
for (const p of partsRaw) {
  let host = null; pIdx.near(p.cx, p.cz, 0, (i) => { if (!host && inPoly(blds[i].outer, p.cx, p.cz)) host = blds[i]; });
  if (!host) continue;
  (host.parts ??= []).push(p);
}

const outB = blds.map(b => {
  const t = b.t, o = {
    id: b.id, p: flat(b.outer), k: b.k, lv: b.lv,
  };
  if (b.holes.length) o.holes = b.holes.map(flat);
  const h = num(t.height); if (h) o.h = h;
  const mh = num(t.min_height); if (mh) o.mh = mh;
  const ml = num(t['building:min_level']); if (ml) o.ml = ml;
  if (t['roof:shape']) o.rs = t['roof:shape'];
  const rc = colour(t['roof:colour']); if (rc) o.rc = rc;
  const bc = colour(t['building:colour']); if (bc) o.bc = bc;
  if (t['building:material']) o.mat = t['building:material'];
  if (t.name) o.name = t.name;
  if (!b.tagLv) o.inf = 1;
  if (/[12]/.test(b.f)) o.f = b.f;
  if (t.building && t.building !== 'yes') o.bt = t.building;
  if (t.amenity) o.am = t.amenity;
  if (b.parts) o.parts = b.parts.map(p => {
    const pt = p.t, q = { p: flat(p.outer) };
    const ph = num(pt.height), pm = num(pt.min_height), pl = num(pt['building:levels']), pml = num(pt['building:min_level']);
    if (ph) q.h = ph; if (pm) q.mh = pm; if (pl) q.lv = pl; if (pml) q.ml = pml;
    if (pt['roof:shape']) q.rs = pt['roof:shape']; const rh = num(pt['roof:height']); if (rh) q.rh = rh;
    const c1 = colour(pt['roof:colour']); if (c1) q.rc = c1; const c2 = colour(pt['building:colour']); if (c2) q.bc = c2;
    if (pt['building:part']) q.bp = pt['building:part'];
    return q;
  });
  const rh = num(t['roof:height']); if (rh) o.rh = rh;
  const rl = num(t['roof:levels']); if (rl) o.rl = rl;
  return o;
});
const kc = {}; for (const b of blds) kc[b.k] = (kc[b.k] || 0) + 1; console.log('kinds', kc);
const lvc = {}; for (const b of blds) if (b.k === 'apt') lvc[b.lv] = (lvc[b.lv] || 0) + 1; console.log('apt levels', lvc);

// ------------------------------------------------------------------------------------------------ trees + pois
const trees = [];
for (const e of landEls) {
  const t = e.tags || {};
  if (e.type === 'node' && t.natural === 'tree') { const [x, z] = proj(e.lat, e.lon); if (inRect(REGION, x, z)) trees.push([r1(x), r1(z)]); }
  if (e.type === 'way' && t.natural === 'tree_row' && e.geometry) {
    for (const [a, c] of edgesOf(e.geometry.map(g => proj(g.lat, g.lon)), false)) { // one tree every 7 m along the row
      const ex = c[0] - a[0], ez = c[1] - a[1], len = Math.hypot(ex, ez);
      for (let s = 0; s < len; s += 7) { const x = a[0] + ex * s / len, z = a[1] + ez * s / len; if (inRect(REGION, x, z)) trees.push([r1(x), r1(z)]); }
    }
  }
}
const pois = [];
for (const e of poiEls) {
  const t = e.tags || {};
  const interesting = t.amenity === 'place_of_worship' || t.historic || t.tourism === 'attraction' || t.man_made === 'tower' || t.man_made === 'water_tower' || t.man_made === 'chimney'
    || t.man_made === 'mast' || t.man_made === 'pier' || t.amenity === 'fountain' || t.amenity === 'theatre' || t.tourism === 'artwork';
  if (!interesting) continue;
  let x, z, poly = null;
  if (e.type === 'node') [x, z] = proj(e.lat, e.lon);
  else if (e.geometry) { const P = e.geometry.map(g => proj(g.lat, g.lon)); [x, z] = centroid(P); poly = flat(dp(P, 0.3, false)); }
  else continue;
  if (!inRect(REGION, x, z, 200)) continue;
  const o = { id: e.type[0] + e.id, x: r1(x), z: r1(z), name: t.name ?? '', tags: {} };
  for (const k of ['amenity', 'historic', 'memorial', 'tourism', 'man_made', 'height', 'religion', 'denomination', 'artwork_type', 'tower:type', 'building']) if (t[k]) o.tags[k] = t[k];
  if (poly) o.p = poly;
  pois.push(o);
}

// ------------------------------------------------------------------------------------------------ cover output
const cover = {};
for (const c of coverPolys) {
  if (c.k === 'resid' || c.k === 'comm' || c.k === 'edu') continue; // ground stays the default yard surface
  (cover[c.k] ??= []).push({ outer: ccw(dp(c.outer, 0.4, true)), holes: c.holes.map(h => cw(dp(h, 0.4, true))).filter(h => h.length >= 3) });
}
const asphaltCut = asphalt.flatMap(p => [p.outer, ...p.holes]);
const minus = (polys, cut) => clip(polys.flatMap(p => [p.outer, ...p.holes]), cut, ClipperLib.ClipType.ctDifference);
const coverOut = {};
for (const [k, P] of Object.entries(cover)) coverOut[k] = polysToRings(simp(minus(clipRegion(union(P.flatMap(p => [p.outer, ...p.holes])), 800), [...asphaltCut, ...walks.flatMap(p => [p.outer, ...p.holes])]), 0.2));
const landCut = minus(land, asphaltCut);
const coverLu = {}; // landuse zones for the generator (residential / industrial / commercial): building styles by district
for (const c of coverPolys) if (c.k === 'resid' || c.k === 'industrial' || c.k === 'comm') (coverLu[c.k] ??= []).push(flat(dp(c.outer, 1, true)));

// ------------------------------------------------------------------------------------------------ terrain (DEM)
// Terrarium tiles (fetch_dem.mjs; SRTM-based surface model) -> an 8 m height grid in map coordinates:
//  - opening filter (min then max over ~56 m) strips roofs / tree canopies the radar surface model contains,
//  - blur, then heights relative to the reservoir: y = elev - waterElev + WATER_Y, land kept >= 1.2 m above the water
//    and sloping down to it (<= 0.5 m/m) within the last metres of shore (no cliffs straight out of the river),
//  - stored as Int16 (2 cm steps) in public/assets/cherkasy/dem.bin
const WATER_Y = -1.6, DEMC = 8;
const DEM = { x0: REGION.x0 - 2500, z0: REGION.z0 - 2500, x1: REGION.x1 + 2500, z1: REGION.z1 + 2500, cell: DEMC };
{
  const Z = 13, tiles = new Map();
  const tileImg = (tx, ty) => { const k = tx + ',' + ty; if (tiles.has(k)) return tiles.get(k); const f = new URL(`./raw/dem/${Z}_${tx}_${ty}.png`, import.meta.url); const im = existsSync(f) ? PNG.sync.read(readFileSync(f)) : null; tiles.set(k, im); return im; };
  const elevPx = (gx, gy) => { // global pixel coords at zoom Z
    const tx = Math.floor(gx / 256), ty = Math.floor(gy / 256), im = tileImg(tx, ty); if (!im) return NaN;
    const px = Math.min(255, Math.max(0, gx - tx * 256)), py = Math.min(255, Math.max(0, gy - ty * 256)), i = (py * 256 + px) * 4;
    return im.data[i] * 256 + im.data[i + 1] + im.data[i + 2] / 256 - 32768;
  };
  const elevLL = (lat, lon) => {
    const n = 2 ** Z * 256, fx = (lon + 180) / 360 * n - 0.5, fy = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n - 0.5;
    const gx = Math.floor(fx), gy = Math.floor(fy), tx = fx - gx, ty = fy - gy, mix = (a, b, t) => a * (1 - t) + b * t;
    return mix(mix(elevPx(gx, gy), elevPx(gx + 1, gy), tx), mix(elevPx(gx, gy + 1), elevPx(gx + 1, gy + 1), tx), ty);
  };
  const toLL = (x, z) => { const e = x * CR + z * SR, n = x * SR - z * CR; return [FRAME.lat0 + n / KY, FRAME.lon0 + e / KX]; };
  const nx = Math.ceil((DEM.x1 - DEM.x0) / DEMC) + 1, nz = Math.ceil((DEM.z1 - DEM.z0) / DEMC) + 1;
  DEM.nx = nx; DEM.nz = nz;
  const grid = { ...DEM, nx, nz };
  let E = new Float32Array(nx * nz);
  for (let k = 0; k < E.length; k++) { const [la, lo] = toLL(DEM.x0 + (k % nx) * DEMC, DEM.z0 + Math.floor(k / nx) * DEMC); E[k] = elevLL(la, lo); }
  // water mask on the grid (rasterised water polygons)
  const W = new Uint8Array(nx * nz);
  for (const w of water) scanFill(W, grid, [w.outer, ...w.holes]);
  // water level: median of the sampled (every 7th) finite heights under the water mask
  const wl = [];
  for (let k = 0; k < W.length; k += 7) { const v = E[k]; if (W[k] && Number.isFinite(v)) wl.push(v); }
  wl.sort((a, b) => a - b);
  const waterElev = wl.length ? wl[Math.floor(wl.length * 0.5)] : 77;
  for (let k = 0; k < E.length; k++) if (!Number.isFinite(E[k])) E[k] = waterElev + 25;
  // building footprints (grown 1 cell) are unknown in a surface model: inpaint them from the ground around (push-pull)
  const U = new Uint8Array(nx * nz);
  for (const b of blds) {
    if (b.A < 150) continue;
    const bb = bboxOf(b.outer);
    for (let j = Math.max(0, Math.floor((bb.z0 - DEM.z0) / DEMC) - 1); j <= Math.min(nz - 1, Math.ceil((bb.z1 - DEM.z0) / DEMC) + 1); j++)
      for (let i = Math.max(0, Math.floor((bb.x0 - DEM.x0) / DEMC) - 1); i <= Math.min(nx - 1, Math.ceil((bb.x1 - DEM.x0) / DEMC) + 1); i++) {
        const x = DEM.x0 + i * DEMC, z = DEM.z0 + j * DEMC;
        if (inPoly(b.outer, x, z) || inPoly(b.outer, x + 6, z) || inPoly(b.outer, x - 6, z) || inPoly(b.outer, x, z + 6) || inPoly(b.outer, x, z - 6)) U[j * nx + i] = 1;
      }
  }
  // multi-resolution fill: average known neighbours, coarse to fine
  E = pushPullFill(E, Uint8Array.from(U, (u, k) => (u || W[k] ? 0 : 1)), W, nx, nz, 400);
  // pine / mixed forest: the radar surface sits on the canopy (~12 m): lower it (feathered by a blur of the mask)
  { let F = new Float32Array(nx * nz);
    for (const rings of (cover.forest ?? [])) {
      const bb = bboxOf(rings.outer);
      for (let j = Math.max(0, Math.floor((bb.z0 - DEM.z0) / DEMC)); j <= Math.min(nz - 1, Math.ceil((bb.z1 - DEM.z0) / DEMC)); j++)
        for (let i = Math.max(0, Math.floor((bb.x0 - DEM.x0) / DEMC)); i <= Math.min(nx - 1, Math.ceil((bb.x1 - DEM.x0) / DEMC)); i++)
          if (inPoly(rings.outer, DEM.x0 + i * DEMC, DEM.z0 + j * DEMC)) F[j * nx + i] = 1;
    }
    F = gauss(F, nx, nz, 4);
    for (let k = 0; k < E.length; k++) E[k] -= 11 * F[k];
  }
  E = dilate(erode(E, nx, nz, 4), nx, nz, 4); // opening: whatever is left narrower than ~70 m (small canopies, sheds) vanishes
  E = gauss(E, nx, nz, 4);
  // distance to water (cells, chamfer) -> shore ramp
  const D = chamfer(W, nx, nz);
  const H = new Int16Array(nx * nz);
  let hmin = Infinity, hmax = -Infinity;
  for (let k = 0; k < E.length; k++) {
    let y = E[k] - waterElev + WATER_Y;
    if (W[k]) y = Math.min(y, WATER_Y - 1.5);
    else y = Math.max(WATER_Y + 1.2, Math.min(y, WATER_Y + 1.2 + D[k] * DEMC * 0.5));
    H[k] = Math.round(y * 50); if (!W[k]) { hmin = Math.min(hmin, y); hmax = Math.max(hmax, y); }
  }
  writeFileSync(new URL('../../public/assets/cherkasy/dem.bin', import.meta.url), Buffer.from(H.buffer));
  DEM.scale = 0.02; DEM.waterElev = waterElev;
  console.log('dem', nx, 'x', nz, 'water elev', waterElev.toFixed(1), 'land y', hmin.toFixed(1), '..', hmax.toFixed(1));
}

const TS = (polys) => tileSplit(polys, 256, DEM);
for (const k of Object.keys(coverOut)) coverOut[k] = polysToRings(TS(coverOut[k].map(r => ({ outer: ringPts2(r[0]), holes: r.slice(1).map(ringPts2) }))));
const map = {
  attribution: 'Map data (c) OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright',
  frame: FRAME, region: REGION, landExtent: LAND, dem: DEM,
  buildings: outB,
  roads: roads.map(r => ({ p: flat(r.P), w: r.w, c: r.cls, k: r.kind, n: r.name || undefined, br: r.br || undefined, ow: r.ow || undefined, ln: r.lanes || undefined, tw: r.tw || undefined })),
  asphalt: polysToRings(TS(simp(asphalt, 0.15))), walks: polysToRings(TS(simp(walks, 0.15))), dirt: polysToRings(TS(simp(dirt, 0.2))),
  land: polysToRings(TS(landCut)), junctions, water: polysToRings(simp(clip(water.flatMap(p => [p.outer, ...p.holes]), [rectRing({ x0: REGION.x0 - 3000, x1: REGION.x1 + 3000, z0: REGION.z0 - 3000, z1: REGION.z1 + 3000 })], ClipperLib.ClipType.ctIntersection, ClipperLib.PolyFillType.pftEvenOdd), 0.8)),
  cover: { ...coverOut, pond: polysToRings(simp(ponds, 0.4)) }, zones: coverLu, rails, trees, pois,
};
mkdirSync(new URL('../../public/assets/cherkasy/', import.meta.url), { recursive: true });
// buildings go to their own file: the published artifact takes text files up to 16 MB each (city.js joins them)
const { buildings, ...rest } = map;
const txt = JSON.stringify({ ...rest, buildingsFile: 'map_buildings.json' }), txtB = JSON.stringify(buildings);
writeFileSync(new URL('../../public/assets/cherkasy/map.json', import.meta.url), txt);
writeFileSync(new URL('../../public/assets/cherkasy/map_buildings.json', import.meta.url), txtB);
console.log('map.json', (txt.length / 1e6).toFixed(1), 'MB + map_buildings.json', (txtB.length / 1e6).toFixed(1), 'MB');
