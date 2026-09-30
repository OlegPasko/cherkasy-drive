// Headless tests for src/world/collision.js and src/game/car/collide.js. Run: node tests/collision.test.mjs
// Synthetic scenes (tunnelling, corners, concave / holed prisms, stacked tops, overhangs, disable) + a benchmark on
// the real Cherkasy footprints (public/assets/cherkasy/map_buildings.json).
import { readFileSync, existsSync } from 'node:fs';
import { createCollisionWorld, createWorldQueries, convexPieces, OVERHANG } from '../src/world/collision.js';
import { createCarCollider, pushOutCapsule, slideVelocity } from '../src/game/car/collide.js';

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL', msg); } };
const near = (a, b, e, msg) => ok(Math.abs(a - b) <= e, `${msg}: ${a} vs ${b}`);
const V = (x, y, z) => ({ x, y, z });
const area = (P) => { let a = 0; for (let i = 0; i < P.length; i += 2) { const j = (i + 2) % P.length; a += P[i] * P[j + 1] - P[j] * P[i + 1]; } return a / 2; };

// ---------------------------------------------------------------- registration
{
  const w = createCollisionWorld();
  ok(w.box(0, 0, 0, 0, 1, 1) === -1, 'zero-width box rejected');
  ok(w.box(0, NaN, 0, 1, 1, 1) === -1, 'NaN box rejected');
  ok(w.cyl(0, 0, 0, 5, 0, 0) === -1, 'zero radius cylinder rejected');
  ok(w.prism([0, 0, 1, 1, 2, 2], 0, 5) === -1, 'collinear prism rejected');
  ok(w.prism([0, 0, 1, 0, 1, 1, 0, 1], 5, 5) === -1, 'flat prism rejected');
  ok(w.box(1, 1, 1, 0, 0, 0) >= 0, 'reversed box normalized');
  ok(w.count === 1, 'only valid solids stored');
  ok(w.groundHeight(1e6, -1e6) === 0 && w.raycast(V(1e6, 5, 0), V(1, 0, 0), 100, null, true) === null, 'far outside the grid: finite ground, no hit');
  ok(w.raycast(V(0, 5, 0), V(0, 0, 0), 10) === null, 'zero direction -> no hit');
}

// ---------------------------------------------------------------- ground height / tops / overhang
{
  const w = createCollisionWorld();
  const a = w.box(0, 0, 0, 10, 3, 10, 'wall');       // building
  const b = w.box(2, 3, 2, 8, 6, 8, 'wall');         // stacked storey
  const c = w.box(-5, 4, -5, 0, 4.3, 5, 'awning', OVERHANG); // canopy beside it
  near(w.groundHeight(5, 5), 6, 1e-9, 'no hint: highest top');
  near(w.groundHeight(5, 5, 4), 3, 1e-9, 'hint between storeys -> lower roof');
  near(w.groundHeight(1, 1, 100), 3, 1e-9, 'outside upper storey');
  near(w.groundHeight(-2, 0), 0, 1e-9, 'no hint ignores overhang');
  near(w.groundHeight(-2, 0, 5), 4.3, 1e-9, 'hint above canopy lands on it');
  near(w.groundHeight(-2, 0, 2), 0, 1e-9, 'under the canopy: road');
  const t = w.topAt(20, 20); ok(t.id === -1 && t.y === -Infinity, 'topAt miss is unambiguous');
  ok(w.topAt(5, 5).id === b, 'topAt id');
  ok(w.topAt(5, 5, 4).id === a, 'topAt with ceiling');
  near(w.ceilingAt(-2, 0, 1), 4, 1e-9, 'ceiling under canopy');
  ok(w.ceilingAt(20, 20, 0) === Infinity, 'no ceiling');
  ok(w.inside(5, 1, 5) && !w.inside(5, 7, 5) && w.solidAt(5, 4, 5) === b, 'inside / solidAt');
  ok(w.surfaceAt(5, 5).kind === 'wall' && w.surfaceAt(30, 30).id === -1, 'surfaceAt');
  void c;
}

