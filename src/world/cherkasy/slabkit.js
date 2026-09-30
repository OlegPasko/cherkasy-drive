// OWNER: cherkasy. Small shared kit for the hand-built ordinary blocks (hotel Dnipro, the Dnipro Plaza and DEPO't
// malls, the polytechnic college): walls laid per plane in a face frame, cut round their openings, windows with real reveal
// depth, box / prism helpers and the closing step that turns the builders into meshes. Not a site module: the site
// files import it.
//   face(a, b, nx, nz) -> f         plane over the map points a -> b with the outward normal (nx, nz); s runs a -> b,
//                                   y up, o outward; f.cuts [{ s0, s1, y0, y1 }] are the holes in its skin
//   ringFaces(ring) -> [f]          one face per ring edge, normals pointing out of the polygon (any winding)
//   at(f, s, y, o) -> [x, y, z];  quad(D, a, b, c, d, n, uv?);  rect(D, f, s0, s1, y0, y1, o?, uvM?, n?)
//   box(D, f, s0, s1, y0, y1, o0, o1, sides = 'fblrtu', uvM?)   f front (o1), b back (o0), l / r the s0 / s1 ends,
//                                   t top, u underside;  uvM = [metres per u, metres per v]
//   spans(f, y0, y1) -> [[s0, s1]]  stretches of the face free of cuts over y0..y1
//   skin(D, f, y0, y1, col, uvM?)   the wall surface y0..y1 round the cuts
//   hole(B, f, q)                   reveals, glass and frame of the opening q = { s0, s1, y0, y1, dep?, rev?, frame?,
//                                   glass?, lit?, pitch?, tr? (transom y), sill? (colour), door? }; B needs det, lit, glass
//   label(D, f, s0, s1, y0, y1, o, [u0, v0, u1, v1])   atlas rectangle (canvas fractions, v down) on the face, read
//                                   left to right from outside
//   solid(S, f, s0, s1, o0, o1, y0, y1, kind?, flags?)   collision prism over an s / o rectangle
//   finish(root, name, B, M, { shade? }) -> { group, verts, tris, meshes }   builders -> meshes (empty ones skipped);
//                                   shade: the keys that cast shadows
//   speckle(r, base, n?) -> texture  fine render speckle, tinted by the vertex colour
import { Group, Mesh } from 'three';
import { area2 } from './geo.js';
import { canvasTex } from './sculpt.js';

export const [UP, DN] = [[0, 1, 0], [0, -1, 0]];
const neg = (v) => v.map((q) => -q);

export function face(a, b, nx, nz) {
  const run = [b[0] - a[0], b[1] - a[1]], len = Math.hypot(...run) || 1e-6, [ux, uz] = run.map((v) => v / len);
  return { ax: a[0], az: a[1], ux, uz, nx, nz, L: len, N: [nx, 0, nz], U: [ux, 0, uz], cuts: [] };
}
// a positive ring (area2 > 0) has its outside on the right of each edge: n = (uz, -ux)
export function ringFaces(ring) {
  const sg = Math.sign(area2(ring)) || 1;
  return ring.map((a, k, all) => {
    const f = face(a, all[k + 1] ?? all[0], 0, 0), nx = sg * f.uz, nz = -sg * f.ux;
    return Object.assign(f, { nx, nz, N: [nx, 0, nz], k });
  });
}
export const at = (f, s, y, o = 0) => [f.ax + f.ux * s + f.nx * o, y, f.az + f.uz * s + f.nz * o];

// the winding follows n, so either corner order works
export function quad(D, a, b, c, d, n, uv) {
  const [e, g] = [b, d].map((p) => p.map((v, i) => v - a[i]));
  const cr = [e[1] * g[2] - e[2] * g[1], e[2] * g[0] - e[0] * g[2], e[0] * g[1] - e[1] * g[0]];
  const first = D.v;
  for (const [k, p] of [a, b, c, d].entries()) D.vert(...p, ...n, uv?.[k][0] ?? 0, uv?.[k][1] ?? 0);
  const [j1, j3] = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] >= 0 ? [1, 3] : [3, 1];
  D.quad(first, first + j1, first + 2, first + j3);
}
const uvOf = (uvM, s0, s1, y0, y1) => uvM && [[s0 / uvM[0], y0 / uvM[1]], [s1 / uvM[0], y0 / uvM[1]], [s1 / uvM[0], y1 / uvM[1]], [s0 / uvM[0], y1 / uvM[1]]];
export const rect = (D, f, s0, s1, y0, y1, o = 0, uvM = null, n = f.N) => quad(D, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), n, uvOf(uvM, s0, s1, y0, y1));

