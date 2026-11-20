// Headless checks for the city's fences (public/assets/cherkasy/map_fences.json from tools/cherkasy/build_fences.mjs,
// built into chunks by src/world/cherkasy/fencework.js): the data parses, lies inside the map and off the
// carriageways; every lot's gate and wicket has a sane width; the chunk builder gives valid indexed geometry with the
// panels first (the far LOD), stays inside its triangle and collider budgets, honours the dead-piece mask and is
// deterministic; the atlas has the size it says.
//   node tests/fences.test.mjs
import { readFileSync } from 'node:fs';
import { parseFences, samplePoints, buildFenceChunks, makeFenceAtlas, openLeaves } from '../src/world/cherkasy/fencework.js';

const root = new URL('../', import.meta.url);
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails++; };

const raw = readFileSync(new URL('public/assets/cherkasy/map_fences.json', root));
const json = JSON.parse(raw);
const map = JSON.parse(readFileSync(new URL('public/assets/cherkasy/map.json', root)));
ok(raw.length < 3.2e6, `map_fences.json is ${(raw.length / 1e6).toFixed(2)} MB (< 3.2)`);
ok(json.region.x0 === map.region.x0 && json.region.z0 === map.region.z0, 'same frame as map.json');
ok(typeof json.attribution === 'string' && /OpenStreetMap/.test(json.attribution), 'carries the OSM attribution');

const F = parseFences(json), K = Object.fromEntries(F.kinds.map((k, i) => [k, i]));
ok(F.n > 50000 && F.n < 110000, `${F.n} pieces`);
let out = 0, badKind = 0, badH = 0, km = 0, gates = 0, open = 0, badGate = 0, wickets = 0, badWicket = 0, fronts = 0, gen = 0;
const R = map.region, lenOf = (k) => { let L = 0; for (let j = F.start[k] + 1; j < F.start[k] + F.count[k]; j++) L += Math.hypot(F.pts[2 * j] - F.pts[2 * j - 2], F.pts[2 * j + 1] - F.pts[2 * j - 1]); return L; };
for (let k = 0; k < F.n; k++) {
  if (F.kind[k] >= F.kinds.length) badKind++;
  if (!(F.h[k] >= 0.6 && F.h[k] <= 4)) badH++;
  for (let j = F.start[k]; j < F.start[k] + F.count[k]; j++) { const x = F.pts[2 * j], z = F.pts[2 * j + 1]; if (!(x > R.x0 - 5 && x < R.x1 + 5 && z > R.z0 - 5 && z < R.z1 + 5)) out++; }
  const L = lenOf(k); km += L / 1000;
  if (F.kind[k] === K.gate || F.kind[k] === K.oldgate) { gates++; if (L < 2.2 || L > 6.5) badGate++; }
  if (F.kind[k] === K.gateopen) { open++; if (L < 2.2 || L > 9) badGate++; } // an open gate spans its driveway
  if (F.kind[k] === K.wicket || F.kind[k] === K.oldwicket) { wickets++; if (L < 0.7 || L > 1.6) badWicket++; }
  if (F.flags[k] & 1) fronts++;
  if (F.flags[k] & 2) gen++;
}
ok(badKind === 0 && badH === 0, `kinds and heights are sane (${badKind} / ${badH} bad)`);
ok(out === 0, `every point inside the map region (${out} outside)`);
ok(km > 400 && km < 900, `${km.toFixed(0)} km of fences`);
ok(gates > 5000 && open > 100 && badGate === 0, `${gates} gates, each 2.2–6.5 m wide, and ${open} open ones over driveways (${badGate} off size)`);
ok(wickets > 5000 && badWicket === 0, `${wickets} wickets, each 0.7–1.6 m wide (${badWicket} not)`);
ok(fronts > 20000 && gen > 5000 && gen < fronts, `${fronts} street-front pieces, ${gen} of them generated`);

