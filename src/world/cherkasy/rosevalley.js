// OWNER: cherkasy. Dolyna Troyand (Rose Valley, the park on the Dnipro under Zamkova hora) + the beach next to
// Fabrica. From the refs: open lawns crossed by wide curving paths, rose beds on brown mulch (red / pink / white /
// yellow), clipped shrub mounds, groups of columnar thujas and blue spruces, a wall of tall poplars along the shore,
// white-rimmed fountain basins with jet rings, the walk-through splash fountain, the sundial plaza whose gnomon is a
// forged crane with twelve forged chairs round it, lamp posts along the paths. The heath strip between Fabrica and the
// water becomes the beach: white parasols + loungers in rows facing the river, a lifeguard tower, a volleyball court.
//   prepareRoseValley(map, geo): before the ground is built (beach sand into map.cover)
//   buildRoseValley({ root, map, solids, zips, heightAt, ground, geo }) -> { update(dt, camera?), clear(x, z), spots }
//     update with the camera switches the per-cell bush / rose LODs (without it the far levels stay on)
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { PARK_PINE, PARK_GREENS } from '../trees.js';
import { SG, canvasTex, decal } from './sculpt.js';
import { rng, area2, inPoly, bboxOf, centroid, triangulate, areaOf } from './geo.js';
import { PARK, HEATH, LAWNS, BEDS, FOUNTAINS, SUNDIAL, PEDFOUNTAIN, SHINGLE } from './rosevalley_data.js';

const PI = Math.PI;
const ROSES = [[0.55, 0.02, 0.03], [0.62, 0.05, 0.1], [0.85, 0.28, 0.42], [0.9, 0.55, 0.62], [0.92, 0.9, 0.84], [0.95, 0.7, 0.1], [0.95, 0.4, 0.22]];
const LEAF = [0.035, 0.07, 0.025];

const toRing = (geo, LL) => { let P = LL.map(p => geo.toXZ(p[0], p[1])); if (P.length > 2 && P[0][0] === P.at(-1)[0] && P[0][1] === P.at(-1)[1]) P = P.slice(0, -1); return area2(P) < 0 ? P.reverse() : P; };

export function prepareRoseValley(map, geo) {
  (map.cover.sand ??= []).push(...HEATH.map(r => [toRing(geo, r).flat()]));
}

