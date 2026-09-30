// OWNER: cherkasy. The Cherkasy cruising yacht club "Parus" (Haharina / Knyazia Olherda, 7) and its neighbours on the
// shore: the marina's high bank becomes a concrete quay with an apron and coping; from it steel gangways drop to
// floating pontoons (the three OSM piers of the marina, plus the smaller piers / jetties to the south); sailing yachts and
// motorboats are moored stern-to along the pontoons (instanced, bobbing), more yachts stand ashore on cradles; a rail
// slipway on a trestle runs from the quay into the water with a yacht on its trolley; a fixed pillar jib crane stands
// on the quay next to it. The historic ship at the TSOU water station (OSM building=ship) is modelled as a small
// river motor vessel (its generic extrusion is skipped, YACHT_SKIP).
//   buildYachtClub({ root, map, solids, zips, heightAt, ground, geo }) -> { update(dt), clear(x, z) }
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { SG } from './sculpt.js';
import { rng, area2, inPoly, centroid, obb, convexParts } from './geo.js';
import { MARINA, PIERS, JETTIES, SHIP } from './yachtclub_data.js';

export const YACHT_SKIP = new Set(SHIP.map(o => o.id));

const PI = Math.PI, WATER_Y = -1.6, DECK = WATER_Y + 0.5;
const C = { conc: 0xa9a69e, concD: 0x77746d, deck: 0x8c7a62, float: 0x3b3f44, steel: 0x6a7074, white: 0xf1f0ec, teak: 0xa7825a,
  navy: 0x1f3552, glass: 0x1b2630, yellow: 0xe0b22a, red: 0xb52a22, blue: 0x2c5d9e, rail: 0xc9cdd0, black: 0x1c1d1f };
const toRing = (geo, LL) => { let P = LL.map(p => geo.toXZ(p[0], p[1])); if (P.length > 2 && P[0][0] === P.at(-1)[0] && P[0][1] === P.at(-1)[1]) P = P.slice(0, -1); return area2(P) < 0 ? P.reverse() : P; };
const rotZ = (a) => new THREE.Matrix4().makeRotationZ(a);
const ss = (a, b, v) => THREE.MathUtils.smoothstep(v, a, b); // cubic 0..1 ramp between a and b

