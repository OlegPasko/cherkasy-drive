// OWNER: cherkasy. Shared parts for the hand-built civic blocks around Soborna square (miskrada, poshtamt,
// oblbiblioteka, medakademia): wall faces taken from an OSM ring, walls laid round their openings so the windows keep
// real reveals, window / door fills, a few canvas textures and the mesh packing with its stats.
//   wallFaces(ring) -> [face]   one face per straight wall (collinear edges merged), outward normal by an inside test;
//     face { ax, az, rx, rz, nx, nz, w, N, R, L, open: [] }: s runs to the viewer's right seen from outside, o outward
//   at(f, s, y, o = 0) -> [x, y, z];  quad(D, a, b, c, d, n, uv?) (winding picked from n)
//   skin(D, f, s0, s1, y0, y1, o = 0, uvm = [3, 3])   flat patch in the face plane, uv in metres / uvm
//   fbox(D, f, s0, s1, y0, y1, o0, o1, m = 63)   box in the face frame; m: 1 front, 2 back, 4 left, 8 right, 16 top, 32 bottom
//   fsolid(S, f, s0, s1, o0, o1, y0, y1, kind, flags = 0)   collision prism over an s / o rectangle
//   wallAround(D, f, y0, y1, uvm, colour)   the wall between y0 and y1 minus f.open ({ s0, s1, y0, y1 })
//   fillOpening(B, f, q)   reveals, frame, mullions, glass (B.glass or B.lit); q { s0, s1, y0, y1, dep, frame, glass,
//     lit, pane, rev, sill, low, lowCol, door }
//   stoneTex(r, base, opts), tileTex(r, base, opts), brickTex(r, opts), paveTex(r, a, b, opts)   tiling canvas
//     textures, 512 px, near white so the vertex colour tints them
//   paveRect(D, f, s0, s1, o0, o1, heightAt, { cell, lift, rep })   pavement draped on the terrain in front of a face
//   pack(root, name, B, M, noShadow) -> { group, verts, tris, meshes }
import * as THREE from 'three';
import { canvasTex } from './sculpt.js';
import { area2 } from './geo.js';

export const UP = [0, 1, 0], DOWN = [0, -1, 0];

// ------------------------------------------------------------------------------------------------ faces
// a wall from the corner p to q with outward normal n; its s axis is the viewer's right, (n.z, -n.x), so the face
// starts at whichever corner lies further left
function faceOf(p, q, nx, nz) {
  const rx = nz, rz = -nx, sp = p[0] * rx + p[1] * rz, sq = q[0] * rx + q[1] * rz, o = sp <= sq ? p : q;
  return { ax: o[0], az: o[1], rx, rz, nx, nz, w: Math.abs(sq - sp), N: [nx, 0, nz], R: [rx, 0, rz], L: [-rx, 0, -rz], open: [] };
}
export function wallFaces(P) {
  const sgn = area2(P) > 0 ? 1 : -1, runs = [];
  let p = P[P.length - 1];
  for (const q of P) {
    const ex = q[0] - p[0], ez = q[1] - p[1], len = Math.hypot(ex, ez);
    // outward: to the right of the edge on a counter-clockwise ring (in x, z), to the left otherwise
    if (len >= 0.05) {
      const nx = sgn * ez / len, nz = -sgn * ex / len, run = runs.at(-1);
      if (run && run.nx * nx + run.nz * nz > 0.9995) run.q = q; else runs.push({ p, q, nx, nz });
    }
    p = q;
  }
  const head = runs[0], tail = runs.at(-1);
  if (runs.length > 1 && head.nx * tail.nx + head.nz * tail.nz > 0.9995) { head.p = tail.p; runs.pop(); }
  return runs.map((e) => faceOf(e.p, e.q, e.nx, e.nz));
}
export const at = (f, s, y, o = 0) => [f.ax + f.rx * s + f.nx * o, y, f.az + f.rz * s + f.nz * o];

