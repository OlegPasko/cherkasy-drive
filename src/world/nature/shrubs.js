// The shrub layer of world/trees.js: bushes, lilacs, flowering shrubs, thujas and junipers as one instanced bush
// (nature/treegeo.js buildShrubGeometries) at two detail levels. Shrubs are scenery only: no items, no colliders,
// nothing to break, so a record is 8 floats in and two typed arrays inside, and a repack is a few block copies.
//
//   SHRUB_STRIDE = 8: x, y, z, yaw, width, height, kind (index into kinds), tone (0..1, per-shrub variation)
//   createShrubLayer({ group, data: Float32Array, kinds: [{ A, B, taper }], geos: { near, far }, material(fade),
//                      depth?, records?, near = [26, 34], out = [130, 160], shadows = true }) -> layer
//     depth: the near pool's shadow-pass material (the taper); records: shrubRecords(data, kinds)'s result, when the
//     caller built them in steps (then data / kinds are not read)
//   shrubRecords(data, kinds) -> generator; the heavy part of the set-up in small steps
//     layer.update(camPos, view)   view: { full, fc, h } the camera's azimuth range (trees.js measureView), or null
//     layer.setDetail({ near, out, shadow })   bands in metres, never beyond the ones given at creation (the pools
//       are sized for those); shadow: the detailed bushes cast or not
//     layer.stats() -> { items, near, far, drawCalls, repacks, lastRepackMs }, layer.dispose()
// Detail: the detailed bush within `near` (dithered cross-fade to the plain one over the band), the plain one to `out`.
// Only the detailed bushes cast shadows. The plain pool leaves out the 32 m cells that lie outside the view's azimuth
// range (+ a turn allowance) and is repacked when the camera moved 6 m or turned past the allowance.
import { BufferGeometry, DynamicDrawUsage, InstancedInterleavedBuffer, InstancedMesh, InterleavedBufferAttribute, Sphere, Vector3 } from 'three';

export const SHRUB_STRIDE = 8;
const CELL = 32, MOVE = 6, TURN = 28 * Math.PI / 180;
const hash = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
const wrapA = (a) => a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;

