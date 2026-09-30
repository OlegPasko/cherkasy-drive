// Car mode: trees rammed at speed snap off. The trunk solid is switched off in the collision world, a jagged stump
// stays, the tree itself (its item in src/world/trees.js, all LODs follow) topples away from the hit, bounces once and
// lies on the ground; bark / wood splinters fly at the break and leaves scatter where the crown lands.
//
//   createTreeBreaker({ scene, trees, collision, trunks, debris }) -> { hit(q) -> { n, keep }, update(dt, camPos), stats() }
//     trees: buildTrees() result; collision: collision world (disable(id)); trunks: Map<tree item, solid id> of the
//     trunk cylinders registered by the city; debris: npc/gibs.js (shards) or null
//     q: the rammer's box { x, y (bottom), z, fx, fz (unit forward), hl, hw (half sizes), v: Vector3 }
//     keep: fraction of the rammer's horizontal speed kept after snapping the trees in its way
import * as THREE from 'three';
import { BARK_REF } from '../trees.js';
import { cue } from '../../audio/cue.js';

const V_BREAK = 7;                  // m/s: slower than this a trunk stays a wall
const STUMP_H = 0.6, MAX_STUMPS = 256, CELL = 16;
const WOOD = [0.62, 0.46, 0.27];

function stumpGeometry() {
  const g = new THREE.CylinderGeometry(1, 1.12, 1, 9, 1).translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.99) p.setY(i, 1 - 0.55 * ((Math.sin(i * 12.9898) * 43758.55) % 1 + 1) % 1); // jagged break
  g.computeVertexNormals();
  return g;
}

export function createTreeBreaker({ scene, trees, collision = null, trunks = null, debris = null }) {
  // trunk records in 16 m buckets
  const buckets = new Map(), bkey = (i, j) => i * 131072 + j;
  let total = 0;
  for (const it of trees.items ?? []) {
    if (it.hedge) continue;
    const t = trees.trunkOf(it);
    const k = bkey(Math.floor(t.x / CELL), Math.floor(t.z / CELL));
    (buckets.get(k) ?? buckets.set(k, []).get(k)).push({ it, r: t.r + 0.08, broken: false });
    total++;
  }
  const barkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...BARK_REF.map((c) => c * 1.3)), roughness: 0.95 });
  const stumps = new THREE.InstancedMesh(stumpGeometry(), barkMat, MAX_STUMPS);
  Object.assign(stumps, { count: 0, frustumCulled: false, castShadow: true, receiveShadow: true, name: 'tree-stumps' });
  scene.add(stumps);
  const falling = [], m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let nStump = 0, broken = 0;

  const barkOf = (it) => { const b = it.extra?.aBark; return b ? [BARK_REF[0] * b[1] * 1.3, BARK_REF[1] * b[2] * 1.3, BARK_REF[2] * b[3] * 1.3] : BARK_REF; };
  function snap(e, vx, vz, speed) {
    e.broken = true; e.it.broken = true; broken++;
    cue('tree', { x: e.it.x, y: e.it.y, z: e.it.z, speed });
    const it = e.it, y0 = it.y;
    const id = trunks?.get(it);
    if (id !== undefined && id >= 0) collision?.disable(id);
    if (nStump < MAX_STUMPS) {
      q4.setFromAxisAngle(up, Math.random() * Math.PI * 2);
      m4.compose(p3.set(it.x, y0 - 0.05, it.z), q4, s3.set(e.r * 0.95, STUMP_H + 0.05, e.r * 0.95));
      stumps.setMatrixAt(nStump++, m4); stumps.count = nStump; stumps.instanceMatrix.needsUpdate = true;
    }
    // turn the crown toward the fall direction, then tip it about local x (rx > 0 tips the top toward (sin ry, cos ry))
    const d = Math.hypot(vx, vz) || 1;
    it.ry = Math.atan2(vx / d, vz / d) + (Math.random() - 0.5) * 0.5;
    it.rz = (Math.random() - 0.5) * 0.12; it.rx = 0.02; it.y = y0 + STUMP_H;
    falling.push({ e, ang: 0.02, w: 0.35 + Math.min(1.6, speed * 0.045), rest: 1.42 + Math.random() * 0.08, bounced: false });
    const col = barkOf(it);
    debris?.shards(it.x, y0 + STUMP_H, it.z, vx * 0.35, 2.5, vz * 0.35, 14, [col, col, WOOD], 0.06, 0.45, 5, 0.35, 120);
  }
  function scatterLeaves(f) {
    const it = f.e.it, A = it.extra?.aTintA || [0.2, 0.3, 0.08], Bc = it.extra?.aTintB || A;
    const reach = (it.kind === 'small' ? 4.5 : 7) * it.s * (it.scale3?.[1] ?? 1), sx = Math.sin(it.ry), sz = Math.cos(it.ry);
    debris?.shards(it.x + sx * reach, it.y + 1, it.z + sz * reach, 0, 3, 0, 30, [A, Bc, A.map((c) => c * 0.7)], 0.1, 0.3, 6, 0.1, 150);
    debris?.shards(it.x + sx * reach * 0.4, it.y + 0.6, it.z + sz * reach * 0.4, 0, 2, 0, 6, [barkOf(it)], 0.3, 1.1, 2.5, 0.3, 150); // snapped branches
  }

  return {
    hit(q) {
      const speed = Math.hypot(q.v.x, q.v.z), reach = q.hl + q.hw + 1;
      let n = 0, keep = 1;
      if (speed < V_BREAK) return { n, keep };
      for (let i = Math.floor((q.x - reach) / CELL); i <= Math.floor((q.x + reach) / CELL); i++) {
        for (let j = Math.floor((q.z - reach) / CELL); j <= Math.floor((q.z + reach) / CELL); j++) {
          for (const e of buckets.get(bkey(i, j)) ?? []) {
            if (e.broken) continue;
            const it = e.it, dx = it.x - q.x, dz = it.z - q.z;
            const along = dx * q.fx + dz * q.fz, across = dz * q.fx - dx * q.fz;
            if (Math.abs(along) > q.hl + e.r + 0.2 || Math.abs(across) > q.hw + e.r + 0.2 || q.y > it.y + 3.5 || q.y + 2 < it.y) continue;
            // only a real impact breaks it: speed toward the trunk
            const dl = Math.hypot(dx, dz) || 1;
            if ((q.v.x * dx + q.v.z * dz) / dl < V_BREAK * 0.6) continue;
            snap(e, q.v.x, q.v.z, speed); n++;
            keep *= 1 - Math.min(0.3, 0.05 + 0.1 * it.s * (it.kind === 'small' ? 0.5 : 1));
          }
        }
      }
      return { n, keep };
    },
    update(dt) {
      for (let i = falling.length - 1; i >= 0; i--) {
        const f = falling[i];
        f.w += (2.4 * Math.sin(f.ang) + 0.3) * dt;
        f.ang += f.w * dt;
        let done = false;
        if (f.ang >= f.rest) {
          f.ang = f.rest;
          if (!f.bounced && f.w > 0.9) { f.bounced = true; f.w *= -0.22; scatterLeaves(f); }
          else { done = true; if (!f.bounced) scatterLeaves(f); }
        }
        f.e.it.rx = f.ang; // assigning a live field re-poses the tree at every LOD on the next trees.update
        if (done) falling.splice(i, 1);
      }
    },
    stats: () => ({ trees: total, broken, falling: falling.length, stumps: nStump }),
  };
}
