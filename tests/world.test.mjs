// Headless checks of the Cherkasy world modules on the real map data (node tests/world.test.mjs; no framework).
// city.js itself needs a browser (import.meta.glob, WebGL): demos/world.html is its check.
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { ringPts, area2, areaOf, inPoly, hull, convexParts, obb, BitRaster, rng, hash01, triangulate, packGeometry, unpackGeometry } from '../src/world/cherkasy/geo.js';
import { createHeightField, heightFieldFrom, buildGroundData, buildGround, GY } from '../src/world/cherkasy/ground.js';
import { buildBuildings } from '../src/world/cherkasy/buildings.js';
import { treeSpots, footprintRaster } from '../src/world/cherkasy/greenery.js';
import { createTreeBreaker } from '../src/world/cherkasy/treebreak.js';
import { dressCar, routeWeight } from '../src/world/cherkasy/traffic.js';
import { buildTrees } from '../src/world/trees.js';
import { createCollisionWorld } from '../src/world/collision.js';
import { buildLaneNetwork } from '../src/npc/lanes.js';
import { VTYPES } from '../src/npc/vehicles.js';
import { createCityTextures } from '../src/kit/textures.js';

let fails = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fails++; console.log('FAIL', msg); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const dir = fileURLToPath(new URL('../public/assets/cherkasy/', import.meta.url));
const map = JSON.parse(fs.readFileSync(dir + 'map.json'));
map.buildings = JSON.parse(fs.readFileSync(dir + 'map_buildings.json'));
const buf = fs.readFileSync(dir + 'dem.bin'), dem = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);

// ---- geo
{
  const sq = ringPts([0, 0, 10, 0, 10, 10, 0, 10]);
  ok(area2(sq) === 200 && areaOf(sq) === 100, 'area of a square');
  ok(inPoly(sq, 5, 5) && !inPoly(sq, 11, 5) && !inPoly(sq, -1, 5), 'inPoly');
  const L = ringPts([0, 0, 10, 0, 10, 4, 4, 4, 4, 10, 0, 10]);
  const parts = convexParts(L);
  ok(parts.length >= 2 && Math.abs(parts.reduce((s, p) => s + areaOf(p), 0) - areaOf(L)) < 1e-6 && parts.every((p) => area2(p) > 0), 'convexParts cover an L, positive');
  const h = hull([...L, [5, 5], [2, 3]]);
  ok(area2(h) > 0 && h.length === 5, 'hull of the L is a positive pentagon');
  const o = obb(ringPts([0, 0, 20, 0, 20, 6, 0, 6]));
  ok(o && near(o.L, 20, 1e-6) && near(o.W, 6, 1e-6) && near(o.cx, 10) && near(o.cz, 3), 'obb of a rectangle');
  const R = new BitRaster(0, 0, 10, 10, 1);
  R.tri(0, 0, 10, 0, 0, 10);
  let set = 0; for (let x = 0.5; x < 10; x++) for (let z = 0.5; z < 10; z++) set += R.get(x, z);
  ok(set === 55 && R.get(-1, 0) === -1, `BitRaster: cell centres inside or on the triangle (${set})`); // 45 inside + 10 on the hypotenuse
  const a = rng(5), b = rng(5), s = Array.from({ length: 1000 }, a);
  ok(s.every((v, i) => v >= 0 && v < 1 && v === b()) && Math.abs(s.reduce((p, q) => p + q, 0) / 1000 - 0.5) < 0.05, 'rng deterministic, uniform-ish');
  ok([1, 2, 3, 99999].every((k) => hash01(k) >= 0 && hash01(k) < 1) && hash01(1) !== hash01(2), 'hash01');
  const t = triangulate(sq, [ringPts([4, 4, 6, 4, 6, 6, 4, 6])]);
  ok(t.pts.length === 8 && t.tris.length === 8, 'triangulate with a hole');
  const g = new THREE.BoxGeometry(1, 2, 3), back = unpackGeometry(packGeometry(g));
  ok(back.attributes.position.count === g.attributes.position.count && back.index.count === g.index.count, 'geometry pack / unpack');
}

