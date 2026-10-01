// Street traffic simulation on the lane network (lanes.js): streaming around the camera, car following, junction
// reservations, signals, yielding to people on the carriageway, parked cars, player collision, wrecks (wrecks.js).
//   createTrafficSimulation({ scene, net, models?, phase?, hooks?, density?, radius?, maxCars?, parked? }) -> sim
//     net: buildLaneNetwork() result; models: loadTrafficVehicles() result (null = headless, nothing drawn)
//     phase(t, axis) -> 2 go / 1 amber / 0 stop (default net.phase); hooks: { dress(car, link), route(car, link, move)
//     -> weight, heightAt(x, z), obstacle(car) -> gap m | null }
//   sim.update(dt, camera, time?)             camera: THREE camera (null = nothing happens); time: shared signal clock
//   sim.links, sim.nodes, sim.VTYPES, sim.cars() -> live car records (incl. parked), sim.wrecks
//     car: { id, type, len, wid, h, color, x, y, z, ry (fx = cos ry, fz = -sin ry), pitch, gp, v, dead, parked, adSeed }
//   sim.setDensity(k), sim.setPlayer(pos, vel|null, groundY), sim.setPeds(api with walkers[{ x, z, road }])
//   sim.addParkingSpots([[x, z, ry], ...]) cars standing on car parks (knockable; refilled out of sight once emptied)
//   sim.collideDynamic(pos, radius, height) -> null | { push: Vector3, normal: Vector3, depth, grounded, groundY, vel }
//   sim.ram(q), sim.knock(car, dv?, spin?), sim.dent(w, px, py, pz, dx, dy, dz, J), sim.massOf(car | type),
//   sim.makeMesh(type, colour, seed) (added to the traffic scene), sim.setSolid(s), sim.setDebris(d)
//   sim.stats() -> numeric counters; sim.ms { sim, draw } last frame timings
//   createSignalProps(scene, signals, phaseAt(axis)) -> { update() } posts with 3-lamp heads that follow the phase
import * as THREE from 'three';
import { pathAt } from './lanes.js';
import { VTYPES, createFleet, AD_URBAN, URBAN_BLUE, adSeedFor } from './vehicles.js';
import { createWrecks, pushBox } from './wrecks.js';

const PER_M = 0.03;            // cars per metre of lane at density 1 and road-class weight 1
const A_MAX = 1.8, B_COMF = 3.2, B_MAX = 8, HEADWAY = 1.5, GAP0 = 2.2;
const LOOK = 70;               // how far ahead a car looks for leaders / stop lines (m)
const TURN_V = { S: 99, R: 5.5, L: 6.5, U: 3.2 };
const NEAR = 160, MID = 320;   // update every frame / every 2nd / every 4th beyond
const COLL_R = 140;            // cars within this of the player or camera are indexed for collisions

const lin = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255].map(s => Math.pow(s / 255, 2.2));
const PAINT = [0xd9d9d6, 0xe4e4e0, 0xcfd0cc, 0xa7abaf, 0x9a9ea2, 0xb8babc, 0x85898d, 0x5d6064, 0x44474b, 0x2a2c30, 0x121314, 0x17181a,
  0x1d2d4c, 0x27416b, 0x3a5a86, 0x6e1a1a, 0x8a1f1f, 0x5a1624, 0xa8382c, 0x9b8f75, 0x2f4531, 0x4c6146, 0x6f7f8a, 0x3f2f26].map(lin);
const MARSH = [0xf0c419, 0xe9b90e, 0xf2f1ec, 0xe8e6de].map(lin), BUSES = [0xeae7dc, 0xdcdad2, 0x3f7fbf].map(lin);
const URBAN = lin(parseInt(URBAN_BLUE.slice(1), 16));
const BOGDAN = [0xf5bc00, 0xf2b705, 0xf7c414].map(lin); // the yellow Cherkasy-built Bogdans
const TROLLEY = [0x2a64b0, 0x2f70c0, 0x1f5a9e, 0xe0c020].map(lin), LIGHT = [0xe4e4e0, 0xd8d8d4, 0xcfd0cc, 0xb8babc, 0x9a9ea2].map(lin);
const CAB = [0xe8b820, 0xf0c419, 0xecece8].map(lin), BRIGHT = [0xd9661f, 0xd8a526, 0x7fa83a, 0x5f93c9, 0x8a6a3c, 0xb8322a].map(lin);

function rngOf(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 >>> 0) / 4294967296); }
const pick = (a, r) => a[Math.floor(r * a.length) % a.length];

