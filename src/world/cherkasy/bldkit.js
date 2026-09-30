// OWNER: cherkasy. A small kit for the hand-built big-box buildings (epicentr, dytlikarnya, budivelnyk, grandmarket):
// walls laid along the OSM ring edges with real window reveals, shared canvas textures, sign atlases.
//   edgeFaces(ring) -> [face]   one face per ring edge (> 0.05 m): { ax, az, ux, uz, nx, nz, L, k }, n pointing out
//   pt(f, s, y, o = 0) -> [x, y, z]   s metres along the edge, y up, o outward
//   quad(D, a, b, c, d, n, uv?)      a quad whose front looks along n
//   panel(D, f, s0, s1, y0, y1, o = 0, uvM?, n?)   rectangle on the face plane (uvM = [m per u, m per v])
//   fbox(D, f, s0, s1, y0, y1, o0, o1, faces = 'fblrtu')   box in the face frame (f out, b back, l / r ends, t top, u under)
//   wall(D, f, y0, y1, holes, uvM?)  wall surface round the holes [{ s0, s1, y0, y1 }]
//   gaps(f, holes, y0, y1) -> [[s0, s1]]   the stretches of the band y0..y1 no hole crosses
//   win(B, f, q)   a window or door set into the wall: reveals (colour q.rev), glass pane (B.glass, or B.lit when q.lit)
//                  textured with the frame pattern (q.cols panes across, q.rows high), a sill when q.sill
//   row(f, s0, s1, pitch, w, y0, y1, extra) -> holes   evenly spaced windows between s0 and s1
//   facing(f) -> 1 | -1   +1 when s runs to the right of a viewer outside
//   decal(D, f, s0, s1, y0, y1, o, [u0, v0, u1, v1])   an atlas cell on the face, read left to right from outside
//   renderTex(), winTex(), winEmTex()   shared (cached) textures: render speckle 2.5 m, the window frame / its glow mask
//   mats(extra) -> { wall, det, glass, lit, ...extra }   the usual material set (lit: emissive, driven by the caller)
//   finish(root, name, B, M, shadow) -> { group, verts, tris, meshes }   builds each non-empty MB into a mesh
import * as THREE from 'three';
import { canvasTex } from './sculpt.js';
import { area2, inPoly } from './geo.js';

export function edgeFaces(ring) {
  const sense = Math.sign(area2(ring)) || 1;
  return ring.flatMap(([ax, az], k) => {
    const nxt = ring[k + 1] ?? ring[0], ex = nxt[0] - ax, ez = nxt[1] - az, len = Math.sqrt(ex * ex + ez * ez);
    if (!(len >= 0.05)) return [];
    const f = { ax, az, ux: ex / len, uz: ez / len, L: len, k };
    // the ring's sense gives the outside; a sliver can fool it, so probe a point just past the middle
    const out = inPoly(ring, ax + ex / 2 + f.uz * sense / 5, az + ez / 2 - f.ux * sense / 5) ? -sense : sense;
    f.nx = f.uz * out; f.nz = -f.ux * out;
    return [f];
  });
}
export const pt = (f, s, y, o = 0) => [s * f.ux + o * f.nx + f.ax, y, s * f.uz + o * f.nz + f.az];
export const facing = (f) => (f.ux * f.nz > f.uz * f.nx ? 1 : -1);

