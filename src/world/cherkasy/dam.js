// OWNER: cherkasy. The Cherkasy crossing north of the city (just outside the map region): a road + railway approach
// embankment from Sosnivka, the ~1.13 km combined road-rail truss bridge over the Dnipro channel (OSM man_made=bridge
// 899453334) and the start of the Cherkasy dam across the Kremenchuk reservoir (road + single track side by side).
// Refs (research/bridge.md): 10 truss spans + 2 short openings, navigation spans ~100-110 m with 12.5 m clearance,
// 7 m roadway + one track on one structure. UNCERTAIN (not in the refs, chosen here): parallel-chord Warren through
// trusses with verticals, 12 m deep, grey paint; wall piers with round noses; dam crest ~5 m above water with riprap
// slopes; guard rails and lamp posts on the road.
//   buildDam({ root, solids, zips, heightAt, geo }) -> { update(dt) }
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { area2, obb } from './geo.js';
import { ROAD, RAIL, BRIDGE } from './dam_data.js';

const PI = Math.PI, WATER_Y = -1.6, DECK_Y = WATER_Y + 14.5, DAM_Y = WATER_Y + 5.2, TRUSS_H = 12;
const C = { steel: 0x78828a, steelD: 0x5d666d, conc: 0xa6a39b, concD: 0x85827a, rip: 0x8a857a, ripD: 0x6e6a61, grass: 0x6b7a42, rail: 0xc9ccce, pole: 0x6f757a };