// ------------------------------------------------------------------------------------------------ boat models
// local frame: +x bow, +y up (waterline y = 0), +z starboard. hull: smooth SG shell (tinted per instance); top: MB parts.
export function hullShape(t, kind) {
  const b = t < 0.55 ? 0.8 + 0.2 * Math.sin(t / 0.55 * PI / 2) : Math.max(0.02, Math.pow(Math.cos((t - 0.55) / 0.45 * PI / 2), 0.75));
  const sheer = 1 + 0.2 * t * t;
  const keel = -(1 - ss(0.62, 1.0, t)) * (kind === 'yacht' ? 1 - 0.35 * t : 1 - 0.2 * t) + ss(0.8, 1.0, t) * 0.25;
  return { b, sheer, keel };
}
export function boatGeometry(kind, L, B, H, D, deckOnly = false) {
  const N = 16, K = 11, top = new MB(), p = kind === 'yacht' ? 0.5 : 0.95;
  // stations bow-ward along x; each section a half-loop from port gunwale (k = 0) under the keel to starboard
  const sec = Array.from({ length: N }, (_, j) => { const t = j / (N - 1), h = hullShape(t, kind); return { t, h, x: L * (t - 0.5) }; });
  const rings = sec.map(({ h, x }) => {
    const hb = 0.5 * B * h.b, hs = H * h.sheer, kd = D * h.keel;
    return Array.from({ length: K }, (_, k) => { const th = PI * k / (K - 1); return [x, hs - (hs - kd) * Math.sin(th) ** p, hb * Math.cos(th)]; });
  });
  for (const q of sec) { const hs = H * q.h.sheer, hb = 0.5 * B * q.h.b; q.xyz = [q.x, hs, hb]; }
  const hull = new SG().loft(rings, { closed: false, cap0: true });
  // deck
  top.setColor(kind === 'yacht' ? C.teak : C.white);
  for (let j = 0; j + 1 < N; j++) {
    const [x0, y0, b0] = sec[j].xyz, [x1, y1, b1] = sec[j + 1].xyz;
    quadN(top, [x0, y0, -b0], [x0, y0, b0], [x1, y1, b1], [x1, y1, -b1], [0, 1, 0]);
  }
  const hAt = (t) => H * hullShape(t, kind).sheer;
  if (deckOnly) return { hull: hull.build(), top: top.build() };
  if (kind === 'yacht') {
    const d0 = hAt(0.45);
    top.setColor(C.white); top.box(-0.2 * L, d0 - 0.05, -0.3 * B, 0.12 * L, d0 + 0.5, 0.3 * B);
    top.setColor(C.glass); for (const s of [-1, 1]) top.box(-0.12 * L, d0 + 0.22, s * 0.3 * B - 0.02, 0.06 * L, d0 + 0.36, s * 0.3 * B + 0.02);
    const mx = 0.1 * L, mh = 1.3 * L;
    top.setColor(C.rail); top.cyl(mx, d0 + 0.5, 0, 0.075, 0.05, mh, 6, true);
    top.box(-0.32 * L, d0 + 1.25, -0.05, mx, d0 + 1.35, 0.05);
    top.setColor(C.blue); top.box(-0.3 * L, d0 + 1.35, -0.13, mx - 0.1, d0 + 1.65, 0.13); // furled mainsail under its cover
    top.setColor(C.black);
    top.tube([mx, d0 + 0.5 + mh, 0], [L / 2 - 0.1, hAt(1), 0], 0.012, 3);
    top.tube([mx, d0 + 0.5 + mh, 0], [-L / 2 + 0.2, hAt(0), 0], 0.012, 3);
    for (const s of [-1, 1]) top.tube([mx, d0 + 0.5 + mh * 0.85, 0], [mx - 0.2, hAt(0.6), s * B * 0.45], 0.01, 3);
    top.setColor(C.navy); top.box(-0.05 * L, -D * 0.6 - 1.3, -0.08, 0.12 * L, -D * 0.5, 0.08); // fin keel
    top.box(-0.44 * L, -D * 0.9, -0.05, -0.36 * L, 0.2, 0.05); // rudder
    top.setColor(C.rail); for (const s of [-1, 1]) for (let t = 0.05; t < 0.95; t += 0.12) top.cyl(-L / 2 + t * L, hAt(t), s * (B / 2) * hullShape(t, kind).b * 0.93, 0.015, 0.015, 0.55, 4, false);
  } else {
    const d0 = hAt(0.55);
    top.setColor(C.white); top.box(-0.02 * L, d0 - 0.05, -0.36 * B, 0.3 * L, d0 + 0.75, 0.36 * B);
    top.setColor(C.glass); top.with(M4(0.3 * L, d0 + 0.2, 0).multiply(rotZ(0.55)), e => e.box(0, 0, -0.34 * B, 0.08, 0.7, 0.34 * B));
    for (const s of [-1, 1]) top.box(0.02 * L, d0 + 0.35, s * 0.36 * B - 0.02, 0.26 * L, d0 + 0.6, s * 0.36 * B + 0.02);
    top.setColor(C.white); top.box(-0.02 * L, d0 + 0.75, -0.37 * B, 0.36 * L, d0 + 0.82, 0.37 * B);
    top.setColor(C.navy); top.box(-0.42 * L, hAt(0.1) - 0.02, -0.3 * B, -0.2 * L, hAt(0.1) + 0.4, 0.3 * B); // helm seat block
    top.setColor(C.rail); top.cyl(0.1 * L, d0 + 0.82, 0, 0.02, 0.02, 1.2, 4, false);
    top.setColor(C.black); top.box(-L / 2 - 0.35, -0.4, -0.2, -L / 2 + 0.05, 0.5, 0.2); // outboard
  }
  return { hull: hull.build(), top: top.build() };
}

