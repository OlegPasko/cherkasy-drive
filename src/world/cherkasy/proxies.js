// Far stand-ins for the hand-built buildings on the lower graphics levels. A hand-built block is 4-11 meshes and up
// to ~95k vertices, and farcull.js never drops it (its walls are big for any distance), so in the centre the sites
// are about half of a frame's draw calls. Here every site that holds a building of places.js gets a plain OSM-style
// box per footprint – the city generator's facade (lit windows, the same haze), its height and wall colour taken from
// the model – and beyond `near` metres the site is hidden and its boxes drawn instead. The boxes of a 512 m cell are
// merged into one facade + one roof mesh while no site of the cell is near; then that cell's far sites draw their own.
// Only the picture changes: colliders, maps, missions and the sites' update() stay as they are.
//
//   createSiteProxies({ parent, roots, places, map, skip, heightAt, facadeMat, detailMat }) -> proxies
//     roots: the sites' top-level Object3Ds (left alone: a root wider than 400 m – parks, the embankment, the station –,
//       the moving ones, and those whose silhouette is the point at any distance – KEEP: the landmarks' towers and
//       domes, the churches, the monuments, the New Year tree, the park under Zamkova hora); places: world.places (rings + ringIds); skip: the OSM ids the sites replace (an OSM
//       ring a site only decorates keeps its city building, so it gets no box)
//     proxies.set(near)     metres; Infinity (the default, 'high') = every site draws itself. The first finite call
//                           starts the boxes, built ~4 ms a frame by update(); the sites draw themselves meanwhile.
//     proxies.update(camPos)   builds on, then re-checks after the camera moved 4 m
//     proxies.flush()       finishes the build at once (tests, scripted checks)
//     proxies.stats() -> { sites, boxes, near, swapped, meshes, ms (the build), worst: [ms, step] (its longest slice) }; proxies.names() -> the swapped sites' root names
import * as THREE from 'three';
import { buildBuildings, inRing } from '../buildings.js';
import { mergeGeometries } from '../../kit/batch.js';

const WIDE = 400, CELL = 512, HYST = 1.15, KEEP = /^(landmark-|balloon|plane|yacht|yalynka$|zamkovapark$|andriy$|lotus$|kobzar$)/, STUCCO = 0.55;

