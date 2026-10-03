// Pedestrians of Cherkasy: procedural low-poly people walking the map's sidewalks, footways, park paths and zebra
// crossings, standing groups on squares, scripted mission actors and pigeon flocks.
//   createPeople({ scene, map, ground, buildings?, traffic?, gibs?, opts? }) -> api
//     scene: THREE.Object3D to add to; map: map.json; ground: { heightAt(x, z), onAsphalt?(x, z), isWater?(x, z),
//       isBuilding?(x, z) } (missing classifiers are rasterised from map.asphalt / map.water / buildings);
//     buildings: map_buildings.json footprints [{ p, k }]; traffic: optional (setPeds(api), carNear(x, z, r) or
//       sim.cars() for crossing waits); gibs: optional npc/gibs.js debris (hit bursts)
//     opts: { maxWalkers = 1400, density = 1, radius = 250, birds = true, blobs = true, budgetMs = 2,
//       standY(x, z, onRoad) -> y, carNear(x, z, r) -> bool, area = true (false: walk every way of the map; else people
//       stay in people/area.js's walk area: inside map.region, near buildings or in parks, never out in the fields) }
//   api: { walkers[] (stable array: ambient walkers + actors; .x .z .road), statics[], actors[], lanes (paths),
//     update(dt, camera), hitBox(q) -> people hit, alarm(pos, r), honk(q), spawnActor({ x, z, ry, clip, seed, kind }) -> actor,
//     removeActor(actor), pedOnRoad(x, z, r) -> bool, setTraffic(t), stats(), root, dispose(),
//     setDrawDistance(view = 300, k = 1): the graphics quality's draw reach for ambient people (mission actors keep 300 m)
//       and a factor on the LOD / blob-shadow distances; drawing only, the crowd and its simulation stay the same }
//   hitBox q: { x, z, fx, fz (forward unit), hl, hw (half length / width), y0, y1, vx, vy, vz }
//   honk q: { x, y, z, fx, fz } – the player's horn: people in a cone ahead dash sideways off the car's line
//   actor handle: x y z ry dead gone; missions write hx/hz (walk there), goSpeed (> 2.4 runs), hry (face), idleClip
// Everything is built from the map at run time: no downloaded art. Cells of the walking network are processed
// lazily around the camera under a per-frame time budget; people are drawn in 3 LODs (one draw call each).
import * as THREE from 'three';
import { createPolyMask } from './people/mask.js';
import { createNetwork, KIND } from './people/network.js';
import { createWalkArea } from './people/area.js';
import { makeLook } from './people/looks.js';
import { createCrowdMaterials, createCrowdLayer, CLIP } from './people/body.js';
import { createFlocks } from './people/birds.js';
import { hash2, rng } from './people/rng.js';
import { cue } from '../audio/cue.js';

const CELL = 96, VIEW = 300, LOD_NEAR = 26, LOD_MID = 80, SIM_NEAR = 110, BLOB_R = 55;
const WALK_STRIDE = 1.52, RUN_STRIDE = 2.6, SPACING = 24, CELL_CAP = 70;
const REACT_FLEE = 1, REACT_COWER = 2, REACT_DASH = 3;
const DASH_SPEED = 5, BACK_SPEED = 1.1; // m/s: the sprint off the car's line, the walk back afterwards
const POI_BIRDS = /memorial|monument|fountain|artwork|attraction|place_of_worship|theatre/;

