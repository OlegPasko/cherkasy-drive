// Headless checks for world/trees.js and world/water.js: node tests/nature.test.mjs
import * as THREE from 'three';
import { buildTrees, TREE_PALETTES, PARK_GREENS, PARK_PINE, PAL, hedgeSpots } from '../src/world/trees.js';
import { buildWater, buildWetBands, buildPonds, obliqueNear, WATER_Y } from '../src/world/water.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const now = () => performance.now();

// ---- palettes
ok(PARK_GREENS.length >= 3 && PARK_PINE.length >= 1 && PAL.length >= 3, 'palette exports');
ok([...PARK_GREENS, ...PARK_PINE, ...PAL].every(e => e.length === 2 && e.every(c => c.length === 3 && c.every(v => v >= 0 && v < 1))), 'palette entries are [A, B] linear rgb pairs');
ok(TREE_PALETTES.broadleaf === PARK_GREENS && TREE_PALETTES.evergreen === PARK_PINE, 'TREE_PALETTES aliases');

// ---- legacy-shaped spots
const blue = [PARK_PINE[0].map(c => c.map((v, i) => v * [0.8, 0.95, 1.25][i]))];
const spots = [
  { x: 0, z: 0, y: 1, kind: 'street', sc: 1.2, pal: PARK_GREENS },
  { x: 10, z: 0, y: 1, kind: 'park', sc: 1, pal: [PAL[1]] },
  { x: 20, z: 0, y: 1, kind: 'elm', sc: 1.1, pal: PARK_GREENS },
  { x: 30, z: 0, y: 1, kind: 'small', sc: 0.45, pal: PARK_GREENS },
  { x: 40, z: 0, y: 1, kind: 'conifer', sc: 0.6, pal: blue, s3: [0.8, 1.15, 0.8] },
  { x: 50, z: 0, y: 1, kind: 'conifer', sc: 1.3, pal: PARK_GREENS, s3: [0.42, 1.9, 0.42] }, // poplar
  { x: 60, z: 0, y: 1, kind: 'conifer', sc: 0.48, pal: PARK_PINE, s3: [0.34, 1.25, 0.34] }, // thuja
  { x: 70, z: 0, y: 1, kind: 'baobab', sc: 1 },                                              // unknown kind
  { x: NaN, z: 0, kind: 'street' }, null, { x: 5, z: Infinity },                             // invalid
  ...hedgeSpots(0, 10, 12, 10, { y: 1 }),
];
for (let i = 0; i < 400; i++) spots.push({ x: 200 + (i % 20) * 7, z: (i / 20 | 0) * 7, y: 0, kind: ['street', 'park', 'elm', 'small', 'conifer'][i % 5], sc: 1 });
for (let i = 0; i < 300; i++) spots.push({ x: 800 + (i % 20) * 7, z: (i / 20 | 0) * 7, y: 0, kind: 'park', sc: 1 });
const scene = new THREE.Group();
const trees = buildTrees({ scene, T: {}, spots, parkPaths: [], noPark: true, maxScale: 3 });
ok(trees.street.length && trees.park.length && trees.elm.length && trees.small.length && trees.conifer.length && trees.hedge.length, 'all kind arrays filled');
ok(trees.stats().skipped === 3, 'invalid spots skipped (3)');
ok(trees.street.some(it => it._x === 70), 'unknown kind degrades to street');
const byX = (x) => trees.items.find(it => it.x === x && it.z === 0);
ok(byX(40).variant === 'spruce' && byX(50).variant === 'poplar' && byX(60).variant === 'spruce', `conifer variants: blue spruce / poplar / thuja -> ${byX(40).variant} ${byX(50).variant} ${byX(60).variant}`);
ok(byX(30).variant === 'sapling' && byX(30).s === 0.45, 'small sapling keeps sub-metre scale');
ok(byX(40).scale3.join() === '0.8,1.15,0.8', 'scale3 kept');
ok(trees.hedge.every(it => it.hedge) && trees.street.every(it => !it.hedge), 'hedge flag');
const it0 = byX(10);
ok(Math.abs(it0.extra.aTintA[1] - PAL[1][0][1]) / PAL[1][0][1] < 0.1, 'caller palette respected with mild variation');
ok(it0.extra.aBark.length === 4, 'aBark [id, r, g, b]');
for (const k of ['street', 'park', 'elm', 'small', 'conifer']) ok(trees.pools.filter(p => p.items === trees[k]).length === 1, `pool handle for ${k} (items identity)`);

