// Headless checks for the parked cars on the ordinary car parks (src/world/cherkasy/carparks.js + the lot streaming
// in src/npc/traffic.js): map.json carries the open-air lots; every stall lies inside its lot, off the buildings and
// the road carriageways / footways, with an aisle; the layout is deterministic; the fill is 50–85 %; the sim streams
// the cars by distance and keeps the live count under its budget, refreshes cheaply with every lot registered, and
// drops a lot's cars once the camera has gone.
//   node tests/carparks.test.mjs
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildCarParks, layoutBays } from '../src/world/cherkasy/carparks.js';
import { footprintRaster } from '../src/world/cherkasy/greenery.js';
import { ringPts, inPoly } from '../src/world/cherkasy/geo.js';
import { buildLaneNetwork } from '../src/npc/lanes.js';
import { makeModels } from '../src/npc/vehicles.js';
import { createTrafficSimulation } from '../src/npc/traffic.js';

const root = new URL('../', import.meta.url);
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails++; };

const map = JSON.parse(readFileSync(new URL('public/assets/cherkasy/map.json', root)));
map.buildings = JSON.parse(readFileSync(new URL('public/assets/cherkasy/map_buildings.json', root)));
ok(Array.isArray(map.parking) && map.parking.length > 300, `map.json parking lots: ${map.parking?.length}`);
const R = map.region;
ok(map.parking.every((l) => { const P = ringPts(l.p); const cx = P.reduce((s, p) => s + p[0], 0) / P.length, cz = P.reduce((s, p) => s + p[1], 0) / P.length; return cx > R.x0 - 60 && cx < R.x1 + 60 && cz > R.z0 - 60 && cz < R.z1 + 60; }), 'lots inside the map region');

const occ = footprintRaster(map.buildings.map((b) => ({ poly: ringPts(b.p) })), R);
const t0 = performance.now();
const cp = buildCarParks({ map, occ, heightAt: () => 0 });
const tBuild = performance.now() - t0;
ok(tBuild < 30, `buildCarParks (lazy) at load: ${tBuild.toFixed(1)} ms`);
let worst = 0;
const t1 = performance.now();
for (const L of cp.lots) { const a = performance.now(); cp.layout(L); worst = Math.max(worst, performance.now() - a); }
const tAll = performance.now() - t1, st = cp.stats();
console.log('stats', st, `all lots ${tAll.toFixed(0)} ms, worst lot ${worst.toFixed(1)} ms`);
ok(st.bays > 3000, `bays laid out: ${st.bays} over ${st.lots} lots`);
ok(st.spots / st.bays > 0.5 && st.spots / st.bays < 0.85, `taken share ${(st.spots / st.bays).toFixed(2)}`);
ok(worst < 40, `worst lot layout ${worst.toFixed(1)} ms`);

// every stall inside its lot, off buildings and roads
const roadsNear = (x, z) => map.roads.some((r) => { const p = r.p, hw = r.w / 2; for (let k = 0; k + 3 < p.length; k += 2) {
  const ax = p[k], az = p[k + 1], dx = p[k + 2] - ax, dz = p[k + 3] - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  if ((ax + dx * t - x) ** 2 + (az + dz * t - z) ** 2 < hw * hw) return true; } return false; });
let outside = 0, onBld = 0, onRoad = 0, checked = 0, overlap = 0;
const sample = cp.lots.filter((_, i) => i % 4 === 0);
for (const L of sample) {
  const { bays } = cp.layout(L);
  for (const b of bays) {
    const vx = -b.uz, vz = b.ux;
    for (const [a, c] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0, 0]]) {
      const x = b.x + b.ux * a * b.w + vx * c * b.d, z = b.z + b.uz * a * b.w + vz * c * b.d;
      checked++;
      if (!inPoly(L.P, x, z)) outside++;
      if (occ.get(x, z) === 1) onBld++;
      if (roadsNear(x, z)) onRoad++;
    }
  }
  for (let i = 0; i < bays.length; i++) for (let j = i + 1; j < bays.length; j++) {
    const p = bays[i], q = bays[j];
    const dx = q.x - p.x, dz = q.z - p.z, du = Math.abs(dx * p.ux + dz * p.uz), dv = Math.abs(-dx * p.uz + dz * p.ux);
    if (du < (p.w + q.w) / 2 - 0.05 && dv < (p.d + q.d) / 2 - 0.05) overlap++;
  }
}
ok(checked > 2000 && outside === 0, `stall points outside their lot: ${outside} / ${checked}`);
ok(onBld === 0, `stall points on buildings: ${onBld}`);
ok(onRoad === 0, `stall points on roads: ${onRoad}`);
ok(overlap === 0, `overlapping stalls: ${overlap}`);

// a plain rectangle: perpendicular rows with an aisle between the back-to-back pairs
{
  const P = [[0, 0], [40, 0], [40, 30], [0, 30]];
  const bays = layoutBays(P, (x, z) => inPoly(P, x, z));
  const vs = [...new Set(bays.map((b) => Math.round((-b.uz * b.x + b.ux * b.z) * 2) / 2))].sort((a, b) => a - b);
  const gaps = vs.slice(1).map((v, i) => v - vs[i]);
  ok(bays.length >= 40 && bays.every((b) => b.w === 2.5 && b.d === 5), `40 x 30 m lot: ${bays.length} perpendicular stalls in ${vs.length} rows`);
  ok(gaps.some((g) => g >= 10.9), `an aisle between rows (row gaps ${gaps.join(', ')})`);
  const strip = [[0, 0], [60, 0], [60, 3.4], [0, 3.4]];
  const pb = layoutBays(strip, (x, z) => inPoly(strip, x, z));
  ok(pb.length >= 8 && pb.every((b) => b.w === 6), `a 3.4 m strip gets parallel bays: ${pb.length}`);
}

