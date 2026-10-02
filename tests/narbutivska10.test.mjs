// Headless checks for the new block at Нарбутівська, 10 (src/world/cherkasy/narbutivska10.js): node tests/narbutivska10.test.mjs
//   it builds within budget with finite geometry; the OSM houses it replaces are its own (no other site skips them) and
//   every other OSM building keeps clear of the outline; the copy of the outline in places.js matches the module; the
//   walls stop the car, the roof holds it; the trees keep off the lot only.
import { readFileSync, readdirSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildNarbutivska10, NARB10_RING, NARB10_SKIP } from '../src/world/cherkasy/narbutivska10.js';
import { PLACES } from '../src/world/cherkasy/places.js';
import { inPoly } from '../src/world/cherkasy/geo.js';
import * as THREE from 'three';

const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
const blds = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const hf = createHeightField(map, dem);

const out = [];
for (let i = 0; i < NARB10_RING.length; i += 2) out.push([NARB10_RING[i], NARB10_RING[i + 1]]);
// the replaced houses are on the lot and nobody else's; no other OSM building reaches into the outline
const dir = new URL('../src/world/cherkasy/', import.meta.url);
const others = readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'narbutivska10.js').map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
ok([...NARB10_SKIP].every((id) => !others.includes(String(id))), 'the replaced OSM ids are in no other module');
const touches = (b) => { const P = []; for (let i = 0; i < b.p.length; i += 2) P.push([b.p[i], b.p[i + 1]]); return P.some(([x, z]) => inPoly(out, x, z)) || out.some(([x, z]) => inPoly(P, x, z)); };
const hit = blds.filter((b) => !NARB10_SKIP.has(b.id) && touches(b)).map((b) => b.id);
ok(hit.length === 0, `no other OSM building inside the outline (${hit.join(', ') || 'none'})`);
ok([...NARB10_SKIP].every((id) => blds.some((b) => b.id === id)), 'the replaced ids exist in the map');

const place = PLACES.find((q) => q.id === 'narbutivska10');
ok(place && place.kind === 'improved' && !place.icon && !place.url && /Нарбутівська, 10/.test(place.note), 'places.js: an improved object, no badge, no link');
ok(place?.ring?.length === NARB10_RING.length && place.ring.every((v, i) => Math.abs(v - NARB10_RING[i]) < 0.05), 'places.js ring matches the module outline');

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildNarbutivska10({ root, solids: cw, zips: null, heightAt: hf.heightAt });
ok(!!site && root.children.length === 1, 'site builds');
let verts = 0, meshes = 0, nan = 0;
root.traverse((o) => { if (o.isMesh) { meshes++; const a = o.geometry.attributes.position.array; verts += a.length / 3; for (const v of a) if (!Number.isFinite(v)) nan++; } });
ok(nan === 0, 'all vertices finite');
ok(verts > 3000 && verts < 30000 && meshes <= 6, `${(verts / 1000).toFixed(1)}k vertices in ${meshes} meshes`);
ok(site.footprints.length === 1 && site.footprints[0].h > 18 && site.footprints[0].h < 24, `one footprint, ${site.footprints[0]?.h.toFixed(1)} m to the ridge`);

// the car: driven at the yard face (off the wing, north-west half) it is pushed back; the roof holds it
const gy = hf.heightAt(-931, 1412);
const p = { x: -952, y: 0, z: 1402 };
let hits = 0;
for (let i = 0; i < 40; i++) {
  p.x += 0.4; p.y = hf.heightAt(p.x, p.z) + 0.2;
  if (cw.pushCylinder(p, 1.2, 1.6, 0.3)?.hit) hits++;
}
ok(hits > 5 && p.x < -941.4, `the car does not get into the building (${hits} pushes, x ${p.x.toFixed(1)})`);
const flat = cw.groundHeight(-924, 1412, 80), slope = cw.groundHeight(-931, 1412, 80), wing = cw.groundHeight(-945, 1420, 80);
ok(flat > gy + 11 && slope > flat + 1.5 && wing > gy + 11, `the roof holds (strip ${flat.toFixed(1)}, slope ${slope.toFixed(1)}, wing ${wing.toFixed(1)} vs ground ${gy.toFixed(1)})`);
// the street front: a ray from the road meets the wall; the pavement in front of it stays free
ok(cw.raycast({ x: -909, y: gy + 6, z: 1412 }, { x: -1, y: 0, z: 0 }, 30) != null, 'a ray from the street meets the front');
ok(cw.raycast({ x: -909, y: gy + 0.8, z: 1424.5 }, { x: -1, y: 0, z: 0 }, 8) == null, 'the gate gap on the entrance path is open');
ok(site.clear(-931, 1412) && site.clear(-920, 1430) && !site.clear(-900, 1412) && !site.clear(-931, 1460), 'trees keep off the lot only');

console.log = log;
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
