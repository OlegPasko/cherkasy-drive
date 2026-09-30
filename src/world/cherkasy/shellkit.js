// OWNER: cherkasy (shared by the hand-built malls and public blocks: lyubava, pioner, slavutych, spartak). Small
// geometry vocabulary for walls laid per footprint edge, so each site module only states its own layout.
//   ringFaces(ring) -> faces, one per edge of the OSM ring (any winding), each an edge frame
//   edge(a, b, nx, nz) -> frame { ax, az, ux, uz, nx, nz, L, cuts: [] }: s along a -> b, y up, o along the outward normal
//   at(f, s, y, o) -> [x, y, z];  quad(D, a, b, c, d, n, uv?) with the winding taken from n
//   plate(D, f, s0, s1, y0, y1, o, n?, uvM?)  rectangle in the face plane; uvM = [metres per u, per v, y of v = 0]
//   slab(D, f, s0, s1, y0, y1, o0, o1, sides = 'fblrtu', uvM?)  box in the frame (front, back, left, right, top, under)
//   gaps(f, y0, y1, keep?) -> [[s0, s1], ...] free stretches of the band round the cuts (keep(c) filters the cuts)
//   skin(D, f, y0, y1, col, uvM?)  wall surface round the cuts
//   hole(B, f, q)  one opening with reveals, frame, mullions and glass: q { s0, s1, y0, y1, glass, frame, pitch, tr,
//     dep, dark, rev, sill, door }; B needs det / glass / lit builders
//   block(S, f, s0, s1, o0, o1, y0, y1, kind, flags)  collision prism over a frame rectangle
//   fin(root, name, B, M, flat) -> { group, meshes, tris, verts }  one mesh per non-empty builder, flat keys cast no shadow
//   base(ring, heightAt) -> { lo, hi, mean } ground heights along the ring (corners and edge midpoints)
import { Group, Mesh } from 'three';
import { area2 } from './geo.js';

export const UP = [0, 1, 0];
const DN = [0, -1, 0], neg = ([a, b, c]) => [-a, -b, -c];

export const edge = (a, b, nx, nz) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1e-6;
  return { ax: a[0], az: a[1], ux: dx / L, uz: dz / L, nx, nz, L, cuts: [] };
};
export function ringFaces(ring) {
  const sg = area2(ring) > 0 ? 1 : -1;
  return ring.map((a, k) => {
    const b = ring[(k + 1) % ring.length], [dx, dz] = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(dx, dz) || 1e-6;
    return Object.assign(edge(a, b, sg * dz / L, -sg * dx / L), { k });
  });
}
export const at = (f, s, y, o = 0) => [f.ax + f.ux * s + f.nx * o, y, f.az + f.uz * s + f.nz * o];

const sub = (p, q) => p.map((v, i) => v - q[i]);
export function quad(D, a, b, c, d, n, uv) {
  const [ex, ey, ez] = sub(b, a), [gx, gy, gz] = sub(d, a);
  const facing = n[0] * (ey * gz - ez * gy) + n[1] * (ez * gx - ex * gz) + n[2] * (ex * gy - ey * gx);
  const first = D.v;
  [a, b, c, d].forEach((p, k) => D.vert(...p, ...n, uv?.[k][0] ?? 0, uv?.[k][1] ?? 0));
  const [i1, i3] = facing >= 0 ? [1, 3] : [3, 1]; // wind the pair so the front looks along n
  D.quad(first, first + i1, first + 2, first + i3);
}
const uvOf = (s0, s1, y0, y1, m) => m && [[s0 / m[0], (y0 - m[2]) / m[1]], [s1 / m[0], (y0 - m[2]) / m[1]], [s1 / m[0], (y1 - m[2]) / m[1]], [s0 / m[0], (y1 - m[2]) / m[1]]];
export const plate = (D, f, s0, s1, y0, y1, o = 0, n = [f.nx, 0, f.nz], uvM) =>
  quad(D, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), n, uvOf(s0, s1, y0, y1, uvM));
