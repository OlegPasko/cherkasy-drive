// Headless checks for the traffic area: lane network on the real map, a simulated two minutes around the centre,
// signals, player ram -> wreck -> sleep, dents, collision push-out, glb names vs the vehicle catalog.
//   node tests/traffic.test.mjs
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildLaneNetwork, signalPhase } from '../src/npc/lanes.js';
import { VTYPES, makeModels } from '../src/npc/vehicles.js';
import { createTrafficSimulation } from '../src/npc/traffic.js';

const root = new URL('../', import.meta.url);
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails++; };

const map = JSON.parse(readFileSync(new URL('public/assets/cherkasy/map.json', root)));
const net = buildLaneNetwork(map, (x, z) => 0.002 * x); // a gentle slope to exercise pitch
console.log('network', net.stats);
ok(net.links.length > 3000, `lane links ${net.links.length}`);
ok(net.links.every(L => Number.isFinite(L.ax + L.az + L.dx + L.dz + L.len) && L.len > 0), 'links finite, positive length');
ok(net.links.every(L => L.out.every(m => m.path.len > 0 && m.path.x.every(Number.isFinite))), 'move paths finite');
const sinks = net.links.filter(L => !L.out.length).length;
ok(sinks < net.links.length * 0.01, `links without a way on: ${sinks}`);
ok(net.signals.length > 20, `signal heads ${net.signals.length}`);
ok(net.links.some(L => L.bridge), 'bridge links flagged');
ok(buildLaneNetwork({ roads: [] }, null).links.length === 0, 'empty map -> empty network');
{ // one plan: axis 0 and axis 1 are never both green
  const ax = net.links.find(L => L.signal).axis, other = { o: ax.o, g: 1 - ax.g };
  let clash = 0, greens = 0;
  for (let t = 0; t < 96; t += 0.5) { const a = signalPhase(t, ax), b = signalPhase(t, other); if (a === 2) greens++; if (a > 0 && b > 0) clash++; }
  ok(clash === 0 && greens > 50, `signal axes exclusive (greens ${greens}, clashes ${clash})`);
}

// ---- simulation around Soborna square with fallback bodies (drawn into a scene without a renderer)
const scene = new THREE.Scene(), models = makeModels();
const sim = createTrafficSimulation({ scene, net, models, density: 0.8, hooks: { heightAt: (x, z) => 0.002 * x } });
const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 3000);
cam.position.set(0, 60, 80); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
const walkers = [];
sim.setPeds({ walkers });
const t0 = performance.now();
let maxMs = 0, minCars = Infinity, maxCars = 0;
const dt = 1 / 30;
for (let i = 0; i < 30 * 120; i++) {
  const a = performance.now();
  sim.update(dt, cam, i * dt);
  maxMs = Math.max(maxMs, performance.now() - a);
  if (i > 30 * 10) { minCars = Math.min(minCars, sim.cars().length); maxCars = Math.max(maxCars, sim.cars().length); }
}
const st = sim.stats();
console.log('stats', st, `avg ${((performance.now() - t0) / 3600).toFixed(2)} ms/frame, max ${maxMs.toFixed(1)} ms`);
const cars = sim.cars().filter(c => !c.parked);
ok(cars.length > 60, `live cars ${cars.length} (min ${minCars}, max ${maxCars})`);
ok(minCars > maxCars * 0.6, 'population stable');
ok(sim.cars().every(c => Number.isFinite(c.x + c.y + c.z + c.ry + c.pitch)), 'poses finite');
const moving = cars.filter(c => c.v > 1).length;
ok(moving > cars.length * 0.3, `moving ${moving}/${cars.length}`);
ok(st.granted > 100, `junction grants ${st.granted}`);
ok(st.drawn > 0 && st.lod0 + st.lod1 + st.lod2 === st.drawn, `drawn ${st.drawn}`);
// overlap check between live cars on the same lane
let overl = 0;
for (const L of net.links) for (let i = 1; i < L.cars.length; i++) if (L.cars[i - 1].s - L.cars[i].s < (L.cars[i - 1].len + L.cars[i].len) / 2 - 0.2) overl++;
ok(overl === 0, `no overlapping cars on a lane (${overl})`);

// ---- a walker steps onto the lane 14 m ahead of a moving car: the car stops short of them
{
  const c = sim.cars().filter(c => !c.parked && !c.mv && c.v > 3 && c.dist < 200 && c.L.len - c.s > 30)[0];
  const fx = Math.cos(c.ry), fz = -Math.sin(c.ry);
  walkers.push({ x: c.x + fx * (c.len / 2 + 14), z: c.z + fz * (c.len / 2 + 14), road: true });
  for (let i = 0; i < 30 * 6; i++) sim.update(dt, cam, 120 + i * dt);
  const gap = (walkers[0].x - c.x) * fx + (walkers[0].z - c.z) * fz - c.len / 2;
  ok(c.v < 0.3 && gap > 0.8 && gap < 6, `car yields to a walker on the road (gap ${gap.toFixed(1)} m, v ${c.v.toFixed(2)})`);
  walkers.length = 0;
}

