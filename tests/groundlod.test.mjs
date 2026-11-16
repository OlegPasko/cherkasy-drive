// Headless checks of the ground's level of detail on the real map (node tests/groundlod.test.mjs; no framework):
// the unit grid, the kerb / paint chunks, the far sheets (never above the terrain, exact on the unit's border and at
// the shore, the id map agreeing with the full tiles, no land over open water), the distance pick with its
// hysteresis, only the drawn meshes left in the scene graph, a site's mesh adopted by unit, the railway cutting under
// a far sheet, and the draw-distance registry.
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { createHeightField, buildGround, unitGrid, farLayers, SURF } from '../src/world/cherkasy/ground.js';
import { FAR, farLattice, buildFarData, decodeIds } from '../src/world/cherkasy/groundfar.js';
import { createDrawDistance } from '../src/world/drawdist.js';
import { buildWetBands } from '../src/world/water.js';
import { createCityTextures } from '../src/kit/textures.js';
import { FRAME_OF } from '../src/world/cherkasy/frame.js';
import { shapeRailCut } from '../src/world/cherkasy/railcut.js';

let fails = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fails++; console.log('FAIL', msg); } };
const dir = fileURLToPath(new URL('../public/assets/cherkasy/', import.meta.url));
const map = JSON.parse(fs.readFileSync(dir + 'map.json'));
map.buildings = JSON.parse(fs.readFileSync(dir + 'map_buildings.json'));
const buf = fs.readFileSync(dir + 'dem.bin'), dem = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
const hf = createHeightField(map, dem);
const UNIT = FAR.UNIT, cell = hf.cell;

// ---- the draw-distance registry
{
  const dd = createDrawDistance(), at = (x) => { const m = new THREE.Mesh(new THREE.SphereGeometry(10)); m.position.set(x, 0, 0); m.updateMatrixWorld(); return m; };
  const a = at(0), b = at(500), c = at(500);
  dd.add(a, 'k'); dd.add(b, 'k'); dd.add(c, 'other');
  const cam = new THREE.Vector3(0, 0, 0);
  dd.update(cam);
  ok(a.visible && b.visible && c.visible, 'draw distance: nothing is hidden before a distance is set');
  dd.set({ k: 300 });
  ok(dd.update(cam) === 1 && dd.update(cam) === 0, 'draw distance: update tells how many chunks changed');
  ok(a.visible && !b.visible && c.visible, 'draw distance: a chunk past its class distance goes, another class stays');
  cam.set(185, 0, 0); dd.update(cam); // 500 - 10 - 185 = 305 m to its surface: still out
  ok(!b.visible, 'draw distance: still hidden just outside the distance');
  cam.set(195, 0, 0); dd.update(cam); // 295 m: back
  ok(b.visible, 'draw distance: back inside the distance');
  cam.set(170, 0, 0); dd.update(cam); // 320 m: inside the hysteresis band (300 * 1.08 + 8 = 332)
  ok(b.visible, 'draw distance: hysteresis keeps it on the way out');
  cam.set(150, 0, 0); dd.update(cam); // 340 m
  ok(!b.visible && dd.stats().hidden === 1, 'draw distance: gone past the band');
  dd.set({ k: Infinity }); dd.update(cam);
  ok(b.visible, 'draw distance: Infinity draws everything again');
}

