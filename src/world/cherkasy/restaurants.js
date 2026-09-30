// OWNER: cherkasy. Two restaurants by the Rose Valley, replacing their OSM extrusions:
//   Chaika (OSM way 169359452, uzviz Kniaziv Koriatovychiv 3): 1960s Soviet modernism on the slope of Zamkova hora,
//     white walls, floor-to-ceiling panoramic glazing + a ribbon window under a thin cantilevered roof slab toward the
//     Dnipro, red neon "ЧАЙКА" letters on the roof, a mosaic panel (gull over the waves) on the blank end wall, the
//     summer terrace ("Тераса на Чайці") with parasols over the valley.
//   Fabrica (OSM way 209647511, ex-"Rybka", on Haharyna by the valley): two storeys of dark burgundy brick with
//     anthracite post-and-beam glazing (Framex), a thin dark cornice slab, a stair tower with the vertical FABRICA sign,
//     the summer terrace toward the beach, a small pond and the wire fish sculptures (refs: the 2019 render + site photos).
//   RESTAURANT_SKIP: OSM ids replaced here
//   buildRestaurants({ root, map, solids, zips, heightAt, ground, geo }) -> { update(dt), clear(x, z) }
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex, decal } from './sculpt.js';
import { ringPts, area2, convexParts, rng, centroid, inPoly } from './geo.js'; // rng: textures

const CHAIKA = 169359452, FABRICA = 209647511;
export const RESTAURANT_SKIP = new Set([CHAIKA, FABRICA]);
const PI = Math.PI;
const VALLEY = [49.45063, 32.0647];

// edge frame: a along A->B, d outward, y up from y0 (the building's ground-floor datum) (ring ccw in the map sense: outward = (uz, -ux))
class Edge {
  constructor(A, B, y0 = 0) { this.A = A; this.B = B; const dx = B[0] - A[0], dz = B[1] - A[1]; this.L = Math.hypot(dx, dz); this.ux = dx / this.L; this.uz = dz / this.L; this.nx = this.uz; this.nz = -this.ux; this.M = M4(A[0], y0, A[1], Math.atan2(-this.uz, this.ux)); }
  xz(a, d) { return [this.A[0] + this.ux * a + this.nx * d, this.A[1] + this.uz * a + this.nz * d]; }
  box(D, a0, a1, y0, y1, d0, d1) { D.with(this.M, q => q.box(a0, y0, -d1, a1, y1, -d0)); }
  // vertical plane at depth d facing outward, uv 0..1
  plane(D, a0, a1, y0, y1, d) { D.with(this.M, q => { const v = [q.vert(a0, y0, -d, 0, 0, -1, 1, 0), q.vert(a1, y0, -d, 0, 0, -1, 0, 0), q.vert(a1, y1, -d, 0, 0, -1, 0, 1), q.vert(a0, y1, -d, 0, 0, -1, 1, 1)]; /* seen from outside +a runs leftward */ q.tri(v[0], v[2], v[1]); q.tri(v[0], v[3], v[2]); }); }
}

const textTex = (text, { w = 1024, h = 256, fg = '#fff', bg = null, font = 'bold 170px Arial, sans-serif', glow = null, vertical = false } = {}) => canvasTex(w, h, (g) => {
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); } else g.clearRect(0, 0, w, h);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (glow) { g.shadowColor = glow; g.shadowBlur = 24; }
  if (vertical) { const ch = [...text], step = h / (ch.length + 0.6); ch.forEach((c, i) => g.fillText(c, w / 2, step * (i + 0.8))); }
  else g.fillText(text, w / 2, h / 2 + 6);
}, { repeat: false });

