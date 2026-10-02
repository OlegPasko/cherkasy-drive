// Headless checks for ЖК «Перлина Дніпра» (src/world/cherkasy/perlyna.js): node tests/perlyna.test.mjs
// The maps' ring (places.js PERLYNA_RING) matches the module's outline; the lot is clear of the OSM buildings and the
// motor roads, and keeps off Героїв Дніпра; the build stays in its budget, is ~17 storeys tall and solid where the walls
// are, with the courtyard free.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// a canvas stub: the facade textures paint on a 2D context the test does not need to see
const ctx = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { buildPerlyna, PERLYNA_OUTLINE, toMap } = await import('../src/world/cherkasy/perlyna.js');
const { PERLYNA_RING, PLACES } = await import('../src/world/cherkasy/places.js');
const { createCollisionWorld } = await import('../src/world/collision.js');
const { inPoly } = await import('../src/world/cherkasy/geo.js');

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const ring = PERLYNA_OUTLINE.map(([a, b]) => toMap(a, b));
ok(ring.length * 2 === PERLYNA_RING.length && ring.every(([x, z], i) => Math.hypot(x - PERLYNA_RING[2 * i], z - PERLYNA_RING[2 * i + 1]) < 0.15),
  'places.js PERLYNA_RING matches the outline');
ok(PLACES.some((p) => p.id === 'perlyna' && p.kind === 'improved' && p.ring === PERLYNA_RING), 'listed in places.js as improved');

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
const blds = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const segD = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(ax + t * dx - px, az + t * dz - pz); };
const edges = ring.map((p, i) => [p, ring[(i + 1) % ring.length]]);
const distToRing = (x, z) => (inPoly(ring, x, z) ? -1 : Math.min(...edges.map(([p, q]) => segD(x, z, p[0], p[1], q[0], q[1]))));
let nearB = Infinity;
for (const b of blds) {
  for (let i = 0; i < b.p.length; i += 2) nearB = Math.min(nearB, distToRing(b.p[i], b.p[i + 1]));
  const pts = []; for (let i = 0; i < b.p.length; i += 2) pts.push([b.p[i], b.p[i + 1]]);
  if (ring.some(([x, z]) => inPoly(pts, x, z))) nearB = -1;
}
ok(nearB > 10, `no OSM building within 10 m of the block (nearest ${nearB.toFixed(1)} m)`);
let nearRoad = Infinity, nearHer = Infinity;
for (const r of map.roads) {
  if (r.k !== 'm') continue;
  for (let i = 0; i + 3 < r.p.length; i += 2) {
    const d = Math.min(...ring.map(([x, z]) => segD(x, z, r.p[i], r.p[i + 1], r.p[i + 2], r.p[i + 3])), ...[0, 0.5, 1].map((t) => distToRing(r.p[i] + (r.p[i + 2] - r.p[i]) * t, r.p[i + 1] + (r.p[i + 3] - r.p[i + 1]) * t)));
    nearRoad = Math.min(nearRoad, d - r.w / 2);
    if (/Героїв Дніпра/.test(r.n || '')) nearHer = Math.min(nearHer, d - r.w / 2);
  }
}
ok(nearRoad > 0.5, `no motor road through or at the walls (nearest kerb ${nearRoad.toFixed(1)} m; the courtyard's service way ends at it)`);
ok(nearHer > 15 && nearHer < 30, `Героїв Дніпра's kerb ${nearHer.toFixed(1)} m off the street face`);

const root = new THREE.Group(), S = createCollisionWorld({ cell: 24 }), edgesZ = [];
const out = buildPerlyna({ root, solids: S, zips: { edge: (...a) => edgesZ.push(a) }, heightAt: () => 30 });
ok(out && typeof out.update === 'function' && out.footprints?.length === 1, 'buildPerlyna returns update and a footprint');
let verts = 0, draws = 0, top = -Infinity;
root.traverse((o) => { if (o.geometry) { verts += o.geometry.attributes.position.count; draws++; o.geometry.computeBoundingBox(); top = Math.max(top, o.geometry.boundingBox.max.y); } });
ok(verts > 3000 && verts < 20000, `vertex budget: ${verts}`);
ok(draws <= 7, `draw calls: ${draws}`);
ok(top - 30 > 56 && top - 30 < 66, `17 storeys: roof at ${(top - 30).toFixed(1)} m over the ground`);
const [cx, cz] = toMap(14, 40), [yx, yz] = toMap(40, 75);
ok(S.inside(cx, 31, cz) && S.inside(cx, 80, cz), 'the walls are solid');
ok(!S.inside(yx, 31, yz), 'the courtyard is free');
ok(edgesZ.length >= 6, 'roof edges registered');
ok(out.clear(cx, cz) && !out.clear(...toMap(-20, 20)), 'clear() covers the lot, not the street');
out.update(0.016);

log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