// ---- the ground with its far sheets
const t0 = performance.now();
const root = new THREE.Group();
const g = buildGround({ scene: root, T: createCityTextures({ size: 32 }), map, hf, far: true });
const ms = performance.now() - t0, L = g.lod(), G = unitGrid(map, hf);
{
  ok((G.ox - hf.x0) % cell === 0 && UNIT % cell === 0 && G.i0 >= 0 && hf.x0 + (G.i1 + 1) * UNIT <= hf.x1 && hf.z0 + (G.j1 + 1) * UNIT <= hf.z1, 'units: borders on lattice lines, inside the DEM');
  ok(L.units > 80 && L.capable > 60 && L.capable <= L.units, `units: ${L.units}, ${L.capable} with a far sheet`);
  // every tile, kerb chunk and paint chunk lies in its own square (a band goes by its segment's middle, so it may
  // stick out by half a 6 m segment and the wall's own lean)
  let out = 0, tiles = 0, kerbs = 0, paint = 0, kerbTris = 0, tileTris = 0;
  for (const m of g.root.children) {
    if (!m.isMesh) continue;
    const bb = m.geometry.boundingBox ?? (m.geometry.computeBoundingBox(), m.geometry.boundingBox), key = +m.name.split(' ').pop();
    // (a fringe unit, which never turns far, is one tile under its first 512 m key)
    const whole = key < 5e7 && m.name.startsWith('ground ') && !G.fine((Math.floor(key / 4096) >> 1) * 4096 + ((key % 4096) >> 1));
    const size = m.name.startsWith('kerbs') || m.name === 'markings' ? 512 : m.name.startsWith('ground bank') ? 0 : key < 5e7 ? (whole ? UNIT : 512) : 0;
    if (m.name.startsWith('kerbs')) { kerbs++; kerbTris += m.geometry.index.count / 3; } else if (m.name === 'markings') paint++; else if (size === 512) { tiles++; tileTris += m.geometry.index.count / 3; }
    if (!size) continue;
    if (m.name === 'markings') { if (bb.max.x - bb.min.x > size + 20 || bb.max.z - bb.min.z > size + 20) out++; continue; }
    const i = Math.floor(key / 4096), j = key % 4096, x0 = G.ox + i * 512, z0 = G.oz + j * 512;
    if (bb.min.x < x0 - 5 || bb.max.x > x0 + size + 5 || bb.min.z < z0 - 5 || bb.max.z > z0 + size + 5) out++;
  }
  ok(out === 0, `chunks: every tile / kerb chunk / bank / paint chunk inside its square (${out} out)`);
  ok(tiles > 250 && kerbs > 200 && paint > 200 && kerbTris > 5e5 && tileTris > 3e6 && g.root.children.filter((m) => m.name === 'ground bank').length === 1, `chunks: ${tiles} tiles (${tileTris} tris), ${kerbs} kerb chunks (${kerbTris} tris), ${paint} paint chunks`);
  ok(g.root.children[0].material.name === 'cherkasy-ground' && g.root.children.filter((m) => m.name === 'markings').length === paint, 'the sites still find the ground material and the paint by name');
  ok(g.meshes().length === g.root.children.length - 1 && g.lod().drawn === g.lod().meshes, 'before the first update every mesh hangs under the root');
}

