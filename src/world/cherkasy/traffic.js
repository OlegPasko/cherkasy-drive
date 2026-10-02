// Cherkasy street traffic: the lane network of the OSM carriageways (src/npc/lanes.js), the traffic simulation with
// wrecks (src/npc/traffic.js, wrecks.js), signal posts at the big junctions, and the local touches: the Cherkasy
// vehicle mix, route preferences, trolleybus poles, flying wrecks that run people over.
//
//   buildCherkasyTraffic({ scene, map, ground, density = 0.55, deckAt? }) -> Promise<api>
//     scene: Object3D for the meshes; map: map.json; ground: { heightAt(x, z) }; deckAt(x, z) -> y | null: the
//     hand-built bridge decks (npc/lanes.js opts.deckAt), so bridge lanes ride them
//   api = { net (alias roads), sim, models, phase(axis) -> 2 go / 1 amber / 0 stop now,
//     collideDynamic(pos, r, h), setPlayer(pos, vel?, groundY?), setPeds(people), carNear(x, z, r) -> bool,
//     attachSolids(collision, groundHeight)  wrecks bounce off buildings and land on roofs / the ground,
//     update(dt, camera), stats() }
//   The player is also polled from window.__game.player (position / object.position) when nobody calls setPlayer.
//   Local mix (dressCar): Ukrainian paint (lots of silver / grey / white / black, some cherry and dark blue), yellow /
//   white marshrutkas and the route buses (half 12 m city buses, half yellow Bogdan midibuses) in the curb lane of the
//   main roads, blue trolleybuses under the wires (`tw`),
//   Lanos-style cabs and hybrid / minivan taxis, retro Zhiguli / Niva paint, the odd bright car.
import * as THREE from 'three';
import { buildLaneNetwork, signalPhase } from '../../npc/lanes.js';
import { loadTrafficVehicles, VTYPES } from '../../npc/vehicles.js';
import { createTrafficSimulation, createSignalProps } from '../../npc/traffic.js';
import { nightFactor } from '../../render/daylight.js';

const lin = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255].map((s) => Math.pow(s / 255, 2.2));
const PAINT = [0xd9d9d6, 0xe4e4e0, 0xcfd0cc, 0xa7abaf, 0x9a9ea2, 0xb8babc, 0x85898d, 0x5d6064, 0x44474b, 0x2a2c30, 0x121314, 0x0f1012, 0x17181a,
  0x1d2d4c, 0x27416b, 0x3a5a86, 0x6e1a1a, 0x8a1f1f, 0x5a1624, 0xa8382c, 0x9b8f75, 0x2f4531, 0x4c6146, 0x6f7f8a, 0x3f2f26].map(lin);
const MARSH = [0xf0c419, 0xe9b90e, 0xf2f1ec, 0xe8e6de, 0xf4d23a].map(lin);
const BUSC = [0xeae7dc, 0xdcdad2, 0x3f7fbf].map(lin);
const BOGDAN = [0xf5bc00, 0xf2b705, 0xf7c414].map(lin); // the yellow Cherkasy-built Bogdans
const TROLLEY = [0x2a64b0, 0x2f70c0, 0x1f5a9e, 0xe0c020].map(lin);
const VANW = [0xe4e4e0, 0xd8d8d4, 0xcfd0cc, 0xb8babc, 0xe4e4e0, 0x9a9ea2, 0x27416b, 0x5a1624].map(lin);
const BRIGHT = [0xd9661f, 0xd8a526, 0x7fa83a, 0x5f93c9, 0x8a6a3c, 0x4a2f5e, 0xb8322a, 0x2f8f8a].map(lin);
const TAXIC = [0xecece8, 0xe8b820, 0xd9d9d6, 0xecece8, 0x141516, 0xe8b820].map(lin);
const TAXIY = [0xe8b820, 0xf0c419, 0xe8b820, 0xecece8].map(lin);
const RETRO = [0x7a1420, 0x5b6b3a, 0x3a1f3f, 0x6f9fc8, 0xc9b98f, 0xeeeeea, 0xc8641e, 0x2f5f4f].map(lin);
const from = (list, u) => list[Math.floor(u * list.length) % list.length];
// [cumulative share, type] of the private-car mix; past the table: 'tour' / 'truck' on main roads, else a hatch
const MIX = [[0.12, 'hatch'], [0.24, 'sedan'], [0.35, 'sedan2'], [0.47, 'cross'], [0.54, 'suv'], [0.58, 'suv2'], [0.61, 'pickup'],
  [0.69, 'taxi'], [0.75, 'taxi_hy'], [0.8, 'taxi_gr'], [0.84, 'taxi_mv'], [0.92, 'van']];