export function createSiteProxies({ parent, roots, places, map, skip, heightAt, facadeMat, detailMat }) {
  let near = Infinity, built = null, lx = Infinity, ly = 0, lz = 0;
  const box = new THREE.Box3(), tmp = new THREE.Box3(), sph = new THREE.Sphere();

  let ms = 0, job = null, worst = [0, ''];
  // built in slices of a few ms a frame (update), so the first lower-level frame or the load does not wait for it
  function* build() {
    const osm = new Map((map.buildings || []).map((b) => [b.id, b]));
    // each place's boxable rings go to the smallest root that contains them
    const cand = [];
    for (const o of roots) {
      if (!o || KEEP.test(o.name)) continue;
      o.updateMatrixWorld(true);
      // bounds from the meshes' spheres (farcull.js computed them already): no pass over the vertices here
      box.makeEmpty();
      o.traverse((m) => {
        const g = m.geometry;
        if (!g || !(m.isMesh || m.isLine || m.isPoints)) return;
        if (m.isInstancedMesh) { if (!m.boundingSphere) m.computeBoundingSphere(); sph.copy(m.boundingSphere); }
        else { if (!g.boundingSphere) g.computeBoundingSphere(); sph.copy(g.boundingSphere); }
        sph.applyMatrix4(m.matrixWorld);
        if (Number.isFinite(sph.radius)) box.union(sph.getBoundingBox(tmp));
      });
      if (box.isEmpty()) continue;
      const w = box.max.x - box.min.x, d = box.max.z - box.min.z;
      if (w > WIDE || d > WIDE) continue;
      cand.push({ o, b: box.clone(), area: w * d, rings: [], kind: 'apt' });
      yield 'bounds ' + o.name;
    }
    for (const q of places) {
      q.rings?.forEach((p, i) => {
        const id = q.ringIds?.[i];
        if (id != null && !skip.has(id)) return; // an OSM building the city still draws
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (let k = 0; k < p.length; k += 2) { x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]); z0 = Math.min(z0, p[k + 1]); z1 = Math.max(z1, p[k + 1]); }
        let best = null;
        for (const c of cand) {
          const { min, max } = c.b;
          if (x0 < min.x - 10 || x1 > max.x + 10 || z0 < min.z - 10 || z1 > max.z + 10) continue;
          if (!best || c.area < best.area) best = c;
        }
        if (!best) return;
        const pts = []; for (let k = 0; k < p.length; k += 2) pts.push([p[k], p[k + 1]]);
        best.rings.push({ p, pts, id, x0, z0, x1, z1, ys: [], col: [0, 0, 0, 0] });
        if (q.kind === 'sight') best.kind = 'public';
      });
    }
    const sites = cand.filter((c) => c.rings.length);
    const v = new THREE.Vector3(), w = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    // a wall's triangles lie on the footprint's edge: inside, or within 1.5 m of it
    const ringAt = (s, x, z) => s.rings.find((R) => x >= R.x0 - 1.5 && x <= R.x1 + 1.5 && z >= R.z0 - 1.5 && z <= R.z1 + 1.5 && (inRing(R.pts, x, z) || nearEdge(R.pts, x, z, 1.5)));
    for (const s of sites) {
      const list = [];
      s.o.traverse((m) => { if (m.isMesh && !m.isInstancedMesh && m.visible) list.push(m); });
      for (const m of list) {
        const G = m.geometry, pos = G?.attributes?.position;
        if (!pos?.array?.length) continue;
        // walls only (upright triangles over a footprint), area-weighted: their tops give the height (where 97 % of the
        // wall area ends, so a crane or a spire does not count) and – glass, glow and see-through surfaces aside – the
        // colour: material colour x vertex colour x the texel under the triangle's centre
        const mat = Array.isArray(m.material) ? m.material[0] : m.material;
        const paint = mat?.color && !mat.transparent && !mat.emissiveMap && (mat.metalness ?? 0) <= 0.5 && (mat.roughness ?? 1) >= 0.25;
        const uv = G.attributes.uv, vc = paint && mat.vertexColors ? G.attributes.color : null, img = paint && mat.map ? texels(mat.map) : null;
        if (img) mat.map.updateMatrix();
        const idx = G.index, n = (idx ? idx.count : pos.count) / 3, tstep = Math.max(1, Math.floor(n / 1500));
        for (let t = 0; t < n; t += tstep) {
          const I = [0, 1, 2].map((k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k));
          for (let k = 0; k < 3; k++) w[k].fromBufferAttribute(pos, I[k]).applyMatrix4(m.matrixWorld);
          e1.subVectors(w[1], w[0]); e2.subVectors(w[2], w[0]); e1.cross(e2);
          const area = e1.length();
          if (!(area > 1e-4) || Math.abs(e1.y) > 0.4 * area) continue; // floors, roofs, the yard
          const R = ringAt(s, (w[0].x + w[1].x + w[2].x) / 3, (w[0].z + w[1].z + w[2].z) / 3);
          if (!R) continue;
          R.ys.push([Math.max(w[0].y, w[1].y, w[2].y), area]);
          if (!paint) continue;
          let cr = mat.color.r, cg = mat.color.g, cb = mat.color.b;
          if (vc) { cr *= vc.getX(I[0]); cg *= vc.getY(I[0]); cb *= vc.getZ(I[0]); }
          if (img && uv) {
            v.set((uv.getX(I[0]) + uv.getX(I[1]) + uv.getX(I[2])) / 3, (uv.getY(I[0]) + uv.getY(I[1]) + uv.getY(I[2])) / 3, 1).applyMatrix3(mat.map.matrix);
            const T = img(v.x, v.y); cr *= T[0]; cg *= T[1]; cb *= T[2];
          }
          R.col[0] += cr * area; R.col[1] += cg * area; R.col[2] += cb * area; R.col[3] += area;
        }
        yield 'walls ' + m.name;
      }
    }
    // the city generator, one record per footprint, no facade kit, no collision
    const none = () => {};
    const meshes = [], cells = new Map();
    for (const s of sites) {
      const list = [];
      s.box = new THREE.Box3(); // the boxes' own bounds: the distance the swap goes by
      for (const R of s.rings) {
        let base = Infinity;
        for (const [x, z] of R.pts) base = Math.min(base, heightAt(x, z));
        const ys = R.ys.sort((p, q) => p[0] - q[0]), all = ys.reduce((n, y) => n + y[1], 0);
        let top = box.copy(s.b).max.y;
        for (let k = 0, acc = 0; k < ys.length; k++) if ((acc += ys[k][1]) >= 0.97 * all) { top = ys[k][0]; break; }
        const h = top - base;
        if (!(h > 2.5)) continue;
        const ob = R.id != null ? osm.get(R.id) : null;
        // the wall colour as the facade's stucco tint (the layer's albedo is ~STUCCO, tint 0..2)
        const c = R.col, tint = c[3] > 1 ? [0, 1, 2].map((k) => Math.min(2, c[k] / c[3] / STUCCO)) : null;
        s.box.union(tmp.set(v.set(R.x0, base, R.z0), w[0].set(R.x1, top, R.z1)));
        list.push({ id: R.id ?? -1 - list.length, p: R.p, k: ob?.k ?? s.kind, lv: Math.max(1, Math.round((h - 1.5) / 3)), h, rs: ob?.rs, rc: ob?.rc, bc: ob?.bc, tint });
      }
      if (!list.length) continue;
      const res = buildBuildings({ map: { buildings: list }, solids: none, zips: none, heightAt });
      const t = [...res.tiles.values()];
      s.fac = mergeGeometries(t.map((x) => x.fac.build()).filter(Boolean));
      const det = t.filter((x) => x.det.v).map((x) => x.det.build({ part: true }));
      s.det = det.length ? mergeGeometries(det) : null;
      s.own = mesh(s.fac, s.det, `proxy-${s.o.name || 'site'}`);
      meshes.push(...s.own);
      const c = s.box.getCenter(v), key = `${Math.floor(c.x / CELL)},${Math.floor(c.z / CELL)}`;
      if (!cells.has(key)) cells.set(key, { sites: [], meshes: null });
      cells.get(key).sites.push(s);
      yield 'boxes ' + s.o.name;
    }
    for (const [key, c] of cells) {
      const det = c.sites.filter((s) => s.det).map((s) => s.det.clone());
      c.meshes = mesh(mergeGeometries(c.sites.map((s) => s.fac.clone())), det.length ? mergeGeometries(det) : null, `proxy-cell-${key}`);
      meshes.push(...c.meshes);
    }
    for (const m of meshes) { m.visible = false; parent.add(m); }
    built = { sites: sites.filter((s) => s.own), cells: [...cells.values()], meshes };
  }
  function mesh(fac, det, name) {
    const out = [];
    for (const [g, mat, k] of [[fac, facadeMat, 'f'], [det, detailMat, 'd']]) {
      if (!g) continue;
      g.computeBoundingSphere();
      out.push(Object.assign(new THREE.Mesh(g, mat), { name: `${name}-${k}`, castShadow: false, receiveShadow: true, matrixAutoUpdate: false }));
    }
    return out;
  }

  function apply(cam) {
    if (!built) return;
    const on = Number.isFinite(near);
    for (const s of built.sites) {
      const d = on ? s.box.distanceToPoint(cam) : 0;
      const real = !on || (s.real ? d < near * HYST : d < near);
      s.real = real;
      if (s.o.visible !== real) s.o.visible = real;
    }
    for (const c of built.cells) {
      const merged = on && c.sites.every((s) => !s.real);
      for (const m of c.meshes) m.visible = merged;
      for (const s of c.sites) for (const m of s.own) m.visible = on && !merged && !s.real;
    }
  }

  function run(budget) {
    const t0 = performance.now();
    for (let a = t0; job && a - t0 < budget;) {
      const r = job.next(), b = performance.now();
      if (r.value) worst = [Math.max(worst[0], b - a), b - a >= worst[0] ? r.value : worst[1]];
      if (r.done) { job = null; lx = Infinity; }
      a = b;
    }
    ms += performance.now() - t0;
  }

  return {
    flush() { run(Infinity); },
    set(m = Infinity) {
      near = m;
      if (Number.isFinite(near) && !built && !job) job = build();
      lx = Infinity;
    },
    update(cam) {
      if (job) { run(4); if (job) return; }
      if (!cam || !built || (cam.x - lx) ** 2 + (cam.y - ly) ** 2 + (cam.z - lz) ** 2 < 16) return;
      lx = cam.x; ly = cam.y; lz = cam.z;
      apply(cam);
    },
    names: () => built?.sites.map((s) => s.o.name) ?? [],
    stats: () => ({ sites: built?.sites.length ?? 0, boxes: built?.sites.reduce((n, s) => n + s.rings.length, 0) ?? 0, near,
      swapped: built?.sites.filter((s) => !s.real).length ?? 0, meshes: built?.meshes.length ?? 0, ms: Math.round(ms), worst: [+worst[0].toFixed(1), worst[1]] }),
  };
}

