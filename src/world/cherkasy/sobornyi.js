// OWNER: cherkasy. Соборний парк (until 2016 Першотравневий), between vul. Smilianska, vul. Nadpilna and vul. Sviato-
// Makariivska (OSM relation 9535469, leisure=park; the quest «Таємниці Черкас», card `sobornyi`). In the 19th century
// the city's largest cemetery lay here by the Sviato-Mykolaivskyi cathedral, with Orthodox, Catholic, Muslim and
// Lutheran parts; the cathedral was blown up in 1946, the cemetery cleared, and in 1954 the park was laid out on it.
// St Michael's cathedral (landmarks.js) stands in it since 2002. The OSM footways already draw its paths (map.walks /
// map.dirt) and the generated trees fill it; this module adds what makes it read as a park and a memorial ground:
// - the main entrance from the round plaza at the Smilianska / Nadpilna corner: two white rotundas of eight columns
//   (two tiers of columns, the lower one carrying the wings' slab) flanking the twin alley to the cathedral (Commons «Вхід до Соборного парку», 2009);
// - in the alley's middle strip the Chornobyl memorial (2008, M. Telizhenko, I. Lavrinenko): a black forged arch with
//   two cranes over it, an icon slab inside, a black base with the words, on a red granite pedestal and square
//   (uk.wikipedia «Пам’ятник жертвам Чорнобильської трагедії в Черкасах», 2009);
// - «Зруйнованим храмам» (2004): the small octagonal chapel of cream brick with arched porches and a pale-blue dome
//   (OSM 969866184) with the bronze kneeling monk and his fallen bell beside it (uk.wikipedia, 2009);
// - the memorial to the police officers killed on duty: a white crystal-shaped stele with a bronze star on a stepped
//   granite platform by the paved east path (Commons 2020; placed on the unnamed OSM memorial node 4267360035 – a guess);
// - «Жертвам фашизму»: a rough-topped grey granite stele between flower beds at a path fork (uk.wikipedia, 2009);
// - in the west part, the quest's spot: the granite memorial cross to the victims of the Holodomors and political
//   repressions (2006) on a big rough boulder with its plaque, at the end of the path from Smilianska, and the church
//   of the icon «Чорнобильський Спас» (OSM 415330174; no photo found: white walls, a green roof, one gilded dome on a
//   drum – a guess) on one round paved plaza with the cross (the satellite shows the keyhole of light paving);
// - park lamps along every paved footway in the park and fewer along the earth ones, benches with bins along the
//   paved ones, all instanced (three draw calls for the lot).
//   SOBORNYI_SKIP – the two chapels' OSM ids (rebuilt here)
//   SOBORNYI_PARK – the park's outline (flat [x, z, …], simplified from the OSM relation)
//   buildSobornyi({ root, map, solids, heightAt, geo }) -> { update(), clear(x, z), footprints, stats } | null
import * as THREE from 'three';
import { MB, M4, rotZ } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, inPoly, centroid, area2, rng } from './geo.js';
import { canvasTex, decal } from './sculpt.js';
import { patina, slabTex } from './bohdan.js';

export const SOBORNYI_SKIP = new Set([415330174, 969866184]);
export const SOBORNYI_PARK = [-720.9, 661.3, -719.7, 541.8, -732.5, 541.5, -733, 553.8, -737.9, 553.8, -737.9, 549.1, -752.4, 544.2, -757.7, 545.5,
  -767.6, 555.7, -778.2, 554.6, -783.9, 549.4, -786, 542.2, -784.2, 535, -773.8, 523.3, -778.8, 509.2, -784, 509, -783.9, 504.5, -772, 504, -771.3, 491.7,
  -1178.6, 493, -1174.9, 731.4, -1170.4, 736.3, -1175, 739.2, -1174.6, 767.5, -721.6, 753.3];
const PI = Math.PI;
const ALLEY = { a: [-779.6, 548.5], dir: [-0.792, 0.61] };  // the twin alley's mouth (between its two OSM footways) and its heading
const ROT = { r: 2.45, base: 3.0, h: 3.4, along: [5, 22], side: 9.6, wing: 8 }; // the rotundas and their pergola wings
const CHORNOBYL = [-815.4, 576.2], POLICE = [-834.4, 646.8], FASCISM = [-794.5, 647.9], MONK = [-867.4, 634.9], CROSS = [-1065.4, 530.5];
const SPAS = 415330174, HRAM = 969866184;
const PLAZA_R = 15.5, CROSS_R = 8.5;                        // the round plaza round the church, the lobe round the cross

const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const segDist = (p, a, b) => {
  const ab = sub(b, a), t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / ((ab[0] ** 2 + ab[1] ** 2) || 1)));
  return dist(p, [a[0] + ab[0] * t, a[1] + ab[1] * t]);
};

