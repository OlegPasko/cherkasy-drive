// Headless checks of the greenery upgrade: the tree and shrub geometry budgets, the shrub layer's pools, the
// planting rules on the real map and what the shrubs keep off (fences, gates, street props) (node tests/greenery.test.mjs; no framework).
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { ringPts } from '../src/world/cherkasy/geo.js';
import { createHeightField, buildGroundData } from '../src/world/cherkasy/ground.js';
import { treeSpots, footprintRaster } from '../src/world/cherkasy/greenery.js';
import { shrubSpots, shrubSteps, hedgeRows, obstacleIndex, FOOT } from '../src/world/cherkasy/shrubbery.js';
import { parseFences } from '../src/world/cherkasy/fencework.js';
import { buildStreet } from '../src/world/cherkasy/street.js';
import { createCollisionWorld } from '../src/world/collision.js';
import { HEDGES } from '../src/world/cherkasy/hedges_data.js';
import { buildTrees, SHRUBS } from '../src/world/trees.js';
import { buildTreeGeometries, buildShrubGeometries, RECIPES } from '../src/world/nature/treegeo.js';
import { buildTreeGeometries as legacyGeometries } from '../src/world/nature/treegeo_legacy.js';
import { createShrubLayer, SHRUB_STRIDE } from '../src/world/nature/shrubs.js';

let fails = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fails++; console.log('FAIL', msg); } };
const tris = (g) => g.attributes.position.count / 3;

// ---- geometry: the new species, and no more triangles than the budget allows
{
  const G = buildTreeGeometries(), old = legacyGeometries();
  for (const v of ['linden', 'linden2', 'chestnut', 'chestnut2', 'maple', 'oak', 'birch', 'elm', 'sapling', 'fruit', 'pine', 'pine2', 'poplar', 'willow', 'spruce', 'hedge']) ok(G.variants[v]?.near && G.variants[v]?.mid, `variant ${v}`);
  ok(Object.keys(old.variants).every((v) => G.variants[v]), 'every old variant is still there (sites name them)');
  const worst = Object.entries(G.variants).map(([k, v]) => [k, tris(v.near), tris(v.mid)]);
  ok(worst.every(([, a]) => a <= 2100), `near meshes <= 2100 triangles (${worst.map((q) => q[1]).join(' ')})`);
  ok(worst.every(([, , b]) => b <= 560), `mid meshes <= 560 triangles (${worst.map((q) => q[2]).join(' ')})`);
  // the commonest trees must not cost more than before: the pine woods and the street rows fill the frame
  for (const v of ['linden', 'chestnut', 'pine', 'maple', 'elm', 'birch']) ok(tris(G.variants[v].near) <= tris(old.variants[v].near) && tris(G.variants[v].mid) <= tris(old.variants[v].mid) * 1.25, `${v}: ${tris(G.variants[v].near)} / ${tris(G.variants[v].mid)} triangles, was ${tris(old.variants[v].near)} / ${tris(old.variants[v].mid)}`);
  for (const [k, v] of Object.entries(G.variants)) {
    const p = v.near.attributes.position, L = v.near.attributes.aLeaf; let bad = 0, low = Infinity;
    for (let i = 0; i < p.count; i++) { if (![p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite)) bad++; if (L.getX(i) > 0.5 && k !== 'hedge' && k !== 'spruce') low = Math.min(low, p.getY(i)); }
    ok(!bad, `${k}: finite positions`);
    if (RECIPES[k]?.kind === 'broad') ok(low >= Math.min(1.2, RECIPES[k].clear * 0.5), `${k}: no leaves under ${low.toFixed(2)} m (cars pass under the crowns)`);
  }
  const S = buildShrubGeometries();
  ok(tris(S.near) <= 260 && tris(S.far) <= 60, `shrub meshes ${tris(S.near)} / ${tris(S.far)} triangles`);
  for (const g of [S.near, S.far]) {
    g.computeBoundingBox(); const b = g.boundingBox, p = g.attributes.position;
    ok(b.min.y > -0.101 && b.max.y < 1.001 && b.max.y > 0.999 && b.min.x > -0.62 && b.max.x < 0.62 && b.min.z > -0.62 && b.max.z < 0.62, 'the bush fills its unit box');
    // it stands in the ground, at some girth: no bush floats over its shadow (a 3 m lilac did, by half a metre)
    let x0 = 1, x1 = -1, z0 = 1, z1 = -1;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.03) { x0 = Math.min(x0, p.getX(i)); x1 = Math.max(x1, p.getX(i)); z0 = Math.min(z0, p.getZ(i)); z1 = Math.max(z1, p.getZ(i)); }
    ok(b.min.y < -0.05 && x1 - x0 > 0.3 && z1 - z0 > 0.3, `the bush's foot is in the ground (lowest ${b.min.y.toFixed(2)}, ${(x1 - x0).toFixed(2)} x ${(z1 - z0).toFixed(2)} wide there)`);
  }
}

