// Flat test world for the car, the HUD and the missions when the Cherkasy city is not available (and for demos/car).
// It implements the same world contract the city does (see src/main.js), on a synthetic grid town:
//   createTestWorld({ scene, seed = 7 }) -> world
//     world.raycast(o, d, max), groundHeight(x, z, yHint), surfaceAt(x, z, yHint), collision (createCollisionWorld)
//     world.spawn / spawnYaw / carSpawn / carSpawnYaw, streetsAt(x, z) -> { type: 'street' | 'sidewalk' }
//     world.ram(q) -> { dv, push, hits, trees, severity, people }  the car's box knocks the loose crates around
//     world.cherkasy = { map, ground }  a map.json-shaped subset (roads with names, pois, buildings, water) so missions
//       can pick destinations, and ground.{ heightAt, isWater, onAsphalt }
//     world.mapFeatures  minimap features in the HUD's format (src/ui/hud.js)
//     world.update(dt, camera), world.crates (debug), world.course (named test spots: ramp, wall, crates, roof, water)
// Layout: roads every 200 m (12 m wide) over +-1200 m, blocks of box buildings (8..60 m, flat roofs), a launch ramp on
// the road ahead of the spawn, a test course in the block beside it (kicker, wall, bollards, a ramp up onto a low garage
// roof, a stack of crates), the river beyond z = 1250.
import * as THREE from 'three';
import { createCollisionWorld } from '../world/collision.js';

const GRID = 200, HALF = 6, ROAD_W = 12, RIVER_Z = 1250, RIVER_BED = -4, WATER_Y = -1.2;
const CRATE = 1.2;

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return (a >>> 0) / 4294967296; };
}
const rect = (x0, z0, x1, z1) => [x0, z0, x1, z0, x1, z1, x0, z1]; // CCW in x/z