// the triangle pair keeps a b c d order when (b - a) x (d - a) agrees with n, else runs the other way round
const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vN = new THREE.Vector3();
export function quad(D, a, b, c, d, n, uv) {
  vA.fromArray(b); vB.fromArray(d); vN.fromArray(a);
  const agree = vA.sub(vN).cross(vB.sub(vN)).dot(vN.fromArray(n)) >= 0;
  const id = [a, b, c, d].map((p, j) => D.vert(p[0], p[1], p[2], n[0], n[1], n[2], uv ? uv[j][0] : 0, uv ? uv[j][1] : 0));
  D.quad(id[0], ...(agree ? [id[1], id[2], id[3]] : [id[3], id[2], id[1]]));
}
export function panel(D, f, s0, s1, y0, y1, o = 0, uvM, n = [f.nx, 0, f.nz]) {
  const tex = uvM ? (s, y) => [s / uvM[0], y / uvM[1]] : null;
  quad(D, pt(f, s0, y0, o), pt(f, s1, y0, o), pt(f, s1, y1, o), pt(f, s0, y1, o), n, tex && [tex(s0, y0), tex(s1, y0), tex(s1, y1), tex(s0, y1)]);
}
// each letter is one side: which end of the s, y and o ranges its four corners take (as bit strings), and its normal
const SIDES = {
  f: ['0110', '0011', '1111', 'N'], b: ['0110', '0011', '0000', '-N'], l: ['0000', '0011', '0110', '-U'],
  r: ['1111', '0011', '0110', 'U'], t: ['0110', '1111', '0011', 'Y'], u: ['0110', '0000', '0011', '-Y'],
};
export function fbox(D, f, s0, s1, y0, y1, o0, o1, faces = 'fblrtu') {
  const S = [s0, s1], H = [y0, y1], O = [o0, o1];
  const dir = { N: [f.nx, 0, f.nz], U: [f.ux, 0, f.uz], Y: [0, 1, 0] };
  for (const ch of faces) {
    const [bs, by, bo, nm] = SIDES[ch], neg = nm[0] === '-', v = dir[neg ? nm.slice(1) : nm];
    const P = [0, 1, 2, 3].map((c) => pt(f, S[+bs[c]], H[+by[c]], O[+bo[c]]));
    quad(D, P[0], P[1], P[2], P[3], neg ? v.map((x) => -x) : v);
  }
}

export function gaps(f, holes, y0, y1) {
  const out = [];
  let from = 0;
  for (const h of holes.filter((q) => q.y1 > y0 + 1e-3 && q.y0 < y1 - 1e-3).sort((p, q) => p.s0 - q.s0)) {
    if (h.s0 - from > 1e-3) out.push([from, Math.min(h.s0, f.L)]);
    from = Math.max(from, h.s1);
  }
  if (f.L - from > 1e-3) out.push([from, f.L]);
  return out;
}
export function wall(D, f, y0, y1, holes = [], uvM) {
  const cuts = new Set([y0, y1]);
  holes.forEach((h) => [h.y0, h.y1].forEach((y) => { if (y > y0 + 1e-3 && y < y1 - 1e-3) cuts.add(y); }));
  const ys = [...cuts].sort((a, b) => a - b);
  ys.slice(1).forEach((top, i) => {
    const bot = ys[i];
    if (top - bot > 1e-3) for (const [a, b] of gaps(f, holes, bot, top)) panel(D, f, a, b, bot, top, 0, uvM);
  });
}
export function win(B, f, q) {
  const D = B.det, { s0, s1, y0, y1 } = q, d = -(q.dep ?? 0.18), U = [f.ux, 0, f.uz];
  D.setColor(q.rev ?? '#d8d4cc'); // the four reveals, each facing into the opening
  quad(D, pt(f, s0, y0), pt(f, s0, y0, d), pt(f, s0, y1, d), pt(f, s0, y1), U);
  quad(D, pt(f, s1, y1), pt(f, s1, y1, d), pt(f, s1, y0, d), pt(f, s1, y0), U.map((v) => -v));
  quad(D, pt(f, s1, y1), pt(f, s0, y1), pt(f, s0, y1, d), pt(f, s1, y1, d), [0, -1, 0]);
  quad(D, pt(f, s1, y0), pt(f, s0, y0), pt(f, s0, y0, d), pt(f, s1, y0, d), [0, 1, 0]);
  const cols = q.cols ?? Math.max(1, Math.round((s1 - s0) / 1.2)), rows = q.rows ?? 1, u = facing(f) > 0 ? [0, cols] : [cols, 0];
  const G = q.lit ? B.lit : B.glass, g = d + 0.04;
  G.setColor(q.glass ?? '#ffffff');
  quad(G, pt(f, s0, y0, g), pt(f, s1, y0, g), pt(f, s1, y1, g), pt(f, s0, y1, g), [f.nx, 0, f.nz], [[u[0], 0], [u[1], 0], [u[1], rows], [u[0], rows]]);
  if (q.sill) { D.setColor(q.sill); fbox(D, f, s0 - 0.04, s1 + 0.04, y0 - 0.05, y0, -0.02, 0.07, 'ftlr'); }
}
export function row(f, s0, s1, pitch, w, y0, y1, extra = {}) {
  const n = Math.floor((s1 - s0) / pitch), step = n > 0 ? (s1 - s0) / n : 0;
  return Array.from({ length: Math.max(0, n) }, (_, i) => { const m = s0 + step * (i + 0.5); return { s0: m - w / 2, s1: m + w / 2, y0, y1, ...extra }; });
}
export function decal(D, f, s0, s1, y0, y1, o, cell) {
  const [u0, v0, u1, v1] = cell, L = facing(f) > 0 ? u0 : u1, R = facing(f) > 0 ? u1 : u0;
  quad(D, pt(f, s0, y0, o), pt(f, s1, y0, o), pt(f, s1, y1, o), pt(f, s0, y1, o), [f.nx, 0, f.nz], [[L, 1 - v1], [R, 1 - v1], [R, 1 - v0], [L, 1 - v0]]);
}

