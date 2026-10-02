// Draw-distance cull for the hand-built sites (landmarks, hero buildings, monuments: ~800 meshes, about half of a
// frame's draw calls in the centre, drawn at any distance). On the lower graphics levels a mesh too small to read at its
// distance leaves the picture, and a far one stops casting a shadow; at 'high' nothing changes.
//
//   createFarCull(roots) -> cull      roots: Object3D[] whose meshes (Mesh / InstancedMesh / Line / Points) it manages
//     cull.set({ ratio = 0, shadow = Infinity })   ratio: a mesh whose bounding-sphere radius is under ratio x its
//       distance (camera to the sphere's surface) is not drawn (0 = all drawn); shadow: no shadow cast beyond that
//       distance (m). Takes effect on the next update.
//     cull.update(camPos)   re-checks after the camera moved 8 m, or every 0.5 s (moving sites: the balloon)
//     cull.stats() -> { meshes, hidden, noShadow }
// Hidden means layer 0 off (the main, shadow and river-mirror cameras all draw layer 0), so a site that toggles its own
// meshes' `visible` or `castShadow` is not overridden: castShadow is only ever turned off where the site had it on,
// and given back as it was. Skipped: meshes with frustumCulled off (meant to draw always), skinned meshes and
// instanced meshes with per-frame instance updates (their bounds move).
import { Sphere, StaticDrawUsage, Vector3 } from 'three';

export function createFarCull(roots) {
  const items = [];
  for (const r of roots) r?.traverse?.((o) => {
    if (!(o.isMesh || o.isLine || o.isPoints) || o.isSkinnedMesh || o.frustumCulled === false) return;
    if (o.isInstancedMesh && o.instanceMatrix.usage !== StaticDrawUsage) return;
    items.push({ o, cast: o.castShadow, hidden: false, mute: false });
  });
  const cfg = { ratio: 0, shadow: Infinity }, last = new Vector3(1e9, 0, 0), sph = new Sphere();
  let clock = 0, dirty = true, hidden = 0, mute = 0;

  const bounds = (o) => {
    if (o.isInstancedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); return sph.copy(o.boundingSphere).applyMatrix4(o.matrixWorld); }
    const g = o.geometry; if (!g) return null;
    if (!g.boundingSphere) g.computeBoundingSphere();
    return sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
  };

  function update(cam) {
    if (!cam) return;
    clock++;
    if (!dirty && cam.distanceToSquared(last) < 64 && clock < 30) return;
    if (!dirty && !cfg.ratio && cfg.shadow === Infinity && !hidden && !mute) { last.copy(cam); clock = 0; return; } // 'high': idle
    dirty = false; last.copy(cam); clock = 0; hidden = 0; mute = 0;
    for (const it of items) {
      const o = it.o, s = bounds(o);
      if (!s || !Number.isFinite(s.radius)) continue;
      const d = Math.max(0, cam.distanceTo(s.center) - s.radius);
      const hide = cfg.ratio > 0 && s.radius < cfg.ratio * d;
      if (hide !== it.hidden) { it.hidden = hide; if (hide) o.layers.disable(0); else o.layers.enable(0); }
      // the site's own castShadow is respected: remember it while muted, give it back after
      const m = d > cfg.shadow;
      if (m !== it.mute) { if (m) { it.cast = o.castShadow; o.castShadow = false; } else o.castShadow = it.cast; it.mute = m; }
      hidden += hide; mute += m && it.cast;
    }
  }

  return {
    update,
    set({ ratio = 0, shadow = Infinity } = {}) { cfg.ratio = ratio; cfg.shadow = shadow; dirty = true; },
    stats: () => ({ meshes: items.length, hidden, noShadow: mute }),
  };
}