export function box(D, f, s0, s1, y0, y1, o0, o1, sides = 'fblrtu', uvM = null) {
  const p = (s, y, o) => at(f, s, y, o);
  for (const c of sides) {
    if (c === 'f') rect(D, f, s0, s1, y0, y1, o1, uvM);
    else if (c === 'b') rect(D, f, s0, s1, y0, y1, o0, null, neg(f.N));
    else if (c === 'l') quad(D, p(s0, y0, o0), p(s0, y0, o1), p(s0, y1, o1), p(s0, y1, o0), neg(f.U), uvM && [[o0 / uvM[0], y0 / uvM[1]], [o1 / uvM[0], y0 / uvM[1]], [o1 / uvM[0], y1 / uvM[1]], [o0 / uvM[0], y1 / uvM[1]]]);
    else if (c === 'r') quad(D, p(s1, y0, o0), p(s1, y0, o1), p(s1, y1, o1), p(s1, y1, o0), f.U, uvM && [[o0 / uvM[0], y0 / uvM[1]], [o1 / uvM[0], y0 / uvM[1]], [o1 / uvM[0], y1 / uvM[1]], [o0 / uvM[0], y1 / uvM[1]]]);
    else if (c === 't') quad(D, p(s0, y1, o0), p(s1, y1, o0), p(s1, y1, o1), p(s0, y1, o1), UP, uvM && [[s0 / uvM[0], o0 / uvM[1]], [s1 / uvM[0], o0 / uvM[1]], [s1 / uvM[0], o1 / uvM[1]], [s0 / uvM[0], o1 / uvM[1]]]);
    else if (c === 'u') quad(D, p(s0, y0, o0), p(s1, y0, o0), p(s1, y0, o1), p(s0, y0, o1), DN);
  }
}

export function spans(f, y0, y1) {
  const free = [], cross = f.cuts.filter((q) => q.y0 < y1 - 1e-3 && q.y1 > y0 + 1e-3).sort((p, q) => p.s0 - q.s0);
  const end = cross.reduce((s, q) => { if (q.s0 > s + 1e-3) free.push([s, q.s0]); return Math.max(s, q.s1); }, 0);
  return end < f.L - 1e-3 ? [...free, [end, f.L]] : free;
}
export function skin(D, f, y0, y1, col, uvM = null) {
  const ys = [...new Set([y0, y1, ...f.cuts.flatMap((q) => [q.y0, q.y1]).filter((y) => y > y0 && y < y1)])].sort((a, b) => a - b);
  D.setColor(col);
  ys.slice(1).forEach((yb, i) => {
    if (yb - ys[i] > 1e-3) for (const [a, b] of spans(f, ys[i], yb)) rect(D, f, a, b, ys[i], yb, 0, uvM);
  });
}

export function hole(B, f, q) {
  const D = B.det, { s0, s1, y0, y1 } = q, d = q.dep ?? 0.22, g = -d + 0.04, o = g + 0.03, t = 0.06;
  D.setColor(q.rev ?? '#d9d6ce');
  quad(D, at(f, s0, y0), at(f, s0, y0, -d), at(f, s0, y1, -d), at(f, s0, y1), f.U);
  quad(D, at(f, s1, y0), at(f, s1, y0, -d), at(f, s1, y1, -d), at(f, s1, y1), neg(f.U));
  quad(D, at(f, s0, y1), at(f, s1, y1), at(f, s1, y1, -d), at(f, s0, y1, -d), DN);
  quad(D, at(f, s0, y0), at(f, s1, y0), at(f, s1, y0, -d), at(f, s0, y0, -d), UP);
  const G = q.lit ? B.lit : B.glass;
  G.setColor(q.glass ?? '#4c5860'); rect(G, f, s0, s1, y0, y1, g);
  D.setColor(q.frame ?? '#ecebe6');
  const bar = (a, b) => rect(D, f, a, b, y0, y1, o), rail = (y) => rect(D, f, s0, s1, y - t / 2, y + t / 2, o);
  bar(s0, s0 + t); bar(s1 - t, s1); rail(y1 - t / 2); if (!q.door) rail(y0 + t / 2);
  const n = Math.max(1, Math.round((s1 - s0) / (q.pitch ?? 1.2)));
  for (let i = 1; i < n; i++) { const m = s0 + (s1 - s0) * i / n; bar(m - t / 2, m + t / 2); }
  if (q.tr) rail(q.tr);
  if (q.sill) { D.setColor(q.sill); box(D, f, s0 - 0.05, s1 + 0.05, y0 - 0.06, y0, -0.02, 0.07, 'ftlr'); }
}

export function label(D, f, s0, s1, y0, y1, o, [u0, v0, u1, v1]) {
  const [a, b] = f.ux * f.nz - f.uz * f.nx < 0 ? [u1, u0] : [u0, u1]; // s runs to the viewer's left: flip u
  quad(D, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), f.N, [[a, 1 - v1], [b, 1 - v1], [b, 1 - v0], [a, 1 - v0]]);
}

export function solid(S, f, s0, s1, o0, o1, y0, y1, kind = 'wall', flags = 0) {
  const P = [[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = at(f, s, 0, o); return [p[0], p[2]]; });
  S.prism((area2(P) < 0 ? P.reverse() : P).flat(), y0, y1, 0, 0, kind, flags);
}

export function finish(root, name, B, M, { shade = [] } = {}) {
  const group = Object.assign(new Group(), { name }), out = { group, verts: 0, tris: 0, meshes: 0 };
  root.add(out.group);
  for (const [k, D] of Object.entries(B)) {
    if (!D.v || !M[k]) continue;
    const geo = D.build();
    out.verts += D.v; out.tris += geo.index.count / 3; out.meshes++;
    group.add(Object.assign(new Mesh(geo, M[k]), { name: `${name}-${k}`, castShadow: shade.includes(k), receiveShadow: true }));
  }
  return out;
}

// 2.5 m per repeat at the usual uv scale; the hue comes from the vertex colour
export const speckle = (r, base = '#f2f1ed', n = 1400) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.3)' : 'rgba(80,70,60,0.06)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
});