// The records of a layer, in small steps (a generator: it yields every few thousand shrubs; its return value goes to
// createShrubLayer as `records`): the shrubs sorted into 32 m cells (CSR), 16 floats of pose and 8 of
// [tint A, phase, tint B, taper] each.
export function* shrubRecords(data, kinds) {
  const N = Math.floor(data.length / SHRUB_STRIDE);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < N; ++i) { const x = data[i * 8], z = data[i * 8 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  if (!N) { x0 = z0 = 0; x1 = z1 = 1; }
  const gx0 = Math.floor(x0 / CELL) * CELL, gz0 = Math.floor(z0 / CELL) * CELL, gnx = Math.floor((x1 - gx0) / CELL) + 1, gnz = Math.floor((z1 - gz0) / CELL) + 1;
  const start = new Int32Array(gnx * gnz + 1), cellOf = (i) => Math.floor((data[i * 8 + 2] - gz0) / CELL) * gnx + Math.floor((data[i * 8] - gx0) / CELL);
  for (let i = 0; i < N; ++i) start[cellOf(i) + 1]++;
  for (let c = 0; c < gnx * gnz; ++c) start[c + 1] += start[c];
  yield;
  const fill = start.slice(0, -1), mats = new Float32Array(N * 16), misc = new Float32Array(N * 8), cellY = new Float32Array(gnx * gnz);
  for (let i = 0; i < N; ++i) {
    if ((i & 8191) === 8191) yield;
    const o = i * 8, x = data[o], y = data[o + 1], z = data[o + 2], ry = data[o + 3], w = data[o + 4], h = data[o + 5], K = kinds[data[o + 6] | 0] ?? kinds[0], t = data[o + 7];
    const c = cellOf(i), k = fill[c]++, m = k * 16, q = k * 8, cs = Math.cos(ry), sn = Math.sin(ry), d = w * (0.82 + 0.36 * hash(x, z));
    cellY[c] += y;
    // translate * rotateY * scale(w, h, d)
    mats[m] = cs * w; mats[m + 2] = -sn * w; mats[m + 5] = h; mats[m + 8] = sn * d; mats[m + 10] = cs * d; mats[m + 12] = x; mats[m + 13] = y; mats[m + 14] = z; mats[m + 15] = 1;
    const br = 0.86 + 0.28 * t, wc = (hash(z, x) - 0.5) * 0.14;
    misc[q] = K.A[0] * br * (1 + wc); misc[q + 1] = K.A[1] * br; misc[q + 2] = K.A[2] * br * (1 - wc); misc[q + 3] = t * 6.283;
    misc[q + 4] = K.B[0] * br; misc[q + 5] = K.B[1] * br; misc[q + 6] = K.B[2] * br; misc[q + 7] = K.taper;
  }
  for (let c = 0; c < gnx * gnz; ++c) { const n = start[c + 1] - start[c]; if (n) cellY[c] /= n; }
  return { N, gx0, gz0, gnx, gnz, start, mats, misc, cellY };
}

export function createShrubLayer({ group, data, kinds, records = null, geos, material, depth = null, near = [26, 34], out = [130, 160], shadows = true }) {
  const now = () => (globalThis.performance ?? Date).now();
  if (!records) { const job = shrubRecords(data, kinds); for (let q = job.next(); ; q = job.next()) if (q.done) { records = q.value; break; } }
  const { N, gx0, gz0, gnx, gnz, start, mats, misc, cellY } = records;
  // the most shrubs any disc of radius R can hold (a summed-area table over the cells) -> pool sizes
  const sat = new Int32Array((gnx + 1) * (gnz + 1));
  for (let j = 0; j < gnz; ++j) for (let i = 0; i < gnx; ++i) sat[(j + 1) * (gnx + 1) + i + 1] = start[j * gnx + i + 1] - start[j * gnx + i] + sat[j * (gnx + 1) + i + 1] + sat[(j + 1) * (gnx + 1) + i] - sat[j * (gnx + 1) + i];
  const most = (R) => {
    const k = Math.ceil(R / CELL) + 1; let m = 0;
    for (let j = 0; j < gnz; ++j) for (let i = 0; i < gnx; ++i) {
      const a = Math.max(0, i - k), b = Math.min(gnx, i + k + 1), c = Math.max(0, j - k), d = Math.min(gnz, j + k + 1);
      const n = sat[d * (gnx + 1) + b] - sat[c * (gnx + 1) + b] - sat[d * (gnx + 1) + a] + sat[c * (gnx + 1) + a];
      if (n > m) m = n;
    }
    return m;
  };

  // ---- pools
  const MAX = { near: [near[0], near[1]], out: [out[0], out[1]] }, lod = { near: MAX.near, out: MAX.out, shadow: true };
  const makePool = (geo, mat, cap, name, cast) => {
    const g = new BufferGeometry();
    for (const k of Object.keys(geo.attributes)) g.setAttribute(k, geo.attributes[k]);
    g.boundingSphere = new Sphere(new Vector3(), 1e7);
    const mesh = new InstancedMesh(g, mat, Math.max(1, cap));
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const arr = new Float32Array(Math.max(1, cap) * 8), ib = new InstancedInterleavedBuffer(arr, 8).setUsage(DynamicDrawUsage);
    g.setAttribute('aTintA', new InterleavedBufferAttribute(ib, 4, 0));
    g.setAttribute('aTintB', new InterleavedBufferAttribute(ib, 4, 4));
    Object.assign(mesh, { count: 0, visible: false, frustumCulled: false, name, castShadow: cast, receiveShadow: true });
    group.add(mesh);
    return { mesh, mat: mesh.instanceMatrix.array, misc: arr, ib, cap: Math.max(1, cap), n: 0 };
  };
  const matNear = material([-2, -1, near[0], near[1]]), matFar = material([near[0], near[1], out[0], out[1]]);
  const PN = makePool(geos.near, matNear, most(near[1] + MOVE), 'shrubs near', shadows);
  if (depth) PN.mesh.customDepthMaterial = depth; // the shadow pass tapers the cones as the colour pass does
  const PF = makePool(geos.far, matFar, most(out[1] + MOVE), 'shrubs far', false);
  const flush = (P) => {
    const m = P.mesh; m.count = P.n; m.visible = P.n > 0;
    if (!P.n) return;
    m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, P.n * 16); m.instanceMatrix.needsUpdate = true;
    P.ib.clearUpdateRanges(); P.ib.addUpdateRange(0, P.n * 8); P.ib.needsUpdate = true;
  };

  // ---- repacking
  const last = new Vector3(1e9, 0, 0), W = { on: false, f: 0, H: Math.PI };
  let repacks = 0, lastMs = 0, dirty = true;
  function pack(c, view) {
    const t = now();
    PN.n = PF.n = 0;
    W.on = !!view && !view.full && view.h + TURN < Math.PI - 0.05;
    if (W.on) { W.f = view.fc; W.H = view.h + TURN; }
    const Rn = lod.near[1] + MOVE, Rf = lod.out[1] + MOVE, skip = lod.near[0] - MOVE, half = CELL / 2, diag = half * Math.SQRT2;
    const i0 = Math.max(0, Math.floor((c.x - Rf - gx0) / CELL)), i1 = Math.min(gnx - 1, Math.floor((c.x + Rf - gx0) / CELL));
    const j0 = Math.max(0, Math.floor((c.z - Rf - gz0) / CELL)), j1 = Math.min(gnz - 1, Math.floor((c.z + Rf - gz0) / CELL));
    for (let j = j0; j <= j1; ++j) for (let i = i0; i <= i1; ++i) {
      const cell = j * gnx + i, a = start[cell], b = start[cell + 1];
      if (b <= a) continue;
      const px = gx0 + i * CELL + half - c.x, pz = gz0 + j * CELL + half - c.z, py = cellY[cell] - c.y, dh = Math.sqrt(px * px + pz * pz), d = Math.sqrt(dh * dh + py * py);
      if (d - diag < Rn) for (let k = a; k < b && PN.n < PN.cap; ++k) { // the detailed bushes: per shrub
        const m = k * 16, qx = mats[m + 12] - c.x, qy = mats[m + 13] - c.y, qz = mats[m + 14] - c.z;
        if (qx * qx + qy * qy + qz * qz >= Rn * Rn) continue;
        const o = PN.n * 16, e = PN.n * 8, q = k * 8;
        for (let s = 0; s < 16; ++s) PN.mat[o + s] = mats[m + s];
        for (let s = 0; s < 8; ++s) PN.misc[e + s] = misc[q + s];
        PN.n++;
      }
      // the plain bushes: whole cells in the band and (roughly) in view
      if (d - diag > Rf || d + diag < skip) continue;
      if (W.on && dh > diag + 4 && Math.abs(wrapA(Math.atan2(pz, px) - W.f)) - Math.asin(Math.min(1, (diag + 4) / dh)) > W.H) continue;
      const n = Math.min(b - a, PF.cap - PF.n);
      PF.mat.set(mats.subarray(a * 16, (a + n) * 16), PF.n * 16); PF.misc.set(misc.subarray(a * 8, (a + n) * 8), PF.n * 8);
      PF.n += n;
    }
    flush(PN); flush(PF);
    last.copy(c); dirty = false; repacks++; lastMs = now() - t;
  }
  const covers = (view) => !W.on || (!!view && !view.full && Math.abs(wrapA(view.fc - W.f)) + view.h <= W.H);

  return {
    count: N,
    update(camPos, view = null) {
      if (!N || !camPos) return;
      if (dirty || last.distanceTo(camPos) > MOVE || !covers(view)) pack(camPos, view);
    },
    setDetail({ near: nr = MAX.near, out: ot = MAX.out, shadow = true } = {}) {
      lod.near = [Math.min(nr[0], MAX.near[0]), Math.min(nr[1], MAX.near[1])]; lod.out = [Math.min(ot[0], MAX.out[0]), Math.min(ot[1], MAX.out[1])]; lod.shadow = !!shadow;
      matNear.userData.uFade.value.set(-2, -1, lod.near[0], lod.near[1]);
      matFar.userData.uFade.value.set(lod.near[0], lod.near[1], lod.out[0], lod.out[1]);
      PN.mesh.castShadow = shadows && lod.shadow;
      dirty = true;
    },
    stats: () => ({ items: N, near: PN.n, far: PF.n, drawCalls: (PN.n > 0) + (PF.n > 0), repacks, lastRepackMs: +lastMs.toFixed(3) }),
    dispose() { for (const P of [PN, PF]) { P.mesh.removeFromParent(); P.mesh.geometry.dispose(); P.mesh.dispose?.(); } matNear.dispose(); matFar.dispose(); depth?.dispose(); },
  };
}