// ---- the far sheets
{
  let above = 0, deep = 0, border = 0, verts = 0, tris = 0, wet = 0, wetNear = 0, worst = 0;
  const open = (x, z) => g.isWater(x, z) && g.isWater(x + 3, z) && g.isWater(x - 3, z) && g.isWater(x, z + 3) && g.isWater(x, z - 3);
  const area = (P, a, b, c) => Math.abs((P[b] - P[a]) * (P[c + 2] - P[a + 2]) - (P[c] - P[a]) * (P[b + 2] - P[a + 2])) / 2;
  const lattice = hf.heightAt; // no overlay here: the lattice itself
  for (const u of g.units.values()) {
    if (!u.far) continue;
    const f = u.far.data, P = f.position, I = f.index;
    tris += I.length / 3; verts += P.length / 3;
    for (let k = 0; k < P.length; k += 3) {
      const x = P[k], y = P[k + 1], z = P[k + 2], h = lattice(x, z);
      if (y > h + 0.002) above++;
      // skirt vertices hang SKIRT under a border vertex; everything else stays within the fit of the terrain
      const onBorder = Math.abs(x - u.x0) < 1e-3 || Math.abs(x - u.x0 - UNIT) < 1e-3 || Math.abs(z - u.z0) < 1e-3 || Math.abs(z - u.z0 - UNIT) < 1e-3;
      if (onBorder) { if (Math.abs(y - h) > 0.002 && Math.abs(y - (h - FAR.SKIRT)) > 0.002) border++; } else { if (h - y > worst) worst = h - y; if (h - y > 2 * FAR.TOL + 0.2) deep++; }
    }
    // open water (the raster says water 3 m round a triangle's middle): the sheet lays no more land there than the
    // full tiles do (piers, spits and sand bars the raster calls water), so the river never gets a lid
    for (let k = 0; k < I.length; k += 3) {
      const a = 3 * I[k], b = 3 * I[k + 1], c = 3 * I[k + 2];
      if (open((P[a] + P[b] + P[c]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3)) wet += area(P, a, b, c);
    }
    for (const m of u.near) {
      const Q = m.geometry.attributes.position.array, J = m.geometry.index.array;
      for (let k = 0; k < J.length; k += 3) {
        const a = 3 * J[k], b = 3 * J[k + 1], c = 3 * J[k + 2];
        if (open((Q[a] + Q[b] + Q[c]) / 3, (Q[a + 2] + Q[b + 2] + Q[c + 2]) / 3)) wetNear += area(Q, a, b, c);
      }
    }
  }
  ok(above === 0, `far sheets: never above the terrain (${above} vertices above)`);
  ok(border === 0, `far sheets: the unit borders keep the lattice's own heights (${border} off)`);
  ok(deep === 0 && worst < 2 * FAR.TOL + 0.2, `far sheets: within ${(2 * FAR.TOL + 0.2).toFixed(1)} m under the terrain (worst ${worst.toFixed(2)} m)`);
  ok(wet < wetNear * 1.05 + 200, `far sheets: no more land over open water than the full tiles lay (${Math.round(wet)} m2 against ${Math.round(wetNear)} m2)`);
  const nearTris = [...g.units.values()].filter((u) => u.far).reduce((s, u) => s + u.tris, 0);
  ok(tris < nearTris / 6, `far sheets: ${tris} triangles for ${nearTris} of full tiles`);
  console.log(`ground + far in ${Math.round(ms)} ms (far ${L.build.ms} ms): ${L.capable} sheets, ${tris} tris, ${verts} verts, maps ${(L.build.mapBytes / 1e6).toFixed(1)} MB run-length for ${(L.build.texels / 1e6).toFixed(0)} M texels, steps ${L.build.steps.join(' / ')}, worst ${worst.toFixed(2)} m under`);
}

// ---- inside the triangles too, not only at the vertices: on a 4 m grid of probes the sheet is never above the full
// tiles it replaces (so nothing jumps up at a switch and nothing a site drapes on the ground goes under), never far
// below them, and has ground wherever they have (the shore's cells are cut the way the full tiles are)
{
  const STEP = 4, N = UNIT / STEP;
  const raster = (u, P, I, out) => {
    for (let k = 0; k < I.length; k += 3) {
      const a = 3 * I[k], b = 3 * I[k + 1], c = 3 * I[k + 2], ax = P[a], az = P[a + 2], bx = P[b], bz = P[b + 2], cx = P[c], cz = P[c + 2];
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-6) continue; // a skirt, a degenerate piece
      const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - u.x0) / STEP - 0.5)), i1 = Math.min(N - 1, Math.floor((Math.max(ax, bx, cx) - u.x0) / STEP - 0.5));
      const j0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - u.z0) / STEP - 0.5)), j1 = Math.min(N - 1, Math.floor((Math.max(az, bz, cz) - u.z0) / STEP - 0.5));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = u.x0 + (i + 0.5) * STEP, z = u.z0 + (j + 0.5) * STEP;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l3 = 1 - l1 - l2;
        if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
        const y = l1 * P[a + 1] + l2 * P[b + 1] + l3 * P[c + 1];
        if (y > out[j * N + i]) out[j * N + i] = y;
      }
    }
  };
  let probes = 0, above = 0, holes = 0, worst = -Infinity, deepest = 0;
  const far = new Float32Array(N * N), near = new Float32Array(N * N);
  for (const u of g.units.values()) {
    if (!u.far) continue;
    far.fill(-Infinity); near.fill(-Infinity);
    raster(u, u.far.data.position, u.far.data.index, far);
    for (const m of u.near) raster(u, m.geometry.attributes.position.array, m.geometry.index.array, near);
    for (let k = 0; k < N * N; k++) {
      if (near[k] === -Infinity) continue;
      if (far[k] === -Infinity) { holes++; continue; }
      probes++;
      const d = far[k] - near[k];
      if (d > 0.02) above++;
      if (d > worst) worst = d;
      if (-d > deepest) deepest = -d;
    }
  }
  ok(probes > 3e6 && above === 0, `far sheets: never above the full tiles inside the triangles either (${above} of ${probes} probes, highest ${worst.toFixed(3)} m over)`);
  ok(holes === 0, `far sheets: ground wherever the full tiles have it (${holes} probes without)`);
  // (a full tile's piece is flat between corners on a bilinear patch, so in a steep cell it rides up to ~0.9 m over the
  // terrain, and the sheet lies up to 2 TOL under it)
  ok(deepest < 2 * FAR.TOL + 1.2, `far sheets: at most ${deepest.toFixed(2)} m under the full tiles' top layer`);
  // only where the full tiles stand on the 16 m lattice: a unit that reaches past region + 900 m keeps its tiles
  const R = map.region, M = 900;
  ok([...g.units.values()].every((u) => !u.far || (u.x0 >= R.x0 - M && u.x0 + UNIT <= R.x1 + M && u.z0 >= R.z0 - M && u.z0 + UNIT <= R.z1 + M)), 'far sheets: none on the fringe, where the full tiles are draped in 64 m cells');
}