// default Ukrainian street mix: mostly private cars; marshrutkas and buses in the curb lane of the main roads, the
// buses half 12 m city buses, half yellow Bogdan midibuses; a quarter of the 12 m buses (trolleys too) are URBAN's paid ones
export function defaultDress(c, L) {
  const r = c.rng(), r2 = c.rng(), curb = L.lane === L.nl - 1;
  let type, color = pick(PAINT, r2), tag = 0;
  if (L.tw && curb && r < 0.05) { type = 'bus'; tag = 2; color = pick(TROLLEY, r2); }
  else if (L.main && curb && r < 0.11) { type = 'van'; tag = 1; color = pick(MARSH, r2); }
  else if (L.main && curb && r < 0.122) { type = 'bus'; tag = 1; color = pick(BUSES, r2); }
  else if (L.main && curb && r < 0.134) { type = 'midi'; tag = 1; color = pick(BOGDAN, r2); }
  else {
    const q = c.rng();
    type = q < 0.13 ? 'hatch' : q < 0.26 ? 'sedan' : q < 0.37 ? 'sedan2' : q < 0.5 ? 'cross' : q < 0.57 ? 'suv' : q < 0.61 ? 'suv2' : q < 0.64 ? 'pickup'
      : q < 0.71 ? 'taxi' : q < 0.76 ? 'taxi_hy' : q < 0.8 ? 'taxi_gr' : q < 0.84 ? 'taxi_mv' : q < 0.92 ? 'van' : L.main ? 'truck' : 'hatch';
    if (type === 'van') color = pick(LIGHT, r2);
    else if (type.startsWith('taxi')) color = pick(CAB, r2);
    else if (!VTYPES[type].big && c.rng() < 0.08) color = pick(BRIGHT, c.rng());
  }
  if (type === 'bus' && c.rng() < 0.25) { color = URBAN; c.adSeed = adSeedFor(AD_URBAN); } // URBAN's paid quarter of the buses: their blue, their ad
  const T = VTYPES[type];
  c.type = type; c.len = T.len; c.wid = T.wid; c.h = T.h; c.color = color; c.tag = tag;
  c.v0 = (L.main ? 12.5 : 8.5) - (T.big || tag ? 1.5 : 0) + c.rng() * 3;
}
function defaultRoute(c, L, mv) {
  const N = mv.link;
  if (c.tag === 2) return N.tw ? 1 : 0.002;
  if (c.tag === 1 || c.len > 7) return N.main ? 1 : 0.03;
  const w = mv.turn === 'S' ? 1 : mv.turn === 'U' ? 0.02 : 0.55;
  return L.main && !N.main ? w * 0.4 : w;
}

