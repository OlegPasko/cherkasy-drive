// OWNER: cherkasy. Smooth-surface builder for sculpture (the Vitchyzna-Maty statue, wire fish, bowls): indexed
// geometry with shared vertices, normals from three's computeVertexNormals (soft folds instead of MB's flat facets).
//   const s = new SG(); s.loft(rings, { closed: true }); s.ellipsoid(c, r); s.tube(path, radii); s.build(matrix?)
// rings: [[ [x,y,z], ... ], ...] each ring the same point count, consecutive rings joined (closed loops by default).
//   s.lathe(cx, cz, prof [[r, y], ...], seg = 24, loftOptions)   surface of revolution about the vertical through (cx, cz)
//   canvasTex(w, h, draw(ctx2d, w, h), { repeat = true, srgb = true, aniso = 8 }) -> THREE.CanvasTexture
//   decal(material, level = -material.polygonOffsetFactor | 1) -> material  ground-hugging overlay bias that works with
//     the game's reversed float depth buffer (render/renderer.js decalBias; the legacy negative polygonOffsetUnits would
//     push the overlay behind the ground there). The shader part only compiles under USE_REVERSED_DEPTH_BUFFER.
import * as THREE from 'three';
import { decalBias } from '../../render/renderer.js';

const TAU = Math.PI * 2;
// n points around a horizontal circle, clockwise seen from above (angle runs negative)
const ringAround = (n, fn) => Array.from({ length: n }, (_, k) => { const a = (-k / n) * TAU; return fn(Math.cos(a), Math.sin(a)); });

export class SG {
  constructor() { this.xyz = []; this.tri = []; }
  get v() { return this.xyz.length / 3; } // vertices so far
  pt(x, y, z) { const id = this.v; this.xyz.push(x, y, z); return id; }
  // two triangles of the quad a-b-c-d, reversed when flip
  _quad(a, b, c, d, flip) { this.tri.push(a, flip ? c : b, flip ? b : c, a, flip ? d : c, flip ? c : d); }
  // fan the ring `row` (vertex ids) to the mean of its points; `up` picks the facing
  _fan(row, pts, up, flip) {
    const n = pts.length, m = [0, 0, 0];
    for (const q of pts) { m[0] += q[0]; m[1] += q[1]; m[2] += q[2]; }
    const mid = this.pt(m[0] / n, m[1] / n, m[2] / n), same = up !== flip;
    row.forEach((a, k) => { const b = row[(k + 1) % n]; this.tri.push(mid, same ? a : b, same ? b : a); });
  }
  // join consecutive rings; cap0 / cap1: fan the first / last ring to its centroid
  loft(rings, { closed = true, cap0 = false, cap1 = false, flip = false } = {}) {
    const n = rings[0].length, span = closed ? n : n - 1;
    const ids = [];
    for (const ring of rings) ids.push(ring.map(([x, y, z]) => this.pt(x, y, z)));
    ids.forEach((lo, j) => {
      const hi = ids[j + 1]; if (!hi) return;
      for (let k = 0; k < span; k++) { const k1 = (k + 1) % n; this._quad(lo[k], lo[k1], hi[k1], hi[k], flip); }
    });
    if (cap0) this._fan(ids[0], rings[0], false, flip);
    if (cap1) this._fan(ids[ids.length - 1], rings[rings.length - 1], true, flip);
    return this;
  }
  // ellipsoid at c with radii r = [rx, ry, rz]: rows-1 latitude rings + two pole vertices
  ellipsoid(c, r, seg = 16, rows = 10) {
    const [cx, cy, cz] = c, [rx, ry, rz] = r, rings = [];
    for (let j = 1; j < rows; j++) {
      const lat = (j / rows - 0.5) * Math.PI, h = Math.sin(lat) * ry, w = Math.cos(lat);
      rings.push(ringAround(seg, (cs, sn) => [cx + cs * w * rx, cy + h, cz + sn * w * rz]));
    }
    const south = this.pt(cx, cy - ry, cz), north = this.pt(cx, cy + ry, cz);
    const first = this.v; this.loft(rings);
    const last = first + (rows - 2) * seg;
    for (let k = seg - 1, k1 = 0; k1 < seg; k = k1++) this.tri.push(south, first + k1, first + k, north, last + k, last + k1);
    return this;
  }
  // tube along a polyline with per-point radii (number or [r, sag]: sag stretches the section downward, draped cloth);
  // section frames by parallel transport, capped ends
  tube(path, radii, seg = 10, { caps = true } = {}) {
    const P = path.map(([x, y, z]) => new THREE.Vector3(x, y, z)), last = P.length - 1;
    const [tan, bin, q] = [0, 1, 2].map(() => new THREE.Vector3());
    let nrm = null;
    const rings = P.map((p, i) => {
      tan.subVectors(P[Math.min(last, i + 1)], P[Math.max(0, i - 1)]).normalize();
      if (nrm) nrm.addScaledVector(tan, -nrm.dot(tan)).normalize();
      else { nrm = new THREE.Vector3(tan.z, 0, -tan.x); if (nrm.lengthSq() < 1e-6) nrm.set(1, 0, 0); nrm.normalize(); } // up x tan
      bin.crossVectors(tan, nrm).normalize();
      const spec = radii[i], rad = Array.isArray(spec) ? spec[0] : spec, sag = Array.isArray(spec) ? spec[1] : 0;
      return Array.from({ length: seg }, (_, k) => {
        const u = Math.cos((k / seg) * TAU), w = Math.sin((k / seg) * TAU);
        q.copy(p).addScaledVector(nrm, u * rad).addScaledVector(bin, w * rad);
        const down = Math.max(0, -(nrm.y * u + bin.y * w)); // droop the underside
        return [q.x, q.y - sag * down * down, q.z];
      });
    });
    return this.loft(rings, { cap0: caps, cap1: caps });
  }
  // surface of revolution around (cx, cz): profile [[r, y], ...]
  lathe(cx, cz, prof, seg = 24, o = {}) {
    return this.loft(prof.map(([r, y]) => ringAround(seg, (cs, sn) => [cx + cs * r, y, cz + sn * r])), o);
  }
  build(m = null) {
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.xyz), 3));
    out.setIndex(new THREE.BufferAttribute(this.v > 65535 ? new Uint32Array(this.tri) : new Uint16Array(this.tri), 1));
    if (m) out.applyMatrix4(m);
    out.computeVertexNormals();
    out.computeBoundingBox();
    out.computeBoundingSphere();
    return out;
  }
}

// canvas texture helper: paint with draw(ctx, w, h) once, upload as a (repeating, sRGB) texture
export function canvasTex(w, h, draw, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = aniso;
  if (repeat) { tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; }
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const REVERSED = { state: { buffers: { depth: { getReversed: () => true } } } }; // the game renderer always reverses depth
export const decal = (mat, level = Math.max(1, -(mat.polygonOffsetFactor || 1))) => decalBias(mat, REVERSED, level);
