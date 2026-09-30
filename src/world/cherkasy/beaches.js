// OWNER: cherkasy. The municipal beaches along Haharina / Knyazia Olherda: Sosnivskyi-1 (with the Bochka recreation
// ground: basketball court, swings, a wooden pier, a row of picnic shelters under the pines), Kazbetskyi (the former
// Pushkinskyi: rows of sun shelters, volleyball, table tennis) and Mytnytskyi (children's playgrounds and the gradual,
// wheelchair-friendly entry into the water with handrails). Mapped furniture comes from OSM (beaches_data.js): sun
// shelters -> parasols with two loungers facing the water, benches, picnic shelters (their generic extrusion is skipped,
// BEACH_SKIP), the observation tower -> lifeguard tower, pitches, playgrounds, the pier. The rest is placed on the sand
// by distance to the water: lifeguard towers, showers, changing cabins, courts, and a buoy line off each beach.
//   buildBeaches({ root, solids, zips, heightAt, ground, geo }) -> { update(dt), clear(x, z) }
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { rng, area2, inPoly, bboxOf, centroid, obb, triangulate, convexParts } from './geo.js';
import { BEACH, BOCHKA, PITCH, PIER, PLAY, BENCH, SUN, TOWER, WC, PICNIC } from './beaches_data.js';

export const BEACH_SKIP = new Set(PICNIC.map(o => o.id));

const PI = Math.PI, WATER_Y = -1.6;
const C = { wood: 0x9a7b56, woodD: 0x6b513a, straw: 0xc8a867, strawD: 0xa98848, white: 0xefede8, steel: 0x5d6266, red: 0xc42a20, roof: 0x9c4a3c,
  yellow: 0xf0bf2a, blue: 0x2d6cc0, green: 0x3c9a48, orange: 0xe07a24, conc: 0xb4b0a6, sky: 0x86b8d8 };
const toRing = (geo, LL) => { let P = LL.map(p => geo.toXZ(p[0], p[1])); if (P.length > 2 && P[0][0] === P.at(-1)[0] && P[0][1] === P.at(-1)[1]) P = P.slice(0, -1); return area2(P) < 0 ? P.reverse() : P; };
const rotZ = (a) => new THREE.Matrix4().makeRotationZ(a);
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
// visit the closed ring's edges: fn(ax, az, bx, bz, L, dx, dz)
function eachEdge(P, fn) {
  P.forEach((a, i) => { const b = P[i + 1 === P.length ? 0 : i + 1], dx = b[0] - a[0], dz = b[1] - a[1]; fn(a[0], a[1], b[0], b[1], Math.hypot(dx, dz), dx, dz); });
}