// ------------------------------------------------------------------------------------------------ textures
const plaqueTex = (lines, { bg = '#1b1b1b', fg = '#d9c37a', w = 512, h = 256, font = 30 } = {}) => canvasTex(w, h, (c) => {
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold ${font}px Georgia, serif`;
  lines.forEach((s, i) => c.fillText(s, w / 2, h / 2 + (i - (lines.length - 1) / 2) * font * 1.25));
}, { repeat: false });

// ------------------------------------------------------------------------------------------------ instanced furniture
function lampGeo() {
  const D = new MB().setColor('#4d5257'), G = new MB();
  D.cyl(0, -0.2, 0, 0.13, 0.11, 0.7, 8).cyl(0, 0.5, 0, 0.065, 0.05, 4.6, 6);
  D.tube([0, 5.05, 0], [0.55, 5.18, 0], 0.035, 5, true);
  D.box(0.4, 5.1, -0.14, 1.0, 5.24, 0.14);
  G.box(0.45, 5.06, -0.11, 0.95, 5.1, 0.11, 8);
  return [D.build(), G.build()];
}
function benchGeo() {
  const D = new MB(), L = 1.9;
  D.setColor('#2a2c2e');
  for (const s of [-L / 2 + 0.2, L / 2 - 0.2]) D.box(s - 0.04, 0, -0.27, s + 0.04, 0.43, 0.23).box(s - 0.04, 0.43, -0.31, s + 0.04, 0.88, -0.23);
  D.setColor('#9a6a42');
  [-0.25, -0.13, -0.01, 0.11].forEach((d) => D.box(-L / 2, 0.43, d, L / 2, 0.47, d + 0.1));
  [0.55, 0.67, 0.79].forEach((y) => D.box(-L / 2, y, -0.31, L / 2, y + 0.09, -0.27));
  D.setColor('#3a3d40').cyl(L / 2 + 0.45, 0, -0.05, 0.22, 0.24, 0.8, 8).setColor('#2a2c2e').cyl(L / 2 + 0.45, 0.8, -0.05, 0.25, 0.25, 0.05, 8); // the bin at its end
  return D.build();
}

// ------------------------------------------------------------------------------------------------ site
export function buildSobornyi({ root, map, solids: S, heightAt, geo }) {
  if (!map?.roads) return null;
  const t0 = performance.now();
  const PARK = ringPts(SOBORNYI_PARK);
  const inPark = (x, z) => inPoly(PARK, x, z);
  const g = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 30; };
  const B = { white: new MB(), stone: new MB(), wall: new MB(), roof: new MB(), gold: new MB(), black: new MB(), bronze: new MB(), glow: new MB() };
  const keep = [];                                                // [x, z, r]: structures (no lamps, benches or trees)
  const footprints = [];
  // a frame at (x, z) facing (fx, fz): local +z forward, +x to its left as seen from the front
  const frame = (x, y, z, fx, fz) => M4(x, y, z, Math.atan2(fx, fz));
  const obox = (x, z, fx, fz, hx, hz, y0, y1, kind = 'wall') => S.obox(x, z, hx, hz, Math.atan2(-fx, fz), y0, y1, kind);
  const level = (pts) => pts.map(([x, z]) => g(x, z)).sort((p, q) => p - q)[pts.length >> 1];

  // the park's footways (OSM, through map.roads): paved ('p') and earth ('d'), cut to the park
  const paths = [];
  for (const rd of map.roads) {
    if (rd.k === 'm' || !/footway|path|pedestrian|steps|cycleway/.test(rd.c || 'footway')) continue;
    let cur = null;
    for (let i = 0; i < rd.p.length; i += 2) {
      const p = [rd.p[i], rd.p[i + 1]];
      if (inPark(...p)) { if (!cur) paths.push(cur = { k: rd.k, w: rd.w || 2.2, P: [] }); cur.P.push(p); } else cur = null;
    }
  }
  // every non-motor way near the park, whole (a lamp or bench keeps off these too, the ones that leave the park included)
  const PB = [Math.min(...PARK.map((q) => q[0])) - 10, Math.max(...PARK.map((q) => q[0])) + 10, Math.min(...PARK.map((q) => q[1])) - 10, Math.max(...PARK.map((q) => q[1])) + 10];
  const avoid = map.roads.filter((rd) => rd.k !== 'm' && ringPts(rd.p).some(([x, z]) => x > PB[0] && x < PB[1] && z > PB[2] && z < PB[3])).map((rd) => ({ w: rd.w || 2.2, P: ringPts(rd.p) }));
  const pathDist = (p) => { let d = Infinity; for (const q of avoid) for (let k = 1; k < q.P.length; k++) d = Math.min(d, segDist(p, q.P[k - 1], q.P[k]) - q.w / 2); return d; };

  // ---------------------------------------------------------------- the main entrance: two rotundas with pergola wings
  let nCols = 0;
  {
    const [dx, dz] = ALLEY.dir, px = dz, pz = -dx; // across the alley (its left as one walks in)
    let along = ROT.along[0];
    for (; along <= ROT.along[1]; along += 0.5) {
      const ok = [1, -1].every((s) => pathDist([ALLEY.a[0] + dx * along + s * px * ROT.side, ALLEY.a[1] + dz * along + s * pz * ROT.side]) > ROT.base + 0.3);
      if (ok) break;
    }
    const T1 = 3.2;                                   // the lower tier (and the wings' slab) height
    for (const s of [1, -1]) {
      const cx = ALLEY.a[0] + dx * along + s * px * ROT.side, cz = ALLEY.a[1] + dz * along + s * pz * ROT.side;
      const y = level([[cx - 2, cz - 2], [cx + 2, cz + 2], [cx, cz]]) + 0.05;
      const W = B.white.setColor('#ecebe6');
      W.cyl(cx, y - 0.4, cz, ROT.base, ROT.base, 0.7, 24).cyl(cx, y + 0.3, cz, ROT.base - 0.25, ROT.base - 0.25, 0.12, 24);
      // two tiers of eight columns: the lower ring carries a round slab, the upper ring stands on it under the crown
      const ring = (y0, h, r0) => { for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * PI * 2, x = cx + Math.cos(a) * ROT.r, z = cz + Math.sin(a) * ROT.r; W.cyl(x, y0, z, 0.2, 0.2, 0.15, 8).cyl(x, y0 + 0.15, z, r0, r0 * 0.88, h - 0.3, 10).box(x - 0.2, y0 + h - 0.15, z - 0.2, x + 0.2, y0 + h, z + 0.2); nCols++; } };
      ring(y + 0.42, T1 - 0.42, 0.17);
      W.setColor('#f1f0eb').cyl(cx, y + T1, cz, ROT.r + 0.6, ROT.r + 0.6, 0.32, 24);
      ring(y + T1 + 0.32, ROT.h - 0.6, 0.14);
      const yc = y + T1 + 0.32 + ROT.h - 0.6;
      W.setColor('#f1f0eb').lathe([[ROT.r + 0.5, yc], [ROT.r + 0.5, yc + 0.42], [ROT.r - 0.45, yc + 0.42], [ROT.r - 0.45, yc], [ROT.r + 0.5, yc]], 24, cx, cz);
      W.setColor('#e2e1db').cyl(cx, yc + 0.42, cz, ROT.r + 0.7, ROT.r + 0.65, 0.16, 24);
      S.cyl(cx, cz, y - 0.4, y + 0.3, ROT.base, ROT.base, 'ledge');
      for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * PI * 2; S.cyl(cx + Math.cos(a) * ROT.r, cz + Math.sin(a) * ROT.r, y, yc, 0.2, 0.2, 'pole'); }
      S.cyl(cx, cz, y + T1, y + T1 + 0.32, ROT.r + 0.6, ROT.r + 0.6, 'wall');
      S.cyl(cx, cz, yc, yc + 0.58, ROT.r + 0.7, ROT.r + 0.7, 'wall');
      keep.push([cx, cz, ROT.base + 2]);
      // the wings at the lower tier's height, out to both sides (short of the footways): two rows of columns under a slab
      for (const w of [1, -1]) {
        const ux = w * px, uz = w * pz;
        let n = 0;
        for (let t = ROT.base + 1.0; t <= ROT.base + ROT.wing; t += 2.2) { if (pathDist([cx + ux * t, cz + uz * t]) < 2.0 || !inPark(cx + ux * t, cz + uz * t)) break; n = t; }
        if (n <= 0) continue;
        const t0w = ROT.r + 0.3, len = n - t0w + 0.5, mx = cx + ux * (t0w + len / 2), mz = cz + uz * (t0w + len / 2);
        for (let t = ROT.base + 1.0; t <= n + 1e-6; t += 2.2) for (const o of [-0.95, 0.95]) {
          const x = cx + ux * t + dx * o, z = cz + uz * t + dz * o;
          W.setColor('#ecebe6').cyl(x, g(x, z) - 0.2, z, 0.15, 0.13, y + T1 - g(x, z) + 0.2, 8);
          S.cyl(x, z, g(x, z) - 0.2, y + T1, 0.15, 0.15, 'pole');
          nCols++;
        }
        W.setColor('#f1f0eb').with(frame(mx, y + T1, mz, ux, uz), (q) => q.box(-1.35, 0, -len / 2, 1.35, 0.3, len / 2));
        obox(mx, mz, ux, uz, 1.35, len / 2, y + T1, y + T1 + 0.3, 'awning');
        keep.push([mx, mz, len / 2 + 1.5]);
      }
    }
  }

  // ---------------------------------------------------------------- the Chornobyl memorial in the alley's middle strip
  {
    const [x, z] = CHORNOBYL, fx = -ALLEY.dir[0], fz = -ALLEY.dir[1]; // it faces the entrance
    const y = level([[x - 3, z - 3], [x + 3, z + 3], [x - 3, z + 3], [x + 3, z - 3]]) + 0.05;
    const m = frame(x, y, z, fx, fz);
    B.stone.setColor('#a39a92').with(m, (q) => q.box(-3, -0.4, -3, 3, 0.18, 3, 1 | 2 | 4 | 16 | 32));
    B.stone.setColor('#c76f63').with(m, (q) => q.box(-3, 0.18, 2.94, 3, 0.2, 3.06, 4)); // the red kerb
    B.stone.setColor('#7e4a42').with(m, (q) => {
      q.box(-1.2, 0.18, -0.65, 1.2, 0.95, 0.65).box(-1.05, 0.95, -0.55, 1.05, 1.15, 0.55);
      q.box(-0.6, 0.18, 0.65, 0.6, 0.42, 1.3); // the step in front
    });
    B.black.setColor('#151617').with(m, (q) => {
      q.box(-0.72, 1.15, -0.32, 0.72, 2.05, 0.32);
      for (const s of [-1, 1]) q.box(s * 0.82 - 0.06, 1.15, -0.06, s * 0.82 + 0.06, 4.3, 0.06);
      // the round head of the arch, in segments
      for (let k = 0; k < 10; k++) {
        const a0 = PI * k / 10, a1 = PI * (k + 1) / 10, p0 = [Math.cos(a0) * 0.82, 4.3 + Math.sin(a0) * 0.82], p1 = [Math.cos(a1) * 0.82, 4.3 + Math.sin(a1) * 0.82];
        q.tube([p0[0], p0[1], 0], [p1[0], p1[1], 0], 0.07, 5, true);
      }
      // two cranes over it, wings spread (flat), three spikes up
      for (const [cx, cy, sz] of [[0, 5.15, 1], [0.32, 4.75, 0.8]]) {
        q.box(cx - 0.05, cy - 0.5 * sz, -0.05, cx + 0.05, cy + 0.35 * sz, 0.05);
        for (const s of [-1, 1]) q.face([[cx, cy, 0.02], [cx + s * 0.95 * sz, cy + 0.12 * sz, 0.02], [cx + s * 0.75 * sz, cy - 0.2 * sz, 0.02], [cx + s * 0.2 * sz, cy - 0.1 * sz, 0.02]], [0, 0, 1]);
        for (const s of [-1, 1]) q.face([[cx, cy, -0.02], [cx + s * 0.95 * sz, cy + 0.12 * sz, -0.02], [cx + s * 0.75 * sz, cy - 0.2 * sz, -0.02], [cx + s * 0.2 * sz, cy - 0.1 * sz, -0.02]], [0, 0, -1]);
      }
      for (const sx of [-0.45, 0, 0.45]) q.tube([sx, 4.9, 0], [sx, 5.9 - Math.abs(sx), 0], 0.025, 4, true);
      // vines of kalyna up the posts
      for (const s of [-1, 1]) for (let k = 0; k < 5; k++) q.ellipsoid([s * 0.62, 2.4 + k * 0.45, 0.05], [0.13, 0.13, 0.03], 6, 3);
    });
    B.stone.setColor('#8f9294').with(m, (q) => q.box(-0.45, 2.3, -0.03, 0.45, 3.55, 0.03)); // the icon slab
    B.gold.setColor('#c9a352').with(m, (q) => q.box(-0.03, 3.55, -0.01, 0.03, 3.85, 0.01).box(-0.1, 3.72, -0.01, 0.1, 3.76, 0.01));
    obox(x, z, fx, fz, 1.2, 0.7, y, y + 2.1);
    obox(x, z, fx, fz, 0.9, 0.1, y + 2.1, y + 5.2, 'pole');
    keep.push([x, z, 4.5]);
    const tex = plaqueTex(['І мертвим, і живим, і ненародженим'], { bg: '#151617', fg: '#d6b85a', w: 1024, h: 128, font: 44 });
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.17), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    const [ox, oz] = [x + fx * 0.33, z + fz * 0.33];
    pm.position.set(ox, y + 1.38, oz); pm.rotation.y = Math.atan2(fx, fz); pm.name = 'sobornyi-chornobyl-words';
    B._extra = [pm];
  }

  // ---------------------------------------------------------------- «Зруйнованим храмам»: the chapel, the monk and his bell
  const hram = map.buildings?.find((b) => b.id === HRAM);
  if (hram) {
    const ring = ringPts(hram.p), [cx, cz] = centroid(ring), R = Math.max(...ring.map((p) => dist(p, [cx, cz]))) * 0.92;
    const y = Math.min(...ring.map(([x, z]) => g(x, z))) - 0.1, H = 3.6;
    B.wall.setColor('#e8d9b4');
    for (let k = 0; k < 8; k++) {
      const a0 = (k + 0.5) / 8 * PI * 2, a1 = (k + 1.5) / 8 * PI * 2, p0 = [cx + Math.cos(a0) * R, cz + Math.sin(a0) * R], p1 = [cx + Math.cos(a1) * R, cz + Math.sin(a1) * R];
      const nx = Math.cos((a0 + a1) / 2), nz = Math.sin((a0 + a1) / 2);
      B.wall.face([[p0[0], y, p0[1]], [p1[0], y, p1[1]], [p1[0], y + H, p1[1]], [p0[0], y + H, p0[1]]], [nx, 0, nz]);
      if (k % 2 === 0) { // an arched porch: a cream frame round a dark recess
        const m = frame(cx + nx * (R * Math.cos(PI / 8) + 0.02), y, cz + nz * (R * Math.cos(PI / 8) + 0.02), nx, nz);
        B.black.setColor('#3c352d').with(m, (q) => { q.box(-0.6, 0, -0.01, 0.6, 2.3, 0.01, 16); for (let j = 0; j < 6; j++) { const a = PI * j / 6, b = PI * (j + 1) / 6; q.face([[Math.cos(a) * 0.6, 2.3 + Math.sin(a) * 0.6, 0.012], [0, 2.3, 0.012], [Math.cos(b) * 0.6, 2.3 + Math.sin(b) * 0.6, 0.012]], [0, 0, 1]); } });
        B.wall.setColor('#f2e9cf').with(m, (q) => { for (let j = 0; j < 8; j++) { const a = PI * j / 8, b = PI * (j + 1) / 8; q.tube([Math.cos(a) * 0.72, 2.3 + Math.sin(a) * 0.72, 0.06], [Math.cos(b) * 0.72, 2.3 + Math.sin(b) * 0.72, 0.06], 0.1, 4, true); } q.box(-0.84, 0, -0.02, -0.62, 2.3, 0.14).box(0.62, 0, -0.02, 0.84, 2.3, 0.14); });
        B.wall.setColor('#e8d9b4');
      }
    }
    B.wall.setColor('#f2e9cf').cyl(cx, y + H - 0.2, cz, R + 0.15, R + 0.2, 0.35, 8);
    const prof = []; for (let k = 0; k <= 8; k++) { const a = k / 8 * PI / 2; prof.push([(R + 0.1) * Math.cos(a), y + H + 0.15 + (R * 0.75) * Math.sin(a)]); }
    B.roof.setColor('#8fb6cf').lathe(prof, 16, cx, cz);
    const yt = y + H + 0.15 + R * 0.75;
    B.wall.setColor('#e8d9b4').cyl(cx, yt - 0.1, cz, 0.55, 0.55, 0.9, 10);
    B.roof.setColor('#8fb6cf').lathe([[0.62, yt + 0.8], [0.55, yt + 1.05], [0.3, yt + 1.3], [0, yt + 1.4]], 10, cx, cz);
    B.gold.setColor('#d4ae4f').cyl(cx, yt + 1.35, cz, 0.04, 0.04, 1.0, 5, false).box(cx - 0.28, yt + 2.0, cz - 0.03, cx + 0.28, yt + 2.06, cz + 0.03);
    S.prism(ring.map((p) => p).flat(), y, y + H + 0.2, 0, 0, 'wall');
    footprints.push({ poly: ring, h: yt + 1.4 - y, kind: 'church', name: 'Каплиця «Зруйнованим храмам»' });
    keep.push([cx, cz, R + 1.5]);
    // the monk kneeling by the chapel's south side, a fallen bell by his right hand (photo: he reaches toward it)
    const [mx, mz] = MONK, fx = mx - cx, fz = mz - cz, fl = Math.hypot(fx, fz) || 1, ux = fx / fl, uz = fz / fl;
    const my = g(mx, mz) + 0.1, m = frame(mx, my, mz, ux, uz);
    B.stone.setColor('#b9b4aa').with(m, (q) => q.box(-1.3, -0.3, -0.8, 1.3, 0.12, 0.9));
    B.bronze.with(m.clone().multiply(new THREE.Matrix4().makeTranslation(0.25, 0.12, 0)).multiply(new THREE.Matrix4().makeScale(1.35, 1.35, 1.35)), (q) => {
      q.lathe([[0.48, 0], [0.5, 0.12], [0.42, 0.45], [0.33, 0.75], [0.26, 0.95], [0.2, 1.05], [0, 1.1]], 12, 0, 0, 1, 1.15); // the habit, kneeling
      q.ellipsoid([0, 0.85, -0.05], [0.28, 0.24, 0.24], 10, 6);             // the bowed shoulders
      q.ellipsoid([0, 1.12, 0.1], [0.13, 0.16, 0.14], 10, 7);              // the hooded head
      q.ellipsoid([0, 1.0, 0.2], [0.08, 0.12, 0.06], 8, 5);                // the beard
      q.tube([-0.25, 0.85, 0.05], [-0.42, 0.45, 0.35], 0.07, 6, true);       // the arm reaching down
      q.tube([0.25, 0.85, 0.05], [0.2, 0.55, 0.3], 0.07, 6, true);
    });
    B.bronze.with(m.clone().multiply(new THREE.Matrix4().makeTranslation(-0.75, 0.12 + 0.45, 0.5)).multiply(rotZ(PI / 2 - 0.25)).multiply(new THREE.Matrix4().makeScale(1.25, 1.25, 1.25)), (q) => {
      q.lathe([[0.4, -0.35], [0.36, -0.2], [0.26, 0.15], [0.22, 0.3], [0.12, 0.38], [0, 0.4]], 12);
    });
    obox(mx, mz, ux, uz, 1.3, 0.9, my - 0.3, my + 1.3, 'statue');
    keep.push([mx, mz, 2]);
  }

  // ---------------------------------------------------------------- the police memorial: a white crystal stele on steps
  {
    const [x, z] = POLICE;
    const fx = 0, fz = -1; // to the east path north of it
    const y = level([[x - 3.5, z - 2.5], [x + 3.5, z + 2.5], [x - 3.5, z + 2.5], [x + 3.5, z - 2.5]]) + 0.05;
    const m = frame(x, y, z, fx, fz);
    B.stone.setColor('#8a8781').with(m, (q) => q.box(-3.6, -0.4, -2.6, 3.6, 0.0, 2.6, 1 | 2 | 4 | 16 | 32).box(-3.1, 0, -2.1, 3.1, 0.18, 2.1, 1 | 2 | 4 | 16 | 32).box(-2.6, 0.18, -1.6, 2.6, 0.34, 1.6, 1 | 2 | 4 | 16 | 32));
    B.white.setColor('#e4e5e3').with(m, (q) => {
      // a long six-sided crystal standing on its point-cut foot, the top cut to a ridge
      const hex = (yy, s) => [0, 1, 2, 3, 4, 5].map((k) => { const a = k / 6 * PI * 2 + PI / 6; return [Math.cos(a) * 0.55 * s, yy, Math.sin(a) * 0.3 * s]; });
      const R0 = hex(0.34, 0.7), R1 = hex(0.9, 1), R2 = hex(2.9, 1), tip = [0, 3.7, 0];
      for (let k = 0; k < 6; k++) { const j = (k + 1) % 6; q.face([R0[k], R0[j], R1[j], R1[k]]); q.face([R1[k], R1[j], R2[j], R2[k]]); q.face([R2[k], R2[j], tip]); }
    });
    B.gold.setColor('#a8743c').with(m, (q) => { const pts = []; for (let k = 0; k < 10; k++) { const a = PI / 2 + k * PI / 5, rr = k % 2 ? 0.13 : 0.3; pts.push([Math.cos(a) * rr, 2.25 + Math.sin(a) * rr, 0.31]); } q.face(pts, [0, 0, 1]); });
    B.stone.setColor('#3f3d3b').with(m, (q) => q.box(1.2, 0.34, 0.2, 2.1, 1.25, 0.65));
    obox(x, z, fx, fz, 3.6, 2.6, y - 0.4, y + 0.34, 'ledge');
    S.cyl(x, z, y + 0.34, y + 3.7, 0.55, 0.2, 'statue');
    keep.push([x, z, 4.6]);
  }

  // ---------------------------------------------------------------- «Жертвам фашизму»: a rough grey stele between flower beds
  {
    const [x, z] = FASCISM, fx = 0, fz = -1, y = g(x, z) + 0.1, m = frame(x, y, z, fx, fz);
    B.stone.setColor('#4e504f').with(m, (q) => q.box(-1.6, -0.3, -1.1, 1.6, 0.08, 1.1, 1 | 2 | 4 | 16 | 32).box(-0.9, 0.08, -0.35, 0.9, 0.3, 0.35));
    B.stone.setColor('#7d807f').with(m, (q) => q.face([[-0.75, 0.3, 0.18], [0.75, 0.3, 0.18], [0.75, 2.15, 0.18], [0.3, 2.35, 0.18], [-0.75, 2.0, 0.18]], [0, 0, 1])
      .face([[-0.75, 0.3, -0.18], [-0.75, 2.0, -0.18], [0.3, 2.35, -0.18], [0.75, 2.15, -0.18], [0.75, 0.3, -0.18]], [0, 0, -1])
      .face([[-0.75, 0.3, -0.18], [-0.75, 0.3, 0.18], [-0.75, 2.0, 0.18], [-0.75, 2.0, -0.18]], [-1, 0, 0])
      .face([[0.75, 0.3, 0.18], [0.75, 0.3, -0.18], [0.75, 2.15, -0.18], [0.75, 2.15, 0.18]], [1, 0, 0])
      .face([[-0.75, 2.0, 0.18], [0.3, 2.35, 0.18], [0.3, 2.35, -0.18], [-0.75, 2.0, -0.18]]).face([[0.3, 2.35, 0.18], [0.75, 2.15, 0.18], [0.75, 2.15, -0.18], [0.3, 2.35, -0.18]]));
    for (const s of [-1, 1]) B.roof.setColor('#4c7a35').with(m, (q) => { for (let k = 0; k < 5; k++) q.ellipsoid([s * (1.1 + (k % 2) * 0.2), 0.15, -0.8 + k * 0.4], [0.32, 0.22, 0.3], 7, 4); });
    obox(x, z, fx, fz, 0.8, 0.25, y, y + 2.35, 'statue');
    keep.push([x, z, 2.5]);
  }

  // ---------------------------------------------------------------- the west plaza: the church of «Чорнобильський Спас» and the Holodomor cross
  const spas = map.buildings?.find((b) => b.id === SPAS);
  let plazaC = null, crossTop = 0;
  {
    const [x, z] = CROSS;
    if (spas) {
      const ring = ringPts(spas.p); plazaC = centroid(ring);
      const y = Math.min(...ring.map(([a, b]) => g(a, b))) + 0.05, H = 5.2;
      if (area2(ring) < 0) ring.reverse();
      B.wall.setColor('#f1efe9').extrude(ring, [], y - 0.4, y + H, { top: false });
      B.wall.setColor('#d9d6cd').extrude(ring, [], y - 0.4, y + 0.5, { top: false });
      // a cornice and a low green roof over the whole plan, the drum and the gilded onion dome in the middle
      B.roof.setColor('#4f7a52').extrude(ring, [], y + H, y + H + 0.25, { top: true });
      const [cx, cz] = plazaC;
      B.roof.setColor('#4f7a52').cyl(cx, y + H + 0.25, cz, 3.4, 1.8, 1.4, 12);
      B.wall.setColor('#f1efe9').cyl(cx, y + H + 1.5, cz, 1.6, 1.6, 2.2, 12);
      for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2; B.black.setColor('#2e3438').box(cx + Math.cos(a) * 1.61 - 0.18, y + H + 2.0, cz + Math.sin(a) * 1.61 - 0.18, cx + Math.cos(a) * 1.61 + 0.18, y + H + 3.2, cz + Math.sin(a) * 1.61 + 0.18); }
      const yd = y + H + 3.7;
      B.gold.setColor('#d8b14e').lathe([[1.75, yd], [2.05, yd + 0.55], [1.95, yd + 1.2], [1.3, yd + 1.85], [0.5, yd + 2.4], [0.12, yd + 2.75], [0, yd + 2.9]], 16, cx, cz);
      B.gold.cyl(cx, yd + 2.8, cz, 0.05, 0.05, 1.5, 5, false).box(cx - 0.42, yd + 3.85, cz - 0.04, cx + 0.42, yd + 3.93, cz + 0.04).box(cx - 0.25, yd + 3.55, cz - 0.04, cx + 0.25, yd + 3.6, cz + 0.04);
      // tall arched windows (dark panes) on each arm end, the door toward the cross
      const faces = ring.map((p, k) => [p, ring[(k + 1) % ring.length]]).filter(([a, b]) => dist(a, b) > 2.2);
      for (const [a, b] of faces) {
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, L = dist(a, b), ex = (b[0] - a[0]) / L, ez = (b[1] - a[1]) / L;
        let nx = ez, nz = -ex; if ((mx + nx * 0.5 - cx) ** 2 + (mz + nz * 0.5 - cz) ** 2 < (mx - cx) ** 2 + (mz - cz) ** 2) { nx = -nx; nz = -nz; }
        const door = (nx * (x - cx) + nz * (z - cz)) / Math.hypot(x - cx, z - cz) > 0.85;
        B.black.setColor(door ? '#5a3a24' : '#2f3a44').with(frame(mx + nx * 0.03, y, mz + nz * 0.03, nx, nz), (q) => {
          const w = door ? 0.8 : 0.45, y0 = door ? 0.5 : 2.0, y1 = door ? 2.8 : 3.9;
          q.box(-w, y0, -0.01, w, y1, 0.01, 16);
          q.face(Array.from({ length: 7 }, (_, j) => [Math.cos(PI * j / 6) * w, y1 + Math.sin(PI * j / 6) * w, 0.012]), [0, 0, 1]);
        });
      }
      S.prism(ring.flat(), y - 0.4, y + H + 0.25, 0, 0, 'wall');
      footprints.push({ poly: ring, h: yd + 3.9 - y, kind: 'church', name: spas.name });
      keep.push([cx, cz, 9]);
    }
    // the cross: grey granite, flared arms with an inner groove, on a big rough boulder and a low granite slab
    const fx = 0, fz = -1, y = g(x, z) + 0.15, m = frame(x, y, z, fx, fz);
    B.stone.setColor('#6d6b67').with(m, (q) => q.box(-1.9, -0.35, -1.3, 1.9, 0.18, 1.3, 1 | 2 | 4 | 16 | 32));
    {
      const rr = rng(2006), D = new MB();
      D.ellipsoid([0, 0.55, 0], [1.45, 0.75, 0.85], 14, 8);
      const geom = D.build(), P = geom.attributes.position;
      for (let i = 0; i < P.count; i++) { const k = 1 + (rr() - 0.5) * 0.12; P.setXYZ(i, P.getX(i) * k, Math.max(0, P.getY(i) * (1 + (rr() - 0.5) * 0.1)), P.getZ(i) * k); }
      const pos = P.array, idx = geom.index.array;
      B.stone.setColor('#8d8984').with(m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.1, 0)), (q) => {
        for (let t = 0; t < idx.length; t += 3) { const v = [0, 1, 2].map((j) => [pos[idx[t + j] * 3], pos[idx[t + j] * 3 + 1], pos[idx[t + j] * 3 + 2]]); q.face(v); }
      });
    }
    const yb = 1.35;
    B.white.setColor('#b9b7b1').with(m, (q) => {
      q.box(-0.3, yb, -0.18, 0.3, yb + 3.2, 0.18);              // the shaft
      q.box(-0.95, yb + 2.0, -0.18, 0.95, yb + 2.6, 0.18);      // the arms
    });
    B.stone.setColor('#8e8c86').with(m, (q) => q.box(-0.14, yb + 0.6, 0.18, 0.14, yb + 2.9, 0.2, 16).box(-0.75, yb + 2.17, 0.18, 0.75, yb + 2.43, 0.2, 16)); // the groove
    B.black.setColor('#2b2b2a').with(m, (q) => q.box(-0.6, 0.55, 0.88, 0.6, 1.0, 0.92, 16)); // the plaque on the boulder's face
    crossTop = y + yb + 3.2;
    obox(x, z, fx, fz, 1.5, 0.9, y - 0.35, y + yb);
    obox(x, z, fx, fz, 0.32, 0.2, y + yb, crossTop, 'statue');
    obox(x, z, fx, fz, 0.95, 0.2, y + yb + 2.0, y + yb + 2.6, 'statue');
    keep.push([x, z, 3]);
  }

  // ---------------------------------------------------------------- the plaza's paving: two discs, draped (world uv, so their overlap matches)
  const paveMeshes = [];
  if (plazaC) {
    const D = new MB(), disc = (c, R) => {
      const nr = Math.ceil(R / 2), ns = 36, idx = [];
      const id0 = D.vert(c[0], g(c[0], c[1]) + 0.24, c[1], 0, 1, 0, c[0] / 4, c[1] / 4);
      for (let i = 1; i <= nr; i++) { const row = []; for (let k = 0; k < ns; k++) { const a = k / ns * PI * 2, x = c[0] + Math.cos(a) * R * i / nr, z = c[1] + Math.sin(a) * R * i / nr; row.push(D.vert(x, g(x, z) + 0.24, z, 0, 1, 0, x / 4, z / 4)); } idx.push(row); }
      for (let k = 0; k < ns; k++) D.tri(id0, idx[0][(k + 1) % ns], idx[0][k]);
      for (let i = 1; i < nr; i++) for (let k = 0; k < ns; k++) { const j = (k + 1) % ns; D.tri(idx[i - 1][k], idx[i - 1][j], idx[i][j]).tri(idx[i - 1][k], idx[i][j], idx[i][k]); }
    };
    disc(plazaC, PLAZA_R); disc(CROSS, CROSS_R);
    const geom = D.build(); geom.computeVertexNormals();
    if (geom.attributes.normal.getY(0) < 0) { const I = geom.index.array; for (let t = 0; t < I.length; t += 3) [I[t + 1], I[t + 2]] = [I[t + 2], I[t + 1]]; geom.computeVertexNormals(); }
    paveMeshes.push(Object.assign(new THREE.Mesh(geom, decal(new THREE.MeshStandardMaterial({ map: slabTex(), color: 0xbab6ad, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -4 }))), { name: 'sobornyi-plaza', receiveShadow: true }));
  }
  const onPlaza = (x, z) => plazaC && (dist([x, z], plazaC) < PLAZA_R || dist([x, z], CROSS) < CROSS_R);

  // ---------------------------------------------------------------- lamps along the footways, benches along the paved ones
  const lamps = [], benches = [];
  {
    const cell = new Map(), key = (x, z) => `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
    const add = (x, z) => { const k = key(x, z); (cell.get(k) || cell.set(k, []).get(k)).push([x, z]); };
    const near = (x, z, d) => { const cx = Math.floor(x / 8), cz = Math.floor(z / 8); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const p of cell.get(`${cx + i},${cz + j}`) || []) if (dist(p, [x, z]) < d) return true; return false; };
    const blocked = (x, z, rr) => keep.some(([kx, kz, kr]) => dist([x, z], [kx, kz]) < kr + rr) || onPlaza(x, z) || !inPark(x, z);
    for (const q of paths) {
      const every = q.k === 'p' ? 22 : 38, off = q.w / 2 + 0.55;
      let next = every * 0.5, walked = 0, side = 1, bNext = 14;
      for (let k = 1; k < q.P.length; k++) {
        const a = q.P[k - 1], b = q.P[k], L = dist(a, b); if (L < 0.01) continue;
        const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
        for (; next < walked + L; next += every) {
          const t = next - walked, x = a[0] + ux * t - uz * off * side, z = a[1] + uz * t + ux * off * side;
          if (!blocked(x, z, 0.6) && !near(x, z, 9) && pathDist([x, z]) > 0.2) { lamps.push([x, z]); add(x, z); side = -side; }
        }
        if (q.k === 'p') for (; bNext < walked + L; bNext += 31) {
          const t = bNext - walked, s = -side, bo = q.w / 2 + 0.75, x = a[0] + ux * t - uz * bo * s, z = a[1] + uz * t + ux * bo * s;
          if (!blocked(x, z, 1.3) && !near(x, z, 2.5) && pathDist([x, z]) > 0.35) benches.push([x, z, uz * s, -ux * s]); // faces the path
        }
        walked += L;
      }
    }
    // the plaza round the church: lamps on its rim, benches facing in
    if (plazaC) for (let k = 0; k < 10; k++) {
      const a = (k + 0.5) / 10 * PI * 2, x = plazaC[0] + Math.cos(a) * (PLAZA_R - 0.8), z = plazaC[1] + Math.sin(a) * (PLAZA_R - 0.8);
      if (dist([x, z], CROSS) < CROSS_R + 1 || pathDist([x, z]) < 0.6) continue;
      if (k % 2) lamps.push([x, z]); else benches.push([x, z, -Math.cos(a), -Math.sin(a)]);
    }
  }
  const inst = [];
  {
    const [lg, gg] = lampGeo(), bg = benchGeo(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    const pole = new THREE.InstancedMesh(lg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 }), lamps.length);
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.3, emissive: 0xffe2b0, emissiveIntensity: 0 });
    const glow = new THREE.InstancedMesh(gg, glowMat, lamps.length);
    lamps.forEach(([x, z], i) => {
      // the arm reaches over the nearest footway
      let best = null, bd = Infinity;
      for (const p of paths) for (let k = 1; k < p.P.length; k++) { const d = segDist([x, z], p.P[k - 1], p.P[k]); if (d < bd) { bd = d; best = [p.P[k - 1], p.P[k]]; } }
      let yaw = 0;
      if (best) { const ab = sub(best[1], best[0]), L = Math.hypot(...ab) || 1, t = Math.max(0, Math.min(1, ((x - best[0][0]) * ab[0] + (z - best[0][1]) * ab[1]) / (L * L))); const cx = best[0][0] + ab[0] * t - x, cz = best[0][1] + ab[1] * t - z; yaw = Math.atan2(-cz, cx); }
      const y = g(x, z) + 0.1;
      m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, yaw), one);
      pole.setMatrixAt(i, m4); glow.setMatrixAt(i, m4);
      S.cyl(x, z, y - 0.2, y + 5.1, 0.12, 0.07, 'pole');
    });
    const bench = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), benches.length);
    benches.forEach(([x, z, fx, fz], i) => {
      const y = g(x, z) + 0.12;
      m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, Math.atan2(fx, fz)), one);
      bench.setMatrixAt(i, m4);
      obox(x, z, fx, fz, 0.95, 0.3, y, y + 0.5, 'bench');
    });
    for (const [mesh, name] of [[pole, 'lamps'], [glow, 'lamp-glow'], [bench, 'benches']]) {
      mesh.name = 'sobornyi-' + name; mesh.castShadow = name !== 'lamp-glow'; mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
      inst.push(mesh);
    }
    inst.glowMat = glowMat;
  }

  // ---------------------------------------------------------------- meshes
  const group = Object.assign(new THREE.Group(), { name: 'sobornyi' });
  root.add(group);
  const M = {
    white: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    stone: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    wall: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }),
    gold: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.9, emissive: 0x6a4a10, emissiveIntensity: 0 }),
    black: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide }),
    bronze: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.65 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x8fa0a8, emissive: 0xffd9a8, emissiveIntensity: 0 }),
  };
  const extra = B._extra || []; delete B._extra;
  let nV = 0;
  for (const [k, D] of Object.entries(B)) {
    if (!D.v) continue;
    nV += D.v;
    const geom = D.build();
    if (k === 'bronze') patina(geom);
    group.add(Object.assign(new THREE.Mesh(geom, M[k]), { name: 'sobornyi-' + k, castShadow: k !== 'glow', receiveShadow: true }));
  }
  for (const m of [...extra, ...paveMeshes, ...inst]) { group.add(m); nV += m.geometry.attributes.position.count; }
  console.log(`[cherkasy] Sobornyi park: ${paths.length} footway runs, ${lamps.length} lamps, ${benches.length} benches, ${nCols} columns, ${(nV / 1000).toFixed(1)}k verts, ${group.children.length} meshes in ${(performance.now() - t0).toFixed(0)} ms`);

  // generated trees keep off the structures, the plaza, the lamps and the benches
  const tcell = new Map(), tkey = (x, z) => `${Math.floor(x / 6)},${Math.floor(z / 6)}`;
  for (const [x, z] of lamps) { const k = tkey(x, z); (tcell.get(k) || tcell.set(k, []).get(k)).push([x, z, 1.3]); }
  for (const [x, z] of benches) { const k = tkey(x, z); (tcell.get(k) || tcell.set(k, []).get(k)).push([x, z, 1.8]); }
  const BB = [Math.min(...PARK.map((p) => p[0])) - 5, Math.max(...PARK.map((p) => p[0])) + 5, Math.min(...PARK.map((p) => p[1])) - 5, Math.max(...PARK.map((p) => p[1])) + 5];
  return {
    footprints,
    stats: { verts: nV, meshes: group.children.length, lamps: lamps.length, benches: benches.length, paths: paths.length, crossTop, plaza: plazaC, keep },
    clear: (x, z) => {
      if (x < BB[0] || x > BB[1] || z < BB[2] || z > BB[3]) return false;
      if (onPlaza(x, z) || keep.some(([kx, kz, kr]) => (x - kx) ** 2 + (z - kz) ** 2 < (kr + 1) ** 2)) return true;
      const cx = Math.floor(x / 6), cz = Math.floor(z / 6);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const [px, pz, pr] of tcell.get(`${cx + i},${cz + j}`) || []) if ((x - px) ** 2 + (z - pz) ** 2 < pr * pr) return true;
      return false;
    },
    update() {
      const k = nightK.value;
      inst.glowMat.emissiveIntensity = 2.2 * k;
      M.gold.emissiveIntensity = 0.25 * k;
    },
  };
}
