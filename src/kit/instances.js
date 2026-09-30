// Instanced pools with distance LOD: items live in flat typed arrays; every LOD level is one InstancedMesh that is
// refilled with the items in its distance band when the camera has moved far enough (or on a forced refresh).
//
// Exports
//   createInstancePool({ lods, capacity = 1024, name = 'pool', castShadow = true, receiveShadow = true,
//                        colors = false, moveRefresh = 8 }) -> pool
//     lods: [{ geometry, material, dist }] nearest first; an item is drawn by the first level with distance < dist,
//           and hidden beyond the last level's dist. Levels may share a material.
//     pool.group                     THREE.Group holding the level meshes (add it to the scene)
//     pool.add(x, y, z, ry = 0, s = 1, color?) -> id     color: THREE.Color | [r,g,b] linear (needs colors: true)
//     pool.set(id, x, y, z, ry, s)   move / rescale an item     pool.setColor(id, color)
//     pool.hide(id, hidden = true)   pool.remove(id) (id reused by the next add)
//     pool.update(camera | Vector3)  re-bins when the camera moved > moveRefresh m or something changed
//     pool.refresh()                 force the next update to re-bin (e.g. after bulk edits or a teleport)
//     pool.count (live items), pool.drawn -> per-level drawn counts, pool.dispose()
import * as THREE from 'three';

export function createInstancePool({ lods, capacity = 1024, name = 'pool', castShadow = true, receiveShadow = true, colors = false, moveRefresh = 8 } = {}) {
  let cap = capacity, n = 0, live = 0;
  let X = new Float32Array(cap * 5), COL = colors ? new Float32Array(cap * 3) : null, flags = new Uint8Array(cap); // x y z ry s; flags: 1 live, 2 hidden
  const free = [];
  const group = new THREE.Group(); group.name = name;
  const levels = lods.map((l) => ({ ...l, dist2: l.dist * l.dist, mesh: null, cap: 0 }));
  let dirty = true;
  const last = new THREE.Vector3(Infinity, 0, 0), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const drawn = levels.map(() => 0);

  function ensureMesh(L, need) {
    if (L.mesh && L.cap >= need) return;
    const c = Math.max(64, Math.ceil(need * 1.5));
    if (L.mesh) { group.remove(L.mesh); L.mesh.dispose(); }
    L.mesh = new THREE.InstancedMesh(L.geometry, L.material, c);
    L.mesh.name = `${name}-lod${levels.indexOf(L)}`;
    L.mesh.castShadow = castShadow; L.mesh.receiveShadow = receiveShadow;
    L.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (colors) L.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(c * 3), 3);
    L.mesh.count = 0; L.cap = c;
    group.add(L.mesh);
  }
  function grow() {
    cap *= 2;
    const nx = new Float32Array(cap * 5); nx.set(X); X = nx;
    const nf = new Uint8Array(cap); nf.set(flags); flags = nf;
    if (COL) { const nc = new Float32Array(cap * 3); nc.set(COL); COL = nc; }
  }
  const setCol = (id, c) => { if (!COL || !c) return; if (Array.isArray(c)) COL.set(c, id * 3); else { COL[id * 3] = c.r; COL[id * 3 + 1] = c.g; COL[id * 3 + 2] = c.b; } };

  const pool = {
    group, drawn,
    get count() { return live; },
    add(x, y, z, ry = 0, s = 1, c = null) {
      let id = free.length ? free.pop() : n++;
      if (id >= cap) grow();
      X.set([x, y, z, ry, s], id * 5); flags[id] = 1; setCol(id, c ?? [1, 1, 1]);
      live++; dirty = true;
      return id;
    },
    set(id, x, y, z, ry = X[id * 5 + 3], s = X[id * 5 + 4]) { X.set([x, y, z, ry, s], id * 5); dirty = true; },
    setColor(id, c) { setCol(id, c); dirty = true; },
    hide(id, hidden = true) { if (hidden) flags[id] |= 2; else flags[id] &= ~2; dirty = true; },
    remove(id) { if (!(flags[id] & 1)) return; flags[id] = 0; free.push(id); live--; dirty = true; },
    refresh() { dirty = true; },
    update(cam) {
      const p = cam.isVector3 ? cam : cam.position;
      if (!dirty && p.distanceToSquared(last) < moveRefresh * moveRefresh) return false;
      last.copy(p); dirty = false;
      const cnt = levels.map(() => 0), pick = new Int8Array(n);
      for (let id = 0; id < n; id++) {
        if (flags[id] !== 1) { pick[id] = -1; continue; }
        const dx = X[id * 5] - p.x, dy = X[id * 5 + 1] - p.y, dz = X[id * 5 + 2] - p.z, d2 = dx * dx + dy * dy + dz * dz;
        let l = -1; for (let k = 0; k < levels.length; k++) if (d2 < levels[k].dist2) { l = k; break; }
        pick[id] = l; if (l >= 0) cnt[l]++;
      }
      levels.forEach((L, k) => ensureMesh(L, cnt[k]));
      const fill = levels.map(() => 0);
      for (let id = 0; id < n; id++) {
        const l = pick[id]; if (l < 0) continue;
        const L = levels[l], j = fill[l]++, o = id * 5;
        q.setFromAxisAngle(up, X[o + 3]); v.set(X[o], X[o + 1], X[o + 2]); sc.setScalar(X[o + 4]);
        L.mesh.setMatrixAt(j, m4.compose(v, q, sc));
        if (COL) L.mesh.setColorAt(j, col.setRGB(COL[id * 3], COL[id * 3 + 1], COL[id * 3 + 2]));
      }
      levels.forEach((L, k) => {
        const m = L.mesh; m.count = fill[k]; drawn[k] = fill[k];
        m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.visible = fill[k] > 0;
        if (fill[k]) m.computeBoundingSphere(); // keeps per-level frustum culling correct
      });
      return true;
    },
    dispose() { for (const L of levels) if (L.mesh) { group.remove(L.mesh); L.mesh.dispose(); } },
  };
  return pool;
}
