// Draw distances for small repeated world detail that is cut into spatial chunks (kerb faces, road paint, sleepers,
// rails, the shore's wet bands and foam): a chunk farther than its class's distance is not drawn. The detail is
// sub-pixel long before that, so nothing visible changes; what goes is its vertex load.
//
//   createDrawDistance() -> dd
//     dd.add(object, cls, sphere?)   object: Mesh / InstancedMesh / Line; cls: a class name; sphere: its world-space
//       bounding Sphere (default: the geometry's, or an instanced mesh's own, through matrixWorld – static objects only)
//     dd.set({ cls: metres, ... })   the distance per class (camera to the sphere's surface); a class that is not named
//       (or Infinity) is always drawn. Takes effect on the next update.
//     dd.update(camPos: Vector3) -> n   re-checks after the camera moved STEP m (or after set / add); a chunk comes
//       back at the distance and goes at 1.08x + 8 m, so it does not flicker on the line; n: how many changed
//     dd.stats() -> { chunks, hidden, byClass: { cls: [chunks, hidden] } }
// Hidden means `visible = false` (farcull.js hides through layers, so the two do not fight over a site's mesh).
import { Sphere, Vector3 } from 'three';

const STEP = 6;

export function createDrawDistance() {
  const items = [], dist = {}, last = new Vector3(Infinity, 0, 0);
  let dirty = true;

  function add(o, cls, sphere = null) {
    let s = sphere;
    if (!s) {
      o.updateWorldMatrix?.(true, false);
      const b = o.isInstancedMesh ? (o.boundingSphere ?? (o.computeBoundingSphere(), o.boundingSphere)) : (o.geometry.boundingSphere ?? (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere));
      s = new Sphere().copy(b).applyMatrix4(o.matrixWorld);
    }
    items.push({ o, cls, x: s.center.x, y: s.center.y, z: s.center.z, r: s.radius, hidden: false });
    dirty = true;
  }
  function update(cam) {
    if (!cam || (!dirty && cam.distanceToSquared(last) < STEP * STEP)) return 0;
    dirty = false; last.copy(cam);
    const cx = cam.x, cy = cam.y, cz = cam.z;
    let n = 0;
    for (const it of items) {
      const D = dist[it.cls] ?? Infinity;
      let hide = false;
      if (D !== Infinity) {
        const dx = it.x - cx, dy = it.y - cy, dz = it.z - cz, d = Math.sqrt(dx * dx + dy * dy + dz * dz) - it.r;
        hide = it.hidden ? d > D : d > D * 1.08 + 8;
      }
      if (hide !== it.hidden) { it.hidden = hide; it.o.visible = !hide; n++; }
    }
    return n;
  }
  return {
    add, update,
    set(d = {}) { for (const k in d) dist[k] = d[k] ?? Infinity; dirty = true; },
    stats() {
      const byClass = {};
      let hidden = 0;
      for (const it of items) { const c = byClass[it.cls] ??= [0, 0]; c[0]++; if (it.hidden) { c[1]++; hidden++; } }
      return { chunks: items.length, hidden, byClass };
    },
  };
}