export function buildRoseValley({ root, solids: S, zips: Z, heightAt, ground, geo }) {
  const t0 = performance.now(), s0 = S.count;
  const gh = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 0; };
  const y0 = (x, z) => gh(x, z) + 0.17;
  const park = toRing(geo, PARK[0]), heath = HEATH.map(r => toRing(geo, r)), shingle = SHINGLE.map(r => toRing(geo, r));
  const lawns = LAWNS.map(r => toRing(geo, r)), beds = BEDS.map(r => toRing(geo, r));
  const inPark = (x, z) => inPoly(park, x, z), onBeach = (x, z) => heath.some(P => inPoly(P, x, z)) || shingle.some(P => inPoly(P, x, z));
  const isWater = (x, z) => ground?.isWater?.(x, z) ?? false;
  const R = rng(2024);
  const group = Object.assign(new THREE.Group(), { name: 'rose-valley' });
  root.add(group);
  let nV = 0;
  const add = (obj, name, shadow = true) => { obj.name = 'rosevalley-' + name; obj.castShadow = shadow; obj.receiveShadow = true; group.add(obj); nV += (obj.geometry.attributes.position.count) * (obj.count ?? 1); return obj; };
  // water probe: distance (<= max) and direction to the nearest open water
  const DIRS = Array.from({ length: 16 }, (_, k) => [Math.cos(k / 16 * PI * 2), Math.sin(k / 16 * PI * 2)]);
  const toWater = (x, z, max = 60) => { for (let d = 1; d <= max; d += 1) for (const [dx, dz] of DIRS) if (isWater(x + dx * d, z + dz * d)) return { d, dx, dz }; return null; };

  // ---------------------------------------------------------------------------------------------- rose beds + shrubs
  const bushes = [], blooms = []; // [x, y, z, sx, sy, sz, r, g, b]
  const mulch = new MB().setColor(0x4a3326);
  const fillPoly = (D, P, yf) => { const { pts, tris } = triangulate(P, []); for (const [a, b, c] of tris) { const A = pts[a], B = pts[b], C = pts[c], ids = [A, B, C].map(([x, z]) => D.vert(x, yf(x, z), z, 0, 1, 0)); const up = (B[1] - A[1]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[1] - A[1]) > 0; if (up) D.tri(ids[0], ids[1], ids[2]); else D.tri(ids[0], ids[2], ids[1]); } };
  const roseBed = (P, pal) => {
    fillPoly(mulch, P, (x, z) => y0(x, z) + 0.05);
    const bb = bboxOf(P), step = 0.85;
    for (let x = bb.x0 + 0.5; x < bb.x1; x += step) for (let z = bb.z0 + 0.5; z < bb.z1; z += step) {
      const jx = x + (R() - 0.5) * 0.3, jz = z + (R() - 0.5) * 0.3; if (!inPoly(P, jx, jz)) continue;
      const y = y0(jx, jz) + 0.05, s = 0.32 + R() * 0.14, col = pal[Math.floor(R() * pal.length)];
      bushes.push([jx, y + s * 0.75, jz, s, s * 0.9, s, ...LEAF.map(v => v * (0.8 + R() * 0.4))]);
      const n = 7 + Math.floor(R() * 6), bs = 0.045 + R() * 0.02;
      for (let k = n; k > 0; k--) { // blooms on the upper hemisphere of the bush (azimuth a, elevation e)
        const a = R() * PI * 2, e = 0.3 + R() * 0.95, out = Math.cos(e) * s, tint = col.map((v) => v * (0.85 + R() * 0.3));
        blooms.push([jx + out * Math.cos(a), y + s * (0.72 + 0.92 * Math.sin(e)), jz + out * Math.sin(a), bs, bs * 0.8, bs, ...tint]);
      }
    }
  };
  const ellipse = (cx, cz, a, b, rot, n = 22) => { // a lobed oval bed, rotated by rot
    const cr = Math.cos(rot), sr = Math.sin(rot);
    return Array.from({ length: n }, (_, k) => {
      const t = 2 * PI * k / n, u = a * Math.cos(t) * (1 + 0.12 * Math.sin(3 * t)), v = b * Math.sin(t);
      return [cx + cr * u - sr * v, cz + sr * u + cr * v];
    });
  };
  const palette = () => { const k = R(); return k < 0.3 ? [ROSES[0], ROSES[1]] : k < 0.5 ? [ROSES[2], ROSES[3]] : k < 0.62 ? [ROSES[4]] : k < 0.8 ? [ROSES[5], ROSES[6]] : [ROSES[0], ROSES[4]]; };
  for (const P of beds) roseBed(P, palette());
  const bedShapes = [...beds];
  // inside P and at least m from every edge of it
  const clearOf = (P, x, z, m) => inPoly(P, x, z) && P.every((a, k) => {
    const b = P[(k + 1) % P.length], ex = b[0] - a[0], ez = b[1] - a[1];
    const t = THREE.MathUtils.clamp(((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez || 1), 0, 1);
    return Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t) >= m;
  });
  const inBox = (bb) => [bb.x0 + (bb.x1 - bb.x0) * R(), bb.z0 + (bb.z1 - bb.z0) * R()]; // random point in a bbox
  const lawnPick = []; // free lawn points for trees / shrubs
  for (const L of lawns) {
    const A = areaOf(L); if (A < 150 || !inPark(...centroid(L))) continue;
    const bb = bboxOf(L), nb = Math.min(4, Math.max(1, Math.round(A / 900)));
    for (let q = 0, tries = 0; q < nb && tries < 60; tries++) {
      const [x, z] = inBox(bb), a = 4 + R() * 5, b = 1.6 + R() * 1.6, rot = R() * PI;
      const E = ellipse(x, z, a, b, rot); if (!E.every(([ex, ez]) => clearOf(L, ex, ez, 2.2)) || bedShapes.some(B => E.some(([ex, ez]) => inPoly(B, ex, ez)) || B.some(([bx, bz]) => inPoly(E, bx, bz)))) continue;
      roseBed(E, palette()); bedShapes.push(E); q++;
    }
    for (let q = 0, tries = 0; q < Math.ceil(A / 350) && tries < 80; tries++) {
      const [x, z] = inBox(bb);
      if (!clearOf(L, x, z, 3) || bedShapes.some(B => inPoly(B, x, z) || B.some(([bx, bz]) => Math.hypot(bx - x, bz - z) < 3))) continue;
      lawnPick.push([x, z]); q++;
    }
  }
  // clipped shrub mounds (spirea / juniper): clusters of flattened blobs on half the lawn picks
  const shrubs = lawnPick.filter((_, i) => i % 2 === 0), treePick = lawnPick.filter((_, i) => i % 2 === 1);
  for (const [x, z] of shrubs) {
    const n = 2 + Math.floor(R() * 4), rot = R() * PI, base = R() < 0.5 ? [0.03, 0.06, 0.028] : [0.07, 0.11, 0.035];
    const ux = Math.cos(rot), uz = Math.sin(rot);
    for (let k = 0; k < n; k++) { // a row of blobs 1.5 m apart, jittered
      const u = 1.5 * (k - (n - 1) / 2), px = x + ux * u + R() - 0.5, pz = z + uz * u + R() - 0.5, s = 0.9 + R() * 0.7;
      bushes.push([px, y0(px, pz) + 0.35 * s, pz, 1.2 * s, 0.62 * s, 1.2 * s, ...base.map((v) => v * (0.85 + R() * 0.3))]);
    }
  }
  // bushes and blooms are instanced per 64 m cell (so frustum culling works) with a distance LOD per cell:
  // lod = [[geometry, maxDist], ...] nearest first; past the last distance the cell is hidden. update() switches them.
  const cells = [], CELL = 64;
  const inst = (lod, mat, list, name, shadow) => {
    const byCell = new Map();
    list.forEach((b, i) => { const key = `${Math.floor(b[0] / CELL)},${Math.floor(b[2] / CELL)}`; (byCell.get(key) ?? byCell.set(key, []).get(key)).push(i); });
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0), at = new THREE.Vector3(), size = new THREE.Vector3();
    for (const idx of byCell.values()) {
      const levels = lod.map(([geom, far], l) => {
        const m = new THREE.InstancedMesh(geom, mat, idx.length);
        idx.forEach((i, k) => { // golden-angle yaw per instance
          const b = list[i];
          m.setMatrixAt(k, M.compose(at.fromArray(b, 0), q.setFromAxisAngle(up, (i * 2.39996) % (PI * 2)), size.fromArray(b, 3)));
          m.setColorAt(k, c.fromArray(b, 6));
        });
        m.computeBoundingSphere();
        add(m, `${name}-lod${l}`, shadow && l === 0);
        m.visible = l === lod.length - 1;
        return { m, far };
      });
      cells.push({ center: levels[0].m.boundingSphere.center, r: levels[0].m.boundingSphere.radius, levels });
    }
  };
  const lodUpdate = (cam) => {
    for (const cell of cells) {
      const d = Math.max(0, cam.distanceTo(cell.center) - cell.r);
      let pick = cell.levels.findIndex((L) => d < L.far);
      cell.levels.forEach((L, l) => { L.m.visible = l === pick; });
    }
  };
  const bushGeo = new THREE.IcosahedronGeometry(1, 2); // lumpy: radial wobble from a few sines
  { const a = bushGeo.attributes.position.array; for (let o = 0; o < a.length; o += 3) { const k = 1 + 0.12 * Math.sin(9.1 * a[o] + 7.3 * a[o + 2]) * Math.cos(8.7 * a[o + 1]); a[o] *= k; a[o + 1] *= k; a[o + 2] *= k; } bushGeo.computeVertexNormals(); }
  const bushFar = new THREE.IcosahedronGeometry(1, 0); // 20 faces for the mid distance
  inst([[bushGeo, 140], [bushFar, 700]], new THREE.MeshStandardMaterial({ roughness: 0.92 }), bushes, 'bushes', true);
  inst([[new THREE.IcosahedronGeometry(1, 0), 160], [new THREE.OctahedronGeometry(1, 0), 320]], new THREE.MeshStandardMaterial({ roughness: 0.7 }), blooms, 'roses', false);
  const flatMat = (o) => decal(Object.assign(new THREE.MeshStandardMaterial({ polygonOffset: true }), o)); // ground-hugging layers
  add(new THREE.Mesh(mulch.build(), flatMat({ vertexColors: true, roughness: 1, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })), 'mulch', false);

  // ---------------------------------------------------------------------------------------------- trees
  const spots = [];
  const pc = centroid(park);
  // poplars: a tall wall along the shore
  const edge = alongRing(park, 6.5);
  for (const [ex, ez] of edge) {
    const w = toWater(ex, ez, 45); if (!w) continue;
    for (const inward of [5, 11]) {
      let x = ex - w.dx * inward, z = ez - w.dz * inward; if (!inPoly(park, x, z)) { x = ex + (pc[0] - ex) * 0.08; z = ez + (pc[1] - ez) * 0.08; }
      if (isWater(x, z) || R() < 0.15) continue;
      spots.push({ x: x + (R() - 0.5) * 2, z: z + (R() - 0.5) * 2, y: y0(x, z), kind: 'park', sc: 1.0 + R() * 0.35, pal: PARK_GREENS, s3: [0.62, 1.75, 0.62] });
    }
  }
  const blueSpruce = [PARK_PINE[0].map(c => c.map((v, i) => v * [0.78, 0.95, 1.3][i]))];
  for (const [x, z] of treePick) {
    const k = R();
    if (k < 0.4) for (let q = 0; q < 3; q++) { const px = x + (q - 1) * 1.3, pz = z + (R() - 0.5) * 0.6; spots.push({ x: px, z: pz, y: y0(px, pz), kind: 'conifer', sc: 0.42 + R() * 0.12, pal: PARK_PINE, s3: [0.34, 1.25, 0.34] }); } // thujas
    else if (k < 0.75) for (let q = 0; q < 2 + Math.floor(R() * 3); q++) { const px = x + (R() - 0.5) * 6, pz = z + (R() - 0.5) * 6; spots.push({ x: px, z: pz, y: y0(px, pz), kind: 'conifer', sc: 0.6 + R() * 0.35, pal: blueSpruce, s3: [0.75, 1.15, 0.75] }); }
    else spots.push({ x, z, y: y0(x, z), kind: R() < 0.5 ? 'park' : 'elm', sc: 0.75 + R() * 0.35, pal: PARK_GREENS });
  }

  // ---------------------------------------------------------------------------------------------- fountains
  const white = new THREE.MeshStandardMaterial({ color: 0xe6e3dc, roughness: 0.6 });
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x1d4050, roughness: 0.05, metalness: 0.3, envMapIntensity: 1.4 });
  const jetMat = new THREE.MeshBasicMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.55, depthWrite: false });
  const jets = []; // {x, y, z, h, r, ph, kind}
  const rimM = new MB().setColor(0xffffff), wM = new MB().setColor(0xffffff);
  const offsetRing = (P, d) => { // push every vertex d metres away from the centroid
    const [mx, mz] = centroid(P);
    return P.map((p) => { const k = d / (Math.hypot(p[0] - mx, p[1] - mz) || 1); return [p[0] + (p[0] - mx) * k, p[1] + (p[1] - mz) * k]; });
  };
  for (const F of FOUNTAINS.map(r => toRing(geo, r))) {
    const yb = Math.min(...F.map(([x, z]) => y0(x, z))), yr = yb + 0.5, O = offsetRing(F, 0.4);
    for (let i = 0; i < F.length; i++) { // rim: top band between F and O, faces outside / inside
      const a = F[i], b = F[(i + 1) % F.length], c = O[(i + 1) % F.length], d = O[i];
      quad(rimM, [a[0], yr, a[1]], [b[0], yr, b[1]], [c[0], yr, c[1]], [d[0], yr, d[1]], [0, 1, 0]);
      const ox = c[0] - b[0], oz = c[1] - b[1], ol = Math.hypot(ox, oz) || 1;
      quad(rimM, [d[0], yb - 0.2, d[1]], [c[0], yb - 0.2, c[1]], [c[0], yr, c[1]], [d[0], yr, d[1]], [ox / ol, 0, oz / ol]);
      quad(rimM, [a[0], yb - 0.2, a[1]], [b[0], yb - 0.2, b[1]], [b[0], yr, b[1]], [a[0], yr, a[1]], [-ox / ol, 0, -oz / ol]);
      S.prism(ccw([a, b, c, d]).flat(), yb - 0.5, yr, 0, 0, 'ledge');
    }
    fillPoly(wM, F, () => yr - 0.12);
    const c = centroid(F), I = offsetRing(F, -0.9);
    I.forEach(([x, z], i) => jets.push({ x, y: yr - 0.12, z, h: 1.6, r: 0.05, ph: 0.6 * i, tilt: [c[0] - x, c[1] - z] })); // ring jets lean inward
    jets.push({ x: c[0], y: yr - 0.12, z: c[1], h: 4.2, r: 0.12, ph: 0 });
    Z.add(c[0], yr, c[1], 0, 1, 0, 'ledge');
  }
  { // walk-through splash fountain: light paving disc + a grid of floor jets
    const [fx, fz] = geo.toXZ(...PEDFOUNTAIN), P = disc(fx, fz, 7, 28);
    const pave = new MB().setColor(0xb9b4ab); fillPoly(pave, P, (x, z) => y0(x, z) + 0.06);
    add(new THREE.Mesh(pave.build(), flatMat({ vertexColors: true, roughness: 0.35, metalness: 0.1, polygonOffsetFactor: -3, polygonOffsetUnits: -6 })), 'splash-pad', false);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (i * i + j * j <= 5) jets.push({ x: fx + i * 2.2, y: y0(fx, fz) + 0.06, z: fz + j * 2.2, h: 1.8, r: 0.06, ph: (i + j) * 0.9, wave: true });
  }
  add(new THREE.Mesh(rimM.build(), white), 'fountain-rims');
  add(new THREE.Mesh(wM.build(), waterMat), 'fountain-water', false);
  const jetGeo = new THREE.CylinderGeometry(0.35, 1, 1, 6, 1, true).translate(0, 0.5, 0);
  const jetMesh = add(new THREE.InstancedMesh(jetGeo, jetMat, jets.length), 'jets', false);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _lean = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.28), _Y = new THREE.Vector3(0, 1, 0);
  const setJets = (t) => {
    jets.forEach((j, i) => {
      const k = j.wave ? Math.max(0.02, Math.sin(t * 1.6 - j.ph)) : 0.85 + 0.15 * Math.sin(t * 3 + j.ph);
      // ring jets: yaw toward the basin centre, then lean 0.28 rad about local x
      if (j.tilt) _q.setFromAxisAngle(_Y, Math.atan2(j.tilt[0], j.tilt[1])).multiply(_lean); else _q.identity();
      _m.compose(new THREE.Vector3(j.x, j.y, j.z), _q, new THREE.Vector3(j.r, j.h * k, j.r)); jetMesh.setMatrixAt(i, _m);
    });
    jetMesh.instanceMatrix.needsUpdate = true;
  };
  setJets(0); jetMesh.computeBoundingSphere();

  // ---------------------------------------------------------------------------------------------- sundial
  {
    const P = toRing(geo, SUNDIAL[0]), [sx, sz] = centroid(P), rr = Math.max(...P.map(([x, z]) => Math.hypot(x - sx, z - sz)));
    const ys = y0(sx, sz) + 0.07;
    const tex = canvasTex(512, 512, (g, w, h) => { // radial pattern: grey pavers with red wedges (hour sectors)
      g.fillStyle = '#9a958d'; g.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      for (let k = 0; k < 12; k++) { // hour wedges, alternating red / grey
        const a0 = (PI / 6) * k; g.fillStyle = ['#8b867f', '#a64a3c'][k & 1];
        g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, cx, a0, a0 + 0.45 * PI / 6); g.fill();
      }
      g.strokeStyle = 'rgba(40,38,36,0.35)'; g.lineWidth = 1.5; for (let r = 30; r < w / 2; r += 22) { g.beginPath(); g.arc(w / 2, h / 2, r, 0, PI * 2); g.stroke(); }
      g.fillStyle = '#6e6a64'; g.beginPath(); g.arc(w / 2, h / 2, 40, 0, PI * 2); g.fill();
    }, { repeat: false });
    const D = new MB(), uvOf = (x, z) => [0.5 + (x - sx) / (2 * rr), 0.5 + (z - sz) / (2 * rr)];
    const hub = D.vert(sx, ys, sz, 0, 1, 0, 0.5, 0.5), ids = disc(sx, sz, rr, 40).map(([x, z]) => D.vert(x, ys, z, 0, 1, 0, ...uvOf(x, z)));
    ids.forEach((id, k) => D.tri(hub, ids[(k + 1) % ids.length], id)); // fan, facing up
    add(new THREE.Mesh(D.build(), flatMat({ map: tex, roughness: 0.8, polygonOffsetFactor: -3, polygonOffsetUnits: -6 })), 'sundial-plaza', false);
    // the crane gnomon: body low, neck + beak along the polar axis (true north, elevation = latitude)
    const [nx, nz] = geo.north, lat = 49.45 * PI / 180, ry = Math.atan2(-nz, nx); // local +x -> north
    const s = new SG();
    s.ellipsoid([-0.4, 1.2, 0], [0.75, 0.32, 0.28], 14, 8);
    const ax = Math.cos(lat), ay = Math.sin(lat); // neck along the polar axis with a slight upward bow
    const neck = Array.from({ length: 9 }, (_, k) => { const t = k / 8, r = 4.2 * t; return [0.2 + ax * r, 1.3 + ay * r + 0.075 * Math.sin(PI * t), 0]; });
    s.tube(neck, neck.map((_, k) => 0.1 - k * 0.008), 8);
    s.ellipsoid([0.2 + ax * 4.3, 1.3 + ay * 4.3, 0], [0.16, 0.12, 0.1], 10, 6);
    s.tube([[0.25 + ax * 4.35, 1.3 + ay * 4.35, 0], [0.25 + ax * 5.3, 1.3 + ay * 5.3, 0]], [0.05, 0.005], 6);
    for (const w of [-1, 1]) { // wings: swept plates of forged feathers
      const R2 = []; for (let j = 0; j <= 4; j++) { const t = j / 4, row = []; for (let i = 0; i <= 5; i++) { const u = i / 5; row.push([-0.2 - u * 1.9, 1.35 + 0.35 * t - u * 0.3, w * (0.25 + t * 1.1 * (1 - u * 0.4))]); } R2.push(row); }
      s.loft(R2, { closed: false });
    }
    for (const w of [-0.18, 0.18]) s.tube([[-0.45, 1.0, w], [-0.5, 0.5, w * 1.2], [-0.45, 0, w * 1.4]], [0.05, 0.045, 0.04], 5);
    const iron = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, metalness: 0.8, roughness: 0.45, side: THREE.DoubleSide });
    add(new THREE.Mesh(s.build(M4(sx, ys, sz, ry)), iron), 'sundial-crane');
    S.cyl(sx, sz, ys, ys + 1.5, 0.6, 0.6, 'equipment');
    { const tip = M4(sx, ys, sz, ry); const v = new THREE.Vector3(0.25 + ax * 5.3, 1.3 + ay * 5.3, 0).applyMatrix4(tip); Z.add(v.x, v.y, v.z, 0, 1, 0, 'antenna'); }
    // twelve forged chairs round the dial facing in
    const ch = new SG(), seat = new MB().setColor(0x8a5a32);
    disc(sx, sz, rr - 1.2, 12).forEach(([cx, cz], k) => {
      const a = (PI / 6) * k, m = M4(cx, y0(cx, cz) + 0.07, cz, PI - a); // seat faces the gnomon
      const p = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(m).toArray();
      for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) ch.tube([p(x * 1.15, 0, z * 1.15), p(x, 0.48, z)], [0.022, 0.022], 4);
      const back = []; for (let q = 0; q <= 10; q++) { const t = q / 10 * PI; back.push(p(-0.27, 0.5 + Math.sin(t) * 0.75, Math.cos(t) * 0.27)); }
      ch.tube(back, back.map(() => 0.02), 4, { caps: false });
      ch.tube([p(-0.27, 0.5, 0), p(-0.27, 1.05, 0)], [0.018, 0.018], 4);
      seat.with(m, d => d.box(-0.28, 0.46, -0.28, 0.28, 0.52, 0.28));
    });
    add(new THREE.Mesh(ch.build(), iron), 'sundial-chairs');
    add(new THREE.Mesh(seat.build(), Object.assign(new THREE.MeshStandardMaterial({ roughness: 0.7 }), { vertexColors: true })), 'sundial-seats');
  }

  // ---------------------------------------------------------------------------------------------- lamp posts along the park paths
  const lamps = [];
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.15, 1.0) });
  const pathPts = [];
  for (const L of lawns) if (inPark(...centroid(L))) pathPts.push(...alongRing(L, 3)); // lawn edges = path edges
  { const H = new Map(); for (const [x, z] of pathPts) { const k = Math.floor(x / 24) * 7919 + Math.floor(z / 24); if (H.has(k) || !inPark(x, z)) continue; H.set(k, 1); lamps.push([x, y0(x, z), z]); } }
  const pole = new MB().setColor(0x202225), glob = new MB().setColor(0xffffff);
  lamps.forEach(([x, y, z]) => {
    pole.cyl(x, y, z, 0.07, 0.05, 3.9, 6, false).cyl(x, y, z, 0.13, 0.1, 0.5, 6, false); // shaft + base sleeve
    glob.cyl(x, y + 3.9, z, 0.22, 0.22, 0.5, 8, true);
    S.cyl(x, z, y, y + 4.4, 0.1, 0.1, 'pole');
  });
  add(new THREE.Mesh(pole.build(), Object.assign(new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.5 }), { vertexColors: true })), 'lamp-posts');
  add(new THREE.Mesh(glob.build(), lampMat), 'lamp-globes', false);

  // ---------------------------------------------------------------------------------------------- beach
  const beachGeo = { umb: new MB(), cloth: new MB(), wood: new MB(), white: new MB(), red: new MB() };
  let nUmb = 0;
  {
    const P = heath.flat(), bb = bboxOf(P), H = new Map();
    const cand = [];
    for (let x = bb.x0; x < bb.x1; x += 2) for (let z = bb.z0; z < bb.z1; z += 2) { if (!heath.some(Q => inPoly(Q, x, z)) || isWater(x, z)) continue; const w = toWater(x, z, 45); if (w) cand.push([x, z, w]); }
    cand.sort((a, b) => a[2].d - b[2].d);
    const free = (x, z, d) => { for (const [px, pz] of H.values()) if (Math.hypot(px - x, pz - z) < d) return false; return true; };
    let tower = null, court = null;
    for (const [x, z, w] of cand) {
      if (w.d >= 9 && w.d <= 11 || w.d >= 17 && w.d <= 19) {
        if (!free(x, z, 6)) continue; H.set(H.size, [x, z]);
        const y = y0(x, z) + 0.03, face = Math.atan2(-w.dz, w.dx); // loungers face the water
        beachGeo.umb.cyl(x, y, z, 0.035, 0.035, 2.3, 5, false);
        beachGeo.cloth.cyl(x, y + 1.9, z, 1.4, 0.05, 0.55, 8, false); beachGeo.cloth.cyl(x, y + 1.9, z, 1.4, 1.4, 0.18, 8, false);
        for (const side of [-0.8, 0.8]) beachGeo.white.with(M4(x - w.dz * side - w.dx * 0.5, y, z + w.dx * side - w.dz * 0.5, face), d => { d.box(-0.95, 0.25, -0.33, 0.55, 0.35, 0.33); d.with(M4(0.55, 0.3, 0).multiply(new THREE.Matrix4().makeRotationZ(0.75)), e => e.box(0, -0.04, -0.33, 0.7, 0.05, 0.33)); for (const [a, b] of [[-0.9, -0.28], [-0.9, 0.28], [0.5, -0.28], [0.5, 0.28]]) d.box(a - 0.03, 0, b - 0.03, a + 0.03, 0.26, b + 0.03); });
        S.cyl(x, z, y, y + 2.3, 0.05, 0.05, 'pole'); nUmb++;
      } else if (!tower && w.d >= 5 && w.d <= 7 && cand.length && Math.abs(x - cand[cand.length >> 1][0]) < 40) {
        tower = [x, z, w]; H.set(H.size, [x, z]);
      } else if (!court && w.d >= 28 && w.d <= 34 && free(x, z, 12)) { court = [x, z, w]; H.set(H.size, [x, z]); }
    }
    if (tower) { // lifeguard tower: 4 legs, platform, hut with a flat roof, a ladder
      const [x, z, w] = tower, y = y0(x, z), face = Math.atan2(-w.dz, w.dx);
      beachGeo.wood.with(M4(x, y, z, face), d => {
        for (let q = 0; q < 4; q++) d.boxC(q & 1 ? 1.1 : -1.1, 1.6, q & 2 ? 1.1 : -1.1, 0.16, 3.2, 0.16); // legs
        d.box(-1.4, 3.0, -1.4, 1.6, 3.2, 1.4).box(-1.2, 3.2, -1.2, 1.0, 5.4, 1.2, 0b111110).box(-1.5, 5.4, -1.5, 1.4, 5.6, 1.5);
        for (let k = 0; k < 9; k++) { const xr = 1.6 + 0.28 * k, yr = 0.3 + 0.33 * k; d.box(xr, yr, -0.4, xr + 0.26, yr + 0.06, 0.4); } // ladder
      });
      beachGeo.red.with(M4(x, y, z, face), d => { d.box(1.0, 4.1, -0.12, 1.06, 4.9, 0.12); d.box(1.0, 4.38, -0.4, 1.06, 4.62, 0.4); }); // red cross
      S.box(x - 1.5, y + 3.0, z - 1.5, x + 1.5, y + 5.6, z + 1.5, 'roof'); Z.add(x, y + 5.6, z, 0, 1, 0, 'roofCorner');
    }
    if (court) { // volleyball: net between two posts, boundary tape
      const [x, z, w] = court, y = y0(x, z), face = Math.atan2(-w.dz, w.dx) + PI / 2;
      beachGeo.white.with(M4(x, y, z, face), d => {
        d.boxC(-4.7, 1.275, 0, 0.1, 2.55, 0.1).boxC(4.7, 1.275, 0, 0.1, 2.55, 0.1); // posts
        d.box(-4.6, 2.35, -0.01, 4.6, 2.43, 0.01).box(-4.6, 1.5, -0.01, 4.6, 1.54, 0.01); // net bands
        for (let k = -4.5; k <= 4.5; k += 0.5) d.boxC(k, 1.95, 0, 0.016, 0.9, 0.016); // net strings
        for (const [a0, b0, a1, b1] of [[-4.5, -8, 4.5, -8], [-4.5, 8, 4.5, 8], [-4.5, -8, -4.5, 8], [4.5, -8, 4.5, 8]]) d.box(Math.min(a0, a1) - 0.03, 0.02, Math.min(b0, b1) - 0.03, Math.max(a0, a1) + 0.03, 0.04, Math.max(b0, b1) + 0.03); });
    }
  }
  const beachMats = { umb: new THREE.MeshStandardMaterial({ color: 0xcfcac2, metalness: 0.5, roughness: 0.4 }), cloth: new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.8, side: THREE.DoubleSide }), wood: new THREE.MeshStandardMaterial({ color: 0x9a7b56, roughness: 0.85 }), white: new THREE.MeshStandardMaterial({ color: 0xf0eeea, roughness: 0.6 }), red: new THREE.MeshStandardMaterial({ color: 0xc0201a, roughness: 0.6 }) };
  for (const [k, d] of Object.entries(beachGeo)) if (d.v) add(new THREE.Mesh(d.build(), beachMats[k]), 'beach-' + k);

  const clear = (x, z) => inPark(x, z) || onBeach(x, z);
  console.log(`[cherkasy] Rose Valley: ${bedShapes.length} rose beds, ${bushes.length} bushes, ${blooms.length} roses, ${jets.length} jets, ${lamps.length} lamps, ${spots.length} trees, beach ${nUmb} parasols; ${nV} vertices, ${S.count - s0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  let time = 0;
  return {
    clear, spots,
    update(dt, camera) { time += dt; setJets(time); lampMat.color.setScalar(0.9 + 1.4 * nightK.value); if (camera) lodUpdate(camera.position); },
  };
}

const ccw = (P) => (area2(P) < 0 ? P.slice().reverse() : P);
// flat quad p0..p3 turned so its front looks along n
function quad(D, p0, p1, p2, p3, n) {
  const a = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), b = new THREE.Vector3(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
  const loop = a.cross(b).dot(new THREE.Vector3(n[0], n[1], n[2])) < 0 ? [p0, p3, p2, p1] : [p0, p1, p2, p3];
  D.quad(...loop.map((p) => D.vert(p[0], p[1], p[2], n[0], n[1], n[2])));
}
// n points on a circle of radius r round (cx, cz), from angle 0 counter-clockwise in (x, z)
const disc = (cx, cz, r, n) => Array.from({ length: n }, (_, k) => [cx + r * Math.cos(2 * PI * k / n), cz + r * Math.sin(2 * PI * k / n)]);
// points every `step` m along the closed ring (each edge restarts at its first vertex)
function alongRing(P, step) {
  const out = [];
  P.forEach((a, i) => {
    const b = P[(i + 1) % P.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    for (let t = 0; t < L; t += step) out.push([a[0] + dx * t / L, a[1] + dz * t / L]);
  });
  return out;
}
