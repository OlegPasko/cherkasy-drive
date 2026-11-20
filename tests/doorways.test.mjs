// Headless checks for the entrances the building pass hands out and what keeps out of their approaches
// (src/world/cherkasy/doorways.js; facadekit.js `doors`; street.js, greenery.js treeSpots, the shrub layer's `drop`):
//   node tests/doorways.test.mjs
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { ringPts } from '../src/world/cherkasy/geo.js';
import { createHeightField, buildGroundData } from '../src/world/cherkasy/ground.js';
import { buildBuildings } from '../src/world/buildings.js';
import { roadSegs, roadIndex } from '../src/world/cherkasy/buildings.js';
import { dressBuilding } from '../src/world/cherkasy/facadekit.js';
import { doorIndex, DOOR_STRIDE, TREE_R } from '../src/world/cherkasy/doorways.js';
import { treeSpots, footprintRaster } from '../src/world/cherkasy/greenery.js';
import { shrubSpots, doorFoot } from '../src/world/cherkasy/shrubbery.js';
import { buildStreet } from '../src/world/cherkasy/street.js';
import { createCollisionWorld } from '../src/world/collision.js';
import { buildTrees, SHRUBS } from '../src/world/trees.js';
import { SHRUB_STRIDE } from '../src/world/nature/shrubs.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

// ---- the index: a door on the wall z = 0 at x = 10, opening toward +z, 1 m half width, 4 m out
{
  const D = doorIndex([10, 0, 0, 1, 1, 4, /* a gate, turned: opens toward -x */ 100, 50, -1, 0, 1.9, 8]);
  ok(D.n === 2 && D.at(10, 2) === 0 && D.at(11.4, 2) === 0 && D.at(11.6, 2) === -1 && D.at(8.4, 3.9) === -1, 'an approach is the door plus half a metre each side');
  ok(D.at(10, 4.2) === -1 && D.at(10, -0.5) === -1 && D.at(10, -0.2) === 0, 'from the wall line out to its reach');
  ok(D.at(11.6, 2, 0.2) === 0 && D.at(10, 4.2, 0.3) === 0 && D.at(12.2, 2, 0.5) === -1, 'a disc touches it by its radius');
  ok(D.at(95, 50) === 1 && D.at(92.5, 52) === 1 && D.at(91.5, 50) === -1 && D.at(101, 50) === -1 && D.at(95, 52.6) === -1, 'a gate reaches 8 m, along its own normal');
  const q = D.door(1);
  ok(q.x === 100 && q.nx === -1 && q.hw === 1.9 && q.out === 8 && doorIndex(null).n === 0 && doorIndex(null).at(0, 0) === -1, 'door(i) gives the record back; no doors, no hits');
}

// ---- the real map
const dir = fileURLToPath(new URL('../public/assets/cherkasy/', import.meta.url));
const map = JSON.parse(fs.readFileSync(dir + 'map.json'));
map.buildings = JSON.parse(fs.readFileSync(dir + 'map_buildings.json'));
const buf = fs.readFileSync(dir + 'dem.bin'), dem = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
const hf = createHeightField(map, dem), whole = buildGroundData({ map, hf });
const ground = { heightAt: hf.heightAt, onAsphalt: (x, z) => whole.asph.get(x, z) === 1, isWater: (x, z) => { const w = whole.wat.get(x, z); return w >= 0 ? w === 1 : whole.land.get(x, z) === 0; }, wetSegs: whole.wetSegs };
const footprints = map.buildings.map((b) => ({ poly: ringPts(b.p), kind: b.k }));
const occ = footprintRaster(footprints, map.region);
const log = console.log, quiet = (f) => { console.log = () => {}; try { return f(); } finally { console.log = log; } };

