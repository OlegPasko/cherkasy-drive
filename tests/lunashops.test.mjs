// Issue #34: the one-storey shop annex at Generala Momota 1 (АТБ, Прем'єр) replaces the nine-storey slab the city
// extrusion made of OSM way 1041448576; the car park in front is open to drive on and clear of trees.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildLunaShops, LUNASHOPS_SKIP } from '../src/world/cherkasy/lunashops.js';
import { createCollisionWorld } from '../src/world/collision.js';
import { PLACES } from '../src/world/cherkasy/places.js';

const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx, style: {} }) };
const map = { buildings: JSON.parse(fs.readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url))) };
const root = new THREE.Group(), solids = createCollisionWorld({ terrain: () => 30 });
const ground = { root: new THREE.Group() };
ground.root.add(Object.assign(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ name: 'cherkasy-ground' }))));
const site = buildLunaShops({ root, map, solids, heightAt: () => 30, zips: { edge() {} }, ground });
assert.deepEqual([...LUNASHOPS_SKIP], [1041448576, 160525375]);
assert.equal(site.footprints.length, 1);
assert.ok(site.footprints[0].h < 7, `one storey, not nine (${site.footprints[0].h.toFixed(1)} m)`);
// the annex is solid, and a car in the lot in front of АТБ (OSM node 2065378865 lies in the annex) stands on open ground
const annex = [-1180, -3022], lot = [-1200, -3000];
assert.ok(solids.groundHeight(...annex, 40) > 34, 'the annex has collision');
assert.equal(solids.groundHeight(...lot, 40), 30, 'no invisible wall in the car park');
assert.ok(site.clear(...lot) && site.clear(...annex), 'no generated trees in the lot or the building');
assert.ok(!site.clear(-1250, -2990), 'the lawns beyond the lot keep their trees');
// issue #37: the passage past the kiosk to Генерала Момота (where OSM 160525375 stood)
for (const [x, z, what] of [[-1152.8, -2988.4, 'the passage']]) {
  assert.ok(site.clear(x, z), `${what} is paved and clear of trees`);
  assert.equal(solids.groundHeight(x, z, 40), 30, `${what} has no wall`);
}
assert.ok(site.parked.length >= 10, `cars stand in the bays (${site.parked.length})`);
assert.ok(PLACES.some((p) => p.id === 'lunashops' && p.kind === 'improved' && p.issue === 34), 'an improved place on the maps');
let vertices = 0, lot2 = false;
root.traverse((m) => { if (m.isMesh) { const p = m.geometry.attributes.position.array; vertices += p.length / 3; assert.ok(p.every(Number.isFinite)); if (m.name === 'lunashops-lot') lot2 = true; } });
assert.ok(lot2, 'the car park is laid in the ground material');
assert.ok(vertices < 12000, `${vertices} vertices`);
site.update();
console.log(`lunashops: all ok (${vertices} vertices, ${site.parked.length} parked)`);