export function dressCar(c, L) {
  const r = c.rng(), r2 = c.rng(), curb = L.lane === L.nl - 1, trunkRoad = L.main && L.cls !== 'tertiary';
  let type = null, color = from(PAINT, r2), tag = 0;
  if (L.tw && curb && r < 0.05) { type = 'bus'; tag = 2; color = from(TROLLEY, r2); }
  else if (trunkRoad && curb && r < 0.11) { type = 'van'; tag = 1; color = from(MARSH, r2); }
  else if (trunkRoad && curb && r < 0.122) { type = 'bus'; tag = 1; color = from(BUSC, r2); }
  else if (trunkRoad && curb && r < 0.134) { type = 'midi'; tag = 1; color = from(BOGDAN, r2); }
  else {
    const q = c.rng();
    type = MIX.find(([p]) => q < p)?.[1] ?? (L.main ? (q < 0.935 ? 'tour' : 'truck') : 'hatch');
    if (type === 'van') color = from(VANW, r2);
    else if (type === 'taxi') color = from(TAXIY, r2);
    else if (type === 'taxi_hy' || type === 'taxi_mv') color = from(TAXIC, r2);
    else if ((type === 'sedan2' || type === 'suv' || type === 'taxi_gr') && c.rng() < 0.35) color = from(RETRO, c.rng());
    else if (type !== 'truck' && type !== 'tour' && c.rng() < 0.09) color = from(BRIGHT, c.rng());
  }
  const T = VTYPES[type] ?? VTYPES.sedan;
  Object.assign(c, { type: VTYPES[type] ? type : 'sedan', len: T.len, wid: T.wid, h: T.h, color, tag });
  c.v0 = (L.main ? 12.5 : 8.5) - (T.big || tag ? 1.5 : 0) + c.rng() * 3;
}
// turn preferences: trolleybuses keep under the wires, buses / marshrutkas and long vehicles to the main roads
export function routeWeight(c, L, mv) {
  const next = mv.link;
  if (c.tag === 2) return next.tw ? 1 : 0.002;
  if (c.tag === 1) return next.main ? 1 : 0.01;
  if (c.len > 7) return next.main ? 1 : 0.05;
  return L.main && !next.main ? 0.35 : 1;
}

