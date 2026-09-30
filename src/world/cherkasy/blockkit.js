// OWNER: cherkasy. Small shared kit for the hand-built ordinary blocks (podatkova, school17, kinoukraina, chnu3): wall
// faces laid in a frame taken from a footprint edge, walls as strips round their openings (so windows keep real
// reveals), window units, boxes and collision in that frame, and the mesh / stats wrap-up.
//   edgeFace(a, b, inside, extra?) -> f   frame of edge a -> b ([x, z]); s runs from a along the edge (0..f.L), y up,
//     o outward (away from `inside(x, z)`); f.holes = [] collects the openings cut into the wall
//   at(f, s, y, o = 0) -> [x, y, z]
//   quad(D, a, b, c, d, n, uv?)                  quad facing along n (winding follows n), uv: 4 x [u, v]
//   rect(D, f, s0, s1, y0, y1, o, uvM?, vo = 0)  wall-plane quad at offset o; uvM [mu, mv] metres per texture repeat,
//     v counted from y = vo
//   fbox(D, f, s0, s1, y0, y1, o0, o1, m = 63, uvM?)  box in the frame; m bits 1 front (o1), 2 back (o0),
//     4 s0 end, 8 s1 end, 16 top, 32 bottom
//   wall(D, f, y0, y1, uvM?, o = 0, vo = 0)     the wall between y0 and y1 minus f.holes ({ s0, s1, y0, y1 })
//   win(B, f, q)                                 one window / door unit in a hole q: reveals (q.rev colour) into B.det,
//     frame (q.frame), mullions (q.cols columns, q.rows rows), glass (q.glass) into B.glass or B.lit (q.lit), sill
//     (q.sill colour); q.dep reveal depth; q.door: a solid leaf colour (no glass) up to q.leaf metres
//   fsolid(S, f, s0, s1, o0, o1, y0, y1, kind, flags = 0)   collision prism over an s / o rectangle
//   ringFaces(ring, inside) -> faces of a ring [[x, z], ...] (one per edge, zero-length edges dropped)
//   finish(root, name, B, M, shadow) -> { group, verts, tris, meshes }  one mesh per non-empty builder B[k] with
//     material M[k]; builders named in `shadow` cast shadows
import * as THREE from 'three';

export const UP = Object.freeze([0, 1, 0]), DN = Object.freeze([0, -1, 0]);
export const neg = ([a, b, c]) => [-a, -b, -c];

export function edgeFace([ax, az], [bx, bz], inside, extra = {}) {
  const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
  const flip = inside((ax + bx) / 2 + uz * 0.3, (az + bz) / 2 - ux * 0.3) ? -1 : 1, nx = flip * uz, nz = -flip * ux;
  return { ax, az, ux, uz, nx, nz, L, N: [nx, 0, nz], U: [ux, 0, uz], holes: [], ...extra };
}
export const at = (f, s, y, o = 0) => [f.ax + f.ux * s + f.nx * o, y, f.az + f.uz * s + f.nz * o];
export const ringFaces = (ring, inside) => ring.map((p, i) => [p, ring[(i + 1) % ring.length]])
  .filter(([p, q]) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.05).map(([p, q]) => edgeFace(p, q, inside));

// winding: the sign of det[n, b - a, d - a] says whether a b c d runs counter-clockwise seen from along n
const det3 = (n, a, b, d) => {
  const [p, q, r] = [0, 1, 2].map((i) => b[i] - a[i]), [u, v, w] = [0, 1, 2].map((i) => d[i] - a[i]);
  return n[0] * (q * w - r * v) - n[1] * (p * w - r * u) + n[2] * (p * v - q * u);
};
export function quad(D, a, b, c, d, n, uv) {
  const id = [a, b, c, d].map((p, k) => D.vert(...p, ...n, ...(uv ? uv[k] : [0, 0])));
  if (det3(n, a, b, d) < 0) id.reverse().unshift(id.pop());
  D.quad(...id);
}
const uvr = (u0, u1, v0, v1, m) => (m ? [[u0 / m[0], v0 / m[1]], [u1 / m[0], v0 / m[1]], [u1 / m[0], v1 / m[1]], [u0 / m[0], v1 / m[1]]] : undefined);

export function rect(D, f, s0, s1, y0, y1, o = 0, uvM, vo = 0) {
  quad(D, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), f.N, uvr(s0, s1, y0 - vo, y1 - vo, uvM));
}
export function fbox(D, f, s0, s1, y0, y1, o0, o1, m = 63, uvM) {
  const P = (s, y, o) => at(f, s, y, o);
  if (m & 1) quad(D, P(s0, y0, o1), P(s1, y0, o1), P(s1, y1, o1), P(s0, y1, o1), f.N, uvr(s0, s1, y0, y1, uvM));
  if (m & 2) quad(D, P(s0, y0, o0), P(s1, y0, o0), P(s1, y1, o0), P(s0, y1, o0), neg(f.N), uvr(s0, s1, y0, y1, uvM));
  if (m & 4) quad(D, P(s0, y0, o0), P(s0, y0, o1), P(s0, y1, o1), P(s0, y1, o0), neg(f.U), uvr(o0, o1, y0, y1, uvM));
  if (m & 8) quad(D, P(s1, y0, o0), P(s1, y0, o1), P(s1, y1, o1), P(s1, y1, o0), f.U, uvr(o0, o1, y0, y1, uvM));
  if (m & 16) quad(D, P(s0, y1, o0), P(s1, y1, o0), P(s1, y1, o1), P(s0, y1, o1), UP, uvr(s0, s1, o0, o1, uvM));
  if (m & 32) quad(D, P(s0, y0, o0), P(s1, y0, o0), P(s1, y0, o1), P(s0, y0, o1), DN, uvr(s0, s1, o0, o1, uvM));
}

