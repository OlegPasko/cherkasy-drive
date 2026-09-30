// Headless checks for the kit + buildings area: node tests/buildings.test.mjs
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { MeshBuilder, M4, hexLin, rotZ } from '../src/kit/mesh.js';
import { batchTiles, splitTiles, mergeGeometries } from '../src/kit/batch.js';
import { createInstancePool } from '../src/kit/instances.js';
import { createCityTextures, WALL_LAYERS } from '../src/kit/textures.js';
import { FacadeBuilder, STYLE, LAYER, createFacadeMaterial } from '../src/world/facade.js';
import { buildBuildings, convexPieces, minRect, archetype, DP, createDetailMaterial } from '../src/world/buildings.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

// every triangle's winding must agree with its vertex normals (front faces point where the normals point)
function windingErrors(g) {
  const P = g.attributes.position, N = g.attributes.normal, I = g.index.array, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  let bad = 0;
  for (let t = 0; t < I.length; t += 3) {
    a.fromBufferAttribute(P, I[t]); b.fromBufferAttribute(P, I[t + 1]); c.fromBufferAttribute(P, I[t + 2]);
    const f = b.clone().sub(a).cross(c.clone().sub(a));
    if (f.lengthSq() < 1e-6) continue; // slivers from collinear footprint points
    n.set(0, 0, 0); for (const k of [I[t], I[t + 1], I[t + 2]]) n.add(new THREE.Vector3().fromBufferAttribute(N, k));
    if (f.dot(n) <= 0) bad++;
  }
  return bad;
}

// ---- MeshBuilder
{
  const b = new MeshBuilder();
  b.setColor(0x808080).setPart(DP.STEEL).box(0, 0, 0, 1, 2, 3).boxC(5, 1, 0, 2, 2, 2);
  b.with(M4(10, 0, 0, 0.7), (d) => d.cyl(0, 0, 0, 1, 0.4, 3, 10).with(rotZ(0.3), (e) => e.box(-1, 0, -1, 1, 0.2, 1)));
  b.tube([0, 0, 0], [2, 3, 1], 0.1, 6, true).lathe([[1, 0], [1.2, 1], [0.6, 2], [0, 2.5]], 12, 20, 0).lathe([[0.5, 0], [0.8, 1], [0, 1.6]], 10, 25, 3, 1.6, 0.6).ellipsoid([0, 8, 0], [1, 2, 0.5]);
  b.fill([[0, 0], [8, 0], [8, 8], [0, 8]], [[[2, 2], [2, 4], [4, 4], [4, 2]]], 10).extrude([[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]], [], 0, 4, { bottom: true });
  b.face([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], [0, 0, -1]);
  const v0 = b.v;
  const m = new MeshBuilder().setColor([0.1, 0.2, 0.3]).box(0, 0, 0, 1, 1, 1);
  b.merge(m);
  ok(b.v === v0 + m.v && b.n === b.v, 'merge adds the vertex count');
  const g = b.build({ part: true });
  ok(g.attributes.part && g.attributes.part.array[0] === DP.STEEL, 'part attribute present');
  ok(g.attributes.color && g.attributes.uv, 'color + uv attributes');
  ok(windingErrors(g) === 0, `MeshBuilder winding matches normals (${windingErrors(g)} bad)`);
  ok(!new MeshBuilder().box(0, 0, 0, 1, 1, 1).build().attributes.part, 'no part attribute unless asked');
  const lin = hexLin('#808080');
  ok(Math.abs(lin[0] - 0.2158) < 1e-3, 'hexLin sRGB -> linear');
  const p = new THREE.Vector3(1, 0, 0).applyMatrix4(M4(0, 0, 0, Math.PI / 2));
  ok(Math.abs(p.x) < 1e-6 && Math.abs(p.z + 1) < 1e-6, 'M4: local +x -> (cos ry, 0, -sin ry)');
}

