// OWNER: cherkasy. The New Year tree on Soborna square (OSM ways 1011542990–1011542999, "З Новим Роком!": nine stacked
// pyramidal building parts, 26.5 m) rebuilt as a real tree: drooping fir tiers with serrated branch tips, glass baubles,
// a spiral garland that twinkles at night, a gold star on top, a low fence with gift boxes round the base.
//   TREE_SKIP: the OSM parts replaced here
//   buildYalynka({ root, map, solids, zips, heightAt }) -> { update(dt) } | null
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { rng } from './geo.js';

const IDS = [1011542990, 1011542991, 1011542992, 1011542993, 1011542994, 1011542995, 1011542996, 1011542997, 1011542998, 1011542999];
export const TREE_SKIP = new Set(IDS);
const BASE_ID = 1011542999;
const TOP = 26.5;

export function buildYalynka({ root, map, solids: S, zips: Z, heightAt }) {
  const t0 = performance.now();
  const b = map.buildings.find(q => q.id === BASE_ID); if (!b) return null;
  let cx = 0, cz = 0; const n = b.p.length / 2; for (let i = 0; i < b.p.length; i += 2) { cx += b.p[i]; cz += b.p[i + 1]; } cx /= n; cz /= n;
  let R0 = 0; for (let i = 0; i < b.p.length; i += 2) R0 += Math.hypot(b.p[i] - cx, b.p[i + 1] - cz); R0 /= n;
  const gy = heightAt(cx, cz) + 0.15, r = rng(2025);
  const group = Object.assign(new THREE.Group(), { name: 'yalynka' });
  group.position.set(cx, gy, cz); root.add(group);
  // meshes of the tree: named 'yalynka-<part>', shadow flags as given
  const put = (obj, part, cast = false, recv = false) => { Object.assign(obj, { castShadow: cast, receiveShadow: recv }); if (part) obj.name = 'yalynka-' + part; group.add(obj); return obj; };
  const TAU = Math.PI * 2;

  // silhouette: radius of the crown at height y (a slightly concave cone, R0 at the bottom tier)
  const Y0 = 1.2, Y1 = TOP - 1.2;
  const crownR = (y) => R0 * Math.pow(Math.max(0, 1 - (y - Y0) / (Y1 + 1.2 - Y0)), 1.08);

  // ---- fir tiers: each tier a drooping skirt of branch spikes, green varied per vertex
  const F = new MB();
  const TIERS = 11, SPK = 34;
  const green = (k) => { const v = 0.75 + r() * 0.35; return [0.018 * v * k, 0.085 * v * k, 0.035 * v * k]; };
  for (let t = 0; t < TIERS; t++) {
    const yb = Y0 + (Y1 - Y0) * Math.pow(t / TIERS, 0.92), yt = Y0 + (Y1 - Y0) * Math.pow((t + 1.35) / TIERS, 0.92);
    const Rb = crownR(yb) * 1.02, Rt = Math.max(0.25, crownR(yt) * 0.35), rot = r() * Math.PI;
    const ring = [], top = [], under = [];
    for (let k = 0; k <= SPK * 2; k++) {
      const a = rot + k / (SPK * 2) * Math.PI * 2, tip = k % 2 === 0, rr = Rb * (tip ? 1 + (r() - 0.5) * 0.08 : 0.8), dy = tip ? -0.35 - r() * 0.3 : 0.15;
      const ux = Math.cos(a), uz = Math.sin(a), lo = yb + dy;
      ring.push(F.setColor(green(tip ? 0.85 : 1.1)).vert(rr * ux, lo, rr * uz, ux, 0.55, uz));
      top.push(F.setColor(green(1.25)).vert(Rt * ux, yt, Rt * uz, 0.6 * ux, 0.8, 0.6 * uz));
      const ru = 0.97 * rr; under.push(F.setColor(green(0.55)).vert(ru * ux, lo - 0.02, ru * uz, 0, -1, 0));
    }
    for (let k = 0; k < SPK * 2; k++) F.quad(ring[k], top[k], top[k + 1], ring[k + 1]); // outer skirt (faces out)
    F.setColor(green(0.45)); const c = F.vert(0, yb + 1.2, 0, 0, -1, 0);
    for (let k = 0; k < SPK * 2; k++) F.tri(under[k], under[k + 1], c); // underside
    // collision: a frustum per tier
    S.cyl(cx, cz, gy + yb - 0.4, gy + yt, Rb * 0.92, Rt, 'wall');
    if (t % 3 === 1) { // grab ledges on every third tier
      const rz = Rb * 0.9;
      for (let k = 0; k < 8; k++) { const ux = Math.cos(rot + k * TAU / 8), uz = Math.sin(rot + k * TAU / 8); Z.add(cx + rz * ux, gy + yb + 0.3, cz + rz * uz, ux, 0, uz, 'ledge'); }
    }
  }
  F.cyl(0, 0, 0, 0.9, 0.7, Y0 + 1, 10, false); // trunk stub under the lowest tier
  const firMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  put(new THREE.Mesh(F.build(), firMat), 'fir', true, true);

  // points on the crown surface (just outside the branch tips)
  const onCrown = (y, a, out = 0.2) => {
    const f = (y - Y0) / (Y1 - Y0), rad = out + crownR(y) * (0.93 - 0.08 * ((1.37 * y) % 1));
    return [rad * Math.cos(a), y, rad * Math.sin(a), f < 0 ? 0 : f > 1 ? 1 : f];
  };

  // ---- baubles: instanced spheres (red, gold, blue, silver), bigger low on the tree
  const nB = 260, ball = new THREE.SphereGeometry(1, 14, 10);
  const ballMat = new THREE.MeshStandardMaterial({ emissiveIntensity: 0, roughness: 0.22, metalness: 0.75, emissive: 0xffffff, color: 0xffffff });
  const balls = put(new THREE.InstancedMesh(ball, ballMat, nB), 'baubles', true);
  const col = new THREE.Color(), m4 = new THREE.Matrix4();
  const BC = [0xc8102e, 0xd4a017, 0x1f4fb4, 0xd9dde2, 0xc8102e, 0xd4a017, 0x7a1fa2]; // red and gold twice as common
  for (let i = 0; i < nB; i++) {
    const y = Y0 + 0.6 + Math.pow(r(), 0.8) * (Y1 - Y0 - 2), [x, yy, z, t] = onCrown(y, r() * Math.PI * 2, 0.15), s = 0.55 - 0.3 * t + r() * 0.12;
    m4.makeScale(s, s, s).setPosition(x, yy - 0.5, z); balls.setMatrixAt(i, m4); balls.setColorAt(i, col.set(BC[i % BC.length]));
  }

  // ---- garland: bulbs on a spiral (and a second, counter-rotating one), twinkling
  const bulbs = [];
  for (const [turns, phase, dir] of [[9, 0, 1], [7, 1.7, -1]]) {
    const N = 420, rise = Y1 - Y0 - 1.6;
    for (let i = 0; i < N; i++) {
      const u = i / N, p = onCrown(Y0 + 0.8 + rise * u, phase + dir * turns * TAU * u, 0.28);
      bulbs.push([p[0], p[1] - 0.2, p[2]]);
    }
  }
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const bulbGeo = new THREE.IcosahedronGeometry(0.16, 0);
  const lights = put(new THREE.InstancedMesh(bulbGeo, bulbMat, bulbs.length), 'lights');
  const LC = [[1.0, 0.78, 0.35], [1.0, 0.78, 0.35], [0.45, 0.65, 1.0], [1.0, 0.3, 0.25], [0.5, 1.0, 0.5]];
  bulbs.forEach(([x, y, z], i) => lights.setMatrixAt(i, m4.makeTranslation(x, y, z)));
  const bulbCol = bulbs.map((_, i) => LC[((i >> 3) + 7 * i) % LC.length]); // colour pattern that does not repeat along a turn
  const bulbPh = bulbs.map(() => r() * Math.PI * 2);
  bulbCol.forEach((c, i) => lights.setColorAt(i, col.setRGB(c[0] * 0.4, c[1] * 0.4, c[2] * 0.4)));

  // ---- star: extruded 5-point star, gold, glowing at night, slowly turning
  const starPts = Array.from({ length: 11 }, (_, k) => { const a = Math.PI / 2 + k * Math.PI / 5, rad = k & 1 ? 0.75 : 1.8; return new THREE.Vector2(rad * Math.cos(a), rad * Math.sin(a)); });
  const sh = new THREE.Shape(starPts);
  const starGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 1 }); starGeo.translate(0, 0, -0.18);
  const starMat = new THREE.MeshStandardMaterial({ color: 0xffd257, metalness: 0.9, roughness: 0.25, emissive: 0xffb830, emissiveIntensity: 0.25 });
  const star = put(new THREE.Mesh(starGeo, starMat), 'star', true); star.position.y = TOP + 1.3;
  const tip = new MB(); tip.setColor([0.04, 0.17, 0.06]); tip.cyl(0, Y1 - 0.5, 0, 0.35, 0.05, TOP - Y1 + 0.9, 8);
  put(new THREE.Mesh(tip.build(), firMat), null);
  S.cyl(cx, cz, gy + Y1 - 0.5, gy + TOP + 3.1, 0.6, 0.6, 'equipment');
  Z.add(cx, gy + TOP + 3.1, cz, 0, 1, 0, 'antenna');

  // ---- base: low red fence ring with white posts, gift boxes
  const B = new MB(), Rf = R0 + 2.2, NP = 36;
  for (let k = 0; k < NP; k++) {
    const a0 = k / NP * Math.PI * 2, a1 = (k + 1) / NP * Math.PI * 2, x0 = Math.cos(a0) * Rf, z0 = Math.sin(a0) * Rf, x1 = Math.cos(a1) * Rf, z1 = Math.sin(a1) * Rf;
    B.setColor([0.9, 0.9, 0.88]); B.boxC(x0, 0.55, z0, 0.18, 1.1, 0.18);
    B.setColor([0.55, 0.03, 0.05]); B.tube([x0, 0.95, z0], [x1, 0.95, z1], 0.06, 5); B.tube([x0, 0.5, z0], [x1, 0.5, z1], 0.05, 5);
    S.box(cx + Math.min(x0, x1) - 0.1, gy, cz + Math.min(z0, z1) - 0.1, cx + Math.max(x0, x1) + 0.1, gy + 1.1, cz + Math.max(z0, z1) + 0.1, 'wall');
  }
  const GC = [[0.7, 0.05, 0.08], [0.1, 0.25, 0.6], [0.85, 0.65, 0.1], [0.1, 0.45, 0.15], [0.9, 0.9, 0.9]];
  for (let k = 0; k < 16; k++) { // gift boxes: random spot inside the fence, size, yaw
    const a = r() * TAU, d = R0 * (0.75 + r() * 0.35), s = 0.7 + r() * 0.8;
    const place = new THREE.Matrix4().makeRotationY(r() * 3).setPosition(d * Math.cos(a), 0, d * Math.sin(a));
    B.setColor(GC[k % GC.length]).with(place, (D) => {
      D.boxC(0, s / 2, 0, s, s, s * (0.8 + r() * 0.4));
      D.setColor([0.95, 0.8, 0.2]); D.boxC(0, s / 2 + 0.01, 0, s * 1.02, s * 1.02, 0.12); D.boxC(0, s / 2 + 0.01, 0, 0.12, s * 1.02, s * 1.02);
    });
  }
  put(new THREE.Mesh(B.build(), new THREE.MeshStandardMaterial({ roughness: 0.6, vertexColors: true })), 'base', true, true);

  console.log(`[cherkasy] yalynka: ${TOP} m tree at (${cx.toFixed(0)}, ${cz.toFixed(0)}), ${nB} baubles, ${bulbs.length} bulbs in ${(performance.now() - t0).toFixed(0)} ms`);

  let time = 0, acc = 0;
  return {
    update(dt) {
      time += dt; acc += dt;
      star.rotation.y = time * 0.4;
      const k = nightK.value;
      starMat.emissiveIntensity = 0.25 + 2.2 * k;
      ballMat.emissiveIntensity = 0.0;
      if (acc < 0.08) return; acc = 0; // garland twinkle at ~12 Hz
      const g = 0.9 + 1.9 * k;
      for (let i = 0; i < bulbs.length; i++) {
        const c = bulbCol[i], tw = 0.55 + 0.45 * Math.max(0, Math.sin(time * 2.2 + bulbPh[i])), chase = 0.6 + 0.4 * Math.sin(time * 3 - i * 0.12);
        const v = g * tw * chase; lights.setColorAt(i, col.setRGB(c[0] * v, c[1] * v, c[2] * v));
      }
      lights.instanceColor.needsUpdate = true;
    },
  };
}
