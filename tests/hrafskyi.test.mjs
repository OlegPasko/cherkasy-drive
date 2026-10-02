// Headless checks for ЖК «Графський» (src/world/cherkasy/hrafskyi.js): node tests/hrafskyi.test.mjs
// On the real map: the sections and the podium build, the budget holds, a ray from the yard stops at a section's wall,
// the roofs stand at the storey counts' height and the yard between the rows stays open (no stray solid).
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildHrafskyi, HRAFSKYI_SKIP } from '../src/world/cherkasy/hrafskyi.js';
import * as THREE from 'three';

const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
map.buildings = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const hf = createHeightField(map, dem);

ok([...HRAFSKYI_SKIP].every((id) => map.buildings.some((b) => b.id === id)), 'every replaced OSM id is in map_buildings.json');
const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildHrafskyi({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt });
ok(site && site.footprints.length === 11, `the site builds: ${site?.footprints.length} footprints (10 sections + podium)`);
let verts = 0, meshes = 0, nan = false;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; } });
ok(!nan, 'no NaN vertices');
ok(verts < 40000 && meshes <= 6, `budget: ${verts} verts in ${meshes} meshes`);

// a ray from the yard westward at bumper height stops at the yard wall of 203/3 (x ≈ -905.9 .. -907.2)
const g = hf.heightAt(-880, -190);
const hit = cw.raycast({ x: -880, y: g + 1, z: -190 }, { x: -1, y: 0, z: 0 }, 60);
ok(hit && hit.kind === 'wall' && Math.abs(hit.point.x + 906.5) < 1.5, `the yard ray stops at 203/3 (x ${hit?.point.x.toFixed(1)})`);
// roofs: 15 storeys on the rows (~46 m), 17 on the north L (~52 m)
const roofW = cw.groundHeight(-921, -178) - hf.heightAt(-921, -178), roofN = cw.groundHeight(-800, -244) - hf.heightAt(-800, -244);
ok(roofW > 44 && roofW < 49, `the 203/3 roof stands ${roofW.toFixed(1)} m up`);
ok(roofN > 49 && roofN < 56, `the north L roof stands ${roofN.toFixed(1)} m up`);
// the yard is open ground
const yard = cw.groundHeight(-870, -185) - hf.heightAt(-870, -185);
ok(Math.abs(yard) < 0.3, `the yard is open (${yard.toFixed(2)} m)`);
ok(site.clear(-915, -190) && !site.clear(-870, -185), 'trees keep off the sections, not off the yard');

console.log = log;
if (fails) { console.log(`${fails} failure(s)`); process.exit(1); }
console.log('hrafskyi: all ok');
