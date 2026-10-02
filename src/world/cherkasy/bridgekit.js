// OWNER: cherkasy. Shared pieces of the hand-built road and rail bridges (overpass.js – the Dakhnivska overpass,
// khimbridge.js – the prosp. Khimikiv viaduct, railbridge.js – the railway bridges over the streets): 2D frames and
// polyline helpers, grades, the ground fix-ups under a deck, and the mesh helpers they all draw with.
//   ease(a, b, v) -> 0..1          cosine step from a to b
//   fin(h, d = 30) -> h | d         a finite height or the fallback
//   along(L, x, z) -> { d, s }      nearest point of polyline L ([[x, z], ...]): distance and arc length from L[0]
//   crossing(L, p, q) -> { s, f } | null   where segment p-q crosses L: arc length along L, fraction along p-q
//   frame(P, Q) -> { P, L, ux, uz, nx, nz, ang, at(t, o) -> [x, z], to(x, z) -> [t, o] }   a straight frame from P
//     to Q: t along it (m from P), o to its left (+n)
//   grade(P, r) -> level            a grade table [[arc, level], ...] at arc r: interpolated, rising 3 % behind the
//     first point and falling 5 % past the last, so the natural ground takes over beyond its ends
//   cumulate(L) -> [arc at each point];  pointAt(L, cum, s) -> [x, z, dx, dz]   a point and unit heading at arc s
//   resurface(ground, box, pick) -> triangles changed   ground tiles: triangles re-pointed at copies of their
//     vertices with another surface, or dropped (pick returns -1); pick(cx, cz, surf, P, a, b, c) -> surf | -1 | null
//   dropPaint(ground, test(x, z, lx, lz)) -> strips dropped   ground lane-paint triangles whose centroid passes the
//     test (lx, lz: the triangle's longest edge, the strip's direction) are collapsed
//   sboxer(Fr) -> sbox(M, ta, tb, oa, ob, lo(t, o), hi(t, o), mask = 63)   a box in frame Fr between t ta..tb and
//     o oa..ob whose bottom / top follow functions of (t, o) (a sloped or curved deck); mask as MB.box (1 +o side,
//     2 -o side, 4 top, 8 bottom, 16 +t end, 32 -t end)
//   barTex() -> texture             a railing infill: one flat bar per repeat, white = solid (an alphaMap)
//   topMesh() -> { quad(pts, nrm, surf), mesh(material, name) | null }   quads in the ground's own material (aSurf), so
//     a deck's carriageway and walks join the streets seamlessly
import * as THREE from 'three';
import { canvasTex } from './sculpt.js';

export const ease = (a, b, v) => (v <= a ? 0 : v >= b ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * (v - a) / (b - a)));
export const fin = (h, d = 30) => (Number.isFinite(h) ? h : d);

