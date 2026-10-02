// Headless checks for the sailing yacht (src/world/cherkasy/yacht.js): node tests/yacht.test.mjs
// It builds within its vertex budget with outward-facing hull normals, keeps to its loop at the set pace (wall clock),
// stays over the river (the DEM under the loop and 80 m round it is below the water datum), trims its boom to leeward,
// lights up at night only, and its collide() pushes a body out of the hull and the mast and leaves a far one alone.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildYacht } from '../src/world/cherkasy/yacht.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { WATER_Y } from '../src/world/water.js';

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const root = new THREE.Group();
const realNow = Date.now;
let clock = 1.7e12;
Date.now = () => clock;
const y = buildYacht({ root });
ok(y && typeof y.update === 'function' && typeof y.collide === 'function', 'buildYacht returns update and collide');

let verts = 0, draws = 0;
root.traverse((o) => { if (o.geometry) { verts += o.geometry.attributes.position.count; draws++; } });
ok(verts > 2500 && verts < 7000, `vertex budget: ${verts} (3–6k wanted)`);
ok(draws <= 6, `draw calls: ${draws}`);

// hull normals face out: the starboard topsides amidships point +z, the deck up
const hull = root.getObjectByName('yacht-hull').geometry, P = hull.attributes.position, N = hull.attributes.normal;
let side = 0, up = 0, aft = 0;
for (let i = 0; i < P.count; i++) {
  if (Math.abs(P.getX(i)) < 1 && P.getZ(i) > 1.4 && P.getY(i) > 0.3 && P.getY(i) < 0.9) side += N.getZ(i) > 0.5 ? 1 : -1;
  if (P.getX(i) < -5.55 && Math.abs(P.getZ(i)) < 0.5 && P.getY(i) > 0.3 && P.getY(i) < 1.0) aft += N.getX(i) < -0.8 ? 1 : -1;
  if (Math.abs(P.getX(i)) < 1 && Math.abs(P.getZ(i)) < 0.3 && P.getY(i) > 1.0 && P.getY(i) < 1.2) up += N.getY(i) > 0.8 ? 1 : -1;
}
ok(side > 0, `hull sides face outward (${side})`);
ok(up > 0, `deck faces up (${up})`);
ok(aft > 0, `transom faces aft (${aft})`);

// pace: 10 s of wall clock moves it ~25 m along a smooth line
y.update(0.016, null);
const a = { ...y.yacht };
clock += 10000; y.update(0.016, null);
const b = { ...y.yacht }, step = Math.hypot(b.x - a.x, b.z - a.z);
ok(step > 23 && step < 25.5, `2.5 m/s on the wall clock: ${step.toFixed(2)} m in 10 s`);
const g = root.getObjectByName('yacht');
ok(Math.abs(g.position.y - WATER_Y) < 0.2, 'floats at the water datum');

// the whole loop over the river: the DEM under it and 80 m round it is below the water surface
const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const hf = createHeightField(map, dem);
ok(hf.heightAt(700, -185) > WATER_Y + 1, 'the DEM test means something: the Rose Valley is dry');
let dry = 0, maxHeel = 0, boomSides = new Set(), prevYaw = null, maxTurn = 0;
for (let s = 0; s < 900; s++) { // a whole lap at 1 s steps
  clock += 1000;
  for (let k = 0; k < 4; k++) y.update(0.25, null);
  const { x, z, yaw } = y.yacht;
  for (let r = 0; r <= 80; r += 40) for (let q = 0; q < 8; q++) if (hf.heightAt(x + Math.cos(q * 0.785) * r, z + Math.sin(q * 0.785) * r) > WATER_Y) dry++;
  maxHeel = Math.max(maxHeel, Math.abs(g.rotation.x));
  if (prevYaw !== null) maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(yaw - prevYaw), Math.cos(yaw - prevYaw))));
  prevYaw = yaw;
  boomSides.add(Math.sign(root.getObjectByName('yacht-sails').geometry.attributes.position.getZ(9))); // the main's clew: the boom end
}
ok(dry === 0, `loop stays over water with 80 m to spare (${dry} dry samples)`);
ok(maxHeel > 0.03 && maxHeel < 0.16, `heels a few degrees: max ${(maxHeel * 180 / Math.PI).toFixed(1)} deg`);
ok(boomSides.has(1) && boomSides.has(-1), 'the boom goes over to the other side round the loop (tack / gybe)');
ok(maxTurn < 0.06, `turns smoothly: max ${(maxTurn * 180 / Math.PI).toFixed(2)} deg per second`);

// nav lights: off by day (no daylight system in the test: nightK = 0)
ok(!root.getObjectByName('yacht-lights').visible, 'nav lights off by day');

// collision: a body on the hull's side is pushed out sideways, one by the mast too, one 30 m off is left alone
const { x, z, yaw } = y.yacht, fx = Math.cos(yaw), fz = -Math.sin(yaw), sx = -fz, sz = fx; // starboard = (sin yaw, cos yaw)
const body = (lx, lz, yy = WATER_Y + 0.2) => new THREE.Vector3(x + fx * lx + sx * lz, yy, z + fz * lx + sz * lz);
const hit = y.collide(body(0, 1.5), 1, 1.3);
ok(hit && hit.depth > 0.5 && hit.push.x * sx + hit.push.z * sz > 0, 'a body against the starboard side is pushed out to starboard');
const mast = y.collide(body(1.0, 0.5, WATER_Y + 6), 1, 1.3);
ok(mast && mast.depth > 0.3, 'a body flying into the mast is pushed off it');
ok(y.collide(body(30, 0), 1, 1.3) === null, 'nothing 30 m off');
ok(y.collide(body(0, 0, WATER_Y + 20), 1, 1.3) === null, 'nothing above the masthead');

Date.now = realNow;
log(fails ? `\n${fails} FAILED` : '\nall yacht checks passed');
process.exit(fails ? 1 : 0);