export function buildRestaurants({ root, map, solids: S, zips: Z, heightAt, ground, geo }) {
  const t0 = performance.now();
  const g = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 0; };
  const group = new THREE.Group(); group.name = 'restaurants'; root.add(group);
  const glow = []; // [material, day, night]
  const add = (d, mat, name, shadow = true) => { if (!d.v) return null; const m = new THREE.Mesh(d.build(), mat); m.name = 'restaurant-' + name; m.castShadow = shadow; m.receiveShadow = true; group.add(m); return m; };
  const litGlass = (color) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.06, metalness: 0.6, envMapIntensity: 1.5, emissive: 0xffb866, emissiveIntensity: 0.02 }); glow.push([m, 0.02, 0.55]); return m; };
  const polys = [];
  const footprint = (id) => { const b = map.buildings.find(q => q.id === id); if (!b) return null; let P = ringPts(b.p); if (area2(P) < 0) P = P.reverse(); polys.push(P); return P; };
  const siteLevel = (P) => { const hs = P.map(([x, z]) => g(x, z)); return { g0: Math.max(...hs) + 0.15, gLo: Math.min(...hs) - 0.6 }; };
  const isWater = (x, z) => ground?.isWater?.(x, z) ?? false;

  // =========================================================================================== Chaika
  (() => {
    const P = footprint(CHAIKA); if (!P) return;
    const { g0, gLo } = siteLevel(P), E = P.map((A, i) => new Edge(A, P[(i + 1) % P.length], g0)).filter(e => e.L > 0.5);
    const [cx, cz] = centroid(P), [vx, vz] = geo.toXZ(...VALLEY); let dx = vx - cx, dz = vz - cz; const dl = Math.hypot(dx, dz); dx /= dl; dz /= dl;
    const view = (e) => e.nx * dx + e.nz * dz > 0.3;
    const D = { white: new MB(), frame: new MB(), glass: new MB(), roof: new MB(), stone: new MB(), deck: new MB(), rail: new MB(), cloth: new MB(), steel: new MB(), mosaic: new MB(), sign: new MB() };
    const F1 = 4.4, F2 = 8.2, RT = 8.7;
    const mosaicEdge = E.filter(e => !view(e)).reduce((m, e) => (!m || e.L > m.L ? e : m), null);
    for (const e of E) {
      e.box(D.stone, -0.3, e.L + 0.3, gLo - g0, 0.25, -0.1, 0.35); // plinth / basement podium on the downhill side
      if (view(e)) {
        // ground floor: floor-to-ceiling glazing between slim mullions
        e.plane(D.glass, 0, e.L, 0.25, F1 - 0.35, -0.05);
        const n = Math.max(1, Math.round(e.L / 1.8)); for (let k = 0; k <= n; k++) { const a = k * e.L / n; e.box(D.frame, a - 0.05, a + 0.05, 0.25, F1 - 0.35, -0.05, 0.05); }
        e.box(D.frame, 0, e.L, 1.05, 1.1, -0.05, 0.04);
        // upper floor: white spandrel, ribbon window with vertical fins
        e.box(D.white, -0.1, e.L + 0.1, F1 - 0.35, 5.3, -0.1, 0.12);
        e.plane(D.glass, 0, e.L, 5.3, 7.7, 0.0);
        const m = Math.max(1, Math.round(e.L / 1.25)); for (let k = 0; k <= m; k++) { const a = k * e.L / m; e.box(D.white, a - 0.07, a + 0.07, 5.3, 7.7, 0, 0.45); }
        e.box(D.white, -0.1, e.L + 0.1, 7.7, F2, -0.1, 0.12);
      } else {
        e.box(D.white, -0.1, e.L + 0.1, 0.25, F2, -0.1, 0.1);
        // small band windows at the ground floor
        for (let a = 1.2; a + 1.4 < e.L - 0.6; a += 3.0) { e.plane(D.glass, a, a + 1.6, 2.1, 3.5, 0.11); e.box(D.frame, a - 0.06, a + 1.66, 2.04, 2.1, 0.1, 0.16); }
        if (e === mosaicEdge && e.L > 8) { const w = Math.min(14, e.L - 3), a0 = (e.L - w) / 2; e.plane(D.mosaic, a0, a0 + w, F1 + 0.2, F2 - 0.4, 0.12); }
      }
      // floor slab band + the thin cantilevered roof slab
      e.box(D.white, -0.3, e.L + 0.3, F1 - 0.35, F1, -0.1, 0.3);
      e.box(D.roof, -1.0, e.L + 1.0, F2, RT, -0.1, 1.0);
      Z.edge(...e.xz(0, 1.0), ...e.xz(e.L, 1.0), g0 + RT, e.nx, e.nz, 'roofEdge', 7);
    }
    for (const part of convexParts(P)) S.prism(part.flat(), gLo, g0 + RT, 0, 0, 'roof');
    { const Dr = D.roof; const tri = (A, B, C) => { const ids = [A, B, C].map(([x, z]) => Dr.vert(x, g0 + RT, z, 0, 1, 0)); const up = (B[1] - A[1]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[1] - A[1]) > 0; if (up) Dr.tri(ids[0], ids[1], ids[2]); else Dr.tri(ids[0], ids[2], ids[1]); };
      for (const part of convexParts(P)) for (let k = 1; k + 1 < part.length; k++) tri(part[0], part[k], part[k + 1]); }
    // roof sign: red neon ЧАЙКА on a steel frame over the longest view edge, a gull beside it
    const ve = E.filter(view).reduce((m, e) => (!m || e.L > m.L ? e : m), null);
    if (ve) {
      const w = Math.min(16, ve.L * 0.6), a0 = (ve.L - w) / 2, sy = RT + 0.4;
      const neon = new THREE.MeshStandardMaterial({ map: textTex('ЧАЙКА', { fg: '#ff2a2a', glow: '#ff3030', font: 'bold 190px "Arial Black", Arial, sans-serif' }), emissiveMap: null, emissive: 0xff2020, emissiveIntensity: 0.15, transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, roughness: 0.4 });
      neon.emissiveMap = neon.map; glow.push([neon, 0.35, 2.4]);
      const Ds = new MB(); ve.plane(Ds, a0, a0 + w, sy + 0.3, sy + 0.3 + w / 4, -3.0); add(Ds, neon, 'chaika-letters', false);
      for (let a = a0 + 0.5; a < a0 + w; a += 3) ve.box(D.steel, a - 0.05, a + 0.05, RT, sy + 0.4 + w / 4, -3.15, -3.05);
      ve.box(D.steel, a0, a0 + w, sy + 0.2, sy + 0.3, -3.15, -3.05);
      const gull = new THREE.MeshStandardMaterial({ map: canvasTex(256, 128, (c) => { c.clearRect(0, 0, 256, 128); c.strokeStyle = '#ffffff'; c.lineWidth = 14; c.lineCap = 'round'; c.shadowColor = '#9fd4ff'; c.shadowBlur = 12; c.beginPath(); c.moveTo(20, 60); c.quadraticCurveTo(70, 10, 128, 70); c.quadraticCurveTo(186, 10, 236, 60); c.stroke(); }, { repeat: false }), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, emissive: 0xbfe6ff, emissiveIntensity: 0.1 });
      gull.emissiveMap = gull.map; glow.push([gull, 0.1, 1.6]);
      const Dg = new MB(); ve.plane(Dg, a0 + w + 0.4, a0 + w + 4.4, sy + 1.5, sy + 3.5, -3.0); add(Dg, gull, 'chaika-gull', false);
      // terrace in front of the view edge: deck on posts, glass railing, parasols with tables
      const T0 = 0.4, T1 = 9, tA = 1.5, tB = ve.L - 1.5;
      ve.box(D.deck, tA, tB, -0.25, 0.2, T0, T1);
      for (let a = tA + 0.3; a < tB; a += 3) for (const d of [T0 + 2, T1 - 0.3]) { const [x, z] = ve.xz(a, d); const yb = g(x, z) - g0; if (yb < -0.3) ve.box(D.stone, a - 0.15, a + 0.15, yb - 0.3, -0.25, d - 0.15, d + 0.15); }
      const q = [ve.xz(tA, T0), ve.xz(tB, T0), ve.xz(tB, T1), ve.xz(tA, T1)]; S.prism((area2(q) < 0 ? q.reverse() : q).flat(), gLo, g0 + 0.2, 0, 0, 'ledge');
      ve.plane(D.rail, tA, tB, 0.2, 1.3, T1); for (const a of [tA, tB]) { const Dm = D.rail; ve.box(Dm, a - 0.02, a + 0.02, 0.2, 1.3, T0, T1); }
      ve.box(D.steel, tA, tB, 1.26, 1.32, T1 - 0.03, T1 + 0.03);
      for (let a = tA + 2.5; a < tB - 1.5; a += 4.2) for (const d of [3.2, 6.8]) {
        ve.box(D.steel, a - 0.03, a + 0.03, 0.2, 2.5, d - 0.03, d + 0.03); const [x, z] = ve.xz(a, d);
        D.cloth.cyl(x, g0 + 2.2, z, 1.5, 0.08, 0.5, 8, false);
        D.white.cyl(x, g0 + 0.2, z, 0.45, 0.45, 0.76, 10, true);
        for (const s of [-0.8, 0.8]) ve.box(D.frame, a + s - 0.22, a + s + 0.22, 0.2, 0.65, d - 0.22, d + 0.22);
      }
      Z.edge(...ve.xz(tA, T1), ...ve.xz(tB, T1), g0 + 1.3, ve.nx, ve.nz, 'ledge', 5);
    }
    const M = {
      white: new THREE.MeshStandardMaterial({ color: 0xeceae3, roughness: 0.75 }), frame: new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.45, metalness: 0.5 }),
      glass: litGlass(0x1b2c36), roof: new THREE.MeshStandardMaterial({ color: 0xdedbd3, roughness: 0.8 }), stone: new THREE.MeshStandardMaterial({ color: 0x7c776f, roughness: 0.9 }),
      deck: new THREE.MeshStandardMaterial({ color: 0x8a6446, roughness: 0.8 }), rail: new THREE.MeshStandardMaterial({ color: 0x9fc4cf, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
      cloth: new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.85, side: THREE.DoubleSide }), steel: new THREE.MeshStandardMaterial({ color: 0x2a2c2e, metalness: 0.7, roughness: 0.4 }),
      mosaic: new THREE.MeshStandardMaterial({ map: mosaicTex(), roughness: 0.35, metalness: 0.1 }), sign: new THREE.MeshStandardMaterial({ color: 0xffffff }),
    };
    for (const [k, d] of Object.entries(D)) add(d, M[k], 'chaika-' + k, !['glass', 'rail'].includes(k));
    Z.add(cx, g0 + RT, cz, 0, 1, 0, 'roofCorner');
  })();

  // =========================================================================================== Fabrica
  (() => {
    const P = footprint(FABRICA); if (!P) return;
    const { g0, gLo } = siteLevel(P), E = P.map((A, i) => new Edge(A, P[(i + 1) % P.length], g0)).filter(e => e.L > 0.4);
    const [cx, cz] = centroid(P);
    // toward the water (the beach side)
    let wx = 0, wz = 0; for (let k = 0; k < 24; k++) { const a = k / 24 * PI * 2; for (let d = 10; d < 260; d += 5) if (isWater(cx + Math.cos(a) * d, cz + Math.sin(a) * d)) { wx += Math.cos(a) / d; wz += Math.sin(a) / d; break; } }
    const wl = Math.hypot(wx, wz) || 1; wx /= wl; wz /= wl;
    const beachSide = (e) => e.nx * wx + e.nz * wz > 0.25;
    const D = { brick: new MB(), anth: new MB(), glass: new MB(), roof: new MB(), deck: new MB(), rail: new MB(), cloth: new MB(), stone: new MB() };
    const F1 = 4.2, F2 = 8.0, RT = 8.35;
    for (const e of E) {
      e.box(D.stone, -0.2, e.L + 0.2, gLo - g0, 0.2, -0.1, 0.25);
      if (beachSide(e) && e.L > 3) {
        // ground floor: anthracite post-and-beam glazing (Framex 50), transom at 3.1 m
        e.plane(D.glass, 0, e.L, 0.2, F1, 0.05);
        const n = Math.max(1, Math.round(e.L / 1.5)); for (let k = 0; k <= n; k++) { const a = k * e.L / n; e.box(D.anth, a - 0.05, a + 0.05, 0.2, F1, 0.0, 0.12); }
        e.box(D.anth, 0, e.L, 3.05, 3.15, 0.0, 0.12); e.box(D.anth, -0.1, e.L + 0.1, F1, F1 + 0.3, -0.05, 0.25);
      } else e.box(D.brick, -0.1, e.L + 0.1, 0.2, F1 + 0.3, -0.1, 0.1);
      // upper floor: brick with tall anthracite-framed windows (a corner of glazing on the beach side)
      e.box(D.brick, -0.1, e.L + 0.1, F1 + 0.3, F2, -0.1, 0.1);
      if (e.L > 2.6) {
        const n = Math.max(1, Math.floor((e.L - 0.8) / 3.1)), st = e.L / n;
        for (let k = 0; k < n; k++) { const c = (k + 0.5) * st, hw = beachSide(e) ? 1.1 : 0.7; e.plane(D.glass, c - hw, c + hw, F1 + 0.9, F2 - 0.6, 0.12); e.box(D.anth, c - hw - 0.08, c + hw + 0.08, F1 + 0.82, F1 + 0.9, 0.1, 0.2); e.box(D.anth, c - hw - 0.08, c + hw + 0.08, F2 - 0.6, F2 - 0.52, 0.1, 0.2); for (const s of [-1, 1]) e.box(D.anth, c + s * hw - 0.05, c + s * hw + 0.05, F1 + 0.9, F2 - 0.6, 0.1, 0.18); e.box(D.anth, c - 0.03, c + 0.03, F1 + 0.9, F2 - 0.6, 0.1, 0.16); }
      }
      // thin dark cornice slab + glass parapet (roof terrace)
      e.box(D.anth, -0.5, e.L + 0.5, F2, RT, -0.1, 0.5);
      if (beachSide(e)) e.plane(D.rail, 0, e.L, RT, RT + 1.1, 0.3);
      Z.edge(...e.xz(0, 0.5), ...e.xz(e.L, 0.5), g0 + RT, e.nx, e.nz, 'roofEdge', 7);
    }
    for (const part of convexParts(P)) { S.prism(part.flat(), gLo, g0 + RT, 0, 0, 'roof'); for (let k = 1; k + 1 < part.length; k++) { const T = [part[0], part[k], part[k + 1]], ids = T.map(([x, z]) => D.roof.vert(x, g0 + RT, z, 0, 1, 0)); const up = (T[1][1] - T[0][1]) * (T[2][0] - T[0][0]) - (T[1][0] - T[0][0]) * (T[2][1] - T[0][1]) > 0; if (up) D.roof.tri(ids[0], ids[1], ids[2]); else D.roof.tri(ids[0], ids[2], ids[1]); } }
    // stair tower on the landward corner with the vertical FABRICA sign
    const land = E.filter(e => !beachSide(e)).reduce((m, e) => (!m || e.L > m.L ? e : m), null) ?? E[0];
    {
      const a0 = Math.max(0, land.L - 5.5), a1 = land.L - 0.5, TT = RT + 3.4;
      land.box(D.brick, a0, a1, RT, TT, -4.5, 0.1); land.box(D.anth, a0 - 0.3, a1 + 0.3, TT, TT + 0.3, -4.8, 0.4);
      const q = [land.xz(a0, -4.5), land.xz(a1, -4.5), land.xz(a1, 0.1), land.xz(a0, 0.1)]; S.prism((area2(q) < 0 ? q.reverse() : q).flat(), g0, g0 + TT + 0.3, 0, 0, 'roof');
      const sign = new THREE.MeshStandardMaterial({ map: textTex('FABRICA', { w: 256, h: 1024, fg: '#f3efe6', bg: '#232427', font: 'bold 150px "Helvetica Neue", Arial, sans-serif', vertical: true }), roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.05 });
      sign.emissiveMap = sign.map; glow.push([sign, 0.05, 1.2]);
      const Ds = new MB(); land.plane(Ds, (a0 + a1) / 2 - 0.8, (a0 + a1) / 2 + 0.8, F1 + 0.6, TT - 0.4, 0.35); add(Ds, sign, 'fabrica-sign', false);
      land.box(D.anth, (a0 + a1) / 2 - 0.9, (a0 + a1) / 2 + 0.9, F1 + 0.5, TT - 0.3, 0.1, 0.33);
      Z.add(...(() => { const [x, z] = land.xz((a0 + a1) / 2, -2); return [x, g0 + TT + 0.3, z]; })(), 0, 1, 0, 'roofCorner');
    }
    // summer terrace toward the beach
    const be = E.filter(beachSide).reduce((m, e) => (!m || e.L > m.L ? e : m), null);
    const fish = [];
    if (be) {
      const T1 = 8, tA = 0.5, tB = be.L - 0.5;
      be.box(D.deck, tA, tB, -0.3, 0.2, 0.3, T1);
      const q = [be.xz(tA, 0.3), be.xz(tB, 0.3), be.xz(tB, T1), be.xz(tA, T1)]; S.prism((area2(q) < 0 ? q.reverse() : q).flat(), gLo, g0 + 0.2, 0, 0, 'ledge');
      be.plane(D.rail, tA, tB, 0.2, 1.2, T1); be.box(D.anth, tA, tB, 1.17, 1.23, T1 - 0.03, T1 + 0.03);
      for (let a = tA + 2; a < tB - 1; a += 3.6) for (const d of [2.6, 5.8]) {
        const [x, z] = be.xz(a, d); be.box(D.anth, a - 0.03, a + 0.03, 0.2, 2.5, d - 0.03, d + 0.03);
        D.cloth.cyl(x, g0 + 2.25, z, 1.35, 0.08, 0.45, 8, false); D.anth.cyl(x, g0 + 0.2, z, 0.4, 0.4, 0.75, 10, true);
      }
      // pond + wire fish beyond the terrace
      const [px, pz] = be.xz(be.L / 2, T1 + 9), py = g(px, pz) + 0.12, pr = 4.2;
      const pond = new MB().setColor(0xffffff), c0 = pond.vert(px, py + 0.1, pz, 0, 1, 0), ring = []; for (let k = 0; k < 28; k++) { const a = k / 28 * PI * 2; ring.push(pond.vert(px + Math.cos(a) * pr, py + 0.1, pz + Math.sin(a) * pr * 0.75, 0, 1, 0)); }
      for (let k = 0; k < 28; k++) pond.tri(c0, ring[(k + 1) % 28], ring[k]);
      add(pond, decal(new THREE.MeshStandardMaterial({ color: 0x163a44, roughness: 0.04, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 })), 'fabrica-pond', false);
      for (let k = 0; k < 28; k++) { const a = k / 28 * PI * 2; D.stone.cyl(px + Math.cos(a) * (pr + 0.25), py - 0.1, pz + Math.sin(a) * (pr + 0.25) * 0.75, 0.32, 0.26, 0.38, 6, true); }
      fish.push([px, py + 2.2, pz, Math.atan2(-be.uz, be.ux), 1.3, py], ...[-1, 1].map(s => { const [x, z] = be.xz(be.L / 2 + s * (be.L / 2 + 3), T1 + 3); return [x, g(x, z) + 2.6, z, Math.atan2(-be.uz, be.ux) + s * 0.5, 1.0, g(x, z)]; }));
    }
    const M = {
      brick: new THREE.MeshStandardMaterial({ map: brickTex(), roughness: 0.9 }), anth: new THREE.MeshStandardMaterial({ color: 0x2c2e31, roughness: 0.45, metalness: 0.55 }),
      glass: litGlass(0x1a262c), roof: new THREE.MeshStandardMaterial({ color: 0x55575a, roughness: 0.9 }), deck: new THREE.MeshStandardMaterial({ color: 0x7c5a3d, roughness: 0.8 }),
      rail: new THREE.MeshStandardMaterial({ color: 0x9fc4cf, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
      cloth: new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.85, side: THREE.DoubleSide }), stone: new THREE.MeshStandardMaterial({ color: 0x6d6862, roughness: 0.9 }),
    };
    // kit/mesh.js box faces carry planar uvs in metres; the brick texture spans 2 x 2 m
    M.brick.map.repeat.set(0.5, 0.5);
    for (const [k, d] of Object.entries(D)) add(d, M[k], 'fabrica-' + k, !['glass', 'rail'].includes(k));
    // wire fish: rib rings + spine lines + tail fan, on a steel post
    const W = [], post = new MB().setColor(0x303235);
    for (const [x, y, z, ry, s, gy] of fish) {
      const m = M4(x, y, z, ry, s), p = (a, b, c) => new THREE.Vector3(a, b, c).applyMatrix4(m);
      const rings = 9, seg = 14, prof = (t) => Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - 0.35 * t);
      const R2 = [];
      for (let i = 0; i <= rings; i++) { const t = i / rings, xx = 1.9 - t * 3.6, r = prof(t) * 0.95, row = []; for (let k = 0; k < seg; k++) { const a = k / seg * PI * 2; row.push(p(xx, Math.sin(a) * r * 1.15, Math.cos(a) * r * 0.55)); } R2.push(row); }
      for (const row of R2) for (let k = 0; k < seg; k++) W.push(row[k], row[(k + 1) % seg]);
      for (let k = 0; k < seg; k += 2) for (let i = 0; i < rings; i++) W.push(R2[i][k], R2[i + 1][k]);
      const tb = p(-1.7, 0, 0); for (let k = 0; k <= 6; k++) { const a = -0.7 + k / 6 * 1.4; W.push(tb, p(-1.7 - Math.cos(a) * 1.1, Math.sin(a) * 1.3, 0)); } W.push(p(-2.75, -0.85, 0), p(-2.75, 0.85, 0));
      W.push(p(1.55, 0.25, 0.3), p(1.45, 0.35, 0.3)); // eye
      post.cyl(x, gy, z, 0.05, 0.05, y - 0.5 * s - gy, 6, false); S.cyl(x, z, gy, y + 0.6 * s, 0.9 * s, 0.9 * s, 'equipment');
    }
    if (W.length) { const gW = new THREE.BufferGeometry().setFromPoints(W); const lines = new THREE.LineSegments(gW, new THREE.LineBasicMaterial({ color: 0xd8dde0 })); lines.name = 'restaurant-fabrica-wirefish'; group.add(lines); add(post, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.4 }), 'fabrica-fishposts'); }
  })();

  const clear = (x, z) => polys.some(P => inPoly(P, x, z));
  console.log(`[cherkasy] restaurants: Chaika + Fabrica in ${(performance.now() - t0).toFixed(0)} ms`);
  return { clear, update() { const k = nightK.value; for (const [m, d, n] of glow) m.emissiveIntensity = d + n * k; } };
}