// ------------------------------------------------------------------------------------------------ primitives
const NOUV = [[0, 0], [0, 0], [0, 0], [0, 0]];
// which way round a, b, d go when seen along n: the sign of n . ((b - a) x (d - a))
const turn = (n, a, b, d) => {
  const e = [0, 1, 2].map((i) => b[i] - a[i]), g = [0, 1, 2].map((i) => d[i] - a[i]);
  return n[0] * (e[1] * g[2] - e[2] * g[1]) - n[1] * (e[0] * g[2] - e[2] * g[0]) + n[2] * (e[0] * g[1] - e[1] * g[0]);
};
export function quad(D, a, b, c, d, n, uv = NOUV) {
  const corners = turn(n, a, b, d) < 0 ? [[d, 3], [c, 2], [b, 1], [a, 0]] : [[a, 0], [b, 1], [c, 2], [d, 3]];
  const [i0, i1, i2, i3] = corners.map(([p, k]) => D.vert(p[0], p[1], p[2], n[0], n[1], n[2], uv[k][0], uv[k][1]));
  D.quad(i0, i1, i2, i3);
}
export function skin(D, f, s0, s1, y0, y1, o = 0, uvm = [3, 3]) {
  if (s1 - s0 < 1e-3 || y1 - y0 < 1e-3) return;
  const u0 = s0 / uvm[0], u1 = s1 / uvm[0], v0 = y0 / uvm[1], v1 = y1 / uvm[1];
  quad(D, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), f.N, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
}
export function fbox(D, f, s0, s1, y0, y1, o0, o1, m = 63) {
  const P = (s, y, o) => at(f, s, y, o);
  if (m & 1) quad(D, P(s0, y0, o1), P(s1, y0, o1), P(s1, y1, o1), P(s0, y1, o1), f.N);
  if (m & 2) quad(D, P(s0, y0, o0), P(s1, y0, o0), P(s1, y1, o0), P(s0, y1, o0), [-f.nx, 0, -f.nz]);
  if (m & 4) quad(D, P(s0, y0, o0), P(s0, y0, o1), P(s0, y1, o1), P(s0, y1, o0), f.L);
  if (m & 8) quad(D, P(s1, y0, o0), P(s1, y0, o1), P(s1, y1, o1), P(s1, y1, o0), f.R);
  if (m & 16) quad(D, P(s0, y1, o0), P(s1, y1, o0), P(s1, y1, o1), P(s0, y1, o1), UP);
  if (m & 32) quad(D, P(s0, y0, o0), P(s1, y0, o0), P(s1, y0, o1), P(s0, y0, o1), DOWN);
}
export function fsolid(S, f, s0, s1, o0, o1, y0, y1, kind, flags = 0) {
  const Q = [[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = at(f, s, 0, o); return [p[0], p[2]]; });
  return S.prism(Q.flat(), y0, y1, 0, 0, kind, flags);
}

// ------------------------------------------------------------------------------------------------ walls
// the wall is cut into horizontal bands at every opening edge; each band is filled between the openings crossing it
export function wallAround(D, f, y0, y1, uvm, col) {
  if (col) D.setColor(col);
  const lv = [y0, y1];
  for (const q of f.open) for (const y of [q.y0, q.y1]) if (y > y0 + 1e-3 && y < y1 - 1e-3 && !lv.some((v) => Math.abs(v - y) < 1e-4)) lv.push(y);
  lv.sort((u, v) => u - v);
  for (let k = 1; k < lv.length; k++) {
    const lo = lv[k - 1], hi = lv[k], mid = (lo + hi) / 2;
    const gaps = f.open.filter((q) => q.y0 < mid && q.y1 > mid).sort((u, v) => u.s0 - v.s0);
    let from = 0;
    for (const q of gaps) { skin(D, f, from, q.s0, lo, hi, 0, uvm); from = Math.max(from, q.s1); }
    skin(D, f, from, f.w, lo, hi, 0, uvm); // skin() drops empty spans
  }
}
export function fillOpening(B, f, q) {
  const D = B.det, { s0, s1, y0, y1 } = q, bk = -(q.dep ?? 0.2), fo = bk + 0.04, t = q.t ?? 0.06;
  D.setColor(q.rev ?? '#cfccc4');
  quad(D, at(f, s0, y0), at(f, s0, y0, bk), at(f, s0, y1, bk), at(f, s0, y1), f.R);
  quad(D, at(f, s1, y0), at(f, s1, y0, bk), at(f, s1, y1, bk), at(f, s1, y1), f.L);
  quad(D, at(f, s0, y1), at(f, s1, y1), at(f, s1, y1, bk), at(f, s0, y1, bk), DOWN);
  quad(D, at(f, s0, y0), at(f, s1, y0), at(f, s1, y0, bk), at(f, s0, y0, bk), UP);
  let g0 = y0;
  if (q.low) { D.setColor(q.lowCol ?? '#8d8b86'); skin(D, f, s0, s1, y0, y0 + q.low, bk + 0.01); g0 += q.low; }
  const G = q.lit ? B.lit : B.glass;
  G.setColor(q.glass ?? '#56626a');
  quad(G, at(f, s0, g0, bk), at(f, s1, g0, bk), at(f, s1, y1, bk), at(f, s0, y1, bk), f.N);
  D.setColor(q.frame ?? '#eeeeea');
  const panes = Math.max(1, Math.round((s1 - s0) / (q.pane ?? 0.8))), step = (s1 - s0 - t) / panes;
  for (let i = 0; i <= panes; i++) { const m = s0 + i * step; fbox(D, f, m, m + t, g0, y1, bk, fo, 1 | 4 | 8); }
  fbox(D, f, s0, s1, y1 - t, y1, bk, fo, 1 | 32); fbox(D, f, s0, s1, g0, g0 + t, bk, fo, 1 | 16);
  if (q.door) fbox(D, f, s0, s1, y0 + 2.1, y0 + 2.18, bk, fo, 1 | 16 | 32); // transom over a door leaf
  else if (y1 - g0 > 2.2) fbox(D, f, s0, s1, y1 - 0.6, y1 - 0.54, bk, fo, 1 | 16 | 32);
  if (q.sill) { D.setColor(q.sill); fbox(D, f, s0 - 0.04, s1 + 0.04, y0 - 0.05, y0, bk, 0.06, 1 | 4 | 8 | 16); }
}