export function createTrafficSimulation({ scene = null, net, models = null, phase = null, hooks = {}, density = 1, radius = 520, maxCars = 420, parked = true } = {}) {
  const links = net?.links || [], nodes = net?.nodes || [];
  const phaseAt = phase || net?.phase || (() => 2);
  const dress = hooks.dress || defaultDress, route = hooks.route || defaultRoute;
  const heightAt = hooks.heightAt || ((x, z) => 0);
  const fleet = scene && models ? createFleet(scene, models) : null;
  const live = [];              // moving cars
  const parkedCars = [];
  let dens = density, clock = 0, frame = 0, nextId = 1;
  const player = { p: new THREE.Vector3(), v: new THREE.Vector3(), gy: 0, set: false };
  let peds = null;
  const cnt = { spawned: 0, retired: 0, granted: 0, pedYields: 0, stuckRetired: 0, sinks: 0 };
  const ms = { sim: 0, draw: 0, wrecks: 0 };

  // ---- spatial hash of collision-relevant cars (rebuilt each frame around the player and camera)
  const CELL = 12, hash = new Map(), hk = (i, j) => (i + 32768) * 65536 + (j + 32768);
  const hashCars = [];
  function hashAdd(c) { const k = hk(Math.floor(c.x / CELL), Math.floor(c.z / CELL)); let b = hash.get(k); if (!b) hash.set(k, b = []); b.push(c); }
  const cellOf = (v) => Math.floor(v / CELL);
  function query(x, z, r, out = []) {
    out.length = 0;
    const xa = cellOf(x - r), xb = cellOf(x + r), za = cellOf(z - r), zb = cellOf(z + r);
    for (let a = xa; a <= xb; a++) {
      for (let b = za; b <= zb; b++) {
        const bucket = hash.get(hk(a, b));
        if (bucket) for (let k = 0; k < bucket.length; k++) if (!bucket[k].dead) out.push(bucket[k]);
      }
    }
    return out;
  }

  const W = createWrecks({ scene, models, query, retire: (c) => retire(c, false), heightAt });

  // ---- car records
  function makeCar(L, s, rngSeed) {
    const c = { id: nextId++, L, s, mv: null, ms: 0, next: null, grant: null, pi: 0, rng: rngOf(rngSeed),
      type: 'sedan', len: 4.5, wid: 1.8, h: 1.5, color: PAINT[0], tag: 0, v0: 10, v: 0, acc: 0, brake: 0,
      x: 0, y: 0, z: 0, fx: 1, fz: 0, ry: 0, pitch: 0, gp: 0, parked: false, dead: false, adSeed: 0,
      stillT: 0, waitT: 0, arrive: 0, dtAcc: 0, dist: 0 };
    c.adSeed = c.rng();
    dress(c, L);
    c.bump = (k) => { c.v = Math.max(0, c.v - k * 2); };
    return c;
  }
  function insertOnLink(L, c) { // L.cars sorted by s descending (index 0 is the front)
    const a = L.cars;
    let i = a.length;
    while (i > 0 && a[i - 1].s < c.s) i--;
    a.splice(i, 0, c);
  }
  const removeFrom = (arr, item) => { const k = arr.indexOf(item); if (k !== -1) arr.splice(k, 1); };
  function release(c) {
    if (c.grant) { c.grant.res--; c.grant.link.inRes -= c.len + 2; c.grant = null; }
    if (c.mv) { removeFrom(c.mv.cars, c); c.mv = null; }
  }
  function retire(c, stat = true) { // take a car out of the lanes (despawn or knocked into a wreck)
    if (c._gone) return;
    c._gone = true;
    if (c.parked) { if (c.L?.parked) removeFrom(c.L.parked, c); removeFrom(parkedCars, c); }
    else { release(c); if (c.L) removeFrom(c.L.cars, c); removeFrom(live, c); }
    if (stat) cnt.retired++;
  }
  for (const L of links) { L.inRes = 0; for (const mv of L.out) { mv.cars = []; mv.res = 0; } }

  // ---- route choice: weighted pick over the lane's legal moves
  function choose(c, L) {
    if (!L.out.length) return null;
    let tot = 0;
    for (const mv of L.out) tot += Math.max(0, route(c, L, mv));
    let r = c.rng() * tot;
    for (const mv of L.out) { r -= Math.max(0, route(c, L, mv)); if (r <= 0) return mv; }
    return L.out[L.out.length - 1];
  }

  // ---- streaming
  let active = [], activeW = [], activeSum = 0, refreshT = 0, first = true;
  const viewProj = new THREE.Matrix4();
  const frustum = new THREE.Frustum();
  const ball = new THREE.Sphere();
  const tmpLinks = [];
  function refreshActive(cx, cz) {
    net.linksNear(cx, cz, radius, tmpLinks);
    const next = new Set(tmpLinks);
    for (const L of active) if (!next.has(L) && L.parked) dropParked(L);
    active = tmpLinks.slice(); activeW.length = 0; activeSum = 0;
    for (const L of active) { activeSum += L.len * L.dens; activeW.push(activeSum); if (parked && !L.parked) addParked(L); }
    refillSpots(cx, cz);
  }
  function visible(x, y, z, r) { ball.center.set(x, y, z); ball.radius = r; return frustum.intersectsSphere(ball); }
  function trySpawn(cam) {
    if (!activeSum) return false;
    const r = Math.random() * activeSum;
    let lo = 0, hi = activeW.length - 1;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (activeW[mid] >= r) hi = mid; else lo = mid + 1; }
    const L = active[lo];
    if (L.len < 8) return false;
    const s = L.len * (0.15 + Math.random() * 0.7);
    const px = L.ax + s * L.dx, pz = L.az + s * L.dz;
    if (!first && Math.hypot(px - cam.x, pz - cam.z) < 140 && visible(px, L.y0, pz, 4)) return false; // never pop in on screen nearby
    for (const o of L.cars) if (Math.abs(o.s - s) < o.len / 2 + 7) return false;
    if (L.inRes > 0 && s < 12) return false;
    const c = makeCar(L, s, (Math.random() * 1e9) | 0);
    c.v = c.v0 * (0.4 + Math.random() * 0.4);
    insertOnLink(L, c);
    c.next = choose(c, L);
    live.push(c); cnt.spawned++;
    pose(c, cam, true);
    return true;
  }

  // ---- parked cars along wide residential / collector kerbs
  function addParked(L) {
    L.parked = [];
    if (L.lane !== L.nl - 1 || L.edgeR < 3.1 || L.len < 26 || L.bridge || L.main && L.cls !== 'tertiary' || L.signal) return;
    const r = rngOf(L.id * 7919 + 17);
    if (r() > 0.55) return;
    for (let s = 8 + r() * 6; s < L.len - 12; s += 6.5 + r() * 9) {
      if (r() < 0.35) continue;
      const c = makeCar(L, s, L.id * 131 + Math.floor(s));
      if (c.len > 5.6) continue;
      c.parked = true; c.v = 0;
      const off = L.edgeR - c.wid / 2 - 0.3;
      c.x = L.ax + L.dx * s - L.dz * off; c.z = L.az + L.dz * s + L.dx * off;
      c.ry = Math.atan2(-L.dz, L.dx) + (r() - 0.5) * 0.04; c.fx = Math.cos(c.ry); c.fz = -Math.sin(c.ry);
      c.y = heightAt(c.x, c.z) || 0;
      L.parked.push(c); parkedCars.push(c);
    }
  }
  function dropParked(L) { for (const c of L.parked) { c._gone = true; removeFrom(parkedCars, c); } L.parked = null; }

  // ---- cars on the car parks the world lays out (sim.addParkingSpots): parked records outside the lanes, knocked into
  // wrecks like any other; an emptied spot is refilled once it is far from the camera and no wreck lies on it
  const spots = [], lotLink = { main: false, lane: 0, nl: 2, tw: false, cls: 'service', id: 0 };
  function fillSpot(sp) {
    let c = null;
    for (let k = 0; k < 4 && (!c || c.len > 5.6); k++) c = makeCar(lotLink, 0, sp.seed + k * 7717 + sp.n * 104729);
    sp.n++;
    if (c.len > 5.6) return;
    c.L = null; c.parked = true; c.v = 0;
    c.x = sp.x; c.z = sp.z; c.ry = sp.ry; c.fx = Math.cos(c.ry); c.fz = -Math.sin(c.ry);
    c.y = heightAt(c.x, c.z) || 0;
    sp.car = c; parkedCars.push(c);
  }
  function refillSpots(cx, cz) {
    for (const sp of spots) {
      if (sp.car && !sp.car._gone || (sp.x - cx) ** 2 + (sp.z - cz) ** 2 < 250 * 250) continue;
      if (!W.list.some((w) => (w.p.x - sp.x) ** 2 + (w.p.z - sp.z) ** 2 < 16)) fillSpot(sp);
    }
  }

  // ---- junction entry: conflicts, priority (main roads and straight moves first, then first come) and room beyond
  function waitingKey(c) { return c.arrive - (c.next ? c.next.pri * 2.5 : 0); }
  // c.ready: the last check found the box clear and room beyond; only such rivals compete on priority (a rival held by
  // its red light or a full exit must not block anyone)
  function canEnter(c, mv) {
    c.ready = false;
    for (const q of mv.cf) if (q.res > 0) return false;
    const O = mv.link, last = O.cars[O.cars.length - 1];
    const free = (last ? last.s - last.len / 2 : O.len) - O.inRes;
    if (!(free >= Math.min(c.len + 3, O.len - 0.5) || (!last && O.inRes <= 0))) return false;
    c.ready = true; c.readyT = clock;
    for (const q of mv.cf) {
      const h = q.from.cars[0];
      if (h && h !== c && h.next === q && !h.grant && h.ready && clock - h.readyT < 0.3 && waitingKey(h) < waitingKey(c)) return false;
    }
    return true;
  }

  // ---- car following (IDM) against the nearest constraint ahead
  function idm(v, v0, gap, dv) {
    const ss = GAP0 + Math.max(0, v * HEADWAY + v * dv / (2 * Math.sqrt(A_MAX * B_COMF)));
    const g = Math.max(0.1, gap);
    return A_MAX * (1 - (v / Math.max(0.5, v0)) ** 4 - (ss / g) ** 2);
  }
  // distance from car c's front to the rear of the nearest car ahead (on link, its next move, the link after); speed
  const lead = { gap: 0, v: 0 };
  function leaderOf(c) {
    lead.gap = Infinity; lead.v = 0;
    const half = c.len / 2;
    if (c.mv) {
      const mv = c.mv, i = mv.cars.indexOf(c);
      if (i > 0) { const o = mv.cars[i - 1]; lead.gap = o.ms - o.len / 2 - c.ms - half; lead.v = o.v; return lead; }
      const O = mv.link, last = O.cars[O.cars.length - 1];
      if (last) { lead.gap = mv.path.len - c.ms + last.s - last.len / 2 - half; lead.v = last.v; }
      return lead;
    }
    const L = c.L, i = L.cars.indexOf(c);
    if (i > 0) { const o = L.cars[i - 1]; lead.gap = o.s - o.len / 2 - c.s - half; lead.v = o.v; return lead; }
    const toEnd = L.len - c.s;
    if (toEnd > LOOK || !c.next) return lead;
    const mv = c.next;
    if (mv.cars.length) { const o = mv.cars[mv.cars.length - 1]; lead.gap = toEnd + o.ms - o.len / 2 - half; lead.v = o.v; return lead; }
    const O = mv.link, last = O.cars[O.cars.length - 1];
    if (last) { lead.gap = toEnd + mv.path.len + last.s - last.len / 2 - half; lead.v = last.v; }
    return lead;
  }

  // walkers on the carriageway (and the player standing on the road) as forward obstacles, bucketed on a grid
  const PC = 16, pedGrid = new Map(), pedKey = (i, j) => (i + 32768) * 65536 + (j + 32768);
  function gatherPeds() {
    pedGrid.clear();
    const add = (x, z) => { const k = pedKey(Math.floor(x / PC), Math.floor(z / PC)); let b = pedGrid.get(k); if (!b) pedGrid.set(k, b = []); b.push(x, z); };
    const ws = peds?.walkers;
    if (ws) for (let i = 0; i < ws.length; i++) { const a = ws[i]; if (a && a.road && !a.dead) add(a.x, a.z); }
    if (player.set && player.p.y - player.gy < 2.2) add(player.p.x, player.p.z);
  }
  function pedGap(c, fx, fz) {
    if (!pedGrid.size) return null;
    const look = c.len / 2 + Math.max(10, c.v * 2.5 + 6), side = c.wid / 2 + 1.1;
    const ex = c.x + fx * look, ez = c.z + fz * look;
    const xa = Math.floor((Math.min(c.x, ex) - side) / PC), xb = Math.floor((Math.max(c.x, ex) + side) / PC);
    const za = Math.floor((Math.min(c.z, ez) - side) / PC), zb = Math.floor((Math.max(c.z, ez) + side) / PC);
    let g = null;
    for (let a = xa; a <= xb; a++) for (let q = za; q <= zb; q++) {
      const b = pedGrid.get(pedKey(a, q));
      if (!b) continue;
      for (let k = 0; k < b.length; k += 2) {
        const dx = b[k] - c.x, dz = b[k + 1] - c.z, al = dx * fx + dz * fz;
        if (al <= 0 || al > look || Math.abs(dx * fz - dz * fx) > side) continue;
        const d = al - c.len / 2 - 1.8;
        if (g === null || d < g) g = d;
      }
    }
    return g;
  }

  function step(c, dt, cam) {
    const L = c.L;
    let acc = idm(c.v, c.mv ? Math.min(c.v0, TURN_V[c.mv.turn]) : c.v0, Infinity, 0);
    const ld = leaderOf(c);
    if (ld.gap < LOOK) acc = Math.min(acc, idm(c.v, c.v0, ld.gap, c.v - ld.v));
    let stopping = false;
    if (!c.mv) {
      const toEnd = L.len - c.s, mv = c.next, node = nodes[L.to];
      // slow for the coming turn
      if (mv && TURN_V[mv.turn] < c.v && toEnd < 40) acc = Math.min(acc, (TURN_V[mv.turn] ** 2 - c.v * c.v) / (2 * Math.max(1, toEnd)));
      let hold = false;
      if (!mv) { // no way on: a sink at the map edge (or a broken end): wait at the end
        hold = true;
      } else if (node.junction && !c.grant) {
        const reach = Math.max(14, c.v * c.v / (2 * B_COMF) + 8);
        if (toEnd < reach && L.cars[0] === c) {
          if (!c.waitT) c.arrive = clock;
          c.waitT += dt;
          let go = true;
          if (L.signal) {
            const st = phaseAt(clock, L.axis);
            if (st === 0) go = false;
            else if (st === 1 && L.stopS - c.s - c.len / 2 > c.v * c.v / (2 * B_COMF)) go = false;
          }
          if (!go) c.ready = false;
          if (go && canEnter(c, mv)) { c.grant = mv; mv.res++; mv.link.inRes += c.len + 2; cnt.granted++; c.waitT = 0; }
          else hold = true;
        }
      }
      if (hold) {
        const stopAt = (mv ? L.stopS : L.len) - c.s - c.len / 2 - 0.3;
        acc = Math.min(acc, idm(c.v, c.v0, stopAt, c.v));
        stopping = true;
      }
    }
    if (c.dist < 260) { // people (and the player) on the road ahead
      let g = pedGap(c, c.fx, c.fz);
      const hg = hooks.obstacle ? hooks.obstacle(c) : null;
      if (hg !== null && hg !== undefined && (g === null || hg < g)) g = hg;
      if (g !== null) { acc = Math.min(acc, idm(c.v, c.v0, g, c.v)); cnt.pedYields++; }
    }
    acc = Math.max(-B_MAX, acc);
    const nv = c.v + acc * dt;
    c.v = nv < 0.05 && acc <= 0 ? 0 : Math.max(0, nv);
    c.acc = acc;
    c.brake = acc < -0.6 || (c.v < 0.4 && (stopping || acc <= 0)) ? 1 : 0;
    if (c.v < 0.3) c.stillT += dt; else c.stillT = 0;
    advance(c, c.v * dt, cam);
  }
  function advance(c, ds, cam) {
    if (c.mv) {
      c.ms += ds;
      if (c.ms < c.mv.path.len) return;
      const mv = c.mv, over = c.ms - mv.path.len;
      removeFrom(mv.cars, c); c.mv = null;
      if (c.grant === mv) { mv.res--; mv.link.inRes -= c.len + 2; c.grant = null; }
      c.L = mv.link; c.s = Math.min(over, c.L.len); c.pi = 0;
      insertOnLink(c.L, c);
      c.next = choose(c, c.L);
      return;
    }
    const L = c.L, maxS = c.next ? L.len : L.len - c.len / 2;
    c.s += ds;
    if (!c.next) {
      if (c.s >= maxS) {
        c.s = maxS; c.v = 0;
        if (c.dist > 90 || !c.seen || c.stillT > 25) { retire(c); cnt.sinks++; }
      }
      return;
    }
    if (c.s < L.len) return;
    const mv = c.next, node = nodes[L.to];
    if (node.junction && c.grant !== mv) { c.s = L.len - 0.01; c.v = 0; return; } // (never granted: hold at the line)
    removeFrom(L.cars, c);
    c.mv = mv; c.ms = c.s - L.len; c.pi = 0; c.next = null;
    mv.cars.push(c);
    if (c.ms >= mv.path.len) advance(c, 0, cam);
  }

  // ---- pose: position on the lane / move, heading, height and pitch from the terrain
  const _pt = { x: 0, z: 0, dx: 1, dz: 0, i: 0 };
  function pose(c, cam, force) {
    let x, z, dx, dz, yLin;
    if (c.mv) {
      pathAt(c.mv.path, c.ms, _pt, c.pi); c.pi = _pt.i;
      x = _pt.x; z = _pt.z; dx = _pt.dx; dz = _pt.dz;
      const f = c.ms / c.mv.path.len; yLin = c.mv.from.y1 + (c.mv.link.y0 - c.mv.from.y1) * f;
    } else {
      const L = c.L, s = Math.min(c.s, L.len);
      x = L.ax + L.dx * s; z = L.az + L.dz * s; dx = L.dx; dz = L.dz; yLin = L.y0 + (L.y1 - L.y0) * (s / Math.max(0.01, L.len));
    }
    c.x = x; c.z = z; c.fx = dx; c.fz = dz; c.ry = Math.atan2(-dz, dx);
    const bridge = c.mv ? c.mv.from.bridge || c.mv.link.bridge : c.L.bridge;
    if (!bridge && (c.dist < 220 || force)) {
      const hb = c.len * 0.36, yf = heightAt(x + dx * hb, z + dz * hb), yr = heightAt(x - dx * hb, z - dz * hb);
      if (Number.isFinite(yf) && Number.isFinite(yr)) { c.y = (yf + yr) / 2; c.pitch = Math.atan2(yf - yr, 2 * hb); }
      else { c.y = yLin; c.pitch = 0; }
    } else { c.y = yLin; c.pitch = 0; }
  }

  // ---- the frame
  const _cam = new THREE.Vector3(), _p = new THREE.Vector3();
  const _mat = new THREE.Matrix4(), _q = new THREE.Quaternion(), _eu = new THREE.Euler(), UNIT = new THREE.Vector3(1, 1, 1);
  function update(dt, camera, time) {
    if (!camera || !(dt >= 0)) return;
    const t0 = performance.now();
    dt = Math.min(dt, 0.1);
    clock = time ?? clock + dt; frame++;
    camera.getWorldPosition(_cam);
    camera.updateMatrixWorld();
    viewProj.copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProj);
    if ((refreshT -= dt) <= 0 || first) { refreshT = 0.5; refreshActive(_cam.x, _cam.z); }
    // population target over the active lanes
    const target = Math.min(maxCars, Math.round(activeSum * PER_M * dens));
    for (let k = 0, lim = first ? 4000 : 10; k < lim && live.length < target; k++) trySpawn(_cam);
    first = false;
    gatherPeds();
    // retire what fell out of range (or has been stuck out of sight for long)
    const far2 = (radius + 80) ** 2;
    for (let i = live.length; i-- > 0;) {
      const c = live[i], d2 = (c.x - _cam.x) ** 2 + (c.z - _cam.z) ** 2;
      if (d2 > far2 || (c.stillT > 60 && !c.seen && d2 > 3600)) { if (c.stillT > 60) cnt.stuckRetired++; retire(c); }
    }
    // simulate: near cars every frame, farther ones every 2nd / 4th frame with the time they missed
    for (let i = 0; i < live.length; i++) {
      const c = live[i];
      c.dist = Math.hypot(c.x - _cam.x, c.z - _cam.z);
      const every = c.dist < NEAR ? 1 : c.dist < MID ? 2 : 4;
      c.dtAcc += dt;
      if ((frame + c.id) % every) continue;
      let h = Math.min(c.dtAcc, 0.25); c.dtAcc = 0;
      while (h > 1e-6 && !c._gone) { const s = Math.min(h, 0.1); step(c, s, _cam); h -= s; }
      if (!c._gone) pose(c, _cam);
    }
    // collision index around the player and the camera
    hash.clear(); hashCars.length = 0;
    const px = player.set ? player.p.x : _cam.x, pz = player.set ? player.p.z : _cam.z, cr2 = COLL_R * COLL_R;
    for (const a of [live, parkedCars]) for (const c of a) {
      if ((c.x - px) ** 2 + (c.z - pz) ** 2 < cr2 || (c.x - _cam.x) ** 2 + (c.z - _cam.z) ** 2 < cr2) hashAdd(c);
    }
    const t1 = performance.now();
    W.update(dt, camera);
    const t2 = performance.now();
    draw(camera);
    const t3 = performance.now();
    ms.sim = t1 - t0; ms.wrecks = t2 - t1; ms.draw = t3 - t2;
  }

  function draw(camera) {
    const cp = _cam;
    for (const c of live) c.seen = false;
    if (fleet) fleet.begin();
    const drawCar = (c) => {
      const d = Math.hypot(c.x - cp.x, c.y - cp.y, c.z - cp.z);
      if (d > 700 || !visible(c.x, c.y + c.h / 2, c.z, c.len / 2 + 0.5)) return;
      c.seen = true;
      if (!fleet) return;
      _q.setFromEuler(_eu.set(0, c.ry, c.pitch + c.gp, 'YZX'));
      _mat.compose(_p.set(c.x, c.y, c.z), _q, UNIT);
      fleet.add(c.type, d < 45 ? 0 : d < 170 ? 1 : 2, _mat.elements, c.color, c.brake, c.adSeed);
    };
    for (const c of live) drawCar(c);
    for (const c of parkedCars) drawCar(c);
    W.draw(fleet, camera, frustum);
    if (fleet) fleet.end();
  }

  // ---- player collision (vertical aware); accumulates push-out over nearby cars and wrecks
  const coll = { grounded: false, groundY: 0, depth: 0, vel: null, push: new THREE.Vector3(), normal: new THREE.Vector3() };
  const acc = { x: 0, z: 0, n: 0, top: -Infinity, vel: null };
  const nearQ = [];
  const _vel = new THREE.Vector3();
  function collideDynamic(pos, r = 1, h = 1.3) {
    if (!pos) return null;
    acc.x = 0; acc.z = 0; acc.n = 0; acc.top = -Infinity; acc.vel = null;
    let top = null;
    for (const c of query(pos.x, pos.z, r + 8, nearQ)) {
      const cTop = c.y + c.h;
      if (pos.y > cTop + 0.4 || pos.y + h < c.y) continue;
      const ox = pos.x - c.x, oz = pos.z - c.z, fx = c.fx, fz = c.fz;
      const lx = ox * fx + oz * fz, lz = oz * fx - ox * fz;
      if (pos.y > cTop - 0.35) { // on the roof: support, no wall
        if (Math.abs(lx) < c.len / 2 + r * 0.3 && Math.abs(lz) < c.wid / 2 + r * 0.3 && cTop > acc.top) { acc.top = cTop; top = c; }
        continue;
      }
      pushBox(lx, lz, fx, fz, c.len / 2, c.wid / 2, r, acc);
    }
    if (top) { const sp = top.parked ? 0 : top.v; acc.vel = _vel.set(Math.cos(top.ry) * sp, 0, -Math.sin(top.ry) * sp); }
    W.collide(pos, r, h, acc);
    if (!acc.n && acc.top === -Infinity) return null;
    coll.grounded = acc.top > -Infinity && !acc.n;
    coll.groundY = acc.top > -Infinity ? acc.top : 0;
    coll.vel = acc.vel;
    coll.push.set(acc.x, 0, acc.z);
    coll.depth = Math.hypot(acc.x, acc.z);
    if (coll.depth > 1e-6) coll.normal.set(acc.x / coll.depth, 0, acc.z / coll.depth); else coll.normal.set(0, 1, 0);
    return coll;
  }

  const sim = {
    links, nodes, net, VTYPES, wrecks: W.list, ms,
    update,
    cars: () => live.concat(parkedCars),
    setDensity(k) { dens = Math.max(0, +k || 0); },
    get density() { return dens; },
    setPlayer(pos, vel, gy) {
      if (pos) { player.p.copy(pos); player.set = true; }
      if (vel) player.v.copy(vel);
      if (Number.isFinite(gy)) player.gy = gy;
    },
    setPeds(p) { peds = p || null; },
    collideDynamic,
    ram: (q) => W.ram(q),
    knock: (c, dv, spin) => W.knock(c, dv, spin),
    dent: (w, px, py, pz, dx, dy, dz, J) => W.dent(w, px, py, pz, dx, dy, dz, J),
    massOf: (c) => W.massOf(c),
    makeMesh(type, colour, seed) {
      if (!models?.makeMesh) return null;
      const mm = models.makeMesh(type, colour, seed);
      if (scene) scene.add(mm.mesh);
      return mm;
    },
    setSolid: (s) => W.setSolid(s),
    setDebris: (d) => W.setDebris(d),
    queryCars: (x, z, r, out) => query(x, z, r, out),
    addParkingSpots(list) { // [[x, z, ry], ...] ry: yaw in the car frame (forward = cos ry, -sin ry)
      for (const [x, z, ry] of list) {
        const sp = { x, z, ry, seed: (Math.imul(Math.round(x * 10), 73856093) ^ Math.imul(Math.round(z * 10), 19349663)) >>> 0, n: 0, car: null };
        spots.push(sp); fillSpot(sp);
      }
    },
    stats() {
      let stopped = 0; for (const c of live) if (c.v < 0.3) stopped++;
      const f = fleet ? fleet.stats() : { drawn: 0, byLod: [0, 0, 0], meshes: 0 };
      return { cars: live.length, parked: parkedCars.length, stopped, moving: live.length - stopped, activeLinks: active.length,
        density: dens, drawn: f.drawn, lod0: f.byLod[0], lod1: f.byLod[1], lod2: f.byLod[2], meshes: f.meshes, ...cnt, ...W.stats(),
        simMs: +ms.sim.toFixed(3), wreckMs: +ms.wrecks.toFixed(3), drawMs: +ms.draw.toFixed(3) };
    },
    dispose() { fleet?.dispose(); W.clear(); },
  };
  return sim;
}