// the building pass with the facade kit, as the city runs it: the entrances it hands out
const S = { n: 0, prism() { this.n++; }, box() { this.n++; }, cyl() { this.n++; }, get count() { return this.n; } };
let offWall = 0, inward = 0, kinds = {};
const res = buildBuildings({ map, solids: S, heightAt: hf.heightAt, plus: true, roadAt: roadIndex(roadSegs(map)), dress: (c) => {
  const n0 = c.doors.length; dressBuilding(c);
  for (let i = n0; i < c.doors.length; i += DOOR_STRIDE) {
    const x = c.doors[i], z = c.doors[i + 1], nx = c.doors[i + 2], nz = c.doors[i + 3];
    kinds[c.b.k] = (kinds[c.b.k] || 0) + 1;
    // on one of the outline's edges, its normal that edge's outward one (outer has positive area: (dz, -dx) / L)
    let hit = false;
    for (let k = 0; k < c.outer.length && !hit; k++) {
      const a = c.outer[k], b = c.outer[(k + 1) % c.outer.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, t = ((x - a[0]) * dx + (z - a[1]) * dz) / (L * L);
      if (t < 0 || t > 1 || Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z) > 0.02) continue;
      hit = true; if (Math.abs(nx - dz / L) + Math.abs(nz + dx / L) > 1e-3) inward++;
    }
    if (!hit) offWall++;
  }
} });
const doors = Float32Array.from(res.doors), nDoors = doors.length / DOOR_STRIDE, index = doorIndex(doors);
ok(res.stats.dressErrors === 0 && nDoors > 15000 && nDoors < 40000, `the kit hands out its entrances: ${nDoors} (${JSON.stringify(kinds)})`);
ok(kinds.apt > 3000 && kinds.public > 800 && kinds.indus > 800 && kinds.house > 5000, 'apartment entrances, public doors, industrial gates and doors, street-facing house doors');
ok(offWall === 0 && inward === 0, `every one lies on its building's wall and opens outward (${offWall} off the wall, ${inward} turned in)`);
{
  let bad = 0, gates = 0;
  for (let i = 0; i < doors.length; i += DOOR_STRIDE) { const hw = doors[i + 4], out = doors[i + 5]; if (!(hw > 0.4 && hw < 2.6 && out >= 4 && out <= 8)) bad++; if (out === 8) gates++; }
  ok(bad === 0 && gates > 500, `half widths 0.4-2.6 m, approaches 4-8 m (${gates} gates reach 8 m)`);
  const again = buildBuildings({ map, solids: { prism() {}, box() {}, cyl() {}, count: 0 }, heightAt: hf.heightAt, plus: true, roadAt: roadIndex(roadSegs(map)), dress: dressBuilding });
  ok(again.doors.length === res.doors.length && again.doors.every((v, i) => v === res.doors[i]), 'the same list on a rebuild');
  const plain = buildBuildings({ map: { buildings: map.buildings.slice(0, 3000) }, solids: { prism() {}, box() {}, cyl() {}, count: 0 }, heightAt: hf.heightAt });
  ok(plain.doors.length === 0, 'no kit, no entrances');
}

// trees: no generated tree in an approach, the others keep their places; an OSM-mapped one steps to its side
{
  const free = treeSpots({ map, ground, footprints, occ }), kept = treeSpots({ map, ground, footprints, occ, doors: index });
  const inDoor = (s) => index.at(s.x, s.z, TREE_R) >= 0;
  const was = free.filter(inDoor).length, left = kept.filter(inDoor).length, K = kept.stats;
  ok(was > 100 && K.doors > 100 && free.length - kept.length === K.doors && was === K.doors + K.doorsMoved + K.doorsOsm, `trees: ${was} stood in an approach, ${K.doors} generated ones are not planted`);
  ok(left === K.doorsOsm && left < 10 && K.doorsMoved > 5, `${K.doorsMoved} OSM-mapped trees stepped to the side of the door, ${left} had no room and stay`);
  const at = new Set(free.map((s) => s.x + ',' + s.z)), osm = free.slice(0, free.stats.osm);
  const moved = kept.filter((s) => !at.has(s.x + ',' + s.z));
  ok(moved.length === K.doorsMoved && moved.every((s) => osm.some((q) => Math.hypot(q.x - s.x, q.z - s.z) < 3.51) && occ.get(s.x, s.z) !== 1 && !ground.onAsphalt(s.x, s.z) && Math.abs(s.y - hf.heightAt(s.x, s.z) - 0.15) < 1e-6),
    'every other tree keeps its place; the stepped ones stand within 3.5 m, on open ground');
}

