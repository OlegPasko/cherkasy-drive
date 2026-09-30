// Debris and gibs (Oleg's original car-mode gibs). Carmageddon-style pedestrian hits: the
// person is replaced by low-poly chunks (head, hair / hat, torso, pelvis, arms, legs in their outfit colours + blood
// bits) thrown with the vehicle's momentum, bouncing and tumbling on the ground, and dark blood splats where they were
// hit and where the big chunks land. Also the generic debris of the car mode: body panels / glass / plastic off rammed
// cars, twigs and leaves off broken trees (shards(): flat plates that come to rest lying down and stay a while).
//   createGibs(scene, groundY(x, z, y) -> y, { blood = false }) -> { burst(x, y, z, vx, vy, vz, cols, skin, opts), shards(...), update(dt), stats() }
//     blood: red droplets and splats on hits (off by default; the city turns it on with ?blood). Without it a hit
//     only throws the body chunks.
//     cols: [top, bottom, outer | null] linear rgb triplets (people.js passes the look's gib colours)
//     opts (optional): { hair: rgb (hair or hat colour of the head top), scale: body height scale (1 = 1.75 m) }
import * as THREE from 'three';

const MAXC = 1400, MAXD = 220;
const LIFE = 45, DLIFE = 70, FADE = 2.5;
const GRAV = 18;
const BLOOD = [0.22, 0.004, 0.008], BLOOD2 = [0.12, 0.002, 0.004];

function splatTexture() {
  const cnv = Object.assign(document.createElement('canvas'), { width: 128, height: 128 }), ctx = cnv.getContext('2d');
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  ctx.fillStyle = '#fff';
  // a round pool, a ring of lobes around it and a spray of droplets further out (radii as fractions of the canvas)
  const dot = (ang, dist, rad) => { ctx.beginPath(); ctx.arc(64 + 128 * dist * Math.cos(ang), 64 + 128 * dist * Math.sin(ang), 128 * rad, 0, 2 * Math.PI); ctx.fill(); };
  dot(0, 0, 0.24);
  for (let lobes = 26; lobes-- > 0;) dot(r() * 6.283, 0.12 + r() * 0.2, 0.03 + r() * 0.09);
  for (let drops = 40; drops-- > 0;) dot(r() * 6.283, 0.3 + r() * 0.18, 0.006 + r() * 0.02);
  return Object.assign(new THREE.CanvasTexture(cnv), { colorSpace: THREE.NoColorSpace, anisotropy: 4 });
}

// body chunks of the 1.75 m people template: [x, y, z, sx, sy, sz, colour key]
const PARTS = [
  [0, 1.62, 0, 0.17, 0.2, 0.19, 'skin'], [0, 1.73, -0.01, 0.18, 0.07, 0.2, 'hair'], [0, 1.24, 0, 0.36, 0.44, 0.22, 'outer'],
  [0, 0.93, 0, 0.32, 0.18, 0.21, 'bottom'], [0.21, 1.18, 0, 0.09, 0.5, 0.09, 'outer'], [-0.21, 1.18, 0, 0.09, 0.5, 0.09, 'outer'],
  [0.1, 0.46, 0, 0.12, 0.62, 0.12, 'legs'], [-0.1, 0.46, 0, 0.12, 0.62, 0.12, 'legs'],
];