// ---- LOD repack
const cam = new THREE.Vector3(0, 2, -5);
trees.update(1 / 60, cam);
let st = trees.stats();
ok(st.near > 0 && st.mid > 0 && st.far > 0, `LOD split near ${st.near} mid ${st.mid} far ${st.far}, ${st.drawCalls} draw calls`);
const r0 = st.repacks;
trees.update(1 / 60, cam); trees.update(1 / 60, cam.clone().add(new THREE.Vector3(1, 0, 0)));
ok(trees.stats().repacks === r0, 'no repack while the camera is (almost) still');
trees.update(1 / 60, undefined);
ok(true, 'update without camera does not throw');

// ---- live pose -> pool.update(camPos, true) re-poses the tree in its LOD pool
const tip = byX(0), pool = trees.pools.find(p => p.items === trees.street);
const nearMesh = trees.group.children.find(m => m.name === `trees ${tip.variant} near`);
const findRow = () => { const a = nearMesh.instanceMatrix.array; for (let i = 0; i < nearMesh.count; i++) if (Math.abs(a[i * 16 + 12] - tip.x) < 1e-4 && Math.abs(a[i * 16 + 14] - tip.z) < 1e-4) return a.slice(i * 16, i * 16 + 16); return null; };
const before = findRow();
tip.ry = 0.3; tip.rx = 1.2; tip.y += 0.6;
pool.update(cam, true);
const after = findRow();
ok(before && after && Math.abs(after[13] - before[13] - 0.6) < 1e-4, 'tipped tree moved in the near pool');
const up = new THREE.Vector3(0, 1, 0).applyMatrix4(new THREE.Matrix4().fromArray(after).setPosition(0, 0, 0)).normalize();
ok(up.y < 0.4 && Math.abs(Math.atan2(up.x, up.z) - 0.3) < 0.05, `rx tips the top toward (sin ry, cos ry): up ${up.toArray().map(v => v.toFixed(2))}`);

// ---- collision + blockers
const cyl = []; const n = trees.addSolids((c) => cyl.push(c));
ok(n === trees.items.length - trees.hedge.length && cyl.every(c => c.r >= 0.08 && c.r <= 0.6 && c.y1 > c.y0 + 1), `addSolids: ${n} trunks, radii ${Math.min(...cyl.map(c => c.r)).toFixed(2)}..${Math.max(...cyl.map(c => c.r)).toFixed(2)}`);
let calls = 0; trees.addSolids({ cylinder: () => calls++ }); ok(calls === n, 'addSolids object sink');
const nb = trees.blockers().length; tip.broken = true; ok(trees.blockers().length === nb - 1, 'broken tree leaves the blockers');

// ---- determinism
const t2 = buildTrees({ scene: new THREE.Group(), spots, maxScale: 3 });
ok(t2.items.every((it, i) => it.ry === trees.items[i].ry || trees.items[i] === tip) && t2.items.every((it, i) => it.extra.aTintB.join() === trees.items[i].extra.aTintB.join()), 'deterministic yaw / tints');

