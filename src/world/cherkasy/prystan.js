// OWNER: cherkasy. "Stara Prystan", the floating restaurant moored by the river station (OSM: floating pier way
// 869982684 + the restaurant node): a wooden pirate-ship themed vessel over the ~26 x 8 m pontoon. Dark stained hull
// with an ochre wale, a raised stern castle with lit windows, a covered dining deck (half-height balustrade, canvas roof,
// string lights), open tables on the foredeck, two masts with yards and furled sails, a Jolly Roger, a bowsprit,
// lifebuoys and nets on the rails, the name board on the shore side and a gangway to the quay. Next to it on the quay,
// the "Shkhuna" attraction: a small wooden play schooner (UNCERTAIN in the refs: modelled as a children's ship).
//   buildPrystan({ root, solids, zips, heightAt, ground, geo }) -> { update(dt) }
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { area2, obb } from './geo.js';
import { boatGeometry, hullShape } from './yachtclub.js';

const PI = Math.PI, WATER_Y = -1.6;
const PONTOON = [[49.4358699,32.1021307],[49.4358811,32.1021684],[49.4358457,32.1021934],[49.4358463,32.1021989],[49.4358275,32.1022125],[49.4358568,32.1023082],[49.4358776,32.1022932],[49.4358809,32.1023039],[49.4360526,32.1021794],[49.4360496,32.1021695],[49.4360638,32.1021505],[49.43604,32.1020738],[49.43602,32.1020765],[49.4360174,32.1020675],[49.4359783,32.1020951],[49.4359683,32.1020613],[49.4358699,32.1021307]]; // OSM way 869982684 (floating pier)
const SHKHUNA = [49.4358781, 32.1017412]; // OSM node 10792401406
const C = { hull: 0x3e2a1c, wale: 0xb08a3a, deck: 0x9c7a55, wood: 0x6b4a2e, woodL: 0x8e6a45, canvas: 0xe6dcc3, rope: 0x2a2118, black: 0x151515, red: 0xb52a22, white: 0xf0ede6, iron: 0x2b2b2b };
const rotZ = (a) => new THREE.Matrix4().makeRotationZ(a);