// ---------------------------------------------------------------- sloped prism, cylinder / frustum
{
  const w = createCollisionWorld();
  // roof rising along +x: y = 2 + 0.5 x over x in [0, 8]
  const r = w.prism([0, 0, 8, 0, 8, 6, 0, 6], 0, 2, 0.5, 0, 'roof');
  near(w.groundHeight(2, 3), 3, 1e-9, 'slope top at x=2');
  near(w.groundHeight(6, 3), 5, 1e-9, 'slope top at x=6');
  const h = w.raycast(V(4, 20, 3), V(0, -1, 0), 50);
  near(h.distance, 16, 1e-9, 'ray down onto slope'); near(h.normal.x, -0.5 / Math.hypot(0.5, 1), 1e-9, 'slope normal x'); ok(h.id === r, 'slope hit id');
  const cy = w.cyl(20, 0, 0, 10, 2, 0.5, 'tower'); // tapering
  near(w.groundHeight(20, 0), 10, 1e-9, 'frustum top centre');
  near(w.groundHeight(21.25, 0), 5, 1e-9, 'frustum side height');
  const hc = w.raycast(V(10, 1, 0), V(1, 0, 0), 50);
  ok(hc && hc.id === cy, 'ray hits frustum'); near(hc.point.x, 20 - (2 - 1.5 * 0.1), 1e-6, 'frustum side radius at y=1');
  const hv = w.raycast(V(20, 30, 0), V(0, -1, 0), 50); near(hv.point.y, 10, 1e-9, 'ray on frustum cap'); near(hv.normal.y, 1, 1e-9, 'cap normal');
  ok(w.raycast(V(20, 5, 0), V(1, 0, 0), 50) === null, 'ray starting inside the tower ignores it');
}

// ---------------------------------------------------------------- concave + holed prisms
{
  const L = [0, 0, 20, 0, 20, 5, 5, 5, 5, 20, 0, 20]; // L-shape, notch x,z in (5..20, 5..20)
  const parts = convexPieces(L);
  near(parts.reduce((s, p) => s + area(p.pts), 0), 175, 1e-6, 'L pieces keep the area');
  ok(parts.length >= 2 && parts.every(p => p.inner.some(v => v)), 'L pieces flag their seam');
  const w = createCollisionWorld();
  const id = w.prism(L, 0, 10, 0, 0, 'wall');
  ok(!w.inside(12, 5, 12) && w.inside(2, 5, 12) && w.inside(12, 5, 2), 'notch is empty');
  near(w.groundHeight(12, 12), 0, 1e-9, 'ground in the notch');
  const h = w.raycast(V(12, 2, 12), V(-1, 0, 0), 30); near(h.distance, 7, 1e-9, 'ray from notch hits inner wall'); near(h.normal.x, 1, 1e-9, 'inner wall normal');
  ok(w.raycast(V(12, 2, 12), V(1, 0, 1), 30) === null, 'ray leaves the notch freely');
  ok(w.raycast(V(2, 2, 2), V(0, 0, 1), 10) === null, 'ray inside the group: no seam hits');
  const p = V(6, 0, 12); const c = w.pushCylinder(p, 1.5, 2, 0);
  ok(c && p.x >= 6.5 - 1e-6, 'circle pushed out of the inner wall'); near(c.nx, 1, 1e-6, 'inner wall push normal');
  const q = V(6, 0, 6); w.pushCylinder(q, 1.5, 2, 0);
  ok(!w.pushCylinder(V(q.x, 0, q.z), 1.5, 2, 0) && Math.hypot(q.x - 5, q.z - 5) >= 1.5 - 1e-6, `reflex corner push-out (${q.x.toFixed(3)}, ${q.z.toFixed(3)})`);
  const inside = V(2, 0, 10); w.pushCylinder(inside, 0.5, 2, 0);
  near(inside.x, -0.5, 1e-9, 'embedded body leaves through the nearest outer wall');
  w.disable(id); ok(!w.inside(2, 5, 12) && !w.inside(12, 5, 2), 'disable(head) disables the whole group');
  // courtyard: outer 40x40, hole 10..30
  const w2 = createCollisionWorld();
  w2.prism([0, 0, 40, 0, 40, 40, 0, 40], 0, 12, 0, 0, 'wall', 0, [[10, 10, 30, 10, 30, 30, 10, 30]]);
  const hp = convexPieces([0, 0, 40, 0, 40, 40, 0, 40], [[10, 10, 30, 10, 30, 30, 10, 30]]);
  near(hp.reduce((s, p) => s + area(p.pts), 0), 1600 - 400, 1e-6, 'holed pieces keep the area');
  ok(!w2.inside(20, 5, 20) && w2.inside(5, 5, 20) && w2.inside(35, 5, 20) && w2.inside(20, 5, 5) && w2.inside(20, 5, 35), 'courtyard empty, ring solid');
  near(w2.groundHeight(20, 20, 50), 0, 1e-9, 'courtyard ground');
  near(w2.groundHeight(5, 5, 50), 12, 1e-9, 'ring roof');
  const hh = w2.raycast(V(20, 5, 20), V(1, 0, 0), 50); near(hh.distance, 10, 1e-9, 'courtyard ray hits inner facade');
  // concave star, random points: inside test agrees with an even-odd test on the outline
  const S = []; for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, r = i % 2 ? 4 : 10; S.push(Math.cos(a) * r, Math.sin(a) * r); }
  const w3 = createCollisionWorld(); w3.prism(S, 0, 5);
  const eo = (x, z) => { let k = false; for (let i = 0, j = S.length - 2; i < S.length; j = i, i += 2) { if ((S[i + 1] > z) !== (S[j + 1] > z) && x < (S[j] - S[i]) * (z - S[i + 1]) / (S[j + 1] - S[i + 1]) + S[i]) k = !k; } return k; };
  let bad = 0; for (let k = 0; k < 4000; k++) { const x = Math.random() * 24 - 12, z = Math.random() * 24 - 12; if (eo(x, z) !== w3.inside(x, 2, z)) bad++; }
  ok(bad === 0, `star footprint inside test (${bad} mismatches)`);
}