// ---- scale: a city-sized field
const big = [], R = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(42);
for (let i = 0; i < 90000; i++) big.push({ x: (R() - 0.5) * 6000, z: (R() - 0.5) * 8000, y: 0, kind: ['street', 'park', 'elm', 'small', 'conifer'][Math.floor(R() * 5)], sc: 0.8 + R() * 0.6 });
let t0 = now(); const tb = buildTrees({ scene: new THREE.Group(), spots: big, maxScale: 3 }); const tBuild = now() - t0;
t0 = now(); tb.update(0.016, new THREE.Vector3(0, 30, 0)); const tPack = now() - t0;
t0 = now(); for (let i = 0; i < 20; i++) tb.update(0.016, new THREE.Vector3(i * 6, 30, 0)); const tMove = (now() - t0) / 20;
st = tb.stats();
ok(tBuild < 4000 && tPack < 80, `90k trees: build ${tBuild.toFixed(0)} ms, first pack ${tPack.toFixed(1)} ms, moving ${tMove.toFixed(2)} ms/frame; near ${st.near} mid ${st.mid} far ${st.far}`);

// ---- view culling: nothing in view (or in the river mirror, or shading the view) is ever left out
{
  const sc = new THREE.Scene(), field = [];
  for (let i = 0; i < 12000; i++) field.push({ x: (R() - 0.5) * 2400, z: (R() - 0.5) * 2400, y: R() * 25, kind: ['street', 'park', 'elm', 'small', 'conifer'][i % 5], sc: 0.7 + R() * 0.8, rx: i % 97 ? 0 : 1.4 });
  const tv = buildTrees({ scene: sc, spots: field, maxScale: 3 });
  const sun = new THREE.DirectionalLight(0xffffff, 1); sun.castShadow = true; sc.add(sun, sun.target);
  const cam = new THREE.PerspectiveCamera(68, 16 / 9, 0.3, 20000), v = new THREE.Vector3(), m4 = new THREE.Matrix4();
  const hb = {}; // per variant: horizontal radius, y range, 3D radius of the near / mid meshes (world = * scale)
  for (const m of tv.group.children) {
    if (m.name.includes('far')) continue;
    const a = m.geometry.attributes.position.array, B = hb[m.name.split(' ')[1]] ??= { rh: 0, y0: 0, y1: 0, r3: 0 };
    for (let o = 0; o < a.length; o += 3) { const h = Math.hypot(a[o], a[o + 2]); B.rh = Math.max(B.rh, h); B.y0 = Math.min(B.y0, a[o + 1]); B.y1 = Math.max(B.y1, a[o + 1]); B.r3 = Math.max(B.r3, Math.hypot(h, a[o + 1])); }
  }
  // an axis-aligned box is out of the frustum when all 8 corners are outside one side plane (or behind)
  const seen = (x, z, r, y0, y1, fov, mirror) => {
    const ty = Math.tan(fov * Math.PI / 360), tx = ty * cam.aspect, C = [];
    for (const dx of [-r, r]) for (const dz of [-r, r]) for (const y of [y0, y1]) { v.set(x + dx, mirror ? -3.2 - y : y, z + dz).applyMatrix4(cam.matrixWorldInverse); C.push([v.x, v.y, v.z]); }
    return ![[1, 0, tx], [-1, 0, tx], [0, 1, ty], [0, -1, ty]].some(([a, b, c]) => C.every(([px, py, pz]) => a * px + b * py + c * pz > 0)) && !C.every((q) => q[2] > 0);
  };
  const rowsOf = (m, n) => { const s = new Set(), a = m.instanceMatrix.array; for (let i = 0; i < n; i++) s.add(a[i * 16 + 12] + ',' + a[i * 16 + 14]); return s; };
  let checked = 0, missView = 0, missShadow = 0, shadowOnly = 0;
  const pose = (x, y, z, yaw, pitch, sunYaw, sunEl) => {
    sun.position.set(Math.cos(sunYaw) * Math.cos(sunEl), Math.sin(sunEl), Math.sin(sunYaw) * Math.cos(sunEl));
    cam.position.set(x, y, z); cam.lookAt(x + Math.cos(yaw) * Math.cos(pitch), y + Math.sin(pitch), z + Math.sin(yaw) * Math.cos(pitch)); cam.updateMatrixWorld();
    tv.update(1 / 60, cam.position, cam); tv.update(1 / 60, cam.position, cam); // a light that jumped widens the slack once
    const view = {}, cast = {};
    for (const m of tv.group.children) { if (!m.visible) continue; m.onBeforeShadow(); cast[m.name] = rowsOf(m, m.count); m.onBeforeRender(); view[m.name] = rowsOf(m, m.count); shadowOnly += cast[m.name].size - view[m.name].size; }
    const o = sun.position.clone().normalize(), off = [-o.x / o.y, -o.z / o.y];
    for (const it of tv.items) {
      const d = Math.hypot(it._x - x, it._y - y, it._z - z), B = hb[it.variant];
      const band = d < 80 ? 'near' : d > 75 && d < 330 ? 'mid' : null; if (!band) continue;
      const s3 = it.scale3 ?? [1, 1, 1], tip = it.rx !== 0, sm = it.s * Math.max(...s3), r = tip ? B.r3 * sm : B.rh * it.s * Math.max(s3[0], s3[2]);
      const y0 = it._y + (tip ? -B.r3 * sm : B.y0 * it.s * s3[1]), y1 = it._y + (tip ? B.r3 * sm : B.y1 * it.s * s3[1]), key = Math.fround(it._x) + ',' + Math.fround(it._z);
      const inRows = (R) => tv.group.children.some((m) => R[m.name]?.has(key) && m.name.split(' ')[1] === it.variant && (band === 'near' ? m.name.endsWith('near') : !m.name.endsWith('near')));
      if (seen(it._x, it._z, r, y0, y1, cam.fov) || (y > -1.6 && seen(it._x, it._z, r, y0, y1, Math.min(120, cam.fov * 1.15), true))) { checked++; if (!inRows(view)) missView++; continue; }
      if (band === 'mid' && d >= 150) continue; // near / mid within 160 m of the last LOD centre (<= 5 m away) cast
      // sampled shadow of the crown on receivers from its top down to 5 m under the lowest base (y >= 0 here)
      const h = y1 + 5;
      for (let t = 0; t <= 1.0001; t += 0.02) if (seen(it._x + off[0] * h * t, it._z + off[1] * h * t, r, -5, y1, cam.fov)) { if (!inRows(cast)) missShadow++; break; }
    }
  };
  for (let k = 0; k < 60; k++) pose(k * 0.9, 12, k * 0.4, k * 0.21, -0.12, 0.8 + (k / 20 | 0) * 2.1, [0.25, 0.9, 0.06][k / 20 | 0]); // steady turn
  for (let k = 0; k < 30; k++) pose(R() * 40, 3 + R() * 40, R() * 40, R() * 6.3, (R() - 0.7) * 1.4, R() * 6.3, 0.05 + R()); // snaps
  const cs = tv.stats().cull;
  ok(checked > 1000 && missView === 0, `view culling: ${checked} in-view tree checks over 90 poses, ${missView} missing (culled ${cs.culled} at the last pose)`);
  ok(missShadow === 0 && shadowOnly > 0, `shadow casters behind the camera kept while their shadow can reach the view: ${missShadow} missing, ${shadowOnly} shadow-only rows seen`);
  tv.setCulling(false); tv.update(1 / 60, cam.position, cam);
  ok(tv.stats().cull.culled === 0 && tv.stats().cull.keepNear === 180, 'setCulling(false) packs the full disc');
  // a tree moved far off its cell (live z) still shows in the far pool of the view it moved into
  const lone = buildTrees({ scene: new THREE.Scene(), spots: [{ x: 0, z: 600, y: 0, kind: 'park' }, { x: 5, z: 2000, y: 0, kind: 'park' }], maxScale: 1 });
  cam.position.set(0, 20, 0); cam.lookAt(0, 20, -1); cam.updateMatrixWorld(); lone.update(1 / 60, cam.position, cam);
  lone.items[0].z = -600; lone.update(1 / 60, cam.position, cam);
  ok(lone.stats().far === 1, `moved tree kept by the far wedge test (far rows ${lone.stats().far})`);
}