// ---- the id maps against the full tiles: where a tile's triangle is the top layer, the map says the same surface
{
  const u = g.units.get(G.at(-150, 700)), f = u.far.data, ids = decodeIds(f.rv, f.rl, f.size);
  ok(f.size === UNIT && ids.length === UNIT * UNIT, 'id map: a city unit has a 1 m map');
  const at = (x, z) => ids[Math.min(f.size - 1, Math.floor((z - u.z0) * f.size / UNIT)) * f.size + Math.min(f.size - 1, Math.floor((x - u.x0) * f.size / UNIT))] - 1;
  const hits = { [SURF.PAVERS]: [0, 0], [SURF.ASPHALT]: [0, 0] };
  for (const m of u.near) {
    const P = m.geometry.attributes.position.array, S = m.geometry.attributes.aSurf.array, I = m.geometry.index.array;
    for (let k = 0; k < I.length; k += 3) {
      const a = I[k], b = I[k + 1], c = I[k + 2], h = hits[S[a]];
      if (!h) continue;
      const x = (P[3 * a] + P[3 * b] + P[3 * c]) / 3, z = (P[3 * a + 2] + P[3 * b + 2] + P[3 * c + 2]) / 3;
      const area = Math.abs((P[3 * b] - P[3 * a]) * (P[3 * c + 2] - P[3 * a + 2]) - (P[3 * c] - P[3 * a]) * (P[3 * b + 2] - P[3 * a + 2])) / 2;
      if (area < 4) continue;
      h[0]++; if (at(x, z) === S[a]) h[1]++;
    }
  }
  const pav = hits[SURF.PAVERS], asp = hits[SURF.ASPHALT];
  ok(pav[0] > 1000 && pav[1] / pav[0] > 0.95, `id map: paving triangles read as paving (${pav[1]}/${pav[0]})`);
  ok(asp[0] > 1000 && asp[1] / asp[0] > 0.9, `id map: asphalt triangles read as asphalt unless a walk crosses (${asp[1]}/${asp[0]})`);
  const light = [...g.units.values()].filter((q) => q.far && q.far.data.size < UNIT);
  ok(light.length > 5 && light.every((q) => q.far.data.size === UNIT / 2 || q.far.data.size === 1), `id map: ${light.length} light units carry a 2 m (or one-texel) map`);
}

