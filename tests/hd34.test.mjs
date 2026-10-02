// Headless checks for the new block at Героїв Дніпра, 34 (src/world/cherkasy/hd34.js): node tests/hd34.test.mjs
//   it builds within budget with finite geometry; its outline keeps clear of the St Andrew churchyard (andriy.js) and
//   of every OSM building; the copy of the outline in places.js matches the module; the walls stop the car and the
//   roof holds it; the trees keep off the lot.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { FRAME_OF } from '../src/world/cherkasy/frame.js';
import { buildHd34, hd34Outline } from '../src/world/cherkasy/hd34.js';
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
const geo = FRAME_OF(map), hf = createHeightField(map, dem);

const out = hd34Outline(geo);
ok(out.length === 28, `outline has ${out.length} corners`);
// the churchyard (andriy.js LOT) and the OSM buildings stay outside
const LOT = [[705.5, 1716.5], [660.3, 1712.1], [655.4, 1711.6], [649.8, 1713.6], [644.7, 1759.2], [638.3, 1813], [638, 1815.2], [654.7, 1827.5], [659.1, 1830.6], [698.3, 1791.4], [705.1, 1785.5], [712.2, 1725.1]];
ok(!out.some(([x, z]) => inPoly(LOT, x, z)) && !LOT.some(([x, z]) => inPoly(out, x, z)), 'clear of the churchyard');
const xs = out.map((p) => p[0]), zs = out.map((p) => p[1]);
const hit = blds.filter((b) => { for (let i = 0; i < b.p.length; i += 2) if (inPoly(out, b.p[i], b.p[i + 1])) return true; return false; }).map((b) => b.id);
ok(hit.length === 0, `no OSM building inside the outline (${hit.join(', ') || 'none'})`);

const place = PLACES.find((q) => q.id === 'hd34');
ok(place && place.kind === 'improved' && !place.icon && !place.url, 'places.js: an improved object, no badge, no link');
const ring = place?.ring || [];
ok(ring.length === out.length * 2 && out.every(([x, z], i) => Math.abs(ring[2 * i] - x) < 0.15 && Math.abs(ring[2 * i + 1] - z) < 0.15), 'places.js ring matches the module outline');

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildHd34({ root, map, solids: cw, zips: null, heightAt: hf.heightAt, geo });
ok(!!site && root.children.length === 1, 'site builds');
let verts = 0, meshes = 0, nan = 0;
root.traverse((o) => { if (o.isMesh) { meshes++; const a = o.geometry.attributes.position.array; verts += a.length / 3; for (const v of a) if (!Number.isFinite(v)) nan++; } });
ok(nan === 0, 'all vertices finite');
ok(verts > 5000 && verts < 40000 && meshes <= 6, `${(verts / 1000).toFixed(1)}k vertices in ${meshes} meshes`);
ok(site.footprints.length === 5 && site.footprints.every((f) => f.h > 28 && f.h < 34), 'five footprints, about 30 m tall');

// the car: driven at the middle's front it is pushed back off the wall; dropped on the roof it stands on it
const c = [xs.reduce((s, v) => s + v, 0) / xs.length, zs.reduce((s, v) => s + v, 0) / zs.length];
const gy = hf.heightAt(...c);
const [nx, nz] = geo.north;
const front = out[0], mid = [(out[0][0] + out[27][0]) / 2, (out[0][1] + out[27][1]) / 2]; // the middle's street face
const p = { x: mid[0] - nx * 8, y: 0, z: mid[1] - nz * 8 };
let hits = 0;
for (let i = 0; i < 60; i++) {
  p.x += nx * 0.4; p.z += nz * 0.4; p.y = hf.heightAt(p.x, p.z) + 0.2;
  if (cw.pushCylinder(p, 1.2, 1.6, 0.3)?.hit) hits++;
}
ok(hits > 10 && !inPoly(out, p.x, p.z), `the car does not get into the building (${hits} pushes)`);
const mc = [mid[0] + nx * 10, mid[1] + nz * 10], roofY = cw.groundHeight(mc[0], mc[1], 80);
ok(roofY > gy + 25, `the roof holds (${roofY.toFixed(1)} m vs ground ${gy.toFixed(1)})`);
ok(cw.raycast({ x: mc[0] - nx * 40, y: gy + 12, z: mc[1] - nz * 40 }, { x: nx, y: 0, z: nz }, 60) != null, 'a ray from the street meets the front');
ok(site.clear(...c) && site.clear(...front) && !site.clear(c[0] - nx * 60, c[1] - nz * 60), 'trees keep off the lot only');

console.log = log;
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