// ---- water
const wscene = new THREE.Group();
const water = buildWater({ scene: wscene, T: undefined, renderer: null, shore: false, shoreDist: undefined, skirtWater: (dx) => dx > 0.15 });
water.update(0.016); water.update(0.016, undefined);
water.update(0.016, new THREE.PerspectiveCamera(60, 1, 0.5, 30000));
ok(water.mesh && Math.abs(water.mesh.position.y - WATER_Y) < 1e-9 && water.mesh.scale.x > 20000, 'water disc on the datum, follows the camera');
ok(water.material.defines.WATER_SKIRT !== undefined && water.material.defines.WATER_PLANAR === undefined, 'no renderer -> no planar reflection, skirt on');
ok(buildWetBands({ scene: wscene, segs: [] }).mesh === null && buildWetBands({ scene: wscene }).mesh === null, 'wet bands: empty input adds nothing');
const wb = buildWetBands({ scene: wscene, segs: [{ ax: 0, az: 0, bx: 10, bz: 0, nx: 0, nz: 1 }, { ax: 10, az: 0, bx: 20, bz: 3, nx: -0.3, nz: 1 }, { ax: 5, az: 5, bx: 5, bz: 5, nx: 0, nz: 1 }, { ax: NaN }, { ax: 0, az: -10, bx: 10, bz: -10, nx: 0, nz: -1 }], isWater: (x, z) => z > 0 });
ok(wb.mesh && wb.segments === 2, `wet bands: ${wb.segments} of 5 segments used (zero-length, NaN, land-facing skipped)`);
{ // stain faces the water, top is ragged within 0.5..1.5 m, joined ends match
  const p = wb.mesh.geometry.attributes.position, nrm = wb.mesh.geometry.attributes.normal; let top = [];
  for (let i = 0; i < p.count; i++) if (p.getY(i) > WATER_Y + 0.2) top.push(p.getY(i) - WATER_Y);
  ok(Math.min(...top) >= 0.3 && Math.max(...top) <= 1.6, `stain top ${Math.min(...top).toFixed(2)}..${Math.max(...top).toFixed(2)} m above the datum`);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); let good = 0;
  for (let i = 0; i < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2); const fn = b.sub(a).cross(c.sub(a)); if (fn.x * nrm.getX(i) + fn.z * nrm.getZ(i) > 0) good++; }
  ok(good === p.count / 3, 'stain triangles face the water');
}
const pondMap = { cover: { pond: [[[0, 0, 10, 0, 10, 10, 0, 10]], [[]]] } };
const ponds = buildPonds({ scene: wscene, map: pondMap, heightAt: () => 5 });
ok(ponds.mesh && Math.abs(ponds.mesh.geometry.attributes.position.getY(0) - 5.05) < 1e-6, 'ponds at bank height + 5 cm');

// ---- oblique near plane (reversed and standard depth)
for (const rev of [false, true]) {
  const c = new THREE.PerspectiveCamera(60, 1.5, 0.3, 5000); c._reversedDepth = rev; c.updateProjectionMatrix();
  c.position.set(0, 20, 0); c.lookAt(0, 10, -100); c.updateMatrixWorld();
  const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -2).applyMatrix4(c.matrixWorldInverse); // y = 2
  const P = c.projectionMatrix.clone(); obliqueNear(P, new THREE.Vector4(pl.normal.x, pl.normal.y, pl.normal.z, pl.constant), rev);
  const ndc = (x, y, z) => { const v = new THREE.Vector4(x, y, z, 1).applyMatrix4(c.matrixWorldInverse).applyMatrix4(P); return v.z / v.w; };
  const nearZ = rev ? 1 : -1, inside = (z) => (rev ? z >= 0 && z <= 1 : z >= -1 && z <= 1);
  ok(Math.abs(ndc(0, 2, -80) - nearZ) < 1e-3 && inside(ndc(0, 4, -80)) && !inside(ndc(0, 0, -80)), `oblique clip ${rev ? 'reversed' : 'standard'} depth: plane -> near, above kept, below clipped`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