// ------------------------------------------------------------------------------------------------ textures
function mosaicTex() { // Soviet smalt mosaic: a white gull over blue waves under an orange sun, 2.5 cm tesserae
  return canvasTex(1024, 256, (g, w, h) => {
    const r = rng(19), t = 8;
    const col = (x, y) => {
      const sun = Math.hypot(x - 780, y - 70) < 46, wave = y > 150 + 18 * Math.sin(x / 55) + 10 * Math.sin(x / 23);
      const gull = (() => { const u = (x - 380) / 140, v = (y - 95) / 60; return Math.abs(v - 0.55 * Math.abs(u) ** 0.9 + 0.2 * u * u) < 0.12 && Math.abs(u) < 1.2; })();
      if (gull) return [236, 236, 230]; if (sun) return [236, 140, 40];
      if (wave) return (Math.floor(y / 14) % 2) ? [22, 74, 140] : [44, 110, 170];
      return y < 60 ? [150, 196, 222] : [182, 214, 228];
    };
    for (let y = 0; y < h; y += t) for (let x = 0; x < w; x += t) { const c = col(x + 4, y + 4), k = 0.85 + r() * 0.3; g.fillStyle = `rgb(${c[0] * k | 0},${c[1] * k | 0},${c[2] * k | 0})`; g.fillRect(x + 0.8, y + 0.8, t - 1.6, t - 1.6); }
    g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, w, h);
  }, { repeat: false });
}
function brickTex() { // dark burgundy clinker, 2 x 2 m
  return canvasTex(512, 512, (g, w, h) => {
    const r = rng(23), rows = 26, rh = h / rows, bw = w / 8;
    g.fillStyle = '#3a2422'; g.fillRect(0, 0, w, h);
    for (let j = 0; j < rows; j++) for (let i = -1; i < 9; i++) { const x = i * bw + (j % 2 ? bw / 2 : 0), k = r(); g.fillStyle = `rgb(${96 + k * 34 | 0},${38 + k * 14 | 0},${36 + k * 12 | 0})`; g.fillRect(x + 1.5, j * rh + 1.5, bw - 3, rh - 3); }
  });
}
