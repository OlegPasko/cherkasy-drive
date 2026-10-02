// Headless checks for ЖК Onix (src/world/cherkasy/onix.js): node tests/onix.test.mjs
//   the layout sits on the OSM block it replaces (sections 8–10 = way 1479490556), the site builds without NaNs within
//   its budget, the walls stop the car while the yard and the lane between the blocks stay open, and the maps get one
//   grey footprint per section.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { FRAME_OF } from '../src/world/cherkasy/frame.js';
import { buildOnix, levelOnix, ONIX_SKIP } from '../src/world/cherkasy/onix.js';
import { ONIX_SECTIONS, uvXZ } from '../src/world/cherkasy/onix_data.js';
import { resolvePlaces } from '../src/world/cherkasy/places.js';
import * as THREE from 'three';

const ctx2d = new Proxy({}, { get: () => () => ctx2d, set: () => true }); // gradients are contexts too
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
map.buildings = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const geo = FRAME_OF(map), hf = createHeightField(map, dem);

// the OSM block (sections 8–10) lies inside the east leg as laid out here, to a metre
const osm = map.buildings.find((b) => [...ONIX_SKIP].includes(b.id));
const leg = [10, 9, 8].map((id) => ONIX_SECTIONS.find((q) => q.id === id).r);
const toUV = (x, z) => { const [ox, oz] = uvXZ(0, 0), [ux, uz] = uvXZ(1, 0).map((v, i) => v - [ox, oz][i]), [vx, vz] = uvXZ(0, 1).map((v, i) => v - [ox, oz][i]); return [(x - ox) * ux + (z - oz) * uz, (x - ox) * vx + (z - oz) * vz]; };
const cs = []; for (let i = 0; i < osm.p.length; i += 2) cs.push(toUV(osm.p[i], osm.p[i + 1]));
ok(cs.every(([u, v]) => u > -1 && u < 79.6 && Math.abs(v) < 11.5), `the OSM block's corners fall on the east leg (${cs.map((c) => c.map((q) => q.toFixed(1)).join('/')).join(', ')})`);
ok(leg[0][0] === 0 && leg[2][1] > 78, 'sections 10–8 run the length of the OSM block');

// the terrain hook: a level terrace under each block
const hs = ONIX_SECTIONS.flatMap(({ r: [u0, u1, v0, v1] }) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => hf.heightAt(...uvXZ(u, v))));
const drop = Math.max(...hs) - Math.min(...hs), lv = levelOnix(hf), hb = (b) => ONIX_SECTIONS.filter((q) => q.b === b).flatMap(({ r: [u0, u1, v0, v1] }) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => hf.heightAt(...uvXZ(u, v)))), spread = (a) => Math.max(...a) - Math.min(...a);
ok(lv && spread(hb(1)) < 0.5 && spread(hb(2)) < 0.5, `levelled from ${drop.toFixed(1)} m of fall to terraces at ${lv?.[1]?.toFixed(1)} / ${lv?.[2]?.toFixed(1)} m (spread ${spread(hb(1)).toFixed(2)} / ${spread(hb(2)).toFixed(2)}, cell ${hf.cell})`);

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const zips = { edge() {}, add() {} };
const site = buildOnix({ root, solids: cw, zips, heightAt: hf.heightAt });
cw.finalize?.();
ok(!!site && root.children.length === 1, 'site builds');
let nan = 0, verts = 0, meshes = 0;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (!Number.isFinite(v)) nan++; } });
ok(nan === 0, 'no NaN vertices');
let stray = 0;
root.traverse((o) => { if (o.isMesh) { const a = o.geometry.attributes.position.array; for (let i = 0; i < a.length; i += 3) { const [u, v] = toUV(a[i], a[i + 2]); if (u < -13 || u > 95 || v < -161 || v > 21) stray++; } } });
ok(stray === 0, `nothing is built outside the lot (${stray} stray vertices)`);
ok(verts < 40000 && meshes <= 6, `budget: ${(verts / 1000).toFixed(1)}k vertices, ${meshes} meshes`);
ok(site.footprints.length === ONIX_SECTIONS.length && site.footprints.every((f) => f.h > 27 && f.h < 36), 'a footprint per section, nine storeys high');

// the car: a 2 m box pushed into the middle of each section is pushed out; the yards and the lane are free
const hit = (u, v) => { const [x, z] = uvXZ(u, v); return cw.topAt(x, z).id >= 0; };
for (const q of ONIX_SECTIONS) { const [u0, u1, v0, v1] = q.r; ok(hit((u0 + u1) / 2, (v0 + v1) / 2), `section ${q.id} is solid`); }
ok(!hit(30, -25) && !hit(20, -110), 'the yards are open (playgrounds aside)');
ok(!hit(40, -70), 'the lane between the blocks is open');
ok(site.clear(...uvXZ(40, 0)) && site.clear(...uvXZ(40, -70)) && !site.clear(...uvXZ(40, 40)), 'generated trees keep off the lot, not off the street');

const place = resolvePlaces(map, geo).find((p) => p.id === 'onix');
ok(place && place.kind === 'improved' && place.rings.length === ONIX_SECTIONS.length, 'places.js: an improved object, one ring per section');

log(fails ? `${fails} failed` : 'all ok');
process.exit(fails ? 1 : 0);
