// OWNER: cherkasy. The fountain on площа Дружби народів, at the north-west end of the square in front of the Palace of
// Culture (бульвар Шевченка 249; OSM way 402904429, amenity=fountain + natural=water). The first fountain here (1980) had
// a square concrete-faced bowl with colour-music lights; the 2010–2012 reconstruction of the palace and the square gave
// it today's bowl and a light-dynamic program (no music now; the bowl re-sealed and a broken granite slab replaced in
// 2021). Built after the OSM outline (all 31 nodes; map.json keeps 16), the 2025 Google satellite view and the photos of
// 2025 (18000.com.ua, day) and of Yurii Solonko (night): a pointed-arch bowl about 25 x 22 m, its apex to the north,
// in a low wall of dark polished granite with a broad coping, ringed by a 1.5 m apron of pale granite slabs; inside it
// a raised shield-shaped pool (point to the south, its top an arc) in a taller dark granite wall; rows of jets in
// graduated heights along the shield's arc and across its middle, a tall column with a crown of six in its centre, and
// rows of small jets in the lower pool along the shield's sides. The jets run a wave program on the wall clock (every
// player sees the same), and at night the jets and the water glow in slowly cycling colours (the LED lights).
//   FOUNTAIN_RING: the OSM outline in map x / z (the outer face of the bowl wall)
//   buildDruzhbaFountain({ group, solids, heightAt, paveY }) -> { update(dt), covers(x, z), ring, apron, tier, levels,
//     stats } – meshes go into `group` (druzhba.js passes its own), colliders into `solids`; covers(x, z): the bowl
//     and its apron (druzhba.js keeps its square's paving and the generated trees off it); levels: the rim, water and
//     tier heights.
// Draw calls: the granite (walls, copings), the apron, the water, the jets, the foam – five.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex, decal } from './sculpt.js';
import { area2, inPoly, rng } from './geo.js';

// OSM way 402904429, every node, projected with FRAME_OF(map).toXZ: the apex (90 degrees, straight legs along the map
// axes) is the north corner; the base runs west -> south-east with a 1.3 m jog in it (the photo shows the step).
export const FOUNTAIN_RING = [
  [6.4, 1083], [1.5, 1083], [-3.5, 1083.3], [-6, 1083.6], [-8.6, 1084.1], [-10.8, 1084.7], [-12.9, 1085.6], [-14.9, 1086.6],
  [-16.4, 1087.4], [-18.1, 1088.6], [-19.4, 1089.5], [-19.3, 1095.9], [-15.6, 1099], [-12, 1102.5], [-10.5, 1101.4],
  [-8.5, 1104.8], [-7.1, 1108.4], [-5.8, 1108.1], [-4.7, 1107.7], [-3.6, 1107], [-2.4, 1106.1], [-0.9, 1104.9],
  [0.8, 1103.2], [2.4, 1101.5], [3.5, 1099.8], [4.4, 1098.3], [5.1, 1096.7], [5.8, 1094.9], [6.1, 1093], [6.3, 1091.2],
  [6.3, 1088.4],
];
// the raised shield, traced off the satellite view: the ends and the crown of its top arc, its point, the centre column
const SH = { TL: [-5.8, 1084.9], TOP: [-0.7, 1089.2], TR: [2.3, 1095.3], TIP: [-9.8, 1098.3], C: [-4.9, 1092.8] };
const SIDE_BULGE = 1.0;                     // the shield's sides bow out by this much at their middle
const WALL = 0.45, TIER_WALL = 0.35, APRON = 1.5;
const RIM_H = 0.5, FREE = 0.15, TIER_UP = 0.6, TIER_FREE = 0.12, FLOOR = 0.32; // heights over the paving / water
const GRANITE = '#727478', COPE = '#86888c', TIER = '#6a6c70', SLAB = '#c4c3bf';
const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------ helpers
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const qb = (a, c, b, t) => { const u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]; };
const ccw = (P) => (area2(P) < 0 ? P.slice().reverse() : P.slice());
// a ring moved outward by d (inward for d < 0), mitred, the mitre capped at 3 x |d|; P counter-clockwise (area2 > 0)
function offsetRing(P, d) {
  const n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i + n - 1) % n], b = P[i], c = P[(i + 1) % n];
    const e1 = [b[0] - a[0], b[1] - a[1]], e2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const n1 = [e1[1] / l1, -e1[0] / l1], n2 = [e2[1] / l2, -e2[0] / l2]; // outward for a ccw ring
    let m = [n1[0] + n2[0], n1[1] + n2[1]];
    const ml = Math.hypot(...m) || 1; m = [m[0] / ml, m[1] / ml];
    const k = Math.min(3, 1 / Math.max(0.2, m[0] * n1[0] + m[1] * n1[1]));
    out.push([b[0] + m[0] * d * k, b[1] + m[1] * d * k]);
  }
  return out;
}
// drop the reflex corners (the jog in the base) so a wide outward offset stays simple
const convexIdx = (P) => P.map((b, i) => {
  const a = P[(i + P.length - 1) % P.length], c = P[(i + 1) % P.length];
  return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) >= -1e-6 ? i : -1;
}).filter((i) => i >= 0);

