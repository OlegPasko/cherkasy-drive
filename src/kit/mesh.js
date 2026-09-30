// Static mesh kit: MeshBuilder accumulates coloured triangles (boxes, frustums, tubes, lathes, extruded polygons with
// holes, free vertices / tris / quads) into one indexed BufferGeometry; small transform + colour helpers.
//
// Exports
//   MeshBuilder (alias MB)  new MeshBuilder() – every emitter returns the builder (fluent) unless noted
//     .v / .n               vertices accumulated so far (cheap, use it to skip empty builders)
//     .setColor(c)          c: 0xRRGGBB or '#rrggbb' (sRGB, converted to linear) or [r,g,b] (already linear)
//     .setPart(p)           detail-material part id (DP in src/world/materials.js), stored per vertex
//     .setXf(m | null)      Matrix4 applied to everything emitted afterwards (replaces the current transform)
//     .with(m, fn)          fn(builder) runs with transform current * m, restored afterwards
//     .vert(x,y,z, nx,ny,nz, u=0,v=0) -> index   .tri(a,b,c)   .quad(a,b,c,d) = tris (a,b,c) + (a,c,d)
//     .face(pts, n?)        planar polygon [[x,y,z],...] fanned from pts[0], flat normal n (default: from the points),
//                           winding picked so the front side looks along n
//     .box(x0,y0,z0,x1,y1,z1, faces=63)   faces bits: 1 +x, 2 -x, 4 +y, 8 -y, 16 +z, 32 -z
//     .boxC(cx,cy,cz, sx,sy,sz)           box by centre + full sizes
//     .cyl(x,y,z, r0,r1,h, seg=12, caps=true)   frustum standing on (x,y,z): bottom radius r0, top radius r1
//     .tube(a,b, r, seg=6, caps=false)    round bar between points a,b ([x,y,z])
//     .lathe(prof, seg=12, cx=0, cz=0, sx=1, sz=1)  surface of revolution, prof [[r,y],...] bottom -> top, faces
//                           outward; sx / sz squash the section (normals stay correct)
//     .ellipsoid(c, radii, seg=12, rings=8)
//     .fill(outer, holes=[], y=0, up=true)       horizontal polygon with holes (rings [[x,z],...], any winding)
//     .extrude(outer, holes=[], y0, y1, {top=true, bottom=false, sides=true})
//     .merge(other)          appends another MeshBuilder's data (its transform is already baked)
//     .build({part=false, uv=true}) -> BufferGeometry: position, normal, color (linear), uv, [part: Uint8 per vertex];
//                           index Uint16/Uint32, bounds computed. Flat 'part' varyings read the provoking (last) vertex
//                           of each triangle: for .quad that is c and d.
//     .clear()
//   M4(x,y,z, ry=0, s=1) -> Matrix4 = translate * rotateY(ry) * uniformScale (local +x -> world (cos ry, 0, -sin ry))
//   rotX(a), rotY(a), rotZ(a) -> Matrix4
//   srgbToLinear(v), hexLin(c) -> [r,g,b] linear (c: number | '#rrggbb' | [r,g,b] sRGB 0..1)
import * as THREE from 'three';


export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export function hexLin(c) {
  if (Array.isArray(c)) return c.map(srgbToLinear);
  const n = typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c;
  return [n >> 16, n >> 8, n].map((ch) => srgbToLinear((ch & 255) / 255));
}

const UP = new THREE.Vector3(0, 1, 0);
export function M4(tx = 0, ty = 0, tz = 0, yaw = 0, k = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(tx, ty, tz), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(k, k, k));
}
export const rotX = (a) => new THREE.Matrix4().makeRotationX(a);
export const rotY = (a) => new THREE.Matrix4().makeRotationY(a);
export const rotZ = (a) => new THREE.Matrix4().makeRotationZ(a);

// growable typed array (builders keep millions of vertices; plain JS number arrays would cost 4-8x the memory)
export class Grow {
  constructor(Type, cap = 256) { this.T = Type; this.a = new Type(cap); this.n = 0; }
  need(k) {
    const want = this.n + k;
    if (want <= this.a.length) return;
    const next = new this.T(Math.max(want, this.a.length << 1));
    next.set(this.a);
    this.a = next;
  }
  push1(x) { this.need(1); this.a[this.n++] = x; }
  push3(x, y, z) { this.need(3); const a = this.a; a[this.n] = x; a[this.n + 1] = y; a[this.n + 2] = z; this.n += 3; }
  push4(x, y, z, w) { this.need(4); const a = this.a; a[this.n] = x; a[this.n + 1] = y; a[this.n + 2] = z; a[this.n + 3] = w; this.n += 4; }
  append(o) { this.need(o.n); this.a.set(o.view(), this.n); this.n += o.n; }
  view() { return this.a.subarray(0, this.n); }
  take() { return this.a.slice(0, this.n); } // exact-size copy for the GPU buffer
}

