// OWNER: cherkasy. Specialised school No 17, вулиця Хрещатик, 218 (OSM way 104299469: the 1957 building and the later
// annexes in one footprint), rebuilt after the Wikimedia Commons photos (School17-1.JPG, School17-2.JPG, "Школа № 17,
// Черкаси", the panoramio view over the lawn) and the satellite view. The 1957 school is a U of four tall storeys in
// orange-red brick round a forecourt open to Khreshchatyk: a dark granite plinth, white three-light windows with
// transoms in plain reveals, pilaster strips, a string course under the top storey and a corbelled brick cornice under
// the red hipped roofs (the wings' roofs run into the main one), small arched dormers; in the middle the white
// tetrastyle portico on its steps with a flat entablature. Behind it the flat-roofed annexes in pale silicate brick:
// the long four-storey classroom block, the gym with its tall windows, the south-east block and the links.
//   SCHOOL17_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildSchool17({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// The footprint is square to the map axes (the forecourt opens to the north-east, +x), so the volumes are rectangles
// taken off the OSM ring; each face is laid in a blockkit.js frame and only where no other volume stands against it.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { ringPts, rng, bboxOf } from './geo.js';
import { edgeFace, at, quad, rect, fbox, wall, win, fsolid, openSpans, hipRoof, finish, UP } from './blockkit.js';

const OSM_ID = 104299469;
export const SCHOOL17_SKIP = new Set([OSM_ID]);

// the volumes [x0, z0, x1, z1] (read off the OSM ring) and their style
const OLD = { skin: 'brick', nf: 4, fh: 3.8, plinth: 1.0, winW: 1.95, winH: 2.4, sill: 0.95, sp: 3.3, roof: 'hip' };
const NEW = { skin: 'sil', nf: 4, fh: 3.3, plinth: 0.6, winW: 2.3, winH: 1.75, sill: 0.9, sp: 3.0, roof: 'flat' };
const PARTS = [
  { id: 'main', r: [125.8, 615.3, 136.7, 672.1], ...OLD },
  { id: 'wingNW', r: [136.7, 615.3, 151.4, 625.6], ...OLD, roofR: [131.25, 615.3, 151.4, 625.6] },
  { id: 'wingSE', r: [136.7, 662.1, 150.6, 672.1], ...OLD, roofR: [131.25, 662.1, 150.6, 672.1] },
  { id: 'link', r: [128.2, 672.1, 131.2, 689.9], ...NEW, nf: 2 },
  { id: 'east', r: [139.2, 680.9, 153.7, 711.2], ...NEW },
  { id: 'strip', r: [115.5, 689.9, 139.2, 694.3], ...NEW },
  { id: 'long', r: [48.4, 683.7, 115.5, 700.8], ...NEW },
  { id: 'gym', r: [87.4, 659.4, 109.7, 683.7], ...NEW, nf: 1, fh: 8.4, winW: 3.2, winH: 3.2, sill: 4.4, sp: 4.4 },
];
const PORT_Z = 643.85, PORT_X = 136.7; // the portico: the middle of the forecourt face
const BRICK = '#ffffff', PLINTH = '#3a2f2c', CORN = '#b0553d', PVC = '#f0efea', ROOF = '#b5452e', WHITE = '#eeebe3';
const GLASS = ['#6a7a86', '#75848e', '#62707a', '#808c93'], CURT = ['#cfc9ba', '#c2c9cb', '#d6cfbf'];

// ------------------------------------------------------------------------------------------------ textures
const shade = (c, k) => `rgb(${c.map((v) => Math.min(255, Math.round(v * k))).join(',')})`;
// orange-red brick in stretcher bond, lime mortar (2.0 x 1.95 m repeat: 8 bricks x 26 courses)
const brickTex = (r, base, mortar) => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = mortar; g.fillRect(0, 0, w, h);
  const bw = w / 8, bh = h / 26;
  for (let j = 0; j < 26; j++) for (let i = -1; i < 8; i++) {
    const u = r(), k = u < 0.1 ? 0.8 : u > 0.92 ? 1.12 : 0.93 + r() * 0.12;
    g.fillStyle = shade(base, k);
    g.fillRect(i * bw + (j & 1 ? bw / 2 : 0) + 1.5, j * bh + 1.5, bw - 3, bh - 3);
  }
  for (let q = 0; q < 1500; q++) { g.fillStyle = r() < 0.5 ? 'rgba(255,245,230,0.08)' : 'rgba(40,20,10,0.08)'; g.fillRect(r() * w, r() * h, 2 + r() * 3, 1 + r() * 2); }
});
// red painted standing-seam sheet, a seam every 0.5 m
const roofTex = () => canvasTex(128, 64, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, 0, 3, h); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 3, 0, 2, h); }
});