export function slab(D, f, s0, s1, y0, y1, o0, o1, sides = 'fblrtu', uvM) {
  const N = [f.nx, 0, f.nz], U = [f.ux, 0, f.uz], p = (s, y, o) => at(f, s, y, o);
  for (const c of sides) {
    if (c === 'f') plate(D, f, s0, s1, y0, y1, o1, N, uvM);
    else if (c === 'b') plate(D, f, s0, s1, y0, y1, o0, neg(N));
    else if (c === 'l' || c === 'r') { const e = c === 'l' ? s0 : s1; quad(D, p(e, y0, o0), p(e, y0, o1), p(e, y1, o1), p(e, y1, o0), c === 'l' ? neg(U) : U); }
    else if (c === 't' || c === 'u') { const h = c === 't' ? y1 : y0; quad(D, p(s0, h, o0), p(s1, h, o0), p(s1, h, o1), p(s0, h, o1), c === 't' ? UP : DN); }
  }
}
export function gaps(f, y0, y1, keep) {
  const cs = f.cuts.filter((c) => (!keep || keep(c)) && c.y0 < y1 - 1e-3 && c.y1 > y0 + 1e-3).sort((p, q) => p.s0 - q.s0);
  const out = [];
  let run = 0;
  for (const c of cs) { if (c.s0 > run + 1e-3) out.push([run, c.s0]); run = Math.max(run, c.s1); }
  return run < f.L - 1e-3 ? [...out, [run, f.L]] : out;
}
export function skin(D, f, y0, y1, col, uvM) {
  const ys = [y0, y1];
  for (const c of f.cuts) for (const y of [c.y0, c.y1]) if (y > y0 && y < y1) ys.push(y);
  ys.sort((p, q) => p - q);
  if (col) D.setColor(col);
  ys.forEach((ya, i) => {
    const yb = ys[i + 1];
    if (yb !== undefined && yb - ya > 1e-3) for (const [a, b] of gaps(f, ya, yb)) plate(D, f, a, b, ya, yb, 0, undefined, uvM);
  });
}
export function hole(B, f, q) {
  const D = B.det, { s0, s1, y0, y1 } = q, d = q.dep ?? 0.2, g = -d + 0.04, U = [f.ux, 0, f.uz];
  D.setColor(q.rev || '#d8d6d0');
  quad(D, at(f, s0, y0), at(f, s0, y0, -d), at(f, s0, y1, -d), at(f, s0, y1), U);
  quad(D, at(f, s1, y0), at(f, s1, y0, -d), at(f, s1, y1, -d), at(f, s1, y1), neg(U));
  quad(D, at(f, s0, y1), at(f, s1, y1), at(f, s1, y1, -d), at(f, s0, y1, -d), DN);
  quad(D, at(f, s0, y0), at(f, s1, y0), at(f, s1, y0, -d), at(f, s0, y0, -d), UP);
  const G = q.dark ? B.glass : B.lit;
  G.setColor(q.glass); plate(G, f, s0, s1, y0, y1, g);
  D.setColor(q.frame);
  const o = g + 0.03, t = q.door ? 0.07 : 0.05, bar = (a, b) => plate(D, f, a, b, y0, y1, o), rail = (y) => plate(D, f, s0, s1, y - t, y + t, o);
  bar(s0, s0 + 0.07); bar(s1 - 0.07, s1); rail(y0 + t); rail(y1 - t);
  const n = Math.max(1, Math.round((s1 - s0) / (q.pitch ?? 1.4)));
  for (let i = 1; i < n; i++) { const m = s0 + (s1 - s0) * i / n; bar(m - 0.035, m + 0.035); }
  if (q.tr) rail(q.tr);
  if (q.sill) { D.setColor(q.sill === true ? '#c9c7c0' : q.sill); slab(D, f, s0 - 0.05, s1 + 0.05, y0 - 0.06, y0, 0, 0.07, 'ftlr'); }
}
export function block(S, f, s0, s1, o0, o1, y0, y1, kind = 'wall', flags = 0) {
  const P = [[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = at(f, s, 0, o); return [p[0], p[2]]; });
  if (area2(P) < 0) P.reverse();
  return S.prism(P.flat(), y0, y1, 0, 0, kind, flags);
}
export function base(ring, heightAt) {
  const hs = [];
  ring.forEach((a, k) => { const b = ring[(k + 1) % ring.length]; hs.push(heightAt(a[0], a[1]), heightAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)); });
  return { lo: Math.min(...hs), hi: Math.max(...hs), mean: hs.reduce((s, h) => s + h, 0) / hs.length };
}
export function fin(root, name, B, M, flat = []) {
  const group = Object.assign(new Group(), { name });
  root.add(group);
  let meshes = 0, tris = 0, verts = 0;
  for (const [k, D] of Object.entries(B)) {
    if (!D.v) continue;
    const geo = D.build();
    meshes++; verts += D.v; tris += geo.index.count / 3;
    group.add(Object.assign(new Mesh(geo, M[k]), { name: `${name}-${k}`, castShadow: !flat.includes(k), receiveShadow: true }));
  }
  return { group, meshes, tris, verts };
}