// ---------------------------------------------------------------- rays through the grid
{
  const w = createCollisionWorld({ cell: 16 });
  for (let i = 0; i < 50; i++) w.box(i * 40, 0, 100, i * 40 + 10, 20, 110);
  const h = w.raycast(V(1005, 5, -50), V(0, 0, 1), 500); near(h.distance, 150, 1e-9, 'long DDA ray'); near(h.normal.z, -1, 1e-12, 'box normal');
  const h2 = w.raycast(V(-100, 5, 105), V(1, 0, 0), 5000); near(h2.point.x, 0, 1e-9, 'ray along a row hits the first box');
  const h3 = w.raycast(V(1030, 5, 105), V(-1, 0, 0), 5000); near(h3.point.x, 1010, 1e-9, 'ray backwards');
  ok(w.raycast(V(15, 5, 105), V(1, 0, 0), 20) === null, 'segment ends before the next box');
  const h4 = w.raycast(V(5, 50, 105), V(0, -2, 0), 100); near(h4.distance, 30, 1e-9, 'unnormalized dir: metres');
  // terrain: slope y = 0.1 x
  const w2 = createCollisionWorld({ terrain: { height: (x) => 0.1 * x, minY: -100, maxY: 100 } });
  w2.box(1000, 0, 1000, 1001, 1, 1001); // far away: grid exists
  const ht = w2.raycast(V(0, 10, 0), V(1, 0, 0), 500); near(ht.point.x, 100, 0.01, 'terrain ray'); ok(ht.id === -1 && ht.normal.x < 0, 'terrain normal');
  ok(w2.raycast(V(50, 1, 0), V(1, 0, 0), 500) === null, 'ray starting under terrain ignores it');
  const w3 = createCollisionWorld({ terrain: () => NaN }); near(w3.groundHeight(3, 3), 0, 0, 'NaN terrain falls back');
}