// a site's own spots or its own kept-empty lot (Ekvator's drift lot) take the lots they lie in
{
  const L = cp.lots[5], drift = cp.lots.find((l) => l.id === 807957943);
  const cpS = buildCarParks({ map, occ, sites: [{ parked: [[L.P[0][0] * 0.5 + L.x * 0.5, L.P[0][1] * 0.5 + L.z * 0.5, 0]] }, { lot: { ring: drift.P } }] });
  ok(!cpS.lots.some((l) => l.id === L.id || l.id === drift.id) && cpS.lots.length === cp.lots.length - 2, `site lots skipped (${cp.lots.length} -> ${cpS.lots.length})`);
}

// deterministic
{
  const cp2 = buildCarParks({ map, occ, heightAt: () => 0 });
  const a = JSON.stringify(cp.lots.slice(0, 80).map((L) => L.spots())), b = JSON.stringify(cp2.lots.slice(0, 80).map((L) => L.spots()));
  ok(a === b, 'same spots on a second build');
}

// streaming: all lots registered, a camera flight across the city keeps the live lot cars bounded
{
  const net = buildLaneNetwork(map, () => 0);
  const scene = new THREE.Scene();
  const sim = createTrafficSimulation({ scene, net, models: makeModels(), density: 0.5, hooks: { heightAt: () => 0 } });
  const cp3 = buildCarParks({ map, occ, heightAt: () => 0 });
  sim.addParkingLots(cp3.lots);
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 3000);
  const at = (x, z) => { cam.position.set(x, 80, z); cam.lookAt(x + 50, 0, z); cam.updateMatrixWorld(); };
  let maxLive = 0, maxRefresh = 0;
  const path = [[0, 0], [-600, 400], [-1500, 900], [-2500, 1500], [-3200, 2300], [-1000, -1200], [0, 0]];
  for (const [x, z] of path) {
    at(x, z);
    for (let i = 0; i < 40; i++) {
      const a = performance.now(); sim.update(1 / 30, cam, i / 30); const d = performance.now() - a;
      if (i % 15 === 0) maxRefresh = Math.max(maxRefresh, d);
      const s = sim.stats(); maxLive = Math.max(maxLive, s.parkedLot);
    }
  }
  const s = sim.stats();
  console.log('stream', { lots: s.lots, liveLots: s.liveLots, parkedLot: s.parkedLot, lotSpots: s.lotSpots, maxLive, laidOut: cp3.stats().laidOut });
  ok(s.lots === cp3.lots.length, `lots registered: ${s.lots}`);
  ok(maxLive > 30 && maxLive <= 900, `live lot cars bounded: max ${maxLive} (budget 900)`);
  ok(cp3.stats().laidOut < cp3.lots.length * 0.8, `only lots near the path laid out: ${cp3.stats().laidOut} / ${cp3.lots.length}`);
  // far away: everything dropped
  at(-4500, 5600); for (let i = 0; i < 20; i++) sim.update(1 / 30, cam, i / 30);
  const far = sim.stats(), nearLots = cp3.lots.filter((L) => Math.hypot(L.x + 4500, L.z - 5600) - L.r < 500).length;
  ok(far.liveLots <= nearLots, `lots live after moving away: ${far.liveLots} (lots in reach there: ${nearLots})`);
  // quality: the low level's reach and budget
  sim.setDrawDistance(350, 0.7); at(0, 0);
  let lowMax = 0; for (let i = 0; i < 40; i++) { sim.update(1 / 30, cam, i / 30); lowMax = Math.max(lowMax, sim.stats().parkedLot); }
  ok(sim.stats().parkReach <= 211 && lowMax <= 360, `low quality: reach ${sim.stats().parkReach} m, live ${lowMax} (budget 360)`);
  // a shrinking budget trims the live cars, a growing one finishes the lots it cut short
  sim.setDrawDistance(700, 1); at(0, 0); for (let i = 0; i < 20; i++) sim.update(1 / 30, cam, i / 30);
  const full = sim.stats().parkedLot;
  sim.setParkReach(420, 20); for (let i = 0; i < 20; i++) sim.update(1 / 30, cam, i / 30);
  const cut = sim.stats().parkedLot, cutCars = sim.cars().filter((c) => c.parked).length;
  sim.setParkReach(420, 900); for (let i = 0; i < 20; i++) sim.update(1 / 30, cam, i / 30);
  ok(full > 40 && cut <= 20 && sim.stats().parkedLot === full, `budget 900 -> 20 -> 900: ${full} -> ${cut} (cars ${cutCars}) -> ${sim.stats().parkedLot}`);
  // the same lot gets the same cars when it streams back in
  sim.setDrawDistance(700, 1); at(0, 0); for (let i = 0; i < 20; i++) sim.update(1 / 30, cam, i / 30);
  const snap = () => sim.cars().filter((c) => c.parked && c.L === null).map((c) => `${c.type}${c.x.toFixed(1)}`).sort().join();
  const A = snap(); at(-3000, 3000); for (let i = 0; i < 20; i++) sim.update(1 / 30, cam, i / 30);
  at(0, 0); for (let i = 0; i < 20; i++) sim.update(1 / 30, cam, i / 30);
  ok(A.length > 0 && snap() === A, 'a lot streams back in with the same cars');
}

console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