// the wall minus its holes: cut into horizontal strips at every hole edge, each strip into the free s-spans
export function wall(D, f, y0, y1, uvM, o = 0, vo = 0) {
  const cutsY = new Set([y0, y1]);
  for (const h of f.holes) for (const y of [h.y0, h.y1]) if (y > y0 && y < y1) cutsY.add(y);
  const ys = Float64Array.from(cutsY).sort();
  for (let i = 1; i < ys.length; i++) {
    const ya = ys[i - 1], yb = ys[i];
    const cuts = f.holes.filter((h) => h.y0 < yb - 1e-3 && h.y1 > ya + 1e-3).map((h) => [h.s0, h.s1]).sort((p, q) => p[0] - q[0]);
    let s = 0;
    for (const [a, b] of [...cuts, [f.L, f.L]]) {
      if (a > s + 1e-3) rect(D, f, s, Math.min(a, f.L), ya, yb, o, uvM, vo);
      s = Math.max(s, b);
    }
  }
}

export function win(B, f, q) {
  const D = B.det, { s0, s1, y0, y1 } = q, dep = q.dep ?? 0.2, back = -dep, t = q.ft ?? 0.07, fo = back + 0.06;
  D.setColor(q.rev ?? '#cfc9bd');
  quad(D, at(f, s0, y0), at(f, s0, y0, back), at(f, s0, y1, back), at(f, s0, y1), f.U);
  quad(D, at(f, s1, y0), at(f, s1, y0, back), at(f, s1, y1, back), at(f, s1, y1), neg(f.U));
  quad(D, at(f, s0, y1), at(f, s1, y1), at(f, s1, y1, back), at(f, s0, y1, back), DN);
  quad(D, at(f, s0, y0), at(f, s1, y0), at(f, s1, y0, back), at(f, s0, y0, back), UP);
  if (q.door) { D.setColor(q.door); rect(D, f, s0, s1, y0, Math.min(y1, y0 + (q.leaf ?? y1 - y0)), back + 0.02); if (!q.leaf) return; }
  const gy0 = q.door ? y0 + q.leaf : y0;
  D.setColor(q.frame ?? '#ecebe6');
  fbox(D, f, s0, s1, y1 - t, y1, back, fo, 1 | 32);
  fbox(D, f, s0, s1, gy0, gy0 + t, back, fo, 1 | 16);
  fbox(D, f, s0, s0 + t, gy0 + t, y1 - t, back, fo, 1 | 8);
  fbox(D, f, s1 - t, s1, gy0 + t, y1 - t, back, fo, 1 | 4);
  const nc = q.cols ?? 1, nr = q.rows ?? 1, w = s1 - s0, h = y1 - gy0;
  for (let i = 1; i < nc; i++) { const m = s0 + w * i / nc; fbox(D, f, m - t / 2, m + t / 2, gy0 + t, y1 - t, back, fo, 1); }
  for (let j = 1; j < nr; j++) { const m = gy0 + h * (q.rowAt?.[j - 1] ?? j / nr); fbox(D, f, s0 + t, s1 - t, m - t / 2, m + t / 2, back, fo, 1); }
  const G = q.lit ? B.lit : B.glass;
  G.setColor(q.glass ?? '#4d565c'); rect(G, f, s0 + t, s1 - t, gy0 + t, y1 - t, back + 0.02);
  if (q.sill) { D.setColor(q.sill); fbox(D, f, s0 - 0.04, s1 + 0.04, y0 - 0.05, y0, back, 0.06, 1 | 4 | 8 | 16); }
}

export function fsolid(S, f, s0, s1, o0, o1, y0, y1, kind, flags = 0) {
  const flat = [];
  for (const [s, o] of [[s0, o0], [s1, o0], [s1, o1], [s0, o1]]) { const [x, , z] = at(f, s, 0, o); flat.push(x, z); }
  return S.prism(flat, y0, y1, 0, 0, kind, flags); // the prism takes either winding
}

export function finish(root, name, B, M, shadow) {
  const st = { group: new THREE.Group(), verts: 0, tris: 0, meshes: 0 };
  st.group.name = name;
  for (const k of Object.keys(B).filter((k) => B[k].v > 0)) {
    const geo = B[k].build(), mesh = new THREE.Mesh(geo, M[k]);
    st.verts += B[k].v; st.tris += (geo.index?.count ?? geo.attributes.position.count) / 3; st.meshes += 1;
    Object.assign(mesh, { name: name + '-' + k, castShadow: shadow.includes(k), receiveShadow: true });
    st.group.add(mesh);
  }
  root.add(st.group);
  return st;
}
