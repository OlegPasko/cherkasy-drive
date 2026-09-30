// Pigeon flocks on squares and broad pavements: peck and shuffle on the ground, lift off and circle when startled,
// settle again after a calm spell. One instanced draw call; wings flap and heads peck in the vertex shader.
//   createFlocks({ scene, groundY(x, z) -> y, maxBirds = 600 }) -> {
//     addCell(key, sites[{ x, z, n, seed }]), removeCell(key), startle(x, z, r), threat(x, y, z, r),
//     update(dt, camera, frustum), stats() -> { flocks, birds, flying, drawn }, dispose() }
import * as THREE from 'three';
import { Geo, patchInstanced } from './body.js';
import { rng } from './rng.js';
import { cue } from '../../audio/cue.js';

const VIEW = 130, CALM = 7, TINTS = [[0.42, 0.45, 0.5], [0.3, 0.31, 0.35], [0.62, 0.62, 0.64], [0.45, 0.38, 0.33], [0.5, 0.52, 0.56]];

function pigeonGeometry() {
  const G = new Geo();
  G.set(0, 0).box(-0.055, 0.06, -0.09, 0.055, 0.16, 0.1).box(-0.045, 0.08, 0.1, 0.045, 0.165, 0.14).box(-0.04, 0.1, -0.21, 0.04, 0.12, -0.09);
  G.set(3, 2).box(-0.03, 0.15, 0.1, 0.03, 0.215, 0.165);
  G.set(3, 3).box(-0.008, 0.18, 0.165, 0.008, 0.192, 0.19);
  G.set(0, 3).box(0.018, 0, 0, 0.028, 0.065, 0.012).box(-0.028, 0, 0, -0.018, 0.065, 0.012);
  G.set(1, 1).box(0.05, 0.135, -0.1, 0.3, 0.147, 0.08);
  G.set(2, 1).box(-0.3, 0.135, -0.1, -0.05, 0.147, 0.08);
  return G.geometry();
}

const HEAD = /* glsl */`
attribute float aBone; attribute float aSlot;
attribute vec4 iA; attribute vec4 iP;
varying vec3 vPplCol;
vec3 pplP; vec3 pplN;
void rX(inout vec3 p, inout vec3 n, vec3 o, float a) { float c = cos(a), s = sin(a); vec3 q = p - o; p = o + vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c); n = vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c); }
void rY(inout vec3 p, inout vec3 n, vec3 o, float a) { float c = cos(a), s = sin(a); vec3 q = p - o; p = o + vec3(q.x * c + q.z * s, q.y, -q.x * s + q.z * c); n = vec3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c); }
void rZ(inout vec3 p, inout vec3 n, vec3 o, float a) { float c = cos(a), s = sin(a); vec3 q = p - o; p = o + vec3(q.x * c - q.y * s, q.x * s + q.y * c, q.z); n = vec3(n.x * c - n.y * s, n.x * s + n.y * c, n.z); }
void pplRun() {
  vec3 p = position, n = normal;
  float fly = iP.y, tint = iP.w;
  vec3 base = mix(vec3(0.42, 0.45, 0.5), vec3(0.3, 0.31, 0.35), step(0.5, tint));
  base = mix(base, vec3(0.62, 0.62, 0.64), step(0.85, tint)) * (0.9 + 0.2 * fract(tint * 7.));
  vPplCol = aSlot < 0.5 ? base : aSlot < 1.5 ? base * 0.8 : aSlot < 2.5 ? vec3(0.16, 0.2, 0.19) : vec3(0.35, 0.18, 0.18);
  if (aBone > 0.5 && aBone < 2.5) {
    float sd = aBone < 1.5 ? 1. : -1.;
    p.x = sd * (0.05 + (abs(p.x) - 0.05) * mix(0.28, 1., fly));
    rZ(p, n, vec3(sd * 0.05, 0.14, 0.), sd * fly * (0.25 + 0.95 * sin(iP.x * 6.2831853)));
  }
  if (aBone > 2.5) rX(p, n, vec3(0., 0.15, 0.1), iP.z * 1.1);
  if (aSlot > 2.5 && aBone < 0.5) p.y = mix(p.y, 0.06, fly); // tuck the legs in flight
  rX(p, n, vec3(0., 0.06, 0.), iP.z * 0.25);
  rY(p, n, vec3(0.), iA.w);
  pplP = p + iA.xyz; pplN = n;
}
`;