// ------------------------------------------------------------------------------------------------ build
export function buildSchool17({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((q) => q.id === OSM_ID);
  if (!b) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 99991), n0 = S.count ?? 0;
  const B = { brick: new MB(), sil: new MB(), det: new MB(), glass: new MB(), lit: new MB(), roof: new MB() };
  const D = B.det, BM = [2.0, 1.95];
  let nWin = 0;
  const inR = ([x0, z0, x1, z1]) => (x, z) => x > x0 && x < x1 && z > z0 && z < z1;
  // one floor level for the old U (its ground is nearly flat), each annex on its own ground
  const gOf = (R) => { const h = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => heightAt(R[0] + (R[2] - R[0]) * i / 2, R[1] + (R[3] - R[1]) * j / 2))); return [Math.min(...h), Math.max(...h)]; };
  const [uLo, uHi] = gOf([125.8, 615.3, 151.4, 672.1]);
  for (const P of PARTS) {
    const [lo, hi] = P.skin === 'brick' ? [uLo, uHi] : gOf(P.r);
    P.gBase = lo - 0.5; P.yF = hi + P.plinth; P.yTop = P.yF + P.nf * P.fh + (P.roof === 'hip' ? 0.7 : 0.9);
  }

  for (const P of PARTS) {
    const [x0, z0, x1, z1] = P.r, W = P.skin === 'brick' ? B.brick : B.sil, others = PARTS.filter((Q) => Q !== P && Q.yTop >= P.yTop - 0.5).map((Q) => inR(Q.r));
    const cs = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    for (let i = 0; i < 4; i++) {
      const f = edgeFace(cs[i], cs[(i + 1) % 4], inR(P.r));
      for (const [a, c] of openSpans(f, others)) {
        const span = { ...f, holes: [], L: c, s0: a };
        // windows: evenly over the span, per storey; the old school's forecourt face leaves the portico bay clear
        const n = Math.max(1, Math.floor((c - a - 1.2) / P.sp)), sp = (c - a) / n, fore = P.id === 'main' && f.nx > 0.9;
        const sP = fore ? (PORT_Z - f.az) / f.uz : 0;
        if (fore) for (const d of [-1.5, 1.5]) span.holes.push({ s0: sP + d - 0.9, s1: sP + d + 0.9, y0: P.yF, y1: P.yF + 3.0, door: '#6d4a2f', leaf: 2.3, frame: '#6d4a2f', glass: '#4b4536', lit: true, dep: 0.35, rev: '#c9b8a6' });
        for (let k = 0; k < P.nf; k++) for (let j = 0; j < n; j++) {
          const sc = a + sp * (j + 0.5), y0 = P.yF + k * P.fh + P.sill;
          if (c - a < P.winW + 0.8 || fore && k === 0 && Math.abs(sc - sP) < 3.2) continue;
          const lit = r() < 0.3;
          span.holes.push({ s0: sc - P.winW / 2, s1: sc + P.winW / 2, y0, y1: y0 + P.winH, dep: P.skin === 'brick' ? 0.3 : 0.18, frame: PVC,
            rev: P.skin === 'brick' ? '#c9b8a6' : '#cfccc4', glass: lit ? CURT[Math.floor(r() * CURT.length)] : GLASS[Math.floor(r() * GLASS.length)], lit,
            cols: P.winW > 2 ? 3 : 2, rows: 2, rowAt: [0.72], sill: P.skin === 'brick' ? '#9a9892' : '#b9b8b2' });
          nWin++;
        }
        // walls between the openings; wall() runs from s = 0, so the span's start is cut away as a hole
        span.holes.push({ s0: -1, s1: a, y0: -1e3, y1: 1e3 });
        const yW = P.yTop - (P.roof === 'hip' ? 0.7 : 0);
        W.setColor(BRICK); wall(W, span, P.yF, yW, P.skin === 'brick' ? BM : [2.4, 2.4]);
        for (const q of span.holes) if (q.frame) win(B, span, q);
        D.setColor(PLINTH); fbox(D, f, a, c, P.gBase, P.yF, 0, 0.06, 1 | 16);
        if (P.skin === 'brick') {
          // pilaster strips between window pairs, the string course under the top storey, the corbelled cornice
          W.setColor('#ecdcd2');
          for (let j = 0; j <= n; j += 2) { const s = a + sp * j; if (s > a + 0.2 && s < c - 0.2) fbox(W, f, s - 0.3, s + 0.3, P.yF, yW, 0, 0.08, 1 | 4 | 8, BM); }
          D.setColor(CORN); fbox(D, f, a, c, P.yF + (P.nf - 1) * P.fh - 0.25, P.yF + (P.nf - 1) * P.fh, 0, 0.12, 1 | 16 | 32);
          fbox(D, f, a - 0.3, c + 0.3, yW, yW + 0.35, 0, 0.3, 1 | 32 | 4 | 8);
          fbox(D, f, a - 0.55, c + 0.55, yW + 0.35, yW + 0.7, 0, 0.55, 1 | 32 | 4 | 8);
          D.setColor('#caa58f'); for (let s = a + 0.3; s < c - 0.2; s += 0.6) fbox(D, f, s - 0.1, s + 0.1, yW + 0.15, yW + 0.35, 0.3, 0.42, 1 | 4 | 8 | 32);
        } else {
          D.setColor('#9d9b95'); fbox(D, f, a - 0.05, c + 0.05, P.yTop - 0.05, P.yTop + 0.05, -0.3, 0.06, 1 | 16 | 4 | 8);
          const e0 = at(f, a, 0), e1 = at(f, c, 0);
          Z.edge(e0[0], e0[2], e1[0], e1[2], P.yTop, f.nx, f.nz);
        }
      }
    }
    // roofs: the old school's red hips, the annexes flat bitumen behind a parapet
    if (P.roof === 'hip') {
      const [a0, b0, a1, b1] = P.roofR ?? P.r, ov = 0.6;
      B.roof.setColor(ROOF); hipRoof(B.roof, [a0 - (P.roofR ? 0 : ov), b0 - ov, a1 + ov, b1 + ov], P.yTop - 0.05, 0.5, [1, 1]);
    } else {
      D.setColor('#56565a'); quad(D, [x0, P.yTop - 0.3, z0], [x1, P.yTop - 0.3, z0], [x1, P.yTop - 0.3, z1], [x0, P.yTop - 0.3, z1], UP);
    }
    S.prism([x0, z0, x1, z0, x1, z1, x0, z1], P.gBase, P.yTop, 0, 0, 'wall');
  }

  // ---- small arched dormers on the forecourt slope of the main roof
  const main = PARTS[0];
  for (let i = 0; i < 5; i++) {
    const z = PORT_Z + (i - 2) * 6, x = PORT_X - 1.0, y = main.yTop + 1.2, xf = x + 0.6;
    D.setColor('#9d4a34'); D.box(x - 0.6, main.yTop - 0.4, z - 0.55, xf, y, z + 0.55);
    D.setColor(WHITE); D.face([...Array(9).keys()].map((k) => [xf + 0.01, y + 0.55 * Math.sin(k * Math.PI / 8), z + 0.55 * Math.cos(k * Math.PI / 8)]), [1, 0, 0]);
    B.glass.setColor('#3d474e'); B.glass.box(xf, y - 0.55, z - 0.35, xf + 0.02, y + 0.3, z + 0.35);
  }

  // ---- the portico: four white columns on a stepped landing, a flat entablature with a dark top
  {
    const yP = main.yF, colH = 7.6, depth = 3.6, half = 5.2;
    const pf = edgeFace([PORT_X, PORT_Z + half], [PORT_X, PORT_Z - half], (x) => x < PORT_X);
    const sc = pf.L / 2;
    D.setColor('#8c8883'); fbox(D, pf, 0, pf.L, main.gBase, yP, 0, depth + 0.6, 1 | 4 | 8 | 16);
    fsolid(S, pf, 0, pf.L, 0, depth + 0.6, main.gBase, yP, 'steps');
    const nSt = Math.max(1, Math.round((yP - heightAt(PORT_X + depth + 2, PORT_Z)) / 0.17));
    for (let k = 0; k < nSt; k++) fbox(D, pf, sc - 3 - k * 0.2, sc + 3 + k * 0.2, main.gBase, yP - (k + 1) * (yP - main.gBase - 0.5) / (nSt + 1), 0, depth + 0.6 + 0.32 * (k + 1), 1 | 4 | 8 | 16);
    D.setColor(WHITE);
    for (const d of [-4.2, -1.4, 1.4, 4.2]) {
      const [x, , z] = at(pf, sc + d, 0, depth - 0.4);
      D.box(x - 0.6, yP, z - 0.6, x + 0.6, yP + 0.35, z + 0.6);                  // base
      D.cyl(x, yP + 0.35, z, 0.5, 0.44, colH - 0.75, 14, false);                   // shaft, slight taper
      D.box(x - 0.6, yP + colH - 0.4, z - 0.6, x + 0.6, yP + colH, z + 0.6);     // capital
      S.cyl(x, z, yP, yP + colH, 0.5, 0.5, 'pillar');
    }
    fbox(D, pf, 0, pf.L, yP + colH, yP + colH + 1.1, -0.1, depth + 0.2, 1 | 4 | 8 | 32);
    D.setColor('#5a3a30'); fbox(D, pf, -0.1, pf.L + 0.1, yP + colH + 1.1, yP + colH + 1.45, -0.1, depth + 0.3, 1 | 4 | 8 | 16 | 32);
    fsolid(S, pf, 0, pf.L, -0.1, depth + 0.3, yP + colH, yP + colH + 1.45, 'awning', 1);
    B.lit.setColor('#fff1d6'); for (const d of [-2, 2]) { const p = at(pf, sc + d, yP + colH - 0.02, depth / 2); B.lit.cyl(p[0], p[1] - 0.05, p[2], 0.25, 0.25, 0.05, 10); }
  }

  // ---- meshes
  const M = {
    brick: new THREE.MeshStandardMaterial({ map: brickTex(r, [206, 128, 98], '#d6c4b4'), vertexColors: true, roughness: 0.9 }),
    sil: new THREE.MeshStandardMaterial({ map: brickTex(r, [222, 222, 218], '#b4b3ae'), vertexColors: true, roughness: 0.9 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.35, envMapIntensity: 1.2 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffdcaa, emissiveIntensity: 0 }),
    roof: new THREE.MeshStandardMaterial({ map: roofTex(), vertexColors: true, roughness: 0.55, metalness: 0.3 }),
  };
  const st = finish(root, 'school17', B, M, ['brick', 'sil', 'det', 'roof']);
  console.log(`[cherkasy] School 17 (Khreshchatyk 218): ${PARTS.length} volumes, ${nWin} windows, floor ${main.yF.toFixed(1)} m, ${(st.tris / 1000).toFixed(1)}k tris, ${st.meshes} meshes, ${(st.verts / 1000).toFixed(1)}k verts, ${(S.count ?? 0) - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const bb = bboxOf(ringPts(b.p));
  return {
    footprints: [{ poly: ringPts(b.p), h: main.yTop + 4 - main.gBase, kind: b.k, name: 'Школа № 17' }],
    clear: (x, z) => x > bb.x0 - 3 && x < bb.x1 + 3 && z > bb.z0 - 3 && z < bb.z1 + 3 && PARTS.some((P) => x > P.r[0] - 3 && x < P.r[2] + 3 && z > P.r[1] - 3 && z < P.r[3] + 3),
    update() { M.lit.emissiveIntensity = 1.2 * nightK.value; },
  };
}