// unit circle samples, closed (first == last) so revolved rows get a clean uv seam
const circles = new Map();
function circle(seg) {
  let c = circles.get(seg);
  if (!c) { c = Array.from({ length: seg + 1 }, (_, k) => [Math.cos((k / seg) * Math.PI * 2), Math.sin((k / seg) * Math.PI * 2), k / seg]); circles.set(seg, c); }
  return c;
}
// box faces: bit, outward normal, the four corners as picks from (lo, hi) per axis
const BOX_FACES = [
  [1, [1, 0, 0], ['hlh', 'hll', 'hhl', 'hhh']], [2, [-1, 0, 0], ['lll', 'llh', 'lhh', 'lhl']],
  [4, [0, 1, 0], ['lhh', 'hhh', 'hhl', 'lhl']], [8, [0, -1, 0], ['lll', 'hll', 'hlh', 'llh']],
  [16, [0, 0, 1], ['llh', 'hlh', 'hhh', 'lhh']], [32, [0, 0, -1], ['hll', 'lll', 'lhl', 'hhl']],
];
const STRIDE = 11; // interleaved: position 3, normal 3, uv 2, colour 3
const _p = new THREE.Vector3(), _n = new THREE.Vector3();

export class MeshBuilder {
  constructor() { this.clear(); }

  clear() {
    this.buf = new Grow(Float32Array, 1024); this.parts = new Grow(Uint8Array, 128); this.tris = new Grow(Uint32Array, 512);
    this.v = 0; this.rgb = [0.7, 0.7, 0.7]; this.pid = 0; this.xf = null; this.nxf = null;
    return this;
  }
  get n() { return this.v; }

  setColor(c) { this.rgb = Array.isArray(c) ? [c[0], c[1], c[2]] : hexLin(c); return this; }
  setPart(part) { this.pid = part & 255; return this; }
  setXf(m) {
    this.xf = m ? m.clone() : null;
    this.nxf = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
    return this;
  }
  with(local, emit) {
    const saved = this.xf;
    this.setXf(saved ? saved.clone().multiply(local) : local);
    try { emit(this); } finally { this.setXf(saved); }
    return this;
  }

  vert(x, y, z, nx = 0, ny = 1, nz = 0, u = 0, v = 0) {
    _p.set(x, y, z); _n.set(nx, ny, nz);
    if (this.xf) { _p.applyMatrix4(this.xf); _n.applyMatrix3(this.nxf).normalize(); }
    const B = this.buf; B.need(STRIDE);
    const a = B.a, o = B.n, c = this.rgb;
    a[o] = _p.x; a[o + 1] = _p.y; a[o + 2] = _p.z; a[o + 3] = _n.x; a[o + 4] = _n.y; a[o + 5] = _n.z;
    a[o + 6] = u; a[o + 7] = v; a[o + 8] = c[0]; a[o + 9] = c[1]; a[o + 10] = c[2];
    B.n = o + STRIDE; this.parts.push1(this.pid);
    return this.v++;
  }
  tri(a, b, c) { this.tris.push3(a, b, c); return this; }
  quad(a, b, c, d) { return this.tri(a, b, c).tri(a, c, d); }