export function createFlocks({ scene, groundY, maxBirds = 600 }) {
  const geo = pigeonGeometry();
  const aA = new THREE.InstancedBufferAttribute(new Float32Array(maxBirds * 4), 4), aP = new THREE.InstancedBufferAttribute(new Float32Array(maxBirds * 4), 4);
  aA.setUsage(THREE.DynamicDrawUsage); aP.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iA', aA); geo.setAttribute('iP', aP); geo.instanceCount = 0;
  const mat = patchInstanced(new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }), { head: HEAD, key: 'ppl-bird', frag: { head: 'varying vec3 vPplCol;', color: 'diffuseColor.rgb *= vPplCol;' } });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.name = 'pigeons'; mesh.receiveShadow = true;
  scene.add(mesh);
  const cells = new Map(), flocks = [];
  const sph = new THREE.Sphere();
  let time = 0, drawn = 0, total = 0;

  function makeFlock(s) {
    const r = rng(s.seed), n = s.n, gy = groundY(s.x, s.z);
    const f = { x: s.x, z: s.z, gy, state: 0, calm: 0, a0: r() * 6.283, R: 7 + r() * 7, H: 5 + r() * 6, w: (r() < 0.5 ? 1 : -1) * (0.55 + r() * 0.3), birds: [] };
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * 1.4, hx = s.x + Math.cos(a) * d, hz = s.z + Math.sin(a) * d;
      f.birds.push({ hx, hz, x: hx, z: hz, y: gy, ry: r() * 6.283, gry: 0, tint: r(), ph: r(), peck: 0, pt: r() * 3, u: 0, delay: 0, da: (r() - 0.5) * 1.2, dr: (r() - 0.5) * 3, dh: (r() - 0.5) * 2, tx: hx, tz: hz });
    }
    f.birds.forEach(b => { b.gry = b.ry; });
    return f;
  }
  const scare = (f) => {
    f.calm = 0;
    if (f.state === 1) return;
    f.state = 1; cue('birds', { x: f.x, y: f.gy, z: f.z });
    f.a0 = Math.atan2(f.birds[0].z - f.z, f.birds[0].x - f.x);
    for (const b of f.birds) b.delay = Math.random() * 0.45;
  };

  return {
    addCell(key, sites) {
      if (cells.has(key)) return;
      const L = sites.map(makeFlock); cells.set(key, L); flocks.push(...L);
      total += L.reduce((s, f) => s + f.birds.length, 0);
    },
    removeCell(key) {
      const L = cells.get(key); if (!L) return;
      cells.delete(key);
      for (const f of L) { const i = flocks.indexOf(f); if (i >= 0) flocks.splice(i, 1); total -= f.birds.length; }
    },
    startle(x, z, r) { for (const f of flocks) if ((f.x - x) ** 2 + (f.z - z) ** 2 < (r + f.R * 0.3) ** 2) scare(f); },
    // a vehicle at (x, y, z): only a low pass close to the flock counts
    threat(x, y, z, r) { for (const f of flocks) if (y - f.gy < 7 && (f.x - x) ** 2 + (f.z - z) ** 2 < r * r) scare(f); },
    update(dt, camera, frustum) {
      time += dt;
      const cx = camera.position.x, cz = camera.position.z, A = aA.array, P = aP.array;
      let n = 0;
      for (const f of flocks) {
        const dc = Math.hypot(f.x - cx, f.z - cz);
        if (dc > 220) continue;
        if (f.state === 1 && (f.calm += dt) > CALM) f.state = 0;
        for (const b of f.birds) {
          if (f.state === 1) { if ((b.delay -= dt) <= 0) b.u = Math.min(1, b.u + dt * 0.8); }
          else b.u = Math.max(0, b.u - dt * 0.35);
          if (b.u > 0) {
            const a = f.a0 + f.w * (time + b.da), R = f.R + b.dr, k = b.u * b.u * (3 - 2 * b.u);
            const fx = f.x + Math.cos(a) * R, fz = f.z + Math.sin(a) * R, fy = f.gy + f.H + b.dh + Math.sin(time * 0.7 + b.da * 3) * 0.6;
            b.x = b.hx + (fx - b.hx) * k; b.z = b.hz + (fz - b.hz) * k; b.y = f.gy + (fy - f.gy) * k;
            if (k > 0.25) b.ry = Math.atan2(-Math.sin(a) * f.w, Math.cos(a) * f.w);
            b.ph += dt * (b.u < 0.6 || f.state === 0 ? 4.5 : 2.2 + Math.sin(time + b.da) * 1.6);
            b.peck = 0;
            if (b.u === 0) { b.x = b.hx; b.z = b.hz; b.y = f.gy; }
          } else if (dc < VIEW) { // on the ground: peck, turn, shuffle a little
            if ((b.pt -= dt) <= 0) {
              const u = Math.random();
              if (u < 0.5) b.pt = 0.5 + Math.random() * 1.2, b.peckOn = 1;
              else if (u < 0.8) { b.gry = b.ry + (Math.random() - 0.5) * 2.5; b.pt = 0.6 + Math.random(); b.peckOn = 0; }
              else { const a = Math.random() * 6.283; b.tx = Math.min(Math.max(b.x + Math.cos(a) * 0.6, f.x - 1.6), f.x + 1.6); b.tz = Math.min(Math.max(b.z + Math.sin(a) * 0.6, f.z - 1.6), f.z + 1.6); b.gry = Math.atan2(b.tx - b.x, b.tz - b.z); b.pt = 1.5; b.peckOn = 0; }
            }
            const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
            if (d > 0.02) { const s = Math.min(d, dt * 0.35); b.x += dx / d * s; b.z += dz / d * s; b.hx = b.x; b.hz = b.z; }
            let dr = b.gry - b.ry; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); b.ry += dr * Math.min(1, dt * 6);
            b.peck = b.peckOn ? Math.max(0, Math.sin(time * 9 + b.tint * 20)) : Math.max(0, b.peck - dt * 4);
          }
          if (dc > VIEW || n >= maxBirds) continue;
          sph.center.set(b.x, b.y + 0.1, b.z); sph.radius = 0.4;
          if (frustum && !frustum.intersectsSphere(sph)) continue;
          const o = n * 4;
          A[o] = b.x; A[o + 1] = b.y; A[o + 2] = b.z; A[o + 3] = b.ry;
          P[o] = b.ph; P[o + 1] = Math.min(1, b.u * 5); P[o + 2] = b.peck; P[o + 3] = b.tint;
          n++;
        }
      }
      drawn = n; geo.instanceCount = n; mesh.visible = n > 0;
      if (n) for (const a of [aA, aP]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * 4); a.needsUpdate = true; }
    },
    stats: () => ({ flocks: flocks.length, birds: total, flying: flocks.filter(f => f.state === 1).length, drawn }),
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}