// ---- the shrub layer: pools, bands, culling
{
  const N = 20000, data = new Float32Array(N * SHRUB_STRIDE), kinds = Object.values(SHRUBS);
  for (let i = 0; i < N; i++) data.set([(i % 200) * 4 - 400, 0, Math.floor(i / 200) * 4 - 200, i, 1.5, 1.2, i % kinds.length, (i * 0.37) % 1], i * SHRUB_STRIDE);
  const group = new THREE.Group(), geos = buildShrubGeometries(), mats = [];
  const layer = createShrubLayer({ group, data, kinds, geos, material: (fade) => { const m = new THREE.MeshBasicMaterial(); m.userData.uFade = { value: new THREE.Vector4(...fade) }; mats.push(m); return m; } });
  ok(group.children.length === 2 && layer.count === N, 'two pools');
  const cam = new THREE.Vector3(0, 2, 0);
  layer.update(cam, null);
  const a = layer.stats(), inR = (r) => { let c = 0; for (let i = 0; i < N; i++) if (Math.hypot(data[i * 8], data[i * 8 + 2]) < r) c++; return c; };
  ok(a.items === N && a.drawCalls === 2, 'stats');
  ok(a.near >= inR(26) && a.near <= inR(34 + 8), `near pool holds the bushes within its band (${a.near}: ${inR(26)}..${inR(42)})`);
  ok(a.far >= inR(130) - a.near && a.far <= inR(160 + 50), `far pool holds the rest to the layer's reach (${a.far})`);
  // a view wedge leaves out what is behind the camera
  cam.x += 7; // past the repack distance
  layer.update(cam, { full: false, fc: 0, h: 0.6 });
  const b = layer.stats();
  ok(b.far < a.far * 0.75 && b.far > a.far * 0.15, `a view wedge culls the far pool (${a.far} -> ${b.far})`);
  // a shorter reach draws fewer, and never more than the pools were sized for
  layer.setDetail({ near: [13, 17], out: [48, 62], shadow: false });
  layer.update(cam, null);
  const c = layer.stats();
  ok(c.near < a.near && c.far < a.far && c.near >= inR(13), `the low level draws fewer (${c.near} + ${c.far})`);
  ok(group.children.every((m) => !m.castShadow), 'no shrub shadows at the low level');
  layer.setDetail({ near: [26, 34], out: [130, 160], shadow: true });
  ok(group.children.some((m) => m.castShadow) && !group.children.every((m) => m.castShadow), 'only the near bushes cast');
  for (let i = 0; i < 50; i++) { cam.set(i * 9 - 200, 2, i * 3); layer.update(cam, { full: false, fc: i * 0.4, h: 0.7 }); const s = layer.stats(); ok(s.near <= group.children[0].instanceMatrix.count && s.far <= group.children[1].instanceMatrix.count, 'pools never overflow'); }
  layer.dispose();
  ok(group.children.length === 0, 'dispose removes the pools');
}