  face(pts, n) {
    const cnt = pts.length;
    if (cnt < 3) return this;
    const nw = new THREE.Vector3(); // Newell normal of the outline
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % cnt];
      nw.x += (p[1] - q[1]) * (p[2] + q[2]); nw.y += (p[2] - q[2]) * (p[0] + q[0]); nw.z += (p[0] - q[0]) * (p[1] + q[1]);
    });
    const N = n ? new THREE.Vector3(n[0], n[1], n[2]) : nw.clone().normalize();
    const back = nw.dot(N) < 0;
    // planar uv axes: horizontal tangent (or x on flat faces) and the one across it
    const ta = Math.abs(N.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-N.z, 0, N.x).normalize();
    const tb = new THREE.Vector3().crossVectors(N, ta), o = new THREE.Vector3(...pts[0]), rel = new THREE.Vector3();
    const ids = pts.map((p) => { rel.set(p[0], p[1], p[2]).sub(o); return this.vert(p[0], p[1], p[2], N.x, N.y, N.z, rel.dot(ta), rel.dot(tb)); });
    for (let i = 2; i < cnt; i++) back ? this.tri(ids[0], ids[i], ids[i - 1]) : this.tri(ids[0], ids[i - 1], ids[i]);
    return this;
  }

  box(ax, ay, az, bx, by, bz, mask = 63) {
    const lo = [Math.min(ax, bx), Math.min(ay, by), Math.min(az, bz)], hi = [Math.max(ax, bx), Math.max(ay, by), Math.max(az, bz)];
    const pick = (s) => [0, 1, 2].map((i) => (s[i] === 'h' ? hi[i] : lo[i]));
    for (const [bit, nrm, corners] of BOX_FACES) if (mask & bit) this.face(corners.map(pick), nrm);
    return this;
  }
  boxC(x, y, z, w, h, d) {
    const hx = w * 0.5, hy = h * 0.5, hz = d * 0.5;
    return this.box(x - hx, y - hy, z - hz, x + hx, y + hy, z + hz);
  }

  // rows [{ r, y, nr, ny, v }] swept around the y axis through (cx, cz); consecutive rows become quad strips
  _revolve(rows, seg, cx, cz) {
    const ring = circle(seg);
    const grid = rows.map((q) => ring.map(([cs, sn, t]) => this.vert(cx + cs * q.r, q.y, cz + sn * q.r, cs * q.nr, q.ny, sn * q.nr, t, q.v)));
    for (let i = 1; i < grid.length; i++) {
      const lo = grid[i - 1], hi = grid[i];
      for (let k = 0; k < seg; k++) this.quad(lo[k], hi[k], hi[k + 1], lo[k + 1]);
    }
    return this;
  }
  _cap(cx, y, cz, r, seg, up) {
    const mid = this.vert(cx, y, cz, 0, up ? 1 : -1, 0, 0, 0), ring = circle(seg);
    const rim = ring.slice(0, seg).map(([cs, sn]) => this.vert(cx + cs * r, y, cz + sn * r, 0, up ? 1 : -1, 0, cs * r, sn * r));
    rim.forEach((id, k) => { const nx = rim[(k + 1) % seg]; up ? this.tri(mid, nx, id) : this.tri(mid, id, nx); });
  }

  cyl(x, y, z, r0, r1, h, seg = 12, caps = true) {
    seg = Math.max(3, seg | 0);
    const lean = (r0 - r1) / (h || 1e-6), len = Math.hypot(1, lean), nr = 1 / len, ny = lean / len;
    this._revolve([{ r: r0, y, nr, ny, v: 0 }, { r: r1, y: y + h, nr, ny, v: h }], seg, x, z);
    if (caps && r1 > 1e-4) this._cap(x, y + h, z, r1, seg, true);
    if (caps && r0 > 1e-4) this._cap(x, y, z, r0, seg, false);
    return this;
  }

  tube(p0, p1, rad, seg = 6, caps = false) {
    const axis = new THREE.Vector3().fromArray(p1).sub(_p.fromArray(p0)), len = axis.length();
    if (len < 1e-5) return this;
    axis.divideScalar(len);
    const side = Math.abs(axis.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3().crossVectors(UP, axis).normalize();
    const third = new THREE.Vector3().crossVectors(side, axis);
    const frame = new THREE.Matrix4().makeBasis(side, axis, third).setPosition(p0[0], p0[1], p0[2]);
    return this.with(frame, (s) => s.cyl(0, 0, 0, rad, rad, len, seg, caps));
  }

  lathe(prof, seg = 12, cx = 0, cz = 0, sx = 1, sz = 1) {
    if (sx !== 1 || sz !== 1) { // squashed section: revolve a unit lathe under a scale about the axis
      const m = new THREE.Matrix4().makeScale(sx, 1, sz).setPosition(cx, 0, cz);
      return this.with(m, (s) => s.lathe(prof, seg));
    }
    const last = prof.length - 1;
    const rows = prof.map(([r, y], i) => {
      const [ra, ya] = prof[Math.max(0, i - 1)], [rb, yb] = prof[Math.min(last, i + 1)];
      const tr = rb - ra, ty = yb - ya, tl = Math.hypot(tr, ty) || 1;
      return { r, y, nr: ty / tl, ny: -tr / tl, v: y };
    });
    return this._revolve(rows, seg, cx, cz);
  }

  ellipsoid(c, radii, seg = 12, rings = 8) {
    const rows = [];
    for (let i = 0; i <= rings; i++) { const lat = Math.PI * (i / rings - 0.5); rows.push({ r: Math.cos(lat), y: Math.sin(lat), nr: Math.cos(lat), ny: Math.sin(lat), v: i / rings }); }
    const m = new THREE.Matrix4().makeScale(radii[0], radii[1], radii[2]).setPosition(c[0], c[1], c[2]);
    return this.with(m, (s) => s._revolve(rows, seg, 0, 0));
  }

  fill(outer, holes = [], y = 0, up = true) {
    const T = triangulateRings(outer, holes);
    if (!T) return this;
    const first = this.v, sy = up ? 1 : -1, P = T.pts, I = T.idx;
    for (const p of P) this.vert(p[0], y, p[1], 0, sy, 0, p[0], p[1]);
    for (let t = 0; t < I.length; t += 3) {
      let i = I[t], j = I[t + 1], k = I[t + 2];
      // (P[j] - P[i]) x (P[k] - P[i]) seen from +y: positive when the triangle is clockwise in (x, z)
      const facesUp = (P[j][1] - P[i][1]) * (P[k][0] - P[i][0]) - (P[j][0] - P[i][0]) * (P[k][1] - P[i][1]) > 0;
      if (facesUp !== up) [j, k] = [k, j];
      this.tri(first + i, first + j, first + k);
    }
    return this;
  }

  extrude(outer, holes = [], y0 = 0, y1 = 1, o = {}) {
    const { top = true, bottom = false, sides = true } = o;
    if (sides) for (const ring of [orient(outer, true), ...holes.map((h) => orient(h, false))]) {
      ring.forEach((pa, i) => {
        const pb = ring[(i + 1) % ring.length], dx = pb[0] - pa[0], dz = pb[1] - pa[1], len = Math.hypot(dx, dz);
        if (len < 1e-4) return;
        // positive-area rings: (dz, -dx) points out of the solid
        this.face([[pa[0], y0, pa[1]], [pb[0], y0, pb[1]], [pb[0], y1, pb[1]], [pa[0], y1, pa[1]]], [dz / len, 0, -dx / len]);
      });
    }
    if (top) this.fill(outer, holes, y1, true);
    if (bottom) this.fill(outer, holes, y0, false);
    return this;
  }

  merge(other) {
    const shift = this.v;
    this.buf.append(other.buf); this.parts.append(other.parts);
    const src = other.tris.view();
    this.tris.need(src.length);
    for (let i = 0; i < src.length; i++) this.tris.a[this.tris.n++] = src[i] + shift;
    this.v += other.v;
    return this;
  }

  build({ part = false, uv = true } = {}) {
    const n = this.v, src = this.buf.a;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), tex = new Float32Array(n * 2), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE, k = i * 3;
      pos[k] = src[o]; pos[k + 1] = src[o + 1]; pos[k + 2] = src[o + 2];
      nor[k] = src[o + 3]; nor[k + 1] = src[o + 4]; nor[k + 2] = src[o + 5];
      tex[i * 2] = src[o + 6]; tex[i * 2 + 1] = src[o + 7];
      col[k] = src[o + 8]; col[k + 1] = src[o + 9]; col[k + 2] = src[o + 10];
    }
    const layout = [['position', pos, 3], ['normal', nor, 3], ['color', col, 3]];
    if (uv) layout.push(['uv', tex, 2]);
    if (part) layout.push(['part', this.parts.take(), 1]);
    const geo = new THREE.BufferGeometry();
    for (const [name, arr, size] of layout) geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
    geo.setIndex(new THREE.BufferAttribute(n > 65535 ? this.tris.take() : Uint16Array.from(this.tris.view()), 1));
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    return geo;
  }
}
export { MeshBuilder as MB };

// ---------------------------------------------------------------------------------------------- 2D ring helpers
// signed doubled area in the map sense (x, z): positive = the build_map "counter-clockwise" outer ring
export function ringArea2(R) {
  let s = 0;
  R.forEach((p, i) => { const q = R[(i + 1) % R.length]; s += p[0] * q[1] - q[0] * p[1]; });
  return s;
}
// outer rings positive, holes negative (so that (dz, -dx) of each edge points out of the solid)
export const orient = (R, outer) => ((ringArea2(R) > 0) === outer ? R : R.slice().reverse());

// earcut via three's ShapeUtils; returns {pts: [[x,z],...] outer then holes, idx: flat triangle list} or null
export function triangulateRings(outer, holes = []) {
  if (outer.length < 3) return null;
  const shell = orient(outer, true), gaps = holes.filter((h) => h.length >= 3).map((h) => orient(h, false));
  const v2 = (p) => new THREE.Vector2(p[0], p[1]);
  let faces;
  try { faces = THREE.ShapeUtils.triangulateShape(shell.map(v2), gaps.map((h) => h.map(v2))); } catch { return null; }
  if (!faces.length) return null;
  return { pts: shell.concat(...gaps), idx: faces.flat() };
}