// shrubs: a door's approach and a site's cleared ground take a shrub out, not its place in the layout – so the shrub
// layer can do it later, cell by cell (the city's way), and gets the same bushes
{
  const hole = (x, z) => Math.hypot(x + 600, z - 800) < 120;
  const all = shrubSpots({ map, ground, footprints, occ }), eager = shrubSpots({ map, ground, footprints, occ, clear: hole, doors: index });
  const A = all.data, E = eager.data, drop = (x, z, w, t) => hole(x, z) || index.at(x, z, doorFoot(w, t)) >= 0;
  const taper = (D, i) => SHRUBS[all.kinds[D[i + 6]]].taper; // a record's kind -> its taper, as the layer hands it to `drop`
  const want = []; let inDoor = 0;
  for (let i = 0; i < A.length; i += SHRUB_STRIDE) { if (index.at(A[i], A[i + 2], doorFoot(A[i + 4], taper(A, i))) >= 0) inDoor++; if (!drop(A[i], A[i + 2], A[i + 4], taper(A, i))) for (let k = 0; k < SHRUB_STRIDE; k++) want.push(A[i + k]); }
  ok(inDoor > 2000 && eager.stats.doors > 2000 && eager.stats.cleared > 20, `shrubs: ${inDoor} of ${A.length / SHRUB_STRIDE} stood in an approach (${eager.stats.doors} left out with the index, ${eager.stats.cleared} on the cleared ground)`);
  ok(E.length === want.length && E.every((v, i) => v === want[i]), 'the layout with the doors is the layout without them minus those shrubs');
  let bad = 0; for (let i = 0; i < E.length; i += SHRUB_STRIDE) if (drop(E[i], E[i + 2], E[i + 4], taper(E, i))) bad++;
  ok(bad === 0, 'none of them in an approach');
  // the layer: `drop` asked per cell near the camera, everything on checkAll
  const T = quiet(() => buildTrees({ spots: [], shadows: false }));
  let asked = 0;
  T.setShrubs({ data: A, kinds: all.kinds }, { drop: (x, z, w, t) => { asked++; return drop(x, z, w, t); } });
  ok(asked === 0 && T.stats().shrubs.items === A.length / SHRUB_STRIDE, 'the layer asks nothing when it is built');
  T.update(0.016, new THREE.Vector3(60, hf.heightAt(60, 300) + 2, 300));
  const st = T.stats().shrubs;
  ok(asked > 0 && asked < 3000 && st.checked > 0 && st.near + st.far > 0, `near the camera: ${asked} shrubs asked in ${st.checked} cells, ${st.dropped} dropped`);
  T.shrubCheckAll();
  const sp = T.shrubSpots(), st2 = T.stats().shrubs;
  let left = 0; for (let i = 0; i < sp.length; i += 4) if (drop(sp[i], sp[i + 1], sp[i + 2], sp[i + 3])) left++;
  ok(asked === A.length / SHRUB_STRIDE && st2.items === E.length / SHRUB_STRIDE && sp.length / 4 === st2.items && left === 0, `asked for all: every shrub once, ${st2.items} stay (${st2.dropped} dropped), none in an approach`);
  // the arrival: fadeIn starts the bushes unseen and trees.update brings them in
  const T2 = quiet(() => buildTrees({ spots: [], shadows: false })), small = A.slice(0, 800 * SHRUB_STRIDE);
  for (const job = T2.shrubJob({ data: small, kinds: all.kinds }, { fadeIn: 1.4 }); !job.next().done;);
  const pool = T2.group.children.find((m) => m.name === 'shrubs near'), sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\n#include <color_vertex>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <clipping_planes_fragment>\n#include <color_fragment>' };
  pool.material.onBeforeCompile(sh);
  const g0 = sh.uniforms.uGrow?.value;
  for (let i = 0; i < 60; i++) T2.update(1 / 60, new THREE.Vector3(small[0], small[1] + 2, small[2]));
  const g1 = sh.uniforms.uGrow.value;
  for (let i = 0; i < 60; i++) T2.update(1 / 60, new THREE.Vector3(small[0], small[1] + 2, small[2]));
  ok(g0 === 0 && g1 > 0.6 && g1 < 0.8 && sh.uniforms.uGrow.value === 1 && sh.vertexShader.includes('vFadeOut *= clamp(uGrow'), `a layer that arrives late dithers in: uGrow 0 -> ${g1.toFixed(2)} after 1 s -> 1`);
  const before = T2.group.children.length;
  for (const job = T2.shrubJob({ data: small, kinds: all.kinds }); !job.next().done;);
  ok(T2.group.children.length === before && sh.uniforms.uGrow.value === 1, 'a new layer replaces the old one (two pools, no more); without fadeIn it is there at once');
}

