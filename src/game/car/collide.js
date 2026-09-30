// The flying car's body collider, on top of the static collision world (src/world/collision.js).
//
// createCarCollider(world, dims?) -> col
//   world: a collision world (createCollisionWorld) or an object carrying one as .collision (the city world, whose
//          groundHeight(x, z, yHint) is then used for support).
//   dims:  { length = 5.7, width = 2.0, height = 2.0, step = 0.5, sub = 0.4, maxSub = 48 }
//   col.move(p, yaw, dx, dy, dz, out?) -> out   p = { x, y (bottom = wheel contact), z } is moved by (dx, dy, dz) in
//       sub-steps of at most `sub` metres (no tunnelling through thin walls at flight speed). Each sub-step pushes the
//       yaw box out of walls (the caller slides its velocity along out.n*), resolves shallow vertical overlaps (settle
//       on a roof, stop under an overhang), steps up kerbs up to `step`, drives up ramps no steeper than the world's
//       walkSlope (steeper tops block like a wall facing downhill) and never leaves the body under its support.
//       Support is searched from the height the car had before the sub-step, so a car under a roof is not lifted
//       onto it and a fast descent cannot pass through a slab.
//       out: { hit, nx, ny, nz (unit, total correction), depth, id (deepest solid, -1), grounded, groundY, stepped,
//              landed, dx, dy, dz (correction applied on top of the requested motion) }
//   col.pushOut(p, yaw, out?) -> out            the same resolution without motion (teleport / numeric drift)
//   col.groundAt(x, z, yaw, yHint) -> y         support under the footprint: max over the centre and four corners
//   col.dims, col.collision
// slideVelocity(v, n, bounce = 0) -> v          removes the part of v going into n (v.n < 0), reflecting `bounce` of it
// pushOutCapsule(colOrWorld, p, r, h, step) -> { normal { x, y, z }, depth, id } | null
//   upright body (feet p.y, radius r, height h) pushed out horizontally, p mutated; the result object is reused.
//   (the call shape legacy car.js / city.js use for the circles along the car and for traffic wrecks)
// createCollider: alias of createCarCollider (legacy name)

const coreOf = (w) => (w && typeof w.pushBox === 'function' ? w : w?.collision?.pushBox ? w.collision : null);