export function buildDam({ root, solids: S, zips: Z, heightAt, geo }) {
  const t0 = performance.now(), s0 = S.count;
  const gh = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : WATER_Y - 3; };
  const group = Object.assign(new THREE.Group(), { name: 'cherkasy-dam' });
  root.add(group);
  let nV = 0;
  // one mesh per builder: material options -> MeshStandardMaterial unless a material is given
  const add = (mb, mat, name, shadow = true) => {
    const mesh = new THREE.Mesh(mb.build(), mat.isMaterial ? mat : new THREE.MeshStandardMaterial(mat));
    Object.assign(mesh, { name: `dam-${name}`, castShadow: shadow, receiveShadow: true });
    nV += mesh.geometry.attributes.position.count;
    group.add(mesh);
    return mesh;
  };

  // ---------------------------------------------------------------------------------------------- bridge frame + vertical profile
  const outline = BRIDGE.map(p => geo.toXZ(p[0], p[1])); outline.pop();
  const bb = obb(outline);
  if (bb.ux < 0) { bb.ux = -bb.ux; bb.uz = -bb.uz; } // +u runs away from the city (east)
  const { ux, uz } = bb, wx = -uz, wz = ux, BW = Math.max(16, Math.min(19, bb.W)), bL = bb.L;
  const b0 = [bb.cx - ux * bL / 2, bb.cz - uz * bL / 2]; // city end of the bridge
  const along = (x, z) => (x - b0[0]) * ux + (z - b0[1]) * uz; // metres along the bridge axis from its city end
  const across = (x, z) => (x - b0[0]) * wx + (z - b0[1]) * wz;
  const B = (s, w, y) => [b0[0] + ux * s + wx * w, y, b0[1] + uz * s + wz * w];
  const onBridge = (s) => s >= 0 && s <= bL;
  const yAt = (x, z) => {
    const s = along(x, z);
    if (s < 0) return Math.max(gh(x, z) + 1.2, DECK_Y + s * 0.014); // approach embankment climbing to the deck
    if (s <= bL) return DECK_Y;
    return Math.max(DAM_Y, DECK_Y - (s - bL) * 0.022);
  };

  // resample a centre line every `step` m
  const line = (LL, step) => {
    const P = LL.map(([lat, lon]) => geo.toXZ(lat, lon)), out = [];
    eachSeg(P, (i, ax, az, bx, bz, L) => { for (let d = 0; d < L; d += step) { const t = d / L; out.push([ax + t * (bx - ax), az + t * (bz - az)]); } }, 0);
    out.push(P[P.length - 1]);
    return out;
  };
  const road = line(ROAD, 8), rail = line(RAIL, 8);

  // ---------------------------------------------------------------------------------------------- textures
  const roadTex = canvasTex(128, 512, (g, w, h) => {
    g.fillStyle = '#4a4b4d'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = '#e8e6df'; g.fillRect(8, 0, 4, h); g.fillRect(w - 12, 0, 4, h); g.fillRect(w / 2 - 2, 0, 4, h * 0.45);
  });
  const railTex = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#7b736a'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 1400; k++) { const v = 90 + Math.random() * 70; g.fillStyle = `rgb(${v},${v - 6},${v - 12})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    g.fillStyle = '#3d2f25'; for (let y = 8; y < h; y += 32) g.fillRect(18, y, w - 36, 12);
    g.fillStyle = '#b9bcbd'; g.fillRect(40, 0, 5, h); g.fillRect(w - 45, 0, 5, h);
  });
  const strip = (D, P, half, ys, vScale) => { // textured ribbon along P (u across 0..1, v along)
    let v0 = 0;
    eachSeg(P, (i, ax, az, bx, bz, L, nx, nz) => {
      const v1 = v0 + L / vScale, ox = nx * half, oz = nz * half;
      const corner = (x, y, z, u, v) => D.vert(x, y, z, 0, 1, 0, u, v);
      const a = corner(ax + ox, ys[i], az + oz, 0, v0), b = corner(ax - ox, ys[i], az - oz, 1, v0);
      const c = corner(bx - ox, ys[i + 1], bz - oz, 1, v1), d = corner(bx + ox, ys[i + 1], bz + oz, 0, v1);
      // keep the face up: pick the winding from the turn a -> b -> c seen from above
      const turn = (-2 * oz) * (bx - ax - 2 * ox) + 2 * ox * (bz - az - 2 * oz);
      turn > 0 ? D.quad(a, b, c, d) : D.quad(a, d, c, b);
      v0 = v1;
    });
  };

  // ---------------------------------------------------------------------------------------------- embankments (off the bridge)
  const [E, M, glow] = [0, 0, 0].map(() => new MB());
  const bank = (P, crest, top) => eachSeg(P, (i, ax, az, bx, bz, L, nx, nz) => { // trapezoid body: crest half-width, 1:2 slopes down to the ground / reservoir bed
      if (onBridge(along(ax, az)) && onBridge(along(bx, bz))) return;
      const ya = top[i], yb = top[i + 1];
      for (const sd of [-1, 1]) {
        const fa = Math.min(gh(ax + nx * sd * crest, az + nz * sd * crest), ya), fb = Math.min(gh(bx + nx * sd * crest, bz + nz * sd * crest), yb);
        const ba = Math.max(WATER_Y - 3, fa - 0.5), bbm = Math.max(WATER_Y - 3, fb - 0.5), da = crest + (ya - ba) * 2, db = crest + (yb - bbm) * 2;
        const wet = fa < WATER_Y + 0.5;
        E.setColor(wet ? ((i >> 1) % 2 ? C.rip : C.ripD) : C.grass);
        const off = (x, z, w, y) => [x + nx * sd * w, y, z + nz * sd * w];
        E.face([off(ax, az, crest, ya), off(bx, bz, crest, yb), off(bx, bz, db, bbm), off(ax, az, da, ba)], [nx * sd, 0.5, nz * sd]);
      }
      const cr = (x, z, sgn, y) => [x + sgn * nx * crest, y - 0.02, z + sgn * nz * crest];
      E.setColor(0x8c8676).face([cr(ax, az, 1, ya), cr(bx, bz, 1, yb), cr(bx, bz, -1, yb), cr(ax, az, -1, ya)], [0, 1, 0]);
      if (i % 3) return;
      // crest collision: a prism every 3 segments, its top the slope from this point to the one 3 ahead
      const j = Math.min(P.length - 1, i + 3), [cx, cz] = P[j], y0 = top[i], y1 = top[j];
      const Q = [[ax, az, 1], [cx, cz, 1], [cx, cz, -1], [ax, az, -1]].map(([x, z, sgn]) => [x + sgn * nx * crest, z + sgn * nz * crest]);
      if (area2(Q) < 0) Q.reverse();
      const len = Math.hypot(cx - ax, cz - az) || 1, grade = (y1 - y0) / (len * len), gx = (cx - ax) * grade, gz = (cz - az) * grade;
      S.prism(Q.flat(), Math.min(y0, y1) - 3, y0 - gx * ax - gz * az, gx, gz, 'roof');
  });
  const roadY = road.map(([x, z]) => yAt(x, z)), railY = rail.map(([x, z]) => yAt(x, z));
  bank(road, 7.5, roadY); bank(rail, 4.5, railY);

  // road + rail surfaces (the whole length, bridge included)
  const RD = new MB(), RL = new MB();
  strip(RD, road, 3.6, roadY.map(y => y + 0.05), 24); strip(RL, rail, 1.7, railY.map(y => y + 0.08), 12);
  // guard rails + lamps along the road
  eachSeg(road, (i, ax, az, bx, bz, L, nx, nz) => {
    M.setColor(C.rail);
    for (const sd of [-1, 1]) {
      const pa = [ax + nx * sd * 4.6, roadY[i] + 0.75, az + nz * sd * 4.6], pb = [bx + nx * sd * 4.6, roadY[i + 1] + 0.75, bz + nz * sd * 4.6];
      M.with(M4((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2, Math.atan2(-(bz - az), bx - ax)), d => d.box(-L / 2, -0.17, -0.03, L / 2, 0.17, 0.03));
      M.cyl(pa[0], roadY[i], pa[2], 0.05, 0.05, 0.6, 4, false);
    }
    if (i % 10 === 0) { // lamp post on the rail-far side, arm over the road
      const sd = 1, px = ax + nx * sd * 5.2, pz = az + nz * sd * 5.2, y = roadY[i];
      M.setColor(C.pole); M.cyl(px, y, pz, 0.12, 0.08, 9, 6, false); M.tube([px, y + 9, pz], [px - nx * sd * 2.2, y + 9.3, pz - nz * sd * 2.2], 0.06, 4);
      glow.box(px - nx * sd * 2.2 - 0.3, y + 9.05, pz - nz * sd * 2.2 - 0.3, px - nx * sd * 2.2 + 0.3, y + 9.2, pz - nz * sd * 2.2 + 0.3);
      S.cyl(px, pz, y, y + 9, 0.12, 0.12, 'pole');
    }
  });

  // ---------------------------------------------------------------------------------------------- the bridge
  // 2 short openings at the ends + 10 truss spans between them
  const end = 34, span = (bL - 2 * end) / 10;
  const cuts = [0, ...Array.from({ length: 11 }, (_, k) => end + k * span), bL];
  const T = new MB().setColor(C.steel), P = new MB();
  const halfW = BW / 2;
  // deck slab + edge girders over the whole length
  P.setColor(C.concD);
  P.with(M4(...B(bL / 2, 0, DECK_Y - 1.4), Math.atan2(-uz, ux)), d => { d.box(-bL / 2, 0, -halfW, bL / 2, 1.35, halfW); });
  // piers
  for (let k = 0; k < cuts.length; k++) {
    const s = cuts[k], [x, , z] = B(s, 0, 0);
    if (k === 0 || k === cuts.length - 1) { // abutments
      P.setColor(C.conc); P.with(M4(x, 0, z, Math.atan2(-uz, ux)), d => d.box(-6, WATER_Y - 3, -halfW - 1, 6, DECK_Y - 1.4, halfW + 1));
      continue;
    }
    const wide = k === 1 || k === cuts.length - 2 ? 2.2 : 3.2;
    P.setColor(C.conc);
    P.with(M4(x, 0, z, Math.atan2(-uz, ux)), d => {
      d.box(-wide / 2, WATER_Y - 6, -halfW + 1, wide / 2, DECK_Y - 2.4, halfW - 1);
      for (const sd of [-1, 1]) d.cyl(0, WATER_Y - 6, sd * (halfW - 1), wide / 2, wide / 2, DECK_Y - 2.4 - (WATER_Y - 6), 12, true);
      d.setColor(C.concD); d.box(-wide / 2 - 0.4, DECK_Y - 2.4, -halfW - 0.6, wide / 2 + 0.4, DECK_Y - 1.4, halfW + 0.6);
    });
    S.prism(rectQ(x, z, ux, uz, -wide / 2, wide / 2, -halfW, halfW), WATER_Y - 6, DECK_Y - 1.4, 0, 0, 'wall');
  }
  // trusses on the 10 main spans
  const member = (a, b, r) => { T.tube(a, b, r, 4, true); };
  for (let k = 1; k < 11; k++) {
    const s0 = cuts[k] + 0.6, s1 = cuts[k + 1] - 0.6, n = Math.max(6, Math.round((s1 - s0) / 10.5)), pl = (s1 - s0) / n, yb = DECK_Y - 0.2, yt = DECK_Y + TRUSS_H;
    for (const sd of [-1, 1]) {
      const w = sd * (halfW - 0.4);
      member(B(s0, w, yb), B(s1, w, yb), 0.45); // bottom chord
      member(B(s0 + pl, w, yt), B(s1 - pl, w, yt), 0.5); // top chord
      member(B(s0, w, yb), B(s0 + pl, w, yt), 0.45); member(B(s1, w, yb), B(s1 - pl, w, yt), 0.45); // end posts (inclined)
      for (let p = 1; p < n; p++) member(B(s0 + p * pl, w, yb), B(s0 + p * pl, w, yt), 0.22); // verticals
      for (let p = 1; p < n - 1; p++) { const a = s0 + p * pl, b = a + pl; if (p % 2) member(B(a, w, yt), B(b, w, yb), 0.28); else member(B(a, w, yb), B(b, w, yt), 0.28); } // Warren diagonals
      const ta = B(s0 + pl, w, yt), tb = B(s1 - pl, w, yt), tc = B((s0 + s1) / 2, w, yt);
      Z.edge(ta[0], ta[2], tb[0], tb[2], yt + 0.5, wx * sd, wz * sd, 'ledge', 10);
      S.prism(rectQ(tc[0], tc[2], ux, uz, -(s1 - s0) / 2 + pl, (s1 - s0) / 2 - pl, -0.5, 0.5), yt - 0.5, yt + 0.5, 0, 0, 'ledge');
    }
    // top lateral bracing + portals
    for (let p = 1; p < n; p++) { const a = s0 + p * pl; member(B(a, -(halfW - 0.4), yt), B(a, halfW - 0.4, yt), 0.18); if (p < n - 1) { member(B(a, -(halfW - 0.4), yt), B(a + pl, halfW - 0.4, yt), 0.1); member(B(a, halfW - 0.4, yt), B(a + pl, -(halfW - 0.4), yt), 0.1); } }
    for (const a of [s0 + pl, s1 - pl]) { member(B(a, -(halfW - 0.4), yt - 2.2), B(a, halfW - 0.4, yt - 2.2), 0.25); for (const sd of [-1, 1]) member(B(a, sd * (halfW - 0.4), yt - 4.2), B(a, sd * (halfW - 3.4), yt - 2.2), 0.15); }
    // navigation lights on the channel spans (3rd and 4th from the city end)
    if (k === 3 || k === 4) { const c = B((s0 + s1) / 2, 0, DECK_Y - 1.6); glow.box(c[0] - 0.3, c[1] - 0.6, c[2] - 0.3, c[0] + 0.3, c[1], c[2] + 0.3); }
  }
  // short end openings: plate girders with a low railing
  for (const [a, b] of [[cuts[0], cuts[1]], [cuts[11], cuts[12]]]) for (const sd of [-1, 1]) {
    T.setColor(C.steelD); T.with(M4(...B((a + b) / 2, sd * (halfW - 0.3), DECK_Y - 1.4), Math.atan2(-uz, ux)), d => d.box(-(b - a) / 2, -1.8, -0.3, (b - a) / 2, 0.2, 0.3));
    T.setColor(C.rail); for (let s = a; s <= b; s += 2) T.cyl(...B(s, sd * (halfW - 0.3), DECK_Y), 0.05, 0.05, 1.1, 4, false);
    T.tube(B(a, sd * (halfW - 0.3), DECK_Y + 1.1), B(b, sd * (halfW - 0.3), DECK_Y + 1.1), 0.05, 4); T.setColor(C.steel);
  }
  // deck collision
  S.prism(rectQ(bb.cx, bb.cz, ux, uz, -bL / 2, bL / 2, -halfW, halfW), DECK_Y - 1.4, DECK_Y, 0, 0, 'roof');

  // ---------------------------------------------------------------------------------------------- meshes
  const vc = (roughness, metalness = 0) => ({ vertexColors: true, roughness, metalness });
  add(E, vc(0.95), 'embankment');
  add(RD, { map: roadTex, roughness: 0.9 }, 'road', false);
  add(RL, { map: railTex, roughness: 0.95 }, 'track', false);
  add(M, vc(0.5, 0.5), 'rails-lamps');
  add(P, vc(0.9), 'piers');
  add(T, vc(0.55, 0.55), 'trusses');
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 0.6) });
  add(glow, lampMat, 'lamps', false);

  console.log(`[cherkasy] dam + bridge: bridge ${bL.toFixed(0)} m x ${BW.toFixed(1)} m (10 truss spans of ${span.toFixed(0)} m), road ${road.length * 8} m, rail ${rail.length * 8} m; ${nV} vertices, ${S.count - s0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  return { update() { lampMat.color.setScalar(0.35 + 1.6 * nightK.value); } };
}

function rectQ(cx, cz, ux, uz, a0, a1, b0, b1) {
  const Q = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, b]) => [cx + ux * a - uz * b, cz + uz * a + ux * b]);
  if (area2(Q) < 0) Q.reverse();
  return Q.flat();
}
// visit the segments of a polyline: fn(i, ax, az, bx, bz, length, nx, nz) with (nx, nz) the unit left normal;
// segments shorter than minLen are skipped
function eachSeg(P, fn, minLen = 0.01) {
  P.forEach((a, i) => {
    const b = P[i + 1]; if (!b) return;
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    if (L >= minLen && L > 0) fn(i, a[0], a[1], b[0], b[1], L, -dz / L, dx / L);
  });
}