// ---- FacadeBuilder
{
  const F = new FacadeBuilder();
  const p = { floorH: 3, bayW: 3, layer: LAYER.CONCRETE, seed: 7, tint: [1, 1, 1] };
  const R = [[0, 0], [20, 0], [20, 12], [0, 12]]; // positive map area
  for (let i = 0; i < 4; i++) { const [ax, az] = R[i], [bx, bz] = R[(i + 1) % 4]; F.wall(ax, az, bx, bz, 0, 15, p, STYLE.PUNCHED, i ? -3.6 : 4); }
  F.box(30, 0, 0, 40, 9, 8, p, { all: { style: STYLE.RIBBON }, pz: { style: STYLE.CURTAIN } }, true);
  F.quad([50, 0, 0], [0, 0, 1], 10, 0, 6, [1, 0, 0], p, STYLE.PUNCHED);
  F.poly([[60, 5, 0], [70, 5, 0], [65, 8, 0]], [0, 0, 1], p);
  F.fill(R, [], 15, { layer: LAYER.ROOF_MEMBRANE });
  const g = F.build();
  ok(windingErrors(g) === 0, 'FacadeBuilder winding matches normals');
  const N = g.attributes.normal;
  ok(N.normalized && N.array instanceof Int8Array, 'packed int8 normals');
  // outward: wall a->b = (0,0)->(20,0) faces -z
  ok(N.getZ(0) < 0, 'ring wall faces outward');
  ok(new FacadeBuilder().build() === null, 'empty facade builder builds null');
  const mat = createFacadeMaterial(createCityTextures({ size: 32 }));
  ok(mat.customProgramCacheKey() === 'city-facade-v1' && createDetailMaterial().customProgramCacheKey() === 'city-detail-v1', 'materials have own program keys');
  let chained = 0; mat.onBeforeCompile = () => { chained++; };
  const fake = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <emissivemap_fragment>' };
  mat.onBeforeCompile(fake);
  ok(chained === 1 && fake.fragmentShader.includes('roomLook') && fake.uniforms.nightFactor, 'onBeforeCompile survives reassignment (CSM) and patches the shader');
}

// ---- textures
{
  const T = createCityTextures({ size: 64 });
  ok(T.wallLayers.image.depth === WALL_LAYERS.length && T.layerScale.length === WALL_LAYERS.length, 'wall layer array texture');
  ok(['asphalt', 'pavement', 'grass', 'plaster', 'brick', 'roof', 'glass', 'noise'].every((k) => T[k]?.isTexture), 'city texture bundle');
  ok(createCityTextures({ size: 64 }) === T, 'texture bundle is cached');
}

// ---- geometry helpers
{
  const L = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
  const pcs = convexPieces(L);
  const area = pcs.reduce((s, P) => { let a = 0; P.forEach((p, i) => { const q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; }); return s + a / 2; }, 0);
  ok(pcs.length === 2 && Math.abs(area - 64) < 1e-6, `L-shape -> 2 convex pieces covering its area (${pcs.length}, ${area})`);
  const hole = convexPieces([[0, 0], [10, 0], [10, 10], [0, 10]], [[[3, 3], [3, 7], [7, 7], [7, 3]]]);
  ok(hole.length >= 4, 'courtyard square splits around the hole');
  const r = minRect([[0, 0], [10, 10], [8, 12], [-2, 2]]);
  ok(Math.abs(r.L - Math.hypot(10, 10)) < 1e-6 && Math.abs(r.W - Math.hypot(2, 2)) < 1e-6, 'minRect of a rotated rectangle');
}

// ---- batching + instances
{
  const gs = [0, 1, 2, 3].map((i) => new MeshBuilder().box(i * 256, 0, 0, i * 256 + 10, 10, 10).build());
  const bt = batchTiles([gs[0], null, gs[1], gs[2], gs[3]], new THREE.MeshBasicMaterial(), 't', { group: 2, release: false }, [[128, 128], [384, 128], [384, 128], [640, 128], [896, 128]]);
  ok(bt.meshes.length === 2 && bt.meshOf[1] === -1, 'group 2 merges tile pairs, missing tiles allowed');
  bt.setVisible(2, false); ok(bt.meshes[bt.meshOf[2]].visible === true, 'merged mesh stays visible while one tile is on');
  bt.setVisible(0, false); ok(bt.meshes[bt.meshOf[0]].visible === false, 'merged mesh hides when all its tiles are off');
  bt.setShadow(3, false); bt.setShadow(4, false); ok(bt.meshes[bt.meshOf[4]].castShadow === false, 'per-tile shadow switch');
  const big = mergeGeometries([new MeshBuilder().box(0, 0, 0, 1, 1, 1).build(), new MeshBuilder().box(300, 0, 0, 301, 1, 1).build()]);
  const parts = splitTiles(big, 256);
  ok(parts.length === 2 && parts.every((p) => p.geometry.index.count === 36), 'splitTiles cuts by tile');
  const pool = createInstancePool({ lods: [{ geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial(), dist: 50 }, { geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial(), dist: 200 }], colors: true });
  for (let i = 0; i < 30; i++) pool.add(i * 10, 0, 0, 0, 1, [1, 0, 0]);
  pool.update(new THREE.Vector3(0, 0, 0));
  ok(pool.drawn[0] === 5 && pool.drawn[1] === 15, `LOD bins (${pool.drawn})`);
  pool.update(new THREE.Vector3(1, 0, 0)); pool.remove(0); pool.refresh(); pool.update(new THREE.Vector3(0, 0, 0));
  ok(pool.drawn[0] === 4 && pool.count === 29, 'forced refresh after a removal');
}