// ------------------------------------------------------------------------------------------------ textures
const shade = (c, k) => `rgb(${c.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))).join(',')})`;
// render / stone: slabs of w x h px with faint joints and grain; base [r, g, b]
export const stoneTex = (r, base = [240, 238, 232], { cols = 2, rows = 2, joint = 0.18, grain = 0.06 } = {}) => canvasTex(512, 512, (g, w, h) => {
  const cw = w / cols, ch = h / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { g.fillStyle = shade(base, 0.975 + r() * 0.035); g.fillRect(i * cw, j * ch, cw, ch); }
  for (let q = 0; q < 2600; q++) { g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${grain})` : `rgba(60,55,45,${grain})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2); }
  if (joint > 0) { g.fillStyle = `rgba(70,64,55,${joint})`; for (let i = 0; i < cols; i++) g.fillRect(i * cw, 0, 2, h); for (let j = 0; j < rows; j++) g.fillRect(0, j * ch, w, 2); }
});
// small ceramic facing tiles (cols x rows per repeat), each fired a shade apart, darker grout
export const tileTex = (r, base, { cols = 12, rows = 24, grout = [150, 130, 110], spread = 0.12 } = {}) => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = shade(grout, 1); g.fillRect(0, 0, w, h);
  const cw = w / cols, ch = h / rows;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    g.fillStyle = shade(base, 1 - spread / 2 + r() * spread);
    g.fillRect(i * cw + 1, j * ch + 1, cw - 2, ch - 2);
  }
});
// face brick in running bond: 8 bricks x 24 courses per repeat
export const brickTex = (r, { base = [176, 108, 74], mortar = [196, 184, 166], spread = 0.16 } = {}) => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = shade(mortar, 1); g.fillRect(0, 0, w, h);
  const bw = w / 8, bh = h / 24;
  for (let j = 0; j < 24; j++) for (let i = 0; i < 9; i++) {
    g.fillStyle = shade(base, 1 - spread / 2 + r() * spread);
    const x = i * bw - (j & 1 ? bw / 2 : 0);
    g.fillRect(x + 1.5, j * bh + 1.5, bw - 3, bh - 3);
  }
});

// concrete pavers, n x n per repeat, two shades mixed at random
export const paveTex = (r, a, b, { n = 16, mix = 0.3 } = {}) => canvasTex(512, 512, (g, w) => {
  g.fillStyle = '#8c8680'; g.fillRect(0, 0, w, w);
  const p = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = shade(r() < mix ? b : a, 0.94 + r() * 0.1); g.fillRect(i * p + 1, j * p + 1, p - 2, p - 2); }
});
// pavement draped on the terrain over an s / o rectangle of a face, `lift` over the ground; uv in world metres / rep
export function paveRect(D, f, s0, s1, o0, o1, heightAt, { cell = 2, lift = 0.07, rep = 4.8 } = {}) {
  const ns = Math.max(1, Math.ceil((s1 - s0) / cell)), no = Math.max(1, Math.ceil((o1 - o0) / cell)), id = [];
  for (let j = 0; j <= no; j++) for (let i = 0; i <= ns; i++) {
    const [x, , z] = at(f, s0 + (s1 - s0) * i / ns, 0, o0 + (o1 - o0) * j / no);
    id.push(D.vert(x, heightAt(x, z) + lift, z, 0, 1, 0, x / rep, z / rep));
  }
  const up = f.rz * f.nx - f.rx * f.nz > 0; // s x o points down: flip so the pavement faces up
  for (let j = 0; j < no; j++) for (let i = 0; i < ns; i++) {
    const a = id[j * (ns + 1) + i], b = a + 1, c = a + ns + 2, d = a + ns + 1;
    if (up) D.quad(a, b, c, d); else D.quad(a, d, c, b);
  }
}

// ------------------------------------------------------------------------------------------------ meshes
// one mesh per builder that holds geometry; glass, lit panes and cloth cast no shadow
export function pack(root, name, B, M, noShadow = ['glass', 'lit']) {
  const group = Object.assign(new THREE.Group(), { name });
  root.add(group);
  let verts = 0, tris = 0, meshes = 0;
  for (const [k, D] of Object.entries(B)) {
    if (!D.v) continue;
    const geo = D.build();
    verts += D.v; tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3; meshes++;
    group.add(Object.assign(new THREE.Mesh(geo, M[k]), { name: `${name}-${k}`, castShadow: !noShadow.includes(k), receiveShadow: true }));
  }
  return { group, verts, tris, meshes };
}