export function createPeople({ scene, map, ground, buildings = null, traffic = null, gibs = null, opts = {} }) {
  const maxWalkers = opts.maxWalkers ?? 1400, R_ACT = opts.radius ?? 250, R_DROP = R_ACT + 70, budget = opts.budgetMs ?? 2;
  const blds = buildings || map.buildings || [];
  const H = (x, z) => ground.heightAt(x, z);
  const bMask = ground.isBuilding ? null : createPolyMask(blds);
  const aMask = ground.onAsphalt ? null : createPolyMask(map.asphalt || []);
  const wMask = ground.isWater ? null : createPolyMask(map.water || [], { tile: 128, res: 1 });
  const isBuilding = ground.isBuilding ? (x, z) => ground.isBuilding(x, z) : (x, z) => bMask.has(x, z);
  const isAsphalt = ground.onAsphalt ? (x, z) => ground.onAsphalt(x, z) : (x, z) => aMask.has(x, z);
  const isWater = ground.isWater ? (x, z) => ground.isWater(x, z) : (x, z) => wMask.has(x, z);
  const standY = opts.standY || ((x, z, road) => H(x, z) + (road ? 0.02 : 0.19));
  const area = opts.area === false ? null : createWalkArea({ region: map.region, buildings: blds, cover: map.cover });
  const net = createNetwork({ map, isBuilding, isAsphalt, isWater, allow: area?.has, cell: CELL });

  // busy-ness per cell: apartment / public buildings around it and closeness to the centre (Soborna square = origin)
  const urb = new Map();
  for (const b of blds) if (b.p && (b.k === 'apt' || b.k === 'public' || b.k === 'church')) { const k = net.cellKey(b.p[0], b.p[1]); urb.set(k, (urb.get(k) || 0) + 1); }
  const pois = new Map();
  for (const p of map.pois || []) if (Object.entries(p.tags || {}).some(([k, v]) => /amenity|historic|tourism/.test(k) && POI_BIRDS.test(v))) { const k = net.cellKey(p.x, p.z); if (!pois.has(k)) pois.set(k, []); pois.get(k).push(p); }
  const unkey = (k) => [Math.floor(k / 65536) - 32768, (k % 65536) - 32768];
  const K = (i, j) => (i + 32768) * 65536 + (j + 32768);
  function busyness(ix, iz) {
    let a = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) a += (urb.get(K(ix + i, iz + j)) || 0) * (i || j ? 1 : 2);
    const cx = (ix + 0.5) * CELL, cz = (iz + 0.5) * CELL;
    return (0.3 + 0.7 * Math.min(1, a / 10)) * (1 + 1.3 * Math.exp(-(cx * cx + cz * cz) / (1100 * 1100))) * (opts.density ?? 1);
  }

  // ------------------------------------------------------------------ rendering
  const root = new THREE.Group(); root.name = 'people';
  scene.add(root);
  const mats = createCrowdMaterials();
  const layers = [createCrowdLayer(0, 3000, mats), createCrowdLayer(1, 1400, mats), createCrowdLayer(2, 360, mats)];
  for (const l of layers) root.add(l.mesh);
  let blobs = null;
  if (opts.blobs !== false) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.45, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const bm = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: new THREE.CanvasTexture(cv), transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), bm, 1200);
    blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage); blobs.frustumCulled = false; blobs.count = 0; blobs.renderOrder = 1; blobs.name = 'people-blobs';
    root.add(blobs);
  }
  const flocks = opts.birds === false ? null : createFlocks({ scene: root, groundY: (x, z) => standY(x, z, false) });

  // ------------------------------------------------------------------ people
  const walkers = [], statics = [], actors = [];
  const cells = new Map();
  let fillFast = true;
  let nextId = 1, time = 0, frame = 0, hits = 0, spawned = 0;
  const prof = { ms: 0, max: 0, stream: 0 };
  const tmp = { x: 0, z: 0, tx: 0, tz: 0, lo: 0, hi: 0, road: 0 };
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();

  function person(look, seed, kind) {
    return { id: nextId++, kind, x: 0, y: 0, z: 0, ry: 0, dead: false, gone: false, road: false, look, seed: (seed % 10007) / 10007,
      phase: (seed % 97) / 97, clipA: 0, clipB: 0, blend: 0, headYaw: 0, glance: 0, glanceYaw: 0, lod: -1, nav: null, cell: null, _drop: false, _removed: false };
  }
  // cross-fade to clip c (0.25 s); a reversal mid-fade swaps back without a pop
  function setClip(p, c) {
    if (p.blend > 0) {
      if (c === p.clipB) return;
      if (c === p.clipA) { p.clipA = p.clipB; p.clipB = c; p.blend = 1 - p.blend; return; }
      if (p.blend > 0.5) p.clipA = p.clipB;
      p.blend = 0;
    }
    if (c !== p.clipA) { p.clipB = c; p.blend = 0.001; }
  }
  const fade = (p, dt) => { if (p.blend > 0 && (p.blend += dt * 4) >= 1) { p.clipA = p.clipB; p.blend = 0; } };
  const turn = (p, a, k) => { let d = a - p.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); p.ry += d * Math.min(1, k); };
  const clipId = (name) => CLIP[name] ?? CLIP.idle;
  const carNear = (x, z, r) => {
    if (opts.carNear) return opts.carNear(x, z, r);
    if (traffic?.carNear) return traffic.carNear(x, z, r);
    const cars = traffic?.sim?.cars?.();
    if (cars) for (const c of cars) { const cx = c.x ?? c.p?.x, cz = c.z ?? c.p?.z; if (cx !== undefined && !c.dead && (cx - x) ** 2 + (cz - z) ** 2 < r * r) return true; }
    return false;
  };

  // ---------------------------------------------------------------- streaming
  function cellState(key) {
    let c = cells.get(key);
    if (!c) { const [ix, iz] = unkey(key); cells.set(key, c = { key, ix, iz, active: false, quota: 0, eff: 0, alive: 0, n: 0, dens: busyness(ix, iz), d: 0 }); }
    return c;
  }
  function activate(c) {
    c.active = true; c.n = 0;
    const cs = net.cellSamples(c.key);
    c.quota = cs ? Math.min(CELL_CAP, Math.round(cs.wlen * c.dens / SPACING)) : 0;
    if (!cs) return;
    const r = rng(hash2(c.ix, c.iz, 31));
    // standing groups on wide pavements: talkers, a phone user
    const groups = cs.wide.length ? Math.min(3, Math.floor(c.quota * 0.05 + r() * 1.5)) : 0;
    for (let g = 0; g < groups; g++) {
      const w = Math.floor(r() * cs.wide.length / 2) * 2, P = net.paths[cs.wide[w]];
      net.place(P, cs.wide[w + 1], 0, tmp);
      const lat = (tmp.lo + tmp.hi) / 2 + (r() - 0.5) * (tmp.hi - tmp.lo) * 0.4;
      net.place(P, cs.wide[w + 1], lat, tmp);
      const size = r() < 0.25 ? 1 : 2 + Math.floor(r() * 2.2), a0 = r() * 6.283, cx = tmp.x, cz = tmp.z;
      for (let k = 0; k < size; k++) {
        const seed = hash2(c.ix, c.iz, 1000 + g * 8 + k), p = person(makeLook(seed), seed, 1);
        const a = a0 + k * 6.283 / size, rr = size === 1 ? 0 : 0.5 + size * 0.07;
        p.x = cx + Math.cos(a) * rr; p.z = cz + Math.sin(a) * rr; p.y = standY(p.x, p.z, false);
        p.ry = size === 1 ? r() * 6.283 : Math.atan2(cx - p.x, cz - p.z);
        p.clipA = p.base = size === 1 ? CLIP.phone : k === 0 ? CLIP.talk : r() < 0.5 ? CLIP.talk2 : CLIP.idle;
        p.cell = c; p.react = 0; statics.push(p);
      }
    }
    // pigeons on the squares, memorials and broad pedestrian pavements of busy cells
    if (flocks && c.dens > 0.55) {
      const sites = [];
      for (const q of pois.get(c.key) || []) {
        if (sites.length >= 2 || r() > 0.7) continue;
        for (let t = 0; t < 12; t++) { const a = t * 2.4, d = 3 + t * 0.6, x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d; if (!isBuilding(x, z) && !isAsphalt(x, z) && !isWater(x, z)) { sites.push({ x, z, n: 5 + Math.floor(r() * 13), seed: hash2(c.ix, c.iz, 500 + t) }); break; } }
      }
      if (!sites.length && cs.wide.length && r() < 0.35) {
        const w = Math.floor(r() * cs.wide.length / 2) * 2, P = net.paths[cs.wide[w]];
        if (P.kind === KIND.PED || P.kind === KIND.FOOT || c.dens > 1.2) { net.place(P, cs.wide[w + 1], (P.lo[cs.wide[w + 1]] + P.hi[cs.wide[w + 1]]) / 2, tmp); sites.push({ x: tmp.x, z: tmp.z, n: 5 + Math.floor(r() * 10), seed: hash2(c.ix, c.iz, 600) }); }
      }
      if (sites.length) flocks.addCell(c.key, sites);
    }
  }
  function deactivate(c) {
    c.active = false; c.quota = c.eff = 0;
    for (const p of statics) if (p.cell === c) p._drop = true;
    for (const p of walkers) if (p.cell === c) p._drop = true;
    flocks?.removeCell(c.key);
  }
  function stream(cam) {
    const t0 = performance.now();
    const ci = Math.floor(cam.x / CELL), cj = Math.floor(cam.z / CELL), rc = Math.ceil(R_ACT / CELL);
    const want = [];
    for (let i = ci - rc; i <= ci + rc; i++) for (let j = cj - rc; j <= cj + rc; j++) {
      const dx = Math.max(0, Math.abs(cam.x - (i + 0.5) * CELL) - CELL / 2), dz = Math.max(0, Math.abs(cam.z - (j + 0.5) * CELL) - CELL / 2), d = Math.hypot(dx, dz);
      if (d < R_ACT) want.push([K(i, j), d]);
    }
    want.sort((a, b) => a[1] - b[1]);
    // the queue is kept nearest-first (re-prioritised as the camera moves); while cells close to the camera are
    // still unbuilt (start, teleport) the frame budget is raised so the street fills within a second or two
    let act = 0, urgent = false;
    for (const [k, d] of want) {
      const ready = net.ready(k);
      if (!ready) { net.request(k, d); if (d < 150) urgent = true; }
      const c = cellState(k); c.d = d;
      if (!c.active && ready && act < 6) { activate(c); act++; }
    }
    net.pump(urgent ? Math.max(budget, 6) : budget);
    fillFast = urgent || act > 0;
    for (const c of cells.values()) if (c.active) {
      const dx = Math.max(0, Math.abs(cam.x - (c.ix + 0.5) * CELL) - CELL / 2), dz = Math.max(0, Math.abs(cam.z - (c.iz + 0.5) * CELL) - CELL / 2);
      c.d = Math.hypot(dx, dz);
      if (c.d > R_DROP) deactivate(c);
    }
    // the population cap thins the farthest cells first
    const act2 = [...cells.values()].filter(c => c.active).sort((a, b) => a.d - b.d);
    let left = maxWalkers;
    for (const c of act2) { c.eff = Math.min(c.quota, Math.max(0, left)); left -= c.quota; if (left < 0 && c.d > 60) c.eff = Math.floor(c.eff * 0.5); }
    prof.stream = prof.stream * 0.95 + (performance.now() - t0) * 0.05;
  }
  function spawnPass(cam) {
    let budgetN = fillFast ? 160 : 40;
    for (const c of cells.values()) {
      if (!c.active || c.alive >= c.eff) continue;
      const cs = net.cellSamples(c.key); if (!cs || !cs.s.length) continue;
      const first = c.n < c.quota; // the first fill is deterministic per cell; refills avoid popping in view
      for (let tries = 0; tries < 4 && c.alive < c.eff && budgetN > 0; tries++) {
        const seed = first ? hash2(c.ix, c.iz, c.n) : hash2(c.ix, c.iz, c.n * 31 + tries + frame * 7);
        const r = rng(seed), w = Math.floor(r() * cs.s.length / 2) * 2, P = net.paths[cs.s[w]];
        if (r() > P.w / 1.8 + 0.2) { c.n++; continue; }
        const u = Math.min(P.n - 1.001, cs.s[w + 1] + r() * 0.9);
        net.place(P, u, 0, tmp);
        if (!first) {
          const d = Math.hypot(tmp.x - cam.x, tmp.z - cam.z);
          sph.center.set(tmp.x, standY(tmp.x, tmp.z, false) + 1, tmp.z); sph.radius = 1;
          if (d < 90 && frustum.intersectsSphere(sph)) continue;
        }
        c.n++;
        spawnWalker(c, P, u, seed, r);
        budgetN--;
      }
      if (budgetN <= 0) break;
    }
  }
  function spawnWalker(c, P, u, seed, r) {
    const look = makeLook(seed), p = person(look, seed, 0);
    const dir = r() < 0.5 ? 1 : -1;
    p.nav = { path: P, u, dir, lat: 0, side: 0.2 + r() * 0.75, bias: 0, speed: (1.0 + r() * 0.45) * look.speed, cur: 0, lim: 9,
      wait: 0, waitClip: CLIP.idle, cross: false, waited: 0, crossKey: -1, hop: null, react: 0, rk: 0, pauseT: 15 + r() * 60, prev: -1, prevT: 0, acc: 0, rng: rng(seed ^ 0x5bd1e995) };
    p.nav.cur = p.nav.speed;
    net.place(P, u, 0, tmp);
    p.nav.lat = dir > 0 ? p.nav.side * tmp.hi : p.nav.side * tmp.lo;
    net.place(P, u, p.nav.lat, tmp);
    p.x = tmp.x; p.z = tmp.z; p.road = !!tmp.road; p.y = standY(p.x, p.z, p.road);
    p.ry = Math.atan2(tmp.tx * dir, tmp.tz * dir); p.clipA = CLIP.walk;
    p.cell = c; c.alive++; spawned++;
    walkers.push(p);
  }

  // ---------------------------------------------------------------- simulation
  const HB = 4096, hHead = new Int32Array(HB), hNext = new Int32Array(4096), hList = [];
  const hb = (x, z) => ((Math.floor(x / 2) * 73856093) ^ (Math.floor(z / 2) * 19349663)) & (HB - 1);
  function buildHash(cam) {
    hHead.fill(-1); hList.length = 0;
    for (const p of walkers) {
      if (p.kind !== 0 || p.dead || p._drop || hList.length >= hNext.length) continue;
      if (Math.abs(p.x - cam.x) > SIM_NEAR || Math.abs(p.z - cam.z) > SIM_NEAR) continue;
      const b = hb(p.x, p.z), i = hList.length; hList.push(p); hNext[i] = hHead[b]; hHead[b] = i;
    }
  }
  // personal space: slow behind someone going the same way, drift right when meeting someone head-on
  function neighbours(p, dt) {
    const w = p.nav, hx = Math.sin(p.ry), hz = Math.cos(p.ry);
    let lim = 9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      for (let i = hHead[hb(p.x + a * 2, p.z + b * 2)]; i >= 0; i = hNext[i]) {
        const q = hList[i]; if (q === p) continue;
        const dx = q.x - p.x, dz = q.z - p.z, d2 = dx * dx + dz * dz;
        if (d2 > 2.6 || d2 < 1e-6) continue;
        const ahead = dx * hx + dz * hz, side = Math.abs(-dx * hz + dz * hx);
        if (ahead < 0.05 || side > 0.75) continue;
        const same = hx * Math.sin(q.ry) + hz * Math.cos(q.ry);
        if (same > 0.3) { lim = Math.min(lim, q.nav ? q.nav.cur * 0.95 : 0.3); if (d2 < 1 && (!q.nav || q.nav.cur < 0.3)) w.bias = Math.min(1.2, w.bias + dt * 1.5); }
        else w.bias = Math.min(1.2, w.bias + dt * 2.5);
      }
    }
    w.lim = lim;
    w.bias = Math.max(0, w.bias - dt * 0.4);
  }
  function takeLink(p, l) {
    const w = p.nav, Q = net.paths[l.p];
    if (!Q || Q.n < 2) return false;
    const u2 = Math.min(Q.n - 1, Math.max(0, l.u2));
    const dir = u2 < 1 ? 1 : u2 > Q.n - 2 ? -1 : w.rng() < 0.5 ? 1 : -1;
    net.place(Q, u2, 0, tmp);
    const lat = dir > 0 ? w.side * tmp.hi : w.side * tmp.lo;
    net.place(Q, u2, lat, tmp);
    w.hop = { x0: p.x - (w.dash?.ox ?? 0), z0: p.z - (w.dash?.oz ?? 0), x1: tmp.x, z1: tmp.z, t: 0, len: Math.max(0.2, Math.hypot(tmp.x - p.x, tmp.z - p.z)), road: l.road };
    w.prev = w.path.id; w.prevT = time; w.path = Q; w.u = u2; w.dir = dir; w.lat = lat;
    return true;
  }

  function stepWalker(p, dt) {
    const w = p.nav, P = w.path;
    // what the walker wants to do now
    let want = w.speed * (P.kind === KIND.STEPS ? 0.7 : 1) * (p.road ? 1.2 : 1), clip = CLIP.walk;
    if (w.react > 0) {
      w.react -= dt;
      if (w.rk === REACT_COWER) { want = 0; clip = CLIP.cower; } else { want = w.rk === REACT_DASH ? 0.8 : 3.6 + w.speed; clip = CLIP.flee; }
    } else if (w.wait > 0) {
      w.wait -= dt; want = 0; clip = w.waitClip;
      if (w.wait <= 0 && w.cross && carNear(p.x, p.z, 22) && (w.waited += 0.4) < 12) w.wait = 0.4;
    } else want = Math.min(want, w.lim);
    const acc = want > w.cur ? 2.5 : 6;
    w.cur += Math.max(-acc * dt, Math.min(acc * dt, want - w.cur));
    if (w.cur < 0.12 && want === 0) w.cur = Math.max(0, w.cur - dt);
    const x0 = p.x, z0 = p.z;
    if (w.hop) {
      const h = w.hop; h.t = Math.min(1, h.t + w.cur * dt / h.len);
      p.x = h.x0 + (h.x1 - h.x0) * h.t; p.z = h.z0 + (h.z1 - h.z0) * h.t; p.road = !!h.road;
      if (h.t >= 1) w.hop = null;
    } else {
      const n = P.n, u0 = w.u;
      let i = Math.floor(w.u); if (w.dir < 0 && i === w.u && i > 0) i--; i = Math.min(n - 2, Math.max(0, i));
      w.u += w.dir * w.cur * dt / P.seg[i];
      // about to step onto the carriageway: look for traffic, sometimes pause at the kerb
      const iu = Math.round(w.u), ia = w.dir > 0 ? Math.min(n - 1, Math.floor(w.u) + 1) : Math.max(0, Math.ceil(w.u) - 1);
      if (w.react <= 0 && w.wait <= 0 && !P.road[iu] && P.road[ia] && w.crossKey !== P.id * 4096 + ia) {
        w.crossKey = P.id * 4096 + ia; w.cross = true; w.waited = 0;
        if (carNear(p.x, p.z, 22)) { w.wait = 0.4; w.waitClip = CLIP.idle; }
        else if (w.rng() < 0.25) { w.wait = 0.4 + w.rng() * 1.8; w.waitClip = CLIP.idle; }
        if (w.wait > 0) w.u = u0;
      }
      // mid-path junctions: sometimes turn off
      if (P.links.length && w.react <= 0) {
        const a = Math.min(u0, w.u), b = Math.max(u0, w.u);
        for (const l of P.links) {
          if (l.u <= a || l.u > b || l.u < 1 || l.u > n - 2) continue;
          if (l.p === w.prev && time - w.prevT < 8) continue;
          if (w.rng() < 0.22 && takeLink(p, l)) break;
        }
      }
      if (!w.hop) {
        const cur = w.path;
        if (w.u >= cur.n - 1 && w.dir > 0 || w.u <= 0 && w.dir < 0) {
          const end = w.dir > 0 ? cur.n - 1 : 0;
          w.u = end;
          const cand = cur.links.filter(l => Math.abs(l.u - end) <= 1.6 && !(l.p === w.prev && time - w.prevT < 4));
          if (!(cand.length && takeLink(p, cand[Math.floor(w.rng() * cand.length)]))) {
            w.dir = -w.dir;
            if (w.react <= 0) { w.wait = 0.3 + w.rng() * 1.5; w.waitClip = CLIP.idle; w.cross = false; }
          }
        }
        if (!w.hop) {
          net.place(w.path, w.u, 0, tmp);
          const t = w.dir > 0 ? w.side * tmp.hi : w.side * tmp.lo;
          const latT = t + w.dir * w.bias;
          w.lat += (latT - w.lat) * Math.min(1, dt * 1.2);
          net.place(w.path, w.u, w.lat, tmp);
          p.x = tmp.x; p.z = tmp.z; p.road = !!tmp.road;
        }
      }
      // an occasional stop to check the phone or look around (never on the carriageway)
      if ((w.pauseT -= dt) <= 0) {
        w.pauseT = 20 + w.rng() * 70;
        if (!p.road && w.react <= 0 && w.wait <= 0 && tmp.hi - tmp.lo > 1.2) { w.wait = 2 + w.rng() * 5; w.waitClip = w.rng() < 0.45 ? CLIP.phone : CLIP.idle; w.cross = false; }
      }
    }
    // a horn dash: an offset off the path, sprinted out while the reaction lasts, walked back once it is over
    const d = w.dash, dashing = !!d && w.react > 0 && w.rk !== REACT_COWER;
    if (d) {
      const tx = w.react > 0 ? d.x : 0, tz = w.react > 0 ? d.z : 0, ex = tx - d.ox, ez = tz - d.oz, e = Math.hypot(ex, ez);
      const st = (w.react <= 0 ? BACK_SPEED : dashing ? DASH_SPEED : 0) * dt, px = d.ox, pz = d.oz;
      if (e <= st) { d.ox = tx; d.oz = tz; } else { d.ox += ex / e * st; d.oz += ez / e * st; }
      // the path keeps moving under the offset: a step that would end inside a building stops the dash there
      if (w.react > 0 && isBuilding(p.x + d.ox, p.z + d.oz)) { d.ox = d.x = px; d.oz = d.z = pz; }
      if (w.react <= 0 && d.ox === 0 && d.oz === 0) w.dash = null;
      else { p.x += d.ox; p.z += d.oz; p.road = isAsphalt(p.x, p.z); }
    }
    const dx = p.x - x0, dz = p.z - z0, moved = Math.hypot(dx, dz);
    if (moved > 1e-4) turn(p, Math.atan2(dx, dz), dt * 7);
    const runW = dashing ? 1 : Math.min(1, Math.max(0, (w.cur - 2) / 1.5));
    p.phase = (p.phase + moved / ((WALK_STRIDE + (RUN_STRIDE - WALK_STRIDE) * runW) * p.look.sH)) % 1;
    p.y = standY(p.x, p.z, p.road);
    if (w.cur < 0.15 && want === 0) setClip(p, clip);
    else setClip(p, clip === CLIP.flee ? CLIP.flee : runW > 0.5 ? CLIP.run : CLIP.walk);
    fade(p, dt);
  }

  function stepActor(p, dt) {
    const x0 = p.x, z0 = p.z;
    let moving = false;
    if (p.hx !== undefined && p.hx !== null && p.hz !== undefined && p.hz !== null) {
      const dx = p.hx - p.x, dz = p.hz - p.z, d = Math.hypot(dx, dz);
      if (d > 0.3) {
        const sp = p.goSpeed > 0 ? p.goSpeed : 1.3, s = Math.min(d, sp * dt);
        p.x += dx / d * s; p.z += dz / d * s; moving = true;
        turn(p, Math.atan2(dx, dz), dt * 8);
        setClip(p, sp > 2.4 ? CLIP.run : CLIP.walk);
        const runW = Math.min(1, Math.max(0, (sp - 2) / 1.5));
        p.phase = (p.phase + s / ((WALK_STRIDE + (RUN_STRIDE - WALK_STRIDE) * runW) * p.look.sH)) % 1;
      }
    }
    if (!moving) {
      setClip(p, clipId(p.idleClip ?? p.clip));
      if (typeof p.hry === 'number') turn(p, p.hry, dt * 5);
    }
    if (p.x !== x0 || p.z !== z0 || frame % 8 === 0) { p.road = isAsphalt(p.x, p.z); p.y = standY(p.x, p.z, p.road); }
    fade(p, dt);
  }

  function stepStatic(p, dt) {
    if (p.react > 0) p.react -= dt;
    const d = p.dash;
    if (d) { // horn dash: sprint to the spot, then walk back to the group and face it again
      const tx = p.react > 0 ? d.x : d.hx, tz = p.react > 0 ? d.z : d.hz, ex = tx - p.x, ez = tz - p.z, e = Math.hypot(ex, ez);
      const st = (p.react > 0 ? DASH_SPEED : BACK_SPEED) * dt;
      if (e > st) {
        p.x += ex / e * st; p.z += ez / e * st; turn(p, Math.atan2(ex, ez), dt * 8);
        p.phase = (p.phase + st / ((p.react > 0 ? RUN_STRIDE : WALK_STRIDE) * p.look.sH)) % 1;
      } else { p.x = tx; p.z = tz; if (p.react <= 0) p.dash = null; }
      p.y = standY(p.x, p.z, false);
      setClip(p, p.react > 0 ? (e > st ? CLIP.flee : CLIP.cower) : e > st ? CLIP.walk : p.base);
      if (!p.dash) p.ry0 = d.ry;
    } else {
      if (p.ry0 !== undefined) { turn(p, p.ry0, dt * 4); if (Math.abs(Math.sin((p.ry0 - p.ry) / 2)) < 0.01) p.ry0 = undefined; }
      setClip(p, p.react > 0 ? CLIP.cower : p.base);
    }
    fade(p, dt);
  }

  const glanceStep = (p, dt) => {
    let t = 0;
    if (p.glance > 0) { p.glance -= dt; let d = p.glanceYaw - p.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); t = Math.max(-1.1, Math.min(1.1, d)); }
    p.headYaw += (t - p.headYaw) * Math.min(1, dt * 5);
  };

  function simulate(dt, cam) {
    buildHash(cam);
    for (const p of walkers) {
      if (p.dead || p._drop || p._removed) continue;
      if (p.kind === 2) { stepActor(p, dt); glanceStep(p, dt); continue; }
      const far = Math.abs(p.x - cam.x) > SIM_NEAR || Math.abs(p.z - cam.z) > SIM_NEAR;
      if (far) {
        const w = p.nav; w.acc += dt;
        if ((p.id + frame) % 4 !== 0) continue;
        const d = Math.min(0.25, w.acc); w.acc = 0; w.lim = 9;
        stepWalker(p, d);
        if ((p.x - cam.x) ** 2 + (p.z - cam.z) ** 2 > R_DROP * R_DROP) p._drop = true;
      } else { neighbours(p, dt); stepWalker(p, dt); glanceStep(p, dt); }
    }
    for (const p of statics) if (!p.dead && !p._drop) { stepStatic(p, dt); glanceStep(p, dt); }
  }

  // the graphics quality's draw reach (setDrawDistance): ambient people beyond `view` are not drawn, LOD / blob distances
  // scale by k; the simulation is the same at every level
  const draw = { view: VIEW, k: 1 };
  function render(cam) {
    mats.uniforms.uTime.value = time;
    for (const l of layers) l.begin();
    let nb = 0;
    const B = blobs ? blobs.instanceMatrix.array : null;
    for (const list of [walkers, statics]) for (const p of list) {
      if (p.dead || p._drop || p._removed) continue;
      const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > (p.kind === 2 ? VIEW : draw.view)) { p.lod = -1; continue; } // mission actors keep the full reach
      sph.center.set(p.x, p.y + 0.9 * p.look.sH, p.z); sph.radius = 1.1;
      if (!frustum.intersectsSphere(sph)) continue;
      const hy = p.lod === 2 ? 3 : p.lod === 1 ? 5 : 0; // hysteresis against LOD flicker
      const lod = d < LOD_NEAR * draw.k + (p.lod === 2 ? 3 : 0) ? 2 : d < LOD_MID * draw.k + hy ? 1 : 0;
      p.lod = lod;
      if (!layers[lod].push(p) && lod > 0) layers[lod - 1].push(p);
      if (B && d < BLOB_R * draw.k && nb < 1200) {
        const o = nb * 16, s = 0.75 * p.look.sH * p.look.girth * (p.clipA === CLIP.cower ? 1.3 : 1);
        B[o] = s; B[o + 1] = 0; B[o + 2] = 0; B[o + 3] = 0; B[o + 4] = 0; B[o + 5] = 1; B[o + 6] = 0; B[o + 7] = 0;
        B[o + 8] = 0; B[o + 9] = 0; B[o + 10] = s; B[o + 11] = 0; B[o + 12] = p.x; B[o + 13] = p.y + 0.015; B[o + 14] = p.z; B[o + 15] = 1;
        nb++;
      }
    }
    for (const l of layers) l.end();
    if (blobs) { blobs.count = nb; blobs.visible = nb > 0; if (nb) blobs.instanceMatrix.needsUpdate = true; }
  }

  function compact() {
    let k = 0;
    for (let i = 0; i < walkers.length; i++) {
      const p = walkers[i];
      if (p.dead || p._drop || p._removed) { if (p.kind === 0 && p.cell) { p.cell.alive--; p.cell = null; } p.road = false; continue; }
      walkers[k++] = p;
    }
    walkers.length = k;
    k = 0;
    for (let i = 0; i < statics.length; i++) if (!statics[i].dead && !statics[i]._drop) statics[k++] = statics[i];
    statics.length = k;
    k = 0;
    for (let i = 0; i < actors.length; i++) if (!actors[i]._removed) actors[k++] = actors[i];
    actors.length = k;
  }

  // ---------------------------------------------------------------- reactions
  function scareWalker(p, fx, fz, cower, dur) {
    if (p.kind === 1) { p.react = dur; return; }
    const w = p.nav; if (!w) return;
    w.wait = 0; w.react = dur; w.rk = cower ? REACT_COWER : REACT_FLEE;
    if (!cower && !w.hop) { // run along the path away from the threat
      net.place(w.path, w.u, w.lat, tmp);
      const away = (p.x - fx) * tmp.tx + (p.z - fz) * tmp.tz;
      w.dir = away >= 0 ? 1 : -1;
    }
  }
  function alarm(pos, r = 20) {
    if (!pos) return;
    const x = pos.x, z = pos.z;
    for (const list of [walkers, statics]) for (const p of list) {
      if (p.kind === 2 || p.dead || p._drop) continue;
      const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d2 > r * r) continue;
      const rr = rng(p.id * 131 + frame)();
      scareWalker(p, x, z, p.kind === 1 ? rr < 0.7 : rr < 0.25, 2.5 + rr * 3.5);
      p.glance = 1.5; p.glanceYaw = Math.atan2(x - p.x, z - p.z);
    }
    flocks?.startle(x, z, r + 10);
  }
  // the horn: everyone in a cone ahead of the car runs off its line, each to their own side (a coin toss for those
  // dead ahead), a little forward and at a slant, so a crowd splits apart; never into a building or the river
  const HONK_R = 45;
  function dashTarget(x, z, dx, dz, len) { // -> the share of len that is clear ground, or 0
    for (const k of [1, 0.6, 0.35]) {
      const L = len * k;
      if (!isBuilding(x + dx * L, z + dz * L) && !isWater(x + dx * L, z + dz * L) && !isBuilding(x + dx * L * 0.5, z + dz * L * 0.5)) return k;
    }
    return 0;
  }
  function honk(q) {
    if (!q) return;
    const fl = Math.hypot(q.fx, q.fz) || 1, fx = q.fx / fl, fz = q.fz / fl, sx = fz, sz = -fx;
    for (const list of [walkers, statics]) for (const p of list) {
      if (p.kind === 2 || p.dead || p._drop || p._removed) continue;
      const ox = p.x - q.x, oz = p.z - q.z;
      if (Math.abs(ox) > HONK_R || Math.abs(oz) > HONK_R || Math.abs(p.y - (q.y ?? p.y)) > 20) continue;
      const a = ox * fx + oz * fz, b = ox * sx + oz * sz;
      if (a < -2 || a > HONK_R || Math.abs(b) > 5 + a * 0.4) continue;
      const w = p.nav, busy = p.kind === 1 ? p.dash && p.react > 0 : w.rk === REACT_DASH && w.react > 0;
      p.glance = 1.5; p.glanceYaw = Math.atan2(-ox, -oz);
      if (busy) { if (w) w.react = Math.max(w.react, 1.5); else p.react = Math.max(p.react, 1.5); continue; }
      const r = rng(p.id * 977 + frame);
      let side = Math.abs(b) < 1.2 ? (r() < 0.5 ? -1 : 1) : Math.sign(b);
      // how far: enough to clear the car's line for those in front of it, less for the ones already on the side
      const len = Math.max(2.5, 4 + r() * 3.5 - Math.max(0, Math.abs(b) - 3) * 0.5), slant = 0.15 + r() * 0.5;
      let dx = side * sx + fx * slant, dz = side * sz + fz * slant;
      const n = Math.hypot(dx, dz); dx /= n; dz /= n;
      let k = dashTarget(p.x, p.z, dx, dz, len);
      if (!k) { side = -side; dx = side * sx + fx * slant; dz = side * sz + fz * slant; const m = Math.hypot(dx, dz); dx /= m; dz /= m; k = dashTarget(p.x, p.z, dx, dz, len); }
      const dur = 2.2 + r() * 1.8, cower = r() < 0.08;
      if (p.kind === 1) {
        p.react = dur;
        if (k && !cower) {
          const d0 = p.dash;
          p.dash = { x: p.x + dx * len * k, z: p.z + dz * len * k, hx: d0 ? d0.hx : p.x, hz: d0 ? d0.hz : p.z, ry: d0 ? d0.ry : p.ry0 ?? p.ry };
        }
        continue;
      }
      if (!k || cower) { scareWalker(p, q.x, q.z, cower, dur); continue; }
      scareWalker(p, q.x, q.z, false, dur);
      w.rk = REACT_DASH;
      const d0 = w.dash;
      w.dash = { x: (d0 ? d0.ox : 0) + dx * len * k, z: (d0 ? d0.oz : 0) + dz * len * k, ox: d0 ? d0.ox : 0, oz: d0 ? d0.oz : 0 };
    }
    flocks?.startle(q.x + fx * 15, q.z + fz * 15, 22);
  }
  // a moving vehicle near people at their height: glances, dodges out of its way; low passes startle pigeons
  function danger(q, sp) {
    if (sp < 4) return;
    const k = Math.min(1.5, 18 / sp), ex = q.x + q.vx * k, ez = q.z + q.vz * k;
    const sx = ex - q.x, sz = ez - q.z, L2 = sx * sx + sz * sz || 1;
    for (const p of walkers) {
      if (p.kind !== 0 || p.dead || p._drop) continue;
      const dx = p.x - q.x, dz = p.z - q.z;
      if (dx * dx + dz * dz > 900 || q.y0 > p.y + 3.5) continue;
      const t = Math.max(0, Math.min(1, (dx * sx + dz * sz) / L2)), px = dx - sx * t, pz = dz - sz * t, d = Math.hypot(px, pz);
      if (d < q.hw + 2.2 && p.nav.react <= 0) {
        scareWalker(p, q.x, q.z, d < q.hw * 0.6 && sp > 12, 1.2 + (p.id % 7) * 0.12);
        p.nav.bias = 1.2;
      }
      if (sp > 8 && dx * dx + dz * dz < 400) { p.glance = 1.4; p.glanceYaw = Math.atan2(q.x - p.x, q.z - p.z); }
    }
    flocks?.threat(q.x, q.y0 ?? 0, q.z, 14 + sp * 0.4);
  }
  function kill(p, q) {
    p.dead = true; p.road = false; hits++;
    cue('splat', { x: p.x, y: p.y, z: p.z });
    const g = p.look.gib;
    try { gibs?.burst?.(p.x, p.y, p.z, q.vx || 0, q.vy || 0, q.vz || 0, [g.top, g.bottom, g.outer], g.skin, { hair: g.hair, scale: p.look.sH }); } catch (e) { console.warn('[people] gibs failed', e); }
  }

  // ---------------------------------------------------------------- api
  const api = {
    walkers, statics, actors, lanes: net.paths, root,
    update(dt, camera) {
      if (!camera) return;
      const t0 = performance.now();
      dt = Math.min(0.1, Math.max(0, dt || 0)); time += dt; frame++;
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const cam = camera.position;
      try {
        stream(cam);
        spawnPass(cam);
        simulate(dt, cam);
        render(cam);
        flocks?.update(dt, camera, frustum);
      } catch (e) { if (!api._err) { api._err = true; console.error('[people] update failed', e); } }
      compact();
      const ms = performance.now() - t0;
      prof.ms = prof.ms * 0.95 + ms * 0.05; if (frame > 60) prof.max = Math.max(prof.max * 0.998, ms);
    },
    hitBox(q) {
      if (!q) return 0;
      const vx = q.vx || 0, vy = q.vy || 0, vz = q.vz || 0, sp = Math.hypot(vx, vy, vz);
      const fl = Math.hypot(q.fx, q.fz) || 1, fx = q.fx / fl, fz = q.fz / fl, R = Math.hypot(q.hl, q.hw) + 1;
      const Q = { x: q.x, z: q.z, vx, vy, vz, hw: q.hw, y0: q.y0 };
      let n = 0;
      for (const list of [walkers, statics]) for (const p of list) {
        if (p.dead || p._drop || p._removed) continue;
        const dx = p.x - q.x, dz = p.z - q.z;
        if (Math.abs(dx) > R || Math.abs(dz) > R) continue;
        const a = dx * fx + dz * fz, b = -dx * fz + dz * fx;
        if (Math.abs(a) > q.hl + 0.25 || Math.abs(b) > q.hw + 0.25) continue;
        if (q.y0 > p.y + 1.75 * p.look.sH || q.y1 < p.y) continue;
        if (sp < 2.5) { if (p.kind !== 2) scareWalker(p, q.x, q.z, false, 1.2); continue; } // a parked or creeping car only shoos people
        kill(p, Q); n++;
      }
      if (n) alarm({ x: q.x, z: q.z }, 24);
      danger(Q, sp);
      return n;
    },
    alarm, honk,
    spawnActor({ x, z, ry = 0, clip = 'idle', seed, kind } = {}) {
      const s = (seed ?? Math.floor(Math.random() * 1e9)) >>> 0, p = person(makeLook(s, kind || null), s, 2);
      p.x = x; p.z = z; p.ry = ry; p.clip = clip; p.idleClip = clip; p.clipA = clipId(clip);
      p.road = isAsphalt(x, z); p.y = standY(x, z, p.road);
      walkers.push(p); actors.push(p);
      return p;
    },
    removeActor(a) {
      if (!a || a._removed || a.kind !== 2) return;
      a._removed = true; a.road = false;
    },
    pedOnRoad(x, z, r = 3) { for (const p of walkers) if (p.road && !p.dead && (p.x - x) ** 2 + (p.z - z) ** 2 < r * r) return true; return false; },
    setTraffic(t) { traffic = t; t?.setPeds?.(api); },
    setDrawDistance(view = VIEW, k = 1) { draw.view = Math.min(VIEW, view); draw.k = k; },
    stats() {
      let active = 0, quota = 0; for (const c of cells.values()) if (c.active) { active++; quota += c.eff; }
      return { walkers: walkers.length - actors.length, statics: statics.length, actors: actors.length, onRoad: walkers.filter(p => p.road).length,
        cells: active, quota, spawned, hits, drawn: layers.map(l => l.count), tris: layers.reduce((s, l) => s + l.count * l.tris, 0),
        net: net.stats(), birds: flocks?.stats() ?? null, ms: +prof.ms.toFixed(3), maxMs: +prof.max.toFixed(2), streamMs: +prof.stream.toFixed(3) };
    },
    dispose() {
      scene.remove(root);
      for (const l of layers) l.mesh.geometry.dispose();
      mats.mat.dispose(); mats.depth.dispose(); flocks?.dispose();
      if (blobs) { blobs.geometry.dispose(); blobs.material.dispose(); }
    },
  };
  traffic?.setPeds?.(api);
  return api;
}