export function createGibs(scene, groundY, { blood = false } = {}) {
  const chunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ metalness: 0, roughness: 0.7 }), MAXC);
  chunks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3 * MAXC), 3).setUsage(THREE.DynamicDrawUsage);
  chunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  Object.assign(chunks, { count: 0, frustumCulled: false, castShadow: true, receiveShadow: true, name: 'gibs' });
  const bloodMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...BLOOD), alphaMap: splatTexture(), metalness: 0, roughness: 0.18,
    depthWrite: false, transparent: true, polygonOffset: true, polygonOffsetUnits: -4, polygonOffsetFactor: -2 });
  const decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), bloodMat, MAXD);
  decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  Object.assign(decals, { count: 0, frustumCulled: false, receiveShadow: true, renderOrder: 1, name: 'gib-decals' });
  scene.add(chunks, decals);

  const P = [], D = [];
  const dummy = new THREE.Object3D();
  let time = 0, n = 0;

  const splat = (x, z, s) => {
    if (!blood) return;
    if (D.length >= MAXD) D.shift();
    D.push({ x, y: groundY(x, z, 1e4) + 0.02, z, s, rot: Math.random() * 6.283, t: time });
  };
  const add = (x, y, z, sx, sy, sz, col, vx, vy, vz, spread, bleed, life = LIFE) => {
    if (P.length >= MAXC) P.shift();
    P.push({ x, y, z, sx, sy, sz, col, rest: 0, t: time, bleed, landed: false, life,
      vx: vx + (Math.random() - 0.5) * spread, vy: vy + Math.random() * spread * 0.6, vz: vz + (Math.random() - 0.5) * spread,
      rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6, wx: (Math.random() - 0.5) * 22, wy: (Math.random() - 0.5) * 16, wz: (Math.random() - 0.5) * 22 });
  };

  const api = {
    // a person at feet (x, y, z) hit with velocity (vx, vy, vz)
    burst(x, y, z, vx, vy, vz, cols, skin = [0.62, 0.38, 0.27], opts = {}) {
      n++;
      const sp = Math.hypot(vx, vz), k = Math.min(1.35, 0.85 + sp / 80), sc = opts.scale || 1;
      const bx = vx * k, bz = vz * k, by = Math.max(vy, 0) + 3 + sp * 0.12;
      const [top, bot, outer] = cols;
      const C = { skin, hair: opts.hair || skin, outer: outer || top, bottom: bot, legs: opts.legs || bot };
      for (const [ox, oy, oz, sx, sy, sz, key] of PARTS) add(x + ox * sc, y + oy * sc, z + oz * sc, sx * sc, sy * sc, sz * sc, C[key], bx, by, bz, 7, 1);
      if (blood) for (let drop = 16; drop-- > 0;) { const e = sc * (0.04 + 0.1 * Math.random()); add(x, y + sc * (0.6 + 1.1 * Math.random()), z, e, e * (0.6 + Math.random()), e, drop % 2 ? BLOOD : BLOOD2, 0.9 * bx, 0.8 * by, 0.9 * bz, 10, 0); }
      splat(x, z, (1.8 + Math.random() * 1.2) * sc);
      const d = Math.hypot(bx, bz) || 1; // a smear along the throw
      for (let i = 1; i <= 3; i++) splat(x + bx / d * i * 1.4, z + bz / d * i * 1.4, 0.8 + Math.random() * 0.7);
    },
    // n flat pieces (plates: sx x sy x sz with sy thin) in colours cols[], thrown from (x, y, z) with (vx, vy, vz)
    shards(x, y, z, vx, vy, vz, n, cols, smin = 0.08, smax = 0.4, spread = 5, flat = 0.15, life = 90) {
      for (let left = n; left-- > 0;) {
        const a = smin + (smax - smin) * Math.random(), b = a * (0.4 + 0.8 * Math.random());
        add(x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.6, a, Math.max(0.012, a * flat * Math.random()), b,
          cols[Math.floor(Math.random() * cols.length)], vx, vy, vz, spread, 0, life * (0.8 + Math.random() * 0.4));
      }
    },
    update(dt) {
      if (!(dt > 0)) return;
      dt = Math.min(dt, 0.05); time += dt;
      let k = 0;
      for (const p of P) {
        const age = time - p.t;
        if (age > p.life + FADE) continue;
        if (p.rest < 0.6) {
          p.vy -= GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
          const h = Math.min(p.sx, p.sy, p.sz) / 2, g = groundY(p.x, p.z, p.y + 0.5) + h;
          if (p.y < g) {
            p.y = g;
            if (!p.landed && p.bleed && Math.hypot(p.vx, p.vy, p.vz) > 4) splat(p.x, p.z, 0.5 + Math.random() * 0.6);
            p.landed = true;
            p.vy = p.vy < -2 ? -p.vy * 0.3 : 0;
            const f = Math.exp(-5 * dt); p.vx *= f; p.vz *= f; p.wx *= f; p.wy *= f; p.wz *= f;
            // come to rest lying down: the thin axis (plates) or the long axis (limbs) never stays upright
            const PI = Math.PI, tall = p.sy > 1.2 * Math.max(p.sx, p.sz);
            const tx = tall ? Math.round((p.rx - PI / 2) / PI) * PI + PI / 2 : Math.round(p.rx / PI) * PI, tz = Math.round(p.rz / PI) * PI;
            p.rx += (tx - p.rx) * Math.min(1, dt * 4); p.rz += (tz - p.rz) * Math.min(1, dt * 4);
            if (Math.hypot(p.vx, p.vy, p.vz) < 0.3) { p.rest += dt; if (p.rest >= 0.6) { p.rx = tx; p.rz = tz; } } else p.rest = 0;
          }
        }
        P[k++] = p;
      }
      P.length = k;
      let c = 0;
      const col = chunks.instanceColor.array;
      for (const p of P) {
        const age = time - p.t, f = age > p.life ? Math.max(0.001, 1 - (age - p.life) / FADE) : 1;
        dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.rx, p.ry, p.rz); dummy.scale.set(p.sx * f, p.sy * f, p.sz * f);
        dummy.updateMatrix(); chunks.setMatrixAt(c, dummy.matrix);
        col[c * 3] = p.col[0]; col[c * 3 + 1] = p.col[1]; col[c * 3 + 2] = p.col[2];
        c++;
      }
      chunks.count = c; chunks.visible = c > 0;
      if (c) { chunks.instanceMatrix.needsUpdate = true; chunks.instanceColor.needsUpdate = true; }
      k = 0;
      for (let i = 0; i < D.length; i++) if (time - D[i].t < DLIFE + FADE) D[k++] = D[i];
      D.length = k;
      for (let i = 0; i < D.length; i++) {
        const d = D[i], age = time - d.t, grow = Math.min(1, 0.35 + age * 2.5), f = age > DLIFE ? Math.max(0.001, 1 - (age - DLIFE) / FADE) : 1;
        dummy.position.set(d.x, d.y, d.z); dummy.rotation.set(0, d.rot, 0); dummy.scale.setScalar(d.s * grow * f);
        dummy.updateMatrix(); decals.setMatrixAt(i, dummy.matrix);
      }
      decals.count = D.length; decals.visible = D.length > 0;
      if (D.length) decals.instanceMatrix.needsUpdate = true;
    },
    stats: () => ({ hits: n, chunks: P.length, splats: D.length }),
  };
  return api;
}