export function along(L, x, z) {
  let best = { d: Infinity, s: 0 }, run = 0;
  for (let k = 1; k < L.length; k++) {
    const [ax, az] = L[k - 1], ex = L[k][0] - ax, ez = L[k][1] - az, len = Math.hypot(ex, ez);
    const f = len > 0 ? Math.min(len, Math.max(0, ((x - ax) * ex + (z - az) * ez) / len)) : 0;
    const d = Math.hypot(x - ax - ex * f / (len || 1), z - az - ez * f / (len || 1));
    if (d < best.d) best = { d, s: run + f };
    run += len;
  }
  return best;
}
export function crossing(L, p, q) {
  let run = 0;
  for (let k = 1; k < L.length; k++) {
    const a = L[k - 1], b = L[k], ex = b[0] - a[0], ez = b[1] - a[1], fx = q[0] - p[0], fz = q[1] - p[1];
    const den = ex * fz - ez * fx, len = Math.hypot(ex, ez);
    if (Math.abs(den) > 1e-9) {
      const t = ((p[0] - a[0]) * fz - (p[1] - a[1]) * fx) / den, u = ((p[0] - a[0]) * ez - (p[1] - a[1]) * ex) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { s: run + t * len, f: u };
    }
    run += len;
  }
  return null;
}
export function frame(P, Q) {
  const L = Math.hypot(Q[0] - P[0], Q[1] - P[1]), ux = (Q[0] - P[0]) / L, uz = (Q[1] - P[1]) / L, nx = -uz, nz = ux;
  return { P, L, ux, uz, nx, nz, ang: Math.atan2(uz, ux),
    at: (t, o) => [P[0] + ux * t + nx * o, P[1] + uz * t + nz * o],
    to: (x, z) => [(x - P[0]) * ux + (z - P[1]) * uz, (x - P[0]) * nx + (z - P[1]) * nz] };
}
export function grade(P, r) {
  if (r <= P[0][0]) return P[0][1] + 0.03 * (P[0][0] - r);
  const last = P[P.length - 1];
  if (r >= last[0]) return last[1] - 0.05 * (r - last[0]);
  let k = 1;
  while (P[k][0] < r) k++;
  const [a, ya] = P[k - 1], [b, yb] = P[k];
  return ya + (yb - ya) * (r - a) / (b - a);
}
export function cumulate(L) {
  const cum = [0];
  for (let k = 1; k < L.length; k++) cum.push(cum[k - 1] + Math.hypot(L[k][0] - L[k - 1][0], L[k][1] - L[k - 1][1]));
  return cum;
}
export function pointAt(L, cum, s) {
  let k = 1;
  while (k < L.length - 1 && cum[k] < s) k++;
  const l = cum[k] - cum[k - 1] || 1, f = (s - cum[k - 1]) / l, dx = (L[k][0] - L[k - 1][0]) / l, dz = (L[k][1] - L[k - 1][1]) / l;
  return [L[k - 1][0] + (L[k][0] - L[k - 1][0]) * f, L[k - 1][1] + (L[k][1] - L[k - 1][1]) * f, dx, dz];
}

// ------------------------------------------------------------------------------------------------ ground fix-ups
// The tiles share vertices per layer, and a triangle half in and half out would blend the surface ids, so a changed
// triangle gets copies of its vertices.
export function resurface(ground, box, pick) {
  const tiles = (ground?.root?.children ?? []).filter((m) => m.material?.name === 'cherkasy-ground' && m.geometry?.index);
  let n = 0;
  for (const m of tiles) {
    const geo = m.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (bb.max.x < box[0] || bb.min.x > box[2] || bb.max.z < box[1] || bb.min.z > box[3]) continue;
    const P = geo.attributes.position.array, Nn = geo.attributes.normal.array, Sf = geo.attributes.aSurf.array, I = geo.index.array;
    const add = { p: [], n: [], s: [] }, copy = new Map(), idx = Array.from(I);
    let base = P.length / 3, hit = 0;
    const dup = (v, s) => {
      const key = v * 32 + s;
      let c = copy.get(key);
      if (c === undefined) { copy.set(key, c = base++); add.p.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]); add.n.push(Nn[3 * v], Nn[3 * v + 1], Nn[3 * v + 2]); add.s.push(s); }
      return c;
    };
    for (let k = 0; k < I.length; k += 3) {
      const a = I[k], b = I[k + 1], c = I[k + 2];
      const x = (P[3 * a] + P[3 * b] + P[3 * c]) / 3, z = (P[3 * a + 2] + P[3 * b + 2] + P[3 * c + 2]) / 3;
      if (x < box[0] || x > box[2] || z < box[1] || z > box[3]) continue;
      const s = pick(x, z, Sf[a], P, a, b, c);
      if (s === null || s === undefined) continue;
      if (s < 0) { idx[k + 1] = idx[k + 2] = a; hit++; continue; }
      idx[k] = dup(a, s); idx[k + 1] = dup(b, s); idx[k + 2] = dup(c, s); hit++;
    }
    if (!hit) continue;
    const grow = (arr, extra) => { const out = new Float32Array(arr.length + extra.length); out.set(arr); out.set(extra, arr.length); return out; };
    geo.dispose(); // drop the GPU buffers; three uploads the new ones on the next draw
    geo.setAttribute('position', new THREE.BufferAttribute(grow(P, add.p), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(grow(Nn, add.n), 3));
    geo.setAttribute('aSurf', new THREE.BufferAttribute(grow(Sf, add.s), 1));
    geo.setIndex(new THREE.BufferAttribute(base > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
    n += hit;
  }
  return n;
}
export function dropPaint(ground, test) {
  const mk = ground?.root?.children?.find((m) => m.name === 'markings');
  if (!mk?.geometry?.index) return 0;
  const P = mk.geometry.attributes.position.array, I = mk.geometry.index.array;
  let n = 0;
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k], b = I[k + 1], c = I[k + 2];
    if (b === a && c === a) continue;
    const x = (P[3 * a] + P[3 * b] + P[3 * c]) / 3, z = (P[3 * a + 2] + P[3 * b + 2] + P[3 * c + 2]) / 3;
    let lx = 0, lz = 0; // the longest edge: a strip's direction
    for (const [p, q] of [[a, b], [b, c], [c, a]]) { const ex = P[3 * q] - P[3 * p], ez = P[3 * q + 2] - P[3 * p + 2]; if (ex * ex + ez * ez > lx * lx + lz * lz) { lx = ex; lz = ez; } }
    if (!test(x, z, lx, lz)) continue;
    I[k + 1] = I[k + 2] = a; n++;
  }
  if (n) mk.geometry.index.needsUpdate = true;
  return n;
}