export function buildYachtClub({ root, map, solids: S, zips: Z, heightAt, ground, geo }) {
  const t0 = performance.now(), s0 = S.count;
  const gh = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 0; };
  const isWater = (x, z) => ground?.isWater?.(x, z) ?? false;
  const R = rng(1965);
  const group = Object.assign(new THREE.Group(), { name: 'yacht-club' });
  root.add(group);
  let nV = 0;
  const add = (obj, name, shadow = true) => { obj.name = 'yachtclub-' + name; obj.castShadow = shadow; obj.receiveShadow = true; group.add(obj); nV += obj.geometry.attributes.position.count * (obj.count ?? 1); return obj; };
  const [F, metal, glow] = [0, 1, 2].map(() => new MB()); // concrete + decks / steel / lamp heads
  const rampPrism = (P, y0, x0, z0, ya, ux, uz, len, yb, kind = 'roof') => { const bx = ux * (yb - ya) / len, bz = uz * (yb - ya) / len; return S.prism(P.flat(), y0, ya - bx * x0 - bz * z0, bx, bz, kind); };
  const rect = (cx, cz, ux, uz, a0, a1, b0, b1) => { const P = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, b]) => [cx + ux * a - uz * b, cz + uz * a + ux * b]); return area2(P) < 0 ? P.reverse() : P; };

  const marina = MARINA.map(o => toRing(geo, o.p));
  const inMarina = (x, z) => marina.some(P => inPoly(P, x, z));

  // ---------------------------------------------------------------------------------------------- quay: marina edges facing the water
  const quays = [];
  for (const P of marina) P.forEach(([ax, az], i) => {
    const [bx, bz] = P[(i + 1) % P.length], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 0.5) return;
    const nx = dz / L, nz = -dx / L, mid = [ax + dx / 2, az + dz / 2], wetAt = (d) => isWater(mid[0] + nx * d, mid[1] + nz * d);
    if (!wetAt(4) && !wetAt(8)) return; // only edges with water in front become quay
    const land = [[ax, az], [bx, bz], mid].map(([x, z]) => gh(x - 6 * nx, z - 6 * nz)); // bank level 6 m inland
    quays.push({ ax, az, bx, bz, nx, nz, L, top: Math.max(WATER_Y + 1.2, ...land) + 0.1 });
  });
  for (const q of quays) {
    const { ax, az, bx, bz, nx, nz, top } = q, w = 6, bot = WATER_Y - 1;
    F.setColor(C.concD); quadN(F, [ax, top, az], [bx, top, bz], [bx, bot, bz], [ax, bot, az], [nx, 0, nz]);
    F.setColor(C.conc); quadN(F, [ax, top, az], [bx, top, bz], [bx - nx * w, top, bz - nz * w], [ax - nx * w, top, az - nz * w], [0, 1, 0]);
    F.setColor(C.white); F.with(M4((ax + bx) / 2, top, (az + bz) / 2, Math.atan2(-(bz - az), bx - ax)), d => d.box(-q.L / 2, 0, -0.35, q.L / 2, 0.14, 0.05)); // coping
    const P = [[ax, az], [bx, bz], [bx - nx * w, bz - nz * w], [ax - nx * w, az - nz * w]]; if (area2(P) < 0) P.reverse();
    S.prism(P.flat(), bot, top, 0, 0, 'roof'); Z.edge(ax, az, bx, bz, top, nx, nz, 'ledge', 5);
    for (let s = 2; s < q.L - 1; s += 7) { const x = ax + (bx - ax) * s / q.L - nx * 0.5, z = az + (bz - az) * s / q.L - nz * 0.5; metal.setColor(C.black); metal.cyl(x, top, z, 0.16, 0.12, 0.45, 8, true); } // bollards
  }
  const quayAt = (x, z) => { // nearest quay segment within 12 m
    let best = null, bd = 12;
    for (const q of quays) {
      const ex = q.bx - q.ax, ez = q.bz - q.az, t = THREE.MathUtils.clamp(((x - q.ax) * ex + (z - q.az) * ez) / (q.L * q.L), 0, 1);
      const d = Math.hypot(q.ax + ex * t - x, q.az + ez * t - z);
      if (d < bd) [bd, best] = [d, q];
    }
    return best;
  };

  // ---------------------------------------------------------------------------------------------- pontoons + gangways
  const boats = []; // {kind, x, z, ry, s, afloat}
  const boatFree = (x, z, r) => boats.every(b => Math.hypot(b.x - x, b.z - z) > r + b.r);
  const pontoons = [];
  const lamps = [];
  const pontoon = (cx, cz, ux, uz, a0, a1, W) => { // deck strip along (ux, uz) from a0 to a1, width W
    const P = rect(cx, cz, ux, uz, a0, a1, -W / 2, W / 2), ry = Math.atan2(-uz, ux);
    F.with(M4(cx, DECK, cz, ry), d => {
      d.setColor(C.deck); d.box(a0, -0.08, -W / 2, a1, 0, W / 2);
      d.setColor(C.float); d.box(a0 + 0.1, -0.6, -W / 2 + 0.1, a1 - 0.1, -0.08, W / 2 - 0.1);
      d.setColor(C.steel); for (let a = a0 + 1.5; a < a1 - 0.5; a += 4.2) for (const s of [-1, 1]) d.box(a - 0.15, 0, s * (W / 2 - 0.1) - 0.04, a + 0.15, 0.1, s * (W / 2 - 0.1) + 0.04); // cleats
      d.setColor(C.steel); for (let a = a0 + 3; a < a1; a += 12) d.cyl(a, -4, W / 2 + 0.25, 0.18, 0.18, 5.4, 8, true); // guide piles
    });
    for (let a = a0 + 6; a < a1; a += 14) { const [x, z] = [cx + ux * a + uz * W / 2 * 0.8, cz + uz * a - ux * W / 2 * 0.8]; metal.setColor(C.steel); metal.cyl(x, DECK, z, 0.06, 0.05, 0.9, 6, false); glow.box(x - 0.1, DECK + 0.9, z - 0.1, x + 0.1, DECK + 1.05, z + 0.1); lamps.push([x, z]); }
    for (const Q of convexParts(P)) S.prism(Q.flat(), DECK - 0.6, DECK, 0, 0, 'roof');
    Z.edge(...P[0], ...P[1], DECK, 0, 0, 'ledge', 6);
    pontoons.push(P);
  };
  const gangway = (x0, z0, y0, x1, z1, y1, W = 1.3) => {
    const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, hw = W / 2;
    // point on the gangway: t metres from the top end, s = side (-1 / +1, scaled by the half width), dy above the deck line
    const G = (t, s, dy = 0) => [x0 + ux * t - uz * hw * s, y0 + (y1 - y0) * t / L + dy, z0 + uz * t + ux * hw * s];
    metal.setColor(C.steel);
    quadN(metal, G(0, -1), G(0, 1), G(L, 1), G(L, -1), [0, 1, 0]); // tread
    for (const s of [-1, 1]) {
      quadN(metal, G(0, s), G(L, s), G(L, s, -0.25), G(0, s, -0.25), [-uz * s, 0, ux * s]); // stringer
      metal.setColor(C.rail).tube(G(0, s, 1.0), G(L, s, 1.0), 0.03, 5); // handrail + stanchions
      for (let t = 0; t <= L; t += 1.5) metal.cyl(...G(t, s), 0.025, 0.025, 1.0, 4, false);
      metal.setColor(C.steel);
    }
    rampPrism(rect((x0 + x1) / 2, (z0 + z1) / 2, ux, uz, -L / 2, L / 2, -W / 2, W / 2), Math.min(y0, y1) - 0.3, x0, z0, y0, ux, uz, L, y1);
  };
  const piers = [...PIERS.map(o => ({ P: toRing(geo, o.p), line: false })), ...JETTIES.map(o => ({ P: o.p.map(p => geo.toXZ(p[0], p[1])), line: true }))];
  for (const { P, line } of piers) {
    let cx, cz, ux, uz, L, W;
    if (line) { // jetty drawn as a line: its end points give the axis
      const a = P[0], b = P.at(-1), dx = b[0] - a[0], dz = b[1] - a[1];
      L = Math.hypot(dx, dz); [ux, uz, cx, cz, W] = [dx / L, dz / L, a[0] + dx / 2, a[1] + dz / 2, 1.8];
    }
    else { const bb = obb(P); if (!bb) continue; ({ cx, cz, ux, uz, L, W } = bb); W = Math.max(2.2, Math.min(3.2, W)); }
    if (!isWater(cx + ux * L * 0.45, cz + uz * L * 0.45) && isWater(cx - ux * L * 0.45, cz - uz * L * 0.45)) { ux = -ux; uz = -uz; } // +u points out to the water
    // first water along the axis; the pontoon starts ~12 m further when a high quay has to be reached by a gangway
    let aw = -L / 2; while (aw < L / 2 && !isWater(cx + ux * aw, cz + uz * aw)) aw += 0.5;
    if (aw >= L / 2 - 3) continue;
    const q = quayAt(cx + ux * aw, cz + uz * aw), shoreY = q ? q.top : Math.max(DECK, gh(cx + ux * (aw - 1), cz + uz * (aw - 1)) + 0.1);
    const drop = shoreY - DECK, gl = drop > 0.6 ? Math.min(16, Math.max(4, drop * 3.6)) : 0;
    const a0 = aw + gl, a1 = Math.max(a0 + 6, L / 2);
    if (gl) gangway(cx + ux * (aw - 0.8), cz + uz * (aw - 0.8), shoreY, cx + ux * (a0 + 0.3), cz + uz * (a0 + 0.3), DECK);
    pontoon(cx, cz, ux, uz, a0, a1, W);
    // moored boats: stern-to along both sides, bows out
    for (const side of [-1, 1]) {
      const px = -uz * side, pz = ux * side;
      for (let a = a0 + 2.5; a < a1 - 1.5; a += 4.3) {
        if (R() < 0.15) continue;
        const kind = R() < 0.6 ? 'yacht' : 'motor', s = 0.85 + R() * 0.35, bl = (kind === 'yacht' ? 9.5 : 7) * s;
        const off = W / 2 + 0.9 + bl / 2, x = cx + ux * a + px * off, z = cz + uz * a + pz * off;
        if (!isWater(x, z) || !isWater(x + px * bl / 2, z + pz * bl / 2) || !isWater(x - px * bl * 0.45, z - pz * bl * 0.45)) continue;
        if (!boatFree(x, z, 1.6) || pontoons.some(Q => inPoly(Q, x + px * bl / 2, z + pz * bl / 2) || inPoly(Q, x, z))) continue;
        boats.push({ kind, x, z, ry: Math.atan2(-pz, px), s, r: 1.9, afloat: true, ph: R() * 6.28 });
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- slipway, crane, hardstand
  let slip = null;
  { // the longest quay segment between the marina piers gets the slipway at its middle
    const nearPontoon = (q) => { const mx = (q.ax + q.bx) / 2, mz = (q.az + q.bz) / 2; return pontoons.some((P) => P.some(([x, z]) => Math.hypot(x - mx, z - mz) < 9)); };
    const cand = quays.filter((q) => q.L > 8 && !nearPontoon(q));
    cand.sort((a, b) => b.L - a.L);
    const q = cand[0];
    if (q) {
      const mx = (q.ax + q.bx) / 2, mz = (q.az + q.bz) / 2, ux = q.nx, uz = q.nz, px = -uz, pz = ux, W = 6, len = Math.max(18, (q.top - (WATER_Y - 2.5)) * 5.5);
      const y0 = q.top, y1 = WATER_Y - 2.5, at = (s, b) => [mx + ux * s + px * b, mz + uz * s + pz * b], yAt = (s) => y0 + (y1 - y0) * s / len;
      F.setColor(C.concD);
      quadN(F, [at(0, -W / 2)[0], y0, at(0, -W / 2)[1]], [at(0, W / 2)[0], y0, at(0, W / 2)[1]], [at(len, W / 2)[0], y1, at(len, W / 2)[1]], [at(len, -W / 2)[0], y1, at(len, -W / 2)[1]], [0, 1, 0]);
      for (const b of [-W / 2, W / 2]) quadN(F, [at(0, b)[0], y0, at(0, b)[1]], [at(len, b)[0], y1, at(len, b)[1]], [at(len, b)[0], y1 - 0.6, at(len, b)[1]], [at(0, b)[0], y0 - 0.6, at(0, b)[1]], [px * Math.sign(b), 0, pz * Math.sign(b)]);
      for (let s = 3; s < len; s += 4) for (const b of [-W / 2 + 0.4, W / 2 - 0.4]) { const [x, z] = at(s, b); F.cyl(x, WATER_Y - 3, z, 0.22, 0.22, yAt(s) - 0.5 - (WATER_Y - 3), 6, false); }
      metal.setColor(C.steel); for (const b of [-1.1, 1.1]) metal.tube([at(0, b)[0], y0 + 0.08, at(0, b)[1]], [at(len, b)[0], y1 + 0.08, at(len, b)[1]], 0.06, 4);
      rampPrism(rect(mx + ux * len / 2, mz + uz * len / 2, ux, uz, -len / 2, len / 2, -W / 2, W / 2), y1 - 0.6, mx, mz, y0, ux, uz, len, y1);
      // the trolley with a yacht on it, halfway down the slip
      const ts = Math.min(len * 0.3, 7), [tx, tz] = at(ts, 0), ty = yAt(ts), tilt = Math.atan2(y0 - y1, len);
      metal.with(M4(tx, ty, tz, Math.atan2(-uz, ux)).multiply(rotZ(-tilt)), d => { d.setColor(C.yellow); d.box(-3, 0.1, -1.3, 3, 0.35, 1.3); for (const [a, b] of [[-2.2, -1], [2.2, -1], [-2.2, 1], [2.2, 1]]) d.cyl(a, 0.35, b, 0.06, 0.06, 1.1, 5, false); d.setColor(C.black); for (const [a, b] of [[-2.6, -1.1], [2.6, -1.1], [-2.6, 1.1], [2.6, 1.1]]) d.box(a - 0.25, -0.05, b - 0.08, a + 0.25, 0.2, b + 0.08); });
      boats.push({ kind: 'yacht', x: tx, z: tz, y: ty + 0.35 + 1.75, ry: Math.atan2(uz, -ux), pitch: tilt, s: 1.0, r: 2, afloat: false });
      slip = { mx, mz, ux, uz, px, pz, top: y0 };
    }
  }
  if (slip) { // pillar jib crane on the quay beside the slip, jib out over the water
    const { mx, mz, ux, uz, px, pz, top } = slip, x = mx - ux * 2.5 + px * 7.5, z = mz - uz * 2.5 + pz * 7.5, ry = Math.atan2(-uz, ux), H = 7.5, J = 10;
    metal.with(M4(x, top, z, ry + 0.25), d => {
      d.setColor(C.concD); d.box(-1.3, 0, -1.3, 1.3, 0.6, 1.3);
      d.setColor(C.yellow); d.cyl(0, 0.6, 0, 0.32, 0.26, H, 12, true); d.box(-0.5, H + 0.2, -0.5, 0.5, H + 0.9, 0.5);
      d.box(-2.2, H + 0.45, -0.22, J, H + 0.9, 0.22); // jib
      d.tube([0, H + 2.4, 0], [J - 0.3, H + 0.9, 0], 0.05, 5); d.tube([0, H + 2.4, 0], [-2.1, H + 0.9, 0], 0.05, 5); d.cyl(0, H + 0.9, 0, 0.12, 0.08, 1.5, 6, true);
      d.setColor(C.concD); d.box(-2.2, H - 0.4, -0.5, -1.2, H + 0.45, 0.5); // counterweight
      d.setColor(C.black); d.box(J - 1.0, H + 0.1, -0.35, J - 0.2, H + 0.45, 0.35); d.box(J - 0.63, H - 3.5, -0.02, J - 0.57, H + 0.1, 0.02);
      d.setColor(C.red); d.box(J - 0.8, H - 3.9, -0.2, J - 0.4, H - 3.5, 0.2);
    });
    S.cyl(x, z, top, top + H + 0.9, 0.34, 0.34, 'pole'); Z.add(x, top + H + 2.4, z, 0, 1, 0, 'antenna');
    const [jx, jz] = [x + Math.cos(ry + 0.25) * J * 0.5, z - Math.sin(ry + 0.25) * J * 0.5];
    const c = Math.cos(ry + 0.25), sn = -Math.sin(ry + 0.25);
    S.prism(rect(jx, jz, c, sn, -J / 2 - 2.2, J / 2, -0.25, 0.25).flat(), top + H + 0.45, top + H + 0.9, 0, 0, 'ledge');
  }
  // yachts ashore on cradles: flat land inside the marina behind the quay, clear of buildings
  {
    const blds = (map.buildings ?? []).filter(b => { const [x, z] = [b.p[0], b.p[1]]; return marina.some(P => { const c = centroid(P); return Math.hypot(x - c[0], z - c[1]) < 260; }); }).map(b => { const Q = []; for (let i = 0; i < b.p.length; i += 2) Q.push([b.p[i], b.p[i + 1]]); return Q; });
    const inBld = (x, z) => blds.some(Q => inPoly(Q, x, z));
    let n = 0;
    for (const P of marina) {
      const q = quays[0]; if (!q) break; // all cradles square to the main quay
      const ux = -q.nx, uz = -q.nz, ry = Math.atan2(-q.nz, q.nx) + PI / 2;
      const cands = [];
      for (const qq of quays) for (let s = 4; s < qq.L - 4; s += 5) for (const back of [14, 22, 30]) cands.push([qq.ax + (qq.bx - qq.ax) * s / qq.L - qq.nx * back, qq.az + (qq.bz - qq.az) * s / qq.L - qq.nz * back]);
      for (const [x, z] of cands) {
        if (n >= 9 || !inPoly(P, x, z) || isWater(x, z) || inBld(x, z) || !boatFree(x, z, 2.6)) continue;
        const [x0, z0] = [x + ux * 5, z + uz * 5], [x1, z1] = [x - ux * 5, z - uz * 5]; if (inBld(x0, z0) || inBld(x1, z1) || Math.abs(gh(x0, z0) - gh(x1, z1)) > 0.8) continue;
        const g = gh(x, z), kind = R() < 0.75 ? 'yacht' : 'motor', s = 0.85 + R() * 0.3, y = g + (kind === 'yacht' ? 2.2 : 1.1) * s;
        boats.push({ kind, x, z, y, ry: ry + (R() - 0.5) * 0.1, s, r: 2.4, afloat: false });
        metal.with(M4(x, g, z, ry), d => { d.setColor(C.steel); for (const a of [-2.5, 1.5]) for (const b of [-1, 1]) d.tube([a, 0, b * 1.3], [a, y - g - 0.5, b * 0.9], 0.05, 4); d.setColor(C.teak); d.box(-3, 0, -0.3, 3, y - g - (kind === 'yacht' ? 1.35 * s : 0.55 * s), 0.3); });
        S.prism(rect(x, z, Math.cos(ry), -Math.sin(ry), -4.5 * s, 4.5 * s, -1.4, 1.4).flat(), g, y + 1.1 * s, 0, 0, 'roof');
        n++;
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- the historic ship at the water station
  for (const o of SHIP) {
    const P = toRing(geo, o.p), bb = obb(P); if (!bb) continue;
    const L = bb.L, B = Math.max(3, bb.W), ry = Math.atan2(-bb.uz, bb.ux);
    const afloat = isWater(bb.cx, bb.cz), g = afloat ? WATER_Y : Math.min(...P.map(([x, z]) => gh(x, z)));
    const y = afloat ? WATER_Y : g + 1.1;
    const { hull, top } = boatGeometry('motor', L, B, 1.4, 1.1, true);
    const hm = new THREE.Mesh(hull, new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.45, side: THREE.DoubleSide }));
    const M = M4(bb.cx, y, bb.cz, ry); hm.applyMatrix4(M); add(hm, 'ship-hull');
    const dm = new THREE.Mesh(top, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })); dm.applyMatrix4(M); add(dm, 'ship-deck');
    F.with(M, d => { // superstructure: long deckhouse with portholes, wheelhouse, funnel, mast, blue boot stripe
      const h = 1.4 * 1.05;
      d.setColor(C.white); d.box(-0.36 * L, h, -0.36 * B, 0.2 * L, h + 2.0, 0.36 * B);
      d.setColor(C.glass); for (let a = -0.33 * L; a < 0.18 * L; a += 1.3) for (const s of [-1, 1]) d.box(a, h + 0.9, s * 0.36 * B - 0.03, a + 0.8, h + 1.5, s * 0.36 * B + 0.03);
      d.setColor(C.white); d.box(0.02 * L, h + 2.0, -0.28 * B, 0.2 * L, h + 3.3, 0.28 * B);
      d.setColor(C.glass); d.box(0.2 * L - 0.02, h + 2.5, -0.26 * B, 0.2 * L + 0.03, h + 3.1, 0.26 * B);
      d.setColor(C.blue); d.box(-0.37 * L, h + 2.0, -0.37 * B, 0.21 * L, h + 2.15, 0.37 * B);
      d.setColor(C.red); d.cyl(-0.12 * L, h + 2.0, 0, 0.45, 0.4, 1.6, 10, true); d.setColor(C.black); d.cyl(-0.12 * L, h + 3.6, 0, 0.42, 0.42, 0.2, 10, true);
      d.setColor(C.rail); d.cyl(0.12 * L, h + 3.3, 0, 0.05, 0.03, 3.5, 5, true);
      if (!afloat) { d.setColor(C.concD); for (const a of [-0.3, 0, 0.3]) d.box(a * L - 0.4, -1.15, -0.8, a * L + 0.4, -0.6, 0.8); }
    });
    S.prism(rect(bb.cx, bb.cz, bb.ux, bb.uz, -L / 2, L / 2, -B / 2, B / 2).flat(), y - 1, y + 1.5, 0, 0, 'roof');
    S.prism(rect(bb.cx, bb.cz, bb.ux, bb.uz, -0.36 * L, 0.2 * L, -0.36 * B, 0.36 * B).flat(), y + 1.5, y + 1.47 + 2.0, 0, 0, 'roof');
  }

  // ---------------------------------------------------------------------------------------------- meshes
  const vcol = (o) => Object.assign(new THREE.MeshStandardMaterial(o), { vertexColors: true });
  add(new THREE.Mesh(F.build(), vcol({ roughness: 0.85 })), 'concrete');
  add(new THREE.Mesh(metal.build(), vcol({ roughness: 0.45, metalness: 0.5 })), 'metal');
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.95, 0.8) });
  if (glow.v) add(new THREE.Mesh(glow.build(), lampMat), 'lamps', false);
  const TYPES = { yacht: boatGeometry('yacht', 9.5, 3.2, 0.95, 0.75), motor: boatGeometry('motor', 7, 2.6, 0.85, 0.55) };
  const TINT = [0xf4f3ef, 0xf4f3ef, 0xf4f3ef, 0xf4f3ef, 0x1f3552, 0x8e1f1c, 0x2d5f4a, 0xd9d2c0].map(c => new THREE.Color(c));
  const hullMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.05, side: THREE.DoubleSide });
  const topMat = vcol({ roughness: 0.6 });
  const inst = {};
  for (const [kind, g] of Object.entries(TYPES)) {
    const list = boats.filter(b => b.kind === kind); if (!list.length) continue;
    const hm = new THREE.InstancedMesh(g.hull, hullMat, list.length), tm = new THREE.InstancedMesh(g.top, topMat, list.length);
    list.forEach((b, i) => hm.setColorAt(i, TINT[Math.floor(R() * TINT.length)]));
    add(hm, kind + '-hulls'); add(tm, kind + '-tops');
    inst[kind] = { list, hm, tm };
    for (const b of list) if (b.afloat) S.prism(rect(b.x, b.z, Math.cos(b.ry), -Math.sin(b.ry), -4.3 * b.s, 4.3 * b.s, -1.3 * b.s, 1.3 * b.s).flat(), WATER_Y - 0.4, WATER_Y + 0.95 * b.s, 0, 0, 'roof');
  }
  const m = new THREE.Matrix4(), rot = new THREE.Quaternion(), eul = new THREE.Euler(0, 0, 0, 'YXZ'), at = new THREE.Vector3(), one = new THREE.Vector3();
  const place = (time) => { // afloat boats bob, roll and pitch a little; boats ashore stay put
    for (const { list, hm, tm } of Object.values(inst)) {
      for (let i = 0; i < list.length; i++) {
        const b = list[i], w = b.afloat ? 1 : 0;
        eul.set(w * 0.025 * Math.sin(0.7 * time + 1.7 * b.ph), b.ry, (b.pitch ?? 0) + w * 0.012 * Math.sin(0.6 * time + b.ph));
        m.compose(at.set(b.x, (b.y ?? WATER_Y) + w * 0.06 * Math.sin(0.9 * time + b.ph), b.z), rot.setFromEuler(eul), one.setScalar(b.s));
        for (const im of [hm, tm]) im.setMatrixAt(i, m);
      }
      for (const im of [hm, tm]) im.instanceMatrix.needsUpdate = true;
    }
  };
  place(0);

  const clear = (x, z) => inMarina(x, z);
  console.log(`[cherkasy] yacht club: ${quays.length} quay segments, ${pontoons.length} pontoons, ${boats.filter(b => b.afloat).length} boats afloat + ${boats.filter(b => !b.afloat).length} ashore, slip ${slip ? 'yes' : 'no'}; ${nV} vertices, ${S.count - s0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  let time = 0;
  return {
    clear,
    update(dt) { time += dt; place(time); lampMat.color.setScalar(0.5 + 1.6 * nightK.value); },
  };
}

// flat quad p0..p3 wound so that its front side faces n
function quadN(D, p0, p1, p2, p3, n) {
  const e1 = new THREE.Vector3().fromArray(p1).sub(new THREE.Vector3().fromArray(p0)), e2 = new THREE.Vector3().fromArray(p2).sub(new THREE.Vector3().fromArray(p0));
  const ring = e1.cross(e2).dot(new THREE.Vector3().fromArray(n)) < 0 ? [p0, p3, p2, p1] : [p0, p1, p2, p3];
  D.quad(...ring.map((p) => D.vert(p[0], p[1], p[2], n[0], n[1], n[2])));
}