export function createTestWorld({ scene, seed = 7 } = {}) {
  const rand = rng(seed);
  const root = new THREE.Group(); root.name = 'test-world'; scene.add(root);
  const terrain = { height: (x, z) => (z > RIVER_Z ? RIVER_BED : 0), minY: RIVER_BED - 1, maxY: 1 };
  const cw = createCollisionWorld({ cell: 24, terrain });
  const onRoad = (x, z) => {
    const mx = ((x % GRID) + GRID) % GRID, mz = ((z % GRID) + GRID) % GRID, h = ROAD_W / 2;
    return z <= RIVER_Z && Math.abs(x) <= HALF * GRID + h && Math.abs(z) <= HALF * GRID + h && (mx < h || mx > GRID - h || mz < h || mz > GRID - h);
  };

  // ---------------------------------------------------------------- ground, roads, river
  const L = HALF * GRID + 300;
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(2 * L, RIVER_Z + L).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x6b7a55, roughness: 0.95 }));
  grass.position.set(0, 0, (RIVER_Z - L) / 2); grass.receiveShadow = true; root.add(grass);
  const roadGeo = [], names = ['Шевченка', 'Смілянська', 'Хрещатик', 'Гоголя', 'Байди Вишневецького', 'Остафія Дашковича', 'Благовісна',
    'Святотроїцька', 'Небесної Сотні', 'Пастерівська', 'Вернигори', 'Надпільна', 'Громова'];
  const roads = [];
  for (let k = -HALF; k <= HALF; k++) {
    const c = k * GRID, e = HALF * GRID + ROAD_W / 2;
    roadGeo.push([c, 0, 2 * e, ROAD_W], [0, c, ROAD_W, 2 * e]);
    roads.push({ p: [c, -e, c, Math.min(e, RIVER_Z)], w: ROAD_W, k: 'm', c: 'secondary', n: `вул. ${names[k + HALF]}` });
    roads.push({ p: [-e, c, e, c], w: ROAD_W, k: 'm', c: 'secondary', n: `вул. ${names[(k + HALF + 5) % names.length]}` });
  }
  // asphalt: one instanced unit quad per road strip (x-running strips a hair higher so crossings do not flicker)
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const asphalt = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3b3e44, roughness: 0.9 }), roadGeo.length);
  roadGeo.forEach(([cx, cz, w, d], i) => asphalt.setMatrixAt(i, m4.makeScale(w, 1, d).setPosition(cx, w > d ? 0.035 : 0.03, cz)));
  asphalt.receiveShadow = true; root.add(asphalt);
  const river = new THREE.Mesh(new THREE.PlaneGeometry(2 * L + 2000, 1600).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2d5a78, roughness: 0.15, metalness: 0.1 }));
  river.position.set(0, WATER_Y, RIVER_Z + 800); root.add(river);
  const bank = new THREE.Mesh(new THREE.BoxGeometry(2 * L, 5, 4), new THREE.MeshStandardMaterial({ color: 0x8a8272 }));
  bank.position.set(0, -2.5, RIVER_Z + 2); root.add(bank);

  // ---------------------------------------------------------------- buildings (instanced boxes, collision prisms)
  const footprints = [], blds = [];
  const course = { x0: 6, z0: 6, x1: GRID - 6, z1: GRID - 6 }; // block (0,0)-(200,200) holds the test course
  for (let bx = -HALF; bx < HALF; bx++) for (let bz = -HALF; bz < HALF; bz++) {
    const x0 = bx * GRID + ROAD_W / 2 + 4, z0 = bz * GRID + ROAD_W / 2 + 4, span = GRID - ROAD_W - 8;
    if (bx === 0 && bz === 0) continue;
    if (bz * GRID + GRID > RIVER_Z) continue;
    if ((bx * 7 + bz * 13 + 100) % 9 === 0) { footprints.push({ park: rect(x0, z0, x0 + span, z0 + span) }); continue; }
    for (let i = 0, count = 2 + Math.floor(rand() * 3); i < count; i++) {
      const w = 30 + rand() * 45, d = 30 + rand() * 45;
      const qx = i % 2 ? x0 + span - w : x0, qz = i >= 2 ? z0 + span - d : z0;
      const h = 8 + Math.pow(rand(), 1.6) * 52;
      blds.push({ x0: qx, z0: qz, x1: qx + w, z1: qz + d, h });
    }
  }
  // the course's garage roof (low, easy to land on) and a tall landmark next to it
  blds.push({ x0: 120, z0: 130, x1: 180, z1: 185, h: 9, name: 'Гараж' }, { x0: 20, z0: 150, x1: 50, z1: 185, h: 34, name: 'Вежа' });
  // unit boxes standing on y = 0, scaled per building; each also a collision prism (its roof is a landing pad)
  const bMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.8 }), blds.length);
  blds.forEach((b, i) => {
    cw.prism(rect(b.x0, b.z0, b.x1, b.z1), -0.5, b.h, 0, 0, 'building');
    m4.makeScale(b.x1 - b.x0, b.h, b.z1 - b.z0).setPosition((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
    bMesh.setMatrixAt(i, m4);
    bMesh.setColorAt(i, col.setHSL(0.08 + rand() * 0.08, 0.12 + rand() * 0.15, 0.55 + rand() * 0.25));
  });
  bMesh.castShadow = bMesh.receiveShadow = true; root.add(bMesh);

  // ---------------------------------------------------------------- the test course
  const propMat = new THREE.MeshStandardMaterial({ color: 0xc9b27c, roughness: 0.7 });
  // ramp rising along +z from (x0..x1, z0) to height h at z1: a sloped-top collision prism and a wedge mesh
  function ramp(x0, x1, z0, z1, h) {
    const bz = h / (z1 - z0);
    cw.prism(rect(x0, z0, x1, z1), -0.2, -bz * z0, 0, bz, 'ramp');
    const s = new THREE.Shape([new THREE.Vector2(z0, 0), new THREE.Vector2(z1, 0), new THREE.Vector2(z1, h)]);
    const g = new THREE.ExtrudeGeometry(s, { depth: x1 - x0, bevelEnabled: false });
    g.rotateY(-Math.PI / 2); g.translate(x1, 0, 0);
    const m = new THREE.Mesh(g, propMat); m.castShadow = m.receiveShadow = true; root.add(m);
    // the drop-off face under the high end
    cw.box(x0, -0.2, z1, x1, h, z1 + 0.4, 'ramp');
    const back = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, 0.4), propMat); back.position.set((x0 + x1) / 2, h / 2, z1 + 0.2); root.add(back);
  }
  ramp(-5, 5, 300, 340, 5);     // launch ramp on the road straight ahead of the spawn (290 m run-up)
  ramp(44, 56, 30, 42, 1.4);    // kicker
  ramp(120, 135, 60, 130, 9);   // up onto the garage roof
  const wall = (x0, z0, x1, z1, h) => {
    cw.box(x0, 0, z0, x1, h, z1, 'wall');
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), new THREE.MeshStandardMaterial({ color: 0x9a3b2e, roughness: 0.8 }));
    m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2); m.castShadow = m.receiveShadow = true; root.add(m);
  };
  wall(70, 100, 110, 101.2, 3);   // a long wall across the course
  wall(-4.5, 240, 4.5, 241, 0.3); // a kerb-height strip on the road north of the spawn
  for (let i = 0; i < 6; i++) { // bollards (cylinders)
    const x = 80 + i * 4, z = 40;
    cw.cyl(x, z, 0, 1.1, 0.25, 0.25, 'post');
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.1, 12), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    m.position.set(x, 0.55, z); root.add(m);
  }

  // ---------------------------------------------------------------- loose crates (rammable)
  const crates = [];
  const cMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CRATE, CRATE, CRATE), new THREE.MeshStandardMaterial({ color: 0xb07a3a, roughness: 0.8 }), 36);
  cMesh.castShadow = true; cMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(cMesh);
  for (let i = 0; i < 36; i++) {
    const layer = Math.floor(i / 12), k = i % 12;
    crates.push({ p: new THREE.Vector3(70 + (k % 4) * 1.3 + layer * 0.3, CRATE / 2 + layer * CRATE, 70 + Math.floor(k / 4) * 1.3),
      v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), sleep: true });
  }
  const _one = new THREE.Vector3(1, 1, 1), _dq = new THREE.Quaternion(), _ax = new THREE.Vector3();
  function drawCrates() {
    crates.forEach((c, i) => cMesh.setMatrixAt(i, m4.compose(c.p, c.q, _one)));
    cMesh.instanceMatrix.needsUpdate = true;
  }
  drawCrates();
  const ramRes = { dv: new THREE.Vector3(), push: new THREE.Vector3(), hits: 0, knocked: 0, severity: 0, trees: 0, people: 0 };
  function ram(q) {
    ramRes.dv.set(0, 0, 0); ramRes.push.set(0, 0, 0); ramRes.hits = ramRes.knocked = 0; ramRes.severity = 0;
    const sp = Math.hypot(q.v.x, q.v.z);
    for (const c of crates) {
      const dx = c.p.x - q.x, dz = c.p.z - q.z;
      if (Math.abs(dx) > 5 || Math.abs(dz) > 5 || c.p.y > q.y + q.h + CRATE / 2 || c.p.y < q.y - CRATE) continue;
      const lf = dx * q.fx + dz * q.fz, ls = dx * q.fz - dz * q.fx;
      if (Math.abs(lf) > q.hl + CRATE / 2 || Math.abs(ls) > q.hw + CRATE / 2) continue;
      // a crate is ~40 kg against a 3 t car: it takes the car's speed plus a kick, the car loses a sliver
      const out = Math.sign(ls || 1) * 0.35;
      c.v.set(q.v.x * 1.25 + q.fz * out * sp, 2 + sp * 0.18, q.v.z * 1.25 - q.fx * out * sp);
      c.w.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(4 + sp * 0.4);
      c.sleep = false; c.p.addScaledVector(c.v, 0.02);
      ramRes.dv.x -= q.v.x * 0.012; ramRes.dv.z -= q.v.z * 0.012;
      ramRes.hits++; ramRes.knocked++;
      ramRes.severity = Math.max(ramRes.severity, Math.min(0.2, sp / 150));
    }
    return ramRes;
  }
  function stepCrates(dt) {
    let moved = false;
    for (const c of crates) {
      if (c.sleep) continue;
      moved = true;
      c.v.y -= 9.81 * dt; c.p.addScaledVector(c.v, dt);
      const wl = c.w.length();
      if (wl > 1e-4) { _dq.setFromAxisAngle(_ax.copy(c.w).divideScalar(wl), wl * dt); c.q.premultiply(_dq); }
      const g = cw.groundHeight(c.p.x, c.p.z, c.p.y + 0.5) + CRATE / 2;
      if (c.p.y < g) {
        c.p.y = g; c.v.y = Math.abs(c.v.y) > 2 ? -c.v.y * 0.3 : 0;
        c.v.x *= Math.exp(-6 * dt); c.v.z *= Math.exp(-6 * dt); c.w.multiplyScalar(Math.exp(-5 * dt));
        if (c.v.lengthSq() < 0.04 && c.w.lengthSq() < 0.04) c.sleep = true;
      }
      if (c.p.y < RIVER_BED - 5) { c.sleep = true; }
    }
    if (moved) drawCrates();
  }

  // ---------------------------------------------------------------- map-shaped data (missions) and minimap features
  const pois = [];
  const poiNames = [['Пам’ятник Кобзарю', { historic: 'monument' }], ['Меморіал', { historic: 'memorial' }], ['Драмтеатр', { amenity: 'theatre' }],
    ['Фонтан', { amenity: 'fountain' }], ['Собор', { amenity: 'place_of_worship' }], ['Скульптура «Птах»', { tourism: 'artwork' }],
    ['Оглядовий майданчик', { tourism: 'attraction' }], ['Відділ поліції', { amenity: 'police' }], ['Коледж', { amenity: 'college' }],
    ['Планетарій', { amenity: 'planetarium' }], ['Гармата', { historic: 'cannon' }], ['Будинок культури', { amenity: 'community_centre' }]];
  poiNames.forEach(([name, tags], i) => {
    const a = i * 2.39996, r = 380 + (i * 173) % 700;
    const x = Math.round(Math.cos(a) * r / GRID) * GRID + ROAD_W, z = Math.min(RIVER_Z - 60, Math.round(Math.sin(a) * r / 20) * 20);
    pois.push({ id: `t${i}`, x, z, name, tags });
  });
  const buildings = blds.map((b, i) => ({ id: i, p: rect(b.x0, b.z0, b.x1, b.z1), h: b.h, k: 'yes', area: (b.x1 - b.x0) * (b.z1 - b.z0), name: b.name }));
  const E = HALF * GRID + 300;
  const map = {
    region: { x0: -E, z0: -E, x1: E, z1: RIVER_Z },
    roads, pois, buildings, water: [[rect(-E - 1000, RIVER_Z, E + 1000, RIVER_Z + 1600)]], trees: [],
    cover: { park: footprints.filter(f => f.park).map(f => [f.park]) },
  };
  const ground = {
    heightAt: terrain.height,
    isWater: (x, z) => z > RIVER_Z,
    onAsphalt: onRoad,
  };
  const mapFeatures = {
    blocks: [[rect(-E, -E, E, RIVER_Z)]],
    roads: roads.map(r => ({ p: r.p, w: r.w })),
    water: map.water,
    parks: map.cover.park,
    buildings: buildings.map(b => b.p),
  };

  // ---------------------------------------------------------------- spawn
  const carSpawn = new THREE.Vector3(3, 0, 12), carSpawnYaw = 0; // right-hand lane of the x = 0 road, facing +z
  const world = {
    collision: cw,
    raycast: (o, d, max) => cw.raycast(o, d, max),
    groundHeight: (x, z, yHint) => cw.groundHeight(x, z, yHint),
    surfaceAt: (x, z, yHint) => cw.surfaceAt(x, z, yHint),
    spawn: new THREE.Vector3(-8, 0, 12), spawnYaw: 0, carSpawn, carSpawnYaw,
    streetsAt: (x, z) => ({ type: onRoad(x, z) ? 'street' : 'sidewalk' }),
    ram, collideDynamic: null,
    cherkasy: { map, ground },
    mapFeatures,
    crates, root,
    course: { ramp: [0, 0, 300], kicker: [50, 0, 24], wall: [90, 0, 90], roofRamp: [127, 0, 50], roof: [150, 9, 160], crates: [72, 0, 60], water: [0, 0, RIVER_Z + 40], tower: [35, 34, 167] },
    update(dt) { stepCrates(Math.min(dt, 0.05)); },
  };
  return world;
}