export function buildPrystan({ root, solids: S, zips: Z, heightAt, ground, geo }) {
  const t0 = performance.now(), s0 = S.count;
  const gh = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 0; };
  const isWater = (x, z) => ground?.isWater?.(x, z) ?? false;
  const group = new THREE.Group(); group.name = 'stara-prystan'; root.add(group);
  const ship = new THREE.Group(); group.add(ship);
  let nV = 0;
  const add = (obj, name, shadow = true, g = ship) => { obj.name = 'prystan-' + name; obj.castShadow = shadow; obj.receiveShadow = true; g.add(obj); nV += obj.geometry.attributes.position.count; return obj; };

  let P = PONTOON.map(p => geo.toXZ(p[0], p[1])); P.pop(); if (area2(P) < 0) P.reverse();
  const bb = obb(P); if (!bb) return null;
  const L = bb.L, B = Math.min(8, bb.W), H = 2.2, ry = Math.atan2(-bb.uz, bb.ux);
  // shore side: which beam direction reaches land first (local +z -> world (-uz, ux))
  const side = (() => { for (let d = 4; d < 40; d += 1) { const a = isWater(bb.cx - bb.uz * d, bb.cz + bb.ux * d), b = isWater(bb.cx + bb.uz * d, bb.cz - bb.ux * d); if (!a && b) return 1; if (!b && a) return -1; } return 1; })();
  const shoreZ = side; // +1: local +z faces the shore
  const hAt = (t) => H * hullShape(t, 'yacht').sheer, bAt = (t) => B / 2 * hullShape(t, 'yacht').b, tOf = (x) => (x + L / 2) / L;

  // ---------------------------------------------------------------------------------------------- hull + deck
  const { hull, top } = boatGeometry('yacht', L, B, H, 1.2, true);
  add(new THREE.Mesh(hull, new THREE.MeshStandardMaterial({ color: C.hull, roughness: 0.85, side: THREE.DoubleSide })), 'hull');
  add(new THREE.Mesh(top, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })), 'deck');
  const F = new MB(), glow = new MB(), cloth = new MB();
  const deckY = (x) => hAt(tOf(x));
  // wales + cap rail along the sheer
  for (const [dy, r, col] of [[-0.55, 0.13, C.wale], [-1.3, 0.09, C.black], [0.02, 0.08, C.wood]]) {
    F.setColor(col);
    for (const s of [-1, 1]) { let prev = null; for (let t = 0.02; t <= 0.985; t += 0.03) { const p = [-L / 2 + t * L, hAt(t) + dy, s * bAt(t) * (dy < -1 ? 0.97 : 1.0)]; if (prev) F.tube(prev, p, r, 5); prev = p; } }
  }
  // balustrade along the deck edge (gap for the gangway on the shore side, midships)
  F.setColor(C.woodL);
  for (const s of [-1, 1]) {
    let prev = null;
    for (let t = 0.26; t <= 0.9; t += 0.02) {
      const x = -L / 2 + t * L, y = hAt(t), z = s * (bAt(t) - 0.12);
      if (s === shoreZ && Math.abs(t - 0.5) < 0.035) { prev = null; continue; }
      F.box(x - 0.04, y, z - 0.04, x + 0.04, y + 0.95, z + 0.04);
      const p = [x, y + 0.95, z]; if (prev) F.tube(prev, p, 0.05, 4); prev = p;
    }
  }
  // stern castle
  const x0 = -L / 2 + 0.3, x1 = -L / 2 + 6.2, sc0 = hAt(0.02), zc = bAt(0.08) * 0.97, cT = sc0 + 2.4;
  F.setColor(C.wood); F.box(x0, sc0 - 0.2, -zc, x1, cT, zc);
  F.setColor(C.woodL); F.box(x0 - 0.15, cT, -zc - 0.1, x1 + 0.1, cT + 0.15, zc + 0.1);
  for (let a = x0; a <= x1; a += 0.6) for (const s of [-1, 1]) F.box(a - 0.04, cT + 0.15, s * zc - 0.04, a + 0.04, cT + 1.0, s * zc + 0.04);
  for (const s of [-1, 1]) F.tube([x0, cT + 1.0, s * zc], [x1, cT + 1.0, s * zc], 0.05, 4);
  F.tube([x0, cT + 1.0, -zc], [x0, cT + 1.0, zc], 0.05, 4);
  for (let k = -2; k <= 2; k++) { glow.box(x0 - 0.04, sc0 + 0.7, k * 1.1 - 0.35, x0 + 0.02, sc0 + 1.7, k * 1.1 + 0.35); F.setColor(C.wale); F.box(x0 - 0.08, sc0 + 0.6, k * 1.1 - 0.45, x0 - 0.02, sc0 + 1.8, k * 1.1 - 0.37); } // stern galleries
  for (const s of [-1, 1]) for (let a = x0 + 1.0; a < x1 - 0.5; a += 1.5) glow.box(a, sc0 + 0.9, s * zc - 0.03, a + 0.8, sc0 + 1.7, s * zc + 0.03);
  for (const s of [-1, 1]) { F.setColor(C.iron); F.cyl(x0 + 0.2, cT + 1.0, s * zc, 0.05, 0.05, 0.4, 5, false); glow.box(x0 + 0.05, cT + 1.4, s * zc - 0.15, x0 + 0.35, cT + 1.8, s * zc + 0.15); } // stern lanterns
  // stairs from the main deck up to the castle
  F.setColor(C.woodL); for (let k = 0; k < 8; k++) F.box(x1 + 0.1 + (7 - k) * 0.28, sc0 + k * 0.3, -1.4, x1 + 0.1 + (8 - k) * 0.28, sc0 + k * 0.3 + 0.08, -0.4);
  // covered dining deck: posts, canvas roof, tables, string lights
  const d0 = x1 + 2.6, d1 = L * 0.18, dz = bAt(0.5) - 0.35, rY = hAt(0.5) + 2.7;
  F.setColor(C.wood);
  for (let a = d0; a <= d1 + 0.01; a += (d1 - d0) / 4) for (const s of [-1, 1]) F.box(a - 0.09, deckY(a), s * dz - 0.09, a + 0.09, rY, s * dz + 0.09);
  cloth.setColor(C.canvas);
  for (const s of [-1, 1]) quadN(cloth, [d0 - 0.4, rY + 0.7, 0], [d1 + 0.4, rY + 0.7, 0], [d1 + 0.4, rY - 0.05, s * (dz + 0.5)], [d0 - 0.4, rY - 0.05, s * (dz + 0.5)], [0, 1, 0]);
  F.setColor(C.wood); F.tube([d0 - 0.4, rY + 0.7, 0], [d1 + 0.4, rY + 0.7, 0], 0.08, 5);
  for (const s of [-1, 1]) for (let a = d0; a <= d1; a += 0.9) glow.box(a - 0.04, rY - 0.2 - 0.12 * Math.sin((a - d0) / 0.9 * PI) ** 2, s * dz - 0.04, a + 0.04, rY - 0.12 - 0.12 * Math.sin((a - d0) / 0.9 * PI) ** 2, s * dz + 0.04);
  const table = (x, z, rot = 0) => { const y = deckY(x); F.with(M4(x, y, z, rot), d => { d.setColor(C.woodL); d.box(-0.6, 0.72, -0.4, 0.6, 0.78, 0.4); d.box(-0.06, 0, -0.06, 0.06, 0.72, 0.06); d.setColor(C.wood); for (const b of [-0.7, 0.7]) { d.box(-0.6, 0.42, b - 0.15, 0.6, 0.46, b + 0.15); d.box(-0.05, 0, b - 0.05, 0.05, 0.42, b + 0.05); } }); };
  for (let a = d0 + 1; a < d1 - 0.5; a += 2.1) for (const z of [-dz + 1.1, dz - 1.1]) table(a, z, PI / 2);
  for (let a = d1 + 1.8; a < L * 0.38; a += 2.1) for (const z of [-bAt(0.7) + 1.3, bAt(0.7) - 1.3]) table(a, z, PI / 2);
  // masts, yards, furled sails, rigging, bowsprit, flag
  const masts = [[L * 0.3, 15], [-L * 0.02, 17]];
  for (const [mx, mh] of masts) {
    const y0 = deckY(mx);
    F.setColor(C.wood); F.cyl(mx, y0, 0, 0.22, 0.12, mh, 10, true);
    F.box(mx - 0.5, y0 + mh * 0.62, -0.6, mx + 0.5, y0 + mh * 0.62 + 0.12, 0.6); // top platform
    for (const [f, w] of [[0.45, 0.95], [0.72, 0.75], [0.9, 0.55]]) {
      const yy = y0 + mh * f, hw = B * w * 0.62;
      F.setColor(C.wood); F.tube([mx + 0.25, yy, -hw], [mx + 0.25, yy, hw], 0.08, 6);
      F.setColor(C.canvas); F.tube([mx + 0.35, yy - 0.18, -hw * 0.92], [mx + 0.35, yy - 0.18, hw * 0.92], 0.2, 6);
    }
    F.setColor(C.rope);
    for (const s of [-1, 1]) for (const k of [-0.6, 0, 0.6]) F.tube([mx, y0 + mh * 0.62, 0], [mx + k, hAt(tOf(mx + k)), s * (bAt(tOf(mx + k)) - 0.05)], 0.025, 3);
  }
  F.setColor(C.rope);
  F.tube([masts[0][0], deckY(masts[0][0]) + masts[0][1] * 0.95, 0], [L / 2 + 4.5, hAt(1) + 2.2, 0], 0.03, 3);
  F.tube([masts[1][0], deckY(masts[1][0]) + masts[1][1] * 0.95, 0], [masts[0][0], deckY(masts[0][0]) + masts[0][1] * 0.9, 0], 0.03, 3);
  F.tube([masts[1][0], deckY(masts[1][0]) + masts[1][1] * 0.8, 0], [x0 + 0.3, cT + 1.0, 0], 0.03, 3);
  F.setColor(C.wood); F.tube([L / 2 - 1.5, hAt(0.96) + 0.1, 0], [L / 2 + 4.8, hAt(1) + 2.3, 0], 0.16, 8);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.3), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9, map: canvasTex(256, 168, (g) => {
    g.fillStyle = '#141414'; g.fillRect(0, 0, 256, 168); g.fillStyle = '#efeae0';
    g.beginPath(); g.arc(128, 66, 34, 0, PI * 2); g.fill(); g.fillRect(106, 88, 44, 22);
    g.fillStyle = '#141414'; g.beginPath(); g.arc(114, 64, 9, 0, PI * 2); g.arc(142, 64, 9, 0, PI * 2); g.fill(); g.fillRect(118, 94, 4, 14); g.fillRect(126, 94, 4, 14); g.fillRect(134, 94, 4, 14);
    g.strokeStyle = '#efeae0'; g.lineWidth = 14; g.lineCap = 'round'; g.beginPath(); g.moveTo(70, 118); g.lineTo(186, 152); g.moveTo(186, 118); g.lineTo(70, 152); g.stroke();
  }, { repeat: false }) }));
  flag.position.set(masts[1][0] - 1.05, deckY(masts[1][0]) + masts[1][1] - 0.2, 0); flag.rotation.y = 0; add(flag, 'flag', false);
  // lifebuoys + nets on the shore-side balustrade
  const buoyGeo = new THREE.TorusGeometry(0.34, 0.09, 8, 16), buoyMat = new THREE.MeshStandardMaterial({ roughness: 0.6, map: canvasTex(64, 8, (g) => { for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#f2efe8' : '#c9281f'; g.fillRect(k * 8, 0, 8, 8); } }, { repeat: false }) });
  for (const s of [-1, 1]) for (const t of [0.4, 0.62, 0.8]) { const m = new THREE.Mesh(buoyGeo, buoyMat); m.position.set(-L / 2 + t * L, hAt(t) + 0.5, s * (bAt(t) - 0.04)); add(m, 'lifebuoy'); }
  F.setColor(C.rope); for (const s of [-1, 1]) { const t = 0.72, x = -L / 2 + t * L; for (let k = 0; k <= 6; k++) { F.tube([x + k * 0.25, hAt(t) + 0.95, s * (bAt(t) - 0.02)], [x + k * 0.25 + 0.6, hAt(t) - 0.2, s * (bAt(t) + 0.05)], 0.012, 3); F.tube([x + k * 0.25 + 0.6, hAt(t) + 0.95, s * (bAt(t) - 0.02)], [x + k * 0.25, hAt(t) - 0.2, s * (bAt(t) + 0.05)], 0.012, 3); } }
  // name board on the shore side, over the balustrade
  const board = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.0), new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0xffd9a0, emissiveIntensity: 0.0, map: canvasTex(1152, 160, (g) => {
    g.fillStyle = '#2a1a10'; g.fillRect(0, 0, 1152, 160); g.strokeStyle = '#b08a3a'; g.lineWidth = 8; g.strokeRect(8, 8, 1136, 144);
    g.fillStyle = '#e8c874'; g.font = 'bold 104px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('СТАРА ПРИСТАНЬ', 576, 86);
  }, { repeat: false }) }));
  board.position.set(-L / 2 + 0.36 * L, hAt(0.36) + 1.5, shoreZ * (bAt(0.36) + 0.02)); board.rotation.y = shoreZ > 0 ? 0 : PI; add(board, 'sign', false);
  F.setColor(C.wood); for (const a of [-3.3, 3.3]) F.box(-L / 2 + 0.36 * L + a - 0.06, hAt(0.36) + 0.9, shoreZ * (bAt(0.36) - 0.1) - 0.06, -L / 2 + 0.36 * L + a + 0.06, hAt(0.36) + 2.0, shoreZ * (bAt(0.36) - 0.1) + 0.06);

  add(new THREE.Mesh(F.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })), 'timber');
  add(new THREE.Mesh(cloth.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide })), 'canvas');
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.78, 0.45) });
  add(new THREE.Mesh(glow.build(), glowMat), 'lights', false);
  ship.matrixAutoUpdate = false;
  const base = M4(bb.cx, WATER_Y, bb.cz, ry);
  ship.matrix.copy(base);

  // ---------------------------------------------------------------------------------------------- gangway to the quay + collision
  const W = (a, y, b) => new THREE.Vector3(a, y, b).applyMatrix4(base);
  const g0 = W(0, hAt(0.5), shoreZ * bAt(0.5)), dir = W(0, 0, shoreZ).sub(W(0, 0, 0)).setY(0).normalize();
  let land = null; for (let d = 1; d < 25; d += 0.5) { const x = g0.x + dir.x * d, z = g0.z + dir.z * d; if (!isWater(x, z) && !isWater(x + dir.x * 1.5, z + dir.z * 1.5)) { land = [x + dir.x * 1.5, z + dir.z * 1.5]; break; } }
  const M = new MB();
  if (land) {
    const y1 = gh(...land) + 0.05, px = -dir.z, pz = dir.x, Wd = 0.7;
    M.setColor(C.woodL);
    quadN(M, [g0.x - px * Wd, g0.y, g0.z - pz * Wd], [g0.x + px * Wd, g0.y, g0.z + pz * Wd], [land[0] + px * Wd, y1, land[1] + pz * Wd], [land[0] - px * Wd, y1, land[1] - pz * Wd], [0, 1, 0]);
    M.setColor(C.rope); for (const s of [-1, 1]) { M.tube([g0.x + px * Wd * s, g0.y + 1, g0.z + pz * Wd * s], [land[0] + px * Wd * s, y1 + 1, land[1] + pz * Wd * s], 0.03, 4); M.setColor(C.wood); M.cyl(g0.x + px * Wd * s, g0.y, g0.z + pz * Wd * s, 0.05, 0.05, 1, 5, false); M.cyl(land[0] + px * Wd * s, y1, land[1] + pz * Wd * s, 0.05, 0.05, 1, 5, false); M.setColor(C.rope); }
    const len = Math.hypot(land[0] - g0.x, land[1] - g0.z), bx = dir.x * (y1 - g0.y) / len, bz = dir.z * (y1 - g0.y) / len;
    const Q = [[g0.x - px * Wd, g0.z - pz * Wd], [g0.x + px * Wd, g0.z + pz * Wd], [land[0] + px * Wd, land[1] + pz * Wd], [land[0] - px * Wd, land[1] - pz * Wd]]; if (area2(Q) < 0) Q.reverse();
    S.prism(Q.flat(), Math.min(g0.y, y1) - 0.3, g0.y - bx * g0.x - bz * g0.z, bx, bz, 'roof');
  }
  const rect = (a0, a1, b0, b1) => { const Q = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, b]) => { const v = W(a, 0, b); return [v.x, v.z]; }); return area2(Q) < 0 ? Q.reverse() : Q; };
  S.prism(rect(-L / 2 + 0.5, L / 2 - 2, -B / 2 + 0.3, B / 2 - 0.3).flat(), WATER_Y - 1, WATER_Y + hAt(0.5), 0, 0, 'roof');
  S.prism(rect(x0, x1, -zc, zc).flat(), WATER_Y + sc0, WATER_Y + cT + 0.15, 0, 0, 'roof');
  S.prism(rect(d0 - 0.4, d1 + 0.4, -dz - 0.5, dz + 0.5).flat(), WATER_Y + rY - 0.05, WATER_Y + rY + 0.7, 0, 0, 'roof');
  for (const [mx, mh] of masts) { const v = W(mx, 0, 0); S.cyl(v.x, v.z, WATER_Y + deckY(mx), WATER_Y + deckY(mx) + mh, 0.2, 0.12, 'pole'); Z.add(v.x, WATER_Y + deckY(mx) + mh * 0.62 + 0.12, v.z, 0, 1, 0, 'antenna'); }

  // ---------------------------------------------------------------------------------------------- the play schooner on the quay
  {
    const [sx, sz] = geo.toXZ(...SHKHUNA), sy = gh(sx, sz) - 0.35, Ls = 9, Bs = 3.2, Hs = 1.4, rs = ry;
    const g = boatGeometry('yacht', Ls, Bs, Hs, 0.35, true);
    const Ms = M4(sx, sy, sz, rs);
    const h = new THREE.Mesh(g.hull, new THREE.MeshStandardMaterial({ color: 0x8d5a32, roughness: 0.8, side: THREE.DoubleSide })); h.applyMatrix4(Ms); add(h, 'schooner-hull', true, group);
    const d = new THREE.Mesh(g.top, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })); d.applyMatrix4(Ms); add(d, 'schooner-deck', true, group);
    const hs = (t) => Hs * hullShape(t, 'yacht').sheer, bs = (t) => Bs / 2 * hullShape(t, 'yacht').b;
    M.with(Ms, e => {
      e.setColor(0xd9a52a); for (const s of [-1, 1]) { let prev = null; for (let t = 0.03; t <= 0.97; t += 0.06) { const p = [-Ls / 2 + t * Ls, hs(t) + 0.6, s * bs(t)]; e.cyl(p[0], hs(t), p[2], 0.04, 0.04, 0.6, 5, false); if (prev) e.tube(prev, p, 0.05, 4); prev = p; } }
      e.setColor(0x7a4a2a); e.cyl(0.4, hs(0.55), 0, 0.12, 0.08, 6.5, 8, true); e.box(-0.1, hs(0.55) + 3.4, -1.2, 0.2, hs(0.55) + 3.5, 1.2);
      e.setColor(0x2f6fb0); e.with(M4(-Ls / 2 + 0.3, 0, -0.45).multiply(rotZ(0.62)), f => { f.box(-2.6, -0.04, -0.4, 0, 0.04, 0.4); f.box(-2.6, 0.04, -0.44, 0, 0.18, -0.4); f.box(-2.6, 0.04, 0.4, 0, 0.18, 0.44); }); // slide off the stern
      e.setColor(0xd2362a); e.box(-Ls / 2 + 0.3, hs(0.02), -1.0, -Ls / 2 + 1.6, hs(0.02) + 1.1, 0.1); // stern cabin
    });
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.8), new THREE.MeshStandardMaterial({ color: 0xf2eee2, side: THREE.DoubleSide, roughness: 0.9 }));
    sail.position.set(0.55, hs(0.55) + 2.1, 0); sail.rotation.y = PI / 2; sail.applyMatrix4(Ms); add(sail, 'schooner-sail', false, group);
    const f2 = flag.clone(); f2.scale.setScalar(0.45); f2.position.set(0, hs(0.55) + 6.5, 0.45); f2.rotation.y = PI / 2; f2.applyMatrix4(Ms); add(f2, 'schooner-flag', false, group);
    S.prism(((Q) => area2(Q) < 0 ? Q.reverse() : Q)([[-Ls / 2, -Bs / 2], [Ls / 2, -Bs / 2], [Ls / 2, Bs / 2], [-Ls / 2, Bs / 2]].map(([a, b]) => [sx + a * Math.cos(rs) + b * Math.sin(rs), sz - a * Math.sin(rs) + b * Math.cos(rs)])).flat(), sy, sy + Hs * 1.05, 0, 0, 'roof');
    S.cyl(sx + 0.4 * Math.cos(rs), sz - 0.4 * Math.sin(rs), sy, sy + hs(0.55) + 6.5, 0.12, 0.12, 'pole');
  }
  if (M.v) add(new THREE.Mesh(M.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })), 'gangway', true, group);

  console.log(`[cherkasy] Stara Prystan: ${L.toFixed(1)} x ${B.toFixed(1)} m, gangway ${land ? 'yes' : 'no'}; ${nV} vertices, ${S.count - s0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  let time = 0; const m = new THREE.Matrix4(), e = new THREE.Euler();
  return {
    update(dt) {
      time += dt;
      e.set(Math.sin(time * 0.5) * 0.006, 0, Math.sin(time * 0.37) * 0.004); m.makeRotationFromEuler(e); m.setPosition(0, Math.sin(time * 0.8) * 0.03, 0);
      ship.matrix.copy(base).multiply(m); ship.matrixWorldNeedsUpdate = true;
      const k = nightK.value; glowMat.color.setRGB(0.55 + 1.3 * k, 0.42 + 1.0 * k, 0.25 + 0.55 * k); board.material.emissiveIntensity = 0.35 * k;
    },
  };
}

function quadN(D, p0, p1, p2, p3, n) {
  const v = [p0, p1, p2, p3].map(p => D.vert(p[0], p[1], p[2], n[0], n[1], n[2]));
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], wx = p2[0] - p0[0], wy = p2[1] - p0[1], wz = p2[2] - p0[2];
  const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
  if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) D.quad(v[0], v[1], v[2], v[3]); else D.quad(v[0], v[3], v[2], v[1]);
}