// ---------------------------------------------------------------- disable (a snapped trunk)
{
  const w = createCollisionWorld();
  const trees = []; for (let i = 0; i < 5; i++) trees.push(w.cyl(i * 5, 0, 0, 6, 0.4, 0.4, 'trunk'));
  const p = V(10.5, 0, 0); ok(w.pushCylinder(p, 1, 2, 0), 'trunk blocks');
  let found = []; w.query(9, -1, 11, 1, (i) => found.push(i)); ok(found.length === 1 && found[0] === trees[2], 'rect query finds the trunk');
  w.disable(trees[2]);
  const q = V(10.5, 0, 0); ok(!w.pushCylinder(q, 1, 2, 0) && q.x === 10.5, 'disabled trunk no longer blocks');
  ok(w.raycast(V(10, 1, 5), V(0, 0, -1), 10, null, true) === null, 'ray passes the broken trunk');
  found = []; w.query(9, -1, 11, 1, (i) => found.push(i)); ok(found.length === 0, 'query skips disabled');
  ok(w.raycast(V(15, 1, 5), V(0, 0, -1), 10, null, true)?.id === trees[3], 'neighbour still solid');
  w.enable(trees[2]); ok(w.isEnabled(trees[2]) && w.pushCylinder(V(10.5, 0, 0), 1, 2, 0), 'enable restores');
}

// ---------------------------------------------------------------- push-out: cylinder, sphere, box
{
  const w = createCollisionWorld();
  w.box(0, 0, 0, 10, 10, 10); w.box(10, 0, -10, 20, 10, 0); // L corner at (10, 0)
  const p = V(11, 0, 1); const c = w.pushCylinder(p, 1.5, 2, 0.4);
  ok(c && !w.pushCylinder(V(p.x, 0, p.z), 1.5, 2, 0.4), `inner corner of two boxes resolves (${p.x.toFixed(3)}, ${p.z.toFixed(3)})`);
  const kerb = createCollisionWorld(); kerb.box(0, 0, 0, 10, 0.3, 10, 'kerb');
  ok(!kerb.pushCylinder(V(-0.5, 0, 5), 1, 2, 0.4), 'kerb below the step is ignored');
  ok(kerb.pushCylinder(V(-0.5, 0, 5), 1, 2, 0.2), 'kerb above the step blocks');
  const s = V(5, 10.5, 5); const cs = w.pushSphere(s, 1); ok(cs && Math.abs(s.y - 11) < 1e-9 && cs.ny > 0.99, 'sphere on a roof');
  const s2 = V(-0.5, 5, 5); w.pushSphere(s2, 1); near(s2.x, -1, 1e-9, 'sphere off a wall');
  const tw = createCollisionWorld(); tw.cyl(0, 0, 0, 10, 1, 1);
  const s3 = V(1.5, 5, 0); tw.pushSphere(s3, 1); near(s3.x, 2, 1e-9, 'sphere off a cylinder');
  // box SAT vs a rotated wall
  const ow = createCollisionWorld(); ow.obox(0, 0, 10, 0.1, Math.PI / 4, 0, 5, 'wall');
  const b = { x: 0.5, y: 0, z: -0.5, yaw: 0, hl: 1, hw: 1, h: 2, step: 0.3 };
  const cb = ow.pushBox(b); ok(cb && Math.abs(cb.nx - Math.SQRT1_2) < 1e-6 && Math.abs(cb.nz + Math.SQRT1_2) < 1e-6, 'box pushed along the rotated wall normal');
  ok(!ow.pushBox({ ...b }), 'resolved box no longer overlaps');
  // legacy call shape
  const lp = V(-0.5, 0, 5); const lc = pushOutCapsule(w, lp, 1, 2, 0.3); ok(lc && lc.normal.x === -1 && lp.x === -1, 'pushOutCapsule legacy shape');
  const v = V(-10, 0, 3); slideVelocity(v, { x: 1, y: 0, z: 0 }); ok(v.x === 0 && v.z === 3, 'slide keeps the tangent');
}

