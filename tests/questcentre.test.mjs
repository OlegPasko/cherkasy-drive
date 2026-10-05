// Headless checks for the quest's four centre buildings (src/world/cherkasy/questcentre.js): node tests/questcentre.test.mjs
// On the real map: every OSM outline is there, the site builds all four within budget, each stands its real height
// (Belakhov two storeys, Sklovsky three, the gymnasium two tall ones, the tobacco works four – the generic extrusion
// had them at 2, 2, 4 and 3), walls stop rays from the street, the factory hall's loading canopy lets a car under,
// and the tree clearing keeps to the lots.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildQuestCentre, QUEST_SKIP } from '../src/world/cherkasy/questcentre.js';
import { FRAME_OF } from '../src/world/cherkasy/frame.js';
import { SECRETS } from '../src/game/quests/secrets.js';
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
for (const id of QUEST_SKIP) ok(map.buildings.some((b) => b.id === id), `OSM way ${id} is in map_buildings.json`);

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildQuestCentre({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt });
ok(site && Object.keys(site.parts).length === 4, `the site builds all four (${Object.keys(site?.parts ?? {}).join(', ')})`);
ok(site.footprints.length === 6, 'six footprints (the works has three)');
ok(root.children.length === 4 && root.children.every((g) => g.name.startsWith('quest-')), 'one named group per building');
let nan = false;
root.traverse((o) => { if (o.isMesh) for (const v of o.geometry.attributes.position.array) if (Number.isNaN(v)) nan = true; });
ok(!nan, 'no NaN vertices');
for (const [k, p] of Object.entries(site.parts)) ok(p.verts < (k === 'tobacco' ? 40000 : 20000) && p.meshes <= 7, `${k}: ${p.verts} verts in ${p.meshes} meshes`);

const ring = (id) => { const b = map.buildings.find((o) => o.id === id); const P = []; for (let i = 0; i < b.p.length; i += 2) P.push([b.p[i], b.p[i + 1]]); return P; };
// roof height over the ground at a point inside each block
for (const [name, x, z, lo, hi] of [['Belakhov', 210, -33, 8.5, 11], ['Sklovsky', 285, -272, 10.5, 13], ['Horodetsky', -188, 512, 10.5, 14],
  ['tobacco west', -660, 225, 15, 17.5], ['tobacco wing', -567, 280, 15, 17.5], ['tobacco hall', -525, 230, 8, 12]]) {
  const g = hf.heightAt(x, z), roof = cw.groundHeight(x, z, g + 40);
  ok(roof - g > lo && roof - g < hi, `${name}: the roof is ${(roof - g).toFixed(1)} m up`);
  ok(site.clear(x, z), `${name}: no trees inside`);
}
// rays from the street stop at the fronts: Khreshchatyk (-x) for Belakhov, Slavy (-z) for Sklovsky, Smilianska (-z)
for (const [name, o, d, wall, tol] of [['Belakhov', [195, -33], [1, 0], 204.6, 0.6], ['Sklovsky', [285, -295], [0, 1], -281, 1.2], ['Horodetsky end block', [-213, 480], [0, 1], 495, 1.2]]) {
  const g = hf.heightAt(o[0], o[1]), h = cw.raycast({ x: o[0], y: g + 2, z: o[1] }, { x: d[0], y: 0, z: d[1] }, 30);
  const hit = h ? (d[0] ? h.point.x : h.point.z) : NaN;
  ok(h && Math.abs(hit - wall) < tol, `${name}: a ray from the street stops at the wall (${hit.toFixed?.(1)} vs ${wall})`);
}
// the works' fence stands between Dashkovycha and the forecourt; the hall's loading canopy is high enough to drive under
{
  const g = hf.heightAt(-630, 205), h = cw.raycast({ x: -630, y: g + 0.6, z: 200 }, { x: 0, y: 0, z: 1 }, 30);
  ok(h && h.kind === 'fence' && h.point.z > 204 && h.point.z < 209, `a ray from Dashkovycha meets the fence (${h?.kind} at ${h?.point.z.toFixed(1)})`);
  const gc = hf.heightAt(-509, 250), c = cw.ceilingAt(-509, 250, gc + 0.2);
  ok(c - gc > 3.5 && c - gc < 6, `the loading canopy is ${(c - gc).toFixed(1)} m over the yard`);
}
// each quest card's point (the object itself) lies on or right beside the outline built for it (the works' point is
// in its yard, east of the wing)
{
  const F = FRAME_OF(map), dist = (P, x, z) => Math.min(...P.map((p, i) => {
    const q = P[(i + 1) % P.length], ex = q[0] - p[0], ez = q[1] - p[1], t = Math.max(0, Math.min(1, ((x - p[0]) * ex + (z - p[1]) * ez) / (ex * ex + ez * ez)));
    return Math.hypot(p[0] + ex * t - x, p[1] + ez * t - z);
  }));
  for (const [id, ids] of [['belakhov', [157594220]], ['sklovsky', [157436225]], ['horodetsky', [108382800]], ['tobacco', [157006547, 997923403, 997923404]]]) {
    const c = SECRETS.cards.find((q) => q.id === id), [x, z] = F.toXZ(c.ll[0], c.ll[1]);
    const d = Math.min(...ids.map((i) => dist(ring(i), x, z)));
    ok(d < (id === 'tobacco' ? 30 : 15), `${id}: the card's point is ${d.toFixed(1)} m from the built outline`);
  }
}

console.log = log;
if (fails) { console.log(`${fails} failure(s)`); process.exit(1); }
console.log('questcentre: all ok');