// ---- height field
const hf = createHeightField(map, dem);
{
  const copy = heightFieldFrom(hf.data);
  ok([[0, 0], [-1500, 2000], [700, -600]].every(([x, z]) => copy.heightAt(x, z) === hf.heightAt(x, z)), 'heightFieldFrom matches');
  ok(Number.isFinite(hf.heightAt(-1e5, 1e5)) && hf.heightAt(-1e5, 1e5) >= GY.WATER, 'far outside the DEM: finite land');
  const site = ringPts([100, 100, 140, 100, 140, 140, 100, 140]);
  const lv = hf.pad(site, 30);
  ok(Math.abs(hf.heightAt(120, 120) - lv) < 1e-3, 'pad levels the site');
}

// ---- ground: the three worker parts add up to the whole build
let whole = null;
{
  const t0 = performance.now();
  whole = buildGroundData({ map, hf });
  const ms = performance.now() - t0;
  const parts = ['land', 'roads', 'cover'].map((p) => buildGroundData({ map, hf, parts: [p] }));
  ok(parts.reduce((s, p) => s + p.stats.tris, 0) === whole.stats.tris, 'ground parts add up');
  ok(whole.stats.tris > 1e6 && whole.stats.kerbs > 1e4 && whole.wetSegs.length > 500 && whole.markings.index.count > 3e4, `ground sizes (${JSON.stringify(whole.stats)})`);
  const g = buildGround({ scene: new THREE.Group(), T: createCityTextures({ size: 32 }), map, hf });
  ok(g.isWater(1500, 0) && !g.isWater(-800, 800), 'water: river / centre');
  const R = map.asphalt[0][0];
  let onA = 0, tot = 0;
  for (const rd of map.roads.filter((r) => r.k === 'm' && r.c === 'primary').slice(0, 50)) { tot++; if (g.onAsphalt(rd.p[2] * 0.5 + rd.p[0] * 0.5, rd.p[3] * 0.5 + rd.p[1] * 0.5)) onA++; }
  ok(onA / tot > 0.8, `primary road centrelines on asphalt (${onA}/${tot})`);
  ok(g.shoreDist(1500, 0) === 0 && g.shoreDist(-2500, 2500) > 500, 'shore distance');
  ok(near(g.terrainHeight(-800, 800) - hf.heightAt(-800, 800), g.onAsphalt(-800, 800) ? GY.ROAD : GY.LAND, 1e-9), 'terrainHeight layers');
  console.log(`ground ${Math.round(ms)} ms, ${whole.stats.tris} tris; R ${R.length / 2} pts`);
}

// ---- buildings (a patch around Soborna square, legacy sync call) into a collision world
{
  const cw = createCollisionWorld({ terrain: hf.heightAt });
  const edges = [];
  const patch = { buildings: map.buildings.filter((b) => Math.hypot(b.p[0] + 150, b.p[1] - 150) < 400) };
  const B = buildBuildings({ map: patch, solids: cw, zips: { edge: (...a) => edges.push(a) }, heightAt: hf.heightAt });
  ok(B.footprints.length > 100 && cw.count > B.footprints.length && edges.length > 100, `buildings patch (${B.footprints.length} footprints, ${cw.count} solids, ${edges.length} edges)`);
  const f = B.footprints.find((q) => q.kind === 'apt' && q.h > 12);
  const c = f.poly.reduce((s, p) => [s[0] + p[0] / f.poly.length, s[1] + p[1] / f.poly.length], [0, 0]);
  if (inPoly(f.poly, c[0], c[1])) ok(cw.groundHeight(c[0], c[1], 1e4) > hf.heightAt(c[0], c[1]) + 10, 'roof is a support above the ground');
  // a car-sized box pushed into a wall is moved back out
  const bb = B.boxes.find((q) => q.max[1] - q.min[1] > 12);
  const box = { x: (bb.min[0] + bb.max[0]) / 2, y: bb.min[1] + 1, z: bb.min[2] + 0.5, yaw: 0, hl: 2.85, hw: 1, h: 2, step: 0.4 };
  const hit = cw.pushBox(box, {});
  ok(hit && hit.hit, 'pushBox against a building wall');
}