// off the carriageways: the first / middle / last point of every piece against the motor roads' own width (an open
// gate stands across its driveway on purpose, and has no collider there: see below)
{
  const C = 64, grid = new Map(), key = (i, j) => i * 100003 + j;
  const segs = [];
  for (const r of map.roads) {
    if (r.k !== 'm') continue;
    const p = r.p;
    for (let i = 2; i + 1 < p.length; i += 2) {
      const s = { ax: p[i - 2], az: p[i - 1], bx: p[i], bz: p[i + 1], w: r.w };
      segs.push(s);
      for (let gi = Math.floor((Math.min(s.ax, s.bx) - 12) / C); gi <= Math.floor((Math.max(s.ax, s.bx) + 12) / C); gi++) for (let gj = Math.floor((Math.min(s.az, s.bz) - 12) / C); gj <= Math.floor((Math.max(s.az, s.bz) + 12) / C); gj++) {
        const k = key(gi, gj); (grid.get(k) ?? grid.set(k, []).get(k)).push(s);
      }
    }
  }
  const S = samplePoints(F);
  let on = 0;
  for (let i = 0; i < S.length; i += 2) {
    const x = S[i], z = S[i + 1];
    if (F.kind[Math.floor(i / 6)] === K.gateopen) continue;
    for (const s of grid.get(key(Math.floor(x / C), Math.floor(z / C))) ?? []) {
      const dx = s.bx - s.ax, dz = s.bz - s.az, t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) < s.w / 2 - 0.15) { on++; break; }
    }
  }
  ok(segs.length > 5000, `${segs.length} motor road segments to test against`);
  ok(on === 0, `no fence point on a carriageway (${on} of ${S.length / 2})`);
}