// ---- trees + shrubs through buildTrees; the A/B switch
{
  const spots = [];
  for (let i = 0; i < 600; i++) spots.push({ x: (i % 30) * 8, z: Math.floor(i / 30) * 8, y: 0, kind: ['street', 'park', 'elm', 'small', 'conifer'][i % 5], sc: 1, wash: i % 3 === 0, variant: i % 7 === 0 ? 'willow' : undefined });
  const data = new Float32Array(500 * SHRUB_STRIDE);
  for (let i = 0; i < 500; i++) data.set([(i % 25) * 3, 0, Math.floor(i / 25) * 3, 0, 1.4, 1.1, i % 9, 0.5], i * 8);
  const kinds = Object.keys(SHRUBS);
  const T = buildTrees({ scene: new THREE.Group(), spots });
  ok(T.stats().plus === true && T.stats().shrubs === null, 'no shrubs until they are set');
  const before = T.group.children.length;
  T.setShrubs({ data, kinds });
  T.update(0.016, new THREE.Vector3(30, 2, 30));
  ok(T.group.children.length === before + 2 && T.stats().shrubs.items === 500 && T.stats().shrubs.near > 0, 'setShrubs adds the layer');
  ok(T.items.length === 600 && T.items.filter((it) => it.variant === 'willow').length === 86 && T.items.some((it) => it.wash), 'spots keep their variant and wash');
  let solids = 0; T.addSolids(() => solids++);
  ok(solids === 600, 'one trunk per tree, none per shrub');
  T.setDetail({ shrubNear: [13, 17], shrubOut: [48, 62], shrubShadow: false });
  ok(T.detail.shrubOut[1] === 62 && T.detail.shrubShadow === false, 'setDetail carries the shrub bands');
  T.setDetail({});
  ok(T.detail.shrubOut[1] === 160 && T.detail.shrubShadow === true, 'and the defaults come back');
  T.setShrubs(null);
  ok(T.group.children.length === before && T.stats().shrubs === null, 'setShrubs(null) drops the layer');
  const L = buildTrees({ scene: new THREE.Group(), spots, plus: false });
  ok(L.stats().plus === false && L.items.length === 600 && !L.items.some((it) => it.wash), 'plus: false builds the old trees, no limewash');
}

// ---- what the shrubs keep off: fences, gates, street props
{
  const kinds = ['sheet', 'gate', 'wicket', 'hedge'], d = [];
  const piece = (kind, pts) => { d.push(kinds.indexOf(kind), 0, 20, 0, pts.length / 2, pts[0] * 10, pts[1] * 10); for (let i = 2; i < pts.length; i += 2) d.push((pts[i] - pts[i - 2]) * 10, (pts[i + 1] - pts[i - 1]) * 10); };
  piece('sheet', [0, 0, 40, 0]); piece('gate', [40, 0, 43.5, 0]); piece('sheet', [43.5, 0, 60, 0, 60, 30]); piece('wicket', [100, 0, 101, 0]); piece('hedge', [0, 50, 30, 50]);
  const F = parseFences({ d, region: { x0: 0, z0: 0 }, unit: 0.1, kinds });
  const O = obstacleIndex({ fences: F, props: [{ x: 20, z: 10, kind: 'pole', alive: true }, { x: 20, z: 20, kind: 'bench', alive: true }, { x: 30, z: 10, kind: 'pole', alive: false }] });
  ok(O.hit(10, 0.8, 1) === 1 && O.hit(10, 1.3, 1) === 0 && O.hit(10, -0.8, 1) === 1, 'a bush within its radius of a fence touches it');
  ok(O.hit(41.7, 2.5, 1) === 2 && O.hit(41.7, -3, 1) === 2 && O.hit(41.7, 3.5, 1) === 0, 'a gate keeps its mouth free on both sides');
  ok(O.hit(100.5, 1.5, 0.5) === 0 && O.hit(100.5, 1, 0.5) === 2, 'a wicket keeps a narrower one');
  ok(O.hit(20.5, 10, 0.5) === 3 && O.hit(21.5, 20, 0.6) === 3 && O.hit(30, 10, 1) === 0 && O.hit(20, 13, 1) === 0, 'street props: by their kind, the dropped ones not at all');
  const a = O.settle(10, 0.6, 1), b = O.settle(10, -0.6, 1), c = O.settle(59.5, 0.5, 1);
  ok(a && a[1] > 1.14 && a[1] < 1.4 && a[0] === 10 && b && b[1] < -1.14, `a bush on a fence is pushed off it, to its own side (${a?.[1].toFixed(2)}, ${b?.[1].toFixed(2)})`);
  ok(c && c[0] < 58.9 && c[1] > 1.14 && O.hit(c[0], c[1], 1) === 0, 'out of a corner, off both fences');
  ok(O.settle(41.7, 1, 1) === null && O.settle(10, 0.005, 1) === null && O.settle(5, 5, 1)?.[0] === 5, 'none in a gate\'s mouth, none astride the line; a free bush stays');
  ok(O.hit(15, 50.5, 1) === 1 && obstacleIndex({ fences: F, skipKinds: ['hedge'] }).hit(15, 50.5, 1) === 0, 'skipKinds leaves a kind of fence out (the hedge blocks stand on the hedge lines)');
}