// street props: none in an approach – stepped along the street, off the carriageways and the buildings, or left out
{
  const data = JSON.parse(fs.readFileSync(dir + 'map_street.json'));
  const mk = (doors) => quiet(() => buildStreet({ scene: new THREE.Group(), data, map, heightAt: hf.heightAt, ground, solids: createCollisionWorld({ terrain: hf.heightAt }), occ, spots: [], clear: [], doors, detailMat: new THREE.MeshStandardMaterial() }));
  const plain = mk(null), street = mk(index), was = plain.doorHits(index), d = street.stats().door;
  ok(was > 30 && was < 300 && plain.stats().door.moved + plain.stats().door.dropped === 0, `street props: ${was} stood in an approach`);
  ok(street.doorHits(index) === 0 && d.moved + d.dropped === was && d.moved > d.dropped, `with the index none: ${d.moved} stepped aside, ${d.dropped} left out`);
  const P0 = plain.props(), P1 = street.props();
  ok(P1.length === P0.length - d.dropped, 'a prop that is left out is not built (no collider, no wires)');
  // the stepped ones: on open ground, at most 6 m from where the data has them
  const at = new Map(); for (const p of P0) at.set(p.kind + '|' + p.x.toFixed(2) + '|' + p.z.toFixed(2), p);
  const movedProps = P1.filter((p) => !at.has(p.kind + '|' + p.x.toFixed(2) + '|' + p.z.toFixed(2)));
  let bad = 0, far = 0;
  for (const p of movedProps) {
    // with its whole footprint: the corners of the oriented hx x hz rectangle too (a bench is 1.84 m long)
    const c = Math.cos(p.ry), sn = Math.sin(p.ry);
    for (const [u, v] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = p.x + c * u * p.hx + sn * v * p.hz, z = p.z - sn * u * p.hx + c * v * p.hz;
      if (ground.onAsphalt(x, z) || occ.get(x, z) === 1 || ground.isWater(x, z) || index.at(x, z, 0) >= 0) { bad++; break; }
      if (Math.max(p.hx, p.hz) < 0.3) break; // a pole is its centre, as where the data puts one
    }
    let best = Infinity; for (const q of P0) if (q.kind === p.kind) best = Math.min(best, Math.hypot(q.x - p.x, q.z - p.z));
    if (best > 6.01) far++;
  }
  ok(movedProps.length === d.moved && bad === 0 && far === 0, `the ${movedProps.length} that stepped stand on open ground within 6 m of their place`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