// no orphan stubs: pieces join into groups (an end within 0.8 m of another piece); every group holds 4 m of fence, or
// closes a gap between two buildings, or runs 2.5 m from one (the compiler's step 6, checked on the compiled data)
{
  const C = 16, grid = new Map(), key = (i, j) => i * 100003 + j, parent = Array.from({ length: F.n }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const near = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
  for (let k = 0; k < F.n; k++) for (let j = F.start[k] + 1; j < F.start[k] + F.count[k]; j++) {
    const s = [k, F.pts[2 * j - 2], F.pts[2 * j - 1], F.pts[2 * j], F.pts[2 * j + 1]];
    for (let gi = Math.floor((Math.min(s[1], s[3]) - 1) / C); gi <= Math.floor((Math.max(s[1], s[3]) + 1) / C); gi++) for (let gj = Math.floor((Math.min(s[2], s[4]) - 1) / C); gj <= Math.floor((Math.max(s[2], s[4]) + 1) / C); gj++) { const q = key(gi, gj); (grid.get(q) ?? grid.set(q, []).get(q)).push(s); }
  }
  const B = JSON.parse(readFileSync(new URL('public/assets/cherkasy/map_buildings.json', root))), bgrid = new Map();
  for (const b of B) { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (let i = 0; i < b.p.length; i += 2) { x0 = Math.min(x0, b.p[i]); x1 = Math.max(x1, b.p[i]); z0 = Math.min(z0, b.p[i + 1]); z1 = Math.max(z1, b.p[i + 1]); }
    for (let gi = Math.floor((x0 - 2.5) / 32); gi <= Math.floor((x1 + 2.5) / 32); gi++) for (let gj = Math.floor((z0 - 2.5) / 32); gj <= Math.floor((z1 + 2.5) / 32); gj++) { const q = key(gi, gj); (bgrid.get(q) ?? bgrid.set(q, []).get(q)).push(b.p); } }
  const atBuilding = (x, z) => (bgrid.get(key(Math.floor(x / 32), Math.floor(z / 32))) ?? []).some((p) => { // within 2.1 m of a wall (the compiler: 1.8 m, before the 0.1 m rounding), or inside
    let inside = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      if (near(x, z, p[j], p[j + 1], p[i], p[i + 1]) < 2.1) return true;
      if ((p[i + 1] > z) !== (p[j + 1] > z) && x < (p[j] - p[i]) * (z - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) inside = !inside;
    }
    return inside;
  });
  const ends = new Uint8Array(F.n);
  for (let k = 0; k < F.n; k++) for (const j of [F.start[k], F.start[k] + F.count[k] - 1]) {
    const x = F.pts[2 * j], z = F.pts[2 * j + 1];
    for (const s of grid.get(key(Math.floor(x / C), Math.floor(z / C))) ?? []) if (s[0] !== k && near(x, z, s[1], s[2], s[3], s[4]) < 0.95) parent[find(k)] = find(s[0]);
    if (atBuilding(x, z)) ends[k]++;
  }
  // no gap in a closed run: a gate or a wicket meets the fence (or the other leaf) at both ends
  let gateEnds = 0, open = 0;
  for (let k = 0; k < F.n; k++) {
    if (F.kind[k] < K.gate || F.kind[k] === K.gateopen) continue;
    for (const j of [F.start[k], F.start[k] + F.count[k] - 1]) {
      const x = F.pts[2 * j], z = F.pts[2 * j + 1]; gateEnds++;
      if (!(grid.get(key(Math.floor(x / C), Math.floor(z / C))) ?? []).some((s) => s[0] !== k && near(x, z, s[1], s[2], s[3], s[4]) < 0.12) && !atBuilding(x, z)) open++;
    }
  }
  ok(open <= gateEnds * 0.003, `gates and wickets close their runs: ${open} of ${gateEnds} ends meet nothing`);
  const G = new Map();
  for (let k = 0; k < F.n; k++) { const g = G.get(find(k)) ?? G.set(find(k), { fence: 0, total: 0, ends: 0, n: 0 }).get(find(k)), L = lenOf(k); if (F.kind[k] < K.gate) g.fence += L; if (F.kind[k] !== K.gateopen) g.total += L; g.ends += ends[k]; g.n++; }
  let orphans = 0, lone = 0;
  for (const g of G.values()) { if (!(g.fence >= 3.8 || g.ends >= 2 || (g.ends >= 1 && g.total >= 2.3))) orphans += g.n; if (g.n === 1) lone++; }
  ok(orphans === 0, `no orphan stub among the ${G.size} groups of joined pieces (${orphans} pieces in groups too small to stand alone)`);
  ok(json.stats.orphans > 100, `the compiler dropped ${json.stats.orphans} of them (${json.stats.orphanKm} km)`);
}
// the hedges: the shrub layer's hedge blocks (hedges_data.js, compiled from this file's hedge pieces) stand on a hedge
// piece's face and solid. The compiler once read OSM ids out of hedges_data.js as "a site draws these" and left every
// hedge out; a hedge run with no piece under it means the two files are out of step (run build_hedges.mjs).
{
  const { HEDGES } = await import('../src/world/cherkasy/hedges_data.js');
  const H = []; let m = 0;
  for (let k = 0; k < F.n; k++) if (F.kind[k] === K.hedge) { m += lenOf(k); for (let j = F.start[k] + 1; j < F.start[k] + F.count[k]; j++) H.push([F.pts[2 * j - 2], F.pts[2 * j - 1], F.pts[2 * j], F.pts[2 * j + 1]]); }
  const off = (x, z) => Math.min(...H.map(([ax, az, bx, bz]) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - ax - dx * t, z - az - dz * t); }));
  const astray = HEDGES.filter(({ p }) => off(p[0], p[1]) > 0.3 || off(p[2], p[3]) > 0.3).length;
  ok(m > 800, `${m.toFixed(0)} m of hedges in ${H.length} segments`);
  ok(HEDGES.length > 100 && astray === 0, `each of the ${HEDGES.length} hedge runs of hedges_data.js lies on a hedge piece (${astray} do not)`);
}
// an open gate's leaves swing into the lot and never stand over a road
{
  const C = 64, grid = new Map(), key = (i, j) => i * 100003 + j;
  for (const r of map.roads) { if (r.k !== 'm') continue; const p = r.p; for (let i = 2; i + 1 < p.length; i += 2) { const s = [p[i - 2], p[i - 1], p[i], p[i + 1], r.w];
    for (let gi = Math.floor((Math.min(s[0], s[2]) - 12) / C); gi <= Math.floor((Math.max(s[0], s[2]) + 12) / C); gi++) for (let gj = Math.floor((Math.min(s[1], s[3]) - 12) / C); gj <= Math.floor((Math.max(s[1], s[3]) + 12) / C); gj++) { const q = key(gi, gj); (grid.get(q) ?? grid.set(q, []).get(q)).push(s); } } }
  const onRoad = (x, z) => (grid.get(key(Math.floor(x / C), Math.floor(z / C))) ?? []).some((s) => { const dx = s[2] - s[0], dz = s[3] - s[1], t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - s[0] - dx * t, z - s[1] - dz * t) < s[4] / 2 - 0.1; });
  let n = 0, bare = 0, over = 0;
  for (let k = 0; k < F.n; k++) {
    if (F.kind[k] !== K.gateopen) continue;
    n++;
    if (F.flags[k] & 4) { bare++; continue; }
    const a = F.start[k];
    for (const [x0, z0, x1, z1] of openLeaves(F.pts[2 * a], F.pts[2 * a + 1], F.pts[2 * a + 2], F.pts[2 * a + 3])) for (const t of [0.3, 0.65, 1]) if (onRoad(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) { over++; break; }
  }
  ok(n > 100 && over === 0, `${n} open gates: no leaf over a carriageway (${over}); ${bare} with no clear side keep their posts only`);
  ok(bare < n * 0.4, 'most open gates keep their leaves');
  const lv = openLeaves(0, 0, 4, 0);
  ok(lv.every(([, , , z1]) => z1 > 1.5) && lv[0][2] < 0 && lv[1][2] > 4, 'leaves swing to the left of the piece (the lot) and away from the opening');
}