// ---------------------------------------------------------------- car: tunnelling, sliding, steps, roofs, overhangs
{
  const w = createCollisionWorld();
  w.box(50, 0, -100, 50.2, 8, 100, 'wall');            // thin wall across +x
  w.cyl(0, 60, 0, 6, 0.1, 0.1, 'pole');                // thin pole on +z
  w.box(-40, 0, -10, -30, 0.3, 10, 'kerb');            // kerb on -x
  w.box(-40, 0, 20, -30, 1.0, 40, 'step');             // too high to climb
  w.box(100, 0, 100, 130, 12, 130, 'wall');            // flat roof at 12
  w.box(-100, 4.5, -100, -80, 4.8, -80, 'awning', OVERHANG);
  const car = createCarCollider(w);
  for (const [speed, fps] of [[40, 60], [40, 10], [85, 60], [85, 5], [300, 2]]) {
    const p = V(40, 0, 0), dt = 1 / fps; let crossed = false, hits = 0, out;
    for (let t = 0; t < 2; t += dt) { out = car.move(p, Math.PI / 2, speed * dt, 0, 0); if (out.hit) hits++; if (p.x + 2.85 > 50.2) crossed = true; }
    ok(!crossed && hits > 0 && p.x + 2.85 <= 50 + 1e-6, `no tunnelling through a 0.2 m wall at ${speed} m/s, ${fps} fps (x=${p.x.toFixed(3)})`);
  }
  { // diagonal into the wall: slides along it, keeps tangential motion
    const p = V(45, 0, 0), vel = V(30, 0, 30); let out;
    for (let i = 0; i < 60; i++) { out = car.move(p, Math.PI / 4, vel.x / 60, 0, vel.z / 60); if (out.hit) slideVelocity(vel, { x: out.nx, y: out.ny, z: out.nz }); }
    ok(p.z > 20 && vel.x < 1e-6 && Math.abs(vel.z - 30) < 1e-6, `slides along the wall (z=${p.z.toFixed(2)}, vx=${vel.x.toFixed(3)})`);
    ok(!w.pushBox({ x: p.x, y: p.y, z: p.z, yaw: Math.PI / 4, hl: 2.85, hw: 1, h: 2, step: 0.5 }), 'after sliding the body is clear');
  }
  { // pole at 60 m/s: stops before it
    const p = V(0, 0, 40); let out, hit = false;
    for (let i = 0; i < 60; i++) { out = car.move(p, 0, 0, 0, 1); hit = hit || out.hit; }
    ok(hit && p.z + 2.85 <= 60 - 0.1 + 1e-6, `thin pole stops the car (z=${p.z.toFixed(3)})`);
  }
  { // kerb: step-up; high step: blocked
    const p = V(-20, 0, 0); let stepped = false;
    for (let i = 0; i < 60; i++) stepped = car.move(p, -Math.PI / 2, -10 / 60, 0, 0).stepped || stepped;
    near(p.y, 0.3, 1e-9, 'car climbed the kerb'); ok(stepped, 'stepped flag');
    const q = V(-20, 0, 30); for (let i = 0; i < 60; i++) car.move(q, -Math.PI / 2, -10 / 60, 0, 0);
    ok(q.y === 0 && q.x - 2.85 >= -30 - 1e-6, `1 m step blocks (x=${q.x.toFixed(3)})`);
  }
  { // landing on a roof from above at 30 m/s down + 20 m/s forward
    const p = V(110, 40, 101); let landed = false, out;
    for (let i = 0; i < 120 && !landed; i++) { out = car.move(p, 0, 0, -30 / 60, 20 / 60); if (out.grounded && p.y > 11) landed = true; }
    ok(landed && Math.abs(p.y - 12) < 1e-9, `landed on the roof (y=${p.y.toFixed(3)})`);
  }
  { // driving under a canopy: not lifted onto it; flying up into it: stopped below
    const p = V(-120, 0, -90); for (let i = 0; i < 120; i++) car.move(p, Math.PI / 2, 20 / 60, 0, 0);
    ok(p.y === 0 && p.x > -85, `drives under the canopy (y=${p.y}, x=${p.x.toFixed(1)})`);
    const q = V(-90, 0, -90); let out; for (let i = 0; i < 60; i++) out = car.move(q, 0, 0, 5 / 60, 0);
    ok(q.y + 2 <= 4.5 + 1e-6 && q.x === -90, `flying up into the canopy stops under it (top=${(q.y + 2).toFixed(3)})`);
  }
  { // teleport inside a building: recovers deterministically in a few frames
    const p = V(102, 0, 115); let out; for (let i = 0; i < 4; i++) out = car.pushOut(p, 0);
    ok(!w.pushBox({ x: p.x, y: p.y, z: p.z, yaw: 0, hl: 2.85, hw: 1, h: 2, step: 0.5 }) && Number.isFinite(p.x + p.y + p.z), `recovers from inside (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`);
  }
  ok(createCarCollider({ collision: w, groundHeight: w.groundHeight }).move(V(0, 0, 0), 0, 0, 0, 0).grounded, 'accepts a city world object');
  const qs = createWorldQueries(w, (x, z) => 0);
  ok(qs.groundHeight(115, 115, 50) === 12 && qs.collision === w, 'createWorldQueries facade');
}