export function createCarCollider(world, dims = {}) {
  const cw = coreOf(world);
  if (!cw) return null;
  const D = { length: 5.7, width: 2.0, height: 2.0, step: 0.5, sub: 0.4, maxSub: 48, ...dims };
  const ground = typeof world.groundHeight === 'function' ? world.groundHeight : cw.groundHeight;
  const box = { x: 0, y: 0, z: 0, yaw: 0, hl: D.length / 2, hw: D.width / 2, h: D.height, step: D.step, vertical: true };
  const r = {}, rayO = { x: 0, y: 0, z: 0 }, rayD = { x: 0, y: 0, z: 0 }, rayHit = { distance: 0, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, id: -1, kind: '' };
  const inset = 0.1;

  let gid = -1; // solid under the highest probe of the last groundAt (-1: terrain)
  function groundAt(x, z, yaw, yHint) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), a = box.hl - inset, b = box.hw - inset;
    let g = ground(x, z, yHint); gid = cw.groundId;
    for (let sf = -1; sf <= 1; sf += 2) for (let sr = -1; sr <= 1; sr += 2) {
      const y = ground(x + fx * a * sf + fz * b * sr, z + fz * a * sf - fx * b * sr, yHint);
      if (y > g) { g = y; gid = cw.groundId; }
    }
    return g;
  }
  const grad = { x: 0, z: 0 };

  function move(p, yaw, dx, dy, dz, out = {}) {
    out.hit = false; out.nx = 0; out.ny = 0; out.nz = 0; out.depth = 0; out.id = -1;
    out.stepped = false; out.landed = false; out.dx = 0; out.dy = 0; out.dz = 0;
    if (!Number.isFinite(dx + dy + dz + p.x + p.y + p.z + yaw)) { dx = dy = dz = 0; }
    const L = Math.hypot(dx, dy, dz);
    let n = Math.max(1, Math.ceil(L / D.sub));
    if (n > D.maxSub) { // an extreme step (frame hitch): stop the centre path at the first solid, then sub-step coarser
      rayO.x = p.x; rayO.y = p.y + D.height * 0.5; rayO.z = p.z; rayD.x = dx; rayD.y = dy; rayD.z = dz;
      const h = cw.raycast(rayO, rayD, L, rayHit, true);
      if (h) { const k = Math.max(0, h.distance - box.hw) / L; dx *= k; dy *= k; dz *= k; }
      n = D.maxSub;
    }
    const sx = dx / n, sy = dy / n, sz = dz / n;
    let deep = 0;
    box.yaw = yaw;
    for (let s = 0; s < n; s++) {
      const y0 = p.y;
      box.x = p.x + sx; box.y = p.y + sy; box.z = p.z + sz;
      const c = cw.pushBox(box, r);
      if (c) {
        out.hit = true; out.dx += c.dx; out.dy += c.dy; out.dz += c.dz;
        if (c.depth > deep) { deep = c.depth; out.id = c.id; }
      }
      const hint = Math.max(y0, box.y) + D.step;
      let g = groundAt(box.x, box.z, yaw, hint);
      if (g > y0 + 0.02 && gid >= 0 && cw.slopeOf(gid, grad) > cw.walkSlope) {
        // rising onto a slope too steep to drive: it acts as a wall facing downhill (keep the along-slope motion)
        const gl = Math.hypot(grad.x, grad.z), ux = grad.x / gl, uz = grad.z / gl, m = (box.x - p.x) * ux + (box.z - p.z) * uz;
        if (m > 0) { box.x -= ux * m; box.z -= uz * m; out.dx -= ux * m; out.dz -= uz * m; }
        else { out.dx += p.x - box.x; out.dz += p.z - box.z; box.x = p.x; box.z = p.z; }
        out.hit = true; if (deep === 0) { deep = 1e-6; out.id = gid; }
        g = groundAt(box.x, box.z, yaw, hint);
      }
      if (box.y < g) {
        if (g - y0 > 0.02 && sy >= -1e-6) out.stepped = true; else if (sy < 0) out.landed = true;
        out.dy += g - box.y; box.y = g;
      }
      p.x = box.x; p.y = box.y; p.z = box.z;
    }
    const nl = Math.hypot(out.dx, out.dy, out.dz);
    if (out.hit) {
      out.depth = nl;
      if (nl > 1e-9) { out.nx = out.dx / nl; out.ny = out.dy / nl; out.nz = out.dz / nl; } else { out.nx = r.nx; out.ny = r.ny; out.nz = r.nz; }
    }
    out.groundY = groundAt(p.x, p.z, yaw, p.y + D.step);
    out.grounded = p.y <= out.groundY + 0.05;
    return out;
  }

  return {
    dims: D, collision: cw, groundAt, move,
    pushOut: (p, yaw, out) => move(p, yaw, 0, 0, 0, out),
    capsule: (p, rad, h, step, out) => cw.pushCylinder(p, rad, h, step, out),
  };
}
export const createCollider = createCarCollider;

export function slideVelocity(v, n, bounce = 0) {
  const vn = v.x * n.x + v.y * n.y + v.z * n.z;
  if (vn < 0) { const k = vn * (1 + bounce); v.x -= n.x * k; v.y -= n.y * k; v.z -= n.z * k; }
  return v;
}

const capRes = { hit: false, dx: 0, dz: 0, nx: 0, nz: 0, depth: 0, id: -1 }, capOut = { normal: { x: 0, y: 0, z: 0 }, depth: 0, id: -1 };
export function pushOutCapsule(col, p, r, h, step = 0) {
  const cw = col?.collision && col.collision.pushCylinder ? col.collision : coreOf(col);
  if (!cw) return null;
  const c = cw.pushCylinder(p, r, h, step, capRes);
  if (!c) return null;
  capOut.normal.x = c.nx; capOut.normal.y = 0; capOut.normal.z = c.nz; capOut.depth = c.depth; capOut.id = c.id;
  return capOut;
}