// ------------------------------------------------------------------------------------------ signal props
// One post + housing per signalised approach (right-hand kerb, facing the traffic) and three lenses whose colour
// follows phaseOf(axis); lens colours are rewritten only when a head changes state.
const LENS_ON = [0xff2a14, 0xffb01a, 0x22ff9a].map(c => new THREE.Color(c).multiplyScalar(2.2));
const LENS_OFF = [0x1a0404, 0x1a1103, 0x03140c].map(c => new THREE.Color(c));
export function createSignalProps(scene, signals, phaseOf) {
  const count = signals?.length || 0;
  if (!count) return { update() {}, dispose() {} };
  const geoPost = new THREE.CylinderGeometry(0.06, 0.075, 3.3, 6);
  geoPost.translate(0, 1.65, 0);
  const geoHead = new THREE.BoxGeometry(0.26, 0.86, 0.32);
  geoHead.translate(0.05, 3.0, 0);
  const geoLens = new THREE.CircleGeometry(0.1, 10);
  geoLens.rotateY(Math.PI / 2);
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.55, metalness: 0.3 });
  const glow = new THREE.MeshBasicMaterial({ toneMapped: false });
  const posts = new THREE.InstancedMesh(geoPost, metal, count), heads = new THREE.InstancedMesh(geoHead, metal, count);
  const lenses = new THREE.InstancedMesh(geoLens, glow, count * 3);
  const xf = new THREE.Matrix4(), rot = new THREE.Quaternion(), at = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < count; i++) {
    const sg = signals[i];
    rot.setFromAxisAngle(UP, sg.ry);
    xf.compose(at.set(sg.x, sg.y + 0.15, sg.z), rot, ONE);
    posts.setMatrixAt(i, xf); heads.setMatrixAt(i, xf);
    for (let k = 0; k < 3; k++) { // red on top, then amber, green; the lens sits just proud of the housing
      at.set(0.19, 3.27 - 0.27 * k, 0).applyQuaternion(rot);
      at.x += sg.x; at.y += sg.y + 0.15; at.z += sg.z;
      xf.compose(at, rot, ONE);
      lenses.setMatrixAt(3 * i + k, xf);
      lenses.setColorAt(3 * i + k, LENS_OFF[k]);
    }
  }
  posts.name = 'signal-posts'; heads.name = 'signal-heads'; lenses.name = 'signal-lamps';
  posts.castShadow = heads.castShadow = true;
  const parts = [posts, heads, lenses];
  for (const m of parts) { m.computeBoundingSphere(); scene.add(m); }
  const shown = new Int8Array(count).fill(-1);
  return {
    update() {
      let changed = false;
      for (let i = 0; i < count; i++) {
        const st = phaseOf(signals[i].ax);
        if (shown[i] === st) continue;
        shown[i] = st; changed = true;
        const lit = st === 2 ? 2 : st === 1 ? 1 : 0;
        for (let k = 0; k < 3; k++) lenses.setColorAt(3 * i + k, k === lit ? LENS_ON[k] : LENS_OFF[k]);
      }
      if (changed) lenses.instanceColor.needsUpdate = true;
    },
    dispose() { for (const m of parts) { scene.remove(m); m.dispose(); } geoPost.dispose(); geoHead.dispose(); geoLens.dispose(); metal.dispose(); glow.dispose(); },
  };
}