// ---------------------------------------------------------------- sloped prisms: ramps drive, steep slopes block
{
  const rampWorld = (deg) => { const w = createCollisionWorld(), k = Math.tan(deg * Math.PI / 180); w.prism([0, -5, 40, -5, 40, 5, 0, 5], -1, 0, k, 0, 'ramp'); return [w, k]; };
  for (const speed of [10, 30]) { // 15 deg ramp up +x
    const [w, k] = rampWorld(15), car = createCarCollider(w), p = V(-10, 0, 0);
    let hits = 0, worst = 0;
    for (let i = 0; i < 600 && p.x < 30; i++) {
      const o = car.move(p, Math.PI / 2, speed / 60, 0, 0); if (o.hit) hits++;
      if (p.x > 0) worst = Math.max(worst, Math.abs(p.y - k * (p.x + 2.75)));
    }
    ok(p.x >= 30 && hits === 0 && worst < 0.05, `15 deg ramp at ${speed} m/s: x=${p.x.toFixed(2)} hits=${hits} height err=${worst.toFixed(3)}`);
    // body held at the ground under its centre (the legacy wheel average): box and circles are not walled either
    let blocked = 0;
    for (let x = -3; x < 30; x += 0.25) {
      if (w.pushBox({ x, y: Math.max(0, k * x), z: 0, yaw: Math.PI / 2, hl: 2.85, hw: 1, h: 2, step: 0.5 })) blocked++;
      for (const off of [1.95, 0.65, -0.65, -1.95]) if (pushOutCapsule(w, V(x + off, Math.max(0, k * x), 0), 1, 2, 0.5)) blocked++;
    }
    ok(blocked === 0, `ramp is ground for box / circles at the centre height (${blocked} blocks)`);
  }
  { // the ramp's high side is still a wall
    const [w] = rampWorld(15), c = pushOutCapsule(w, V(30, 0, -5.5), 1, 2, 0.5);
    ok(c && c.normal.z < -0.99, 'ramp side face blocks');
  }
  { // 35 deg: blocks head-on, slides along the foot when diagonal
    const [w] = rampWorld(35), car = createCarCollider(w), p = V(-10, 0, 0);
    let hit = false; for (let i = 0; i < 120; i++) hit = car.move(p, Math.PI / 2, 20 / 60, 0, 0).hit || hit;
    ok(hit && p.y < 0.3 && p.x + 2.85 < 0.5, `35 deg slope blocks (x=${p.x.toFixed(2)}, y=${p.y.toFixed(2)})`);
    const q = V(-3, 0, -3), v = V(10, 0, 10);
    for (let i = 0; i < 60; i++) { const o = car.move(q, Math.PI / 4, v.x / 60, 0, v.z / 60); if (o.hit) slideVelocity(v, { x: o.nx, y: o.ny, z: o.nz }); }
    ok(q.y < 0.3 && q.z > 3, `35 deg slope: slides along the foot (z=${q.z.toFixed(2)}, y=${q.y.toFixed(2)})`);
  }
  for (const deg of [20, 40]) { // landing on a sloped roof (house walls + pitched roof prism)
    const w = createCollisionWorld(), k = Math.tan(deg * Math.PI / 180);
    w.box(100, 0, -10, 120, 8, 10, 'wall');
    w.prism([100, -10, 120, -10, 120, 10, 100, 10], 7.75, 8 - k * 100, k, 0, 'roof');
    const car = createCarCollider(w), p = V(110, 40, 0); let o;
    for (let i = 0; i < 150; i++) o = car.move(p, 0, 0, -20 / 60, 0); // 2.5 s of descent, then resting on the roof
    const want = 8 + k * (10 + 0.9); // highest corner probe (half width - inset) on the plane
    ok(o.grounded && Math.abs(p.y - want) < 0.02, `landed on a ${deg} deg roof (y=${p.y.toFixed(3)}, want ${want.toFixed(3)})`);
  }
}