// the shield's outline: its top arc through the traced crown, the two sides bowed out to the point
function shieldRing() {
  const { TL, TOP, TR, TIP } = SH, mid = [(TL[0] + TR[0]) / 2, (TL[1] + TR[1]) / 2];
  const c0 = [2 * TOP[0] - mid[0], 2 * TOP[1] - mid[1]];
  const ctr = [(TL[0] + TR[0] + TIP[0]) / 3, (TL[1] + TR[1] + TIP[1]) / 3];
  const ctl = (a, b) => { // control point bowing the side a -> b out from the centre
    const m = lerp2(a, b, 0.5), dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    let n = [dz / L, -dx / L];
    if ((m[0] + n[0] - ctr[0]) ** 2 + (m[1] + n[1] - ctr[1]) ** 2 < (m[0] - ctr[0]) ** 2 + (m[1] - ctr[1]) ** 2) n = [-n[0], -n[1]];
    return [m[0] + n[0] * 2 * SIDE_BULGE, m[1] + n[1] * 2 * SIDE_BULGE];
  };
  const sides = [[TL, c0, TR, 12], [TR, ctl(TR, TIP), TIP, 10], [TIP, ctl(TIP, TL), TL, 10]];
  const out = [];
  for (const [a, c, b, n] of sides) for (let k = 0; k < n; k++) out.push(qb(a, c, b, k / n));
  return { ring: ccw(out), arc: (t) => qb(TL, c0, TR, t), right: (t) => qb(TR, ctl(TR, TIP), TIP, t), left: (t) => qb(TIP, ctl(TIP, TL), TL, t), ctr };
}

// ------------------------------------------------------------------------------------------------ textures
const graniteTex = () => canvasTex(128, 128, (c, w, h) => { // polished speckled granite, 1 m per repeat
  const r = rng(249);
  c.fillStyle = '#9a9a9a'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) { const v = r() < 0.5 ? 40 + r() * 60 : 170 + r() * 80; c.fillStyle = `rgba(${v | 0},${v | 0},${(v * 1.02) | 0},0.55)`; c.fillRect(r() * w, r() * h, 1 + r() * 1.6, 1 + r() * 1.6); }
});
const slabTex = () => canvasTex(256, 128, (c, w, h) => { // the apron: 1 x 0.5 m slabs in two rows, 2 m x 1 m per repeat
  const r = rng(1980);
  c.fillStyle = '#7d7b77'; c.fillRect(0, 0, w, h);
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const x0 = i * 128 + (j ? 64 : 0), v = 205 + r() * 25;
    for (const xx of [x0, x0 - 256]) { c.fillStyle = `rgb(${v | 0},${(v * 0.99) | 0},${(v * 0.96) | 0})`; c.fillRect(xx + 2, j * 64 + 2, 124, 60); }
  }
  for (let i = 0; i < 2200; i++) { c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'; c.fillRect(r() * w, r() * h, 1, 1); }
});
const jetTex = () => canvasTex(64, 128, (c, w, h) => { // streaks of water, scrolled upward by the shader
  const r = rng(12);
  c.clearRect(0, 0, w, h);
  for (let q = 0; q < 70; q++) { c.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.55})`; c.fillRect(r() * w, r() * h, 1 + r() * 3, 10 + r() * 50); }
  c.fillStyle = 'rgba(235,245,255,0.35)'; c.fillRect(0, 0, w, h);
});
const foamTex = () => canvasTex(128, 128, (c, w, h) => {
  const r = rng(13);
  c.clearRect(0, 0, w, h);
  for (let q = 0; q < 420; q++) {
    const a = r() * TAU, d = Math.sqrt(r()) * w * 0.48;
    c.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.5 * (1 - d / (w * 0.5))})`;
    c.beginPath(); c.arc(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 1.5 + r() * 4, 0, TAU); c.fill();
  }
}, { repeat: false });