// ---- the pick: full tiles near the camera, far sheets beyond `far`, with hysteresis; kerbs and paint by distance
{
  const cam = { position: new THREE.Vector3(-150, 140, 700) };
  const settle = () => { for (let k = 0; k < 80; k++) g.update(0, cam); };
  const here = g.units.get(G.at(-150, 700)), there = [...g.units.values()].find((u) => u.far && u.i === here.i && u.j === here.j + 3); // 3 km down the boulevard
  const shown = (u) => ({ near: u.near.every((m) => m.visible), hidden: u.near.every((m) => !m.visible), far: !!u.far.mesh?.visible });
  settle();
  ok(g.lod().far === 0 && shown(there).near, 'pick: before setDetail every unit is drawn in full');
  g.setDetail({ far: 500, kerbs: 250, paint: 300 }); settle();
  ok(shown(here).near && !shown(here).far, 'pick: the unit under the camera is full');
  ok(shown(there).hidden && shown(there).far, 'pick: a unit 3 km away is its far sheet');
  const fringe = g.units.get(G.at(-150 + 3 * UNIT, 700));
  ok(fringe && !fringe.far && fringe.near.every((m) => m.visible), 'pick: a unit on the fringe has no far sheet and stays full');
  const st = g.lod();
  ok(st.far > 50 && st.far === [...g.units.values()].filter((u) => u.isFar).length && st.chunks.byClass.kerbs[1] > 200 && st.chunks.byClass.paint[1] > 150, `pick: ${st.far} units far, ${st.chunks.byClass.kerbs[1]} kerb chunks and ${st.chunks.byClass.paint[1]} paint chunks out`);
  const farMat = there.far.mesh.material;
  ok(farMat.name === 'cherkasy-ground-far' && farMat.defines.GROUND_FAR !== undefined && here.near[0].material.defines.GROUND_FAR === undefined, 'pick: a far sheet has the far material, a tile the plain one');
  const made = [...g.units.values()].filter((u) => u.far?.mesh), codes = new Set(made.map((u) => u.far.code));
  ok(made.every((u) => u.far.mesh.material === farMat) && codes.size === made.length && made.every((u) => (u.far.code >> 6 & 63) === u.i && (u.far.code & 63) === u.j
    && u.far.mesh.geometry.attributes.aSurf.array.every((v) => v === u.far.code)), 'pick: every far sheet shares one material and carries its own unit code');
  // only what is drawn hangs in the scene graph
  const hung = new Set([...g.root.children, ...g.root.children.find((m) => m.name === 'ground far').children]);
  ok(g.meshes().every((m) => m.visible === hung.has(m)) && st.drawn === g.meshes().filter((m) => m.visible).length && st.drawn < st.meshes / 3,
    `pick: the scene graph holds the drawn meshes only (${st.drawn} of ${st.meshes})`);
  // hysteresis: a unit that turned full at 500 m stays full until 500 * 1.06 + 16 m
  const u = here, edge = u.x0 + UNIT;
  cam.position.set(edge + 499, u.y1, u.z0 + UNIT / 2); settle();
  ok(shown(u).near, 'pick: full at 499 m');
  cam.position.set(edge + 530, u.y1, u.z0 + UNIT / 2); settle();
  ok(shown(u).near, 'pick: still full at 530 m (hysteresis)');
  cam.position.set(edge + 560, u.y1, u.z0 + UNIT / 2); settle();
  ok(shown(u).hidden && shown(u).far, 'pick: far at 560 m');
  cam.position.set(edge + 510, u.y1, u.z0 + UNIT / 2); settle();
  ok(shown(u).far, 'pick: still far at 510 m on the way back');
  cam.position.set(edge + 490, u.y1, u.z0 + UNIT / 2); settle();
  ok(shown(u).near && !shown(u).far, 'pick: full again at 490 m');
  // the photo mode's camera 1 km up over another unit: that unit is far (the distance is in 3D), the ground below a
  // camera 100 m up is full
  cam.position.set(there.x0 + UNIT / 2, there.y1 + 1000, there.z0 + UNIT / 2); settle();
  ok(shown(there).far, 'pick: from 1 km up the unit below is its far sheet');
  cam.position.y = there.y1 + 100; settle();
  ok(shown(there).near && !shown(there).far, 'pick: 100 m up over a unit, that unit is full');
  // over a corner four units come back to full tiles: one a frame (a returning unit's buffers upload on its first draw)
  cam.position.set(there.x0, there.y1 + 1000, there.z0); settle();
  const four = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([a, b]) => g.units.get(G.at(there.x0 + a, there.z0 + b))).filter((u) => u?.far);
  cam.position.y = there.y1 + 60; g.update(0, cam);
  ok(four.length >= 3 && four.filter((u) => !u.isFar).length === 1, `pick: one unit a frame returns to full tiles (${four.filter((u) => !u.isFar).length} of ${four.length} after one frame)`);
  settle();
  ok(four.every((u) => !u.isFar && shown(u).near), 'pick: and the rest in the next frames');

  // a mesh a site adds to the root in the ground material is cut by unit and follows its unit's tiles
  const east = (q) => g.units.get(G.at(q.x0 + UNIT + 20, q.z0 + 100));
  const west = [...g.units.values()].find((q) => q.far && east(q)?.far);
  const a = [west.x0 + UNIT - 20, west.y1, west.z0 + 100], bx = west.x0 + UNIT + 20;
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute([a[0], a[1], a[2], a[0] + 5, a[1], a[2], a[0], a[1], a[2] + 5, bx, a[1], a[2], bx + 5, a[1], a[2], bx, a[1], a[2] + 5], 3));
  sg.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  sg.setAttribute('aSurf', new THREE.Float32BufferAttribute([2, 2, 2, 2, 2, 2], 1));
  sg.setIndex([0, 2, 1, 3, 5, 4]);
  g.root.add(Object.assign(new THREE.Mesh(sg, g.material), { name: 'ground extra' }));
  settle();
  const parts = g.meshes().filter((m) => m.name === 'ground extra');
  ok(parts.length === 2 && parts.every((m) => m.geometry.index.count === 3) && west.near.includes(parts.find((m) => m.geometry.boundingBox.max.x < west.x0 + UNIT)) && east(west).near.includes(parts.find((m) => m.geometry.boundingBox.min.x > west.x0 + UNIT)), 'adopt: a site mesh over two units becomes two, each with its unit');
  cam.position.set(0, 5000, 0); settle();
  ok(parts.every((m) => !m.visible && !g.root.children.includes(m)), 'adopt: the parts go when their units turn far');
  g.setDetail({}); settle();
  ok(g.lod().far === 0 && [...g.units.values()].every((q) => q.near.every((m) => m.visible) && !q.far?.mesh?.visible) && g.lod().chunks.hidden === 0
    && parts.every((m) => g.root.children.includes(m)) && g.root.children.find((m) => m.name === 'ground far').children.length === 0, 'pick: setDetail({}) draws everything in full again');
}