// ---- greenery + trees + tree breaking
{
  const ground = { heightAt: hf.heightAt, onAsphalt: (x, z) => whole.asph.get(x, z) === 1, isWater: (x, z) => { const w = whole.wat.get(x, z); return w >= 0 ? w === 1 : whole.land.get(x, z) === 0; } };
  const footprints = map.buildings.slice(0, 20000).map((b) => ({ poly: ringPts(b.p), kind: b.k }));
  const occ = footprintRaster(footprints, map.region);
  const t0 = performance.now();
  const spots = treeSpots({ map, ground, footprints, occ, clear: [(x, z) => Math.hypot(x, z) < 50] });
  const ms = performance.now() - t0;
  ok(spots.length > 50000, `tree spots (${spots.length}, ${Math.round(ms)} ms)`);
  ok(spots.every((s) => !ground.onAsphalt(s.x, s.z) && occ.get(s.x, s.z) !== 1 && Math.hypot(s.x, s.z) >= 50), 'no tree on asphalt / buildings / cleared');
  const few = spots.filter((s) => Math.hypot(s.x - 300, s.z - 300) < 150);
  const trees = buildTrees({ scene: new THREE.Group(), spots: few, heightAt: hf.heightAt });
  const cw = createCollisionWorld({ terrain: hf.heightAt }), trunks = new Map();
  trees.addSolids((c) => trunks.set(c.item, cw.cyl(c.x, c.z, c.y0, c.y1, c.r, c.r, 'tree')));
  const brk = createTreeBreaker({ scene: new THREE.Group(), trees, collision: cw, trunks, debris: null });
  const it = trees.items.find((i) => !i.hedge);
  const probe = () => cw.pushCylinder({ x: it.x + 0.05, y: it.y + 0.5, z: it.z }, 0.5, 1.5, 0, {});
  ok(probe()?.hit, 'trunk is solid');
  const slow = brk.hit({ x: it.x - 2.5, y: it.y, z: it.z, fx: 1, fz: 0, hl: 2.85, hw: 1, v: { x: 4, y: 0, z: 0 } });
  const fast = brk.hit({ x: it.x - 2.5, y: it.y, z: it.z, fx: 1, fz: 0, hl: 2.85, hw: 1, v: { x: 20, y: 0, z: 0 } });
  ok(slow.n === 0 && fast.n >= 1 && fast.keep < 1, 'slow bump keeps the tree, a fast ram snaps it');
  ok(!probe()?.hit, 'snapped trunk no longer collides');
  for (let i = 0; i < 200; i++) brk.update(1 / 60);
  ok(it.rx > 1.3 && brk.stats().falling === 0, `tree toppled (rx ${it.rx.toFixed(2)})`);
}

// ---- traffic: the Cherkasy mix on the real lane network
{
  const net = buildLaneNetwork(map, hf.heightAt);
  ok(net.links.length > 3000 && net.signals.length > 50, `lane network (${net.links.length} links, ${net.signals.length} signals)`);
  const r = rng(3), counts = {};
  let badRoute = 0;
  for (const L of net.links.slice(0, 3000)) {
    const c = { rng: r };
    dressCar(c, L);
    counts[c.type] = (counts[c.type] || 0) + 1;
    if (!VTYPES[c.type] || !(c.len > 3) || !(c.v0 > 5) || !Array.isArray(c.color)) { ok(false, 'dressCar record ' + JSON.stringify(c)); break; }
    const mv = L.out[0];
    if (mv && !(routeWeight(c, L, mv) > 0)) badRoute++;
  }
  ok(badRoute === 0, 'route weights positive');
  ok(Object.keys(counts).length >= 8, `vehicle mix (${JSON.stringify(counts)})`);
}

console.log(`${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
