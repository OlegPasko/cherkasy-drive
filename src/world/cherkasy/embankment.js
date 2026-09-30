// OWNER: cherkasy. The Mytnytsia embankment: the ~800 m concrete retaining wall north of the river port (OSM way
// 868844722) with the promenade on top. The wall is snapped to the water's edge and gets a granite coping, a black steel
// railing, classic twin-lantern lamp posts (lit at night), benches with litter bins facing the water, and a few side
// stairs down to the water. Collision: wall + coping prisms, railing zips, lamp poles, benches.
//   buildEmbankment({ root, solids, zips, heightAt, ground, geo }) -> { update(dt), clear(x, z) }
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { area2 } from './geo.js';
import { QUAY } from './embankment_data.js';

const PI = Math.PI, WATER_Y = -1.6;
const C = { wall: 0x8f8c84, wallD: 0x6c6962, granite: 0xb7aca3, rail: 0x1d1f21, pole: 0x22282a, wood: 0x8a6440, bin: 0x2f4a3a };
const rotZ = (a) => new THREE.Matrix4().makeRotationZ(a);

export function buildEmbankment({ root, solids: S, zips: Z, heightAt, ground, geo }) {
  const t0 = performance.now(), s0 = S.count;
  const gh = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 0; };
  const isWater = (x, z) => ground?.isWater?.(x, z) ?? false;
  const group = Object.assign(new THREE.Group(), { name: 'embankment' });
  root.add(group);
  let nV = 0;
  const add = (mb, mat, name, shadow = true) => {
    const mesh = Object.assign(new THREE.Mesh(mb.build(), mat), { name: `embankment-${name}`, castShadow: shadow, receiveShadow: true });
    nV += mb.v;
    group.add(mesh);
    return mesh;
  };

  // ---------------------------------------------------------------------------------------------- the edge line
  const lerp2 = (p, q, f) => { const g = 1 - f; return [g * p[0] + f * q[0], g * p[1] + f * q[1]]; };
  let P = QUAY.map(([lat, lon]) => geo.toXZ(lat, lon));
  for (let round = 0; round < 2; round++) { // two rounds of Chaikin corner cutting (ends kept)
    const cut = P.slice(1).flatMap((b, i) => [lerp2(P[i], b, 0.25), lerp2(P[i], b, 0.75)]);
    P = [P[0], ...cut, P[P.length - 1]];
  }
  const pts = []; // resampled every 1 m
  for (let i = 1; i < P.length; i++) { const seg = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); for (let d = 0; d < seg; d++) pts.push(lerp2(P[i - 1], P[i], d / seg)); }
  pts.push(P[P.length - 1]);
  const N = pts.length, at = (i) => pts[Math.min(N - 1, Math.max(0, i))];
  const tan = pts.map((_, i) => { const d = [at(i + 2)[0] - at(i - 2)[0], at(i + 2)[1] - at(i - 2)[1]], l = Math.hypot(...d) || 1; return d.map((v) => v / l); }); // central difference over 4 m
  // which side is the water: vote along the line, 8 m out on either side
  let vote = 0;
  pts.forEach(([x, z], i) => { if (i % 10) return; const ox = 8 * tan[i][1], oz = -8 * tan[i][0]; if (isWater(x + ox, z + oz)) vote++; if (isWater(x - ox, z - oz)) vote--; });
  const sg = vote < 0 ? -1 : 1, nrm = tan.map(([tx, tz]) => [sg * tz, -sg * tx]); // unit normal towards the water
  // snap to the water's edge: first water along the normal, minus a little
  const firstWet = ([x, z], [nx, nz]) => { for (let d = -3; d <= 8; d += 0.5) if (isWater(x + nx * d, z + nz * d)) return d - 0.4; return 0; };
  const off = smooth(pts.map((p, i) => firstWet(p, nrm[i])), 6, 3);
  const E = pts.map(([x, z], i) => [x + off[i] * nrm[i][0], z + off[i] * nrm[i][1]]);
  const top = smooth(E.map(([x, z], i) => Math.max(WATER_Y + 1.1, gh(x - 2.5 * nrm[i][0], z - 2.5 * nrm[i][1]) + 0.12)), 8, 3);

  // ---------------------------------------------------------------------------------------------- wall, coping
  const [F, M, glow] = [0, 0, 0].map(() => new MB());
  const BOT = WATER_Y - 1.0, CW = 0.5;
  for (let i = 0; i + 1 < N; i++) {
    const [ax, az] = E[i], [bx, bz] = E[i + 1], [anx, anz] = nrm[i], [bnx, bnz] = nrm[i + 1], ya = top[i], yb = top[i + 1];
    F.setColor((Math.floor(i / 6) % 2) ? C.wall : C.wallD); // cast panels
    F.face([[ax, ya, az], [bx, yb, bz], [bx, BOT, bz], [ax, BOT, az]], [anx, 0, anz]);
    // coping: 6 cm lip over the water face, CW m back onto the promenade
    const A = (k, y) => [ax + anx * k, y, az + anz * k], Bp = (k, y) => [bx + bnx * k, y, bz + bnz * k];
    F.setColor(C.granite);
    F.face([A(0.06, ya + 0.12), Bp(0.06, yb + 0.12), Bp(-CW, yb + 0.12), A(-CW, ya + 0.12)], [0, 1, 0]);
    F.face([A(0.06, ya + 0.12), Bp(0.06, yb + 0.12), Bp(0.06, yb - 0.1), A(0.06, ya - 0.1)], [anx, 0, anz]);
    const ia = A(-CW, 0), ib = Bp(-CW, 0);
    F.face([[ia[0], ya + 0.12, ia[2]], [ib[0], yb + 0.12, ib[2]], [ib[0], Math.min(yb, gh(ib[0], ib[2])) - 0.3, ib[2]], [ia[0], Math.min(ya, gh(ia[0], ia[2])) - 0.3, ia[2]]], [-anx, 0, -anz]);
    if (i % 3 === 0) { const j = Math.min(N - 1, i + 3), Q = [[E[i][0] + anx * 0.06, E[i][1] + anz * 0.06], [E[j][0] + nrm[j][0] * 0.06, E[j][1] + nrm[j][1] * 0.06], [E[j][0] - nrm[j][0] * CW, E[j][1] - nrm[j][1] * CW], [E[i][0] - anx * CW, E[i][1] - anz * CW]]; if (area2(Q) < 0) Q.reverse(); S.prism(Q.flat(), BOT, Math.max(top[i], top[j]) + 0.12, 0, 0, 'coping'); }
  }

  // ---------------------------------------------------------------------------------------------- stairs down to the water (gaps in the railing)
  const stairs = [];
  const out = (i, k) => { const [ex, ez] = E[i], [nx, nz] = nrm[i]; return [ex + k * nx, ez + k * nz]; };
  [0.18, 0.5, 0.82].forEach((f) => {
    const i0 = Math.floor(N * f), drop = top[i0] - (WATER_Y + 0.25), steps = Math.ceil(drop / 0.16);
    const i1 = Math.min(N - 1, i0 + Math.ceil(drop / 0.16 * 0.32));
    if (i1 - i0 < 2) return;
    stairs.push([i0 - 1, i1 + 1]);
    F.setColor(C.granite);
    let t = 0;
    while (t < steps) { // tread t sits on the quay point it has reached along the flight
      const i = Math.min(i1, i0 + Math.floor(t * (i1 - i0) / steps)), [sx, sz] = out(i, 0.85);
      t++;
      F.with(M4(sx, top[i0] - 0.16 * t, sz, Math.atan2(-tan[i][1], tan[i][0])), (d) => d.box(0, -0.3, -0.75, 0.34, 0.16, 0.75));
    }
    // the outer stair wall, a 20 cm pier per metre falling with the flight
    F.setColor(C.wallD);
    const span = i1 - i0;
    for (let q = 0; q <= span; q++) { const [px, pz] = out(i0 + q, 1.55); F.boxC(px, (BOT + top[i0] + 0.9 - drop * q / span) / 2, pz, 0.2, top[i0] + 0.9 - drop * q / span - BOT, 0.2); }
    const Q = [E[i0], E[i1], out(i1, 1.6), out(i0, 1.6)];
    if (area2(Q) < 0) Q.reverse();
    const dx = E[i1][0] - E[i0][0], dz = E[i1][1] - E[i0][1], k = -drop / (dx * dx + dz * dz); // slope of the flight per metre along it
    S.prism(Q.flat(), BOT, top[i0] - k * (dx * E[i0][0] + dz * E[i0][1]), k * dx, k * dz, 'ledge');
  });
  const inStair = (i) => stairs.some(([a, b]) => i >= a && i <= b);

  // ---------------------------------------------------------------------------------------------- railing, lamps, benches
  M.setColor(C.rail);
  const RH = 1.1;
  let prev = null;
  for (let i = 0; i < N; i += 2) {
    if (inStair(i)) { prev = null; continue; }
    const [x, z] = E[i], [nx, nz] = nrm[i], px = x - nx * 0.18, pz = z - nz * 0.18, y = top[i] + 0.12;
    M.cyl(px, y, pz, 0.03, 0.03, RH, 5, false);
    if (i % 10 === 0) M.box(px - 0.05, y + RH - 0.05, pz - 0.05, px + 0.05, y + RH + 0.05, pz + 0.05);
    const p = [px, y + RH, pz], m = [px, y + 0.5, pz];
    if (prev) { M.tube(prev[0], p, 0.035, 5); M.tube(prev[1], m, 0.018, 4); Z.edge(prev[0][0], prev[0][2], px, pz, y + RH, nx, nz, 'ledge', 4); }
    prev = [p, m];
  }
  const lamps = [], benches = [];
  for (let i = 12; i < N - 4; i += 26) {
    const [x, z] = E[i], [nx, nz] = nrm[i], [tx, tz] = tan[i];
    const lx = x - nx * 1.4, lz = z - nz * 1.4, y = gh(lx, lz);
    M.setColor(C.pole);
    // base, shaft
    for (const [y0, r0, r1, h, cap] of [[0, 0.2, 0.14, 0.6, true], [0.6, 0.075, 0.06, 3.6, false]]) M.cyl(lx, y + y0, lz, r0, r1, h, 8, cap);
    for (const s of [-1, 1]) { // twin arms, each with a lantern (cup, glass, cap)
      const arm = (k, h) => [lx + tx * k * s, y + h, lz + tz * k * s], [ax, , az] = arm(0.55, 0);
      M.tube(arm(0, 3.9), arm(0.35, 4.15), 0.03, 4).tube(arm(0.35, 4.15), arm(0.55, 4.05), 0.03, 4);
      M.cyl(ax, y + 3.65, az, 0.12, 0.17, 0.12, 8, true).cyl(ax, y + 4.05, az, 0.2, 0.05, 0.14, 8, true);
      glow.cyl(ax, y + 3.77, az, 0.17, 0.19, 0.28, 8, true);
    }
    M.cyl(lx, y + 4.2, lz, 0.05, 0.01, 0.35, 6, true);
    S.cyl(lx, lz, y, y + 4.2, 0.1, 0.1, 'pole');
    lamps.push([lx, lz]);
    // bench + bin halfway to the next lamp, facing the water
    const j = Math.min(N - 1, i + 13), [bx0, bz0] = E[j], [bnx, bnz] = nrm[j], bx = bx0 - bnx * 2.6, bz = bz0 - bnz * 2.6, by = gh(bx, bz), face = Math.atan2(-bnz, bnx);
    F.with(M4(bx, by, bz, face), d => {
      d.setColor(C.wood);
      for (const k of [0, 1, 2, 3]) d.box(0.13 * k - 0.24, 0.42, -0.95, 0.13 * k - 0.13, 0.46, 0.95); // seat slats
      d.with(M4(-0.3, 0.5, 0).multiply(rotZ(-0.22)), (e) => [0, 0.14, 0.28].forEach((y) => e.box(-0.03, y, -0.95, 0, y + 0.1, 0.95))); // back
      d.setColor(C.pole); for (const b of [-0.8, 0.8]) { d.box(-0.3, 0, b - 0.03, -0.24, 0.9, b + 0.03); d.box(0.22, 0, b - 0.03, 0.28, 0.44, b + 0.03); d.box(-0.3, 0.38, b - 0.03, 0.28, 0.42, b + 0.03); }
      d.setColor(C.bin); d.cyl(-0.05, 0, 1.45, 0.2, 0.22, 0.75, 10, true);
    });
    S.box(bx - 0.6, by, bz - 0.6, bx + 0.6, by + 0.46, bz + 0.6, 'ledge');
    benches.push([bx, bz]);
  }

  add(F, new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true }), 'wall');
  add(M, new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.45, vertexColors: true }), 'railing');
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.93, 0.78) });
  add(glow, lampMat, 'lamps', false);

  // trees keep ~4 m off the wall line
  const cell = new Map(), key = (x, z) => Math.floor(x / 4) * 100003 + Math.floor(z / 4);
  for (const [x, z] of E) cell.set(key(x, z), 1);
  const clear = (x, z) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (cell.has(key(x + a * 4, z + b * 4))) return true; return false; };
  console.log(`[cherkasy] embankment: ${N} m of quay, ${stairs.length} stairs, ${lamps.length} lamps, ${benches.length} benches; ${nV} vertices, ${S.count - s0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    clear,
    update() { lampMat.color.setScalar(0.55 + 1.5 * nightK.value); },
  };
}

// box-filter a sequence `passes` times with a window of +-r samples (clamped at the ends)
function smooth(a, r, passes) {
  for (let p = 0; p < passes; p++) {
    const src = a;
    a = src.map((_, i) => { const lo = Math.max(0, i - r), hi = Math.min(src.length - 1, i + r); let s = 0; for (let j = lo; j <= hi; j++) s += src[j]; return s / (hi - lo + 1); });
  }
  return a;
}