// ------------------------------------------------------------------------------------------------ shared textures
const made = new Map();
const shared = (key, make) => { if (!made.has(key)) made.set(key, make()); return made.get(key); };
export const renderTex = () => shared('render', () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#f2f0eb'; g.fillRect(0, 0, w, h);
  let seed = 11;
  const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 1100; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(80,70,60,0.06)';
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}));
// a pane per repeat: a light frame round glass that darkens downwards (the sky caught in its top); the glow mask is
// the same pane in white on black, so only the glass lights at night
function pane(g, w, h, glow) {
  g.fillStyle = glow ? '#000000' : '#eeeeea'; g.fillRect(0, 0, w, h);
  let fill = '#ffffff';
  if (!glow) { fill = g.createLinearGradient(0, 0, 0, h); fill.addColorStop(0, '#8d9aa3'); fill.addColorStop(0.5, '#4d5a63'); fill.addColorStop(1, '#3a444b'); }
  g.fillStyle = fill; g.fillRect(6, 6, w - 12, h - 12);
}
export const winTex = () => shared('win', () => canvasTex(64, 64, (g, w, h) => pane(g, w, h, false)));
export const winEmTex = () => shared('winEm', () => canvasTex(64, 64, (g, w, h) => pane(g, w, h, true)));

export const mats = (extra = {}) => ({
  wall: new THREE.MeshStandardMaterial({ map: renderTex(), vertexColors: true, roughness: 0.9 }),
  det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
  glass: new THREE.MeshStandardMaterial({ map: winTex(), vertexColors: true, roughness: 0.15, metalness: 0.35 }),
  lit: new THREE.MeshStandardMaterial({ map: winTex(), emissiveMap: winEmTex(), vertexColors: true, roughness: 0.2, metalness: 0.2, emissive: 0xffd9a8, emissiveIntensity: 0 }),
  ...extra,
});
// only the builders named in `shadow` cast (the masses); glass, signs and overlays do not need to
export function finish(root, name, B, M, shadow) {
  const group = new THREE.Group();
  group.name = name;
  root.add(group);
  const st = { group, verts: 0, tris: 0, meshes: 0 };
  for (const key of Object.keys(B)) {
    const D = B[key];
    if (!D.v) continue;
    const geo = D.build(), mesh = new THREE.Mesh(geo, M[key]);
    mesh.name = `${name}-${key}`; mesh.castShadow = shadow.includes(key); mesh.receiveShadow = true;
    group.add(mesh);
    st.verts += D.v; st.tris += (geo.index ? geo.index.count : D.v) / 3; st.meshes++;
  }
  st.tris = Math.round(st.tris);
  return st;
}