// ------------------------------------------------------------------------------------------------ meshes
export function sboxer(Fr) {
  return (M, ta, tb, oa, ob, lo, hi, mask = 63) => {
    if (ta > tb) [ta, tb] = [tb, ta];
    if (oa > ob) [oa, ob] = [ob, oa];
    const c = (t, o, f) => { const [x, z] = Fr.at(t, o); return [x, f(t, o), z]; };
    const u = [Fr.ux, 0, Fr.uz], n = [Fr.nx, 0, Fr.nz], neg = (v) => v.map((q) => -q);
    if (mask & 4) M.face([c(ta, oa, hi), c(tb, oa, hi), c(tb, ob, hi), c(ta, ob, hi)], [0, 1, 0]);
    if (mask & 8) M.face([c(ta, oa, lo), c(ta, ob, lo), c(tb, ob, lo), c(tb, oa, lo)], [0, -1, 0]);
    if (mask & 1) M.face([c(ta, ob, lo), c(tb, ob, lo), c(tb, ob, hi), c(ta, ob, hi)], n);
    if (mask & 2) M.face([c(ta, oa, lo), c(ta, oa, hi), c(tb, oa, hi), c(tb, oa, lo)], neg(n));
    if (mask & 16) M.face([c(tb, oa, lo), c(tb, oa, hi), c(tb, ob, hi), c(tb, ob, lo)], u);
    if (mask & 32) M.face([c(ta, oa, lo), c(ta, ob, lo), c(ta, ob, hi), c(ta, oa, hi)], neg(u));
  };
}
export const barTex = () => canvasTex(16, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#fff'; c.fillRect(w / 2 - 2, 0, 4, h); }, { srgb: false });
export function topMesh() {
  const top = { p: [], n: [], s: [], i: [] };
  return {
    get v() { return top.p.length / 3; },
    quad(pts, nrm, surf) { // wound to face along nrm
      const b = top.p.length / 3;
      for (const [x, y, z] of pts) { top.p.push(x, y, z); top.n.push(...nrm); top.s.push(surf); }
      const [p0, p1, p2] = pts, e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      const f = nrm[0] * (e1[1] * e2[2] - e1[2] * e2[1]) + nrm[1] * (e1[2] * e2[0] - e1[0] * e2[2]) + nrm[2] * (e1[0] * e2[1] - e1[1] * e2[0]);
      top.i.push(...(f > 0 ? [b, b + 1, b + 2, b, b + 2, b + 3] : [b, b + 2, b + 1, b, b + 3, b + 2]));
    },
    mesh(material, name) {
      if (!material || !top.i.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(top.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(top.n, 3));
      g.setAttribute('aSurf', new THREE.Float32BufferAttribute(top.s, 1));
      g.setIndex(top.i);
      return Object.assign(new THREE.Mesh(g, material), { name, receiveShadow: true });
    },
  };
}
export const groundMat = (ground) => (ground?.root?.children ?? []).find((m) => m.material?.name === 'cherkasy-ground')?.material ?? null;