// ---- a site's overlay (the railway cutting): the far lattice goes under it, so a sheet never covers the trench
{
  const hf2 = createHeightField(map, dem), geo = FRAME_OF(map), cut = shapeRailCut(hf2, map, geo);
  ok(cut && hf2.latticeAt && hf2.overlays?.length === 1, 'cutting: the overlay names its box');
  const grid = farLattice(hf2), base = hf2.data.grid, { x0, z0, nx } = hf2.data.meta;
  ok(grid !== base && farLattice(hf) === hf.data.grid, 'cutting: a lowered copy with an overlay, the lattice itself without');
  let lowered = 0, over = 0, probes = 0;
  for (let k = 0; k < base.length; k++) if (grid[k] < base[k] - 0.01) lowered++;
  const [bx0, bz0, bx1, bz1] = hf2.overlays[0];
  const bil = (x, z) => { const u = (x - x0) / cell, v = (z - z0) / cell, i = Math.floor(u), j = Math.floor(v), s = u - i, t = v - j; return (1 - t) * ((1 - s) * grid[j * nx + i] + s * grid[j * nx + i + 1]) + t * ((1 - s) * grid[(j + 1) * nx + i] + s * grid[(j + 1) * nx + i + 1]); };
  for (let z = bz0; z < bz1; z += 3.3) for (let x = bx0; x < bx1; x += 3.3) { probes++; if (bil(x, z) > hf2.heightAt(x, z) + 0.05) over++; }
  ok(lowered > 100 && over / probes < 0.002, `cutting: ${lowered} nodes lowered, the far lattice above the trench at ${over} of ${probes} probes`);
}

// ---- the shore's wet bands in chunks
{
  const segs = g.wetSegs, one = buildWetBands({ scene: new THREE.Group(), segs }), many = buildWetBands({ scene: new THREE.Group(), segs, chunk: 1024 });
  const count = (list) => list.reduce((s, m) => s + m.geometry.attributes.position.count, 0);
  ok(one.meshes.length === 1 && many.meshes.length > 1 && count(many.meshes) === count(one.meshes) && count(many.foams) === count(one.foams), `wet bands: ${many.meshes.length} chunks hold the same strips as one mesh`);
  ok(many.meshes.every((m) => { m.geometry.computeBoundingSphere(); return m.geometry.boundingSphere.radius < 1024; }), 'wet bands: a chunk stays inside its square');
}

console.log(fails ? `${fails} of ${n} FAILED` : `ground lod: ${n} checks passed`);
process.exit(fails ? 1 : 0);
