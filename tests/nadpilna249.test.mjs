// Headless checks for the new club house at Надпільна, 249 (src/world/cherkasy/nadpilna249.js): node tests/nadpilna249.test.mjs
//   it builds within budget with finite geometry; no OSM building reaches into its outline and it keeps off the lane;
//   the copy of the outline in places.js matches the module; the walls stop the car, the car port under the street
//   section lets it in, the roofs hold it; the trees keep off the lot only.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildNadpilna249, NADP249_RING, NADP249_SKIP } from '../src/world/cherkasy/nadpilna249.js';
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
for (let i = 0; i < NADP249_RING.length; i += 2) out.push([NADP249_RING[i], NADP249_RING[i + 1]]);
ok(NADP249_SKIP.size === 0, 'no OSM building is replaced (the lot is empty in OSM)');
const touches = (b) => { const P = []; for (let i = 0; i < b.p.length; i += 2) P.push([b.p[i], b.p[i + 1]]); return P.some(([x, z]) => inPoly(out, x, z)) || out.some(([x, z]) => inPoly(P, x, z)); };
const hit = blds.filter((b) => touches(b)).map((b) => b.id);
ok(hit.length === 0, `no OSM building inside the outline (${hit.join(', ') || 'none'})`);
// the lane along the north-west side (a 4.5 m service road on z -522.8) stays clear of the walls
ok(Math.min(...out.map(([, z]) => z)) > -522.8 + 2.25, 'the walls keep off the lane');

const place = PLACES.find((q) => q.id === 'nadpilna249');
ok(place && place.kind === 'improved' && !place.icon && !place.url && /Надпільна, 249/.test(place.note), 'places.js: an improved object, no badge, no link');
ok(place?.ring?.length === NADP249_RING.length && place.ring.every((v, i) => Math.abs(v - NADP249_RING[i]) < 0.05), 'places.js ring matches the module outline');

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildNadpilna249({ root, solids: cw, zips: null, heightAt: hf.heightAt });
ok(!!site && root.children.length === 1, 'site builds');
let verts = 0, meshes = 0, nan = 0;
root.traverse((o) => { if (o.isMesh) { meshes++; const a = o.geometry.attributes.position.array; verts += a.length / 3; for (const v of a) if (!Number.isFinite(v)) nan++; } });
ok(nan === 0, 'all vertices finite');
ok(verts > 3000 && verts < 20000 && meshes <= 6, `${(verts / 1000).toFixed(1)}k vertices in ${meshes} meshes`);
const h = site.footprints[0]?.h;
ok(site.footprints.length === 1 && h > 13.5 && h < 18.5, `one footprint, ${h?.toFixed(1)} m high`);

// the car driven north-east along the lane side of the middle section is pushed back off the wall
const drive = (p, dx, dz, n) => { let hits = 0; for (let i = 0; i < n; i++) { p.x += dx; p.z += dz; p.y = hf.heightAt(p.x, p.z) + 0.2; if (cw.pushCylinder(p, 1.2, 1.6, 0.3)?.hit) hits++; } return hits; };
let p = { x: -676, y: 0, z: -524 };
let hits = drive(p, 0, 0.4, 30);
ok(hits > 5 && p.z < -516.3, `the lane wall stops the car (${hits} pushes, z ${p.z.toFixed(1)})`);
// from the street into the car port under the street section: the car gets in under the slab, then meets the core
p = { x: -702, y: 0, z: -511.4 };
hits = drive(p, 0.4, 0, 40);
ok(p.x > -692 && p.x < -686, `the car drives into the car port and stops at the core (x ${p.x.toFixed(1)}, ${hits} pushes)`);
// the roofs hold the car: the street section, the cores, the rear section
const g0 = hf.heightAt(-690, -514);
const rA = cw.groundHeight(-690, -514, 80), rJ = cw.groundHeight(-684, -512, 80), rC = cw.groundHeight(-662, -509, 80);
ok(rA > g0 + 13 && rJ > rA && rC > g0 + 11, `the roofs hold (A ${rA.toFixed(1)}, core ${rJ.toFixed(1)}, C ${rC.toFixed(1)} vs ground ${g0.toFixed(1)})`);
// under the slab the car port's floor is the ground
ok(Math.abs(cw.groundHeight(-692, -513, g0 + 1) - hf.heightAt(-692, -513)) < 0.3, 'the car port floor is the ground');
// the street fence closes the yard
ok(cw.raycast({ x: -687, y: g0 + 1, z: -501 }, { x: 1, y: 0, z: 0 }, 8) != null, 'the street fence closes the yard');
ok(site.clear(-680, -510) && site.clear(-690, -500) && !site.clear(-710, -510) && !site.clear(-680, -480), 'trees keep off the lot only');

console.log = log;
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
