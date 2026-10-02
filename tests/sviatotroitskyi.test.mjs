// Headless checks for ЖК «Святотроїцький» (src/world/cherkasy/sviatotroitskyi.js): node tests/sviatotroitskyi.test.mjs
// On the real map: the OSM outline is there, the site builds in budget, its walls stop a ray from the boulevard and
// from Святотроїцька, the L-shaped tower's roof stands 26 storeys up over both arms and the podium ledge four, and it keeps off Любава.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildSviatotroitskyi, SVIATO_SKIP } from '../src/world/cherkasy/sviatotroitskyi.js';
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
const [id] = SVIATO_SKIP;
ok(map.buildings.some((b) => b.id === id), `OSM way ${id} is in map_buildings.json`);

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildSviatotroitskyi({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt });
ok(site && site.footprints?.length === 1, 'the site builds');
let verts = 0, meshes = 0, nan = false;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; } });
ok(!nan, 'no NaN vertices');
ok(verts < 30000 && meshes <= 6, `budget: ${verts} verts in ${meshes} meshes`);

const g = hf.heightAt(-60, -315);
const hb = cw.raycast({ x: -60, y: g + 1, z: -315 }, { x: -1, y: 0, z: 0 }, 40);
ok(hb && hb.kind === 'wall' && Math.abs(hb.point.x - -76.3) < 1, `a ray from the boulevard stops at the podium (${hb?.point.x.toFixed(1)})`);
const hs = cw.raycast({ x: -105, y: hf.heightAt(-105, -352) + 1, z: -352 }, { x: 0, y: 0, z: 1 }, 30);
ok(hs && Math.abs(hs.point.z - -341.2) < 1, `a ray from Святотроїцька stops at the wing (${hs?.point.z.toFixed(1)})`);
const hc = cw.raycast({ x: -60, y: g + 1, z: -360 }, { x: -1, y: 0, z: 1 }, 60);
ok(hc && hc.kind === 'wall', 'a ray at the round corner hits it');
const roof = cw.groundHeight(-85, -315), floor = hf.heightAt(-70, -315);
ok(roof - floor > 82 && roof - floor < 92, `the tower roof is ${(roof - floor).toFixed(1)} m up`);
const wr = cw.groundHeight(-105, -333), pr = cw.groundHeight(-76.9, -315, floor + 30);
ok(Math.abs(wr - roof) < 0.1, `the wing along Святотроїцька is a tower arm too (${(wr - floor).toFixed(1)} m)`);
ok(pr - floor > 15 && pr - floor < 19.5, `the podium ledge on the boulevard is ${(pr - floor).toFixed(1)} m up`);
ok(site.top > floor + 80, 'site.top is the tower roof');
// Любава (lyubava.js) is the neighbour to the north: the lot must not reach into its outline
const lyu = map.buildings.find((b) => b.id === 159065169), p = lyu.p;
const inLyu = (x, z) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > z) !== (p[j + 1] > z) && x < (p[j] - p[i]) * (z - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) c = !c; return c; };
ok(site.footprints[0].poly.every(([x, z]) => !inLyu(x, z)), 'no corner of the lot inside Любава');

console.log = log;
if (fails) { console.log(`${fails} failure(s)`); process.exit(1); }
console.log('sviatotroitskyi: all ok');