export async function buildCherkasyTraffic({ scene, map, ground, density = 0.55, deckAt = null }) {
  const t0 = performance.now();
  const heightAt = (x, z) => ground.heightAt(x, z);
  const modelsP = loadTrafficVehicles();
  const net = buildLaneNetwork(map, heightAt, { deckAt });
  const t1 = performance.now();
  const models = await modelsP;
  const sim = createTrafficSimulation({ scene, net, models, phase: signalPhase, density, hooks: { dress: dressCar, route: routeWeight, heightAt } });
  let clock = 0;
  const phase = (ax) => signalPhase(clock, ax);
  const signals = createSignalProps(scene, net.signals, phase);
  const poles = trolleyPoles(scene);
  let people = null, playerSet = false;
  const pp = new THREE.Vector3(), near = [];
  const ms = { net: Math.round(t1 - t0), total: 0 };

  const api = {
    net, roads: net, sim, models, phase,
    collideDynamic: (pos, r, h) => sim.collideDynamic(pos, r, h),
    setPlayer(pos, vel = null, gy) { playerSet = true; sim.setPlayer(pos, vel, Number.isFinite(gy) ? gy : pos ? heightAt(pos.x, pos.z) : undefined); },
    setPeds(p) { people = p || null; sim.setPeds(p); },
    carNear(x, z, r) {
      for (const c of sim.queryCars(x, z, r, near)) if ((c.x - x) ** 2 + (c.z - z) ** 2 < r * r) return true;
      return false;
    },
    attachSolids(collision, groundHeight) {
      const probe = { x: 0, y: 0, z: 0 }, out = {};
      sim.setSolid({
        ground: (x, z, y) => groundHeight(x, z, y),
        push(x, y, z, r, h) {
          probe.x = x; probe.y = y; probe.z = z;
          const c = collision.pushCylinder(probe, r, h, 0.3, out);
          return c && c.hit ? { dx: probe.x - x, dz: probe.z - z, nx: c.nx, nz: c.nz } : null;
        },
      });
    },
    stats: () => ({ ...sim.stats(), net: net.stats, ms }),
    update(dt, camera) {
      if (!camera) return;
      dt = Math.min(dt, 0.1); clock += dt;
      if (!playerSet) { // nobody feeds the player in: poll the game context like the legacy world did
        const P = globalThis.window?.__game?.player, pos = P?.position || P?.object?.position;
        if (pos) { pp.copy(pos); sim.setPlayer(pp, null, heightAt(pp.x, pp.z)); }
      }
      models?.setNight?.(nightFactor());
      sim.update(dt, camera, clock);
      signals.update();
      // flying wrecks run people over too
      if (people?.hitBox) for (const w of sim.wrecks) {
        if (w.sleep || w.v.lengthSq() < 16) continue;
        people.hitBox({ x: w.p.x, z: w.p.z, fx: w.fx, fz: w.fz, hl: w.fl, hw: w.fw, y0: w.p.y - w.ey, y1: w.p.y + w.ey, vx: w.v.x, vy: w.v.y, vz: w.v.z });
      }
      poles.update(sim.cars(), camera);
    },
  };
  ms.total = Math.round(performance.now() - t0);
  if (globalThis.window) window.__cherkasyTraffic = api; // debug handle (legacy missions look for it)
  return api;
}

// trolleybus current collectors: two thin rods raked back from the roof (instanced, near buses only)
function trolleyPoles(scene) {
  const MAX = 128, rod = new THREE.BoxGeometry(6.2, 0.07, 0.07).translate(3.1, 0, 0);
  const mesh = new THREE.InstancedMesh(rod, new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.6, metalness: 0.4 }), MAX);
  Object.assign(mesh, { name: 'trolley-poles', frustumCulled: false, count: 0, castShadow: true });
  scene.add(mesh);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YZX'), P = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
  const roof = VTYPES.bus.h + 0.02;
  return {
    update(cars, camera) {
      let n = 0;
      const cp = camera.position;
      for (const c of cars) {
        if (c.tag !== 2 || c.dead || n >= MAX) continue;
        if ((c.x - cp.x) ** 2 + (c.z - cp.z) ** 2 > 350 * 350) continue;
        const fx = Math.cos(c.ry), fz = -Math.sin(c.ry), tilt = (c.pitch || 0) + (c.gp || 0);
        for (const side of [-0.35, 0.35]) {
          // base just behind the roof centre, raked ~22 degrees up and back (less the bus's own pitch)
          P.set(c.x - fx * 0.5 - fz * side, c.y + roof - Math.sin(tilt) * 0.5, c.z - fz * 0.5 + fx * side);
          Q.setFromEuler(E.set(0, c.ry + Math.PI, 0.38 - tilt));
          mesh.setMatrixAt(n++, M.compose(P, Q, ONE));
        }
      }
      mesh.count = n; mesh.visible = n > 0;
      if (n) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