// ---- planting on the real map
{
  const dir = fileURLToPath(new URL('../public/assets/cherkasy/', import.meta.url));
  const map = JSON.parse(fs.readFileSync(dir + 'map.json'));
  map.buildings = JSON.parse(fs.readFileSync(dir + 'map_buildings.json'));
  const buf = fs.readFileSync(dir + 'dem.bin'), dem = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
  const hf = createHeightField(map, dem), whole = buildGroundData({ map, hf });
  const ground = { heightAt: hf.heightAt, onAsphalt: (x, z) => whole.asph.get(x, z) === 1, isWater: (x, z) => { const w = whole.wat.get(x, z); return w >= 0 ? w === 1 : whole.land.get(x, z) === 0; }, wetSegs: whole.wetSegs };
  const footprints = map.buildings.map((b) => ({ poly: ringPts(b.p), kind: b.k }));
  const occ = footprintRaster(footprints, map.region), R = map.region;
  const hole = (x, z) => Math.hypot(x + 600, z - 800) < 120;

  // trees: the upgrade keeps the old planting's places (same random stream) and only adds the willows
  const plus = treeSpots({ map, ground, footprints, occ, clear: hole });
  const old = treeSpots({ map, ground, footprints, occ, clear: [hole], plus: false });
  const willows = plus.filter((s) => s.variant === 'willow');
  ok(plus.length - willows.length === old.length, `the upgrade moves no tree (${old.length} + ${willows.length} willows = ${plus.length})`);
  let moved = 0; for (let i = 0; i < old.length; i++) if (plus[i].x !== old[i].x || plus[i].z !== old[i].z) moved++;
  ok(moved === 0, `same places, tree for tree (${moved} differ)`);
  ok(!old.some((s) => s.wash || ['willow', 'sapling', 'pine2', 'linden2', 'chestnut2'].includes(s.variant)), 'plus: false plants no new species');
  ok(willows.length > 60 && willows.length < 600, `willows by the water (${willows.length})`);
  ok(willows.every((s) => !ground.isWater(s.x, s.z) && !ground.onAsphalt(s.x, s.z) && occ.get(s.x, s.z) !== 1), 'willows stand on dry land, off roads and buildings');
  const count = {}; for (const s of plus) count[s.variant ?? s.kind] = (count[s.variant ?? s.kind] || 0) + 1;
  ok(count.pine > 5000 && count.pine2 > 5000 && count.sapling > 200 && count.linden2 > 500 && count.chestnut2 > 500, `two shapes of the commonest species, young street trees (${JSON.stringify(count)})`);
  const wash = plus.filter((s) => s.wash).length;
  ok(wash > 2000 && wash < plus.length * 0.2, `limewashed trunks on some streets and yards (${wash})`);
  ok(!plus.some((s) => hole(s.x, s.z)), 'no generated tree where a site clears');
  // бульвар Шевченка is the chestnut alley: its rows are chestnuts, no stretch of poplars
  {
    const cells = new Map(), key = (x, z) => Math.floor(x / 4) * 100000 + Math.floor(z / 4), row = { chestnut: 0, poplar: 0, other: 0 };
    for (const rd of map.roads) if (rd.k === 'm' && /бульвар.*Шевченка/.test(rd.n ?? '')) for (let i = 2; i < rd.p.length; i += 2) {
      const ax = rd.p[i - 2], az = rd.p[i - 1], L = Math.hypot(rd.p[i] - ax, rd.p[i + 1] - az), off = rd.w / 2 + 2;
      for (let t = 0; t <= L; t += 2) for (const side of [-1, 1]) cells.set(key(ax + (rd.p[i] - ax) * t / L - (rd.p[i + 1] - az) / L * side * off, az + (rd.p[i + 1] - az) * t / L + (rd.p[i] - ax) / L * side * off), 1);
    }
    const all = treeSpots({ map, ground, footprints, occ }), rows = all.slice(all.stats.osm, all.stats.osm + all.stats.street); // the street rows
    for (const s of rows) if (cells.has(key(s.x, s.z))) row[/^chestnut/.test(s.variant ?? '') ? 'chestnut' : s.kind === 'conifer' ? 'poplar' : 'other']++;
    // (a few poplars of the crossing streets' rows fall into the cells)
    ok(row.chestnut > 300 && row.poplar < 0.03 * row.chestnut && row.other < 0.3 * row.chestnut, `the boulevard's rows are chestnuts with a young tree or a linden here and there (${JSON.stringify(row)})`);
  }

  // shrubs
  const t0 = performance.now();
  const sh = shrubSpots({ map, ground, footprints, occ, clear: hole }), ms = performance.now() - t0, D = sh.data, N = D.length / SHRUB_STRIDE;
  ok(N === sh.stats.total && N > 60000 && N < 140000, `shrubs (${N}, ${Math.round(ms)} ms: ${JSON.stringify(sh.stats)})`);
  ok(sh.kinds.every((k) => SHRUBS[k]), 'every shrub kind has its colours');
  let bad = { building: 0, asphalt: 0, water: 0, out: 0, cleared: 0, size: 0, kind: 0 };
  for (let i = 0; i < N; i++) {
    const x = D[i * 8], y = D[i * 8 + 1], z = D[i * 8 + 2], w = D[i * 8 + 4], h = D[i * 8 + 5], k = D[i * 8 + 6];
    if (occ.get(x, z) === 1) bad.building++;
    if (ground.onAsphalt(x, z)) bad.asphalt++;
    if (ground.isWater(x, z)) bad.water++;
    if (!(x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1)) bad.out++;
    if (hole(x, z)) bad.cleared++;
    if (!(w > 0.4 && w < 5 && h > 0.3 && h < 5 && Number.isFinite(y))) bad.size++;
    if (!(k >= 0 && k < sh.kinds.length && Number.isInteger(k))) bad.kind++;
  }
  ok(Object.values(bad).every((v) => v === 0), `no shrub on a building, a road, water, outside the map or a cleared site (${JSON.stringify(bad)})`);
  // on footways and paving: none
  let onWalk = 0; const walkways = map.roads.filter((rd) => rd.k !== 'm').slice(0, 4000);
  const cells = new Map(); for (let i = 0; i < N; i++) { const key = Math.floor(D[i * 8] / 8) * 100000 + Math.floor(D[i * 8 + 2] / 8); (cells.get(key) ?? cells.set(key, []).get(key)).push(i); }
  for (const rd of walkways) for (let i = 2; i < rd.p.length; i += 2) {
    const mx = (rd.p[i] + rd.p[i - 2]) / 2, mz = (rd.p[i + 1] + rd.p[i - 1]) / 2;
    for (const q of cells.get(Math.floor(mx / 8) * 100000 + Math.floor(mz / 8)) ?? []) if (Math.hypot(D[q * 8] - mx, D[q * 8 + 2] - mz) < 0.45) onWalk++;
  }
  ok(onWalk === 0, `no shrub on a footway's centre line (${onWalk})`);
  // the same result in steps
  const job = shrubSteps({ map, ground, footprints, occ, clear: hole }); let steps = 0, res, longest = 0;
  for (;;) { const a = performance.now(), q = job.next(); longest = Math.max(longest, performance.now() - a); if (q.done) { res = q.value; break; } steps++; }
  ok(steps > 50 && res.data.length === D.length && res.data.every((v, i) => v === D[i]), `shrubSteps yields (${steps} times) and gives the same shrubs`);
  ok(longest < 16, `no step of the shrub job is longer than a frame (${longest.toFixed(1)} ms)`);
  // lawns enclosed by paving (the holes of map.walks polygons) can be planted: the paving mask keeps its holes
  {
    const inRing = (F, x, z) => { let c = false; for (let n = F.length >> 1, k = 0, q = n - 1; k < n; q = k++) { const az = F[2 * q + 1], bz = F[2 * k + 1]; if ((az <= z) !== (bz <= z) && x < F[2 * q] + (F[2 * k] - F[2 * q]) * (z - az) / (bz - az)) c = !c; } return c; };
    const cells = new Map(); for (let i = 0; i < N; i++) { const key = Math.floor(D[i * 8] / 16) * 100000 + Math.floor(D[i * 8 + 2] / 16); (cells.get(key) ?? cells.set(key, []).get(key)).push(i); }
    let inHoles = 0, onPaving = 0;
    for (const rings of map.walks) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; const F = rings[0];
      for (let k = 0; k < F.length; k += 2) { x0 = Math.min(x0, F[k]); x1 = Math.max(x1, F[k]); z0 = Math.min(z0, F[k + 1]); z1 = Math.max(z1, F[k + 1]); }
      if (x1 - x0 > 600 || z1 - z0 > 600) continue;
      for (let i = Math.floor(x0 / 16); i <= Math.floor(x1 / 16); i++) for (let j = Math.floor(z0 / 16); j <= Math.floor(z1 / 16); j++) for (const q of cells.get(i * 100000 + j) ?? []) {
        const x = D[q * 8], z = D[q * 8 + 2];
        if (!inRing(F, x, z)) continue;
        if (rings.slice(1).some((H) => inRing(H, x, z))) inHoles++; else if (inRing(F, Math.floor(x) + 0.5, Math.floor(z) + 0.5) && !rings.slice(1).some((H) => inRing(H, Math.floor(x) + 0.5, Math.floor(z) + 0.5))) onPaving++;
      }
    }
    ok(inHoles > 50 && onPaving === 0, `shrubs grow in the lawns paving encloses, none on the paving (${inHoles} in holes, ${onPaving} on paving)`);
  }

  // nothing touches a fence or a street prop or blocks a gate, once the layout knows of them
  {
    const F = parseFences(JSON.parse(fs.readFileSync(dir + 'map_fences.json'))), log = console.log;
    console.log = () => {};
    const street = buildStreet({ scene: new THREE.Group(), data: JSON.parse(fs.readFileSync(dir + 'map_street.json')), map, heightAt: hf.heightAt, ground, solids: createCollisionWorld({ terrain: hf.heightAt }), occ, spots: [], clear: [], detailMat: new THREE.MeshStandardMaterial() });
    console.log = log;
    const props = street.props(), O = obstacleIndex({ fences: F, props }), noHedge = obstacleIndex({ fences: F, props, skipKinds: ['hedge'] });
    const count = (q) => { const c = [0, 0, 0, 0]; for (let i = 0; i < q.length; i += 8) c[O.hit(q[i], q[i + 2], q[i + 4] * FOOT[q[i + 6]])]++; return c; };
    const was = count(D), t1 = performance.now(), fit = shrubSpots({ map, ground, footprints, occ, clear: hole, obstacles: () => ({ fences: F, props }) }), now = count(fit.data);
    ok(was[1] > 1000 && was[2] > 500 && was[3] > 50, `without the fences and props: ${was[1]} shrubs touch a fence, ${was[2]} stand in a gate's mouth, ${was[3]} touch a street prop`);
    ok(now[1] + now[2] + now[3] === 0 && fit.stats.total > 0.94 * N, `with them: none (${fit.stats.moved} moved, ${fit.stats.dropped} left out, ${fit.stats.total} of ${N} shrubs, ${Math.round(performance.now() - t1)} ms)`);
    let high = 0; const E = fit.data;
    for (let i = 0; i < E.length; i += 8) { const e = E[i + 4] * 0.35; if (E[i + 1] > Math.min(hf.heightAt(E[i], E[i + 2]), hf.heightAt(E[i] + e, E[i + 2]), hf.heightAt(E[i] - e, E[i + 2]), hf.heightAt(E[i], E[i + 2] + e), hf.heightAt(E[i], E[i + 2] - e)) - 0.01) high++; }
    ok(high === 0, `every shrub is set into the lowest ground under it (${high} are not)`);
    // the hedge blocks stand on the fences' hedge lines, and off everything else
    let bad = 0, onLine = 0; const all = hedgeRows({ ground, occ });
    for (const s of all) {
      const L = s.s3[0], hw = s.s3[2] / 2, cs = Math.cos(s.ry), sn = -Math.sin(s.ry); let k = 0;
      for (let u = -L / 2 + hw; u <= L / 2 - hw + 1e-6 && !k; u += 0.4) k = noHedge.hit(s.x + cs * u, s.z + sn * u, hw);
      if (k) bad++;
      if (O.hit(s.x, s.z, 0.2) === 1) onLine++;
    }
    ok(bad === 0 && onLine > 0.95 * all.length, `hedge blocks: ${all.length}, ${onLine} on a fence's hedge line, ${bad} touching another fence, a gate's mouth or a prop`);
  }

  // hedges
  const rows = hedgeRows({ ground, occ, clear: hole });
  ok(HEDGES.length >= 40 && rows.length > 200 && rows.every((s) => s.kind === 'hedge' && Number.isFinite(s.x) && Number.isFinite(s.z)), `OSM hedges become hedge blocks (${HEDGES.length} ways, ${rows.length} blocks)`);
  // a site that clears half of the hedges' ground takes those blocks only
  const mx = rows.map((s) => s.x).sort((a, b) => a - b)[rows.length >> 1], half = hedgeRows({ ground, occ, clear: (x) => x < mx });
  ok(half.length > rows.length * 0.3 && half.length < rows.length * 0.7 && half.every((s) => s.x >= mx && occ.get(s.x, s.z) !== 1 && !ground.onAsphalt(s.x, s.z)), `hedge blocks are cleared one by one (${half.length} of ${rows.length} left)`);
}

console.log(fails ? `${fails} of ${n} FAILED` : `all ${n} passed`);
process.exit(fails ? 1 : 0);