// ---- buildings on the real map
{
  const buildings = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
  const sample = buildings.filter((b, i) => i % 7 === 0 || b.parts || b.holes || b.h);
  const counts = { box: 0, prism: 0, cyl: 0 }, bad = [];
  let anchors = 0, dressed = 0;
  const heightAt = (x, z) => 3 * Math.sin(x / 200) + 2 * Math.cos(z / 170);
  const skipId = sample[3].id;
  const solids = (s) => {
    counts[s.type]++;
    if (s.type === 'prism') {
      let a = 0; for (let i = 0; i < s.poly.length; i += 2) { const j = (i + 2) % s.poly.length; a += s.poly[i] * s.poly[j + 1] - s.poly[j] * s.poly[i + 1]; }
      if (!(a > 0) || !(s.y1 > s.y0) || s.poly.some((v) => !Number.isFinite(v))) bad.push(s);
    }
    if (s.type === 'box' && !(s.max[1] > s.min[1])) bad.push(s);
  };
  const t0 = Date.now();
  const B = buildBuildings({ map: { buildings: sample }, solids, zips: () => anchors++, heightAt, skip: new Set([skipId]), dress: (c) => { dressed++; if (!c.t.fac || !c.t.det || !c.A.floorH) throw new Error('bad dress context'); } });
  console.log(`     ${sample.length} buildings in ${Date.now() - t0} ms`, JSON.stringify(counts), 'anchors', anchors);
  ok(B.stats.invalid === 0, 'no invalid buildings');
  ok(B.stats.skipped === 1 && !B.footprints.some((f) => f.id === skipId), 'skip set respected');
  ok(bad.length === 0, `collision solids well-formed (${bad.length} bad)`);
  ok(B.footprints.length === B.stats.buildings && B.boxes.length === B.stats.buildings, 'one footprint + box per building');
  ok(B.boxes.every((b) => b.min.isVector3 && b.max.y > b.min.y), 'boxes are Vector3 min/max');
  ok(dressed > 0 && B.stats.dressErrors === 0, 'dress hook called with tile builders');
  ok(B.landmarks.length > 0, `named landmarks (${B.landmarks.length})`);
  let fv = 0, wind = 0, nanTiles = 0;
  for (const t of B.tiles.values()) {
    const g = t.fac.build();
    if (g) { fv += g.attributes.position.count; wind += windingErrors(g); if (g.attributes.position.array.some((v) => !Number.isFinite(v))) nanTiles++; }
    if (t.det.v) wind += windingErrors(t.det.build({ part: true }));
  }
  ok(nanTiles === 0 && fv > 0, 'facade tiles finite');
  ok(wind === 0, `building winding matches normals (${wind} bad)`);
  // determinism: same input -> same styles and heights
  const B2 = buildBuildings({ map: { buildings: sample }, heightAt, skip: new Set([skipId]) });
  ok(B2.boxes.every((b, i) => b.max.y === B.boxes[i].max.y), 'deterministic rebuild');
  const r1 = archetype({ k: 'apt', lv: 9 }, (() => { let s = 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })());
  ok(r1.machine && r1.resid === 1, 'nine-storey slab archetype');
  // malformed input does not stop the build
  const B3 = buildBuildings({ map: { buildings: [{ id: 1, p: [0, 0, 1, 1], k: 'house', lv: 1 }, { id: 2, p: [0, 0, NaN, 5, 10, 10, 10, 0], k: 'apt', lv: 5 }, { id: 3, p: [0, 0, 20, 0, 20, 20, 0, 20], k: 'apt', lv: 9 }] } });
  ok(B3.stats.buildings === 2 && B3.stats.invalid === 1, 'short / NaN polygons skipped, the rest built');
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