// the chunk builder
const t0 = performance.now();
const res = buildFenceChunks(F, () => 0);
const ms = performance.now() - t0;
let tris = 0, lite = 0, verts = 0, bad = 0, maxTris = 0;
for (const c of res.chunks) {
  const nv = c.position.length / 3;
  if (c.index.length % 3 || c.lite % 3 || c.lite > c.index.length || c.normal.length !== nv * 3 || c.uv.length !== nv * 2 || c.color.length !== nv * 3 || c.box.length !== 6) bad++;
  let hi = 0; for (let i = 0; i < c.index.length; i++) if (c.index[i] > hi) hi = c.index[i];
  if (hi >= nv) bad++;
  for (let i = 0; i < c.position.length; i++) if (!Number.isFinite(c.position[i])) { bad++; break; }
  tris += c.index.length / 3; lite += c.lite / 3; verts += nv; maxTris = Math.max(maxTris, c.index.length / 3);
}
ok(res.chunks.length > 100 && res.chunks.length < 400, `${res.chunks.length} chunks of 512 m`);
ok(bad === 0, `every chunk is valid indexed geometry, panels first (${bad} bad)`);
ok(tris < 800000 && lite < 300000 && lite < tris / 2, `${(tris / 1e3).toFixed(0)}k triangles near, ${(lite / 1e3).toFixed(0)}k far (panels only)`);
ok(verts < 1.3e6 && maxTris < 22000, `${(verts / 1e3).toFixed(0)}k vertices, the heaviest chunk ${maxTris} triangles`);
ok(res.solids.length % 6 === 0 && res.solids.length / 6 > 10000 && res.solids.length / 6 < 60000, `${res.solids.length / 6} collision runs (< 60000)`);
{
  let short = 0, tall = 0;
  for (let i = 0; i < res.solids.length; i += 6) { if (Math.hypot(res.solids[i + 2] - res.solids[i], res.solids[i + 3] - res.solids[i + 1]) < 0.05) short++; if (!(res.solids[i + 5] - res.solids[i + 4] > 0.5 && res.solids[i + 5] - res.solids[i + 4] < 6)) tall++; }
  ok(short === 0 && tall === 0, `collision runs have a length and a fence's height (${short} / ${tall} bad)`);
}
{ // a driveway's open gate leaves the driveway free: no collision run through its middle
  const S = res.solids; let shut = 0, n = 0;
  for (let k = 0; k < F.n; k++) {
    if (F.kind[k] !== K.gateopen) continue;
    const a = F.start[k], x = (F.pts[2 * a] + F.pts[2 * a + 2]) / 2, z = (F.pts[2 * a + 1] + F.pts[2 * a + 3]) / 2;
    n++;
    for (let i = 0; i < S.length; i += 6) {
      const dx = S[i + 2] - S[i], dz = S[i + 3] - S[i + 1], t = Math.max(0, Math.min(1, ((x - S[i]) * dx + (z - S[i + 1]) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - S[i] - dx * t, z - S[i + 1] - dz * t) < 0.4) { shut++; break; }
    }
  }
  ok(shut === 0, `the ${n} open gates leave their driveways free (${shut} blocked)`);
}
ok(ms < 1500, `built in ${ms.toFixed(0)} ms`);
const again = buildFenceChunks(F, () => 0);
ok(again.chunks.length === res.chunks.length && again.chunks.every((c, i) => c.index.length === res.chunks[i].index.length && c.position.length === res.chunks[i].position.length) && again.solids.length === res.solids.length, 'the build is deterministic');
const none = buildFenceChunks(F, () => 0, new Uint8Array(F.n).fill(1));
ok(none.chunks.length === 0 && none.solids.length === 0, 'a dead piece is not built: no geometry, no collider');
const half = new Uint8Array(F.n); for (let k = 0; k < F.n; k += 2) half[k] = 1;
const some = buildFenceChunks(F, () => 0, half);
ok(some.solids.length > 0 && some.chunks.reduce((s, c) => s + c.index.length, 0) < tris * 3 * 0.75, 'half of the pieces dead: clearly less geometry');
// a slope: the fence follows the ground
{
  const hill = buildFenceChunks(F, (x, z) => x * 0.05 + z * 0.02), c = hill.chunks[0], flat = res.chunks[0];
  let moved = 0; for (let i = 1; i < c.position.length; i += 3) if (Math.abs(c.position[i] - flat.position[i]) > 0.5) moved++;
  ok(hill.chunks.length === res.chunks.length && moved > c.position.length / 3 * 0.9, 'on a slope the fences follow the ground');
}

const atlas = makeFenceAtlas();
ok(atlas.data.length === atlas.width * atlas.height * 4 && atlas.width === 512, `atlas ${atlas.width} x ${atlas.height} RGBA`);
{
  let clear = 0, solid = 0; for (let i = 3; i < atlas.data.length; i += 4) { if (atlas.data[i] < 128) clear++; else solid++; }
  ok(clear > 0 && solid > clear, 'the atlas has see-through texels (mesh, bars, picket) and mostly solid ones');
}

{ // the mips keep a see-through row visible: at 1/8 size the bars and the mesh still have texels over the alpha test
  const m = atlas.mips[2], rh = 256 >> 3;
  const share = (r) => { let n = 0; for (let y = r * rh + 2; y < (r + 1) * rh - 2; y++) for (let x = 0; x < m.width; x++) if (m.data[(y * m.width + x) * 4 + 3] >= 128) n++; return n / ((rh - 4) * m.width); };
  ok(atlas.mips.length === 12 && atlas.mips.at(-1).width === 1 && atlas.mips.at(-1).height === 1 && m.width === 64, `${atlas.mips.length} mip levels down to 1 x 1`);
  const bars = share(8), mesh = share(6), sheet = share(0);
  ok(bars > 0.08 && bars < 0.9 && mesh > 0.05 && mesh < 0.9, `at 1/8 size the bars and the mesh keep their share over the alpha test (${bars.toFixed(2)}, ${mesh.toFixed(2)})`);
  ok(sheet === 1, 'and a sheet fence stays solid');
}
{ // a collision run keeps to the fence line at a bend and to the ground on a slope
  const one = (pts, heightAt) => {
    const d = [0, 1, 20, 0, pts.length, Math.round(pts[0][0] * 10), Math.round(pts[0][1] * 10)];
    for (let i = 1; i < pts.length; i++) d.push(Math.round((pts[i][0] - pts[i - 1][0]) * 10), Math.round((pts[i][1] - pts[i - 1][1]) * 10));
    return buildFenceChunks(parseFences({ ...json, region: { x0: 0, z0: 0 }, d }), heightAt).solids;
  };
  const bend = one([[0, 0], [20, 0], [40, 8]], () => 0);
  ok(bend.length === 12, `a 22 degree bend is two collision runs, not one chord (${bend.length / 6})`);
  const wob = one([[0, 0], [20, 0.1], [40, 0]], () => 0);
  ok(wob.length === 6, `a wobbly straight line is one (${wob.length / 6})`);
  const slope = one([[0, 0], [40, 0]], (x) => x * 0.2);
  let tall = 0; for (let i = 0; i < slope.length; i += 6) tall = Math.max(tall, slope[i + 5] - slope[i + 4]);
  ok(slope.length / 6 >= 4 && tall < 2 + 0.5 + 1.3, `up a 20 % slope the run is cut so its box stays near the fence's top (${slope.length / 6} boxes, the tallest ${tall.toFixed(1)} m)`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