export function buildBeaches({ root, solids: S, zips: Z, heightAt, ground, geo }) {
  const t0 = performance.now(), s0 = S.count;
  const gh = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 0; };
  const y0 = (x, z) => gh(x, z) + 0.17;
  const isWater = (x, z) => ground?.isWater?.(x, z) ?? false;
  // nearest water along 24 rays, 1 m steps: runs thousands of times, so flat direction arrays and no per-step objects
  const DX = Float64Array.from({ length: 24 }, (_, k) => Math.cos(k / 24 * PI * 2)), DZ = DX.map((_, k) => Math.sin(k / 24 * PI * 2));
  const toWater = (x, z, max = 60) => {
    for (let d = 1; d <= max; d++) for (let k = 0; k < 24; k++) if (isWater(x + DX[k] * d, z + DZ[k] * d)) return { d, dx: DX[k], dz: DZ[k] };
    return null;
  };
  const faceOf = (w) => Math.atan2(-w.dz, w.dx); // M4 rotation whose local +x points along w
  const R = rng(1961);
  const group = Object.assign(new THREE.Group(), { name: 'beaches' });
  root.add(group);
  let nV = 0;
  const add = (obj, name, shadow = true) => { obj.name = 'beach-' + name; obj.castShadow = shadow; obj.receiveShadow = true; group.add(obj); nV += obj.geometry.attributes.position.count * (obj.count ?? 1); return obj; };

  const beaches = BEACH.map(o => ({ site: o.site, P: toRing(geo, o.p) }));
  const bochka = BOCHKA.map(o => toRing(geo, o.p));
  const onBeach = (x, z) => beaches.some(b => inPoly(b.P, x, z));
  const taken = []; // [x, z, r]
  const free = (x, z, r) => { // the axis test first: it alone clears nearly every pair
    for (const [px, pz, pr] of taken) { const rr = r + pr; if (Math.abs(px - x) < rr && Math.abs(pz - z) < rr && Math.hypot(px - x, pz - z) < rr) return false; }
    return true;
  };
  const take = (x, z, r) => taken.push([x, z, r]);

  const F = new MB(), cloth = new MB(), metal = new MB(); // vertex-coloured: furniture / canopies (double-sided) / steel
  let counts = { parasol: 0, bench: 0, picnic: 0, tower: 0, shower: 0, cabin: 0, court: 0, play: 0, buoy: 0 };

  // ---------------------------------------------------------------------------------------------- pieces (local +x = to the water)
  const lounger = (D) => {
    D.setColor(C.white);
    D.box(-0.3, 0.25, -0.32, 1.0, 0.33, 0.32);
    D.with(M4(-0.3, 0.33, 0).multiply(rotZ(-0.75)), e => e.box(-0.75, -0.03, -0.32, 0, 0.03, 0.32));
    for (const [a, b] of [[-0.25, -0.28], [-0.25, 0.28], [0.95, -0.28], [0.95, 0.28]]) D.box(a - 0.03, 0, b - 0.03, a + 0.03, 0.26, b + 0.03);
  };
  const parasol = (x, z, w, style) => {
    const y = y0(x, z), face = w ? faceOf(w) : R() * PI * 2;
    const straw = style !== 'fabric';
    F.setColor(straw ? C.woodD : C.steel); F.cyl(x, y, z, straw ? 0.07 : 0.04, straw ? 0.06 : 0.04, 2.5, 6, false);
    if (straw) {
      cloth.setColor(C.straw); cloth.cyl(x, y + 2.05, z, 1.65, 0.1, 0.95, 12, true);
      cloth.setColor(C.strawD); cloth.cyl(x, y + 1.8, z, 1.7, 1.65, 0.28, 12, false);
    } else {
      const col = [C.blue, C.white, C.yellow][Math.floor(R() * 3)];
      cloth.setColor(col); cloth.cyl(x, y + 2.0, z, 1.5, 0.06, 0.6, 8, false);
      cloth.setColor(C.white); cloth.cyl(x, y + 1.88, z, 1.5, 1.5, 0.14, 8, false);
    }
    for (const side of [-0.85, 0.85]) F.with(M4(x, y, z, face).multiply(M4(-0.6, 0, side)), lounger);
    S.cyl(x, z, y, y + 2.5, 0.07, 0.07, 'pole');
    take(x, z, 2.2); counts.parasol++;
  };
  const bench = (x, z, face) => {
    const y = y0(x, z);
    F.with(M4(x, y, z, face), d => {
      d.setColor(C.wood); [0, 0.14, 0.28].forEach((o) => d.box(o - 0.2, 0.42, -0.9, o - 0.08, 0.46, 0.9)); // seat slats
      d.with(M4(-0.26, 0.5, 0).multiply(rotZ(-0.2)), e => { e.box(-0.03, 0, -0.9, 0.0, 0.14, 0.9); e.box(-0.03, 0.2, -0.9, 0.0, 0.34, 0.9); });
      d.setColor(C.steel); for (const b of [-0.75, 0.75]) { d.box(-0.24, 0, b - 0.03, -0.18, 0.84, b + 0.03); d.box(0.14, 0, b - 0.03, 0.2, 0.44, b + 0.03); d.box(-0.24, 0.38, b - 0.03, 0.2, 0.42, b + 0.03); }
    });
    S.box(x - 0.6, y, z - 0.6, x + 0.6, y + 0.46, z + 0.6, 'ledge'); take(x, z, 1); counts.bench++;
  };
  const lifeguard = (x, z, w) => {
    const y = y0(x, z), face = faceOf(w);
    F.with(M4(x, y, z, face), d => {
      d.setColor(C.wood);
      for (const [a, b] of CORNERS) d.boxC(a * 1.1, 1.6, b * 1.1, 0.16, 3.2, 0.16); // legs
      for (const b of [-1.1, 1.1]) d.with(M4(0, 1.6, b).multiply(rotZ(0.95)), e => e.box(-1.45, -0.04, -0.04, 1.45, 0.04, 0.04));
      d.box(-1.4, 3.0, -1.4, 1.6, 3.2, 1.4);
      d.setColor(C.white); d.box(-1.2, 3.2, -1.2, 1.0, 4.1, 1.2); d.box(-1.2, 4.1, -1.2, -1.1, 5.4, 1.2); for (const b of [-1.2, 1.1]) d.box(-1.2, 4.1, b, 1.0, 5.4, b + 0.1); for (const b of [-1.2, 1.1]) d.box(0.9, 4.1, b, 1.0, 5.4, b + 0.1);
      d.setColor(C.red); d.box(-1.5, 5.4, -1.5, 1.4, 5.62, 1.5); d.box(1.0, 3.45, -0.12, 1.02, 4.0, 0.12); d.box(1.0, 3.6, -0.3, 1.02, 3.84, 0.3);
      d.setColor(C.woodD);
      for (let k = 0; k < 9; k++) { const xr = -1.6 - (8 - k) * 0.28, yr = 0.3 + k * 0.33; d.box(xr - 0.2, yr, -0.4, xr, yr + 0.06, 0.4); } // ladder treads
      for (const b of [-0.44, 0.44]) d.tube([-4.05, 0, b], [-1.45, 3.1, b], 0.05, 4);
      d.setColor(C.yellow); d.box(1.5, 3.2, 1.3, 1.52, 4.6, 1.32); d.box(1.52, 4.1, 1.32, 1.54, 4.6, 1.9); // flag
    });
    S.box(x - 1.5, y + 3.0, z - 1.5, x + 1.5, y + 5.62, z + 1.5, 'roof');
    [[0, 0], ...CORNERS].forEach(([a, b]) => Z.add(x + 1.5 * a, y + 5.62, z + 1.5 * b, 0, 1, 0, 'roofCorner')); // roof centre + corners
    take(x, z, 3); counts.tower++;
  };
  const shower = (x, z, w) => {
    const y = y0(x, z), face = faceOf(w);
    F.with(M4(x, y, z, face), d => {
      d.setColor(C.wood);
      for (let k = 0; k < 7; k++) { const a = k * 0.18 - 0.6; d.box(a, 0, -0.6, a + 0.12, 0.08, 0.6); } // duckboard
    });
    metal.with(M4(x, y, z, face), d => {
      d.setColor(C.steel); d.cyl(-0.5, 0, 0, 0.045, 0.045, 2.4, 6, true); d.box(-0.5, 2.36, -0.03, 0.05, 2.42, 0.03); d.cyl(0.05, 2.2, 0, 0.11, 0.06, 0.18, 8, true);
      d.box(-0.47, 1.0, -0.03, -0.3, 1.06, 0.03);
    });
    S.cyl(x, z, y, y + 2.4, 0.06, 0.06, 'pole'); take(x, z, 1.4); counts.shower++;
  };
  const cabin = (x, z, w, col) => {
    const y = y0(x, z), face = faceOf(w);
    F.with(M4(x, y, z, face), d => {
      d.setColor(col);
      d.box(-0.55, 0.1, -0.55, -0.49, 2.0, 0.55); d.box(-0.55, 0.1, -0.55, 0.55, 2.0, -0.49); d.box(-0.55, 0.1, 0.49, 0.55, 2.0, 0.55);
      d.box(0.49, 0.4, -0.55, 0.55, 2.0, -0.15); // half-screen at the open side
      d.setColor(C.steel); for (const [a, b] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) d.box(a - 0.03, 0, b - 0.03, a + 0.03, 2.05, b + 0.03);
    });
    S.box(x - 0.6, y, z - 0.6, x + 0.6, y + 2.05, z + 0.6, 'wall'); take(x, z, 1.1); counts.cabin++;
  };
  const volleyball = (x, z, face) => {
    const y = y0(x, z);
    F.with(M4(x, y, z, face), d => {
      d.setColor(C.white); for (const s of [-4.7, 4.7]) d.box(-0.05, 0, s - 0.05, 0.05, 2.55, s + 0.05);
      d.box(-0.01, 2.35, -4.6, 0.01, 2.43, 4.6); d.box(-0.01, 1.5, -4.6, 0.01, 1.54, 4.6); for (let k = -4.5; k <= 4.5; k += 0.5) d.box(-0.008, 1.5, k - 0.008, 0.008, 2.4, k + 0.008);
      d.setColor(C.blue); for (const [a0, b0, a1, b1] of [[-8, -4.5, 8, -4.5], [-8, 4.5, 8, 4.5], [-8, -4.5, -8, 4.5], [8, -4.5, 8, 4.5]]) d.box(Math.min(a0, a1) - 0.03, 0.02, Math.min(b0, b1) - 0.03, Math.max(a0, a1) + 0.03, 0.05, Math.max(b0, b1) + 0.03);
    });
    for (const s of [-4.7, 4.7]) S.cyl(x + s * Math.sin(face), z + s * Math.cos(face), y, y + 2.55, 0.06, 0.06, 'pole');
    take(x, z, 9); counts.court++;
  };
  const pingpong = (x, z, face) => {
    const y = y0(x, z);
    F.with(M4(x, y, z, face), d => {
      d.setColor(C.conc); d.box(-0.25, 0, -0.5, 0.25, 0.7, 0.5);
      d.setColor(0x1f5f8a); d.box(-1.37, 0.7, -0.76, 1.37, 0.76, 0.76);
      d.setColor(C.white); d.box(-1.37, 0.761, -0.01, 1.37, 0.765, 0.01); d.box(-0.01, 0.76, -0.8, 0.01, 0.92, 0.8);
    });
    S.box(x - 1.4, y, z - 1.4, x + 1.4, y + 0.76, z + 1.4, 'ledge'); take(x, z, 3); counts.court++;
  };
  const swings = (D) => { // two seats, A-frames at z = +-1.7
    D.setColor(C.blue);
    for (const b of [-1.7, 1.7]) for (const a of [-0.9, 0.9]) D.with(M4(a * 0.5, 0, b).multiply(rotZ(a > 0 ? -0.33 : 0.33)), e => e.box(-0.05, 0, -0.05, 0.05, 2.5, 0.05));
    D.box(-0.06, 2.3, -1.75, 0.06, 2.42, 1.75);
    for (const b of [-0.7, 0.7]) { D.setColor(C.steel); for (const s of [-0.22, 0.22]) D.box(-0.01, 0.45, b + s - 0.01, 0.01, 2.3, b + s + 0.01); D.setColor(C.red); D.box(-0.18, 0.42, b - 0.26, 0.18, 0.48, b + 0.26); }
  };
  const slide = (D) => { // tower with a roof, ladder, chute towards +x
    D.setColor(C.yellow); for (const [a, b] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) D.box(a - 0.05, 0, b - 0.05, a + 0.05, 2.7, b + 0.05);
    D.setColor(C.woodD); D.box(-0.65, 1.4, -0.65, 0.65, 1.5, 0.65);
    D.setColor(C.red); D.with(M4(0, 2.7, 0), e => e.cyl(0, 0, 0, 0.95, 0.05, 0.7, 4, true));
    D.setColor(C.green); for (const b of [-0.65, 0.6]) D.box(-0.65, 1.5, b, 0.65, 2.0, b + 0.05);
    D.setColor(C.blue); D.with(M4(0.62, 1.5, 0).multiply(rotZ(-0.5)), e => { e.box(0, -0.05, -0.3, 3.0, 0.02, 0.3); e.box(0, 0.02, -0.33, 3.0, 0.22, -0.28); e.box(0, 0.02, 0.28, 3.0, 0.22, 0.33); });
    D.setColor(C.steel); for (const b of [-0.3, 0.3]) D.tube([-1.2, 0, b], [-0.65, 1.5, b], 0.03, 5); for (let k = 1; k < 5; k++) { const t = k / 5; D.tube([-1.2 + 0.55 * t, 1.5 * t, -0.3], [-1.2 + 0.55 * t, 1.5 * t, 0.3], 0.02, 4); }
  };
  const rider = (D, col) => { D.setColor(C.steel); D.cyl(0, 0, 0, 0.1, 0.08, 0.45, 6, true); D.setColor(col); D.box(-0.45, 0.45, -0.15, 0.45, 0.8, 0.15); D.box(0.25, 0.8, -0.12, 0.45, 1.05, 0.12); };
  const climber = (D) => { // five half-ellipse hoops tied by seven rungs
    D.setColor(C.orange);
    const arc = (q, b) => [Math.cos(q * PI / 8) * 1.2, Math.sin(q * PI / 8) * 1.3, b];
    for (let k = 0; k < 5; k++) for (let q = 1; q <= 8; q++) D.tube(arc(q - 1, k * 0.5 - 1), arc(q, k * 0.5 - 1), 0.035, 5);
    for (let q = 1; q < 8; q++) D.tube(arc(q, -1), arc(q, 1), 0.03, 5);
  };
  const playset = (x, z, face, kind) => {
    const y = y0(x, z), M = M4(x, y, z, face);
    if (kind === 'swings') { F.with(M, swings); S.box(x - 0.8, y, z - 0.8, x + 0.8, y + 2.42, z + 0.8, 'equipment'); take(x, z, 2.2); }
    else if (kind === 'slide') { F.with(M, slide); S.box(x - 0.7, y, z - 0.7, x + 0.7, y + 1.5, z + 0.7, 'roof'); take(x, z, 2.2); }
    else if (kind === 'climber') { F.with(M, climber); S.box(x - 1.1, y, z - 1.1, x + 1.1, y + 1.3, z + 1.1, 'equipment'); take(x, z, 1.8); }
    else { F.with(M, d => rider(d, [C.red, C.green, C.yellow][Math.floor(R() * 3)])); take(x, z, 0.8); }
    counts.play++;
  };

  // ---------------------------------------------------------------------------------------------- mapped furniture
  for (const o of SUN) { const [x, z] = geo.toXZ(...o.p); parasol(x, z, toWater(x, z, 90), o.site === 'kazbet' ? 'fabric' : 'straw'); }
  for (const o of BENCH) { const [x, z] = geo.toXZ(...o.p); if (!free(x, z, 0.8)) continue; const w = toWater(x, z, 90); bench(x, z, w ? faceOf(w) : R() * PI * 2); }
  for (const o of TOWER) { const [x, z] = geo.toXZ(...o.p); const w = toWater(x, z, 90) ?? { dx: 1, dz: 0 }; lifeguard(x, z, w); }
  for (const o of WC) {
    const [x, z] = geo.toXZ(...o.p), y = y0(x, z);
    F.with(M4(x, y, z, R() * PI), d => { d.setColor(C.sky); d.box(-0.65, 0, -0.65, 0.65, 2.3, 0.65); d.setColor(C.white); d.box(-0.75, 2.3, -0.75, 0.75, 2.42, 0.75); d.setColor(C.steel); d.box(0.651, 0.05, -0.4, 0.66, 2.0, 0.4); });
    S.box(x - 0.75, y, z - 0.75, x + 0.75, y + 2.42, z + 0.75, 'roof'); take(x, z, 1);
  }
  // picnic shelters: posts at the corners, a hipped roof over the outline (+0.35 m eaves), table + benches inside
  for (const o of PICNIC) {
    const P = toRing(geo, o.p); if (P.length < 3) continue;
    const [cx, cz] = centroid(P), y = Math.min(...P.map(([x, z]) => y0(x, z))), eave = y + 2.3, apex = eave + 1.2;
    F.setColor(C.woodD); for (const [x, z] of P) F.box(x - 0.08, y - 0.3, z - 0.08, x + 0.08, eave, z + 0.08);
    const E = P.map(([x, z]) => { const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1; return [x + dx / l * 0.35, z + dz / l * 0.35]; });
    F.setColor(C.roof);
    eachEdge(E, (ax, az, bx, bz, L, dx, dz) => {
      const l = L || 1, n = [dz / l, 0.9, -dx / l], v = (x, y, z) => F.vert(x, y, z, n[0], n[1], n[2]);
      const a = v(ax, eave - 0.15, az), b = v(bx, eave - 0.15, bz), t = v(cx, apex, cz);
      F.tri(a, t, b).tri(a, b, t); // both windings: seen from above and from under the eaves
    });
    const bb = obb(P); if (bb) {
      const f = Math.atan2(-bb.uz, bb.ux);
      F.with(M4(bb.cx, y, bb.cz, f), d => { d.setColor(C.wood); d.box(-Math.min(1.1, bb.L * 0.35), 0.72, -0.4, Math.min(1.1, bb.L * 0.35), 0.78, 0.4); d.box(-0.08, 0, -0.08, 0.08, 0.72, 0.08); for (const b of [-0.75, 0.75]) { d.box(-Math.min(1.1, bb.L * 0.35), 0.42, b - 0.15, Math.min(1.1, bb.L * 0.35), 0.46, b + 0.15); d.box(-0.06, 0, b - 0.06, 0.06, 0.42, b + 0.06); } });
    }
    for (const Q of convexParts(E)) S.prism(Q.flat(), eave - 0.2, eave + 0.3, 0, 0, 'roof');
    Z.add(cx, apex, cz, 0, 1, 0, 'antenna');
    take(cx, cz, 3); counts.picnic++;
  }
  // pitches: basketball hoops at both ends (the untagged football pitch by the Bochka keeps its generic goals)
  for (const o of PITCH) {
    const P = toRing(geo, o.p), bb = obb(P); if (!bb) continue;
    const f = Math.atan2(-bb.uz, bb.ux), y = Math.max(...P.map(([x, z]) => y0(x, z)));
    if (o.sport === 'basketball') {
      for (const s of [-1, 1]) {
        const u = s * (bb.L / 2 - 0.3);
        metal.with(M4(bb.cx, y, bb.cz, f), d => {
          d.setColor(C.steel); d.cyl(u, 0, 0, 0.09, 0.08, 3.3, 8, true); d.box(Math.min(u, u - s * 1.1), 3.1, -0.05, Math.max(u, u - s * 1.1), 3.2, 0.05);
          d.setColor(C.white); d.box(u - s * 1.15 - 0.03, 2.9, -0.9, u - s * 1.15 + 0.03, 3.95, 0.9);
          d.setColor(C.orange); const rc = u - s * 1.15 - s * 0.38; for (let q = 0; q < 12; q++) { const a = q / 12 * PI * 2, b = (q + 1) / 12 * PI * 2; d.tube([rc + Math.cos(a) * 0.23, 3.05, Math.sin(a) * 0.23], [rc + Math.cos(b) * 0.23, 3.05, Math.sin(b) * 0.23], 0.012, 4); }
        });
        const [px, pz] = [bb.cx + bb.ux * u, bb.cz + bb.uz * u]; S.cyl(px, pz, y, y + 3.3, 0.1, 0.1, 'pole');
      }
      counts.court++;
    }
    take(bb.cx, bb.cz, Math.max(bb.L, bb.W) / 2);
  }
  // playgrounds (Mytnytsia): a slide, a swing set, a climbing arch and spring riders inside each outline
  for (const o of PLAY) {
    const P = toRing(geo, o.p), bb = obb(P); if (!bb) continue;
    const f = Math.atan2(-bb.uz, bb.ux), kinds = ['slide', 'swings', 'climber', 'rider', 'rider'];
    let k = 0;
    for (let a = -bb.L / 2 + 2; a <= bb.L / 2 - 2 && k < kinds.length; a += 3.2) for (let b = -bb.W / 2 + 1.8; b <= bb.W / 2 - 1.8 && k < kinds.length; b += 3.4) {
      const x = bb.cx + bb.ux * a - bb.uz * b, z = bb.cz + bb.uz * a + bb.ux * b;
      if (!inPoly(P, x, z) || !free(x, z, 1)) continue;
      playset(x, z, f, kinds[k++]);
    }
  }
  // Bochka: swings among its lawns
  bochka.forEach((P) => {
    const c = centroid(P), sets = ['swings', 'rider'];
    // spiral out from the lawn centre: 8 bearings per 3 m ring until both sets stand
    for (let r = 0, q = 0; r < 40 && sets.length; q = (q + 1) % 8, r += q ? 0 : 3) {
      const x = c[0] + r * Math.cos(q * 0.785), z = c[1] + r * Math.sin(q * 0.785);
      if (inPoly(P, x, z) && !isWater(x, z) && free(x, z, 2.4)) playset(x, z, R() * PI, sets.shift());
    }
  });
  // the wooden pier: deck on piles, railings on the water sides
  for (const o of PIER) {
    const P = toRing(geo, o.p), land = P.filter(([x, z]) => !isWater(x, z));
    const top = land.length ? Math.max(WATER_Y + 0.8, Math.min(...land.map(([x, z]) => gh(x, z))) + 0.2) : WATER_Y + 0.8;
    const { pts, tris } = triangulate(P, []);
    F.setColor(C.wood);
    for (const [a, b, c] of tris) { const ids = [a, b, c].map(i => F.vert(pts[i][0], top, pts[i][1], 0, 1, 0)); const A = pts[a], B = pts[b], Cc = pts[c]; if ((B[1] - A[1]) * (Cc[0] - A[0]) - (B[0] - A[0]) * (Cc[1] - A[1]) > 0) F.tri(ids[0], ids[1], ids[2]); else F.tri(ids[0], ids[2], ids[1]); }
    F.setColor(C.woodD);
    eachEdge(P, (ax, az, bx, bz, L, dx, dz) => {
      if (L < 0.2) return;
      const nx = dz / L, nz = -dx / L;
      quadN(F, [ax, top, az], [bx, top, bz], [bx, top - 0.35, bz], [ax, top - 0.35, az], [nx, 0, nz]); // fascia
      if (!isWater((ax + bx) / 2 + nx * 1.5, (az + bz) / 2 + nz * 1.5)) return;
      metal.setColor(C.white); // railing on the water side: posts every 2 m, top rail + mid rail
      for (let s = 0; s <= L; s += 2) { const t = s / L; metal.cyl(ax + dx * t, top, az + dz * t, 0.035, 0.035, 1.05, 5, false); }
      for (const [h, r, sg] of [[1.05, 0.035, 5], [0.55, 0.02, 4]]) metal.tube([ax, top + h, az], [bx, top + h, bz], r, sg);
      Z.edge(ax, az, bx, bz, top + 1.05, nx, nz, 'ledge', 4);
    });
    const bb = bboxOf(P);
    for (let x = bb.x0 + 1; x < bb.x1; x += 3) for (let z = bb.z0 + 1; z < bb.z1; z += 3) if (inPoly(P, x, z)) F.cyl(x, WATER_Y - 3, z, 0.14, 0.14, top - 0.35 - (WATER_Y - 3), 6, false);
    for (const Q of convexParts(P)) S.prism(Q.flat(), top - 0.35, top, 0, 0, 'roof');
  }

  // ---------------------------------------------------------------------------------------------- placed on the sand
  const buoys = [];
  for (const b of beaches) {
    const P = b.P, bb = bboxOf(P), cand = [];
    for (let x = bb.x0 + 1; x < bb.x1; x += 2) for (let z = bb.z0 + 1; z < bb.z1; z += 2) { if (!inPoly(P, x, z) || isWater(x, z)) continue; const w = toWater(x, z, 55); if (w) cand.push([x, z, w]); }
    if (!cand.length) continue;
    const [cx, cz] = centroid(P);
    const pick = (d0, d1, r, near = [cx, cz]) => { let best = null, bd = Infinity; for (const c of cand) { if (c[2].d < d0 || c[2].d > d1 || !free(c[0], c[1], r)) continue; const d = Math.hypot(c[0] - near[0], c[1] - near[1]); if (d < bd) { bd = d; best = c; } } return best; };
    // lifeguard towers where the beach has none mapped
    const guard = TOWER.some((o) => o.site === b.site) ? null : pick(5, 9, 3);
    if (guard) lifeguard(...guard);
    // along the beach: showers and cabins at both ends of the central stretch
    const ext = cand.reduce((m, c) => Math.max(m, Math.hypot(c[0] - cx, c[1] - cz)), 0);
    for (const k of [-1, 1]) {
      const far = cand.filter(c => c[2].d >= 10 && c[2].d <= 30).map(c => ({ c, s: (c[0] - cx) * c[2].dz - (c[1] - cz) * c[2].dx })).filter(o => o.s * k > 0);
      far.sort((p, q) => Math.abs(Math.abs(p.s) - ext * 0.35) - Math.abs(Math.abs(q.s) - ext * 0.35));
      const at = far[0]?.c; if (!at) continue;
      const sh = pick(10, 22, 1.4, at); if (sh) shower(sh[0], sh[1], sh[2]);
      const cols = [C.blue, C.yellow, C.green];
      for (let q = 0; q < 2; q++) { const cb = pick(14, 34, 1.1, at); if (cb) cabin(cb[0], cb[1], cb[2], cols[(q + (k > 0 ? 1 : 0)) % 3]); }
    }
    if (b.site === 'kazbet' || b.site === 'mytn') { const c = pick(18, 45, 9); if (c) volleyball(c[0], c[1], faceOf(c[2])); }
    if (b.site === 'kazbet') { for (let q = 0; q < 2; q++) { const c = pick(15, 50, 3); if (c) pingpong(c[0], c[1], faceOf(c[2]) + PI / 2); } }
    // Mytnytsia: the gradual accessible entry – a ramp from the sand into the water with handrails on both sides
    if (b.site === 'mytn') {
      const c = pick(3, 6, 2);
      if (c) {
        const [x, z, w] = c, len0 = 4, len1 = w.d + 9, px = -w.dz, pz = w.dx;
        const prof = [[-len0, y0(x - w.dx * len0, z - w.dz * len0)], [0, y0(x, z)], [w.d, WATER_Y + 0.05], [len1, WATER_Y - 0.7]];
        const yAt = (s) => { for (let q = 1; q < prof.length; q++) if (s <= prof[q][0] || q === prof.length - 1) { const [s0, a] = prof[q - 1], [s1, b] = prof[q]; return a + (b - a) * (s - s0) / (s1 - s0); } };
        const at = (s) => [x + w.dx * s, z + w.dz * s];
        F.setColor(0x8a8781);
        for (let s = -len0; s < len1; s += 1) { // a slab 12 cm proud of the sand
          const [ax, az] = at(s), [bx, bz] = at(s + 1), ya = yAt(s) + 0.12, yb = yAt(s + 1) + 0.12;
          quadN(F, [ax - px * 0.9, ya, az - pz * 0.9], [ax + px * 0.9, ya, az + pz * 0.9], [bx + px * 0.9, yb, bz + pz * 0.9], [bx - px * 0.9, yb, bz - pz * 0.9], [0, 1, 0]);
          for (const sd of [-1, 1]) quadN(F, [ax + px * 0.9 * sd, ya, az + pz * 0.9 * sd], [bx + px * 0.9 * sd, yb, bz + pz * 0.9 * sd], [bx + px * 0.9 * sd, yb - 0.5, bz + pz * 0.9 * sd], [ax + px * 0.9 * sd, ya - 0.5, az + pz * 0.9 * sd], [px * sd, 0, pz * sd]);
        }
        metal.setColor(C.steel);
        for (const side of [-1, 1]) {
          let prev = null;
          for (let s = -len0; s <= len1; s += 1.5) {
            const [ax, az] = at(s), hx = ax + px * side, hz = az + pz * side, y = yAt(s) + 0.12;
            metal.cyl(hx, y, hz, 0.03, 0.03, 0.9, 5, false);
            const p = [hx, y + 0.9, hz]; if (prev) metal.tube(prev, p, 0.03, 5); prev = p;
          }
        }
        const [ex, ez] = at(len1 / 2); S.cyl(ex, ez, WATER_Y - 1, WATER_Y + 0.05, 0.1, 0.1, 'equipment');
      }
    }
    // swimming-area boundary: a buoy line ~25 m out, parallel to the shore stretch of this beach
    const shore = [];
    eachEdge(P, (ax, az, bx, bz, L, dx, dz) => {
      for (let s = 0; s < L; s += 4) {
        const x = ax + dx * s / L, z = az + dz * s / L, w = isWater(x, z) ? null : toWater(x, z, 12);
        if (w) shore.push([x + w.dx * (w.d + 25), z + w.dz * (w.d + 25)]);
      }
    });
    for (const [x, z] of shore) if (isWater(x, z) && buoys.every(([bx, bz]) => Math.hypot(bx - x, bz - z) > 3.5)) buoys.push([x, z, buoys.length % 2]);
  }

  // ---------------------------------------------------------------------------------------------- meshes
  for (const [mb, name, look] of [[F, 'furniture', { roughness: 0.8 }], [cloth, 'canopies', { roughness: 0.9, side: THREE.DoubleSide }], [metal, 'metal', { roughness: 0.45, metalness: 0.5 }]]) {
    add(new THREE.Mesh(mb.build(), Object.assign(new THREE.MeshStandardMaterial({ vertexColors: true }), look)), name);
  }
  let buoyMesh = null;
  if (buoys.length) {
    buoyMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 10, 7), new THREE.MeshStandardMaterial({ roughness: 0.5 }), buoys.length);
    const m = new THREE.Matrix4(), cR = new THREE.Color(0xd8341f), cW = new THREE.Color(0xf2f0ea);
    buoys.forEach(([x, z, k], i) => { m.makeTranslation(x, WATER_Y + 0.08, z); buoyMesh.setMatrixAt(i, m); buoyMesh.setColorAt(i, k ? cW : cR); });
    add(buoyMesh, 'buoys', false); counts.buoy = buoys.length;
  }

  const clear = (x, z) => onBeach(x, z) || bochka.some(P => inPoly(P, x, z));
  console.log(`[cherkasy] beaches: ${Object.entries(counts).map(([k, v]) => v + ' ' + k).join(', ')}; ${nV} vertices, ${S.count - s0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  let time = 0; const m = new THREE.Matrix4();
  return {
    clear,
    update(dt) {
      if (!buoyMesh) return; time += dt;
      for (let i = 0; i < buoys.length; i++) { const [x, z] = buoys[i]; m.makeTranslation(x, WATER_Y + 0.08 + Math.sin(time * 1.3 + x * 0.21 + z * 0.17) * 0.05, z); buoyMesh.setMatrixAt(i, m); }
      buoyMesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// flat-shaded quad p0..p3 whose front side looks along n (loop order flipped when needed)
function quadN(D, p0, p1, p2, p3, n) {
  const e = [p1, p2].map((p) => [p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]]);
  const along = n[0] * (e[0][1] * e[1][2] - e[0][2] * e[1][1]) + n[1] * (e[0][2] * e[1][0] - e[0][0] * e[1][2]) + n[2] * (e[0][0] * e[1][1] - e[0][1] * e[1][0]);
  const loop = along < 0 ? [p0, p3, p2, p1] : [p0, p1, p2, p3];
  D.quad(...loop.map((p) => D.vert(p[0], p[1], p[2], n[0], n[1], n[2])));
}
