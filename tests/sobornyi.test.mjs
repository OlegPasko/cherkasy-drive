// Headless checks for Sobornyi park (src/world/cherkasy/sobornyi.js): node tests/sobornyi.test.mjs
// On the real map: both chapels' OSM ids are there, the site builds in budget (the furniture instanced), the park's
// paved footways get lamps along them and benches, no lamp or bench stands on a footway or outside the park, the
// Holodomor cross stands on its boulder at the quest's spot, the entrance rotundas keep off the footways, and the
// generated trees are kept off the plaza and the memorials but not off the open park.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { FRAME_OF } from '../src/world/cherkasy/frame.js';
import { inPoly, ringPts } from '../src/world/cherkasy/geo.js';
import { buildSobornyi, SOBORNYI_SKIP, SOBORNYI_PARK } from '../src/world/cherkasy/sobornyi.js';
import * as THREE from 'three';

const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
map.buildings = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const hf = createHeightField(map, dem), geo = FRAME_OF(map);
for (const id of SOBORNYI_SKIP) ok(map.buildings.some((b) => b.id === id), `OSM way ${id} is in map_buildings.json`);

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildSobornyi({ root, map, solids: cw, heightAt: hf.heightAt, geo });
ok(!!site, 'the site builds');
let verts = 0, meshes = 0, nan = false, inst = 0;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; if (o.isInstancedMesh) inst++; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; } });
ok(!nan, 'no NaN vertices');
ok(verts < 40000 && meshes <= 15 && inst === 3, `budget: ${verts} verts in ${meshes} meshes (${inst} instanced)`);
const st = site.stats;
ok(st.lamps > 60 && st.lamps < 220 && st.benches > 25, `${st.lamps} lamps, ${st.benches} benches along ${st.paths} footway runs`);

// no lamp or bench on a footway's centre band, all inside the park
const PARK = ringPts(SOBORNYI_PARK), lampM = root.getObjectByName('sobornyi-lamps'), benchM = root.getObjectByName('sobornyi-benches');
const feet = map.roads.filter((r) => r.k !== 'm');
const onFoot = (x, z) => feet.some((r) => { for (let i = 2; i < r.p.length; i += 2) { const ax = r.p[i - 2], az = r.p[i - 1], bx = r.p[i], bz = r.p[i + 1], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))); if (Math.hypot(x - ax - dx * t, z - az - dz * t) < r.w / 2 - 0.2) return true; } return false; });
const m = new THREE.Matrix4(), p = new THREE.Vector3();
let bad = 0, out = 0;
for (const M of [lampM, benchM]) for (let i = 0; i < M.count; i++) { M.getMatrixAt(i, m); p.setFromMatrixPosition(m); if (onFoot(p.x, p.z)) { bad++; log(M.name, p.x.toFixed(1), p.z.toFixed(1)); } if (!inPoly(PARK, p.x, p.z)) out++; }
ok(bad === 0, `no lamp or bench on a footway (${bad})`);
ok(out <= 1, `lamps and benches stay in the park (${out} outside)`);

// the Holodomor cross at the quest's spot: on a boulder, ~4.5 m to its top
const [cx, cz] = geo.toXZ(49.434132, 32.055986), g = hf.heightAt(cx, cz);
ok(st.crossTop - g > 4.2 && st.crossTop - g < 5.2, `the cross's top is ${(st.crossTop - g).toFixed(2)} m up`);
const h = cw.raycast({ x: cx, y: g + 1.0, z: cz - 6 }, { x: 0, y: 0, z: 1 }, 10);
ok(h && h.distance > 4 && h.distance < 5.4, `a ray from the path stops at the boulder (${h?.distance.toFixed(2)} m)`);
ok(st.plaza && site.clear(...st.plaza) && site.clear(cx, cz), 'no generated trees on the plaza or at the cross');
// the open park keeps its trees (a lawn far from everything built here)
let kept = 0; for (let x = -1150; x < -1100; x += 7) for (let z = 600; z < 700; z += 7) if (!site.clear(x, z)) kept++;
ok(kept > 60, `the open park keeps its trees (${kept} of the probe points)`);
ok(!site.clear(-1500, 600), 'nothing is cleared outside the park');

console.log = log;
if (fails) { console.log(`${fails} failure(s)`); process.exit(1); }
console.log('sobornyi: all ok');