// ---- ram: a heavy player box at 20 m/s into the nearest car
const target = cars.filter(c => c.dist < 150).sort((a, b) => a.dist - b.dist)[0];
sim.setPlayer(new THREE.Vector3(target.x, target.y, target.z), null, target.y);
sim.update(dt, cam, 200); // index it for collisions
const fx = Math.cos(target.ry), fz = -Math.sin(target.ry), rx = -fz, rz = fx; // hit it from its left side
const v = new THREE.Vector3(-rx * 20, 0, -rz * 20);
const q = { x: target.x + rx * (target.wid / 2 + 1.0), y: target.y, z: target.z + rz * (target.wid / 2 + 1.0), fx: -rx, fz: -rz, hl: 2.6, hw: 1.05, h: 1.8, v, mass: 12000 };
const r = sim.ram(q);
console.log('ram', { hits: r.hits, knocked: r.knocked, severity: r.severity.toFixed(2), dv: r.dv.toArray().map(n => n.toFixed(2)) });
ok(r.knocked === 1 && target.dead, 'rammed car becomes a wreck');
ok(r.dv.length() > 0 && r.dv.length() <= 0.6 * 20 + 1e-6, `player keeps most of its speed (dv ${r.dv.length().toFixed(2)})`);
const w = target.wreck;
ok(w && w.v.length() > 10, `wreck flies (${w.v.length().toFixed(1)} m/s)`);
ok(!!w.mm, 'strong hit dents the wreck (own mesh)');
ok(sim.knock(target) === null, 'no double knock');
const slow = sim.ram({ ...q, v: new THREE.Vector3(-rx * 1, 0, -rz * 1) });
ok(slow.knocked === 0, 'a slow touch does not knock');
for (let i = 0; i < 30 * 12; i++) sim.update(dt, cam, 201 + i * dt);
ok(w.sleep && Math.abs(w.p.y - w.ey - 0.002 * w.p.x) < 0.6, `wreck settles and sleeps (y ${w.p.y.toFixed(2)}, sleep ${w.sleep})`);
ok(Number.isFinite(w.q.x + w.q.w) && Math.abs(w.q.length() - 1) < 1e-3, 'wreck orientation normalised');

// ---- collision: a player standing inside a car footprint is pushed out; above the roof it is supported
const c2 = sim.cars().filter(c => !c.dead && c.dist < 140)[0];
if (c2) {
  sim.setPlayer(new THREE.Vector3(c2.x, c2.y, c2.z), null, c2.y); sim.update(0, cam, 215);
  const p = new THREE.Vector3(c2.x + 0.2, c2.y + 0.3, c2.z);
  const hit = sim.collideDynamic(p, 1, 1.3);
  ok(hit && hit.push.length() > 0.5 && !hit.grounded, 'inside a car: pushed out');
  const top = sim.collideDynamic(new THREE.Vector3(c2.x, c2.y + c2.h + 0.1, c2.z), 1, 1.3);
  ok(top && top.grounded && Math.abs(top.groundY - (c2.y + c2.h)) < 1e-6, 'on the roof: supported');
  ok(sim.collideDynamic(new THREE.Vector3(c2.x, c2.y + c2.h + 5, c2.z), 1, 1.3) === null, 'high above: no contact');
} else ok(false, 'no car for the collision test');

// ---- mission-style knock of a fake car record + dent
const fake = { type: 'suv2', len: 5.1, wid: 1.9, h: 1.97, color: [0.01, 0.01, 0.01], x: 10, z: 10, y: 0, ry: 0.3, v: 12, pitch: 0, gp: 0, adSeed: 0.37, parked: false, dead: false };
const fw = sim.knock(fake);
ok(fw && fw.v.length() > 11, 'knock accepts a mission car record');
const before = fw.mm ? null : 0;
sim.dent(fw, fw.p.x + 2, fw.p.y, fw.p.z, -1, 0, 0, sim.massOf(fake) * 12);
ok(fw.mm && before === 0, 'dent swaps in an own geometry copy');
ok(sim.massOf('bus') > 5 * sim.massOf('hatch'), `mass: bus ${sim.massOf('bus') | 0} kg, hatch ${sim.massOf('hatch') | 0} kg`);
const mm = sim.makeMesh('suv2', [0.01, 0.01, 0.01], 0.37);
ok(mm?.mesh?.isInstancedMesh && mm.g.attributes.position.count > 0, 'makeMesh -> standalone instanced mesh');
mm.dispose();

// ---- glb meshes match the catalog
for (const f of ['cars', 'big']) {
  const buf = readFileSync(new URL(`public/assets/vehicles/vehicles_${f}.glb`, root));
  const gl = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  const names = []; gl.scene.traverse(o => { if (o.isMesh) names.push(o.name); });
  const types = names.filter(n => !/_l[12]$/.test(n));
  ok(types.every(t => VTYPES[t] && names.includes(t + '_l1') && names.includes(t + '_l2')), `${f}.glb: ${types.join(' ')} with LODs`);
  const hasAttrs = gl.scene.getObjectByName(types[0]).geometry.attributes;
  ok(hasAttrs.uv1 && hasAttrs.color && hasAttrs.uv, `${f}.glb carries part ids and AO`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