// ---------------------------------------------------------------- performance: synthetic + real Cherkasy footprints
function bench(name, w, x0, z0, x1, z1) {
  const N = 5000, R = [];
  for (let i = 0; i < N; i++) R.push(x0 + Math.random() * (x1 - x0), z0 + Math.random() * (z1 - z0));
  let s = 0, t = performance.now();
  for (let k = 0; k < 3; k++) for (let i = 0; i < N; i++) s += w.groundHeight(R[2 * i], R[2 * i + 1], 3);
  const tg = (performance.now() - t) / 3;
  const hit = { distance: 0, point: V(0, 0, 0), normal: V(0, 0, 0) }, o = V(0, 0, 0), d = V(0, 0, 0);
  t = performance.now();
  for (let i = 0; i < 1000; i++) { o.x = R[2 * i]; o.y = 2; o.z = R[2 * i + 1]; const a = i * 2.4; d.x = Math.cos(a); d.y = -0.1; d.z = Math.sin(a); w.raycast(o, d, 12, hit); }
  const tr = performance.now() - t;
  const car = createCarCollider(w), p = V(0, 0, 0), out = {};
  t = performance.now();
  for (let i = 0; i < 1000; i++) { p.x = R[2 * i]; p.y = w.groundHeight(p.x, R[2 * i + 1]); p.z = R[2 * i + 1]; car.move(p, i, 0.5, 0, 0.3, out); }
  const tc = performance.now() - t;
  console.log(`  ${name}: ${w.count} solids | 5000 groundHeight ${tg.toFixed(2)} ms | 1000 camera rays (12 m) ${tr.toFixed(2)} ms | 1000 car sub-step moves ${tc.toFixed(2)} ms`);
  return { tg, tr, tc };
}
{
  const w = createCollisionWorld();
  for (let i = 0; i < 20000; i++) { const x = (i % 150) * 30, z = Math.floor(i / 150) * 30, s = 8 + (i % 7); w.obox(x, z, s, s * 0.7, (i % 13) * 0.1, 0, 10 + (i % 30)); }
  for (let i = 0; i < 8000; i++) w.cyl((i * 37.1) % 4500, (i * 91.7) % 4000, 0, 5, 0.3, 0.3, 'trunk');
  const t = performance.now(); w.finalize(); console.log(`  synthetic finalize ${(performance.now() - t).toFixed(1)} ms`);
  const r = bench('synthetic', w, 0, 0, 4500, 4000);
  ok(r.tg < 5 && r.tr < 5, 'synthetic query cost');
}
const BP = new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url);
if (existsSync(BP)) {
  const B = JSON.parse(readFileSync(BP, 'utf8'));
  const w = createCollisionWorld();
  let t = performance.now(), bad = 0;
  for (const b of B) { const H = b.h ?? (b.lv ?? 2) * 3.2 + 1; if (w.prism(b.p, -1, H, 0, 0, 'wall', 0, b.holes) < 0) bad++; }
  const tAdd = performance.now() - t; t = performance.now(); w.finalize(); const tFin = performance.now() - t;
  console.log(`  Cherkasy: ${B.length} footprints -> ${w.count} convex solids (${bad} degenerate) | register ${tAdd.toFixed(0)} ms, grid ${tFin.toFixed(0)} ms`);
  ok(tAdd + tFin < 4000, 'city build under a few seconds');
  // every building's first vertex nudged inward is inside for a sample
  const r = bench('Cherkasy', w, -1500, -1500, 1500, 1500);
  ok(r.tg < 5 && r.tr < 10, 'Cherkasy query cost');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
