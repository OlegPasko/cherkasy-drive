// Headless checks for ЖК «Олімп Модерн» (src/world/cherkasy/olimpmodern.js): node tests/olimpmodern.test.mjs
//   it builds within budget with finite geometry; its sections stay on the OSM construction lot and clear of every OSM
//   building it does not replace (house 1, way 1526504590, is replaced and matches its section); the copy of the rings
//   in places.js matches the module; the walls stop the car, the portal lets it through, the roof holds it; trees keep
//   off the sections only.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildOlimpModern, olimpModernRings, OLIMPM_SKIP, OLIMPM_SECTIONS } from '../src/world/cherkasy/olimpmodern.js';
import { PLACES, resolvePlaces } from '../src/world/cherkasy/places.js';
import { FRAME_OF } from '../src/world/cherkasy/frame.js';
import { inPoly } from '../src/world/cherkasy/geo.js';
import * as THREE from 'three';

const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
const blds = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
map.buildings = blds;
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const hf = createHeightField(map, dem);

const rings = olimpModernRings();
ok(rings.length === OLIMPM_SECTIONS.length, `${rings.length} sections`);
// the OSM construction lot «ЖК "Олімп-Модерн"» (way 1355317025), 1 m of slack
const LOT = [[-2467.3, -1571.8], [-2584.7, -1566.9], [-2571.3, -1389.3], [-2458.1, -1398]];
const c = LOT.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]);
const LOT1 = LOT.map(([x, z]) => { const d = Math.hypot(x - c[0], z - c[1]); return [x + (x - c[0]) / d * 1.4, z + (z - c[1]) / d * 1.4]; });
ok(rings.every((R) => R.every(([x, z]) => inPoly(LOT1, x, z))), 'every section stands on the construction lot');
const hit = blds.filter((b) => !OLIMPM_SKIP.has(b.id) && rings.some((R) => { for (let i = 0; i < b.p.length; i += 2) if (inPoly(R, b.p[i], b.p[i + 1])) return true; return false; })).map((b) => b.id);
ok(hit.length === 0, `no other OSM building inside a section (${hit.join(', ') || 'none'})`);
const h1 = blds.find((b) => b.id === 1526504590), B = rings[OLIMPM_SECTIONS.findIndex((s) => s.id === 'B')];
ok(h1 && [0, 2, 4, 6].every((i) => B.some(([x, z]) => Math.hypot(x - h1.p[i], z - h1.p[i + 1]) < 0.8)), 'house 1 matches the OSM footprint it replaces');

const place = PLACES.find((q) => q.id === 'olimpmodern');
ok(place && place.kind === 'improved' && !place.icon && !place.url && !place.logo, 'places.js: an improved object, no badge, no link');
ok(/Олімп Модерн/.test(place?.note || ''), 'the note names the complex');
const pr = place?.ring || [];
ok(pr.length === rings.length && rings.every((R, k) => R.every(([x, z], i) => Math.abs(pr[k][2 * i] - x) < 0.15 && Math.abs(pr[k][2 * i + 1] - z) < 0.15)), 'places.js rings match the module');
const res = resolvePlaces(map, FRAME_OF(map)).find((q) => q.id === 'olimpmodern');
ok(res && res.rings.length === rings.length, 'resolvePlaces keeps every section ring');
ok(resolvePlaces(map, FRAME_OF(map)).find((q) => q.id === 'hd34')?.rings.length === 1, 'a single flat ring still resolves as one');

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildOlimpModern({ root, map, solids: cw, zips: null, heightAt: hf.heightAt });
ok(!!site && root.children.length === 1, 'site builds');
let verts = 0, meshes = 0, nan = 0;
root.traverse((o) => { if (o.isMesh) { meshes++; const a = o.geometry.attributes.position.array; verts += a.length / 3; for (const v of a) if (!Number.isFinite(v)) nan++; } });
ok(nan === 0, 'all vertices finite');
ok(verts > 10000 && verts < 45000 && meshes <= 8, `${(verts / 1000).toFixed(1)}k vertices in ${meshes} meshes`);
ok(site.footprints.length === OLIMPM_SECTIONS.length && site.footprints.every((f) => f.h > 18 && f.h < 42), 'a footprint per section, 18–42 m tall');

// the lot frame (the module's): u along the street, v into the lot
const O = [-2467.3, -1571.8], U = [0.0529, 0.9986], V = [-0.9986, 0.0529];
const P = (u, v) => [O[0] + U[0] * u + V[0] * v, O[1] + U[1] * u + V[1] * v];
const drive = (u, v0, v1, n = 80) => { // drive square to the street from v0 to v1 at u; count the pushes
  const p = { x: 0, y: 0, z: 0 }; let hits = 0;
  for (let i = 0; i <= n; i++) {
    const [x, z] = P(u, v0 + (v1 - v0) * i / n); p.x = x; p.z = z; p.y = hf.heightAt(x, z) + 0.2;
    const q = { ...p };
    if (cw.pushCylinder(q, 1.2, 1.6, 0.3)?.hit) hits++;
  }
  return hits;
};
ok(drive(50, -10, 12) > 3, 'the house 1 front stops the car');
ok(drive(86, -10, 27) === 0, 'the portal lets the car into the yard');
ok(drive(86, 22, 40) > 0, 'the fountain basin stops it');
const [rx, rz] = P(50, 13), gy = hf.heightAt(rx, rz), roofY = cw.groundHeight(rx, rz, 80);
ok(roofY > gy + 25 && roofY < gy + 35, `house 1's roof holds (${(roofY - gy).toFixed(1)} m over the ground)`);
const [ax, az] = P(86, 8), archY = cw.groundHeight(ax, az, 80);
ok(archY > hf.heightAt(ax, az) + 5, 'the portal beam can be landed on');
ok(site.clear(...P(50, 13)) && site.clear(...P(50, -4)) && !site.clear(...P(60, 75)) && !site.clear(...P(50, -40)), 'trees keep off the sections, the forecourt and the yard paving only');

console.log = log;
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