// ------------------------------------------------------------------------------------------------ build
export function buildDruzhbaFountain({ group, solids: S, heightAt, paveY = 0.24 }) {
  const g = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 0; };
  const yB = (x, z) => g(x, z) + paveY;                   // the paving's top beside the bowl
  const ring = ccw(FOUNTAIN_RING), inner = offsetRing(ring, -WALL), keep = convexIdx(ring), apron = offsetRing(keep.map((i) => ring[i]), APRON);
  const sh = shieldRing(), tier = sh.ring, tierIn = offsetRing(tier, -TIER_WALL);
  const ground = ring.concat(apron).map(([x, z]) => yB(x, z));
  const yLow = Math.min(...ground) - 0.4, yTopB = Math.max(...ground);
  const yRim = yTopB + RIM_H, yW1 = yRim - FREE, yTier = yRim + TIER_UP, yW2 = yTier - TIER_FREE;
  const B = { stone: new MB(), apron: new MB(), water: new MB() };

  // a wall band along a ring: outer face from the draped foot up to the top, the coping, the inner face down to y1
  const wallRing = (D, R, Rin, foot, top, y1, cFace, cTop) => {
    const n = R.length;
    for (let i = 0; i < n; i++) {
      const a = R[i], b = R[(i + 1) % n], ai = Rin[i], bi = Rin[(i + 1) % n];
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, N = [dz / L, 0, -dx / L]; // outward (ccw)
      const ex = bi[0] - ai[0], ez = bi[1] - ai[1], Li = Math.hypot(ex, ez) || 1;
      D.setColor(cFace);
      D.face([[a[0], foot(a), a[1]], [b[0], foot(b), b[1]], [b[0], top, b[1]], [a[0], top, a[1]]], N);
      D.face([[ai[0], y1, ai[1]], [bi[0], y1, bi[1]], [bi[0], top, bi[1]], [ai[0], top, ai[1]]], [-ez / Li, 0, ex / Li]);
      D.setColor(cTop);
      D.face([[a[0], top, a[1]], [b[0], top, b[1]], [bi[0], top, bi[1]], [ai[0], top, ai[1]]], [0, 1, 0]);
    }
  };
  wallRing(B.stone, ring, inner, ([x, z]) => yB(x, z) - 0.15, yRim, yW1 - 0.05, GRANITE, COPE);
  wallRing(B.stone, tier, tierIn, () => yW1 - 0.1, yTier, yW2 - 0.05, TIER, COPE);

  // the apron: pale granite slabs from the wall foot out, draped a hair over the square's paving (uv: the map grid, as
  // the slabs run along the apex's legs); each apron edge fans from its far vertex onto the wall vertices it spans
  {
    const A = B.apron.setColor(SLAB), n = ring.length, m = apron.length;
    const xz = [], vx = (p) => { xz.push(p); return A.vert(p[0], yB(p[0], p[1]) + 0.035, p[1], 0, 1, 0, p[0] / 2, p[1]); };
    const base = A.v, up = (a, b, c) => { // keep every triangle facing up (MB.fill's rule)
      const [P, Q, R] = [a, b, c].map((k) => xz[k - base]);
      (Q[0] - P[0]) * (R[1] - P[1]) - (Q[1] - P[1]) * (R[0] - P[0]) < 0 ? A.tri(a, b, c) : A.tri(a, c, b);
    };
    const vi = ring.map(vx), vo = apron.map(vx);
    for (let k = 0; k < m; k++) {
      const i0 = keep[k], i1 = keep[(k + 1) % m], o0 = vo[k], o1 = vo[(k + 1) % m];
      up(o1, o0, vi[i0]);
      for (let i = i0; i !== i1; i = (i + 1) % n) up(o1, vi[i], vi[(i + 1) % n]);
    }
  }

  // the water: the lower pool round the shield, and the shield's pool
  B.water.setColor('#ffffff');
  B.water.fill(inner, [tier], yW1, true);
  B.water.fill(tierIn, [], yW2, true);

  // ---- colliders: the bowl wall stops a car (0.74 m or more over the ground), from the water it can hop out (pool floor
  // 0.47 under the rim); the shield's wall the same from its own floor
  S.prism(ring, yLow, yRim, 0, 0, 'wall', 0, [inner]);
  S.prism(inner, yLow, yW1 - FLOOR, 0, 0, 'fountain');
  S.prism(tier, yLow, yTier, 0, 0, 'wall', 0, [tierIn]);
  S.prism(tierIn, yLow, yW2 - FLOOR, 0, 0, 'fountain');

  // ---- the jets: tubes with their base point and a phase / mode, shaped by the shader; uv in metres along them
  const jets = { pos: [], uv: [], jet: [], mode: [], idx: [] }, foams = [];
  const tube = (base, h, rad, phase, mode, seg = 6, lean = [0, 0]) => {
    const first = jets.pos.length / 3, ts = [0, 0.3, 0.6, 0.82, 0.95, 1], rs = [rad, rad * 1.1, rad * 1.3, rad * 1.8, rad * 2.3, rad * 1.1];
    ts.forEach((t, k) => {
      const x = base[0] + lean[0] * t, z = base[2] + lean[1] * t, y = base[1] + h * t;
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * TAU;
        jets.pos.push(x + Math.cos(a) * rs[k], y, z + Math.sin(a) * rs[k]);
        jets.uv.push(i / seg, -h * t / 1.6); jets.jet.push(base[0], base[1], base[2], phase); jets.mode.push(mode);
      }
    });
    for (let k = 1; k < ts.length; k++) for (let i = 0; i < seg; i++) {
      const a = first + (k - 1) * (seg + 1) + i, b = a + seg + 1;
      jets.idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
    foams.push([base[0], base[1], base[2], 0.25 + 0.12 * h]);
  };
  // toward the inside of the shield from a point on its outline, by d
  const inward = (p, d) => { const dx = sh.ctr[0] - p[0], dz = sh.ctr[1] - p[1], L = Math.hypot(dx, dz); return [p[0] + dx / L * d, p[1] + dz / L * d]; };
  const outward = (p, d) => inward(p, -d);
  let nJets = 0;
  // the arc row: three rising crests toward the column (the night photo's saw-tooth), a wave running along it
  for (let i = 0; i < 33; i++) {
    const p = inward(sh.arc(0.04 + 0.92 * i / 32), 0.7), s = (i % 11) / 10;
    tube([p[0], yW2, p[1]], 0.6 + 1.8 * s, 0.026, i * 0.25, 1, 5); nJets++;
  }
  // the middle row, across the shield where the satellite view shows a line: highest in its middle
  {
    const a = [-10.1, 1092.8], b = [-4.2, 1097.4];
    for (let i = 0; i < 13; i++) {
      const p = lerp2(a, b, 0.04 + 0.92 * i / 12);
      if (!inPoly(tierIn, p[0], p[1])) continue;
      tube([p[0], yW2, p[1]], 0.6 + 1.0 * (1 - Math.abs(i - 6) / 6), 0.026, 9 - i * 0.45, 1, 5); nJets++;
    }
  }
  // the centre: a tall column and a crown of six round it
  tube([SH.C[0], yW2, SH.C[1]], 3.8, 0.08, 0, 0, 8); nJets++;
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * TAU, x = SH.C[0] + Math.cos(a) * 0.65, z = SH.C[1] + Math.sin(a) * 0.65;
    tube([x, yW2, z], 2.1, 0.035, k * 1.05, 0, 6, [Math.cos(a) * 0.25, Math.sin(a) * 0.25]); nJets++;
  }
  // the lower pool: small jets along the shield's two sides, just off its wall
  for (const side of [sh.right, sh.left]) for (let i = 0; i < 18; i++) {
    const p = outward(side(0.05 + 0.9 * i / 17), 0.65);
    if (!inPoly(inner, p[0], p[1])) continue;
    tube([p[0], yW1, p[1]], 0.4 + 0.45 * ((i * 5) % 7) / 6, 0.022, i * 0.5, 2, 5); nJets++;
  }

  // ---- meshes
  const granite = graniteTex(), slab = slabTex(), jetMap = jetTex(), foam = foamTex();
  slab.repeat.set(1, 1);
  const M = {
    stone: new THREE.MeshStandardMaterial({ map: granite, vertexColors: true, roughness: 0.32, metalness: 0.05 }),
    apron: decal(new THREE.MeshStandardMaterial({ map: slab, vertexColors: true, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -3 })),
    water: new THREE.MeshStandardMaterial({ color: 0x2a4743, roughness: 0.14, metalness: 0.1, envMapIntensity: 0.6, emissive: 0x000000 }),
  };
  let nV = 0;
  for (const [k, D] of Object.entries(B)) {
    if (!D.v) continue;
    nV += D.v;
    group.add(Object.assign(new THREE.Mesh(D.build(), M[k]), { name: 'druzhba-fountain-' + k, castShadow: k === 'stone', receiveShadow: true }));
  }
  const jg = new THREE.BufferGeometry();
  jg.setAttribute('position', new THREE.Float32BufferAttribute(jets.pos, 3));
  jg.setAttribute('uv', new THREE.Float32BufferAttribute(jets.uv, 2));
  jg.setAttribute('aJet', new THREE.Float32BufferAttribute(jets.jet, 4));
  jg.setAttribute('aMode', new THREE.Float32BufferAttribute(jets.mode, 1));
  jg.setIndex(jets.idx);
  jg.computeBoundingSphere(); jg.boundingSphere.radius += 1; // the shader stretches the jets at most to full height
  const jetMat = new THREE.MeshBasicMaterial({ map: jetMap, color: 0xeef6fb, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  const U = { uTime: { value: 0 }, uNight: { value: 0 } };
  // the light-dynamic program: mode 1 rows run a wave along them, mode 2 the low jets ripple, mode 0 the centre
  // pulses; every 24 s the program swings between the waves and all-up. At night each jet takes a slowly cycling hue.
  jetMat.onBeforeCompile = (shd) => {
    Object.assign(shd.uniforms, U);
    shd.vertexShader = shd.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aJet;\nattribute float aMode;\nuniform float uTime;\nvarying float vHue;')
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
      float wv = 0.5 + 0.5 * sin(uTime * 1.25 - aJet.w);
      float prog = smoothstep(-0.3, 0.3, sin(uTime * 0.26));
      float jk = aMode < 0.5 ? 0.86 + 0.1 * sin(uTime * 1.9 + aJet.w) + 0.04 * sin(uTime * 5.7 + aJet.w * 2.3)
        : aMode < 1.5 ? mix(0.92 + 0.05 * sin(uTime * 3.1 + aJet.w), 0.3 + 0.7 * wv * wv, prog)
        : 0.75 + 0.25 * sin(uTime * 2.3 + aJet.w);
      transformed = aJet.xyz + (transformed - aJet.xyz) * vec3(1.0, jk, 1.0);
      vHue = fract(uTime * 0.035 + aJet.w * 0.05 + aMode * 0.33);`);
    shd.fragmentShader = shd.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vHue;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      vec3 hc = clamp(abs(mod(vHue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      diffuseColor.rgb *= mix(vec3(1.0), hc * 2.4 + 0.25, uNight);`);
  };
  jetMat.customProgramCacheKey = () => 'druzhba-jets';
  group.add(Object.assign(new THREE.Mesh(jg, jetMat), { name: 'druzhba-fountain-jets', renderOrder: 2 }));
  nV += jets.pos.length / 3;
  const fb = new MB();
  for (const [x, y, z, s] of foams) {
    const i0 = fb.vert(x - s, y + 0.015, z - s, 0, 1, 0, 0, 0), i1 = fb.vert(x + s, y + 0.015, z - s, 0, 1, 0, 1, 0);
    const i2 = fb.vert(x + s, y + 0.015, z + s, 0, 1, 0, 1, 1), i3 = fb.vert(x - s, y + 0.015, z + s, 0, 1, 0, 0, 1);
    fb.quad(i0, i3, i2, i1);
  }
  const foamMat = new THREE.MeshBasicMaterial({ map: foam, transparent: true, depthWrite: false, opacity: 0.8 });
  group.add(Object.assign(new THREE.Mesh(fb.build(), foamMat), { name: 'druzhba-fountain-foam', renderOrder: 1 }));
  nV += fb.v;

  const covers = (x, z) => inPoly(apron, x, z) || inPoly(ring, x, z);
  const glow = new THREE.Color();
  return {
    ring, apron, tier, covers,
    levels: { rim: yRim, water: yW1, tier: yTier, tierWater: yW2, low: yLow, paving: yTopB },
    stats: { verts: nV, jets: nJets, meshes: 5 },
    update(dt) {
      void dt;
      const t = (Date.now() / 1000) % 3600; // the wall clock: everyone sees the same program
      U.uTime.value = t;
      jetMap.offset.y = (t * -1.6) % 1;
      foamMat.opacity = 0.7 + 0.15 * Math.sin(t * 5.3);
      const k = nightK.value;
      U.uNight.value = k;
      // the underwater lights: a faint tint on the water, the foam at the jets' feet lit in the same hue
      glow.setHSL((t * 0.035) % 1, 0.75, 0.5); M.water.emissive.copy(glow).multiplyScalar(0.025 * k);
      foamMat.color.setRGB(1, 1, 1).lerp(glow, 0.8 * k).multiplyScalar(1 + 1.5 * k);
    },
  };
}