const nearEdge = (P, x, z, d) => P.some((p, i) => {
  const q = P[(i + 1) % P.length], ex = q[0] - p[0], ez = q[1] - p[1], L = ex * ex + ez * ez;
  const t = L ? Math.max(0, Math.min(1, ((x - p[0]) * ex + (z - p[1]) * ez) / L)) : 0;
  return Math.hypot(x - p[0] - t * ex, z - p[1] - t * ez) < d;
});

// a texture as a lookup (u, v) -> linear [r, g, b], from a 128 px copy read once; null when it cannot be read
const TEXELS = new WeakMap();
function texels(tex) {
  const img = tex?.image;
  if (!img || typeof document === 'undefined') return null;
  if (TEXELS.has(img)) return TEXELS.get(img);
  let f = null;
  try {
    const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, N, N);
    const d = x.getImageData(0, 0, N, N).data, srgb = tex.colorSpace === THREE.SRGBColorSpace;
    const lin = (u) => { u /= 255; return srgb ? (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4) : u; };
    const L = new Float32Array(N * N * 3);
    for (let i = 0; i < N * N; i++) for (let k = 0; k < 3; k++) L[i * 3 + k] = lin(d[i * 4 + k]);
    const fr = (u) => u - Math.floor(u), out = [0, 0, 0];
    f = (u, v) => {
      const i = Math.min(N - 1, Math.floor(fr(u) * N)), j = Math.min(N - 1, Math.floor((tex.flipY ? 1 - fr(v) : fr(v)) * N)), o = (j * N + i) * 3;
      out[0] = L[o]; out[1] = L[o + 1]; out[2] = L[o + 2]; return out;
    };
  } catch { /* not drawable (a data texture, tainted) */ }
  TEXELS.set(img, f);
  return f;
}
